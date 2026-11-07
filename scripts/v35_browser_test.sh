#!/bin/bash
# ============================================================
# v35_browser_test.sh — 百兽之园「动物园与物种图鉴」端到端验证
# 增量 = tycoon.ts（ZOO_* 常数 + ZOO_SPECIES 九物种表（季节权重/镇园门槛）
#   + zooBonusOf 加成汇总 + zooWeightOf 权重查询
#   + stepZoo（开园判定/巡查入住/拆园暂停）+ zooArrive 图鉴登记三档纪事
#   + zooTest 沙盒强制入住 + snapOf 计数与加成并入（attract/幸福/游客乘数）
#   + snap/view/QS/EconView v35 字段 + 存档 zooT/zooG/zooS 三字段
#   + 成就 开园纳客 / 万兽来朝 + 任务压轴 百兽之园）
#   + citizens.ts（CitzCtx.zooN 动物园心声 4 条）
#   + catalog.ts（zoo 3×3 建筑 + 基础吸引力 5 + 城市名片科技门槛）
#   + b_dusk.ts（genZoo 木围栏兽舍水池游园精灵）
#   + icons.ts（paw 爪印 + 九物种像素头像）
#   + PixelCity.tsx（顶栏「兽」芯片 + 物种图鉴九宫格模态 + 财政百兽行 + 帮助文案）
# S 段：bun 直测（常数 / 物种表 / 加成 / 权重 / 成就 / 任务 / 建筑目录）
# D 段：动物园引擎流（开园 / 首位住户 / 冬季加成 / 全图鉴 / 拆园暂停 / 心声）
# U 段：兽芯片 / 物种图鉴模态 / 财政百兽行 / 编年史 / 成就墙 / 园区截图
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
# 注入建筑锚点（避开已占格；返回 [idx, ax, ay]）
PLACE="const n=m.n;const hx=window.__pxc.tycoon.hall.x,hy=window.__pxc.tycoon.hall.y;let spot=-1;
for(let y=Math.max(8,hy+2);y<Math.min(n-10,hy+14)&&spot<0;y++)for(let x=Math.max(8,hx-14);x<Math.min(n-10,hx+14);x++){const i=y*n+x;if(!t.own[(y>>4)*16+(x>>4)])continue;
if(m.h[i]>0&&!m.road[i]&&m.occ[i]<0&&m.tree[i]<0&&!m.objs.has(i)){let ok2=true;
for(let dy=0;dy<3&&ok2;dy++)for(let dx=0;dx<3;dx++){const j=(y+dy)*n+(x+dx);if(m.occ[j]>=0||m.road[j]||m.h[j]<=0){ok2=false;break;}}
if(ok2){spot=i;break;}}}
if(spot<0)throw new Error('nospot');
const x=spot%n,y=(spot-x)/n;
if(!m.place('zoo',0,x,y))throw new Error('placefail');"

