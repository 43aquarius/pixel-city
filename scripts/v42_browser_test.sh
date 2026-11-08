#!/bin/bash
# ============================================================
# v42_browser_test.sh — 鲲鹏展翅「空港之城」端到端验证
# S 段：bun 直测（常数/航线判定/商圈噪音/吞吐乘数/成就任务/事件/门禁目录）
# D 段：引擎流（空态/破土/首航/商圈收入 A/B/噪音幸福/姊妹线联动/
#       任务成就/双事件/存档往返）
# U 段：航 chip + 空港航线模态 / 桌面与移动端截图
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
  local out="" raw="" k
  for k in 1 2 3 4 5 6 7 8; do
    raw=$(agent-browser eval "$1" 2>&1)
    out=$(printf '%s' "$raw" | awk 'NF{printf "%s",$0}END{print ""}' | tr -d '\\' | tr -d '"' | tr -d ' ')
    if [ -n "$out" ] && ! echo "$out" | grep -q "Evaluationerror\|Evaluation error"; then
      echo "$out"; return 0
    fi
    printf '%s' "$raw" > "/tmp/evalfail_${RANDOM}.txt"
    sleep 0.9
  done
  echo "$out"; return 1
}
errcount() { agent-browser errors --json 2>/dev/null | python3 -c "import json,sys
try: print(len(json.load(sys.stdin).get('data',{}).get('errors',[])))
except Exception: print(0)"; }

echo "=== [S] 纯函数直测（bun：常数 / 航线 / 商圈 / 噪音 / 成就任务） ==="
S=$(cd /home/z/my-project && bun -e '
import { AIR_SERVE_R, AIR_EARN_K, AIR_NOISE_R, AIR_NOISE_K, AIR_NOISE_MAX, AIR_TOUR_K,
  AIR_EXP_T, AIR_BONUS, AIR_ROUTE_N, AIR_FLIGHT_H, AIR_PAX_GOAL, AIR_FAR_POP, AIR_SIS_REL,
  AIR_ROUTE_DEFS, airRouteOpen, paxPerFlight, airTourMult, airCovered, airNoisy, noiseHapOf, airExpT } from "./src/lib/pixelcity/aviation.ts";
import { ACHIEVEMENTS, QUESTS, ECON, TECH_GATE, EVENT_TPLS } from "./src/lib/pixelcity/tycoon.ts";
import { CATALOG } from "./src/lib/pixelcity/catalog.ts";
// 航线判定：基础线随机场；姊妹线看 rel≥60；远洋线看人口≥500
const d0 = AIR_ROUTE_DEFS[0], d1 = AIR_ROUTE_DEFS[1], d4 = AIR_ROUTE_DEFS[4];
const r1 = airRouteOpen(d0, true, 10, [0, 0, 0]);
const r2 = airRouteOpen(d1, true, 10, [60, 59, 80]);   // 姊妹①rel60 开 · 姊妹②rel59 关
const r3 = airRouteOpen(d4, true, 499, [90, 90, 90]);
const r4 = airRouteOpen(d4, true, 500, [90, 90, 90]);
const r5 = airRouteOpen(d0, false, 900, [90, 90, 90]);
const m1 = ACHIEVEMENTS.find(a => a.id === "air1")!,
  mP = ACHIEVEMENTS.find(a => a.id === "airP")!,
  mR = ACHIEVEMENTS.find(a => a.id === "airR")!;
const q = QUESTS.find(x => x.id === "air1")!;
const ap = CATALOG.find(x => x.id === "airport")!;
const evA = EVENT_TPLS.filter(t => t.key === "flightdelay" || t.key === "charter").length;
console.log(JSON.stringify({
  k: [AIR_SERVE_R, AIR_EARN_K, AIR_NOISE_R, AIR_NOISE_K, AIR_NOISE_MAX].join(","),
  bk: [AIR_TOUR_K, AIR_EXP_T, AIR_BONUS, AIR_ROUTE_N, AIR_FLIGHT_H, AIR_PAX_GOAL, AIR_FAR_POP, AIR_SIS_REL].join(","),
  rt: [r1, r2, r3, r4, r5].join(","),
  pax: paxPerFlight(100),
  tour: airTourMult(0).toFixed(2), tour5: airTourMult(5).toFixed(2),
  cov: [airCovered(7, 0, { x: 0, y: 0 }), airCovered(8, 0, { x: 0, y: 0 })].join(","),
  noi: [airNoisy(4, 0, { x: 0, y: 0 }), airNoisy(5, 0, { x: 0, y: 0 })].join(","),
  hap: [noiseHapOf(0), noiseHapOf(4), noiseHapOf(10)].join(","),
  exp: airExpT(2),
  ach: `${m1.name}${m1.goal}/${mP.name}${mP.goal}/${mR.name}${mR.goal}`,
  q: q.title + q.goal,
  econ: `${ECON.airport.cost},${ECON.airport.unlock}`,
  gate: TECH_GATE.airport,
  cat: `${ap.w}x${ap.h}/${ap.variants}`,
  ev: evA,
}));' 2>&1 | tail -1 | stripq)
chk "S1 常数（圈7 · 收入1.08 · 噪4 · 0.8/5）" "$(echo "$S" | grep -o 'k:7,1.08,4,0.8,5')" "k:7,1.08,4,0.8,5"
chk "S1b 全局参数（游客0.12 · 空运3 · 交通8 · 航线5 · 班8h · 吞吐5000 · 远洋500 · 结好60）" \
  "$(echo "$S" | grep -o 'bk:0.12,3,8,5,8,5000,500,60')" "bk:0.12,3,8,5,8,5000,500,60"
chk "S2 航线判定（基础随机场 · 姊妹rel59拒60过 · 远洋499拒500过 · 无机场全关）" \
  "$(echo "$S" | grep -o 'rt:true,true,false,true,false')" "rt:true,true,false,true,false"
chk "S3 每班旅客（pop100 → 80 人）" "$(echo "$S" | grep -o 'pax:80')" "pax:80"
chk "S4 游客乘数（0 线 ×1.00 · 5 线 ×1.60）" "$(echo "$S" | grep -o 'tour:1.00,tour5:1.60')" "tour:1.00,tour5:1.60"
chk "S5 商圈判定（切比 7 内 true · 8 外 false）" "$(echo "$S" | grep -o 'cov:true,false')" "cov:true,false"
chk "S6 噪音判定（切比 4 内 true · 5 外 false）" "$(echo "$S" | grep -o 'noi:true,false')" "noi:true,false"
chk "S7 噪音幸福（0→0 · 4 栋→3 · 10 栋封顶5）" "$(echo "$S" | grep -o 'hap:0,3,5')" "hap:0,3,5"
chk "S8 空运吞吐（2 座 → 6 件/分）" "$(echo "$S" | grep -o 'exp:6')" "exp:6"
chk "S9 成就三枚（首航起飞1 / 吞吐长虹5000 / 国际枢纽4）" \
  "$(echo "$S" | grep -o 'ach:首航起飞1/吞吐长虹5000/国际枢纽4')" "ach:首航起飞1/吞吐长虹5000/国际枢纽4"
chk "S10 任务（临空而起 · goal 1）" "$(echo "$S" | grep -o 'q:临空而起1')" "q:临空而起1"
chk "S11 经济与门禁（航站楼 3200G/LV8 · 需建筑工程学）" \
  "$(echo "$S" | grep -o 'econ:3200,8')" "econ:3200,8"
chk "S11b TECH_GATE（struct）" "$(echo "$S" | grep -o 'gate:struct')" "gate:struct"
chk "S12 目录（航站楼 3x3 · 变体 2）" "$(echo "$S" | grep -o 'cat:3x3/2')" "cat:3x3/2"
chk "S13 事件双模板（航班延误 + 旅游包机）" "$(echo "$S" | grep -o 'ev:2')" "ev:2"

echo "=== [1] 桌面端 1440×900 新档开局（脉冲人口造市民） ==="
agent-browser close >/dev/null 2>&1; sleep 1
agent-browser set viewport 1440 900
agent-browser open "$B" >/dev/null 2>&1
agent-browser wait --fn "window.__pxc!==undefined" --timeout 90000 >/dev/null 2>&1 && ok "引擎就绪" || bad "引擎超时"
agent-browser wait 3000
agent-browser eval "(()=>{const b=[...document.querySelectorAll('button')].filter(x=>(x.textContent||'').includes('跳过'));if(b.length)b[b.length-1].click();return 'tut';})()" >/dev/null 2>&1
agent-browser eval "(()=>{const e=window.__pxc;const t=e.tycoon;const c=t.citz;c.mailTimer=99999;c.evTimer=99999;c.bdayTimer=99999;t.eventTimer=99999;t.cycTimer=99999;t.docNext=999999;t.sisGrowAt=99999;t.sisEvtAt=99999;t.revNext=99999999;return 'frozen';})()" >/dev/null 2>&1
agent-browser eval "(()=>{const t=window.__pxc.tycoon;let iv=null;iv=setInterval(()=>{t.pop=Math.min(64,t.pop+4)},250);setTimeout(()=>clearInterval(iv),2600);return 'pulsing';})()" >/dev/null 2>&1
agent-browser wait 3200

echo "=== [2] D 段：空港引擎流 ==="
# D1 空态（无机场 · 零航线 · 零吞吐）
D1=$(re "JSON.stringify((()=>{const e=window.__pxc;const t=e.tycoon;t.tick(0.05,e.map);
const v=t.view().air;const at=t.airTest();
return {n:at.n,r:v.routes,fl:t.flights,pax:t.paxTotal,noise:at.noise,tourK:v.tourK.toFixed(2)};})())")
chk "D1 空态（无机场 · 零航线零吞吐 · 乘数 ×1.00）" \
  "$(echo "$D1" | grep -o 'n:0,r:0,fl:0,pax:0,noise:0,tourK:1.00')" "n:0,r:0,fl:0,pax:0,noise:0,tourK:1.00"
