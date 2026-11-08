// ============================================================
// newspaper.ts — v39 城市之声：报馆与城市日报
//   报馆落成即创刊 —— 每七游戏日出版一期《城市日报》：
//   头版头条自动选编年史大事，市况栏报景气、气象栏报季节天气，
//   来信选登摘市长信箱，广告栏随商户开门念词，连载专栏讲城南旧事。
//   发行量随人口与识字率浮动，大事出号外 —— 卖报所得进府库。
//   本模块不依赖 tycoon（上下文与随机源由外部传入，避免循环引用）。
// ============================================================

// ------------------------------------------------------------
// 调度与结算常数
// ------------------------------------------------------------

export const PRESS_DAY_GAP = 7 * 24;    // 出刊周期（游戏时；七日一期）
export const PRESS_FIRST_GAP = 24;      // 报馆落成 → 首期出版（次日开印）
export const PRESS_EARN = 0.06;         // 每份发行收入（G/份）
export const PRESS_COST = 4;            // 每期排印成本（G）
export const PRESS_CIRC_BASE = 30;      // 发行量基数（城市名气的底册订阅）
export const PRESS_CIRC_POP_K = 0.6;    // 每人口对应的潜在订户
export const PRESS_LIT_BASE = 0.6;      // 识字率因子基线（hrIdx 50 ≈ ×0.9）
export const PRESS_BIG_K = 1.15;        // 上期头条为大事件时的订阅热（连续性）
export const PRESS_EXTRA_K = 1.3;       // 号外发行乘数（大事当天加印）
export const PRESS_KEEP = 3;            // 过刊保留期数（新在前）
export const PRESS_CIRC_GOAL = 300;     // 成就「洛阳纸贵」单期发行量门槛

/** 景气相位名（与 tycoon 经济周期 0..3 对齐） */
export const CYC_PHASE_NAMES = ['衰退', '平稳', '复苏', '繁荣'] as const;

/** 天气名（与 tycoon WeatherKind 对齐） */
const WEATHER_NAMES: Record<string, string> = {
  clear: '晴', cloudy: '多云', rain: '雨', snow: '雪',
};

// ------------------------------------------------------------
// 版面数据
// ------------------------------------------------------------

/** 一期《城市日报》的完整版面（随档保留最近 PRESS_KEEP 期） */
export type PaperIssue = {
  n: number;                                        // 期号（1 起）
  day: number;                                      // 出版日（开埠第 N 天）
  extra: boolean;                                   // 号外（头条为大事记时加印）
  head: { title: string; text: string; icon: string };   // 头版头条
  market: string;                                   // 市况栏
  weather: string;                                  // 气象栏
  letter: { nm: string; sj: string; tx: string } | null; // 来信选登（信箱空册时 null）
  ads: string[];                                    // 广告栏（两条）
  serial: string;                                   // 连载专栏
  circ: number;                                     // 本期发行量（份）
  earn: number;                                     // 本期发行净收入（G；排印成本已扣）
};

/** 版面生成上下文（tycoon 出版时组装；随机源外部注入） */
export type PressCtx = {
  pop: number; hrIdx: number; rating: number;
  cycPhase: number; cycComK: number; cycTourK: number;
  seasonName: string; seasonNote: string;
  weather: string;                                  // WeatherKind
  comN: number;                                     // 商业建筑数（广告池广度）
  tourists: number;                                 // 在册游客（市况栏）
  shops: Record<string, number>;                    // 特色商户计数（izakaya/bakery/market/cinema/electown/hotel/ferris/conv）
  chron: Array<{ id: number; cat: string; tone: string; icon: string; title: string; text: string }>;
  sinceId: number;                                  // 截稿线：只看 id > sinceId 的纪事
  letters: Array<{ nm: string; sj: string; tx: string }>;
  rnd: () => number;
};

// ------------------------------------------------------------
// 文案池
// ------------------------------------------------------------

