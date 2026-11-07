#!/bin/bash
# ============================================================
# v28_browser_test.sh — 星霜纪程「大事年表」端到端验证
# 增量 = chronicle.ts ChronEntry.h 游戏时锚点（旧档回退当日正午）+ eraBandsOf/timelineOf/
#   densityOf 纯函数（小时轴）+ ChronCat 'rev'
#   + tycoon.ts 城事回望（每 12 游戏时一季一篇：季节开头语/人口增减/新屋/府库/本期大事；
#     跳档不回补——下期阈值跳到下一个 12h 整点）+ 序列化 revN/revNext/revLast
#   + PixelCity 城史长卷新增「大事年表」横轴总览（卷/表切换 · 纪元带 · 四色点阵 ·
#     日轴刻度 · 密度条 · 悬停卡 · 点点跳卷闪亮）+ 编年史模态筛选「回望」
# S 段：bun 直测纯函数（小时轴纪元带 / 车道叠点 / 密度直方 / h 回退 / rev 不开新卷）
# D 段：真实回望叙事流（首期/四连跃迁各带一期/两期间新屋/夏去/秋来流走；回望条目一律 reverse-find，防随机事件同期落笔在后）
# U 段：年表 UI（切表 → 纪元带 → 四色点 → 刻度密度 → 悬停卡 → 跳卷闪亮 → 检索联动）
# R 段：存档往返（回望状态不丢不重）+ 双端截图
# ============================================================
set -u
B=http://localhost:3000
OUT=/home/z/my-project/scripts
PASS=0; FAIL=0
ok()   { echo "  ✓ $1"; PASS=$((PASS+1)); }
bad()  { echo "  ✗ $1"; FAIL=$((FAIL+1)); }
chk()  { if [ "$2" = "$3" ]; then ok "$1 ($2)"; else bad "$1 (got=$2 want=$3)"; fi }
chkge() { if [ "${2%.*}" -ge "$3" ] 2>/dev/null; then ok "$1 ($2 >= $3)"; else bad "$1 (got=$2 want>=$3)"; fi }
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

