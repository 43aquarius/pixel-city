// ============================================================
// actors.ts — 街头角色系统：行人（像素画）+ 车辆（程序化建模）
//
// 行人：7×13 字符画 × 4 朝向 × 2 步态帧 × 6 套配色，直接以
//       有限色板精确像素绘制；沿路网随机行走（路口加权转向）。
// 车辆：复用等距建模 + 软光栅化管线渲染的小车模型，靠右行驶，
//       与建筑同一套色板 / 有序抖动，风格完全统一。
// ============================================================

import type { CityMap } from './map';
import { box, buildModel, type Face, type Model, type BoxMats } from './geo';
import { pWall, pFlatRoof, cell } from './patterns';
import { RAMP } from './palette';
import { renderModel, type Sprite } from './softrender';

const P = RAMP;

// ------------------------------------------------------------
// 行人像素画（K 轮廓 / S 皮肤 / H 头发 / R 上衣 / P 裤子）
// ------------------------------------------------------------

const PERSON_DR: string[][] = [
  // frame 0
  [
    '.HHHH..', '.HHHH..', '.HSSK..', '..SSS..',
    '.RRRRR.', 'RRRRRRR', '.RRRRR.', '..RRR..',
    '..PPP..', '..P.P..', '..P.P..', '..K.K..', '..K.K..',
  ],
  // frame 1
  [
    '.HHHH..', '.HHHH..', '.HSSK..', '..SSS..',
    '.RRRRR.', 'RRRRRRR', '.RRRRR.', '..RRR..',
    '..PPP..', '..PP...', '...PP..', '..KK...', '...KK..',
  ],
];

const PERSON_UR: string[][] = [
  [
    '.HHHH..', '.HHHH..', '.HHHH..', '..SSS..',
    '.RRRRR.', 'RRRRRRR', '.RRRRR.', '..RRR..',
    '..PPP..', '..P.P..', '..P.P..', '..K.K..', '..K.K..',
  ],
  [
    '.HHHH..', '.HHHH..', '.HHHH..', '..SSS..',
    '.RRRRR.', 'RRRRRRR', '.RRRRR.', '..RRR..',
    '..PPP..', '..PP...', '...PP..', '..KK...', '...KK..',
  ],
];

const mirrorRows = (rows: string[]): string[] => rows.map(r => r.split('').reverse().join(''));

type PersonLook = { shirt: string; pants: string; hair: string };

const PERSON_LOOKS: PersonLook[] = [
  { shirt: '#E05548', pants: '#23252E', hair: '#23252E' },
  { shirt: '#F2D24B', pants: '#3B3D46', hair: '#6B543A' },
  { shirt: '#5BC8B8', pants: '#23252E', hair: '#23252E' },
  { shirt: '#F4F2E8', pants: '#4A5A6E', hair: '#4C3A28' },
  { shirt: '#4A86C8', pants: '#23252E', hair: '#6B543A' },
  { shirt: '#E2B98B', pants: '#3B3D46', hair: '#23252E' },
  { shirt: '#C25B44', pants: '#3B3D46', hair: '#4C3A28' },
  { shirt: '#4FA8A0', pants: '#23252E', hair: '#6B543A' },
  { shirt: '#F1E5C0', pants: '#4A5A6E', hair: '#23252E' },
  { shirt: '#C97B93', pants: '#3B3D46', hair: '#23252E' },
];

const SKIN = '#E2B98B';
const DARK = '#23252E';

export type Facing = 'dr' | 'dl' | 'ur' | 'ul';

/** 4 朝向 × 2 帧 × N 配色 的行人精灵 */
export function buildPersonSprites(): Map<string, HTMLCanvasElement> {
  const map = new Map<string, HTMLCanvasElement>();
  const dr = PERSON_DR;
  const dl = dr.map(mirrorRows);
  const ur = PERSON_UR;
  const ul = ur.map(mirrorRows);
  const sets: Record<Facing, string[][]> = { dr, dl, ur, ul };
  for (const look of PERSON_LOOKS) {
    const colors: Record<string, string> = {
      K: DARK, S: SKIN, H: look.hair, R: look.shirt, P: look.pants,
    };
    for (const f of Object.keys(sets) as Facing[]) {
      for (let fr = 0; fr < 2; fr++) {
        const rows = sets[f][fr];
        const cv = document.createElement('canvas');
        cv.width = 7; cv.height = rows.length;
        const ctx = cv.getContext('2d')!;
        rows.forEach((row, y) => {
          for (let x = 0; x < row.length; x++) {
            const ch = row[x];
            if (ch === '.') continue;
            ctx.fillStyle = colors[ch] ?? DARK;
            ctx.fillRect(x, y, 1, 1);
          }
        });
        map.set(`${f}#${fr}#${look.shirt}`, cv);
      }
    }
  }
  return map;
}

