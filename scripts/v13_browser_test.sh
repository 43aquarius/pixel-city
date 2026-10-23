#!/bin/bash
# ============================================================
# v13_browser_test.sh — 市民列传 端到端验证（with_dev.sh 内运行）
# 验证点：
#   T1  新档开局：名人册空（n=0 · total=0）
#   T2  布城 + 人口脉冲 → 市民落户（在册 ≥5 · 累计 ≥5）
#   T3  市民字段：中文姓名 / 传记 / 职业 / 心情 5-100 / 大事记 ≥1 / 住所
#   T4  市民之声 citzVoice() 非空（随税率/幸福/事件状态）
#   T5  forceEvent('fire') → 市民大事记出现火灾反应
#   T6  view().citz 字段完整 + HUD「民」芯片存在
#   T7  行人命中：actorCssAt + spotPedestrian 返回名片；远处 null
#   T8  头像 dataURL 生成 + 缓存命中
#   T9  合成 PointerEvent 点击行人 → 模态打开（街头偶遇 · cd-spot）
#   T10 名人册 UI：网格卡片 → 详情（大事记）→ 桌面截图
#   T11 存档 v10 往返：save + reload → 名人册人数与姓名保留
#   T12 成就：百家灯火（total=100）+ 家喻户晓（在册 28）
#   T13 任务链：「城市家人」存在且可达
#   T14 无控制台错误 + 移动端截图
# ============================================================
set -u
B=http://localhost:3000
OUT=/home/z/my-project/scripts
PASS=0; FAIL=0
ok()   { echo "  ✓ $1"; PASS=$((PASS+1)); }
bad()  { echo "  ✗ $1"; FAIL=$((FAIL+1)); }
chk()  { if [ "$2" = "$3" ]; then ok "$1 ($2)"; else bad "$1 (got=$2 want=$3)"; fi; }
chkge() { if [ "${2%.*}" -ge "$3" ] 2>/dev/null; then ok "$1 ($2 >= $3)"; else bad "$1 (got=$2 want>=$3)"; fi; }

echo "=== [1] 桌面端 1440×900 新档开局 ==="
agent-browser set viewport 1440 900
agent-browser open $B
agent-browser storage local clear >/dev/null 2>&1
agent-browser reload
agent-browser wait --fn "window.__pxc!==undefined" --timeout 90000 && ok "引擎就绪" || bad "引擎超时"
agent-browser wait 3000

CN=$(agent-browser eval "window.__pxc.tycoon.citz.roster.length" 2>/dev/null | tail -1 | tr -d '"')
CT=$(agent-browser eval "window.__pxc.tycoon.citz.total" 2>/dev/null | tail -1 | tr -d '"')
chk "T1 新档名人册为空" "${CN:-x}" "0"
chk "T1 新档累计落户为 0" "${CT:-x}" "0"

echo "=== [2] 布城：路网 + 住宅×2公寓 + 商铺 + 面包房 ==="
agent-browser eval "(()=>{const e=window.__pxc;for(let x=118;x<=134;x++){e.map.setRoad(x,126,true);e.map.setRoad(x,127,true);e.map.setRoad(x,128,true);}const a=e.map.place('apartment',0,121,125);const b=e.map.place('apartment',1,121,129);const c=e.map.place('house',0,131,125);const s=e.map.place('shop',0,131,127);const k=e.map.place('bakery',0,133,125);return 'roads:'+e.map.roadList().length+' apt:'+a+b+' house:'+c+' shop:'+s+' bakery:'+k;})()" 2>/dev/null | tail -1
agent-browser wait 1000

echo "=== [3] T2 人口脉冲 → 市民落户 ==="
agent-browser eval "(()=>{const t=window.__pxc.tycoon;let iv=null;iv=setInterval(()=>{t.pop=Math.min(64,t.pop+4)},250);setTimeout(()=>clearInterval(iv),2600);return 'pulsing';})()" 2>/dev/null | tail -1
agent-browser wait 5000
CN2=$(agent-browser eval "window.__pxc.tycoon.citz.roster.length" 2>/dev/null | tail -1 | tr -d '"')
CT2=$(agent-browser eval "window.__pxc.tycoon.citz.total" 2>/dev/null | tail -1 | tr -d '"')
chkge "T2 在册市民 ≥ 5" "${CN2:-0}" 5
chkge "T2 累计落户 ≥ 5" "${CT2:-0}" 5

