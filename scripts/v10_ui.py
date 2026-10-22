#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v10 UI 补丁：icons(camera/box) + engine.crowdCount + PixelCity.tsx(HUD/财政/政令厅) + CSS"""

def patch(path, pairs):
    src = open(path, encoding='utf-8').read()
    n0 = len(src)
    for tag, old, new, cnt in pairs:
        assert src.count(old) == cnt, f'[{path}:{tag}] expect {cnt}, got {src.count(old)}: {old[:70]!r}'
        src = src.replace(old, new, cnt)
        print(f'  ok  {tag}')
    open(path, 'w', encoding='utf-8').write(src)
    print(f'  ==> {path}: {n0} -> {len(src)}')

# ============ 1. icons.ts：camera + box ============
patch('/home/z/my-project/src/lib/pixelcity/icons.ts', [
    ('camera/box 图标',
     """  // ---- Task 15：天气四态 ----
  sun: [""",
     """  // ---- v10：游客相机 / 货物箱 ----
  camera: [
    '................',
    '.....KKKKK......',
    '.....KhhhK......',
    '..KKKKhhhKKKK...',
    '.KhhhhhhhhhhhhK.',
    '.KwhhhhhhhhhhwK.',
    '.KhhhhKKKKhhhhK.',
    '.KhhhKbbbbKhhhK.',
    '.KhhhKbBBbKhhhK.',
    '.KhhhKbbbbKhhhK.',
    '.KhhhhKKKKhhhhK.',
    '.KKKKKKKKKKKKKK.',
  ],
  box: [
    '................',
    '................',
    '..KKKKKKKKKKKK..',
    '.KssssssssssssK.',
    '.KttttttttttttK.',
    '.KttttKwwKttttK.',
    '.KtttKwccwKtttK.',
    '.KttttKwwKttttK.',
    '.KttttttttttttK.',
    '.KttKKKKKKKKttK.',
    '.KttttttttttttK.',
    '..KKKKKKKKKKKK..',
  ],
  // ---- Task 15：天气四态 ----
  sun: [""", 1),
])

# ============ 2. engine.ts：crowdCount + tourists ============
patch('/home/z/my-project/src/lib/pixelcity/engine.ts', [
    ('crowdCount 游客',
     """  crowdCount(): { peds: number; cars: number; pets: number; birds: number; buses: number; boats: number } {
    return {
      peds: this.actors.peds, cars: this.actors.cars,
      pets: this.actors.pets, birds: this.actors.birds,
      buses: this.actors.buses, boats: this.actors.boats,
    };
  }""",
     """  crowdCount(): { peds: number; cars: number; pets: number; birds: number; buses: number; boats: number; tourists: number } {
    return {
      peds: this.actors.peds, cars: this.actors.cars,
      pets: this.actors.pets, birds: this.actors.birds,
      buses: this.actors.buses, boats: this.actors.boats,
      tourists: this.actors.tourists,
    };
  }""", 1),
])

