// ============================================================
// b_water.ts — v6 水务设施：水塔（1×1，小范围供水）/
//               净水厂（2×2，大范围供水 + 高容量）
//   供水覆盖率 = 半径内住宅人口占比 × 总容量/总人口
// ============================================================

import { box, frustum, prism, buildModel, type Face } from './geo';
import { pWall, pWindows, pFlatRoof, pTankShell, pBands, pWaterStatic, pStone, cell, type PatFn } from './patterns';
import { RAMP } from './palette';
import { acUnit, waterTank, type BuildResult } from './b_util';

const P = RAMP;

/** 水塔（1×1）：混凝土基座 + 四腿支架构 + 大水柜（顶部水面可见）+ 侧爬梯 */
export function genWatertower(seed: number): BuildResult {
  const faces: Face[] = [];
  const stripe = (seed & 1) === 0 ? P.PBLUE : P.RFTEAL;   // 变体：水柜环带色
  // 混凝土基座
  box(faces, 4.6, 4.6, 11.4, 11.4, 0, 1.2, {
    right: pStone(), left: pStone(), top: pStone(P.SIDE),
  });
  // 四腿支架（等距收缩）
  const L = 2.2;
  for (const [ox, oy] of [[-L, -L], [L, -L], [-L, L], [L, L]] as const) {
    box(faces, 7.5 + ox, 7.5 + oy, 7.5 + ox + 1.0, 7.5 + oy + 1.0, 1.2, 11.5, {
      right: pWall(P.METAL), left: pWall(P.METAL),
      top: () => cell(P.METAL, 2),
    });
  }
  // 交叉斜撑（两档横杆）
  for (const z of [4.2, 8.2]) {
    box(faces, 6.0, 6.0, 10.0, 10.0, z, z + 0.55, {
      right: pWall(P.METAL), left: pWall(P.METAL),
      top: () => cell(P.METAL, 2),
    });
  }
  // 柜底倒锥
  frustum(faces, 8, 8, 5.6, 3.4, 11.5, 13.4, {
    side: (u, v, px, py) => pBands(P.METAL, 5)(u, v, px, py),
  }, 8);
  // 大水柜（环带 + 铆钉壳）
  prism(faces, 8, 8, 4.6, 13.4, 19.2, {
    side: (u, v, px, py) => {
      const band = pBands(stripe, 3.1)(u, v, px, py);
      return band;
    },
    top: pFlatRoof(P.METAL, 5),
  }, 10);
  // 顶部水面检修口（露天水柜：水面 + 栏杆）
  box(faces, 6.6, 6.6, 9.4, 9.4, 19.2, 19.9, {
    right: pWall(P.METAL), left: pWall(P.METAL),
    top: (u, v, px, py) => pWaterStatic()(u, v, px, py),
  });
  // 侧爬梯（贴西南面）
  box(faces, 3.6, 8.6, 4.1, 9.8, 1.2, 13.4, {
    right: pWall(P.OUTLINE), left: pWall(P.OUTLINE),
  });
  return { model: buildModel(faces, 16, 16) };
}

/** 净水厂（2×2）：办公主楼 + 双圆形沉淀池（水面可见）+ 加氯罐 + 连接管道 */
export function genWaterplant(seed: number): BuildResult {
  const faces: Face[] = [];
  const stone: PatFn = (u, v, px, py) => pStone(P.CREAM)(u, v, px, py);
  const glassBand: PatFn = (u, v, px, py) => pWindows(P.CREAM, { seed, lit: 0.22, floorH: 5.2, gapX: 3.6 })(u, v, px, py);

  // ---- 办公主楼（东北角）----
  box(faces, 17.5, 2.8, 29.4, 13.5, 0, 11, {
    right: glassBand, left: glassBand,
  });
  box(faces, 16.4, 1.8, 29.4, 14.4, 11, 12.2, {
    right: pWall(P.CREAM), left: pWall(P.CREAM), top: pFlatRoof(P.CREAM, 5),
  });
  acUnit(faces, 21, 6, 12.2, 3.2);
  // 大门雨棚
  box(faces, 18.5, 13.5, 27.5, 15.6, 2.6, 3.8, {
    right: pWall(P.PBLUE), left: pWall(P.PBLUE), top: () => cell(P.PBLUE, 0),
  });
  // 楼顶水塔小罐
  waterTank(faces, 26, 5.5, 12.2, 15.6);

  // ---- 双圆形沉淀池（西区）----
  const basin = (cx: number, cy: number) => {
    // 池壁环
    frustum(faces, cx, cy, 6.6, 6.6, 0, 4.6, {
      side: (u, v, px, py) => pStone(P.SIDE)(u, v, px, py),
      top: () => cell(P.SIDE, 1),
    }, 10);
    // 内腔水面（低于池沿）
    frustum(faces, cx, cy, 5.6, 5.6, 0.8, 3.8, {
      side: pWall(P.PBLUE),
      top: (u, v, px, py) => pWaterStatic()(u, v, px, py),
    }, 10);
    // 中心搅拌柱
    box(faces, cx - 0.5, cy - 0.5, cx + 0.5, cy + 0.5, 3.8, 7.2, {
      right: pWall(P.METAL), left: pWall(P.METAL), top: () => cell(P.METAL, 2),
    });
    // 刮泥桥
    box(faces, cx - 5.2, cy - 0.35, cx + 5.2, cy + 0.35, 6.6, 7.0, {
      right: pWall(P.METAL), left: pWall(P.METAL), top: () => cell(P.METAL, 0),
    });
  };
  basin(8, 8);
  basin(8, 24);

  // ---- 加氯罐组（东南角）----
  for (const [ox, oy] of [[24.5, 19.5], [28.5, 19.5], [24.5, 24.5], [28.5, 24.5]] as const) {
    prism(faces, ox + 1.2, oy + 1.2, 1.5, 0, 5.4, {
      side: (u, v, px, py) => pTankShell()(u, v, px, py),
      top: pFlatRoof(P.METAL, 4),
    }, 8);
  }
  // 连接管道（沉淀池 → 主楼；架空管）
  box(faces, 14.2, 7.4, 17.6, 8.6, 2.2, 3.0, {
    right: pWall(P.METAL), left: pWall(P.METAL), top: () => cell(P.METAL, 1),
  });
  box(faces, 14.2, 23.4, 17.6, 24.6, 2.2, 3.0, {
    right: pWall(P.METAL), left: pWall(P.METAL), top: () => cell(P.METAL, 1),
  });
  box(faces, 7.4, 14.6, 8.6, 17.4, 2.2, 3.0, {
    right: pWall(P.METAL), left: pWall(P.METAL), top: () => cell(P.METAL, 1),
  });
  // 厂区混凝土硬化地坪边缘（南侧入口坡道）
  box(faces, 2, 28.6, 30, 30, 0, 0.5, {
    right: stone, left: stone, top: () => cell(P.SIDE, 1),
  });
  return { model: buildModel(faces, 32, 32) };
}
