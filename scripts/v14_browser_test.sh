#!/bin/bash
# ============================================================
# v14_browser_test.sh — 声色都市（音效矩阵 + 新手引导）端到端验证
# 验证点：
#   S1  新档开局：欢迎引导横幅显示 + Beeper 就绪
#   S2  音效矩阵：9 种新音色播放无异常 + 历史记录
#   S3  节流：coin/click 连发 5 次仅记录 1 次
#   S4  音量持久化：0.3 → reload 恢复
#   S5  静音持久化：关 → localStorage on:false
#   S6  火灾事件：alarm 警报 + siren 警笛（消防局出动）
#   S7  救援：resolveEvent → rescue 扫弦
#   S8  成就：pop=150 → achieve 凯旋
#   S9  科技：sp=50 + research('irrig') → tech
#   S10 迁入：人口脉冲 → movein 门铃
#   S11 季节：setSeason(2) → season 钟声
#   S12 电车：两站通车 → bell 发车铃
#   T1  引导链：开始引导 → 修路/建房/市民条件已满足自动滑进 → 开门营业
#   T2  条件推进：布 shop → 打开钱袋子
#   T3  面板推进：点 LV 芯片（财政）→ 认识你的市民
#   T4  市民推进：点「民」芯片 → 引导完成（finale）
#   T5  毕业：banner 消失 + localStorage finished
#   T6  老玩家静默：清引导记录留存档 → reload 无横幅
#   T7  跳过路径：清档 → 欢迎 → 跳过引导 → dismissed
#   T8  帮助重播：「重新查看新手引导」→ 横幅回归
#   T9  声音弹层：喇叭开关/音量滑杆/持久化/完成关闭
#   T10 无控制台错误 + 双端截图
# ============================================================
set -u
B=http://localhost:3000
OUT=/home/z/my-project/scripts
PASS=0; FAIL=0
ok()   { echo "  ✓ $1"; PASS=$((PASS+1)); }
bad()  { echo "  ✗ $1"; FAIL=$((FAIL+1)); }
chk()  { if [ "$2" = "$3" ]; then ok "$1 ($2)"; else bad "$1 (got=$2 want=$3)"; fi; }
chkge() { if [ "${2%.*}" -ge "$3" ] 2>/dev/null; then ok "$1 ($2 >= $3)"; else bad "$1 (got=$2 want>=$3)"; fi; }
tutTitle() { agent-browser eval "(()=>{const el=document.querySelector('.pxc-tut .tut-title');return el?el.textContent:'none';})()" 2>/dev/null | tail -1 | tr -d '"'; }

echo "=== [1] 桌面 1440×900 新档开局 ==="
agent-browser set viewport 1440 900
agent-browser open $B
agent-browser storage local clear >/dev/null 2>&1
agent-browser reload
agent-browser wait --fn "window.__pxc!==undefined" --timeout 90000 && ok "引擎就绪" || bad "引擎超时"
agent-browser wait 3000

TUT1=$(tutTitle)
chk "S1 欢迎引导横幅显示" "${TUT1:-x}" "欢迎来到像素都市"
BEEPER=$(agent-browser eval "(()=>{const b=window.__pxc.beeper;return (b&&b.enabled===true&&b.volume===0.7)?'ready':'broken';})()" 2>/dev/null | tail -1 | tr -d '"')
chk "S1 Beeper 就绪（开·默认音量 0.7）" "${BEEPER:-x}" "ready"
WELCOME_BTN=$(agent-browser eval "[...document.querySelectorAll('.pxc-tut button')].some(b=>b.textContent.includes('开始引导'))?'yes':'no'" 2>/dev/null | tail -1 | tr -d '"')
chk "S1 欢迎步按钮（开始引导/跳过）" "${WELCOME_BTN:-x}" "yes"

echo "=== [2] S2 音效矩阵：9 种新音色 ==="
SFX=$(agent-browser eval "(()=>{const b=window.__pxc.beeper;b.last.length=0;b.lastAt={};const ns=['alarm','cheer','siren','bell','achieve','season','movein','tech','rescue'];let bad='';for(const n of ns){try{b.play(n)}catch(e){bad=n}}const got=b.last.map(x=>x.n);return (bad===''&&ns.every(n=>got.includes(n)))?'all9':'broken:'+bad;})()" 2>/dev/null | tail -1 | tr -d '"')
chk "S2 新音色全部可播且入史" "${SFX:-x}" "all9"

