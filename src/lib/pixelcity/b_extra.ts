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

/** 交番（1×1，v12 城市卫士）：两层紧凑警务岗亭 + 蓝灰四坡顶 + 门楣藏青灯箱 + 顶层蓝色警灯 */
export function genKoban(seed: number): BuildResult {
  const faces: Face[] = [];
  const h = 15.2;
  // 主体两层（奶油白墙，一层带大门）
  box(faces, 3.0, 3.2, 13.0, 13.2, 0, h, {
    right: pWindows(P.CREAM, { seed, lit: 0.22, floorH: 7.6, gapX: 4.8, winW: 2.0, winH: 2.4 }),
    left: pWindows(P.CREAM, { seed: seed ^ 5, lit: 0.22, floorH: 7.6, gapX: 4.8, winW: 2.0, winH: 2.4, door: true, doorW: 3.0 }),
  });
  // 门楣灯箱（+Y 前脸藏青横箱，夜间灯箱微光）
  box(faces, 4.8, 13.2, 11.2, 13.9, 8.8, 11.2, {
    left: pWall(P.PBLUE), right: pWall(P.SIDE), top: pFlatRoof(P.PBLUE, 2),
  });
  // 侧墙警徽（+X 面红底 + 白色圆点）
  box(faces, 12.9, 6.6, 13.3, 9.4, 9.4, 12.2, {
    right: pWall(P.RED), left: pWall(P.SIDE), top: pWall(P.SIDE),
  });
  box(faces, 12.9, 7.6, 13.4, 8.4, 10.2, 11.0, {
    right: () => cell(P.CREAM, 0), left: pWall(P.SIDE), top: pWall(P.SIDE),
  });
  // 蓝灰四坡顶
  hipRoof(faces, 2.4, 2.6, 13.6, 13.8, h - 0.4, h + 6.4, 0.62, { slope: pShingle(P.RFSLATE) });
  // 顶层警灯（短金属杆 + 霓虹灯罩，夜间发光）
  box(faces, 7.6, 7.8, 8.6, 8.8, h + 5.6, h + 6.8, {
    right: pWall(P.METAL), left: pWall(P.METAL),
  });
  box(faces, 7.0, 7.2, 9.2, 9.4, h + 6.8, h + 8.6, {
    right: pWall(P.NEONC), left: pWall(P.NEONC), top: () => cell(P.NEONC, 0),
  });
  return { model: buildModel(faces, 16, 16) };
}

/** 警察局（2×2，v23 治安空间化）：米白主楼 + 藏青双坡顶 + 车库卷闸门（巡逻车驶出）+
 *  门楣蓝白灯箱 + 旗杆 + 侧墙警徽 —— 巡防半径 6 格的治安中枢 */
