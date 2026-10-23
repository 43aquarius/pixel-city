#!/bin/bash
# ============================================================
# v15_browser_test.sh — 抬头见熟人 端到端验证（with_dev.sh 内运行）
# 验证点：
#   S 段：外观认人（街上走的就是本人）
#     S1  新档：外观偏置池空 + 信箱空
#     S2  布城 + 人口脉冲 → 市民入册 ≥5 → 5s 后偏置池非空
#     S3  spotCard 精确匹配：在册三元组 → 返回在册市民（非 guest）
#     S4  路人卡：未命中三元组 → guest=true / id=0 / 有姓名传记
#     S5  行人本尊：偏置生效后街上出现与在册市民同款三元组的行人
#     S6  合成点击行人 → 模态打开（cd-spot：本人 or 过路人）
#   F 段：家族谱系
#     F1  初始：市民 fam/spouse 全 0
#     F2  forceEvent('wed') → 双档 spouse 互指 + fam 同号 + 双方日志
#     F3  forceEvent('born') → 新生儿入册（随父姓 / pa·ma / body=1 / 日志）
#     F4  cardOf 家人卡片：配偶 + 子女（rel 正确）
#     F5  UI：「一家人」区块渲染 + 点家人卡跳转详情
#   M 段：市长信箱
#     M1  forceLetter → 字段完整（主题/正文/3 选项/未读）
#     M2  mailView 新信在前 + mailBrief 计数
#     M3  状态选信：taxRate=15 → 税单吐槽信
#     M4  markRead → unread 归零
#     M5  replyLetter → replied/replyCount/发件人心情变化/大事记
#     M6  重复回信被拒
#     M7  HUD 邮芯片 + 未读红点 DOM
#     M8  信箱模态 UI：列表 → 信详情 → 回信 → 已回信态
#     M9  成就「见字如面」（回信 8 封）
#   P 段：存档与兼容
#     P1  save + reload：信箱/家族/新生儿完整保留
#     P2  v10 老档兼容：无 fam/letters 字段 → 恢复不崩
#     P3  无控制台错误 + 双端截图
# ============================================================
set -u
B=http://localhost:3000
OUT=/home/z/my-project/scripts
PASS=0; FAIL=0
ok()   { echo "  ✓ $1"; PASS=$((PASS+1)); }
bad()  { echo "  ✗ $1"; FAIL=$((FAIL+1)); }
chk()  { if [ "$2" = "$3" ]; then ok "$1 ($2)"; else bad "$1 (got=$2 want=$3)"; fi; }
chkge() { if [ "${2%.*}" -ge "$3" ] 2>/dev/null; then ok "$1 ($2 >= $3)"; else bad "$1 (got=$2 want>=$3)"; fi; }
# agent-browser 0.39.0 已知问题：errors 文本输出丢消息只剩空✗、errors --clear 失效不重置缓冲。
# 因此改用 --json 解析，并在开局重启浏览器拿干净错误缓冲。
errcount() { agent-browser errors --json 2>/dev/null | python3 -c "import json,sys
try: print(len(json.load(sys.stdin).get('data',{}).get('errors',[])))
except Exception: print(0)"; }
errtexts() { agent-browser errors --json 2>/dev/null | python3 -c "import json,sys
try:
 for e in json.load(sys.stdin).get('data',{}).get('errors',[]):
  print('  ✗ '+e.get('text','').split(chr(10))[0][:150])
except Exception: pass"; }

echo "=== [1] 桌面端 1440×900 新档开局 ==="
agent-browser close >/dev/null 2>&1; sleep 1   # 重启浏览器：清空陈旧错误缓冲（--clear 不可靠）
agent-browser set viewport 1440 900
agent-browser open $B
agent-browser storage local clear >/dev/null 2>&1
agent-browser reload
agent-browser wait --fn "window.__pxc!==undefined" --timeout 90000 && ok "引擎就绪" || bad "引擎超时"
agent-browser wait 3000

S1=$(agent-browser eval "(()=>{const e=window.__pxc;const pool=e.actors.citizenLooks.length;const mail=e.tycoon.citz.letters.length;return 'pool:'+pool+'|mail:'+mail+'|roster:'+e.tycoon.citz.roster.length;})()" 2>/dev/null | tail -1 | tr -d '"')
chk "S1 新档：偏置池空" "$(echo "$S1" | grep -o 'pool:[0-9]*' | cut -d: -f2)" "0"
chk "S1 新档：信箱空" "$(echo "$S1" | grep -o 'mail:[0-9]*' | cut -d: -f2)" "0"

echo "=== [2] 布城：路网 + 住宅 + 商铺 ==="
agent-browser eval "(()=>{const e=window.__pxc;for(let x=118;x<=134;x++){e.map.setRoad(x,126,true);e.map.setRoad(x,127,true);e.map.setRoad(x,128,true);}const a=e.map.place('apartment',0,121,125);const b=e.map.place('apartment',1,121,129);const c=e.map.place('house',0,131,125);const s=e.map.place('shop',0,131,127);return 'roads:'+e.map.roadList().length+' apt:'+a+b+' house:'+c+' shop:'+s;})()" 2>/dev/null | tail -1
agent-browser wait 1000

echo "=== [3] 人口脉冲 → 市民落户 + 偏置池同步 ==="
agent-browser eval "(()=>{const t=window.__pxc.tycoon;let iv=null;iv=setInterval(()=>{t.pop=Math.min(64,t.pop+4)},250);setTimeout(()=>clearInterval(iv),2600);return 'pulsing';})()" 2>/dev/null | tail -1
agent-browser wait 5000
# 冻结随机生活事件：防止 F1 前偶发「成婚」把家族标记弄脏（F2/F3 走 forceEvent 不受影响）
agent-browser eval "window.__pxc.tycoon.citz.evTimer=99999; 'frozen'" >/dev/null 2>&1
CN=$(agent-browser eval "window.__pxc.tycoon.citz.roster.length" 2>/dev/null | tail -1 | tr -d '"')
chkge "S2 在册市民 ≥ 5" "${CN:-0}" 5
agent-browser wait 6000
POOL=$(agent-browser eval "window.__pxc.actors.citizenLooks.length" 2>/dev/null | tail -1 | tr -d '"')
chkge "S2 外观偏置池已同步（5s 刷新）" "${POOL:-0}" 5

echo "=== [4] S3/S4 外观认人：精确匹配 / 路人卡 ==="
S3=$(agent-browser eval "(()=>{const t=window.__pxc.tycoon;const c=t.citz.roster[0];const card=t.citz.spotCard(c.look,c.body,c.role);return card&&!card.guest&&t.citz.roster.some(x=>x.name===card.name)?'hit:'+card.name:'miss';})()" 2>/dev/null | tail -1 | tr -d '"')
case "$S3" in
  hit:*) ok "S3 在册三元组 → 认出本人（${S3#hit:}）";;
  *) bad "S3 精确匹配失败 ($S3)";;
