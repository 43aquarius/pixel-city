'use client';

// ============================================================
// PixelCity.tsx — 像素都市 · 界面壳与交互面板
//   桌面：右上建造中心（整板 + 四分组均可折叠）/ 左侧浮动工具条
//   移动：底部抽屉 + 横滚工具条 + 大触控目标
//   收缩状态 / 行人开关 持久化到 localStorage
// ============================================================

import {
  useEffect, useRef, useState, useCallback, useSyncExternalStore,
} from 'react';
import '@/lib/pixelcity/pixelcity.css';
import { Engine, type Tool } from '@/lib/pixelcity/engine';
import { Beeper } from '@/lib/pixelcity/audio';
import { CATALOG, defById, type Cat, type Def } from '@/lib/pixelcity/catalog';
import { PALETTE } from '@/lib/pixelcity/palette';
import { iconURI } from '@/lib/pixelcity/icons';
import {
  Tycoon, ECON, costOf, unlockOf, fmtG, QUESTS, TECHS, BRANCHES, TECH_GATE, techNameOf,
  taxMood, TAX_MIN, TAX_MAX, SEASONS, FESTS, CYC_PHASES, CYC_MIN, CYC_MAX, ZOO_SPECIES,
  type EconView, type HistPoint,
} from '@/lib/pixelcity/tycoon';
import { RELICS } from '@/lib/pixelcity/relics';   // v38 出土图鉴（三套系 12 件渲染源）
import type { CitzCard } from '@/lib/pixelcity/citizens';
import { ERAS, chaptersOf, statsOf, volName, eraBandsOf, timelineOf, densityOf, hOf } from '@/lib/pixelcity/chronicle';
import { Tutorial, TUT_STEPS } from '@/lib/pixelcity/tutorial';

const ICON_NAMES = [
  'undo', 'redo', 'zoomin', 'zoomout', 'sound', 'soundoff',
  'view', 'grass', 'water', 'sand', 'farm', 'rock', 'tree', 'road',
  'house', 'shop', 'factory', 'park', 'doze', 'city',
  'save', 'random', 'exportp', 'atlas',
  'person', 'personoff', 'menu',
  'snow', 'flower', 'dry', 'swamp', 'autumn',
  'coin', 'people', 'bolt', 'smile', 'star', 'lock', 'flag', 'land', 'chart',
  'wheat', 'book', 'flask', 'heart', 'up', 'down', 'job', 'medal',
  'sun', 'cloud', 'rain', 'snoww',
  'spr', 'sum', 'fall', 'win', 'drop', 'bridge',
  'camera', 'box', 'fire', 'shield', 'mail', 'fest', 'scroll', 'ball',
  'paw', 'rabbit', 'goat', 'deer', 'peacock', 'flamingo', 'redpanda', 'penguin', 'koi', 'panda',
  'plane',
];

type Phase = 'loading' | 'ready';

type CellItem = { id: string; v: number; name: string; uri: string };

type SubCat = Cat | 'terr';

const CAT_META: Array<{ key: Cat; name: string; icon: string }> = [
  { key: 'res', name: '住宅', icon: 'house' },
  { key: 'com', name: '商业', icon: 'shop' },
  { key: 'ind', name: '工业', icon: 'factory' },
  { key: 'civ', name: '公共', icon: 'park' },
];

const TERR_OPTS: Array<{ k: number; label: string; icon: string; desc: string }> = [
  { k: 0, label: '草地', icon: 'grass', desc: '基础绿地，可长树，可铺路' },
  { k: 1, label: '水域', icon: 'water', desc: '河流湖泊，会淹没地上物' },
  { k: 2, label: '沙地', icon: 'sand', desc: '海岸沙滩，适合灯塔' },
  { k: 3, label: '耕地', icon: 'farm', desc: '金黄/翠绿作物条田拼布' },
  { k: 4, label: '岩石', icon: 'rock', desc: '碎石荒原与孤立巨石' },
  { k: 5, label: '雪地', icon: 'snow', desc: '北国雪原：岸冰、雪堆与松林' },
  { k: 6, label: '花田', icon: 'flower', desc: '五彩花畦，浪漫田园' },
  { k: 7, label: '荒漠', icon: 'dry', desc: '龟裂旱地戈壁，几乎不可开发' },
  { k: 8, label: '沼泽', icon: 'swamp', desc: '苔藓水洼湿地，保留野趣' },
  { k: 9, label: '秋原', icon: 'autumn', desc: '金秋草原，红叶点点' },
];

/** 一键城市密度档位 */
const DENSITIES: Array<{ v: number; label: string; desc: string }> = [
  { v: 0.55, label: '疏朗', desc: '低密度：大留白 + 更多绿树' },
  { v: 0.8, label: '适中', desc: '推荐密度：疏密有致' },
  { v: 1.05, label: '繁华', desc: '高密度：接近无空隙的都市' },
];

/** v17 编年史筛选匹配（all / bad 灾祸 / good 喜讯含科技节庆 / 其余按分类） */
function chronMatch(x: { cat: string; tone: string }, f: string): boolean {
  if (f === 'all') return true;
  if (f === 'bad') return x.cat === 'event' && x.tone === 'bad';
  if (f === 'good') return (x.cat === 'event' && x.tone === 'good') || x.cat === 'tech' || x.cat === 'fest';
  return x.cat === f;
}

/** 城市志历史曲线（复古像素风：色板取色 + 点阵网格 + 整数坐标） */
function HistChart({ data, field, color, label, unit }: {
  data: HistPoint[]; field: 'pop' | 'coins' | 'net' | 'hap';
  color: string; label: string; unit: string;
}) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    const W = cv.width, H = cv.height;
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#0B0F24';
    ctx.fillRect(0, 0, W, H);
    // 点阵网格（每 8px 一格）
    ctx.fillStyle = 'rgba(122,140,158,0.25)';
    for (let gy = 8; gy < H - 8; gy += 8) {
      for (let gx = 8; gx < W - 8; gx += 8) ctx.fillRect(gx, gy, 1, 1);
    }
    ctx.strokeStyle = 'rgba(122,140,158,0.5)';
    ctx.strokeRect(0.5, 0.5, W - 1, H - 1);
    const pts = data.map(p => p[field]);
    if (pts.length < 2) {
      ctx.fillStyle = '#7A8C9E';
      ctx.font = '9px monospace';
      ctx.fillText('采样中… 每 15 秒记录一点', 10, H / 2 + 3);
      return;
    }
    let lo = Math.min(...pts), hi = Math.max(...pts);
    if (hi - lo < 1e-6) { hi = lo + 1; }
    const pad = (hi - lo) * 0.08;
    lo -= pad; hi += pad;
    const x0 = 4, x1 = W - 4, y0 = 6, y1 = H - 12;
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    pts.forEach((v, i) => {
      const px = Math.round(x0 + (x1 - x0) * i / (pts.length - 1));
      const py = Math.round(y1 - (y1 - y0) * (v - lo) / (hi - lo));
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    });
    ctx.stroke();
    // 末点亮点 + 数值
    const last = pts[pts.length - 1];
    const lx = x1, ly = Math.round(y1 - (y1 - y0) * (last - lo) / (hi - lo));
    ctx.fillStyle = color;
    ctx.fillRect(lx - 2, ly - 2, 4, 4);
    ctx.font = 'bold 10px monospace';
    const fmt = (n: number) =>
      Math.abs(n) >= 1000 ? `${(n / 1000).toFixed(1)}k` : `${Math.round(n * 10) / 10}`;
    ctx.fillText(`${fmt(last)}${unit}`, 8, 10);
    // 区间注记
    ctx.fillStyle = 'rgba(122,140,158,0.8)';
    ctx.font = '8px monospace';
    ctx.fillText(fmt(hi), W - 34, 10);
    ctx.fillText(fmt(lo), W - 34, H - 4);
  }, [data, field, color, unit]);
  return (
    <div className="dchart">
      <canvas ref={ref} width={236} height={72} aria-label={`${label}曲线`} />
      <span>{label}</span>
    </div>
  );
}

const PED_STEP = 20;
const PED_MAX = 300;

const TOOLBAR: Array<{ icon: string; label: string; tool: Tool; cat?: Cat; hot: string }> = [
  { icon: 'view', label: '观察', tool: { t: 'view' }, hot: '1' },
  { icon: 'tree', label: '植树', tool: { t: 'tree' }, hot: '2' },
  { icon: 'road', label: '道路', tool: { t: 'road' }, hot: '3' },
  { icon: 'grass', label: '地形', tool: { t: 'terr', k: 0 }, hot: '4' },
  { icon: 'up', label: '抬升', tool: { t: 'lift' }, hot: '0' },
  { icon: 'down', label: '降低', tool: { t: 'sink' }, hot: '-' },
  { icon: 'house', label: '住宅', tool: { t: 'build', id: 'house', variant: 0 }, cat: 'res', hot: '5' },
  { icon: 'shop', label: '商业', tool: { t: 'build', id: 'shop', variant: 0 }, cat: 'com', hot: '6' },
  { icon: 'factory', label: '工业', tool: { t: 'build', id: 'factory', variant: 0 }, cat: 'ind', hot: '7' },
  { icon: 'park', label: '公共', tool: { t: 'build', id: 'park', variant: 0 }, cat: 'civ', hot: '8' },
  { icon: 'doze', label: '拆除', tool: { t: 'doze' }, hot: '9' },
];

// ---------------- 界面收缩状态（持久化） ----------------

type UiState = {
  panel: boolean;    // 桌面右侧建造中心
  toolbar: boolean;  // 浮动工具条
  build: boolean;    // 建造面板分组
  mini: boolean;     // 小地图分组
  cityops: boolean;  // 市政操作分组
  about: boolean;    // 关于分组
  drawer: boolean;   // 移动端抽屉
  crowds: boolean;   // 行人 / 车辆
  min: boolean;      // 标题栏最小化
  pedsAuto: boolean; // 行人数量：自动 / 手动
  pedsN: number;     // 手动行人目标数
  density: number;   // 一键城市密度
  dayAuto: boolean;  // 昼夜：自动循环 / 手动定格
  daySpeed: number;  // 自动循环速度 ×1/×2/×4
  dayT: number;      // 上次保存的时刻（0-24）
  quest: boolean;    // 经营模式任务卡展开
  mode: 'tycoon' | 'sandbox';  // 上次游玩模式
};

const UI_DEFAULT: UiState = {
  panel: true, toolbar: true, build: true, mini: true,
  cityops: true, about: false, drawer: false, crowds: true, min: false,
  pedsAuto: true, pedsN: 100, density: 0.8,
  dayAuto: true, daySpeed: 1, dayT: 10,
  quest: true, mode: 'tycoon',
};

const UI_KEY = 'pxc_ui_v1';

function loadUi(): UiState {
  try {
    const raw = localStorage.getItem(UI_KEY);
    if (raw) return { ...UI_DEFAULT, ...(JSON.parse(raw) as Partial<UiState>) };
  } catch { /* 忽略 */ }
  return { ...UI_DEFAULT };
}

// ---- 外部 UI 状态存储（localStorage 持久化，useSyncExternalStore 水合安全）----
let uiStore: UiState = (() => {
  try {
    const raw = localStorage.getItem(UI_KEY);
    if (raw) return { ...UI_DEFAULT, ...(JSON.parse(raw) as Partial<UiState>) };
  } catch { /* SSR / 数据损坏时用默认值 */ }
  return { ...UI_DEFAULT };
})();
const uiSubs = new Set<() => void>();

function setUiStore(next: (u: UiState) => UiState): void {
  uiStore = next(uiStore);
  try { localStorage.setItem(UI_KEY, JSON.stringify(uiStore)); } catch { /* 忽略 */ }
  for (const fn of uiSubs) fn();
}

function useUiState(): [UiState, typeof setUiStore] {
  const subscribe = useCallback((cb: () => void) => {
    uiSubs.add(cb);
    return () => { uiSubs.delete(cb); };
  }, []);
  const snap = useSyncExternalStore(subscribe, () => uiStore, () => UI_DEFAULT);
  return [snap, setUiStore];
}

function toolHint(t: Tool): string {
  switch (t.t) {
    case 'view': return '拖动平移 · 滚轮/双指缩放 · 空格居中';
    case 'terr': return `按住拖动画画「${TERR_OPTS[t.k]?.label ?? '地形'}」（水域会淹没地上物）`;
    case 'tree': return '点击或拖动，种下随机小树（共 6 种，含樱花与棕榈）';
    case 'road': return '按住拖出路网，转角自动拼接';
    case 'lift': return '上帝之手：抬升地形造山（海拔 0→1 为填海成陆；经营模式 5G/级）';
    case 'sink': return '上帝之手：降低地形挖谷（海拔 1→0 化为水域；经营模式 5G/级）';
    case 'doze': return '拆除建筑 / 道路 / 树木：左键点击或拖拽连拆 · 任意工具下右键点击也可快速拆除 · 经营模式返还造价 50%，道路与树木近全额返还';
    case 'build': {
      const d = defById(t.id);
      return `点击放置「${d.name}」占地 ${d.w}×${d.h}${d.pop ? ` · 容纳 ${d.pop} 人` : ''}`;
    }
  }
}

