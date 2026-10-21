// ============================================================
// terrain.ts — 地面精灵工厂（草地/水/沙 + 海岸过渡 + 道路自动拼接
//              + 公园/广场/学校/神社/球场特殊地面）
//
// 地面平铺：世界坐标半开区间 [0,16)² 精确覆盖屏幕，无接缝无重叠。
// 所有纹理均为「值噪声 + Bayer 有序抖动量化」的有限色板像素画。
// ============================================================

import { RAMPS, RAMP, LUT, BAYER8 } from './palette';
import { vnoise, hash2 } from './rng';
import type { Sprite } from './softrender';

export type GroundKind =
  'grass' | 'water' | 'sand' | 'road' | 'park' | 'plaza' | 'school' | 'temple' | 'field'
  | 'farm' | 'rock' | 'parking' | 'snow' | 'flower' | 'dry' | 'swamp' | 'autumn';

const KIND_IDX: Record<GroundKind, number> = {
  grass: 0, water: 1, sand: 2, road: 3, park: 4, plaza: 5, school: 6, temple: 7, field: 8,
  farm: 9, rock: 10, parking: 11, snow: 12, flower: 13, dry: 14, swamp: 15, autumn: 16,
};

/** 值 + Bayer → 有序抖动量化到 levels 档 */
function dquant(v: number, px: number, py: number, levels: number): number {
  const b = (BAYER8[(py & 7) * 8 + (px & 7)] + 0.5) / 64;
  const q = Math.floor(v * levels + b * 0.85 - 0.42);
  return q < 0 ? 0 : q > levels - 1 ? levels - 1 : q;
}

type GroundCtx = {
  variant: number;   // 0..3 草地纹理变体
  edge: number;      // 1=N(y−1) 2=E(x+1) 4=S(y+1) 8=W(x−1)：草地→水相邻 / 水→陆相邻
  road: number;      // 道路连接掩码（同上位）
  frame: number;     // 水面动画帧
};

type GroundPat = (X: number, Y: number, px: number, py: number, c: GroundCtx) => number;

const P = RAMP;
const ramp = (r: number, l: number): number => RAMPS[r][l];

/** 草簇位置（每变体 3 处，模块加载时定型） */
const TUFT_POS: Array<Array<[number, number]>> = [0, 1, 2, 3].map(vi =>
  [0, 1, 2].map(k => [
    1.5 + hash2(vi * 9 + 1, k * 3 + 1, 31) * 12,
    1.5 + hash2(vi * 7 + 2, k * 5 + 2, 33) * 12,
  ] as [number, number]),
);

// ------------------------------------------------------------
// 基础地形图案
// ------------------------------------------------------------

function grassBase(X: number, Y: number, px: number, py: number, c: GroundCtx): number {
  const n = vnoise(X / 4.6, Y / 4.6, 101 + c.variant * 37);
  const tint = (hash2(c.variant, 9, 5) - 0.5) * 0.06;
  const v = 0.52 + (n - 0.5) * 0.34 + tint;
  return ramp(P.GRASS, dquant(v, px, py, 4));
}

