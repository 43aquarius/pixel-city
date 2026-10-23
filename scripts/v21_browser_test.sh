#!/bin/bash
# ============================================================
# v21_browser_test.sh — 环卫系统「拾荒之路·循环之城」端到端验证
# 布局（已购领地 112-143，cityhall 锚点 127,127 占 127-128²）：
#   W0 初始：cityhall pop=0 不产垃圾 → wasteN=0 / sweepCover=100（分母 0 守护）
#   W1 三住宅无设施：A(121,121) B(135,135) C(141,141) → 全堆积 3 处 cover=0
#   W2 收集站 S1(133,133) R6 → 覆盖 [127,139]²：B 转清运 / A(距12) C(距8) 仍堆积
#   W3 三工厂超载：F1(130,131) F2(133,131) F3(136,131)（距 S1 均 ≤3）
#      产能 5.28×3=15.84 > 14 → 近者优先：F2/F1 装下(10.65) F3 拒收 → 超载标记
#   W4 回收中心 R1(138,136) R8 → F3/C 转投 R1 → 只剩 A 堆积 + 回收收入进账
#   W5 拆三工厂（恢复环境）
#   W6 五栋远宅凑「垃圾围城」：A + D(112,120) G(115,128) H(112,126) I(121,114)
#      （全部预埋在 W8 回收中心 R2(118,122) R8 覆盖圈内）
#   W7 焚烧发电厂(141,120)：powerSup+30 / GRID_R6 接入 / 污染+3 → smogTiles=1
#   W8 回收中心 R2(118,122) → 西片全覆盖 → wasteN=0 / recycles=2
#   W9 拆焚烧厂 → envIdx 恢复 ≥75 → 编年史「循环之城」救赎闭环
#   W10 成就 cyclecty / spotless（pop=999 逼触发）
#   R 段：存档往返派生重算 + 零错误 + 双端截图
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

echo "=== [2] W 段：清运覆盖与超载分配 ==="
# W0：初始态（cityhall pop=0 不产垃 → 分母 0 守护 sweepCover=100）
W0=$(agent-browser eval "JSON.stringify((()=>{const e=window.__pxc;const t=e.tycoon;
t.tick(0.05,e.map);const v=t.view();
return {waste:v.wasteN,cover:v.sweepCover,swept:t.sweepField.size,over:v.sweepOverN};})())" 2>/dev/null | tail -1 | stripq)
chk "W0 初始零产垃 wasteN=0 / cover=100" "${W0:-x}" "{waste:0,cover:100,swept:0,over:0}"
# W1：三住宅无设施 → 全堆积（house 产率 0.09 → 浓度 55.9）
W1=$(agent-browser eval "JSON.stringify((()=>{const e=window.__pxc;const t=e.tycoon;
const a=e.map.place('house',0,121,121);const b=e.map.place('house',1,135,135);const c=e.map.place('house',2,141,141);
t.tick(0.05,e.map);const v=t.view();
return {a:a&&b&&c,waste:v.wasteN,res:v.wasteRes,cover:v.sweepCover,sw:v.sweeps,rc:v.recycles,ic:v.incins,
  wA:t.wasteField.get(e.map.idx(121,121))};})())" 2>/dev/null | tail -1 | stripq)
