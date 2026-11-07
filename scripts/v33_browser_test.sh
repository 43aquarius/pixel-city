#!/bin/bash
# ============================================================
# v33_browser_test.sh — 市况荣枯「经济周期」端到端验证
# 增量 = tycoon.ts（CYC_* 常数 + cycPhaseOf 相位分类 + stepCycle 随机游走（均值回归+相位惯性）
#   + cycReclass 跨相位记账（段数/编年史/消息）+ cycShock 事件冲击 14 键
#   + 平准均输法令（金融枢纽解锁：商业/游客乘数斜率减半）+ 相位幸福 ±2/0/+1/+3
#   + 商业/游客/工业/迁入四乘数接入 + snap/view v33 字段 + 存档 cyc* 九字段
#   + 成就 荣枯兼济 / 穿越荣枯 + 任务 市况荣枯）
#   + citizens.ts（CitzCtx.cyc 相位心声：衰退抱怨 4 条 / 繁荣夸赞 4 条）
#   + PixelCity.tsx（财政报告「市况荣枯」区块：指数/乘数/荣枯账本 + 相位带状行情条）
# S 段：bun 直测（常数 / 相位分类器 / 相位表 / 平准法令 / 成就 / 任务）
# D 段：周期引擎流（繁荣跨相位 / 编年史 / 衰退 / 事件冲击 / 平准减半 / 相位心声 / 双成就）
# U 段：财政报告市况区块 / 行情条 / 编年史 / 政令厅 / 成就墙 / 截图
# R 段：存档往返 + 移动端 + 零错误
# ============================================================
set -u
B=http://localhost:3000
OUT=/home/z/my-project/scripts
PASS=0; FAIL=0
ok()   { echo "  ✓ $1"; PASS=$((PASS+1)); }
bad()  { echo "  ✗ $1"; FAIL=$((FAIL+1)); }
chk()  { if [ "$2" = "$3" ]; then ok "$1 ($2)"; else bad "$1 (got=$2 want=$3)"; fi; }
stripq() { tr -d '\\' | tr -d '"' | tr -d ' '; }
re() {
  local out="" k
  for k in 1 2 3 4 5; do
    # 仅首次连接时允许自开页面；中途 wait 失败不重开（重开会把游戏态洗掉）
    if [ -z "${RE_CONN:-}" ]; then
      if ! agent-browser wait --fn "window.__pxc!==undefined" --timeout 800 >/dev/null 2>&1; then
        agent-browser open http://localhost:3000 >/dev/null 2>&1
        agent-browser wait --fn "window.__pxc!==undefined" --timeout 90000 >/dev/null 2>&1
        agent-browser wait 2500 >/dev/null 2>&1
      fi
      RE_CONN=1
    fi
    out=$(agent-browser eval "$1" 2>&1 | awk 'NF{printf "%s",$0}END{print ""}' | tr -d '\\' | tr -d '"' | tr -d ' ')
    if [ -n "$out" ] && ! echo "$out" | grep -q "Evaluationerror\|Evaluation error"; then
      echo "$out"; return 0
    fi
    sleep 0.6
  done
  echo "$out"; return 1
}
errcount() { agent-browser errors --json 2>/dev/null | python3 -c "import json,sys
try: print(len(json.load(sys.stdin).get('data',{}).get('errors',[])))
except Exception: print(0)"; }

echo "=== [S] 纯函数直测（bun：常数 / 相位分类 / 相位表 / 平准法令 / 成就 / 任务） ==="
S=$(cd /home/z/my-project && bun -e '
import { CYC_MIN, CYC_MAX, CYC_STEP, CYC_COM_K, CYC_TOUR_K, CYC_IND_K, CYC_MIG_K, CYC_HAP,
  CYC_PHASES, cycPhaseOf, ORDS, ACHIEVEMENTS, QUESTS } from "./src/lib/pixelcity/tycoon.ts";
const st = ORDS.find(o => o.id === "stabil");
const a1 = ACHIEVEMENTS.find(a => a.id === "cycboth"), a2 = ACHIEVEMENTS.find(a => a.id === "cyc5");
const q = QUESTS[QUESTS.length - 1];
console.log(JSON.stringify({
  k: CYC_MIN + "," + CYC_MAX + "," + CYC_STEP + "," + CYC_COM_K + "," + CYC_TOUR_K + "," + CYC_IND_K + "," + CYC_MIG_K,
  hap: CYC_HAP.join(","),
  ph: [85,89,90,95,107,108,110,119,120,125].map(cycPhaseOf).join(""),
  names: CYC_PHASES.map(p => p.name).join(""),
  titles: CYC_PHASES.map(p => p.title).join(""),
  tones: CYC_PHASES.map(p => p.tone).join(""),
  ord: st.lv + "," + st.cost + "," + st.reqNote,
  ach: (a1 ? a1.goal : -1) + "," + (a2 ? a2.goal : -1) + "," + a1.name + "," + a2.name,
  quest: q.id + "," + q.goal,
}));' 2>&1 | tail -1 | stripq)
chk "S1 周期常数（60..140 · 步5 · 斜率 0.006/0.004/0.003/0.005）" "$(echo "$S" | grep -o 'k:60,140,5,0.006,0.004,0.003,0.005')" "k:60,140,5,0.006,0.004,0.003,0.005"
chk "S2 相位幸福（-2,0,1,3）" "$(echo "$S" | grep -o 'hap:-2,0,1,3')" "hap:-2,0,1,3"
chk "S3 相位分类器（85→衰 90/95/107→平 108/110/119→复 120/125→繁）" "$(echo "$S" | grep -o 'ph:0011122233')" "ph:0011122233"
chk "S4 相位名（衰退平稳复苏繁荣）" "$(echo "$S" | grep -o 'names:衰退平稳复苏繁荣')" "names:衰退平稳复苏繁荣"
chk "S5 纪事标题（市道萧条/市况回稳/百业复振/百业竞荣）" "$(echo "$S" | grep -o 'titles:市道萧条市况回稳百业复振百业竞荣')" "titles:市道萧条市况回稳百业复振百业竞荣"
chk "S6 纪事色调（bad/info/good/big）" "$(echo "$S" | grep -o 'tones:badinfogoodbig')" "tones:badinfogoodbig"
chk "S7 平准法令（LV6 · 2.0G/分 · 需金融枢纽）" "$(echo "$S" | grep -o 'ord:6,2,需研究「金融枢纽」')" "ord:6,2,需研究「金融枢纽」"
chk "S8 成就定义（荣枯兼济 1 / 穿越荣枯 5）" "$(echo "$S" | grep -o 'ach:1,5,荣枯兼济,穿越荣枯')" "ach:1,5,荣枯兼济,穿越荣枯"
chk "S9 任务压轴（cyc1 历一段荣枯）" "$(echo "$S" | grep -o 'quest:cyc1,1')" "quest:cyc1,1"

echo "=== [1] 桌面端 1440×900 新档开局 ==="
agent-browser close >/dev/null 2>&1; sleep 1
agent-browser set viewport 1440 900
agent-browser open $B
agent-browser storage local clear >/dev/null 2>&1
agent-browser reload
agent-browser wait --fn "window.__pxc!==undefined" --timeout 90000 && ok "引擎就绪" || bad "引擎超时"
agent-browser wait 3000
agent-browser eval "(()=>{const b=[...document.querySelectorAll('button')].filter(x=>(x.textContent||'').includes('跳过'));if(b.length)b[b.length-1].click();return 'tut';})()" >/dev/null 2>&1
# 冻结随机源：市民信/事件/生日不触发，景气指数步进停摆（cycShock/cycSet 仍可手动改）
agent-browser eval "(()=>{const t=window.__pxc.tycoon;const c=t.citz;c.mailTimer=99999;c.evTimer=99999;c.bdayTimer=99999;t.eventTimer=99999;t.cycTimer=99999;return 'frozen';})()" >/dev/null 2>&1

echo "=== [2] D 段：周期引擎流 ==="
# D1 基线：开埠平稳（100 · 平稳 · 零荣枯）
D1=$(re "JSON.stringify((()=>{const t=window.__pxc.tycoon;const s=t.snap;
return {idx:s.cycIdx,ph:s.cycPhase,seg:s.cycSegN,comK:s.cycComK,boom:t.cycBoomN,rec:t.cycRecN};})())")
chk "D1 开埠基线（指数100 · 平稳 · 荣枯0 · 商业×1）" "$(echo "$D1" | grep -o 'idx:100,ph:1,seg:0,comK:1,boom:0,rec:0')" "idx:100,ph:1,seg:0,comK:1,boom:0,rec:0"
# D2 繁荣：cycSet(130) → 相位3 · 繁荣段+1 · 四乘数按斜率换算 · 幸福+3（先 tick 重算快照再取值）
D2=$(re "JSON.stringify((()=>{const e=window.__pxc;const t=e.tycoon;t.cycSet(130);t.tick(0.05,e.map);const s=t.snap;
return {idx:s.cycIdx,ph:s.cycPhase,boom:t.cycBoomN,comK:Math.round(s.cycComK*100)/100,tourK:Math.round(s.cycTourK*100)/100,indK:Math.round(s.cycIndK*100)/100,migK:Math.round(s.cycMigK*100)/100,hap:s.cycHap};})())")
chk "D2 繁荣跨相位（130 · 段1 · ×1.18/1.12/1.09/1.15 · 幸福+3）" "$(echo "$D2" | grep -o 'idx:130,ph:3,boom:1,comK:1.18,tourK:1.12,indK:1.09,migK:1.15,hap:3')" "idx:130,ph:3,boom:1,comK:1.18,tourK:1.12,indK:1.09,migK:1.15,hap:3"
# D3 编年史「百业竞荣」入册
D3=$(re "JSON.stringify((()=>{const t=window.__pxc.tycoon;
return {big:t.chron.entries.some(x=>x.title==='百业竞荣'&&x.tone==='big')};})())")
chk "D3 编年史百业竞荣（纪元级入册）" "$(echo "$D3" | grep -o 'big:true')" "big:true"
# D4 衰退：gHours+10 绕开纪事间隔 → cycSet(75) → 相位0 · 衰退段+1 · ×0.85 · 幸福-2 · 市道萧条入册
D4=$(re "JSON.stringify((()=>{const e=window.__pxc;const t=e.tycoon;t.gHours+=10;t.cycSet(75);t.achvTimer=0.01;t.tick(0.05,e.map);const s=t.snap;
return {idx:s.cycIdx,ph:s.cycPhase,rec:t.cycRecN,comK:Math.round(s.cycComK*100)/100,hap:s.cycHap,
bad:t.chron.entries.some(x=>x.title==='市道萧条'&&x.tone==='bad'),ach:t.achv.has('cycboth')};})())")
chk "D4 衰退跨相位（75 · 段1 · ×0.85 · 幸福-2 · 纪事+荣枯兼济成就）" "$(echo "$D4" | grep -o 'idx:75,ph:0,rec:1,comK:0.85,hap:-2,bad:true,ach:true')" "idx:75,ph:0,rec:1,comK:0.85,hap:-2,bad:true,ach:true"
# D5 事件冲击：贸易摩擦 → 景气即时 -6（75→69 精确；冻结步进下无噪声；地震副作用重故选纯事件）
D5=$(re "JSON.stringify((()=>{const e=window.__pxc;const t=e.tycoon;const ok=t.forceEvent('tradewar',e.map);
return {ok,idx:t.cycIdx,ph:t.cycPhase};})())")
chk "D5 贸易摩擦冲击市况（-6 精确 → 69 · 仍衰退）" "$(echo "$D5" | grep -o 'ok:true,idx:69,ph:0')" "ok:true,idx:69,ph:0"
# D6 平准均输：金融枢纽 + LV6 → 颁布后商业/游客乘数斜率减半（0.802→0.901 / 0.868→0.934）
#   （每次 toggle 后先 tick 重算快照再读数，避免拿到上一帧的陈旧 snap）
D6=$(re "JSON.stringify((()=>{const e=window.__pxc;const t=e.tycoon;t.techs.add('finhub');t.level=6;
t.tick(0.05,e.map);const before=Math.round(t.snap.cycComK*1000)/1000;
const r1=t.toggleOrd('stabil');t.tick(0.05,e.map);
const dampK=Math.round(t.snap.cycComK*1000)/1000, dampT=Math.round(t.snap.cycTourK*1000)/1000;
const r2=t.toggleOrd('stabil');t.tick(0.05,e.map);
const offK=Math.round(t.snap.cycComK*1000)/1000;
return {r1,r2,before,dampK,dampT,offK};})())")
chk "D6 平准减半（0.814→0.907 / 游客 0.938 · 废止复原 0.814）" "$(echo "$D6" | grep -o 'r1:on,r2:off,before:0.814,dampK:0.907,dampT:0.938,offK:0.814')" "r1:on,r2:off,before:0.814,dampK:0.907,dampT:0.938,offK:0.814"
# D7 相位心声：衰退抱怨池 / 繁荣夸赞池（假市民占位取词后即撤，不污染存档）
D7=$(re "JSON.stringify((()=>{const t=window.__pxc.tycoon;
t.citz.roster.push({name:'测试市民',mood:60});
const base={pop:100,happiness:60,taxRate:9,season:1,famine:0,events:[],fest:-1,smog:0,dark:0,waste:0,eduOut:0,crime:0,fireOut:0};
const rec=[];for(let i=0;i<16;i++){const v=t.citz.voice({...base,cyc:0});if(v)rec.push(v.text);}
const boom=[];for(let i=0;i<16;i++){const v=t.citz.voice({...base,cyc:3});if(v)boom.push(v.text);}
t.citz.roster.pop();
const isRec=rec.some(q=>/市道|铺子|游客少|隔壁城/.test(q));
const isBoom=boom.some(q=>/排队|码头|生面孔|行情/.test(q));
const n=t.citz.roster.length;
return {rec:isRec,boom:isBoom,n};})())")
chk "D7 相位心声（衰退抱怨 · 繁荣夸赞 · 假市民已撤）" "$(echo "$D7" | grep -o 'rec:true,boom:true,n:0')" "rec:true,boom:true,n:0"

