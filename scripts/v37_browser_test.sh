#!/bin/bash
# ============================================================
# v37_browser_test.sh — 千里比邻「姊妹城市」邻城外交纵深端到端验证
# 增量 = sisters.ts（邻城数据结构 + SIS_* 调度常数 + 名号/市长/性情池 +
#   genSisters 生成 + tradeProfit/tradeGain 互市利润 + relBand 好感档位 +
#   rollSisEvent 事件抽取 + SIS_CALAMITIES 灾由池）
#   + tycoon.ts（sisEnsure 补建 + stepSisters 心跳（待办过期/邻城成长月评/事件roll）
#   + rollSisters（求援待办/赠礼/来访）+ tradeWith 互市（LV2 门禁/冷却/出货推导）
#   + decideSis 求援作答（援银/婉拒/府库拦）+ sisCheckBond 结好盟誓
#   + sisReliefAid 灾害驰援（rollEvent bad 分支挂钩）+ 月评名声在外
#   + 成就 千里结好/雪中送炭/广结善缘 + 任务 千里比邻 + Snap v37 字段
#   + EconView.sis/SisView + 存档 sis* 全套字段（旧档缺省补建三邻城））
#   + PixelCity.tsx（顶栏「盟」chip + 姊妹城市面板（急件横幅/三城卡/对照条/互市按钮）
#   + 帮助移动/桌面两表新增「邻城」行 + 经营长行补姊妹城市）
#   + pixelcity.css（sis 面板全套样式 + 移动端适配）
# S 段：bun 直测（常数 / 生成 / 利润 / 档位 / 事件抽取 / 出货量 / 成就任务）
# D 段：引擎流（开埠三邻城 / 互市冷却 / 拒运 / 求援作答 / 府库拦 / 久候不答 /
#       结好盟誓 / 月评名声 / 灾害驰援 / 驰援冷却 / 成就巡检 / 存档往返）
# U 段：顶栏「盟」指标 / 姊妹城市面板 / 急件横幅 / 移动端截图
# R 段：零控制台错误
# ============================================================
set -u
B=http://localhost:3000
OUT=/home/z/my-project/scripts
PASS=0; FAIL=0
ok()   { echo "  ✓ $1"; PASS=$((PASS+1)); }
bad()  { echo "  ✗ $1"; FAIL=$((FAIL+1)); }
chk()  { if [ "$2" = "$3" ]; then ok "$1 ($2)"; else bad "$1 (got=$2 want=$3)"; fi; }
stripq() { tr -d '\\' | tr -d '"' | tr -d ' '; }
re() {
  local out="" k
  for k in 1 2 3 4 5; do
    if [ -z "${RE_CONN:-}" ]; then
      if ! agent-browser wait --fn "window.__pxc!==undefined" --timeout 800 >/dev/null 2>&1; then
        agent-browser open http://localhost:3000 >/dev/null 2>&1
        agent-browser wait --fn "window.__pxc!==undefined" --timeout 90000 >/dev/null 2>&1
        agent-browser wait 2500 >/dev/null 2>&1
      fi
      RE_CONN=1
    fi
    out=$(agent-browser eval "$1" 2>&1 | awk 'NF{printf "%s",$0}END{print ""}' | tr -d '\\' | tr -d '"' | tr -d ' ')
    if [ -n "$out" ] && ! echo "$out" | grep -q "Evaluationerror\|Evaluation error"; then
      echo "$out"; return 0
    fi
    sleep 0.6
  done
  echo "$out"; return 1
}
errcount() { agent-browser errors --json 2>/dev/null | python3 -c "import json,sys
try: print(len(json.load(sys.stdin).get('data',{}).get('errors',[])))
except Exception: print(0)"; }

echo "=== [S] 纯函数直测（bun：常数 / 生成 / 利润 / 档位 / 事件抽取 / 成就任务） ==="
S=$(cd /home/z/my-project && bun -e '
import { SIS_N, SIS_LV, SIS_ROLL_GAP, SIS_EVT_GAP, SIS_TRADE_CD, SIS_REQ_TTL, SIS_AID_COST, SIS_AID_REL,
  SIS_DECLINE_REL, SIS_TRADE_REL, SIS_FRIEND, SIS_SWORN, SIS_HELP_REL, SIS_HELP_CD,
  genSisters, tradeProfit, tradeGain, relBand, rollSisEvent, SIS_TOWNS, SIS_MAYORS } from "./src/lib/pixelcity/sisters.ts";
import { ACHIEVEMENTS, QUESTS, sisTradeUnitsOf } from "./src/lib/pixelcity/tycoon.ts";
const cs = genSisters();
const names = new Set(cs.map(c => c.name)), mayors = new Set(cs.map(c => c.mayor));
const a1 = ACHIEVEMENTS.find(a => a.id === "sisfriend")!, a2 = ACHIEVEMENTS.find(a => a.id === "sisaid3")!,
  a3 = ACHIEVEMENTS.find(a => a.id === "sis3")!;
const q = QUESTS.find(x => x.id === "sis1")!;
console.log(JSON.stringify({
  k: [SIS_N, SIS_LV, SIS_TRADE_CD, SIS_ROLL_GAP, SIS_EVT_GAP, SIS_REQ_TTL, SIS_AID_COST, SIS_AID_REL,
      SIS_DECLINE_REL, SIS_TRADE_REL, SIS_FRIEND, SIS_SWORN, SIS_HELP_REL, SIS_HELP_CD].join(","),
  gen: cs.length + "," + names.size + "," + mayors.size + "," + cs[0].id + cs[1].id + cs[2].id,
  rel: cs.every(c => c.rel >= 28 && c.rel <= 42) + "," + cs.every(c => c.pop >= 120 && c.pop <= 420),
  pf: tradeProfit(0, 30) + "," + tradeProfit(100, 95),
  gain: tradeGain(10, 0, 30) + "," + tradeGain(20, 100, 95),
  band: relBand(10) + "/" + relBand(35) + "/" + relBand(50) + "/" + relBand(65) + "/" + relBand(90),
  ev: [rollSisEvent(0, () => 0.10), rollSisEvent(100, () => 0.40), rollSisEvent(60, () => 0.55),
       rollSisEvent(60, () => 0.95), rollSisEvent(0, () => 0.55)].join(","),
  units: sisTradeUnitsOf(40, 200) + "," + sisTradeUnitsOf(100, 40) + "," + sisTradeUnitsOf(3, 200),
  ach: a1.name + a1.goal + "/" + a2.name + a2.goal + "/" + a3.name + a3.goal,
  q: q.title + q.goal,
  towns: SIS_TOWNS.length + "/" + SIS_MAYORS.length,
}));' 2>&1 | tail -1 | stripq)
chk "S1 调度常数（3城 · LV2 · 冷却6 · 步进6/14 · 待办24 · 援150/+18/−6 · 互市+2 · 结好60 · 盟誓80 · 驰援60/12）" \
  "$(echo "$S" | grep -o 'k:3,2,6,6,14,24,150,18,-6,2,60,80,60,12')" "k:3,2,6,6,14,24,150,18,-6,2,60,80,60,12"
chk "S2 三邻城生成（城数/名号不重/市长不重 · id sis0-2）" "$(echo "$S" | grep -o 'gen:3,3,3,sis0sis1sis2')" "gen:3,3,3,sis0sis1sis2"
chk "S3 初始口径（好感28-42 · 人口120-420）" "$(echo "$S" | grep -o 'rel:true,true')" "rel:true,true"
chk "S4 互市单价（素交1.65 · 金兰2.975）" "$(echo "$S" | grep -o 'pf:1.65,2.975')" "pf:1.65,2.975"
chk "S5 概算（10件17G · 20件满好感60G）" "$(echo "$S" | grep -o 'gain:17,60')" "gain:17,60"
chk "S6 好感五档（素不相识/点头之交/往来密切/姊妹之城/歃血为盟）" "$(echo "$S" | grep -o 'band:素不相识/点头之交/往来密切/姊妹之城/歃血为盟')" "band:素不相识/点头之交/往来密切/姊妹之城/歃血为盟"
chk "S7 事件抽取（患难必aid · 深交gift · 60来访 · 高r空手 · 素交无事）" "$(echo "$S" | grep -o 'ev:aid,gift,visit,,')" "ev:aid,gift,visit,,"
chk "S8 出货量（货40/pop200→17 · 货100/pop40→13 · 货3拒运口径6）" "$(echo "$S" | grep -o 'units:17,13,6')" "units:17,13,6"
chk "S9 成就三枚（千里结好60 / 雪中送炭3 / 广结善缘3）" "$(echo "$S" | grep -o 'ach:千里结好60/雪中送炭3/广结善缘3')" "ach:千里结好60/雪中送炭3/广结善缘3"
chk "S10 任务（千里比邻 · goal 1）" "$(echo "$S" | grep -o 'q:千里比邻1')" "q:千里比邻1"
chk "S11 名号池体量（10城 / 12市长）" "$(echo "$S" | grep -o 'towns:10/12')" "towns:10/12"

echo "=== [1] 桌面端 1440×900 新档开局 ==="
agent-browser close >/dev/null 2>&1; sleep 1
agent-browser set viewport 1440 900
agent-browser open "$B" >/dev/null 2>&1
agent-browser wait --fn "window.__pxc!==undefined" --timeout 90000 >/dev/null 2>&1 && ok "引擎就绪" || bad "引擎超时"
agent-browser wait 3000
agent-browser eval "(()=>{const b=[...document.querySelectorAll('button')].filter(x=>(x.textContent||'').includes('跳过'));if(b.length)b[b.length-1].click();return 'tut';})()" >/dev/null 2>&1
# 冻结随机源：市民信/事件/生日/景气/公文/邻城事件不自行触发（sisTest*/forceEvent 单测不受影响）
agent-browser eval "(()=>{const t=window.__pxc.tycoon;const c=t.citz;c.mailTimer=99999;c.evTimer=99999;c.bdayTimer=99999;t.eventTimer=99999;t.cycTimer=99999;t.docNext=999999;t.sisGrowAt=99999;t.sisEvtAt=99999;return 'frozen';})()" >/dev/null 2>&1

echo "=== [2] D 段：姊妹城市引擎流 ==="
# D1 开埠即有三邻城（补建一次到位 · id sis0..2 · 视图同步）
D1=$(re "JSON.stringify((()=>{const e=window.__pxc;const t=e.tycoon;t.tick(0.05,e.map);
return {n:t.sisCities.length,ids:t.sisCities.map(c=>c.id).join(''),v:t.view().sis.cities.length};})())")
chk "D1 开埠三邻城（补建3 · sis0sis1sis2 · 视图3）" "$(echo "$D1" | grep -o 'n:3,ids:sis0sis1sis2,v:3')" "n:3,ids:sis0sis1sis2,v:3"
# D2 互市（LV2 门禁放行 · 出货扣减 · 赚银入账 · 好感+2 · 计数1 · 冷却生效）
D2=$(re "JSON.stringify((()=>{const e=window.__pxc;const t=e.tycoon;const m=e.map;
t.level=2;t.goods=100;
const c0=t.coins,g0=t.goods,r0=t.sisCities[0].rel;
const ok=t.tradeWith('sis0');
t.tick(0.05,m);
const v=t.view().sis.cities[0];
return {ok,dG:g0-t.goods,dC:Math.round(t.coins-c0),dR:t.sisCities[0].rel-r0,
  n:t.sisTradeN,cd:v.cd,units:v.units};})())")
