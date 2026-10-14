// ============================================================
// b_civ.ts — 公共与地标：公园 / 广场喷泉 / 学校(2×2) / 医院(2×2) /
//             神社(2×2) / 体育场(3×3) / 电视塔 / 纪念碑 / 树木
// ============================================================

import {
  box, gableRoof, hipRoof, pyramid, prism, frustum, cone,
  buildModel, type Face, type V3,
} from './geo';
import {
  pWall, pWindows, pShingle, pFlatRoof, pStone, pWaterStatic,
  pField, pCrowd, pArcade, pLattice, pCross, pCanopyGrad, pBands, cell,
  type PatFn,
} from './patterns';
import { RAMP, bayer } from './palette';
import { mulberry32 } from './rng';
import { flagPole, waterTank, type BuildResult } from './b_util';

const P = RAMP;

/** 街心公园（1×1）：地面为 park 特殊地面，模型 = 树 + 长椅 + 庭院灯 */
export function genPark(seed: number): BuildResult {
  const r = mulberry32(seed);
  const faces: Face[] = [];
  const spots = r() < 0.5
    ? [[4.5, 4.5], [11, 11.5], [12, 5]]
    : [[11.5, 4.5], [4.5, 11], [5, 5]];
  // 只放一棵主树 + 灌木（地面图案已有小径水塘）
  addTree(faces, spots[0][0], spots[0][1], r() < 0.5 ? 0 : 2, seed);
  // 长椅
  box(faces, spots[1][0] - 1.5, spots[1][1] - 1, spots[1][0] + 1.5, spots[1][1] + 1, 0.8, 2.2, {
    right: pWall(P.DIRT), left: pWall(P.DIRT), top: pWall(P.DIRT),
  });
  // 庭院灯
  box(faces, spots[2][0], spots[2][1], spots[2][0] + 1, spots[2][1] + 1, 0, 6.5, {
    right: pWall(P.METAL), left: pWall(P.METAL), top: () => cell(P.YELLOW, 0),
  });
  return { model: buildModel(faces, 16, 16) };
}

/** 树木部件（供公园与植树工具复用） */
export function addTree(faces: Face[], cx: number, cy: number, kind: number, seed: number): void {
  if (kind === 1) {
    // 松树：三层锥
    box(faces, cx - 0.8, cy - 0.8, cx + 0.8, cy + 0.8, 0, 5, {
      right: pWall(P.DIRT), left: pWall(P.DIRT),
    });
    cone(faces, cx, cy, 5.2, 3, 10, (u, v, px, py) => pCanopyGrad(P.PINE, 0, 7, seed)(u, v, px, py), 8);
    cone(faces, cx, cy, 4.0, 7, 13.5, (u, v, px, py) => pCanopyGrad(P.PINE, 0, 7, seed)(u, v, px, py), 8);
    cone(faces, cx, cy, 2.8, 10, 17, (u, v, px, py) => pCanopyGrad(P.PINE, 0, 7, seed)(u, v, px, py), 8);
  } else if (kind === 2) {
    // 灌木
    prism(faces, cx, cy, 3.4, 0.6, 4.4, {
      side: (u, v, px, py) => pCanopyGrad(P.LEAF, 0, 5, seed)(u, v, px, py),
      top: (u, v, px, py) => pCanopyGrad(P.LEAF, 0, 5, seed)(u, v, px, py),
    }, 8);
  } else {
    // 阔叶树：双层树冠
    box(faces, cx - 0.9, cy - 0.9, cx + 0.9, cy + 0.9, 0, 7, {
      right: pWall(P.DIRT), left: pWall(P.DIRT),
    });
    prism(faces, cx, cy, 5.0, 5, 10.5, {
      side: (u, v, px, py) => pCanopyGrad(P.LEAF, 0, 6, seed)(u, v, px, py),
      top: (u, v, px, py) => pCanopyGrad(P.LEAF, 0, 6, seed)(u, v, px, py),
    }, 8);
    prism(faces, cx, cy, 3.2, 10.5, 14.5, {
      side: (u, v, px, py) => pCanopyGrad(P.LEAF, 0, 4, seed)(u, v, px, py),
      top: (u, v, px, py) => pCanopyGrad(P.LEAF, 0, 4, seed)(u, v, px, py),
    }, 8);
  }
}

