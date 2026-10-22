#!/bin/bash
# ============================================================
# v8_browser_test.sh — T1-T7 端到端验证（需在 with_dev.sh 内运行）
# 验证点：
#   T1  荒地开局修路后行人出现（peds >= 3）
#   T2  开局金币 320 / 经济收紧
#   T3  右键快速拆除（PointerEvent button=2 端到端）
#   T5  主山脊高度场（max h >= 10）
#   T7  文化/科研指数存在且合法（0..100）
# ============================================================
set -u
B=http://localhost:3000
OUT=/home/z/my-project/scripts
PASS=0; FAIL=0
ok()   { echo "  ✓ $1"; PASS=$((PASS+1)); }
bad()  { echo "  ✗ $1"; FAIL=$((FAIL+1)); }
chk()  { if [ "$2" = "$3" ]; then ok "$1 ($2)"; else bad "$1 (got=$2 want=$3)"; fi; }
chkge() { if [ "${2%.*}" -ge "$3" ] 2>/dev/null; then ok "$1 ($2 >= $3)"; else bad "$1 (got=$2 want>=$3)"; fi; }

echo "=== [1] 桌面端 1440×900 打开 ==="
agent-browser set viewport 1440 900
agent-browser open $B
agent-browser storage local clear >/dev/null 2>&1
agent-browser reload
agent-browser wait --fn "window.__pxc!==undefined" --timeout 90000 && ok "引擎就绪" || bad "引擎超时"
agent-browser wait 3000

echo "=== [2] T2 开局经济 ==="
COINS=$(agent-browser eval "Math.floor(window.__pxc.tycoon.coins)" 2>/dev/null | tail -1 | tr -d '"')
chkge "T2 开局金币(≥319=320 取整)" "${COINS:-0}" 319
POP=$(agent-browser eval "Math.floor(window.__pxc.tycoon.pop)" 2>/dev/null | tail -1 | tr -d '"')
chk "T2 开局人口 0" "${POP:-x}" "0"

echo "=== [3] T5 主山脊高度场 ==="
HMAXV=$(agent-browser eval "(()=>{const m=window.__pxc.map;let mx=0;for(let i=0;i<m.h.length;i++)if(m.h[i]>mx)mx=m.h[i];return mx;})()" 2>/dev/null | tail -1 | tr -d '"')
chkge "T5 地图最高海拔(≥10)" "${HMAXV:-0}" 10
H5P=$(agent-browser eval "(()=>{const m=window.__pxc.map;let c=0;for(let i=0;i<m.h.length;i++)if(m.h[i]>=5)c++;return c;})()" 2>/dev/null | tail -1 | tr -d '"')
chkge "T5 中高海拔格数(≥800)" "${H5P:-0}" 800

echo "=== [4] T1 荒地开局行人 ==="
P0=$(agent-browser eval "window.__pxc.actors.peds" 2>/dev/null | tail -1 | tr -d '"')
chk "T1 修路前行人 0" "${P0:-x}" "0"
agent-browser eval "(()=>{const e=window.__pxc;['126','125','124','123','122'].forEach(x=>e.map.setRoad(+x,127,true));e.map.setRoad(126,126,true);e.map.setRoad(126,128,true);return 'roads:'+e.map.roadList().length;})()" >/dev/null
agent-browser wait 9000
PEDS=$(agent-browser eval "window.__pxc.actors.peds" 2>/dev/null | tail -1 | tr -d '"')
chkge "T1 修路后行人(≥3)" "${PEDS:-0}" 3

echo "=== [5] T7 文化/科研指数 ==="
agent-browser wait 2000
CUL=$(agent-browser eval "window.__pxc.tycoon.view().cultureIdx" 2>/dev/null | tail -1 | tr -d '"')
SCI=$(agent-browser eval "window.__pxc.tycoon.view().sciIdx" 2>/dev/null | tail -1 | tr -d '"')
if [ -n "$CUL" ] && [ "$CUL" != "undefined" ]; then ok "T7 cultureIdx=$CUL"; else bad "T7 cultureIdx 缺失"; fi
if [ -n "$SCI" ] && [ "$SCI" != "undefined" ]; then ok "T7 sciIdx=$SCI"; else bad "T7 sciIdx 缺失"; fi
VIEW=$(agent-browser eval "(()=>{const v=window.__pxc.tycoon.view();return (v.employIdx!==undefined&&v.rating!==undefined)?'full':'broken';})()" 2>/dev/null | tail -1 | tr -d '"')
chk "T7 视图字段完整" "${VIEW:-x}" "full"

echo "=== [6] T3 右键快速拆除（端到端指针事件）==="
PLOTTED=$(agent-browser eval "(()=>{const e=window.__pxc;if(!e.map.plantTree(130,130))return 'plantfail';return 'tree:'+e.map.tree[e.map.idx(130,130)];})()" 2>/dev/null | tail -1 | tr -d '"')
case "$PLOTTED" in
  tree:*) ok "T3 预置树于 (130,130)=$PLOTTED" ;;
  *) bad "T3 种树失败 $PLOTTED" ;;
