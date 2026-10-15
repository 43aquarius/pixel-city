// ============================================================
// b_more.ts — 扩展建筑包：町屋 / 住宅小区 / 居酒屋 / 电影院 /
//             屋台小吃街 / 木材厂 / 粮仓 / 港口吊机 / 巴士站 /
//             钟楼 / 天文台 / 千本鸟居
// ============================================================

import {
  box, gableRoof, pyramid, prism, frustum,
  buildModel, type Face, type V3,
} from './geo';
import {
  pWall, pWindows, pShingle, pFlatRoof, pStone, pSign, pAwning,
  pCorrugated, pBrick, pBands, cell, type PatFn,
} from './patterns';
import { RAMP, bayer } from './palette';
import { mulberry32, hash2 } from './rng';
import { roofDeck, waterTank, acUnit, type BuildResult } from './b_util';
import { addTree } from './b_civ';

const P = RAMP;

// ------------------------------------------------------------
// 住宅
// ------------------------------------------------------------

/** 町屋（1×1）：木格 facade + 陡瓦顶 + 暖帘 + 灯笼（PC98 街景风） */
export function genMachiya(seed: number): BuildResult {
  const r = mulberry32(seed);
  const wood = r() < 0.5 ? P.DIRT : P.TAN;
  const roof = r() < 0.6 ? P.RFSLATE : P.RFGRAY;
  const norenC = r() < 0.4 ? P.RED : r() < 0.7 ? P.PBLUE : P.CYAN;
  const faces: Face[] = [];
  const x0 = 2.6, y0 = 2.6, x1 = 13.4, y1 = 13.4;
  const h = 12.6;
  box(faces, x0, y0, x1, y1, 0, h, {
    right: pWindows(wood, { seed, lit: 0.3, floorH: 6.3, gapX: 2.6, winW: 1.2, winH: 2 }),
    left: pWindows(wood, { seed: seed ^ 7, door: true, lit: 0.3, floorH: 6.3, gapX: 2.6, winW: 1.2, winH: 2 }),
  });
  // 陡峭双坡瓦顶 + 大出檐
  gableRoof(faces, x0 - 2.2, y0 - 2.2, x1 + 2.2, y1 + 2.2, h - 1, h + 7.4, 'x', {
    front: pShingle(roof), back: pShingle(roof), endX: pWall(wood), endY: pWall(wood),
  });
  // 暖帘（+Y 门上方半截帘）
  box(faces, x0 + 3.4, y1 + 0.1, x1 - 3.4, y1 + 1.1, 4.2, 7.4, {
    left: pBands(norenC, 3), right: pWall(norenC), top: pWall(norenC),
  });
  // 挑灯灯笼（+X 檐角）
  box(faces, x1 + 0.6, y1 - 2.4, x1 + 2.0, y1 - 1.0, 7.8, 9.4, {
    right: pWall(P.NEONR), left: pWall(P.NEONR), top: () => cell(P.YELLOW, 0),
  });
  return { model: buildModel(faces, 16, 16) };
}

/** 住宅小区（2×2）：平行板楼 ×2 + 中央庭院树影 */
export function genDanchi(seed: number): BuildResult {
  const r = mulberry32(seed);
  const wall = r() < 0.5 ? P.CREAM : P.PBLUE;
  const floors = 4 + Math.floor(r() * 2);
  const fh = 6.4;
  const faces: Face[] = [];
  const mk = (x0: number, y0: number, x1: number, y1: number, fl: number) => {
    const h = 2 + fl * fh;
    box(faces, x0, y0, x1, y1, 0, h, {
      right: pWindows(wall, { seed, lit: 0.16, floorH: fh, gapX: 3.4, base: 2 }),
      left: pWindows(wall, { seed: seed ^ 5, lit: 0.16, floorH: fh, gapX: 3.4, base: 2, door: true }),
    });
    roofDeck(faces, x0, y0, x1, y1, h, P.ASPH, pWall(wall));
    return h;
  };
  const h1 = mk(3.5, 4, 12, 28, floors);
  const h2 = mk(20, 4, 28.5, 28, Math.max(3, floors - 1));
  waterTank(faces, 8, 8, h1 + 3.2, h1 + 7);
  acUnit(faces, 24.5, 22, h2 + 3.2, 3);
  // 中央庭院：树 + 石凳
  const treeKind = seed % 4 === 0 ? 3 : 0;
  addTree(faces, 16.5, 10, treeKind, seed ^ 0x7EE);
  addTree(faces, 16.5, 21, treeKind === 3 ? 0 : 2, seed ^ 0x7EF);
  box(faces, 15, 15.5, 18, 17, 0.8, 2.2, {
    right: pWall(P.DIRT), left: pWall(P.DIRT), top: pWall(P.DIRT),
  });
  return { model: buildModel(faces, 32, 32) };
}

