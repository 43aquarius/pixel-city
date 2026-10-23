// ============================================================
// chronicle.ts — v17 城市编年史：这座城市的编年体史书
//   开埠奠基 → 时代跃迁（拓荒营地/炊烟村庄/市井小镇/一方城市/摩登都会）
//   灾祸喜讯 → 火疫风暴、牛市艺术节等城市事件与应急救险
//   文治武功 → 科技研究、节庆盛典、市政法令
//   里程碑   → 人口/评级/建筑/领地/府库的阶段性跨越
//   本模块不依赖 tycoon（上下文由外部传入，避免循环引用）
// ============================================================

/** 在册纪事上限（滑窗：新推旧挤，最早的会被挤出去） */
export const CHRON_MAX = 140;

/** 纪事分类（筛选器用） */
export type ChronCat = 'era' | 'event' | 'tech' | 'fest' | 'ord' | 'mile';

/** 纪事色调：good 喜 / bad 忧 / big 大事记（纪元级）/ info 日常政务 */
export type ChronTone = 'good' | 'bad' | 'big' | 'info';

export type ChronEntry = {
  id: number;        // 自增序号（滑窗内排序依据）
  day: number;       // 游戏日（开埠第 N 天）
  cat: ChronCat;
  tone: ChronTone;
  icon: string;      // 图标名（icons.ts）
  title: string;     // 四字标题
  text: string;      // 纪事正文（一至两句）
};

// ------------------------------------------------------------
// 五纪元（按人口晋升；编年史的「卷」）
// ------------------------------------------------------------

export const ERAS: Array<{ name: string; pop: number; text: string }> = [
  { name: '拓荒营地', pop: 0, text: '' },
  { name: '炊烟村庄', pop: 50,
    text: '第一批定居者在市政厅四周安家落户，荒原上升起连绵炊烟 —— 旅人们开始把这里叫作「村庄」。' },
  { name: '市井小镇', pop: 150,
    text: '街道纵横、商铺开张，赶集的人流出现在十字街口 —— 村庄长大了，成了小镇。' },
  { name: '一方城市', pop: 400,
    text: '夜幕降临时，千窗灯火连成星河。地图之上，这里终于有了一座真正的城市。' },
  { name: '摩登都会', pop: 1000,
    text: '高楼刺破天际线，电车叮当作响，港口汽笛长鸣 —— 这是一座都会的气象。' },
];

/** 人口 → 纪元序号（0..4） */
export function eraOfPop(pop: number): number {
  let e = 0;
  for (let i = ERAS.length - 1; i >= 0; i--) {
    if (pop >= ERAS[i].pop) { e = i; break; }
  }
  return e;
}

// ------------------------------------------------------------
// 里程碑定义（一次性入册，去重集合随档保存）
// ------------------------------------------------------------

type MileDef = { v: number; title: string; text: string; icon: string };

const POP_MILES: MileDef[] = [
  { v: 100, title: '百户灯火', icon: 'people',
    text: '常住人口突破 100。入夜后，住宅区的窗口一盏盏亮起，像撒在地面上的星子。' },
  { v: 500, title: '五百人家', icon: 'people',
    text: '人口突破 500。街巷里开始有了早晚高峰，邻里之间有了新的闲话。' },
  { v: 1000, title: '千人之城', icon: 'people',
    text: '人口突破 1000。这座城的名字，开始出现在远方商队的地图上。' },
  { v: 2000, title: '人潮汹涌', icon: 'people',
    text: '人口突破 2000。城市还在生长，故事仍在继续。' },
];

const RATE_MILES: MileDef[] = [
  { v: 70, title: '金字招牌', icon: 'medal',
    text: '城市评级首次升至 B —— 口碑渐起，旅人愿意绕道来此歇脚。' },
  { v: 80, title: '誉满一方', icon: 'medal',
    text: '城市评级首次升至 A —— 远近闻名的安居之地，迁入申请排起了长队。' },
  { v: 90, title: '都市传奇', icon: 'medal',
    text: '城市评级首次升至 S —— 教科书般的城市范本，别处的市长专程来考察。' },
];

const BLD_MILES: MileDef[] = [
  { v: 50, title: '添砖加瓦', icon: 'flag',
    text: '城中建筑已达 50 栋，天际线初具轮廓。' },
  { v: 150, title: '广厦渐起', icon: 'flag',
    text: '建筑增至 150 栋。老住户开始念叨：这里半年前还是一片荒地。' },
  { v: 300, title: '摩天丛林', icon: 'flag',
    text: '建筑增至 300 栋。从市政厅顶楼望去，屋脊连绵直到天边。' },
];

const LAND_MILES: MileDef[] = [
  { v: 6, title: '开疆拓土', icon: 'land',
    text: '领地扩至 6 块 —— 城市的边界，又一次向荒野推开。' },
  { v: 9, title: '纵横捭阖', icon: 'land',
    text: '领地达 9 块。摊开的地图，快要画不下这座城了。' },
];

