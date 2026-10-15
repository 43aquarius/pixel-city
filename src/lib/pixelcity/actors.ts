// ============================================================
// actors.ts — 街头角色系统 v2：精细行人 + 智能路径 + 车辆
//
// 行人：10×17 / 8×14 多部件像素画（发型/肤色/上衣/上衣暗面/
//       裤子/鞋/眼睛/书包/手杖），三种体型（成人/儿童/长者），
//       14 套配色，4 朝向 × 双步态；足印接触阴影纳入精灵。
//       行为：BFS 路径寻路到随机目的地 + 路口停顿 + 到达逗留，
//       夜间（dayness）人口自动回落。
// 车辆：程序化建模小车（复用软光栅化管线），同样升级为
//       目的地路径行驶；夜间目标规模回落。
// ============================================================

import type { CityMap } from './map';
import { box, buildModel, type Face, type Model, type BoxMats } from './geo';
import { pWall, pFlatRoof, cell } from './patterns';
import { RAMP, bayer } from './palette';
import { renderModel, type Sprite } from './softrender';

const P = RAMP;

// ------------------------------------------------------------
// 行人像素画
//   符号：H 发 / S 肤 / E 眼 / R 上衣 / r 上衣暗面 /
//         P 裤 / K 鞋·轮廓 / C 手杖 / B 书包
// ------------------------------------------------------------

type Grid = string[];

/** 成人（10×17）：正面族基础网格（dr 朝向下右） */
function adultFront(pose: 0 | 1): Grid {
  const legs = pose === 0
    ? ['...PP.PP..', '...PP.PP..', '...KK.KK..', '..KK..KK..', '...K..K...']
    : ['...PPPP...', '...PPPP...', '...KKKK...', '...KKKK...', '....KK....'];
  const arms = pose === 0 ? '..SRRRRrS.' : '..RRRRRRr.';
  return [
    '...HHHH...',
    '..HHHHHH..',
    '..HHSSSSK.',
    '..HHSESEK.',
    '....SSS...',
    '...RRRRR..',
    '..RRRRRRr.',
    '..RRRRRRr.',
    arms,
    '...RRRR...',
    '...KKKK...',
    '...PPPPP..',
    legs[0], legs[1], legs[2], legs[3], legs[4],
  ];
}

/** 成人背面族（ur 朝向上右）：无脸，后脑勺头发 */
function adultBack(pose: 0 | 1): Grid {
  const g = adultFront(pose);
  g[2] = '..HHHHHHK.';
  g[3] = '..HHHHHHK.';
  return g;
}

/** 儿童（8×14）：头身比更大 */
function childFront(pose: 0 | 1): Grid {
  const legs = pose === 0
    ? ['..PP.PP..', '..PP.PP..', '..KK.KK..', '.KK..KK.']
    : ['..PPPP...', '..PPPP...', '..KKKK...', '..KKKK..'];
  return [
    '..HHHH...',
    '.HHHHHH..',
    '.HHSSSSK.',
    '.HHSESEK.',
    '...SSS...',
    '..RRRRR..',
    '.RRRRRRr.',
    '.RRRRRRr.',
    '..RRRR...',
    '..PPPPP..',
    legs[0], legs[1], legs[2], legs[3],
  ];
}

function childBack(pose: 0 | 1): Grid {
  const g = childFront(pose);
  g[2] = '.HHHHHHK.';
  g[3] = '.HHHHHHK.';
  return g;
}

/** 长者（10×17）：与成人同廓，慢速拄杖 */
function elderGrid(pose: 0 | 1): Grid {
  // 步幅小：两种步态仅差一行的开合
  const legs = pose === 0
    ? ['...PP.PP..', '...PPPP...', '...KK.KK..', '..KK..KK..', '...K..K...']
    : ['...PPPP...', '...PPPP...', '...KKKK...', '...KKKK...', '....KK....'];
  return [
    '...HHHH...',
    '..HHHHHH..',
    '..HHSSSSK.',
    '....SSS...',
    '...RRRRR..',
    '..RRRRRRr.',
    '..RRRRRRr.',
    '..RRRRRRr.',
    '...RRRR...',
    '...RRRR...',
    '...KKKK...',
    '...PPPPP..',
    legs[0], legs[1], legs[2], legs[3], legs[4],
  ];
}

