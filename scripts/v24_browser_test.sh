#!/bin/bash
# ============================================================
# v24_browser_test.sh — 消防空间化「烈火雄心·消防之城」端到端验证
# 布局（已购领地 112-143，cityhall 锚点 127,127 占 127-128²；道路 y=126/127/128 主干 + 南下支线 x=113(y=128..140) + 商街 y=140(x=112..118) + 消防局支线 x=122(y=128..133)）：
#   S0 初始：无 res/com/ind → fireCover=100（分母 0 守护）
#   S1 两商铺 + pop 拉升：A(124,130) 距 hall 3 → 消防盲区·治安覆盖（距 3 ≤ SEC_R 3 对照前提）；
#        B(129,129) 距 2 → 双覆盖 → fireCover=50；pop=60 使 staffing=1（S2 对照前提）
#   S2 收入对照（拆/建两拍，jobs/power/pop 恒定）：A 盲区 vs A'(126,129) 距 2 覆盖 → 比值 8.4/8.19≈1.026
#   S3 拆 A' + 南郊三铺 (112,141)(114,141)(116,141) + 远宅 (115,139)（互距 ≤2 蔓延链）→ fireOut=4 → 编年史「祝融之灾」
#   S4 消防栓 (113,142) r2 圈住 (112,141)/(114,141) → fireOut 4→2 / hydrants=1；拆栓复原 4（版本重算）
#   S5 消防局 (123,132)（邻 x=122 支路·距南郊 ≥9 不覆盖）+ forceEvent('fire')
#        → heat=0.35 · fx 必为盲区 · 消防车出警（kind 9 mission）
#   S6 蔓延：heat=1.55 逼判定 → spreadN≥1 · fx 跳邻栋 · 编年史「火势蔓延」· 视图 spreadN
#   S7 resolveEvent → rescueFire=1 · resolved 冻结 · 编年史「烈火英雄」带过火栋数
#   S8 灭火循环 ×4 → rescueFire=5 → 成就「烈火雄心」
#   S9 消防栓 (114,139) r2 盖全盲区 → fireCover=100 + pop=300 → 成就「铜墙铁壁」+ 编年史「固若金汤」
#   N 段：消防心声直测（voice ctx fireOut=5 crime=0）+ citzVoice() 回归 + 亲历者史册 onFireAt/onFireSaved
#   R 段：烈火特写 + 消防栓近景 + 盲区火苗警示 PNG 像素对照 + 存档往返（heat/spreadN/spreadT 序列化）+ 零错误 + 双端截图
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
orangecnt() { python3 -c "
from PIL import Image
im = Image.open('$1').convert('RGB')
n = 0
for p in im.getdata():
    if p[0] > 225 and 110 < p[1] < 185 and p[2] < 90: n += 1
print(n)"; }

echo "=== [1] 桌面端 1440×900 新档开局 ==="
agent-browser close >/dev/null 2>&1; sleep 1
agent-browser set viewport 1440 900
agent-browser open $B
agent-browser storage local clear >/dev/null 2>&1
agent-browser reload
agent-browser wait --fn "window.__pxc!==undefined" --timeout 90000 && ok "引擎就绪" || bad "引擎超时"
agent-browser wait 3000
agent-browser eval "(()=>{const b=[...document.querySelectorAll('button')].filter(x=>(x.textContent||'').includes('跳过'));if(b.length)b[b.length-1].click();return 'tut';})()" >/dev/null 2>&1
# 道路网：主干 y=126/127/128 + 南下支线 x=113(y=128..140) + 商街 y=140(x=112..118) + 消防局支线 x=122(y=128..133)
agent-browser eval "(()=>{const e=window.__pxc;const t=e.tycoon;t.level=9;t.coins=30000;
for(let x=112;x<=136;x++){e.map.setRoad(x,126,true);e.map.setRoad(x,127,true);e.map.setRoad(x,128,true);}
for(let y=128;y<=140;y++)e.map.setRoad(113,y,true);
for(let x=112;x<=118;x++)e.map.setRoad(x,140,true);
for(let y=128;y<=133;y++)e.map.setRoad(122,y,true);
return 'roads';})()" >/dev/null 2>&1

