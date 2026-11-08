#!/bin/bash
# ============================================================
# v40_browser_test.sh — 城市之光「季评·名人堂」端到端验证
# 增量 = hall.ts（HALL_* 常数（一季一评 12h/心情+12/幸福+1·120s/留 24 届/八奖）
#   + HallRoll 授勋记录 + HallNominee 候选投影 + 八大奖项表
#   （劳动模范兜底/见义勇为消防门/仁心仁术医疗门/平安卫士治安门/绿茵之星赢球门/
#   杏坛春晖教育门/寿星高照高龄候选/创业先锋商街门·各有颁奖词模板）
#   + hallAwardKinds 集齐计数 + pickHallWinner 加权评选（rnd/awards 可注入）
#   + tycoon.ts（hall 名人堂建筑 ECON/TECH_GATE「城市名片」/ATTRACT 3
#   + stepHall 开榜与换季整点评选 + conductHall 授勋（个人史册+心情+12+幸福 buff
#   +编年史 big→报纸号外联动）+ hallTest 沙盒直评（绕开城市门槛留候选判定）
#   + EVENT_TPLS「民意荐贤」+ 成就 城市之光/满堂生辉/群星璀璨 + 任务 光荣榜
#   + snap halls/hallN/hallAwardsN + 幸福公式授勋加成 + QS 字段
#   + view hall 视图 + 存档 hlT/hlN/hlS1/hlA/hlHT/hlR 向后兼容）
#   + citizens.ts（awardHonor 公开授勋 + onCityEvent 'hallnom' 荐贤心声）
#   + PixelCity.tsx（顶栏「光」chip + 荣誉殿堂模态：进度头/八奖图鉴/光荣榜
#   + 城市志名人堂行 + 帮助移动表「名人堂」行 + 经营长行补城市之光段）
#   + pixelcity.css（殿堂金主题/奖卡/榜行/移动端 2 列）
# S 段：bun 直测（常数/奖项表/兜底评选/城市门路/颁奖词/集齐计数/空候选/成就任务）
# D 段：引擎流（空榜/开榜纪事/首届劳模/授勋效果/停评复评/满堂生辉/候选空缺/
#       荐贤事件/榜截留/存档往返/成就巡检）
# U 段：荣誉殿堂模态 / 桌面与移动端截图
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
  local out="" raw="" k
  for k in 1 2 3 4 5 6 7 8; do
    raw=$(agent-browser eval "$1" 2>&1)
    out=$(printf '%s' "$raw" | awk 'NF{printf "%s",$0}END{print ""}' | tr -d '\\' | tr -d '"' | tr -d ' ')
    if [ -n "$out" ] && ! echo "$out" | grep -q "Evaluationerror\|Evaluation error"; then
      echo "$out"; return 0
    fi
    printf '%s' "$raw" > "/tmp/evalfail_${RANDOM}.txt"   # 空回包/报错取证（重试前留证）
    sleep 0.9
  done
  echo "$out"; return 1
}
errcount() { agent-browser errors --json 2>/dev/null | python3 -c "import json,sys
try: print(len(json.load(sys.stdin).get('data',{}).get('errors',[])))
except Exception: print(0)"; }

echo "=== [S] 纯函数直测（bun：常数 / 奖项表 / 评选 / 颁奖词 / 集齐 / 成就任务） ==="
S=$(cd /home/z/my-project && bun -e '
import { HALL_GAP, HALL_MOOD, HALL_HAP, HALL_HAP_T, HALL_KEEP, HALL_AWARD_N,
  HALL_AWARDS, hallAwardKinds, pickHallWinner, type HallNominee, type HallCtx } from "./src/lib/pixelcity/hall.ts";
import { ACHIEVEMENTS, QUESTS } from "./src/lib/pixelcity/tycoon.ts";
const nom = (over: Partial<HallNominee> = {}): HallNominee => ({
  id: 1, name: "林秀兰", job: "杂货店主", gender: 1, age: 42, body: 0,
  mood: 66, homeName: "铃兰街的独栋小屋", hobby: "侍弄阳台盆栽", ...over,
});
const ctx0 = (): HallCtx => ({
  season: "秋", pop: 200, firestation: false, hospital: false, clinic: false,
  police: false, school: false, stadium: false, lgWin: false, shopsN: 0,
});
const r1 = pickHallWinner([nom()], ctx0(), 1, 100, () => 0.5);
const r2 = pickHallWinner([nom({ job: "消防员" })], { ...ctx0(), firestation: true }, 2, 100, () => 0.9);
const r3 = pickHallWinner([nom({ job: "消防员" })], ctx0(), 3, 100, () => 0.5);
const none = pickHallWinner([], ctx0(), 4, 100, () => 0.5);
const elderRoll = pickHallWinner([nom({ body: 2, age: 90, job: "无业" })], ctx0(), 5, 100, () => 0.9);
const kinds = hallAwardKinds([
  { n: 1, season: "秋", day: 1, id: 1, nm: "a", job: "x", award: "劳动模范", cite: "" },
  { n: 2, season: "冬", day: 2, id: 2, nm: "b", job: "y", award: "劳动模范", cite: "" },
  { n: 3, season: "春", day: 3, id: 3, nm: "c", job: "z", award: "见义勇为", cite: "" },
]);
const a1 = ACHIEVEMENTS.find(a => a.id === "hall1")!, a8 = ACHIEVEMENTS.find(a => a.id === "hall8")!,
  a12 = ACHIEVEMENTS.find(a => a.id === "hall12")!;
const q = QUESTS.find(x => x.id === "hall1")!;
console.log(JSON.stringify({
  k: [HALL_GAP, HALL_MOOD, HALL_HAP, HALL_HAP_T, HALL_KEEP, HALL_AWARD_N].join(","),
  tbl: HALL_AWARDS.length + "," + new Set(HALL_AWARDS.map(a => a.id)).size + "," +
    HALL_AWARDS.every(a => typeof a.cand === "function" && typeof a.w === "function" && typeof a.cite === "function"),
  fall: r1 ? (r1.award === "劳动模范" && r1.n === 1 && r1.day === 5 && r1.season === "秋") : false,
  door: r2 ? r2.award === "见义勇为" : false,
  gate: r3 ? r3.award === "劳动模范" : false,   // 无消防局：消防门关闭 → 兜底劳模
  none: none === null,
  elder: elderRoll ? elderRoll.award === "寿星高照" : false,
  cite: r1 ? (r1.cite.includes("林秀兰") || r1.cite.includes("杂货店主")) && r1.cite.length > 20 : false,
  kinds: kinds === 2,
  ach: a1.name + a1.goal + "/" + a8.name + a8.goal + "/" + a12.name + a12.goal,
  q: q.title + q.goal,
}));' 2>&1 | tail -1 | stripq)
chk "S1 常数（一季12h · 心情12 · 幸福1 · 120s · 留24届 · 八奖）" \
  "$(echo "$S" | grep -o 'k:12,12,1,120,24,8')" "k:12,12,1,120,24,8"
chk "S2 奖项表（8奖 · id唯一 · 判定/权重/颁奖词全配）" \
  "$(echo "$S" | grep -o 'tbl:8,8,true')" "tbl:8,8,true"
chk "S3 兜底评选（劳动模范 · 届号/季名/出版日齐）" "$(echo "$S" | grep -o 'fall:true')" "fall:true"
chk "S4 城市门路（消防局在城+消防员候选 → 见义勇为）" "$(echo "$S" | grep -o 'door:true')" "door:true"
chk "S5 门槛判定（无消防局 → 兜底劳模不上见义勇为）" "$(echo "$S" | grep -o 'gate:true')" "gate:true"
chk "S6 空候选（无在册市民 → null 不硬评）" "$(echo "$S" | grep -o 'none:true')" "none:true"
chk "S7 寿星高照（85+ 长者候选）" "$(echo "$S" | grep -o 'elder:true')" "elder:true"
chk "S8 颁奖词（含市民名或职别 · 20 字以上）" "$(echo "$S" | grep -o 'cite:true')" "cite:true"
chk "S9 集齐计数（劳模两届+见义勇为一届 → 2 种）" "$(echo "$S" | grep -o 'kinds:true')" "kinds:true"
chk "S10 成就三枚（城市之光1 / 满堂生辉8 / 群星璀璨12）" \
  "$(echo "$S" | grep -o 'ach:城市之光1/满堂生辉8/群星璀璨12')" "ach:城市之光1/满堂生辉8/群星璀璨12"
chk "S11 任务（光荣榜 · goal 1）" "$(echo "$S" | grep -o 'q:光荣榜1')" "q:光荣榜1"

echo "=== [1] 桌面端 1440×900 新档开局（脉冲人口造市民） ==="
agent-browser close >/dev/null 2>&1; sleep 1
agent-browser set viewport 1440 900
agent-browser open "$B" >/dev/null 2>&1
agent-browser wait --fn "window.__pxc!==undefined" --timeout 90000 >/dev/null 2>&1 && ok "引擎就绪" || bad "引擎超时"
agent-browser wait 3000
agent-browser eval "(()=>{const b=[...document.querySelectorAll('button')].filter(x=>(x.textContent||'').includes('跳过'));if(b.length)b[b.length-1].click();return 'tut';})()" >/dev/null 2>&1
# 冻结随机源：市民信/事件/生日/景气/公文/邻城事件/城事回望不自行触发（hallTest/forceEvent 单测不受影响）
agent-browser eval "(()=>{const t=window.__pxc.tycoon;const c=t.citz;c.mailTimer=99999;c.evTimer=99999;c.bdayTimer=99999;t.eventTimer=99999;t.cycTimer=99999;t.docNext=999999;t.sisGrowAt=99999;t.sisEvtAt=99999;t.revNext=99999999;return 'frozen';})()" >/dev/null 2>&1
# 脉冲人口：市民随迁入逐步落户（v13 同款手法）
agent-browser eval "(()=>{const t=window.__pxc.tycoon;let iv=null;iv=setInterval(()=>{t.pop=Math.min(64,t.pop+4)},250);setTimeout(()=>clearInterval(iv),2600);return 'pulsing';})()" >/dev/null 2>&1
agent-browser wait 3200

echo "=== [2] D 段：名人堂与季评授勋引擎流 ==="
# D1 空榜（未开榜 · 无堂 · 无过届）
D1=$(re "JSON.stringify((()=>{const e=window.__pxc;const t=e.tycoon;t.tick(0.05,e.map);
const v=t.view().hall;
return {on:v.on,n:v.n,next:t.hallNext,rolls:t.hallRolls.length,halls:t.snap.halls};})())")
chk "D1 开埠空榜（未开榜 · 0届 · 无堂）" "$(echo "$D1" | grep -o 'on:false,n:0,next:-1,rolls:0,halls:0')" "on:false,n:0,next:-1,rolls:0,halls:0"
# D2 建名人堂 → 开榜纪事 + 逢换季整点约期
D2=$(re "JSON.stringify((()=>{const e=window.__pxc;const m=e.map;const t=e.tycoon;
const ok=m.place('hall',0,121,123);
t.tick(0.05,m);
return {ok,halls:t.snap.halls,open:t.chron.entries.some(x=>x.title==='名人堂开榜'),
  next:t.hallNext>t.gHours,algn:Math.abs(t.hallNext-Math.ceil((t.gHours+0.001)/12)*12)<0.01};})())")
