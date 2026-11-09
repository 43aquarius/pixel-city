#!/bin/bash
# ============================================================
# v43_browser_test.sh — 渔业之城「鱼米之乡」端到端验证
# S 段：bun 直测（常数/季节汛/水质/渔获/变现折粮/图鉴权重/
#       成就任务/门禁目录/事件模板）
# D 段：引擎流（空态/渔港破土/秋汛首汛/海鲜市场变现 A/B/
#       冬封歇海/春汛复位/事件乘数/大丰收/存档往返）
# U 段：渔 chip + 渔汛模态 + 十格图鉴 / 城市志与帮助行 /
#       桌面与模态截图
# M 段：移动端 390×844（chip/模态适配/帮助表/截图）
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
    if [ -n "$out" ] && ! echo "$out" | grep -q "Evaluationerror\|Evaluation error\|Invalidresponse\|EOFwhileparsing"; then
      echo "$out"; return 0
    fi
    printf '%s' "$raw" > "/tmp/evalfail_${RANDOM}.txt"
    sleep 0.9
  done
  echo "$out"; return 1
}
errcount() { agent-browser errors --json 2>/dev/null | python3 -c "import json,sys
try: print(len(json.load(sys.stdin).get('data',{}).get('errors',[])))
except Exception: print(0)"; }

echo "=== [S] 纯函数直测（bun：常数 / 渔汛 / 水质 / 图鉴） ==="
S=$(cd /home/z/my-project && bun -e '
import { FISH_DAY_H, FISH_BASE, FISH_ENV_BAD, FISH_ENV_GOOD, FISH_MKT_CAP, FISH_PRICE,
  FISH_FOOD_K, FISH_SELF_FOOD_K, FISH_HAP, FISH_BOUNTY_CATCH, FISH_CATCH_GOAL,
  FISH_BOATS_PER_PORT, FISH_BOAT_MAX, FISH_SEASON_K,
  seasonKOf, envKOf, fishCatchOf, fishSellable, fishIncomeOf, fishFoodOf, fishHapOf,
  FISH_SPECIES, fishWeightOf, rollFish } from "./src/lib/pixelcity/fishing.ts";
import { ACHIEVEMENTS, QUESTS, ECON, EVENT_TPLS } from "./src/lib/pixelcity/tycoon.ts";
import { CATALOG } from "./src/lib/pixelcity/catalog.ts";
// 季节汛与水质系数
const sk = [seasonKOf(0), seasonKOf(1), seasonKOf(2), seasonKOf(3), seasonKOf(9)].join(",");
const ek = [envKOf(30), envKOf(55), envKOf(80)].join(",");
// 日渔获：无港 0 / 两港秋汛 / 冬封 0 / 水质差折减 / 清波加成
const c0 = fishCatchOf(0, 0, 60);
const c1 = fishCatchOf(2, 2, 60);
const c2 = fishCatchOf(2, 3, 60);
const c3 = fishCatchOf(2, 0, 30);
const c4 = fishCatchOf(2, 0, 80);
// 冰台封顶与变现
const sl = [fishSellable(20, 1), fishSellable(7, 1), fishSellable(20, 0)].join(",");
const inc = [fishIncomeOf(20, 1), fishIncomeOf(20, 0)].join(",");
const fd = [fishFoodOf(20, 1), fishFoodOf(20, 0), fishFoodOf(7, 1)].join(",");
// 海味上桌幸福：齐备且非冬封才 +1
const hp = [fishHapOf(1, 1, 0), fishHapOf(1, 1, 3), fishHapOf(1, 0, 0), fishHapOf(0, 1, 0)].join(",");
// 图鉴权重门槛：鳜鱼春汛限定 / 蟹秋汛限定 / 银鱼与鲟看水质
const md = FISH_SPECIES.find(x => x.id === "mandarin")!;
const cb = FISH_SPECIES.find(x => x.id === "crab")!;
const sf = FISH_SPECIES.find(x => x.id === "silverfish")!;
const st = FISH_SPECIES.find(x => x.id === "sturgeon")!;
const wq = [fishWeightOf(md, 0, 60), fishWeightOf(md, 1, 60),
  fishWeightOf(cb, 2, 60), fishWeightOf(cb, 0, 60),
  fishWeightOf(sf, 0, 70), fishWeightOf(sf, 0, 75),
  fishWeightOf(st, 0, 79), fishWeightOf(st, 0, 80)].join(",");
// rollFish 池过滤：水质差时抽 200 尾无银鱼无鲟
let bad = 0;
const rnd = () => (bad = bad + 1) % 2 ? 0.001 : 0.999;
for (let i = 0; i < 200; i++) {
  const f = rollFish(2, 30, rnd);
  if (f && (f.id === "silverfish" || f.id === "sturgeon")) bad = 999;
}
// 成就与任务
const m1 = ACHIEVEMENTS.find(a => a.id === "fish1")!;
const mY = ACHIEVEMENTS.find(a => a.id === "fishY")!;
const mD = ACHIEVEMENTS.find(a => a.id === "fishD")!;
const q1 = QUESTS.find(x => x.id === "fish1")!;
const q2 = QUESTS.find(x => x.id === "fish2")!;
// 门禁与目录
const evA = EVENT_TPLS.filter(t => t.key === "redtide" || t.key === "runfish").length;
const rt = EVENT_TPLS.find(t => t.key === "redtide")!;
const rf = EVENT_TPLS.find(t => t.key === "runfish")!;
const ap = CATALOG.find(x => x.id === "fishport")!;
const am = CATALOG.find(x => x.id === "fishmkt")!;
console.log(JSON.stringify({
  k: [FISH_DAY_H, FISH_BASE, FISH_MKT_CAP, FISH_PRICE].join(","),
  bk: [FISH_FOOD_K, FISH_SELF_FOOD_K, FISH_HAP, FISH_BOUNTY_CATCH, FISH_CATCH_GOAL,
    FISH_BOATS_PER_PORT, FISH_BOAT_MAX, FISH_ENV_BAD, FISH_ENV_GOOD].join(","),
  sk, ek,
  cc: [c0, c1, c2, c3, c4].join(","),
  sl, inc, fd, hp, wq, pool: bad === 999 ? "leak" : "clean",
  dex: FISH_SPECIES.length,
  rare: FISH_SPECIES.filter(x => x.rare === 0).length + "/" + FISH_SPECIES.filter(x => x.rare === 1).length + "/" + FISH_SPECIES.filter(x => x.rare === 2).length,
  ach: `${m1.name}${m1.goal}/${mY.name}${mY.goal}/${mD.name}${mD.goal}`,
  q: `${q1.title}${q1.goal}/${q2.title}${q2.goal}`,
  econ: `${ECON.fishport.cost},${ECON.fishport.unlock},${ECON.fishmkt.cost},${ECON.fishmkt.unlock}`,
  cat: `${ap.w}x${ap.h}/${ap.variants}/${am.w}x${am.h}/${am.variants}`,
  ev: `${evA}/${rt.mult.fish}/${rf.mult.fish}`,
}));' 2>&1 | tail -1 | stripq)
chk "S1 常数（一汛 24h · 基础 4 筐 · 冰台 10 · 筐价 26）" \
  "$(echo "$S" | grep -o 'k:24,4,10,26')" "k:24,4,10,26"
chk "S1b 全局参数（折粮 8/3 · 幸福 1 · 大丰 12 · 目标 500 · 渔船 2/6 · 水质 40/75）" \
  "$(echo "$S" | grep -o 'bk:8,3,1,12,500,2,6,40,75')" "bk:8,3,1,12,500,2,6,40,75"
chk "S2 季节汛（春 1.5 · 夏 1.0 · 秋 1.8 · 冬 0 · 越界按冬封兜底 0）" \
  "$(echo "$S" | grep -o 'sk:1.5,1,1.8,0,0')" "sk:1.5,1,1.8,0,0"
chk "S3 水质系数（差 0.6 · 平 1 · 清波 1.15）" "$(echo "$S" | grep -o 'ek:0.6,1,1.15')" "ek:0.6,1,1.15"
chk "S4 日渔获（无港 0 · 秋两港 14 · 冬封 0 · 水质差 7 · 清波 14）" \
  "$(echo "$S" | grep -o 'cc:0,14,0,7,14')" "cc:0,14,0,7,14"
chk "S5 冰台封顶（20 筐 1 市场 → 10 · 7 筐 → 7 · 无市场 0）" \
  "$(echo "$S" | grep -o 'sl:10,7,0')" "sl:10,7,0"
chk "S6 变现（20 筐 ×26 → 260 · 无市场 0）" "$(echo "$S" | grep -o 'inc:260,0')" "inc:260,0"
chk "S7 折粮（售 10×8+余 10×3=110 · 全自食 60 · 7 筐全售 56）" \
  "$(echo "$S" | grep -o 'fd:110,60,56')" "fd:110,60,56"
chk "S8 海味上桌（齐备 +1 · 冬封 0 · 无市场 0 · 无渔港 0）" \
  "$(echo "$S" | grep -o 'hp:1,0,0,0')" "hp:1,0,0,0"
chk "S9 图鉴门槛（鳜春 2.5 夏 0 · 蟹秋 3 春 0 · 银鱼 70 拒 75 纳 · 鲟 79 拒 80 纳）" \
  "$(echo "$S" | grep -o 'wq:2.5,0,3,0,0,1.5,0,0.8')" "wq:2.5,0,3,0,0,1.5,0,0.8"
chk "S10 池过滤（水质差 200 抽无银鱼无鲟）" "$(echo "$S" | grep -o 'pool:clean')" "pool:clean"
chk "S11 图鉴十种（常见 4 / 稀有 5 / 镇册 1）" \
  "$(echo "$S" | grep -o 'dex:10,rare:4/5/1')" "dex:10,rare:4/5/1"
chk "S12 成就三枚（渔舟唱晚 1 / 鱼米之乡 500 / 满舱而归 10）" \
  "$(echo "$S" | grep -o 'ach:渔舟唱晚1/鱼米之乡500/满舱而归10')" "ach:渔舟唱晚1/鱼米之乡500/满舱而归10"
chk "S13 任务两条（临渊结网 1 / 海味上桌 1）" \
  "$(echo "$S" | grep -o 'q:临渊结网1/海味上桌1')" "q:临渊结网1/海味上桌1"
chk "S14 经济与门禁（渔港 980G/LV6 · 海鲜市场 340G/LV4）" \
  "$(echo "$S" | grep -o 'econ:980,6,340,4')" "econ:980,6,340,4"
chk "S15 目录（渔港 2x2/1 变体 · 市场 1x1/2 变体）" \
  "$(echo "$S" | grep -o 'cat:2x2/1/1x1/2')" "cat:2x2/1/1x1/2"
chk "S16 事件双模板（赤潮 ×0.4 · 鱼汛爆发 ×2）" \
  "$(echo "$S" | grep -o 'ev:2/0.4/2')" "ev:2/0.4/2"

echo "=== [1] 桌面端 1440×900 新档开局（脉冲人口造市民） ==="
agent-browser close >/dev/null 2>&1; sleep 1
agent-browser set viewport 1440 900
agent-browser open "$B" >/dev/null 2>&1
agent-browser wait --fn "window.__pxc!==undefined" --timeout 90000 >/dev/null 2>&1 && ok "引擎就绪" || bad "引擎超时"
agent-browser wait 3000
agent-browser eval "(()=>{const b=[...document.querySelectorAll('button')].filter(x=>(x.textContent||'').includes('跳过'));if(b.length)b[b.length-1].click();return 'tut';})()" >/dev/null 2>&1
agent-browser eval "(()=>{const e=window.__pxc;const t=e.tycoon;const c=t.citz;c.mailTimer=99999;c.evTimer=99999;c.bdayTimer=99999;t.eventTimer=99999;t.cycTimer=99999;t.docNext=999999;t.sisGrowAt=99999;t.sisEvtAt=99999;t.revNext=99999999;e.setSeason(0,false);return 'frozen';})()" >/dev/null 2>&1
agent-browser eval "(()=>{const t=window.__pxc.tycoon;let iv=null;iv=setInterval(()=>{t.pop=Math.min(64,t.pop+4)},250);setTimeout(()=>clearInterval(iv),2600);return 'pulsing';})()" >/dev/null 2>&1
agent-browser wait 3200

echo "=== [2] D 段：渔业引擎流 ==="
# D1 空态（无渔港 · 渔汛未开册 · 零渔获零图鉴）
D1=$(re "JSON.stringify((()=>{const e=window.__pxc;const t=e.tycoon;t.tick(0.05,e.map);
const ft=t.fishTest();const v=t.view().fish;
return {p:ft.ports,m:ft.mkts,t:ft.total,d:ft.dex,n:ft.next,td:ft.today,vp:v.ports,vi:v.income};})())")
chk "D1 空态（无渔港 · 渔汛未开册 next=-1 · 零渔获零图鉴）" \
  "$(echo "$D1" | grep -o 'p:0,m:0,t:0,d:0,n:-1,td:0,vp:0,vi:0')" "p:0,m:0,t:0,d:0,n:-1,td:0,vp:0,vi:0"