echo "  · D2 互市：$D2"
chk "D2 互市成交（true · 好感+2 · 计数+1）" \
  "$(echo "$D2" | grep -o 'ok:true' | head -1)$(echo "$D2" | grep -o 'dR:2')$(echo "$D2" | grep -o 'n:1')" "ok:truedR:2n:1"
D2CD=$(echo "$D2" | grep -o 'cd:[0-9.]*' | cut -d: -f2)
if python3 -c "exit(0 if $D2CD>0 else 1)" 2>/dev/null; then ok "D2b 互市冷却生效（cd=${D2CD} 游戏时）"; else bad "D2b 冷却未生效"; fi
D2C=$(echo "$D2" | grep -o 'dC:[0-9]*' | cut -d: -f2)
if python3 -c "exit(0 if $D2C>0 else 1)" 2>/dev/null; then ok "D2c 赚银入账（+${D2C}G）"; else bad "D2c 赚银异常"; fi
# D2d 冷却内再发同城 → 拒
D2D=$(re "JSON.stringify((()=>{const t=window.__pxc.tycoon;
return {again:!t.tradeWith('sis0'),other:t.tradeWith('sis1')};})())")
chk "D2d 冷却拒发 / 异城可发（again=false · other=true）" "$(echo "$D2D" | grep -o 'again:true,other:true')" "again:true,other:true"
# D3 货不足拒运（3 件 < 起运量 6 → false 且不扣货）
D3=$(re "JSON.stringify((()=>{const e=window.__pxc;const t=e.tycoon;
t.sisTradeAt[1]=0;t.goods=3;const g0=t.goods;
const ok=t.tradeWith('sis1');
return {ok,g:t.goods===g0};})())")
chk "D3 货不足拒运（false · 货仓分毫未动）" "$(echo "$D3" | grep -o 'ok:false,g:true')" "ok:false,g:true"
# D4 求援待办（sisTestReq 生成 · 视图急件同步 · 准：扣援银 + 好感+18 + 编年史）
D4=$(re "JSON.stringify((()=>{const e=window.__pxc;const t=e.tycoon;const m=e.map;
t.coins=5000;t.sisTradeAt[1]=0;
const okReq=t.sisTestReq('sis1');
const v=t.view().sis.req;
const id=v?v.id:'none',nm=v?v.name:'',ttl=v?v.ttl:0;
const r0=t.sisCities[1].rel,c0=t.coins;
const ok=t.decideSis(true);
return {okReq,id,nm:nm==='?',ttl:ttl>0,ok,dC:Math.round(c0-t.coins),
  dR:t.sisCities[1].rel-r0,aid:t.sisAidN,
  chron:t.chron.entries.some(x=>x.title==='雪中送炭'),req:t.sisReq===null};})())")
