// ============================================================
// engine.ts — 游戏引擎：相机 / 输入 / 双通道渲染（地面+对象）/
//           幽灵预览 / 小地图 / 撤销重做 / 存档导出
// ============================================================

import { CityMap, TERR_WATER, TERR_SAND, TERR_FARM, TERR_ROCK, MAP_N } from './map';
import { SpriteBook, defById } from './catalog';
import { getGround } from './terrain';
import { ghostSprite, renderModel, type Sprite } from './softrender';
import { genTree } from './b_civ';
import { PALETTE } from './palette';
import type { Beeper } from './audio';
import { hash2 } from './rng';
import { generateCity, type GenReport } from './citygen';
import { ActorSystem } from './actors';

export type Tool =
  | { t: 'view' }
  | { t: 'terr'; k: number }
  | { t: 'tree' }
  | { t: 'road' }
  | { t: 'build'; id: string; variant: number }
  | { t: 'doze' };

const ZOOMS = [1, 2, 3];
const MM = 2;   // 小地图每格像素

export type EngineHooks = {
  onStats?: (s: { pop: number; buildings: number; roads: number; trees: number }) => void;
  onHover?: (tx: number, ty: number) => void;
  onZoom?: (z: number) => void;
  onTool?: (t: Tool) => void;
  onFps?: (fps: number) => void;
};

type RenderItem = { key: number; draw: () => void };

export class Engine {
  map = new CityMap(MAP_N);
  book = new SpriteBook();
  actors = new ActorSystem();
  crowds = true;
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
  private treeSprites: Sprite[] = [];
  // 多点触控
  private pointers = new Map<number, { x: number; y: number }>();
  private pinchDist = 0;
  private lastPinch: { x: number; y: number } | null = null;

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
    this.treeSprites = [0, 1, 2, 3, 4, 5].map(v => renderModel(genTree(v).model));
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

