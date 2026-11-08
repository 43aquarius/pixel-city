// ============================================================
// citizens.ts — v13 市民列传：有名有姓的城市居民
//   人口增长 → 新市民落户（姓名/年龄/职业/性格/出身/传记）
//   时间流逝 → 生活大事记（升职/成婚/添丁/乔迁/退休…）
//   城市事件 → 市民反应写入个人史册（火灾/疫病/牛市/艺术节…）
//   市民之声 → 随城市状态的市民吐槽（税率/幸福/季节/事件）
//   名人册   → 在册 28 位代表市民（头像 = 行人精灵同款像素画）
//   v15 深化：
//     家族谱系 —— 成婚双档互指、添丁新生儿真实入册（随父姓·记父母）
//     市长信箱 —— 市民随城市状态来信（求助/吐槽/感谢/见闻），可回信影响心情
//     外观匹配 —— 按行人三元组（衣装/体型/制服）认人：在册市民=本人，否则路人卡
//   本模块不依赖 tycoon（上下文由外部传入，避免循环引用）
// ============================================================

import type { CityMap, Obj } from './map';
import type { Role } from './actors';

/** 名人册容量（在册代表市民上限） */
export const ROSTER_MAX = 28;
/** 每增长多少人口 → 一位代表市民入册 */
export const POP_PER_CITZ = 2;
/** 个人大事记上限（滑窗，新推旧挤） */
export const LOG_MAX = 8;

// ------------------------------------------------------------
// 姓名与文案库
// ------------------------------------------------------------

const SURNAMES = [
  '赵', '钱', '孙', '李', '周', '吴', '郑', '王', '冯', '陈',
  '蒋', '沈', '韩', '杨', '朱', '秦', '许', '何', '吕', '张',
  '孔', '曹', '金', '魏', '陶', '姜', '苏', '潘', '葛', '范',
  '彭', '鲁', '韦', '马', '方', '俞', '袁', '唐', '罗', '薛',
];

const GIVEN_M = [
  '志强', '建国', '立诚', '明轩', '浩然', '子谦', '沐辰', '景行', '思远', '嘉树',
  '云帆', '泊桥', '安澜', '守拙', '砚秋', '听松', '望舒', '既白', '修远', '乐水',
  '厚坤', '见山', '叙白', '怀瑾', '承宇', '知非', '行舟', '向晚', '拂晓', '拾光',
];

const GIVEN_F = [
  '秀兰', '素芬', '静姝', '语棠', '知夏', '念慈', '采薇', '宛清', '听雨', '疏影',
  '幼仪', '若鸿', '芳洲', '云溪', '月澄', '杏浓', '拾星', '沁蔓', '采青', '南乔',
  '温书', '织夏', '临霜', '照君', '柔嘉', '徽音', '稚鱼', '望晴', '栀夏', '稻香',
];

const TRAITS: Array<{ name: string; mood: number }> = [
  { name: '乐观开朗', mood: 8 }, { name: '多愁善感', mood: -6 },
  { name: '知足常乐', mood: 5 }, { name: '急性子', mood: -4 },
  { name: '勤勉踏实', mood: 2 }, { name: '慢热寡言', mood: -2 },
  { name: '热心肠', mood: 4 }, { name: '爱操心', mood: -3 },
  { name: '心大豁达', mood: 6 }, { name: '较真严谨', mood: 0 },
];

const HOBBIES = [
  '侍弄阳台盆栽', '收集老唱片', '清晨沿河慢跑', '下厨琢磨新菜', '逛旧书摊',
  '钓鱼', '给流浪猫拍写真', '拼装航模', '听收音机评书', '搓麻将',
  '临帖练字', '傍晚遛狗', '酿桂花蜜', '集邮', '看露天电影',
];

const ORIGINS = [
  '南方渔村', '北方矿区', '邻县小镇', '山间林场', '河畔渡口',
  '旧都皇城根', '海岛渔港', '草原牧场', '盐场小城', '铁路尽头的三等小站',
];

const STREETS = [
  '铃兰街', '梧桐巷', '银杏路', '青石板街', '枫桥弄',
  '稻香胡同', '灯塔坡', '盐仓后街', '钟楼下巷', '樱花堤',
];

/** v22 学历阶梯：蒙童 → 初小 → 高小 → 大学（hrIdx 按此折算 0-100） */
export const EDU_NAMES = ['蒙童', '初小', '高小', '大学'] as const;

/** 职业 → 行人制服（精灵 role） */
const JOB_ROLE: Record<string, Role> = {
  hospital: 6, school: 3, library: 3, koban: 1, firestation: 7,
};

/** v15：制服 role → 路人职业名（街头偶遇路人卡用） */
const ROLE_GUEST: Record<number, string> = {
  0: '本城市民', 1: '巡街警官', 2: '邮差', 3: '学堂学生', 4: '掌勺主厨',
  5: '慢跑爱好者', 6: '出诊医生', 7: '消防员', 8: '环卫工', 9: '观光客',
};

/** 工作建筑 → 职业名 */
const JOBS: Record<string, string> = {
  shop: '杂货店主', bakery: '面包师', market: '集市摊主', izakaya: '居酒屋老板',
  conv: '便利店店员', gas: '加油站伙计', electown: '电器行技师', cinema: '放映员',
  ferris: '摩天轮操作员', hotel: '酒店经理', mall: '商场导购', office: '公司职员',
  tower: '金融精英', parking: '车场管理员', ferry: '渡轮船长',
  factory: '产业工人', lumber: '伐木工', refinery: '炼油技师', tankfarm: '储罐管理员',
  dock: '码头装卸工', railhub: '货运调度员', warehouse: '仓库管理员', brewery: '酿酒师',
  silo: '粮仓保管员', greenhouse: '花匠', windmill: '磨坊主', power: '锅炉工',
  hospital: '值班医生', school: '小学教师', library: '图书管理员',
  koban: '片区警官', firestation: '消防员', aquarium: '水族馆饲养员',
  museum: '博物馆讲解员', stadium: '球场管理员', observatory: '天文台研究员',
  castle: '城堡管家', temple: '庙祝', church: '教堂司事', cityhall: '市政厅文员',
};

/** 住所建筑 → 居所描述 */
const HOMES: Record<string, string> = {
  house: '独栋小屋', townhouse: '联排洋房', apartment: '电梯公寓', manor: '庄园宅邸',
  restower: '景观塔楼', machiya: '京町屋', danchi: '团组住宅', hiapart: '高层华厦',
  nagaya: '长屋', minshuku: '民宿阁楼',
};

// ------------------------------------------------------------
// 类型
// ------------------------------------------------------------

export type Citizen = {
  id: number;
  name: string;
  gender: 0 | 1;        // 0 男 1 女
  age: number;
  look: number;         // 衣装（与行人 LOOKS 对齐）
  body: 0 | 1 | 2;      // 0 成人 1 儿童 2 长者
  role: Role;           // 制服（精灵）
  job: string;
  trait: string;
  traitMood: number;
  hobby: string;
  origin: string;
  homeKey: number;      // 住所建筑锚点（-1 无固定居所）
  homeName: string;     // 住所描述（含街巷名）
  homeAt: [number, number] | null;   // 住所坐标（缓存，免查 map）
  workKey: number;      // 工作建筑锚点（-1 无业）
  workName: string;     // 职场描述
  workAt: [number, number] | null;   // 职场坐标（缓存）
  mood: number;         // 0-100
  since: number;        // 迁入时间（游戏秒）
  fam: number;          // v15 家族号（0 = 无家族）
  spouse: number;       // v15 配偶市民 id（0 = 未婚）
  pa: number;           // v15 父亲 id（0 = 未知；本城出生者必知）
  ma: number;           // v15 母亲 id
  edu: number;          // v22 学历 0-3（蒙童/初小/高小/大学；学区内容随时间升学）
  /** v26 成人礼岁数缓存（本城出生 15-16 / 迁入儿童 16-18；懒生成） */
  growAge?: number;
  bio: string;
  log: Array<{ t: number; text: string }>;
};

/** v15 家人卡片（详情页「一家人」区块用） */
export type FamCard = {
  id: number; name: string; rel: string; mood: number; here: boolean;
  /** v26 离位原因：moved=迁居别城（名人册滑窗挤出） / passed=已故（安详离世） */
  gone?: 'moved' | 'passed';
  /** v26 离位说明文案（详情页 fam-card off 展示） */
  note?: string;
};

/** v15 市长信箱：市民来信 */
export type Letter = {
  id: number;
  from: number;                     // 发件市民 id（0 = 路人）
  fromName: string;
  look: number; body: 0 | 1 | 2; role: Role;   // 发件人外观（头像渲染）
  subject: string;
  text: string;
  opts: Array<{ label: string; dm: number; reply: string }>;
  read: boolean;
  replied: number;                  // 已选回复下标（-1 = 未回）
  t: number;
};

/** v15 信箱视图 */
export type MailView = {
  unread: number;
  letters: Letter[];
};

/** v30 书信合集：归档条目（信箱满后被挤出的旧信永存于此；回信状态同步） */
export type MailArc = {
  id: number;                       // 原信 id（与信箱信件同号，回信同步用）
  nm: string;                       // 发信人名
  look: number; body: 0 | 1 | 2; role: Role;
  sj: string;                       // 主题（分类与图鉴集齐的依据）
  tx: string;                       // 正文
  cat: string;                      // 分类（由主题映射）
  day: number;                      // 收信日（开埠第 N 天）
  rp: number;                       // 回复下标（-1 = 未回）
  rl: string;                       // 已选批语（rp>=0 时非空）
  rt: string;                       // 回信文案
};

/** v30 书信合集视图 */
export type AnthView = {
  n: number;                        // 归档总数
  replied: number;                  // 已回信数
  subjects: number;                 // 已集齐主题数（去重）
  subjTotal: number;                // 主题总数（图鉴集齐口径）
  cats: Array<{ cat: string; n: number }>;   // 四类计数（不含「全部」）
  items: MailArc[];                 // 新信在前
};

/** v30 信笺四类（题签用二字词） */
export const MAIL_CATS = ['民生', '灾警', '颂声', '见闻'] as const;

/** v30 主题 → 分类（与 buildLetter 的 11 种主题一一对应；未知主题归「见闻」） */
const SUBJECT_CAT: Record<string, string> = {
  '市长，米缸见底了': '民生',
  '关于这个月的税单': '民生',
  '日子有点紧，想跟您聊聊': '民生',
  '大火那晚，吓坏了': '灾警',
  '铺子遭了贼': '灾警',
  '疫病过去之后': '灾警',
  '谢谢这座好城': '颂声',
  '这阵子街上真热闹': '颂声',
  '一条小建议': '见闻',
  '巷口见闻': '见闻',
  '新邻居来打听': '见闻',
};

/** v30 图鉴集齐口径：来信主题总数 */
export const MAIL_SUBJECT_TOTAL = Object.keys(SUBJECT_CAT).length;

/** 主题归类（未知主题兜底「见闻」——巷口来信，总归是些街坊见闻） */
export function catOfSubject(sj: string): string {
  return SUBJECT_CAT[sj] ?? '见闻';
}

/** v15 回信结果 */
export type ReplyResult = {
  ok: boolean; reply?: string; dm?: number; from?: string;
};

/** React 面板用的市民卡片（含建筑名称与坐标） */
export type CitzCard = {
  id: number; name: string; gender: 0 | 1; age: number;
  look: number; body: 0 | 1 | 2; role: Role;
  job: string; trait: string; hobby: string; origin: string;
  bio: string; mood: number; since: number;
  edu: string;                        // v22 学历（名片/详情页展示）
  /** v25 人物志：根/家/迹三段成文（cardOf 实时合成；guest 路人无） */
  story?: string;
  homeName: string; homeAt: { x: number; y: number } | null;
  workName: string; workAt: { x: number; y: number } | null;
  log: Array<{ t: number; text: string }>;
  guest?: boolean;                   // v15 路人（不在名人册）
  fam?: FamCard[];                  // v15 家人
};