esac
S4=$(agent-browser eval "(()=>{const t=window.__pxc.tycoon;const hit=t.citz.roster.some(c=>c.look===13&&c.body===2&&c.role===9);if(hit)return 'ambiguous';const card=t.citz.spotCard(13,2,9);return (card&&card.guest===true&&card.id===0&&/^[\u4e00-\u9fa5]{2,4}$/.test(card.name)&&card.bio.length>=6)?'guest':'broken:'+JSON.stringify(card).slice(0,60);})()" 2>/dev/null | tail -1 | tr -d '"')
chk "S4 未命中三元组 → 路人卡（guest）" "${S4:-x}" "guest"

echo "=== [5] S5 行人本尊（偏置出生）==="
WALK=$(agent-browser eval "(()=>{const e=window.__pxc;const pool=e.actors.citizenLooks;const peds=e.actors.actors.filter(a=>a.kind===0&&!a.tour);const hit=peds.filter(a=>pool.some(t=>t.look===a.look&&t.body===a.body&&t.role===a.role));return 'peds:'+peds.length+'|hit:'+hit.length;})()" 2>/dev/null | tail -1 | tr -d '"')
echo "  街上行人：$WALK"
HITN=$(echo "$WALK" | grep -o 'hit:[0-9]*' | cut -d: -f2)
if [ "${HITN:-0}" -ge 1 ] 2>/dev/null; then ok "S5 街上有市民本尊（${HITN} 位）"; else bad "S5 暂无本尊行人，再等一轮"; agent-browser wait 12000; WALK2=$(agent-browser eval "(()=>{const e=window.__pxc;const pool=e.actors.citizenLooks;const hit=e.actors.actors.filter(a=>a.kind===0&&!a.tour&&pool.some(t=>t.look===a.look&&t.body===a.body&&t.role===a.role));return hit.length;})()" 2>/dev/null | tail -1 | tr -d '"'); if [ "${WALK2:-0}" -ge 1 ] 2>/dev/null; then ok "S5 街上有市民本尊（重试 ${WALK2} 位）"; else bad "S5 本尊行人未出现"; fi; fi

