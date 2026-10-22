// ============================================================
// actors.ts — 街头角色系统 v7：精细行人 + 职业 + 宠物 + 鸽群 + 车辆
//              + 公交巴士 + 水上船舶 + 骑行者 + 有轨电车（v11）
//
// v7 公交：≥2 座邻路巴士站自动开通环线——巴士在车站间接驳，
//          到站停靠上下客（wait 2.2-4s）；车站越多班次越密
//    航运：渡轮码头泊位出航（渡轮→帆船→渔船），水路 BFS
//          寻航避桥；冬季冰封全数归航；船后白浪尾迹
//    骑行：行人池 8% 蹬车出行，速度快行程远，贴路缘车道
//
// 行人：10×17 / 9×14 多部件像素画（发型/肤色/上衣/上衣暗面/
//       裤子/鞋/眼睛/书包/手杖），三种体型（成人/儿童/长者），
//       14 套配色，4 朝向 × 双步态；足印接触阴影纳入精灵。
// 职业：警察/邮递员/学生/主厨/慢跑者/医生/消防员/环卫工/游客
//       —— 制服网格手术（大檐帽+徽章/绿帽+肩带邮包/水手领/
//       厨师高帽+围裙/运动发带+短裤/白大褂+红十字/红盔+反光条/
//       橙背心+扫帚/草帽+相机），专属速度与巡弋节奏。
// 宠物：狗（跟随主人遛狗/流浪）、猫（流浪，走走停停会坐
//       下）—— 全新四足像素精灵，4 朝向 × 双步态 + 坐姿。
// 鸽群：广场鸽 —— 集群出没、低头啄食、行人靠近受惊急窜。
// 结伴：情侣/朋友成对生成，同路径并排出行。
// 行为：BFS 路径寻路 + 路口停顿 + 到达逗留，夜间（dayness）
//       人口自动回落；车辆目的地路径行驶。
// ============================================================

import type { CityMap } from './map';
import { defById, ATTRACT } from './catalog';
import { box, buildModel, type Face, type Model, type BoxMats } from './geo';
import { pWall, pFlatRoof, cell } from './patterns';
import { RAMP, bayer } from './palette';
import { renderModel, type Sprite } from './softrender';

const P = RAMP;

// ------------------------------------------------------------
// 行人像素画
//   符号：H 发 / S 肤 / E 眼 / R 上衣 / r 上衣暗面 /
//         P 裤 / K 鞋·轮廓 / C 手杖 / B 书包
// ------------------------------------------------------------

type Grid = string[];

/** 成人（10×17）：正面族基础网格（dr 朝向下右） */
function adultFront(pose: 0 | 1): Grid {
  const legs = pose === 0
    ? ['...PP.PP..', '...PP.PP..', '...KK.KK..', '..KK..KK..', '...K..K...']
    : ['...PPPP...', '...PPPP...', '...KKKK...', '...KKKK...', '....KK....'];
  const arms = pose === 0 ? '..SRRRRrS.' : '..RRRRRRr.';
  return [
    '...HHHH...',
    '..HHHHHH..',
    '..HHSSSSK.',
    '..HHSESEK.',
    '....SSS...',
    '...RRRRR..',
    '..RRRRRRr.',
    '..RRRRRRr.',
    arms,
    '...RRRR...',
    '...KKKK...',
    '...PPPPP..',
    legs[0], legs[1], legs[2], legs[3], legs[4],
  ];
}

/** 成人背面族（ur 朝向上右）：无脸，后脑勺头发 */
function adultBack(pose: 0 | 1): Grid {
  const g = adultFront(pose);
  g[2] = '..HHHHHHK.';
  g[3] = '..HHHHHHK.';
  return g;
}

/** 儿童（8×14）：头身比更大 */
function childFront(pose: 0 | 1): Grid {
  const legs = pose === 0
    ? ['..PP.PP..', '..PP.PP..', '..KK.KK..', '.KK..KK.']
    : ['..PPPP...', '..PPPP...', '..KKKK...', '..KKKK..'];
  return [
    '..HHHH...',
    '.HHHHHH..',
    '.HHSSSSK.',
    '.HHSESEK.',
    '...SSS...',
    '..RRRRR..',
    '.RRRRRRr.',
    '.RRRRRRr.',
    '..RRRR...',
    '..PPPPP..',
    legs[0], legs[1], legs[2], legs[3],
  ];
}

function childBack(pose: 0 | 1): Grid {
  const g = childFront(pose);
  g[2] = '.HHHHHHK.';
  g[3] = '.HHHHHHK.';
  return g;
}

/** 长者（10×17）：与成人同廓，慢速拄杖 */
function elderGrid(pose: 0 | 1): Grid {
  // 步幅小：两种步态仅差一行的开合
  const legs = pose === 0
    ? ['...PP.PP..', '...PPPP...', '...KK.KK..', '..KK..KK..', '...K..K...']
    : ['...PPPP...', '...PPPP...', '...KKKK...', '...KKKK...', '....KK....'];
  return [
    '...HHHH...',
    '..HHHHHH..',
    '..HHSSSSK.',
    '....SSS...',
    '...RRRRR..',
    '..RRRRRRr.',
    '..RRRRRRr.',
    '..RRRRRRr.',
    '...RRRR...',
    '...RRRR...',
    '...KKKK...',
    '...PPPPP..',
    legs[0], legs[1], legs[2], legs[3], legs[4],
  ];
}

const mirror = (g: Grid): Grid => g.map(r => r.split('').reverse().join(''));

type PersonLook = {
  shirt: string; shirtDark: string; pants: string;
  hair: string; skin: string; long: 0 | 1;
};

const SKIN_LIGHT = '#E2B98B';
const SKIN_TAN = '#C09668';
const NIGHTC = '#23252E';
const CANE = '#6B543A';
const BAG = '#C25B44';
const ELDER_HAIR = ['#C3C7CC', '#9BA0A7', '#F4F2E8'];

const LOOKS: PersonLook[] = [
  { shirt: '#E05548', shirtDark: '#9C4433', pants: '#23252E', hair: '#23252E', skin: SKIN_LIGHT, long: 0 },
  { shirt: '#F2D24B', shirtDark: '#C4A93E', pants: '#3B3D46', hair: '#6B543A', skin: SKIN_LIGHT, long: 0 },
  { shirt: '#5BC8B8', shirtDark: '#28635F', pants: '#23252E', hair: '#23252E', skin: SKIN_LIGHT, long: 1 },
  { shirt: '#F4F2E8', shirtDark: '#C3C7CC', pants: '#4A5A6E', hair: '#4C3A28', skin: SKIN_LIGHT, long: 0 },
  { shirt: '#4A86C8', shirtDark: '#264F8C', pants: '#23252E', hair: '#6B543A', skin: SKIN_LIGHT, long: 1 },
  { shirt: '#C09668', shirtDark: '#95734D', pants: '#3B3D46', hair: '#23252E', skin: SKIN_TAN, long: 0 },
  { shirt: '#C25B44', shirtDark: '#773227', pants: '#3B3D46', hair: '#4C3A28', skin: SKIN_LIGHT, long: 0 },
  { shirt: '#4FA8A0', shirtDark: '#28635F', pants: '#23252E', hair: '#6B543A', skin: SKIN_TAN, long: 0 },
  { shirt: '#F1E5C0', shirtDark: '#B3A17A', pants: '#4A5A6E', hair: '#23252E', skin: SKIN_LIGHT, long: 1 },
  { shirt: '#C97B93', shirtDark: '#9C4433', pants: '#3B3D46', hair: '#23252E', skin: SKIN_LIGHT, long: 1 },
  { shirt: '#F4F2E8', shirtDark: '#9BA0A7', pants: '#23252E', hair: '#C3C7CC', skin: SKIN_LIGHT, long: 0 },
  { shirt: '#8A6F4C', shirtDark: '#4C3A28', pants: '#23252E', hair: '#23252E', skin: SKIN_TAN, long: 0 },
  { shirt: '#89AFD0', shirtDark: '#48658A', pants: '#3B3D46', hair: '#6B543A', skin: SKIN_LIGHT, long: 0 },
  { shirt: '#4A5A6E', shirtDark: '#2C2E36', pants: '#23252E', hair: '#9BA0A7', skin: SKIN_TAN, long: 1 },
];

export const LOOK_N = LOOKS.length;

// ------------------------------------------------------------
// 职业角色（v4）：制服覆盖 + 专属配色
//   0 市民 / 1 警察 / 2 邮递员 / 3 学生(少年) / 4 主厨 / 5 慢跑者
//   6 医生 / 7 消防员 / 8 环卫工 / 9 游客
// ------------------------------------------------------------

export type Role = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

const NAVY = '#2C3E5E', NAVY_D = '#1C2A44';
const PGRN = '#3F7A4C', PGRN_D = '#2A5636';
const GOLD = '#F2D24B';

/** 在网格行指定列写入符号（越界安全） */
function setCol(row: string, col: number, ch: string): string {
  if (col < 0 || col >= row.length) return row;
  return row.slice(0, col) + ch + row.slice(col + 1);
}

/** 职业网格手术：在基础网格上叠加制服元素（帽/领/围裙/邮包/发带/白大褂/扫帚…） */
function applyRole(g: Grid, role: Role, body: Body, back: boolean): Grid {
  const out = g.slice();
  if (role === 1) {            // 警察：大檐帽 + 前徽章
    out[0] = '..TTTTTT..';
    out[1] = back ? '.TTTTTTTT.' : '.TTTYTTTT.';
    out[2] = out[2].replace('HH', 'TT');
  } else if (role === 2) {     // 邮递员：绿帽 + 肩带 + 侧挂邮包
    out[0] = '..TTTTTT..';
    out[1] = '.TTTTTTTT.';
    out[2] = out[2].replace('HH', 'TT');
    if (back) { out[6] = '..RBBBRRr.'; out[7] = '..RBBBRRr.'; }
    else {
      out[5] = '..gRRRRR..';
      out[9] = 'B..RRRR...';
      out[10] = 'B..KKKK...';
    }
  } else if (role === 3) {     // 学生：水手领 + 藏青下装（背面包包沿用）
    if (body === 1) {
      out[5] = '..NNNNN..';
      out[6] = back ? '.RBBBRRr.' : '.NNRNNNr.';
      if (back) out[7] = '.RBBBRRr.';
    } else {
      out[5] = '...NNNNN..';
      out[6] = '..NRRRRr.';
    }
  } else if (role === 4) {     // 主厨：厨师高帽 + 白围裙
    out[0] = '..WWWWWW..';
    out[1] = '.WWWWWWWW.';
    out[2] = out[2].replace('HH', 'WW');
    if (!back) {
      out[6] = '..RWWWWr..';
      out[7] = '..RWWWWr..';
      out[9] = '..RWWWWr..';
    }
  } else if (role === 5) {     // 慢跑者：运动发带 + 短裤裸腿
    out[1] = '.TTTTTTTT.';
    if (!back) out[11] = '...RRRRR..';
  } else if (role === 6) {     // 医生：白大褂 + 藏青领 + 左胸红十字
    out[5] = '...WWWWW..';
    out[6] = back ? '..WWWNWWW.' : '..xWWNWWW.';
    out[7] = back ? '..WWWNWWW.' : '..xWWNWWW.';
    out[9] = '...WWWWW..';
  } else if (role === 7) {     // 消防员：红盔护檐 + 藏青制服 + 腰部金色反光条
    out[0] = '..TTTTTT..';
    out[1] = '.TTTTTTTT.';
    out[2] = out[2].replace('HH', 'TT');
    out[9] = '...YYYY...';
  } else if (role === 8) {     // 环卫工：橙背心反光条 + 手持扫帚
    out[6] = '..vvRRvv..';
    out[7] = '..vvYYvv..';
    for (let y = 8; y <= 13; y++) out[y] = setCol(out[y], 9, 'C');   // 帚柄
    out[14] = out[14].slice(0, 7) + 'CCC';                            // 帚毛
    out[15] = out[15].slice(0, 7) + 'CCC';
  } else if (role === 9) {     // 游客：宽檐草帽 + 胸前相机 + 花衬衫
    out[0] = '..TTTTTT..';
    out[1] = '.TTTTTTTT.';
    out[2] = out[2].replace('HH', 'T');
    if (!back) out[5] = '...KYYK...';
  }
  return out;
}

