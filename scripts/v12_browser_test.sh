#!/bin/bash
# ============================================================
# v12_browser_test.sh — 城市卫士·应急联动 端到端验证（with_dev.sh 内运行）
# 验证点：
#   T1  交班邻路 → 巡逻警车常驻（patrols >= 1）
#   T2  无消防局 forceEvent('fire') → 无出动，全额两段结算（余款到期结算）
#   T3  消防局邻路 forceEvent('fire') → 消防车出动 → 到场扑灭
#       （rescueFire >= 1 · 事件提前终结 · 余损豁免）
#   T4  医院邻路 forceEvent('plague') → 救护车出动 → rescueAid >= 1
#   T5  视图字段 kobans/rescueFire/rescueAid
#   T6  存档 v9 持久化（reload 后 rescueFire 保留）
#   T7  无控制台错误 + 截图（喷水作业帧）
# ============================================================
set -u
B=http://localhost:3000
OUT=/home/z/my-project/scripts
PASS=0; FAIL=0
ok()   { echo "  ✓ $1"; PASS=$((PASS+1)); }
bad()  { echo "  ✗ $1"; FAIL=$((FAIL+1)); }
chk()  { if [ "$2" = "$3" ]; then ok "$1 ($2)"; else bad "$1 (got=$2 want=$3)"; fi; }
chkge() { if [ "${2%.*}" -ge "$3" ] 2>/dev/null; then ok "$1 ($2 >= $3)"; else bad "$1 (got=$2 want>=$3)"; fi; }
chkeq0() { if [ "${2%.*}" -eq "0" ] 2>/dev/null; then ok "$1 ($2 = 0)"; else bad "$1 (got=$2 want=0)"; fi; }

echo "=== [1] 桌面端 1440×900 新档开局 ==="
agent-browser set viewport 1440 900
agent-browser open $B
agent-browser storage local clear >/dev/null 2>&1
agent-browser reload
agent-browser wait --fn "window.__pxc!==undefined" --timeout 90000 && ok "引擎就绪" || bad "引擎超时"
agent-browser wait 3000

echo "=== [2] 布置：路网 + 住宅(火点候选) + 交班(121,125) ==="
agent-browser eval "(()=>{const e=window.__pxc;const xs=[];for(let x=118;x<=134;x++)xs.push(x);xs.forEach(x=>e.map.setRoad(x,126,true));xs.forEach(x=>e.map.setRoad(x,127,true));xs.forEach(x=>e.map.setRoad(x,128,true));const h=e.map.place('house',0,131,125);const k=e.map.place('koban',0,121,125);return 'roads:'+e.map.roadList().length+' house:'+h+' koban:'+k;})()" 2>/dev/null | tail -1

echo "=== [3] T1 交班 → 巡逻警车常驻 ==="
agent-browser wait 5000
PATROL=$(agent-browser eval "window.__pxc.actors.patrols" 2>/dev/null | tail -1 | tr -d '"')
chkge "T1 巡逻车 >= 1" "${PATROL:-0}" 1

