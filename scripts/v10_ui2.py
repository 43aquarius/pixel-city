#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v10 UI 补丁（续）：政令厅模态 + 关于文案 + CSS"""

# ---------- 1. 政令厅模态 ----------
P = '/home/z/my-project/src/components/PixelCity.tsx'
src = open(P, encoding='utf-8').read()
anchor = '      {/* 科技研究院模态（经营模式） */}'
assert src.count(anchor) == 1, f'anchor hits={src.count(anchor)}'
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

"""
src = src.replace(anchor, policy_modal + anchor, 1)
print('  ok  政令厅模态')

# ---------- 2. 关于文案 ----------
old_about = """            <b style={{ color: '#8a6d1a' }}>经营模式</b>：上帝视角从一块荒地起步 —— 修路建房、人口迁入、电力供需、
            十二维民生指数（幸福/宜居/粮食/就业/供水/文化/环境/健康/安全/交通/智慧/科研）、可调税率与城市评级、16 项四分支科技树（科研决定发展上限）、购地扩张、任务引导与等级解锁（沙盒模式随时切换）；"""
new_about = """            <b style={{ color: '#8a6d1a' }}>经营模式</b>：上帝视角从一块荒地起步 —— 修路建房、人口迁入、电力供需、
            十二维民生指数（幸福/宜居/粮食/就业/供水/文化/环境/健康/安全/交通/智慧/科研）、可调税率与城市评级、16 项四分支科技树（科研决定发展上限）、购地扩张、任务引导与等级解锁（沙盒模式随时切换）；
            <b style={{ color: '#8a6d1a' }}>货物供应链</b>（工业产货 → 零售上货 → 港口出口创汇，缺货商业收入打折）、
            <b style={{ color: '#8a6d1a' }}>观光经济</b>（摩天轮/水族馆等景点招揽游客，酒店床位定接待上限，街头可见戴草帽挂相机的观光客）与
            <b style={{ color: '#8a6d1a' }}>市政法令</b>（节能令/夜间经济/消费券/公交优先等 8 条可随时颁布废止的政策）；"""
assert src.count(old_about) == 1, f'about hits={src.count(old_about)}'
src = src.replace(old_about, new_about, 1)
print('  ok  关于文案')
open(P, 'w', encoding='utf-8').write(src)

# ---------- 3. CSS ----------
css_path = '/home/z/my-project/src/lib/pixelcity/pixelcity.css'
css = open(css_path, encoding='utf-8').read()
assert 'pxc-ordlist' not in css, 'css already patched'
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
css = css.rstrip() + css_add + '\n'
open(css_path, 'w', encoding='utf-8').write(css)
print('  ok  CSS 政令厅')
print('\n续补丁完成')