/** 头版无大事时的日常头条（轮换；一座城的安宁本身就是新闻） */
const HEAD_IDLE = [
  { icon: 'city', title: '城中无大事', text: '本周全城风平浪静 —— 街口的早点摊照常出摊，邮差照常绕城，主笔翻了三遍纪事稿，决定把头版留给一句「一切如常」。' },
  { icon: 'people', title: '街坊闲话', text: '茶馆里的闲话整理如下：东街的桂花开了，西巷的猫又下了崽，南门的修鞋匠给孙子做了双小木鞋。本期不再刊登其他新闻。' },
  { icon: 'sun', title: '好天气周报', text: '本周天色一直不错，晾衣竿沿街排开像过节。气象员说这样的日子适合出门走走 —— 本报对此深表赞同。' },
  { icon: 'fest', title: '市集即景', text: '周末的集市比平日热闹三分，卖糖画的摊前排起了小队。主笔挤进去看了看，回来时手里多了两串糖葫芦（计入采访成本）。' },
  { icon: 'book', title: '主笔按语', text: '没有大事的日子，报纸薄得能透光。主笔在头版写：城市安睡，是市政厅最好的政绩 —— 本期全文只有这一句。' },
];

/** 连载专栏「城南旧事」八回（循环刊登） */
export const SERIAL_TITLE = '城南旧事';
const SERIAL_POOL = [
  '老周家的面馆开了三十年，汤头的方子传到第三代少了一味 —— 他爹临终才说：那一味是「等客人坐下了再下面」。',
  '巷口的老槐树据说是开埠那年栽的，树下拴过马、放过电影、避过雨；如今孩子们在树洞里塞纸条，谁也没告诉。',
  '老邮差阿贵跑了半辈子信，认得全城的门 —— 他说最重的一封是家书，最轻的一封也是家书。',
  '城南戏班的班主年轻时唱过满堂彩，如今嗓子哑了，就教孩子们吊嗓；他说戏台还在，戏就散不了。',
  '修表铺的钟师傅有个怪规矩：修好的表都要在柜台上走满一天才交还 —— 他说「表要认了主人的时辰才算修好」。',
  '夏夜里全城停电那回，街坊们搬着竹椅坐了满街，讲了一夜的故事；来电了谁也没起身。',
  '王婆婆的酱菜坛子埋在院里三处，只有她知道哪坛最老；每年冬至开一坛，半条街的分。',
  '城南小学的老校钟换了电铃，老钟被抬进库房那天，全校的孩子跟到门口 —— 铃声没了，钟还在。',
];

/** 广告文案池（键 = 特色商户建筑 id；出刊时按城中商户门类挑两条） */
const AD_POOL: Record<string, string> = {
  izakaya: '居酒屋 · 今夜有酒，掌灯即开 —— 深夜食堂等您晚归',
  bakery: '烘焙坊 · 五更出炉，麦香过街 —— 买二送一，售完即止',
  market: '屋台小吃街 · 新摊开业，烟火依旧 —— 一条街吃遍半座城',
  cinema: '电影院 · 本周新片《城门开》连映七日 —— 黄昏场半价',
  electown: '电器街 · 新到收音机一批，全城独售 —— 听报听戏不用等',
  hotel: '酒店 · 宾至如归，床单雪白 —— 远来的客人都住这儿',
  ferris: '摩天轮 · 黄昏场半价 —— 转到最高处，全城灯火都是您的',
  conv: '便利店 · 通宵营业，热食上新 —— 夜班人的歇脚处',
  museum: '博物馆 · 本周特展「厚土藏珍」—— 看一眼千年，门票不贵',
};
const AD_FALLBACK = [
  '招工启事 · 码头扛包日结，管一顿午饭 —— 需上工者自备手套',
  '遗失启事 · 三花猫「元宝」走失三日，见者酬谢五百文',
  '启事 · 城南裁缝铺新到花布两匹 —— 手艺照旧，价钱公道',
  '寻物 · 一把蓝柄旧伞落在了戏院长凳上 —— 伞的主人很想念它',
];

// ------------------------------------------------------------
// 纯函数
// ------------------------------------------------------------

