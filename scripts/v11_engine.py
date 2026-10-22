#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v11-C 引擎层：engine.ts 渲染电车（kind 8）+ crowdCount.trams + setExportHold 接口"""
import pathlib

ROOT = pathlib.Path('/home/z/my-project')
E = ROOT / 'src/lib/pixelcity/engine.ts'

def patch(path, subs):
    src = path.read_text(encoding='utf-8')
    for old, new in subs:
        assert old in src, f'锚点未命中 @ {path.name}:\n---\n{old[:200]}\n---'
        assert src.count(old) == 1, f'锚点不唯一 @ {path.name}: {old[:80]!r} x{src.count(old)}'
        src = src.replace(old, new)
    path.write_text(src, encoding='utf-8')
    print(f'OK {path.name}: {len(subs)} 处补丁')

patch(E, [
    # crowdCount 加电车
    ("""  crowdCount(): { peds: number; cars: number; pets: number; birds: number; buses: number; boats: number; tourists: number } {
    return {
      peds: this.actors.peds, cars: this.actors.cars,
      pets: this.actors.pets, birds: this.actors.birds,
      buses: this.actors.buses, boats: this.actors.boats,
      tourists: this.actors.tourists,
    };
  }""",
     """  crowdCount(): { peds: number; cars: number; pets: number; birds: number; buses: number; boats: number; tourists: number; trams: number } {
    return {
      peds: this.actors.peds, cars: this.actors.cars,
      pets: this.actors.pets, birds: this.actors.birds,
      buses: this.actors.buses, boats: this.actors.boats,
      tourists: this.actors.tourists, trams: this.actors.trams,
    };
  }"""),
    # 车道偏移条件加电车
    ("        if (a.kind === 1 || a.kind === 5 || a.kind === 7) {\n"
     "          // 车辆 / 巴士 / 骑行者：车道偏移（靠右 / 贴路缘）",
     "        if (a.kind === 1 || a.kind === 5 || a.kind === 7 || a.kind === 8) {\n"
     "          // 车辆 / 巴士 / 骑行者 / 电车：车道偏移（靠右 / 贴路缘）"),
    # 渲染分支：电车（巴士分支之后、船舶分支之前）
    ("        } else if (a.kind === 6) {\n"
     "          // v7 船舶：贴水面航行 + 船尾白浪尾迹（航行时）",
     "        } else if (a.kind === 8) {\n"
     "          // v11 电车：双色涂装 + 受电弓 + 夜间车窗光带 / 前灯\n"
     "          const d = ActorSystem.dirOf(a) as CarDir;\n"
     "          const sp = this.actors.tramSp(d, a.look);\n"
     "          if (!sp) continue;\n"
     "          const dx = Math.round(sx + sp.ox), dy = Math.round(sy + sp.oy);\n"
     "          items.push({ key, draw: () => ctx.drawImage(sp.cv, dx, dy) });\n"
     "          if (dk > 0.02 && this.carPool) {\n"
     "            const pool = this.carPool;\n"
     "            const fsx = Math.round(sx + (a.dx - a.dy) * 16);\n"
     "            const fsy = Math.round(sy + (a.dx + a.dy) * 8 + 4);\n"
     "            const winY = dy + Math.round(sp.cv.height * 0.48);\n"
     "            const moving = a.wait <= 0;\n"
     "            glowJobs.push(() => {\n"
     "              if (moving) {\n"
     "                ctx.drawImage(pool, fsx - 9, fsy - 5);\n"
     "                ctx.fillStyle = '#F4F2E8';\n"
     "                ctx.fillRect(fsx - 4, fsy, 2, 2);\n"
     "                ctx.fillRect(fsx + 2, fsy, 2, 2);\n"
     "              }\n"
     "              // 车窗暖光带（夜间车厢灯）\n"
     "              ctx.fillStyle = 'rgba(242,210,75,0.55)';\n"
     "              ctx.fillRect(dx + 4, winY, Math.max(4, sp.cv.width - 8), 2);\n"
     "            });\n"
     "          }\n"
     "        } else if (a.kind === 6) {\n"
     "          // v7 船舶：贴水面航行 + 船尾白浪尾迹（航行时）"),
    # 经营接口：出口惜售开关（research 方法之后）
    ("""  /** 研究科技（科技面板点击） */
  research(id: string): 'ok' | 'sp' | 'lock' | 'none' {
    return this.tycoon ? this.tycoon.research(id) : 'none';
  }""",
     """  /** 研究科技（科技面板点击） */
  research(id: string): 'ok' | 'sp' | 'lock' | 'none' {
    return this.tycoon ? this.tycoon.research(id) : 'none';
  }

  /** v11 出口市场：切换「随行就市 / 惜售囤货」（财政报告按钮） */
  setExportHold(v: boolean): boolean {
    if (!this.tycoon) return false;
    this.tycoon.exportHold = v;
    this.hooks.onEcon?.(this.tycoon.view());
    return true;
  }"""),
])

print('v11-C 完成')