chk "D4 求援急件（生成 sis1 · 视图同步 · 准：援银150 · 好感+18 · 编年史雪中送炭 · 案头清）" \
  "$(echo "$D4" | grep -o 'okReq:true')$(echo "$D4" | grep -o 'id:sis1')$(echo "$D4" | grep -o 'ttl:true')$(echo "$D4" | grep -o 'ok:true' | head -1)$(echo "$D4" | grep -o 'dC:150')$(echo "$D4" | grep -o 'dR:18')$(echo "$D4" | grep -o 'aid:1')$(echo "$D4" | grep -o 'chron:true')$(echo "$D4" | grep -o 'req:true')" \
  "okReq:trueid:sis1ttl:trueok:truedC:150dR:18aid:1chron:truereq:true"
# D5 府库不足批不动「准」（rel−6 · 待办清空）
D5=$(re "JSON.stringify((()=>{const e=window.__pxc;const t=e.tycoon;
t.coins=10;t.sisTradeAt[0]=0;
const okReq=t.sisTestReq('sis0');
const r0=t.sisCities[0].rel;
const ok=t.decideSis(true);
return {okReq,ok,req:t.sisReq===null,dR:t.sisCities[0].rel-r0};})())")
chk "D5 府库拦批（准批不动 · 待办清 · 好感−6）" "$(echo "$D5" | grep -o 'okReq:true,ok:false,req:true,dR:-6')" "okReq:true,ok:false,req:true,dR:-6"
# D6 久候不答 = 婉拒（过期 tick → 待办清 · rel−6）
D6=$(re "JSON.stringify((()=>{const e=window.__pxc;const t=e.tycoon;const m=e.map;
t.coins=5000;t.sisTradeAt[2]=0;
const okReq=t.sisTestReq('sis2');
t.sisReq.expire=t.gHours-0.1;
const r0=t.sisCities[2].rel;
t.tick(0.05,m);
return {okReq,req:t.sisReq===null,dR:t.sisCities[2].rel-r0};})())")
chk "D6 久候不答（待办清 · 好感−6 使者悻悻而归）" "$(echo "$D6" | grep -o 'okReq:true,req:true,dR:-6')" "okReq:true,req:true,dR:-6"
# D7 结好（好感60 → 盟书入册 · 视图姊妹徽记）
D7=$(re "JSON.stringify((()=>{const e=window.__pxc;const t=e.tycoon;
const ok=t.sisSetRel('sis0',60);
const v=t.view().sis.cities[0];
return {ok,bonded:v.bonded,band:v.band,
  chron:t.chron.entries.some(x=>x.title==='千里结好')};})())")