// ------------------------------------------------------------
// 商业
// ------------------------------------------------------------

/** 居酒屋（1×1）：红灯笼 + 霓虹招牌 + 通明橱窗 */
export function genIzakaya(seed: number): BuildResult {
  const r = mulberry32(seed);
  const wall = r() < 0.4 ? P.TAN : r() < 0.7 ? P.BRICK : P.CREAM;
  const sign = r() < 0.5 ? P.NEONR : P.NEONC;
  const faces: Face[] = [];
  const x0 = 3.0, y0 = 3.0, x1 = 13.0, y1 = 13.0;
  const h = 12;
  box(faces, x0, y0, x1, y1, 0, h, {
    right: pWindows(wall, { seed, lit: 0.55, floorH: 6, gapX: 3.4, winW: 2, winH: 2 }),
    left: pWindows(wall, { seed: seed ^ 3, door: true, lit: 0.55, floorH: 6, gapX: 3.4, winW: 2, winH: 2 }),
  });
  roofDeck(faces, x0, y0, x1, y1, h, P.RFGRAY, pWall(wall));
  // 檐下红灯笼一串（+Y 面）
  for (let i = 0; i < 3; i++) {
    const lx = x0 + 2.2 + i * 3.4;
    box(faces, lx, y1 + 0.7, lx + 1.4, y1 + 2.1, 6.4, 8.2, {
      left: pWall(P.NEONR), right: pWall(P.NEONR), top: () => cell(P.YELLOW, 0),
    });
  }
  // 竖式霓虹招牌（+X 面）
  box(faces, x1, y0 + 2.4, x1 + 1.4, y1 - 2.4, 4.2, 10.4, {
    right: pSign(sign, seed), top: () => cell(P.WHITE, 0),
  });
  acUnit(faces, x0 + 2, y0 + 2, h + 3.2, 2.4);
  return { model: buildModel(faces, 16, 16) };
}

/** 电影院（2×2）：灯泡跑马廊 + 立式招牌塔 */
export function genCinema(seed: number): BuildResult {
  const faces: Face[] = [];
  const h = 18;
  // 主体
  box(faces, 4, 4, 28, 25, 0, h, {
    right: pWall(P.TAN), left: pBrick(P.BRICK),
  });
  roofDeck(faces, 4, 4, 28, 25, h, P.ASPH, pWall(P.TAN));
  // 入口大厅玻璃
  box(faces, 10, 25, 22, 26.6, 0, 6.5, {
    left: (u, v, px, py) => {
      if (v < 6.2 && u % 4 < 2.6) return bayer(px, py, 0.25) ? cell(P.GLASS, 0) : cell(P.GLASS, 1);
      return pWall(P.METAL)(u, v, px, py);
    },
  });
  // 跑马廊雨棚（灯泡边框招牌）
  box(faces, 7, 25.5, 25, 29.5, 6.5, 11.5, {
    left: pSign(P.YELLOW, seed), right: pSign(P.YELLOW, seed),
    top: pFlatRoof(P.RFRED, 2),
  });
  // 立式招牌塔（夜光红霓虹）
  box(faces, 23.5, 19, 27, 23.5, 0, 32, {
    right: pSign(P.NEONR, seed ^ 9), left: pSign(P.NEONR, seed ^ 11),
    top: pFlatRoof(P.RFGRAY, 4),
  });
  // 塔顶霓虹星
  box(faces, 24.6, 20.1, 25.9, 21.4, 32, 34, {
    right: () => cell(P.YELLOW, 0), left: () => cell(P.YELLOW, 0), top: () => cell(P.RED, 0),
  });
  acUnit(faces, 8, 8, h + 3.2, 3);
  acUnit(faces, 14, 9, h + 3.2, 2.6);
  return { model: buildModel(faces, 32, 32) };
}

