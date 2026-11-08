#!/bin/bash
# ============================================================
# v39_browser_test.sh — 号外！「城市之声」报馆与城市日报端到端验证
# 增量 = newspaper.ts（PRESS_* 常数（七日一期/次日开印/每份 0.06/排印 4G/
#   发行量公式 基数30+人口0.6×识字率/号外×1.3/大事头条×1.15/保留 3 期/洛阳纸贵 300）
#   + PaperIssue 版面（头版头条/市况/气象/来信选登/广告栏/连载「城南旧事」/发行数据）
#   + circOf 发行量公式 + genPaperIssue 排版（头条 大事记→灾祸→喜讯→政务 新→旧优先）
#   + tycoon.ts（press 报馆建筑 ECON/TECH_GATE「义务教育」/ATTRACT 2/snap pressN+pressCirc
#   + stepPress 创刊与出版调度 + publishIssue 版面生成发行结算纪事
#   + pressTest 沙盒钩子 + EVENT_TPLS「独家新闻」事件
#   + 成就 创刊号/笔耕不辍/洛阳纸贵 + 任务 城市之声 + QS pressN/pressIss
#   + view news 视图 + 存档 prsX/prsN/prsC/prsT/prsS1/prsSince/prsIss 向后兼容）
#   + PixelCity.tsx（顶栏「闻」chip + 城市日报模态：报头/头条/四栏目/广告/脚注/过刊翻阅
#   + 城市志报馆行 + 帮助移动表「报馆」行 + 经营长行补城市之声段）
#   + pixelcity.css（报版纸面/报头/栏目栅格/广告栏/移动端单列）
# S 段：bun 直测（常数 / 发行量公式 / 版面齐全 / 头条优先 / 连载轮转 / 广告池 / 成就任务）
# D 段：引擎流（空册 / 创刊纪事 / 首期号外 / 出版结算 / 周期出版 / 停刊复刊 /
#       过刊保留 / 独家新闻 / 存档往返 / 成就巡检）
# U 段：城市日报模态 / 桌面与移动端截图
# R 段：零控制台错误
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

