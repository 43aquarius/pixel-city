// ============================================================
// b_com.ts — 商业建筑：沿街商铺 / 写字楼 / 摩天大楼(2×2)
// ============================================================

import { box, pyramid, buildModel, type Face, type V3 } from './geo';
import {
  pWall, pWindows, pGlassCurtain, pFlatRoof, pAwning, pSign, pShingle,
} from './patterns';
import { RAMP } from './palette';
import { mulberry32 } from './rng';
import { roofDeck, acUnit, antenna, type BuildResult } from './b_util';

const P = RAMP;
const ACCENTS = [P.RED, P.YELLOW, P.CYAN, P.RFTEAL] as const;

/** 沿街商铺（1×1）：底层大玻璃橱窗 + 条纹遮阳棚 + 招牌 */
export function genShop(seed: number): BuildResult {
  const r = mulberry32(seed);
  const accent = ACCENTS[Math.floor(r() * ACCENTS.length)];
  const wall = r() < 0.5 ? P.CREAM : P.TAN;
  const floors = r() < 0.5 ? 2 : 1;
  const h = 2 + 5.2 + (floors === 2 ? 6.4 : 0);
  const x0 = 1.8, y0 = 1.6, x1 = 14.2, y1 = 14.4;
  const faces: Face[] = [];
  box(faces, x0, y0, x1, y1, 0, h, {
    right: pWindows(wall, { seed, lit: 0.05, gapX: 4.5, door: false }),
    left: pWindows(wall, { seed: seed ^ 5, lit: 0.05, gapX: 4.5, door: true, winW: 3, winH: 3 }),
  });
  // 遮阳棚（+Y 临街面外挑）
  box(faces, x0 + 1.2, y1, x1 - 1.2, y1 + 2.2, 5.0, 6.6, {
    top: pAwning(accent), right: pAwning(accent), left: pAwning(accent),
  });
  // 招牌（屋顶前沿）
  const sh = 3;
  box(faces, x0 + 1.2, y1 - 2.4, x1 - 1.2, y1 - 0.4, h, h + sh, {
    right: pSign(accent, seed), left: pSign(accent, seed + 1),
    top: pFlatRoof(P.RFGRAY, 8),
  });
  if (floors === 2) {
    // 二层小窗带
    box(faces, x0 + 4.5, y0 + 4.5, x1 - 4.5, y1 - 4.5, h + sh, h + sh + 3.6, {
      right: pWall(wall), left: pWall(wall), top: pFlatRoof(P.RFSLATE, 3),
    });
  } else {
    acUnit(faces, x0 + 2, y0 + 2, h, 2.8);
  }
  return { model: buildModel(faces, 16, 16) };
}

/** 写字楼（1×1）：6-11 层玻璃幕墙 + 退台 */
export function genOffice(seed: number): BuildResult {
  const r = mulberry32(seed);
  const floors = 6 + Math.floor(r() * 6);   // 6..11
  const fh = 6.6;
  const glass = r() < 0.75 ? P.GLASS : P.PBLUE;
  const faces: Face[] = [];
  const tiers = floors > 8 ? 3 : 2;
  const f1 = Math.round(floors * (tiers === 3 ? 0.45 : 0.6));
  const f2 = tiers === 3 ? Math.round(floors * 0.8) : floors;
  const h1 = 2 + f1 * fh, h2 = 2 + f2 * fh, h3 = 2 + floors * fh;
  // 底层裙房
  box(faces, 1.6, 1.6, 14.4, 14.4, 0, h1, {
    right: pGlassCurtain(seed, P.GLASS),
    left: pGlassCurtain(seed + 1, P.GLASS),
    top: pFlatRoof(P.RFGRAY, 1),
  });
  // 中段
  box(faces, 3.2, 3.2, 12.8, 12.8, h1, h2, {
    right: pGlassCurtain(seed + 2, glass),
    left: pGlassCurtain(seed + 3, glass),
    top: pFlatRoof(P.RFGRAY, 2),
  });
  // 顶段
  if (tiers === 3) {
    box(faces, 5.2, 5.2, 10.8, 10.8, h2, h3, {
      right: pGlassCurtain(seed + 4, glass),
      left: pGlassCurtain(seed + 5, glass),
      top: pFlatRoof(P.METAL, 5),
    });
  }
  // 顶部机房 + 天线
  box(faces, 6.6, 6.6, 9.4, 9.4, h3, h3 + 2.6, {
    right: pWall(P.METAL), left: pWall(P.METAL), top: pFlatRoof(P.METAL, 7),
  });
  let blinkAt: V3 | undefined;
  if (r() < 0.5) {
    antenna(faces, 7.4, 7.4, h3 + 2.6, h3 + 2.6 + 7);
    blinkAt = [7.9, 7.9, h3 + 2.6 + 7];
  }
  return { model: buildModel(faces, 16, 16), blinkAt };
}

/** 摩天大楼（2×2）：12-18 层，三段退台 + 塔冠 + 闪烁航空灯 */
export function genTower(seed: number): BuildResult {
  const r = mulberry32(seed);
  const floors = 12 + Math.floor(r() * 7);  // 12..18
  const fh = 6.8;
  const glass = r() < 0.6 ? P.GLASS : P.PBLUE;
  const faces: Face[] = [];
  const h1 = 2 + Math.round(floors * 0.42) * fh;
  const h2 = 2 + Math.round(floors * 0.75) * fh;
  const h3 = 2 + floors * fh;
  // 三段
  box(faces, 3.5, 3.5, 28.5, 28.5, 0, h1, {
    right: pGlassCurtain(seed, P.GLASS),
    left: pGlassCurtain(seed + 1, P.GLASS),
    top: pFlatRoof(P.RFGRAY, 1),
  });
  box(faces, 6.5, 6.5, 25.5, 25.5, h1, h2, {
    right: pGlassCurtain(seed + 2, glass),
    left: pGlassCurtain(seed + 3, glass),
    top: pFlatRoof(P.RFGRAY, 2),
  });
  box(faces, 10, 10, 22, 22, h2, h3, {
    right: pGlassCurtain(seed + 4, glass),
    left: pGlassCurtain(seed + 5, glass),
    top: pFlatRoof(P.METAL, 5),
  });
  // 塔冠
  if (r() < 0.5) {
    pyramid(faces, 12, 12, 20, 20, h3, h3 + 7, pShingle(P.RFSLATE));
    antenna(faces, 15.5, 15.5, h3 + 7, h3 + 13);
    return { model: buildModel(faces, 32, 32), blinkAt: [16, 16, h3 + 13] };
  }
  box(faces, 13, 13, 19, 19, h3, h3 + 4.5, {
    right: pWall(P.METAL), left: pWall(P.METAL), top: pFlatRoof(P.METAL, 6),
  });
  antenna(faces, 15.5, 15.5, h3 + 4.5, h3 + 12);
  return { model: buildModel(faces, 32, 32), blinkAt: [16, 16, h3 + 12] };
}
