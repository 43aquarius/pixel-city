// ============================================================
// b_waste.ts — v21 环卫设施（拾荒之路 · 循环之城）
//   垃圾收集站（1×1，小范围清运）/ 回收中心（2×2，垃圾变钱的循环工坊）/
//   焚烧发电厂（2×2，垃圾变电但烟囱冒烟 —— 与 v19 雾霾 / v20 电网三角联动）
// ============================================================

import { box, frustum, prism, cone, gableRoof, buildModel, type Face } from './geo';
import {
  pWall, pWindows, pFlatRoof, pCorrugated, pStone, pSign, pBands, cell,
  type PatFn,
} from './patterns';
import { RAMP, bayer } from './palette';
import { acUnit, type BuildResult } from './b_util';
import type { V3 } from './geo';

const P = RAMP;

// ============================================================
// 垃圾收集站（1×1，LV2）：深绿翻盖垃圾箱排 + 低围挡 + 手推清运车棚
// ============================================================

/** 变体：箱排色（森林绿 / 青瓷绿交替） */
export function genBinshed(seed: number): BuildResult {
  const faces: Face[] = [];
  const binRamp = (seed & 1) === 0 ? P.PINE : P.RFTEAL;
  // ---- 混凝土硬化地坪 ----
  box(faces, 2.4, 2.4, 13.6, 13.6, 0, 0.5, {
    right: pStone(P.SIDE), left: pStone(P.SIDE), top: () => cell(P.SIDE, 1),
  });
  // ---- 后场低围挡（三段矮墙，开口朝南）----
  box(faces, 2.6, 3.0, 13.4, 3.6, 0.5, 2.6, { right: pWall(P.SIDE), left: pWall(P.CREAM) });
  box(faces, 2.6, 12.4, 13.4, 13.0, 0.5, 2.6, { right: pWall(P.CREAM), left: pWall(P.SIDE) });
  box(faces, 2.6, 3.0, 3.2, 13.4, 0.5, 2.6, { right: pWall(P.SIDE), left: pWall(P.SIDE) });
  // ---- 三座翻盖垃圾箱（箱体 + 深色翻盖 + 侧面把手）----
  for (let k = 0; k < 3; k++) {
    const bx = 4.2 + k * 3.4, by = 4.6;
    // 箱体（绿墙 + 铆钉横带）
    box(faces, bx, by, bx + 2.6, by + 6.4, 0.5, 5.6, {
      right: (u, v, px, py) => pBands(binRamp, 4.2)(u, v, px, py),
      left: pWall(binRamp),
      top: () => cell(P.OUTLINE, 1),
    });
    // 翻盖（深色斜盖，前高后低）
    box(faces, bx - 0.15, by - 0.3, bx + 2.75, by + 2.2, 5.6, 6.9, {
      right: pWall(P.OUTLINE), left: pWall(P.METAL), top: () => cell(P.METAL, 1),
    });
    // 投放口黄条（警示色）
    box(faces, bx + 0.3, by - 0.32, bx + 2.3, by - 0.02, 3.6, 4.6, {
      left: () => cell(P.YELLOW, 1),
    });
  }
  // ---- 角落手推清运车（双轮斗车 + 手柄）----
  box(faces, 10.6, 10.2, 12.6, 11.8, 0.5, 2.4, {
    right: pWall(P.RED), left: pWall(P.RED), top: () => cell(P.RED, 1),
  });
  box(faces, 12.3, 10.9, 13.6, 11.3, 2.0, 3.0, {
    right: pWall(P.METAL), left: pWall(P.METAL),
  });
  // ---- 围挡上的回收标识牌（绿底白三角箭头意象）----
  box(faces, 7.0, 2.62, 9.0, 3.02, 2.6, 4.8, {
    right: () => cell(P.WHITE, 0), left: pSign(P.RFTEAL, seed),
  });
  return { model: buildModel(faces, 16, 16) };
}

// ============================================================
// 回收中心（2×2，LV5）：大跨度分拣厂房 + 露天传送带 + 打包方块垛
// ============================================================