/** 屋台小吃街（1×1）：大遮阳棚 + 案台 + 蒸汽 */
export function genMarket(seed: number): BuildResult {
  const r = mulberry32(seed);
  const accent = r() < 0.34 ? P.RED : r() < 0.67 ? P.CYAN : P.PAINTY;
  const faces: Face[] = [];
  // 案台
  box(faces, 3, 7.5, 13, 13.5, 0, 5.2, {
    right: pBrick(P.TAN), left: pBrick(P.TAN), top: pFlatRoof(P.SIDE, 3),
  });
  // 后厨小柜
  box(faces, 3.4, 3, 6.4, 6.5, 0, 4.2, {
    right: pWall(P.BRICK), left: pWall(P.BRICK), top: pFlatRoof(P.METAL, 2),
  });
  // 大遮阳棚
  box(faces, 2.2, 5.6, 13.8, 14.6, 7.6, 9.8, {
    right: pAwning(accent), left: pAwning(accent), top: pAwning(accent),
  });
  // 棚柱
  box(faces, 2.6, 13.6, 3.6, 14.4, 0, 7.6, { right: pWall(P.METAL), left: pWall(P.METAL) });
  box(faces, 12.4, 13.6, 13.4, 14.4, 0, 7.6, { right: pWall(P.METAL), left: pWall(P.METAL) });
  // 挂灯小招牌
  box(faces, 6.8, 13.9, 9.2, 15.1, 5.4, 7.2, {
    left: pSign(accent, seed), top: () => cell(P.WHITE, 0),
  });
  // 货箱 ×2
  box(faces, 11.6, 2.6, 14, 5, 0, 2.6, {
    right: pWall(P.DIRT), left: pWall(P.DIRT), top: pFlatRoof(P.DIRT, 1),
  });
  box(faces, 13.2, 5.4, 15, 7.2, 0, 2.2, {
    right: pWall(P.TAN), left: pWall(P.TAN), top: pFlatRoof(P.TAN, 2),
  });
  const steamAt: V3 = [8, 10, 5.2];
  return { model: buildModel(faces, 16, 16), smokeAt: steamAt };
}

// ------------------------------------------------------------
// 工业
// ------------------------------------------------------------