# ============ 3. PixelCity.tsx ============
patch('/home/z/my-project/src/components/PixelCity.tsx', [
    # 3.1 ICON_NAMES
    ('ICON_NAMES',
     """  'spr', 'sum', 'fall', 'win', 'drop', 'bridge',
];""",
     """  'spr', 'sum', 'fall', 'win', 'drop', 'bridge',
  'camera', 'box',
];""", 1),
    # 3.2 crowd state
    ('crowd state',
     "const [crowd, setCrowd] = useState({ peds: 0, cars: 0, pets: 0, birds: 0, buses: 0, boats: 0 });",
     "const [crowd, setCrowd] = useState({ peds: 0, cars: 0, pets: 0, birds: 0, buses: 0, boats: 0, tourists: 0 });", 1),
    # 3.3 modal 类型 ×2
    ('modal useState',
     "const [modal, setModal] = useState<'none' | 'save' | 'help' | 'fiscal' | 'tech' | 'data'>('none');",
     "const [modal, setModal] = useState<'none' | 'save' | 'help' | 'fiscal' | 'tech' | 'data' | 'policy'>('none');", 1),
    ('openModal 类型',
     "const openModal = useCallback((m: 'save' | 'help' | 'fiscal' | 'tech' | 'data') => {",
     "const openModal = useCallback((m: 'save' | 'help' | 'fiscal' | 'tech' | 'data' | 'policy') => {", 1),
    # 3.4 HUD：粮仓 chip 后插货物 chip
    ('HUD 货物 chip',
     """                <img src={iu('wheat')} alt="" /><b>{econ.food}<i>/{econ.foodCap}</i></b>
                <em className={econ.foodNet < 0 ? 'dn' : 'up'}>{rincS(econ.foodNet)}</em>
              </button>""",
     """                <img src={iu('wheat')} alt="" /><b>{econ.food}<i>/{econ.foodCap}</i></b>
                <em className={econ.foodNet < 0 ? 'dn' : 'up'}>{rincS(econ.foodNet)}</em>
              </button>
              <button className={`chip${econ.goodsIdx < 45 ? ' warn' : ''}`} onClick={() => openModal('fiscal')}
                title={`货物供应链：库存 ${econ.goods}/${econ.goodsCap} · 产量 ${rinc(econ.goodsProd)}/分 − 消耗 ${rinc(econ.goodsCons)}/分（工业产货供给零售商业；缺货商业收入大打折扣）${econ.exportRate > 0 ? ` · 出口 ${rinc(econ.exportRate)} 件/分` : ''}${econ.goodsIdx < 45 ? ' —— 货物短缺！快建工厂/木材厂' : ''}`}>
                <img src={iu('box')} alt="" /><b>{econ.goods}<i>/{econ.goodsCap}</i></b>
                <em className={econ.goodsNet < 0 ? 'dn' : 'up'}>{rincS(econ.goodsNet)}</em>
              </button>""", 1),
    # 3.5 HUD：文化 chip 后插游客 chip
    ('HUD 游客 chip',
     """              <button className="chip" onClick={() => openModal('data')}
                title={`文化指数：文旅供给 ${rinc(econ.cultureSup)} / 需求 ${econ.cultureNeed}（神社/教堂/博物馆/影院/钟楼等提升）—— 点击打开城市志`}>
                <img src={iu('star')} alt="" /><b>{econ.cultureIdx}%</b>
              </button>""",
     """              <button className="chip" onClick={() => openModal('data')}
                title={`文化指数：文旅供给 ${rinc(econ.cultureSup)} / 需求 ${econ.cultureNeed}（神社/教堂/博物馆/影院/钟楼等提升）—— 点击打开城市志`}>
                <img src={iu('star')} alt="" /><b>{econ.cultureIdx}%</b>
              </button>
              <button className="chip" onClick={() => openModal('fiscal')}
                title={`观光经济：当前游客 ${econ.tourists} 人 · 消费 +${rinc(econ.incomeTour)}G/分 · 旅游指数 ${econ.tourIdx}（摩天轮/水族馆/城堡是吸引力大户；酒店床位 ${econ.beds} 决定接待上限；夏季旺冬季淡）`}>
                <img src={iu('camera')} alt="" /><b>{econ.tourists}</b><i>客</i>
              </button>""", 1),
    # 3.6 财政：收支新增三行
    ('收支新行',
     """                    <tr><td>工业产值</td><td className="g">+{rinc(econ.incomeInd)}G</td></tr>
                    <tr><td>设施维护</td><td className="bad">−{rinc(econ.incomeUpk)}G</td></tr>""",
     """                    <tr><td>工业产值</td><td className="g">+{rinc(econ.incomeInd)}G</td></tr>
                    <tr className={econ.incomeTour <= 0 ? '' : 'g'}>
                      <td>旅游消费</td><td>+{rinc(econ.incomeTour)}G</td>
                    </tr>
                    {econ.incomeExp > 0 && (
                      <tr className="g"><td>港口出口</td><td>+{rinc(econ.incomeExp)}G</td></tr>
                    )}
                    {econ.ordCost > 0 && (
                      <tr><td>法令开支</td><td className="bad">−{rinc(econ.ordCost)}G</td></tr>
                    )}
                    <tr><td>设施维护</td><td className="bad">−{rinc(econ.incomeUpk)}G</td></tr>""", 1),
    # 3.7 财政：水务与季节之后插两个新板块（在「领地」板块前）
    ('财政新板块',
     """                <section>
                  <h3>领地</h3>""",
     """                <section>
                  <h3>货物供应链（v10）</h3>
                  <table><tbody>
                    <tr className={econ.goodsIdx < 45 ? 'bad' : ''}>
                      <td>货仓 库存/容量</td><td>{econ.goods} / {econ.goodsCap}（仓库每座 +80）</td>
                    </tr>
                    <tr><td>产量 / 消耗</td>
                      <td>{rinc(econ.goodsProd)} / {rinc(econ.goodsCons)} 件每分（含游客采买）</td>
                    </tr>
                    <tr className={econ.goodsNet < 0 ? 'bad' : ''}>
                      <td>货物净额</td><td>{rincS(econ.goodsNet)} 件/分</td>
                    </tr>
                    <tr><td>供货率</td>
                      <td>{econ.goodsIdx}% → 商业收入 ×{(0.55 + 0.45 * econ.goodsIdx / 100).toFixed(2)}</td>
                    </tr>
                    <tr className={econ.exportRate > 0 ? 'g' : ''}>
                      <td>港口出口</td>
                      <td>{econ.ports > 0
                        ? (econ.exportRate > 0
                          ? `${rinc(econ.exportRate)} 件/分 · 累计创汇 ${econ.exportTotal}G`
                          : '待命 —— 货仓超八成且产大于销时自动外销')
                        : '无 —— 建港口吊机/渡轮码头可外销余货'}</td>
                    </tr>
                  </tbody></table>
                </section>
                <section>
                  <h3>观光经济（v10）</h3>
                  <table><tbody>
                    <tr><td>当前游客</td>
                      <td>{econ.tourists} 人 · 消费 +{rinc(econ.incomeTour)}G/分（城市名片科技 +20%）</td>
                    </tr>
                    <tr><td>旅游指数</td>
                      <td>{econ.tourIdx} / 100（景点吸引力 {rinc(econ.attract)} 分）</td>
                    </tr>
                    <tr><td>酒店床位</td>
                      <td>{econ.beds} 床（酒店 160 / 民宿 24；接待上限 {econ.beds * 2 + 30} 人）</td>
                    </tr>
                    <tr><td>季节 / 天气</td>
                      <td>夏 1.25× · 春 1.1× · 秋 1.15× · 冬 0.55×；晴 1.15× / 雨 0.7× / 雪 0.6×</td>
                    </tr>
                    <tr><td>吸引力大户</td>
                      <td>摩天轮/水族馆/城堡 5 · 博物馆/体育场 4 · 神社/天文台 3 分</td>
                    </tr>
                  </tbody></table>
                </section>
                <section>
                  <h3>领地</h3>""", 1),
    # 3.8 财政 footer：政令厅按钮
    ('政令厅入口',
     """                <button className="pxc-btn primary" onClick={() => openModal('tech')}>
                  <img src={iu('flask')} alt="" />科技研究院
                </button>""",
     """                <button className="pxc-btn primary" onClick={() => openModal('policy')}>
                  <img src={iu('flag')} alt="" />市政法令厅
                </button>
                <button className="pxc-btn primary" onClick={() => openModal('tech')}>
                  <img src={iu('flask')} alt="" />科技研究院
                </button>""", 1),
])

