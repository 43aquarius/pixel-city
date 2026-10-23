#!/bin/bash
# ============================================================
# v23_browser_test.sh — 治安空间化「守望相助·平安之城」端到端验证
# 布局（已购领地 112-143，cityhall 锚点 127,127 占 127-128²，道路 y=126/127/128）：
#   S0 初始：无商铺/住宅 → secCover=100（分母 0 守护）/ crimeN=0
#   S1 两商铺：A(121,121) 距 cityhall 6 > R3 盲区；B(129,129) 距 2 覆盖
#   S2 交班(119,119) R3 圈 A：同帧收入对照（拆/建之间两拍，覆盖/盲区比值 ≈1.04）
#   S3 拆交班 + 四远铺 (112,141)(114,141)(116,141)(118,141)（预埋道路 y=140）
#      → crimeN=5 → 编年史「盗贼横行」入册（bad）
#   S4 警察局(123,133) 2×2 R6 + 交班(119,119) 复位 + 远宅(112,137)
#      → crimeN=4（远铺）/ patrolCap=3（交班1+警察局2）
#   S5 forceEvent('crime') → 事件激活 + 金币损失 + 出警巡逻车（kind 11 mission）
#   S6 resolveEvent('crime') → rescuePolice=1 + 编年史「神速擒贼」
#   S7 破案循环 ×4 → rescuePolice=5 → 成就「神探手记」
#   S8 交班(115,138) R3 盖四远铺+远宅 → cover=100 → 编年史「夜不闭户」
#   S9 成就 nightSafe（pop=300 逼触发，防人口回落跌破 100）
#   N 段：心声命中（crime>0）+ citzVoice() 回归 + 市民失窃反应
#   R 段：南郊商街盲区截图 + 存档往返 + 零错误 + 双端截图
# ============================================================
set -u
B=http://localhost:3000
OUT=/home/z/my-project/scripts
PASS=0; FAIL=0
ok()   { echo "  ✓ $1"; PASS=$((PASS+1)); }
bad()  { echo "  ✗ $1"; FAIL=$((FAIL+1)); }
chk()  { if [ "$2" = "$3" ]; then ok "$1 ($2)"; else bad "$1 (got=$2 want=$3)"; fi }
chkge() { if [ "${2%.*}" -ge "$3" ] 2>/dev/null; then ok "$1 ($2 >= $3)"; else bad "$1 (got=$2 want>=$3)"; fi }
stripq() { tr -d '\\' | tr -d '"' | tr -d ' '; }
errcount() { agent-browser errors --json 2>/dev/null | python3 -c "import json,sys
try: print(len(json.load(sys.stdin).get('data',{}).get('errors',[])))
except Exception: print(0)"; }

echo "=== [1] 桌面端 1440×900 新档开局 ==="
agent-browser close >/dev/null 2>&1; sleep 1
agent-browser set viewport 1440 900
agent-browser open $B
agent-browser storage local clear >/dev/null 2>&1
agent-browser reload
agent-browser wait --fn "window.__pxc!==undefined" --timeout 90000 && ok "引擎就绪" || bad "引擎超时"
agent-browser wait 3000
agent-browser eval "(()=>{const b=[...document.querySelectorAll('button')].filter(x=>(x.textContent||'').includes('跳过'));if(b.length)b[b.length-1].click();return 'tut';})()" >/dev/null 2>&1
# 道路网：主干道 y=126/127/128 + 南下支线 x=113（y=128..140）+ 商街道路 y=140（x=112..121）
# + 警察局支线 x=122（y=128..135，供出警车驶向南郊商街）
agent-browser eval "(()=>{const e=window.__pxc;const t=e.tycoon;t.level=9;t.coins=30000;
for(let x=112;x<=136;x++){e.map.setRoad(x,126,true);e.map.setRoad(x,127,true);e.map.setRoad(x,128,true);}
for(let y=128;y<=140;y++)e.map.setRoad(113,y,true);
for(let x=112;x<=121;x++)e.map.setRoad(x,140,true);
for(let y=128;y<=135;y++)e.map.setRoad(122,y,true);
return 'roads';})()" >/dev/null 2>&1

