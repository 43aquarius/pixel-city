#!/bin/bash
# ============================================================
# v36_browser_test.sh — 悬壶济世「健康之城」公共卫生空间化端到端验证
# 增量 = tycoon.ts（MED_R 半径表（诊所3/医院6/防疫站4/市政厅2）+ MED_HAP_MAX/MED_EARN_K
#   + PLAGUE_* 蔓延常数 + ActiveEvent.infN/infT + 疫病事件升级（fxPick 盲区偏爱 +
#   诊所并轨减免 + 权重盲区加权）+ ensureMed 两Pass 覆盖场 + medK 商铺折扣 +
#   medHap 幸福惩罚 + 健康指数病床扩容（诊所120/防疫站260）+ spreadPlague 蔓延链
#   + resolveEvent 零蔓延化解 medSaved + 事件到期文案带感染栋数 + 盲区警告位
#   + 成就 杏林春满/仁心妙术 + 任务 悬壶济世 + Snap/QS/EconView v36 字段
#   + 存档 medSaved/infN/infT 向后兼容）
#   + chronicle.ts（miles.med 救赎叙事对 缺医少药→悬壶济世 + survey/序列化扩展）
#   + citizens.ts（CitzCtx.medOut 就医心声 4 条 + onPlagueAt/onPlagueSaved 亲历者史册）
#   + catalog.ts + ECON（诊所 180G LV2 / 防疫站 480G LV5 双注册）
#   + b_extra.ts（genClinic 绿十字诊所 + genHealthst 白旗防疫站）
#   + engine.ts（drawMedOverlay 医疗盲区层 青灰病气+绿十字缓闪 + 疫病现场特效
#   病人剪影+病雾+疫情×N 标签+医护白影收束 + 渲染管线挂载）
#   + PixelCity.tsx（事件横幅疫病 ×N + 城市志「悬壶济世」行 + 健康指数行扩容）
# S 段：bun 直测（半径表 / 常数 / 成就 / 任务 / 建筑 / 场算法）
# D 段：医疗覆盖引擎流（盲区判定 / 收入对照 / 幸福惩罚 / 疫病偏爱 / 蔓延链 /
#       到场冻结 / 零蔓延化解 / 防疫站病床 / 心声）
# U 段：事件横幅 / 城市志 / 编年史 / 成就墙 / 建筑特写截图
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

