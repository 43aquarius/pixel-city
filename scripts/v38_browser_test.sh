#!/bin/bash
# ============================================================
# v38_browser_test.sh — 厚土藏珍「考古之城」出土图鉴端到端验证
# 增量 = relics.ts（RelicDef 文物表（陶土四器/青铜四器/玉石四器 3 套系 12 件 ·
#   寻常/珍稀/国宝三档）+ RELIC_* 常数（购地出土 22%/文化供给/吸引力/国宝游客乘数/
#   满馆琳琅幸福）+ relicBonusOf 策展加成 + rollRelicRare/rollRelicId 抽取 +
#   relicSetDone 套系判定 + relicRareName 档位名）
#   + tycoon.ts（digRelic 购地出土（buyChunk 挂钩）+ relicArrive 出土入册
#   （首件「开卷有珍」/国宝「国宝出世」+「厚土初醒」/套系集齐注脚/全集齐「厚土藏珍」）
#   + relicTest/relicDigForce 沙盒与事件钩子 + EVENT_TPLS 新增「工地惊现」考古事件
#   + snapOf：museumsN 计数 + relicBonusOf 注入（attract/culSup/happiness/tourists）
#   + QS v38 字段（relicN/relicExN/relicGems/museumsN）+ EconView.relics 视图
#   + 成就 破土惊鸿/藏珍五器/满馆琳琅 + 任务 厚土初醒
#   + 存档 relics/rlS1/rlSG/rlSA 向后兼容（旧档图鉴从零翻起））
#   + PixelCity.tsx（城市志新增「出土图鉴」区：三套系头 + 12 卡三态[未出土/出土/国宝金框]
#   + 策展加成标题行 + 帮助移动/桌面两表新增「考古」行 + 经营长行补考古段）
#   + pixelcity.css（图鉴卡三态/套系徽章/移动端 3 列）
# S 段：bun 直测（常数 / 文物表 / 策展加成 / 套系判定 / 抽取 / 成就任务）
# D 段：引擎流（空册 / 沙盒出土 / 国宝纪事 / 无馆零加成 / 博物馆展出 /
#       拆馆入库 / 考古事件 / 套系集齐 / 全集齐 / 成就巡检 / 购地出土 / 存档往返）
# U 段：城市志出土图鉴 / 桌面与移动端截图
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