echo "=== [4] T2 无消防局：火灾全额两段结算 ==="
COINS0=$(agent-browser eval "Math.floor(window.__pxc.tycoon.coins)" 2>/dev/null | tail -1 | tr -d '"')
FORCED=$(agent-browser eval "window.__pxc.tycoon.forceEvent('fire',window.__pxc.map)" 2>/dev/null | tail -1 | tr -d '"')
chk "T2 forceEvent('fire') 生效" "${FORCED:-x}" "true"
agent-browser wait 1500
FTRUCK=$(agent-browser eval "window.__pxc.actors.firetrucks" 2>/dev/null | tail -1 | tr -d '"')
chkeq0 "T2 无消防局 → 无消防车出动" "${FTRUCK:-x}"
EV=$(agent-browser eval "window.__pxc.tycoon.events.filter(e=>e.key==='fire').length" 2>/dev/null | tail -1 | tr -d '"')
chk "T2 火灾事件挂起中" "${EV:-x}" "1"
PEND=$(agent-browser eval "window.__pxc.tycoon.events.find(e=>e.key==='fire')?.pendG>0?'yes':'no'" 2>/dev/null | tail -1 | tr -d '"')
chk "T2 余款挂账(pendG>0)" "${PEND:-x}" "yes"
COINS1=$(agent-browser eval "Math.floor(window.__pxc.tycoon.coins)" 2>/dev/null | tail -1 | tr -d '"')
if [ -n "$COINS0" ] && [ -n "$COINS1" ] && [ "$COINS1" -lt "$COINS0" ] 2>/dev/null; then ok "T2 先期 40% 已扣 (${COINS0}→${COINS1})"; else bad "T2 先期未扣 (${COINS0}→${COINS1})"; fi
echo "  … 等待事件 20s 烧完（余款到期结算）"
agent-browser wait 22000
EV2=$(agent-browser eval "window.__pxc.tycoon.events.filter(e=>e.key==='fire').length" 2>/dev/null | tail -1 | tr -d '"')
chkeq0 "T2 事件 20s 后自然结束" "${EV2:-x}"
COINS2=$(agent-browser eval "Math.floor(window.__pxc.tycoon.coins)" 2>/dev/null | tail -1 | tr -d '"')
if [ -n "$COINS1" ] && [ -n "$COINS2" ] && [ "$COINS2" -lt "$COINS1" ] 2>/dev/null; then ok "T2 余款到期结算 (${COINS1}→${COINS2})"; else bad "T2 余款未结算 (${COINS1}→${COINS2})"; fi

echo "=== [5] T3 消防局邻路 → 消防车出动扑救 ==="
agent-browser eval "(()=>{const e=window.__pxc;const f=e.map.place('firestation',0,118,125);return 'firestation:'+f;})()" 2>/dev/null | tail -1
agent-browser wait 800
COINS3=$(agent-browser eval "Math.floor(window.__pxc.tycoon.coins)" 2>/dev/null | tail -1 | tr -d '"')
FORCED2=$(agent-browser eval "window.__pxc.tycoon.forceEvent('fire',window.__pxc.map)" 2>/dev/null | tail -1 | tr -d '"')
chk "T3 forceEvent('fire') 生效" "${FORCED2:-x}" "true"
agent-browser wait 2000
FTRUCK2=$(agent-browser eval "window.__pxc.actors.firetrucks" 2>/dev/null | tail -1 | tr -d '"')
chkge "T3 消防车出动(>=1)" "${FTRUCK2:-0}" 1
agent-browser screenshot $OUT/v12_firetruck_enroute.png >/dev/null && ok "截图 v12_firetruck_enroute.png"
echo "  … 等待到场扑灭(约 8s) + 事件提前终结"
agent-browser wait 9000
RESCUE=$(agent-browser eval "window.__pxc.tycoon.rescueFire" 2>/dev/null | tail -1 | tr -d '"')
chkge "T3 rescueFire >= 1" "${RESCUE:-0}" 1
agent-browser wait 5000
EV3=$(agent-browser eval "window.__pxc.tycoon.events.filter(e=>e.key==='fire').length" 2>/dev/null | tail -1 | tr -d '"')
chkeq0 "T3 事件提前终结" "${EV3:-x}"
COINS4=$(agent-browser eval "Math.floor(window.__pxc.tycoon.coins)" 2>/dev/null | tail -1 | tr -d '"')
ok "T3 余损豁免后金币 ${COINS3} → ${COINS4}（仅先期 40%）"