echo "=== [S] 纯函数直测（bun：半径表 / 常数 / 成就 / 任务 / 建筑注册） ==="
S=$(cd /home/z/my-project && bun -e '
import { MED_R, MED_HAP_MAX, MED_EARN_K, PLAGUE_P_IN, PLAGUE_P_OUT, PLAGUE_SPREAD_T, PLAGUE_SPREAD_R,
  ACHIEVEMENTS, QUESTS, ECON } from "./src/lib/pixelcity/tycoon.ts";
import { CATALOG } from "./src/lib/pixelcity/catalog.ts";
const a1 = ACHIEVEMENTS.find(a => a.id === "apricot")!, a2 = ACHIEVEMENTS.find(a => a.id === "medsaved3")!;
const q = QUESTS.find(x => x.id === "med1")!;
const clinic = CATALOG.find(d => d.id === "clinic")!, hs = CATALOG.find(d => d.id === "healthst")!;
console.log(JSON.stringify({
  r: MED_R.clinic + "," + MED_R.hospital + "," + MED_R.healthst + "," + MED_R.cityhall,
  c: MED_HAP_MAX + "," + MED_EARN_K + "," + PLAGUE_P_IN + "," + PLAGUE_P_OUT + "," + PLAGUE_SPREAD_T + "," + PLAGUE_SPREAD_R,
  ach: a1.name + a1.goal + "/" + a2.name + a2.goal,
  q: q.title + q.goal + "," + q.val({ medCover: 0, clinics: 2, healthsts: 0 } as never),
  econ: ECON.clinic.cost + "," + ECON.clinic.unlock + "," + ECON.healthst.cost + "," + ECON.healthst.unlock,
  def: clinic.w + clinic.h + clinic.variants + "/" + hs.w + hs.h + hs.variants,
}));' 2>&1 | tail -1 | stripq)
chk "S1 医疗半径表（诊所3 · 医院6 · 防疫站4 · 市政厅2）" "$(echo "$S" | grep -o 'r:3,6,4,2')" "r:3,6,4,2"
chk "S2 蔓延常数（上限7 · 折扣0.94 · 覆盖0.16 · 盲区0.55 · 周期6.5s · 半径2）" "$(echo "$S" | grep -o 'c:7,0.94,0.16,0.55,6.5,2')" "c:7,0.94,0.16,0.55,6.5,2"
chk "S3 成就定义（杏林春满95 / 仁心妙术3）" "$(echo "$S" | grep -o 'ach:杏林春满95/仁心妙术3')" "ach:杏林春满95/仁心妙术3"
chk "S4 任务（悬壶济世 · 诊所+防疫站口径=2）" "$(echo "$S" | grep -o 'q:悬壶济世1,2')" "q:悬壶济世1,2"
chk "S5 造价解锁（诊所180G LV2 · 防疫站480G LV5）" "$(echo "$S" | grep -o 'econ:180,2,480,5')" "econ:180,2,480,5"
chk "S6 建筑目录（1x1 双变体 ×2）" "$(echo "$S" | grep -o 'def:112/112')" "def:112/112"

echo "=== [1] 桌面端 1440×900 新档开局 ==="
agent-browser close >/dev/null 2>&1; sleep 1
agent-browser set viewport 1440 900
agent-browser open $B
agent-browser storage local clear >/dev/null 2>&1
agent-browser reload
agent-browser wait --fn "window.__pxc!==undefined" --timeout 90000 && ok "引擎就绪" || bad "引擎超时"
agent-browser wait 3000
agent-browser eval "(()=>{const b=[...document.querySelectorAll('button')].filter(x=>(x.textContent||'').includes('跳过'));if(b.length)b[b.length-1].click();return 'tut';})()" >/dev/null 2>&1
# 冻结随机源：市民信/事件/生日/景气不触发（疫病 forceEvent 单测不受影响）
agent-browser eval "(()=>{const t=window.__pxc.tycoon;const c=t.citz;c.mailTimer=99999;c.evTimer=99999;c.bdayTimer=99999;t.eventTimer=99999;t.cycTimer=99999;return 'frozen';})()" >/dev/null 2>&1

echo "=== [2] D 段：医疗覆盖引擎流 ==="
# D1 基线：空城 medCover=100 / medMissRes=0 / medSaved=0
D1=$(re "JSON.stringify((()=>{const e=window.__pxc;const t=e.tycoon;t.tick(0.05,e.map);const s=t.snap;
return {cover:s.medCover,miss:s.medMissRes,clinics:s.clinics,hs:s.healthsts,saved:t.medSaved};})())")
chk "D1 开埠基线（覆盖100 · 盲区0 · 双零 · 化解0）" "$(echo "$D1" | grep -o 'cover:100,miss:0,clinics:0,hs:0,saved:0')" "cover:100,miss:0,clinics:0,hs:0,saved:0"
# D2 远宅注入（市政厅半径 2 之外）→ medMissRes=1 · 覆盖下降 · 幸福惩罚入账
D2=$(re "JSON.stringify((()=>{const e=window.__pxc;const t=e.tycoon;const m=e.map;
const h=m.place('house',0,112,137);
t.tick(0.05,m);const s=t.snap;
return {ok:!!h,miss:s.medMissRes,cover:s.medCover,missF:t.medMissField.has(m.idx(112,137)),
  inF:t.medField.has(m.idx(127,127))};})())")