/** 职业配色（符号 → 颜色）；v 为变体号（肤色/衬衣差异） */
function roleColors(role: Role, look: PersonLook, body: Body, lookI: number, v: number): Record<string, string> {
  const hair = body === 2 ? ELDER_HAIR[lookI % 3] : look.hair;
  const c: Record<string, string> = {
    H: hair, S: v === 1 ? SKIN_TAN : SKIN_LIGHT, E: NIGHTC,
    R: look.shirt, r: look.shirtDark, P: look.pants, K: NIGHTC,
    C: CANE, B: BAG, T: NIGHTC, Y: GOLD, W: '#F4F2E8', N: NAVY,
    g: PGRN_D, e: NIGHTC, x: '#E05548', v: '#E0742C',
  };
  if (role === 1) { c.R = NAVY; c.r = NAVY_D; c.P = NAVY_D; c.T = NAVY; c.B = '#F4F2E8'; }
  if (role === 2) { c.R = PGRN; c.r = PGRN_D; c.P = '#4A5A6E'; c.T = PGRN; c.B = '#8A5A36'; }
  if (role === 3) { c.R = '#F4F2E8'; c.r = '#C3C7CC'; c.P = NAVY; }
  if (role === 4) { c.R = '#C09668'; c.r = '#95734D'; c.P = '#3B3D46'; }
  if (role === 5) {
    const jog = [['#E05548', '#9C4433'], ['#5BC8B8', '#28635F'], ['#F2D24B', '#C4A93E'], ['#4A86C8', '#264F8C']][v % 4];
    c.R = jog[0]; c.r = jog[1]; c.T = jog[0]; c.P = c.S;   // 短裤同衣色，腿为肤色
  }
  if (role === 6) { c.R = '#F4F2E8'; c.r = '#C3C7CC'; c.P = '#23252E'; }         // 医生白大褂
  if (role === 7) { c.R = '#2C3E5E'; c.r = '#1C2A44'; c.P = '#23252E'; c.T = '#E05548'; }  // 消防员红盔藏青衣
  if (role === 8) { c.R = '#5F6169'; c.r = '#3B3D46'; c.P = '#3B3D46'; c.C = '#8A6F4C'; }   // 环卫工灰衣橙背心
  if (role === 9) {  // 游客花衬衫 + 卡其短裤
    const aloha = [['#5BC8B8', '#28635F'], ['#E05548', '#9C4433']][v % 2];
    c.R = aloha[0]; c.r = aloha[1]; c.T = '#E8D5A3'; c.P = '#8A6F4C'; c.Y = '#F2D24B';
  }
  return c;
}

const ROLE_BODIES: Record<number, Body[]> = {
  1: [0], 2: [0], 3: [1], 4: [0], 5: [0],
  6: [0], 7: [0], 8: [0], 9: [0],
};
const FACINGS: Facing[] = ['dr', 'dl', 'ur', 'ul'];

// ------------------------------------------------------------
// 宠物（v3）：狗 / 猫 —— 四足像素精灵（朝右基准，dl/ul 镜像）
// ------------------------------------------------------------

export type PetKind = 'dog' | 'cat';

function dogGrid(pose: 0 | 1): Grid {
  return pose === 0 ? [
    '.......E.',
    '.T...DDD.',
    '..DDDDDeD',
    '..DDDDDDN',
    '...D..D..',
    '...K..K..',
  ] : [
    '.......E.',
    'T....DDD.',
    '..DDDDDeD',
    '..DDDDDDN',
    '..D....D.',
    '..K....K.',
  ];
}

function dogSit(): Grid {
  return [
    '.......E.',
    '.T...DDD.',
    '..DDDDDeD',
    '..DDDDDDN',
    '..DDDDDD.',
    '..KK.KK..',
  ];
}

function catGrid(pose: 0 | 1): Grid {
  return pose === 0 ? [
    '.....E.',
    '.TCCCCC',
    '..CCCeN',
    '..C..C.',
    '..K..K.',
  ] : [
    '.....E.',
    'T.CCCCC',
    '..CCCeN',
    '...CC..',
    '...KK..',
  ];
}

function catSit(): Grid {
  return [
    '.....E.',
    '.TCCCCC',
    '..CCCeN',
    '..CCC..',
    '..K.K..',
  ];
}

const DOG_LOOKS = [
  { D: '#8A5A36', E: '#5A3A22', T: '#5A3A22' },   // 棕
  { D: '#E8D9B8', E: '#B3A17A', T: '#B3A17A' },   // 米白
  { D: '#3B3D46', E: '#23252E', T: '#23252E' },   // 黑
  { D: '#C09668', E: '#95734D', T: '#95734D' },   // 金
];
const CAT_LOOKS = [
  { C: '#F4F2E8', E: '#C3C7CC', T: '#C3C7CC' },   // 白
  { C: '#9BA0A7', E: '#6B7078', T: '#6B7078' },   // 灰
  { C: '#E0954B', E: '#B36B2E', T: '#B36B2E' },   // 橘
  { C: '#2C2E36', E: '#23252E', T: '#23252E' },   // 黑
];

export function buildPetSprites(): Map<string, PersonSprite> {
  const m = new Map<string, PersonSprite>();
  const put = (kind: PetKind, looks: Array<Record<string, string>>, g: Grid, pose: string, li: number) => {
    const colors: Record<string, string> = {
      ...looks[li], N: NIGHTC, e: NIGHTC, K: '#23252E',
    };
    const w = g[0].length, h = g.length;
    const ox = -Math.floor(w / 2), oy = -(h - 2);
    for (const f of FACINGS) {
      const gg = f === 'dl' || f === 'ul' ? mirror(g) : g;
      m.set(`${kind}#${li}#${f}#${pose}`, { cv: gridToCanvasC(gg, colors), ox, oy });
    }
  };
  for (let li = 0; li < 4; li++) {
    for (const pose of [0, 1] as const) {
      put('dog', DOG_LOOKS, dogGrid(pose), String(pose), li);
      put('cat', CAT_LOOKS, catGrid(pose), String(pose), li);
    }
    put('dog', DOG_LOOKS, dogSit(), 'sit', li);
    put('cat', CAT_LOOKS, catSit(), 'sit', li);
  }
  return m;
}

export function petSpOf(
  m: Map<string, PersonSprite>, kind: PetKind, facing: Facing, frame: number, look: number, sitting: boolean,
): PersonSprite | null {
  const pose = sitting ? 'sit' : String(frame % 2);
  const li = ((look % 4) + 4) % 4;
  return m.get(`${kind}#${li}#${facing}#${pose}`) ?? null;
}

// ------------------------------------------------------------
// 鸽子（v4）：广场鸽 —— 8×5 像素（头高/迈步/低头啄食三姿态）
// ------------------------------------------------------------

function birdGrid(pose: 0 | 1): Grid {
  return pose === 0 ? [
    '.....DD.',
    '..BBBDDD',
    'BBBBBDDE',
    'WBBBBB.O',
    '..O...O.',
  ] : [
    '.....DD.',
    '..BBBDDD',
    'BBBBBDDE',
    'WBBBBB.O',
    '...O.O..',
  ];
}

/** 啄食：头部压低到地面 */
function birdPeck(): Grid {
  return [
    '........',
    '..BBB...',
    'BBBBBBD.',
    'WBBBBDDO',
    '...O.O..',
  ];
}

const BIRD_LOOKS = [
  { B: '#9BA0A7', D: '#6B7078', W: '#C3C7CC' },   // 蓝灰羽
  { B: '#8A6F4C', D: '#6B543A', W: '#B3A17A' },   // 褐羽
];

export function buildBirdSprites(): Map<string, PersonSprite> {
  const m = new Map<string, PersonSprite>();
  for (let li = 0; li < BIRD_LOOKS.length; li++) {
    const colors: Record<string, string> = {
      ...BIRD_LOOKS[li], E: NIGHTC, O: '#E0954B',
    };
    const put = (g: Grid, pose: string) => {
      const w = g[0].length, h = g.length;
      const ox = -Math.floor(w / 2), oy = -(h - 1);
      for (const f of FACINGS) {
        const gg = f === 'dl' || f === 'ul' ? mirror(g) : g;
        m.set(`bird#${li}#${f}#${pose}`, { cv: gridToCanvasC(gg, colors), ox, oy });
      }
    };
    put(birdGrid(0), '0');
    put(birdGrid(1), '1');
    put(birdPeck(), 'peck');
  }
  return m;
}

export function birdSpOf(
  m: Map<string, PersonSprite>, facing: Facing, frame: number, look: number, pecking: boolean,
): PersonSprite | null {
  const pose = pecking ? 'peck' : String(frame % 2);
  const li = ((look % 2) + 2) % 2;
  return m.get(`bird#${li}#${facing}#${pose}`) ?? null;
}

export type Facing = 'dr' | 'dl' | 'ur' | 'ul';
export type Body = 0 | 1 | 2;   // 0 成人 / 1 儿童 / 2 长者

export type PersonSprite = { cv: HTMLCanvasElement; ox: number; oy: number };

function paintGrid(g: Grid, lookI: number, look: PersonLook, body: Body, back: boolean): Grid {
  const out = g.slice();
  // 长发：背面族在肩部补头发
  if (back && look.long && body !== 2) {
    out[4] = body === 1 ? '.HHHHHH..' : '..HHHHHH..';
    if (body === 0) out[5] = '..HHHHHH..';
  }
  // 儿童：背面书包
  if (body === 1 && back) {
    out[6] = '.RBBBRRr.';
    out[7] = '.RBBBRRr.';
  }
  // 长者：手杖（最右列，行走侧前方）
  if (body === 2) {
    for (let y = 5; y <= 13; y++) {
      out[y] = (out[y] + '..........').slice(0, 9) + 'C';
    }
  }
  void lookI;
  return out;
}

/** 市民配色（符号 → 颜色） */
function colorsFromLook(lookI: number, look: PersonLook, body: Body): Record<string, string> {
  const hair = body === 2 ? ELDER_HAIR[lookI % 3] : look.hair;
  return {
    H: hair, S: look.skin, E: NIGHTC,
    R: look.shirt, r: look.shirtDark,
    P: look.pants, K: NIGHTC, C: CANE, B: BAG,
  };
}

/** 符号网格 → 着色画布 */
function gridToCanvasC(g: Grid, colors: Record<string, string>): HTMLCanvasElement {
  const w = g[0].length, h = g.length;
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const ctx = cv.getContext('2d')!;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const ch = g[y][x];
      if (ch === '.') continue;
      ctx.fillStyle = colors[ch] ?? NIGHTC;
      ctx.fillRect(x, y, 1, 1);
    }
  }
  return cv;
}

function gridToCanvas(g: Grid, lookI: number, look: PersonLook, body: Body): HTMLCanvasElement {
  return gridToCanvasC(g, colorsFromLook(lookI, look, body));
}

/** 生成 4 朝向 × 双步态 × 三体型 × N 配色 的行人精灵表 + 职业制服精灵 */
export function buildPersonSprites(): Map<string, PersonSprite> {
  const map = new Map<string, PersonSprite>();
  for (let lookI = 0; lookI < LOOKS.length; lookI++) {
    const look = LOOKS[lookI];
    for (const body of [0, 1, 2] as Body[]) {
      for (const pose of [0, 1] as const) {
        const front: Grid = body === 1 ? childFront(pose) : body === 2 ? elderGrid(pose) : adultFront(pose);
        const back: Grid = body === 1 ? childBack(pose) : body === 2 ? elderGrid(pose) : adultBack(pose);
        const grids: Record<Facing, Grid> = {
          dr: paintGrid(front, lookI, look, body, false),
          dl: mirror(paintGrid(front, lookI, look, body, false)),
          ur: paintGrid(back, lookI, look, body, true),
          ul: mirror(paintGrid(back, lookI, look, body, true)),
        };
        const w = grids.dr[0].length, h = grids.dr.length;
        const ox = -Math.floor(w / 2), oy = -(h - 2);
        for (const f of ['dr', 'dl', 'ur', 'ul'] as Facing[]) {
          map.set(`${f}#${pose}#${lookI}#${body}`, {
            cv: gridToCanvas(grids[f], lookI, look, body), ox, oy,
          });
        }
      }
    }
  }
  // 职业制服精灵：警1/邮2/厨4/跑5/医6/消7/环8/游9 为成人，学3 为少年；每职业 2 变体（跑者 4 衣色）
  for (let role = 1; role <= 9; role++) {
    const variants = role === 5 ? 4 : 2;
    for (let v = 0; v < variants; v++) {
      const look = LOOKS[(v * 5 + role) % LOOKS.length];
      for (const body of ROLE_BODIES[role]) {
        for (const pose of [0, 1] as const) {
          const front: Grid = body === 1 ? childFront(pose) : adultFront(pose);
          const back: Grid = body === 1 ? childBack(pose) : adultBack(pose);
          const grids: Record<Facing, Grid> = {
            dr: applyRole(front, role as Role, body, false),
            dl: mirror(applyRole(front, role as Role, body, false)),
            ur: applyRole(back, role as Role, body, true),
            ul: mirror(applyRole(back, role as Role, body, true)),
          };
          const w = grids.dr[0].length, h = grids.dr.length;
          const ox = -Math.floor(w / 2), oy = -(h - 2);
          const colors = roleColors(role as Role, look, body, v, v);
          for (const f of FACINGS) {
            map.set(`R${role}#${f}#${pose}#${v}`, {
              cv: gridToCanvasC(grids[f], colors), ox, oy,
            });
          }
        }
      }
    }
  }
  return map;
}

/** 步态 4 帧 → 双姿态（0/2 → 姿态0，1/3 → 姿态1）；role>0 走制服精灵 */
export function personSpOf(
  m: Map<string, PersonSprite>, facing: Facing, frame: number, look: number, body: Body, role: Role = 0,
): PersonSprite | null {
  const pose = frame % 2 === 0 ? 0 : 1;
  if (role > 0) {
    const v = role === 5 ? ((look % 4) + 4) % 4 : ((look % 2) + 2) % 2;
    return m.get(`R${role}#${facing}#${pose}#${v}`) ?? null;
  }
  const li = ((look % LOOK_N) + LOOK_N) % LOOK_N;
  return m.get(`${facing}#${pose}#${li}#${body}`) ?? null;
}