/** 独立树木（植树工具） */
export function genTree(seed: number): BuildResult {
  const kind = seed & 3;
  const faces: Face[] = [];
  addTree(faces, 8, 8, kind === 3 ? 0 : kind, seed);
  return { model: buildModel(faces, 16, 16) };
}

/** 广场喷泉（1×1）：地面为 plaza，八角盆 + 水柱 */
export function genPlaza(_seed: number): BuildResult {
  const faces: Face[] = [];
  // 盆体
  frustum(faces, 8, 8, 6.4, 5.4, 0, 2.6, {
    side: (u, v, px, py) => pStone()(u, v, px, py),
    top: (u, v, px, py) => pWaterStatic()(u, v, px, py),
    topR: 0.86,
  }, 8);
  // 中央柱
  prism(faces, 8, 8, 1.6, 2.6, 6.2, {
    side: (u, v, px, py) => pStone()(u, v, px, py),
    top: (u, v, px, py) => pWaterStatic()(u, v, px, py),
  }, 8);
  // 顶碗
  frustum(faces, 8, 8, 1.2, 3.2, 6.2, 7.4, {
    side: (u, v, px, py) => pStone()(u, v, px, py),
    top: (u, v, px, py) => pWaterStatic()(u, v, px, py),
  }, 8);
  return { model: buildModel(faces, 16, 16) };
}

/** 学校（2×2）：U 形两翼双坡顶 + 旗杆 */
export function genSchool(seed: number): BuildResult {
  const faces: Face[] = [];
  const h = 12;
  const roof = P.RFRED;
  // 北翼（沿 X）
  box(faces, 4, 4, 28, 13, 0, h, {
    right: pWindows(P.CREAM, { seed, lit: 0.12, floorH: 6, gapX: 4 }),
    left: pWindows(P.CREAM, { seed: seed ^ 2, lit: 0.12, floorH: 6, gapX: 4 }),
  });
  gableRoof(faces, 3, 3, 29, 14, h - 0.5, h + 5, 'x', {
    front: pShingle(roof), back: pShingle(roof), endX: pWall(P.CREAM),
  });
  // 西翼（沿 Y）
  box(faces, 4, 13, 13, 28, 0, h, {
    right: pWindows(P.CREAM, { seed: seed ^ 4, lit: 0.12, floorH: 6, gapX: 4 }),
    left: pWindows(P.CREAM, { seed: seed ^ 6, lit: 0.12, floorH: 6, gapX: 4, door: true }),
  });
  gableRoof(faces, 3, 12, 14, 29, h - 0.5, h + 5, 'y', {
    front: pShingle(roof), back: pShingle(roof), endY: pWall(P.CREAM),
  });
  // 中央钟塔
  box(faces, 17.5, 17.5, 22.5, 22.5, 0, h + 6, {
    right: pWall(P.CREAM), left: pWall(P.CREAM),
  });
  pyramid(faces, 17, 17, 23, 23, h + 6, h + 10.5, pShingle(roof));
  // 钟面（+Y）
  box(faces, 18.6, 22.5, 21.4, 23.1, h + 3.4, h + 6, {
    left: () => cell(P.WHITE, 0),
  });
  // 旗杆
  flagPole(faces, 27, 27, 16, P.RED);
  return { model: buildModel(faces, 32, 32) };
}