export default function PixelCity() {
  const [phase, setPhase] = useState<Phase>('loading');
  const [prog, setProg] = useState({ frac: 0, label: '初始化调色板' });
  const [tool, setTool] = useState<Tool>({ t: 'view' });
  const [subCat, setSubCat] = useState<SubCat>('terr');
  const [stats, setStats] = useState({ pop: 0, buildings: 0, roads: 0, trees: 0 });
  const [crowd, setCrowd] = useState({ peds: 0, cars: 0, pets: 0, birds: 0, buses: 0, boats: 0, tourists: 0, trams: 0, firetrucks: 0, ambulances: 0, patrols: 0 });
  const [hover, setHover] = useState<{ tx: number; ty: number } | null>(null);
  const [fps, setFps] = useState(0);
  const [zoom, setZoom] = useState(2);
  /** v17 城市编年史：筛选器（all / 分类） */
  const [chronFilter, setChronFilter] = useState<string>('all');
  /** v27 城史长卷：全景阅读页开关 + 检索关键字 + 当前读到第几卷（导航高亮） */
  const [chronWide, setChronWide] = useState(false);
  const [cwQuery, setCwQuery] = useState('');
  const [cwEra, setCwEra] = useState(0);
  /** v28 阅读方式：scroll 分卷长卷 / tl 大事年表 */
  const [cwMode, setCwMode] = useState<'scroll' | 'tl'>('scroll');
  /** v28 年表悬停卡（fixed 定位跟随鼠标） */
  const [cwTip, setCwTip] = useState<{ x: number; y: number; day: number; title: string; text: string; tone: string } | null>(null);
  const cwScrollRef = useRef<HTMLDivElement | null>(null);
  const cwChapRefs = useRef<Array<HTMLElement | null>>([]);
  /** v27 移动端卷目横条：左右渐隐暗示（滚动感知） */
  const [cwNavMore, setCwNavMore] = useState({ l: false, r: false });
  const cwNavScrollRef = useRef<HTMLDivElement | null>(null);
  const [modal, setModal] = useState<'none' | 'save' | 'help' | 'fiscal' | 'tech' | 'data' | 'policy' | 'citz' | 'mail' | 'anth' | 'fest' | 'lg' | 'zoo' | 'chron' | 'gov' | 'sis' | 'news' | 'hall' | 'metro' | 'air'>('none');
  const [econ, setEcon] = useState<EconView | null>(null);
  /** v39 城市日报：当前翻阅的过刊下标（0 = 最新一期） */
  const [npSel, setNpSel] = useState(0);
  const [confirmReset, setConfirmReset] = useState(false);
  const [toast, setToast] = useState<{ id: number; msg: string } | null>(null);
  /** v13 市民列传：选中市民（null=名人册网格）；街头偶遇的市民卡片 */
  const [citzSel, setCitzSel] = useState<number | null>(null);
  const [citzSpot, setCitzSpot] = useState<CitzCard | null>(null);
  /** v15 市长信箱：选中信件 id（null = 列表视图） */
  const [mailSel, setMailSel] = useState<number | null>(null);
  /** v15 信箱视图版本号（回信后强制刷新） */
  const [mailVer, setMailVer] = useState(0);
  /** v30 书信合集：分类过滤（全部/民生/灾警/颂声/见闻）+ 选中归档信 id（null = 卡片墙） */
  const [anthCat, setAnthCat] = useState('全部');
  const [anthSel, setAnthSel] = useState<number | null>(null);
  /** v29 市长公署：视图版本号（朱批后强制刷新）+ 盖章动画（seal 字 + 时间戳为 key） */
  const [govVer, setGovVer] = useState(0);
  const [govSeal, setGovSeal] = useState<{ seal: string; k: number } | null>(null);
  const [citzVoice, setCitzVoice] = useState<{ name: string; text: string; mood: number } | null>(null);
  /** v14 新手引导：状态机实例（ref）+ 渲染快照（state） */
  const tutRef = useRef<Tutorial | null>(null);
  const [tutSnap, setTutSnap] = useState<{ step: number; active: boolean }>({ step: 0, active: false });
  /** v14 引导条件：本次会话是否打开过财政 / 市民列传 */
  const fiscalSeenRef = useRef(false);
  const citzSeenRef = useRef(false);
  /** v14 声音设置弹层 + 主音量即时值 */
  const [sndPop, setSndPop] = useState(false);
  const [sndVol, setSndVol] = useState(0.7);
  const [soundOn, setSoundOn] = useState(true);
  /** 税率滑杆即时值（null=跟随引擎），避免等下一心跳 */
  const [taxDraft, setTaxDraft] = useState<number | null>(null);
  const [slotMeta, setSlotMeta] = useState<Array<{ time: string; pop: number } | null>>([null, null, null]);
  const [cellsByCat, setCellsByCat] = useState<Record<string, CellItem[]>>({});
  const [iconSrc, setIconSrc] = useState<Record<string, string>>({});
  const [clock, setClock] = useState({ text: '10:00', ph: '昼' });
  const [season, setSeasonS] = useState(1);
  /** 沙盒四季：自动轮转开关镜像（engine.seasonAuto → state，避免渲染期读 ref） */
  const [seasonAutoS, setSeasonAutoS] = useState(true);
  /** v13 市民列传：模态内使用的引擎句柄（打开时捕获到 state，避免渲染期读 ref） */
  const [citzEng, setCitzEng] = useState<Engine | null>(null);
  const [ui] = useUiState();
  const [isMobile, setIsMobile] = useState(false);

  const engineRef = useRef<Engine | null>(null);
  const beeperRef = useRef<Beeper | null>(null);
  const viewRef = useRef<HTMLCanvasElement | null>(null);
  const miniRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const toastTimer = useRef<number>(0);
  const clockTick = useRef(0);
  const deficitRef = useRef(false);

  const say = useCallback((msg: string) => {
    setToast({ id: Date.now(), msg });
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 2400);
  }, []);

  const toggle = useCallback((k: keyof UiState) => {
    setUiStore(u => ({ ...u, [k]: !u[k] }));
    beeperRef.current?.play('click');
  }, []);

  /** 小地图挂载点（桌面侧栏 / 移动抽屉二选一），断点切换时重绑 */
  const miniRefCb = useCallback((cv: HTMLCanvasElement | null) => {
    miniRef.current = cv;
    if (cv) engineRef.current?.rebindMini(cv);
  }, []);

  // ---------------- 断点检测 ----------------
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 820px)');
    const upd = () => setIsMobile(mq.matches);
    upd();
    mq.addEventListener('change', upd);
    return () => mq.removeEventListener('change', upd);
  }, []);

  // ---------------- 引擎生命周期 ----------------
  useEffect(() => {
    const beeper = new Beeper();
    const eng = new Engine(beeper);
    engineRef.current = eng;
    beeperRef.current = beeper;
    eng.hooks = {
      onStats: setStats,
      onHover: (tx, ty) => setHover({ tx, ty }),
      onZoom: setZoom,
      onTool: setTool,
      onFps: setFps,
      onEcon: (e) => {
        setEcon(e);
        if (e) {
          if (e.coins < 0 && !deficitRef.current) {
            deficitRef.current = true;
            say('财政赤字！拆除高维护建筑或暂停扩张，等待收支回正');
          } else if (e.coins >= 0) deficitRef.current = false;
        }
      },
      onTycoonMsg: say,
      onHallClick: () => setModal('fiscal'),
      onPedestrianClick: (c) => {   // v13 观察工具点击行人 → 市民名片
        setCitzSpot(c);
        setCitzSel(null);
        setCitzEng(eng);
        setModal('citz');
      },
    };
    let disposed = false;

    void eng.init((frac, label) => setProg({ frac, label })).then(() => {
      if (disposed || !viewRef.current) return;
      const u0 = loadUi();
      eng.setCrowds(u0.crowds);
      eng.setPedTarget(u0.pedsAuto ?? true, u0.pedsN ?? 100);
      eng.cityDensity = u0.density ?? 0.8;
      eng.setTimeOfDay(u0.dayT ?? 10);
      eng.setDayNight(u0.dayAuto ?? true, u0.daySpeed ?? 1);
      setClock({ text: eng.clockText(), ph: eng.phaseChar() });
      eng.attach(viewRef.current, miniRef.current);
      // 调试句柄（控制台观察引擎状态用）
      (window as unknown as { __pxc: unknown }).__pxc = eng;
      setStats(eng.map.stats());
      const acc: Record<string, CellItem[]> = { res: [], com: [], ind: [], civ: [] };
      for (const d of CATALOG) {
        for (let v = 0; v < d.variants; v++) {
          acc[d.cat].push({
            id: d.id, v, name: d.name,
            uri: eng.book.get(d.id, v).thumb.toDataURL('image/png'),
          });
        }
      }
      setCellsByCat(acc);
      const iuMap: Record<string, string> = {};
      for (const n of ICON_NAMES) iuMap[n] = iconURI(n);
      setIconSrc(iuMap);
      setPhase('ready');
      // ---- 模式恢复：默认经营（新玩家从荒地开始）----
      // v14 新手引导：本机无引导记录但已有城市存档 → 老玩家静默结业；
      // 否则立即落盘（新手中途 reload 不丢引导进度、也不会被误判为老玩家）
      tutRef.current = Tutorial.load();
      if ((u0.mode ?? 'tycoon') === 'tycoon') {
        const saved = Tycoon.loadRaw();
        const earned = eng.enterTycoon(saved as Record<string, unknown> | null);
        if (saved && earned > 0) say(`欢迎回来！离线期间城市收入 +${fmtG(earned)}G`);
        else if (!saved) say('经营模式：从一块荒地开始 —— 修路 · 建房 · 购地 · 扩张！');
        tutRef.current.skipForVeteran(!!saved);
      }
      tutRef.current.save();
      setTutSnap({ step: tutRef.current.step, active: tutRef.current.active });
      // v14 音效偏好（localStorage）同步到 UI
      setSoundOn(beeper.enabled);
      setSndVol(beeper.volume);
      beeper.play('open');
    });

    const ro = new ResizeObserver(() => eng.resize());
    if (wrapRef.current) ro.observe(wrapRef.current);

    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.ctrlKey || e.metaKey || e.altKey) return;
      const eng2 = engineRef.current;
      if (!eng2) return;
      if (e.code === 'KeyG') {
        e.preventDefault();
        const rep = eng2.generateCity();
        if (rep) say(`一键城市：${rep.buildings} 栋 · 人口 ${rep.pop}`);
        else say('可用平地不足，先换个地形试试');
        return;
      }
      const map: Record<string, Tool> = {
        Digit1: { t: 'view' },
        Digit2: { t: 'tree' },
        Digit3: { t: 'road' },
        Digit4: { t: 'terr', k: 0 },
        Digit5: { t: 'build', id: 'house', variant: 0 },
        Digit6: { t: 'build', id: 'shop', variant: 0 },
        Digit7: { t: 'build', id: 'factory', variant: 0 },
        Digit8: { t: 'build', id: 'park', variant: 0 },
        Digit9: { t: 'doze' },
        Digit0: { t: 'lift' },
        Minus: { t: 'sink' },
      };
      const t = map[e.code];
      if (t) {
        e.preventDefault();
        if (t.t === 'build') {
          const cat = defById(t.id).cat;
          setSubCat(cat);
        }
        if (t.t === 'terr') setSubCat('terr');
        eng2.setTool(t);
      }
    };
    window.addEventListener('keydown', onKey);

    const crowdTimer = window.setInterval(() => {
      const eng3 = engineRef.current;
      if (eng3) {
        setCrowd(eng3.crowdCount());
        setClock({ text: eng3.clockText(), ph: eng3.phaseChar() });
        setSeasonS(eng3.season);   // v6：季节状态同步（沙盒 HUD 芯片用）
        setSeasonAutoS(eng3.seasonAuto);   // 沙盒四季自动轮转镜像
        // 每分钟把当前时刻回写持久化（供下次启动恢复）
        clockTick.current = (clockTick.current + 1) % 60;
        if (clockTick.current === 0) {
          setUiStore(u => (Math.abs((u.dayT ?? 10) - eng3.timeOfDay) < 0.02 ? u : { ...u, dayT: eng3.timeOfDay }));
        }
      }
    }, 1000);

    return () => {
      disposed = true;
      ro.disconnect();
      window.removeEventListener('keydown', onKey);
      window.clearInterval(crowdTimer);
      window.clearTimeout(toastTimer.current);
      eng.destroy();
    };
  }, [say]);

  // ---------------- 目录数据 ----------------
  const cells = subCat === 'terr' ? [] : cellsByCat[subCat] ?? [];
  const BLANK = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==';
  const iu = useCallback((n: string) => iconSrc[n] ?? BLANK, [iconSrc]);

  // ---------------- 交互 ----------------
  const pickTool = useCallback((t: Tool, cat?: SubCat) => {
    const eng = engineRef.current;
    if (!eng) return;
    if (cat) setSubCat(cat);
    eng.setTool(t);
    beeperRef.current?.play('click');
  }, []);

  const pickCell = useCallback((id: string, v: number) => {
    pickTool({ t: 'build', id, variant: v });
  }, [pickTool]);

  // v13 市民列传：市民之声轮播（面板打开时每 4.5 秒换一句）
  useEffect(() => {
    if (modal !== 'citz') return;
    const upd = () => setCitzVoice(engineRef.current?.tycoon?.citzVoice() ?? null);
    upd();
    const t = window.setInterval(upd, 4500);
    return () => window.clearInterval(t);
  }, [modal]);

  // v14 新手引导：记录本次会话打开过的面板（财政 / 市民列传）
  useEffect(() => {
    if (modal === 'fiscal') fiscalSeenRef.current = true;
    if (modal === 'citz') citzSeenRef.current = true;
  }, [modal]);

  // v27 城史长卷：Esc 关闭（检索框聚焦时同样生效）；打开时卷号归一
  useEffect(() => {
    if (!chronWide) return;
    const onEsc = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') { ev.preventDefault(); setChronWide(false); }
    };
    window.addEventListener('keydown', onEsc);
    return () => window.removeEventListener('keydown', onEsc);
  }, [chronWide]);

  /** v27 城史长卷：滚动位置 → 当前卷（导航高亮 + 阅读进度） */
  const cwOnScroll = useCallback(() => {
    const box = cwScrollRef.current;
    if (!box) return;
    const boxTop = box.getBoundingClientRect().top;
    let act = 0;
    for (let i = 0; i < cwChapRefs.current.length; i++) {
      const el = cwChapRefs.current[i];
      if (el && el.getBoundingClientRect().top - boxTop <= 130) act = i;
    }
    setCwEra(prev => (prev === act ? prev : act));
  }, []);

  /** v27 卷目横滑暗示（移动端横条）：未滑到尽头时给渐隐边缘，提示可继续横滑 */
  const cwNavCheck = useCallback(() => {
    const el = cwNavScrollRef.current;
    if (!el) return;
    const l = el.scrollLeft > 3;
    const r = el.scrollLeft + el.clientWidth < el.scrollWidth - 3;
    setCwNavMore(p => (p.l === l && p.r === r ? p : { l, r }));
  }, []);
  useEffect(() => {
    if (!chronWide) return;
    const t = window.setTimeout(cwNavCheck, 0);          // 开卷/检索/切模式后重测
    const el = cwNavScrollRef.current;                    // 盒尺随布局切换（桌面侧栏↔移动横条）必变，RO 兜住视口切换
    const ro = el ? new ResizeObserver(() => cwNavCheck()) : null;
    if (el && ro) ro.observe(el);
    return () => { window.clearTimeout(t); ro?.disconnect(); };
  }, [chronWide, cwQuery, cwMode, cwNavCheck]);

  /** v28 年表跳卷：点纪事点 → 切回分卷长卷 → 滚到该笔并闪亮定位 */
  const cwJump = useCallback((id: number) => {
    setCwTip(null);
    setCwQuery('');            // 清检索，防目标笔被过滤掉
    setCwMode('scroll');
    beeperRef.current?.play('click');
    window.setTimeout(() => {
      const el = document.querySelector(`.cw-e[data-id="${id}"]`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.classList.remove('flash');
        void (el as HTMLElement).offsetWidth;   // 强制回流，重启动画
        el.classList.add('flash');
        window.setTimeout(() => el.classList.remove('flash'), 1900);
      }
    }, 120);
  }, []);

  /** v27 打开城史长卷（编年史模态入口；检索/卷号/阅读方式复位） */
  const openChronWide = useCallback(() => {
    setCwQuery('');
    setCwEra(0);
    setCwMode('scroll');
    setCwTip(null);
    setModal('none');
    setChronWide(true);
    beeperRef.current?.play('open');
    window.setTimeout(() => {
      if (cwScrollRef.current) cwScrollRef.current.scrollTop = 0;
    }, 0);
  }, []);

  // v14 新手引导：经营心跳推进（条件满足自动滑到下一步）
  useEffect(() => {
    const t = tutRef.current;
    if (!econ || !t || !t.active) return;
    const advanced = t.check({
      roads: stats.roads, cap: econ.cap, pop: econ.pop, jobs: econ.jobs,
      fiscalOpened: fiscalSeenRef.current, citzOpened: citzSeenRef.current,
    });
    setTutSnap(prev => (prev.step === t.step && prev.active === t.active)
      ? prev : { step: t.step, active: t.active });
    if (advanced) beeperRef.current?.play('quest');
  }, [econ, stats]);

  /** v14 引导：跳过（永久，帮助面板可重看） */
  const dismissTut = useCallback(() => {
    const t = tutRef.current;
    if (!t) return;
    t.dismiss();
    setTutSnap({ step: t.step, active: t.active });
    beeperRef.current?.play('click');
  }, []);

  /** v14 引导：欢迎「开始引导」/ 结业「毕业」按钮推进 */
  const advanceTut = useCallback(() => {
    const t = tutRef.current;
    if (!t) return;
    const st = TUT_STEPS[t.step];
    t.advanceButton();
    setTutSnap({ step: t.step, active: t.active });
    if (st?.finale) {
      beeperRef.current?.play('achieve');
      say('新手引导毕业！接下来的城市故事由你书写');
    } else {
      beeperRef.current?.play('open');
    }
  }, [say]);

  const openModal = useCallback((m: 'save' | 'help' | 'fiscal' | 'tech' | 'data' | 'policy' | 'citz' | 'mail' | 'anth' | 'fest' | 'lg' | 'zoo' | 'chron' | 'gov' | 'sis' | 'news' | 'hall' | 'metro' | 'air') => {
    if (m === 'save') {
      setSlotMeta([0, 1, 2].map(i => Engine.slotMeta(i)));
    }
    if (m === 'citz' || m === 'mail' || m === 'gov' || m === 'anth' || m === 'sis') setCitzEng(engineRef.current);   // 捕获引擎句柄到 state（头像/信箱/公署/合集/姊妹城市面板用）
    if (m !== 'citz') { setCitzSel(null); setCitzSpot(null); }
    if (m !== 'mail') setMailSel(null);
    if (m !== 'gov') setGovSeal(null);
    if (m !== 'anth') { setAnthSel(null); setAnthCat('全部'); }   // v30：离开合集时收起详情页并重置分类签
    setModal(m);
    beeperRef.current?.play('click');
  }, []);

  const dl = useCallback((uri: string, name: string) => {
    const a = document.createElement('a');
    a.href = uri;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }, []);

  const doGenCity = useCallback(() => {
    const eng = engineRef.current;
    if (!eng) return;
    const rep = eng.generateCity();
    if (rep) say(`一键城市：${rep.buildings} 栋建筑 · 人口 ${rep.pop} · 道路 ${rep.roads} 格`);
    else say('可用平地不足，先换个地形试试');
  }, [say]);

  const toggleCrowds = useCallback(() => {
    setUiStore(u => {
      const next = { ...u, crowds: !u.crowds };
      engineRef.current?.setCrowds(next.crowds);
      beeperRef.current?.play('click');
      return next;
    });
  }, []);

  /** 行人数量：auto / 手动；n 可为绝对值或基于当前值的增量函数（避免连点丢步） */
  const setPeds = useCallback((auto: boolean, n: number | ((prev: number) => number)) => {
    setUiStore(u => {
      const base = typeof n === 'function' ? n(u.pedsN) : n;
      return { ...u, pedsAuto: auto, pedsN: Math.max(0, Math.min(PED_MAX, Math.round(base))) };
    });
    // setUiStore 同步更新模块级 uiStore，这里读到的已是最终值
    engineRef.current?.setPedTarget(uiStore.pedsAuto, uiStore.pedsN);
    beeperRef.current?.play('click');
  }, []);

  /** 一键城市密度（对下一次生成生效） */
  const setDensity = useCallback((v: number) => {
    setUiStore(u => ({ ...u, density: v }));
    if (engineRef.current) engineRef.current.cityDensity = v;
    const d = DENSITIES.find(x => x.v === v);
    beeperRef.current?.play('click');
    if (d) say(`密度已设为「${d.label}」，点「一键城市」生效`);
  }, [say]);

  /** 昼夜：自动循环开关与倍速 */
  const setDayNight = useCallback((auto: boolean, speed: number) => {
    setUiStore(u => ({ ...u, dayAuto: auto, daySpeed: speed }));
    engineRef.current?.setDayNight(auto, speed);
    beeperRef.current?.play('click');
  }, []);

  /** 昼夜：跳转时刻 */
  const jumpTime = useCallback((h: number) => {
    const eng = engineRef.current;
    if (!eng) return;
    eng.setTimeOfDay(h);
    setClock({ text: eng.clockText(), ph: eng.phaseChar() });
    setUiStore(u => ({ ...u, dayT: h }));
    beeperRef.current?.play('click');
  }, []);

  const doSave = (i: number) => {
    const eng = engineRef.current;
    if (!eng) return;
    if (eng.saveSlot(i)) {
      say(`已保存到存档位 ${i + 1}`);
      setSlotMeta([0, 1, 2].map(k => Engine.slotMeta(k)));
    } else say('保存失败：浏览器存储不可用');
  };
  const doLoad = (i: number) => {
    const eng = engineRef.current;
    if (!eng) return;
    if (eng.loadSlot(i)) {
      say(`已读取存档 ${i + 1}`);
      setModal('none');
    } else say('该存档位是空的');
  };
  const doDelete = (i: number) => {
    try {
      localStorage.removeItem(Engine.SLOT_KEY[i]);
      localStorage.removeItem(`pxc_meta${i + 1}`);
      setSlotMeta([0, 1, 2].map(k => Engine.slotMeta(k)));
      say(`存档位 ${i + 1} 已删除`);
    } catch { /* 忽略 */ }
  };

  const curDef = tool.t === 'build' ? defById(tool.id) : null;
  const hint = toolHint(tool);

  // ---------------- 经营辅助 ----------------

  /** 建筑信息条的经营参数段 */
  const econTip = (d: Def): string => {
    const e = ECON[d.id];
    if (!e) return '';
    const bits: string[] = [`${e.cost}G`];
    if (e.power > 0) bits.push(`耗电${e.power}MW`);
    if (e.power < 0) bits.push(`发电${-e.power}MW`);
    if (d.cat === 'res') bits.push(`容纳${d.pop}人`);
    else if (d.cat === 'com' || d.cat === 'ind') bits.push(`${d.pop}岗位`);
    if (e.earn > 0) bits.push(`+${e.earn}G/分`);
    if (e.food) bits.push(`粮+${e.food}/分`);
    if (e.foodCap) bits.push(`粮仓+${e.foodCap}`);
    if (e.edu) bits.push(`教育+${e.edu}`);
    if (e.sp) bits.push(`科按+${e.sp}/分`);
    if (e.upk > 0) bits.push(`维护${e.upk}G/分`);
    if (e.amenity > 0) bits.push(`宜居+${e.amenity}`);
    if (e.pollute > 0) bits.push(`污染${e.pollute}`);
    const tg = TECH_GATE[d.id];
    if (tg) bits.push(`需研究「${techNameOf(tg)}」`);
    return ` ｜ ${bits.join(' · ')}`;
  };

  /** 收入显示：小于 100 保留 1 位小数，更大走 fmtG；负数带负号 */
  const rinc = (n: number): string =>
    n >= 100 ? fmtG(n) : `${Math.round(Math.abs(n) * 10) / 10}`;
  const rincS = (n: number): string => `${n < 0 ? '−' : '+'}${rinc(n)}`;
  /** v33 市况荣枯：秒数 → 分秒账本显示（不足 1 分钟只报秒） */
  const fmtDur = (sec: number): string => {
    const m = Math.floor(sec / 60), s = Math.floor(sec % 60);
    return m > 0 ? `${m} 分 ${s} 秒` : `${s} 秒`;
  };

  /** 经营 ⇄ 沙盒切换（经营进度独立存档，互不覆盖） */
  const switchMode = useCallback(() => {
    const eng = engineRef.current;
    if (!eng) return;
    if (eng.tycoon) {
      eng.exitTycoon();
      setUiStore(u => ({ ...u, mode: 'sandbox' }));
      say('已切换沙盒模式：自由建造，无经营限制（经营进度已保留）');
    } else {
      const data = Tycoon.loadRaw();
      const earned = eng.enterTycoon(data);
      setUiStore(u => ({ ...u, mode: 'tycoon' }));
      setTaxDraft(null);   // 恢复存档可能带回不同税率，滑杆草稿作废
      if (data && earned > 0) say(`欢迎回来！离线期间城市收入 +${fmtG(earned)}G`);
      else if (!data) say('经营模式开启：从一块荒地开始，建设你的都市！');
    }
    beeperRef.current?.play('open');
  }, [say]);

  /** 重开经营档 */
  const doNewGame = useCallback(() => {
    const eng = engineRef.current;
    if (!eng) return;
    eng.enterTycoon(null);
    setConfirmReset(false);
    setModal('none');
    setTaxDraft(null);
    say('新城已奠基：一块全新的荒地，等你书写传奇');
    beeperRef.current?.play('open');
  }, [say]);

  /** 税率调整（财政报告滑杆）：即时生效，下一心跳刷新税收与幸福 */
  const setTax = useCallback((v: number) => {
    const eng = engineRef.current;
    const t = eng?.tycoon;
    if (!t) return;
    const before = t.taxRate;
    const after = t.setTaxRate(v);
    if (after !== before) {
      setTaxDraft(after);
      beeperRef.current?.play('click');
      const mood = taxMood(after);
      say(`税率调整为 ${after}%：税收随之增减${mood !== 0 ? `，幸福度${mood > 0 ? ' +' : ' '}${Math.round(mood)}` : ''}`);
    }
  }, [say]);

  /** v11 出口市场：切换「随行就市 / 惜售囤货」（财政报告按钮） */
  const toggleHold = useCallback(() => {
    const eng = engineRef.current;
    if (!eng?.tycoon) return;
    const next = !eng.tycoon.exportHold;
    eng.setExportHold(next);
    beeperRef.current?.play('buy');
    say(next
      ? '惜售囤货：暂停自动出口，货仓囤货待涨 —— 市价走高后再恢复抛售'
      : '随行就市：恢复自动出口，货仓超八成即按当前市价外销');
  }, [say]);

  /** 研究科技（科技面板） */
  const doResearch = useCallback((id: string) => {
    const eng = engineRef.current;
    if (!eng) return;
    const t = TECHS.find(x => x.id === id);
    if (!t) return;
    const r = eng.research(id);
    if (r === 'ok') {
      say(`研究完成「${t.name}」：${t.desc}`);
      beeperRef.current?.play('quest');
    } else if (r === 'sp') {
      say(`科技点不足：「${t.name}」需要 ${t.cost} SP（建图书馆 / 学校 / 博物馆加速积累）`);
    } else if (r === 'lock') {
      const missing = t.req.filter(x => !econ?.techs.includes(x));
      if (missing.length) say(`前置未满足：需先研究「${techNameOf(missing[0])}」`);
      else if (econ && t.wis && econ.wisdom < t.wis) say(`智慧指数不足：需 ${t.wis}（当前 ${econ.wisdom}，多建图书馆 / 学校）`);
      else say('前置未满足');
    }
  }, [say, econ]);

  // ---------------- 共用分组 ----------------

  const buildGroup = (
    <div className={`pxc-group${ui.build ? '' : ' closed'}`}>
      <button className="pxc-ghead" onClick={() => toggle('build')} aria-expanded={ui.build}>
        <span>建 造 面 板</span><i>{ui.build ? '▾' : '▸'}</i>
      </button>
      {ui.build && (
        <div className="pxc-gbody">
          <div className="pxc-tabs" role="tablist">
            <button role="tab" aria-selected={subCat === 'terr'}
              className={subCat === 'terr' ? 'on' : ''}
              onClick={() => { setSubCat('terr'); beeperRef.current?.play('click'); }}>
              地形
            </button>
            {CAT_META.map(c => (
              <button key={c.key} role="tab" aria-selected={subCat === c.key}
                className={subCat === c.key ? 'on' : ''}
                onClick={() => { setSubCat(c.key); beeperRef.current?.play('click'); }}>
                {c.name}
              </button>
            ))}
          </div>
          {subCat === 'terr' ? (
            <div className="pxc-opts" style={{ gridTemplateColumns: 'repeat(5, 1fr)' }}>
              {TERR_OPTS.map(o => {
                const on = tool.t === 'terr' && tool.k === o.k;
                return (
                  <button key={o.k} className={`pxc-opt${on ? ' on' : ''}`}
                    title={o.desc} aria-label={o.label}
                    onClick={() => pickTool({ t: 'terr', k: o.k }, 'terr')}>
                    <img src={iu(o.icon)} alt="" />
                    <span>{o.label}</span>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="pxc-grid" role="grid" aria-label="建筑变体">
              {cells.map(c => {
                const on = tool.t === 'build' && tool.id === c.id && tool.variant === c.v;
                const def = defById(c.id);
                const multi = def.variants > 1;
                const lk = !!econ && unlockOf(c.id) > econ.level;
                const tg = TECH_GATE[c.id];
                const tk = !!econ && !!tg && !econ.techs.includes(tg) && !lk;
                const cost = costOf(c.id);
                const poor = !!econ && econ.coins < cost;
                return (
                  <button key={`${c.id}#${c.v}`}
                    className={`pxc-cell${on ? ' on' : ''}${lk || tk ? ' lk' : ''}`}
                    title={`${c.name}${multi ? ` · 变体 ${c.v + 1}` : ''}${econ ? ` · ${cost}G${lk ? ` · LV${unlockOf(c.id)} 解锁` : ''}${tk ? ` · 需研究「${techNameOf(tg)}」` : ''}` : ''}`}
                    aria-label={`${c.name}${multi ? `变体${c.v + 1}` : ''}`}
                    onClick={() => {
                      if (lk) { say(`「${c.name}」需要市政厅 LV${unlockOf(c.id)} 解锁`); return; }
                      if (tk) { say(`「${c.name}」需要先研究科技「${techNameOf(tg)}」`); return; }
                      pickCell(c.id, c.v);
                    }}>
                    <img src={c.uri} alt={c.name} />
                    {econ && <span className={`pxc-cost${poor ? ' poor' : ''}`}>{fmtG(cost)}G</span>}
                    {lk && <span className="pxc-lv">LV{unlockOf(c.id)}</span>}
                    {tk && <span className="pxc-lv tech">研究</span>}
                    <span className="pxc-cname">{c.name}{multi ? `·${c.v + 1}` : ''}</span>
                  </button>
                );
              })}
            </div>
          )}
          <div className="pxc-info">
            {tool.t === 'terr'
              ? <><b>{TERR_OPTS[tool.k]?.label ?? '地形'}</b><span>{TERR_OPTS[tool.k]?.desc ?? ''}{econ ? '（经营模式禁用）' : ''}</span></>
              : curDef
                ? <><b>{curDef.name}</b><span>{curDef.desc}{econ ? econTip(curDef) : ''}</span></>
                : <span>{econ ? '选择建筑开始建造；迷雾边缘的金框可购地扩张' : '选择地形或建筑，开始建造你的城市（G 键一键城市）'}</span>}
          </div>
        </div>
      )}
    </div>
  );

  const miniGroup = (
    <div className={`pxc-group${ui.mini ? '' : ' closed'}`}>
      <button className="pxc-ghead" onClick={() => toggle('mini')} aria-expanded={ui.mini}>
        <span>小 地 图</span><i>{ui.mini ? '▾' : '▸'}</i>
      </button>
      {ui.mini && (
        <div className="pxc-gbody">
          <canvas ref={miniRefCb} className="pxc-mini" aria-label="小地图" />
        </div>
      )}
    </div>
  );

  const cityOpsGroup = (
    <div className={`pxc-group${ui.cityops ? '' : ' closed'}`}>
      <button className="pxc-ghead" onClick={() => toggle('cityops')} aria-expanded={ui.cityops}>
        <span>市 政 操 作</span><i>{ui.cityops ? '▾' : '▸'}</i>
      </button>
      {ui.cityops && (
        <div className="pxc-gbody">
          {econ ? (
            <div className="pxc-row">
              <button className="pxc-btn primary" title="收入 / 电力 / 幸福度 / 领地明细"
                onClick={() => openModal('fiscal')}>
                <img src={iu('chart')} alt="" />财政报告
              </button>
              <button className="pxc-btn" title="自由建造无限制，经营进度独立保留"
                onClick={switchMode}>
                <img src={iu('view')} alt="" />沙盒模式
              </button>
            </div>
          ) : (
          <>
          <div className="pxc-row">
            <button className="pxc-btn primary" title="一键生成整座城市 (G)" onClick={doGenCity}>
              <img src={iu('city')} alt="" />一键城市
            </button>
            <button className="pxc-btn" onClick={() => { engineRef.current?.randomMap(); }}>
              <img src={iu('random')} alt="" />随机地图
            </button>
            <button className="pxc-btn" onClick={() => { engineRef.current?.clearMap(); }}>
              <img src={iu('doze')} alt="" />清空
            </button>
          </div>
          <div className="pxc-crowdrow">
            <span className="pxc-lbl">密度</span>
            {DENSITIES.map(d => (
              <button key={d.label}
                className={`pxc-btn mini${Math.abs(ui.density - d.v) < 0.01 ? ' on' : ''}`}
                title={`${d.desc}（对下一次「一键城市」生效）`}
                onClick={() => setDensity(d.v)}>
                {d.label}
              </button>
            ))}
          </div>
          <div className="pxc-row" style={{ marginTop: 4 }}>
            <button className="pxc-btn" title="上帝视角经营者：从荒地开始的城市经营" onClick={switchMode}>
              <img src={iu('land')} alt="" />经营模式
            </button>
            <span style={{ fontSize: 10, color: '#555c66', alignSelf: 'center', lineHeight: 1.5 }}>
              从荒地开始 · 购地扩张<br />任务引导 · 等级解锁
            </span>
          </div>
          </>
          )}
          <div className="pxc-crowdrow">
            <span className="pxc-lbl">行人</span>
            <button
              className={`pxc-btn mini${ui.pedsAuto ? ' on' : ''}`}
              title={ui.pedsAuto ? '自动：行人随人口增长（上限 220；夜间自动回落）' : '点此恢复自动（随人口）'}
              onClick={() => setPeds(!ui.pedsAuto, ui.pedsN)}>
              自动
            </button>
            <button className="pxc-btn mini" aria-label="减少行人"
              disabled={ui.pedsAuto || ui.pedsN <= 0}
              onClick={() => setPeds(false, prev => prev - PED_STEP)}>
              −
            </button>
            <span className="pxc-num" title="当前行人目标数（含职业角色；宠物/鸽群另计）">
              {ui.pedsAuto ? `自动·${crowd.peds}${crowd.pets ? `+${crowd.pets}宠` : ''}${crowd.birds ? `+${crowd.birds}鸽` : ''}` : `${ui.pedsN}`}
            </span>
            <button className="pxc-btn mini" aria-label="增加行人"
              disabled={ui.pedsAuto || ui.pedsN >= PED_MAX}
              onClick={() => setPeds(false, prev => prev + PED_STEP)}>
              ＋
            </button>
          </div>
          <div className="pxc-crowdrow">
            <span className="pxc-lbl">昼夜</span>
            <button
              className={`pxc-btn mini${ui.dayAuto ? ' on' : ''}`}
              title={ui.dayAuto ? '自动循环（×1 = 8 分钟一天）' : '手动定格：点此恢复自动循环'}
              onClick={() => setDayNight(!ui.dayAuto, ui.daySpeed || 1)}>
              {ui.dayAuto ? '自动' : '手动'}
            </button>
            <span className="pxc-num" title="当前时刻">{clock.text} {clock.ph}</span>
          </div>
          <div className="pxc-crowdrow">
            <span className="pxc-lbl">四季</span>
            {econ ? (
              <span className="pxc-num" title="经营模式：四季随时钟自动轮转（影响粮产 / 商业 / 用电 / 幸福）">
                {SEASONS[season]?.name ?? '夏'}季 · 自动轮转
              </span>
            ) : (
              <>
                <button
                  className={`pxc-btn mini${seasonAutoS ? ' on' : ''}`}
                  title={seasonAutoS ? '自动轮转（每季 4 分钟实时×1，随昼夜时钟）' : '手动锁定：点此恢复四季轮转'}
                  onClick={() => { engineRef.current?.setSeason(season, true); setSeasonAutoS(true); }}>
                  自动
                </button>
                {SEASONS.map((s, idx) => (
                  <button key={s.icon}
                    className={`pxc-btn mini${season === idx && !seasonAutoS ? ' on' : ''}`}
                    title={`${s.name}季：${s.note}`}
                    onClick={() => { engineRef.current?.setSeason(idx, false); setSeasonS(idx); setSeasonAutoS(false); }}>
                    {s.name}
                  </button>
                ))}
              </>
            )}
          </div>
          <div className="pxc-crowdrow">
            <span className="pxc-lbl">时速</span>
            {[1, 2, 4].map(s => (
              <button key={s}
                className={`pxc-btn mini${ui.dayAuto && (ui.daySpeed || 1) === s ? ' on' : ''}`}
                disabled={!ui.dayAuto}
                title={`昼夜循环速度 ×${s}（一天 ${s === 1 ? '8' : s === 2 ? '4' : '2'} 分钟）`}
                onClick={() => setDayNight(true, s)}>
                ×{s}
              </button>
            ))}
            <span className="pxc-lbl" style={{ marginLeft: 4 }}>场景</span>
            {([
              ['晨', 6.5, '清晨 06:30'], ['午', 12, '正午 12:00'],
              ['暮', 18.2, '黄昏 18:12'], ['夜', 22.5, '深夜 22:30'],
            ] as const).map(([ph, h, title]) => (
              <button key={ph} className="pxc-btn mini"
                title={`${title}（跳转时刻）`}
                onClick={() => jumpTime(h)}>
                {ph}
              </button>
            ))}
          </div>
          <div className="pxc-row" style={{ marginTop: 4 }}>
            {!econ && (
              <button className="pxc-btn" onClick={() => openModal('save')}>
                <img src={iu('save')} alt="" />存档…
              </button>
            )}
            <button className="pxc-btn" onClick={() => {
              const eng = engineRef.current;
              if (!eng) return;
              dl(eng.exportPNG(), `像素都市_${new Date().toISOString().slice(0, 10)}.png`);
              say('已导出画面快照 PNG');
            }}>
              <img src={iu('exportp')} alt="" />快照
            </button>
            <button className="pxc-btn" onClick={() => {
              const eng = engineRef.current;
              if (!eng) return;
              dl(eng.book.exportAtlas(), '像素都市_精灵图集.png');
              say('已导出全部精灵图集');
            }}>
              <img src={iu('atlas')} alt="" />图集
            </button>
          </div>
        </div>
      )}
    </div>
  );

  const aboutGroup = (
    <div className={`pxc-group${ui.about ? '' : ' closed'}`} style={{ marginBottom: 8 }}>
      <button className="pxc-ghead" onClick={() => toggle('about')} aria-expanded={ui.about}>
        <span>关 于</span><i>{ui.about ? '▾' : '▸'}</i>
      </button>
      {ui.about && (
        <div className="pxc-gbody">
          <div style={{ fontSize: 11, lineHeight: 1.7, color: '#3d434e' }}>
            <b style={{ color: '#8a6d1a' }}>经营模式</b>：上帝视角从一块荒地起步 —— 修路建房、人口迁入、电力供需、
            十二维民生指数（幸福/宜居/粮食/就业/供水/文化/环境/健康/安全/交通/智慧/科研）、可调税率与城市评级、16 项四分支科技树（科研决定发展上限）、购地扩张、任务引导与等级解锁（沙盒模式随时切换）；
            <b style={{ color: '#8a6d1a' }}>货物供应链</b>（工业产货 → 零售上货 → 港口出口创汇，缺货商业收入打折）、
            <b style={{ color: '#8a6d1a' }}>观光经济</b>（摩天轮/水族馆等景点招揽游客，酒店床位定接待上限，街头可见戴草帽挂相机的观光客）与
            <b style={{ color: '#8a6d1a' }}>市政法令</b>（节能令/夜间经济/消费券/公交优先等 8 条可随时颁布废止的政策）；
            <b style={{ color: '#8a6d1a' }}>四季轮转</b>（春樱/夏绿/秋红/冬雪：树冠换装、冬季封冻、春粮/秋收/冬暖用电的经济联动）与
            <b style={{ color: '#8a6d1a' }}>水务系统</b>（水塔/净水厂覆盖供水，缺水拖累幸福与迁入）、
            <b style={{ color: '#8a6d1a' }}>跨水大桥</b>（水面修路自动架桥，天堑变通途）；
            <b style={{ color: '#8a6d1a' }}>动态天气</b>（晴/多云/雨/雪自动轮转：雨滋养粮田、雪阻塞交通，云影飘过山脊）与
            <b style={{ color: '#8a6d1a' }}>随机事件</b>（火灾/疫病/停电/暴风雨 vs 游客潮/丰收节/科技博览会 —— 消防局、医院与电力冗余能把灾祸化为小插曲）、
            <b style={{ color: '#8a6d1a' }}>16 枚成就徽章</b>（城市志成就墙）；
            地图具有真实海拔起伏：山脉、丘陵、谷地与岸线，抬升/降低工具随心造山填海。
            一切画面均由代码程序化生成：{CATALOG.length} 类 {CATALOG.reduce((s, d) => s + d.variants, 0)} 变体建筑，
            256×256 大地图 · 10 种地形 · 一键城市（密度三档可调）·
            行人车辆（九职业 · 遛狗与流浪猫狗 · 广场鸽群 · 结伴出行，智能寻路，数量可调）·
            昼夜循环（入夜点亮万家灯火、路灯与霓虹），
            经固定 2:1 等距正交投影离线光栅化为透明精灵，
            叠加 {PALETTE.length} 色有限色板、Bayer 有序抖动、
            扫描线与 CRT 暗角 —— 向 DOS/PC98 与 SimCity 致敬；
            <b style={{ color: '#8a6d1a' }}>8-bit 音效矩阵</b>（建造/金币/灾害警报/警笛/电车铃/成就等 21 种音色，顶栏喇叭可调音量）与
            <b style={{ color: '#8a6d1a' }}>新手引导</b>（首次开局横幅逐步带路，帮助面板可重看）。
          </div>
        </div>
      )}
    </div>
  );

  // ---------------- 渲染 ----------------
  return (
    <div className={`pxc${isMobile ? ' m' : ''}${ui.min ? ' min' : ''}`}>
      {/* 标题栏 */}
      <div className="pxc-titlebar" onClick={ui.min ? () => toggle('min') : undefined}>
        <div className="pxc-logo" aria-hidden />
        {!ui.min && <h1>{isMobile ? '像素都市' : '像素都市 PIXEL CITY · 等距建造沙盒'}</h1>}
        {ui.min ? (
          <span className="pxc-minhint">像素都市 — 已最小化（点击还原）</span>
        ) : (
          <div className="pxc-tb-actions">
            {isMobile && (
              <button className="pxc-winbtn" title="打开建造中心" aria-label="打开建造中心"
                onClick={() => setUiStore(u => ({ ...u, drawer: true }))}>
                <img src={iu('menu')} alt="" width={12} height={12} />
              </button>
            )}
            {isMobile && !econ && (
              <button className="pxc-winbtn" title="一键城市" aria-label="一键城市" onClick={doGenCity}>
                <img src={iu('city')} alt="" width={12} height={12} />
              </button>
            )}
            {isMobile && econ && (
              <button className="pxc-winbtn" title="财政报告" aria-label="财政报告" onClick={() => openModal('fiscal')}>
                <img src={iu('chart')} alt="" width={12} height={12} />
              </button>
            )}
            <button className="pxc-winbtn" title="撤销 (Ctrl+Z)" aria-label="撤销"
              onClick={() => engineRef.current?.undo()}>
              <img src={iu('undo')} alt="" width={12} height={12} />
            </button>
            {!isMobile && (
              <button className="pxc-winbtn" title="重做 (Ctrl+Shift+Z)" aria-label="重做"
                onClick={() => engineRef.current?.redo()}>
                <img src={iu('redo')} alt="" width={12} height={12} />
              </button>
            )}
            <button className="pxc-winbtn" title="缩小 (−)" aria-label="缩小"
              onClick={() => engineRef.current?.cycleZoom(-1)}>
              <img src={iu('zoomout')} alt="" width={12} height={12} />
            </button>
            <button className="pxc-winbtn" title="放大 (+)" aria-label="放大"
              onClick={() => engineRef.current?.cycleZoom(1)}>
              <img src={iu('zoomin')} alt="" width={12} height={12} />
            </button>
            <button className={`pxc-winbtn${ui.crowds ? ' on' : ''}`}
              title={ui.crowds ? `行人车辆：开（行人 ${crowd.peds} · 宠物 ${crowd.pets} · 鸽群 ${crowd.birds} · 车辆 ${crowd.cars}${crowd.buses ? ` · 巴士 ${crowd.buses}` : ''}${crowd.boats ? ` · 船 ${crowd.boats}` : ''}${crowd.firetrucks ? ` · 消防 ${crowd.firetrucks}` : ''}${crowd.ambulances ? ` · 急救 ${crowd.ambulances}` : ''}${crowd.patrols ? ` · 巡逻 ${crowd.patrols}` : ''}）` : '行人车辆：关'}
              aria-label="行人车辆开关" onClick={toggleCrowds}>
              <img src={iu(ui.crowds ? 'person' : 'personoff')} alt="" width={12} height={12} />
            </button>
            <button className="pxc-winbtn" title="声音设置（开关与音量）" aria-label="声音设置"
              onClick={() => { setSndPop(v => !v); beeperRef.current?.play('click'); }}>
              <img src={iu(soundOn ? 'sound' : 'soundoff')} alt="" width={12} height={12} />
            </button>
            <button className="pxc-winbtn" title="帮助" aria-label="帮助"
              onClick={() => openModal('help')}>?</button>
            {!isMobile && (
              <>
                <button className="pxc-winbtn" title="最小化界面" aria-label="最小化界面"
                  onClick={() => toggle('min')}>─</button>
                <button className="pxc-winbtn" title="关闭" aria-label="关闭"
                  onClick={() => say('这座城市永远为你敞开大门')}>×</button>
              </>
            )}
          </div>
        )}
      </div>

      {/* 主体 */}
      <div className="pxc-main">
        <div className="pxc-screen" ref={wrapRef}>
          <canvas ref={viewRef} className="pxc-view" role="img"
            aria-label="等距城市画布：使用工具建造，右键拖动平移，滚轮或双指缩放" />
          <div className="pxc-crt" aria-hidden />

          {/* 工具条（可收缩） */}
          {ui.toolbar ? (
            <div className="pxc-toolbar" role="toolbar" aria-label="工具">
              {TOOLBAR.map(item => {
                let on = false;
                if (tool.t === item.tool.t) {
                  if (tool.t === 'build' && item.tool.t === 'build') {
                    on = defById(tool.id).cat === item.cat;
                  } else if (tool.t === 'terr' && item.tool.t === 'terr') {
                    on = tool.k === item.tool.k;
                  } else if (tool.t !== 'build' && tool.t !== 'terr') on = true;
                }
                return (
                  <button key={item.label} className={`pxc-tool${on ? ' on' : ''}`}
                    title={`${item.label} (${item.hot})`} aria-label={item.label}
                    onClick={() => {
                      if (item.tool.t === 'terr') setSubCat('terr');
                      pickTool(item.tool, item.cat ?? (item.tool.t === 'terr' ? 'terr' : undefined));
                    }}>
                    <img src={iu(item.icon)} alt="" />
                    <span>{item.label}</span>
                  </button>
                );
              })}
              <button className="pxc-tool pxc-fold" title="收起工具条" aria-label="收起工具条"
                onClick={() => { toggle('toolbar'); say('工具条已收起：点左上角闪烁的「▶ 工具栏」标签展开'); }}>◀</button>
            </div>
          ) : (
            <button className="pxc-tooltab" onClick={() => toggle('toolbar')}
              title="展开工具条" aria-label="展开工具条" aria-expanded={false}><b>▶</b><span>工具栏</span></button>
          )}

          {/* 经营 HUD（金币/人口/电力/幸福/收入/等级） */}
          {econ && (
            <div className="pxc-hud" role="status" aria-label="经营状态">
              <div className={`chip${econ.coins < 0 ? ' warn' : ''}`} title="金币：建造与购地的通货。入不敷出会赤字！">
                <img src={iu('coin')} alt="" /><b>{fmtG(econ.coins)}</b>
              </div>
              <div className="chip" title="人口 / 住房容量（市民逐渐迁入）">
                <img src={iu('people')} alt="" /><b>{econ.pop}<i>/{econ.cap}</i></b>
              </div>
              <button className="chip" onClick={() => openModal('citz')}
                title={`市民列传：在册名人 ${econ.citz.n} 位 · 累计落户 ${econ.citz.total} 人 · 平均心情 ${econ.citz.avgMood}（观察工具点击街上的行人也能认识他们）`}>
                <img src={iu('person')} alt="" /><b>{econ.citz.n}</b><i>民</i>
              </button>
              <button className={`chip mail${econ.mail.unread > 0 ? ' has' : ''}`} onClick={() => openModal('mail')}
                title={`市长信箱：${econ.mail.unread > 0 ? `${econ.mail.unread} 封未读 —— 市民在等您回信` : `${econ.mail.n} 封来信，暂无未读`}`}>
                <img src={iu('mail')} alt="" /><b>{econ.mail.n}</b><i>邮</i>
                {econ.mail.unread > 0 && <em className="chip-dot">{econ.mail.unread}</em>}
              </button>
              <button className={`chip${econ.fest ? ' fest-on' : ''}`} onClick={() => openModal('fest')}
                title={econ.fest
                  ? `「${econ.fest.name}」进行中：还剩 ${econ.fest.left} 秒 —— ${econ.fest.desc}`
                  : econ.festCd > 0
                    ? `城市节庆：筹备休整中（${econ.festCd} 秒后可再办）`
                    : econ.festLock
                      ? `城市节庆：需市政厅 LV${econ.festLv} 解锁 —— 按季节举办樱花祭/花火大会/丰收节/暖灯节`
                      : `城市节庆：随时可办「${FESTS[econ.season].name}」（${FESTS[econ.season].desc}）`}>
                <img src={iu('fest')} alt="" /><b>{econ.fest ? `${econ.fest.left}s` : econ.festCount}</b><i>庆</i>
              </button>
              <button className={`chip lg-chip${econ.lg.pre ? ' lg-pre' : ''}${econ.lg.moodT > 0 && econ.lg.mood > 0 ? ' lg-win' : ''}`} onClick={() => openModal('lg')}
                title={econ.lg.on
                  ? econ.lg.pre
                    ? `比赛日：客场球迷正进城 —— 距开赛 ${Math.max(0.1, Math.round((econ.lg.next - econ.gHours) * 10) / 10)} 游戏时，主场迎战${econ.lg.oppN}（${econ.lg.tierN}）`
                    : `城市联赛：${econ.lg.sn > 0 ? `第 ${econ.lg.zn + 1} 赛季 ${econ.lg.sn}/${6} 场 · ${econ.lg.pts} 分` : '备战中'} —— 下场 ${Math.max(0, Math.round((econ.lg.next - econ.gHours) * 10) / 10)} 游戏时后迎战${econ.lg.oppN}；全期 ${econ.lg.w}胜${econ.lg.d}平${econ.lg.l}负${econ.lg.t1 > 0 ? ` · ${econ.lg.t1} 冠` : ''}`
                  : '城市联赛：建成体育场即开张 ——「市民联」主场迎客，比赛日全城沸腾，战绩奖杯载入城市史册'}>
                <img src={iu('ball')} alt="" /><b>{econ.lg.on ? (econ.lg.pre ? '赛' : `${econ.lg.t1 > 0 ? econ.lg.t1 + '冠' : econ.lg.w + '胜'}`) : '—'}</b><i>球</i>
              </button>
              <button className={`chip zoo-chip${econ.zoo.on ? ' zoo-on' : ''}${econ.zoo.n >= econ.zoo.total ? ' zoo-full' : ''}`} onClick={() => openModal('zoo')}
                title={econ.zoo.on
                  ? `物种图鉴：已入住 ${econ.zoo.n}/${econ.zoo.total} 种（吸引力 +${econ.zoo.at} · 幸福 +${econ.zoo.hap}${econ.zoo.k > 1 ? ` · 游客 ×${econ.zoo.k.toFixed(2)}` : ''}）—— 下次巡查 ${Math.max(0, Math.round((econ.zoo.next - econ.gHours) * 10) / 10)} 游戏时后`
                  : '物种图鉴：建成动物园即开园 —— 巡查员定期进园评估，动物住户逐步入住，集齐 9 种翻满图鉴'}>
                <img src={iu('paw')} alt="" /><b>{econ.zoo.on ? `${econ.zoo.n}/${econ.zoo.total}` : '—'}</b><i>兽</i>
              </button>
              <button className={`chip sis-chip${econ.sis.req ? ' sis-req' : ''}`} onClick={() => openModal('sis')}
                title={econ.sis.req
                  ? `邻城急件：${econ.sis.req.name}遣使求援，使者再候 ${econ.sis.req.ttl} 游戏时 —— 速去作答`
                  : `姊妹城市：与 ${econ.sis.cities.length} 座邻城往来 —— 互市 ${econ.sis.tradeN} 次 · 援助 ${econ.sis.aidN} 次（市政厅 LV${econ.sis.lv} 起通商；好感 ≥60 结为姊妹之城，三城 ≥80 歃血为盟）`}>
                <img src={iu('land')} alt="" /><b>{econ.sis.tradeN}</b><i>盟</i>
                {econ.sis.req && <em className="chip-dot">急</em>}
              </button>
              <button className="chip" onClick={() => openModal('chron')}
                title={`城市编年史：在册 ${econ.chron.n} 笔纪事（累计 ${econ.chron.total} 笔）· 当前纪元「${econ.chron.eraName}」—— 开埠奠基、时代跃迁、灾祸喜讯、科技节庆与里程碑，都记在这本城市之书里`}>
                <img src={iu('scroll')} alt="" /><b>{econ.chron.n}</b><i>史</i>
              </button>
              <button className={`chip news-chip${econ.news.on ? ' news-on' : ''}${econ.news.issues[0]?.extra ? ' news-extra' : ''}`} onClick={() => openModal('news')}
                title={econ.news.on
                  ? `城市日报：已出 ${econ.news.n} 期（最近一期发行 ${econ.news.circ} 份 · 累计 ${econ.news.circT} 份）—— 下期 ${Math.max(0, Math.round((econ.news.next - econ.gHours) * 10) / 10)} 游戏时后出版；头版头条自动选编年史大事，大事出号外`
                  : '城市日报：建成报馆即创刊 —— 每七游戏日一期，头版头条自动选编年史大事，发行量随人口与识字率浮动，卖报所得进府库'}>
                <img src={iu('scroll')} alt="" /><b>{econ.news.n > 0 ? econ.news.n : '—'}</b><i>闻</i>
                {econ.news.issues[0]?.extra && <em className="chip-dot">外</em>}
              </button>
              <button className={`chip hall-chip${econ.hall.on ? ' hall-on' : ''}${econ.hall.hapOn ? ' hall-glow' : ''}`} onClick={() => openModal('hall')}
                title={econ.hall.on
                  ? `荣誉殿堂：已评 ${econ.hall.n} 届 · 奖项 ${econ.hall.awards.filter(a => a.got).length}/${econ.hall.awards.length}${econ.hall.hapOn ? ` · 授勋荣光幸福 +1（剩 ${econ.hall.hapT} 秒）` : ''} —— 下届开榜 ${Math.max(0, Math.round((econ.hall.next - econ.gHours) * 10) / 10)} 游戏时后`
                  : '荣誉殿堂：建成名人堂即开榜 —— 每逢换季整点评出一位本季城市之光，八大奖项按城市状态加权授勋，获奖市民名镌光荣榜'}>
                <img src={iu('star')} alt="" /><b>{econ.hall.n > 0 ? econ.hall.n : '—'}</b><i>光</i>
              </button>
              <button className={`chip metro-chip${econ.metro.conn >= 2 ? ' metro-on' : ''}`} onClick={() => openModal('metro')}
                title={econ.metro.depots > 0
                  ? `轨道交通：车辆段 ${econ.metro.depots} 座 · 车站 ${econ.metro.stops} 座（接入 ${econ.metro.conn}）· 通勤覆盖 ${econ.metro.cover}% · 交通 +${econ.metro.bonus}${econ.metro.hap > 0 ? ` · 幸福 +${econ.metro.hap}` : ''}${econ.metro.conn >= 2 ? ' —— 线网运转中' : ' —— 再接入 1 座车站即通车'}`
                  : '轨道交通：建成地铁车辆段（需「建筑工程学」）并沿链接入地铁站 —— 两站成线通车，通勤圈商铺与住宅同沾其利'}>
                <img src={iu('bolt')} alt="" /><b>{econ.metro.conn > 0 ? econ.metro.conn : '—'}</b><i>轨</i>
              </button>
              <button className={`chip air-chip${econ.air.n > 0 ? ' air-on' : ''}`} onClick={() => openModal('air')}
                title={econ.air.n > 0
                  ? `空港航线：在飞 ${econ.air.routes}/${econ.air.lines.length} 条 · 累计 ${econ.air.flown} 架次 · 旅客 ${econ.air.pax} 人次 · 商圈覆盖 ${econ.air.cover}% · 游客 ×${econ.air.tourK.toFixed(2)}${econ.air.noise > 0 ? ` · 噪音圈 ${econ.air.noise} 栋` : ''}`
                  : '空港航线：建成空港航站楼（需「建筑工程学」）即开邻省都会线 —— 姊妹城好感到位各开花一条国际航线，游客与空运双旺'}>
                <img src={iu('plane')} alt="" /><b>{econ.air.routes > 0 ? econ.air.routes : '—'}</b><i>航</i>
              </button>
              <button className={`chip gov${econ.gov.pending ? ' has' : ''}`} onClick={() => openModal('gov')}
                title={econ.gov.pending
                  ? `市长公署：${econ.gov.pending.from}呈「${econ.gov.pending.title}」待您朱批 —— 每道批注都有代价与回响，并记入编年史「政令」卷`
                  : `市长公署：已批 ${econ.gov.n} 份公文 · 案头清简（明晨八点再有公文送抵）`}>
                <img src={iu('medal')} alt="" /><b>{econ.gov.n}</b><i>批</i>
                {econ.gov.pending && <em className="chip-dot">待</em>}
              </button>
              <div className={`chip${econ.powerDem > econ.powerSup ? ' warn' : ''}`}
                title={`电力：供给 ${econ.powerSup}MW / 需求 ${econ.powerDem}MW${econ.powerDem > econ.powerSup ? ' —— 缺电！收入大幅打折' : ''}`}>
                <img src={iu('bolt')} alt="" /><b>{econ.powerSup}<i>/{econ.powerDem}</i></b>
              </div>
              <div className="chip" title="幸福度：宜居 30% + 粮食 18% + 就业 14% + 环境 12% + 健康 9% + 安全 8% + 交通 9% + 税率情绪，影响税收与迁入">
                <img src={iu('smile')} alt="" /><b>{econ.happiness}</b>
              </div>
              <div className={`chip rate${econ.incomeNet < 0 ? ' neg' : ''}`}
                title={`净收入构成（G/分）：税收 ${rinc(econ.incomeTax)} + 商业 ${rinc(econ.incomeCom)} + 工业 ${rinc(econ.incomeInd)} − 维护 ${rinc(econ.incomeUpk)}${econ.incomeNet < 0 ? ' —— 入不敷出！拆除高维护设施可减负' : ''}`}>
                <b>{rincS(econ.incomeNet)}/分</b>
              </div>
              <button className="chip lv" onClick={() => openModal('fiscal')}
                title="财政报告（点击市政厅同样可打开）">
                <img src={iu('star')} alt="" /><b>LV{econ.level}</b>
                <span className="xp" aria-hidden>
                  <i style={{ width: `${Math.min(100, Math.round((econ.xp / Math.max(1, econ.xpMax)) * 100))}%` }} />
                </span>
              </button>
            </div>
          )}

          {/* 民生指数条（粮仓 / 智慧 / 科技点 / 宜居） */}
          {econ && (
            <div className="pxc-hud pxc-hud2" role="status" aria-label="民生指数">
              <button className={`chip${econ.famine ? ' warn' : ''}`}
                onClick={() => openModal('fiscal')}
                title={`粮仓：库存 ${econ.food}/${econ.foodCap} · 产量 ${rinc(econ.foodProd)}/分 − 口粮 ${rinc(econ.foodEat)}/分 = ${rincS(econ.foodNet)}/分${econ.famine ? ' —— 饥荒！快建温室大棚' : ''}`}>
                <img src={iu('wheat')} alt="" /><b>{econ.food}<i>/{econ.foodCap}</i></b>
                <em className={econ.foodNet < 0 ? 'dn' : 'up'}>{rincS(econ.foodNet)}</em>
              </button>
              <button className={`chip${econ.goodsIdx < 45 ? ' warn' : ''}`} onClick={() => openModal('fiscal')}
                title={`货物供应链：库存 ${econ.goods}/${econ.goodsCap} · 产量 ${rinc(econ.goodsProd)}/分 − 消耗 ${rinc(econ.goodsCons)}/分（工业产货供给零售商业；缺货商业收入大打折扣）${econ.exportRate > 0 ? ` · 出口 ${rinc(econ.exportRate)} 件/分 @ ${econ.expPrice.toFixed(2)}G/件` : ''}${econ.exportHold ? ' · 惜售囤货中（暂停出口）' : ''}${econ.goodsIdx < 45 ? ' —— 货物短缺！快建工厂/木材厂' : ''}`}>
                <img src={iu('box')} alt="" /><b>{econ.goods}<i>/{econ.goodsCap}</i></b>
                <em className={econ.goodsNet < 0 ? 'dn' : 'up'}>{rincS(econ.goodsNet)}</em>
              </button>
              <button className="chip" onClick={() => openModal('tech')}
                title={`智慧指数：教育容量 ${econ.eduCap} 覆盖人口 ${econ.pop} 人（建图书馆 / 学校 / 博物馆提升）——智慧越高，科技点产出越快`}>
                <img src={iu('book')} alt="" /><b>{econ.wisdom}</b>
              </button>
              <button className="chip" onClick={() => openModal('tech')}
                title={`科技点：存量 ${econ.sp} SP · 产出 ${rinc(econ.spRate)}/分（点击打开科技研究院）`}>
                <img src={iu('flask')} alt="" /><b>{fmtG(econ.sp)}</b>
                <em className="up">+{rinc(econ.spRate)}</em>
              </button>
              <button className="chip" onClick={() => openModal('fiscal')}
                title={`宜居度：设施供需与供电决定的结构指数，是幸福度的最大成分（30%）`}>
                <img src={iu('heart')} alt="" /><b>{econ.livability}</b>
              </button>
              <button className={`chip${econ.waterIdx < 40 ? ' warn' : ''}`} onClick={() => openModal('data')}
                title={`供水覆盖率：${econ.waterIdx}%（覆盖人口占比 × 总容量/总人口）—— 水塔半径 9 格 / 净水厂半径 20 格；缺水拖累幸福度与人口迁入${econ.waterIdx < 40 ? ' —— 严重缺水！快建水塔' : ''}`}>
                <img src={iu('drop')} alt="" /><b>{econ.waterIdx}%</b>
              </button>
              <button className="chip" onClick={() => openModal('data')}
                title={`文化指数：文旅供给 ${rinc(econ.cultureSup)} / 需求 ${econ.cultureNeed}（神社/教堂/博物馆/影院/钟楼等提升）—— 点击打开城市志`}>
                <img src={iu('star')} alt="" /><b>{econ.cultureIdx}%</b>
              </button>
              <button className="chip" onClick={() => openModal('fiscal')}
                title={`观光经济：当前游客 ${econ.tourists} 人 · 消费 +${rinc(econ.incomeTour)}G/分 · 旅游指数 ${econ.tourIdx}（摩天轮/水族馆/城堡是吸引力大户；酒店床位 ${econ.beds} 决定接待上限；夏季旺冬季淡）`}>
                <img src={iu('camera')} alt="" /><b>{econ.tourists}</b><i>客</i>
              </button>
              <button className="chip" onClick={() => openModal('data')}
                title={`就业率：劳动力 ${econ.workers} 人 / 岗位 ${econ.jobs} 个（多建商业与工业提供岗位）—— 点击打开城市志`}>
                <img src={iu('job')} alt="" /><b>{econ.employIdx}%</b>
              </button>
              <button className={`chip rgrade rgrade-${econ.ratingGrade}`} onClick={() => openModal('data')}
                title={`城市评级：${econ.rating} 分（${econ.ratingGrade} 级）—— 幸福/宜居/粮食/就业/环境/供水/智慧/文化/健康/安全/科研/交通十二维加权（点击打开城市志）`}>
                <img src={iu('medal')} alt="" /><b>{econ.ratingGrade}</b><i>{econ.rating}</i>
              </button>
              {(() => {
                const sn = SEASONS[econ.season] ?? SEASONS[1];
                return (
                  <span className="chip wx" title={`季节：${sn.name}季 —— ${sn.note}（四季随经营时钟轮转：每季 12 游戏小时）`}>
                    <img src={iu(sn.icon)} alt="" /><b>{sn.name}</b>
                  </span>
                );
              })()}
              {(() => {
                const w = econ.weather;
                const names: Record<string, string> = { clear: '晴', cloudy: '多云', rain: '雨', snow: '雪' };
                const notes: Record<string, string> = {
                  clear: '晴空万里：商业 +4%，幸福 +2',
                  cloudy: '阴云蔽日：一切如常',
                  rain: '春雨润物：粮食 +30%，商业 −12%，幸福 −3',
                  snow: '瑞雪纷飞：商业 −15%，交通 −20%，幸福 −5',
                };
                return (
                  <span className="chip wx" title={`天气：${names[w.kind]} —— ${notes[w.kind]}（天气自动轮转，影响经济与幸福）`}>
                    <img src={iu(w.kind === 'clear' ? 'sun' : w.kind === 'snow' ? 'snoww' : w.kind)} alt="" /><b>{names[w.kind]}</b>
                  </span>
                );
              })()}
            </div>
          )}

          {/* v5 事件横幅（进行中随机事件） */}
          {econ && econ.events.length > 0 && (
            <div className="pxc-events" role="status" aria-label="进行中事件">
              {econ.events.map(ev => (
                <div key={ev.key} className={`pxc-ev ${ev.kind}`}>
                  <span className="ev-name">{ev.kind === 'bad' ? '⚠' : '✦'} {ev.name}{ev.key === 'fire' && ev.spreadN ? ` ×${ev.spreadN + 1}` : ''}{ev.key === 'plague' && ev.infN ? ` ×${ev.infN + 1}` : ''}</span>
                  <span className="ev-note">{ev.note}{ev.key === 'fire' && ev.spreadN ? ` —— 已过火 ${ev.spreadN + 1} 栋` : ''}{ev.key === 'plague' && ev.infN ? ` —— 已累及 ${ev.infN + 1} 栋住宅` : ''}</span>
                  <span className="ev-left">{Math.ceil(ev.left)}s</span>
                  <span className="ev-bar"><i style={{ width: `${Math.max(0, Math.min(100, (ev.left / ev.dur) * 100))}%` }} /></span>
                </div>
              ))}
            </div>
          )}

          {/* v14 新手引导横幅（欢迎/条件步/结业；经营模式且未跳过时显示） */}
          {econ && tutSnap.active && (() => {
            const st = TUT_STEPS[tutSnap.step];   // 状态快照驱动渲染，不读 ref
            if (!st) return null;
            const condSteps = TUT_STEPS.filter(s => !s.welcome && !s.finale);
            const condIdx = condSteps.findIndex(s => s.id === st.id);   // 当前是第几个条件步（-1=欢迎/结业）
            return (
              <div className="pxc-tut" role="status" aria-label="新手引导">
                <div className="tut-head">
                  <span className="tut-badge">引导</span>
                  <span className="tut-title">{st.title}</span>
                  {condIdx >= 0 && <span className="tut-stepno">{condIdx + 1}/{condSteps.length}</span>}
                </div>
                <div className="tut-text">{st.text}</div>
                {st.welcome ? (
                  <div className="tut-actions">
                    <button className="pxc-btn primary" onClick={advanceTut}>开始引导</button>
                    <button className="pxc-btn" onClick={dismissTut}>跳过引导</button>
                  </div>
                ) : st.finale ? (
                  <div className="tut-actions">
                    <button className="pxc-btn primary" onClick={advanceTut}>毕业！</button>
                    <button className="pxc-btn" onClick={dismissTut}>跳过</button>
                  </div>
                ) : (
                  <div className="tut-foot">
                    <div className="tut-goal">◎ 目标：{st.goal}</div>
                    <div className="tut-dots" aria-hidden>
                      {condSteps.map((s, i) => (
                        <i key={s.id} className={i <= condIdx ? 'on' : ''} />
                      ))}
                    </div>
                    <button className="tut-skip" onClick={dismissTut}>跳过引导</button>
                  </div>
                )}
              </div>
            );
          })()}

          {/* 任务卡 */}
          {econ && (
            <div className={`pxc-quest${ui.quest ? '' : ' closed'}`}>
              <button className="qh" onClick={() => toggle('quest')} aria-expanded={ui.quest}>
                <img src={iu('flag')} alt="" />
                <span>任务 {econ.questIdx >= QUESTS.length ? QUESTS.length : econ.questIdx + 1}/{QUESTS.length}</span>
                <i>{ui.quest ? '▾' : '▸'}</i>
              </button>
              {ui.quest && (
                <div className="qb">
                  <div className="qt">{econ.questTitle}</div>
                  <div className="qsub">{econ.questHint}</div>
                  <div className="qbar">
                    <i style={{ width: `${Math.min(100, Math.round((econ.questCur / Math.max(1, econ.questGoal)) * 100))}%` }} />
                  </div>
                  <div className="qrow">
                    <span>{Math.floor(econ.questCur).toLocaleString('zh-CN')} / {econ.questGoal.toLocaleString('zh-CN')}</span>
                    {econ.questRg > 0 && <span className="qw">+{econ.questRg}G +{econ.questRx}XP</span>}
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="pxc-badge">
            ZOOM ×{zoom} · {fps} FPS{ui.crowds ? ` · 行人 ${crowd.peds}${crowd.pets ? ` +${crowd.pets} 宠` : ''}${crowd.birds ? ` +${crowd.birds} 鸽` : ''}` : ''}
          </div>

          {toast && <div key={toast.id} className="pxc-toast" role="status">{toast.msg}</div>}

          {/* v14 声音设置弹层（顶栏喇叭） */}
          {sndPop && (
            <div className="pxc-sndpop" role="dialog" aria-label="声音设置">
              <div className="sp-row">
                <span className="sp-lbl">音效</span>
                <button className={`pxc-btn mini${soundOn ? ' on' : ''}`}
                  title={soundOn ? '当前：开（点击静音）' : '当前：关（点击开启）'}
                  onClick={() => {
                    const b = beeperRef.current;
                    if (!b) return;
                    b.enabled = !b.enabled;
                    b.savePrefs();
                    setSoundOn(b.enabled);
                    if (b.enabled) b.play('open');
                  }}>{soundOn ? '开' : '关'}</button>
                <button className="pxc-btn mini" title="试听一段"
                  onClick={() => beeperRef.current?.play('open')}>♪ 试听</button>
              </div>
              <div className="sp-row">
                <span className="sp-lbl">音量</span>
                <input type="range" min={0} max={100} step={5}
                  value={Math.round(sndVol * 100)}
                  onChange={e => {
                    const v = Number(e.target.value) / 100;
                    setSndVol(v);
                    const b = beeperRef.current;
                    if (b) { b.volume = v; b.savePrefs(); }
                  }}
                  aria-label="主音量（0-100）" />
                <b className="sp-vol">{Math.round(sndVol * 100)}</b>
              </div>
              <div className="sp-row sp-last">
                <span className="sp-hint">21 种 8-bit 音色 · 本地记忆偏好</span>
                <button className="pxc-btn mini" onClick={() => setSndPop(false)}>完成</button>
              </div>
            </div>
          )}

          {/* 加载画面 */}
          {phase === 'loading' && (
            <div className="pxc-loading" role="status">
              <h2>像素都市</h2>
              <div className="sub">NOW LOADING · 离线预渲染管线</div>
              <div className="pxc-bar">
                <div style={{ width: `${Math.round(prog.frac * 100)}%` }} />
              </div>
              <div className="label">正在生成：{prog.label} … {Math.round(prog.frac * 100)}%</div>
              <div className="label" style={{ opacity: 0.55 }}>
                程序化建模 → 2:1 等距正交光栅化 → 有限色板 + 有序抖动
              </div>
            </div>
          )}
        </div>

        {/* 桌面右侧建造中心（整板可收缩） */}
        {!isMobile && (
          ui.panel ? (
            <aside className="pxc-panel" aria-label="建造面板">
              <div className="pxc-phead">
                <span>建 造 中 心</span>
                <button className="pxc-foldbtn" onClick={() => { toggle('panel'); say('建造中心已收起：点右缘闪烁的「◀」竖签展开'); }}
                  title="收起面板" aria-label="收起面板">▶ 收起</button>
              </div>
              <div className="pxc-pbody">
                {buildGroup}
                {miniGroup}
                {cityOpsGroup}
                <div style={{ flex: 1 }} />
                {aboutGroup}
              </div>
            </aside>
          ) : (
            <button className="pxc-paneltab" onClick={() => toggle('panel')}
              title="展开建造中心" aria-label="展开建造中心" aria-expanded={false}>
              <i>◀</i><span>建造中心</span>
            </button>
          )
        )}
      </div>

      {/* 状态栏（桌面） */}
      {!isMobile && (
        <div className="pxc-status">
          <div title="光标格坐标">
            {hover ? `X:${hover.tx} Y:${hover.ty}` : 'X:— Y:—'}
          </div>
          <div className="pxc-hint">{hint}</div>
          <div><b>人口</b> {econ ? `${econ.pop}/${econ.cap}` : stats.pop}</div>
          <div><b>建筑</b> {stats.buildings}</div>
          {econ && <div><b>金币</b> {fmtG(econ.coins)}G</div>}
          {econ && <div><b>领地</b> {econ.chunks} 块</div>}
          <div><b>道路</b> {stats.roads}</div>
          <div><b>树木</b> {stats.trees}</div>
          <div><b>时间</b> {clock.text} {clock.ph}</div>
          {ui.crowds && <div><b>行人</b> {crowd.peds} · {crowd.pets} 宠 · {crowd.birds} 鸽 · {crowd.cars} 车{crowd.buses ? ` · ${crowd.buses} 巴士` : ''}{crowd.trams ? ` · ${crowd.trams} 电车` : ''}{crowd.boats ? ` · ${crowd.boats} 船` : ''}{crowd.firetrucks ? ` · <b style={{ color: '#E05548' }}>消防 ${crowd.firetrucks} 出动</b>` : ''}{crowd.ambulances ? ` · <b style={{ color: '#E05548' }}>急救 ${crowd.ambulances} 出动</b>` : ''}{crowd.patrols ? ` · 巡逻 ${crowd.patrols}` : ''}</div>}
        </div>
      )}

      {/* 移动端底部：工具条 + 抽屉 */}
      {isMobile && (
        <>
          <div className="pxc-mtoolwrap">
            <div className="pxc-mtools" role="toolbar" aria-label="工具">
              {TOOLBAR.map(item => {
                let on = false;
                if (tool.t === item.tool.t) {
                  if (tool.t === 'build' && item.tool.t === 'build') {
                    on = defById(tool.id).cat === item.cat;
                  } else if (tool.t === 'terr' && item.tool.t === 'terr') {
                    on = tool.k === item.tool.k;
                  } else if (tool.t !== 'build' && tool.t !== 'terr') on = true;
                }
                return (
                  <button key={item.label} className={`pxc-mtool${on ? ' on' : ''}`}
                    aria-label={item.label}
                    onClick={() => {
                      if (item.tool.t === 'terr') setSubCat('terr');
                      pickTool(item.tool, item.cat ?? (item.tool.t === 'terr' ? 'terr' : undefined));
                    }}>
                    <img src={iu(item.icon)} alt="" />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
          <div className={`pxc-drawer${ui.drawer ? ' open' : ''}`}>
            <button className="pxc-dhandle" onClick={() => toggle('drawer')}
              aria-expanded={ui.drawer} aria-label="建造中心抽屉">
              <i>{ui.drawer ? '▼' : '▲'}</i>
              <span className="t">建 造 中 心</span>
              <span className="s">
                {econ ? `${fmtG(econ.coins)}G · ` : ''}人口 {econ ? econ.pop : stats.pop} · 建筑 {stats.buildings}
                {ui.crowds ? ` · 行人 ${crowd.peds}${crowd.pets ? `+${crowd.pets}宠` : ''}${crowd.birds ? `+${crowd.birds}鸽` : ''}` : ''} · {clock.text}
              </span>
            </button>
            {ui.drawer && (
              <div className="pxc-dbody">
                {buildGroup}
                {cityOpsGroup}
                {miniGroup}
                {aboutGroup}
              </div>
            )}
          </div>
        </>
      )}

      {/* 存档模态 */}
      {modal === 'save' && (
        <div className="pxc-mask" onClick={e => { if (e.target === e.currentTarget) setModal('none'); }}>
          <div className="pxc-modal" role="dialog" aria-label="存档管理">
            <header>
              存 档 管 理
              <button className="pxc-x" onClick={() => setModal('none')} aria-label="关闭">×</button>
            </header>
            <div className="pxc-body">
              {[0, 1, 2].map(i => {
                const meta = slotMeta[i];
                return (
                  <div className="pxc-slot" key={i}>
                    <div className="pxc-slotmeta">
                      <div className="t1">存档位 {i + 1}</div>
                      <div className="t2">{meta ? `${meta.time} · 人口 ${meta.pop}` : '— 空 —'}</div>
                    </div>
                    <button className="pxc-btn primary" onClick={() => doSave(i)}>保存</button>
                    <button className="pxc-btn" disabled={!meta} onClick={() => doLoad(i)}>读取</button>
                    <button className="pxc-btn" disabled={!meta} onClick={() => doDelete(i)}>删除</button>
                  </div>
                );
              })}
              <div className="pxc-row" style={{ marginTop: 8 }}>
                <button className="pxc-btn" onClick={() => {
                  const eng = engineRef.current;
                  if (eng && eng.loadAuto()) { say('已恢复自动存档'); setModal('none'); }
                  else say('暂无自动存档');
                }}>恢复自动存档</button>
                <span style={{ fontSize: 11, color: '#555c66', alignSelf: 'center' }}>
                  每隔约 25 秒自动保存一次
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 财政报告模态（经营模式） */}
      {modal === 'fiscal' && econ && (
        <div className="pxc-mask" onClick={e => { if (e.target === e.currentTarget) setModal('none'); }}>
          <div className="pxc-modal pxc-fiscal" role="dialog" aria-label="财政报告">
            <header>
              市 政 厅 · 财 政 报 告
              <button className="pxc-x" onClick={() => setModal('none')} aria-label="关闭">×</button>
            </header>
            <div className="pxc-body">
              <div className="pxc-fgrid">
                <section className="ptax">
                  <h3>税率政策（可调 0-20%）</h3>
                  <div className="taxrow">
                    <input
                      type="range" min={TAX_MIN} max={TAX_MAX} step={1}
                      value={taxDraft ?? econ.taxRate}
                      onChange={e => setTax(Number(e.target.value))}
                      aria-label="税率滑杆"
                    />
                    <b className="txv">{taxDraft ?? econ.taxRate}%</b>
                  </div>
                  <table><tbody>
                    <tr><td>税率情绪</td>
                      <td className={taxMood(taxDraft ?? econ.taxRate) < 0 ? 'bad' : 'g'}>
                        {(() => { const m = taxMood(taxDraft ?? econ.taxRate); return m === 0 ? '0（6-10% 区间中性）' : `${m > 0 ? '+' : ''}${Math.round(m)} 幸福度`; })()}
                      </td>
                    </tr>
                    <tr><td>预计税收</td>
                      <td>{rinc(econ.incomeTax / Math.max(1, econ.taxRate) * (taxDraft ?? econ.taxRate))} G/分</td>
                    </tr>
                    <tr><td>市民态度</td>
                      <td>{(() => { const r = taxDraft ?? econ.taxRate;
                        return r <= 6 ? '薄赋惠民，交口称赞' : r <= 10 ? '税负适中，波澜不惊' : r <= 15 ? '税负渐重，怨声渐起' : '横征暴敛，天怒人怨'; })()}
                      </td>
                    </tr>
                  </tbody></table>
                  <div className="taxhint">高税多金却伤幸福（＞10% 递减），低税惠民而囊中羞涩（≤6% 加成）——税率是收入与民心之间的天平</div>
                </section>
                <section>
                  <h3>收支（每分钟）</h3>
                  <table><tbody>
                    <tr><td>人口税收</td><td className="g">+{rinc(econ.incomeTax)}G</td></tr>
                    <tr><td>商业利润</td><td className="g">+{rinc(econ.incomeCom)}G</td></tr>
                    <tr><td>工业产值</td><td className="g">+{rinc(econ.incomeInd)}G</td></tr>
                    <tr className={econ.incomeTour <= 0 ? '' : 'g'}>
                      <td>旅游消费</td><td>+{rinc(econ.incomeTour)}G</td>
                    </tr>
                    {econ.incomeExp > 0 && (
                      <tr className="g"><td>出口贸易</td><td>+{rinc(econ.incomeExp)}G（市价 {Math.round(econ.mkt * 100)}%）</td></tr>
                    )}
                    {econ.ordCost > 0 && (
                      <tr><td>法令开支</td><td className="bad">−{rinc(econ.ordCost)}G</td></tr>
                    )}
                    <tr><td>设施维护</td><td className="bad">−{rinc(econ.incomeUpk)}G</td></tr>
                    <tr className="sum"><td>净收入</td>
                      <td className={econ.incomeNet < 0 ? 'bad' : 'g'}>{rincS(econ.incomeNet)}G</td></tr>
                  </tbody></table>
                </section>
                <section>
                  <h3>人口与就业</h3>
                  <table><tbody>
                    <tr><td>人口 / 容量</td><td>{econ.pop} / {econ.cap}</td></tr>
                    <tr><td>劳动力</td><td>{econ.workers} 人</td></tr>
                    <tr><td>岗位</td><td>{econ.jobs} 个</td></tr>
                    <tr><td>就业率</td><td>{Math.round(econ.staffing * 100)}%</td></tr>
                    <tr><td>建筑总数</td><td>{econ.buildings} 栋</td></tr>
                  </tbody></table>
                </section>
                <section>
                  <h3>电力与幸福</h3>
                  <table><tbody>
                    <tr className={econ.powerDem > econ.powerSup ? 'bad' : ''}>
                      <td>电力 供/需</td><td>{econ.powerSup} / {econ.powerDem} MW</td>
                    </tr>
                    <tr><td>供电率</td><td>{Math.round(econ.powerMult * 100)}%</td></tr>
                    <tr><td>幸福度</td><td>{econ.happiness} / 100</td></tr>
                    <tr><td>宜居度</td><td>{econ.livability} / 100</td></tr>
                    <tr><td>宜居 供/需</td><td>{econ.amenitySup} / {econ.amenityNeed}</td></tr>
                    <tr className={econ.cleanMW > 0 ? 'g' : (econ.coalN > 0 ? 'bad' : '')}>
                      <td>能源结构</td><td>{
                        econ.cleanMW > 0
                          ? `清洁出力 ${econ.cleanMW} MW（风 ${econ.windfarms} 场 · 光 ${econ.solarfarms} 站${econ.solarfarms > 0 ? ` · 此刻光伏 ${econ.solarMW} MW` : ''}）`
                          : econ.coalN > 0 ? `火电 ${econ.coalN} 座支撑全城 —— 风与阳光还在路上` : '电网待建'
                      }</td>
                    </tr>
                    <tr><td>工业污染</td><td>{econ.pollute} 点</td></tr>
                  </tbody></table>
                </section>
                <section>
                  <h3>城市指数（v4）</h3>
                  <table><tbody>
                    <tr className={econ.envIdx < 55 ? 'bad' : ''}>
                      <td>环境指数</td><td>{econ.envIdx} / 100（净污染 {rinc(econ.envIdx < 100 ? (100 - econ.envIdx) / 9 : 0)} 点）</td>
                    </tr>
                    <tr className={econ.smogBad > 0 || econ.smogRes > 0 ? 'bad' : (econ.ecotowers > 0 ? 'g' : '')}>
                      <td>雾霾治理</td>
                      <td>{
                        econ.smogTiles > 0
                          ? `雾霾覆盖 ${econ.smogTiles} 格（重污染 ${econ.smogBad} 格 · 住宅受损 ${econ.smogRes} 栋${econ.smogRes > 0 ? ' · 幸福 −' + Math.min(12, econ.smogRes * 2.5) : ''}）`
                          : econ.ecotowers > 0 ? `晴空如洗（净化塔 ${econ.ecotowers} 座值守）` : '晴空如洗'
                      }{econ.ecotowers > 0 ? ` · 净化塔 ${econ.ecotowers} 座` : ''}</td>
                    </tr>
                    <tr className={econ.darkN > 0 ? 'bad' : (econ.gridCover >= 95 ? 'g' : '')}>
                      <td>电网覆盖</td>
                      <td>{
                        econ.darkN > 0
                          ? `覆盖 ${econ.gridCover}%（断电 ${econ.darkN} 栋 · 收入归零${econ.powerRes > 0 ? ` · 住宅受损 ${econ.powerRes} 栋 · 幸福 −` + Math.min(10, econ.powerRes * 2) : ''}）`
                          : `全覆盖 ${econ.gridCover}%${econ.substations > 0 ? `（变电站 ${econ.substations} 座中继）` : ''}`
                      }</td>
                    </tr>
                    <tr className={econ.wasteN > 0 ? 'bad' : (econ.sweeps + econ.recycles + econ.incins > 0 ? 'g' : '')}>
                      <td>市容环卫</td>
                      <td>{
                        econ.wasteN > 0
                          ? `堆积 ${econ.wasteN} 处（重灾 ${econ.wasteBad} · 住宅受损 ${econ.wasteRes} 栋${econ.wasteRes > 0 ? ` · 幸福 −` + Math.min(10, Math.round(econ.wasteRes * 1.8)) : ''}${econ.sweepOverN > 0 ? ` · 设施超载 ${econ.sweepOverN} 座` : ''}）`
                          : `清运覆盖 ${econ.sweepCover}%${econ.sweeps + econ.recycles + econ.incins > 0
                            ? `（收集站 ${econ.sweeps}${econ.recycles > 0 ? ` · 回收 ${econ.recycles}` : ''}${econ.incins > 0 ? ` · 焚烧 ${econ.incins}` : ''}）`
                            : ''}`
                      }</td>
                    </tr>
                    <tr className={econ.eduOut > 0 ? 'bad' : (econ.primaries + econ.universities > 0 ? 'g' : '')}>
                      <td>文教兴学</td>
                      <td>{
                        econ.eduOut > 0
                          ? `学区覆盖 ${econ.eduCover}%（学区外 ${econ.eduOut} 栋${econ.eduIn > 0 ? ` · 学区内 ${econ.eduIn} 栋` : ''} · 幸福 −${Math.min(8, Math.round(econ.eduOut * 1.6))} —— 孩子上学要翻山）`
                          : `学区覆盖 ${econ.eduCover}%${econ.primaries + econ.universities > 0
                            ? `（小学 ${econ.primaries}${econ.universities > 0 ? ` · 大学城 ${econ.universities}` : ''}）`
                            : ''}`
                      } · 人力资本 ${econ.hrIdx}（累计升学 ${econ.gradTotal} 人次）</td>
                    </tr>
                    <tr className={econ.crimeN > 0 ? 'bad' : (econ.policehqN > 0 ? 'g' : '')}>
                      <td>平安守夜</td>
                      <td>{
                        econ.crimeN > 0
                          ? `巡防覆盖 ${econ.secCover}%（盲区商铺 ${econ.crimeN} 家 · 夜里有梁上君子${econ.secMissRes > 0 ? ` · 盲区住宅 ${econ.secMissRes} 栋 · 幸福 −${Math.min(6, Math.round(econ.secMissRes * 1.2))}` : ''}）`
                          : `巡防覆盖 ${econ.secCover}%${econ.policehqN > 0
                            ? `（警察局 ${econ.policehqN} 座）`
                            : ''}`
                      } · 破案 {econ.rescuePolice} 起</td>
                    </tr>
                    <tr className={econ.fireOut > 0 ? 'bad' : (econ.firestations > 0 ? 'g' : '')}>
                      <td>烈火雄心</td>
                      <td>{
                        econ.fireOut > 0
                          ? `消防覆盖 ${econ.fireCover}%（盲区 ${econ.fireOut} 栋 · 起火偏爱这些角落且蔓延更快${econ.fireMissRes > 0 ? ` · 盲区住宅 ${econ.fireMissRes} 栋 · 幸福 −${Math.min(5, Math.round(econ.fireMissRes * 1.0))}` : ''}）`
                          : `消防覆盖 ${econ.fireCover}%${econ.hydrants > 0 ? `（消防栓 ${econ.hydrants} 座）` : ''}`
                      } · 灭火 {econ.rescueFire} 场</td>
                    </tr>
                    <tr className={econ.medMissRes > 0 ? 'bad' : (econ.clinics + econ.healthsts > 0 ? 'g' : '')}>
                      <td>悬壶济世</td>
                      <td>{
                        econ.medMissRes > 0
                          ? `医疗覆盖 ${econ.medCover}%（盲区 ${econ.medOut} 栋 · 看病要跨半座城${econ.medMissRes > 0 ? ` · 盲区住宅 ${econ.medMissRes} 栋 · 幸福 −${Math.min(7, Math.round(econ.medMissRes * 1.4))}` : ''}）`
                          : `医疗覆盖 ${econ.medCover}%${econ.clinics + econ.healthsts > 0
                            ? `（诊所 ${econ.clinics}${econ.healthsts > 0 ? ` · 防疫站 ${econ.healthsts}` : ''}）`
                            : ''}`
                      } · 疫病零蔓延化解 {econ.medSaved} 次</td>
                    </tr>
                    <tr className={econ.healthIdx < 55 ? 'bad' : ''}>
                      <td>健康指数</td><td>{econ.healthIdx} / 100（医院 {econ.hospitals} · 诊所 {econ.clinics} · 防疫站 {econ.healthsts}）</td>
                    </tr>
                    <tr className={econ.safetyIdx < 55 ? 'bad' : ''}>
                      <td>安全指数</td><td>{econ.safetyIdx} / 100（消防站 {econ.firestations} 座）</td>
                    </tr>
                    <tr className={econ.trafficIdx < 55 ? 'bad' : ''}>
                      <td>交通指数</td>
                      <td>{econ.trafficIdx} / 100（道路 {Math.round(econ.trafficIdx * (econ.buildings * 3) / 100)} / 需求 {econ.buildings * 3} 格{econ.busBonus > 0 ? ` · 公交 +${econ.busBonus}` : ''}）</td>
                    </tr>
                    <tr className={econ.cultureIdx < 40 ? 'bad' : ''}>
                      <td>文化指数</td>
                      <td>{econ.cultureIdx} / 100（文旅供给 {rinc(econ.cultureSup)} / 需求 {econ.cultureNeed} —— 神社/教堂/博物馆/影院等提升）</td>
                    </tr>
                    <tr className={econ.sciIdx < 30 ? 'bad' : ''}>
                      <td>科研指数</td>
                      <td>{econ.sciIdx} / 100（智慧 ×55% + 科技产出 ×45%）</td>
                    </tr>
                    <tr className={econ.busStops > 0 ? 'g' : ''}>
                      <td>公共交通</td>
                      <td>{econ.busStops >= 2 ? `巴士环线运转中（车站 ${econ.busStops} 座）` : econ.busStops === 1 ? '仅 1 座车站 —— 再建一座即开通环线' : '无 —— 两座邻路巴士站开通公交'}</td>
                    </tr>
                    <tr className={econ.tramStops >= 2 ? 'g' : ''}>
                      <td>有轨电车</td>
                      <td>{econ.tramStops >= 2 ? `电车干线运转中（电车站 ${econ.tramStops} 座 · 交通 +${econ.tramBonus} · 幸福 +2 · 整流所 16MW）` : econ.tramStops === 1 ? '仅 1 座电车站 —— 再建一座即开通干线（需研究「电力工程」）' : '无 —— 两座邻路电车站开通干线'}</td>
                    </tr>
                    <tr className={econ.metro.conn >= 2 ? 'g' : ''}>
                      <td>地铁</td>
                      <td>{econ.metro.conn >= 2 ? `线网运转中（车辆段 ${econ.metro.depots} · 接入车站 ${econ.metro.conn}/${econ.metro.stops} · 覆盖 ${econ.metro.cover}% · 交通 +${econ.metro.bonus}${econ.metro.hap > 0 ? ` · 幸福 +${econ.metro.hap}` : ''}）`
                        : econ.metro.depots > 0 ? `车辆段已落成 —— 沿链 12 格布站，已接入 ${econ.metro.conn} 座（两站成线通车）`
                        : '无 —— 建成车辆段并沿链接入地铁站开通地铁（需「建筑工程学」）'}</td>
                    </tr>
                    <tr className={econ.air.n > 0 ? 'g' : ''}>
                      <td>空港</td>
                      <td>{econ.air.n > 0 ? `空港运转中（在飞航线 ${econ.air.routes}/${econ.air.lines.length} · 累计 ${econ.air.flown} 架次 · 旅客 ${econ.air.pax} 人次 · 商圈覆盖 ${econ.air.cover}% · 游客 ×${econ.air.tourK.toFixed(2)}${econ.air.noise > 0 ? ` · 噪音圈住宅 ${econ.air.noise} 栋` : ''}，顶栏「航」翻空港航线）`
                        : '无 —— 建成空港航站楼即开邻省都会线（需「建筑工程学」；姊妹城好感到位各开花一条国际航线）'}</td>
                    </tr>
                    <tr className={econ.ferries > 0 ? 'g' : ''}>
                      <td>航运</td>
                      <td>{econ.ferries > 0 ? `渡轮码头 ${econ.ferries} 座，船舶巡游中（冬季停航）` : '无 —— 水畔渡轮码头自有船舶出港'}</td>
                    </tr>
                    <tr className={econ.kobans + econ.firestations + econ.hospitals > 0 ? 'g' : ''}>
                      <td>应急联动</td>
                      <td>{`交番 ${econ.kobans}${crowd.patrols ? `（巡逻车 ${crowd.patrols} 辆在途）` : ''} · 消防局 ${econ.firestations} · 医院 ${econ.hospitals} —— 消防扑救 ${econ.rescueFire} 次 · 急救处置 ${econ.rescueAid} 次；火灾/疫病两段结算：应急车到场免余损，设施务必邻路`}</td>
                    </tr>
                    <tr><td>城市评级</td>
                      <td className={econ.rating >= 80 ? 'g' : ''}>{econ.rating} 分 · {econ.ratingGrade} 级</td>
                    </tr>
                    <tr><td>人口构成</td>
                      <td>劳力 {econ.workers} · 学龄 {Math.round(econ.pop * 0.2)} · 银发 {Math.round(econ.pop * 0.18)}</td>
                    </tr>
                  </tbody></table>
                </section>
                <section>
                  <h3>粮食与科技</h3>
                  <table><tbody>
                    <tr className={econ.famine ? 'bad' : ''}>
                      <td>粮仓 库存/容量</td><td>{econ.food} / {econ.foodCap}</td>
                    </tr>
                    <tr><td>产量 / 口粮</td><td>{rinc(econ.foodProd)} / {rinc(econ.foodEat)} 粮每分</td></tr>
                    <tr className={econ.foodNet < 0 ? 'bad' : ''}>
                      <td>粮食净额</td><td>{rincS(econ.foodNet)} 粮/分</td>
                    </tr>
                    <tr><td>智慧指数</td><td>{econ.wisdom} / 100（教育容量 {econ.eduCap}）</td></tr>
                    <tr><td>科研指数</td><td>{econ.sciIdx} / 100（决定城市发展潜力：影响评级与解锁节奏）</td></tr>
                    <tr><td>科技点</td><td>{fmtG(econ.sp)} SP（+{rinc(econ.spRate)}/分）</td></tr>
                    <tr><td>已研究科技</td><td>{econ.techs.length} / {TECHS.length} 项</td></tr>
                  </tbody></table>
                </section>
                <section>
                  <h3>水务与季节（v6）</h3>
                  <table><tbody>
                    <tr className={econ.waterIdx < 40 ? 'bad' : ''}>
                      <td>供水覆盖率</td><td>{econ.waterIdx} / 100（总容量 {econ.waterCapT} 人）</td>
                    </tr>
                    <tr><td>水务设施</td><td>{econ.hasWaterTower ? '水塔/净水厂运转中' : '无 —— 缺水拖累幸福与迁入'}</td>
                    </tr>
                    <tr><td>当前季节</td><td>{SEASONS[econ.season]?.name ?? '夏'}季（{SEASONS[econ.season]?.note ?? ''}）</td>
                    </tr>
                    <tr><td>跨水桥</td><td>{econ.bridgeTiles} 格（水上修路自动架桥，拆桥返还 3G/格）</td>
                    </tr>
                  </tbody></table>
                </section>
                <section>
                  <h3>货物供应链（v10）</h3>
                  <table><tbody>
                    <tr className={econ.goodsIdx < 45 ? 'bad' : ''}>
                      <td>货仓 库存/容量</td><td>{econ.goods} / {econ.goodsCap}（仓库每座 +80）</td>
                    </tr>
                    <tr><td>产量 / 消耗</td>
                      <td>{rinc(econ.goodsProd)} / {rinc(econ.goodsCons)} 件每分（含游客采买）</td>
                    </tr>
                    <tr className={econ.goodsNet < 0 ? 'bad' : ''}>
                      <td>货物净额</td><td>{rincS(econ.goodsNet)} 件/分</td>
                    </tr>
                    <tr><td>供货率</td>
                      <td>{econ.goodsIdx}% → 商业收入 ×{(0.55 + 0.45 * econ.goodsIdx / 100).toFixed(2)}</td>
                    </tr>
                    <tr className={econ.exportRate > 0 ? 'g' : ''}>
                      <td>出口吞吐</td>
                      <td>{(econ.ports + econ.railHubs) > 0
                        ? (econ.exportRate > 0
                          ? `${rinc(econ.exportRate)} 件/分 · 累计创汇 ${econ.exportTotal}G`
                          : econ.exportHold ? '惜售囤货中 —— 恢复出口即按市价外销' : '待命 —— 货仓超八成且产大于销时自动外销')
                        : '无 —— 建港口吊机/渡轮码头/铁路货运站可外销余货'}</td>
                    </tr>
                    <tr>
                      <td>出口单价</td>
                      <td>{econ.expPrice.toFixed(2)}G/件（基准 1.35 × 市价 {Math.round(econ.mkt * 100)}%{econ.mktTrend > 0.005 ? ' ↑' : econ.mktTrend < -0.005 ? ' ↓' : ' →'}{econ.techs.includes('metal') ? ' × 冶金 1.25' : ''}）</td>
                    </tr>
                  </tbody></table>
                  <div className="pxc-mkt">
                    <div className="pxc-mktbar" aria-hidden>
                      <i style={{ width: `${Math.round((econ.mkt - 0.55) / 1.0 * 100)}%` }} />
                      <span className="tick" style={{ left: '45%' }} />
                    </div>
                    <div className="pxc-mktrow">
                      <span className={econ.mkt >= 1.15 ? 'g' : econ.mkt <= 0.75 ? 'bad' : ''}>
                        市价 {Math.round(econ.mkt * 100)}%{econ.mktTrend > 0.005 ? ' ↑ 看涨' : econ.mktTrend < -0.005 ? ' ↓ 看跌' : ' → 盘整'}（55% – 155% 波动）
                      </span>
                      <button className={`pxc-btn${econ.exportHold ? ' primary' : ''}`} onClick={toggleHold}>
                        {econ.exportHold ? '恢复出口（随行就市）' : '惜售囤货（暂停出口）'}
                      </button>
                    </div>
                    <div className="taxhint">低吸高抛：市价低迷时囤货惜售，行情看涨时恢复出口多赚差价；铁路货运站吞吐 4 件/分（港口 2.2），内陆城市也可出口</div>
                  </div>
                </section>
                <section>
                  <h3>观光经济（v10）</h3>
                  <table><tbody>
                    <tr><td>当前游客</td>
                      <td>{econ.tourists} 人 · 消费 +{rinc(econ.incomeTour)}G/分（城市名片科技 +20%）</td>
                    </tr>
                    <tr><td>旅游指数</td>
                      <td>{econ.tourIdx} / 100（景点吸引力 {rinc(econ.attract)} 分）</td>
                    </tr>
                    <tr><td>酒店床位</td>
                      <td>{econ.beds} 床（酒店 160 / 民宿 24；接待上限 {econ.beds * 2 + 30} 人）</td>
                    </tr>
                    <tr><td>季节 / 天气</td>
                      <td>夏 1.25× · 春 1.1× · 秋 1.15× · 冬 0.55×；晴 1.15× / 雨 0.7× / 雪 0.6×</td>
                    </tr>
                    <tr className={econ.lg.pre ? 'g' : ''}>
                      <td>比赛日（v34）</td>
                      <td>{econ.lg.on
                        ? econ.lg.pre
                          ? `预热中 ×1.22 游客 · ×1.08 商业 —— ${Math.max(0.1, Math.round((econ.lg.next - econ.gHours) * 10) / 10)} 游戏时后主场迎战${econ.lg.oppN}`
                          : `平日 —— 下场 ${Math.max(0, Math.round((econ.lg.next - econ.gHours) * 10) / 10)} 游戏时后迎战${econ.lg.oppN}（顶栏「球」看赛程战绩）`
                        : '无 —— 建成体育场后「市民联」联赛开张，比赛日球迷进城消费'}</td>
                    </tr>
                    <tr className={econ.zoo.n > 0 ? 'g' : ''}>
                      <td>百兽之园（v35）</td>
                      <td>{econ.zoo.on
                        ? `物种图鉴 ${econ.zoo.n}/${econ.zoo.total} · 物种加成 吸引力 +${econ.zoo.at} · 幸福 +${econ.zoo.hap}${econ.zoo.k > 1 ? ` · 游客 ×${econ.zoo.k.toFixed(2)}` : ''}（顶栏「兽」翻图鉴）`
                        : '无 —— 建成动物园（需「城市名片」）后物种图鉴开册，住户越多吸引力越高'}</td>
                    </tr>
                    <tr><td>吸引力大户</td>
                      <td>摩天轮/水族馆/城堡 5 · 博物馆/体育场 4 · 神社/天文台 3 分</td>
                    </tr>
                  </tbody></table>
                </section>
                <section>
                  <h3>市况荣枯（v33）</h3>
                  <table><tbody>
                    <tr className={econ.cycPhase === 0 ? 'bad' : econ.cycPhase === 3 ? 'g' : ''}>
                      <td>景气指数</td>
                      <td>{econ.cycIdx}（{CYC_PHASES[econ.cycPhase]?.name ?? '平稳'} · 幸福 {econ.cycHap >= 0 ? '+' : ''}{econ.cycHap}）</td>
                    </tr>
                    <tr><td>市况影响</td>
                      <td>商业 ×{econ.cycComK.toFixed(2)} · 游客 ×{econ.cycTourK.toFixed(2)} · 工业 ×{econ.cycIndK.toFixed(2)} · 迁入 ×{econ.cycMigK.toFixed(2)}</td>
                    </tr>
                    <tr><td>荣枯账本</td>
                      <td>{econ.cycBoomN + econ.cycRecN > 0
                        ? `繁荣 ${econ.cycBoomN} 段（累计 ${fmtDur(econ.cycBoomT)}）· 衰退 ${econ.cycRecN} 段（累计 ${fmtDur(econ.cycRecT)}）`
                        : '尚未历经荣枯 —— 指数偏离均值后各有惯性，大灾大喜也会震动市况'}</td>
                    </tr>
                  </tbody></table>
                  <div className="pxc-cyc">
                    <div className="pxc-cycbar" aria-hidden>
                      <i className="b0" /><i className="b1" /><i className="b2" /><i className="b3" />
                      <span className="mark" style={{ left: `${Math.round((econ.cycIdx - CYC_MIN) / (CYC_MAX - CYC_MIN) * 100)}%` }} />
                    </div>
                    <div className="pxc-cycrow">
                      {CYC_PHASES.map((p, i) => (
                        <span key={i} className={i === econ.cycPhase ? `ph${i} cur` : `ph${i}`}>{p.name}</span>
                      ))}
                      <span className={`idxv ${econ.cycPhase === 0 ? 'bad' : econ.cycPhase === 3 ? 'g' : ''}`}>
                        {econ.cycIdx}
                      </span>
                    </div>
                    <div className="taxhint">{CYC_PHASES[econ.cycPhase]?.note ?? ''}。景气指数随时间起落：≥120 繁荣、&lt;90 衰退；衰退时少举债缓扩张，繁荣时抓住窗口多营生</div>
                  </div>
                </section>
                <section>
                  <h3>领地</h3>
                  <table><tbody>
                    <tr><td>已购领地</td><td>{econ.chunks} 块（每块 16×16 格）</td></tr>
                    <tr><td>购地方法</td><td>点击迷雾边缘金色虚线框</td></tr>
                    <tr><td>地价</td><td>随环距递增（140G 起，越远越贵）</td></tr>
                    <tr><td>拆除回收</td><td>建筑返还造价 50% · 道路/树木 1G/格 · 桥 3G/格</td></tr>
                  </tbody></table>
                </section>
                <section className="evlog">
                  <h3>城市大事记（v5）</h3>
                  {econ.eventLog.length === 0 ? (
                    <div className="evempty">暂无事件 —— 城市风平浪静。人口到达 30 后，机遇与灾祸将不期而至</div>
                  ) : (
                    <table><tbody>
                      {econ.eventLog.slice().reverse().map((l, idx) => {
                        const mm = String(Math.floor(l.t / 60)).padStart(2, '0');
                        const ss = String(Math.floor(l.t % 60)).padStart(2, '0');
                        return (
                          <tr key={idx} className={l.kind === 'bad' ? 'bad' : 'g'}>
                            <td>{mm}:{ss}</td>
                            <td>{l.kind === 'bad' ? '⚠' : '✦'} {l.name}</td>
                            <td>{l.result || '—'}</td>
                          </tr>
                        );
                      })}
                    </tbody></table>
                  )}
                  <div className="taxhint">消防局压制火灾 · 医院收治疫病 · 电力冗余防停电 —— 指数齐全的城市能把灾祸变成小插曲</div>
                </section>
              </div>
              {econ.powerDem > econ.powerSup && (
                <div className="pxc-fwarn">缺电警告：建造火电厂（LV4）或风车磨坊（LV3）可恢复供电，否则收入大幅打折！</div>
              )}
              {econ.famine > 0 && (
                <div className="pxc-fwarn">饥荒警告：粮仓见底！市民正在迁离 —— 立即建造温室大棚（粮仓 +5/分）或筒仓（粮仓 +120）！</div>
              )}
              <div className="pxc-row" style={{ marginTop: 10 }}>
                <button className="pxc-btn primary" onClick={() => openModal('data')}>
                  <img src={iu('chart')} alt="" />城市志·指数图表
                </button>
                <button className="pxc-btn primary" onClick={() => openModal('policy')}>
                  <img src={iu('flag')} alt="" />市政法令厅
                </button>
                <button className="pxc-btn primary" onClick={() => openModal('tech')}>
                  <img src={iu('flask')} alt="" />科技研究院
                </button>
                <button className="pxc-btn" onClick={switchMode}>
                  <img src={iu('view')} alt="" />切换沙盒模式
                </button>
                {confirmReset ? (
                  <button className="pxc-btn danger" onClick={doNewGame}>确认重开？</button>
                ) : (
                  <button className="pxc-btn danger" onClick={() => {
                    setConfirmReset(true);
                    window.setTimeout(() => setConfirmReset(false), 3200);
                  }}>重开新游戏</button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 市政法令厅模态（v10） */}
      {modal === 'policy' && econ && (
        <div className="pxc-mask" onClick={e => { if (e.target === e.currentTarget) setModal('none'); }}>
          <div className="pxc-modal pxc-policy" role="dialog" aria-label="市政法令厅">
            <header>
              市 政 法 令 厅
              <button className="pxc-x" onClick={() => setModal('none')} aria-label="关闭">×</button>
            </header>
            <div className="pxc-body">
              <div className="pxc-ordsum">
                颁布中 <b>{econ.ords.filter(o => o.on).length}/{econ.ords.length}</b> 条 ·
                行政开支 <b className={econ.ordCost > 0 ? 'bad' : 'g'}>{rinc(econ.ordCost)}G/分</b> ·
                法令随时可颁布 / 废止，效果立即生效
              </div>
              <div className="pxc-ordlist">
                {econ.ords.map(o => {
                  const locked = o.lockLv || !o.reqOk;
                  return (
                    <div key={o.id} className={`pxc-ord${o.on ? ' on' : ''}${locked && !o.on ? ' lock' : ''}`}>
                      <div className="pxc-ordinfo">
                        <div className="t1">
                          <span className="st">{o.on ? '●' : locked ? '锁' : '○'}</span>
                          {o.name}
                          {o.cost > 0 && <span className="cost">{rinc(o.cost)}G/分</span>}
                          <span className="lv">LV{o.lv}</span>
                        </div>
                        <div className="t2">{o.desc}</div>
                        {locked && (
                          <div className="t3">{o.lockLv ? `需市政厅 LV${o.lv} 解锁` : `条件未满足：${o.reqNote}`}</div>
                        )}
                      </div>
                      <button
                        className={`pxc-btn${o.on ? ' danger' : ' primary'}${locked && !o.on ? ' dis' : ''}`}
                        disabled={locked && !o.on}
                        onClick={() => {
                          const t = engineRef.current?.tycoon;
                          if (!t) return;
                          const r = t.toggleOrd(o.id);
                          if (r === 'lock') {
                            say(o.lockLv
                              ? `「${o.name}」需市政厅 LV${o.lv} 才能颁布`
                              : `「${o.name}」条件未满足：${o.reqNote}`);
                          }
                        }}
                      >
                        {o.on ? '废止' : locked ? '未解锁' : '颁布'}
                      </button>
                    </div>
                  );
                })}
              </div>
              <div className="taxhint">开源节流的施政天平：节能令省电却伤民心、消费券增收却烧行政费、开放落户提速却挤占宜居 —— 政令组合是经营的第二杠杆</div>
            </div>
          </div>
        </div>
      )}

      {/* v16 城市节庆模态（经营模式） */}
      {modal === 'fest' && econ && (
        <div className="pxc-mask" onClick={e => { if (e.target === e.currentTarget) setModal('none'); }}>
          <div className="pxc-modal pxc-fest" role="dialog" aria-label="城市节庆">
            <header>
              城 市 节 庆
              <button className="pxc-x" onClick={() => setModal('none')} aria-label="关闭">×</button>
            </header>
            <div className="pxc-body">
              <div className={`fest-card k${econ.season}`}>
                <div className="fc-head">
                  <span className="fc-badge">{SEASONS[econ.season].name} · 当季</span>
                  <b className="fc-name">{FESTS[econ.season].name}</b>
                  <span className="fc-dur">{FESTS[econ.season].dur} 秒</span>
                </div>
                <div className="fc-desc">{FESTS[econ.season].desc}</div>
                {econ.fest ? (
                  <div className="fest-live">
                    <div className="fl-bar"><i style={{ width: `${Math.max(0, Math.min(100, Math.round(econ.fest.left / Math.max(1, econ.fest.dur) * 100)))}%` }} /></div>
                    <div className="fl-t">「{econ.fest.name}」进行中 —— 还剩 {econ.fest.left} 秒，全城同庆</div>
                  </div>
                ) : econ.festCd > 0 ? (
                  <div className="fest-cd">筹备休整中 —— 约 {econ.festCd} 秒后可再办节庆</div>
                ) : econ.festLock ? (
                  <div className="fest-cd lock">需市政厅 LV{econ.festLv} 才能举办节庆（升级市政厅解锁）</div>
                ) : (
                  <button
                    className="pxc-btn primary fest-go"
                    disabled={econ.coins < econ.festCost}
                    onClick={() => {
                      const t = engineRef.current?.tycoon;
                      if (!t) return;
                      const r = t.startFestival();
                      if (r === 'poor') say(`金币不够：办「${FESTS[econ.season].name}」需要 ${econ.festCost}G`);
                      else if (r === 'lv') say(`需市政厅 LV${econ.festLv} 才能举办节庆`);
                      else if (r === 'cd') say('筹备休整中，稍等片刻就能再办');
                    }}
                  >
                    举办「{FESTS[econ.season].name}」 · {econ.festCost}G
                  </button>
                )}
              </div>
              <div className="fest-hist">
                <span className="fh-total">累计举办 <b>{econ.festCount}</b> 场</span>
                {FESTS.map((f, k) => (
                  <span key={k} className={`fh-kind${econ.festKinds.includes(k) ? ' on' : ''}`}>
                    {f.name}{econ.festKinds.includes(k) ? ' ✓' : ''}
                  </span>
                ))}
              </div>
              <div className="fest-note">
                节日随季节轮转（每季 4 分钟）：春天樱吹雪、夏天夜花火、秋天金叶满街、冬天孔明灯升空 ——
                办节提振幸福与市面，也是市民大事记里的高光时刻；连办四季解锁成就「四季轮庆」
              </div>
            </div>
          </div>
        </div>
      )}

      {/* v34 体育盛典「球场风云」模态（经营模式） */}
      {modal === 'lg' && econ && (
        <div className="pxc-mask" onClick={e => { if (e.target === e.currentTarget) setModal('none'); }}>
          <div className="pxc-modal pxc-lg" role="dialog" aria-label="球场风云">
            <header>
              球 场 风 云
              <button className="pxc-x" onClick={() => setModal('none')} aria-label="关闭">×</button>
            </header>
            <div className="pxc-body">
              {!econ.lg.on ? (
                <div className="lg-empty">
                  <div className="le-t">联赛尚未开张</div>
                  <div className="le-d">建成一座<b>体育场</b>，市民俱乐部「市民联」就会挂牌成立：
                    每隔数日一场主场比赛，比赛日商业 ×1.08 · 游客 ×1.22 · 幸福 +1，
                    赢球还有 120 秒的全城狂欢；战绩与奖杯都会写进城市编年史</div>
                </div>
              ) : (
                <>
                  {/* 赛程卡：下一场对手 + 倒计时（赛前窗口内高亮） */}
                  <div className={`lg-card${econ.lg.pre ? ' pre' : ''}`}>
                    <div className="lc-head">
                      <span className="lc-badge">{econ.lg.pre ? '比赛日' : `第 ${econ.lg.zn + 1} 赛季 · 第 ${Math.min(6, econ.lg.sn + 1)} 轮`}</span>
                      <b className="lc-name">{econ.lg.pre ? `距开赛 ${Math.max(0.1, Math.round((econ.lg.next - econ.gHours) * 10) / 10)} 游戏时` : `${Math.max(0, Math.round((econ.lg.next - econ.gHours) * 10) / 10)} 游戏时后开赛`}</b>
                      <span className="lc-tier">{econ.lg.tierN}</span>
                    </div>
                    <div className="lc-vs"><b>市民联</b><i>主场迎战</i><span>{econ.lg.oppN}</span></div>
                    {econ.lg.pre && <div className="lc-hot">客场球迷正进城：商业 ×1.08 · 游客 ×1.22 · 幸福 +1</div>}
                    {econ.lg.moodT > 0 && (
                      <div className={`lc-mood${econ.lg.mood > 0 ? ' up' : ' down'}`}>
                        {econ.lg.mood > 0 ? `赛后余温：幸福 +${econ.lg.mood}（还剩 ${econ.lg.moodT} 秒）` : `赛后低落：幸福 ${econ.lg.mood}（还剩 ${econ.lg.moodT} 秒）`}
                      </div>
                    )}
                  </div>
                  {/* 战绩表：全期 + 本季积分 */}
                  <table className="lg-stats"><tbody>
                    <tr>
                      <td>全期战绩</td>
                      <td>{econ.lg.pl} 场 · <b className="g">{econ.lg.w} 胜</b> · {econ.lg.d} 平 · <b className="bad">{econ.lg.l} 负</b> · 进 {econ.lg.gf} / 失 {econ.lg.ga}</td>
                    </tr>
                    <tr>
                      <td>本季积分</td>
                      <td>{econ.lg.pts} 分（{econ.lg.sn}/6 场 · 积分 ≥13 加冕冠军 · ≥10 亚军 · ≥7 季军）</td>
                    </tr>
                    <tr>
                      <td>连胜 / 纪录</td>
                      <td>当前{econ.lg.str > 0 ? ` ${econ.lg.str} 连胜` : '无连胜'} · 历史最长 {econ.lg.strB} 连胜 · 单季最高 {econ.lg.bp} 分</td>
                    </tr>
                    <tr>
                      <td>上一场</td>
                      <td>{econ.lg.last || '尚未开赛'}</td>
                    </tr>
                  </tbody></table>
                  {/* 最近五场 */}
                  <div className="lg-form">
                    <span className="lf-label">最近五场</span>
                    {econ.lg.form.length === 0 && <span className="lf-none">——</span>}
                    {econ.lg.form.map((f, i) => (
                      <span key={i} className={`lf-chip ${f === '胜' ? 'w' : f === '平' ? 'd' : 'l'}`}>{f}</span>
                    ))}
                  </div>
                  {/* 荣誉墙 */}
                  <div className="lg-honour">
                    <span className={`lh-cup${econ.lg.t1 > 0 ? ' on' : ''}`}>冠军旗帜 ×{econ.lg.t1}</span>
                    <span className={`lh-cup${econ.lg.t2 > 0 ? ' on' : ''}`}>亚军奖盘 ×{econ.lg.t2}</span>
                    <span className={`lh-cup${econ.lg.t3 > 0 ? ' on' : ''}`}>季军奖牌 ×{econ.lg.t3}</span>
                    <span className="lh-zn">已征战 {econ.lg.zn} 个赛季</span>
                  </div>
                </>
              )}
              <div className="lg-note">
                球是圆的，输赢都是城市的功课：客队档次随城市评级水涨船高（业余组 → 地区组 → 全国组 → 豪门巡访），
                幸福度越高、球迷底蕴越厚，主场胜率越高 —— 赛季收官积分达 13 分即可加冕；赢球彩带飘满全城的瞬间，就是这座城的高光时刻
              </div>
            </div>
          </div>
        </div>
      )}

      {/* v35 百兽之园「物种图鉴」模态（经营模式） */}
      {modal === 'zoo' && econ && (
        <div className="pxc-mask" onClick={e => { if (e.target === e.currentTarget) setModal('none'); }}>
          <div className="pxc-modal pxc-zoo" role="dialog" aria-label="物种图鉴">
            <header>
              物 种 图 鉴
              <button className="pxc-x" onClick={() => setModal('none')} aria-label="关闭">×</button>
            </header>
            <div className="pxc-body">
              {!econ.zoo.on ? (
                <div className="zoo-empty">
                  <div className="ze-t">图鉴尚未开册</div>
                  <div className="ze-d">建成一座<b>动物园</b>（需研究「城市名片」），动物巡查员就会定期进园评估栖息环境：
                    城市的吸引力与评级越高，动物住户来得越勤 —— 每种住户带来吸引力与幸福加成，
                    集齐 9 种翻满图鉴；冬季企鹅最爱来，镇园之宝大熊猫要评级 ≥80 且游客 ≥80 才点头</div>
                </div>
              ) : (
                <>
                  {/* 图鉴进度 */}
                  <div className="zoo-head">
                    <span className="zh-progress">图鉴 <b>{econ.zoo.n}</b>/{econ.zoo.total} 种</span>
                    <span className="zh-bonus">吸引力 +{econ.zoo.at} · 幸福 +{econ.zoo.hap}{econ.zoo.k > 1 ? ` · 游客 ×${econ.zoo.k.toFixed(2)}` : ''}</span>
                    <span className="zh-next">下次巡查 {Math.max(0, Math.round((econ.zoo.next - econ.gHours) * 10) / 10)} 游戏时后</span>
                  </div>
                  {/* 九宫格图鉴卡 */}
                  <div className="zoo-grid">
                    {ZOO_SPECIES.map(sp => {
                      const got = econ.zoo.got.includes(sp.id);
                      return (
                        <div key={sp.id} className={`zk-card${got ? ' on' : ''}${sp.rare === 2 ? ' rare2' : sp.rare === 1 ? ' rare1' : ''}`}>
                          <div className="zk-head">
                            <img src={iu(sp.icon)} alt="" width={22} height={22} />
                            <b>{got ? sp.name : '？？？'}</b>
                            {sp.rare === 2 ? <i className="zk-badge r2">镇园</i> : sp.rare === 1 ? <i className="zk-badge r1">稀有</i> : null}
                          </div>
                          <div className="zk-note">{got ? sp.note : '图鉴未录 —— 等它搬来那天再告诉你'}</div>
                          <div className="zk-bonus">{sp.at > 0 ? `吸引力 +${sp.at}` : ''}{sp.hap > 0 ? `${sp.at > 0 ? ' · ' : ''}幸福 +${sp.hap}` : ''}{sp.tourK ? ` · 游客 ×${sp.tourK.toFixed(2)}` : ''}</div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
              <div className="zoo-note">
                动物入住看城市的底气：吸引力与评级越高，巡查员的评估越快通过；
                季节也有话语权 —— 冬天企鹅排着队来，夏天锦鲤挤破池塘；
                拆园不停簿：已入住的住户寄养城中、加成保留，重建动物园巡查即恢复
              </div>
            </div>
          </div>
        </div>
      )}

      {/* v39 城市日报模态（报馆与城市之声） */}
      {modal === 'news' && econ && (() => {
        const issues = econ.news.issues;
        const cur = issues[Math.min(npSel, issues.length - 1)] ?? null;
        return (
          <div className="pxc-mask" onClick={e => { if (e.target === e.currentTarget) setModal('none'); }}>
            <div className="pxc-modal pxc-news" role="dialog" aria-label="城市日报">
              <header>
                城 市 日 报
                <button className="pxc-x" onClick={() => setModal('none')} aria-label="关闭">×</button>
              </header>
              <div className="pxc-body">
                {!econ.news.on ? (
                  <div className="news-empty">
                    <div className="ne-t">报馆尚未创刊</div>
                    <div className="ne-d">建成一座<b>报馆</b>（需研究「义务教育」），排字房的油灯当晚就会亮起来：
                      每七游戏日出版一期《城市日报》—— 头版头条自动选编年史大事，大事出号外；
                      市况栏报景气、气象栏报季节、来信选登摘市长信箱、广告栏随商户开门念词；
                      发行量随人口与识字率浮动，卖报所得进府库</div>
                  </div>
                ) : !cur ? (
                  <div className="news-empty">
                    <div className="ne-t">创刊在即</div>
                    <div className="ne-d">报馆已开工排字 —— 首期《城市日报》将在次日清晨开印，
                      出刊后这里就是整座城的读报台</div>
                  </div>
                ) : (
                  <>
                    {/* 过刊翻阅 */}
                    {issues.length > 1 && (
                      <div className="np-tabs" role="tablist" aria-label="过刊翻阅">
                        {issues.map((it, i) => (
                          <button key={it.n} role="tab" aria-selected={i === Math.min(npSel, issues.length - 1)}
                            className={`np-tab${i === Math.min(npSel, issues.length - 1) ? ' on' : ''}`}
                            onClick={() => setNpSel(i)}>
                            第{it.n}期{it.extra ? '·号外' : ''}
                          </button>
                        ))}
                      </div>
                    )}
                    {/* 报版 */}
                    <div className={`np-sheet${cur.extra ? ' extra' : ''}`} data-n={cur.n}>
                      <div className="np-mast">
                        <div className="np-name">{cur.extra ? '号外' : '城市日报'}</div>
                        <div className="np-meta">
                          <span>第 {cur.n} 期</span>
                          <span>开埠第 {cur.day} 天</span>
                          {cur.extra && <em className="np-x-tag">大事加印</em>}
                        </div>
                        <div className="np-slogan">城中大事小情 · 七日一页 · 城市之声</div>
                      </div>
                      <div className="np-headline">
                        <div className="nh-row">
                          <img src={iu(cur.head.icon)} alt="" />
                          <b>{cur.head.title}</b>
                        </div>
                        <p>{cur.head.text}</p>
                      </div>
                      <div className="np-cols">
                        <div className="np-box np-market">
                          <b>市况</b>
                          <p>{cur.market}</p>
                        </div>
                        <div className="np-box np-weather">
                          <b>气象</b>
                          <p>{cur.weather}</p>
                        </div>
                        <div className="np-box np-letter">
                          <b>来信选登</b>
                          {cur.letter
                            ? <p>「{cur.letter.sj}」—— {cur.letter.nm}：<br />{cur.letter.tx}</p>
                            : <p className="np-dim">本栏目虚位以待 —— 等一封市民来信（市长信箱的来信会择要选登）</p>}
                        </div>
                        <div className="np-box np-serial">
                          <b>连载 · 城南旧事</b>
                          <p>{cur.serial}</p>
                        </div>
                      </div>
                      <div className="np-ads">
                        {cur.ads.map((a, i) => <div key={i} className="np-ad">{a}</div>)}
                      </div>
                      <div className="np-foot">
                        本期发行 <b>{cur.circ}</b> 份 · 发行净收入 <b>{cur.earn >= 0 ? '+' : ''}{cur.earn}</b>G ·
                        累计出版 <b>{econ.news.n}</b> 期 · 累计发行 <b>{econ.news.circT}</b> 份 ·
                        下期 {Math.max(0, Math.round((econ.news.next - econ.gHours) * 10) / 10)} 游戏时后开印
                      </div>
                    </div>
                    <div className="news-note">
                      头版头条自动选编年史大事（大事记出号外加印）；
                      发行量看人口与识字率的底气 —— 办教育、聚人口，报纸才卖得动；
                      报馆被拆则停刊，过刊与期数保留，复建自动复刊
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* v40 荣誉殿堂模态（名人堂与季评授勋） */}
      {modal === 'hall' && econ && (
        <div className="pxc-mask" onClick={e => { if (e.target === e.currentTarget) setModal('none'); }}>
          <div className="pxc-modal pxc-hall" role="dialog" aria-label="荣誉殿堂">
            <header>
              荣 誉 殿 堂
              <button className="pxc-x" onClick={() => setModal('none')} aria-label="关闭">×</button>
            </header>
            <div className="pxc-body">
              {!econ.hall.on ? (
                <div className="hall-empty">
                  <div className="he-t">名人堂尚未开榜</div>
                  <div className="he-d">建成一座<b>名人堂</b>（需研究「城市名片」），柱廊主殿的鎏金尖顶立起来那一刻即开榜：
                    每逢换季整点评出一颗「本季城市之光」—— 八大奖项按城市状态加权
                    （消防局在城才评得动见义勇为、赢球才有人捧绿茵之星），
                    获奖市民名镌光荣榜、心情大振，全城幸福也沾光；授勋大事会写进编年史，
                    报馆在城时还能上《城市日报》号外</div>
                </div>
              ) : (
                <>
                  {/* 评选进度 */}
                  <div className="hall-head">
                    <span className="hh-progress">已评 <b>{econ.hall.n}</b> 届 · 奖项 <b>{econ.hall.awards.filter(a => a.got).length}</b>/{econ.hall.awards.length}</span>
                    <span className={`hh-hap${econ.hall.hapOn ? ' on' : ''}`}>{econ.hall.hapOn ? `授勋荣光生效中 —— 幸福 +1（剩 ${econ.hall.hapT} 秒）` : '下届授勋后全城幸福 +1'}</span>
                    <span className="hh-next">下届开榜 {Math.max(0, Math.round((econ.hall.next - econ.gHours) * 10) / 10)} 游戏时后（换季整点）</span>
                  </div>
                  {/* 八大奖项图鉴 */}
                  <div className="hall-awards">
                    {econ.hall.awards.map(a => (
                      <div key={a.id} className={`hk-card${a.got ? ' on' : ''}`} data-id={a.id}
                        title={a.got ? `${a.name} —— 已评出 · ${a.note}` : `${a.name} —— 尚未评出：${a.note}`}>
                        <img src={iu(a.icon)} alt="" />
                        <b>{a.name}</b>
                        <span className={a.got ? 'got' : 'no'}>{a.got ? '已评出' : '虚位以待'}</span>
                      </div>
                    ))}
                  </div>
                  {/* 光荣榜（新在前） */}
                  <div className="hall-rolls">
                    <h4>光 荣 榜</h4>
                    {econ.hall.rolls.map(r => (
                      <div key={r.n} className="hr-roll" data-n={r.n}>
                        <div className="hrr-row">
                          <span className="hr-n">第{r.n}届</span>
                          <span className="hr-season">{r.season}季</span>
                          <b className="hr-award">「{r.award}」</b>
                          <span className="hr-nm">{r.nm}（{r.job}）</span>
                          <span className="hr-day">开埠第 {r.day} 天</span>
                        </div>
                        <p className="hr-cite">{r.cite}</p>
                      </div>
                    ))}
                    {!econ.hall.rolls.length && (
                      <div className="hr-empty">光荣榜虚位以待 —— 首届评选即将在下一个换季整点开榜</div>
                    )}
                  </div>
                  <div className="hall-note">
                    八大奖项各有门路：消防局在城才评得动见义勇为、医院诊所捧出仁心仁术、
                    交番警察局推举平安卫士、学校图书馆尊师杏坛春晖、联赛赢球才有绿茵之星、
                    商街红火创业先锋应运而生；拆堂停评光荣榜保留，复建自动复评
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* v41 轨道交通模态（地铁线网与通勤圈） */}
      {modal === 'metro' && econ && (
        <div className="pxc-mask" onClick={e => { if (e.target === e.currentTarget) setModal('none'); }}>
          <div className="pxc-modal pxc-metro" role="dialog" aria-label="轨道交通">
            <header>
              轨 道 交 通
              <button className="pxc-x" onClick={() => setModal('none')} aria-label="关闭">×</button>
            </header>
            <div className="pxc-body">
              {econ.metro.depots === 0 ? (
                <div className="mt-empty">
                  <div className="me-t">地铁尚未破土</div>
                  <div className="me-d">建成一座<b>地铁车辆段</b>（需研究「建筑工程学」）作全线锚点，再沿切比雪夫 12 格内布设<b>地铁站</b>逐站续链
                    （站与站手拉手也能把线路送出很远）—— 两站接入即通车：
                    接入站半径 5 格通勤圈商铺收入 +6%、沿线住宅幸福 +1.2/栋，
                    每接入站交通 +5（至多 +20）；未接入的车站只是摆设，
                    施工期间路面拥堵会加剧，通车那日编年史记下「首线通车」</div>
                </div>
              ) : (
                <>
                  {/* 线网状态头 */}
                  <div className="mt-head">
                    <span className="mh-prog">车辆段 <b>{econ.metro.depots}</b> · 车站 <b>{econ.metro.stops}</b> 座（接入 <b>{econ.metro.conn}</b>）</span>
                    <span className={`mh-net${econ.metro.conn >= 2 ? ' on' : ''}`}>{econ.metro.conn >= 2 ? '线网运转中 —— 列车沿链穿行' : '尚未成线 —— 再接入 1 座车站即通车'}</span>
                    <span className="mh-cover">通勤覆盖 <b>{econ.metro.cover}</b>%（圈内 {econ.metro.in} 栋 · 圈外 {econ.metro.out} 栋）</span>
                  </div>
                  {/* 覆盖进度条 */}
                  <div className="mt-bar"><i style={{ width: `${Math.min(100, econ.metro.cover)}%` }} /></div>
                  {/* 线网四卡 */}
                  <div className="mt-cards">
                    <div className="ms-card" title="接入车辆段、正在通车的车站数 —— 两站起算交通加成">
                      <b>{econ.metro.conn}</b><span>接入车站</span>
                    </div>
                    <div className={`ms-card${econ.metro.stops - econ.metro.conn > 0 ? ' warn' : ''}`} title="未接入车辆段的车站 —— 沿链 12 格内逐站续接才能通车">
                      <b>{econ.metro.stops - econ.metro.conn}</b><span>未接入车站</span>
                    </div>
                    <div className="ms-card" title="接入站带来的交通指数加成（每站 +5，至多 +20）">
                      <b>+{econ.metro.bonus}</b><span>交通加成</span>
                    </div>
                    <div className={`ms-card${econ.metro.hap > 0 ? ' on' : ''}`} title="通勤圈内住宅的幸福加成（每栋 +1.2，至多 +7）">
                      <b>+{econ.metro.hap}</b><span>幸福加成</span>
                    </div>
                  </div>
                  <div className="mt-note">
                    地铁沿链组网：车辆段是全线锚点，车站沿切比雪夫 12 格内逐站续链；
                    接入站以 5 格通勤圈服务商铺与住宅（收入 +6% · 幸福 +1.2/栋）——
                    未接入的车站只是摆设；孤立车站上会出现「未接入」提示，
                    信号故障时列车限速缓行（交通 −15%），通勤高峰沿线商铺客流更旺
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* v42 空港航线模态（机场与航线） */}
      {modal === 'air' && econ && (
        <div className="pxc-mask" onClick={e => { if (e.target === e.currentTarget) setModal('none'); }}>
          <div className="pxc-modal pxc-air" role="dialog" aria-label="空港航线">
            <header>
              空 港 航 线
              <button className="pxc-x" onClick={() => setModal('none')} aria-label="关闭">×</button>
            </header>
            <div className="pxc-body">
              {econ.air.n === 0 ? (
                <div className="mt-empty">
                  <div className="me-t">空港尚未破土</div>
                  <div className="me-d">建成一座<b>空港航站楼</b>（需研究「建筑工程学」）即开<b>邻省都会线</b> ——
                    每条航线 8 小时一班，航班起降计入旅客吞吐：
                    游客 ×1.12 起（每条航线再 +12%）、空运出口 +3 件/分、交通 +8、
                    半径 7 格空港商圈商铺收入 +8%；
                    但半径 4 格起降航线正下方的住宅要忍受噪音（幸福 −0.8/栋，至多 −5）——
                    商圈要近、噪音要远，选址是一道权衡题；
                    姊妹城好感到位各开花一条国际航线，人口 ≥500 再开远洋枢纽线</div>
                </div>
              ) : (
                <>
                  {/* 航线状态头 */}
                  <div className="mt-head">
                    <span className="mh-prog">航站楼 <b>{econ.air.n}</b> 座 · 在飞航线 <b>{econ.air.routes}</b>/{econ.air.lines.length} 条</span>
                    <span className={`mh-net${econ.air.routes > 0 ? ' on' : ''}`}>{econ.air.routes > 0 ? '航班运转中 —— 客机起降如常' : '航站楼已落成 —— 首条航线即将开航'}</span>
                    <span className="mh-cover">商圈覆盖 <b>{econ.air.cover}</b>%（圈内 {econ.air.in} 栋 · 圈外 {econ.air.out} 栋）</span>
                  </div>
                  {/* 商圈进度条 */}
                  <div className="mt-bar air"><i style={{ width: `${Math.min(100, econ.air.cover)}%` }} /></div>
                  {/* 航线表 */}
                  <div className="air-lines" role="list" aria-label="航线表">
                    {econ.air.lines.map(l => (
                      <div key={l.id} role="listitem" className={`air-line${l.open ? ' open' : ''}`}>
                        <img src={iu('plane')} alt="" width={14} height={14} />
                        <b>{l.name}</b>
                        <span className="al-cond">{l.open ? '在飞' : l.cond}</span>
                      </div>
                    ))}
                  </div>
                  {/* 空港四卡 */}
                  <div className="mt-cards">
                    <div className="ms-card" title="累计航班架次（每条航线 8 小时一班，航线越多航班越密）">
                      <b>{econ.air.flown}</b><span>累计架次</span>
                    </div>
                    <div className="ms-card" title="累计旅客吞吐（人次）—— 成就「吞吐长虹」的口径">
                      <b>{econ.air.pax}</b><span>旅客吞吐</span>
                    </div>
                    <div className="ms-card" title={`每班旅客数随城市规模增长（当前 ${econ.air.paxPer} 人/班）`}>
                      <b>{econ.air.paxPer}</b><span>人 / 班</span>
                    </div>
                    <div className={`ms-card${econ.air.noise > 0 ? ' warn' : ''}`} title="起降航线正下方 4 格内的住宅 —— 幸福 −0.8/栋（至多 −5），机场选址是一道权衡题">
                      <b>{econ.air.noise}</b><span>噪音圈住宅</span>
                    </div>
                  </div>
                  <div className="mt-note">
                    空港是城市的对外门户：游客 ×{econ.air.tourK.toFixed(2)}（每条航线 +12%）、
                    空运出口 +3 件/分·座、交通 +8、商圈商铺收入 +8% ——
                    姊妹城结好即开花国际航线（千里比邻与鲲鹏展翅互相成就）；
                    航班延误时游客打折扣，旅游包机到港游客 ×1.5；
                    噪音圈上的住宅幸福受损，机场尽量建在城郊
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* v17 城市编年史模态（经营模式） */}
      {modal === 'chron' && econ && (
        <div className="pxc-mask" onClick={e => { if (e.target === e.currentTarget) setModal('none'); }}>
          <div className="pxc-modal pxc-chron" role="dialog" aria-label="城市编年史">
            <header>
              城 市 编 年 史
              <button className="pxc-x" onClick={() => setModal('none')} aria-label="关闭">×</button>
            </header>
            <div className="pxc-body">
              {/* 纪元带：五纪元，当前高亮 */}
              <div className="chron-era" role="list" aria-label="城市纪元">
                {ERAS.map((e, k) => (
                  <div key={k} role="listitem"
                    className={`ce-cell${k === econ.chron.era ? ' now' : ''}${k < econ.chron.era ? ' past' : ''}`}>
                    <b>{e.name}</b>
                    <span>{k === 0 ? '开埠' : `${e.pop} 人`}</span>
                  </div>
                ))}
              </div>
              <div className="chron-meta">
                <span>开埠第 <b>{econ.chron.day}</b> 天</span>
                <span>在册 <b>{econ.chron.n}</b> 笔</span>
                <span>累计 <b>{econ.chron.total}</b> 笔</span>
                <span>当前纪元「<b>{econ.chron.eraName}</b>」</span>
              </div>
              {/* 筛选器 */}
              <div className="chron-filters" role="tablist" aria-label="纪事筛选">
                {[
                  ['all', '全部'], ['era', '纪元'], ['bad', '灾祸'], ['good', '喜讯'],
                  ['tech', '科技'], ['fest', '节庆'], ['ord', '政令'], ['mile', '里程碑'], ['rev', '回望'],
                ].map(([k, label]) => {
                  const on = chronFilter === k;
                  const n = econ.chron.entries.filter(x => chronMatch(x, k)).length;
                  return (
                    <button key={k} role="tab" aria-selected={on}
                      className={`cf-chip${on ? ' on' : ''}`}
                      onClick={() => setChronFilter(k)}>{label}·{n}</button>
                  );
                })}
              </div>
              {/* 时间线（新 → 旧） */}
              <div className="chron-line">
                {econ.chron.entries
                  .filter(x => chronMatch(x, chronFilter))
                  .slice().reverse().map(x => (
                    <div key={x.id} className={`cl-e ${x.tone}`}>
                      <span className="cl-day">第{String(x.day).padStart(2, '0')}天</span>
                      <img src={iu(x.icon)} alt="" width={14} height={14} />
                      <div className="cl-tx">
                        <b>{x.title}</b>
                        <p>{x.text}</p>
                      </div>
                    </div>
                  ))}
                {!econ.chron.entries.some(x => chronMatch(x, chronFilter)) && (
                  <div className="cl-empty">此卷尚无纪事 —— 城市的故事还在前面。</div>
                )}
              </div>
              <div className="chron-note">
                编年史随城市生长自动落笔：开埠奠基、迈入新时代、灾祸与救险、科技与节庆、人口与府库的里程碑；
                在册最多 140 笔，最久远的往事会沉入档库，但「累计笔数」永远记得
                <button className="cw-open-btn" onClick={openChronWide}
                  title="全景展开这本史书：按纪元分卷，从开埠读到当下">
                  城史长卷 · 全景阅读 →
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* v29 市长公署模态（朱批公文） */}
      {modal === 'gov' && econ && (() => {
        const eng = citzEng;   // 打开模态时捕获的引擎句柄（state，不读 ref）
        const g = econ.gov;
        void govVer;   // 朱批后 setGovVer 触发重渲染
        const p = g.pending;
        const nextDay = Math.floor(g.next / 24) + 1;
        return (
          <div className="pxc-mask" onClick={e => { if (e.target === e.currentTarget) setModal('none'); }}>
            <div className="pxc-modal pxc-gov" role="dialog" aria-label="市长公署">
              <header>
                市 长 公 署
                <button className="pxc-x" onClick={() => setModal('none')} aria-label="关闭">×</button>
              </header>
              <div className="pxc-body">
                {p ? (
                  <div className="gov-doc" data-doc={p.id}>
                    <div className="gd-head">
                      <img src={iu(p.icon)} alt="" width={22} height={22} />
                      <div className="gd-meta">
                        <b>{p.title}</b>
                        <span>{p.from} 呈 · 开埠第 {p.day} 天清晨送抵</span>
                      </div>
                      <em className="gd-wait">待批</em>
                    </div>
                    <p className="gd-body">{p.body}</p>
                    <p className="gd-tip">如何朱批？—— 每道批注都有代价与回响，落笔即记入编年史「政令」卷。</p>
                    <div className="gd-opts" role="group" aria-label="朱批选项">
                      {p.opts.map((o, i) => (
                        <button key={i} className={`gd-opt ${o.tone}${o.disabled ? ' off' : ''}`}
                          disabled={o.disabled}
                          title={o.disabled ? '府库不足 —— 这道批暂时下不去笔' : `朱批「${o.label}」：${o.note}`}
                          onClick={() => {
                            if (!eng?.tycoon?.decideDoc(i)) return;
                            setGovSeal({ seal: o.seal, k: Date.now() });
                            setGovVer(v => v + 1);
                          }}>
                          <i className="gd-seal" aria-hidden>{o.seal}</i>
                          <span className="gd-label">{o.label}</span>
                          <span className="gd-note">{o.disabled ? '府库不足' : o.note}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="gov-empty">
                    <b>案头清简</b>
                    <span>下一份公文将在<b>开埠第 {nextDay} 天清晨</b>送抵 —— 批过的每一道朱批，都成了这座城的一部分。</span>
                  </div>
                )}
                <div className="gov-log">
                  <b className="gl-title">朱批存档（已批 {g.n} 份）</b>
                  {g.log.length === 0 && <p className="gl-empty">尚无批注 —— 等第一份公文送抵案头。</p>}
                  {g.log.map((l, i) => (
                    <div key={i} className="gl-row" data-seal={l.seal}>
                      <i className="gd-seal sm" aria-hidden>{l.seal}</i>
                      <span className="gl-name">{l.title}</span>
                      <span className="gl-opt">「{l.label}」</span>
                      <span className="gl-day">第{l.day}天</span>
                    </div>
                  ))}
                </div>
              </div>
              {govSeal && (
                <div key={govSeal.k} className="gov-stamp" data-seal={govSeal.seal}
                  onAnimationEnd={() => setGovSeal(null)}>{govSeal.seal}</div>
              )}
            </div>
          </div>
        );
      })()}

      {/* v37 姊妹城市：千里比邻（邻城卡片 + 求援急件 + 互市商队） */}
      {modal === 'sis' && econ && (() => {
        const eng = citzEng;   // 打开模态时捕获的引擎句柄（state，不读 ref）
        const sis = econ.sis;
        const rc = sis.req && sis.cities.find(c => c.id === sis.req!.id);
        const poor = econ.coins < 150;
        return (
          <div className="pxc-mask" onClick={e => { if (e.target === e.currentTarget) setModal('none'); }}>
            <div className="pxc-modal pxc-sis" role="dialog" aria-label="姊妹城市">
              <header>
                姊 妹 城 市
                <button className="pxc-x" onClick={() => setModal('none')} aria-label="关闭">×</button>
              </header>
              <div className="pxc-body">
                {sis.req && rc ? (
                  <div className="sis-req" role="alert">
                    <b className="sr-tag">邻城急件</b>
                    <div className="sr-tx">
                      <b>{rc.name}遣使求援 · 市长{rc.mayor}</b>
                      <p>{sis.req.text}</p>
                    </div>
                    <span className="sr-ttl">使者再候 {sis.req.ttl} 游戏时</span>
                    <div className="sr-opts" role="group" aria-label="求援作答">
                      <button className={`sis-opt good${poor ? ' off' : ''}`} disabled={poor}
                        title={poor ? '府库不足 —— 援银凑不出来' : '拨援银 150G 连夜送去：好感 +18'}
                        onClick={() => eng?.tycoon?.decideSis(true)}>
                        <i className="gd-seal" aria-hidden>准</i>
                        <span className="gd-label">发援银 150G</span>
                        <span className="gd-note">{poor ? '府库不足' : '好感 +18'}</span>
                      </button>
                      <button className="sis-opt bad"
                        title="婉言谢绝：好感 −6，使者悻悻而归"
                        onClick={() => eng?.tycoon?.decideSis(false)}>
                        <i className="gd-seal" aria-hidden>驳</i>
                        <span className="gd-label">婉言谢绝</span>
                        <span className="gd-note">好感 −6</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="sis-calm">
                    <b>四野安澜</b>
                    <span>{sis.on ? '邻城眼下没有急事 —— 商队可随时发往各城，交情随商路一路生长。' : `市政厅升到 LV${sis.lv} 后通商开市：商队带货去邻城换银钱，交情也随商路生长。`}</span>
                  </div>
                )}
                <div className="sis-cards">
                  {sis.cities.map(c => (
                    <div key={c.id} className={`sis-card${c.bonded ? ' bonded' : ''}`} data-city={c.id}>
                      <div className="sc-head">
                        <img src={iu(c.emblem)} alt="" width={24} height={24} />
                        <div className="sc-name">
                          <b>{c.name}{c.bonded ? <i className="sc-bond">姊妹</i> : null}</b>
                          <span>市长 {c.mayor} · {c.trait}</span>
                        </div>
                        <em className="sc-band" data-rel={c.rel >= 60 ? 'hi' : c.rel >= 30 ? 'mid' : 'low'}>{c.band}</em>
                      </div>
                      <p className="sc-style">{c.style}</p>
                      <div className="sc-bars">
                        <div className="sc-bar" title={`${c.name}人口 ${c.pop} · 本市人口 ${econ.pop} —— 月评对照，评级首超邻城名声在外`}>
                          <span>人口 {c.pop}</span>
                          <i><b style={{ width: `${Math.min(100, Math.round(c.pop / Math.max(1, Math.max(c.pop, econ.pop)) * 100))}%` }} /></i>
                        </div>
                        <div className="sc-bar" title={`${c.name}评级 ${c.rating} · 本市评级 ${econ.rating}`}>
                          <span>评级 {c.rating}</span>
                          <i><b style={{ width: `${Math.min(100, Math.round(c.rating))}%` }} /></i>
                        </div>
                        <div className="sc-bar rel" title={`${c.name}好感 ${c.rel}/100 —— 互市 +2 · 援助 +18 · 赠礼 +1；婉拒 −6`}>
                          <span>好感 {c.rel}</span>
                          <i><b style={{ width: `${Math.min(100, Math.round(c.rel))}%` }} /></i>
                        </div>
                      </div>
                      <button className={`pxc-btn sc-trade${!sis.on || c.cd > 0 || c.units < 6 ? ' off' : ''}`}
                        disabled={!sis.on || c.cd > 0 || c.units < 6}
                        title={!sis.on
                          ? `市政厅 LV${sis.lv} 起通商 —— 先把自家的市政厅升起来`
                          : c.cd > 0
                            ? `商队还在路上 —— ${c.cd} 游戏时后可再发一队`
                            : c.units < 6
                              ? '货仓存货不足起运量（至少 6 件）—— 先建工厂/木材厂攒货'
                              : `发 ${c.units} 件货去${c.name}互市，约可换回 ${c.gain}G，好感 +2`}
                        onClick={() => eng?.tycoon?.tradeWith(c.id)}>
                        <img src={iu('box')} alt="" />
                        {!sis.on
                          ? <b>未通商 · LV{sis.lv} 解锁</b>
                          : c.cd > 0
                            ? <b>商队途中 · {c.cd} 游戏时</b>
                            : c.units < 6
                              ? <b>货不足 · 需 6 件</b>
                              : <b>发商队 · {c.units} 件 ≈ {c.gain}G</b>}
                      </button>
                    </div>
                  ))}
                </div>
                <p className="sis-foot">
                  开埠以来：互市 {sis.tradeN} 次 · 援助邻城 {sis.aidN} 次{sis.sworn ? ' · 三城歃血为盟' : ''}
                   —— 好感 ≥60 结为姊妹之城、三城 ≥80 歃血为盟；本城遭难时，好感 ≥60 的邻城会遣使驰援。
                </p>
              </div>
            </div>
          </div>
        );
      })()}

      {/* v37 姊妹城市：千里比邻（邻城卡片 + 求援急件 + 互市商队） */}
      {modal === 'sis' && econ && (() => {
        const eng = citzEng;   // 打开模态时捕获的引擎句柄（state，不读 ref）
        const sis = econ.sis;
        const rc = sis.req && sis.cities.find(c => c.id === sis.req!.id);
        const poor = econ.coins < 150;
        return (
          <div className="pxc-mask" onClick={e => { if (e.target === e.currentTarget) setModal('none'); }}>
            <div className="pxc-modal pxc-sis" role="dialog" aria-label="姊妹城市">
              <header>
                姊 妹 城 市
                <button className="pxc-x" onClick={() => setModal('none')} aria-label="关闭">×</button>
              </header>
              <div className="pxc-body">
                {sis.req && rc ? (
                  <div className="sis-req" role="alert">
                    <b className="sr-tag">邻城急件</b>
                    <div className="sr-tx">
                      <b>{rc.name}遣使求援 · 市长{rc.mayor}</b>
                      <p>{sis.req.text}</p>
                    </div>
                    <span className="sr-ttl">使者再候 {sis.req.ttl} 游戏时</span>
                    <div className="sr-opts" role="group" aria-label="求援作答">
                      <button className={`sis-opt good${poor ? ' off' : ''}`} disabled={poor}
                        title={poor ? '府库不足 —— 援银凑不出来' : '拨援银 150G 连夜送去：好感 +18'}
                        onClick={() => eng?.tycoon?.decideSis(true)}>
                        <i className="gd-seal" aria-hidden>准</i>
                        <span className="gd-label">发援银 150G</span>
                        <span className="gd-note">{poor ? '府库不足' : '好感 +18'}</span>
                      </button>
                      <button className="sis-opt bad"
                        title="婉言谢绝：好感 −6，使者悻悻而归"
                        onClick={() => eng?.tycoon?.decideSis(false)}>
                        <i className="gd-seal" aria-hidden>驳</i>
                        <span className="gd-label">婉言谢绝</span>
                        <span className="gd-note">好感 −6</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="sis-calm">
                    <b>四野安澜</b>
                    <span>{sis.on ? '邻城眼下没有急事 —— 商队可随时发往各城，交情随商路一路生长。' : `市政厅升到 LV${sis.lv} 后通商开市：商队带货去邻城换银钱，交情也随商路生长。`}</span>
                  </div>
                )}
                <div className="sis-cards">
                  {sis.cities.map(c => (
                    <div key={c.id} className={`sis-card${c.bonded ? ' bonded' : ''}`} data-city={c.id}>
                      <div className="sc-head">
                        <img src={iu(c.emblem)} alt="" width={24} height={24} />
                        <div className="sc-name">
                          <b>{c.name}{c.bonded ? <i className="sc-bond">姊妹</i> : null}</b>
                          <span>市长 {c.mayor} · {c.trait}</span>
                        </div>
                        <em className="sc-band" data-rel={c.rel >= 60 ? 'hi' : c.rel >= 30 ? 'mid' : 'low'}>{c.band}</em>
                      </div>
                      <p className="sc-style">{c.style}</p>
                      <div className="sc-bars">
                        <div className="sc-bar" title={`${c.name}人口 ${c.pop} · 本市人口 ${econ.pop} —— 月评对照，评级首超邻城名声在外`}>
                          <span>人口 {c.pop}</span>
                          <i><b style={{ width: `${Math.min(100, Math.round(c.pop / Math.max(1, Math.max(c.pop, econ.pop)) * 100))}%` }} /></i>
                        </div>
                        <div className="sc-bar" title={`${c.name}评级 ${c.rating} · 本市评级 ${econ.rating}`}>
                          <span>评级 {c.rating}</span>
                          <i><b style={{ width: `${Math.min(100, Math.round(c.rating))}%` }} /></i>
                        </div>
                        <div className="sc-bar rel" title={`${c.name}好感 ${c.rel}/100 —— 互市 +2 · 援助 +18 · 赠礼 +1；婉拒 −6`}>
                          <span>好感 {c.rel}</span>
                          <i><b style={{ width: `${Math.min(100, Math.round(c.rel))}%` }} /></i>
                        </div>
                      </div>
                      <button className={`pxc-btn sc-trade${!sis.on || c.cd > 0 || c.units < 6 ? ' off' : ''}`}
                        disabled={!sis.on || c.cd > 0 || c.units < 6}
                        title={!sis.on
                          ? `市政厅 LV${sis.lv} 起通商 —— 先把自家的市政厅升起来`
                          : c.cd > 0
                            ? `商队还在路上 —— ${c.cd} 游戏时后可再发一队`
                            : c.units < 6
                              ? '货仓存货不足起运量（至少 6 件）—— 先建工厂/木材厂攒货'
                              : `发 ${c.units} 件货去${c.name}互市，约可换回 ${c.gain}G，好感 +2`}
                        onClick={() => eng?.tycoon?.tradeWith(c.id)}>
                        <img src={iu('box')} alt="" />
                        {!sis.on
                          ? <b>未通商 · LV{sis.lv} 解锁</b>
                          : c.cd > 0
                            ? <b>商队途中 · {c.cd} 游戏时</b>
                            : c.units < 6
                              ? <b>货不足 · 需 6 件</b>
                              : <b>发商队 · {c.units} 件 ≈ {c.gain}G</b>}
                      </button>
                    </div>
                  ))}
                </div>
                <p className="sis-foot">
                  开埠以来：互市 {sis.tradeN} 次 · 援助邻城 {sis.aidN} 次{sis.sworn ? ' · 三城歃血为盟' : ''}
                   —— 好感 ≥60 结为姊妹之城、三城 ≥80 歃血为盟；本城遭难时，好感 ≥60 的邻城会遣使驰援。
                </p>
              </div>
            </div>
          </div>
        );
      })()}

      {/* v27 城史长卷：全景编年史阅读页（全屏立轴 · 按纪元分卷；v28 增「大事年表」横轴总览） */}
      {chronWide && econ && (() => {
        const entries = econ.chron.entries;
        const chaps = chaptersOf(entries);           // 全量分卷（导航与 ref 基准）
        const st = statsOf(entries);
        const q = cwQuery.trim();
        const visible = q                                      // 检索：逐卷过滤，空卷隐藏
          ? chaps.map(c => ({ ...c, entries: c.entries.filter(x => x.title.includes(q) || x.text.includes(q)) }))
              .filter(c => c.entries.length)
          : chaps;
        const hitAll = q ? entries.filter(x => x.title.includes(q) || x.text.includes(q)).length : -1;
        const lastEra = chaps.length ? chaps[chaps.length - 1].era : econ.chron.era;
        // ---- v28 大事年表派生（游戏时轴：开埠 0h .. 末笔 h，一天 24h；纪元带 + 四色点阵 + 密度条）----
        const tFromH = 0;
        const tToH = entries.length ? hOf(entries[entries.length - 1]) : 24;
        const tSpanH = Math.max(24, tToH - tFromH);
        const bands = eraBandsOf(entries, tToH);
        const pxPerDay = Math.max(9, Math.min(60, 1180 / (tSpanH / 24)));
        const innerPx = (tSpanH / 24) * pxPerDay;
        const tl = timelineOf(entries, tFromH, tFromH + tSpanH, 15 / innerPx);
        const dens = densityOf(entries, tFromH, tFromH + tSpanH, 48);
        const maxDens = Math.max(1, ...dens);
        const peakK = dens.indexOf(maxDens);
        const peakA = Math.floor(peakK * tSpanH / 48 / 24) + 1;
        const peakB = Math.max(peakA, Math.floor((peakK + 1) * tSpanH / 48 / 24));
        const stepDays = [1, 2, 5, 10, 25, 50, 100, 200].find(k => tSpanH / 24 / k * pxPerDay >= 72) ?? 200;
        const head = (
          <header className="cw-head">
            <div className="cw-head-l">
              <b className="cw-title">城 史 长 卷</b>
              <span className="cw-sub">
                {cwMode === 'tl'
                  ? `大事年表 · ${entries.length} 笔纪事 · 开埠第 ${Math.floor(tToH / 24) + 1} 天 · 最密 第${peakA}–${peakB}天（${maxDens} 笔）`
                  : `「${econ.chron.eraName}」 · 开埠第 ${econ.chron.day} 天 · 在册 ${econ.chron.n} 笔 · 累计落笔 ${econ.chron.total} 笔${q ? '' : ` · 读至第${volName(cwEra)}卷`}`}
              </span>
            </div>
            <div className="cw-head-r">
              <div className="cw-tabs" role="tablist" aria-label="阅读方式">
                <button role="tab" aria-selected={cwMode === 'scroll'}
                  className={`cw-tab${cwMode === 'scroll' ? ' on' : ''}`}
                  onClick={() => { setCwMode('scroll'); setCwTip(null); beeperRef.current?.play('click'); }}>分卷长卷</button>
                <button role="tab" aria-selected={cwMode === 'tl'}
                  className={`cw-tab${cwMode === 'tl' ? ' on' : ''}`}
                  onClick={() => { setCwMode('tl'); setCwTip(null); beeperRef.current?.play('click'); }}>大事年表</button>
              </div>
              <input className="cw-search" value={cwQuery} placeholder="检索纪事标题或正文…"
                onChange={e => setCwQuery(e.target.value)} />
              {q && <span className="cw-hit">「{q}」命中 {hitAll} 笔</span>}
              <button className="cw-close" aria-label="收起长卷" onClick={() => setChronWide(false)}>×</button>
            </div>
          </header>
        );
        return (
          <div className="cw-root" role="dialog" aria-label="城史长卷">
            {cwMode === 'scroll' ? (<>
            {/* 卷目导航（移动端折叠为顶部横条，内层 .cw-nav-scroll 承载滚动） */}
            <aside className={`cw-nav${cwNavMore.l ? ' more-l' : ''}${cwNavMore.r ? ' more-r' : ''}`} aria-label="卷目">
              <div className="cw-nav-cap">卷 目</div>
              <div className="cw-nav-scroll" ref={cwNavScrollRef} onScroll={cwNavCheck}>
                {chaps.map((c, i) => (
                  <button key={c.era}
                    className={`cw-chip${i === cwEra && !q ? ' on' : ''}${q && !visible.some(v => v.era === c.era) ? ' dim' : ''}`}
                    onClick={() => {
                      cwChapRefs.current[i]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                      beeperRef.current?.play('click');
                    }}>
                    <b>第{volName(i)}卷</b>
                    <span>{ERAS[c.era].name}</span>
                    <i>{c.entries.length}笔</i>
                  </button>
                ))}
              </div>
              <div className="cw-nav-foot">
                喜 {st.good} · 忧 {st.bad}<br />大事 {st.big} · 政务 {st.info}
              </div>
            </aside>
            <div className="cw-main">
              {head}
              <div className="cw-scroll" ref={cwScrollRef} onScroll={cwOnScroll}>
                {visible.map(c => {
                  const k = chaps.findIndex(cc => cc.era === c.era);   // 回映射到全量卷号（ref 槽位）
                  return (
                    <section key={c.era} className="cw-chap"
                      ref={el => { cwChapRefs.current[k] = el; }}>
                      <div className="cw-chap-head">
                        <span className="cw-vol">第 {volName(k)} 卷</span>
                        <b className="cw-chap-name">{ERAS[c.era].name}</b>
                        <span className="cw-chap-days">
                          第 {c.fromDay} 天 — 第 {c.toDay} 天 · {c.entries.length} 笔
                          {c.era === lastEra ? ' · 未完待续' : ''}
                        </span>
                        <p className="cw-chap-open">{ERAS[c.era].text}</p>
                      </div>
                      {c.entries.map(x => (
                        <div key={x.id} data-id={x.id} className={`cw-e ${x.tone}`}>
                          <span className="cw-day">第{String(x.day).padStart(2, '0')}天</span>
                          <img src={iu(x.icon)} alt="" width={16} height={16} />
                          <div className="cw-tx">
                            <b>{x.title}</b>
                            <p>{x.text}</p>
                          </div>
                        </div>
                      ))}
                    </section>
                  );
                })}
                {!visible.length && (
                  <div className="cw-empty">
                    {q ? `长卷之中未见「${q}」—— 换个字试试？` : '长卷尚是一页白纸 —— 这座城的故事，还在前面。'}
                  </div>
                )}
                <div className="cw-end">— 长卷至此 · 城市的故事仍在继续 —</div>
              </div>
            </div>
            </>) : (
              /* v28 大事年表：全宽横轴总览（纪元带背景 · 四色点阵 · 日轴刻度 · 密度条） */
              <div className="cw-tl">
                {head}
                <div className="cw-tl-scroll">
                  <div className="cw-tl-inner" style={{ minWidth: Math.round(innerPx) }}>
                    <div className="cw-bands" aria-hidden="true">
                      {bands.map(b => (
                        <div key={b.era} className={`cw-band${b.era % 2 ? ' alt' : ''}`}
                          style={{ left: `${(b.from / tSpanH * 100).toFixed(3)}%`, width: `${((b.to - b.from) / tSpanH * 100).toFixed(3)}%` }}>
                          {(b.to - b.from) / tSpanH > 0.055 && <b>{ERAS[b.era].name}</b>}
                        </div>
                      ))}
                    </div>
                    <div className="cw-dots" style={{ height: tl.lanes * 18 + 14 }}>
                      {tl.dots.map(d => {
                        const hit = !q || d.e.title.includes(q) || d.e.text.includes(q);
                        return (
                          <button key={d.e.id} data-id={d.e.id}
                            className={`cw-dot ${d.e.tone}${d.e.cat === 'rev' ? ' rev' : ''}${hit ? '' : ' dim'}`}
                            style={{ left: `${(d.x * 100).toFixed(3)}%`, bottom: 8 + d.lane * 18 }}
                            aria-label={`第${d.e.day}天 ${d.e.title}`}
                            onMouseEnter={ev => setCwTip({
                              x: ev.clientX, y: ev.clientY, day: d.e.day,
                              title: d.e.title, text: d.e.text, tone: d.e.tone,
                            })}
                            onMouseLeave={() => setCwTip(null)}
                            onClick={() => cwJump(d.e.id)} />
                        );
                      })}
                    </div>
                    <div className="cw-axis" aria-hidden="true">
                      {Array.from({ length: Math.floor(tSpanH / 24 / stepDays) + 1 },
                        (_, k) => k * stepDays * 24).map(hh => (
                        <span key={hh} className="cw-tick" style={{ left: `${(hh / tSpanH * 100).toFixed(3)}%` }}>
                          <i />第{Math.floor(hh / 24) + 1}天
                        </span>
                      ))}
                    </div>
                    <div className="cw-dens" aria-hidden="true">
                      {dens.map((n, k) => (
                        <i key={k} style={{ height: `${Math.round(n / maxDens * 100)}%` }} />
                      ))}
                    </div>
                  </div>
                </div>
                {!entries.length && (
                  <div className="cw-empty">年表尚是白纸 —— 这座城的故事，还在前面。</div>
                )}
                {cwTip && (
                  <div className={`cw-tip ${cwTip.tone}`}
                    style={{ left: Math.min(cwTip.x + 14, window.innerWidth - 300), top: Math.max(84, cwTip.y - 16) }}>
                    <b>第{cwTip.day}天 · {cwTip.title}</b>
                    <p>{cwTip.text}</p>
                    <span>点击这枚点 → 跳到长卷里的这一笔</span>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })()}

      {/* 科技研究院模态（经营模式） */}
      {modal === 'tech' && econ && (
        <div className="pxc-mask" onClick={e => { if (e.target === e.currentTarget) setModal('none'); }}>
          <div className="pxc-modal pxc-tech" role="dialog" aria-label="科技研究院">
            <header>
              科 技 研 究 院
              <button className="pxc-x" onClick={() => setModal('none')} aria-label="关闭">×</button>
            </header>
            <div className="pxc-body">
              <div className="pxc-techbar">
                <span className="sp"><img src={iu('flask')} alt="" />{fmtG(econ.sp)} SP</span>
                <span className="rate">+{rinc(econ.spRate)}/分</span>
                <span className="wis"><img src={iu('book')} alt="" />智慧 {econ.wisdom}</span>
                <span className="done">已研究 {econ.techs.length}/{TECHS.length}</span>
              </div>
              <div className="pxc-ttree">
                {BRANCHES.map(br => (
                  <div className="pxc-tbranch" key={br.key}>
                    <div className="bh">{br.name}<i>{br.note}</i></div>
                    {TECHS.filter(t => t.br === br.key).map(t => {
                      const doneT = econ.techs.includes(t.id);
                      const missing = t.req.filter(r => !econ.techs.includes(r));
                      const wisOk = t.wis === undefined || econ.wisdom >= t.wis;
                      const avail = !doneT && missing.length === 0 && wisOk;
                      const afford = econ.sp >= t.cost;
                      return (
                        <div key={t.id}
                          className={`pxc-tcard${doneT ? ' done' : avail ? ' avail' : ' lock'}`}>
                          <div className="tname">
                            {doneT ? '✓ ' : ''}{t.name}
                            <span className="tier">T{t.tier}</span>
                          </div>
                          <div className="tdesc">{t.desc}</div>
                          <div className="trow">
                            {doneT ? (
                              <span className="ok">已研究</span>
                            ) : !avail ? (
                              <span className="need">
                                {missing.length ? `前置：${techNameOf(missing[0])}`
                                  : `智慧需 ${t.wis}（当前 ${econ.wisdom}）`}
                              </span>
                            ) : (
                              <button className={`pxc-btn mini${afford ? '' : ' dis'}`}
                                onClick={() => doResearch(t.id)}>
                                研究 · {t.cost}SP
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
              <div className="pxc-tips" style={{ marginTop: 8 }}>
                科技点由图书馆 / 学校 / 博物馆 / 天文台等产出，智慧指数（教育容量 ÷ 人口）决定产出倍率；
                建筑工程学、冶金工艺等科技还会解锁摩天大楼、炼油厂等高级建筑。
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 城市志模态（经营模式）：评级 / 指数 / 人口结构 / 历史曲线 */}
      {modal === 'data' && econ && (
        <div className="pxc-mask" onClick={e => { if (e.target === e.currentTarget) setModal('none'); }}>
          <div className="pxc-modal pxc-data" role="dialog" aria-label="城市志">
            <header>
              城 市 志
              <button className="pxc-x" onClick={() => setModal('none')} aria-label="关闭">×</button>
            </header>
            <div className="pxc-body">
              <div className="pxc-dhead">
                <div className={`dbig dgrade-${econ.ratingGrade}`}>
                  {econ.ratingGrade}<i>{econ.rating}</i>
                </div>
                <div className="dmeta">
                  <div className="dl">城市综合评级（S≥90 · A≥80 · B≥70 · C≥55 · D≥40）</div>
                  <div className="dw">
                    幸福 20% · 宜居 12% · 粮食 10% · 就业 10% · 环境 8% · 供水 7.5% · 智慧 7% · 文化 7% · 健康 6% · 安全 5% · 科研 4% · 交通 3.5%
                  </div>
                  <div className="dr">
                    城市年龄 {(() => {
                      const s = Math.max(0, econ.playtime);
                      const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60);
                      return h > 0 ? `${h} 时 ${m} 分` : `${m} 分 ${Math.floor(s % 60)} 秒`;
                    })()} · 人口 {econ.pop} · 建筑 {econ.buildings} 栋 · 领地 {econ.chunks} 块
                  </div>
                </div>
              </div>

              <div className="pxc-dgrid">
                <section>
                  <h3>十二维民生指数（0-100）</h3>
                  <div className="ibars">
                    {([
                      ['幸福度', econ.happiness, '#F2D24B'],
                      ['宜居度', econ.livability, '#5BC8B8'],
                      ['粮食安全', Math.round(65 + 35 * Math.min(1, econ.food / Math.max(1, econ.foodCap)) * (econ.foodNet < 0 ? 0.5 : 1)), '#E8CC4C'],
                      ['就业率', econ.employIdx, '#4A86C8'],
                      ['供水', econ.waterIdx, '#6FA8DC'],
                      ['文化', econ.cultureIdx, '#C97B93'],
                      ['环境', econ.envIdx, '#79B45C'],
                      ['健康', econ.healthIdx, '#E05548'],
                      ['安全', econ.safetyIdx, '#6FA8DC'],
                      ['交通', econ.trafficIdx, '#CFB379'],
                      ['智慧', econ.wisdom, '#C6D3DE'],
                      ['科研', econ.sciIdx, '#9F86E8'],
                    ] as Array<[string, number, string]>).map(([name, v, c]) => (
                      <div className="ibar" key={name}>
                        <span>{name}</span>
                        <div className="tr"><i style={{ width: `${v}%`, background: c }} /></div>
                        <b>{Math.round(v)}</b>
                      </div>
                    ))}
                  </div>
                </section>
                <section>
                  <h3>人口结构</h3>
                  <table><tbody>
                    <tr><td>总人口</td><td>{econ.pop} 人（住房容量 {econ.cap}）</td></tr>
                    <tr><td>劳动人口</td><td>{econ.workers} 人（62%）—— 就业率 {econ.employIdx}%</td></tr>
                    <tr><td>学龄人口</td><td>{Math.round(econ.pop * 0.2)} 人（20%）—— 教育容量 {econ.eduCap}</td></tr>
                    <tr><td>银发人口</td><td>{Math.round(econ.pop * 0.18)} 人（18%）—— 健康指数 {econ.healthIdx}</td></tr>
                    <tr className={econ.citzPassed > 0 || econ.citzGrown > 0 ? 'g' : ''}>
                      <td>生民列传</td>
                      <td>{`在册 ${econ.citz.n} · 长者 ${econ.citzElders} · 本城出生 ${econ.citzBorn} · 长大成人 ${econ.citzGrown} · 含笑而归 ${econ.citzPassed}`}</td>
                    </tr>
                    <tr><td>粮仓</td><td>{econ.food} / {econ.foodCap}（净额 {rincS(econ.foodNet)}/分）</td></tr>
                    <tr className={econ.waterIdx < 40 ? 'bad' : ''}><td>供水</td><td>覆盖率 {econ.waterIdx}%（总容量 {econ.waterCapT} 人{econ.hasWaterTower ? '' : ' —— 尚无水务设施'}）</td></tr>
                    <tr className={econ.busStops > 0 ? 'g' : ''}><td>公交</td><td>{econ.busStops >= 2 ? `巴士环线运转中（${econ.busStops} 座车站 · 交通 +${econ.busBonus}）` : econ.busStops === 1 ? '仅 1 座车站 —— 再建一座即开通环线' : '无 —— 两座邻路巴士站开通公交'}</td></tr>
                    <tr className={econ.tramStops >= 2 ? 'g' : ''}><td>电车</td><td>{econ.tramStops >= 2 ? `电车干线运转中（${econ.tramStops} 座电车站 · 交通 +${econ.tramBonus} · 幸福 +2）` : '未开通 —— 两座邻路电车站（需「电力工程」）'}</td></tr>
                    <tr className={econ.metro.conn >= 2 ? 'g' : ''}><td>地铁</td><td>{econ.metro.conn >= 2 ? `线网运转中（车辆段 ${econ.metro.depots} · 接入 ${econ.metro.conn}/${econ.metro.stops} · 覆盖 ${econ.metro.cover}% · 交通 +${econ.metro.bonus}，顶栏「轨」翻轨道交通）` : econ.metro.depots > 0 ? `车辆段已落成 —— 沿链接入 ${econ.metro.conn} 座，两站成线通车` : '无 —— 建成车辆段并沿链接入地铁站开通地铁'}</td></tr>
                    <tr className={econ.ferries > 0 ? 'g' : ''}><td>航运</td><td>{econ.ferries > 0 ? `渡轮码头 ${econ.ferries} 座，船舶巡游中（冬季停航）` : '无 —— 水畔渡轮码头自有船舶出港'}</td></tr>
                    <tr><td>税率</td><td>{econ.taxRate}%（情绪 {econ.taxMood >= 0 ? '+' : ''}{Math.round(econ.taxMood)}）</td></tr>
                    <tr className={econ.news.n > 0 ? 'g' : ''}><td>报馆</td><td>{econ.news.on
                      ? `《城市日报》出版中（已出 ${econ.news.n} 期 · 最近一期发行 ${econ.news.circ} 份 · 累计 ${econ.news.circT} 份 —— 下期 ${Math.max(0, Math.round((econ.news.next - econ.gHours) * 10) / 10)} 游戏时后开印，顶栏「闻」翻阅版面）`
                      : econ.news.n > 0 ? `已停刊（累计 ${econ.news.n} 期 · 过刊保留，复建报馆自动复刊）` : '无 —— 建成报馆即创刊，每七游戏日一期《城市日报》'}</td></tr>
                    <tr className={econ.hall.n > 0 ? 'g' : ''}><td>名人堂</td><td>{econ.hall.on
                      ? `季评开榜中（已评 ${econ.hall.n} 届 · 奖项 ${econ.hall.awards.filter(a => a.got).length}/${econ.hall.awards.length}${econ.hall.hapOn ? ' · 授勋荣光幸福 +1' : ''} —— 下届 ${Math.max(0, Math.round((econ.hall.next - econ.gHours) * 10) / 10)} 游戏时后开榜，顶栏「光」翻荣誉殿堂）`
                      : econ.hall.n > 0 ? `已停评（累计 ${econ.hall.n} 届 · 光荣榜保留，复建名人堂自动复评）` : '无 —— 建成名人堂即开榜，每逢换季整点评出本季城市之光'}</td></tr>
                    <tr><td>季节</td><td>{SEASONS[econ.season]?.name ?? '夏'}季（{SEASONS[econ.season]?.note ?? ''}）</td></tr>
                  </tbody></table>
                </section>
              </div>

              <section className="dcharts">
                <h3>城市历程（每 15 秒采样，滑窗 24 分钟）</h3>
                <div className="dcgrid">
                  <HistChart data={econ.hist} field="pop" color="#F2D24B" label="人口" unit=" 人" />
                  <HistChart data={econ.hist} field="coins" color="#F2D24B" label="金币" unit="G" />
                  <HistChart data={econ.hist} field="net" color="#5BC8B8" label="净收入" unit="G/分" />
                  <HistChart data={econ.hist} field="hap" color="#E05548" label="幸福度" unit="" />
                </div>
              </section>

              {/* v38 出土图鉴：厚土藏珍（三套系 12 件 · 博物馆策展加成） */}
              <section className="drlk">
                <h3>出土图鉴（{econ.relics.n} / {econ.relics.total}）{econ.relics.museumOn
                  ? ` · 博物馆展出中（文化 +${econ.relics.cul} · 吸引力 +${econ.relics.at}${econ.relics.tourK > 1 ? ` · 游客 ×${econ.relics.tourK.toFixed(2)}` : ''}${econ.relics.hap > 0 ? ` · 满馆琳琅幸福 +${econ.relics.hap}` : ''}）`
                  : econ.relics.n > 0 ? ' · 文物在库房 —— 建座博物馆开馆展出' : ''}</h3>
                <p className="rlk-cap">每购一块新领地，工队都有 {Math.round(econ.relics.digP * 100)}% 机缘从厚土里磕出先民遗物；工地偶尔也会自己说话。</p>
                {econ.relics.sets.map(st => (
                  <div key={st.id} className="rlk-set">
                    <div className="rs-head">
                      <b>{st.name}</b>
                      <span>{st.note}</span>
                      <em className={st.done ? 'done' : ''}>{st.done ? '集齐' : `${st.n}/${st.total}`}</em>
                    </div>
                    <div className="rlk-grid">
                      {RELICS.filter(d => d.set === st.id).map(d => {
                        const got = econ.relics.got.includes(d.id);
                        return (
                          <div key={d.id} className={`rk-card${got ? ' on' : ''}${got && d.rare === 2 ? ' gem' : ''}`}
                            data-id={d.id}
                            title={got
                              ? `${d.name} · ${d.era} · ${d.rare === 2 ? '国宝' : d.rare === 1 ? '珍稀' : '寻常'} —— ${d.note}`
                              : '尚未出土 —— 厚土之下，还在等一把锹'}>
                            <img src={iu(got ? d.icon : 'rock')} alt="" />
                            <b>{got ? d.name : '？？？'}</b>
                            <span>{got ? d.era : '未出土'}</span>
                            {got && d.rare === 2 ? <i className="rk-tag gem">国宝</i>
                              : got && d.rare === 1 ? <i className="rk-tag rare">珍稀</i> : null}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </section>

              <section className="dachv">
                <h3>成就墙（{econ.achvGot} / {econ.achv.length}）</h3>
                <div className="achgrid">
                  {econ.achv.map(a => (
                    <div key={a.id} className={`ach${a.got ? ' got' : ''}`} title={a.got ? `已解锁：${a.desc}` : `${a.desc}（${Math.floor(a.cur).toLocaleString('zh-CN')} / ${a.goal.toLocaleString('zh-CN')}）`}>
                      <img src={iu(a.icon)} alt="" />
                      <b>{a.name}</b>
                      {a.got
                        ? <span className="done">已解锁</span>
                        : <span className="prog">{a.cur >= a.goal * 0.999 ? '即将达成' : `${Math.floor(a.cur / a.goal * 100)}%`}</span>}
                    </div>
                  ))}
                </div>
              </section>

              <div className="pxc-row" style={{ marginTop: 10 }}>
                <button className="pxc-btn primary" onClick={() => openModal('fiscal')}>
                  <img src={iu('chart')} alt="" />财政报告
                </button>
                <button className="pxc-btn" onClick={() => openModal('tech')}>
                  <img src={iu('flask')} alt="" />科技研究院
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* v13 市民列传模态 */}
      {modal === 'citz' && econ && (() => {
        const eng = citzEng;   // 打开模态时捕获的引擎句柄（state，不读 ref）
        const av = (c: { look: number; body: 0 | 1 | 2; role: CitzCard['role'] }, sz = 64): string =>
          eng?.citizenAvatar(c.look, c.body, c.role, sz) ?? BLANK;
        const cz = econ.citz;
        const spot = citzSpot;
        const sel = spot ?? cz.roster.find(c => c.id === citzSel) ?? null;
        const moodCls = (m: number): string => (m >= 75 ? 'g' : m >= 45 ? '' : 'bad');
        const fmtT = (s: number): string => {
          const m = Math.floor(s / 60), ss = Math.floor(s % 60);
          return m > 0 ? `${m}分${String(ss).padStart(2, '0')}秒` : `${ss}秒`;
        };
        return (
          <div className="pxc-mask" onClick={e => { if (e.target === e.currentTarget) setModal('none'); }}>
            <div className="pxc-modal pxc-citz" role="dialog" aria-label="市民列传">
              <header>
                市 民 列 传
                <button className="pxc-x" onClick={() => setModal('none')} aria-label="关闭">×</button>
              </header>
              <div className="pxc-body">
                {/* 统计 + 市民之声 */}
                <div className="citz-stats">
                  <span>累计落户 <b>{cz.total}</b> 位</span>
                  <span>在册名人 <b>{cz.n}</b> / 28 人</span>
                  <span>平均心情 <b className={moodCls(cz.avgMood)}>{cz.avgMood}</b></span>
                </div>
                {citzVoice && (
                  <div className="citz-voice" title="市民之声：随城市状态轮播">
                    「{citzVoice.text}」<span>—— {citzVoice.name}</span>
                  </div>
                )}

                {sel ? (() => {
                  const c = sel;
                  return (
                    <div className="citz-detail">
                      <div className="cd-top">
                        <button className="pxc-btn" onClick={() => { setCitzSel(null); setCitzSpot(null); }}>
                          ← 返回名人册
                        </button>
                        {spot && <em className="cd-spot">{c.guest ? '街头偶遇 · 过路人' : '街头偶遇 · 就是这位本人'}</em>}
                      </div>
                      <div className="cd-head">
                        <img className="cd-ava" src={av(c, 96)} alt={`${c.name}的像素头像`} />
                        <div className="cd-meta">
                          <b>{c.name}{c.guest && <i className="cd-guest">路人</i>}</b>
                          <span>{c.age} 岁 · {c.gender === 1 ? '女' : '男'} · {c.job}</span>
                          <span>{c.trait} · 爱好{c.hobby}{!c.guest ? ` · 学历${c.edu}` : ''}</span>
                          <div className="moodbar" title={`心情 ${c.mood}/100（随城市幸福度与个人性格波动）`}>
                            <i style={{ width: `${c.mood}%` }} />
                            <em>{c.mood}</em>
                          </div>
                        </div>
                      </div>
                      <p className="cd-bio">{c.bio}</p>
                      {c.story && (
                        <div className="cd-storywrap">
                          <h4>人物志 · 根与迹</h4>
                          <p className="cd-story">{c.story}</p>
                        </div>
                      )}
                      <table className="cd-tbl"><tbody>
                        <tr>
                          <td>住所</td>
                          <td>
                            {c.homeName}
                            {c.homeAt && (
                              <button className="pxc-btn mini" onClick={() => {
                                eng?.centerAt(c.homeAt!.x, c.homeAt!.y);
                                setModal('none');
                              }}>去家里看看</button>
                            )}
                          </td>
                        </tr>
                        <tr>
                          <td>职场</td>
                          <td>
                            {c.workName}
                            {c.workAt && (
                              <button className="pxc-btn mini" onClick={() => {
                                eng?.centerAt(c.workAt!.x, c.workAt!.y);
                                setModal('none');
                              }}>去单位看看</button>
                            )}
                          </td>
                        </tr>
                        <tr><td>出身</td><td>{c.origin}{c.guest ? '（萍水相逢）' : `（迁来 ${fmtT(c.since)} 时）`}</td></tr>
                        {!c.guest && <tr><td>学历</td><td>{c.edu}（学区内住所会随时间升学：蒙童 → 初小 → 高小 → 大学）</td></tr>}
                      </tbody></table>
                      {!c.guest && c.fam && c.fam.length > 0 && (
                        <div className="cd-famwrap">
                          <h4>一家人</h4>
                          <div className="cd-fam">
                            {c.fam.map(f => f.here ? (
                              <button key={`${f.rel}-${f.id}`} className="fam-card" onClick={() => { setCitzSel(f.id); setCitzSpot(null); }}
                                title={`看 ${f.name} 的列传`}>
                                <b>{f.name}</b>
                                <span>{f.rel} · 心情 {f.mood}</span>
                              </button>
                            ) : (
                              <span key={`${f.rel}-${f.id}`} className={`fam-card off${f.gone === 'passed' ? ' passed' : ''}`}>
                                <b>{f.rel}</b>
                                <span>{f.note ?? '已迁居别城'}</span>
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                      <h4>生活大事记</h4>
                      <ul className="cd-log">
                        {c.log.length === 0 && <li className="empty">{c.guest ? '萍水相逢，还没有故事 —— 常来串门就熟了' : '还没有记录 —— 城市时间会带来故事'}</li>}
                        {c.log.map((l, i) => (
                          <li key={i}><time>{fmtT(l.t)}</time>{l.text}</li>
                        ))}
                      </ul>
                    </div>
                  );
                })() : (
                  <div className="citz-grid">
                    {cz.roster.map(c => (
                      <button key={c.id} className="citz-card" onClick={() => { setCitzSel(c.id); setCitzSpot(null); }}
                        title={`${c.name}：${c.bio}`}>
                        <img src={av(c)} alt="" />
                        <div className="cc-meta">
                          <b>{c.name}</b>
                          <span>{c.age}岁 · {c.job}</span>
                          <span className={`cc-mood ${moodCls(c.mood)}`}>心情 {c.mood}</span>
                        </div>
                      </button>
                    ))}
                    {cz.n === 0 && (
                      <p className="citz-empty">
                        名人册还空着 —— 多建住宅吸引市民迁入，人口每增长 2 人就有一位新市民在此立传；
                        也可以切到「观察」工具，点击街上的行人打招呼。
                      </p>
                    )}
                  </div>
                )}
                <div className="pxc-row" style={{ marginTop: 10 }}>
                  <button className="pxc-btn" onClick={() => openModal('data')}>
                    <img src={iu('chart')} alt="" />城市志
                  </button>
                  <button className="pxc-btn" onClick={() => openModal('fiscal')}>
                    <img src={iu('coin')} alt="" />财政报告
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* v15 市长信箱模态 */}
      {modal === 'mail' && econ && (() => {
        const eng = citzEng;   // 打开模态时捕获的引擎句柄（state，不读 ref）
        const av = (l: { look: number; body: 0 | 1 | 2; role: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 }, sz = 48): string =>
          eng?.citizenAvatar(l.look, l.body, l.role, sz) ?? BLANK;
        const mv = eng?.tycoon?.mailView() ?? { unread: 0, letters: [] };
        void mailVer;   // 回信后 setMailVer 触发重渲染
        const fmtT = (s: number): string => {
          const m = Math.floor(s / 60), ss = Math.floor(s % 60);
          return m > 0 ? `${m}分${String(ss).padStart(2, '0')}秒` : `${ss}秒`;
        };
        const sel = mv.letters.find(l => l.id === mailSel) ?? null;
        return (
          <div className="pxc-mask" onClick={e => { if (e.target === e.currentTarget) setModal('none'); }}>
            <div className="pxc-modal pxc-mail" role="dialog" aria-label="市长信箱">
              <header>
                市 长 信 箱
                <button className="pxc-x" onClick={() => setModal('none')} aria-label="关闭">×</button>
              </header>
              <div className="pxc-body">
                {sel ? (() => {
                  const l = sel;
                  return (
                    <div className="mail-read">
                      <div className="cd-top">
                        <button className="pxc-btn" onClick={() => setMailSel(null)}>← 返回信箱</button>
                        {l.replied >= 0 && <em className="cd-spot">已回信</em>}
                      </div>
                      <div className="mr-head">
                        <img className="mr-ava" src={av(l)} alt={`${l.fromName}的头像`} />
                        <div className="mr-meta">
                          <b>{l.subject}</b>
                          <span>{l.fromName} · {fmtT(l.t)} 前写来</span>
                        </div>
                        {!l.read && <em className="mr-new">新</em>}
                      </div>
                      <p className="mr-text">{l.text}</p>
                      {l.replied < 0 ? (
                        <div className="mr-opts">
                          <p className="mr-tip">怎么回这封信？（回信会影响 TA 的心情）</p>
                          {l.opts.map((o, i) => (
                            <button key={i} className="pxc-btn" onClick={() => {
                              eng?.tycoon?.replyLetter(l.id, i);
                              setMailVer(v => v + 1);
                            }}>
                              {o.label}{o.dm > 0 ? `（心情+${o.dm}）` : o.dm < 0 ? `（心情${o.dm}）` : ''}
                            </button>
                          ))}
                        </div>
                      ) : (
                        <div className="mr-replied">
                          <p className="mr-tip">您已回信（选了「{l.opts[l.replied]?.label}」）：</p>
                          <p className="mr-reply">「{l.opts[l.replied]?.reply}」</p>
                        </div>
                      )}
                    </div>
                  );
                })() : (
                  <div className="mail-list">
                    {mv.letters.length === 0 && (
                      <p className="citz-empty">
                        信箱还空着 —— 城市有了人气，市民就会常来信：报喜、求助、提建议。
                        顶栏「邮」亮红点时，就是有人盼着市长的回信。
                      </p>
                    )}
                    {mv.letters.map(l => (
                      <button key={l.id} className={`mail-item${l.read ? '' : ' unread'}`}
                        onClick={() => { eng?.tycoon?.markLetterRead(l.id); setMailSel(l.id); setMailVer(v => v + 1); }}>
                        <img src={av(l, 40)} alt="" />
                        <div className="mi-mid">
                          <b>{l.subject}{l.replied >= 0 && <i className="mi-re">已回</i>}</b>
                          <span>{l.fromName} · {l.text.slice(0, 26)}…</span>
                        </div>
                        {!l.read && <em className="mi-dot" aria-label="未读" />}
                        <time>{fmtT(l.t)}前</time>
                      </button>
                    ))}
                  </div>
                )}
                <div className="pxc-row" style={{ marginTop: 10 }}>
                  <button className="pxc-btn" onClick={() => openModal('anth')}>
                    <img src={iu('scroll')} alt="" />书信合集
                  </button>
                  <button className="pxc-btn" onClick={() => openModal('citz')}>
                    <img src={iu('person')} alt="" />市民列传
                  </button>
                  <button className="pxc-btn" onClick={() => openModal('data')}>
                    <img src={iu('chart')} alt="" />城市志
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* v30 书信合集模态（市民来信永久归档 · 主题图鉴） */}
      {modal === 'anth' && (() => {
        const eng = citzEng;
        const av = (l: { look: number; body: 0 | 1 | 2; role: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 }, sz = 48): string =>
          eng?.citizenAvatar(l.look, l.body, l.role, sz) ?? BLANK;
        const a = eng?.tycoon?.anthView() ?? { n: 0, replied: 0, subjects: 0, subjTotal: 11, cats: [], items: [] };
        const shown = anthCat === '全部' ? a.items : a.items.filter(x => x.cat === anthCat);
        const sel = anthSel != null ? a.items.find(x => x.id === anthSel) ?? null : null;
        const pct = a.subjTotal > 0 ? Math.round((100 * a.subjects) / a.subjTotal) : 0;
        return (
          <div className="pxc-mask" onClick={e => { if (e.target === e.currentTarget) setModal('none'); }}>
            <div className="pxc-modal pxc-anth" role="dialog" aria-label="书信合集">
              <header>
                书 信 合 集
                <button className="pxc-x" onClick={() => setModal('none')} aria-label="关闭">×</button>
              </header>
              <div className="pxc-body">
                {sel ? (() => {
                  const s = sel;
                  return (
                    <div className="an-read">
                      <div className="cd-top">
                        <button className="pxc-btn" onClick={() => setAnthSel(null)}>← 返回合集</button>
                        <em className={`an-seal${s.rp >= 0 ? ' ok' : ''}`}>{s.rp >= 0 ? '已回' : '未回'}</em>
                      </div>
                      <div className="mr-head">
                        <img className="mr-ava" src={av(s)} alt={`${s.nm}的头像`} />
                        <div className="mr-meta">
                          <b>{s.sj}</b>
                          <span>{s.nm} · 开埠第 {s.day} 天写来 · {s.cat}</span>
                        </div>
                      </div>
                      <p className="mr-text">{s.tx}</p>
                      {s.rp >= 0 ? (
                        <div className="mr-replied">
                          <p className="mr-tip">市长当日回信（选了「{s.rl}」）：</p>
                          <p className="mr-reply">「{s.rt}」</p>
                        </div>
                      ) : (
                        <div className="an-noreply">
                          <p className="mr-tip">这封信没能等到回信 —— 也许当日市政繁忙，也许它被时间悄悄挤出了信箱。</p>
                        </div>
                      )}
                    </div>
                  );
                })() : (
                  <div className="anth-list">
                    <div className="an-stats">
                      <b>见字如面 · 市民来信{a.n > 0 ? ` ${a.n} ` : ' '}封</b>
                      <span>已回 {a.replied} 封 · 已回信率 {a.n > 0 ? Math.round((100 * a.replied) / a.n) : 0}%</span>
                      <span className="an-prog" role="img" aria-label={`主题集齐 ${a.subjects}/${a.subjTotal}`}>
                        <i style={{ width: `${pct}%` }} />
                      </span>
                      <span>主题拾遗 {a.subjects}/{a.subjTotal}（集齐全主题解锁成就「鱼雁往还」）</span>
                    </div>
                    <div className="an-chips" role="group" aria-label="信笺分类">
                      {['全部', ...a.cats.map(c => c.cat)].map(cat => {
                        const n = cat === '全部' ? a.n : (a.cats.find(c => c.cat === cat)?.n ?? 0);
                        return (
                          <button key={cat} className={`an-chip${anthCat === cat ? ' on' : ''}${n === 0 && cat !== '全部' ? ' nil' : ''}`}
                            onClick={() => { setAnthCat(cat); setAnthSel(null); }}>
                            {cat}<i>{n}</i>
                          </button>
                        );
                      })}
                    </div>
                    {a.n === 0 && (
                      <p className="citz-empty">
                        合集还空着 —— 信箱满八封后，读过的旧信会收进这里永存。
                        民生的疾苦、灾后的谢忱、巷口的见闻，都是这座城的字据。
                      </p>
                    )}
                    {a.n > 0 && shown.length === 0 && (
                      <p className="citz-empty">这一类还没有来信 —— 城市安稳富足时，会有不同的心事写来。</p>
                    )}
                    <div className="an-grid">
                      {shown.map(s => (
                        <button key={s.id} className="an-card" data-cat={s.cat}
                          onClick={() => setAnthSel(s.id)}>
                          <img src={av(s, 40)} alt="" />
                          <div className="an-mid">
                            <b>{s.sj}</b>
                            <span>{s.nm} · 第{s.day}天 · {s.cat}</span>
                            <span className="an-ex">{s.tx.slice(0, 18)}…</span>
                          </div>
                          <em className={`an-seal${s.rp >= 0 ? ' ok' : ''}`}>{s.rp >= 0 ? '已回' : '未回'}</em>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                <div className="pxc-row" style={{ marginTop: 10 }}>
                  <button className="pxc-btn" onClick={() => openModal('mail')}>
                    <img src={iu('mail')} alt="" />市长信箱
                  </button>
                  <button className="pxc-btn" onClick={() => openModal('citz')}>
                    <img src={iu('person')} alt="" />市民列传
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* 帮助模态 */}
      {modal === 'help' && (
        <div className="pxc-mask" onClick={e => { if (e.target === e.currentTarget) setModal('none'); }}>
          <div className="pxc-modal" role="dialog" aria-label="操作说明">
            <header>
              操 作 说 明
              <button className="pxc-x" onClick={() => setModal('none')} aria-label="关闭">×</button>
            </header>
            <div className="pxc-body">
              {isMobile ? (
                <table className="pxc-help">
                  <tbody>
                    <tr><td>单指</td><td>使用当前工具（涂地形 / 画路 / 放建筑）</td></tr>
                    <tr><td>双指拖动</td><td>平移视野</td></tr>
                    <tr><td>双指捏合</td><td>缩放（×1 / ×2 / ×3），也可用顶栏 ±</td></tr>
                    <tr><td>底栏</td><td>工具横滑切换；▲ 展开建造中心抽屉</td></tr>
                    <tr><td>面板</td><td>所有面板都能点标题栏 ▾ / ▸ 收起展开</td></tr>
                    <tr><td>行人</td><td>建造中心 → 市政操作，可自动或手动 0-300 人；街头另有警察/邮递员/学生/主厨/慢跑者/医生/消防员/环卫工/游客出没，猫狗宠物与广场鸽群相伴</td></tr>
                    <tr><td>昼夜</td><td>市政操作：自动循环（×1/×2/×4）或跳转 晨/午/暮/夜；<b>四季</b>随时钟轮转（每季 4 分钟×1），冬季封冻 / 春樱秋红；沙盒可手动切季</td></tr>
                    <tr><td>桥梁</td><td>道路工具拖过水面自动架桥（15G/格），桥面与岸上齐平，行人车辆畅通无阻</td></tr>
                    <tr><td>经营</td><td>顶部 HUD 看金币/人口/电力/幸福；点迷雾金框购地；点市政厅开财政报告；工业产货供商业、缺货打折，景点招游客消费；两座电车站开通电车干线，铁路货运站让内陆城市出口；出口市价随行就市波动，可惜售囤货低吸高抛；消防与医疗覆盖成网（消防局/栓、诊所/防疫站/医院各有半径）——盲区起火蔓延更快、疫病偏爱盲区，防疫站还能全城压制疫情；财政报告里可进市政法令厅颁布政策</td></tr>
                    <tr><td>市民</td><td>顶栏「民」指标开<b>市民列传</b>：人口迁入迎来有名有姓的市民（传记/性格/住所/大事记），还能「去家里看看」；观察工具点击街上的行人也能遇到他们（在册市民就是本人，脸生的则是过路人）；成婚添丁会组成<b>家族谱系</b></td></tr>
                    <tr><td>信箱</td><td>顶栏「邮」指标开<b>市长信箱</b>：市民随城市状态来信（求助/吐槽/感谢/见闻），挑一种口吻回信会影响 TA 的心情；红点亮起就是有人盼着回信，回满 8 封解锁成就「见字如面」；信箱满八封后旧信永存于<b>书信合集</b>，分类翻阅、集齐 11 种主题再解「鱼雁往还」</td></tr>
                    <tr><td>公署</td><td>顶栏「批」指标开<b>市长公署</b>：每日清晨公文送抵案头（请愿/联名/风闻/献策…），每份两三道朱批各有代价与回响 —— 府库、人口、粮仓、民心随之而动，批注都落笔编年史「政令」卷；府库不足的批注会暂时下不去笔</td></tr>
                    <tr><td>邻城</td><td>顶栏「盟」指标开<b>姊妹城市</b>：开埠即有三座邻城与您隔野相望 —— 市政厅 LV2 起商队带货互市换银钱添交情；邻城遭灾会遣使求援（发援银好感 +18，久候不答等于婉拒），好感深厚会赠礼、来访，本城遭难时好感 ≥60 的邻城还会遣使驰援；好感 ≥60 结为姊妹之城、三城 ≥80 歃血为盟</td></tr>
                    <tr><td>考古</td><td>每购一块新领地都有 22% 机缘<b>出土文物</b>（工地偶尔也会自己说话）—— 城市志翻<b>出土图鉴</b>：陶土/青铜/玉石三套系 12 件，寻常、珍稀、国宝三档；博物馆在城时自动开馆展出 —— 展出的每一件都给文化供给与吸引力添笔，国宝是镇馆之宝（游客乘数），集齐 12 件全展出「满馆琳琅」</td></tr>
                    <tr><td>报馆</td><td>顶栏「闻」指标开<b>城市日报</b>：建成报馆（需「义务教育」）即创刊，每七游戏日一期 —— 头版头条自动选编年史大事，大事出号外加印；市况栏报景气、气象栏报季节、来信选登摘市长信箱、广告栏随商户开门念词、「城南旧事」连载八回轮刊登；发行量随人口与识字率浮动，卖报所得进府库；报馆被拆则停刊，过刊保留，复建自动复刊</td></tr>
                    <tr><td>名人堂</td><td>顶栏「光」指标开<b>荣誉殿堂</b>：建成名人堂（需「城市名片」）即开榜，每逢换季整点评出一颗「本季城市之光」—— 八大奖项按城市状态加权（消防局在城才评得动见义勇为、赢球才有人捧绿茵之星），获奖市民名镌光荣榜、心情大振，全城幸福 +1；授勋大事入编年史，报馆在城还能上号外；拆堂停评光荣榜保留，复建自动复评</td></tr>
                    <tr><td>地铁</td><td>顶栏「轨」指标开<b>轨道交通</b>：建成地铁车辆段（需「建筑工程学」）作全线锚点 —— 地铁站沿切比雪夫 12 格逐站续链（站与站手拉手也能远距离延伸），两站接入即通车；接入站以 5 格通勤圈服务商铺与住宅（收入 +6% · 幸福 +1.2/栋），每接入站交通 +5 至多 +20；未接入的车站只是摆设，施工期车马为患的城通车那日编年史补写「通途重开」</td></tr>
                    <tr><td>空港</td><td>顶栏「航」指标开<b>空港航线</b>：建成空港航站楼（需「建筑工程学」）即开邻省都会线 —— 每条航线 8 小时一班，游客 ×1.12 起（每条航线再 +12%）、空运出口 +3 件/分、交通 +8、商圈（半径 7 格）商铺收入 +8%；姊妹城好感 ≥60 各开花一条国际航线，人口 ≥500 再开远洋枢纽线；但半径 4 格噪音圈住宅幸福 −0.8/栋（至多 −5）—— 商圈要近、噪音要远，机场选址是一道权衡题</td></tr>
                    <tr><td>节庆</td><td>顶栏「庆」指标开<b>城市节庆</b>：随季节举办樱花祭/花火大会/丰收节/暖灯节（市政厅 LV3 起），90 秒全城增益 —— 春天樱吹雪加密、夏天夜空花火、秋天金叶满街、冬天孔明灯升空；节日会写进市民大事记，累计 8 场解锁成就「节庆之都」、四季各办一场解锁「四季轮庆」</td></tr>
                    <tr><td>引导</td><td>首次进入经营模式自动展开新手引导横幅（修路→建房→迎市民→开业→看面板→认市民）；随时可跳过，也可在这里点「重新查看新手引导」重看</td></tr>
                    <tr><td>音效</td><td>顶栏喇叭图标：音效开关 + 主音量滑杆（本地记忆）；建造/金币/灾害警报/警笛/电车铃/成就凯旋各有专属 8-bit 音色</td></tr>
                  </tbody>
                </table>
              ) : (
                <table className="pxc-help">
                  <tbody>
                    <tr><td>左键</td><td>使用当前工具（涂地形 / 画路 / 放建筑）</td></tr>
                    <tr><td>右键 / 中键拖动</td><td>平移视野（观察工具下左键也可）</td></tr>
                    <tr><td>滚轮</td><td>以光标为中心缩放（×1 / ×2 / ×3）</td></tr>
                    <tr><td>W A S D / 方向键</td><td>平移视野</td></tr>
                    <tr><td>空格</td><td>视野居中</td></tr>
                    <tr><td>1 – 9 · 0 / −</td><td>观察 / 植树 / 道路 / 地形 / 住宅 / 商业 / 工业 / 公共 / 拆除 / 抬升 / 降低</td></tr>
                    <tr><td>G</td><td>一键生成整座城市（沙盒模式；可反复按，每次全新）</td></tr>
                    <tr><td>地形</td><td>真实海拔起伏：抬升造山、降低挖谷（挖到 0 化为水域）；山坡建房自动整地（另付小额费用）；行人车辆会爬坡</td></tr>
                    <tr><td>桥梁</td><td>道路工具拖过水面自动架桥（15G/格，物流网络科技打折），桥面与岸上路面齐平，行人车辆畅通无阻</td></tr>
                    <tr><td>四季</td><td>春樱/夏绿/秋红/冬雪随时钟轮转（每季 4 分钟×1）：春季樱花瓣飘落、冬季水面封冻大地积雪；粮产/商业/用电随季节联动</td></tr>
                    <tr><td>经营</td><td>金币建造 · 人口迁入 · 电力供需 · <b>粮仓与饥荒</b> · <b>货物供应链</b>（工业产货→零售上货→港口出口，缺货商业打折）· <b>观光经济</b>（景点招游客·酒店定上限）· <b>市政法令</b>（财政报告内进政令厅）· <b>有轨电车</b>（两座电车站开通干线：交通+幸福双升）· <b>铁路货运与出口市场</b>（内陆出口 4 件/分；市价 55%-155% 波动，可惜售囤货低吸高抛）· <b>城市卫士应急联动</b>（交番驻巡逻警车·治安+220 护盾；火灾/疫病来袭消防车救护车沿路驰援——到场喷水/接载并免余损，设施邻路是关键）· <b>消防水网与火势蔓延</b>（消防局半径 5 格·消防栓半径 2 格织成水网：覆盖区火势减半；盲区起火蔓延更快且会蹿烧邻栋——受灾住户与街坊都写进个人史册，消防员到场还可能成为你家恩人）· <b>悬壶济世·医疗覆盖</b>（诊所半径 3 格·防疫站半径 4 格·医院半径 6 格织成医疗网，市政厅自带义诊棚：盲区住宅看病要跨半座城、商铺店员带病营业收入打折；疫病偏爱在盲区爆发且会蔓延邻栋——防疫站在城全城压制疫情，疫点住户与隔离街坊都写进个人史册，救护车零蔓延化解记「仁心妙术」）· <b>市民列传</b>（人口迁入迎来有名有姓的市民：顶栏「民」指标开名人册看传记与大事记，观察工具点击街上行人打招呼——在册市民就是本人、脸生的则是过路人，成婚添丁组成家族谱系，市民之声随城市状态轮播）· <b>市长信箱</b>（顶栏「邮」指标：市民随城市状态来信——求助/吐槽/感谢/见闻，回信影响他们的心情，回满 8 封解锁成就「见字如面」）· <b>市长公署</b>（顶栏「批」指标：每日清晨公文送抵案头——请愿/联名/风闻/献策，每份两三道朱批各有代价与回响，府库/人口/粮仓/民心随之而动，批注落笔编年史「政令」卷）· <b>城市节庆</b>（顶栏「庆」指标：随季节办节 —— 樱花祭/花火大会/丰收节/暖灯节，90 秒全城增益配专属街景特效）· <b>市况荣枯</b>（景气指数随时间起落：繁荣商业游客双旺、衰退市道冷清，大灾大喜震动市况，荣枯起落写入编年史；财政报告「市况荣枯」看行情条，金融枢纽科技解锁「平准均输」法令可熨平波动）· <b>城市联赛</b>（顶栏「球」指标：体育场落成后「市民联」联赛自动开张——每隔数日一场主场，比赛日商业 ×1.08 · 游客 ×1.22 · 幸福 +1，赢球彩带飘满全城 120 秒；客队档次随城市评级升级，每 6 场一赛季积分加冕，战绩奖杯写进编年史；「球场风云」看赛程战绩与荣誉墙）· <b>城市动物园</b>（顶栏「兽」指标：动物园落成后物种图鉴开册——巡查员定期进园评估，吸引力与评级越高动物住户来得越勤，每种住户给吸引力/幸福加成；冬季企鹅最爱来、夏天锦鲤挤破池塘、镇园之宝大熊猫要高评级才点头；集齐 9 种解锁「万兽来朝」）· <b>千里比邻·姊妹城市</b>（顶栏「盟」指标：开埠即有三座邻城隔野相望——市政厅 LV2 起商队带货互市换银钱添交情，邻城遭灾遣使求援、好感深厚会赠礼来访，本城遭难时好感 ≥60 的邻城驰援；好感 ≥60 结为姊妹之城、三城 ≥80 歃血为盟，月评评级首超邻城名声在外）· <b>厚土藏珍·考古之城</b>（每购一块新领地 22% 机缘出土文物：陶土/青铜/玉石三套系 12 件，入册出土图鉴 —— 城市志可翻；博物馆在城自动开馆展出，文化、吸引力、国宝镇馆游客乘数与满馆琳琅幸福都沾文物的光）· <b>城市之声·报馆与城市日报</b>（顶栏「闻」指标：建成报馆即创刊——每七游戏日一期《城市日报》，头版头条自动选编年史大事、大事出号外加印，市况/气象/来信选登/商户广告/城南旧事连载栏目全上版面，发行量随人口与识字率浮动、卖报所得进府库；拆馆停刊过刊保留，复建自动复刊）· <b>城市之光·名人堂</b>（顶栏「光」指标：建成名人堂即开榜——每逢换季整点评出一颗「本季城市之光」，八大奖项按城市状态加权授勋——消防局在城才评得动见义勇为、赢球才有人捧绿茵之星，获奖市民名镌光荣榜、心情大振、全城幸福 +1，授勋大事入编年史还能上报纸号外；拆堂停评光荣榜保留，复建自动复评）· <b>轨道时代·地下铁</b>（顶栏「轨」指标：建成地铁车辆段并沿链 12 格逐站接入地铁站 —— 两站成线通车，5 格通勤圈商铺收入 +6%、住宅幸福 +1.2/栋，每接入站交通 +5 至多 +20；未接入车站不通车，信号故障列车限速，施工期车马为患、通车那日编年史写「通途重开」）· <b>十维指数与城市评级</b> · <b>税率政策</b>（0-20% 滑杆，高税伤幸福）· <b>水务覆盖</b>（水塔/净水厂）· 设施维护费；点击迷雾边缘<b>金色虚线框</b>购地扩张；点<b>市政厅</b>开财政报告（含税率滑杆）；点顶部「就业/评级」指标开<b>城市志</b>（指数条 + 历史曲线）；点顶部「科」指标进科技研究院；拆除设施可回收部分造价</td></tr>
                    <tr><td>Ctrl + Z / Ctrl + Shift + Z</td><td>撤销 / 重做</td></tr>
                    <tr><td>引导</td><td>首次进入经营模式自动展开新手引导横幅（修路→建房→迎市民→开业→看面板→认市民）；随时可跳过，也可在这里点「重新查看新手引导」重看</td></tr>
                    <tr><td>音效</td><td>顶栏喇叭图标：音效开关 + 主音量滑杆（本地记忆偏好）；建造/金币/灾害警报/应急警笛/电车铃/季节钟声/成就凯旋等 21 种专属 8-bit 音色</td></tr>
                    <tr><td>Esc</td><td>切回观察工具</td></tr>
                    <tr><td>收缩</td><td>工具条 / 建造中心可「◀ / 收起」折叠；折叠后点左上角「▶ 工具栏」或右缘「◀ 建造中心」竖签恢复</td></tr>
                  </tbody>
                </table>
              )}
              <div style={{ marginTop: 10, fontSize: 12, lineHeight: 1.8 }}>
                小贴士：按 G 或点「一键城市」秒得一座分区完备的城市；市政操作里可调
                「密度」（疏朗/适中/繁华）与「行人」数量（自动或手动 0-300），沙盒还能手动切「四季」；
                「昼夜」支持自动循环与场景跳转——深夜会点亮万家灯火、路灯与霓虹，
                行人也会随夜色回家；随机地图有 10 种地形；植树有 6 种树（含樱花，春日满树粉白）。
              </div>
              {/* v14 新手引导：重看入口 */}
              <div className="pxc-row" style={{ marginTop: 10 }}>
                <button className="pxc-btn" onClick={() => {
                  const t = tutRef.current;
                  if (!t) return;
                  t.restart();
                  setTutSnap({ step: t.step, active: t.active });
                  setModal('none');
                  beeperRef.current?.play('open');
                  say('新手引导已重启：跟着横幅走一遍吧');
                }}>
                  <img src={iu('flag')} alt="" />重新查看新手引导
                </button>
                <span style={{ fontSize: 11, color: '#555c66', alignSelf: 'center' }}>
                  修路 → 建房 → 迎市民 → 开门营业，几分钟上手
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
