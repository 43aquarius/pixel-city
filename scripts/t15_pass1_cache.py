#!/usr/bin/env python3
# Task 15-1: Pass1 地形层滚动缓存重构
# 1) render() 内 Pass1+迷雾（458-602 行）→ 缓存 blit + 动态水面 + 路灯列表
# 2) ensureBg 后插入新方法块：ensureTerrain / repaintTerrain / paintTerrainPass / drawWaterAnim / visibleRangeFor
# 3) fogVer++ 三处：购地成功 / enterTycoon / exitTycoon
import re, sys

P = 'src/lib/pixelcity/engine.ts'
src = open(P, encoding='utf-8').read()
lines = src.split('\n')  # 0-indexed: 行 458-602 → idx 457..601

# ---- 校验锚点 ----
assert 'Pass 1：地面（顶面随高度抬升 + 两侧崖壁）' in lines[457], lines[457]
assert 'if (this.tycoon) this.drawTerritoryFog(ctx, vr);' in lines[601], lines[601]
assert 'Pass 2：树木 + 建筑' in lines[603], lines[603]

NEW_PASS1 = '''    // ---- Pass 1（缓存层）：地面 + 崖壁 + 高度光照 + 迷雾 → 滚动缓冲 blit ----
    // 静态地形整层缓存在离屏画布（相机位移 > 96px / 地图或迷雾版本变化才全量重绘）；
    // 每帧仅一次 blit + 动态水面（两帧波光，帧切换或相机移动时才重画）+ 路灯（深度排序 / 夜光光池）
    this.ensureTerrain();
    const dcx = this.terrCam.x - this.cam.x;
    const dcy = this.terrCam.y - this.cam.y;
    if (this.terrBuf) ctx.drawImage(this.terrBuf, Math.round(dcx), Math.round(dcy));
    this.drawWaterAnim(ctx, wf, dcx, dcy);
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
    }'''

lines[457:602] = NEW_PASS1.split('\n')   # 覆盖 458-602（含迷雾两行）
src = '\n'.join(lines)

# ---- 新方法块：插在 ensureBg 之后（roadMask 之前）----
METHODS = '''
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

  /** 缓存维护：尺寸 / 相机位移 / 地图版本 / 迷雾版本 变化时全量重绘滚动缓冲 */
  private ensureTerrain(): void {
    const W = this.lw + Engine.TBUF_PAD * 2;
    const H = this.lh + Engine.TBUF_PAD * 2;
    const moved = Math.abs(this.cam.x - this.terrCam.x) > Engine.TBUF_MOVE
      || Math.abs(this.cam.y - this.terrCam.y) > Engine.TBUF_MOVE;
    if (this.terrBuf && this.terrBuf.width === W && this.terrBuf.height === H
      && this.terrVer === this.map.version && this.terrFogV === this.fogVer && !moved) return;
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

        if (m.road[i]) {
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
          const k = m.terr[i];
          const v = Math.floor(hash2(tx, ty, 9) * 4);
          const edge = this.waterEdge(tx, ty);
          if (k === TERR_WATER) {
            // 动态水面：缓存固定帧 0；已购区水面入列，每帧按当前波光帧重画
            const e = this.landEdge(tx, ty);
            const g = getGround('water', { edge: e, variant: v, frame: 0 });
            ctx.drawImage(g.cv, Math.round(sx + g.ox), Math.round(sy + g.oy));
            if (!this.tycoon || this.tycoon.ownedAt(tx, ty)) {
              this.waterList.push({ sx, sy: syF, tx, ty, v, e });
            }
          } else if (k === TERR_SAND) {
            const g = getGround('sand', { variant: v });
            ctx.drawImage(g.cv, Math.round(sx + g.ox), Math.round(sy + g.oy));
          } else if (k === TERR_FARM) {
            const g = getGround('farm', { variant: v, edge });
            ctx.drawImage(g.cv, Math.round(sx + g.ox), Math.round(sy + g.oy));
          } else if (k === TERR_ROCK) {
            const g = getGround('rock', { variant: v, edge });
            ctx.drawImage(g.cv, Math.round(sx + g.ox), Math.round(sy + g.oy));
          } else if (k === TERR_SNOW) {
            const g = getGround('snow', { variant: v, edge });
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
          // 崖脚投影：东/南邻格更高 → 本格顶面沿共享边压暗（接地接触阴影）
          const hE2 = m.inB(tx + 1, ty) ? m.h[m.idx(tx + 1, ty)] : -1;
          const hS2 = m.inB(tx, ty + 1) ? m.h[m.idx(tx, ty + 1)] : -1;
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
'''

anchor = '  private roadMask(tx: number, ty: number): number {'
assert src.count(anchor) == 1
src = src.replace(anchor, METHODS + '\n' + anchor)

# ---- waterAnim 字段（跳过缓存状态）----
fld = '''  /** 路灯杆（参与 Pass2 深度排序 + 夜间发光） */
  private lampList: Array<{ sx: number; sy: number; key: number }> = [];'''
assert src.count(fld) == 1
src = src.replace(fld, fld + '''
  /** 水面动画跳过状态（帧与偏移未变则跳过整轮重画） */
  private waterAnim = { wf: -1, dcx: 1e9, dcy: 1e9 };''')

# ---- fogVer++：购地成功 ----
old_ok = '''    } else if (r === 'ok') {
      this.floatAt(cx * CHUNK + 8, cy * CHUNK + 8, `−${price}G`, '#F2D24B');
    }'''
new_ok = '''    } else if (r === 'ok') {
      this.fogVer++;   // 迷雾揭示 → 地形缓存失效
      this.floatAt(cx * CHUNK + 8, cy * CHUNK + 8, `−${price}G`, '#F2D24B');
    }'''
assert src.count(old_ok) == 1
src = src.replace(old_ok, new_ok)

# ---- fogVer++：进出经营模式 ----
old_enter = '''    this.tycoon = eco;
    let earned = 0;'''
new_enter = '''    this.tycoon = eco;
    this.fogVer++;
    let earned = 0;'''
assert src.count(old_enter) == 1
src = src.replace(old_enter, new_enter)

old_exit = '''  exitTycoon(): void {
    if (this.tycoon) this.tycoon.save(this.map);
    this.tycoon = null;'''
new_exit = '''  exitTycoon(): void {
    if (this.tycoon) this.tycoon.save(this.map);
    this.tycoon = null;
    this.fogVer++;'''
assert src.count(old_exit) == 1
src = src.replace(old_exit, new_exit)

open(P, 'w', encoding='utf-8').write(src)
print('OK: Pass1 cache refactor applied')
print('lines now:', src.count('\\n') + 1)