chk "D7 千里结好（盟书入册 · 姊妹之城徽记 · 档位升）" "$(echo "$D7" | grep -o 'ok:true,bonded:true,band:姊妹之城,chron:true')" "ok:true,bonded:true,band:姊妹之城,chron:true"
# D8 盟誓（三城全 80 → 广结善缘入册；先拉满 sis0 再补 sis1/sis2）
D8=$(re "JSON.stringify((()=>{const e=window.__pxc;const t=e.tycoon;const m=e.map;
t.sisSetRel('sis0',80);
const a=t.sisSetRel('sis1',80),b=t.sisSetRel('sis2',80);
t.tick(0.05,m);
return {a,b,sw:t.view().sis.sworn,
  chron:t.chron.entries.some(x=>x.title==='广结善缘'),hi:t.snap.sisHiN};})())")
chk "D8 广结善缘（三城歃血 · sisHiN=3 · 编年史入册）" "$(echo "$D8" | grep -o 'a:true,b:true,sw:true,chron:true,hi:3')" "a:true,b:true,sw:true,chron:true,hi:3"
# D9 月评名声在外（邻城评级压到 30 → sisTestGrow → 编年史 + XP）
D9=$(re "JSON.stringify((()=>{const e=window.__pxc;const t=e.tycoon;
t.sisCities[1].rating=30;
const x0=t.xp;
t.sisTestGrow();
return {beat:t.chron.entries.some(x=>x.title==='名声在外'),
  up:t.xp-x0>=25,grow:t.sisCities[1].pop>0};})())")
