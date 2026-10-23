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
import { mulberry32, hash2 } from './rng';
import { flagPole, waterTank, type BuildResult } from './b_util';

const P = RAMP;

/** 街心公园（1×1）：地面为 park 特殊地面，模型 = 树 + 长椅 + 庭院灯；season 决定树冠季相（v6） */
export function genPark(seed: number, season = 1): BuildResult {
  const r = mulberry32(seed);
  const faces: Face[] = [];
  const spots = r() < 0.5
    ? [[4.5, 4.5], [11, 11.5], [12, 5]]
    : [[11.5, 4.5], [4.5, 11], [5, 5]];
  // 只放一棵主树 + 灌木（地面图案已有小径水塘）；春季一半概率换成樱花树（粉冠点景）
  const springSakura = season === 0 && r() < 0.5;
  addTree(faces, spots[0][0], spots[0][1], springSakura ? 3 : r() < 0.5 ? 0 : 2, seed, season);
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

/** 树木部件（供公园与植树工具复用）：0 阔叶 / 1 松 / 2 灌木 / 3 樱花 / 4 棕榈 / 5 高乔木
 *  v6 季节参数（0 春 / 1 夏 / 2 秋 / 3 冬）：阔叶族树冠随季换色，松柏常绿（冬带雪顶），棕榈四季常青 */
export function addTree(faces: Face[], cx: number, cy: number, kind: number, seed: number, season = 1): void {
  // 阔叶族（阔叶/灌木/高乔木）树冠色阶：春新绿 / 夏盛绿 / 秋红叶 / 冬积雪
  const leafRamp = season === 0 ? P.SPRING : season === 2 ? P.RFRED : season === 3 ? P.SNOWLEAF : P.LEAF;
  // 松柏：常绿，冬季换雪顶
  const pineRamp = season === 3 ? P.SNOWPINE : P.PINE;
  if (kind === 1) {
    // 松树：三层锥
    box(faces, cx - 0.8, cy - 0.8, cx + 0.8, cy + 0.8, 0, 5, {
      right: pWall(P.DIRT), left: pWall(P.DIRT),
    });
    cone(faces, cx, cy, 5.2, 3, 10, (u, v, px, py) => pCanopyGrad(pineRamp, 0, 7, seed)(u, v, px, py), 8);
    cone(faces, cx, cy, 4.0, 7, 13.5, (u, v, px, py) => pCanopyGrad(pineRamp, 0, 7, seed)(u, v, px, py), 8);
    cone(faces, cx, cy, 2.8, 10, 17, (u, v, px, py) => pCanopyGrad(pineRamp, 0, 7, seed)(u, v, px, py), 8);
  } else if (kind === 2) {
    // 灌木
    prism(faces, cx, cy, 3.4, 0.6, 4.4, {
      side: (u, v, px, py) => pCanopyGrad(leafRamp, 0, 5, seed)(u, v, px, py),
      top: (u, v, px, py) => pCanopyGrad(leafRamp, 0, 5, seed)(u, v, px, py),
    }, 8);
  } else if (kind === 3) {
    // 樱花树：深色枝干 + 双层粉冠 + 白色花瓣点（春季限定花色；夏绿 / 秋红 / 冬雪）
    box(faces, cx - 0.9, cy - 0.9, cx + 0.9, cy + 0.9, 0, 6.5, {
      right: pWall(P.DIRT), left: pWall(P.DIRT),
    });
    const blossom = season === 0;
    const crown = blossom ? P.SAKURA : leafRamp;
    const sakura = (lo: number, hi: number) => (u: number, v: number, px: number, py: number) => {
      const cl = hash2(Math.floor(u / 2.6), Math.floor(v / 2.6), seed ^ 0x5A7C);
      if (cl < (blossom ? 0.16 : 0.10)) return cell(P.WHITE, 0);           // 花簇高光 / 冬日雪斑
      return pCanopyGrad(crown, lo, hi, seed)(u, v, px, py);
    };
    prism(faces, cx, cy, 5.4, 5, 11, {
      side: (u, v, px, py) => sakura(0, 6)(u, v, px, py),
      top: (u, v, px, py) => sakura(0, 6)(u, v, px, py),
    }, 8);
    prism(faces, cx, cy, 3.4, 11, 15, {
      side: (u, v, px, py) => sakura(2, 11)(u, v, px, py),
      top: (u, v, px, py) => sakura(2, 11)(u, v, px, py),
    }, 8);
  } else if (kind === 4) {
    // 棕榈：弯曲于 + 顶部放射叶冠
    box(faces, cx - 0.9, cy - 0.9, cx + 0.9, cy + 0.9, 0, 8, {
      right: pWall(P.DIRT), left: pWall(P.DIRT),
    });
    box(faces, cx - 0.4, cy - 0.4, cx + 1.4, cy + 1.4, 8, 13, {
      right: pWall(P.DIRT), left: pWall(P.DIRT),
    });
    const frond = (u: number, v: number, px: number, py: number) => {
      const cl = hash2(Math.floor(u / 2.4), Math.floor(v / 2.4), seed ^ 0xBA);
      if (cl < 0.18) return cell(P.PINE, 2);
      if (bayer(px, py, 0.2)) return cell(P.PINE, 1);
      return cell(P.LEAF, 1);
    };
    // 四向下垂叶 + 中央叶球
    cone(faces, cx + 2.6, cy + 0.4, 3.4, 11.5, 15.5, (u, v, px, py) => frond(u, v, px, py), 6);
    cone(faces, cx - 0.4, cy + 2.6, 3.4, 11.5, 15.5, (u, v, px, py) => frond(u, v, px, py), 6);
    cone(faces, cx + 0.2, cy + 0.2, 3.0, 12.5, 17.5, (u, v, px, py) => frond(u, v, px, py), 7);
    prism(faces, cx + 0.6, cy + 0.6, 1.6, 12.5, 15.5, {
      side: (u, v, px, py) => frond(u, v, px, py),
      top: (u, v, px, py) => frond(u, v, px, py),
    }, 6);
  } else if (kind === 5) {
    // 高乔木：高千 + 卵形大冠
    box(faces, cx - 0.8, cy - 0.8, cx + 0.8, cy + 0.8, 0, 11, {
      right: pWall(P.DIRT), left: pWall(P.DIRT),
    });
    prism(faces, cx, cy, 4.4, 10, 16, {
      side: (u, v, px, py) => pCanopyGrad(leafRamp, 0, 7, seed)(u, v, px, py),
      top: (u, v, px, py) => pCanopyGrad(leafRamp, 0, 7, seed)(u, v, px, py),
    }, 8);
    cone(faces, cx, cy, 3.6, 15, 21, (u, v, px, py) => pCanopyGrad(leafRamp, 0, 6, seed)(u, v, px, py), 8);
  } else {
    // 阔叶树：双层树冠
    box(faces, cx - 0.9, cy - 0.9, cx + 0.9, cy + 0.9, 0, 7, {
      right: pWall(P.DIRT), left: pWall(P.DIRT),
    });
    prism(faces, cx, cy, 5.0, 5, 10.5, {
      side: (u, v, px, py) => pCanopyGrad(leafRamp, 0, 6, seed)(u, v, px, py),
      top: (u, v, px, py) => pCanopyGrad(leafRamp, 0, 6, seed)(u, v, px, py),
    }, 8);
    prism(faces, cx, cy, 3.2, 10.5, 14.5, {
      side: (u, v, px, py) => pCanopyGrad(leafRamp, 0, 4, seed)(u, v, px, py),
      top: (u, v, px, py) => pCanopyGrad(leafRamp, 0, 4, seed)(u, v, px, py),
    }, 8);
  }
}

/** 独立树木（植树工具）：seed 低 3 位决定种类，共 6 种；season 决定季相（v6） */
export function genTree(seed: number, season = 1): BuildResult {
  const kind = seed & 7;
  const faces: Face[] = [];
  addTree(faces, 8, 8, kind > 5 ? 0 : kind, seed, season);
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
  }, 8, true);
  // 上层看台（内倾）
  frustum(faces, c, c24, 19.5, 15, 19, 24, {
    side: (u, v, px, py) => pCrowd()(u, v, px, py),
  }, 8, true);
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

