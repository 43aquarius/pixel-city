#!/bin/bash
# ============================================================
# v19_browser_test.sh — 污染空间化「工业之殇·绿水青山」端到端验证
# 布局（已购领地 112-143，路 y126-128）：
#   P1 单工厂 (122,124) 2×2 → 锚点格轻度 60
#   P2 炼油厂群 2×2 ×6：(114/116/118,122)+(114/116/118,124)
#      → 三栋重度住宅 H(114,121)=81 / H(116,121)=93.6 / H(118,121)=81
#   T1 双工厂 (130,124)+(132,124)，轻度格 (130,123)/(132,123)=45.6 → 种树 ×0.55 消失
#   E段 三塔 (115,120)+(118,120)+(112,123) → smogRes 归零
# ============================================================
set -u
B=http://localhost:3000
OUT=/home/z/my-project/scripts
PASS=0; FAIL=0
ok()   { echo "  ✓ $1"; PASS=$((PASS+1)); }
bad()  { echo "  ✗ $1"; FAIL=$((FAIL+1)); }
chk()  { if [ "$2" = "$3" ]; then ok "$1 ($2)"; else bad "$1 (got=$2 want=$3)"; fi; }
chkge() { if [ "${2%.*}" -ge "$3" ] 2>/dev/null; then ok "$1 ($2 >= $3)"; else bad "1 (got=$2 want>=$3)"; fi; }
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

echo "=== [2] P 段：污染空间场 ==="
agent-browser eval "(()=>{const e=window.__pxc;const t=e.tycoon;t.level=9;t.coins=30000;
for(let x=112;x<=136;x++){e.map.setRoad(x,126,true);e.map.setRoad(x,127,true);e.map.setRoad(x,128,true);}
return 'roads';})()" >/dev/null 2>&1
# P1：单工厂（2×2 占 122-123×124-125）→ 锚点格恰 60 轻度 → 恰 1 格
P1=$(agent-browser eval "JSON.stringify((()=>{const e=window.__pxc;const t=e.tycoon;
const ok=e.map.place('factory',0,122,124);t.tick(0.05,e.map);const v=t.view();
const c=t.smogField.get(e.map.idx(122,124))??0;
return {ok,n:v.smogTiles,c:Math.round(c)};})())" 2>/dev/null | tail -1 | stripq)
chk "P1a 单工厂可建 + 恰 1 格轻度雾霾" "${P1:-x}" "{ok:true,n:1,c:60}"
# P2：炼油厂群 2×6 + 3 栋重度住宅
P2=$(agent-browser eval "JSON.stringify((()=>{const e=window.__pxc;const t=e.tycoon;
const rs=[[114,122],[116,122],[118,122],[114,124],[116,124],[118,124]]
  .map(([x,y])=>e.map.place('refinery',0,x,y)).every(Boolean);
const hs=[[114,121],[116,121],[118,121]]
  .map(([x,y])=>e.map.place('house',0,x,y)).every(Boolean);
t.tick(0.05,e.map);const v=t.view();
return {rs,hs,res:v.smogRes,bad:v.smogBad,tiles:v.smogTiles};})())" 2>/dev/null | tail -1 | stripq)
R=$(echo "$P2" | grep -o 'res:[0-9]*' | cut -d: -f2)
BD=$(echo "$P2" | grep -o 'bad:[0-9]*' | cut -d: -f2)
TL=$(echo "$P2" | grep -o 'tiles:[0-9]*' | cut -d: -f2)
if [ "$(echo "$P2" | grep -o 'rs:[a-z]*')" = "rs:true" ]; then ok "P2a 炼油厂群 6 座建成"; else bad "P2a 建造失败 ($P2)"; fi
if [ "$(echo "$P2" | grep -o 'hs:[a-z]*')" = "hs:true" ]; then ok "P2b 三栋住宅贴厂建成"; else bad "P2b 住宅建造失败 ($P2)"; fi
chk "P2c 重污染住宅 smogRes=3" "${R:-x}" "3"
chkge "P2d 重污染格 smogBad ≥ 5" "${BD:-x}" "5"
chkge "P2e 雾霾覆盖 smogTiles ≥ 15" "${TL:-x}" "15"
agent-browser wait 900
# P4：编年史「雾霾围城」（mile / bad）
P4=$(agent-browser eval "(()=>{const es=window.__pxc.tycoon.chron.entries;const x=es.find(y=>y.title==='雾霾围城');return x?('tone:'+x.tone+'|cat:'+x.cat):'none';})()" 2>/dev/null | tail -1 | tr -d '"')
chk "P4 编年史「雾霾围城」入册（mile/bad）" "${P4:-x}" "tone:bad|cat:mile"
# P5：市民雾霾心声（先拉人口入册 → voice 构造 ctx 命中雾霾分支）
P5=$(agent-browser eval "JSON.stringify((()=>{const e=window.__pxc;const t=e.tycoon;
t.pop=24;for(let k=0;k<4;k++)t.tick(1,e.map);
const v=t.citz.voice({pop:24,happiness:60,taxRate:9,season:1,famine:0,events:[],fest:-1,smog:3});
return v?(/雾霾|烟味|口罩|见效|一整排树/.test(v.text)?'hit':'miss:'+v.text):'null';})())" 2>/dev/null | tail -1 | stripq)
chk "P5 市民雾霾心声" "$(echo "${P5:-x}" | grep -o 'hit\|miss:[^}]*\|null')" "hit"
agent-browser eval "(()=>{const e=window.__pxc;e.cam.x=(116-120.5)*16;e.cam.y=(123+120.5)*8-60;return 'cam';})()" >/dev/null 2>&1
agent-browser wait 700
agent-browser screenshot $OUT/v19_smog_city.png >/dev/null && ok "截图 v19_smog_city.png（雾霾工业区）"

