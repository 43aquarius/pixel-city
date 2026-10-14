// ============================================================
// b_extra.ts — 扩展建筑包（第二批 13 类）：
//   住宅：别墅府邸 / 住宅大厦(2×2)
//   商业：便利店 / 酒店(2×2) / 购物中心(2×2) / 停车场
//   工业：炼油厂(2×2) / 火电厂(2×2)
//   公共：教堂 / 博物馆(2×2) / 消防局 / 灯塔 / 城堡(2×2)
// 全部沿用同一离线预渲染管线与 66 色板。
// ============================================================

import {
  box, gableRoof, hipRoof, pyramid, prism, frustum, cone,
  buildModel, type Face, type V3,
} from './geo';
import {
  pWall, pWindows, pGlassCurtain, pFlatRoof, pShingle, pStone,
  pWaterStatic, pSawTooth, pCorrugated, pTankShell, pBands, pAwning, pSign,
  cell, type PatFn,
} from './patterns';
import { RAMP } from './palette';
import { mulberry32, pick } from './rng';
import { roofDeck, chimney, waterTank, acUnit, flagPole, type BuildResult } from './b_util';

const P = RAMP;

// ---------- 局部小图案 ----------

/** 玻璃顶（天窗/车顶）：微反光抖动 */
const pGlassTop: PatFn = (u, v, px, py) => cell(P.GLASS, 1, 0, 0.5);

/** 消防局红色分段卷闸门 */
const pRedDoor: PatFn = (u, v) => cell(P.RED, v % 3 < 1 ? 1 : 0);

/** 城堡雉堞：沿指定轴交替垛口 */
const crenel = (along: 'u' | 'v'): PatFn => (u, v) => {
  const t = along === 'u' ? u : v;
  return cell(P.SIDE, Math.floor(t / 2.6) % 2 ? 1 : 0);
};

// ============================================================
// 住宅
// ============================================================

/** 别墅府邸（1×1）：四坡顶 + 绿篱围栏 + 泳池 + 烟囱 */
export function genManor(seed: number): BuildResult {
  const r = mulberry32(seed);
  const wall = pick([P.CREAM, P.TAN, P.PBLUE], r());
  const roof = pick([P.RFRED, P.RFSLATE, P.RFTEAL], r());
  const faces: Face[] = [];
  const h = 13.6;
  box(faces, 3.2, 3.4, 12.6, 12.8, 0, h, {
    right: pWindows(wall, { seed, lit: 0.08, floorH: 6.8, gapX: 4.2 }),
    left: pWindows(wall, { seed: seed ^ 3, lit: 0.08, floorH: 6.8, gapX: 4.2, door: true }),
  });
  hipRoof(faces, 1.4, 1.6, 14.4, 14.6, h - 0.5, h + 6.6, 0.62, { slope: pShingle(roof) });
  let smokeAt: V3 | undefined;
  if (r() < 0.5) {
    chimney(faces, 10.4, 4.6, 10, h + 7.4, 2.2);
    smokeAt = [11.5, 5.7, h + 7.4];
  }
  // 泳池（+Y 前院）
  if (r() < 0.75) {
    box(faces, 1.8, 13.2, 6.2, 14.8, 0, 1.7, {
      top: pWaterStatic(), right: pWall(P.SIDE), left: pWall(P.SIDE),
    });
  } else {
    // 花坛
    box(faces, 2.2, 13.4, 6.0, 14.6, 0, 1.1, {
      top: pWall(P.LEAF), right: pWall(P.DIRT), left: pWall(P.DIRT),
    });
  }
  // 绿篱围墙
  const hp = pWall(P.LEAF);
  box(faces, 0.3, 15.0, 15.7, 15.9, 0, 2.0, { top: hp, right: hp, left: hp });
  box(faces, 0.3, 0.1, 15.7, 1.0, 0, 2.0, { top: hp, right: hp, left: hp });
  box(faces, 0.1, 1.0, 1.0, 15.0, 0, 2.0, { top: hp, right: hp, left: hp });
  box(faces, 15.0, 1.0, 15.9, 15.0, 0, 2.0, { top: hp, right: hp, left: hp });
  return { model: buildModel(faces, 16, 16), smokeAt };
}

