// ============================================================
// map.ts — 城市网格：地形 / 道路 / 树木 / 建筑对象 + 规则 +
//           随机地图生成 + 序列化
// ============================================================

import { fbm, hash2 } from './rng';
import { defById, CATALOG } from './catalog';

export const TERR_GRASS = 0;
export const TERR_WATER = 1;
export const TERR_SAND = 2;
export const TERR_FARM = 3;
export const TERR_ROCK = 4;
export const TERR_SNOW = 5;
export const TERR_FLOWER = 6;
export const TERR_DRY = 7;
export const TERR_SWAMP = 8;
export const TERR_AUTUMN = 9;

/** 地图边长（格）：v4 起为 256，旧存档自动居中迁移 */
export const MAP_N = 256;
/** 树木种类数（0 阔叶 / 1 松 / 2 灌木 / 3 樱花 / 4 棕榈 / 5 高乔木） */
export const TREE_KINDS = 6;
/** 地形高度上限（级）；每级在屏幕上抬升 HSTEP 像素（engine 侧）。
 *  v4：6→8 —— 参照 SimCity 2000 / Caesar III 的 2.5D 梯田，层级落差更陡峭直观 */
export const HMAX = 13;
export const HSTEP = 8;

/** 游程编码：[run, v, run, v, ...]（大地图存档/撤销体积优化） */
function rleEnc(a: ArrayLike<number>): number[] {
  const out: number[] = [];
  let i = 0;
  while (i < a.length) {
    let j = i;
    while (j < a.length && a[j] === a[i]) j++;
    out.push(j - i, a[i]);
    i = j;
  }
  return out;
}

export type Obj = {
  id: string;      // 目录 id
  v: number;       // 变体
  seed: number;    // 外观种子（当前未细分，保留）
  ax: number; ay: number;  // 锚点（东北角格）
};

export type Stats = { pop: number; buildings: number; roads: number; trees: number };

export class CityMap {
  readonly n: number;
  terr: Uint8Array;
  road: Uint8Array;
  tree: Int16Array;      // -1 无树
  occ: Int32Array;       // 每格指向锚点索引（-1 空）
  /** 地形高度（0=水面，陆地 1..HMAX）；v3 存档新增 */
  h: Uint8Array;
  objs = new Map<number, Obj>();   // 锚点索引 → 对象
  version = 0;
  onChange: (() => void) | null = null;
  private batching = false;

  constructor(n = MAP_N) {
    this.n = n;
    this.terr = new Uint8Array(n * n);
    this.road = new Uint8Array(n * n);
    this.tree = new Int16Array(n * n).fill(-1);
    this.occ = new Int32Array(n * n).fill(-1);
    this.h = new Uint8Array(n * n);
  }

  idx(x: number, y: number): number { return y * this.n + x; }
  inB(x: number, y: number): boolean { return x >= 0 && y >= 0 && x < this.n && y < this.n; }

  private touch(): void {
    this.version++;
    if (!this.batching) this.onChange?.();
  }

  /** 批量更新（生成器用）：抑制过程中的逐次通知 */
  beginUpdate(): void { this.batching = true; }
  endUpdate(): void {
    this.batching = false;
    this.onChange?.();
  }

  // ---------------- 地形 ----------------

  setTerr(x: number, y: number, k: number): boolean {
    if (!this.inB(x, y) || this.terr[this.idx(x, y)] === k) return false;
    const i = this.idx(x, y);
    // 水淹规则：水域清除该格上的一切
    if (k === TERR_WATER) {
      this.removeAt(x, y, true);
      this.road[i] = 0;
      this.tree[i] = -1;
      this.h[i] = 0;                       // 水面即基准高度
    } else if (this.terr[i] === TERR_WATER) {
      this.h[i] = Math.max(1, this.h[i]);  // 填水成陆：至少抬到岸上
    }
    this.terr[i] = k;
    this.touch();
    return true;
  }

  // ---------------- 道路 ----------------

