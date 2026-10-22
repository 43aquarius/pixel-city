#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v10：actors.ts 游客 actor 系统（景点漫步游客，独立于普通行人计数）"""
P = '/home/z/my-project/src/lib/pixelcity/actors.ts'
src = open(P, encoding='utf-8').read()
n0 = len(src)

def rep(old, new, cnt=1, tag=''):
    global src
    assert src.count(old) == cnt, f'[{tag}] expect {cnt}, got {src.count(old)}: {old[:60]!r}'
    src = src.replace(old, new, cnt)
    print(f'  ok  {tag}')

# 1. import ATTRACT
rep("import { defById } from './catalog';",
    "import { defById, ATTRACT } from './catalog';", tag='import')

# 2. Actor 类型：tour 标记（系统游客：景点漫步、短行程、独立计数）
rep("""  thx?: number; thy?: number;      // 威胁来源坐标（受惊时记录）
};""",
"""  thx?: number; thy?: number;      // 威胁来源坐标（受惊时记录）
  tour?: boolean;                  // v10 系统游客（景点漫步，短行程，独立于市民行人池）
};""", tag='Actor.tour')

# 3. 计数器与目标
rep("""  peds = 0;
  cars = 0;
  pets = 0;
  birds = 0;
  buses = 0;
  boats = 0;
  enabled = true;""",
"""  peds = 0;
  cars = 0;
  pets = 0;
  birds = 0;
  buses = 0;
  boats = 0;
  tourists = 0;              // v10 系统游客（含在 actors 内，独立于 peds 计数）
  enabled = true;""", tag='tourists 计数')

rep("""  static readonly BUS_MAX = 3;
  static readonly BOAT_MAX = 3;""",
"""  static readonly BUS_MAX = 3;
  static readonly BOAT_MAX = 3;
  static readonly TOURIST_MAX = 14;""", tag='TOURIST_MAX')

rep("""  /** 经营模式实际人口（引擎回写；null=沙盒按建筑容量推导）。人口越多街道越热闹 */
  popNow: number | null = null;""",
"""  /** 经营模式实际人口（引擎回写；null=沙盒按建筑容量推导）。人口越多街道越热闹 */
  popNow: number | null = null;
  /** v10 当前游客人数（引擎回写 tycoon.tourists；驱动景点漫步游客出生） */
  touristsNow = 0;""", tag='touristsNow')

rep("""  private targetBus = 0;
  private targetBoat = 0;""",
"""  private targetBus = 0;
  private targetBoat = 0;
  private targetTourist = 0;""", tag='targetTourist')

rep("""  /** v7 车站路侧格缓存（巴士环线目的地表） */
  private stopTiles: Array<[number, number]> = [];
  private ferryDocks: Array<[number, number]> = [];""",
"""  /** v7 车站路侧格缓存（巴士环线目的地表） */
  private stopTiles: Array<[number, number]> = [];
  private ferryDocks: Array<[number, number]> = [];
  /** v10 景点周边路格缓存（游客出生点） */
  private attractTiles: Array<[number, number]> = [];""", tag='attractTiles')

# 4. syncTargets：游客目标数
rep("""    // 船舶：渡轮码头逐座出船（冬季冰封停航）
    this.targetBoat = this.winterIce
      ? 0
      : Math.min(ActorSystem.BOAT_MAX, this.ferryDocks.length);
    this.dirty = false;""",
"""    // 船舶：渡轮码头逐座出船（冬季冰封停航）
    this.targetBoat = this.winterIce
      ? 0
      : Math.min(ActorSystem.BOAT_MAX, this.ferryDocks.length);
    // v10 游客：游客人数 /10 名出街漫步（夜间回酒店，白天观光）
    this.targetTourist = this.attractTiles.length
      ? Math.max(0, Math.min(ActorSystem.TOURIST_MAX,
          Math.round(this.touristsNow / 10 * (0.2 + 0.8 * this.dayness))))
      : 0;
    this.dirty = false;""", tag='游客目标')

# 5. scanTransit：顺带扫描景点
rep("""  private scanTransit(map: CityMap): void {
    this.stopTiles = [];
    this.ferryDocks = [];
    for (const o of map.objs.values()) {
      const d = defById(o.id);""",
"""  private scanTransit(map: CityMap): void {
    this.stopTiles = [];
    this.ferryDocks = [];
    this.attractTiles = [];
    for (const o of map.objs.values()) {
      const d = defById(o.id);
      // v10 景点：吸引力建筑的邻接/近旁道路格（游客出生点）
      if (ATTRACT[o.id] && ATTRACT[o.id] >= 2) {
        const cx = o.ax + (d.w >> 1), cy = o.ay + (d.h >> 1);
        outer:
        for (const ring of [1, 2, 3]) {
          for (let dy = -ring; dy <= d.h + ring - 1; dy++) {
            for (let dx = -ring; dx <= d.w + ring - 1; dx++) {
              const ox = dx < 0 ? -dx : (dx >= d.w ? dx - d.w + 1 : 0);
              const oy = dy < 0 ? -dy : (dy >= d.h ? dy - d.h + 1 : 0);
              if (Math.max(ox, oy) !== ring) continue;
              const nx = o.ax + dx, ny = o.ay + dy;
              if (!map.inB(nx, ny)) continue;
              if (map.road[map.idx(nx, ny)]) {
                this.attractTiles.push([nx, ny]);
                break outer;
              }
            }
          }
        }
        void cx; void cy;
      }""", tag='扫描景点')