echo "=== [2] S 段：消防覆盖判定 ==="
# S0：初始态（无 res/com/ind → 分母 0 守护）
S0=$(agent-browser eval "JSON.stringify((()=>{const e=window.__pxc;const t=e.tycoon;
t.tick(0.05,e.map);const v=t.view();
return {cover:v.fireCover,inn:v.fireIn,out:v.fireOut,hyd:v.hydrants};})())" 2>/dev/null | grep -m1 . | stripq)
chk "S0 初始无生产生活建筑 cover=100" "$(echo "$S0" | grep -o 'cover:[0-9]*,inn:[0-9]*,out:[0-9]*,hyd:[0-9]*')" "cover:100,inn:0,out:0,hyd:0"
# S1：A(124,130) 距 hall 3 → 消防盲区·治安覆盖；B(129,129) 距 2 → 双覆盖；pop=60 拉 staffing（S2 前提）
S1=$(agent-browser eval "JSON.stringify((()=>{const e=window.__pxc;const t=e.tycoon;
e.map.place('shop',0,124,130);e.map.place('shop',1,129,129);
t.pop=60;t.tick(0.05,e.map);const v=t.view();
const A=e.map.idx(124,130);
return {cover:v.fireCover,inn:v.fireIn,out:v.fireOut,inc:Math.round(v.incomeCom*100)/100,
blindA:t.fireMissField.has(A),secA:t.secField.has(A)};})())" 2>/dev/null | grep -m1 . | stripq)
chk "S1 一盲一盖 cover=50" "$(echo "$S1" | grep -o 'cover:50,inn:1,out:1')" "cover:50,inn:1,out:1"
chk "S1b A 为消防盲区·治安覆盖（对照前提）" "$(echo "$S1" | grep -o 'blindA:true,secA:true')" "blindA:true,secA:true"
INC1=$(echo "$S1" | grep -o 'inc:[0-9.]*' | cut -d: -f2)
chkge "S1b pop 拉升后 incomeCom>0（staffing 前提）" "${INC1:--1}" "1"
# S2：收入对照（拆 A 盲区 → A'(126,129) 距 2 覆盖；两拍间 jobs/power/pop 恒定）
S2=$(agent-browser eval "JSON.stringify((()=>{const e=window.__pxc;const t=e.tycoon;
const c1=t.view().incomeCom;
e.map.bulldoze(124,130);
const a2=e.map.place('shop',0,126,129);
t.tick(0.05,e.map);const c2=t.view().incomeCom;
const r=c2/c1;
return {c1:Math.round(c1*1000)/1000,c2:Math.round(c2*1000)/1000,r:Math.round(r*1000)/1000,ok:!!a2};})())" 2>/dev/null | grep -m1 . | stripq)
R2V=$(echo "$S2" | grep -o 'r:[0-9.]*' | cut -d: -f2)
if [ -n "$R2V" ] && python3 -c "exit(0 if 1.02 <= $R2V <= 1.03 else 1)" 2>/dev/null; then
  ok "S2 盲区收入 ×0.95 对照（比值 $R2V ≈ 1.026）"
else
  bad "S2 收入对照（got=$R2V want≈1.02~1.03）"
