// ============================================================
// geo.ts — px 世界坐标 + 等距 2:1 正交投影 + 程序化建模原语
//
// 世界坐标：X/Y 沿地面（16px = 1 格边长），Z 向上（px）。
// 正交投影：sx = X − Y, sy = (X + Y) / 2 − Z
// 视轴 D = (1,1,1)（相机在 +X+Y+Z 卦限），面剔除 n·D > 0。
// 深度排序按面质心 X+Y+Z 升序（画家算法），对凸体与
// 「环状/嵌套」结构（体育场碗、屋顶烟囱）均正确。
// ============================================================

import { faceLevel } from './palette';
import type { PatFn, PatCell } from './patterns';

export type V3 = readonly [number, number, number];

/** 半格宽高（px） */
export const HW = 16;
export const HH = 8;
/** 一格边长（px 世界单位） */
export const TILE = 16;

export function projX(X: number, Y: number): number {
  return X - Y;
}
export function projY(X: number, Y: number, Z: number): number {
  return (X + Y) / 2 - Z;
}

// ------------------------------------------------------------
// 面（Face）：平面 n·P = d + 图案空间 (o, tu, tv)
// ------------------------------------------------------------

export type Face = {
  nx: number; ny: number; nz: number; d: number;
  lvl: number;              // 光照档位 0/1/2
  o: V3; tu: V3; tv: V3;    // 图案空间：u,v = (P−o)·tu / (P−o)·tv
  pts: Array<readonly [number, number]>;  // 投影后多边形（凸）
  y0: number; y1: number;   // 投影像素包围盒
  pat: PatFn;
  depth: number;            // 质心深度 X+Y+Z
};

export type Model = {
  faces: Face[];
  fw: number; fh: number;   // 足印（px 世界尺寸）
};

function cross(ax: number, ay: number, az: number, bx: number, by: number, bz: number): V3 {
  return [ay * bz - az * by, az * bx - ax * bz, ax * by - ay * bx];
}

/** 由顶点构造面；normalDir 用于校正朝向（指向固体外部） */
export function makeFace(
  verts: readonly V3[],
  outward: V3,
  pat: PatFn,
  o: V3,
  tu: V3,
  tv: V3,
): Face {
  // 以 (v1−v0)×(v2−v0) 求平面法线，若朝内则翻转
  const [a, b, c] = verts;
  const e1: V3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const e2: V3 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  let n = cross(e1[0], e1[1], e1[2], e2[0], e2[1], e2[2]);
  const len = Math.hypot(n[0], n[1], n[2]) || 1;
  n = [n[0] / len, n[1] / len, n[2] / len];
  if (n[0] * outward[0] + n[1] * outward[1] + n[2] * outward[2] < 0) {
    n = [-n[0], -n[1], -n[2]];
  }
  const d = n[0] * verts[0][0] + n[1] * verts[0][1] + n[2] * verts[0][2];
  const pts: Array<readonly [number, number]> = verts.map(v => [projX(v[0], v[1]), projY(v[0], v[1], v[2])]);
  let cx = 0, cy = 0, cz = 0;
  for (const v of verts) { cx += v[0]; cy += v[1]; cz += v[2]; }
  const k = verts.length;
  let y0 = Infinity, y1 = -Infinity;
  for (const p of pts) {
    if (p[1] < y0) y0 = p[1];
    if (p[1] > y1) y1 = p[1];
  }
  return {
    nx: n[0], ny: n[1], nz: n[2], d, lvl: faceLevel(n[0], n[1], n[2]),
    o, tu, tv, pts, y0, y1, pat, depth: (cx / k) + (cy / k) + (cz / k),
  };
}

// ------------------------------------------------------------
// 建模原语
// ------------------------------------------------------------

export type BoxMats = {
  top?: PatFn;     // 顶 +Z
  right?: PatFn;   // +X（屏幕右立面）
  left?: PatFn;    // +Y（屏幕左立面）
};

/** 轴对齐长方体（只生成可见的 3 个面；±X 隐藏面/底面永远被剔除） */
export function box(
  faces: Face[],
  x0: number, y0: number, x1: number, y1: number, z0: number, z1: number,
  m: BoxMats,
): void {
  if (m.top) {
    faces.push(makeFace(
      [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]],
      [0, 0, 1], m.top, [x0, y0, z1], [1, 0, 0], [0, 1, 0],
    ));
  }
  if (m.right) {
    faces.push(makeFace(
      [[x1, y1, z0], [x1, y0, z0], [x1, y0, z1], [x1, y1, z1]],
      [1, 0, 0], m.right, [x1, y1, z0], [0, -1, 0], [0, 0, 1],
    ));
  }
  if (m.left) {
    faces.push(makeFace(
      [[x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]],
      [0, 1, 0], m.left, [x0, y1, z0], [1, 0, 0], [0, 0, 1],
    ));
  }
}