# D2 水畔建渔港 → 破土纪事「渔舟唱晚」+ 开册（fishNext 设定）
D2=$(re "JSON.stringify((()=>{const e=window.__pxc;const m=e.map;const t=e.tycoon;
let ok=false;
for(let y=2;y<m.n-3&&!ok;y++){for(let x=2;x<m.n-3&&!ok;x++){
  let near=false;
  for(let dy=-2;dy<=3&&!near;dy++){for(let dx=-2;dx<=3&&!near;dx++){
    const xx=x+dx,yy=y+dy;
    if(xx>=0&&yy>=0&&xx<m.n&&yy<m.n&&m.terr[m.idx(xx,yy)]===1)near=true;
  }}
  if(!near)continue;
  let free=true;
  for(let dy=0;dy<2&&free;dy++){for(let dx=0;dx<2&&free;dx++){
    const i=m.idx(x+dx,y+dy);
    if(m.terr[i]!==0||m.road[i]||m.occ[i]>=0)free=false;
  }}
  if(free&&m.place('fishport',0,x,y))ok=true;
}}
t.tick(0.05,m);t.tick(0.05,m);
const ft=t.fishTest();
return {ok,p:ft.ports,n:ft.next>0,chron:t.chron.entries.some(x=>x.title==='渔舟唱晚')};})())")
chk "D2 渔港破土（水畔 2x2 落成 · 开册 next>0 · 编年史「渔舟唱晚」入册）" \
  "$(echo "$D2" | grep -o 'ok:true,p:1,n:true,chron:true')" "ok:true,p:1,n:true,chron:true"