// ------------------------------------------------------------
// 车辆：程序化建模（沿 X 或 Y 轴的小轿车，含出租车）
// ------------------------------------------------------------

export type CarDir = 'e' | 'w' | 's' | 'n';

const CAR_COLORS = [P.RED, P.CYAN, P.PBLUE, P.WHITE, P.TAN];

function carModel(axis: 'x' | 'y', forward: 1 | -1, color: number, taxi: boolean): Model {
  const faces: Face[] = [];
  const along = (a: number, c: number): [number, number] => axis === 'x' ? [a, c] : [c, a];
  const bx = (a0: number, c0: number, a1: number, c1: number, z0: number, z1: number, mats: BoxMats) => {
    const [x0, y0] = along(a0, c0);
    const [x1, y1] = along(a1, c1);
    box(faces, x0, y0, x1, y1, z0, z1, mats);
  };
  const body = taxi ? P.PAINTY : color;
  bx(3.2, 5.4, 12.8, 10.6, 0.8, 3.4, {
    right: pWall(body), left: pWall(body),
  });
  bx(3.4, 5.6, 12.6, 10.4, 0.4, 0.9, {
    right: () => cell(P.OUTLINE, 0), left: () => cell(P.OUTLINE, 0),
  });
  bx(5.8, 5.9, 10.4, 10.1, 3.4, 5.4, {
    right: (u, v, px, py) => ((v % 2 < 1) ? cell(P.GLASS, 0) : cell(P.GLASS, 1)),
    left: (u, v, px, py) => ((v % 2 < 1) ? cell(P.GLASS, 1) : cell(P.GLASS, 2)),
    top: pFlatRoof(body, 1),
  });
  for (const a of [4.4, 11.0]) {
    for (const c of [4.9, 10.9]) {
      bx(a, c, a + 1.6, c + 1.0, 0, 1.4, {
        right: () => cell(P.OUTLINE, 0), left: () => cell(P.OUTLINE, 0),
      });
    }
  }
  const frontAtPlus = forward === 1;
  bx(12.8, 6.2, 13.3, 9.8, 1.6, 2.6, {
    right: () => cell(frontAtPlus ? P.YELLOW : P.RED, 0),
  });
  if (taxi) {
    bx(7.2, 7.2, 8.8, 8.8, 5.4, 6.3, {
      right: () => cell(P.WHITE, 0), left: () => cell(P.WHITE, 0), top: () => cell(P.RED, 0),
    });
  }
  return buildModel(faces, 16, 16);
}

export function buildCarSprites(): Map<string, Sprite> {
  const map = new Map<string, Sprite>();
  const cfg: Array<[CarDir, 'x' | 'y', 1 | -1]> = [
    ['e', 'x', 1], ['w', 'x', -1], ['s', 'y', 1], ['n', 'y', -1],
  ];
  for (const [dir, axis, fwd] of cfg) {
    for (let c = 0; c < CAR_COLORS.length; c++) {
      map.set(`${dir}#${c}`, renderModel(carModel(axis, fwd, CAR_COLORS[c], false), { shadow: false }));
    }
    map.set(`${dir}#taxi`, renderModel(carModel(axis, fwd, 0, true), { shadow: false }));
  }
  return map;
}

export function carSpriteKey(dir: CarDir, look: number): string {
  return `${dir}#${look === 5 ? 'taxi' : (look % CAR_COLORS.length)}`;
}

// ------------------------------------------------------------
// v7 公共交通：巴士（22 长车身 · 双色涂装 · 路牌灯箱）
// ------------------------------------------------------------

function busModel(axis: 'x' | 'y', forward: 1 | -1, scheme: number): Model {
  const faces: Face[] = [];
  const along = (a: number, c: number): [number, number] => axis === 'x' ? [a, c] : [c, a];
  const bx = (a0: number, c0: number, a1: number, c1: number, z0: number, z1: number, mats: BoxMats) => {
    const [x0, y0] = along(a0, c0);
    const [x1, y1] = along(a1, c1);
    box(faces, x0, y0, x1, y1, z0, z1, mats);
  };
  // 城市涂装：0 翡翠绿/米白（市区线）  1 藏青/米白（郊区线）
  const mainRamp = scheme === 0 ? P.GRASS : P.PBLUE;   // 市区线翡翠绿 / 郊区线藏青
  // 下层车身（米白裙板 + 深色裙边）
  bx(1.6, 5.2, 21.4, 10.8, 0.9, 3.6, {
    right: () => cell(P.SIDE, 0), left: () => cell(P.SIDE, 0),
  });
  // 上层车身（主色）
  bx(1.6, 5.2, 21.4, 10.8, 3.6, 8.2, {
    right: () => cell(mainRamp, 1), left: () => cell(mainRamp, 2),
  });
  // 侧窗带：5 扇车窗（前侧含前门）
  for (let k = 0; k < 5; k++) {
    const a0 = 3.2 + k * 3.6;
    bx(a0, 5.0, a0 + 2.4, 10.9, 4.4, 7.2, {
      right: (u, v) => (v % 2 < 1 ? cell(P.GLASS, 0) : cell(P.GLASS, 1)),
      left: (u, v) => (v % 2 < 1 ? cell(P.GLASS, 1) : cell(P.GLASS, 2)),
    });
  }
  // 车顶（浅色圆弧感）
  bx(2.0, 5.6, 21.0, 10.4, 8.2, 9.0, {
    top: pFlatRoof(P.TAN, 1), right: () => cell(P.CREAM, 0), left: () => cell(P.CREAM, 0),
  });
  // 前脸：挡风玻璃 + 路牌灯箱（车头在 forward 一端）
  const fA = forward === 1 ? 21.4 : 1.6;
  const fz = 4.2;
  bx(fA - 0.1, 5.6, fA + 0.9, 10.4, fz, 7.4, {
    right: () => cell(P.GLASS, 2), left: () => cell(P.GLASS, 0),
  });
  bx(fA - 0.2, 6.2, fA + 1.0, 10.0, 7.6, 8.8, {
    right: () => cell(P.YELLOW, 0), left: () => cell(P.PAINTY, 0),
  });
  // 前灯 / 尾灯
  bx(fA - 0.1, 5.8, fA + 0.7, 6.6, 2.0, 2.9, {
    right: () => cell(P.YELLOW, 0), left: () => cell(P.YELLOW, 0),
  });
  const rA = forward === 1 ? 1.6 : 21.4;
  bx(rA - 0.1, 5.8, rA + 0.7, 6.6, 2.0, 2.9, {
    right: () => cell(P.RED, 0), left: () => cell(P.RED, 0),
  });
  // 车轮：前后两轴（深色轮毂 + 白色轮毂盖）
  for (const a of [4.2, 18.2]) {
    bx(a, 4.6, a + 2.4, 5.6, 0, 2.0, {
      right: () => cell(P.OUTLINE, 0), left: () => cell(P.OUTLINE, 0),
    });
    bx(a, 10.4, a + 2.4, 11.4, 0, 2.0, {
      right: () => cell(P.OUTLINE, 0), left: () => cell(P.OUTLINE, 0),
    });
  }
  return buildModel(faces, 24, 16);
}


// ------------------------------------------------------------
// v11 有轨电车：复古单节箱体 · 受电弓 · 双色涂装（干线绿 / 观光红）
// ------------------------------------------------------------

function tramModel(axis: 'x' | 'y', forward: 1 | -1, scheme: number): Model {
  const faces: Face[] = [];
  const along = (a: number, c: number): [number, number] => axis === 'x' ? [a, c] : [c, a];
  const bx = (a0: number, c0: number, a1: number, c1: number, z0: number, z1: number, mats: BoxMats) => {
    const [x0, y0] = along(a0, c0);
    const [x1, y1] = along(a1, c1);
    box(faces, x0, y0, x1, y1, z0, z1, mats);
  };
  // 涂装：0 翡翠绿/奶油（城市干线） 1 酒红/奶油（观光线）
  const main = scheme === 0 ? P.GRASS : P.RFRED;
  // 下层裙板（奶油 + 深色底盘）
  bx(2.8, 5.4, 21.2, 10.6, 0.9, 3.4, {
    right: () => cell(P.CREAM, 0), left: () => cell(P.CREAM, 0),
  });
  bx(2.8, 5.4, 21.2, 10.6, 0.5, 0.9, {
    right: () => cell(P.OUTLINE, 0), left: () => cell(P.OUTLINE, 0),
  });
  // 黄色饰条（裙板顶缘）
  bx(2.8, 5.3, 21.2, 10.7, 3.4, 4.1, {
    right: () => cell(P.YELLOW, 0), left: () => cell(P.PAINTY, 0),
  });
  // 上层主色车身
  bx(2.8, 5.4, 21.2, 10.6, 4.1, 9.0, {
    right: () => cell(main, 1), left: () => cell(main, 2),
  });
  // 侧窗带：6 扇大车窗
  for (let k = 0; k < 6; k++) {
    const a0 = 3.6 + k * 3.0;
    bx(a0, 5.2, a0 + 2.2, 10.7, 5.2, 8.4, {
      right: (u, v) => (v % 2 < 1 ? cell(P.GLASS, 0) : cell(P.GLASS, 1)),
      left: (u, v) => (v % 2 < 1 ? cell(P.GLASS, 1) : cell(P.GLASS, 2)),
    });
  }
  // 圆弧车顶（奶油）
  bx(3.2, 5.8, 20.8, 10.2, 9.0, 10.2, {
    top: pFlatRoof(P.CREAM, 1), right: () => cell(P.CREAM, 0), left: () => cell(P.CREAM, 0),
  });
  // 受电弓（前部：双斜臂 + 顶横杆）
  const pA0 = forward === 1 ? 16.2 : 5.0;
  const pA1 = forward === 1 ? 18.6 : 7.4;
  bx(pA0 + 0.3, 7.6, pA1 - 0.3, 7.9, 10.2, 13.6, { right: () => cell(P.METAL, 1), left: () => cell(P.METAL, 1) });
  bx(pA0 + 0.3, 8.1, pA1 - 0.3, 8.4, 10.2, 13.6, { right: () => cell(P.METAL, 1), left: () => cell(P.METAL, 1) });
  bx(pA0 - 0.6, 7.5, pA1 + 0.6, 8.5, 13.6, 14.3, {
    top: pFlatRoof(P.METAL, 2), right: () => cell(P.METAL, 0), left: () => cell(P.METAL, 0),
  });
  // 前脸：大挡风 + 路牌灯箱 + 双圆头灯（forward 端）
  const fA = forward === 1 ? 21.2 : 2.8;
  bx(fA - 0.1, 5.8, fA + 0.9, 10.2, 5.0, 8.8, {
    right: () => cell(P.GLASS, 2), left: () => cell(P.GLASS, 0),
  });
  bx(fA - 0.2, 6.0, fA + 1.0, 10.0, 8.9, 10.1, {
    right: () => cell(P.CREAM, 0), left: () => cell(P.YELLOW, 0),
  });
  bx(fA - 0.1, 5.9, fA + 0.7, 6.7, 3.6, 4.7, {
    right: () => cell(P.YELLOW, 0), left: () => cell(P.YELLOW, 0),
  });
  bx(fA - 0.1, 9.3, fA + 0.7, 10.1, 3.6, 4.7, {
    right: () => cell(P.YELLOW, 0), left: () => cell(P.YELLOW, 0),
  });
  // 尾灯（红）
  const rA = forward === 1 ? 2.8 : 21.2;
  bx(rA - 0.1, 5.9, rA + 0.7, 6.7, 3.6, 4.7, {
    right: () => cell(P.RED, 0), left: () => cell(P.RED, 0),
  });
  bx(rA - 0.1, 9.3, rA + 0.7, 10.1, 3.6, 4.7, {
    right: () => cell(P.RED, 0), left: () => cell(P.RED, 0),
  });
  // 车轮（半嵌裙板：前后两轴）
  for (const a of [5.0, 17.6]) {
    bx(a, 4.7, a + 2.2, 5.6, 0, 1.8, {
      right: () => cell(P.OUTLINE, 0), left: () => cell(P.OUTLINE, 0),
    });
    bx(a, 10.4, a + 2.2, 11.3, 0, 1.8, {
      right: () => cell(P.OUTLINE, 0), left: () => cell(P.OUTLINE, 0),
    });
  }
  return buildModel(faces, 24, 16);
}

export function buildTramSprites(): Map<string, Sprite> {
  const map = new Map<string, Sprite>();
  const cfg: Array<[CarDir, 'x' | 'y', 1 | -1]> = [
    ['e', 'x', 1], ['w', 'x', -1], ['s', 'y', 1], ['n', 'y', -1],
  ];
  for (const [dir, axis, fwd] of cfg) {
    for (let s = 0; s < 2; s++) {
      map.set(`${dir}#${s}`, renderModel(tramModel(axis, fwd, s), { shadow: false }));
    }
  }
  return map;
}