echo "=== [3] T 段：树净化 ==="
T1=$(agent-browser eval "JSON.stringify((()=>{const e=window.__pxc;const t=e.tycoon;
const f1=e.map.place('factory',0,130,124);const f2=e.map.place('factory',0,132,124);
t.tick(0.05,e.map);const before=t.view().smogTiles;
const tr=[e.map.plantTree(130,123),e.map.plantTree(132,123)].every(Boolean);
t.tick(0.05,e.map);const after=t.view().smogTiles;
return {f1:f1&&f2,tr,before,after};})())" 2>/dev/null | tail -1 | stripq)
TA=$(echo "$T1" | grep -o 'after:[0-9]*' | cut -d: -f2)
TB=$(echo "$T1" | grep -o 'before:[0-9]*' | cut -d: -f2)
if [ "$(echo "$T1" | grep -o 'tr:[a-z]*')" = "tr:true" ]; then ok "T1a 两棵净化树栽下"; else bad "T1a 种树失败 ($T1)"; fi
if [ -n "$TA" ] && [ -n "$TB" ] && [ "$TA" -lt "$TB" ] 2>/dev/null; then ok "T1b 树净化生效（${TB} → ${TA} 格）"; else bad "T1b 净化未生效 (before=$TB after=$TA)"; fi