echo "=== [S] 纯函数直测（bun：eraBandsOf / timelineOf / densityOf / hOf） ==="
S=$(cd /home/z/my-project && bun -e '
import { eraBandsOf, timelineOf, densityOf, chaptersOf, hOf } from "./src/lib/pixelcity/chronicle.ts";
const mk = (id, h, day, cat, tone, title) => ({ id, day, h, cat, tone, icon: "book", title, text: title + "。" });
const es = [
  mk(1, 0, 1, "era", "big", "开埠建城"),
  mk(2, 6, 1, "mile", "good", "百户灯火"),
  mk(3, 36, 2, "era", "big", "迈入「炊烟村庄」"),
  mk(4, 40, 2, "event", "bad", "火灾"),
  mk(5, 60, 3, "era", "big", "迈入「市井小镇」"),
  mk(6, 84, 4, "tech", "good", "文明进阶"),
  mk(7, 96, 4, "rev", "info", "城事回望 · 第 1 期"),
];
const noH = { id: 8, day: 3, cat: "mile", tone: "good", icon: "book", title: "旧档笔", text: "旧档笔。" };
const bands = eraBandsOf(es, 100);
const tl = timelineOf(es, 0, 100, 0.05);
const dens = densityOf(es, 0, 100, 4);
const ch = chaptersOf(es);
const revChap = ch[ch.length - 1];
console.log(JSON.stringify({
  bn: bands.length,
  b0: bands[0].era + ":" + bands[0].from + "-" + bands[0].to,
  b1: bands[1].era + ":" + bands[1].from + "-" + bands[1].to,
  b2: bands[2].era + ":" + bands[2].from + "-" + bands[2].to,
  lanes: tl.lanes,
  seq: tl.dots.map(d => d.lane).join(","),
  x36: tl.dots[2].x,
  dens: dens.join(","),
  empty: eraBandsOf([], 10).length,
  lastTo: eraBandsOf(es, 130)[2].to,
  revChapN: revChap.entries.length, revChapHas: revChap.entries.some(x => x.cat === "rev"),
  hFall: hOf(noH), hNew: hOf(es[0]),
}));' 2>&1 | tail -1 | stripq)
chk "S1 纪元带切分 3 带（开埠/炊烟/市井）" "$(echo "$S" | grep -o 'bn:3' | head -1)" "bn:3"
chk "S2 带边界（小时轴：跃迁锚点归新带首，末带延伸 toH）" "$(echo "$S" | grep -o 'b0:0:0-35.99,b1:1:36-59.99,b2:2:60-100')" "b0:0:0-35.99,b1:1:36-59.99,b2:2:60-100"
chk "S3 车道叠点（过近两笔分道，lanes=2）" "$(echo "$S" | grep -o 'lanes:2,seq:0,0,0,1,0,0,0')" "lanes:2,seq:0,0,0,1,0,0,0"
chk "S4 轴上位置分数（h36 → x=0.36）" "$(echo "$S" | grep -o 'x36:0.36')" "x36:0.36"
chk "S5 密度直方（4 桶 → 2,2,1,2）" "$(echo "$S" | grep -o 'dens:2,2,1,2')" "dens:2,2,1,2"
chk "S6 空册空带" "$(echo "$S" | grep -o 'empty:0')" "empty:0"
chk "S7 toH 超末笔时末带延伸（130）" "$(echo "$S" | grep -o 'lastTo:130')" "lastTo:130"
chk "S8 回望纪事不开新卷（归当前卷）" "$(echo "$S" | grep -o 'revChapN:3,revChapHas:true')" "revChapN:3,revChapHas:true"
chk "S9 h 回退（旧档 day3 → 60h 正午；新档 h0 原样）" "$(echo "$S" | grep -o 'hFall:60,hNew:0')" "hFall:60,hNew:0"

echo "=== [1] 桌面端 1440×900 新档开局 ==="
agent-browser close >/dev/null 2>&1; sleep 1
agent-browser set viewport 1440 900
agent-browser open $B
agent-browser storage local clear >/dev/null 2>&1
agent-browser reload
agent-browser wait --fn "window.__pxc!==undefined" --timeout 90000 && ok "引擎就绪" || bad "引擎超时"
agent-browser wait 3000
agent-browser eval "(()=>{const b=[...document.querySelectorAll('button')].filter(x=>(x.textContent||'').includes('跳过'));if(b.length)b[b.length-1].click();return 'tut';})()" >/dev/null 2>&1

echo "=== [2] D 段：真实回望叙事流 ==="
D1=$(re "JSON.stringify((()=>{const t=window.__pxc.tycoon;
return {next:t.revNext,n:t.revN,last:t.revLast===null,
  revN:t.chron.entries.filter(x=>x.cat==='rev').length};})())")
chk "D1 新档回望状态（首期在第 12 游戏时）" "$(echo "$D1" | grep -o 'next:12,n:0,last:true,revN:0')" "next:12,n:0,last:true,revN:0"
# D2 首期：夏初落笔回望刚过去的春——首期回顾开埠以来，大事=开埠建城
D2=$(re "JSON.stringify((()=>{const e=window.__pxc;const t=e.tycoon;
t.season=1;t.gHours=11.9;t.tick(0.05,e.map);
const mid=t.chron.entries.filter(x=>x.cat==='rev').length;
t.gHours=12;t.tick(0.05,e.map);
const r=[...t.chron.entries].reverse().find(x=>x.cat==='rev');
return {mid,next:t.revNext,n:t.revN,
  cat:r.cat,tone:r.tone,title:r.title,day:r.day,h:r.h,
  spring:r.text.includes('春事了'),flat:r.text.includes('人口不增不减'),
  coins:r.text.includes('府库结余'),spot:r.text.includes('「开埠建城」')};})())")
