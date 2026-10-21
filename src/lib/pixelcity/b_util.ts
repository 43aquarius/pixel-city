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

/** 烟囱 v2：砖身 + 混凝土顶盖板 + 陶土排烟口（顶部黑洞） */
export function chimney(
  faces: Face[], x: number, y: number, z0: number, z1: number,
  size = 2.4,
): void {
  box(faces, x, y, x + size, y + size, z0, z1, {
    right: pBands(P.BRICK, 5),
    left: pBands(P.BRICK, 5),
  });
  // 混凝土顶盖板（略外挑）
  box(faces, x - 0.3, y - 0.3, x + size + 0.3, y + size + 0.3, z1, z1 + 0.7, {
    top: () => cell(P.OUTLINE, 0),
    right: pWall(P.SIDE),
    left: pWall(P.SIDE),
  });
  // 陶土排烟口
  box(faces, x + size * 0.32, y + size * 0.32, x + size * 0.68, y + size * 0.68, z1 + 0.7, z1 + 1.5, {
    right: pWall(P.TAN),
    left: pWall(P.TAN),
    top: () => cell(P.OUTLINE, 0),
  });
}

/** 屋顶水箱 v2：四支腿 + 罐体 + 顶部通气管 */
export function waterTank(faces: Face[], cx: number, cy: number, z0: number, z1: number): void {
  // 支腿
  const L = 1.7;
  for (const [ox, oy] of [[-L, -L], [L, -L], [-L, L], [L, L]] as const) {
    box(faces, cx + ox, cy + oy, cx + ox + 0.9, cy + oy + 0.9, z0 - 1.5, z0 + 0.3, {
      right: pWall(P.METAL), left: pWall(P.METAL),
      top: () => cell(P.METAL, 1),
    });
  }
  prism(faces, cx, cy, 2.3, z0, z1, {
    side: (u, v, px, py) => pTankShell()(u, v, px, py),
    top: pFlatRoof(P.METAL, 4),
  }, 8);
  // 顶部通气管（红帽）
  box(faces, cx + 1.3, cy + 1.3, cx + 2.0, cy + 2.0, z1, z1 + 0.9, {
    right: pWall(P.METAL), left: pWall(P.METAL),
    top: () => cell(P.RED, 0),
  });
}

/** 屋顶空调机组 v2：顶面风扇格栅（同心圆）+ 侧向散热百叶 */
export function acUnit(faces: Face[], x: number, y: number, z: number, s = 3): void {
  const topPat: PatFn = (u, v, px, py) => {
    const d = Math.hypot(u - s / 2, v - s / 2);
    if (d < s * 0.26) return cell(P.OUTLINE, 0);        // 风扇轴心
    if (d < s * 0.4) return cell(P.METAL, 2);           // 格栅环
    return pFlatRoof(P.METAL, 9)(u, v, px, py);
  };
  box(faces, x, y, x + s, y + s, z, z + 1.8, {
    top: topPat,
    right: (u, v) => ((u % 1.7) < 0.85 ? cell(P.METAL, 1) : cell(P.METAL, 2)),  // 百叶
    left: pWall(P.METAL),
  });
}

/** 细天线杆 v2：杆身 + 电视天线双横枝 + 红色航标 */
export function antenna(faces: Face[], x: number, y: number, z0: number, z1: number): void {
  box(faces, x, y, x + 1, y + 1, z0, z1, {
    right: pWall(P.METAL),
    left: pWall(P.METAL),
    top: () => cell(P.RED, 0),
  });
  // 电视天线横枝（上长下短）
  box(faces, x - 1.6, y + 0.15, x + 2.6, y + 0.85, z1 - 2.6, z1 - 2.1, {
    right: pWall(P.METAL), left: pWall(P.METAL), top: () => cell(P.METAL, 1),
  });
  box(faces, x - 0.9, y + 0.2, x + 1.9, y + 0.8, z1 - 4.0, z1 - 3.6, {
    right: pWall(P.METAL), left: pWall(P.METAL), top: () => cell(P.METAL, 1),
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