echo "=== [4] E 段：空气净化塔 ==="
E1=$(agent-browser eval "JSON.stringify((()=>{const e=window.__pxc;const t=e.tycoon;
const p=e.map.place('ecotower',0,115,120);t.tick(0.05,e.map);const v=t.view();
return {p,n:v.ecotowers};})())" 2>/dev/null | tail -1 | stripq)
chk "E1a 净化塔可建造（LV6 解锁档）" "$(echo "${E1:-x}" | grep -o 'p:[a-z]*')" "p:true"
chk "E1b view.ecotowers=1" "$(echo "${E1:-x}" | grep -o 'n:[0-9]*')" "n:1"
E2=$(agent-browser eval "JSON.stringify((()=>{const e=window.__pxc;const t=e.tycoon;
const t0=t.view().smogTiles;
const a=e.map.place('ecotower',1,118,120);const b=e.map.place('ecotower',0,112,123);
t.tick(0.05,e.map);const v=t.view();
return {a:a&&b,res:v.smogRes,tiles:v.smogTiles,t0};})())" 2>/dev/null | tail -1 | stripq)
ER=$(echo "$E2" | grep -o 'res:[0-9]*' | cut -d: -f2)
ET=$(echo "$E2" | grep -o 'tiles:[0-9]*' | cut -d: -f2)
ET0=$(echo "$E2" | grep -o 't0:[0-9]*' | cut -d: -f2)
if [ "$(echo "$E2" | grep -o 'a:[a-z]*')" = "a:true" ]; then ok "E2a 三塔建成（协同净化）"; else bad "E2a 建塔失败 ($E2)"; fi
chk "E2b 净化塔清光重污染住宅（smogRes=0）" "${ER:-x}" "0"
if [ -n "$ET" ] && [ -n "$ET0" ] && [ "$ET" -lt "$ET0" ] 2>/dev/null; then ok "E2c 雾霾大降（${ET0} → ${ET} 格）"; else bad "E2c 降幅异常 (t0=$ET0 → $ET)"; fi
agent-browser wait 2600
E3=$(agent-browser eval "window.__pxc.tycoon.achv.has('ecotower3')?'yes':'no'" 2>/dev/null | tail -1 | tr -d '"')
chk "E3 成就「城市之肺」解锁（3 塔）" "${E3:-x}" "yes"
agent-browser eval "(()=>{const e=window.__pxc;e.cam.x=(116-120.5)*16;e.cam.y=(122+120.5)*8-60;return 'cam';})()" >/dev/null 2>&1
agent-browser wait 700
agent-browser screenshot $OUT/v19_ecotower.png >/dev/null && ok "截图 v19_ecotower.png（三塔净化）"
# E4：拆 8 座工厂/炼油厂 → 污染源清零 → envIdx=100 →「重现蓝天」
E4=$(agent-browser eval "JSON.stringify((()=>{const e=window.__pxc;const t=e.tycoon;
for(const [x,y] of [[114,122],[116,122],[118,122],[114,124],[116,124],[118,124],[122,124],[130,124],[132,124]]) e.map.bulldoze(x,y);
t.tick(0.05,e.map);const v=t.view();
const x=[...t.chron.entries].reverse().find(y=>y.title==='重现蓝天');
return {env:v.envIdx,tiles:v.smogTiles,mile:x?('tone:'+x.tone):'none'};})())" 2>/dev/null | tail -1 | stripq)
chk "E4a 拆厂后环境指数回升=100" "$(echo "${E4:-x}" | grep -o 'env:[0-9]*')" "env:100"
chk "E4b 雾霾散尽 smogTiles=0" "$(echo "${E4:-x}" | grep -o 'tiles:[0-9]*')" "tiles:0"
chk "E4c 编年史「重现蓝天」入册（good）" "$(echo "${E4:-x}" | grep -o 'mile:tone:[a-z]*')" "mile:tone:good"
# E5：绿水青山（pop≥120 且 envIdx≥85）
agent-browser eval "(()=>{const t=window.__pxc.tycoon;t.pop=125;t.tick(0.05,window.__pxc.map);return 'set';})()" >/dev/null 2>&1
agent-browser wait 2600
E5V=$(agent-browser eval "window.__pxc.tycoon.achv.has('greencty')?'yes':'no'" 2>/dev/null | tail -1 | tr -d '"')
chk "E5 成就「绿水青山」解锁" "${E5V:-x}" "yes"

echo "=== [5] V 段：渲染 / 存档 ==="
agent-browser eval "(()=>{const e=window.__pxc;const t=e.tycoon;
e.map.place('factory',0,120,124);e.map.place('factory',0,122,124);
t.tick(0.05,e.map);const n0=t.view().smogTiles;
t.save(e.map);return 'saved:'+n0;})()" >/dev/null 2>&1
agent-browser reload >/dev/null 2>&1
agent-browser wait --fn "window.__pxc!==undefined" --timeout 90000 >/dev/null 2>&1
agent-browser wait 3000
V1=$(agent-browser eval "JSON.stringify((()=>{const e=window.__pxc;const t=e.tycoon;t.tick(0.05,e.map);
return {tiles:t.view().smogTiles,towers:t.view().ecotowers};})())" 2>/dev/null | tail -1 | stripq)
VT=$(echo "$V1" | grep -o 'tiles:[0-9]*' | cut -d: -f2)
VW=$(echo "$V1" | grep -o 'towers:[0-9]*' | cut -d: -f2)
chkge "V1a 存档往返：污染场派生重算（smogTiles ≥ 3）" "${VT:-x}" "3"
chk "V1b 净化塔随档保留（3 座）" "${VW:-x}" "3"
ERR=$(errcount)
chk "V2 控制台零错误" "${ERR:-x}" "0"
agent-browser eval "(()=>{const e=window.__pxc;e.cam.x=(121-120.5)*16;e.cam.y=(124+120.5)*8-60;return 'cam';})()" >/dev/null 2>&1
agent-browser wait 700
agent-browser screenshot $OUT/v19_city.png >/dev/null && ok "截图 v19_city.png（残霾+塔）"

echo "=== [6] 移动端 390×844 ==="
agent-browser set viewport 390 844
agent-browser wait 1800
agent-browser screenshot $OUT/v19_mobile.png >/dev/null && ok "截图 v19_mobile.png"
agent-browser errors --json 2>/dev/null | python3 -c "import json,sys
try:
  for e in json.load(sys.stdin).get('data',{}).get('errors',[]): print('  ✗ '+e.get('text','').split(chr(10))[0][:150])
except Exception: pass"

echo ""
echo "=========================================="
echo "  v19 E2E: $PASS 通过 / $FAIL 失败"
echo "=========================================="
exit $((FAIL > 0 ? 1 : 0))