/** 医院（2×2）：白色主楼 + 楼顶红十字 + 入口雨棚 */
export function genHospital(seed: number): BuildResult {
  const faces: Face[] = [];
  const h = 26;
  box(faces, 4, 4, 28, 28, 0, h, {
    right: pWindows(P.CREAM, { seed, lit: 0.3, floorH: 6.4, gapX: 3.8, base: 4 }),
    left: pWindows(P.CREAM, { seed: seed ^ 9, lit: 0.3, floorH: 6.4, gapX: 3.8, base: 4, door: true, doorW: 4 }),
  });
  // 入口雨棚
  box(faces, 12, 28, 20, 30.5, 4.5, 5.8, {
    top: pFlatRoof(P.RFGRAY, 2), right: pWall(P.RFGRAY), left: pWall(P.RFGRAY),
  });
  // 楼顶设备层
  box(faces, 8, 8, 24, 24, h, h + 3, {
    right: pWall(P.PBLUE), left: pWall(P.PBLUE), top: pFlatRoof(P.RFGRAY, 1),
  });
  // 红十字标牌
  box(faces, 13, 13, 19, 19, h + 3, h + 6.4, {
    right: pCross(6), left: pCross(6), top: () => cell(P.RED, 0),
  });
  waterTank(faces, 26, 7, h + 3, h + 6.5);
  return { model: buildModel(faces, 32, 32) };
}

/** 神社（2×2）：石基 + 大殿 + 四坡青绿瓦顶 + 鸟居（PC98 风） */
export function genTemple(seed: number): BuildResult {
  const faces: Face[] = [];
  // 石基
  box(faces, 2, 2, 30, 30, 0, 3.2, {
    right: (u, v, px, py) => pStone()(u, v, px, py),
    left: (u, v, px, py) => pStone()(u, v, px, py),
    top: (u, v, px, py) => pStone(P.SIDE)(u, v, px, py),
  });
  // 大殿
  box(faces, 8, 8, 24, 24, 3.2, 13, {
    right: (u, v, px, py) => pWall(P.TAN)(u, v, px, py),
    left: (u, v, px, py) => pWindows(P.TAN, { seed, lit: 0.25, floorH: 10, winW: 2, winH: 3, gapX: 6 })(u, v, px, py),
  });
  // 一重屋檐（大出檐四坡顶）
  hipRoof(faces, 5.5, 5.5, 26.5, 26.5, 12.4, 17, 0.55, {
    slope: pShingle(P.RFTEAL),
  });
  // 二层小殿
  box(faces, 12, 12, 20, 20, 17, 22, {
    right: pWall(P.TAN), left: pWall(P.TAN),
  });
  hipRoof(faces, 10.5, 10.5, 21.5, 21.5, 21.6, 25.5, 0.5, {
    slope: pShingle(P.RFTEAL),
  });
  // 黄金宝珠
  box(faces, 15.5, 15.5, 16.5, 16.5, 25.5, 27.5, {
    right: pBands(P.YELLOW, 64), left: pBands(P.YELLOW, 64), top: () => cell(P.YELLOW, 0),
  });
  // 鸟居（南侧）
  box(faces, 12, 27.5, 13.2, 28.7, 3.2, 11, {
    right: pWall(P.RED), left: pWall(P.RED),
  });
  box(faces, 18.8, 27.5, 20, 28.7, 3.2, 11, {
    right: pWall(P.RED), left: pWall(P.RED),
  });
  box(faces, 10.8, 27.7, 21.2, 28.9, 10.2, 11.6, {
    right: pWall(P.RED), left: pWall(P.RED), top: pWall(P.RED),
  });
  box(faces, 11.8, 27.7, 20.2, 28.9, 8.6, 9.6, {
    right: pWall(P.RED), left: pWall(P.RED), top: pWall(P.RED),
  });
  // 石灯笼
  prism(faces, 25.5, 27, 1.4, 3.2, 6.8, {
    side: (u, v, px, py) => pStone()(u, v, px, py),
    top: () => cell(P.WHITE, 0),
  }, 8);
  return { model: buildModel(faces, 32, 32) };
}

