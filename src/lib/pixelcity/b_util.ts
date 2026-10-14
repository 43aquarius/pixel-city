// ============================================================
// b_util.ts — 建模共享构件：女儿墙平屋顶 / 烟囱 / 水箱 /
//             空调机组 / 天线 / 烟雾动画帧 / 旗帜
// ============================================================

import { box, prism, makeFace, buildModel, type Face, type Model, type V3 } from './geo';
import { pFlatRoof, pWall, pTankShell, pBands, cell, type PatFn } from './patterns';
import { RAMP, bayer } from './palette';

const P = RAMP;

/** 带女儿墙的平屋顶：外墙升至 hWall+2，屋面甲板内缩 1px 铺在墙顶 */
export function roofDeck(
  faces: Face[],
  x0: number, y0: number, x1: number, y1: number, hWall: number,
  deckRamp = P.ASPH, ringPat?: PatFn,
): void {
  box(faces, x0, y0, x1, y1, hWall, hWall + 2, {
    top: ringPat ?? pWall(P.SIDE),
  });
  box(faces, x0 + 1, y0 + 1, x1 - 1, y1 - 1, hWall + 2, hWall + 3.2, {
    top: pFlatRoof(deckRamp, 3),
    right: pWall(P.SIDE),
    left: pWall(P.SIDE),
  });
}

/** 烟囱（含顶部黑洞口） */
export function chimney(
  faces: Face[], x: number, y: number, z0: number, z1: number,
  size = 2.4,
): void {
  box(faces, x, y, x + size, y + size, z0, z1, {
    right: pBands(P.BRICK, 5),
    left: pBands(P.BRICK, 5),
    top: () => cell(P.OUTLINE, 0),
  });
}

/** 屋顶水箱 */
export function waterTank(faces: Face[], cx: number, cy: number, z0: number, z1: number): void {
  prism(faces, cx, cy, 2.3, z0, z1, {
    side: (u, v, px, py) => pTankShell()(u, v, px, py),
    top: pFlatRoof(P.METAL, 4),
  }, 8);
}

/** 屋顶空调机组 / 通风口 */
export function acUnit(faces: Face[], x: number, y: number, z: number, s = 3): void {
  box(faces, x, y, x + s, y + s, z, z + 1.8, {
    top: pFlatRoof(P.METAL, 9),
    right: pWall(P.METAL),
    left: pWall(P.METAL),
  });
}

/** 细天线杆 */
export function antenna(faces: Face[], x: number, y: number, z0: number, z1: number): void {
  box(faces, x, y, x + 1, y + 1, z0, z1, {
    right: pWall(P.METAL),
    left: pWall(P.METAL),
    top: () => cell(P.RED, 0),
  });
}

/** 旗杆 + 小旗 */
export function flagPole(faces: Face[], x: number, y: number, h: number, flagRamp = P.RED): void {
  box(faces, x, y, x + 0.8, y + 0.8, 0, h, {
    right: pWall(P.METAL),
    left: pWall(P.METAL),
    top: () => cell(P.WHITE, 0),
  });
  // 旗面（+Y 侧薄板）
  box(faces, x + 0.2, y + 0.8, x + 4.2, y + 1.6, h - 3.5, h - 1.2, {
    right: pBands(flagRamp, 64),
    left: pBands(flagRamp, 64),
    top: () => cell(P.WHITE, 0),
  });
}

export type BuildResult = {
  model: Model;
  smokeAt?: V3;   // 烟囱口（局部世界坐标）
  blinkAt?: V3;   // 闪光灯位置
};

/** 烟雾动画帧：上升扩散、密度递减的抖动烟团（水平圆盘面，含透明像素） */
export function smokeFrames(): Model[] {
  const cfg = [
    { h: 0.0, r: 1.5, dens: 0.6 },
    { h: 3.5, r: 2.2, dens: 0.35 },
    { h: 7.5, r: 2.9, dens: 0.16 },
  ];
  return cfg.map(({ h, r, dens }) => {
    const pat: PatFn = (u, v, px, py) => {
      const d = Math.hypot(u - r, v - r) / r;
      if (d > 1) return cell(-1, 0);            // 透明
      const t = dens * (1 - d * 0.9);
      return bayer(px, py, t) ? cell(P.METAL, 0) : cell(-1, 0);
    };
    const faces: Face[] = [];
    faces.push(makeFace(
      [[-r, -r, h], [r, -r, h], [r, r, h], [-r, r, h]],
      [0, 0, 1], pat, [-r, -r, h], [1, 0, 0], [0, 1, 0],
    ));
    return buildModel(faces, 0, 0);
  });
}

/** 无轮廓无阴影渲染选项（烟雾等特效用） */
export const NO_EFFECTS = { outline: false, shadow: false } as const;