echo "=== [S] 纯函数直测（bun：常数 / 文物表 / 策展加成 / 抽取 / 成就任务） ==="
S=$(cd /home/z/my-project && bun -e '
import { RELICS, RELIC_SETS, RELIC_DIG_P, RELIC_CULT, RELIC_ATTR, RELIC_TOUR_K, RELIC_TOUR_MAX, RELIC_HAP_FULL,
  relicBonusOf, rollRelicRare, rollRelicId, relicSetDone, relicRareName } from "./src/lib/pixelcity/relics.ts";
import { ACHIEVEMENTS, QUESTS } from "./src/lib/pixelcity/tycoon.ts";
const all = RELICS.map(r => r.id);
const a1 = ACHIEVEMENTS.find(a => a.id === "relic1")!, a5 = ACHIEVEMENTS.find(a => a.id === "relic5")!,
  a12 = ACHIEVEMENTS.find(a => a.id === "relic12")!;
const q = QUESTS.find(x => x.id === "relic1")!;
console.log(JSON.stringify({
  k: [RELIC_DIG_P, RELIC_CULT[0], RELIC_CULT[1], RELIC_CULT[2], RELIC_ATTR[0], RELIC_ATTR[1], RELIC_ATTR[2],
      RELIC_TOUR_K, RELIC_TOUR_MAX, RELIC_HAP_FULL].join(","),
  tbl: RELICS.length + "," + RELIC_SETS.length + "," +
    all.every((v, i) => v === "r" + String(i + 1).padStart(2, "0")) + "," +
    new Set(all).size + "," +
    RELICS.filter(r => r.rare === 2).length + "," + RELICS.filter(r => r.rare === 1).length + "," + RELICS.filter(r => r.rare === 0).length,
  b0: JSON.stringify(relicBonusOf(all, false)),
  b1: JSON.stringify(relicBonusOf([], true)),
  b12: JSON.stringify(relicBonusOf(all, true)),
  set1: relicSetDone(["r01", "r02", "r03", "r04"], "pottery") + "," + relicSetDone(["r01", "r02", "r03"], "pottery"),
  rare: rollRelicRare(() => 0.5) + "," + rollRelicRare(() => 0.7) + "," + rollRelicRare(() => 0.95),
  id: (rollRelicId(["r01", "r05", "r09"], () => 0.5) !== null) + "," + (rollRelicId(all, () => 0.5) === null),
  name: relicRareName(2) + "/" + relicRareName(1) + "/" + relicRareName(0),
  ach: a1.name + a1.goal + "/" + a5.name + a5.goal + "/" + a12.name + a12.goal,
  q: q.title + q.goal,
}));' 2>&1 | tail -1 | stripq)
chk "S1 常数（购地22% · 文化1.5/3/6 · 吸引2/4/8 · 国宝2%/上限6% · 满馆+2）" \
  "$(echo "$S" | grep -o 'k:0.22,1.5,3,6,2,4,8,0.02,0.06,2')" "k:0.22,1.5,3,6,2,4,8,0.02,0.06,2"
chk "S2 文物表（12件 · 3套系 · id序号 · 去重 · 国宝2/珍稀5/寻常5）" \
  "$(echo "$S" | grep -o 'tbl:12,3,true,12,2,5,5')" "tbl:12,3,true,12,2,5,5"
chk "S3 无馆在库房（全出土 exN=0 加成全零）" "$(echo "$S" | grep -o 'b0:{cul:0,at:0,tourK:1,hap:0,exN:0}')" "b0:{cul:0,at:0,tourK:1,hap:0,exN:0}"
chk "S4 有馆空册（exN=0 加成全零）" "$(echo "$S" | grep -o 'b1:{cul:0,at:0,tourK:1,hap:0,exN:0}')" "b1:{cul:0,at:0,tourK:1,hap:0,exN:0}"
chk "S5 满馆琳琅（cul34.5 · at46 · 国宝1.04 · 幸福2 · exN12）" \
  "$(echo "$S" | grep -o 'b12:{cul:34.5,at:46,tourK:1.04,hap:2,exN:12}')" "b12:{cul:34.5,at:46,tourK:1.04,hap:2,exN:12}"
chk "S6 套系判定（陶土四器集齐 true · 缺一 false）" "$(echo "$S" | grep -o 'set1:true,false')" "set1:true,false"
chk "S7 稀有度抽取（0.62线寻常 · 0.92线珍稀 · 国宝）" "$(echo "$S" | grep -o 'rare:0,1,2')" "rare:0,1,2"
chk "S8 图鉴抽取（未出土有得 · 全出土 null）" "$(echo "$S" | grep -o 'id:true,true')" "id:true,true"
chk "S9 档位名（国宝/珍稀/寻常）" "$(echo "$S" | grep -o 'name:国宝/珍稀/寻常')" "name:国宝/珍稀/寻常"
chk "S10 成就三枚（破土惊鸿1 / 藏珍五器5 / 满馆琳琅12）" "$(echo "$S" | grep -o 'ach:破土惊鸿1/藏珍五器5/满馆琳琅12')" "ach:破土惊鸿1/藏珍五器5/满馆琳琅12"
chk "S11 任务（厚土初醒 · goal 1）" "$(echo "$S" | grep -o 'q:厚土初醒1')" "q:厚土初醒1"

echo "=== [1] 桌面端 1440×900 新档开局 ==="
agent-browser close >/dev/null 2>&1; sleep 1
agent-browser set viewport 1440 900
agent-browser open "$B" >/dev/null 2>&1
agent-browser wait --fn "window.__pxc!==undefined" --timeout 90000 >/dev/null 2>&1 && ok "引擎就绪" || bad "引擎超时"
agent-browser wait 3000
agent-browser eval "(()=>{const b=[...document.querySelectorAll('button')].filter(x=>(x.textContent||'').includes('跳过'));if(b.length)b[b.length-1].click();return 'tut';})()" >/dev/null 2>&1
# 冻结随机源：市民信/事件/生日/景气/公文/邻城事件/购地出土不自行触发（relicTest/forceEvent 单测不受影响）
agent-browser eval "(()=>{const t=window.__pxc.tycoon;const c=t.citz;c.mailTimer=99999;c.evTimer=99999;c.bdayTimer=99999;t.eventTimer=99999;t.cycTimer=99999;t.docNext=999999;t.sisGrowAt=99999;t.sisEvtAt=99999;return 'frozen';})()" >/dev/null 2>&1

echo "=== [2] D 段：考古引擎流 ==="
# D1 新档空册（0/12 · 无馆 · 加成零）
D1=$(re "JSON.stringify((()=>{const e=window.__pxc;const t=e.tycoon;t.tick(0.05,e.map);
const v=t.view().relics;
return {n:v.n,total:v.total,museumOn:v.museumOn,cul:v.cul,exN:v.exN};})())")
chk "D1 开埠空册（0/12 · 无馆 · 加成零）" "$(echo "$D1" | grep -o 'n:0,total:12,museumOn:false,cul:0,exN:0')" "n:0,total:12,museumOn:false,cul:0,exN:0"
# D2 寻常件出土（图鉴登记 · 编年史破土有得+开卷有珍）
D2=$(re "JSON.stringify((()=>{const e=window.__pxc;const t=e.tycoon;
const ok=t.relicTest('r01');
t.tick(0.05,e.map);
return {ok,n:t.relicGot.length,chron:t.chron.entries.some(x=>x.title==='破土有得'),
  open:t.chron.entries.some(x=>x.title==='开卷有珍')};})())")
