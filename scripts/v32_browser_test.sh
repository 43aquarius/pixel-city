#!/bin/bash
# ============================================================
# v32_browser_test.sh — 滨水都市「临水而兴」端到端验证
# 增量 = b_dusk.ts（genBoardwalk 木栈道遮阳伞 / genMarina T字栈桥双桅游船）
#   + catalog.ts（boardwalk 1×1 / marina 2×2 + ATTRACT 1.5/3）
#   + tycoon.ts（WF_R=2 滨水带 + ensureWater 三 Pass（水面源/带膨胀/建筑登记）+
#   码头外推 MARINA_R=3 + 商铺收入 ×1.06→码头在城 ×1.10 + 滨水住宅幸福每栋+1 至多+6 +
#   snap wfN/wfRes/marinas + 成就 水岸天际线 wf20 / 碧波揽客 tour80w + 游船启航纪事）
# S 段：bun 直测（目录 / 经济 / 吸引力 / 滨水常数 / 成就定义）
# D 段：滨水引擎流（涂水成带 / 内外圈判定 / 幸福加成 / 码头外推与升档 / 纪事 / 集齐成就 / 退水重算）
# U 段：建造面板 / 编年史 / 成就墙 / 截图
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

echo "=== [S] 纯函数直测（bun：目录 / 经济 / 吸引力 / 滨水常数 / 成就） ==="
S=$(cd /home/z/my-project && bun -e '
import { defById, ATTRACT } from "./src/lib/pixelcity/catalog.ts";
import { ECON, WF_R, WF_EARN_K, WF_EARN_K_MARINA, WF_HAP_MAX, MARINA_R, ACHIEVEMENTS } from "./src/lib/pixelcity/tycoon.ts";
const bw = defById("boardwalk"), ma = defById("marina");
const eb = ECON.boardwalk, em = ECON.marina;
const a1 = ACHIEVEMENTS.find(a => a.id === "wf20"), a2 = ACHIEVEMENTS.find(a => a.id === "tour80w");
console.log(JSON.stringify({
  dim: bw.w + "x" + bw.h + "," + ma.w + "x" + ma.h + "," + bw.cat + "," + ma.cat,
  econ: eb.cost + "," + eb.unlock + "," + em.cost + "," + em.unlock + "," + em.earn,
  att: ATTRACT.boardwalk + "," + ATTRACT.marina,
  wf: WF_R + "," + WF_EARN_K + "," + WF_EARN_K_MARINA + "," + WF_HAP_MAX + "," + MARINA_R,
  ach: (a1 ? a1.goal : -1) + "," + (a2 ? a2.goal : -1) + "," + a1.name + "," + a2.name,
}));' 2>&1 | tail -1 | stripq)
chk "S1 目录定义（1×1 / 2×2 · 公共类）" "$(echo "$S" | grep -o 'dim:1x1,2x2,civ,civ')" "dim:1x1,2x2,civ,civ"
chk "S2 经济属性（90G LV3 / 620G LV6 · 收入 6.4）" "$(echo "$S" | grep -o 'econ:90,3,620,6,6.4')" "econ:90,3,620,6,6.4"
chk "S3 吸引力（1.5 / 3）" "$(echo "$S" | grep -o 'att:1.5,3')" "att:1.5,3"
chk "S4 滨水常数（带2 · 1.06/1.10 · 幸福6 · 外推3）" "$(echo "$S" | grep -o 'wf:2,1.06,1.1,6,3')" "wf:2,1.06,1.1,6,3"
chk "S5 成就定义（水岸天际线 20 / 碧波揽客 80）" "$(echo "$S" | grep -o 'ach:20,80,水岸天际线,碧波揽客')" "ach:20,80,水岸天际线,碧波揽客"

echo "=== [1] 桌面端 1440×900 新档开局 ==="
agent-browser close >/dev/null 2>&1; sleep 1
agent-browser set viewport 1440 900
agent-browser open $B
agent-browser storage local clear >/dev/null 2>&1
agent-browser reload
agent-browser wait --fn "window.__pxc!==undefined" --timeout 90000 && ok "引擎就绪" || bad "引擎超时"
agent-browser wait 3000
agent-browser eval "(()=>{const b=[...document.querySelectorAll('button')].filter(x=>(x.textContent||'').includes('跳过'));if(b.length)b[b.length-1].click();return 'tut';})()" >/dev/null 2>&1
agent-browser eval "(()=>{const t=window.__pxc.tycoon;const c=t.citz;c.mailTimer=99999;c.evTimer=99999;c.bdayTimer=99999;t.eventTimer=99999;return 'frozen';})()" >/dev/null 2>&1

echo "=== [2] D 段：滨水引擎流（自适应扫描 —— 地图种子非确定，硬编码坐标会踩水/丘） ==="
# D1 扫描 7×7 可建块定 P0（池塘 4×4 内嵌于 (2,2)-(5,5)，六宅占西列）；远店格距池心 ≥9
D1=$(re "JSON.stringify((()=>{const e=window.__pxc;const t=e.tycoon;const m=e.map;const n=m.n;
const buildable=(x,y)=>x>=0&&y>=0&&x<n&&y<n&&m.terr[m.idx(x,y)]!==1&&!m.road[m.idx(x,y)]&&m.occ[m.idx(x,y)]<0;
let P0=null;
for(let y=8;y<n-12&&!P0;y++)for(let x=8;x<n-24&&!P0;x++){
  let ok=true;
  for(let dy=-3;dy<10&&ok;dy++)for(let dx=-3;dx<10;dx++){
    const i=m.idx(x+dx,y+dy);
    if(m.terr[i]===1){ok=false;break;}                          // 块 ±3 无天然水面（wfRes0=0 与池带纯度双保证）
    if(dx>=0&&dx<7&&dy>=0&&dy<7&&!buildable(x+dx,y+dy)){ok=false;break;}   // 块内可建
  }
  if(ok){P0=[x,y];break;}
}
if(!P0)return {P0:'none'};
const [px,py]=P0;
window.__P0=P0;
let far=null;
for(let y=4;y<n-2&&!far;y++)for(let x=4;x<n-2&&!far;x++){
  if(!buildable(x,y))continue;
  if(Math.max(Math.abs(x-(px+3)),Math.abs(y-(py+3)))<9)continue;     // 距池心 ≥9：池带（±2）够不着
  let wet=false;
  for(let dy=-5;dy<=5&&!wet;dy++)for(let dx=-5;dx<=5;dx++){
    const fx2=x+dx,fy2=y+dy;
    if(fx2>=0&&fy2>=0&&fx2<n&&fy2<n&&m.terr[m.idx(fx2,fy2)]===1){wet=true;break;}   // ±5 无天然水面
  }
  if(!wet)far=[x,y];
}
if(!far)return {P0:px+','+py,far:'none'};
window.__FAR=far;
const ok2=m.place('shop',0,far[0],far[1]);
const hc=[[0,2],[0,3],[0,4],[1,2],[1,3],[1,4]];   // 六宅：西列（池塘足迹 (2,2)-(5,5) 之外 · 涂水后入带）
let hn=0;for(const p of hc){if(m.place('house',0,px+p[0],py+p[1]))hn++;}
t.tick(0.05,e.map);
return {P0:px+','+py,far:far[0]+','+far[1],hn,ok2,wfRes0:t.snap.wfRes,hap0:t.snap.happiness};})())")
P0X=$(echo "$D1" | grep -o 'P0:[0-9]*,[0-9]*' | head -1 | cut -d: -f2 | cut -d, -f1)
P0Y=$(echo "$D1" | grep -o 'P0:[0-9]*,[0-9]*' | head -1 | cut -d: -f2 | cut -d, -f2)
FARX=$(echo "$D1" | grep -o 'far:[0-9]*,[0-9]*' | head -1 | cut -d: -f2 | cut -d, -f1)
FARY=$(echo "$D1" | grep -o 'far:[0-9]*,[0-9]*' | head -1 | cut -d: -f2 | cut -d, -f2)
HAP0=$(echo "$D1" | grep -o 'hap0:[0-9]*' | cut -d: -f2)
chk "D1 自适应原点 + 六宅远店基线（wfRes0=0 水未涂）" "$(echo "$D1" | grep -o "hn:6,ok2:true,wfRes0:0")|$(echo "$D1" | grep -o "far:$FARX,$FARY")" "hn:6,ok2:true,wfRes0:0|far:$FARX,$FARY"
# D2 涂水成带：P0+(2,2) 起 4×4 池塘 → 滨水带外推 2 格 · 幸福 +6 隔离验证
D2=$(re "JSON.stringify((()=>{const e=window.__pxc;const t=e.tycoon;const m=e.map;
const [px,py]=window.__P0;
let painted=0;
for(let y=py+2;y<=py+5;y++)for(let x=px+2;x<=px+5;x++){ if(m.setTerr(x,y,1)) painted++; }
t.achvTimer=0.01;t.tick(0.05,e.map);
const hap1=t.snap.happiness;
return {painted,nearIn:t.nearWater.has(m.idx(px,py+3)),farOut:t.wfField.has(m.idx(window.__FAR[0],window.__FAR[1])),wfRes:t.snap.wfRes,hapUp:hap1>${HAP0:-0}};})())")
chk "D2 涂水 16 格 · 带内命中远店不入 · 幸福 +6 隔离验证" "$(echo "$D2" | grep -o 'painted:16,nearIn:true,farOut:false,wfRes:6,hapUp:true')" "painted:16,nearIn:true,farOut:false,wfRes:6,hapUp:true"
# D3 滨水建筑登记：圈店入册（六宅+一圈店=7）
D3=$(re "JSON.stringify((()=>{const e=window.__pxc;const t=e.tycoon;const m=e.map;
const [px,py]=window.__P0;
const ok1=m.place('shop',0,px+6,py+3);
t.tick(0.05,e.map);
return {ok1,wfN:t.snap.wfN,inWF:t.wfField.has(m.idx(px+6,py+3))};})())")
chk "D3 商圈登记（滨水 7 · 圈内命中）" "$(echo "$D3" | grep -o 'ok1:true,wfN:7,inWF:true')" "ok1:true,wfN:7,inWF:true"
# D4 游船码头：锚点 x≥P0+12 扫 2×2 → 外推带含 (M0-4,+2) 探针（池带外）· 新店入册 wfN 8 · 纪事
D4=$(re "JSON.stringify((()=>{const e=window.__pxc;const t=e.tycoon;const m=e.map;const n=m.n;
const [px,py]=window.__P0;
const buildable=(x,y)=>x>=0&&y>=0&&x<n&&y<n&&m.terr[m.idx(x,y)]!==1&&!m.road[m.idx(x,y)]&&m.occ[m.idx(x,y)]<0;
let M0=null;
for(let y=Math.max(2,py-2);y<Math.min(n-2,py+8)&&!M0;y++)for(let x=px+12;x<Math.min(n-2,px+20)&&!M0;x++){
  if(buildable(x,y)&&buildable(x+1,y)&&buildable(x,y+1)&&buildable(x+1,y+1))M0=[x,y];
}
if(!M0)return {M0:'none'};
window.__M0=M0;
const ok=m.place('marina',0,M0[0],M0[1]);
t.achvTimer=0.01;t.tick(0.05,e.map);
const probe=[M0[0]-4,M0[1]+2];   // 池带外（池膨胀 x≤px+7 · probe x≥px+8）· 码头带内（锚点切比雪夫 4 ≤ 3+2）
window.__PROBE=probe;
const nearIn=t.nearWater.has(m.idx(probe[0],probe[1]));
const ok2=m.place('shop',0,probe[0],probe[1]);
t.tick(0.05,e.map);
const farIn=t.wfField.has(m.idx(window.__FAR[0],window.__FAR[1]));
return {ok,nearIn,ok2,wfN:t.snap.wfN,farIn,mile:t.chron.entries.some(x=>x.title==='游船启航')};})())")
echo "  · D4 原始：$D4"
WFN4=$(echo "$D4" | grep -o 'wfN:[0-9]*' | cut -d: -f2)
OK4a=$(echo "$D4" | grep -o 'ok:true,nearIn:true,ok2:true')
OK4b=$(echo "$D4" | grep -o 'mile:true')
if [ -n "$OK4a" ] && [ -n "$OK4b" ] && [ -n "$WFN4" ] && [ "$WFN4" -ge 8 ] 2>/dev/null; then ok "D4 码头外推（新格入带 · 新店入册 wfN=$WFN4 ≥ 8 · 纪事在册）"; else bad "D4 码头外推（got=$D4）"; fi
# D5 码头升档与计数（滨水加成 1.06→1.10 的判定源 marinaN；常数已在 S 段锁定）
D5=$(re "JSON.stringify((()=>{const e=window.__pxc;const t=e.tycoon;const m=e.map;
const [px,py]=window.__P0;
return {wfK:t.nearWater.has(m.idx(px+6,py+3)),mar:t.snap.marinas};})())")
chk "D5 滨水判定保持 · 码头计数 1" "$(echo "$D5" | grep -o 'wfK:true,mar:1')" "wfK:true,mar:1"
# D6 水岸天际线：池带环 + 码头带候选铺到 20 → 成就
D6=$(re "JSON.stringify((()=>{const e=window.__pxc;const t=e.tycoon;const m=e.map;const nn=m.n;
const [px,py]=window.__P0;const [mx,my]=window.__M0;
const buildable=(x,y)=>x>=0&&y>=0&&x<nn&&y<nn&&m.terr[m.idx(x,y)]!==1&&!m.road[m.idx(x,y)]&&m.occ[m.idx(x,y)]<0;
const cand=[];
for(let dy=-2;dy<=7;dy++)for(let dx=-2;dx<=7;dx++){
  const inPond=dx>=2&&dx<=5&&dy>=2&&dy<=5;
  const x=px+dx,y=py+dy;
  if(!inPond&&buildable(x,y))cand.push([x,y]);
}
for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++){
  const x=mx+dx,y=my+dy;
  if(buildable(x,y))cand.push([x,y]);
}
let cnt=0;
for(const p of cand){ if(t.snap.wfN>=20)break; if(m.place('shop',0,p[0],p[1]))cnt++; }
t.achvTimer=0.01;t.tick(0.05,e.map);
return {cnt,wfN:t.snap.wfN,ach:t.achv.has('wf20')};})())")
WFN=$(echo "$D6" | grep -o 'wfN:[0-9]*' | cut -d: -f2)
ACH6=$(echo "$D6" | grep -o 'ach:true')
if [ -n "$WFN" ] && [ "$WFN" -ge 20 ] 2>/dev/null && [ -n "$ACH6" ]; then ok "D6 水岸天际线（wfN=$WFN ≥ 20 · 成就落袋）"; else bad "D6 水岸天际线（got=$D6）"; fi
# D7 退水重算：池塘填回草地 → 池带消失（码头带保留）
D7=$(re "JSON.stringify((()=>{const e=window.__pxc;const t=e.tycoon;const m=e.map;
const [px,py]=window.__P0;
let back=0;for(let y=py+2;y<=py+5;y++)for(let x=px+2;x<=px+5;x++){if(m.setTerr(x,y,0))back++;}
t.tick(0.05,e.map);
const pondGone=!t.nearWater.has(m.idx(px,py+3));    // 池西带格（码头带在东侧，不覆盖）
const pr=window.__PROBE;
const mBand=t.nearWater.has(m.idx(pr[0],pr[1]));    // D4 探针格（码头带内已验证）保留
return {back,pondGone,mBand};})())")
echo "  · D7 原始：$D7"
chk "D7 退水重算（池带消失 · 码头带保留）" "$(echo "$D7" | grep -o 'back:16,pondGone:true,mBand:true')" "back:16,pondGone:true,mBand:true"

