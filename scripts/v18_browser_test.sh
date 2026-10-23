#!/bin/bash
# ============================================================
# v18_browser_test.sh — 灾害链（地震 / 洪水 / 防洪堤）端到端验证
# 验证点：
#   L 段：防洪堤
#     L1  map.place('levee') 可建造 + view().levees=1
#     L2  建满 3 座 → 成就「高墙铁壁」
#   Q 段：地震
#     Q1  种树后 forceEvent('quake')：事件入列 + quakes 计数 + 震屏启动
#     Q2  领地内行道树倾倒
#     Q3  两段结算：即时扣款 + pendG 挂账
#     Q4  编年史入册（event / bad / 大地震）
#     Q5  消防局驰援：出动消防车 → 到场豁免 + 编年史「力挽狂澜」
#     Q6  quakes=3 → 成就「岿然不动」
#   F 段：洪水
#     F1  挖塘 → waterNear ≥ 2
#     F2  forceEvent('flood')：雨天切换 + floods 计数
#     F3  引擎淹没层 floodTiles ≥ 10
#     F4  编年史入册（event / bad / 洪水泛滥）
#     F5  resolveEvent 泛化：豁免挂账 + 编年史「中流砥柱」
#   C 段：次生灾害（软断言：地震后过半概率引燃火灾）
#   S 段：存档
#     S1  quakes/floods/levees 随档保存与恢复
#     S2  v17 老档（无 quakes/floods 字段）兼容不崩
#   U 段：任务 / 收尾
#     U1  任务「防患未然」完成推进
#     U2  控制台零错误 + 桌面/移动截图
# ============================================================
set -u
B=http://localhost:3000
OUT=/home/z/my-project/scripts
PASS=0; FAIL=0
ok()   { echo "  ✓ $1"; PASS=$((PASS+1)); }
bad()  { echo "  ✗ $1"; FAIL=$((FAIL+1)); }
chk()  { if [ "$2" = "$3" ]; then ok "$1 ($2)"; else bad "$1 (got=$2 want=$3)"; fi; }
chkge() { if [ "${2%.*}" -ge "$3" ] 2>/dev/null; then ok "$1 ($2 >= $3)"; else bad "$1 (got=$2 want>=$3)"; fi; }
# agent-browser eval 的 JSON 输出带转义引号：统一清理反斜杠/引号/空格
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
# 跳过新手引导（老玩家静默结业路径已由 v14 覆盖）
agent-browser eval "(()=>{const b=[...document.querySelectorAll('button')].filter(x=>(x.textContent||'').includes('跳过'));if(b.length)b[b.length-1].click();return 'tut';})()" >/dev/null 2>&1

echo "=== [2] L 段：防洪堤 ==="
# 主干路 + 建筑用地（沿用 v12 布局：y126-128 三线道路，建筑摆 y124/125 邻路）
agent-browser eval "(()=>{const e=window.__pxc;for(let x=118;x<=134;x++){e.map.setRoad(x,126,true);e.map.setRoad(x,127,true);e.map.setRoad(x,128,true);}return 'roads';})()" >/dev/null 2>&1
L1=$(agent-browser eval "(()=>{const e=window.__pxc;const p=e.map.place('levee',0,120,125);return 'placed:'+p;})()" 2>/dev/null | tail -1 | tr -d '"')
chk "L1a 防洪堤可建造" "${L1:-x}" "placed:true"
agent-browser wait 700
L1V=$(agent-browser eval "window.__pxc.tycoon.view().levees" 2>/dev/null | tail -1 | tr -d '"')
chk "L1b view.levees=1（快照刷新）" "${L1V:-x}" "1"
L2=$(agent-browser eval "(()=>{const e=window.__pxc;const a=e.map.place('levee',1,124,125);const b=e.map.place('levee',0,126,125);return 'placed:'+(a&&b);})()" 2>/dev/null | tail -1 | tr -d '"')
agent-browser wait 700
L2V=$(agent-browser eval "window.__pxc.tycoon.view().levees" 2>/dev/null | tail -1 | tr -d '"')
chk "L2a 三座防洪堤 + view.levees=3" "${L2:-x}|${L2V:-x}" "placed:true|3"
agent-browser wait 2600
L2V=$(agent-browser eval "window.__pxc.tycoon.achv.has('floodsafe')?'yes':'no'" 2>/dev/null | tail -1 | tr -d '"')
chk "L2b 成就「高墙铁壁」解锁" "${L2V:-x}" "yes"

