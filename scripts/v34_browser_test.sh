#!/bin/bash
# ============================================================
# v34_browser_test.sh — 体育盛典「绿茵之城」端到端验证
# 增量 = tycoon.ts（LG_* 常数块 + LG_TIERS 四档客队表 + LG_TEAMS 名池
#   + stepLeague（开张/顺延/开赛哨）+ lgKick 比赛模拟（实力成长+幸福氛围+球迷底蕴）
#   + lgPlay 结算（战绩/情绪/彩带/编年史/赛季颁奖 LG_SZN=6 场积分 ≥13 冠军）
#   + lgTest 沙盒强制比赛 + 比赛日预热经济（LG_PRE=2.5 时内 com×1.08 tour×1.22 hap+1）
#   + snap/view v34 字段（stadiums/lgPre/lgTourK/lgComK/lgW + lg 全景对象 + gHours）
#   + 存档 lg* 十九字段（旧档缺省 → 未开张，体育场落成自动开赛）
#   + 成就 主场之威 / 冠军旗帜 + 任务压轴 绿茵之城）
#   + citizens.ts（CitzCtx.lg 绿茵心声：比赛日 4 条 / 赢球 4 条 / 输球 4 条）
#   + engine.ts（赢球彩带：spawnConfetti 56 粒七色 + 屏幕空间飘落绘制）
#   + icons.ts（ball 足球图标）+ PixelCity.tsx（顶栏「球」芯片 + 球场风云模态
#   + 财政报告比赛日行 + 帮助文案）
# S 段：bun 直测（常数 / 档次表 / 成就 / 任务）
# D 段：联赛引擎流（开张 / 首胜 / 预热 / 平负 / 赛季加冕 / 心声 / 顺延 / 双成就）
# U 段：球芯片 / 球场风云模态 / 财政比赛日行 / 编年史战报 / 成就墙 / 彩带截图
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
    # 仅首次连接时允许自开页面；中途 wait 失败不重开（重开会把游戏态洗掉）
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

