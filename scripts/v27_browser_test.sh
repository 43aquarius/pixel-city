#!/bin/bash
# ============================================================
# v27_browser_test.sh — 城史长卷「全景编年史阅读页」端到端验证
# 增量 = chronicle.ts chaptersOf/statsOf/volName 纯函数 + ERAS[0] 开埠卷首语
#   + PixelCity 全屏立轴长卷（按纪元分卷阅读 · 卷目导航 · 关键字检索 · Esc 收卷）
#   + 编年史模态「城史长卷 · 全景阅读」入口 + pixelcity.css .cw-* 纸卷美学
# S 段：bun 直测纯函数（分卷边界 / 开埠建城不误开新卷 / statsOf 计数）
# D 段：真实叙事流（人口推纪元跃迁 4 连 + 里程碑 + 火灾事件入册）
# U 段：长卷 UI（入口 → 分卷渲染 → 顺序/色调 → 导航跳转高亮 → 检索 → Esc → 重开复位）
# R 段：存档往返 + 零错误 + 双端截图
# ============================================================
set -u
B=http://localhost:3000
OUT=/home/z/my-project/scripts
PASS=0; FAIL=0
ok()   { echo "  ✓ $1"; PASS=$((PASS+1)); }
bad()  { echo "  ✗ $1"; FAIL=$((FAIL+1)); }
chk()  { if [ "$2" = "$3" ]; then ok "$1 ($2)"; else bad "$1 (got=$2 want=$3)"; fi }
chkge() { if [ "${2%.*}" -ge "$3" ] 2>/dev/null; then ok "$1 ($2 >= $3)"; else bad "$1 (got=$2 want>=$3)"; fi }
chkgt() { if [ "${2%.*}" -gt "$3" ] 2>/dev/null; then ok "$1 ($2 > $3)"; else bad "$1 (got=$2 want>$3)"; fi }
chklt() { if [ "${2%.*}" -lt "$3" ] 2>/dev/null; then ok "$1 ($2 < $3)"; else bad "$1 (got=$2 want<$3)"; fi }
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

