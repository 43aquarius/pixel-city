// ============================================================
// tycoon.ts — 经营模式：经济 / 领地 / 任务 / 等级 / 存档
//   参照 SimCity（税收·电力）、Anno（人口·岗位）、Township（购地扩张）
//   挂载到 Engine.econ 后所有建造行为过经济门禁（扣费/等级/领地）
// ============================================================

import { defById, CATALOG, ATTRACT } from './catalog';
import { CityMap, TERR_GRASS } from './map';

export const CHUNK = 16;                 // 领地块边长（格）
export const CHUNKS = 16;                // 256 / 16 = 16×16 块领地
export const ROAD_COST = 3;              // 每格道路
export const TREE_COST = 2;              // 每棵树
export const ROAD_REFUND = 1;            // 拆除每格道路返还
export const TREE_REFUND = 1;            // 拆除每棵树返还
export const REFUND_RATE = 0.5;          // 拆除建筑返还造价比例
/** 税率体系（v4）：可调 0-20%；默认 9%。
 *  超过 10% 引发市民不满（幸福度递减），低于 6% 市民欢欣（幸福度加成） */
export const TAX_MIN = 0;
export const TAX_MAX = 20;
export const TAX_DEFAULT = 9;
export const START_COINS = 320;
export const MAX_LEVEL = 12;
export const LIFT_COST = 5;              // 抬升 / 降低地形每级
export const WATER_COST = 12;            // 填海成陆 / 挖湖成水
export const FLAT_FEE = 3;               // 建造整地费（足迹内每差一格）
export const BRIDGE_COST = 15;           // v6 跨水桥每格（水上修路自动架桥）
export const BRIDGE_REFUND = 3;          // 拆桥返还
export const EAT_PER_POP = 0.045;        // 每人每分钟耗粮
export const FOOD_BASE_CAP = 60;         // 基础粮仓容量
export const HIST_SAMPLE = 15;          // 城市历史采样间隔（秒）
export const HIST_MAX = 96;             // 历史样本上限（约 24 分钟窗口）
export const SAVE_KEY = 'pxc_tycoon_v1';
export const MODE_KEY = 'pxc_mode_v1';
// ---- v10 货物供应链 / 旅游 / 法令 ----
export const GOODS_BASE_CAP = 100;     // 基础货仓容量（仓库每座 +80）
export const GOODS_START = 40;         // 开局货存
export const GOODS_TRICKLE = 0.8;      // 集市自产自销保底（早期小商业无需工厂）
export const EXPORT_PRICE = 1.35;      // 每单位货物出口价（冶金工艺 +25%）
export const EXPORT_MKT_MIN = 0.55;    // v11 出口市价下限（55%）
export const EXPORT_MKT_MAX = 1.55;    // v11 出口市价上限（155%）
export const TOUR_SPEND = 0.09;        // 每名游客每分钟消费 G

// ------------------------------------------------------------
// 四季体系（v6）：季节由 engine 时钟驱动，经济在快照层联动
// ------------------------------------------------------------

export type SeasonDef = {
  name: string;      // 春 / 夏 / 秋 / 冬
  icon: string;      // HUD 图标名（icons.ts）
  food: number;      // 粮食产量倍率
  com: number;       // 商业收入倍率
  powerDem: number;  // 电力需求倍率（空调 / 取暖）
  hap: number;       // 季节情绪（幸福度修正）
  tint: [string, number];   // 画面色调 [rgba, 强度]（engine 用）
  note: string;      // 换季提示文案
};

export const SEASONS: SeasonDef[] = [
  { name: '春', icon: 'spr', food: 1.15, com: 1.0, powerDem: 1.0, hap: 1,
    tint: ['rgba(121,180,92,1)', 0.045], note: '春回大地：粮食产量 +15%，樱花开满枝头' },
  { name: '夏', icon: 'sum', food: 1.0, com: 1.08, powerDem: 1.08, hap: 1,
    tint: ['rgba(242,210,75,1)', 0.05], note: '盛夏旅游季：商业 +8%，空调用电 +8%' },
  { name: '秋', icon: 'fall', food: 1.25, com: 1.0, powerDem: 1.0, hap: 2,
    tint: ['rgba(194,91,68,1)', 0.06], note: '金秋丰收：粮食产量 +25%，层林尽染' },
  { name: '冬', icon: 'win', food: 0.6, com: 0.92, powerDem: 1.18, hap: -2,
    tint: ['rgba(198,211,222,1)', 0.075], note: '寒冬：粮食 −40%，取暖用电 +18%，水面封冻' },
];

/** 税率 → 幸福度情绪修正（高于 10% 不满 / 低于 6% 欢欣） */
export function taxMood(rate: number): number {
  if (rate <= 6) return (6 - rate) * 1.6;
  if (rate > 10) return -(rate - 10) * 2.4;
  return 0;
}

/** 城市评级 → 等级字 */
export function ratingGrade(r: number): 'S' | 'A' | 'B' | 'C' | 'D' | 'E' {
  if (r >= 90) return 'S';
  if (r >= 80) return 'A';
  if (r >= 70) return 'B';
  if (r >= 55) return 'C';
  if (r >= 40) return 'D';
  return 'E';
}

// ------------------------------------------------------------
// 建筑经营参数表（v2 紧平衡：低起步 / 维护费 / 慢回本）
//   cost 建造价 / unlock 市政厅等级 / earn 满员满电收入 G·分
//   power 耗电 MW（负=发电）/ amenity 宜居点 / pollute 污染点
//   upk 维护费 G·分（每分钟固定支出；公共设施=运营开支，商业=人力租金，工业=设备折旧）
// ------------------------------------------------------------

export type EconDef = {
  cost: number; unlock: number; earn: number;
  power: number; amenity: number; pollute: number; upk: number;
  food?: number;      // 粮食产量（粮/分）
  foodCap?: number;   // 粮仓容量增量
  edu?: number;       // 教育容量（智慧指数供给）
  sp?: number;        // 科技点产量 /分
  cul?: number;       // v8 文化点（文化指数供给：文旅/精神/地标类建筑）
  waterR?: number;    // v6 供水半径（格；水塔/净水厂）
  waterCap?: number;  // v6 供水容量（覆盖人口上限）
  goodsP?: number;    // v10 货物产量（件/分：工业供货）
  goodsC?: number;    // v10 货物消耗（件/分：零售商业上货）
  goodsCap?: number;  // v10 货仓容量增量
};