echo "=== [6] S6 合成点击行人 → 街头偶遇 ==="
CLICK=$(agent-browser eval "(()=>{const e=window.__pxc;const i=e.actors.actors.findIndex(a=>a.kind===0&&!a.tour);if(i<0)return 'noped';const p=e.actorCssAt(i);const cv=[...document.querySelectorAll('canvas')].sort((a,b)=>b.width-a.width)[0];const r=cv.getBoundingClientRect();cv.dispatchEvent(new PointerEvent('pointerdown',{clientX:r.left+p.x,clientY:r.top+p.y,button:0,pointerId:1,bubbles:true}));cv.dispatchEvent(new PointerEvent('pointerup',{clientX:r.left+p.x,clientY:r.top+p.y,button:0,pointerId:1,bubbles:true}));return 'clicked';})()" 2>/dev/null | tail -1 | tr -d '"')
chk "S6 合成 PointerEvent 派发" "${CLICK:-x}" "clicked"
agent-browser wait 800
MODAL=$(agent-browser eval "document.querySelector('.pxc-citz')?'open':'closed'" 2>/dev/null | tail -1 | tr -d '"')
chk "S6 市民列传模态打开" "${MODAL:-x}" "open"
SPOTM=$(agent-browser eval "(()=>{const s=document.querySelector('.cd-spot');return s?((s.textContent.includes('本人')||s.textContent.includes('过路人'))?'yes':'odd:'+s.textContent):'no';})()" 2>/dev/null | tail -1 | tr -d '"')
chk "S6 偶遇标记文案（本人/过路人）" "${SPOTM:-x}" "yes"
GUESTM=$(agent-browser eval "(()=>{const e=window.__pxc;const g=e.tycoon.citz.spotCard(13,2,9);e.hooks.onPedestrianClick&&e.hooks.onPedestrianClick(g);return 'sent';})()" 2>/dev/null | tail -1 | tr -d '"')
agent-browser wait 600
GBADGE=$(agent-browser eval "document.querySelector('.cd-guest')?'yes':'no'" 2>/dev/null | tail -1 | tr -d '"')
chk "S6 路人卡显示「路人」徽标" "${GBADGE:-x}" "yes"
agent-browser screenshot $OUT/v15_spot_guest.png >/dev/null && ok "截图 v15_spot_guest.png（路人偶遇）"

echo "=== [7] F 段：家族谱系 ==="
F1=$(agent-browser eval "window.__pxc.tycoon.citz.roster.every(c=>c.fam===0&&c.spouse===0&&c.pa===0&&c.ma===0)?'clean':'dirty'" 2>/dev/null | tail -1 | tr -d '"')
chk "F1 初始市民无家族标记" "${F1:-x}" "clean"
WED=$(agent-browser eval "(()=>{const r=window.__pxc.tycoon.citz;for(let k=0;k<3;k++){const res=r.forceEvent('wed');if(res.ok){const a=r.roster.find(c=>c.spouse>0);if(!a)return 'W-none';const b=r.roster.find(x=>x.id===a.spouse);if(!b)return 'W-dangling';return (b.spouse===a.id&&a.fam>0&&a.fam===b.fam)?'W-ok|'+a.id+'#'+b.id:'W-broken';}}return 'W-fail';})()" 2>/dev/null | tail -1 | tr -d '"')
case "$WED" in
  W-ok\|*) ok "F2 forceEvent('wed') 成婚（配偶互指·家族同号 #${WED#W-ok|}）";;
  *) bad "F2 成婚异常 ($WED)";;