export type CitzView = {
  total: number;            // 累计落户人次
  n: number;                // 在册名人
  avgMood: number;          // 平均心情
  roster: CitzCard[];
};

/** tick 上下文（由 Tycoon 传入；避免模块循环依赖） */
export type CitzCtx = {
  pop: number;
  happiness: number;
  taxRate: number;
  season: number;
  famine: number;
  events: string[];
  /** v16 进行中的节日（0-3；-1 = 无） */
  fest: number;
  /** v19 重污染住宅栋数（雾霾心声） */
  smog: number;
  /** v20 断电住宅栋数（暗夜心声） */
  dark: number;
  /** v21 垃圾堆积住宅栋数（环卫心声） */
  waste: number;
  /** v22 学区外住宅栋数（望学心声） */
  eduOut: number;
  /** v30 开埠天数（收信日记录用；缺省 1） */
  day?: number;
  /** v23 盲区商铺数（治安心声：街坊议论失窃） */
  crime: number;
  /** v24 消防盲区栋数（消防心声：火险保贵的街区） */
  fireOut: number;
  /** v36 医疗盲区住宅栋数（就医心声：看病要跨半座城的街区） */
  medOut?: number;
  /** v33 市况相位（0衰退/1平稳/2复苏/3繁荣；缺省 1 —— 衰退抱怨生意淡，繁荣夸市道好） */
  cyc?: number;
  /** v34 绿茵心声（0 无 / 1 比赛日预热 / 2 赢球余温 / 3 输球低落；缺省 0） */
  lg?: number;
  /** v35 动物园已入住物种数（>0 时市民聊动物住户；缺省 0） */
  zooN?: number;
  /** v41 地铁接入车站数（≥2 通车后市民聊地铁；缺省 0） */
  metro?: number;
  /** v22 学区判定回调（tycoon 闭包捕获 eduField：升学事件只举学区内市民） */
  inEdu?: (x: number, y: number) => boolean;
};

const rnd = <T,>(a: T[]): T => a[(Math.random() * a.length) | 0];
const clamp = (v: number, a: number, b: number): number => Math.max(a, Math.min(b, v));
/** 建筑锚点索引（与 map.objs 键一致：ay * n + ax） */
const keyOf = (o: Obj, n: number): number => o.ay * n + o.ax;

// ------------------------------------------------------------
// 注册表
// ------------------------------------------------------------

export class CitizenRegistry {
  roster: Citizen[] = [];
  /** 累计落户人次（成就口径；含本城出生） */
  total = 0;
  /** v15 信箱（新信在前由 mailView 负责；这里按时间序追加） */
  letters: Letter[] = [];
  /** v30 书信合集：所有来过的信永存于此（信箱满八封挤出已读旧信后，合集是唯一的去处） */
  anth: MailArc[] = [];
  /** v15 累计回信数（成就口径） */
  replyCount = 0;
  private nextId = 1;
  private lastPop = 0;
  private evTimer = 12;
  private mailTimer = 26;          // 首封信来得早些，让玩家尽快见到新玩法
  private nextLetterId = 1;
  private nextFam = 1;
  /** v22 累计升学人次（成就口径） */
  gradTotal = 0;
  /** v26 累计本城出生数（成就口径：生生不息） */
  bornN = 0;
  /** v26 累计长大成人人次（成就口径：长大成人） */
  grownN = 0;
  /** v26 累计安详离世数（城市志「生民列传」行） */
  passedN = 0;
  /** v26 享年 90+ 离世数（成就口径：含笑而归） */
  passed90N = 0;
  /** v26 已故市民 id 登记簿（famOf 区分「已故」与「迁居」；随档保存） */
  passedIds = new Set<number>();
  /** v26 生日巡检计时（45-60s 全册扫描） */
  private bdayTimer = 40;
  /** v26 高寿离世回调（tycoon 接线 → 编年史「寿星安眠」） */
  onPass: ((name: string, age: number) => void) | null = null;
  private lastCtx: CitzCtx = { pop: 0, happiness: 60, taxRate: 8, season: 0, famine: 0, events: [], fest: -1, smog: 0, dark: 0, waste: 0, eduOut: 0, crime: 0, fireOut: 0, medOut: 0 };
  private lastT = 0;
  /** 消息回调（tycoon.msg 接线） */
  onMsg: ((s: string) => void) | null = null;

  reset(): void {
    this.roster = [];
    this.total = 0;
    this.letters = [];
    this.anth = [];
    this.replyCount = 0;
    this.nextId = 1;
    this.lastPop = 0;
    this.evTimer = 12;
    this.mailTimer = 26;
    this.nextLetterId = 1;
    this.nextFam = 1;
    this.gradTotal = 0;
    this.bornN = 0;
    this.grownN = 0;
    this.passedN = 0;
    this.passed90N = 0;
    this.passedIds = new Set();
    this.bdayTimer = 40;
  }

  /** 存档恢复后对齐人口基线（避免读档误触发「迁入」） */
  baseline(pop: number): void { this.lastPop = pop; }

  // ---------------- 迁入 / 搬离 ----------------

  private addCitizen(map: CityMap, ctx: CitzCtx, t: number): Citizen {
    const gender: 0 | 1 = Math.random() < 0.5 ? 0 : 1;
    const body: 0 | 1 | 2 = Math.random() < 0.14 ? 2 : (Math.random() < 0.16 ? 1 : 0);
    const age = body === 1 ? 6 + (Math.random() * 10 | 0)
      : body === 2 ? 62 + (Math.random() * 22 | 0)
      : 19 + (Math.random() * 40 | 0);
    const street = rnd(STREETS);
    const n = map.n;
    // 住所：随机住宅建筑
    const homes = [...map.objs.values()].filter(o => o.id in HOMES);
    const home = homes.length ? rnd(homes) : null;
    // 职场：随机可工作建筑（儿童/学生与退休者除外）
    let work: Obj | null = null;
    let job = '';
    if (body === 1) {
      job = '小学学生';
    } else if (body === 2) {
      job = rnd(['退休长者', '社区顾问', '棋摊常客']);
    } else {
      const works = [...map.objs.values()].filter(o => o.id in JOBS);
      work = works.length ? rnd(works) : null;
      job = work ? JOBS[work.id] : rnd(['自由职业者', '夜市摊主', '手艺人', '网约司机']);
    }
    const role: Role = body === 1 ? 3 : (work && JOB_ROLE[work.id] !== undefined ? JOB_ROLE[work.id] : 0);
    const trait = rnd(TRAITS);
    const c: Citizen = {
      id: this.nextId++,
      name: rnd(SURNAMES) + rnd(gender === 0 ? GIVEN_M : GIVEN_F),
      gender, age,
      look: (Math.random() * 14) | 0,
      body, role, job,
      trait: trait.name, traitMood: trait.mood,
      hobby: rnd(HOBBIES), origin: rnd(ORIGINS),
      homeKey: home ? keyOf(home, n) : -1,
      homeName: home ? `${HOMES[home.id]} · ${street} ${1 + (Math.random() * 99 | 0)} 号` : `出租屋 · ${street}`,
      homeAt: home ? [home.ax, home.ay] : null,
      workKey: work ? keyOf(work, n) : -1,
      workName: work ? JOBS[work.id] : job,
      workAt: work ? [work.ax, work.ay] : null,
      mood: clamp(ctx.happiness + trait.mood, 5, 100),
      since: t,
      fam: 0, spouse: 0, pa: 0, ma: 0,   // v15 家族谱系：落户时子然一身
      edu: body === 1 ? 0 : 1 + (Math.random() < 0.5 ? 1 : 0),   // v22 迁入学历：儿童蒙童 / 成人与长者自带初小~高小
      bio: '',
      log: [],
    };
    c.bio = body === 2
      ? `${c.age} 岁的${c.trait}长者，从${c.origin}投奔儿女迁来。${c.hobby}是一辈子的心头好。`
      : body === 1
        ? `${c.age} 岁的${c.trait}孩子，随家人从${c.origin}迁来，最爱${c.hobby}。`
        : `${c.age} 岁的${c.trait}${c.gender === 0 ? '小伙' : '姑娘'}，从${c.origin}迁来。${c.hobby}是心头好。`;
    c.log.push({ t, text: `拖着行李在市政厅前登记落户，正式成为本市市民` });
    if (work) c.log.push({ t, text: `在「${JOBS[work.id]}」岗位上谋得了生计` });
    this.roster.push(c);
    this.total++;
    if (this.roster.length > ROSTER_MAX) this.roster.shift();
    return c;
  }

  private removeCitizen(reason: string, t: number): void {
    if (this.roster.length <= 6) return;   // 名人册保底，避免反复增删
    const i = (Math.random() * this.roster.length) | 0;
    const c = this.roster[i];
    this.roster.splice(i, 1);
    this.onMsg?.(`${c.name}（${c.job}）${reason} —— 街坊们送了一程`);
    void t;
  }

  // ---------------- 心跳 ----------------

  tick(dt: number, map: CityMap, ctx: CitzCtx, t: number): void {
    // 人口迁移联动：增长落户 / 流失搬离
    const dPop = ctx.pop - this.lastPop;
    if (dPop >= POP_PER_CITZ) {
      this.lastPop = ctx.pop;
      const c = this.addCitizen(map, ctx, t);
      if (this.roster.length <= 6 || Math.random() < 0.4) {
        this.onMsg?.(`新市民落户：${c.name}（${c.job}）安家${c.homeName.split(' · ')[0]}`);
      }
    } else if (dPop <= -POP_PER_CITZ) {
      this.lastPop = ctx.pop;
      if (ctx.famine) this.removeCitizen('受不住饥荒举家迁走', t);
      else if (ctx.happiness < 35) this.removeCitizen('嫌日子太苦悄悄搬走了', t);
    } else {
      this.lastPop = Math.max(this.lastPop, ctx.pop);   // 缓慢回落不触发
    }

    // 心情漂移：向「城市幸福 + 性格修正」靠拢
    const target = clamp(ctx.happiness + (ctx.famine ? -18 : 0), 5, 100);
    for (const c of this.roster) {
      const tg = clamp(target + c.traitMood, 5, 100);
      c.mood += (tg - c.mood) * Math.min(1, dt * 0.03);
    }

    // 生活大事记：每 14-26 秒一位市民遇到人生事件
    this.evTimer -= dt;
    if (this.evTimer <= 0) {
      this.evTimer = 14 + Math.random() * 12;
      if (this.roster.length) this.lifeEvent(map, t);
    }

    // v26 生日巡检：全册扫描，每位 25% 概率过一岁（整十岁写史册；阶段流转与离世判定挂此后）
    this.bdayTimer -= dt;
    if (this.bdayTimer <= 0) {
      this.bdayTimer = 45 + Math.random() * 15;
      for (const c of [...this.roster]) {
        if (Math.random() < 0.25) this.birthday(c, map, t);
      }
    }

    // v15 市长信箱：每 40-70 秒一封新信（先挤掉最旧的已读；全未读则暂不送信）
    this.lastCtx = ctx;
    this.lastT = t;
    this.mailTimer -= dt;
    if (this.mailTimer <= 0) {
      this.mailTimer = 40 + Math.random() * 30;
      this.maybeLetter();
    }
  }

