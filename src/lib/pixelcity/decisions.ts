// ============================================================
// decisions.ts — v29 市长公署：朱批公文（决策事件池）
//   每日清晨八点公文送抵案头（请愿 / 联名 / 风闻 / 献策…），
//   每份两三道朱批各有代价与回响 —— 府库、人口、粮仓、民心随之而动，
//   批注由 tycoon 落笔编年史「政令」卷。
//   本模块不依赖 tycoon（条件上下文由外部传入，避免循环引用）。
// ============================================================

/** 公文条件判定上下文（tycoon.docCtx 从快照与本档状态组装） */
export type DocCtx = {
  pop: number; cap: number; coins: number;
  era: number;            // 当前纪元（0..4）
  season: number;         // 0春 / 1夏 / 2秋 / 3冬
  buildings: number;      // 建筑总数
  shops: number;          // 商业建筑数
  parks: number;          // 公园数
  goods: number;          // 货仓库存
  food: number;           // 粮仓库存
  powerDem: number;       // 电力需求 MW
  safetyIdx: number;      // 安全指数
  healthIdx: number;      // 健康指数
  festCount: number;      // 累计节庆场次
  floods: number;         // 累计洪水场次
};

/** 朱批效果（正负皆可；hap 为即时民心增益，hapSec 为持续秒数） */
export type DocFx = {
  coins?: number;
  pop?: number;
  xp?: number;
  food?: number;
  goods?: number;
  hap?: number;
  hapSec?: number;
};

export type DocOpt = {
  label: string;                        // 朱批语（呈报上的批字）
  seal: '准' | '驳' | '缓' | '辞';       // 印章字（UI 与存档用）
  note: string;                         // 概算提示（府库-220G · 民心+3）
  fx: DocFx;
  tone: 'good' | 'bad' | 'info';        // 编年史色调
  outcome: string;                      // 编年史收尾句
};

export type DocDef = {
  id: string;
  title: string;       // 四字标题（编年史卷面）
  icon: string;        // 图标名（icons.ts）
  from: string;        // 呈报人
  body: string;        // 公文正文（一两句公文腔）
  req?: (c: DocCtx) => boolean;   // 呈报条件（不满足则不会送抵）
  opts: DocOpt[];      // 2-3 道朱批
};

// ------------------------------------------------------------
// 调度常量（游戏时：一天 24h，清晨 8:00 送抵）
// ------------------------------------------------------------

/** 首份公文的送抵时刻（开埠首日清晨） */
export const DOC_FIRST_H = 8;

/**
 * 严格晚于 h 的下一个清晨八点（游戏时）。
 * 批完即约明晨：h=8 批完 → 32；h=12 → 32；h=36 → 56。
 */
export function nextMorningH(h: number): number {
  const d = Math.floor(Math.max(0, h) / 24) * 24 + DOC_FIRST_H;
  return d > h ? d : d + 24;
}

// ------------------------------------------------------------
// 纯函数：条件筛选 / 抽签 / 概算文案
// ------------------------------------------------------------

/** 当前可送抵的公文（条件满足 + 本轮未用过） */
export function eligibleDocs(pool: DocDef[], used: string[], c: DocCtx): DocDef[] {
  const u = new Set(used);
  return pool.filter(d => !u.has(d.id) && (!d.req || d.req(c)));
}

/** 抽一份公文（满足条件者随机；全池用尽则忽略 used 重抽一轮；无合适者 null = 案头清简） */
export function pickDoc(pool: DocDef[], used: string[], c: DocCtx): DocDef | null {
  let el = eligibleDocs(pool, used, c);
  if (!el.length) el = pool.filter(d => !d.req || d.req(c));   // 新一轮（用尽重抽）
  if (!el.length) return null;
  return el[Math.floor(Math.random() * el.length)];
}