# 6. 行人剔除排除系统游客（deficitP 裁员时）
rep("""      } else if (deficitP < 0) {
        for (let k = 0; k < Math.min(6, -deficitP); k++) {
          const i = this.actors.findIndex(a => a.kind === 0);
          if (i < 0) break;
          this.actors[i].gone = true;
          this.actors.splice(i, 1); this.peds--;
        }
      }""",
"""      } else if (deficitP < 0) {
        for (let k = 0; k < Math.min(6, -deficitP); k++) {
          const i = this.actors.findIndex(a => a.kind === 0 && !a.tour);
          if (i < 0) break;
          this.actors[i].gone = true;
          this.actors.splice(i, 1); this.peds--;
        }
      }""", tag='行人剔除排除游客')

# 7. 游客补减（在船舶补减之后追加）
rep("""      // v7 船舶：码头数量驱动出航 / 归航（冬季冰封全数归航）
      const deficitBoat = this.targetBoat - this.boats;
      if (deficitBoat > 0) {
        if (Math.random() < 0.5) this.spawnBoat(map);
      } else if (deficitBoat < 0) {
        const i = this.actors.findIndex(x => x.kind === 6);
        if (i >= 0) { this.actors[i].gone = true; this.actors.splice(i, 1); this.boats--; }
      }
    }""",
"""      // v7 船舶：码头数量驱动出航 / 归航（冬季冰封全数归航）
      const deficitBoat = this.targetBoat - this.boats;
      if (deficitBoat > 0) {
        if (Math.random() < 0.5) this.spawnBoat(map);
      } else if (deficitBoat < 0) {
        const i = this.actors.findIndex(x => x.kind === 6);
        if (i >= 0) { this.actors[i].gone = true; this.actors.splice(i, 1); this.boats--; }
      }
      // v10 游客：游客人数驱动景点漫步（酒店歇脚，景点打卡）
      const deficitTourist = this.targetTourist - this.tourists;
      if (deficitTourist > 0) {
        if (Math.random() < 0.4) this.spawnTourist(map);
      } else if (deficitTourist < 0) {
        const i = this.actors.findIndex(x => x.tour === true);
        if (i >= 0) { this.actors[i].gone = true; this.actors.splice(i, 1); this.tourists--; }
      }
    }""", tag='游客补减')

# 8. spawnTourist 方法（放在 spawnBoat 之后）
rep("""  private roadNeighbors(map: CityMap, x: number, y: number): number {""",
"""  /** v10 游客出生：景点旁路格上路，短途观光行程（3-16 格） */
  private spawnTourist(map: CityMap): void {
    if (!this.attractTiles.length) return;
    const spot = this.attractTiles[Math.floor(Math.random() * this.attractTiles.length)];
    const [x, y] = spot;
    const opts = DIRS.filter(([dx, dy]) =>
      map.inB(x + dx, y + dy) && map.road[map.idx(x + dx, y + dy)]);
    if (!opts.length) return;
    const d = opts[Math.floor(Math.random() * opts.length)];
    const a: Actor = {
      kind: 0, fx: x, fy: y, dx: d[0], dy: d[1], t: Math.random() * 0.3,
      speed: 0.42 + Math.random() * 0.2,          // 观光客步速慢
      look: Math.floor(Math.random() * LOOK_N),
      body: Math.random() < 0.82 ? 0 : 1,         // 偶有儿童随行
      role: 9, phase: Math.random() * 1000,
      offX: (Math.random() - 0.5) * 5, offY: (Math.random() - 0.5) * 5,
      path: null, wait: 0.2 + Math.random() * 0.8,
      master: null, gone: false, tour: true,
    };
    this.newTrip(map, a);
    this.actors.push(a);
    this.tourists++;
    // 情侣游客：并肩同游
    if (Math.random() < 0.35) {
      this.actors.push({
        ...a,
        look: Math.floor(Math.random() * LOOK_N),
        t: Math.max(0, a.t - 0.1),
        offX: a.offX + a.dy * 3.4, offY: a.offY - a.dx * 3.4,
        path: a.path ? a.path.slice() : null,
        phase: Math.random() * 1000,
      });
      this.tourists++;
    }
  }

  private roadNeighbors(map: CityMap, x: number, y: number): number {""", tag='spawnTourist')

# 9. newTrip：系统游客短途观光
rep("""    const path = a.kind === 1
      ? findPath(map, a.fx, a.fy, 30, 150)
      : findPath(map, a.fx, a.fy, 16, 72);
    a.path = path;
    return path;""",
"""    const path = a.kind === 1
      ? findPath(map, a.fx, a.fy, 30, 150)
      : a.tour
        ? findPath(map, a.fx, a.fy, 3, 16)      // v10 游客：景点周边短途观光
        : findPath(map, a.fx, a.fy, 16, 72);
    a.path = path;
    return path;""", tag='newTrip 游客')

# 10. removeCount / clear
rep("""  private removeCount(a: Actor): void {
    if (a.kind === 0 || a.kind === 7) this.peds--;""",
"""  private removeCount(a: Actor): void {
    if (a.kind === 0 && a.tour) { this.tourists--; return; }
    if (a.kind === 0 || a.kind === 7) this.peds--;""", tag='removeCount')

rep("""  clear(): void {
    for (const a of this.actors) a.gone = true;
    this.actors.length = 0;
    this.peds = 0;
    this.cars = 0;
    this.pets = 0;
    this.birds = 0;
    this.buses = 0;
    this.boats = 0;
    this.dirty = true;
  }""",
"""  clear(): void {
    for (const a of this.actors) a.gone = true;
    this.actors.length = 0;
    this.peds = 0;
    this.cars = 0;
    this.pets = 0;
    this.birds = 0;
    this.buses = 0;
    this.boats = 0;
    this.tourists = 0;
    this.dirty = true;
  }""", tag='clear')

open(P, 'w', encoding='utf-8').write(src)
print(f'\nactors.ts 完成：{n0} -> {len(src)}（+{len(src)-n0}）')