const grassPat: GroundPat = (X, Y, px, py, c) => {
  // 装饰：小花（黄/白/红） / 石子（变体 2/3）
  if (c.variant === 2) {
    const fx = 2 + hash2(1, 2, 9) * 12, fy = 2 + hash2(3, 4, 9) * 12;
    if (Math.abs(X - fx) < 0.6 && Math.abs(Y - fy) < 0.6) {
      return ramp(P.YELLOW, 0);
    }
    const fx2 = 2 + hash2(5, 6, 9) * 12, fy2 = 2 + hash2(7, 8, 9) * 12;
    if (Math.abs(X - fx2) < 0.6 && Math.abs(Y - fy2) < 0.6) return ramp(P.WHITE, 0);
    const fx3 = 2 + hash2(9, 10, 9) * 12, fy3 = 2 + hash2(11, 12, 9) * 12;
    if (Math.abs(X - fx3) < 0.6 && Math.abs(Y - fy3) < 0.6) return ramp(P.RED, 0);
  } else if (c.variant === 3) {
    const sx = 3 + hash2(11, 12, 9) * 10, sy = 3 + hash2(13, 14, 9) * 10;
    if (Math.abs(X - sx) < 0.7 && Math.abs(Y - sy) < 0.7) return ramp(P.SIDE, 1);
  }
  // 草簇：三两处深色草叶（所有变体，左亮右暗）
  for (const [tx, ty] of TUFT_POS[c.variant]) {
    if (X >= tx && X < tx + 1.6 && Y >= ty && Y < ty + 2.6) {
      return (X - tx) < 0.8 ? ramp(P.GRASS, 2) : ramp(P.GRASS, 3);
    }
  }
  // 水岸 → 沙滩过渡带
  const bands: Array<[number, number]> = [
    [c.edge & 1, Y], [c.edge & 4, 16 - Y], [c.edge & 2, 16 - X], [c.edge & 8, X],
  ];
  let base = grassBase(X, Y, px, py, c);
  for (const [e, d] of bands) {
    if (!e) continue;
    if (d < 2.2) return ramp(P.SAND, 0);
    if (d < 4.6) {
      const t = (4.6 - d) / 2.4 * 0.8;
      const b = (BAYER8[(py & 7) * 8 + (px & 7)] + 0.5) / 64;
      return b < t ? ramp(P.SAND, 1) : base;
    }
  }
  return base;
};

const sandPat: GroundPat = (X, Y, px, py) => {
  const n = vnoise(X / 5, Y / 5, 55);
  const v = 0.42 + (n - 0.5) * 0.3;
  const q = dquant(v, px, py, 3);
  if (hash2(Math.floor(X / 2), Math.floor(Y / 2), 3) < 0.03) return ramp(P.DIRT, 0);
  return ramp(P.SAND, q);
};

const waterPat: GroundPat = (X, Y, px, py, c) => {
  const f = c.frame;
  const n = vnoise(X / 6 + f * 1.31, Y / 6 + f * 0.7, 77);
  const n2 = vnoise(X / 2.5, Y / 2.5, 78 + f);
  // 波光：随帧闪炼的白色亮斑
  if (n2 > 0.93) return ramp(P.FOAM, 0);
  const v = 0.46 + (n - 0.5) * 0.34 + (n2 - 0.5) * 0.12;
  let base = ramp(P.WATER, dquant(v, px, py, 4));
  // 岸边泡沫
  const bands: Array<[number, number]> = [
    [c.edge & 1, Y], [c.edge & 4, 16 - Y], [c.edge & 2, 16 - X], [c.edge & 8, X],
  ];
  for (const [e, d] of bands) {
    if (!e) continue;
    if (d < 1.3) return ramp(P.FOAM, 0);
    if (d < 3.2) {
      const t = (3.2 - d) / 1.9 * 0.65;
      const b = (BAYER8[(py & 7) * 8 + (px & 7)] + 0.5) / 64;
      if (b < t) return ramp(P.WATER, 0);
    }
  }
  return base;
};

// ------------------------------------------------------------
// 道路（自动拼接：16 种连接掩码）
// ------------------------------------------------------------