echo "=== [3] U 段：财政报告市况区块 / 行情条 / 编年史 / 政令厅 / 成就墙 ==="
agent-browser eval "(()=>{const b=[...document.querySelectorAll('button')].find(x=>(x.getAttribute('title')||'').includes('财政报告'));if(b)b.click();return 'f';})()" >/dev/null 2>&1
agent-browser wait 900
U1=$(re "JSON.stringify((()=>{
  const txt=document.querySelector('.pxc-fiscal')?.textContent||'';
  const bar=document.querySelector('.pxc-fiscal .pxc-cycbar');
  const bands=bar?bar.querySelectorAll('i').length:0;
  const mark=!!document.querySelector('.pxc-fiscal .pxc-cycbar .mark');
  const row=document.querySelector('.pxc-fiscal .pxc-cycrow');
  return {sec:txt.includes('市况荣枯'),idx:txt.includes('景气指数'),rec:txt.includes('衰退'),
    k:txt.includes('商业 ×0.81'),bands,mark,phases:row?['衰退','平稳','复苏','繁荣'].every(p=>row.textContent.includes(p)):false};})())")
chk "U1 财政报告市况荣枯（区块+指数+衰退相位+×0.81乘数+行情条四带+游标）" "$(echo "$U1" | grep -o 'sec:true,idx:true,rec:true,k:true,bands:4,mark:true,phases:true')" "sec:true,idx:true,rec:true,k:true,bands:4,mark:true,phases:true"
agent-browser screenshot $OUT/v33_fiscal.png >/dev/null && ok "截图 v33_fiscal.png（桌面 · 财政报告市况荣枯）"
agent-browser eval "(()=>{document.querySelector('.pxc-fiscal .pxc-x')?.click();return 'x';})()" >/dev/null 2>&1
agent-browser eval "(()=>{const b=[...document.querySelectorAll('button.chip')].find(x=>(x.getAttribute('title')||'').includes('编年史'));if(b)b.click();return 'c';})()" >/dev/null 2>&1
agent-browser wait 700
U2=$(re "JSON.stringify((()=>{
  const txt=document.querySelector('.pxc-chron')?.textContent||'';
  return {a:txt.includes('百业竞荣'),b:txt.includes('市道萧条')};})())")