  /** 随机一位市民的随机人生事件（写入大事记） */
  private lifeEvent(map: CityMap, t: number): void {
    const c = rnd(this.roster);
    const roll = Math.random();
    // v22 升学：学区内住所得天独厚（学堂就在街口），蒙童→初小→高小→大学
    //   （条件不满足自然落入后续分支：无学区时生活事件维持原节奏）
    if (roll < 0.15 && c.edu < 3 && c.homeAt && this.lastCtx.inEdu &&
        this.lastCtx.inEdu(c.homeAt[0], c.homeAt[1])) {
      c.edu++;
      this.gradTotal++;
      this.pushLog(c, t, c.edu === 3
        ? `考取了大学，成了巷子里第一个大学生，门口挂了红绸`
        : `升入${EDU_NAMES[c.edu]}，先生夸他字写得周正`);
      c.mood = clamp(c.mood + 6, 5, 100);
      return;
    }
    if (roll < 0.16 && c.body === 0) {
      this.pushLog(c, t, `升任领班加了薪，请全屋人吃了顿烧鸟`);
      c.mood = clamp(c.mood + 8, 5, 100);
    } else if (roll < 0.30 && c.body === 0) {
      // v15 真实成婚：与在册另一位单身成人结为夫妇（异性优先），双方档案互指
      this.marry(c, t);
    } else if (roll < 0.40 && c.body === 0) {
      // v15 真实添丁：已婚（配偶在册）→ 新生儿入册随父姓
      this.born(c, t);
    } else if (roll < 0.50) {
      // 乔迁：换一处住所
      const homes = [...map.objs.values()].filter(o => o.id in HOMES);
      if (homes.length) {
        const h = rnd(homes);
        c.homeKey = keyOf(h, map.n);
        c.homeName = `${HOMES[h.id]} · ${rnd(STREETS)} ${1 + (Math.random() * 99 | 0)} 号`;
        c.homeAt = [h.ax, h.ay];
        this.pushLog(c, t, `乔迁新居：搬进了${HOMES[h.id]}`);
        c.mood = clamp(c.mood + 6, 5, 100);
      }
    } else if (roll < 0.60 && c.body === 0) {
      const works = [...map.objs.values()].filter(o => o.id in JOBS && o.id !== 'cityhall');
      if (works.length) {
        const w = rnd(works);
        c.workKey = keyOf(w, map.n);
        c.workAt = [w.ax, w.ay];
        c.job = JOBS[w.id];
        c.workName = c.job;
        if (JOB_ROLE[w.id] !== undefined) c.role = JOB_ROLE[w.id];
        this.pushLog(c, t, `换了份工作：改行当「${c.job}」`);
      }
    } else if (roll < 0.70) {
      this.pushLog(c, t, rnd([
        `收养了一只蹭饭的流浪猫，取名「煤球」`,
        `阳台的小番茄丰收了，给邻居们挨家挨户送`,
        `在旧书摊淘到一本绝版画册，高兴了一整天`,
        `参加社区合唱团，被夸有副好嗓子`,
        `中了杂货店抽奖的头奖：一箱汽水`,
        `带孩子去坐了趟新电车，全程趴在车窗上`,
      ]));
      c.mood = clamp(c.mood + 5, 5, 100);
    } else if (roll < 0.80 && c.age >= 58) {
      this.pushLog(c, t, `办了退休手续，把工具箱送给了徒弟`);
      c.job = '退休长者';
      c.workKey = -1;
      c.workName = '退休';
      c.workAt = null;
    } else if (roll < 0.90) {
      this.pushLog(c, t, rnd([
        `在公园长椅上晒了一下午太阳，什么也没干`,
        `深夜加班回家，便利店关东煮的师傅多送了一块萝卜`,
        `雨季来临前把屋顶翻修了一遍`,
        `给远方亲戚写了封八页长的信`,
      ]));
    } else {
      c.age++;
      this.pushLog(c, t, c.age >= 60 ? `过了${c.age}岁大寿，社区送了一块寿桃糕` : `生日那天吃了碗长寿面，又长了一岁`);
    }
  }

  private pushLog(c: Citizen, t: number, text: string): void {
    c.log.push({ t: Math.round(t), text });
    if (c.log.length > LOG_MAX) c.log.splice(0, c.log.length - LOG_MAX);
  }

  // ---------------- v26 生命周期：含饴弄孙·四季人生 ----------------

  /** 成人礼岁数（懒生成：本城出生 15-16 / 迁入儿童 16-18） */
  private growAgeOf(c: Citizen): number {
    if (!c.growAge || c.growAge < 15) {
      c.growAge = c.origin === '本城出生' ? 15 + (Math.random() * 2 | 0) : 16 + (Math.random() * 3 | 0);
    }
    return c.growAge;
  }

  /** 过一岁：age++ → 阶段流转 → 耆耋离世判定 → 整十岁入史册 */
  private birthday(c: Citizen, map: CityMap, t: number): void {
    c.age = Math.min(120, c.age + 1);
    this.stage(c, map, t);
    // 耄耋安眠：82 岁起每岁 8%，95 岁必然（在册太少时保护不住不动）
    if (c.body === 2 && c.age >= 82 && (c.age >= 95 || Math.random() < 0.08)) {
      if (this.passAway(c, t)) return;
    }
    // 整十岁写史册（普通岁静默，免刷爆滑窗）
    if (c.age % 10 === 0) {
      this.pushLog(c, t, c.age >= 60
        ? `过了${c.age}岁大寿，社区送了一块寿桃糕`
        : `${c.age} 岁生日那天吃了碗长寿面，巷口的小伙伴都来了`);
    }
  }

  /** 阶段流转（生日后判定；while 循环支持一次跨多段，如 +25 岁直推）。
   *  返回流转序列（toddler/school/adult/elder），供测试断言 */
  private stage(c: Citizen, map: CityMap | null, t: number): string[] {
    const ev: string[] = [];
    for (;;) {
      if (c.body === 1) {
        if (c.job === '襁褓婴儿' && c.age >= 3) {
          c.job = '垂髫小儿';
          this.pushLog(c, t, '褪了襁褓，满巷子疯跑，见了电车要追着数车厢');
          this.updateBio(c);
          ev.push('toddler');
          continue;
        }
        if ((c.job === '襁褓婴儿' || c.job === '垂髫小儿') && c.age >= 7) {
          c.job = '小学学生';
          const inEdu = c.homeAt && this.lastCtx.inEdu && this.lastCtx.inEdu(c.homeAt[0], c.homeAt[1]);
          this.pushLog(c, t, inEdu
            ? '背上书包进了街口的小学，作业本得了三朵小红花'
            : '上学要翻半座城，天不亮就出门，书包里揋着烤红薯');
          this.updateBio(c);
          ev.push('school');
          continue;
        }
        if (c.age >= this.growAgeOf(c)) {
          this.riteOfAge(c, map, t);
          ev.push('adult');
          continue;
        }
      } else if (c.body === 0 && c.age >= 60) {
        this.elderOfAge(c, t);
        ev.push('elder');
        continue;
      }
      break;
    }
    return ev;
  }

  /** 成人礼：body 1→0、按学历择业（大学 → 白领池优先）、制服/速写重写 */
  private riteOfAge(c: Citizen, map: CityMap | null, t: number): void {
    c.body = 0;
    // 择业：在册可工作建筑中抽（大学学历优先白领岗；无岗则自由职业）
    const EDU_JOBS = ['office', 'tower', 'electown', 'library', 'school', 'observatory'];
    let pool = map ? [...map.objs.values()].filter(o => o.id in JOBS && o.id !== 'cityhall') : [];
    if (c.edu >= 3) {
      const hi = pool.filter(o => EDU_JOBS.includes(o.id));
      if (hi.length) pool = hi;
    }
    const w = pool.length ? rnd(pool) : null;
    if (w) {
      c.workKey = keyOf(w, (map as CityMap).n);
      c.workAt = [w.ax, w.ay];
      c.job = JOBS[w.id];
      c.workName = c.job;
      c.role = JOB_ROLE[w.id] !== undefined ? JOB_ROLE[w.id] : 0;
    } else {
      c.job = rnd(['自由职业者', '夜市摊主', '手艺人', '网约司机']);
      c.workKey = -1;
      c.workName = c.job;
      c.workAt = null;
      c.role = 0;
    }
    this.pushLog(c, t, '行完成人礼，巷口的婶婶们都来道贺，灶上炖了一锅红烧肉');
    this.pushLog(c, t, w
      ? `在「${c.job}」谋得第一份生计，领了半个月工钱`
      : '先在街坊的铺子里帮工，攒着本事等机会');
    c.mood = clamp(c.mood + 8, 5, 100);
    this.grownN++;
    this.updateBio(c);
    this.onMsg?.(`${c.name} 长大成人${w ? `，在${c.job}安身` : ''} —— 名人册添了新的一笔`);
  }

  /** 花甲：body 0→2、退休清职、制服归零（警/医/消制服换回便服） */
  private elderOfAge(c: Citizen, t: number): void {
    c.body = 2;
    if (c.workKey >= 0) {
      this.pushLog(c, t, '办了退休手续，把用了半辈子的工具箱送给了徒弟');
      c.workKey = -1;
      c.workAt = null;
    }
    c.job = '退休长者';
    c.workName = '退休';
    if (c.role === 1 || c.role === 6 || c.role === 7) c.role = 0;
    this.pushLog(c, t, '步入花甲，如今是巷口棋摊的常客，蒲扇一摘就是半下午');
    c.mood = clamp(c.mood + 5, 5, 100);
    this.updateBio(c);
  }

  /** 安详离世：移册 + 登记故人簿 + 配偶/子女史册 + 喖告。返回 false = 在册太少受保护 */
  private passAway(c: Citizen, t: number): boolean {
    if (this.roster.length <= 6) return false;
    const i = this.roster.findIndex(x => x.id === c.id);
    if (i < 0) return false;
    this.roster.splice(i, 1);
    this.passedIds.add(c.id);
    this.passedN++;
    if (c.age >= 90) this.passed90N++;
    // 在世配偶：丧偶之痛写入史册
    if (c.spouse) {
      const s = this.roster.find(x => x.id === c.spouse);
      if (s) {
        this.pushLog(s, t, '老伴先走了一步，家里静了许多，巷口的老槐树都跟着没了精神');
        s.mood = clamp(s.mood - 15, 5, 100);
      }
    }
    // 子女至多两位：写先人追思
    const kids = this.roster.filter(x => x.pa === c.id || x.ma === c.id).slice(0, 2);
    for (const k of kids) {
      this.pushLog(k, t, c.gender === 0
        ? '父亲走了，把那块旧怀表留给了我'
        : '母亲走了，针线簸箩还摆在窗台上');
      k.mood = clamp(k.mood - 10, 5, 100);
    }
    this.onMsg?.(`${c.name} 在睡梦中安然离世，享年 ${c.age} 岁 —— 街坊们送了一程`);
    this.onPass?.(c.name, c.age);
    return true;
  }

  /** v26 速写重写：随生命阶段更新（垂髫/学生/成人已婚/成人未婚/长者） */
  private updateBio(c: Citizen): void {
    if (c.body === 1) {
      if (c.job === '襁褓婴儿') return;   // 保留出生时的第一代措辞
      if (c.job === '垂髫小儿') {
        c.bio = '在巷子里疯跑长大的娃，口袋里常年揣着玻璃弹珠，街坊都认得这个小捣蛋。';
        return;
      }
      c.bio = '背着书包上学堂的孩子，放学路上总在道口数电车车厢，作业本得了三朵小红花。';
      return;
    }
    if (c.body === 2) {
      const s = c.spouse ? this.roster.find(x => x.id === c.spouse) : undefined;
      c.bio = s
        ? `${c.age} 岁的${c.trait}长者，与${s.name}相守到白头，${c.hobby}是一辈子的心头好，巷口棋摊上总缺不了这位老街坊。`
        : `${c.age} 岁的${c.trait}长者，${c.hobby}是一辈子的心头好，巷口棋摊上总缺不了这位老街坊。`;
      return;
    }
    // 成人：本城长大与迁入措辞区分；已婚者提配偶；大学者提学历
    const born = c.origin === '本城出生';
    const s = c.spouse ? this.roster.find(x => x.id === c.spouse) : undefined;
    c.bio = s
      ? `${c.age} 岁的${c.trait}${c.gender === 0 ? '小伙' : '姑娘'}，${born ? '在这座城里出生长大' : `从${c.origin}迁来`}，与${s.name}相守度日，${c.hobby}是心头好。`
      : `${c.age} 岁的${c.trait}${c.gender === 0 ? '小伙' : '姑娘'}，${born ? '在这座城里出生长大' : `从${c.origin}迁来`}${c.edu >= 3 ? '，还是巷子里第一个大学生' : ''}，${c.hobby}是心头好。`;
  }