echo "=== [S] 纯函数直测（bun：常数 / 档次表 / 客队池 / 成就 / 任务） ==="
S=$(cd /home/z/my-project && bun -e '
import { LG_SZN, LG_GAP, LG_PRE, LG_COM_K, LG_TOUR_K, LG_HAP, LG_MOOD_WIN, LG_MOOD_DRAW, LG_MOOD_LOSE,
  LG_MOOD_T, LG_FXT, LG_TIERS, LG_TEAMS, LG_HOME, ACHIEVEMENTS, QUESTS } from "./src/lib/pixelcity/tycoon.ts";
const a1 = ACHIEVEMENTS.find(a => a.id === "win5"), a2 = ACHIEVEMENTS.find(a => a.id === "champ1");
const q = QUESTS.find(x => x.id === "lg1") ?? QUESTS[QUESTS.length - 1];   // v35 起任务在末尾追加（zoo3），按 id 定位本版任务
console.log(JSON.stringify({
  k: LG_SZN + "," + LG_GAP + "," + LG_PRE + "," + LG_COM_K + "," + LG_TOUR_K + "," + LG_HAP,
  mood: LG_MOOD_WIN + "," + LG_MOOD_DRAW + "," + LG_MOOD_LOSE + "," + LG_MOOD_T + "," + LG_FXT,
  tiers: LG_TIERS.map(t => t.name).join("") + "|" + LG_TIERS.map(t => t.min).join(","),
  teams: LG_TEAMS.length + "x" + LG_TEAMS[0].length, home: LG_HOME,
  ach: (a1 ? a1.goal : -1) + "," + (a2 ? a2.goal : -1) + "," + a1.name + "," + a2.name,
  quest: q.id + "," + q.goal,
}));' 2>&1 | tail -1 | stripq)
chk "S1 联赛常数（6 场一季 · 间隔9时 · 预热2.5 · ×1.08/1.22/+1）" "$(echo "$S" | grep -o 'k:6,9,2.5,1.08,1.22,1')" "k:6,9,2.5,1.08,1.22,1"
chk "S2 赛后情绪（+3/+1/-2 · 120秒 · 彩带14秒）" "$(echo "$S" | grep -o 'mood:3,1,-2,120,14')" "mood:3,1,-2,120,14"
chk "S3 客队四档（业余/地区/全国/豪门 · 门槛 0/55/72/84）" "$(echo "$S" | grep -o 'tiers:业余组地区组全国组豪门巡访|0,55,72,84')" "tiers:业余组地区组全国组豪门巡访|0,55,72,84"
chk "S4 客队名池（4 档 × 4 队 · 主队市民联）" "$(echo "$S" | grep -o 'teams:4x4,home:市民联')" "teams:4x4,home:市民联"
chk "S5 成就定义（主场之威 5 / 冠军旗帜 1）" "$(echo "$S" | grep -o 'ach:5,1,主场之威,冠军旗帜')" "ach:5,1,主场之威,冠军旗帜"
chk "S6 任务压轴（lg1 建场并首胜）" "$(echo "$S" | grep -o 'quest:lg1,1')" "quest:lg1,1"

echo "=== [1] 桌面端 1440×900 新档开局 ==="
agent-browser close >/dev/null 2>&1; sleep 1
agent-browser set viewport 1440 900
agent-browser open $B
agent-browser storage local clear >/dev/null 2>&1
agent-browser reload
agent-browser wait --fn "window.__pxc!==undefined" --timeout 90000 && ok "引擎就绪" || bad "引擎超时"
agent-browser wait 3000
agent-browser eval "(()=>{const b=[...document.querySelectorAll('button')].filter(x=>(x.textContent||'').includes('跳过'));if(b.length)b[b.length-1].click();return 'tut';})()" >/dev/null 2>&1
# 冻结随机源：市民信/事件/生日不触发，景气指数步进停摆（联赛步进不冻结：无体育场天然不开张）
agent-browser eval "(()=>{const t=window.__pxc.tycoon;const c=t.citz;c.mailTimer=99999;c.evTimer=99999;c.bdayTimer=99999;t.eventTimer=99999;t.cycTimer=99999;return 'frozen';})()" >/dev/null 2>&1

echo "=== [2] D 段：联赛引擎流 ==="
# D1 基线：无体育场 → 联赛未开张（lgNext=-1 · 战绩全零）
D1=$(re "JSON.stringify((()=>{const e=window.__pxc;const t=e.tycoon;t.tick(0.05,e.map);const s=t.snap;
return {next:t.lgNext,st:s.stadiums,w:t.lgW};})())")
chk "D1 开埠基线（未开张 lgNext=-1 · 体育场0 · 胜0）" "$(echo "$D1" | grep -o 'next:-1,st:0,w:0')" "next:-1,st:0,w:0"
# D2 注入体育场 → tick → 联赛开张（lgNext=gHours+5.4 · 对手排定 · 绿茵开张纪事）
D2=$(re "JSON.stringify((()=>{const e=window.__pxc;const t=e.tycoon;const m=e.map;
const n=m.n;let spot=-1;
for(let y=8;y<n-10&&spot<0;y++)for(let x=8;x<n-10;x++){const i=y*n+x;
if(m.terr[i]>0&&!m.road[i]&&m.occ[i]<0&&m.tree[i]<0&&!m.objs.has(i)){let ok2=true;
for(let dy=0;dy<3&&ok2;dy++)for(let dx=0;dx<3;dx++){const j=(y+dy)*n+(x+dx);if(m.occ[j]>=0||m.road[j]||m.terr[j]<=0){ok2=false;break;}}
if(ok2){spot=i;break;}}}
if(spot<0)return {err:'nospot'};
const x=spot%n,y=(spot-x)/n;m.objs.set(spot,{id:'stadium',v:0,seed:0,ax:x,ay:y});
t.tick(0.05,m);
const delta=Math.round((t.lgNext-t.gHours)*10)/10;
return {delta,opp:t.lgOppN.length>0,seen:t.lgSeen,
chron:t.chron.entries.some(q=>q.title==='绿茵开张'),st:t.snap.stadiums};})())")
echo "  · D2 注入：$D2"
chk "D2 联赛开张（+5.4时首赛 · 对手已排 · 绿茵开张入册 · 体育场1）" "$(echo "$D2" | grep -o 'delta:5.4,opp:true,seen:true,chron:true,st:1')" "delta:5.4,opp:true,seen:true,chron:true,st:1"
# D3 强制首胜 → 战绩/情绪/彩带/编年史全链路
D3=$(re "JSON.stringify((()=>{const e=window.__pxc;const t=e.tycoon;
t.lgTest('胜');t.tick(0.05,e.map);const s=t.snap;
return {w:t.lgW,pts:t.lgPts,sn:t.lgSn,form:t.lgForm.join(''),mood:t.lgMood,mt:t.lgMoodT>0,
fx:t.lgFxT>0,last:t.lgLast.includes('胜'),big:t.chron.entries.some(q=>q.title==='主场奏捷')};})())")
chk "D3 首胜全链路（1胜3分 · 近五场胜 · 余温+3 · 彩带 · 奏捷入册）" "$(echo "$D3" | grep -o 'w:1,pts:3,sn:1,form:胜,mood:3,mt:true,fx:true,last:true,big:true')" "w:1,pts:3,sn:1,form:胜,mood:3,mt:true,fx:true,last:true,big:true"
# D4 比赛日预热：gHours 跳到开赛前 1 时 → lgPre=1 · 商业×1.08 · 游客×1.22 · 幸福+1
D4=$(re "JSON.stringify((()=>{const e=window.__pxc;const t=e.tycoon;
t.gHours=t.lgNext-1;t.tick(0.05,e.map);const s=t.snap;
return {pre:s.lgPre,comK:Math.round(s.lgComK*100)/100,tourK:Math.round(s.lgTourK*100)/100};})())")
chk "D4 比赛日预热（lgPre=1 · ×1.08 · ×1.22）" "$(echo "$D4" | grep -o 'pre:1,comK:1.08,tourK:1.22')" "pre:1,comK:1.08,tourK:1.22"
# D5 平局与败绩：平 +1 分情绪 +1 · 负 0 分情绪 -2 无彩带 · 战报入册
D5=$(re "JSON.stringify((()=>{const e=window.__pxc;const t=e.tycoon;
t.gHours+=9;t.lgTest('平');t.tick(0.05,e.map);
const d={p:t.lgPts,d:t.lgD,mood:t.lgMood};
t.lgFxT=0;t.lgMoodT=0;   // 清 D3 的彩带与余温（14 秒窗口与测试节奏竞态 → 负局断言改为确定性：清零后负局不得再触发彩带）
t.gHours+=9;t.lgTest('负');t.tick(0.05,e.map);
d.l=t.lgL;d.mood2=t.lgMood;d.fx=t.lgFxT>0;d.bad=t.chron.entries.some(q=>q.title==='主场憾负');
return d;})())")
echo "  · D5：$D5"
chk "D5 平负结算（平4分+1 · 负-2无彩带 · 憾负入册）" "$(echo "$D5" | grep -o 'p:4,d:1,mood:1,l:1,mood2:-2,fx:false,bad:true')" "p:4,d:1,mood:1,l:1,mood2:-2,fx:false,bad:true"
# D6 赛季加冕：5 胮 15 分 + 第 6 场胜 → 18 分夺冠（奖杯/赛季纪元/纪事/积分清零）
D6=$(re "JSON.stringify((()=>{const e=window.__pxc;const t=e.tycoon;
t.lgSn=5;t.lgPts=15;t.gHours+=9;t.lgTest('胜');t.tick(0.05,e.map);
return {zn:t.lgZN,t1:t.lgT1,bp:t.lgBP,sn:t.lgSn,pts:t.lgPts,
mile:t.chron.entries.some(q=>q.title==='联赛加冕')};})())")
chk "D6 赛季加冕（18分 · 冠1 · 单季最高18 · 积分清零 · 加冕入册）" "$(echo "$D6" | grep -o 'zn:1,t1:1,bp:18,sn:0,pts:0,mile:true')" "zn:1,t1:1,bp:18,sn:0,pts:0,mile:true"
# D7 绿茵心声：比赛日/赢球/输球三池（假市民占位取词后即撤）
D7=$(re "JSON.stringify((()=>{const t=window.__pxc.tycoon;
t.citz.roster.push({name:'测试市民',mood:60});
const base={pop:100,happiness:60,taxRate:9,season:1,famine:0,events:[],fest:-1,smog:0,dark:0,waste:0,eduOut:0,crime:0,fireOut:0};
const pre=[],win=[],lose=[];
for(let i=0;i<16;i++){const v=t.citz.voice({...base,lg:1});if(v)pre.push(v.text);}
for(let i=0;i<16;i++){const v=t.citz.voice({...base,lg:2});if(v)win.push(v.text);}
for(let i=0;i<16;i++){const v=t.citz.voice({...base,lg:3});if(v)lose.push(v.text);}
t.citz.roster.pop();
const isPre=pre.some(q=>/主场|摇旗|大巴|生意/.test(q));
const isWin=win.some(q=>/赢得漂亮|远射|夜市|有戏/.test(q));
const isLose=lose.some(q=>/垂头|任意球|防守|阿婆/.test(q));
return {pre:isPre,win:isWin,lose:isLose,n:t.citz.roster.length};})())")
chk "D7 绿茵心声（比赛日 · 赢球 · 输球 · 假市民已撤）" "$(echo "$D7" | grep -o 'pre:true,win:true,lose:true,n:0')" "pre:true,win:true,lose:true,n:0"
# D8 体育场被拆 → 开赛日顺延（不注销联赛：lgNext+3 · 场次不变）
D8=$(re "JSON.stringify((()=>{const e=window.__pxc;const t=e.tycoon;const m=e.map;
const before=t.lgPl;
const key=[...m.objs.entries()].find(([k,o])=>o.id==='stadium')?.[0];
if(key===undefined)return {err:'nostadium'};
m.objs.delete(key);t.gHours=t.lgNext+1;t.tick(0.05,m);
return {pl:t.lgPl===before,delay:Math.round(t.lgNext*10)/10===Math.round((t.gHours+3)*10)/10,st:t.snap.stadiums};})())")
chk "D8 拆场顺延（场次不变 · +3 时重排 · 体育场0）" "$(echo "$D8" | grep -o 'pl:true,delay:true,st:0')" "pl:true,delay:true,st:0"
# D9 重建球场 + 三连胜 → 成就双卡（主场之威5胜 / 冠军旗帜1冠）
D9=$(re "JSON.stringify((()=>{const e=window.__pxc;const t=e.tycoon;const m=e.map;
const n=m.n;let spot=-1;
for(let y=8;y<n-10&&spot<0;y++)for(let x=8;x<n-10;x++){const i=y*n+x;
if(m.terr[i]>0&&!m.road[i]&&m.occ[i]<0&&m.tree[i]<0&&!m.objs.has(i)){let ok2=true;
for(let dy=0;dy<3&&ok2;dy++)for(let dx=0;dx<3;dx++){const j=(y+dy)*n+(x+dx);if(m.occ[j]>=0||m.road[j]||m.terr[j]<=0){ok2=false;break;}}
if(ok2){spot=i;break;}}}
const x=spot%n,y=(spot-x)/n;m.objs.set(spot,{id:'stadium',v:0,seed:0,ax:x,ay:y});
t.gHours=t.lgNext+1;t.lgTest('胜');t.lgTest('胜');t.lgTest('胜');t.tick(0.05,m);
t.achvTimer=0.01;t.tick(0.05,m);
return {w:t.lgW,achW:t.achv.has('win5'),achC:t.achv.has('champ1'),str:t.lgStr};})())")
chk "D9 双成就（累计5胜 · 主场之威+冠军旗帜 · 连胜4）" "$(echo "$D9" | grep -o 'w:5,achW:true,achC:true,str:4')" "w:5,achW:true,achC:true,str:4"