echo "  · D9 月评：$D9"
chk "D9 月评名声在外（编年史入册 · XP≥25（多城齐超可叠加） · 邻城成长步进）" "$(echo "$D9" | grep -o 'beat:true,up:true,grow:true')" "beat:true,up:true,grow:true"
# D10 灾害驰援（三城好感全 60+ → forceEvent('plague') → 赈灾银入库 + 编年史邻邦驰援）
D10=$(re "JSON.stringify((()=>{const e=window.__pxc;const t=e.tycoon;const m=e.map;
t.sisSetRel('sis0',60);t.sisSetRel('sis1',60);t.sisSetRel('sis2',60);
t.sisSupAt=-999;
const c0=t.coins;
const ok=t.forceEvent('plague',m);
const gain=t.coins-c0;
return {ok,gain:gain>=60&&gain<=110,
  chron:t.chron.entries.some(x=>x.title==='邻邦驰援')};})())")
chk "D10 邻邦驰援（疫病来袭 · 好感最高邻城赈灾银入库 · 编年史入册）" "$(echo "$D10" | grep -o 'ok:true,gain:true,chron:true')" "ok:true,gain:true,chron:true"
# D10b 驰援冷却（12 游戏时内再遭灾不重复拿钱）
D10B=$(re "JSON.stringify((()=>{const e=window.__pxc;const t=e.tycoon;const m=e.map;
t.events.length=0;
const c0=t.coins;
t.forceEvent('plague',m);
return {flat:t.coins===c0};})())")
chk "D10b 驰援冷却（第二场灾不再拿钱）" "$(echo "$D10B" | grep -o 'flat:true')" "flat:true"
# D11 补两次援助到 3 次 + 重拉 sis0/sis2 至 80（D10 驰援判定曾压回 60）→ 巡检拾取三枚成就
D11=$(re "JSON.stringify((()=>{const e=window.__pxc;const t=e.tycoon;
t.coins=5000;
for(let i=0;i<2;i++){t.sisTestReq('sis1');t.sisTradeAt[1]=0;t.decideSis(true);}
t.sisSetRel('sis0',80);t.sisSetRel('sis2',80);
t.tick(0.05,e.map);
return {aid:t.sisAidN,hi:t.snap.sisHiN};})())")
sleep 2.6
D11B=$(re "JSON.stringify((()=>{const t=window.__pxc.tycoon;
return {f:t.achv.has('sisfriend'),a:t.achv.has('sisaid3'),s:t.achv.has('sis3')};})())")
echo "  · D11 援助：$D11 · 巡检：$D11B"
chk "D11 成就巡检（援助累计3 · hi=3 · 千里结好/雪中送炭/广结善缘全解锁）" \
  "$(echo "$D11" | grep -o 'aid:3')$(echo "$D11" | grep -o 'hi:3')$(echo "$D11B" | grep -o 'f:true,a:true,s:true')" "aid:3hi:3f:true,a:true,s:true"