const D = (
  cost: number, unlock: number,
  o: { earn?: number; power?: number; amenity?: number; pollute?: number; upk?: number;
    food?: number; foodCap?: number; edu?: number; sp?: number; cul?: number;
    waterR?: number; waterCap?: number; goodsP?: number; goodsC?: number; goodsCap?: number } = {},
): EconDef => ({
  cost, unlock,
  earn: o.earn ?? 0, power: o.power ?? 0,
  amenity: o.amenity ?? 0, pollute: o.pollute ?? 0, upk: o.upk ?? 0,
  food: o.food, foodCap: o.foodCap, edu: o.edu, sp: o.sp, cul: o.cul,
  waterR: o.waterR, waterCap: o.waterCap,
  goodsP: o.goodsP, goodsC: o.goodsC, goodsCap: o.goodsCap,
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
  minshuku: D(145, 6, { power: 3, goodsC: 0.3 }),
  // ---- 商业（岗位 = 目录 pop；earn 满员收入；upk 人力租金）----
  // v8 紧平衡：收入 −7%、维护费 +20%（回本周期 18→24 分钟，更需经营头脑）
  shop: D(80, 1, { power: 3, earn: 4.2, upk: 1.2, goodsC: 0.5 }),
  office: D(420, 4, { power: 10, earn: 20, upk: 5.8 }),
  tower: D(1700, 9, { power: 26, earn: 57, upk: 13 }),
  conv: D(70, 1, { power: 2, earn: 3.3, upk: 1, goodsC: 0.35 }),
  hotel: D(1350, 7, { power: 22, earn: 44, upk: 9.6, goodsC: 1.8 }),
  mall: D(1250, 7, { power: 24, earn: 40, upk: 11.6, goodsC: 2.2 }),
  parking: D(100, 4, { power: 1, earn: 0.75, upk: 0.25 }),
  izakaya: D(140, 4, { power: 3, earn: 5.5, upk: 1.6, goodsC: 0.5 }),
  cinema: D(780, 6, { power: 12, earn: 22, upk: 3.6, cul: 2, goodsC: 0.9 }),
  market: D(90, 2, { power: 2, earn: 3.5, upk: 1, goodsC: 0.4 }),
  electown: D(300, 6, { power: 5, earn: 9.2, upk: 1.9, goodsC: 0.8 }),
  ferris: D(550, 5, { power: 6, earn: 2.7, amenity: 2, upk: 1.7, cul: 2, goodsC: 0.15 }),
  bakery: D(80, 2, { power: 2, earn: 3.9, upk: 1.15, goodsC: 0.55 }),
  gas: D(170, 2, { power: 2, earn: 5.5, upk: 1.3, goodsC: 0.25 }),
  ferry: D(720, 5, { power: 6, earn: 12, upk: 2.2 }),
  // ---- 工业（污染；upk 设备折旧）v8：收入 −5%、维护费 +15% ----
  factory: D(620, 5, { power: 14, earn: 30, pollute: 4, upk: 6.7, goodsP: 2.2 }),
  warehouse: D(270, 6, { power: 6, earn: 9.4, pollute: 1, upk: 1.6, goodsP: 0.8, goodsCap: 80 }),
  tankfarm: D(210, 5, { power: 5, earn: 7.5, pollute: 2, upk: 1.4, goodsP: 1.0 }),
  refinery: D(1050, 7, { power: 20, earn: 47, pollute: 6, upk: 10.4, goodsP: 3.5 }),
  power: D(620, 4, { power: -120, pollute: 5, upk: 4 }),
  lumber: D(230, 3, { power: 6, earn: 11, pollute: 2, upk: 2.5, goodsP: 1.4 }),
  silo: D(140, 4, { power: 3, earn: 5.6, pollute: 1, upk: 1.3, food: 1.5, foodCap: 120, goodsP: 0.6 }),
  windmill: D(160, 3, { power: -15, earn: 2, upk: 0.3, food: 1 }),
  greenhouse: D(170, 3, { power: 4, earn: 6.5, upk: 1.2, food: 5 }),
  brewery: D(320, 4, { power: 8, earn: 10.8, pollute: 2, upk: 2.1, goodsP: 1.6 }),
  dock: D(560, 8, { power: 10, earn: 20.5, pollute: 3, upk: 3.5, goodsP: 1.2 }),
  railhub: D(920, 7, { power: 16, earn: 26, pollute: 3, upk: 4.2, goodsP: 1.4, goodsCap: 60 }),  // v11 陆路出口枢纽
  // ---- 公共（宜居；upk 运营开支）v8：维护费 +25%（公共服务更烧钱）----
  park: D(55, 1, { amenity: 2, upk: 1 }),
  plaza: D(85, 2, { power: 1, amenity: 3, upk: 1.5, cul: 0.5 }),
  school: D(460, 5, { power: 8, amenity: 5, upk: 2.5, edu: 40, sp: 1.2 }),
  library: D(320, 3, { power: 4, amenity: 3, upk: 1.75, edu: 35, sp: 2 }),
  hospital: D(720, 6, { power: 12, amenity: 6, upk: 3 }),
  temple: D(420, 6, { power: 2, amenity: 4, upk: 2, edu: 8, cul: 2.5 }),
  stadium: D(1800, 9, { power: 16, amenity: 5, upk: 2.5, cul: 2.5 }),
  radiotower: D(220, 5, { power: 4, amenity: 1, upk: 0.5, sp: 0.8 }),
  monument: D(110, 3, { amenity: 3, upk: 1.5, cul: 2 }),
  church: D(180, 4, { power: 1, amenity: 3, upk: 1.5, cul: 2 }),
  museum: D(550, 7, { power: 6, amenity: 4, upk: 2, edu: 25, sp: 1.5, cul: 4 }),
  firestation: D(240, 5, { power: 3, amenity: 3, upk: 1.5 }),
  lighthouse: D(140, 8, { power: 1, amenity: 1, upk: 0.5, cul: 1 }),
  castle: D(2200, 9, { power: 4, amenity: 3, upk: 1.5, edu: 5, cul: 3 }),
  busstop: D(50, 1, { amenity: 2, upk: 0.6 }),
  tramstop: D(240, 5, { power: 3, amenity: 1, upk: 1.2 }),   // v11 电车站（干线整流所另计 +16MW）
  clocktower: D(150, 3, { power: 1, amenity: 2, upk: 1, cul: 1 }),
  observatory: D(620, 7, { power: 5, amenity: 3, upk: 1.5, edu: 20, sp: 2.5 }),
  torii: D(115, 5, { amenity: 2, upk: 1, cul: 1.5 }),
  pavilion: D(75, 2, { amenity: 2, upk: 1, cul: 1 }),
  aquarium: D(880, 8, { power: 10, amenity: 4, upk: 2, edu: 10, sp: 0.5, cul: 3 }),
  cellmast: D(120, 7, { power: 2, upk: 0.25 }),
  // ---- 水务（v6：供水覆盖指数）----
  watertower: D(130, 2, { power: 2, amenity: 1, upk: 0.75, waterR: 9, waterCap: 260 }),
  waterplant: D(860, 6, { power: 14, amenity: 2, upk: 4, waterR: 20, waterCap: 2200 }),
  // ---- 市政厅（经营模式核心，不可直接建造；自带水井供早期定居）----
  cityhall: D(0, 99, { power: -40, amenity: 2, edu: 10, sp: 0.3, waterR: 6, waterCap: 120 }),
};

// ------------------------------------------------------------
// 科技树：四大分支 × 四层级，共 16 项
//   消耗科技点（SP）；部分需智慧指数或前置科技
// ------------------------------------------------------------

export type TechBranch = 'agr' | 'ind' | 'civ' | 'com';

export type Tech = {
  id: string; name: string; br: TechBranch; tier: number;
  cost: number; wis?: number; req: string[]; desc: string;
};

export const BRANCHES: Array<{ key: TechBranch; name: string; note: string }> = [
  { key: 'agr', name: '粮食', note: '仓廪实而知礼节' },
  { key: 'ind', name: '工业', note: '钢铁与电流的意志' },
  { key: 'civ', name: '民生', note: '城市文明的温度' },
  { key: 'com', name: '商业', note: '财富流转的艺术' },
];

export const TECHS: Tech[] = [
  // ---- 粮食 ----
  { id: 'irrig', name: '灌溉技术', br: 'agr', tier: 1, cost: 25, req: [],
    desc: '粮食产量 +30%' },
  { id: 'croprot', name: '轮作制度', br: 'agr', tier: 2, cost: 55, req: ['irrig'],
    desc: '农业建筑维护费 −40%' },
  { id: 'granary', name: '粮仓科学', br: 'agr', tier: 3, cost: 90, wis: 40, req: ['irrig'],
    desc: '粮仓容量翻倍，饥荒伤害减半' },
  { id: 'vfarm', name: '垂直农业', br: 'agr', tier: 4, cost: 150, wis: 55, req: ['granary'],
    desc: '粮食产量再 +50%' },
  // ---- 工业 ----
  { id: 'poweng', name: '电力工程', br: 'ind', tier: 1, cost: 25, req: [],
    desc: '发电设施输出 +25%' },
  { id: 'logistic', name: '物流网络', br: 'ind', tier: 2, cost: 45, req: ['poweng'],
    desc: '道路造价 −50%' },
  { id: 'metal', name: '冶金工艺', br: 'ind', tier: 3, cost: 85, wis: 45, req: ['poweng'],
    desc: '工业收入 +20%，解锁炼油厂' },
  { id: 'auto', name: '自动化产线', br: 'ind', tier: 4, cost: 140, wis: 60, req: ['metal'],
    desc: '工业维护费 −25%' },
  // ---- 民生 ----
  { id: 'compul', name: '义务教育', br: 'civ', tier: 1, cost: 20, req: [],
    desc: '学校教育容量 +40%' },
  { id: 'green', name: '城市绿化', br: 'civ', tier: 2, cost: 55, req: ['compul'],
    desc: '工业污染 −30%（环境指数同步改善）' },
  { id: 'health', name: '公共医疗', br: 'civ', tier: 3, cost: 85, wis: 40, req: ['compul'],
    desc: '医院宜居 +3、病床覆盖 +20%，人口迁入 +20%' },
  { id: 'higher', name: '高等教育', br: 'civ', tier: 4, cost: 130, wis: 60, req: ['compul'],
    desc: '科技点产出 +35%' },
  // ---- 商业 ----
  { id: 'taxref', name: '税制改革', br: 'com', tier: 1, cost: 30, req: [],
    desc: '人口税收 +15%' },
  { id: 'brand', name: '城市名片', br: 'com', tier: 2, cost: 60, req: ['taxref'],
    desc: '文旅商业（酒店/商场/摩天轮/水族馆/影院/城堡）收入 +20%' },
  { id: 'struct', name: '建筑工程学', br: 'com', tier: 3, cost: 100, wis: 50, req: ['taxref'],
    desc: '解锁摩天大楼与高层住宅' },
  { id: 'finhub', name: '金融中心', br: 'com', tier: 4, cost: 160, wis: 65, req: ['struct'],
    desc: '商业收入 +15%，离线收益上限 8 小时' },
];

export function techNameOf(id: string | null): string {
  return id ? TECHS.find(t => t.id === id)?.name ?? id : '';
}

// ------------------------------------------------------------
// 随机事件系统（v5）：让消防 / 医院 / 电力等指数真正「派上用场」
// ------------------------------------------------------------

export type WeatherKind = 'clear' | 'cloudy' | 'rain' | 'snow';
export type WeatherState = { kind: WeatherKind; t: number };

export type ActiveEvent = {
  key: string; name: string; note: string;
  kind: 'good' | 'bad';
  left: number; dur: number;
  hap: number;
  mult: { com?: number; ind?: number; food?: number; power?: number; traffic?: number; sp?: number; amenity?: number; tour?: number; exp?: number };
  fx?: { x: number; y: number };
};

export type EventLogItem = { t: number; name: string; kind: 'good' | 'bad'; result: string };

type EventTpl = {
  key: string; name: string; kind: 'good' | 'bad';
  dur: number; hap: number;
  mult: ActiveEvent['mult'];
  note: string;
  /** 触发权重（0 = 当前条件不可触发） */
  w: (s: Snap, t: Tycoon) => number;
  /** 触发时的一次性结算（返回结果文案；不返回 = 纯持续事件） */
  fire?: (t: Tycoon, s: Snap) => string | void;
  /** 是否挑选一栋建筑作为事故现场（烟柱特效） */
  fx?: boolean;
};

/** 事件模板池：好坏约 5:5，设施齐全可大幅减免灾害 */
const EVENT_TPLS: EventTpl[] = [
  {
    key: 'fire', name: '火灾', kind: 'bad', dur: 20, hap: -10,
    mult: {}, fx: true,
    note: '一栋建筑失火！消防站可将损失降至 20%',
    w: s => (t => t ? (s.firestations > 0 ? 6 : 15) : 0)(s.pop >= 40),
    fire: (t, s) => {
      const cut = s.firestations > 0 ? 0.2 : 1;
      const loss = Math.round((150 + t.pop * 0.6) * cut);
      t.coins = Math.max(0, t.coins - loss);
      return s.firestations > 0
        ? `消防队迅速出动！损失仅 ${loss}G`
        : `没有消防站，损失 ${loss}G —— 快建消防局`;
    },
  },
  {
    key: 'plague', name: '疫病流行', kind: 'bad', dur: 25, hap: -8,
    mult: {},
    note: '传染病蔓延，医院可将影响降至 1/4',
    w: s => (s.pop >= 60 ? (s.hospitals > 0 ? 5 : 13) : 0),
    fire: (t, s) => {
      const cut = s.hospitals > 0 ? 0.25 : 1;
      const gone = Math.max(1, Math.round(t.pop * 0.06 * cut));
      t.pop = Math.max(0, t.pop - gone);
      return s.hospitals > 0
        ? `医院全力收治，仅 ${gone} 人病退`
        : `${gone} 位市民病倒离开 —— 医院不可少`;
    },
  },
  {
    key: 'blackout', name: '停电事故', kind: 'bad', dur: 40, hap: -4,
    mult: { power: 0.65 },
    note: '电网过载跳闸：供电 −35%（电力冗余可避免）',
    w: s => (s.powerDem > 0 && s.powerSup / s.powerDem < 1.35 ? 11 : 0),
  },
  {
    key: 'storm', name: '暴风雨', kind: 'bad', dur: 45, hap: -5,
    mult: { power: 0.85, traffic: 0.7, ind: 0.85 },
    note: '狂风骤雨：交通 −30% · 工业 −15% · 供电 −15%',
    w: s => (s.pop >= 40 ? 9 : 0),
    fire: () => { /* engine 侧强制切换为雨天 */ },
  },
  {
    key: 'scandal', name: '税务风波', kind: 'bad', dur: 60, hap: -8,
    mult: {},
    note: '高税引发不满：考虑下调税率安抚市民',
    w: (_s, t) => (t.taxRate > 12 ? 9 : 0),
  },
  {
    key: 'boom', name: '游客潮', kind: 'good', dur: 55, hap: 3,
    mult: { com: 1.6 },
    note: '口碑引爆客流：商业收入 ×1.6',
    w: s => (s.com >= 3 ? 11 : 0),
    fire: (t, s) => {
      const gain = Math.round(40 + t.pop * 0.12);
      t.coins += gain;
      return `游客消费 +${gain}G`;
    },
  },
  {
    key: 'harvest', name: '丰收节', kind: 'good', dur: 80, hap: 4,
    mult: { food: 1.3 },
    note: '风调雨顺：粮食产量 ×1.3',
    w: s => (s.foodProd > 1 ? 10 : 0),
  },
  {
    key: 'expo', name: '科技博览会', kind: 'good', dur: 80, hap: 2,
    mult: { sp: 2 },
    note: '学界盛会：科技点产出 ×2',
    w: s => (s.eduCap > 20 ? 9 : 0),
  },
  {
    key: 'festival', name: '街头艺术节', kind: 'good', dur: 70, hap: 6,
    mult: { amenity: 8 },
    note: '公园里的艺术节：宜居 +8 · 幸福 +6',
    w: s => (s.park >= 2 ? 9 : 0),
  },
  {
    key: 'invest', name: '投资热潮', kind: 'good', dur: 0, hap: 0,
    mult: {},
    note: '资本青睐你的城市',
    w: (_s, t) => (t.level >= 3 ? 7 : 0),
    fire: (t) => {
      const gain = Math.round(250 + t.level * 35);
      t.coins += gain;
      return `投资到账 +${gain}G`;
    },
  },
  // ---- v10 旅游事件 ----
  {
    key: 'tourseason', name: '旅游旺季', kind: 'good', dur: 70, hap: 2,
    mult: { tour: 1.7 },
    note: '假期观光潮涌入：游客人数 ×1.7',
    w: s => (s.tourists >= 8 ? 8 : 0),
  },
  {
    key: 'badreview', name: '差评风波', kind: 'bad', dur: 50, hap: -3,
    mult: { tour: 0.45, com: 0.92 },
    note: '负面评价发酵：游客 −55% · 商业 −8%',
    w: s => (s.tourists >= 15 && s.happiness < 48 ? 7 : 0),
  },
  // ---- v11 出口市场事件 ----
  {
    key: 'bullmkt', name: '出口牛市', kind: 'good', dur: 90, hap: 1,
    mult: { exp: 1.45 },
    note: '海外订单激增：出口单价 ×1.45 —— 正是抛售良机',
    w: s => (s.ports + s.railHubs > 0 ? (s.exportEarn > 150 ? 7 : 3) : 0),
  },
  {
    key: 'tradewar', name: '贸易摩擦', kind: 'bad', dur: 70, hap: -2,
    mult: { exp: 0.6 },
    note: '关税壁垒高筑：出口单价 −40%（惜售囤货或可止损）',
    w: s => (s.ports > 0 && s.exportEarn > 250 ? 6 : 0),
  },
];

// ------------------------------------------------------------
// 成就系统（v5）：城市志成就墙
// ------------------------------------------------------------

export type AchvDef = {
  id: string; name: string; desc: string; icon: string;
  goal: number;
  val: (s: Snap, t: Tycoon) => number;
};

export const ACHIEVEMENTS: AchvDef[] = [
  { id: 'pop100', name: '人口破百', desc: '常住人口达到 100', icon: 'people', goal: 100, val: (_s, t) => t.pop },
  { id: 'pop500', name: '广厦万间', desc: '常住人口达到 500', icon: 'people', goal: 500, val: (_s, t) => t.pop },
  { id: 'pop1500', name: '特大都市', desc: '常住人口达到 1500', icon: 'people', goal: 1500, val: (_s, t) => t.pop },
  { id: 'coin5k', name: '小康之家', desc: '金币积累 5000', icon: 'coin', goal: 5000, val: (_s, t) => t.coins },
  { id: 'coin50k', name: '富甲一方', desc: '金币积累 50000', icon: 'coin', goal: 50000, val: (_s, t) => t.coins },
  { id: 'bld50', name: '添砖加瓦', desc: '建筑数量达到 50', icon: 'flag', goal: 50, val: s => s.buildings },
  { id: 'bld300', name: '摩天丛林', desc: '建筑数量达到 300', icon: 'flag', goal: 300, val: s => s.buildings },
  { id: 'road100', name: '道路通达', desc: '累计修路 100 格', icon: 'bolt', goal: 100, val: (_s, t) => t.roadsBuilt },
  { id: 'techall', name: '科技全满', desc: '研究全部 16 项科技', icon: 'flask', goal: 16, val: (_s, t) => t.techs.size },
  { id: 'rateA', name: '金字招牌', desc: '城市评级达到 A（80）', icon: 'medal', goal: 80, val: s => s.rating },
  { id: 'rateS', name: '都市传奇', desc: '城市评级达到 S（90）', icon: 'medal', goal: 90, val: s => s.rating },
  { id: 'land9', name: '疆域辽阔', desc: '拥有 9 块领地', icon: 'land', goal: 9, val: s => s.chunks },
  { id: 'age60', name: '一小时城市', desc: '城市年龄满 1 小时', icon: 'chart', goal: 3600, val: (_s, t) => t.playtime },
  { id: 'granary', name: '仓廪充实', desc: '粮仓容量达到 300', icon: 'wheat', goal: 300, val: s => s.foodCap },
  // ---- v6 水务 / 桥梁 ----
  { id: 'water100', name: '清流绕城', desc: '供水覆盖率达到 100', icon: 'drop', goal: 100, val: s => s.waterIdx },
  { id: 'bridge16', name: '跨海长虹', desc: '累计架设 16 格跨水桥', icon: 'bridge', goal: 16, val: s => s.bridgeTiles },
  // ---- v7 公交 / 航运 ----
  { id: 'transit4', name: '城市动脉', desc: '建造 4 座巴士站，公交网络四通八达', icon: 'road', goal: 4, val: s => s.busStops },
  { id: 'harbor', name: '港湾灯影', desc: '建造渡轮码头，船舶鸣笛出港', icon: 'land', goal: 1, val: s => s.ferries },
  // ---- v10 货物 / 旅游 / 法令 ----
  { id: 'tour60a', name: '门庭若市', desc: '游客人数达到 60', icon: 'people', goal: 60, val: s => s.tourists },
  { id: 'tour200', name: '世界名城', desc: '游客人数达到 200', icon: 'medal', goal: 200, val: s => s.tourists },
  { id: 'export300', name: '货通四海', desc: '累计出口创汇 300G', icon: 'coin', goal: 300, val: s => s.exportEarn },
  { id: 'ords4', name: '政通人和', desc: '同时颁布 4 条市政法令', icon: 'flag', goal: 4, val: s => s.ordsN },
  // ---- v11 轨道 / 贸易 ----
  { id: 'tram4', name: '电气化都市', desc: '电车站达到 4 座，干线电车穿梭街巷', icon: 'bolt', goal: 4, val: s => s.tramStops },
  { id: 'export1500', name: '世界工厂', desc: '累计出口创汇 1500G（善用市价波动与惜售囤货）', icon: 'coin', goal: 1500, val: s => s.exportEarn },
];

/** 需特定科技才可建造的建筑
 *  v8 扩充：科技真正决定城市发展上限 —— 港航设施需物流网络，
 *  文旅地标需城市名片，大型结构需建筑工程学，学术设施需高等教育 */
export const TECH_GATE: Record<string, string> = {
  refinery: 'metal',
  tramstop: 'poweng', railhub: 'metal',
  tower: 'struct', restower: 'struct', danchi: 'struct', hiapart: 'struct',
  castle: 'struct', stadium: 'struct',
  observatory: 'higher',
  aquarium: 'brand',
  dock: 'logistic',
  brewery: 'metal',
};

// ------------------------------------------------------------
// v10 市政法令：各有代价与收益的开关式政策（政令厅可随时颁布 / 废止）
// ------------------------------------------------------------

export type OrdDef = {
  id: string; name: string; desc: string;
  cost: number;              // 每分钟行政开支（G；0 = 零成本）
  lv: number;                // 所需市政厅等级
  reqNote?: string;          // 额外条件说明（不满足时锁定）
  req?: (s: Snap) => boolean;
};

export const ORDS: OrdDef[] = [
  { id: 'welcome', name: '开放落户', lv: 2, cost: 0.6,
    desc: '人口迁入 +28%，宜居需求 +10%，幸福 −1' },
  { id: 'energy', name: '节能令', lv: 3, cost: 0,
    desc: '全城用电 −12%，幸福 −2（拉闸限电不得民心）' },
  { id: 'organic', name: '有机农业', lv: 3, cost: 0.8,
    desc: '粮食产量 +18%，农业设施维护 +25%' },
  { id: 'patrol', name: '治安巡逻', lv: 3, cost: 1.4,
    desc: '安全指数 +15，幸福 +1' },
  { id: 'night', name: '夜间经济', lv: 4, cost: 1.2,
    desc: '商业收入 +10%，用电 +6%，幸福 +1' },
  { id: 'transit', name: '公交优先', lv: 4, cost: 1.6,
    desc: '交通指数 +10，人口迁入 +12%',
    reqNote: '需 2 座巴士站', req: s => s.busStops >= 2 },
  { id: 'voucher', name: '消费券', lv: 5, cost: 2.8,
    desc: '商业收入 +15%（发券刺激消费，行政开支不菲）' },
  { id: 'ecolaw', name: '环保条例', lv: 6, cost: 0,
    desc: '工业污染 −28%，工业收入 −7%（企业治污代价）' },
];

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
  hasLib: number; hasGreen: number; techsN: number; famine: number;
  // ---- v4 综合指数 ----
  employIdx: number; envIdx: number; healthIdx: number;
  safetyIdx: number; trafficIdx: number; rating: number;
  // ---- v6 水务 / 桥梁 ----
  hasWaterTower: number; waterIdx: number; bridgeTiles: number;
  // ---- v7 公交 / 航运 ----
  busStops: number; ferries: number; busBonus: number;
  // ---- v10 货物 / 旅游 / 法令 ----
  tourists: number; exportEarn: number; ports: number;
  ordsN: number; goodsIdx: number;
  // ---- v11 轨道交通 ----
  tramStops: number; railHubs: number;
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
  { id: 'food1', title: '仓廪之始', hint: '建造 1 座温室大棚（粮食供养市民，缺粮会饥荒）', goal: 1,
    val: s => s.hasGreen, rG: 160, rXp: 95 },
  { id: 'b15', title: '初具规模', hint: '城市拥有 15 栋建筑', goal: 15,
    val: s => s.buildings, rG: 195, rXp: 100 },
  { id: 'land1', title: '开疆拓土', hint: '购买 1 块新领地（点击金色虚线框）', goal: 5,
    val: s => s.chunks, rG: 175, rXp: 110 },
  { id: 'pop250', title: '熙熙攘攘', hint: '人口达到 250 人', goal: 250,
    val: s => s.pop, rG: 240, rXp: 130 },
  { id: 'school1', title: '书香之城', hint: '建造一所学校（提升智慧指数）', goal: 1,
    val: s => s.hasSchool, rG: 225, rXp: 125 },
  { id: 'lib1', title: '知识的殿堂', hint: '建造一座图书馆（教育容量 +35，科技点 +2/分）', goal: 1,
    val: s => s.hasLib, rG: 255, rXp: 135 },
  { id: 'water1', title: '清泉入户', hint: '建造 1 座水塔（覆盖半径内的住宅才有自来水，缺水会拖累幸福与迁入）', goal: 1,
    val: s => s.hasWaterTower, rG: 190, rXp: 115 },
  { id: 'bus2', title: '公交开线', hint: '建逑2 座巴士站（需邻接道路）：两站即自动开通巴士环线，交通指数 +8 起', goal: 2,
    val: s => s.busStops, rG: 210, rXp: 125 },
  { id: 'tech1', title: '科技之光', hint: '在科技研究院研究第一项科技（顶部「科」指标进入）', goal: 1,
    val: s => s.techsN, rG: 280, rXp: 150 },
  { id: 'bridge1', title: '跨水长虹', hint: '在水面上修路会自动架桥（15G/格），累计架设 4 格跨水桥', goal: 4,
    val: s => s.bridgeTiles, rG: 305, rXp: 160 },
  { id: 'ferry1', title: '扬帆起航', hint: '在水畔建逑1 座渡轮码头（需邻接水面）：自有渡轮出港巡游，冬季冰封停航', goal: 1,
    val: s => s.ferries, rG: 335, rXp: 170 },
  { id: 'hap70', title: '安居乐业', hint: '幸福度达到 70（多建公园与公共设施）', goal: 70,
    val: s => s.happiness, rG: 270, rXp: 140 },
  { id: 'hosp1', title: '仁心仁术', hint: '建造一座医院（健康指数保障城市运转）', goal: 1,
    val: s => s.hasHospital, rG: 295, rXp: 150 },
  { id: 'water80', title: '甘霖普惠', hint: '供水覆盖率达到 80%（水塔半径有限，大城市需要净水厂）', goal: 80,
    val: s => s.waterIdx, rG: 370, rXp: 185 },
  { id: 'employ', title: '人尽其才', hint: '就业率达到 90%（岗位要多过劳动力：商业与工业都提供岗位）', goal: 90,
    val: s => s.employIdx, rG: 335, rXp: 170 },
  { id: 'pop800', title: '城市脉搏', hint: '人口达到 800 人', goal: 800,
    val: s => s.pop, rG: 415, rXp: 200 },
  { id: 'tower1', title: '触摸天际', hint: '建造一座摩天大楼（需先在科技研究院研究「建筑工程学」）', goal: 1,
    val: s => s.hasTower, rG: 480, rXp: 230 },
  { id: 'land9', title: '纵横捭阖', hint: '领地达到 9 块', goal: 9,
    val: s => s.chunks, rG: 600, rXp: 260 },
  { id: 'rating', title: '金字招牌', hint: '城市综合评级达到 A（80 分）—— 幸福/宜居/粮食/就业/环境/健康/安全/交通全维度均衡', goal: 80,
    val: s => s.rating, rG: 720, rXp: 280 },
  { id: 'pop2500', title: '都市之父', hint: '人口达到 2500 人 —— 终极成就！', goal: 2500,
    val: s => s.pop, rG: 880, rXp: 330 },
  // ---- v10 货物 / 旅游 / 法令时代 ----
  { id: 'goods1', title: '货畅其流', hint: '建造 2 座工业建筑（工厂/木材厂产出货物供给商店：货物短缺会让商业收入大打折扣）', goal: 2,
    val: s => s.ind, rG: 520, rXp: 240 },
  { id: 'export1', title: '货通四海', hint: '累计出口创汇 300G（货仓超八成且产大于销时，港口吊机/渡轮码头/铁路货运站自动外销，单价随市价浮动）', goal: 300,
    val: s => s.exportEarn, rG: 640, rXp: 270 },
  { id: 'ord2', title: '政令时代', hint: '在市政法令厅颁布 2 条法令（各有代价与收益，随时可废止）', goal: 2,
    val: s => s.ordsN, rG: 560, rXp: 250 },
  { id: 'tourist60', title: '宾至如归', hint: '游客人数达到 60（摩天轮/水族馆/博物馆是吸引力大户；酒店床位决定接待上限）', goal: 60,
    val: s => s.tourists, rG: 620, rXp: 280 },
  // ---- v11 轨道时代 / 钢铁动脉 ----
  { id: 'tram2', title: '轨道时代', hint: '建造 2 座电车站（需先研究「电力工程」；邻路而建，两站即开通电车干线：交通 +3/座 · 幸福 +2 · 整流所用电 +16MW）', goal: 2,
    val: s => s.tramStops, rG: 540, rXp: 250 },
  { id: 'rail1', title: '钢铁动脉', hint: '建造铁路货运站（需研究「冶金工艺」）：内陆城市也能出口创汇，4 件/分吞吐是港口近两倍；出口单价随市价浮动，低吸高抛', goal: 1,
    val: s => s.railHubs, rG: 660, rXp: 280 },
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
  // ---- 民生指数（v3）----
  food: number; foodCap: number; foodProd: number; foodEat: number; foodNet: number;
  famine: number;
  wisdom: number; eduCap: number;
  sp: number; spRate: number;
  livability: number;
  techs: string[];
  // ---- v4 指数与数据 ----
  taxRate: number; taxMood: number;
  employIdx: number; envIdx: number; healthIdx: number;
  safetyIdx: number; trafficIdx: number;
  rating: number; ratingGrade: 'S' | 'A' | 'B' | 'C' | 'D' | 'E';
  hospitals: number; firestations: number;
  playtime: number;
  hist: HistPoint[];
  // ---- v5：天气 / 事件 / 成就 ----
  weather: WeatherState;
  events: Array<{ key: string; name: string; note: string; kind: 'good' | 'bad'; left: number; dur: number }>;
  eventLog: EventLogItem[];
  achv: Array<{ id: string; name: string; desc: string; icon: string; got: boolean; cur: number; goal: number }>;
  achvGot: number;
  // ---- v6：季节 / 水务 ----
  season: number;
  waterIdx: number; waterCapT: number;
  hasWaterTower: number;
  bridgeTiles: number;
  // ---- v7：公交 / 航运 ----
  busStops: number; ferries: number; busBonus: number;
  // ---- v8：文化 / 科研指数 ----
  cultureSup: number; cultureNeed: number; cultureIdx: number; sciIdx: number;
  // ---- v10：货物 / 旅游 / 法令 ----
  goods: number; goodsCap: number; goodsProd: number; goodsCons: number;
  goodsNet: number; goodsIdx: number;
  exportRate: number; exportTotal: number; ports: number;
  tourists: number; tourIdx: number; beds: number; attract: number;
  incomeTour: number; incomeExp: number; ordCost: number;
  ords: Array<{ id: string; name: string; desc: string; cost: number; lv: number;
    reqNote: string; on: boolean; lockLv: boolean; reqOk: boolean }>;
  // ---- v11：轨道交通 / 出口市场 ----
  tramStops: number; railHubs: number; tramBonus: number;
  mkt: number; mktTrend: number; expPrice: number; exportHold: boolean;
};

