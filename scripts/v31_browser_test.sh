#!/bin/bash
# ============================================================
# v31_browser_test.sh — 都会名片「地标双塔」端到端验证
# 增量 = b_dusk.ts（genOpera 金穹顶柱廊山花红毯台阶 / genExpo 玻璃拱棚万国旗广场）
#   + catalog.ts（opera 3×3 大剧院 / expo 3×3 会展中心 + ATTRACT 5/4）
#   + tycoon.ts（ECON 1800G LV7 / 2400G LV8 + TECH_GATE brand/struct +
#   CULT_R 半径 6 文化街区覆盖场 ensureCult（商铺收入 ×1.08）+
#   snap operas/expos/cultShops + 幸福 +2 + 节庆三重强化（历时+30% 冷却−20% 游客+30%）+
#   成就 华灯初上 opera10 / 万商云集 fest12 + 首落成编年史纪事）
# S 段：bun 直测（目录定义 / 经济属性 / 科技门槛 / 吸引力 / 文化街区常数 / 成就定义）
# D 段：地标引擎流（落成纪事 / 文化街区入圈出圈 / 商圈统计 / 节庆三重强化比值 /
#   十店成就 / 会展节庆成就 / 拆除重算）
# U 段：建造面板入口 + 编年史落成纪事 + 成就墙 + 视觉截图
# R 段：存档往返（地标计数 / 文化街区 / 纪事）+ 移动端截图
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

echo "=== [S] 纯函数直测（bun：目录 / 经济 / 门槛 / 吸引力 / 文化街区 / 成就） ==="
S=$(cd /home/z/my-project && bun -e '
import { CATALOG, defById, ATTRACT } from "./src/lib/pixelcity/catalog.ts";
import { ECON, TECH_GATE, CULT_R, CULT_EARN_K, ACHIEVEMENTS, FESTS, FEST_LV, FEST_CD } from "./src/lib/pixelcity/tycoon.ts";
const o = defById("opera"), x = defById("expo");
const eo = ECON.opera, ex = ECON.expo;
const a1 = ACHIEVEMENTS.find(a => a.id === "opera10"), a2 = ACHIEVEMENTS.find(a => a.id === "fest12");
console.log(JSON.stringify({
  dim: o.w + "x" + o.h + "," + x.w + "x" + x.h + "," + o.cat + "," + x.cat,
  econ: eo.cost + "," + eo.unlock + "," + ex.cost + "," + ex.unlock + "," + eo.cul + "," + ex.cul,
  gate: TECH_GATE.opera + "," + TECH_GATE.expo,
  att: ATTRACT.opera + "," + ATTRACT.expo,
  cult: CULT_R.opera + "," + CULT_EARN_K,
  ach: (a1 ? a1.goal : -1) + "," + (a2 ? a2.goal : -1) + "," + a1.name + "," + a2.name,
  fest: FEST_LV + "," + FEST_CD + "," + FESTS.length,
}));' 2>&1 | tail -1 | stripq)
chk "S1 目录定义（双 3×3 · 公共类）" "$(echo "$S" | grep -o 'dim:3x3,3x3,civ,civ')" "dim:3x3,3x3,civ,civ"
chk "S2 经济属性（1800G LV7 / 2400G LV8 · 文化 6/4）" "$(echo "$S" | grep -o 'econ:1800,7,2400,8,6,4')" "econ:1800,7,2400,8,6,4"
chk "S3 科技门槛（brand / struct）" "$(echo "$S" | grep -o 'gate:brand,struct')" "gate:brand,struct"
chk "S4 吸引力档位（5 地标级 / 4 大型）" "$(echo "$S" | grep -o 'att:5,4')" "att:5,4"
chk "S5 文化街区（半径 6 · ×1.08）" "$(echo "$S" | grep -o 'cult:6,1.08')" "cult:6,1.08"
chk "S6 成就定义（华灯初上 10 / 万商云集 12）" "$(echo "$S" | grep -o 'ach:10,12,华灯初上,万商云集')" "ach:10,12,华灯初上,万商云集"
chk "S7 节庆常数（LV3 · CD180 · 四节）" "$(echo "$S" | grep -o 'fest:3,180,4')" "fest:3,180,4"

echo "=== [1] 桌面端 1440×900 新档开局 ==="
agent-browser close >/dev/null 2>&1; sleep 1
agent-browser set viewport 1440 900
agent-browser open $B
agent-browser storage local clear >/dev/null 2>&1
agent-browser reload
agent-browser wait --fn "window.__pxc!==undefined" --timeout 90000 && ok "引擎就绪" || bad "引擎超时"
agent-browser wait 3000
agent-browser eval "(()=>{const b=[...document.querySelectorAll('button')].filter(x=>(x.textContent||'').includes('跳过'));if(b.length)b[b.length-1].click();return 'tut';})()" >/dev/null 2>&1
# 冻结随机事件与信件（D 段确定性）
agent-browser eval "(()=>{const t=window.__pxc.tycoon;const c=t.citz;c.mailTimer=99999;c.evTimer=99999;c.bdayTimer=99999;t.eventTimer=99999;return 'frozen';})()" >/dev/null 2>&1

echo "=== [2] D 段：地标引擎流 ==="
# D1 大剧院落成：科技+等级+金币 → map.place → 计数 / 纪事 / 幸福 +2 前后对照
D1=$(re "JSON.stringify((()=>{const e=window.__pxc;const t=e.tycoon;
t.level=9;t.coins=30000;t.techs.add('brand');t.techs.add('struct');
const hap0=t.snap.happiness;
const ok=e.map.place('opera',0,132,133);
t.tick(0.05,e.map);
const s=t.snap;
const mile=t.chron.entries.some(x=>x.title==='大剧院落成');
const hap1=t.snap.happiness;
return {ok,op:s.operas,mile,hapUp:hap1>hap0,cul:s.cultureSup};})())")
chk "D1 大剧院落成（入册 · 计数 1 · 幸福 +2）" "$(echo "$D1" | grep -o 'ok:true,op:1,mile:true,hapUp:true')" "ok:true,op:1,mile:true,hapUp:true"
# D2 文化街区：十家商铺环绕（半径 6 内）→ cultShops 计数 + 华灯初上成就
D2=$(re "JSON.stringify((()=>{const e=window.__pxc;const t=e.tycoon;
const cand=[[126,127],[127,127],[138,127],[138,133],[126,133],[126,139],[132,139],[138,139],[126,130],[138,130],[129,139],[135,139],[127,138],[137,138],[130,127],[134,127]];   // 全部落在剧院锤点半径 6 内；市政厅占用格自动跳过
let n=0;
for(const p of cand){ if(n>=10)break; if(e.map.place('shop',0,p[0],p[1])) n++; }
t.achvTimer=0.01;t.tick(0.05,e.map);
const s=t.snap;
return {placed:n,cult:s.cultShops,ach:t.achv.has('opera10'),
  near:t.cultShopField.has(e.map.idx(126,130))||t.cultShopField.has(e.map.idx(138,130))};})())")
