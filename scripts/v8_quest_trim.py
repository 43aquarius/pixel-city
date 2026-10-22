#!/usr/bin/env python3
"""v8 经济收紧：QUESTS 中后期任务奖励 ×0.8（早期 <200G 不动保护新手）"""
import re

p = '/home/z/my-project/src/lib/pixelcity/tycoon.ts'
src = open(p, encoding='utf-8').read()

m = re.search(r'export const QUESTS: Quest\[\] = \[(.*?)\n\];', src, re.S)
assert m, 'QUESTS block not found'
block = m.group(1)

def trim(mm):
    rg = int(mm.group(1))
    if rg >= 200:
        rg = int(round(rg * 0.8 / 5) * 5)   # 5G 取整
    return f'rG: {rg},'

new_block = re.sub(r'rG: (\d+),', trim, block)
assert new_block != block, 'no quest rewards adjusted'
src = src.replace(block, new_block)
open(p, 'w', encoding='utf-8').write(src)

for line in new_block.splitlines():
    mm = re.search(r"id: '(\w+)'.*rG: (\d+)", line)
    if mm:
        print(f'{mm.group(1):12s} rG={mm.group(2)}')
