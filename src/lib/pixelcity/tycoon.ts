// ============================================================
// tycoon.ts — 经营模式：经济 / 领地 / 任务 / 等级 / 存档
//   参照 SimCity（税收·电力）、Anno（人口·岗位）、Township（购地扩张）
//   挂载到 Engine.econ 后所有建造行为过经济门禁（扣费/等级/领地）
// ============================================================

import { defById, CATALOG } from './catalog';
import { CityMap, TERR_GRASS } from './map';

export const CHUNK = 16;                 // 领地块边长（格）
export const CHUNKS = 16;                // 256 / 16 = 16×16 块领地
export const ROAD_COST = 3;              // 每格道路
export const TREE_COST = 2;              // 每棵树
export const ROAD_REFUND = 1;            // 拆除每格道路返还
export const TREE_REFUND = 1;            // 拆除每棵树返还
export const REFUND_RATE = 0.5;          // 拆除建筑返还造价比例
export const TAX_PER_POP = 0.09;         // 税收 G/分/人
export const START_COINS = 380;
export const MAX_LEVEL = 12;
export const SAVE_KEY = 'pxc_tycoon_v1';
export const MODE_KEY = 'pxc_mode_v1';

// ------------------------------------------------------------
// 建筑经营参数表（v2 紧平衡：低起步 / 维护费 / 慢回本）
//   cost 建造价 / unlock 市政厅等级 / earn 满员满电收入 G·分
//   power 耗电 MW（负=发电）/ amenity 宜居点 / pollute 污染点
//   upk 维护费 G·分（每分钟固定支出；公共设施=运营开支，商业=人力租金，工业=设备折旧）
// ------------------------------------------------------------

export type EconDef = {
  cost: number; unlock: number; earn: number;
  power: number; amenity: number; pollute: number; upk: number;
};

const D = (
  cost: number, unlock: number,
  o: { earn?: number; power?: number; amenity?: number; pollute?: number; upk?: number } = {},
): EconDef => ({
  cost, unlock,
  earn: o.earn ?? 0, power: o.power ?? 0,
  amenity: o.amenity ?? 0, pollute: o.pollute ?? 0, upk: o.upk ?? 0,
});