echo "=== [S] 纯函数直测（bun：常数 / 物种表 / 加成 / 权重 / 成就 / 任务 / 目录） ==="
S=$(cd /home/z/my-project && bun -e '
import { ZOO_ROLL_GAP, ZOO_BASE_P, ZOO_SPECIES, zooBonusOf, zooWeightOf,
  ACHIEVEMENTS, QUESTS, ECON, TECH_GATE } from "./src/lib/pixelcity/tycoon.ts";
import { CATALOG, ATTRACT } from "./src/lib/pixelcity/catalog.ts";
import { defById } from "./src/lib/pixelcity/catalog.ts";
const a1 = ACHIEVEMENTS.find(a => a.id === "zoo1"), a2 = ACHIEVEMENTS.find(a => a.id === "zoo9");
const q = QUESTS.find(x => x.id === "zoo3") ?? QUESTS[QUESTS.length - 1];
const pen = ZOO_SPECIES.find(s => s.id === "penguin")!, koi = ZOO_SPECIES.find(s => s.id === "koi")!, panda = ZOO_SPECIES.find(s => s.id === "panda")!;
const zooDef = CATALOG.find(d => d.id === "zoo");
console.log(JSON.stringify({
  k: ZOO_ROLL_GAP + "," + ZOO_BASE_P + "," + ZOO_SPECIES.length,
  names: ZOO_SPECIES.map(s => s.name).join(""),
  at: zooBonusOf([], 1).at + "," + zooBonusOf(["penguin"], 1).at + "," + zooBonusOf(["penguin"], 3).hap + "," + zooBonusOf(["panda"], 1).tourK,
  w: [zooWeightOf(pen, 60, 3, 0), zooWeightOf(pen, 60, 1, 0), zooWeightOf(koi, 60, 1, 0), zooWeightOf(panda, 79, 1, 99), zooWeightOf(panda, 80, 1, 80)].join(","),
  all: zooBonusOf(ZOO_SPECIES.map(s => s.id), 1).at,
  ach: (a1 ? a1.goal : -1) + "," + (a2 ? a2.goal : -1) + "," + a1.name + "," + a2.name,
  quest: q.id + "," + q.goal,
  econ: ECON.zoo.unlock + "," + ECON.zoo.cost + "," + TECH_GATE.zoo + "," + ATTRACT.zoo,
  def: zooDef.w + "x" + zooDef.h + "," + zooDef.variants,
}));' 2>&1 | tail -1 | stripq)
chk "S1 动物园常数（巡查7时 · 基础概率0.3 · 图鉴9种）" "$(echo "$S" | grep -o 'k:7,0.3,9')" "k:7,0.3,9"
chk "S2 九物种名册（兔羊鹿孔雀火烈鸟小熊猫企鹅锦鲤大熊猫）" "$(echo "$S" | grep -o 'names:垂耳兔小山羊梅花鹿蓝孔雀火烈鸟小熊猫王企鹅锦鲤大熊猫')" "names:垂耳兔小山羊梅花鹿蓝孔雀火烈鸟小熊猫王企鹅锦鲤大熊猫"
chk "S3 物种加成（空0 · 企鹅at3 · 冬季hap3 · 熊猫×1.08）" "$(echo "$S" | grep -o 'at:0,3,3,1.08')" "at:0,3,3,1.08"
chk "S4 权重门槛（企鹅冬4夏0.3 · 锦鲤夏4 · 熊猫79级0/80级80客1）" "$(echo "$S" | grep -o 'w:4,0.3,4,0,1')" "w:4,0.3,4,0,1"
chk "S5 全图鉴总吸引力（23 分）" "$(echo "$S" | grep -o 'all:23')" "all:23"
chk "S6 成就定义（开园纳客 1 / 万兽来朝 9）" "$(echo "$S" | grep -o 'ach:1,9,开园纳客,万兽来朝')" "ach:1,9,开园纳客,万兽来朝"
chk "S7 任务压轴（zoo3 三位住户）" "$(echo "$S" | grep -o 'quest:zoo3,3')" "quest:zoo3,3"
chk "S8 建筑注册（LV6 · 1500G · 城市名片 · 吸引力5 · 3x3双变体）" "$(echo "$S" | grep -o 'econ:6,1500,brand,5,def:3x3,2')" "econ:6,1500,brand,5,def:3x3,2"

echo "=== [1] 桌面端 1440×900 新档开局 ==="
agent-browser close >/dev/null 2>&1; sleep 1
agent-browser set viewport 1440 900
agent-browser open $B
agent-browser storage local clear >/dev/null 2>&1
agent-browser reload
agent-browser wait --fn "window.__pxc!==undefined" --timeout 90000 && ok "引擎就绪" || bad "引擎超时"
agent-browser wait 3000
agent-browser eval "(()=>{const b=[...document.querySelectorAll('button')].filter(x=>(x.textContent||'').includes('跳过'));if(b.length)b[b.length-1].click();return 'tut';})()" >/dev/null 2>&1
# 冻结随机源：市民信/事件/生日/景气不触发（动物园巡查不冻结：无园区天然不 roll）
agent-browser eval "(()=>{const t=window.__pxc.tycoon;const c=t.citz;c.mailTimer=99999;c.evTimer=99999;c.bdayTimer=99999;t.eventTimer=99999;t.cycTimer=99999;return 'frozen';})()" >/dev/null 2>&1

echo "=== [2] D 段：动物园引擎流 ==="
# D1 基线：无动物园 → 图鉴未开册
D1=$(re "JSON.stringify((()=>{const e=window.__pxc;const t=e.tycoon;t.tick(0.05,e.map);const s=t.snap;
return {next:t.zooNext,got:t.zooGot.length,st:s.zoos};})())")
chk "D1 开埠基线（未开园 zooNext=-1 · 图鉴0 · 园区0）" "$(echo "$D1" | grep -o 'next:-1,got:0,st:0')" "next:-1,got:0,st:0"
# D2 注入动物园 → tick → 开园（+4 时首次巡查 · 百兽开园纪事 · 园区计数 1）
D2=$(re "JSON.stringify((()=>{const e=window.__pxc;const t=e.tycoon;const m=e.map;
$PLACE
t.tick(0.05,m);
const delta=Math.round((t.zooNext-t.gHours)*10)/10;
return {delta,seen:t.zooSeen,chron:t.chron.entries.some(q=>q.title==='百兽开园'),st:t.snap.zoos};})())")
echo "  · D2 注入：$D2"
chk "D2 开园（+4时首巡 · 开园纪事 · 园区1）" "$(echo "$D2" | grep -o 'delta:4,seen:true,chron:true,st:1')" "delta:4,seen:true,chron:true,st:1"
# D3 首位稀有住户：企鹅入住 → 图鉴登记 + 稀有纪事 + 加成（at+3 · hap 冬季 +3）
D3=$(re "JSON.stringify((()=>{const e=window.__pxc;const t=e.tycoon;
e.setSeason(3,false);t.tick(0.05,e.map);
const ok=t.zooTest('penguin');t.tick(0.05,e.map);const s=t.snap;
return {ok,n:t.zooGot.length,got:t.zooGot.join(''),at:s.zooAt,hap:s.zooHap,
rare:t.chron.entries.some(q=>q.title==='稀有住户入住'),order:t.zooGot[0]==='penguin'};})())")
chk "D3 企鹅入住（图鉴1 · at+3 · 冬季hap+3 · 稀有纪事 · 入住序=1）" "$(echo "$D3" | grep -o 'ok:true,n:1,got:penguin,at:3,hap:3,rare:true,order:true')" "ok:true,n:1,got:penguin,at:3,hap:3,rare:true,order:true"
# D4 镇园之宝：熊猫入住 → mile 级纪事 + 游客乘数 ×1.08 + 幸福 +2
D4=$(re "JSON.stringify((()=>{const e=window.__pxc;const t=e.tycoon;
const ok=t.zooTest('panda');t.tick(0.05,e.map);const s=t.snap;
return {ok,n:t.zooGot.length,k:Math.round(s.zooK*100)/100,mile:t.chron.entries.some(q=>q.title==='镇园之宝驾到'),
dup:t.zooTest('panda'),dup2:t.zooTest('phantom')};})())")
chk "D4 熊猫驾到（×1.08 · mile 纪事 · 重复/未知 id 拒绝）" "$(echo "$D4" | grep -o 'ok:true,n:2,k:1.08,mile:true,dup:false,dup2:false')" "ok:true,n:2,k:1.08,mile:true,dup:false,dup2:false"
# D5 全图鉴：补齐其余七种 → 图鉴满册 + 双成就 + 总吸引力 23
D5=$(re "JSON.stringify((()=>{const e=window.__pxc;const t=e.tycoon;
for(const id of ['rabbit','goat','deer','peacock','flamingo','redpanda','koi'])t.zooTest(id);
t.tick(0.05,e.map);t.achvTimer=0.01;t.tick(0.05,e.map);const s=t.snap;
return {n:t.zooGot.length,at:s.zooAt,k:Math.round(s.zooK*100)/100,
ach1:t.achv.has('zoo1'),ach9:t.achv.has('zoo9')};})())")
chk "D5 图鉴满册（9 种 · 总吸引力23 · ×1.08 · 双成就解锁）" "$(echo "$D5" | grep -o 'n:9,at:23,k:1.08,ach1:true,ach9:true')" "n:9,at:23,k:1.08,ach1:true,ach9:true"
# D6 拆园：巡查暂停（图鉴已满本就不再 roll —— 先模拟：gHours 推进后 got 不变 · zooNext 保留）
D6=$(re "JSON.stringify((()=>{const e=window.__pxc;const t=e.tycoon;const m=e.map;
const ent=[...m.objs.entries()].find(([k,o])=>o.id==='zoo');
if(ent===undefined)return {err:'nozoo'};
const nextBefore=t.zooNext;m.bulldoze(ent[1].ax,ent[1].ay);
t.gHours=t.zooNext+1;t.tick(0.05,m);
return {n:t.zooGot.length,nextKept:t.zooNext===nextBefore,st:t.snap.zoos};})())")
chk "D6 拆园停簿（住户保留 · 巡查时刻保留 · 园区0）" "$(echo "$D6" | grep -o 'n:9,nextKept:true,st:0')" "n:9,nextKept:true,st:0"
# D7 动物园心声（假市民占位取词后即撤）
D7=$(re "JSON.stringify((()=>{const t=window.__pxc.tycoon;
t.citz.roster.push({name:'测试市民',mood:60});
const base={pop:100,happiness:60,taxRate:9,season:1,famine:0,events:[],fest:-1,smog:0,dark:0,waste:0,eduOut:0,crime:0,fireOut:0,lg:0};
const words=[];for(let i=0;i<16;i++){const v=t.citz.voice({...base,zooN:3});if(v)words.push(v.text);}
t.citz.roster.pop();
const hit=words.some(q=>/动物园|孔雀|巡查员|宝贝/.test(q));
return {hit,n:t.citz.roster.length};})())")
chk "D7 动物园心声（住户在园市民聊动物 · 假市民已撤）" "$(echo "$D7" | grep -o 'hit:true,n:0')" "hit:true,n:0"