echo "=== [2] S 段：巡防覆盖判定 ==="
# S0：初始态（无商铺/住宅 → 分母 0 守护）
S0=$(agent-browser eval "JSON.stringify((()=>{const e=window.__pxc;const t=e.tycoon;
t.tick(0.05,e.map);const v=t.view();
return {cover:v.secCover,inn:v.secIn,out:v.secOut,crime:v.crimeN,hq:v.policehqN};})())" 2>/dev/null | grep -m1 . | stripq)
chk "S0 初始无商铺住宅 cover=100 / crime=0" "$(echo "$S0" | grep -o 'cover:[0-9]*,inn:[0-9]*,out:[0-9]*,crime:[0-9]*')" "cover:100,inn:0,out:0,crime:0"
# S1：A(121,121) 距 cityhall 6 盲区；B(129,129) 距 2 覆盖（市政厅附设驻警 R3）
S1=$(agent-browser eval "JSON.stringify((()=>{const e=window.__pxc;const t=e.tycoon;
const a=e.map.place('shop',0,121,121);const b=e.map.place('shop',1,129,129);
t.tick(0.05,e.map);const v=t.view();
return {a:a&&b,cover:v.secCover,inn:v.secIn,out:v.secOut,crime:v.crimeN,
  gA:t.secField.has(e.map.idx(121,121)),gB:t.secField.has(e.map.idx(129,129)),
  cA:t.crimeComField.has(e.map.idx(121,121))};})())" 2>/dev/null | grep -m1 . | stripq)
if [ "$(echo "$S1" | grep -o 'a:[a-z]*')" = "a:true" ]; then ok "S1a 两商铺建成（A 盲区 / B 覆盖）"; else bad "S1a 建造失败 ($S1)"; fi
chk "S1b cover=50 / in=1 / out=1 / crime=1（市政厅驻警 R3）" "$(echo "$S1" | grep -o 'cover:[0-9]*,inn:[0-9]*,out:[0-9]*,crime:[0-9]*')" "cover:50,inn:1,out:1,crime:1"
chk "S1c 场归属（sec∋B / crimeCom∋A）" "$(echo "$S1" | grep -o 'gA:[a-z]*,gB:[a-z]*,cA:[a-z]*')" "gA:false,gB:true,cA:true"
# S2：交班(119,119) R3 圈住 A → 同帧两拍收入对照（覆盖拍 / 盲区拍；比值被 B 稀释 → ≈1.04）
S2=$(agent-browser eval "JSON.stringify((()=>{const e=window.__pxc;const t=e.tycoon;
const k=e.map.place('koban',0,119,119);
t.tick(0.05,e.map);const e0=t.snap.earnCom;
e.map.bulldoze(119,119);
t.tick(0.05,e.map);const e1=t.snap.earnCom;
e.map.place('koban',0,119,119);
t.tick(0.05,e.map);const v=t.view();
return {k,cover:v.secCover,crime:v.crimeN,gA:t.secField.has(e.map.idx(121,121)),
  cov:e0,blind:e1,ratio:Math.round(e0/Math.max(0.01,e1)*1000)/1000};})())" 2>/dev/null | grep -m1 . | stripq)
if [ "$(echo "$S2" | grep -o 'k:[a-z]*')" = "k:true" ]; then ok "S2a 交班建成（R3 圈住 A）→ 拆/建两拍对照"; else bad "S2a 建造失败 ($S2)"; fi
chk "S2b A 转覆盖：cover=100 / crime=0" "$(echo "$S2" | grep -o 'cover:[0-9]*,crime:[0-9]*')" "cover:100,crime:0"
chk "S2c 场归属（sec∋A）" "$(echo "$S2" | grep -o 'gA:[a-z]*')" "gA:true"
RATIO=$(echo "$S2" | grep -o 'ratio:[0-9.]*' | cut -d: -f2)
if [ -n "$RATIO" ] && python3 -c "exit(0 if 1.03<=$RATIO<=1.07 else 1)" 2>/dev/null; then ok "S2d 盲区收入打折验证（覆盖/盲区=${RATIO}，理论 8.4/8.064≈1.042）"; else bad "S2d 比值异常 (ratio=$RATIO)"; fi
# S3：拆交班 + 四远铺（y=141 商街，邻路 y=140）→ crimeN=5 → 盗贼横行
S3=$(agent-browser eval "JSON.stringify((()=>{const e=window.__pxc;const t=e.tycoon;
e.map.bulldoze(119,119);
const h=[[112,141],[114,141],[116,141],[118,141]].map(([x,y])=>e.map.place('shop',0,x,y)).every(Boolean);
t.tick(0.05,e.map);const v=t.view();
const x=[...t.chron.entries].find(y=>y.title==='盗贼横行');
return {h,cover:v.secCover,crime:v.crimeN,
  mile:x?('tone:'+x.tone+'|cat:'+x.cat):'none'};})())" 2>/dev/null | grep -m1 . | stripq)
