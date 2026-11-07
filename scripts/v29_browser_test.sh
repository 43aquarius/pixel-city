#!/bin/bash
# ============================================================
# v29_browser_test.sh — 市长公署「朱批公文」端到端验证
# 增量 = decisions.ts（DocDef 公文池 15 份 / DocCtx 条件上下文 /
#   nextMorningH 明晨八点 / eligibleDocs·pickDoc 抽签 / fxSummary 概算）
#   + tycoon.ts（docPending/docNext/docN/docUsed/docLog/docHap 状态 +
#   arriveDoc 送抵 + decideDoc 朱批落笔编年史「政令」卷 + 幸福度 docHap 加成 +
#   序列化全套 + 旧档 nextMorningH 兜底）
#   + PixelCity 顶栏「批」芯片（待批红点）+ 市长公署模态（公文纸卡 +
#   准/驳/缓/辞 印章选项 + 府库不足置灰 + 盖章动画 + 朱批存档）
# S 段：bun 直测纯函数（明晨八点 / 条件筛选 / 用尽重抽 / 概算文案 / 池不变量）
# D 段：真实公文叙事流（首日清晨送抵 / 悬而不批不追送 / 府库不足批不动 /
#   批注落笔政令卷 / 批完约明晨 / 用尽重开一轮 / 条件解锁 / 冬赈平粜 / 民心衰减）
# U 段：公署 UI（红点芯片 → 模态 → 置灰 → 盖章 → 存档 → 编年史联动 → 移动端）
# R 段：存档往返（待批公文回案头 / 已批数不回退 / 读档后可批 / 民心增益随档）+ 双端截图
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
  for k in 1 2 3 4; do
    if ! agent-browser wait --fn "window.__pxc!==undefined" --timeout 800 >/dev/null 2>&1; then
      agent-browser open http://localhost:3000 >/dev/null 2>&1
      agent-browser wait --fn "window.__pxc!==undefined" --timeout 90000 >/dev/null 2>&1
      agent-browser wait 2500 >/dev/null 2>&1
    fi
    out=$(agent-browser eval "$1" 2>&1 | awk 'NF{printf "%s",$0}END{print ""}' | tr -d '\\' | tr -d '"' | tr -d ' ')
    if [ -n "$out" ] && ! echo "$out" | grep -q "Evaluationerror\|Evaluation error"; then
      echo "$out"; return 0
    fi
    sleep 0.4
  done
  echo "$out"; return 1
}
errcount() { agent-browser errors --json 2>/dev/null | python3 -c "import json,sys
try: print(len(json.load(sys.stdin).get('data',{}).get('errors',[])))
except Exception: print(0)"; }

echo "=== [S] 纯函数直测（bun：nextMorningH / eligibleDocs / pickDoc / fxSummary） ==="
S=$(cd /home/z/my-project && bun -e '
import { DOCS, nextMorningH, eligibleDocs, pickDoc, fxSummary, type DocCtx } from "./src/lib/pixelcity/decisions.ts";
const c0: DocCtx = { pop: 0, cap: 0, coins: 300, era: 0, season: 1, buildings: 0, shops: 0, parks: 0,
  goods: 0, food: 30, powerDem: 0, safetyIdx: 100, healthIdx: 90, festCount: 0, floods: 0 };
const c60: DocCtx = { ...c0, pop: 60, shops: 4 };
const ids = (xs: { id: string }[]) => xs.map(x => x.id).sort().join(",");
const allBut = (keep: string) => DOCS.map(d => d.id).filter(i => i !== keep);
const seals = new Set(["准", "驳", "缓", "辞"]);
console.log(JSON.stringify({
  m8: nextMorningH(8), m12: nextMorningH(12), m36: nextMorningH(36), m79: nextMorningH(7.9),
  e0: ids(eligibleDocs(DOCS, [], c0)),
  e60: ids(eligibleDocs(DOCS, [], c60)),
  eUsed: ids(eligibleDocs(DOCS, ["mill"], c60)),
  one: pickDoc(DOCS, allBut("guild"), c60)?.id,
  fresh: pickDoc(DOCS, DOCS.map(d => d.id), c0)?.id,
  none: pickDoc(DOCS.filter(d => d.id === "guild" || d.id === "school"), [], c0)?.id ?? "null",
  fx: fxSummary({ coins: -220, hap: 3 }),
  fx2: fxSummary({ pop: 12, food: -60 }),
  fx3: fxSummary({}),
  n: DOCS.length,
  uniq: new Set(DOCS.map(d => d.id)).size,
  t4: DOCS.every(d => d.title.length === 4),
  opts: DOCS.every(d => d.opts.length >= 2 && d.opts.length <= 3),
  seals: DOCS.every(d => d.opts.every(o => seals.has(o.seal))),
  cost: DOCS.some(d => d.opts.some(o => (o.fx.coins ?? 0) < 0)),
}));' 2>&1 | tail -1 | stripq)
chk "S1 明晨八点（批完即约：8→32 / 12→32 / 36→56 / 7.9→8）" "$(echo "$S" | grep -o 'm8:32,m12:32,m36:56,m79:8')" "m8:32,m12:32,m36:56,m79:8"
chk "S2 荒年只收水闸（pop0 → mill）" "$(echo "$S" | grep -o 'e0:mill')" "e0:mill"
chk "S3 条件解锁（pop60+shops4 → guild,press? no:school + mill）" "$(echo "$S" | grep -o 'e60:guild,mill,school')" "e60:guild,mill,school"
chk "S4 用过不再来（used=[mill] → 剔除）" "$(echo "$S" | grep -o 'eUsed:guild,school')" "eUsed:guild,school"
chk "S5 唯一合格者必中（all-but-guild → guild）" "$(echo "$S" | grep -o 'one:guild')" "one:guild"
chk "S6 全池用尽重开一轮（used=all → mill 复来）" "$(echo "$S" | grep -o 'fresh:mill')" "fresh:mill"
chk "S7 无人呈报返回 null" "$(echo "$S" | grep -o 'none:null')" "none:null"
chk "S8 概算文案（府库-220G·民心+3）" "$(echo "$S" | grep -o 'fx:府库-220G·民心+3')" "fx:府库-220G·民心+3"
chk "S9 概算文案（人口+12·粮仓-60 / 无关痛痒）" "$(echo "$S" | grep -o 'fx2:人口+12·粮仓-60,fx3:无关痛痒')" "fx2:人口+12·粮仓-60,fx3:无关痛痒"
chk "S10 池不变量（15 份 / id 唯一 / 四字标题 / 2-3 选项 / 印章合法 / 有付费项）" \
  "$(echo "$S" | grep -o 'n:15,uniq:15,t4:true,opts:true,seals:true,cost:true')" "n:15,uniq:15,t4:true,opts:true,seals:true,cost:true"

echo "=== [1] 桌面端 1440×900 新档开局 ==="
agent-browser close >/dev/null 2>&1; sleep 1
agent-browser set viewport 1440 900
agent-browser open $B
agent-browser storage local clear >/dev/null 2>&1
agent-browser reload
agent-browser wait --fn "window.__pxc!==undefined" --timeout 90000 && ok "引擎就绪" || bad "引擎超时"
agent-browser wait 3000
agent-browser eval "(()=>{const b=[...document.querySelectorAll('button')].filter(x=>(x.textContent||'').includes('跳过'));if(b.length)b[b.length-1].click();return 'tut';})()" >/dev/null 2>&1

echo "=== [2] D 段：真实公文叙事流 ==="
D1=$(re "JSON.stringify((()=>{const t=window.__pxc.tycoon;
return {next:t.docNext,p:t.docPending===null,n:t.docN,used:t.docUsed.length,
  log:t.docLog.length,hap:t.docHap,left:t.docHapLeft};})())")
