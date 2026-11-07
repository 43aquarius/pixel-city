// ============================================================
// chronicle.ts — v17 城市编年史：这座城市的编年体史书
//   开埠奠基 → 时代跃迁（拓荒营地/炊烟村庄/市井小镇/一方城市/摩登都会）
//   灾祸喜讯 → 火疫风暴、牛市艺术节等城市事件与应急救险
//   文治武功 → 科技研究、节庆盛典、市政法令
//   里程碑   → 人口/评级/建筑/领地/府库的阶段性跨越
//   本模块不依赖 tycoon（上下文由外部传入，避免循环引用）
// ============================================================

/** 在册纪事上限（滑窗：新推旧挤，最早的会被挤出去） */
export const CHRON_MAX = 140;

/** 纪事分类（筛选器用） */
export type ChronCat = 'era' | 'event' | 'tech' | 'fest' | 'ord' | 'mile' | 'rev';

/** 纪事色调：good 喜 / bad 忧 / big 大事记（纪元级）/ info 日常政务 */
export type ChronTone = 'good' | 'bad' | 'big' | 'info';

export type ChronEntry = {
  id: number;        // 自增序号（滑窗内排序依据）
  day: number;       // 游戏日（开埠第 N 天）
  h?: number;        // 游戏时锚点（v28 年表精确定位；旧档缺省回退当日正午）
  cat: ChronCat;
  tone: ChronTone;
  icon: string;      // 图标名（icons.ts）
  title: string;     // 四字标题
  text: string;      // 纪事正文（一至两句）
};

/** 纪事的游戏时锚点（旧档无 h → 按当日正午回退，年表不丢点） */
export function hOf(e: ChronEntry): number {
  return Number.isFinite(e.h) ? (e.h as number) : (e.day - 1) * 24 + 12;
}

// ------------------------------------------------------------
// 五纪元（按人口晋升；编年史的「卷」）
// ------------------------------------------------------------

export const ERAS: Array<{ name: string; pop: number; text: string }> = [
  { name: '拓荒营地', pop: 0,
    text: '荒原之上，市政厅的旗杆第一个立起来。第一炉炊烟升起的地方，就是这座城开始的地方。' },
  { name: '炊烟村庄', pop: 50,
    text: '第一批定居者在市政厅四周安家落户，荒原上升起连绵炊烟 —— 旅人们开始把这里叫作「村庄」。' },
  { name: '市井小镇', pop: 150,
    text: '街道纵横、商铺开张，赶集的人流出现在十字街口 —— 村庄长大了，成了小镇。' },
  { name: '一方城市', pop: 400,
    text: '夜幕降临时，千窗灯火连成星河。地图之上，这里终于有了一座真正的城市。' },
  { name: '摩登都会', pop: 1000,
    text: '高楼刺破天际线，电车叮当作响，港口汽笛长鸣 —— 这是一座都会的气象。' },
];

/** 人口 → 纪元序号（0..4） */
export function eraOfPop(pop: number): number {
  let e = 0;
  for (let i = ERAS.length - 1; i >= 0; i--) {
    if (pop >= ERAS[i].pop) { e = i; break; }
  }
  return e;
}

// ------------------------------------------------------------
// v27 城史长卷：按纪元分卷的全景阅读视图（纯派生，不入档）
// ------------------------------------------------------------

/** 一卷 = 一个纪元的纪事（卷首即「迈入」跃迁那一笔） */
export type ChronChapter = {
  era: number;            // 纪元序号（卷名）
  entries: ChronEntry[];  // 本卷纪事（旧 → 新，长卷阅读顺序）
  fromDay: number;        // 起笔游戏日
  toDay: number;          // 收笔游戏日
};

/** 汉字卷号（第一卷…第十卷，超出回退阿拉伯数字） */
const CN_VOL = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];
export function volName(i: number): string { return CN_VOL[i] ?? String(i + 1); }

/**
 * 把滑窗纪事切成「卷」：每遇「迈入「X」」纪元跃迁纪事即开新卷，
 * 该跃迁纪事本身是新卷的第一笔（开卷之笔）；
 * 此前所有纪事归开埠卷（拓荒营地）。
 * 「开埠建城」「旧卷续写」不匹配任何纪元名，天然留在当前卷内；
 * 年代久远的跃迁纪事被滑窗挤出时，早年残卷仍归开埠卷 —— 语义不变。
 */