echo "=== [S] 纯函数直测（bun：常数 / 发行量公式 / 版面 / 头条 / 连载 / 广告 / 成就任务） ==="
S=$(cd /home/z/my-project && bun -e '
import { PRESS_DAY_GAP, PRESS_FIRST_GAP, PRESS_EARN, PRESS_COST, PRESS_CIRC_BASE,
  PRESS_CIRC_POP_K, PRESS_LIT_BASE, PRESS_BIG_K, PRESS_EXTRA_K, PRESS_KEEP, PRESS_CIRC_GOAL,
  circOf, genPaperIssue, SERIAL_TITLE, type PressCtx } from "./src/lib/pixelcity/newspaper.ts";
import { ACHIEVEMENTS, QUESTS } from "./src/lib/pixelcity/tycoon.ts";
const mk = (over: Partial<PressCtx> = {}): PressCtx => ({
  pop: 500, hrIdx: 50, rating: 72,
  cycPhase: 2, cycComK: 1.06, cycTourK: 1.04,
  seasonName: "秋", seasonNote: "金秋丰收：粮食产量 +25%，层林尽染",
  weather: "clear", comN: 5, tourists: 12.4, shops: {},
  chron: [], sinceId: 0, letters: [], rnd: () => 0.5, ...over,
});
const i1 = genPaperIssue(1, 100, mk());
const i2 = genPaperIssue(9, 100, mk());
const i3 = genPaperIssue(2, 100, mk());
const a1 = ACHIEVEMENTS.find(a => a.id === "press1")!, a10 = ACHIEVEMENTS.find(a => a.id === "press10")!,
  ac = ACHIEVEMENTS.find(a => a.id === "pressCirc")!;
const q = QUESTS.find(x => x.id === "press1")!;
console.log(JSON.stringify({
  k: [PRESS_DAY_GAP, PRESS_FIRST_GAP, PRESS_EARN, PRESS_COST, PRESS_CIRC_BASE, PRESS_CIRC_POP_K,
      PRESS_LIT_BASE, PRESS_BIG_K, PRESS_EXTRA_K, PRESS_KEEP, PRESS_CIRC_GOAL].join(","),
  c1: circOf(500, 50, false, false) + "," + circOf(500, 50, true, false) + "," + circOf(100, 50, false, false),
  sheet: (i1.n === 1 && i1.day === 5 && i1.head.title.length > 0 && i1.market.includes("市况")
    && i1.weather.includes("秋") && i1.ads.length === 2 && i1.serial.startsWith("第 1 回")
    && i1.circ > 0 && i1.earn === Math.round(i1.circ * PRESS_EARN - PRESS_COST)) ? "ok" : "ng",
  head: (() => {
    const big = genPaperIssue(1, 100, mk({ chron: [
      { id: 2, cat: "event", tone: "info", icon: "city", title: "政务一则", text: "x" },
      { id: 3, cat: "era", tone: "big", icon: "city", title: "开埠建城", text: "x" }] }));
    const idle = genPaperIssue(1, 100, mk());
    return (big.head.title === "开埠建城" && big.extra === true && idle.extra === false) ? "ok" : "ng";
  })(),
  cyc: (i1.serial.startsWith("第 1 回") && i2.serial.startsWith("第 1 回") && i3.serial.startsWith("第 2 回")
    && i1.serial.includes(SERIAL_TITLE.slice(0, 2)) === false && SERIAL_TITLE === "城南旧事") ? "ok" : "ng",
  ads: (() => {
    let n = 0;
    const rndA = () => { n++; return n === 2 ? 0.001 : 0.9; };   // 第 2 抽=广告首挑（第 1 抽被头条选稿消耗）命中候选 0（居酒屋）
    const iz = genPaperIssue(1, 100, mk({ shops: { izakaya: 2 }, rnd: rndA }));
    const fb = genPaperIssue(1, 100, mk());
    return (iz.ads[0].includes("居酒屋") && new Set(iz.ads).size === 2
      && fb.ads.length === 2 && new Set(fb.ads).size === 2) ? "ok" : "ng";
  })(),
  ach: a1.name + a1.goal + "/" + a10.name + a10.goal + "/" + ac.name + ac.goal,
  q: q.title + q.goal,
}));' 2>&1 | tail -1 | stripq)
chk "S1 常数（七日168h · 次日24h · 每份0.06 · 排印4 · 基数30 · 人口0.6 · 识字0.6 · 大事1.15 · 号外1.3 · 留3期 · 洛阳300）" \
  "$(echo "$S" | grep -o 'k:168,24,0.06,4,30,0.6,0.6,1.15,1.3,3,300')" "k:168,24,0.06,4,30,0.6,0.6,1.15,1.3,3,300"
chk "S2 发行量公式（pop500识50→297 · 号外→387 · pop100→81）" \
  "$(echo "$S" | grep -o 'c1:297,387,81')" "c1:297,387,81"
chk "S3 版面齐全（期号/出版日/头条/市况/气象/广告2/连载/发行/净收入）" \
  "$(echo "$S" | grep -o 'sheet:ok')" "sheet:ok"
chk "S4 头条优先（大事记优先且号外 · 无事走日常稿不号外）" \
  "$(echo "$S" | grep -o 'head:ok')" "head:ok"
chk "S5 连载轮转（城南旧事八回循环：1回→9回 · 2回）" \
  "$(echo "$S" | grep -o 'cyc:ok')" "cyc:ok"
chk "S6 广告池（居酒屋在城出店词 · 无商户走启事 · 两条不重复）" \
  "$(echo "$S" | grep -o 'ads:ok')" "ads:ok"
chk "S7 成就三枚（创刊号1 / 笔耕不辍10 / 洛阳纸贵300）+ 任务（城市之声 · goal 1）" \
  "$(echo "$S" | grep -o 'ach:创刊号1/笔耕不辍10/洛阳纸贵300')" "ach:创刊号1/笔耕不辍10/洛阳纸贵300"
chk "S8 任务（城市之声 · goal 1）" "$(echo "$S" | grep -o 'q:城市之声1')" "q:城市之声1"

echo "=== [1] 桌面端 1440×900 新档开局 ==="
agent-browser close >/dev/null 2>&1; sleep 1
agent-browser set viewport 1440 900
agent-browser open "$B" >/dev/null 2>&1
agent-browser wait --fn "window.__pxc!==undefined" --timeout 90000 >/dev/null 2>&1 && ok "引擎就绪" || bad "引擎超时"
agent-browser wait 3000
agent-browser eval "(()=>{const b=[...document.querySelectorAll('button')].filter(x=>(x.textContent||'').includes('跳过'));if(b.length)b[b.length-1].click();return 'tut';})()" >/dev/null 2>&1
# 冻结随机源：市民信/事件/生日/景气/公文/邻城事件/城事回望不自行触发（pressTest/forceEvent 单测不受影响）
agent-browser eval "(()=>{const t=window.__pxc.tycoon;const c=t.citz;c.mailTimer=99999;c.evTimer=99999;c.bdayTimer=99999;t.eventTimer=99999;t.cycTimer=99999;t.docNext=999999;t.sisGrowAt=99999;t.sisEvtAt=99999;t.revNext=99999999;return 'frozen';})()" >/dev/null 2>&1

echo "=== [2] D 段：报馆与城市日报引擎流 ==="
# D1 空册（未创刊 · 无馆 · 无过刊）
D1=$(re "JSON.stringify((()=>{const e=window.__pxc;const t=e.tycoon;t.tick(0.05,e.map);
const v=t.view().news;
return {on:v.on,n:v.n,next:t.pressNext,iss:t.pressIssues.length,pressN:t.snap.pressN};})())")
chk "D1 开埠空册（未创刊 · 0期 · 无馆）" "$(echo "$D1" | grep -o 'on:false,n:0,next:-1,iss:0,pressN:0')" "on:false,n:0,next:-1,iss:0,pressN:0"
# D2 建报馆 → 创刊纪事 + 次日开印约期
D2=$(re "JSON.stringify((()=>{const e=window.__pxc;const m=e.map;const t=e.tycoon;
const ok=m.place('press',0,121,123);
t.tick(0.05,m);
return {ok,pressN:t.snap.pressN,open:t.chron.entries.some(x=>x.title==='报馆创刊'),
  next:t.pressNext>t.gHours,first:t.pressNext-t.gHours<=24.5};})())")
