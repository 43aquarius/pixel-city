#!/usr/bin/env python3
"""v7 展示拼图：巴士 / 渡轮+尾迹 / 骑行者 / 飞艇 → docs/transit_life.png"""
from PIL import Image, ImageDraw

SHOTS = [
    ('scripts/v7_t6_bus_frozen.png',   'BUS 环线巴士'),
    ('scripts/v7_t16_wake.png',        'FERRY 渡轮与尾迹'),
    ('scripts/v7_t8_bike.png',         'BIKE 骑行者'),
    ('scripts/v7_t9_blimp.png',        'AIRSHIP 飞艇巡航'),
]

CROP = (250, 60, 1150, 620)   # 统一裁掉 UI 侧栏，保留画面主体 (w=900 h=560)
CELL_W, CELL_H = 900, 560
LABEL_H = 44
PAD = 12

out = Image.new('RGB', (CELL_W * 2 + PAD * 3, (CELL_H + LABEL_H) * 2 + PAD * 3), '#0B0F24')
draw = ImageDraw.Draw(out)

for i, (path, label) in enumerate(SHOTS):
    img = Image.open(path).convert('RGB').crop(CROP).resize((CELL_W, CELL_H), Image.NEAREST)
    col, row = i % 2, i // 2
    x = PAD + col * (CELL_W + PAD)
    y = PAD + row * (CELL_H + LABEL_H + PAD)
    out.paste(img, (x, y))
    draw.rectangle([x, y + CELL_H, x + CELL_W, y + CELL_H + LABEL_H], fill='#12172E')
    draw.text((x + 14, y + CELL_H + 14), label, fill='#F2D24B')

out.save('docs/transit_life.png')
print('saved docs/transit_life.png', out.size)
