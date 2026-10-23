#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v12-D 城市卫士：engine.ts 接线
- 消费 tycoon.dispatch 出动请求 → actors.dispatchEmergency
- 巡逻编制回写 patrolCap（交班 + 治安巡逻令）
- onRescueArrive → tycoon.resolveEvent
- kind 9/10/11 绘制分支：警灯闪烁 + 消防喷水弧线 + 夜间前灯
- 事件烟柱限定火灾（疫病 fx 仅作出动目的地）"""
import pathlib

ROOT = pathlib.Path('/home/z/my-project')
E = ROOT / 'src/lib/pixelcity/engine.ts'

def patch(path, subs):
    src = path.read_text(encoding='utf-8')
    for old, new in subs:
        assert old in src, f'锚点未命中 @ {path.name}:\n---\n{old[:260]}\n---'
        assert src.count(old) == 1, f'锚点不唯一 @ {path.name}: {old[:80]!r} x{src.count(old)}'
        src = src.replace(old, new)
    path.write_text(src, encoding='utf-8')
    print(f'OK {path.name}: {len(subs)} 处补丁')

patch(E, [
    # ---- 1. 出动消费 + 巡逻编制 + 到场回调 ----
    ("""    if (this.tycoon) {
      this.tycoon.weather = { kind: this.wx.kind, t: this.wx.t };
      this.tycoon.season = this.season;   // v6：季节回写（快照层经济联动）
      if (this.tycoon.weatherReq) {          // 暴风雨事件：强制切雨
        this.setWeather(this.tycoon.weatherReq);
        this.tycoon.weatherReq = null;
      }
    }
    // 经营模式：行人密度跟随实际人口（荒地开局无人，市民迁入后街巷渐热闹）
    this.actors.popNow = this.tycoon ? this.tycoon.pop : null;""",
     """    if (this.tycoon) {
      this.tycoon.weather = { kind: this.wx.kind, t: this.wx.t };
      this.tycoon.season = this.season;   // v6：季节回写（快照层经济联动）
      if (this.tycoon.weatherReq) {          // 暴风雨事件：强制切雨
        this.setWeather(this.tycoon.weatherReq);
        this.tycoon.weatherReq = null;
      }
      // v12 应急联动：消费出动请求（消防车/救护车驰援事故现场）
      while (this.tycoon.dispatch.length) {
        const q = this.tycoon.dispatch.shift()!;
        this.actors.dispatchEmergency(this.map, q.kind, q.hx, q.hy, q.tx, q.ty);
      }
      // v12 巡逻编制：交班常驻 + 治安巡逻令 +1（上限 3 辆）
      this.actors.patrolCap = Math.min(3,
        (this.tycoon.snap?.kobans ?? 0) + (this.tycoon.hasOrd('patrol') ? 1 : 0));
      // v12 到场回调 → 提前终结事件 + 豁免余损
      this.actors.onRescueArrive = (kind) => {
        this.tycoon?.resolveEvent(kind === 9 ? 'fire' : 'plague');
      };
    } else {
      this.actors.patrolCap = 0;
    }
    // 经营模式：行人密度跟随实际人口（荒地开局无人，市民迁入后街巷渐热闹）
    this.actors.popNow = this.tycoon ? this.tycoon.pop : null;"""),
    # ---- 2. kind 9/10/11 绘制分支（插在巴士分支之前） ----
    ("""        } else if (a.kind === 5) {
          // v7 巴士：双色涂装 + 夜间前灯 / 车窗光带
          const d = ActorSystem.dirOf(a) as CarDir;
          const sp = this.actors.busSp(d, a.look);""",
     """        } else if (a.kind >= 9 && a.kind <= 11) {
          // v12 应急车队：消防车/救护车/巡逻警车 + 顶灯闪烁 + 消防喷水作业
          const d = ActorSystem.dirOf(a) as CarDir;
          const sp = this.actors.emergencySp(a.kind as 9 | 10 | 11, d);
          if (!sp) continue;
          const dx = Math.round(sx + sp.ox), dy = Math.round(sy + sp.oy);
          items.push({ key, draw: () => ctx.drawImage(sp.cv, dx, dy) });
          const blink = Math.floor(t / 240) % 2 === 0;
          const emg = a;
          if (blink || (emg.kind === 9 && emg.mission?.phase === 1)) {
            glowJobs.push(() => {
              // 顶部警灯交替闪红（救护车红/青交替）
              if (Math.floor(t / 240) % 2 === 0) {
                const bx = dx + (sp.cv.width >> 1) - 1, by = dy + 2;
                ctx.fillStyle = emg.kind === 10
                  ? (Math.floor(t / 240) % 4 < 2 ? '#E05548' : '#5BC8B8')
                  : '#E05548';
                ctx.fillRect(bx - 2, by, 2, 2);
                ctx.fillRect(bx + 2, by, 2, 2);
              }
              // 消防喷水：水炮弧线射向事故建筑 + 落点水花
              if (emg.kind === 9 && emg.mission && emg.mission.phase === 1 && emg.wait > 0) {
                const m = emg.mission;
                const bx2 = this.w2sx(m.tx, m.ty);
                const by2 = this.w2sy(m.tx, m.ty) + this.hOfs(m.tx, m.ty) - 26;
                const ox = dx + (sp.cv.width >> 1), oy = dy + 3;
                for (let k = 0; k <= 8; k++) {
                  const q = k / 8;
                  const wx2 = ox + (bx2 - ox) * q;
                  const wy2 = oy + (by2 - oy) * q - Math.sin(q * Math.PI) * 14 - 2;
                  if (Math.floor(t / 90 + k) % 3 === 0) continue;   // 水流断续感
                  ctx.fillStyle = k % 2 ? '#A8D8EA' : '#D6F3FF';
                  ctx.fillRect(Math.round(wx2), Math.round(wy2), 2, 2);
                }
                const fl2 = Math.floor(t / 130) % 2 === 0;
                ctx.fillStyle = '#D6F3FF';
                ctx.fillRect(Math.round(bx2 - 3), Math.round(by2 + (fl2 ? 0 : 2)), 2, 2);
                ctx.fillRect(Math.round(bx2 + 2), Math.round(by2 + (fl2 ? 2 : 0)), 2, 2);
              }
            });
          }
          // 夜间前灯（复用车辆光池）
          if (dk > 0.02 && this.carPool) {
            const fsx = Math.round(sx + (a.dx - a.dy) * 13);
            const fsy = Math.round(sy + (a.dx + a.dy) * 6.5 + 3);
            const pool = this.carPool;
            glowJobs.push(() => {
              ctx.drawImage(pool, fsx - 8, fsy - 5);
              ctx.fillStyle = '#F4F2E8';
              ctx.fillRect(fsx - 3, fsy, 2, 2);
              ctx.fillRect(fsx + 1, fsy, 2, 2);
            });
          }
        } else if (a.kind === 5) {
          // v7 巴士：双色涂装 + 夜间前灯 / 车窗光带
          const d = ActorSystem.dirOf(a) as CarDir;
          const sp = this.actors.busSp(d, a.look);"""),
    # ---- 3. 烟柱限定火灾 ----
    ("""    for (const ev of eco.events) {
      if (!ev.fx) continue;""",
     """    for (const ev of eco.events) {
      // v12：烟柱火点仅火灾（疫病 fx 只作救护车出动目的地）
      if (!ev.fx || ev.key !== 'fire') continue;"""),
])

print('v12-D done')
