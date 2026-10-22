#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v11-A 精灵层：b_more.ts 新增 genTramstop / genRailhub；catalog.ts 注册两座新建筑"""
import pathlib, sys

ROOT = pathlib.Path('/home/z/my-project')
B = ROOT / 'src/lib/pixelcity/b_more.ts'
C = ROOT / 'src/lib/pixelcity/catalog.ts'

def patch(path, subs):
    src = path.read_text(encoding='utf-8')
    for old, new in subs:
        assert old in src, f'锚点未命中 @ {path.name}:\n---\n{old[:200]}\n---'
        assert src.count(old) == 1, f'锚点不唯一 @ {path.name}: {old[:80]!r} x{src.count(old)}'
        src = src.replace(old, new)
    path.write_text(src, encoding='utf-8')
    print(f'OK {path.name}: {len(subs)} 处补丁')

# ---------------- b_more.ts：两个新建筑生成器 ----------------
TRAM = '''
// ------------------------------------------------------------
// v11 轨道交通
// ------------------------------------------------------------

/** 电车站（1×1）：低月台 + 悬臂绿顶棚 + 路线灯箱 + 受电杆（v11 有轨电车） */
export function genTramstop(seed: number): BuildResult {
  const r = mulberry32(seed);
  const faces: Face[] = [];
  const stripe = r() < 0.5 ? P.GRASS : P.CYAN;    // 干线主色：翡翠绿 / 青
  // 低月台（+Y 侧长条 + 安全黄线镶边）
  box(faces, 2.4, 9.0, 13.6, 13.8, 0, 1.15, {
    top: pFlatRoof(P.CREAM, 1), right: pWall(P.METAL), left: pWall(P.METAL),
  });
  box(faces, 2.4, 8.9, 13.6, 9.7, 1.15, 1.5, {
    top: pFlatRoof(P.PAINTY, 3), right: pWall(P.PAINTY), left: pWall(P.PAINTY),
  });
  // 立柱 ×2（后沿）
  box(faces, 3.4, 7.2, 4.4, 8.2, 0, 9, { right: pWall(P.METAL), left: pWall(P.METAL) });
  box(faces, 11.6, 7.2, 12.6, 8.2, 0, 9, { right: pWall(P.METAL), left: pWall(P.METAL) });
  // 悬臂顶棚（干线主色条纹檐）
  box(faces, 2.6, 6.6, 13.4, 13.4, 9, 10.8, {
    right: pBands(stripe, 4), left: pBands(stripe, 4), top: pFlatRoof(P.RFGRAY, 2),
  });
  // 檐下灯（夜间亮）
  box(faces, 7.0, 13.2, 9.0, 13.9, 8.4, 9.3, {
    left: pWall(P.NEONC), right: pWall(P.NEONC), top: () => cell(P.WHITE, 0),
  });
  // 候车长椅
  box(faces, 5.2, 11.4, 10.8, 12.7, 1.15, 2.6, {
    right: pWall(P.DIRT), left: pWall(P.DIRT), top: pWall(P.DIRT),
  });
  // 路线灯箱（檐下双面小牌）
  box(faces, 10.9, 12.8, 13.5, 13.6, 5.4, 8.2, {
    left: (u, v, px, py) => pSign(stripe, seed)(u, v, px, py),
    right: pWall(stripe), top: pWall(P.METAL),
  });
  // 受电杆（轨道电车辫子：细杆 + 顶横臂）
  box(faces, 14.2, 3.0, 15.0, 3.8, 0, 12.4, { right: pWall(P.METAL), left: pWall(P.METAL) });
  box(faces, 12.6, 3.2, 15.2, 3.6, 12.4, 13.2, {
    right: pWall(P.METAL), left: pWall(P.METAL), top: pFlatRoof(P.METAL, 2),
  });
  return { model: buildModel(faces, 16, 16) };
}

/** 铁路货运站（2×2）：长库房 + 双股铁轨 + 集装箱列车 + 龙门吊（v11 陆路出口枢纽） */
export function genRailhub(seed: number): BuildResult {
  const r = mulberry32(seed);
  const faces: Face[] = [];
  const COLORS = [P.RED, P.PAINTY, P.CYAN, P.PBLUE];
  // 北侧长库房（波纹铁皮大跨）
  const wx0 = 3.5, wy0 = 2.6, wx1 = 28.5, wy1 = 12.5;
  box(faces, wx0, wy0, wx1, wy1, 0, 10.5, {
    right: pCorrugated(P.RFGRAY), left: pCorrugated(P.RFGRAY),
  });
  roofDeck(faces, wx0, wy0, wx1, wy1, 10.5, P.RFGRAY, pWall(P.RFGRAY));
  // 两扇卷闸大门（+Y 面）
  box(faces, wx0 + 3, wy1 + 0.1, wx0 + 10, wy1 + 0.9, 0, 7, { left: pBands(P.METAL, 5) });
  box(faces, wx1 - 10, wy1 + 0.1, wx1 - 3, wy1 + 0.9, 0, 7, { left: pBands(P.METAL, 5) });
  // 双股铁轨（南北两股、东西走向）：枕木 + 双轨
  for (const ry of [17.5, 26.5]) {
    for (let i = 0; i < 9; i++) {
      box(faces, 2.5 + i * 3.1, ry - 1.1, 3.9 + i * 3.1, ry + 1.1, 0, 0.7, {
        top: pFlatRoof(P.DIRT, 1), right: pWall(P.DIRT), left: pWall(P.DIRT),
      });
    }
    for (const off of [-0.75, 0.75]) {
      box(faces, 2.2, ry + off - 0.25, 30.0, ry + off + 0.25, 0.7, 1.5, {
        top: () => cell(P.METAL, 1), right: () => cell(P.METAL, 2), left: () => cell(P.METAL, 0),
      });
    }
  }
  // 北股：平板车皮 3 节（随机色集装箱）
  for (let i = 0; i < 3; i++) {
    const cx = 4.2 + i * 8.6;
    box(faces, cx, 15.9, cx + 7.2, 19.1, 1.5, 3.2, {
      right: pWall(P.OUTLINE), left: pWall(P.OUTLINE), top: pFlatRoof(P.METAL, 1),
    });
    const c = COLORS[Math.floor(r() * COLORS.length)];
    box(faces, cx + 0.5, 16.2, cx + 6.7, 18.8, 3.2, 7.4, {
      right: pCorrugated(c), left: pCorrugated(c), top: pFlatRoof(c, 4),
    });
  }
  // 南股：黄色龙门吊 + 吊索集装箱
  const legW = 1.5;
  box(faces, 6, 22.5, 6 + legW, 30, 0, 15, { right: pWall(P.YELLOW), left: pWall(P.YELLOW) });
  box(faces, 12.5 - legW, 22.5, 12.5, 30, 0, 15, { right: pWall(P.YELLOW), left: pWall(P.YELLOW) });
  box(faces, 4.2, 22, 14.3, 30.5, 15, 17.2, {
    right: pWall(P.YELLOW), left: pWall(P.YELLOW), top: pFlatRoof(P.METAL, 1),
  });
  box(faces, 8.7, 25.6, 9.5, 26.4, 10.5, 15, {
    right: () => cell(P.OUTLINE, 0), left: () => cell(P.OUTLINE, 0),
  });
  box(faces, 6.8, 24, 11.4, 28.2, 6.4, 10.5, {
    right: pCorrugated(P.PAINTY), left: pCorrugated(P.PAINTY), top: pFlatRoof(P.PAINTY, 3),
  });
  // 末端信号灯（红光闪烁）
  box(faces, 29.4, 20.4, 30.4, 21.4, 0, 9, { right: pWall(P.METAL), left: pWall(P.METAL) });
  return { model: buildModel(faces, 32, 32), blinkAt: [29.9, 20.9, 9.5] };
}
'''