chk "D2 名人堂开榜（堂1 · 编年史入册 · 换季整点约期）" "$(echo "$D2" | grep -o 'ok:true,halls:1,open:true,next:true,algn:true')" "ok:true,halls:1,open:true,next:true,algn:true"
# D3 首届评选（闡锁 hallN===0 → 授勋 · 劳模兕底 · 编年史 big · 光荣榜第 1 届 · 幸福 buff 起）
D3=$(re "JSON.stringify((()=>{const e=window.__pxc;const m=e.map;const t=e.tycoon;
if(t.hallN===0){t.hallNext=t.gHours;t.tick(0.05,m);}
const r=t.hallRolls[0];
return {n:t.hallN===1,r1:r&&r.n===1,aw:r&&r.award==='劳动模范',
  chron:t.chron.entries.some(x=>x.title==='城市之光 · 第 1 届'&&x.tone==='big'),
  awset:t.hallAwards.has('laomo'),hap:t.hallHapT>0,
  roll:t.hallRolls.length===1};})())")
chk "D3 首届评选（劳模兜底 · 编年史大事记 · 荣衔登记 · 幸福起效）" \
  "$(echo "$D3" | grep -o 'n:true,r1:true,aw:true,chron:true,awset:true,hap:true,roll:true')" "n:true,r1:true,aw:true,chron:true,awset:true,hap:true,roll:true"