  /** v26 传记第四段「评」：街坊口碑收束语（心情三档 × 长者/有家加成） */
  private comment(c: Citizen): string {
    if (c.body === 1) return '是全巷子街坊的心尖尖';
    let s: string;
    if (c.mood >= 75) s = c.gender === 0 ? '提起他，街坊没有不竖大拇指的' : '提起她，街坊没有不竖大拇指的';
    else if (c.mood >= 50) s = '日子过得平顺，跟谁家都处得和睦';
    else s = '这阵子眉头不大舒展，街坊看在眼里、记在心里';
    const kids = this.roster.filter(x => x.pa === c.id || x.ma === c.id).length;
    if (c.spouse && kids > 0 && c.mood >= 50) s += '，一家子日子过得热气腾腾';
    if (c.body === 2) s += c.mood >= 50 ? '，是巷口公认的老福星' : '，街坊都盼着他打起精神';
    return s;
  }

  // ---------------- v15 家族谱系 ----------------

  /** 成婚：在册找单身成人（异性优先）结为夫妇；找不到则按旧文案外市成婚 */
  private marry(c: Citizen, t: number): boolean {
    if (c.body !== 0 || c.spouse) return false;
    const mate = this.roster.find(x => x.id !== c.id && x.body === 0 && !x.spouse && x.gender !== c.gender)
      ?? this.roster.find(x => x.id !== c.id && x.body === 0 && !x.spouse);
    if (mate) {
      c.spouse = mate.id;
      mate.spouse = c.id;
      const fam = c.fam || mate.fam || this.nextFam++;
      c.fam = fam;
      mate.fam = fam;
      this.pushLog(c, t, `与${mate.name}喜结连理，整条街坊都来喝了喜酒`);
      this.pushLog(mate, t, `与${c.name}在市政厅前拍了结婚照，巷口的狸花猫都来凑热闹`);
      c.mood = clamp(c.mood + 14, 5, 100);
      mate.mood = clamp(mate.mood + 14, 5, 100);
      this.updateBio(c);
      this.updateBio(mate);
      this.onMsg?.(`喜结连理：${c.name} 与 ${mate.name} 成婚，街坊同贺`);
      return true;
    }
    const names = rnd(GIVEN_F.concat(GIVEN_M));
    this.pushLog(c, t, `与青梅竹马${rnd(SURNAMES)}${names}成婚，街坊送来一篮子鸡蛋`);
    c.mood = clamp(c.mood + 12, 5, 100);
    return false;
  }

  /** 添丁：配偶在册 → 新生儿真实入册（随父姓·记父母·继承家族号） */
  private born(c: Citizen, t: number): boolean {
    if (c.body !== 0) return false;
    const mate = c.spouse ? this.roster.find(x => x.id === c.spouse) : undefined;
    if (!mate) {
      this.pushLog(c, t, `家里添了丁，取了个乳名叫「小满」`);
      return false;
    }
    const baby = this.addNewborn(c, mate, t);
    this.pushLog(c, t, `家里添了新丁：${baby.name}，全家喜上眉梢`);
    this.pushLog(mate, t, `迎来了${baby.name}的降生，产房外笑得合不拢嘴`);
    c.mood = clamp(c.mood + 10, 5, 100);
    mate.mood = clamp(mate.mood + 10, 5, 100);
    this.onMsg?.(`添丁之喜：${c.name} 家添了新成员 ${baby.name}，本城出生`);
    return true;
  }

  /** 新生儿入册：随父姓、记父母、住所同家、继承家族号 */
  private addNewborn(a: Citizen, b: Citizen, t: number): Citizen {
    const pa = a.gender === 0 ? a : b;
    const ma = a.gender === 0 ? b : a;
    const gender: 0 | 1 = Math.random() < 0.5 ? 0 : 1;
    const c: Citizen = {
      id: this.nextId++,
      name: pa.name[0] + rnd(gender === 0 ? GIVEN_M : GIVEN_F),
      gender,
      age: 0,
      look: (Math.random() * 14) | 0,
      body: 1, role: 3, job: '襁褓婴儿',
      trait: '天真烂漫', traitMood: 8,
      hobby: '被抱着看电车驶过',
      origin: '本城出生',
      homeKey: a.homeKey,
      homeName: a.homeName,
      homeAt: a.homeAt ? [a.homeAt[0], a.homeAt[1]] : null,
      workKey: -1, workName: '', workAt: null,
      mood: clamp((a.mood + b.mood) / 2 + 12, 5, 100),
      since: t,
      fam: a.fam || b.fam || this.nextFam++,
      spouse: 0, pa: pa.id, ma: ma.id,
      edu: 0,   // v22 新生儿从蒙童读起（本城出生的第一代读书人）
      bio: `在这座城市出生的第一代孩子，第一声啼哭混在电车铃声里。街坊都说这娃有福气。`,
      log: [],
    };
    c.log.push({ t: Math.round(t), text: `在${c.homeName.split(' · ')[0]}呱呱坠地，是本城土生土长的小市民` });
    this.roster.push(c);
    this.total++;
    this.bornN++;   // v26 本城出生计数（成就：生生不息）
    if (this.roster.length > ROSTER_MAX) this.roster.shift();
    return c;
  }
  /** 家人卡片：配偶 / 子女 / 父母（v26 不在册 → 区分「已迁居」与「已故」） */
  private famOf(c: Citizen): FamCard[] {
    const out: FamCard[] = [];
    const byId = (id: number): Citizen | undefined => this.roster.find(x => x.id === id);
    if (c.spouse) {
      const s = byId(c.spouse);
      out.push(s
        ? { id: s.id, name: s.name, rel: '配偶', mood: Math.round(s.mood), here: true }
        : this.passedIds.has(c.spouse)
          ? { id: c.spouse, name: '故人', rel: '故人', mood: 0, here: false, gone: 'passed', note: '已故 · 相守到老' }
          : { id: c.spouse, name: '外城', rel: '配偶', mood: 0, here: false, gone: 'moved', note: '已迁居别城' });
    }
    for (const x of this.roster) {
      if (x.pa === c.id || x.ma === c.id) {
        out.push({ id: x.id, name: x.name, rel: '子女', mood: Math.round(x.mood), here: true });
      }
    }
    if (c.pa) {
      const p = byId(c.pa);
      out.push(p
        ? { id: p.id, name: p.name, rel: '父亲', mood: Math.round(p.mood), here: true }
        : this.passedIds.has(c.pa)
          ? { id: c.pa, name: '', rel: '先父', mood: 0, here: false, gone: 'passed', note: '已故 · 恩情常在' }
          : { id: c.pa, name: '', rel: '父亲', mood: 0, here: false, gone: 'moved', note: '已迁居别城' });
    }
    if (c.ma) {
      const m = byId(c.ma);
      out.push(m
        ? { id: m.id, name: m.name, rel: '母亲', mood: Math.round(m.mood), here: true }
        : this.passedIds.has(c.ma)
          ? { id: c.ma, name: '', rel: '先母', mood: 0, here: false, gone: 'passed', note: '已故 · 恩情常在' }
          : { id: c.ma, name: '', rel: '母亲', mood: 0, here: false, gone: 'moved', note: '已迁居别城' });
    }
    return out;
  }

  // ---------------- 城市事件反应 ----------------

  /** 城市事件发生时：随机市民的日志反应 + 心情波动 */
  onCityEvent(key: string, t: number): void {
    if (!this.roster.length) return;
    const pick = (): Citizen => rnd(this.roster);
    const react = (c: Citizen, text: string, dm: number): void => {
      this.pushLog(c, t, text);
      c.mood = clamp(c.mood + dm, 5, 100);
    };
    switch (key) {
      case 'fire': {
        react(pick(), `亲眼目睹了那场大火，半宿没睡好`, -10);
        break;
      }
      case 'plague': {
        react(pick(), `全家熬过了那场疫病，逢人就夸医护`, -6);
        break;
      }
      case 'boom': case 'tourseason': {
        react(pick(), `游客潮里支了个茶水摊，小赚了一笔`, +6);
        break;
      }
      case 'festival': {
        react(pick(), `在街头艺术节上买到了孩子最爱的糖画`, +7);
        break;
      }
      case 'harvest': {
        react(pick(), `丰收节抢到了头一茬新米，煮了锅焦香锅巴`, +5);
        break;
      }
      case 'bullmkt': {
        react(pick(), `趁着出口牛市把囤货卖了好价钱`, +6);
        break;
      }
      case 'invest': {
        react(pick(), `新项目开工那天去围观了剪彩，领了纪念毛巾`, +4);
        break;
      }
      case 'blackout': {
        react(pick(), `停电那晚全楼到天台乘凉，倒是看了场星星`, -3);
        break;
      }
      case 'storm': {
        react(pick(), `暴雨天抢收阳台的衣服，还是湿了半箱`, -5);
        break;
      }
      case 'tradewar': {
        react(pick(), `货运站冷清了不少，同行都在议论关税`, -4);
        break;
      }
      // ---- v18 灾害链：地震 / 洪水 ----
      case 'quake': {
        react(pick(), `地震那晚抱着存折蹲在桌下，天亮后第一件事是去查看家里的裂缝`, -12);
        break;
      }
      case 'flood': {
        react(pick(), `洪水退去后和邻居们一起清了三条街的淤泥`, -9);
        break;
      }
      case 'scandal': {
        react(pick(), `去市政厅递了意见书，附了按满手印的联名信`, -6);
        break;
      }
      // ---- v23 治安：店铺失窃 ----
      case 'crime': {
        react(pick(), `亲眼看见蒙面人从隔壁铺子后窗翻出来，报了警`, -7);
        break;
      }
      // ---- v40 名人堂：民意荐贤 ----
      case 'hallnom': {
        react(pick(), `被街坊们联名荐上了名人堂光荣榜，走路都带风`, +8);
        break;
      }
      // ---- v41 轨道时代：信号故障 / 通勤高峰 ----
      case 'signal': {
        react(pick(), `地铁信号故障那天改挤巴士，迟到了半小时`, -3);
        break;
      }
      case 'metrorush': {
        react(pick(), `早高峰的地铁里人贴人，可总算没迟到`, +3);
        break;
      }
      // ---- v16 城市节庆：开幕式 / 落幕 ----
      case 'fest0': {
        react(pick(), `在樱花祭的樱树下拍了全家福`, +8);
        break;
      }
      case 'fest1': {
        react(pick(), `在花火大会上跟着人群欢呼，许了个愿`, +8);
        break;
      }
      case 'fest2': {
        react(pick(), `丰收节上搬回了半袋新米和一坛好酒`, +7);
        break;
      }
      case 'fest3': {
        react(pick(), `暖灯节给孩子买了盏兔子灯，提了一路`, +8);
        break;
      }
      case 'festend': {
        react(pick(), `节日散场，把彩带别在了日记本里`, +3);
        break;
      }
      default: break;
    }
  }

  /** 应急处置成功（消防/急救/擒贼）：市民点赞
   *  v23：police → 警官英雄（制服 role 1）入册 */
  onRescue(kind: 'fire' | 'plague' | 'police', t: number): void {
    if (!this.roster.length) return;
    const heroRole = kind === 'fire' ? 7 : kind === 'police' ? 1 : 6;
    const hero = this.roster.find(c => c.role === heroRole);
    if (hero) this.pushLog(hero, t, kind === 'fire'
      ? `参与扑救大火，被评为本周城市之星`
      : kind === 'police'
        ? `连夜出警人赃并获，商户们送来了锦旗`
        : `连夜出诊处置疫情，居民送来了锦旗`);
    for (const c of this.roster) c.mood = clamp(c.mood + 4, 5, 100);
  }

