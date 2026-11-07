// ============================================================
// b_dusk.ts — 夜色建筑包（第四批 14 类 24 变体）：
//   住宅：高层公寓(2×2) / 长屋 / 民宿旅馆
//   商业：电器街 / 摩天轮(2×2) / 烘焙坊 / 加油站 / 渡轮码头(2×2)
//   工业：风车磨坊 / 温室大棚 / 酿造厂
//   公共：凉亭 / 水族馆(2×2) / 通信基站
// 大量使用 GLASS（夜光窗）与 NEONR/NEONC（霓虹）ramp，
// 与昼夜系统的夜光渲染管线配合。
// ============================================================

import {
  box, gableRoof, hipRoof, frustum, cone, prism, pyramid, makeFace,
  buildModel, type Face, type V3,
} from './geo';
import {
  pWall, pWindows, pGlassCurtain, pFlatRoof, pShingle, pStone,
  pLattice, pBands, pSign, pAwning, cell,
} from './patterns';
import { RAMP, bayer } from './palette';
import { mulberry32, pick } from './rng';
import {
  roofDeck, chimney, waterTank, acUnit, antenna, flagPole,
  type BuildResult,
} from './b_util';

const P = RAMP;

// ============================================================
// 住宅
// ============================================================

/** 高层公寓（2×2）：双塔玻璃住宅 + 裙房（夜光窗海） */
export function genHiapart(seed: number): BuildResult {
  const r = mulberry32(seed);
  const hA = 40 + Math.floor(r() * 10);      // 主塔 40-49
  const hB = 26 + Math.floor(r() * 8);       // 副塔 26-33
  const faces: Face[] = [];
  // 裙房
  box(faces, 2, 2, 30, 30, 0, 7, {
    right: pWindows(P.CREAM, { seed, lit: 0.2, floorH: 6.4, gapX: 3.6 }),
    left: pWindows(P.CREAM, { seed: seed ^ 3, lit: 0.2, floorH: 6.4, gapX: 3.6, door: true }),
    top: pFlatRoof(P.ASPH, 4),
  });
  // 主塔（玻璃幕墙）
  box(faces, 4, 4, 16, 16, 7, hA, {
    right: pGlassCurtain(seed, P.GLASS),
    left: pGlassCurtain(seed ^ 5, P.GLASS),
  });
  // 副塔
  box(faces, 18, 18, 28, 28, 7, hB, {
    right: pGlassCurtain(seed ^ 9, P.GLASS),
    left: pGlassCurtain(seed ^ 11, P.GLASS),
  });
  roofDeck(faces, 4, 4, 16, 16, hA, P.ASPH);
  roofDeck(faces, 18, 18, 28, 28, hB, P.ASPH);
  waterTank(faces, 8, 8, hA + 2, hA + 6);
  acUnit(faces, 12, 12, hA + 2, 3);
  acUnit(faces, 22, 22, hB + 2, 2.6);
  antenna(faces, 26, 24, hB + 2, hB + 2 + 6);
  return { model: buildModel(faces, 32, 32) };
}

/** 长屋（1×1）：三户联排木长屋，连续瓦顶与檐下灯笼 */
export function genNagaya(seed: number): BuildResult {
  const r = mulberry32(seed);
  const wood = pick([P.DIRT, P.TAN, P.CREAM], r());
  const roof = pick([P.RFSLATE, P.RFGRAY, P.RFRED], r());
  const faces: Face[] = [];
  const x0 = 1.6, y0 = 3.0, x1 = 14.4, y1 = 13.0;
  const h = 8.4;
  box(faces, x0, y0, x1, y1, 0, h, {
    right: pWindows(wood, { seed, lit: 0.34, floorH: 6.4, gapX: 2.2, winW: 1.4, winH: 2 }),
    left: pWindows(wood, { seed: seed ^ 7, lit: 0.34, floorH: 6.4, gapX: 2.2, winW: 1.4, winH: 2, door: true, doorW: 2.4 }),
  });
  // 连续大瓦顶（脊沿 X）
  gableRoof(faces, x0 - 1.4, y0 - 1.8, x1 + 1.4, y1 + 1.8, h - 0.6, h + 5.6, 'x', {
    front: pShingle(roof), back: pShingle(roof), endX: pWall(wood), endY: pWall(wood),
  });
  // 两盏檐下灯笼（+Y 门侧，夜光红）
  for (const lx of [x0 + 2.2, x1 - 3.4]) {
    box(faces, lx, y1 + 0.5, lx + 1.3, y1 + 1.8, 4.2, 5.6, {
      left: pWall(P.NEONR), right: pWall(P.NEONR), top: () => cell(P.YELLOW, 0),
    });
  }
  return { model: buildModel(faces, 16, 16) };
}