chk "D2a 12 时前不落笔（11.9 时零回望）" "$(echo "$D2" | grep -o 'mid:0')" "mid:0"
chk "D2b 首期入册（rev/info/城事回望·第1期/第1天/h=12）" "$(echo "$D2" | grep -o 'cat:rev,tone:info,title:城事回望·第1期,day:1,h:12')" "cat:rev,tone:info,title:城事回望·第1期,day:1,h:12"
chk "D2c 首期文案（春事了 + 人口不增不减 + 府库 + 大事开埠建城）" "$(echo "$D2" | grep -o 'spring:true,flat:true,coins:true,spot:true')" "spring:true,flat:true,coins:true,spot:true"
chk "D2d 阈值推进（next→24 · revN=1）" "$(echo "$D2" | grep -o 'next:24,n:1')" "next:24,n:1"
# D3 垫容量 + 人口四连跃迁：每档游戏时 +30（跃迁在年表上自然拉开；跳档不回补，每档恰一期回望）
D3=$(re "JSON.stringify((()=>{const e=window.__pxc;const t=e.tycoon;
t.season=1;
const scan=(id)=>{for(let y=118;y<=152;y++)for(let x=100;x<=160;x++)if(e.map.place(id,0,x,y))return true;return false;};
let ap=0;while(ap<32){if(!scan('apartment'))break;ap++;}
const want=[[50,'炊烟村庄'],[150,'市井小镇'],[400,'一方城市'],[1000,'摩登都会']];
const got=[];const revs=[];
for(const [p,name] of want){
  t.gHours+=30;
  for(let k=0;k<8;k++){
    t.pop=p+15;t.tick(0.05,e.map);
    if(t.chron.view().entries.some(x=>x.title.includes('「'+name+'」')&&x.cat==='era'))break;
  }
  got.push(t.chron.view().entries.some(x=>x.title.includes('「'+name+'」')&&x.cat==='era')?1:0);
  revs.push(t.revN);
}
const es=t.chron.view().entries;
const lastRev=[...es].reverse().find(x=>x.cat==='rev');
return {g:got.join(''),era:t.chron.view().eraName,cap:t.view().cap,
  revN:t.revN,revs:revs.join(','),
  spring:lastRev.text.includes('春事了'),
  spot:lastRev.text.includes('「迈入「摩登都会」」')||lastRev.text.includes('迈入「摩登都会」'),
  grow:(()=>{const m=lastRev.text.match(/人口添了\s*([0-9]+)\s*口/);return m?m[1]:'-';})(),
  bld:lastRev.text.includes('栋新屋')};})())")
chk "D3a 人口推纪元四连跃迁" "$(echo "$D3" | grep -o 'g:1111')" "g:1111"
chk "D3b 当前纪元 = 摩登都会" "$(echo "$D3" | grep -o 'era:摩登都会')" "era:摩登都会"
chkge "D3c 容量垫高（cap≥1180）" "$(echo "$D3" | grep -o 'cap:[0-9]*' | cut -d: -f2)" "1180"
chk "D3d 跳档不回补（四档各一期：1+4=5）" "$(echo "$D3" | grep -o 'revN:5')" "revN:5"
chk "D3e 末档回望引「迈入「摩登都会」」为大事" "$(echo "$D3" | grep -o 'spot:true')" "spot:true"
chkge "D3f 末档人口添丁入文（≥500 口）" "$(echo "$D3" | grep -o 'grow:[0-9]*' | cut -d: -f2)" "500"
# （新屋入文断言移 D4c：两期之间真放 5 栋公寓后确定性成文）
# D4 第六期：夏去（蝉声歇了）+ 两期间真放 5 栋新屋 → 「栋新屋」确定性入文
D4=$(re "JSON.stringify((()=>{const e=window.__pxc;const t=e.tycoon;
const scan=(id)=>{for(let y=118;y<=152;y++)for(let x=100;x<=160;x++)if(e.map.place(id,0,x,y))return true;return false;};
let ap2=0;while(ap2<5){if(!scan('apartment'))break;ap2++;}
t.season=2;t.gHours=150;t.tick(0.05,e.map);
const r=[...t.chron.entries].reverse().find(x=>x.cat==='rev');
const m=r.text.match(/城里起了\s*([0-9]+)\s*栋新屋/);
return {n:t.revN,title:r.title,summer:r.text.includes('蝉声歇了'),isRev:r.cat==='rev',
  next:t.revNext,bld:m?m[1]:'-'};})())")
