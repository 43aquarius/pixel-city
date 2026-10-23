#!/usr/bin/env python3
# v20: 重构 tycoon.ts 中电力结算块——装机座数统计与出力解耦（夜里太阳能也计数）
import re
p = '/home/z/my-project/src/lib/pixelcity/tycoon.ts'
src = open(p, encoding='utf-8').read()

old = re.search(
    r'const pwRaw = e\?\.power \?\? 0;.*?\} else if \(pw > 0\) \{\n'
    r'\s*powerDem \+= pw;\n'
    r'\s*if \(o\.id === \'substation\'\) substations\+\+;[^\n]*\n'
    r'\s*\}',
    src, re.S)
assert old, 'old block not found'
new_block = """const pwRaw = e?.power ?? 0;
      // v20 装机座数统计（与出力无关：夜里太阳能电站也在那儿立着；成就/任务随时可查）
      if (o.id === 'power') coalN++;
      else if (o.id === 'windfarm') windfarms++;
      else if (o.id === 'solarfarm') solarfarms++;
      else if (o.id === 'substation') substations++;
      // v20：太阳能电站出力随昼夜（白昼满发、深夜归零——需其它电源兜底）
      const pw = o.id === 'solarfarm' ? pwRaw * this.dayLight : pwRaw;
      if (pw < 0) {
        powerSup += -pw;
        if (o.id !== 'power') {                                        // 清洁能源实时出力（风车/风场/太阳）
          cleanMW += -pw;
          if (o.id === 'solarfarm') solarMW += -pw;
        }
      } else if (pw > 0) powerDem += pw;"""
src = src[:old.start()] + new_block + src[old.end():]
open(p, 'w', encoding='utf-8').write(src)
print('OK: power block refactored')
