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
import { genFactory, genWarehouse, genTankfarm, genWindfarm, genSolarfarm } from './b_ind';
import {
  genPark, genTree, genPlaza, genSchool, genHospital,
  genTemple, genStadium, genRadioTower, genMonument, genCityhall, genLibrary,
  genEcotower, genSubstation, genPrimary, genUniversity,
} from './b_civ';
import {
  genManor, genResTower, genConvenience, genHotel, genMall, genParking,
  genRefinery, genPower, genChurch, genMuseum, genFireStation, genKoban,
  genLighthouse, genCastle, genPoliceHQ, genHydrant, genClinic, genHealthst,
  genPress, genHall, genMetrostop, genMetrodepot, genAirport,
} from './b_extra';
import {
  genMachiya, genDanchi, genIzakaya, genCinema, genMarket,
  genLumber, genSilo, genDock, genBusstop, genClocktower,
  genObservatory, genTorii, genTramstop, genRailhub,
} from './b_more';
import {
  genHiapart, genNagaya, genMinshuku, genElectown, genFerris,
  genBakery, genGas, genFerry, genWindmill, genGreenhouse,
  genBrewery, genPavilion, genAquarium, genCellmast,
  genOpera, genExpo, genBoardwalk, genMarina, genZoo,
} from './b_dusk';
import { genWatertower, genWaterplant, genLevee } from './b_water';
import { genBinshed, genRecycle, genIncin } from './b_waste';

export type Cat = 'res' | 'com' | 'ind' | 'civ';