const COIN_MILES: MileDef[] = [
  { v: 10000, title: '府库充盈', icon: 'coin',
    text: '库存金币突破一万。财政官合上账本，难得地笑了。' },
];

/** 城市事件 → 编年史图标 */
export const EV_ICON: Record<string, string> = {
  fire: 'fire', plague: 'heart', blackout: 'bolt', storm: 'cloud', scandal: 'coin',
  boom: 'people', harvest: 'wheat', expo: 'flask', festival: 'fest', invest: 'coin',
  tourseason: 'people', badreview: 'star', bullmkt: 'coin', tradewar: 'box',
  quake: 'land', flood: 'drop',   // v18 灾害链
};

// ------------------------------------------------------------
// 视图
// ------------------------------------------------------------

export type ChronView = {
  era: number;           // 当前纪元（含降级；展示用）
  eraName: string;
  day: number;           // 开埠第 N 天
  n: number;             // 在册条数（滑窗）
  total: number;         // 累计写入笔数（成就用，不随滑窗减少）
  entries: ChronEntry[]; // 旧 → 新
};

// ------------------------------------------------------------
// 编年史主体
// ------------------------------------------------------------

export class Chronicle {
  entries: ChronEntry[] = [];
  /** 累计写入笔数（滑窗挤出的也计数） */
  total = 0;
  /** 当前纪元 */
  era = 0;
  /** 历史最高纪元（成就用；人口回落不降） */
  maxEra = 0;
  private nextId = 1;
  /** 已入册里程碑（去重） */
  private miles = {
    pop: new Set<number>(), rate: new Set<number>(), bld: new Set<number>(),
    land: new Set<number>(), coin: new Set<number>(), eco: new Set<number>(),   // v19 生态（1 雾霾围城 / 2 重现蓝天）
  };

  /** 游戏小时 → 开埠第 N 天 */
  static dayOf(gHours: number): number { return Math.floor(gHours / 24) + 1; }

  /** 追加一笔纪事（滑窗：超过 CHRON_MAX 挤掉最早） */
  write(cat: ChronCat, tone: ChronTone, icon: string, title: string, text: string, gHours: number): void {
    this.entries.push({
      id: this.nextId++, day: Chronicle.dayOf(gHours), cat, tone, icon, title, text,
    });
    if (this.entries.length > CHRON_MAX) {
      this.entries.splice(0, this.entries.length - CHRON_MAX);
    }
    this.total++;
  }

  /**
   * 里程碑巡检（tycoon.tick 每帧调用）。
   * 返回本次新跃迁的纪元序号（无跃迁 = -1）——调用方借此提示与奏乐。
   */
  survey(ctx: { pop: number; rating: number; buildings: number; chunks: number; coins: number;
      smogRes?: number; envIdx?: number; ecotowers?: number }, gHours: number): number {
    let eraUp = -1;
    // 纪元跃迁（只升不重记；人口回落后再升回不重复入册）
    const e = eraOfPop(ctx.pop);
    if (e > this.era) {
      this.era = e;
      eraUp = e;
    } else if (e < this.era) {
      this.era = e;   // 回落仅降当前值，不动 maxEra
    }
    if (this.era > this.maxEra) {
      this.maxEra = this.era;
      if (eraUp >= 0) {
        this.write('era', 'big', 'city', `迈入「${ERAS[eraUp].name}」`, ERAS[eraUp].text, gHours);
      }
    }
    // 人口 / 评级 / 建筑 / 领地 / 府库 里程碑
    for (const m of POP_MILES) {
      if (ctx.pop >= m.v && !this.miles.pop.has(m.v)) {
        this.miles.pop.add(m.v);
        this.write('mile', 'good', m.icon, m.title, m.text, gHours);
      }
    }
    for (const m of RATE_MILES) {
      // 评级里程碑需真实城市规模（≥30 人）：空城的高分不构成「口碑」
      if (ctx.pop >= 30 && ctx.rating >= m.v && !this.miles.rate.has(m.v)) {
        this.miles.rate.add(m.v);
        this.write('mile', 'good', m.icon, m.title, m.text, gHours);
      }
    }
    for (const m of BLD_MILES) {
      if (ctx.buildings >= m.v && !this.miles.bld.has(m.v)) {
        this.miles.bld.add(m.v);
        this.write('mile', 'info', m.icon, m.title, m.text, gHours);
      }
    }
    for (const m of LAND_MILES) {
      if (ctx.chunks >= m.v && !this.miles.land.has(m.v)) {
        this.miles.land.add(m.v);
        this.write('mile', 'info', m.icon, m.title, m.text, gHours);
      }
    }
    for (const m of COIN_MILES) {
      if (ctx.coins >= m.v && !this.miles.coin.has(m.v)) {
        this.miles.coin.add(m.v);
        this.write('mile', 'good', m.icon, m.title, m.text, gHours);
      }
    }
    // ---- v19 生态里程碑：雾霾围城 → 重现蓝天（一对救赎叙事；先污染后治理才成对入册）----
    const smogRes = ctx.smogRes ?? 0, envIdx = ctx.envIdx ?? 100, ecotowers = ctx.ecotowers ?? 0;
    if (smogRes >= 3 && !this.miles.eco.has(1)) {
      this.miles.eco.add(1);
      this.write('mile', 'bad', 'cloud', '雾霾围城',
        `${smogRes} 栋住宅被浓烟笼罩，晾在窗外的白衬衫半天就蒙了灰。市民开始念叨：烟囱与卧房，总该隔着几条街。`, gHours);
    }
    if (this.miles.eco.has(1) && !this.miles.eco.has(2) && ecotowers >= 1 && envIdx >= 80) {
      this.miles.eco.add(2);
      this.write('mile', 'good', 'tree', '重现蓝天',
        `空气净化塔的滤网盘日夜转动，环境指数重回 ${envIdx}。孩子们又能在街心公园里追着风筝跑了。`, gHours);
    }
    return eraUp;
  }