echo "=== [3] S3 节流 ==="
THRO=$(agent-browser eval "(()=>{const b=window.__pxc.beeper;b.last.length=0;b.lastAt={};for(let i=0;i<5;i++)b.play('coin');for(let i=0;i<5;i++)b.play('click');const c=b.last.filter(x=>x.n==='coin').length;const k=b.last.filter(x=>x.n==='click').length;return 'coin:'+c+' click:'+k;})()" 2>/dev/null | tail -1 | tr -d '"')
chk "S3 coin 连发 5 次仅 1 声" "${THRO%% *}" "coin:1"
chk "S3 click 连发 5 次仅 1 声" "${THRO##* }" "click:1"

echo "=== [4] S4 音量持久化（reload 往返）==="
agent-browser eval "(()=>{const b=window.__pxc.beeper;b.volume=0.3;b.savePrefs();return JSON.parse(localStorage.getItem('pxc_sound')).vol;})()" 2>/dev/null | tail -1 | tr -d '"' > /tmp/v14_vol
chk "S4 savePrefs 写入 0.3" "$(cat /tmp/v14_vol)" "0.3"
agent-browser reload
agent-browser wait --fn "window.__pxc!==undefined" --timeout 60000
agent-browser wait 2500
VOL2=$(agent-browser eval "window.__pxc.beeper.volume" 2>/dev/null | tail -1 | tr -d '"')
chk "S4 reload 后音量恢复 0.3" "${VOL2:-x}" "0.3"

echo "=== [5] S5 静音持久化 ==="
MUTE=$(agent-browser eval "(()=>{const b=window.__pxc.beeper;b.enabled=false;b.savePrefs();return JSON.parse(localStorage.getItem('pxc_sound')).on;})()" 2>/dev/null | tail -1 | tr -d '"')
chk "S5 静音写入 on:false" "${MUTE:-x}" "false"
MUTEPLAY=$(agent-browser eval "(()=>{const b=window.__pxc.beeper;b.last.length=0;b.play('coin');return b.last.length;})()" 2>/dev/null | tail -1 | tr -d '"')
chk "S5 静音期播放不入史" "${MUTEPLAY:-x}" "0"
agent-browser eval "window.__pxc.beeper.enabled=true;window.__pxc.beeper.savePrefs();'on'" >/dev/null

echo "=== [6] 布城（音效接线用）：路网 + 3 宅 + 消防局 + 双电车站 ==="
agent-browser eval "(()=>{const e=window.__pxc;for(let x=118;x<=134;x++){e.map.setRoad(x,126,true);e.map.setRoad(x,127,true);e.map.setRoad(x,128,true);}const h1=e.map.place('house',0,121,125,1);const h2=e.map.place('house',1,123,125,1);const h3=e.map.place('house',2,125,125,1);const fs=e.map.place('firestation',0,119,125,1);const t1=e.map.place('tramstop',0,128,125,1);const t2=e.map.place('tramstop',1,130,125,1);return 'roads:'+e.map.roadList().length+' h:'+h1+h2+h3+' fs:'+fs+' tram:'+t1+t2;})()" 2>/dev/null | tail -1
agent-browser wait 1500

echo "=== [7] S6 火灾：警报 + 警笛 ==="
agent-browser eval "window.__pxc.beeper.last.length=0;window.__pxc.beeper.lastAt={};'clear'" >/dev/null
FE=$(agent-browser eval "window.__pxc.tycoon.forceEvent('fire',window.__pxc.map)" 2>/dev/null | tail -1 | tr -d '"')
chk "S6 forceEvent('fire') 生效" "${FE:-x}" "true"
agent-browser wait 1200
ALARM=$(agent-browser eval "window.__pxc.beeper.last.some(x=>x.n==='alarm')?'yes':'no'" 2>/dev/null | tail -1 | tr -d '"')
chk "S6 灾害警报 alarm 触发" "${ALARM:-x}" "yes"
SIREN=$(agent-browser eval "window.__pxc.beeper.last.some(x=>x.n==='siren')?'yes':'no'" 2>/dev/null | tail -1 | tr -d '"')
chk "S6 消防出动警笛 siren 触发" "${SIREN:-x}" "yes"
FT=$(agent-browser eval "window.__pxc.actors.firetrucks" 2>/dev/null | tail -1 | tr -d '"')
chkge "S6 消防车在场" "${FT:-0}" 1

