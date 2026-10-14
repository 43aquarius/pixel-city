// ============================================================
// b_ind.ts — 工业建筑：工厂(2×2，锯齿屋顶+烟囱) / 仓库(2×2) / 储油罐(1×1)
// ============================================================

import { box, gableRoof, prism, buildModel, type Face, type V3 } from './geo';
import {
  pWall, pCorrugated, pShutter, pFlatRoof, pSawTooth, pWindows, pTankShell, pBands,
} from './patterns';
import { RAMP } from './palette';
import { mulberry32 } from './rng';
import { chimney, acUnit, type BuildResult } from './b_util';

const P = RAMP;

/** 工厂（2×2）：主厂房锯齿屋顶 + 侧翼 + 大烟囱（冒烟动画） */
export function genFactory(seed: number): BuildResult {
  const r = mulberry32(seed);
  const wall = r() < 0.5 ? P.TAN : P.BRICK;
  const faces: Face[] = [];
  const hMain = 9;
  // 主厂房（北半区）
  const mx0 = 2.5, my0 = 2.5, mx1 = 29.5, my1 = 19;
  box(faces, mx0, my0, mx1, my1, 0, hMain, {
    right: pCorrugated(wall),
    left: pWindows(wall, { seed, lit: 0.05, floorH: 9, winW: 2, winH: 3, gapX: 5, base: 0 }),
  });
  // 锯齿屋顶（3 齿，脊沿 X）
  const teeth = 3;
  const span = (my1 - my0) / teeth;
  for (let i = 0; i < teeth; i++) {
    const y0 = my0 + i * span, y1 = y0 + span;
    gableRoof(faces, mx0, y0, mx1, y1, hMain - 0.4, hMain + 3.8, 'x', {
      front: pSawTooth(true),   // 朝相机坡面带天窗
      back: pSawTooth(false),
    });
  }
  // 侧翼仓库（南墙外贴）
  box(faces, 3.5, 21.5, 15, 28.5, 0, 7, {
    right: pCorrugated(P.RFGRAY),
    left: pCorrugated(P.RFGRAY),
    top: pFlatRoof(P.ASPH, 4),
  });
  // 卷帘门
  box(faces, 17, 21.5, 24, 22.2, 0, 5.5, {
    right: pShutter(), left: pShutter(), top: pWall(P.SIDE),
  });
  box(faces, 24, 21.5, 28.5, 28.5, 0, 7, {
    right: pCorrugated(P.RFGRAY), left: pCorrugated(P.RFGRAY), top: pFlatRoof(P.ASPH, 5),
  });
  // 大烟囱（东北角）
  const chx = 26.2, chy = 5.5;
  prism(faces, chx, chy, 2.6, 0, hMain + 12, {
    side: (u, v, px, py) => pBands(P.BRICK, 6)(u, v, px, py),
    top: () => ({ r: P.OUTLINE, l: 0 }),
  }, 8);
  // 管道小罐
  prism(faces, 8.5, 24.5, 2.4, 7, 12.5, {
    side: (u, v, px, py) => pTankShell()(u, v, px, py),
    top: pFlatRoof(P.RFTEAL, 3),
  }, 8);
  return {
    model: buildModel(faces, 32, 32),
    smokeAt: [chx, chy, hMain + 12] as V3,
  };
}

/** 仓库（2×2）：波纹墙 + 大卷帘门 + 屋顶通风器列 */
export function genWarehouse(seed: number): BuildResult {
  const r = mulberry32(seed);
  const ramp = r() < 0.4 ? P.TAN : (r() < 0.7 ? P.RFGRAY : P.METAL);
  const faces: Face[] = [];
  const h = 10;
  box(faces, 2.5, 2.5, 29.5, 29.5, 0, h, {
    right: pCorrugated(ramp),
    left: pCorrugated(ramp),
  });
  // 平屋顶（微内缩形成檐口）
  box(faces, 3.2, 3.2, 28.8, 28.8, h, h + 1.6, {
    top: pFlatRoof(P.ASPH, seed & 7), right: pWall(P.SIDE), left: pWall(P.SIDE),
  });
  // 大卷帘门（+Y 面两个）
  for (const dx of [6, 18]) {
    box(faces, dx, 29.5, dx + 7, 30.6, 0, 6.5, {
      right: pShutter(), left: pShutter(), top: pWall(P.SIDE),
    });
  }
  // 屋顶通风器
  for (let i = 0; i < 3; i++) {
    acUnit(faces, 8 + i * 7, 12, h + 1.6, 3.2);
  }
  // 侧墙高窗
  return { model: buildModel(faces, 32, 32) };
}

/** 储油罐区（1×1）：双罐 + 连接管道 */
export function genTankfarm(seed: number): BuildResult {
  const r = mulberry32(seed);
  const faces: Face[] = [];
  const big = r() < 0.5;
  // 主罐
  prism(faces, 6.2, 6.2, big ? 5.2 : 4.6, 0, big ? 8.5 : 10, {
    side: (u, v, px, py) => pTankShell()(u, v, px, py),
    top: pFlatRoof(P.RFTEAL, 2),
  }, 8);
  // 副罐
  prism(faces, 12.2, 11.8, 2.6, 0, 5.5, {
    side: (u, v, px, py) => pTankShell()(u, v, px, py),
    top: pFlatRoof(P.METAL, 3),
  }, 8);
  // 管道
  box(faces, 6.2, 8.6, 12.2, 9.6, 2.2, 3.1, {
    right: pWall(P.METAL), left: pWall(P.METAL), top: pWall(P.METAL),
  });
  // 防撞围堰
  box(faces, 1.2, 1.2, 15, 2.2, 0, 1.2, {
    right: pWall(P.SIDE), left: pWall(P.SIDE), top: pWall(P.SIDE),
  });
  box(faces, 1.2, 1.2, 2.2, 15, 0, 1.2, {
    right: pWall(P.SIDE), left: pWall(P.SIDE), top: pWall(P.SIDE),
  });
  return { model: buildModel(faces, 16, 16) };
}
