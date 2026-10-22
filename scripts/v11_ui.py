#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v11-E UI 层：PixelCity.tsx 出口市场板块（市价/趋势/吞吐/惜售开关）+ 电车状态行 + 状态栏 + 帮助文案"""
import pathlib

ROOT = pathlib.Path('/home/z/my-project')
U = ROOT / 'src/components/PixelCity.tsx'

def patch(path, subs):
    src = path.read_text(encoding='utf-8')
    for old, new in subs:
        assert old in src, f'锚点未命中 @ {path.name}:\n---\n{old[:240]}\n---'
        assert src.count(old) == 1, f'锚点不唯一 @ {path.name}: {old[:80]!r} x{src.count(old)}'
        src = src.replace(old, new)
    path.write_text(src, encoding='utf-8')
    print(f'OK {path.name}: {len(subs)} 处补丁')

patch(U, [
    # ---- crowd 状态加电车 ----
    ("  const [crowd, setCrowd] = useState({ peds: 0, cars: 0, pets: 0, birds: 0, buses: 0, boats: 0, tourists: 0 });",
     "  const [crowd, setCrowd] = useState({ peds: 0, cars: 0, pets: 0, birds: 0, buses: 0, boats: 0, tourists: 0, trams: 0 });"),
    # ---- 惜售开关回调（setTax 之后）----
    ("""  /** 研究科技（科技面板） */""",
     """  /** v11 出口市场：切换「随行就市 / 惜售囤货」（财政报告按钮） */
  const toggleHold = useCallback(() => {
    const eng = engineRef.current;
    if (!eng?.tycoon) return;
    const next = !eng.tycoon.exportHold;
    eng.setExportHold(next);
    beeperRef.current?.play('buy');
    say(next
      ? '惜售囤货：暂停自动出口，货仓囤货待涨 —— 市价走高后再恢复抛售'
      : '随行就市：恢复自动出口，货仓超八成即按当前市价外销');
  }, [say]);

  /** 研究科技（科技面板） */"""),
    # ---- 桌面状态栏：电车计数 ----
    ("{crowd.buses ? ` · ${crowd.buses} 巴士` : ''}{crowd.boats ? ` · ${crowd.boats} 船` : ''}",
     "{crowd.buses ? ` · ${crowd.buses} 巴士` : ''}{crowd.trams ? ` · ${crowd.trams} 电车` : ''}{crowd.boats ? ` · ${crowd.boats} 船` : ''}"),
    # ---- HUD 货物 chip 提示加市价 ----
    ("                title={`货物供应链：库存 ${econ.goods}/${econ.goodsCap} · 产量 ${rinc(econ.goodsProd)}/分 − 消耗 ${rinc(econ.goodsCons)}/分（工业产货供给零售商业；缺货商业收入大打折扣）${econ.exportRate > 0 ? ` · 出口 ${rinc(econ.exportRate)} 件/分` : ''}${econ.goodsIdx < 45 ? ' —— 货物短缺！快建工厂/木材厂' : ''}`}>",
     "                title={`货物供应链：库存 ${econ.goods}/${econ.goodsCap} · 产量 ${rinc(econ.goodsProd)}/分 − 消耗 ${rinc(econ.goodsCons)}/分（工业产货供给零售商业；缺货商业收入大打折扣）${econ.exportRate > 0 ? ` · 出口 ${rinc(econ.exportRate)} 件/分 @ ${econ.expPrice.toFixed(2)}G/件` : ''}${econ.exportHold ? ' · 惜售囤货中（暂停出口）' : ''}${econ.goodsIdx < 45 ? ' —— 货物短缺！快建工厂/木材厂' : ''}`}>"),
    # ---- 财政收支表：港口出口行显示市价 ----
    ("                    {econ.incomeExp > 0 && (\n"
     "                      <tr className=\"g\"><td>港口出口</td><td>+{rinc(econ.incomeExp)}G</td></tr>\n"
     "                    )}",
     "                    {econ.incomeExp > 0 && (\n"
     "                      <tr className=\"g\"><td>出口贸易</td><td>+{rinc(econ.incomeExp)}G（市价 {Math.round(econ.mkt * 100)}%）</td></tr>\n"
     "                    )}"),
    # ---- 财政：公共交通行 + 电车 ----
    ("                    <tr className={econ.busStops > 0 ? 'g' : ''}>\n"
     "                      <td>公共交通</td>\n"
     "                      <td>{econ.busStops >= 2 ? `巴士环线运转中（车站 ${econ.busStops} 座）` : econ.busStops === 1 ? '仅 1 座车站 —— 再建一座即开通环线' : '无 —— 两座邻路巴士站开通公交'}</td>\n"
     "                    </tr>",
     "                    <tr className={econ.busStops > 0 ? 'g' : ''}>\n"
     "                      <td>公共交通</td>\n"
     "                      <td>{econ.busStops >= 2 ? `巴士环线运转中（车站 ${econ.busStops} 座）` : econ.busStops === 1 ? '仅 1 座车站 —— 再建一座即开通环线' : '无 —— 两座邻路巴士站开通公交'}</td>\n"
     "                    </tr>\n"
     "                    <tr className={econ.tramStops >= 2 ? 'g' : ''}>\n"
     "                      <td>有轨电车</td>\n"
     "                      <td>{econ.tramStops >= 2 ? `电车干线运转中（电车站 ${econ.tramStops} 座 · 交通 +${econ.tramBonus} · 幸福 +2 · 整流所 16MW）` : econ.tramStops === 1 ? '仅 1 座电车站 —— 再建一座即开通干线（需研究「电力工程」）' : '无 —— 两座邻路电车站开通干线'}</td>\n"
     "                    </tr>"),
    # ---- 货物供应链板块：出口行改写 + 出口市场小节 ----
    ("                    <tr className={econ.exportRate > 0 ? 'g' : ''}>\n"
     "                      <td>港口出口</td>\n"
     "                      <td>{econ.ports > 0\n"
     "                        ? (econ.exportRate > 0\n"
     "                          ? `${rinc(econ.exportRate)} 件/分 · 累计创汇 ${econ.exportTotal}G`\n"
     "                          : '待命 —— 货仓超八成且产大于销时自动外销')\n"
     "                        : '无 —— 建港口吊机/渡轮码头可外销余货'}</td>\n"
     "                    </tr>\n"
     "                  </tbody></table>\n"
     "                </section>",
     "                    <tr className={econ.exportRate > 0 ? 'g' : ''}>\n"
     "                      <td>出口吞吐</td>\n"
     "                      <td>{(econ.ports + econ.railHubs) > 0\n"
     "                        ? (econ.exportRate > 0\n"
     "                          ? `${rinc(econ.exportRate)} 件/分 · 累计创汇 ${econ.exportTotal}G`\n"
     "                          : econ.exportHold ? '惜售囤货中 —— 恢复出口即按市价外销' : '待命 —— 货仓超八成且产大于销时自动外销')\n"
     "                        : '无 —— 建港口吊机/渡轮码头/铁路货运站可外销余货'}</td>\n"
     "                    </tr>\n"
     "                    <tr>\n"
     "                      <td>出口单价</td>\n"
     "                      <td>{econ.expPrice.toFixed(2)}G/件（基准 1.35 × 市价 {Math.round(econ.mkt * 100)}%{econ.mktTrend > 0.005 ? ' ↑' : econ.mktTrend < -0.005 ? ' ↓' : ' →'}{econ.techs.includes('metal') ? ' × 冶金 1.25' : ''}）</td>\n"
     "                    </tr>\n"
     "                  </tbody></table>\n"
     "                  <div className=\"pxc-mkt\">\n"
     "                    <div className=\"pxc-mktbar\" aria-hidden>\n"
     "                      <i style={{ width: `${Math.round((econ.mkt - 0.55) / 1.0 * 100)}%` }} />\n"
     "                      <span className=\"tick\" style={{ left: '45%' }} />\n"
     "                    </div>\n"
     "                    <div className=\"pxc-mktrow\">\n"
     "                      <span className={econ.mkt >= 1.15 ? 'g' : econ.mkt <= 0.75 ? 'bad' : ''}>\n"
     "                        市价 {Math.round(econ.mkt * 100)}%{econ.mktTrend > 0.005 ? ' ↑ 看涨' : econ.mktTrend < -0.005 ? ' ↓ 看跌' : ' → 盘整'}（55% – 155% 波动）\n"
     "                      </span>\n"
     "                      <button className={`pxc-btn${econ.exportHold ? ' primary' : ''}`} onClick={toggleHold}>\n"
     "                        {econ.exportHold ? '恢复出口（随行就市）' : '惜售囤货（暂停出口）'}\n"
     "                      </button>\n"
     "                    </div>\n"
     "                    <div className=\"taxhint\">低吸高抛：市价低迷时囤货惜售，行情看涨时恢复出口多赚差价；铁路货运站吞吐 4 件/分（港口 2.2），内陆城市也可出口</div>\n"
     "                  </div>\n"
     "                </section>"),
    # ---- 城市志（data 模态）公共交通行 + 电车 ----
    ("                    <tr className={econ.busStops > 0 ? 'g' : ''}><td>公交</td><td>{econ.busStops >= 2 ? `巴士环线运转中（${econ.busStops} 座车站 · 交通 +${econ.busBonus}）` : econ.busStops === 1 ? '仅 1 座车站 —— 再建一座即开通环线' : '无 —— 两座邻路巴士站开通公交'}</td></tr>",
     "                    <tr className={econ.busStops > 0 ? 'g' : ''}><td>公交</td><td>{econ.busStops >= 2 ? `巴士环线运转中（${econ.busStops} 座车站 · 交通 +${econ.busBonus}）` : econ.busStops === 1 ? '仅 1 座车站 —— 再建一座即开通环线' : '无 —— 两座邻路巴士站开通公交'}</td></tr>\n"
     "                    <tr className={econ.tramStops >= 2 ? 'g' : ''}><td>电车</td><td>{econ.tramStops >= 2 ? `电车干线运转中（${econ.tramStops} 座电车站 · 交通 +${econ.tramBonus} · 幸福 +2）` : '未开通 —— 两座邻路电车站（需「电力工程」）'}</td></tr>"),
    # ---- 帮助文案（桌面 + 移动） ----
    ("· <b>市政法令</b>（财政报告内进政令厅）· <b>十维指数与城市评级</b>",
     "· <b>市政法令</b>（财政报告内进政令厅）· <b>有轨电车</b>（两座电车站开通干线：交通+幸福双升）· <b>铁路货运与出口市场</b>（内陆出口 4 件/分；市价 55%-155% 波动，可惜售囤货低吸高抛）· <b>十维指数与城市评级</b>"),
    ("工业产货供商业、缺货打折，景点招游客消费，财政报告里可进市政法令厅颁布政策",
     "工业产货供商业、缺货打折，景点招游客消费；两座电车站开通电车干线，铁路货运站让内陆城市出口；出口市价随行就市波动，可惜售囤货低吸高抛；财政报告里可进市政法令厅颁布政策"),
])

print('v11-E 完成')