fi
# S3：拆 A' + 南郊三铺 + 远宅 (115,139)（互距 ≤2 蔓延链）→ fireOut=4 → 编年史「祝融之灾」
S3=$(agent-browser eval "JSON.stringify((()=>{const e=window.__pxc;const t=e.tycoon;
e.map.bulldoze(126,129);
e.map.place('shop',0,112,141);e.map.place('shop',1,114,141);e.map.place('shop',0,116,141);
const hz=e.map.place('house',0,115,139);
t.tick(0.05,e.map);const v=t.view();
const z=[...t.chron.entries].some(c=>c.title==='祝融之灾');
return {hz:!!hz,out:v.fireOut,cover:v.fireCover,chron:z?'y':'n'};})())" 2>/dev/null | grep -m1 . | stripq)
chk "S3 南郊盲区群 fireOut=4 · 编年史「祝融之灾」" "$(echo "$S3" | grep -o 'hz:true,out:4,cover:20,chron:y')" "hz:true,out:4,cover:20,chron:y"
# S4：消防栓 (113,142) r2 圈住 (112,141)/(114,141) → fireOut=2；拆栓复原（版本重算）
S4=$(agent-browser eval "JSON.stringify((()=>{const e=window.__pxc;const t=e.tycoon;
const hy=e.map.place('hydrant',0,113,142);
t.tick(0.05,e.map);const a=t.view();
e.map.bulldoze(113,142);
t.tick(0.05,e.map);const b=t.view();
return {hy:!!hy,hyd:a.hydrants,outA:a.fireOut,outB:b.fireOut,hydB:b.hydrants};})())" 2>/dev/null | grep -m1 . | stripq)
chk "S4 消防栓 r2 覆盖（盖 2 复原 4·hyd 1→0）" "$(echo "$S4" | grep -o 'hy:true,hyd:1,outA:2,outB:4,hydB:0')" "hy:true,hyd:1,outA:2,outB:4,hydB:0"
# S5：消防局 (123,132)（邻 x=122 支路）+ forceEvent → heat/fx 盲区
agent-browser eval "(()=>{const e=window.__pxc;const fs=e.map.place('firestation',0,123,132);e.tycoon.tick(0.05,e.map);return 'fs'+!!fs;})()" >/dev/null 2>&1
S5=$(agent-browser eval "JSON.stringify((()=>{const e=window.__pxc;const t=e.tycoon;
const ok=t.forceEvent('fire',e.map);
const ev=t.events.find(x=>x.key==='fire');
const blind=ev?t.fireMissField.has(e.map.idx(ev.fx.x,ev.fx.y)):false;
t.tick(0.05,e.map);
const v=t.view();
return {ok:ok,hit:!!ev,heat:ev?Math.round(ev.heat*100)/100:-1,sn:ev?ev.spreadN:-1,blind,fs:v.firestations};})())" 2>/dev/null | grep -m1 . | stripq)
chk "S5 forceEvent 火灾实景（heat=0.35 · 现场必为盲区）" "$(echo "$S5" | grep -o 'ok:true,hit:true,heat:0.35,sn:0,blind:true,fs:1')" "ok:true,hit:true,heat:0.35,sn:0,blind:true,fs:1"
# S5b：消防车出警（engine 消费 dispatch → kind 9 mission actor）
agent-browser wait 1500
S5b=$(agent-browser eval "(()=>{const e=window.__pxc;const a=(e.actors&&e.actors.actors)||[];
const m=a.filter(x=>x.kind===9&&x.mission).length;
return 'm'+m;})()" 2>/dev/null | grep -m1 . | tr -d '" ')
chk "S5b 消防车出警（kind 9 mission）" "${S5b:-x}" "m1"
# S6：蔓延（heat=1.55 逼判定 → 火头跳邻栋）
S6=$(agent-browser eval "JSON.stringify((()=>{const e=window.__pxc;const t=e.tycoon;
const ev=t.events.find(x=>x.key==='fire');
if(!ev)return {sn:-1};
const c0=Math.round(t.coins);
ev.heat=1.55;ev.spreadT=0.05;
let f=null;
for(let i=0;i<14;i++){t.tick(0.5,e.map);f=t.events.find(x=>x.key==='fire');if(f&&f.spreadN>0)break;}
if(!f)return {sn:-2};
const c1=Math.round(t.coins);
const z=[...t.chron.entries].filter(c=>c.title==='火势蔓延').length;
const vv=t.view().events.find(x=>x.key==='fire');
return {sn:f.spreadN,coinsDown:c1<c0,chron:z,vSn:vv?vv.spreadN:-1};})())" 2>/dev/null | grep -m1 . | stripq)
SN6=$(echo "$S6" | grep -o 'sn:[0-9-]*' | head -1 | cut -d: -f2)
CH6=$(echo "$S6" | grep -o 'chron:[0-9]*' | cut -d: -f2)
VS6=$(echo "$S6" | grep -o 'vSn:[0-9-]*' | cut -d: -f2)
CD6=$(echo "$S6" | grep -o 'coinsDown:[a-z]*' | cut -d: -f2)
chkge "S6a 火势蔓延（spreadN≥1）" "${SN6:--1}" "1"
chkge "S6b 编年史「火势蔓延」入册" "${CH6:--1}" "1"
chkge "S6c 视图事件带 spreadN" "${VS6:--1}" "1"
chk "S6d 蔓延即时扣款（金币下降）" "${CD6:-x}" "true"
# S7：resolveEvent → rescueFire / resolved / 编年史烈火英雄（带过火）
S7=$(agent-browser eval "JSON.stringify((()=>{const e=window.__pxc;const t=e.tycoon;
const r=t.resolveEvent('fire');
const f=t.events.find(x=>x.key==='fire');
const h=[...t.chron.entries].find(c=>c.title==='烈火英雄');
return {r,rf:t.rescueFire,res:f?f.resolved:false,
hero:h?(/过火/.test(h.text)?'y2':'y1'):'n'};})())" 2>/dev/null | grep -m1 . | stripq)
chk "S7 应急到场（rescueFire=1 · resolved 冻结 · 烈火英雄带过火栋数）" "$(echo "$S7" | grep -o 'r:true,rf:1,res:true,hero:y2')" "r:true,rf:1,res:true,hero:y2"
# S8：灭火循环 ×4 → rescueFire=5 → 成就「烈火雄心」
S8=$(agent-browser eval "JSON.stringify((()=>{const e=window.__pxc;const t=e.tycoon;
for(let k=0;k<4;k++){
t.tick(3.6,e.map);
t.forceEvent('fire',e.map);
t.resolveEvent('fire');
}
t.tick(2.2,e.map);
return {rf:t.rescueFire,achv:t.achv.has('blaze5')?'y':'n'};})())" 2>/dev/null | grep -m1 . | stripq)
chk "S8 灭火 5 场 → 成就「烈火雄心」" "$(echo "$S8" | grep -o 'rf:5,achv:y')" "rf:5,achv:y"
# S9：消防栓 (114,139) 盖全盲区 + pop=300 → cover=100 → 成就「铜墙铁壁」+ 编年史「固若金汤」
S9=$(agent-browser eval "JSON.stringify((()=>{const e=window.__pxc;const t=e.tycoon;
const hy=e.map.place('hydrant',1,114,139);
t.pop=300;
t.tick(0.05,e.map);const v=t.view();
t.tick(2.2,e.map);
const g=[...t.chron.entries].some(c=>c.title==='固若金汤');
return {hy:!!hy,cover:v.fireCover,hyd:v.hydrants,fw:t.achv.has('firewall')?'y':'n',g:g?'y':'n'};})())" 2>/dev/null | grep -m1 . | stripq)
chk "S9 全覆盖 100% → 成就「铜墙铁壁」+ 编年史「固若金汤」" "$(echo "$S9" | grep -o 'hy:true,cover:100,hyd:1,fw:y,g:y')" "hy:true,cover:100,hyd:1,fw:y,g:y"