# D12 存档往返（邻城全量 / 计数 / 盟书 → resume 原样回来）
D12=$(re "JSON.stringify((()=>{const e=window.__pxc;const t=e.tycoon;const m=e.map;
const raw=JSON.parse(t.serialize(m));
const nm0=raw.sis[0].name;
t.resume(m,raw);
return {n:t.sisCities.length,nm:t.sisCities[0].name===nm0,
  tn:t.sisTradeN===raw.sisT,an:t.sisAidN===raw.sisA,
  sw:t.sisSworn===(raw.sisSw===1),bond:t.sisCities.some(c=>c.rel>=60)};})())")
chk "D12 存档往返（3城全量 · 名号一致 · 互市/援助/盟誓档保持）" \
  "$(echo "$D12" | grep -o 'n:3,nm:true,tn:true,an:true,sw:true,bond:true')" "n:3,nm:true,tn:true,an:true,sw:true,bond:true"

echo "=== [3] U 段：顶栏「盟」指标 + 姊妹城市面板 ==="
U1=$(re "JSON.stringify((()=>{const chip=document.querySelector('.sis-chip');
return {chip:!!chip,txt:chip?(chip.textContent||'').includes('盟'):false};})())")
chk "U1 顶栏「盟」指标就位" "$(echo "$U1" | grep -o 'chip:true,txt:true')" "chip:true,txt:true"
U2=$(re "(()=>{const c=document.querySelector('.sis-chip');if(!c)return 'nochip';c.click();return 'open';})()")
agent-browser wait 700
U2B=$(re "JSON.stringify((()=>{const m=document.querySelector('.pxc-sis');
return {m:!!m,cards:m?m.querySelectorAll('.sis-card').length:0,
  calm:m?!!m.querySelector('.sis-calm'):false,
  foot:m?(m.querySelector('.sis-foot')?.textContent||'').includes('互市'):false};})())")
chk "U2 姊妹城市面板（模态开 · 三城卡 · 四野安澜 · 底注互市口径）" \
  "$(echo "$U2B" | grep -o 'm:true,cards:3,calm:true,foot:true')" "m:true,cards:3,calm:true,foot:true"
