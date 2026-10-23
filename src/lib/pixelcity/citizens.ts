// ============================================================
// citizens.ts — v13 市民列传：有名有姓的城市居民
//   人口增长 → 新市民落户（姓名/年龄/职业/性格/出身/传记）
//   时间流逝 → 生活大事记（升职/成婚/添丁/乔迁/退休…）
//   城市事件 → 市民反应写入个人史册（火灾/疫病/牛市/艺术节…）
//   市民之声 → 随城市状态的市民吐槽（税率/幸福/季节/事件）
//   名人册   → 在册 28 位代表市民（头像 = 行人精灵同款像素画）
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

/** 职业 → 行人制服（精灵 role） */
const JOB_ROLE: Record<string, Role> = {
  hospital: 6, school: 3, library: 3, koban: 1, firestation: 7,
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
  bio: string;
  log: Array<{ t: number; text: string }>;
};

/** React 面板用的市民卡片（含建筑名称与坐标） */
export type CitzCard = {
  id: number; name: string; gender: 0 | 1; age: number;
  look: number; body: 0 | 1 | 2; role: Role;
  job: string; trait: string; hobby: string; origin: string;
  bio: string; mood: number; since: number;
  homeName: string; homeAt: { x: number; y: number } | null;
  workName: string; workAt: { x: number; y: number } | null;
  log: Array<{ t: number; text: string }>;
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
  /** 累计落户人次（成就口径） */
  total = 0;
  private nextId = 1;
  private lastPop = 0;
  private evTimer = 12;
  /** 消息回调（tycoon.msg 接线） */
  onMsg: ((s: string) => void) | null = null;

  reset(): void {
    this.roster = [];
    this.total = 0;
    this.nextId = 1;
    this.lastPop = 0;
    this.evTimer = 12;
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
  }

  /** 随机一位市民的随机人生事件（写入大事记） */
  private lifeEvent(map: CityMap, t: number): void {
    const c = rnd(this.roster);
    const roll = Math.random();
    if (roll < 0.16 && c.body === 0) {
      this.pushLog(c, t, `升任领班加了薪，请全屋人吃了顿烧鸟`);
      c.mood = clamp(c.mood + 8, 5, 100);
    } else if (roll < 0.30 && c.body === 0) {
      const names = rnd(GIVEN_F.concat(GIVEN_M));
      this.pushLog(c, t, `与青梅竹马${rnd(SURNAMES)}${names}成婚，街坊送来一篮子鸡蛋`);
      c.mood = clamp(c.mood + 12, 5, 100);
    } else if (roll < 0.40 && c.body === 0) {
      this.pushLog(c, t, `家里添了丁，取了个乳名叫「小满」`);
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
      case 'scandal': {
        react(pick(), `去市政厅递了意见书，附了按满手印的联名信`, -6);
        break;
      }
      default: break;
    }
  }

  /** 应急处置成功（消防/急救）：市民点赞 */
  onRescue(kind: 'fire' | 'plague', t: number): void {
    if (!this.roster.length) return;
    const hero = this.roster.find(c => c.role === (kind === 'fire' ? 7 : 6));
    if (hero) this.pushLog(hero, t, kind === 'fire'
      ? `参与扑救大火，被评为本周城市之星`
      : `连夜出诊处置疫情，居民送来了锦旗`);
    for (const c of this.roster) c.mood = clamp(c.mood + 4, 5, 100);
  }

  // ---------------- 市民之声（街头偶遇） ----------------

  /** 按城市状态挑一句市民心声（面板滚动条/行人偶遇共用） */
  voice(ctx: CitzCtx): { name: string; text: string; mood: number } | null {
    if (!this.roster.length) return null;
    const c = rnd(this.roster);
    const seasonWord = ['春天樱花开得正好', '夏天夜市热闹得很', '秋天满街金桂飘香', '冬天呵气都成霜'][clamp(ctx.season, 0, 3)];
    let text: string;
    if (ctx.famine) text = rnd(['粮价一天一个样，家里米缸快见底了', '菜场的白菜都要抢了，得想想办法']);
    else if (ctx.taxRate > 12) text = rnd(['税越收越狠，肉摊都少割两斤了', '这税率，攒钱的速度赶不上市政厅收的']);
    else if (ctx.taxRate <= 5) text = rnd(['低税的日子里，钱包都胖了一圈', '市政厅这个月大方，下馆子加了个鸡腿']);
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

  /** 观察工具点击行人 → 随机一位在册市民的卡片（名人册为空返回 null） */
  spot(): Citizen | null {
    return this.roster.length ? rnd(this.roster) : null;
  }

  /** 观察工具点击行人 → 随机在册市民的完整卡片（空册返回 null；engine 钩子用） */
  spotCard(): CitzCard | null {
    return this.roster.length ? this.cardOf(rnd(this.roster)) : null;
  }

  // ---------------- 视图 / 存档 ----------------

  private cardOf(c: Citizen): CitzCard {
    return {
      id: c.id, name: c.name, gender: c.gender, age: c.age,
      look: c.look, body: c.body, role: c.role,
      job: c.job, trait: c.trait, hobby: c.hobby, origin: c.origin,
      bio: c.bio, mood: Math.round(c.mood), since: c.since,
      homeName: c.homeName,
      homeAt: c.homeAt ? { x: c.homeAt[0], y: c.homeAt[1] } : null,
      workName: c.workAt ? c.workName : (c.body === 1 ? '就读于本城学堂' : c.body === 2 ? '含饴弄孙中' : c.workName || '自由职业'),
      workAt: c.workAt ? { x: c.workAt[0], y: c.workAt[1] } : null,
      log: c.log.slice(-6).map(l => ({ ...l })),
    };
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
      roster: this.roster.map(c => ({
        id: c.id, name: c.name, gender: c.gender, age: c.age,
        look: c.look, body: c.body, role: c.role,
        job: c.job, trait: c.trait, tm: c.traitMood, hobby: c.hobby, origin: c.origin,
        hk: c.homeKey, hn: c.homeName,
        hax: c.homeAt ? c.homeAt[0] : -1, hay: c.homeAt ? c.homeAt[1] : -1,
        wk: c.workKey, wn: c.workName,
        wax: c.workAt ? c.workAt[0] : -1, way: c.workAt ? c.workAt[1] : -1,
        mood: Math.round(c.mood), since: Math.round(c.since), bio: c.bio,
        log: c.log.map(l => [Math.round(l.t), l.text]),
      })),
    };
  }

  restore(d: unknown): void {
    this.reset();
    const o = d as { total?: number; nextId?: number; roster?: Array<Record<string, unknown>> } | null;
    if (!o || !Array.isArray(o.roster)) return;
    this.total = Math.max(0, Math.floor(Number(o.total) || 0));
    this.nextId = Math.max(1, Math.floor(Number(o.nextId) || 1));
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
        bio: String(r.bio ?? ''),
        log: log.slice(-LOG_MAX),
      });
    }
  }
}