export type Def = {
  id: string;
  name: string;
  cat: Cat;
  w: number; h: number;        // 占地（格）
  variants: number;
  pop: number;                 // 折算人口/岗位
  gen: (seed: number, season?: number) => BuildResult;
  ground?: GroundKind;         // 特殊地面替换
  desc: string;
  hidden?: boolean;            // 不出现在建造面板（市政厅等剧情建筑）
  seasonal?: boolean;          // v6：四季变体（树冠随季换色：春樱/夏绿/秋红/冬雪）
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
    gen: genFerry, ground: 'parking', desc: '栈桥候船楼：邻水而建即有渡轮出港巡游（冬季冰封停航）' },
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
  { id: 'windfarm', name: '风力发电场', cat: 'ind', w: 2, h: 2, variants: 2, pop: 8,
    gen: genWindfarm, desc: '荒原三叶风机群：清洁大电源 −60MW 零污染，供电半径 7 格（需研究「电力工程」）' },
  { id: 'solarfarm', name: '太阳能电站', cat: 'ind', w: 2, h: 2, variants: 2, pop: 6,
    gen: genSolarfarm, desc: '3×3 斜面光伏板阵：−50MW 零污染，仅白昼发电（深夜归零），供电半径 7 格（需研究「电力工程」）' },
  { id: 'recycle', name: '回收中心', cat: 'ind', w: 2, h: 2, variants: 2, pop: 35,
    gen: genRecycle, desc: '分拣厂房与打包垛的循环工坊：半径 8 格清运 34 件/分，废品变钱 +4.5G/分 —— 循环经济的核心' },
  { id: 'incin', name: '焚烧发电厂', cat: 'ind', w: 2, h: 2, variants: 2, pop: 45,
    gen: genIncin, desc: '给料斗与余热锅炉：半径 10 格清运 70 件/分，垃圾烧成电 −30MW（供电半径 6）—— 代价是烟囱冒烟（污染 +3）' },
  { id: 'greenhouse', name: '温室大棚', cat: 'ind', w: 1, h: 1, variants: 2, pop: 6,
    gen: genGreenhouse, desc: '玻璃大棚，夜间亮起植物灯' },
  { id: 'brewery', name: '酿造厂', cat: 'ind', w: 1, h: 1, variants: 2, pop: 15,
    gen: genBrewery, desc: '铜釜蒸汽，麦香四溢' },
  { id: 'dock', name: '港口吊机', cat: 'ind', w: 2, h: 2, variants: 1, pop: 30,
    gen: genDock, ground: 'parking', desc: '集装箱阵与黄色龙门吊' },
  { id: 'railhub', name: '铁路货运站', cat: 'ind', w: 2, h: 2, variants: 1, pop: 40,
    gen: genRailhub, desc: '集装箱列车与龙门吊：陆路出口枢纽（无需临水）· 吞吐 4 件/分（需研究「冶金工艺」）' },
  // ---- 公共 ----
  { id: 'park', name: '街心公园', cat: 'civ', w: 1, h: 1, variants: 3, pop: 0,
    gen: genPark, ground: 'park', seasonal: true, desc: '小径、水塘与绿荫（四季换装：春樱秋红冬雪）' },
  { id: 'primary', name: '小学', cat: 'civ', w: 1, h: 1, variants: 2, pop: 12,
    gen: genPrimary, desc: '红砖蒙学塾与旗杆操场：半径 4 格住宅划入学区，孩子出门就是学堂 —— 早期办学的实惠之选' },
  { id: 'university', name: '大学城', cat: 'civ', w: 3, h: 3, variants: 1, pop: 150,
    gen: genUniversity, desc: '拱门主楼与青绿穹顶的智慧殿堂：半径 8 格学区 · 教育 +80 · 科技点 +3/分（需研究「高等教育」）' },
  { id: 'plaza', name: '广场喷泉', cat: 'civ', w: 1, h: 1, variants: 1, pop: 0,
    gen: genPlaza, ground: 'plaza', desc: '棋格铺装与八角喷泉' },
  { id: 'school', name: '学校', cat: 'civ', w: 2, h: 2, variants: 1, pop: 60,
    gen: genSchool, ground: 'school', desc: '红瓦双翼校舍与钟塔：半径 6 格学区 · 教育 +40' },
  { id: 'library', name: '图书馆', cat: 'civ', w: 2, h: 1, variants: 1, pop: 20,
    gen: genLibrary, desc: '廊柱山花的知识殿堂：半径 5 格学区 · 教育 +35 · 科技点 +2/分' },
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
    gen: genFireStation, desc: '红色卷闸门与瞭望塔：火灾损失降至 35%，消防车可出动扑救（需道路连通）' },
  { id: 'hydrant', name: '消防栓', cat: 'civ', w: 1, h: 1, variants: 2, pop: 1,
    gen: genHydrant, desc: '红栓桩与黄警示圈：半径 2 格消防覆盖 —— 消防局的廉价延伸，把街区拐角补进水网（覆盖区起火火势减半）' },
  { id: 'clinic', name: '社区诊所', cat: 'civ', w: 1, h: 1, variants: 2, pop: 6,
    gen: genClinic, desc: '白墙绿十字的街区诊所：半径 3 格医疗覆盖 —— 感冒发烧不必再跨半座城（健康指数 +120 病床 · 早期办医的实惠之选）' },
  { id: 'healthst', name: '防疫站', cat: 'civ', w: 1, h: 1, variants: 2, pop: 8,
    gen: genHealthst, desc: '白十字旗的公共卫生哨所：半径 4 格医疗覆盖 · 疫病蔓延机率 ×0.6（全城消毒网络）· 健康指数 +260 病床' },
  { id: 'koban', name: '交番', cat: 'civ', w: 1, h: 1, variants: 1, pop: 8,
    gen: genKoban, desc: '警务岗亭：巡防半径 3 格 + 安全护盾 +220 人 · 常驻一辆巡逻警车（治安巡逻令再 +1 辆）' },
  { id: 'policehq', name: '警察局', cat: 'civ', w: 2, h: 2, variants: 2, pop: 30,
    gen: genPoliceHQ, desc: '藏青屋顶的治安中枢：巡防半径 6 格（交番仅 3）+ 常驻两辆巡逻警车 + 失窃就近出警追回货款' },
  { id: 'lighthouse', name: '灯塔', cat: 'civ', w: 1, h: 1, variants: 1, pop: 2,
    gen: genLighthouse, desc: '红白环纹塔身，顶端闪光' },
  { id: 'castle', name: '城堡', cat: 'civ', w: 2, h: 2, variants: 1, pop: 20,
    gen: genCastle, ground: 'temple', desc: '角塔城墙与中央主楼' },
  { id: 'busstop', name: '巴士站', cat: 'civ', w: 1, h: 1, variants: 2, pop: 2,
    gen: genBusstop, desc: '候车亭长椅站牌：邻路建两座即开通巴士环线，交通指数 +4/座' },
  { id: 'tramstop', name: '电车站', cat: 'civ', w: 1, h: 1, variants: 2, pop: 2,
    gen: genTramstop, desc: '低月台与受电杆：邻路建两座即开通电车干线，交通 +3/座 · 幸福 +2（需研究「电力工程」）' },
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
  { id: 'watertower', name: '水塔', cat: 'civ', w: 1, h: 1, variants: 2, pop: 4,
    gen: genWatertower, desc: '四腿支架大水柜：小范围供水（半径 9 格 · 供 260 人）' },
  { id: 'waterplant', name: '净水厂', cat: 'civ', w: 2, h: 2, variants: 1, pop: 24,
    gen: genWaterplant, desc: '双沉淀池水厂：大范围供水（半径 20 格 · 供 2200 人）' },
  { id: 'levee', name: '防洪堤', cat: 'civ', w: 1, h: 1, variants: 2, pop: 0,
    gen: genLevee, desc: '三级阶梯混凝土护岸：洪水损失 −15%/座（至多叠 3 座）· 临水城市的安全底牌' },
  { id: 'ecotower', name: '空气净化塔', cat: 'civ', w: 1, h: 1, variants: 2, pop: 4,
    gen: genEcotower, desc: '三层滤网盘的城市之肺：半径 5 格内雾霾大幅削减 —— 工业区的下风向首选' },
  { id: 'substation', name: '变电站', cat: 'civ', w: 1, h: 1, variants: 2, pop: 2,
    gen: genSubstation, desc: '格构钢塔中继：建在任一电源 6 格内＝有效，再向外辐射 6 格供电 —— 新区不必贴着电厂盖楼' },
  { id: 'binshed', name: '垃圾收集站', cat: 'civ', w: 1, h: 1, variants: 2, pop: 3,
    gen: genBinshed, desc: '翻盖垃圾箱排与清运车棚：半径 6 格内建筑垃圾自动清运（14 件/分）—— 超量会堆积，多建几座分担' },
  // ---- v31 都会名片：地标双塔 ----
  { id: 'opera', name: '大剧院', cat: 'civ', w: 3, h: 3, variants: 1, pop: 60,
    gen: genOpera, desc: '金穹顶与柱廊山花的都会名片：半径 6 格商圈商铺收入 +8%（文化街区）· 全市幸福 +2（需「城市名片」）' },
  { id: 'expo', name: '会展中心', cat: 'civ', w: 3, h: 3, variants: 1, pop: 40,
    gen: genExpo, desc: '玻璃拱棚展馆与万国旗广场：节庆历时 +30% · 冷却 −20% · 节庆期游客再 +30%（需「建筑工程学」）' },
  // ---- v32 滨水都市：临水而兴 ----
  { id: 'boardwalk', name: '滨水步道', cat: 'civ', w: 1, h: 1, variants: 2, pop: 0,
    gen: genBoardwalk, desc: '木栈道白栏杆遮阳伞：临水摆放串成水岸风景线，景点吸引力 +1.5/座' },
  { id: 'marina', name: '游船码头', cat: 'civ', w: 2, h: 2, variants: 1, pop: 12,
    gen: genMarina, desc: 'T 字栈桥与双桅游船：码头周围 3 格也算滨水带（水岸氛围外推）· 游客与收入兼得' },
  // ---- v35 百兽之园 ----
  { id: 'zoo', name: '动物园', cat: 'civ', w: 3, h: 3, variants: 2, pop: 30,
    gen: genZoo, desc: '木围栏兽舍与游园小径：动物巡查员定期进园评估，住户逐步入住 —— 每种动物给吸引力/幸福加成，集齐 9 种翻满物种图鉴（需「城市名片」）' },
  // ---- v39 城市之声：报馆 ----
  { id: 'press', name: '报馆', cat: 'civ', w: 2, h: 2, variants: 2, pop: 24,
    gen: genPress, desc: '米白编辑楼与锯齿天窗排字房：落成即创刊《城市日报》，每七日出版一期 —— 头版头条自动选编年史大事，大事出号外；发行量随人口与识字率浮动，卖报所得进府库（需「义务教育」）' },
  // ---- v40 城市之光：名人堂 ----
  { id: 'hall', name: '名人堂', cat: 'civ', w: 2, h: 2, variants: 2, pop: 30,
    gen: genHall, desc: '柱廊主殿鎏金尖顶与双雕像台：落成即开榜，每逢换季整点评出一颗「本季城市之光」—— 八大奖项按城市状态加权授勋，获奖市民心情大振、全城幸福沾光、荣衔永录光荣榜（需「城市名片」）' },
  // ---- v41 轨道时代：地下铁 ----
  { id: 'metrodepot', name: '地铁车辆段', cat: 'civ', w: 3, h: 3, variants: 1, pop: 40,
    gen: genMetrodepot, desc: '锯齿顶车库与调度塔的地下铁中枢：全线网络的锚点 —— 地铁站须沿链接入车辆段（12 格内逐站续链）才能通车；落成记入编年史，施工期路面会拥堵加剧（需「建筑工程学」）' },
  { id: 'metrostop', name: '地铁站', cat: 'civ', w: 2, h: 2, variants: 2, pop: 6,
    gen: genMetrostop, desc: '玻璃雨棚与 M 立柱的地下铁出入口：接入车辆段即通车（两站成线）—— 接入站半径 5 格通勤圈商铺收入 +6%、住宅幸福 +1.2/栋，每接入站交通 +5（至多 +20）；孤立车站只是摆设' },
  { id: 'airport', name: '空港航站楼', cat: 'civ', w: 3, h: 3, variants: 2, pop: 55,
    gen: genAirport, desc: '玻璃幕墙航站楼与八角塔台的对外门户：落成即开邻省都会线 —— 半径 7 格空港商圈商铺收入 +8%、游客 ×1.12 起、空运出口 +3 件/分、交通 +8；但半径 4 格起降航线正下方的住宅要忍受噪音（幸福 −0.8/栋，至多 −5）—— 商圈要近、噪音要远，选址是一道权衡题（需「建筑工程学」）' },
  // ---- 剧情（经营模式专属，不可直接建造）----
  { id: 'cityhall', name: '市政厅', cat: 'civ', w: 2, h: 2, variants: 1, pop: 0,
    gen: genCityhall, hidden: true, desc: '城市的心脏：金顶钟塔与旗帜' },
];