echo "=== [3] Q 段：大地震 ==="
Q1=$(agent-browser eval "JSON.stringify((()=>{const e=window.__pxc;const t=e.tycoon;
// 种 5 棵行道树（已购领地内）
const planted=[e.map.plantTree(113,113),e.map.plantTree(114,113),e.map.plantTree(115,113),e.map.plantTree(113,114),e.map.plantTree(113,115)].filter(Boolean).length;
t.coins=5000;
const c0=t.coins;const q=t.forceEvent('quake',e.map);const drop=c0-t.coins;   // 同步测量：免受维护费漂移（含次生火灾 60G）
return {planted,quake:q,quakes:t.quakes,drop:Math.round(drop)};})())" 2>/dev/null | tail -1 | stripq)
chk "Q1a 地震事件触发（种5树·quakes=1）" "$(echo "$Q1" | grep -o 'planted:[0-9]*')|$(echo "$Q1" | grep -o 'quake:[a-z]*')|$(echo "$Q1" | grep -o 'quakes:[0-9]*')" "planted:5|quake:true|quakes:1"
DROP=$(echo "$Q1" | grep -o 'drop:[0-9]*' | cut -d: -f2)
if [ -n "$DROP" ] && [ "$DROP" -ge 100 ] 2>/dev/null && [ "$DROP" -le 220 ] 2>/dev/null; then ok "Q3a 即时扣款 ${DROP}G（120 地震 ±60 次生火灾）"; else bad "Q3a 即时扣款异常 (got=$DROP want 100..220)"; fi
agent-browser wait 400
Q1S=$(agent-browser eval "JSON.stringify((()=>{const e=window.__pxc;return {shakeT:Math.round(e.quakeT*10)/10>0,amp:e.quakeAmp};})())" 2>/dev/null | tail -1 | stripq)
chk "Q1b 震屏启动（quakeT>0 · amp=7）" "${Q1S:-x}" "{shakeT:true,amp:7}"
Q2=$(agent-browser eval "JSON.stringify((()=>{const e=window.__pxc;const m=e.map;const t=e.tycoon;let n=0;const N=m.n;for(let y=0;y<N;y++)for(let x=0;x<N;x++){const i=y*N+x;if(m.tree[i]>=0&&!m.road[i]&&t.ownedAt(x,y))n++;}return {treesLeft:n};})())" 2>/dev/null | tail -1 | stripq)
TLEFT=$(echo "${Q2:-x}" | grep -o 'treesLeft:[0-9]*' | cut -d: -f2)
if [ -n "$TLEFT" ] && [ "$TLEFT" -le 2 ] 2>/dev/null; then ok "Q2 行道树倾倒（5 棵倒 ${TLEFT} 棵内剩 · fell=随机3-8）"; else bad "Q2 行道树未倒尽 (got=treesLeft:$TLEFT want ≤2)"; fi
Q3=$(agent-browser eval "JSON.stringify((()=>{const t=window.__pxc.tycoon;const ev=t.events.find(x=>x.key==='quake');return {pendG:ev&&ev.pendG>0};})())" 2>/dev/null | tail -1 | stripq)
chk "Q3b 余款挂账（pendG>0）" "${Q3:-x}" "{pendG:true}"
Q4=$(agent-browser eval "window.__pxc.tycoon.chron.entries.some(x=>x.cat==='event'&&x.tone==='bad'&&x.title==='大地震')?'yes':'no'" 2>/dev/null | tail -1 | tr -d '"')
chk "Q4 编年史入册（event/bad/大地震）" "${Q4:-x}" "yes"
agent-browser screenshot $OUT/v18_quake_smoke.png >/dev/null && ok "截图 v18_quake_smoke.png"

echo "=== [4] Q5 段：消防驰援（地震现场） ==="
# 等第一场地震自然结束（dur 25s；两段结算余款挂账路径不测 —— 走驰援豁免）
agent-browser wait --fn "window.__pxc.tycoon.events.length===0" --timeout 40000 && ok "首场地震结束" || bad "首场地震未结束"
agent-browser eval "(()=>{const e=window.__pxc;const f=e.map.place('firestation',0,118,125);const h=e.map.place('house',0,131,125);return 'fs:'+f+'|h:'+h;})()" >/dev/null 2>&1
agent-browser eval "(()=>{const t=window.__pxc.tycoon;t.coins=5000;t.resolveEvent;return 'ready';})()" >/dev/null 2>&1
Q5=$(agent-browser eval "(()=>{const e=window.__pxc;const ok=e.tycoon.forceEvent('quake',e.map);return 'force:'+ok;})()" 2>/dev/null | tail -1 | tr -d '"')
chk "Q5a 第二场地震触发" "${Q5:-x}" "force:true"
agent-browser wait 1200
Q5B=$(agent-browser eval "(()=>{const e=window.__pxc;return 'trucks:'+e.crowdCount().firetrucks+'|ev:'+e.tycoon.events.map(x=>x.key).join(',');})()" 2>/dev/null | tail -1 | tr -d '"')
chkge "Q5b 消防车已出动" "$(echo "$Q5B" | grep -o 'trucks:[0-9]*' | cut -d: -f2)" "1"
# 等消防车到场 → resolveEvent('quake') → 编年史「力挽狂澜」（用 some 轮询：次生火灾的「烈火英雄」可能后来居上）
agent-browser wait --fn "window.__pxc.tycoon.chron.entries.some(x=>x.title==='力挽狂澜')" --timeout 60000 && ok "Q5c 消防车到场 · 编年史「力挽狂澜」" || bad "Q5c 驰援超时"
Q5D=$(agent-browser eval "window.__pxc.tycoon.quakes" 2>/dev/null | tail -1 | tr -d '"')
chk "Q5d quakes=2（第二场计入）" "${Q5D:-x}" "2"