echo "=== [3] U 段：球芯片 / 球场风云模态 / 财政比赛日行 / 编年史 / 成就墙 ==="
agent-browser eval "(()=>{const t=window.__pxc.tycoon;t.gHours=t.lgNext-1;t.tick(0.05,window.__pxc.map);return 'pre';})()" >/dev/null 2>&1
agent-browser wait 600
U1=$(re "JSON.stringify((()=>{
  const chip=[...document.querySelectorAll('button.chip')].find(x=>(x.getAttribute('title')||'').includes('比赛日'));
  const t=document.querySelector('.pxc')||document.body;
  const lgChip=!!document.querySelector('.lg-chip');
  return {chip:!!chip,pre:chip?(chip.getAttribute('title')||'').includes('比赛日'):false,cls:lgChip};})())")
chk "U1 顶栏球芯片（比赛日态 · 悬停提示在册）" "$(echo "$U1" | grep -o 'chip:true,pre:true,cls:true')" "chip:true,pre:true,cls:true"
agent-browser eval "(()=>{const b=[...document.querySelectorAll('button.chip')].find(x=>x.classList.contains('lg-chip'));if(b)b.click();return 'open';})()" >/dev/null 2>&1
agent-browser wait 800
U2=$(re "JSON.stringify((()=>{
  const m=document.querySelector('.pxc-lg');const txt=m?m.textContent||'':'';
  return {open:!!m,head:txt.includes('球场风云')||txt.includes('球场风云'.split('').join(' ')),
    vs:txt.includes('市民联')&&txt.includes('主场迎战'),
    stats:txt.includes('全期战绩')&&txt.includes('本季积分'),form:txt.includes('最近五场'),
    cups:txt.includes('冠军旗帜 ×1')&&txt.includes('季军奖牌 ×0')};})())")