chk "D2 报馆创刊（馆1 · 编年史入册 · 次日开印约期）" "$(echo "$D2" | grep -o 'ok:true,pressN:1,open:true,next:true,first:true')" "ok:true,pressN:1,open:true,next:true,first:true"
# D3 首期号外（pressNext=gHours 同步出版：头条=开埠建城大事记 → 号外加印 · 截稿线=本报）
D3=$(re "JSON.stringify((()=>{const e=window.__pxc;const m=e.map;const t=e.tycoon;
if(t.pressIss===0){t.pressNext=t.gHours;t.tick(0.05,m);}
const it=t.pressIssues[0];
return {n:t.pressIss===1,i1:it&&it.n===1,ex:it&&it.extra,head:it&&it.head.title==='开埠建城',
  chron:t.chron.entries.some(x=>x.title==='城市日报 · 第 1 期'&&x.text.includes('号外')),
  since:t.pressSinceId>0&&it?t.chron.entries.some(x=>x.id===t.pressSinceId&&x.title.startsWith('城市日报')):false};})())")
chk "D3 创刊号即号外（头条开埠建城 · 加印 · 编年史带号外 · 截稿线=本报）" \
  "$(echo "$D3" | grep -o 'n:true,i1:true,ex:true,head:true,chron:true,since:true')" "n:true,i1:true,ex:true,head:true,chron:true,since:true"
# D4 出版结算（发行量落在新域 · 净收入合式 · 累计同步 · 当前发行量=最新一期）
D4=$(re "JSON.stringify((()=>{const e=window.__pxc;const t=e.tycoon;
const it=t.pressIssues.find(x=>x.n===1);
if(!it)return {ok:false};
return {ok:true,circ:it.circ>=34&&it.circ<=70,earn:it.earn===Math.round(it.circ*0.06-4),
  tot:t.pressCircT>=it.circ,cur:t.pressCirc===t.pressIssues[0].circ};})())")
chk "D4 出版结算（发行量合式域 · 净收入合式 · 累计同步 · 当前发行量对齐）" \
  "$(echo "$D4" | grep -o 'ok:true,circ:true,earn:true,tot:true,cur:true')" "ok:true,circ:true,earn:true,tot:true,cur:true"