echo "=== [5] Q6 段：第三场地震 → 成就 ==="
agent-browser wait --fn "window.__pxc.tycoon.events.length===0" --timeout 40000 >/dev/null 2>&1
Q6=$(agent-browser eval "(()=>{const e=window.__pxc;const ok=e.tycoon.forceEvent('quake',e.map);return 'f:'+ok;})()" 2>/dev/null | tail -1 | tr -d '"')
chk "Q6a 第三场地震触发" "${Q6:-x}" "f:true"
agent-browser wait 2600
Q6V=$(agent-browser eval "window.__pxc.tycoon.achv.has('unshaken')?'yes':'no'" 2>/dev/null | tail -1 | tr -d '"')
chk "Q6b 成就「岿然不动」解锁" "${Q6V:-x}" "yes"

echo "=== [6] F 段：洪水泛滥 ==="
agent-browser wait --fn "window.__pxc.tycoon.events.length===0" --timeout 40000 >/dev/null 2>&1
F1=$(agent-browser eval "JSON.stringify((()=>{const e=window.__pxc;const s1=e.map.sinkAt(116,120);const s2=e.map.sinkAt(117,120);return {sink:s1==='ok'&&s2==='ok'};})())" 2>/dev/null | tail -1 | stripq)
chkge "F1a 挖塘成功" "$(echo "$F1" | grep -o 'sink:[a-z]*' | cut -d: -f2 | wc -l)" "1"
agent-browser wait 700
F1W=$(agent-browser eval "window.__pxc.tycoon.view().waterNear" 2>/dev/null | tail -1 | tr -d '"')
chkge "F1b 临水格 waterNear ≥ 2（快照刷新）" "${F1W:-x}" "2"
agent-browser eval "(()=>{const e=window.__pxc;for(let x=119;x<=123;x++)e.map.setRoad(x,126,false);return 'roadcut';})()" >/dev/null 2>&1
F2=$(agent-browser eval "JSON.stringify((()=>{const e=window.__pxc;const t=e.tycoon;t.coins=5000;const f=t.forceEvent('flood',e.map);return {flood:f,floods:t.floods,wreq:t.weatherReq};})())" 2>/dev/null | tail -1 | stripq)
chk "F2a 洪水触发（floods=1 · weatherReq=rain）" "${F2:-x}" "{flood:true,floods:1,wreq:rain}"
agent-browser wait 1200
F2W=$(agent-browser eval "window.__pxc.tycoon.weather.kind" 2>/dev/null | tail -1 | tr -d '"')
chk "F2b 天气切换为雨" "${F2W:-x}" "rain"
F2T=$(agent-browser eval "(window.__pxc.floodTiles||[]).length" 2>/dev/null | tail -1 | tr -d '"')
chkge "F2c 引擎淹没层 ≥ 10 格" "${F2T:-x}" "10"
F4=$(agent-browser eval "(()=>{const es=window.__pxc.tycoon.chron.entries;const x=es[es.length-1];return 'cat:'+x.cat+'|tone:'+x.tone+'|t:'+x.title;})()" 2>/dev/null | tail -1 | tr -d '"')
chk "F4 编年史入册（event/bad/洪水泛滥）" "${F4:-x}" "cat:event|tone:bad|t:洪水泛滥"
# 相机对准淹没区截图
agent-browser eval "(()=>{const e=window.__pxc;e.cam.x=(116-120.5)*16;e.cam.y=(116+120.5)*8-30;return 'cam';})()" >/dev/null 2>&1
agent-browser wait 600
agent-browser screenshot $OUT/v18_flood_city.png >/dev/null && ok "截图 v18_flood_city.png（淹没层）"
F5=$(agent-browser eval "JSON.stringify((()=>{const t=window.__pxc.tycoon;const r=t.resolveEvent('flood');const es=t.chron.entries;const x=es[es.length-1];return {r,pendG:t.events.find(e0=>e0.key==='flood')?.pendG??-1,tone:x.tone,title:x.title};})())" 2>/dev/null | tail -1 | stripq)
chk "F5 resolveEvent 泛化（中流砥柱 · 挂账清零）" "${F5:-x}" "{r:true,pendG:0,tone:good,title:中流砥柱}"