echo "=== [3] U 段：兽芯片 / 物种图鉴模态 / 财政百兽行 / 编年史 / 成就墙 ==="
REBORN=$(re "(()=>{const e=window.__pxc;const t=e.tycoon;const m=e.map;$PLACE
t.tick(0.05,m);return 'reborn:'+t.snap.zoos;})()")
echo "  · 重建：$REBORN"
U1=$(re "JSON.stringify((()=>{
  const chip=[...document.querySelectorAll('button.chip')].find(x=>x.classList.contains('zoo-chip'));
  const t=chip?(chip.getAttribute('title')||''):'';
  return {chip:!!chip,full:chip?chip.className.includes('zoo-full'):false,
    txt:chip?chip.textContent.includes('9/9'):false,tip:t.includes('物种图鉴')};})())")
chk "U1 顶栏兽芯片（满册金边 · 9/9 · 悬停提示）" "$(echo "$U1" | grep -o 'chip:true,full:true,txt:true,tip:true')" "chip:true,full:true,txt:true,tip:true"
agent-browser eval "(()=>{const b=[...document.querySelectorAll('button.chip')].find(x=>x.classList.contains('zoo-chip'));if(b)b.click();return 'open';})()" >/dev/null 2>&1
agent-browser wait 800
U2=$(re "JSON.stringify((()=>{
  const m=document.querySelector('.pxc-zoo');const txt=m?m.textContent||'':'';
  const cards=m?m.querySelectorAll('.zk-card').length:0;
  const ons=m?m.querySelectorAll('.zk-card.on').length:0;
  return {open:!!m,cards,ons,panda:txt.includes('大熊猫')&&txt.includes('镇园'),
    bonus:txt.includes('吸引力 +23'),head:txt.includes('9/9')};})())")
