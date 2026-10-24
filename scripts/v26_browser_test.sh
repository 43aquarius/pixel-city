#!/bin/bash
# ============================================================
# v26_browser_test.sh — 含饴弄孙·四季人生「生命周期 + 传记四段 + 故人体系」端到端验证
# 实读结论：v24/v25 已交付火灾/窃案实景与传记空间化 + 人物志根/家/迹；
#   v26 增量 = 生命周期流转（婴儿3岁垂髫→7岁入学→16-18成人礼→60花甲→82+安眠）
#   + 传记第四段「评」（街坊口碑收束语）+ 故人体系（famOf 已故/迁居区分）
#   + updateBio 五套速写 + 生民计数（bornN/grownN/passedN/passed90N）
#   + 成就×3（长大成人/生生不息/含笑而归）+ 任务×1 + 编年史「寿星安眠」。
# 布局（复用 v25 南郊商街：主干 y=126/127/128 + 支线 x=113(y128..140) + 商街 y=140）：
#   商铺 A(114,141)（成人礼择业池）· 交班(120,125)
# 注入 8 位（S 段保底 >6 使 passAway 不受保护限制）：
#   r0=婴儿(r0.gender=1,origin=本城出生) r1=儿童学生(gender=0) r2×r3=定向婚对(0/1)
#   r4=高寿长者候选 r5..r7=自由成人（婚对后备/福星候选）
# S 段：S1 布局+身份 → S2 定向成婚 → S3-S6 婴儿三段（垂髫/入学/成人礼）
#       S7 花甲 → S8 安眠（配偶史册+故人簿+心情）→ S9 高寿安眠（编年史）
# L 段：评段全覆盖 / 长者福星 / updateBio 成人化 / 故人卡
# B 段：成就×3 + 城市志生民行 + 详情页 UI + fam-card 已故 + bdayTimer 自然推进
# R 段：存档往返 + 旧档兼容（剥离 v26 字段）+ 零错误 + 双端截图
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
stripq() { tr -d '\\' | tr -d '"' | tr -d ' '; }
# v25 同款防御性 eval（最多 4 次重试 + 页面自愈）
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

echo "=== [1] 桌面端 1440×900 新档开局 ==="
agent-browser close >/dev/null 2>&1; sleep 1
agent-browser set viewport 1440 900
agent-browser open $B
agent-browser storage local clear >/dev/null 2>&1
agent-browser reload
agent-browser wait --fn "window.__pxc!==undefined" --timeout 90000 && ok "引擎就绪" || bad "引擎超时"
agent-browser wait 3000
agent-browser eval "(()=>{const b=[...document.querySelectorAll('button')].filter(x=>(x.textContent||'').includes('跳过'));if(b.length)b[b.length-1].click();return 'tut';})()" >/dev/null 2>&1
agent-browser eval "(()=>{const e=window.__pxc;const t=e.tycoon;t.level=9;t.coins=30000;
for(let x=112;x<=136;x++){e.map.setRoad(x,126,true);e.map.setRoad(x,127,true);e.map.setRoad(x,128,true);}
for(let y=128;y<=140;y++)e.map.setRoad(113,y,true);
for(let x=112;x<=118;x++)e.map.setRoad(x,140,true);
return 'roads';})()" >/dev/null 2>&1

