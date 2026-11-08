#!/bin/bash
# ============================================================
# v41_browser_test.sh — 轨道时代「地下铁」端到端验证
# S 段：bun 直测（常数/线网种子与续链/孤立站/交通加成/覆盖/幸福/成就任务）
# D 段：引擎流（空态/破土纪事/通勤圈收入 A/B 对照/覆盖与幸福/孤立车站/
#       任务成就/双事件/救赎成对/存档往返）
# U 段：轨 chip + 轨道交通模态 / 桌面与移动端截图
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

echo "=== [S] 纯函数直测（bun：常数 / 线网 / 加成 / 覆盖 / 成就任务） ==="
S=$(cd /home/z/my-project && bun -e '
import { METRO_CHAIN_R, METRO_SERVE_R, METRO_EARN_K, METRO_HAP_K, METRO_HAP_MAX,
  METRO_BONUS_MIN, METRO_BONUS_K, METRO_BONUS_MAX,
  metroNetOf, metroCovered, metroBonusOf, metroHapOf } from "./src/lib/pixelcity/metro.ts";
import { ACHIEVEMENTS, QUESTS, ECON, TECH_GATE, EVENT_TPLS } from "./src/lib/pixelcity/tycoon.ts";
import { CATALOG } from "./src/lib/pixelcity/catalog.ts";
// 线网：种子（车辆段 12 格内）+ 站站续链 + 孤立站
const d = [{ x: 0, y: 0 }];
const stops = [{ x: 5, y: 3 }, { x: 14, y: 6 }, { x: 40, y: 40 }, { x: 20, y: 10 }, { x: 30, y: 16 }];
const net = metroNetOf(d, stops);
const net2 = metroNetOf([], stops);   // 无车辆段 → 全不接入
const net3 = metroNetOf(d, []);       // 无车站 → 空网
const m1 = ACHIEVEMENTS.find(a => a.id === "metro1")!,
  m8 = ACHIEVEMENTS.find(a => a.id === "metro8")!,
  mC = ACHIEVEMENTS.find(a => a.id === "metroC")!;
const q = QUESTS.find(x => x.id === "metro1")!;
const dep = CATALOG.find(x => x.id === "metrodepot")!, stp = CATALOG.find(x => x.id === "metrostop")!;
const evA = EVENT_TPLS.filter(t => t.key === "signal" || t.key === "metrorush").length;
console.log(JSON.stringify({
  k: [METRO_CHAIN_R, METRO_SERVE_R, METRO_EARN_K, METRO_HAP_K, METRO_HAP_MAX].join(","),
  bk: [METRO_BONUS_MIN, METRO_BONUS_K, METRO_BONUS_MAX].join(","),
  net: [...net].sort((a, b) => a - b).join(","),
  iso: !net.has(2), noDepot: net2.size, noStops: net3.size,
  bon: [metroBonusOf(0), metroBonusOf(1), metroBonusOf(2), metroBonusOf(5), metroBonusOf(8)].join(","),
  cov: [metroCovered(5, 5, [{ x: 0, y: 0 }]), metroCovered(6, 0, [{ x: 0, y: 0 }])].join(","),
  hap: [metroHapOf(0), metroHapOf(3), metroHapOf(10)].join(","),
  ach: `${m1.name}${m1.goal}/${m8.name}${m8.goal}/${mC.name}${mC.goal}`,
  q: q.title + q.goal,
  econ: `${ECON.metrodepot.cost},${ECON.metrodepot.unlock},${ECON.metrostop.cost},${ECON.metrostop.unlock}`,
  gate: TECH_GATE.metrodepot + "/" + TECH_GATE.metrostop,
  cat: `${dep.w}x${dep.h}/${stp.w}x${stp.h}/${dep.variants}+${stp.variants}`,
  ev: evA,
}));' 2>&1 | tail -1 | stripq)
chk "S1 常数（链12 · 圈5 · 收入1.06 · 幸福1.2/7 · 交通2/5/20）" \
  "$(echo "$S" | grep -o 'k:12,5,1.06,1.2,7')" "k:12,5,1.06,1.2,7"
chk "S1b 交通加成参数（两站起算 · 每站5 · 至多20）" \
  "$(echo "$S" | grep -o 'bk:2,5,20')" "bk:2,5,20"
chk "S2 线网（种子0/3/4 + 续链1 · 孤立站2 不接入）" \
  "$(echo "$S" | grep -o 'net:0,1,3,4')" "net:0,1,3,4"
chk "S2b 孤立站排除（net 无 2 · 无车辆段/无车站空网）" \
  "$(echo "$S" | grep -o 'iso:true,noDepot:0,noStops:0')" "iso:true,noDepot:0,noStops:0"
chk "S3 交通加成（0/1 不计 · 2→10 · 5/8 封顶20）" \
  "$(echo "$S" | grep -o 'bon:0,0,10,20,20')" "bon:0,0,10,20,20"
chk "S4 通勤圈（切比 5 内 true · 6 外 false）" \
  "$(echo "$S" | grep -o 'cov:true,false')" "cov:true,false"
chk "S5 幸福加成（0→0 · 3 栋→4 · 10 栋封顶7）" \
  "$(echo "$S" | grep -o 'hap:0,4,7')" "hap:0,4,7"
chk "S6 成就三枚（首线通车1 / 四通八达8 / 轨道之城90）" \
  "$(echo "$S" | grep -o 'ach:首线通车1/四通八达8/轨道之城90')" "ach:首线通车1/四通八达8/轨道之城90"
chk "S7 任务（轨道时代 · goal 1）" "$(echo "$S" | grep -o 'q:轨道时代1')" "q:轨道时代1"
chk "S8 经济与门禁（车辆段2400/LV7 · 车站520/LV7 · 均需建筑工程学）" \
  "$(echo "$S" | grep -o 'econ:2400,7,520,7')" "econ:2400,7,520,7"
chk "S8b TECH_GATE（struct/struct）" "$(echo "$S" | grep -o 'gate:struct/struct')" "gate:struct/struct"
chk "S9 目录（车辆段3x3 · 车站2x2 · 变体 1+2）" \
  "$(echo "$S" | grep -o 'cat:3x3/2x2/1+2')" "cat:3x3/2x2/1+2"
chk "S10 事件双模板（信号故障 + 通勤高峰）" "$(echo "$S" | grep -o 'ev:2')" "ev:2"

echo "=== [1] 桌面端 1440×900 新档开局（脉冲人口造市民） ==="
agent-browser close >/dev/null 2>&1; sleep 1
agent-browser set viewport 1440 900
agent-browser open "$B" >/dev/null 2>&1
agent-browser wait --fn "window.__pxc!==undefined" --timeout 90000 >/dev/null 2>&1 && ok "引擎就绪" || bad "引擎超时"
agent-browser wait 3000
agent-browser eval "(()=>{const b=[...document.querySelectorAll('button')].filter(x=>(x.textContent||'').includes('跳过'));if(b.length)b[b.length-1].click();return 'tut';})()" >/dev/null 2>&1
agent-browser eval "(()=>{const t=window.__pxc.tycoon;const c=t.citz;c.mailTimer=99999;c.evTimer=99999;c.bdayTimer=99999;t.eventTimer=99999;t.cycTimer=99999;t.docNext=999999;t.sisGrowAt=99999;t.sisEvtAt=99999;t.revNext=99999999;return 'frozen';})()" >/dev/null 2>&1
agent-browser eval "(()=>{const t=window.__pxc.tycoon;let iv=null;iv=setInterval(()=>{t.pop=Math.min(64,t.pop+4)},250);setTimeout(()=>clearInterval(iv),2600);return 'pulsing';})()" >/dev/null 2>&1
agent-browser wait 3200

echo "=== [2] D 段：地铁线网与通勤圈引擎流 ==="
# D1 空态（无车辆段 · 无车站 · 未通车）
D1=$(re "JSON.stringify((()=>{const e=window.__pxc;const t=e.tycoon;t.tick(0.05,e.map);
const v=t.view().metro;
return {d:v.depots,s:v.stops,c:v.conn,b:v.bonus,h:v.hap};})())")
chk "D1 空态（无段 · 无站 · 未通车 · 零加成）" "$(echo "$D1" | grep -o 'd:0,s:0,c:0,b:0,h:0')" "d:0,s:0,c:0,b:0,h:0"
# D2 建车辆段 → 破土纪事
D2=$(re "JSON.stringify((()=>{const e=window.__pxc;const m=e.map;const t=e.tycoon;
const ok=m.place('metrodepot',0,115,115);
t.tick(0.05,m);t.tick(0.05,m);
const v=t.view().metro;
return {ok,d:v.depots,chron:t.chron.entries.some(x=>x.title==='地铁破土'&&x.tone==='good')};})())")
chk "D2 地铁破土（段1 · 编年史入册）" "$(echo "$D2" | grep -o 'ok:true,d:1,chron:true')" "ok:true,d:1,chron:true"
# D3 通勤圈收入 A/B 对照（两铺同源：圈内 ×1.06 · 圈外照旧 → 均值 ≈1.03）
D3=$(re "JSON.stringify((()=>{const e=window.__pxc;const m=e.map;const t=e.tycoon;
m.place('shop',0,121,121);m.place('shop',0,133,133);
t.tick(0.05,m);
const e0=t.snap.earnCom;
m.place('metrostop',0,120,118);   // 站1：车辆段 5 格（种子接入）；(121,121) 商铺落圈
t.tick(0.05,m);t.tick(0.05,m);
const e1=t.snap.earnCom;
m.place('metrostop',0,131,120);   // 站2：距段 16 格 > 12，靠站1 续链接入
t.tick(0.05,m);t.tick(0.05,m);
const e2=t.snap.earnCom;
const ratio=e0>0?e2/e0:0;
return {in:t.view().metro.in,out:t.view().metro.out,ratio:Math.round(ratio*1000)/1000,
  ok:ratio>1.01&&ratio<1.05};})())")