chk "D2 破土有得（入册1 · 编年史双笔）" "$(echo "$D2" | grep -o 'ok:true,n:1,chron:true,open:true')" "ok:true,n:1,chron:true,open:true"
# D3 国宝出世（鼎 → 编年史国宝出世+厚土初醒）
D3=$(re "JSON.stringify((()=>{const e=window.__pxc;const t=e.tycoon;
const ok=t.relicTest('r08');
t.tick(0.05,e.map);
return {ok,gems:t.snap.relicGems,chron:t.chron.entries.some(x=>x.title==='国宝出世'),
  wake:t.chron.entries.some(x=>x.title==='厚土初醒')};})())")
chk "D3 国宝出世（国宝1 · 编年史双笔）" "$(echo "$D3" | grep -o 'ok:true,gems:1,chron:true,wake:true')" "ok:true,gems:1,chron:true,wake:true"
# D4 无馆零加成（文物在库房：exN=0 · cultureSup 不含文物）
D4=$(re "JSON.stringify((()=>{const e=window.__pxc;const t=e.tycoon;t.tick(0.05,e.map);
const s=t.snap,v=t.view().relics;
return {n:s.relicN,ex:s.relicExN,mus:s.museumsN,on:v.museumOn,cul:v.cul};})())")
chk "D4 库房封存（出土2 · 展出0 · 无馆 · 加成零）" "$(echo "$D4" | grep -o 'n:2,ex:0,mus:0,on:false,cul:0')" "n:2,ex:0,mus:0,on:false,cul:0"
# D5 博物馆落成 → 全馆展出（exN=2 · cultureSup 注入 1.5+6=7.5）
D5=$(re "JSON.stringify((()=>{const e=window.__pxc;const m=e.map;const t=e.tycoon;
const ok=m.place('museum',0,121,123);
t.tick(0.05,m);const s=t.snap;const v=t.view().relics;
return {ok,mus:s.museumsN,ex:s.relicExN,on:v.museumOn,cul:v.cul,at:v.at};})())")
chk "D5 开馆展出（馆1 · 展出2 · 文化7.5 · 吸引10）" "$(echo "$D5" | grep -o 'ok:true,mus:1,ex:2,on:true,cul:7.5,at:10')" "ok:true,mus:1,ex:2,on:true,cul:7.5,at:10"
# D6 拆馆入库 → 展出清零（文物不丢）；再建恢复
D6=$(re "JSON.stringify((()=>{const e=window.__pxc;const m=e.map;const t=e.tycoon;
const ent=[...m.objs.entries()].find(([k,o])=>o.id==='museum');
if(ent)m.bulldoze(ent[1].ax,ent[1].ay);
t.tick(0.05,m);
const off={mus:t.snap.museumsN,ex:t.snap.relicExN,keep:t.relicGot.length};
const ok=m.place('museum',0,121,123);
t.tick(0.05,m);
return {offMus:off.mus,offEx:off.ex,keep:off.keep===2,on2:t.snap.relicExN===2};})())")
chk "D6 拆馆入库/重建恢复（展出0 · 文物不丢 · 复展2）" "$(echo "$D6" | grep -o 'offMus:0,offEx:0,keep:true,on2:true')" "offMus:0,offEx:0,keep:true,on2:true"
# D7 考古事件（forceEvent('dig') → 工地随机出土一件 · 编年史工地惊现）
D7=$(re "JSON.stringify((()=>{const e=window.__pxc;const m=e.map;const t=e.tycoon;
const n0=t.relicGot.length;
const ok=t.forceEvent('dig',m);
t.tick(0.05,m);
return {ok,n:t.relicGot.length-n0,chron:t.chron.entries.some(x=>x.title==='工地惊现')};})())")
chk "D7 工地惊现（事件出土1 · 编年史入册）" "$(echo "$D7" | grep -o 'ok:true,n:1,chron:true')" "ok:true,n:1,chron:true"
# D8 套系集齐（补齐陶土四器 → sets[0].done）
D8=$(re "JSON.stringify((()=>{const e=window.__pxc;const t=e.tycoon;
t.relicTest('r02');t.relicTest('r03');t.relicTest('r04');
const v=t.view().relics;
return {p:v.sets[0].done,n4:v.sets[0].n===4&&v.sets[0].total===4,n:t.relicGot.length};})())")
chk "D8 陶土四器集齐（套系徽章 done · 4/4 · 图鉴6）" "$(echo "$D8" | grep -o 'p:true,n4:true,n:6')" "p:true,n4:true,n:6"
# D9 全集齐（补余 6 件 → 12/12 · 编年史厚土藏珍 · digRelic 满仓不再出）
D9=$(re "JSON.stringify((()=>{const e=window.__pxc;const t=e.tycoon;
for(const id of ['r05','r06','r07','r09','r10','r11','r12'])t.relicTest(id);
t.tick(0.05,e.map);
const v=t.view().relics;
return {n:v.n===12,hap:v.hap===2,tourK:v.tourK===1.04,
  chron:t.chron.entries.some(x=>x.title==='厚土藏珍'),sets:v.sets.every(s=>s.done)};})())")