export function buildBusSprites(): Map<string, Sprite> {
  const map = new Map<string, Sprite>();
  const cfg: Array<[CarDir, 'x' | 'y', 1 | -1]> = [
    ['e', 'x', 1], ['w', 'x', -1], ['s', 'y', 1], ['n', 'y', -1],
  ];
  for (const [dir, axis, fwd] of cfg) {
    for (let s = 0; s < 2; s++) {
      map.set(`${dir}#${s}`, renderModel(busModel(axis, fwd, s), { shadow: false }));
    }
  }
  return map;
}

// ------------------------------------------------------------
// v7 水上船舶：渔船 / 帆船 / 渡轮（贴水面航行 · 尾迹由引擎绘制）
// ------------------------------------------------------------

function boatModel(axis: 'x' | 'y', forward: 1 | -1, kind: 0 | 1 | 2): Model {
  const faces: Face[] = [];
  const along = (a: number, c: number): [number, number] => axis === 'x' ? [a, c] : [c, a];
  const bx = (a0: number, c0: number, a1: number, c1: number, z0: number, z1: number, mats: BoxMats) => {
    const [x0, y0] = along(a0, c0);
    const [x1, y1] = along(a1, c1);
    box(faces, x0, y0, x1, y1, z0, z1, mats);
  };
  const bow = forward === 1;   // 船头朝 +a
  if (kind === 0) {
    // 渔船：红棕船身 + 白色驾驶舱 + 桅杆小旗
    bx(2.0, 6.0, 12.0, 10.0, 0.3, 2.2, {
      right: () => cell(P.RFRED, 0), left: () => cell(P.RFRED, 0),
      top: () => cell(P.SAND, 0),
    });
    // 船头收窄段（船首在 bow 一侧，另一端为方尾）
    bx(bow ? 12.0 : 0.0, 6.8, bow ? 14.2 : 2.0, 9.2, 0.3, 1.6, {
      right: () => cell(P.RFRED, 1), left: () => cell(P.RFRED, 0),
      top: () => cell(P.SAND, 0),
    });
    // 驾驶舱
    bx(4.4, 6.4, 8.4, 9.6, 2.2, 5.0, {
      right: () => cell(P.CREAM, 0), left: () => cell(P.CREAM, 0),
      top: pFlatRoof(P.TAN, 0),
    });
    bx(5.0, 6.2, 6.4, 9.8, 3.4, 4.6, {
      right: () => cell(P.GLASS, 0), left: () => cell(P.GLASS, 2),
    });
    // 桅杆 + 三角旗
    bx(9.4, 7.8, 10.2, 8.2, 5.0, 9.6, {
      right: () => cell(P.DIRT, 0), left: () => cell(P.DIRT, 0),
    });
    bx(bow ? 10.2 : 8.6, 7.8, bow ? 11.4 : 9.8, 8.4, 8.6, 9.6, {
      right: () => cell(P.RED, 0), left: () => cell(P.RED, 0),
    });
  } else if (kind === 1) {
    // 帆船：白色船身 + 高桅 + 双段帆
    bx(3.0, 6.2, 12.4, 9.8, 0.3, 2.0, {
      right: () => cell(P.WHITE, 0), left: () => cell(P.METAL, 0),
      top: () => cell(P.SAND, 0),
    });
    bx(bow ? 12.4 : 1.4, 6.8, bow ? 14.0 : 3.0, 9.2, 0.3, 1.4, {
      right: () => cell(P.WHITE, 0), left: () => cell(P.METAL, 0),
      top: () => cell(P.SAND, 0),
    });
    // 桅杆
    bx(8.0, 7.8, 8.6, 8.2, 2.0, 13.0, {
      right: () => cell(P.DIRT, 0), left: () => cell(P.DIRT, 0),
    });
    // 主帆（两段梯形近似）+ 前帆
    bx(bow ? 8.6 : 5.0, 7.0, bow ? 12.0 : 8.0, 8.9, 7.5, 12.4, {
      right: () => cell(P.WHITE, 0), left: () => cell(P.CREAM, 0),
    });
    bx(bow ? 8.6 : 5.6, 7.4, bow ? 11.2 : 8.0, 8.6, 3.6, 7.5, {
      right: () => cell(P.CREAM, 0), left: () => cell(P.CREAM, 0),
    });
    bx(bow ? 8.6 : 4.4, 7.2, bow ? 10.6 : 8.0, 8.0, 4.2, 8.0, {
      right: () => cell(P.WHITE, 1), left: () => cell(P.CREAM, 1),
    });
  } else {
    // 渡轮：蓝白双层车客渡 + 烟囱
    bx(1.2, 5.4, 14.8, 10.6, 0.3, 2.6, {
      right: () => cell(P.PBLUE, 0), left: () => cell(P.PBLUE, 0),
      top: () => cell(P.CREAM, 0),
    });
    bx(bow ? 14.8 : 0.0, 6.0, bow ? 16.4 : 1.6, 10.0, 0.3, 1.8, {
      right: () => cell(P.PBLUE, 1), left: () => cell(P.PBLUE, 0),
      top: () => cell(P.CREAM, 0),
    });
    // 主甲板舱（两层 + 窗带）
    bx(2.6, 5.8, 12.6, 10.2, 2.6, 6.2, {
      right: () => cell(P.CREAM, 0), left: () => cell(P.CREAM, 0),
      top: pFlatRoof(P.TAN, 1),
    });
    for (let k = 0; k < 4; k++) {
      const a0 = 3.4 + k * 2.3;
      bx(a0, 5.6, a0 + 1.4, 10.3, 3.6, 5.4, {
        right: (u, v) => (v % 2 < 1 ? cell(P.GLASS, 0) : cell(P.GLASS, 1)),
        left: (u, v) => (v % 2 < 1 ? cell(P.GLASS, 1) : cell(P.GLASS, 2)),
      });
    }
    bx(3.4, 6.2, 10.6, 9.8, 6.2, 8.6, {
      right: () => cell(P.CREAM, 0), left: () => cell(P.CREAM, 0),
      top: pFlatRoof(P.TAN, 2),
    });
    // 烟囱（红白环纹）
    bx(9.8, 7.2, 11.0, 8.8, 8.6, 11.0, {
      right: () => cell(P.RED, 0), left: () => cell(P.RFRED, 0),
      top: () => cell(P.OUTLINE, 0),
    });
  }
  return buildModel(faces, 16, 16);
}

export function buildBoatSprites(): Map<string, Sprite> {
  const map = new Map<string, Sprite>();
  const cfg: Array<[CarDir, 'x' | 'y', 1 | -1]> = [
    ['e', 'x', 1], ['w', 'x', -1], ['s', 'y', 1], ['n', 'y', -1],
  ];
  for (const [dir, axis, fwd] of cfg) {
    for (let k = 0; k < 3; k++) {
      map.set(`${dir}#${k}`, renderModel(boatModel(axis, fwd, k as 0 | 1 | 2), { shadow: false }));
    }
  }
  return map;
}

// ------------------------------------------------------------
// v7 骑行者：程序化双人自行车（侧面车架 / 正面车把）
// ------------------------------------------------------------

function bikeModel(axis: 'x' | 'y', forward: 1 | -1, pose: 0 | 1, shirtRamp: number, darkRamp: number): Model {
  const faces: Face[] = [];
  const along = (a: number, c: number): [number, number] => axis === 'x' ? [a, c] : [c, a];
  const bx = (a0: number, c0: number, a1: number, c1: number, z0: number, z1: number, mats: BoxMats) => {
    const [x0, y0] = along(a0, c0);
    const [x1, y1] = along(a1, c1);
    box(faces, x0, y0, x1, y1, z0, z1, mats);
  };
  const K = P.OUTLINE;
  const dark = () => cell(K, 0);
  if (axis === 'x') {
    // —— 侧面：双轮 + 车架 + 骑手 ——
    for (const a of [2.4, 11.6]) {
      bx(a, 7.2, a + 2.6, 8.8, 0, 2.6, { right: dark, left: dark });
      bx(a + 0.7, 7.8, a + 1.9, 8.2, 0.7, 1.9, { right: () => cell(P.METAL, 0), left: () => cell(P.METAL, 0) });
    }
    // 车架：下管 + 座管 + 头管
    bx(4.2, 7.6, 12.0, 8.4, 2.2, 3.2, { right: () => cell(P.RFRED, 0), left: () => cell(P.RFRED, 0) });
    bx(4.8, 7.5, 6.0, 8.5, 3.2, 5.6, { right: () => cell(P.METAL, 0), left: dark });
    bx(11.0, 7.5, 12.2, 8.5, 3.2, 5.8, { right: () => cell(P.METAL, 0), left: dark });
    // 车座 + 车把
    bx(4.2, 7.3, 6.2, 8.7, 5.6, 6.4, { right: dark, left: dark, top: () => cell(P.ASPH, 0) });
    bx(11.4, 6.8, 13.0, 9.2, 5.8, 6.6, { right: dark, left: dark });
    // 骑手：臀部 → 躯干前倾 → 头盔 + 手臂
    bx(4.6, 7.0, 7.4, 9.0, 6.2, 8.6, { right: () => cell(darkRamp, 1), left: () => cell(darkRamp, 2) });
    bx(6.6, 6.8, 10.6, 8.8, 8.2, 10.6, { right: () => cell(shirtRamp, 1), left: () => cell(darkRamp, 1) });
    bx(10.0, 7.0, 11.8, 8.6, 10.4, 12.4, { right: () => cell(shirtRamp, 1), left: () => cell(shirtRamp, 2) });
    bx(10.4, 6.6, 11.4, 9.0, 12.4, 13.6, { right: () => cell(P.YELLOW, 0), left: () => cell(P.PAINTY, 0) });
    bx(9.4, 7.6, 12.4, 8.4, 9.0, 9.9, { right: () => cell(P.SAND, 0), left: () => cell(P.SAND, 0) });
    // 腿：两个踏板相位（pose 交替）
    if (pose === 0) {
      bx(7.0, 7.2, 8.6, 8.8, 4.0, 6.4, { right: () => cell(P.ASPH, 0), left: () => cell(P.ASPH, 0) });
      bx(8.2, 7.4, 9.2, 8.6, 2.4, 4.2, { right: () => cell(P.ASPH, 1), left: () => cell(P.ASPH, 0) });
    } else {
      bx(7.2, 7.4, 8.2, 8.6, 2.4, 4.6, { right: () => cell(P.ASPH, 1), left: () => cell(P.ASPH, 0) });
      bx(8.0, 7.2, 9.4, 8.8, 4.2, 6.4, { right: () => cell(P.ASPH, 0), left: () => cell(P.ASPH, 0) });
    }
  } else {
    // —— 正 / 背面：前轮 + 横车把 + 骑手（朝向按 forward 仅影响头灯）——
    bx(6.6, 2.4, 9.4, 5.0, 0, 2.6, { right: dark, left: dark });
    bx(7.4, 3.0, 8.6, 4.4, 0.7, 1.9, { right: () => cell(P.METAL, 0), left: () => cell(P.METAL, 0) });
    // 前叉 + 车把
    bx(7.4, 4.6, 8.6, 8.4, 2.4, 3.2, { right: () => cell(P.RFRED, 0), left: () => cell(P.RFRED, 0) });
    bx(5.0, 7.6, 11.0, 8.4, 5.6, 6.6, { right: dark, left: dark });
    // 车身（骑手遮挡，只露座管）
    bx(7.2, 7.6, 8.8, 12.4, 2.6, 5.6, { right: () => cell(P.METAL, 0), left: dark });
    // 骑手：躯干 + 头盔 + 双臂前伸 + 双腿
    bx(6.4, 7.4, 9.6, 10.2, 6.2, 10.6, { right: () => cell(shirtRamp, 1), left: () => cell(shirtRamp, 2) });
    bx(6.8, 6.8, 9.2, 9.0, 10.6, 13.0, { right: () => cell(shirtRamp, 1), left: () => cell(darkRamp, 1) });
    bx(7.0, 7.0, 9.0, 8.8, 13.0, 14.4, { right: () => cell(P.YELLOW, 0), left: () => cell(P.PAINTY, 0) });
    bx(6.0, 7.2, 7.0, 8.8, 8.6, 9.6, { right: () => cell(P.SAND, 0), left: () => cell(P.SAND, 0) });
    bx(9.0, 7.2, 10.0, 8.8, 8.6, 9.6, { right: () => cell(P.SAND, 0), left: () => cell(P.SAND, 0) });
    const lA = forward === 1 ? 12.0 : 3.6;
    bx(lA, 7.0, lA + 0.8, 8.0, 9.8, 10.6, { right: () => cell(P.SAND, 0), left: () => cell(P.SAND, 0) });
    // 双腿（踏板相位交替：左上右下 / 左下右上）
    if (pose === 0) {
      bx(6.6, 8.6, 8.0, 10.4, 3.2, 6.2, { right: () => cell(P.ASPH, 0), left: () => cell(P.ASPH, 0) });
      bx(8.2, 8.6, 9.6, 10.4, 5.0, 7.4, { right: () => cell(P.ASPH, 1), left: () => cell(P.ASPH, 0) });
    } else {
      bx(6.6, 8.6, 8.0, 10.4, 5.0, 7.4, { right: () => cell(P.ASPH, 1), left: () => cell(P.ASPH, 0) });
      bx(8.2, 8.6, 9.6, 10.4, 3.2, 6.2, { right: () => cell(P.ASPH, 0), left: () => cell(P.ASPH, 0) });
    }
  }
  return buildModel(faces, 16, 16);
}