chk "D1 新档公署状态（首份在第 8 游戏时清晨）" "$(echo "$D1" | grep -o 'next:8,p:true,n:0,used:0,log:0,hap:0,left:0')" "next:8,p:true,n:0,used:0,log:0,hap:0,left:0"
# D2 首日清晨送抵（荒年只收水闸请修 —— pop0 唯一合格公文）
D2=$(re "JSON.stringify((()=>{const e=window.__pxc;const t=e.tycoon;
const ALL=['mill','guild','refugee','school','patrol','plague','subsidy','lamp','winter','templefair','levee','press','power','parkname','returnee'];
t.docUsed=ALL.filter(i=>i!=='mill');   // 钉池：空城 healthIdx<85 时 plague 亦合格，随机抽取会翻车 → 钉死唯一合格 mill
t.gHours=7.9;t.tick(0.05,e.map);
const mid=t.docPending===null;
t.gHours=8;t.tick(0.05,e.map);
return {mid,id:t.docPending?t.docPending.id:'none',h:t.docPending?t.docPending.h:-1,
  used:t.docUsed.join(','),usedN:t.docUsed.length,next:t.docNext};})())")
chk "D2a 清晨八点前不送（7.9 时案头空）" "$(echo "$D2" | grep -o 'mid:true')" "mid:true"
chk "D2b 八点整公文送抵（水闸请修 · h=8）" "$(echo "$D2" | grep -o 'id:mill,h:8')" "id:mill,h:8"
chk "D2c 送抵即占用（used=[mill] · 批完才约明晨 next 仍 8）" "$(echo "$D2" | grep -o 'usedN:15,next:8')" "usedN:15,next:8"
# D3 悬而未批：不追送（跳到 40 时仍只有这一份）
D3=$(re "JSON.stringify((()=>{const e=window.__pxc;const t=e.tycoon;
t.gHours=40;t.tick(0.05,e.map);
return {id:t.docPending?t.docPending.id:'none',used:t.docUsed.length};})())")
chk "D3 悬而未批不追送（40 时仍 mill · used 仍 15）" "$(echo "$D3" | grep -o 'id:mill,used:15')" "id:mill,used:15"
# D4 朱批守门与落笔（府库不足批不动 → 拨银后批成 → 全套效果）
D4=$(re "JSON.stringify((()=>{const e=window.__pxc;const t=e.tycoon;
t.coins=50;
const poor=t.decideDoc(0);
const stillP=t.docPending!==null;
t.coins=300;
const ok=t.decideDoc(0);
return {poor,stillP,ok,coins:Math.round(t.coins),hap:t.docHap,left:t.docHapLeft,
  n:t.docN,p:t.docPending===null,next:t.docNext,
  log0:t.docLog[0]?t.docLog[0].id+':'+t.docLog[0].title+':'+t.docLog[0].seal+':'+t.docLog[0].day:null};})())")