  /** v24 火灾亲历者写入个人史册（传记空间化：事件不再只是全城广播，而是落在具体人家的记忆里）。
   *  起火建筑锤点同格/相邻（homeAt 距 ≤1）＝受灾住户：「家中失火」心情 −12；
   *  三格内街坊（≤3）＝目击者：「隔壁街区失火」心情 −6。
   *  spread = true 为蔓延新灾点（火头蹿到自家门口的措辞） */
  onFireAt(x: number, y: number, t: number, spread: boolean): void {
    let hitHome = 0, hitNear = 0;
    for (const c of this.roster) {
      if (!c.homeAt) continue;
      const d = Math.max(Math.abs(c.homeAt[0] - x), Math.abs(c.homeAt[1] - y));
      if (d <= 1) {
        this.pushLog(c, t, spread
          ? '火头蹿到了自家门口，抢出来的行李还烫手'
          : '家中失火，半条街的邻居都提着水桶来帮忙');
        c.mood = clamp(c.mood - 12, 5, 100);
        hitHome++;
      } else if (d <= 3) {
        this.pushLog(c, t, spread
          ? '看见火光又亮起一条街，心里直发紧'
          : '隔壁街区失火，整条巷子的窗都映得通红');
        c.mood = clamp(c.mood - 6, 5, 100);
        hitNear++;
      }
    }
    if (hitHome + hitNear > 0 && this.onMsg) {
      this.onMsg(`火灾亲历者：${hitHome} 位住户受灾、${hitNear} 位街坊目击 —— 都写进了他们的史册`);
    }
  }

  /** v24 火场获救感恩：当前火点建筑的住户写「消防员把家保住了」（心情 +10） */
  onFireSaved(x: number, y: number, t: number): void {
    for (const c of this.roster) {
      if (!c.homeAt) continue;
      if (Math.max(Math.abs(c.homeAt[0] - x), Math.abs(c.homeAt[1] - y)) <= 1) {
        this.pushLog(c, t, '消防员从火里把家保住了，这份恩情记一辈子');
        c.mood = clamp(c.mood + 10, 5, 100);
      }
    }
  }

  /** v25 窃案亲历者写入个人史册（与 onFireAt 对称：事件落在具体人身上）。
   *  职场锤点同格（workAt 距 ≤1）＝ 失窃店主：「后窗被撬」心情 −12；
   *  三格内街坊（≤3）＝ 目击街坊：「听说遭了贼」心情 −6。 */
  onCrimeAt(x: number, y: number, t: number): void {
    let hitShop = 0, hitNear = 0;
    for (const c of this.roster) {
      if (!c.workAt) continue;
      const d = Math.max(Math.abs(c.workAt[0] - x), Math.abs(c.workAt[1] - y));
      if (d <= 1) {
        this.pushLog(c, t, '铺子后窗被撬了个大洞，一季的货款没了着落');
        c.mood = clamp(c.mood - 12, 5, 100);
        hitShop++;
      } else if (d <= 3) {
        this.pushLog(c, t, '听说隔壁街的铺子遭了贼，夜里把门窗栓了又栓');
        c.mood = clamp(c.mood - 6, 5, 100);
        hitNear++;
      }
    }
    if (hitShop + hitNear > 0 && this.onMsg) {
      this.onMsg(`窃案亲历者：${hitShop} 位店主报了警、${hitNear} 位街坊议论纷纷 —— 都写进了他们的史册`);
    }
  }

  /** v25 失窃追回感恩：失窃商铺的店主写「货款如数追回」（心情 +10） */
  onCrimeSaved(x: number, y: number, t: number): void {
    for (const c of this.roster) {
      if (!c.workAt) continue;
      if (Math.max(Math.abs(c.workAt[0] - x), Math.abs(c.workAt[1] - y)) <= 1) {
        this.pushLog(c, t, '警笛未落人赃并获，货款如数追回 —— 这座城有安全感');
        c.mood = clamp(c.mood + 10, 5, 100);
      }
    }
  }

  /** v36 疫病亲历者写入个人史册（与 onFireAt/onCrimeAt 对称：疫落在具体人家的记忆里）。
   *  疫点住宅锤点同格/相邻（homeAt 距 ≤1）＝病倒住户：「家人病倒」心情 −12；
   *  三格内街坊（≤3）＝隔离街坊：「巷里有人病倒」心情 −6。 */
  onPlagueAt(x: number, y: number, t: number): void {
    let hitHome = 0, hitNear = 0;
    for (const c of this.roster) {
      if (!c.homeAt) continue;
      const d = Math.max(Math.abs(c.homeAt[0] - x), Math.abs(c.homeAt[1] - y));
      if (d <= 1) {
        this.pushLog(c, t, '家里有人病倒了，医护上门把全家隔离了个严实');
        c.mood = clamp(c.mood - 12, 5, 100);
        hitHome++;
      } else if (d <= 3) {
        this.pushLog(c, t, '隔壁那条巷有人病倒，这些日子谁也不串门了');
        c.mood = clamp(c.mood - 6, 5, 100);
        hitNear++;
      }
    }
    if (hitHome + hitNear > 0 && this.onMsg) {
      this.onMsg(`疫情亲历者：${hitHome} 户有人病倒、${hitNear} 户自觉隔离 —— 都写进了他们的史册`);
    }
  }

  /** v36 疫点收治感恩：当前疫点住宅的住户写「医护连夜收治」（心情 +10） */
  onPlagueSaved(x: number, y: number, t: number): void {
    for (const c of this.roster) {
      if (!c.homeAt) continue;
      if (Math.max(Math.abs(c.homeAt[0] - x), Math.abs(c.homeAt[1] - y)) <= 1) {
        this.pushLog(c, t, '救护车连夜把病人接走收治，这份恩情记一辈子');
        c.mood = clamp(c.mood + 10, 5, 100);
      }
    }
  }

  // ---------------- 市民之声（街头偶遇） ----------------

  /** 按城市状态挑一句市民心声（面板滚动条/行人偶遇共用） */
  voice(ctx: CitzCtx): { name: string; text: string; mood: number } | null {
    if (!this.roster.length) return null;
    const c = rnd(this.roster);
    const seasonWord = ['春天樱花开得正好', '夏天夜市热闹得很', '秋天满街金桂飘香', '冬天呵气都成霜'][clamp(ctx.season, 0, 3)];
    let text: string;
    // v16 节日心声：庆典进行中优先说节日的开心事（饥荒除外——俄着肚子过不好节）
    const FEST_VOICE: string[][] = [
      ['樱吹雪落了满肩，拍照都拍不过来', '樱花树下野餐，孩子追着花瓣跑'],
      ['烟花在夜空炸开的瞬间，全城都在欢呼', '穿着浴衣去看花火，人山人海'],
      ['新米煮的饭真香，锅巴都抢光了', '粮仓堆得满满当当，今年踏实了'],
      ['长街的灯笼一盏盏亮起来，真暖', '冬夜里喝一碗热汤，提灯看灯去'],
    ];
    if (ctx.famine) text = rnd(['粮价一天一个样，家里米缸快见底了', '菜场的白菜都要抢了，得想想办法']);
    else if (ctx.fest >= 0 && ctx.fest <= 3) text = rnd(FEST_VOICE[ctx.fest]);
    else if (ctx.smog > 0) text = rnd([
      '开窗就是一股呛人的烟味，晒被子的心思都没了',
      '这雾霾天，出门都得捂着口罩送孩子上学',
      '听说市政厅在想办法治污，盼着早点见效',
      '隔壁街区空气好多了 —— 人家那边种了一整排树',
    ]);
    // v20 断电心声：入夜后黑着的那几栋（优先级在雾霾之后：断电可忍，呛人不可忍）
    else if (ctx.dark > 0) text = rnd([
      '昨晚整条巷子黑灯瞎火，蜡烛都翻出来了',
      '家里停了电，冰箱的存货眼看要坏，急死人',
      '听说新区等电网延伸，盼着变电站早点立项',
      '夜里抬头能看见银河了 —— 可我更想要一盏灯',
    ]);
    // v21 环卫心声：巷口垃圾成堆的住户（优先级在断电之后：黑灯可忍，臭气熏天难忍）
    else if (ctx.waste > 0) text = rnd([
      '巷口的垃圾袋堆成了小山，一开窗就是一股酸味',
      '垃圾车说这片不在清运线上，投诉信我都写好了',
      '天一热垃圾就发馊，苍蝇比邻居还熟门熟路',
      '听说回收中心能把垃圾变成钱，盼着早点建到家门口',
    ]);
    // v22 望学心声：孩子上学翻山的住户（优先级在垃圾之后：臭气可忍，误了孩子不可忍）
    else if (ctx.eduOut > 0) text = rnd([
      '孩子上学要走十里山路，天不亮就打着手电出门',
      '咱这片的娃想读书，得寄宿到城那头的亲戚家',
      '联名信都递了三回了，就盼着家门口有所学堂',
      '听说城里在办学，可咱巷子连个小学的影子都没有',
    ]);
    // v23 治安心声：商铺遭贼的街区（优先级在望学之后：误了孩子不可忍，丢了货款也心疼）
    else if (ctx.crime > 0) text = rnd([
      '听说商街那头又有铺子遭了贼，卷帘门都撬开了',
      '夜里巷子黑得渗人，打着手电都不敢走快',
      '派出所说咱这片不在巡防线上，让大伙儿自求多福',
      '隔壁街装了交番之后太平多了，咱这儿啥时候轮上',
    ]);
    // v24 消防心声：水网之外的街区（优先级在治安之后：贼惦记心疼，火烧起来要命）
    else if (ctx.fireOut >= 3) text = rnd([
      '咱这片连个消防栓都没有，冬天烤火都提着心',
      '保险行说巷口没水网，火险保费翻着倍地收',
      '上回邻街着火，消防车绕了半座城才接上水 —— 盼着咱这也铺上栓',
      '孩子们放学路过消防局总要驻脚看，回家问我：咱们街为啥没有红桩子',
    ]);
    // v36 就医心声：医疗盲区的街区（优先级在消防之后：火烧起来要命，病拖下去也麻烦）
    else if ((ctx.medOut ?? 0) >= 3) text = rnd([
      '上个礼拜娃发高烧，抱着他跑了半座城才挂上号',
      '巷口的诊所影子都看不见，老人量个血压都要坐车',
      '听说隔壁街区新建了社区诊所，咱这片啥时候也能有一家',
      '大夫说小病别拖，可咱这儿看个小病比赶集还远',
    ]);
    // v33 衰退心声：市道低迷全城感同（优先级在消防之后：生意难做，比火险保费更常挂嘴边）
    else if (ctx.cyc === 0) text = rnd([
      '这条街的铺子关了两家了，连招牌灯都不亮了',
      '市道不好，工厂订单少了，老伴的编织摊也收了',
      '游客少得可怜，旅馆老板天天在门口踱步',
      '听说隔壁城也差不多 —— 盼着市况早点回暖吧',
    ]);
    // v34 绿茵心声：比赛日全城话题（优先级在市况之后：球赛一来，连市道都能暂时放一放）
    else if (ctx.lg === 1) text = rnd([
      '今天下午体育场有主场，票根我都攥出汗了',
      '街坊约好一起去摇旗，散场再一块儿吃夜宵',
      '客队的大巴都进城了，孩子们追着要签名',
      '今儿铺子提前上了货 —— 比赛日的生意好做',
    ]);
    else if (ctx.lg === 2) text = rnd([
      '昨儿那场赢得漂亮！茶馆里议论了一整晚',
      '孩子们在巷子里学那记远射，摔了一身泥也乐呵',
      '散场的人流把夜市都带火了，摊主乐得合不拢嘴',
      '就冲这股劲儿，这个赛季咱们有戏',
    ]);
    else if (ctx.lg === 3) text = rnd([
      '输了也别垂头，下个主场把面子挣回来',
      '客队那脚任意球是真刁，门将已经尽力了',
      '教练说防守还得再练练 —— 咱们球迷等得起',
      '球场外卖热茶的阿婆说得对：胜败乃兵家常事',
    ]);
    // v35 动物园心声：住户在园时全城都爱去遛弯（优先级在绿茵之后：周末带娃看动物）
    else if ((ctx.zooN ?? 0) > 0) text = rnd([
      '周末带娃去动物园，小家伙在孔雀笼前蹲了一下午',
      '园里那位新住户上瘾了 —— 我上周去了三趟',
      '巡查员说园子越大越体面，动物住的越舒坦来的越多',
      '动物看多了，人都变得心软 —— 这园子是全城的宝贝',
    ]);
    // v41 地铁心声：线网通车后通勤族最先把地铁挂嘴边（优先级在动物园之后：地铁是日常，动物园是周末）
    else if ((ctx.metro ?? 0) >= 2) text = rnd([
      '地铁一站就到公司楼下，早高峰也能多睡十分钟',
      '站口出来就是菜市场，下班顺路把菜买了',
      '末班车回家心里踏实 —— 再晚也不怕打不到车',
      '车厢里总能碰见街坊，地铁把半座城串成了熟人社会',
    ]);
    else if (ctx.taxRate > 12) text = rnd(['税越收越狠，肉摊都少割两斤了', '这税率，攒钱的速度赶不上市政厅收的']);
    else if (ctx.taxRate <= 5) text = rnd(['低税的日子里，钱包都胖了一圈', '市政厅这个月大方，下馆子加了个鸡腿']);
    // v33 繁荣心声：好年景人人都愿意夸两句（排在税后：低税逢繁荣，喜上加喜）
    else if (ctx.cyc === 3) text = rnd([
      '铺子里天天排队，掌柜的笑得合不拢嘴',
      '码头的船一般接一般，装卸工都加班了',
      '街上全是生面孔的游客，问路的都应接不暇',
      '这行情，攒钱的功夫都赶上市道涨的功夫了',
    ]);
    else if (ctx.happiness < 40) text = rnd(['这日子……再看看吧，不行就搬去隔壁城', '唉，晚上都睡不踏实']);
    else if (ctx.happiness > 78) text = rnd(['住在这儿，每天早上都想哼小曲', '街坊处得跟一家人似的，哪也不去']);
    else if (ctx.events.includes('fire')) text = '刚才那场火吓死人了，盼着消防车快些';
    else if (ctx.events.includes('plague')) text = '疫病闹得人心慌，口罩都囤了三包';
    else if (ctx.events.includes('festival')) text = '艺术节那舞台搭得真漂亮，晚上去看';
    else if (ctx.events.includes('tourseason') || ctx.events.includes('boom')) text = '满街都是游客，我的茶摊都排起队了';
    else if (ctx.happiness > 60) text = rnd([`${seasonWord}，${c.hobby}正当时`, '新来的邻居送了碗自家腌的酱菜，真香']);
    else text = rnd([seasonWord + '，日子就这么过吧', '听说城里又要搞新建设了？']);
    return { name: c.name, text, mood: Math.round(c.mood) };
  }