const mirror = (g: Grid): Grid => g.map(r => r.split('').reverse().join(''));

type PersonLook = {
  shirt: string; shirtDark: string; pants: string;
  hair: string; skin: string; long: 0 | 1;
};

const SKIN_LIGHT = '#E2B98B';
const SKIN_TAN = '#C09668';
const NIGHTC = '#23252E';
const CANE = '#6B543A';
const BAG = '#C25B44';
const ELDER_HAIR = ['#C3C7CC', '#9BA0A7', '#F4F2E8'];

const LOOKS: PersonLook[] = [
  { shirt: '#E05548', shirtDark: '#9C4433', pants: '#23252E', hair: '#23252E', skin: SKIN_LIGHT, long: 0 },
  { shirt: '#F2D24B', shirtDark: '#C4A93E', pants: '#3B3D46', hair: '#6B543A', skin: SKIN_LIGHT, long: 0 },
  { shirt: '#5BC8B8', shirtDark: '#28635F', pants: '#23252E', hair: '#23252E', skin: SKIN_LIGHT, long: 1 },
  { shirt: '#F4F2E8', shirtDark: '#C3C7CC', pants: '#4A5A6E', hair: '#4C3A28', skin: SKIN_LIGHT, long: 0 },
  { shirt: '#4A86C8', shirtDark: '#264F8C', pants: '#23252E', hair: '#6B543A', skin: SKIN_LIGHT, long: 1 },
  { shirt: '#C09668', shirtDark: '#95734D', pants: '#3B3D46', hair: '#23252E', skin: SKIN_TAN, long: 0 },
  { shirt: '#C25B44', shirtDark: '#773227', pants: '#3B3D46', hair: '#4C3A28', skin: SKIN_LIGHT, long: 0 },
  { shirt: '#4FA8A0', shirtDark: '#28635F', pants: '#23252E', hair: '#6B543A', skin: SKIN_TAN, long: 0 },
  { shirt: '#F1E5C0', shirtDark: '#B3A17A', pants: '#4A5A6E', hair: '#23252E', skin: SKIN_LIGHT, long: 1 },
  { shirt: '#C97B93', shirtDark: '#9C4433', pants: '#3B3D46', hair: '#23252E', skin: SKIN_LIGHT, long: 1 },
  { shirt: '#F4F2E8', shirtDark: '#9BA0A7', pants: '#23252E', hair: '#C3C7CC', skin: SKIN_LIGHT, long: 0 },
  { shirt: '#8A6F4C', shirtDark: '#4C3A28', pants: '#23252E', hair: '#23252E', skin: SKIN_TAN, long: 0 },
  { shirt: '#89AFD0', shirtDark: '#48658A', pants: '#3B3D46', hair: '#6B543A', skin: SKIN_LIGHT, long: 0 },
  { shirt: '#4A5A6E', shirtDark: '#2C2E36', pants: '#23252E', hair: '#9BA0A7', skin: SKIN_TAN, long: 1 },
];

export const LOOK_N = LOOKS.length;

export type Facing = 'dr' | 'dl' | 'ur' | 'ul';
export type Body = 0 | 1 | 2;   // 0 成人 / 1 儿童 / 2 长者

export type PersonSprite = { cv: HTMLCanvasElement; ox: number; oy: number };

function paintGrid(g: Grid, lookI: number, look: PersonLook, body: Body, back: boolean): Grid {
  const out = g.slice();
  // 长发：背面族在肩部补头发
  if (back && look.long && body !== 2) {
    out[4] = body === 1 ? '.HHHHHH..' : '..HHHHHH..';
    if (body === 0) out[5] = '..HHHHHH..';
  }
  // 儿童：背面书包
  if (body === 1 && back) {
    out[6] = '.RBBBRRr.';
    out[7] = '.RBBBRRr.';
  }
  // 长者：手杖（最右列，行走侧前方）
  if (body === 2) {
    for (let y = 5; y <= 13; y++) {
      out[y] = (out[y] + '..........').slice(0, 9) + 'C';
    }
  }
  void lookI;
  return out;
}

