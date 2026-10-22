#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v12-E 城市卫士：UI 层
- engine.crowdCount 增消防/救护/巡逻计数
- 桌面状态栏应急车队行
- 财政报告「应急联动」行（交班/消防局/医院/扑救/急救/巡逻）
- 帮助文案补城市卫士玩法"""
import pathlib

ROOT = pathlib.Path('/home/z/my-project')
E = ROOT / 'src/lib/pixelcity/engine.ts'
U = ROOT / 'src/components/PixelCity.tsx'

def patch(path, subs):
    src = path.read_text(encoding='utf-8')
    for old, new in subs:
        assert old in src, f'锚点未命中 @ {path.name}:\n---\n{old[:260]}\n---'
        assert src.count(old) == 1, f'锚点不唯一 @ {path.name}: {old[:80]!r} x{src.count(old)}'
        src = src.replace(old, new)
    path.write_text(src, encoding='utf-8')
    print(f'OK {path.name}: {len(subs)} 处补丁')

patch(E, [
    ("""  crowdCount(): { peds: number; cars: number; pets: number; birds: number; buses: number; boats: number; tourists: number; trams: number } {
    return {
      peds: this.actors.peds, cars: this.actors.cars,
      pets: this.actors.pets, birds: this.actors.birds,
      buses: this.actors.buses, boats: this.actors.boats,
      tourists: this.actors.tourists, trams: this.actors.trams,
    };
  }""",
     """  crowdCount(): { peds: number; cars: number; pets: number; birds: number; buses: number; boats: number; tourists: number; trams: number; firetrucks: number; ambulances: number; patrols: number } {
    return {
      peds: this.actors.peds, cars: this.actors.cars,
      pets: this.actors.pets, birds: this.actors.birds,
      buses: this.actors.buses, boats: this.actors.boats,
      tourists: this.actors.tourists, trams: this.actors.trams,
      firetrucks: this.actors.firetrucks, ambulances: this.actors.ambulances,
      patrols: this.actors.patrols,
    };
  }"""),
])

patch(U, [
    # ---- crowd 状态 ----
    ("""  const [crowd, setCrowd] = useState({ peds: 0, cars: 0, pets: 0, birds: 0, buses: 0, boats: 0, tourists: 0, trams: 0 });""",
     """  const [crowd, setCrowd] = useState({ peds: 0, cars: 0, pets: 0, birds: 0, buses: 0, boats: 0, tourists: 0, trams: 0, firetrucks: 0, ambulances: 0, patrols: 0 });"""),
    # ---- 工具提示 ----
    ("""              title={ui.crowds ? `行人车辆：开（行人 ${crowd.peds} · 宠物 ${crowd.pets} · 鸽群 ${crowd.birds} · 车辆 ${crowd.cars}${crowd.buses ? ` · 巴士 ${crowd.buses}` : ''}${crowd.boats ? ` · 船 ${crowd.boats}` : ''}）` : '行人车辆：关'}""",
     """              title={ui.crowds ? `行人车辆：开（行人 ${crowd.peds} · 宠物 ${crowd.pets} · 鸽群 ${crowd.birds} · 车辆 ${crowd.cars}${crowd.buses ? ` · 巴士 ${crowd.buses}` : ''}${crowd.boats ? ` · 船 ${crowd.boats}` : ''}${crowd.firetrucks ? ` · 消防 ${crowd.firetrucks}` : ''}${crowd.ambulances ? ` · 急救 ${crowd.ambulances}` : ''}${crowd.patrols ? ` · 巡逻 ${crowd.patrols}` : ''}）` : '行人车辆：关'}"""),
    # ---- 状态行 ----
    ("""          {ui.crowds && <div><b>行人</b> {crowd.peds} · {crowd.pets} 宠 · {crowd.birds} 鸽 · {crowd.cars} 车{crowd.buses ? ` · ${crowd.buses} 巴士` : ''}{crowd.trams ? ` · ${crowd.trams} 电车` : ''}{crowd.boats ? ` · ${crowd.boats} 船` : ''}</div>}""",
     """          {ui.crowds && <div><b>行人</b> {crowd.peds} · {crowd.pets} 宠 · {crowd.birds} 鸽 · {crowd.cars} 车{crowd.buses ? ` · ${crowd.buses} 巴士` : ''}{crowd.trams ? ` · ${crowd.trams} 电车` : ''}{crowd.boats ? ` · ${crowd.boats} 船` : ''}{crowd.firetrucks ? ` · <b style={{ color: '#E05548' }}>消防 ${crowd.firetrucks} 出动</b>` : ''}{crowd.ambulances ? ` · <b style={{ color: '#E05548' }}>急救 ${crowd.ambulances} 出动</b>` : ''}{crowd.patrols ? ` · 巡逻 ${crowd.patrols}` : ''}</div>}"""),
    # ---- 财政面板：应急联动行（插在航运行后） ----
    ("""                    <tr className={econ.ferries > 0 ? 'g' : ''}>
                      <td>航运</td>
                      <td>{econ.ferries > 0 ? `渡轮码头 ${econ.ferries} 座，船舶巡游中（冬季停航）` : '无 —— 水畔渡轮码头自有船舶出港'}</td>
                    </tr>""",
     """                    <tr className={econ.ferries > 0 ? 'g' : ''}>
                      <td>航运</td>
                      <td>{econ.ferries > 0 ? `渡轮码头 ${econ.ferries} 座，船舶巡游中（冬季停航）` : '无 —— 水畔渡轮码头自有船舶出港'}</td>
                    </tr>
                    <tr className={econ.kobans + econ.firestations + econ.hospitals > 0 ? 'g' : ''}>
                      <td>应急联动</td>
                      <td>{`交番 ${econ.kobans}${crowd.patrols ? `（巡逻车 ${crowd.patrols} 辆在途）` : ''} · 消防局 ${econ.firestations} · 医院 ${econ.hospitals} —— 消防扑救 ${econ.rescueFire} 次 · 急救处置 ${econ.rescueAid} 次；火灾/疫病两段结算：应急车到场免余损，设施务必邻路`}</td>
                    </tr>"""),
    # ---- 帮助文案 ----
    ("""· <b>铁路货运与出口市场</b>（内陆出口 4 件/分；市价 55%-155% 波动，可惜售囤货低吸高抛）""",
     """· <b>铁路货运与出口市场</b>（内陆出口 4 件/分；市价 55%-155% 波动，可惜售囤货低吸高抛）· <b>城市卫士应急联动</b>（交番驻巡逻警车·治安+220 护盾；火灾/疫病来袭消防车救护车沿路驰援——到场喷水/接载并免余损，设施邻路是关键）"""),
])

print('v12-E done')