export type HistPoint = { t: number; pop: number; coins: number; net: number; hap: number };

// ------------------------------------------------------------
// 经营引擎
// ------------------------------------------------------------

type Snap = QS & {
  jobs: number; earnCom: number; earnInd: number; upk: number;
  powerSup: number; powerDem: number;
  amenitySup: number; pollute: number;
  happyMult: number; staffing: number; powerMult: number;
  foodProd: number; foodCap: number; foodEat: number; foodNet: number;
  eduCap: number; spRaw: number; wisdom: number; livability: number;
  famine: number; foodIdx: number; jobIdx: number;
  hospitals: number; firestations: number; roadsTotal: number;
  taxMoodV: number;
  // ---- v5：事件 / 天气快照 ----
  eventHap: number; eventAmenity: number;
  multCom: number; multInd: number; multFood: number;
  multPower: number; multTraffic: number; multSp: number;
  weather: WeatherState;
  // ---- v6：季节 / 水务 ----
  season: number; seasonHap: number;
  waterIdx: number; waterCapT: number;
  // ---- v7：公交 / 航运 ----
  busStops: number; ferries: number; busBonus: number;
  // ---- v11：轨道交通 / 出口市场 ----
  tramStops: number; railHubs: number; tramBonus: number;
  multExp: number; expPrice: number;
  // ---- v8：文化 / 科研指数 ----
  cultureSup: number; cultureNeed: number; cultureIdx: number; sciIdx: number;
  // ---- v10：货物 / 旅游 / 法令 ----
  goodsP: number; goodsC: number; goodsCap: number; goodsNet: number; goodsIdx: number;
  exportRate: number; ports: number;
  tourists: number; tourIdx: number; beds: number; attract: number;
  multTour: number; ordCost: number; ordHap: number; migMult: number;
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
  /** 粮仓库存 */
  food = 30;
  /** 科技点库存 */
  sp = 0;
  /** 已研究科技 */
  techs = new Set<string>();
  /** 税率（%，0..20；影响税收与幸福度） */
  taxRate = TAX_DEFAULT;
  /** 城市历史采样（每 15 秒一点，滑窗 96 点） */
  hist: HistPoint[] = [];
  /** 累计游戏时长（秒） */
  playtime = 0;
  hall: { x: number; y: number } = { x: 127, y: 127 };
  /** 16×16 领地掩码（1=已购） */
  own = new Uint8Array(CHUNKS * CHUNKS);

  msg: ((s: string) => void) | null = null;
  sfx: ((n: 'coin' | 'quest' | 'level' | 'buy' | 'error') => void) | null = null;

  // ---- v5：天气 / 随机事件 / 成就 ----
  /** 当前天气（engine 每帧回写；纯数据不参与存档，重开随机） */
  weather: WeatherState = { kind: 'clear', t: 0 };
  /** v6 当前季节 0春/1夏/2秋/3冬（engine 每帧回写；随档保存） */
  season = 1;
  /** 进行中的事件（最多 2 个） */
  events: ActiveEvent[] = [];
  /** 最近事件日志（尾部最新，最多 12 条） */
  eventLog: EventLogItem[] = [];
  /** 事件调度计时器（秒；首次 130s 后开始 roll） */
  private eventTimer = 130;
  /** 已解锁成就 */
  achv = new Set<string>();
  private achvTimer = 0;
  /** 事件请求强制天气（engine 每帧消费：'rain' = 暴风雨） */
  weatherReq: WeatherKind | null = null;

  // ---- v10：货物 / 旅游 / 法令 ----
  /** 货仓库存（件） */
  goods = GOODS_START;
  /** 累计出口创汇（G） */
  exportTotal = 0;
  /** 在颁布法令 */
  ords = new Set<string>();
  /** 当前游客人数（快照回写；引擎同步给行人系统） */
  tourists = 0;
  private goodsWarned = false;

  // ---- v11：出口市场（随行就市 / 惜售囤货）----
  /** 出口市价系数（0.55..1.55；1 = 基准价；随机游走 + 均值回归） */
  mkt = 1;
  private mktPrev = 1;
  private mktTimer = 0;
  /** 惜售囤货：暂停自动出口，囤货待涨（货仓满后生产滞销） */
  exportHold = false;

  hasOrd(id: string): boolean { return this.ords.has(id); }

  /** 颁布 / 废止法令（等级或条件不满足时锁定） */
  toggleOrd(id: string): 'on' | 'off' | 'lock' {
    const o = ORDS.find(x => x.id === id);
    if (!o) return 'lock';
    if (!this.ords.has(id)) {
      if (this.level < o.lv) return 'lock';
      const s = this.snap;
      if (o.req && (!s || !o.req(s))) return 'lock';
      this.ords.add(id);
      this.sfx?.('level');
      this.msg?.(`颁布「${o.name}」：${o.desc}${o.cost > 0 ? `（行政开支 ${o.cost}G/分）` : ''}`);
      return 'on';
    }
    this.ords.delete(id);
    this.sfx?.('buy');
    this.msg?.(`废止「${o.name}」，相关效果随之解除`);
    return 'off';
  }

  private snap: Snap | null = null;
  private incomeParts = { tax: 0, com: 0, ind: 0, tour: 0, exp: 0 };
  private famineWarned = false;
  private histAcc = 0;

  /** 设置税率（0..20 整数）；返回实际生效值 */
  setTaxRate(r: number): number {
    this.taxRate = Math.max(TAX_MIN, Math.min(TAX_MAX, Math.round(r)));
    return this.taxRate;
  }

  // ---------------- 科技 ----------------

  has(tech: string): boolean { return this.techs.has(tech); }

  /** 道路单价（物流网络 −50%） */
  roadCost(): number { return this.has('logistic') ? Math.ceil(ROAD_COST * 0.5) : ROAD_COST; }

  /** v6 跨水桥单价（物流网络 −40%） */
  bridgeCost(): number { return this.has('logistic') ? Math.ceil(BRIDGE_COST * 0.6) : BRIDGE_COST; }

  /** 建筑所需科技（null = 无门禁） */
  techGateOf(id: string): string | null { return TECH_GATE[id] ?? null; }

  /** 研究科技：检查前置 / 智慧 / 点数 → 扣点入档 */
  research(id: string): 'ok' | 'sp' | 'lock' | 'none' {
    const t = TECHS.find(x => x.id === id);
    if (!t || this.techs.has(id)) return 'none';
    const s = this.snap;
    const wis = s?.wisdom ?? 0;
    const missing = t.req.filter(r => !this.techs.has(r));
    if (missing.length || (t.wis !== undefined && wis < t.wis)) return 'lock';
    if (this.sp < t.cost) return 'sp';
    this.sp -= t.cost;
    this.techs.add(id);
    this.addXp(30 + t.tier * 15);
    this.sfx?.('level');
    this.msg?.(`研究完成「${t.name}」：${t.desc}`);
    return 'ok';
  }

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

  /** 建筑能否在此放置（经营规则：等级 / 科技 / 领地 / 金币+整地费） */
  gateBuild(id: string, tx: number, ty: number, fee = 0): 'ok' | 'locked' | 'tech' | 'coins' | 'land' {
    const e = ECON[id];
    if (!e) return 'ok';
    if (e.unlock > this.level) return 'locked';
    const gate = TECH_GATE[id];
    if (gate && !this.techs.has(gate)) return 'tech';
    const d = defById(id);
    for (let dy = 0; dy < d.h; dy++) {
      for (let dx = 0; dx < d.w; dx++) {
        if (!this.ownedAt(tx + dx, ty + dy)) return 'land';
      }
    }
    if (this.coins < e.cost + fee) return 'coins';
    return 'ok';
  }

  /** 放置成功后扣费（含整地费）+ 经验 */
  payBuild(id: string, fee = 0): void {
    const e = ECON[id];
    if (!e) return;
    const d = defById(id);
    this.coins -= e.cost + fee;
    this.addXp(Math.round(d.w * d.h * 6 + (e.cost + fee) / 20));
  }

  refundBuild(id: string): number {
    const e = ECON[id];
    if (!e || e.cost <= 0) return 0;
    const back = Math.round(e.cost * REFUND_RATE);
    this.coins += back;
    return back;
  }

  refundRoad(bridge = false): number {
    const back = bridge ? BRIDGE_REFUND : ROAD_REFUND;
    this.coins += back;
    return back;
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
      const bonus = this.level * 26;
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
    let hasLib = 0, hasGreen = 0, foodProd = 0, foodCap = FOOD_BASE_CAP, eduCap = 0, spRaw = 0, culSup = 0;
    let hospitals = 0, firestations = 0;
    let hasWaterTower = 0, waterCapT = 0;
    let busStops = 0, ferries = 0;
    let tramStops = 0, railHubs = 0;   // v11 轨道交通
    // v10：货物 / 旅游累计器
    let goodsP = 0, goodsC = 0, goodsCapV = GOODS_BASE_CAP;
    let hotelBeds = 0, attract = 0, ports = 0;
    const upkFarm = { v: 0 }, upkInd = { v: 0 };
    // v6 水务设施清单（覆盖半径）与住宅清单（覆盖人口统计）
    const waterFacs: Array<{ x: number; y: number; r: number }> = [];
    const resList: Array<{ x: number; y: number; pop: number }> = [];

    for (const o of map.objs.values()) {
      const d = defById(o.id);
      const e = ECON[o.id];
      buildings++;
      if (d.cat === 'res') {
        res++; cap += d.pop;
        resList.push({ x: o.ax + d.w / 2, y: o.ay + d.h / 2, pop: d.pop });
      } else if (d.cat === 'com') {
        com++; jobs += d.pop;
        // 城市名片：文旅商业收入 +20%
        const brandB = this.has('brand') &&
          ['hotel', 'mall', 'ferris', 'aquarium', 'cinema', 'castle'].includes(o.id);
        earnCom += (e?.earn ?? 0) * (brandB ? 1.2 : 1);
        if (o.id === 'ferris') park++;
      } else if (d.cat === 'ind') {
        ind++; jobs += d.pop;
        earnInd += (e?.earn ?? 0) * (this.has('metal') ? 1.2 : 1);
        if (o.id === 'power' || o.id === 'windmill') hasPower = 1;
        if (o.id === 'greenhouse') hasGreen = 1;
      } else {
        civ++;
        if (o.id === 'park') park++;
        if (o.id === 'school') hasSchool = 1;
        if (o.id === 'library') hasLib = 1;
        if (o.id === 'hospital') { hasHospital = 1; hospitals++; }
        if (o.id === 'firestation') firestations++;
      }
      // v6 水务设施：登记覆盖圆心（半径含足迹）
      if (e?.waterR) {
        waterFacs.push({ x: o.ax + d.w / 2, y: o.ay + d.h / 2, r: e.waterR });
        waterCapT += e.waterCap ?? 0;
        if (o.id === 'watertower') hasWaterTower = 1;
      }
      if (o.id === 'tower') hasTower = 1;
      // v7 公交 / 航运设施计数
      if (o.id === 'busstop') busStops++;
      if (o.id === 'ferry') ferries++;
      if (o.id === 'tramstop') tramStops++;      // v11
      if (o.id === 'railhub') railHubs++;
      // v10：货物供应链 / 旅游设施
      if (e?.goodsP) goodsP += e.goodsP;
      if (e?.goodsC) goodsC += e.goodsC;
      if (e?.goodsCap) goodsCapV += e.goodsCap;
      const at = ATTRACT[o.id];
      if (at) attract += at;
      if (o.id === 'hotel') hotelBeds += 160;
      if (o.id === 'minshuku') hotelBeds += 24;
      if (o.id === 'dock' || o.id === 'ferry') ports++;
      const pw = e?.power ?? 0;
      if (pw < 0) powerSup += -pw; else powerDem += pw;
      // 公共医疗：医院宜居 +3
      amenitySup += (e?.amenity ?? 0) + (this.has('health') && o.id === 'hospital' ? 3 : 0);
      pollute += e?.pollute ?? 0;
      const up = e?.upk ?? 0;
      upk += up;
      // 分桶维护费（轮作制度 / 自动化产线 折扣）
      if (['greenhouse', 'silo', 'windmill'].includes(o.id)) upkFarm.v += up;
      else if (d.cat === 'ind') upkInd.v += up;
      // ---- 民生产量 ----
      if (e?.food) foodProd += e.food;
      if (e?.foodCap) foodCap += e.foodCap;
      if (e?.edu) eduCap += e.edu * (o.id === 'school' && this.has('compul') ? 1.4 : 1);
      if (e?.sp) spRaw += e.sp;
      // v8 文化点：城市名片科技让文旅建筑供给 +25%
      if (e?.cul) culSup += e.cul * (this.has('brand') ? 1.25 : 1);
    }
    // v11 电车干线：牵引整流所用电 +16MW（两站起开通）
    if (tramStops >= 2) powerDem += 16;
    // 科技倍率
    if (this.has('irrig')) foodProd *= 1.3;
    if (this.has('vfarm')) foodProd *= 1.5;
    if (this.has('granary')) foodCap *= 2;
    if (this.has('croprot')) upk -= upkFarm.v * 0.4;
    if (this.has('auto')) upk -= upkInd.v * 0.25;
    if (this.has('poweng')) powerSup = Math.round(powerSup * 1.25);
    if (this.has('green')) pollute *= 0.7;
    // v10 法令：环保条例减排 / 有机农业维护上浮
    if (this.hasOrd('ecolaw')) pollute *= 0.72;
    if (this.hasOrd('organic')) upk += upkFarm.v * 0.25;

    // ---- v5：随机事件乘数（连乘各活动事件）+ 天气修正 ----
    let multCom = 1, multInd = 1, multFood = 1, multPower = 1, multTraffic = 1, multSp = 1, multTour = 1, multExp = 1;
    let eventHap = 0, eventAmenity = 0;
    for (const ev of this.events) {
      if (ev.mult.com) multCom *= ev.mult.com;
      if (ev.mult.ind) multInd *= ev.mult.ind;
      if (ev.mult.food) multFood *= ev.mult.food;
      if (ev.mult.power) multPower *= ev.mult.power;
      if (ev.mult.traffic) multTraffic *= ev.mult.traffic;
      if (ev.mult.sp) multSp *= ev.mult.sp;
      if (ev.mult.tour) multTour *= ev.mult.tour;
      if (ev.mult.exp) multExp *= ev.mult.exp;   // v11 出口单价事件乘数
      if (ev.mult.amenity) eventAmenity += ev.mult.amenity;
      eventHap += ev.hap;
    }
    let weatherHap = 0;
    const wt = this.weather;
    if (wt.kind === 'rain') {
      multFood *= 1 + 0.30 * wt.t;          // 雨水滋养：粮食 +30%
      multCom *= 1 - 0.12 * wt.t;           // 客流减少：商业 −12%
      weatherHap -= 3 * wt.t;
    } else if (wt.kind === 'snow') {
      multCom *= 1 - 0.15 * wt.t;           // 雪天游客稀少
      multTraffic *= 1 - 0.20 * wt.t;       // 雪天路滑
      weatherHap -= 5 * wt.t;
    } else if (wt.kind === 'clear') {
      multCom *= 1.04;                      // 晴天生意兴隆
      weatherHap += 2;
    }
    // ---- v6 季节联动：粮产 / 商业 / 用电 / 情绪 ----
    const sn = SEASONS[Math.max(0, Math.min(3, this.season))];
    foodProd *= sn.food;
    multCom *= sn.com;
    powerDem *= sn.powerDem;                 // 夏空调 / 冬取暖抬升用电
    // v10 法令：节能令 / 夜间经济 / 有机农业
    if (this.hasOrd('energy')) powerDem *= 0.88;
    if (this.hasOrd('night')) powerDem *= 1.06;
    if (this.hasOrd('organic')) foodProd *= 1.18;
    const seasonHap = sn.hap;
    foodProd *= multFood;
    earnCom *= multCom;
    earnInd *= multInd;
    spRaw *= multSp;
    // v10 法令：夜间经济 / 消费券 / 环保条例
    if (this.hasOrd('night')) earnCom *= 1.10;
    if (this.hasOrd('voucher')) earnCom *= 1.15;
    if (this.hasOrd('ecolaw')) earnInd *= 0.93;

    const pop = this.pop;
    const amenityNeed = Math.ceil(pop / 18 * (this.hasOrd('welcome') ? 1.1 : 1));
    const polluteNet = Math.max(0, pollute - park * 1.5);
    const powerMult = (powerDem > 0 ? Math.min(1, powerSup / powerDem) : 1) * multPower;
    const roadsTotal = map.roadList().length;

    // 宜居度 v4：设施供需 + 供电（污染剥离至独立的环境指数）；v5 + 事件加成
    const livability = Math.max(0, Math.min(100, Math.round(
      50 + 2.2 * (amenitySup + eventAmenity - amenityNeed) + (powerMult >= 1 ? 4 : -10),
    )));

    // 粮食：产量 − 消耗 → 库存与安全指数
    const foodEat = pop * EAT_PER_POP;
    const foodNet = foodProd - foodEat;
    const famine = this.food <= 0.5 && foodNet < 0 && pop >= 2 ? 1 : 0;
    let foodIdx: number;
    if (pop < 2) foodIdx = 80;
    else if (famine) foodIdx = 0;
    else if (foodNet >= 0) foodIdx = Math.round(65 + 35 * Math.min(1, this.food / Math.max(1, foodCap)));
    else foodIdx = Math.round(65 * Math.min(1, this.food / Math.max(1, foodCap)));
    foodIdx = Math.max(0, Math.min(100, foodIdx));

    // 就业
    const workers = pop * 0.62;
    const staffing = jobs > 0 ? Math.min(1, workers / jobs) : 1;
    const jobIdx = Math.round(staffing * 100);

    // ---- v4 综合指数族 ----
    // 环境：污染净额 → 指数化（越高越好；每净污染点扣 9 分）
    const envIdx = Math.max(0, Math.min(100, Math.round(100 - polluteNet * 9)));
    // 健康：病床覆盖（每院 450 床 + 市政厅 50；公共医疗 +20%）
    const beds = (hospitals * 450 + 50) * (this.has('health') ? 1.2 : 1);
    const healthIdx = pop < 8 ? 80 : Math.max(0, Math.min(100, Math.round(100 * Math.min(1, beds / pop))));
    // 安全：消防救援覆盖（每站 550 人 + 基础 100）
    const shields = firestations * 550 + 100;
    const safetyIdx = pop < 8 ? 80 : Math.max(0, Math.min(100, Math.round(100 * Math.min(1, shields / pop)) + (this.hasOrd('patrol') ? 15 : 0)));
    // 交通：路网密度（每 3 栋建筑配 1 格道路为满配）；v5 雪天 / 暴风雨折扣
    // v7 公交加成：每座车站 +4（上限 +15）——巴士分担通勤压力，路网不足也能达标
    const busBonus = (pop >= 10 ? Math.min(15, busStops * 4) : 0) + (this.hasOrd('transit') ? 10 : 0);
    // v11 电车干线：每站交通 +3（上限 +12；两站起算 —— 巴士是骨架，电车是大动脉）
    const tramBonus = tramStops >= 2 ? Math.min(12, tramStops * 3) : 0;
    const trafficIdx = buildings > 0
      ? Math.max(0, Math.min(100, Math.round(
          roadsTotal * 100 / (buildings * 3) * multTraffic) + busBonus + tramBonus))
      : 100;

    // 智慧：教育容量覆盖人口的比率（图书馆 / 学校 / 博物馆…）
    const wisdom = Math.max(0, Math.min(100, Math.round(60 * eduCap / Math.max(pop, 15))));

    // ---- v8 文化指数：文旅供给 vs 人口需求（每 22 人 1 文化点为满配）----
    const cultureNeed = Math.ceil(pop / 22);
    const cultureSup = culSup;
    const cultureIdx = pop < 2
      ? 80
      : Math.max(0, Math.min(100, Math.round(100 * Math.min(1, cultureSup / Math.max(1, cultureNeed)))));

    // ---- v8 科研指数：智慧（教育覆盖）与科技产出率的综合 ----
    //   spRate = spRaw × (0.5 + wisdom/100)：科研速率；0.55×智慧 + 0.45×产出
    const spRateNow = spRaw * (0.5 + wisdom / 100);
    const sciIdx = Math.max(0, Math.min(100, Math.round(
      0.55 * wisdom + 0.45 * Math.min(100, spRateNow * 15))));

    // ---- v6 供水覆盖：半径内住宅人口占比 × 总容量/总人口 ----
    let waterIdx = 100;
    if (pop >= 2 && resList.length) {
      let coveredPop = 0;
      let resPopAll = 0;
      for (const rb of resList) {
        resPopAll += rb.pop;
        for (const f of waterFacs) {
          if (Math.max(Math.abs(rb.x - f.x), Math.abs(rb.y - f.y)) <= f.r) {
            coveredPop += rb.pop;
            break;
          }
        }
      }
      const coverShare = resPopAll > 0 ? coveredPop / resPopAll : 1;
      const capFactor = Math.min(1, waterCapT / Math.max(1, pop));
      waterIdx = Math.max(0, Math.min(100, Math.round(100 * coverShare * capFactor)));
    }

    // ---- v6 跨水桥格数（任务 / 成就）----
    let bridgeTiles = 0;
    const rl = map.road;
    for (let i = 0; i < rl.length; i++) if (rl[i] === 2) bridgeTiles++;

    // ---- v10 法令汇总（情绪 / 迁入 / 行政开支）----
    let ordCost = 0;
    for (const o of ORDS) if (this.ords.has(o.id)) ordCost += o.cost;
    const ordHap = (this.hasOrd('energy') ? -2 : 0) + (this.hasOrd('night') ? 1 : 0) +
      (this.hasOrd('patrol') ? 1 : 0) + (this.hasOrd('welcome') ? -1 : 0);
    const migMult = (this.hasOrd('welcome') ? 1.28 : 1) * (this.hasOrd('transit') ? 1.12 : 1);

    // 幸福 v8：九维加权（宜居 24 / 粮食 15 / 就业 12 / 供水 11 / 文化 9 / 环境 9 /
    //   健康 7 / 安全 6 / 交通 7；权重和 = 100）
    //   + 税率情绪 + 饥荒打击；v5 + 事件 / 天气情绪；v6 + 季节情绪；v10 + 法令情绪
    const famineHit = famine ? (this.has('granary') ? 12 : 25) : 0;
    const mood = taxMood(this.taxRate);
    const happiness = Math.max(5, Math.min(100, Math.round(
      0.24 * livability + 0.15 * foodIdx + 0.12 * jobIdx + 0.11 * waterIdx + 0.09 * cultureIdx +
      0.09 * envIdx + 0.07 * healthIdx + 0.06 * safetyIdx + 0.07 * trafficIdx + mood + weatherHap + eventHap + seasonHap + ordHap
      + (tramStops >= 2 ? 2 : 0) - famineHit)));   // v11 电车干线通车：出行体面 +2 幸福
    const happyMult = 0.6 + happiness / 125;

    // ---- v10 旅游：景点吸引力 × 文化/幸福 × 季节/天气 → 游客（酒店床位为接待上限）----
    const weatherTourK = wt.kind === 'clear' ? 1.15 : wt.kind === 'cloudy' ? 1.0 : wt.kind === 'rain' ? 0.7 : 0.6;
    const seasonTourK = [1.1, 1.25, 1.15, 0.55][Math.max(0, Math.min(3, this.season))];
    const appeal = attract * (0.6 + 0.4 * cultureIdx / 100) * (0.5 + 0.5 * happiness / 100);
    const capVisit = hotelBeds * 2 + 30;
    const tourists = attract < 1 ? 0
      : Math.min(capVisit, appeal * seasonTourK * weatherTourK * multTour);
    const tourIdx = Math.max(0, Math.min(100, Math.round(attract * 2.4)));

    // ---- v10 货物供应链：工业产货 → 零售上货 → 港口外销 ----
    const goodsProd = (goodsP + GOODS_TRICKLE) * staffing * powerMult;
    const goodsCons = goodsC + tourists * 0.008;           // 游客也买货架上的货
    const goodsSelf = goodsProd / Math.max(0.01, goodsCons);
    const stockRatio = Math.min(1, this.goods / Math.max(1, goodsCapV));
    const goodsSupply = Math.min(1, goodsSelf + 0.25 * stockRatio);
    const goodsMult = 0.55 + 0.45 * goodsSupply;           // 供货率 → 商业收入折扣
    const goodsIdx = Math.round(100 * goodsSupply);
    const goodsNet = goodsProd - goodsCons;
    earnCom *= goodsMult;
    // v11 出口：货仓 >80% 且产大于销 → 港口 2.2 / 铁路 4.0 件/分·座（惜售囤货时暂停外销）
    const expThroughput = 2.2 * ports + 4.0 * railHubs;
    const exportRate = (ports + railHubs) > 0 && goodsNet > 0 && stockRatio >= 0.8 && !this.exportHold
      ? Math.min(goodsNet, expThroughput) : 0;
    // v11 出口单价：基准 × 市价 × 事件 × 冶金加成
    const expPrice = EXPORT_PRICE * this.mkt * multExp * (this.has('metal') ? 1.25 : 1);

    // 城市评级 v8：十二维综合（权重和 = 1；S≥90 / A≥80 / B≥70 / C≥55 / D≥40）
    //   幸福 0.20 / 宜居 0.12 / 粮 0.10 / 就业 0.10 / 供水 0.075 / 智慧 0.07 /
    //   文化 0.07 / 环境 0.08 / 健康 0.06 / 安全 0.05 / 交通 0.035 / 科研 0.04
    const rating = Math.max(0, Math.min(100, Math.round(
      0.20 * happiness + 0.12 * livability + 0.10 * foodIdx + 0.10 * jobIdx + 0.075 * waterIdx +
      0.07 * wisdom + 0.07 * cultureIdx + 0.08 * envIdx + 0.06 * healthIdx + 0.05 * safetyIdx +
      0.035 * trafficIdx + 0.04 * sciIdx)));

    let chunks = 0;
    for (let i = 0; i < this.own.length; i++) chunks += this.own[i];
    return {
      pop, cap, buildings, chunks, happiness, level: this.level,
      roads: this.roadsBuilt, trees: this.treesPlanted, dozed: this.dozed,
      res, com, ind, civ, park, hasPower, hasSchool, hasHospital, hasTower,
      hasLib, hasGreen, techsN: this.techs.size, famine,
      employIdx: jobIdx, envIdx, healthIdx, safetyIdx, trafficIdx, rating,
      hasWaterTower, waterIdx, bridgeTiles,
      busStops, ferries, busBonus, tramStops, railHubs, tramBonus,
      jobs, earnCom, earnInd, upk, powerSup, powerDem, amenitySup, pollute,
      happyMult, staffing, powerMult,
      foodProd, foodCap, foodEat, foodNet, eduCap, spRaw, wisdom, livability,
      foodIdx, jobIdx,
      hospitals, firestations, roadsTotal, taxMoodV: mood,
      eventHap, eventAmenity, multCom, multInd, multFood, multPower, multTraffic, multSp,
      weather: { kind: wt.kind, t: wt.t },
      season: this.season, seasonHap,
      waterCapT,
      cultureSup, cultureNeed, cultureIdx, sciIdx,
      // ---- v10 ----
      tourists, exportEarn: this.exportTotal, ports,
      ordsN: this.ords.size, goodsIdx,
      goodsP: goodsProd, goodsC: goodsCons, goodsCap: goodsCapV, goodsNet,
      exportRate, beds: hotelBeds, attract, tourIdx,
      multTour, multExp, expPrice, ordCost, ordHap, migMult,
    };
  }

  // ---------------- 每帧心跳 ----------------

  tick(dt: number, map: CityMap): void {
    const s = this.snapOf(map);
    this.snap = s;

    // 累计游戏时长 + 城市历史采样（每 HIST_SAMPLE 秒一点，滑窗 HIST_MAX）
    this.playtime += dt;
    this.histAcc += dt;
    if (this.histAcc >= HIST_SAMPLE) {
      this.histAcc = 0;
      this.hist.push({
        t: Math.round(this.playtime),
        pop: Math.floor(this.pop),
        coins: Math.floor(this.coins),
        net: this.incomeParts.tax + this.incomeParts.com + this.incomeParts.ind + this.incomeParts.tour + this.incomeParts.exp - s.upk - s.ordCost,
        hap: s.happiness,
      });
      if (this.hist.length > HIST_MAX) this.hist.splice(0, this.hist.length - HIST_MAX);
    }

    // v11 出口市价：随机游走 + 均值回归（每 3 秒一步；55%..155%）
    this.mktTimer -= dt;
    if (this.mktTimer <= 0) {
      this.mktTimer = 3;
      this.mktPrev = this.mkt;
      this.mkt = Math.max(EXPORT_MKT_MIN, Math.min(EXPORT_MKT_MAX,
        this.mkt + (Math.random() - 0.5) * 0.13 + (1 - this.mkt) * 0.045));
    }
    // 收入 − 维护（G/分 → 按秒累积；可能为负 = 赤字，需拆除减负）
    // 税收 v4：可调税率（0-20%）驱动，高税多金但市民不满
    const tax = this.pop * (this.taxRate / 100) * (this.has('taxref') ? 1.15 : 1) * s.happyMult * s.powerMult;
    const com = s.earnCom * (this.has('finhub') ? 1.15 : 1) * s.staffing * s.powerMult;
    const ind = s.earnInd * s.staffing * s.powerMult;
    // v10：旅游消费 + 港口出口 − 法令行政开支
    const tour = s.tourists * TOUR_SPEND * (this.has('brand') ? 1.2 : 1);
    const exp = s.exportRate * s.expPrice;   // v11：市价 × 事件 × 冶金已并入单价
    this.coins += (tax + com + ind + tour + exp - s.upk - s.ordCost) * dt / 60;
    this.exportTotal += exp * dt / 60;
    this.tourists = s.tourists;
    this.incomeParts = { tax, com, ind, tour, exp };

    // 粮仓：产量 − 口粮，入库 / 出库（库存夹在 [0, cap]）
    this.food = Math.max(0, Math.min(s.foodCap, this.food + s.foodNet * dt / 60));
    if (s.famine && !this.famineWarned) {
      this.famineWarned = true;
      this.msg?.('饥荒！粮仓见底：市民正在挨饿迁离，快建温室大棚');
    } else if (!s.famine) this.famineWarned = false;

    // v10 货仓：产 − 销 − 出口（库存夹在 [0, cap]）
    this.goods = Math.max(0, Math.min(s.goodsCap, this.goods + (s.goodsNet - s.exportRate) * dt / 60));
    if (s.goodsIdx < 45 && s.goodsC > 1.2 && !this.goodsWarned) {
      this.goodsWarned = true;
      this.msg?.('货物短缺！商店缺货、商业收入大打折扣 —— 建工厂/木材厂扩大产能');
    } else if (s.goodsIdx >= 45) this.goodsWarned = false;

    // 科技点累积（教育设施 × 智慧加成）
    this.sp += s.spRaw * (0.5 + s.wisdom / 100) * (this.has('higher') ? 1.35 : 1) * dt / 60;

    // 人口迁移：幸福度低会搬离；饥荒加速流失；不足容量时渐进迁入（v6：缺水城市吸引力打折）
    const waterGrow = 0.55 + 0.45 * Math.min(1, s.waterIdx / 60);   // 供水越差迁入越慢
    if (s.famine) {
      this.pop = Math.max(0, this.pop - Math.max(0.15, this.pop * 0.002) * dt);
    } else if (this.pop < s.cap) {
      if (s.happiness < 25) {
        this.pop = Math.max(0, this.pop - 0.3 * dt);
      } else {
        const rate = (0.0045 + 0.006 * (s.happiness / 100)) * (this.has('health') ? 1.2 : 1) * waterGrow * s.migMult;
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

    // ---- v5：随机事件调度（人口 ≥ 30 后启动；最多同时 2 个）----
    this.eventTimer -= dt;
    if (this.eventTimer <= 0) {
      this.eventTimer = 110 + Math.random() * 60;
      if (this.pop >= 30 && this.events.length < 2) this.rollEvent(map, s);
    }
    // 事件到期结算
    for (let i = this.events.length - 1; i >= 0; i--) {
      const ev = this.events[i];
      ev.left -= dt;
      if (ev.left <= 0) {
        this.events.splice(i, 1);
        this.msg?.(`「${ev.name}」结束，城市恢复如常`);
      }
    }

    // ---- v5：成就检查（每 2 秒一次）----
    this.achvTimer -= dt;
    if (this.achvTimer <= 0) {
      this.achvTimer = 2;
      for (const a of ACHIEVEMENTS) {
        if (this.achv.has(a.id)) continue;
        if (a.val(s, this) >= a.goal) {
          this.achv.add(a.id);
          this.sfx?.('level');
          this.msg?.(`成就解锁「${a.name}」：${a.desc}`);
        }
      }
    }
  }

  /** 掷骰触发一个随机事件（按条件权重抽取；新手期灾害减半） */
  private rollEvent(map: CityMap, s: Snap): void {
    const rookie = this.pop < 80;                       // 新手保护：灾害权重减半
    const pool = EVENT_TPLS.map(t => ({
      t, w: t.w(s, this) * (t.kind === 'bad' && rookie ? 0.5 : 1),
    })).filter(x => x.w > 0);
    if (!pool.length) return;
    let sum = 0;
    for (const p of pool) sum += p.w;
    let r = Math.random() * sum;
    let pick = pool[0].t;
    for (const p of pool) { r -= p.w; if (r <= 0) { pick = p.t; break; } }
    if (this.events.some(e => e.key === pick.key)) return;   // 同事件不叠加

    // 一次性结算
    let result = '';
    if (pick.fire) result = pick.fire(this, s) ?? '';
    if (pick.key === 'storm') this.weatherReq = 'rain';       // 暴风雨：engine 侧强制雨天

    // 事故现场：从已购领地内挑一栋建筑
    let fx: { x: number; y: number } | undefined;
    if (pick.fx) {
      const cands = [...map.objs.values()].filter(o =>
        o.id !== 'cityhall' && this.ownedAt(o.ax, o.ay));
      if (cands.length) {
        const o = cands[(Math.random() * cands.length) | 0];
        fx = { x: o.ax, y: o.ay };
      }
    }

    // 日志（即时事件不入活动列表）
    const stamp = Math.floor(this.playtime);
    this.eventLog.push({ t: stamp, name: pick.name, kind: pick.kind, result });
    if (this.eventLog.length > 12) this.eventLog.splice(0, this.eventLog.length - 12);

    if (pick.dur > 0) {
      this.events.push({
        key: pick.key, name: pick.name, note: pick.note, kind: pick.kind,
        left: pick.dur, dur: pick.dur, hap: pick.hap, mult: pick.mult, fx,
      });
      this.sfx?.(pick.kind === 'bad' ? 'error' : 'coin');
      this.msg?.(`${pick.kind === 'bad' ? '⚠' : '✦'} 事件「${pick.name}」：${pick.note}${result ? ' · ' + result : ''}`);
    } else if (result) {
      this.sfx?.('coin');
      this.msg?.(`${pick.name}：${result}`);
    }
  }

  /** UI 视图（未 tick 前用缓存） */
  view(): EconView {
    const s = this.snap;
    const done = this.questIdx >= QUESTS.length;
    const q = QUESTS[Math.min(this.questIdx, QUESTS.length - 1)];
    const qcur = done || !s ? (done ? q.goal : 0) : Math.min(q.goal, q.val(s));
    const spRate = s ? s.spRaw * (0.5 + s.wisdom / 100) * (this.has('higher') ? 1.35 : 1) : 0;
    return {
      coins: Math.floor(this.coins), pop: Math.floor(this.pop), cap: s?.cap ?? 0,
      level: this.level, xp: this.xp, xpMax: xpNeed(this.level),
      powerSup: s?.powerSup ?? 0, powerDem: s?.powerDem ?? 0,
      happiness: s?.happiness ?? 52,
      incomeTax: this.incomeParts.tax,
      incomeCom: this.incomeParts.com,
      incomeInd: this.incomeParts.ind,
      income: this.incomeParts.tax + this.incomeParts.com + this.incomeParts.ind + this.incomeParts.tour + this.incomeParts.exp,
      incomeUpk: s?.upk ?? 0,
      incomeNet: this.incomeParts.tax + this.incomeParts.com + this.incomeParts.ind + this.incomeParts.tour + this.incomeParts.exp - (s?.upk ?? 0) - (s?.ordCost ?? 0),
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
      food: Math.floor(this.food), foodCap: s?.foodCap ?? FOOD_BASE_CAP,
      foodProd: s?.foodProd ?? 0, foodEat: s?.foodEat ?? 0,
      foodNet: s?.foodNet ?? 0, famine: s?.famine ?? 0,
      wisdom: s?.wisdom ?? 0, eduCap: s?.eduCap ?? 0,
      sp: Math.floor(this.sp), spRate,
      livability: s?.livability ?? 50,
      techs: [...this.techs],
      // ---- v4 ----
      taxRate: this.taxRate, taxMood: taxMood(this.taxRate),
      employIdx: s?.employIdx ?? 100, envIdx: s?.envIdx ?? 100,
      healthIdx: s?.healthIdx ?? 80, safetyIdx: s?.safetyIdx ?? 80,
      trafficIdx: s?.trafficIdx ?? 100,
      rating: s?.rating ?? 0, ratingGrade: ratingGrade(s?.rating ?? 0),
      hospitals: s?.hospitals ?? 0, firestations: s?.firestations ?? 0,
      playtime: Math.floor(this.playtime),
      hist: this.hist,
      // ---- v5 ----
      weather: s?.weather ?? { kind: 'clear', t: 0 },
      events: this.events.map(e => ({
        key: e.key, name: e.name, note: e.note, kind: e.kind,
        left: Math.ceil(e.left), dur: e.dur,
      })),
      eventLog: this.eventLog.slice(-8),
      achv: ACHIEVEMENTS.map(a => ({
        id: a.id, name: a.name, desc: a.desc, icon: a.icon,
        got: this.achv.has(a.id),
        cur: Math.min(a.goal, s ? a.val(s, this) : 0), goal: a.goal,
      })),
      achvGot: this.achv.size,
      // ---- v6 ----
      season: this.season,
      waterIdx: s?.waterIdx ?? 100,
      waterCapT: s?.waterCapT ?? 0,
      hasWaterTower: s?.hasWaterTower ?? 0,
      bridgeTiles: s?.bridgeTiles ?? 0,
      // ---- v7 ----
      busStops: s?.busStops ?? 0,
      ferries: s?.ferries ?? 0,
      busBonus: s?.busBonus ?? 0,
      // ---- v8 ----
      cultureSup: s?.cultureSup ?? 0,
      cultureNeed: s?.cultureNeed ?? 0,
      cultureIdx: s?.cultureIdx ?? 80,
      sciIdx: s?.sciIdx ?? 0,
      // ---- v10 ----
      goods: Math.floor(this.goods), goodsCap: s?.goodsCap ?? GOODS_BASE_CAP,
      goodsProd: s?.goodsP ?? 0, goodsCons: s?.goodsC ?? 0,
      goodsNet: s?.goodsNet ?? 0, goodsIdx: s?.goodsIdx ?? 100,
      exportRate: s?.exportRate ?? 0, exportTotal: Math.floor(this.exportTotal),
      ports: s?.ports ?? 0, tourists: Math.floor(this.tourists),
      tourIdx: s?.tourIdx ?? 0, beds: s?.beds ?? 0, attract: s?.attract ?? 0,
      incomeTour: this.incomeParts.tour, incomeExp: this.incomeParts.exp,
      ordCost: s?.ordCost ?? 0,
      ords: ORDS.map(o => ({
        id: o.id, name: o.name, desc: o.desc, cost: o.cost, lv: o.lv,
        reqNote: o.reqNote ?? '',
        on: this.ords.has(o.id),
        lockLv: this.level < o.lv,
        reqOk: !o.req || (!!s && o.req(s)),
      })),
      // ---- v11 ----
      tramStops: s?.tramStops ?? 0,
      railHubs: s?.railHubs ?? 0,
      tramBonus: s?.tramBonus ?? 0,
      mkt: this.mkt,
      mktTrend: this.mkt - this.mktPrev,
      expPrice: s?.expPrice ?? EXPORT_PRICE,
      exportHold: this.exportHold,
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

  /** 新游戏：随机地图（含山脉高度场）+ 中央 4 块领地整平 + 市政厅 */
  newGame(map: CityMap): void {
    map.random((Math.random() * 1e9) | 0);
    map.beginUpdate();
    // 初始 4 块领地（格 112..143）整平为荒地草地（海拔 1）
    for (let ty = 112; ty < 144; ty++) {
      for (let tx = 112; tx < 144; tx++) {
        const i = map.idx(tx, ty);
        map.terr[i] = TERR_GRASS;
        map.tree[i] = -1;
        map.road[i] = 0;
        map.h[i] = 1;
      }
    }
    map.place('cityhall', 0, 127, 127, 1);
    map.endUpdate();
    this.coins = START_COINS;
    this.xp = 0;
    this.level = 1;
    this.pop = 0;
    this.food = 30;
    this.sp = 0;
    this.techs.clear();
    this.questIdx = 0;
    this.roadsBuilt = 0;
    this.treesPlanted = 0;
    this.dozed = 0;
    this.taxRate = TAX_DEFAULT;
    this.hist = [];
    this.histAcc = 0;
    this.playtime = 0;
    this.hall = { x: 127, y: 127 };
    // v5：事件 / 成就 / 天气重置
    this.events = [];
    this.eventLog = [];
    this.eventTimer = 130;
    this.achv.clear();
    this.achvTimer = 0;
    this.weather = { kind: 'clear', t: 0 };
    this.weatherReq = null;
    // v10：货物 / 旅游 / 法令重置
    this.goods = GOODS_START;
    this.exportTotal = 0;
    this.ords.clear();
    this.tourists = 0;
    this.goodsWarned = false;
    // v11 出口市场重置
    this.mkt = 1;
    this.mktPrev = 1;
    this.mktTimer = 0;
    this.exportHold = false;
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
      v: 8,
      coins: Math.round(this.coins), xp: this.xp, level: this.level,
      pop: this.pop, questIdx: this.questIdx,
      roads: this.roadsBuilt, trees: this.treesPlanted, dozed: this.dozed,
      food: Math.round(this.food), sp: Math.round(this.sp),
      techs: [...this.techs],
      taxRate: this.taxRate, playtime: Math.round(this.playtime),
      hist: this.hist.slice(-HIST_MAX),
      // v5：事件与成就
      events: this.events.map(e => ({
        key: e.key, left: Math.round(e.left),
        fx: e.fx ? [e.fx.x, e.fx.y] : undefined,
      })),
      eventLog: this.eventLog.slice(-12),
      achv: [...this.achv],
      // v6：季节
      season: this.season,
      // v10：货物 / 法令
      goods: Math.round(this.goods),
      exportTotal: Math.round(this.exportTotal),
      ords: [...this.ords],
      // v11：出口市场
      mkt: Math.round(this.mkt * 1000) / 1000,
      exportHold: this.exportHold,
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
    // v3 民生档：粮仓 / 科技点 / 已研究科技（旧档给保底）
    this.techs.clear();
    for (const t of (d.techs as string[]) ?? []) {
      if (TECHS.some(x => x.id === t)) this.techs.add(t);
    }
    // v4 指数档：税率 / 时长 / 历史（旧档给默认）
    this.taxRate = Math.max(TAX_MIN, Math.min(TAX_MAX, Math.round(Number(d.taxRate) || TAX_DEFAULT)));
    this.playtime = Math.max(0, Number(d.playtime) || 0);
    this.hist = [];
    if (Array.isArray(d.hist)) {
      for (const p of d.hist) {
        if (p && Number.isFinite(p.t) && Number.isFinite(p.pop) &&
            Number.isFinite(p.coins) && Number.isFinite(p.net) && Number.isFinite(p.hap)) {
          this.hist.push({ t: p.t, pop: p.pop, coins: p.coins, net: p.net, hap: p.hap });
        }
      }
    }
    if (this.hist.length > HIST_MAX) this.hist.splice(0, this.hist.length - HIST_MAX);
    // v5 事件档：进行中事件（从模板找回参数）/ 日志 / 成就（旧档给空）
    this.events = [];
    for (const e of (d.events as Array<{ key: string; left: number; fx?: [number, number] }>) ?? []) {
      const tpl = EVENT_TPLS.find(t => t.key === e.key);
      if (!tpl || !tpl.dur) continue;
      this.events.push({
        key: tpl.key, name: tpl.name, note: tpl.note, kind: tpl.kind,
        left: Math.max(1, Math.min(tpl.dur, Number(e.left) || tpl.dur)),
        dur: tpl.dur, hap: tpl.hap, mult: tpl.mult,
        fx: Array.isArray(e.fx) ? { x: e.fx[0], y: e.fx[1] } : undefined,
      });
    }
    this.eventLog = [];
    for (const l of (d.eventLog as EventLogItem[]) ?? []) {
      if (l && typeof l.name === 'string') {
        this.eventLog.push({ t: Number(l.t) || 0, name: l.name, kind: l.kind === 'good' ? 'good' : 'bad', result: String(l.result ?? '') });
      }
    }
    this.achv.clear();
    for (const a of (d.achv as string[]) ?? []) {
      if (ACHIEVEMENTS.some(x => x.id === a)) this.achv.add(a);
    }
    this.eventTimer = 60 + Math.random() * 60;
    this.weather = { kind: 'clear', t: 0 };
    this.weatherReq = null;
    // v6 季节档（旧档默认更替中的春季；engine 会同步时钟相位）
    this.season = Math.max(0, Math.min(3, Number(d.season) || 0));
    // v10 货物 / 法令档（旧档给默认）
    this.goods = Math.max(0, Number(d.goods) || GOODS_START);
    this.exportTotal = Math.max(0, Number(d.exportTotal) || 0);
    this.ords.clear();
    for (const oid of (d.ords as string[]) ?? []) {
      if (ORDS.some(x => x.id === oid)) this.ords.add(oid);
    }
    this.goodsWarned = false;
    // v11 出口市场档（旧档给默认基准价）
    this.mkt = Math.max(EXPORT_MKT_MIN, Math.min(EXPORT_MKT_MAX, Number(d.mkt) || 1));
    this.mktPrev = this.mkt;
    this.mktTimer = 0;
    this.exportHold = d.exportHold === true;
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
    const s = this.snapOf(map);
    const foodRaw = d.food === undefined ? s.foodCap * 0.5 : Number(d.food);
    this.food = Math.max(0, Math.min(s.foodCap, Number.isFinite(foodRaw) ? foodRaw : 0));
    this.sp = Math.max(0, Number(d.sp) || 0);
    // 离线收益：上限 4 小时（金融中心 8h），35% 速度（扣除维护费后净收益，不为负）
    const last = Number(d.last) || Date.now();
    const capH = this.has('finhub') ? 8 : 4;
    const mins = Math.min(capH * 60, Math.max(0, (Date.now() - last) / 60000));
    const tax = this.pop * (this.taxRate / 100) * (this.has('taxref') ? 1.15 : 1) * s.happyMult * s.powerMult;
    const com = s.earnCom * (this.has('finhub') ? 1.15 : 1) * s.staffing * s.powerMult;
    const tourInc = s.tourists * TOUR_SPEND * (this.has('brand') ? 1.2 : 1);
    const expInc = s.exportRate * s.expPrice;   // v11：单价已含市价/事件/冶金
    const perMin = tax + com + s.earnInd * s.staffing * s.powerMult + tourInc + expInc - s.upk - s.ordCost;
    const earned = Math.floor(Math.max(0, perMin) * mins * 0.30);
    if (earned > 0) this.coins += earned;
    // 离线粮仓同步（30% 速率结算，不出饥荒惩罚）
    this.food = Math.max(0, Math.min(s.foodCap, this.food + s.foodNet * mins * 0.30));
    this.sp += s.spRaw * (0.5 + s.wisdom / 100) * (this.has('higher') ? 1.35 : 1) * mins * 0.30;
    // v10 离线：货仓 settle + 游客数同步
    this.goods = Math.max(0, Math.min(s.goodsCap, this.goods + (s.goodsNet - s.exportRate) * mins * 0.30));
    this.tourists = s.tourists;
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
