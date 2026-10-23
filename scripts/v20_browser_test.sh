#!/bin/bash
# ============================================================
# v20_browser_test.sh — 电网空间化「万家灯火·电网时代」端到端验证
# 布局（已购领地 112-143，cityhall 锚点 127,127 R6 → 覆盖 [121,133]²）：
#   G0 初始：无耗电建筑 → darkN=0 / gridCover=100（分母 0 守护）
#   G1 三住宅：A(121,121) 恰在 cityhall 边缘亮 / B(138,138)+C(141,141) 断电
#   G2 变电站 S1(133,133)（恰在 cityhall 6 格边缘 → 有效中继 R6 → [127,139]²）
#      → B 转亮 / C 仍暗
#   G3 无效中继 S2(140,142)：离真电源 >6 → 不获中继资格；
#      自身也 dark（夜里连警示灯都不亮）→ C 依然暗（变电站不能手拉手）
#   G4 拆 S2 → darkN 回落
#   G5 断电商铺收入归零 → 挪入亮区恢复
#   S 段：风场(112,131) + 光伏(114,135)：cleanMW/solarMW 随 dayLight 昼夜
#   N 段：暗夜之城(6 栋 dark) → 重见光明(全拆) / 成就 / 断电心声 / citzVoice 回归
#   R 段：timeOfDay=22 深夜渲染（断电区无窗火）+ 存档往返派生重算
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
agent-browser eval "(()=>{const e=window.__pxc;const t=e.tycoon;t.level=9;t.coins=30000;
for(let x=112;x<=136;x++){e.map.setRoad(x,126,true);e.map.setRoad(x,127,true);e.map.setRoad(x,128,true);}
return 'roads';})()" >/dev/null 2>&1

echo "=== [2] G 段：电网覆盖判定 ==="
# G0：初始态（cityhall 是发电建筑不计；耗电建筑 0 → 分母 0 守护 gridCover=100）
G0=$(agent-browser eval "JSON.stringify((()=>{const e=window.__pxc;const t=e.tycoon;
t.tick(0.05,e.map);const v=t.view();
return {dark:v.darkN,cover:v.gridCover};})())" 2>/dev/null | tail -1 | stripq)
chk "G0 初始无耗电建筑 darkN=0 / gridCover=100" "${G0:-x}" "{dark:0,cover:100}"
# G1：A 恰在 cityhall 6 格边缘亮；B/C 断电 → 2/3 暗
G1=$(agent-browser eval "JSON.stringify((()=>{const e=window.__pxc;const t=e.tycoon;
const a=e.map.place('house',0,121,121);const b=e.map.place('house',1,138,138);const c=e.map.place('house',2,141,141);
t.tick(0.05,e.map);const v=t.view();
return {a:a&&b&&c,dark:v.darkN,res:v.powerRes,cover:v.gridCover,
  gA:t.gridField.has(e.map.idx(121,121)),dB:t.darkField.has(e.map.idx(138,138)),dC:t.darkField.has(e.map.idx(141,141))};})())" 2>/dev/null | tail -1 | stripq)
if [ "$(echo "$G1" | grep -o 'a:[a-z]*')" = "a:true" ]; then ok "G1a 三住宅建成（1 亮 2 暗）"; else bad "G1a 建造失败 ($G1)"; fi
chk "G1b darkN=2 / powerRes=2 / cover=33" "$(echo "$G1" | grep -o 'dark:2,res:2,cover:33,gA:true,dB:true,dC:true')" "dark:2,res:2,cover:33,gA:true,dB:true,dC:true"
# G2：S1 恰在 cityhall 6 格边缘 → 有效中继 → B 转亮；C 仍暗
G2=$(agent-browser eval "JSON.stringify((()=>{const e=window.__pxc;const t=e.tycoon;
const s=e.map.place('substation',0,133,133);
t.tick(0.05,e.map);const v=t.view();
return {s,dark:v.darkN,res:v.powerRes,cover:v.gridCover,sub:v.substations,
  gB:t.gridField.has(e.map.idx(138,138)),dC:t.darkField.has(e.map.idx(141,141))};})())" 2>/dev/null | tail -1 | stripq)
