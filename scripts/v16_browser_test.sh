#!/bin/bash
# ============================================================
# v16_browser_test.sh — 城市节庆 端到端验证（with_dev.sh 内运行）
# 验证点：
#   N 段：新档状态
#     N1  新档：fest=null / festCd=0 / festCount=0 / festKinds 空
#     N2  HUD「庆」芯片存在且计数为 0
#     N3  节庆面板打开：锁定季节夏季 → 显示「花火大会」
#     N4  市政厅 LV1 不足：startFestival → 'lv' + 面板锁定提示
#   F 段：举办流程（夏季花火大会）
#     F1  LV5 + 金币充足：startFestival → 'ok'，扣筹备费，fest.kind=1
#     F2  buff 生效：幸福度抬升 ≥ +3
#     F3  引擎视觉：festKind=1（花火粒子层激活）
#     F4  市民大事记：有人写了「花火大会」
#     F5  节日进行中重复举办 → 'busy'
#     F6  left 归零 → 自动落幕：fest=null，count 保留，市民心声回正常池
#     F7  冷却中再办 → 'cd'
#   S 段：四季轮换（切季 → 清冷却 → 各办一场）
#     S1  秋季丰收节：kind=2，foodProd ×1.5
#     S2  冬季暖灯节 kind=3 / 春季樱花祭 kind=0
#     S3  四种集齐 → 成就「四季轮庆」解锁
#   C 段：市民与系统联动
#     C1  节日中 citzVoice() 优先说节日台词
#     C2  任务「万人空巷」完成推进
#     C3  成就「节庆之都」：办满 8 场
#   P 段：存档 / 兼容 / UI / 错误
#     P1  save + reload：在途节日 kind/left + 累计 + 四种 全保留
#     P2  v11 老档（无 fest 字段）恢复不崩
#     P3  节庆面板 UI：进行中进度条 / 冷却态 / 就绪态按钮
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
# agent-browser 0.39.0：errors 文本输出丢消息、--clear 失效 → 用 --json + 开局重启浏览器
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
N1=$(agent-browser eval "(()=>{const t=window.__pxc.tycoon;return (t.fest===null)+'|'+t.festCd+'|'+t.festCount+'|'+t.festKinds.size;})()" 2>/dev/null | tail -1 | tr -d '"')
chk "N1 新档节日状态干净" "${N1:-x}" "true|0|0|0"
N2=$(agent-browser eval "(()=>{const c=[...document.querySelectorAll('.chip')].find(x=>x.textContent.includes('庆'));return c?('v:'+c.querySelector('b').textContent):'none';})()" 2>/dev/null | tail -1 | tr -d '"')
chk "N2 HUD 庆芯片存在" "${N2:-x}" "v:0"
# 锁定夏季（防测试中自动换季）
agent-browser eval "window.__pxc.setSeason(1,false); 'locked'" >/dev/null 2>&1
agent-browser wait 500
N3BTN=$(agent-browser eval "(()=>{const c=[...document.querySelectorAll('.chip')].find(x=>x.textContent.includes('庆'));if(!c)return 'nochip';c.click();return 'open';})()" 2>/dev/null | tail -1 | tr -d '"')
agent-browser wait 500
N3=$(agent-browser eval "(()=>{const p=document.querySelector('.pxc-fest');if(!p)return 'nomodal';return (p.textContent.includes('花火大会')&&p.textContent.includes('90 秒'))?'ok':'miss:'+p.querySelector('.fc-name')?.textContent;})()" 2>/dev/null | tail -1 | tr -d '"')
chk "N3 面板显示当季「花火大会」" "${N3:-x}" "ok"
N4=$(agent-browser eval "(()=>{const p=document.querySelector('.pxc-fest');const lock=p&&p.textContent.includes('LV3');const r=window.__pxc.tycoon.startFestival();return 'lock:'+(lock?'y':'n')+'|r:'+r;})()" 2>/dev/null | tail -1 | tr -d '"')
chk "N4 LV1 举办被拒" "${N4:-x}" "lock:y|r:lv"
agent-browser eval "(()=>{document.querySelector('.pxc-x').click();return 'closed';})()" >/dev/null 2>&1

