#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v10 玩法扩展：tycoon.ts 货物供应链 + 旅游系统 + 市政法令（精准替换，逐项断言）"""
import sys

P = '/home/z/my-project/src/lib/pixelcity/tycoon.ts'
src = open(P, encoding='utf-8').read()
n0 = len(src)

def rep(old, new, cnt=1, tag=''):
    global src
    assert src.count(old) == cnt, f'[{tag}] expect {cnt} hit, got {src.count(old)}: {old[:60]!r}'
    src = src.replace(old, new, cnt)
    print(f'  ok  {tag}')

# ---------- 1. 常量 ----------
rep("export const SAVE_KEY = 'pxc_tycoon_v1';\nexport const MODE_KEY = 'pxc_mode_v1';",
"""export const SAVE_KEY = 'pxc_tycoon_v1';
export const MODE_KEY = 'pxc_mode_v1';
// ---- v10 货物供应链 / 旅游 / 法令 ----
export const GOODS_BASE_CAP = 100;     // 基础货仓容量（仓库每座 +80）
export const GOODS_START = 40;         // 开局货存
export const GOODS_TRICKLE = 0.8;      // 集市自产自销保底（早期小商业无需工厂）
export const EXPORT_PRICE = 1.35;      // 每单位货物出口价（冶金工艺 +25%）
export const TOUR_SPEND = 0.09;        // 每名游客每分钟消费 G""", tag='常量')

# ---------- 2. import ATTRACT ----------
rep("import { defById, CATALOG } from './catalog';",
    "import { defById, CATALOG, ATTRACT } from './catalog';", tag='import')

# ---------- 3. EconDef 字段 ----------
rep("""  waterR?: number;    // v6 供水半径（格；水塔/净水厂）
  waterCap?: number;  // v6 供水容量（覆盖人口上限）
};

const D = (
  cost: number, unlock: number,
  o: { earn?: number; power?: number; amenity?: number; pollute?: number; upk?: number;
    food?: number; foodCap?: number; edu?: number; sp?: number; cul?: number;
    waterR?: number; waterCap?: number } = {},
): EconDef => ({
  cost, unlock,
  earn: o.earn ?? 0, power: o.power ?? 0,
  amenity: o.amenity ?? 0, pollute: o.pollute ?? 0, upk: o.upk ?? 0,
  food: o.food, foodCap: o.foodCap, edu: o.edu, sp: o.sp, cul: o.cul,
  waterR: o.waterR, waterCap: o.waterCap,
});""",
"""  waterR?: number;    // v6 供水半径（格；水塔/净水厂）
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
});""", tag='EconDef')