const roadPat: GroundPat = (X, Y, px, py, c) => {
  const m = c.road;
  const cN = m & 1, cE = m & 2, cS = m & 4, cW = m & 8;
  const dN = Y, dS = 16 - Y, dW = X, dE = 16 - X;
  const b = (BAYER8[(py & 7) * 8 + (px & 7)] + 0.5) / 64;
  const straightNS = cN && cS && !cE && !cW;
  const straightEW = cE && cW && !cN && !cS;

  // 侧石（路面边缘一圈深色）
  const curb =
    (!cN && dN > 4.2 && dN < 5.1) || (!cS && dS > 4.2 && dS < 5.1) ||
    (!cW && dW > 4.2 && dW < 5.1) || (!cE && dE > 4.2 && dE < 5.1);
  if (curb) return ramp(P.SIDE, 2);

  // 人行道（无连接方向的外缘带）
  const sw = (d: number, conn: number, lit: boolean, along: number) => {
    if (conn || d >= 4.2) return -1;
    const joint = (along % 4) < 0.75;
    if (lit) return joint ? ramp(P.SIDE, 1) : ramp(P.SIDE, 0);
    return joint ? ramp(P.SIDE, 2) : ramp(P.SIDE, 1);
  };
  let r = sw(dN, cN, true, X);
  if (r < 0) r = sw(dW, cW, true, Y);
  if (r < 0) r = sw(dS, cS, false, X);
  if (r < 0) r = sw(dE, cE, false, Y);
  if (r >= 0) {
    // 人行道转角饰钉
    if (hash2(Math.floor(X / 4), Math.floor(Y / 4), 2) < 0.05) return ramp(P.SIDE, 2);
    return r;
  }

  // 窨井盖（部分直路，偏离中线）
  if ((straightNS || straightEW) && c.variant === 1) {
    const mx = straightNS ? 6.2 : 9.5;
    const my = straightNS ? 9.5 : 6.2;
    const dxr = (X - mx) / 1.7, dyr = (Y - my) / 1.7;
    const rr = dxr * dxr + dyr * dyr;
    if (rr < 1) return ramp(P.ASPH, 2);
    if (rr < 1.5) return b < 0.5 ? ramp(P.ASPH, 0) : ramp(P.ASPH, 1);
  }

  // 中线虚线（仅直路）
  if (straightNS && Math.abs(X - 8) < 0.85 && (Y % 7) < 3.4) {
    return b < 0.25 ? ramp(P.PAINTY, 1) : ramp(P.PAINTY, 0);
  }
  if (straightEW && Math.abs(Y - 8) < 0.85 && (X % 7) < 3.4) {
    return b < 0.25 ? ramp(P.PAINTY, 1) : ramp(P.PAINTY, 0);
  }

  // 龟裂细线（斜向）
  if (c.variant === 2 && straightNS && Math.abs(X + Y * 0.55 - 15) < 0.35) return ramp(P.ASPH, 2);
  if (c.variant === 2 && straightEW && Math.abs(Y + X * 0.55 - 14) < 0.35) return ramp(P.ASPH, 2);

  // 沥青修补疤（深色补丁，边缘虚化）
  if (c.variant === 3 && X > 9.6 && X < 14.2 && Y > 2.4 && Y < 6.8) {
    return b < 0.6 ? ramp(P.ASPH, 1) : ramp(P.ASPH, 2);
  }

  // 沥青路面：磨耗斑点
  const n = vnoise(X / 3, Y / 3, 42 + c.variant);
  if (n > 0.78) return ramp(P.ASPH, 0);
  if (n < 0.16) return ramp(P.ASPH, 2);
  return ramp(P.ASPH, 1);
};

// ------------------------------------------------------------
// 耕地 / 岩石 / 停车场
// ------------------------------------------------------------

const farmPat: GroundPat = (X, Y, px, py, c) => {
  // 水缘：泥边
  const bands: Array<[number, number]> = [
    [c.edge & 1, Y], [c.edge & 4, 16 - Y], [c.edge & 2, 16 - X], [c.edge & 8, X],
  ];
  for (const [e, d] of bands) if (e && d < 1.6) return ramp(P.DIRT, 1);
  const along = (c.variant & 1) === 0;
  const t = along ? Y : X;
  const golden = c.variant < 2;
  if (t % 4 < 2.5) {
    // 作物行
    const n = vnoise(X / 3.1, Y / 3.1, 66 + c.variant);
    if (golden) {
      if (hash2(Math.floor(X / 2), Math.floor(Y / 2), 4) < 0.10) return ramp(P.PAINTY, 0);
      return ramp(P.TAN, dquant(0.52 + (n - 0.5) * 0.4, px, py, 3));
    }
    if (hash2(Math.floor(X / 2), Math.floor(Y / 2), 4) < 0.08) return ramp(P.LEAF, 0);
    return ramp(P.GRASS, dquant(0.55 + (n - 0.5) * 0.3, px, py, 3));
  }
  // 垅沟泥土
  const b = (BAYER8[(py & 7) * 8 + (px & 7)] + 0.5) / 64;
  return b < 0.35 ? ramp(P.DIRT, 1) : ramp(P.DIRT, 0);
};