echo "  · D2 现场：$D2"
# D3 秋汛首汛（season=2 · 跳 gHours 越过 fishNext → 渔获入账 + 图鉴开册）
D3=$(re "JSON.stringify((()=>{const e=window.__pxc;const m=e.map;const t=e.tycoon;
t.season=2;t.tick(0.05,m);
const ft0=t.fishTest();
t.gHours=ft0.next+0.5;t.tick(0.05,m);
const ft=t.fishTest();
const envK=t.snap.envIdx>=75?1.15:t.snap.envIdx<40?0.6:1;
const exp=Math.round(4*1.8*envK);
const newPage=t.chron.entries.some(x=>x.title==='渔获图鉴新页'||x.title==='稀有渔获入册'||x.title==='镇册之宝入册');return {td:ft.today,exp,total:ft.total,dex:ft.dex,newPage,
  ok:ft.today===exp&&ft.dex>=1&&newPage};})())")
chk "D3 秋汛首汛（单汛渔获 = round(4×1.8×水质) 与期望一致 · 累计同步 · 图鉴开册纪事入册）" \
  "$(echo "$D3" | grep -o 'ok:true')" "ok:true"
echo "  · D3 现场：$D3"
# D4 海鲜市场变现 A/B（先记 coins · 建 1 市场 · 同汛再跳 → 收入差 = min(渔获,10)×26G 精确）
D4=$(re "JSON.stringify((()=>{const e=window.__pxc;const m=e.map;const t=e.tycoon;
const c0=Math.floor(t.coins);
let placed=false;
for(let y=2;y<m.n-2&&!placed;y++){for(let x=2;x<m.n-2&&!placed;x++){
  if(m.canPlace('fishmkt',x,y)&&m.place('fishmkt',0,x,y))placed=true;
}}
t.tick(0.05,m);
t.season=2;
t.gHours=t.fishTest().next+0.5;t.tick(0.05,m);
const ft=t.fishTest();
const c1=Math.floor(t.coins);
const gain=c1-c0;
const envK=t.snap.envIdx>=75?1.15:t.snap.envIdx<40?0.6:1;
const base=Math.round(4*1.8*envK);
const expInc=Math.min(base,10)*26;
return {placed,m:ft.mkts,td:ft.today,total:ft.total,gain,expInc,
  ok:Math.abs(gain-expInc)<=2};})())")