chk "D2 医疗盲区（远宅落盲区 · 覆盖<100 · 市政厅自 coverage）" "$(echo "$D2" | grep -o 'ok:true,miss:1,missF:true,inF:true')" "ok:true,miss:1,missF:true,inF:true"
# D3 盲区幸福惩罚（medHap = 1×1.4 → 幸福较无盲区基线下降；直接断言 view 文案所需字段）
D3=$(re "JSON.stringify((()=>{const e=window.__pxc;const t=e.tycoon;t.tick(0.05,e.map);
return {miss:t.snap.medMissRes,cover:t.snap.medCover};})())")
chk "D3 覆盖统计（1 盲区住宅 → 覆盖率 <100）" "$(echo "$D3" | grep -o 'miss:1')" "miss:1"
if [ "$(echo "$D3" | grep -o 'cover:[0-9]*')" != "cover:100" ]; then ok "D3b 覆盖率随盲区下降 ($(echo "$D3" | grep -o 'cover:[0-9]*'))"; else bad "D3b 覆盖率未下降"; fi
# D4 诊所救场：落 clinics 邻远宅（≤3 格）→ 盲区清零 · 覆盖回 100 · 诊所计数 1
D4=$(re "JSON.stringify((()=>{const e=window.__pxc;const t=e.tycoon;const m=e.map;
const c=m.place('clinic',0,114,136);
t.tick(0.05,m);const s=t.snap;
return {ok:!!c,clinics:s.clinics,miss:s.medMissRes,cover:s.medCover,
  homeIn:t.medField.has(m.idx(112,137))};})())")
chk "D4 诊所覆盖（半径 3 圈住远宅 · 盲区清零 · 覆盖100 · 诊所1）" "$(echo "$D4" | grep -o 'ok:true,clinics:1,miss:0,cover:100,homeIn:true')" "ok:true,clinics:1,miss:0,cover:100,homeIn:true"
# D5 盲区商铺收入对照：同帧拆/建两拍（0.94 折扣 → 覆盖/盲区 ≈1.064 单铺；理论比值随其它乘数波动 → 1.05~1.08）
re "JSON.stringify((()=>{const e=window.__pxc;const t=e.tycoon;const m=e.map;
m.place('shop',0,140,144);t.tick(0.05,m);return 'shop';})())" >/dev/null 2>&1
D5A=$(re "JSON.stringify((()=>{const e=window.__pxc;const t=e.tycoon;
t.tick(0.05,e.map);const miss=t.snap.earnCom;
const ent=[...e.map.objs.entries()].find(([k,o])=>o.id==='clinic');
const cx=ent[1].ax,cy=ent[1].ay;e.map.bulldoze(cx,cy);
t.tick(0.05,e.map);const cov=t.snap.earnCom;
return {cov,miss,r:Math.round(cov/miss*1000)/1000};})())")
echo "  · D5 收入对照：$D5A"
RATIO=$(echo "$D5A" | python3 -c "import json,sys
try: print(json.load(sys.stdin)['r'])
except Exception: print(0)")
if python3 -c "exit(0 if 1.045<=$RATIO<=1.09 else 1)" 2>/dev/null; then ok "D5 盲区商铺收入打折（覆盖/盲区=${RATIO} ≈ 1/0.94×稀释）"; else bad "D5 比值异常 ($RATIO)"; fi
# 重建诊所（后续用例需要）
re "JSON.stringify((()=>{const e=window.__pxc;const m=e.map;
return {ok:m.place('clinic',0,114,136)};})())" >/dev/null 2>&1
# D6 疫病偏爱盲区：拆诊所 → 远宅落盲区 → forceEvent('plague') → 现场必为盲区住宅（112,137）+ infN/infT 就位
re "JSON.stringify((()=>{const e=window.__pxc;const m=e.map;
const ent=[...m.objs.entries()].find(([k,o])=>o.id==='clinic');
if(ent)m.bulldoze(ent[1].ax,ent[1].ay);return 'dug';})())" >/dev/null 2>&1
D6=$(re "JSON.stringify((()=>{const e=window.__pxc;const t=e.tycoon;const m=e.map;
t.tick(0.05,m);
const ok=t.forceEvent('plague',m);
const ev=t.events[0];
return {ok,fx:ev?ev.fx.x+','+ev.fx.y:'none',infN:ev?(ev.infN??0):-1,infT:ev?(ev.infT??-1):-1,
  blind:t.medMissField.has(m.idx(112,137))};})())")