/** 骑行衣色（ramp 主色 / 暗色对）：红 / 蓝 / 黄 / 青 */
const BIKE_RAMPS: Array<[number, number]> = [
  [P.RFRED, P.BRICK], [P.PBLUE, P.RFSLATE], [P.PAINTY, P.SAND], [P.RFTEAL, P.PINE],
];

export function buildBikeSprites(): Map<string, Sprite> {
  const map = new Map<string, Sprite>();
  const cfg: Array<[CarDir, 'x' | 'y', 1 | -1]> = [
    ['e', 'x', 1], ['w', 'x', -1], ['s', 'y', 1], ['n', 'y', -1],
  ];
  for (const [dir, axis, fwd] of cfg) {
    for (let c = 0; c < BIKE_RAMPS.length; c++) {
      const [shirtRamp, darkRamp] = BIKE_RAMPS[c];
      for (const pose of [0, 1] as const) {
        map.set(`${dir}#${c}#${pose}`, renderModel(
          bikeModel(axis, fwd, pose, shirtRamp, darkRamp),
          { shadow: false },
        ));
      }
    }
  }
  return map;
}

// ------------------------------------------------------------
// 角色系统：路径寻路 + 路口停顿 + 夜间规模回落
// ------------------------------------------------------------

export type Actor = {
  kind: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8; // 0 行人 / 1 车辆 / 2 狗 / 3 猫 / 4 鸽子 / 5 巴士 / 6 船舶 / 7 骑行者 / 8 电车（v11）
  fx: number; fy: number; // 当前出发格
  dx: number; dy: number; // 行进方向
  t: number;              // 0..1 行进进度
  speed: number;          // 格 / 秒
  look: number;           // 配色（行人=衣装；宠物=毛色 0-3；鸽=羽色 0-1）
  body: Body;             // 行人体型
  role: Role;             // 行人职业（0 市民）
  phase: number;          // 步态相位偏移
  offX: number; offY: number; // 世界 px 横向偏移
  path: Array<[number, number]> | null;  // 剩余路（每步 [dx,dy]）
  wait: number;           // 停留秒数
  master: Actor | null;   // 狗的主人（流浪为 null）
  gone: boolean;          // 已移除标记（供跟随者检测）
  home?: [number, number] | null;  // 鸽群活动中心
  flee?: number;          // 鸽子受惊剩余秒
  thx?: number; thy?: number;      // 威胁来源坐标（受惊时记录）
  tour?: boolean;                  // v10 系统游客（景点漫步，短行程，独立于市民行人池）
};

const DIRS: Array<[number, number]> = [[1, 0], [-1, 0], [0, 1], [0, -1]];

const DIR_OF = (a: Actor): CarDir | Facing => {
  if (a.kind === 1 || a.kind >= 5) {   // 车辆 / 巴士 / 船 / 骑行者共用四向
    if (a.dx === 1) return 'e';
    if (a.dx === -1) return 'w';
    if (a.dy === 1) return 's';
    return 'n';
  }
  // 行人 / 宠物共用四朝向（宠物 dl/ul 为镜像侧影）
  if (a.dx === 1) return 'dr';
  if (a.dx === -1) return 'ul';
  if (a.dy === 1) return 'dl';
  return 'ur';
};

/** BFS 找一条通往随机目的地的路（限量扩展） */
function findPath(map: CityMap, sx: number, sy: number, near: number, far: number): Array<[number, number]> | null {
  const n = map.n;
  let dest: [number, number] | null = null;
  for (let k = 0; k < 16 && !dest; k++) {
    const rx = Math.floor(Math.random() * n);
    const ry = Math.floor(Math.random() * n);
    const d = Math.hypot(rx - sx, ry - sy);
    if (d < near || d > far) continue;
    if (map.road[map.idx(rx, ry)]) dest = [rx, ry];
  }
  if (!dest) return null;
  return bfsRoad(map, sx, sy, dest);
}

/** 定向 BFS：沿道路从 (sx,sy) 到 dest（null = 不连通 / 不可达） */
function bfsRoad(map: CityMap, sx: number, sy: number, dest: [number, number]): Array<[number, number]> | null {
  const n = map.n;
  const sIdx = map.idx(sx, sy);
  const tIdx = map.idx(dest[0], dest[1]);
  const prev = new Map<number, number>();
  prev.set(sIdx, -1);
  const q: number[] = [sIdx];
  let head = 0;
  const CAP = 2400;
  let found = false;
  while (head < q.length && q.length < CAP) {
    const cur = q[head++];
    if (cur === tIdx) { found = true; break; }
    const cx = cur % n, cy = (cur / n) | 0;
    for (const [dx, dy] of DIRS) {
      const nx = cx + dx, ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= n || ny >= n) continue;
      const ni = ny * n + nx;
      if (prev.has(ni) || !map.road[ni]) continue;
      prev.set(ni, cur);
      q.push(ni);
    }
  }
  if (!found && !prev.has(tIdx)) return null;
  const out: Array<[number, number]> = [];
  let cur = tIdx;
  let guard = 0;
  while (cur !== sIdx && cur >= 0 && guard++ < 5000) {
    const from = prev.get(cur);
    if (from === undefined || from < 0) break;
    const cx = cur % n, cy = (cur / n) | 0;
    const fx = from % n, fy = (from / n) | 0;
    out.unshift([cx - fx, cy - fy]);
    cur = from;
  }
  return out.length ? out : null;
}

/** v7 水路寻路：从 (sx,sy) 到随机远处水面格（避开桥面 / 建筑岸线） */
function findWaterPath(map: CityMap, sx: number, sy: number, near: number, far: number): Array<[number, number]> | null {
  const n = map.n;
  const isSea = (i: number): boolean => map.terr[i] === 1 && !map.road[i] && map.occ[i] < 0;
  let dest: [number, number] | null = null;
  for (let k = 0; k < 20 && !dest; k++) {
    const rx = Math.floor(Math.random() * n);
    const ry = Math.floor(Math.random() * n);
    const d = Math.hypot(rx - sx, ry - sy);
    if (d < near || d > far) continue;
    if (isSea(map.idx(rx, ry))) dest = [rx, ry];
  }
  if (!dest) return null;
  const sIdx = map.idx(sx, sy);
  const tIdx = map.idx(dest[0], dest[1]);
  const prev = new Map<number, number>();
  prev.set(sIdx, -1);
  const q: number[] = [sIdx];
  let head = 0;
  const CAP = 3600;
  let found = false;
  while (head < q.length && q.length < CAP) {
    const cur = q[head++];
    if (cur === tIdx) { found = true; break; }
    const cx = cur % n, cy = (cur / n) | 0;
    for (const [dx, dy] of DIRS) {
      const nx = cx + dx, ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= n || ny >= n) continue;
      const ni = ny * n + nx;
      if (prev.has(ni) || !isSea(ni)) continue;
      prev.set(ni, cur);
      q.push(ni);
    }
  }
  if (!found && !prev.has(tIdx)) return null;
  const out: Array<[number, number]> = [];
  let cur = tIdx;
  let guard = 0;
  while (cur !== sIdx && cur >= 0 && guard++ < 5000) {
    const from = prev.get(cur);
    if (from === undefined || from < 0) break;
    const cx = cur % n, cy = (cur / n) | 0;
    const fx = from % n, fy = (from / n) | 0;
    out.unshift([cx - fx, cy - fy]);
    cur = from;
  }
  return out.length ? out : null;
}

export class ActorSystem {
  actors: Actor[] = [];
  peds = 0;
  cars = 0;
  pets = 0;
  birds = 0;
  buses = 0;
  boats = 0;
  trams = 0;                 // v11 有轨电车（独立于巴士计数）
  tourists = 0;              // v10 系统游客（含在 actors 内，独立于 peds 计数）
  enabled = true;
  pedAuto = true;
  pedManual = 80;
  static readonly PED_MAX = 300;
  static readonly PED_AUTO_MAX = 220;
  static readonly CAR_MAX = 40;
  static readonly PET_MAX = 40;
  static readonly BIRD_MAX = 14;
  static readonly BUS_MAX = 3;
  static readonly BOAT_MAX = 3;
  static readonly TRAM_MAX = 2;
  static readonly TOURIST_MAX = 14;
  /** 0=深夜 1=白昼（引擎每帧回写；自动模式下人口随之消长） */
  dayness = 1;
  /** v7 冬季冰封（引擎每帧回写：封冻水面停航） */
  winterIce = false;
  /** 经营模式实际人口（引擎回写；null=沙盒按建筑容量推导）。人口越多街道越热闹 */
  popNow: number | null = null;
  /** v10 当前游客人数（引擎回写 tycoon.tourists；驱动景点漫步游客出生） */
  touristsNow = 0;
  private targetP = 0;
  private targetC = 0;
  private targetPet = 0;
  private targetBird = 0;
  private targetBus = 0;
  private targetTram = 0;
  private targetBoat = 0;
  private targetTourist = 0;
  private dirty = true;
  private spawnCd = 0;
  /** v7 车站路侧格缓存（巴士环线目的地表） */
  private stopTiles: Array<[number, number]> = [];
  /** v11 电车站路侧格缓存（电车干线目的地表） */
  private tramTiles: Array<[number, number]> = [];
  private ferryDocks: Array<[number, number]> = [];
  /** v10 景点周边路格缓存（游客出生点） */
  private attractTiles: Array<[number, number]> = [];

  private persons: Map<string, PersonSprite> | null = null;
  private carsMap: Map<string, Sprite> | null = null;
  private petSprites: Map<string, PersonSprite> | null = null;
  private birdSprites: Map<string, PersonSprite> | null = null;
  private busSprites: Map<string, Sprite> | null = null;
  private tramSprites: Map<string, Sprite> | null = null;
  private boatSprites: Map<string, Sprite> | null = null;
  private bikeSprites: Map<string, Sprite> | null = null;

  ensureSprites(): void {
    if (!this.persons) this.persons = buildPersonSprites();
    if (!this.carsMap) this.carsMap = buildCarSprites();
    if (!this.petSprites) this.petSprites = buildPetSprites();
    if (!this.birdSprites) this.birdSprites = buildBirdSprites();
    if (!this.busSprites) this.busSprites = buildBusSprites();
    if (!this.tramSprites) this.tramSprites = buildTramSprites();
    if (!this.boatSprites) this.boatSprites = buildBoatSprites();
    if (!this.bikeSprites) this.bikeSprites = buildBikeSprites();
  }

  personSp(facing: Facing, frame: number, look: number, body: Body, role: Role = 0): PersonSprite | null {
    return this.persons ? personSpOf(this.persons, facing, frame, look, body, role) : null;
  }

  petSp(kind: PetKind, facing: Facing, frame: number, look: number, sitting: boolean): PersonSprite | null {
    return this.petSprites ? petSpOf(this.petSprites, kind, facing, frame, look, sitting) : null;
  }

  birdSp(facing: Facing, frame: number, look: number, pecking: boolean): PersonSprite | null {
    return this.birdSprites ? birdSpOf(this.birdSprites, facing, frame, look, pecking) : null;
  }

  carSp(dir: CarDir, look: number): Sprite | null {
    return this.carsMap?.get(carSpriteKey(dir, look)) ?? null;
  }

  busSp(dir: CarDir, scheme: number): Sprite | null {
    return this.busSprites?.get(`${dir}#${scheme % 2}`) ?? null;
  }

  tramSp(dir: CarDir, scheme: number): Sprite | null {
    return this.tramSprites?.get(`${dir}#${scheme % 2}`) ?? null;
  }

  boatSp(dir: CarDir, kind: number): Sprite | null {
    return this.boatSprites?.get(`${dir}#${((kind % 3) + 3) % 3}`) ?? null;
  }

  bikeSp(dir: CarDir, look: number, frame: number): Sprite | null {
    const c = ((look % 4) + 4) % 4;
    return this.bikeSprites?.get(`${dir}#${c}#${frame % 2}`) ?? null;
  }

  invalidate(): void { this.dirty = true; }

  setPedTarget(auto: boolean, n: number): void {
    this.pedAuto = auto;
    this.pedManual = Math.max(0, Math.min(ActorSystem.PED_MAX, Math.round(n)));
    this.dirty = true;
  }