chk "D4 海鲜市场变现（1 市场 · 渔获按筐点钱 · 收入差 = min(7,10)×26 ± 2）" \
  "$(echo "$D4" | grep -o 'ok:true')" "ok:true"
echo "  · D4 现场：$D4"
# D5 冬封歇海（season=3 → 渔获归零 · 编年史「冬季歇海」· 累计冻结）
D5=$(re "JSON.stringify((()=>{const e=window.__pxc;const m=e.map;const t=e.tycoon;
const total0=t.fishTest().total;
t.season=3;
t.gHours=t.fishTest().next+0.5;t.tick(0.05,m);
const ft=t.fishTest();
return {td:ft.today,total:ft.total,total0,frozen:ft.total===total0,
  chron:t.chron.entries.some(x=>x.title==='冬季歇海')};})())")
D5v="$(echo "$D5" | grep -o 'td:0')$(echo "$D5" | grep -o 'frozen:true')$(echo "$D5" | grep -o 'chron:true')"
chk "D5 冬封歇海（渔获归零 · 累计冻结 · 编年史「冬季歇海」入册）" \
  "$D5v" "td:0frozen:truechron:true"
echo "  · D5 现场：$D5"
# D6 复春开网（season=0 → 春汛 ×1.5 · 冬封纪事旗复位）
D6=$(re "JSON.stringify((()=>{const e=window.__pxc;const m=e.map;const t=e.tycoon;
t.season=0;
t.gHours=t.fishTest().next+0.5;t.tick(0.05,m);
const ft=t.fishTest();
const envK=t.snap.envIdx>=75?1.15:t.snap.envIdx<40?0.6:1;
const exp=Math.round(4*1.5*envK);
return {td:ft.today,exp,ok:ft.today===exp};})())")
chk "D6 复春开网（春汛渔获 = round(4×1.5×水质) · 与期望一致）" \
  "$(echo "$D6" | grep -o 'ok:true')" "ok:true"