echo "=== [8] S7 救援音 ==="
RS=$(agent-browser eval "window.__pxc.tycoon.resolveEvent('fire')" 2>/dev/null | tail -1 | tr -d '"')
chk "S7 resolveEvent('fire') 生效" "${RS:-x}" "true"
RESC=$(agent-browser eval "window.__pxc.beeper.last.some(x=>x.n==='rescue')?'yes':'no'" 2>/dev/null | tail -1 | tr -d '"')
chk "S7 应急到场 rescue 音触发" "${RESC:-x}" "yes"

echo "=== [9] S10 迁入音（人口脉冲）==="
agent-browser eval "(()=>{const b=window.__pxc.beeper;b.last.length=0;b.lastAt={};const t=window.__pxc.tycoon;let iv=null;iv=setInterval(()=>{t.pop=Math.min(24,t.pop+4)},250);setTimeout(()=>clearInterval(iv),2600);return 'pulsing';})()" 2>/dev/null | tail -1
agent-browser wait 4000
MOVEIN=$(agent-browser eval "window.__pxc.beeper.last.some(x=>x.n==='movein')?'yes':'no'" 2>/dev/null | tail -1 | tr -d '"')
chk "S10 新市民落户 movein 音触发" "${MOVEIN:-x}" "yes"
POP=$(agent-browser eval "Math.floor(window.__pxc.tycoon.pop)" 2>/dev/null | tail -1 | tr -d '"')
chkge "S10 人口 ≥ 5（教程 folk 条件）" "${POP:-0}" 5

echo "=== [10] S9 科技音 ==="
TECH=$(agent-browser eval "(()=>{const e=window.__pxc;e.beeper.last.length=0;e.beeper.lastAt={};e.tycoon.sp=50;const r=e.research('irrig');const got=e.beeper.last.some(x=>x.n==='tech');return r+':'+(got?'yes':'no');})()" 2>/dev/null | tail -1 | tr -d '"')
chk "S9 research('irrig') 成功且 tech 音触发" "${TECH:-x}" "ok:yes"

echo "=== [11] S8 成就音 ==="
agent-browser eval "window.__pxc.beeper.last.length=0;window.__pxc.beeper.lastAt={};window.__pxc.tycoon.pop=150;'set'" >/dev/null
agent-browser wait 3500
ACHV=$(agent-browser eval "(()=>{const t=window.__pxc.tycoon;return t.achv.has('pop100')?'yes':'no';})()" 2>/dev/null | tail -1 | tr -d '"')
chk "S8 成就「人口破百」解锁" "${ACHV:-x}" "yes"
ACHS=$(agent-browser eval "window.__pxc.beeper.last.some(x=>x.n==='achieve')?'yes':'no'" 2>/dev/null | tail -1 | tr -d '"')
chk "S8 成就凯旋 achieve 音触发" "${ACHS:-x}" "yes"
agent-browser eval "(()=>{const t=window.__pxc.tycoon;t.pop=20;'reset';})()" >/dev/null

echo "=== [12] S11 季节音 ==="
SEA=$(agent-browser eval "(()=>{const e=window.__pxc;e.beeper.last.length=0;e.beeper.lastAt={};e.setSeason(2);return e.beeper.last.some(x=>x.n==='season')?'yes':'no';})()" 2>/dev/null | tail -1 | tr -d '"')
chk "S11 setSeason(2) → season 钟声" "${SEA:-x}" "yes"

echo "=== [13] S12 电车铃（直接触发发车）==="
SPAWN=$(agent-browser eval "(()=>{const e=window.__pxc;e.beeper.last.length=0;e.beeper.lastAt={};e.actors.spawnTram(e.map);return 'spawned:'+e.actors.trams;})()" 2>/dev/null | tail -1 | tr -d '"')
echo "  发车：$SPAWN"
agent-browser wait 400
BELL=$(agent-browser eval "window.__pxc.beeper.last.some(x=>x.n==='bell')?'yes':'no'" 2>/dev/null | tail -1 | tr -d '"')
chk "S12 电车发车 bell 音触发" "${BELL:-x}" "yes"
TRAM=$(agent-browser eval "window.__pxc.actors.trams" 2>/dev/null | tail -1 | tr -d '"')
chkge "S12 电车在场" "${TRAM:-0}" 1