chk "U2 编年史双纪事（百业竞荣 · 市道萧条）" "$(echo "$U2" | grep -o 'a:true,b:true')" "a:true,b:true"
agent-browser eval "(()=>{document.querySelector('.pxc-chron .pxc-x')?.click();return 'x';})()" >/dev/null 2>&1
agent-browser wait 400
agent-browser eval "(()=>{const b=[...document.querySelectorAll('button')].find(x=>(x.getAttribute('title')||'').includes('财政报告'));if(b)b.click();return 'f';})()" >/dev/null 2>&1
agent-browser wait 900
# 点击「市政法令厅」按钮（子串须为「法令厅」——按钮名是市政+法令厅；找不到即抛错借 re() 重试）
CLK=$(re "(()=>{const b=[...document.querySelectorAll('.pxc-fiscal button')].find(x=>(x.textContent||'').includes('法令厅'));if(!b)throw new Error('nobtn');b.click();return 'clicked';})()")
agent-browser wait 900
U3=$(re "JSON.stringify((()=>{
  const m=document.querySelector('.pxc-policy');
  const txt=m?m.textContent||'':'';
  return {st:txt.includes('平准均输'),desc:txt.includes('熨平市况'),open:!!m};})())")
echo "  · U3 点击：$CLK"
chk "U3 政令厅平准均输在列（描述在册 —— D6 已加金融枢纽故锁标不显）" "$(echo "$U3" | grep -o 'st:true,desc:true,open:true')" "st:true,desc:true,open:true"
agent-browser eval "(()=>{document.querySelector('.pxc-policy .pxc-x')?.click();return 'x';})()" >/dev/null 2>&1
agent-browser eval "(()=>{const b=[...document.querySelectorAll('button.chip')].find(x=>(x.getAttribute('title')||'').includes('城市志'));b.click();return 'd';})()" >/dev/null 2>&1
agent-browser wait 700
U4=$(re "JSON.stringify((()=>{
  const txt=document.querySelector('.pxc-modal')?.textContent||'';
  return {a1:txt.includes('荣枯兼济'),a2:txt.includes('穿越荣枯')};})())")