/** 民宿旅馆（1×1）：两层小旅馆，门廊红灯笼与青霓虹招牌 */
export function genMinshuku(seed: number): BuildResult {
  const r = mulberry32(seed);
  const wall = pick([P.CREAM, P.TAN], r());
  const faces: Face[] = [];
  const x0 = 2.4, y0 = 2.4, x1 = 13.6, y1 = 13.6;
  const h = 13.5;
  box(faces, x0, y0, x1, y1, 0, h, {
    right: pWindows(wall, { seed, lit: 0.4, floorH: 6.2, gapX: 3.0, winW: 2, winH: 2 }),
    left: pWindows(wall, { seed: seed ^ 7, lit: 0.4, floorH: 6.2, gapX: 3.0, winW: 2, winH: 2, door: true }),
  });
  roofDeck(faces, x0, y0, x1, y1, h, P.RFSLATE, pWall(wall));
  // 门廊：台阶 + 双灯笼
  box(faces, x0 + 3.2, y1 + 0.2, x1 - 3.2, y1 + 1.5, 0, 1.2, {
    top: pStone(P.SIDE), right: pWall(P.SIDE), left: pWall(P.SIDE),
  });
  for (const lx of [x0 + 2.4, x1 - 3.4]) {
    box(faces, lx, y1 + 0.6, lx + 1.3, y1 + 1.9, 5.2, 6.8, {
      left: pWall(P.NEONR), right: pWall(P.NEONR), top: () => cell(P.YELLOW, 0),
    });
  }
  // 竖式青霓虹招牌（+X）
  box(faces, x1, y0 + 3.2, x1 + 1.3, y1 - 3.2, 4.4, 10.4, {
    right: pSign(P.NEONC, seed), top: () => cell(P.WHITE, 0),
  });
  acUnit(faces, x0 + 2, y0 + 2, h + 3.2, 2.2);
  return { model: buildModel(faces, 16, 16) };
}

// ============================================================
// 商业
// ============================================================

/** 电器街（1×1）：层叠霓虹招牌的数码商店（夜间三色辉光） */
export function genElectown(seed: number): BuildResult {
  const r = mulberry32(seed);
  const wall = pick([P.BRICK, P.PBLUE, P.TAN], r());
  const faces: Face[] = [];
  const x0 = 3.0, y0 = 2.8, x1 = 13.0, y1 = 13.2;
  const h = 17;
  box(faces, x0, y0, x1, y1, 0, h, {
    right: pWindows(wall, { seed, lit: 0.3, floorH: 5.8, gapX: 2.8, winW: 2, winH: 2 }),
    left: pWindows(wall, { seed: seed ^ 3, lit: 0.3, floorH: 5.8, gapX: 2.8, winW: 2, winH: 2, door: true }),
  });
  roofDeck(faces, x0, y0, x1, y1, h, P.RFGRAY, pWall(wall));
  // +Y 面层叠霓虹（青 / 红 / 黄）
  box(faces, x0 + 1.2, y1 + 0.3, x1 - 1.2, y1 + 1.5, 12.2, 15.8, {
    left: pSign(P.NEONC, seed), right: pWall(P.METAL),
  });
  box(faces, x0 + 1.2, y1 + 0.3, x1 - 1.2, y1 + 1.5, 8.0, 11.6, {
    left: pSign(P.NEONR, seed ^ 5), right: pWall(P.METAL),
  });
  box(faces, x0 + 1.2, y1 + 0.3, x1 - 1.2, y1 + 1.5, 3.8, 7.4, {
    left: pSign(P.YELLOW, seed ^ 9), right: pWall(P.METAL),
  });
  // +X 面竖霓虹
  box(faces, x1, y0 + 2.0, x1 + 1.3, y1 - 2.0, 4.0, 14.0, {
    right: pSign(P.NEONC, seed ^ 7), top: () => cell(P.WHITE, 0),
  });
  // 地面橱窗
  box(faces, x0 + 0.2, y1 + 0.1, x1 - 0.2, y1 + 0.9, 0, 3.2, {
    left: (u, v, px, py) => (bayer(px, py, 0.3) ? cell(P.GLASS, 0) : cell(P.GLASS, 1)),
  });
  antenna(faces, x0 + 2, y0 + 2, h + 3.2, h + 3.2 + 6);
  return { model: buildModel(faces, 16, 16) };
}