export function personSpriteKey(facing: Facing, frame: number, look: number): string {
  return `${facing}#${frame}#${PERSON_LOOKS[look % PERSON_LOOKS.length].shirt}`;
}

// ------------------------------------------------------------
// 车辆：程序化建模（沿 X 或 Y 轴的小轿车，含出租车）
// ------------------------------------------------------------

export type CarDir = 'e' | 'w' | 's' | 'n';

const CAR_COLORS = [P.RED, P.CYAN, P.PBLUE, P.WHITE, P.TAN];

/** 沿指定轴向的小车模型；forward=+1 表示朝 +轴 */
function carModel(axis: 'x' | 'y', forward: 1 | -1, color: number, taxi: boolean): Model {
  const faces: Face[] = [];
  const along = (a: number, c: number): [number, number] => axis === 'x' ? [a, c] : [c, a];
  const bx = (a0: number, c0: number, a1: number, c1: number, z0: number, z1: number, mats: BoxMats) => {
    const [x0, y0] = along(a0, c0);
    const [x1, y1] = along(a1, c1);
    box(faces, x0, y0, x1, y1, z0, z1, mats);
  };
  const body = taxi ? P.PAINTY : color;
  // 车身
  bx(3.2, 5.4, 12.8, 10.6, 0.8, 3.4, {
    right: pWall(body), left: pWall(body),
  });
  // 底盘阴影带
  bx(3.4, 5.6, 12.6, 10.4, 0.4, 0.9, {
    right: () => cell(P.OUTLINE, 0), left: () => cell(P.OUTLINE, 0),
  });
  // 座舱（玻璃）
  bx(5.8, 5.9, 10.4, 10.1, 3.4, 5.4, {
    right: (u, v, px, py) => ((v % 2 < 1) ? cell(P.GLASS, 0) : cell(P.GLASS, 1)),
    left: (u, v, px, py) => ((v % 2 < 1) ? cell(P.GLASS, 1) : cell(P.GLASS, 2)),
    top: pFlatRoof(body, 1),
  });
  // 车轮 ×4（露出车侧）
  for (const a of [4.4, 11.0]) {
    for (const c of [4.9, 10.9]) {
      bx(a, c, a + 1.6, c + 1.0, 0, 1.4, {
        right: () => cell(P.OUTLINE, 0), left: () => cell(P.OUTLINE, 0),
      });
    }
  }
  // 前灯（黄）+ 尾灯（红）——只画可见的 +轴端
  const frontAtPlus = forward === 1;
  bx(12.8, 6.2, 13.3, 9.8, 1.6, 2.6, {
    right: () => cell(frontAtPlus ? P.YELLOW : P.RED, 0),
  });
  // 出租车顶灯
  if (taxi) {
    bx(7.2, 7.2, 8.8, 8.8, 5.4, 6.3, {
      right: () => cell(P.WHITE, 0), left: () => cell(P.WHITE, 0), top: () => cell(P.RED, 0),
    });
  }
  return buildModel(faces, 16, 16);
}

/** 4 方向 × N 配色的车辆精灵（方向 → 精灵数组） */
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
// 角色系统
// ------------------------------------------------------------

export type Actor = {
  kind: 0 | 1;            // 0 行人 / 1 车辆
  fx: number; fy: number; // 当前出发格
  dx: number; dy: number; // 行进方向
  t: number;              // 0..1 行进进度
  speed: number;          // 格 / 秒
  look: number;           // 配色
  phase: number;          // 步态相位偏移
  offX: number; offY: number; // 世界 px 横向偏移（打破一字长蛇）
};

const DIRS: Array<[number, number]> = [[1, 0], [-1, 0], [0, 1], [0, -1]];

export class ActorSystem {
  actors: Actor[] = [];
  peds = 0;
  cars = 0;
  enabled = true;
  /** 行人数量模式：auto = 随人口自适应；manual = 固定目标数 */
  pedAuto = true;
  pedManual = 80;
  static readonly PED_MAX = 300;
  static readonly PED_AUTO_MAX = 220;
  static readonly CAR_MAX = 40;
  private targetP = 0;
  private targetC = 0;
  private dirty = true;
  private spawnCd = 0;

