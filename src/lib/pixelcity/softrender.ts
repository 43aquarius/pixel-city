// ============================================================
// softrender.ts — 等距正交软件光栅化器（离线预渲染管线核心）
//
// 流程：面剔除(n·D) → 质心深度排序(画家算法) → 扫描线填充，
// 每个像素反投影回 3D 平面求 (u,v) → 图案函数 → 色板索引 +
// Bayer 有序抖动 → 精灵缓冲；最后叠加 1px 轮廓与足印接触阴影。
// 输出透明背景精灵（HTMLCanvasElement + 锚点偏移）。
// ============================================================

import { RAMPS, RAMP, LUT, EMPTY, DARK, bayer } from './palette';
import type { Model, Face } from './geo';
import type { PatFn, PatCell } from './patterns';

export type Sprite = {
  cv: HTMLCanvasElement;
  ox: number; oy: number;  // 相对格锚点 ((tx−ty)*16, (tx+ty)*8) 的 blit 偏移
  w: number; h: number;
};

/** 面是否朝向相机：n·(1,1,1) > ε（D 为视轴） */
function isVisible(f: Face): boolean {
  return f.nx + f.ny + f.nz > 0.02;
}

const clampL = (l: number, len: number): number => (l < 0 ? 0 : l >= len ? len - 1 : l);

/** 采样一个像素的最终色板索引；r<0 表示该像素透明（跳过） */
function sampleCell(
  pat: PatFn, u: number, v: number, px: number, py: number, lvl: number,
): number {
  const c = pat(u, v, px, py);
  if (c.r < 0) return EMPTY;
  const ramp = RAMPS[c.r] ?? RAMPS[0];
  const l1 = clampL(c.l + lvl, ramp.length);
  if (c.dl !== undefined) {
    const l2 = clampL(c.dl + lvl, ramp.length);
    return bayer(px, py, c.t ?? 0.5) ? ramp[l2] : ramp[l1];
  }
  return ramp[l1];
}

export type RenderOpts = {
  outline?: boolean;   // 1px 暗色轮廓（默认开）
  shadow?: boolean;    // 足印接触阴影（默认开）
  shadowT?: number;    // 阴影密度
  night?: boolean;     // 夜光模式：只保留发光像素（窗/灯/霓虹），
                       // 轮廓与阴影自动关闭；与日间精灵同尺寸同锚点，
                       // 夜间以 lighter 叠加即得点亮的窗户效果
};

/** 夜光映射：发光 ramp → 夜间发光色 ramp；其余 → 透明 */
function nightPat(pat: PatFn): PatFn {
  return (u, v, px, py) => {
    const c: PatCell = pat(u, v, px, py);
    if (c.r < 0) return c;
    let g = -1;
    if (c.r === RAMP.GLASS) g = RAMP.LAMP;       // 玻璃窗 → 暖黄光
    else if (c.r === RAMP.YELLOW) g = RAMP.LAMP;  // 已亮灯 → 暖黄光
    else if (c.r === RAMP.NEONR) g = RAMP.RED;    // 霓虹红 → 红光
    else if (c.r === RAMP.NEONC) g = RAMP.CYAN;   // 霓虹青 → 青光
    else return { r: -1, l: 0 };                 // 夜色中熄灭
    return { r: g, l: c.l, dl: c.dl, t: c.t };
  };
}

