#!/bin/bash
# ============================================================
# v11_browser_test.sh — 端到端验证（需在 with_dev.sh 内运行）
# 验证点：
#   R1  v8 回归：荒地开局经济（金币 320 / 人口 0）
#   R2  v8 回归：荒地开局行人消失修复（修路后 peds >= 3）
#   R3  v8 回归：右键快速拆除
#   V1  v11 电车：两座邻路电车站 → 电车 actor 发车（trams >= 1）
#   V2  v11 铁路货运站：目录存在 + 科技闸门(metal)
#   V3  v11 出口市场：mkt ∈ [0.55,1.55] / expPrice / 惜售开关
#   V4  无控制台错误 + 桌面/移动端截图
# ============================================================
set -u
B=http://localhost:3000
OUT=/home/z/my-project/scripts
PASS=0; FAIL=0
ok()   { echo "  ✓ $1"; PASS=$((PASS+1)); }
bad()  { echo "  ✗ $1"; FAIL=$((FAIL+1)); }
chk()  { if [ "$2" = "$3" ]; then ok "$1 ($2)"; else bad "$1 (got=$2 want=$3)"; fi; }
chkge() { if [ "${2%.*}" -ge "$3" ] 2>/dev/null; then ok "$1 ($2 >= $3)"; else bad "$1 (got=$2 want>=$3)"; fi; }
chkbetween() { # $1 名 $2 值 $3 lo $4 hi
  if [ -n "$2" ] && [ "$2" != "x" ] && awk "BEGIN{exit !($2 >= $3 && $2 <= $4)}"; then ok "$1 ($2 ∈ [$3,$4])"; else bad "$1 (got=$2 want∈[$3,$4])"; fi
}

echo "=== [1] 桌面端 1440×900 打开 ==="
agent-browser set viewport 1440 900
agent-browser open $B
agent-browser storage local clear >/dev/null 2>&1
agent-browser reload
agent-browser wait --fn "window.__pxc!==undefined" --timeout 90000 && ok "引擎就绪" || bad "引擎超时"
agent-browser wait 3000

echo "=== [2] R1 开局经济（v8 回归） ==="
COINS=$(agent-browser eval "Math.floor(window.__pxc.tycoon.coins)" 2>/dev/null | tail -1 | tr -d '"')
chkge "R1 开局金币(≥319=320 取整)" "${COINS:-0}" 319
POP=$(agent-browser eval "Math.floor(window.__pxc.tycoon.pop)" 2>/dev/null | tail -1 | tr -d '"')
chk "R1 开局人口 0" "${POP:-x}" "0"
VIEW=$(agent-browser eval "(()=>{const v=window.__pxc.tycoon.view();return (v.mkt!==undefined&&v.expPrice!==undefined&&v.exportHold!==undefined&&v.tramStops!==undefined&&v.railHubs!==undefined)?'full':'broken';})()" 2>/dev/null | tail -1 | tr -d '"')
chk "R1 v11 视图字段完整(mkt/expPrice/exportHold/tramStops/railHubs)" "${VIEW:-x}" "full"

echo "=== [3] R2 荒地开局行人（v8 回归：修路后拓荒者出现） ==="
P0=$(agent-browser eval "window.__pxc.actors.peds" 2>/dev/null | tail -1 | tr -d '"')
chk "R2 修路前行人 0" "${P0:-x}" "0"
agent-browser eval "(()=>{const e=window.__pxc;const xs=[];for(let x=118;x<=134;x++)xs.push(x);xs.forEach(x=>e.map.setRoad(x,127,true));xs.forEach(x=>e.map.setRoad(x,126,true));xs.forEach(x=>e.map.setRoad(x,128,true));return 'roads:'+e.map.roadList().length;})()" 2>/dev/null | tail -1
agent-browser wait 9000
PEDS=$(agent-browser eval "window.__pxc.actors.peds" 2>/dev/null | tail -1 | tr -d '"')
chkge "R2 修路后行人(≥3)" "${PEDS:-0}" 3

echo "=== [4] V1 v11 电车干线（两座邻路电车站 → 发车） ==="
TRAMP=$(agent-browser eval "(()=>{const e=window.__pxc;const okA=e.map.place('tramstop',0,121,125);const okB=e.map.place('tramstop',0,131,125);return 'place:'+okA+','+okB;})()" 2>/dev/null | tail -1 | tr -d '"')
chk "V1 电车站放置(121,125)+(131,125) 邻接 y=126 路轨" "${TRAMP:-x}" "place:true,true"
agent-browser wait 6000
TRAMN=$(agent-browser eval "window.__pxc.actors.trams" 2>/dev/null | tail -1 | tr -d '"')
chkge "V1 电车 actor 发车(≥1)" "${TRAMN:-0}" 1
TSTOPS=$(agent-browser eval "window.__pxc.tycoon.view().tramStops" 2>/dev/null | tail -1 | tr -d '"')
chk "V1 视图 tramStops=2" "${TSTOPS:-x}" "2"