echo "=== [S] 纯函数直测（bun：chaptersOf / statsOf / volName） ==="
S=$(cd /home/z/my-project && bun -e '
import { chaptersOf, statsOf, volName } from "./src/lib/pixelcity/chronicle.ts";
const mk = (id, day, cat, tone, title) => ({ id, day, cat, tone, icon: "book", title, text: title + "。" });
const es = [
  mk(1, 1, "era", "big", "开埠建城"),
  mk(2, 2, "mile", "good", "百户灯火"),
  mk(3, 9, "era", "big", "迈入「炊烟村庄」"),
  mk(4, 10, "event", "bad", "火灾"),
  mk(5, 20, "era", "big", "迈入「市井小镇」"),
  mk(6, 21, "tech", "good", "文明进阶"),
  mk(7, 30, "era", "info", "旧卷续写"),
];
const ch = chaptersOf(es);
const st = statsOf(es);
console.log(JSON.stringify({
  n: ch.length,
  e0: ch[0].era, c0: ch[0].entries.length, f0: ch[0].fromDay, t0: ch[0].toDay, first0: ch[0].entries[0].title,
  e1: ch[1].era, c1: ch[1].entries.length, first1: ch[1].entries[0].title, last1: ch[1].entries[1].title,
  e2: ch[2].era, c2: ch[2].entries.length, first2: ch[2].entries[0].title, last2: ch[2].entries[ch[2].entries.length-1].title,
  g: st.good, bd: st.bad, bg: st.big, inf: st.info, span: st.span,
  v0: volName(0), v4: volName(4), v10: volName(10),
  empty: chaptersOf([]).length,
}));' 2>&1 | tail -1 | stripq)
chk "S1 分卷数（开埠+两次跃迁=3卷）" "$(echo "$S" | grep -o '[{]n:[0-9]*' | cut -d: -f2)" "3"
chk "S2 开埠卷归置（era0·2笔·第1-2天·首笔开埠建城）" "$(echo "$S" | grep -o 'e0:0,c0:2,f0:1,t0:2,first0:开埠建城')" "e0:0,c0:2,f0:1,t0:2,first0:开埠建城"
chk "S3 跃迁笔归新卷（era1·2笔·首笔迈入炊烟村庄·末笔火灾）" "$(echo "$S" | grep -o 'e1:1,c1:2,first1:迈入「炊烟村庄」,last1:火灾')" "e1:1,c1:2,first1:迈入「炊烟村庄」,last1:火灾"
chk "S4 旧卷续写不误开卷（era2·3笔·含info纪事）" "$(echo "$S" | grep -o 'e2:2,c2:3,first2:迈入「市井小镇」,last2:旧卷续写')" "e2:2,c2:3,first2:迈入「市井小镇」,last2:旧卷续写"
chk "S5 statsOf（喜2 忧1 大事3 政务1 跨度29天）" "$(echo "$S" | grep -o 'g:2,bd:1,bg:3,inf:1,span:29')" "g:2,bd:1,bg:3,inf:1,span:29"
chk "S6 volName 汉字卷号（一/五/11 越界回退）" "$(echo "$S" | grep -o 'v0:一,v4:五,v10:11')" "v0:一,v4:五,v10:11"
chk "S7 空册空卷" "$(echo "$S" | grep -o 'empty:0')" "empty:0"

echo "=== [1] 桌面端 1440×900 新档开局 ==="
agent-browser close >/dev/null 2>&1; sleep 1
agent-browser set viewport 1440 900
agent-browser open $B
agent-browser storage local clear >/dev/null 2>&1
agent-browser reload
agent-browser wait --fn "window.__pxc!==undefined" --timeout 90000 && ok "引擎就绪" || bad "引擎超时"
agent-browser wait 3000
agent-browser eval "(()=>{const b=[...document.querySelectorAll('button')].filter(x=>(x.textContent||'').includes('跳过'));if(b.length)b[b.length-1].click();return 'tut';})()" >/dev/null 2>&1

echo "=== [2] D 段：真实叙事流（纪元四连跃迁 + 里程碑 + 火灾 + 长卷填充） ==="
D1=$(re "JSON.stringify((()=>{const t=window.__pxc.tycoon;const v=t.chron.view();
return {n:v.n,first:v.entries[0]?v.entries[0].title:'-',tone:v.entries[0]?v.entries[0].tone:'-'};})())")
chk "D1 开档首笔 = 开埠建城（era/big）" "$(echo "$D1" | grep -o 'first:开埠建城,tone:big')" "first:开埠建城,tone:big"
# D2：垫容量（固定 32 栋公寓，cap≥1344）→ 人口推纪元四连跃迁（阈值+15 冗余）→ 温室保粮
#     注：view() 读的是上次 tick 的快照（snap），直接放置不会刷新统计；
#     容量不垫则 pop>cap 按 8%/秒回流，1000 阈永远够不着且已跃纪元还会回落
D2=$(re "JSON.stringify((()=>{const e=window.__pxc;const t=e.tycoon;
t.level=9;t.coins=99999;t.eventTimer=9999;
const scan=(id)=>{for(let y=118;y<=152;y++)for(let x=100;x<=160;x++)if(e.map.place(id,0,x,y))return true;return false;};
let ap=0;
while(ap<32){if(!scan('apartment'))break;ap++;}
const want=[[50,'炊烟村庄'],[150,'市井小镇'],[400,'一方城市'],[1000,'摩登都会']];
const got=[];
for(const [p,name] of want){
  for(let k=0;k<8;k++){
    t.pop=p+15;t.tick(0.05,e.map);
    if(t.chron.view().entries.some(x=>x.title.includes('「'+name+'」')&&x.cat==='era'))break;
  }
  got.push(t.chron.view().entries.some(x=>x.title.includes('「'+name+'」')&&x.cat==='era')?1:0);
}
// 温室保粮：按容量口径算最坏耗粮（pop 会向 cap 生长），放完 tick 一拍刷新快照再读数
const v1=t.view();
const need=Math.ceil((v1.cap*0.045*1.15+2)/5);
let gh=0;
while(gh<need&&gh<40){if(!scan('greenhouse'))break;gh++;}
t.tick(0.05,e.map);
const v=t.view();
return {g:got.join(''),era:v.chron.eraName,cap:v.cap,ap,gh,fp:v.foodProd,fe:Math.round(v.foodEat)};})())")
chk "D2 纪元四连跃迁全部入册" "$(echo "$D2" | grep -o 'g:1111')" "g:1111"
chk "D3 当前纪元 = 摩登都会" "$(echo "$D2" | grep -o 'era:摩登都会')" "era:摩登都会"
chkge "D3b 容量垫高（cap≥1180，人口驻留 1000+）" "$(echo "$D2" | grep -o 'cap:[0-9]*' | cut -d: -f2)" "1180"
chkge "D3c 温室保粮（foodProd≥foodEat）" "$(echo "$D2" | grep -o 'fp:[0-9]*' | cut -d: -f2)" "$(echo "$D2" | grep -o 'fe:[0-9]*' | cut -d: -f2)"
# D4：里程碑 + 火灾事件入册
D4=$(re "JSON.stringify((()=>{const e=window.__pxc;const t=e.tycoon;
const n0=t.chron.view().n;
const fire=t.forceEvent('fire',e.map);
const v=t.chron.view();
return {fire,n0,n1:v.n,
  mile:v.entries.some(x=>x.title==='百户灯火'),
  fireE:v.entries.some(x=>x.title==='火灾'&&x.tone==='bad'),
  day:v.entries[v.entries.length-1].day};})())")