/** 体育场（3×3）：双层看台碗 + 草坪 + 四角灯塔 */
export function genStadium(_seed: number): BuildResult {
  const faces: Face[] = [];
  const c = 24, c24 = 24;
  // 外圈基座（外倾）
  frustum(faces, c, c24, 15.5, 19.5, 0, 9, {
    side: (u, v, px, py) => pArcade()(u, v, px, py),
  }, 8);
  // 看台环（垂直外壁人群 + 内壁座椅）
  frustum(faces, c, c24, 19.5, 19.5, 9, 19, {
    side: (u, v, px, py) => pArcade()(u, v, px, py),
  }, 8);
  frustum(faces, c, c24, 19.5, 19.5, 9, 19, {
    side: (u, v, px, py) => pCrowd()(u, v, px, py),
  }, 8, 8, true);
  // 上层看台（内倾）
  frustum(faces, c, c24, 19.5, 15, 19, 24, {
    side: (u, v, px, py) => pCrowd()(u, v, px, py),
  }, 8, 8, true);
  frustum(faces, c, c24, 19.5, 20.5, 19, 24.5, {
    side: (u, v, px, py) => pWall(P.SIDE)(u, v, px, py),
  }, 8);
  // 场地（草坪）
  frustum(faces, c, c24, 14.5, 14.5, 0.1, 9, {
    side: (u, v, px, py) => pArcade()(u, v, px, py),
    top: (u, v, px, py) => pField(29, 29)(u + 9.5, v + 9.5, px, py),
  }, 8);
  // 四角灯塔
  const pos: Array<[number, number]> = [[5.5, 5.5], [42.5, 5.5], [5.5, 42.5], [42.5, 42.5]];
  for (const [x, y] of pos) {
    box(faces, x - 1, y - 1, x + 1, y + 1, 0, 26, {
      right: pWall(P.METAL), left: pWall(P.METAL),
    });
    box(faces, x - 2.4, y - 2.4, x + 2.4, y + 2.4, 26, 28.4, {
      right: pWall(P.METAL), left: pWall(P.METAL), top: () => cell(P.WHITE, 0),
    });
  }
  return { model: buildModel(faces, 48, 48) };
}

/** 电视塔（1×1）：格构锥身 + 观景舱 + 闪烁航标 */
export function genRadioTower(seed: number): BuildResult {
  const faces: Face[] = [];
  // 基座
  box(faces, 4.5, 4.5, 11.5, 11.5, 0, 2.4, {
    right: (u, v, px, py) => pStone()(u, v, px, py),
    left: (u, v, px, py) => pStone()(u, v, px, py),
    top: (u, v, px, py) => pStone()(u, v, px, py),
  });
  // 格构锥身
  frustum(faces, 8, 8, 4.2, 1.4, 2.4, 32, {
    side: (u, v, px, py) => pLattice()(u, v, px, py),
  }, 8);
  // 观景舱
  frustum(faces, 8, 8, 1.4, 3.8, 32, 37, {
    side: (u, v, px, py) => pBands(P.RED, 2.5)(u, v, px, py),
    top: pFlatRoof(P.METAL, 3),
  }, 8);
  // 天线
  box(faces, 7.5, 7.5, 8.5, 8.5, 37, 50, {
    right: pWall(P.METAL), left: pWall(P.METAL),
  });
  const blinkAt: V3 = [8, 8, 50];
  void seed;
  return { model: buildModel(faces, 16, 16), blinkAt };
}

/** 纪念碑（1×1）：石座 + 柱身 + 方尖顶 */
export function genMonument(_seed: number): BuildResult {
  const faces: Face[] = [];
  const stone: PatFn = (u, v, px, py) => pStone(P.CREAM)(u, v, px, py);
  box(faces, 4.6, 4.6, 11.4, 11.4, 0, 2.2, {
    right: stone, left: stone, top: stone,
  });
  box(faces, 5.6, 5.6, 10.4, 10.4, 2.2, 3.6, {
    right: stone, left: stone, top: stone,
  });
  prism(faces, 8, 8, 1.9, 3.6, 16, {
    side: (u, v, px, py) => stone(u, v, px, py),
    top: stone,
  }, 8);
  pyramid(faces, 6.1, 6.1, 9.9, 9.9, 16, 19.5, (u, v, px, py) =>
    bayer(px, py, 0.2) ? cell(P.CREAM, 1) : cell(P.CREAM, 0));
  // 四角小柱
  for (const [x, y] of [[4.2, 4.2], [11, 4.2], [4.2, 11], [11, 11]] as const) {
    box(faces, x, y, x + 1.2, y + 1.2, 2.2, 4.6, {
      right: stone, left: stone, top: stone,
    });
  }
  return { model: buildModel(faces, 16, 16) };
}
