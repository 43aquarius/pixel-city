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
    // 水淹规则：水域清除该格上的一切
    if (k === TERR_WATER) {
      this.removeAt(x, y, true);
      this.road[this.idx(x, y)] = 0;
      this.tree[this.idx(x, y)] = -1;
    }
    this.terr[this.idx(x, y)] = k;
    this.touch();
    return true;
  }

  // ---------------- 道路 ----------------

  canRoad(x: number, y: number): boolean {
    return this.inB(x, y) && this.terr[this.idx(x, y)] !== TERR_WATER &&
      this.occ[this.idx(x, y)] < 0;
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
      this.tree[this.idx(x, y)] = -1;   // 修路伐树
      this.road[this.idx(x, y)] = 1;
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

  place(id: string, variant: number, x: number, y: number, seed = Math.floor(Math.random() * 1e9)): boolean {
    if (!this.canPlace(id, x, y)) return false;
    const d = defById(id);
    const a = this.idx(x, y);
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
    this.objs.clear();
    this.touch();
  }

  random(seed: number): void {
    const n = this.n, c = (n - 1) / 2;
    this.terr.fill(TERR_GRASS);
    this.road.fill(0);
    this.tree.fill(-1);
    this.occ.fill(-1);
    this.objs.clear();
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const e = fbm(x / 13.5, y / 13.5, seed);
        // 中心抬升，保证出生点为陆地
        const dc = Math.hypot((x - c) / n, (y - c) / n);
        const lift = Math.max(0, 0.22 - dc * 0.5);
        const v = e + lift;
        const i = this.idx(x, y);
        if (v < 0.34) this.terr[i] = TERR_WATER;
        else if (v < 0.385) this.terr[i] = TERR_SAND;
        else if (v > 0.615 && dc > 0.2) this.terr[i] = TERR_ROCK;   // 远离中心的岩石高地

        // ---- 气候带（仅草地）：北部雪原 / 南部秋原 ----
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
        }
      }
    }
    this.touch();
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
      v: 2, n: this.n,
      terr: rleEnc(this.terr),
      road: rleEnc(this.road),
      tree: rleEnc(this.tree),
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
      if (!T || !R || !Tr) return false;

      // 小地图居中迁移：旧尺寸存档放大后居中摆放
      const off = Math.floor((this.n - dn) / 2);
      this.terr.fill(TERR_GRASS);
      this.road.fill(0);
      this.tree.fill(-1);
      this.occ.fill(-1);
      this.objs.clear();

      for (let y = 0; y < dn; y++) {
        for (let x = 0; x < dn; x++) {
          const si = y * dn + x;
          const di = this.idx(x + off, y + off);
          const t = T[si];
          this.terr[di] = (t >= 0 && t <= 9) ? t : TERR_GRASS;
          this.road[di] = R[si] ? 1 : 0;
          const tv = Tr[si];
          this.tree[di] = (tv >= 0 && tv <= TREE_KINDS - 1) ? (tv | 0) : -1;
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