chk "D4a forceEvent 火灾触发成功" "$(echo "$D4" | grep -o 'fire:true')" "fire:true"
chk "D4b 火灾入册（bad）" "$(echo "$D4" | grep -o 'fireE:true')" "fireE:true"
chk "D4c 人口里程碑百户灯火入册" "$(echo "$D4" | grep -o 'mile:true')" "mile:true"
chkge "D4d 编年史累计生长（n0≥8）" "$(echo "$D4" | grep -o 'n0:[0-9]*' | cut -d: -f2)" "8"
# D5：长卷填充（34 笔市井琐事，验滚动导航的信息量基础；文本避开「灯」字免串检索断言）
D5=$(re "JSON.stringify((()=>{const t=window.__pxc.tycoon;
const ts=['市井杂闻','街巷小记','闾里轶事','商户近况'];
const tx=['街口的茶馆换了新幌子，说书先生讲的是邻城的新闻。',
 '清晨的集市上，鱼贩的吆喝声比鸡鸣还早。',
 '孩子们在巷口跳格子，惊起一排晒太阳的猫。',
 '货车碾过石板路，车夫哼着跑了调的小曲。',
 '裁缝铺进了新料子，隔着半条街都闻见浆洗的味道。',
 '邮差的车铃摇过，家家户户探出头来等信。'];
for(let i=0;i<34;i++){
  t.chron.write('mile','info','flag',ts[i%4]+'·'+(i+1),tx[i%6],t.gHours+(i+1)*24);
}
return {pad:t.chron.view().n};})())")
chkge "D5 长卷填充入册（≥40 笔）" "$(echo "$D5" | grep -o 'pad:[0-9]*' | cut -d: -f2)" "40"

echo "=== [3] U 段：长卷 UI ==="
# U1：编年史模态（按 title 精确找入口芯片）→ 长卷入口按钮
agent-browser eval "(()=>{const bs=[...document.querySelectorAll('button.chip')].filter(x=>(x.getAttribute('title')||'').includes('编年史'));if(!bs.length)return 'nochip';bs[0].click();return 'open';})()" >/dev/null 2>&1
agent-browser wait 600
U1=$(re "JSON.stringify({m:!!document.querySelector('[aria-label=城市编年史]'),btn:!!document.querySelector('.cw-open-btn')})")
chk "U1 编年史模态打开 + 长卷入口可见" "$(echo "$U1" | grep -o 'm:true,btn:true')" "m:true,btn:true"
agent-browser eval "(()=>{document.querySelector('.cw-open-btn').click();return 'wide';})()" >/dev/null 2>&1
agent-browser wait 700
U2=$(re "JSON.stringify({w:!!document.querySelector('.cw-root'),m:!!document.querySelector('[aria-label=城市编年史]'),sc:!!document.querySelector('.cw-scroll')})")
chk "U2 长卷展开 + 模态收起" "$(echo "$U2" | grep -o 'w:true,m:false')" "w:true,m:false"
# U3：卷目导航（5 卷 + 汉字卷号 + 纪元名序）
U3=$(re "JSON.stringify((()=>{
  const chips=[...document.querySelectorAll('.cw-chip')];
  return {n:chips.length,
    vols:chips.map(c=>c.querySelector('b').textContent).join(','),
    names:chips.map(c=>c.querySelector('span').textContent).join(','),
    on0:chips[0].classList.contains('on')};})())")
