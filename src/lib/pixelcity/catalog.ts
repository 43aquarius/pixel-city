// ============================================================
// catalog.ts — 建筑目录 + 精灵图集（离线预渲染批处理）
//
// 启动时把全部建筑变体经软光栅化管线批量渲染为透明精灵，
// 并生成目录缩略图；加载过程分块报告进度（复古 NOW LOADING）。
// ============================================================

import { renderModel, thumbSprite, type Sprite } from './softrender';
import type { GroundKind } from './terrain';
import type { BuildResult } from './b_util';
import { smokeFrames, NO_EFFECTS } from './b_util';
import type { V3 } from './geo';
import { genHouse, genTownhouse, genApartment } from './b_res';
import { genShop, genOffice, genTower } from './b_com';
import { genFactory, genWarehouse, genTankfarm } from './b_ind';
import {
  genPark, genTree, genPlaza, genSchool, genHospital,
  genTemple, genStadium, genRadioTower, genMonument,
} from './b_civ';

export type Cat = 'res' | 'com' | 'ind' | 'civ';

export type Def = {
  id: string;
  name: string;
  cat: Cat;
  w: number; h: number;        // 占地（格）
  variants: number;
  pop: number;                 // 折算人口/岗位
  gen: (seed: number) => BuildResult;
  ground?: GroundKind;         // 特殊地面替换
  desc: string;
};

export const CATS: Array<{ key: Cat | 'terr'; name: string }> = [
  { key: 'terr', name: '地形' },
  { key: 'res', name: '住宅' },
  { key: 'com', name: '商业' },
  { key: 'ind', name: '工业' },
  { key: 'civ', name: '公共' },
];

export const CATALOG: Def[] = [
  // ---- 住宅 ----
  { id: 'house', name: '小型住宅', cat: 'res', w: 1, h: 1, variants: 6, pop: 5,
    gen: genHouse, desc: '带坡顶与庭院的独栋小宅' },
  { id: 'townhouse', name: '联排住宅', cat: 'res', w: 1, h: 1, variants: 4, pop: 14,
    gen: genTownhouse, desc: '三层联排，带挑阳台' },
  { id: 'apartment', name: '公寓楼', cat: 'res', w: 1, h: 1, variants: 5, pop: 42,
    gen: genApartment, desc: '4-7 层多层住宅，屋顶水箱' },
  // ---- 商业 ----
  { id: 'shop', name: '沿街商铺', cat: 'com', w: 1, h: 1, variants: 5, pop: 8,
    gen: genShop, desc: '橱窗 + 遮阳棚 + 招牌' },
  { id: 'office', name: '写字楼', cat: 'com', w: 1, h: 1, variants: 5, pop: 65,
    gen: genOffice, desc: '玻璃幕墙，逐层退台' },
  { id: 'tower', name: '摩天大楼', cat: 'com', w: 2, h: 2, variants: 3, pop: 180,
    gen: genTower, desc: '城市天际线主角，带航空灯' },
  // ---- 工业 ----
  { id: 'factory', name: '工厂', cat: 'ind', w: 2, h: 2, variants: 4, pop: 45,
    gen: genFactory, desc: '锯齿屋顶厂房，烟囱冒烟' },
  { id: 'warehouse', name: '仓库', cat: 'ind', w: 2, h: 2, variants: 3, pop: 12,
    gen: genWarehouse, desc: '波纹铁皮大跨度库房' },
  { id: 'tankfarm', name: '储油罐', cat: 'ind', w: 1, h: 1, variants: 3, pop: 6,
    gen: genTankfarm, desc: '双罐 + 输油管道' },
  // ---- 公共 ----
  { id: 'park', name: '街心公园', cat: 'civ', w: 1, h: 1, variants: 3, pop: 0,
    gen: genPark, ground: 'park', desc: '小径、水塘与绿荫' },
  { id: 'plaza', name: '广场喷泉', cat: 'civ', w: 1, h: 1, variants: 1, pop: 0,
    gen: genPlaza, ground: 'plaza', desc: '棋格铺装与八角喷泉' },
  { id: 'school', name: '学校', cat: 'civ', w: 2, h: 2, variants: 1, pop: 60,
    gen: genSchool, ground: 'school', desc: '红瓦双翼校舍与钟塔' },
  { id: 'hospital', name: '医院', cat: 'civ', w: 2, h: 2, variants: 1, pop: 90,
    gen: genHospital, desc: '白色主楼，楼顶红十字' },
  { id: 'temple', name: '神社', cat: 'civ', w: 2, h: 2, variants: 1, pop: 15,
    gen: genTemple, ground: 'temple', desc: '青绿瓦大殿与鸟居' },
  { id: 'stadium', name: '体育场', cat: 'civ', w: 3, h: 3, variants: 1, pop: 120,
    gen: genStadium, ground: 'field', desc: '万人看台与四角灯塔' },
  { id: 'radiotower', name: '电视塔', cat: 'civ', w: 1, h: 1, variants: 1, pop: 0,
    gen: genRadioTower, desc: '格构塔身，顶端红色航标闪烁' },
  { id: 'monument', name: '纪念碑', cat: 'civ', w: 1, h: 1, variants: 1, pop: 0,
    gen: genMonument, desc: '石砌方尖碑，城市原点' },
];

