// ============================================================
// sisters.ts — v37 千里比邻：姊妹城市（邻城外交纵深）
//   开埠即有三座邻城与您隔野相望 —— 名号市长各有来历，
//   好感随互市与患难见真情涨落：商队带货换银钱添交情，
//   邻城遭灾会遣使求援（援银发得快交情长得深），
//   好感深厚的邻城会赠礼致意，本城遭难时也有人连夜驰援；
//   每隔数时月评张榜，评级首超邻城名声在外。
//   本模块不依赖 tycoon（随机源由外部传入，避免循环引用）。
// ============================================================

/** 邻城定义（随档完整保存；旧档缺省由 tycoon 补建） */
export type SisterCity = {
  id: string;          // 'sis0'..'sis2'（存档键位）
  name: string;        // 邻城名号
  mayor: string;       // 邻城市长
  trait: string;       // 市长性情
  style: string;       // 城市风貌
  emblem: string;      // 市徽图标名（icons.ts）
  pop: number;         // 邻城人口（随时间缓增）
  rating: number;      // 邻城评级（30..95 漂移；月评对照）
  rel: number;         // 好感度 0..100
};

// ------------------------------------------------------------
// 调度与结算常数
// ------------------------------------------------------------

export const SIS_N = 3;               // 邻城数
export const SIS_LV = 2;              // 通商门槛（市政厅 LV2 起：初来乍到，先安顿自家）
export const SIS_ROLL_GAP = 6;        // 邻城成长 / 月评步进（游戏时）
export const SIS_EVT_GAP = 14;        // 邻城事件 roll 基准间隔（游戏时；实际 ±50% 抖动）
export const SIS_TRADE_CD = 6;        // 互市冷却（游戏时/城：商队往返总得在路上走几天）
export const SIS_TRADE_UNITS = 40;    // 单次互市出货上限（件）
export const SIS_TRADE_MIN = 6;       // 互市起运量（件：拿不出像样的货单就不必惊动商队）
export const SIS_REQ_TTL = 24;        // 求援待办有效期（游戏时；久候无音视为婉拒）
export const SIS_AID_COST = 150;      // 援助花费（G）
export const SIS_AID_REL = 18;        // 援助好感（雪中送炭，情分最重）
export const SIS_DECLINE_REL = -6;    // 婉拒好感（使者悻悻而归）
export const SIS_TRADE_REL = 2;       // 互市好感（一回生二回熟）
export const SIS_FRIEND = 60;         // 结好门槛（正式结为姊妹之城）
export const SIS_SWORN = 80;          // 三城盟誓门槛（广结善缘）
export const SIS_REL_MAX = 100;       // 好感上限
export const SIS_HELP_REL = 60;       // 本城遭灾时邻城驰援的好感门槛
export const SIS_HELP_CD = 12;        // 驰援冷却（游戏时；患难见真情但不是无限提款机）

// ------------------------------------------------------------
// 名号池（城市 / 市长 / 性情 —— 生成时去重）
// ------------------------------------------------------------

/** 城市名号与风貌（emblem 用 icons.ts 现有图标） */
export const SIS_TOWNS: Array<{ id: string; name: string; style: string; emblem: string }> = [
  { id: 'qinghe', name: '清河集', style: '依山傍水的集市小镇，货郎的拨浪鼓从街头响到巷尾', emblem: 'drop' },
  { id: 'wanghai', name: '望海港', style: '帆樯林立的海港重镇，鱼市开秤比公鸡打鸣还早', emblem: 'bridge' },
  { id: 'baishi', name: '白石城', style: '石墙环列的山城，采石号的号子声传出去二里地', emblem: 'rock' },
  { id: 'liulang', name: '柳浪镇', style: '河湾柳岸的鱼米之乡，渡船与乌篷船挤在同一处码头', emblem: 'tree' },
  { id: 'jinsui', name: '金穗城', style: '麦浪千里的粮仓大城，秋天连风里都是新麦的味道', emblem: 'wheat' },
  { id: 'tiemen', name: '铁门关', style: '炉火不熄的工矿重镇，烟囱比城门楼还高出半截', emblem: 'factory' },
  { id: 'yunshan', name: '云杉谷', style: '松涛阵阵的林中城寨，木匠铺的刨花香飘满全城', emblem: 'tree' },
  { id: 'shaquan', name: '沙泉驿', style: '商队往来的绿洲驿站，井台边永远歇着几匹口渴的骡马', emblem: 'sun' },
  { id: 'tongluo', name: '铜锣湾', style: '骡马成行的关隘集市，铜锣一响四面八方都来赶集', emblem: 'coin' },
  { id: 'yueya', name: '月牙湾', style: '一弯碧水抱着的渔村小城，晒网的架子排满了沙滩', emblem: 'camera' },
];