chk "D2 文化街区（商圈 10 店 · 成就华灯初上 · 圈内店命中）" "$(echo "$D2" | grep -o 'placed:10,cult:10,ach:true,near:true')" "placed:10,cult:10,ach:true,near:true"
# D3 会展中心开馆：计数 / 纪事 / 节庆三重强化（历时 ×1.3 · 冷却 ×0.8）
D3=$(re "JSON.stringify((()=>{const e=window.__pxc;const t=e.tycoon;
const ok=e.map.place('expo',0,118,133);
t.achvTimer=0.01;t.tick(0.05,e.map);
const mile=t.chron.entries.some(x=>x.title==='会展中心开馆');
const r1=t.startFestival();
const dur1=t.fest?t.fest.left:0;
const cd1=t.festCd;
const season=t.season;
t.fest=null;t.festCd=0;
return {ok,ex:t.snap.expos,mile,r1,season,dur1,cd1};})())")
chk "D3 会展开馆（计数 · 纪事 · 节庆开幕）" "$(echo "$D3" | grep -o 'ok:true,ex:1,mile:true,r1:ok')" "ok:true,ex:1,mile:true,r1:ok"
DUR1=$(echo "$D3" | grep -o 'dur1:[0-9]*' | cut -d: -f2)
# D3b 拆会展 → 再办节庆：历时回落 ×1（比值 1.3）· 冷却回升（dur1 由 shell 插值 —— 跨 eval 闭包不可用）
D3b=$(re "JSON.stringify((()=>{const e=window.__pxc;const t=e.tycoon;
e.map.bulldoze(118,133);
t.fest=null;t.festCd=0;   // 清冷却（D3 开幕已起表，不清则第二次开幕返回 cd）
t.tick(0.05,e.map);
const r2=t.startFestival();
const dur2=t.fest?t.fest.left:0;
const cd2=t.festCd;
return {r2,dur2,cd2,ratio:(dur2>0?Math.round(${DUR1:-1}/dur2*100)/100:0)};})())")
chk "D3b 无会展节庆回落（历时比值 1.3 · 冷却更长）" "$(echo "$D3b" | grep -o 'ratio:1.3')" "ratio:1.3"
# D4 万商云集：会展在城 + 累计节庆 12 → 成就
D4=$(re "JSON.stringify((()=>{const e=window.__pxc;const t=e.tycoon;
t.fest=null;t.festCd=0;
const ok=e.map.place('expo',0,118,133);
t.festCount=12;
t.achvTimer=0.01;t.tick(0.05,e.map);
return {ok,ex:t.snap.expos,ach:t.achv.has('fest12')};})())")
chk "D4 万商云集（会展在城 · 12 场节庆成就）" "$(echo "$D4" | grep -o 'ok:true,ex:1,ach:true')" "ok:true,ex:1,ach:true"
# D5 拆剧院 → 文化街区清空重算
D5=$(re "JSON.stringify((()=>{const e=window.__pxc;const t=e.tycoon;
e.map.bulldoze(132,133);
t.tick(0.05,e.map);
const s=t.snap;
return {op:s.operas,cult:s.cultShops,in:t.cultShopField.has(e.map.idx(126,130))};})())")
chk "D5 拆除重算（剧院 0 · 商圈清空）" "$(echo "$D5" | grep -o 'op:0,cult:0,in:false')" "op:0,cult:0,in:false"