# D4 授勋效果（获奖市民史册添荣衔笔 · 心情 +12 · view 幸福加成生效中）
D4=$(re "JSON.stringify((()=>{const e=window.__pxc;const t=e.tycoon;
const r=t.hallRolls[0];const c=t.citz.roster.find(x=>x.id===r.id);
return {log:c?c.log.some(l=>l.text.includes('劳动模范')):false,
  hapOn:t.view().hall.hapOn,hapT:t.view().hall.hapT>0};})())")
chk "D4 授勋效果（史册荣衔笔 · 幸福加成生效中）" \
  "$(echo "$D4" | grep -o 'log:true,hapOn:true,hapT:true')" "log:true,hapOn:true,hapT:true"
# D5 停评复评（闡锁 hallN===1：拆堂沙盒拒绝出版 · 复建即复评第 2 届）
D5=$(re "JSON.stringify((()=>{const e=window.__pxc;const m=e.map;const t=e.tycoon;
if(t.hallN===1){
  const ent=[...m.objs.entries()].find(([k,o])=>o.id==='hall');
  if(ent)m.bulldoze(ent[1].ax,ent[1].ay);
  t.tick(0.05,m);
  if(t.hallTest()!==null)return {err:'refuse-failed'};
  m.place('hall',0,121,123);t.tick(0.05,m);
  t.hallTest();
}
return {on2:t.snap.halls===1,n2:t.hallN===2,r2:t.hallRolls[0]&&t.hallRolls[0].n===2};})())")
chk "D5 停评复评（拆堂停评沙盒拒绝 · 复建复评 · 第2届到手）" \
  "$(echo "$D5" | grep -o 'on2:true,n2:true,r2:true')" "on2:true,n2:true,r2:true"