chk "D4a 府库不足批不动（50G < 220G）" "$(echo "$D4" | grep -o 'poor:false,stillP:true')" "poor:false,stillP:true"
chk "D4b 拨银后批成（300-220=80G）" "$(echo "$D4" | grep -o 'ok:true,coins:80')" "ok:true,coins:80"
chk "D4c 民心增益生效（+3 · 持续 120 秒）" "$(echo "$D4" | grep -o 'hap:3,left:120')" "hap:3,left:120"
chk "D4d 批完状态（n=1 · 案头清空 · h=40 批 → 明晨 56 时再送）" "$(echo "$D4" | grep -o 'n:1,p:true,next:56')" "n:1,p:true,next:56"
chk "D4e 存档首条（mill:水闸请修:准:第2天）" "$(echo "$D4" | grep -o 'log0:mill:水闸请修:准:2')" "log0:mill:水闸请修:准:2"
# D5 编年史「政令」卷落笔
D5=$(re "JSON.stringify((()=>{const t=window.__pxc.tycoon;
const r=[...t.chron.entries].reverse().find(x=>x.cat==='ord');
return {cat:r.cat,tone:r.tone,icon:r.icon,title:r.title,h:Math.round(r.h),
  from:r.text.includes('城东水磨坊主呈报'),zhu:r.text.includes('市长朱批「准：拨银修闸」'),
  out:r.text.includes('汛水过闸安然无恙')};})())")