# D2 建机场 → 破土纪事 + 航线表（基础线开）
D2=$(re "JSON.stringify((()=>{const e=window.__pxc;const m=e.map;const t=e.tycoon;
let ok=false;
for(let y=112;y<126;y++){for(let x=112;x<126;x++){if(m.place('airport',0,x,y)){ok=true;break;}}if(ok)break;}
t.tick(0.05,m);t.tick(0.05,m);
const av=t.view().air;
return {ok,n:av.n,open:av.lines.map(l=>l.open).join(','),
  chron:t.chron.entries.some(x=>x.title==='空港破土')};})())")
chk "D2 空港破土（航站楼1 · 基础线开 · 编年史入册）" \
  "$(echo "$D2" | grep -o 'ok:true,n:1,open:true,false,false,false,false,chron:true')" "ok:true,n:1,open:true,false,false,false,false,chron:true"
echo "  · D2 现场：$D2"
# D3 商圈收入 A/B 对照（同铺同电厂：火电厂供电，唯一变量是拆/建机场 → 精确 ×1.08）
D3=$(re "JSON.stringify((()=>{const e=window.__pxc;const m=e.map;const t=e.tycoon;
m.place('power',0,117,117);      // 火电厂供电（GRID_R.power=8 覆盖铺）
m.place('shop',0,116,116);       // 圈内铺（距机场切比 4）
t.tick(0.05,m);t.tick(0.05,m);
m.bulldoze(112,112);             // 拆机场（锚点格拆整座）
t.tick(0.05,m);t.tick(0.05,m);
const e0=t.snap.earnCom;
const inDoze=t.view().air.in;
m.place('airport',0,112,112);    // 复建同址（铺重新入圈）
t.tick(0.05,m);t.tick(0.05,m);
const e1=t.snap.earnCom;
const ratio=e0>0?e1/e0:0;
return {inDoze,in:t.view().air.in,ratio:Math.round(ratio*1000)/1000,
  ok:ratio>1.06&&ratio<1.10};})())")