const rockPat: GroundPat = (X, Y, px, py, c) => {
  // 水缘：砾石滩
  const bands: Array<[number, number]> = [
    [c.edge & 1, Y], [c.edge & 4, 16 - Y], [c.edge & 2, 16 - X], [c.edge & 8, X],
  ];
  for (const [e, d] of bands) if (e && d < 1.5) return ramp(P.SIDE, 2);
  // 碎石堆（每变体固定 2 处）
  const bx = 2.5 + hash2(c.variant, 2, 21) * 11, by = 2.5 + hash2(c.variant, 3, 21) * 11;
  const bx2 = 2.5 + hash2(c.variant, 5, 21) * 11, by2 = 2.5 + hash2(c.variant, 6, 21) * 11;
  const rocks: Array<[number, number, number]> = [[bx, by, 2.4], [bx2, by2, 1.7]];
  for (const [ox, oy, r0] of rocks) {
    const d = Math.hypot(X - ox, Y - oy);
    if (d < r0) {
      if (d > r0 - 0.9) return ramp(P.SIDE, 2);            // 岩缘
      return X < ox ? ramp(P.SIDE, 0) : ramp(P.ASPH, 1);    // 岩顶受光
    }
  }
  if (hash2(Math.floor(X / 3), Math.floor(Y / 3), 22) < 0.05) return ramp(P.DIRT, 1);
  const n = vnoise(X / 4.2, Y / 4.2, 33);
  return ramp(P.SIDE, dquant(0.5 + (n - 0.5) * 0.3, px, py, 3));
};

const parkingPat: GroundPat = (X, Y, _px, _py) => {
  // 侧石围边，西侧留车行入口（y 6..10）
  const inGate = Y > 5.6 && Y < 10.4;
  if (X < 1.3 && !inGate) return ramp(P.SIDE, 2);
  if (Y < 1.3 || Y > 14.7 || X > 14.7) return ramp(P.SIDE, 2);
  const stallN = (Y > 1.3 && Y < 6.2) || (Y > 10.3 && Y < 14.7);
  if (stallN) {
    const lx = X - 1.6;
    if (lx >= 0 && lx % 3.2 < 0.62) return ramp(P.WHITE, 0);
    if (hash2(Math.floor(X / 3), Math.floor(Y / 3), 8) < 0.07) return ramp(P.ASPH, 0);
    return ramp(P.ASPH, 1);
  }
  // 中部车道
  const n = vnoise(X / 3, Y / 3, 12);
  if (n > 0.8) return ramp(P.ASPH, 0);
  if (n < 0.15) return ramp(P.ASPH, 2);
  return ramp(P.ASPH, 1);
};

// ------------------------------------------------------------
// 雪 / 花田 / 荒漠 / 沼泽 / 秋原
// ------------------------------------------------------------

const snowPat: GroundPat = (X, Y, px, py, c) => {
  // 冰缘：接触水面处冻结成青白色岸冰
  const bands: Array<[number, number]> = [
    [c.edge & 1, Y], [c.edge & 4, 16 - Y], [c.edge & 2, 16 - X], [c.edge & 8, X],
  ];
  for (const [e, d] of bands) {
    if (!e) continue;
    if (d < 1.0) return ramp(P.CYAN, 0);
    if (d < 2.6) {
      const t = (2.6 - d) / 1.6 * 0.7;
      const b = (BAYER8[(py & 7) * 8 + (px & 7)] + 0.5) / 64;
      return b < t ? ramp(P.CYAN, 0) : ramp(P.WHITE, 0);
    }
  }
  // 雪面闪光
  if (hash2(Math.floor(X), Math.floor(Y), 93) < 0.012) return ramp(P.CYAN, 0);
  const n = vnoise(X / 5.2, Y / 5.2, 91 + c.variant);
  const drift = vnoise(X / 13, Y / 13, 92);
  const v = 0.5 + (n - 0.5) * 0.2 + (drift - 0.5) * 0.34;
  const q = dquant(v, px, py, 3);
  return q === 0 ? ramp(P.WHITE, 0) : ramp(P.PBLUE, q - 1);   // 雪白→青灰阴影
};