if [ "$(echo "$S3" | grep -o 'h:[a-z]*')" = "h:true" ]; then ok "S3a 四远铺建成（拆交班后盲区 5 家）"; else bad "S3a 建造失败 ($S3)"; fi
chk "S3b crimeN=5 / cover=17（1/6）" "$(echo "$S3" | grep -o 'cover:[0-9]*,crime:[0-9]*')" "cover:17,crime:5"
chk "S3c 编年史「盗贼横行」（mile/bad）" "$(echo "$S3" | grep -o 'mile:tone:[a-z]*|cat:mile')" "mile:tone:bad|cat:mile"
# S4：警察局(123,133) R6 + 交班(119,119) 复位（A 邻路避免随机现场无路可达）+ 远宅(112,137)
agent-browser eval "(()=>{const e=window.__pxc;
const h=e.map.place('house',0,112,137);
const k=e.map.place('koban',0,119,119);
const p=e.map.place('policehq',0,123,133);
e.tycoon.tick(0.05,e.map);
return 'hkp:'+(h&&k&&p);})()" >/dev/null 2>&1
agent-browser wait 600
S4=$(agent-browser eval "JSON.stringify((()=>{const e=window.__pxc;const t=e.tycoon;
t.tick(0.05,e.map);const v=t.view();
return {hq:v.policehqN,crime:v.crimeN,missRes:v.secMissRes,cover:v.secCover,cap:e.actors.patrolCap,
  gA:t.secField.has(e.map.idx(121,121)),gB:t.secField.has(e.map.idx(129,129)),
  wF:t.crimeComField.has(e.map.idx(116,141))};})())" 2>/dev/null | grep -m1 . | stripq)
chk "S4a 警察局+交班建成：hq=1 / crime=4（仅远铺）/ 盲区住宅 1" "$(echo "$S4" | grep -o 'hq:[0-9]*,crime:[0-9]*,missRes:[0-9]*')" "hq:1,crime:4,missRes:1"
chk "S4b 巡逻编制 patrolCap=3（交班 1 + 警察局 2）" "$(echo "$S4" | grep -o 'cap:[0-9]*')" "cap:3"
chk "S4c 场归属（sec∋A,B / crimeCom∋远铺）" "$(echo "$S4" | grep -o 'gA:[a-z]*,gB:[a-z]*,wF:[a-z]*')" "gA:true,gB:true,wF:true"
# S5：forceEvent('crime') → 事件激活 + 金币损失 + 出警巡逻车
S5=$(agent-browser eval "JSON.stringify((()=>{const e=window.__pxc;const t=e.tycoon;
const c0=Math.floor(t.coins);
const r=t.forceEvent('crime',e.map);
return {r,ev:t.events.some(x=>x.key==='crime'),d:c0-Math.floor(t.coins),disp:t.dispatch.length};})())" 2>/dev/null | grep -m1 . | stripq)
chk "S5a forceEvent('crime') 触发" "$(echo "$S5" | grep -o 'r:[a-z]*')" "r:true"
chk "S5b 事件激活 + 出动请求入队（disp=1）" "$(echo "$S5" | grep -o 'ev:[a-z]*,d:[0-9]*,disp:[0-9]*' | sed 's/d:[0-9]*,//')" "ev:true,disp:1"
DVAL=$(echo "$S5" | grep -o 'd:[0-9]*' | cut -d: -f2)
chkge "S5c 即时失窃损失 >0（40% 挂账结算）" "${DVAL:-0}" "1"
agent-browser wait 700
S5d=$(agent-browser eval "(()=>{const e=window.__pxc;
const m=e.actors.actors.filter(a=>a.kind===11&&a.mission).length;
return 'm:'+m;})()" 2>/dev/null | grep -m1 . | tr -d '" ')
chk "S5d 出警巡逻车（kind 11 mission actor 出动）" "${S5d:-x}" "m:1"
# S6：resolveEvent('crime') → 破案计数 + 编年史 + 追回
S6=$(agent-browser eval "JSON.stringify((()=>{const e=window.__pxc;const t=e.tycoon;
const r=t.resolveEvent('crime');
const x=[...t.chron.entries].reverse().find(y=>y.title==='神速擒贼');
return {r,slu:t.rescuePolice,mile:x?('tone:'+x.tone+'|t:'+x.title):'none'};})())" 2>/dev/null | grep -m1 . | stripq)
chk "S6a resolveEvent 生效 + rescuePolice=1" "$(echo "$S6" | grep -o 'r:[a-z]*,slu:[0-9]*')" "r:true,slu:1"
chk "S6b 编年史「神速擒贼」（good）" "$(echo "$S6" | grep -o 'mile:tone:[a-z]*')" "mile:tone:good"
# S7：破案循环 ×4 → rescuePolice=5
S7=$(agent-browser eval "(()=>{const t=window.__pxc.tycoon;const e=window.__pxc;
let n=0;
for(let k=0;k<4;k++){t.forceEvent('crime',e.map);t.resolveEvent('crime');
t.events=t.events.filter(x=>x.key!=='crime');t.dispatch.length=0;n++;}
return 'n:'+n+',slu:'+t.rescuePolice;})()" 2>/dev/null | grep -m1 . | tr -d '" ')
chk "S7 破案循环至 rescuePolice=5" "${S7:-x}" "n:4,slu:5"
# S8：交班(115,138) R3 盖四远铺+远宅 → cover=100 → 夜不闭户
S8=$(agent-browser eval "JSON.stringify((()=>{const e=window.__pxc;const t=e.tycoon;
const k=e.map.place('koban',0,115,138);
t.tick(0.05,e.map);const v=t.view();
const x=[...t.chron.entries].reverse().find(y=>y.title==='夜不闭户');
return {k,cover:v.secCover,crime:v.crimeN,out:v.secOut,missRes:v.secMissRes,
  mile:x?('tone:'+x.tone+'|cat:'+x.cat):'none'};})())" 2>/dev/null | grep -m1 . | stripq)