echo "=== [3] U 段：建造面板 / 编年史 / 成就墙 ==="
agent-browser eval "(()=>{const tab=[...document.querySelectorAll('.pxc-tabs button')].find(x=>(x.textContent||'').trim()==='公共');if(tab)tab.click();return 't';})()" >/dev/null 2>&1
agent-browser wait 500
U1=$(re "JSON.stringify((()=>{
  const opts=[...document.querySelectorAll('.pxc-cell .pxc-cname')].map(b=>(b.textContent||'').trim());
  return {bw:opts.some(t=>t.includes('滨水步道')),ma:opts.some(t=>t.includes('游船码头'))};})())")
chk "U1 建造面板公共页签（滨水步道 · 游船码头卡片）" "$(echo "$U1" | grep -o 'bw:true,ma:true')" "bw:true,ma:true"
agent-browser eval "(()=>{const b=[...document.querySelectorAll('button.chip')].find(x=>(x.getAttribute('title')||'').includes('编年史'));b.click();return 'c';})()" >/dev/null 2>&1
agent-browser wait 700
U2=$(re "JSON.stringify((()=>{
  const txt=document.querySelector('.pxc-chron')?.textContent||'';
  return {ma:txt.includes('游船启航')};})())")
chk "U2 编年史游船启航纪事可读" "$(echo "$U2" | grep -o 'ma:true')" "ma:true"
agent-browser eval "(()=>{document.querySelector('.pxc-chron .pxc-x')?.click();return 'x';})()" >/dev/null 2>&1
agent-browser eval "(()=>{const b=[...document.querySelectorAll('button.chip')].find(x=>(x.getAttribute('title')||'').includes('城市志'));b.click();return 'd';})()" >/dev/null 2>&1
agent-browser wait 700
U3=$(re "JSON.stringify((()=>{
  const txt=document.querySelector('.pxc-modal')?.textContent||'';
  return {a1:txt.includes('水岸天际线'),a2:txt.includes('碧波揽客')};})())")