  /** 道路值：0 无 / 1 普通路 / 2 跨水桥（v6：水面上修路自动架桥，桥面抬升 1 级） */
  static readonly ROAD_BRIDGE = 2;

  canRoad(x: number, y: number): boolean {
    // 水面允许（自动架桥）；建筑占用不可
    return this.inB(x, y) && this.occ[this.idx(x, y)] < 0;
  }

  private roadListCache: Int32Array | null = null;
  private roadListVer = -1;

  /** 全部道路格索引（版本缓存）——行人/车辆出生点均匀采样用。
   *  修复：小路网（经营开局仅数格路）在全图 65536 格随机采样几乎必然落空 */
  roadList(): Int32Array {
    if (!this.roadListCache || this.roadListVer !== this.version) {
      let c = 0;
      for (let i = 0; i < this.road.length; i++) if (this.road[i]) c++;
      const out = new Int32Array(c);
      let k = 0;
      for (let i = 0; i < this.road.length; i++) if (this.road[i]) out[k++] = i;
      this.roadListCache = out;
      this.roadListVer = this.version;
    }
    return this.roadListCache;
  }

  setRoad(x: number, y: number, on: boolean): boolean {
    if (!this.inB(x, y)) return false;
    if (on) {
      if (!this.canRoad(x, y)) return false;
      if (this.road[this.idx(x, y)]) return false;
      this.tree[this.idx(x, y)] = -1;   // 修路伐树（水面无树）
      // v6：水面格 → 跨水桥（桥面抬升 1 级，与岸上路面齐平）
      this.road[this.idx(x, y)] = this.terr[this.idx(x, y)] === TERR_WATER ? 2 : 1;
      this.touch();
      return true;
    }
    if (!this.road[this.idx(x, y)]) return false;
    this.road[this.idx(x, y)] = 0;
    this.touch();
    return true;
  }

  // ---------------- 树 ----------------

  plantTree(x: number, y: number): boolean {
    if (!this.inB(x, y)) return false;
    const i = this.idx(x, y);
    if (this.tree[i] >= 0 || this.road[i] || this.occ[i] >= 0) return false;
    if (this.terr[i] === TERR_WATER) return false;
    this.tree[i] = Math.floor(hash2(x, y, 77) * TREE_KINDS);
    this.touch();
    return true;
  }

  // ---------------- 建筑 ----------------

  canPlace(id: string, x: number, y: number): boolean {
    const d = defById(id);
    if (!this.inB(x, y) || !this.inB(x + d.w - 1, y + d.h - 1)) return false;
    for (let dy = 0; dy < d.h; dy++) {
      for (let dx = 0; dx < d.w; dx++) {
        const i = this.idx(x + dx, y + dy);
        if (this.terr[i] === TERR_WATER) return false;
        if (this.road[i]) return false;
        if (this.occ[i] >= 0) return false;
      }
    }
    return true;
  }

  /** 足迹内高度不齐的格数（建造整地费预估；target 缺省取锚点高度） */
  flatCount(x: number, y: number, w: number, hh: number, target?: number): number {
    if (!this.inB(x, y)) return 0;
    const t = target ?? this.h[this.idx(x, y)];
    let c = 0;
    for (let dy = 0; dy < hh; dy++) {
      for (let dx = 0; dx < w; dx++) {
        if (!this.inB(x + dx, y + dy)) continue;
        if (this.h[this.idx(x + dx, y + dy)] !== t) c++;
      }
    }
    return c;
  }

  /** 把足迹整平到 target 高度（返回改动格数） */
  flatten(x: number, y: number, w: number, hh: number, target?: number): number {
    if (!this.inB(x, y)) return 0;
    const t = target ?? this.h[this.idx(x, y)];
    let c = 0;
    for (let dy = 0; dy < hh; dy++) {
      for (let dx = 0; dx < w; dx++) {
        if (!this.inB(x + dx, y + dy)) continue;
        const i = this.idx(x + dx, y + dy);
        if (this.h[i] !== t) { this.h[i] = t; c++; }
      }
    }
    if (c > 0) this.touch();
    return c;
  }