echo "=== [2] S 段：生命周期驱动 ==="
# S1：商铺落成 + 注入 8 位 + 身份定向（婴儿/儿童/婚对/高寿候选/后备）
S1=$(re "JSON.stringify((()=>{const e=window.__pxc;const t=e.tycoon;
const a=e.map.place('shop',0,114,141);
const kb=e.map.place('koban',0,120,125);
for(let k=0;k<8;k++){t.pop+=14;t.tick(0.05,e.map);}
const r=t.citz.roster;
if(r.length<8)return {err:'few',n:r.length};
// 全员清婚（lifeEvent 可能已随机成婚）
for(const c of r){c.spouse=0;c.fam=0;}
// r0=婴儿（女 · 本城出生 · 学区外入学的措辞分支可断言）
r[0].body=1;r[0].role=3;r[0].job='襁褓婴儿';r[0].age=0;r[0].edu=0;r[0].origin='本城出生';r[0].gender=1;
// r1=儿童学生（男 16 岁内待成人礼）
r[1].body=1;r[1].role=3;r[1].job='小学学生';r[1].age=10;r[1].edu=0;r[1].gender=0;
// r2×r3=定向婚对（性别 0/1；r2 在职商铺 → 花甲退休日志可断言）
r[2].body=0;r[2].gender=0;r[2].age=45;r[2].job='杂货店主';r[2].workName='杂货店主';
r[2].workKey=e.map.idx(114,141);r[2].workAt=[114,141];
r[3].body=0;r[3].gender=1;r[3].age=43;
// r4=高寿候选 · r5..r7=自由成人（r5 男作 r0 成人礼后的婚对）
r[4].body=0;r[4].gender=0;r[4].age=50;
r[5].body=0;r[5].gender=0;r[5].age=30;
r[6].body=0;r[6].gender=1;r[6].age=28;
r[7].body=0;r[7].gender=1;r[7].age=52;
window.T={baby:r[0].id,child:r[1].id,h:r[2].id,w:r[3].id,e2:r[4].id,mate:r[5].id,fstar:r[7].id};
return {a:!!a,k:!!kb,n:r.length};})())")
chk "S1 商铺+交班落成 + 注入 8 位（保底>6）" "$(echo "$S1" | grep -o 'a:true,k:true,n:8')" "a:true,k:true,n:8"
# S2：定向成婚（r2×r3 互指）
S2=$(re "JSON.stringify((()=>{const t=window.__pxc.tycoon;
const r=t.citz.roster;
const rw=t.citz.forceEvent('wed',window.T.h);
const h=r.find(c=>c.id===window.T.h),w=r.find(c=>c.id===window.T.w);
return {ok:rw.ok,sp:h&&w?(h.spouse===window.T.w&&w.spouse===window.T.h):false,
famOK:h?(h.fam>0):false};})())")
chk "S2 定向成婚 r2×r3（档案互指+家族号）" "$(echo "$S2" | grep -o 'ok:true,sp:true,famOK:true')" "ok:true,sp:true,famOK:true"
# S3：婴儿 3 岁 → 垂髫小儿
S3=$(re "JSON.stringify((()=>{const e=window.__pxc;const t=e.tycoon;
const g=t.citz.forceGrow(window.T.baby,3,e.map);
const c=t.citz.roster.find(x=>x.id===window.T.baby);
return {ev:g.events.join(','),job:c.job,
lg:c.log.some(l=>/满巷子疯跑/.test(l.text)),
bio:/玻璃弹珠/.test(c.bio)};})())")
chk "S3 婴儿3岁→垂髫小儿" "$(echo "$S3" | grep -o 'ev:toddler,job:垂髫小儿,lg:true,bio:true')" "ev:toddler,job:垂髫小儿,lg:true,bio:true"
# S4：7 岁 → 小学学生（学区外文案分支：无学堂在册）
S4=$(re "JSON.stringify((()=>{const e=window.__pxc;const t=e.tycoon;
const g=t.citz.forceGrow(window.T.baby,4,e.map);
const c=t.citz.roster.find(x=>x.id===window.T.baby);
return {ev:g.events.join(','),job:c.job,
lg:c.log.some(l=>/进了街口的小学|翻半座城/.test(l.text)),
bio:/书包/.test(c.bio)};})())")
chk "S4 7岁→小学学生（学区文案+速写）" "$(echo "$S4" | grep -o 'ev:school,job:小学学生,lg:true,bio:true')" "ev:school,job:小学学生,lg:true,bio:true"
# S5：19 岁 → 成人礼（择业 + 制服 + 速写 + grownN）
S5=$(re "JSON.stringify((()=>{const e=window.__pxc;const t=e.tycoon;
const g=t.citz.forceGrow(window.T.baby,12,e.map);
const c=t.citz.roster.find(x=>x.id===window.T.baby);
return {ev:g.events.join(','),body:c.body,wk:c.workKey>=0?1:0,
rite:c.log.some(l=>/行完成人礼/.test(l.text)),
jobLog:c.log.some(l=>/谋得第一份生计/.test(l.text)),
bio:!/孩子/.test(c.bio)&&/小伙|姑娘/.test(c.bio)?1:0,
bornTxt:/在这座城里出生长大/.test(c.bio),
gn:t.citz.grownN};})())")
chk "S5 成人礼（body→0·择业·史册·速写）" "$(echo "$S5" | grep -o 'ev:adult,body:0,wk:1,rite:true,jobLog:true,bio:1')" "ev:adult,body:0,wk:1,rite:true,jobLog:true,bio:1"
chk "S5b 速写本城出生措辞" "$(echo "$S5" | grep -o 'bornTxt:true')" "bornTxt:true"
chk "S5c grownN=1" "$(echo "$S5" | grep -o 'gn:1')" "gn:1"
# S6：儿童 r1 → 成人礼（grownN=2）
S6=$(re "JSON.stringify((()=>{const e=window.__pxc;const t=e.tycoon;
const g=t.citz.forceGrow(window.T.child,9,e.map);
const c=t.citz.roster.find(x=>x.id===window.T.child);
return {ev:g.events.includes('adult'),body:c.body,wk:c.workKey>=0?1:0,gn:t.citz.grownN};})())")
chk "S6 儿童成人礼（grownN=2）" "$(echo "$S6" | grep -o 'ev:true,body:0,wk:1,gn:2')" "ev:true,body:0,wk:1,gn:2"
# S7：r2 花甲（退休清职 + 制服归零）
S7=$(re "JSON.stringify((()=>{const t=window.__pxc.tycoon;
const rw=t.citz.forceEvent('retire',window.T.h);
const c=t.citz.roster.find(x=>x.id===window.T.h);
return {ok:rw.ok,body:c.body,job:c.job,wk:c.workKey,
ret:c.log.some(l=>/退休手续/.test(l.text)),
hua:c.log.some(l=>/花甲/.test(l.text)),
bio:/长者/.test(c.bio)};})())")
chk "S7 花甲（body→2·退休清职·史册·速写）" "$(echo "$S7" | grep -o 'ok:true,body:2,job:退休长者,wk:-1,ret:true,hua:true,bio:true')" "ok:true,body:2,job:退休长者,wk:-1,ret:true,hua:true,bio:true"
# S8：r2 推至 88 → 安眠（讣告计数 + 配偶史册 + 故人簿 + 心情）
WMOOD=$(re "(()=>{const t=window.__pxc.tycoon;const c=t.citz.roster.find(x=>x.id===window.T.w);return Math.round(c.mood);})()")
S8=$(re "JSON.stringify((()=>{const e=window.__pxc;const t=e.tycoon;
const before=t.citz.roster.length;
t.citz.forceGrow(window.T.h,25,e.map);
const r=t.citz.forceEvent('pass',window.T.h);
const v=t.citz.view();
const wc=v.roster.find(x=>x.id===window.T.w);
const famOK=wc?(wc.fam||[]).some(f=>f.rel==='故人'&&f.gone==='passed'&&/已故/.test(f.note||'')):false;
const w=t.citz.roster.find(x=>x.id===window.T.w);
return {ok:r.ok,pn:t.citz.passedN,drop:before-t.citz.roster.length,
lg:w?w.log.some(l=>/老伴先走了一步/.test(l.text)):false,
mood:Math.round(w?w.mood:0),wBefore:$WMOOD,
pid:t.citz.passedIds.has(window.T.h),p9:t.citz.passed90N,famOK:famOK};})())")
chk "S8 安眠（移册+讣告计数）" "$(echo "$S8" | grep -o 'ok:true,pn:1,drop:1')" "ok:true,pn:1,drop:1"
chk "S8b 配偶史册「老伴先走」+心情回落" "$(echo "$S8" | grep -o 'lg:true')" "lg:true"
MNOW=$(echo "$S8" | grep -o 'mood:[0-9]*' | cut -d: -f2)
MBEF=$(echo "$S8" | grep -o 'wBefore:[0-9]*' | cut -d: -f2)
if [ -n "$MNOW" ] && [ -n "$MBEF" ] && [ "$MNOW" -le $((MBEF - 10)) ] 2>/dev/null; then
  ok "S8c 遗孀心情回落（$MBEF→$MNOW，约−15）"