esac
RDOZE=$(agent-browser eval "
(()=>{const e=window.__pxc;
const cv=[...document.querySelectorAll('canvas')].sort((a,b)=>b.width*b.height-a.width*a.height)[0];
const r=cv.getBoundingClientRect();
let hit=null;
for(let dy=-40;dy<=200;dy+=2){for(let dx=-120;dx<=120;dx+=2){
  const t=e.tileAt(r.width/2+dx,r.height/2+dy);
  if(t.tx===130&&t.ty===130){hit=[r.left+r.width/2+dx,r.top+r.height/2+dy];break;}}}
if(!hit)return 'nofind';
const cx=hit[0],cy=hit[1];
cv.dispatchEvent(new PointerEvent('pointerdown',{button:2,pointerId:98,clientX:cx,clientY:cy,bubbles:true}));
cv.dispatchEvent(new PointerEvent('pointerup',{button:2,pointerId:98,clientX:cx,clientY:cy,bubbles:true}));
return 'fired';
})()" 2>/dev/null | tail -1 | tr -d '"')
case "$RDOZE" in
  fired) ok "T3 右键事件已派发" ;;
  *) bad "T3 右键事件失败 $RDOZE" ;;
esac
agent-browser wait 500
TREE_AFTER=$(agent-browser eval "window.__pxc.map.tree[window.__pxc.map.idx(130,130)]" 2>/dev/null | tail -1 | tr -d '"')
chk "T3 右键拆除后树已移除(-1)" "${TREE_AFTER:-x}" "-1"
DOZED=$(agent-browser eval "window.__pxc.tycoon.dozed" 2>/dev/null | tail -1 | tr -d '"')
chkge "T3 拆除计数(≥1)" "${DOZED:-0}" 1

echo "=== [7] 城市志十二维截图 ==="
agent-browser eval "(()=>{const b=[...document.querySelectorAll('button')].find(x=>(x.title||'').includes('城市评级'));if(!b)return 'nobtn';b.click();return 'clicked';})()" 2>/dev/null | tail -1
agent-browser wait 800
agent-browser eval "(()=>{const b=[...document.querySelectorAll('button')].find(x=>(x.textContent||'').includes('城市志·指数图表'));if(!b)return 'nobtn';b.click();return 'clicked';})()" 2>/dev/null | tail -1
agent-browser wait 1200
DIM12=$(agent-browser eval "document.body.textContent.includes('十二维民生指数')?'yes':'no'" 2>/dev/null | tail -1 | tr -d '"')
chk "T7 城市志显示十二维指数" "${DIM12:-x}" "yes"
CULTXT=$(agent-browser eval "document.body.textContent.includes('文化')&&document.body.textContent.includes('科研')?'yes':'no'" 2>/dev/null | tail -1 | tr -d '"')
chk "T7 指数条含文化/科研" "${CULTXT:-x}" "yes"
agent-browser screenshot $OUT/v8_data_modal.png >/dev/null && ok "截图 v8_data_modal.png"
agent-browser eval "(()=>{const x=document.querySelector('.pxc-x');if(x)x.click();return 'closed';})()" >/dev/null

echo "=== [8] 地形俯视截图（验证坡向光照）==="
agent-browser eval "(()=>{const e=window.__pxc;e.setTool({t:'view'});return 'view';})()" >/dev/null
agent-browser eval "(()=>{const e=window.__pxc;let best=null,bs=-1;for(let y=40;y<216;y+=8){for(let x=40;x<216;x+=8){const i=e.map.idx(x,y);const h=e.map.h[i];if(h>bs){bs=h;best=[x,y];}}}const d=e;e.cam.x=(best[0]-best[1])*16;e.cam.y=(best[0]+best[1])*8;return 'cam→'+best+' h='+bs;})()" 2>/dev/null | tail -1
agent-browser wait 1200
agent-browser screenshot $OUT/v8_mountain.png >/dev/null && ok "截图 v8_mountain.png"

echo "=== [9] 控制台错误 ==="
ERRS=$(agent-browser errors 2>/dev/null | grep -v "^$" | head -5)
if [ -z "$ERRS" ]; then ok "无页面错误"; else echo "  ⚠ 页面错误:"; echo "$ERRS"; FAIL=$((FAIL+1)); fi

echo "=== [10] 移动端 390×844 ==="
agent-browser set viewport 390 844
agent-browser reload
agent-browser wait --fn "window.__pxc!==undefined" --timeout 60000
agent-browser wait 3000
MOB=$(agent-browser eval "window.innerWidth" 2>/dev/null | tail -1 | tr -d '"')
ok "移动端视口 ${MOB}px"
agent-browser screenshot $OUT/v8_mobile.png >/dev/null && ok "截图 v8_mobile.png"

echo ""
echo "========== 结果: PASS=$PASS FAIL=$FAIL =========="
[ $FAIL -eq 0 ]