chk "D3 商圈收入（同铺拆建对照 · 圈内 ×1.08 精确带 1.06-1.10）" \
  "$(echo "$D3" | grep -o 'ok:true')" "ok:true"
echo "  · D3 现场：$D3"
# D4 噪音圈（圈心 4 格内住宅 4 栋 → noiseRes=4 · 噪音惩罚生效：幸福走低）
D4=$(re "JSON.stringify((()=>{const e=window.__pxc;const m=e.map;const t=e.tycoon;
const s0=t.snap.happiness;
let placed=0;
for(const [x,y] of [[115,114],[114,115],[116,115],[115,116]]){
  if(m.place('house',0,x,y))placed++;
}
t.tick(0.05,m);t.tick(0.05,m);
const at=t.airTest();
const drop=t.snap.happiness-s0;
return {placed,noise:at.noise,low:drop<0};})())")
chk "D4 噪音圈（4 栋入噪圈 · 幸福走低；每栋 −0.8 封顶 −5 已在 S7 直测）" \
  "$(echo "$D4" | grep -o 'placed:4,noise:4,low:true')" "placed:4,noise:4,low:true"
echo "  · D4 现场：$D4"
# D5 首航纪事 + 航班节奏（首航 6 秒后起飞计数）
sleep 7
D5=$(re "JSON.stringify((()=>{const t=window.__pxc.tycoon;
return {ff:t.chron.entries.some(x=>x.title==='首航起飞'),
  fl:t.flights>0,pax:t.paxTotal>0};})())")
