#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v12-C 城市卫士：actors.ts 应急车辆系统
- 消防车/救护车/巡逻警车三车型（kind 9/10/11）+ 四向精灵
- 任务相位机：0 前往现场 → 1 到场处置(回调 engine) → 2 返程收车
- dispatchEmergency 出动 API + adjRoad 邻路格查找 + spawnPatrol 巡逻常驻"""
import pathlib

ROOT = pathlib.Path('/home/z/my-project')
A = ROOT / 'src/lib/pixelcity/actors.ts'

def patch(path, subs):
    src = path.read_text(encoding='utf-8')
    for old, new in subs:
        assert old in src, f'锚点未命中 @ {path.name}:\n---\n{old[:260]}\n---'
        assert src.count(old) == 1, f'锚点不唯一 @ {path.name}: {old[:80]!r} x{src.count(old)}'
        src = src.replace(old, new)
    path.write_text(src, encoding='utf-8')
    print(f'OK {path.name}: {len(subs)} 处补丁')

patch(A, [
    # ---- 1. Actor 接口：kind 扩展 + mission 字段 ----
    ("""  kind: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8; // 0 行人 / 1 车辆 / 2 狗 / 3 猫 / 4 鸽子 / 5 巴士 / 6 船舶 / 7 骑行者 / 8 电车（v11）""",
     """  kind: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11;
  // 0 行人 / 1 车辆 / 2 狗 / 3 猫 / 4 鸽子 / 5 巴士 / 6 船舶 / 7 骑行者 / 8 电车（v11）
  // 9 消防车 / 10 救护车 / 11 巡逻警车（v12 城市卫士）"""),
    ("""  tour?: boolean;                  // v10 系统游客（景点漫步，短行程，独立于市民行人池）
};""",
     """  tour?: boolean;                  // v10 系统游客（景点漫步，短行程，独立于市民行人池）
  /** v12 应急任务（消防车/救护车）：tx,ty=事故格 hx,hy=归队设施格 phase=0前往/1处置/2返程 */
  mission?: { tx: number; ty: number; hx: number; hy: number; phase: 0 | 1 | 2 };
};"""),
    # ---- 2. 三车型建模（插在 v11 电车段之前） ----
    ("""// ------------------------------------------------------------
// v11 有轨电车：复古单节箱体 · 受电弓 · 双色涂装（干线绿 / 观光红）
// ------------------------------------------------------------""",
     """// ------------------------------------------------------------
// v12 城市卫士：应急车队三车型
//   消防车：消防红车身 + 白色保险杠 + 侧梯架 + 顶部红色警灯
//   救护车：纯白车身 + 侧面红十字 + 顶部红蓝双警灯
//   巡逻警车：黑白双色涂装 + 侧面红色「警」标 + 顶部红色横排警灯
// ------------------------------------------------------------

function emgChassis(
  faces: Face[], axis: 'x' | 'y', forward: 1 | -1, len: number,
  lower: number, upper: number, mainRamp: number,
  beacon: Array<[number, number, number, number, string]>,
): void {
  const along = (a: number, c: number): [number, number] => axis === 'x' ? [a, c] : [c, a];
  const bx = (a0: number, c0: number, a1: number, c1: number, z0: number, z1: number, mats: BoxMats) => {
    const [x0, y0] = along(a0, c0);
    const [x1, y1] = along(a1, c1);
    box(faces, x0, y0, x1, y1, z0, z1, mats);
  };
  const a0 = 2.0, a1 = len;                  // 车长范围（2..len）
  const c0 = 5.4, c1 = 10.6;                 // 车宽范围
  // 下层裙板（深色底盘）+ 上层车身（主色）
  bx(a0, c0, a1, c1, 0.9, 3.4, {
    right: () => cell(P.SIDE, 0), left: () => cell(P.SIDE, 0),
  });
  bx(a0, c0, a1, c1, 3.4, upper, {
    right: () => cell(mainRamp, 1), left: () => cell(mainRamp, 2),
  });
  void lower;
  // 车顶（浅色）
  bx(a0 + 0.4, c0 + 0.4, a1 - 0.4, c1 - 0.4, upper, upper + 0.8, {
    top: pFlatRoof(P.TAN, 1), right: () => cell(P.CREAM, 0), left: () => cell(P.CREAM, 0),
  });
  // 顶部警灯组（相对车长中点的 [da0,da1,c0,c1] 色块）
  const mid = (a0 + a1) / 2;
  for (const [da0, da1, cc0, cc1, col] of beacon) {
    const w0 = Math.max(6.4, Math.min(9.6, cc0)), w1 = Math.max(6.4, Math.min(9.6, cc1));
    bx(mid + da0, w0, mid + da1, w1, upper + 0.8, upper + 2.4, {
      right: () => cell(col, 0), left: () => cell(col, 1), top: () => cell(col, 0),
    });
  }
  // 前脸：挡风玻璃 + 保险杠（车头在 forward 一端）
  const fA = forward === 1 ? a1 : a0;
  bx(fA - 0.1, c0 + 0.4, fA + 0.9, c1 - 0.4, 4.2, 7.0, {
    right: () => cell(P.GLASS, 2), left: () => cell(P.GLASS, 0),
  });
  bx(fA - 0.2, c0 + 0.2, fA + 1.0, c1 - 0.2, 1.0, 3.8, {
    right: () => cell(P.CREAM, 1), left: () => cell(P.CREAM, 1),
  });
  // 前灯（黄）/ 尾灯（红）
  bx(fA - 0.1, c0 + 0.6, fA + 0.7, c0 + 1.4, 2.0, 2.9, {
    right: () => cell(P.YELLOW, 0), left: () => cell(P.YELLOW, 0),
  });
  const rA = forward === 1 ? a0 : a1;
  bx(rA - 0.1, c0 + 0.6, rA + 0.7, c0 + 1.4, 2.0, 2.9, {
    right: () => cell(P.RED, 0), left: () => cell(P.RED, 0),
  });
  // 车轮：前后两轴（深色轮毂）
  for (const a of [a0 + 2.4, a1 - 4.6]) {
    bx(a, c0 - 0.6, a + 2.4, c0 + 0.3, 0, 2.0, {
      right: () => cell(P.OUTLINE, 0), left: () => cell(P.OUTLINE, 0),
    });
    bx(a, c1 - 0.3, a + 2.4, c1 + 0.6, 0, 2.0, {
      right: () => cell(P.OUTLINE, 0), left: () => cell(P.OUTLINE, 0),
    });
  }
}

/** v12 消防车：消防红 + 双侧窗 + 侧白条梯架 + 顶部红色警灯 */
function firetruckModel(axis: 'x' | 'y', forward: 1 | -1): Model {
  const faces: Face[] = [];
  emgChassis(faces, axis, forward, 19.0, 0, 8.0, P.RED, [[-1.0, 1.0, 7.2, 8.8, P.RED]]);
  const along = (a: number, c: number): [number, number] => axis === 'x' ? [a, c] : [c, a];
  const box2 = (a0: number, c0: number, a1: number, c1: number, z0: number, z1: number, mats: BoxMats) => {
    const [x0, y0] = along(a0, c0);
    const [x1, y1] = along(a1, c1);
    box(faces, x0, y0, x1, y1, z0, z1, mats);
  };
  // 驾驶室侧窗 ×2（前部）
  for (const w of [12.6, 15.8]) {
    box2(w, 5.2, w + 2.0, 10.7, 4.2, 6.6, {
      right: (u, v) => (v % 2 < 1 ? cell(P.GLASS, 0) : cell(P.GLASS, 1)),
      left: (u, v) => (v % 2 < 1 ? cell(P.GLASS, 1) : cell(P.GLASS, 2)),
    });
  }
  // 车侧白条 + 后段梯架（两侧外贴 0.2）
  box2(3.2, 5.1, 11.8, 5.3, 4.0, 7.4, {
    right: () => cell(P.CREAM, 0), left: () => cell(P.SIDE, 0),
  });
  for (const a of [4.0, 6.2, 8.4]) {
    box2(a, 5.0, a + 1.4, 5.4, 8.6, 9.8, {
      right: () => cell(P.CREAM, 1), left: () => cell(P.SIDE, 0),
    });
  }
  return buildModel(faces, 22, 14);
}

/** v12 救护车：纯白车身 + 侧面红十字 + 顶部红蓝双警灯 */
function ambulanceModel(axis: 'x' | 'y', forward: 1 | -1): Model {
  const faces: Face[] = [];
  emgChassis(faces, axis, forward, 17.6, 0, 7.8, P.CREAM, [[-1.6, -0.4, 6.8, 7.8, P.RED], [0.4, 1.6, 8.2, 9.2, P.NEONC]]);
  const along = (a: number, c: number): [number, number] => axis === 'x' ? [a, c] : [c, a];
  const box2 = (a0: number, c0: number, a1: number, c1: number, z0: number, z1: number, mats: BoxMats) => {
    const [x0, y0] = along(a0, c0);
    const [x1, y1] = along(a1, c1);
    box(faces, x0, y0, x1, y1, z0, z1, mats);
  };
  // 驾驶室侧窗 ×2
  for (const w of [11.4, 14.2]) {
    box2(w, 5.2, w + 1.8, 10.7, 4.2, 6.4, {
      right: (u, v) => (v % 2 < 1 ? cell(P.GLASS, 0) : cell(P.GLASS, 1)),
      left: (u, v) => (v % 2 < 1 ? cell(P.GLASS, 1) : cell(P.GLASS, 2)),
    });
  }
  // 侧面红十字（两侧外贴 0.2）
  for (const side of [5.2, 10.7]) {
    const cB = side === 5.2 ? 5.0 : 10.9;
    box2(6.4, cB, 7.8, cB + 0.2, 4.6, 7.0, {
      right: () => cell(P.RED, 0), left: () => cell(P.RED, 0), top: () => cell(P.RED, 0),
    });
    box2(5.6, cB, 8.6, cB + 0.2, 5.2, 6.4, {
      right: () => cell(P.RED, 0), left: () => cell(P.RED, 0), top: () => cell(P.RED, 0),
    });
  }
  return buildModel(faces, 22, 14);
}

/** v12 巡逻警车：黑白双色 + 侧面红色「警」标 + 顶部横排红色警灯 */
function patrolModel(axis: 'x' | 'y', forward: 1 | -1): Model {
  const faces: Face[] = [];
  emgChassis(faces, axis, forward, 15.6, 0, 7.6, P.CREAM, [[-1.8, 1.8, 7.0, 9.0, P.RED]]);
  const along = (a: number, c: number): [number, number] => axis === 'x' ? [a, c] : [c, a];
  const box2 = (a0: number, c0: number, a1: number, c1: number, z0: number, z1: number, mats: BoxMats) => {
    const [x0, y0] = along(a0, c0);
    const [x1, y1] = along(a1, c1);
    box(faces, x0, y0, x1, y1, z0, z1, mats);
  };
  // 前后黑色段（经典黑白警车涂装）
  for (const seg of [[2.0, 6.2], [11.4, 15.6]] as const) {
    box2(seg[0], 5.3, seg[1], 10.7, 3.4, 7.6, {
      right: () => cell(P.OUTLINE, 0), left: () => cell(P.OUTLINE, 1),
    });
  }
  // 驾驶室侧窗 ×2
  for (const w of [7.0, 10.0]) {
    box2(w, 5.2, w + 1.8, 10.8, 4.2, 6.4, {
      right: (u, v) => (v % 2 < 1 ? cell(P.GLASS, 0) : cell(P.GLASS, 1)),
      left: (u, v) => (v % 2 < 1 ? cell(P.GLASS, 1) : cell(P.GLASS, 2)),
    });
  }
  // 侧面红色「警」徽（两侧外贴）
  for (const cB of [5.0, 10.9]) {
    box2(6.8, cB, 8.2, cB + 0.2, 4.4, 6.0, {
      right: () => cell(P.RED, 0), left: () => cell(P.RED, 0), top: () => cell(P.RED, 0),
    });
  }
  return buildModel(faces, 22, 14);
}

// ------------------------------------------------------------
// v11 有轨电车：复古单节箱体 · 受电弓 · 双色涂装（干线绿 / 观光红）
// ------------------------------------------------------------"""),
    # ---- 3. buildEmergencySprites ----
    ("""export function buildBusSprites(): Map<string, Sprite> {
  const map = new Map<string, Sprite>();
  const cfg: Array<[CarDir, 'x' | 'y', 1 | -1]> = [
    ['e', 'x', 1], ['w', 'x', -1], ['s', 'y', 1], ['n', 'y', -1],
  ];
  for (const [dir, axis, fwd] of cfg) {
    for (let s = 0; s < 2; s++) {
      map.set(`${dir}#${s}`, renderModel(busModel(axis, fwd, s), { shadow: false }));
    }
  }
  return map;
}""",
     """export function buildBusSprites(): Map<string, Sprite> {
  const map = new Map<string, Sprite>();
  const cfg: Array<[CarDir, 'x' | 'y', 1 | -1]> = [
    ['e', 'x', 1], ['w', 'x', -1], ['s', 'y', 1], ['n', 'y', -1],
  ];
  for (const [dir, axis, fwd] of cfg) {
    for (let s = 0; s < 2; s++) {
      map.set(`${dir}#${s}`, renderModel(busModel(axis, fwd, s), { shadow: false }));
    }
  }
  return map;
}

/** v12 应急车队精灵：消防车 / 救护车 / 巡逻警车 × 四向 */
export function buildEmergencySprites(): Map<string, Sprite> {
  const map = new Map<string, Sprite>();
  const cfg: Array<[CarDir, 'x' | 'y', 1 | -1]> = [
    ['e', 'x', 1], ['w', 'x', -1], ['s', 'y', 1], ['n', 'y', -1],
  ];
  for (const [dir, axis, fwd] of cfg) {
    map.set(`9#${dir}`, renderModel(firetruckModel(axis, fwd), { shadow: false }));
    map.set(`10#${dir}`, renderModel(ambulanceModel(axis, fwd), { shadow: false }));
    map.set(`11#${dir}`, renderModel(patrolModel(axis, fwd), { shadow: false }));
  }
  return map;
}"""),
    # ---- 4. ActorSystem 字段 ----
    ("""  /** v10 当前游客人数（引擎回写 tycoon.tourists；驱动景点漫步游客出生） */
  touristsNow = 0;""",
     """  /** v10 当前游客人数（引擎回写 tycoon.tourists；驱动景点漫步游客出生） */
  touristsNow = 0;
  /** v12 应急车辆：出动中消防车 / 救护车数 + 常驻巡逻车（交班驱动，治安巡逻令 +1） */
  firetrucks = 0;
  ambulances = 0;
  patrols = 0;
  /** 巡逻车编制（engine 每帧回写：交班数 + 治安巡逻令加成，上限 3） */
  patrolCap = 0;
  /** v12 应急车到场回调（engine 接线 → tycoon.resolveEvent） */
  onRescueArrive: ((kind: 9 | 10, tx: number, ty: number) => void) | null = null;
  private targetPatrol = 0;"""),
    ("""  /** v11 电车站路侧格缓存（电车干线目的地表） */
  private tramTiles: Array<[number, number]> = [];""",
     """  /** v11 电车站路侧格缓存（电车干线目的地表） */
  private tramTiles: Array<[number, number]> = [];
  /** v12 交班邻路格缓存（巡逻车出生点） */
  private kobanTiles: Array<[number, number]> = [];"""),
    ("""  private bikeSprites: Map<string, Sprite> | null = null;""",
     """  private bikeSprites: Map<string, Sprite> | null = null;
  private emgSprites: Map<string, Sprite> | null = null;"""),
    # ---- 5. ensureSprites + emergencySp ----
    ("""    if (!this.bikeSprites) this.bikeSprites = buildBikeSprites();
  }""",
     """    if (!this.bikeSprites) this.bikeSprites = buildBikeSprites();
    if (!this.emgSprites) this.emgSprites = buildEmergencySprites();
  }"""),
    ("""  bikeSp(dir: CarDir, look: number, frame: number): Sprite | null {
    const c = ((look % 4) + 4) % 4;
    return this.bikeSprites?.get(`${dir}#${c}#${frame % 2}`) ?? null;
  }""",
     """  bikeSp(dir: CarDir, look: number, frame: number): Sprite | null {
    const c = ((look % 4) + 4) % 4;
    return this.bikeSprites?.get(`${dir}#${c}#${frame % 2}`) ?? null;
  }

  /** v12 应急车辆精灵：k 9 消防车 / 10 救护车 / 11 巡逻警车 */
  emergencySp(k: 9 | 10 | 11, dir: CarDir): Sprite | null {
    return this.emgSprites?.get(`${k}#${dir}`) ?? null;
  }"""),
    # ---- 6. scanTransit：交班邻路格 ----
    ("""  private scanTransit(map: CityMap): void {
    this.stopTiles = [];
    this.tramTiles = [];
    this.ferryDocks = [];
    this.attractTiles = [];""",
     """  private scanTransit(map: CityMap): void {
    this.stopTiles = [];
    this.tramTiles = [];
    this.ferryDocks = [];
    this.attractTiles = [];
    this.kobanTiles = [];"""),
    ("""      if (o.id === 'busstop' || o.id === 'tramstop') {""",
     """      if (o.id === 'koban') {
        // v12 交班：邻接道路格 = 巡逻车出生点
        const t = this.adjRoad(map, o.ax, o.ay, 1);
        if (t) this.kobanTiles.push(t);
      } else if (o.id === 'busstop' || o.id === 'tramstop') {"""),
    # ---- 7. newTrip：巡逻车长途行程 ----
    ("""    if (a.kind === 5) return this.busTrip(map, a);
    if (a.kind === 8) return this.tramTrip(map, a);""",
     """    if (a.kind === 5) return this.busTrip(map, a);
    if (a.kind === 8) return this.tramTrip(map, a);
    if (a.kind === 11) {                       // v12 巡逻警车：长途街区巡逻
      const p = findPath(map, a.fx, a.fy, 30, 160);
      a.path = p;
      return p;
    }"""),
    # ---- 8. 出动 / 邻路 / 巡逻出生（插在 spawnTram 之后） ----
    ("""    this.tramTrip(map, a);
    this.actors.push(a);
    this.trams++;
  }""",
     """    this.tramTrip(map, a);
    this.actors.push(a);
    this.trams++;
  }

  /** 建筑足迹周边 maxRing 环内最近的道路格（1×1 / 2×2 通吃） */
  private adjRoad(map: CityMap, x: number, y: number, maxRing: number): [number, number] | null {
    for (let ring = 1; ring <= maxRing; ring++) {
      let best: [number, number] | null = null, bd = 1e9;
      for (let dy = -ring; dy <= ring; dy++) {
        for (let dx = -ring; dx <= ring; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue;
          const nx = x + dx, ny = y + dy;
          if (!map.inB(nx, ny)) continue;
          if (!map.road[map.idx(nx, ny)]) continue;
          const d = Math.abs(dx) + Math.abs(dy);
          if (d < bd) { bd = d; best = [nx, ny]; }
        }
      }
      if (best) return best;
    }
    return null;
  }

  /** v12 应急出动：消防车 / 救护车自设施邻路格驰援事故现场（无路可达返回 false） */
  dispatchEmergency(map: CityMap, kind: 9 | 10, hx: number, hy: number, tx: number, ty: number): boolean {
    this.ensureSprites();
    const home = this.adjRoad(map, hx, hy, 1);
    if (!home) return false;
    const site = this.adjRoad(map, tx, ty, 3);
    if (!site) return false;
    const p = bfsRoad(map, home[0], home[1], site);
    if (!p || !p.length) return false;
    const nxt = p.shift()!;
    const a: Actor = {
      kind, fx: home[0], fy: home[1], dx: nxt[0], dy: nxt[1], t: 0,
      speed: 1.55 + Math.random() * 0.25,        // 一路警笛，快于巴士
      look: 0, body: 0, role: 0, phase: Math.random() * 1000,
      offX: 0, offY: 0, path: p, wait: 0.25, master: null, gone: false,
      mission: { tx, ty, hx: home[0], hy: home[1], phase: 0 },
    };
    this.actors.push(a);
    if (kind === 9) this.firetrucks++; else this.ambulances++;
    return true;
  }

  /** v12 巡逻警车出生：交班旁路格发车，全城街区巡逻 */
  private spawnPatrol(map: CityMap): void {
    if (!this.kobanTiles.length) return;
    const [x, y] = this.kobanTiles[(Math.random() * this.kobanTiles.length) | 0];
    const a: Actor = {
      kind: 11, fx: x, fy: y, dx: 0, dy: 1, t: 0,
      speed: 1.15 + Math.random() * 0.25,
      look: 0, body: 0, role: 0, phase: Math.random() * 1000,
      offX: 0, offY: 0, path: null, wait: 0.3, master: null, gone: false,
    };
    const p = this.newTrip(map, a);
    if (p && p.length) {
      const nxt = p.shift()!;
      a.dx = nxt[0]; a.dy = nxt[1];
    }
    this.actors.push(a);
    this.patrols++;
  }"""),
    # ---- 9. pickNext：应急任务相位机 ----
    ("""  private pickNext(map: CityMap, a: Actor): boolean {
    // —— 鸽子分支（v4）——
    if (a.kind === 4) {""",
     """  private pickNext(map: CityMap, a: Actor): boolean {
    // —— v12 应急车辆：任务相位机（0 前往现场 → 1 到场处置 → 2 返程收车）——
    if (a.kind === 9 || a.kind === 10) {
      if (a.path && a.path.length) {
        const nxt = a.path.shift()!;
        a.dx = nxt[0]; a.dy = nxt[1];
        return true;
      }
      const m = a.mission!;
      if (m.phase === 0) {
        // 抵达事故现场：掉头朝向来路 → 原地处置（消防喷水 6.5s / 急救接载 5s）
        m.phase = 1;
        a.dx = -a.dx; a.dy = -a.dy;
        a.wait = a.kind === 9 ? 6.5 : 5.0;
        this.onRescueArrive?.(a.kind, m.tx, m.ty);
        return true;
      }
      if (m.phase === 1) {
        // 处置完毕 → 返程回站（无路可达则就地收车）
        m.phase = 2;
        const p = bfsRoad(map, a.fx, a.fy, [m.hx, m.hy]);
        if (p && p.length) {
          a.path = p;
          const nxt = p.shift()!;
          a.dx = nxt[0]; a.dy = nxt[1];
          return true;
        }
        return false;
      }
      return false;   // 归队 → 收车
    }
    // —— 鸽子分支（v4）——
    if (a.kind === 4) {"""),
    # ---- 10. 到站等待块：排除应急车（相位机自管 wait） ----
    ("""        if ((a.kind <= 1 || a.kind >= 5) && (!a.path || a.path.length === 0)) {""",
     """        if ((a.kind <= 1 || a.kind === 11 || (a.kind >= 5 && a.kind <= 8)) && (!a.path || a.path.length === 0)) {"""),
    # ---- 11. removeCount ----
    ("""    else if (a.kind === 8) this.trams--;""",
     """    else if (a.kind === 8) this.trams--;
    else if (a.kind === 9) this.firetrucks--;
    else if (a.kind === 10) this.ambulances--;
    else if (a.kind === 11) this.patrols--;"""),
    # ---- 12. laneOffset：应急车靠右疾驰 ----
    ("""    if (a.kind !== 1) return [a.offX, a.offY];
    return [-a.dy * 2.3, a.dx * 2.3];""",
     """    if (a.kind !== 1 && a.kind < 9) return [a.offX, a.offY];
    return [-a.dy * 2.3, a.dx * 2.3];   // 车辆 / v12 应急车队靠右"""),
    # ---- 13. syncTargets：巡逻编制 ----
    ("""    // ---- v7 公交 / 航运 ----
    this.scanTransit(map);""",
     """    // ---- v7 公交 / 航运 ----
    this.scanTransit(map);
    // v12 巡逻警车编制（交班常驻 + 治安巡逻令，engine 折算进 patrolCap）
    this.targetPatrol = this.patrolCap;"""),
    # ---- 14. spawnCd：巡逻车补减 ----
    ("""      // v10 游客：游客人数驱动景点漫步（酒店歇脚，景点打卡）
      const deficitTourist = this.targetTourist - this.tourists;
      if (deficitTourist > 0) {
        if (Math.random() < 0.4) this.spawnTourist(map);
      } else if (deficitTourist < 0) {
        const i = this.actors.findIndex(x => x.tour === true);
        if (i >= 0) { this.actors[i].gone = true; this.actors.splice(i, 1); this.tourists--; }
      }""",
     """      // v10 游客：游客人数驱动景点漫步（酒店歇脚，景点打卡）
      const deficitTourist = this.targetTourist - this.tourists;
      if (deficitTourist > 0) {
        if (Math.random() < 0.4) this.spawnTourist(map);
      } else if (deficitTourist < 0) {
        const i = this.actors.findIndex(x => x.tour === true);
        if (i >= 0) { this.actors[i].gone = true; this.actors.splice(i, 1); this.tourists--; }
      }
      // v12 巡逻警车：交班编制驱动（出生点为交班邻路格）
      const deficitPatrol = this.targetPatrol - this.patrols;
      if (deficitPatrol > 0) {
        this.spawnPatrol(map);
      } else if (deficitPatrol < 0) {
        const i = this.actors.findIndex(x => x.kind === 11);
        if (i >= 0) { this.actors[i].gone = true; this.actors.splice(i, 1); this.patrols--; }
      }"""),
    # ---- 15. clear() ----
    ("""    this.trams = 0;
    this.tourists = 0;
    this.dirty = true;
  }""",
     """    this.trams = 0;
    this.tourists = 0;
    this.firetrucks = 0;
    this.ambulances = 0;
    this.patrols = 0;
    this.dirty = true;
  }"""),
])

print('v12-C done')