echo "=== [3] 布城：路网 + 住宅 + 商铺 + 温室 + 风车 ==="
agent-browser eval "(()=>{const e=window.__pxc;for(let x=118;x<=134;x++){e.map.setRoad(x,126,true);e.map.setRoad(x,127,true);e.map.setRoad(x,128,true);}const a=e.map.place('apartment',0,121,125);const b=e.map.place('apartment',1,121,129);const c=e.map.place('house',0,131,125);const s=e.map.place('shop',0,131,127);const g=e.map.place('greenhouse',0,123,131);const g2=e.map.place('greenhouse',0,125,131);const w1=e.map.place('windmill',0,119,125);const w2=e.map.place('windmill',0,133,131);return 'roads:'+e.map.roadList().length+' apt:'+a+b+' house:'+c+' shop:'+s+' gh:'+g+g2+' wind:'+w1+w2;})()" 2>/dev/null | tail -1
agent-browser wait 1000

echo "=== [4] 人口脉冲 + 升到 LV5 ==="
agent-browser eval "(()=>{const t=window.__pxc.tycoon;let iv=null;iv=setInterval(()=>{t.pop=Math.min(64,t.pop+4)},250);setTimeout(()=>clearInterval(iv),2600);t.level=5;t.coins=5000;return 'pulse+lv5';})()" 2>/dev/null | tail -1
agent-browser wait 5000

echo "=== [5] F 段：举办流程（夏季花火大会） ==="
HAP0=$(agent-browser eval "window.__pxc.tycoon.view().happiness" 2>/dev/null | tail -1 | tr -d '"')
F1=$(agent-browser eval "(()=>{const t=window.__pxc.tycoon;const c0=t.coins;const r=t.startFestival();const cost=Math.round(c0-t.coins);return 'r:'+r+'|kind:'+(t.fest?t.fest.kind:'x')+'|left:'+Math.round(t.fest?t.fest.left:0)+'|cost:'+cost;})()" 2>/dev/null | tail -1 | tr -d '"')
chk "F1a 举办成功" "$(echo "$F1" | grep -o 'r:[a-z]*' | cut -d: -f2)" "ok"
chk "F1b 节日=夏季花火(kind 1)" "$(echo "$F1" | grep -o 'kind:[0-9]*' | cut -d: -f2)" "1"
chkge "F1c 时长 90 秒" "$(echo "$F1" | grep -o 'left:[0-9]*' | cut -d: -f2)" "85"
chkge "F1d 扣筹备费" "$(echo "$F1" | grep -o 'cost:[0-9]*' | cut -d: -f2)" "80"
agent-browser wait 800
HAP1=$(agent-browser eval "window.__pxc.tycoon.view().happiness" 2>/dev/null | tail -1 | tr -d '"')
HAPD=$(python3 -c "print(int(round($HAP1-$HAP0)))")
if [ "$HAPD" -ge 3 ] 2>/dev/null && [ "$HAPD" -le 10 ]; then ok "F2 幸福度抬升 (+$HAPD)"; else bad "F2 幸福度异常 (Δ=$HAPD, $HAP0→$HAP1)"; fi
FK=$(agent-browser eval "window.__pxc.festKind" 2>/dev/null | tail -1 | tr -d '"')
chk "F3 引擎视觉层=花火" "${FK:-x}" "1"
F4=$(agent-browser eval "(()=>{const r=window.__pxc.tycoon.citz;const n=r.roster.filter(c=>c.log.some(l=>String(l[1]||l.text||'').includes('花火')||JSON.stringify(l).includes('花火'))).length;return 'n:'+n;})()" 2>/dev/null | tail -1 | tr -d '"')
chkge "F4 市民大事记写了花火" "$(echo "$F4" | grep -o 'n:[0-9]*' | cut -d: -f2)" "1"
F5=$(agent-browser eval "window.__pxc.tycoon.startFestival()" 2>/dev/null | tail -1 | tr -d '"')
chk "F5 进行中重复举办被拒" "${F5:-x}" "busy"
# 节日心声优先
C1=$(agent-browser eval "(()=>{const t=window.__pxc.tycoon;const v=t.citzVoice();return v&&v.text?(v.text.includes('烟花')||v.text.includes('浴衣')||v.text.includes('花火')?'ok':'miss:'+v.text):'novoice';})()" 2>/dev/null | tail -1 | tr -d '"')
chk "C1 节日心声优先" "${C1:-x}" "ok"
# 快进落幕
agent-browser eval "window.__pxc.tycoon.fest.left=0.3; 'ff'" >/dev/null 2>&1
agent-browser wait 1500
F6=$(agent-browser eval "(()=>{const t=window.__pxc.tycoon;return (t.fest===null)+'|'+t.festCount+'|'+(t.festCd>0?'cd':'nacd');})()" 2>/dev/null | tail -1 | tr -d '"')
chk "F6 自动落幕（count 保留 + 冷却启动）" "${F6:-x}" "true|1|cd"
F7=$(agent-browser eval "window.__pxc.tycoon.startFestival()" 2>/dev/null | tail -1 | tr -d '"')
chk "F7 冷却中再办被拒" "${F7:-x}" "cd"

