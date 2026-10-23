// ============================================================
// engine.ts — 游戏引擎：相机 / 输入 / 双通道渲染（地面+对象）/
//           幽灵预览 / 小地图 / 撤销重做 / 存档导出
// ============================================================

import {
  CityMap, TERR_WATER, TERR_SAND, TERR_FARM, TERR_ROCK, MAP_N, TERR_GRASS,
  TERR_SNOW, TERR_FLOWER, TERR_DRY, TERR_SWAMP, TERR_AUTUMN, HMAX, HSTEP,
} from './map';
import { SpriteBook, defById } from './catalog';
import { getGround, getCliff, type CliffStyle } from './terrain';
import { ghostSprite, renderModel, type Sprite } from './softrender';
import { genTree } from './b_civ';
import { PALETTE } from './palette';
import type { Beeper } from './audio';
import { hash2, fbm } from './rng';
import { generateCity, type GenReport } from './citygen';
import { ActorSystem, lampModel, glowPool, type Facing, type CarDir, type Actor, type Role } from './actors';
import type { CitzCard } from './citizens';
import {
  Tycoon, ECON, CHUNK, CHUNKS, TREE_COST, ROAD_REFUND, TREE_REFUND,
  REFUND_RATE, LIFT_COST, WATER_COST, FLAT_FEE, BRIDGE_REFUND, SEASONS,
  techNameOf, WASTE_LV2, type EconView,
  type WeatherKind,
} from './tycoon';

export type Tool =
  | { t: 'view' }
  | { t: 'terr'; k: number }
  | { t: 'tree' }
  | { t: 'road' }
  | { t: 'build'; id: string; variant: number }
  | { t: 'lift' }
  | { t: 'sink' }
  | { t: 'doze' };

const ZOOMS = [1, 2, 3];
const MM = 2;   // 小地图每格像素

export type EngineHooks = {
  onStats?: (s: { pop: number; buildings: number; roads: number; trees: number }) => void;
  onHover?: (tx: number, ty: number) => void;
  onZoom?: (z: number) => void;
  onTool?: (t: Tool) => void;
  onFps?: (fps: number) => void;
  onEcon?: (e: EconView | null) => void;
  onTycoonMsg?: (msg: string) => void;
  onHallClick?: () => void;
  /** v13 观察工具点击行人 → 打开该市民名片 */
  onPedestrianClick?: (c: CitzCard) => void;
};

type RenderItem = { key: number; draw: () => void };

export class Engine {
  map = new CityMap(MAP_N);
  book = new SpriteBook();
  actors = new ActorSystem();
  crowds = true;
  /** 一键城市密度倍率（UI 可调，疏朗 0.55 / 适中 0.8 / 繁华 1.05） */
  cityDensity = 0.8;
  /** 经营模式（非 null = 经营模式激活：建造过经济门禁，领土迷雾可见） */
  tycoon: Tycoon | null = null;
  private econTimer = 0;
  private downCss: { x: number; y: number } | null = null;
  /** 昼夜时钟：0-24 小时（浮点）；auto 模式下按 timeSpeed 推进（×1 = 8 分钟一天） */
  timeOfDay = 10;
  timeAuto = true;
  timeSpeed = 1;
  /** 当前明暗曲线（0=白昼 1=深夜；晨暮暖色强度） */
  private dayNight = { dark: 0, warm: 0 };
  private lastInvalT = 0;
  /** v15 市民外观偏置池上次同步时刻（ms） */
  private lastCitzLookT = 0;
  private lampSp: Sprite | null = null;
  private lampNight: Sprite | null = null;
  private lampPool: HTMLCanvasElement | null = null;
  private carPool: HTMLCanvasElement | null = null;
  /** 背景缓存（日间点阵 / 夜间星月），避免每帧数千次 fillRect */
  private bgDay: HTMLCanvasElement | null = null;
  private bgNight: HTMLCanvasElement | null = null;
  private bgW = 0;
  private bgH = 0;
  beeper: Beeper;
  hooks: EngineHooks = {};

  private display: HTMLCanvasElement | null = null;
  private dctx: CanvasRenderingContext2D | null = null;
  private lowres: HTMLCanvasElement;
  private lctx: CanvasRenderingContext2D;
  private mini: HTMLCanvasElement | null = null;
  private miniBase: HTMLCanvasElement;
  private miniDirty = true;

  private dpr = 1;
  zoom = 2;
  cam = { x: 0, y: 0 };      // 视野中心（等距屏幕 px）

  tool: Tool = { t: 'view' };
  hover: { tx: number; ty: number } | null = null;

  private raf = 0;
  private lastT = performance.now();
  private fpsAcc = 0; private fpsN = 0; private fpsAt = performance.now();

  private keys = new Set<string>();
  private painting = false;
  private panning = false;
  private dragMode = false;
  private lastPan = { x: 0, y: 0 };
  private lastTile: { x: number; y: number } | null = null;
  private undoStack: string[] = [];
  private redoStack: string[] = [];
  private lastSaveVer = -1;
  private lastSaveT = 0;
  /** v6 四季树精灵 [season][kind]（春樱/夏绿/秋红/冬雪） */
  private treeSprites: Sprite[][] = [];
  // 多点触控
  private pointers = new Map<number, { x: number; y: number }>();
  private pinchDist = 0;
  private lastPinch: { x: number; y: number } | null = null;
  // ---- v7 飞艇：复古观光飞艇定时巡航（高空慢速横穿 · 地面投影随行）----
  private blimp: { x: number; y: number; dx: number; dy: number } | null = null;
  private blimpTimer = 40;
  // 拆除尘土 / 金币浮字（细节反馈）
  private puffs: Array<{ x: number; y: number; t0: number; big: boolean }> = [];
  private floats: Array<{ x: number; y: number; t0: number; text: string; color: string }> = [];

  // ---- Pass1 地形层滚动缓存（性能核心：顶面/崖壁/高度光照/迷雾 → 离屏画布 blit）----
  /** 缓冲区四周余量（px）：相机平移 ±TBUF_MOVE 内零重绘 */
  private static readonly TBUF_PAD = 160;
  /** 触发全量重绘的相机位移阈值 */
  private static readonly TBUF_MOVE = 96;
  private terrBuf: HTMLCanvasElement | null = null;
  private terrCtx: CanvasRenderingContext2D | null = null;
  private terrCam = { x: 0, y: 0 };
  private terrVer = -1;
  /** 迷雾版本：购地 / 进出经营模式时自增 → 缓存失效 */
  private fogVer = 0;
  private terrFogV = -1;
  /** 动态水面瓦片（两帧波光动画，每帧重画；坐标为缓存时刻主画布语义） */
  private waterList: Array<{ sx: number; sy: number; tx: number; ty: number; v: number; e: number }> = [];
  /** v6 跨水桥瓦片（缓存时刻主画布语义；每帧在水面上层重绘桥板 + 桥墩） */
  private bridgeList: Array<{ sx: number; sy: number; tx: number; ty: number; mask: number }> = [];
  /** 路灯杆（参与 Pass2 深度排序 + 夜间发光） */
  private lampList: Array<{ sx: number; sy: number; key: number }> = [];
  /** 水面动画跳过状态（帧与偏移未变则跳过整轮重画） */
  private waterAnim = { wf: -1, dcx: 1e9, dcy: 1e9 };

  // ---- v5：天气系统（晴/多云/雨/雪：状态机 + 粒子 + 云影 + 色调）----
  private wx = { kind: 'clear' as WeatherKind, t: 0, timer: 150 };
  /** 淡出中的旧天气（切换时渐隐 2s，避免粒子突变） */
  private wxPrev: { kind: WeatherKind; t: number } | null = null;
  private rainPts: Float32Array | null = null;
  private snowPts: Float32Array | null = null;
  private cloudSp: HTMLCanvasElement | null = null;
  private clouds: Array<{ x: number; y: number; v: number }> = [
    { x: 30, y: 60, v: 0.62 }, { x: 130, y: 140, v: 0.48 }, { x: 220, y: 95, v: 0.55 },
  ];

  // ---- v6：四季系统（季节时钟随昼夜推进；每季 12 游戏小时 = 4 分钟实时×1）----
  /** 当前季节 0春 / 1夏 / 2秋 / 3冬 */
  season = 1;
  /** 季节自动轮转（false = 手动锁定，沙盒市政可切） */
  seasonAuto = true;
  /** 季节相位时钟（游戏小时 0..48；4 季 × 12h） */
  private seasonClock = 12;
  /** 地形缓存记录的季节（变化 → 全量重绘） */
  private terrSeason = -1;
  /** 春季樱花瓣粒子 */
  private petalPts: Float32Array | null = null;

  // ---- v16：城市节庆视觉（由 tycoon.fest 每帧同步）----
  /** 当前节日（-1 无 / 0 樱花祭 / 1 花火大会 / 2 丰收节 / 3 暖灯节） */
  private festKind = -1;
  /** 花火火箭（4 × 4：x, y, vy, 目标高度；升空到位后炸开成火花） */
  private fwRockets: Float32Array | null = null;
  /** 花火火花（48 × 5：x, y, vx, vy, life；径向散开 + 重力下坠） */
  private fwSparks: Float32Array | null = null;
  private fwSpawnT = 0;
  /** 孔明灯（12 × 4：x, y, 摆动相位, 上升速度；暖光缓升） */
  private lampPts: Float32Array | null = null;

  // ---- v18：灾害链视觉（地震震屏 / 洪水淹没层）----
  /** 地震震屏剩余秒数（> 0 时相机随机抖动，振幅随剩余时间衰减） */
  quakeT = 0;
  /** 震屏总时长（衰减归一用） */
  private quakeDur = 1;
  /** 震屏峰值振幅（px，低分辨率层坐标） */
  private quakeAmp = 0;
  /** 洪水淹没格（idx 打包；事件开始时重算，随 map.version 失效） */
  private floodTiles: number[] | null = null;
  /** floodTiles 计算时的地图版本（地形变动后重算） */
  private floodVer = -1;

  private listeners: Array<[EventTarget, string, EventListener]> = [];

  constructor(beeper: Beeper) {
    this.beeper = beeper;
    this.lowres = document.createElement('canvas');
    this.lctx = this.lowres.getContext('2d')!;
    this.miniBase = document.createElement('canvas');
    // v14 音效矩阵：actor 侧事件（电车发车铃）转发到 Beeper
    this.actors.onSfx = n => this.beeper.play(n);
    this.map.onChange = () => {
      this.miniDirty = true;
      this.actors.invalidate();
      this.hooks.onStats?.(this.map.stats());
    };
  }

  // ---------------- 生命周期 ----------------

  async init(onProgress: (frac: number, label: string) => void): Promise<void> {
    await this.book.init(onProgress);
    // v6：四季树精灵（4 季 × 6 种：春樱粉/夏盛绿/秋红叶/冬积雪）
    this.treeSprites = [0, 1, 2, 3].map(sn =>
      [0, 1, 2, 3, 4, 5].map(v => renderModel(genTree(v, sn).model)));
    this.lampSp = renderModel(lampModel());
    this.lampNight = renderModel(lampModel(), { night: true });
    this.lampPool = glowPool(28, 16);
    this.carPool = glowPool(16, 10);
    this.actors.ensureSprites();
    this.map.random((Math.random() * 1e9) | 0);
    this.center();
  }

  attach(display: HTMLCanvasElement, mini: HTMLCanvasElement | null): void {
    this.display = display;
    this.dctx = display.getContext('2d');
    this.mini = mini;
    if (mini) {
      mini.width = this.map.n * MM;
      mini.height = this.map.n * MM;
      this.bindMini(mini);
    }
    this.bindInput(display);
    // 移动端 / 触屏默认 ×1（屏幕窄，×2 太近）
    const coarse = window.matchMedia?.('(pointer: coarse)').matches ?? false;
    if (coarse || Math.min(window.innerWidth, window.innerHeight) < 500) {
      this.setZoom(1);
    }
    this.resize();
    this.loop();
  }

  destroy(): void {
    if (this.tycoon) this.tycoon.save(this.map);
    cancelAnimationFrame(this.raf);
    for (const [t, n, f] of this.listeners) t.removeEventListener(n, f);
    this.listeners = [];
  }

  private on(t: EventTarget, name: string, f: EventListener, opts?: AddEventListenerOptions): void {
    t.addEventListener(name, f, opts);
    this.listeners.push([t, name, f]);
  }

  resize(): void {
    const d = this.display;
    if (!d) return;
    const rect = d.getBoundingClientRect();
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    const cssW = Math.max(100, rect.width);
    const cssH = Math.max(100, rect.height);
    d.width = Math.round(cssW * this.dpr);
    d.height = Math.round(cssH * this.dpr);
    this.lowres.width = Math.ceil(cssW / this.zoom);
    this.lowres.height = Math.ceil(cssH / this.zoom);
    this.lctx.imageSmoothingEnabled = false;
    if (this.dctx) this.dctx.imageSmoothingEnabled = false;
  }

  // ---------------- 坐标 ----------------

  private get lw(): number { return this.lowres.width; }
  private get lh(): number { return this.lowres.height; }

  /** 世界格角点 → 等距屏幕 px（低分辨率画布坐标） */
  private w2sx(wx: number, wy: number): number { return (wx - wy) * 16 - this.cam.x + this.lw / 2; }
  private w2sy(wx: number, wy: number): number { return (wx + wy) * 8 - this.cam.y + this.lh / 2; }

  /** 格高度（0=水面；越界视为 0） */
  hAt(tx: number, ty: number): number {
    return this.map.inB(tx, ty) ? this.map.h[this.map.idx(tx, ty)] : 0;
  }

  /** 高度 → 屏幕像素偏移（负数 = 向上抬升） */
  hOfs(tx: number, ty: number): number { return -this.hAt(tx, ty) * HSTEP; }

  /** 浮点格坐标处的地面高度像素（双线性插值：行人 / 车辆平滑爬坡）
   *  v6：跨水桥格视作 1 级高（桥板与岸上路面齐平，行人车辆自然上桥） */
  groundHpx(fx: number, fy: number): number {
    const n = this.map.n;
    const x0 = Math.max(0, Math.min(n - 1, Math.floor(fx)));
    const y0 = Math.max(0, Math.min(n - 1, Math.floor(fy)));
    const x1 = Math.min(n - 1, x0 + 1), y1 = Math.min(n - 1, y0 + 1);
    const tx = Math.min(1, Math.max(0, fx - x0)), ty = Math.min(1, Math.max(0, fy - y0));
    const rd = this.map.road;
    const hOf = (x: number, y: number): number => {
      const i = y * n + x;
      return rd[i] === 2 ? 1 : this.map.h[i];   // 桥面 = 1 级
    };
    const h00 = hOf(x0, y0), h10 = hOf(x1, y0);
    const h01 = hOf(x0, y1), h11 = hOf(x1, y1);
    const h = h00 * (1 - tx) * (1 - ty) + h10 * tx * (1 - ty) + h01 * (1 - tx) * ty + h11 * tx * ty;
    return -h * HSTEP;
  }

  /** 鼠标 CSS 坐标 → 格坐标（高度感知：由近及远逐对角线检测抬升后的菱形） */
  tileAt(cssX: number, cssY: number): { tx: number; ty: number } {
    const sx = cssX / this.zoom, sy = cssY / this.zoom;
    const ax = sx + this.cam.x - this.lw / 2;   // = (X−Y)*16
    const ay = sy + this.cam.y - this.lh / 2;   // = (X+Y)*8 − h·HSTEP
    const a = ax / 16;                           // X−Y（浮点）
    const n = this.map.n;
    const k0 = Math.floor(ay / 8);
    const kTop = Math.min(2 * n - 2, k0 + Math.ceil(HMAX * HSTEP / 8) + 2);
    const j0 = Math.floor(a);
    for (let k = kTop; k >= Math.max(0, k0 - 2); k--) {
      for (let j = j0; j <= j0 + 1; j++) {
        if (Math.abs(a - j) > 1) continue;
        if (((j + k) & 1) !== 0) continue;       // 需整数格坐标
        const tx = (j + k) / 2, ty = (k - j) / 2;
        if (tx < 0 || ty < 0 || tx >= n || ty >= n) continue;
        const hh = this.map.road[ty * n + tx] === 2 ? 1 : this.map.h[ty * n + tx];   // v6 桥面拾取
        const eta = ay + hh * HSTEP - k * 8;     // 菱形内局部 y ∈ [0,16)
        const xi = (a - j) * 16 + 16;            // 菱形内局部 x ∈ [0,32)
        if (Math.abs(xi - 16) / 16 + Math.abs(eta - 8) / 8 <= 1) return { tx, ty };
      }
    }
    // 兜底：平面反投影
    const X = ax / 32 + ay / 16;
    const Y = ay / 16 - ax / 32;
    return { tx: Math.floor(X), ty: Math.floor(Y) };
  }

  center(): void {
    const c = this.map.n / 2;
    this.cam.x = (c - c) * 16;
    this.cam.y = (c + c) * 8;
  }

  /** v13 视野定位到指定格（市民面板「去家里/单位看看」） */
  centerAt(tx: number, ty: number): void {
    this.cam.x = (tx - ty) * 16;
    this.cam.y = (tx + ty) * 8;
  }

  // ---------------- 工具 ----------------

  setTool(t: Tool): void {
    this.tool = t;
    this.hooks.onTool?.(t);
  }

  /** 行人 / 车辆开关 */
  setCrowds(on: boolean): void {
    this.crowds = on;
    this.actors.enabled = on;
    if (!on) this.actors.clear();
    else this.actors.invalidate();
  }

  /** 行人数量：auto=true 随人口自适应；否则固定 n（0..300） */
  setPedTarget(auto: boolean, n: number): void {
    this.actors.setPedTarget(auto, n);
  }

  // ---------------- 昼夜时钟 ----------------

  /** 直接跳转时刻（保持当前模式） */
  setTimeOfDay(h: number): void {
    this.timeOfDay = ((h % 24) + 24) % 24;
    this.recomputeDayNight();
    this.actors.invalidate();
  }

  /** 昼夜模式：auto=自动循环；speed ∈ {1,2,4}（×1 = 8 分钟一天） */
  setDayNight(auto: boolean, speed: number): void {
    this.timeAuto = auto;
    this.timeSpeed = Math.max(1, Math.min(4, Math.round(speed)));
  }

  // ---------------- v6 季节 ----------------

  /** 每季游戏小时数（4 季轮转一年 = 48 游戏小时 = 16 分钟实时×1） */
  static readonly SEASON_HOURS = 12;

  /** 手动切季（auto=false 锁定；沙盒市政按钮） */
  setSeason(s: number, auto = false): void {
    const sn = Math.max(0, Math.min(3, Math.round(s)));
    this.seasonAuto = auto;
    if (sn !== this.season) {
      this.season = sn;
      this.seasonClock = sn * Engine.SEASON_HOURS + 0.01;
      this.onSeasonChanged(true);
    }
  }

  /** 季节切换：失效地形缓存（地面 / 水面 / 树冠全换装）+ 经营提示 + 更替钟声 */
  private onSeasonChanged(manual: boolean): void {
    this.terrSeason = -2;   // 强制 ensureTerrain 重绘
    this.actors.invalidate();
    this.beeper.play('season');   // v14：季节更替音（手动/自动均响）
    const s = SEASONS[this.season];
    if (this.tycoon) {
      this.tycoon.season = this.season;
      this.tycoon.msg?.(`${manual ? '季节切换' : '季节更替'}：${s.note}`);
    }
  }

  /** 季节时钟步进（随昼夜同步推进；每季 12 游戏小时） */
  private stepSeason(dh: number): void {
    if (!this.seasonAuto) return;
    this.seasonClock += dh;
    if (this.seasonClock >= 4 * Engine.SEASON_HOURS) this.seasonClock -= 4 * Engine.SEASON_HOURS;
    const sn = Math.floor(this.seasonClock / Engine.SEASON_HOURS);
    if (sn !== this.season) {
      this.season = sn;
      this.onSeasonChanged(false);
    }
  }

  seasonName(): string { return SEASONS[this.season].name; }
  seasonIcon(): string { return SEASONS[this.season].icon; }

  clockText(): string {
    const hh = Math.floor(this.timeOfDay) % 24;
    const mm = Math.floor((this.timeOfDay % 1) * 60);
    return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
  }

  phaseChar(): string {
    const t = this.timeOfDay;
    if (t >= 5 && t < 8) return '晨';
    if (t >= 8 && t < 17) return '昼';
    if (t >= 17 && t < 20) return '暮';
    return '夜';
  }

  private recomputeDayNight(): void {
    const t = this.timeOfDay;
    let dark = 0;
    if (t >= 20 || t < 4.5) dark = 1;
    else if (t >= 17) dark = (t - 17) / 3;
    else if (t < 7) dark = 1 - (t - 4.5) / 2.5;
    let warm = 0;
    if (t > 4.8 && t < 7.6) warm = Math.sin(((t - 4.8) / 2.8) * Math.PI);
    else if (t > 16.6 && t < 19.8) warm = Math.sin(((t - 16.6) / 3.2) * Math.PI);
    dark *= 1 - 0.45 * warm;
    this.dayNight = {
      dark: Math.max(0, Math.min(1, dark)),
      warm: Math.max(0, Math.min(1, warm)),
    };
  }

  // ---------------- v5 天气系统 ----------------

  /** 天气转移表：[目标, 概率] */
  private static readonly WX_NEXT: Record<WeatherKind, Array<[WeatherKind, number]>> = {
    clear: [['cloudy', 0.55], ['rain', 0.30], ['snow', 0.15]],
    cloudy: [['clear', 0.45], ['rain', 0.35], ['snow', 0.20]],
    rain: [['clear', 0.40], ['cloudy', 0.45], ['snow', 0.15]],
    snow: [['clear', 0.45], ['cloudy', 0.40], ['rain', 0.15]],
  };
  /** 各天气持续区间（秒） */
  private static readonly WX_DUR: Record<WeatherKind, [number, number]> = {
    clear: [120, 200], cloudy: [80, 150], rain: [50, 100], snow: [60, 110],
  };

  /** 某天气的综合强度（当前渐入 + 旧天气渐出） */
  private wxIntensity(kind: WeatherKind): number {
    let v = this.wx.kind === kind ? this.wx.t : 0;
    if (this.wxPrev && this.wxPrev.kind === kind) v += this.wxPrev.t;
    return Math.min(1, v);
  }

  /** 直接切换天气（暴风雨事件 / 调试） */
  setWeather(kind: WeatherKind): void {
    if (this.wx.kind === kind) return;
    this.wxPrev = { kind: this.wx.kind, t: this.wx.t };
    const [a, b] = Engine.WX_DUR[kind];
    this.wx = { kind, t: 0, timer: a + Math.random() * (b - a) };
  }