if [ "$(echo "$W1" | grep -o 'a:[a-z]*')" = "a:true" ]; then ok "W1a 三住宅建成（无环卫设施）"; else bad "W1a 建造失败 ($W1)"; fi
chk "W1b 全堆积 wasteN=3 / wasteRes=3 / cover=0" "$(echo "$W1" | grep -o 'waste:[0-9]*,res:[0-9]*,cover:[0-9]*')" "waste:3,res:3,cover:0"
chk "W1c 设施计数 sw=0 rc=0 ic=0" "$(echo "$W1" | grep -o 'sw:[0-9]*,rc:[0-9]*,ic:[0-9]*')" "sw:0,rc:0,ic:0"
CONC=$(echo "$W1" | grep -o 'wA:[0-9.]*' | cut -d: -f2)
chkge "W1d 堆积浓度 ≥55（黑袋可见）" "${CONC:-0}" "55"
# 心声：waste>0 命中环卫文案（先注入人口让名册有人，再直调 voice）
W1v=$(agent-browser eval "JSON.stringify((()=>{const e=window.__pxc;const t=e.tycoon;
try{
t.pop=60;for(let k=0;k<4;k++)t.tick(1,e.map);
const v=t.citz.voice({pop:60,happiness:60,taxRate:9,season:1,famine:0,events:[],fest:-1,smog:0,dark:0,waste:3});
return v?(/垃圾|清运|苍蝇|馊|回收/.test(v.text)?'hit':'miss:'+v.text):'null';
}catch(err){return 'ERR:'+(err&&err.message?err.message:String(err));}})())" 2>/dev/null | grep -m1 . | stripq)
chk "W1e 环卫心声命中" "$(echo "${W1v:-x}" | grep -o 'hit\|miss:[^}]*\|null\|ERR:[^}]*')" "hit"
# W2：收集站 S1(133,133) R6 → B(135,135 距2) 清运 / A(距12) C(距8) 仍堆积
W2=$(agent-browser eval "JSON.stringify((()=>{const e=window.__pxc;const t=e.tycoon;
const s=e.map.place('binshed',0,133,133);
t.tick(0.05,e.map);const v=t.view();
return {s,waste:v.wasteN,cover:v.sweepCover,sw:v.sweeps,over:v.sweepOverN,
  gB:t.sweepField.has(e.map.idx(135,135)),wA:t.wasteField.has(e.map.idx(121,121)),wC:t.wasteField.has(e.map.idx(141,141))};})())" 2>/dev/null | tail -1 | stripq)
if [ "$(echo "$W2" | grep -o 's:[a-z]*')" = "s:true" ]; then ok "W2a 收集站建成（R6 圈住 B）"; else bad "W2a 建造失败 ($W2)"; fi
chk "W2b B 清运 / A C 堆积：wasteN=2 / cover=33 / sw=1" "$(echo "$W2" | grep -o 'waste:[0-9]*,cover:[0-9]*,sw:[0-9]*')" "waste:2,cover:33,sw:1"
chk "W2c 场集合归属（sweep∋B / waste∋A,C）" "$(echo "$W2" | grep -o 'gB:[a-z]*,wA:[a-z]*,wC:[a-z]*')" "gB:true,wA:true,wC:true"
# W3：三工厂产能 15.84 > 14 → 近者优先：F2(距2) F1(距3) 装下 / F3(距3) 拒收 → 超载
W3=$(agent-browser eval "JSON.stringify((()=>{const e=window.__pxc;const t=e.tycoon;
const f=[e.map.place('factory',0,130,131),e.map.place('factory',1,133,131),e.map.place('factory',2,136,131)].every(Boolean);
t.tick(0.05,e.map);const v=t.view();
return {f,waste:v.wasteN,cover:v.sweepCover,over:v.sweepOverN,
  gF1:t.sweepField.has(e.map.idx(130,131)),gF2:t.sweepField.has(e.map.idx(133,131)),wF3:t.wasteField.has(e.map.idx(136,131))};})())" 2>/dev/null | tail -1 | stripq)
