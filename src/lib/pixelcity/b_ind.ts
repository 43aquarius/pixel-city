// ============================================================
// b_ind.ts — 工业建筑：工厂(2×2，锯齿屋顶+烟囱) / 仓库(2×2) / 储油罐(1×1)
// ============================================================

import { box, gableRoof, prism, frustum, makeFace, buildModel, type Face, type V3 } from './geo';
import {
  pWall, pCorrugated, pShutter, pFlatRoof, pSawTooth, pWindows, pTankShell, pBands, pStone,
} from './patterns';
import { RAMP, bayer } from './palette';
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

// ============================================================
// v20 万家灯火·电网时代 — 工业：风力发电场(2×2) / 太阳能电站(2×2)
// ============================================================

/** 单台风机部件：混凝土基座 + 白塔筒 + 机舱 + 三叶片（竖面朝 +Y）。
 *  叶角随 rot 变体错开；塔顶红灯由 windfarm 整体 blinkAt 挂最高那台 */
function windTurbine(faces: Face[], cx: number, cy: number, h: number, rot: number): void {
  // 混凝土基座（圆台）
  frustum(faces, cx, cy, 3.0, 2.0, 0, 1.8, { side: pStone(P.SIDE) }, 6);
  // 白塔筒
  prism(faces, cx, cy, 1.15, 1.8, h - 3.2, {
    side: (u, v, px, py) => (u % 6 < 1.2 ? cell(P.CREAM, 2) : cell(P.CREAM, 0)),
  }, 8);
  // 机舱（白匣 + 顶散热鳍）
  box(faces, cx - 1.6, cy - 1.3, cx + 1.6, cy + 1.0, h - 3.2, h - 0.6, {
    right: pWall(P.WHITE), left: pWall(P.WHITE), top: pWall(P.CREAM),
  });
  // 轮毂（暖黄点）
  box(faces, cx - 0.5, cy - 1.7, cx + 0.5, cy - 0.9, h - 2.6, h - 1.2, {
    right: pWall(P.METAL), left: pWall(P.METAL), top: () => cell(P.YELLOW, 0),
  });
  // 三叶片（X-Z 竖面朝 -Y；后叶翻法线 —— 与风车磨坊同款投影）
  for (let k = 0; k < 3; k++) {
    const th = rot + k * 2 * Math.PI / 3;
    const c = Math.cos(th), s = Math.sin(th);
    const front = s < 0 || (Math.abs(s) < 0.01 && c < 0) ? false : true;
    const sg = front ? 1 : -1;
    const zz = h - 1.9;
    const pR = (R: number, w: number): V3 => [cx + R * c - w * s, cy - 1.8, zz + R * s + w * c];
    faces.push(makeFace(
      [pR(1.8, 0.45), pR(8.2, 0.95), pR(8.2, -0.95), pR(1.8, -0.45)],
      [sg * c, 0, sg * s],
      pWall(P.CREAM),
      [cx, cy - 1.8, zz],
      [c, 0, s],
      [-s, 0, c],
    ));
  }
}

/** 风力发电场（2×2，LV5·需「电力工程」）：三台三叶风机错落 + 检修小屋。
 *  清洁大电源：-60MW 零污染；夜里风场是黑原野上三盏红星星（最高塔顶 blinkAt 航空灯） */
export function genWindfarm(seed: number): BuildResult {
  const faces: Face[] = [];
  const rotA = (seed & 1) === 0 ? 0.35 : 1.05;             // 变体：叶角相位
  const rotB = rotA + 0.8, rotC = rotA + 1.9;
  // 北高南低（北 = 小 y，深度排序自然：高的在后不遮低的）
  windTurbine(faces, 8.5, 8.5, 20.5, rotA);
  windTurbine(faces, 23, 12.5, 17, rotB);
  windTurbine(faces, 15.5, 24, 14.5, rotC);
  // 检修小屋（一扇 GLASS 窗夜里亮暖灯 —— 荒野风场的一点人烟）
  box(faces, 25.5, 25.5, 30.5, 30.5, 0, 4.2, {
    right: (u, v, px, py) => (u > 0.8 && u < 2.6 && v > 1 && v < 3.2 ? cell(P.GLASS, 0) : pWall(P.RFSLATE)(u, v, px, py)),
    left: pWall(P.RFSLATE), top: pFlatRoof(P.RFGRAY, 2),
  });
  // 电缆沟示意（基座间细土带）
  box(faces, 6.2, 10.5, 24.8, 11.6, 0, 0.5, {
    top: pWall(P.DIRT), right: pWall(P.DIRT), left: pWall(P.DIRT),
  });
  return { model: buildModel(faces, 32, 32), blinkAt: [8.5, 8.5, 21.2] as V3 };
}

/** 太阳能电站（2×2，LV6·需「电力工程」）：3×3 斜面光伏板阵列 + 逆变器小屋。
 *  仅白昼发电（-50MW × dayLight，夜里归零）；面板 PBLUE 非玻璃 —— 夜里整片沉暗，
 *  只剩小屋一盏值班暖灯（GLASS）。变体：板阵反光密度 */
export function genSolarfarm(seed: number): BuildResult {
  const faces: Face[] = [];
  const glint = (seed & 1) === 0 ? 0.10 : 0.22;             // 变体：白闪密度
  // ---- 单板：斜面 makeFace（底沿 +Y 低、顶沿 -Y 高，朝南倾）+ 白框 + 双支撑腿 ----
  const panel = (px: number, py: number): void => {
    // 支撑腿（后缘两根）
    box(faces, px - 2.4, py - 2.0, px - 1.6, py - 1.2, 0, 3.6, {
      right: pWall(P.METAL), left: pWall(P.METAL),
    });
    box(faces, px + 1.6, py - 2.0, px + 2.4, py - 1.2, 0, 3.6, {
      right: pWall(P.METAL), left: pWall(P.METAL),
    });
    // 斜面板面（PBLUE 深蓝 + 边框白 + 稀疏白闪）
    faces.push(makeFace(
      [[px - 3.0, py + 1.4, 2.2], [px + 3.0, py + 1.4, 2.2], [px + 3.0, py - 1.4, 5.6], [px - 3.0, py - 1.4, 5.6]],
      [0.35, 1, 0.55],
      (u, v, x, y) => {
        if (u < 0.45 || u > 5.55 || v < 0.45) return cell(P.WHITE, 0);       // 白边框
        if (bayer(x, y, glint)) return cell(P.WHITE, 0);                     // 白天反光闪点
        const t = v / 4.8;
        return cell(P.PBLUE, t < 0.4 ? 2 : t < 0.75 ? 1 : 0);               // 深蓝三阶
      },
      [px - 3.0, py + 1.4, 2.2],
      [6, 0, 0],
      [0, -2.8, 3.4],
    ));
  };
  // 3×3 板阵
  for (const py of [5, 12.5, 20]) {
    for (const px of [5, 12.5, 20]) panel(px, py);
  }
  // 逆变器小屋（一扇 GLASS 窗夜里亮暖灯）
  box(faces, 25.5, 25.5, 30.5, 30.5, 0, 4.6, {
    right: (u, v, px, py) => (u > 0.8 && u < 2.6 && v > 1 && v < 3.2 ? cell(P.GLASS, 0) : pWall(P.RFGRAY)(u, v, px, py)),
    left: pWall(P.RFGRAY), top: pFlatRoof(P.RFGRAY, 2),
  });
  return { model: buildModel(faces, 32, 32) };
}
