// ============================================================
// b_res.ts — 住宅建筑：独栋小宅 / 联排住宅 / 公寓楼
// 全部程序化建模：参数（墙色/屋顶色/层数/朝向/烟囱…）由种子决定。
// ============================================================

import { box, gableRoof, buildModel, type Face } from './geo';
import {
  pWall, pWindows, pShingle, pFlatRoof, pBrick,
} from './patterns';
import { RAMP } from './palette';
import { mulberry32 } from './rng';
import { roofDeck, chimney, waterTank, acUnit, type BuildResult } from './b_util';

const P = RAMP;

const WALLS = [P.CREAM, P.TAN, P.BRICK, P.PBLUE] as const;
const ROOFS = [P.RFRED, P.RFSLATE, P.RFGRAY] as const;

/** 独栋小宅（1×1）：1-2 层 + 双坡顶 + 烟囱 */
export function genHouse(seed: number): BuildResult {
  const r = mulberry32(seed);
  const wall = WALLS[Math.floor(r() * WALLS.length)];
  const roof = ROOFS[Math.floor(r() * ROOFS.length)];
  const floors = r() < 0.42 ? 2 : 1;
  const h = 2 + floors * 6.6;
  const inset = 2.4 - r() * 0.7;
  const x0 = inset + r() * 0.6, y0 = inset + r() * 0.6;
  const x1 = 16 - inset - r() * 0.6, y1 = 16 - inset - r() * 0.6;
  const axis = r() < 0.5 ? 'x' : 'y';
  const faces: Face[] = [];

  box(faces, x0, y0, x1, y1, 0, h, {
    right: pWindows(wall, { seed, door: false, lit: 0.1 }),
    left: pWindows(wall, { seed: seed ^ 7, door: true, lit: 0.1 }),
  });
  const ov = 1.5;
  const rise = 6 + r() * 1.6;
  gableRoof(faces, x0 - ov, y0 - ov, x1 + ov, y1 + ov, h - 0.6, h - 0.6 + rise, axis, {
    front: pShingle(roof),
    back: pShingle(roof),
    endX: pWall(wall),
    endY: pWall(wall),
  });
  let smokeAt: import('./geo').V3 | undefined;
  if (r() < 0.4) {
    const cx = x0 + 2.2, cy = y0 + 2.2;
    chimney(faces, cx, cy, h - 1, h + rise - 1.5, 2.2);
    smokeAt = [cx + 1.1, cy + 1.1, h + rise - 1.5];
  }
  return { model: buildModel(faces, 16, 16), smokeAt };
}

/** 联排住宅（1×1）：3 层 + 女儿墙平屋顶 / 双坡顶 + 挑阳台 */
export function genTownhouse(seed: number): BuildResult {
  const r = mulberry32(seed);
  const wall = WALLS[Math.floor(r() * WALLS.length)];
  const floors = 3;
  const h = 2 + floors * 6.8;
  const x0 = 2.1, y0 = 2.1, x1 = 13.9, y1 = 13.9;
  const faces: Face[] = [];
  const winL = pWindows(wall, { seed, door: true, lit: 0.16, floorH: 6.8 });
  const winR = pWindows(wall, { seed: seed ^ 3, door: false, lit: 0.16, floorH: 6.8 });
  box(faces, x0, y0, x1, y1, 0, h, { right: winR, left: winL });

  if (r() < 0.55) {
    // 平屋顶 + 女儿墙
    roofDeck(faces, x0, y0, x1, y1, h, r() < 0.5 ? P.ASPH : P.RFGRAY, pWall(wall));
    acUnit(faces, x1 - 4.4, y0 + 2, h + 3.2, 2.6);
  } else {
    const roof = ROOFS[Math.floor(r() * ROOFS.length)];
    gableRoof(faces, x0 - 1.2, y0 - 1.2, x1 + 1.2, y1 + 1.2, h - 0.5, h + 5.6, 'x', {
      front: pShingle(roof), back: pShingle(roof), endX: pWall(wall), endY: pWall(wall),
    });
  }
  // 挑阳台（+Y 侧，每层）
  for (let f = 1; f <= floors; f++) {
    const z = f * 6.8 - 4.6;
    box(faces, x0 + 1.6, y1, x1 - 1.6, y1 + 1.7, z, z + 1.5, {
      top: pFlatRoof(P.SIDE, f), right: pWall(P.SIDE), left: pWall(P.SIDE),
    });
  }
  return { model: buildModel(faces, 16, 16) };
}

/** 公寓楼（1×1）：4-7 层平屋顶 + 楼梯间小屋 + 水箱 */
export function genApartment(seed: number): BuildResult {
  const r = mulberry32(seed);
  const wall = WALLS[Math.floor(r() * WALLS.length)];
  const floors = 4 + Math.floor(r() * 4);   // 4..7
  const fh = 6.4;
  const h = 2 + floors * fh;
  const x0 = 2.0, y0 = 2.0, x1 = 14.0, y1 = 14.0;
  const faces: Face[] = [];
  box(faces, x0, y0, x1, y1, 0, h, {
    right: pWindows(wall, { seed, lit: 0.18, floorH: fh, base: 4.5, gapX: 3.6 }),
    left: pWindows(wall, { seed: seed ^ 11, door: true, lit: 0.18, floorH: fh, base: 4.5, gapX: 3.6 }),
  });
  // 底层门廊雨棚
  box(faces, x0 + 3, y1, x0 + 8, y1 + 2, 4.5, 5.7, {
    top: pFlatRoof(P.RFGRAY, 2), right: pWall(P.RFGRAY), left: pWall(P.RFGRAY),
  });
  roofDeck(faces, x0, y0, x1, y1, h, P.ASPH, pWall(wall));
  // 楼梯间小屋
  box(faces, x0 + 2, y0 + 2, x0 + 7, y0 + 7, h + 3.2, h + 3.2 + 4.4, {
    right: pBrick(wall), left: pBrick(wall), top: pFlatRoof(P.RFGRAY, 6),
  });
  // 水箱
  waterTank(faces, x1 - 3.2, y1 - 3.2, h + 3.2, h + 7);
  // 阳台隔板（右侧每层）
  for (let f = 1; f < floors; f++) {
    const z = f * fh - 4.2;
    if (f % 2 === 0) continue;
    box(faces, x1, y0 + 2, x1 + 1.6, y1 - 2, z, z + 1.4, {
      top: pFlatRoof(P.SIDE, f), right: pWall(P.SIDE), left: pWall(P.SIDE),
    });
  }
  return { model: buildModel(faces, 16, 16) };
}