if [ "$(echo "$G2" | grep -o 's:true')" = "s:true" ]; then ok "G2a 变电站建成（边缘有效中继）"; else bad "G2a 建造失败 ($G2)"; fi
chk "G2b B 转亮 C 仍暗：darkN=1 / cover=75 / sub=1" "$(echo "$G2" | grep -o 'dark:1,res:1,cover:75,sub:1,gB:true,dC:true')" "dark:1,res:1,cover:75,sub:1,gB:true,dC:true"
# G3：无效中继 S2 —— 自身 dark、C 依然暗（变电站不能手拉手）
G3=$(agent-browser eval "JSON.stringify((()=>{const e=window.__pxc;const t=e.tycoon;
const s=e.map.place('substation',1,140,142);
t.tick(0.05,e.map);const v=t.view();
return {s,dark:v.darkN,cover:v.gridCover,sub:v.substations,
  dS2:t.darkField.has(e.map.idx(140,142)),dC:t.darkField.has(e.map.idx(141,141))};})())" 2>/dev/null | tail -1 | stripq)
if [ "$(echo "$G3" | grep -o 's:[a-z]*')" = "s:true" ]; then ok "G3a 第二座变电站建成（远离电源）"; else bad "G3a 建造失败 ($G3)"; fi
chk "G3b S2 自身 dark + C 仍暗（不能手拉手）：darkN=2 / cover=60" "$(echo "$G3" | grep -o 'dark:2,cover:60,sub:2,dS2:true,dC:true')" "dark:2,cover:60,sub:2,dS2:true,dC:true"
# G4：拆 S2 → darkN 回落
G4=$(agent-browser eval "(()=>{const e=window.__pxc;e.map.bulldoze(140,142);
e.tycoon.tick(0.05,e.map);return e.tycoon.view().darkN;})()" 2>/dev/null | tail -1 | tr -d '" ')
chk "G4 拆无效变电站 darkN 回落=1" "${G4:-x}" "1"
# G5：断电商铺收入归零 → 挪入亮区恢复（t.pop 先行保证 staffing>0）
G5=$(agent-browser eval "JSON.stringify((()=>{const e=window.__pxc;const t=e.tycoon;
t.pop=60;t.tick(0.05,e.map);const base=t.view().incomeCom;
const s=e.map.place('shop',0,142,136);t.tick(0.05,e.map);const dark=t.view().incomeCom;
e.map.bulldoze(142,136);e.map.place('shop',0,131,131);t.tick(0.05,e.map);const lit=t.view().incomeCom;
return {s,base,dark,lit};})())" 2>/dev/null | tail -1 | stripq)
GB=$(echo "$G5" | grep -o 'base:[0-9.-]*' | cut -d: -f2)
GD=$(echo "$G5" | grep -o 'dark:[0-9.-]*' | cut -d: -f2)
GL=$(echo "$G5" | grep -o 'lit:[0-9.-]*' | cut -d: -f2)
if [ "$(echo "$G5" | grep -o 's:[a-z]*')" = "s:true" ]; then ok "G5a 断电商铺建成（S1 圈外 9 格）"; else bad "G5a 建造失败 ($G5)"; fi
if [ -n "$GD" ] && [ "$GD" = "$GB" ]; then ok "G5b 断电商铺收入归零（${GB} → ${GD}）"; else bad "G5b 归零失败 (base=$GB dark=$GD)"; fi
if [ -n "$GL" ] && [ -n "$GB" ] && [ "${GL%%.*}" -gt "$GB" ] 2>/dev/null; then ok "G5c 挪入亮区恢复（→ ${GL}G/分）"; else bad "G5c 未恢复 (base=$GB lit=$GL)"; fi

echo "=== [3] S 段：清洁能源与昼夜出力 ==="
S1=$(agent-browser eval "JSON.stringify((()=>{const e=window.__pxc;const t=e.tycoon;
const w=e.map.place('windfarm',0,112,131);const s=e.map.place('solarfarm',0,114,135);
t.dayLight=1;t.tick(0.05,e.map);const v=t.view();
return {w:w&&s,wind:v.windfarms,sol:v.solarfarms,coal:v.coalN,clean:v.cleanMW,solar:v.solarMW,sup:v.powerSup};})())" 2>/dev/null | tail -1 | stripq)
if [ "$(echo "$S1" | grep -o 'w:[a-z]*')" = "w:true" ]; then ok "S1a 风场 + 光伏建成（无火电）"; else bad "S1a 建造失败 ($S1)"; fi
chk "S1b 装机 wind=1 sol=1 coal=0" "$(echo "$S1" | grep -o 'wind:[0-9]*,sol:[0-9]*,coal:[0-9]*')" "wind:1,sol:1,coal:0"
SUP1=$(echo "$S1" | grep -o 'sup:[0-9]*' | cut -d: -f2)
chk "S1c 白昼出力 clean=110 / solar=50（风 60 + 光 50）" "$(echo "$S1" | grep -o 'clean:[0-9]*,solar:[0-9]*')" "clean:110,solar:50"
# S2：深夜 dayLight=0 → 太阳能归零，风电独撑
S2=$(agent-browser eval "JSON.stringify((()=>{const e=window.__pxc;const t=e.tycoon;
t.dayLight=0;t.tick(0.05,e.map);const v=t.view();
return {clean:v.cleanMW,solar:v.solarMW,sup:v.powerSup};})())" 2>/dev/null | tail -1 | stripq)
chk "S2a 深夜光伏归零 solar=0（风电 60 独撑）" "$(echo "$S2" | grep -o 'clean:[0-9]*,solar:[0-9]*')" "clean:60,solar:0"
SUP2=$(echo "$S2" | grep -o 'sup:[0-9]*' | cut -d: -f2)
D=$((SUP1 - SUP2))
chk "S2b 供电随昼夜联动（供 ${SUP1} → ${SUP2} MW，差=${D}）" "${D}" "50"
agent-browser eval "(()=>{window.__pxc.tycoon.dayLight=1;return 'day';})()" >/dev/null 2>&1