else
  bad "S8c 遗孀心情回落（got=${MNOW:-x} want≤$(( ${MBEF:-0} - 10 ))）"
fi
chk "S8d 故人簿登记（passedIds）" "$(echo "$S8" | grep -o 'pid:true')" "pid:true"
chk "S8e 故人卡（fam gone=passed 已故）" "$(echo "$S8" | grep -o 'famOK:true')" "famOK:true"
# S9：r4 花甲→92 岁安眠 → passed90N + 编年史「寿星安眠」
S9=$(re "JSON.stringify((()=>{const e=window.__pxc;const t=e.tycoon;
t.citz.forceEvent('retire',window.T.e2);
t.citz.forceGrow(window.T.e2,42,e.map);
const r=t.citz.forceEvent('pass',window.T.e2);
return {ok:r.ok,pn:t.citz.passedN,p9:t.citz.passed90N,
chron:t.chron.entries.some(x=>x.title==='寿星安眠')?1:0};})())")
chk "S9 高寿安眠（90+ 计数）" "$(echo "$S9" | grep -o 'ok:true,pn:2,p9:1')" "ok:true,pn:2,p9:1"
chk "S9b 编年史「寿星安眠」入册" "$(echo "$S9" | grep -o 'chron:1')" "chron:1"

echo "=== [3] L 段：传记四段 + 速写 ==="
# L1：全员 story 含「街坊口碑」（评段）
L1=$(re "JSON.stringify((()=>{const t=window.__pxc.tycoon;
const v=t.citz.view();
let n=0;
for(const c of v.roster){if(c.story&&/街坊口碑/.test(c.story))n++;}
return {cn:v.roster.length,withCmt:n,sample:v.roster[0]?v.roster[0].story.slice(-60):''};})())")
N1=$(echo "$L1" | grep -o 'cn:[0-9]*' | cut -d: -f2)
chkge "L1a 评段全覆盖（在册全员）" "$(echo "$L1" | grep -o 'withCmt:[0-9]*' | cut -d: -f2)" "1"
[ "$(echo "$L1" | grep -o 'withCmt:[0-9]*' | cut -d: -f2)" = "$N1" ] && ok "L1b 覆盖率 cn=withCmt ($N1)" || bad "L1b cn=$N1 withCmt=$(echo "$L1" | grep -o 'withCmt:[0-9]*')"
echo "  · L1 评段样本：$(echo "$L1" | grep -o 'sample:.*' | head -c 80)"
# L2：长者福星口碑（r7 花甲 + mood 抬升）
L2=$(re "JSON.stringify((()=>{const t=window.__pxc.tycoon;
t.citz.forceEvent('retire',window.T.fstar);
const c=t.citz.roster.find(x=>x.id===window.T.fstar);
c.mood=78;
const card=t.citz.view().roster.find(x=>x.id===window.T.fstar);
return {body:c.body,fu:/老福星/.test(card.story)?1:0};})())")
chk "L2 长者「老福星」口碑" "$(echo "$L2" | grep -o 'body:2,fu:1')" "body:2,fu:1"
# L3：r0 成人速写（小伙/姑娘）+ 出生长大
L3=$(re "JSON.stringify((()=>{const t=window.__pxc.tycoon;
const card=t.citz.view().roster.find(x=>x.id===window.T.baby);
return {bio:card.bio,okB:/小伙|姑娘/.test(card.bio)&&!/孩子/.test(card.bio)};})())")
echo "  · L3 r0 速写：$(echo "$L3" | grep -o 'bio:.*' | head -c 90)"
chk "L3 成人速写（无「孩子」措辞）" "$(echo "$L3" | grep -o 'okB:true')" "okB:true"

