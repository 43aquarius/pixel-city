#!/bin/bash
# ============================================================
# v30_browser_test.sh — 书信合集「见字如面」端到端验证
# 增量 = citizens.ts（MailArc 归档 + MAIL_CATS 四类 + catOfSubject 主题映射
#   + MAIL_SUBJECT_TOTAL=11 图鉴口径 + archiveLetter 送信即归档（上限 240）
#   + anthView 四类计数/去重主题/已回数 + anthSubjects 成就口径
#   + replyLetter 回信同步归档 + buildLetter ov 覆写 + forceLetter(subj) 指定主题
#   + CitzCtx.day 开埠天数 + serialize/restore 全套（旧档空册兼容）
#   ）+ tycoon.ts（ctx 传 day + view.anth + 成就「鱼雁往还」anth11 + anthView 包装）
#   + PixelCity（信箱底部「书信合集」入口 + 合集模态：题签统计/进度条/分类签/
#   卡片墙四色边条/详情页回信存档/未回注脚 + 移动端单列）
# S 段：bun 直测纯函数（主题映射/兜底/图鉴口径/视图统计/去重/上限/清洗恢复/成就定义）
# D 段：真实归档流（新档空册/送信双入册/回信同步/指定主题/满箱挤出永存/分类求和/集齐成就）
# U 段：合集 UI（入口/模态/题签统计/分类签过滤/卡片墙/详情/回信存档/移动端单列）
# R 段：存档往返（归档/回信/集齐不回退）+ 旧档兼容直测 + 双端截图
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