echo "=== [3] N 段：心声 + 亲历者史册 ==="
# N1：消防心声直测（voice ctx fireOut=5 · crime=0 → 命中消防文案）
N1=$(agent-browser eval "JSON.stringify((()=>{const e=window.__pxc;const t=e.tycoon;
try{
t.citz.baseline(0);
for(let k=0;k<6;k++){
t.citz.tick(0.05,e.map,{pop:(k+1)*2,happiness:60,taxRate:9,season:1,famine:0,events:[],fest:-1,smog:0,dark:0,waste:0,eduOut:0,crime:0,fireOut:5},t.playtime);
}
let hit=false;
for(let k=0;k<60;k++){
const v=t.citz.voice({pop:12,happiness:60,taxRate:9,season:1,famine:0,events:[],fest:-1,smog:0,dark:0,waste:0,eduOut:0,crime:0,fireOut:5});
if(v&&/消防栓|火险|红桩子|消防车/.test(v.text)){hit=true;break;}
}
return hit?'hit':'miss';
}catch(err){return 'ERR:'+(err&&err.message?err.message:String(err));}})())" 2>/dev/null | grep -m1 . | stripq)
chk "N1 消防心声命中（60 抽必中）" "$(echo "${N1:-x}" | grep -o 'hit\|ERR:[^}]*')" "hit"
# N2：citzVoice() 正常返回（fireOut 字段接线回归）
N2=$(agent-browser eval "(()=>{const v=window.__pxc.tycoon.citzVoice();return v?'ok':'null';})()" 2>/dev/null | grep -m1 . | tr -d '"')
chk "N2 citzVoice() 正常返回" "${N2:-x}" "ok"
# N3：亲历者史册 onFireAt（对全部住户坐标点火 → 住户/街坊写入个人史册）
N3=$(agent-browser eval "JSON.stringify((()=>{const t=window.__pxc.tycoon;
const seen=new Set();
for(const c of t.citz.roster){if(c.homeAt)seen.add(c.homeAt[0]+','+c.homeAt[1]);}
for(const h of seen){const p=h.split(',');t.citz.onFireAt(+p[0],+p[1],t.playtime,false);}
let hitHome=0;
for(const c of t.citz.roster){
if(c.log.some(l=>/家中失火|半条街的邻居/.test(l.text)))hitHome++;
}
return {homes:seen.size,hitHome};})())" 2>/dev/null | grep -m1 . | stripq)
HOMES=$(echo "${N3:-x}" | grep -o 'homes:[0-9]*' | cut -d: -f2)
HITH=$(echo "${N3:-x}" | grep -o 'hitHome:[0-9]*' | cut -d: -f2)
chkge "N3a 住户建筑 ≥1（homeAt 落远宅）" "${HOMES:--1}" "1"
chkge "N3b 亲历者史册（住户受灾 ≥1）" "${HITH:--1}" "1"
# N4：火场获救感恩 onFireSaved（同一批住户 → 感恩史册）
N4=$(agent-browser eval "(()=>{const t=window.__pxc.tycoon;
const seen=new Set();
for(const c of t.citz.roster){if(c.homeAt)seen.add(c.homeAt[0]+','+c.homeAt[1]);}
for(const h of seen){const p=h.split(',');t.citz.onFireSaved(+p[0],+p[1],t.playtime);}
let hit=0;
for(const c of t.citz.roster)if(c.log.some(l=>/恩情记一辈子/.test(l.text)))hit++;
return 'saved'+hit;})()" 2>/dev/null | grep -m1 . | tr -d '" ')
SAVED=$(echo "${N4:-x}" | grep -o 'saved[0-9]*' | cut -d d -f 2)
chkge "N4 火场获救感恩史册（≥1）" "${SAVED:--1}" "1"