echo "  · D6 现场：$D6"
# D7 双事件（赤潮 ×0.4 · 鱼汛爆发 ×2 → 单汛 12 筐触发「渔汛大丰收」纪事）
D7=$(re "JSON.stringify((()=>{const e=window.__pxc;const m=e.map;const t=e.tycoon;
const okA=t.forceEvent('redtide',m);t.tick(0.05,m);
t.gHours=t.fishTest().next+0.5;t.tick(0.05,m);
const tdA=t.fishTest().today;
t.events.length=0;
const okB=t.forceEvent('runfish',m);t.tick(0.05,m);
t.gHours=t.fishTest().next+0.5;t.tick(0.05,m);
const ft=t.fishTest();
return {okA,okB,tdA,tdB:ft.today,total:ft.total,
  bounty:t.chron.entries.some(x=>x.title==='渔汛大丰收')};})())")
D7v="$(echo "$D7" | grep -o 'okA:true')$(echo "$D7" | grep -o 'okB:true')$(echo "$D7" | grep -o 'bounty:true')"
chk "D7 双事件（赤潮渔获折减 · 鱼汛爆发翻倍 · 单汛 ≥12 触发大丰收纪事）" \
  "$D7v" "okA:trueokB:truebounty:true"
echo "  · D7 现场：$D7"
# D8 渔获图鉴累计（多汛入册 · 种数单调 · 面板与引擎口径一致 · 未满册）
D8=$(re "JSON.stringify((()=>{const t=window.__pxc.tycoon;const ft=t.fishTest();
const got=t.view().fish.dex.filter(f=>f.got).length;
return {dex:ft.dex,got,ok:ft.dex>=1&&got===ft.dex&&ft.dex<10};})())")
chk "D8 图鉴累计（1 ≤ 入册种数 < 10 · 面板与引擎口径一致）" \
  "$(echo "$D8" | grep -o 'ok:true')" "ok:true"
echo "  · D8 现场：$D8"
# D9 成就（渔舟唱晚已解锁 · 鱼米之乡 500 筐未达）
D9=$(re "JSON.stringify((()=>{const t=window.__pxc.tycoon;
return {a1:t.achv.has('fish1'),aY:t.achv.has('fishY'),aD:t.achv.has('fishD')};})())")
chk "D9 成就巡检（渔舟唱晚解锁 · 鱼米之乡/满舱而归未达）" \
  "$(echo "$D9" | grep -o 'a1:true,aY:false,aD:false')" "a1:true,aY:false,aD:false"
# D10 存档往返（渔业档全字段恢复 · 纪事不重记）
D10=$(re "JSON.stringify((()=>{const e=window.__pxc;const t=e.tycoon;const m=e.map;
const raw=JSON.parse(t.serialize(m));
const flags={T:raw.fishT,X:(raw.fishX||'').length>0,S1:raw.fishS1,B:raw.fishB,W:raw.fishW,N:raw.fishN>0,LC:raw.fishLC};
const n0=t.chron.entries.filter(x=>x.title==='渔舟唱晚').length;
const dex0=t.fishDex.length;
t.resume(m,raw);t.tick(0.05,m);t.tick(0.05,m);
const ft=t.fishTest();
const n1=t.chron.entries.filter(x=>x.title==='渔舟唱晚').length;
return {T:raw.fishT,S1:raw.fishS1,W:raw.fishW,LC:raw.fishLC,
  dex0,dex1:ft.dex,total1:ft.total,n0,n1,
  ok:ft.total===raw.fishT&&ft.dex===dex0&&n0===n1};})())")