# ---------- 4. ECON 建筑参数 ----------
econ = [
  ("minshuku: D(145, 6, { power: 3 })", "minshuku: D(145, 6, { power: 3, goodsC: 0.3 })"),
  ("shop: D(80, 1, { power: 3, earn: 4.2, upk: 1.2 })", "shop: D(80, 1, { power: 3, earn: 4.2, upk: 1.2, goodsC: 0.5 })"),
  ("conv: D(70, 1, { power: 2, earn: 3.3, upk: 1 })", "conv: D(70, 1, { power: 2, earn: 3.3, upk: 1, goodsC: 0.35 })"),
  ("hotel: D(1350, 7, { power: 22, earn: 44, upk: 9.6 })", "hotel: D(1350, 7, { power: 22, earn: 44, upk: 9.6, goodsC: 1.8 })"),
  ("mall: D(1250, 7, { power: 24, earn: 40, upk: 11.6 })", "mall: D(1250, 7, { power: 24, earn: 40, upk: 11.6, goodsC: 2.2 })"),
  ("izakaya: D(140, 4, { power: 3, earn: 5.5, upk: 1.6 })", "izakaya: D(140, 4, { power: 3, earn: 5.5, upk: 1.6, goodsC: 0.5 })"),
  ("cinema: D(780, 6, { power: 12, earn: 22, upk: 3.6, cul: 2 })", "cinema: D(780, 6, { power: 12, earn: 22, upk: 3.6, cul: 2, goodsC: 0.9 })"),
  ("market: D(90, 2, { power: 2, earn: 3.5, upk: 1 })", "market: D(90, 2, { power: 2, earn: 3.5, upk: 1, goodsC: 0.4 })"),
  ("electown: D(300, 6, { power: 5, earn: 9.2, upk: 1.9 })", "electown: D(300, 6, { power: 5, earn: 9.2, upk: 1.9, goodsC: 0.8 })"),
  ("ferris: D(550, 5, { power: 6, earn: 2.7, amenity: 2, upk: 1.7, cul: 2 })", "ferris: D(550, 5, { power: 6, earn: 2.7, amenity: 2, upk: 1.7, cul: 2, goodsC: 0.15 })"),
  ("bakery: D(80, 2, { power: 2, earn: 3.9, upk: 1.15 })", "bakery: D(80, 2, { power: 2, earn: 3.9, upk: 1.15, goodsC: 0.55 })"),
  ("gas: D(170, 2, { power: 2, earn: 5.5, upk: 1.3 })", "gas: D(170, 2, { power: 2, earn: 5.5, upk: 1.3, goodsC: 0.25 })"),
  ("factory: D(620, 5, { power: 14, earn: 30, pollute: 4, upk: 6.7 })", "factory: D(620, 5, { power: 14, earn: 30, pollute: 4, upk: 6.7, goodsP: 2.2 })"),
  ("warehouse: D(270, 6, { power: 6, earn: 9.4, pollute: 1, upk: 1.6 })", "warehouse: D(270, 6, { power: 6, earn: 9.4, pollute: 1, upk: 1.6, goodsP: 0.8, goodsCap: 80 })"),
  ("tankfarm: D(210, 5, { power: 5, earn: 7.5, pollute: 2, upk: 1.4 })", "tankfarm: D(210, 5, { power: 5, earn: 7.5, pollute: 2, upk: 1.4, goodsP: 1.0 })"),
  ("refinery: D(1050, 7, { power: 20, earn: 47, pollute: 6, upk: 10.4 })", "refinery: D(1050, 7, { power: 20, earn: 47, pollute: 6, upk: 10.4, goodsP: 3.5 })"),
  ("lumber: D(230, 3, { power: 6, earn: 11, pollute: 2, upk: 2.5 })", "lumber: D(230, 3, { power: 6, earn: 11, pollute: 2, upk: 2.5, goodsP: 1.4 })"),
  ("silo: D(140, 4, { power: 3, earn: 5.6, pollute: 1, upk: 1.3, food: 1.5, foodCap: 120 })", "silo: D(140, 4, { power: 3, earn: 5.6, pollute: 1, upk: 1.3, food: 1.5, foodCap: 120, goodsP: 0.6 })"),
  ("brewery: D(320, 4, { power: 8, earn: 10.8, pollute: 2, upk: 2.1 })", "brewery: D(320, 4, { power: 8, earn: 10.8, pollute: 2, upk: 2.1, goodsP: 1.6 })"),
  ("dock: D(560, 8, { power: 10, earn: 20.5, pollute: 3, upk: 3.5 })", "dock: D(560, 8, { power: 10, earn: 20.5, pollute: 3, upk: 3.5, goodsP: 1.2 })"),
]
for old, new in econ:
    rep(old, new, tag=f'ECON {old.split(":")[0].strip()}')

# ---------- 5. ORDS 定义 ----------
rep("""  dock: 'logistic',
  brewery: 'metal',
};""",
"""  dock: 'logistic',
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
];""", tag='ORDS')

# ---------- 6. 事件 mult 类型 + tour ----------
rep("  mult: { com?: number; ind?: number; food?: number; power?: number; traffic?: number; sp?: number; amenity?: number };",
    "  mult: { com?: number; ind?: number; food?: number; power?: number; traffic?: number; sp?: number; amenity?: number; tour?: number };",
    tag='mult 类型')

# ---------- 7. 新事件 ----------
rep("""      return `投资到账 +${gain}G`;
    },
  },
];""",
"""      return `投资到账 +${gain}G`;
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
];""", tag='新事件')