  private syncTargets(map: CityMap): void {
    const st = map.stats();
    const nightK = 0.30 + 0.70 * this.dayness;       // 行人夜间回落至 0.3
    const carK = 0.45 + 0.55 * this.dayness;         // 车辆夜间回落至 0.45
    if (this.pedAuto) {
      // 经营模式：行人密度随实际人口增长（1 人 ≈ 0.33 名路人，直观反馈城市脉动）
      // v8 修复「荒地开局行人消失」：人口 0-8 时保底 3 名拓荒者（需先修路才会出现）
      // 沙盒模式：按建筑容量自适应
      const base = this.popNow !== null
        ? Math.max(3, Math.floor(this.popNow / 3))
        : Math.max(10, Math.min(ActorSystem.PED_AUTO_MAX, 10 + Math.floor(st.pop / 60)));
      this.targetP = base <= 0 ? 0 : Math.max(4, Math.round(base * nightK));
    } else {
      this.targetP = this.pedManual;   // 手动模式：尊重用户设定，不随夜色缩放
    }
    this.targetC = Math.max(2, Math.round(Math.max(4, Math.min(ActorSystem.CAR_MAX, Math.floor(st.roads / 55))) * carK));
    this.targetPet = Math.min(ActorSystem.PET_MAX, Math.round(this.targetP * 0.16));
    this.targetBird = Math.max(0, Math.min(ActorSystem.BIRD_MAX,
      Math.round(this.targetP * 0.055 * (0.35 + 0.65 * this.dayness))));   // 鸽群夜间归巢
    // ---- v7 公交 / 航运 ----
    this.scanTransit(map);
    // 巴士：≥2 座连通车站才开通环线（2-3 站 1 辆 / 4-5 站 2 辆 / 6+ 站 3 辆）
    this.targetBus = this.stopTiles.length >= 2
      ? Math.min(ActorSystem.BUS_MAX, 1 + ((this.stopTiles.length - 2) >> 1)) : 0;
    // v11 电车：≥2 座连通车站开通干线（2-5 站 1 列 / 6+ 站 2 列）
    this.targetTram = this.tramTiles.length >= 2
      ? Math.min(ActorSystem.TRAM_MAX, 1 + ((this.tramTiles.length - 2) >> 2)) : 0;
    // 船舶：渡轮码头逐座出船（冬季冰封停航）
    this.targetBoat = this.winterIce
      ? 0
      : Math.min(ActorSystem.BOAT_MAX, this.ferryDocks.length);
    // v10 游客：游客人数 /6 名出街漫步（夜间回酒店，白天观光）
    this.targetTourist = this.attractTiles.length
      ? Math.max(0, Math.min(ActorSystem.TOURIST_MAX,
          Math.round(this.touristsNow / 6 * (0.2 + 0.8 * this.dayness))))
      : 0;
    this.dirty = false;
  }

  /** v7 扫描公交车站（邻接道路格）与渡轮码头（邻接水面格） */
  private scanTransit(map: CityMap): void {
    this.stopTiles = [];
    this.tramTiles = [];
    this.ferryDocks = [];
    this.attractTiles = [];
    for (const o of map.objs.values()) {
      const d = defById(o.id);
      // v10 景点：吸引力建筑的邻接/近旁道路格（游客出生点）
      if (ATTRACT[o.id] && ATTRACT[o.id] >= 2) {
        const cx = o.ax + (d.w >> 1), cy = o.ay + (d.h >> 1);
        outer:
        for (const ring of [1, 2, 3]) {
          for (let dy = -ring; dy <= d.h + ring - 1; dy++) {
            for (let dx = -ring; dx <= d.w + ring - 1; dx++) {
              const ox = dx < 0 ? -dx : (dx >= d.w ? dx - d.w + 1 : 0);
              const oy = dy < 0 ? -dy : (dy >= d.h ? dy - d.h + 1 : 0);
              if (Math.max(ox, oy) !== ring) continue;
              const nx = o.ax + dx, ny = o.ay + dy;
              if (!map.inB(nx, ny)) continue;
              if (map.road[map.idx(nx, ny)]) {
                this.attractTiles.push([nx, ny]);
                break outer;
              }
            }
          }
        }
        void cx; void cy;
      }
      if (o.id === 'busstop' || o.id === 'tramstop') {
        // 车站 1×1：四向找邻接道路格（v11 电车站与巴士站同法）
        for (const [dx, dy] of DIRS) {
          const nx = o.ax + dx, ny = o.ay + dy;
          if (map.inB(nx, ny) && map.road[map.idx(nx, ny)]) {
            if (o.id === 'tramstop') this.tramTiles.push([nx, ny]);
            else this.stopTiles.push([nx, ny]);
            break;
          }
        }
      } else if (o.id === 'ferry') {
        // 码头 2×2：足迹外 1-2 环内找最近水面泊位（生成器常把码头放在离岸一格处，兼容玩家自摆）
        let dock: [number, number] | null = null;
        for (const ring of [1, 2]) {
          for (let dy = -ring; dy <= d.h + ring - 1; dy++) {
            for (let dx = -ring; dx <= d.w + ring - 1; dx++) {
              const ox = dx < 0 ? -dx : (dx >= d.w ? dx - d.w + 1 : 0);   // 足迹外 x 向距离
              const oy = dy < 0 ? -dy : (dy >= d.h ? dy - d.h + 1 : 0);   // 足迹外 y 向距离
              if (Math.max(ox, oy) !== ring) continue;                    // 只看第 ring 环
              const nx = o.ax + dx, ny = o.ay + dy;
              if (!map.inB(nx, ny)) continue;
              const i = map.idx(nx, ny);
              if (map.terr[i] === 1 && !map.road[i] && map.occ[i] < 0) {
                dock = [nx, ny];
                break;
              }
            }
            if (dock) break;
          }
          if (dock) break;
        }
        if (dock) this.ferryDocks.push(dock);
      }
    }
  }

  private randomRoad(map: CityMap): [number, number] | null {
    // 从真实道路格列表均匀抽取（支持极小路网：经营开局仅数格路也能出生）
    const list = map.roadList();
    if (!list.length) return null;
    const i = list[(Math.random() * list.length) | 0];
    return [i % map.n, (i / map.n) | 0];
  }

  private spawn(map: CityMap, kind: 0 | 1): void {
    // v7 骑行者：行人池中约 8% 蹬车出行（更快、走得更远）
    if (kind === 0 && Math.random() < 0.08) { this.spawnBike(map); return; }
    const spot = this.randomRoad(map);
    if (!spot) return;
    const [x, y] = spot;
    let d: [number, number] | null = null;
    const opts = DIRS.filter(([dx, dy]) =>
      map.inB(x + dx, y + dy) && map.road[map.idx(x + dx, y + dy)]);
    if (opts.length) d = opts[Math.floor(Math.random() * opts.length)];
    else return;
    const look = Math.floor(Math.random() * LOOK_N);
    let role: Role = 0;
    let body: Body = 0;
    let speed: number;
    if (kind === 1) {
      speed = 2.0 + Math.random() * 0.9;
    } else {
      // 职业分布：40% 市民 / 8% 警 / 7% 邮 / 11% 学生 / 5% 厨 / 8% 跑 /
      //           5% 医生 / 4% 消防员 / 5% 环卫工 / 7% 游客
      const rr = Math.random();
      if (rr < 0.08) { role = 1; body = 0; speed = 0.72 + Math.random() * 0.2; }        // 警察巡弋
      else if (rr < 0.15) { role = 2; body = 0; speed = 0.95 + Math.random() * 0.22; }  // 邮递员赶路
      else if (rr < 0.26) { role = 3; body = 1; speed = 0.78 + Math.random() * 0.3; }   // 学生结伴上学
      else if (rr < 0.31) { role = 4; body = 0; speed = 0.5 + Math.random() * 0.2; }    // 主厨踱步
      else if (rr < 0.39) { role = 5; body = 0; speed = 1.3 + Math.random() * 0.35; }  // 慢跑者
      else if (rr < 0.44) { role = 6; body = 0; speed = 0.62 + Math.random() * 0.18; }  // 医生巡诊
      else if (rr < 0.48) { role = 7; body = 0; speed = 0.72 + Math.random() * 0.25; }  // 消防员巡查
      else if (rr < 0.53) { role = 8; body = 0; speed = 0.48 + Math.random() * 0.18; }  // 环卫工慢扫
      else if (rr < 0.60) { role = 9; body = 0; speed = 0.46 + Math.random() * 0.2; }   // 游客闲逛
      else {
        const bb = Math.random();
        body = bb < 0.70 ? 0 : bb < 0.88 ? 1 : 2;
        speed = body === 2 ? 0.35 + Math.random() * 0.18
          : body === 1 ? 0.78 + Math.random() * 0.32
          : 0.55 + Math.random() * 0.4;
      }
    }
    const a: Actor = {
      kind, fx: x, fy: y, dx: d[0], dy: d[1], t: Math.random() * 0.2,
      speed, look, body, role, phase: Math.random() * 1000,
      offX: kind === 0 ? (Math.random() - 0.5) * 5 : 0,
      offY: kind === 0 ? (Math.random() - 0.5) * 5 : 0,
      path: null, wait: Math.random() * 0.6, master: null, gone: false,
    };
    this.newTrip(map, a);
    this.actors.push(a);
    if (kind === 0) {
      this.peds++;
      // 结伴出行（情侣/朋友）：同路径并排走，速度一致
      if (role === 0 && body !== 2 && a.path && a.path.length > 6 && Math.random() < 0.14) {
        const b: Actor = {
          ...a,
          look: Math.floor(Math.random() * LOOK_N),
          body: body === 1 ? 1 : 0,
          speed: a.speed,
          t: Math.max(0, a.t - 0.12),
          offX: a.offX + a.dy * 3.4,
          offY: a.offY - a.dx * 3.4,
          path: a.path.slice(),
          phase: Math.random() * 1000,
          master: null, gone: false,
        };
        this.actors.push(b);
        this.peds++;
      }
      // 遛狗：普通市民携犬出行（狗不计入行人目标，跟随主人）
      if (role === 0 && body !== 2 && Math.random() < 0.15) {
        this.spawnDogAt(map, a);
      }
    } else {
      this.cars++;
    }
  }

  /** v7 骑行者出生：随机路格上路，长途骑行（BFS 远距离行程） */
  private spawnBike(map: CityMap): void {
    const spot = this.randomRoad(map);
    if (!spot) return;
    const [x, y] = spot;
    const opts = DIRS.filter(([dx, dy]) =>
      map.inB(x + dx, y + dy) && map.road[map.idx(x + dx, y + dy)]);
    if (!opts.length) return;
    const d = opts[Math.floor(Math.random() * opts.length)];
    const a: Actor = {
      kind: 7, fx: x, fy: y, dx: d[0], dy: d[1], t: Math.random() * 0.2,
      speed: 1.5 + Math.random() * 0.35,
      look: Math.floor(Math.random() * 4), body: 0, role: 0,
      phase: Math.random() * 1000,
      offX: 0, offY: 0, path: null, wait: Math.random() * 0.4, master: null, gone: false,
    };
    this.newTrip(map, a);
    this.actors.push(a);
    this.peds++;
  }

  /** 流浪宠物（无主人）：猫为主，少量流浪狗 */
  private spawnPet(map: CityMap): void {
    const kind: 2 | 3 = Math.random() < 0.6 ? 3 : 2;
    const spot = this.randomRoad(map);
    if (!spot) return;
    const [x, y] = spot;
    const opts = DIRS.filter(([dx, dy]) =>
      map.inB(x + dx, y + dy) && map.road[map.idx(x + dx, y + dy)]);
    if (!opts.length) return;
    const d = opts[Math.floor(Math.random() * opts.length)];
    const a: Actor = {
      kind, fx: x, fy: y, dx: d[0], dy: d[1], t: 0,
      speed: kind === 2 ? 0.85 + Math.random() * 0.25 : 0.3 + Math.random() * 0.18,
      look: Math.floor(Math.random() * 4), body: 0, role: 0,
      phase: Math.random() * 1000,
      offX: (Math.random() - 0.5) * 4, offY: (Math.random() - 0.5) * 4,
      path: null, wait: Math.random() * 0.8, master: null, gone: false,
    };
    this.actors.push(a);
    this.pets++;
  }

  /** 鸽群：在道路/广场周围成群生成（3-6 只），以出生点为活动中心 */
  private spawnFlock(map: CityMap): void {
    const spot = this.randomRoad(map);
    if (!spot) return;
    const n = 3 + Math.floor(Math.random() * 4);
    for (let k = 0; k < n && this.birds < ActorSystem.BIRD_MAX; k++) {
      const x = spot[0] + Math.floor(Math.random() * 3) - 1;
      const y = spot[1] + Math.floor(Math.random() * 3) - 1;
      if (!map.inB(x, y) || !map.road[map.idx(x, y)]) continue;
      const opts = DIRS.filter(([dx, dy]) =>
        map.inB(x + dx, y + dy) && map.road[map.idx(x + dx, y + dy)]);
      if (!opts.length) continue;
      const d = opts[Math.floor(Math.random() * opts.length)];
      this.actors.push({
        kind: 4, fx: x, fy: y, dx: d[0], dy: d[1], t: Math.random() * 0.5,
        speed: 0.3 + Math.random() * 0.16, look: Math.floor(Math.random() * 2),
        body: 0, role: 0, phase: Math.random() * 1000,
        offX: (Math.random() - 0.5) * 9, offY: (Math.random() - 0.5) * 9,
        path: null, wait: Math.random() * 1.2, master: null, gone: false,
        home: [spot[0], spot[1]], flee: 0, thx: 0, thy: 0,
      });
      this.birds++;
    }
  }