/** 发行量公式：基数 + 人口订户，识字率放大，号外与大事件头条加成（四舍五入） */
export function circOf(pop: number, hrIdx: number, extra: boolean, bigHead: boolean): number {
  const c = (PRESS_CIRC_BASE + pop * PRESS_CIRC_POP_K)
    * (PRESS_LIT_BASE + hrIdx / 166)
    * (extra ? PRESS_EXTRA_K : 1)
    * (bigHead ? PRESS_BIG_K : 1);
  return Math.round(c);
}

/** 头条挑选：截稿线之后的纪事按新→旧、大事记 → 灾祸 → 喜讯 → 政务 优先；无则走日常稿池 */
function pickHead(ctx: PressCtx): { title: string; text: string; icon: string; tone: string } {
  const fresh = ctx.chron.filter(x => x.id > ctx.sinceId && x.cat !== 'rev');
  const rank = (tone: string): number => (tone === 'big' ? 0 : tone === 'bad' ? 1 : tone === 'good' ? 2 : 3);
  let head: { title: string; text: string; icon: string; tone: string } | null = null;
  for (let i = fresh.length - 1; i >= 0; i--) {   // 新→旧扫描：同档取最新一笔
    const x = fresh[i];
    if (!head || rank(x.tone) < rank(head.tone)) {
      head = { title: x.title, text: x.text, icon: x.icon, tone: x.tone };
    }
  }
  if (head) return head;
  const idle = HEAD_IDLE[Math.floor(ctx.rnd() * HEAD_IDLE.length) % HEAD_IDLE.length];
  return { title: idle.title, text: idle.text, icon: idle.icon, tone: 'info' };
}

/** 广告挑两条：先按城中特色商户出词，不足由市井启事补足（不重复） */
function pickAds(ctx: PressCtx): string[] {
  const cand: string[] = [];
  for (const k of Object.keys(AD_POOL)) {
    if ((ctx.shops[k] ?? 0) > 0) cand.push(AD_POOL[k]);
  }
  // 商户不足时掺市井启事（保证候选 ≥4，凑出两条不重复的）
  for (const f of AD_FALLBACK) cand.push(f);
  const out: string[] = [];
  const used = new Set<number>();
  let guard = 0;
  while (out.length < 2 && guard++ < 40) {
    const i = Math.floor(ctx.rnd() * cand.length) % cand.length;
    if (!used.has(i)) { used.add(i); out.push(cand[i]); }
  }
  while (out.length < 2) out.push(cand[out.length % cand.length]);
  return out;
}

/** 排一期《城市日报》（纯函数：所有输入来自 ctx，随机源可注入便于测试） */
export function genPaperIssue(n: number, gHours: number, ctx: PressCtx): PaperIssue {
  const head = pickHead(ctx);
  const extra = head.tone === 'big';
  const circ = circOf(ctx.pop, ctx.hrIdx, extra, true);
  const earn = Math.round(circ * PRESS_EARN - PRESS_COST);
  const day = Math.floor(gHours / 24) + 1;
  const wn = WEATHER_NAMES[ctx.weather] ?? '晴';
  const weather = `今日${wn}。${ctx.seasonName}季 —— ${ctx.seasonNote}`;
  const phase = CYC_PHASE_NAMES[Math.max(0, Math.min(3, ctx.cycPhase))];
  const market = `市况${phase}：商业 ×${ctx.cycComK.toFixed(2)} · 游客 ×${ctx.cycTourK.toFixed(2)}。`
    + `人口 ${ctx.pop} · 评级 ${ctx.rating} · 在册游客 ${Math.max(0, Math.round(ctx.tourists))} 人`;
  const L = ctx.letters.length ? ctx.letters[0] : null;
  const letter = L
    ? { nm: L.nm, sj: L.sj, tx: L.tx.length > 46 ? `${L.tx.slice(0, 46)}……` : L.tx }
    : null;
  const seg = SERIAL_POOL[(n - 1) % SERIAL_POOL.length];
  const serial = `第 ${((n - 1) % SERIAL_POOL.length) + 1} 回 · ${seg}`;
  return {
    n, day, extra, head: { title: head.title, text: head.text, icon: head.icon },
    market, weather, letter, ads: pickAds(ctx), serial, circ, earn,
  };
}