/** 木材厂（2×2）：敞棚 + 原木垛 + 板材堆 */
export function genLumber(seed: number): BuildResult {
  const r = mulberry32(seed);
  const faces: Face[] = [];
  // 敞棚柱 ×4
  const posts: Array<[number, number]> = [[4, 4], [19.6, 4], [4, 13.6], [19.6, 13.6]];
  for (const [x, y] of posts) {
    box(faces, x, y, x + 1.4, y + 1.4, 0, 9, {
      right: pWall(P.DIRT), left: pWall(P.DIRT),
    });
  }
  // 棚顶（双坡）
  gableRoof(faces, 3, 2.6, 21, 15.4, 8.6, 13.4, 'x', {
    front: pShingle(P.METAL), back: pShingle(P.METAL), endX: pCorrugated(P.METAL),
  });
  // 原木垛（3+2+1 金字塔）
  const logPile = (ox: number, oy: number) => {
    for (let i = 0; i < 3; i++) {
      box(faces, ox, oy + i * 2.6, ox + 8.5, oy + i * 2.6 + 2.3, 0.4, 2.7, {
        right: () => cell(P.TAN, 0), left: () => cell(P.DIRT, 1), top: pWall(P.TAN),
      });
    }
    for (let i = 0; i < 2; i++) {
      box(faces, ox + 1.2, oy + 0.6 + i * 2.6, ox + 8.5, oy + 2.9 + i * 2.6, 2.7, 5, {
        right: () => cell(P.TAN, 0), left: () => cell(P.DIRT, 1), top: pWall(P.TAN),
      });
    }
    box(faces, ox + 2.6, oy + 1.9, ox + 8.5, oy + 4.2, 5, 7.3, {
      right: () => cell(P.TAN, 0), left: () => cell(P.DIRT, 1), top: pWall(P.TAN),
    });
  };
  logPile(4, 18.5);
  if (r() < 0.6) logPile(14.5, 22.5);
  // 板材堆（竖锯木板）
  for (let i = 0; i < 4; i++) {
    box(faces, 24 + i * 1.7, 5, 25.2 + i * 1.7, 13, 0, 4.6 + hash2(i, 3, seed) * 2, {
      right: pWall(P.SIDE), left: pWall(P.SIDE), top: pWall(P.TAN),
    });
  }
  // 小锯房
  box(faces, 23, 17, 29, 27, 0, 7, {
    right: pCorrugated(P.METAL), left: pCorrugated(P.METAL),
  });
  gableRoof(faces, 22, 16, 30, 28, 6.6, 10.4, 'y', {
    front: pShingle(P.RFGRAY), back: pShingle(P.RFGRAY), endY: pCorrugated(P.METAL),
  });
  return { model: buildModel(faces, 32, 32) };
}

/** 筒仓（1×1）：双/三筒体 + 顶舱 + 连接管 */
export function genSilo(seed: number): BuildResult {
  const r = mulberry32(seed);
  const triple = r() < 0.5;
  const shell = r() < 0.5 ? P.TAN : P.SIDE;
  const faces: Face[] = [];
  const siloPat = (u: number, v: number, px: number, py: number) => {
    const s = u % 3.2;
    if (s < 0.7) return cell(shell, 1);
    if (bayer(px, py, 0.1)) return cell(shell, 1);
    return cell(shell, 0);
  };
  const mkSilo = (cx: number, cy: number, h: number) => {
    prism(faces, cx, cy, 2.7, 0, h, {
      side: (u, v, px, py) => siloPat(u, v, px, py),
    }, 8);
    frustum(faces, cx, cy, 2.7, 1.5, h, h + 2.6, {
      side: (u, v, px, py) => siloPat(u, v, px, py),
    }, 8);
  };
  if (triple) {
    mkSilo(4.6, 4.6, 17);
    mkSilo(11.4, 4.6, 20);
    mkSilo(4.6, 11.4, 14);
  } else {
    mkSilo(5.2, 5.4, 19);
    mkSilo(11.2, 10.6, 22);
  }
  // 连接天桥管
  box(faces, 6.6, 5.4, 11, 6.6, 9.5, 10.7, {
    right: pWall(P.METAL), left: pWall(P.METAL), top: pWall(P.METAL),
  });
  // 提升塔
  box(faces, 12.4, 12.4, 15, 15, 0, 15, {
    right: pWall(P.METAL), left: pWall(P.METAL), top: pFlatRoof(P.METAL, 2),
  });
  return { model: buildModel(faces, 16, 16) };
}

