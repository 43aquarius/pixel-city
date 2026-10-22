#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v12-B 城市卫士：tycoon.ts 应急联动经济层
- 交班 ECON 条目 / Snap·QS·EconView 字段 / 安全护盾 +220
- 火灾·疫病两段结算（即时 40% + 余款挂账，应急车到场豁免）
- 出动请求队列 dispatch + resolveEvent + forceEvent 调试钩子
- 成就×3 / 任务×1 / 存档 v9 向后兼容"""
import pathlib

ROOT = pathlib.Path('/home/z/my-project')
T = ROOT / 'src/lib/pixelcity/tycoon.ts'
I = ROOT / 'src/lib/pixelcity/icons.ts'
U = ROOT / 'src/components/PixelCity.tsx'

def patch(path, subs):
    src = path.read_text(encoding='utf-8')
    for old, new in subs:
        assert old in src, f'锚点未命中 @ {path.name}:\n---\n{old[:260]}\n---'
        assert src.count(old) == 1, f'锚点不唯一 @ {path.name}: {old[:80]!r} x{src.count(old)}'
        src = src.replace(old, new)
    path.write_text(src, encoding='utf-8')
    print(f'OK {path.name}: {len(subs)} 处补丁')

patch(T, [
    # ---- 1. ECON：交班 ----
    ("""  firestation: D(240, 5, { power: 3, amenity: 3, upk: 1.5 }),""",
     """  firestation: D(240, 5, { power: 3, amenity: 3, upk: 1.5 }),
  koban: D(140, 2, { power: 1, amenity: 1, upk: 0.8 }),   // v12 交番：安全护盾 + 巡逻车"""),
    # ---- 2. ActiveEvent：挂账余损 ----
    ("""  mult: { com?: number; ind?: number; food?: number; power?: number; traffic?: number; sp?: number; amenity?: number; tour?: number; exp?: number };
  fx?: { x: number; y: number };
};""",
     """  mult: { com?: number; ind?: number; food?: number; power?: number; traffic?: number; sp?: number; amenity?: number; tour?: number; exp?: number };
  /** v12 两段结算：延迟到事件结束的余损（应急车到场则豁免） */
  pendG?: number; pendP?: number;
  fx?: { x: number; y: number };
};"""),
    # ---- 3. EventTpl：bill 参数 + resp 字段 ----
    ("""  /** 触发时的一次性结算（返回结果文案；不返回 = 纯持续事件） */
  fire?: (t: Tycoon, s: Snap) => string | void;""",
     """  /** 触发时的一次性结算（返回结果文案；不返回 = 纯持续事件）
   *  v12：bill 出参登记延迟余损（金币 g / 人口 p），事件结束仍无人处置则结算 */
  fire?: (t: Tycoon, s: Snap, bill?: { g: number; p: number }) => string | void;
  /** v12 应急响应：fire→消防车 / aid→救护车（就近设施出车驰援） */
  resp?: 'fire' | 'aid';"""),
    # ---- 4. 火灾模板：两段结算 ----
    ("""  {
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
  },""",
     """  {
    key: 'fire', name: '火灾', kind: 'bad', dur: 20, hap: -10,
    mult: {}, fx: true, resp: 'fire',
    note: '一栋建筑失火！消防车赶到可免大部分损失',
    w: s => (t => t ? (s.firestations > 0 ? 6 : 15) : 0)(s.pop >= 40),
    fire: (t, s, bill) => {
      // v12 两段结算：即时 40% + 余款挂账（消防车到场扑灭则豁免）
      const cut = s.firestations > 0 ? 0.35 : 1;
      const total = Math.round((150 + t.pop * 0.6) * cut);
      const now = Math.round(total * 0.4);
      if (bill) bill.g = total - now;
      t.coins = Math.max(0, t.coins - now);
      return s.firestations > 0
        ? `消防局接警出动！先期损失 ${now}G —— 全看消防车能否及时赶到`
        : `没有消防站，先损 ${now}G 且火势仍在蔓延 —— 快建消防局`;
    },
  },"""),
    # ---- 5. 疫病模板：两段结算 + fx 现场标记（救护车目的地） ----
    ("""  {
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
  },""",
     """  {
    key: 'plague', name: '疫病流行', kind: 'bad', dur: 25, hap: -8,
    mult: {}, fx: true, resp: 'aid',
    note: '传染病蔓延，救护车赶到可免大部分病退',
    w: s => (s.pop >= 60 ? (s.hospitals > 0 ? 5 : 13) : 0),
    fire: (t, s, bill) => {
      // v12 两段结算：即时 40% + 余款挂账（救护车到场收治则豁免）
      const cut = s.hospitals > 0 ? 0.5 : 1;
      const total = Math.max(1, Math.round(t.pop * 0.06 * cut));
      const now = Math.max(1, Math.round(total * 0.4));
      if (bill) bill.p = total - now;
      t.pop = Math.max(0, t.pop - now);
      return s.hospitals > 0
        ? `救护车鸣笛出诊！${now} 人先期病退 —— 祈祷急救及时`
        : `${now} 位市民病倒离开，疫情仍在蔓延 —— 医院不可少`;
    },
  },"""),
    # ---- 6. QS 类型：v12 字段 ----
    ("""  // ---- v11 轨道交通 ----
  tramStops: number; railHubs: number;
};""",
     """  // ---- v11 轨道交通 ----
  tramStops: number; railHubs: number;
  // ---- v12 城市卫士 ----
  kobans: number; rescueFire: number; rescueAid: number;
};"""),
    # ---- 7. Snap 类型 ----
    ("""  hospitals: number; firestations: number; roadsTotal: number;
  taxMoodV: number;""",
     """  hospitals: number; firestations: number; roadsTotal: number;
  kobans: number; rescueFire: number; rescueAid: number;
  taxMoodV: number;"""),
    # ---- 8. EconView 类型 ----
    ("""  // ---- v11：轨道交通 / 出口市场 ----
  tramStops: number; railHubs: number; tramBonus: number;
  mkt: number; mktTrend: number; expPrice: number; exportHold: boolean;
};""",
     """  // ---- v11：轨道交通 / 出口市场 ----
  tramStops: number; railHubs: number; tramBonus: number;
  mkt: number; mktTrend: number; expPrice: number; exportHold: boolean;
  // ---- v12：城市卫士（应急联动）----
  kobans: number; rescueFire: number; rescueAid: number;
};"""),
    # ---- 9. 成就 ×3 ----
    ("""  { id: 'tram4', name: '电气化都市', desc: '电车站达到 4 座，干线电车穿梭街巷', icon: 'bolt', goal: 4, val: s => s.tramStops },
  { id: 'export1500', name: '世界工厂', desc: '累计出口创汇 1500G（善用市价波动与惜售囤货）', icon: 'coin', goal: 1500, val: s => s.exportEarn },
];""",
     """  { id: 'tram4', name: '电气化都市', desc: '电车站达到 4 座，干线电车穿梭街巷', icon: 'bolt', goal: 4, val: s => s.tramStops },
  { id: 'export1500', name: '世界工厂', desc: '累计出口创汇 1500G（善用市价波动与惜售囤货）', icon: 'coin', goal: 1500, val: s => s.exportEarn },
  // ---- v12 城市卫士 ----
  { id: 'guard1', name: '城市卫士', desc: '交番 · 消防局 · 医院齐备，应急体系成型', icon: 'shield',
    goal: 3, val: s => (s.kobans > 0 ? 1 : 0) + (s.firestations > 0 ? 1 : 0) + (s.hospitals > 0 ? 1 : 0) },
  { id: 'hero1', name: '烈火英雄', desc: '消防车成功扑救 5 场火灾（设施邻路、路网连通现场才来得及）', icon: 'fire',
    goal: 5, val: s => s.rescueFire },
  { id: 'medic1', name: '妙手回春', desc: '救护车及时处置 5 次疫病', icon: 'heart',
    goal: 5, val: s => s.rescueAid },
];"""),
    # ---- 10. 任务 ×1 ----
    ("""  { id: 'rail1', title: '钢铁动脉', hint: '建造铁路货运站（需研究「冶金工艺」）：内陆城市也能出口创汇，4 件/分吞吐是港口近两倍；出口单价随市价浮动，低吸高抛', goal: 1,
    val: s => s.railHubs, rG: 660, rXp: 280 },
];""",
     """  { id: 'rail1', title: '钢铁动脉', hint: '建造铁路货运站（需研究「冶金工艺」）：内陆城市也能出口创汇，4 件/分吞吐是港口近两倍；出口单价随市价浮动，低吸高抛', goal: 1,
    val: s => s.railHubs, rG: 660, rXp: 280 },
  // ---- v12 城市卫士 ----
  { id: 'guard0', title: '城市卫士', hint: '交番 · 消防局 · 医院各建一座 —— 火灾疫病来袭时应急车队沿路驰援，到场即免大部分损失（设施务必邻路）', goal: 3,
    val: s => (s.kobans > 0 ? 1 : 0) + (s.firestations > 0 ? 1 : 0) + (s.hospitals > 0 ? 1 : 0), rG: 420, rXp: 190 },
];"""),
    # ---- 11. 类字段：应急计数 + 出动队列 ----
    ("""  /** 惜售囤货：暂停自动出口，囤货待涨（货仓满后生产滞销） */
  exportHold = false;""",
     """  /** 惜售囤货：暂停自动出口，囤货待涨（货仓满后生产滞销） */
  exportHold = false;

  // ---- v12：城市卫士（应急联动）----
  /** 消防成功扑救 / 急救成功处置次数（成就） */
  rescueFire = 0;
  rescueAid = 0;
  /** 出动请求队列（engine 每帧消费：9 消防车 / 10 救护车；hx,hy=设施格 tx,ty=事故格） */
  dispatch: Array<{ kind: 9 | 10; hx: number; hy: number; tx: number; ty: number; key: string }> = [];"""),
    # ---- 12. 设施计数：交班 ----
    ("""    let hospitals = 0, firestations = 0;""",
     """    let hospitals = 0, firestations = 0, kobans = 0;   // v12：交班计数"""),
    ("""        if (o.id === 'firestation') firestations++;""",
     """        if (o.id === 'firestation') firestations++;
        if (o.id === 'koban') kobans++;                     // v12"""),
    # ---- 13. 安全护盾：交班 +220/座 ----
    ("""    const shields = firestations * 550 + 100;""",
     """    const shields = firestations * 550 + kobans * 220 + 100;   // v12：交班治安护盾"""),
    # ---- 14. Snap 字面量 ----
    ("""      hospitals, firestations, roadsTotal, taxMoodV: mood,""",
     """      hospitals, firestations, roadsTotal, taxMoodV: mood,
      kobans, rescueFire: this.rescueFire, rescueAid: this.rescueAid,"""),
    # ---- 15. view()：v12 字段 ----
    ("""      hospitals: s?.hospitals ?? 0, firestations: s?.firestations ?? 0,""",
     """      hospitals: s?.hospitals ?? 0, firestations: s?.firestations ?? 0,
      kobans: s?.kobans ?? 0, rescueFire: this.rescueFire, rescueAid: this.rescueAid,"""),
    # ---- 16. rollEvent：可强制指定 + bill + 出动队列 ----
    ("""  /** 掷骰触发一个随机事件（按条件权重抽取；新手期灾害减半） */
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
    if (pick.fire) result = pick.fire(this, s) ?? '';""",
     """  /** 掷骰触发一个随机事件（按条件权重抽取；新手期灾害减半；可强制指定模板） */
  private rollEvent(map: CityMap, s: Snap, forced?: EventTpl): void {
    const rookie = this.pop < 80;                       // 新手保护：灾害权重减半
    let pick: EventTpl;
    if (forced) pick = forced;
    else {
      const pool = EVENT_TPLS.map(t => ({
        t, w: t.w(s, this) * (t.kind === 'bad' && rookie ? 0.5 : 1),
      })).filter(x => x.w > 0);
      if (!pool.length) return;
      let sum = 0;
      for (const p of pool) sum += p.w;
      let r = Math.random() * sum;
      pick = pool[0].t;
      for (const p of pool) { r -= p.w; if (r <= 0) { pick = p.t; break; } }
    }
    if (this.events.some(e => e.key === pick.key)) return;   // 同事件不叠加

    // 一次性结算（v12：bill 登记延迟余损）
    const bill = { g: 0, p: 0 };
    let result = '';
    if (pick.fire) result = pick.fire(this, s, bill) ?? '';"""),
    # ---- 17. rollEvent：出动请求 + 挂账入事件 ----
    ("""    // 日志（即时事件不入活动列表）
    const stamp = Math.floor(this.playtime);""",
     """    // v12 应急联动：就近设施请求出动（消防局→消防车 / 医院→救护车）
    if (pick.resp && fx) {
      const fid = pick.resp === 'fire' ? 'firestation' : 'hospital';
      let best: { ax: number; ay: number } | null = null, bd = 1e9;
      for (const o of map.objs.values()) {
        if (o.id !== fid) continue;
        const d = Math.abs(o.ax - fx.x) + Math.abs(o.ay - fx.y);
        if (d < bd) { bd = d; best = o; }
      }
      if (best) this.dispatch.push({
        kind: pick.resp === 'fire' ? 9 : 10,
        hx: best.ax, hy: best.ay, tx: fx.x, ty: fx.y, key: pick.key,
      });
    }

    // 日志（即时事件不入活动列表）
    const stamp = Math.floor(this.playtime);"""),
    ("""    if (pick.dur > 0) {
      this.events.push({
        key: pick.key, name: pick.name, note: pick.note, kind: pick.kind,
        left: pick.dur, dur: pick.dur, hap: pick.hap, mult: pick.mult, fx,
      });""",
     """    if (pick.dur > 0) {
      this.events.push({
        key: pick.key, name: pick.name, note: pick.note, kind: pick.kind,
        left: pick.dur, dur: pick.dur, hap: pick.hap, mult: pick.mult, fx,
        pendG: bill.g > 0 ? bill.g : undefined,
        pendP: bill.p > 0 ? bill.p : undefined,
      });"""),
    # ---- 18. forceEvent 公开调试钩子 ----
    ("""  /** 视野定位到市政厅 */
  hallCenter(): { x: number; y: number } {""",
     """  /** v12：强制触发指定事件（测试钩子；与随机触发同一套结算规则） */
  forceEvent(key: string, map: CityMap): boolean {
    const tpl = EVENT_TPLS.find(t => t.key === key);
    if (!tpl || this.events.some(e => e.key === key)) return false;
    this.rollEvent(map, this.snapOf(map), tpl);
    return true;
  }

  /** v12 应急车到场：豁免挂账余损 + 提前终结事件（返回是否生效） */
  resolveEvent(key: string): boolean {
    const ev = this.events.find(e => e.key === key);
    if (!ev) return false;
    if (ev.pendG && ev.pendG > 0) {
      this.msg?.(`应急响应及时，挽回 ${ev.pendG}G 损失！`);
      ev.pendG = 0;
    }
    if (ev.pendP && ev.pendP > 0) {
      this.msg?.(`急救及时，${ev.pendP} 位市民免于病退！`);
      ev.pendP = 0;
    }
    ev.left = Math.min(ev.left, 3.5);
    if (key === 'fire') this.rescueFire++;
    if (key === 'plague') this.rescueAid++;
    return true;
  }

  /** 视野定位到市政厅 */
  hallCenter(): { x: number; y: number } {"""),
    # ---- 19. 事件到期：余款结算 ----
    ("""      if (ev.left <= 0) {
        this.events.splice(i, 1);
        this.msg?.(`「${ev.name}」结束，城市恢复如常`);
      }""",
     """      if (ev.left <= 0) {
        this.events.splice(i, 1);
        // v12 两段结算：无人驰援 → 余款结算
        if (ev.pendG && ev.pendG > 0) {
          this.coins = Math.max(0, this.coins - ev.pendG);
          this.msg?.(`「${ev.name}」余损 ${ev.pendG}G —— 应急车没能及时赶到`);
          ev.pendG = 0;
        }
        if (ev.pendP && ev.pendP > 0) {
          this.pop = Math.max(0, this.pop - ev.pendP);
          this.msg?.(`「${ev.name}」又有 ${ev.pendP} 位市民病退 —— 把医院接进路网吧`);
          ev.pendP = 0;
        }
        this.msg?.(`「${ev.name}」结束，城市恢复如常`);
      }"""),
    # ---- 20. newGame 重置 ----
    ("""    // v10：货物 / 旅游 / 法令重置
    this.goods = GOODS_START;
    this.exportTotal = 0;
    this.ords.clear();
    this.tourists = 0;
    this.goodsWarned = false;""",
     """    // v10：货物 / 旅游 / 法令重置
    this.goods = GOODS_START;
    this.exportTotal = 0;
    this.ords.clear();
    this.tourists = 0;
    this.goodsWarned = false;
    // v12：应急联动重置
    this.rescueFire = 0;
    this.rescueAid = 0;
    this.dispatch.length = 0;"""),
    # ---- 21. serialize v9 ----
    ("""    return JSON.stringify({
      v: 8,""",
     """    return JSON.stringify({
      v: 9,"""),
    ("""      events: this.events.map(e => ({
        key: e.key, left: Math.round(e.left),
        fx: e.fx ? [e.fx.x, e.fx.y] : undefined,
      })),""",
     """      events: this.events.map(e => ({
        key: e.key, left: Math.round(e.left),
        fx: e.fx ? [e.fx.x, e.fx.y] : undefined,
        pendG: e.pendG || undefined, pendP: e.pendP || undefined,   // v12 挂账余损
      })),"""),
    ("""      mkt: Math.round(this.mkt * 1000) / 1000,
      exportHold: this.exportHold,""",
     """      mkt: Math.round(this.mkt * 1000) / 1000,
      exportHold: this.exportHold,
      // v12：应急出动计数
      rescueFire: this.rescueFire, rescueAid: this.rescueAid,"""),
    # ---- 22. resume：v12 字段兼容恢复 ----
    ("""        left: Math.max(1, Math.min(tpl.dur, Number(e.left) || tpl.dur)),
        dur: tpl.dur, hap: tpl.hap, mult: tpl.mult,
        fx: Array.isArray(e.fx) ? { x: e.fx[0], y: e.fx[1] } : undefined,
      });""",
     """        left: Math.max(1, Math.min(tpl.dur, Number(e.left) || tpl.dur)),
        dur: tpl.dur, hap: tpl.hap, mult: tpl.mult,
        fx: Array.isArray(e.fx) ? { x: e.fx[0], y: e.fx[1] } : undefined,
        pendG: Number(e.pendG) || undefined, pendP: Number(e.pendP) || undefined,   // v12
      });"""),
    ("""    this.exportHold = d.exportHold === true;""",
     """    this.exportHold = d.exportHold === true;
    // v12：应急联动恢复（旧档默认 0；在途出动车辆不保留）
    this.rescueFire = Math.max(0, Math.floor(Number(d.rescueFire) || 0));
    this.rescueAid = Math.max(0, Math.floor(Number(d.rescueAid) || 0));
    this.dispatch.length = 0;"""),
])