chk "D5 落笔政令卷（ord/good/drop/水闸请修/h=40）" "$(echo "$D5" | grep -o 'cat:ord,tone:good,icon:drop,title:水闸请修,h:40')" "cat:ord,tone:good,icon:drop,title:水闸请修,h:40"
chk "D5b 纪事行文（呈报 + 朱批 + 后果三段俱全）" "$(echo "$D5" | grep -o 'from:true,zhu:true,out:true')" "from:true,zhu:true,out:true"
# D6 次日清晨（D4 在 h=40 批 → docNext=56）：钉池唯一合格 → mill 二度呈报
D6=$(re "JSON.stringify((()=>{const e=window.__pxc;const t=e.tycoon;
const ALL=['mill','guild','refugee','school','patrol','plague','subsidy','lamp','winter','templefair','levee','press','power','parkname','returnee'];
t.docUsed=ALL.filter(i=>i!=='mill');
t.gHours=55.9;t.tick(0.05,e.map);
const mid=t.docPending===null;
t.gHours=56;t.tick(0.05,e.map);
return {mid,id:t.docPending?t.docPending.id:'none',used:t.docUsed.length};})())")
chk "D6a 明晨前不送（55.9 时案头空）" "$(echo "$D6" | grep -o 'mid:true')" "mid:true"
chk "D6b 明晨复来（钉池唯一合格 → mill 二度呈报）" "$(echo "$D6" | grep -o 'id:mill,used:15')" "id:mill,used:15"
# D7 条件解锁：批掉案头 → 人口 60 → 学堂山长上门（used 钉死其余，唯一合格必中）
D7=$(re "JSON.stringify((()=>{const e=window.__pxc;const t=e.tycoon;
t.decideDoc(1);   // 缓批水闸（-20G）
const ALL=['mill','guild','refugee','school','patrol','plague','subsidy','lamp','winter','templefair','levee','press','power','parkname','returnee'];
t.docUsed=ALL.filter(i=>i!=='school');
t.pop=60;t.docPending=null;t.docNext=t.gHours;
t.arriveDoc(t.snap);   // 直接送抵（绕过 tick 的经济重算 —— pop 会被无房空城立即打回，学堂 req 就永远不满足）
const id=t.docPending?t.docPending.id:'none';
const ok2=t.decideDoc(1);   // 缓：暂借祠堂（无靡费 · info）
const r=[...t.chron.entries].reverse().find(x=>x.cat==='ord');
return {id,ok2,tone:r.tone,zhu:r.text.includes('市长朱批「缓：暂借祠堂」'),
  out:r.text.includes('香案还是往边上挪了挪')};})())")
chk "D7a 人口六十学堂上门（唯一合格必中）" "$(echo "$D7" | grep -o 'id:school')" "id:school"
chk "D7b 缓批入政令卷（info · 暂借祠堂 · 族老挪香案）" "$(echo "$D7" | grep -o 'ok2:true,tone:info,zhu:true,out:true')" "ok2:true,tone:info,zhu:true,out:true"
# D8 冬赈平粜（season=3 钉死唯一合格）+ 多重效果
D8=$(re "JSON.stringify((()=>{const e=window.__pxc;const t=e.tycoon;
const ALL=['mill','guild','refugee','school','patrol','plague','subsidy','lamp','winter','templefair','levee','press','power','parkname','returnee'];
t.docUsed=ALL.filter(i=>i!=='winter');
t.season=3;t.pop=0;t.food=200;t.coins=100;t.docPending=null;t.docNext=t.gHours;t.tick(0.05,e.map);   // pop=0 防饥荒；200 会被仓容钳制到空城上限 60
const food0=Math.round(t.food);
const id=t.docPending?t.docPending.id:'none';
const ok=t.decideDoc(0);   // 准：开仓平粜（粮-100 · 库+60 · 民+5）
const r=[...t.chron.entries].reverse().find(x=>x.cat==='ord');
return {id,ok,food0,food:Math.round(t.food),coins:Math.round(t.coins),hap:t.docHap,
  tone:r.tone,snow:r.text.includes('大雪封路')};})())")
