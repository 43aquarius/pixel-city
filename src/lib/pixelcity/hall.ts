// ============================================================
// hall.ts — v40 城市之光：季评 · 名人堂（月度市民评选）
//   名人堂落成即开榜 —— 每逢换季整点（每 12 游戏时）评选一届
//   「本季城市之光」：八大奖项按城市状态加权（消防局在城才评得动
//   见义勇为、联赛赢球才有人捧绿茵之星），候选市民按职别筛选，
//   颁奖词程序化生成 —— 授勋入个人史册、全城幸福沾光、
//   编年史大事记一笔（报纸号外自动联动）。
//   本模块不依赖 tycoon（候选市民与随机源由外部传入，避免循环引用）。
// ============================================================

// ------------------------------------------------------------
// 调度常数
// ------------------------------------------------------------

export const HALL_GAP = 12;       // 评选周期（游戏时；一季一评，逢换季整点开榜）
export const HALL_MOOD = 12;      // 获奖市民心情提振
export const HALL_HAP = 1;        // 授勋季全城幸福加成
export const HALL_HAP_T = 120;    // 授勋幸福持续（秒）
export const HALL_KEEP = 24;      // 光荣榜保留届数（新在前）
export const HALL_AWARD_N = 8;    // 奖项总数（图鉴口径）

// ------------------------------------------------------------
// 类型
// ------------------------------------------------------------

/** 授勋记录（随档保留最近 HALL_KEEP 届） */
export type HallRoll = {
  n: number;            // 届号（1 起）
  season: string;       // 授勋季名（春夏秋冬）
  day: number;          // 授勋日（开埠第 N 天）
  id: number;           // 获奖市民 id（0 = 荣誉空缺）
  nm: string;           // 获奖市民名
  job: string;          // 获奖市民职别
  award: string;        // 奖项名
  cite: string;         // 颁奖词
};

/** 候选市民（tycoon 从 roster 投影；避免依赖 Citizen 全型） */
export type HallNominee = {
  id: number;
  name: string;
  job: string;
  gender: 0 | 1;
  age: number;
  body: 0 | 1 | 2;
  mood: number;
  homeName: string;
  hobby: string;
};

/** 评选上下文（城市状态快照投影） */
export type HallCtx = {
  season: string;
  pop: number;
  firestation: boolean;   // 消防局在城
  hospital: boolean;      // 医院在城
  clinic: boolean;        // 诊所/防疫站在城
  police: boolean;        // 交番/警察局在城
  school: boolean;        // 学校/图书馆/大学在城
  stadium: boolean;       // 体育场在城
  lgWin: boolean;         // 近期赢球余温
  shopsN: number;         // 商业建筑数
};

/** 奖项定义（候选筛选 + 城市权重 + 颁奖词模板） */
export type HallAward = {
  id: string;
  name: string;
  icon: string;
  note: string;                                   // 图鉴注脚
  cand: (c: HallNominee) => boolean;              // 候选市民判定
  w: (ctx: HallCtx) => number;                    // 城市状态权重（0 = 本季不评）
  cite: (c: HallNominee, ctx: HallCtx) => string; // 颁奖词
};

// ------------------------------------------------------------
// 职别速查（与 citizens.ts JOBS 名册对齐）
// ------------------------------------------------------------

const J_DOCTOR = '值班医生';
const J_TEACHER = ['小学教师', '图书管理员'] as const;
const J_POLICE = '片区警官';
const J_FIREFIGHTER = '消防员';
const J_SHOPKEEPER = ['杂货店主', '面包师', '居酒屋老板', '集市摊主', '便利店店员', '酒店经理', '商场导购', '放映员', '渡轮船长'] as const;

// ------------------------------------------------------------
// 八大奖项
// ------------------------------------------------------------