  /** 观察工具点击行人 → 按外观三元组认人（v15）：
   *  在册命中（衣装+体型+制服全等）→ 那位市民本人；
   *  未命中 → 即弃路人卡（guest，不入册）。
   *  无参调用 → 旧行为：随机在册市民。空册返回 null。 */
  spotCard(look?: number, body?: 0 | 1 | 2, role?: Role): CitzCard | null {
    if (!this.roster.length) return null;
    if (look !== undefined && body !== undefined && role !== undefined) {
      const hit = this.roster.filter(c => c.look === look && c.body === body && c.role === role);
      if (hit.length) return this.cardOf(rnd(hit));
      return this.guestCard(look, body, role);
    }
    return this.cardOf(rnd(this.roster));
  }

  /** v15 路人卡：与被点行人同款外观，即弃不入册 */
  private guestCard(look: number, body: 0 | 1 | 2, role: Role): CitzCard {
    const gender: 0 | 1 = Math.random() < 0.5 ? 0 : 1;
    const age = body === 1 ? 6 + (Math.random() * 10 | 0)
      : body === 2 ? 62 + (Math.random() * 22 | 0)
      : 19 + (Math.random() * 40 | 0);
    const job = ROLE_GUEST[role] ?? '路人';
    return {
      id: 0,
      name: rnd(SURNAMES) + rnd(gender === 0 ? GIVEN_M : GIVEN_F),
      gender, age, look, body, role, job,
      trait: '面生', hobby: '逛街看热闹', origin: '远方来客',
      bio: role === 9
        ? `从远方来的旅人，为这座城市的风景停下了脚步。说不定哪天会把家安在这里。`
        : `与这座城市擦肩而过的路人 —— 街坊们说，多来几次就脸熟了。`,
      mood: clamp(this.lastCtx.happiness + (Math.random() * 20 - 10), 5, 100),
      since: 0, guest: true, edu: '说不清',
      homeName: '客栈 / 亲戚家', homeAt: null,
      workName: job, workAt: null,
      log: [],
    };
  }

  /** v15 外观偏置池：行人出生时按此池抽三元组（「街上走的就是本人」） */
  looks(): Array<{ look: number; body: 0 | 1 | 2; role: Role }> {
    return this.roster.map(c => ({ look: c.look, body: c.body, role: c.role }));
  }

  // ---------------- 视图 / 存档 ----------------

  /** v25 人物志：把散落档案合成为连贯小传（详情页「人物志」段落）。
   *  三段成文 —— 根（出身与落脚）/ 家（家世与生计）/ 迹（人生大事时间线转述）。 */
  private biography(c: Citizen): string {
    // 根：出身与落脚
    const homeShort = c.homeName.split(' · ')[0] || '城中寓所';
    const root = `${c.name}，${c.origin}出身的${c.trait}之人，${c.hobby}是心头好。`;
    // 家：家世与生计
    const famBits: string[] = [];
    if (c.spouse) {
      const s = this.roster.find(x => x.id === c.spouse);
      if (s) famBits.push(`与${s.name}结为连理`);
    }
    const kids = this.roster.filter(x => x.pa === c.id || x.ma === c.id);
    if (kids.length) famBits.push(`膝下育有${kids.length >= 3 ? '数名' : (['一名', '两名', '三名', '四名'][kids.length - 1] ?? `${kids.length} 名`)}孩子`);
    if (c.pa || c.ma) famBits.push('父母早年在册');
    const famStr = famBits.length ? famBits.join('，') : '如今孑然一身，街坊就是家人';
    const fam = `迁来后住在${homeShort}${c.workAt ? `，在${c.workName}谋得一份生计` : ''}；${famStr}；学历${EDU_NAMES[c.edu] ?? '蒙童'}。`;
    // 迹：人生大事时间线（相对时序转述；滑窗内旧→新）
    const SEQS = ['落户未久', '其后', '再后来', '又过了些日子', '后来', '再往后', '近年', '最近'];
    const logs = c.log.slice(-LOG_MAX);
    let trail = '';
    if (logs.length) {
      const bits = logs.map((l, i) => `${i < SEQS.length ? SEQS[Math.min(i, SEQS.length - 1)] : '此后'}，${l.text}`);
      trail = `生平记事：${bits.join('；')}。`;
    } else {
      trail = '生平记事：迁来不久，日子还在慢慢铺开。';
    }
    // v26 第四段「评」：街坊口碑收束语 —— 根/家/迹/评，有头有尾才成文章
    return root + fam + trail + `街坊口碑：${this.comment(c)}。`;
  }

  private cardOf(c: Citizen): CitzCard {
    return {
      id: c.id, name: c.name, gender: c.gender, age: c.age,
      look: c.look, body: c.body, role: c.role,
      job: c.job, trait: c.trait, hobby: c.hobby, origin: c.origin,
      bio: c.bio, mood: Math.round(c.mood), since: c.since,
      edu: EDU_NAMES[c.edu] ?? '蒙童',
      story: this.biography(c),
      homeName: c.homeName,
      homeAt: c.homeAt ? { x: c.homeAt[0], y: c.homeAt[1] } : null,
      workName: c.workAt ? c.workName : (c.job === '襁褓婴儿' ? '襁褓中' : c.body === 1 ? '就读于本城学堂' : c.body === 2 ? '含饴弄孙中' : c.workName || '自由职业'),
      workAt: c.workAt ? { x: c.workAt[0], y: c.workAt[1] } : null,
      log: c.log.slice(-6).map(l => ({ ...l })),
      fam: this.famOf(c),
    };
  }

  // ---------------- v15 市长信箱 ----------------

  /** 未读信数 */
  get unread(): number {
    let n = 0;
    for (const l of this.letters) if (!l.read) n++;
    return n;
  }

  /** 信箱视图（新信在前；浅拷贝供 React 渲染） */
  mailView(): MailView {
    return {
      unread: this.unread,
      letters: this.letters.slice().reverse().map(l => ({ ...l, opts: l.opts })),
    };
  }

  /** HUD 徽标用的轻量概要 */
  mailBrief(): { unread: number; n: number } {
    return { unread: this.unread, n: this.letters.length };
  }

  /** 标记已读（打开信时由 UI 调用） */
  markRead(id: number): void {
    const L = this.letters.find(l => l.id === id);
    if (L && !L.read) L.read = true;
  }

  /** v40 授勋：个人史册添荣衔一笔 + 心情提振（名人堂季评调用；找不到市民返回 false） */
  awardHonor(id: number, text: string, dm: number, t: number): boolean {
    const c = this.roster.find(x => x.id === id);
    if (!c) return false;
    this.pushLog(c, t, text);
    c.mood = clamp(c.mood + dm, 5, 100);
    return true;
  }

  /** v30 归档入合集（送信即归档；上限 240 封，满了挤最旧 —— 卷帙有涯，纸墨有限） */
  private archiveLetter(L: Letter, day: number): void {
    this.anth.push({
      id: L.id, nm: L.fromName, look: L.look, body: L.body, role: L.role,
      sj: L.subject, tx: L.text, cat: catOfSubject(L.subject),
      day: Math.max(1, Math.floor(day)),
      rp: L.replied, rl: L.replied >= 0 ? (L.opts[L.replied]?.label ?? '') : '',
      rt: L.replied >= 0 ? (L.opts[L.replied]?.reply ?? '') : '',
    });
    if (this.anth.length > 240) this.anth.splice(0, this.anth.length - 240);
  }

  /** v30 已集齐主题数（去重；成就「鱼雁往还」口径） */
  anthSubjects(): number {
    return new Set(this.anth.map(a => a.sj)).size;
  }

  /** v30 书信合集视图（新信在前；四类计数；浅拷贝供 React 渲染） */
  anthView(): AnthView {
    const items = this.anth.slice().reverse();
    let replied = 0;
    const catN = new Map<string, number>();
    for (const a of items) {
      if (a.rp >= 0) replied++;
      catN.set(a.cat, (catN.get(a.cat) ?? 0) + 1);
    }
    return {
      n: items.length,
      replied,
      subjects: this.anthSubjects(),
      subjTotal: MAIL_SUBJECT_TOTAL,
      cats: MAIL_CATS.map(cat => ({ cat, n: catN.get(cat) ?? 0 })),
      items,
    };
  }

  /** 回信：选中一个选项 → 发件人心情变化 + 大事记写入；返回回信文案供 UI 展示 */
  replyLetter(id: number, optIdx: number): ReplyResult {
    const L = this.letters.find(l => l.id === id);
    if (!L || L.replied >= 0 || optIdx < 0 || optIdx >= L.opts.length) return { ok: false };
    const o = L.opts[optIdx];
    L.replied = optIdx;
    this.replyCount++;
    const A = this.anth.find(a => a.id === L.id);   // v30：合集同步回信状态（挤出旧信也能追记）
    if (A) { A.rp = optIdx; A.rl = o.label; A.rt = o.reply; }
    const c = this.roster.find(x => x.id === L.from);
    if (c) {
      c.mood = clamp(c.mood + o.dm, 5, 100);
      this.pushLog(c, this.lastT, `收到市长的回信：「${o.reply}」`);
    }
    return { ok: true, reply: o.reply, dm: o.dm, from: L.fromName };
  }