chk "D8a 大雪封路冬赈上门" "$(echo "$D8" | grep -o 'id:winter,ok:true')" "id:winter,ok:true"
chk "D8b 平粜三重效果（粮 200→钳制仓容 60→尽卖 0 · 库 100→160 · 民+5）" "$(echo "$D8" | grep -o 'food0:60,food:0,coins:160,hap:5')" "food0:60,food:0,coins:160,hap:5"
chk "D8c 冬赈行文（good · 大雪封路开篇）" "$(echo "$D8" | grep -o 'tone:good,snow:true')" "tone:good,snow:true"
# D9 民心增益随时间衰减归零（冬赈 hapSec=150 → 需 160 秒才归零）
D9=$(re "JSON.stringify((()=>{const e=window.__pxc;const t=e.tycoon;
t.tick(160,e.map);
return {hap:t.docHap,left:t.docHapLeft};})())")
chk "D9 民心增益衰减归零（160 秒后 · hapSec=150）" "$(echo "$D9" | grep -o 'hap:0,left:0')" "hap:0,left:0"

echo "=== [3] U 段：公署 UI ==="
# U1 顶栏「批」芯片
U1=$(re "JSON.stringify((()=>{const b=[...document.querySelectorAll('button.chip')].find(x=>(x.getAttribute('title')||'').includes('市长公署'));
return {has:!!b,i:b?b.querySelector('i')?.textContent:'',n:b?b.querySelector('b')?.textContent:''};})())")
chk "U1 顶栏「批」芯片（勋章图标 · 已批计数）" "$(echo "$U1" | grep -o 'has:true,i:批')" "has:true,i:批"
# U2 送抵后红点亮起（钉死唯一合格 → mill）
agent-browser eval "(()=>{const e=window.__pxc;const t=e.tycoon;
if(t.docPending)t.decideDoc(1);
const ALL=['mill','guild','refugee','school','patrol','plague','subsidy','lamp','winter','templefair','levee','press','power','parkname','returnee'];
t.docUsed=ALL.filter(i=>i!=='mill');t.coins=500;t.docPending=null;t.docNext=t.gHours;t.tick(0.05,e.map);
return 'arrive';})()" >/dev/null 2>&1
agent-browser wait 1300
U2=$(re "JSON.stringify((()=>{const b=[...document.querySelectorAll('button.chip')].find(x=>(x.getAttribute('title')||'').includes('市长公署'));
return {cls:b.className.includes('has'),dot:b.querySelector('.chip-dot')?.textContent};})())")
chk "U2 待批红点（has · 待）" "$(echo "$U2" | grep -o 'cls:true,dot:待')" "cls:true,dot:待"
# U3 打开模态：公文纸卡 + 两道朱批
agent-browser eval "(()=>{const b=[...document.querySelectorAll('button.chip')].find(x=>(x.getAttribute('title')||'').includes('市长公署'));b.click();return 'open';})()" >/dev/null 2>&1
agent-browser wait 600
U3=$(re "JSON.stringify((()=>{
  const m=document.querySelector('.pxc-gov');
  const doc=document.querySelector('.gov-doc');
  const opts=[...document.querySelectorAll('.gd-opt')];
  const seals=opts.map(o=>o.querySelector('.gd-seal')?.textContent).join('/');
  const wait=document.querySelector('.gd-wait')?.textContent;
  const body=document.querySelector('.gd-body')?.textContent.length;
  return {m:!!m,head:m?.querySelector('header')?.textContent.replace(/\s/g,'').includes('市长公署'),
    doc:doc?.getAttribute('data-doc'),n:opts.length,seals,wait,body:(body||0)>10};})())")
chk "U3a 模态挂载（市长公署 · 公文卡 mill）" "$(echo "$U3" | grep -o 'm:true,head:true,doc:mill')" "m:true,head:true,doc:mill"
chk "U3b 两道朱批（准/缓 印章 · 待批角标 · 正文非空）" "$(echo "$U3" | grep -o 'n:2,seals:准/缓,wait:待批,body:true')" "n:2,seals:准/缓,wait:待批,body:true"
# U4 府库不足置灰（100G < 220G → 第一道下不去笔；第二道 20G 仍可批）
agent-browser eval "(()=>{window.__pxc.tycoon.coins=100;return 'poor';})()" >/dev/null 2>&1
agent-browser wait 1100
U4=$(re "JSON.stringify((()=>{
  const opts=[...document.querySelectorAll('.gd-opt')];
  return {o0:opts[0].disabled,n0:opts[0].querySelector('.gd-note')?.textContent,
    o1:opts[1].disabled};})())")