/** 摩天轮（2×2）：青霓虹轮缘 + 八座暖光吊舱 */
export function genFerris(_seed: number): BuildResult {
  const faces: Face[] = [];
  const cx = 16, cy = 16.3, cz = 20;   // 轮心（X-Z 竖直平面）
  // 支腿（对角）
  box(faces, 5.5, 5.5, 7.2, 7.2, 0, 19.5, { right: pWall(P.METAL), left: pWall(P.METAL) });
  box(faces, 24.8, 24.8, 26.5, 26.5, 0, 19.5, { right: pWall(P.METAL), left: pWall(P.METAL) });
  // 轮辋（12 段，后侧段翻转法线保证可见）
  const R_O = 12.4, R_I = 10.6;
  for (let i = 0; i < 12; i++) {
    const t0 = (i / 12) * Math.PI * 2;
    const t1 = ((i + 1) / 12) * Math.PI * 2;
    const tm = (t0 + t1) / 2;
    const front = Math.cos(tm) + Math.sin(tm) > 0;
    const sg = front ? 1 : -1;
    const o = [cx, cy, cz] as V3;
    faces.push(makeFace(
      [
        [cx + R_I * Math.cos(t0), cy, cz + R_I * Math.sin(t0)],
        [cx + R_O * Math.cos(t0), cy, cz + R_O * Math.sin(t0)],
        [cx + R_O * Math.cos(t1), cy, cz + R_O * Math.sin(t1)],
        [cx + R_I * Math.cos(t1), cy, cz + R_I * Math.sin(t1)],
      ],
      [sg * Math.cos(tm), 0, sg * Math.sin(tm)],
      pWall(P.NEONC),
      o,
      [Math.cos(tm), 0, Math.sin(tm)],
      [-Math.sin(tm), 0, Math.cos(tm)],
    ));
  }
  // 轮辐 ×4（后侧翻转）
  for (const th of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) {
    const c = Math.cos(th), s = Math.sin(th);
    const front = c + s > 0;
    const sg = front ? 1 : -1;
    const pR = (R: number, w: number): V3 => [
      cx + R * c - w * s, cy, cz + R * s + w * c,
    ];
    faces.push(makeFace(
      [pR(2.0, 0.6), pR(10.8, 0.9), pR(10.8, -0.9), pR(2.0, -0.6)],
      [sg * c, 0, sg * s],
      pWall(P.METAL),
      [cx, cy, cz],
      [c, 0, s],
      [-s, 0, c],
    ));
  }
  // 轮毂
  box(faces, 14.9, 14.6, 17.1, 18.0, 18.6, 21.4, {
    right: pWall(P.METAL), left: pWall(P.METAL), top: () => cell(P.RED, 0),
  });
  // 八座吊舱（暖光，夜光黄）
  for (let k = 0; k < 8; k++) {
    const th = (k / 8) * Math.PI * 2;
    const px = cx + 12.4 * Math.cos(th);
    const pz = cz + 12.4 * Math.sin(th);
    box(faces, px - 1.5, 14.6, px + 1.5, 17.4, pz - 4.2, pz - 0.8, {
      right: pWall(P.YELLOW), left: pWall(P.YELLOW),
      top: pFlatRoof(P.RFRED, 2),
    });
  }
  const blinkAt: V3 = [16, 16, 21.4];
  return { model: buildModel(faces, 32, 32), blinkAt };
}

/** 烘焙坊（1×1）：暖光橱窗 + 条纹雨棚 */
export function genBakery(seed: number): BuildResult {
  const r = mulberry32(seed);
  const wall = pick([P.CREAM, P.TAN], r());
  const awn = r() < 0.5 ? P.RED : P.RFTEAL;
  const faces: Face[] = [];
  const x0 = 2.6, y0 = 2.6, x1 = 13.4, y1 = 13.4;
  const h = 10.5;
  box(faces, x0, y0, x1, y1, 0, h, {
    right: pWindows(wall, { seed, lit: 0.5, floorH: 5.6, gapX: 3.0, winW: 2.4, winH: 2.4 }),
    left: pWindows(wall, { seed: seed ^ 3, lit: 0.5, floorH: 5.6, gapX: 3.0, winW: 2.4, winH: 2.4, door: true }),
  });
  // 大出檐坡顶
  hipRoof(faces, x0 - 1.2, y0 - 1.2, x1 + 1.2, y1 + 1.2, h - 0.4, h + 5.2, 0.62, {
    slope: pShingle(P.RFRED),
  });
  // 雨棚（+Y 门面）
  box(faces, x0 + 1.2, y1 + 0.2, x1 - 1.2, y1 + 2.6, 4.6, 6.4, {
    left: pAwning(awn), right: pAwning(awn), top: pWall(P.WHITE),
  });
  // 面包招牌（+X）
  box(faces, x1, y0 + 2.2, x1 + 1.1, y1 - 2.2, 5.4, 8.2, {
    right: pSign(P.PAINTY, seed), top: () => cell(P.WHITE, 0),
  });
  // 街边长椅
  box(faces, x0 - 1.6, y0 + 6.5, x0 - 0.4, y0 + 9.5, 0, 2.2, {
    top: pWall(P.DIRT), right: pWall(P.DIRT), left: pWall(P.DIRT),
  });
  return { model: buildModel(faces, 16, 16) };
}

/** 加油站（1×1）：红条雨棚 + 双泵 + 价目牌 */
export function genGas(seed: number): BuildResult {
  const r = mulberry32(seed);
  const faces: Face[] = [];
  // 铺装地面
  box(faces, 1.2, 1.2, 14.8, 14.8, 0, 0.8, {
    top: pFlatRoof(P.ASPH, 7), right: pWall(P.SIDE), left: pWall(P.SIDE),
  });
  // 立柱 ×4
  for (const [px, py] of [[3, 3], [3, 12.4], [12.4, 3], [12.4, 12.4]] as const) {
    box(faces, px, py, px + 1.2, py + 1.2, 0.8, 8.4, {
      right: pWall(P.METAL), left: pWall(P.METAL),
    });
  }
  // 雨棚（红白横条）
  box(faces, 1.8, 1.8, 14.2, 14.2, 8.4, 10.6, {
    top: pFlatRoof(P.RFRED, 3),
    right: pBands(P.RED, 3), left: pBands(P.RED, 3),
  });
  // 雨棚下灯（夜光黄点 ×2）
  box(faces, 6.2, 6.2, 7.0, 7.0, 8.0, 8.4, { top: () => cell(P.YELLOW, 0) });
  box(faces, 9.0, 9.0, 9.8, 9.8, 8.0, 8.4, { top: () => cell(P.YELLOW, 0) });
  // 加油泵 ×2
  for (const px of [5.6, 9.6]) {
    box(faces, px, 6.6, px + 2.0, 9.4, 0.8, 4.6, {
      right: pBands(P.CREAM, 3), left: pBands(P.CREAM, 3),
      top: () => cell(P.YELLOW, 0),
    });
  }
  // 价目牌塔（+Y 角）
  box(faces, 1.4, 14.9, 2.6, 15.9, 0, 7.5, {
    right: pSign(P.PAINTY, seed), left: pSign(P.PAINTY, seed ^ 3),
    top: () => cell(P.RED, 0),
  });
  void r;
  return { model: buildModel(faces, 16, 16) };
}