/** 住宅大厦（2×2）：12-16 层塔楼 + 2 层裙房 + 层层阳台 */
export function genResTower(seed: number): BuildResult {
  const r = mulberry32(seed);
  const wall = pick([P.CREAM, P.TAN, P.PBLUE], r());
  const floors = 12 + Math.floor(r() * 5);   // 12..16
  const fh = 6.6;
  const hPod = 2 + 2 * fh;
  const hTop = 2 + floors * fh;
  const faces: Face[] = [];
  // 裙房
  box(faces, 3, 3, 29, 29, 0, hPod, {
    right: pWindows(wall, { seed, lit: 0.22, floorH: fh, base: 4.5, gapX: 3.6 }),
    left: pWindows(wall, { seed: seed ^ 11, lit: 0.22, floorH: fh, base: 4.5, gapX: 3.6, door: true, doorW: 4 }),
  });
  // 塔身
  box(faces, 8, 8, 24, 24, hPod, hTop, {
    right: pWindows(wall, { seed: seed ^ 5, lit: 0.2, floorH: fh, gapX: 3.4 }),
    left: pWindows(wall, { seed: seed ^ 9, lit: 0.2, floorH: fh, gapX: 3.4 }),
  });
  // 挑阳台（+X 与 +Y 交错）
  for (let f = 2; f < floors; f += 2) {
    const z = hPod + f * fh - 4.4;
    box(faces, 24, 10, 25.7, 22, z, z + 1.5, {
      top: pFlatRoof(P.SIDE, f), right: pWall(P.SIDE), left: pWall(P.SIDE),
    });
    box(faces, 10, 24, 22, 25.7, z + 3.3, z + 4.8, {
      top: pFlatRoof(P.SIDE, f + 1), right: pWall(P.SIDE), left: pWall(P.SIDE),
    });
  }
  roofDeck(faces, 8, 8, 24, 24, hTop, P.ASPH, pWall(wall));
  box(faces, 10, 10, 15, 15, hTop + 3.2, hTop + 3.2 + 4.4, {
    right: pWall(wall), left: pWall(wall), top: pFlatRoof(P.RFGRAY, 6),
  });
  waterTank(faces, 20, 13, hTop + 3.2, hTop + 7);
  acUnit(faces, 12, 19, hTop + 3.2, 2.6);
  return { model: buildModel(faces, 32, 32) };
}

// ============================================================
// 商业
// ============================================================

/** 便利店（1×1）：单层大橱窗 + 条纹雨棚 + 屋顶招牌 */
export function genConvenience(seed: number): BuildResult {
  const r = mulberry32(seed);
  const accent = pick([P.RED, P.YELLOW, P.CYAN, P.RFTEAL], r());
  const wall = pick([P.CREAM, P.TAN, P.PBLUE], r());
  const h = 9.4;
  const faces: Face[] = [];
  box(faces, 2.2, 2.2, 13.8, 13.8, 0, h, {
    right: pWindows(wall, { seed, lit: 0.06, floorH: 20, winW: 3, winH: 4.4, gapX: 5 }),
    left: pWindows(wall, { seed: seed ^ 7, lit: 0.06, floorH: 20, winW: 4, winH: 4.4, gapX: 5, door: true, doorW: 4 }),
  });
  // 条纹雨棚
  box(faces, 2.6, 13.8, 13.4, 15.6, 4.8, 6.2, {
    top: pAwning(accent), right: pAwning(accent), left: pAwning(accent),
  });
  roofDeck(faces, 2.2, 2.2, 13.8, 13.8, h, P.RFGRAY, pWall(wall));
  // 屋顶招牌
  box(faces, 3.2, 12.6, 12.8, 14.2, h + 3.2, h + 6.8, {
    right: pSign(accent, seed + 5), left: pSign(accent, seed), top: pFlatRoof(P.RFGRAY, 4),
  });
  acUnit(faces, 4.2, 4.2, h + 3.2, 2.4);
  return { model: buildModel(faces, 16, 16) };
}