echo "=== [4] B 段：成就/城市志/UI/自然推进 ==="
# B1：r0（女）×r5（男）成婚 → 添丁×8（bornN=8）→ 6 婴长大（grownN=8）
B1=$(re "JSON.stringify((()=>{const e=window.__pxc;const t=e.tycoon;
const r=t.citz.roster;
// r0 成人（女）× r5（男）—— 清其余单身干扰：仅 r5 保持单身（spouse 占位+pa 标记，成婚后还原）
for(const c of r){if(c.id!==window.T.baby&&c.id!==window.T.mate&&c.body===0&&!c.spouse){c.spouse=1;c.pa=9999;}}
const rw=t.citz.forceEvent('wed',window.T.baby);
for(const c of r){if(c.pa===9999){c.pa=0;c.spouse=0;}}
const c0=r.find(x=>x.id===window.T.baby);
const sp=c0?c0.spouse:0;
// 添丁 ×8（同一对夫妇连续添丁：born 走 addNewborn）
let bornOK=0;
for(let i=0;i<8;i++){const b=t.citz.forceEvent('born',window.T.baby);if(b.ok)bornOK++;}
// 6 位婴儿直推长大（19 岁 ≥ growAge）
let grown=0;
const babies=r.filter(x=>x.pa===window.T.baby||x.ma===window.T.baby);
for(const bb of babies.slice(0,6)){const g=t.citz.forceGrow(bb.id,19,e.map);if(g.events.includes('adult'))grown++;}
// 成就巡检周期 2s：补 3s 游戏时间后读 achv
for(let i=0;i<60;i++)t.tick(0.05,e.map);
return {wed:rw.ok,spHere:sp?r.find(x=>x.id===sp)?1:0:0,spouse:sp,
bornN:t.citz.bornN,gn:t.citz.grownN,grown,
a1:t.achv.has('grown6'),a2:t.achv.has('born8'),a3:t.achv.has('pass90')};})())")
chk "B1a 成婚（r0×r5）" "$(echo "$B1" | grep -o 'wed:true,spHere:1')" "wed:true,spHere:1"
chkge "B1b 添丁×8（bornN）" "$(echo "$B1" | grep -o 'bornN:[0-9]*' | cut -d: -f2)" "8"
chkge "B1c 6 婴长大（grownN≥6）" "$(echo "$B1" | grep -o 'gn:[0-9]*' | cut -d: -f2)" "6"
chk "B1d 成就 grown6 解锁" "$(echo "$B1" | grep -o 'a1:true')" "a1:true"
chk "B1e 成就 born8 解锁" "$(echo "$B1" | grep -o 'a2:true')" "a2:true"
chk "B1f 成就 pass90 解锁" "$(echo "$B1" | grep -o 'a3:true')" "a3:true"
# B2：城市志生民行（view 计数 + UI 行）
B2=$(re "JSON.stringify((()=>{const t=window.__pxc.tycoon;
const v=t.view();
return {pass:v.citzPassed,elders:v.citzElders,gn:v.citzGrown,bn:v.citzBorn,n:v.citzN};})())")
chkge "B2a 城市志计数（passed≥2）" "$(echo "$B2" | grep -o 'pass:[0-9]*' | cut -d: -f2)" "2"
chkge "B2b 长者计数（elders≥1）" "$(echo "$B2" | grep -o 'elders:[0-9]*' | cut -d: -f2)" "1"
chkge "B2c 长大成人计数（gn≥6）" "$(echo "$B2" | grep -o 'gn:[0-9]*' | cut -d: -f2)" "6"
# B3：详情页人物志含评段（UI）
agent-browser eval "(()=>{const b=document.querySelector('button.chip[title*=市民列传]');if(b)b.click();return 'open';})()" >/dev/null 2>&1
agent-browser wait 800
R4T=$(re "(()=>{const t=window.__pxc.tycoon;const w=t.citz.roster.find(x=>x.id===window.T.w);const nm=w?w.name:'';return nm;})()")
agent-browser eval "(()=>{const cs=[...document.querySelectorAll('.citz-card')];const b=cs.find(x=>(x.textContent||'').includes('$R4T'));if(b)b.click();return 'sel';})()" >/dev/null 2>&1
agent-browser wait 800
STORYUI=$(re "(()=>{const el=document.querySelector('.cd-story');return el?(el.textContent||''):'none';})()")
if echo "${STORYUI:-none}" | grep -q "街坊口碑"; then
  ok "B3 详情页评段可见（cd-story 含街坊口碑，${#STORYUI} 字）"