echo "=== [4] R 段：渲染 + 存档往返 ==="
# R1：烈火特写（forceEvent → heat=1.55 烈火档 + 蔓延 ×2 → 截图）
agent-browser eval "(()=>{const e=window.__pxc;const t=e.tycoon;
t.tick(3.6,e.map);
t.forceEvent('fire',e.map);
const ev=t.events.find(x=>x.key==='fire');
if(ev){ev.heat=1.55;ev.spreadN=1;ev.spreadT=0.05;
for(let i=0;i<14;i++){t.tick(0.5,e.map);const f=t.events.find(x=>x.key==='fire');if(f&&f.spreadN>=2)break;}}
if(ev)e.centerAt(ev.fx.x,ev.fx.y);
return 'fire';})()" >/dev/null 2>&1
agent-browser wait 1500
agent-browser screenshot $OUT/v24_blaze_closeup.png >/dev/null && ok "截图 v24_blaze_closeup.png（烈火 stage2 + 过火标签）"
# R2：消防栓近景（定位 (114,139)）
agent-browser eval "(()=>{const e=window.__pxc;e.centerAt(114,139);return 'hyd';})()" >/dev/null 2>&1
agent-browser wait 1200
agent-browser screenshot $OUT/v24_hydrant_closeup.png >/dev/null && ok "截图 v24_hydrant_closeup.png（消防栓近景）"
# R3：存档往返（在途火场 heat/spreadN/spreadT 序列化 + 灭火计数 + 编年史 + 成就 + 覆盖重算）
R3b=$(agent-browser eval "(()=>{const e=window.__pxc;const t=e.tycoon;
const ev=t.events.find(x=>x.key==='fire');
if(ev){ev.heat=1.23;ev.spreadN=2;ev.spreadT=999;}
const v=t.view();
t.save(e.map);
return 'saved';})()" 2>/dev/null | grep -m1 . | tr -d '" ')
agent-browser reload >/dev/null 2>&1
agent-browser wait --fn "window.__pxc!==undefined" --timeout 90000 >/dev/null 2>&1
agent-browser wait 3000
R3a=$(agent-browser eval "JSON.stringify((()=>{const e=window.__pxc;const t=e.tycoon;
t.tick(0.05,e.map);
const ev=t.events.find(x=>x.key==='fire');
const v=t.view();
const g=[...t.chron.entries].some(y=>y.title==='固若金汤');
const z=[...t.chron.entries].some(y=>y.title==='祝融之灾');
return {heat:ev?Math.round(ev.heat*100)/100:0,sn:ev?ev.spreadN:-1,rf:v.rescueFire,cover:v.fireCover,g:g?'y':'n',z:z?'y':'n',a:(t.achv.has('firewall')&&t.achv.has('blaze5')?'y':'n')};})())" 2>/dev/null | grep -m1 . | stripq)
R3H=$(echo "${R3a:-x}" | grep -o 'heat:[0-9.]*' | cut -d: -f2)
R3S=$(echo "${R3a:-x}" | grep -o 'sn:[0-9-]*' | cut -d: -f2)
R3R=$(echo "${R3a:-x}" | grep -o 'rf:[0-9]*' | cut -d: -f2)
R3C=$(echo "${R3a:-x}" | grep -o 'cover:[0-9]*' | cut -d: -f2)
R3GZ=$(echo "${R3a:-x}" | grep -o 'g:y,z:y' )
R3A=$(echo "${R3a:-x}" | grep -o 'a:y')
if [ -n "$R3H" ] && python3 -c "exit(0 if 1.20 <= $R3H <= 1.45 else 1)" 2>/dev/null; then
  ok "R3a 在途火场 heat 恢复（$R3H ∈ 1.20~1.45·读档后引擎跑了数秒）"