  /** 遛狗：在主人身后一格生成，追主人的行进方向 */
  private spawnDogAt(map: CityMap, master: Actor): void {
    const bx = master.fx - master.dx, by = master.fy - master.dy;
    const fx = map.inB(bx, by) && map.road[map.idx(bx, by)] ? bx : master.fx;
    const fy = map.inB(bx, by) && map.road[map.idx(bx, by)] ? by : master.fy;
    const a: Actor = {
      kind: 2, fx, fy, dx: master.dx, dy: master.dy, t: 0,
      speed: master.speed + 0.15 + Math.random() * 0.2,
      look: Math.floor(Math.random() * 4), body: 0, role: 0,
      phase: Math.random() * 1000,
      offX: master.offX - master.dx * 4 + (Math.random() - 0.5) * 2,
      offY: master.offY - master.dy * 4 + (Math.random() - 0.5) * 2,
      path: null, wait: 0, master, gone: false,
    };
    this.actors.push(a);
    this.pets++;
  }

  /** 给角色安排一次出行（BFS 路径；失败则退化为加权随机漫步）。返回本次路径 */
  private newTrip(map: CityMap, a: Actor): Array<[number, number]> | null {
    if (a.kind === 5) return this.busTrip(map, a);
    if (a.kind === 8) return this.tramTrip(map, a);
    if (a.kind === 6) return findWaterPath(map, a.fx, a.fy, 14, 64);
    if (a.kind === 7) return findPath(map, a.fx, a.fy, 20, 96);
    const path = a.kind === 1
      ? findPath(map, a.fx, a.fy, 30, 150)
      : a.tour
        ? findPath(map, a.fx, a.fy, 3, 16)      // v10 游客：景点周边短途观光
        : findPath(map, a.fx, a.fy, 16, 72);
    a.path = path;
    return path;
  }

  /** v7 巴士行程：开往下一座车站（与当前不同站；路网不连通时随机兜底） */
  private busTrip(map: CityMap, a: Actor): Array<[number, number]> | null {
    if (this.stopTiles.length >= 2) {
      // 挑选与当前位置不同且距离 ≥4 格的车站作为下一站
      const cands = this.stopTiles
        .filter(s => Math.abs(s[0] - a.fx) + Math.abs(s[1] - a.fy) >= 4)
        .sort(() => Math.random() - 0.5);
      for (const s of cands) {
        const p = bfsRoad(map, a.fx, a.fy, s);
        if (p && p.length) { a.path = p; return p; }
      }
    }
    const p = findPath(map, a.fx, a.fy, 24, 120);   // 兜底：普通路网行程
    a.path = p;
    return p;
  }

  /** v7 巴士出生：随机车站旁的路格发车 */
  private spawnBus(map: CityMap): void {
    if (this.stopTiles.length < 2) return;
    const spot = this.stopTiles[Math.floor(Math.random() * this.stopTiles.length)];
    const [x, y] = spot;
    const opts = DIRS.filter(([dx, dy]) =>
      map.inB(x + dx, y + dy) && map.road[map.idx(x + dx, y + dy)]);
    if (!opts.length) return;
    const d = opts[Math.floor(Math.random() * opts.length)];
    const a: Actor = {
      kind: 5, fx: x, fy: y, dx: d[0], dy: d[1], t: 0,
      speed: 1.25 + Math.random() * 0.3,
      look: Math.random() < 0.5 ? 0 : 1,          // 涂装：市区线 / 郊区线
      body: 0, role: 0, phase: Math.random() * 1000,
      offX: 0, offY: 0, path: null, wait: 0.4, master: null, gone: false,
    };
    this.busTrip(map, a);
    this.actors.push(a);
    this.buses++;
  }

  /** v11 电车行程：开往下一座电车站（站距 ≥6 格的干线区间） */
  private tramTrip(map: CityMap, a: Actor): Array<[number, number]> | null {
    if (this.tramTiles.length >= 2) {
      const cands = this.tramTiles
        .filter(s => Math.abs(s[0] - a.fx) + Math.abs(s[1] - a.fy) >= 6)
        .sort(() => Math.random() - 0.5);
      for (const s of cands) {
        const p = bfsRoad(map, a.fx, a.fy, s);
        if (p && p.length) { a.path = p; return p; }
      }
    }
    const p = findPath(map, a.fx, a.fy, 24, 120);   // 兜底：普通路网行程
    a.path = p;
    return p;
  }

  /** v11 电车出生：电车站旁路格发车（翡翠绿干线 / 酒红观光线） */
  private spawnTram(map: CityMap): void {
    if (this.tramTiles.length < 2) return;
    const spot = this.tramTiles[Math.floor(Math.random() * this.tramTiles.length)];
    const [x, y] = spot;
    const opts = DIRS.filter(([dx, dy]) =>
      map.inB(x + dx, y + dy) && map.road[map.idx(x + dx, y + dy)]);
    if (!opts.length) return;
    const d = opts[Math.floor(Math.random() * opts.length)];
    const a: Actor = {
      kind: 8, fx: x, fy: y, dx: d[0], dy: d[1], t: 0,
      speed: 1.05 + Math.random() * 0.25,      // 电车区间速度（略缓于巴士，起步稳）
      look: Math.random() < 0.55 ? 0 : 1,       // 涂装：干线翡翠绿 / 观光酒红
      body: 0, role: 0, phase: Math.random() * 1000,
      offX: 0, offY: 0, path: null, wait: 0.6, master: null, gone: false,
    };
    this.tramTrip(map, a);
    this.actors.push(a);
    this.trams++;
  }

  /** v7 船舶出生：渡轮码头泊位出航（首艘渡轮 / 后续帆船与渔船混编） */
  private spawnBoat(map: CityMap): void {
    if (!this.ferryDocks.length) return;
    const spot = this.ferryDocks[Math.floor(Math.random() * this.ferryDocks.length)];
    const [x, y] = spot;
    const opts = DIRS.filter(([dx, dy]) => {
      const nx = x + dx, ny = y + dy;
      return map.inB(nx, ny) && map.terr[map.idx(nx, ny)] === 1 && !map.road[map.idx(nx, ny)];
    });
    if (!opts.length) return;
    const d = opts[Math.floor(Math.random() * opts.length)];
    const a: Actor = {
      kind: 6, fx: x, fy: y, dx: d[0], dy: d[1], t: 0,
      speed: 0.62 + Math.random() * 0.26,
      look: this.boats === 0 ? 2 : this.boats === 1 ? 1 : 0,   // 渡轮 → 帆船 → 渔船
      body: 0, role: 0, phase: Math.random() * 1000,
      offX: 0, offY: 0, path: null, wait: 0.8, master: null, gone: false,
    };
    const p = findWaterPath(map, a.fx, a.fy, 10, 56);
    a.path = p;
    this.actors.push(a);
    this.boats++;
  }

  /** v10 游客出生：景点旁路格上路，短途观光行程（3-16 格） */
  private spawnTourist(map: CityMap): void {
    if (!this.attractTiles.length) return;
    const spot = this.attractTiles[Math.floor(Math.random() * this.attractTiles.length)];
    const [x, y] = spot;
    const opts = DIRS.filter(([dx, dy]) =>
      map.inB(x + dx, y + dy) && map.road[map.idx(x + dx, y + dy)]);
    if (!opts.length) return;
    const d = opts[Math.floor(Math.random() * opts.length)];
    const a: Actor = {
      kind: 0, fx: x, fy: y, dx: d[0], dy: d[1], t: Math.random() * 0.3,
      speed: 0.42 + Math.random() * 0.2,          // 观光客步速慢
      look: Math.floor(Math.random() * LOOK_N),
      body: Math.random() < 0.82 ? 0 : 1,         // 偶有儿童随行
      role: 9, phase: Math.random() * 1000,
      offX: (Math.random() - 0.5) * 5, offY: (Math.random() - 0.5) * 5,
      path: null, wait: 0.2 + Math.random() * 0.8,
      master: null, gone: false, tour: true,
    };
    this.newTrip(map, a);
    this.actors.push(a);
    this.tourists++;
    // 情侣游客：并肩同游
    if (Math.random() < 0.35) {
      this.actors.push({
        ...a,
        look: Math.floor(Math.random() * LOOK_N),
        t: Math.max(0, a.t - 0.1),
        offX: a.offX + a.dy * 3.4, offY: a.offY - a.dx * 3.4,
        path: a.path ? a.path.slice() : null,
        phase: Math.random() * 1000,
      });
      this.tourists++;
    }
  }

  private roadNeighbors(map: CityMap, x: number, y: number): number {
    let c = 0;
    for (const [dx, dy] of DIRS) {
      if (map.inB(x + dx, y + dy) && map.road[map.idx(x + dx, y + dy)]) c++;
    }
    return c;
  }

  private pickNext(map: CityMap, a: Actor): boolean {
    // —— 鸽子分支（v4）——
    if (a.kind === 4) {
      // 受惊：远离威胁源直线急窜
      if ((a.flee ?? 0) > 0 && a.thx !== undefined) {
        let best: [number, number] | null = null;
        let bd = -1;
        for (const [dx, dy] of DIRS) {
          const nx = a.fx + dx, ny = a.fy + dy;
          if (!map.inB(nx, ny) || !map.road[map.idx(nx, ny)]) continue;
          const sc = Math.abs(nx - a.thx!) + Math.abs(ny - a.thy!);
          if (sc > bd) { bd = sc; best = [dx, dy]; }
        }
        if (best) { a.dx = best[0]; a.dy = best[1]; return true; }
      }
      // 常态：家园附近随性踱步（不掉头）
      const opts: Array<[number, number]> = [];
      for (const [dx, dy] of DIRS) {
        if (dx === -a.dx && dy === -a.dy) continue;
        const nx = a.fx + dx, ny = a.fy + dy;
        if (!map.inB(nx, ny) || !map.road[map.idx(nx, ny)]) continue;
        if (a.home && Math.abs(nx - a.home[0]) + Math.abs(ny - a.home[1]) > 5) continue;
        opts.push([dx, dy]);
      }
      if (!opts.length) {
        if (map.inB(a.fx - a.dx, a.fy - a.dy) && map.road[map.idx(a.fx - a.dx, a.fy - a.dy)]) {
          a.dx = -a.dx; a.dy = -a.dy;
          return true;
        }
        return false;
      }
      const chosen = opts[Math.floor(Math.random() * opts.length)];
      a.dx = chosen[0]; a.dy = chosen[1];
      return true;
    }
    // —— 宠物分支（v3；v11 修复：仅狗/猫，此前 kind>=2 误拦巴士/船舶/骑行者路径）——
    if (a.kind === 2 || a.kind === 3) {
      // 狗：追主人的行进目标格（尽量不掉头）
      if (a.kind === 2 && a.master) {
        if (a.master.gone) a.master = null;
        else {
          const tx = a.master.fx + a.master.dx * 2;
          const ty = a.master.fy + a.master.dy * 2;
          let best: [number, number] | null = null;
          let bd = 1e9;
          for (const [dx, dy] of DIRS) {
            const nx = a.fx + dx, ny = a.fy + dy;
            if (!map.inB(nx, ny) || !map.road[map.idx(nx, ny)]) continue;
            let sc = Math.abs(nx - tx) + Math.abs(ny - ty);
            if (dx === -a.dx && dy === -a.dy) sc += 3;
            if (sc < bd || (sc === bd && Math.random() < 0.4)) { bd = sc; best = [dx, dy]; }
          }
          if (best) { a.dx = best[0]; a.dy = best[1]; return true; }
        }
      }
      // 流浪宠物：随性闲逛（均匀随机，不掉头）
      const opts: Array<[number, number]> = [];
      for (const [dx, dy] of DIRS) {
        if (dx === -a.dx && dy === -a.dy) continue;
        if (!map.inB(a.fx + dx, a.fy + dy)) continue;
        if (!map.road[map.idx(a.fx + dx, a.fy + dy)]) continue;
        opts.push([dx, dy]);
      }
      if (!opts.length) {
        if (map.inB(a.fx - a.dx, a.fy - a.dy) && map.road[map.idx(a.fx - a.dx, a.fy - a.dy)]) {
          a.dx = -a.dx; a.dy = -a.dy;
          return true;
        }
        return false;
      }
      const chosen = opts[Math.floor(Math.random() * opts.length)];
      a.dx = chosen[0]; a.dy = chosen[1];
      return true;
    }
    // —— v7 船舶：水面随性航行兜底（路径耗尽且无新航线时；不掉头、避桥）——
    if (a.kind === 6) {
      const opts: Array<[number, number]> = [];
      for (const [dx, dy] of DIRS) {
        if (dx === -a.dx && dy === -a.dy) continue;
        const nx = a.fx + dx, ny = a.fy + dy;
        if (!map.inB(nx, ny)) continue;
        const i = map.idx(nx, ny);
        if (map.terr[i] !== 1 || map.road[i] || map.occ[i] >= 0) continue;
        opts.push([dx, dy]);
      }
      if (!opts.length) {
        const bi = map.idx(a.fx - a.dx, a.fy - a.dy);
        if (map.inB(a.fx - a.dx, a.fy - a.dy) && map.terr[bi] === 1 && !map.road[bi]) {
          a.dx = -a.dx; a.dy = -a.dy;
          return true;
        }
        return false;
      }
      const chosen = opts[Math.floor(Math.random() * opts.length)];
      a.dx = chosen[0]; a.dy = chosen[1];
      return true;
    }
    // —— 行人 / 车辆原有逻辑 ——
    if (a.path && a.path.length) {
      const nxt = a.path.shift()!;
      a.dx = nxt[0]; a.dy = nxt[1];
      return true;
    }
    // 路走完：到达目的地 → 逗留，再安排新行程
    a.path = null;
    const p2 = this.newTrip(map, a);
    if (p2 && p2.length) {
      const nxt = p2.shift()!;
      a.dx = nxt[0]; a.dy = nxt[1];
      return true;
    }
    // 兜底：加权随机（直行权重 3、尽量不回头）
    const bx = a.fx, by = a.fy;
    const opts: Array<[number, number, number]> = [];
    for (const [dx, dy] of DIRS) {
      if (dx === -a.dx && dy === -a.dy) continue;
      if (!map.inB(bx + dx, by + dy)) continue;
      if (!map.road[map.idx(bx + dx, by + dy)]) continue;
      const w = (dx === a.dx && dy === a.dy) ? 3 : 1;
      opts.push([dx, dy, w]);
    }
    if (!opts.length) {
      if (map.inB(bx - a.dx, by - a.dy) && map.road[map.idx(bx - a.dx, by - a.dy)]) {
        a.dx = -a.dx;
        a.dy = -a.dy;
        return true;
      }
      return false;
    }
    let sum = 0;
    for (const o of opts) sum += o[2];
    let pick = Math.random() * sum;
    let chosen = opts[0];
    for (const o of opts) {
      pick -= o[2];
      if (pick <= 0) { chosen = o; break; }
    }
    a.dx = chosen[0];
    a.dy = chosen[1];
    return true;
  }