chk "U3a 卷目导航 5 卷" "$(echo "$U3" | grep -o 'n:5')" "n:5"
chk "U3b 汉字卷号 一至五" "$(echo "$U3" | grep -o 'vols:第一卷,第二卷,第三卷,第四卷,第五卷')" "vols:第一卷,第二卷,第三卷,第四卷,第五卷"
chk "U3c 纪元名按序" "$(echo "$U3" | grep -o 'names:拓荒营地,炊烟村庄,市井小镇,一方城市,摩登都会')" "names:拓荒营地,炊烟村庄,市井小镇,一方城市,摩登都会"
chk "U3d 开卷高亮第一卷" "$(echo "$U3" | grep -o 'on0:true')" "on0:true"
# U4：题签统计行 + 分卷卷首
U4=$(re "JSON.stringify((()=>{
  const sub=document.querySelector('.cw-sub').textContent;
  const names=[...document.querySelectorAll('.cw-chap-name')].map(x=>x.textContent);
  const opens=[...document.querySelectorAll('.cw-chap-open')].map(x=>x.textContent);
  const lastHead=[...document.querySelectorAll('.cw-chap-head')].pop().textContent;
  return {era:sub.includes('摩登都会'),day:sub.includes('开埠第'),tot:sub.includes('累计落笔'),
    n:names.length,f0:opens[0].includes('旗杆'),f1:opens[1].includes('定居者'),
    wip:lastHead.includes('未完待续')};})())")
chk "U4a 题签统计（纪元/天数/累计）" "$(echo "$U4" | grep -o 'era:true,day:true,tot:true')" "era:true,day:true,tot:true"
chk "U4b 五卷卷名" "$(echo "$U4" | grep -o 'n:5')" "n:5"
chk "U4c 卷首语（开埠旗杆 + 定居者炊烟）" "$(echo "$U4" | grep -o 'f0:true,f1:true')" "f0:true,f1:true"
chk "U4d 末卷标注未完待续" "$(echo "$U4" | grep -o 'wip:true')" "wip:true"
# U5：阅读顺序（旧→新 天数单调不减）+ 条目总数对齐引擎 + 色调分布
U5=$(re "JSON.stringify((()=>{
  const days=[...document.querySelectorAll('.cw-day')].map(x=>+x.textContent.replace(/[^0-9]/g,''));
  let mono=true; for(let i=1;i<days.length;i++) if(days[i]<days[i-1]) mono=false;
  const es=[...document.querySelectorAll('.cw-e')];
  const tone=n=>es.filter(x=>x.classList.contains(n)).length;
  const eng=window.__pxc.tycoon.chron.view();
  return {mono,total:es.length,eng:eng.n,
    sum:tone('good')+tone('bad')+tone('big')+tone('info'),
    g:tone('good'),b:tone('bad'),big:tone('big'),
    first:document.querySelector('.cw-e .cw-tx b').textContent};})())")
chk "U5a 长卷阅读顺序天数单调不减" "$(echo "$U5" | grep -o 'mono:true')" "mono:true"
chk "U5b 条目总数与引擎在册一致" "$(echo "$U5" | grep -o 'eng:[0-9]*' | cut -d: -f2)" "$(echo "$U5" | grep -o 'total:[0-9]*' | cut -d: -f2)"
chk "U5c 四色条目计数守恒" "$(echo "$U5" | grep -o 'sum:[0-9]*' | cut -d: -f2)" "$(echo "$U5" | grep -o 'total:[0-9]*' | cut -d: -f2)"
chkge "U5d 灾祸入卷（bad≥1）" "$(echo "$U5" | grep -o 'b:[0-9]*' | cut -d: -f2)" "1"
chkge "U5e 大事记入卷（big≥5：开埠+四跃迁）" "$(echo "$U5" | grep -o 'big:[0-9]*' | cut -d: -f2)" "5"
chk "U5f 卷首第一笔 = 开埠建城" "$(echo "$U5" | grep -o 'first:开埠建城')" "first:开埠建城"
# U6：导航跳转（末卷）+ 滚动联动高亮
agent-browser eval "(()=>{const c=[...document.querySelectorAll('.cw-chip')];c[c.length-1].click();return 'jump';})()" >/dev/null 2>&1
agent-browser wait 1100
U6=$(re "JSON.stringify((()=>{
  const sc=document.querySelector('.cw-scroll');
  const on=[...document.querySelectorAll('.cw-chip')].findIndex(c=>c.classList.contains('on'));
  const chaps=[...document.querySelectorAll('.cw-chap')];
  const lastChap=chaps[chaps.length-1];
  return {top:Math.round(sc.scrollTop),on,
    near:lastChap.getBoundingClientRect().top<200,
    sub:document.querySelector('.cw-sub').textContent.includes('读至第五卷')};})())")