/** 港口吊机（2×2）：集装箱阵 + 龙门吊 */
export function genDock(seed: number): BuildResult {
  const r = mulberry32(seed);
  const faces: Face[] = [];
  const COLORS = [P.RED, P.PAINTY, P.CYAN, P.PBLUE];
  // 集装箱阵（两排，随机色 + 部分双层）
  for (let row = 0; row < 2; row++) {
    for (let i = 0; i < 4; i++) {
      const x = 3.6 + i * 6.6, y = 4 + row * 5.4;
      const c = COLORS[Math.floor(r() * COLORS.length)];
      const h1 = 3.2;
      box(faces, x, y, x + 5.6, y + 4.2, 0, h1, {
        right: pCorrugated(c), left: pCorrugated(c), top: pFlatRoof(c, 4),
      });
      if (r() < 0.4) {
        const c2 = COLORS[Math.floor(r() * COLORS.length)];
        box(faces, x + 0.3, y + 0.3, x + 5.3, y + 3.9, h1, h1 * 2, {
          right: pCorrugated(c2), left: pCorrugated(c2), top: pFlatRoof(c2, 5),
        });
      }
    }
  }
  // 龙门吊：两腿 + 横梁 + 小车 + 吊箱
  const legW = 1.6;
  box(faces, 26.5, 3, 26.5 + legW, 29, 0, 17, {
    right: pWall(P.YELLOW), left: pWall(P.YELLOW),
  });
  box(faces, 29.4 - legW, 3, 29.4, 29, 0, 17, {
    right: pWall(P.YELLOW), left: pWall(P.YELLOW),
  });
  box(faces, 24.4, 2.4, 30.6, 29.6, 17, 19.4, {
    right: pWall(P.YELLOW), left: pWall(P.YELLOW), top: pFlatRoof(P.METAL, 1),
  });
  // 小车
  box(faces, 25.6, 13, 29.4, 16, 19.4, 21, {
    right: pWall(P.METAL), left: pWall(P.METAL), top: pFlatRoof(P.RED, 2),
  });
  // 吊索 + 半空集装箱
  box(faces, 27.1, 14.4, 27.9, 15.2, 11.5, 19.4, {
    right: () => cell(P.OUTLINE, 0), left: () => cell(P.OUTLINE, 0),
  });
  box(faces, 25.2, 12.6, 29.8, 17, 7.2, 11.5, {
    right: pCorrugated(P.RED), left: pCorrugated(P.RED), top: pFlatRoof(P.RED, 3),
  });
  return { model: buildModel(faces, 32, 32) };
}

// ------------------------------------------------------------
// 公共
// ------------------------------------------------------------

/** 巴士站（1×1）：候车亭 + 长椅 + 站牌 */
export function genBusstop(seed: number): BuildResult {
  const r = mulberry32(seed);
  const faces: Face[] = [];
  // 顶棚
  box(faces, 3, 6, 13, 12.5, 8.2, 10, {
    right: pWall(P.RFGRAY), left: pWall(P.RFGRAY), top: pFlatRoof(P.RFGRAY, 2),
  });
  // 立柱 ×2
  box(faces, 3.6, 6.6, 4.6, 7.6, 0, 8.2, { right: pWall(P.METAL), left: pWall(P.METAL) });
  box(faces, 11.4, 6.6, 12.4, 7.6, 0, 8.2, { right: pWall(P.METAL), left: pWall(P.METAL) });
  box(faces, 3.6, 11, 4.6, 12, 0, 8.2, { right: pWall(P.METAL), left: pWall(P.METAL) });
  box(faces, 11.4, 11, 12.4, 12, 0, 8.2, { right: pWall(P.METAL), left: pWall(P.METAL) });
  // 后挡风板 + 路线图
  box(faces, 3.2, 6.4, 12.8, 7.2, 2.6, 7.6, {
    left: r() < 0.5
      ? (u, v, px, py) => pSign(P.PBLUE, seed)(u, v, px, py)
      : (u, v, px, py) => pSign(P.CYAN, seed)(u, v, px, py),
  });
  // 长椅
  box(faces, 5, 9.4, 11, 10.8, 1.6, 2.8, {
    right: pWall(P.DIRT), left: pWall(P.DIRT), top: pWall(P.DIRT),
  });
  // 站牌（黄牌黑字）
  box(faces, 13.6, 12.2, 14.6, 13.2, 0, 9.6, { right: pWall(P.METAL), left: pWall(P.METAL) });
  box(faces, 12.8, 11.6, 15.4, 13.8, 6.4, 9, {
    right: pSign(P.PAINTY, seed), left: pSign(P.PAINTY, seed), top: () => cell(P.OUTLINE, 0),
  });
  // 垃圾桶
  box(faces, 4, 12.8, 5.6, 14.4, 0, 2.6, {
    right: pWall(P.SIDE), left: pWall(P.SIDE), top: pFlatRoof(P.SIDE, 2),
  });
  return { model: buildModel(faces, 16, 16) };
}

