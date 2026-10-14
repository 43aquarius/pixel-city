// ============================================================
// patterns.ts — 面纹理图案库
// 每个图案是 (u, v, px, py) → PatCell 的纯函数：
//   u/v   : 面内图案坐标（px 世界单位）
//   px/py : 精灵图内绝对像素（供 Bayer 有序抖动使用）
// 返回 {r: 色阶, l: 明暗档, dl/t: 抖动到另一档}
// 最终色 = RAMPS[r][clamp(l + 面朝向档位)]，抖动同理。
// ============================================================

import { RAMP, bayer } from './palette';
import { hash2, hash3 } from './rng';

export type PatCell = {
  r: number;              // ramp 索引
  l: number;              // 基础明暗档
  dl?: number;            // 抖动目标档（省略则不抖动）
  t?: number;             // 抖动比例 [0,1)
};
export type PatFn = (u: number, v: number, px: number, py: number) => PatCell;

export const cell = (r: number, l: number, dl?: number, t?: number): PatCell =>
  (dl === undefined ? { r, l } : { r, l, dl, t });

const P = RAMP; // 别名

// ------------------------------------------------------------
// 墙面
// ------------------------------------------------------------

/** 素墙：底部 2px 压暗（环境光遮蔽），顶部 1px 提亮线 */
export function pWall(ramp: number): PatFn {
  return (u, v, px, py) => {
    // 轻微风化斑点
    const sp = hash2(Math.floor(u / 3), Math.floor(v / 3), 7) as number;
    if (v < 2) return cell(ramp, 1);
    if (sp < 0.06) return cell(ramp, 1);
    if (v > 3 && bayer(px, py, 0.05)) return cell(ramp, 1);
    return cell(ramp, 0);
  };
}

/** 砖墙：3px 砖层 + 错缝 + 点状风化 */
export function pBrick(ramp: number): PatFn {
  return (u, v, px, py) => {
    const row = Math.floor(v / 3);
    const fv = v - row * 3;
    const fu = u - Math.floor(u / 5) * 5 + (row % 2) * 2.5;
    if (fv < 0.9 || fu < 0.9) return cell(ramp, 1);          // 灰缝
    if (bayer(px, py, 0.10)) return cell(ramp, 0, 1, 0.5);   // 砖面微差
    return cell(ramp, 0);
  };
}

/** 波纹金属墙（仓库）：2px 竖向瓦楞 */
export function pCorrugated(ramp: number): PatFn {
  return (u, v, px, py) => {
    if (v < 1.5) return cell(ramp, 1);
    const s = (u % 4) < 2 ? 0 : 1;
    if (bayer(px, py, 0.08)) return cell(ramp, Math.min(2, s + 1));
    return cell(ramp, s);
  };
}

export type WindowOpts = {
  floorH?: number;   // 层高 px（默认 7）
  winW?: number; winH?: number;  // 窗宽高（默认 2×2）
  gapX?: number;     // 水平窗距（默认 4）
  lit?: number;      // 亮灯比例
  seed?: number;
  door?: boolean;    // 底层中央开门
  base?: number;     // 底部裙房高（不画窗）
  doorW?: number;
};