const flowerPat: GroundPat = (X, Y, px, py, c) => {
  const base = grassBase(X, Y, px, py, c);
  // 水岸 → 沙滩过渡（同草地）
  const bands: Array<[number, number]> = [
    [c.edge & 1, Y], [c.edge & 4, 16 - Y], [c.edge & 2, 16 - X], [c.edge & 8, X],
  ];
  let r = -1;
  for (const [e, d] of bands) {
    if (!e) continue;
    if (d < 2.2) { r = ramp(P.SAND, 0); break; }
    if (d < 4.6) {
      const t = (4.6 - d) / 2.4 * 0.8;
      const b = (BAYER8[(py & 7) * 8 + (px & 7)] + 0.5) / 64;
      if (b < t) { r = ramp(P.SAND, 1); break; }
    }
  }
  if (r >= 0) return r;
  // 花畦：3×3 小区中心一朵小花
  const fx = Math.floor(X / 3), fy = Math.floor(Y / 3);
  if (hash2(fx, fy, 95) < 0.30 &&
      Math.abs(X - (fx * 3 + 1.5)) < 0.55 && Math.abs(Y - (fy * 3 + 1.5)) < 0.55) {
    const cc = hash2(fx, fy, 96);
    if (cc < 0.28) return ramp(P.RED, 0);
    if (cc < 0.52) return ramp(P.YELLOW, 0);
    if (cc < 0.72) return ramp(P.WHITE, 0);
    if (cc < 0.88) return ramp(P.SAKURA, 0);
    return ramp(P.CYAN, 0);
  }
  return base;
};

const dryPat: GroundPat = (X, Y, px, py, c) => {
  // 水缘泥滩
  const bands: Array<[number, number]> = [
    [c.edge & 1, Y], [c.edge & 4, 16 - Y], [c.edge & 2, 16 - X], [c.edge & 8, X],
  ];
  for (const [e, d] of bands) if (e && d < 1.4) return ramp(P.DIRT, 1);
  // 龟裂纹
  const cr = vnoise(X / 6.5 + 30, Y / 6.5 + 30, 98);
  if (Math.abs(cr - 0.5) < 0.035) return ramp(P.DIRT, 2);
  // 砾石
  if (hash2(Math.floor(X / 2), Math.floor(Y / 2), 99) < 0.05) return ramp(P.SIDE, 2);
  const n = vnoise(X / 4.8, Y / 4.8, 97 + c.variant);
  return ramp(P.DIRT, dquant(0.52 + (n - 0.5) * 0.34, px, py, 3));
};

const swampPat: GroundPat = (X, Y, px, py, c) => {
  // 水缘泥岸
  const bands: Array<[number, number]> = [
    [c.edge & 1, Y], [c.edge & 4, 16 - Y], [c.edge & 2, 16 - X], [c.edge & 8, X],
  ];
  for (const [e, d] of bands) if (e && d < 1.6) return ramp(P.DIRT, 1);
  // 静水洼
  const pool = vnoise(X / 5.4, Y / 5.4, 100 + c.variant);
  if (pool > 0.80) return ramp(P.WATER, 1);
  if (pool > 0.70) {
    const b = (BAYER8[(py & 7) * 8 + (px & 7)] + 0.5) / 64;
    if (b < (pool - 0.70) / 0.10 * 0.8) return ramp(P.WATER, 1);
  }
  // 芦苇（短竖条）
  if (hash2(Math.floor(X), Math.floor(Y), 102) < 0.05 && (Y % 3) < 1.6) {
    return ramp(P.PINE, 0);
  }
  const n = vnoise(X / 4.4, Y / 4.4, 101);
  return ramp(P.GRASS, dquant(0.34 + (n - 0.5) * 0.24, px, py, 4));   // 暗苔藓绿
};

