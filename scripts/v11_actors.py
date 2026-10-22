#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v11-B actor 层：actors.ts 电车（kind 8）模型/精灵/系统全链路 + 修复 pickNext 宠物分支误拦 kind 5/6/7 的 bug"""
import pathlib

ROOT = pathlib.Path('/home/z/my-project')
A = ROOT / 'src/lib/pixelcity/actors.ts'

def patch(path, subs):
    src = path.read_text(encoding='utf-8')
    for old, new in subs:
        assert old in src, f'锚点未命中 @ {path.name}:\n---\n{old[:200]}\n---'
        assert src.count(old) == 1, f'锚点不唯一 @ {path.name}: {old[:80]!r} x{src.count(old)}'
        src = src.replace(old, new)
    path.write_text(src, encoding='utf-8')
    print(f'OK {path.name}: {len(subs)} 处补丁')

TRAM_MODEL = '''
// ------------------------------------------------------------
// v11 有轨电车：复古单节箱体 · 受电弓 · 双色涂装（干线绿 / 观光红）
// ------------------------------------------------------------

function tramModel(axis: 'x' | 'y', forward: 1 | -1, scheme: number): Model {
  const faces: Face[] = [];
  const along = (a: number, c: number): [number, number] => axis === 'x' ? [a, c] : [c, a];
  const bx = (a0: number, c0: number, a1: number, c1: number, z0: number, z1: number, mats: BoxMats) => {
    const [x0, y0] = along(a0, c0);
    const [x1, y1] = along(a1, c1);
    box(faces, x0, y0, x1, y1, z0, z1, mats);
  };
  // 涂装：0 翡翠绿/奶油（城市干线） 1 酒红/奶油（观光线）
  const main = scheme === 0 ? P.GRASS : P.RFRED;
  // 下层裙板（奶油 + 深色底盘）
  bx(2.8, 5.4, 21.2, 10.6, 0.9, 3.4, {
    right: () => cell(P.CREAM, 0), left: () => cell(P.CREAM, 0),
  });
  bx(2.8, 5.4, 21.2, 10.6, 0.5, 0.9, {
    right: () => cell(P.OUTLINE, 0), left: () => cell(P.OUTLINE, 0),
  });
  // 黄色饰条（裙板顶缘）
  bx(2.8, 5.3, 21.2, 10.7, 3.4, 4.1, {
    right: () => cell(P.YELLOW, 0), left: () => cell(P.PAINTY, 0),
  });
  // 上层主色车身
  bx(2.8, 5.4, 21.2, 10.6, 4.1, 9.0, {
    right: () => cell(main, 1), left: () => cell(main, 2),
  });
  // 侧窗带：6 扇大车窗
  for (let k = 0; k < 6; k++) {
    const a0 = 3.6 + k * 3.0;
    bx(a0, 5.2, a0 + 2.2, 10.7, 5.2, 8.4, {
      right: (u, v) => (v % 2 < 1 ? cell(P.GLASS, 0) : cell(P.GLASS, 1)),
      left: (u, v) => (v % 2 < 1 ? cell(P.GLASS, 1) : cell(P.GLASS, 2)),
    });
  }
  // 圆弧车顶（奶油）
  bx(3.2, 5.8, 20.8, 10.2, 9.0, 10.2, {
    top: pFlatRoof(P.CREAM, 1), right: () => cell(P.CREAM, 0), left: () => cell(P.CREAM, 0),
  });
  // 受电弓（前部：双斜臂 + 顶横杆）
  const pA0 = forward === 1 ? 16.2 : 5.0;
  const pA1 = forward === 1 ? 18.6 : 7.4;
  bx(pA0 + 0.3, 7.6, pA1 - 0.3, 7.9, 10.2, 13.6, { right: () => cell(P.METAL, 1), left: () => cell(P.METAL, 1) });
  bx(pA0 + 0.3, 8.1, pA1 - 0.3, 8.4, 10.2, 13.6, { right: () => cell(P.METAL, 1), left: () => cell(P.METAL, 1) });
  bx(pA0 - 0.6, 7.5, pA1 + 0.6, 8.5, 13.6, 14.3, {
    top: pFlatRoof(P.METAL, 2), right: () => cell(P.METAL, 0), left: () => cell(P.METAL, 0),
  });
  // 前脸：大挡风 + 路牌灯箱 + 双圆头灯（forward 端）
  const fA = forward === 1 ? 21.2 : 2.8;
  bx(fA - 0.1, 5.8, fA + 0.9, 10.2, 5.0, 8.8, {
    right: () => cell(P.GLASS, 2), left: () => cell(P.GLASS, 0),
  });
  bx(fA - 0.2, 6.0, fA + 1.0, 10.0, 8.9, 10.1, {
    right: () => cell(P.CREAM, 0), left: () => cell(P.YELLOW, 0),
  });
  bx(fA - 0.1, 5.9, fA + 0.7, 6.7, 3.6, 4.7, {
    right: () => cell(P.YELLOW, 0), left: () => cell(P.YELLOW, 0),
  });
  bx(fA - 0.1, 9.3, fA + 0.7, 10.1, 3.6, 4.7, {
    right: () => cell(P.YELLOW, 0), left: () => cell(P.YELLOW, 0),
  });
  // 尾灯（红）
  const rA = forward === 1 ? 2.8 : 21.2;
  bx(rA - 0.1, 5.9, rA + 0.7, 6.7, 3.6, 4.7, {
    right: () => cell(P.RED, 0), left: () => cell(P.RED, 0),
  });
  bx(rA - 0.1, 9.3, rA + 0.7, 10.1, 3.6, 4.7, {
    right: () => cell(P.RED, 0), left: () => cell(P.RED, 0),
  });
  // 车轮（半嵌裙板：前后两轴）
  for (const a of [5.0, 17.6]) {
    bx(a, 4.7, a + 2.2, 5.6, 0, 1.8, {
      right: () => cell(P.OUTLINE, 0), left: () => cell(P.OUTLINE, 0),
    });
    bx(a, 10.4, a + 2.2, 11.3, 0, 1.8, {
      right: () => cell(P.OUTLINE, 0), left: () => cell(P.OUTLINE, 0),
    });
  }
  return buildModel(faces, 24, 16);
}

export function buildTramSprites(): Map<string, Sprite> {
  const map = new Map<string, Sprite>();
  const cfg: Array<[CarDir, 'x' | 'y', 1 | -1]> = [
    ['e', 'x', 1], ['w', 'x', -1], ['s', 'y', 1], ['n', 'y', -1],
  ];
  for (const [dir, axis, fwd] of cfg) {
    for (let s = 0; s < 2; s++) {
      map.set(`${dir}#${s}`, renderModel(tramModel(axis, fwd, s), { shadow: false }));
    }
  }
  return map;
}
'''