export function chaptersOf(entries: ChronEntry[]): ChronChapter[] {
  const chaps: ChronChapter[] = [];
  if (!entries.length) return chaps;
  let cur: ChronChapter = { era: 0, entries: [], fromDay: entries[0].day, toDay: entries[0].day };
  for (const x of entries) {
    if (x.cat === 'era' && x.tone === 'big' && x.title.startsWith('迈入')) {
      const name = x.title.slice(x.title.indexOf('「') + 1, x.title.lastIndexOf('」'));
      const k = ERAS.findIndex(e => e.name === name);
      if (k > cur.era) {
        if (cur.entries.length) chaps.push(cur);
        cur = { era: k, entries: [], fromDay: x.day, toDay: x.day };
      }
    }
    cur.entries.push(x);
    cur.toDay = x.day;
  }
  if (cur.entries.length) chaps.push(cur);
  return chaps;
}

/** 纪事色调统计（长卷卷首用） */
export function statsOf(entries: ChronEntry[]):
    { good: number; bad: number; big: number; info: number; span: number } {
  let good = 0, bad = 0, big = 0, info = 0;
  for (const x of entries) {
    if (x.tone === 'good') good++;
    else if (x.tone === 'bad') bad++;
    else if (x.tone === 'big') big++;
    else info++;
  }
  const span = entries.length
    ? Math.max(0, entries[entries.length - 1].day - entries[0].day) : 0;
  return { good, bad, big, info, span };
}

// ------------------------------------------------------------
// v28 大事年表：时间轴总览（纯派生，不入档；轴为游戏时，一天 24h）
// ------------------------------------------------------------

/** 纪元带：年表的背景分段（游戏时粒度，左闭右开） */
export type TlBand = { era: number; from: number; to: number };

/** 年表锚点：一枚可点跳转的纪事点（x 为 0..1 轴上位置分数） */
export type TlDot = { e: ChronEntry; i: number; lane: number; x: number };

/**
 * 纪元带切分（游戏时轴）：每遇「迈入「X」」跃迁纪事即开新带（跃迁锚点归新带首），
 * 末带延伸到 toH；与 chaptersOf 同源语义（早年残卷归开埠带），保证年表与长卷分卷对齐。
 */
export function eraBandsOf(entries: ChronEntry[], toH: number): TlBand[] {
  const bands: TlBand[] = [];
  if (!entries.length) return bands;
  let last = 0;
  for (const x of entries) last = Math.max(last, hOf(x));
  const end = Math.max(toH, last);
  let cur: TlBand = { era: 0, from: 0, to: end };
  for (const x of entries) {
    if (x.cat === 'era' && x.tone === 'big' && x.title.startsWith('迈入')) {
      const name = x.title.slice(x.title.indexOf('「') + 1, x.title.lastIndexOf('」'));
      const k = ERAS.findIndex(e => e.name === name);
      if (k > cur.era) {
        cur.to = Math.max(cur.from, hOf(x) - 0.01);   // 跃迁锚点归新带首
        bands.push(cur);
        cur = { era: k, from: hOf(x), to: end };
      }
    }
  }
  bands.push(cur);
  return bands;
}

/**
 * 轴上布点（游戏时定位：x = (h - fromH) / span），相邻过近的点依次上叠（lane 0 最贴轴）；
 * minDx 为最小间距分数（调用方按实际像素宽折算传入，纯函数保持可测）。
 */
export function timelineOf(entries: ChronEntry[], fromH: number, toH: number, minDx: number):
    { dots: TlDot[]; lanes: number } {
  const span = Math.max(1, toH - fromH);
  const laneEnd: number[] = [];   // 每车道已占到的 x 位置
  const dots: TlDot[] = [];
  entries.forEach((e, i) => {
    const x = Math.min(1, Math.max(0, (hOf(e) - fromH) / span));
    let lane = laneEnd.findIndex(end => end + minDx <= x);
    if (lane < 0) { lane = laneEnd.length; laneEnd.push(0); }
    laneEnd[lane] = x;
    dots.push({ e, i, lane, x });
  });
  return { dots, lanes: Math.max(1, laneEnd.length) };
}