chk "D3 通勤圈收入（圈内 ×1.06 · 圈外照旧 · 合成均值 1.01-1.05 带）" \
  "$(echo "$D3" | grep -o 'ok:true')" "ok:true"
echo "  · D3 现场：$D3"
# D4 覆盖与幸福（4 栋住宅入圈 → 幸福 +4 · 覆盖率上升）
D4=$(re "JSON.stringify((()=>{const e=window.__pxc;const m=e.map;const t=e.tycoon;
let placed=0;
for(const [x,y] of [[117,117],[119,117],[117,119],[118,118]]){
  if(m.place('house',0,x,y))placed++;
}
t.tick(0.05,m);t.tick(0.05,m);
const av=t.metroTest();
return {placed,conn:av.conn,hap:av.hap,in:av.in};})())")
chk "D4 通勤圈幸福（入圈住宅 → +4 · 线网 2 站成线）" \
  "$(echo "$D4" | grep -o 'conn:2,hap:4')" "conn:2,hap:4"
echo "  · D4 现场：$D4"
# D5 孤立车站（第三座站远离车辆段与站 1/2 → 不通车 · 加成不变）
D5=$(re "JSON.stringify((()=>{const e=window.__pxc;const m=e.map;const t=e.tycoon;
const ok=m.place('metrostop',0,100,100);   // 距段/站均 > 12 → 孤立
t.tick(0.05,m);t.tick(0.05,m);
const v=t.view().metro;
return {ok,d:v.depots,s:v.stops,c:v.conn,b:v.bonus,gap:v.stops-v.conn};})())")
chk "D5 孤立车站（站3座 · 接入仍2 · 未接入1 · 加成不变）" \
  "$(echo "$D5" | grep -o 'ok:true,d:1,s:3,c:2,b:10,gap:1')" "ok:true,d:1,s:3,c:2,b:10,gap:1"