chk "U4 府库不足置灰（第一道灰 + 提示 · 第二道仍可批）" "$(echo "$U4" | grep -o 'o0:true,n0:府库不足,o1:false')" "o0:true,n0:府库不足,o1:false"
# U5 拨银朱批：盖章动画 → 案头清简 → 存档入列 → 红点熄灭
agent-browser eval "(()=>{window.__pxc.tycoon.coins=500;return 'rich';})()" >/dev/null 2>&1
agent-browser wait 1100
agent-browser eval "(()=>{document.querySelectorAll('.gd-opt')[0].click();return 'stamp';})()" >/dev/null 2>&1
agent-browser wait 350
U5a=$(re "JSON.stringify((()=>{const s=document.querySelector('.gov-stamp');
return {seal:s?.getAttribute('data-seal'),txt:s?.textContent};})())")
chk "U5a 盖章动画（朱印「准」砸落）" "$(echo "$U5a" | grep -o 'seal:准,txt:准')" "seal:准,txt:准"
agent-browser wait 1900
U5b=$(re "JSON.stringify((()=>{
  const g=window.__pxc.tycoon;
  const chip=[...document.querySelectorAll('button.chip')].find(x=>(x.getAttribute('title')||'').includes('市长公署'));
  const empty=document.querySelector('.gov-empty');
  const rows=document.querySelectorAll('.gl-row');
  const stamp=document.querySelector('.gov-stamp');
  return {stampGone:stamp===null,empty:empty?.textContent.includes('案头清简'),
    nextDay:empty?.textContent.includes('清晨'),
    rows:rows.length,engN:g.docN,chipHas:chip.className.includes('has')};})())")
chk "U5b 印章收起（动画完毕）" "$(echo "$U5b" | grep -o 'stampGone:true')" "stampGone:true"
chk "U5c 案头清简（提示明晨再送）" "$(echo "$U5b" | grep -o 'empty:true,nextDay:true')" "empty:true,nextDay:true"
chk "U5d 朱批存档与引擎一致（rows=docN 截 12）" "$(echo "$U5b" | grep -o "rows:$(echo "$U5b" | grep -o 'engN:[0-9]*' | cut -d: -f2)")" "rows:$(echo "$U5b" | grep -o 'engN:[0-9]*' | cut -d: -f2)"
chk "U5e 红点熄灭" "$(echo "$U5b" | grep -o 'chipHas:false')" "chipHas:false"
# U6 编年史联动：政令筛选芯片计数 + 公文在列
agent-browser eval "(()=>{document.querySelector('.pxc-gov .pxc-x').click();return 'x';})()" >/dev/null 2>&1
agent-browser wait 400
agent-browser eval "(()=>{const b=[...document.querySelectorAll('button.chip')].filter(x=>(x.getAttribute('title')||'').includes('编年史'));b[0].click();return 'c';})()" >/dev/null 2>&1
agent-browser wait 600
U6=$(re "JSON.stringify((()=>{
  const chip=[...document.querySelectorAll('.cf-chip')].find(c=>c.textContent.includes('政令'));
  chip.click();
  const es=[...document.querySelectorAll('.cl-e')];
  return {cnt:chip.textContent,hasMill:es.some(e=>e.textContent.includes('水闸请修')),
    hasZhu:es.some(e=>e.textContent.includes('市长朱批'))};})())")
agent-browser eval "(()=>{document.querySelector('.pxc-chron .pxc-x')?.click();return 'x';})()" >/dev/null 2>&1
chk "U6 编年史「政令」卷在列（朱批全文可检索）" "$(echo "$U6" | grep -o 'hasMill:true,hasZhu:true')" "hasMill:true,hasZhu:true"
echo "  · U6 政令芯片：$(echo "$U6" | grep -o 'cnt:[^,]*')"

