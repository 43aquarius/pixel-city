#!/bin/bash
# ============================================================
# v22_browser_test.sh — 教育空间化「百年树人·书香之城」端到端验证
# 布局（已购领地 112-143，cityhall 锚点 127,127 占 127-128²，道路 y=126/127/128）：
#   E0 初始：无住宅 → eduCover=100（分母 0 守护）/ hrIdx=50（空册兜底）
#   E1 两住宅：A(121,121) 距 cityhall 切比雪夫 6 > R3 学区外；
#              B(129,129) 距 2 ≤ 3 学区内 → in=1 / out=1 / cover=50
#   E2 小学 primary(119,119) R4=[115,123]² → A 距 2 入圈 → cover=100 / primaries=1
#   E3 拆小学 + 五远宅 (125,141)(129,141)(133,141)(137,141)(139,139)
#      （全部 cityhall R3=[124,130]² 外 + 大学 R8 预埋圈内，避开道路行）
#      → eduOut=6（A+五远宅）→ 编年史「望学兴叹」入册（bad）
#   E4 大学 university(132,133) 3×3 R8=[124,140]×[125,141] → 五远宅入圈
#      + 小学重建（A 入圈）→ cover=100 → 编年史「有教无类」入册（good）
#      + 大学耗电 20MW 距 cityhall 6 ≤ 6 通电（gridField 命中）
#   H 段：工厂(130,130) 通电 → 28 位市民循环注入 → forceGrad×12
#      → gradTotal≥12 / hrIdx 上升 ≥10 / 全员大学 → earnInd ≥ 1.1×（人力反哺工业）
#      + 成就 桃李满天下 / 书香之城
#   N 段：心声命中（eduOut>0）+ citzVoice() 回归
#   R 段：相机对准大学区截图 + 存档往返（gradTotal/eduCover/大学/编年史）+ 零错误 + 双端截图
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
agent-browser eval "(()=>{const e=window.__pxc;const t=e.tycoon;t.level=9;t.coins=30000;t.techs.add('higher');
for(let x=112;x<=136;x++){e.map.setRoad(x,126,true);e.map.setRoad(x,127,true);e.map.setRoad(x,128,true);}
return 'setup';})()" >/dev/null 2>&1

echo "=== [2] E 段：学区覆盖判定 ==="
# E0：初始态（无住宅 → 分母 0 守护 cover=100；空册 hrIdx 兜底 50）
E0=$(agent-browser eval "JSON.stringify((()=>{const e=window.__pxc;const t=e.tycoon;
t.tick(0.05,e.map);const v=t.view();
return {cover:v.eduCover,inn:v.eduIn,out:v.eduOut,hr:v.hrIdx,prim:v.primaries,uni:v.universities};})())" 2>/dev/null | tail -1 | stripq)
chk "E0 初始无住宅 cover=100 / out=0 / hr=50（空册兜底）" "$(echo "$E0" | grep -o 'cover:[0-9]*,inn:[0-9]*,out:[0-9]*,hr:[0-9]*')" "cover:100,inn:0,out:0,hr:50"
# E1：A(121,121) 距 cityhall 6 > R3 学区外；B(129,129) 距 2 ≤ 3 学区内
E1=$(agent-browser eval "JSON.stringify((()=>{const e=window.__pxc;const t=e.tycoon;
const a=e.map.place('house',0,121,121);const b=e.map.place('house',1,129,129);
t.tick(0.05,e.map);const v=t.view();
return {a:a&&b,cover:v.eduCover,inn:v.eduIn,out:v.eduOut,
  gA:t.eduField.has(e.map.idx(121,121)),gB:t.eduField.has(e.map.idx(129,129)),
  mA:t.eduMissField.has(e.map.idx(121,121))};})())" 2>/dev/null | tail -1 | stripq)
if [ "$(echo "$E1" | grep -o 'a:[a-z]*')" = "a:true" ]; then ok "E1a 两住宅建成（A 学区外 / B 学区内）"; else bad "E1a 建造失败 ($E1)"; fi
chk "E1b cover=50 / in=1 / out=1（市政厅附设蒙学 R3）" "$(echo "$E1" | grep -o 'cover:[0-9]*,inn:[0-9]*,out:[0-9]*')" "cover:50,inn:1,out:1"
chk "E1c 场归属（edu∋B / miss∋A）" "$(echo "$E1" | grep -o 'gA:[a-z]*,gB:[a-z]*,mA:[a-z]*')" "gA:false,gB:true,mA:true"
# E2：小学 primary(119,119) R4 → A(121,121) 距 2 入圈
E2=$(agent-browser eval "JSON.stringify((()=>{const e=window.__pxc;const t=e.tycoon;
const p=e.map.place('primary',0,119,119);
t.tick(0.05,e.map);const v=t.view();
return {p,cover:v.eduCover,inn:v.eduIn,out:v.eduOut,prim:v.primaries,
  gA:t.eduField.has(e.map.idx(121,121))};})())" 2>/dev/null | tail -1 | stripq)