chkgt "U6a 跳转滚动生效" "$(echo "$U6" | grep -o 'top:[0-9]*' | cut -d: -f2)" "100"
chk "U6b 高亮随滚动切到第五卷" "$(echo "$U6" | grep -o 'on:4')" "on:4"
chk "U6c 末卷卷首抵达视口" "$(echo "$U6" | grep -o 'near:true')" "near:true"
chk "U6d 题签读至第五卷" "$(echo "$U6" | grep -o 'sub:true')" "sub:true"
# U7：检索「灯」（标题/正文匹配 + 空卷隐藏 + 命中计数）
U7=$(re "JSON.stringify((()=>{
  const inp=document.querySelector('.cw-search');
  const set=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;
  set.call(inp,'灯'); inp.dispatchEvent(new Event('input',{bubbles:true}));
  return 'typed';})())")
agent-browser wait 500
U7B=$(re "JSON.stringify((()=>{
  const es=[...document.querySelectorAll('.cw-e')];
  const chaps=[...document.querySelectorAll('.cw-chap')];
  const hit=document.querySelector('.cw-hit');
  return {n:es.length,
    allHit:es.every(x=>x.textContent.includes('灯')),
    chaps:chaps.length,
    hitTxt:hit?hit.textContent:'-',
    dim:[...document.querySelectorAll('.cw-chip.dim')].length};})())")
chk "U7a 检索只留含「灯」纪事" "$(echo "$U7B" | grep -o 'allHit:true')" "allHit:true"
chk "U7b 命中计数展示" "$(echo "$U7B" | grep -o 'hitTxt:「灯」命中[0-9]*笔' | grep -o '命中')" "命中"
chkge "U7c 检索后仍有命中条目" "$(echo "$U7B" | grep -o 'n:[0-9]*' | cut -d: -f2)" "1"
chklt "U7d 无关空卷隐藏（卷数<5）" "$(echo "$U7B" | grep -o 'chaps:[0-9]*' | cut -d: -f2)" "5"
chkge "U7e 空卷导航置灰" "$(echo "$U7B" | grep -o 'dim:[0-9]*' | cut -d: -f2)" "1"
# U8：清空检索复原
agent-browser eval "(()=>{const inp=document.querySelector('.cw-search');
const set=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;
set.call(inp,''); inp.dispatchEvent(new Event('input',{bubbles:true}));return 'clear';})()" >/dev/null 2>&1
agent-browser wait 500
U8=$(re "JSON.stringify({chaps:document.querySelectorAll('.cw-chap').length,hit:!!document.querySelector('.cw-hit')})")
chk "U8 清空检索五卷复原" "$(echo "$U8" | grep -o 'chaps:5')" "chaps:5"
chk "U8b 命中角标消失" "$(echo "$U8" | grep -o 'hit:false')" "hit:false"
# U9：Esc 收卷 + U10：重开复位（检索清空 + 回到卷首）
agent-browser eval "(()=>{window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}));return 'esc';})()" >/dev/null 2>&1
agent-browser wait 400
U9=$(re "JSON.stringify({w:!!document.querySelector('.cw-root')})")
chk "U9 Esc 收卷" "$(echo "$U9" | grep -o 'w:false')" "w:false"
agent-browser eval "(()=>{const bs=[...document.querySelectorAll('button.chip')].filter(x=>(x.getAttribute('title')||'').includes('编年史'));bs[0].click();return 'm';})()" >/dev/null 2>&1
agent-browser wait 500
agent-browser eval "(()=>{document.querySelector('.cw-open-btn').click();return 'wide';})()" >/dev/null 2>&1
agent-browser wait 700
U10=$(re "JSON.stringify((()=>{
  const inp=document.querySelector('.cw-search');
  const sc=document.querySelector('.cw-scroll');
  const on=[...document.querySelectorAll('.cw-chip')].findIndex(c=>c.classList.contains('on'));
  return {q:inp.value,top:Math.round(sc.scrollTop),on};})())")