/** 钟楼（1×1）：砖塔 + 双面大钟 + 锥顶 */
export function genClocktower(seed: number): BuildResult {
  const faces: Face[] = [];
  // 石基座
  box(faces, 3.6, 3.6, 12.4, 12.4, 0, 2.4, {
    right: (u, v, px, py) => pStone()(u, v, px, py),
    left: (u, v, px, py) => pStone()(u, v, px, py),
    top: (u, v, px, py) => pStone(P.SIDE)(u, v, px, py),
  });
  // 塔身
  box(faces, 4.6, 4.6, 11.4, 11.4, 2.4, 24, {
    right: pBrick(P.BRICK),
    left: pWindows(P.BRICK, { seed, lit: 0.12, floorH: 6.4, gapX: 4.4, winW: 1.2, winH: 2.4, base: 2.4 }),
  });
  // 钟面（+X / +Y 双面）
  const clockPat = (u: number, v: number, px: number, py: number) => {
    const c = 1.6;
    if (u < 0.5 || v < 0.5 || u > 2.7 || v > 2.7) return cell(P.OUTLINE, 0);
    // 指针（竖 12→心，心→右 3）
    if (Math.abs(u - c) < 0.32 && v > 0.7 && v < c) return cell(P.OUTLINE, 0);
    if (Math.abs(v - c) < 0.32 && u > c && u < 2.5) return cell(P.OUTLINE, 0);
    if (Math.abs(u - c) < 0.3 && Math.abs(v - c) < 0.3) return cell(P.OUTLINE, 0);
    if (bayer(px, py, 0.12)) return cell(P.SIDE, 1);
    return cell(P.WHITE, 0);
  };
  box(faces, 11.4, 6.4, 12.0, 9.6, 19, 22.2, { right: clockPat });
  box(faces, 6.4, 11.4, 9.6, 12.0, 19, 22.2, { left: clockPat });
  // 檐口 + 锥顶 + 尖饰
  box(faces, 4, 4, 12, 12, 24, 25.6, {
    right: pWall(P.RFSLATE), left: pWall(P.RFSLATE), top: pFlatRoof(P.RFSLATE, 1),
  });
  pyramid(faces, 4.2, 4.2, 11.8, 11.8, 25.6, 32, pShingle(P.RFSLATE));
  box(faces, 7.7, 7.7, 8.3, 8.3, 32, 34, {
    right: () => cell(P.YELLOW, 0), left: () => cell(P.YELLOW, 0), top: () => cell(P.YELLOW, 0),
  });
  return { model: buildModel(faces, 16, 16) };
}