  /** 送信（tick 计时到达；信箱满 8 封先挤最旧已读，全未读则缓一缓） */
  private maybeLetter(): void {
    if (!this.roster.length) return;
    if (this.letters.length >= 8) {
      const i = this.letters.findIndex(l => l.read);
      if (i < 0) return;
      this.letters.splice(i, 1);
    }
    const c = rnd(this.roster);
    const L = this.buildLetter(c);
    this.letters.push(L);
    this.archiveLetter(L, this.lastCtx.day ?? 1);   // v30：送信即归档（信箱挤出后永存合集）
    this.onMsg?.(`新来信：${c.name} 写给市长 —— 「${L.subject}」`);
  }

  /** 按城市状态挑一种信（每种 2-3 个回信选项；ov 可覆写判定上下文） */
  private buildLetter(c: Citizen, ov?: Partial<CitzCtx>): Letter {
    const ctx = ov ? { ...this.lastCtx, ...ov } : this.lastCtx;
    let subject = '', text = '';
    let opts: Array<{ label: string; dm: number; reply: string }> = [];
    const seasonWord = ['春', '夏', '秋', '冬'][clamp(ctx.season, 0, 3)];
    if (ctx.famine) {
      subject = '市长，米缸见底了';
      text = `冒昧来信。家里米缸见底好几天了，粮价一天一个样，孩子夜里饿得直哭。街坊们都在咬牙撑着，盼市政厅想想办法。`;
      opts = [
        { label: '安抚 + 优先调粮', dm: 10, reply: '已在协调各粮仓优先保民生供应，再撑两天，一定会好起来' },
        { label: '建议各家互助', dm: -3, reply: '远亲不如近邻，先请街坊们互相匀一匀，市政厅随后补上' },
        { label: '承诺速建粮仓', dm: 6, reply: '已把新粮仓列入建设计划，往后青黄不接不再断粮' },
      ];
    } else if (ctx.taxRate > 12) {
      subject = '关于这个月的税单';
      text = `市长您好。这个月的税单又厚了一沓，肉摊都少割了两斤肉。大伙儿理解城市建设要花钱，但也盼着能喘口气。`;
      opts = [
        { label: '承诺斟酌减税', dm: 8, reply: '税负的事记在心上了，下个财政周期一定斟酌调整' },
        { label: '细算市政账本', dm: 2, reply: '修路架桥办教育，每一分税钱都花在了明处，账本随时可查' },
        { label: '暂缓处理', dm: -8, reply: '来信收到，眼下财政吃紧，还请再多担待担待' },
      ];
    } else if (ctx.events.includes('fire')) {
      subject = '大火那晚，吓坏了';
      text = `市长，前晚那场大火您知道吗？半条街的天空都是红的。万亏消防车来得快。想给市政厅提个醒，水池和消防队还得再添些。`;
      opts = [
        { label: '表彰应急', dm: 8, reply: '已为参与扑救的消防员请功，城市卫士不会缺位' },
        { label: '承诺增设设施', dm: 6, reply: '新的消防设施已在规划图上，护住每一扇窗' },
        { label: '叮嘱防火', dm: 2, reply: '天干物燥，请街坊们多留意灶台与烛火' },
      ];
    } else if (ctx.events.includes('crime') || ctx.crime >= 3) {
      // v25 窃案主题：进行中窃案或盲区成患（≥3 家）时，失窃店主来信
      subject = '铺子遭了贼';
      text = `市长，跟您说件糟心事：昨夜铺子后窗被撬了个大洞，柜台里的货款不翼而飞。派出所说咱这条街不在巡防线上，做小本生意的，实在赔不起第三回。`;
      opts = [
        { label: '承诺增设巡防', dm: 8, reply: '已把新交番列入建设计划，巡逻灯会照到每家卷帘门' },
        { label: '先行垫补损失', dm: 10, reply: '已从市政应急金里先行垫补您的损失，请安心休整铺面' },
        { label: '叮嘱加固门窗', dm: 2, reply: '请先加装门栓、寄存贵重货款，巡防到位前多加小心' },
      ];
    } else if (ctx.events.includes('plague')) {
      subject = '疫病过去之后';
      text = `疫病总算缓下来了。这些日子医护们连轴转，居委会的大喇叭天天喊人喝药汤。想请市长代我们谢谢他们。`;
      opts = [
        { label: '代为致谢', dm: 8, reply: '已转达谢意，医护们的锦旗正在赶制' },
        { label: '承诺扩建医院', dm: 6, reply: '新的病床与诊室已在计划里，下回不再打地铺' },
        { label: '提醒保重', dm: 3, reply: '换季时节，还请多添衣裳、勤晒被褥' },
      ];
    } else if (ctx.happiness > 75) {
      subject = '谢谢这座好城';
      text = `市长您好！今天${seasonWord}高气爽，全家去河边野餐，电车叮叮当当驶过，孩子追着鸽子跑。住在这儿三年了，日子越过越有奔头。谢谢您把城市建设得这么好。`;
      opts = [
        { label: '亲笔回信', dm: 10, reply: '字字读罢，比发了奖金还高兴。这座城因你们而温暖' },
        { label: '随信赠小礼', dm: 12, reply: '随信附上市政厅纪念明信片一套，请笑纳' },
        { label: '例行致谢', dm: 4, reply: '来信收到，感谢您对市政工作的支持' },
      ];
    } else if (ctx.events.includes('festival') || ctx.events.includes('tourseason')) {
      subject = '这阵子街上真热闹';
      text = `市长，艺术节（游客潮）以来，我家门口的小摊生意翻了番！外地口音的游客一拨接一拨，连巷子里的猫都胖了一圈。就是垃圾也多了些，环卫工够忙的。`;
      opts = [
        { label: '感谢 + 加班费', dm: 8, reply: '已叮嘱给环卫弟兄们补发加班补贴，热闹也要干净' },
        { label: '请多提意见', dm: 5, reply: '生意经里出城市经，欢迎常来信说说街面动静' },
        { label: '叮嘱规范经营', dm: 0, reply: '摊位请按划定区域摆放，留出消防通道' },
      ];
    } else if (ctx.happiness < 40) {
      subject = '日子有点紧，想跟您聊聊';
      text = `市长，冒昧说说心里话。这阵子街坊们脸色都不太好：铺子冷清、水电紧巴巴、公交也不好等。大伙儿嘴上不说，心里都盼着能有转机。`;
      opts = [
        { label: '记下 + 逐项排查', dm: 9, reply: '已把您提的问题记进市政备忘录，一件一件来' },
        { label: '恳请再等等', dm: 2, reply: '城市的难关是暂时的，请再给一点时间' },
        { label: '建议迁往他处', dm: -10, reply: '若此处谋生不易，也不强留，祝一路顺遂' },
      ];
    } else {
      const r = Math.random();
      if (r < 0.34) {
        subject = '一条小建议';
        text = `市长，遛弯时想到的：${seasonWord}天风大，河堤那排树要是能再补种一排，夏天乘凉冬天挡风就好了。还有路灯，有几盏总眨眼。小事，但住着舒心。`;
        opts = [
          { label: '采纳 + 记入计划', dm: 8, reply: '补树与修灯都已记入市政清单，开春就办' },
          { label: '感谢提意见', dm: 4, reply: '城市的好建议都来自这样的来信，谢谢' },
          { label: '暂排不上', dm: -3, reply: '眼下大事繁多，小事容后再议' },
        ];
      } else if (r < 0.67) {
        subject = '巷口见闻';
        text = `市长，跟您说件趣事：巷口老王的摊子前天来了只鹦鹉，学电车铃学得一模一样，逗得半条巷子的人都出来看。这城啊，越住越有滋味。`;
        opts = [
          { label: '笑着回信', dm: 6, reply: '读信时笑出了声，替我向那只鹦鹉问好' },
          { label: '相约街坊节', dm: 7, reply: '下回街坊节，市政厅请大伙儿喝茶听戏' },
          { label: '简短回复', dm: 2, reply: '见闻收到，愿巷口的笑声常在' },
        ];
      } else {
        subject = '新邻居来打听';
        text = `市长您好！有位老乡看我住得好，想搬来咱们城，托我问问：这城里孩子上学方便吗？水电稳当吗？我该怎么跟他夸夸咱们这儿？`;
        opts = [
          { label: '欢迎迁入', dm: 8, reply: '请转告：学堂、水电、电车都齐备，本城欢迎每一位新市民' },
          { label: '实话实说', dm: 4, reply: '城市还在成长，好处与不足都请如实相告' },
          { label: '让市场决定', dm: 0, reply: '来去自由，缘分到了自然安家' },
        ];
      }
    }
    return {
      id: this.nextLetterId++, from: c.id, fromName: c.name,
      look: c.look, body: c.body, role: c.role,
      subject, text, opts,
      read: false, replied: -1, t: this.lastT,
    };
  }

  /** 测试钩子：强制送出一封信（忽略计时器与满箱限制）；subj 可指定主题（合集图鉴/成就验证用） */
  forceLetter(subj?: string): Letter | null {
    if (!this.roster.length) return null;
    // 主题 → 判定上下文覆写（把 buildLetter 的 if/else 链引到对应分支；随机三题用中性上下文掷中）
    //   各覆写自含清理字段 —— 真实运行中的饥荒/事件/高幸福会抢先命中分支，必须一并钉死
    const NEU: Partial<CitzCtx> = { famine: 0, taxRate: 8, events: [], happiness: 60, fest: -1, smog: 0, dark: 0, waste: 0, eduOut: 0, crime: 0, fireOut: 0 };
    const OV: Record<string, Partial<CitzCtx>> = {
      '市长，米缸见底了': { ...NEU, famine: 1 },
      '关于这个月的税单': { ...NEU, taxRate: 14 },
      '大火那晚，吓坏了': { ...NEU, events: ['fire'] },
      '铺子遭了贼': { ...NEU, events: ['crime'] },
      '疫病过去之后': { ...NEU, events: ['plague'] },
      '谢谢这座好城': { ...NEU, happiness: 85 },
      '这阵子街上真热闹': { ...NEU, events: ['festival'] },
      '日子有点紧，想跟您聊聊': { ...NEU, happiness: 30 },
    };
    const c = rnd(this.roster);
    let L: Letter | null = null;
    for (let i = 0; i < 24 && subj; i++) {
      L = this.buildLetter(c, OV[subj] ?? NEU);
      if (L.subject === subj) break;
      L = null;   // 随机三题（建议/见闻/新邻居）无上下文可引，中性上下文下重试掷中（各 1/3）
    }
    if (subj && !L) return null;
    if (!L) L = this.buildLetter(c);
    this.letters.push(L);
    this.archiveLetter(L, this.lastCtx.day ?? 1);   // v30：送信即归档
    return L;
  }

  /** 测试钩子：强制触发指定生活事件（wed=成婚 born=添丁；id=-1 随机成人）
   *  v26 扩展：adult=成人礼 retire=花甲 pass=安详离世（map 可选：成人礼择业用） */
  forceEvent(kind: 'wed' | 'born' | 'adult' | 'retire' | 'pass', id = -1, map: CityMap | null = null): { ok: boolean; msg: string } {
    const pool = this.roster.filter(c => c.body === 0);
    if (!pool.length) return { ok: false, msg: 'no-adult' };
    const c = id >= 0 ? this.roster.find(x => x.id === id) : undefined;
    if (id >= 0 && !c) return { ok: false, msg: 'not-found' };
    const t = this.lastT;
    if (kind === 'wed') {
      const w = (c && c.body === 0) ? c : rnd(pool);
      if (w.spouse) return { ok: false, msg: 'already-married' };
      return this.marry(w, t) ? { ok: true, msg: 'married' } : { ok: false, msg: 'no-mate' };
    }
    if (kind === 'born') {
      const b = (c && c.body === 0) ? c : rnd(pool);
      return this.born(b, t) ? { ok: true, msg: 'born' } : { ok: false, msg: 'no-spouse' };
    }
    // v26 生命阶段直驱（确定性触发：测试/演示用）
    if (!c) return { ok: false, msg: 'not-found' };
    if (kind === 'adult') {
      if (c.body !== 1) return { ok: false, msg: 'not-child' };
      this.riteOfAge(c, map, t);
      return { ok: true, msg: 'adult' };
    }
    if (kind === 'retire') {
      if (c.body !== 0) return { ok: false, msg: 'not-adult' };
      this.elderOfAge(c, t);
      return { ok: true, msg: 'elder' };
    }
    if (kind === 'pass') {
      if (c.body !== 2) return { ok: false, msg: 'not-elder' };
      return this.passAway(c, t) ? { ok: true, msg: 'passed' } : { ok: false, msg: 'protected' };
    }
    return { ok: false, msg: 'bad-kind' };
  }