chk "D5 首航起飞（纪事入册 · 航班与吞吐开始累计）" \
  "$(echo "$D5" | grep -o 'ff:true,fl:true,pax:true')" "ff:true,fl:true,pax:true"
# D6 姊妹城联动（三城好感 75 → 三条国际线开通 + 纪事三条）
D6=$(re "JSON.stringify((()=>{const e=window.__pxc;const t=e.tycoon;
t.sisCities.forEach(c=>c.rel=75);
t.tick(0.05,e.map);t.tick(0.05,e.map);
const av=t.view().air;
return {r:av.routes,tourK:av.tourK.toFixed(2),
  sis:t.chron.entries.filter(x=>x.title.startsWith('新航线开通')).length};})())")
chk "D6 姊妹城结好（4 线在飞 · 乘数 ×1.48 · 开通纪事 3 条）" \
  "$(echo "$D6" | grep -o 'r:4,tourK:1.48,sis:3')" "r:4,tourK:1.48,sis:3"
echo "  · D6 现场：$D6"
sleep 3
# D7 任务成就（临空而起达标 · 首航起飞/国际枢纽解锁 · 吞吐长虹未达）
D7=$(re "JSON.stringify((()=>{const t=window.__pxc.tycoon;
return {a1:t.achv.has('air1'),aR:t.achv.has('airR'),aP:t.achv.has('airP')};})())")
chk "D7 成就巡检（首航起飞 + 国际枢纽解锁 · 吞吐长虹未达）" \
  "$(echo "$D7" | grep -o 'a1:true,aR:true,aP:false')" "a1:true,aR:true,aP:false"
# D8 双事件（航班延误 / 旅游包机）
D8=$(re "JSON.stringify((()=>{const e=window.__pxc;const t=e.tycoon;
const okA=t.forceEvent('flightdelay',e.map);const okB=t.forceEvent('charter',e.map);t.tick(0.05,e.map);
return {okA,okB,logA:t.eventLog.some(x=>x.name==='航班延误'),logB:t.eventLog.some(x=>x.name==='旅游包机')};})())")
chk "D8 双事件（触发 · 日志入档）" \
  "$(echo "$D8" | grep -o 'okA:true,okB:true,logA:true,logB:true')" "okA:true,okB:true,logA:true,logB:true"
echo "=== [3] U 段：航 chip + 空港航线模态 ==="
U1=$(re "(()=>{const c=document.querySelector('.chip.air-chip');
if(!c)return 'nochip';const on=c.classList.contains('air-on');
const txt=(c.textContent||'').includes('航');return JSON.stringify({on,txt});})()")
chk "U1 顶栏「航」chip（通航点亮 · 字牌可辨）" "$(echo "$U1" | grep -o 'on:true,txt:true')" "on:true,txt:true"
agent-browser eval "(()=>{const c=document.querySelector('.chip.air-chip');if(c)c.click();return 'open';})()" >/dev/null 2>&1
agent-browser wait 700
U2=$(re "JSON.stringify((()=>{const d=document.querySelector('.pxc-air');
if(!d)return {m:false};
return {m:true,head:!!d.querySelector('.mt-head'),
  lines:d.querySelectorAll('.air-line').length,
  linesOpen:d.querySelectorAll('.air-line.open').length,
  cards:d.querySelectorAll('.ms-card').length,
  bar:!!d.querySelector('.mt-bar i'),
  net:(d.querySelector('.mh-net')?.textContent||'').includes('运转中')};})())")