  place(id: string, variant: number, x: number, y: number, seed = Math.floor(Math.random() * 1e9)): boolean {
    if (!this.canPlace(id, x, y)) return false;
    const d = defById(id);
    const a = this.idx(x, y);
    this.flatten(x, y, d.w, d.h);          // 施工整地：足迹统一到锚点高度
    this.objs.set(a, { id, v: variant % d.variants, seed, ax: x, ay: y });
    for (let dy = 0; dy < d.h; dy++) {
      for (let dx = 0; dx < d.w; dx++) {
        const i = this.idx(x + dx, y + dy);
        this.occ[i] = a;
        this.tree[i] = -1;   // 施工清表
      }
    }
    this.touch();
    return true;
  }

  /** 推土：优先整栋建筑 → 树 → 道路 */
  bulldoze(x: number, y: number): boolean {
    if (!this.inB(x, y)) return false;
    if (this.removeAt(x, y, false)) return true;
    const i = this.idx(x, y);
    if (this.tree[i] >= 0) {
      this.tree[i] = -1;
      this.touch();
      return true;
    }
    if (this.road[i]) {
      this.road[i] = 0;
      this.touch();
      return true;
    }
    return false;
  }

  /** 移除 (x,y) 所在建筑（整栋）；返回是否移除了对象 */
  private removeAt(x: number, y: number, silent: boolean): boolean {
    const i = this.idx(x, y);
    const a = this.occ[i];
    if (a < 0) return false;
    const o = this.objs.get(a)!;
    const d = defById(o.id);
    for (let dy = 0; dy < d.h; dy++) {
      for (let dx = 0; dx < d.w; dx++) {
        this.occ[this.idx(o.ax + dx, o.ay + dy)] = -1;
      }
    }
    this.objs.delete(a);
    if (!silent) this.touch();
    else this.version++;
    return true;
  }

  // ---------------- 统计 ----------------

  stats(): Stats {
    let pop = 0, buildings = 0, roads = 0, trees = 0;
    for (const o of this.objs.values()) {
      buildings++;
      pop += defById(o.id).pop;
    }
    for (let i = 0; i < this.terr.length; i++) {
      if (this.road[i]) roads++;
      if (this.tree[i] >= 0) trees++;
    }
    return { pop, buildings, roads, trees };
  }

  // ---------------- 地图生成 ----------------

  clear(): void {
    this.terr.fill(TERR_GRASS);
    this.road.fill(0);
    this.tree.fill(-1);
    this.occ.fill(-1);
    this.h.fill(1);
    this.objs.clear();
    this.touch();
  }