export type RoofMats = {
  front?: PatFn; back?: PatFn; endX?: PatFn; endY?: PatFn;
};

/**
 * 双坡（人字）屋顶。axis='x'：屋脊沿 X；endX=山墙（+X 端三角）。
 * 足印比墙体各外扩 ov（挑檐）。
 */
export function gableRoof(
  faces: Face[],
  x0: number, y0: number, x1: number, y1: number,
  zEave: number, zRidge: number,
  axis: 'x' | 'y', m: RoofMats,
): void {
  const rise = zRidge - zEave;
  if (axis === 'x') {
    const ym = (y0 + y1) / 2;
    const dh = y1 - ym;
    if (m.front) {
      faces.push(makeFace(
        [[x0, y1, zEave], [x1, y1, zEave], [x1, ym, zRidge], [x0, ym, zRidge]],
        [0, rise, dh], m.front, [x0, y1, zEave], [1, 0, 0], [0, 0, 1],
      ));
    }
    if (m.back) {
      faces.push(makeFace(
        [[x0, y0, zEave], [x1, y0, zEave], [x1, ym, zRidge], [x0, ym, zRidge]],
        [0, -rise, dh], m.back, [x0, y0, zEave], [1, 0, 0], [0, 0, 1],
      ));
    }
    if (m.endX) {
      faces.push(makeFace(
        [[x1, y0, zEave], [x1, y1, zEave], [x1, ym, zRidge]],
        [1, 0, 0], m.endX, [x1, y1, zEave], [0, -1, 0], [0, 0, 1],
      ));
      faces.push(makeFace(
        [[x0, y0, zEave], [x0, y1, zEave], [x0, ym, zRidge]],
        [-1, 0, 0], m.endX, [x0, y1, zEave], [0, -1, 0], [0, 0, 1],
      ));
    }
  } else {
    const xm = (x0 + x1) / 2;
    const dh = x1 - xm;
    if (m.front) {
      faces.push(makeFace(
        [[x1, y0, zEave], [x1, y1, zEave], [xm, y1, zRidge], [xm, y0, zRidge]],
        [rise, 0, dh], m.front, [x1, y0, zEave], [0, 1, 0], [0, 0, 1],
      ));
    }
    if (m.back) {
      faces.push(makeFace(
        [[x0, y0, zEave], [x0, y1, zEave], [xm, y1, zRidge], [xm, y0, zRidge]],
        [-rise, 0, dh], m.back, [x0, y0, zEave], [0, 1, 0], [0, 0, 1],
      ));
    }
    if (m.endY) {
      faces.push(makeFace(
        [[x0, y1, zEave], [x1, y1, zEave], [xm, y1, zRidge]],
        [0, 1, 0], m.endY, [x0, y1, zEave], [1, 0, 0], [0, 0, 1],
      ));
      faces.push(makeFace(
        [[x0, y0, zEave], [x1, y0, zEave], [xm, y0, zRidge]],
        [0, -1, 0], m.endY, [x0, y0, zEave], [1, 0, 0], [0, 0, 1],
      ));
    }
  }
}

/** 四坡（庑殿）屋顶：2 梯形坡 + 2 三角坡，脊线沿 X 居中，脊长比 q ∈ (0,1] */
export function hipRoof(
  faces: Face[],
  x0: number, y0: number, x1: number, y1: number,
  zEave: number, zRidge: number, q: number,
  m: { slope?: PatFn; slopeX?: PatFn },
): void {
  const xm0 = x0 + (x1 - x0) * (1 - q) / 2;
  const xm1 = x1 - (x1 - x0) * (1 - q) / 2;
  const ym = (y0 + y1) / 2;
  const s = m.slope;
  if (s) {
    faces.push(makeFace(
      [[x0, y1, zEave], [x1, y1, zEave], [xm1, ym, zRidge], [xm0, ym, zRidge]],
      [0, 1, 1], s, [x0, y1, zEave], [1, 0, 0], [0, 0, 1],
    ));
    faces.push(makeFace(
      [[x0, y0, zEave], [x1, y0, zEave], [xm1, ym, zRidge], [xm0, ym, zRidge]],
      [0, -1, 1], s, [x0, y0, zEave], [1, 0, 0], [0, 0, 1],
    ));
  }
  const sx = m.slopeX ?? m.slope;
  if (sx) {
    faces.push(makeFace(
      [[x1, y0, zEave], [x1, y1, zEave], [xm1, ym, zRidge]],
      [1, 0, 1], sx, [x1, y0, zEave], [0, 1, 0], [0, 0, 1],
    ));
    faces.push(makeFace(
      [[x0, y0, zEave], [x0, y1, zEave], [xm0, ym, zRidge]],
      [-1, 0, 1], sx, [x0, y0, zEave], [0, 1, 0], [0, 0, 1],
    ));
  }
}