# ============ 4. 政令厅模态（插在财政模态之后） ============
src = open('/home/z/my-project/src/components/PixelCity.tsx', encoding='utf-8').read()
anchor = """      {/* 科技研究院模态 */}"""
if anchor not in src:
    # 找 tech 模态的注释标记
    import re
    m = re.search(r"\n      \{/\* [^\n]*模态（[^}]*)\*/\}", src)
    anchor = None
assert anchor, 'tech modal anchor not found'
policy_modal = """      {/* 市政法令厅模态（v10） */}
      {modal === 'policy' && econ && (
        <div className="pxc-mask" onClick={e => { if (e.target === e.currentTarget) setModal('none'); }}>
          <div className="pxc-modal pxc-policy" role="dialog" aria-label="市政法令厅">
            <header>
              市 政 法 令 厅
              <button className="pxc-x" onClick={() => setModal('none')} aria-label="关闭">×</button>
            </header>
            <div className="pxc-body">
              <div className="pxc-ordsum">
                颁布中 <b>{econ.ords.filter(o => o.on).length}/{econ.ords.length}</b> 条 ·
                行政开支 <b className={econ.ordCost > 0 ? 'bad' : 'g'}>{rinc(econ.ordCost)}G/分</b> ·
                法令随时可颁布 / 废止，效果立即生效
              </div>
              <div className="pxc-ordlist">
                {econ.ords.map(o => {
                  const locked = o.lockLv || !o.reqOk;
                  return (
                    <div key={o.id} className={`pxc-ord${o.on ? ' on' : ''}${locked && !o.on ? ' lock' : ''}`}>
                      <div className="pxc-ordinfo">
                        <div className="t1">
                          <span className="st">{o.on ? '●' : locked ? '锁' : '○'}</span>
                          {o.name}
                          {o.cost > 0 && <span className="cost">{rinc(o.cost)}G/分</span>}
                          <span className="lv">LV{o.lv}</span>
                        </div>
                        <div className="t2">{o.desc}</div>
                        {locked && (
                          <div className="t3">{o.lockLv ? `需市政厅 LV${o.lv} 解锁` : `条件未满足：${o.reqNote}`}</div>
                        )}
                      </div>
                      <button
                        className={`pxc-btn${o.on ? ' danger' : ' primary'}${locked && !o.on ? ' dis' : ''}`}
                        disabled={locked && !o.on}
                        onClick={() => {
                          const t = engineRef.current?.tycoon;
                          if (!t) return;
                          const r = t.toggleOrd(o.id);
                          if (r === 'lock') {
                            say(o.lockLv
                              ? `「${o.name}」需市政厅 LV${o.lv} 才能颁布`
                              : `「${o.name}」条件未满足：${o.reqNote}`);
                          }
                        }}
                      >
                        {o.on ? '废止' : locked ? '未解锁' : '颁布'}
                      </button>
                    </div>
                  );
                })}
              </div>
              <div className="taxhint">开源节流的施政天平：节能令省电却伤民心、消费券增收却烧行政费、开放落户提速却挤占宜居 —— 政令组合是经营的第二杠杆</div>
            </div>
          </div>
        </div>
      )}

      {/* 科技研究院模态 */}"""