chk "D9 厚土藏珍（12/12 · 满馆琳琅+2 · 国宝×1.04 · 三套系全齐 · 编年史入册）" \
  "$(echo "$D9" | grep -o 'n:true,hap:true,tourK:true,chron:true,sets:true')" "n:true,hap:true,tourK:true,chron:true,sets:true"
# D10 成就巡检（2.6s → 破土惊鸿/藏珍五器/满馆琳琅全解锁）
sleep 2.6
D10=$(re "JSON.stringify((()=>{const t=window.__pxc.tycoon;
return {a:t.achv.has('relic1'),b:t.achv.has('relic5'),c:t.achv.has('relic12')};})())")
chk "D10 成就巡检（三枚考古成就全解锁）" "$(echo "$D10" | grep -o 'a:true,b:true,c:true')" "a:true,b:true,c:true"
# D11 购地出土（重置到 3 件 → 连购合法新领地（cx 9..15 × cy 7/6/5/8/9 共 30 块上限）→ 22%/块 命中 ≥1 · 编年史带区位）
D11=$(re "JSON.stringify((()=>{const e=window.__pxc;const m=e.map;const t=e.tycoon;
t.relicGot=['r01','r02','r03'];t.coins=9999999;
const n0=t.relicGot.length;
let buys=0,hit=false;
outer:
for(const cy of [7,6,5,8,9]){
  for(let cx=9;cx<=15;cx++){
    const r=t.buyChunk(cx,cy);
    if(r==='ok'){buys++;if(t.relicGot.length>n0){hit=true;break outer;}}
  }
}
t.tick(0.05,m);
return {buys,hit,got:t.relicGot.length-n0,
  chron:t.chron.entries.some(x=>x.title==='破土有得'&&x.text.includes('区'))};})())")
echo "  · D11 购地：$D11"
chk "D11 购地出土（30 块内命中 · 编年史带区位）" "$(echo "$D11" | grep -o 'hit:true,got:1,chron:true')" "hit:true,got:1,chron:true"
# D12 存档往返（出土顺序 · 纪事标记 → resume 原样回来）
D12=$(re "JSON.stringify((()=>{const e=window.__pxc;const t=e.tycoon;const m=e.map;
const raw=JSON.parse(t.serialize(m));
const seq0=raw.relics;
t.resume(m,raw);
const seq1=t.relicGot.join(',');
return {match:seq1===seq0&&seq0.split(',').length===t.relicGot.length,
  n:t.relicGot.length>=4,s1:t.relicSeen1===true};})())")