/** 把一个 Model 渲染为透明背景精灵 */
export function renderModel(m: Model, opts: RenderOpts = {}): Sprite {
  const night = opts.night === true;
  const outline = opts.outline !== false && !night;
  const shadow = opts.shadow !== false && !night;
  const shadowT = opts.shadowT ?? 0.30;

  const faces = m.faces.filter(isVisible).sort((a, b) => a.depth - b.depth);

  // ---- 包围盒（投影空间，proj(0,0,0)=(0,0)）----
  let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity;
  for (const f of faces) {
    for (const p of f.pts) {
      if (p[0] < bx0) bx0 = p[0];
      if (p[0] > bx1) bx1 = p[0];
      if (p[1] < by0) by0 = p[1];
      if (p[1] > by1) by1 = p[1];
    }
  }
  if (!faces.length) { bx0 = bx1 = by0 = by1 = 0; }
  const pad = outline ? 2 : 1;
  bx0 = Math.floor(bx0 - pad); by0 = Math.floor(by0 - pad);
  bx1 = Math.ceil(bx1 + pad); by1 = Math.ceil(by1 + pad);
  const w = Math.max(1, bx1 - bx0), h = Math.max(1, by1 - by0);

  const buf = new Uint8Array(w * h).fill(EMPTY);

  // ---- 逐面扫描线光栅化 ----
  for (const f of faces) {
    const den = f.nx + f.ny + f.nz;
    if (Math.abs(den) < 0.02) continue;  // 几乎垂直视线
    const { nx, ny, nz, d, o, tu, tv, lvl } = f;
    const pat = night ? nightPat(f.pat) : f.pat;

    const y0 = Math.max(0, Math.floor(f.y0 - by0));
    const y1 = Math.min(h - 1, Math.ceil(f.y1 - by0));
    const pts = f.pts;
    const n = pts.length;

    for (let iy = y0; iy <= y1; iy++) {
      const yc = by0 + iy + 0.5;
      // 求扫描线与凸多边形边的交点范围
      let xmin = Infinity, xmax = -Infinity;
      for (let i = 0; i < n; i++) {
        const a = pts[i], b = pts[(i + 1) % n];
        const ay = a[1], by = b[1];
        if ((ay <= yc && by > yc) || (by <= yc && ay > yc)) {
          const t = (yc - ay) / (by - ay);
          const x = a[0] + t * (b[0] - a[0]);
          if (x < xmin) xmin = x;
          if (x > xmax) xmax = x;
        }
      }
      if (xmin > xmax) continue;
      let ix0 = Math.ceil(xmin - 0.55 - 0.5 - bx0);
      let ix1 = Math.floor(xmax + 0.55 - 0.5 - bx0);
      if (ix0 < 0) ix0 = 0;
      if (ix1 > w - 1) ix1 = w - 1;
      for (let ix = ix0; ix <= ix1; ix++) {
        const sx = bx0 + ix + 0.5;
        const sy = yc;
        // 反投影到平面
        const Z = (d - sx * (nx - ny) / 2 - sy * (nx + ny)) / den;
        const X = sx / 2 + sy + Z;
        const Y = X - sx;
        const rx = X - o[0], ry = Y - o[1], rz = Z - o[2];
        const u = rx * tu[0] + ry * tu[1] + rz * tu[2];
        const v = rx * tv[0] + ry * tv[1] + rz * tv[2];
        const idx = sampleCell(pat, u, v, ix, iy, lvl);
        buf[iy * w + ix] = idx;
      }
    }
  }

  // ---- 1px 轮廓（色板最暗色）----
  if (outline) {
    const src = buf.slice();
    for (let iy = 0; iy < h; iy++) {
      for (let ix = 0; ix < w; ix++) {
        const i = iy * w + ix;
        if (src[i] !== EMPTY) continue;
        const l = ix > 0 ? src[i - 1] : EMPTY;
        const r = ix < w - 1 ? src[i + 1] : EMPTY;
        const t = iy > 0 ? src[i - w] : EMPTY;
        const b = iy < h - 1 ? src[i + w] : EMPTY;
        if ((l !== EMPTY && l !== DARK) || (r !== EMPTY && r !== DARK) ||
            (t !== EMPTY && t !== DARK) || (b !== EMPTY && b !== DARK)) {
          buf[i] = DARK;
        }
      }
    }
  }

  // ---- 足印接触阴影（有序抖动暗点）----
  if (shadow && m.fw > 0 && m.fh > 0) {
    const inset = 1.2;
    for (let iy = 0; iy < h; iy++) {
      for (let ix = 0; ix < w; ix++) {
        const i = iy * w + ix;
        if (buf[i] !== EMPTY) continue;
        const sx = bx0 + ix + 0.5, sy = by0 + iy + 0.5;
        // 反投影到地面 z=0
        const X = sx / 2 + sy, Y = X - sx;
        if (X > inset && X < m.fw - inset && Y > inset && Y < m.fh - inset) {
          if (bayer(ix, iy, shadowT)) buf[i] = DARK;
        }
      }
    }
  }

  // ---- 转为 Canvas ----
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const ctx = cv.getContext('2d')!;
  const img = ctx.createImageData(w, h);
  const u32 = new Uint32Array(img.data.buffer);
  for (let i = 0; i < buf.length; i++) {
    const v = buf[i];
    u32[i] = v === EMPTY ? 0 : LUT[v];
  }
  ctx.putImageData(img, 0, 0);
  return { cv, ox: bx0, oy: by0, w, h };
}

/** 生成 50% 棋盘遮罩版精灵（放置幽灵预览用），缓存于精灵自身 */
export function ghostSprite(s: Sprite): HTMLCanvasElement {
  const cache = (s as Sprite & { _ghost?: HTMLCanvasElement })._ghost;
  if (cache) return cache;
  const cv = document.createElement('canvas');
  cv.width = s.w; cv.height = s.h;
  const ctx = cv.getContext('2d')!;
  ctx.drawImage(s.cv, 0, 0);
  // 挖掉棋盘格一半像素 → 半透明点阵幽灵
  const img = ctx.getImageData(0, 0, s.w, s.h);
  const u32 = new Uint32Array(img.data.buffer);
  for (let y = 0; y < s.h; y++) {
    for (let x = 0; x < s.w; x++) {
      if (((x + y) & 1) === 0) u32[y * s.w + x] = 0;
    }
  }
  ctx.putImageData(img, 0, 0);
  (s as Sprite & { _ghost?: HTMLCanvasElement })._ghost = cv;
  return cv;
}

/** 精灵缩略图（目录面板，nearest 缩放） */
export function thumbSprite(s: Sprite, size: number): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = size; cv.height = size;
  const ctx = cv.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  const scale = Math.min(1, Math.floor(Math.min(size / s.w, size / s.h) * 2) / 2) || 0.5;
  const dw = Math.round(s.w * scale), dh = Math.round(s.h * scale);
  const oy = size - dh - Math.round(dh * 0.1); // 底部对齐
  ctx.drawImage(s.cv, Math.round((size - dw) / 2), Math.max(0, oy), dw, dh);
  return cv;
}