esac
BORN=$(agent-browser eval "(()=>{const r=window.__pxc.tycoon.citz;const wed=r.roster.filter(c=>c.spouse>0);if(!wed.length)return 'B-nowed';const w0=wed[0];const a=w0.gender===0?w0:r.roster.find(x=>x.id===w0.spouse);const mate=r.roster.find(x=>x.id===a.spouse);const before=r.roster.length;const totalBefore=r.total;const res=r.forceEvent('born',a.id);if(!res.ok)return 'B-fail:'+res.msg;const baby=r.roster[r.roster.length-1];const pa=r.roster.find(x=>x.id===baby.pa);const ma=r.roster.find(x=>x.id===baby.ma);const okAll=baby.body===1&&baby.age===0&&baby.pa===a.id&&baby.ma===mate.id&&pa&&ma&&baby.name[0]===pa.name[0]&&baby.fam===a.fam&&baby.log.some(l=>l.text.includes('坠地'))&&r.roster.length===before+1&&r.total===totalBefore+1&&a.log.some(l=>l.text.includes('新丁'))&&mate.log.some(l=>l.text.includes('降生'));return okAll?'B-ok|'+baby.id:'B-broken:'+JSON.stringify({body:baby.body,age:baby.age,pa:baby.pa,ma:baby.ma,fam:baby.fam,n:r.roster.length,total:r.total});})()" 2>/dev/null | tail -1 | tr -d '"')
case "$BORN" in
  B-ok\|*) ok "F3 新生儿入册（随父姓·记父母·日志 #${BORN#B-ok|}）";;
  *) bad "F3 添丁异常 ($BORN)";;
esac
FAMC=$(agent-browser eval "(()=>{const t=window.__pxc.tycoon;const parent=t.citz.roster.find(c=>c.spouse>0);const card=t.citz.view().roster.find(x=>x.id===parent.id);if(!card||!card.fam||!card.fam.length)return 'nofam';const rels=card.fam.map(f=>f.rel);return (rels.includes('配偶')&&rels.includes('子女')&&card.fam.every(f=>f.name&&f.mood>=0&&f.mood<=100))?'ok':'broken:'+rels.join(',');})()" 2>/dev/null | tail -1 | tr -d '"')
chk "F4 家人卡片（配偶+子女）" "${FAMC:-x}" "ok"

echo "=== [8] F5 家人区块 UI ==="
agent-browser eval "(()=>{const b=[...document.querySelectorAll('.pxc-citz button')].find(x=>(x.textContent||'').includes('返回名人册'));if(b)b.click();return 'back';})()" 2>/dev/null | tail -1
agent-browser wait 400
FAMUI=$(agent-browser eval "(()=>{const t=window.__pxc.tycoon;const p=t.citz.roster.find(c=>c.spouse>0&&t.citz.roster.some(x=>x.pa===c.id||x.ma===c.id));if(!p)return 'nofam';const card=document.querySelector('.citz-grid');const btn=[...document.querySelectorAll('.citz-card')].find(b=>(b.title||'').includes(p.name));if(!btn)return 'nobtn:'+p.name;btn.click();return 'sel:'+p.name;})()" 2>/dev/null | tail -1 | tr -d '"')
agent-browser wait 500
FAMD=$(agent-browser eval "(()=>{const w=document.querySelector('.cd-famwrap');if(!w)return 'nowrap';const cards=document.querySelectorAll('.fam-card');return (w.textContent.includes('一家人')&&cards.length>=2)?'ok:'+cards.length:'thin:'+cards.length;})()" 2>/dev/null | tail -1 | tr -d '"')
case "$FAMD" in
  ok:*) ok "F5 「一家人」区块渲染（${FAMD#ok:} 张家人卡）";;
  *) bad "F5 家人区块异常 ($FAMD / $FAMUI)";;
esac
JUMP=$(agent-browser eval "(()=>{const b=document.querySelector('.fam-card');if(!b)return 'nocard';b.click();return 'jump';})()" 2>/dev/null | tail -1 | tr -d '"')
agent-browser wait 500
JUMPOK=$(agent-browser eval "document.querySelector('.citz-detail')&&document.querySelector('.cd-bio')?'yes':'no'" 2>/dev/null | tail -1 | tr -d '"')
chk "F5 点家人卡跳转详情" "${JUMPOK:-x}" "yes"
agent-browser screenshot $OUT/v15_family.png >/dev/null && ok "截图 v15_family.png（一家人）"