echo "=== [4] T3 市民字段校验 ==="
FIELDS=$(agent-browser eval "(()=>{const r=window.__pxc.tycoon.citz.roster;const okName=r.every(c=>/^[\u4e00-\u9fa5]{2,4}$/.test(c.name));const okBio=r.every(c=>c.bio&&c.bio.length>=8);const okJob=r.every(c=>c.job&&c.job.length>=2);const okMood=r.every(c=>c.mood>=5&&c.mood<=100);const okLog=r.every(c=>c.log.length>=1);const okHome=r.every(c=>c.homeName&&c.homeName.length>=2);const okSince=r.every(c=>c.since>=0);return (okName&&okBio&&okJob&&okMood&&okLog&&okHome&&okSince)?'valid':'broken:'+JSON.stringify({okName,okBio,okJob,okMood,okLog,okHome,okSince});})()" 2>/dev/null | tail -1 | tr -d '"')
chk "T3 市民字段全部合法" "${FIELDS:-x}" "valid"

echo "=== [5] T4 市民之声 ==="
V=$(agent-browser eval "(()=>{const v=window.__pxc.tycoon.citzVoice();return v&&v.name&&v.text.length>=6?'ok':'broken';})()" 2>/dev/null | tail -1 | tr -d '"')
chk "T4 citzVoice() 返回完整心声" "${V:-x}" "ok"
VTAX=$(agent-browser eval "(()=>{const t=window.__pxc.tycoon;t.taxRate=15;const v=t.citzVoice();t.taxRate=9;return v&&v.text.length>=6?'ok':'broken';})()" 2>/dev/null | tail -1 | tr -d '"')
chk "T4 高税下仍有心声" "${VTAX:-x}" "ok"

echo "=== [6] T5 火灾事件 → 市民大事记反应 ==="
FE=$(agent-browser eval "window.__pxc.tycoon.forceEvent('fire',window.__pxc.map)" 2>/dev/null | tail -1 | tr -d '"')
chk "T5 forceEvent('fire') 生效" "${FE:-x}" "true"
agent-browser wait 800
REACT=$(agent-browser eval "window.__pxc.tycoon.citz.roster.some(c=>c.log.some(l=>l.text.includes('大火')))?'yes':'no'" 2>/dev/null | tail -1 | tr -d '"')
chk "T5 市民大事记含火灾反应" "${REACT:-x}" "yes"

echo "=== [7] T6 视图与 HUD ==="
VIEW=$(agent-browser eval "(()=>{const c=window.__pxc.tycoon.view().citz;return (c&&c.n>=5&&c.total>=5&&c.avgMood>=0&&Array.isArray(c.roster)&&c.roster.length===c.n&&c.roster[0].bio)?'full':'broken';})()" 2>/dev/null | tail -1 | tr -d '"')
chk "T6 view().citz 字段完整" "${VIEW:-x}" "full"
CHIP=$(agent-browser eval "[...document.querySelectorAll('button.chip')].some(b=>(b.title||'').includes('市民列传'))?'yes':'no'" 2>/dev/null | tail -1 | tr -d '"')
chk "T6 HUD 市民芯片存在" "${CHIP:-x}" "yes"

echo "=== [8] T7 行人命中检测 ==="
SPOT=$(agent-browser eval "(()=>{const e=window.__pxc;const i=e.actors.actors.findIndex(a=>a.kind===0&&!a.tour);if(i<0)return 'noped';const p=e.actorCssAt(i);if(!p)return 'nopos';const card=e.spotPedestrian(p.x,p.y);return card&&card.name?'hit:'+card.name:'miss';})()" 2>/dev/null | tail -1 | tr -d '"')
case "$SPOT" in
  hit:*) ok "T7 点击行人返回名片（${SPOT#hit:}）";;
  *) bad "T7 行人命中失败 ($SPOT)";;
esac
FAR=$(agent-browser eval "window.__pxc.spotPedestrian(-9999,-9999)===null?'null':'notnull'" 2>/dev/null | tail -1 | tr -d '"')
chk "T7 远处点击返回 null" "${FAR:-x}" "null"