# ---------- 8. QS 类型扩展 ----------
rep("""  // ---- v7 公交 / 航运 ----
  busStops: number; ferries: number; busBonus: number;
};""",
"""  // ---- v7 公交 / 航运 ----
  busStops: number; ferries: number; busBonus: number;
  // ---- v10 货物 / 旅游 / 法令 ----
  tourists: number; exportEarn: number; ports: number;
  ordsN: number; goodsIdx: number;
};""", tag='QS')

# ---------- 9. 任务链追加 ----------
rep("""  { id: 'pop2500', title: '都市之父', hint: '人口达到 2500 人 —— 终极成就！', goal: 2500,
    val: s => s.pop, rG: 880, rXp: 330 },
];""",
"""  { id: 'pop2500', title: '都市之父', hint: '人口达到 2500 人 —— 终极成就！', goal: 2500,
    val: s => s.pop, rG: 880, rXp: 330 },
  // ---- v10 货物 / 旅游 / 法令时代 ----
  { id: 'goods1', title: '货畅其流', hint: '建造 2 座工业建筑（工厂/木材厂产出货物供给商店：货物短缺会让商业收入大打折扣）', goal: 2,
    val: s => s.ind, rG: 520, rXp: 240 },
  { id: 'export1', title: '货通四海', hint: '累计出口创汇 300G（货仓超八成且产大于销时，港口吊机/渡轮码头自动以 1.35G/件外销）', goal: 300,
    val: s => s.exportEarn, rG: 640, rXp: 270 },
  { id: 'ord2', title: '政令时代', hint: '在市政法令厅颁布 2 条法令（各有代价与收益，随时可废止）', goal: 2,
    val: s => s.ordsN, rG: 560, rXp: 250 },
  { id: 'tourist60', title: '宾至如归', hint: '游客人数达到 60（摩天轮/水族馆/博物馆是吸引力大户；酒店床位决定接待上限）', goal: 60,
    val: s => s.tourists, rG: 620, rXp: 280 },
];""", tag='任务')

# ---------- 10. 成就追加 ----------
rep("""  { id: 'harbor', name: '港湾灯影', desc: '建造渡轮码头，船舶鸣笛出港', icon: 'land', goal: 1, val: s => s.ferries },
];""",
"""  { id: 'harbor', name: '港湾灯影', desc: '建造渡轮码头，船舶鸣笛出港', icon: 'land', goal: 1, val: s => s.ferries },
  // ---- v10 货物 / 旅游 / 法令 ----
  { id: 'tour60a', name: '门庭若市', desc: '游客人数达到 60', icon: 'people', goal: 60, val: s => s.tourists },
  { id: 'tour200', name: '世界名城', desc: '游客人数达到 200', icon: 'medal', goal: 200, val: s => s.tourists },
  { id: 'export300', name: '货通四海', desc: '累计出口创汇 300G', icon: 'coin', goal: 300, val: s => s.exportEarn },
  { id: 'ords4', name: '政通人和', desc: '同时颁布 4 条市政法令', icon: 'flag', goal: 4, val: s => s.ordsN },
];""", tag='成就')

# ---------- 11. EconView 类型扩展 ----------
rep("""  // ---- v8：文化 / 科研指数 ----
  cultureSup: number; cultureNeed: number; cultureIdx: number; sciIdx: number;
};

export type HistPoint = { t: number; pop: number; coins: number; net: number; hap: number };""",
"""  // ---- v8：文化 / 科研指数 ----
  cultureSup: number; cultureNeed: number; cultureIdx: number; sciIdx: number;
  // ---- v10：货物 / 旅游 / 法令 ----
  goods: number; goodsCap: number; goodsProd: number; goodsCons: number;
  goodsNet: number; goodsIdx: number;
  exportRate: number; exportTotal: number; ports: number;
  tourists: number; tourIdx: number; beds: number; attract: number;
  incomeTour: number; incomeExp: number; ordCost: number;
  ords: Array<{ id: string; name: string; desc: string; cost: number; lv: number;
    reqNote: string; on: boolean; lockLv: boolean; reqOk: boolean }>;
};

export type HistPoint = { t: number; pop: number; coins: number; net: number; hap: number };""",
    tag='EconView')