echo "=== [4] N 段：编年史 / 成就 / 心声 ==="
# N1：补 5 栋 dark（共 6）→「暗夜之城」
N1=$(agent-browser eval "JSON.stringify((()=>{const e=window.__pxc;const t=e.tycoon;
const h=[[141,138],[141,140],[142,137],[142,139],[139,142]].map(([x,y])=>e.map.place('house',0,x,y)).every(Boolean);
t.tick(0.05,e.map);const v=t.view();
const x=[...t.chron.entries].find(y=>y.title==='暗夜之城');
return {h,dark:v.darkN,res:v.powerRes,mile:x?('tone:'+x.tone+'|cat:'+x.cat):'none'};})())" 2>/dev/null | tail -1 | stripq)
if [ "$(echo "$N1" | grep -o 'h:[a-z]*')" = "h:true" ]; then ok "N1a 补足 6 栋断电住宅"; else bad "N1a 建造失败 ($N1)"; fi
chk "N1b darkN=6 / powerRes=6" "$(echo "$N1" | grep -o 'dark:[0-9]*,res:[0-9]*')" "dark:6,res:6"
chk "N1c 编年史「暗夜之城」（mile/bad）" "$(echo "$N1" | grep -o 'mile:tone:[a-z]*|cat:mile')" "mile:tone:bad|cat:mile"
# 心声：dark>0 命中断电文案（趁 6 栋在场）
N5a=$(agent-browser eval "JSON.stringify((()=>{const e=window.__pxc;const t=e.tycoon;
try{
t.pop=60;for(let k=0;k<4;k++)t.tick(1,e.map);
const v=t.citz.voice({pop:60,happiness:60,taxRate:9,season:1,famine:0,events:[],fest:-1,smog:0,dark:6});
return v?(/黑灯瞎火|停电|停了电|电网|银河|蜡烛|冰箱/.test(v.text)?'hit':'miss:'+v.text):'null';
}catch(err){return 'ERR:'+(err&&err.message?err.message:String(err));}})())" 2>/dev/null | grep -m1 . | stripq)
chk "N1d 断电心声命中" "$(echo "${N5a:-x}" | grep -o 'hit\|miss:[^}]*\|null')" "hit"
# citzVoice() 回归（修复2：CitzCtx 缺 dark 会编译错/类型断裂）
N5b=$(agent-browser eval "(()=>{const v=window.__pxc.tycoon.citzVoice();return v?('ok:'+v.text.slice(0,12)):'null';})()" 2>/dev/null | tail -1 | tr -d '"' | cut -c1-24)
if [ -n "$N5b" ] && [ "${N5b%%:*}" = "ok" ]; then ok "N1e citzVoice() 正常返回（s?.powerRes 兜底）"; else bad "N1e citzVoice 异常 ($N5b)"; fi
# N2：全拆 dark →「重见光明」
N2=$(agent-browser eval "JSON.stringify((()=>{const e=window.__pxc;const t=e.tycoon;
for(const [x,y] of [[141,141],[141,138],[141,140],[142,137],[142,139],[139,142]]) e.map.bulldoze(x,y);
t.tick(0.05,e.map);const v=t.view();
const x=[...t.chron.entries].reverse().find(y=>y.title==='重见光明');
return {dark:v.darkN,cover:v.gridCover,mile:x?('tone:'+x.tone):'none'};})())" 2>/dev/null | tail -1 | stripq)
chk "N2a 全拆后 darkN=0 / cover=100" "$(echo "$N2" | grep -o 'dark:[0-9]*,cover:[0-9]*')" "dark:0,cover:100"
chk "N2b 编年史「重见光明」（good）" "$(echo "$N2" | grep -o 'mile:tone:[a-z]*')" "mile:tone:good"
# N3+N4：成就（cleanp 即时条件已满足；lights95 需 pop≥150）
agent-browser eval "(()=>{const t=window.__pxc.tycoon;t.pop=999;t.tick(0.05,window.__pxc.map);return 'pop';})()" >/dev/null 2>&1
agent-browser wait 2600
N3=$(agent-browser eval "window.__pxc.tycoon.achv.has('cleanp')?'yes':'no'" 2>/dev/null | tail -1 | tr -d '"')
chk "N3 成就「清风明月」（风+光≥2 且无火电）" "${N3:-x}" "yes"
N4=$(agent-browser eval "window.__pxc.tycoon.achv.has('lights95')?'yes':'no'" 2>/dev/null | tail -1 | tr -d '"')
chk "N4 成就「万家灯火」（pop≥150 且 cover≥95）" "${N4:-x}" "yes"