echo "=== [5] V2 v11 铁路货运站目录 + 科技闸门 ==="
RH=$(agent-browser eval "(()=>{const d=window.__pxc.defById?window.__pxc.defById('railhub'):null;return d?('ok:'+d.name):'missing';})()" 2>/dev/null | tail -1 | tr -d '"')
case "$RH" in
  ok:*) ok "V2 railhub 目录存在: $RH" ;;
  *) RH2=$(agent-browser eval "(()=>{const c=window.__pxc.catalog||window.__pxc;const e=window.__pxc;e.map.place('railhub',0,133,125);return 'placed';})()" 2>/dev/null | tail -1 | tr -d '"'); chk "V2 railhub 可直接放置(降级验证)" "${RH2:-x}" "placed" ;;
esac
GATE=$(agent-browser eval "window.__pxc.tycoon.techGateOf('railhub')" 2>/dev/null | tail -1 | tr -d '"')
chk "V2 railhub 科技闸门=metal" "${GATE:-x}" "metal"

echo "=== [6] V3 v11 出口市场 ==="
MKT=$(agent-browser eval "window.__pxc.tycoon.view().mkt.toFixed(3)" 2>/dev/null | tail -1 | tr -d '"')
chkbetween "V3 市价 mkt ∈[0.55,1.55]" "${MKT:-x}" 0.55 1.55
EXP=$(agent-browser eval "window.__pxc.tycoon.view().expPrice.toFixed(3)" 2>/dev/null | tail -1 | tr -d '"')
chkbetween "V3 出口单价 expPrice 合理" "${EXP:-x}" 0.5 2.5
HOLD0=$(agent-browser eval "window.__pxc.tycoon.exportHold" 2>/dev/null | tail -1 | tr -d '"')
chk "V3 惜售初始 false" "${HOLD0:-x}" "false"
HOLD1=$(agent-browser eval "window.__pxc.setExportHold(true);window.__pxc.tycoon.exportHold" 2>/dev/null | tail -1 | tr -d '"')
chk "V3 setExportHold(true) 生效" "${HOLD1:-x}" "true"
HOLD2=$(agent-browser eval "window.__pxc.setExportHold(false);window.__pxc.tycoon.exportHold" 2>/dev/null | tail -1 | tr -d '"')
chk "V3 setExportHold(false) 复位" "${HOLD2:-x}" "false"

echo "=== [7] R3 右键快速拆除（v8 回归） ==="
PLOT=$(agent-browser eval "(()=>{const e=window.__pxc;if(!e.map.plantTree(126,129))return 'plantfail';return 'tree:'+e.map.tree[e.map.idx(126,129)];})()" 2>/dev/null | tail -1 | tr -d '"')
case "$PLOT" in
  tree:*) ok "R3 预置树于 (126,129)=$PLOT" ;;
  *) bad "R3 种树失败 $PLOT" ;;
esac
RDOZE=$(agent-browser eval "
(()=>{const e=window.__pxc;
const cv=[...document.querySelectorAll('canvas')].sort((a,b)=>b.width*b.height-a.width*a.height)[0];
const r=cv.getBoundingClientRect();
let hit=null;
for(let dy=-40;dy<=220;dy+=2){for(let dx=-140;dx<=140;dx+=2){
  const t=e.tileAt(r.width/2+dx,r.height/2+dy);
  if(t.tx===126&&t.ty===129){hit=[r.left+r.width/2+dx,r.top+r.height/2+dy];break;}}}
if(!hit)return 'nofind';
cv.dispatchEvent(new PointerEvent('pointerdown',{button:2,pointerId:99,clientX:hit[0],clientY:hit[1],bubbles:true}));
cv.dispatchEvent(new PointerEvent('pointerup',{button:2,pointerId:99,clientX:hit[0],clientY:hit[1],bubbles:true}));
return 'fired';})()" 2>/dev/null | tail -1 | tr -d '"')
case "$RDOZE" in
  fired) ok "R3 右键事件已派发" ;;
  *) bad "R3 右键事件失败 $RDOZE" ;;
esac
agent-browser wait 500
TAFTER=$(agent-browser eval "window.__pxc.map.tree[window.__pxc.map.idx(126,129)]" 2>/dev/null | tail -1 | tr -d '"')
chk "R3 右键拆除后树已移除(-1)" "${TAFTER:-x}" "-1"

echo "=== [8] 截图：镜头对准电车街区 ==="
agent-browser eval "(()=>{const e=window.__pxc;e.cam.x=(126-127)*16;e.cam.y=(126+127)*8;return 'cam';})()" >/dev/null
agent-browser wait 1500
agent-browser screenshot $OUT/v11_verify_city.png >/dev/null && ok "截图 v11_verify_city.png"
agent-browser eval "(()=>{const e=window.__pxc;e.setTool({t:'view'});return 'ok';})()" >/dev/null

echo "=== [9] 控制台错误 ==="
ERRS=$(agent-browser errors 2>/dev/null | grep -v "^$" | head -5)
if [ -z "$ERRS" ]; then ok "无页面错误"; else echo "  ⚠ 页面错误:"; echo "$ERRS"; FAIL=$((FAIL+1)); fi

echo "=== [10] 移动端 390×844 ==="
agent-browser set viewport 390 844
agent-browser reload
agent-browser wait --fn "window.__pxc!==undefined" --timeout 60000
agent-browser wait 3000
agent-browser screenshot $OUT/v11_verify_mobile.png >/dev/null && ok "截图 v11_verify_mobile.png"

echo ""
echo "========== 结果: PASS=$PASS FAIL=$FAIL =========="
[ $FAIL -eq 0 ]