/** 市长姓名池 */
export const SIS_MAYORS = [
  '沈万舟', '顾青山', '白若鸿', '胡九斤', '陆知远', '孟半城',
  '燕南飞', '秋十三娘', '程铁算', '柳慕云', '石敢当', '阮青柠',
];

/** 市长性情池 */
export const SIS_TRAITS = [
  '厚道热心，最重信义', '精打细算，账房出身', '豪爽好客，席上从不让客人空杯',
  '少言寡语，闷头做事', '爱面子，凡事讲排场', '思维活络，满城都是生意经',
];

// ------------------------------------------------------------
// 生成与纯函数
// ------------------------------------------------------------

/** 好感夹取（0..100） */
export function clampRel(v: number): number {
  return Math.max(0, Math.min(SIS_REL_MAX, Math.round(v)));
}

/** 生成三座邻城（城市 / 市长不重复；seed 仅扰动画布，随机源由调用方注入） */
export function genSisters(rnd: () => number = Math.random): SisterCity[] {
  const towns = [...SIS_TOWNS];
  const mayors = [...SIS_MAYORS];
  const traits = [...SIS_TRAITS];
  const pick = <T,>(arr: T[]): T => arr.splice((rnd() * arr.length) | 0, 1)[0];
  const cities: SisterCity[] = [];
  for (let i = 0; i < SIS_N; i++) {
    const t = pick(towns);
    cities.push({
      id: `sis${i}`,
      name: t.name, style: t.style, emblem: t.emblem,
      mayor: pick(mayors), trait: pick(traits),
      pop: 120 + Math.round(rnd() * 300),
      rating: Math.round(35 + rnd() * 37),
      rel: clampRel(28 + rnd() * 14),
    });
  }
  return cities;
}

/** 互市单价：交情与邻城行情都是好价钱（基础 1.5G + 好感 0..1G + 评级 0..0.5G ≈ 1.5..3G/件，
 *  比海路出口 1.35G 划算 —— 但要腾出货量、等冷却，还得一点点把交情处出来） */
export function tradeProfit(rel: number, rating: number): number {
  return 1.5 + Math.max(0, Math.min(SIS_REL_MAX, rel)) / 100 + Math.max(30, Math.min(95, rating)) / 200;
}

/** 互市利润概算（面板按钮提示用） */
export function tradeGain(units: number, rel: number, rating: number): number {
  return Math.round(units * tradeProfit(rel, rating));
}

/** 好感档位文案（城市卡与面板用） */
export function relBand(rel: number): string {
  if (rel >= SIS_SWORN) return '歃血为盟';
  if (rel >= SIS_FRIEND) return '姊妹之城';
  if (rel >= 45) return '往来密切';
  if (rel >= 30) return '点头之交';
  return '素不相识';
}

/** 邻城遭灾事由池（求援公文正文用） */
export const SIS_CALAMITIES = [
  '上游山洪骤发，冲了跨河的老石桥，集市淹了半条街',
  '一场夜火烧掉了东市大棚，半个集市的摊子成了白地',
  '时疫在城南蔓延，药铺的甘草都卖空了三轮',
  '连日大雪压塌了官仓的顶，存粮淋湿了大半',
  '地动摇塌了西巷几堵院墙，桥倒是还立着',
];

/**
 * 邻城事件抽取：求援（患难随机，与交情无关）/ 赠礼·来访（交情越深越常来）。
 * 返回 null = 使者今日无事。
 */
export function rollSisEvent(rel: number, rnd: () => number = Math.random): 'aid' | 'gift' | 'visit' | null {
  const r = rnd();
  if (r < 0.30) return 'aid';                                  // 患难不挑交情
  if (r < 0.30 + (rel / SIS_REL_MAX) * 0.28) return 'gift';    // 交情深了常捎土产
  if (rel >= 55 && r < 0.30 + (rel / SIS_REL_MAX) * 0.28 + 0.18) return 'visit';   // 代表团回访
  return null;
}