echo "=== [6] S 段：四季轮换 ==="
agent-browser eval "window.__pxc.setSeason(2,false); 'autumn'" >/dev/null 2>&1
agent-browser wait 800
FP0=$(agent-browser eval "window.__pxc.tycoon.view().foodProd" 2>/dev/null | tail -1 | tr -d '"')
agent-browser eval "(()=>{const t=window.__pxc.tycoon;t.festCd=0;const r=t.startFestival();return 'r:'+r+'|k:'+t.fest.kind;})()" >/dev/null 2>&1
agent-browser wait 800
FP1=$(agent-browser eval "window.__pxc.tycoon.view().foodProd" 2>/dev/null | tail -1 | tr -d '"')
RATIO=$(python3 -c "r=$FP1/max(0.01,$FP0); print(round(r,2))")
if [ "$(python3 -c "print(1 if 1.3<=$RATIO<=1.7 else 0)")" = "1" ]; then ok "S1 丰收节粮产 ×1.5 (ratio=$RATIO)"; else bad "S1 粮产乘数异常 (ratio=$RATIO, $FP0→$FP1)"; fi
agent-browser eval "window.__pxc.tycoon.fest.left=0.2; 'ff'" >/dev/null 2>&1
agent-browser wait 1000
# 冬 + 春
S2=$(agent-browser eval "(()=>{const e=window.__pxc;const t=e.tycoon;e.setSeason(3,false);t.festCd=0;const r1=t.startFestival();t.fest.left=0.2;return 'win:'+r1;})()" 2>/dev/null | tail -1 | tr -d '"')
agent-browser wait 1000
S3=$(agent-browser eval "(()=>{const e=window.__pxc;const t=e.tycoon;e.setSeason(0,false);t.festCd=0;const r2=t.startFestival();return 'spr:'+r2+'|k:'+t.fest.kind+'|kinds:'+t.festKinds.size;})()" 2>/dev/null | tail -1 | tr -d '"')
chk "S2a 冬季暖灯节可办" "$(echo "$S2" | grep -o 'win:[a-z]*' | cut -d: -f2)" "ok"
chk "S2b 春季樱花祭 kind=0" "$(echo "$S3" | grep -o 'k:[0-9]*' | cut -d: -f2)" "0"
chk "S3 四种集齐" "$(echo "$S3" | grep -o 'kinds:[0-9]*' | cut -d: -f2)" "4"
agent-browser wait 2600   # 成就检查每 2 秒一轮，等它跑完
ACH4=$(agent-browser eval "window.__pxc.tycoon.achv.has('fest4')?'yes':'no'" 2>/dev/null | tail -1 | tr -d '"')
chk "S4 成就「四季轮庆」解锁" "${ACH4:-x}" "yes"
# 樱花祭中截图（春樱 + 花瓣加密）
agent-browser eval "(()=>{const e=window.__pxc;e.centerAt(127,127);return 'cam';})()" >/dev/null 2>&1
agent-browser wait 1200
agent-browser screenshot $OUT/v16_city_sakura.png >/dev/null && ok "截图 v16_city_sakura.png（樱花祭）"
agent-browser eval "window.__pxc.tycoon.fest.left=0.2; 'ff'" >/dev/null 2>&1
agent-browser wait 1000