export const HALL_AWARDS: HallAward[] = [
  {
    id: 'laomo', name: '劳动模范', icon: 'job',
    note: '勤勤恳恳一座城的底气 —— 炉火不熄，柜台常亮',
    cand: c => c.body === 0,
    w: () => 5,
    cite: c => `凭一双闲不住的手和一颗踏实的心，${c.job}的活计交到 TA 手里就没人再操心。街坊说：这城里最亮的一盏灯，是 TA 每天清晨先点亮的那一盏。`,
  },
  {
    id: 'jiuyong', name: '见义勇为', icon: 'fire',
    note: '火场里逆行的背影 —— 城市卫士的最高褒奖',
    cand: c => c.job === J_FIREFIGHTER,
    w: ctx => (ctx.firestation ? 7 : 0),
    cite: c => `警铃一响，${c.name}总是第一个冲上车的那一个。这一年里 TA 从火场里抱出来的不止是财物，还有半条街的人心。`,
  },
  {
    id: 'renxin', name: '仁心仁术', icon: 'heart',
    note: '听诊器捂热的年份 —— 白衣执甲的温柔力量',
    cand: c => c.job === J_DOCTOR,
    w: ctx => (ctx.hospital || ctx.clinic ? 6 : 0),
    cite: c => `深夜急诊的灯常为 TA 亮着，${c.homeName}的孩子发烧，第一个敲的总是 TA 家的门。医者仁心，全城受惠。`,
  },
  {
    id: 'pingan', name: '平安卫士', icon: 'shield',
    note: '巡逻灯照亮的街角 —— 夜不闭户的守望者',
    cand: c => c.job === J_POLICE,
    w: ctx => (ctx.police ? 6 : 0),
    cite: c => `TA 的巡逻路线比钟表还准，巷子里的老人都认得那道手电的光。有小 TA 在，商户夜里敢把门板卸了睡。`,
  },
  {
    id: 'lvyin', name: '绿茵之星', icon: 'ball',
    note: '看台上山呼海啸的那个名字 —— 全城的荣耀',
    cand: c => c.body === 0,
    w: ctx => (ctx.lgWin ? 8 : ctx.stadium ? 2 : 0),
    cite: c => `赢球那一夜，${c.name}的名字和看台的灯火一起亮到后半夜。本季的每一粒进球，街坊都能如数家珍。`,
  },
  {
    id: 'xingtan', name: '杏坛春晖', icon: 'book',
    note: '一支粉笔写满的岁月 —— 桃李满城的园丁',
    cand: c => (J_TEACHER as readonly string[]).includes(c.job),
    w: ctx => (ctx.school ? 6 : 0),
    cite: c => `本城出生的孩子，头一句工整的字都是 TA 手把手教的。放学的钟声里，总有学生绕远路就为跟 TA 说一句再见。`,
  },
  {
    id: 'shouxi', name: '寿星高照', icon: 'smile',
    note: '把日子过成传家宝的长辈 —— 岁月的勋章',
    cand: c => c.body === 2 && c.age >= 85,
    w: () => 6,
    cite: c => `${c.age} 岁高龄，${c.hobby}的兴致不减当年。儿孙绕膝、街坊敬重 —— TA 就是这座城日子里最安稳的那枚压舱石。`,
  },
  {
    id: 'chuangye', name: '创业先锋', icon: 'coin',
    note: '从一间铺面开出的天地 —— 市井烟火掌门人',
    cand: c => (J_SHOPKEEPER as readonly string[]).includes(c.job),
    w: ctx => (ctx.shopsN >= 3 ? 5 : 0),
    cite: c => `${c.job}的招牌在街口挂了这些年，回头客比路过的风还多。TA 的生意经只有一条：把街坊当自家人。`,
  },
];

// ------------------------------------------------------------
// 纯函数
// ------------------------------------------------------------

/** 奖项图鉴集齐数（去重） */
export function hallAwardKinds(rolls: HallRoll[]): number {
  const got = new Set<string>();
  for (const r of rolls) {
    const a = HALL_AWARDS.find(x => x.name === r.award);
    if (a) got.add(a.id);
  }
  return got.size;
}

/** 评选一届：可评奖项加权抽一 → 候选市民随机挑一 → 颁奖词生成（无可评奖项返回 null；awards 可指定奖项子集供沙盒用） */
export function pickHallWinner(
  nominees: HallNominee[],
  ctx: HallCtx,
  n: number,
  gHours: number,
  rnd: () => number = Math.random,
  awards: HallAward[] = HALL_AWARDS,
): HallRoll | null {
  const eligible = awards
    .map(a => ({ a, w: a.w(ctx), pool: nominees.filter(c => a.cand(c)) }))
    .filter(x => x.w > 0 && x.pool.length > 0);
  if (!eligible.length) return null;
  let sum = 0;
  for (const x of eligible) sum += x.w;
  let r = rnd() * sum;
  let pickA = eligible[0];
  for (const x of eligible) { r -= x.w; if (r <= 0) { pickA = x; break; } }
  const cit = pickA.pool[Math.floor(rnd() * pickA.pool.length) % pickA.pool.length];
  return {
    n,
    season: ctx.season,
    day: Math.floor(gHours / 24) + 1,
    id: cit.id,
    nm: cit.name,
    job: cit.job,
    award: pickA.a.name,
    cite: pickA.a.cite(cit, ctx),
  };
}