export function genRecycle(seed: number): BuildResult {
  const faces: Face[] = [];
  const roofRamp = (seed & 1) === 0 ? P.RFSLATE : P.RFTEAL;   // 变体：厂房屋面色
  // ---- 分拣主厂房（波纹铁皮 + 高侧窗）----
  box(faces, 2.2, 3.0, 16.5, 15.0, 0, 10.5, {
    right: pCorrugated(P.CREAM),
    left: pWindows(P.TAN, { seed, lit: 0.16, floorH: 5.4, winW: 1.8, winH: 2.4, gapX: 4.2, base: 1.2 }),
  });
  gableRoof(faces, 2.2, 3.0, 16.5, 15.0, 10.2, 14.6, 'x', {
    front: pCorrugated(roofRamp), back: pCorrugated(roofRamp),
  });
  // 山墙上的回收标志（三箭头意象：三块绿板）
  box(faces, 8.6, 2.6, 10.0, 2.98, 5.2, 7.0, { left: () => cell(P.RFTEAL, 0) });
  box(faces, 10.2, 2.6, 11.6, 2.98, 6.4, 8.2, { left: () => cell(P.RFTEAL, 1) });
  box(faces, 7.0, 2.6, 8.4, 2.98, 6.4, 8.2, { left: () => cell(P.RFTEAL, 1) });
  // ---- 露天分类传送带（斜置长带 + 支架滚筒）----
  const belt: PatFn = (u, v, px, py) => {
    if (bayer(px, py, 0.4)) return cell(P.OUTLINE, 1);
    return cell(P.METAL, 1);
  };
  box(faces, 18.0, 4.0, 30.0, 7.2, 2.2, 3.6, {
    right: belt, left: pWall(P.METAL), top: pWall(P.OUTLINE),
  });
  // 进料斗（漏斗口朝上）
  frustum(faces, 26.4, 5.6, 2.6, 1.4, 3.6, 6.2, {
    side: pWall(P.YELLOW),
  }, 8);
  // 支架腿
  for (const [lx, ly] of [[19.0, 4.4], [28.4, 4.4], [19.0, 6.6], [28.4, 6.6]] as const) {
    box(faces, lx, ly, lx + 0.7, ly + 0.7, 0, 2.4, {
      right: pWall(P.METAL), left: pWall(P.METAL),
    });
  }
  // ---- 打包方块垛（压缩出的立方块：纸箱色 / 金属色 / 塑料色三垛）----
  const bale = (bx: number, by: number, ramp: number) => {
    box(faces, bx, by, bx + 4.6, by + 4.6, 0, 4.4, {
      right: pWall(ramp), left: pWall(ramp), top: pFlatRoof(ramp, 4),
    });
    // 捆扎钢带（十字带）
    box(faces, bx + 2.0, by, bx + 2.6, by + 4.6, 0, 4.6, {
      right: pWall(P.OUTLINE), left: pWall(P.OUTLINE),
    });
  };
  bale(18.4, 10.4, P.TAN);       // 纸类
  bale(24.4, 10.4, P.METAL);     // 金属类
  bale(18.4, 16.4, P.PBLUE);     // 塑料类
  // 垛上再摞半块（错位小方垛 —— 分拣场的高度感）
  box(faces, 25.2, 11.2, 28.6, 14.6, 4.4, 7.6, {
    right: pWall(P.METAL), left: pWall(P.METAL), top: pFlatRoof(P.METAL, 5),
  });
  // ---- 地磅与进出闸口（南缘硬化带）----
  box(faces, 2.0, 27.0, 30.0, 29.6, 0, 0.5, {
    right: pStone(P.SIDE), left: pStone(P.SIDE), top: () => cell(P.ASPH, 1),
  });
  acUnit(faces, 6.5, 17.5, 10.5, 2.6);
  return { model: buildModel(faces, 32, 32) };
}

// ============================================================
// 焚烧发电厂（2×2，LV7）：倾斜给料斗 + 余热锅炉 + 大烟囱 + 汽轮机房
//   烟囱口 smokeAt 冒烟 —— 垃圾烧成电（−30MW），代价是烟（v19 污染 +3）
// ============================================================