/** 符号网格 → 着色画布 */
function gridToCanvas(g: Grid, lookI: number, look: PersonLook, body: Body): HTMLCanvasElement {
  const hair = body === 2 ? ELDER_HAIR[lookI % 3] : look.hair;
  const colors: Record<string, string> = {
    H: hair, S: look.skin, E: NIGHTC,
    R: look.shirt, r: look.shirtDark,
    P: look.pants, K: NIGHTC, C: CANE, B: BAG,
  };
  const w = g[0].length, h = g.length;
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const ctx = cv.getContext('2d')!;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const ch = g[y][x];
      if (ch === '.') continue;
      ctx.fillStyle = colors[ch] ?? NIGHTC;
      ctx.fillRect(x, y, 1, 1);
    }
  }
  return cv;
}

/** 生成 4 朝向 × 双步态 × 三体型 × N 配色 的行人精灵表 */
export function buildPersonSprites(): Map<string, PersonSprite> {
  const map = new Map<string, PersonSprite>();
  for (let lookI = 0; lookI < LOOKS.length; lookI++) {
    const look = LOOKS[lookI];
    for (const body of [0, 1, 2] as Body[]) {
      for (const pose of [0, 1] as const) {
        const front: Grid = body === 1 ? childFront(pose) : body === 2 ? elderGrid(pose) : adultFront(pose);
        const back: Grid = body === 1 ? childBack(pose) : body === 2 ? elderGrid(pose) : adultBack(pose);
        const grids: Record<Facing, Grid> = {
          dr: paintGrid(front, lookI, look, body, false),
          dl: mirror(paintGrid(front, lookI, look, body, false)),
          ur: paintGrid(back, lookI, look, body, true),
          ul: mirror(paintGrid(back, lookI, look, body, true)),
        };
        const w = grids.dr[0].length, h = grids.dr.length;
        const ox = -Math.floor(w / 2), oy = -(h - 2);
        for (const f of ['dr', 'dl', 'ur', 'ul'] as Facing[]) {
          map.set(`${f}#${pose}#${lookI}#${body}`, {
            cv: gridToCanvas(grids[f], lookI, look, body), ox, oy,
          });
        }
      }
    }
  }
  return map;
}

/** 步态 4 帧 → 双姿态（0/2 → 姿态0，1/3 → 姿态1） */
export function personSpOf(
  m: Map<string, PersonSprite>, facing: Facing, frame: number, look: number, body: Body,
): PersonSprite | null {
  const pose = frame % 2 === 0 ? 0 : 1;
  const li = ((look % LOOK_N) + LOOK_N) % LOOK_N;
  return m.get(`${facing}#${pose}#${li}#${body}`) ?? null;
}

// ------------------------------------------------------------
// 车辆：程序化建模（沿 X 或 Y 轴的小轿车，含出租车）
// ------------------------------------------------------------

export type CarDir = 'e' | 'w' | 's' | 'n';

const CAR_COLORS = [P.RED, P.CYAN, P.PBLUE, P.WHITE, P.TAN];

function carModel(axis: 'x' | 'y', forward: 1 | -1, color: number, taxi: boolean): Model {
  const faces: Face[] = [];
  const along = (a: number, c: number): [number, number] => axis === 'x' ? [a, c] : [c, a];
  const bx = (a0: number, c0: number, a1: number, c1: number, z0: number, z1: number, mats: BoxMats) => {
    const [x0, y0] = along(a0, c0);
    const [x1, y1] = along(a1, c1);
    box(faces, x0, y0, x1, y1, z0, z1, mats);
  };
  const body = taxi ? P.PAINTY : color;
  bx(3.2, 5.4, 12.8, 10.6, 0.8, 3.4, {
    right: pWall(body), left: pWall(body),
  });
  bx(3.4, 5.6, 12.6, 10.4, 0.4, 0.9, {
    right: () => cell(P.OUTLINE, 0), left: () => cell(P.OUTLINE, 0),
  });
  bx(5.8, 5.9, 10.4, 10.1, 3.4, 5.4, {
    right: (u, v, px, py) => ((v % 2 < 1) ? cell(P.GLASS, 0) : cell(P.GLASS, 1)),
    left: (u, v, px, py) => ((v % 2 < 1) ? cell(P.GLASS, 1) : cell(P.GLASS, 2)),
    top: pFlatRoof(body, 1),
  });
  for (const a of [4.4, 11.0]) {
    for (const c of [4.9, 10.9]) {
      bx(a, c, a + 1.6, c + 1.0, 0, 1.4, {
        right: () => cell(P.OUTLINE, 0), left: () => cell(P.OUTLINE, 0),
      });
    }
  }
  const frontAtPlus = forward === 1;
  bx(12.8, 6.2, 13.3, 9.8, 1.6, 2.6, {
    right: () => cell(frontAtPlus ? P.YELLOW : P.RED, 0),
  });
  if (taxi) {
    bx(7.2, 7.2, 8.8, 8.8, 5.4, 6.3, {
      right: () => cell(P.WHITE, 0), left: () => cell(P.WHITE, 0), top: () => cell(P.RED, 0),
    });
  }
  return buildModel(faces, 16, 16);
}