chk "U10 重开复位（检索空 + 卷首 + 高亮第一卷）" "$(echo "$U10" | grep -o 'q:,top:0,on:0')" "q:,top:0,on:0"

echo "=== [4] R 段：存档往返 + 双端截图 ==="
R1=$(re "JSON.stringify((()=>{const e=window.__pxc;const t=e.tycoon;
const v=t.chron.view();
const snap={tot:v.total,era:v.eraName,n:v.n,
  first:v.entries[0].title,
  hasFire:v.entries.some(x=>x.title==='火灾')};
t.save(e.map);
return snap;})())")
echo "  · R1 存档快照：$(echo "$R1" | head -c 120)"
RT=$(echo "$R1" | grep -o 'tot:[0-9]*' | cut -d: -f2)
RN=$(echo "$R1" | grep -o 'n:[0-9]*' | cut -d: -f2)
agent-browser reload >/dev/null 2>&1
agent-browser wait --fn "window.__pxc!==undefined" --timeout 90000 >/dev/null 2>&1
agent-browser wait 3000
agent-browser eval "(()=>{const b=[...document.querySelectorAll('button')].filter(x=>(x.textContent||'').includes('跳过'));if(b.length)b[b.length-1].click();return 'tut';})()" >/dev/null 2>&1
R2=$(re "JSON.stringify((()=>{const t=window.__pxc.tycoon;const v=t.chron.view();
return {tot:v.total,era:v.eraName,n:v.n,first:v.entries[0].title,
  hasFire:v.entries.some(x=>x.title==='火灾')};})())")
R2N=$(echo "$R2" | grep -o 'n:[0-9]*' | cut -d: -f2)
chk "R2a 编年史累计笔数往返" "$(echo "$R2" | grep -o 'tot:[0-9]*' | cut -d: -f2)" "$RT"
chkge "R2b 在册笔数不丢（≥存档时）" "$R2N" "$RN"
chk "R2c 纪元恢复（摩登都会）" "$(echo "$R2" | grep -o 'era:摩登都会')" "era:摩登都会"
chk "R2d 首笔开埠建城随档恢复" "$(echo "$R2" | grep -o 'first:开埠建城')" "first:开埠建城"
# R3：读档后长卷 UI 仍可用
agent-browser eval "(()=>{const bs=[...document.querySelectorAll('button.chip')].filter(x=>(x.getAttribute('title')||'').includes('编年史'));bs[0].click();return 'm';})()" >/dev/null 2>&1
agent-browser wait 500
agent-browser eval "(()=>{document.querySelector('.cw-open-btn').click();return 'wide';})()" >/dev/null 2>&1
agent-browser wait 700
R3=$(re "JSON.stringify({w:!!document.querySelector('.cw-root'),
  chaps:document.querySelectorAll('.cw-chap').length,
  names:[...document.querySelectorAll('.cw-chap-name')].map(x=>x.textContent).join(',')})")