echo "=== [S] 纯函数直测（bun：catOfSubject / MAIL_SUBJECT_TOTAL / anthView / 上限 / 恢复清洗） ==="
S=$(cd /home/z/my-project && bun -e '
import { CitizenRegistry, catOfSubject, MAIL_CATS, MAIL_SUBJECT_TOTAL, type MailArc, type Letter } from "./src/lib/pixelcity/citizens.ts";
import { ACHIEVEMENTS } from "./src/lib/pixelcity/tycoon.ts";
const SUBJECTS: Array<[string, string]> = [
  ["市长，米缸见底了", "民生"], ["关于这个月的税单", "民生"], ["日子有点紧，想跟您聊聊", "民生"],
  ["大火那晚，吓坏了", "灾警"], ["铺子遭了贼", "灾警"], ["疫病过去之后", "灾警"],
  ["谢谢这座好城", "颂声"], ["这阵子街上真热闹", "颂声"],
  ["一条小建议", "见闻"], ["巷口见闻", "见闻"], ["新邻居来打听", "见闻"],
];
const arc = (id: number, nm: string, sj: string, cat: string, day: number, rp: number, rl = "", rt = ""): MailArc =>
  ({ id, nm, look: id % 14, body: 0, role: 0, sj, tx: "正文" + id, cat, day, rp, rl, rt });
const r1 = new CitizenRegistry();
r1.anth.push(arc(3, "赵四", SUBJECTS[0][0], "民生", 2, -1), arc(2, "钱五", SUBJECTS[3][0], "灾警", 3, 0, "承诺增设巡防", "已把新交番列入建设计划"),
  arc(1, "孙六", SUBJECTS[6][0], "颂声", 5, 1, "随信赠小礼", "随信附上纪念明信片一套"));
const v1 = r1.anthView();
const r2 = new CitizenRegistry();
const mkL = (id: number): Letter => ({ id, from: 0, fromName: "市民", look: 0, body: 0, role: 0, subject: "巷口见闻", text: "正文" + id, opts: [{ label: "a", dm: 0, reply: "r" }], read: false, replied: -1, t: 0 });
for (let i = 0; i < 250; i++) (r2 as unknown as { archiveLetter: (l: Letter, d: number) => void }).archiveLetter(mkL(i + 1), 1);
const r3 = new CitizenRegistry();
r3.restore({ roster: [], anth: [
  [1, "张三", 0, 0, 0, "谢谢这座好城", "正文一", "颂声", 2, 0, "亲笔回信", "好"],
  [2, "李四", 0, 0, 0, "", "", "见闻", 1, -1, "", ""],
  [3], ["bad"], [4, "王五", 0, 0, 0, "巷口见闻", "正文四", "乱写的", 0, 5, "超长".repeat(30), "回".repeat(80)],
] as unknown[] });
const a11 = ACHIEVEMENTS.find(a => a.id === "anth11");
console.log(JSON.stringify({
  m: SUBJECTS.every(([sj, cat]) => catOfSubject(sj) === cat),
  fb: catOfSubject("乱写的") === "见闻",
  tot: MAIL_SUBJECT_TOTAL,
  cats: MAIL_CATS.join(","),
  n: v1.n, rep: v1.replied, sub: v1.subjects, st: v1.subjTotal,
  c0: v1.cats[0].n, c1: v1.cats[1].n, c2: v1.cats[2].n, c3: v1.cats[3].n,
  ord: v1.items[0].id + "," + v1.items[2].id,
  cap: r2.anth.length, capOld: r2.anth[0].id, capNew: r2.anth[r2.anth.length - 1].id,
  rn: r3.anth.length, r0rp: r3.anth[0]?.rp, r0day: r3.anth[0]?.day,
  r2cat: r3.anth[1]?.cat, r2rl: (r3.anth[1]?.rl ?? "").length, r2rt: (r3.anth[1]?.rt ?? "").length,
  ach: a11 ? a11.goal + "," + a11.name : "none",
}));' 2>&1 | tail -1 | stripq)
chk "S1 十一主题全映射（民生3/灾警3/颂声2/见闻3）" "$(echo "$S" | grep -o 'm:true')" "m:true"
chk "S2 未知主题兜底见闻" "$(echo "$S" | grep -o 'fb:true')" "fb:true"
chk "S3 图鉴口径 11" "$(echo "$S" | grep -o 'tot:11')" "tot:11"
chk "S4 四类题签词序" "$(echo "$S" | grep -o 'cats:民生,灾警,颂声,见闻')" "cats:民生,灾警,颂声,见闻"
chk "S5 合集视图统计（n3/回2/主题3/口径11）" "$(echo "$S" | grep -o 'n:3,rep:2,sub:3,st:11')" "n:3,rep:2,sub:3,st:11"
chk "S6 四类计数（1/1/1/0）" "$(echo "$S" | grep -o 'c0:1,c1:1,c2:1,c3:0')" "c0:1,c1:1,c2:1,c3:0"
chk "S7 新信在前（1→3 倒序）" "$(echo "$S" | grep -o 'ord:1,3')" "ord:1,3"
chk "S8 上限 240 挤最旧" "$(echo "$S" | grep -o 'cap:240,capOld:11,capNew:250')" "cap:240,capOld:11,capNew:250"
chk "S9 恢复清洗（短条/坏条丢弃 · rp 钳制 · cat 重校 · 批24/回60）" "$(echo "$S" | grep -o 'rn:2,r0rp:0,r0day:2,r2cat:见闻,r2rl:24,r2rt:60')" "rn:2,r0rp:0,r0day:2,r2cat:见闻,r2rl:24,r2rt:60"
chk "S10 成就鱼雁往还（goal 11 · 在册）" "$(echo "$S" | grep -o 'ach:11,鱼雁往还')" "ach:11,鱼雁往还"

echo "=== [1] 桌面端 1440×900 新档开局 ==="
agent-browser close >/dev/null 2>&1; sleep 1
agent-browser set viewport 1440 900
agent-browser open $B
agent-browser storage local clear >/dev/null 2>&1
agent-browser reload
agent-browser wait --fn "window.__pxc!==undefined" --timeout 90000 && ok "引擎就绪" || bad "引擎超时"
agent-browser wait 3000
agent-browser eval "(()=>{const b=[...document.querySelectorAll('button')].filter(x=>(x.textContent||'').includes('跳过'));if(b.length)b[b.length-1].click();return 'tut';})()" >/dev/null 2>&1
# 冻结随机信件/生活事件/生日巡检（D 段全走 forceLetter 确定性送信）
agent-browser eval "(()=>{const c=window.__pxc.tycoon.citz;c.mailTimer=99999;c.evTimer=99999;c.bdayTimer=99999;return 'frozen';})()" >/dev/null 2>&1
# 人口脉冲 → 落户市民（写信人）
agent-browser eval "(()=>{const t=window.__pxc.tycoon;let iv=null;iv=setInterval(()=>{t.pop=Math.min(64,t.pop+4)},250);setTimeout(()=>clearInterval(iv),2600);return 'pulsing';})()" >/dev/null 2>&1
agent-browser wait 4500
CN=$(agent-browser eval "window.__pxc.tycoon.citz.roster.length" 2>/dev/null | tail -1 | tr -d '"')
if [ "${CN:-0}" -ge 3 ] 2>/dev/null; then ok "在册市民 ≥ 3 ($CN)"; else bad "在册市民不足 ($CN)"; fi

echo "=== [2] D 段：真实归档叙事流 ==="
D1=$(re "JSON.stringify((()=>{const t=window.__pxc.tycoon;const a=t.citz.anthView();
return {n:a.n,sub:a.subjects,rep:a.replied};})())")
chk "D1 新档空册（0 归档 · 0 主题 · 0 已回）" "$(echo "$D1" | grep -o 'n:0,sub:0,rep:0')" "n:0,sub:0,rep:0"
# D2 送信双入册：信箱 + 合集同号同帧；day 字段记录开埠天
D2=$(re "JSON.stringify((()=>{const e=window.__pxc;const t=e.tycoon;
const L=t.citz.forceLetter('市长，米缸见底了');
if(!L)return {f:'none'};
const inBox=t.citz.mailView().letters.some(l=>l.id===L.id);
const A=t.citz.anthView().items.find(x=>x.id===L.id);
return {f:L.subject,inBox,arc:!!A,sj:A?A.sj:'',cat:A?A.cat:'',day:A?A.day:0,rp:A?A.rp:-2};})())")
chk "D2 指定主题送信（饥荒分支必中）" "$(echo "$D2" | grep -o "f:市长，米缸见底了,inBox:true")" "f:市长，米缸见底了,inBox:true"
chk "D2b 归档同帧落册（主题/分类/待回）" "$(echo "$D2" | grep -o 'arc:true,sj:市长，米缸见底了,cat:民生,day:1,rp:-1')" "arc:true,sj:市长，米缸见底了,cat:民生,day:1,rp:-1"
# D3 回信同步：信箱 replied 与归档 rl/rt 同帧一致
D3=$(re "JSON.stringify((()=>{const e=window.__pxc;const t=e.tycoon;
const L=t.citz.letters[0];const id=L.id;
const r=t.citz.replyLetter(id,1);
const A=t.citz.anthView().items.find(x=>x.id===id);
const inBox=t.citz.mailView().letters.find(l=>l.id===id);
return {ok:r.ok,rp:A?A.rp:-2,rl:A?A.rl:'',rt:(A?A.rt:'').length>4,
  boxRep:inBox?inBox.replied:-2,repN:t.citz.anthView().replied};})())")