echo "=== [3] U 段：建造面板 / 编年史 / 成就墙 ==="
# U1 建造面板公共页签出现双地标卡片（点击与断言分拆 —— React 批量渲染跨 eval）
agent-browser eval "(()=>{const tab=[...document.querySelectorAll('.pxc-tabs button')].find(x=>(x.textContent||'').trim()==='公共');if(tab)tab.click();return 't';})()" >/dev/null 2>&1
agent-browser wait 500
U1=$(re "JSON.stringify((()=>{
  const opts=[...document.querySelectorAll('.pxc-cell .pxc-cname')].map(b=>(b.textContent||'').trim());
  return {opera:opts.some(t=>t.includes('大剧院')),expo:opts.some(t=>t.includes('会展中心'))};})())")
chk "U1 建造面板公共页签（大剧院 · 会展中心卡片）" "$(echo "$U1" | grep -o 'opera:true,expo:true')" "opera:true,expo:true"
# U2 编年史双纪事在册
agent-browser eval "(()=>{const b=[...document.querySelectorAll('button.chip')].find(x=>(x.getAttribute('title')||'').includes('编年史'));b.click();return 'c';})()" >/dev/null 2>&1
agent-browser wait 700
U2=$(re "JSON.stringify((()=>{
  const txt=document.querySelector('.pxc-chron')?.textContent||'';
  return {op:txt.includes('大剧院落成'),ex:txt.includes('会展中心开馆')};})())")
chk "U2 编年史落成双纪事可读" "$(echo "$U2" | grep -o 'op:true,ex:true')" "op:true,ex:true"
agent-browser eval "(()=>{document.querySelector('.pxc-chron .pxc-x')?.click();return 'x';})()" >/dev/null 2>&1
# U3 成就墙双卡（华灯初上 · 万商云集）
agent-browser eval "(()=>{const b=[...document.querySelectorAll('button.chip')].find(x=>(x.getAttribute('title')||'').includes('城市志'));b.click();return 'd';})()" >/dev/null 2>&1
agent-browser wait 700
U3=$(re "JSON.stringify((()=>{
  const txt=document.querySelector('.pxc-modal')?.textContent||'';
  return {a1:txt.includes('华灯初上'),a2:txt.includes('万商云集')};})())")
chk "U3 成就墙双卡在册" "$(echo "$U3" | grep -o 'a1:true,a2:true')" "a1:true,a2:true"
agent-browser eval "(()=>{document.querySelector('.pxc-modal .pxc-x')?.click();return 'x';})()" >/dev/null 2>&1