export function buildCarSprites(): Map<string, Sprite> {
  const map = new Map<string, Sprite>();
  const cfg: Array<[CarDir, 'x' | 'y', 1 | -1]> = [
    ['e', 'x', 1], ['w', 'x', -1], ['s', 'y', 1], ['n', 'y', -1],
  ];
  for (const [dir, axis, fwd] of cfg) {
    for (let c = 0; c < CAR_COLORS.length; c++) {
      map.set(`${dir}#${c}`, renderModel(carModel(axis, fwd, CAR_COLORS[c], false), { shadow: false }));
    }
    map.set(`${dir}#taxi`, renderModel(carModel(axis, fwd, 0, true), { shadow: false }));
  }
  return map;
}

export function carSpriteKey(dir: CarDir, look: number): string {
  return `${dir}#${look === 5 ? 'taxi' : (look % CAR_COLORS.length)}`;
}

// ------------------------------------------------------------
// 角色系统：路径寻路 + 路口停顿 + 夜间规模回落
// ------------------------------------------------------------

export type Actor = {
  kind: 0 | 1;            // 0 行人 / 1 车辆
  fx: number; fy: number; // 当前出发格
  dx: number; dy: number; // 行进方向
  t: number;              // 0..1 行进进度
  speed: number;          // 格 / 秒
  look: number;           // 配色
  body: Body;             // 行人体型
  phase: number;          // 步态相位偏移
  offX: number; offY: number; // 世界 px 横向偏移
  path: Array<[number, number]> | null;  // 剩余路（每步 [dx,dy]）
  wait: number;           // 停留秒数
};

const DIRS: Array<[number, number]> = [[1, 0], [-1, 0], [0, 1], [0, -1]];

const DIR_OF = (a: Actor): CarDir | Facing => {
  if (a.kind === 1) {
    if (a.dx === 1) return 'e';
    if (a.dx === -1) return 'w';
    if (a.dy === 1) return 's';
    return 'n';
  }
  if (a.dx === 1) return 'dr';
  if (a.dx === -1) return 'ul';
  if (a.dy === 1) return 'dl';
  return 'ur';
};

/** BFS 找一条通往随机目的地的路（限量扩展） */
function findPath(map: CityMap, sx: number, sy: number, near: number, far: number): Array<[number, number]> | null {
  const n = map.n;
  let dest: [number, number] | null = null;
  for (let k = 0; k < 16 && !dest; k++) {
    const rx = Math.floor(Math.random() * n);
    const ry = Math.floor(Math.random() * n);
    const d = Math.hypot(rx - sx, ry - sy);
    if (d < near || d > far) continue;
    if (map.road[map.idx(rx, ry)]) dest = [rx, ry];
  }
  if (!dest) return null;
  const sIdx = map.idx(sx, sy);
  const tIdx = map.idx(dest[0], dest[1]);
  const prev = new Map<number, number>();
  prev.set(sIdx, -1);
  const q: number[] = [sIdx];
  let head = 0;
  const CAP = 2400;
  let found = false;
  while (head < q.length && q.length < CAP) {
    const cur = q[head++];
    if (cur === tIdx) { found = true; break; }
    const cx = cur % n, cy = (cur / n) | 0;
    for (const [dx, dy] of DIRS) {
      const nx = cx + dx, ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= n || ny >= n) continue;
      const ni = ny * n + nx;
      if (prev.has(ni) || !map.road[ni]) continue;
      prev.set(ni, cur);
      q.push(ni);
    }
  }
  if (!found && !prev.has(tIdx)) return null;
  const out: Array<[number, number]> = [];
  let cur = tIdx;
  let guard = 0;
  while (cur !== sIdx && cur >= 0 && guard++ < 5000) {
    const from = prev.get(cur);
    if (from === undefined || from < 0) break;
    const cx = cur % n, cy = (cur / n) | 0;
    const fx = from % n, fy = (from / n) | 0;
    out.unshift([cx - fx, cy - fy]);
    cur = from;
  }
  return out.length ? out : null;
}