/** 密度直方图：把 [fromH, toH] 均分 buckets 桶，返回每桶纪事数（多事之秋一眼可辨） */
export function densityOf(entries: ChronEntry[], fromH: number, toH: number, buckets: number): number[] {
  const out = new Array(Math.max(1, buckets)).fill(0);
  const span = Math.max(1, toH - fromH);
  for (const e of entries) {
    const k = Math.min(out.length - 1, Math.max(0, Math.floor((hOf(e) - fromH) / span * out.length)));
    out[k]++;
  }
  return out;
}

// ------------------------------------------------------------
// 里程碑定义（一次性入册，去重集合随档保存）
// ------------------------------------------------------------

type MileDef = { v: number; title: string; text: string; icon: string };

const POP_MILES: MileDef[] = [
  { v: 100, title: '百户灯火', icon: 'people',
    text: '常住人口突破 100。入夜后，住宅区的窗口一盏盏亮起，像撒在地面上的星子。' },
  { v: 500, title: '五百人家', icon: 'people',
    text: '人口突破 500。街巷里开始有了早晚高峰，邻里之间有了新的闲话。' },
  { v: 1000, title: '千人之城', icon: 'people',
    text: '人口突破 1000。这座城的名字，开始出现在远方商队的地图上。' },
  { v: 2000, title: '人潮汹涌', icon: 'people',
    text: '人口突破 2000。城市还在生长，故事仍在继续。' },
];

const RATE_MILES: MileDef[] = [
  { v: 70, title: '金字招牌', icon: 'medal',
    text: '城市评级首次升至 B —— 口碑渐起，旅人愿意绕道来此歇脚。' },
  { v: 80, title: '誉满一方', icon: 'medal',
    text: '城市评级首次升至 A —— 远近闻名的安居之地，迁入申请排起了长队。' },
  { v: 90, title: '都市传奇', icon: 'medal',
    text: '城市评级首次升至 S —— 教科书般的城市范本，别处的市长专程来考察。' },
];

const BLD_MILES: MileDef[] = [
  { v: 50, title: '添砖加瓦', icon: 'flag',
    text: '城中建筑已达 50 栋，天际线初具轮廓。' },
  { v: 150, title: '广厦渐起', icon: 'flag',
    text: '建筑增至 150 栋。老住户开始念叨：这里半年前还是一片荒地。' },
  { v: 300, title: '摩天丛林', icon: 'flag',
    text: '建筑增至 300 栋。从市政厅顶楼望去，屋脊连绵直到天边。' },
];

const LAND_MILES: MileDef[] = [
  { v: 6, title: '开疆拓土', icon: 'land',
    text: '领地扩至 6 块 —— 城市的边界，又一次向荒野推开。' },
  { v: 9, title: '纵横捭阖', icon: 'land',
    text: '领地达 9 块。摊开的地图，快要画不下这座城了。' },
];

const COIN_MILES: MileDef[] = [
  { v: 10000, title: '府库充盈', icon: 'coin',
    text: '库存金币突破一万。财政官合上账本，难得地笑了。' },
];

/** 城市事件 → 编年史图标 */
export const EV_ICON: Record<string, string> = {
  fire: 'fire', plague: 'heart', blackout: 'bolt', storm: 'cloud', scandal: 'coin',
  boom: 'people', harvest: 'wheat', expo: 'flask', festival: 'fest', invest: 'coin',
  tourseason: 'people', badreview: 'star', bullmkt: 'coin', tradewar: 'box',
  quake: 'land', flood: 'drop',   // v18 灾害链
  crime: 'shield',                // v23 治安
};

// ------------------------------------------------------------
// 视图
// ------------------------------------------------------------

export type ChronView = {
  era: number;           // 当前纪元（含降级；展示用）
  eraName: string;
  day: number;           // 开埠第 N 天
  n: number;             // 在册条数（滑窗）
  total: number;         // 累计写入笔数（成就用，不随滑窗减少）
  entries: ChronEntry[]; // 旧 → 新
};

// ------------------------------------------------------------
// 编年史主体
// ------------------------------------------------------------

