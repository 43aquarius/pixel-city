// ============================================================
// tutorial.ts — v14 新手引导：轻量步骤状态机
// 纯逻辑 + localStorage 持久化（玩家级，不随城市存档），
// 横幅 UI 由 PixelCity.tsx 渲染，条件上下文由 React 侧
// 每次经营心跳（econ / stats 更新）拼装后喂给 check()。
// 设计原则：
//   · 只教 UI 与核心循环（修路→建房→迎市民→开店→看面板→认市民），
//     不复刻任务链（任务卡本身就在持续引导）
//   · 步骤顺序推进：条件满足即自动滑到下一个未完成步
//   · 老玩家（本机已有城市存档）首次静默结业，不打扰
//   · 随时可跳过，帮助面板可随时重看
// ============================================================

/** 引导上下文：由 React 侧每次经营心跳拼装 */
export type TutCtx = {
  roads: number;            // 当前道路格数
  cap: number;              // 住房容量
  pop: number;              // 人口
  jobs: number;             // 岗位数
  fiscalOpened: boolean;    // 本次会话打开过财政报告
  citzOpened: boolean;      // 本次会话打开过市民列传
};

export type TutStep = {
  id: string;
  title: string;
  text: string;
  /** 目标短语（横幅行动条用语） */
  goal: string;
  cond: (c: TutCtx) => boolean;
  /** 欢迎步：由按钮推进 */
  welcome?: boolean;
  /** 结业步：由按钮推进 */
  finale?: boolean;
};

export const TUT_STEPS: TutStep[] = [
  {
    id: 'welcome', title: '欢迎来到像素都市', welcome: true,
    goal: '了解游戏目标',
    text: '市长你好！眼前是你的荒地 —— 修路、建房、通电、通商，看着市民迁入、马车与电车穿梭、万家灯火点亮夜空。',
    cond: () => false,
  },
  {
    id: 'road', title: '第一步：修路',
    goal: '铺设 5 格道路',
    text: '工具条选「道路」(热键 3)，从市政厅旁向外拖出至少 5 格 —— 要想富，先修路，市民和车辆都沿着路走。',
    cond: c => c.roads >= 5,
  },
  {
    id: 'home', title: '安得广厦',
    goal: '住房容量达到 15',
    text: '建造中心 → 住宅分组 → 小型住宅 (45G)，沿路放 3 座 —— 有了住房，市民才会迁入，城市才算开张。',
    cond: c => c.cap >= 15,
  },
  {
    id: 'folk', title: '第一批市民',
    goal: '人口达到 5',
    text: '看顶部 HUD 的「人口」芯片：市民正沿路陆续迁入。人口每 +2，就有一位新市民写进「市民列传」。',
    cond: c => c.pop >= 5,
  },
  {
    id: 'job', title: '开门营业',
    goal: '提供 3 个岗位',
    text: '商业分组建一座便利店 (70G) 或沿街商铺 (80G)：岗位带来就业与税收 —— 之后工业产货供商业上货，还能出口创汇。',
    cond: c => c.jobs >= 3,
  },
  {
    id: 'fiscal', title: '打开钱袋子',
    goal: '查看一次财政报告',
    text: '点击市政厅（或顶部 LV 芯片）打开财政报告：税率滑杆、收支明细、出口市价与市政法令都在这座大楼里。',
    cond: c => c.fiscalOpened,
  },
  {
    id: 'citz', title: '认识你的市民',
    goal: '打开一次市民列传',
    text: '点顶栏「民」芯片打开市民列传：有名有姓的市民在此立传。也可切「观察」工具，点击街上的行人打招呼。',
    cond: c => c.citzOpened,
  },
  {
    id: 'finale', title: '引导完成！', finale: true,
    goal: '毕业',
    text: '左侧任务卡会持续指引：电力、粮仓、货物链、电车、应急联动……这座城市的故事，由你继续书写。',
    cond: () => false,
  },
];

const TUT_KEY = 'pxc_tut_v1';

export class Tutorial {
  /** 当前步骤下标（含欢迎 / 结业步） */
  step = 0;
  dismissed = false;
  finished = false;
  /** 本机是否已有引导记录（区分新老玩家） */
  existed = false;

  static load(): Tutorial {
    const t = new Tutorial();
    try {
      const raw = localStorage.getItem(TUT_KEY);
      if (raw) {
        const d = JSON.parse(raw) as { step?: number; dismissed?: boolean; finished?: boolean };
        t.existed = true;
        t.step = Math.max(0, Math.min(TUT_STEPS.length - 1, Number(d.step) || 0));
        t.dismissed = d.dismissed === true;
        t.finished = d.finished === true;
      }
    } catch { /* 数据损坏时从头开始 */ }
    return t;
  }

  save(): void {
    try {
      localStorage.setItem(TUT_KEY, JSON.stringify({
        step: this.step, dismissed: this.dismissed, finished: this.finished,
      }));
    } catch { /* 存储满时忽略 */ }
  }

  /** 本机无引导记录但已有城市存档 → 老玩家静默结业 */
  skipForVeteran(hasSave: boolean): void {
    if (!this.existed && hasSave) {
      this.finished = true;
      this.save();
    }
  }

  /** 条件推进（welcome / finale 由按钮推进）；返回是否推进（供音效） */
  check(ctx: TutCtx): boolean {
    if (this.dismissed || this.finished) return false;
    let advanced = false;
    while (!this.dismissed && !this.finished) {
      const st = TUT_STEPS[this.step];
      if (!st) { this.finished = true; this.save(); break; }
      if (st.welcome || st.finale) break;      // 按钮步：等用户点
      if (!st.cond(ctx)) break;
      this.step++;
      advanced = true;
      if (this.step >= TUT_STEPS.length) this.finished = true;
    }
    if (advanced) this.save();
    return advanced;
  }

  /** 欢迎步「开始引导」/ 结业步「毕业」按钮 */
  advanceButton(): void {
    if (this.dismissed || this.finished) return;
    const st = TUT_STEPS[this.step];
    if (st && (st.welcome || st.finale)) {
      this.step++;
      if (this.step >= TUT_STEPS.length) this.finished = true;
      this.save();
    }
  }

  dismiss(): void {
    this.dismissed = true;
    this.save();
  }

  restart(): void {
    this.step = 0;
    this.dismissed = false;
    this.finished = false;
    this.save();
  }

  get current(): TutStep | null { return TUT_STEPS[this.step] ?? null; }

  /** 是否应显示横幅 */
  get active(): boolean { return !this.dismissed && !this.finished; }
}