echo "=== [9] M 段：市长信箱 ==="
FL=$(agent-browser eval "(()=>{const t=window.__pxc.tycoon;const L=t.citz.forceLetter();if(!L)return 'null';return (L.subject.length>=4&&L.text.length>=20&&L.opts.length>=2&&L.read===false&&L.replied===-1&&L.fromName.length>=2)?'ok|'+L.id+'|'+L.subject:'broken';})()" 2>/dev/null | tail -1 | tr -d '"')
chk "M1 forceLetter 字段完整" "$(echo "$FL" | cut -d'|' -f1)" "ok"
MV=$(agent-browser eval "(()=>{const t=window.__pxc.tycoon;const mv=t.mailView();const br=t.view().mail;return (mv.letters.length===t.citz.letters.length&&mv.unread>=1&&br.unread===mv.unread&&br.n===mv.letters.length)?'ok':'broken';})()" 2>/dev/null | tail -1 | tr -d '"')
chk "M2 mailView/mailBrief 一致" "${MV:-x}" "ok"
TAXL=$(agent-browser eval "(()=>{const t=window.__pxc.tycoon;t.taxRate=15;return 'set';})()" 2>/dev/null | tail -1)
agent-browser wait 1200
TAXSUB=$(agent-browser eval "(()=>{const t=window.__pxc.tycoon;const L=t.citz.forceLetter();t.taxRate=9;return L&&L.subject.includes('税')?'yes':'no:'+L.subject;})()" 2>/dev/null | tail -1 | tr -d '"')
chk "M3 高税状态 → 税单吐槽信" "${TAXSUB:-x}" "yes"
UN=$(agent-browser eval "(()=>{const t=window.__pxc.tycoon;t.citz.mailTimer=999999;return t.citz.unread;})()" 2>/dev/null | tail -1 | tr -d '"')
chkge "M3 未读 ≥2 封" "${UN:-0}" 2
MRK=$(agent-browser eval "(()=>{const t=window.__pxc.tycoon;const first=t.citz.letters[0];t.markLetterRead(first.id);return t.citz.unread;})()" 2>/dev/null | tail -1 | tr -d '"')
chk "M4 markRead 一封 → 未读减一（冻结送信计时防竞态）" "${MRK:-x}" "$((UN-1))"

echo "=== [10] M5/M6 回信 ==="
RPLY=$(agent-browser eval "(()=>{const t=window.__pxc.tycoon;const L=t.citz.letters.find(x=>x.replied<0);const from=t.citz.roster.find(c=>c.id===L.from);const m0=Math.round(from.mood);const r=t.replyLetter(L.id,0);const m1=Math.round(from.mood);return (r.ok&&r.reply&&L.replied===0&&t.citz.replyCount===1&&m1!==m0&&from.log.some(l=>l.text.includes('市长的回信')))?'ok|m'+m0+'→'+m1:'broken:'+JSON.stringify(r);})()" 2>/dev/null | tail -1 | tr -d '"')
chk "M5 回信生效（心情变化+大事记）" "$(echo "$RPLY" | cut -d'|' -f1)" "ok"
REREP=$(agent-browser eval "(()=>{const t=window.__pxc.tycoon;const L=t.citz.letters.find(x=>x.replied>=0);const r=t.replyLetter(L.id,1);return r.ok===false?'rejected':'allowed';})()" 2>/dev/null | tail -1 | tr -d '"')
chk "M6 重复回信被拒" "${REREP:-x}" "rejected"