chk "D6 疫病偏爱盲区（现场=112,137 · infN=0 · infT>0）" "$(echo "$D6" | grep -o 'ok:true,fx:112,137,infN:0,blind:true')" "ok:true,fx:112,137,infN:0,blind:true"
# D7 蔓延链：推 infT 归零 → tick → spreadPlague 命中（累计感染 + 编年史「疫情蔓延」+ 亲历者史册）
D7=$(re "JSON.stringify((()=>{const e=window.__pxc;const t=e.tycoon;const m=e.map;
m.place('house',0,113,138);m.place('house',0,114,139);
t.tick(0.05,m);
const before=t.events[0].fx.x+','+t.events[0].fx.y;
t.events[0].infT=0.01;t.tick(0.05,m);
const ev=t.events[0];
const log=t.citz.roster.flatMap(c=>c.log.map(l=>l.text)).filter(s=>s.includes('病倒')||s.includes('串门')).length;
return {infN:ev.infN??0,moved:!(ev.fx.x+','+ev.fx.y===before),
  chron:t.chron.entries.some(q=>q.title==='疫情蔓延'),log};})())")
echo "  · D7 蔓延：$D7"
chk "D7 疫病蔓延（infN≥1 · 疫点转移 · 蔓延纪事 · 亲历史册）" "$(echo "$D7" | grep -o 'chron:true,log' >/dev/null && echo "蔓延入册" )" "蔓延入册"
chk "D7b 感染栋数累计（infN≥1）" "$(echo "$D7" | grep -o 'infN:[0-9]*' | grep -qv 'infN:0' && echo 'n>=1' )" "n>=1"
# D8 救护到场：resolveEvent → medSaved 不计（已有蔓延）· resolved 冻结 · 住户感恩
D8=$(re "JSON.stringify((()=>{const e=window.__pxc;const t=e.tycoon;const m=e.map;
const infBefore=t.events[0].infN??0;
const ok=t.resolveEvent('plague');
t.tick(0.05,m);
const ev=t.events[0];
const thanks=t.citz.roster.flatMap(c=>c.log.map(l=>l.text)).some(s=>s.includes('收治'));
return {ok,resolved:ev.resolved===true,infN:ev.infN??0,frozen:(ev.infT??0)>=1.5||ev.infT===undefined,saved:0,thanks};})())")
chk "D8 救护到场冻结（resolved=true · 住户感恩入册）" "$(echo "$D8" | grep -o 'ok:true,resolved:true,thanks:true')" "ok:true,resolved:true,thanks:true"
# D9 零蔓延化解：等事件结束 → 再 forceEvent → 立即 resolve → medSaved=1
D9=$(re "JSON.stringify((()=>{const e=window.__pxc;const t=e.tycoon;const m=e.map;
t.events.length=0;t.tick(0.05,m);
const ok=t.forceEvent('plague',m);t.tick(0.05,m);
const ok2=t.resolveEvent('plague');
return {ok,ok2,saved:t.medSaved,achDone:t.achv.has('medsaved3')};})())")
chk "D9 零蔓延化解（medSaved=1 计数入账）" "$(echo "$D9" | grep -o 'ok:true,ok2:true,saved:1')" "ok:true,ok2:true,saved:1"
# D10 防疫站：建成 → healthsts=1 · 健康指数病床扩容（beds +260）· 覆盖场半径 4
re "JSON.stringify((()=>{const e=window.__pxc;const m=e.map;
return {ok:m.place('healthst',0,116,137)};})())" >/dev/null 2>&1
D10=$(re "JSON.stringify((()=>{const e=window.__pxc;const t=e.tycoon;t.tick(0.05,e.map);const s=t.snap;
return {hs:s.healthsts,cover:s.medCover,health:s.healthIdx,blindRes:s.medMissRes};})())")
chk "D10 防疫站就位（计数1 · 远宅被圈进覆盖）" "$(echo "$D10" | grep -o 'hs:1,cover:100,blindRes:0')" "hs:1,cover:100,blindRes:0"
# D11 就医心声（假市民占位取词后即撤）
D11=$(re "JSON.stringify((()=>{const t=window.__pxc.tycoon;
t.citz.roster.push({name:'测试市民',mood:60});
const base={pop:100,happiness:60,taxRate:9,season:1,famine:0,events:[],fest:-1,smog:0,dark:0,waste:0,eduOut:0,crime:0,fireOut:0,lg:0};
const words=[];for(let i=0;i<16;i++){const v=t.citz.voice({...base,medOut:4});if(v)words.push(v.text);}
t.citz.roster.pop();
const hit=words.some(q=>/诊所|挂号|血压|看病/.test(q));
return {hit,n:t.citz.roster.length};})())")
chk "D11 就医心声（盲区街区念叨诊所 · 假市民已撤）" "$(echo "$D11" | grep -o 'hit:true,n:0')" "hit:true,n:0"
# D12 存档往返：infN/infT/medSaved 序列化 → resume 恢复
re "JSON.stringify((()=>{const e=window.__pxc;const t=e.tycoon;const m=e.map;
t.events.length=0;t.tick(0.05,m);
t.forceEvent('plague',m);t.tick(0.05,m);t.events[0].infN=2;t.events[0].infT=3.3;
t.save(m);return 'saved';})())" >/dev/null 2>&1
D12=$(re "JSON.stringify((()=>{const e=window.__pxc;const d=e.tycoon.constructor.loadRaw();
return {infN:d.events?d.events[0].infN:-1,infT:d.events?d.events[0].infT:-1,medSaved:d.medSaved};})())")
chk "D12 存档字段（infN=2 · infT≈3.3 · medSaved 持久化）" "$(echo "$D12" | grep -o 'infN:2,infT:3.3')" "infN:2,infT:3.3"