/** 渡轮码头（2×2）：混凝土栈桥 + 候船楼 + 靠泊渡轮 */
export function genFerry(_seed: number): BuildResult {
  const faces: Face[] = [];
  // 栈桥（+Y 半区）
  box(faces, 1.5, 1.5, 30.5, 13.5, 0, 2.0, {
    top: pFlatRoof(P.SIDE, 5), right: pWall(P.SIDE), left: pWall(P.SIDE),
  });
  // 安全黄线（+Y 缘）
  box(faces, 2.0, 12.6, 30.0, 13.4, 2.0, 2.5, {
    top: () => cell(P.PAINTY, 0), right: pWall(P.PAINTY), left: pWall(P.PAINTY),
  });
  // 候船楼（玻璃 + 米白）
  box(faces, 3.0, 2.2, 14.0, 11.5, 2.0, 10.5, {
    right: pGlassCurtain(11, P.GLASS),
    left: pGlassCurtain(23, P.GLASS),
  });
  roofDeck(faces, 3.0, 2.2, 14.0, 11.5, 10.5, P.ASPH, pWall(P.CREAM));
  flagPole(faces, 4.2, 12.6, 15.5, P.CYAN);
  // 系船柱 ×4
  for (const bx of [4, 15, 26, 28.5]) {
    box(faces, bx, 13.0, bx + 1.2, 14.2, 2.0, 4.0, {
      right: pWall(P.METAL), left: pWall(P.METAL), top: () => cell(P.METAL, 1),
    });
  }
  // 渡轮（-Y 半区）
  box(faces, 17.0, 3.0, 29.5, 13.0, 0, 3.8, {
    right: pWall(P.WHITE), left: pWall(P.WHITE),
    top: pBands(P.RED, 4.5),
  });
  box(faces, 19.5, 5.0, 27.5, 11.0, 3.8, 9.0, {
    right: pWindows(P.WHITE, { seed: 7, lit: 0.6, floorH: 5.4, gapX: 3.2, winW: 2, winH: 2 }),
    left: pWindows(P.WHITE, { seed: 13, lit: 0.6, floorH: 5.4, gapX: 3.2, winW: 2, winH: 2 }),
    top: pFlatRoof(P.PBLUE, 2),
  });
  // 烟囱 + 烟
  prism(faces, 23.5, 8, 1.8, 9.0, 12.6, {
    side: pBands(P.RED, 3), top: () => cell(P.OUTLINE, 0),
  }, 8);
  const smokeAt: V3 = [23.5, 8, 12.6];
  // 救生圈挂饰（+X 舷侧）
  box(faces, 29.3, 6.4, 29.9, 8.4, 5.2, 7.0, {
    right: pWall(P.RED), left: pWall(P.WHITE),
  });
  return { model: buildModel(faces, 32, 32), smokeAt };
}

// ============================================================
// 工业
// ============================================================

/** 风车磨坊（1×1）：石塔 + 红帽 + 四叶 */
export function genWindmill(seed: number): BuildResult {
  const r = mulberry32(seed);
  const stone = pick([P.SIDE, P.CREAM, P.TAN], r());
  const cap = r() < 0.5 ? P.RFRED : P.RFSLATE;
  const rot = r() < 0.5 ? 0 : Math.PI / 4;   // 叶片两种相位
  const faces: Face[] = [];
  // 石塔
  frustum(faces, 8, 8, 4.8, 3.4, 0, 13, {
    side: pStone(stone),
  }, 8);
  // 木帽（锥）
  cone(faces, 8, 8, 4.2, 13, 17.2, (u, v, px, py) => pShingle(cap)(u, v, px, py), 8);
  // 门与窗（夜光暖窗）
  box(faces, 6.8, 12.6, 9.2, 13.3, 0, 4.6, {
    left: (u, v, px, py) => (u > 1 && u < 3 && v > 1 && v < 4 ? cell(P.DIRT, 1) : pStone(stone)(u, v, px, py)),
  });
  box(faces, 12.2, 5.4, 13.3, 6.6, 6.5, 8.6, {
    right: (u, v, px, py) => (u > 0.8 && u < 2.6 && v > 0.8 && v < 2.8 ? cell(P.GLASS, 0) : pWall(stone)(u, v, px, py)),
  });
  // 四叶（X-Z 竖面朝 +Y，后叶翻法线）
  for (let k = 0; k < 4; k++) {
    const th = rot + k * Math.PI / 2;
    const c = Math.cos(th), s = Math.sin(th);
    const front = c + s > 0;
    const sg = front ? 1 : -1;
    const pR = (R: number, w: number): V3 => [8 + R * c - w * s, 15.2, 15.5 + R * s + w * c];
    faces.push(makeFace(
      [pR(2.2, 0.5), pR(10.2, 1.0), pR(10.2, -1.0), pR(2.2, -0.5)],
      [sg * c, 0, sg * s],
      pWall(P.TAN),
      [8, 15.2, 15.5],
      [c, 0, s],
      [-s, 0, c],
    ));
  }
  // 轴心
  box(faces, 7.2, 14.6, 8.8, 15.8, 14.6, 16.4, {
    right: pWall(P.METAL), left: pWall(P.METAL), top: () => cell(P.YELLOW, 0),
  });
  return { model: buildModel(faces, 16, 16) };
}