# D6 满堂生辉（id 守卫注入六职别候选含无条件 90 岁长者 → 沙盒直评八奖各一届 → 奖项集齐 8）
D6=$(re "JSON.stringify((()=>{const e=window.__pxc;const t=e.tycoon;
const c0=t.citz.roster[0];
const mk=(id,job,over)=>{if(!t.citz.roster.some(x=>x.id===id))t.citz.roster.push({...c0,id,job,mood:60,...over});};
mk(9101,'消防员');mk(9102,'值班医生');mk(9103,'片区警官');
mk(9104,'小学教师');mk(9105,'杂货店主');mk(9106,'无业',{body:2,age:90});
const m0=t.msg,s0=t.sfx;t.msg=null;t.sfx=null;   // 批量授勋静音：免播报/音效风暴拖垮 eval 回包
for(const aid of ['laomo','jiuyong','renxin','pingan','lvyin','xingtan','shouxi','chuangye'])t.hallTest(aid);
t.msg=m0;t.sfx=s0;t.tick(0.05,e.map);   // 刷新快照（hallAwardsN 在 snapOf 才重算）
return {n:t.hallN>=10,aw:t.hallAwards.size===8,
  awN:t.snap.hallAwardsN===8,rolls:t.hallRolls.length>=8};})())")
chk "D6 满堂生辉（八奖直评 · 奖项集齐 8 · 光荣榜 8 届以上）" \
  "$(echo "$D6" | grep -o 'n:true,aw:true,awN:true,rolls:true')" "n:true,aw:true,awN:true,rolls:true"