export class Chronicle {
  entries: ChronEntry[] = [];
  /** 累计写入笔数（滑窗挤出的也计数） */
  total = 0;
  /** 当前纪元 */
  era = 0;
  /** 历史最高纪元（成就用；人口回落不降） */
  maxEra = 0;
  private nextId = 1;
  /** 已入册里程碑（去重） */
  private miles = {
    pop: new Set<number>(), rate: new Set<number>(), bld: new Set<number>(),
    land: new Set<number>(), coin: new Set<number>(), eco: new Set<number>(),   // v19 生态（1 雾霾围城 / 2 重现蓝天）
    pw: new Set<number>(),                                                   // v20 电网（1 暗夜之城 / 2 华灯初上 / 3 重见光明）
    gs: new Set<number>(),                                                   // v21 环卫（1 垃圾围城 / 2 循环之城）
    edu: new Set<number>(),                                                  // v22 文教（1 望学兴叹 / 2 有教无类）
    sec: new Set<number>(),                                                  // v23 治安（1 盗贼横行 / 2 夜不闭户）
    fire: new Set<number>(),                                                 // v24 消防（1 祝融之灾 / 2 固若金汤）
    med: new Set<number>(),                                                  // v36 医疗（1 缺医少药 / 2 悬壶济世）
  };

  /** 游戏小时 → 开埠第 N 天 */
  static dayOf(gHours: number): number { return Math.floor(gHours / 24) + 1; }

  /** 追加一笔纪事（滑窗：超过 CHRON_MAX 挤掉最早） */
  write(cat: ChronCat, tone: ChronTone, icon: string, title: string, text: string, gHours: number): void {
    this.entries.push({
      id: this.nextId++, day: Chronicle.dayOf(gHours), h: Math.max(0, gHours),
      cat, tone, icon, title, text,
    });
    if (this.entries.length > CHRON_MAX) {
      this.entries.splice(0, this.entries.length - CHRON_MAX);
    }
    this.total++;
  }