/** 酒店（2×2）：玻璃塔楼 + 裙房 + 入口雨棚 + 楼顶招牌 */
export function genHotel(seed: number): BuildResult {
  const r = mulberry32(seed);
  const glass = r() < 0.6 ? P.GLASS : P.PBLUE;
  const floors = 10 + Math.floor(r() * 4);   // 10..13
  const fh = 6.8;
  const hPod = 2 + 2 * fh;
  const hTop = 2 + floors * fh;
  const faces: Face[] = [];
  box(faces, 2.5, 2.5, 29.5, 29.5, 0, hPod, {
    right: pWindows(P.CREAM, { seed, lit: 0.3, floorH: fh, base: 4.5, gapX: 3.6 }),
    left: pWindows(P.CREAM, { seed: seed ^ 9, lit: 0.3, floorH: fh, base: 4.5, gapX: 3.6, door: true, doorW: 5 }),
  });
  box(faces, 9, 9, 23, 23, hPod, hTop, {
    right: pGlassCurtain(seed + 2, glass),
    left: pGlassCurtain(seed + 3, glass),
  });
  // 入口雨棚
  box(faces, 13, 29.5, 19, 31.6, 4.2, 5.8, {
    top: pFlatRoof(P.RFGRAY, 2), right: pWall(P.RFGRAY), left: pWall(P.RFGRAY),
  });
  roofDeck(faces, 9, 9, 23, 23, hTop, P.ASPH, pWall(P.CREAM));
  // 楼顶招牌
  box(faces, 12, 27, 20, 28.8, hTop + 2.6, hTop + 6.2, {
    right: pSign(P.YELLOW, seed + 4), left: pSign(P.YELLOW, seed), top: pFlatRoof(P.METAL, 3),
  });
  waterTank(faces, 19, 13, hTop + 3.2, hTop + 6.8);
  acUnit(faces, 12, 19, hTop + 3.2, 2.6);
  return { model: buildModel(faces, 32, 32) };
}

/** 购物中心（2×2）：大跨度卖场 + 玻璃中庭 + 屋顶天窗 */
export function genMall(seed: number): BuildResult {
  const r = mulberry32(seed);
  const wall = pick([P.CREAM, P.TAN], r());
  const accent = pick([P.RED, P.RFTEAL], r());
  const h = 13.2;
  const faces: Face[] = [];
  box(faces, 2.4, 2.4, 29.6, 29.6, 0, h, {
    right: pWindows(wall, { seed, lit: 0.1, floorH: 6.6, gapX: 4, winW: 2.4, winH: 2.6 }),
    left: pWindows(wall, { seed: seed ^ 5, lit: 0.1, floorH: 6.6, gapX: 4, winW: 2.4, winH: 2.6, door: true, doorW: 5 }),
  });
  // 环绕遮阳棚带
  box(faces, 2.0, 29.6, 30.0, 31.6, 6.2, 7.5, {
    top: pAwning(accent), right: pAwning(accent), left: pAwning(accent),
  });
  box(faces, 29.6, 4.0, 31.6, 28.6, 6.2, 7.5, {
    top: pAwning(accent), right: pAwning(accent), left: pAwning(accent),
  });
  // 玻璃中庭入口
  box(faces, 12.5, 26, 19.5, 31.2, 0, h + 5, {
    right: pGlassCurtain(seed + 1, P.GLASS),
    left: pGlassCurtain(seed + 2, P.GLASS),
    top: pFlatRoof(P.RFGRAY, 5),
  });
  roofDeck(faces, 2.4, 2.4, 29.6, 29.6, h, P.ASPH, pWall(wall));
  // 屋顶天窗 ×3
  for (let i = 0; i < 3; i++) {
    box(faces, 7 + i * 8, 13, 12 + i * 8, 19, h + 3.2, h + 4.6, {
      top: pGlassTop, right: pWall(P.GLASS), left: pWall(P.GLASS),
    });
  }
  return { model: buildModel(faces, 32, 32) };
}