/** 温室大棚（1×1）：玻璃墙顶 + 内部苗床（夜间植物灯） */
export function genGreenhouse(seed: number): BuildResult {
  const r = mulberry32(seed);
  const faces: Face[] = [];
  const x0 = 1.8, y0 = 1.8, x1 = 14.2, y1 = 14.2;
  const h = 9.5;
  // 玻璃主体
  box(faces, x0, y0, x1, y1, 0, h, {
    right: pGlassCurtain(seed, P.GLASS),
    left: pGlassCurtain(seed ^ 5, P.GLASS),
    top: (u, v, px, py) => (bayer(px, py, 0.22) ? cell(P.GLASS, 0) : cell(P.GLASS, 1)),
  });
  // 白色框架脊
  box(faces, 7.4, y0 - 0.4, 8.6, y1 + 0.4, h, h + 1.4, {
    top: pWall(P.WHITE), right: pWall(P.WHITE), left: pWall(P.WHITE),
  });
  for (const px of [x0, 4.6, 11.4, x1]) {
    box(faces, px - 0.4, y0 - 0.4, px + 0.4, y1 + 0.4, 0, h, {
      top: pWall(P.WHITE), right: pWall(P.WHITE), left: pWall(P.WHITE),
    });
  }
  // 内部苗床（隔着玻璃可见）
  for (const by of [4.5, 9.0]) {
    box(faces, 2.6, by, 13.4, by + 2.4, 0, 3.4, {
      top: (u, v, px, py) => (hash1(u, v, seed) ? cell(P.LEAF, 1) : cell(P.LEAF, 2)),
      right: pWall(P.DIRT), left: pWall(P.DIRT),
    });
  }
  void r;
  return { model: buildModel(faces, 16, 16) };
}

function hash1(u: number, v: number, seed: number): boolean {
  return ((Math.floor(u * 7.3) * 31 + Math.floor(v * 5.1) * 17 + seed) % 10) < 6;
}

/** 酿造厂（1×1）：铜釜蒸汽 + 砖房 + 竖招牌 */
export function genBrewery(seed: number): BuildResult {
  const r = mulberry32(seed);
  const wall = r() < 0.5 ? P.BRICK : P.TAN;
  const faces: Face[] = [];
  // 砖房
  box(faces, 1.8, 2.2, 10.2, 13.8, 0, 9.5, {
    right: pWindows(wall, { seed, lit: 0.35, floorH: 6, gapX: 3, winW: 2, winH: 2 }),
    left: pWindows(wall, { seed: seed ^ 3, lit: 0.35, floorH: 6, gapX: 3, winW: 2, winH: 2, door: true }),
  });
  roofDeck(faces, 1.8, 2.2, 10.2, 13.8, 9.5, P.RFGRAY, pWall(wall));
  chimney(faces, 8.4, 4.0, 9.5, 14.5, 2.0);
  const smokeAt: V3 = [9.4, 5.0, 14.5];
  // 铜釜 ×2
  for (const kx of [11.6, 14.0]) {
    prism(faces, kx, 8, 2.1, 0, 6.8, {
      side: (u, v, px, py) => (bayer(px, py, 0.18) ? cell(P.TAN, 0) : cell(P.TAN, 1)),
      top: pFlatRoof(P.METAL, 6),
    }, 8);
  }
  // 竖招牌（+Y）
  box(faces, 3.0, 13.9, 9.0, 15.1, 5.2, 8.2, {
    left: pSign(P.PAINTY, seed ^ 11), right: pWall(P.CREAM), top: () => cell(P.WHITE, 0),
  });
  return { model: buildModel(faces, 16, 16), smokeAt };
}

// ============================================================
// 公共
// ============================================================