chk "D4a 第六期入册（夏去 · 蝉声歇了）" "$(echo "$D4" | grep -o 'n:6,title:城事回望·第6期,summer:true,isRev:true')" "n:6,title:城事回望·第6期,summer:true,isRev:true"
chk "D4b 跳档阈值跳整点（150 → next 156）" "$(echo "$D4" | grep -o 'next:156')" "next:156"
chkge "D4c 本期新屋入文（两期间新起 ≥1 栋）" "$(echo "$D4" | grep -o 'bld:[0-9]*' | cut -d: -f2)" "1"
# D5 第七期：人口回落 → 「人口流走」+ 秋收入仓
D5=$(re "JSON.stringify((()=>{const e=window.__pxc;const t=e.tycoon;
t.pop=800;t.season=3;t.gHours=168;t.tick(0.05,e.map);
const r=[...t.chron.entries].reverse().find(x=>x.cat==='rev');
return {n:t.revN,title:r.title,autumn:r.text.includes('秋收入仓'),
  lost:(()=>{const m=r.text.match(/人口流走\s*([0-9]+)\s*口/);return m?m[1]:'-';})()};})())")
chk "D5a 第七期入册（第 7 期 · 秋收入仓）" "$(echo "$D5" | grep -o 'n:7,title:城事回望·第7期,autumn:true')" "n:7,title:城事回望·第7期,autumn:true"
chkge "D5b 人口流走入文（≥200 口）" "$(echo "$D5" | grep -o 'lost:[0-9]*' | cut -d: -f2)" "200"
# D6 模态「回望」筛选芯片
agent-browser eval "(()=>{const bs=[...document.querySelectorAll('button.chip')].filter(x=>(x.getAttribute('title')||'').includes('编年史'));if(bs.length)bs[0].click();return 'open';})()" >/dev/null 2>&1
agent-browser wait 600
D6=$(re "JSON.stringify((()=>{
  const chips=[...document.querySelectorAll('.cf-chip')];
  const rev=chips.find(c=>c.textContent.startsWith('回望'));
  return {has:!!rev,txt:rev?rev.textContent:'-',
    revInAll:[...document.querySelectorAll('.cl-e')].some(x=>x.textContent.includes('城事回望'))};})())")
chk "D6a 模态筛选新增「回望」芯片（带计数）" "$(echo "$D6" | grep -o 'has:true,txt:回望·7')" "has:true,txt:回望·7"
chk "D6b 全部视图含回望纪事" "$(echo "$D6" | grep -o 'revInAll:true')" "revInAll:true"
agent-browser eval "(()=>{const c=[...document.querySelectorAll('.cf-chip')].find(x=>x.textContent.startsWith('回望'));if(c)c.click();return 'f';})()" >/dev/null 2>&1
agent-browser wait 400
D6B=$(re "JSON.stringify((()=>{const es=[...document.querySelectorAll('.cl-e')];
return {n:es.length,allRev:es.every(x=>x.textContent.includes('城事回望'))};})())")
chk "D6c 回望筛选只列回望纪事（7 笔）" "$(echo "$D6B" | grep -o 'n:7,allRev:true')" "n:7,allRev:true"
agent-browser eval "(()=>{document.querySelector('.pxc-x')?.click();return 'c';})()" >/dev/null 2>&1

echo "=== [3] U 段：大事年表 UI ==="
# U1 编年史模态 → 长卷入口 → tabs
agent-browser eval "(()=>{const bs=[...document.querySelectorAll('button.chip')].filter(x=>(x.getAttribute('title')||'').includes('编年史'));bs[0].click();return 'open';})()" >/dev/null 2>&1
agent-browser wait 600
agent-browser eval "(()=>{document.querySelector('.cw-open-btn').click();return 'wide';})()" >/dev/null 2>&1
agent-browser wait 700
U1=$(re "JSON.stringify((()=>{
  const tabs=[...document.querySelectorAll('.cw-tab')];
  return {n:tabs.length,txt:tabs.map(t=>t.textContent).join(','),
    on:tabs[0].classList.contains('on'),
    nav:!!document.querySelector('.cw-nav'),tl:!!document.querySelector('.cw-tl')};})())")
chk "U1a 卷/表双 tab（分卷长卷 + 大事年表）" "$(echo "$U1" | grep -o 'n:2,txt:分卷长卷,大事年表')" "n:2,txt:分卷长卷,大事年表"
chk "U1b 开卷默认分卷长卷（nav 在 · 年表未挂载）" "$(echo "$U1" | grep -o 'on:true,nav:true,tl:false')" "on:true,nav:true,tl:false"
# U2 切到年表
agent-browser eval "(()=>{const t=[...document.querySelectorAll('.cw-tab')].find(x=>x.textContent.includes('大事年表'));t.click();return 'tl';})()" >/dev/null 2>&1
agent-browser wait 500
U2=$(re "JSON.stringify((()=>{
  const dots=[...document.querySelectorAll('.cw-dot')];
  const eng=window.__pxc.tycoon.chron.view();
  return {tl:!!document.querySelector('.cw-tl'),nav:!!document.querySelector('.cw-nav'),
    scroll:!!document.querySelector('.cw-tl-scroll'),
    dots:dots.length,eng:eng.n,
    rev:dots.filter(d=>d.classList.contains('rev')).length};})())")