export class ActorSystem {
  actors: Actor[] = [];
  peds = 0;
  cars = 0;
  enabled = true;
  pedAuto = true;
  pedManual = 80;
  static readonly PED_MAX = 300;
  static readonly PED_AUTO_MAX = 220;
  static readonly CAR_MAX = 40;
  /** 0=深夜 1=白昼（引擎每帧回写；自动模式下人口随之消长） */
  dayness = 1;
  private targetP = 0;
  private targetC = 0;
  private dirty = true;
  private spawnCd = 0;

  private persons: Map<string, PersonSprite> | null = null;
  private carsMap: Map<string, Sprite> | null = null;

  ensureSprites(): void {
    if (!this.persons) this.persons = buildPersonSprites();
    if (!this.carsMap) this.carsMap = buildCarSprites();
  }

  personSp(facing: Facing, frame: number, look: number, body: Body): PersonSprite | null {
    return this.persons ? personSpOf(this.persons, facing, frame, look, body) : null;
  }

  carSp(dir: CarDir, look: number): Sprite | null {
    return this.carsMap?.get(carSpriteKey(dir, look)) ?? null;
  }

  invalidate(): void { this.dirty = true; }

  setPedTarget(auto: boolean, n: number): void {
    this.pedAuto = auto;
    this.pedManual = Math.max(0, Math.min(ActorSystem.PED_MAX, Math.round(n)));
    this.dirty = true;
  }

  private syncTargets(map: CityMap): void {
    const st = map.stats();
    const nightK = 0.30 + 0.70 * this.dayness;       // 行人夜间回落至 0.3
    const carK = 0.45 + 0.55 * this.dayness;         // 车辆夜间回落至 0.45
    if (this.pedAuto) {
      const base = Math.max(10, Math.min(ActorSystem.PED_AUTO_MAX, 10 + Math.floor(st.pop / 60)));
      this.targetP = Math.max(4, Math.round(base * nightK));
    } else {
      this.targetP = this.pedManual;   // 手动模式：尊重用户设定，不随夜色缩放
    }
    this.targetC = Math.max(2, Math.round(Math.max(4, Math.min(ActorSystem.CAR_MAX, Math.floor(st.roads / 55))) * carK));
    this.dirty = false;
  }

  private randomRoad(map: CityMap): [number, number] | null {
    for (let i = 0; i < 90; i++) {
      const x = Math.floor(Math.random() * map.n);
      const y = Math.floor(Math.random() * map.n);
      if (map.road[map.idx(x, y)]) return [x, y];
    }
    return null;
  }

  private spawn(map: CityMap, kind: 0 | 1): void {
    const spot = this.randomRoad(map);
    if (!spot) return;
    const [x, y] = spot;
    let d: [number, number] | null = null;
    const opts = DIRS.filter(([dx, dy]) =>
      map.inB(x + dx, y + dy) && map.road[map.idx(x + dx, y + dy)]);
    if (opts.length) d = opts[Math.floor(Math.random() * opts.length)];
    else return;
    const look = Math.floor(Math.random() * LOOK_N);
    // 体型：成人 70% / 儿童 18% / 长者 12%
    const bb = Math.random();
    const body: Body = kind === 1 ? 0 : (bb < 0.70 ? 0 : bb < 0.88 ? 1 : 2);
    let speed: number;
    if (kind === 1) speed = 2.0 + Math.random() * 0.9;
    else if (body === 2) speed = 0.35 + Math.random() * 0.18;
    else if (body === 1) speed = 0.78 + Math.random() * 0.32;
    else speed = 0.55 + Math.random() * 0.4;
    const a: Actor = {
      kind, fx: x, fy: y, dx: d[0], dy: d[1], t: Math.random() * 0.2,
      speed, look, body, phase: Math.random() * 1000,
      offX: kind === 0 ? (Math.random() - 0.5) * 5 : 0,
      offY: kind === 0 ? (Math.random() - 0.5) * 5 : 0,
      path: null, wait: Math.random() * 0.6,
    };
    this.newTrip(map, a);
    this.actors.push(a);
    if (kind === 0) this.peds++; else this.cars++;
  }