/** 停车场（1×1）：地面为划线车位，模型 = 随机停放的小汽车 */
export function genParking(seed: number): BuildResult {
  const r = mulberry32(seed);
  const faces: Face[] = [];
  const colors = [P.RED, P.CYAN, P.YELLOW, P.PBLUE, P.TAN];
  const spots: Array<[number, number]> = [
    [3.2, 3.75], [6.4, 3.75], [9.6, 3.75], [12.8, 3.75],
    [3.2, 12.5], [6.4, 12.5], [9.6, 12.5], [12.8, 12.5],
  ];
  const count = 2 + Math.floor(r() * 4);
  const used = new Set<number>();
  for (let k = 0; k < count; k++) {
    let s = Math.floor(r() * spots.length);
    while (used.has(s)) s = (s + 1) % spots.length;
    used.add(s);
    const [cx, cy] = spots[s];
    const col = colors[Math.floor(r() * colors.length)];
    box(faces, cx - 1.0, cy - 1.9, cx + 1.0, cy + 1.9, 0, 2.2, {
      right: pWall(col), left: pWall(col),
    });
    box(faces, cx - 0.8, cy - 1.0, cx + 0.8, cy + 1.1, 2.2, 3.7, {
      right: pWall(P.GLASS), left: pWall(P.GLASS), top: pWall(col),
    });
  }
  return { model: buildModel(faces, 16, 16) };
}

// ============================================================
// 工业
// ============================================================

/** 炼油厂（2×2）：精馏塔林 + 管廊 + 火炬（闪烁）+ 冒烟加热炉 */
export function genRefinery(seed: number): BuildResult {
  const r = mulberry32(seed);
  const faces: Face[] = [];
  // 设备平台
  box(faces, 2.5, 3.5, 29.5, 29, 0, 1.2, {
    top: pFlatRoof(P.ASPH, 6), right: pWall(P.METAL), left: pWall(P.METAL),
  });
  // 精馏塔（不同高度）
  const cols: Array<[number, number, number, number]> = [
    [8.5, 9.5, 2.6, 19], [15.5, 13.5, 2.2, 15], [22.5, 7.5, 2.4, 23],
  ];
  if (r() < 0.5) cols.reverse();
  for (const [cx, cy, rad, hTop] of cols) {
    prism(faces, cx, cy, rad, 1.2, hTop, {
      side: (u, v, px, py) => pTankShell()(u, v, px, py),
      top: pFlatRoof(P.METAL, 3),
    }, 8);
  }
  // 高空管廊
  box(faces, 9, 8.9, 23, 10.1, 13.2, 14.3, {
    top: pWall(P.METAL), right: pWall(P.METAL), left: pWall(P.METAL),
  });
  // 成品罐
  prism(faces, 27, 24.5, 2.8, 1.2, 8, {
    side: (u, v, px, py) => pTankShell()(u, v, px, py),
    top: pFlatRoof(P.RFTEAL, 3),
  }, 8);
  prism(faces, 21.5, 26.5, 2.2, 1.2, 6.2, {
    side: (u, v, px, py) => pTankShell()(u, v, px, py),
    top: pFlatRoof(P.METAL, 2),
  }, 8);
  // 加热炉烟囱（冒烟）
  chimney(faces, 4.5, 6, 1.2, 12, 2.4);
  // 火炬
  box(faces, 26.8, 3.2, 28.0, 4.4, 1.2, 27, {
    right: pWall(P.METAL), left: pWall(P.METAL), top: () => cell(P.METAL, 2),
  });
  return {
    model: buildModel(faces, 32, 32),
    smokeAt: [5.7, 7.2, 12],
    blinkAt: [27.4, 3.8, 27.8],
  };
}