  /**
   * 里程碑巡检（tycoon.tick 每帧调用）。
   * 返回本次新跃迁的纪元序号（无跃迁 = -1）——调用方借此提示与奏乐。
   */
  survey(ctx: { pop: number; rating: number; buildings: number; chunks: number; coins: number;
      smogRes?: number; envIdx?: number; ecotowers?: number;
      gridCover?: number; darkN?: number; powerRes?: number;
      wasteN?: number; recycles?: number; sweepCover?: number;
      eduOut?: number; eduCover?: number; universities?: number;
      crimeN?: number; secCover?: number; policehqN?: number;
      fireOut?: number; fireCover?: number; firestations?: number;
      medMissRes?: number; medCover?: number; clinics?: number }, gHours: number): number {
    let eraUp = -1;
    // 纪元跃迁（只升不重记；人口回落后再升回不重复入册）
    const e = eraOfPop(ctx.pop);
    if (e > this.era) {
      this.era = e;
      eraUp = e;
    } else if (e < this.era) {
      this.era = e;   // 回落仅降当前值，不动 maxEra
    }
    if (this.era > this.maxEra) {
      this.maxEra = this.era;
      if (eraUp >= 0) {
        this.write('era', 'big', 'city', `迈入「${ERAS[eraUp].name}」`, ERAS[eraUp].text, gHours);
      }
    }
    // 人口 / 评级 / 建筑 / 领地 / 府库 里程碑
    for (const m of POP_MILES) {
      if (ctx.pop >= m.v && !this.miles.pop.has(m.v)) {
        this.miles.pop.add(m.v);
        this.write('mile', 'good', m.icon, m.title, m.text, gHours);
      }
    }
    for (const m of RATE_MILES) {
      // 评级里程碑需真实城市规模（≥30 人）：空城的高分不构成「口碑」
      if (ctx.pop >= 30 && ctx.rating >= m.v && !this.miles.rate.has(m.v)) {
        this.miles.rate.add(m.v);
        this.write('mile', 'good', m.icon, m.title, m.text, gHours);
      }
    }
    for (const m of BLD_MILES) {
      if (ctx.buildings >= m.v && !this.miles.bld.has(m.v)) {
        this.miles.bld.add(m.v);
        this.write('mile', 'info', m.icon, m.title, m.text, gHours);
      }
    }
    for (const m of LAND_MILES) {
      if (ctx.chunks >= m.v && !this.miles.land.has(m.v)) {
        this.miles.land.add(m.v);
        this.write('mile', 'info', m.icon, m.title, m.text, gHours);
      }
    }
    for (const m of COIN_MILES) {
      if (ctx.coins >= m.v && !this.miles.coin.has(m.v)) {
        this.miles.coin.add(m.v);
        this.write('mile', 'good', m.icon, m.title, m.text, gHours);
      }
    }
    // ---- v19 生态里程碑：雾霾围城 → 重现蓝天（一对救赎叙事；先污染后治理才成对入册）----
    const smogRes = ctx.smogRes ?? 0, envIdx = ctx.envIdx ?? 100, ecotowers = ctx.ecotowers ?? 0;
    if (smogRes >= 3 && !this.miles.eco.has(1)) {
      this.miles.eco.add(1);
      this.write('mile', 'bad', 'cloud', '雾霾围城',
        `${smogRes} 栋住宅被浓烟笼罩，晾在窗外的白衬衫半天就蒙了灰。市民开始念叨：烟囱与卧房，总该隔着几条街。`, gHours);
    }
    if (this.miles.eco.has(1) && !this.miles.eco.has(2) && ecotowers >= 1 && envIdx >= 80) {
      this.miles.eco.add(2);
      this.write('mile', 'good', 'tree', '重现蓝天',
        `空气净化塔的滤网盘日夜转动，环境指数重回 ${envIdx}。孩子们又能在街心公园里追着风筝跑了。`, gHours);
    }
    // ---- v20 电网里程碑：暗夜之城 → 重见光明（一对救赎叙事）+ 华灯初上（独立里程碑）----
    const gridCover = ctx.gridCover ?? 100, darkN = ctx.darkN ?? 0;
    if (darkN >= 6 && !this.miles.pw.has(1)) {
      this.miles.pw.add(1);
      this.write('mile', 'bad', 'bolt', '暗夜之城',
        `${darkN} 栋建筑入夜后一片漆黑，路灯照不到的巷子里连狗都懒得叫。市民在烛光里抱怨：电线杆，什么时候才轮到我们家门口？`, gHours);
    }
    if (this.miles.pw.has(1) && !this.miles.pw.has(3) && darkN === 0 && gridCover >= 95) {
      this.miles.pw.add(3);
      this.write('mile', 'good', 'bolt', '重见光明',
        `最后一根电杆合闸，电网覆盖率回到 ${gridCover}%。入夜后满城窗火次第亮起，像把星河撒进了街巷。`, gHours);
    }
    if (gridCover >= 90 && ctx.buildings >= 25 && !this.miles.pw.has(2)) {
      this.miles.pw.add(2);
      this.write('mile', 'good', 'bolt', '华灯初上',
        `电网覆盖率 ${gridCover}%：入夜时分，全城窗火与路灯一道次第点亮，远方来客未入城门先见灯海。`, gHours);
    }
    // ---- v21 环卫里程碑：垃圾围城 → 循环之城（一对救赎叙事；先围城后治理才成对入册）----
    const wasteN = ctx.wasteN ?? 0, recycles = ctx.recycles ?? 0;
    if (wasteN >= 5 && !this.miles.gs.has(1)) {
      this.miles.gs.add(1);
      this.write('mile', 'bad', 'box', '垃圾围城',
        `${wasteN} 处垃圾堆在巷口过了腰线，风一吹满街都是酸味。市民捏着鼻子抱怨：这届市政厅，怕是连把扫帚都没有。`, gHours);
    }
    if (this.miles.gs.has(1) && !this.miles.gs.has(2) && recycles >= 1 && wasteN === 0 && envIdx >= 75) {
      this.miles.gs.add(2);
      this.write('mile', 'good', 'box', '循环之城',
        `回收中心的传送带日夜不停，废瓶旧纸各归其位，环境指数回到 ${envIdx}。曾经捏着鼻子的街巷，如今窗明几净。`, gHours);
    }
    // ---- v22 文教里程碑：望学兴叹 → 有教无类（一对救赎叙事；先望学后兴学才成对入册）----
    const eduOut = ctx.eduOut ?? 0, eduCover = ctx.eduCover ?? 100, unis = ctx.universities ?? 0;
    if (eduOut >= 4 && !this.miles.edu.has(1)) {
      this.miles.edu.add(1);
      this.write('mile', 'bad', 'book', '望学兴叹',
        `${eduOut} 栋住宅的孩子上学要翻过半座城，天不亮就打着灯笼出门。家长们在市政厅门前递了联名信：咱们这头，也该有所学堂。`, gHours);
    }
    if (this.miles.edu.has(1) && !this.miles.edu.has(2) && eduCover >= 90 && unis >= 1) {
      this.miles.edu.add(2);
      this.write('mile', 'good', 'book', '有教无类',
        `大学城的钟声悠悠荡开，学区覆盖率回到 ${eduCover}%。再远的孩子也能就近入学，琅琅书声成了这座城新的背景音。`, gHours);
    }
    // ---- v23 治安里程碑：盗贼横行 → 夜不闭户（一对救赎叙事；先失窃后巡防才成对入册）----
    const crimeN = ctx.crimeN ?? 0, secCover = ctx.secCover ?? 100, hqN = ctx.policehqN ?? 0;
    if (crimeN >= 3 && !this.miles.sec.has(1)) {
      this.miles.sec.add(1);
      this.write('mile', 'bad', 'shield', '盗贼横行',
        `${crimeN} 家商铺开在巡防灯照不到的地方，隔三差五就有卷帘门被撬。商户们凑钱订了块牌匾送到市政厅：「请给我们一盏灯」。`, gHours);
    }
    if (this.miles.sec.has(1) && !this.miles.sec.has(2) && secCover >= 95 && hqN >= 1) {
      this.miles.sec.add(2);
      this.write('mile', 'good', 'shield', '夜不闭户',
        `警察局的巡逻灯彻夜扫过街角，巡防覆盖率回到 ${secCover}%。商铺敢把货摆到深夜，巷子里遛狗的人也多了起来。`, gHours);
    }
    // ---- v24 消防里程碑：祝融之灾 → 固若金汤（一对救赎叙事；先失火后铺网才成对入册）----
    const fireOut = ctx.fireOut ?? 0, fireCover = ctx.fireCover ?? 100, fsN = ctx.firestations ?? 0;
    if (fireOut >= 4 && !this.miles.fire.has(1)) {
      this.miles.fire.add(1);
      this.write('mile', 'bad', 'fire', '祝融之灾',
        `${fireOut} 栋建筑开在消防水网之外，一场火烧穿了半条街。市民指着焦黑的墙根问：消防栓，什么时候能装到咱们巷口？`, gHours);
    }
    if (this.miles.fire.has(1) && !this.miles.fire.has(2) && fireCover >= 95 && fsN >= 1) {
      this.miles.fire.add(2);
      this.write('mile', 'good', 'fire', '固若金汤',
        `消防栓的红桩子立满了街角，消防覆盖率回到 ${fireCover}%。夜里再见火星，水枪三分钟就能压住 —— 街坊们终于能睡个安稳觉。`, gHours);
    }
    // ---- v36 医疗里程碑：缺医少药 → 悬壶济世（一对救赎叙事；先求医无门后建成医疗网才成对入册）----
    const medMissRes = ctx.medMissRes ?? 0, medCover = ctx.medCover ?? 100, clinicN = ctx.clinics ?? 0;
    if (medMissRes >= 4 && !this.miles.med.has(1)) {
      this.miles.med.add(1);
      this.write('mile', 'bad', 'heart', '缺医少药',
        `${medMissRes} 栋住宅看病要跨半座城，老人体检孩子退烧都得坐车赶路。有位阿婆在市政厅门口拉住市长：「咱们巷子里，也该有个能看病的地方。」`, gHours);
    }
    if (this.miles.med.has(1) && !this.miles.med.has(2) && medCover >= 95 && clinicN >= 1) {
      this.miles.med.add(2);
      this.write('mile', 'good', 'heart', '悬壶济世',
        `街角诊所的白十字一块块亮起来，医疗覆盖率回到 ${medCover}%。感冒发烧不必再跨城赶路，出诊的大夫十分钟就能到门口 —— 杏林春满，悬壶济世。`, gHours);
    }
    return eraUp;
  }