/** 凉亭（1×1）：石基 + 六柱 + 大歇山顶 + 挂灯 */
export function genPavilion(seed: number): BuildResult {
  const r = mulberry32(seed);
  const roof = r() < 0.5 ? P.RFTEAL : P.RFSLATE;
  const faces: Face[] = [];
  // 石基
  box(faces, 1.4, 1.4, 14.6, 14.6, 0, 1.8, {
    top: pStone(P.SIDE), right: pWall(P.SIDE), left: pWall(P.SIDE),
  });
  // 柱 ×4（角）+ 2（中）
  const cols: Array<[number, number]> = [
    [3.0, 3.0], [12.4, 3.0], [3.0, 12.4], [12.4, 12.4], [7.7, 3.0], [7.7, 12.4],
  ];
  for (const [px, py] of cols) {
    box(faces, px, py, px + 1.2, py + 1.2, 1.8, 10.2, {
      right: pWall(P.CREAM), left: pWall(P.CREAM),
    });
  }
  // 大屋檐（歇山）
  hipRoof(faces, 0.6, 0.6, 15.4, 15.4, 9.8, 16.6, 0.62, {
    slope: pShingle(roof),
  });
  // 挂灯 ×2（+Y 檐角，夜光红）
  for (const lx of [4.2, 11.2]) {
    box(faces, lx, 14.8, lx + 1.2, 16.0, 7.2, 8.6, {
      left: pWall(P.NEONR), right: pWall(P.NEONR), top: () => cell(P.YELLOW, 0),
    });
  }
  // 石凳
  box(faces, 4.5, 7.0, 8.0, 9.0, 1.8, 3.2, {
    top: pWall(P.SIDE), right: pWall(P.SIDE), left: pWall(P.SIDE),
  });
  return { model: buildModel(faces, 16, 16) };
}

/** 水族馆（2×2）：玻璃幕墙主馆 + 圆穹角塔（夜间整面亮灯） */
export function genAquarium(seed: number): BuildResult {
  const faces: Face[] = [];
  // 主馆
  box(faces, 2, 2, 30, 21, 0, 14, {
    right: pGlassCurtain(seed, P.GLASS),
    left: pGlassCurtain(seed ^ 5, P.GLASS),
  });
  roofDeck(faces, 2, 2, 30, 21, 14, P.PBLUE, pWall(P.WHITE));
  // 白色框架柱
  for (const px of [2, 8, 15, 22, 30]) {
    box(faces, px - 0.4, 1.6, px + 0.4, 21.4, 0, 14, {
      top: pWall(P.WHITE), right: pWall(P.WHITE), left: pWall(P.WHITE),
    });
  }
  // 入口（+Y 中央）
  box(faces, 12, 21.1, 20, 22.8, 0, 7, {
    left: (u, v, px, py) => (bayer(px, py, 0.3) ? cell(P.GLASS, 0) : cell(P.GLASS, 1)),
    right: pWall(P.WHITE), top: pBands(P.CYAN, 4),
  });
  // 角塔 + 穹顶
  box(faces, 23.5, 23.5, 30, 30, 0, 20, {
    right: pWindows(P.PBLUE, { seed: seed ^ 9, lit: 0.4, floorH: 6, gapX: 3.4, winW: 2, winH: 2 }),
    left: pWindows(P.PBLUE, { seed: seed ^ 13, lit: 0.4, floorH: 6, gapX: 3.4, winW: 2, winH: 2 }),
  });
  frustum(faces, 26.8, 26.8, 4.6, 3.4, 20, 24.5, {
    side: (u, v, px, py) => (bayer(px, py, 0.25) ? cell(P.GLASS, 0) : cell(P.GLASS, 1)),
    top: () => cell(P.CYAN, 0),
  }, 8);
  // 鲸鱼尾雕塑（前广场）
  box(faces, 6, 24.5, 9, 28.5, 0, 3.2, {
    top: pWall(P.PBLUE), right: pWall(P.PBLUE), left: pWall(P.PBLUE),
  });
  box(faces, 6.8, 25.3, 8.2, 27.7, 3.2, 7.4, {
    top: pWall(P.PBLUE), right: pWall(P.PBLUE), left: pWall(P.PBLUE),
  });
  return { model: buildModel(faces, 32, 32) };
}

/** 通信基站（1×1）：格构塔 + 抛物面 + 红色航标 */
export function genCellmast(seed: number): BuildResult {
  const r = mulberry32(seed);
  const h = r() < 0.5 ? 26 : 30;
  const faces: Face[] = [];
  frustum(faces, 8, 8, 3.0, 1.0, 0, h, {
    side: pLattice(), top: pFlatRoof(P.METAL, 3),
  }, 8);
  // 平台
  box(faces, 6.4, 6.4, 9.6, 9.6, h - 6, h - 4.6, {
    top: pFlatRoof(P.METAL, 5), right: pWall(P.METAL), left: pWall(P.METAL),
  });
  // 抛物面 ×2
  box(faces, 9.6, 6.8, 12.4, 9.2, h - 9.5, h - 6.4, {
    right: pWall(P.WHITE), left: pWall(P.WHITE), top: () => cell(P.WHITE, 0),
  });
  box(faces, 4.6, 10.4, 6.4, 12.0, h - 8.6, h - 6.2, {
    left: pWall(P.WHITE), top: () => cell(P.WHITE, 0),
  });
  // 顶端航标（闪烁）
  box(faces, 7.5, 7.5, 8.5, 8.5, h, h + 4, {
    right: pWall(P.METAL), left: pWall(P.METAL),
  });
  const blinkAt: V3 = [8, 8, h + 4];
  // 围栏基座
  box(faces, 4.5, 4.5, 11.5, 11.5, 0, 1.0, {
    top: pWall(P.SIDE), right: pWall(P.SIDE), left: pWall(P.SIDE),
  });
  return { model: buildModel(faces, 16, 16), blinkAt };
}