export const ECON: Record<string, EconDef> = {
  // ---- 住宅（人口容量 = 目录 pop；无直接收入，无维护）----
  house: D(45, 1, { power: 2 }),
  townhouse: D(125, 2, { power: 4 }),
  apartment: D(290, 3, { power: 8 }),
  manor: D(225, 6, { power: 5 }),
  restower: D(1800, 8, { power: 30 }),
  machiya: D(100, 3, { power: 3 }),
  danchi: D(1450, 8, { power: 26 }),
  hiapart: D(2100, 9, { power: 34 }),
  nagaya: D(135, 6, { power: 4 }),
  minshuku: D(145, 6, { power: 3 }),
  // ---- 商业（岗位 = 目录 pop；earn 满员收入；upk 人力租金）----
  shop: D(80, 1, { power: 3, earn: 4.5, upk: 1 }),
  office: D(420, 4, { power: 10, earn: 22, upk: 4.8 }),
  tower: D(1700, 9, { power: 26, earn: 56, upk: 12.3 }),
  conv: D(70, 1, { power: 2, earn: 3.6, upk: 0.8 }),
  hotel: D(1350, 7, { power: 22, earn: 40, upk: 8.8 }),
  mall: D(1250, 7, { power: 24, earn: 44, upk: 9.7 }),
  parking: D(100, 4, { power: 1, earn: 0.8, upk: 0.2 }),
  izakaya: D(140, 4, { power: 3, earn: 6, upk: 1.3 }),
  cinema: D(780, 6, { power: 12, earn: 16, upk: 3.5 }),
  market: D(90, 2, { power: 2, earn: 3.8, upk: 0.85 }),
  electown: D(300, 6, { power: 5, earn: 8, upk: 1.8 }),
  ferris: D(550, 5, { power: 6, earn: 3, amenity: 2, upk: 1.4 }),
  bakery: D(80, 2, { power: 2, earn: 4.2, upk: 0.95 }),
  gas: D(170, 2, { power: 2, earn: 5, upk: 1.1 }),
  ferry: D(720, 5, { power: 6, earn: 9, upk: 2 }),
  // ---- 工业（污染；upk 设备折旧）----
  factory: D(620, 5, { power: 14, earn: 32, pollute: 4, upk: 5.8 }),
  warehouse: D(270, 6, { power: 6, earn: 8.5, pollute: 1, upk: 1.5 }),
  tankfarm: D(210, 5, { power: 5, earn: 7, pollute: 2, upk: 1.3 }),
  refinery: D(1050, 7, { power: 20, earn: 50, pollute: 6, upk: 9 }),
  power: D(620, 4, { power: -120, pollute: 5, upk: 3.5 }),
  lumber: D(230, 3, { power: 6, earn: 12, pollute: 2, upk: 2.2 }),
  silo: D(140, 4, { power: 3, earn: 6, pollute: 1, upk: 1.1 }),
  windmill: D(160, 3, { power: -15, earn: 2, upk: 0.3 }),
  greenhouse: D(170, 3, { power: 4, earn: 6.5, upk: 1.2 }),
  brewery: D(320, 4, { power: 8, earn: 10, pollute: 2, upk: 1.8 }),
  dock: D(560, 8, { power: 10, earn: 19, pollute: 3, upk: 3.4 }),
  // ---- 公共（宜居；upk 运营开支）----
  park: D(55, 1, { amenity: 2, upk: 0.8 }),
  plaza: D(85, 2, { power: 1, amenity: 3, upk: 1.2 }),
  school: D(460, 5, { power: 8, amenity: 5, upk: 2 }),
  hospital: D(720, 6, { power: 12, amenity: 6, upk: 2.4 }),
  temple: D(420, 6, { power: 2, amenity: 4, upk: 1.6 }),
  stadium: D(1800, 9, { power: 16, amenity: 5, upk: 2 }),
  radiotower: D(220, 5, { power: 4, amenity: 1, upk: 0.4 }),
  monument: D(110, 3, { amenity: 3, upk: 1.2 }),
  church: D(180, 4, { power: 1, amenity: 3, upk: 1.2 }),
  museum: D(550, 7, { power: 6, amenity: 4, upk: 1.6 }),
  firestation: D(240, 5, { power: 3, amenity: 3, upk: 1.2 }),
  lighthouse: D(140, 8, { power: 1, amenity: 1, upk: 0.4 }),
  castle: D(2200, 9, { power: 4, amenity: 3, upk: 1.2 }),
  busstop: D(50, 1, { amenity: 1, upk: 0.4 }),
  clocktower: D(150, 3, { power: 1, amenity: 2, upk: 0.8 }),
  observatory: D(620, 7, { power: 5, amenity: 3, upk: 1.2 }),
  torii: D(115, 5, { amenity: 2, upk: 0.8 }),
  pavilion: D(75, 2, { amenity: 2, upk: 0.8 }),
  aquarium: D(880, 8, { power: 10, amenity: 4, upk: 1.6 }),
  cellmast: D(120, 7, { power: 2, upk: 0.2 }),
  // ---- 市政厅（经营模式核心，不可直接建造）----
  cityhall: D(0, 99, { power: -40, amenity: 2 }),
};

export function costOf(id: string): number { return ECON[id]?.cost ?? 0; }
export function unlockOf(id: string): number { return ECON[id]?.unlock ?? 1; }

// ------------------------------------------------------------
// 等级
// ------------------------------------------------------------

export function xpNeed(level: number): number { return 100 + (level - 1) * 82; }

/** 升到 lv 时新解锁的建筑名（升级 toast 用） */
export function unlockNames(level: number): string[] {
  return CATALOG.filter(d => !d.hidden && ECON[d.id]?.unlock === level).map(d => d.name);
}

// ------------------------------------------------------------
// 任务链
// ------------------------------------------------------------

export type QS = {
  pop: number; cap: number; buildings: number; chunks: number;
  happiness: number; level: number;
  roads: number; trees: number; dozed: number;
  res: number; com: number; ind: number; civ: number; park: number;
  hasPower: number; hasSchool: number; hasHospital: number; hasTower: number;
};