  view(): ChronView {
    return {
      era: this.era, eraName: ERAS[this.era]?.name ?? ERAS[0].name,
      day: this.entries.length ? this.entries[this.entries.length - 1].day : 1,
      n: this.entries.length, total: this.total,
      entries: [...this.entries],
    };
  }

  reset(): void {
    this.entries = [];
    this.total = 0;
    this.era = 0;
    this.maxEra = 0;
    this.nextId = 1;
    this.miles = {
      pop: new Set(), rate: new Set(), bld: new Set(), land: new Set(), coin: new Set(), eco: new Set(),
    };
  }

  serialize(): string {
    return JSON.stringify({
      e: this.entries, tot: this.total, era: this.era, maxEra: this.maxEra, nid: this.nextId,
      m: {
        pop: [...this.miles.pop], rate: [...this.miles.rate], bld: [...this.miles.bld],
        land: [...this.miles.land], coin: [...this.miles.coin], eco: [...this.miles.eco],
      },
    });
  }

  /** 恢复（坏档给空册；返回是否恢复成功） */
  restore(raw: unknown): boolean {
    this.reset();
    if (typeof raw !== 'string') return false;
    try {
      const d = JSON.parse(raw) as {
        e?: unknown; tot?: unknown; era?: unknown; maxEra?: unknown; nid?: unknown; m?: {
          pop?: unknown; rate?: unknown; bld?: unknown; land?: unknown; coin?: unknown;
          eco?: unknown;
        };
      };
      if (!Array.isArray(d.e)) return false;
      const CATS = ['era', 'event', 'tech', 'fest', 'ord', 'mile'];
      const TONES = ['good', 'bad', 'big', 'info'];
      let nid = 1;
      for (const it of d.e) {
        const x = it as Partial<ChronEntry>;
        if (!x || typeof x.title !== 'string' || typeof x.text !== 'string') continue;
        const cat = CATS.includes(String(x.cat)) ? x.cat as ChronCat : 'mile';
        const tone = TONES.includes(String(x.tone)) ? x.tone as ChronTone : 'info';
        const id = Number(x.id);
        this.entries.push({
          id: Number.isFinite(id) && id > 0 ? id : nid,
          day: Math.max(1, Math.floor(Number(x.day) || 1)),
          cat, tone,
          icon: typeof x.icon === 'string' && x.icon ? x.icon : 'book',
          title: x.title.slice(0, 24), text: x.text.slice(0, 200),
        });
        nid = Math.max(nid, (Number.isFinite(id) ? id : 0) + 1);
      }
      if (!this.entries.length) return false;
      this.total = Math.max(this.entries.length, Math.floor(Number(d.tot) || 0));
      this.era = Math.max(0, Math.min(ERAS.length - 1, Math.floor(Number(d.era) || 0)));
      this.maxEra = Math.max(this.era, Math.min(ERAS.length - 1, Math.floor(Number(d.maxEra) || 0)));
      this.nextId = Math.max(nid, Math.floor(Number(d.nid) || 0), this.entries[this.entries.length - 1].id + 1);
      const L = (v: unknown) => (Array.isArray(v) ? v.filter((n) => Number.isFinite(n)).map(Number) : []);
      this.miles = {
        pop: new Set(L(d.m?.pop)), rate: new Set(L(d.m?.rate)), bld: new Set(L(d.m?.bld)),
        land: new Set(L(d.m?.land)), coin: new Set(L(d.m?.coin)), eco: new Set(L(d.m?.eco)),
      };
      return true;
    } catch {
      this.reset();
      return false;
    }
  }
}