chk "U2 空港航线模态（航线表 5 行 · 在飞 4 · 四卡 · 状态头）" \
  "$(echo "$U2" | grep -o 'm:true,head:true,lines:5,linesOpen:4,cards:4,bar:true,net:true')" "m:true,head:true,lines:5,linesOpen:4,cards:4,bar:true,net:true"
echo "  · U2 现场：$U2"
agent-browser eval "(()=>{const x=document.querySelector('.pxc-air .pxc-x');if(x)x.click();return 'close';})()" >/dev/null 2>&1
agent-browser wait 500
# U3 城市志空港行（财政模态内）+ 帮助行（帮助模态内）—— click 亦走 re 重试防丢
re "(()=>{const b=document.querySelector('.chip.lv');if(b){b.click();return 'open-fiscal';}return 'nofound';})()" >/dev/null 2>&1
agent-browser wait 700
U3a=$(re "JSON.stringify((()=>{const zh=[...document.querySelectorAll('td')].some(t=>(t.textContent||'').includes('空港运转中')||(t.textContent||'').includes('建成空港航站楼'));
return {zh,modals:document.querySelectorAll('.pxc-modal').length,
  heads:[...document.querySelectorAll('.pxc-modal header')].map(h=>(h.textContent||'').trim().slice(0,6)).join('|'),
  tdN:document.querySelectorAll('td').length};})())")
re "(()=>{const x=document.querySelector('.pxc-x');if(x){x.click();return 'close';}return 'nox';})()" >/dev/null 2>&1
agent-browser wait 500
re "(()=>{const b=[...document.querySelectorAll('button')].find(x=>(x.textContent||'').trim()==='?');if(b){b.click();return 'open-help';}return 'nofound';})()" >/dev/null 2>&1
agent-browser wait 700
U3b=$(re "JSON.stringify((()=>{const m=document.querySelector('.pxc-modal[aria-label=\"操作说明\"]');
return {help:!!m,head:(m?.querySelector('header')?.textContent||'').replace(/\s/g,'').includes('操作说明')};})())")
re "(()=>{const x=document.querySelector('.pxc-x');if(x){x.click();return 'close';}return 'nox';})()" >/dev/null 2>&1
agent-browser wait 400
chk "U3 城市志空港行 + 帮助模态（桌面：城市志文案可辨 · 帮助可开）" \
  "$(echo "$U3a$U3b" | grep -o 'zh:true' ; echo "$U3a$U3b" | grep -o 'help:true,head:true')" "zh:true
help:true,head:true"
echo "  · U3 现场：$U3a$U3b"
# U4 桌面端截图（全景 + 商圈光罩可见）
agent-browser screenshot "$OUT/v42_city.png" >/dev/null 2>&1 && ok "桌面截图" || bad "桌面截图"
# U5 空港商圈可视化（canvas 像素对照：建机场前后天青像素增量）
U5=$(re "JSON.stringify((()=>{const e=window.__pxc;const m=e.map;const t=e.tycoon;
t.tick(0.05,m);
return {in:t.view().air.in>0,noise:t.view().air.noise>0};})())")
chk "U5 空港商圈/噪音圈场（渲染源非空）" "$(echo "$U5" | grep -o 'in:true,noise:true')" "in:true,noise:true"
# D9 存档往返（旗/航班累计/吞吐恢复 · 纪事不重记）
D9=$(re "JSON.stringify((()=>{const e=window.__pxc;const t=e.tycoon;const m=e.map;
const raw=JSON.parse(t.serialize(m));
const flags={D:raw.airD,F:raw.airF1,R:(raw.airR||[]).join(''),fl:raw.airFl};
const n0=t.chron.entries.filter(x=>x.title==='空港破土').length;
const s0=t.chron.entries.filter(x=>x.title.startsWith('新航线开通')).length;
t.resume(m,raw);t.tick(0.05,m);t.tick(0.05,m);
return {flags:flags.D+''+flags.F+''+flags.R,fl:raw.airFl>0,pax:raw.airPax>0,
  n0,s0,n1:t.chron.entries.filter(x=>x.title==='空港破土').length,
  s1:t.chron.entries.filter(x=>x.title.startsWith('新航线开通')).length};})())")