if [ "$(echo "$E2" | grep -o 'p:[a-z]*')" = "p:true" ]; then ok "E2a 小学建成（R4 圈住 A）"; else bad "E2a 建造失败 ($E2)"; fi
chk "E2b A 转学区内：cover=100 / out=0 / prim=1" "$(echo "$E2" | grep -o 'cover:[0-9]*,inn:[0-9]*,out:[0-9]*,prim:[0-9]*')" "cover:100,inn:2,out:0,prim:1"
chk "E2c 场归属（edu∋A）" "$(echo "$E2" | grep -o 'gA:[a-z]*')" "gA:true"
# E3：拆小学 + 五远宅 → eduOut=6（A+五远宅，B 仍在市政厅圈）→ 望学兴叹入册
E3=$(agent-browser eval "JSON.stringify((()=>{const e=window.__pxc;const t=e.tycoon;
e.map.bulldoze(119,119);
const h=[[125,141],[129,141],[133,141],[137,141],[139,139]].map(([x,y])=>e.map.place('house',0,x,y)).every(Boolean);
t.tick(0.05,e.map);const v=t.view();
const x=[...t.chron.entries].find(y=>y.title==='望学兴叹');
return {h,cover:v.eduCover,inn:v.eduIn,out:v.eduOut,prim:v.primaries,
  mile:x?('tone:'+x.tone+'|cat:'+x.cat):'none'};})())" 2>/dev/null | tail -1 | stripq)
if [ "$(echo "$E3" | grep -o 'h:[a-z]*')" = "h:true" ]; then ok "E3a 五栋远宅建成（拆小学后学区外 6 栋）"; else bad "E3a 建造失败 ($E3)"; fi
chk "E3b out=6 / in=1 / cover=14（1/7）" "$(echo "$E3" | grep -o 'cover:[0-9]*,inn:[0-9]*,out:[0-9]*')" "cover:14,inn:1,out:6"
chk "E3c 编年史「望学兴叹」（mile/bad）" "$(echo "$E3" | grep -o 'mile:tone:[a-z]*|cat:mile')" "mile:tone:bad|cat:mile"
# E4：大学(132,133) R8 圈住五远宅 + 小学重建圈住 A → cover=100 → 有教无类入册
E4=$(agent-browser eval "JSON.stringify((()=>{const e=window.__pxc;const t=e.tycoon;
const u=e.map.place('university',0,132,133);const p=e.map.place('primary',1,119,119);
t.tick(0.05,e.map);const v=t.view();
const x=[...t.chron.entries].reverse().find(y=>y.title==='有教无类');
return {u:u&&p,cover:v.eduCover,inn:v.eduIn,out:v.eduOut,uni:v.universities,prim:v.primaries,
  gU:t.gridField.has(e.map.idx(132,133)),
  gFar:t.eduField.has(e.map.idx(137,141)),gA:t.eduField.has(e.map.idx(121,121)),
  mile:x?('tone:'+x.tone+'|cat:'+x.cat):'none'};})())" 2>/dev/null | tail -1 | stripq)
if [ "$(echo "$E4" | grep -o 'u:[a-z]*')" = "u:true" ]; then ok "E4a 大学城 3×3 + 小学重建建成"; else bad "E4a 建造失败 ($E4)"; fi
chk "E4b 全员入圈：cover=100 / in=7 / out=0 / uni=1" "$(echo "$E4" | grep -o 'cover:[0-9]*,inn:[0-9]*,out:[0-9]*,uni:[0-9]*')" "cover:100,inn:7,out:0,uni:1"
chk "E4c 大学入电网（距 cityhall 6 ≤ 6，20MW 通电）" "$(echo "$E4" | grep -o 'gU:[a-z]*')" "gU:true"
chk "E4d 场归属（远宅(137,141) 与 A 均入学区）" "$(echo "$E4" | grep -o 'gFar:[a-z]*,gA:[a-z]*')" "gFar:true,gA:true"
chk "E4e 编年史「有教无类」（mile/good）—— 望学→兴学救赎闭环" "$(echo "$E4" | grep -o 'mile:tone:[a-z]*|cat:mile')" "mile:tone:good|cat:mile"