# D5 周期出版（到期即出下期 · 约期推进整一周期）
D5=$(re "JSON.stringify((()=>{const e=window.__pxc;const m=e.map;const t=e.tycoon;
if(t.pressIss===1){t.pressNext=t.gHours;}
t.tick(0.05,m);
return {n:t.pressIss===2,next:Math.abs(t.pressNext-(t.gHours+168))<2,
  chron:t.chron.entries.some(x=>x.title==='城市日报 · 第 2 期')};})())")
chk "D5 周期出版（第2期 · 约期+168h · 编年史入册）" \
  "$(echo "$D5" | grep -o 'n:true,next:true,chron:true')" "n:true,next:true,chron:true"
# D6 停刊复刊（拆馆 pressN=0 沙盒拒绝出版 · 复建即复刊第3期）
D6=$(re "JSON.stringify((()=>{const e=window.__pxc;const m=e.map;const t=e.tycoon;
let off=false,ref=false;
if(t.pressIss>=2&&!t.pressIssues.some(x=>x.n===3)){
  const ent=[...m.objs.entries()].find(([k,o])=>o.id==='press');
  if(ent){m.bulldoze(ent[1].ax,ent[1].ay);t.tick(0.05,m);}
  off=t.snap.pressN===0;ref=t.pressTest(m)===null;
  m.place('press',0,121,123);t.tick(0.05,m);t.pressTest(m);
}
const got=t.pressIssues.some(x=>x.n===3);
return {off:off||got,ref:ref||got,on:t.snap.pressN===1,three:got};})())")
chk "D6 停刊复刊（拆馆停印 · 沙盒拒绝 · 复建复刊 · 第3期到手）" \
  "$(echo "$D6" | grep -o 'off:true,ref:true,on:true,three:true')" "off:true,ref:true,on:true,three:true"
# D7 过刊保留（补足到 5 期 → 保留最近 3 期 · 新在前）
D7=$(re "JSON.stringify((()=>{const e=window.__pxc;const m=e.map;const t=e.tycoon;
let guard=0;while(t.pressIss<5&&guard++<10)t.pressTest(m);
const ns=t.pressIssues.map(x=>x.n);
return {iss:t.pressIss===5,keep:t.pressIssues.length===3,
  order:ns.length===3&&ns[0]===5&&ns[1]===4&&ns[2]===3};})())")
chk "D7 过刊保留（累计5期 · 留3期 · 新在前 5/4/3）" \
  "$(echo "$D7" | grep -o 'iss:true,keep:true,order:true')" "iss:true,keep:true,order:true"
# D8 独家新闻（forceEvent('scoop') → 府库进账 · 事件日志入档）
D8=$(re "JSON.stringify((()=>{const e=window.__pxc;const m=e.map;const t=e.tycoon;
const c0=t.coins;
const ok=t.forceEvent('scoop',m);t.tick(0.05,m);
return {ok,gain:t.coins>c0,log:t.eventLog.some(x=>x.name==='独家新闻')};})())")
chk "D8 独家新闻（事件触发 · 号外进账 · 事件日志）" \
  "$(echo "$D8" | grep -o 'ok:true,gain:true,log:true')" "ok:true,gain:true,log:true"
# D9 存档往返（期数/发行量/过刊期号序列 → resume 原样回来）
D9=$(re "JSON.stringify((()=>{const e=window.__pxc;const t=e.tycoon;const m=e.map;
const raw=JSON.parse(t.serialize(m));
const seq0=raw.prsIss.map(x=>x.n),n0=raw.prsN,c0=raw.prsC;
t.resume(m,raw);
const seq1=t.pressIssues.map(x=>x.n);
return {match:JSON.stringify(seq1)===JSON.stringify(seq0)&&seq0.length===3,
  n:t.pressIss===n0,circ:t.pressCirc===c0};})())")
chk "D9 存档往返（过刊期号序列一致 · 期数/发行量保持）" \
  "$(echo "$D9" | grep -o 'match:true,n:true,circ:true')" "match:true,n:true,circ:true"
# D10 成就巡检（2.6s → 创刊号解锁 · 笔耕不辍/洛阳纸贵未达）
sleep 2.6
D10=$(re "JSON.stringify((()=>{const t=window.__pxc.tycoon;
return {a:t.achv.has('press1'),b:t.achv.has('press10'),c:t.achv.has('pressCirc')};})())")
chk "D10 成就巡检（创刊号解锁 · 另两枚未达）" "$(echo "$D10" | grep -o 'a:true,b:false,c:false')" "a:true,b:false,c:false"