chk "R3a 读档后长卷五卷俱在" "$(echo "$R3" | grep -o 'chaps:5')" "chaps:5"
chk "R3b 卷名齐整" "$(echo "$R3" | grep -o 'names:拓荒营地,炊烟村庄,市井小镇,一方城市,摩登都会')" "names:拓荒营地,炊烟村庄,市井小镇,一方城市,摩登都会"
ERR=$(errcount)
chk "R3c 控制台零错误" "${ERR:-x}" "0"
# R4：双端截图（桌面卷首 / 桌面跳转末卷 / 移动端）
agent-browser screenshot $OUT/v27_scroll_top.png >/dev/null && ok "截图 v27_scroll_top.png（桌面 · 卷首）"
agent-browser eval "(()=>{const c=[...document.querySelectorAll('.cw-chip')];c[c.length-1].click();return 'jump';})()" >/dev/null 2>&1
agent-browser wait 1100
agent-browser screenshot $OUT/v27_scroll_jump.png >/dev/null && ok "截图 v27_scroll_jump.png（桌面 · 末卷）"
agent-browser set viewport 390 844
agent-browser wait 1200
agent-browser eval "(()=>{const sc=document.querySelector('.cw-scroll');if(sc)sc.scrollTop=0;return 'top';})()" >/dev/null 2>&1
agent-browser wait 400
agent-browser screenshot $OUT/v27_scroll_mobile.png >/dev/null && ok "截图 v27_scroll_mobile.png（移动端）"
MOB=$(re "JSON.stringify((()=>{
  const nav=document.querySelector('.cw-nav');
  return {row:nav?getComputedStyle(nav).flexDirection:'-',w:!!document.querySelector('.cw-root')};})())")
chk "R4 移动端卷目折叠为横条" "$(echo "$MOB" | grep -o 'row:row')" "row:row"
# R4b-e：横滑暗示（内层滚动承载 + 左右渐隐随滚动切换）
MOB2=$(re "JSON.stringify((()=>{
  const ns=document.querySelector('.cw-nav-scroll');
  const nav=document.querySelector('.cw-nav');
  return {ox:ns?getComputedStyle(ns).overflowX:'-',
    hasR:nav?nav.classList.contains('more-r'):false,
    hasL:nav?nav.classList.contains('more-l'):false};})())")
chk "R4b 横滑承载（cw-nav-scroll overflowX=auto）" "$(echo "$MOB2" | grep -o 'ox:auto')" "ox:auto"
chk "R4c 卷首态右缘渐隐（more-r 有 · more-l 无）" "$(echo "$MOB2" | grep -o 'hasR:true,hasL:false')" "hasR:true,hasL:false"
agent-browser eval "(()=>{const ns=document.querySelector('.cw-nav-scroll');ns.scrollLeft=ns.scrollWidth;return 'end';})()" >/dev/null 2>&1
agent-browser wait 400
MOB3=$(re "JSON.stringify((()=>{const nav=document.querySelector('.cw-nav');
  return {hasR:nav.classList.contains('more-r'),hasL:nav.classList.contains('more-l')};})())")
chk "R4d 滑到尽头右隐左现" "$(echo "$MOB3" | grep -o 'hasR:false,hasL:true')" "hasR:false,hasL:true"
agent-browser eval "(()=>{const ns=document.querySelector('.cw-nav-scroll');ns.scrollLeft=0;return 'home';})()" >/dev/null 2>&1
agent-browser wait 400
MOB4=$(re "JSON.stringify((()=>{const nav=document.querySelector('.cw-nav');
  return {hasR:nav.classList.contains('more-r'),hasL:nav.classList.contains('more-l')};})())")
chk "R4e 滑回卷首复原（右缘渐隐重现）" "$(echo "$MOB4" | grep -o 'hasR:true,hasL:false')" "hasR:true,hasL:false"
# R4f：截断 chips 仍可达（再滑到尽头，第五卷 chip 完整进入可视区）
agent-browser eval "(()=>{const ns=document.querySelector('.cw-nav-scroll');ns.scrollLeft=ns.scrollWidth;return 'end2';})()" >/dev/null 2>&1
agent-browser wait 400
MOB5=$(re "JSON.stringify((()=>{
  const ns=document.querySelector('.cw-nav-scroll');
  const chips=[...ns.querySelectorAll('.cw-chip')];
  const last=chips[chips.length-1];
  const r=last.getBoundingClientRect(), nr=ns.getBoundingClientRect();
  return {n:chips.length,vis:r.right<=nr.right+1};})())")
chk "R4f 滑到尽头第五卷 chip 完整可达" "$(echo "$MOB5" | grep -o 'n:5,vis:true')" "n:5,vis:true"
agent-browser close >/dev/null 2>&1

echo ""
echo "===== 结果：PASS=$PASS FAIL=$FAIL ====="
[ $FAIL -eq 0 ] && echo "ALL GREEN" || echo "HAS FAILURES"
exit $FAIL