  /** 天气状态机步进（含粒子位置更新与云漂移） */
  private stepWeather(dt: number): void {
    // 状态转移
    this.wx.timer -= dt;
    if (this.wx.timer <= 0) {
      const table = Engine.WX_NEXT[this.wx.kind];
      let r = Math.random();
      let next: WeatherKind = table[table.length - 1][0];
      for (const [k, p] of table) { r -= p; if (r <= 0) { next = k; break; } }
      this.setWeather(next);
    }
    // 渐入 / 渐出
    if (this.wx.t < 1) this.wx.t = Math.min(1, this.wx.t + dt / 3.5);
    if (this.wxPrev) {
      this.wxPrev.t -= dt / 2;
      if (this.wxPrev.t <= 0) this.wxPrev = null;
    }
    // 云漂移（世界格 / 秒，向东南）
    const n = this.map.n;
    for (const c of this.clouds) {
      c.x += c.v * dt;
      c.y += c.v * 0.35 * dt;
      if (c.x > n + 30) { c.x = -30; c.y = Math.random() * n; }
      if (c.y > n + 30) c.y = -30;
    }
    // 雨滴更新（屏幕空间）
    if (!this.rainPts) {
      this.rainPts = new Float32Array(130 * 3);
      for (let i = 0; i < 130; i++) {
        this.rainPts[i * 3] = Math.random() * (this.lw + 120);
        this.rainPts[i * 3 + 1] = Math.random() * this.lh;
        this.rainPts[i * 3 + 2] = Math.random() * 120;      // 附加速度
      }
    }
    const rp = this.rainPts;
    for (let i = 0; i < 130; i++) {
      const j = i * 3;
      rp[j] -= 64 * dt;
      rp[j + 1] += (330 + rp[j + 2]) * dt;
      if (rp[j + 1] > this.lh + 6) { rp[j + 1] = -8; rp[j] = Math.random() * (this.lw + 120); }
      if (rp[j] < -60) rp[j] += this.lw + 120;
    }
    // 雪花更新
    if (!this.snowPts) {
      this.snowPts = new Float32Array(90 * 4);
      for (let i = 0; i < 90; i++) {
        this.snowPts[i * 4] = Math.random() * this.lw;
        this.snowPts[i * 4 + 1] = Math.random() * this.lh;
        this.snowPts[i * 4 + 2] = Math.random() * 34;       // 附加速度
        this.snowPts[i * 4 + 3] = Math.random() * 6.28;     // 摆动相位
      }
    }
    const sp = this.snowPts;
    const nowSec = performance.now() / 1000;
    for (let i = 0; i < 90; i++) {
      const j = i * 4;
      sp[j] += Math.sin(nowSec * 1.3 + sp[j + 3]) * 15 * dt;
      sp[j + 1] += (26 + sp[j + 2]) * dt;
      if (sp[j + 1] > this.lh + 4) { sp[j + 1] = -4; sp[j] = Math.random() * this.lw; }
      if (sp[j] < -6) sp[j] += this.lw + 12;
      else if (sp[j] > this.lw + 6) sp[j] -= this.lw + 12;
    }
    // v6 春季樱花瓣：慢速摆动飘落（与雨雪粒子互斥呈现）
    if (!this.petalPts) {
      this.petalPts = new Float32Array(42 * 3);
      for (let i = 0; i < 42; i++) {
        this.petalPts[i * 3] = Math.random() * (this.lw + 40) - 20;
        this.petalPts[i * 3 + 1] = Math.random() * this.lh;
        this.petalPts[i * 3 + 2] = Math.random() * 6.28;   // 摆动相位
      }
    }
    const pp = this.petalPts;
    for (let i = 0; i < 42; i++) {
      const j = i * 3;
      pp[j] += Math.sin(nowSec * 0.9 + pp[j + 2]) * 11 * dt;
      pp[j + 1] += (14 + 7 * Math.sin(pp[j + 2])) * dt;
      if (pp[j + 1] > this.lh + 4) { pp[j + 1] = -4; pp[j] = Math.random() * this.lw; }
      if (pp[j] < -20) pp[j] += this.lw + 40;
      else if (pp[j] > this.lw + 20) pp[j] -= this.lw + 40;
    }

    // v16 城市节庆粒子更新：花火火箭/火花 + 孔明灯（屏幕空间，秒制 dt）
    if (this.festKind === 1) {
      if (!this.fwRockets) this.fwRockets = new Float32Array(4 * 4).fill(-1);
      if (!this.fwSparks) this.fwSparks = new Float32Array(48 * 5).fill(-1);
      const rk = this.fwRockets, sp = this.fwSparks;
      // 火花：径向散开 + 重力 + 衰减
      for (let i = 0; i < 48; i++) {
        const j = i * 5;
        if (sp[j + 4] <= 0) continue;
        sp[j] += sp[j + 2] * dt;
        sp[j + 1] += sp[j + 3] * dt;
        sp[j + 3] += 30 * dt;
        sp[j + 4] -= dt;
      }
      // 火箭：约 0.7s 发射一枚，升空到位 → 炸开 12 粒火花
      this.fwSpawnT -= dt;
      if (this.fwSpawnT <= 0) {
        this.fwSpawnT = 0.55 + Math.random() * 0.5;
        for (let i = 0; i < 4; i++) {
          if (rk[i * 4 + 2] === 0 || rk[i * 4 + 3] <= 0) {
            const j = i * 4;
            rk[j] = 20 + Math.random() * (this.lw - 40);
            rk[j + 1] = this.lh + 4;
            rk[j + 2] = -(64 + Math.random() * 30);   // vy（上升）
            rk[j + 3] = this.lh * (0.1 + Math.random() * 0.26);   // 目标高度
            break;
          }
        }
      }
      for (let i = 0; i < 4; i++) {
        const j = i * 4;
        if (rk[j + 3] <= 0) continue;                  // 空槽
        rk[j + 1] += rk[j + 2] * dt;
        if (rk[j + 1] <= rk[j + 3]) {
          // 炸开：找 12 个空火花槽填径向速度
          let filled = 0;
          const hue = Math.random();
          for (let k = 0; k < 48 && filled < 12; k++) {
            const q = k * 5;
            if (sp[q + 4] > 0) continue;
            const ang = (filled / 12) * Math.PI * 2 + Math.random() * 0.4;
            const spd = 16 + Math.random() * 26 + (hue < 0.2 ? 8 : 0);
            sp[q] = rk[j]; sp[q + 1] = rk[j + 1];
            sp[q + 2] = Math.cos(ang) * spd;
            sp[q + 3] = Math.sin(ang) * spd - 6;
            sp[q + 4] = 0.85 + Math.random() * 0.5;
            filled++;
          }
          rk[j + 3] = 0;                               // 火箭退役
        }
      }
    }
    if (this.festKind === 3) {
      if (!this.lampPts) {
        this.lampPts = new Float32Array(12 * 4);
        for (let i = 0; i < 12; i++) {
          this.lampPts[i * 4] = Math.random() * this.lw;
          this.lampPts[i * 4 + 1] = Math.random() * this.lh;
          this.lampPts[i * 4 + 2] = Math.random() * 6.28;
          this.lampPts[i * 4 + 3] = 7 + Math.random() * 7;   // 上升速度
        }
      }
      const lp = this.lampPts;
      for (let i = 0; i < 12; i++) {
        const j = i * 4;
        lp[j] += Math.sin(nowSec * 0.7 + lp[j + 2]) * 6 * dt;
        lp[j + 1] -= lp[j + 3] * dt;
        if (lp[j + 1] < -8) { lp[j + 1] = this.lh + 6; lp[j] = Math.random() * this.lw; }
      }
    }
  }

  /** 雨 / 雪粒子绘制（屏幕空间，强度 × 粒子数）；v6 + 春季樱花瓣 */
  private drawWeatherParticles(ctx: CanvasRenderingContext2D, rainI: number, snowI: number): void {
    if (rainI > 0.02 && this.rainPts) {
      const n = Math.round(130 * rainI);
      const rp = this.rainPts;
      for (let i = 0; i < n; i++) {
        const x = Math.round(rp[i * 3]), y = Math.round(rp[i * 3 + 1]);
        // 近层长雨丝 / 远层短雨丝两档
        if (i % 5 === 0) {
          ctx.fillStyle = '#8FB3E0';
          ctx.fillRect(x, y, 1, 6);
          ctx.fillStyle = '#5A7DB8';
          ctx.fillRect(x, y + 6, 1, 2);
        } else {
          ctx.fillStyle = '#5A7DB8';
          ctx.fillRect(x, y, 1, 4);
        }
      }
    }
    if (snowI > 0.02 && this.snowPts) {
      const n = Math.round(90 * snowI);
      const sp = this.snowPts;
      for (let i = 0; i < n; i++) {
        const x = Math.round(sp[i * 4]), y = Math.round(sp[i * 4 + 1]);
        ctx.fillStyle = i % 3 === 0 ? '#D6E9F5' : '#F4F2E8';
        if (i % 4 === 0) ctx.fillRect(x, y, 1, 2);
        else ctx.fillRect(x, y, 1, 1);
      }
    }
    // v6：春季樱花瓣（无雨雪时飘落，粉白两色 + 慢速摆动）
    if (this.season === 0 && rainI < 0.3 && snowI < 0.3) {
      const pp = this.petalPts;
      if (pp) {
        for (let i = 0; i < 42; i++) {
          const x = Math.round(pp[i * 3]), y = Math.round(pp[i * 3 + 1]);
          ctx.fillStyle = i % 3 === 0 ? '#E8A4B4' : '#C97B93';
          if (i % 4 === 0) {
            // 近层花瓣 2×2（更醒目）
            ctx.fillRect(x, y, 2, 2);
            ctx.fillStyle = '#F1E5C0';
            ctx.fillRect(x + 1, y + 1, 1, 1);
          } else {
            ctx.fillRect(x, y, 1, 1);
            if (i % 5 === 0) ctx.fillRect(x + 1, y + 1, 1, 1);
          }
        }
      }
    }
  }

  /** v16 城市节庆粒子绘制（屏幕空间，最上层）：
   *  樱花祭 = 花瓣加密双层 / 花火大会 = 火箭升空炸火花 / 丰收节 = 金叶飘落 / 暖灯节 = 孔明灯缓升 */
  private drawFestivalParticles(ctx: CanvasRenderingContext2D): void {
    if (this.festKind < 0) return;
    const nowSec = performance.now() / 1000;
    if (this.festKind === 0 || this.festKind === 2) {
      // 花瓣 / 金叶：复用樱花瓣粒子（更新在 stepWeather），节日画双层加密
      const pp = this.petalPts;
      if (pp) {
        const gold = this.festKind === 2;
        for (let pass = 0; pass < 2; pass++) {
          for (let i = 0; i < 42; i++) {
            const j = i * 3;
            const x = Math.round(pp[j] + (pass ? Math.sin(nowSec + pp[j + 2]) * 5 : 0));
            const y = Math.round(pp[j + 1] + (pass ? 7 : 0));
            if (gold) {
              ctx.fillStyle = i % 3 === 0 ? '#F2D24B' : i % 3 === 1 ? '#CFB379' : '#B96A4E';
            } else {
              ctx.fillStyle = i % 3 === 0 ? '#F1C7D2' : i % 3 === 1 ? '#E8A4B4' : '#C97B93';
            }
            if (i % 4 === 0) {
              ctx.fillRect(x, y, 2, 2);
              ctx.fillStyle = gold ? '#F1E5C0' : '#FDEEF2';
              ctx.fillRect(x + 1, y + 1, 1, 1);
            } else {
              ctx.fillRect(x, y, 1, 1);
            }
          }
        }
      }
    } else if (this.festKind === 1 && this.fwRockets && this.fwSparks) {
      // 花火：火箭拖尾 + 炸开火花（五色轮换 + 余辉闪烁）
      const rk = this.fwRockets, sp = this.fwSparks;
      for (let i = 0; i < 4; i++) {
        const j = i * 4;
        if (rk[j + 3] <= 0) continue;
        const x = Math.round(rk[j]), y = Math.round(rk[j + 1]);
        ctx.fillStyle = '#F4F2E8';
        ctx.fillRect(x, y, 1, 3);
        ctx.fillStyle = '#F2D24B';
        ctx.fillRect(x, y + 3, 1, 1);
        if (Math.floor(nowSec * 20) % 2 === 0) ctx.fillRect(x - 1, y + 1, 1, 1);
      }
      const PAL = ['#E05548', '#F2D24B', '#5BC8B8', '#E8A4B4', '#F4F2E8'];
      for (let i = 0; i < 48; i++) {
        const q = i * 5;
        const life = sp[q + 4];
        if (life <= 0) continue;
        const x = Math.round(sp[q]), y = Math.round(sp[q + 1]);
        // 余辉闪烁：后 40% 生命隔帧熄灭
        if (life < 0.4 && Math.floor(nowSec * 24 + i) % 2 === 0) continue;
        ctx.fillStyle = PAL[i % 5];
        if (life > 0.55) {
          ctx.fillRect(x - 1, y, 3, 1);
          ctx.fillRect(x, y - 1, 1, 3);
        } else {
          ctx.fillRect(x, y, 1, 1);
        }
      }
    } else if (this.festKind === 3 && this.lampPts) {
      // 孔明灯：暖光核 + 摇曳光晕 + 缓慢上升
      const lp = this.lampPts;
      for (let i = 0; i < 12; i++) {
        const j = i * 4;
        const x = Math.round(lp[j]), y = Math.round(lp[j + 1]);
        const flick = Math.sin(nowSec * 3 + lp[j + 2]) > 0 ? 1 : 0;
        ctx.fillStyle = flick ? '#E05548' : '#B96A4E';
        ctx.fillRect(x - 1, y - 1, 4, 4);
        ctx.fillStyle = '#F2D24B';
        ctx.fillRect(x, y, 2, 2);
        ctx.fillStyle = '#F1E5C0';
        ctx.fillRect(x, y, 1, 1);
      }
    }
  }

  /** 云影精灵（96×64 噪声团块，惰性生成） */
  private ensureCloudSp(): HTMLCanvasElement {
    if (this.cloudSp) return this.cloudSp;
    const cv = document.createElement('canvas');
    cv.width = 96; cv.height = 64;
    const ctx = cv.getContext('2d')!;
    ctx.fillStyle = '#0B0F24';
    // 5 团椭圆噪声聚合 → 像素风大云影
    for (let k = 0; k < 5; k++) {
      const cx = 18 + Math.random() * 60, cy = 20 + Math.random() * 24;
      const rx = 14 + Math.random() * 22, ry = 8 + Math.random() * 12;
      for (let y = 0; y < 64; y++) {
        for (let x = 0; x < 96; x++) {
          const d = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2;
          if (d < 1 && Math.random() < 0.62) ctx.fillRect(x, y, 1, 1);
        }
      }
    }
    this.cloudSp = cv;
    return cv;
  }

  /** 云影绘制（3 团 ×3 放大 ≈ 288×192，覆盖一切顶面） */
  private drawCloudShade(ctx: CanvasRenderingContext2D, t: number): void {
    const cloudI = this.wxIntensity('cloudy');
    const clearI = this.wx.kind === 'clear' ? this.wx.t : 0;
    const alpha = 0.048 * clearI + 0.075 * cloudI;   // 晴天淡云影 / 多云更浓
    if (alpha < 0.01) return;
    const sp = this.ensureCloudSp();
    ctx.globalAlpha = alpha;
    for (let i = 0; i < this.clouds.length; i++) {
      const c = this.clouds[i];
      const sx = this.w2sx(c.x, c.y), sy = this.w2sy(c.x, c.y);
      if (sx < -320 || sx > this.lw + 320 || sy < -240 || sy > this.lh + 240) continue;
      // 逐团轻微明度差（假深度）
      ctx.globalAlpha = alpha * (0.82 + 0.12 * i);
      ctx.drawImage(sp, Math.round(sx - 144), Math.round(sy - 96), 288, 192);
    }
    ctx.globalAlpha = 1;
    void t;
  }

  /** 雨天水面涟漪：白点闪斑（相位 160ms 一变，贴水格随机位置） */
  private drawRipples(ctx: CanvasRenderingContext2D, now: number, dcx: number, dcy: number): void {
    const rainI = this.wxIntensity('rain');
    if (rainI < 0.05 || !this.waterList.length) return;
    const phase = Math.floor(now / 160);
    const n = Math.max(1, Math.floor(this.waterList.length / 6));
    ctx.fillStyle = 'rgba(244,242,232,0.55)';
    for (let k = 0; k < n; k++) {
      const i = (hash2(phase, k, 77) * this.waterList.length) | 0;
      const w = this.waterList[i];
      const r1 = hash2(w.tx + phase, w.ty, 31), r2 = hash2(w.tx, w.ty + phase, 37);
      const sx = w.sx + dcx + (r1 - 0.5) * 26;
      const sy = w.sy + dcy + 8 + (r2 - 0.5) * 10;
      if (sx < 0 || sx > this.lw || sy < 0 || sy > this.lh) continue;
      ctx.fillRect(Math.round(sx), Math.round(sy), 2, 1);
    }
    ctx.fillStyle = 'rgba(244,242,232,0.3)';
    for (let k = 0; k < n; k++) {
      const i = (hash2(phase + 7, k, 79) * this.waterList.length) | 0;
      const w = this.waterList[i];
      const r1 = hash2(w.tx, w.ty + phase, 41), r2 = hash2(w.tx + phase, w.ty, 43);
      const sx = w.sx + dcx + (r1 - 0.5) * 26;
      const sy = w.sy + dcy + 8 + (r2 - 0.5) * 10;
      if (sx < 0 || sx > this.lw || sy < 0 || sy > this.lh) continue;
      ctx.fillRect(Math.round(sx), Math.round(sy), 2, 1);
    }
  }

  /** 事件事故特效：火灾烟柱 + 火点（活动 bad 事件带 fx 时） */
  private drawEventFx(ctx: CanvasRenderingContext2D, now: number): void {
    const eco = this.tycoon;
    if (!eco) return;
    for (const ev of eco.events) {
      // v12：烟柱火点仅火灾（疫病 fx 只作救护车出动目的地）；v24：火势随 heat 三档增燃，标签带过火栋数
      if (!ev.fx || ev.key !== 'fire') continue;
      const sx = this.w2sx(ev.fx.x, ev.fx.y);
      const sy = this.w2sy(ev.fx.x, ev.fx.y) + this.hOfs(ev.fx.x, ev.fx.y);
      // v24 三档火势：小火（<0.55）/ 燃烧（<0.85）/ 烈火（≥0.85）：火苗簇更大更白热、烟柱更粗
      const heat = ev.heat ?? 0.5;
      const stage = heat < 0.55 ? 0 : heat < 0.85 ? 1 : 2;
      const FLICK = 110 - stage * 25;
      const fl = Math.floor(now / FLICK) % 2 === 0;
      const ORANGE = stage === 2 ? '#F4F2E8' : '#E05548';   // 烈火白热化
      const CORE = stage === 0 ? '#F4F2E8' : stage === 1 ? '#F4F2E8' : '#F7C848';
      if (stage === 0) {
        // 小火：两簇小火苗交替闪
        ctx.fillStyle = fl ? ORANGE : '#F4F2E8';
        ctx.fillRect(Math.round(sx - 4), Math.round(sy - 38), 3, 3);
        ctx.fillStyle = fl ? '#F4F2E8' : ORANGE;
        ctx.fillRect(Math.round(sx + 2), Math.round(sy - 34), 2, 2);
      } else if (stage === 1) {
        // 燃烧：三簇中焰 + 火舌拉高
        ctx.fillStyle = fl ? ORANGE : '#C93A2E';
        ctx.fillRect(Math.round(sx - 6), Math.round(sy - 42), 4, 5);
        ctx.fillRect(Math.round(sx + 1), Math.round(sy - 44), 3, 6);
        ctx.fillStyle = fl ? '#F7C848' : ORANGE;
        ctx.fillRect(Math.round(sx - 2), Math.round(sy - 47), 3, 5);
        ctx.fillStyle = CORE;
        ctx.fillRect(Math.round(sx - 3), Math.round(sy - 40), 2, 3);
      } else {
        // 烈火：四簇高焰白热核心 + 火星迸溅
        ctx.fillStyle = fl ? ORANGE : '#C93A2E';
        ctx.fillRect(Math.round(sx - 8), Math.round(sy - 46), 5, 7);
        ctx.fillRect(Math.round(sx + 3), Math.round(sy - 48), 4, 8);
        ctx.fillRect(Math.round(sx - 1), Math.round(sy - 52), 3, 9);
        ctx.fillStyle = fl ? '#F7C848' : '#E05548';
        ctx.fillRect(Math.round(sx - 4), Math.round(sy - 50), 3, 7);
        ctx.fillStyle = CORE;
        ctx.fillRect(Math.round(sx - 2), Math.round(sy - 46), 2, 4);
        // 火星：双相迸溅
        ctx.fillStyle = fl ? '#F7C848' : '#E05548';
        ctx.fillRect(Math.round(sx - 10), Math.round(sy - 54 - (fl ? 0 : 2)), 2, 2);
        ctx.fillRect(Math.round(sx + 7), Math.round(sy - 50 - (fl ? 2 : 0)), 2, 2);
      }
      // 烟柱：两股错相上升循环（复用烟囱烟精灵 3 帧；烈火三股加粗）
      const smoke = this.book.smoke;
      if (smoke.length) {
        const cols = stage === 2 ? 3 : 2;
        for (let c = 0; c < cols; c++) {
          const fr = Math.floor(now / 300 + c) % smoke.length;
          const s = smoke[fr];
          const rise = (now / 46 + c * 11) % 26;
          ctx.globalAlpha = 0.85 - rise / 34;
          ctx.drawImage(s.cv, Math.round(sx - 6 + c * 8 + s.ox), Math.round(sy - 36 - rise + s.oy));
          ctx.globalAlpha = 1;
        }
      }
      // 事件标签（v24：过火多栋时显示 ×N）
      ctx.font = 'bold 8px monospace';
      ctx.textAlign = 'center';
      const nBurn = (ev.spreadN ?? 0) + 1;
      const label = nBurn > 1 ? `烈火×${nBurn}!` : `${ev.name}!`;
      const w = ctx.measureText(label).width + 6;
      ctx.fillStyle = 'rgba(11,15,36,0.92)';
      ctx.fillRect(Math.round(sx - w / 2), Math.round(sy - 56), Math.round(w), 11);
      ctx.fillStyle = stage === 2 ? '#F7C848' : '#F4F2E8';
      ctx.fillText(label, Math.round(sx), Math.round(sy - 48));
      ctx.textAlign = 'left';
    }
    // v23：犯罪现场 —— 红色惊叹号闪烁 + 事件标签（与火灾同款标签框，警示色换红）
    // v25：窃贼实景 —— 作案中蒙面剪影从建筑窗边探身翻撬（闪动）；警车到场人赃并获后
    //      变抱头蹲地（静态、黯淡），事件收尾一并消失
    for (const ev of eco.events) {
      if (!ev.fx || ev.key !== 'crime') continue;
      const sx = this.w2sx(ev.fx.x, ev.fx.y);
      const sy = this.w2sy(ev.fx.x, ev.fx.y) + this.hOfs(ev.fx.x, ev.fx.y);
      const fl = Math.floor(now / 160) % 2 === 0;
      // ---- v25 窃贼剪影（覆盖在建筑之上）----
      const caught = ev.resolved === true || ev.left <= 3.6;
      if (!caught) {
        // 作案中：半身探出「窗」外，蒙面 + 白眼罩，手脚交替蹬翻
        ctx.fillStyle = '#23252E';                                   // 蒙面人形
        ctx.fillRect(Math.round(sx + 6), Math.round(sy - 30), 4, 4); // 头
        ctx.fillRect(Math.round(sx + 7), Math.round(sy - 26), 3, 9); // 半探身（下半藏进窗内）
        ctx.fillStyle = '#F4F2E8';                                   // 白眼罩
        ctx.fillRect(Math.round(sx + 6), Math.round(sy - 29), 4, 1);
        ctx.fillStyle = '#23252E';                                   // 攀爬的手：交替左右扒窗沿
        ctx.fillRect(Math.round(sx + (fl ? 4 : 11)), Math.round(sy - 25), 2, 2);
        ctx.fillRect(Math.round(sx + (fl ? 9 : 7)), Math.round(sy - 17), 2, 4); // 蹬腿翻墙
      } else {
        // 人赃并获：抱头蹲地（静态，建筑脚边），头压低
        ctx.fillStyle = '#1C2A44';                                   // 黯淡藏青 = 被制服
        ctx.fillRect(Math.round(sx + 9), Math.round(sy - 14), 3, 3);  // 头
        ctx.fillRect(Math.round(sx + 8), Math.round(sy - 11), 5, 8);  // 蹲身
        ctx.fillStyle = '#1C2A44';                                   // 双手抱头
        ctx.fillRect(Math.round(sx + 7), Math.round(sy - 13), 2, 2);
        ctx.fillRect(Math.round(sx + 12), Math.round(sy - 13), 2, 2);
        ctx.fillStyle = '#F4F2E8';                                   // 眼罩仍在（蒙面到案）
        ctx.fillRect(Math.round(sx + 9), Math.round(sy - 13), 3, 1);
      }
      ctx.fillStyle = fl ? '#E05548' : '#8B2A20';
      ctx.fillRect(Math.round(sx - 1), Math.round(sy - 40), 3, 5);      // 惊叹号竖笔
      ctx.fillRect(Math.round(sx - 1), Math.round(sy - 33), 3, 2);      // 点
      ctx.font = 'bold 8px monospace';
      ctx.textAlign = 'center';
      const label = caught ? '人赃并获!' : `${ev.name}!`;
      const w = ctx.measureText(label).width + 6;
      ctx.fillStyle = 'rgba(11,15,36,0.92)';
      ctx.fillRect(Math.round(sx - w / 2), Math.round(sy - 56), Math.round(w), 11);
      ctx.fillStyle = caught ? '#F7C848' : (fl ? '#F4F2E8' : '#F2B8B0');
      ctx.fillText(label, Math.round(sx), Math.round(sy - 48));
      ctx.textAlign = 'left';
    }
  }