chk "U2a 年表挂载（nav 收起 · 横向滚动容器在）" "$(echo "$U2" | grep -o 'tl:true,nav:false,scroll:true')" "tl:true,nav:false,scroll:true"
chk "U2b 点数与引擎在册一致" "$(echo "$U2" | grep -o 'dots:[0-9]*' | cut -d: -f2)" "$(echo "$U2" | grep -o 'eng:[0-9]*' | cut -d: -f2)"
chk "U2c 回望点为圆环样式（7 枚）" "$(echo "$U2" | grep -o 'rev:7')" "rev:7"
# U3 纪元带 5 带（小时轴拉开后各带不叠）
U3=$(re "JSON.stringify((()=>{
  const bs=[...document.querySelectorAll('.cw-band')];
  const r0=bs.map(b=>b.getBoundingClientRect());
  let noOverlap=true;
  for(let i=1;i<r0.length;i++) if(r0[i].left < r0[i-1].left+8) noOverlap=false;
  return {n:bs.length,
    names:bs.map(b=>b.querySelector('b')?b.querySelector('b').textContent:'').join(','),
    alt:bs.filter(b=>b.classList.contains('alt')).length,
    noOverlap};})())")
chk "U3a 纪元带 5 带按序" "$(echo "$U3" | grep -o 'names:拓荒营地,炊烟村庄,市井小镇,一方城市,摩登都会')" "names:拓荒营地,炊烟村庄,市井小镇,一方城市,摩登都会"
chk "U3b 交替底色（alt=2）" "$(echo "$U3" | grep -o 'alt:2')" "alt:2"
chk "U3c 五带不重叠（左缘递进）" "$(echo "$U3" | grep -o 'noOverlap:true')" "noOverlap:true"
# U4 四色点 + 计数守恒
U4=$(re "JSON.stringify((()=>{
  const dots=[...document.querySelectorAll('.cw-dot')];
  const c=k=>dots.filter(d=>d.classList.contains(k)).length;
  return {gd:c('good'),bd:c('bad'),bg:c('big'),inf:c('info'),
    sum:c('good')+c('bad')+c('big')+c('info'),total:dots.length};})())")
chk "U4a 四色点计数守恒" "$(echo "$U4" | grep -o 'sum:[0-9]*' | cut -d: -f2)" "$(echo "$U4" | grep -o 'total:[0-9]*' | cut -d: -f2)"
chkge "U4b 喜事点（≥1）" "$(echo "$U4" | grep -o 'gd:[0-9]*' | cut -d: -f2)" "1"
chkge "U4c 大事点（≥5：开埠+四跃迁）" "$(echo "$U4" | grep -o 'bg:[0-9]*' | cut -d: -f2)" "5"
# U5 题签统计行
U5=$(re "JSON.stringify((()=>{
  const sub=document.querySelector('.cw-sub').textContent;
  return {tl:sub.includes('大事年表'),n:sub.includes('笔纪事'),peak:sub.includes('最密'),
    day:sub.includes('开埠第')};})())")
chk "U5 年表题签（笔数/天数/最密时段）" "$(echo "$U5" | grep -o 'tl:true,n:true,peak:true,day:true')" "tl:true,n:true,peak:true,day:true"
# U6 日轴刻度（每天 24h 一刻度，单调递增）
U6=$(re "JSON.stringify((()=>{
  const ticks=[...document.querySelectorAll('.cw-tick')];
  const nums=ticks.map(t=>parseInt(t.textContent.replace(/[^0-9]/g,'')));
  let mono=true; for(let i=1;i<nums.length;i++) if(nums[i]<=nums[i-1]) mono=false;
  return {n:ticks.length,first:ticks[0]?ticks[0].textContent:'',
    mono,last:ticks[ticks.length-1]?ticks[ticks.length-1].textContent:''};})())")