echo "=== [3] H 段：人力资本与升学 ==="
# H1：工厂(130,130) 2×2 距 cityhall 3 ≤ 6 通电 → 记录 hr 基线下的工业收入
#（远宅/小学在电网外属预期：darkN 只统计耗电建筑，与学区判定无关）
H1=$(agent-browser eval "JSON.stringify((()=>{const e=window.__pxc;const t=e.tycoon;
const f=e.map.place('factory',0,130,130);
t.tick(0.05,e.map);
return {f,ind:t.snap.earnInd,gF:t.gridField.has(e.map.idx(130,130))};})())" 2>/dev/null | tail -1 | stripq)
if [ "$(echo "$H1" | grep -o 'f:[a-z]*')" = "f:true" ]; then ok "H1a 工厂建成（通电，hr 基线工业收入记账）"; else bad "H1a 建造失败 ($H1)"; fi
IND0=$(echo "$H1" | grep -o 'ind:[0-9.]*' | cut -d: -f2)
chk "H1b 工厂入网（gridField 命中，距 cityhall 3 ≤ 6）" "$(echo "$H1" | grep -o 'gF:[a-z]*')" "gF:true"
# H2：28 位市民确定性注入（直调 citz.tick；首帧用于对齐引擎自然增长后的 lastPop，
#   引擎平滑增长每帧 dPop<2 不会自己添人，注入后 roster 恰满 28）
H2=$(agent-browser eval "JSON.stringify((()=>{const e=window.__pxc;const t=e.tycoon;
for(let k=0;k<29;k++){
  t.citz.tick(0.05,e.map,{pop:(k+1)*2,happiness:60,taxRate:9,season:1,famine:0,events:[],fest:-1,smog:0,dark:0,waste:0,eduOut:0},t.playtime);
}
t.pop=58;t.tick(0.05,e.map);const v=t.view();
return {n:t.citz.roster.length,hr:v.hrIdx,grad:v.gradTotal};})())" 2>/dev/null | tail -1 | stripq)
chk "H2a 名册注入 28 位市民" "$(echo "$H2" | grep -o 'n:[0-9]*')" "n:28"
# H3：forceGrad×12 → gradTotal≥12 + hrIdx 上升（12×100/28/3 ≈ +14）
H3=$(agent-browser eval "JSON.stringify((()=>{const e=window.__pxc;const t=e.tycoon;
const hr0=t.citz.hrIdx();
let g=0;for(let k=0;k<12;k++){if(t.citz.forceGrad().ok)g++;}
const hr1=t.citz.hrIdx();
return {g,d:Math.round((hr1-hr0)*10)/10};})())" 2>/dev/null | tail -1 | stripq)
chk "H3a forceGrad×12 全成功" "$(echo "$H3" | grep -o 'g:[0-9]*')" "g:12"
DHR=$(echo "$H3" | grep -o 'd:[0-9.-]*' | cut -d: -f2)
if [ -n "$DHR" ] && python3 -c "exit(0 if $DHR>=10 else 1)" 2>/dev/null; then ok "H3b hrIdx 上升 ≥10（Δ=$DHR）"; else bad "H3b hrIdx 上升不足 (Δ=$DHR)"; fi
# H4：同帧内先归一 hr 基线（全员初小 hr=33 → hrK=1）再拉满（全员大学 hr=100）
#   → earnInd 比值恰为 1.16（同帧两拍，事件乘数/multInd 全部约去 —— 稳健无漂移）
H4=$(agent-browser eval "JSON.stringify((()=>{const e=window.__pxc;const t=e.tycoon;
const r=t.citz.roster;
for(const c of r)c.edu=1;
t.tick(0.05,e.map);
const ind0=t.snap.earnInd;
for(const c of r)c.edu=3;
t.tick(0.05,e.map);
const ind1=t.snap.earnInd;
return {hr:t.view().hrIdx,ind0,ind1};})())" 2>/dev/null | tail -1 | stripq)
chk "H4a 全员大学 hrIdx=100" "$(echo "$H4" | grep -o 'hr:[0-9]*')" "hr:100"
I0=$(echo "$H4" | grep -o 'ind0:[0-9.]*' | cut -d: -f2)
I1=$(echo "$H4" | grep -o 'ind1:[0-9.]*' | cut -d: -f2)
if [ -n "$I0" ] && [ -n "$I1" ] && python3 -c "exit(0 if $I1>=$I0*1.15 else 1)" 2>/dev/null; then ok "H4b 大学城人力反哺工业（earnInd ${I0} → ${I1}，比值 1.16）"; else bad "H4b 工业收入未增 (ind0=$I0 ind1=$I1)"; fi
# H5：成就 桃李满天下（gradTotal≥12）/ 书香之城（pop≥100 且 cover≥90）
agent-browser eval "(()=>{const t=window.__pxc.tycoon;t.pop=150;t.tick(3,window.__pxc.map);return 'achv';})()" >/dev/null 2>&1
agent-browser wait 2600
H5a=$(agent-browser eval "window.__pxc.tycoon.achv.has('grad12')?'yes':'no'" 2>/dev/null | tail -1 | tr -d '"')
chk "H5a 成就「桃李满天下」（累计升学 ≥12 人次）" "${H5a:-x}" "yes"
H5b=$(agent-browser eval "window.__pxc.tycoon.achv.has('scholar')?'yes':'no'" 2>/dev/null | tail -1 | tr -d '"')
chk "H5b 成就「书香之城」（pop≥100 且 cover=100）" "${H5b:-x}" "yes"
# H6：升学写入市民史册（生活大事记含「升入/考取」）
H6=$(agent-browser eval "(()=>{const r=window.__pxc.tycoon.citz.roster;
let hit=0;for(const c of r)if(c.log.some(l=>/升入|考取|升学/.test(l.text)))hit++;
return hit>0?('hit:'+hit):'none';})()" 2>/dev/null | tail -1 | tr -d '" ')
if [ "$(echo "${H6:-x}" | grep -o 'hit')" = "hit" ]; then ok "H6 升学已写入市民大事记（$(echo "$H6" | cut -d: -f2) 位）"; else bad "H6 大事记无升学记录 ($H6)"; fi