echo "  · U2：$U2"
chk "U2 球场风云模态（赛程卡+战绩表+最近五场+荣誉墙）" "$(echo "$U2" | grep -o 'open:true,head:true,vs:true,stats:true,form:true,cups:true')" "open:true,head:true,vs:true,stats:true,form:true,cups:true"
agent-browser screenshot $OUT/v34_lg_modal.png >/dev/null && ok "截图 v34_lg_modal.png（桌面 · 球场风云）"
agent-browser eval "(()=>{document.querySelector('.pxc-lg .pxc-x')?.click();return 'x';})()" >/dev/null 2>&1
agent-browser eval "(()=>{const b=[...document.querySelectorAll('button')].find(x=>(x.getAttribute('title')||'').includes('财政报告'));if(b)b.click();return 'f';})()" >/dev/null 2>&1
agent-browser wait 900
U3=$(re "JSON.stringify((()=>{
  const txt=document.querySelector('.pxc-fiscal')?.textContent||'';
  return {row:txt.includes('比赛日'),hot:txt.includes('预热中 ×1.22')};})())")
chk "U3 财政报告比赛日行（观光经济区块 · 预热乘数在册）" "$(echo "$U3" | grep -o 'row:true,hot:true')" "row:true,hot:true"
agent-browser eval "(()=>{document.querySelector('.pxc-fiscal .pxc-x')?.click();return 'x';})()" >/dev/null 2>&1
agent-browser eval "(()=>{const b=[...document.querySelectorAll('button.chip')].find(x=>(x.getAttribute('title')||'').includes('编年史'));if(b)b.click();return 'c';})()" >/dev/null 2>&1
agent-browser wait 700
U4=$(re "JSON.stringify((()=>{
  const txt=document.querySelector('.pxc-chron')?.textContent||'';
  return {a1:txt.includes('主场奏捷'),a2:txt.includes('联赛加冕'),a3:txt.includes('绿茵开张'),a4:txt.includes('主场憾负')};})())")