  /** v18 地震震屏：amp px 振幅，约 4.5 秒随机抖动后衰减归零 */
  startQuake(amp: number): void {
    this.quakeAmp = Math.max(2, Math.min(12, amp));
    this.quakeDur = 4.5;
    this.quakeT = this.quakeDur;
  }

  /** v18 洪水淹没层：临水领地格（距水曼哈顿 ≤ 2）半透明水面 + 波光 + 岸线白沫
   *  绘制顺序：桥面之上 · 建筑/行人之下（楼如立在泽国中）
   *  淹没格打包为 idx*2 + (深度-1)，随 map.version 变化失效重算 */
  private drawFloodOverlay(ctx: CanvasRenderingContext2D, t: number): void {
    const eco = this.tycoon;
    if (!eco || !eco.events.some(e => e.key === 'flood')) return;
    const m = this.map, n = m.n;
    if (!this.floodTiles || this.floodVer !== m.version) {
      this.floodVer = m.version;
      this.floodTiles = [];
      for (let y = 2; y < n - 2; y++) {
        for (let x = 2; x < n - 2; x++) {
          const i = y * n + x;
          if (m.terr[i] === 1 || m.road[i] === 2 || !eco.ownedAt(x, y)) continue;
          let dmin = 9;
          for (let dy = -2; dy <= 2; dy++) {
            for (let dx = -2; dx <= 2; dx++) {
              if (Math.abs(dx) + Math.abs(dy) > 2) continue;
              if (m.terr[(y + dy) * n + (x + dx)] === 1) {
                dmin = Math.abs(dx) + Math.abs(dy);
                break;
              }
            }
            if (dmin <= 1) break;
          }
          if (dmin <= 2) this.floodTiles.push(i * 2 + (dmin - 1));
        }
      }
    }
    if (!this.floodTiles.length) return;
    const rise = (t % 2400) / 2400;                     // 洪位 2.4s 缓慢涨落（呼吸感）
    const lift = Math.sin(rise * Math.PI) * 2;
    for (const v of this.floodTiles) {
      const i = v >> 1, depth = (v & 1) + 1;
      const tx = i % n, ty = (i / n) | 0;
      const sx = this.w2sx(tx, ty);
      const sy = this.w2sy(tx, ty) + this.hOfs(tx, ty);
      if (sx < -40 || sx > this.lw + 40 || sy < -40 || sy > this.lh + 40) continue;
      // 水面菱形（深水贴岸浓 · 浅水远岸淡；涨落抬升一点高度）
      const yTop = sy - 8 + lift * depth * 0.5;
      ctx.fillStyle = depth === 1 ? 'rgba(40,74,128,0.62)' : 'rgba(54,94,152,0.40)';
      ctx.beginPath();
      ctx.moveTo(sx - 16, sy);
      ctx.lineTo(sx, yTop);
      ctx.lineTo(sx + 16, sy);
      ctx.lineTo(sx, sy + 8);
      ctx.closePath();
      ctx.fill();
      // 波光：两道错相横线随时间明灭
      const ph = (t / 650 + tx * 0.7 + ty * 1.3) % 3;
      const gl = ph < 1 ? 1 - ph : 0;
      if (gl > 0.05) {
        ctx.globalAlpha = 0.5 * gl;
        ctx.fillStyle = '#9CC4EA';
        const wy = sy - 3 + depth * 2 - lift;
        ctx.fillRect(Math.round(sx - 9 + depth * 2), Math.round(wy), 6, 1);
        ctx.fillRect(Math.round(sx + 3 - depth * 2), Math.round(wy - 2), 5, 1);
        ctx.globalAlpha = 1;
      }
      // 岸线白沫（深水格朝水面一侧的白点）
      if (depth === 1) {
        const fp = (t / 420 + tx * 2.1 + ty * 0.9) % 4;
        const fa = fp < 2 ? 0.9 - fp * 0.4 : 0;
        if (fa > 0.05) {
          ctx.globalAlpha = fa;
          ctx.fillStyle = '#E8F2FA';
          ctx.fillRect(Math.round(sx - 4), Math.round(sy - 6), 2, 1);
          ctx.fillRect(Math.round(sx + 2), Math.round(sy - 4), 2, 1);
          ctx.globalAlpha = 1;
        }
      }
    }
  }

  /** v21：垃圾堆积层 —— 清运不到的建筑门口垃圾成堆（黑袋/纸箱/瓶罐/鱼骨点缀 +
   *  贴地污渍；重灾 ≥80 浓度：杂物翻倍 + 苍蝇盘旋 + 臭气绿雾）。画在建筑之上、雾霾之下 ——
   *  雾能罩住垃圾，垃圾罩不住雾；垃圾是实体贴地物，比雾更「近」更扎眼 */
  private drawWasteOverlay(ctx: CanvasRenderingContext2D, t: number): void {
    const eco = this.tycoon;
    if (!eco || eco.wasteField.size === 0) return;
    const n = this.map.n;
    for (const [i, c] of eco.wasteField) {
      const tx = i % n, ty = (i / n) | 0;
      const sx = this.w2sx(tx, ty);
      const sy = this.w2sy(tx, ty) + this.hOfs(tx, ty);
      if (sx < -40 || sx > this.lw + 40 || sy < -56 || sy > this.lh + 40) continue;
      const heavy = c >= WASTE_LV2;
      // 贴地污渍（半透明橄榄绿菱形 —— 污水横流的感觉；比 v19 雾霾更浓一档：贴地实体感）
      ctx.fillStyle = heavy ? 'rgba(66,74,36,0.46)' : 'rgba(70,78,40,0.30)';
      ctx.beginPath();
      ctx.moveTo(sx - 17, sy + 3);
      ctx.lineTo(sx, sy + 11);
      ctx.lineTo(sx + 17, sy + 3);
      ctx.lineTo(sx, sy - 5);
      ctx.closePath();
      ctx.fill();
      // 垃圾杂物（确定性伪随机摆位：黑袋 / 纸箱 / 瓶罐 / 鱼骨 —— 大件高对比；
      //   摆在楼基之前 sy+5..16：读作「堆在门口」而非楼身贴花）
      const items = heavy ? 6 : 3;
      for (let k = 0; k < items; k++) {
        const h = (tx * 7 + ty * 13 + k * 29) % 97;
        const ox = -12 + ((h * 5) % 25);
        const oy = 5 + ((h * 3) % 8) + (k > 2 ? 4 : 0);
        const kind = h % 4;
        const ix = Math.round(sx + ox), iy = Math.round(sy + oy);
        if (kind === 0) {          // 黑垃圾袋（束口鼓包 + 顶部高光）
          ctx.fillStyle = 'rgba(38,42,50,0.95)';
          ctx.fillRect(ix, iy, 8, 6);
          ctx.fillRect(ix + 2, iy - 2, 3, 2);
          ctx.fillStyle = 'rgba(96,104,120,0.95)';
          ctx.fillRect(ix + 1, iy + 1, 2, 1);
          ctx.fillStyle = 'rgba(18,20,26,0.95)';
          ctx.fillRect(ix + 1, iy + 5, 5, 1);
        } else if (kind === 1) {   // 纸箱（摊盖 + 胶带十字 + 深色描边）
          ctx.fillStyle = 'rgba(184,146,90,0.95)';
          ctx.fillRect(ix, iy, 9, 6);
          ctx.fillStyle = 'rgba(222,192,140,0.95)';
          ctx.fillRect(ix + 1, iy + 1, 7, 1);
          ctx.fillStyle = 'rgba(110,84,52,0.95)';
          ctx.fillRect(ix, iy, 9, 1);
          ctx.fillRect(ix + 4, iy, 1, 6);
        } else if (kind === 2) {   // 瓶瓶罐罐（青瓶 + 棕罐 + 白盖）
          ctx.fillStyle = 'rgba(88,152,156,0.95)';
          ctx.fillRect(ix, iy, 3, 5);
          ctx.fillStyle = 'rgba(196,120,64,0.95)';
          ctx.fillRect(ix + 4, iy + 1, 3, 4);
          ctx.fillStyle = 'rgba(240,238,226,0.95)';
          ctx.fillRect(ix, iy - 1, 3, 1);
        } else {                   // 鱼骨（白刺 + 歪斜脊骨）
          ctx.fillStyle = 'rgba(238,236,224,0.95)';
          ctx.fillRect(ix, iy, 7, 1);
          ctx.fillRect(ix + 3, iy - 1, 1, 1);
          ctx.fillRect(ix + 1, iy + 1, 1, 1);
          ctx.fillRect(ix + 5, iy + 1, 1, 1);
        }
      }
      // 重灾区：臭气绿雾（两缕半透明缓升 —— 隔着屏幕都闻得到）+ 苍蝇盘旋
      if (heavy) {
        const ph = t / 1700 + (tx + ty) * 0.7;
        for (let f = 0; f < 2; f++) {
          const rise = (t / 46 + f * 13 + ((tx * 5 + ty * 3) % 11)) % 18;
          ctx.fillStyle = `rgba(128,164,66,${Math.max(0, 0.34 - rise / 56).toFixed(3)})`;
          const wx = Math.round(sx - 4 + f * 9 + Math.sin(ph + f * 2) * 3);
          ctx.fillRect(wx, Math.round(sy - 2 - rise), 5, 3);
          ctx.fillRect(wx + 1, Math.round(sy - 4 - rise), 3, 2);
        }
        ctx.fillStyle = 'rgba(26,28,24,0.9)';
        for (let f = 0; f < 2; f++) {
          const fp = t / 240 + (tx + ty * 3 + f * 2) * 1.7;
          const fr = 3 + f * 2;
          ctx.fillRect(Math.round(sx + Math.cos(fp) * fr), Math.round(sy - 2 + Math.sin(fp * 1.6) * 2), 1, 1);
        }
      }
    }
  }

  /** v23：治安盲区层 —— 巡防半径外的商铺与住宅铺冷蓝阴影菱形（巷子黑得渗人的意象）+
 *  盲区商铺顶上红色警示点缓慢明灭（贼惦记的地方）。画在事件特效之下、学区层之下：
 *  盲区是环境底色，学光是氛围，实体特效最上 */
  private drawSecOverlay(ctx: CanvasRenderingContext2D, t: number): void {
    const eco = this.tycoon;
    if (!eco || eco.crimeField.size === 0) return;
    const n = this.map.n;
    for (const i of eco.crimeField) {
      const tx = i % n, ty = (i / n) | 0;
      const sx = this.w2sx(tx, ty);
      const sy = this.w2sy(tx, ty) + this.hOfs(tx, ty);
      if (sx < -40 || sx > this.lw + 40 || sy < -56 || sy > this.lh + 40) continue;
      // 冷蓝阴影（贴地菱形 —— 巡逻灯照不到的角落）
      ctx.fillStyle = 'rgba(34,44,78,0.26)';
      ctx.beginPath();
      ctx.moveTo(sx - 18, sy + 2);
      ctx.lineTo(sx, sy + 11);
      ctx.lineTo(sx + 18, sy + 2);
      ctx.lineTo(sx, sy - 7);
      ctx.closePath();
      ctx.fill();
      // 盲区商铺：红色警示点缓闪（楼顶上空 —— 贼惦记的地方）
      if (eco.crimeComField.has(i)) {
        const a = 0.45 + 0.55 * Math.sin(t / 900 + (tx * 3 + ty * 5) * 0.7);
        if (a > 0.06) {
          ctx.fillStyle = `rgba(224,85,72,${a.toFixed(3)})`;
          ctx.fillRect(Math.round(sx - 1), Math.round(sy - 46), 3, 3);
          ctx.fillStyle = `rgba(224,85,72,${(a * 0.4).toFixed(3)})`;
          ctx.fillRect(Math.round(sx - 2), Math.round(sy - 47), 5, 5);
        }
      }
    }
  }

  /** v24：消防盲区层 —— 水网半径外的建筑铺暖橙焦枯阴影菱形（晒得发脆的屋瓦意象）+
 *  盲区建筑屋顶橙色小火苗警示双帧闪（火星一闪一闪的地方，离烧起来只差一阵风）。
 *  画法与治安冷蓝层同层位：盲区是环境底色；暖橙与冷蓝色相错开互不干扰 */
  private drawFireOverlay(ctx: CanvasRenderingContext2D, t: number): void {
    const eco = this.tycoon;
    if (!eco || eco.fireMissField.size === 0) return;
    const n = this.map.n;
    for (const i of eco.fireMissField) {
      const tx = i % n, ty = (i / n) | 0;
      const sx = this.w2sx(tx, ty);
      const sy = this.w2sy(tx, ty) + this.hOfs(tx, ty);
      if (sx < -40 || sx > this.lw + 40 || sy < -56 || sy > this.lh + 40) continue;
      // 暖橙焦枯阴影（贴地菱形 —— 与治安冷蓝错开：只画消防盲区，且更淡）
      ctx.fillStyle = 'rgba(122,58,22,0.18)';
      ctx.beginPath();
      ctx.moveTo(sx - 18, sy + 2);
      ctx.lineTo(sx, sy + 11);
      ctx.lineTo(sx + 18, sy + 2);
      ctx.lineTo(sx, sy - 7);
      ctx.closePath();
      ctx.fill();
      // 屋顶橙色火苗警示：双帧闪（小火苗形状：焰体 + 焰心）
      const on = Math.floor(t / 650 + (tx * 5 + ty * 3) * 0.9) % 2 === 0;
      if (on) {
        ctx.fillStyle = 'rgba(240,140,50,0.92)';
        ctx.fillRect(Math.round(sx - 1), Math.round(sy - 42), 3, 4);   // 焰体
        ctx.fillRect(Math.round(sx - 2), Math.round(sy - 40), 5, 2);   // 焰底
        ctx.fillStyle = 'rgba(247,200,72,0.95)';
        ctx.fillRect(Math.round(sx - 1), Math.round(sy - 41), 2, 2);   // 焰心
      }
    }
  }

  /** v22：学区层 —— 学区内住宅淡金光罩（呼吸，清晨阳光洒在校园的感觉）+
   *  白色书页小方片从楼顶旋转飘落（书声琅琅的氛围粒子）。
   *  画在垃圾层之下：光是氛围底色，垃圾是贴地实体，垃圾更「近」 */
  private drawEduOverlay(ctx: CanvasRenderingContext2D, t: number): void {
    const eco = this.tycoon;
    if (!eco || eco.eduField.size === 0) return;
    const n = this.map.n;
    for (const i of eco.eduField) {
      const tx = i % n, ty = (i / n) | 0;
      const sx = this.w2sx(tx, ty);
      const sy = this.w2sy(tx, ty) + this.hOfs(tx, ty);
      if (sx < -40 || sx > this.lw + 40 || sy < -56 || sy > this.lh + 40) continue;
      // 金色光罩（呼吸 —— 学区房自带光环；v19 教训：金叠绿草对比度不足，
      //   alpha 提到 0.20-0.28 + 内核提亮，远看一片暖金学苑区）
      const br = 0.75 + 0.35 * Math.sin(t / 1300 + (tx + ty) * 0.8);
      ctx.fillStyle = `rgba(244,208,96,${(0.24 * br).toFixed(3)})`;
      ctx.beginPath();
      ctx.moveTo(sx - 19, sy + 2);
      ctx.lineTo(sx, sy + 12);
      ctx.lineTo(sx + 19, sy + 2);
      ctx.lineTo(sx, sy - 8);
      ctx.closePath();
      ctx.fill();
      // 内核提亮（楼脚一抹浓金 —— 对比锚点）
      ctx.fillStyle = `rgba(252,232,150,${(0.16 * br).toFixed(3)})`;
      ctx.beginPath();
      ctx.moveTo(sx - 9, sy + 2);
      ctx.lineTo(sx, sy + 7);
      ctx.lineTo(sx + 9, sy + 2);
      ctx.lineTo(sx, sy - 3);
      ctx.closePath();
      ctx.fill();
      // 书页两枚（确定性伪随机相位，旋转飘落 2.8s 一轮）
      for (let k = 0; k < 2; k++) {
        const ph = ((t / 2800) + k * 0.5 + ((tx * 7 + ty * 13) % 17) / 17) % 1;
        const px = sx - 6 + k * 12 + Math.sin(ph * Math.PI * 2) * 4;
        const py = sy - 30 + ph * 34;
        const a = ph < 0.15 ? ph / 0.15 : ph > 0.85 ? (1 - ph) / 0.15 : 1;
        if (a <= 0.02) continue;
        ctx.fillStyle = `rgba(248,246,236,${(0.85 * a).toFixed(3)})`;
        ctx.fillRect(Math.round(px), Math.round(py), 3, 2);
        ctx.fillStyle = `rgba(214,196,150,${(0.7 * a).toFixed(3)})`;
        ctx.fillRect(Math.round(px) + 1, Math.round(py), 1, 2);
      }
    }
  }

  /** v19：雾霾层 —— 污染空间场可视化（浓度 ≥45 的格铺暖土黄雾菱形，随呼吸波动 +
   *  随风缓漂；重污染 ≥75 棕褐浓雾 + 复用烟囱烟精灵的缓升烟团 —— 远看连绵霾带，
   *  近看烟霭蒸腾；笼罩建筑但在事件特效之下，随昼夜一起压暗） */
  private drawSmogOverlay(ctx: CanvasRenderingContext2D, t: number): void {
    const eco = this.tycoon;
    if (!eco || eco.smogField.size === 0) return;
    const n = this.map.n;
    const smoke = this.book.smoke;
    for (const [i, c] of eco.smogField) {
      const tx = i % n, ty = (i / n) | 0;
      const sx = this.w2sx(tx, ty);
      const sy = this.w2sy(tx, ty) + this.hOfs(tx, ty);
      if (sx < -48 || sx > this.lw + 48 || sy < -64 || sy > this.lh + 48) continue;
      const heavy = c >= 75;
      const k = Math.min(1, (c - 45) / 55);                       // 浓度梯度 0..1
      const br = 0.82 + 0.18 * Math.sin(t / 1100 + (tx + ty) * 0.9);   // 呼吸
      const drift = Math.sin(t / 2600 + ty * 0.21) * 3;               // 随风缓漂
      // 下层贴地雾（主体；暖土黄在绿草上有对比，棕褐留给重灾区）
      ctx.fillStyle = heavy
        ? `rgba(110,92,60,${((0.30 + 0.16 * k) * br).toFixed(3)})`
        : `rgba(205,178,98,${((0.30 + 0.17 * k) * br).toFixed(3)})`;
      ctx.beginPath();
      ctx.moveTo(sx - 16 + drift, sy);
      ctx.lineTo(sx + drift, sy - 8);
      ctx.lineTo(sx + 16 + drift, sy);
      ctx.lineTo(sx + drift, sy + 8);
      ctx.closePath();
      ctx.fill();
      // 上层稀薄雾（抬高 7px，遮住建物下部 —— 体积感）
      ctx.fillStyle = heavy
        ? `rgba(110,92,60,${(0.13 * br).toFixed(3)})`
        : `rgba(196,172,106,${(0.10 * br).toFixed(3)})`;
      ctx.beginPath();
      ctx.moveTo(sx - 16 + drift, sy - 7);
      ctx.lineTo(sx + drift, sy - 15);
      ctx.lineTo(sx + 16 + drift, sy - 7);
      ctx.lineTo(sx + drift, sy + 1);
      ctx.closePath();
      ctx.fill();
      // 烟霭尘斑（三团错位颗粒，随时间游移 —— 浮尘质感；轻雾的可见性主力）
      const ph = t / 1400 + (tx * 0.37 + ty * 0.61);
      const b1x = Math.round(sx - 8 + Math.sin(ph) * 3 + drift);
      const b1y = Math.round(sy - 3 + Math.cos(ph * 1.3) * 2);
      const b2x = Math.round(sx + 3 + Math.cos(ph * 0.8) * 3 + drift);
      const b2y = Math.round(sy - 8 + Math.sin(ph * 1.1) * 2);
      const b3x = Math.round(sx - 2 + Math.sin(ph * 1.7) * 4 + drift);
      const b3y = Math.round(sy + 1 + Math.cos(ph * 0.6) * 2);
      ctx.fillStyle = heavy
        ? `rgba(80,66,44,${(0.26 * br).toFixed(3)})`
        : `rgba(168,142,78,${(0.30 * br).toFixed(3)})`;
      ctx.fillRect(b1x, b1y, 8, 3);
      ctx.fillRect(b2x, b2y, 7, 3);
      ctx.fillRect(b3x, b3y, 6, 2);
      // 重灾区：缓升烟团（复用烟囱三帧精灵；错相循环不齐步）
      if (heavy && smoke.length) {
        const c0 = ((tx * 7 + ty * 13) % 17) / 17;
        const fr = Math.floor(t / 300 + c0 * 3) % smoke.length;
        const s = smoke[fr];
        const rise = (t / 52 + c0 * 26) % 24;
        ctx.globalAlpha = Math.max(0, (0.55 - rise / 44) * br);
        ctx.drawImage(s.cv, Math.round(sx - 5 + drift + s.ox), Math.round(sy - 10 - rise + s.oy));
        ctx.globalAlpha = 1;
      }
    }
  }