/** 效果概算文案（toast 与存档提示用；ASCII 正负号便于检索） */
export function fxSummary(fx: DocFx): string {
  const parts: string[] = [];
  if (fx.coins) parts.push(`府库${fx.coins > 0 ? '+' : ''}${fx.coins}G`);
  if (fx.pop) parts.push(`人口${fx.pop > 0 ? '+' : ''}${fx.pop}`);
  if (fx.food) parts.push(`粮仓${fx.food > 0 ? '+' : ''}${fx.food}`);
  if (fx.goods) parts.push(`货物${fx.goods > 0 ? '+' : ''}${fx.goods}`);
  if (fx.xp) parts.push(`经验+${fx.xp}`);
  if (fx.hap) parts.push(`民心${fx.hap > 0 ? '+' : ''}${fx.hap}`);
  return parts.length ? parts.join(' · ') : '无关痛痒';
}

// ------------------------------------------------------------
// 公文池（15 份：条件横跨人口 / 纪元 / 季节 / 设施 / 指数）
// ------------------------------------------------------------

export const DOCS: DocDef[] = [
  {
    id: 'mill', title: '水闸请修', icon: 'drop', from: '城东水磨坊主',
    body: '城东老水闸用了三年，闸板朽了半边，眼看汛期要来，恳请市政厅拨款修缮。',
    opts: [
      { label: '准：拨银修闸', seal: '准', note: '府库-220G · 民心+3',
        fx: { coins: -220, hap: 3, hapSec: 120 }, tone: 'good',
        outcome: '开春汛水过闸安然无恙，街坊都念市长的贤明。' },
      { label: '缓：先垫沙袋', seal: '缓', note: '府库-20G',
        fx: { coins: -20 }, tone: 'info',
        outcome: '沙袋在闸口堆了一层，坊主嘴上应着，眉头没松开。' },
    ],
  },
  {
    id: 'guild', title: '商户联名', icon: 'coin', from: '商会会长',
    body: '十字街商户联名陈情：近月市面清淡，恳请减免三日摊税，与民休息。',
    req: c => c.shops >= 4,
    opts: [
      { label: '准：免税三日', seal: '准', note: '府库-120G · 民心+4',
        fx: { coins: -120, hap: 4, hapSec: 120 }, tone: 'good',
        outcome: '三日免税，街上重新热闹起来，商会送来一块「父母官」的匾。' },
      { label: '驳：定例难改', seal: '驳', note: '府库+80G · 民心-4',
        fx: { coins: 80, hap: -4, hapSec: 90 }, tone: 'info',
        outcome: '会长收起联名信，拱了拱手，没再多话。' },
    ],
  },
  {
    id: 'refugee', title: '流民投宿', icon: 'people', from: '城门巡役',
    body: '城外来了十几户逃荒人家，扶老携幼，恳请入城安置。',
    req: c => c.pop >= 10 && c.cap - c.pop >= 12,
    opts: [
      { label: '准：开棚安置', seal: '准', note: '人口+12 · 粮仓-60 · 民心+3',
        fx: { pop: 12, food: -60, hap: 3, hapSec: 90 }, tone: 'good',
        outcome: '十二口新市民在临时窝棚里过了头一夜，天亮时炊烟照常升起。' },
      { label: '驳：婉言劝返', seal: '驳', note: '民心-5',
        fx: { hap: -5, hapSec: 90 }, tone: 'bad',
        outcome: '人家在城外磕了个头，往南边去了。城里的议论比风传得还快。' },
    ],
  },
  {
    id: 'school', title: '学堂选址', icon: 'book', from: '学堂山长',
    body: '学堂生员日增，现有三间瓦房坐不下了，山长恳请拨款另建新舍。',
    req: c => c.pop >= 60,
    opts: [
      { label: '准：拨银建舍', seal: '准', note: '府库-320G · 经验+40',
        fx: { coins: -320, xp: 40 }, tone: 'good',
        outcome: '新舍上梁那天，山长领着学生给市政厅行了个礼。' },
      { label: '缓：暂借祠堂', seal: '缓', note: '无靡费',
        fx: {}, tone: 'info',
        outcome: '祠堂里传出读书声，族老们嘴上不说，香案还是往边上挪了挪。' },
    ],
  },
  {
    id: 'patrol', title: '匪患风闻', icon: 'shield', from: '巡防队正',
    body: '近有匪患风闻，西郊夜路已有两起劫案，队正请增募夜巡人手。',
    req: c => c.pop >= 100 && c.safetyIdx < 85,
    opts: [
      { label: '准：增募夜巡', seal: '准', note: '府库-260G · 民心+4',
        fx: { coins: -260, hap: 4, hapSec: 120 }, tone: 'good',
        outcome: '夜巡的灯笼串成一线，西郊夜路又敢走人了。' },
      { label: '驳：张榜安民', seal: '驳', note: '民心-3',
        fx: { hap: -3, hapSec: 90 }, tone: 'bad',
        outcome: '安民榜贴出去三天，浆糊干了，案子又添了一起。' },
    ],
  },
  {
    id: 'plague', title: '疫病前兆', icon: 'heart', from: '医馆坐堂',
    body: '城西连日发热病例，坐堂大夫疑是时疫前兆，请预购药材、洁净水源。',
    req: c => c.healthIdx < 85,
    opts: [
      { label: '准：预购药材', seal: '准', note: '府库-180G · 民心+3',
        fx: { coins: -180, hap: 3, hapSec: 90 }, tone: 'good',
        outcome: '药汤的大锅在城西支了七天，时疫没烧起来。' },
      { label: '缓：再观几日', seal: '缓', note: '民心-2',
        fx: { hap: -2, hapSec: 90 }, tone: 'bad',
        outcome: '三天后病例翻了一倍，大夫把「早就说了」咽回了肚里。' },
    ],
  },
  {
    id: 'subsidy', title: '平价走货', icon: 'box', from: '出口商会',
    body: '货仓积压，商会献策：贴补运脚，低价走货，回笼现银。',
    req: c => c.goods >= 80,
    opts: [
      { label: '准：贴补运脚', seal: '准', note: '货物-50 · 府库+160',
        fx: { coins: 160, goods: -50 }, tone: 'good',
        outcome: '五十件货连夜出了城，回款刨去贴补还落了些现银。' },
      { label: '驳：惜售待涨', seal: '驳', note: '无靡费',
        fx: {}, tone: 'info',
        outcome: '商会耸耸肩：那便再等等看。' },
    ],
  },
  {
    id: 'lamp', title: '灯油公费', icon: 'star', from: '市政书办',
    body: '书办禀请：主街夜路灯油年费不菲，然添灯之后夜市可期。',
    req: c => c.buildings >= 25,
    opts: [
      { label: '准：添灯开夜市', seal: '准', note: '府库-240G · 民心+4',
        fx: { coins: -240, hap: 4, hapSec: 120 }, tone: 'good',
        outcome: '主街的灯一直亮到亥时，收摊的小贩哼起了小曲。' },
      { label: '驳：维持现状', seal: '驳', note: '无靡费',
        fx: {}, tone: 'info',
        outcome: '书办把禀帖归了档：夜还是那个夜。' },
    ],
  },
  {
    id: 'winter', title: '大雪平粜', icon: 'wheat', from: '粮行掌柜',
    body: '大雪封路，穷家小户存粮见底，掌柜请开仓平粜，与民渡荒。',
    req: c => c.season === 3,
    opts: [
      { label: '准：开仓平粜', seal: '准', note: '粮仓-100 · 府库+60 · 民心+5',
        fx: { food: -100, coins: 60, hap: 5, hapSec: 150 }, tone: 'good',
        outcome: '平粜的粮队踩着雪进了巷子，孩子的哭声换成了笑。' },
      { label: '驳：闭仓待价', seal: '驳', note: '府库+120G · 民心-5',
        fx: { coins: 120, hap: -5, hapSec: 120 }, tone: 'bad',
        outcome: '粮仓的门锁得紧紧的，巷子里的目光也冷了。' },
    ],
  },
  {
    id: 'templefair', title: '春社庙会', icon: 'fest', from: '四乡会首',
    body: '四乡会首递帖：愿凑份子办春社庙会，请市政厅主持开锣。',
    req: c => c.festCount >= 1,
    opts: [
      { label: '准：官办庙会', seal: '准', note: '府库-140G · 经验+30 · 民心+4',
        fx: { coins: -140, xp: 30, hap: 4, hapSec: 120 }, tone: 'good',
        outcome: '庙会开了三天，戏台底下人山人海。' },
      { label: '辞：民间自办', seal: '辞', note: '民心+1',
        fx: { hap: 1, hapSec: 90 }, tone: 'info',
        outcome: '会首们自己搭了台子，锣鼓照样敲得震天响。' },
    ],
  },
  {
    id: 'levee', title: '河堤岁修', icon: 'bridge', from: '河工汛官',
    body: '前番大水堤身受损，汛官请加高堤坝三尺，一劳永逸。',
    req: c => c.floods >= 1,
    opts: [
      { label: '准：加高堤坝', seal: '准', note: '府库-380G · 民心+2',
        fx: { coins: -380, hap: 2, hapSec: 90 }, tone: 'good',
        outcome: '新堤落成，汛官在堤上立了块石碑，没刻名字，只刻了年月。' },
      { label: '缓：例行岁修', seal: '缓', note: '府库-60G',
        fx: { coins: -60 }, tone: 'info',
        outcome: '岁修的河工敷衍了半月，汛官的塘报写得比堤还薄。' },
    ],
  },
  {
    id: 'press', title: '报馆创刊', icon: 'scroll', from: '报馆主笔',
    body: '城中识字的人多了，主笔创刊《市井日报》，恳请市长题写报头。',
    req: c => c.pop >= 150,
    opts: [
      { label: '准：题写报头', seal: '准', note: '经验+50 · 民心+3',
        fx: { xp: 50, hap: 3, hapSec: 90 }, tone: 'good',
        outcome: '报头四个字登在创刊号上，主笔说这是「城市开化」的凭证。' },
      { label: '辞：谢绝题词', seal: '辞', note: '无靡费',
        fx: {}, tone: 'info',
        outcome: '创刊号照样卖空了，只是头版少了四个字。' },
    ],
  },
  {
    id: 'power', title: '电价听证', icon: 'bolt', from: '电气公司经理',
    body: '煤价上涨，电气公司请调电价两成，市民代表请市府做主。',
    req: c => c.powerDem >= 20,
    opts: [
      { label: '准：市府贴补', seal: '准', note: '府库-200G · 民心+4',
        fx: { coins: -200, hap: 4, hapSec: 120 }, tone: 'good',
        outcome: '电价没涨，账由市政厅认了一半，两边的代表都体面地散了。' },
      { label: '驳：顺价两成', seal: '驳', note: '府库+150G · 民心-4',
        fx: { coins: 150, hap: -4, hapSec: 120 }, tone: 'bad',
        outcome: '电价涨了，路灯倒是更亮了，只是家里的灯点得比从前省。' },
    ],
  },
  {
    id: 'parkname', title: '公园认养', icon: 'tree', from: '绅商代表',
    body: '绅商愿出三百金认养街心公园，条件是园中石碑刻其先父名讳。',
    req: c => c.parks >= 3,
    opts: [
      { label: '准：立碑留名', seal: '准', note: '府库+300G · 民心-2',
        fx: { coins: 300, hap: -2, hapSec: 90 }, tone: 'info',
        outcome: '石碑立起来了，晨练的老人们对碑上的名字评头论足。' },
      { label: '驳：官家自理', seal: '驳', note: '府库-80G',
        fx: { coins: -80 }, tone: 'good',
        outcome: '公园的花照样开，市府的账上多了一笔不大不小的开销。' },
    ],
  },
  {
    id: 'returnee', title: '侨商归乡', icon: 'factory', from: '侨商联络处',
    body: '侨商愿携资归乡建厂，请划地十亩，免税一年。',
    req: c => c.era >= 2,
    opts: [
      { label: '准：划地建厂', seal: '准', note: '府库-100G · 货物+120 · 经验+60',
        fx: { coins: -100, goods: 120, xp: 60 }, tone: 'good',
        outcome: '新厂的机器是从海外拆运回来的，试机那天半城人来看热闹。' },
      { label: '缓：来年再议', seal: '缓', note: '无靡费',
        fx: {}, tone: 'info',
        outcome: '侨商留下了名片，说在南洋再等一年。' },
    ],
  },
];