/** 格栅窗墙：像素窗 + 少量暖黄亮灯 + 底层门 */
export function pWindows(ramp: number, o: WindowOpts = {}): PatFn {
  const floorH = o.floorH ?? 7;
  const winW = o.winW ?? 2;
  const winH = o.winH ?? 2;
  const gapX = o.gapX ?? 4;
  const lit = o.lit ?? 0.14;
  const seed = o.seed ?? 0;
  const base = o.base ?? 0;
  const doorW = o.doorW ?? 3;
  return (u, v, px, py) => {
    if (v < 1.5) return cell(ramp, 1);   // 勒脚
    if (v < base) {
      // 裙房：深色基座
      return bayer(px, py, 0.12) ? cell(ramp, 1) : cell(ramp, 0);
    }
    const fl = Math.floor((v - base) / floorH);
    const fv = v - base - fl * floorH;
    if (fv < 1.6 || fv > 1.6 + winH + 0.9) {
      // 楼板带
      return bayer(px, py, 0.08) ? cell(ramp, 1) : cell(ramp, 0);
    }
    const col = Math.floor(u / gapX);
    const fu = u - col * gapX;
    // 底层门（居中）
    if (o.door && fl === 0 && v - base < 5.5) {
      const dw = doorW;
      const du = u % 16; // 门以 16px 周期居中
      const dLo = 8 - dw / 2 - 1, dHi = 8 + dw / 2 + 1;
      if (du > dLo && du < dHi && v < 5) {
        const frame = du < dLo + 1.2 || du > dHi - 1.2;
        if (frame) return cell(P.OUTLINE, 0);
        if (du > dHi - 2 && v > 2 && v < 3) return cell(P.YELLOW, 0); // 门把手
        return cell(P.DIRT, 1);
      }
    }
    if (fu > 0.9 && fu < 0.9 + winW + 0.2 && fv > 1.6 && fv < 1.6 + winH + 0.4) {
      const fx = fu - 0.9, fy = fv - 1.6;
      const inWin = fx > 0.7 && fx < winW + 0.3 && fy > 0.7 && fy < winH + 0.3;
      if (inWin) {
        const h = hash3(col, fl, seed, 31);
        if (h < lit) return cell(P.YELLOW, 0);
        // 玻璃：Bayer 微光斑
        if (bayer(px, py, 0.15)) return cell(P.GLASS, 0);
        return cell(P.GLASS, 1);
      }
      return cell(ramp, 1); // 窗框
    }
    if (bayer(px, py, 0.07)) return cell(ramp, 1);
    return cell(ramp, 0);
  };
}

/** 玻璃幕墙：4×7 单元，金属竖梃 + 楼层线 + 随机反光单元 */
export function pGlassCurtain(seed = 0, ramp = P.GLASS): PatFn {
  return (u, v, px, py) => {
    const col = Math.floor(u / 4), row = Math.floor(v / 7);
    const fu = u - col * 4, fv = v - row * 7;
    if (fu < 1 || fv < 1) return cell(P.METAL, 1);            // 竖梃/横梁
    if (fv < 2) return cell(P.METAL, 2);                      // 楼层带
    const h = hash3(col, row, seed, 77);
    if (h < 0.10) return cell(P.GLASS, 0);                    // 高反光
    if (h > 0.86) return cell(P.GLASS, 2);
    if (bayer(px, py, 0.10)) return cell(ramp, 0, 1, 0.6);
    return cell(ramp, 1);
  };
}

/** 招牌底板：强调色 + 白边 + 假想文字点 */
export function pSign(accent: number, seed = 0): PatFn {
  return (u, v, px, py) => {
    if (u < 1 || v < 1) return cell(P.WHITE, 0);
    const row = Math.floor(v / 3);
    if (v - row * 3 < 1.2 && u > 2 && u < 13) {
      const h = hash2(Math.floor(u / 1.5), row, seed);
      if (h < 0.45) return cell(P.WHITE, 0);
    }
    if (bayer(px, py, 0.1)) return cell(accent, 0, 1, 0.5);
    return cell(accent, 0);
  };
}

/** 遮阳棚：3px 斜纹条纹（白 + 强调色），底缘一行穗 */
export function pAwning(accent: number): PatFn {
  return (u, v, px, py) => {
    const s = Math.floor(u / 3) % 2 === 0;
    if (v > 4.2) return s ? cell(P.WHITE, 0) : cell(accent, 0);
    return s ? cell(P.WHITE, 0) : cell(accent, 0);
  };
}

// ------------------------------------------------------------
// 屋顶
// ------------------------------------------------------------