else
  bad "B3 详情页评段（got=$(echo "$STORYUI" | head -c 60)）"
fi
FAMOFF=$(re "(()=>{const el=[...document.querySelectorAll('.fam-card.off')].map(x=>x.textContent||'').join('|');return el||'none';})()")
if echo "${FAMOFF:-none}" | grep -q "已故"; then
  ok "B4 故人卡「已故」（$(echo "$FAMOFF" | head -c 40)）"
else
  bad "B4 故人卡（got=$(echo "$FAMOFF" | head -c 60)）"
fi
agent-browser screenshot $OUT/v26_story_ui.png >/dev/null && ok "截图 v26_story_ui.png（人物志评段+故人卡）"
# B5：城市志「生民列传」行（UI）
agent-browser eval "(()=>{const b=document.querySelector('button.chip[title*=就业率]');if(b)b.click();return 'open';})()" >/dev/null 2>&1
agent-browser wait 900
ROWUI=$(re "(()=>{const el=document.querySelector('.pxc-data');if(!el)return 'nomodal';const tx=el.textContent||'';return (tx.includes('生民列传')&&tx.includes('含笑而归')&&!tx.includes('undefined'))?'yes':'no:'+tx.slice(0,80);})()")
chk "B5 城市志「生民列传」行" "${ROWUI:-x}" "yes"
agent-browser screenshot $OUT/v26_data_row.png >/dev/null && ok "截图 v26_data_row.png（城市志生民行）"
agent-browser eval "(()=>{const b=[...document.querySelectorAll('button')].filter(x=>(x.textContent||'').includes('关闭'));if(b.length)b[0].click();return 'close';})()" >/dev/null 2>&1
# B6：bdayTimer 自然推进（真实时钟 ~2 次扫描；在册 ≥8 人时 0 失败概率 <0.2%）
BASE=$(re "(()=>{const t=window.__pxc.tycoon;const m={};for(const c of t.citz.roster)m[c.id]=c.age;window.AGEBASE=m;return Object.keys(m).length;})()")
chkge "B6a 年龄基线（在册人数）" "${BASE:-0}" "8"
if agent-browser wait --fn "(()=>{const t=window.__pxc.tycoon;return t.citz.roster.some(c=>window.AGEBASE&&c.age>(window.AGEBASE[c.id]||0))})()" --timeout 120000 >/dev/null 2>&1; then
  ok "B6b bdayTimer 自然推进（120s 内有人过生日）"