export type Quest = {
  id: string; title: string; hint: string; goal: number;
  val: (s: QS) => number; rG: number; rXp: number;
};

export const QUESTS: Quest[] = [
  { id: 'road1', title: '要想富先修路', hint: '用道路工具铺设 5 格道路', goal: 5,
    val: s => s.roads, rG: 45, rXp: 25 },
  { id: 'res3', title: '安得广厦', hint: '建造 3 栋住宅（小型住宅即可）', goal: 3,
    val: s => s.res, rG: 60, rXp: 35 },
  { id: 'pop15', title: '第一批市民', hint: '人口达到 15 人（市民会逐渐迁入）', goal: 15,
    val: s => s.pop, rG: 75, rXp: 40 },
  { id: 'com2', title: '开张营业', hint: '建造 2 栋商业建筑（便利店 / 沿街商铺）', goal: 2,
    val: s => s.com, rG: 90, rXp: 50 },
  { id: 'park2', title: '绿化家园', hint: '建造 2 座街心公园', goal: 2,
    val: s => s.park, rG: 75, rXp: 45 },
  { id: 'doze1', title: '断舍离', hint: '用拆除工具（快捷键 9）拆掉 1 处设施 —— 可回收 50% 造价，道路/树木近全额回收', goal: 1,
    val: s => s.dozed, rG: 40, rXp: 25 },
  { id: 'pop60', title: '小镇初具', hint: '人口达到 60 人', goal: 60,
    val: s => s.pop, rG: 150, rXp: 75 },
  { id: 'power1', title: '电力命脉', hint: '建造火电厂（风车磨坊亦可发电）', goal: 1,
    val: s => s.hasPower, rG: 190, rXp: 90 },
  { id: 'ind1', title: '工业时代', hint: '建造 1 座工业建筑', goal: 1,
    val: s => s.ind, rG: 165, rXp: 85 },
  { id: 'b15', title: '初具规模', hint: '城市拥有 15 栋建筑', goal: 15,
    val: s => s.buildings, rG: 195, rXp: 100 },
  { id: 'land1', title: '开疆拓土', hint: '购买 1 块新领地（点击金色虚线框）', goal: 5,
    val: s => s.chunks, rG: 220, rXp: 110 },
  { id: 'pop250', title: '熙熙攘攘', hint: '人口达到 250 人', goal: 250,
    val: s => s.pop, rG: 300, rXp: 130 },
  { id: 'school1', title: '书香之城', hint: '建造一所学校', goal: 1,
    val: s => s.hasSchool, rG: 280, rXp: 125 },
  { id: 'hap70', title: '安居乐业', hint: '幸福度达到 70（多建公园与公共设施）', goal: 70,
    val: s => s.happiness, rG: 340, rXp: 140 },
  { id: 'hosp1', title: '仁心仁术', hint: '建造一座医院', goal: 1,
    val: s => s.hasHospital, rG: 370, rXp: 150 },
  { id: 'pop800', title: '城市脉搏', hint: '人口达到 800 人', goal: 800,
    val: s => s.pop, rG: 520, rXp: 200 },
  { id: 'tower1', title: '触摸天际', hint: '建造一座摩天大楼', goal: 1,
    val: s => s.hasTower, rG: 600, rXp: 230 },
  { id: 'land9', title: '纵横捭阖', hint: '领地达到 9 块', goal: 9,
    val: s => s.chunks, rG: 750, rXp: 260 },
  { id: 'pop2500', title: '都市之父', hint: '人口达到 2500 人 —— 终极成就！', goal: 2500,
    val: s => s.pop, rG: 1100, rXp: 330 },
];

// ------------------------------------------------------------
// UI 视图快照
// ------------------------------------------------------------

export type EconView = {
  coins: number; pop: number; cap: number; level: number; xp: number; xpMax: number;
  powerSup: number; powerDem: number; happiness: number;
  incomeTax: number; incomeCom: number; incomeInd: number; income: number;
  incomeUpk: number; incomeNet: number;
  jobs: number; workers: number; staffing: number;
  amenitySup: number; amenityNeed: number; pollute: number;
  chunks: number; buildings: number;
  questIdx: number; questTitle: string; questHint: string;
  questCur: number; questGoal: number; questRg: number; questRx: number;
  powerMult: number;
};