/** 平屋顶：边缘压边 + 通风斑点 + 屋面杂点 */
export function pFlatRoof(ramp: number, seed = 0): PatFn {
  return (u, v, px, py) => {
    const h = hash2(Math.floor(u / 4), Math.floor(v / 4), seed);
    if (u < 1.2 || v < 1.2) return cell(ramp, 1);
    if (h < 0.10) return cell(ramp, 2);   // 污渍/设备
    if (bayer(px, py, 0.18)) return cell(ramp, 1);
    return cell(ramp, 0);
  };
}

/** 坡屋面瓦：3px 横向瓦垄 + 错缝瓦钉 */
export function pShingle(ramp: number): PatFn {
  return (u, v, px, py) => {
    const row = Math.floor(v / 3);
    const fv = v - row * 3;
    if (fv < 0.8) return cell(ramp, 1);
    const tab = (u + row * 2.5) % 5;
    if (tab < 0.8) return cell(ramp, 1);
    if (bayer(px, py, 0.12)) return cell(ramp, 1);
    return cell(ramp, 0);
  };
}

/** 锯齿厂房坡面：顶部天窗玻璃带 */
export function pSawTooth(sky = true): PatFn {
  return (u, v, px, py) => {
    if (sky && v > 4) {
      // 靠近脊线的天窗带
      return bayer(px, py, 0.2) ? cell(P.GLASS, 0) : cell(P.GLASS, 1);
    }
    return bayer(px, py, 0.12) ? cell(P.METAL, 1) : cell(P.METAL, 0);
  };
}

/** 粗石砌体（基座/纪念碑）：6×4 石块错缝 */
export function pStone(ramp = P.SIDE): PatFn {
  return (u, v, px, py) => {
    const row = Math.floor(v / 4);
    const fu = u - Math.floor(u / 6) * 6 + (row % 2) * 3;
    const fv = v - row * 4;
    if (fu < 1 || fv < 1) return cell(ramp, 2);
    const h = hash2(Math.floor(u / 6), row, 5);
    if (h < 0.2) return cell(ramp, 1);
    return cell(ramp, 0);
  };
}

/** 格构塔架：竖杆 + 水平横环 */
export function pLattice(): PatFn {
  return (u, v, px, py) => {
    const s = u % 4;
    if (s < 1) return cell(P.METAL, 2);
    if (v % 5 < 1) return cell(P.METAL, 1);
    return cell(P.METAL, 0);
  };
}

/** 体育场外墙：拱形入口 */
export function pArcade(): PatFn {
  return (u, v, px, py) => {
    const fu = u % 8;
    if (fu > 3 && fu < 6.5 && v < 4.5) {
      return cell(P.ASPH, 2);   // 拱洞阴影
    }
    if (v % 4 < 1) return cell(P.SIDE, 1);
    return bayer(px, py, 0.15) ? cell(P.SIDE, 1) : cell(P.SIDE, 0);
  };
}

/** 体育场看台人群：座位排 + 彩点观众 */
export function pCrowd(): PatFn {
  return (u, v, px, py) => {
    const row = Math.floor(v / 2);
    const h = hash2(Math.floor(u / 1.2), row, 99);
    if (h < 0.10) return cell(P.RED, 0);
    if (h < 0.18) return cell(P.YELLOW, 0);
    if (h < 0.24) return cell(P.CYAN, 0);
    if (h < 0.30) return cell(P.WHITE, 0);
    if (v - row * 2 < 0.8) return cell(P.SIDE, 1);   // 座椅排
    return bayer(px, py, 0.3) ? cell(P.SIDE, 1) : cell(P.SIDE, 2);
  };
}

/** 体育场草坪：6px 条纹 + 边线 + 中圈 */
export function pField(fw: number, fh: number): PatFn {
  return (u, v, px, py) => {
    const cx = fw / 2, cy = fh / 2;
    // 边线
    if (Math.abs(u - 2) < 0.9 || Math.abs(v - 2) < 0.9 ||
        Math.abs(u - (fw - 2)) < 0.9 || Math.abs(v - (fh - 2)) < 0.9) return cell(P.WHITE, 0);
    // 中线 + 中圈
    const du = u - cx, dv = v - cy;
    const rr = Math.hypot(du, dv);
    if (Math.abs(du) < 0.8 || Math.abs(dv) < 0.8) return cell(P.WHITE, 0);
    if (Math.abs(rr - 6) < 0.9) return cell(P.WHITE, 0);
    const band = Math.floor(((u + v) / 2) / 5) % 2;
    if (bayer(px, py, 0.06)) return cell(P.GRASS, 1);
    return cell(P.GRASS, band === 0 ? 1 : 2);
  };
}