echo "=== [14] T1 引导链：开始引导 → 条件滑进 ==="
START=$(agent-browser eval "(()=>{const b=[...document.querySelectorAll('.pxc-tut button')].find(x=>x.textContent.includes('开始引导'));if(!b)return 'nobtn';b.click();return 'ok';})()" 2>/dev/null | tail -1 | tr -d '"')
chk "T1 点击「开始引导」" "${START:-x}" "ok"
agent-browser wait 2000
T1A=$(tutTitle)
chk "T1 修路/建房/市民条件已满足自动滑进 → 开门营业" "${T1A:-x}" "开门营业"
DOTS=$(agent-browser eval "document.querySelectorAll('.pxc-tut .tut-dots i.on').length" 2>/dev/null | tail -1 | tr -d '"')
chkge "T1 进度点 3/6 已点亮" "${DOTS:-0}" 3
STEPNO=$(agent-browser eval "(()=>{const el=document.querySelector('.pxc-tut .tut-stepno');return el?el.textContent:'none';})()" 2>/dev/null | tail -1 | tr -d '"')
chk "T1 步骤计数 4/6" "${STEPNO:-x}" "4/6"
agent-browser screenshot $OUT/v14_tut_banner.png >/dev/null && ok "截图 v14_tut_banner.png（引导横幅）"

echo "=== [15] T2 布店 → 打开钱袋子 ==="
agent-browser eval "window.__pxc.map.place('shop',0,132,125,1);'shop'" >/dev/null
agent-browser wait 2000
T2=$(tutTitle)
chk "T2 岗位≥3 → 打开钱袋子" "${T2:-x}" "打开钱袋子"

echo "=== [16] T3 点 LV 芯片（财政报告）→ 认识你的市民 ==="
agent-browser eval "(()=>{const b=document.querySelector('.chip.lv');if(!b)return 'nobtn';b.click();return 'ok';})()" 2>/dev/null | tail -1 | tr -d '"'
agent-browser wait 1500
FISCAL=$(agent-browser eval "document.querySelector('.pxc-fiscal')?'open':'closed'" 2>/dev/null | tail -1 | tr -d '"')
chk "T3 财政报告模态打开" "${FISCAL:-x}" "open"
agent-browser eval "(()=>{const x=document.querySelector('.pxc-fiscal .pxc-x');if(x)x.click();return 'closed';})()" >/dev/null
agent-browser wait 1200
T3=$(tutTitle)
chk "T3 fiscalOpened → 认识你的市民" "${T3:-x}" "认识你的市民"

echo "=== [17] T4 点「民」芯片 → 引导完成 ==="
agent-browser eval "(()=>{const b=[...document.querySelectorAll('button.chip')].find(x=>(x.title||'').includes('市民列传'));if(!b)return 'nobtn';b.click();return 'ok';})()" 2>/dev/null | tail -1 | tr -d '"'
agent-browser wait 1500
CITZM=$(agent-browser eval "document.querySelector('.pxc-citz')?'open':'closed'" 2>/dev/null | tail -1 | tr -d '"')
chk "T4 市民列传模态打开" "${CITZM:-x}" "open"
agent-browser eval "(()=>{const x=document.querySelector('.pxc-citz .pxc-x');if(x)x.click();return 'closed';})()" >/dev/null
agent-browser wait 1200
T4=$(tutTitle)
chk "T4 citzOpened → 引导完成（finale）" "${T4:-x}" "引导完成！"

echo "=== [18] T5 毕业 ==="
GRAD=$(agent-browser eval "(()=>{const b=[...document.querySelectorAll('.pxc-tut button')].find(x=>x.textContent.includes('毕业'));if(!b)return 'nobtn';b.click();return 'ok';})()" 2>/dev/null | tail -1 | tr -d '"')
chk "T5 点击「毕业！」" "${GRAD:-x}" "ok"
agent-browser wait 600
GONE=$(agent-browser eval "document.querySelector('.pxc-tut')?'still':'gone'" 2>/dev/null | tail -1 | tr -d '"')
chk "T5 横幅消失" "${GONE:-x}" "gone"
FIN=$(agent-browser eval "JSON.parse(localStorage.getItem('pxc_tut_v1')).finished" 2>/dev/null | tail -1 | tr -d '"')
chk "T5 localStorage finished:true" "${FIN:-x}" "true"

