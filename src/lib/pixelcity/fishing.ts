// ============================================================
// fishing.ts — v43 渔业之城·鱼米之乡（纯函数模块）
//
// 渔港码头是渔业的锚：泊位渔船出海拖网，每 24 游戏时一次渔汛
// 结算。渔获随季节起落 —— 春汛桃花水暖、秋汛蟹肥鱼壮，冬季
// 冰封歇海（与 v7 渡轮冬季停航同一片封冻的水面）；水质是渔家
// 的命根 —— 环境指数走低（v19 污染倒进水里）鱼群绕道，清波
// 见底才钓得上银鱼。渔获要经海鲜市场按筐变现，多出的鲜货折
// 粮入仓 —— 渔港与市场齐备，全城餐桌多一道海味（幸福 +1）。
// 渔获图鉴十种：春鳜秋蟹夏虾冬歇，各有各的汛。
// 全部为纯函数（零依赖注入），bun 直测与引擎共用。
// ============================================================

/** 渔汛结算间隔（游戏时）：一日一汛，与开埠日历合拍 */
export const FISH_DAY_H = 24;
/** 每座渔港每日基础渔获（筐） */
export const FISH_BASE = 4.0;
/** 季节渔汛系数：春汛 1.5 / 夏平 1.0 / 秋汛 1.8 / 冬封 0（冰封歇海） */
export const FISH_SEASON_K = [1.5, 1.0, 1.8, 0] as const;
/** 环境指数低于此值 → 水质差（v19 污染的账要记到渔家头上） */
export const FISH_ENV_BAD = 40;
/** 环境指数达到此值 → 清波见底（银鱼与中华鲟的门槛） */
export const FISH_ENV_GOOD = 75;
/** 水质差渔获系数（鱼群绕道） */
export const FISH_ENV_K_BAD = 0.6;
/** 清波渔获系数（水好鱼旺） */
export const FISH_ENV_K_GOOD = 1.15;
/** 每座海鲜市场每日可售渔获（筐）：冰台就那么宽 */
export const FISH_MKT_CAP = 10;
/** 每筐渔获售价（G）：海鲜集市按筐点钱 */
export const FISH_PRICE = 26;
/** 售出渔获折算口粮（筐 → 粮）：鲜货入仓补口粮 */
export const FISH_FOOD_K = 8;
/** 无市场时自食折粮系数（自家餐桌与街坊分食） */
export const FISH_SELF_FOOD_K = 3;
/** 海味上桌全市幸福加成（渔港与海鲜市场齐备且非冬封） */
export const FISH_HAP = 1;
/** 渔汛大丰收口径（单日渔获筐数；编年史只记头一回） */
export const FISH_BOUNTY_CATCH = 12;
/** 累计渔获里程碑（成就「鱼米之乡」口径：筐） */
export const FISH_CATCH_GOAL = 500;
/** 每座渔港的作业渔船数（泊位出海） */
export const FISH_BOATS_PER_PORT = 2;
/** 全城渔船上限（水面也要留给渡轮与帆船） */
export const FISH_BOAT_MAX = 6;

/** 季节渔汛系数（越界按冬封兜底——保守起见多歇不禁渔；冬季 0 = 冰封歇海） */
export function seasonKOf(season: number): number {
  return FISH_SEASON_K[Math.max(0, Math.min(3, Math.floor(season)))] ?? 1.0;
}

/** 水质系数（纯函数）：环境指数走低鱼群绕道，清波见底鱼旺 */
export function envKOf(envIdx: number): number {
  if (envIdx < FISH_ENV_BAD) return FISH_ENV_K_BAD;
  if (envIdx >= FISH_ENV_GOOD) return FISH_ENV_K_GOOD;
  return 1;
}

/** 单日渔获（筐，取整）：渔港数 × 基础 × 季节汛 × 水质；冬季冰封为 0 */
export function fishCatchOf(ports: number, season: number, envIdx: number): number {
  if (ports <= 0) return 0;
  const sk = seasonKOf(season);
  if (sk <= 0) return 0;
  return Math.max(0, Math.round(ports * FISH_BASE * sk * envKOf(envIdx)));
}

/** 可售渔获（筐）：海鲜市场冰台容量封顶 */
export function fishSellable(catchB: number, markets: number): number {
  return Math.max(0, Math.min(catchB, markets * FISH_MKT_CAP));
}

/** 渔业收入（G）：可售渔获 × 筐价；无市场一分不值 */
export function fishIncomeOf(catchB: number, markets: number): number {
  return fishSellable(catchB, markets) * FISH_PRICE;
}

/** 渔获折粮：售出部分按筐折粮入仓；超出冰台容量的由渔家自食分给街坊 */
export function fishFoodOf(catchB: number, markets: number): number {
  const sold = fishSellable(catchB, markets);
  const unsold = Math.max(0, catchB - sold);
  return Math.round(sold * FISH_FOOD_K + unsold * FISH_SELF_FOOD_K);
}