if [ "$(echo "$S8" | grep -o 'k:[a-z]*')" = "k:true" ]; then ok "S8a 南郊交班建成（盖住四远铺+远宅）"; else bad "S8a 建造失败 ($S8)"; fi
chk "S8b 全覆盖：cover=100 / crime=0 / out=0 / 盲区住宅 0" "$(echo "$S8" | grep -o 'cover:[0-9]*,crime:[0-9]*,out:[0-9]*,missRes:[0-9]*')" "cover:100,crime:0,out:0,missRes:0"
chk "S8c 编年史「夜不闭户」（mile/good）—— 盗贼→夜不闭户救赎闭环" "$(echo "$S8" | grep -o 'mile:tone:[a-z]*|cat:mile')" "mile:tone:good|cat:mile"
# S9：成就 nightSafe + sleuth（pop=300 逼触发，防人口回落跌破 100）
agent-browser eval "(()=>{const t=window.__pxc.tycoon;t.pop=300;t.tick(3,window.__pxc.map);return 'achv';})()" >/dev/null 2>&1
agent-browser wait 2600
S9a=$(agent-browser eval "window.__pxc.tycoon.achv.has('nightSafe')?'yes':'no'" 2>/dev/null | grep -m1 . | tr -d '"')
chk "S9a 成就「夜不闭户」（pop≥100 且 cover=100）" "${S9a:-x}" "yes"
S9b=$(agent-browser eval "window.__pxc.tycoon.achv.has('sleuth')?'yes':'no'" 2>/dev/null | grep -m1 . | tr -d '"')
chk "S9b 成就「神探手记」（破案 5 起）" "${S9b:-x}" "yes"