echo "=== [9] T8 头像生成与缓存 ==="
AV=$(agent-browser eval "(()=>{const e=window.__pxc;const a=e.citizenAvatar(3,0,0,64);const b=e.citizenAvatar(3,0,0,64);const c=e.citizenAvatar(5,2,7,64);return (a.startsWith('data:image/png')&&a===b&&c!==a)?'ok':'broken';})()" 2>/dev/null | tail -1 | tr -d '"')
chk "T8 头像 dataURL + 缓存命中" "${AV:-x}" "ok"

echo "=== [10] T9 合成点击行人 → 模态打开（街头偶遇）==="
CLICK=$(agent-browser eval "(()=>{const e=window.__pxc;const i=e.actors.actors.findIndex(a=>a.kind===0&&!a.tour);if(i<0)return 'noped';const p=e.actorCssAt(i);const cv=[...document.querySelectorAll('canvas')].sort((a,b)=>b.width-a.width)[0];const r=cv.getBoundingClientRect();const x=r.left+p.x,y=r.top+p.y;cv.dispatchEvent(new PointerEvent('pointerdown',{clientX:x,clientY:y,button:0,pointerId:1,bubbles:true}));cv.dispatchEvent(new PointerEvent('pointerup',{clientX:x,clientY:y,button:0,pointerId:1,bubbles:true}));return 'clicked';})()" 2>/dev/null | tail -1 | tr -d '"')
chk "T9 合成 PointerEvent 派发" "${CLICK:-x}" "clicked"
agent-browser wait 800
MODAL=$(agent-browser eval "document.querySelector('.pxc-citz')?'open':'closed'" 2>/dev/null | tail -1 | tr -d '"')
chk "T9 市民列传模态打开" "${MODAL:-x}" "open"
SPOTMARK=$(agent-browser eval "document.querySelector('.cd-spot')?'yes':'no'" 2>/dev/null | tail -1 | tr -d '"')
chk "T9 街头偶遇标记（cd-spot）" "${SPOTMARK:-x}" "yes"
VOICE_EL=$(agent-browser eval "document.querySelector('.citz-voice')?'yes':'no'" 2>/dev/null | tail -1 | tr -d '"')
chk "T9 市民之声条渲染" "${VOICE_EL:-x}" "yes"
agent-browser screenshot $OUT/v13_citz_spot.png >/dev/null && ok "截图 v13_citz_spot.png（街头偶遇）"

echo "=== [11] T10 名人册网格与详情 ==="
agent-browser eval "(()=>{const b=[...document.querySelectorAll('.pxc-citz button')].find(x=>(x.textContent||'').includes('返回名人册'));if(!b)return 'nobtn';b.click();return 'back';})()" 2>/dev/null | tail -1
agent-browser wait 500
GRID=$(agent-browser eval "document.querySelectorAll('.citz-card').length" 2>/dev/null | tail -1 | tr -d '"')
chkge "T10 名人册卡片渲染 ≥5" "${GRID:-0}" 5
agent-browser eval "(()=>{const c=document.querySelector('.citz-card');if(c)c.click();return 'sel';})()" 2>/dev/null | tail -1
agent-browser wait 500
DETAIL=$(agent-browser eval "(()=>{const bio=document.querySelector('.cd-bio');const log=document.querySelectorAll('.cd-log li').length;const ava=document.querySelector('.cd-ava');return (bio&&log>=1&&ava)?'full':'broken';})()" 2>/dev/null | tail -1 | tr -d '"')
chk "T10 详情页（传记+大事记+头像）" "${DETAIL:-x}" "full"
GOTO=$(agent-browser eval "(()=>{const b=[...document.querySelectorAll('.pxc-citz button')].find(x=>(x.textContent||'').includes('去家里看看'));if(!b)return 'nobtn';b.click();return 'goto';})()" 2>/dev/null | tail -1 | tr -d '"')
chk "T10 「去家里看看」按钮存在" "${GOTO:-x}" "goto"
agent-browser wait 600
agent-browser screenshot $OUT/v13_citz_home.png >/dev/null && ok "截图 v13_citz_home.png（定位住所）"