  crowdCount(): { peds: number; cars: number; pets: number; birds: number; buses: number; boats: number; tourists: number; trams: number; firetrucks: number; ambulances: number; patrols: number } {
    return {
      peds: this.actors.peds, cars: this.actors.cars,
      pets: this.actors.pets, birds: this.actors.birds,
      buses: this.actors.buses, boats: this.actors.boats,
      tourists: this.actors.tourists, trams: this.actors.trams,
      firetrucks: this.actors.firetrucks, ambulances: this.actors.ambulances,
      patrols: this.actors.patrols,
    };
  }

  // ---------------- v7 飞艇巡航 ----------------

  /** 飞艇状态机：定时从地图边缘切入，斜穿全图后离场 */
  private stepBlimp(dt: number): void {
    const n = this.map.n;
    if (!this.blimp) {
      this.blimpTimer -= dt;
      if (this.blimpTimer > 0) return;
      // 随机选一条横穿航线（水平 / 纵向，带轻微斜率）
      const SP = 2.4;                                   // 航速（格/秒）
      let x: number, y: number, dx: number, dy: number;
      if (Math.random() < 0.5) {
        dx = Math.random() < 0.5 ? 1 : -1;
        dy = (Math.random() - 0.5) * 0.6;
        x = dx > 0 ? -16 : n + 16;
        y = 24 + Math.random() * (n - 48);
      } else {
        dy = Math.random() < 0.5 ? 1 : -1;
        dx = (Math.random() - 0.5) * 0.6;
        y = dy > 0 ? -16 : n + 16;
        x = 24 + Math.random() * (n - 48);
      }
      const len = Math.hypot(dx, dy) || 1;
      this.blimp = { x, y, dx: dx / len * SP, dy: dy / len * SP };
      return;
    }
    const b = this.blimp;
    b.x += b.dx * dt;
    b.y += b.dy * dt;
    if (b.x < -22 || b.y < -22 || b.x > n + 22 || b.y > n + 22) {
      this.blimp = null;
      this.blimpTimer = 140 + Math.random() * 160;      // 2.5-5 分钟一班
    }
  }

  /** 飞艇绘制：高空艇身（像素风椭圆 + 红腹带 + 尾翼 + 吊舱）+ 地面投影 */
  private drawBlimp(ctx: CanvasRenderingContext2D, now: number): void {
    const b = this.blimp;
    if (!b) return;
    const ALT = 104;                                    // 高度偏移（px）
    const sx = this.w2sx(b.x, b.y);
    const gy = this.w2sy(b.x, b.y) + this.groundHpx(b.x, b.y);
    if (sx < -90 || sx > this.lw + 90 || gy < -170 || gy > this.lh + 170) return;
    // 地面投影（随艇缓移的暗椭圆）
    ctx.globalAlpha = 0.22;
    ctx.fillStyle = '#0B0F24';
    ctx.beginPath();
    ctx.ellipse(Math.round(sx), Math.round(gy + 6), 15, 6, 0, 0, 6.3);
    ctx.fill();
    ctx.globalAlpha = 1;
    // 艇身：逐行像素风椭圆（奶油主色 / 红腹带 / 顶部高光 + 铆接缝）
    const bx = Math.round(sx), by = Math.round(gy - ALT);
    for (let yy = -9; yy <= 9; yy++) {
      const wHalf = Math.round(Math.sqrt(Math.max(0, 1 - (yy / 10) ** 2)) * 30);
      if (wHalf <= 1) continue;
      let col = '#E8DFC8';
      if (yy >= 3 && yy <= 6) col = '#B3452E';
      else if (yy < -6) col = '#F4F2E8';
      ctx.fillStyle = col;
      ctx.fillRect(bx - wHalf, by + yy, wHalf * 2, 1);
      ctx.fillStyle = 'rgba(11,15,36,0.18)';
      for (let xx = -wHalf + 7; xx < wHalf; xx += 8) ctx.fillRect(bx + xx, by + yy, 1, 1);
    }
    // 尾翼（艇尾在行进反方向）
    const fx = b.dx >= 0 ? -1 : 1;
    ctx.fillStyle = '#B3452E';
    ctx.fillRect(bx + fx * 27 - 2, by - 5, 5, 4);
    ctx.fillRect(bx + fx * 27 - 2, by + 3, 5, 4);
    ctx.fillStyle = '#8A3323';
    ctx.fillRect(bx + fx * 30 - 2, by - 2, 6, 3);
    // 吊舱（系索 + 木色客舱 + 亮窗）
    ctx.fillStyle = '#6B543A';
    ctx.fillRect(bx - 2, by + 8, 1, 4);
    ctx.fillRect(bx + 2, by + 8, 1, 4);
    ctx.fillStyle = '#8A6F4C';
    ctx.fillRect(bx - 5, by + 12, 11, 4);
    ctx.fillStyle = '#F2D24B';
    ctx.fillRect(bx - 3, by + 13, 2, 1);
    ctx.fillRect(bx + 1, by + 13, 2, 1);
    // 航行灯：红色闪烁 + 白色频闪
    if (Math.floor(now / 700) % 2 === 0) {
      ctx.fillStyle = '#E05548';
      ctx.fillRect(bx - 1, by - 12, 2, 2);
    }
    if (Math.floor(now / 2300) % 2 === 0) {
      ctx.fillStyle = '#F4F2E8';
      ctx.fillRect(bx + fx * 31, by - 3, 2, 2);
    }
  }

  cycleZoom(dir: number): void {
    const i = ZOOMS.indexOf(this.zoom);
    const j = Math.max(0, Math.min(ZOOMS.length - 1, i + dir));
    if (j !== i) this.setZoom(ZOOMS[j]);
  }

  setZoom(z: number, focusCss?: { x: number; y: number }): void {
    if (z === this.zoom) return;
    let keep: { gx: number; gy: number; gz: number } | null = null;
    if (focusCss) {
      const t = this.tileAt(focusCss.x, focusCss.y);
      keep = { gx: t.tx + 0.5, gy: t.ty + 0.5, gz: this.hAt(t.tx, t.ty) };
    }
    this.zoom = z;
    this.resize();
    if (keep && focusCss) {
      const sx = focusCss.x / z, sy = focusCss.y / z;
      this.cam.x = (keep.gx - keep.gy) * 16 - sx + this.lw / 2;
      this.cam.y = (keep.gx + keep.gy) * 8 + keep.gz * HSTEP - sy + this.lh / 2;
    }
    this.beeper.play('zoom');
    this.hooks.onZoom?.(z);
  }

  // ---------------- 主循环 ----------------

  private loop = (): void => {
    this.raf = requestAnimationFrame(this.loop);
    const now = performance.now();
    const dt = Math.min(100, now - this.lastT);
    this.lastT = now;
    this.fpsAcc += dt; this.fpsN++;
    if (now - this.fpsAt > 500) {
      this.hooks.onFps?.(Math.round(1000 / (this.fpsAcc / this.fpsN)));
      this.fpsAcc = 0; this.fpsN = 0; this.fpsAt = now;
    }
    const pan = dt * 0.72;
    if (this.keys.has('ArrowLeft') || this.keys.has('KeyA')) this.cam.x -= pan;
    if (this.keys.has('ArrowRight') || this.keys.has('KeyD')) this.cam.x += pan;
    if (this.keys.has('ArrowUp') || this.keys.has('KeyW')) this.cam.y -= pan;
    if (this.keys.has('ArrowDown') || this.keys.has('KeyS')) this.cam.y += pan;
    if (this.timeAuto && dt > 0) {
      const dh = (dt / 1000) * 0.05 * this.timeSpeed;
      this.timeOfDay = (this.timeOfDay + dh) % 24;
      this.recomputeDayNight();
      this.stepSeason(dh);              // v6：季节时钟随昼夜同步轮转
      if (this.tycoon) this.tycoon.gHours += dh;   // v17：编年史纪日（游戏小时累计，随倍速缩放）
    }
    if (this.quakeT > 0) this.quakeT = Math.max(0, this.quakeT - dt / 1000);   // v18：震屏衰减
    this.actors.dayness = 1 - this.dayNight.dark;
    this.actors.winterIce = this.season === 3;   // v7：冬季冰封 → 船舶归航
    if (this.tycoon) this.tycoon.dayLight = 1 - this.dayNight.dark;   // v20：白昼照度回写（太阳能出力）
    // v5 天气状态机（雨雪粒子 / 云影 / 色调）+ 经营联动回写
    this.stepWeather(dt / 1000);
    this.stepBlimp(dt / 1000);                   // v7：飞艇巡航
    if (this.tycoon) {
      this.tycoon.weather = { kind: this.wx.kind, t: this.wx.t };
      this.tycoon.season = this.season;   // v6：季节回写（快照层经济联动）
      if (this.tycoon.weatherReq) {          // 暴风雨事件：强制切雨
        this.setWeather(this.tycoon.weatherReq);
        this.tycoon.weatherReq = null;
      }
      // v18 地震：震屏请求（振幅 px，历时约 4.5 秒衰减）
      if (this.tycoon.quakeReq !== null) {
        this.startQuake(this.tycoon.quakeReq);
        this.tycoon.quakeReq = null;
      }
      // v12 应急联动：消费出动请求（消防车/救护车驰援事故现场；v18 携带事件 key）
      let dispatchedN = 0;
      while (this.tycoon.dispatch.length) {
        const q = this.tycoon.dispatch.shift()!;
        if (this.actors.dispatchEmergency(this.map, q.kind, q.hx, q.hy, q.tx, q.ty, q.key)) dispatchedN++;
      }
      if (dispatchedN > 0) this.beeper.play('siren');   // v14：应急出动警笛
      // v12 巡逻编制：交班常驻 + 治安巡逻令 +1；v23 警察局常驻两辆（上限 4 辆）
      this.actors.patrolCap = Math.min(4,
        this.tycoon.kobansNow + this.tycoon.policehqNow * 2 + (this.tycoon.hasOrd('patrol') ? 1 : 0));
      // v12 到场回调 → 提前终结事件 + 豁免余损（v18：按事件 key 精准终结；v23：巡逻车擒贼）
      this.actors.onRescueArrive = (kind, _tx, _ty, evKey) => {
        this.tycoon?.resolveEvent(evKey ?? (kind === 9 ? 'fire' : kind === 10 ? 'plague' : 'crime'));
      };
      // v16 城市节庆：节日视觉状态同步（粒子层驱动）
      this.festKind = this.tycoon.fest ? this.tycoon.fest.kind : -1;
    } else {
      this.actors.patrolCap = 0;
      this.festKind = -1;
    }
    // 经营模式：行人密度跟随实际人口（荒地开局无人，市民迁入后街巷渐热闹）
    this.actors.popNow = this.tycoon ? this.tycoon.pop : null;
    this.actors.touristsNow = this.tycoon ? this.tycoon.tourists : 0;   // v10 游客漫步
    // v15 市民外观偏置池：每 5 秒同步一次（行人出生时抽用 → 街上是市民本人）
    if (now - this.lastCitzLookT > 5000) {
      this.lastCitzLookT = now;
      this.actors.citizenLooks = this.tycoon ? this.tycoon.citz.looks() : [];
    }
    if (now - this.lastInvalT > 2500) {
      this.lastInvalT = now;
      this.actors.invalidate();
    }
    if (this.crowds) this.actors.tick(dt / 1000, this.map);
    // 经营心跳：经济累积 + 节流推送给 UI
    if (this.tycoon) {
      this.tycoon.tick(dt / 1000, this.map);
      this.econTimer -= dt;
      if (this.econTimer <= 0) {
        this.econTimer = 400;
        this.hooks.onEcon?.(this.tycoon.view());
      }
    }
    this.render(now);
    if (this.map.version !== this.lastSaveVer && now - this.lastSaveT > 25000) {
      this.autoSave();
    }
  };

  // ---------------- 渲染 ----------------

  private visibleRange(): { x0: number; y0: number; x1: number; y1: number } {
    const n = this.map.n;
    const cs: Array<[number, number]> = [[0, 0], [this.lw, 0], [0, this.lh], [this.lw, this.lh]];
    let minX = n, maxX = 0, minY = n, maxY = 0;
    for (const [sx, sy] of cs) {
      const ax = sx + this.cam.x - this.lw / 2;
      const ay = sy + this.cam.y - this.lh / 2;
      const X = ax / 32 + ay / 16;
      const Y = ay / 16 - ax / 32;
      minX = Math.min(minX, Math.floor(X)); maxX = Math.max(maxX, Math.ceil(X));
      minY = Math.min(minY, Math.floor(Y)); maxY = Math.max(maxY, Math.ceil(Y));
    }
    // 高地地形可从更远的行「探出头来」，纵向多预留若干行
    const padX = 5, padY = Math.ceil(HMAX * HSTEP / 8) + 4;
    return {
      x0: Math.max(0, minX - padX), y0: Math.max(0, minY - padY),
      x1: Math.min(n - 1, maxX + padX), y1: Math.min(n - 1, maxY + padY),
    };
  }