chk "D3 回信同步归档（rp/批语/文案/信箱一致/已回计数1）" "$(echo "$D3" | grep -o 'ok:true,rp:1,rl:建议各家互助,rt:true,boxRep:1,repN:1')" "ok:true,rp:1,rl:建议各家互助,rt:true,boxRep:1,repN:1"
# D4 满箱挤出永存：8 封全读 → 强送第 9 封 → 计时器再送 → 最旧已读被挤出信箱，但合集 11 封俱在
D4=$(re "JSON.stringify((()=>{const e=window.__pxc;const t=e.tycoon;const c=t.citz;
const ev=c.letters[0].id;   // 最旧一封（D2 米缸）：markRead 后必被挤出
const subj=['谢谢这座好城','一条小建议','巷口见闻','大火那晚，吓坏了','疫病过去之后','这阵子街上真热闹','日子有点紧，想跟您聊聊','铺子遭了贼','关于这个月的税单'];
const forced=[];
for(const s of subj){const L=c.forceLetter(s);if(L)forced.push(L.id);}
for(const l of c.letters)c.markRead(l.id);
c.mailTimer=0.01;
t.tick(0.05,e.map);
const boxIds=new Set(c.mailView().letters.map(l=>l.id));
const anthIds=new Set(c.anthView().items.map(x=>x.id));
return {forced:forced.length,gone:!boxIds.has(ev),kept:anthIds.has(ev),
  an:c.anthView().n,bx:c.mailView().letters.length,
  repOk:(c.anthView().items.find(x=>x.id===ev)?.rl||'')!==''};})())")
