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
import { ActorSystem, lampModel, glowPool, type Facing, type CarDir } from './actors';
import {
  Tycoon, ECON, CHUNK, CHUNKS, TREE_COST, ROAD_REFUND, TREE_REFUND,
  REFUND_RATE, LIFT_COST, WATER_COST, FLAT_FEE, BRIDGE_REFUND, SEASONS,
  techNameOf, type EconView,
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

  private listeners: Array<[EventTarget, string, EventListener]> = [];

  constructor(beeper: Beeper) {
    this.beeper = beeper;
    this.lowres = document.createElement('canvas');
    this.lctx = this.lowres.getContext('2d')!;
    this.miniBase = document.createElement('canvas');
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

  /** 季节切换：失效地形缓存（地面 / 水面 / 树冠全换装）+ 经营提示 */
  private onSeasonChanged(manual: boolean): void {
    this.terrSeason = -2;   // 强制 ensureTerrain 重绘
    this.actors.invalidate();
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
      if (!ev.fx) continue;
      const sx = this.w2sx(ev.fx.x, ev.fx.y);
      const sy = this.w2sy(ev.fx.x, ev.fx.y) + this.hOfs(ev.fx.x, ev.fx.y);
      // 火点：建筑顶部两簇橙红交替闪
      const fl = Math.floor(now / 110) % 2 === 0;
      ctx.fillStyle = fl ? '#E05548' : '#F4F2E8';
      ctx.fillRect(Math.round(sx - 4), Math.round(sy - 38), 3, 3);
      ctx.fillStyle = fl ? '#F4F2E8' : '#E05548';
      ctx.fillRect(Math.round(sx + 2), Math.round(sy - 34), 2, 2);
      // 烟柱：两股错相上升循环（复用烟囱烟精灵 3 帧）
      const smoke = this.book.smoke;
      if (smoke.length) {
        for (let c = 0; c < 2; c++) {
          const fr = Math.floor(now / 300 + c) % smoke.length;
          const s = smoke[fr];
          const rise = (now / 46 + c * 11) % 26;
          ctx.globalAlpha = 0.85 - rise / 34;
          ctx.drawImage(s.cv, Math.round(sx - 6 + c * 8 + s.ox), Math.round(sy - 36 - rise + s.oy));
          ctx.globalAlpha = 1;
        }
      }
      // 事件标签
      ctx.font = 'bold 8px monospace';
      ctx.textAlign = 'center';
      const label = `${ev.name}!`;
      const w = ctx.measureText(label).width + 6;
      ctx.fillStyle = 'rgba(11,15,36,0.92)';
      ctx.fillRect(Math.round(sx - w / 2), Math.round(sy - 56), Math.round(w), 11);
      ctx.fillStyle = '#F4F2E8';
      ctx.fillText(label, Math.round(sx), Math.round(sy - 48));
      ctx.textAlign = 'left';
    }
  }

  crowdCount(): { peds: number; cars: number; pets: number; birds: number; buses: number; boats: number; tourists: number } {
    return {
      peds: this.actors.peds, cars: this.actors.cars,
      pets: this.actors.pets, birds: this.actors.birds,
      buses: this.actors.buses, boats: this.actors.boats,
      tourists: this.actors.tourists,
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
    }
    this.actors.dayness = 1 - this.dayNight.dark;
    this.actors.winterIce = this.season === 3;   // v7：冬季冰封 → 船舶归航
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
    }
    // 经营模式：行人密度跟随实际人口（荒地开局无人，市民迁入后街巷渐热闹）
    this.actors.popNow = this.tycoon ? this.tycoon.pop : null;
    this.actors.touristsNow = this.tycoon ? this.tycoon.tourists : 0;   // v10 游客漫步
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
              if (sm) ctx.drawImage(sm.cv, Math.round(mx + sm.ox), Math.round(my + sm.oy));
              if (blk && blinkOn) {
                ctx.fillStyle = PALETTE[62];
                ctx.fillRect(Math.round(lx) - 1, Math.round(ly) - 1, 2, 2);
                ctx.fillStyle = PALETTE[61];
                ctx.fillRect(Math.round(lx), Math.round(ly), 1, 1);
              }
            },
          });
          // 夜光：建筑发光精灵 + 航标灯 halo
          if (dk > 0.02) {
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
        if (a.kind === 1 || a.kind === 5 || a.kind === 7) {
          // 车辆 / 巴士 / 骑行者：车道偏移（靠右 / 贴路缘）
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

    // ---- Pass 3：光标 + 幽灵 + 浮字 ----
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