/** 静态水面（喷泉/公园水塘） */
export function pWaterStatic(): PatFn {
  return (u, v, px, py) => {
    const n = hash2(Math.floor(u / 4), Math.floor(v / 4), 3) * 0.5 +
      hash2(Math.floor(u / 2), Math.floor(v / 2), 8) * 0.5;
    if (n > 0.82) return cell(P.WATER, 0);
    if (n < 0.25) return cell(P.WATER, 2);
    if (bayer(px, py, 0.15)) return cell(P.WATER, 0);
    return cell(P.WATER, 1);
  };
}

/** 旗帜（纯色 + 波纹暗纹） */
export function pFlag(ramp = P.RED): PatFn {
  return (u, v, px, py) => (bayer(px, py, 0.22) ? cell(ramp, 1) : cell(ramp, 0));
}

/** 金属罐体：竖向高光带 */
export function pTankShell(): PatFn {
  return (u, v, px, py) => {
    const s = u % 8;
    if (s < 1.2) return cell(P.METAL, 1);
    if (s > 4 && s < 5.2) return cell(P.METAL, 2);
    if (v > 0 && v < 1) return cell(P.METAL, 1);
    return cell(P.METAL, 0);
  };
}

/** 红白警示条（烟囱口/塔身） */
export function pBands(rampA = P.RED, period = 4): PatFn {
  return (u, v, px, py) => {
    const s = Math.floor(v / period) % 2 === 0;
    return cell(s ? rampA : P.WHITE, 0);
  };
}

/** 十字（医院楼顶标识）：在边长 s 的面中央画红十字 */
export function pCross(s: number): PatFn {
  return (u, v) => {
    const c = s / 2;
    const bar = s * 0.16;
    if ((Math.abs(u - c) < bar || Math.abs(v - c) < bar) &&
        Math.abs(u - c) < s * 0.36 && Math.abs(v - c) < s * 0.36) return cell(P.RED, 0);
    return cell(P.WHITE, 0);
  };
}

/** 树冠：上亮下暗渐变（有序抖动过渡）+ 团簇斑点 */
export function pCanopy(ramp: number, seed = 0): PatFn {
  return (u, v, px, py, hTotal?: number) => {
    void hTotal;
    const cl = hash2(Math.floor(u / 3), Math.floor(v / 3), seed);
    if (cl < 0.14) return cell(ramp, 2);
    if (bayer(px, py, 0.18)) return cell(ramp, 1);
    return cell(ramp, 0);
  };
}

/** 垂直渐变树冠（v 越大越高越亮） */
export function pCanopyGrad(ramp: number, vLo: number, vHi: number, seed = 0): PatFn {
  return (u, v, px, py) => {
    const t = Math.max(0, Math.min(1, (v - vLo) / (vHi - vLo)));
    const cl = hash2(Math.floor(u / 3), Math.floor(v / 3), seed);
    if (cl < 0.12) return cell(ramp, 2);
    // 0 → l2，1 → l0，中间有序抖动
    if (t > 0.66 || (t > 0.33 && bayer(px, py, t))) {
      return t > 0.85 ? cell(ramp, 0) : cell(ramp, 0, 1, 0.35);
    }
    return cell(ramp, t < 0.2 ? 2 : 1, 2, 0.3);
  };
}

/** 木门大板（厂房/仓库卷帘门）：横线 */
export function pShutter(): PatFn {
  return (u, v, px, py) => {
    if (v % 2 < 0.9) return cell(P.SIDE, 2);
    return cell(P.SIDE, 1);
  };
}