if [ "$(echo "$W3" | grep -o 'f:[a-z]*')" = "f:true" ]; then ok "W3a 三工厂建成（圈住 S1）"; else bad "W3a 建造失败 ($W3)"; fi
chk "W3b 近者优先分配：F1/F2 清运 F3 拒收（waste=3: A,C,F3 / cover=50）" "$(echo "$W3" | grep -o 'waste:[0-9]*,cover:[0-9]*')" "waste:3,cover:50"
chk "W3c 超载标记 over=1（S1 装不下第三座厂）" "$(echo "$W3" | grep -o ',over:[0-9]*')" ",over:1"
chk "W3d 场集合归属（sweep∋F1,F2 / waste∋F3）" "$(echo "$W3" | grep -o 'gF1:[a-z]*,gF2:[a-z]*,wF3:[a-z]*')" "gF1:true,gF2:true,wF3:true"
# W4：先放风车磨坊点亮东片（GRID_SRC R5：F3/R1 入网），再建回收中心 R1(138,136) R8
#（收入断言用快照 earnInd：不含 staffing/powerMult 稀释，差值恰为回收 earn 4.5）
W4=$(agent-browser eval "JSON.stringify((()=>{const e=window.__pxc;const t=e.tycoon;
const w=e.map.place('windmill',0,140,135);
t.tick(0.05,e.map);const ind0=t.snap.earnInd;
const r=e.map.place('recycle',0,138,136);
t.tick(0.05,e.map);const v=t.view();const ind1=t.snap.earnInd;
return {r:r&&w,waste:v.wasteN,cover:v.sweepCover,rc:v.recycles,gF3:t.sweepField.has(e.map.idx(136,131)),gC:t.sweepField.has(e.map.idx(141,141)),ind0,ind1};})())" 2>/dev/null | tail -1 | stripq)
if [ "$(echo "$W4" | grep -o '[{,]r:[a-z]*')" = "{r:true" ]; then ok "W4a 风车 + 回收中心建成（R8 接住 F3/C）"; else bad "W4a 建造失败 ($W4)"; fi
chk "W4b F3/C/风车转投回收：wasteN=1（只剩 A）/ cover=86（6/7，风车也产垃）/ rc=1" "$(echo "$W4" | grep -o 'waste:[0-9]*,cover:[0-9]*,rc:[0-9]*')" "waste:1,cover:86,rc:1"
I0=$(echo "$W4" | grep -o 'ind0:[0-9.-]*' | cut -d: -f2)
I1=$(echo "$W4" | grep -o 'ind1:[0-9.-]*' | cut -d: -f2)
if [ -n "$I0" ] && [ -n "$I1" ] && python3 -c "exit(0 if ($I1-$I0)>=4 else 1)" 2>/dev/null; then ok "W4c 回收收入进工业账（earnInd ${I0} → ${I1}，+4.5G/分）"; else bad "W4c 收入未增 (ind0=$I0 ind1=$I1)"; fi
# W5：拆三工厂与风车（恢复环境，为循环之城铺路）
W5=$(agent-browser eval "(()=>{const e=window.__pxc;
e.map.bulldoze(130,131);e.map.bulldoze(133,131);e.map.bulldoze(136,131);e.map.bulldoze(140,135);
e.tycoon.tick(0.05,e.map);return e.tycoon.view().wasteN;})()" 2>/dev/null | tail -1 | tr -d '" ')
chk "W5 拆工厂后 wasteN=1（只剩 A）" "${W5:-x}" "1"
# W6：四栋远宅凑围城（全预埋在 W8 回收圈 R2(118,122) R8 内；避开道路行 y=126/127/128）
W6=$(agent-browser eval "JSON.stringify((()=>{const e=window.__pxc;const t=e.tycoon;
const h=[[112,120],[115,130],[112,124],[121,114]].map(([x,y])=>e.map.place('house',0,x,y)).every(Boolean);
t.tick(0.05,e.map);const v=t.view();
const x=[...t.chron.entries].find(y=>y.title==='垃圾围城');
return {h,waste:v.wasteN,res:v.wasteRes,cover:v.sweepCover,mile:x?('tone:'+x.tone+'|cat:'+x.cat):'none'};})())" 2>/dev/null | tail -1 | stripq)
if [ "$(echo "$W6" | grep -o 'h:[a-z]*')" = "h:true" ]; then ok "W6a 四栋远宅建成（共 5 处堆积）"; else bad "W6a 建造失败 ($W6)"; fi
chk "W6b wasteN=5 / wasteRes=5 / cover=29" "$(echo "$W6" | grep -o 'waste:[0-9]*,res:[0-9]*,cover:[0-9]*')" "waste:5,res:5,cover:29"
chk "W6c 编年史「垃圾围城」（mile/bad）" "$(echo "$W6" | grep -o 'mile:tone:[a-z]*|cat:mile')" "mile:tone:bad|cat:mile"