# D6 任务与成就（轨道时代 goal 达标 · 等成就巡检 → 首线通车解锁）
D6=$(re "JSON.stringify((()=>{const e=window.__pxc;const t=e.tycoon;t.tick(0.05,e.map);
const s=t.snap;
const qval=(s.metroDepots>0&&s.metroConn>=2)?1:0;
return {qval,achv8:t.achv.has('metro8'),achvC:t.achv.has('metroC')};})())")
chk "D6 任务口径（段>0 且接入≥2 → 1 · 其余成就未误解锁）" \
  "$(echo "$D6" | grep -o 'qval:1,achv8:false,achvC:false')" "qval:1,achv8:false,achvC:false"
sleep 2.6
D6b=$(re "JSON.stringify((()=>{const t=window.__pxc.tycoon;
return {a:t.achv.has('metro1'),b:t.achv.has('metro8'),c:t.achv.has('metroC')};})())")
chk "D6b 成就巡检（首线通车解锁 · 其余未达）" \
  "$(echo "$D6b" | grep -o 'a:true,b:false,c:false')" "a:true,b:false,c:false"
# D7 双事件（信号故障 / 通勤高峰）+ 市民史册反应
D7=$(re "JSON.stringify((()=>{const e=window.__pxc;const t=e.tycoon;
const okA=t.forceEvent('signal',e.map);const okB=t.forceEvent('metrorush',e.map);t.tick(0.05,e.map);
return {okA,okB,logA:t.eventLog.some(x=>x.name==='信号故障'),logB:t.eventLog.some(x=>x.name==='通勤高峰'),
  citz:t.citz.roster.some(c=>c.log.some(l=>l.text.includes('地铁')))};})())")