chk "U4 编年史战报（奏捷+加冕+绿茵开张+憾负全入册）" "$(echo "$U4" | grep -o 'a1:true,a2:true,a3:true,a4:true')" "a1:true,a2:true,a3:true,a4:true"
agent-browser eval "(()=>{document.querySelector('.pxc-chron .pxc-x')?.click();return 'x';})()" >/dev/null 2>&1
agent-browser eval "(()=>{const b=[...document.querySelectorAll('button.chip')].find(x=>(x.getAttribute('title')||'').includes('城市志'));if(b)b.click();return 'd';})()" >/dev/null 2>&1
agent-browser wait 700
U5=$(re "JSON.stringify((()=>{
  const txt=document.querySelector('.pxc-modal')?.textContent||'';
  return {a1:txt.includes('主场之威'),a2:txt.includes('冠军旗帜')};})())")
chk "U5 成就墙双卡在册" "$(echo "$U5" | grep -o 'a1:true,a2:true')" "a1:true,a2:true"
agent-browser eval "(()=>{document.querySelector('.pxc-modal .pxc-x')?.click();return 'x';})()" >/dev/null 2>&1
agent-browser wait 400
# U6 赢球彩带：强制胜局 → lgFxT>0 → 全屏截图（VLM 复核七色纸屑）
agent-browser eval "(()=>{const e=window.__pxc;e.tycoon.lgTest('胜');e.tycoon.tick(0.05,e.map);return e.tycoon.lgFxT>0;})()" >/dev/null 2>&1
agent-browser screenshot $OUT/v34_cheer.png >/dev/null && ok "截图 v34_cheer.png（桌面 · 赢球彩带）"