  view(): ChronView {
    return {
      era: this.era, eraName: ERAS[this.era]?.name ?? ERAS[0].name,
      day: this.entries.length ? this.entries[this.entries.length - 1].day : 1,
      n: this.entries.length, total: this.total,
      entries: [...this.entries],
    };
  }

  reset(): void {
    this.entries = [];
    this.total = 0;
    this.era = 0;
    this.maxEra = 0;
    this.nextId = 1;
    this.miles = {
      pop: new Set(), rate: new Set(), bld: new Set(), land: new Set(), coin: new Set(), eco: new Set(),
      pw: new Set(), gs: new Set(), edu: new Set(), sec: new Set(), fire: new Set(), med: new Set(),
    };
  }

  serialize(): string {
    return JSON.stringify({
      e: this.entries, tot: this.total, era: this.era, maxEra: this.maxEra, nid: this.nextId,
      m: {
        pop: [...this.miles.pop], rate: [...this.miles.rate], bld: [...this.miles.bld],
        land: [...this.miles.land], coin: [...this.miles.coin], eco: [...this.miles.eco],
        pw: [...this.miles.pw], gs: [...this.miles.gs], edu: [...this.miles.edu], sec: [...this.miles.sec],
        fire: [...this.miles.fire], med: [...this.miles.med],
      },
    });
  }