/** 火电厂（2×2）：双曲线冷却塔 ×2（冒白汽）+ 锯齿顶锅炉房 + 煤堆 */
export function genPower(seed: number): BuildResult {
  void seed;
  const faces: Face[] = [];
  // 冷却塔 A / B
  for (const [cx, cy] of [[10, 10], [23, 23]] as const) {
    frustum(faces, cx, cy, 6.4, 5.0, 0, 11, {
      side: (u, v, px, py) => pWall(P.SIDE)(u, v, px, py),
    }, 8);
    frustum(faces, cx, cy, 5.0, 6.0, 11, 20, {
      side: (u, v, px, py) => pWall(P.SIDE)(u, v, px, py),
      top: () => cell(P.OUTLINE, 0),
    }, 8);
  }
  // 锅炉房（锯齿顶）
  box(faces, 2.5, 2.5, 15, 12.5, 0, 9, {
    right: pCorrugated(P.TAN),
    left: pWindows(P.TAN, { lit: 0.05, floorH: 9, winW: 2, winH: 3, gapX: 5, base: 0 }),
  });
  gableRoof(faces, 2.5, 2.5, 15, 12.5, 8.6, 12.6, 'x', {
    front: pSawTooth(true), back: pSawTooth(false),
  });
  // 煤堆
  cone(faces, 21.5, 6, 5.6, 0, 6.8, (u, v, px, py) => pWall(P.DIRT)(u, v, px, py), 8);
  // 电气小楼
  box(faces, 26, 2.5, 30, 8, 0, 5.5, {
    right: pWall(P.PBLUE), left: pWall(P.PBLUE), top: pFlatRoof(P.RFGRAY, 2),
  });
  return {
    model: buildModel(faces, 32, 32),
    smokeAt: [10, 10, 21],
  };
}

// ============================================================
// 公共
// ============================================================

/** 教堂（1×1）：尖塔钟楼 + 十字 + 石阶 */
export function genChurch(seed: number): BuildResult {
  const r = mulberry32(seed);
  const wall = pick([P.CREAM, P.BRICK], r());
  const faces: Face[] = [];
  // 圣殿
  box(faces, 5.2, 3.0, 12.6, 13.0, 0, 9.5, {
    right: pWindows(wall, { seed, lit: 0.25, floorH: 20, winW: 1.6, winH: 2.8, gapX: 3.4 }),
    left: pWindows(wall, { seed: seed ^ 3, lit: 0.25, floorH: 20, winW: 1.6, winH: 2.8, gapX: 3.4, door: true, doorW: 2.6 }),
  });
  gableRoof(faces, 4.4, 2.2, 13.4, 13.8, 9, 14.6, 'y', {
    front: pShingle(P.RFSLATE), back: pShingle(P.RFSLATE), endY: pWall(wall),
  });
  // 钟楼
  box(faces, 2.6, 2.4, 6.2, 6.0, 0, 17, {
    right: pWindows(wall, { seed: seed ^ 7, lit: 0.25, floorH: 20, winW: 1.2, winH: 1.9, gapX: 8 }),
    left: pWall(wall),
  });
  pyramid(faces, 2.2, 2.0, 6.6, 6.4, 17, 22.6, pShingle(P.RFSLATE));
  // 十字
  box(faces, 4.05, 3.9, 4.7, 4.55, 22.6, 24.9, {
    right: pWall(P.WHITE), left: pWall(P.WHITE), top: () => cell(P.WHITE, 0),
  });
  box(faces, 3.5, 4.3, 5.25, 5.0, 23.7, 24.5, {
    right: pWall(P.WHITE), left: pWall(P.WHITE), top: () => cell(P.WHITE, 0),
  });
  // 入口石阶
  box(faces, 7.4, 13.0, 10.4, 15.6, 0, 0.9, {
    top: pStone(P.SIDE), right: pWall(P.SIDE), left: pWall(P.SIDE),
  });
  return { model: buildModel(faces, 16, 16) };
}