echo "=== [11] M7/M8 信箱 UI ==="
agent-browser wait 1000
CHIPM=$(agent-browser eval "[...document.querySelectorAll('button.chip')].some(b=>(b.title||'').includes('市长信箱'))?'yes':'no'" 2>/dev/null | tail -1 | tr -d '"')
chk "M7 HUD 邮芯片存在" "${CHIPM:-x}" "yes"
DOT=$(agent-browser eval "document.querySelector('.chip.mail .chip-dot')?'yes':'no'" 2>/dev/null | tail -1 | tr -d '"')
chk "M7 未读红点显示" "${DOT:-x}" "yes"
agent-browser eval "(()=>{const b=[...document.querySelectorAll('button.chip')].find(x=>(x.title||'').includes('市长信箱'));if(!b)return 'nobtn';b.click();return 'open';})()" 2>/dev/null | tail -1
agent-browser wait 600
MOPEN=$(agent-browser eval "document.querySelector('.pxc-mail')?'open':'closed'" 2>/dev/null | tail -1 | tr -d '"')
chk "M8 信箱模态打开" "${MOPEN:-x}" "open"
ITEMS=$(agent-browser eval "document.querySelectorAll('.mail-item').length" 2>/dev/null | tail -1 | tr -d '"')
chkge "M8 信件列表 ≥2" "${ITEMS:-0}" 2
agent-browser eval "(()=>{const it=document.querySelector('.mail-item');if(it)it.click();return 'sel';})()" 2>/dev/null | tail -1
agent-browser wait 600
MREAD=$(agent-browser eval "(()=>{const t=document.querySelector('.mr-text');const opts=document.querySelectorAll('.mr-opts .pxc-btn');return (t&&t.textContent.length>=20&&opts.length>=2)?'ok':'broken';})()" 2>/dev/null | tail -1 | tr -d '"')
chk "M8 信详情 + 回信选项" "${MREAD:-x}" "ok"
agent-browser eval "(()=>{const b=document.querySelector('.mr-opts .pxc-btn');if(b)b.click();return 'replied';})()" 2>/dev/null | tail -1
agent-browser wait 600
RDONE=$(agent-browser eval "(()=>{const rp=document.querySelector('.mr-replied');const mark=document.querySelector('.mail-read .cd-spot');return (rp&&rp.textContent.includes('已回信'))?'ok':'no';})()" 2>/dev/null | tail -1 | tr -d '"')
chk "M8 回信后显示已回信态" "${RDONE:-x}" "ok"
agent-browser screenshot $OUT/v15_mail.png >/dev/null && ok "截图 v15_mail.png（信箱）"

echo "=== [12] M9 成就「见字如面」==="
ACH=$(agent-browser eval "(()=>{const t=window.__pxc.tycoon;let n=0;for(const L of t.citz.letters){if(L.replied<0){t.replyLetter(L.id,0);n++;}}for(let i=t.citz.replyCount;i<8;i++){const L=t.citz.forceLetter();if(L)t.replyLetter(L.id,0);}return 'replied:'+t.citz.replyCount;})()" 2>/dev/null | tail -1 | tr -d '"')
echo "  累计回信：$ACH"
agent-browser wait 3000
A9=$(agent-browser eval "window.__pxc.tycoon.achv.has('penpal8')?'yes':'no'" 2>/dev/null | tail -1 | tr -d '"')
chk "M9 成就「见字如面」解锁" "${A9:-x}" "yes"

echo "=== [13] P1 存档 v11 往返（reload）==="
SNAP=$(agent-browser eval "(()=>{const t=window.__pxc.tycoon;const r=t.citz;const pair=r.roster.find(c=>c.spouse>0);const baby=r.roster.find(c=>c.pa>0);t.save(window.__pxc.map);return 'letters:'+r.letters.length+'|replied:'+r.letters.filter(l=>l.replied>=0).length+'|pair:'+(pair?pair.id+'#'+pair.spouse:'none')+'|baby:'+(baby?baby.name:'none')+'|total:'+r.total;})()" 2>/dev/null | tail -1 | tr -d '"')
echo "  存档：$SNAP"
agent-browser reload
agent-browser wait --fn "window.__pxc!==undefined" --timeout 60000
agent-browser wait 3000
SNAP2=$(agent-browser eval "(()=>{const t=window.__pxc.tycoon;const r=t.citz;const pair=r.roster.find(c=>c.spouse>0);const baby=r.roster.find(c=>c.pa>0);return 'letters:'+r.letters.length+'|replied:'+r.letters.filter(l=>l.replied>=0).length+'|pair:'+(pair?pair.id+'#'+pair.spouse:'none')+'|baby:'+(baby?baby.name:'none')+'|total:'+r.total;})()" 2>/dev/null | tail -1 | tr -d '"')
if [ "$SNAP" = "$SNAP2" ]; then ok "P1 reload 后信箱/家族/新生儿完整保留"; else bad "P1 往返不一致 ($SNAP → $SNAP2)"; fi
RCK=$(agent-browser eval "window.__pxc.tycoon.citz.replyCount" 2>/dev/null | tail -1 | tr -d '"')
chkge "P1 回信计数保留" "${RCK:-0}" 8