  tick(dt: number, map: CityMap): void {
    if (!this.enabled) return;
    if (this.dirty) this.syncTargets(map);
    if (this.actors.length === 0 && (this.targetP > 0 || this.targetC > 0)) this.ensureSprites();

    this.spawnCd -= dt;
    if (this.spawnCd <= 0) {
      this.spawnCd = 0.12;
      const deficitP = this.targetP - this.peds;
      const deficitC = this.targetC - this.cars;
      const deficitPet = this.targetPet - this.pets;
      if (deficitP > 0) {
        for (let k = 0; k < Math.min(5, deficitP); k++) this.spawn(map, 0);
      } else if (deficitP < 0) {
        for (let k = 0; k < Math.min(6, -deficitP); k++) {
          const i = this.actors.findIndex(a => a.kind === 0 && !a.tour);
          if (i < 0) break;
          this.actors[i].gone = true;
          this.actors.splice(i, 1); this.peds--;
        }
      }
      if (deficitC > 0) {
        for (let k = 0; k < Math.min(3, deficitC); k++) this.spawn(map, 1);
      } else if (deficitC < 0) {
        for (let k = 0; k < Math.min(4, -deficitC); k++) {
          const i = this.actors.findIndex(a => a.kind === 1);
          if (i < 0) break;
          this.actors[i].gone = true;
          this.actors.splice(i, 1); this.cars--;
        }
      }
      // 宠物：流浪宠物补减（优先补无主宠物；先裁无主的）
      if (deficitPet > 0) {
        if (Math.random() < 0.55) this.spawnPet(map);
      } else if (deficitPet < 0) {
        for (let k = 0; k < Math.min(3, -deficitPet); k++) {
          const i = this.actors.findIndex(x => x.kind >= 2 && x.kind <= 3 && !x.master);
          if (i < 0) break;
          this.actors[i].gone = true;
          this.actors.splice(i, 1); this.pets--;
        }
      }
      // 鸽群：成群补减
      const deficitBird = this.targetBird - this.birds;
      if (deficitBird > 0) {
        if (Math.random() < 0.22) this.spawnFlock(map);
      } else if (deficitBird < 0) {
        for (let k = 0; k < Math.min(2, -deficitBird); k++) {
          const i = this.actors.findIndex(x => x.kind === 4);
          if (i < 0) break;
          this.actors[i].gone = true;
          this.actors.splice(i, 1); this.birds--;
        }
      }
      // v7 巴士：车站数量驱动发车 / 收车
      const deficitBus = this.targetBus - this.buses;
      if (deficitBus > 0) {
        this.spawnBus(map);
      } else if (deficitBus < 0) {
        const i = this.actors.findIndex(x => x.kind === 5);
        if (i >= 0) { this.actors[i].gone = true; this.actors.splice(i, 1); this.buses--; }
      }
      // v11 电车：电车站数量驱动发车 / 收车
      const deficitTram = this.targetTram - this.trams;
      if (deficitTram > 0) {
        this.spawnTram(map);
      } else if (deficitTram < 0) {
        const i = this.actors.findIndex(x => x.kind === 8);
        if (i >= 0) { this.actors[i].gone = true; this.actors.splice(i, 1); this.trams--; }
      }
      // v7 船舶：码头数量驱动出航 / 归航（冬季冰封全数归航）
      const deficitBoat = this.targetBoat - this.boats;
      if (deficitBoat > 0) {
        if (Math.random() < 0.5) this.spawnBoat(map);
      } else if (deficitBoat < 0) {
        const i = this.actors.findIndex(x => x.kind === 6);
        if (i >= 0) { this.actors[i].gone = true; this.actors.splice(i, 1); this.boats--; }
      }
      // v10 游客：游客人数驱动景点漫步（酒店歇脚，景点打卡）
      const deficitTourist = this.targetTourist - this.tourists;
      if (deficitTourist > 0) {
        if (Math.random() < 0.4) this.spawnTourist(map);
      } else if (deficitTourist < 0) {
        const i = this.actors.findIndex(x => x.tour === true);
        if (i >= 0) { this.actors[i].gone = true; this.actors.splice(i, 1); this.tourists--; }
      }
    }

    for (let i = this.actors.length - 1; i >= 0; i--) {
      const a = this.actors[i];
      if (a.wait > 0) { a.wait -= dt; continue; }
      // 鸽子：受惊倒计时 + 急窜加速
      let spMul = 1;
      if (a.kind === 4 && (a.flee ?? 0) > 0) {
        a.flee = (a.flee ?? 0) - dt;
        spMul = 3.4;
      }
      a.t += a.speed * spMul * dt;
      let stepped = false;
      while (a.t >= 1) {
        a.t -= 1;
        a.fx += a.dx;
        a.fy += a.dy;
        stepped = true;
        // v7 通行判定：船舶走水面（非桥），其余走道路
        let blocked: boolean;
        if (a.kind === 6) {
          const bi = map.idx(a.fx, a.fy);
          blocked = !map.inB(a.fx, a.fy) || map.terr[bi] !== 1 || map.road[bi] !== 0 || map.occ[bi] >= 0;
        } else {
          blocked = !map.inB(a.fx, a.fy) || !map.road[map.idx(a.fx, a.fy)];
        }
        if (blocked) {
          a.gone = true;
          this.removeCount(a);
          this.actors.splice(i, 1);
          stepped = false;
          break;
        }
        if (a.kind === 3 && Math.random() < 0.45) {
          a.wait = 0.8 + Math.random() * 1.8;           // 猫：走走停停（坐姿）
        } else if (a.kind === 2 && a.master && !a.master.gone) {
          const m = a.master;
          const dist = Math.abs(a.fx - (m.fx + m.dx)) + Math.abs(a.fy - (m.fy + m.dy));
          if (dist <= 1 && Math.random() < 0.22) a.wait = 0.4 + Math.random() * 0.8;   // 狗在主人脚边嗅探
        } else if (a.kind === 4) {
          // 鸽子：扫描威胁（附近 2 格行人/车/骑行者）→ 受惊；否则低头啄食
          let threat: Actor | null = null;
          for (const o of this.actors) {
            if (o.kind !== 0 && o.kind !== 1 && o.kind !== 7) continue;
            if (Math.abs(o.fx - a.fx) + Math.abs(o.fy - a.fy) <= 2) { threat = o; break; }
          }
          if (threat) {
            a.flee = 1.6 + Math.random() * 1.2;
            a.thx = threat.fx; a.thy = threat.fy;
          } else if (Math.random() < 0.32) {
            a.wait = 0.5 + Math.random() * 1.4;           // 低头啄食
          }
        } else if (a.kind === 0 && a.role === 8 && Math.random() < 0.30) {
          a.wait = 1.0 + Math.random() * 1.6;             // 环卫工：驻足清扫
        }
        // 到达路口：偶尔停一停（儿童不停，长者停更久；游客驻足拍照更久）
        const nb = this.roadNeighbors(map, a.fx, a.fy);
        if (nb >= 3 && a.kind === 0 && Math.random() < (a.body === 2 ? 0.22 : 0.12)) {
          a.wait = a.body === 2 ? 0.5 + Math.random() * 1.2 : 0.3 + Math.random() * 0.6;
        }
        if (nb >= 3 && a.kind === 0 && a.role === 9 && Math.random() < 0.35) {
          a.wait = 1.2 + Math.random() * 2.0;             // 游客：举起相机取景
        }
        if (!this.pickNext(map, a)) {
          a.gone = true;
          this.removeCount(a);
          this.actors.splice(i, 1);
          stepped = false;
          break;
        }
        // 路径走完：目的地逗留（行人/车辆/巴士/船舶/骑行者）
        if ((a.kind <= 1 || a.kind >= 5) && (!a.path || a.path.length === 0)) {
          if (a.kind === 0) a.wait = 0.4 + Math.random() * (a.body === 1 ? 1.2 : 2.2);
          else if (a.kind === 5) a.wait = 2.2 + Math.random() * 1.8;   // v7 巴士到站：上下客
          else if (a.kind === 8) a.wait = 2.6 + Math.random() * 2.2;   // v11 电车到站：乘客上下（低地板稍慢）
          else if (a.kind === 6) a.wait = 0.8 + Math.random() * 1.6;   // v7 船只：锚泊瞭望
          else if (a.kind === 7) a.wait = 0.15 + Math.random() * 0.4;  // v7 骑行者：路口减速
          else a.wait = 0.1 + Math.random() * 0.35;
        }
      }
      void stepped;
    }
  }

  /** 计数器回退（移除角色时） */
  private removeCount(a: Actor): void {
    if (a.kind === 0 && a.tour) { this.tourists--; return; }
    if (a.kind === 0 || a.kind === 7) this.peds--;
    else if (a.kind === 1) this.cars--;
    else if (a.kind === 4) this.birds--;
    else if (a.kind === 5) this.buses--;
    else if (a.kind === 8) this.trams--;
    else if (a.kind === 6) this.boats--;
    else this.pets--;
  }

  /** 车道偏移（世界 px）：车辆/巴士靠右、骑行者贴路缘、行人/宠物用自身偏移 */
  laneOffset(a: Actor): [number, number] {
    if (a.kind === 5 || a.kind === 8) return [-a.dy * 2.6, a.dx * 2.6];
    if (a.kind === 7) return [-a.dy * 4.6, a.dx * 4.6];
    if (a.kind !== 1) return [a.offX, a.offY];
    return [-a.dy * 2.3, a.dx * 2.3];
  }

  clear(): void {
    for (const a of this.actors) a.gone = true;
    this.actors.length = 0;
    this.peds = 0;
    this.cars = 0;
    this.pets = 0;
    this.birds = 0;
    this.buses = 0;
    this.boats = 0;
    this.trams = 0;
    this.tourists = 0;
    this.dirty = true;
  }

  static dirOf(a: Actor): CarDir | Facing { return DIR_OF(a); }
}

// ------------------------------------------------------------
// 引擎侧灯杆模型（路灯）与夜光晕圈
// ------------------------------------------------------------

export function lampModel(): Model {
  const faces: Face[] = [];
  // 杆
  box(faces, 7.4, 7.4, 8.6, 8.6, 0, 13.5, {
    right: pWall(P.METAL), left: pWall(P.METAL),
  });
  // 悬臂（+Y 侧）
  box(faces, 7.6, 8.4, 8.4, 10.6, 12.4, 13.5, {
    top: pFlatRoof(P.METAL, 2), right: pWall(P.METAL), left: pWall(P.METAL),
  });
  // 灯头（日间黄顶；夜间发光）
  box(faces, 7.0, 10.2, 9.0, 12.2, 11.4, 12.6, {
    top: () => cell(P.YELLOW, 0),
    right: pWall(P.NEONC), left: pWall(P.NEONC),
  });
  return buildModel(faces, 16, 16);
}

/** 夜光晕圈：dither 椭圆光池（暖黄核心 + 外圈） */
export function glowPool(w: number, h: number): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const ctx = cv.getContext('2d')!;
  const img = ctx.createImageData(w, h);
  const u32 = new Uint32Array(img.data.buffer);
  const abgr = (hex: string, a = 255): number => {
    const q = parseInt(hex.slice(1), 16);
    return (a << 24) | ((q & 255) << 16) | (((q >> 8) & 255) << 8) | ((q >> 16) & 255);
  };
  const core = abgr('#F4F2E8'), mid = abgr('#F2D24B');
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const nx = (x - w / 2) / (w / 2 - 1);
      const ny = (y - h / 2) / (h / 2 - 1);
      const d = nx * nx + ny * ny;
      if (d > 1) continue;
      let c = 0;
      if (d < 0.30) c = core;
      else if (d < 0.72) c = mid;
      else if (bayer(x, y, 0.45)) c = mid;   // 外缘抖动
      else continue;
      u32[y * w + x] = c;
    }
  }
  ctx.putImageData(img, 0, 0);
  return cv;
}