chkge "U6a 日轴刻度（≥4 个）" "$(echo "$U6" | grep -o 'n:[0-9]*' | cut -d: -f2)" "4"
chk "U6b 首刻度 = 第1天" "$(echo "$U6" | grep -o 'first:第1天')" "first:第1天"
chk "U6c 刻度单调递增" "$(echo "$U6" | grep -o 'mono:true')" "mono:true"
# U7 密度条 48 桶
U7=$(re "JSON.stringify((()=>{
  const ds=[...document.querySelectorAll('.cw-dens i')];
  return {n:ds.length,nonZero:ds.filter(d=>parseInt(d.style.height)>0).length};})())")
chk "U7a 密度条 48 桶" "$(echo "$U7" | grep -o 'n:48')" "n:48"
chkge "U7b 有纪事的桶（≥1）" "$(echo "$U7" | grep -o 'nonZero:[0-9]*' | cut -d: -f2)" "1"
# U8 悬停卡（mouseover 派发）
U8=$(re "JSON.stringify((()=>{
  const d=document.querySelector('.cw-dot');
  d.dispatchEvent(new MouseEvent('mouseover',{bubbles:true,clientX:420,clientY:320}));
  return 'sent';})())")
agent-browser wait 300
U8B=$(re "JSON.stringify((()=>{
  const tip=document.querySelector('.cw-tip');
  return {has:!!tip,txt:tip?tip.textContent.slice(0,14):'-',
    hint:tip?tip.textContent.includes('跳到长卷'):false};})())")
chk "U8 悬停卡浮现" "$(echo "$U8B" | grep -o 'has:true')" "has:true"
chk "U8b 悬停卡含跳转引导" "$(echo "$U8B" | grep -o 'hint:true')" "hint:true"
agent-browser eval "(()=>{document.dispatchEvent(new MouseEvent('mouseover',{bubbles:true,clientX:10,clientY:10}));return 'out';})()" >/dev/null 2>&1
agent-browser wait 200
# U9 点大事点 → 跳卷闪亮（点末枚大事点「迈入摩登都会」）
U9=$(re "JSON.stringify((()=>{
  const bigs=[...document.querySelectorAll('.cw-dot.big')];
  const last=bigs[bigs.length-1];
  const id=last.getAttribute('data-id');
  last.click();
  return id;})())")
agent-browser wait 700
U9B=$(re "JSON.stringify((()=>{
  const fl=document.querySelector('.cw-e.flash');
  const r=fl?fl.getBoundingClientRect():null;
  return {fl:!!fl,id:fl?fl.getAttribute('data-id'):'-',
    mode:!!document.querySelector('.cw-nav'),tl:!!document.querySelector('.cw-tl'),
    vis:r?r.top>=0&&r.bottom<=window.innerHeight:false};})())")
chk "U9a 跳卷：年表收起回到分卷长卷" "$(echo "$U9B" | grep -o 'mode:true,tl:false')" "mode:true,tl:false"
chk "U9b 闪亮定位（data-id 对齐所点纪事）" "$(echo "$U9B" | grep -o 'id:[0-9]*' | cut -d: -f2)" "$U9"
chk "U9c 闪亮条目进入视口" "$(echo "$U9B" | grep -o 'vis:true')" "vis:true"
# U10 检索联动（年表内 dim）+ 切表清悬停卡
agent-browser eval "(()=>{const t=[...document.querySelectorAll('.cw-tab')].find(x=>x.textContent.includes('大事年表'));t.click();return 'tl';})()" >/dev/null 2>&1
agent-browser wait 500
agent-browser eval "(()=>{const inp=document.querySelector('.cw-search');
const set=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;
set.call(inp,'灯');inp.dispatchEvent(new Event('input',{bubbles:true}));return 'q';})()" >/dev/null 2>&1
agent-browser wait 500
U10=$(re "JSON.stringify((()=>{
  const dots=[...document.querySelectorAll('.cw-dot')];
  const dim=dots.filter(d=>d.classList.contains('dim')).length;
  const hit=document.querySelector('.cw-hit');
  return {total:dots.length,dim,
    hit:hit?hit.textContent:'',tip:!!document.querySelector('.cw-tip')};})())")