echo "=== [14] P2 v10 老档兼容（无 fam/letters 字段）==="
OLD=$(agent-browser eval "(()=>{const t=window.__pxc.tycoon;t.citz.restore({total:2,nextId:3,roster:[{id:1,name:'张三',gender:0,age:30,look:2,body:0,role:0,job:'市民',trait:'乐观开朗',tm:8,hobby:'钓鱼',origin:'邻县小镇',hk:-1,hn:'出租屋',hax:-1,hay:-1,wk:-1,wn:'',wax:-1,way:-1,mood:60,since:10,bio:'旧档市民',log:[[10,'落户']]},{id:2,name:'李四',gender:1,age:28,look:5,body:0,role:0,job:'摊主',trait:'热心肠',tm:4,hobby:'下厨',origin:'南方渔村',hk:-1,hn:'出租屋',hax:-1,hay:-1,wk:-1,wn:'',wax:-1,way:-1,mood:55,since:10,bio:'旧档市民',log:[[10,'落户']]}]});const r=t.citz;return (r.roster.length===2&&r.roster.every(c=>c.fam===0&&c.spouse===0&&c.pa===0&&c.ma===0)&&r.letters.length===0&&r.replyCount===0&&r.roster[0].name==='张三')?'ok':'broken';})()" 2>/dev/null | tail -1 | tr -d '"')
chk "P2 旧档恢复不崩（家族/信箱字段缺省）" "${OLD:-x}" "ok"

echo "=== [15] P3 控制台错误 + 城市截图 ==="
ERRN=$(errcount)
if [ "$ERRN" = "0" ]; then ok "无页面错误"; else echo "  ⚠ 页面错误($ERRN):"; errtexts; FAIL=$((FAIL+1)); fi
agent-browser eval "(()=>{const e=window.__pxc;e.centerAt(124,126);return 'cam';})()" >/dev/null
agent-browser wait 1200
agent-browser screenshot $OUT/v15_city.png >/dev/null && ok "截图 v15_city.png"

echo "=== [16] 移动端 390×844（信箱 + 市民面板）==="
MERR_BASE=$(errcount)   # 快照基线：移动段只对本段新增错误计账
agent-browser set viewport 390 844
agent-browser reload
agent-browser wait --fn "window.__pxc!==undefined" --timeout 60000
agent-browser wait 3000
MOBM=$(agent-browser eval "(()=>{const b=[...document.querySelectorAll('button.chip')].find(x=>(x.title||'').includes('市长信箱'));if(!b)return 'nobtn';b.click();return 'open';})()" 2>/dev/null | tail -1 | tr -d '"')
agent-browser wait 600
MOBMAIL=$(agent-browser eval "document.querySelector('.pxc-mail')?'open':'closed'" 2>/dev/null | tail -1 | tr -d '"')
chk "移动端信箱面板打开" "${MOBMAIL:-x}" "open"
agent-browser screenshot $OUT/v15_mobile_mail.png >/dev/null && ok "截图 v15_mobile_mail.png"
agent-browser eval "(()=>{const x=document.querySelector('.pxc-x');if(x)x.click();return 'x';})()" >/dev/null
agent-browser wait 400
agent-browser eval "(()=>{const b=[...document.querySelectorAll('button.chip')].find(x=>(x.title||'').includes('市民列传'));if(!b)return 'nobtn';b.click();return 'open';})()" 2>/dev/null | tail -1
agent-browser wait 600
MOBCZ=$(agent-browser eval "document.querySelector('.pxc-citz')?'open':'closed'" 2>/dev/null | tail -1 | tr -d '"')
chk "移动端市民面板打开" "${MOBCZ:-x}" "open"
agent-browser screenshot $OUT/v15_mobile_citz.png >/dev/null && ok "截图 v15_mobile_citz.png"
MERRN=$(errcount)
if [ "$MERRN" -le "${MERR_BASE:-0}" ]; then ok "移动端无页面错误"; else echo "  ⚠ 移动端错误($MERRN):"; errtexts; FAIL=$((FAIL+1)); fi

echo ""
echo "========== 结果: PASS=$PASS FAIL=$FAIL =========="
[ $FAIL -eq 0 ]