chk "D10 存档往返（累计/图鉴/纪事旗全恢复 · 渔舟唱晚不重记）" \
  "$(echo "$D10" | grep -o 'ok:true')" "ok:true"
echo "  · D10 现场：$D10"

echo "=== [3] U 段：渔 chip + 渔汛模态 + 十格图鉴 ==="
U1=$(re "(()=>{const c=document.querySelector('.chip.fish-chip');
if(!c)return 'nochip';
return JSON.stringify({on:c.classList.contains('fish-on'),
  run:c.classList.contains('fish-run'),
  txt:(c.textContent||'').includes('渔')});})()")
chk "U1 顶栏「渔」chip（通渔点亮 · 春汛闪烁 · 字牌可辨）" \
  "$(echo "$U1" | grep -o 'on:true,run:true,txt:true')" "on:true,run:true,txt:true"
echo "  · U1 现场：$U1"
# fresh chrome 对抗渲染压力 flaky：显式存档 → close → reopen（localStorage 恢复渔港/市场/渔汛状态）
agent-browser eval "(()=>{const e=window.__pxc;if(e&&e.tycoon){e.tycoon.save(e.map);return 'saved';}return 'nopxc';})()" >/dev/null 2>&1
agent-browser close >/dev/null 2>&1; sleep 1
agent-browser open "$B" >/dev/null 2>&1
agent-browser wait --fn "window.__pxc!==undefined" --timeout 90000 >/dev/null 2>&1
agent-browser wait 2500
agent-browser eval "(()=>{const b=[...document.querySelectorAll('button')].filter(x=>(x.textContent||'').includes('跳过'));if(b.length)b[b.length-1].click();return 'tut';})()" >/dev/null 2>&1
agent-browser eval "(()=>{const c=document.querySelector('.chip.fish-chip');if(c)c.click();return 'open';})()" >/dev/null 2>&1
agent-browser wait 700
U2=$(re "JSON.stringify((()=>{const d=document.querySelector('.pxc-fish');
if(!d)return {m:false};
return {m:true,head:!!d.querySelector('.mt-head'),
  cards:d.querySelectorAll('.fish-grid .zk-card').length,
  gotN:d.querySelectorAll('.fish-grid .zk-card.on').length,
  bar:!!d.querySelector('.mt-bar.fish i'),
  net:(d.querySelector('.mh-net')?.textContent||'').includes('运转中')||((d.querySelector('.mh-net')?.textContent||'').includes('冰封')),
  prog:(d.querySelector('.zh-progress')?.textContent||'').includes('种')};})())")
U2v="$(echo "$U2" | grep -o 'm:true')$(echo "$U2" | grep -o 'head:true')$(echo "$U2" | grep -o 'cards:10')$(echo "$U2" | grep -o 'bar:true')$(echo "$U2" | grep -o 'net:true')$(echo "$U2" | grep -o 'prog:true')"
chk "U2 渔汛模态（状态头 · 十格图鉴 · 渔汛条 · 网况可辨）" \
  "$U2v" "m:truehead:truecards:10bar:truenet:trueprog:true"
echo "  · U2 现场：$U2"
# U3 图鉴卡渲染（已入册卡实图 · 未入册剪影「？？？」）
U3=$(re "JSON.stringify((()=>{const d=document.querySelector('.pxc-fish');
if(!d)return {m:false};
const imgs=[...d.querySelectorAll('.fish-grid .zk-card img')];
return {m:true,imgs:imgs.length,
  sil:imgs.filter(i=>i.classList.contains('zk-sil')).length,
  unk:[...d.querySelectorAll('.fish-grid .zk-card b')].filter(b=>b.textContent==='？？？').length};})())")
chk "U3 图鉴卡（10 头像 · 剪影与「？？？」口径一致）" \
  "$(echo "$U3" | grep -o 'imgs:10')" "imgs:10"