  private render(t: number): void {
    const ctx = this.lctx;
    const { lw, lh } = this;
    const dk = this.dayNight.dark;
    const wm = this.dayNight.warm;
    // v18 地震震屏：临时相机偏移（世界层随大地抖动；Pass 3 前恢复，光标/浮字稳定）
    let shx = 0, shy = 0;
    if (this.quakeT > 0) {
      const k = this.quakeT / this.quakeDur;            // 1 → 0 线性衰减
      const amp = this.quakeAmp * (0.35 + 0.65 * k);    // 前段猛后段弱
      shx = (Math.random() - 0.5) * 2 * amp;
      shy = (Math.random() - 0.5) * 1.4 * amp;
      this.cam.x += shx;
      this.cam.y += shy;
    }

    // 背景虚空（缓存绘制：日间点阵 + 夜间星月）
    this.ensureBg(lw, lh);
    ctx.fillStyle = dk > 0.5 ? '#070B1C' : '#0B0F24';
    ctx.fillRect(0, 0, lw, lh);
    if (this.bgDay) ctx.drawImage(this.bgDay, 0, 0);
    if (dk > 0.25 && this.bgNight) {
      ctx.globalAlpha = Math.min(1, (dk - 0.25) * 2.2);
      ctx.drawImage(this.bgNight, 0, 0);
      ctx.globalAlpha = 1;
    }

    const vr = this.visibleRange();
    const wf = Math.floor(t / 620) % 2;
    const items: RenderItem[] = [];
    const glowJobs: Array<() => void> = [];
    const m = this.map;

    // ---- Pass 1（缓存层）：地面 + 崖壁 + 高度光照 + 迷雾 → 滚动缓冲 blit ----
    // 静态地形整层缓存在离屏画布（相机位移 > 96px / 地图或迷雾版本变化才全量重绘）；
    // 每帧仅一次 blit + 动态水面（两帧波光，帧切换或相机移动时才重画）+ 路灯（深度排序 / 夜光光池）
    this.ensureTerrain();
    const dcx = this.terrCam.x - this.cam.x;
    const dcy = this.terrCam.y - this.cam.y;
    if (this.terrBuf) ctx.drawImage(this.terrBuf, Math.round(dcx), Math.round(dcy));
    this.drawWaterAnim(ctx, wf, dcx, dcy);
    this.drawBridges(ctx, dcx, dcy);   // v6：跨水桥（水面之上 / 建筑之下）
    this.drawFloodOverlay(ctx, t);     // v18：洪水淹没层（桥之上 · 建筑之下）
    if (this.lampSp && this.lampNight && this.lampPool) {
      const sp = this.lampSp, ns = this.lampNight, pool = this.lampPool;
      for (const L of this.lampList) {
        const lsx = Math.round(L.sx + dcx + sp.ox);
        const lsy = Math.round(L.sy + dcy + sp.oy);
        const px = Math.round(L.sx + dcx), py = Math.round(L.sy + dcy);
        items.push({ key: L.key, draw: () => ctx.drawImage(sp.cv, lsx, lsy) });
        if (dk > 0.02) {
          glowJobs.push(() => {
            ctx.drawImage(ns.cv, lsx, lsy);
            ctx.drawImage(pool, px - 14, py - 6);
          });
        }
      }
    }

    // ---- Pass 2：树木 + 建筑（按前角深度排序；随所在高度抬升）----
    const seen = new Set<number>();
    for (let ty = vr.y0; ty <= vr.y1; ty++) {
      for (let tx = vr.x0; tx <= vr.x1; tx++) {
        const i = m.idx(tx, ty);
        const sx = this.w2sx(tx, ty), sy = this.w2sy(tx, ty) + this.hOfs(tx, ty);
        if (sx < -160 || sx > lw + 160 || sy < -300 || sy > lh + 160) continue;

        const tv = m.tree[i];
        const fogged = this.tycoon ? !this.tycoon.ownedAt(tx, ty) : false;
        if (tv >= 0 && !m.road[i] && m.occ[i] < 0 && !fogged) {
          const seasonArr = this.treeSprites[this.season] ?? this.treeSprites[1];
          const sp = seasonArr[tv % seasonArr.length];
          const key = tx + ty;
          const dx = Math.round(sx + sp.ox), dy = Math.round(sy + sp.oy);
          // v9 树影：格菱形向西北偏 (−2, −4) 的轻投影
          const shA2 = 0.16 * (1 - dk * 0.85);
          if (shA2 > 0.02) {
            items.push({
              key: key - 0.4,
              draw: () => {
                ctx.globalAlpha = shA2;
                ctx.fillStyle = PALETTE[65];
                ctx.beginPath();
                ctx.moveTo(sx - 2, sy - 4);
                ctx.lineTo(sx + 14, sy + 4);
                ctx.lineTo(sx - 2, sy + 12);
                ctx.lineTo(sx - 18, sy + 4);
                ctx.closePath();
                ctx.fill();
                ctx.globalAlpha = 1;
              },
            });
          }
          items.push({ key, draw: () => ctx.drawImage(sp.cv, dx, dy) });
        }

        const a = m.occ[i];
        if (a >= 0 && !seen.has(a)) {
          seen.add(a);
          const o = m.objs.get(a)!;
          const d = defById(o.id);
          // v6：四季建筑（公园等）按季节取精灵
          const bs = d.seasonal ? this.book.getSeasonal(o.id, o.v, this.season) : this.book.get(o.id, o.v);
          const sp = bs.sp;
          const bsx = this.w2sx(o.ax, o.ay);
          const bsy = this.w2sy(o.ax, o.ay) + this.hOfs(o.ax, o.ay);
          const key = (o.ax + d.w - 1) + (o.ay + d.h - 1);
          const blinkOn = Math.floor(t / 640) % 2 === 0;
          const smokeFr = Math.floor(t / 300) % 3;
          const bx = Math.round(bsx + sp.ox), by = Math.round(bsy + sp.oy);
          const smk = bs.smokeAt;
          const blk = bs.blinkAt;
          const sm = smk ? this.book.smoke[smokeFr] : null;
          const mx = smk ? bsx + (smk[0] - smk[1]) : 0;
          const my = smk ? bsy + (smk[0] + smk[1]) / 2 - smk[2] : 0;
          const lx = blk ? bsx + (blk[0] - blk[1]) : 0;
          const ly = blk ? bsy + (blk[0] + blk[1]) / 2 - blk[2] : 0;
          // v20 万家灯火：断电建筑 —— 不冒烟、不闪灯、夜里窗火不亮（黑暗本身会说话）
          const darkB = this.tycoon ? this.tycoon.darkField.has(m.idx(o.ax, o.ay)) : false;
          items.push({
            key: key - 0.4,
            draw: () => {
              // v9 接地投影：占地菱形向西北偏 (−2, −6) 的暗影（先画，本体盖住中心、
              // 露出背光侧月牙边 → 建筑与地面「长在一起」；夜色越深影子越淡）
              const shA = 0.17 * (1 - dk * 0.85);
              if (shA > 0.02) {
                ctx.globalAlpha = shA;
                ctx.fillStyle = PALETTE[65];
                ctx.beginPath();
                ctx.moveTo(bsx - 2, bsy - 6);
                ctx.lineTo(bsx + 16 * d.w - 2, bsy + 8 * d.w - 6);
                ctx.lineTo(bsx + 16 * (d.w - d.h) - 2, bsy + 8 * (d.w + d.h) - 6);
                ctx.lineTo(bsx - 16 * d.h - 2, bsy + 8 * d.h - 6);
                ctx.closePath();
                ctx.fill();
                ctx.globalAlpha = 1;
              }
            },
          });
          items.push({
            key,
            draw: () => {
              ctx.drawImage(sp.cv, bx, by);
              if (sm && !darkB) ctx.drawImage(sm.cv, Math.round(mx + sm.ox), Math.round(my + sm.oy));
              if (blk && blinkOn && !darkB) {
                ctx.fillStyle = PALETTE[62];
                ctx.fillRect(Math.round(lx) - 1, Math.round(ly) - 1, 2, 2);
                ctx.fillStyle = PALETTE[61];
                ctx.fillRect(Math.round(lx), Math.round(ly), 1, 1);
              }
            },
          });
          // 夜光：建筑发光精灵 + 航标灯 halo（v20：断电建筑整段跳过 —— 漆黑的窗是断电最好的报幕员）
          if (dk > 0.02 && !darkB) {
            const ns = bs.spNight;
            const nbx = bx, nby = by;
            glowJobs.push(() => ctx.drawImage(ns.cv, nbx, nby));
            if (blk) {
              const blx = Math.round(lx), bly = Math.round(ly);
              glowJobs.push(() => {
                if (!blinkOn) return;
                ctx.fillStyle = '#E05548';
                ctx.fillRect(blx - 2, bly - 2, 4, 4);
                ctx.fillStyle = '#F4F2E8';
                ctx.fillRect(blx - 1, bly - 1, 2, 2);
              });
            }
          }
        }
      }
    }
    // ---- 行人 / 车辆 / 巴士 / 船舶 / 骑行者（与建筑同序参与深度排序；贴地随高度）----
    if (this.crowds) {
      for (const a of this.actors.actors) {
        const px = a.fx + a.dx * a.t, py = a.fy + a.dy * a.t;
        let wx: number, wy: number;
        if (a.kind === 1 || a.kind === 5 || a.kind === 7 || a.kind === 8) {
          // 车辆 / 巴士 / 骑行者 / 电车：车道偏移（靠右 / 贴路缘）
          const [lx, ly] = this.actors.laneOffset(a);
          wx = px * 16 + lx;
          wy = py * 16 + ly;
        } else if (a.kind === 6) {
          // 船舶：居中贴水面
          wx = (px + 0.5) * 16;
          wy = (py + 0.5) * 16;
        } else {
          wx = (px + 0.5) * 16 + a.offX;
          wy = (py + 0.5) * 16 + a.offY;
        }
        const sx = (wx - wy) - this.cam.x + lw / 2;
        const sy = (wx + wy) / 2 - this.cam.y + lh / 2 + this.groundHpx(px, py);
        if (sx < -80 || sx > lw + 80 || sy < -60 || sy > lh + 60) continue;
        const key = (wx + wy) / 16;
        if (a.kind === 0) {
          const d = ActorSystem.dirOf(a) as Facing;
          const fr = Math.floor(t / 190 + a.phase) % 4;
          const ps = this.actors.personSp(d, fr, a.look, a.body, a.role);
          if (!ps) continue;
          const dx = Math.round(sx + ps.ox), dy = Math.round(sy + ps.oy);
          items.push({ key, draw: () => ctx.drawImage(ps.cv, dx, dy) });
        } else if (a.kind === 4) {
          // 鸽子：等待时低头啄食
          const d = ActorSystem.dirOf(a) as Facing;
          const fr = Math.floor(t / 150 + a.phase) % 4;
          const ps = this.actors.birdSp(d, fr, a.look, a.wait > 0);
          if (!ps) continue;
          const dx = Math.round(sx + ps.ox), dy = Math.round(sy + ps.oy);
          items.push({ key: key - 0.02, draw: () => ctx.drawImage(ps.cv, dx, dy) });
        } else if (a.kind >= 9 && a.kind <= 11) {
          // v12 应急车队：消防车/救护车/巡逻警车 + 顶灯闪烁 + 消防喷水作业
          const d = ActorSystem.dirOf(a) as CarDir;
          const sp = this.actors.emergencySp(a.kind as 9 | 10 | 11, d);
          if (!sp) continue;
          const dx = Math.round(sx + sp.ox), dy = Math.round(sy + sp.oy);
          items.push({ key, draw: () => ctx.drawImage(sp.cv, dx, dy) });
          const blink = Math.floor(t / 240) % 2 === 0;
          const emg = a;
          if (blink || (emg.kind === 9 && emg.mission?.phase === 1)) {
            glowJobs.push(() => {
              // 顶部警灯交替闪红（救护车红/青交替）
              if (Math.floor(t / 240) % 2 === 0) {
                const bx = dx + (sp.cv.width >> 1) - 1, by = dy + 2;
                ctx.fillStyle = emg.kind === 10
                  ? (Math.floor(t / 240) % 4 < 2 ? '#E05548' : '#5BC8B8')
                  : '#E05548';
                ctx.fillRect(bx - 2, by, 2, 2);
                ctx.fillRect(bx + 2, by, 2, 2);
              }
              // 消防喷水：水炮弧线射向事故建筑 + 落点水花
              if (emg.kind === 9 && emg.mission && emg.mission.phase === 1 && emg.wait > 0) {
                const m = emg.mission;
                const bx2 = this.w2sx(m.tx, m.ty);
                const by2 = this.w2sy(m.tx, m.ty) + this.hOfs(m.tx, m.ty) - 26;
                const ox = dx + (sp.cv.width >> 1), oy = dy + 3;
                for (let k = 0; k <= 8; k++) {
                  const q = k / 8;
                  const wx2 = ox + (bx2 - ox) * q;
                  const wy2 = oy + (by2 - oy) * q - Math.sin(q * Math.PI) * 14 - 2;
                  if (Math.floor(t / 90 + k) % 3 === 0) continue;   // 水流断续感
                  ctx.fillStyle = k % 2 ? '#A8D8EA' : '#D6F3FF';
                  ctx.fillRect(Math.round(wx2), Math.round(wy2), 2, 2);
                }
                const fl2 = Math.floor(t / 130) % 2 === 0;
                ctx.fillStyle = '#D6F3FF';
                ctx.fillRect(Math.round(bx2 - 3), Math.round(by2 + (fl2 ? 0 : 2)), 2, 2);
                ctx.fillRect(Math.round(bx2 + 2), Math.round(by2 + (fl2 ? 2 : 0)), 2, 2);
              }
            });
          }
          // 夜间前灯（复用车辆光池）
          if (dk > 0.02 && this.carPool) {
            const fsx = Math.round(sx + (a.dx - a.dy) * 13);
            const fsy = Math.round(sy + (a.dx + a.dy) * 6.5 + 3);
            const pool = this.carPool;
            glowJobs.push(() => {
              ctx.drawImage(pool, fsx - 8, fsy - 5);
              ctx.fillStyle = '#F4F2E8';
              ctx.fillRect(fsx - 3, fsy, 2, 2);
              ctx.fillRect(fsx + 1, fsy, 2, 2);
            });
          }
        } else if (a.kind === 5) {
          // v7 巴士：双色涂装 + 夜间前灯 / 车窗光带
          const d = ActorSystem.dirOf(a) as CarDir;
          const sp = this.actors.busSp(d, a.look);
          if (!sp) continue;
          const dx = Math.round(sx + sp.ox), dy = Math.round(sy + sp.oy);
          items.push({ key, draw: () => ctx.drawImage(sp.cv, dx, dy) });
          if (dk > 0.02 && this.carPool) {
            const pool = this.carPool;
            const fsx = Math.round(sx + (a.dx - a.dy) * 16);
            const fsy = Math.round(sy + (a.dx + a.dy) * 8 + 4);
            const winY = dy + Math.round(sp.cv.height * 0.45);
            const moving = a.wait <= 0;
            glowJobs.push(() => {
              if (moving) {
                ctx.drawImage(pool, fsx - 9, fsy - 5);
                ctx.fillStyle = '#F4F2E8';
                ctx.fillRect(fsx - 4, fsy, 2, 2);
                ctx.fillRect(fsx + 2, fsy, 2, 2);
              }
              // 车窗暖光带（夜间车厢灯）
              ctx.fillStyle = 'rgba(242,210,75,0.5)';
              ctx.fillRect(dx + 4, winY, Math.max(4, sp.cv.width - 8), 2);
            });
          }
        } else if (a.kind === 8) {
          // v11 电车：双色涂装 + 受电弓 + 夜间车窗光带 / 前灯
          const d = ActorSystem.dirOf(a) as CarDir;
          const sp = this.actors.tramSp(d, a.look);
          if (!sp) continue;
          const dx = Math.round(sx + sp.ox), dy = Math.round(sy + sp.oy);
          items.push({ key, draw: () => ctx.drawImage(sp.cv, dx, dy) });
          if (dk > 0.02 && this.carPool) {
            const pool = this.carPool;
            const fsx = Math.round(sx + (a.dx - a.dy) * 16);
            const fsy = Math.round(sy + (a.dx + a.dy) * 8 + 4);
            const winY = dy + Math.round(sp.cv.height * 0.48);
            const moving = a.wait <= 0;
            glowJobs.push(() => {
              if (moving) {
                ctx.drawImage(pool, fsx - 9, fsy - 5);
                ctx.fillStyle = '#F4F2E8';
                ctx.fillRect(fsx - 4, fsy, 2, 2);
                ctx.fillRect(fsx + 2, fsy, 2, 2);
              }
              // 车窗暖光带（夜间车厢灯）
              ctx.fillStyle = 'rgba(242,210,75,0.55)';
              ctx.fillRect(dx + 4, winY, Math.max(4, sp.cv.width - 8), 2);
            });
          }
        } else if (a.kind === 6) {
          // v7 船舶：贴水面航行 + 船尾白浪尾迹（航行时）
          const d = ActorSystem.dirOf(a) as CarDir;
          const sp = this.actors.boatSp(d, a.look);
          if (!sp) continue;
          const dx = Math.round(sx + sp.ox), dy = Math.round(sy + sp.oy);
          const wake: Array<[number, number, number]> = [];
          if (a.wait <= 0) {
            for (let k = 1; k <= 3; k++) {
              const bwx = (px - a.dx * (0.55 + k * 0.62)) * 16;
              const bwy = (py - a.dy * (0.55 + k * 0.62)) * 16;
              wake.push([
                (bwx - bwy) - this.cam.x + lw / 2,
                (bwx + bwy) / 2 - this.cam.y + lh / 2,
                0.7 - k * 0.2,
              ]);
            }
          }
          items.push({
            key,
            draw: () => {
              for (const [wxk, wyk, ak] of wake) {
                ctx.fillStyle = `rgba(244,242,232,${ak.toFixed(2)})`;
                ctx.fillRect(Math.round(wxk) - 1, Math.round(wyk) + 3, 3, 1);
                ctx.fillRect(Math.round(wxk) - 2, Math.round(wyk) + 4, 1, 1);
              }
              ctx.drawImage(sp.cv, dx, dy);
            },
          });
        } else if (a.kind === 7) {
          // v7 骑行者：双踏板相位 + 夜间车头灯
          const d = ActorSystem.dirOf(a) as CarDir;
          const fr = Math.floor(t / 130 + a.phase) % 4;
          const sp = this.actors.bikeSp(d, a.look, fr);
          if (!sp) continue;
          const dx = Math.round(sx + sp.ox), dy = Math.round(sy + sp.oy);
          items.push({ key, draw: () => ctx.drawImage(sp.cv, dx, dy) });
          if (dk > 0.02 && this.carPool) {
            const fsx = Math.round(sx + (a.dx - a.dy) * 8);
            const fsy = Math.round(sy + (a.dx + a.dy) * 4 + 3);
            const pool = this.carPool;
            glowJobs.push(() => {
              ctx.drawImage(pool, fsx - 7, fsy - 4);
              ctx.fillStyle = '#F4F2E8';
              ctx.fillRect(fsx - 1, fsy, 2, 1);
            });
          }
        } else if (a.kind >= 2) {
          // 宠物：狗 / 猫（等待时坐姿）
          const d = ActorSystem.dirOf(a) as Facing;
          const fr = Math.floor(t / 190 + a.phase) % 4;
          const ps = this.actors.petSp(a.kind === 2 ? 'dog' : 'cat', d, fr, a.look, a.wait > 0);
          if (!ps) continue;
          const dx = Math.round(sx + ps.ox), dy = Math.round(sy + ps.oy);
          items.push({ key: key - 0.01, draw: () => ctx.drawImage(ps.cv, dx, dy) });
        } else {
          const d = ActorSystem.dirOf(a) as CarDir;
          const sp = this.actors.carSp(d, a.look);
          if (!sp) continue;
          const dx = Math.round(sx + sp.ox), dy = Math.round(sy + sp.oy);
          items.push({ key, draw: () => ctx.drawImage(sp.cv, dx, dy) });
          if (dk > 0.02 && this.carPool) {
            const fsx = Math.round(sx + (a.dx - a.dy) * 13);
            const fsy = Math.round(sy + (a.dx + a.dy) * 6.5 + 3);
            const pool = this.carPool;
            glowJobs.push(() => {
              ctx.drawImage(pool, fsx - 8, fsy - 5);
              ctx.fillStyle = '#F4F2E8';
              ctx.fillRect(fsx - 3, fsy, 2, 2);
              ctx.fillRect(fsx + 1, fsy, 2, 2);
            });
          }
        }
      }
    }

    items.sort((p, q) => p.key - q.key);
    for (const it of items) it.draw();

    // ---- v5：事件事故特效（火灾烟柱 / 火点，覆盖在建筑之上）----
    this.drawEventFx(ctx, t);
    // ---- v23：治安盲区层（盲区冷影 + 商铺红点警示；最底氛围层）----
    this.drawSecOverlay(ctx, t);
    // ---- v24：消防盲区层（盲区焦枯暖影 + 屋顶火苗警示；与治安同层位）----
    this.drawFireOverlay(ctx, t);
    // ---- v22：学区层（学区内住宅金光罩 + 书页飘飞；垃圾之下）----
    this.drawEduOverlay(ctx, t);
    // ---- v21：垃圾堆积层（清运不到的巷口垃圾成堆；雾霾之下）----
    this.drawWasteOverlay(ctx, t);
    // ---- v19：雾霾层（污染空间场可视化；笼罩建筑，事件特效之下）----
    this.drawSmogOverlay(ctx, t);
    // ---- v7：飞艇巡航（建筑之上 / 云层之下）----
    this.drawBlimp(ctx, t);
    // ---- v5：云影（缓速漂移的大团软影，覆盖一切顶面）----
    this.drawCloudShade(ctx, t);
    // ---- v5：雨天水面涟漪（白点闪斑，贴地）----
    this.drawRipples(ctx, t, dcx, dcy);

    // ---- 拆除/建造尘土（在昼夜调色前，随场景一起压暗）----
    this.drawPuffs(ctx, t);

    // ---- 昼夜色调：暮色暖光 → 夜幕压暗 → 夜光加色（lighter）----
    if (wm > 0.02) {
      ctx.fillStyle = `rgba(224,138,56,${(0.16 * wm).toFixed(3)})`;
      ctx.fillRect(0, 0, lw, lh);
    }
    if (dk > 0.02) {
      ctx.fillStyle = `rgba(13,17,42,${(0.58 * dk).toFixed(3)})`;
      ctx.fillRect(0, 0, lw, lh);
      if (glowJobs.length) {
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = Math.min(1, dk * 1.25);
        for (const g of glowJobs) g();
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1;
      }
    }

    // ---- v5：天气色调（雨冷蓝压暗 / 雪亮白偏冷 / 多云灰蓝）----
    const rainI = this.wxIntensity('rain');
    const snowI = this.wxIntensity('snow');
    const cloudI = this.wxIntensity('cloudy');
    if (rainI > 0.02) {
      ctx.fillStyle = `rgba(38,52,88,${(0.15 * rainI).toFixed(3)})`;
      ctx.fillRect(0, 0, lw, lh);
      ctx.fillStyle = `rgba(13,17,42,${(0.10 * rainI).toFixed(3)})`;
      ctx.fillRect(0, 0, lw, lh);
    }
    if (snowI > 0.02) {
      ctx.fillStyle = `rgba(214,226,244,${(0.07 * snowI).toFixed(3)})`;
      ctx.fillRect(0, 0, lw, lh);
    }
    if (cloudI > 0.02) {
      ctx.fillStyle = `rgba(60,70,100,${(0.05 * cloudI).toFixed(3)})`;
      ctx.fillRect(0, 0, lw, lh);
    }

    // ---- v6：四季色调（春嫩绿 / 夏暖金 / 秋红棕 / 冬青白，画面整体季相）----
    {
      const [col, a] = SEASONS[this.season].tint;
      ctx.fillStyle = col.replace(/[\d.]+\)$/, `${a})`);
      ctx.fillRect(0, 0, lw, lh);
    }
    // ---- v5：雨 / 雪 屏幕粒子（最上层大气效果）----
    this.drawWeatherParticles(ctx, rainI, snowI);
    // v16：城市节庆粒子（花吹雪加密 / 花火 / 金叶 / 孔明灯；最上层特效）
    this.drawFestivalParticles(ctx);

    // ---- Pass 3：光标 + 幽灵 + 浮字 ----（v18：震屏偏移在此恢复，输入层不抖）
    if (shx || shy) { this.cam.x -= shx; this.cam.y -= shy; }
    this.drawCursor(ctx);
    this.drawFloats(ctx, t);

    // ---- 上屏（最近邻放大 + 扫描线）----
    const d = this.display;
    const dctx = this.dctx;
    if (d && dctx) {
      const S = this.zoom * this.dpr;
      dctx.imageSmoothingEnabled = false;
      dctx.drawImage(this.lowres, 0, 0, lw, lh, 0, 0, Math.round(lw * S), Math.round(lh * S));
      const step = Math.max(2, Math.round(S));
      dctx.globalAlpha = 0.15;
      dctx.fillStyle = '#000';
      for (let y = step - 1; y < d.height; y += step) dctx.fillRect(0, y, d.width, 1);
      dctx.globalAlpha = 1;
    }