  random(seed: number): void {
    const n = this.n, c = (n - 1) / 2;
    this.terr.fill(TERR_GRASS);
    this.road.fill(0);
    this.tree.fill(-1);
    this.occ.fill(-1);
    this.h.fill(0);
    this.objs.clear();
    // v8 主山脊参数：脊线随机挑一侧 + 随机蜿蜒相位（同一种子生成完全一致）
    const ridgeSide = hash2(1, 7, seed) < 0.5 ? -1 : 1;
    const ridgePhase = hash2(3, 9, seed) * Math.PI * 2;
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const i = this.idx(x, y);
        const dc = Math.hypot((x - c) / n, (y - c) / n);

        // ---- 高度场：大尺度起伏 + 山脊噪声，中心保持平缓谷地 ----
        const e = fbm(x / 13.5, y / 13.5, seed);                       // 基础起伏（水系）
        const lift = Math.max(0, 0.22 - dc * 0.5);                     // 中心抬升：出生点为陆地
        const v = e + lift;
        // ---- v8 主山脊：一条沿对角线绵延的真实山脉 ----
        // 对角坐标系：t 沿脊线方向 / p 垂直脊线（单位 = 地图半对角），
        // 脊线中心线 p0(t) = side·(0.40 + 正弦蜿蜒 + fbm 蜿蜒)，随种子随机挑一侧。
        // 高斯衰减 σ=0.085 → 山脊有清晰的麓-坡-脊过渡；脊线上叠加锐化脊噪声
        // 雕出主峰与垭口，摆脱旧版散点"土包山"的塑料感。
        const t = (x + y) / (2 * n);
        const p = (x - y) / (2 * n);
        const p0 = ridgeSide * (0.40
          + 0.06 * Math.sin(t * Math.PI * 2.6 + ridgePhase)
          + (fbm(t * 5.5, 3.3, seed ^ 0x8A31) - 0.5) * 0.14);
        const dp = p - p0;
        const ridgeGAUSS = Math.exp(-(dp * dp) / (2 * 0.085 * 0.085));
        // 域扭曲脊噪声：输入坐标经低频 fbm 扰动 → 脊线自然蜿蜒、支脉斜出
        const wxx = x / 23 + 500 + (fbm(x / 31, y / 31, seed ^ 0xD0D0) - 0.5) * 1.9;
        const wyy = y / 23 + 500 + (fbm(x / 31 + 77, y / 31 + 77, seed ^ 0xD1D1) - 0.5) * 1.9;
        const rg = 1 - Math.abs(2 * fbm(wxx, wyy, seed ^ 0x71D6) - 1);
        const ridgeDetail = Math.pow(rg, 1.6);
        const mainRidge = ridgeGAUSS * (5.5 + 5.0 * ridgeDetail);
        // 山脊噪声（锐化）：只在外围成山，越远越高；v4 幂 1.7→2.2 —— 山脊线更嶙峋、棱线更分明
        const mFac = Math.max(0, Math.min(1, (dc - 0.16) / 0.30));     // 环径 0.16 以内不出山
        const mtn = Math.pow(rg, 2.2) * mFac * (10 + 3 * fbm(x / 40 + 900, y / 40 + 900, seed ^ 0x3D3D))
          + mainRidge;                                                 // v8：散岭 + 主脊叠加
        // 缓丘：低海拔的柔和起伏（1..3 级）
        const hill = Math.max(0, (v - 0.36)) * 9 + fbm(x / 18 + 700, y / 18 + 700, seed ^ 0x9ACD) * 2.2;

        let hh: number;
        if (v < 0.34) hh = 0;                                           // 水面
        else hh = 1 + Math.floor(Math.max(0, Math.min(HMAX - 1, hill * 0.55 + mtn)));
        this.h[i] = hh;

        // ---- 地表类型（由高度 + 原气候带共同决定）----
        if (hh === 0) this.terr[i] = TERR_WATER;
        else if (hh >= 11) this.terr[i] = TERR_SNOW;                    // 雪线之上的皑皑峰顶
        else if (hh >= 7) this.terr[i] = TERR_ROCK;                     // 裸岩高山
        else if (hh >= 5) {
          // 高地草甸与碎石坡
          this.terr[i] = fbm(x / 9 + 404, y / 9 + 404, seed ^ 0x5CA7) > 0.52 ? TERR_ROCK : TERR_DRY;
        } else {
          if (v < 0.385) this.terr[i] = TERR_SAND;                      // 临水浅滩
          else this.terr[i] = TERR_GRASS;
        }

        // ---- 气候带（仅低地草地）：北部雪原 / 南部秋原 ----
        const cy = y / n;
        if (this.terr[i] === TERR_GRASS) {
          if (cy < 0.22 && fbm(x / 12 + 200, y / 12 + 200, seed ^ 0xC01D) > 0.50) {
            this.terr[i] = TERR_SNOW;
          } else if (cy > 0.80 && fbm(x / 12 + 300, y / 12 + 300, seed ^ 0xA377) > 0.50) {
            this.terr[i] = TERR_AUTUMN;
          }
        }
        // 戈壁旱地：外围干燥噪声斑块
        if (this.terr[i] === TERR_GRASS && dc > 0.30 &&
            fbm(x / 10 + 90, y / 10 + 90, seed ^ 0xDEAD) > 0.72) {
          this.terr[i] = TERR_DRY;
        }
        // 滨海沼泽：低海拔湿地
        if (this.terr[i] === TERR_GRASS && v >= 0.385 && v < 0.47 && dc > 0.18 &&
            fbm(x / 8 + 150, y / 8 + 150, seed ^ 0x5AB6) > 0.62) {
          this.terr[i] = TERR_SWAMP;
        }
        // 花田：耕地带附近的野花海
        if (this.terr[i] === TERR_GRASS && dc > 0.30 && dc < 0.55) {
          const f = fbm(x / 9 + 80, y / 9 + 80, seed ^ 0xF10A);
          if (f > 0.60 && f < 0.68) this.terr[i] = TERR_FLOWER;
        }

        if (this.terr[i] === TERR_GRASS && dc > 0.26 &&
            fbm(x / 9 + 80, y / 9 + 80, seed ^ 0xF00D) > 0.66) {
          this.terr[i] = TERR_FARM;   // 外围耕作带
        }

        // ---- 森林 ----
        const forest = fbm(x / 7.3 + 40, y / 7.3 + 40, seed ^ 0x51ab);
        const t0 = this.terr[i];
        if (t0 === TERR_GRASS && forest > 0.62 && hash2(x, y, seed) < 0.55) {
          this.tree[i] = Math.floor(hash2(x, y, 31) * TREE_KINDS);
        } else if (t0 === TERR_SNOW && forest > 0.56 && hash2(x, y, seed) < 0.5) {
          this.tree[i] = hash2(x, y, 31) < 0.7 ? 1 : 5;   // 雪原以松/高乔木为主
        } else if (t0 === TERR_AUTUMN && forest > 0.60 && hash2(x, y, seed) < 0.42) {
          this.tree[i] = hash2(x, y, 31) < 0.5 ? 0 : 5;   // 秋原阔叶疏林
        } else if (t0 === TERR_ROCK && hh >= 6 && hh <= 9 &&
                   forest > 0.66 && hash2(x, y, seed) < 0.16) {
          this.tree[i] = 1;                                // 高山疏林：岩坡孤松
        }
      }
    }
    this.touch();
  }

  // ---------------- 地形改造（抬升 / 降低） ----------------

  /** 该格是否可改造高度（空地：无建筑 / 无道路 / 无树） */
  canTerra(x: number, y: number): boolean {
    if (!this.inB(x, y)) return false;
    const i = this.idx(x, y);
    return this.occ[i] < 0 && !this.road[i] && this.tree[i] < 0;
  }

  /** 抬升：陆地 +1 级（上限 HMAX）；水面 → 填成草地陆地。返回 'ok'|'max'|'blocked' */
  liftAt(x: number, y: number): 'ok' | 'max' | 'blocked' {
    if (!this.canTerra(x, y)) return 'blocked';
    const i = this.idx(x, y);
    if (this.h[i] >= HMAX) return 'max';
    if (this.h[i] === 0) {
      this.terr[i] = TERR_GRASS;   // 填海成陆
      this.h[i] = 1;
    } else {
      this.h[i]++;
    }
    this.touch();
    return 'ok';
  }

  /** 降低：陆地 −1 级；降到 0 变水域（会淹没该格）。返回 'ok'|'bedrock'|'blocked' */
  sinkAt(x: number, y: number): 'ok' | 'bedrock' | 'blocked' {
    if (!this.canTerra(x, y)) return 'blocked';
    const i = this.idx(x, y);
    if (this.h[i] <= 0) return 'bedrock';
    this.h[i]--;
    if (this.h[i] === 0) {
      this.terr[i] = TERR_WATER;   // 挖到海平面以下 → 成水域
    }
    this.touch();
    return 'ok';
  }

  /** 清除全部道路/树木/建筑，保留地形（一键城市用） */
  clearObjects(): void {
    this.road.fill(0);
    this.tree.fill(-1);
    this.occ.fill(-1);
    this.objs.clear();
    this.touch();
  }

  // ---------------- 序列化 ----------------

  serialize(): string {
    const objs: Array<[number, string, number, number]> = [];
    for (const [a, o] of this.objs) objs.push([a, o.id, o.v, o.seed]);
    return JSON.stringify({
      v: 3, n: this.n,
      terr: rleEnc(this.terr),
      road: rleEnc(this.road),
      tree: rleEnc(this.tree),
      h: rleEnc(this.h),
      objs,
    });
  }

  /** v1 明文数组 / v2 游程对 → 长度 dn*dn 的明文数组 */
  private expandArr(src: unknown, dn: number): number[] | null {
    if (!Array.isArray(src)) return null;
    const total = dn * dn;
    if (src.length === total && src.every(x => Number.isInteger(x))) return src as number[];
    if (src.length % 2 === 0) {
      const out = new Array<number>(total).fill(0);
      let i = 0;
      for (let k = 0; k < src.length; k += 2) {
        const run = src[k], v = src[k + 1];
        if (!Number.isInteger(run) || run < 1 || i + run > total) return null;
        out.fill(v, i, i + run);
        i += run;
      }
      return i === total ? out : null;
    }
    return null;
  }

  deserialize(s: string): boolean {
    try {
      const d = JSON.parse(s);
      const dn = d?.n;
      if (typeof dn !== 'number' || dn < 8 || dn > this.n || !Array.isArray(d.terr)) return false;
      const T = this.expandArr(d.terr, dn);
      const R = this.expandArr(d.road, dn);
      const Tr = this.expandArr(d.tree, dn);
      const H = d.h ? this.expandArr(d.h, dn) : null;   // v3 起才有高度场
      if (!T || !R || !Tr) return false;

      // 小地图居中迁移：旧尺寸存档放大后居中摆放
      const off = Math.floor((this.n - dn) / 2);
      this.terr.fill(TERR_GRASS);
      this.road.fill(0);
      this.tree.fill(-1);
      this.occ.fill(-1);
      this.h.fill(0);
      this.objs.clear();

      for (let y = 0; y < dn; y++) {
        for (let x = 0; x < dn; x++) {
          const si = y * dn + x;
          const di = this.idx(x + off, y + off);
          const t = T[si];
          this.terr[di] = (t >= 0 && t <= 9) ? t : TERR_GRASS;
          this.road[di] = R[si] === 2 ? 2 : R[si] ? 1 : 0;   // v6：桥面标记直读
          const tv = Tr[si];
          this.tree[di] = (tv >= 0 && tv <= TREE_KINDS - 1) ? (tv | 0) : -1;
          // 高度：v3 直读；v2 旧档推导（水 0 / 陆 1，保持旧世界平坦可玩）
          const hv = H ? H[si] : (this.terr[di] === TERR_WATER ? 0 : 1);
          this.h[di] = Math.max(0, Math.min(HMAX, hv | 0));
        }
      }
      for (const it of d.objs ?? []) {
        const [a, id, v, seed] = it;
        if (!CATALOG.some(x => x.id === id)) continue;
        const ax = (a % dn) + off, ay = Math.floor(a / dn) + off;
        const dd = defById(id);
        if (!this.inB(ax, ay) || !this.inB(ax + dd.w - 1, ay + dd.h - 1)) continue;
        const key = this.idx(ax, ay);
        this.objs.set(key, { id, v, seed, ax, ay });
        for (let dy = 0; dy < dd.h; dy++) {
          for (let dx = 0; dx < dd.w; dx++) {
            this.occ[this.idx(ax + dx, ay + dy)] = key;
          }
        }
      }
      this.touch();
      return true;
    } catch {
      return false;
    }
  }
}
