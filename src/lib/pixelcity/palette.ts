// ============================================================
// palette.ts — DOS/PC98 式有限色板 + Bayer 8x8 有序抖动
// 全游戏共用一套约 66 色的和谐色板，明暗关系全部通过
// 「渐变色阶(ramp) + 面朝向等级」查表实现，绝不做连续色彩乘法。
// ============================================================

/** 有限色板（十六进制） */
export const PALETTE: readonly string[] = [
  // 0-3 草地
  '#79B45C', '#57934A', '#3B7138', '#2A5429',
  // 4-7 阔叶树
  '#6FAE52', '#4E9040', '#37703A', '#245129',
  // 8-10 松树
  '#3E8C64', '#2E6B4F', '#1F4F3B',
  // 11-13 沙地 / 14-16 泥土·树干
  '#E8D5A3', '#CFB379', '#AC8F5C', '#8A6F4C', '#6B543A', '#4C3A28',
  // 17-21 水体
  '#6FA8DC', '#4A86C8', '#3467AC', '#264F8C', '#D6E9F5',
  // 22-24 沥青 / 25-26 路面黄线 / 27-29 人行道
  '#4A4C55', '#3B3D46', '#2C2E36', '#E8CC4C', '#C4A93E',
  '#C3C7CC', '#9BA0A7', '#74787F',
  // 30-32 米墙 / 33-35 黄褐墙 / 36-38 砖墙 / 39-41 青白墙
  '#F1E5C0', '#D8C79E', '#B3A17A',
  '#E2B98B', '#C09668', '#95734D',
  '#B96A4E', '#99503C', '#7A3C30',
  '#C6D3DE', '#9FB0C0', '#7A8C9E',
  // 42-44 红陶瓦 / 45-47 青灰瓦 / 48-50 灰瓦 / 51-53 青绿瓦
  '#C25B44', '#9C4433', '#773227',
  '#8B9DB1', '#66798E', '#4A5A6E',
  '#ADAFB6', '#85878F', '#5F6169',
  '#4FA8A0', '#37837D', '#28635F',
  // 54-57 玻璃 / 58-60 金属
  '#B5D3E8', '#89AFD0', '#6285AA', '#48658A',
  '#C9CCD2', '#A0A4AC', '#767B85',
  // 61-63 强调色 / 64-65 黑白
  '#F2D24B', '#E05548', '#5BC8B8',
  '#F4F2E8', '#23252E',
  // 66-67 樱花
  '#E8A4B4', '#C97B93',
  // 68-69 春季新绿（v6 四季）
  '#A9D77F', '#8CC463',
];

/** 渐变色阶表：每条 ramp 从最亮到最暗，索引 0 = 受光面 */
export type Ramp = readonly number[];
export const RAMPS: readonly Ramp[] = [
  [0, 1, 2, 3],        // 0 GRASS
  [4, 5, 6, 7],        // 1 LEAF
  [8, 9, 10],          // 2 PINE
  [11, 12, 13],        // 3 SAND
  [14, 15, 16],        // 4 DIRT
  [17, 18, 19, 20],    // 5 WATER
  [21],                // 6 FOAM
  [22, 23, 24],        // 7 ASPH 沥青
  [25, 26],            // 8 PAINTY 路面黄
  [27, 28, 29],        // 9 SIDE 人行道/混凝土
  [30, 31, 32],        // 10 CREAM
  [33, 34, 35],        // 11 TAN
  [36, 37, 38],        // 12 BRICK
  [39, 40, 41],        // 13 PBLUE
  [42, 43, 44],        // 14 RFRED
  [45, 46, 47],        // 15 RFSLATE
  [48, 49, 50],        // 16 RFGRAY
  [51, 52, 53],        // 17 RFTEAL
  [54, 55, 56, 57],    // 18 GLASS
  [58, 59, 60],        // 19 METAL
  [61],                // 20 YELLOW
  [62],                // 21 RED
  [63],                // 22 CYAN
  [64],                // 23 WHITE
  [65],                // 24 OUTLINE
  [17, 18],            // 25 WATER2 水面浅两档（动画用）
  [66, 67],            // 26 SAKURA 樱花
  [62],                // 27 NEONR 霓虹红（日间=红，夜间模式视作发光体）
  [63],                // 28 NEONC 霓虹青（日间=青）
  [64, 61],            // 29 LAMP 暖灯（夜光模式：亮白暖→黄）
  [68, 69, 5, 6],      // 30 SPRING 春季新绿（v6）
  [64, 39, 40],        // 31 SNOWLEAF 积雪树冠（白→青灰）
  [64, 8, 9, 10],      // 32 SNOWPINE 雪松（雪顶→松绿）
];