/** 海味上桌幸福（渔港与市场齐备且非冬封才上得了桌） */
export function fishHapOf(ports: number, markets: number, season: number): number {
  return ports > 0 && markets > 0 && seasonKOf(season) > 0 ? FISH_HAP : 0;
}

// ------------------------------------------------------------
// 渔获图鉴：十种河鲜各有各的汛（春鳜秋蟹夏虾冬歇）
// rare 0 常见 / 1 稀有 / 2 镇册之宝；w 缺省 1（冬封在外层统一挡）
// ------------------------------------------------------------

export type FishSpeciesDef = {
  id: string;
  name: string;
  rare: 0 | 1 | 2;
  icon: string;         // 图鉴像素头像（icons.ts）
  note: string;         // 图鉴一句话
  w?: (season: number, envIdx: number) => number;   // 上钩权重（0 = 暂不上钩）
};

export const FISH_SPECIES: FishSpeciesDef[] = [
  { id: 'crucian', name: '鲫鱼', rare: 0, icon: 'fishCrucian',
    note: '河湾里最熟面孔的鱼，炖汤奶白，是渔家餐桌的底气' },
  { id: 'silver', name: '白鲢', rare: 0, icon: 'fishSilver',
    note: '成群结队浮在水皮上晒太阳，一网下去哗啦啦直跳' },
  { id: 'shrimp', name: '青虾', rare: 0, icon: 'fishShrimp',
    note: '水草丛里弓着腰弹来弹去，盐水一灼就是一盘下酒菜',
    w: (season) => (season === 1 ? 1.6 : season === 2 ? 1.2 : 0.6) },
  { id: 'clam', name: '河蚌', rare: 0, icon: 'fishClam',
    note: '趴在浅滩泥里吐泡泡，撬开壳说不定还藏着一颗珠' },
  { id: 'catfish', name: '黄颡鱼', rare: 1, icon: 'fishCatfish',
    note: '昼伏夜出的黄蜡丁，背鳍一竖扎手，咕咕叫着讨人嫌',
    w: (season) => (season === 1 ? 2.0 : season === 2 ? 1.5 : season === 0 ? 0.5 : 0) },
  { id: 'mandarin', name: '鳜鱼', rare: 1, icon: 'fishMandarin',
    note: '桃花流水鳜鱼肥 —— 春汛的桃花水里才肯上钩的鱼中珍味',
    w: (season) => (season === 0 ? 2.5 : 0) },
  { id: 'whitefish', name: '白鱼', rare: 1, icon: 'fishWhitefish',
    note: '银白细长跃出水面像一柄出鞘的刀，秋汛清蒸最是鲜甜',
    w: (season) => (season === 2 ? 2.5 : season === 0 ? 0.8 : 0) },
  { id: 'crab', name: '大闸蟹', rare: 1, icon: 'fishCrab',
    note: '秋风起蟹脚痒 —— 秋汛限定的横行将军，蟹黄满盖膏满膛',
    w: (season) => (season === 2 ? 3.0 : 0) },
  { id: 'silverfish', name: '银鱼', rare: 1, icon: 'fishSilverfish',
    note: '寸许长通体透亮，只在清波见底的水里现形 —— 水质是它们的请柬',
    w: (_s, envIdx) => (envIdx >= FISH_ENV_GOOD ? 1.5 : 0) },
  { id: 'sturgeon', name: '中华鲟', rare: 2, icon: 'fishSturgeon',
    note: '从长江溯游而来的老祖宗，骨板铮铮 —— 水质极清的河段才迎得来，全城的荣光',
    w: (_s, envIdx) => (envIdx >= FISH_ENV_GOOD + 5 ? 0.8 : 0) },
];

/** 图鉴累计目标（面板口径） */
export const FISH_DEX_TOTAL = FISH_SPECIES.length;

/** 上钩权重查询（0 = 暂不上钩；季节汛与水质共同说了算） */
export function fishWeightOf(sp: FishSpeciesDef, season: number, envIdx: number): number {
  return sp.w ? sp.w(season, envIdx) : 1;
}

/** 按权重抽一尾鱼（纯函数：rnd 由调用方注入，便于直测） */
export function rollFish(
  season: number, envIdx: number, rnd: () => number,
): FishSpeciesDef | null {
  const pool = FISH_SPECIES.map(sp => ({ sp, w: fishWeightOf(sp, season, envIdx) }))
    .filter(x => x.w > 0);
  if (!pool.length) return null;
  let sum = 0;
  for (const x of pool) sum += x.w;
  let r = rnd() * sum;
  let pick = pool[0].sp;
  for (const x of pool) { r -= x.w; if (r <= 0) { pick = x.sp; break; } }
  return pick;
}