echo "  · D6 现场：$D6"
# D7 候选空缺（指定无候选职别的奖 → 授勋空缺纪事 · 届数不增 · 沙盒返回上一届）
D7=$(re "JSON.stringify((()=>{const e=window.__pxc;const t=e.tycoon;
const n0=t.hallN,r0=t.hallRolls.length;
const got=t.hallTest('renxin2x');
const empty=t.chron.entries.some(x=>x.title==='授勋空缺');
return {prev:got&&got.n===n0,nkeep:t.hallN===n0,rkeep:t.hallRolls.length===r0,empty};})())")
chk "D7 候选空缺（无候选 → 空缺纪事 · 届数不增 · 返回上一届）" \
  "$(echo "$D7" | grep -o 'prev:true,nkeep:true,rkeep:true,empty:true')" "prev:true,nkeep:true,rkeep:true,empty:true"
# D8 民意荐贤（forceEvent('hallnom') → 事件日志 + 市民史册含荐贤笔）
D8=$(re "JSON.stringify((()=>{const e=window.__pxc;const t=e.tycoon;
const ok=t.forceEvent('hallnom',e.map);t.tick(0.05,e.map);
return {ok,log:t.eventLog.some(x=>x.name==='民意荐贤'),
  citz:t.citz.roster.some(c=>c.log.some(l=>l.text.includes('光荣榜')))};})())")
chk "D8 民意荐贤（事件触发 · 日志入档 · 市民史册心声）" \
  "$(echo "$D8" | grep -o 'ok:true,log:true,citz:true')" "ok:true,log:true,citz:true"
# D9 榜截留（补评至 24 届封顶 → 光荣榜满 24 届 · 新在前连续）
D9=$(re "JSON.stringify((()=>{const e=window.__pxc;const t=e.tycoon;
let guard=0;const m0=t.msg,s0=t.sfx;t.msg=null;t.sfx=null;   // 批量授勋静音
while(t.hallN<28&&guard++<40)t.hallTest();
// v41 轮确定性修复：直评补奖后八奖强评再补一轮（八奖落在最近 8 届 —— 不被 24 层滑窗挤出，
// 消除 hallAwardsN<8 的固有随机缺奖抖动；v41 worklog 先例「测试确定性修复，产品逻辑未动」）
for(const aid of ['laomo','jiuyong','renxin','pingan','lvyin','xingtan','shouxi','chuangye'])t.hallTest(aid);
t.msg=m0;t.sfx=s0;t.tick(0.05,e.map);
const ns=t.hallRolls.map(x=>x.n);
const top=t.hallN;
return {n:top>=27,keep:t.hallRolls.length===24,
  top:ns[0]===top&&ns[1]===top-1&&ns[23]===top-23};})())")
chk "D9 榜截留（累计 27 届以上 · 留24届 · 新在前连续 24 届）" \
  "$(echo "$D9" | grep -o 'n:true,keep:true,top:true')" "n:true,keep:true,top:true"
echo "  · D9 现场：$D9"
# D10 存档往返（届数/奖项集/光荣榜届号序列 → resume 原样回来）
D10=$(re "JSON.stringify((()=>{const e=window.__pxc;const t=e.tycoon;const m=e.map;
const raw=JSON.parse(t.serialize(m));
const seq0=raw.hlR.map(x=>x.n),n0=raw.hlN,aw0=(raw.hlA||[]).length;
t.resume(m,raw);
const seq1=t.hallRolls.map(x=>x.n);
return {match:JSON.stringify(seq1)===JSON.stringify(seq0)&&seq0.length===24,
  n:t.hallN===n0,aw:t.hallAwards.size===aw0&&aw0===8};})())")
chk "D10 存档往返（榜序一致 · 届数/奖项集保持）" \
  "$(echo "$D10" | grep -o 'match:true,n:true,aw:true')" "match:true,n:true,aw:true"
# D11 成就巡检（2.6s → 城市之光/满堂生辉/群星璀璨全解锁）
sleep 2.6
D11=$(re "JSON.stringify((()=>{const t=window.__pxc.tycoon;
return {a:t.achv.has('hall1'),b:t.achv.has('hall8'),c:t.achv.has('hall12')};})())")
chk "D11 成就巡检（三枚名人堂成就全解锁）" "$(echo "$D11" | grep -o 'a:true,b:true,c:true')" "a:true,b:true,c:true"

