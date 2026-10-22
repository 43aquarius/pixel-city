#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v11-D 经营层：tycoon.ts 电车/铁路经济效果 + 出口市场（随机游走·惜售囤货）+ 任务/成就/事件 + 存档 v8"""
import pathlib

ROOT = pathlib.Path('/home/z/my-project')
T = ROOT / 'src/lib/pixelcity/tycoon.ts'

def patch(path, subs):
    src = path.read_text(encoding='utf-8')
    for old, new in subs:
        assert old in src, f'锚点未命中 @ {path.name}:\n---\n{old[:240]}\n---'
        assert src.count(old) == 1, f'锚点不唯一 @ {path.name}: {old[:80]!r} x{src.count(old)}'
        src = src.replace(old, new)
    path.write_text(src, encoding='utf-8')
    print(f'OK {path.name}: {len(subs)} 处补丁')

patch(T, [
    # ---- 常量 ----
    ("export const EXPORT_PRICE = 1.35;      // 每单位货物出口价（冶金工艺 +25%）",
     "export const EXPORT_PRICE = 1.35;      // 每单位货物出口价（冶金工艺 +25%）\n"
     "export const EXPORT_MKT_MIN = 0.55;    // v11 出口市价下限（55%）\n"
     "export const EXPORT_MKT_MAX = 1.55;    // v11 出口市价上限（155%）"),
    # ---- ECON：电车车站 / 铁路货运站 ----
    ("  busstop: D(50, 1, { amenity: 2, upk: 0.6 }),",
     "  busstop: D(50, 1, { amenity: 2, upk: 0.6 }),\n"
     "  tramstop: D(240, 5, { power: 3, amenity: 1, upk: 1.2 }),   // v11 电车站（干线整流所另计 +16MW）"),
    ("  dock: D(560, 8, { power: 10, earn: 20.5, pollute: 3, upk: 3.5, goodsP: 1.2 }),",
     "  dock: D(560, 8, { power: 10, earn: 20.5, pollute: 3, upk: 3.5, goodsP: 1.2 }),\n"
     "  railhub: D(920, 7, { power: 16, earn: 26, pollute: 3, upk: 4.2, goodsP: 1.4, goodsCap: 60 }),  // v11 陆路出口枢纽"),
    # ---- 科技门禁 ----
    ("  refinery: 'metal',\n  tower: 'struct'",
     "  refinery: 'metal',\n  tramstop: 'poweng', railhub: 'metal',\n  tower: 'struct'"),
    # ---- 事件乘数类型 ----
    ("  mult: { com?: number; ind?: number; food?: number; power?: number; traffic?: number; sp?: number; amenity?: number; tour?: number };",
     "  mult: { com?: number; ind?: number; food?: number; power?: number; traffic?: number; sp?: number; amenity?: number; tour?: number; exp?: number };"),
    # ---- 新事件：出口牛市 / 贸易摩擦 ----
    ("""  {
    key: 'badreview', name: '差评风波', kind: 'bad', dur: 50, hap: -3,
    mult: { tour: 0.45, com: 0.92 },
    note: '负面评价发酵：游客 −55% · 商业 −8%',
    w: s => (s.tourists >= 15 && s.happiness < 48 ? 7 : 0),
  },
];""",
     """  {
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
];"""),
    # ---- 成就 ×2 ----
    ("""  { id: 'ords4', name: '政通人和', desc: '同时颁布 4 条市政法令', icon: 'flag', goal: 4, val: s => s.ordsN },
];""",
     """  { id: 'ords4', name: '政通人和', desc: '同时颁布 4 条市政法令', icon: 'flag', goal: 4, val: s => s.ordsN },
  // ---- v11 轨道 / 贸易 ----
  { id: 'tram4', name: '电气化都市', desc: '电车站达到 4 座，干线电车穿梭街巷', icon: 'bolt', goal: 4, val: s => s.tramStops },
  { id: 'export1500', name: '世界工厂', desc: '累计出口创汇 1500G（善用市价波动与惜售囤货）', icon: 'coin', goal: 1500, val: s => s.exportEarn },
];"""),
    # ---- QS 类型 ----
    ("""  // ---- v10 货物 / 旅游 / 法令 ----
  tourists: number; exportEarn: number; ports: number;
  ordsN: number; goodsIdx: number;
};""",
     """  // ---- v10 货物 / 旅游 / 法令 ----
  tourists: number; exportEarn: number; ports: number;
  ordsN: number; goodsIdx: number;
  // ---- v11 轨道交通 ----
  tramStops: number; railHubs: number;
};"""),
    # ---- 任务链 ×2（追加在尾部）+ export1 提示更新 ----
    ("""  { id: 'tourist60', title: '宾至如归', hint: '游客人数达到 60（摩天轮/水族馆/博物馆是吸引力大户；酒店床位决定接待上限）', goal: 60,
    val: s => s.tourists, rG: 620, rXp: 280 },
];""",
     """  { id: 'tourist60', title: '宾至如归', hint: '游客人数达到 60（摩天轮/水族馆/博物馆是吸引力大户；酒店床位决定接待上限）', goal: 60,
    val: s => s.tourists, rG: 620, rXp: 280 },
  // ---- v11 轨道时代 / 钢铁动脉 ----
  { id: 'tram2', title: '轨道时代', hint: '建造 2 座电车站（需先研究「电力工程」；邻路而建，两站即开通电车干线：交通 +3/座 · 幸福 +2 · 整流所用电 +16MW）', goal: 2,
    val: s => s.tramStops, rG: 540, rXp: 250 },
  { id: 'rail1', title: '钢铁动脉', hint: '建造铁路货运站（需研究「冶金工艺」）：内陆城市也能出口创汇，4 件/分吞吐是港口近两倍；出口单价随市价浮动，低吸高抛', goal: 1,
    val: s => s.railHubs, rG: 660, rXp: 280 },
];"""),
    ("  { id: 'export1', title: '货通四海', hint: '累计出口创汇 300G（货仓超八成且产大于销时，港口吊机/渡轮码头自动以 1.35G/件外销）', goal: 300,",
     "  { id: 'export1', title: '货通四海', hint: '累计出口创汇 300G（货仓超八成且产大于销时，港口吊机/渡轮码头/铁路货运站自动外销，单价随市价浮动）', goal: 300,"),
    # ---- EconView 类型 ----
    ("""  ords: Array<{ id: string; name: string; desc: string; cost: number; lv: number;
    reqNote: string; on: boolean; lockLv: boolean; reqOk: boolean }>;
};""",
     """  ords: Array<{ id: string; name: string; desc: string; cost: number; lv: number;
    reqNote: string; on: boolean; lockLv: boolean; reqOk: boolean }>;
  // ---- v11：轨道交通 / 出口市场 ----
  tramStops: number; railHubs: number; tramBonus: number;
  mkt: number; mktTrend: number; expPrice: number; exportHold: boolean;
};"""),
    # ---- Snap 类型（用 seasonHap 行与 EconView 消歧）----
    ("""  season: number; seasonHap: number;
  waterIdx: number; waterCapT: number;
  // ---- v7：公交 / 航运 ----
  busStops: number; ferries: number; busBonus: number;
  // ---- v8：文化 / 科研指数 ----""",
     """  season: number; seasonHap: number;
  waterIdx: number; waterCapT: number;
  // ---- v7：公交 / 航运 ----
  busStops: number; ferries: number; busBonus: number;
  // ---- v11：轨道交通 / 出口市场 ----
  tramStops: number; railHubs: number; tramBonus: number;
  multExp: number; expPrice: number;
  // ---- v8：文化 / 科研指数 ----"""),
    # ---- Tycoon 字段 ----
    ("  private goodsWarned = false;",
     "  private goodsWarned = false;\n\n"
     "  // ---- v11：出口市场（随行就市 / 惜售囤货）----\n"
     "  /** 出口市价系数（0.55..1.55；1 = 基准价；随机游走 + 均值回归） */\n"
     "  mkt = 1;\n"
     "  private mktPrev = 1;\n"
     "  private mktTimer = 0;\n"
     "  /** 惜售囤货：暂停自动出口，囤货待涨（货仓满后生产滞销） */\n"
     "  exportHold = false;"),
    # ---- snapOf：计数器 ----
    ("    let busStops = 0, ferries = 0;",
     "    let busStops = 0, ferries = 0;\n    let tramStops = 0, railHubs = 0;   // v11 轨道交通"),
    ("      if (o.id === 'busstop') busStops++;\n      if (o.id === 'ferry') ferries++;",
     "      if (o.id === 'busstop') busStops++;\n      if (o.id === 'ferry') ferries++;\n"
     "      if (o.id === 'tramstop') tramStops++;      // v11\n"
     "      if (o.id === 'railhub') railHubs++;"),
    # ---- snapOf：电车整流所用电 ----
    ("    // 科技倍率\n    if (this.has('irrig')) foodProd *= 1.3;",
     "    // v11 电车干线：牵引整流所用电 +16MW（两站起开通）\n"
     "    if (tramStops >= 2) powerDem += 16;\n"
     "    // 科技倍率\n    if (this.has('irrig')) foodProd *= 1.3;"),
    # ---- snapOf：事件乘数 exp ----
    ("    let multCom = 1, multInd = 1, multFood = 1, multPower = 1, multTraffic = 1, multSp = 1, multTour = 1;",
     "    let multCom = 1, multInd = 1, multFood = 1, multPower = 1, multTraffic = 1, multSp = 1, multTour = 1, multExp = 1;"),
    ("      if (ev.mult.tour) multTour *= ev.mult.tour;",
     "      if (ev.mult.tour) multTour *= ev.mult.tour;\n      if (ev.mult.exp) multExp *= ev.mult.exp;   // v11 出口单价事件乘数"),
    # ---- snapOf：交通指数加电车 ----
    ("""    const busBonus = (pop >= 10 ? Math.min(15, busStops * 4) : 0) + (this.hasOrd('transit') ? 10 : 0);
    const trafficIdx = buildings > 0
      ? Math.max(0, Math.min(100, Math.round(
          roadsTotal * 100 / (buildings * 3) * multTraffic) + busBonus))
      : 100;""",
     """    const busBonus = (pop >= 10 ? Math.min(15, busStops * 4) : 0) + (this.hasOrd('transit') ? 10 : 0);
    // v11 电车干线：每站交通 +3（上限 +12；两站起算 —— 巴士是骨架，电车是大动脉）
    const tramBonus = tramStops >= 2 ? Math.min(12, tramStops * 3) : 0;
    const trafficIdx = buildings > 0
      ? Math.max(0, Math.min(100, Math.round(
          roadsTotal * 100 / (buildings * 3) * multTraffic) + busBonus + tramBonus))
      : 100;"""),
    # ---- snapOf：幸福度 + 电车通车 ----
    ("""    const happyMult = 0.6 + happiness / 125;""",
     """    const happyMult = 0.6 + happiness / 125;"""),
    ("      0.09 * envIdx + 0.07 * healthIdx + 0.06 * safetyIdx + 0.07 * trafficIdx + mood + weatherHap + eventHap + seasonHap + ordHap - famineHit)));",
     "      0.09 * envIdx + 0.07 * healthIdx + 0.06 * safetyIdx + 0.07 * trafficIdx + mood + weatherHap + eventHap + seasonHap + ordHap\n"
     "      + (tramStops >= 2 ? 2 : 0) - famineHit)));   // v11 电车干线通车：出行体面 +2 幸福"),
    # ---- snapOf：出口吞吐（港口 + 铁路）与市价 ----
    ("""    // 出口：货仓 >80% 且产大于销 → 港口按 2.2 件/分·座外销
    const exportRate = ports > 0 && goodsNet > 0 && stockRatio >= 0.8
      ? Math.min(goodsNet, 2.2 * ports) : 0;""",
     """    // v11 出口：货仓 >80% 且产大于销 → 港口 2.2 / 铁路 4.0 件/分·座（惜售囤货时暂停外销）
    const expThroughput = 2.2 * ports + 4.0 * railHubs;
    const exportRate = (ports + railHubs) > 0 && goodsNet > 0 && stockRatio >= 0.8 && !this.exportHold
      ? Math.min(goodsNet, expThroughput) : 0;
    // v11 出口单价：基准 × 市价 × 事件 × 冶金加成
    const expPrice = EXPORT_PRICE * this.mkt * multExp * (this.has('metal') ? 1.25 : 1);"""),
    # ---- snapOf：返回值 ----
    ("      busStops, ferries, busBonus,",
     "      busStops, ferries, busBonus, tramStops, railHubs, tramBonus,"),
    ("      multTour, ordCost, ordHap, migMult,",
     "      multTour, multExp, expPrice, ordCost, ordHap, migMult,"),
    # ---- tick：市价随机游走 ----
    ("    // 收入 − 维护（G/分 → 按秒累积；可能为负 = 赤字，需拆除减负）",
     "    // v11 出口市价：随机游走 + 均值回归（每 3 秒一步；55%..155%）\n"
     "    this.mktTimer -= dt;\n"
     "    if (this.mktTimer <= 0) {\n"
     "      this.mktTimer = 3;\n"
     "      this.mktPrev = this.mkt;\n"
     "      this.mkt = Math.max(EXPORT_MKT_MIN, Math.min(EXPORT_MKT_MAX,\n"
     "        this.mkt + (Math.random() - 0.5) * 0.13 + (1 - this.mkt) * 0.045));\n"
     "    }\n"
     "    // 收入 − 维护（G/分 → 按秒累积；可能为负 = 赤字，需拆除减负）"),
    # ---- tick：出口收入改用市价单价 ----
    ("    const exp = s.exportRate * EXPORT_PRICE * (this.has('metal') ? 1.25 : 1);",
     "    const exp = s.exportRate * s.expPrice;   // v11：市价 × 事件 × 冶金已并入单价"),
    # ---- view()：v11 字段 ----
    ("""      ords: ORDS.map(o => ({
        id: o.id, name: o.name, desc: o.desc, cost: o.cost, lv: o.lv,
        reqNote: o.reqNote ?? '',
        on: this.ords.has(o.id),
        lockLv: this.level < o.lv,
        reqOk: !o.req || (!!s && o.req(s)),
      })),
    };
  }""",
     """      ords: ORDS.map(o => ({
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
  }"""),
    # ---- newGame 重置 ----
    ("    this.tourists = 0;\n    this.goodsWarned = false;\n    this.own.fill(0);",
     "    this.tourists = 0;\n    this.goodsWarned = false;\n"
     "    // v11 出口市场重置\n"
     "    this.mkt = 1;\n    this.mktPrev = 1;\n    this.mktTimer = 0;\n    this.exportHold = false;\n"
     "    this.own.fill(0);"),
    # ---- serialize v8 ----
    ("    return JSON.stringify({\n      v: 7,",
     "    return JSON.stringify({\n      v: 8,"),
    ("      goods: Math.round(this.goods),\n      exportTotal: Math.round(this.exportTotal),\n      ords: [...this.ords],",
     "      goods: Math.round(this.goods),\n      exportTotal: Math.round(this.exportTotal),\n      ords: [...this.ords],\n"
     "      // v11：出口市场\n"
     "      mkt: Math.round(this.mkt * 1000) / 1000,\n      exportHold: this.exportHold,"),
    # ---- resume：读档兼容 ----
    ("""    for (const oid of (d.ords as string[]) ?? []) {
      if (ORDS.some(x => x.id === oid)) this.ords.add(oid);
    }
    this.goodsWarned = false;""",
     """    for (const oid of (d.ords as string[]) ?? []) {
      if (ORDS.some(x => x.id === oid)) this.ords.add(oid);
    }
    this.goodsWarned = false;
    // v11 出口市场档（旧档给默认基准价）
    this.mkt = Math.max(EXPORT_MKT_MIN, Math.min(EXPORT_MKT_MAX, Number(d.mkt) || 1));
    this.mktPrev = this.mkt;
    this.mktTimer = 0;
    this.exportHold = d.exportHold === true;"""),
    # ---- resume：离线出口收入改用市价单价 ----
    ("    const expInc = s.exportRate * EXPORT_PRICE * (this.has('metal') ? 1.25 : 1);",
     "    const expInc = s.exportRate * s.expPrice;   // v11：单价已含市价/事件/冶金"),
])

print('v11-D 完成')