chkge "U10a 检索置灰无关点（dim≥1）" "$(echo "$U10" | grep -o 'dim:[0-9]*' | cut -d: -f2)" "1"
chk "U10b 命中角标展示" "$(echo "$U10" | grep -o 'hit:「灯」命中[0-9]*笔' | grep -o '命中')" "命中"
chk "U10c 切表时悬停卡已清" "$(echo "$U10" | grep -o 'tip:false')" "tip:false"
# U11 Esc 收卷 + 重开复位
agent-browser eval "(()=>{window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}));return 'esc';})()" >/dev/null 2>&1
agent-browser wait 400
U11=$(re "JSON.stringify({w:!!document.querySelector('.cw-root')})")
chk "U11a Esc 收卷" "$(echo "$U11" | grep -o 'w:false')" "w:false"
agent-browser eval "(()=>{const bs=[...document.querySelectorAll('button.chip')].filter(x=>(x.getAttribute('title')||'').includes('编年史'));bs[0].click();return 'm';})()" >/dev/null 2>&1
agent-browser wait 500
agent-browser eval "(()=>{document.querySelector('.cw-open-btn').click();return 'wide';})()" >/dev/null 2>&1
agent-browser wait 700
U11B=$(re "JSON.stringify((()=>{
  const inp=document.querySelector('.cw-search');
  return {q:inp.value,mode:!!document.querySelector('.cw-nav'),tl:!!document.querySelector('.cw-tl')};})())")
chk "U11b 重开复位（检索空 + 默认分卷长卷）" "$(echo "$U11B" | grep -o 'q:,mode:true,tl:false')" "q:,mode:true,tl:false"

echo "=== [4] R 段：存档往返 + 双端截图 ==="
R0=$(re "JSON.stringify((()=>{const t=window.__pxc.tycoon;
return {n:t.revN,next:Math.round(t.revNext),g:Math.round(t.gHours),
  rev:t.chron.entries.filter(x=>x.cat==='rev').length};})())")
RN=$(echo "$R0" | grep -o 'n:[0-9]*' | cut -d: -f2)
RREV=$(echo "$R0" | grep -o 'rev:[0-9]*' | cut -d: -f2)
RNEXT=$(echo "$R0" | grep -o 'next:[0-9]*' | cut -d: -f2)
echo "  · R0 存档前快照：$R0"
re "JSON.stringify((()=>{window.__pxc.tycoon.save(window.__pxc.map);return 'saved';})())" >/dev/null
agent-browser reload >/dev/null 2>&1
agent-browser wait --fn "window.__pxc!==undefined" --timeout 90000 >/dev/null 2>&1
agent-browser wait 3000
agent-browser eval "(()=>{const b=[...document.querySelectorAll('button')].filter(x=>(x.textContent||'').includes('跳过'));if(b.length)b[b.length-1].click();return 'tut';})()" >/dev/null 2>&1
R1=$(re "JSON.stringify((()=>{const t=window.__pxc.tycoon;
return {n:t.revN,next:Math.round(t.revNext),g:Math.round(t.gHours),
  rev:t.chron.entries.filter(x=>x.cat==='rev').length,
  hKept:t.chron.entries.every(x=>typeof x.h==='number')};})())")