echo "=== [4] R 段：存档往返 + 双端截图 ==="
# R0 制造待批状态并存档
agent-browser eval "(()=>{const e=window.__pxc;const t=e.tycoon;
const ALL=['mill','guild','refugee','school','patrol','plague','subsidy','lamp','winter','templefair','levee','press','power','parkname','returnee'];
t.docUsed=ALL.filter(i=>i!=='mill');t.coins=500;t.docPending=null;t.docNext=t.gHours;t.tick(0.05,e.map);
return 'arrive';})()" >/dev/null 2>&1
agent-browser wait 600
R0=$(re "JSON.stringify((()=>{const t=window.__pxc.tycoon;
return {id:t.docPending?t.docPending.id:'none',n:t.docN,next:Math.round(t.docNext),
  log:t.docLog.length,used:t.docUsed.length};})())")
RID=$(echo "$R0" | grep -o 'id:[a-z]*' | cut -d: -f2)
RN=$(echo "$R0" | grep -o 'n:[0-9]*' | cut -d: -f2)
RNEXT=$(echo "$R0" | grep -o 'next:[0-9]*' | cut -d: -f2)
RLOG=$(echo "$R0" | grep -o 'log:[0-9]*' | cut -d: -f2)
RUSED=$(echo "$R0" | grep -o 'used:[0-9]*' | cut -d: -f2)
echo "  · R0 存档前快照：$R0"
re "JSON.stringify((()=>{window.__pxc.tycoon.docHap=3;window.__pxc.tycoon.docHapLeft=99;window.__pxc.tycoon.save(window.__pxc.map);return 'saved';})())" >/dev/null
agent-browser reload >/dev/null 2>&1
agent-browser wait --fn "window.__pxc!==undefined" --timeout 90000 >/dev/null 2>&1
agent-browser wait 3000
agent-browser eval "(()=>{const b=[...document.querySelectorAll('button')].filter(x=>(x.textContent||'').includes('跳过'));if(b.length)b[b.length-1].click();return 'tut';})()" >/dev/null 2>&1
R1=$(re "JSON.stringify((()=>{const t=window.__pxc.tycoon;
return {id:t.docPending?t.docPending.id:'none',n:t.docN,next:Math.round(t.docNext),
  log:t.docLog.length,used:t.docUsed.length,
  hap:t.docHap,left:Math.round(t.docHapLeft)};})())")