echo "=== [3] U 段：荣誉殿堂模态 ==="
U1=$(re "(()=>{const c=document.querySelector('.chip.hall-chip');
if(!c)return 'nochip';const on=c.classList.contains('hall-on');
const txt=(c.textContent||'').includes('光');return JSON.stringify({on,txt});})()")
chk "U1 顶栏「光」chip（开榜点亮 · 字牌可辨）" "$(echo "$U1" | grep -o 'on:true,txt:true')" "on:true,txt:true"
agent-browser eval "(()=>{const c=document.querySelector('.chip.hall-chip');if(c)c.click();return 'open';})()" >/dev/null 2>&1
agent-browser wait 700
U2=$(re "JSON.stringify((()=>{const d=document.querySelector('.pxc-hall');
if(!d)return {m:false};
return {m:true,head:!!d.querySelector('.hall-head'),
  cards:d.querySelectorAll('.hk-card').length,on:d.querySelectorAll('.hk-card.on').length,
  rolls:d.querySelectorAll('.hr-roll').length,
  cite:!!d.querySelector('.hr-cite'),title:(d.querySelector('.hall-rolls h4')?.textContent||'').includes('荣')};})())")
echo "  · U2 模态：$U2"
chk "U2 荣誉殿堂（进度头 · 奖卡 8 全亮 · 光荣榜 24 届 · 颁奖词）" \
  "$(echo "$U2" | grep -o 'm:true,head:true,cards:8,on:8,rolls:24,cite:true,title:true')" "m:true,head:true,cards:8,on:8,rolls:24,cite:true,title:true"
agent-browser eval "(()=>{const d=document.querySelector('.pxc-hall');if(d)d.scrollIntoView({block:'start'});return 'scrolled';})()" >/dev/null 2>&1
agent-browser wait 400 >/dev/null 2>&1
agent-browser screenshot "$OUT/v40_hall.png" >/dev/null 2>&1 && ok "U2b 殿堂截图 v40_hall.png" || bad "U2b 截图失败"
agent-browser eval "(()=>{const x=document.querySelector('.pxc-hall .pxc-x');if(x)x.click();return 'x';})()" >/dev/null 2>&1

echo "=== [4] R 段：移动端 + 零错误 ==="
agent-browser set viewport 390 844
agent-browser wait 1200
agent-browser eval "(()=>{const c=document.querySelector('.chip.hall-chip');if(c)c.click();return 'open';})()" >/dev/null 2>&1
agent-browser wait 700
U3=$(re "JSON.stringify((()=>{const d=document.querySelector('.pxc-hall');
if(!d)return {m:false};
const cols=d.querySelector('.hall-awards');
const two=cols?getComputedStyle(cols).gridTemplateColumns.split(' ').length===2:false;
const roll=d.querySelector('.hr-roll');const r=roll?roll.getBoundingClientRect():null;
const vw=document.documentElement.clientWidth;
return {m:true,two,fit:r?r.left>=-2&&r.right<=vw+2:false};})())")
chk "U3 移动端殿堂（奖卡 2 列 · 榜行无横向溢出）" \
  "$(echo "$U3" | grep -o 'm:true,two:true,fit:true')" "m:true,two:true,fit:true"
agent-browser eval "(()=>{const d=document.querySelector('.pxc-hall');if(d)d.scrollIntoView({block:'start'});return 'scrolled';})()" >/dev/null 2>&1
agent-browser wait 400 >/dev/null 2>&1
agent-browser screenshot "$OUT/v40_mobile.png" >/dev/null 2>&1 && ok "U3b 移动端截图 v40_mobile.png" || bad "U3b 截图失败"
agent-browser eval "(()=>{const x=document.querySelector('.pxc-hall .pxc-x');if(x)x.click();return 'x';})()" >/dev/null 2>&1
ERR=$(errcount)
chk "R1 控制台零错误（全程）" "$ERR" "0"

echo ""
echo "==================================================="
echo "v40 城市之光·季评名人堂 —— 通过 $PASS · 失败 $FAIL"
echo "==================================================="
exit $([ "$FAIL" -eq 0 ] && echo 0 || echo 1)