chk "D12 存档往返（顺序一致 · 件数保持 · 纪事标记保持）" "$(echo "$D12" | grep -o 'match:true,n:true,s1:true')" "match:true,n:true,s1:true"

echo "=== [3] U 段：城市志出土图鉴 ==="
agent-browser eval "(()=>{const t=window.__pxc.tycoon;for(let i=1;i<=12;i++){const id='r'+String(i).padStart(2,'0');if(!t.relicGot.includes(id))t.relicTest(id);}return 'full';})()" >/dev/null 2>&1
U1=$(re "(()=>{const chip=document.querySelector('.chip[title*=供水覆盖率]');
if(!chip)return 'nochip';chip.click();return 'open';})()")
agent-browser wait 700
U2=$(re "JSON.stringify((()=>{const d=document.querySelector('.pxc-data');
return {m:!!d,sec:!!d.querySelector('.drlk'),cards:d.querySelectorAll('.rk-card').length,
  on:d.querySelectorAll('.rk-card.on').length,
  head:(d.querySelector('.drlk h3')?.textContent||'').includes('出土图鉴'),
  sets:d.querySelectorAll('.rlk-set').length};})())")
echo "  · U1 城市志：$U2"
chk "U1 出土图鉴区（城市志内 · 12 卡 · 出土点亮 · 三套系）" \
  "$(echo "$U2" | grep -o 'm:true,sec:true,cards:12,on:12,head:true,sets:3')" "m:true,sec:true,cards:12,on:12,head:true,sets:3"
agent-browser eval "(()=>{const d=document.querySelector('.pxc-data');const sec=d&&d.querySelector('.drlk');if(sec)sec.scrollIntoView({block:'start'});return 'scrolled';})()" >/dev/null 2>&1
agent-browser wait 400 >/dev/null 2>&1
agent-browser screenshot "$OUT/v38_relics.png" >/dev/null 2>&1 && ok "U2b 图鉴截图 v38_relics.png" || bad "U2b 截图失败"
agent-browser eval "(()=>{const x=document.querySelector('.pxc-data .pxc-x');if(x)x.click();return 'x';})()" >/dev/null 2>&1

echo "=== [4] R 段：移动端 + 零错误 ==="
agent-browser set viewport 390 844
agent-browser wait 1200
U3=$(re "(()=>{const chip=document.querySelector('.chip[title*=供水覆盖率]');
if(!chip)return 'nochip';chip.click();return 'open';})()")
agent-browser wait 700
U4=$(re "JSON.stringify((()=>{const d=document.querySelector('.pxc-data');
if(!d)return {m:false};
const b=d.querySelector('.pxc-body');if(b)b.scrollTop=b.scrollHeight;
const f=d.querySelector('.drlk');const r=f?f.getBoundingClientRect():null;
return {m:true,cards:d.querySelectorAll('.rk-card').length,
  foot:r&&b?r.top<b.getBoundingClientRect().bottom:false};})())")
chk "U3 移动端图鉴（12 卡 · 滚动到底可读）" "$(echo "$U4" | grep -o 'm:true,cards:12,foot:true')" "m:true,cards:12,foot:true"
agent-browser eval "(()=>{const d=document.querySelector('.pxc-data');const sec=d&&d.querySelector('.drlk');if(sec)sec.scrollIntoView({block:'start'});return 'scrolled';})()" >/dev/null 2>&1
agent-browser wait 400 >/dev/null 2>&1
agent-browser screenshot "$OUT/v38_mobile.png" >/dev/null 2>&1 && ok "U3b 移动端截图 v38_mobile.png" || bad "U3b 截图失败"
agent-browser eval "(()=>{const x=document.querySelector('.pxc-data .pxc-x');if(x)x.click();return 'x';})()" >/dev/null 2>&1
ERR=$(errcount)
chk "R1 控制台零错误（全程）" "$ERR" "0"

echo ""
echo "==================================================="
echo "v38 厚土藏珍·考古之城 —— 通过 $PASS · 失败 $FAIL"
echo "==================================================="
exit $([ "$FAIL" -eq 0 ] && echo 0 || echo 1)