chk "D4 挤出旧信永存合集（箱失册存 · 11 归档 · 回信注记仍在）" "$(echo "$D4" | grep -o 'forced:9,gone:true,kept:true,an:11,bx:10,repOk:true')" "forced:9,gone:true,kept:true,an:11,bx:10,repOk:true"
# D5 四类计数求和 = 总数
D5=$(re "JSON.stringify((()=>{const a=window.__pxc.tycoon.citz.anthView();
return {sum:a.cats.reduce((s,c)=>s+c.n,0),n:a.n};})())")
chk "D5 分类求和守恒" "$(echo "$D5" | grep -o 'sum:11,n:11')" "sum:11,n:11"
# D6 集齐十一主题 → 成就「鱼雁往还」
D6=$(re "JSON.stringify((()=>{const e=window.__pxc;const t=e.tycoon;const c=t.citz;
const all=['市长，米缸见底了','关于这个月的税单','大火那晚，吓坏了','铺子遭了贼','疫病过去之后','谢谢这座好城','这阵子街上真热闹','日子有点紧，想跟您聊聊','一条小建议','巷口见闻','新邻居来打听'];
let miss='';
for(const s of all){const L=c.forceLetter(s);if(!L&&c.anthView().items.every(x=>x.sj!==s)){miss=s;break;}}
t.achvTimer=0.01;t.tick(0.05,e.map);   // 成就检查每 2 秒一轮 → 钉计时器立即评估
const a=c.anthView();
return {sub:a.subjects,st:a.subjTotal,miss,ach:t.achv.has('anth11')};})())")
chk "D6 十一主题集齐 + 成就落袋" "$(echo "$D6" | grep -o 'sub:11,st:11,miss:,ach:true')" "sub:11,st:11,miss:,ach:true"

echo "=== [3] U 段：合集 UI ==="
# U1 信箱底部「书信合集」入口
agent-browser eval "(()=>{const b=[...document.querySelectorAll('button.chip')].find(x=>(x.getAttribute('title')||'').includes('市长信箱'));b.click();return 'm';})()" >/dev/null 2>&1
agent-browser wait 600
U1=$(re "JSON.stringify((()=>{const b=[...document.querySelectorAll('.pxc-mail .pxc-btn')].find(x=>(x.textContent||'').includes('书信合集'));
return {has:!!b,ic:!!(b&&b.querySelector('img'))};})())")
chk "U1 信箱底行入口（卷轴图标 · 书信合集）" "$(echo "$U1" | grep -o 'has:true,ic:true')" "has:true,ic:true"
# U2 点开合集模态
agent-browser eval "(()=>{const b=[...document.querySelectorAll('.pxc-mail .pxc-btn')].find(x=>(x.textContent||'').includes('书信合集'));b.click();return 'a';})()" >/dev/null 2>&1
agent-browser wait 600
U2=$(re "JSON.stringify((()=>{
  const m=document.querySelector('.pxc-anth');
  return {m:!!m,head:m?.querySelector('header')?.textContent.replace(/\s/g,'').includes('书信合集'),
    stats:!!document.querySelector('.an-stats'),prog:!!document.querySelector('.an-prog i')};})())")
chk "U2 模态挂载（标题 · 题签统计 · 进度条）" "$(echo "$U2" | grep -o 'm:true,head:true,stats:true,prog:true')" "m:true,head:true,stats:true,prog:true"
# U3 题签统计与进度宽度（22 封 · 主题 11/11 = 100%）
U3=$(re "JSON.stringify((()=>{
  const st=document.querySelector('.an-stats');
  const bar=document.querySelector('.an-prog i');
  return {txt:st?.textContent.replace(/\s/g,'').includes('主题拾遗11/11'),
    w:bar?bar.style.width:'-',mail:st?.textContent.includes('市民来信')};})())")
chk "U3 统计行（主题 11/11 · 进度 100% · 来信计数）" "$(echo "$U3" | grep -o 'txt:true,w:100%,mail:true')" "txt:true,w:100%,mail:true"
# U4 分类签（五枚 + 计数）：先点击再等渲染，后断言（React 批量更新需跨 eval）
U4a=$(re "JSON.stringify((()=>{const chips=[...document.querySelectorAll('.an-chip')];
return {n:chips.length,nil:!chips.find(c=>c.textContent.startsWith('民生'))?.classList.contains('nil')};})())")
agent-browser eval "(()=>{[...document.querySelectorAll('.an-chip')].find(c=>c.textContent.startsWith('灾警'))?.click();return 'f';})()" >/dev/null 2>&1
agent-browser wait 500
U4b=$(re "JSON.stringify((()=>{const chips=[...document.querySelectorAll('.an-chip')];
const cards=[...document.querySelectorAll('.an-card')];
return {on:chips.find(c=>c.classList.contains('on'))?.textContent.startsWith('灾警'),
  all:cards.length>0&&cards.every(c=>c.getAttribute('data-cat')==='灾警')};})())")