# ---------- 12. Snap 类型扩展 ----------
rep("""  // ---- v8：文化 / 科研指数 ----
  cultureSup: number; cultureNeed: number; cultureIdx: number; sciIdx: number;
};""",
"""  // ---- v8：文化 / 科研指数 ----
  cultureSup: number; cultureNeed: number; cultureIdx: number; sciIdx: number;
  // ---- v10：货物 / 旅游 / 法令 ----
  goodsP: number; goodsC: number; goodsCap: number; goodsNet: number; goodsIdx: number;
  exportRate: number; ports: number;
  tourists: number; tourIdx: number; beds: number; attract: number;
  multTour: number; ordCost: number; ordHap: number; migMult: number;
};""", tag='Snap')

# ---------- 13. Tycoon 字段 + 方法 ----------
rep("""  /** 事件请求强制天气（engine 每帧消费：'rain' = 暴风雨） */
  weatherReq: WeatherKind | null = null;""",
"""  /** 事件请求强制天气（engine 每帧消费：'rain' = 暴风雨） */
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
  }""", tag='Tycoon 字段')

rep("  private incomeParts = { tax: 0, com: 0, ind: 0 };",
    "  private incomeParts = { tax: 0, com: 0, ind: 0, tour: 0, exp: 0 };", tag='incomeParts')

# ---------- 14. snapOf：累计器 ----------
rep("""    let hasWaterTower = 0, waterCapT = 0;
    let busStops = 0, ferries = 0;""",
"""    let hasWaterTower = 0, waterCapT = 0;
    let busStops = 0, ferries = 0;
    // v10：货物 / 旅游累计器
    let goodsP = 0, goodsC = 0, goodsCapV = GOODS_BASE_CAP;
    let beds = 0, attract = 0, ports = 0;""", tag='累计器')

rep("""      // v7 公交 / 航运设施计数
      if (o.id === 'busstop') busStops++;
      if (o.id === 'ferry') ferries++;""",
"""      // v7 公交 / 航运设施计数
      if (o.id === 'busstop') busStops++;
      if (o.id === 'ferry') ferries++;
      // v10：货物供应链 / 旅游设施
      if (e?.goodsP) goodsP += e.goodsP;
      if (e?.goodsC) goodsC += e.goodsC;
      if (e?.goodsCap) goodsCapV += e.goodsCap;
      const at = ATTRACT[o.id];
      if (at) attract += at;
      if (o.id === 'hotel') beds += 160;
      if (o.id === 'minshuku') beds += 24;
      if (o.id === 'dock' || o.id === 'ferry') ports++;""", tag='循环累计')

# ---------- 15. 法令乘数（科技区之后） ----------
rep("""    if (this.has('poweng')) powerSup = Math.round(powerSup * 1.25);
    if (this.has('green')) pollute *= 0.7;""",
"""    if (this.has('poweng')) powerSup = Math.round(powerSup * 1.25);
    if (this.has('green')) pollute *= 0.7;
    // v10 法令：环保条例减排 / 有机农业维护上浮
    if (this.hasOrd('ecolaw')) pollute *= 0.72;
    if (this.hasOrd('organic')) upk += upkFarm.v * 0.25;""", tag='法令-科技区')

# ---------- 16. 事件乘数 tour ----------
rep("    let multCom = 1, multInd = 1, multFood = 1, multPower = 1, multTraffic = 1, multSp = 1;",
    "    let multCom = 1, multInd = 1, multFood = 1, multPower = 1, multTraffic = 1, multSp = 1, multTour = 1;",
    tag='multTour 声明')
rep("      if (ev.mult.sp) multSp *= ev.mult.sp;",
    "      if (ev.mult.sp) multSp *= ev.mult.sp;\n      if (ev.mult.tour) multTour *= ev.mult.tour;",
    tag='multTour 累乘')

# ---------- 17. 季节区法令（用电/粮产/商业/工业） ----------
rep("""    foodProd *= sn.food;
    multCom *= sn.com;
    powerDem *= sn.powerDem;                 // 夏空调 / 冬取暖抬升用电""",
"""    foodProd *= sn.food;
    multCom *= sn.com;
    powerDem *= sn.powerDem;                 // 夏空调 / 冬取暖抬升用电
    // v10 法令：节能令 / 夜间经济 / 有机农业
    if (this.hasOrd('energy')) powerDem *= 0.88;
    if (this.hasOrd('night')) powerDem *= 1.06;
    if (this.hasOrd('organic')) foodProd *= 1.18;""", tag='法令-季节区')