chk "R1a 回望期数往返（revN=$RN）" "$(echo "$R1" | grep -o 'n:[0-9]*' | cut -d: -f2)" "$RN"
chk "R1b 阈值往返（next 不回退）" "$(echo "$R1" | grep -o 'next:[0-9]*' | cut -d: -f2)" "$RNEXT"
chk "R1c 回望纪事随档恢复（$RREV 笔，无重复）" "$(echo "$R1" | grep -o 'rev:[0-9]*' | cut -d: -f2)" "$RREV"
chk "R1d 年表锚点 h 随档保留" "$(echo "$R1" | grep -o 'hKept:true')" "hKept:true"
# R2 读档后下一期正常续写（冬去：雪化檐前）
R2=$(re "JSON.stringify((()=>{const e=window.__pxc;const t=e.tycoon;
t.season=0;t.gHours=t.revNext;t.tick(0.05,e.map);
const r=[...t.chron.entries].reverse().find(x=>x.cat==='rev');
return {n:t.revN,isRev:r.cat==='rev',winter:r.text.includes('雪化檐前')};})())")
chk "R2a 读档后第 $((RN+1)) 期正常续写" "$(echo "$R2" | grep -o 'n:[0-9]*' | cut -d: -f2)" "$((RN+1))"
chk "R2b 续写为回望纪事" "$(echo "$R2" | grep -o 'isRev:true')" "isRev:true"
chk "R2c 冬去文案（雪化檐前）" "$(echo "$R2" | grep -o 'winter:true')" "winter:true"
# R3 读档后长卷年表可用
agent-browser eval "(()=>{const bs=[...document.querySelectorAll('button.chip')].filter(x=>(x.getAttribute('title')||'').includes('编年史'));bs[0].click();return 'm';})()" >/dev/null 2>&1
agent-browser wait 500
agent-browser eval "(()=>{document.querySelector('.cw-open-btn').click();return 'wide';})()" >/dev/null 2>&1
agent-browser wait 700
agent-browser eval "(()=>{const t=[...document.querySelectorAll('.cw-tab')].find(x=>x.textContent.includes('大事年表'));t.click();return 'tl';})()" >/dev/null 2>&1
agent-browser wait 600
R3=$(re "JSON.stringify((()=>{
  const dots=[...document.querySelectorAll('.cw-dot')];
  const eng=window.__pxc.tycoon.chron.view();
  return {tl:!!document.querySelector('.cw-tl'),dots:dots.length,eng:eng.n,
    rev:dots.filter(d=>d.classList.contains('rev')).length};})())")
chk "R3a 读档后年表挂载" "$(echo "$R3" | grep -o 'tl:true')" "tl:true"
chk "R3b 点数与引擎一致（含新续写一期）" "$(echo "$R3" | grep -o 'dots:[0-9]*' | cut -d: -f2)" "$(echo "$R3" | grep -o 'eng:[0-9]*' | cut -d: -f2)"
chk "R3c 回望点 $((RREV+1)) 枚" "$(echo "$R3" | grep -o 'rev:[0-9]*' | cut -d: -f2)" "$((RREV+1))"
agent-browser screenshot $OUT/v28_tl_desktop.png >/dev/null && ok "截图 v28_tl_desktop.png（桌面 · 大事年表）"
ERR=$(errcount)
chk "R3d 控制台零错误" "${ERR:-x}" "0"
# R4 移动端年表（先在普通点上派发 mouseover 制造悬停态，再验证 CSS：点放大 / 悬停卡隐藏）
agent-browser set viewport 390 844
agent-browser wait 1200
agent-browser eval "(()=>{const d=document.querySelector('.cw-dot:not(.big):not(.rev)')||document.querySelector('.cw-dot');d.dispatchEvent(new MouseEvent('mouseover',{bubbles:true,clientX:80,clientY:200}));return 'hov';})()" >/dev/null 2>&1
agent-browser wait 300
R4=$(re "JSON.stringify((()=>{
  const tab=[...document.querySelectorAll('.cw-tab')].find(t=>t.textContent.includes('大事年表'));
  const dot=document.querySelector('.cw-dot:not(.big):not(.rev)');
  const tip=document.querySelector('.cw-tip');
  return {tab:!!tab,dot:dot?getComputedStyle(dot).width:'-',
    tipIn:!!tip,tip:tip?getComputedStyle(tip).display:'-',
    inner:!!document.querySelector('.cw-tl-inner')};})())")
chk "R4a 移动端 tab 可用" "$(echo "$R4" | grep -o 'tab:true')" "tab:true"
chk "R4b 点放大便于点按（11px）" "$(echo "$R4" | grep -o 'dot:11px')" "dot:11px"
chk "R4c 移动端悬停卡隐藏（悬停态在档仍 display:none）" "$(echo "$R4" | grep -o 'tipIn:true,tip:none')" "tipIn:true,tip:none"
agent-browser screenshot $OUT/v28_tl_mobile.png >/dev/null && ok "截图 v28_tl_mobile.png（移动端 · 大事年表）"
agent-browser close >/dev/null 2>&1

echo ""
echo "===== 结果：PASS=$PASS FAIL=$FAIL ====="
[ $FAIL -eq 0 ] && echo "ALL GREEN" || echo "HAS FAILURES"
exit $FAIL