echo "=== [19] T6 老玩家静默（清引导留存档）==="
agent-browser eval "localStorage.removeItem('pxc_tut_v1');'cleared'" >/dev/null
agent-browser reload
agent-browser wait --fn "window.__pxc!==undefined" --timeout 60000
agent-browser wait 2500
VET=$(agent-browser eval "document.querySelector('.pxc-tut')?'shown':'silent'" 2>/dev/null | tail -1 | tr -d '"')
chk "T6 老玩家（有存档）静默结业无横幅" "${VET:-x}" "silent"

echo "=== [20] T7 跳过路径（全新玩家）==="
agent-browser eval "localStorage.removeItem('pxc_tut_v1');localStorage.removeItem('pxc_tycoon_v1');'fresh'" >/dev/null
agent-browser reload
agent-browser wait --fn "window.__pxc!==undefined" --timeout 60000
agent-browser wait 2500
FRESH=$(tutTitle)
chk "T7 全新玩家欢迎横幅" "${FRESH:-x}" "欢迎来到像素都市"
SKIP=$(agent-browser eval "(()=>{const b=[...document.querySelectorAll('.pxc-tut button')].find(x=>x.textContent.includes('跳过引导'));if(!b)return 'nobtn';b.click();return 'ok';})()" 2>/dev/null | tail -1 | tr -d '"')
chk "T7 点击「跳过引导」" "${SKIP:-x}" "ok"
agent-browser wait 600
SKG=$(agent-browser eval "document.querySelector('.pxc-tut')?'still':'gone'" 2>/dev/null | tail -1 | tr -d '"')
chk "T7 跳过后横幅消失" "${SKG:-x}" "gone"
DIS=$(agent-browser eval "JSON.parse(localStorage.getItem('pxc_tut_v1')).dismissed" 2>/dev/null | tail -1 | tr -d '"')
chk "T7 localStorage dismissed:true" "${DIS:-x}" "true"

echo "=== [21] T8 帮助重播 ==="
agent-browser eval "(()=>{const b=[...document.querySelectorAll('button.pxc-winbtn')].find(x=>x.getAttribute('aria-label')==='帮助');if(!b)return 'nobtn';b.click();return 'ok';})()" 2>/dev/null | tail -1 | tr -d '"'
agent-browser wait 800
REPLAY=$(agent-browser eval "(()=>{const b=[...document.querySelectorAll('.pxc-modal button')].find(x=>x.textContent.includes('重新查看新手引导'));if(!b)return 'nobtn';b.click();return 'ok';})()" 2>/dev/null | tail -1 | tr -d '"')
chk "T8 点击「重新查看新手引导」" "${REPLAY:-x}" "ok"
agent-browser wait 800
T8=$(tutTitle)
chk "T8 横幅回归（欢迎步）" "${T8:-x}" "欢迎来到像素都市"
agent-browser eval "(()=>{const b=[...document.querySelectorAll('.pxc-tut button')].find(x=>x.textContent.includes('开始引导'));if(b)b.click();return 'adv';})()" >/dev/null
agent-browser wait 1000