chk "D7 双事件（触发 · 日志入档 · 市民史册反应）" \
  "$(echo "$D7" | grep -o 'okA:true,okB:true,logA:true,logB:true,citz:true')" "okA:true,okB:true,logA:true,logB:true,citz:true"
# D8 救赎成对（补 24 栋建筑压低交通 → 车马为患真实翻转入册 → 重演通车 → 通途重开）
D8=$(re "JSON.stringify((()=>{const e=window.__pxc;const m=e.map;const t=e.tycoon;
let placed=0;
for(let y=112;y<144&&placed<24;y++)for(let x=112;x<144&&placed<24;x++){
  const i=m.idx(x,y);
  if(!m.objs.has(i)&&!m.road[i]&&t.ownedAt(x,y)&&m.place('park',0,x,y))placed++;
}
t.tick(0.05,m);t.tick(0.05,m);   // 交通跌破 40 且建筑 ≥30 → 车马为患入册（旗真实翻转）
const pain=t.chron.entries.some(x=>x.title==='车马为患');
t.metroLineSeen=false;t.tick(0.05,m);t.tick(0.05,m);   // 重演通车 → 通途重开（pain 已置位）
return {placed,pain,
  reopen:t.chron.entries.some(x=>x.title==='通途重开'&&x.tone==='good'),
  line2:t.chron.entries.filter(x=>x.title==='地铁首线通车').length};})())")
echo "  · D8 现场：$D8"
chk "D8 救赎成对（车马为患入册 · 通途重开 · 首线通车累计2笔）" \
  "$(echo "$D8" | grep -o 'placed:24,pain:true,reopen:true,line2:2')" "placed:24,pain:true,reopen:true,line2:2"
# D9 存档往返（接入数/覆盖派生复原 · 纪事旗不重记）
D9=$(re "JSON.stringify((()=>{const e=window.__pxc;const t=e.tycoon;const m=e.map;
const raw=JSON.parse(t.serialize(m));
const flags={D:raw.mtD,L:raw.mtL1,P:raw.mtP};
t.resume(m,raw);t.tick(0.05,m);t.tick(0.05,m);
const v=t.view().metro;
return {flags:flags.D+''+flags.L+''+flags.P,d:v.depots,s:v.stops,c:v.conn,
  line2:t.chron.entries.filter(x=>x.title==='地铁首线通车').length,
  reopen:t.chron.entries.filter(x=>x.title==='通途重开').length};})())")
echo "  · D9 现场：$D9"
chk "D9 存档往返（旗 111 · 线网复原 · 纪事不重记）" \
  "$(echo "$D9" | grep -o 'flags:111,d:1,s:3,c:2,line2:2,reopen:1')" "flags:111,d:1,s:3,c:2,line2:2,reopen:1"