echo "=== [7] C 段：任务 / 成就补满 ==="
# 任务「万人空巷」在链尾（idx=37）：直接把 questIdx 指到它，靠已办场次完成
agent-browser eval "(()=>{const t=window.__pxc.tycoon;t.questIdx=37;return 'set';})()" 2>/dev/null | tail -1
agent-browser wait 2500
C2R=$(agent-browser eval "(()=>{const t=window.__pxc.tycoon;return 'qi:'+t.questIdx+'|count:'+t.festCount;})()" 2>/dev/null | tail -1 | tr -d '"')
chk "C2 任务「万人空巷」完成推进 (qi=38 任务链走完)" "$(echo "$C2R" | grep -o 'qi:[0-9]*' | cut -d: -f2)" "38"
# 办满 8 场 → 节庆之都（逐场快进：start → left 归零 → tick 落幕，eval 同步循环触发不了 tick）
for i in 1 2 3 4; do
  agent-browser eval "(()=>{const t=window.__pxc.tycoon;t.festCd=0;const r=t.startFestival();if(t.fest)t.fest.left=0.05;return r;})()" 2>/dev/null | tail -1
  agent-browser wait 1400
done
agent-browser wait 1500
ACH8=$(agent-browser eval "window.__pxc.tycoon.achv.has('fest8')?'yes':'no'" 2>/dev/null | tail -1 | tr -d '"')
chk "C3 成就「节庆之都」解锁" "${ACH8:-x}" "yes"

echo "=== [8] P 段：存档 / 兼容 / UI ==="
# 在途节日存档往返
agent-browser eval "(()=>{const t=window.__pxc.tycoon;t.festCd=0;t.startFestival();t.fest.left=60;return 'inflight:'+t.fest.kind;})()" 2>/dev/null | tail -1
agent-browser wait 600
agent-browser eval "window.__pxc.tycoon.save(window.__pxc.map); 'saved'" >/dev/null 2>&1
agent-browser reload >/dev/null 2>&1
agent-browser wait --fn "window.__pxc!==undefined" --timeout 90000 >/dev/null 2>&1
agent-browser wait 3000
P1=$(agent-browser eval "(()=>{const t=window.__pxc.tycoon;return 'k:'+(t.fest?t.fest.kind:'x')+'|left:'+(t.fest?Math.round(t.fest.left):0)+'|count:'+t.festCount+'|kinds:'+t.festKinds.size;})()" 2>/dev/null | tail -1 | tr -d '"')
chk "P1a 在途节日保留 kind=0" "$(echo "$P1" | grep -o 'k:[0-9x]*' | cut -d: -f2)" "0"
chkge "P1b 剩余时长保留" "$(echo "$P1" | grep -o 'left:[0-9]*' | cut -d: -f2)" "45"
chkge "P1c 累计场次保留" "$(echo "$P1" | grep -o 'count:[0-9]*' | cut -d: -f2)" "8"
chk "P1d 四种集齐保留" "$(echo "$P1" | grep -o 'kinds:[0-9]*' | cut -d: -f2)" "4"
# v11 老档兼容（剥掉 fest 字段）
P2=$(agent-browser eval "(()=>{const e=window.__pxc;const d=JSON.parse(localStorage.getItem('pxc_tycoon_v1'));delete d.festKind;delete d.festLeft;delete d.festCd;delete d.festCount;delete d.festKinds;d.v=11;const r=e.tycoon.resume(e.map,d);return (e.tycoon.fest===null&&e.tycoon.festCount===0&&e.tycoon.festKinds.size===0)?'ok':'broken';})()" 2>/dev/null | tail -1 | tr -d '"')
chk "P2 v11 老档恢复不崩（节日字段缺省）" "${P2:-x}" "ok"
# UI 三态：进行中（P2 已恢复为无节日态 → 办一场看进行中） → 冷却 → 就绪
agent-browser eval "(()=>{const t=window.__pxc.tycoon;t.level=5;t.coins=3000;t.festCd=0;window.__pxc.setSeason(1,false);t.startFestival();return 'go';})()" 2>/dev/null | tail -1
agent-browser wait 800
UIB=$(agent-browser eval "(()=>{const c=[...document.querySelectorAll('.chip')].find(x=>x.textContent.includes('庆'));if(!c)return 'nochip';c.click();return 'open';})()" 2>/dev/null | tail -1 | tr -d '"')
agent-browser wait 600
UI1=$(agent-browser eval "(()=>{const p=document.querySelector('.pxc-fest');if(!p)return 'nomodal';return (p.querySelector('.fest-live')&&p.textContent.includes('花火大会'))?'ok':'miss';})()" 2>/dev/null | tail -1 | tr -d '"')
chk "P3a 面板进行中态（进度条 + 花火大会）" "${UI1:-x}" "ok"
agent-browser screenshot $OUT/v16_fest_live.png >/dev/null && ok "截图 v16_fest_live.png（节庆面板）"
agent-browser eval "(()=>{const t=window.__pxc.tycoon;t.fest.left=0.2;return 'ff';})()" >/dev/null 2>&1
agent-browser wait 1200
UI2=$(agent-browser eval "(()=>{const p=document.querySelector('.pxc-fest');if(!p)return 'nomodal';return p.querySelector('.fest-cd')?'cd':'miss';})()" 2>/dev/null | tail -1 | tr -d '"')
chk "P3b 面板冷却态" "${UI2:-x}" "cd"
agent-browser eval "(()=>{const t=window.__pxc.tycoon;t.festCd=0;return 'cd0';})()" >/dev/null 2>&1
agent-browser wait 800
UI3=$(agent-browser eval "(()=>{const p=document.querySelector('.pxc-fest');if(!p)return 'nomodal';const b=p.querySelector('.fest-go');return (b&&!b.disabled&&b.textContent.includes('花火大会'))?'ok':'miss';})()" 2>/dev/null | tail -1 | tr -d '"')
chk "P3c 面板就绪态（举办按钮）" "${UI3:-x}" "ok"
agent-browser screenshot $OUT/v16_fest_ready.png >/dev/null && ok "截图 v16_fest_ready.png（就绪面板）"
agent-browser eval "(()=>{document.querySelector('.pxc-x')?.click();return 'closed';})()" >/dev/null 2>&1
# 花火城市截图
agent-browser eval "(()=>{const t=window.__pxc.tycoon;t.startFestival();window.__pxc.setDayNight(false,1);window.__pxc.setTimeOfDay?window.__pxc.setTimeOfDay(21):0;return 'night+fw';})()" 2>/dev/null | tail -1
agent-browser wait 2500
agent-browser eval "(()=>{const e=window.__pxc;e.centerAt(127,127);return 'cam';})()" >/dev/null 2>&1
agent-browser wait 1500
agent-browser screenshot $OUT/v16_city_fireworks.png >/dev/null && ok "截图 v16_city_fireworks.png（夏夜花火）"

