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
import {
  genManor, genResTower, genConvenience, genHotel, genMall, genParking,
  genRefinery, genPower, genChurch, genMuseum, genFireStation,
  genLighthouse, genCastle,
} from './b_extra';
import {
  genMachiya, genDanchi, genIzakaya, genCinema, genMarket,
  genLumber, genSilo, genDock, genBusstop, genClocktower,
  genObservatory, genTorii,
} from './b_more';
import {
  genHiapart, genNagaya, genMinshuku, genElectown, genFerris,
  genBakery, genGas, genFerry, genWindmill, genGreenhouse,
  genBrewery, genPavilion, genAquarium, genCellmast,
} from './b_dusk';

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
  { id: 'manor', name: '别墅府邸', cat: 'res', w: 1, h: 1, variants: 3, pop: 8,
    gen: genManor, desc: '四坡顶大宅，绿篱泳池庭院' },
  { id: 'restower', name: '住宅大厦', cat: 'res', w: 2, h: 2, variants: 2, pop: 300,
    gen: genResTower, desc: '12-16 层塔楼，层层挑阳台' },
  { id: 'machiya', name: '町屋', cat: 'res', w: 1, h: 1, variants: 3, pop: 12,
    gen: genMachiya, desc: '木格榻榻米町家，檐下灯笼' },
  { id: 'danchi', name: '住宅小区', cat: 'res', w: 2, h: 2, variants: 2, pop: 260,
    gen: genDanchi, desc: '两栋板楼合围中央庭院' },
  { id: 'hiapart', name: '高层公寓', cat: 'res', w: 2, h: 2, variants: 2, pop: 340,
    gen: genHiapart, desc: '双塔玻璃住宅，入夜窗海亮灯' },
  { id: 'nagaya', name: '长屋', cat: 'res', w: 1, h: 1, variants: 3, pop: 16,
    gen: genNagaya, desc: '三户联排木长屋，檐下红灯笼' },
  { id: 'minshuku', name: '民宿旅馆', cat: 'res', w: 1, h: 1, variants: 2, pop: 10,
    gen: genMinshuku, desc: '门廊双灯笼与青霓虹招牌' },
  // ---- 商业 ----
  { id: 'shop', name: '沿街商铺', cat: 'com', w: 1, h: 1, variants: 5, pop: 8,
    gen: genShop, desc: '橱窗 + 遮阳棚 + 招牌' },
  { id: 'office', name: '写字楼', cat: 'com', w: 1, h: 1, variants: 5, pop: 65,
    gen: genOffice, desc: '玻璃幕墙，逐层退台' },
  { id: 'tower', name: '摩天大楼', cat: 'com', w: 2, h: 2, variants: 3, pop: 180,
    gen: genTower, desc: '城市天际线主角，带航空灯' },
  { id: 'conv', name: '便利店', cat: 'com', w: 1, h: 1, variants: 4, pop: 4,
    gen: genConvenience, desc: '通宵营业，橱窗明亮' },
  { id: 'hotel', name: '酒店', cat: 'com', w: 2, h: 2, variants: 2, pop: 150,
    gen: genHotel, desc: '玻璃塔楼与楼顶招牌' },
  { id: 'mall', name: '购物中心', cat: 'com', w: 2, h: 2, variants: 2, pop: 220,
    gen: genMall, desc: '大跨度卖场，玻璃中庭' },
  { id: 'parking', name: '停车场', cat: 'com', w: 1, h: 1, variants: 3, pop: 0,
    gen: genParking, ground: 'parking', desc: '划线车位，随机停着小车' },
  { id: 'izakaya', name: '居酒屋', cat: 'com', w: 1, h: 1, variants: 3, pop: 10,
    gen: genIzakaya, desc: '红灯笼与霓虹招牌，深夜食堂' },
  { id: 'cinema', name: '电影院', cat: 'com', w: 2, h: 2, variants: 1, pop: 40,
    gen: genCinema, desc: '灯泡跑马廊与立式招牌塔' },
  { id: 'market', name: '屋台小吃街', cat: 'com', w: 1, h: 1, variants: 3, pop: 6,
    gen: genMarket, desc: '大遮阳棚下的烟火气，热气腾腾' },
  { id: 'electown', name: '电器街', cat: 'com', w: 1, h: 1, variants: 2, pop: 12,
    gen: genElectown, desc: '层叠霓虹招牌的数码商店' },
  { id: 'ferris', name: '摩天轮', cat: 'com', w: 2, h: 2, variants: 1, pop: 0,
    gen: genFerris, desc: '青霓虹轮缘，夜晚点亮天际' },
  { id: 'bakery', name: '烘焙坊', cat: 'com', w: 1, h: 1, variants: 2, pop: 8,
    gen: genBakery, desc: '暖光橱窗与条纹雨棚' },
  { id: 'gas', name: '加油站', cat: 'com', w: 1, h: 1, variants: 2, pop: 6,
    gen: genGas, desc: '红条雨棚下双泵与价目牌' },
  { id: 'ferry', name: '渡轮码头', cat: 'com', w: 2, h: 2, variants: 1, pop: 20,
    gen: genFerry, ground: 'parking', desc: '栈桥候船楼与靠泊渡轮' },
  // ---- 工业 ----
  { id: 'factory', name: '工厂', cat: 'ind', w: 2, h: 2, variants: 4, pop: 45,
    gen: genFactory, desc: '锯齿屋顶厂房，烟囱冒烟' },
  { id: 'warehouse', name: '仓库', cat: 'ind', w: 2, h: 2, variants: 3, pop: 12,
    gen: genWarehouse, desc: '波纹铁皮大跨度库房' },
  { id: 'tankfarm', name: '储油罐', cat: 'ind', w: 1, h: 1, variants: 3, pop: 6,
    gen: genTankfarm, desc: '双罐 + 输油管道' },
  { id: 'refinery', name: '炼油厂', cat: 'ind', w: 2, h: 2, variants: 2, pop: 80,
    gen: genRefinery, desc: '精馏塔林立，火炬长明' },
  { id: 'power', name: '火电厂', cat: 'ind', w: 2, h: 2, variants: 2, pop: 100,
    gen: genPower, desc: '双曲线冷却塔冒白汽' },
  { id: 'lumber', name: '木材厂', cat: 'ind', w: 2, h: 2, variants: 2, pop: 20,
    gen: genLumber, desc: '敞棚锯房，原木垛成金字塔' },
  { id: 'silo', name: '筒仓', cat: 'ind', w: 1, h: 1, variants: 2, pop: 8,
    gen: genSilo, desc: '金属筒仓群与天桥连管' },
  { id: 'windmill', name: '风车磨坊', cat: 'ind', w: 1, h: 1, variants: 2, pop: 4,
    gen: genWindmill, desc: '石塔红帽，四叶迎风' },
  { id: 'greenhouse', name: '温室大棚', cat: 'ind', w: 1, h: 1, variants: 2, pop: 6,
    gen: genGreenhouse, desc: '玻璃大棚，夜间亮起植物灯' },
  { id: 'brewery', name: '酿造厂', cat: 'ind', w: 1, h: 1, variants: 2, pop: 15,
    gen: genBrewery, desc: '铜釜蒸汽，麦香四溢' },
  { id: 'dock', name: '港口吊机', cat: 'ind', w: 2, h: 2, variants: 1, pop: 30,
    gen: genDock, ground: 'parking', desc: '集装箱阵与黄色龙门吊' },
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
  { id: 'church', name: '教堂', cat: 'civ', w: 1, h: 1, variants: 2, pop: 10,
    gen: genChurch, desc: '尖塔钟楼与十字，彩窗长明' },
  { id: 'museum', name: '博物馆', cat: 'civ', w: 2, h: 2, variants: 1, pop: 30,
    gen: genMuseum, ground: 'plaza', desc: '石柱回廊与青绿穹顶' },
  { id: 'firestation', name: '消防局', cat: 'civ', w: 1, h: 1, variants: 2, pop: 25,
    gen: genFireStation, desc: '红色卷闸门与瞭望塔' },
  { id: 'lighthouse', name: '灯塔', cat: 'civ', w: 1, h: 1, variants: 1, pop: 2,
    gen: genLighthouse, desc: '红白环纹塔身，顶端闪光' },
  { id: 'castle', name: '城堡', cat: 'civ', w: 2, h: 2, variants: 1, pop: 20,
    gen: genCastle, ground: 'temple', desc: '角塔城墙与中央主楼' },
  { id: 'busstop', name: '巴士站', cat: 'civ', w: 1, h: 1, variants: 2, pop: 2,
    gen: genBusstop, desc: '候车亭长椅站牌一应俱全' },
  { id: 'clocktower', name: '钟楼', cat: 'civ', w: 1, h: 1, variants: 1, pop: 4,
    gen: genClocktower, desc: '红砖塔身，双面大钟' },
  { id: 'observatory', name: '天文台', cat: 'civ', w: 2, h: 2, variants: 1, pop: 12,
    gen: genObservatory, desc: '青白穹顶与观测窗缝' },
  { id: 'torii', name: '千本鸟居', cat: 'civ', w: 1, h: 1, variants: 2, pop: 3,
    gen: genTorii, desc: '朱红鸟居层层递进的参道' },
  { id: 'pavilion', name: '凉亭', cat: 'civ', w: 1, h: 1, variants: 2, pop: 0,
    gen: genPavilion, desc: '绿荫中的六柱大顶凉亭' },
  { id: 'aquarium', name: '水族馆', cat: 'civ', w: 2, h: 2, variants: 1, pop: 50,
    gen: genAquarium, desc: '玻璃幕墙主馆与圆穹角塔' },
  { id: 'cellmast', name: '通信基站', cat: 'civ', w: 1, h: 1, variants: 2, pop: 4,
    gen: genCellmast, desc: '格构塔身，红色航标闪烁' },
];

export function defById(id: string): Def {
  return CATALOG.find(d => d.id === id)!;
}

// ------------------------------------------------------------
// 精灵图集
// ------------------------------------------------------------

export type BuildingSprite = {
  sp: Sprite;                       // 主精灵
  spNight: Sprite;                  // 夜光精灵（仅发光像素，与主精灵同锚点）
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
        const spNight = renderModel(res.model, { night: true });
        arr.push({
          sp, spNight,
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