else
  bad "B6b bdayTimer 未推进（120s 无生日）"
fi

echo "=== [5] R 段：存档往返 + 旧档兼容 + 双端截图 ==="
# R1：存档快照
R1=$(re "JSON.stringify((()=>{const e=window.__pxc;const t=e.tycoon;
const v=t.citz.view();
const wc=v.roster.find(x=>x.id===window.T.w);
const snap={bn:t.citz.bornN,gn:t.citz.grownN,pn:t.citz.passedN,p9:t.citz.passed90N,
pidN:t.citz.passedIds.size,
famOK:wc?(wc.fam||[]).some(f=>f.gone==='passed'&&/已故/.test(f.note||'')):false};
window.SNAP=snap;
t.save(e.map);
return snap;})())")
echo "  · R1 存档快照：$(echo "$R1" | head -c 130)"
BN1=$(echo "$R1" | grep -o 'bn:[0-9]*' | cut -d: -f2)
GN1=$(echo "$R1" | grep -o 'gn:[0-9]*' | cut -d: -f2)
PN1=$(echo "$R1" | grep -o 'pn:[0-9]*' | cut -d: -f2)
P91=$(echo "$R1" | grep -o 'p9:[0-9]*' | cut -d: -f2)
# R2：reload → 恢复断言
agent-browser reload >/dev/null 2>&1
agent-browser wait --fn "window.__pxc!==undefined" --timeout 90000 >/dev/null 2>&1
agent-browser wait 3000
R2=$(re "JSON.stringify((()=>{const e=window.__pxc;const t=e.tycoon;
// reload 后 window.T 丢失：动态发现遗孀（带「故人」卡的在册者）
const wcv=t.citz.view();
const wc=wcv.roster.find(x=>(x.fam||[]).some(f=>f.gone==='passed'&&f.rel==='故人'))||null;
const s0=wcv.roster[0];
return {bn:t.citz.bornN,gn:t.citz.grownN,pn:t.citz.passedN,p9:t.citz.passed90N,pidN:t.citz.passedIds.size,
same:t.citz.bornN===$BN1&&t.citz.grownN===$GN1&&t.citz.passedN===$PN1&&t.citz.passed90N===$P91,
famOK:wc?(wc.fam||[]).some(f=>f.gone==='passed'&&/已故/.test(f.note||'')):false,
widow:wc?wc.name:'-',
sl:s0&&s0.story?s0.story.length:0,
ga:t.citz.roster.some(c=>c.growAge&&c.growAge>=15),
vp:t.view().citzPassed,vg:t.view().citzGrown};})())")
chk "R2a 计数恢复（bn/gn/pn/p9/pid）" "$(echo "$R2" | grep -o 'same:true')" "same:true"
chk "R2b 故人簿恢复（fam gone）" "$(echo "$R2" | grep -o 'famOK:true')" "famOK:true"
chkge "R2c 人物志重生成（story≥40）" "$(echo "$R2" | grep -o 'sl:[0-9]*' | cut -d: -f2)" "40"
chk "R2d growAge 存档往返" "$(echo "$R2" | grep -o 'ga:true')" "ga:true"
chkge "R2e view 计数（passed≥2）" "$(echo "$R2" | grep -o 'vp:[0-9]*' | cut -d: -f2)" "2"
# R3：旧档兼容（剥离 v26 字段 bn/gn/pn/p9/pid/ga → 恢复为 0 不崩溃）
R3=$(re "JSON.stringify((()=>{const key='pxc_tycoon_v1';
const raw=localStorage.getItem(key);
if(!raw)return {err:'nosave'};
const d=JSON.parse(raw);
const cz=d.citz;
if(cz){delete cz.bn;delete cz.gn;delete cz.pn;delete cz.p9;delete cz.pid;
if(Array.isArray(cz.roster))for(const r of cz.roster)delete r.ga;}
localStorage.setItem(key,JSON.stringify(d));
return {strip:true};})())")
chk "R3a 旧档剥离 v26 字段" "$(echo "$R3" | grep -o 'strip:true')" "strip:true"
agent-browser reload >/dev/null 2>&1
agent-browser wait --fn "window.__pxc!==undefined" --timeout 90000 >/dev/null 2>&1
agent-browser wait 3000
R3B=$(re "JSON.stringify((()=>{const t=window.__pxc.tycoon;
return {bn:t.citz.bornN,gn:t.citz.grownN,pn:t.citz.passedN,p9:t.citz.passed90N,
n:t.citz.roster.length};})())")
chk "R3b 旧档计数归零（不崩溃）" "$(echo "$R3B" | grep -o 'bn:0,gn:0,pn:0,p9:0')" "bn:0,gn:0,pn:0,p9:0"
ERR=$(errcount)
chk "R3c 控制台零错误" "${ERR:-x}" "0"
# R4：城市全景 + 移动端
agent-browser eval "(()=>{const e=window.__pxc;e.centerAt(118,138);return 'city';})()" >/dev/null 2>&1
agent-browser wait 800
agent-browser screenshot $OUT/v26_city.png >/dev/null && ok "截图 v26_city.png（城市全景）"
agent-browser set viewport 390 844
agent-browser wait 1200
agent-browser screenshot $OUT/v26_mobile.png >/dev/null && ok "截图 v26_mobile.png（移动端）"
agent-browser close >/dev/null 2>&1

echo ""
echo "===== 结果：PASS=$PASS FAIL=$FAIL ====="
[ $FAIL -eq 0 ] && echo "ALL GREEN" || echo "HAS FAILURES"
exit $FAIL