const RAMP_LIT = {
  GRASS: 0, LEAF: 1, PINE: 2, SAND: 3, DIRT: 4, WATER: 5, FOAM: 6,
  ASPH: 7, PAINTY: 8, SIDE: 9, CREAM: 10, TAN: 11, BRICK: 12,
  PBLUE: 13, RFRED: 14, RFSLATE: 15, RFGRAY: 16, RFTEAL: 17,
  GLASS: 18, METAL: 19, YELLOW: 20, RED: 21, CYAN: 22, WHITE: 23,
  OUTLINE: 24, WATER2: 25, SAKURA: 26, NEONR: 27, NEONC: 28, LAMP: 29,
  SPRING: 30, SNOWLEAF: 31, SNOWPINE: 32,
} as const;

/** 带名 ramp 索引（值一律 number，避免字面量类型传染函数签名） */
export const RAMP: { [K in keyof typeof RAMP_LIT]: number } = RAMP_LIT;

/** Bayer 8x8 有序抖动矩阵（0..63） */
export const BAYER8 = new Uint8Array([
  0, 32, 8, 40, 2, 34, 10, 42,
  48, 16, 56, 24, 50, 18, 58, 26,
  12, 44, 4, 36, 14, 46, 6, 38,
  60, 28, 52, 20, 62, 30, 54, 22,
  3, 35, 11, 43, 1, 33, 9, 41,
  51, 19, 59, 27, 49, 17, 57, 25,
  15, 47, 7, 39, 13, 45, 5, 37,
  63, 31, 55, 23, 61, 29, 53, 21,
]);

/** 有序抖动判定：t ∈ [0,1)，返回 true 表示取“第二色” */
export function bayer(x: number, y: number, t: number): boolean {
  if (t <= 0) return false;
  if (t >= 1) return true;
  const v = BAYER8[(y & 7) * 8 + (x & 7)] + 0.5;
  return v < t * 64;
}

/** hex → [r,g,b] */
export function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** 精灵缓冲区特殊值 */
export const EMPTY = 255;   // 透明
export const DARK = 253;    // 轮廓 / 抖动阴影点（渲染为色板最暗色）

/** 构建 ABGR 查找表（ImageData 为小端 RGBA） */
export function buildLut(): Uint32Array {
  const lut = new Uint32Array(256);
  for (let i = 0; i < PALETTE.length; i++) {
    const [r, g, b] = hexToRgb(PALETTE[i]);
    lut[i] = (255 << 24) | (b << 16) | (g << 8) | r;
  }
  const dark = hexToRgb(PALETTE[65]);
  lut[DARK] = (255 << 24) | (dark[2] << 16) | (dark[1] << 8) | dark[0];
  return lut;
}

export const LUT: Uint32Array = buildLut();

/** 取色板 hex（UI 侧使用） */
export function pal(i: number): string {
  return PALETTE[i] ?? PALETTE[65];
}

/** 光照方向（px 世界空间，已归一化）：左前上方来光 */
export const LIGHT: readonly [number, number, number] = (() => {
  const l = Math.hypot(-0.55, 0.42, 0.72);
  return [-0.55 / l, 0.42 / l, 0.72 / l];
})();

/** 根据面法线量化出 0/1/2 三个明暗档（0 最亮） */
export function faceLevel(nx: number, ny: number, nz: number): number {
  const d = nx * LIGHT[0] + ny * LIGHT[1] + nz * LIGHT[2];
  return d > 0.5 ? 0 : d > -0.05 ? 1 : 2;
}