echo "=== [3] U 段：轨道交通模态 ==="
U1=$(re "(()=>{const c=document.querySelector('.chip.metro-chip');
if(!c)return 'nochip';const on=c.classList.contains('metro-on');
const txt=(c.textContent||'').includes('轨');return JSON.stringify({on,txt});})()")
chk "U1 顶栏「轨」chip（通车点亮 · 字牌可辨）" "$(echo "$U1" | grep -o 'on:true,txt:true')" "on:true,txt:true"
agent-browser eval "(()=>{const c=document.querySelector('.chip.metro-chip');if(c)c.click();return 'open';})()" >/dev/null 2>&1
agent-browser wait 700
U2=$(re "JSON.stringify((()=>{const d=document.querySelector('.pxc-metro');
if(!d)return {m:false};
return {m:true,head:!!d.querySelector('.mt-head'),
  cards:d.querySelectorAll('.ms-card').length,
  warn:d.querySelectorAll('.ms-card.warn').length,
  bar:!!d.querySelector('.mt-bar i'),cover:(d.querySelector('.mh-cover')?.textContent||'').includes('80'),
  net:(d.querySelector('.mh-net')?.textContent||'').includes('运转中')};})())")
echo "  · U2 模态：$U2"
chk "U2 轨道交通（状态头 · 四卡 · 覆盖80% · 线网运转中 · 未接入警示卡）" \
  "$(echo "$U2" | grep -o 'm:true,head:true,cards:4,warn:1,bar:true,cover:true,net:true')" "m:true,head:true,cards:4,warn:1,bar:true,cover:true,net:true"
agent-browser eval "(()=>{const d=document.querySelector('.pxc-metro');if(d)d.scrollIntoView({block:'start'});return 'scrolled';})()" >/dev/null 2>&1
agent-browser wait 400 >/dev/null 2>&1
agent-browser screenshot "$OUT/v41_metro.png" >/dev/null 2>&1 && ok "U2b 轨道模态截图 v41_metro.png" || bad "U2b 截图失败"
agent-browser eval "(()=>{const d=document.querySelector('.pxc-metro .pxc-x');if(d)d.click();return 'x';})()" >/dev/null 2>&1
agent-browser eval "(()=>{const e=window.__pxc;e.setZoom(2);e.centerAt(118,118);return 'ok';})()" >/dev/null 2>&1
agent-browser wait 1200 >/dev/null 2>&1
agent-browser screenshot "$OUT/v41_city.png" >/dev/null 2>&1 && ok "U2c 全城截图 v41_city.png" || bad "U2c 截图失败"

echo "=== [4] R 段：移动端 + 零错误 ==="
agent-browser set viewport 390 844
agent-browser wait 1200
agent-browser eval "(()=>{const c=document.querySelector('.chip.metro-chip');if(c)c.click();return 'open';})()" >/dev/null 2>&1
agent-browser wait 700
U3=$(re "JSON.stringify((()=>{const d=document.querySelector('.pxc-metro');
if(!d)return {m:false};
const cards=d.querySelector('.mt-cards');
const two=cards?getComputedStyle(cards).gridTemplateColumns.split(' ').length===2:false;
const card=d.querySelector('.ms-card');const r=card?card.getBoundingClientRect():null;
const vw=document.documentElement.clientWidth;
return {m:true,two,fit:r?r.left>=-2&&r.right<=vw+2:false};})())")
chk "U3 移动端轨道模态（四卡 2 列 · 无横向溢出）" \
  "$(echo "$U3" | grep -o 'm:true,two:true,fit:true')" "m:true,two:true,fit:true"
agent-browser eval "(()=>{const d=document.querySelector('.pxc-metro');if(d)d.scrollIntoView({block:'start'});return 'scrolled';})()" >/dev/null 2>&1
agent-browser wait 400 >/dev/null 2>&1
agent-browser screenshot "$OUT/v41_mobile.png" >/dev/null 2>&1 && ok "U3b 移动端截图 v41_mobile.png" || bad "U3b 截图失败"
agent-browser eval "(()=>{const d=document.querySelector('.pxc-metro .pxc-x');if(d)d.click();return 'x';})()" >/dev/null 2>&1
ERR=$(errcount)
chk "R1 控制台零错误（全程）" "$ERR" "0"

echo ""
echo "==================================================="
echo "v41 轨道时代·地下铁 —— 通过 $PASS · 失败 $FAIL"
echo "==================================================="
exit $([ "$FAIL" -eq 0 ] && echo 0 || echo 1)