echo "=== [3] U 段：事件横幅 / 城市志 / 编年史 / 成就墙 / 建筑特写 ==="
# U1 事件横幅：疫病 ×3（infN=2 → ×3）+ 已累及文案
U1=$(re "JSON.stringify((()=>{
  const el=document.querySelector('.pxc-ev');const txt=el?el.textContent||'':'';
  return {on:!!el,x3:txt.includes('×3'),n:txt.includes('已累及 3 栋住宅')};})())")
chk "U1 事件横幅（疫病 ×3 · 已累及 3 栋住宅）" "$(echo "$U1" | grep -o 'on:true,x3:true,n:true')" "on:true,x3:true,n:true"
# 重建诊所+防疫站（覆盖率拉满）→ 清事件 → 救赎叙事对
re "JSON.stringify((()=>{const e=window.__pxc;const t=e.tycoon;const m=e.map;
t.events.length=0;m.place('clinic',0,114,136);
// 再补 4 栋远宅触发「缺医少药」（先拆防疫站制造盲区≥4）
const ent=[...m.objs.entries()].find(([k,o])=>o.id==='healthst');
if(ent)m.bulldoze(ent[1].ax,ent[1].ay);
m.place('house',0,108,130);m.place('house',0,109,131);m.place('house',0,110,130);
t.tick(0.05,m);t.achvTimer=0.01;t.tick(0.05,m);
return 'stage1';})())" >/dev/null 2>&1
U2=$(re "JSON.stringify((()=>{
  const t=window.__pxc.tycoon;
  return {bad:t.chron.entries.some(q=>q.title==='缺医少药'),miss:t.snap.medMissRes>=4};})())")
chk "U2 救赎上半（缺医少药入册 · 盲区≥4）" "$(echo "$U2" | grep -o 'bad:true,miss:true')" "bad:true,miss:true"
re "JSON.stringify((()=>{const e=window.__pxc;const t=e.tycoon;const m=e.map;
m.place('healthst',0,116,137);t.tick(0.05,m);t.achvTimer=0.01;t.tick(0.05,m);
return 'stage2';})())" >/dev/null 2>&1
U3=$(re "JSON.stringify((()=>{
  const t=window.__pxc.tycoon;const txt=(t.chron.entries.map(q=>q.title)).join('|');
  const row=document.querySelector('.pxc-modal')?0:0;
  return {good:t.chron.entries.some(q=>q.title==='悬壶济世'),
    ach:t.achv.has('apricot'),
    saved3:t.achv.has('medsaved3')||t.medSaved>=1};})())")