rep("""    foodProd *= multFood;
    earnCom *= multCom;
    earnInd *= multInd;
    spRaw *= multSp;""",
"""    foodProd *= multFood;
    earnCom *= multCom;
    earnInd *= multInd;
    spRaw *= multSp;
    // v10 法令：夜间经济 / 消费券 / 环保条例
    if (this.hasOrd('night')) earnCom *= 1.10;
    if (this.hasOrd('voucher')) earnCom *= 1.15;
    if (this.hasOrd('ecolaw')) earnInd *= 0.93;""", tag='法令-收入区')

# ---------- 18. 宜居需求（开放落户） ----------
rep("    const amenityNeed = Math.ceil(pop / 18);",
    "    const amenityNeed = Math.ceil(pop / 18 * (this.hasOrd('welcome') ? 1.1 : 1));", tag='宜居需求')

# ---------- 19. 安全（治安巡逻）与交通（公交优先） ----------
rep("    const safetyIdx = pop < 8 ? 80 : Math.max(0, Math.min(100, Math.round(100 * Math.min(1, shields / pop))));",
    "    const safetyIdx = pop < 8 ? 80 : Math.max(0, Math.min(100, Math.round(100 * Math.min(1, shields / pop)) + (this.hasOrd('patrol') ? 15 : 0)));",
    tag='安全-巡逻')
rep("    const busBonus = pop >= 10 ? Math.min(15, busStops * 4) : 0;",
    "    const busBonus = (pop >= 10 ? Math.min(15, busStops * 4) : 0) + (this.hasOrd('transit') ? 10 : 0);",
    tag='交通-公交优先')

# ---------- 20. 法令汇总 + 幸福度 ordHap ----------
rep("""    // 幸福 v8：九维加权（宜居 24 / 粮食 15 / 就业 12 / 供水 11 / 文化 9 / 环境 9 /
    //   健康 7 / 安全 6 / 交通 7；权重和 = 100）
    //   + 税率情绪 + 饥荒打击；v5 + 事件 / 天气情绪；v6 + 季节情绪
    const famineHit = famine ? (this.has('granary') ? 12 : 25) : 0;
    const mood = taxMood(this.taxRate);
    const happiness = Math.max(5, Math.min(100, Math.round(
      0.24 * livability + 0.15 * foodIdx + 0.12 * jobIdx + 0.11 * waterIdx + 0.09 * cultureIdx +
      0.09 * envIdx + 0.07 * healthIdx + 0.06 * safetyIdx + 0.07 * trafficIdx + mood + weatherHap + eventHap + seasonHap - famineHit)));
    const happyMult = 0.6 + happiness / 125;""",
"""    // ---- v10 法令汇总（情绪 / 迁入 / 行政开支）----
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
      0.09 * envIdx + 0.07 * healthIdx + 0.06 * safetyIdx + 0.07 * trafficIdx + mood + weatherHap + eventHap + seasonHap + ordHap - famineHit)));
    const happyMult = 0.6 + happiness / 125;

    // ---- v10 旅游：景点吸引力 × 文化/幸福 × 季节/天气 → 游客（酒店床位为接待上限）----
    const weatherTourK = wt.kind === 'clear' ? 1.15 : wt.kind === 'cloudy' ? 1.0 : wt.kind === 'rain' ? 0.7 : 0.6;
    const seasonTourK = [1.1, 1.25, 1.15, 0.55][Math.max(0, Math.min(3, this.season))];
    const appeal = attract * (0.6 + 0.4 * cultureIdx / 100) * (0.5 + 0.5 * happiness / 100);
    const capVisit = beds * 2 + 30;
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
    // 出口：货仓 >80% 且产大于销 → 港口按 2.2 件/分·座外销
    const exportRate = ports > 0 && goodsNet > 0 && stockRatio >= 0.8
      ? Math.min(goodsNet, 2.2 * ports) : 0;""", tag='幸福+旅游+货物')