echo "=== [22] T9 声音设置弹层 ==="
SNDBTN=$(agent-browser eval "(()=>{const b=[...document.querySelectorAll('button.pxc-winbtn')].find(x=>x.getAttribute('aria-label')==='声音设置');if(!b)return 'nobtn';b.click();return 'ok';})()" 2>/dev/null | tail -1 | tr -d '"')
chk "T9 点喇叭打开声音设置" "${SNDBTN:-x}" "ok"
agent-browser wait 500
POP1=$(agent-browser eval "document.querySelector('.pxc-sndpop')?'open':'closed'" 2>/dev/null | tail -1 | tr -d '"')
chk "T9 弹层显示" "${POP1:-x}" "open"
agent-browser eval "(()=>{const b=[...document.querySelectorAll('.pxc-sndpop .pxc-btn')].find(x=>x.textContent.trim()==='开');if(!b)return 'nobtn';b.click();return 'muted';})()" 2>/dev/null | tail -1 | tr -d '"'
MUTED=$(agent-browser eval "(()=>{const b=window.__pxc.beeper;return b.enabled===false&&JSON.parse(localStorage.getItem('pxc_sound')).on===false?'yes':'no';})()" 2>/dev/null | tail -1 | tr -d '"')
chk "T9 弹层开关静音 + 持久化" "${MUTED:-x}" "yes"
agent-browser eval "(()=>{const b=[...document.querySelectorAll('.pxc-sndpop .pxc-btn')].find(x=>x.textContent.trim()==='关');if(b)b.click();return 'on';})()" >/dev/null
VOLSET=$(agent-browser eval "(()=>{const r=document.querySelector('.pxc-sndpop input[type=range]');if(!r)return 'noslider';const setter=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;setter.call(r,'40');r.dispatchEvent(new Event('input',{bubbles:true}));return 'set';})()" 2>/dev/null | tail -1 | tr -d '"')
chk "T9 音量滑杆调至 40" "${VOLSET:-x}" "set"
agent-browser wait 500
VOLCHK=$(agent-browser eval "(()=>{const b=window.__pxc.beeper;return (Math.abs(b.volume-0.4)<0.01&&JSON.parse(localStorage.getItem('pxc_sound')).vol===0.4)?'yes':'no:'+b.volume;})()" 2>/dev/null | tail -1 | tr -d '"')
chk "T9 音量 0.4 生效 + 持久化" "${VOLCHK:-x}" "yes"
agent-browser screenshot $OUT/v14_sndpop.png >/dev/null && ok "截图 v14_sndpop.png（声音设置）"
DONE=$(agent-browser eval "(()=>{const b=[...document.querySelectorAll('.pxc-sndpop .pxc-btn')].find(x=>x.textContent.trim()==='完成');if(!b)return 'nobtn';b.click();return 'ok';})()" 2>/dev/null | tail -1 | tr -d '"')
agent-browser wait 400
POPC=$(agent-browser eval "document.querySelector('.pxc-sndpop')?'still':'closed'" 2>/dev/null | tail -1 | tr -d '"')
chk "T9 完成关闭弹层" "${POPC:-x}" "closed"
agent-browser eval "window.__pxc.beeper.volume=0.7;window.__pxc.beeper.savePrefs();'reset'" >/dev/null

echo "=== [23] T10 控制台错误 + 城市截图 ==="
ERRS=$(agent-browser errors 2>/dev/null | grep -v "^$" | head -5)
if [ -z "$ERRS" ]; then ok "无页面错误"; else echo "  ⚠ 页面错误:"; echo "$ERRS"; FAIL=$((FAIL+1)); fi
agent-browser eval "(()=>{const e=window.__pxc;e.centerAt(124,126);return 'cam';})()" >/dev/null
agent-browser wait 1200
agent-browser screenshot $OUT/v14_city.png >/dev/null && ok "截图 v14_city.png（主视图）"

echo "=== [24] 移动端 390×844（引导横幅 + 声音弹层）==="
agent-browser set viewport 390 844
agent-browser reload
agent-browser wait --fn "window.__pxc!==undefined" --timeout 60000
agent-browser wait 2500
MTUT=$(agent-browser eval "document.querySelector('.pxc-tut')?'shown':'missing'" 2>/dev/null | tail -1 | tr -d '"')
chk "移动端引导横幅显示" "${MTUT:-x}" "shown"
agent-browser eval "(()=>{const b=[...document.querySelectorAll('button.pxc-winbtn')].find(x=>x.getAttribute('aria-label')==='声音设置');if(b)b.click();return 'ok';})()" >/dev/null
agent-browser wait 600
MPOP=$(agent-browser eval "document.querySelector('.pxc-sndpop')?'open':'closed'" 2>/dev/null | tail -1 | tr -d '"')
chk "移动端声音弹层显示" "${MPOP:-x}" "open"
agent-browser screenshot $OUT/v14_mobile.png >/dev/null && ok "截图 v14_mobile.png（移动端）"
MERRS=$(agent-browser errors 2>/dev/null | grep -v "^$" | head -3)
if [ -z "$MERRS" ]; then ok "移动端无页面错误"; else echo "  ⚠ 移动端错误:"; echo "$MERRS"; FAIL=$((FAIL+1)); fi

echo ""
echo "========== 结果: PASS=$PASS FAIL=$FAIL =========="
[ $FAIL -eq 0 ]