  /** 给角色安排一次出行（BFS 路径；失败则退化为加权随机漫步）。返回本次路径 */
  private newTrip(map: CityMap, a: Actor): Array<[number, number]> | null {
    const path = a.kind === 1
      ? findPath(map, a.fx, a.fy, 30, 150)
      : findPath(map, a.fx, a.fy, 16, 72);
    a.path = path;
    return path;
  }

  private roadNeighbors(map: CityMap, x: number, y: number): number {
    let c = 0;
    for (const [dx, dy] of DIRS) {
      if (map.inB(x + dx, y + dy) && map.road[map.idx(x + dx, y + dy)]) c++;
    }
    return c;
  }

  private pickNext(map: CityMap, a: Actor): boolean {
    if (a.path && a.path.length) {
      const nxt = a.path.shift()!;
      a.dx = nxt[0]; a.dy = nxt[1];
      return true;
    }
    // 路走完：到达目的地 → 逗留，再安排新行程
    a.path = null;
    const p2 = this.newTrip(map, a);
    if (p2 && p2.length) {
      const nxt = p2.shift()!;
      a.dx = nxt[0]; a.dy = nxt[1];
      return true;
    }
    // 兜底：加权随机（直行权重 3、尽量不回头）
    const bx = a.fx, by = a.fy;
    const opts: Array<[number, number, number]> = [];
    for (const [dx, dy] of DIRS) {
      if (dx === -a.dx && dy === -a.dy) continue;
      if (!map.inB(bx + dx, by + dy)) continue;
      if (!map.road[map.idx(bx + dx, by + dy)]) continue;
      const w = (dx === a.dx && dy === a.dy) ? 3 : 1;
      opts.push([dx, dy, w]);
    }
    if (!opts.length) {
      if (map.inB(bx - a.dx, by - a.dy) && map.road[map.idx(bx - a.dx, by - a.dy)]) {
        a.dx = -a.dx;
        a.dy = -a.dy;
        return true;
      }
      return false;
    }
    let sum = 0;
    for (const o of opts) sum += o[2];
    let pick = Math.random() * sum;
    let chosen = opts[0];
    for (const o of opts) {
      pick -= o[2];
      if (pick <= 0) { chosen = o; break; }
    }
    a.dx = chosen[0];
    a.dy = chosen[1];
    return true;
  }