/** 博物馆（2×2）：石砌基座 + 前廊柱列 + 青绿穹顶 + 金顶针 */
export function genMuseum(_seed: number): BuildResult {
  const faces: Face[] = [];
  const stone = pStone();
  const cream = pStone(P.CREAM);
  // 基座
  box(faces, 2, 2, 30, 30, 0, 3, { top: stone, right: stone, left: stone });
  // 主殿
  box(faces, 5.5, 5.5, 26.5, 26.5, 3, 12, { right: cream, left: cream });
  // 前廊柱列 + 檐口
  for (let i = 0; i < 5; i++) {
    const cx = 7.5 + i * 4.3;
    box(faces, cx - 0.9, 27.2, cx + 0.9, 30.2, 3, 10.4, { right: stone, left: stone });
  }
  box(faces, 5.5, 26.2, 26.5, 31.2, 10.4, 12, { top: stone, right: stone, left: stone });
  // 穹顶（两段锥台 + 尖顶）
  frustum(faces, 16, 16, 7.2, 6.2, 12, 15.2, {
    side: (u, v, px, py) => pShingle(P.RFTEAL)(u, v, px, py),
  }, 8);
  frustum(faces, 16, 16, 6.2, 2.2, 15.2, 19.8, {
    side: (u, v, px, py) => pShingle(P.RFTEAL)(u, v, px, py),
  }, 8);
  box(faces, 15.3, 15.3, 16.7, 16.7, 19.8, 21.6, {
    right: pBands(P.YELLOW, 64), left: pBands(P.YELLOW, 64), top: () => cell(P.YELLOW, 0),
  });
  // 正门台阶
  box(faces, 7, 30.2, 25, 31.8, 0, 1.1, { top: stone, right: pWall(P.SIDE), left: pWall(P.SIDE) });
  box(faces, 7.8, 31.8, 24.2, 32.6, 0, 2.2, { top: stone, right: pWall(P.SIDE), left: pWall(P.SIDE) });
  return { model: buildModel(faces, 32, 32) };
}

/** 消防局（1×1）：红色卷闸门 ×2 + 晾塔 + 旗杆 */
export function genFireStation(seed: number): BuildResult {
  const r = mulberry32(seed);
  const wall = pick([P.CREAM, P.BRICK], r());
  const h = 13.8;
  const faces: Face[] = [];
  box(faces, 2.2, 2.4, 13.8, 13.6, 0, h, {
    right: pWindows(wall, { seed, lit: 0.15, floorH: 6.9, gapX: 4.5, winH: 2.6 }),
    left: pWindows(wall, { seed: seed ^ 3, lit: 0.15, floorH: 6.9, gapX: 4.5, winH: 2.6, door: true, doorW: 2.4 }),
  });
  // 双开红色卷闸门（+Y 面）
  box(faces, 3.2, 13.6, 7.0, 14.6, 0, 7.6, {
    left: pRedDoor, right: pWall(P.SIDE), top: pWall(P.RED),
  });
  box(faces, 8.6, 13.6, 12.4, 14.6, 0, 7.6, {
    left: pRedDoor, right: pWall(P.SIDE), top: pWall(P.RED),
  });
  // 晾晒塔
  box(faces, 10.8, 2.6, 13.6, 5.4, 0, 21, {
    right: pWindows(wall, { seed: seed ^ 7, lit: 0.15, floorH: 20, winW: 1.4, winH: 2, gapX: 5 }),
    left: pWall(wall),
  });
  box(faces, 10.4, 2.2, 14.0, 5.8, 21, 22.3, {
    top: pFlatRoof(P.RFGRAY, 8), right: pWall(P.SIDE), left: pWall(P.SIDE),
  });
  box(faces, 11.6, 3.4, 12.8, 4.6, 22.3, 23.5, {
    right: pWall(P.RED), left: pWall(P.RED), top: () => cell(P.YELLOW, 0),
  });
  roofDeck(faces, 2.2, 2.4, 10.2, 13.6, h, P.ASPH, pWall(wall));
  flagPole(faces, 12.8, 12.4, 15.5, P.RED);
  return { model: buildModel(faces, 16, 16) };
}