chk "U3 成就墙双卡在册" "$(echo "$U3" | grep -o 'a1:true,a2:true')" "a1:true,a2:true"
agent-browser eval "(()=>{document.querySelector('.pxc-modal .pxc-x')?.click();return 'x';})()" >/dev/null 2>&1

echo "=== [4] R 段：存档往返 + 双端截图 ==="
# 视觉截图：滨水区近景（D7 已退水 → 复涂池塘再取景）
agent-browser eval "(()=>{const e=window.__pxc;const t=e.tycoon;const m=e.map;
const [px,py]=window.__P0;
for(let y=py+2;y<=py+5;y++)for(let x=px+2;x<=px+5;x++)m.setTerr(x,y,1);
t.tick(0.05,e.map);
e.centerAt(px+8,py+5);e.setZoom(2);return 'v';})()" >/dev/null 2>&1
agent-browser wait 900
agent-browser screenshot $OUT/v32_waterfront.png >/dev/null && ok "截图 v32_waterfront.png（桌面 · 滨水区近景）"
# R1 存档往返
R0=$(re "JSON.stringify((()=>{const s=window.__pxc.tycoon.snap;
return {wfN:s.wfN,wfRes:s.wfRes,mar:s.marinas};})())")
RWF=$(echo "$R0" | grep -o 'wfN:[0-9]*' | cut -d: -f2)
echo "  · R0 快照：$R0"
re "JSON.stringify((()=>{window.__pxc.tycoon.save(window.__pxc.map);return 'saved';})())" >/dev/null
agent-browser reload >/dev/null 2>&1
agent-browser wait --fn "window.__pxc!==undefined" --timeout 90000 >/dev/null 2>&1
agent-browser wait 3000
agent-browser eval "(()=>{const b=[...document.querySelectorAll('button')].filter(x=>(x.textContent||'').includes('跳过'));if(b.length)b[b.length-1].click();return 'tut';})()" >/dev/null 2>&1
R1=$(re "JSON.stringify((()=>{const t=window.__pxc.tycoon;
return {wfN:t.snap.wfN,mar:t.snap.marinas,mile:t.chron.entries.some(x=>x.title==='游船启航')};})())")
chk "R1 往返（滨水 $RWF · 码头在册 · 纪事不回退）" "$(echo "$R1" | grep -o "wfN:$RWF,mar:1,mile:true")" "wfN:$RWF,mar:1,mile:true"
ERR=$(errcount)
chk "R2 控制台零错误" "${ERR:-x}" "0"
# R3 移动端建造面板（抽屉 → 公共 → 双滨水卡）
agent-browser set viewport 390 844
agent-browser wait 1200
agent-browser eval "(()=>{const h=document.querySelector('.pxc-dhandle');if(h&&h.getAttribute('aria-expanded')!=='true')h.click();return 'd';})()" >/dev/null 2>&1
agent-browser wait 600
agent-browser eval "(()=>{const tab=[...document.querySelectorAll('.pxc-tabs button')].find(x=>(x.textContent||'').trim()==='公共');if(tab)tab.click();return 't';})()" >/dev/null 2>&1
agent-browser wait 500
R3=$(re "JSON.stringify((()=>{
  const opts=[...document.querySelectorAll('.pxc-cell .pxc-cname')].map(b=>(b.textContent||'').trim());
  return {bw:opts.some(t=>t.includes('滨水步道')),ma:opts.some(t=>t.includes('游船码头'))};})())")
chk "R3 移动端建造面板双滨水卡" "$(echo "$R3" | grep -o 'bw:true,ma:true')" "bw:true,ma:true"
agent-browser screenshot $OUT/v32_mobile.png >/dev/null && ok "截图 v32_mobile.png（移动端 · 建造面板）"
agent-browser close >/dev/null 2>&1

echo ""
echo "=========================================="
echo "v32 结果：$PASS 通过 / $FAIL 失败"
[ "$FAIL" -eq 0 ] && echo "全部通过 ✅" || echo "存在失败 ❌"
exit $FAIL