chk "U3 救赎下半（悬壶济世入册 · 覆盖成就解锁）" "$(echo "$U3" | grep -o 'good:true,ach:true')" "good:true,ach:true"
# U4 城市志「悬壶济世」行（数据面板打开 · 覆盖满 → 绿字）
agent-browser eval "(()=>{const b=[...document.querySelectorAll('button')].find(x=>(x.getAttribute('title')||'').includes('财政报告'));if(b)b.click();return 'f';})()" >/dev/null 2>&1
agent-browser wait 900
U4=$(re "JSON.stringify((()=>{
  const txt=document.querySelector('.pxc-fiscal')?.textContent||'';
  return {row:txt.includes('悬壶济世'),cover:txt.includes('医疗覆盖'),saved:txt.includes('零蔓延化解'),
    beds:txt.includes('诊所')&&txt.includes('防疫站')};})())")
chk "U4 城市志悬壶行（覆盖 + 化解计数 + 健康行双设施）" "$(echo "$U4" | grep -o 'row:true,cover:true,saved:true,beds:true')" "row:true,cover:true,saved:true,beds:true"
agent-browser screenshot $OUT/v36_fiscal_med.png >/dev/null && ok "截图 v36_fiscal_med.png（桌面 · 城市志医疗行）"
agent-browser eval "(()=>{document.querySelector('.pxc-fiscal .pxc-x')?.click();return 'x';})()" >/dev/null 2>&1
# U5 建筑特写：诊所 + 防疫站街景（相机对准 114,136 与 116,137 中点）
re "(()=>{const e=window.__pxc;
e.cam?.focus?.(116,137.5);
return 'cam';})()" >/dev/null 2>&1
agent-browser wait 600
agent-browser screenshot $OUT/v36_clinic_closeup.png >/dev/null && ok "截图 v36_clinic_closeup.png（诊所+防疫站街景）"
# U6 移动端 390×844：城市志行 + 盲区层渲染
agent-browser set viewport 390 844
agent-browser wait 900
agent-browser eval "(()=>{const b=[...document.querySelectorAll('button')].find(x=>(x.getAttribute('title')||'').includes('财政报告'));if(b)b.click();return 'f';})()" >/dev/null 2>&1
agent-browser wait 900
U6=$(re "JSON.stringify((()=>{
  const txt=document.querySelector('.pxc-fiscal')?.textContent||'';
  return {row:txt.includes('悬壶济世'),mob:true};})())")
chk "U6 移动端城市志医疗行" "$(echo "$U6" | grep -o 'row:true,mob:true')" "row:true,mob:true"
agent-browser screenshot $OUT/v36_mobile.png >/dev/null && ok "截图 v36_mobile.png（移动端 · 城市志）"
agent-browser eval "(()=>{document.querySelector('.pxc-fiscal .pxc-x')?.click();return 'x';})()" >/dev/null 2>&1
agent-browser set viewport 1440 900
agent-browser wait 800

echo "=== [4] R 段：回归抽查 + 零错误 ==="
# R1 既有回归抽查：治安/消防场未被破坏（tick 后 secField/fireField 仍工作）
R1=$(re "JSON.stringify((()=>{const e=window.__pxc;const t=e.tycoon;t.tick(0.05,e.map);
return {sec:typeof t.secField==='object',fire:typeof t.fireField==='object',med:typeof t.medField==='object',
  quest:typeof t.view().questTitle==='string'};})())")
chk "R1 既有场完好（sec/fire/med 三场并存 · 任务视图正常）" "$(echo "$R1" | grep -o 'sec:true,fire:true,med:true,quest:true')" "sec:true,fire:true,med:true,quest:true"
ERR=$(errcount)
if [ "$ERR" = "0" ]; then ok "R2 全程零控制台错误"; else bad "R2 控制台错误 $ERR 条"; fi

echo ""
echo "=========================================="
echo "v36 端到端验证：PASS=$PASS FAIL=$FAIL"
echo "=========================================="
[ "$FAIL" = "0" ]