else
  bad "R3a heat 恢复（got=$R3H want 1.20~1.45）"
fi
chk "R3b 过火栋数 spreadN 保持（spreadT=999 不误蔓延）" "${R3S:-x}" "2"
chk "R3c 灭火计数保持" "${R3R:-x}" "5"
chk "R3d 覆盖率重算 100%" "${R3C:-x}" "100"
chk "R3e 编年史救赎对完整（固若金汤+祝融之灾）" "${R3GZ:-x}" "g:y,z:y"
chk "R3f 双成就保持" "${R3A:-x}" "a:y"
# R4：盲区火苗警示 PNG 像素对照（拆 (114,139) 栓造 4 盲区 vs 复盖 → 橙色像素差）
agent-browser eval "(()=>{const e=window.__pxc;e.map.bulldoze(114,139);e.tycoon.tick(0.05,e.map);e.centerAt(114,140);return 'blind';})()" >/dev/null 2>&1
agent-browser wait 800
agent-browser screenshot $OUT/v24_blindzone_A.png >/dev/null
agent-browser eval "(()=>{const e=window.__pxc;e.map.place('hydrant',1,114,139);e.tycoon.tick(0.05,e.map);return 'cover';})()" >/dev/null 2>&1
agent-browser wait 800
agent-browser screenshot $OUT/v24_blindzone_B.png >/dev/null
ONA=$(orangecnt $OUT/v24_blindzone_A.png)
ONB=$(orangecnt $OUT/v24_blindzone_B.png)
if [ -n "$ONA" ] && [ -n "$ONB" ] && python3 -c "exit(0 if $ONA - $ONB >= 12 else 1)" 2>/dev/null; then
  ok "R4 盲区火苗警示 A/B 像素对照（盲区 $ONA − 覆盖 $ONB ≥ 12 橙像素）"
else
  bad "R4 盲区警示对照（盲区=${ONA:-x} 覆盖=${ONB:-x} 需差 ≥12）"
fi
ERR=$(errcount)
chk "R5 控制台零错误" "${ERR:-x}" "0"
# R6：城市全景（消防局 + 消防栓 + 蔓延过的南郊商街）
agent-browser eval "(()=>{const e=window.__pxc;e.centerAt(120,134);return 'city';})()" >/dev/null 2>&1
agent-browser wait 1200
agent-browser screenshot $OUT/v24_city.png >/dev/null && ok "截图 v24_city.png（南郊商街 + 消防局）"

echo "=== [5] 移动端 390×844 ==="
agent-browser set viewport 390 844
agent-browser wait 1800
agent-browser screenshot $OUT/v24_mobile.png >/dev/null && ok "截图 v24_mobile.png"
agent-browser errors --json 2>/dev/null | python3 -c "import json,sys
try:
  for e in json.load(sys.stdin).get('data',{}).get('errors',[]): print('  ✗ '+e.get('text','').split(chr(10))[0][:150])
except Exception: pass"

echo ""
echo "=========================================="
echo "  v24 E2E: $PASS 通过 / $FAIL 失败"
echo "=========================================="
exit $((FAIL > 0 ? 1 : 0))