echo "=== [3] N 段：心声 + 市民反应 ==="
# N1：心声（直调 voice 传 crime=3 命中治安文案；先注入市民保证名册非空）
N1=$(agent-browser eval "JSON.stringify((()=>{const e=window.__pxc;const t=e.tycoon;
try{
t.citz.baseline(0);
for(let k=0;k<6;k++){
  t.citz.tick(0.05,e.map,{pop:(k+1)*2,happiness:60,taxRate:9,season:1,famine:0,events:[],fest:-1,smog:0,dark:0,waste:0,eduOut:0,crime:3},t.playtime);
}
const v=t.citz.voice({pop:12,happiness:60,taxRate:9,season:1,famine:0,events:[],fest:-1,smog:0,dark:0,waste:0,eduOut:0,crime:3});
return v?(/贼|巡防|巷子|派出所|交番/.test(v.text)?'hit':'miss:'+v.text):'null';
}catch(err){return 'ERR:'+(err&&err.message?err.message:String(err));}})())" 2>/dev/null | grep -m1 . | stripq)
chk "N1 治安心声命中" "$(echo "${N1:-x}" | grep -o 'hit\|miss:[^}]*\|null\|ERR:[^}]*')" "hit"
# N2：citzVoice() 正常返回（CitzCtx.crime 必填字段接线回归）
N2=$(agent-browser eval "(()=>{const v=window.__pxc.tycoon.citzVoice();return v?'ok':'null';})()" 2>/dev/null | grep -m1 . | tr -d '"')
chk "N2 citzVoice() 正常返回（crime 字段兜底）" "${N2:-x}" "ok"
# N3：市民事件反应写入史册（crime reaction）
N3=$(agent-browser eval "(()=>{const t=window.__pxc.tycoon;
t.citz.onCityEvent('crime',t.playtime);
let hit=0;for(const c of t.citz.roster)if(c.log.some(l=>/蒙面人|报警/.test(l.text)))hit++;
return hit>0?'hit':'none';})()" 2>/dev/null | grep -m1 . | tr -d '" ')
chk "N3 市民失窃反应写入史册" "${N3:-x}" "hit"

echo "=== [4] R 段：渲染 + 存档往返 ==="
# R1：临时拆南郊交班制造盲区（视觉验证：冷影+红点警示+警察局）→ 截图 → 恢复
agent-browser eval "(()=>{const e=window.__pxc;e.map.bulldoze(115,138);e.tycoon.tick(0.05,e.map);e.centerAt(117,138);return 'cam';})()" >/dev/null 2>&1
agent-browser wait 1200
agent-browser screenshot $OUT/v23_city.png >/dev/null && ok "截图 v23_city.png（南郊商街盲区 + 警察局）"
agent-browser eval "(()=>{const e=window.__pxc;e.map.place('koban',0,115,138);e.tycoon.tick(0.05,e.map);return 'restore';})()" >/dev/null 2>&1
# R2：存档往返（rescuePolice 计数 / secCover 重算 / 编年史保留）
R2b=$(agent-browser eval "(()=>{const e=window.__pxc;const v=e.tycoon.view();
e.tycoon.save(e.map);
return v.secCover+'|'+v.crimeN+'|'+v.policehqN+'|'+v.rescuePolice;})()" 2>/dev/null | grep -m1 . | tr -d '" ')
agent-browser reload >/dev/null 2>&1
agent-browser wait --fn "window.__pxc!==undefined" --timeout 90000 >/dev/null 2>&1
agent-browser wait 3000
R2a=$(agent-browser eval "(()=>{const e=window.__pxc;e.tycoon.tick(0.05,e.map);const v=e.tycoon.view();
const x=[...e.tycoon.chron.entries].some(y=>y.title==='夜不闭户');
return v.secCover+'|'+v.crimeN+'|'+v.policehqN+'|'+v.rescuePolice+'|'+(x?'y':'n');})()" 2>/dev/null | grep -m1 . | tr -d '" ')
chk "R2a 存档往返（前=${R2b:-x} 后=${R2a:-x}；破案计数/巡防重算/编年史保留）" "${R2a:-x}" "100|0|1|5|y"
ERR=$(errcount)
chk "R2b 控制台零错误" "${ERR:-x}" "0"

echo "=== [5] 移动端 390×844 ==="
agent-browser set viewport 390 844
agent-browser wait 1800
agent-browser screenshot $OUT/v23_mobile.png >/dev/null && ok "截图 v23_mobile.png"
agent-browser errors --json 2>/dev/null | python3 -c "import json,sys
try:
  for e in json.load(sys.stdin).get('data',{}).get('errors',[]): print('  ✗ '+e.get('text','').split(chr(10))[0][:150])
except Exception: pass"

echo ""
echo "=========================================="
echo "  v23 E2E: $PASS 通过 / $FAIL 失败"
echo "=========================================="
exit $((FAIL > 0 ? 1 : 0))