export function genIncin(seed: number): BuildResult {
  const faces: Face[] = [];
  const bandRamp = (seed & 1) === 0 ? P.RFRED : P.RFTEAL;   // 变体：烟囱环带色
  // ---- 余热锅炉主厂房（混凝土 + 高窗）----
  box(faces, 2.4, 2.4, 17.0, 15.4, 0, 12.0, {
    right: pWindows(P.SIDE, { seed, lit: 0.14, floorH: 6.2, winW: 2.0, winH: 2.8, gapX: 4.4, base: 1.4 }),
    left: pStone(P.SIDE),
  });
  box(faces, 2.0, 2.0, 17.4, 15.8, 12.0, 13.4, {
    right: pWall(P.SIDE), left: pWall(P.SIDE), top: pFlatRoof(P.SIDE, 3),
  });
  // ---- 倾斜给料斗（大漏斗 + 支撑桁架；垃圾车倒料的口）----
  frustum(faces, 8.0, 20.4, 5.2, 3.0, 2.0, 7.0, {
    side: pBands(P.YELLOW, 4.4),
  }, 10);
  // 料斗口内衬（深色 throat）
  frustum(faces, 8.0, 20.4, 3.0, 1.9, 7.0, 7.9, {
    side: pWall(P.OUTLINE),
  }, 10);
  // 支撑腿
  for (const [lx, ly] of [[5.4, 18.2], [10.2, 18.2], [5.4, 22.6], [10.2, 22.6]] as const) {
    box(faces, lx, ly, lx + 0.8, ly + 0.8, 0, 2.2, {
      right: pWall(P.METAL), left: pWall(P.METAL),
    });
  }
  // ---- 大烟囱（红白环带烟囱 + 顶部检修平台；smokeAt 冒烟）----
  box(faces, 21.8, 8.2, 24.6, 11.0, 0, 8.0, {
    right: pBands(P.METAL, 4.0), left: pBands(P.METAL, 4.0),
  });
  prism(faces, 23.2, 9.6, 1.9, 8.0, 22.5, {
    side: (u, v, px, py) => {
      const b = pBands(bandRamp, 4.6)(u, v, px, py);
      return b;
    },
  }, 10);
  // 检修平台（外挑一圈）
  box(faces, 21.2, 7.6, 25.2, 11.6, 22.5, 23.1, {
    right: pWall(P.METAL), left: pWall(P.METAL), top: () => cell(P.METAL, 1),
  });
  // 烟囱口（深色内衬 + 白汽出口）
  prism(faces, 23.2, 9.6, 1.4, 23.1, 24.6, {
    side: pWall(P.OUTLINE),
  }, 8);
  // ---- 汽轮机房（玻璃窗小楼 + 屋顶散热器）----
  box(faces, 20.4, 16.4, 29.6, 24.8, 0, 7.4, {
    right: pWindows(P.RFGRAY, { seed: seed ^ 5, lit: 0.3, floorH: 6.4, winW: 2.4, winH: 3.0, gapX: 4.0, base: 1.6 }),
    left: pWall(P.RFGRAY),
  });
  box(faces, 20.0, 16.0, 30.0, 25.2, 7.4, 8.6, {
    right: pWall(P.RFGRAY), left: pWall(P.RFGRAY), top: pFlatRoof(P.RFGRAY, 4),
  });
  // 屋顶散热器鳍片（三片立鳍）
  for (const dx of [23.0, 25.4, 27.8]) {
    box(faces, dx, 18.4, dx + 1.0, 23.4, 8.6, 10.8, {
      right: pWall(P.METAL), left: pWall(P.METAL), top: () => cell(P.METAL, 2),
    });
  }
  // ---- 蒸汽管道（锅炉 → 汽轮机：架空粗管两段）----
  box(faces, 16.4, 12.4, 21.0, 13.6, 6.8, 8.0, {
    right: pWall(P.YELLOW), left: pWall(P.YELLOW), top: () => cell(P.YELLOW, 1),
  });
  box(faces, 19.8, 13.2, 21.0, 18.4, 5.6, 6.8, {
    right: pWall(P.YELLOW), left: pWall(P.YELLOW), top: () => cell(P.YELLOW, 1),
  });
  // ---- 厂区地坪与煤渣堆（南缘）----
  box(faces, 2.0, 26.6, 30.0, 29.4, 0, 0.5, {
    right: pStone(P.SIDE), left: pStone(P.SIDE), top: () => cell(P.ASPH, 1),
  });
  cone(faces, 6.4, 26.8, 3.4, 0.5, 3.4, (u, v, px, py) => pWall(P.DIRT)(u, v, px, py), 8);
  return {
    model: buildModel(faces, 32, 32),
    smokeAt: [23.2, 9.6, 25.4] as V3,
  };
}