patch(B, [
    # 文件头注释更新
    ("//             钟楼 / 天文台 / 千本鸟居",
     "//             钟楼 / 天文台 / 千本鸟居 / 电车站 / 铁路货运站（v11）"),
    # 追加两个生成器到文件末尾前 —— 用最后一个函数结尾锚定：找 genTorii 的收尾
    ("""
export function genTorii(""",
     TRAM + """
export function genTorii("""),
])

# ---------------- catalog.ts：注册 + import ----------------
patch(C, [
    ("""  genMachiya, genDanchi, genIzakaya, genCinema, genMarket,
  genLumber, genSilo, genDock, genBusstop, genClocktower,
  genObservatory, genTorii,
} from './b_more';""",
     """  genMachiya, genDanchi, genIzakaya, genCinema, genMarket,
  genLumber, genSilo, genDock, genBusstop, genClocktower,
  genObservatory, genTorii, genTramstop, genRailhub,
} from './b_more';"""),
    # 工业：dock 之后插入 railhub
    ("""  { id: 'dock', name: '港口吊机', cat: 'ind', w: 2, h: 2, variants: 1, pop: 30,
    gen: genDock, ground: 'parking', desc: '集装箱阵与黄色龙门吊' },""",
     """  { id: 'dock', name: '港口吊机', cat: 'ind', w: 2, h: 2, variants: 1, pop: 30,
    gen: genDock, ground: 'parking', desc: '集装箱阵与黄色龙门吊' },
  { id: 'railhub', name: '铁路货运站', cat: 'ind', w: 2, h: 2, variants: 1, pop: 40,
    gen: genRailhub, desc: '集装箱列车与龙门吊：陆路出口枢纽（无需临水）· 吞吐 4 件/分（需研究「冶金工艺」）' },"""),
    # 公共：busstop 之后插入 tramstop
    ("""  { id: 'busstop', name: '巴士站', cat: 'civ', w: 1, h: 1, variants: 2, pop: 2,
    gen: genBusstop, desc: '候车亭长椅站牌：邻路建两座即开通巴士环线，交通指数 +4/座' },""",
     """  { id: 'busstop', name: '巴士站', cat: 'civ', w: 1, h: 1, variants: 2, pop: 2,
    gen: genBusstop, desc: '候车亭长椅站牌：邻路建两座即开通巴士环线，交通指数 +4/座' },
  { id: 'tramstop', name: '电车站', cat: 'civ', w: 1, h: 1, variants: 2, pop: 2,
    gen: genTramstop, desc: '低月台与受电杆：邻路建两座即开通电车干线，交通 +3/座 · 幸福 +2（需研究「电力工程」）' },"""),
])

print('v11-A 完成')