  tick(dt: number, map: CityMap): void {
    if (!this.enabled) return;
    if (this.dirty) this.syncTargets(map);
    if (this.actors.length === 0 && (this.targetP > 0 || this.targetC > 0)) this.ensureSprites();

    this.spawnCd -= dt;
    if (this.spawnCd <= 0) {
      this.spawnCd = 0.12;
      const deficitP = this.targetP - this.peds;
      const deficitC = this.targetC - this.cars;
      if (deficitP > 0) {
        for (let k = 0; k < Math.min(5, deficitP); k++) this.spawn(map, 0);
      } else if (deficitP < 0) {
        for (let k = 0; k < Math.min(6, -deficitP); k++) {
          const i = this.actors.findIndex(a => a.kind === 0);
          if (i < 0) break;
          this.actors.splice(i, 1); this.peds--;
        }
      }
      if (deficitC > 0) {
        for (let k = 0; k < Math.min(3, deficitC); k++) this.spawn(map, 1);
      } else if (deficitC < 0) {
        for (let k = 0; k < Math.min(4, -deficitC); k++) {
          const i = this.actors.findIndex(a => a.kind === 1);
          if (i < 0) break;
          this.actors.splice(i, 1); this.cars--;
        }
      }
    }

    for (let i = this.actors.length - 1; i >= 0; i--) {
      const a = this.actors[i];
      if (a.wait > 0) { a.wait -= dt; continue; }
      a.t += a.speed * dt;
      let stepped = false;
      while (a.t >= 1) {
        a.t -= 1;
        a.fx += a.dx;
        a.fy += a.dy;
        stepped = true;
        if (!map.inB(a.fx, a.fy) || !map.road[map.idx(a.fx, a.fy)]) {
          if (a.kind === 0) this.peds--; else this.cars--;
          this.actors.splice(i, 1);
          stepped = false;
          break;
        }
        // 到达路口：偶尔停一停（儿童不停，长者停更久）
        const nb = this.roadNeighbors(map, a.fx, a.fy);
        if (nb >= 3 && a.kind === 0 && Math.random() < (a.body === 2 ? 0.22 : 0.12)) {
          a.wait = a.body === 2 ? 0.5 + Math.random() * 1.2 : 0.3 + Math.random() * 0.6;
        }
        if (!this.pickNext(map, a)) {
          if (a.kind === 0) this.peds--; else this.cars--;
          this.actors.splice(i, 1);
          stepped = false;
          break;
        }
        // 路径走完：目的地逗留
        if (!a.path || a.path.length === 0) {
          if (a.kind === 0) a.wait = 0.4 + Math.random() * (a.body === 1 ? 1.2 : 2.2);
          else a.wait = 0.1 + Math.random() * 0.35;
        }
      }
      void stepped;
    }
  }

  /** 车辆靠右行驶的车道偏移（世界 px） */
  laneOffset(a: Actor): [number, number] {
    if (a.kind === 0) return [a.offX, a.offY];
    return [-a.dy * 2.3, a.dx * 2.3];
  }

  clear(): void {
    this.actors.length = 0;
    this.peds = 0;
    this.cars = 0;
    this.dirty = true;
  }

  static dirOf(a: Actor): CarDir | Facing { return DIR_OF(a); }
}

// ------------------------------------------------------------
// 引擎侧灯杆模型（路灯）与夜光晕圈
// ------------------------------------------------------------

export function lampModel(): Model {
  const faces: Face[] = [];
  // 杆
  box(faces, 7.4, 7.4, 8.6, 8.6, 0, 13.5, {
    right: pWall(P.METAL), left: pWall(P.METAL),
  });
  // 悬臂（+Y 侧）
  box(faces, 7.6, 8.4, 8.4, 10.6, 12.4, 13.5, {
    top: pFlatRoof(P.METAL, 2), right: pWall(P.METAL), left: pWall(P.METAL),
  });
  // 灯头（日间黄顶；夜间发光）
  box(faces, 7.0, 10.2, 9.0, 12.2, 11.4, 12.6, {
    top: () => cell(P.YELLOW, 0),
    right: pWall(P.NEONC), left: pWall(P.NEONC),
  });
  return buildModel(faces, 16, 16);
}

/** 夜光晕圈：dither 椭圆光池（暖黄核心 + 外圈） */
export function glowPool(w: number, h: number): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const ctx = cv.getContext('2d')!;
  const img = ctx.createImageData(w, h);
  const u32 = new Uint32Array(img.data.buffer);
  const abgr = (hex: string, a = 255): number => {
    const q = parseInt(hex.slice(1), 16);
    return (a << 24) | ((q & 255) << 16) | (((q >> 8) & 255) << 8) | ((q >> 16) & 255);
  };
  const core = abgr('#F4F2E8'), mid = abgr('#F2D24B');
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const nx = (x - w / 2) / (w / 2 - 1);
      const ny = (y - h / 2) / (h / 2 - 1);
      const d = nx * nx + ny * ny;
      if (d > 1) continue;
      let c = 0;
      if (d < 0.30) c = core;
      else if (d < 0.72) c = mid;
      else if (bayer(x, y, 0.45)) c = mid;   // 外缘抖动
      else continue;
      u32[y * w + x] = c;
    }
  }
  ctx.putImageData(img, 0, 0);
  return cv;
}
