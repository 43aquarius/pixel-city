#!/usr/bin/env python3
"""v22 截图后处理：裁剪大学城/小学特写 + 学区金光罩像素采样验证"""
from PIL import Image
import sys

S = '/home/z/my-project/scripts'
img = Image.open(f'{S}/v22_city.png')
W, H = img.size
print(f'原图 {W}x{H}')

# [1] 大学城特写：相机 centerAt(130,135) → 大学城(132-134,133-135) 应在画面中心区域
#     裁中心 46% 区域放大 2.2 倍
cw, ch = int(W * 0.46), int(H * 0.46)
cx, cy = W // 2, H // 2 - 30
crop_uni = img.crop((cx - cw // 2, cy - ch // 2, cx + cw // 2, cy + ch // 2))
crop_uni = crop_uni.resize((int(cw * 2.2), int(ch * 2.2)), Image.NEAREST)
crop_uni.save(f'{S}/v22_univ_closeup.png')
print('大学城特写 → v22_univ_closeup.png', crop_uni.size)

# [2] 学区住宅金光罩采样：学区光罩 rgba(244,214,120,~0.11×呼吸0.7-1.0)
#     在画面中部（大学城周边住宅格）采样暖金色像素占比
import collections
def gold_scan(im, box):
    px = im.crop(box).load()
    w, h = im.crop(box).size
    tot = 0; gold = 0; warm = 0
    for y in range(0, h, 2):
        for x in range(0, w, 2):
            r, g, b = px[x, y][:3]
            tot += 1
            # 纯光罩色（叠在绿草上会偏暖绿，叠在路上偏暖灰）：r 明显大于 b 且 g 居中
            if r > 150 and 120 < g < 210 and b < 140 and r - b > 50:
                gold += 1
            if r > 140 and b < 150 and r - b > 30:
                warm += 1
    return gold, warm, tot

box_center = (cx - cw // 2, cy - ch // 2, cx + cw // 2, cy + ch // 2)
gold, warm, tot = gold_scan(img, box_center)
print(f'中心区暖金像素: gold={gold} warm={warm} / 采样 {tot} ({100*warm/max(1,tot):.1f}% warm)')
print('VERDICT_GOLD=' + ('PASS' if warm > 40 else 'WEAK'))

# [3] 小学特写：小学(119,119) 在画面西侧偏北 → 从左上区域裁
crop_pri = img.crop((int(W*0.08), int(H*0.10), int(W*0.42), int(H*0.48)))
crop_pri = crop_pri.resize((int(crop_pri.width*2.0), int(crop_pri.height*2.0)), Image.NEAREST)
crop_pri.save(f'{S}/v22_primary_closeup.png')
print('小学特写 → v22_primary_closeup.png', crop_pri.size)