# ---------- 21. 返回对象 ----------
rep("""      season: this.season, seasonHap,
      waterCapT,
      cultureSup, cultureNeed, cultureIdx, sciIdx,
    };
  }""",
"""      season: this.season, seasonHap,
      waterCapT,
      cultureSup, cultureNeed, cultureIdx, sciIdx,
      // ---- v10 ----
      tourists, exportEarn: this.exportTotal, ports,
      ordsN: this.ords.size, goodsIdx,
      goodsP: goodsProd, goodsC: goodsCons, goodsCap: goodsCapV, goodsNet,
      exportRate, beds, attract, tourIdx,
      multTour, ordCost, ordHap, migMult,
    };
  }""", tag='返回对象')

# ---------- 22. tick：收入 / 货仓 / 迁入 ----------
rep("""    const tax = this.pop * (this.taxRate / 100) * (this.has('taxref') ? 1.15 : 1) * s.happyMult * s.powerMult;
    const com = s.earnCom * (this.has('finhub') ? 1.15 : 1) * s.staffing * s.powerMult;
    const ind = s.earnInd * s.staffing * s.powerMult;
    this.coins += (tax + com + ind - s.upk) * dt / 60;
    this.incomeParts = { tax, com, ind };""",
"""    const tax = this.pop * (this.taxRate / 100) * (this.has('taxref') ? 1.15 : 1) * s.happyMult * s.powerMult;
    const com = s.earnCom * (this.has('finhub') ? 1.15 : 1) * s.staffing * s.powerMult;
    const ind = s.earnInd * s.staffing * s.powerMult;
    // v10：旅游消费 + 港口出口 − 法令行政开支
    const tour = s.tourists * TOUR_SPEND * (this.has('brand') ? 1.2 : 1);
    const exp = s.exportRate * EXPORT_PRICE * (this.has('metal') ? 1.25 : 1);
    this.coins += (tax + com + ind + tour + exp - s.upk - s.ordCost) * dt / 60;
    this.exportTotal += exp * dt / 60;
    this.tourists = s.tourists;
    this.incomeParts = { tax, com, ind, tour, exp };""", tag='tick 收入')

rep("        net: this.incomeParts.tax + this.incomeParts.com + this.incomeParts.ind - s.upk,",
    "        net: this.incomeParts.tax + this.incomeParts.com + this.incomeParts.ind + this.incomeParts.tour + this.incomeParts.exp - s.upk - s.ordCost,",
    tag='hist net')

rep("""    if (s.famine && !this.famineWarned) {
      this.famineWarned = true;
      this.msg?.('饥荒！粮仓见底：市民正在挨饿迁离，快建温室大棚');
    } else if (!s.famine) this.famineWarned = false;""",
"""    if (s.famine && !this.famineWarned) {
      this.famineWarned = true;
      this.msg?.('饥荒！粮仓见底：市民正在挨饿迁离，快建温室大棚');
    } else if (!s.famine) this.famineWarned = false;

    // v10 货仓：产 − 销 − 出口（库存夹在 [0, cap]）
    this.goods = Math.max(0, Math.min(s.goodsCap, this.goods + (s.goodsNet - s.exportRate) * dt / 60));
    if (s.goodsIdx < 45 && s.goodsC > 1.2 && !this.goodsWarned) {
      this.goodsWarned = true;
      this.msg?.('货物短缺！商店缺货、商业收入大打折扣 —— 建工厂/木材厂扩大产能');
    } else if (s.goodsIdx >= 45) this.goodsWarned = false;""", tag='tick 货仓')

rep("        const rate = (0.0045 + 0.006 * (s.happiness / 100)) * (this.has('health') ? 1.2 : 1) * waterGrow;",
    "        const rate = (0.0045 + 0.006 * (s.happiness / 100)) * (this.has('health') ? 1.2 : 1) * waterGrow * s.migMult;",
    tag='tick 迁入')

