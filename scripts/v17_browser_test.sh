#!/bin/bash
# ============================================================
# v17_browser_test.sh — 城市编年史 端到端验证（with_dev.sh 内运行）
# 验证点：
#   N 段：新档状态
#     N1  新档：chron.n=1（开埠建城）/ era=0 / total=1
#     N2  HUD「史」芯片存在且计数为 1
#     N3  编年史模态：开埠纪事 + 纪元带「拓荒营地」+ 统计行
#   E 段：事件入册
#     E1  forceEvent('fire') → cat=event tone=bad 火灾
#     E2  resolveEvent('fire') → tone=good 烈火英雄
#     E3  forceEvent('boom') → tone=good 游客潮
#     E4  forceEvent('blackout') → 补足第 12 笔（任务门槛）
#   T 段：科技 / 法令 / 节庆
#     T1  research('irrig') → cat=tech 文明进阶
#     T2  toggleOrd('welcome') → cat=ord 新政
#     T3  startFestival() → cat=fest 节庆开幕
#   M 段：纪元 / 里程碑
#     M1  pop=105 → era=1 炊烟村庄 + 百户灯火（105 非 100：chron.survey 读的是迁移后人口，
#          幸福<25 时首 tick 人口 −0.015 会把恰在阈值上的 100 压回 99.98 错过百户灯火；
#          E 段强制事件的 hap 惩罚会让 happiness 随机飘过 25 —— 留 5 人余量加固，仿 v21/v22 先例）
#     M2  pop=450 → era=3 一方城市 + 成就「世代名城」
#     M3  coins=12000 → 府库充盈
#   Q 段：任务 / 成就
#     Q1  任务「以史为鉴」（chronN≥12）完成推进
#     Q2  成就「汗青永续」chron.total=60 解锁
#   P 段：存档 / 兼容 / UI
#     P1  save + reload：条目/累计/纪元全保留
#     P2  v16 老档（无 chron 字段）恢复不崩 + 补「旧卷续写」
#     P3  筛选器：灾祸 / 纪元 分卷过滤
#     P4  无控制台错误 + 桌面/移动截图
# ============================================================
set -u
B=http://localhost:3000
OUT=/home/z/my-project/scripts
PASS=0; FAIL=0
ok()   { echo "  ✓ $1"; PASS=$((PASS+1)); }
bad()  { echo "  ✗ $1"; FAIL=$((FAIL+1)); }
chk()  { if [ "$2" = "$3" ]; then ok "$1 ($2)"; else bad "$1 (got=$2 want=$3)"; fi; }
chkge() { if [ "${2%.*}" -ge "$3" ] 2>/dev/null; then ok "$1 ($2 >= $3)"; else bad "$1 (got=$2 want>=$3)"; fi; }
errcount() { agent-browser errors --json 2>/dev/null | python3 -c "import json,sys
try: print(len(json.load(sys.stdin).get('data',{}).get('errors',[])))
except Exception: print(0)"; }
errtexts() { agent-browser errors --json 2>/dev/null | python3 -c "import json,sys
try:
 for e in json.load(sys.stdin).get('data',{}).get('errors',[]):
  print('  ✗ '+e.get('text','').split(chr(10))[0][:150])
except Exception: pass"; }

echo "=== [1] 桌面端 1440×900 新档开局 ==="
agent-browser close >/dev/null 2>&1; sleep 1
agent-browser set viewport 1440 900
agent-browser open $B
agent-browser storage local clear >/dev/null 2>&1
agent-browser reload
agent-browser wait --fn "window.__pxc!==undefined" --timeout 90000 && ok "引擎就绪" || bad "引擎超时"
agent-browser wait 3000

echo "=== [2] N 段：新档状态 ==="
N1=$(agent-browser eval "(()=>{const c=window.__pxc.tycoon.chron;return 'n:'+c.entries.length+'|era:'+c.era+'|tot:'+c.total;})()" 2>/dev/null | tail -1 | tr -d '"')
chk "N1 新档开埠纪事" "${N1:-x}" "n:1|era:0|tot:1"
FOUND=$(agent-browser eval "window.__pxc.tycoon.chron.entries[0].title" 2>/dev/null | tail -1 | tr -d '"')
chk "N1b 首笔为「开埠建城」" "${FOUND:-x}" "开埠建城"
N2=$(agent-browser eval "(()=>{const c=[...document.querySelectorAll('.chip')].find(x=>x.textContent.includes('史'));return c?('v:'+c.querySelector('b').textContent):'none';})()" 2>/dev/null | tail -1 | tr -d '"')
chk "N2 HUD 史芯片存在" "${N2:-x}" "v:1"
N3=$(agent-browser eval "(()=>{const c=[...document.querySelectorAll('.chip')].find(x=>x.textContent.includes('史'));if(!c)return 'nochip';c.click();return 'open';})()" 2>/dev/null | tail -1 | tr -d '"')
agent-browser wait 600
N3V=$(agent-browser eval "(()=>{const p=document.querySelector('.pxc-chron');if(!p)return 'nomodal';const has=p.textContent.includes('开埠建城');const era=p.textContent.includes('拓荒营地');const meta=p.textContent.includes('开埠第');return (has&&era&&meta)?'ok':'miss';})()" 2>/dev/null | tail -1 | tr -d '"')
chk "N3 模态：开埠纪事 + 纪元带 + 统计行" "${N3V:-x}" "ok"
agent-browser screenshot $OUT/v17_chron_new.png >/dev/null && ok "截图 v17_chron_new.png（开埠卷）"
agent-browser eval "(()=>{document.querySelector('.pxc-x')?.click();return 'closed';})()" >/dev/null 2>&1

echo "=== [3] E 段：事件入册 ==="
CNT0=$(agent-browser eval "window.__pxc.tycoon.chron.entries.length" 2>/dev/null | tail -1 | tr -d '"')
E1=$(agent-browser eval "(()=>{const e=window.__pxc;const ok=e.tycoon.forceEvent('fire',e.map);return 'r:'+ok;})()" 2>/dev/null | tail -1 | tr -d '"')
agent-browser wait 800
E1V=$(agent-browser eval "(()=>{const es=window.__pxc.tycoon.chron.entries;const x=es[es.length-1];return 'cat:'+x.cat+'|tone:'+x.tone+'|t:'+x.title;})()" 2>/dev/null | tail -1 | tr -d '"')
chk "E1a 火灾事件触发" "${E1:-x}" "r:true"
chk "E1b 火灾入册（event/bad）" "${E1V:-x}" "cat:event|tone:bad|t:火灾"
E2=$(agent-browser eval "(()=>{const t=window.__pxc.tycoon;const ok=t.resolveEvent('fire');const es=t.chron.entries;const x=es[es.length-1];return 'r:'+ok+'|tone:'+x.tone+'|t:'+x.title;})()" 2>/dev/null | tail -1 | tr -d '"')
chk "E2 救险入册（good/烈火英雄）" "${E2:-x}" "r:true|tone:good|t:烈火英雄"
E3=$(agent-browser eval "(()=>{const e=window.__pxc;e.tycoon.forceEvent('boom',e.map);const es=e.tycoon.chron.entries;const x=es[es.length-1];return 'tone:'+x.tone+'|t:'+x.title;})()" 2>/dev/null | tail -1 | tr -d '"')
chk "E3 游客潮喜讯入册" "${E3:-x}" "tone:good|t:游客潮"
E4=$(agent-browser eval "(()=>{const e=window.__pxc;e.tycoon.forceEvent('blackout',e.map);const es=e.tycoon.chron.entries;const x=es[es.length-1];return 'tone:'+x.tone+'|t:'+x.title;})()" 2>/dev/null | tail -1 | tr -d '"')
chk "E4 停电事故入册" "${E4:-x}" "tone:bad|t:停电事故"

echo "=== [4] T 段：科技 / 法令 / 节庆 ==="
T1=$(agent-browser eval "(()=>{const t=window.__pxc.tycoon;t.sp=100;const r=t.research('irrig');const es=t.chron.entries;const x=es[es.length-1];return 'r:'+r+'|cat:'+x.cat+'|t:'+x.title;})()" 2>/dev/null | tail -1 | tr -d '"')
chk "T1 科技入册（tech/文明进阶）" "${T1:-x}" "r:ok|cat:tech|t:文明进阶"
T2=$(agent-browser eval "(()=>{const t=window.__pxc.tycoon;t.level=3;const r=t.toggleOrd('welcome');const es=t.chron.entries;const x=es[es.length-1];return 'r:'+r+'|cat:'+x.cat+'|t:'+x.title;})()" 2>/dev/null | tail -1 | tr -d '"')
chk "T2 法令入册（ord/新政）" "${T2:-x}" "r:on|cat:ord|t:新政「开放落户」"
T3=$(agent-browser eval "(()=>{const e=window.__pxc;const t=e.tycoon;t.level=5;t.coins=5000;t.festCd=0;e.setSeason(1,false);const r=t.startFestival();const es=t.chron.entries;const x=es[es.length-1];return 'r:'+r+'|cat:'+x.cat+'|t:'+x.title;})()" 2>/dev/null | tail -1 | tr -d '"')
chk "T3 节庆入册（fest/花火大会开幕）" "${T3:-x}" "r:ok|cat:fest|t:「花火大会」开幕"

echo "=== [5] M 段：纪元 / 里程碑 ==="
# 布住宅（支撑人口容量，防 tick 回落）
# v22 兼容：同排补 3 所学校（R6 学区全覆盖 40 栋公寓）—— 零学区的住宅群会触发
#   v22「望学兴叹」幸福 −8，把人造空城压到幸福 <25 的人口负增长区间，百户灯火永不触发
APT=$(agent-browser eval "(()=>{const e=window.__pxc;let n=0;for(let x=116;x<=135;x++){if(e.map.place('apartment',x%5,x,120))n++;if(e.map.place('apartment',(x+2)%5,x,124))n++;}
e.map.place('school',0,116,121);e.map.place('school',0,125,121);e.map.place('school',0,133,121);
return n;})()" 2>/dev/null | tail -1 | tr -d '"')
chkge "M0 布住宅成功（≥20 栋公寓）" "${APT:-x}" "20"
agent-browser wait 800
M1=$(agent-browser eval "(()=>{const t=window.__pxc.tycoon;t.pop=105;return 'set';})()" 2>/dev/null | tail -1)
agent-browser wait 1200
M1V=$(agent-browser eval "(()=>{const c=window.__pxc.tycoon.chron;const es=c.entries;const eraUp=es.some(x=>x.cat==='era'&&x.tone==='big'&&x.title.includes('炊烟村庄'));const mile=es.some(x=>x.cat==='mile'&&x.title==='百户灯火');return 'era:'+c.era+'|up:'+eraUp+'|mile:'+mile;})()" 2>/dev/null | tail -1 | tr -d '"')
chk "M1 pop105 → 纪元「炊烟村庄」+ 百户灯火" "${M1V:-x}" "era:1|up:true|mile:true"
M2=$(agent-browser eval "(()=>{const t=window.__pxc.tycoon;t.pop=450;return 'set';})()" 2>/dev/null | tail -1)
agent-browser wait 1200
M2V=$(agent-browser eval "(()=>{const c=window.__pxc.tycoon.chron;const es=c.entries;const eraUp=es.some(x=>x.cat==='era'&&x.tone==='big'&&x.title.includes('一方城市'));return 'era:'+c.era+'|maxEra:'+c.maxEra+'|up:'+eraUp;})()" 2>/dev/null | tail -1 | tr -d '"')
chk "M2 pop450 → 纪元「一方城市」（跳级只记一笔）" "${M2V:-x}" "era:3|maxEra:3|up:true"
agent-browser wait 2600
M2A=$(agent-browser eval "window.__pxc.tycoon.achv.has('era3')?'yes':'no'" 2>/dev/null | tail -1 | tr -d '"')
chk "M2b 成就「世代名城」解锁" "${M2A:-x}" "yes"
M3=$(agent-browser eval "(()=>{const t=window.__pxc.tycoon;t.coins=12000;return 'set';})()" 2>/dev/null | tail -1)
agent-browser wait 1000
M3V=$(agent-browser eval "window.__pxc.tycoon.chron.entries.some(x=>x.title==='府库充盈')?'yes':'no'" 2>/dev/null | tail -1 | tr -d '"')
chk "M3 府库充盈里程碑" "${M3V:-x}" "yes"

echo "=== [6] Q 段：任务 / 成就 ==="
Q1=$(agent-browser eval "(()=>{const t=window.__pxc.tycoon;t.questIdx=38;return 'tot:'+t.chron.total;})()" 2>/dev/null | tail -1 | tr -d '"')
chkge "Q1a 编年史累计笔数 ≥ 12" "$(echo "$Q1" | grep -o 'tot:[0-9]*' | cut -d: -f2)" "12"
agent-browser wait 2000
Q1V=$(agent-browser eval "window.__pxc.tycoon.questIdx" 2>/dev/null | tail -1 | tr -d '"')
chk "Q1b 任务「以史为鉴」完成（qi=39 链走完）" "${Q1V:-x}" "39"
agent-browser eval "window.__pxc.tycoon.chron.total=60; 'bump'" >/dev/null 2>&1
agent-browser wait 2600
Q2=$(agent-browser eval "window.__pxc.tycoon.achv.has('chron60')?'yes':'no'" 2>/dev/null | tail -1 | tr -d '"')
chk "Q2 成就「汗青永续」解锁" "${Q2:-x}" "yes"

echo "=== [7] P 段：存档 / 兼容 / UI ==="
agent-browser eval "(()=>{const t=window.__pxc.tycoon;t.gHours=75;window.__pxc.tycoon.save(window.__pxc.map);return 'saved';})()" 2>/dev/null | tail -1
agent-browser reload >/dev/null 2>&1
agent-browser wait --fn "window.__pxc!==undefined" --timeout 90000 >/dev/null 2>&1
agent-browser wait 3000
P1=$(agent-browser eval "(()=>{const t=window.__pxc.tycoon;const c=t.chron;return 'n:'+c.entries.length+'|tot:'+c.total+'|era:'+c.era+'|gh:'+Math.floor(t.gHours);})()" 2>/dev/null | tail -1 | tr -d '"')
chkge "P1a 存档往返在册条目保留" "$(echo "$P1" | grep -o 'n:[0-9]*' | cut -d: -f2)" "12"
chkge "P1b 累计笔数保留（含测试补记 60）" "$(echo "$P1" | grep -o 'tot:[0-9]*' | cut -d: -f2)" "60"
chk "P1c 纪元保留 era=3" "$(echo "$P1" | grep -o 'era:[0-9]*' | cut -d: -f2)" "3"
chkge "P1d 游戏小时保留（gHours≥74）" "$(echo "$P1" | grep -o 'gh:[0-9]*' | cut -d: -f2)" "74"
# 筛选器（须在老档破坏性恢复之前验证）
agent-browser eval "(()=>{const c=[...document.querySelectorAll('.chip')].find(x=>x.textContent.includes('史'));if(!c)return 'nochip';c.click();return 'open';})()" >/dev/null 2>&1
agent-browser wait 600
P3A=$(agent-browser eval "(()=>{const p=document.querySelector('.pxc-chron');if(!p)return 'nomodal';const b=[...p.querySelectorAll('.cf-chip')].find(x=>x.textContent.startsWith('灾祸'));if(!b)return 'nofilter';b.click();return 'clicked';})()" 2>/dev/null | tail -1 | tr -d '"')
agent-browser wait 500
P3AV=$(agent-browser eval "(()=>{const p=document.querySelector('.pxc-chron');if(!p)return 'nomodal';const es=[...p.querySelectorAll('.cl-e')];const allBad=es.length>0&&es.every(x=>x.classList.contains('bad'));return 'n:'+es.length+'|allbad:'+allBad;})()" 2>/dev/null | tail -1 | tr -d '"')
chkge "P3a 灾祸分卷有条目（≥2）" "$(echo "$P3AV" | grep -o 'n:[0-9]*' | cut -d: -f2)" "2"
chk "P3b 灾祸分卷只剩 bad 条目" "$(echo "$P3AV" | grep -o 'allbad:[a-z]*' | cut -d: -f2)" "true"
P3B=$(agent-browser eval "(()=>{const p=document.querySelector('.pxc-chron');const b=[...p.querySelectorAll('.cf-chip')].find(x=>x.textContent.startsWith('纪元'));if(!b)return 'nofilter';b.click();return 'clicked';})()" 2>/dev/null | tail -1 | tr -d '"')
agent-browser wait 500
P3BV=$(agent-browser eval "(()=>{const p=document.querySelector('.pxc-chron');const es=[...p.querySelectorAll('.cl-e')];const allEra=es.length>0&&es.every(x=>x.textContent.includes('旧卷续写')||x.textContent.includes('开埠')||x.textContent.includes('迈入'));return 'n:'+es.length+'|allera:'+allEra;})()" 2>/dev/null | tail -1 | tr -d '"')
chk "P3c 纪元分卷 = 开埠 + 两次迈入" "$(echo "$P3BV" | grep -o 'n:[0-9]*' | cut -d: -f2)" "3"
chk "P3d 纪元分卷内容正确" "$(echo "$P3BV" | grep -o 'allera:[a-z]*' | cut -d: -f2)" "true"
agent-browser eval "(()=>{const p=document.querySelector('.pxc-chron');const b=[...p.querySelectorAll('.cf-chip')].find(x=>x.textContent.startsWith('全部'));if(b)b.click();return 'back';})()" >/dev/null 2>&1
agent-browser wait 400
agent-browser screenshot $OUT/v17_chron_full.png >/dev/null && ok "截图 v17_chron_full.png（全卷）"
agent-browser eval "(()=>{document.querySelector('.pxc-x')?.click();return 'closed';})()" >/dev/null 2>&1
# v16 老档兼容（剥掉 chron / gHours 字段 → 破坏性恢复，放最后）
P2=$(agent-browser eval "(()=>{const e=window.__pxc;const d=JSON.parse(localStorage.getItem('pxc_tycoon_v1'));delete d.chron;delete d.gHours;d.v=16;const r=e.tycoon.resume(e.map,d);const c=e.tycoon.chron;const re=c.entries.some(x=>x.title==='旧卷续写');return 'n:'+c.entries.length+'|era:'+c.era+'|re:'+re;})()" 2>/dev/null | tail -1 | tr -d '"')
chk "P2 v16 老档恢复：补「旧卷续写」+ 纪元按人口对齐" "${P2:-x}" "n:1|era:3|re:true"

echo "=== [8] P4 控制台错误 + 移动端 ==="
ERRN=$(errcount)
if [ "$ERRN" = "0" ]; then ok "无页面错误"; else echo "  ⚠ 页面错误($ERRN):"; errtexts; FAIL=$((FAIL+1)); fi
MERR_BASE=$(errcount)
agent-browser set viewport 390 844
agent-browser reload
agent-browser wait --fn "window.__pxc!==undefined" --timeout 60000
agent-browser wait 3000
MOB=$(agent-browser eval "(()=>{const c=[...document.querySelectorAll('.chip')].find(x=>x.textContent.includes('史'));if(!c)return 'nochip';c.click();return 'open';})()" 2>/dev/null | tail -1 | tr -d '"')
agent-browser wait 600
MOBP=$(agent-browser eval "document.querySelector('.pxc-chron')?'open':'closed'" 2>/dev/null | tail -1 | tr -d '"')
chk "移动端编年史面板打开" "${MOBP:-x}" "open"
agent-browser screenshot $OUT/v17_mobile_chron.png >/dev/null && ok "截图 v17_mobile_chron.png"
MERRN=$(errcount)
if [ "$MERRN" -le "${MERR_BASE:-0}" ]; then ok "移动端无页面错误"; else echo "  ⚠ 移动端错误($MERRN):"; errtexts; FAIL=$((FAIL+1)); fi

echo ""
echo "========== 结果: PASS=$PASS FAIL=$FAIL =========="
[ $FAIL -eq 0 ]