export function defById(id: string): Def {
  return CATALOG.find(d => d.id === id)!;
}

/** v10 旅游系统：景点吸引力分（tycoon 旅游人数 / actors 游客漫步共用）
 *  数值 = 景点档位：5 地标级 / 4 大型 / 3 中型 / 2 小型 / 1 点缀 / 0.5 市井 */
export const ATTRACT: Record<string, number> = {
  ferris: 5, aquarium: 5, castle: 5, opera: 5,
  zoo: 5,   // v35 动物园基础吸引力（住户加成另计：zooBonusOf）
  press: 2, // v39 报馆：城中有了自己的声音，远客也愿来看看
  hall: 3,  // v40 名人堂：荣誉殿堂是中型景点（瞻仰授勋大典）
  museum: 4, stadium: 4, expo: 4,
  temple: 3, observatory: 3, marina: 3,
  church: 2, monument: 2, lighthouse: 2, torii: 2,
  cinema: 1.5, clocktower: 1, boardwalk: 1.5,
  park: 0.5, plaza: 0.5, pavilion: 0.5, market: 0.5,
};

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
  /** v6 四季变体（park 等带树建筑）：[defId][variant][season] */
  seasonals = new Map<string, BuildingSprite[][]>();

  get(defId: string, variant: number): BuildingSprite {
    const arr = this.buildings.get(defId)!;
    return arr[variant % arr.length];
  }

  /** v6：按季节取精灵（非四季建筑回退主图集） */
  getSeasonal(defId: string, variant: number, season: number): BuildingSprite {
    const arr = this.seasonals.get(defId);
    if (!arr) return this.get(defId, variant);
    const vs = arr[variant % arr.length];
    return vs[season] ?? vs[1];
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
      // v6：四季变体（每个变体 × 4 季重渲；主图集存夏季版）
      if (d.seasonal) {
        const sarr: BuildingSprite[][] = [];
        for (let v = 0; v < d.variants; v++) {
          const vs: BuildingSprite[] = [];
          for (let sn = 0; sn < 4; sn++) {
            const seed = (v + 1) * 1013904223 + d.id.length * 69069 + v * 17;
            const res = d.gen(seed, sn);
            vs.push({
              sp: renderModel(res.model),
              spNight: renderModel(res.model, { night: true }),
              thumb: arr[v].thumb,
              smokeAt: res.smokeAt,
              blinkAt: res.blinkAt,
            });
          }
          sarr.push(vs);
        }
        this.seasonals.set(d.id, sarr);
      }
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
