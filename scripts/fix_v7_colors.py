#!/usr/bin/env python3
"""v7 精灵颜色修正：hex cell() → 调色板 ramp cell()"""
import re

PATH = '/home/z/my-project/src/lib/pixelcity/actors.ts'
src = open(PATH, encoding='utf-8').read()

# 仅处理 v7 段（巴士/船/自行车建模，从 'v7 公共交通' 到 '角色系统：路径寻路'）
marker_a = '// v7 公共交通：巴士'
marker_b = '// ------------------------------------------------------------\n// 角色系统：路径寻路'
ia, ib = src.index(marker_a), src.index(marker_b)
seg = src[ia:ib]

HEX2RAMP = {
    '#B3A17A': ('P.SIDE', 0), '#957F58': ('P.SIDE', 2),
    '#D8CDB0': ('P.CREAM', 0), '#C4B694': ('P.CREAM', 2),
    '#F2D24B': ('P.YELLOW', 0), '#C4A93E': ('P.PAINTY', 0),
    '#B3452E': ('P.RFRED', 0), '#8A3323': ('P.RFRED', 2),
    '#D8C9A3': ('P.SAND', 2), '#F1E5C0': ('P.CREAM', 1),
    '#6B543A': ('P.DIRT', 1), '#4C3A28': ('P.DIRT', 2),
    '#F4F2E8': ('P.WHITE', 0), '#C3C7CC': ('P.METAL', 1),
    '#B99B62': ('P.SAND', 2), '#E0DFD4': ('P.CREAM', 2),
    '#EFEDE2': ('P.CREAM', 1), '#DCDACC': ('P.CREAM', 2),
    '#4A86C8': ('P.PBLUE', 0), '#264F8C': ('P.PBLUE', 2),
    '#8A8F98': ('P.METAL', 1), '#6B7078': ('P.METAL', 2),
    '#3B3D46': ('P.ASPH', 1), '#2C2E36': ('P.ASPH', 2),
    '#E2B98B': ('P.SAND', 1), '#C09668': ('P.SAND', 2),
}

for hexc, (ramp, lv) in HEX2RAMP.items():
    seg = seg.replace(f"cell('{hexc}',", f'cell({ramp},')
    # cell('#xxx', 0) 形如 cell('#xxx', N) 已覆盖；再兜底无空格情形
    seg = seg.replace(f"cell('{hexc}', ", f'cell({ramp}, ')

# 巴士主色变量：hex → ramp
seg = seg.replace(
    "const mainC = scheme === 0 ? '#3F7A4C' : '#2C3E5E';",
    'const mainRamp = scheme === 0 ? P.GRASS : P.PBLUE;   // 市区线翡翠绿 / 郊区线藏青',
)
seg = seg.replace('cell(mainC, 0)', 'cell(mainRamp, 1)')
seg = seg.replace('cell(mainC, 1)', 'cell(mainRamp, 2)')

# 骑行者：签名改为 ramp 参数
seg = seg.replace(
    "function bikeModel(axis: 'x' | 'y', forward: 1 | -1, pose: 0 | 1, shirt: string, shirtDark: string): Model {",
    "function bikeModel(axis: 'x' | 'y', forward: 1 | -1, pose: 0 | 1, shirtRamp: number, darkRamp: number): Model {",
)
seg = seg.replace('cell(shirtDark, 0)', 'cell(darkRamp, 1)')
seg = seg.replace('cell(shirtDark, 1)', 'cell(darkRamp, 2)')
seg = seg.replace('cell(shirt, 0)', 'cell(shirtRamp, 1)')
seg = seg.replace('cell(shirt, 1)', 'cell(shirtRamp, 2)')
seg = seg.replace(
    "const BIKE_SHIRTS = ['#E05548', '#4A86C8', '#F2D24B', '#5BC8B8'];",
    '/** 骑行衣色（ramp 主色 / 暗色对）：红 / 蓝 / 黄 / 青 */\nconst BIKE_RAMPS: Array<[number, number]> = [\n  [P.RFRED, P.BRICK], [P.PBLUE, P.RFSLATE], [P.PAINTY, P.SAND], [P.RFTEAL, P.PINE],\n];',
)
seg = seg.replace(
    """  for (const [dir, axis, fwd] of cfg) {
    for (let c = 0; c < BIKE_SHIRTS.length; c++) {
      for (const pose of [0, 1] as const) {
        map.set(`${dir}#${c}#${pose}`, renderModel(
          bikeModel(axis, fwd, pose, BIKE_SHIRTS[c], BIKE_SHIRTS[(c + 1) % BIKE_SHIRTS.length]),
          { shadow: false },
        ));
      }
    }
  }""",
    """  for (const [dir, axis, fwd] of cfg) {
    for (let c = 0; c < BIKE_RAMPS.length; c++) {
      const [shirtRamp, darkRamp] = BIKE_RAMPS[c];
      for (const pose of [0, 1] as const) {
        map.set(`${dir}#${c}#${pose}`, renderModel(
          bikeModel(axis, fwd, pose, shirtRamp, darkRamp),
          { shadow: false },
        ));
      }
    }
  }""",
)

src = src[:ia] + seg + src[ib:]
open(PATH, 'w', encoding='utf-8').write(src)

# 校验：v7 段不再含 hex cell
leftover = re.findall(r"cell\('#", seg)
print('剩余 hex cell:', len(leftover))
print('mainC 残留:', seg.count('mainC'))
print('BIKE_SHIRTS 残留:', seg.count('BIKE_SHIRTS'))