const autumnPat: GroundPat = (X, Y, px, py, c) => {
  // 水岸 → 沙滩过渡（同草地）
  const bands: Array<[number, number]> = [
    [c.edge & 1, Y], [c.edge & 4, 16 - Y], [c.edge & 2, 16 - X], [c.edge & 8, X],
  ];
  for (const [e, d] of bands) {
    if (!e) continue;
    if (d < 2.2) return ramp(P.SAND, 0);
    if (d < 4.6) {
      const t = (4.6 - d) / 2.4 * 0.8;
      const b = (BAYER8[(py & 7) * 8 + (px & 7)] + 0.5) / 64;
      if (b < t) return ramp(P.SAND, 1);
      break;
    }
  }
  // 金褐草底
  const n = vnoise(X / 4.7, Y / 4.7, 103 + c.variant);
  // 落叶斑点
  const lx = Math.floor(X / 2), ly = Math.floor(Y / 2);
  if (hash2(lx, ly, 104) < 0.16 &&
      Math.abs(X - (lx * 2 + 1)) < 0.6 && Math.abs(Y - (ly * 2 + 1)) < 0.6) {
    const cc = hash2(lx, ly, 105);
    if (cc < 0.4) return ramp(P.RFRED, 1);
    if (cc < 0.7) return ramp(P.TAN, 0);
    return ramp(P.BRICK, 0);
  }
  return ramp(P.TAN, dquant(0.5 + (n - 0.5) * 0.3, px, py, 3));
};

// ------------------------------------------------------------
// 特殊地面（多格）
// ------------------------------------------------------------

const parkPat: GroundPat = (X, Y, px, py, c) => {
  // 十字小径 + 角落水塘
  const pathNS = X > 6.2 && X < 9.4;
  const pathEW = Y > 6.2 && Y < 9.4;
  if (c.variant === 1 ? pathEW : pathNS) {
    return (X + Y) % 4 < 0.8 ? ramp(P.SIDE, 2) : ramp(P.SIDE, 1);
  }
  if (c.variant >= 2) {
    // 小水塘（东北角）
    const dx = (X - 12.5) / 4.6, dy = (Y - 3.6) / 3.2;
    const rr = dx * dx + dy * dy;
    if (rr < 1) return rr < 0.72 ? ramp(P.WATER, 1) : ramp(P.WATER, 0);
    if (rr < 1.35) return ramp(P.SAND, 1);
  }
  return grassBase(X, Y, px, py, c);
};

const plazaPat: GroundPat = (X, Y, px, py) => {
  if (X < 1.4 || Y < 1.4 || X > 14.6 || Y > 14.6) return ramp(P.SIDE, 2);
  const chk = (Math.floor(X / 4) + Math.floor(Y / 4)) % 2;
  const b = (BAYER8[(py & 7) * 8 + (px & 7)] + 0.5) / 64;
  if (b < 0.06) return ramp(P.SIDE, 2);
  return ramp(P.SIDE, chk === 0 ? 0 : 1);
};

const schoolPat: GroundPat = (X, Y, px, py, c) => {
  // 2×2：外圈步道环 + 内部草地 + 前院铺装
  if (X < 2.6 || Y < 2.6 || X > 29.4 || Y > 29.4) {
    return (X + Y) % 4 < 0.8 ? ramp(P.SIDE, 2) : ramp(P.SIDE, 1);
  }
  if (Y > 25 && X > 8 && X < 24) {
    return (Math.floor(X / 4) + Math.floor(Y / 4)) % 2 ? ramp(P.SIDE, 0) : ramp(P.SIDE, 1);
  }
  return grassBase(X, Y, px, py, c);
};

const templePat: GroundPat = (X, Y, px, py) => {
  // 2×2：白砂砾 + 耙纹 + 石板参道
  if (Y > 24 && Y < 29.6 && X > 13 && X < 19) {
    return (Math.floor(X / 2) + Math.floor(Y / 2)) % 2 ? ramp(P.SIDE, 0) : ramp(P.SIDE, 1);
  }
  if (X < 1.4 || Y < 1.4 || X > 30.6 || Y > 30.6) return ramp(P.SIDE, 2);
  const rake = (X % 3) < 0.7;
  const b = (BAYER8[(py & 7) * 8 + (px & 7)] + 0.5) / 64;
  if (rake) return ramp(P.SIDE, 2);
  if (b < 0.08) return ramp(P.SIDE, 0);
  return ramp(P.SIDE, 1);
};