chk "U2 物种图鉴模态（九宫格 · 全亮 · 熊猫镇园 · 加成汇总）" "$(echo "$U2" | grep -o 'open:true,cards:9,ons:9,panda:true,bonus:true,head:true')" "open:true,cards:9,ons:9,panda:true,bonus:true,head:true"
agent-browser screenshot $OUT/v35_zoo_modal.png >/dev/null && ok "截图 v35_zoo_modal.png（桌面 · 物种图鉴）"
agent-browser eval "(()=>{document.querySelector('.pxc-zoo .pxc-x')?.click();return 'x';})()" >/dev/null 2>&1
agent-browser eval "(()=>{const b=[...document.querySelectorAll('button')].find(x=>(x.getAttribute('title')||'').includes('财政报告'));if(b)b.click();return 'f';})()" >/dev/null 2>&1
agent-browser wait 900
U3=$(re "JSON.stringify((()=>{
  const txt=document.querySelector('.pxc-fiscal')?.textContent||'';
  return {row:txt.includes('百兽之园'),bonus:txt.includes('吸引力 +23')};})())")
chk "U3 财政报告百兽行（观光经济区块 · 物种加成在册）" "$(echo "$U3" | grep -o 'row:true,bonus:true')" "row:true,bonus:true"
agent-browser eval "(()=>{document.querySelector('.pxc-fiscal .pxc-x')?.click();return 'x';})()" >/dev/null 2>&1
agent-browser eval "(()=>{const b=[...document.querySelectorAll('button.chip')].find(x=>(x.getAttribute('title')||'').includes('编年史'));if(b)b.click();return 'c';})()" >/dev/null 2>&1
agent-browser wait 700
U4=$(re "JSON.stringify((()=>{
  const txt=document.querySelector('.pxc-chron')?.textContent||'';
  return {a1:txt.includes('百兽开园'),a2:txt.includes('镇园之宝驾到'),a3:txt.includes('稀有住户入住')};})())")