  /** v26 测试钩子：直推年龄（一次跨多段：stage while 循环顺序流转；95 岁必然离世） */
  forceGrow(id: number, years: number, map: CityMap | null = null): { ok: boolean; events: string[] } {
    const c = this.roster.find(x => x.id === id);
    if (!c || years <= 0) return { ok: false, events: [] };
    c.age = Math.min(120, c.age + years);
    const ev = this.stage(c, map, this.lastT);
    if (c.body === 2 && c.age >= 95) {
      if (this.passAway(c, this.lastT)) ev.push('passed');
    }
    return { ok: true, events: ev };
  }

  /** v22 人力资本指数：在册市民平均学历 → 0-100（空册兑底 50 = 外来人口基线：
   *  tycoon 以 50 为零点，超过基线才有工业/科研加成） */
  hrIdx(): number {
    if (!this.roster.length) return 50;
    let sum = 0;
    for (const c of this.roster) sum += c.edu ?? 0;   // v36 防御：edu 缺失按 0 计（正常路径 addCitizen/restore 必有值，测试假市民/脏档不再污染人力资本）
    return Math.round((100 * (sum / this.roster.length)) / 3);
  }

  /** v22 测试钩子：强制一位市民升学（id=-1 随机可升者）；gradTotal 同步累加 */
  forceGrad(id = -1): { ok: boolean; msg: string } {
    const pool = this.roster.filter(c => c.edu < 3);
    if (!pool.length) return { ok: false, msg: 'no-candidate' };
    const c = id >= 0 ? pool.find(x => x.id === id) : rnd(pool);
    if (!c) return { ok: false, msg: 'not-found' };
    c.edu++;
    this.gradTotal++;
    this.pushLog(c, this.lastT, c.edu === 3
      ? `考取了大学，巷口放了一挂鞭炮`
      : `升入${EDU_NAMES[c.edu]}，全家与有荣焉`);
    c.mood = clamp(c.mood + 6, 5, 100);
    return { ok: true, msg: 'grad' };
  }

  view(): CitzView {
    let sum = 0;
    for (const c of this.roster) sum += c.mood;
    return {
      total: this.total,
      n: this.roster.length,
      avgMood: this.roster.length ? Math.round(sum / this.roster.length) : 0,
      roster: this.roster.map(c => this.cardOf(c)),
    };
  }

  serialize(): unknown {
    return {
      total: this.total,
      nextId: this.nextId,
      nextFam: this.nextFam,
      replyCount: this.replyCount,
      nextLid: this.nextLetterId,
      gradTotal: this.gradTotal,   // v22 累计升学人次
      bn: this.bornN, gn: this.grownN, pn: this.passedN, p9: this.passed90N,   // v26 生民计数
      pid: [...this.passedIds],    // v26 已故市民登记簿
      anth: this.anth.map(a => [a.id, a.nm, a.look, a.body, a.role, a.sj, a.tx, a.cat, a.day, a.rp, a.rl, a.rt]),   // v30 书信合集
      letters: this.letters.map(l => ({
        id: l.id, from: l.from, fn: l.fromName,
        look: l.look, body: l.body, role: l.role,
        subject: l.subject, text: l.text,
        opts: l.opts.map(o => [o.label, o.dm, o.reply]),
        read: l.read, replied: l.replied, t: Math.round(l.t),
      })),
      roster: this.roster.map(c => ({
        id: c.id, name: c.name, gender: c.gender, age: c.age,
        look: c.look, body: c.body, role: c.role,
        job: c.job, trait: c.trait, tm: c.traitMood, hobby: c.hobby, origin: c.origin,
        hk: c.homeKey, hn: c.homeName,
        hax: c.homeAt ? c.homeAt[0] : -1, hay: c.homeAt ? c.homeAt[1] : -1,
        wk: c.workKey, wn: c.workName,
        wax: c.workAt ? c.workAt[0] : -1, way: c.workAt ? c.workAt[1] : -1,
        mood: Math.round(c.mood), since: Math.round(c.since), bio: c.bio,
        fam: c.fam, sp: c.spouse, pa: c.pa, ma: c.ma,
        ed: c.edu,   // v22 学历
        ga: c.growAge ?? 0,   // v26 成人礼岁数
        log: c.log.map(l => [Math.round(l.t), l.text]),
      })),
    };
  }

  restore(d: unknown): void {
    this.reset();
    const o = d as {
      total?: number; nextId?: number; nextFam?: number;
      replyCount?: number; nextLid?: number; gradTotal?: number;
      bn?: unknown; gn?: unknown; pn?: unknown; p9?: unknown; pid?: unknown;   // v26
      anth?: Array<unknown>;   // v30 书信合集
      letters?: Array<Record<string, unknown>>;
      roster?: Array<Record<string, unknown>>;
    } | null;
    if (!o || !Array.isArray(o.roster)) return;
    this.total = Math.max(0, Math.floor(Number(o.total) || 0));
    this.nextId = Math.max(1, Math.floor(Number(o.nextId) || 1));
    this.nextFam = Math.max(1, Math.floor(Number(o.nextFam) || 1));
    this.replyCount = Math.max(0, Math.floor(Number(o.replyCount) || 0));
    this.nextLetterId = Math.max(1, Math.floor(Number(o.nextLid) || 1));
    this.gradTotal = Math.max(0, Math.floor(Number(o.gradTotal) || 0));   // v22（旧档无记录归零）
    this.bornN = Math.max(0, Math.floor(Number(o.bn) || 0));       // v26（旧档无记录归零）
    this.grownN = Math.max(0, Math.floor(Number(o.gn) || 0));
    this.passedN = Math.max(0, Math.floor(Number(o.pn) || 0));
    this.passed90N = Math.max(0, Math.floor(Number(o.p9) || 0));
    this.passedIds = new Set(Array.isArray(o.pid)
      ? o.pid.filter((n): n is number => Number.isFinite(n)).map(Number) : []);
    // v15 信箱恢复（旧档无 letters 字段 → 空箱）
    if (Array.isArray(o.letters)) {
      for (const r of o.letters.slice(0, 8)) {
        const opts: Array<{ label: string; dm: number; reply: string }> = [];
        for (const t of (r.opts as Array<[string, number, string]>) ?? []) {
          if (Array.isArray(t) && typeof t[0] === 'string' && typeof t[2] === 'string') {
            opts.push({ label: t[0], dm: Math.floor(Number(t[1]) || 0), reply: t[2] });
          }
        }
        if (typeof r.subject !== 'string' || typeof r.text !== 'string' || !opts.length) continue;
        const rep = Math.floor(Number(r.replied ?? -1));
        this.letters.push({
          id: Math.floor(Number(r.id) || this.nextLetterId++),
          from: Math.floor(Number(r.from) || 0),
          fromName: String(r.fn ?? '市民'),
          look: ((Math.floor(Number(r.look) || 0) % 14) + 14) % 14,
          body: ([0, 1, 2].includes(Number(r.body)) ? Number(r.body) : 0) as 0 | 1 | 2,
          role: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].includes(Number(r.role)) ? Number(r.role) as Role : 0,
          subject: r.subject, text: r.text, opts,
          read: r.read === true,
          replied: rep >= 0 && rep < opts.length ? rep : -1,
          t: Math.max(0, Math.floor(Number(r.t) || 0)),
        });
      }
    }
    // v30 书信合集恢复（旧档无 anth 字段 → 空册；逐条清洗：字符串截长/day 下限 1/rp 白名单/分类按主题重校）
    if (Array.isArray(o.anth)) {
      for (const r of o.anth.slice(0, 240)) {
        if (!Array.isArray(r) || r.length < 10) continue;
        const [id, nm, look, body, role, sj, tx, cat, day, rp, rl, rt] = r as
          [number, string, number, 0 | 1 | 2, Role, string, string, string, number, number, string, string];
        if (typeof sj !== 'string' || typeof tx !== 'string' || !sj) continue;
        const rpN = Math.floor(Number(rp) ?? -1);
        this.anth.push({
          id: Math.max(0, Math.floor(Number(id) || 0)),
          nm: String(nm ?? '市民').slice(0, 12),
          look: ((Math.floor(Number(look) || 0) % 14) + 14) % 14,
          body: ([0, 1, 2].includes(Number(body)) ? Number(body) : 0) as 0 | 1 | 2,
          role: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].includes(Number(role)) ? Number(role) as Role : 0,
          sj: sj.slice(0, 24),
          tx: tx.slice(0, 220),
          cat: MAIL_CATS.includes(cat as (typeof MAIL_CATS)[number]) ? cat : catOfSubject(sj),
          day: Math.max(1, Math.floor(Number(day) || 1)),
          rp: rpN >= 0 && rpN <= 2 ? rpN : -1,
          rl: String(rl ?? '').slice(0, 24),
          rt: String(rt ?? '').slice(0, 60),
        });
      }
    }
    for (const r of o.roster.slice(0, ROSTER_MAX)) {
      const log: Array<{ t: number; text: string }> = [];
      for (const l of (r.log as Array<[number, string]>) ?? []) {
        if (Array.isArray(l) && typeof l[1] === 'string') {
          log.push({ t: Number(l[0]) || 0, text: String(l[1]) });
        }
      }
      const role = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].includes(Number(r.role)) ? Number(r.role) as Role : 0;
      const hax = Math.floor(Number(r.hax) || -1), hay = Math.floor(Number(r.hay) || -1);
      const wax = Math.floor(Number(r.wax) || -1), way = Math.floor(Number(r.way) || -1);
      this.roster.push({
        id: Math.floor(Number(r.id) || this.nextId++),
        name: String(r.name ?? '无名氏'),
        gender: r.gender === 1 ? 1 : 0,
        age: Math.max(1, Math.min(99, Math.floor(Number(r.age) || 30))),
        look: ((Math.floor(Number(r.look) || 0) % 14) + 14) % 14,
        body: ([0, 1, 2].includes(Number(r.body)) ? Number(r.body) : 0) as 0 | 1 | 2,
        role,
        job: String(r.job ?? '市民'),
        trait: String(r.trait ?? '乐观开朗'),
        traitMood: Math.floor(Number(r.tm) || 0),
        hobby: String(r.hobby ?? '侍弄阳台盆栽'),
        origin: String(r.origin ?? '邻县小镇'),
        homeKey: Math.floor(Number(r.hk) || -1),
        homeName: String(r.hn ?? '出租屋'),
        homeAt: hax >= 0 && hay >= 0 ? [hax, hay] : null,
        workKey: Math.floor(Number(r.wk) || -1),
        workName: String(r.wn ?? ''),
        workAt: wax >= 0 && way >= 0 ? [wax, way] : null,
        mood: Math.max(5, Math.min(100, Math.floor(Number(r.mood) || 60))),
        since: Math.max(0, Math.floor(Number(r.since) || 0)),
        fam: Math.max(0, Math.floor(Number(r.fam) || 0)),
        spouse: Math.max(0, Math.floor(Number(r.sp) || 0)),
        pa: Math.max(0, Math.floor(Number(r.pa) || 0)),
        ma: Math.max(0, Math.floor(Number(r.ma) || 0)),
        edu: Math.max(0, Math.min(3, Math.floor(Number(r.ed ?? (Number(r.body) === 1 ? 0 : 1))))),   // v22 学历（旧档按体型补默认）
        growAge: Math.max(0, Math.floor(Number(r.ga) || 0)) || undefined,   // v26 成人礼岁数（0 = 未生成，懒重建）
        bio: String(r.bio ?? ''),
        log: log.slice(-LOG_MAX),
      });
    }
  }
}