// ------------------------------------------------------------
// 经营引擎
// ------------------------------------------------------------

type Snap = QS & {
  jobs: number; earnCom: number; earnInd: number; upk: number;
  powerSup: number; powerDem: number;
  amenitySup: number; pollute: number;
  happyMult: number; staffing: number; powerMult: number;
};

export class Tycoon {
  coins = START_COINS;
  xp = 0;
  level = 1;
  pop = 0;
  questIdx = 0;
  roadsBuilt = 0;
  treesPlanted = 0;
  dozed = 0;
  hall: { x: number; y: number } = { x: 127, y: 127 };
  /** 16×16 领地掩码（1=已购） */
  own = new Uint8Array(CHUNKS * CHUNKS);

  msg: ((s: string) => void) | null = null;
  sfx: ((n: 'coin' | 'quest' | 'level' | 'buy') => void) | null = null;

  private snap: Snap | null = null;
  private incomeParts = { tax: 0, com: 0, ind: 0 };

  // ---------------- 领地 ----------------

  chunkOf(tx: number, ty: number): { cx: number; cy: number } {
    return { cx: tx >> 4, cy: ty >> 4 };
  }

  ownedAt(tx: number, ty: number): boolean {
    const { cx, cy } = this.chunkOf(tx, ty);
    return this.own[cy * CHUNKS + cx] === 1;
  }

  chunkOwned(cx: number, cy: number): boolean {
    return cx >= 0 && cy >= 0 && cx < CHUNKS && cy < CHUNKS && this.own[cy * CHUNKS + cx] === 1;
  }