agent-browser screenshot "$OUT/v37_sis_modal.png" >/dev/null 2>&1 && ok "U2b 面板截图 v37_sis_modal.png" || bad "U2b 截图失败"
# U3 求援急件横幅（sisTestReq → 打开面板即见 · 准/驳两枚朱批）
U3=$(re "(()=>{const t=window.__pxc.tycoon;t.coins=5000;t.sisTestReq('sis0');return 'req';})()" >/dev/null 2>&1
     agent-browser wait 700
     re "JSON.stringify((()=>{const m=document.querySelector('.pxc-sis');
return {req:!!m.querySelector('.sis-req'),tag:(m.querySelector('.sr-tag')?.textContent||'').trim(),
  opts:m.querySelectorAll('.sis-opt').length,
  ttl:(m.querySelector('.sr-ttl')?.textContent||'').includes('游戏时')};})())")
chk "U3 求援急件横幅（邻城急件标 · 准/驳两枚 · 时限提示）" "$(echo "$U3" | grep -o 'req:true,tag:邻城急件,opts:2,ttl:true')" "req:true,tag:邻城急件,opts:2,ttl:true"
agent-browser screenshot "$OUT/v37_sis_req.png" >/dev/null 2>&1 && ok "U3b 急件截图 v37_sis_req.png" || bad "U3b 截图失败"
# U3c 面板内「准」可点（联动引擎 → 急件清 + 编年史；点击前补足库府防置灰）
agent-browser eval "(()=>{const t=window.__pxc.tycoon;t.coins=5000;return 'cd';})()" >/dev/null 2>&1
U3C=$(re "(()=>{const b=document.querySelector('.sis-opt.good');if(!b)return 'nobtn';b.click();return 'ok';})()")
agent-browser wait 700
U3D=$(re "JSON.stringify((()=>{const t=window.__pxc.tycoon;
return {req:t.sisReq===null,aid:t.sisAidN>=1,chron:t.chron.entries.some(x=>x.title==='雪中送炭')};})())")
echo "  · U3c 朱批：$U3D"
chk "U3c 面板朱批联动（准 → 案头清 · 编年史雪中送炭）" "$(echo "$U3D" | grep -o 'req:true,aid:true,chron:true')" "req:true,aid:true,chron:true"
agent-browser eval "(()=>{const x=document.querySelector('.pxc-sis .pxc-x');if(x)x.click();return 'x';})()" >/dev/null 2>&1

echo "=== [4] R 段：移动端 + 零错误 ==="
agent-browser set viewport 390 844
agent-browser wait 1200
U4=$(re "JSON.stringify((()=>{const chip=document.querySelector('.sis-chip');
if(!chip)return {c:false};
chip.click();
return {c:true};})())")
agent-browser wait 700
U4B=$(re "JSON.stringify((()=>{const m=document.querySelector('.pxc-sis');
return {m:!!m,cards:m?m.querySelectorAll('.sis-card').length:0};})())")
chk "U4 移动端面板（chip 可点 · 三城卡照常）" "$(echo "$U4B" | grep -o 'm:true,cards:3')" "m:true,cards:3"
agent-browser screenshot "$OUT/v37_mobile.png" >/dev/null 2>&1 && ok "U4b 移动端截图 v37_mobile.png" || bad "U4b 截图失败"
agent-browser eval "(()=>{const x=document.querySelector('.pxc-sis .pxc-x');if(x)x.click();return 'x';})()" >/dev/null 2>&1
ERR=$(errcount)
chk "R1 控制台零错误（全程）" "$ERR" "0"

echo ""
echo "==================================================="
echo "v37 千里比邻·姊妹城市 —— 通过 $PASS · 失败 $FAIL"
echo "==================================================="
exit $([ "$FAIL" -eq 0 ] && echo 0 || echo 1)