    this.renderMini();
  }

  /** 预渲染背景层（日间点阵 / 夜间星月），尺寸变化时才重建 */
  private ensureBg(lw: number, lh: number): void {
    if (this.bgW === lw && this.bgH === lh && this.bgDay && this.bgNight) return;
    this.bgW = lw; this.bgH = lh;
    const day = document.createElement('canvas');
    day.width = lw; day.height = lh;
    const d2 = day.getContext('2d')!;
    d2.fillStyle = '#182142';
    for (let y = 0; y < lh; y += 8) {
      for (let x = ((y >> 3) % 2) * 8; x < lw; x += 16) d2.fillRect(x + 3, y + 5, 1, 1);
    }
    const ngt = document.createElement('canvas');
    ngt.width = lw; ngt.height = lh;
    const n2 = ngt.getContext('2d')!;
    n2.fillStyle = '#D6E9F5';
    for (let y = 0; y < lh; y += 8) {
      for (let x = ((y >> 3) % 2) * 8 + 6; x < lw; x += 16) n2.fillRect(x, y + 2, 1, 1);
    }
    const mx = Math.round(lw * 0.14), my = Math.round(lh * 0.15);
    n2.beginPath();
    n2.arc(mx, my, 5.5, 0, 6.3);
    n2.fillStyle = '#F4F2E8';
    n2.fill();
    n2.beginPath();
    n2.arc(mx + 2.4, my + 1.6, 5.0, 0, 6.3);
    n2.fillStyle = '#0B0F24';
    n2.fill();
    n2.fillStyle = '#C3C7CC';
    n2.fillRect(mx - 2, my - 2, 1, 1);
    n2.fillRect(mx + 1, my + 2, 1, 1);
    this.bgDay = day;
    this.bgNight = ngt;
  }


  // ---------------- Pass1 地形层滚动缓存 ----------------

  /** 屏幕四角（含 pad px 扩边）→ 可视格范围（px 语义；Pass2 用 visibleRange） */
  private visibleRangeFor(padX: number, padY: number): { x0: number; y0: number; x1: number; y1: number } {
    const n = this.map.n;
    const cs: Array<[number, number]> = [
      [-padX, -padY], [this.lw + padX, -padY],
      [-padX, this.lh + padY], [this.lw + padX, this.lh + padY],
    ];
    let minX = n, maxX = 0, minY = n, maxY = 0;
    for (const [sx, sy] of cs) {
      const ax = sx + this.cam.x - this.lw / 2;
      const ay = sy + this.cam.y - this.lh / 2;
      const X = ax / 32 + ay / 16;
      const Y = ay / 16 - ax / 32;
      minX = Math.min(minX, Math.floor(X)); maxX = Math.max(maxX, Math.ceil(X));
      minY = Math.min(minY, Math.floor(Y)); maxY = Math.max(maxY, Math.ceil(Y));
    }
    return {
      x0: Math.max(0, minX - 2), y0: Math.max(0, minY - 2),
      x1: Math.min(n - 1, maxX + 2), y1: Math.min(n - 1, maxY + 2),
    };
  }

  /** 缓存维护：尺寸 / 相机位移 / 地图版本 / 迷雾版本 / 季节 变化时全量重绘滚动缓冲 */
  private ensureTerrain(): void {
    const W = this.lw + Engine.TBUF_PAD * 2;
    const H = this.lh + Engine.TBUF_PAD * 2;
    const moved = Math.abs(this.cam.x - this.terrCam.x) > Engine.TBUF_MOVE
      || Math.abs(this.cam.y - this.terrCam.y) > Engine.TBUF_MOVE;
    if (this.terrBuf && this.terrBuf.width === W && this.terrBuf.height === H
      && this.terrVer === this.map.version && this.terrFogV === this.fogVer
      && this.terrSeason === this.season && !moved) return;
    if (!this.terrBuf || this.terrBuf.width !== W || this.terrBuf.height !== H) {
      const cv = this.terrBuf ?? document.createElement('canvas');
      cv.width = W; cv.height = H;
      this.terrBuf = cv;
      this.terrCtx = cv.getContext('2d');
      if (this.terrCtx) this.terrCtx.imageSmoothingEnabled = false;
    }
    this.terrCam.x = this.cam.x;
    this.terrCam.y = this.cam.y;
    this.terrVer = this.map.version;
    this.terrFogV = this.fogVer;
    this.terrSeason = this.season;
    this.repaintTerrain();
  }

  /** 全量重绘地形层（原 Pass1 顶面/崖壁/高度光照 + Pass1.5 迷雾）到滚动缓冲 */
  private repaintTerrain(): void {
    const ctx = this.terrCtx;
    if (!ctx || !this.terrBuf) return;
    const PAD = Engine.TBUF_PAD;
    const W = this.terrBuf.width, H = this.terrBuf.height;
    const vrB = this.visibleRangeFor(PAD, PAD + Math.ceil(HMAX * HSTEP / 8));
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.setTransform(1, 0, 0, 1, PAD, PAD);   // 此后坐标 = 主画布语义（以缓存时刻相机）
    this.waterList = [];
    this.lampList = [];
    this.bridgeList = [];                       // v6：跨水桥列表（每帧上层重绘）
    this.paintTerrainPass(ctx, vrB, PAD + 48);
    if (this.tycoon) this.drawTerritoryFog(ctx, vrB);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.waterAnim = { wf: -1, dcx: 1e9, dcy: 1e9 };   // 强制下一帧重画水面
  }

  /** 原 Pass1 循环体（ctx=缓冲画布；cullM=屏幕四周裁剪余量 px） */
  private paintTerrainPass(ctx: CanvasRenderingContext2D, vr: { x0: number; y0: number; x1: number; y1: number }, cullM: number): void {
    const m = this.map;
    const lw = this.lw, lh = this.lh;
    for (let ty = vr.y0; ty <= vr.y1; ty++) {
      for (let tx = vr.x0; tx <= vr.x1; tx++) {
        const i = m.idx(tx, ty);
        const hgt = m.h[i] * HSTEP;
        const sx = this.w2sx(tx, ty), syF = this.w2sy(tx, ty);
        const sy = syF - hgt;
        if (sx < -cullM || sx > lw + cullM || syF < -cullM - 14 || syF > lh + cullM + 14) continue;

        // 崖壁：东 / 南邻格更低时，绘制垂直剖面（世界坐标 y = syF+8−h·HSTEP 起）
        if (hgt > 0) {
          const hE = m.inB(tx + 1, ty) ? m.h[m.idx(tx + 1, ty)] * HSTEP : hgt;
          const hS = m.inB(tx, ty + 1) ? m.h[m.idx(tx, ty + 1)] * HSTEP : hgt;
          if (hgt > hE || hgt > hS) {
            const style = this.cliffStyleAt(i);
            const by = Math.round(syF + 8 - hgt);
            if (hgt > hE) {
              const c = getCliff(style, (hgt - hE) / HSTEP, 'E');
              ctx.drawImage(c.cv, Math.round(sx), by);
            }
            if (hgt > hS) {
              const c = getCliff(style, (hgt - hS) / HSTEP, 'SW');
              ctx.drawImage(c.cv, Math.round(sx - 16), by);
            }
          }
        }

        const a = m.occ[i];
        let groundDrawn = false;
        if (a >= 0) {
          const o = m.objs.get(a)!;
          const d = defById(o.id);
          const isAnchor = o.ax === tx && o.ay === ty;
          if (d.ground) {
            if (isAnchor) {
              const g = getGround(d.ground, { variant: o.v });
              ctx.drawImage(g.cv, Math.round(sx + g.ox), Math.round(sy + g.oy));
            }
            groundDrawn = true;   // 大地面精灵覆盖全部占地格
          }
        }
        if (groundDrawn) continue;

        const winter = this.season === 3;   // v6：冬季换装（积雪 / 封冻）
        if (m.road[i] === 2) {
          // ---- v6 跨水桥：底面仍是水（冬结冰），桥板由主循环每帧上层重绘 ----
          const v = Math.floor(hash2(tx, ty, 9) * 4);
          const e = this.landEdge(tx, ty);
          const g = winter
            ? getGround('ice', { edge: e, variant: v })
            : getGround('water', { edge: e, variant: v, frame: 0 });
          ctx.drawImage(g.cv, Math.round(sx + g.ox), Math.round(sy + g.oy));
          if (!this.tycoon || this.tycoon.ownedAt(tx, ty)) {
            if (!winter) this.waterList.push({ sx, sy: syF, tx, ty, v, e });
            this.bridgeList.push({ sx, sy: syF, tx, ty, mask: this.roadMask(tx, ty) });
          }
        } else if (m.road[i]) {
          const g = getGround('road', { road: this.roadMask(tx, ty), variant: Math.floor(hash2(tx, ty, 5) * 4) });
          ctx.drawImage(g.cv, Math.round(sx + g.ox), Math.round(sy + g.oy));
          // 路灯收集：直道与路口按哈希点缀（每帧由主循环画杆 / 夜光 / 光池）
          if (this.lampSp) {
            const mask = this.roadMask(tx, ty);
            if ((mask === 5 || mask === 10 || mask === 15) && hash2(tx, ty, 911) < 0.085) {
              this.lampList.push({ sx, sy, key: tx + ty + 0.5 });
            }
          }
        } else {
          // v6 冬季地表替换（纯视觉）：草地/花田/秋原/沼泽 → 积雪，耕地 → 休耕干土
          const k = winter ? this.winterKind(m.terr[i]) : m.terr[i];
          const v = Math.floor(hash2(tx, ty, 9) * 4);
          const edge = this.waterEdge(tx, ty);
          if (k === TERR_WATER) {
            if (winter) {
              // 封冻水面：静态冰面（无波光动画）
              const g = getGround('ice', { edge: this.landEdge(tx, ty), variant: v });
              ctx.drawImage(g.cv, Math.round(sx + g.ox), Math.round(sy + g.oy));
            } else {
              // 动态水面：缓存固定帧 0；已购区水面入列，每帧按当前波光帧重画
              const e = this.landEdge(tx, ty);
              const g = getGround('water', { edge: e, variant: v, frame: 0 });
              ctx.drawImage(g.cv, Math.round(sx + g.ox), Math.round(sy + g.oy));
              if (!this.tycoon || this.tycoon.ownedAt(tx, ty)) {
                this.waterList.push({ sx, sy: syF, tx, ty, v, e });
              }
            }
          } else if (k === TERR_SAND) {
            const g = getGround('sand', { variant: v });
            ctx.drawImage(g.cv, Math.round(sx + g.ox), Math.round(sy + g.oy));
          } else if (k === TERR_FARM) {
            const g = getGround('farm', { variant: v, edge });
            ctx.drawImage(g.cv, Math.round(sx + g.ox), Math.round(sy + g.oy));
          } else if (k === TERR_ROCK) {
            const g = getGround('rock', { variant: v, edge, snow: this.snowEdge(tx, ty) });
            ctx.drawImage(g.cv, Math.round(sx + g.ox), Math.round(sy + g.oy));
          } else if (k === TERR_SNOW) {
            const g = getGround('snow', { variant: v, edge, snow: this.rockEdge(tx, ty) });
            ctx.drawImage(g.cv, Math.round(sx + g.ox), Math.round(sy + g.oy));
          } else if (k === TERR_FLOWER) {
            const g = getGround('flower', { variant: v, edge });
            ctx.drawImage(g.cv, Math.round(sx + g.ox), Math.round(sy + g.oy));
          } else if (k === TERR_DRY) {
            const g = getGround('dry', { variant: v, edge });
            ctx.drawImage(g.cv, Math.round(sx + g.ox), Math.round(sy + g.oy));
          } else if (k === TERR_SWAMP) {
            const g = getGround('swamp', { variant: v, edge });
            ctx.drawImage(g.cv, Math.round(sx + g.ox), Math.round(sy + g.oy));
          } else if (k === TERR_AUTUMN) {
            const g = getGround('autumn', { variant: v, edge });
            ctx.drawImage(g.cv, Math.round(sx + g.ox), Math.round(sy + g.oy));
          } else {
            const g = getGround('grass', { variant: v, edge });
            ctx.drawImage(g.cv, Math.round(sx + g.ox), Math.round(sy + g.oy));
          }
        }

        // ---- v4 高度光照：海拔提亮（大气光）+ 崖脚投影（接触阴影）----
        {
          const lv = m.h[i];
          // ---- v8 坡向光照：东南坡受光提亮 / 西北坡背光压暗 → 山体立体感 ----
          // 参照 Caesar III 的坡面明暗：面向光源（东/南邻更高 = 本格在下坡）
          // 整面提亮；背光（西/北邻更高）整面压暗，山脊棱线自然浮现
          const hW2 = m.inB(tx - 1, ty) ? m.h[m.idx(tx - 1, ty)] : -1;
          const hN2 = m.inB(tx, ty - 1) ? m.h[m.idx(tx, ty - 1)] : -1;
          const hE2 = m.inB(tx + 1, ty) ? m.h[m.idx(tx + 1, ty)] : -1;
          const hS2 = m.inB(tx, ty + 1) ? m.h[m.idx(tx, ty + 1)] : -1;
          const litA = Math.min(0.22, Math.max(0, (Math.max(hE2, hS2) - lv) * 0.055));
          const darkA = Math.min(0.19, Math.max(0, (Math.max(hW2, hN2) - lv) * 0.042));
          if (litA - darkA > 0.012 || darkA - litA > 0.012) {
            if (litA > darkA) {
              ctx.globalAlpha = litA - darkA;
              ctx.fillStyle = PALETTE[64];
            } else {
              ctx.globalAlpha = darkA - litA;
              ctx.fillStyle = PALETTE[65];
            }
            ctx.beginPath();
            ctx.moveTo(sx, sy);
            ctx.lineTo(sx + 16, sy + 8);
            ctx.lineTo(sx, sy + 16);
            ctx.lineTo(sx - 16, sy + 8);
            ctx.closePath();
            ctx.fill();
            ctx.globalAlpha = 1;
          }
          if (lv >= 4) {
            // 高原顶面提亮：越高越亮（2.5D 俯视参照 SimCity 2000 / Caesar III 的高地明暗分层）
            ctx.globalAlpha = Math.min(0.34, (lv - 3) * 0.052);
            ctx.fillStyle = PALETTE[64];
            ctx.beginPath();
            ctx.moveTo(sx, sy);
            ctx.lineTo(sx + 16, sy + 8);
            ctx.lineTo(sx, sy + 16);
            ctx.lineTo(sx - 16, sy + 8);
            ctx.closePath();
            ctx.fill();
            ctx.globalAlpha = 1;
          }
          // ---- v9 宏观明暗斑驳：世界坐标低频光照（~19 格周期的柔和光斑，
          //      打破 tile 纹理的平铺感；亮斑暖白 / 暗斑冷黑，均≤0.09）----
          if (lv > 0) {
            const dvt = (fbm(tx / 19, ty / 19, 0x9EED) - 0.5) * 2;
            if (dvt > 0.26) {
              ctx.globalAlpha = Math.min(0.09, (dvt - 0.26) * 0.26);
              ctx.fillStyle = PALETTE[64];
              ctx.beginPath();
              ctx.moveTo(sx, sy);
              ctx.lineTo(sx + 16, sy + 8);
              ctx.lineTo(sx, sy + 16);
              ctx.lineTo(sx - 16, sy + 8);
              ctx.closePath();
              ctx.fill();
              ctx.globalAlpha = 1;
            } else if (dvt < -0.26) {
              ctx.globalAlpha = Math.min(0.09, (-dvt - 0.26) * 0.26);
              ctx.fillStyle = PALETTE[65];
              ctx.beginPath();
              ctx.moveTo(sx, sy);
              ctx.lineTo(sx + 16, sy + 8);
              ctx.lineTo(sx, sy + 16);
              ctx.lineTo(sx - 16, sy + 8);
              ctx.closePath();
              ctx.fill();
              ctx.globalAlpha = 1;
            }
          }
          // 崖脚投影：东/南邻格更高 → 本格顶面沿共享边压暗（接地接触阴影）
          if (hE2 > lv || hS2 > lv) {
            ctx.globalAlpha = 0.28;
            ctx.strokeStyle = PALETTE[65];
            ctx.lineWidth = 2.5;
            if (hE2 > lv) {
              ctx.beginPath();
              ctx.moveTo(sx + 15, sy + 9);
              ctx.lineTo(sx + 1, sy + 15);
              ctx.stroke();
            }
            if (hS2 > lv) {
              ctx.beginPath();
              ctx.moveTo(sx - 15, sy + 9);
              ctx.lineTo(sx - 1, sy + 15);
              ctx.stroke();
            }
            ctx.globalAlpha = 1;
          }
        }
      }
    }
  }

  /** 动态水面重画（两帧波光 + 崖脚 AO 同步；仅帧切换或相机移动时执行） */
  private drawWaterAnim(ctx: CanvasRenderingContext2D, wf: number, dcx: number, dcy: number): void {
    if (this.waterAnim.wf === wf && this.waterAnim.dcx === dcx && this.waterAnim.dcy === dcy) return;
    this.waterAnim = { wf, dcx, dcy };
    const m = this.map;
    for (const w of this.waterList) {
      const sx = w.sx + dcx, sy = w.sy + dcy;
      if (sx < -48 || sx > this.lw + 48 || sy < -48 || sy > this.lh + 48) continue;
      const g = getGround('water', { edge: w.e, variant: w.v, frame: wf });
      ctx.drawImage(g.cv, Math.round(sx + g.ox), Math.round(sy + g.oy));
      // 崖脚 AO：东/南邻格更高时沿共享边压暗（与缓存层一致，重画后补齐）
      const hE2 = m.inB(w.tx + 1, w.ty) ? m.h[m.idx(w.tx + 1, w.ty)] : -1;
      const hS2 = m.inB(w.tx, w.ty + 1) ? m.h[m.idx(w.tx, w.ty + 1)] : -1;
      if (hE2 > 0 || hS2 > 0) {
        ctx.globalAlpha = 0.28;
        ctx.strokeStyle = PALETTE[65];
        ctx.lineWidth = 2.5;
        if (hE2 > 0) {
          ctx.beginPath();
          ctx.moveTo(sx + 15, sy + 9);
          ctx.lineTo(sx + 1, sy + 15);
          ctx.stroke();
        }
        if (hS2 > 0) {
          ctx.beginPath();
          ctx.moveTo(sx - 15, sy + 9);
          ctx.lineTo(sx - 1, sy + 15);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
      }
    }
  }

  private roadMask(tx: number, ty: number): number {
    const m = this.map;
    let v = 0;
    if (m.inB(tx, ty - 1) && m.road[m.idx(tx, ty - 1)]) v |= 1;
    if (m.inB(tx + 1, ty) && m.road[m.idx(tx + 1, ty)]) v |= 2;
    if (m.inB(tx, ty + 1) && m.road[m.idx(tx, ty + 1)]) v |= 4;
    if (m.inB(tx - 1, ty) && m.road[m.idx(tx - 1, ty)]) v |= 8;
    return v;
  }

  /** v6 冬季地表替换（纯视觉）：草地/花田/秋原/沼泽 → 积雪；耕地 → 休耕干土 */
  private winterKind(k: number): number {
    if (k === TERR_GRASS || k === TERR_FLOWER || k === TERR_AUTUMN || k === TERR_SWAMP) return TERR_SNOW;
    if (k === TERR_FARM) return TERR_DRY;
    return k;
  }

  /** v6 跨水桥绘制（桥板精灵抬升 1 级 + 混凝土桥墩 + 水面投影；每帧在水面上层） */
  private drawBridges(ctx: CanvasRenderingContext2D, dcx: number, dcy: number): void {
    if (!this.bridgeList.length) return;
    for (const b of this.bridgeList) {
      const sx = b.sx + dcx, sy = b.sy + dcy;
      if (sx < -64 || sx > this.lw + 64 || sy < -48 || sy > this.lh + 48) continue;
      // 桥板（连接掩码自动拼接护栏 / 钢梁剖面）
      const g = getGround('bridge', { road: b.mask, variant: 0 });
      const bx = Math.round(sx + g.ox), by = Math.round(sy + g.oy);
      // 水面投影：桥板正下方一条暗带（贴南侧两菱边）
      ctx.globalAlpha = 0.30;
      ctx.strokeStyle = PALETTE[65];
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(sx - 11, sy + 7);
      ctx.lineTo(sx, sy + 12);
      ctx.lineTo(sx + 11, sy + 7);
      ctx.stroke();
      ctx.globalAlpha = 1;
      // 混凝土桥墩：南角两侧各一座（板底 → 水下）
      const pillar = (px: number) => {
        ctx.fillStyle = PALETTE[27];   // 混凝土亮面
        ctx.fillRect(px, sy + 4, 3, 8);
        ctx.fillStyle = PALETTE[29];   // 背光面
        ctx.fillRect(px + 2, sy + 4, 1, 8);
        ctx.fillStyle = PALETTE[24];   // 水线压暗
        ctx.fillRect(px, sy + 10, 3, 2);
      };
      pillar(Math.round(sx - 7));
      pillar(Math.round(sx + 4));
      // 桥板最上层（盖住投影起端）
      ctx.drawImage(g.cv, bx, by);
    }
  }

  /** 悬崖立面风格：按地表类型（路堤一律土坡） */
  private cliffStyleAt(i: number): CliffStyle {
    const m = this.map;
    if (m.road[i]) return 'earth';
    const k = m.terr[i];
    if (k === TERR_SNOW) return 'snow';
    if (k === TERR_ROCK) return 'rock';
    if (k === TERR_SAND) return 'sand';
    if (k === TERR_DRY) return 'dry';
    return 'earth';
  }

  private waterEdge(tx: number, ty: number): number {
    const m = this.map;
    let v = 0;
    if (!m.inB(tx, ty - 1) || m.terr[m.idx(tx, ty - 1)] === TERR_WATER) v |= 1;
    if (!m.inB(tx + 1, ty) || m.terr[m.idx(tx + 1, ty)] === TERR_WATER) v |= 2;
    if (!m.inB(tx, ty + 1) || m.terr[m.idx(tx, ty + 1)] === TERR_WATER) v |= 4;
    if (!m.inB(tx - 1, ty) || m.terr[m.idx(tx - 1, ty)] === TERR_WATER) v |= 8;
    return v;
  }

  private landEdge(tx: number, ty: number): number {
    const m = this.map;
    let v = 0;
    if (!m.inB(tx, ty - 1) || m.terr[m.idx(tx, ty - 1)] !== TERR_WATER) v |= 1;
    if (!m.inB(tx + 1, ty) || m.terr[m.idx(tx + 1, ty)] !== TERR_WATER) v |= 2;
    if (!m.inB(tx, ty + 1) || m.terr[m.idx(tx, ty + 1)] !== TERR_WATER) v |= 4;
    if (!m.inB(tx - 1, ty) || m.terr[m.idx(tx - 1, ty)] !== TERR_WATER) v |= 8;
    return v;
  }

  /** v9 雪线过渡（rock tile 用）：北/东邻为雪地 → 顶缘挂雪犬牙 */
  private snowEdge(tx: number, ty: number): number {
    const m = this.map;
    let v = 0;
    if (m.inB(tx, ty - 1) && m.terr[m.idx(tx, ty - 1)] === TERR_SNOW) v |= 1;
    if (m.inB(tx + 1, ty) && m.terr[m.idx(tx + 1, ty)] === TERR_SNOW) v |= 2;
    return v;
  }

  /** v9 雪线过渡（snow tile 用）：南/西邻为岩地 → 底缘露岩犬牙 */
  private rockEdge(tx: number, ty: number): number {
    const m = this.map;
    let v = 0;
    if (m.inB(tx, ty + 1) && m.terr[m.idx(tx, ty + 1)] === TERR_ROCK) v |= 4;
    if (m.inB(tx - 1, ty) && m.terr[m.idx(tx - 1, ty)] === TERR_ROCK) v |= 8;
    return v;
  }

  // ---------------- 经营：领地迷雾与购地 ----------------

  /** 整块领地菱形迷雾：可购块半透明 + 金色虚线边；远锁块深色 */
  private drawTerritoryFog(ctx: CanvasRenderingContext2D, vr: { x0: number; y0: number; x1: number; y1: number }): void {
    const eco = this.tycoon!;
    const c0x = Math.max(0, vr.x0 >> 4), c1x = Math.min(CHUNKS - 1, (vr.x1 + 15) >> 4);
    const c0y = Math.max(0, vr.y0 >> 4), c1y = Math.min(CHUNKS - 1, (vr.y1 + 15) >> 4);
    // 两档暗度：可购 0.42 / 远锁 0.72（各合并为单次 fill）
    for (const [buyable, alpha] of [[true, 0.42], [false, 0.72]] as const) {
      ctx.beginPath();
      let n = 0;
      for (let cy = c0y; cy <= c1y; cy++) {
        for (let cx = c0x; cx <= c1x; cx++) {
          if (eco.chunkOwned(cx, cy)) continue;
          if (eco.purchasable(cx, cy) !== buyable) continue;
          const x0 = cx * CHUNK, y0 = cy * CHUNK, x1 = x0 + CHUNK, y1 = y0 + CHUNK;
          ctx.moveTo(this.w2sx(x0, y0), this.w2sy(x0, y0));
          ctx.lineTo(this.w2sx(x1, y0), this.w2sy(x1, y0));
          ctx.lineTo(this.w2sx(x1, y1), this.w2sy(x1, y1));
          ctx.lineTo(this.w2sx(x0, y1), this.w2sy(x0, y1));
          ctx.closePath();
          n++;
        }
      }
      if (n > 0) {
        ctx.fillStyle = `rgba(7,10,24,${alpha})`;
        ctx.fill();
      }
    }
    // 可购块金色虚线描边
    ctx.setLineDash([4, 3]);
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(242,210,75,0.85)';
    ctx.beginPath();
    for (let cy = c0y; cy <= c1y; cy++) {
      for (let cx = c0x; cx <= c1x; cx++) {
        if (eco.chunkOwned(cx, cy) || !eco.purchasable(cx, cy)) continue;
        const x0 = cx * CHUNK, y0 = cy * CHUNK, x1 = x0 + CHUNK, y1 = y0 + CHUNK;
        ctx.moveTo(this.w2sx(x0, y0), this.w2sy(x0, y0));
        ctx.lineTo(this.w2sx(x1, y0), this.w2sy(x1, y0));
        ctx.lineTo(this.w2sx(x1, y1), this.w2sy(x1, y1));
        ctx.lineTo(this.w2sx(x0, y1), this.w2sy(x0, y1));
        ctx.closePath();
      }
    }
    ctx.stroke();
    ctx.setLineDash([]);
  }

  /** 点击（非拖动）落在锁定领地 → 购买；落在市政厅 → 打开财政 */
  private tryClickSpecial(pe: PointerEvent): void {
    const eco = this.tycoon;
    if (!eco || !this.downCss) return;
    if (Math.hypot(pe.clientX - this.downCss.x, pe.clientY - this.downCss.y) > 6) return;
    const d = this.display;
    if (!d) return;
    const rect = d.getBoundingClientRect();
    // v13 观察工具点击行人 → 打开市民名片（优先于市政厅/购地）
    if (pe.button === 0 && this.tool.t === 'view') {
      const card = this.spotPedestrian(pe.clientX - rect.left, pe.clientY - rect.top);
      if (card) {
        this.beeper.play('coin');
        this.hooks.onPedestrianClick?.(card);
        return;
      }
    }
    const { tx, ty } = this.tileAt(pe.clientX - rect.left, pe.clientY - rect.top);
    if (!this.map.inB(tx, ty)) return;
    const a = this.map.occ[this.map.idx(tx, ty)];
    if (a >= 0) {
      const o = this.map.objs.get(a)!;
      if (o.id === 'cityhall') {
        this.beeper.play('coin');
        this.hooks.onHallClick?.();
        return;
      }
    }
    if (eco.ownedAt(tx, ty)) return;
    const { cx, cy } = eco.chunkOf(tx, ty);
    const price = eco.priceOf(cx, cy);
    const r = eco.buyChunk(cx, cy);
    if (r === 'adj') {
      eco.msg?.('暂不可购买：只可购买与领地相邻的地块');
      this.beeper.play('error');
    } else if (r === 'coins') {
      eco.msg?.(`金币不足：这块地需要 ${price}G`);
      this.beeper.play('error');
    } else if (r === 'ok') {
      this.fogVer++;   // 迷雾揭示 → 地形缓存失效
      this.floatAt(cx * CHUNK + 8, cy * CHUNK + 8, `−${price}G`, '#F2D24B');
    }
  }

  // ---------------- v13 市民列传：行人给中与头像 ----------------

  /** 屏幕坐标命中行人（精灵脚底锚点 ±9px · 身高 22px；含高度补偿；返回最近者） */
  private hitPedestrian(cssX: number, cssY: number): Actor | null {
    if (!this.crowds) return null;
    const lx = cssX / this.zoom, ly = cssY / this.zoom;   // CSS → 低分辨率逻辑坐标
    let best: Actor | null = null;
    let bd = 1e9;
    for (const a of this.actors.actors) {
      if (a.kind !== 0 || a.tour) continue;   // 只接市民行人（不含游客）
      const px = a.fx + a.dx * a.t, py = a.fy + a.dy * a.t;
      const wx = (px + 0.5) * 16 + a.offX, wy = (py + 0.5) * 16 + a.offY;
      const sx = (wx - wy) - this.cam.x + this.lw / 2;
      const sy = (wx + wy) / 2 - this.cam.y + this.lh / 2 + this.groundHpx(px, py);
      if (Math.abs(lx - sx) > 9 || ly < sy - 22 || ly > sy + 4) continue;
      const dd = (lx - sx) ** 2 + (ly - sy + 9) ** 2;
      if (dd < bd) { bd = dd; best = a; }
    }
    return best;
  }

  /** 观察工具点击行人 → v15 外观认人：
   *  在册市民命中（衣装+体型+制服全等）→ 那位市民本人；
   *  未命中 → 即弃路人卡（guest）；名人册为空返回 null */
  spotPedestrian(cssX: number, cssY: number): CitzCard | null {
    const a = this.hitPedestrian(cssX, cssY);
    if (!a) return null;
    return this.tycoon?.citz.spotCard(a.look, a.body, a.role) ?? null;
  }

  /** 测试钩子：第 i 个行人的 CSS 屏幕坐标（v13 行人点击验证用） */
  actorCssAt(i: number): { x: number; y: number } | null {
    const a = this.actors.actors[i];
    if (!a || a.kind !== 0) return null;
    const px = a.fx + a.dx * a.t, py = a.fy + a.dy * a.t;
    const wx = (px + 0.5) * 16 + a.offX, wy = (py + 0.5) * 16 + a.offY;
    return {
      x: ((wx - wy) - this.cam.x + this.lw / 2) * this.zoom,
      y: ((wx + wy) / 2 - this.cam.y + this.lh / 2 + this.groundHpx(px, py)) * this.zoom,
    };
  }

  /** 市民头像（dataURL 缓存）：夜空底 + 点阵 + 等距地台 + 行人同款像素立绘（正面） */
  private avatars = new Map<string, string>();
  citizenAvatar(look: number, body: 0 | 1 | 2, role: Role, size = 64): string {
    const key = `${look}#${body}#${role}#${size}`;
    const hit = this.avatars.get(key);
    if (hit) return hit;
    this.actors.ensureSprites();
    const ps = this.actors.personSp('dr', 0, look, body, role);
    const cv = document.createElement('canvas');
    cv.width = size; cv.height = size;
    const ctx = cv.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#0B0F24';
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = 'rgba(122,140,158,0.3)';
    for (let y = 6; y < size - 6; y += 6) {
      for (let x = 6; x < size - 6; x += 6) ctx.fillRect(x, y, 1, 1);
    }
    // 等距地台（与城市地面同构的菱形）
    const cx = size / 2, cy = size - 9;
    ctx.fillStyle = '#4A5A6E';
    for (let yy = -4; yy <= 4; yy++) {
      const half = (4 - Math.abs(yy)) * 2;
      for (let xx = -half; xx <= half; xx++) {
        if (((xx + yy) & 1) !== 0) continue;
        ctx.fillRect(Math.round(cx + xx), Math.round(cy + yy), 1, 1);
      }
    }
    if (ps) {
      const scale = Math.max(2, Math.floor((size - 14) / 20));
      const w = ps.cv.width * scale, h = ps.cv.height * scale;
      ctx.drawImage(ps.cv, Math.round(cx - w / 2), Math.round(cy + 2 - h), w, h);
    }
    const url = cv.toDataURL('image/png');
    this.avatars.set(key, url);
    return url;
  }

  /** 经营模式下「领地外」施工失败的提示（可购块静默——交给点击购地） */
  private landGateFail(tx: number, ty: number): void {
    if (this.dragMode || !this.tycoon) return;
    const { cx, cy } = this.tycoon.chunkOf(tx, ty);
    if (this.tycoon.purchasable(cx, cy)) return;
    this.tycoon.msg?.('迷雾之外无法施工：先逐环购买相邻领地');
    this.beeper.play('error');
  }

  /** 屏幕偏移是否在 w×h 足印菱形内（相对锚点） */
  private inFootprint(dx: number, dy: number, w: number, h: number): boolean {
    const X = dx / 2 + dy;
    const Y = dy - dx / 2;
    return X >= 0 && X <= 16 * w && Y >= 0 && Y <= 16 * h;
  }

  /** 尘土粒子：等距椭圆环扩散 + 有序抖动，复古尘雾感（贴地随高度） */
  private drawPuffs(ctx: CanvasRenderingContext2D, now: number): void {
    for (let i = this.puffs.length - 1; i >= 0; i--) {
      const p = this.puffs[i];
      const life = p.big ? 560 : 380;
      const age = (now - p.t0) / life;
      if (age >= 1) { this.puffs.splice(i, 1); continue; }
      const cx = this.w2sx(p.x, p.y);
      const cy = this.w2sy(p.x, p.y) + this.groundHpx(p.x, p.y) - (p.big ? 8 : 3);
      const R = (p.big ? 13 : 7) * (0.4 + age * 0.9);
      ctx.globalAlpha = 1 - age * age;
      for (let yy = -R; yy <= R; yy++) {
        for (let xx = -R * 2; xx <= R * 2; xx++) {
          const d = (xx / (R * 2)) ** 2 + (yy / R) ** 2;
          if (d > 1 || d < 0.38) continue;          // 空心扩散环
          if (((xx + yy) & 1) !== 0) continue;      // 交错抖动
          ctx.fillStyle = d > 0.72 ? '#D8C9A3' : '#B9A172';
          ctx.fillRect(Math.round(cx + xx), Math.round(cy + yy), 1, 1);
        }
      }
      ctx.globalAlpha = 1;
    }
  }

  /** 浮动文字：金币增减 / 拆除返还，上浮渐隐（贴地随高度） */
  private drawFloats(ctx: CanvasRenderingContext2D, now: number): void {
    if (!this.floats.length) return;
    ctx.font = 'bold 8px monospace';
    ctx.textAlign = 'center';
    for (let i = this.floats.length - 1; i >= 0; i--) {
      const f = this.floats[i];
      const age = (now - f.t0) / 1300;
      if (age >= 1) { this.floats.splice(i, 1); continue; }
      const cx = this.w2sx(f.x, f.y);
      const cy = this.w2sy(f.x, f.y) + this.groundHpx(f.x, f.y) - 12 - age * 15;
      ctx.globalAlpha = age < 0.65 ? 1 : (1 - age) / 0.35;
      const w = ctx.measureText(f.text).width + 6;
      ctx.fillStyle = 'rgba(11,15,36,0.92)';
      ctx.fillRect(Math.round(cx - w / 2), Math.round(cy - 8), Math.round(w), 11);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, Math.round(cx), Math.round(cy));
    }
    ctx.globalAlpha = 1;
    ctx.textAlign = 'left';
  }

  private drawCursor(ctx: CanvasRenderingContext2D): void {
    const h = this.hover;
    if (!h || !this.map.inB(h.tx, h.ty)) return;
    const tool = this.tool;
    let w = 1, hh = 1;
    if (tool.t === 'build') {
      const d = defById(tool.id);
      w = d.w; hh = d.h;
    }
    // ---- 抬升 / 降低：海拔指示光标 ----
    if (tool.t === 'lift' || tool.t === 'sink') {
      const i = this.map.idx(h.tx, h.ty);
      const cur = this.map.h[i];
      const up = tool.t === 'lift';
      const can = this.map.canTerra(h.tx, h.ty);
      const eco = this.tycoon;
      let label: string;
      let col = '#8CE38C';
      if (!can) { label = '需空地（先拆除设施）'; col = '#E05548'; }
      else if (up && cur >= HMAX) { label = `已达最高海拔 ${HMAX}`; col = '#E05548'; }
      else if (!up && cur <= 0) { label = '已是海平面'; col = '#E05548'; }
      else {
        const water = (up && cur === 0) || (!up && cur === 1);
        const cost = eco ? (water ? WATER_COST : LIFT_COST) : 0;
        label = `海拔 ${cur} → ${up ? cur + 1 : cur - 1}` +
          (water ? (up ? ' · 填海成陆' : ' · 化为水域') : '') +
          (cost ? ` · ${cost}G` : '');
        if (eco && eco.coins < cost) { col = '#E05548'; }
      }
      const x0 = this.w2sx(h.tx, h.ty), y0 = this.w2sy(h.tx, h.ty) + this.hOfs(h.tx, h.ty);
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x0 + 16, y0 + 8);
      ctx.lineTo(x0, y0 + 16);
      ctx.lineTo(x0 - 16, y0 + 8);
      ctx.closePath();
      ctx.strokeStyle = col;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([3, 2]);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.font = 'bold 8px monospace';
      const tw = ctx.measureText(label).width + 10;
      const mx = x0, my = y0 - 6;
      ctx.fillStyle = 'rgba(11,15,36,0.92)';
      ctx.fillRect(Math.round(mx - tw / 2), Math.round(my - 8), Math.round(tw), 14);
      ctx.strokeStyle = col;
      ctx.lineWidth = 1;
      ctx.strokeRect(Math.round(mx - tw / 2) + 0.5, Math.round(my - 8) + 0.5, Math.round(tw) - 1, 13);
      ctx.fillStyle = col;
      ctx.textAlign = 'center';
      ctx.fillText(label, Math.round(mx), Math.round(my + 2));
      ctx.textAlign = 'left';
      return;
    }
    // ---- 拆除模式：目标整格红框 + 建筑足迹红色警示 ----
    if (tool.t === 'doze') {
      const i = this.map.idx(h.tx, h.ty);
      const a = this.map.occ[i];
      let target = '';
      if (a >= 0) {
        const o = this.map.objs.get(a)!;
        const d = defById(o.id);
        w = d.w; hh = d.h;
        target = o.id;
      }
      const has = !!target || this.map.tree[i] >= 0 || !!this.map.road[i];
      const x0 = this.w2sx(h.tx, h.ty), y0 = this.w2sy(h.tx, h.ty) + this.hOfs(h.tx, h.ty);
      if (target) {
        // 建筑锚点足迹（o.ax/o.ay 为锚点，hover 可能在足迹内任意格）
        const o = this.map.objs.get(a)!;
        const ax = this.w2sx(o.ax, o.ay);
        const ay = this.w2sy(o.ax, o.ay) + this.hOfs(o.ax, o.ay);
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.lineTo(ax + 16 * w, ay + 8 * w);
        ctx.lineTo(ax + 16 * (w - hh), ay + 8 * (w + hh));
        ctx.lineTo(ax - 16 * hh, ay + 8 * hh);
        ctx.closePath();
        ctx.setLineDash([4, 3]);
        ctx.strokeStyle = '#E05548';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.setLineDash([]);
        // 足迹红雾
        ctx.fillStyle = 'rgba(224,85,72,0.28)';
        ctx.fill();
      } else {
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.lineTo(x0 + 16 * w, y0 + 8 * w);
        ctx.lineTo(x0 + 16 * (w - hh), y0 + 8 * (w + hh));
        ctx.lineTo(x0 - 16 * hh, y0 + 8 * hh);
        ctx.closePath();
        ctx.strokeStyle = has ? '#E05548' : 'rgba(8,10,18,0.5)';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
      // 标签：经营模式显示返还额
      if (has) {
        const eco = this.tycoon;
        let label = '拆除';
        if (eco) {
          if (target) label = `拆除 · 返还 ${Math.round(ECON[target].cost * REFUND_RATE)}G`;
          else if (this.map.road[i]) label = `拆${this.map.road[i] === 2 ? '桥' : '路'} · 返还 ${this.map.road[i] === 2 ? BRIDGE_REFUND : ROAD_REFUND}G`;
          else label = `拆树 · 返还 ${TREE_REFUND}G`;
        }
        const mx = x0 + 8 * (w - hh), my = y0 + 4 * (w + hh) - 14;
        ctx.font = 'bold 8px monospace';
        const tw = ctx.measureText(label).width + 10;
        ctx.fillStyle = 'rgba(42,12,12,0.92)';
        ctx.fillRect(Math.round(mx - tw / 2), Math.round(my - 8), Math.round(tw), 14);
        ctx.strokeStyle = '#E05548';
        ctx.lineWidth = 1;
        ctx.strokeRect(Math.round(mx - tw / 2) + 0.5, Math.round(my - 8) + 0.5, Math.round(tw) - 1, 13);
        ctx.fillStyle = '#F4D9D4';
        ctx.textAlign = 'center';
        ctx.fillText(label, Math.round(mx), Math.round(my + 2));
        ctx.textAlign = 'left';
      }
      return;
    }
    const x0 = this.w2sx(h.tx, h.ty), y0 = this.w2sy(h.tx, h.ty) + this.hOfs(h.tx, h.ty);
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x0 + 16 * w, y0 + 8 * w);
    ctx.lineTo(x0 + 16 * (w - hh), y0 + 8 * (w + hh));
    ctx.lineTo(x0 - 16 * hh, y0 + 8 * hh);
    ctx.closePath();
    ctx.strokeStyle = 'rgba(8,10,18,0.85)';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.strokeStyle = '#F4F2E8';
    ctx.lineWidth = 1;
    ctx.stroke();

    if (tool.t === 'build') {
      const bs = this.book.get(tool.id, tool.variant);
      const g = ghostSprite(bs.sp);
      const eco0 = this.tycoon;
      let fee = 0;
      if (eco0) fee = this.map.flatCount(h.tx, h.ty, w, hh) * FLAT_FEE;
      const ok = this.map.canPlace(tool.id, h.tx, h.ty) &&
        (!eco0 || eco0.gateBuild(tool.id, h.tx, h.ty, fee) === 'ok');
      ctx.drawImage(g, Math.round(x0 + bs.sp.ox), Math.round(y0 + bs.sp.oy));
      if (fee > 0) {
        // 整地费提示：足迹高度不齐时自动平整
        const label = `整地 +${fee}G`;
        ctx.font = 'bold 8px monospace';
        const tw = ctx.measureText(label).width + 10;
        const mx = x0 + 8 * (w - hh), my = y0 + 4 * (w + hh) - 16;
        ctx.fillStyle = 'rgba(30,24,8,0.92)';
        ctx.fillRect(Math.round(mx - tw / 2), Math.round(my - 8), Math.round(tw), 14);
        ctx.strokeStyle = '#F2D24B';
        ctx.lineWidth = 1;
        ctx.strokeRect(Math.round(mx - tw / 2) + 0.5, Math.round(my - 8) + 0.5, Math.round(tw) - 1, 13);
        ctx.fillStyle = '#F2D24B';
        ctx.textAlign = 'center';
        ctx.fillText(label, Math.round(mx), Math.round(my + 2));
        ctx.textAlign = 'left';
      }
      if (!ok) {
        ctx.fillStyle = 'rgba(224,85,72,0.55)';
        const W = 16 * (w + hh), H = 8 * (w + hh) + 2;
        for (let yy = 0; yy < H; yy += 2) {
          for (let xx = ((yy >> 1) % 2) * 2; xx < W * 2; xx += 4) {
            const px = x0 - 16 * hh + xx, py = y0 + yy;
            if (this.inFootprint(px - x0, py - y0, w, hh)) ctx.fillRect(px, py, 2, 1);
          }
        }
      }
    }

    // 经营模式：悬停锁定领地 → 高亮整块 + 地价牌
    const eco = this.tycoon;
    if (eco && !eco.ownedAt(h.tx, h.ty)) {
      const { cx, cy } = eco.chunkOf(h.tx, h.ty);
      if (eco.purchasable(cx, cy)) {
        const x0b = cx * CHUNK, y0b = cy * CHUNK, x1b = x0b + CHUNK, y1b = y0b + CHUNK;
        ctx.beginPath();
        ctx.moveTo(this.w2sx(x0b, y0b), this.w2sy(x0b, y0b));
        ctx.lineTo(this.w2sx(x1b, y0b), this.w2sy(x1b, y0b));
        ctx.lineTo(this.w2sx(x1b, y1b), this.w2sy(x1b, y1b));
        ctx.lineTo(this.w2sx(x0b, y1b), this.w2sy(x0b, y1b));
        ctx.closePath();
        ctx.strokeStyle = '#F2D24B';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        const price = eco.priceOf(cx, cy);
        const label = `${price}G  购地`;
        const mx = this.w2sx(x0b + 8, y0b + 8);
        const my = this.w2sy(x0b + 8, y0b + 8);
        ctx.font = 'bold 8px monospace';
        const tw = ctx.measureText(label).width + 10;
        ctx.fillStyle = 'rgba(11,15,36,0.94)';
        ctx.fillRect(Math.round(mx - tw / 2), Math.round(my - 8), Math.round(tw), 14);
        ctx.strokeStyle = '#F2D24B';
        ctx.lineWidth = 1;
        ctx.strokeRect(Math.round(mx - tw / 2) + 0.5, Math.round(my - 8) + 0.5, Math.round(tw) - 1, 13);
        ctx.fillStyle = eco.coins >= price ? '#F4F2E8' : '#E05548';
        ctx.textAlign = 'center';
        ctx.fillText(label, Math.round(mx), Math.round(my + 2));
        ctx.textAlign = 'left';
      }
    }
  }

  // ---------------- 小地图 ----------------

  private renderMini(): void {
    const mini = this.mini;
    if (!mini) return;
    const mctx = mini.getContext('2d')!;
    const n = this.map.n;
    if (this.miniDirty) {
      const W = n * MM;
      if (this.miniBase.width !== W) { this.miniBase.width = W; this.miniBase.height = W; }
      const bctx = this.miniBase.getContext('2d')!;
      const img = bctx.createImageData(W, W);
      const u32 = new Uint32Array(img.data.buffer);
      const abgr = (hex: string): number => {
        const q = parseInt(hex.slice(1), 16);
        return (255 << 24) | ((q & 255) << 16) | (((q >> 8) & 255) << 8) | ((q >> 16) & 255);
      };
      const C = {
        grass: abgr('#3B7138'), water: abgr('#3467AC'), sand: abgr('#CFB379'),
        farm: abgr('#B9C46B'), rock: abgr('#6E737F'), tree: abgr('#245129'),
        sakura: abgr('#C97B93'), road: abgr('#4A4C55'),
        snow: abgr('#DCE6F0'), flower: abgr('#A5C94F'), dry: abgr('#B99B62'),
        swamp: abgr('#3F5F48'), autumn: abgr('#C9924E'),
        res: abgr('#C25B44'), com: abgr('#E8CC4C'), ind: abgr('#9BA0A7'), civ: abgr('#5BC8B8'),
        lockNear: abgr('#2B3355'), lockFar: abgr('#12172E'),
      };
      // 高度明暗：海拔越高越亮（快速拉出地形立体感）
      const shadeCache = new Map<number, number[]>();
      const shadeOf = (base: number, hh: number): number => {
        const band = hh >= 8 ? 3 : hh >= 5 ? 2 : hh >= 3 ? 1 : 0;
        if (band === 0) return base;
        let arr = shadeCache.get(base);
        if (!arr) { arr = [base, base, base, base]; shadeCache.set(base, arr); }
        if (arr[band] !== base) return arr[band];
        const f = [0, 0.10, 0.20, 0.30][band];
        const r = base & 255, g = (base >>> 8) & 255, b = (base >>> 16) & 255;
        const r2 = Math.round(r + (244 - r) * f), g2 = Math.round(g + (246 - g) * f), b2 = Math.round(b + (240 - b) * f);
        arr[band] = (255 << 24) | (b2 << 16) | (g2 << 8) | r2;
        return arr[band];
      };
      for (let y = 0; y < n; y++) {
        for (let x = 0; x < n; x++) {
          const i = this.map.idx(x, y);
          const k = this.map.terr[i];
          let cv: number = k === 1 ? C.water : k === 2 ? C.sand
            : k === 3 ? C.farm : k === 4 ? C.rock
            : k === 5 ? C.snow : k === 6 ? C.flower : k === 7 ? C.dry
            : k === 8 ? C.swamp : k === 9 ? C.autumn : C.grass;
          if (this.map.tree[i] >= 0) cv = this.map.tree[i] === 3 ? C.sakura : C.tree;
          if (this.map.road[i]) cv = C.road;
          // 海拔明暗（建筑与迷雾不着色，保持辨识度）
          if (this.map.occ[i] < 0 && this.map.h[i] > 0) cv = shadeOf(cv, this.map.h[i]);
          const a = this.map.occ[i];
          if (a >= 0) {
            const o = this.map.objs.get(a)!;
            const cat = defById(o.id).cat;
            cv = cat === 'res' ? C.res : cat === 'com' ? C.com
              : cat === 'ind' ? C.ind : C.civ;
          }
          if (this.tycoon && !this.tycoon.chunkOwned(x >> 4, y >> 4)) {
            cv = this.tycoon.purchasable(x >> 4, y >> 4) ? C.lockNear : C.lockFar;
          }
          for (let dy = 0; dy < MM; dy++) {
            const row = (y * MM + dy) * W + x * MM;
            for (let dx = 0; dx < MM; dx++) u32[row + dx] = cv;
          }
        }
      }
      bctx.putImageData(img, 0, 0);
      this.miniDirty = false;
    }
    mctx.imageSmoothingEnabled = false;
    mctx.drawImage(this.miniBase, 0, 0);
    // 经营模式：已购领地描金边（外缘块）
    if (this.tycoon) {
      mctx.strokeStyle = '#F2D24B';
      mctx.lineWidth = 1;
      for (let cy = 0; cy < CHUNKS; cy++) {
        for (let cx = 0; cx < CHUNKS; cx++) {
          if (!this.tycoon.chunkOwned(cx, cy)) continue;
          let inner = true;
          for (let dy = -1; dy <= 1 && inner; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              if (!this.tycoon.chunkOwned(cx + dx, cy + dy)) { inner = false; break; }
            }
          }
          if (inner) continue;
          mctx.strokeRect(cx * CHUNK * MM + 0.5, cy * CHUNK * MM + 0.5, CHUNK * MM - 1, CHUNK * MM - 1);
        }
      }
    }
    const vr = this.visibleRange();
    mctx.strokeStyle = '#F4F2E8';
    mctx.lineWidth = 1;
    mctx.strokeRect(vr.x0 * MM + 0.5, vr.y0 * MM + 0.5, (vr.x1 - vr.x0) * MM, (vr.y1 - vr.y0) * MM);
  }

  private bindMini(mini: HTMLCanvasElement): void {
    const jump = (e: PointerEvent): void => {
      const rect = mini.getBoundingClientRect();
      const tx = Math.floor(((e.clientX - rect.left) / rect.width) * this.map.n);
      const ty = Math.floor(((e.clientY - rect.top) / rect.height) * this.map.n);
      this.cam.x = (tx - ty) * 16;
      this.cam.y = (tx + ty) * 8;
    };
    this.on(mini, 'pointerdown', (e) => {
      jump(e as PointerEvent);
      const mv = (ev: Event) => jump(ev as PointerEvent);
      const up = () => {
        mini.removeEventListener('pointermove', mv);
        mini.removeEventListener('pointerup', up);
      };
      mini.addEventListener('pointermove', mv);
      mini.addEventListener('pointerup', up);
    });
  }

  /** 断点切换（侧栏↔抽屉）时把小地图重绑到新画布 */
  rebindMini(cv: HTMLCanvasElement | null): void {
    if (!cv || cv === this.mini) return;
    this.listeners = this.listeners.filter(([t, n, f]) => {
      if (t === this.mini) { t.removeEventListener(n, f); return false; }
      return true;
    });
    this.mini = cv;
    cv.width = this.map.n * MM;
    cv.height = this.map.n * MM;
    this.miniDirty = true;
    this.bindMini(cv);
  }

  // ---------------- 输入 ----------------

  private pinchSpan(): number {
    const p = [...this.pointers.values()];
    return p.length >= 2 ? Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y) : 0;
  }

  private pinchMid(): { x: number; y: number } {
    const p = [...this.pointers.values()];
    return { x: (p[0].x + p[1].x) / 2, y: (p[0].y + p[1].y) / 2 };
  }

  private bindInput(display: HTMLCanvasElement): void {
    this.on(display, 'contextmenu', (e) => e.preventDefault());
    this.on(display, 'pointerdown', (e) => {
      const pe = e as PointerEvent;
      try { display.setPointerCapture(pe.pointerId); } catch { /* 无活动指针（合成事件等） */ }
      this.pointers.set(pe.pointerId, { x: pe.clientX, y: pe.clientY });
      this.downCss = { x: pe.clientX, y: pe.clientY };
      // 双指手势：取消涂画，进入捏合缩放 / 平移
      if (this.pointers.size >= 2) {
        this.painting = false;
        this.panning = false;
        this.lastTile = null;
        this.pinchDist = this.pinchSpan();
        this.lastPinch = null;
        return;
      }
      const rect = display.getBoundingClientRect();
      const cx = pe.clientX - rect.left, cy = pe.clientY - rect.top;
      this.beeper.play('click');
      if (pe.button === 1 || pe.button === 2 || this.tool.t === 'view') {
        this.panning = true;
        this.lastPan = { x: pe.clientX, y: pe.clientY };
        return;
      }
      if (pe.button !== 0) return;
      const { tx, ty } = this.tileAt(cx, cy);
      this.pushUndo();
      this.painting = true;
      this.lastTile = { x: tx, y: ty };
      this.applyToolAt(tx, ty);
    });
    this.on(display, 'pointermove', (e) => {
      const pe = e as PointerEvent;
      if (this.pointers.has(pe.pointerId)) {
        this.pointers.set(pe.pointerId, { x: pe.clientX, y: pe.clientY });
      }
      // ---- 双指：中点平移 + 距离捏合（分档缩放）----
      if (this.pointers.size >= 2) {
        const mid = this.pinchMid();
        if (this.lastPinch) {
          this.cam.x -= (mid.x - this.lastPinch.x) / this.zoom;
          this.cam.y -= (mid.y - this.lastPinch.y) / this.zoom;
        }
        this.lastPinch = mid;
        const span = this.pinchSpan();
        if (this.pinchDist > 24) {
          const ratio = span / this.pinchDist;
          const i = ZOOMS.indexOf(this.zoom);
          if (ratio > 1.30 && i < ZOOMS.length - 1) {
            const rect = display.getBoundingClientRect();
            this.setZoom(ZOOMS[i + 1], { x: mid.x - rect.left, y: mid.y - rect.top });
            this.pinchDist = span;
          } else if (ratio < 0.77 && i > 0) {
            const rect = display.getBoundingClientRect();
            this.setZoom(ZOOMS[i - 1], { x: mid.x - rect.left, y: mid.y - rect.top });
            this.pinchDist = span;
          }
        }
        return;
      }
      const rect = display.getBoundingClientRect();
      const cx = pe.clientX - rect.left, cy = pe.clientY - rect.top;
      const { tx, ty } = this.tileAt(cx, cy);
      this.hover = { tx, ty };
      this.hooks.onHover?.(tx, ty);
      if (this.panning) {
        this.cam.x -= (pe.clientX - this.lastPan.x) / this.zoom;
        this.cam.y -= (pe.clientY - this.lastPan.y) / this.zoom;
        this.lastPan = { x: pe.clientX, y: pe.clientY };
        return;
      }
      if (this.painting) {
        const lt = this.lastTile;
        if (!lt) {
          this.lastTile = { x: tx, y: ty };
          this.dragMode = true;
          this.applyToolAt(tx, ty);
          this.dragMode = false;
          return;
        }
        const steps = Math.max(Math.abs(tx - lt.x), Math.abs(ty - lt.y));
        if (steps > 0) {
          this.dragMode = true;
          for (let s = 1; s <= steps; s++) {
            const ix = Math.round(lt.x + (tx - lt.x) * s / steps);
            const iy = Math.round(lt.y + (ty - lt.y) * s / steps);
            this.applyToolAt(ix, iy);
          }
          this.dragMode = false;
          this.lastTile = { x: tx, y: ty };
        }
      }
    });
    const endPointer = (e: Event): void => {
      const pe = e as PointerEvent;
      this.pointers.delete(pe.pointerId);
      if (this.pointers.size < 2) {
        this.pinchDist = 0;
        this.lastPinch = null;
      }
      if (this.pointers.size === 0) {
        this.painting = false;
        this.panning = false;
        this.lastTile = null;
        // v8 右键快速拆除：位移 < 6px 的右键点击 → 拆除悬停格（拖拽仍是平移）
        if (pe.button === 2 && this.downCss) {
          const dist = Math.hypot(pe.clientX - this.downCss.x, pe.clientY - this.downCss.y);
          if (dist < 6) this.quickDoze(pe);
        }
        this.tryClickSpecial(pe);
        this.downCss = null;
      }
    };
    this.on(display, 'pointerup', endPointer);
    this.on(display, 'pointercancel', endPointer);
    this.on(display, 'pointerleave', () => { this.hover = null; });
    this.on(display, 'wheel', (e) => {
      const we = e as WheelEvent;
      we.preventDefault();
      const rect = display.getBoundingClientRect();
      this.setZoom(
        ZOOMS[Math.max(0, Math.min(ZOOMS.length - 1, ZOOMS.indexOf(this.zoom) + (we.deltaY < 0 ? 1 : -1)))],
        { x: we.clientX - rect.left, y: we.clientY - rect.top },
      );
    }, { passive: false });

    this.on(window, 'keydown', (e) => {
      const ke = e as KeyboardEvent;
      if (ke.target instanceof HTMLInputElement || ke.target instanceof HTMLTextAreaElement) return;
      this.keys.add(ke.code);
      if (ke.code === 'Space') { e.preventDefault(); this.center(); }
      if (ke.code === 'Equal' || ke.code === 'NumpadAdd') this.cycleZoom(1);
      if (ke.code === 'Minus' || ke.code === 'NumpadSubtract') this.cycleZoom(-1);
      if ((ke.ctrlKey || ke.metaKey) && ke.code === 'KeyZ') {
        e.preventDefault();
        if (ke.shiftKey) this.redo(); else this.undo();
      }
      if ((ke.ctrlKey || ke.metaKey) && ke.code === 'KeyY') {
        e.preventDefault();
        this.redo();
      }
      if (ke.code === 'Escape') this.setTool({ t: 'view' });
    });
    this.on(window, 'keyup', (e) => this.keys.delete((e as KeyboardEvent).code));
  }

  // ---------------- 工具应用 ----------------

  /** 拆除尘土粒子（big=整栋建筑，小=道路/树） */
  private puffAt(tx: number, ty: number, big: boolean): void {
    if (this.puffs.length > 40) this.puffs.shift();
    this.puffs.push({ x: tx + 0.5, y: ty + 0.5, t0: performance.now(), big });
  }

  /** 金币/文字浮动反馈 */
  private floatAt(tx: number, ty: number, text: string, color: string): void {
    if (this.floats.length > 24) this.floats.shift();
    this.floats.push({ x: tx + 0.5, y: ty + 0.5, t0: performance.now(), text, color });
  }

  /** v8：拆除一格（doze 工具与右键快速拆除共用入口）
   *  经营模式：建筑返还 50% 造价 · 道路/桥/树近全额返还；市政厅不可拆 */
  private dozeAt(tx: number, ty: number): void {
    const eco = this.tycoon;
    let refundId: string | null = null;
    let isRoad = false, isTree = false, isBridge = false;
    if (this.map.inB(tx, ty)) {
      const i = this.map.idx(tx, ty);
      const a = this.map.occ[i];
      if (a >= 0) {
        const o = this.map.objs.get(a)!;
        if (eco && o.id === 'cityhall') {
          if (!this.dragMode) { eco.msg?.('市政厅是城市的心脏，不可拆除'); this.beeper.play('error'); }
          return;
        }
        refundId = o.id;
      } else if (this.map.tree[i] >= 0) isTree = true;
      else if (this.map.road[i]) { isRoad = true; isBridge = this.map.road[i] === 2; }
    }
    if (this.map.bulldoze(tx, ty)) {
      this.beeper.play('delete');
      this.puffAt(tx, ty, !!refundId);
      if (eco) {
        eco.dozed++;
        if (refundId) {
          const back = eco.refundBuild(refundId);
          this.floatAt(tx, ty, `+${back}G`, '#F2D24B');
          if (!this.dragMode) eco.msg?.(`拆除 ${defById(refundId).name}：返还 ${back}G（造价 ${Math.round(REFUND_RATE * 100)}%）`);
        } else if (isRoad) {
          this.floatAt(tx, ty, `+${eco.refundRoad(isBridge)}G`, '#F2D24B');
        } else if (isTree) {
          this.floatAt(tx, ty, `+${eco.refundTree()}G`, '#F2D24B');
        }
      }
    }
  }

  /** v8：右键快速拆除 —— 任意工具下右键点击（非拖拽）目标格即拆
   *  拖拽右键仍是平移画布；空格无地上物时不响应（防误触） */
  private quickDoze(pe: PointerEvent): void {
    const display = this.display;
    if (!display) return;
    const rect = display.getBoundingClientRect();
    const { tx, ty } = this.tileAt(pe.clientX - rect.left, pe.clientY - rect.top);
    if (!this.map.inB(tx, ty)) return;
    const i = this.map.idx(tx, ty);
    if (this.map.occ[i] < 0 && this.map.tree[i] < 0 && !this.map.road[i]) return;
    this.pushUndo();
    this.dozeAt(tx, ty);
  }

  private applyToolAt(tx: number, ty: number): void {
    const t = this.tool;
    const eco = this.tycoon;
    switch (t.t) {
      case 'terr':
        if (eco) {
          if (!this.dragMode) {
            eco.msg?.('经营模式：不可改造地貌（沙盒模式专属）');
            this.beeper.play('error');
          }
          return;
        }
        if (this.map.setTerr(tx, ty, t.k)) this.beeper.play('paint');
        break;
      case 'lift':
      case 'sink': {
        const up = t.t === 'lift';
        if (eco && !eco.ownedAt(tx, ty)) { this.landGateFail(tx, ty); return; }
        const inB = this.map.inB(tx, ty);
        const cur = inB ? this.map.h[this.map.idx(tx, ty)] : -1;
        const water = (up && cur === 0) || (!up && cur === 1);
        const cost = eco ? (water ? WATER_COST : LIFT_COST) : 0;
        if (eco && eco.coins < cost) {
          if (!this.dragMode) {
            eco.msg?.(`金币不足：改造地形需要 ${cost}G/格`);
            this.beeper.play('error');
          }
          return;
        }
        const r = up ? this.map.liftAt(tx, ty) : this.map.sinkAt(tx, ty);
        if (r === 'ok') {
          this.beeper.play('paint');
          if (eco) {
            eco.coins -= cost;
            eco.addXp(1);
            this.floatAt(tx, ty, `−${cost}G`, '#E8E4D8');
          }
        } else if (!this.dragMode) {
          if (r === 'blocked') {
            eco?.msg?.('地形改造需空地：先拆除该格的建筑 / 道路 / 树木');
          } else if (r === 'max') {
            eco?.msg?.(`已达最高海拔 ${HMAX} 级`);
          } else if (r === 'bedrock') {
            eco?.msg?.('已是海平面，无法再降低');
          }
          this.beeper.play('error');
        }
        break;
      }
      case 'road': {
        if (eco) {
          if (!eco.ownedAt(tx, ty)) { this.landGateFail(tx, ty); return; }
          // v6：水面修路 = 自动架桥（造价更高）；物流网络折扣
          const isWater = this.map.inB(tx, ty) && this.map.terr[this.map.idx(tx, ty)] === TERR_WATER;
          const rc = isWater ? eco.bridgeCost() : eco.roadCost();
          if (eco.coins < rc) {
            if (!this.dragMode) {
              eco.msg?.(`金币不足：${isWater ? '架桥' : '修路'}需要 ${rc}G/格`);
              this.beeper.play('error');
            }
            return;
          }
          if (this.map.setRoad(tx, ty, true)) {
            this.beeper.play('paint');
            eco.coins -= rc; eco.roadsBuilt++; eco.addXp(isWater ? 2 : 1);
            this.floatAt(tx, ty, `−${rc}G${isWater ? ' 桥' : ''}`, '#E8E4D8');
          }
        } else if (this.map.setRoad(tx, ty, true)) {
          this.beeper.play('paint');
        }
        break;
      }
      case 'tree': {
        if (eco) {
          if (!eco.ownedAt(tx, ty)) { this.landGateFail(tx, ty); return; }
          if (eco.coins < TREE_COST) {
            if (!this.dragMode) { eco.msg?.(`金币不足：种树需要 ${TREE_COST}G/棵`); this.beeper.play('error'); }
            return;
          }
        }
        if (this.map.plantTree(tx, ty)) {
          this.beeper.play('paint');
          if (eco) { eco.coins -= TREE_COST; eco.treesPlanted++; eco.addXp(1); }
        }
        break;
      }
      case 'doze': {
        this.dozeAt(tx, ty);
        break;
      }
      case 'build': {
        const d = defById(t.id);
        const flatN = eco ? this.map.flatCount(tx, ty, d.w, d.h) : 0;
        const fee = flatN * FLAT_FEE;
        if (eco) {
          const gate = eco.gateBuild(t.id, tx, ty, fee);
          if (gate !== 'ok') {
            if (gate === 'land') {
              this.landGateFail(tx, ty);
            } else if (!this.dragMode) {
              const e = ECON[t.id];
              if (gate === 'locked') eco.msg?.(`「${d.name}」需要市政厅 LV${e.unlock} 解锁`);
              else if (gate === 'tech') eco.msg?.(`「${d.name}」需要在科技研究院研究「${techNameOf(eco.techGateOf(t.id))}」后解锁`);
              else eco.msg?.(`金币不足：「${d.name}」需要 ${e.cost + fee}G${fee ? `（含整地 ${fee}G）` : ''}`);
              this.beeper.play('error');
            }
            return;
          }
        }
        if (this.map.place(t.id, t.variant, tx, ty)) {
          this.beeper.play('place');
          this.puffAt(tx, ty, false);
          if (eco) {
            eco.payBuild(t.id, fee);
            const c = (ECON[t.id]?.cost ?? 0) + fee;
            if (c > 0) this.floatAt(tx, ty, `−${c}G`, '#E8E4D8');
          }
        } else if (!this.dragMode && this.map.inB(tx, ty)) {
          this.beeper.play('error');
        }
        break;
      }
    }
  }

  // ---------------- 撤销 ----------------

  pushUndo(): void {
    this.undoStack.push(this.map.serialize());
    if (this.undoStack.length > 24) this.undoStack.shift();
    this.redoStack.length = 0;
  }

  canUndo(): boolean { return this.undoStack.length > 0; }
  canRedo(): boolean { return this.redoStack.length > 0; }

  undo(): void {
    const s = this.undoStack.pop();
    if (!s) { this.beeper.play('error'); return; }
    this.redoStack.push(this.map.serialize());
    this.map.deserialize(s);
    this.beeper.play('click');
  }

  redo(): void {
    const s = this.redoStack.pop();
    if (!s) { this.beeper.play('error'); return; }
    this.undoStack.push(this.map.serialize());
    this.map.deserialize(s);
    this.beeper.play('click');
  }

  // ---------------- 存档 ----------------

  static SLOT_KEY = ['pxc_slot1', 'pxc_slot2', 'pxc_slot3'];

  static slotMeta(i: number): { time: string; pop: number } | null {
    try {
      const raw = localStorage.getItem(`pxc_meta${i + 1}`);
      return raw ? (JSON.parse(raw) as { time: string; pop: number }) : null;
    } catch {
      return null;
    }
  }

  saveSlot(i: number): boolean {
    try {
      localStorage.setItem(Engine.SLOT_KEY[i], this.map.serialize());
      const st = this.map.stats();
      localStorage.setItem(`pxc_meta${i + 1}`, JSON.stringify({
        time: new Date().toLocaleString('zh-CN'),
        pop: st.pop,
      }));
      this.lastSaveVer = this.map.version;
      this.beeper.play('save');
      return true;
    } catch {
      return false;
    }
  }

  loadSlot(i: number): boolean {
    const s = localStorage.getItem(Engine.SLOT_KEY[i]);
    if (!s) { this.beeper.play('error'); return false; }
    if (this.map.deserialize(s)) {
      this.beeper.play('open');
      return true;
    }
    this.beeper.play('error');
    return false;
  }

  autoSave(): void {
    try {
      if (this.tycoon) {
        this.tycoon.save(this.map);          // 经营模式：整档（地图+经济）独立保存
      } else {
        localStorage.setItem('pxc_auto', this.map.serialize());
      }
      this.lastSaveVer = this.map.version;
      this.lastSaveT = performance.now();
    } catch {
      /* 存储满时忽略 */
    }
  }

  // ---------------- 经营模式切换 ----------------

  /** 进入经营模式：data 传存档则续档，否则新开局；返回离线收益（G） */
  enterTycoon(data: Record<string, unknown> | null): number {
    const eco = new Tycoon();
    eco.msg = msg => this.hooks.onTycoonMsg?.(msg);
    eco.sfx = n => this.beeper.play(n);
    this.tycoon = eco;
    this.fogVer++;
    let earned = 0;
    if (data) earned = eco.resume(this.map, data);
    else eco.newGame(this.map);
    // v6：季节同步存档（时钟相位对齐该季开局）
    if (this.season !== eco.season) {
      this.season = eco.season;
      this.seasonClock = eco.season * Engine.SEASON_HOURS + 0.01;
      this.terrSeason = -2;
    }
    const hc = eco.hallCenter();
    this.cam.x = (hc.x - hc.y) * 16;
    this.cam.y = (hc.x + hc.y) * 8;
    this.map.onChange?.();
    this.hooks.onEcon?.(eco.view());
    return earned;
  }

  /** 退出经营模式（进度已存档） */
  exitTycoon(): void {
    if (this.tycoon) this.tycoon.save(this.map);
    this.tycoon = null;
    this.fogVer++;
    this.hooks.onEcon?.(null);
    this.map.onChange?.();
  }

  /** 研究科技（科技面板点击） */
  research(id: string): 'ok' | 'sp' | 'lock' | 'none' {
    return this.tycoon ? this.tycoon.research(id) : 'none';
  }

  /** v11 出口市场：切换「随行就市 / 惜售囤货」（财政报告按钮） */
  setExportHold(v: boolean): boolean {
    if (!this.tycoon) return false;
    this.tycoon.exportHold = v;
    this.hooks.onEcon?.(this.tycoon.view());
    return true;
  }

  loadAuto(): boolean {
    const s = localStorage.getItem('pxc_auto');
    return s ? this.map.deserialize(s) : false;
  }

  /** 导出当前视图 PNG（干净版，无扫描线） */
  exportPNG(): string {
    const S = 2;
    const cv = document.createElement('canvas');
    cv.width = this.lowres.width * S;
    cv.height = this.lowres.height * S;
    const ctx = cv.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.lowres, 0, 0, cv.width, cv.height);
    return cv.toDataURL('image/png');
  }

  randomMap(): void {
    if (this.tycoonGuard('随机地图')) return;
    this.pushUndo();
    this.map.random((Math.random() * 1e9) | 0);
    this.center();
    this.beeper.play('open');
  }

  private tycoonGuard(what: string): boolean {
    if (!this.tycoon) return false;
    this.tycoon.msg?.(`经营模式：「${what}」已禁用（沙盒模式专属）`);
    this.beeper.play('error');
    return true;
  }

  /** 一键城市：清空地上物（保留地形）并程序化生成整座城市（密度可调） */
  generateCity(): GenReport | null {
    if (this.tycoonGuard('一键城市')) return null;
    this.pushUndo();
    const rep = generateCity(this.map, (Math.random() * 1e9) | 0, this.cityDensity);
    if (!rep) {
      this.beeper.play('error');
      return null;
    }
    this.center();
    this.beeper.play('open');
    return rep;
  }

  clearMap(): void {
    if (this.tycoonGuard('清空')) return;
    this.pushUndo();
    this.map.clear();
    this.beeper.play('delete');
  }
}