echo "=== [12] T11 存档 v10 往返（reload）==="
SAVE1=$(agent-browser eval "(()=>{const t=window.__pxc.tycoon;t.save(window.__pxc.map);return 'n:'+t.citz.roster.length+'|first:'+t.citz.roster[0].name;})()" 2>/dev/null | tail -1 | tr -d '"')
echo "  存档：$SAVE1"
agent-browser reload
agent-browser wait --fn "window.__pxc!==undefined" --timeout 60000
agent-browser wait 3000
SAVE2=$(agent-browser eval "(()=>{const t=window.__pxc.tycoon;return 'n:'+t.citz.roster.length+'|first:'+(t.citz.roster[0]?t.citz.roster[0].name:'无');})()" 2>/dev/null | tail -1 | tr -d '"')
echo "  读档：$SAVE2"
if [ "$SAVE1" = "$SAVE2" ]; then ok "T11 reload 后名人册完整保留"; else bad "T11 名人册往返不一致 ($SAVE1 → $SAVE2)"; fi
LOGKEEP=$(agent-browser eval "window.__pxc.tycoon.citz.roster.some(c=>c.log.length>=1)?'yes':'no'" 2>/dev/null | tail -1 | tr -d '"')
chk "T11 reload 后大事记保留" "${LOGKEEP:-x}" "yes"

echo "=== [13] T12 成就：百家灯火 / 家喻户晓 ==="
agent-browser eval "window.__pxc.tycoon.citz.total=100;'set'" >/dev/null
agent-browser wait 3000
A1=$(agent-browser eval "window.__pxc.tycoon.achv.has('citz100')?'yes':'no'" 2>/dev/null | tail -1 | tr -d '"')
chk "T12 成就「百家灯火」解锁" "${A1:-x}" "yes"
agent-browser eval "(()=>{const t=window.__pxc.tycoon;const c0=t.citz.roster[0];for(let i=t.citz.roster.length;i<28;i++)t.citz.roster.push({...c0,id:900+i});return 'filled:'+t.citz.roster.length;})()" 2>/dev/null | tail -1
agent-browser wait 3000
A2=$(agent-browser eval "window.__pxc.tycoon.achv.has('famous')?'yes':'no'" 2>/dev/null | tail -1 | tr -d '"')
chk "T12 成就「家喻户晓」解锁" "${A2:-x}" "yes"

echo "=== [14] T13 任务链「城市家人」==="
Q=$(agent-browser eval "(()=>{const t=window.__pxc.tycoon;const backup=t.questIdx;let found=-1;for(let i=0;i<50;i++){t.questIdx=i;if(t.view().questTitle==='城市家人'){found=i;break;}}t.questIdx=backup;return found>=0?'found@'+found:'missing';})()" 2>/dev/null | tail -1 | tr -d '"')
case "$Q" in
  found@*) ok "T13 任务「城市家人」存在（${Q#found@}）";;
  *) bad "T13 任务缺失 ($Q)";;
esac

echo "=== [15] T14 控制台错误 + 城市截图 ==="
ERRS=$(agent-browser errors 2>/dev/null | grep -v "^$" | head -5)
if [ -z "$ERRS" ]; then ok "无页面错误"; else echo "  ⚠ 页面错误:"; echo "$ERRS"; FAIL=$((FAIL+1)); fi
agent-browser eval "(()=>{const e=window.__pxc;e.centerAt(124,126);return 'cam';})()" >/dev/null
agent-browser wait 1200
agent-browser screenshot $OUT/v13_city.png >/dev/null && ok "截图 v13_city.png"

echo "=== [16] 移动端 390×844（市民面板）==="
agent-browser set viewport 390 844
agent-browser reload
agent-browser wait --fn "window.__pxc!==undefined" --timeout 60000
agent-browser wait 3000
agent-browser eval "(()=>{const b=[...document.querySelectorAll('button.chip')].find(x=>(x.title||'').includes('市民列传'));if(!b)return 'nobtn';b.click();return 'open';})()" 2>/dev/null | tail -1
agent-browser wait 600
MOB=$(agent-browser eval "document.querySelector('.pxc-citz')?'open':'closed'" 2>/dev/null | tail -1 | tr -d '"')
chk "移动端市民面板打开" "${MOB:-x}" "open"
agent-browser screenshot $OUT/v13_mobile.png >/dev/null && ok "截图 v13_mobile.png"
MERRS=$(agent-browser errors 2>/dev/null | grep -v "^$" | head -3)
if [ -z "$MERRS" ]; then ok "移动端无页面错误"; else echo "  ⚠ 移动端错误:"; echo "$MERRS"; FAIL=$((FAIL+1)); fi

echo ""
echo "========== 结果: PASS=$PASS FAIL=$FAIL =========="
[ $FAIL -eq 0 ]