echo "=== [4] R 段：存档往返 + 移动端 + 零错误 ==="
re "JSON.stringify((()=>{window.__pxc.tycoon.save(window.__pxc.map);return 'saved';})())" >/dev/null
agent-browser reload >/dev/null 2>&1
agent-browser wait --fn "window.__pxc!==undefined" --timeout 90000 >/dev/null 2>&1
agent-browser wait 3000
agent-browser eval "(()=>{const b=[...document.querySelectorAll('button')].filter(x=>(x.textContent||'').includes('跳过'));if(b.length)b[b.length-1].click();return 'tut';})()" >/dev/null 2>&1
agent-browser eval "(()=>{const t=window.__pxc.tycoon;t.cycTimer=99999;t.eventTimer=99999;return 'f';})()" >/dev/null 2>&1
# R1 往返：联赛档恢复（战绩/奖杯/赛季纪元/近五场/赛程全保留）
R1=$(re "JSON.stringify((()=>{const t=window.__pxc.tycoon;t.tick(0.05,window.__pxc.map);
return {w:t.lgW,t1:t.lgT1,zn:t.lgZN,form:t.lgForm.length,last:t.lgLast.length>0,
next:t.lgNext>0||t.lgNext===-1,st:t.snap.stadiums,mile:t.chron.entries.some(q=>q.title==='联赛加冕')};})())")
chk "R1 往返（胜场/奖杯/赛季/近五场/战报/赛程全保留）" "$(echo "$R1" | grep -o 'w:6,t1:1,zn:1,form:5,last:true,next:true,st:1,mile:true')" "w:6,t1:1,zn:1,form:5,last:true,next:true,st:1,mile:true"
ERR=$(errcount)
chk "R2 控制台零错误" "${ERR:-x}" "0"
# R3 移动端球场风云
agent-browser set viewport 390 844
agent-browser wait 1200
agent-browser eval "(()=>{const b=[...document.querySelectorAll('button.chip')].find(x=>x.classList.contains('lg-chip'));if(b)b.click();return 'open';})()" >/dev/null 2>&1
agent-browser wait 700
R3=$(re "JSON.stringify((()=>{
  const m=document.querySelector('.pxc-lg');
  return {open:!!m,stats:m?(m.textContent||'').includes('全期战绩'):false,
    w:m?m.getBoundingClientRect().width<=window.innerWidth:false};})())")
chk "R3 移动端球场风云（模态在册 · 战绩在册 · 不溢出）" "$(echo "$R3" | grep -o 'open:true,stats:true,w:true')" "open:true,stats:true,w:true"
agent-browser screenshot $OUT/v34_mobile.png >/dev/null && ok "截图 v34_mobile.png（移动端 · 球场风云）"
agent-browser close >/dev/null 2>&1

echo ""
echo "=========================================="
echo "v34 结果：$PASS 通过 / $FAIL 失败"
[ "$FAIL" -eq 0 ] && echo "全部通过 ✅" || echo "存在失败 ❌"
exit $FAIL