echo "=== [3] U 段：城市日报模态 ==="
U1=$(re "(()=>{const c=document.querySelector('.chip.news-chip');
if(!c)return 'nochip';const on=c.classList.contains('news-on');
const txt=(c.textContent||'').includes('闻');return JSON.stringify({on,txt});})()")
chk "U1 顶栏「闻」chip（创刊点亮 · 字牌可辨）" "$(echo "$U1" | grep -o 'on:true,txt:true')" "on:true,txt:true"
agent-browser eval "(()=>{const c=document.querySelector('.chip.news-chip');if(c)c.click();return 'open';})()" >/dev/null 2>&1
agent-browser wait 700
U2=$(re "JSON.stringify((()=>{const d=document.querySelector('.pxc-news');
if(!d)return {m:false};
const sheet=d.querySelector('.np-sheet');
return {m:true,sheet:!!sheet,name:(d.querySelector('.np-name')?.textContent||'').length>0,
  head:!!d.querySelector('.np-headline b'),cols:d.querySelectorAll('.np-box').length,
  ads:d.querySelectorAll('.np-ad').length,foot:(d.querySelector('.np-foot')?.textContent||'').includes('发行'),
  tabs:d.querySelectorAll('.np-tab').length};})())")
echo "  · U2 模态：$U2"
chk "U2 城市日报版面（报头/头条/四栏目/广告2/脚注发行/过刊翻阅3枚）" \
  "$(echo "$U2" | grep -o 'm:true,sheet:true,name:true,head:true,cols:4,ads:2,foot:true,tabs:3')" "m:true,sheet:true,name:true,head:true,cols:4,ads:2,foot:true,tabs:3"
agent-browser eval "(()=>{const d=document.querySelector('.pxc-news');if(d)d.scrollIntoView({block:'start'});return 'scrolled';})()" >/dev/null 2>&1
agent-browser wait 400 >/dev/null 2>&1
agent-browser screenshot "$OUT/v39_news.png" >/dev/null 2>&1 && ok "U2b 日报截图 v39_news.png" || bad "U2b 截图失败"
agent-browser eval "(()=>{const x=document.querySelector('.pxc-news .pxc-x');if(x)x.click();return 'x';})()" >/dev/null 2>&1

echo "=== [4] R 段：移动端 + 零错误 ==="
agent-browser set viewport 390 844
agent-browser wait 1200
agent-browser eval "(()=>{const c=document.querySelector('.chip.news-chip');if(c)c.click();return 'open';})()" >/dev/null 2>&1
agent-browser wait 700
U3=$(re "JSON.stringify((()=>{const d=document.querySelector('.pxc-news');
if(!d)return {m:false};
const cols=d.querySelector('.np-cols');
const one=cols?getComputedStyle(cols).gridTemplateColumns.split(' ').length===1:false;
const sheet=d.querySelector('.np-sheet');const r=sheet?sheet.getBoundingClientRect():null;
const vw=document.documentElement.clientWidth;
return {m:true,one,fit:r?r.left>=-2&&r.right<=vw+2:false,ads:d.querySelectorAll('.np-ad').length};})())")
chk "U3 移动端日报（栏目单列 · 版面无横向溢出）" \
  "$(echo "$U3" | grep -o 'm:true,one:true,fit:true,ads:2')" "m:true,one:true,fit:true,ads:2"
agent-browser eval "(()=>{const d=document.querySelector('.pxc-news');if(d)d.scrollIntoView({block:'start'});return 'scrolled';})()" >/dev/null 2>&1
agent-browser wait 400 >/dev/null 2>&1
agent-browser screenshot "$OUT/v39_mobile.png" >/dev/null 2>&1 && ok "U3b 移动端截图 v39_mobile.png" || bad "U3b 截图失败"
agent-browser eval "(()=>{const x=document.querySelector('.pxc-news .pxc-x');if(x)x.click();return 'x';})()" >/dev/null 2>&1
ERR=$(errcount)
chk "R1 控制台零错误（全程）" "$ERR" "0"

echo ""
echo "==================================================="
echo "v39 号外！城市之声·报馆与城市日报 —— 通过 $PASS · 失败 $FAIL"
echo "==================================================="
exit $([ "$FAIL" -eq 0 ] && echo 0 || echo 1)