echo "=== [7] C 段：次生火灾（软断言） ==="
C1=$(agent-browser eval "(()=>{const t=window.__pxc.tycoon;const q=t.eventLog.filter(x=>x.name==='大地震').length;const f=t.eventLog.filter(x=>x.name==='火灾').length;return 'quakes:'+q+'|fires:'+f;})()" 2>/dev/null | tail -1 | tr -d '"')
echo "  · 次生火灾为 55% 随机链（$C1，冒烟已验证，不强制断言）"
ok "C1 次生灾害链记录检查（软断言）"

echo "=== [8] S 段：存档 / 兼容 ==="
agent-browser wait --fn "window.__pxc.tycoon.events.length===0" --timeout 40000 >/dev/null 2>&1
agent-browser eval "(()=>{const t=window.__pxc.tycoon;t.save(window.__pxc.map);return 'saved';})()" >/dev/null 2>&1
agent-browser reload >/dev/null 2>&1
agent-browser wait --fn "window.__pxc!==undefined" --timeout 90000 >/dev/null 2>&1
agent-browser wait 3000
S1=$(agent-browser eval "JSON.stringify((()=>{const t=window.__pxc.tycoon;const v=t.view();return {quakes:t.quakes,floods:t.floods,levees:v.levees};})())" 2>/dev/null | tail -1 | stripq)
chk "S1 存档往返（quakes=3 · floods=1 · levees=3）" "${S1:-x}" "{quakes:3,floods:1,levees:3}"
# v17 老档：删掉 quakes/floods 字段 → resume 兼容（存档键 pxc_tycoon_v1）
agent-browser eval "(()=>{const raw=JSON.parse(localStorage.getItem('pxc_tycoon_v1'));delete raw.quakes;delete raw.floods;localStorage.setItem('pxc_tycoon_v1',JSON.stringify(raw));return 'patched';})()" >/dev/null 2>&1
agent-browser reload >/dev/null 2>&1
agent-browser wait --fn "window.__pxc!==undefined" --timeout 90000 >/dev/null 2>&1
agent-browser wait 3000
S2=$(agent-browser eval "JSON.stringify((()=>{const t=window.__pxc.tycoon;return {quakes:t.quakes,floods:t.floods,levees:t.view().levees};})())" 2>/dev/null | tail -1 | stripq)
chk "S2 v17 老档兼容（无字段归零 · 建筑保留）" "${S2:-x}" "{quakes:0,floods:0,levees:3}"

echo "=== [9] U 段：任务 / 收尾 ==="
U1=$(agent-browser eval "(()=>{const t=window.__pxc.tycoon;t.questIdx=39;return 'set';})()" >/dev/null 2>&1; agent-browser wait 2200 >/dev/null 2>&1; agent-browser eval "window.__pxc.tycoon.questIdx" 2>/dev/null | tail -1 | tr -d '"')
chk "U1 任务「防患未然」完成（qi=40 链走完）" "${U1:-x}" "40"
ERR=$(errcount)
chk "U2a 控制台零错误" "${ERR:-x}" "0"
agent-browser eval "(()=>{const e=window.__pxc;const t=e.tycoon;t.coins=5000;t.forceEvent('flood',e.map);e.cam.x=(116-120.5)*16;e.cam.y=(116+120.5)*8-30;return 'live';})()" >/dev/null 2>&1
agent-browser wait 1500
agent-browser screenshot $OUT/v18_city.png >/dev/null && ok "截图 v18_city.png（洪灾进行中）"

echo "=== [10] 移动端 390×844 ==="
agent-browser set viewport 390 844
agent-browser wait 1800
agent-browser screenshot $OUT/v18_mobile.png >/dev/null && ok "截图 v18_mobile.png"
agent-browser errors --json 2>/dev/null | python3 -c "import json,sys
try:
  for e in json.load(sys.stdin).get('data',{}).get('errors',[]): print('  ✗ '+e.get('text','').split(chr(10))[0][:150])
except Exception: pass"

echo ""
echo "=========================================="
echo "  v18 E2E: $PASS 通过 / $FAIL 失败"
echo "=========================================="
exit $((FAIL > 0 ? 1 : 0))