export function defById(id: string): Def {
  return CATALOG.find(d => d.id === id)!;
}

// ------------------------------------------------------------
// 精灵图集
// ------------------------------------------------------------

export type BuildingSprite = {
  sp: Sprite;                       // 主精灵
  thumb: HTMLCanvasElement;         // 目录缩略图
  smokeAt?: V3;                     // 烟囱口（局部坐标）
  blinkAt?: V3;                     // 闪烁灯（局部坐标）
};

const THUMB = 44;

export class SpriteBook {
  buildings = new Map<string, BuildingSprite[]>();
  smoke: Sprite[] = [];

  get(defId: string, variant: number): BuildingSprite {
    const arr = this.buildings.get(defId)!;
    return arr[variant % arr.length];
  }

  /** 分块预渲染全部变体（带进度回调） */
  async init(onProgress: (frac: number, label: string) => void): Promise<void> {
    const sleep = () => new Promise<void>(r => setTimeout(r, 16));
    let done = 0;
    const total = CATALOG.reduce((s, d) => s + d.variants, 0) + 2;

    // 烟雾帧
    this.smoke = smokeFrames().map(m => renderModel(m, NO_EFFECTS));
    done += 1;
    onProgress(done / total, '烟雾粒子');
    await sleep();

    for (const d of CATALOG) {
      const arr: BuildingSprite[] = [];
      for (let v = 0; v < d.variants; v++) {
        const seed = (v + 1) * 1013904223 + d.id.length * 69069 + v * 17;
        const res = d.gen(seed);
        const sp = renderModel(res.model);
        arr.push({
          sp,
          thumb: thumbSprite(sp, THUMB),
          smokeAt: res.smokeAt,
          blinkAt: res.blinkAt,
        });
        done += 1;
        onProgress(done / total, d.name);
        // 每若干个让出主线程，保持加载动画流畅
        if (done % 3 === 0) await sleep();
      }
      this.buildings.set(d.id, arr);
    }
    onProgress(1, '完成');
  }

  /** 导出整本精灵图集 PNG（dataURL） */
  exportAtlas(): string {
    const cols = 6;
    const cw = 120, ch = 150;
    const list: Array<{ def: Def; v: number; sp: Sprite }> = [];
    for (const d of CATALOG) {
      for (let v = 0; v < d.variants; v++) {
        list.push({ def: d, v, sp: this.get(d.id, v).sp });
      }
    }
    const rows = Math.ceil(list.length / cols);
    const cv = document.createElement('canvas');
    cv.width = cols * cw; cv.height = rows * ch + 24;
    const ctx = cv.getContext('2d')!;
    ctx.fillStyle = '#10162E';
    ctx.fillRect(0, 0, cv.width, cv.height);
    // 棋盘底纹
    ctx.fillStyle = '#0B0F24';
    for (let y = 0; y < cv.height; y += 12) {
      for (let x = ((y / 12) % 2) * 12; x < cv.width; x += 24) ctx.fillRect(x, y, 12, 12);
    }
    ctx.font = '10px monospace';
    list.forEach((it, i) => {
      const cx = (i % cols) * cw, cy = Math.floor(i / cols) * ch + 24;
      const sp = it.sp;
      // 网格框
      ctx.strokeStyle = '#2A3352';
      ctx.strokeRect(cx + 0.5, cy + 0.5, cw - 1, ch - 1);
      const bx = cx + (cw - sp.w) / 2;
      const by = cy + ch - 18 - sp.h + Math.min(0, 0);
      ctx.drawImage(sp.cv, Math.round(bx), Math.round(cy + ch - 18 - sp.h));
      ctx.fillStyle = '#9FB0C0';
      ctx.fillText(`${it.def.id}#${it.v}`, cx + 5, cy + ch - 6);
    });
    ctx.fillStyle = '#F4F2E8';
    ctx.fillText('PIXEL CITY · SPRITE ATLAS · 离线预渲染管线输出', 8, 16);
    return cv.toDataURL('image/png');
  }
}