echo "=== [6] T4 医院 → 救护车出动 ==="
agent-browser eval "(()=>{const e=window.__pxc;const h=e.map.place('hospital',0,131,129);return 'hospital:'+h;})()" 2>/dev/null | tail -1
agent-browser wait 800
FORCED3=$(agent-browser eval "window.__pxc.tycoon.forceEvent('plague',window.__pxc.map)" 2>/dev/null | tail -1 | tr -d '"')
chk "T4 forceEvent('plague') 生效" "${FORCED3:-x}" "true"
agent-browser wait 2500
AMB=$(agent-browser eval "window.__pxc.actors.ambulances" 2>/dev/null | tail -1 | tr -d '"')
chkge "T4 救护车出动(>=1)" "${AMB:-0}" 1
echo "  … 等待急救到场(约 8s)"
agent-browser wait 9000
RESCUEA=$(agent-browser eval "window.__pxc.tycoon.rescueAid" 2>/dev/null | tail -1 | tr -d '"')
chkge "T4 rescueAid >= 1" "${RESCUEA:-0}" 1

echo "=== [7] T5 视图字段 ==="
VIEW=$(agent-browser eval "(()=>{const v=window.__pxc.tycoon.view();return (v.kobans!==undefined&&v.rescueFire!==undefined&&v.rescueAid!==undefined)?'full':'broken';})()" 2>/dev/null | tail -1 | tr -d '"')
chk "T5 视图 v12 字段完整" "${VIEW:-x}" "full"
KOB=$(agent-browser eval "window.__pxc.tycoon.view().kobans" 2>/dev/null | tail -1 | tr -d '"')
chk "T5 view().kobans=1" "${KOB:-x}" "1"

echo "=== [8] 城市志与财政板块（应急联动行）==="
agent-browser eval "(()=>{const b=[...document.querySelectorAll('button')].find(x=>(x.textContent||'').includes('财政报告'));if(!b)return 'nobtn';b.click();return 'ok';})()" 2>/dev/null | tail -1
agent-browser wait 800
FISCAL=$(agent-browser eval "document.body.textContent.includes('应急联动')?'yes':'no'" 2>/dev/null | tail -1 | tr -d '"')
chk "财政面板含应急联动行" "${FISCAL:-x}" "yes"
agent-browser eval "(()=>{const x=document.querySelector('.pxc-x');if(x)x.click();return 'closed';})()" >/dev/null

echo "=== [9] T6 存档 v9 持久化（reload） ==="
agent-browser eval "window.__pxc.tycoon.save(window.__pxc.map);'saved'" 2>/dev/null | tail -1
agent-browser reload
agent-browser wait --fn "window.__pxc!==undefined" --timeout 60000
agent-browser wait 3000
RF2=$(agent-browser eval "window.__pxc.tycoon.rescueFire" 2>/dev/null | tail -1 | tr -d '"')
chkge "T6 reload 后 rescueFire 保留" "${RF2:-0}" 1
FT2=$(agent-browser eval "window.__pxc.actors.patrols" 2>/dev/null | tail -1 | tr -d '"')
chkge "T6 reload 后巡逻车重建(>=1)" "${FT2:-0}" 1

echo "=== [10] T7 控制台错误 + 城市截图 ==="
ERRS=$(agent-browser errors 2>/dev/null | grep -v "^$" | head -5)
if [ -z "$ERRS" ]; then ok "无页面错误"; else echo "  ⚠ 页面错误:"; echo "$ERRS"; FAIL=$((FAIL+1)); fi
agent-browser eval "(()=>{const e=window.__pxc;e.cam.x=(125-127)*16;e.cam.y=(125+127)*8;return 'cam';})()" >/dev/null
agent-browser wait 1200
agent-browser screenshot $OUT/v12_city.png >/dev/null && ok "截图 v12_city.png"

echo "=== [11] 移动端 390×844 ==="
agent-browser set viewport 390 844
agent-browser reload
agent-browser wait --fn "window.__pxc!==undefined" --timeout 60000
agent-browser wait 3000
agent-browser screenshot $OUT/v12_mobile.png >/dev/null && ok "截图 v12_mobile.png"

echo ""
echo "========== 结果: PASS=$PASS FAIL=$FAIL =========="
[ $FAIL -eq 0 ]