/** 市政厅（2×2，经营模式核心）：石阶基座 + 拱窗主楼 + 中央钟塔金顶 + 旗帜 */
export function genCityhall(seed: number): BuildResult {
  const faces: Face[] = [];
  const lit = 0.28;
  // ---- 石阶基座（两层收分）----
  box(faces, 2.5, 2.5, 29.5, 29.5, 0, 1.5, {
    right: (u, v, px, py) => pStone()(u, v, px, py),
    left: (u, v, px, py) => pStone()(u, v, px, py),
    top: (u, v, px, py) => pStone(P.SIDE)(u, v, px, py),
  });
  box(faces, 4.5, 4.5, 27.5, 27.5, 1.5, 3, {
    right: (u, v, px, py) => pStone()(u, v, px, py),
    left: (u, v, px, py) => pStone()(u, v, px, py),
    top: (u, v, px, py) => pStone(P.CREAM)(u, v, px, py),
  });
  // ---- 主楼体（奶油色 + 拱窗，入口居南）----
  box(faces, 6.5, 6.5, 25.5, 25.5, 3, 12.5, {
    right: pWindows(P.CREAM, { seed, lit, floorH: 6, gapX: 4, base: 3 }),
    left: pWindows(P.CREAM, { seed: seed ^ 5, lit, floorH: 6, gapX: 4, base: 3, door: true, doorW: 5 }),
  });
  // 檐口线脚
  box(faces, 5.8, 5.8, 26.2, 26.2, 12.5, 14, {
    right: pWall(P.CREAM), left: pWall(P.CREAM),
    top: pFlatRoof(P.RFGRAY, 2),
  });
  // ---- 中央钟塔 ----
  box(faces, 12.8, 12.8, 19.2, 19.2, 14, 24.5, {
    right: pWall(P.CREAM), left: pWall(P.CREAM),
  });
  // 塔身窄窗
  box(faces, 14.8, 19.2, 17.2, 19.4, 16, 21, {
    left: pWindows(P.CREAM, { seed: seed ^ 7, lit, floorH: 7, winW: 1.6, winH: 3, gapX: 2.4 }),
  });
  // 钟面（南 + 北）
  box(faces, 13.9, 18.9, 18.1, 19.7, 20, 23.4, {
    left: () => cell(P.WHITE, 0),
  });
  box(faces, 13.9, 12.3, 18.1, 13.1, 20, 23.4, {
    right: () => cell(P.WHITE, 0),
  });
  // 指针（双色小方块）
  box(faces, 15.7, 19.1, 16.3, 19.5, 21.4, 22.6, {
    left: pBands(P.OUTLINE, 2),
  });
  box(faces, 15.7, 12.5, 16.3, 12.9, 21.4, 22.6, {
    right: pBands(P.OUTLINE, 2),
  });
  // 金字塔穹顶
  pyramid(faces, 12.2, 12.2, 19.8, 19.8, 24.5, 29, (u, v, px, py) =>
    pShingle(P.YELLOW)(u, v, px, py));
  // 顶珠
  box(faces, 15.7, 15.7, 16.3, 16.3, 29, 30.2, {
    right: () => cell(P.YELLOW, 0), left: () => cell(P.YELLOW, 0), top: () => cell(P.WHITE, 0),
  });
  // 旗帜
  flagPole(faces, 21.5, 21.5, 14, P.RED);
  // ---- 两侧翼亭 ----
  for (const [x0, y0] of [[6.5, 21.5], [21.5, 6.5]] as const) {
    box(faces, x0, y0, x0 + 4.5, y0 + 4.5, 3, 10, {
      right: pWindows(P.CREAM, { seed: seed ^ (x0 < 10 ? 11 : 13), lit, floorH: 5, winW: 2, winH: 2.6, gapX: 2.6 }),
      left: pWall(P.CREAM),
    });
    pyramid(faces, x0 - 0.6, y0 - 0.6, x0 + 5.1, y0 + 5.1, 10, 13.5, (u, v, px, py) =>
      pShingle(P.RFTEAL)(u, v, px, py));
  }
  // 门前庭院灯 ×2
  for (const lx of [13.5, 18]) {
    box(faces, lx, 27.5, lx + 1, 28.5, 3, 7, {
      right: pWall(P.METAL), left: pWall(P.METAL), top: () => cell(P.YELLOW, 0),
    });
  }
  return { model: buildModel(faces, 32, 32) };
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

/** 图书馆（2×1）：新古典阅读殿堂 —— 石砌基座 + 高窗主殿 + 廊柱山花门廊 + 石板坡顶 */
export function genLibrary(seed: number): BuildResult {
  const faces: Face[] = [];
  const stone: PatFn = (u, v, px, py) => pStone(P.CREAM)(u, v, px, py);
  const slate: PatFn = (u, v, px, py) => pShingle(P.RFSLATE)(u, v, px, py);

  // 石砌基座（全足印）+ 正面两级台阶
  box(faces, 1.5, 1.5, 30.5, 14.5, 0, 2, { right: stone, left: stone, top: stone });
  box(faces, 9, 14.5, 23, 16.2, 0, 1, { right: stone, left: stone, top: stone });
  box(faces, 10, 16.2, 22, 17.4, 0, 0.5, { right: stone, left: stone, top: stone });

  // 主殿：米色高墙 + 两层大窗（夜间半数亮灯，书香灯海）
  const hall = pWindows(P.CREAM, { seed, lit: 0.55, floorH: 4.4, gapX: 3.8, winH: 2.6, winW: 2.2 });
  const hall2 = pWindows(P.CREAM, { seed: seed ^ 11, lit: 0.55, floorH: 4.4, gapX: 4.2, winH: 2.6, winW: 2.2 });
  box(faces, 4, 2.6, 28, 13.4, 2, 11, { right: hall2, left: hall });

  // 石板双坡顶（屋脊沿 X）+ 两端山花
  gableRoof(faces, 3.2, 1.8, 28.8, 14.2, 11, 16.2, 'x', {
    front: slate, back: slate,
    endX: (u, v, px, py) => bayer(px, py, 0.15) ? cell(P.CREAM, 1) : cell(P.CREAM, 0),
  });
  // 屋脊饰 + 中央采光亭
  box(faces, 14.5, 7.2, 17.5, 8.8, 16.2, 17, { right: stone, left: stone, top: stone });
  box(faces, 15.5, 7.7, 16.5, 8.3, 17, 18.6, {
    right: () => cell(P.YELLOW, 0), left: () => cell(P.YELLOW, 0), top: () => cell(P.YELLOW, 0),
  });

  // 门廊：四柱 + 檐口 + 山花（+Y 正面）
  for (let i = 0; i < 4; i++) {
    const cx = 8.6 + i * 4.9;
    prism(faces, cx, 14.2, 1.05, 2, 9.2, {
      side: (u, v, px, py) => stone(u, v, px, py),
      top: stone,
    }, 8);
  }
  box(faces, 6.4, 13.6, 26.6, 15.9, 9.2, 11.2, {
    right: stone, left: stone, top: stone,
  });
  gableRoof(faces, 6.4, 13.6, 26.6, 15.9, 11.2, 13.6, 'x', {
    front: (u, v, px, py) => bayer(px, py, 0.12) ? cell(P.CREAM, 1) : cell(P.CREAM, 0),
    endX: stone,
  });

  // 双开门（+Y 面，深色木门 + 门环）
  box(faces, 14, 13.3, 19, 14.1, 2, 7.4, {
    left: (u, v, px, py) =>
      (Math.abs(u - 2.5) < 0.5 || Math.abs(u - 5.1) < 0.5) && v > 2 && v < 5
        ? cell(P.YELLOW, 0) : cell(P.DIRT, 1),
    top: () => cell(P.DIRT, 1),
  });

  // 基座四角石球 + 门前庭院灯 ×2
  for (const [x, y] of [[2.6, 2.6], [28.9, 2.6]] as const) {
    prism(faces, x + 0.8, y + 0.8, 1.1, 2, 4.6, {
      side: (u, v, px, py) => stone(u, v, px, py), top: stone,
    }, 8);
  }
  for (const x of [6.5, 25.5] as const) {
    box(faces, x, 16.4, x + 1, 17.4, 0, 7.5, {
      right: pWall(P.METAL), left: pWall(P.METAL), top: () => cell(P.LAMP, 0),
    });
  }
  return { model: buildModel(faces, 32, 16) };
}

/** 空气净化塔（1×1，v19 生态治理）：混凝土基座 + 白瓷塔身 + 三层渐大滤网盘 +
 *  青瓷锥顶罩 + 顶端风机盘 + 绿藤垂挂 + 塔顶绿灯（夜间呼吸）。
 *  半径 5 格内雾霾大幅削减 —— 重工业区里的「城市之肺」 */
export function genEcotower(seed: number): BuildResult {
  const faces: Face[] = [];
  const celadon = (seed & 1) === 0 ? P.RFTEAL : P.RFRED;   // 变体：顶罩环带色
  // ---- 混凝土基座 ----
  box(faces, 4.4, 4.4, 11.6, 11.6, 0, 1.4, {
    right: pStone(P.SIDE), left: pStone(P.SIDE), top: pStone(P.SIDE),
  });
  // ---- 白瓷塔身（青瓷环带 + 铆钉竖缝）----
  prism(faces, 8, 8, 2.7, 1.4, 15.6, {
    side: (u, v, px, py) => pBands(P.CREAM, 3.4)(u, v, px, py),
  }, 10);
  // ---- 三层渐大滤网盘（白格栅 + 盘沿青瓷圈）----
  const tray = (z: number, r: number) => {
    prism(faces, 8, 8, r, z, z + 1.15, {
      side: (u, v, px, py) => {
        // 格栅：亮白竖条 + 稀疏透空点（滤材质感）
        const bar = Math.abs((u % 2.2) - 1.1) < 0.55;
        if (bayer(px, py, 0.14)) return cell(P.METAL, 1);
        return bar ? cell(P.WHITE, 0) : cell(P.CREAM, 1);
      },
      top: () => cell(P.CREAM, 0),
    }, 12);
    // 盘沿环（青瓷点缀）
    prism(faces, 8, 8, r + 0.35, z + 0.85, z + 1.15, {
      side: pWall(celadon), top: () => cell(celadon, 1),
    }, 12);
  };
  tray(4.6, 4.0);
  tray(8.8, 4.8);
  tray(13.0, 5.6);
  // ---- 青瓷锥顶罩 + 顶端风机盘 ----
  cone(faces, 8, 8, 2.7, 15.6, 18.2, (u, v, px, py) =>
    pCanopyGrad(celadon, 0, 5, seed)(u, v, px, py), 10);
  prism(faces, 8, 8, 1.5, 18.2, 19.3, {
    side: pWall(P.METAL),
    top: (u, v, px, py) => {
      // 风机辐条：中心毂 + 六向扇叶
      const dx = px - 8, dy = py - 8, rr = Math.hypot(dx, dy);
      if (rr < 0.8) return cell(P.METAL, 0);
      const ang = (Math.atan2(dy, dx) + Math.PI) / (Math.PI / 3);
      if (Math.abs(ang - Math.round(ang)) < 0.28) return cell(P.METAL, 1);
      return cell(P.WHITE, 0);
    },
  }, 10);
  // ---- 绿藤垂挂（西南面两条，滤过的空气都带着植物香）----
  for (const gx of [4.1, 11.0] as const) {
    box(faces, gx, 11.4, gx + 0.7, 12.1, 3.2, 8.6, {
      left: (u, v, px, py) => (bayer(px, py, 0.45) ? cell(P.LEAF, 1) : cell(P.PINE, 2)),
    });
  }
  return { model: buildModel(faces, 16, 16), blinkAt: [8, 8, 18.8] as V3 };
}

// ============================================================
// v20 万家灯火·电网时代 — 公共：变电站（1×1）
// ============================================================

/** 变电站（1×1，LV4）：格构钢塔 + 顶横担 + 三串瓷绝缘子 + 悬空母线 + 值班小屋。
 *  自身落在任一电源 6 格内＝有效中继，再向外辐射 6 格供电。
 *  夜景无 GLASS 大窗 —— 高压设施只留塔顶一盏红色警示灯（blinkAt）与小屋一盏值班灯 */
export function genSubstation(seed: number): BuildResult {
  const steel = (seed & 1) === 0 ? P.METAL : P.RFSLATE;    // 变体：横担钢色
  const faces: Face[] = [];
  // ---- 混凝土基座 ----
  box(faces, 3.2, 3.2, 12.8, 12.8, 0, 1.2, {
    right: pStone(P.SIDE), left: pStone(P.SIDE), top: pStone(P.SIDE),
  });
  // ---- 格构塔身（下宽上窄两段，X 交叉腹杆）----
  box(faces, 5.0, 5.0, 11.0, 11.0, 1.2, 6.2, {
    right: pLattice(), left: pLattice(),
  });
  box(faces, 6.0, 6.0, 10.0, 10.0, 6.2, 11.6, {
    right: pLattice(), left: pLattice(),
  });
  // ---- 顶层横担（双横梁）----
  box(faces, 2.6, 7.3, 13.4, 8.7, 11.6, 13.0, {
    right: pWall(steel), left: pWall(steel), top: pWall(P.SIDE),
  });
  box(faces, 2.6, 7.3, 13.4, 8.7, 8.6, 9.6, {
    right: pWall(steel), left: pWall(steel), top: () => cell(P.METAL, 0),
  });
  // ---- 三串悬垂瓷绝缘子（横担两端与中央，垂在横梁下）----
  for (const ix of [3.6, 8, 12.4]) {
    box(faces, ix - 0.4, 7.7, ix + 0.4, 8.3, 9.6, 11.4, {
      right: pWall(P.CYAN), left: pWall(P.CYAN),
    });
  }
  // ---- 悬空母线（绝缘子底连成一条，微微 sag 用两段错高横杆示意）----
  box(faces, 3.2, 7.85, 8.2, 8.15, 9.2, 9.5, {
    right: pWall(P.WHITE), left: pWall(P.WHITE), top: pWall(P.WHITE),
  });
  box(faces, 7.8, 7.85, 12.8, 8.15, 9.0, 9.3, {
    right: pWall(P.WHITE), left: pWall(P.WHITE), top: pWall(P.WHITE),
  });
  // ---- 塔顶警示灯 ----
  box(faces, 7.6, 7.6, 8.4, 8.4, 13.0, 14.0, {
    right: pWall(P.METAL), left: pWall(P.METAL), top: () => cell(P.YELLOW, 0),
  });
  // ---- 值班小屋（一角：一扇 GLASS 窗夜里亮暖灯）----
  box(faces, 10.6, 10.6, 14.2, 14.2, 0, 3.6, {
    right: (u, v, px, py) => (u > 0.9 && u < 2.7 && v > 1 && v < 3 ? cell(P.GLASS, 0) : pWall(P.RFGRAY)(u, v, px, py)),
    left: pWall(P.RFGRAY), top: pFlatRoof(P.RFGRAY, 2),
  });
  return { model: buildModel(faces, 16, 16), blinkAt: [8, 8, 14.6] as V3 };
}

/** 小学（1×1，LV2，v22 教育空间化）：红砖蒙学塾 + 双坡瓦顶 + 拱形门 + 旗杆小操场。
 *  半径 4 格住宅划入学区 —— 早期办学的实惠之选（教育 +18） */
export function genPrimary(seed: number): BuildResult {
  const faces: Face[] = [];
  const roof = (seed & 1) === 0 ? P.RFRED : P.RFSLATE;   // 变体：瓦色（红陶 / 青灰）
  // ---- 操场地坪（沥青小院，含跳格游戏白点意象）----
  box(faces, 1.2, 1.2, 14.8, 14.8, 0, 0.45, {
    right: pWall(P.ASPH), left: pWall(P.ASPH), top: () => cell(P.ASPH, 1),
  });
  // ---- 校舍（北侧：两层红砖 + 大窗，夜里书香灯亮）----
  box(faces, 2.4, 2.2, 13.6, 9.4, 0.45, 7.8, {
    right: pWindows(P.BRICK, { seed, lit: 0.45, floorH: 3.5, gapX: 3.4, winH: 1.8, winW: 1.7 }),
    left: pWindows(P.BRICK, { seed: seed ^ 3, lit: 0.45, floorH: 3.5, gapX: 3.4, winH: 1.8, winW: 1.7, door: true, doorW: 2.6 }),
  });
  gableRoof(faces, 1.8, 1.6, 14.2, 10.0, 7.7, 10.6, 'x', {
    front: pShingle(roof), back: pShingle(roof), endX: pWall(P.CREAM),
  });
  // ---- 山墙小校钟（白圆钟意象 + 深色指针）----
  box(faces, 7.0, 9.4, 9.0, 10.1, 8.0, 9.9, {
    left: (u, v, px, py) =>
      Math.abs(u - 8) < 0.55 || (Math.abs(u - 8.6) < 0.45 && v > 5.4)
        ? cell(P.OUTLINE, 0) : cell(P.WHITE, 0),
    right: pWall(P.CREAM),
  });
  // ---- 旗杆（操场东南角，红领巾的旗）----
  flagPole(faces, 12.6, 12.4, 10, P.RED);
  // ---- 滑梯（操场西南角：青漆爬架 + 黄斜板 —— 下课铃一响就排队）----
  box(faces, 3.0, 11.6, 4.4, 13.0, 0.45, 2.5, {
    right: pWall(P.CYAN), left: pWall(P.CYAN), top: () => cell(P.CYAN, 0),
  });
  box(faces, 4.4, 12.2, 6.6, 13.3, 0.45, 2.3, {
    top: pWall(P.YELLOW), right: pWall(P.YELLOW),
  });
  return { model: buildModel(faces, 16, 16) };
}

/** 大学城（3×3，LV8，v22 教育空间化）：拱门主楼 + 钟塔 + 青绿穹顶图书馆 +
 *  红砖学院翼 + 中央绿茵庭院 —— 半径 8 格学区的智慧引擎
 *  （教育 +80 · 科技点 +3/分；需研究「高等教育」） */
export function genUniversity(seed: number): BuildResult {
  const faces: Face[] = [];
  // ---- 中央主楼（北侧横贯东西：米色石墙 + 两排大窗）----
  box(faces, 6, 5, 42, 16, 0, 13, {
    right: pWindows(P.CREAM, { seed: seed ^ 5, lit: 0.5, floorH: 4.4, gapX: 3.8, winH: 2.4, winW: 2.1 }),
    left: pWindows(P.CREAM, { seed, lit: 0.5, floorH: 4.4, gapX: 3.8, winH: 2.4, winW: 2.1, door: true, doorW: 5 }),
  });
  gableRoof(faces, 5, 4, 43, 17, 13, 18, 'x', {
    front: pShingle(P.RFSLATE), back: pShingle(P.RFSLATE), endX: pWall(P.CREAM),
  });
  // ---- 中央大拱门（+Y 正面：石拱框 + 深色门洞 —— 毕业照的必拍地）----
  box(faces, 19.6, 15.6, 28.4, 18.6, 0, 9.8, {
    right: pStone(P.CREAM), left: pStone(P.CREAM), top: pStone(P.CREAM),
  });
  box(faces, 21.2, 16.4, 26.8, 18.4, 0, 7.2, {
    right: pWall(P.OUTLINE), left: () => cell(P.OUTLINE, 0),
  });
  // ---- 钟塔（主楼中央拔高：四面白钟 + 石板尖顶）----
  box(faces, 21, 20, 27, 26, 13, 26.5, {
    right: pWall(P.CREAM), left: pWall(P.CREAM),
  });
  box(faces, 21.9, 25.7, 26.1, 26.8, 20.2, 24.2, {
    left: (u, v, px, py) =>
      Math.abs(u - 24) < 0.5 || (Math.abs(u - 24.7) < 0.4 && v > 4)
        ? cell(P.OUTLINE, 0) : cell(P.WHITE, 0),
  });
  pyramid(faces, 20.3, 19.3, 27.7, 26.7, 26.5, 31.5, pShingle(P.RFSLATE));
  box(faces, 23.6, 19.6, 24.4, 20.4, 31.5, 32.8, {
    right: pWall(P.METAL), left: pWall(P.METAL), top: () => cell(P.LAMP, 0),
  });
  // ---- 西翼图书馆（青绿穹顶 + 拱窗长廊）----
  box(faces, 6, 20, 18, 32, 0, 10, {
    right: pWindows(P.CREAM, { seed: seed ^ 9, lit: 0.55, floorH: 4.2, gapX: 3.6, winH: 2.4, winW: 1.9 }),
    left: pWindows(P.CREAM, { seed: seed ^ 12, lit: 0.55, floorH: 4.2, gapX: 3.6, winH: 2.4, winW: 1.9 }),
  });
  frustum(faces, 12, 26, 6.6, 5.2, 10, 14.5, {
    side: (u, v, px, py) => bayer(px, py, 0.14) ? cell(P.RFTEAL, 1) : cell(P.RFTEAL, 0),
  }, 10);
  frustum(faces, 12, 26, 5.2, 2.4, 14.5, 17.5, {
    side: (u, v, px, py) => bayer(px, py, 0.14) ? cell(P.RFTEAL, 1) : cell(P.RFTEAL, 0),
    top: () => cell(P.METAL, 1),
  }, 10);
  // ---- 东翼红砖讲堂（双坡红瓦 + 山花）----
  box(faces, 30, 20, 42, 32, 0, 10, {
    right: pWindows(P.BRICK, { seed: seed ^ 21, lit: 0.5, floorH: 4.2, gapX: 3.6, winH: 2.4, winW: 1.9 }),
    left: pWindows(P.BRICK, { seed: seed ^ 25, lit: 0.5, floorH: 4.2, gapX: 3.6, winH: 2.4, winW: 1.9 }),
  });
  gableRoof(faces, 29.4, 19.4, 42.6, 32.6, 10, 14.2, 'y', {
    front: pShingle(P.RFRED), back: pShingle(P.RFRED), endY: pWall(P.CREAM),
  });
  // ---- 中央绿茵庭院（草坪 + 十字石板步道 + 日晷 + 旗杆）----
  box(faces, 6, 19, 42, 42, 0, 0.35, {
    right: () => cell(P.GRASS, 1), left: () => cell(P.GRASS, 1), top: () => cell(P.GRASS, 1),
  });
  box(faces, 6, 29.2, 42, 31.2, 0.35, 0.85, {   // 横步道
    right: pStone(P.SIDE), left: pStone(P.SIDE), top: pStone(P.SIDE),
  });
  box(faces, 22.8, 19, 24.8, 42, 0.35, 0.85, {   // 纵步道
    right: pStone(P.SIDE), left: pStone(P.SIDE), top: pStone(P.SIDE),
  });
  // 日晷（步道交汇处：石座 + 斜晷针）
  box(faces, 23.2, 29.6, 24.4, 30.8, 0.85, 2.2, {
    right: pStone(P.CREAM), left: pStone(P.CREAM), top: () => cell(P.CREAM, 0),
  });
  box(faces, 23.5, 29.9, 24.1, 30.5, 2.2, 3.4, {
    right: pWall(P.METAL), left: pWall(P.METAL),
  });
  // 旗杆 ×2（庭院南北）
  flagPole(faces, 8.5, 39, 11, P.RED);
  flagPole(faces, 39.5, 39, 11, P.CYAN);
  return { model: buildModel(faces, 48, 48) };
}