  private persons: Map<string, HTMLCanvasElement> | null = null;
  private carsMap: Map<string, Sprite> | null = null;

  /** 延迟初始化精灵（需 DOM） */
  ensureSprites(): void {
    if (!this.persons) this.persons = buildPersonSprites();
    if (!this.carsMap) this.carsMap = buildCarSprites();
  }

  personCv(facing: Facing, frame: number, look: number): HTMLCanvasElement | null {
    return this.persons?.get(personSpriteKey(facing, frame, look)) ?? null;
  }

  carSp(dir: CarDir, look: number): Sprite | null {
    return this.carsMap?.get(carSpriteKey(dir, look)) ?? null;
  }

  /** 人口 / 道路变化后重算目标规模 */
  invalidate(): void { this.dirty = true; }

  /** 手动设定行人数量（auto=false 时生效，n 裁剪到 0..PED_MAX） */
  setPedTarget(auto: boolean, n: number): void {
    this.pedAuto = auto;
    this.pedManual = Math.max(0, Math.min(ActorSystem.PED_MAX, Math.round(n)));
    this.dirty = true;
  }

  private syncTargets(map: CityMap): void {
    const st = map.stats();
    if (this.pedAuto) {
      this.targetP = Math.max(10, Math.min(ActorSystem.PED_AUTO_MAX, 10 + Math.floor(st.pop / 60)));
    } else {
      this.targetP = this.pedManual;
    }
    this.targetC = Math.max(4, Math.min(ActorSystem.CAR_MAX, Math.floor(st.roads / 55)));
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
    // 出生时找一条可行进方向
    const [x, y] = spot;
    let d: [number, number] | null = null;
    const opts = DIRS.filter(([dx, dy]) =>
      map.inB(x + dx, y + dy) && map.road[map.idx(x + dx, y + dy)]);
    if (opts.length) d = opts[Math.floor(Math.random() * opts.length)];
    else return;   // 孤立路格，不生成
    const look = Math.floor(Math.random() * PERSON_LOOKS.length);
    this.actors.push({
      kind, fx: x, fy: y, dx: d[0], dy: d[1], t: Math.random() * 0.2,
      speed: kind === 0 ? 0.55 + Math.random() * 0.35 : 2.0 + Math.random() * 0.9,
      look, phase: Math.random() * 1000,
      offX: kind === 0 ? (Math.random() - 0.5) * 5 : 0,
      offY: kind === 0 ? (Math.random() - 0.5) * 5 : 0,
    });
    if (kind === 0) this.peds++; else this.cars++;
  }

  private pickNext(map: CityMap, a: Actor): boolean {
    const bx = a.fx, by = a.fy;   // 当前所在格
    const opts: Array<[number, number, number]> = [];   // dx, dy, weight
    for (const [dx, dy] of DIRS) {
      if (dx === -a.dx && dy === -a.dy) continue;   // 尽量不回头
      if (!map.inB(bx + dx, by + dy)) continue;
      if (!map.road[map.idx(bx + dx, by + dy)]) continue;
      const w = (dx === a.dx && dy === a.dy) ? 3 : 1;
      opts.push([dx, dy, w]);
    }
    if (!opts.length) {
      // 死路：掉头（来路必为道路）
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

    // 渐进补充 / 裁减（大批次时每周期处理多个，避免调人数后等待过久）
    this.spawnCd -= dt;
    if (this.spawnCd <= 0) {
      this.spawnCd = 0.12;
      const deficitP = this.targetP - this.peds;
      const deficitC = this.targetC - this.cars;
      if (deficitP > 0) {
        for (let k = 0; k < Math.min(5, deficitP); k++) this.spawn(map, 0);
      } else if (deficitC > 0) {
        for (let k = 0; k < Math.min(3, deficitC); k++) this.spawn(map, 1);
      } else if (deficitP < 0) {
        for (let k = 0; k < Math.min(6, -deficitP); k++) {
          const i = this.actors.findIndex(a => a.kind === 0);
          if (i < 0) break;
          this.actors.splice(i, 1); this.peds--;
        }
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
      a.t += a.speed * dt;
      while (a.t >= 1) {
        a.t -= 1;
        a.fx += a.dx;
        a.fy += a.dy;
        if (!this.pickNext(map, a)) {
          if (a.kind === 0) this.peds--; else this.cars--;
          this.actors.splice(i, 1);
          break;
        }
      }
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

  /** 序列化无关；方向映射供渲染端使用 */
  static dirOf(a: Actor): CarDir | Facing {
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
  }
}