// ============================================================
// v31 都会名片：大剧院 / 会展中心（3×3 地标双塔）
//   大剧院 —— 金穹顶 + 柱廊山花 + 红毯大台阶（文化街区核心）
//   会展中心 —— 玻璃拱棚展馆 + 万国旗广场（节庆引擎）
// ============================================================

/** 大剧院（3×3）：金穹顶与柱廊山花的都会名片 */
export function genOpera(seed: number): BuildResult {
  const r = mulberry32(seed);
  const lit = 0.4 + r() * 0.2;
  const faces: Face[] = [];
  // 石砌台基（三步大台阶沿 +Y 展开到门前广场）
  box(faces, 2, 2, 46, 30, 0, 2, {
    right: pStone(P.SIDE), left: pStone(P.SIDE), top: pWall(P.TAN),
  });
  // 主体：奶油石墙 + 两排高拱窗（幕布般的开闭）
  box(faces, 6, 6, 42, 26, 2, 15, {
    right: pWindows(P.CREAM, { seed, lit, floorH: 6.5, gapX: 4.4, winH: 3.8, winW: 2.8 }),
    left: pWindows(P.CREAM, { seed: seed ^ 5, lit, floorH: 6.5, gapX: 4.4, winH: 3.8, winW: 2.8 }),
  });
  roofDeck(faces, 6, 6, 42, 26, 15, P.TAN, pWall(P.CREAM));
  // 金色叠层穹顶（中央舞台上方：青灰鼓座 → 金光鼓身 → 鎏金顶饰）
  frustum(faces, 24, 15, 8.6, 7.4, 15, 19.5, { side: pWall(P.SIDE), top: pWall(P.SIDE) }, 10);
  frustum(faces, 24, 15, 7.4, 4.8, 19.5, 24.2, {
    side: (u, v, px, py) => (bayer(px, py, 0.2) ? cell(P.YELLOW, 0) : cell(P.TAN, 1)),
    top: () => cell(P.YELLOW, 0),
  }, 10);
  box(faces, 23.1, 14.1, 24.9, 15.9, 24.2, 26.8, {
    right: pWall(P.METAL), left: pWall(P.METAL), top: () => cell(P.LAMP, 0),
  });
  // 柱廊门廊（+Y 正面：六根白石柱 + 檐口 + 三角山花）
  for (const cx of [8.5, 15, 21.5, 26.5, 33, 39.5]) {
    box(faces, cx - 1.1, 26.5, cx + 1.1, 28.2, 2, 12.5, {
      right: pStone(P.WHITE), left: pStone(P.WHITE), top: pWall(P.WHITE),
    });
    box(faces, cx - 1.5, 28, cx + 1.5, 28.6, 2, 3.2, {
      right: pStone(P.CREAM), left: pStone(P.CREAM),
    });
  }
  box(faces, 6, 28.2, 42, 30.4, 12.5, 15, {
    right: pStone(P.CREAM), left: pStone(P.CREAM), top: pStone(P.CREAM),
  });
  pyramid(faces, 5.4, 28, 42.6, 32.4, 15, 19.5, pShingle(P.RFTEAL));
  // 山花浮雕带（三角楣内一圈金色饰线）
  box(faces, 9, 30.2, 39, 31.2, 15, 16, {
    right: pWall(P.YELLOW), left: pWall(P.YELLOW),
  });
  // 两翼侧厅（青灰双坡 + 竖长窗）
  box(faces, 2, 8, 6, 24, 2, 9, {
    right: pWindows(P.CREAM, { seed: seed ^ 11, lit, floorH: 3.5, gapX: 2.6, winH: 2.2, winW: 1.4 }),
    left: pWindows(P.CREAM, { seed: seed ^ 13, lit, floorH: 3.5, gapX: 2.6, winH: 2.2, winW: 1.4 }),
  });
  gableRoof(faces, 1.4, 7.4, 6.6, 24.6, 9, 12.4, 'y', {
    front: pShingle(P.RFSLATE), back: pShingle(P.RFSLATE), endY: pWall(P.CREAM),
  });
  box(faces, 42, 8, 46, 24, 2, 9, {
    right: pWindows(P.CREAM, { seed: seed ^ 17, lit, floorH: 3.5, gapX: 2.6, winH: 2.2, winW: 1.4 }),
    left: pWindows(P.CREAM, { seed: seed ^ 19, lit, floorH: 3.5, gapX: 2.6, winH: 2.2, winW: 1.4 }),
  });
  gableRoof(faces, 41.4, 7.4, 46.6, 24.6, 9, 12.4, 'y', {
    front: pShingle(P.RFSLATE), back: pShingle(P.RFSLATE), endY: pWall(P.CREAM),
  });
  // 门前红毯大台阶（三步放下，直抵广场）
  box(faces, 16, 30, 32, 34, 0, 1.6, { top: pWall(P.RED), right: pWall(P.SIDE), left: pWall(P.SIDE) });
  box(faces, 14.5, 34, 33.5, 37.5, 0, 1.0, { top: pWall(P.RED), right: pWall(P.SIDE), left: pWall(P.SIDE) });
  box(faces, 13, 37.5, 35, 40.5, 0, 0.5, { top: pWall(P.RED), right: pWall(P.SIDE), left: pWall(P.SIDE) });
  // 石狮灯座 ×2（幕布两侧，夜光暖灯）
  for (const [lx, ly] of [[12.4, 33.4], [35.6, 33.4]] as const) {
    box(faces, lx - 1.6, ly - 1.6, lx + 1.6, ly + 1.6, 0, 2.6, {
      right: pStone(P.SIDE), left: pStone(P.SIDE), top: () => cell(P.LAMP, 0),
    });
  }
  return { model: buildModel(faces, 48, 48) };
}