# ---- icons.ts：fire / shield 图标 ----
patch(I, [
    ("""  bridge: [""",
     """  fire: [
    '................',
    '.......r........',
    '......rr........',
    '......rRr.......',
    '.....rRRr.......',
    '.....rRRRr......',
    '....rRyyRr......',
    '....rRyyRr......',
    '...rRyWyRr......',
    '...rRyWyRRr.....',
    '..rRyyWyyRr.....',
    '..rRyyWyyRr.....',
    '.rRRyyWyyRRr....',
    '.rRRRyyRRRr.....',
    '..rRRRRRRr......',
    '...rr..rr.......',
  ],
  shield: [
    '................',
    '...WWWWWWWWWW...',
    '...WbbbbbbbbW...',
    '...WbbbbbbbbW...',
    '...WbbbWWbbbW...',
    '...WbbWWWWbbW...',
    '...WbbWWWWbbW...',
    '...WbbbWWbbbW...',
    '...WbbbbbbbbW...',
    '....WbbbbbbW....',
    '....WbbbbbbW....',
    '.....WbbbbW.....',
    '.....WbbbbW.....',
    '......WbbW......',
    '......WbbW......',
    '.......WW.......',
  ],
  bridge: ["""),
])

# ---- PixelCity.tsx：ICON_NAMES 增补 ----
patch(U, [
    ("""  'spr', 'sum', 'fall', 'win', 'drop', 'bridge',
  'camera', 'box',
];""",
     """  'spr', 'sum', 'fall', 'win', 'drop', 'bridge',
  'camera', 'box', 'fire', 'shield',
];"""),
])

print('v12-B done')