  /** 与已购领地相邻（8 向）→ 可购买 */
  purchasable(cx: number, cy: number): boolean {
    if (this.chunkOwned(cx, cy)) return false;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (this.chunkOwned(cx + dx, cy + dy)) return true;
      }
    }
    return false;
  }

  /** 距市中心（4 块初始领地）的环距 */
  ringOf(cx: number, cy: number): number {
    return Math.max(Math.abs(cx - 7.5), Math.abs(cy - 7.5)) - 0.5;
  }

  priceOf(cx: number, cy: number): number {
    return Math.round(140 * Math.pow(1.62, this.ringOf(cx, cy)));
  }

  /** 点击购买领地 */
  buyChunk(cx: number, cy: number): 'ok' | 'adj' | 'coins' {
    if (!this.purchasable(cx, cy)) return 'adj';
    const price = this.priceOf(cx, cy);
    if (this.coins < price) return 'coins';
    this.coins -= price;
    this.own[cy * CHUNKS + cx] = 1;
    this.sfx?.('buy');
    this.msg?.(`购得新领地（−${price}G）：荒地已揭迷雾，尽情规划吧`);
    return 'ok';
  }

  // ---------------- 建造门禁 ----------------

  /** 建筑能否在此放置（经营规则：等级 / 领地 / 金币） */
  gateBuild(id: string, tx: number, ty: number): 'ok' | 'locked' | 'coins' | 'land' {
    const e = ECON[id];
    if (!e) return 'ok';
    if (e.unlock > this.level) return 'locked';
    const d = defById(id);
    for (let dy = 0; dy < d.h; dy++) {
      for (let dx = 0; dx < d.w; dx++) {
        if (!this.ownedAt(tx + dx, ty + dy)) return 'land';
      }
    }
    if (this.coins < e.cost) return 'coins';
    return 'ok';
  }

  /** 放置成功后扣费 + 经验 */
  payBuild(id: string): void {
    const e = ECON[id];
    if (!e) return;
    const d = defById(id);
    this.coins -= e.cost;
    this.addXp(Math.round(d.w * d.h * 6 + e.cost / 20));
  }

  refundBuild(id: string): number {
    const e = ECON[id];
    if (!e || e.cost <= 0) return 0;
    const back = Math.round(e.cost * REFUND_RATE);
    this.coins += back;
    return back;
  }

  refundRoad(): number {
    this.coins += ROAD_REFUND;
    return ROAD_REFUND;
  }

  refundTree(): number {
    this.coins += TREE_REFUND;
    return TREE_REFUND;
  }

  addXp(n: number): void {
    this.xp += n;
    while (this.level < MAX_LEVEL && this.xp >= xpNeed(this.level)) {
      this.xp -= xpNeed(this.level);
      this.level++;
      const bonus = this.level * 40;
      this.coins += bonus;
      const un = unlockNames(this.level);
      this.sfx?.('level');
      this.msg?.(`市政厅升到 LV${this.level}！奖励 ${bonus}G` +
        (un.length ? `，解锁：${un.slice(0, 4).join('、')}${un.length > 4 ? ' 等' : ''}` : ''));
    }
  }

  // ---------------- 状态快照（经济参数由地图实时推导） ----------------

  private snapOf(map: CityMap): Snap {
    let cap = 0, jobs = 0, earnCom = 0, earnInd = 0, upk = 0;
    let powerSup = 0, powerDem = 0, amenitySup = 0, pollute = 0;
    let res = 0, com = 0, ind = 0, civ = 0, park = 0, buildings = 0;
    let hasPower = 0, hasSchool = 0, hasHospital = 0, hasTower = 0;
    for (const o of map.objs.values()) {
      const d = defById(o.id);
      const e = ECON[o.id];
      buildings++;
      if (d.cat === 'res') { res++; cap += d.pop; }
      else if (d.cat === 'com') {
        com++; jobs += d.pop; earnCom += e?.earn ?? 0;
        if (o.id === 'ferris') park++;
      } else if (d.cat === 'ind') {
        ind++; jobs += d.pop; earnInd += e?.earn ?? 0;
        if (o.id === 'power' || o.id === 'windmill') hasPower = 1;
      } else {
        civ++;
        if (o.id === 'park') park++;
        if (o.id === 'school') hasSchool = 1;
        if (o.id === 'hospital') hasHospital = 1;
      }
      if (o.id === 'tower') hasTower = 1;
      const pw = e?.power ?? 0;
      if (pw < 0) powerSup += -pw; else powerDem += pw;
      amenitySup += e?.amenity ?? 0;
      pollute += e?.pollute ?? 0;
      upk += e?.upk ?? 0;
    }
    const pop = this.pop;
    const amenityNeed = Math.ceil(pop / 18);
    const polluteNet = Math.max(0, pollute - park * 1.5);
    const happiness = Math.max(5, Math.min(100,
      Math.round(52 + 4 * (amenitySup - amenityNeed) - 2.8 * polluteNet)));
    const workers = pop * 0.62;
    const staffing = jobs > 0 ? Math.min(1, workers / jobs) : 1;
    const powerMult = powerDem > 0 ? Math.min(1, powerSup / powerDem) : 1;
    const happyMult = 0.6 + happiness / 125;
    let chunks = 0;
    for (let i = 0; i < this.own.length; i++) chunks += this.own[i];
    return {
      pop, cap, buildings, chunks, happiness, level: this.level,
      roads: this.roadsBuilt, trees: this.treesPlanted, dozed: this.dozed,
      res, com, ind, civ, park, hasPower, hasSchool, hasHospital, hasTower,
      jobs, earnCom, earnInd, upk, powerSup, powerDem, amenitySup, pollute,
      happyMult, staffing, powerMult,
    };
  }

  // ---------------- 每帧心跳 ----------------

  tick(dt: number, map: CityMap): void {
    const s = this.snapOf(map);
    this.snap = s;

    // 收入 − 维护（G/分 → 按秒累积；可能为负 = 赤字，需拆除减负）
    const tax = this.pop * TAX_PER_POP * s.happyMult * s.powerMult;
    const com = s.earnCom * s.staffing * s.powerMult;
    const ind = s.earnInd * s.staffing * s.powerMult;
    this.coins += (tax + com + ind - s.upk) * dt / 60;
    this.incomeParts = { tax, com, ind };

    // 人口迁移：幸福度低会搬离；不足容量时渐进迁入（初期节奏放缓）
    if (this.pop < s.cap) {
      if (s.happiness < 25) {
        this.pop = Math.max(0, this.pop - 0.3 * dt);
      } else {
        const rate = 0.0045 + 0.006 * (s.happiness / 100);
        this.pop = Math.min(s.cap, this.pop + Math.max(0.05, (s.cap - this.pop) * rate) * dt);
      }
    } else if (this.pop > s.cap) {
      this.pop = Math.max(s.cap, this.pop - Math.max(0.5, (this.pop - s.cap) * 0.08) * dt);
    }

    // 任务链
    while (this.questIdx < QUESTS.length) {
      const q = QUESTS[this.questIdx];
      if (q.val(s) >= q.goal) {
        this.coins += q.rG;
        this.addXp(q.rXp);
        this.questIdx++;
        this.sfx?.('quest');
        this.msg?.(`任务完成「${q.title}」：+${q.rG}G · +${q.rXp}XP`);
      } else break;
    }
  }

  /** UI 视图（未 tick 前用缓存） */
  view(): EconView {
    const s = this.snap;
    const done = this.questIdx >= QUESTS.length;
    const q = QUESTS[Math.min(this.questIdx, QUESTS.length - 1)];
    const qcur = done || !s ? (done ? q.goal : 0) : Math.min(q.goal, q.val(s));
    return {
      coins: Math.floor(this.coins), pop: Math.floor(this.pop), cap: s?.cap ?? 0,
      level: this.level, xp: this.xp, xpMax: xpNeed(this.level),
      powerSup: s?.powerSup ?? 0, powerDem: s?.powerDem ?? 0,
      happiness: s?.happiness ?? 52,
      incomeTax: this.incomeParts.tax,
      incomeCom: this.incomeParts.com,
      incomeInd: this.incomeParts.ind,
      income: this.incomeParts.tax + this.incomeParts.com + this.incomeParts.ind,
      incomeUpk: s?.upk ?? 0,
      incomeNet: this.incomeParts.tax + this.incomeParts.com + this.incomeParts.ind - (s?.upk ?? 0),
      jobs: s?.jobs ?? 0,
      workers: Math.floor(this.pop * 0.62),
      staffing: s?.staffing ?? 1,
      amenitySup: s?.amenitySup ?? 0, amenityNeed: s ? Math.ceil(this.pop / 18) : 0,
      pollute: s?.pollute ?? 0,
      chunks: s?.chunks ?? 4, buildings: s?.buildings ?? 0,
      questIdx: this.questIdx,
      questTitle: done ? '全部任务完成 —— 都市之父！' : q.title,
      questHint: done ? '自由经营，打造你的像素都市' : q.hint,
      questCur: qcur, questGoal: done ? q.goal : q.goal,
      questRg: done ? 0 : q.rG, questRx: done ? 0 : q.rXp,
      powerMult: s?.powerMult ?? 1,
    };
  }

  /** 任务进度（UI 进度条用；需要地图推导的量走快照） */
  questProgress(map: CityMap): { cur: number; goal: number } {
    const q = QUESTS[Math.min(this.questIdx, QUESTS.length - 1)];
    if (this.questIdx >= QUESTS.length) return { cur: 1, goal: 1 };
    const s = this.snap ?? this.snapOf(map);
    return { cur: Math.min(q.goal, q.val(s)), goal: q.goal };
  }

  // ---------------- 开局 / 存档 ----------------

  /** 新游戏：随机地图 + 中央 4 块领地整平 + 市政厅 */
  newGame(map: CityMap): void {
    map.random((Math.random() * 1e9) | 0);
    map.beginUpdate();
    // 初始 4 块领地（格 112..143）整平为荒地草地
    for (let ty = 112; ty < 144; ty++) {
      for (let tx = 112; tx < 144; tx++) {
        const i = map.idx(tx, ty);
        map.terr[i] = TERR_GRASS;
        map.tree[i] = -1;
        map.road[i] = 0;
      }
    }
    map.place('cityhall', 0, 127, 127, 1);
    map.endUpdate();
    this.coins = START_COINS;
    this.xp = 0;
    this.level = 1;
    this.pop = 0;
    this.questIdx = 0;
    this.roadsBuilt = 0;
    this.treesPlanted = 0;
    this.dozed = 0;
    this.hall = { x: 127, y: 127 };
    this.own.fill(0);
    this.own[7 * CHUNKS + 7] = 1;
    this.own[7 * CHUNKS + 8] = 1;
    this.own[8 * CHUNKS + 7] = 1;
    this.own[8 * CHUNKS + 8] = 1;
    this.snap = null;
    this.save(map);
  }

  serialize(map: CityMap): string {
    const own: number[] = [];
    for (let i = 0; i < this.own.length; i++) if (this.own[i]) own.push(i);
    return JSON.stringify({
      v: 2,
      coins: Math.round(this.coins), xp: this.xp, level: this.level,
      pop: this.pop, questIdx: this.questIdx,
      roads: this.roadsBuilt, trees: this.treesPlanted, dozed: this.dozed,
      hall: [this.hall.x, this.hall.y],
      own, last: Date.now(),
      map: map.serialize(),
    });
  }

  save(map: CityMap): void {
    try { localStorage.setItem(SAVE_KEY, this.serialize(map)); } catch { /* 满 */ }
  }

  static loadRaw(): { hall: [number, number]; own: number[]; map: string; [k: string]: unknown } | null {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      return raw ? JSON.parse(raw) as { hall: [number, number]; own: number[]; map: string; [k: string]: unknown } : null;
    } catch { return null; }
  }

  /** 恢复存档到引擎；返回离线收益（G，0=无） */
  resume(map: CityMap, d: Record<string, unknown>): number {
    map.beginUpdate();
    const ok = map.deserialize(typeof d.map === 'string' ? d.map : '');
    map.endUpdate();
    if (!ok) { this.newGame(map); return 0; }
    this.coins = Number(d.coins) || 0;
    this.xp = Number(d.xp) || 0;
    this.level = Math.max(1, Math.min(MAX_LEVEL, Number(d.level) || 1));
    this.pop = Number(d.pop) || 0;
    this.questIdx = Math.max(0, Math.min(QUESTS.length, Number(d.questIdx) || 0));
    this.roadsBuilt = Number(d.roads) || 0;
    this.treesPlanted = Number(d.trees) || 0;
    this.dozed = Number(d.dozed) || 0;
    const hall = d.hall as [number, number] | undefined;
    this.hall = { x: hall?.[0] ?? 127, y: hall?.[1] ?? 127 };
    this.own.fill(0);
    for (const i of (d.own as number[]) ?? []) {
      if (i >= 0 && i < this.own.length) this.own[i] = 1;
    }
    if (!this.own.some(v => v)) {   // 掩码损坏：回退初始 4 块
      this.own[7 * CHUNKS + 7] = 1;
      this.own[7 * CHUNKS + 8] = 1;
      this.own[8 * CHUNKS + 7] = 1;
      this.own[8 * CHUNKS + 8] = 1;
    }
    this.snap = null;
    // 离线收益：上限 4 小时，35% 速度（扣除维护费后净收益，不为负）
    const last = Number(d.last) || Date.now();
    const mins = Math.min(4 * 60, Math.max(0, (Date.now() - last) / 60000));
    const s = this.snapOf(map);
    const perMin = this.pop * TAX_PER_POP * s.happyMult * s.powerMult +
      (s.earnCom + s.earnInd) * s.staffing * s.powerMult - s.upk;
    const earned = Math.floor(Math.max(0, perMin) * mins * 0.35);
    if (earned > 0) this.coins += earned;
    this.save(map);
    return earned;
  }

  /** 视野定位到市政厅 */
  hallCenter(): { x: number; y: number } {
    return { x: this.hall.x + 1, y: this.hall.y + 1 };
  }
}

/** 金币显示：1234 → 1.2k；12345 → 1.2万 */
export function fmtG(n: number): string {
  if (n >= 1e8) return `${(n / 1e8).toFixed(1)}亿`;
  if (n >= 1e4) return `${(n / 1e4).toFixed(1)}万`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return `${Math.floor(n)}`;
}