src = src.replace(anchor, policy_modal, 1)
print('  ok  政令厅模态')

# ============ 5. 关于文案更新 ============
old_about = """            <b style={{ color: '#8a6d1a' }}>经营模式</b>：上帝视角从一块荒地起步 —— 修路建房、人口迁入、电力供需、
            十二维民生指数（幸福/宜居/粮食/就业/供水/文化/环境/健康/安全/交通/智慧/科研）、可调税率与城市评级、16 项四分支科技树（科研决定发展上限）、购地扩张、任务引导与等级解锁（沙盒模式随时切换）；"""
new_about = """            <b style={{ color: '#8a6d1a' }}>经营模式</b>：上帝视角从一块荒地起步 —— 修路建房、人口迁入、电力供需、
            十二维民生指数（幸福/宜居/粮食/就业/供水/文化/环境/健康/安全/交通/智慧/科研）、可调税率与城市评级、16 项四分支科技树（科研决定发展上限）、购地扩张、任务引导与等级解锁（沙盒模式随时切换）；
            <b style={{ color: '#8a6d1a' }}>货物供应链</b>（工业产货 → 零售上货 → 港口出口创汇，缺货商业收入打折）、
            <b style={{ color: '#8a6d1a' }}>观光经济</b>（摩天轮/水族馆等景点招揽游客，酒店床位定接待上限，街头可见戴草帽挂相机的观光客）与
            <b style={{ color: '#8a6d1a' }}>市政法令</b>（节能令/夜间经济/消费券/公交优先等 8 条可随时颁布废止的政策）；"""
assert src.count(old_about) == 1, 'about anchor'
src = src.replace(old_about, new_about, 1)
print('  ok  关于文案')
open('/home/z/my-project/src/components/PixelCity.tsx', 'w', encoding='utf-8').write(src)
print('  ==> PixelCity.tsx done')

# ============ 6. CSS：政令厅样式 ============
css_path = '/home/z/my-project/src/lib/pixelcity/pixelcity.css'
css = open(css_path, encoding='utf-8').read()
css_add = """

/* ---- v10 市政法令厅 ---- */
.pxc-policy { width: min(560px, calc(100vw - 24px)); }
.pxc-policy .pxc-ordsum {
  font-size: 12px; color: #3d434e; margin-bottom: 8px;
  background: #F2EFE3; border: 1px solid #C9C2A8; border-radius: 3px; padding: 6px 8px;
}
.pxc-policy .pxc-ordsum b { color: #8a6d1a; }
.pxc-policy .pxc-ordsum b.bad { color: #B03A2E; }
.pxc-ordlist { display: flex; flex-direction: column; gap: 6px; }
.pxc-ord {
  display: flex; align-items: center; gap: 10px;
  border: 1px solid #C9C2A8; border-radius: 3px; padding: 7px 9px;
  background: #FAF8EF;
}
.pxc-ord.on { border-color: #4E9040; background: #EFF5E8; }
.pxc-ord.lock { opacity: 0.62; }
.pxc-ord .pxc-ordinfo { flex: 1; min-width: 0; }
.pxc-ord .t1 { font-size: 13px; font-weight: 700; color: #23252E; display: flex; align-items: center; gap: 6px; }
.pxc-ord .t1 .st { color: #4E9040; font-size: 10px; }
.pxc-ord.lock .t1 .st { color: #85878F; }
.pxc-ord .t1 .cost { font-size: 10px; color: #B03A2E; font-weight: 600; }
.pxc-ord .t1 .lv { font-size: 10px; color: #85878F; border: 1px solid #C9C2A8; border-radius: 2px; padding: 0 3px; }
.pxc-ord .t2 { font-size: 11px; color: #555c66; margin-top: 2px; line-height: 1.5; }
.pxc-ord .t3 { font-size: 10px; color: #B03A2E; margin-top: 2px; }
.pxc-ord .pxc-btn { flex-shrink: 0; min-width: 64px; }
.pxc-ord .pxc-btn.dis { opacity: 0.55; cursor: not-allowed; }
.pxc.m .pxc-ord { padding: 6px 7px; gap: 7px; }
.pxc.m .pxc-ord .t2 { font-size: 10px; }
"""
anchor_css = css.rstrip()
css = anchor_css + css_add + '\n'
open(css_path, 'w', encoding='utf-8').write(css)
print('  ok  CSS 政令厅')
print('\nUI 补丁全部完成')