echo "=== [4] N 段：心声 + 回归 ==="
# N1：心声（voice 直调 eduOut=6 命中望学文案）
N1=$(agent-browser eval "JSON.stringify((()=>{const e=window.__pxc;const t=e.tycoon;
try{
const v=t.citz.voice({pop:60,happiness:60,taxRate:9,season:1,famine:0,events:[],fest:-1,smog:0,dark:0,waste:0,eduOut:6});
return v?(/上学|学堂|读书|小学|寄宿/.test(v.text)?'hit':'miss:'+v.text):'null';
}catch(err){return 'ERR:'+(err&&err.message?err.message:String(err));}})())" 2>/dev/null | grep -m1 . | stripq)
chk "N1 望学心声命中" "$(echo "${N1:-x}" | grep -o 'hit\|miss:[^}]*\|null\|ERR:[^}]*')" "hit"
# N2：citzVoice() 正常返回（CitzCtx.eduOut 必填字段接线回归）
N2=$(agent-browser eval "(()=>{const v=window.__pxc.tycoon.citzVoice();return v?'ok':'null';})()" 2>/dev/null | tail -1 | tr -d '"')
chk "N2 citzVoice() 正常返回（eduOut 字段兜底）" "${N2:-x}" "ok"

echo "=== [5] R 段：渲染 + 存档往返 ==="
# R1：相机对准大学区 → 截图（学区金光罩 + 书页粒子 + 大学城精灵）
agent-browser eval "(()=>{const e=window.__pxc;e.centerAt(130,135);return 'cam';})()" >/dev/null 2>&1
agent-browser wait 1200
agent-browser screenshot $OUT/v22_city.png >/dev/null && ok "截图 v22_city.png（大学城 + 学区光罩）"
# R2：存档往返（edu 学历 / gradTotal / chron m.edu 派生重算；
#   gradTotal 用阈值口径防引擎随机升学在保存瞬间 +1 的微小漂移）
R2b=$(agent-browser eval "(()=>{const e=window.__pxc;const v=e.tycoon.view();
const g=v.gradTotal>=12?'y':'n';
e.tycoon.save(e.map);
return v.eduCover+'|'+v.eduOut+'|'+v.universities+'|'+g;})()" 2>/dev/null | tail -1 | tr -d '" ')
agent-browser reload >/dev/null 2>&1
agent-browser wait --fn "window.__pxc!==undefined" --timeout 90000 >/dev/null 2>&1
agent-browser wait 3000
R2a=$(agent-browser eval "(()=>{const e=window.__pxc;e.tycoon.tick(0.05,e.map);const v=e.tycoon.view();
const x=[...e.tycoon.chron.entries].some(y=>y.title==='有教无类');
return v.eduCover+'|'+v.eduOut+'|'+v.universities+'|'+(v.gradTotal>=12?'y':'n')+'|'+(x?'y':'n');})()" 2>/dev/null | tail -1 | tr -d '" ')
chk "R2a 存档往返（前=${R2b:-x} 后=${R2a:-x}；学历/升学计数/编年史全保留）" "${R2a:-x}" "100|0|1|y|y"
ERR=$(errcount)
chk "R2b 控制台零错误" "${ERR:-x}" "0"

echo "=== [6] 移动端 390×844 ==="
agent-browser set viewport 390 844
agent-browser wait 1800
agent-browser screenshot $OUT/v22_mobile.png >/dev/null && ok "截图 v22_mobile.png"
agent-browser errors --json 2>/dev/null | python3 -c "import json,sys
try:
  for e in json.load(sys.stdin).get('data',{}).get('errors',[]): print('  ✗ '+e.get('text','').split(chr(10))[0][:150])
except Exception: pass"

echo ""
echo "=========================================="
echo "  v22 E2E: $PASS 通过 / $FAIL 失败"
echo "=========================================="
exit $((FAIL > 0 ? 1 : 0))