chk "U4 分类签五枚 + 民生有信不灰" "$(echo "$U4a" | grep -o 'n:5,nil:true')" "n:5,nil:true"
chk "U4b 灾警过滤纯色" "$(echo "$U4b" | grep -o 'on:true,all:true')" "on:true,all:true"
# U5 卡片墙 → 详情页：先点击已回信卡片，等渲染后断言
agent-browser eval "(()=>{[...document.querySelectorAll('.an-chip')].find(c=>c.textContent.startsWith('全部'))?.click();return 'b';})()" >/dev/null 2>&1
agent-browser wait 400
agent-browser eval "(()=>{const cards=[...document.querySelectorAll('.an-card')];
const ok=cards.find(c=>c.querySelector('.an-seal')?.textContent==='已回')||cards[0];ok.click();return 'c';})()" >/dev/null 2>&1
agent-browser wait 500
U5=$(re "JSON.stringify((()=>{
  const rd=document.querySelector('.an-read');
  return {rd:!!rd,sj:rd?.querySelector('.mr-meta b')?.textContent.length>1,
    tx:rd?.querySelector('.mr-text')?.textContent.length>6,
    rep:rd?.querySelector('.mr-reply')?.textContent.length>2,
    back:rd?.querySelector('.pxc-btn')?.textContent.includes('返回合集')};})())")
chk "U5 详情页（主题/正文/回信文案/返回）" "$(echo "$U5" | grep -o 'rd:true,sj:true,tx:true,rep:true,back:true')" "rd:true,sj:true,tx:true,rep:true,back:true"
# U5b 返回卡片墙
agent-browser eval "(()=>{[...document.querySelectorAll('.an-read .pxc-btn')].find(b=>b.textContent.includes('返回合集'))?.click();return 'r';})()" >/dev/null 2>&1
agent-browser wait 400
U5b=$(re "JSON.stringify((()=>{return {grid:document.querySelectorAll('.an-card').length>0,rd:!document.querySelector('.an-read')};})())")
chk "U5b 返回卡片墙" "$(echo "$U5b" | grep -o 'grid:true,rd:true')" "grid:true,rd:true"
# U6 未回信详情（虚线注脚）：先返回卡片墙，点击未回卡片，等渲染后断言
agent-browser eval "(()=>{[...document.querySelectorAll('.an-read .pxc-btn')].find(b=>b.textContent.includes('返回合集'))?.click();return 'r';})()" >/dev/null 2>&1
agent-browser wait 400
agent-browser eval "(()=>{const un=[...document.querySelectorAll('.an-card')].find(c=>c.querySelector('.an-seal')?.textContent==='未回');if(un)un.click();return 'c';})()" >/dev/null 2>&1
agent-browser wait 500
U6=$(re "JSON.stringify((()=>{
  const rd=document.querySelector('.an-read');
  return {u:rd?'ok':'none',no:!!rd?.querySelector('.an-noreply'),seal:rd?.querySelector('.an-seal')?.textContent};})())")
chk "U6 未回信注脚（这封信没能等到回信）" "$(echo "$U6" | grep -o "u:ok,no:true,seal:未回")" "u:ok,no:true,seal:未回"
agent-browser eval "(()=>{[...document.querySelectorAll('.an-read .pxc-btn')].find(b=>b.textContent.includes('返回合集'))?.click();return 'r';})()" >/dev/null 2>&1
# U7 底部快捷行（市长信箱 / 市民列传）
U7=$(re "JSON.stringify((()=>{
  const btns=[...document.querySelectorAll('.pxc-anth .pxc-row .pxc-btn')].map(b=>b.textContent);
  return {mail:btns.some(t=>t.includes('市长信箱')),citz:btns.some(t=>t.includes('市民列传'))};})())")
chk "U7 底部快捷行互跳" "$(echo "$U7" | grep -o 'mail:true,citz:true')" "mail:true,citz:true"