patch(A, [
    # 头注释
    ("// actors.ts — 街头角色系统 v7：精细行人 + 职业 + 宠物 + 鸽群 + 车辆\n"
     "//              + 公交巴士 + 水上船舶 + 骑行者\n",
     "// actors.ts — 街头角色系统 v7：精细行人 + 职业 + 宠物 + 鸽群 + 车辆\n"
     "//              + 公交巴士 + 水上船舶 + 骑行者 + 有轨电车（v11）\n"),
    # Actor 类型：kind 8 电车
    ("  kind: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7; // 0 行人 / 1 车辆 / 2 狗 / 3 猫 / 4 鸽子 / 5 巴士 / 6 船舶 / 7 骑行者",
     "  kind: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8; // 0 行人 / 1 车辆 / 2 狗 / 3 猫 / 4 鸽子 / 5 巴士 / 6 船舶 / 7 骑行者 / 8 电车（v11）"),
    # 电车模型 + 精灵（插在巴士精灵工厂之后）
    ("export function buildBusSprites(): Map<string, Sprite> {",
     TRAM_MODEL + "\nexport function buildBusSprites(): Map<string, Sprite> {"),
    # 计数字段
    ("  buses = 0;\n  boats = 0;",
     "  buses = 0;\n  boats = 0;\n  trams = 0;                 // v11 有轨电车（独立于巴士计数）"),
    # 上限常量
    ("  static readonly BOAT_MAX = 3;",
     "  static readonly BOAT_MAX = 3;\n  static readonly TRAM_MAX = 2;"),
    # 目标值
    ("  private targetBus = 0;",
     "  private targetBus = 0;\n  private targetTram = 0;"),
    # 车站格缓存
    ("  /** v7 车站路侧格缓存（巴士环线目的地表） */\n"
     "  private stopTiles: Array<[number, number]> = [];",
     "  /** v7 车站路侧格缓存（巴士环线目的地表） */\n"
     "  private stopTiles: Array<[number, number]> = [];\n"
     "  /** v11 电车站路侧格缓存（电车干线目的地表） */\n"
     "  private tramTiles: Array<[number, number]> = [];"),
    # 精灵缓存
    ("  private busSprites: Map<string, Sprite> | null = null;",
     "  private busSprites: Map<string, Sprite> | null = null;\n  private tramSprites: Map<string, Sprite> | null = null;"),
    # ensureSprites
    ("    if (!this.busSprites) this.busSprites = buildBusSprites();",
     "    if (!this.busSprites) this.busSprites = buildBusSprites();\n    if (!this.tramSprites) this.tramSprites = buildTramSprites();"),
    # tramSp 访问器（busSp 之后）
    ("  busSp(dir: CarDir, scheme: number): Sprite | null {\n"
     "    return this.busSprites?.get(`${dir}#${scheme % 2}`) ?? null;\n  }",
     "  busSp(dir: CarDir, scheme: number): Sprite | null {\n"
     "    return this.busSprites?.get(`${dir}#${scheme % 2}`) ?? null;\n  }\n\n"
     "  tramSp(dir: CarDir, scheme: number): Sprite | null {\n"
     "    return this.tramSprites?.get(`${dir}#${scheme % 2}`) ?? null;\n  }"),
    # syncTargets：电车目标（巴士之后）
    ("    // 巴士：≥2 座连通车站才开通环线（2-3 站 1 辆 / 4-5 站 2 辆 / 6+ 站 3 辆）\n"
     "    this.targetBus = this.stopTiles.length >= 2\n"
     "      ? Math.min(ActorSystem.BUS_MAX, 1 + ((this.stopTiles.length - 2) >> 1)) : 0;",
     "    // 巴士：≥2 座连通车站才开通环线（2-3 站 1 辆 / 4-5 站 2 辆 / 6+ 站 3 辆）\n"
     "    this.targetBus = this.stopTiles.length >= 2\n"
     "      ? Math.min(ActorSystem.BUS_MAX, 1 + ((this.stopTiles.length - 2) >> 1)) : 0;\n"
     "    // v11 电车：≥2 座连通车站开通干线（2-5 站 1 列 / 6+ 站 2 列）\n"
     "    this.targetTram = this.tramTiles.length >= 2\n"
     "      ? Math.min(ActorSystem.TRAM_MAX, 1 + ((this.tramTiles.length - 2) >> 2)) : 0;"),
    # scanTransit：初始化 + 电车站扫描
    ("  private scanTransit(map: CityMap): void {\n"
     "    this.stopTiles = [];",
     "  private scanTransit(map: CityMap): void {\n"
     "    this.stopTiles = [];\n"
     "    this.tramTiles = [];"),
    ("      if (o.id === 'busstop') {\n"
     "        // 车站 1×1：四向找邻接道路格\n"
     "        for (const [dx, dy] of DIRS) {\n"
     "          const nx = o.ax + dx, ny = o.ay + dy;\n"
     "          if (map.inB(nx, ny) && map.road[map.idx(nx, ny)]) {\n"
     "            this.stopTiles.push([nx, ny]);\n"
     "            break;\n"
     "          }\n"
     "        }\n"
     "      } else if (o.id === 'ferry') {",
     "      if (o.id === 'busstop' || o.id === 'tramstop') {\n"
     "        // 车站 1×1：四向找邻接道路格（v11 电车站与巴士站同法）\n"
     "        for (const [dx, dy] of DIRS) {\n"
     "          const nx = o.ax + dx, ny = o.ay + dy;\n"
     "          if (map.inB(nx, ny) && map.road[map.idx(nx, ny)]) {\n"
     "            if (o.id === 'tramstop') this.tramTiles.push([nx, ny]);\n"
     "            else this.stopTiles.push([nx, ny]);\n"
     "            break;\n"
     "          }\n"
     "        }\n"
     "      } else if (o.id === 'ferry') {"),
    # newTrip：kind 8
    ("    if (a.kind === 5) return this.busTrip(map, a);",
     "    if (a.kind === 5) return this.busTrip(map, a);\n    if (a.kind === 8) return this.tramTrip(map, a);"),
    # tramTrip + spawnTram（spawnBus 之后）
    ("  /** v7 船舶出生：渡轮码头泊位出航（首艘渡轮 / 后续帆船与渔船混编） */",
     "  /** v11 电车行程：开往下一座电车站（站距 ≥6 格的干线区间） */\n"
     "  private tramTrip(map: CityMap, a: Actor): Array<[number, number]> | null {\n"
     "    if (this.tramTiles.length >= 2) {\n"
     "      const cands = this.tramTiles\n"
     "        .filter(s => Math.abs(s[0] - a.fx) + Math.abs(s[1] - a.fy) >= 6)\n"
     "        .sort(() => Math.random() - 0.5);\n"
     "      for (const s of cands) {\n"
     "        const p = bfsRoad(map, a.fx, a.fy, s);\n"
     "        if (p && p.length) { a.path = p; return p; }\n"
     "      }\n"
     "    }\n"
     "    const p = findPath(map, a.fx, a.fy, 24, 120);   // 兜底：普通路网行程\n"
     "    a.path = p;\n"
     "    return p;\n"
     "  }\n\n"
     "  /** v11 电车出生：电车站旁路格发车（翡翠绿干线 / 酒红观光线） */\n"
     "  private spawnTram(map: CityMap): void {\n"
     "    if (this.tramTiles.length < 2) return;\n"
     "    const spot = this.tramTiles[Math.floor(Math.random() * this.tramTiles.length)];\n"
     "    const [x, y] = spot;\n"
     "    const opts = DIRS.filter(([dx, dy]) =>\n"
     "      map.inB(x + dx, y + dy) && map.road[map.idx(x + dx, y + dy)]);\n"
     "    if (!opts.length) return;\n"
     "    const d = opts[Math.floor(Math.random() * opts.length)];\n"
     "    const a: Actor = {\n"
     "      kind: 8, fx: x, fy: y, dx: d[0], dy: d[1], t: 0,\n"
     "      speed: 1.05 + Math.random() * 0.25,      // 电车区间速度（略缓于巴士，起步稳）\n"
     "      look: Math.random() < 0.55 ? 0 : 1,       // 涂装：干线翡翠绿 / 观光酒红\n"
     "      body: 0, role: 0, phase: Math.random() * 1000,\n"
     "      offX: 0, offY: 0, path: null, wait: 0.6, master: null, gone: false,\n"
     "    };\n"
     "    this.tramTrip(map, a);\n"
     "    this.actors.push(a);\n"
     "    this.trams++;\n"
     "  }\n\n"
     "  /** v7 船舶出生：渡轮码头泊位出航（首艘渡轮 / 后续帆船与渔船混编） */"),
    # tick：电车补减（巴士块之后）
    ("      // v7 船舶：码头数量驱动出航 / 归航（冬季冰封全数归航）",
     "      // v11 电车：电车站数量驱动发车 / 收车\n"
     "      const deficitTram = this.targetTram - this.trams;\n"
     "      if (deficitTram > 0) {\n"
     "        this.spawnTram(map);\n"
     "      } else if (deficitTram < 0) {\n"
     "        const i = this.actors.findIndex(x => x.kind === 8);\n"
     "        if (i >= 0) { this.actors[i].gone = true; this.actors.splice(i, 1); this.trams--; }\n"
     "      }\n"
     "      // v7 船舶：码头数量驱动出航 / 归航（冬季冰封全数归航）"),
    # 到站停驻
    ("          else if (a.kind === 5) a.wait = 2.2 + Math.random() * 1.8;   // v7 巴士到站：上下客",
     "          else if (a.kind === 5) a.wait = 2.2 + Math.random() * 1.8;   // v7 巴士到站：上下客\n"
     "          else if (a.kind === 8) a.wait = 2.6 + Math.random() * 2.2;   // v11 电车到站：乘客上下（低地板稍慢）"),
    # ★ 修复 pickNext 宠物分支误拦 kind ≥ 5（巴士/船舶/骑行者/电车回归各自路径与兜底逻辑）
    ("    // —— 宠物分支（v3）——\n    if (a.kind >= 2) {",
     "    // —— 宠物分支（v3；v11 修复：仅狗/猫，此前 kind>=2 误拦巴士/船舶/骑行者路径）——\n"
     "    if (a.kind === 2 || a.kind === 3) {"),
    # removeCount
    ("    else if (a.kind === 5) this.buses--;",
     "    else if (a.kind === 5) this.buses--;\n    else if (a.kind === 8) this.trams--;"),
    # laneOffset
    ("    if (a.kind === 5) return [-a.dy * 2.6, a.dx * 2.6];",
     "    if (a.kind === 5 || a.kind === 8) return [-a.dy * 2.6, a.dx * 2.6];"),
    # clear
    ("    this.buses = 0;\n    this.boats = 0;\n    this.tourists = 0;\n    this.dirty = true;",
     "    this.buses = 0;\n    this.boats = 0;\n    this.trams = 0;\n    this.tourists = 0;\n    this.dirty = true;"),
])

print('v11-B 完成')