/** 会展中心（3×3）：玻璃拱棚主展馆 + 入口圆鼓 + 万国旗广场 */
export function genExpo(seed: number): BuildResult {
  const r = mulberry32(seed);
  const lit = 0.3 + r() * 0.15;
  const faces: Face[] = [];
  // 石板广场（全幅浅台）
  box(faces, 2, 2, 46, 46, 0, 0.6, {
    right: pStone(P.SIDE), left: pStone(P.SIDE),
    top: (u, v, px, py) => (bayer(px, py, 0.12) ? cell(P.SIDE, 1) : cell(P.SIDE, 0)),
  });
  // 主展馆： Cream 石墙 + 玻璃山形拱棚（温室般通透，夜里整片亮）
  box(faces, 8, 8, 40, 32, 0.6, 10, {
    right: pGlassCurtain(seed, P.GLASS),
    left: pGlassCurtain(seed ^ 5, P.GLASS),
  });
  gableRoof(faces, 7.4, 7.4, 40.6, 32.6, 10, 17.5, 'y', {
    front: (u, v, px, py) => (bayer(px, py, 0.16) ? cell(P.GLASS, 2) : cell(P.GLASS, 1)),
    back: (u, v, px, py) => (bayer(px, py, 0.16) ? cell(P.GLASS, 2) : cell(P.GLASS, 1)),
    endY: pWall(P.CREAM),
  });
  // 棚脊灯带（夜光：主馆轮廓一眼可辨）
  box(faces, 23.2, 7.8, 24.8, 33, 17.2, 18.2, {
    right: () => cell(P.LAMP, 0), left: () => cell(P.LAMP, 0),
    top: () => cell(P.LAMP, 0),
  });
  // 入口圆鼓（+Y 正面：玻璃圆厅 + 霓虹环带）
  prism(faces, 24, 36.5, 5.4, 0.6, 12, {
    side: (u, v, px, py) =>
      v > 8.2 && v < 9.6 ? cell(P.NEONC, 0)
        : bayer(px, py, 0.2) ? cell(P.GLASS, 2) : cell(P.GLASS, 1),
    top: pWall(P.WHITE),
  }, 10);
  // 连桥（圆鼓 → 主馆：玻璃廊）
  box(faces, 21.6, 31.6, 26.4, 33.6, 0.6, 6.5, {
    right: pGlassCurtain(seed ^ 9, P.GLASS), left: pGlassCurtain(seed ^ 12, P.GLASS),
    top: pWall(P.WHITE),
  });
  // 两翼展馆（平顶 + 空调外机 + 主题横幅色块）
  for (const [wx0, wx1] of [[3.5, 12.5], [35.5, 44.5]] as const) {
    box(faces, wx0, 38.5, wx1, 44.5, 0.6, 7.5, {
      right: pWindows(P.CREAM, { seed: seed ^ (wx0 < 12 ? 21 : 25), lit, floorH: 3.4, gapX: 3.2, winH: 2.2, winW: 2 }),
      left: pWindows(P.CREAM, { seed: seed ^ (wx0 < 12 ? 23 : 27), lit, floorH: 3.4, gapX: 3.2, winH: 2.2, winW: 2 }),
      top: pFlatRoof(P.METAL, 4),
    });
    acUnit(faces, wx0 + 3, 41.5, 7.5, 2.4);
    box(faces, wx0 + 1.2, 44.5, wx1 - 1.2, 45.1, 3.2, 6.2, {
      right: (wx0 < 12 ? pWall(P.NEONR) : pWall(P.PBLUE)),
      left: (wx0 < 12 ? pWall(P.NEONR) : pWall(P.PBLUE)),
    });
  }
  // 万国旗广场（四角旗杆：红 / 青 / 黄 / 白旗）
  flagPole(faces, 6.5, 6.5, 13, P.RED);
  flagPole(faces, 41.5, 6.5, 13, P.CYAN);
  flagPole(faces, 17, 44, 12, P.YELLOW);
  flagPole(faces, 31, 44, 12, P.WHITE);
  // 中央花坛（圆池 + 指南针式铺装）
  frustum(faces, 24, 24, 4.2, 3.4, 0.6, 2.2, {
    side: pStone(P.SIDE), top: () => cell(P.PBLUE, 0),
  }, 8);
  return { model: buildModel(faces, 48, 48) };
}