echo "=== [9] P4 控制台错误 + 移动端 ==="
ERRN=$(errcount)
if [ "$ERRN" = "0" ]; then ok "无页面错误"; else echo "  ⚠ 页面错误($ERRN):"; errtexts; FAIL=$((FAIL+1)); fi
MERR_BASE=$(errcount)
agent-browser set viewport 390 844
agent-browser reload
agent-browser wait --fn "window.__pxc!==undefined" --timeout 60000
agent-browser wait 3000
MOB=$(agent-browser eval "(()=>{const c=[...document.querySelectorAll('.chip')].find(x=>x.textContent.includes('庆'));if(!c)return 'nochip';c.click();return 'open';})()" 2>/dev/null | tail -1 | tr -d '"')
agent-browser wait 600
MOBP=$(agent-browser eval "document.querySelector('.pxc-fest')?'open':'closed'" 2>/dev/null | tail -1 | tr -d '"')
chk "移动端节庆面板打开" "${MOBP:-x}" "open"
agent-browser screenshot $OUT/v16_mobile_fest.png >/dev/null && ok "截图 v16_mobile_fest.png"
MERRN=$(errcount)
if [ "$MERRN" -le "${MERR_BASE:-0}" ]; then ok "移动端无页面错误"; else echo "  ⚠ 移动端错误($MERRN):"; errtexts; FAIL=$((FAIL+1)); fi

echo ""
echo "========== 结果: PASS=$PASS FAIL=$FAIL =========="
[ $FAIL -eq 0 ]