const fieldPat: GroundPat = (X, Y, px, py) => {
  // 3×3：外圈跑道 + 草坪条纹 + 边线中圈
  const inX = X > 3.4 && X < 44.6, inY = Y > 3.4 && Y < 44.6;
  if (!(inX && inY)) {
    // 跑道
    return (Math.floor((X + Y) / 3) % 2) ? ramp(P.BRICK, 1) : ramp(P.BRICK, 2);
  }
  const b = (BAYER8[(py & 7) * 8 + (px & 7)] + 0.5) / 64;
  if (Math.abs(X - 4) < 0.8 || Math.abs(X - 44) < 0.8 || Math.abs(Y - 4) < 0.8 || Math.abs(Y - 44) < 0.8) {
    return ramp(P.WHITE, 0);
  }
  const du = X - 24, dv = Y - 24;
  if (Math.abs(du) < 0.8 || Math.abs(dv) < 0.8) return ramp(P.WHITE, 0);
  if (Math.abs(Math.hypot(du, dv) - 7) < 0.8) return ramp(P.WHITE, 0);
  const band = Math.floor(((X + Y) / 2) / 5) % 2;
  if (b < 0.05) return ramp(P.GRASS, 2);
  return ramp(P.GRASS, band === 0 ? 1 : 2);
};

// ------------------------------------------------------------
// 精灵生成 + 缓存
// ------------------------------------------------------------

const PATS: Record<GroundKind, { pat: GroundPat; w: number; h: number } | null> = {
  grass: { pat: grassPat, w: 1, h: 1 },
  water: { pat: waterPat, w: 1, h: 1 },
  sand: { pat: sandPat, w: 1, h: 1 },
  road: { pat: roadPat, w: 1, h: 1 },
  park: { pat: parkPat, w: 1, h: 1 },
  plaza: { pat: plazaPat, w: 1, h: 1 },
  school: { pat: schoolPat, w: 2, h: 2 },
  temple: { pat: templePat, w: 2, h: 2 },
  field: { pat: fieldPat, w: 3, h: 3 },
  farm: { pat: farmPat, w: 1, h: 1 },
  rock: { pat: rockPat, w: 1, h: 1 },
  parking: { pat: parkingPat, w: 1, h: 1 },
  snow: { pat: snowPat, w: 1, h: 1 },
  flower: { pat: flowerPat, w: 1, h: 1 },
  dry: { pat: dryPat, w: 1, h: 1 },
  swamp: { pat: swampPat, w: 1, h: 1 },
  autumn: { pat: autumnPat, w: 1, h: 1 },
};

const cache = new Map<number, Sprite>();

export type GroundOpts = {
  variant?: number;
  edge?: number;    // 地形过渡掩码
  road?: number;    // 道路连接掩码
  frame?: number;   // 水面动画帧 0/1
};

/** 生成（或取缓存）地面精灵 */
export function getGround(kind: GroundKind, o: GroundOpts = {}): Sprite {
  const variant = o.variant ?? 0;
  const edge = o.edge ?? 0;
  const road = o.road ?? 0;
  const frame = o.frame ?? 0;
  const key = (KIND_IDX[kind] << 18) | (edge << 14) | (road << 10) | (variant << 6) | frame;
  const hit = cache.get(key);
  if (hit) return hit;

  const def = PATS[kind]!;
  const tw = def.w, th = def.h;
  const W = 16 * (tw + th), H = 8 * (tw + th);
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d')!;
  const img = ctx.createImageData(W, H);
  const u32 = new Uint32Array(img.data.buffer);
  const c: GroundCtx = { variant, edge, road, frame };

  for (let py = 0; py < H; py++) {
    for (let px = 0; px < W; px++) {
      const sx = px - 16 * th;
      const X = sx / 2 + py;
      const Y = py - sx / 2;
      if (X < 0 || X >= 16 * tw || Y < 0 || Y >= 16 * th) continue;
      const idx = def.pat(X, Y, px, py, c);
      u32[py * W + px] = LUT[idx] ?? 0;
    }
  }
  ctx.putImageData(img, 0, 0);
  const sp: Sprite = { cv, ox: -16 * th, oy: 0, w: W, h: H };
  cache.set(key, sp);
  return sp;
}

/** 清空地面缓存（切换色板/尺寸时用，一般不需要） */
export function clearGroundCache(): void {
  cache.clear();
}