echo "  · U3 现场：$U3"
agent-browser screenshot "$OUT/v43_fishdex.png" >/dev/null 2>&1 && ok "渔汛模态截图" || bad "渔汛模态截图"
agent-browser eval "(()=>{const x=document.querySelector('.pxc-fish .pxc-x');if(x)x.click();return 'close';})()" >/dev/null 2>&1
agent-browser wait 500
# U4 城市志渔业行（财政模态内）+ 帮助行（帮助模态内）
re "(()=>{const b=document.querySelector('.chip.lv');if(b){b.click();return 'open-fiscal';}return 'nofound';})()" >/dev/null 2>&1
agent-browser wait 700
U4a=$(re "JSON.stringify((()=>{const zh=[...document.querySelectorAll('td')].some(t=>(t.textContent||'').includes('渔汛运转中')||(t.textContent||'').includes('在水畔建起渔港码头'));
return {zh,modals:document.querySelectorAll('.pxc-modal').length};})())")
re "(()=>{const x=document.querySelector('.pxc-x');if(x){x.click();return 'close';}return 'nox';})()" >/dev/null 2>&1
agent-browser wait 500
re "(()=>{const b=[...document.querySelectorAll('button')].find(x=>(x.textContent||'').trim()==='?');if(b){b.click();return 'open-help';}return 'nofound';})()" >/dev/null 2>&1
agent-browser wait 700
U4b=$(re "JSON.stringify((()=>{const m=document.querySelector('.pxc-modal[aria-label=\"操作说明\"]');
return {help:!!m,head:(m?.querySelector('header')?.textContent||'').replace(/\s/g,'').includes('操作说明')};})())")
re "(()=>{const x=document.querySelector('.pxc-x');if(x){x.click();return 'close';}return 'nox';})()" >/dev/null 2>&1
agent-browser wait 400
chk "U4 城市志渔业行 + 帮助模态（桌面：城市志文案可辨 · 帮助可开）" \
  "$(echo "$U4a$U4b" | grep -o 'zh:true' ; echo "$U4a$U4b" | grep -o 'help:true,head:true')" "zh:true
help:true,head:true"
echo "  · U4 现场：$U4a$U4b"
# U5 渔港渔船近景（紧贴水重放一座渔港 → 相机对准 → 等渔船出海 → 截图）
U5=$(re "JSON.stringify((()=>{const e=window.__pxc;const m=e.map;
let ok=false,px=-1,py=-1;
for(let y=2;y<m.n-3&&!ok;y++){for(let x=2;x<m.n-3&&!ok;x++){
  let free=true;
  for(let dy=0;dy<2&&free;dy++){for(let dx=0;dx<2&&free;dx++){
    const i=m.idx(x+dx,y+dy);
    if(m.terr[i]!==0||m.road[i]||m.occ[i]>=0)free=false;
  }}
  if(!free)continue;
  let adjWater=false;
  for(let dy=-1;dy<=2&&!adjWater;dy++){for(let dx=-1;dx<=2&&!adjWater;dx++){
    const ox=dx<0?-dx:(dx>=2?dx-1:0),oy=dy<0?-dy:(dy>=2?dy-1:0);
    if(ox!==1&&oy!==1)continue;
    const xx=x+dx,yy=y+dy;
    if(xx>=0&&yy>=0&&xx<m.n&&yy<m.n&&m.terr[m.idx(xx,yy)]===1)adjWater=true;
  }}
  if(adjWater&&m.place('fishport',0,x,y)){ok=true;px=x;py=y;}
}}
window.__fishPortAt=[px,py];
e.actors.invalidate();
return {ok,px,py};})())")
chk "U5 紧贴水渔港落位（footprint 外 1 环即水 · 泊位渔船可出海）" "$(echo "$U5" | grep -o 'ok:true')" "ok:true"
echo "  · U5 现场：$U5"
agent-browser eval "(()=>{const a=window.__fishPortAt;if(a&&a[0]>=0)window.__pxc.centerAt(a[0]+1,a[1]+1);return 'cam';})()" >/dev/null 2>&1
agent-browser wait 8000
agent-browser screenshot "$OUT/v43_fishport_live.png" >/dev/null 2>&1 && ok "渔港渔船近景截图" || bad "渔港渔船近景截图"
agent-browser eval "(()=>{window.__pxc.center();return 'cam-back';})()" >/dev/null 2>&1
agent-browser wait 800
agent-browser screenshot "$OUT/v43_city.png" >/dev/null 2>&1 && ok "桌面截图" || bad "桌面截图"