  /** 恢复（坏档给空册；返回是否恢复成功） */
  restore(raw: unknown): boolean {
    this.reset();
    if (typeof raw !== 'string') return false;
    try {
      const d = JSON.parse(raw) as {
        e?: unknown; tot?: unknown; era?: unknown; maxEra?: unknown; nid?: unknown; m?: {
          pop?: unknown; rate?: unknown; bld?: unknown; land?: unknown; coin?: unknown;
          eco?: unknown; pw?: unknown; gs?: unknown; edu?: unknown; sec?: unknown;
          fire?: unknown; med?: unknown;
        };
      };
      if (!Array.isArray(d.e)) return false;
      const CATS = ['era', 'event', 'tech', 'fest', 'ord', 'mile', 'rev'];
      const TONES = ['good', 'bad', 'big', 'info'];
      let nid = 1;
      for (const it of d.e) {
        const x = it as Partial<ChronEntry>;
        if (!x || typeof x.title !== 'string' || typeof x.text !== 'string') continue;
        const cat = CATS.includes(String(x.cat)) ? x.cat as ChronCat : 'mile';
        const tone = TONES.includes(String(x.tone)) ? x.tone as ChronTone : 'info';
        const id = Number(x.id);
        const hv = Number(x.h);
        this.entries.push({
          id: Number.isFinite(id) && id > 0 ? id : nid,
          day: Math.max(1, Math.floor(Number(x.day) || 1)),
          h: Number.isFinite(hv) && hv >= 0 ? hv : undefined,   // v28 年表锚点（旧档回退当日正午）
          cat, tone,
          icon: typeof x.icon === 'string' && x.icon ? x.icon : 'book',
          title: x.title.slice(0, 24), text: x.text.slice(0, 200),
        });
        nid = Math.max(nid, (Number.isFinite(id) ? id : 0) + 1);
      }
      if (!this.entries.length) return false;
      this.total = Math.max(this.entries.length, Math.floor(Number(d.tot) || 0));
      this.era = Math.max(0, Math.min(ERAS.length - 1, Math.floor(Number(d.era) || 0)));
      this.maxEra = Math.max(this.era, Math.min(ERAS.length - 1, Math.floor(Number(d.maxEra) || 0)));
      this.nextId = Math.max(nid, Math.floor(Number(d.nid) || 0), this.entries[this.entries.length - 1].id + 1);
      const L = (v: unknown) => (Array.isArray(v) ? v.filter((n) => Number.isFinite(n)).map(Number) : []);
      this.miles = {
        pop: new Set(L(d.m?.pop)), rate: new Set(L(d.m?.rate)), bld: new Set(L(d.m?.bld)),
        land: new Set(L(d.m?.land)), coin: new Set(L(d.m?.coin)), eco: new Set(L(d.m?.eco)),
        pw: new Set(L(d.m?.pw)), gs: new Set(L(d.m?.gs)), edu: new Set(L(d.m?.edu)), sec: new Set(L(d.m?.sec)),
        fire: new Set(L(d.m?.fire)), med: new Set(L(d.m?.med)),
      };
      return true;
    } catch {
      this.reset();
      return false;
    }
  }
}