chk "U4 编年史兽事（开园+镇园+稀有全入册）" "$(echo "$U4" | grep -o 'a1:true,a2:true,a3:true')" "a1:true,a2:true,a3:true"
agent-browser eval "(()=>{document.querySelector('.pxc-chron .pxc-x')?.click();return 'x';})()" >/dev/null 2>&1
agent-browser eval "(()=>{const b=[...document.querySelectorAll('button.chip')].find(x=>(x.getAttribute('title')||'').includes('城市志'));if(b)b.click();return 'd';})()" >/dev/null 2>&1
agent-browser wait 700
U5=$(re "JSON.stringify((()=>{
  const txt=document.querySelector('.pxc-modal')?.textContent||'';
  return {a1:txt.includes('开园纳客'),a2:txt.includes('万兽来朝')};})())")
chk "U5 成就墙双卡在册" "$(echo "$U5" | grep -o 'a1:true,a2:true')" "a1:true,a2:true"
agent-browser eval "(()=>{document.querySelector('.pxc-modal .pxc-x')?.click();return 'x';})()" >/dev/null 2>&1
agent-browser wait 400
# U6 园区街景截图（相机对准动物园：木围栏/兽舍/水池尽入画）
agent-browser eval "(()=>{const e=window.__pxc;const m=e.map;
const zoo=[...m.objs.entries()].find(([k,o])=>o.id==='zoo');
if(!zoo)return 'nozoo';
const ax=zoo[1].ax+1.5,ay=zoo[1].ay+1.5;
e.cam={x:(ax-ay)*16,y:(ax+ay)*8};return 'focused';})()" >/dev/null 2>&1
agent-browser wait 700
agent-browser screenshot $OUT/v35_zoo.png >/dev/null && ok "截图 v35_zoo.png（桌面 · 园区特写）"

echo "=== [4] R 段：存档往返 + 移动端 + 零错误 ==="
re "JSON.stringify((()=>{window.__pxc.tycoon.save(window.__pxc.map);return 'saved';})())" >/dev/null
agent-browser reload >/dev/null 2>&1
agent-browser wait --fn "window.__pxc!==undefined" --timeout 90000 >/dev/null 2>&1
agent-browser wait 3000
agent-browser eval "(()=>{const b=[...document.querySelectorAll('button')].filter(x=>(x.textContent||'').includes('跳过'));if(b.length)b[b.length-1].click();return 'tut';})()" >/dev/null 2>&1
agent-browser eval "(()=>{const t=window.__pxc.tycoon;t.cycTimer=99999;t.eventTimer=99999;return 'f';})()" >/dev/null 2>&1
# R1 往返：百兽之园档恢复（图鉴 9 种全保留 · 入住序 = 企鹅/熊猫/七种补齐 · 纪事不回退）
R1=$(re "JSON.stringify((()=>{const t=window.__pxc.tycoon;t.tick(0.05,window.__pxc.map);
return {n:t.zooGot.length,first:t.zooGot[0],second:t.zooGot[1],last:t.zooGot[8],next:t.zooNext>0||t.zooNext===-1,st:t.snap.zoos,
mile:t.chron.entries.some(q=>q.title==='镇园之宝驾到')};})())")
echo "  · R1：$R1"
chk "R1 往返（图鉴9种全在 · 入住序保留 · 园区1 · 镇园纪事保留）" "$(echo "$R1" | grep -o 'n:9,first:penguin,second:panda,last:koi,next:true,st:1,mile:true')" "n:9,first:penguin,second:panda,last:koi,next:true,st:1,mile:true"
ERR=$(errcount)
chk "R2 控制台零错误" "${ERR:-x}" "0"
# R3 移动端物种图鉴
agent-browser set viewport 390 844
agent-browser wait 1200
agent-browser eval "(()=>{const b=[...document.querySelectorAll('button.chip')].find(x=>x.classList.contains('zoo-chip'));if(b)b.click();return 'open';})()" >/dev/null 2>&1
agent-browser wait 700
R3=$(re "JSON.stringify((()=>{
  const m=document.querySelector('.pxc-zoo');
  return {open:!!m,cards:m?m.querySelectorAll('.zk-card').length:0,
    w:m?m.getBoundingClientRect().width<=window.innerWidth:false};})())")
chk "R3 移动端物种图鉴（九宫格在册 · 不溢出）" "$(echo "$R3" | grep -o 'open:true,cards:9,w:true')" "open:true,cards:9,w:true"
agent-browser screenshot $OUT/v35_mobile.png >/dev/null && ok "截图 v35_mobile.png（移动端 · 物种图鉴）"
agent-browser close >/dev/null 2>&1

echo ""
echo "=========================================="
echo "v35 结果：$PASS 通过 / $FAIL 失败"
[ "$FAIL" -eq 0 ] && echo "全部通过 ✅" || echo "存在失败 ❌"
exit $FAIL