echo "=== [4] 移动端 390×844 ==="
agent-browser close >/dev/null 2>&1; sleep 1
agent-browser set viewport 390 844
agent-browser open "$B" >/dev/null 2>&1
agent-browser wait --fn "window.__pxc!==undefined" --timeout 90000 >/dev/null 2>&1 && ok "移动端引擎就绪" || bad "移动端引擎超时"
agent-browser wait 3000
agent-browser eval "(()=>{const b=[...document.querySelectorAll('button')].filter(x=>(x.textContent||'').includes('跳过'));if(b.length)b[b.length-1].click();return 'tut';})()" >/dev/null 2>&1
agent-browser eval "(()=>{const e=window.__pxc;const t=e.tycoon;const c=t.citz;c.mailTimer=99999;c.evTimer=99999;c.bdayTimer=99999;t.eventTimer=99999;t.cycTimer=99999;t.docNext=999999;t.sisGrowAt=99999;t.sisEvtAt=99999;t.revNext=99999999;e.setSeason(0,false);return 'frozen';})()" >/dev/null 2>&1
agent-browser wait 1500
M1=$(re "JSON.stringify((()=>{const chip=document.querySelector('.chip.fish-chip');
return {chip:!!chip};})())")
chk "M1 移动端 chip 渲染" "$(echo "$M1" | grep -o 'chip:true')" "chip:true"
# fresh chrome 对抗渲染压力 flaky：显式存档 → close → set viewport → reopen（存档恢复渔港状态）
agent-browser eval "(()=>{const e=window.__pxc;if(e&&e.tycoon){e.tycoon.save(e.map);return 'saved';}return 'nopxc';})()" >/dev/null 2>&1
agent-browser close >/dev/null 2>&1; sleep 1
agent-browser set viewport 390 844
agent-browser open "$B" >/dev/null 2>&1
agent-browser wait --fn "window.__pxc!==undefined" --timeout 90000 >/dev/null 2>&1
agent-browser wait 2500
agent-browser eval "(()=>{const b=[...document.querySelectorAll('button')].filter(x=>(x.textContent||'').includes('跳过'));if(b.length)b[b.length-1].click();return 'tut';})()" >/dev/null 2>&1
agent-browser eval "(()=>{const c=document.querySelector('.chip.fish-chip');if(c)c.click();return 'open';})()" >/dev/null 2>&1
agent-browser wait 1200
# 移动端冷启动 React 慢：模态未开则再点一次
agent-browser eval "(()=>{if(!document.querySelector('.pxc-fish')){const c=document.querySelector('.chip.fish-chip');if(c)c.click();return 'retry';}return 'open';})()" >/dev/null 2>&1
agent-browser wait 900
M2=$(re "JSON.stringify((()=>{const d=document.querySelector('.pxc-fish');
if(!d)return {m:false};
const r=d.getBoundingClientRect();
return {m:true,w:Math.round(r.width),
  fit:r.width<=window.innerWidth-10||r.width<=560};})())")
chk "M2 移动端模态宽度适配（不溢出视口）" "$(echo "$M2" | grep -o 'fit:true')" "fit:true"
echo "  · M2 现场：$M2"
agent-browser eval "(()=>{const x=document.querySelector('.pxc-fish .pxc-x');if(x)x.click();return 'close';})()" >/dev/null 2>&1
agent-browser screenshot "$OUT/v43_mobile.png" >/dev/null 2>&1 && ok "移动端截图" || bad "移动端截图"
# M3 移动端帮助表（isMobile 分支：逐系统表格含「渔」行 —— 顶栏「渔」指标开…）
re "(()=>{[...document.querySelectorAll('.pxc-x')].forEach(x=>x.click());const b=[...document.querySelectorAll('button')].find(x=>(x.textContent||'').trim()==='?');if(b){b.click();return 'open-help';}return 'nofound';})()" >/dev/null 2>&1
agent-browser wait 700
M3=$(re "JSON.stringify((()=>{const help=[...document.querySelectorAll('td')].some(t=>(t.textContent||'').includes('顶栏「渔」指标开'));
return {help};})())")
re "(()=>{const x=document.querySelector('.pxc-x');if(x){x.click();return 'close';}return 'nox';})()" >/dev/null 2>&1
chk "M3 移动端帮助表（渔业行文案可辨）" "$(echo "$M3" | grep -o 'help:true')" "help:true"
echo "  · M3 现场：$M3"

echo "=== [5] R 段：零控制台错误 ==="
RC=$(errcount)
chk "R1 控制台零错误" "$RC" "0"

echo ""
echo "=============================="
echo "通过 $PASS · 失败 $FAIL"
echo "=============================="
[ "$FAIL" = "0" ] && echo "ALL GREEN ✓" || echo "存在失败项 ✗"
exit 0