echo "=== [3] S 段：焚烧发电三角联动 ==="
# S1：焚烧厂(141,120) → powerSup+30（cityhall 40 + incin 30 = 70）；h(139,119) 距 2 入电网
S1=$(agent-browser eval "JSON.stringify((()=>{const e=window.__pxc;const t=e.tycoon;
const i=e.map.place('incin',0,141,120);
const h=e.map.place('house',0,139,119);
t.tick(0.05,e.map);const v=t.view();
return {i:i&&h,sup:v.powerSup,ic:v.incins,smog:v.smogTiles,gH:t.gridField.has(e.map.idx(139,119))};})())" 2>/dev/null | tail -1 | stripq)
if [ "$(echo "$S1" | grep -o 'i:[a-z]*')" = "i:true" ]; then ok "S1a 焚烧发电厂建成 + 邻宅入网"; else bad "S1a 建造失败 ($S1)"; fi
chk "S1b 焚烧发电 powerSup=70（40+30）" "$(echo "$S1" | grep -o 'sup:[0-9]*')" "sup:70"
chk "S1c 焚烧厂是电网源（R6：邻宅 gridField 命中）" "$(echo "$S1" | grep -o 'gH:[a-z]*')" "gH:true"
chk "S1d 焚烧排污进雾霾场 smogTiles=1（污染+3 → 中心浓度 45）" "$(echo "$S1" | grep -o 'smog:[0-9]*')" "smog:1"
# 拆邻宅（不影响后续清运统计）
agent-browser eval "(()=>{window.__pxc.map.bulldoze(139,119);window.__pxc.tycoon.tick(0.05,window.__pxc.map);return 'rm';})()" >/dev/null 2>&1

echo "=== [4] N 段：循环之城闭环 / 成就 ==="
# N1：回收中心 R2(118,122) R8 → 西片 A/D/G/H/I 全覆盖 → wasteN=0
N1=$(agent-browser eval "JSON.stringify((()=>{const e=window.__pxc;const t=e.tycoon;
const r=e.map.place('recycle',1,118,122);
t.tick(0.05,e.map);const v=t.view();
return {r,waste:v.wasteN,cover:v.sweepCover,rc:v.recycles,env:v.envIdx};})())" 2>/dev/null | tail -1 | stripq)
if [ "$(echo "$N1" | grep -o '[{,]r:[a-z]*')" = "{r:true" ]; then ok "N1a 第二座回收中心建成（西片覆盖）"; else bad "N1a 建造失败 ($N1)"; fi
chk "N1b 全城清运 wasteN=0 / cover=100 / rc=2" "$(echo "$N1" | grep -o 'waste:[0-9]*,cover:[0-9]*,rc:[0-9]*')" "waste:0,cover:100,rc:2"
# N2：拆焚烧厂（污染源归零）→ envIdx≥75 → 循环之城入册
N2=$(agent-browser eval "JSON.stringify((()=>{const e=window.__pxc;const t=e.tycoon;
e.map.bulldoze(141,120);
t.tick(0.05,e.map);const v=t.view();
const x=[...t.chron.entries].reverse().find(y=>y.title==='循环之城');
return {waste:v.wasteN,env:v.envIdx,smog:v.smogTiles,mile:x?('tone:'+x.tone):'none'};})())" 2>/dev/null | tail -1 | stripq)
chkge "N2a 拆焚烧厂后 envIdx≥75（无污染无堆积）" "$(echo "$N2" | grep -o 'env:[0-9]*' | cut -d: -f2)" "75"
chk "N2b 雾霾场清空 smogTiles=0" "$(echo "$N2" | grep -o 'smog:[0-9]*')" "smog:0"
chk "N2c 编年史「循环之城」（good）—— 围城→治理救赎闭环" "$(echo "$N2" | grep -o 'mile:tone:[a-z]*')" "mile:tone:good"
# N3+N4：成就（pop=999 逼触发；achvTimer 2s 轮询）
agent-browser eval "(()=>{const t=window.__pxc.tycoon;t.pop=999;t.tick(0.05,window.__pxc.map);return 'pop';})()" >/dev/null 2>&1
agent-browser wait 2600
N3=$(agent-browser eval "window.__pxc.tycoon.achv.has('cyclecty')?'yes':'no'" 2>/dev/null | tail -1 | tr -d '"')
chk "N3 成就「循环之城」（回收×2 + 零堆积 + pop≥120）" "${N3:-x}" "yes"
N4=$(agent-browser eval "window.__pxc.tycoon.achv.has('spotless')?'yes':'no'" 2>/dev/null | tail -1 | tr -d '"')
chk "N4 成就「一尘不染」（pop≥300 且 cover=100）" "${N4:-x}" "yes"
# N5：citzVoice() 回归（CitzCtx.waste 必填字段接线）
N5=$(agent-browser eval "(()=>{const v=window.__pxc.tycoon.citzVoice();return v?'ok':'null';})()" 2>/dev/null | tail -1 | tr -d '"')
chk "N5 citzVoice() 正常返回（waste 字段兜底）" "${N5:-x}" "ok"

