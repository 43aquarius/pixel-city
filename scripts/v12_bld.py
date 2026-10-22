#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v12-A 城市卫士：交番建筑建模(b_extra.ts genKoban) + catalog.ts 注册"""
import pathlib

ROOT = pathlib.Path('/home/z/my-project')
B = ROOT / 'src/lib/pixelcity/b_extra.ts'
C = ROOT / 'src/lib/pixelcity/catalog.ts'

def patch(path, subs):
    src = path.read_text(encoding='utf-8')
    for old, new in subs:
        assert old in src, f'锚点未命中 @ {path.name}:\n---\n{old[:240]}\n---'
        assert src.count(old) == 1, f'锚点不唯一 @ {path.name}: {old[:80]!r} x{src.count(old)}'
        src = src.replace(old, new)
    path.write_text(src, encoding='utf-8')
    print(f'OK {path.name}: {len(subs)} 处补丁')

# ---- b_extra.ts：交番建模（插在 genFireStation 之前） ----
patch(B, [
    ("""/** 消防局（1×1）：红色卷闸门 ×2 + 晾塔 + 旗杆 */
export function genFireStation(seed: number): BuildResult {""",
     """/** 交番（1×1，v12 城市卫士）：两层紧凑警务岗亭 + 蓝灰四坡顶 + 门楣藏青灯箱 + 顶层蓝色警灯 */
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

/** 消防局（1×1）：红色卷闸门 ×2 + 晾塔 + 旗杆 */
export function genFireStation(seed: number): BuildResult {"""),
])

# ---- catalog.ts：导入 + 注册 ----
patch(C, [
    ("""  genRefinery, genPower, genChurch, genMuseum, genFireStation,""",
     """  genRefinery, genPower, genChurch, genMuseum, genFireStation, genKoban,"""),
    ("""  { id: 'firestation', name: '消防局', cat: 'civ', w: 1, h: 1, variants: 2, pop: 25,
    gen: genFireStation, desc: '红色卷闸门与瞭望塔' },""",
     """  { id: 'firestation', name: '消防局', cat: 'civ', w: 1, h: 1, variants: 2, pop: 25,
    gen: genFireStation, desc: '红色卷闸门与瞭望塔：火灾损失降至 35%，消防车可出动扑救（需道路连通）' },
  { id: 'koban', name: '交番', cat: 'civ', w: 1, h: 1, variants: 1, pop: 8,
    gen: genKoban, desc: '警务岗亭：安全护盾 +220 人 · 常驻一辆巡逻警车（治安巡逻令再 +1 辆）' },"""),
])

print('v12-A done')