  /** 鼠标 CSS 坐标 → 格坐标 */
  tileAt(cssX: number, cssY: number): { tx: number; ty: number } {
    const sx = cssX / this.zoom, sy = cssY / this.zoom;
    const ax = sx + this.cam.x - this.lw / 2;   // = (X−Y)*16
    const ay = sy + this.cam.y - this.lh / 2;   // = (X+Y)*8
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

  crowdCount(): { peds: number; cars: number } {
    return { peds: this.actors.peds, cars: this.actors.cars };
  }

  cycleZoom(dir: number): void {
    const i = ZOOMS.indexOf(this.zoom);
    const j = Math.max(0, Math.min(ZOOMS.length - 1, i + dir));
    if (j !== i) this.setZoom(ZOOMS[j]);
  }

  setZoom(z: number, focusCss?: { x: number; y: number }): void {
    if (z === this.zoom) return;
    let keep: { gx: number; gy: number } | null = null;
    if (focusCss) {
      const t = this.tileAt(focusCss.x, focusCss.y);
      keep = { gx: t.tx + 0.5, gy: t.ty + 0.5 };
    }
    this.zoom = z;
    this.resize();
    if (keep && focusCss) {
      const sx = focusCss.x / z, sy = focusCss.y / z;
      this.cam.x = (keep.gx - keep.gy) * 16 - sx + this.lw / 2;
      this.cam.y = (keep.gx + keep.gy) * 8 - sy + this.lh / 2;
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
    if (this.crowds) this.actors.tick(dt / 1000, this.map);
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
    const pad = 4;
    return {
      x0: Math.max(0, minX - pad), y0: Math.max(0, minY - pad),
      x1: Math.min(n - 1, maxX + pad), y1: Math.min(n - 1, maxY + pad),
    };
  }

  private render(t: number): void {
    const ctx = this.lctx;
    const { lw, lh } = this;

    // 背景虚空（深海蓝 + 稀疏星点抖动）
    ctx.fillStyle = '#0B0F24';
    ctx.fillRect(0, 0, lw, lh);
    ctx.fillStyle = '#182142';
    for (let y = 0; y < lh; y += 8) {
      for (let x = ((y >> 3) % 2) * 8; x < lw; x += 16) ctx.fillRect(x + 3, y + 5, 1, 1);
    }

    const vr = this.visibleRange();
    const wf = Math.floor(t / 620) % 2;
    const items: RenderItem[] = [];
    const m = this.map;

    // ---- Pass 1：地面 ----
    for (let ty = vr.y0; ty <= vr.y1; ty++) {
      for (let tx = vr.x0; tx <= vr.x1; tx++) {
        const i = m.idx(tx, ty);
        const sx = this.w2sx(tx, ty), sy = this.w2sy(tx, ty);
        if (sx < -96 || sx > lw + 96 || sy < -160 || sy > lh + 96) continue;

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

        if (m.road[i]) {
          const g = getGround('road', { road: this.roadMask(tx, ty), variant: Math.floor(hash2(tx, ty, 5) * 4) });
          ctx.drawImage(g.cv, Math.round(sx + g.ox), Math.round(sy + g.oy));
        } else {
          const k = m.terr[i];
          const v = Math.floor(hash2(tx, ty, 9) * 4);
          if (k === TERR_WATER) {
            const g = getGround('water', { edge: this.landEdge(tx, ty), variant: v, frame: wf });
            ctx.drawImage(g.cv, Math.round(sx + g.ox), Math.round(sy + g.oy));
          } else if (k === TERR_SAND) {
            const g = getGround('sand', { variant: v });
            ctx.drawImage(g.cv, Math.round(sx + g.ox), Math.round(sy + g.oy));
          } else if (k === TERR_FARM) {
            const g = getGround('farm', { variant: v, edge: this.waterEdge(tx, ty) });
            ctx.drawImage(g.cv, Math.round(sx + g.ox), Math.round(sy + g.oy));
          } else if (k === TERR_ROCK) {
            const g = getGround('rock', { variant: v, edge: this.waterEdge(tx, ty) });
            ctx.drawImage(g.cv, Math.round(sx + g.ox), Math.round(sy + g.oy));
          } else {
            const g = getGround('grass', { variant: v, edge: this.waterEdge(tx, ty) });
            ctx.drawImage(g.cv, Math.round(sx + g.ox), Math.round(sy + g.oy));
          }
        }
      }
    }

    // ---- Pass 2：树木 + 建筑（按前角深度排序）----
    const seen = new Set<number>();
    for (let ty = vr.y0; ty <= vr.y1; ty++) {
      for (let tx = vr.x0; tx <= vr.x1; tx++) {
        const i = m.idx(tx, ty);
        const sx = this.w2sx(tx, ty), sy = this.w2sy(tx, ty);
        if (sx < -160 || sx > lw + 160 || sy < -300 || sy > lh + 160) continue;

        const tv = m.tree[i];
        if (tv >= 0 && !m.road[i] && m.occ[i] < 0) {
          const sp = this.treeSprites[tv % this.treeSprites.length];
          const key = tx + ty;
          const dx = Math.round(sx + sp.ox), dy = Math.round(sy + sp.oy);
          items.push({ key, draw: () => ctx.drawImage(sp.cv, dx, dy) });
        }

        const a = m.occ[i];
        if (a >= 0 && !seen.has(a)) {
          seen.add(a);
          const o = m.objs.get(a)!;
          const d = defById(o.id);
          const bs = this.book.get(o.id, o.v);
          const sp = bs.sp;
          const bsx = this.w2sx(o.ax, o.ay), bsy = this.w2sy(o.ax, o.ay);
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
        }
      }
    }
    // ---- 行人 / 车辆（与建筑同序参与深度排序）----
    if (this.crowds) {
      for (const a of this.actors.actors) {
        const px = a.fx + a.dx * a.t, py = a.fy + a.dy * a.t;
        let wx: number, wy: number;
        if (a.kind === 0) {
          wx = (px + 0.5) * 16 + a.offX;
          wy = (py + 0.5) * 16 + a.offY;
        } else {
          wx = px * 16 - a.dy * 2.3;
          wy = py * 16 + a.dx * 2.3;
        }
        const sx = (wx - wy) - this.cam.x + lw / 2;
        const sy = (wx + wy) / 2 - this.cam.y + lh / 2;
        if (sx < -80 || sx > lw + 80 || sy < -60 || sy > lh + 60) continue;
        const key = (wx + wy) / 16;
        if (a.kind === 0) {
          const d = ActorSystem.dirOf(a);
          const fr = Math.floor(t / 220 + a.phase) % 2;
          const cv = this.actors.personCv(d as 'dr' | 'dl' | 'ur' | 'ul', fr, a.look);
          if (!cv) continue;
          const dx = Math.round(sx - 3), dy = Math.round(sy - 12);
          items.push({ key, draw: () => ctx.drawImage(cv, dx, dy) });
        } else {
          const d = ActorSystem.dirOf(a);
          const sp = this.actors.carSp(d as 'e' | 'w' | 's' | 'n', a.look);
          if (!sp) continue;
          const dx = Math.round(sx + sp.ox), dy = Math.round(sy + sp.oy);
          items.push({ key, draw: () => ctx.drawImage(sp.cv, dx, dy) });
        }
      }
    }

    items.sort((p, q) => p.key - q.key);
    for (const it of items) it.draw();

    // ---- Pass 3：光标 + 幽灵 ----
    this.drawCursor(ctx);

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

  private roadMask(tx: number, ty: number): number {
    const m = this.map;
    let v = 0;
    if (m.inB(tx, ty - 1) && m.road[m.idx(tx, ty - 1)]) v |= 1;
    if (m.inB(tx + 1, ty) && m.road[m.idx(tx + 1, ty)]) v |= 2;
    if (m.inB(tx, ty + 1) && m.road[m.idx(tx, ty + 1)]) v |= 4;
    if (m.inB(tx - 1, ty) && m.road[m.idx(tx - 1, ty)]) v |= 8;
    return v;
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

  /** 屏幕偏移是否在 w×h 足印菱形内（相对锚点） */
  private inFootprint(dx: number, dy: number, w: number, h: number): boolean {
    const X = dx / 2 + dy;
    const Y = dy - dx / 2;
    return X >= 0 && X <= 16 * w && Y >= 0 && Y <= 16 * h;
  }

  /** 光标菱形 + 放置幽灵 */
  private drawCursor(ctx: CanvasRenderingContext2D): void {
    const h = this.hover;
    if (!h || !this.map.inB(h.tx, h.ty)) return;
    const tool = this.tool;
    let w = 1, hh = 1;
    if (tool.t === 'build') {
      const d = defById(tool.id);
      w = d.w; hh = d.h;
    }
    const x0 = this.w2sx(h.tx, h.ty), y0 = this.w2sy(h.tx, h.ty);
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
      const ok = this.map.canPlace(tool.id, h.tx, h.ty);
      ctx.drawImage(g, Math.round(x0 + bs.sp.ox), Math.round(y0 + bs.sp.oy));
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
        res: abgr('#C25B44'), com: abgr('#E8CC4C'), ind: abgr('#9BA0A7'), civ: abgr('#5BC8B8'),
      };
      for (let y = 0; y < n; y++) {
        for (let x = 0; x < n; x++) {
          const i = this.map.idx(x, y);
          const k = this.map.terr[i];
          let cv: number = k === 1 ? C.water : k === 2 ? C.sand
            : k === 3 ? C.farm : k === 4 ? C.rock : C.grass;
          if (this.map.tree[i] >= 0) cv = this.map.tree[i] === 3 ? C.sakura : C.tree;
          if (this.map.road[i]) cv = C.road;
          const a = this.map.occ[i];
          if (a >= 0) {
            const o = this.map.objs.get(a)!;
            const cat = defById(o.id).cat;
            cv = cat === 'res' ? C.res : cat === 'com' ? C.com
              : cat === 'ind' ? C.ind : C.civ;
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

  private applyToolAt(tx: number, ty: number): void {
    const t = this.tool;
    switch (t.t) {
      case 'terr':
        if (this.map.setTerr(tx, ty, t.k)) this.beeper.play('paint');
        break;
      case 'road':
        if (this.map.setRoad(tx, ty, true)) this.beeper.play('paint');
        break;
      case 'tree':
        if (this.map.plantTree(tx, ty)) this.beeper.play('paint');
        break;
      case 'doze':
        if (this.map.bulldoze(tx, ty)) this.beeper.play('delete');
        break;
      case 'build': {
        if (this.map.place(t.id, t.variant, tx, ty)) {
          this.beeper.play('place');
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
      localStorage.setItem('pxc_auto', this.map.serialize());
      this.lastSaveVer = this.map.version;
      this.lastSaveT = performance.now();
    } catch {
      /* 存储满时忽略 */
    }
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
    this.pushUndo();
    this.map.random((Math.random() * 1e9) | 0);
    this.center();
    this.beeper.play('open');
  }

  /** 一键城市：清空地上物（保留地形）并程序化生成整座城市 */
  generateCity(): GenReport | null {
    this.pushUndo();
    const rep = generateCity(this.map, (Math.random() * 1e9) | 0);
    if (!rep) {
      this.beeper.play('error');
      return null;
    }
    this.center();
    this.beeper.play('open');
    return rep;
  }

  clearMap(): void {
    this.pushUndo();
    this.map.clear();
    this.beeper.play('delete');
  }
}