echo "=== [4] R 段：存档往返 + 双端截图 ==="
R0=$(re "JSON.stringify((()=>{const a=window.__pxc.tycoon.citz.anthView();
return {n:a.n,rep:a.replied,sub:a.subjects,first:a.items[a.items.length-1]?.id,rl:a.items[a.items.length-1]?.rl||'-'};})())")
RN=$(echo "$R0" | grep -o 'n:[0-9]*' | cut -d: -f2)
RREP=$(echo "$R0" | grep -o 'rep:[0-9]*' | cut -d: -f2)
RSUB=$(echo "$R0" | grep -o 'sub:[0-9]*' | cut -d: -f2)
echo "  · R0 存档前快照：$R0"
re "JSON.stringify((()=>{window.__pxc.tycoon.save(window.__pxc.map);return 'saved';})())" >/dev/null
# R1 桌面截图（卡片墙 · 100% 集齐进度）
agent-browser screenshot $OUT/v30_anth_desktop.png >/dev/null && ok "截图 v30_anth_desktop.png（桌面 · 合集卡片墙）"
# R2 存档往返
agent-browser reload >/dev/null 2>&1
agent-browser wait --fn "window.__pxc!==undefined" --timeout 90000 >/dev/null 2>&1
agent-browser wait 3000
agent-browser eval "(()=>{const b=[...document.querySelectorAll('button')].filter(x=>(x.textContent||'').includes('跳过'));if(b.length)b[b.length-1].click();return 'tut';})()" >/dev/null 2>&1
R2=$(re "JSON.stringify((()=>{const c=window.__pxc.tycoon.citz;const a=c.anthView();
return {n:a.n,rep:a.replied,sub:a.subjects,firstId:!!a.items.find(x=>x.id===c.anth[0]?.id)};})())")
chk "R2 归档往返（${RN} 封 · 已回 ${RREP} · 主题 ${RSUB} · 末条在册）" "$(echo "$R2" | grep -o "n:$RN,rep:$RREP,sub:$RSUB,firstId:true")" "n:$RN,rep:$RREP,sub:$RSUB,firstId:true"
# R3 详情再开（回信存档随档）：重开信箱→合集→点击已回卡片→等渲染→断言
agent-browser eval "(()=>{const b=[...document.querySelectorAll('button.chip')].find(x=>(x.getAttribute('title')||'').includes('市长信箱'));b.click();return 'm';})()" >/dev/null 2>&1
agent-browser wait 500
agent-browser eval "(()=>{const b=[...document.querySelectorAll('.pxc-mail .pxc-btn')].find(x=>(x.textContent||'').includes('书信合集'));b.click();return 'a';})()" >/dev/null 2>&1
agent-browser wait 600
agent-browser eval "(()=>{const ok=[...document.querySelectorAll('.an-card')].find(c=>c.querySelector('.an-seal')?.textContent==='已回');if(ok)ok.click();return 'c';})()" >/dev/null 2>&1
agent-browser wait 500
R3b=$(re "JSON.stringify((()=>{
  const rd=document.querySelector('.an-read');
  return {r:rd?'ok':'none',rep:rd?.querySelector('.mr-reply')?.textContent.length>2};})())")
chk "R3 读档后回信存档可再读" "$(echo "$R3b" | grep -o 'r:ok,rep:true')" "r:ok,rep:true"
agent-browser screenshot $OUT/v30_anth_detail.png >/dev/null && ok "截图 v30_anth_detail.png（桌面 · 详情回信存档）"
ERR=$(errcount)
chk "R4 控制台零错误" "${ERR:-x}" "0"
# R5 移动端合集（近全宽 · 单列）：先回卡片墙再断言栅格列数
agent-browser set viewport 390 844
agent-browser wait 1200
agent-browser eval "(()=>{[...document.querySelectorAll('.an-read .pxc-btn')].find(b=>b.textContent.includes('返回合集'))?.click();return 'r';})()" >/dev/null 2>&1
agent-browser wait 500
R5=$(re "JSON.stringify((()=>{
  const m=document.querySelector('.pxc-anth');
  const g=document.querySelector('.an-grid');
  const w=m?getComputedStyle(m).width:'-';
  const cols=g?getComputedStyle(g).gridTemplateColumns.split(' ').length:0;
  return {m:!!m,w,cols};})())")
chk "R5 移动端挂载（近全宽 · 单列）" "$(echo "$R5" | grep -o 'm:true,w:376px,cols:1')" "m:true,w:376px,cols:1"
agent-browser screenshot $OUT/v30_anth_mobile.png >/dev/null && ok "截图 v30_anth_mobile.png（移动端 · 合集单列）"
agent-browser close >/dev/null 2>&1

echo ""
echo "=========================================="
echo "v30 结果：$PASS 通过 / $FAIL 失败"
[ "$FAIL" -eq 0 ] && echo "全部通过 ✅" || echo "存在失败 ❌"
exit $FAIL