# ---------- 23. view() ----------
rep("""      income: this.incomeParts.tax + this.incomeParts.com + this.incomeParts.ind,
      incomeUpk: s?.upk ?? 0,
      incomeNet: this.incomeParts.tax + this.incomeParts.com + this.incomeParts.ind - (s?.upk ?? 0),""",
"""      income: this.incomeParts.tax + this.incomeParts.com + this.incomeParts.ind + this.incomeParts.tour + this.incomeParts.exp,
      incomeUpk: s?.upk ?? 0,
      incomeNet: this.incomeParts.tax + this.incomeParts.com + this.incomeParts.ind + this.incomeParts.tour + this.incomeParts.exp - (s?.upk ?? 0) - (s?.ordCost ?? 0),""",
    tag='view 收入')

rep("""      // ---- v8 ----
      cultureSup: s?.cultureSup ?? 0,
      cultureNeed: s?.cultureNeed ?? 0,
      cultureIdx: s?.cultureIdx ?? 80,
      sciIdx: s?.sciIdx ?? 0,
    };
  }""",
"""      // ---- v8 ----
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
    };
  }""", tag='view v10')

# ---------- 24. newGame ----------
rep("""    this.weather = { kind: 'clear', t: 0 };
    this.weatherReq = null;
    this.own.fill(0);""",
"""    this.weather = { kind: 'clear', t: 0 };
    this.weatherReq = null;
    // v10：货物 / 旅游 / 法令重置
    this.goods = GOODS_START;
    this.exportTotal = 0;
    this.ords.clear();
    this.tourists = 0;
    this.goodsWarned = false;
    this.own.fill(0);""", tag='newGame')

# ---------- 25. serialize ----------
rep("""    return JSON.stringify({
      v: 6,""",
"""    return JSON.stringify({
      v: 7,""", tag='serialize v7')
rep("""      // v6：季节
      season: this.season,""",
"""      // v6：季节
      season: this.season,
      // v10：货物 / 法令
      goods: Math.round(this.goods),
      exportTotal: Math.round(this.exportTotal),
      ords: [...this.ords],""", tag='serialize v10')

# ---------- 26. resume ----------
rep("""    // v6 季节档（旧档默认更替中的春季；engine 会同步时钟相位）
    this.season = Math.max(0, Math.min(3, Number(d.season) || 0));""",
"""    // v6 季节档（旧档默认更替中的春季；engine 会同步时钟相位）
    this.season = Math.max(0, Math.min(3, Number(d.season) || 0));
    // v10 货物 / 法令档（旧档给默认）
    this.goods = Math.max(0, Number(d.goods) || GOODS_START);
    this.exportTotal = Math.max(0, Number(d.exportTotal) || 0);
    this.ords.clear();
    for (const oid of (d.ords as string[]) ?? []) {
      if (ORDS.some(x => x.id === oid)) this.ords.add(oid);
    }
    this.goodsWarned = false;""", tag='resume v10')

rep("""    const perMin = tax + com + s.earnInd * s.staffing * s.powerMult - s.upk;""",
"""    const tourInc = s.tourists * TOUR_SPEND * (this.has('brand') ? 1.2 : 1);
    const expInc = s.exportRate * EXPORT_PRICE * (this.has('metal') ? 1.25 : 1);
    const perMin = tax + com + s.earnInd * s.staffing * s.powerMult + tourInc + expInc - s.upk - s.ordCost;""",
    tag='resume 离线')

rep("""    // 离线粮仓同步（30% 速率结算，不出饥荒惩罚）
    this.food = Math.max(0, Math.min(s.foodCap, this.food + s.foodNet * mins * 0.30));
    this.sp += s.spRaw * (0.5 + s.wisdom / 100) * (this.has('higher') ? 1.35 : 1) * mins * 0.30;""",
"""    // 离线粮仓同步（30% 速率结算，不出饥荒惩罚）
    this.food = Math.max(0, Math.min(s.foodCap, this.food + s.foodNet * mins * 0.30));
    this.sp += s.spRaw * (0.5 + s.wisdom / 100) * (this.has('higher') ? 1.35 : 1) * mins * 0.30;
    // v10 离线：货仓 settle + 游客数同步
    this.goods = Math.max(0, Math.min(s.goodsCap, this.goods + (s.goodsNet - s.exportRate) * mins * 0.30));
    this.tourists = s.tourists;""", tag='resume 货仓')

open(P, 'w', encoding='utf-8').write(src)
print(f'\n全部替换成功：{n0} -> {len(src)} 字符（+{len(src)-n0}）')