/** 四棱锥顶（塔尖/凉亭） */
export function pyramid(
  faces: Face[],
  x0: number, y0: number, x1: number, y1: number,
  zBase: number, zApex: number, pat: PatFn,
): void {
  const xm = (x0 + x1) / 2, ym = (y0 + y1) / 2;
  faces.push(makeFace([[x1, y0, zBase], [x1, y1, zBase], [xm, ym, zApex]], [1, 0, 1], pat, [x1, y0, zBase], [0, 1, 0], [0, 0, 1]));
  faces.push(makeFace([[x0, y0, zBase], [x0, y1, zBase], [xm, ym, zApex]], [-1, 0, 1], pat, [x0, y0, zBase], [0, 1, 0], [0, 0, 1]));
  faces.push(makeFace([[x0, y1, zBase], [x1, y1, zBase], [xm, ym, zApex]], [0, 1, 1], pat, [x0, y1, zBase], [1, 0, 0], [0, 0, 1]));
  faces.push(makeFace([[x0, y0, zBase], [x1, y0, zBase], [xm, ym, zApex]], [0, -1, 1], pat, [x0, y0, zBase], [1, 0, 0], [0, 0, 1]));
}

export type CylMats = {
  side?: (u: number, v: number, px: number, py: number) => PatCell; // u 为连续弧长
  top?: PatFn;
  topR?: number;  // 顶面半径缩放（盆/檐口内缩）
};

/**
 * n 棱柱 / 圆台（n=8 足够圆）。r1 ≠ r0 时为锥台。
 * 通过 invert=true 生成朝内的面（体育场碗内壁）。
 */
export function frustum(
  faces: Face[],
  cx: number, cy: number,
  r0: number, r1: number,
  z0: number, z1: number,
  m: CylMats,
  segs = 8,
  invert = false,
): void {
  const step = (Math.PI * 2) / segs;
  const h = z1 - z0;
  for (let i = 0; i < segs; i++) {
    const t0 = i * step, t1 = (i + 1) * step, tm = (i + 0.5) * step;
    const c0 = Math.cos(t0), s0 = Math.sin(t0);
    const c1 = Math.cos(t1), s1 = Math.sin(t1);
    const cm = Math.cos(tm), sm = Math.sin(tm);
    const dr = r1 - r0;
    // 外法线（连续锥台面）：(cm·h, sm·h, −dr)
    let nx = cm * h, ny = sm * h, nz = -dr;
    const l = Math.hypot(nx, ny, nz) || 1;
    nx /= l; ny /= l; nz /= l;
    if (invert) { nx = -nx; ny = -ny; nz = -nz; }
    const u0 = tm * r0; // 该面起点弧长
    const pat: PatFn = (u, v, px, py) => m.side!(u0 + u, v, px, py);
    faces.push(makeFace(
      [
        [cx + r0 * c0, cy + r0 * s0, z0],
        [cx + r0 * c1, cy + r0 * s1, z0],
        [cx + r1 * c1, cy + r1 * s1, z1],
        [cx + r1 * c0, cy + r1 * s0, z1],
      ],
      [nx, ny, nz],
      pat,
      [cx + r0 * c0, cy + r0 * s0, z0],
      [-s0, c0, 0],  // 单位切向（u = 弧长 px）
      [0, 0, 1],
    ));
  }
  if (m.top) {
    const rt = r1 * (m.topR ?? 1);
    const ring: V3[] = [];
    for (let i = segs - 1; i >= 0; i--) {
      const t = i * step;
      ring.push([cx + rt * Math.cos(t), cy + rt * Math.sin(t), z1]);
    }
    faces.push(makeFace(ring, [0, 0, 1], m.top,
      [cx - rt, cy - rt, z1], [1, 0, 0], [0, 1, 0]));
  }
}

/** 圆锥（树冠等）：底半径 r0，尖顶 */
export function cone(
  faces: Face[],
  cx: number, cy: number, r0: number, z0: number, z1: number,
  side: (u: number, v: number, px: number, py: number) => PatCell,
  segs = 8,
): void {
  frustum(faces, cx, cy, r0, 0.01, z0, z1, { side }, segs);
}

/** 便利：棱柱（上下同径） */
export function prism(
  faces: Face[],
  cx: number, cy: number, r: number, z0: number, z1: number,
  m: CylMats, segs = 8,
): void {
  frustum(faces, cx, cy, r, r, z0, z1, m, segs);
}

/** 组装 Model */
export function buildModel(faces: Face[], fw: number, fh: number): Model {
  return { faces, fw, fh };
}