/** 灯塔（1×1）：红白环纹塔身 + 玻璃灯室 + 顶端闪光 */
export function genLighthouse(_seed: number): BuildResult {
  const faces: Face[] = [];
  box(faces, 4.2, 4.2, 11.8, 11.8, 0, 2.4, {
    top: pStone(), right: pStone(), left: pStone(),
  });
  frustum(faces, 8, 8, 3.5, 2.5, 2.4, 21, {
    side: (u, v, px, py) => pBands(P.RED, 4.6)(u, v, px, py),
  }, 8);
  // 环廊
  box(faces, 5.6, 5.6, 10.4, 10.4, 21, 22.5, {
    top: pWall(P.SIDE), right: pWall(P.SIDE), left: pWall(P.SIDE),
  });
  // 灯室
  box(faces, 6.4, 6.4, 9.6, 9.6, 22.5, 26.6, {
    right: pWall(P.GLASS), left: pWall(P.GLASS),
  });
  pyramid(faces, 6.0, 6.0, 10.0, 10.0, 26.6, 29.2, pShingle(P.RED));
  return { model: buildModel(faces, 16, 16), blinkAt: [8, 8, 30] };
}

/** 城堡（2×2）：雉堞城墙 + 四角楼 + 门楼 + 主楼（庭院为白砂砾） */
export function genCastle(_seed: number): BuildResult {
  const faces: Face[] = [];
  const S = pStone();
  const cU = crenel('u');
  const cV = crenel('v');
  // 城墙（北 / 西 / 东；南留门楼）
  box(faces, 2.6, 2.6, 29.4, 5.2, 0, 8, { top: cU, right: S, left: S });
  box(faces, 2.6, 5.2, 5.2, 26.8, 0, 8, { top: cV, right: S, left: S });
  box(faces, 26.8, 5.2, 29.4, 26.8, 0, 8, { top: cV, right: S, left: S });
  box(faces, 2.6, 26.8, 12.4, 29.4, 0, 8, { top: cU, right: S, left: S });
  box(faces, 19.6, 26.8, 29.4, 29.4, 0, 8, { top: cU, right: S, left: S });
  // 门楼双塔 + 拱门
  box(faces, 11.6, 26.2, 15.2, 29.8, 0, 12.5, { right: S, left: S });
  box(faces, 16.8, 26.2, 20.4, 29.8, 0, 12.5, { right: S, left: S });
  cone(faces, 13.4, 28, 2.9, 12.5, 16.8, (u, v, px, py) => pShingle(P.RFSLATE)(u, v, px, py), 8);
  cone(faces, 18.6, 28, 2.9, 12.5, 16.8, (u, v, px, py) => pShingle(P.RFSLATE)(u, v, px, py), 8);
  box(faces, 15.2, 27, 16.8, 29.4, 0, 7, {
    left: () => cell(P.OUTLINE, 0), right: () => cell(P.OUTLINE, 0),
    top: () => cell(P.OUTLINE, 0),
  });
  // 四角楼
  for (const [x0, y0] of [[2.2, 2.2], [25.2, 2.2], [2.2, 25.2], [25.2, 25.2]] as const) {
    box(faces, x0, y0, x0 + 4.8, y0 + 4.8, 0, 14, { right: S, left: S, top: S });
    cone(faces, x0 + 2.4, y0 + 2.4, 3.3, 14, 19.6,
      (u, v, px, py) => pShingle(P.RFSLATE)(u, v, px, py), 8);
  }
  // 中央主楼
  box(faces, 10.5, 10.5, 21.5, 21.5, 0, 17, { right: S, left: S });
  hipRoof(faces, 9.8, 9.8, 22.2, 22.2, 16.6, 23.6, 0.55, {
    slope: (u, v, px, py) => pShingle(P.RFTEAL)(u, v, px, py),
  });
  box(faces, 15.7, 15.7, 16.3, 16.3, 23.6, 25.4, {
    right: pBands(P.YELLOW, 64), left: pBands(P.YELLOW, 64), top: () => cell(P.YELLOW, 0),
  });
  // 庭院水井
  prism(faces, 7.5, 24, 1.6, 0, 3.4, {
    side: (u, v, px, py) => pStone()(u, v, px, py),
    top: () => cell(P.OUTLINE, 0),
  }, 8);
  return { model: buildModel(faces, 32, 32) };
}