/** 天文台（2×2）：圆顶观测塔 + 侧翼控制楼 */
export function genObservatory(seed: number): BuildResult {
  const faces: Face[] = [];
  void seed;
  // 环形台座
  frustum(faces, 13, 13, 11.6, 10, 0, 2.2, {
    side: (u, v, px, py) => pStone()(u, v, px, py),
  }, 10);
  // 主体圆塔
  const bodyPat: PatFn = (u, v, px, py) => {
    const s = u % 5;
    if (s < 0.8) return cell(P.CREAM, 1);
    if (bayer(px, py, 0.08)) return cell(P.CREAM, 1);
    return cell(P.CREAM, 0);
  };
  prism(faces, 13, 13, 10, 2.2, 13.5, {
    side: (u, v, px, py) => bodyPat(u, v, px, py),
  }, 10);
  // 穹顶（两段圆台收分）
  frustum(faces, 13, 13, 10, 7.2, 13.5, 18.5, {
    side: (u, v, px, py) => {
      if (bayer(px, py, 0.16)) return cell(P.PBLUE, 1);
      return cell(P.PBLUE, 0);
    },
  }, 10);
  frustum(faces, 13, 13, 7.2, 2.6, 18.5, 21.5, {
    side: (u, v, px, py) => {
      if (bayer(px, py, 0.16)) return cell(P.PBLUE, 1);
      return cell(P.PBLUE, 0);
    },
    top: () => cell(P.METAL, 1),
  }, 10);
  // 观测窗缝（+X 侧）
  box(faces, 19.6, 12.2, 22.6, 13.8, 15.5, 20.5, {
    right: () => cell(P.OUTLINE, 0), left: () => cell(P.OUTLINE, 0),
  });
  // 侧翼控制楼
  box(faces, 21.5, 21.5, 28.5, 28.5, 0, 8, {
    right: pWindows(P.CREAM, { seed: 77, lit: 0.3, floorH: 5.4, gapX: 3.4, base: 1 }),
    left: pWindows(P.CREAM, { seed: 78, lit: 0.3, floorH: 5.4, gapX: 3.4, base: 1, door: true }),
  });
  roofDeck(faces, 21.5, 21.5, 28.5, 28.5, 8, P.ASPH, pWall(P.CREAM));
  acUnit(faces, 22.5, 22.5, 11.2, 2.4);
  return { model: buildModel(faces, 32, 32) };
}

/** 千本鸟居（1×1）：朱红鸟居参道 ×3（纵深递增） */
export function genTorii(seed: number): BuildResult {
  const r = mulberry32(seed);
  const vermilion = r() < 0.75 ? P.RED : P.WHITE;
  const faces: Face[] = [];
  const torii = (y: number, w: number, h: number) => {
    const cx = 8;
    const x0 = cx - w / 2, x1 = cx + w / 2;
    // 石阶基座
    box(faces, x0 - 1.4, y - 0.6, x1 + 1.4, y + 2.6, 0, 1.1, {
      right: (u, v, px, py) => pStone()(u, v, px, py),
      left: (u, v, px, py) => pStone()(u, v, px, py),
      top: (u, v, px, py) => pStone(P.SIDE)(u, v, px, py),
    });
    // 双柱
    box(faces, x0, y, x0 + 1.3, y + 2, 1.1, h, {
      right: pWall(vermilion), left: pWall(vermilion),
    });
    box(faces, x1 - 1.3, y, x1, y + 2, 1.1, h, {
      right: pWall(vermilion), left: pWall(vermilion),
    });
    // 笠木（顶梁，出挑）+ 岛木
    box(faces, x0 - 1.8, y - 0.1, x1 + 1.8, y + 2.1, h, h + 1.2, {
      right: pWall(vermilion), left: pWall(vermilion), top: () => cell(P.OUTLINE, 0),
    });
    box(faces, x0 - 0.6, y + 0.1, x1 + 0.6, y + 1.9, h - 1.6, h - 0.5, {
      right: pWall(vermilion), left: pWall(vermilion), top: pWall(vermilion),
    });
    // 额束
    box(faces, cx - 0.6, y + 0.6, cx + 0.6, y + 1.4, h - 0.5, h, {
      right: () => cell(P.WHITE, 0), left: () => cell(P.WHITE, 0),
    });
  };
  torii(12.2, 10.4, 10.5);
  torii(8.0, 9.2, 9.4);
  torii(3.8, 8.0, 8.3);
  // 参道两侧小石灯笼
  prism(faces, 14.2, 6.5, 1.2, 0, 5.4, {
    side: (u, v, px, py) => pStone()(u, v, px, py),
    top: () => cell(P.WHITE, 0),
  }, 6);
  prism(faces, 1.8, 10.5, 1.2, 0, 5.4, {
    side: (u, v, px, py) => pStone()(u, v, px, py),
    top: () => cell(P.WHITE, 0),
  }, 6);
  return { model: buildModel(faces, 16, 16) };
}