chk "R1a 待批公文回案头（$RID）" "$(echo "$R1" | grep -o "id:$RID")" "id:$RID"
chk "R1b 已批数往返（docN=$RN）" "$(echo "$R1" | grep -o 'n:[0-9]*' | cut -d: -f2)" "$RN"
chk "R1c 明晨之约不漂移（next=$RNEXT）" "$(echo "$R1" | grep -o 'next:[0-9]*' | cut -d: -f2)" "$RNEXT"
chk "R1d 存档与用过池往返（log=$RLOG · used=$RUSED）" "$(echo "$R1" | grep -o "log:$RLOG,used:$RUSED")" "log:$RLOG,used:$RUSED"
R1HAP=$(echo "$R1" | grep -o 'hap:[0-9]*' | cut -d: -f2)
R1LEFT=$(echo "$R1" | grep -o 'left:[0-9]*' | cut -d: -f2)
if [ "$R1HAP" = "3" ] && [ -n "$R1LEFT" ] && [ "$R1LEFT" -gt 0 ] 2>/dev/null && [ "$R1LEFT" -le 99 ] 2>/dev/null; then ok "R1e 民心增益随档（+3 · 余焰未熄 left=$R1LEFT）"; else bad "R1e 民心增益随档（got hap=$R1HAP left=$R1LEFT · want hap=3 left∈(0,99]）"; fi
# R2 读档后照批不误
R2=$(re "JSON.stringify((()=>{const t=window.__pxc.tycoon;
const ok=t.decideDoc(0);
const r=[...t.chron.entries].reverse().find(x=>x.cat==='ord');
return {ok,n:t.docN,zhu:r.text.includes('市长朱批')};})())")
chk "R2 读档后照批（docN=$((RN+1)) · 政令卷续笔）" "$(echo "$R2" | grep -o "ok:true,n:$((RN+1)),zhu:true")" "ok:true,n:$((RN+1)),zhu:true"
# R3 桌面端截图（再送一份公文并打开模态）
agent-browser eval "(()=>{const e=window.__pxc;const t=e.tycoon;
if(t.docPending)t.decideDoc(1);
const ALL=['mill','guild','refugee','school','patrol','plague','subsidy','lamp','winter','templefair','levee','press','power','parkname','returnee'];
t.docUsed=ALL.filter(i=>i!=='mill');t.coins=500;t.docPending=null;t.docNext=t.gHours;t.tick(0.05,e.map);
return 'arrive';})()" >/dev/null 2>&1
agent-browser wait 1000
agent-browser eval "(()=>{const b=[...document.querySelectorAll('button.chip')].find(x=>(x.getAttribute('title')||'').includes('市长公署'));b.click();return 'open';})()" >/dev/null 2>&1
agent-browser wait 700
agent-browser screenshot $OUT/v29_gov_desktop.png >/dev/null && ok "截图 v29_gov_desktop.png（桌面 · 待批公文）"
agent-browser eval "(()=>{document.querySelectorAll('.gd-opt')[0].click();return 'stamp';})()" >/dev/null 2>&1
agent-browser wait 400
agent-browser screenshot $OUT/v29_gov_stamp.png >/dev/null && ok "截图 v29_gov_stamp.png（桌面 · 盖章动画）"
agent-browser wait 1600
ERR=$(errcount)
chk "R3a 控制台零错误" "${ERR:-x}" "0"
# R4 移动端公署
agent-browser set viewport 390 844
agent-browser wait 1200
agent-browser eval "(()=>{document.querySelector('.pxc-gov .pxc-x')?.click();return 'x';})()" >/dev/null 2>&1
agent-browser eval "(()=>{const e=window.__pxc;const t=e.tycoon;
if(t.docPending)t.decideDoc(1);
const ALL=['mill','guild','refugee','school','patrol','plague','subsidy','lamp','winter','templefair','levee','press','power','parkname','returnee'];
t.docUsed=ALL.filter(i=>i!=='mill');t.coins=500;t.docPending=null;t.docNext=t.gHours;t.tick(0.05,e.map);
return 'arrive';})()" >/dev/null 2>&1
agent-browser wait 1300
agent-browser eval "(()=>{const b=[...document.querySelectorAll('button.chip')].find(x=>(x.getAttribute('title')||'').includes('市长公署'));b.click();return 'open';})()" >/dev/null 2>&1
agent-browser wait 700
R4=$(re "JSON.stringify((()=>{
  const m=document.querySelector('.pxc-gov');
  const w=m?getComputedStyle(m).width:'-';
  const opts=[...document.querySelectorAll('.gd-opt')];
  const stamp=getComputedStyle(document.querySelector('.gov-stamp')||document.createElement('i')).fontSize;
  return {m:!!m,w,ok1:opts.length>=2&&!opts[1].disabled};})())")
chk "R4a 移动端模态挂载（近全宽）" "$(echo "$R4" | grep -o 'm:true')" "m:true"
echo "  · R4a 移动端模态宽：$(echo "$R4" | grep -o 'w:[0-9px]*')"
chk "R4b 选项可点（未置灰）" "$(echo "$R4" | grep -o 'ok1:true')" "ok1:true"
agent-browser screenshot $OUT/v29_gov_mobile.png >/dev/null && ok "截图 v29_gov_mobile.png（移动端 · 待批公文）"
agent-browser close >/dev/null 2>&1

echo ""
echo "=========================================="
echo "v29 结果：$PASS 通过 / $FAIL 失败"
[ "$FAIL" -eq 0 ] && echo "全部通过 ✅" || echo "存在失败 ❌"
exit $FAIL