echo "=== [4] R 段：存档往返 + 双端截图 ==="
# 重摆双地标（供截图与往返）
agent-browser eval "(()=>{const e=window.__pxc;const t=e.tycoon;
const ok1=e.map.place('opera',0,132,133);
t.achvTimer=0.01;t.tick(0.05,e.map);
return {ok1,op:t.snap.operas};})()" >/dev/null 2>&1
# 视觉截图：大剧院近景（戏院居中）
agent-browser eval "(()=>{const e=window.__pxc;e.centerAt(133,134);e.setZoom(2);return 'v';})()" >/dev/null 2>&1
agent-browser wait 900
agent-browser screenshot $OUT/v31_opera_closeup.png >/dev/null && ok "截图 v31_opera_closeup.png（桌面 · 大剧院近景）"
agent-browser eval "(()=>{const e=window.__pxc;e.centerAt(119,134);e.setZoom(2);return 'v';})()" >/dev/null 2>&1
agent-browser wait 900
agent-browser screenshot $OUT/v31_expo_closeup.png >/dev/null && ok "截图 v31_expo_closeup.png（桌面 · 会展中心近景）"
# R1 存档往返：地标计数 / 商圈 / 纪事不回退
R0=$(re "JSON.stringify((()=>{const s=window.__pxc.tycoon.snap;
return {op:s.operas,ex:s.expos,cult:s.cultShops};})())")
ROP=$(echo "$R0" | grep -o 'op:[0-9]*' | cut -d: -f2)
REX=$(echo "$R0" | grep -o 'ex:[0-9]*' | cut -d: -f2)
RCS=$(echo "$R0" | grep -o 'cult:[0-9]*' | cut -d: -f2)
echo "  · R0 快照：$R0"
re "JSON.stringify((()=>{window.__pxc.tycoon.save(window.__pxc.map);return 'saved';})())" >/dev/null
agent-browser reload >/dev/null 2>&1
agent-browser wait --fn "window.__pxc!==undefined" --timeout 90000 >/dev/null 2>&1
agent-browser wait 3000
agent-browser eval "(()=>{const b=[...document.querySelectorAll('button')].filter(x=>(x.textContent||'').includes('跳过'));if(b.length)b[b.length-1].click();return 'tut';})()" >/dev/null 2>&1
R1=$(re "JSON.stringify((()=>{const t=window.__pxc.tycoon;
return {op:t.snap.operas,ex:t.snap.expos,cult:t.snap.cultShops,
  mile:t.chron.entries.some(x=>x.title==='大剧院落成')};})())")
chk "R1 往返（剧院 $ROP · 会展 $REX · 商圈 $RCS · 纪事在册）" "$(echo "$R1" | grep -o "op:$ROP,ex:$REX,cult:$RCS,mile:true")" "op:$ROP,ex:$REX,cult:$RCS,mile:true"
ERR=$(errcount)
chk "R2 控制台零错误" "${ERR:-x}" "0"
# R3 移动端建造面板（抽屉展开 → 公共页签 → 双地标卡片）
agent-browser set viewport 390 844
agent-browser wait 1200
agent-browser eval "(()=>{const h=document.querySelector('.pxc-dhandle');if(h&&h.getAttribute('aria-expanded')!=='true')h.click();return 'd';})()" >/dev/null 2>&1
agent-browser wait 600
agent-browser eval "(()=>{const tab=[...document.querySelectorAll('.pxc-tabs button')].find(x=>(x.textContent||'').trim()==='公共');if(tab)tab.click();return 't';})()" >/dev/null 2>&1
agent-browser wait 500
R3=$(re "JSON.stringify((()=>{
  const opts=[...document.querySelectorAll('.pxc-cell .pxc-cname')].map(b=>(b.textContent||'').trim());
  return {opera:opts.some(t=>t.includes('大剧院')),expo:opts.some(t=>t.includes('会展中心'))};})())")
chk "R3 移动端建造面板双地标" "$(echo "$R3" | grep -o 'opera:true,expo:true')" "opera:true,expo:true"
agent-browser screenshot $OUT/v31_mobile.png >/dev/null && ok "截图 v31_mobile.png（移动端 · 建造面板）"
agent-browser close >/dev/null 2>&1

echo ""
echo "=========================================="
echo "v31 结果：$PASS 通过 / $FAIL 失败"
[ "$FAIL" -eq 0 ] && echo "全部通过 ✅" || echo "存在失败 ❌"
exit $FAIL