chk "U4 成就墙双卡在册" "$(echo "$U4" | grep -o 'a1:true,a2:true')" "a1:true,a2:true"
agent-browser eval "(()=>{document.querySelector('.pxc-modal .pxc-x')?.click();return 'x';})()" >/dev/null 2>&1

echo "=== [4] R 段：存档往返 + 移动端 + 零错误 ==="
re "JSON.stringify((()=>{window.__pxc.tycoon.save(window.__pxc.map);return 'saved';})())" >/dev/null
agent-browser reload >/dev/null 2>&1
agent-browser wait --fn "window.__pxc!==undefined" --timeout 90000 >/dev/null 2>&1
agent-browser wait 3000
agent-browser eval "(()=>{const b=[...document.querySelectorAll('button')].filter(x=>(x.textContent||'').includes('跳过'));if(b.length)b[b.length-1].click();return 'tut';})()" >/dev/null 2>&1
agent-browser eval "(()=>{const t=window.__pxc.tycoon;t.cycTimer=99999;return 'f';})()" >/dev/null 2>&1
# R1 往返：荣枯档恢复（指数 60..80 衰退区 · 双段账本 · 双纪事不回退）
R1=$(re "JSON.stringify((()=>{const t=window.__pxc.tycoon;const s=t.snap;
const inRange=s.cycIdx>=60&&s.cycIdx<=80;
return {inRange,ph:s.cycPhase,boom:t.cycBoomN,rec:t.cycRecN,
a:t.chron.entries.some(x=>x.title==='百业竞荣'),b:t.chron.entries.some(x=>x.title==='市道萧条')};})())")
chk "R1 往返（衰退区指数 · 账本 1+1 · 双纪事保留）" "$(echo "$R1" | grep -o 'inRange:true,ph:0,boom:1,rec:1,a:true,b:true')" "inRange:true,ph:0,boom:1,rec:1,a:true,b:true"
ERR=$(errcount)
chk "R2 控制台零错误" "${ERR:-x}" "0"
# R3 移动端财政报告市况区块
agent-browser set viewport 390 844
agent-browser wait 1200
agent-browser eval "(()=>{const b=[...document.querySelectorAll('button')].find(x=>(x.getAttribute('title')||'').includes('财政报告'));if(b)b.click();return 'f';})()" >/dev/null 2>&1
agent-browser wait 700
R3=$(re "JSON.stringify((()=>{
  const m=document.querySelector('.pxc-fiscal');
  const bar=m?.querySelector('.pxc-cycbar');
  return {sec:m?(m.textContent||'').includes('市况荣枯'):false,band:!!bar,w:m?m.getBoundingClientRect().width<=window.innerWidth:false};})())")
chk "R3 移动端市况区块（内容在册 · 行情条在册 · 不溢出）" "$(echo "$R3" | grep -o 'sec:true,band:true,w:true')" "sec:true,band:true,w:true"
agent-browser screenshot $OUT/v33_mobile.png >/dev/null && ok "截图 v33_mobile.png（移动端 · 财政报告）"
agent-browser close >/dev/null 2>&1

echo ""
echo "=========================================="
echo "v33 结果：$PASS 通过 / $FAIL 失败"
[ "$FAIL" -eq 0 ] && echo "全部通过 ✅" || echo "存在失败 ❌"
exit $FAIL