echo "=== [5] R 段：渲染 + 存档往返 ==="
# R1：重建堆积区（远宅 (112,143) 圈外）→ 相机对准 → 截图
agent-browser eval "(()=>{const e=window.__pxc;e.map.place('house',0,112,143);
e.tycoon.tick(0.05,e.map);e.cam.x=(120-120.5)*16;e.cam.y=(134+120.5)*8-80;return 'cam';})()" >/dev/null 2>&1
agent-browser wait 800
agent-browser screenshot $OUT/v21_city.png >/dev/null && ok "截图 v21_city.png（全城：环卫设施 + 单处堆积）"
# R2：存档往返（wasteField/sweepField 派生不进档，加载后重算）
R2b=$(agent-browser eval "(()=>{const e=window.__pxc;const v=e.tycoon.view();return v.wasteN+'|'+v.sweepCover+'|'+v.recycles+'|'+v.sweeps;})()" 2>/dev/null | tail -1 | tr -d '" ')
agent-browser eval "(()=>{const e=window.__pxc;e.tycoon.save(e.map);return 'saved';})()" >/dev/null 2>&1
agent-browser reload >/dev/null 2>&1
agent-browser wait --fn "window.__pxc!==undefined" --timeout 90000 >/dev/null 2>&1
agent-browser wait 3000
R2a=$(agent-browser eval "(()=>{const e=window.__pxc;e.tycoon.tick(0.05,e.map);const v=e.tycoon.view();
return v.wasteN+'|'+v.sweepCover+'|'+v.recycles+'|'+v.sweeps;})()" 2>/dev/null | tail -1 | tr -d '" ')
chk "R2a 存档往返：堆积复算（前=${R2b:-x} 后=${R2a:-x}）" "${R2a:-x}" "1|88|2|1"
ERR=$(errcount)
chk "R2b 控制台零错误" "${ERR:-x}" "0"

echo "=== [6] 移动端 390×844 ==="
agent-browser set viewport 390 844
agent-browser wait 1800
agent-browser screenshot $OUT/v21_mobile.png >/dev/null && ok "截图 v21_mobile.png"
agent-browser errors --json 2>/dev/null | python3 -c "import json,sys
try:
  for e in json.load(sys.stdin).get('data',{}).get('errors',[]): print('  ✗ '+e.get('text','').split(chr(10))[0][:150])
except Exception: pass"

echo ""
echo "=========================================="
echo "  v21 E2E: $PASS 通过 / $FAIL 失败"
echo "=========================================="
exit $((FAIL > 0 ? 1 : 0))