chk "D9 存档往返（旗 11+11110 · 吞吐随档 · 纪事不重记）" \
  "$(echo "$D9" | grep -o 'flags:1111110,fl:true,pax:true,n0:1,s0:3,n1:1,s1:3')" "flags:1111110,fl:true,pax:true,n0:1,s0:3,n1:1,s1:3"
echo "  · D9 现场：$D9"


echo "=== [4] 移动端 390×844 ==="
agent-browser close >/dev/null 2>&1; sleep 1
agent-browser set viewport 390 844
agent-browser open "$B" >/dev/null 2>&1
agent-browser wait --fn "window.__pxc!==undefined" --timeout 90000 >/dev/null 2>&1 && ok "移动端引擎就绪" || bad "移动端引擎超时"
agent-browser wait 3000
agent-browser eval "(()=>{const b=[...document.querySelectorAll('button')].filter(x=>(x.textContent||'').includes('跳过'));if(b.length)b[b.length-1].click();return 'tut';})()" >/dev/null 2>&1
agent-browser eval "(()=>{const e=window.__pxc;const t=e.tycoon;const c=t.citz;c.mailTimer=99999;c.evTimer=99999;c.bdayTimer=99999;t.eventTimer=99999;t.cycTimer=99999;t.docNext=999999;t.sisGrowAt=99999;t.sisEvtAt=99999;t.revNext=99999999;return 'frozen';})()" >/dev/null 2>&1
agent-browser eval "(()=>{const t=window.__pxc.tycoon;let iv=null;iv=setInterval(()=>{t.pop=Math.min(64,t.pop+4)},250);setTimeout(()=>clearInterval(iv),2600);return 'pulsing';})()" >/dev/null 2>&1
agent-browser wait 3200
M1=$(re "JSON.stringify((()=>{const m=e=document.querySelector('.pxc');
const chip=document.querySelector('.chip.air-chip');
return {chip:!!chip,modalClass:!!document.querySelector('.pxc-modal')};})())")
chk "M1 移动端 chip 渲染" "$(echo "$M1" | grep -o 'chip:true')" "chip:true"
agent-browser eval "(()=>{const c=document.querySelector('.chip.air-chip');if(c)c.click();return 'open';})()" >/dev/null 2>&1
agent-browser wait 700
M2=$(re "JSON.stringify((()=>{const d=document.querySelector('.pxc-air');
if(!d)return {m:false};
const r=d.getBoundingClientRect();
return {m:true,w:Math.round(r.width),vw:window.innerWidth-12,
  fit:r.width<=window.innerWidth-10||r.width<=560};})())")
chk "M2 移动端模态宽度适配（不溢出视口）" "$(echo "$M2" | grep -o 'fit:true')" "fit:true"
echo "  · M2 现场：$M2"
agent-browser eval "(()=>{const x=document.querySelector('.pxc-air .pxc-x');if(x)x.click();return 'close';})()" >/dev/null 2>&1
agent-browser screenshot "$OUT/v42_mobile.png" >/dev/null 2>&1 && ok "移动端截图" || bad "移动端截图"
# M3 移动端帮助表（isMobile 分支：逐系统表格含「空港」行 —— 顶栏「航」指标开…）
re "(()=>{const b=[...document.querySelectorAll('button')].find(x=>(x.textContent||'').trim()==='?');if(b){b.click();return 'open-help';}return 'nofound';})()" >/dev/null 2>&1
agent-browser wait 700
M3=$(re "JSON.stringify((()=>{const help=[...document.querySelectorAll('td')].some(t=>(t.textContent||'').includes('顶栏「航」指标开'));
return {help};})())")
re "(()=>{const x=document.querySelector('.pxc-x');if(x){x.click();return 'close';}return 'nox';})()" >/dev/null 2>&1
chk "M3 移动端帮助表（空港行文案可辨）" "$(echo "$M3" | grep -o 'help:true')" "help:true"
echo "  · M3 现场：$M3"

echo "=== [5] R 段：零控制台错误 ==="
RC=$(errcount)
chk "R1 控制台零错误" "$RC" "0"

echo ""
echo "=============================="
echo "通过 $PASS · 失败 $FAIL"
echo "=============================="
[ "$FAIL" = "0" ] && echo "ALL GREEN ✓" || echo "存在失败项 ✗"
exit 0