echo "=== [5] R 段：夜景渲染 + 存档往返 ==="
# R1：重造 2 栋 dark → 拨至深夜 → 断电区无窗火（渲染层 darkB）
R1=$(agent-browser eval "JSON.stringify((()=>{const e=window.__pxc;const t=e.tycoon;
const a=e.map.place('house',0,141,138);const b=e.map.place('house',1,141,141);
t.tick(0.05,e.map);const v=t.view();
e.timeOfDay=22;return {a:a&&b,dark:v.darkN,cover:v.gridCover};})())" 2>/dev/null | tail -1 | stripq)
if [ "$(echo "$R1" | grep -o 'a:[a-z]*')" = "a:true" ]; then ok "R1a 重造 2 栋断电住宅"; else bad "R1a 建造失败 ($R1)"; fi
chk "R1b darkN=2 复现" "$(echo "$R1" | grep -o 'dark:[0-9]*')" "dark:2"
agent-browser wait 1200
# 相机对准东南新城区（亮区 121-133 + 暗 138-142 对比带）
agent-browser eval "(()=>{const e=window.__pxc;e.cam.x=(134-120.5)*16;e.cam.y=(136+120.5)*8-80;return 'cam';})()" >/dev/null 2>&1
agent-browser wait 700
agent-browser screenshot $OUT/v20_night_grid.png >/dev/null && ok "截图 v20_night_grid.png（深夜：亮区窗火 vs 断电区漆黑）"
agent-browser eval "(()=>{window.__pxc.timeOfDay=10;return 'day';})()" >/dev/null 2>&1
agent-browser wait 900
# R2：存档往返（gridField/darkField 派生不进档，加载后重算）
agent-browser eval "(()=>{const e=window.__pxc;e.tycoon.save(e.map);return 'saved';})()" >/dev/null 2>&1
agent-browser reload >/dev/null 2>&1
agent-browser wait --fn "window.__pxc!==undefined" --timeout 90000 >/dev/null 2>&1
agent-browser wait 3000
R2=$(agent-browser eval "JSON.stringify((()=>{const e=window.__pxc;const t=e.tycoon;
t.tick(0.05,e.map);const v=t.view();
return {dark:v.darkN,cover:v.gridCover,sub:v.substations,wind:v.windfarms,sol:v.solarfarms};})())" 2>/dev/null | tail -1 | stripq)
chk "R2a 存档往返：派生场重算 darkN=2" "$(echo "$R2" | grep -o 'dark:[0-9]*')" "dark:2"
chk "R2b cover/装机随档复现" "$(echo "$R2" | grep -o 'cover:[0-9]*,sub:[0-9]*,wind:[0-9]*,sol:[0-9]*')" "cover:67,sub:1,wind:1,sol:1"
ERR=$(errcount)
chk "R3 控制台零错误" "${ERR:-x}" "0"
agent-browser eval "(()=>{const e=window.__pxc;e.timeOfDay=10;e.cam.x=(120-120.5)*16;e.cam.y=(134+120.5)*8-80;return 'cam';})()" >/dev/null 2>&1
agent-browser wait 700
agent-browser screenshot $OUT/v20_city.png >/dev/null && ok "截图 v20_city.png（白昼全城）"

echo "=== [6] 移动端 390×844 ==="
agent-browser set viewport 390 844
agent-browser wait 1800
agent-browser screenshot $OUT/v20_mobile.png >/dev/null && ok "截图 v20_mobile.png"
agent-browser errors --json 2>/dev/null | python3 -c "import json,sys
try:
  for e in json.load(sys.stdin).get('data',{}).get('errors',[]): print('  ✗ '+e.get('text','').split(chr(10))[0][:150])
except Exception: pass"

echo ""
echo "=========================================="
echo "  v20 E2E: $PASS 通过 / $FAIL 失败"
echo "=========================================="
exit $((FAIL > 0 ? 1 : 0))