export function genPoliceHQ(seed: number): BuildResult {
  const faces: Face[] = [];
  const wall = (seed & 1) === 0 ? P.CREAM : P.PBLUE;   // 变体：主墙色（米白 / 青白）
  const h = 14.5;
  // ---- 主楼（北侧：两层米白墙 + 大窗，夜里办案灯长明）----
  box(faces, 3, 2.6, 29, 13.4, 0, h, {
    right: pWindows(wall, { seed, lit: 0.42, floorH: 7.2, gapX: 4.6, winW: 2.2, winH: 2.6 }),
    left: pWindows(wall, { seed: seed ^ 5, lit: 0.42, floorH: 7.2, gapX: 4.6, winW: 2.2, winH: 2.6 }),
  });
  gableRoof(faces, 2.4, 2.0, 29.6, 14.0, h - 0.4, h + 6.5, 'x', {
    front: pShingle(P.RFSLATE), back: pShingle(P.RFSLATE), endX: pWall(wall),
  });
  // ---- 门楣灯箱（+Y 正脸藏青横箱 + 白字意象，夜间灯箱亮）----
  box(faces, 9, 13.4, 23, 14.4, 8.6, 11.4, {
    left: pWall(P.PBLUE), right: pWall(P.SIDE), top: pFlatRoof(P.PBLUE, 2),
  });
  box(faces, 11, 14.4, 17, 14.9, 9.2, 10.6, {
    left: () => cell(P.WHITE, 0), right: pWall(P.SIDE), top: pWall(P.SIDE),
  });
  box(faces, 18.5, 14.4, 21, 14.9, 9.2, 10.6, {
    left: () => cell(P.WHITE, 0), right: pWall(P.SIDE), top: pWall(P.SIDE),
  });
  // ---- 双开车库卷闸门（+Y 面，藏青横条门 + 出车坡道）----
  for (const gx of [5.2, 13.2]) {
    box(faces, gx, 13.4, gx + 6.6, 14.8, 0, 7.2, {
      left: (u, v, px, py) => ((v * 1.6) | 0) % 2 === 0 ? cell(P.PBLUE, 1) : cell(P.PBLUE, 0),
      right: pWall(P.SIDE), top: pWall(P.PBLUE),
    });
  }
  box(faces, 4, 14.8, 21.5, 16.2, 0, 0.5, {
    top: () => cell(P.ASPH, 1), right: pWall(P.ASPH), left: pWall(P.ASPH),
  });
  // ---- 侧墙警徽（+X 面红底 + 白色圆点 + 金圈）----
  box(faces, 28.9, 18, 29.3, 21.4, 8.6, 11.6, {
    right: pWall(P.RED), left: pWall(P.SIDE), top: pWall(P.SIDE),
  });
  box(faces, 28.9, 18.9, 29.4, 20.5, 9.3, 10.8, {
    right: () => cell(P.WHITE, 0), left: pWall(P.SIDE), top: pWall(P.SIDE),
  });
  box(faces, 28.8, 18.6, 29.0, 20.8, 9.0, 11.2, {
    right: pWall(P.YELLOW), left: pWall(P.SIDE), top: pWall(P.SIDE),
  });
  // ---- 东侧停车坪（沥青地 + 巡逻车位划线意象）----
  box(faces, 21, 15.5, 29.5, 29.5, 0, 0.4, {
    right: pWall(P.ASPH), left: pWall(P.ASPH), top: () => cell(P.ASPH, 1),
  });
  box(faces, 22.5, 18.5, 28, 18.9, 0.4, 0.55, {
    top: () => cell(P.WHITE, 0),
  });
  // ---- 旗杆 + 檐顶警灯 ----
  flagPole(faces, 26, 27.5, 16, P.RED);
  box(faces, 15.6, 8.2, 16.4, 9.0, h + 5.4, h + 6.6, {
    right: pWall(P.METAL), left: pWall(P.METAL),
  });
  box(faces, 15.2, 7.8, 16.8, 9.4, h + 6.6, h + 8.2, {
    right: pWall(P.NEONC), left: pWall(P.NEONC), top: () => cell(P.NEONC, 0),
  });
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

/** v24 消防栓（1×1）：混凝土方台上的红色栓桩 —— 颈圈 + 侧向出水口 + 穹顶帽 + 顶螺母。
 *  变体 2：漆色（正红 / 消防红瓦）与出水口朝向 */
export function genHydrant(seed: number): BuildResult {
  const r = mulberry32(seed);
  const paint = pick([P.RED, P.RFRED], r());
  const faces: Face[] = [];
  // 混凝土方台（六角小平台意象）
  box(faces, 4.4, 4.4, 11.6, 11.6, 0, 1.1, {
    top: pStone(), right: pStone(), left: pStone(),
  });
  // 底座黄黑警示圈（台缘一圈亮黄 —— 夜里也醒目）
  box(faces, 4.4, 4.4, 5.0, 5.4, 1.1, 1.5, { top: () => cell(P.YELLOW, 0), right: pWall(P.YELLOW), left: pWall(P.YELLOW) });
  box(faces, 10.6, 4.4, 11.6, 5.4, 1.1, 1.5, { top: () => cell(P.YELLOW, 0), right: pWall(P.YELLOW), left: pWall(P.YELLOW) });
  box(faces, 4.4, 10.6, 5.0, 11.6, 1.1, 1.5, { top: () => cell(P.YELLOW, 0), right: pWall(P.YELLOW), left: pWall(P.YELLOW) });
  box(faces, 10.6, 10.6, 11.6, 11.6, 1.1, 1.5, { top: () => cell(P.YELLOW, 0), right: pWall(P.YELLOW), left: pWall(P.YELLOW) });
  // 栓身柱（下粗上细的锥台）
  frustum(faces, 8, 8, 2.3, 1.85, 1.1, 6.2, {
    side: (u, v, px, py) => pWall(paint)(u, v, px, py),
  }, 6);
  // 颈圈（六瓣环箍）
  box(faces, 5.9, 5.9, 10.1, 10.1, 4.4, 5.4, {
    right: pWall(paint), left: pWall(paint), top: pWall(paint),
  });
  // 侧向出水口（+X 侧凸出的短管）
  box(faces, 9.9, 6.9, 11.3, 9.1, 3.8, 5.0, {
    right: pWall(paint), left: () => cell(P.SIDE, 0), top: pWall(paint),
  });
  // 穹顶帽 + 顶螺母
  frustum(faces, 8, 8, 1.85, 0.9, 6.2, 7.3, {
    side: (u, v, px, py) => pWall(paint)(u, v, px, py),
  }, 6);
  box(faces, 7.2, 7.2, 8.8, 8.8, 7.3, 8.1, {
    right: pWall(paint), left: pWall(paint), top: () => cell(P.YELLOW, 0),
  });
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

// ============================================================
// v36 公共卫生空间化：悬壶济世 · 健康之城
// ============================================================

/** v36 社区诊所（1×1）：白墙小楼 + 绿十字招牌 + 条纹雨棚挂号窗 + 门前候诊长椅。
 *  变体 2：墙色（青白 / 米白）与雨棚漆色 —— 与大医院（白楼红十字）拉开身位：
 *  绿十字＝社区医疗的符号，雨棚下是排队挂号的小窗口 */
export function genClinic(seed: number): BuildResult {
  const r = mulberry32(seed);
  const wall = pick([P.PBLUE, P.CREAM], r());
  const awn = pick([P.RFTEAL, P.RFSLATE], r());
  const h = 11.5;
  const faces: Face[] = [];
  // 主楼（白墙两层小楼）
  box(faces, 2.6, 2.6, 13.4, 13.4, 0, h, {
    right: pWindows(wall, { seed, lit: 0.3, floorH: 5.8, gapX: 4.2, winH: 2.4 }),
    left: pWindows(wall, { seed: seed ^ 5, lit: 0.3, floorH: 5.8, gapX: 4.2, winH: 2.4, door: true, doorW: 2.2 }),
  });
  // 绿十字招牌（+Y 门脸上方 —— 与医院红十字区分的社区绿）
  box(faces, 4.6, 13.4, 9.4, 14.2, h - 3.4, h - 0.6, {
    left: (u, v) => {
      // 绿底白十字：边长 4.8 的面中央十字
      const s = 4.8, c = s / 2, bar = s * 0.2;
      const uu = u - 0.6, vv = v - 0.9;
      if (uu >= 0 && uu < s && vv >= 0 && vv < s) {
        if (Math.abs(uu - c) < bar || Math.abs(vv - c) < bar) return cell(P.WHITE, 0);
        return cell(P.CYAN, 0);
      }
      return cell(P.WHITE, 0);
    },
    right: pWall(P.WHITE), top: pWall(awn),
  });
  // 青瓦缓坡顶
  hipRoof(faces, 1.6, 1.6, 14.4, 14.4, h - 0.4, h + 3.8, 0.55, { slope: pShingle(awn) });
  // 门前雨棚 + 挂号小窗（+Y）
  box(faces, 3.0, 13.4, 9.8, 15.4, 4.6, 5.6, {
    top: pAwning(awn), right: pWall(awn), left: pWall(awn),
  });
  box(faces, 3.6, 14.4, 6.6, 15.2, 5.6, 7.4, {
    left: pSign(P.CYAN, seed), right: pWall(P.WHITE),
  });
  // 候诊长椅（门前贴街）
  box(faces, 9.0, 14.2, 12.6, 15.4, 0.4, 1.6, {
    top: () => cell(P.RFTEAL, 0), right: pWall(P.RFTEAL), left: pWall(P.RFTEAL),
  });
  // 药箱木箱堆（侧墙边）
  box(faces, 1.0, 4.2, 2.6, 6.0, 0.3, 2.3, {
    top: () => cell(P.TAN, 0), right: pWall(P.TAN), left: pWall(P.TAN),
  });
  box(faces, 1.0, 6.2, 2.6, 7.6, 0.3, 1.8, {
    top: () => cell(P.SIDE, 0), right: pWall(P.SIDE), left: pWall(P.SIDE),
  });
  return { model: buildModel(faces, 16, 16) };
}

/** v36 防疫站（1×1）：青灰哨所 + 白十字旗杆 + 消毒药剂罐排 + 顶置警报灯。
 *  变体 2：主墙漆色（青白 / 青绿瓦）—— 公共卫生的哨兵意象：
 *  白旗十字迎风，罐排里码着消毒水，警报灯一闪「全城防疫网在此值守」 */
export function genHealthst(seed: number): BuildResult {
  const r = mulberry32(seed);
  const wall = pick([P.PBLUE, P.RFSLATE], r());
  const h = 13.2;
  const faces: Face[] = [];
  // 哨所主楼（方正矮墩，黄黑警示基线）
  box(faces, 2.4, 2.4, 13.6, 13.6, 0, h, {
    right: pWindows(wall, { seed, lit: 0.2, floorH: 6.6, gapX: 4.4, winH: 2.4 }),
    left: pWindows(wall, { seed: seed ^ 7, lit: 0.2, floorH: 6.6, gapX: 4.4, winH: 2.4, door: true, doorW: 2.4 }),
  });
  // 基线黄黑警示圈（防疫重地的门槛意象）
  box(faces, 2.4, 2.4, 13.6, 13.6, 0.9, 1.5, {
    right: pBands(P.YELLOW, 1.6), left: pBands(P.YELLOW, 1.6),
  });
  // 平顶 + 女儿墙
  roofDeck(faces, 2.4, 2.4, 13.6, 13.6, h, P.RFGRAY, pWall(wall));
  // 顶置警报灯（琥珀灯罩 —— 疫情警报就亮它）
  box(faces, 7.0, 7.0, 9.4, 9.4, h, h + 2.2, {
    right: pWall(P.SIDE), left: pWall(P.SIDE), top: () => cell(P.YELLOW, 0),
  });
  // 消毒药剂罐排（前院贴墙：三只青瓶白盖）
  for (const [x0, y0] of [[10.6, 14.6], [12.0, 14.6], [13.4, 14.6]] as const) {
    frustum(faces, (x0 + x0 + 1.2) / 2, y0 + 0.6, 0.62, 0.5, 0.2, 2.6, {
      side: (u, v, px, py) => pWall(P.CYAN)(u, v, px, py),
    }, 6);
    box(faces, x0 + 0.1, y0, x0 + 1.1, y0 + 1.2, 2.6, 3.0, { top: () => cell(P.WHITE, 0) });
  }
  // 白十字旗杆（侧角：白底红十字旗 —— 公共卫生的哨旗）
  flagPole(faces, 3.4, 3.4, h + 8.5, P.WHITE);
  return { model: buildModel(faces, 16, 16) };
}

// ============================================================
// v39 城市之声：报馆（2×2，双变体）—— 编辑楼 + 锯齿天窗排字房 +
// 门楣「日报」灯箱 + 楼顶卷筒纸卷 + 侧墙霓虹「报」字 + 门前报纸垛
// ============================================================

/** 报馆（2×2，v39 城市之声）：米白编辑楼与排字房，夜班灯亮到截稿 */
export function genPress(seed: number): BuildResult {
  const faces: Face[] = [];
  const r = mulberry32(seed);
  const wall = pick([P.CREAM, P.TAN], r());          // 变体：主墙色
  const neon = pick([P.NEONR, P.NEONC], r());        // 变体：霓虹「报」字色
  const h = 15.0;
  // ---- 编辑主楼（北侧三层：米白墙 + 大窗，夜班排字灯长明）----
  box(faces, 3, 2.6, 24.6, 13.2, 0, h, {
    right: pWindows(wall, { seed, lit: 0.5, floorH: 5.2, gapX: 4.4, winW: 2.2, winH: 2.6 }),
    left: pWindows(wall, { seed: seed ^ 9, lit: 0.5, floorH: 5.2, gapX: 4.4, winW: 2.2, winH: 2.6, door: true, doorW: 3.2 }),
  });
  gableRoof(faces, 2.4, 2.0, 25.2, 13.8, h - 0.4, h + 5.6, 'x', {
    front: pShingle(P.RFSLATE), back: pShingle(P.RFSLATE), endX: pWall(wall),
  });
  // ---- 排字房（南侧低层平顶 + 锯齿天窗：油墨与铅字的工坊）----
  box(faces, 20.2, 4.2, 29.2, 12.6, 0, 8.2, {
    right: pWindows(wall, { seed: seed ^ 3, lit: 0.34, floorH: 8.0, gapX: 4.0, winW: 2.0, winH: 2.2 }),
  });
  roofDeck(faces, 20.2, 4.2, 29.2, 12.6, 8.2, P.RFGRAY, pWall(wall));
  for (let i = 0; i < 3; i++) {
    box(faces, 21.4 + i * 2.6, 6.0, 23.0 + i * 2.6, 8.4, 8.2, 10.4, {
      right: pSawTooth(true), left: pWall(P.SIDE), top: pWall(P.SIDE),
    });
  }
  // ---- 门楣灯箱（+Y 正脸藏青横箱 + 白字意象，夜间灯箱亮）----
  box(faces, 6.5, 13.2, 15.5, 14.2, 8.6, 11.4, {
    left: pWall(P.PBLUE), right: pWall(P.SIDE), top: pFlatRoof(P.PBLUE, 2),
  });
  box(faces, 8.2, 14.2, 11.4, 14.7, 9.2, 10.6, {
    left: () => cell(P.WHITE, 0), right: pWall(P.SIDE), top: pWall(P.SIDE),
  });
  box(faces, 12.4, 14.2, 13.8, 14.7, 9.2, 10.6, {
    left: () => cell(P.WHITE, 0), right: pWall(P.SIDE), top: pWall(P.SIDE),
  });
  // ---- 侧墙霓虹「报」字（+X 面红底 + 白色方字块，夜间发光）----
  box(faces, 24.6, 5.6, 25.4, 10.4, 10.0, 14.6, {
    right: pWall(neon), left: pWall(P.SIDE), top: pWall(P.SIDE),
  });
  box(faces, 25.4, 6.6, 25.9, 9.4, 11.0, 13.6, {
    right: () => cell(P.WHITE, 0), left: pWall(P.SIDE), top: pWall(P.SIDE),
  });
  const blinkAt: V3 = [25.6, 8, 12.3];
  // ---- 楼顶卷筒纸卷（白色双卷轴：新闻纸出厂的意象）----
  frustum(faces, 8.5, 6.5, 1.5, 1.5, h + 5.6, h + 11.8, {
    side: (u, v, px, py) => pWall(P.WHITE)(u, v, px, py),
  }, 8);
  frustum(faces, 8.5, 6.5, 2.0, 2.0, h + 5.6, h + 9.2, {
    side: (u, v, px, py) => pWall(P.SIDE)(u, v, px, py),
  }, 8);
  frustum(faces, 15.5, 8.5, 1.2, 1.2, h + 5.6, h + 9.6, {
    side: (u, v, px, py) => pWall(P.WHITE)(u, v, px, py),
  }, 8);
  // ---- 门前报纸垛（三级白盒：清晨捆好的投递份）----
  for (let i = 0; i < 3; i++) {
    box(faces, 16.6 + i * 0.4, 14.4 + i * 0.5, 19.4 - i * 0.4, 16.2 - i * 0.5, 0, 0.8 + i * 0.5, {
      right: pWall(P.WHITE), left: pWall(P.WHITE), top: pWall(P.SIDE),
    });
  }
  // ---- 前廊台阶 ----
  box(faces, 6.5, 14.2, 15.5, 15.6, 0, 1.1, { top: pWall(P.SIDE), right: pWall(P.SIDE), left: pWall(P.SIDE) });
  return { model: buildModel(faces, 32, 32), blinkAt };
}

// ============================================================
// v40 城市之光：名人堂（2×2，双变体）—— 柱廊主殿 + 金字塔鎏金顶 +
// 双雕像台 + 侧墙金星徽 —— 每逢换季整点评出一颗「本季城市之光」
// ============================================================

/** 名人堂（2×2，v40 城市之光）：荣誉殿堂与季评授勋的礼台 */
export function genHall(seed: number): BuildResult {
  const faces: Face[] = [];
  const r = mulberry32(seed);
  const wall = pick([P.CREAM, P.TAN], r());          // 变体：主殿墙色
  const stone = pStone();
  const cream = pStone(wall);
  // ---- 基座 ----
  box(faces, 2, 2, 30, 30, 0, 3, { top: stone, right: stone, left: stone });
  // ---- 主殿（比博物馆矮壮：荣誉殿堂的敦厚气象）----
  box(faces, 5.5, 5.5, 26.5, 26.5, 3, 11, { right: cream, left: cream });
  // ---- 前廊柱列 + 檐口 ----
  for (let i = 0; i < 5; i++) {
    const cx = 7.5 + i * 4.3;
    box(faces, cx - 0.9, 27.2, cx + 0.9, 30.2, 3, 9.6, { right: stone, left: stone });
  }
  box(faces, 5.5, 26.2, 26.5, 31.2, 9.6, 11, { top: stone, right: stone, left: stone });
  // ---- 鎏金金字塔顶（荣誉的尖顶，夜间也醒目）----
  pyramid(faces, 6.5, 6.5, 25.5, 25.5, 11, 19.2,
    (u, v, px, py) => pShingle(P.YELLOW)(u, v, px, py));
  box(faces, 15.2, 15.2, 16.8, 16.8, 19.2, 20.8, { right: pWall(P.METAL), left: pWall(P.METAL) });
  box(faces, 14.6, 14.6, 17.4, 17.4, 20.8, 21.6, {
    right: () => cell(P.YELLOW, 0), left: pWall(P.METAL), top: () => cell(P.YELLOW, 0),
  });
  // ---- 双雕像台（+Y 正脸两侧：铜像站在石台上 —— 每一届的光都在墙上）----
  for (const sx of [5.6, 24.4]) {
    box(faces, sx - 2.6, 27.6, sx + 2.6, 32.4, 0, 2.2, { top: stone, right: pWall(P.SIDE), left: pWall(P.SIDE) });
    // 铜像：座 + 身 + 头（三段方盒，像素纪念像）
    box(faces, sx - 1.0, 28.8, sx + 1.0, 31.0, 2.2, 3.4, { right: pWall(P.TAN), left: pWall(P.TAN) });
    box(faces, sx - 0.8, 29.2, sx + 0.8, 30.8, 3.4, 5.8, { right: pWall(P.TAN), left: pWall(P.TAN) });
    box(faces, sx - 0.6, 29.5, sx + 0.6, 30.5, 5.8, 7.0, { right: pWall(P.TAN), left: pWall(P.TAN) });
  }
  // ---- 侧墙金星徽（+X 面：金底 + 白色星点意象）----
  box(faces, 26.5, 14.2, 27.3, 17.8, 5.4, 8.2, {
    right: pWall(P.YELLOW), left: pWall(P.SIDE), top: pWall(P.SIDE),
  });
  box(faces, 27.3, 15.2, 27.7, 16.8, 6.0, 7.6, {
    right: () => cell(P.WHITE, 0), left: pWall(P.SIDE), top: pWall(P.SIDE),
  });
  // ---- 正门台阶 ----
  box(faces, 7, 30.2, 25, 31.8, 0, 1.1, { top: stone, right: pWall(P.SIDE), left: pWall(P.SIDE) });
  box(faces, 7.8, 31.8, 24.2, 32.6, 0, 2.2, { top: stone, right: pWall(P.SIDE), left: pWall(P.SIDE) });
  return { model: buildModel(faces, 32, 32) };
}

// ============================================================
// v41 轨道时代：地铁站（玻璃雨棚 + M 立柱）与地铁车辆段（全线锚点）
// ============================================================

/** 「M」站标图案（蓝底白 M 的立柱面） */
const pMetroM = (w: number, h: number): PatFn => (u, v) => {
  // 立柱面局部坐标：中央画白色 M（两竖 + 中谷）
  const mu = u - w / 2, mv = v;
  if (mv > h * 0.28 && mv < h * 0.78) {
    const left = Math.abs(mu + w * 0.18) < w * 0.08;
    const right = Math.abs(mu - w * 0.18) < w * 0.08;
    const mid = mv > h * 0.5 && Math.abs(mu) < w * 0.06;
    if (left || right || mid) return cell(P.WHITE, 0);
  }
  return cell(P.PBLUE, mv > h * 0.9 ? 2 : 0);
};

/** 地铁站（2×2）：混凝土坪 + 下行楼梯 + 玻璃雨棚 + M 立柱 + 售货亭 */
export function genMetrostop(seed: number): BuildResult {
  const r = mulberry32(seed);
  const faces: Face[] = [];
  const frame = pick([P.PBLUE, P.CYAN], r());     // 变体：雨棚框色（藏青 / 青）
  const awn = pick([P.RED, P.PAINTY], r());       // 变体：售货亭雨棚色
  // ---- 混凝土地坪 ----
  box(faces, 1.5, 1.5, 30.5, 30.5, 0, 0.8, {
    top: pFlatRoof(P.RFGRAY, 2), right: pWall(P.SIDE), left: pWall(P.SIDE),
  });
  // ---- 下行楼梯（中央：三级踏步 + 入口洞口，地平线以下用洞口示意）----
  box(faces, 12.2, 24.6, 19.8, 26.2, 0.8, 3.0, { top: pFlatRoof(P.RFGRAY, 1), right: pWall(P.METAL), left: pWall(P.METAL) });
  box(faces, 12.8, 26.2, 19.2, 27.6, 0.8, 2.2, { top: pFlatRoof(P.RFGRAY, 1), right: pWall(P.METAL), left: pWall(P.METAL) });
  box(faces, 13.4, 27.6, 18.6, 28.9, 0.8, 1.4, { top: pFlatRoof(P.RFGRAY, 1), right: pWall(P.METAL), left: pWall(P.METAL) });
  box(faces, 13.9, 28.9, 18.1, 30.2, 0.8, 0.9, { top: () => cell(P.OUTLINE, 0), right: () => cell(P.OUTLINE, 0), left: () => cell(P.OUTLINE, 0) });
  // 扶手栏杆（楼梯两侧）
  box(faces, 11.6, 24.4, 12.2, 30.0, 0.8, 4.0, { right: pWall(P.METAL), left: pWall(P.METAL), top: pWall(P.METAL) });
  box(faces, 19.8, 24.4, 20.4, 30.0, 0.8, 4.0, { right: pWall(P.METAL), left: pWall(P.METAL), top: pWall(P.METAL) });
  // ---- 玻璃雨棚（罩住楼梯口：金属框柱 + 玻璃顶 + 檐下夜灯）----
  box(faces, 6.4, 22.6, 7.6, 23.8, 0.8, 9.2, { right: pWall(frame), left: pWall(frame) });
  box(faces, 24.4, 22.6, 25.6, 23.8, 0.8, 9.2, { right: pWall(frame), left: pWall(frame) });
  box(faces, 4.6, 21.8, 27.4, 24.6, 9.2, 10.6, {
    top: pGlassTop, right: pBands(frame, 3), left: pBands(frame, 3),
  });
  box(faces, 7.5, 24.3, 24.5, 25.0, 8.4, 9.3, {
    left: pWall(P.NEONC), right: pWall(P.NEONC), top: () => cell(P.WHITE, 0),
  });
  // ---- M 立柱（右侧：蓝底白 M 的站标柱，远处一眼认出地铁口）----
  box(faces, 27.0, 3.6, 29.8, 6.4, 0.8, 13.6, {
    right: pMetroM(2.8, 12.8), left: pMetroM(2.8, 12.8), top: pWall(P.METAL),
  });
  box(faces, 26.6, 3.2, 30.2, 6.8, 0, 0.8, { top: pFlatRoof(P.RFGRAY, 1), right: pWall(P.SIDE), left: pWall(P.SIDE) });
  // ---- 售货亭（左侧：报刊亭小屋 + 雨棚）----
  box(faces, 2.6, 8.0, 9.4, 14.8, 0.8, 6.4, {
    right: pWindows(P.CREAM, { seed, lit: 0.14, floorH: 5.6, gapX: 3.2 }),
    left: pWindows(P.CREAM, { seed: seed ^ 7, lit: 0.14, floorH: 5.6, gapX: 3.2 }),
  });
  box(faces, 2.2, 7.6, 9.8, 15.2, 6.4, 7.2, { top: pFlatRoof(P.RFGRAY, 2), right: pWall(P.RFGRAY), left: pWall(P.RFGRAY) });
  box(faces, 1.8, 14.9, 10.2, 16.4, 5.2, 7.0, {
    top: pAwning(awn), right: pAwning(awn), left: pAwning(awn),
  });
  // ---- 隔离柱 ×3（临街一排小柱）----
  for (const bx of [5.5, 14.5, 23.5]) {
    box(faces, bx - 0.5, 30.8, bx + 0.5, 31.8, 0.8, 2.6, { right: pWall(P.METAL), left: pWall(P.METAL), top: () => cell(P.PAINTY, 0) });
  }
  return { model: buildModel(faces, 32, 32) };
}

/** 地铁车辆段（3×3）：锯齿顶车库 + 双股轨道 + 地铁列车 + 调度塔（全线网络的锚点） */
export function genMetrodepot(seed: number): BuildResult {
  const r = mulberry32(seed);
  const faces: Face[] = [];
  const stripe = pick([P.RFTEAL, P.CYAN], r());     // 变体：列车腰线色
  // ---- 混凝土作业坪 ----
  box(faces, 1.5, 1.5, 46.5, 46.5, 0, 0.6, {
    top: pFlatRoof(P.RFGRAY, 1), right: pWall(P.SIDE), left: pWall(P.SIDE),
  });
  // ---- 主车库（北侧大跨：波纹铁皮 + 三条天窗脊）----
  box(faces, 4, 3, 44, 19.5, 0.6, 12.5, {
    right: pCorrugated(P.RFGRAY), left: pCorrugated(P.RFGRAY),
  });
  box(faces, 3.4, 2.4, 44.6, 20.1, 12.5, 13.5, { top: pFlatRoof(P.RFGRAY, 2), right: pWall(P.RFGRAY), left: pWall(P.RFGRAY) });
  for (const sy of [6.5, 11, 15.5]) {
    box(faces, 7, sy, 41, sy + 2.2, 13.5, 14.6, {
      top: pGlassTop, right: pWall(P.METAL), left: pWall(P.METAL),
    });
  }
  // ---- 车库大门 ×3（+Y 面：红灰分段卷闸）----
  for (const dx of [7, 19.5, 32]) {
    box(faces, dx, 19.6, dx + 6.5, 20.4, 0.6, 8.6, { left: pBands(P.RED, 5), right: pBands(P.RED, 5) });
  }
  // ---- 双股轨道（车场：枕木 + 双轨）----
  for (const ry of [27, 38.5]) {
    for (let i = 0; i < 14; i++) {
      box(faces, 2.5 + i * 3.1, ry - 1.1, 3.9 + i * 3.1, ry + 1.1, 0.6, 1.3, {
        top: pFlatRoof(P.DIRT, 1), right: pWall(P.DIRT), left: pWall(P.DIRT),
      });
    }
    for (const off of [-0.75, 0.75]) {
      box(faces, 2.2, ry + off - 0.25, 45.8, ry + off + 0.25, 1.3, 2.1, {
        top: () => cell(P.METAL, 1), right: () => cell(P.METAL, 2), left: () => cell(P.METAL, 0),
      });
    }
  }
  // ---- 检修坑（两股之间：暗槽）----
  box(faces, 4, 31.5, 44, 34.5, 0.6, 1.0, { top: () => cell(P.OUTLINE, 0), right: pWall(P.SIDE), left: pWall(P.SIDE) });
  // ---- 北股：停放的三节地铁列车（白车身 + 腰线 + 窗带）----
  for (let i = 0; i < 3; i++) {
    const cx = 4.5 + i * 13.4;
    box(faces, cx, 24.9, cx + 12.2, 29.1, 2.1, 4.3, { right: pWall(P.METAL), left: pWall(P.METAL) });   // 底盘
    box(faces, cx, 25.1, cx + 12.2, 28.9, 4.3, 9.3, {
      right: pWindows(P.CREAM, { seed: seed + i, lit: 0.22, floorH: 9.3, gapX: 2.6 }),
      left: pWindows(P.CREAM, { seed: seed + i * 3, lit: 0.22, floorH: 9.3, gapX: 2.6 }),
      top: pFlatRoof(P.RFGRAY, 2),
    });
    box(faces, cx, 25.4, cx + 12.2, 28.6, 4.3, 5.6, {
      right: pWall(stripe), left: pWall(stripe), top: pWall(stripe),
    });   // 腰线色带
    box(faces, cx - 0.9, 25.6, cx + 0.2, 28.4, 4.3, 9.0, { right: pWall(P.PAINTY), left: pWall(P.PAINTY) });   // 车头黄脸
  }
  // ---- 调度塔（东南角：高塔 + 值班室 + 顶信号灯）----
  box(faces, 38.5, 41.5, 43.5, 46, 0.6, 19.5, { right: pWall(P.METAL), left: pWall(P.METAL) });
  box(faces, 37.8, 40.8, 44.2, 46.7, 19.5, 22.8, {
    right: pWindows(P.PBLUE, { seed: seed ^ 11, lit: 0.3, floorH: 22.8, gapX: 3 }),
    left: pWindows(P.PBLUE, { seed: seed ^ 13, lit: 0.3, floorH: 22.8, gapX: 3 }),
    top: pFlatRoof(P.RFGRAY, 2),
  });
  box(faces, 40.4, 43.2, 41.6, 44.4, 22.8, 24.6, { right: pWall(P.METAL), left: pWall(P.METAL) });
  box(faces, 40.1, 42.9, 41.9, 44.7, 24.6, 25.6, {
    right: () => cell(P.RED, 0), left: () => cell(P.RED, 0), top: () => cell(P.RED, 0),
  });
  // ---- 办公小屋（西南角：运营值班房 + 雨棚）----
  box(faces, 2.5, 41.5, 11.5, 46.2, 0.6, 6.8, {
    right: pWindows(P.CREAM, { seed: seed ^ 17, lit: 0.12, floorH: 6.8, gapX: 3.4 }),
    left: pWindows(P.CREAM, { seed: seed ^ 19, lit: 0.12, floorH: 6.8, gapX: 3.4 }),
  });
  box(faces, 2.2, 41.2, 11.8, 46.5, 6.8, 7.6, { top: pFlatRoof(P.RFGRAY, 2), right: pWall(P.RFGRAY), left: pWall(P.RFGRAY) });
  box(faces, 11.6, 42.8, 14.2, 45.2, 4.6, 6.2, { top: pAwning(P.RFTEAL), right: pAwning(P.RFTEAL), left: pAwning(P.RFTEAL) });
  return { model: buildModel(faces, 48, 48), blinkAt: [41, 43.8, 25.1] };
}
