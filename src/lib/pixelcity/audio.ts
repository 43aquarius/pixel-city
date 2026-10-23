// ============================================================
// audio.ts — PC 喇叭风格音效矩阵（Web Audio 方波合成）
// 首次用户交互时惰性初始化 AudioContext。
// v14 音效矩阵：
//   · 21 种音色（新增：灾害警报/喜讯/警笛/电车铃/成就/季节/迁入/科技/救援）
//   · 主音量 0-100 + 静音开关，持久化 localStorage（pxc_sound）
//   · 同名音效节流（帧循环里不机关枪）
//   · 播放历史环形缓冲（调试与端到端测试断言用）
// ============================================================

export type SfxName =
  | 'click' | 'place' | 'paint' | 'delete' | 'error' | 'open' | 'save' | 'zoom'
  | 'coin' | 'quest' | 'level' | 'buy'
  // ---- v14 音效矩阵 ----
  | 'alarm' | 'cheer' | 'siren' | 'bell' | 'achieve' | 'season' | 'movein' | 'tech' | 'rescue'
  // ---- v16 城市节庆 ----
  | 'festival';

const STORE_KEY = 'pxc_sound';

/** 同名音效节流间隔（ms）：防止帧循环 / 拖动连放变成噪音 */
const COOLDOWN: Partial<Record<SfxName, number>> = {
  click: 60, paint: 150, coin: 420, zoom: 120, place: 90,
  bell: 9000, siren: 6000, movein: 2600, season: 1500, alarm: 2500,
};

export class Beeper {
  private ctx: AudioContext | null = null;
  private lastAt: Partial<Record<SfxName, number>> = {};
  enabled = true;
  /** 主音量 0..1（0 = 无声但保留开关状态） */
  volume = 0.7;
  /** 最近播放历史（环形 12 条：[{n, t}]，测试与调试钩子） */
  last: Array<{ n: SfxName; t: number }> = [];

  constructor() {
    if (typeof window !== 'undefined') this.loadPrefs();
  }

  // ---------------- 偏好持久化 ----------------

  loadPrefs(): void {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) {
        const d = JSON.parse(raw) as { on?: boolean; vol?: number };
        this.enabled = d.on !== false;
        if (Number.isFinite(d.vol)) this.volume = Math.max(0, Math.min(1, d.vol as number));
      }
    } catch { /* 数据损坏时用默认值 */ }
  }

  savePrefs(): void {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({ on: this.enabled, vol: this.volume }));
    } catch { /* 存储满时忽略 */ }
  }

  private ensure(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return null;
      this.ctx = new AC();
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    return this.ctx;
  }

  /** 单音：方波 + 快速衰减 */
  private tone(freq: number, dur: number, at: number, vol = 0.08, type: OscillatorType = 'square'): void {
    const ctx = this.ensure();
    if (!ctx) return;
    const t0 = ctx.currentTime + at;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    g.gain.setValueAtTime(vol * this.volume, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(g).connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  private noise(dur: number, at: number, vol = 0.1): void {
    const ctx = this.ensure();
    if (!ctx) return;
    const t0 = ctx.currentTime + at;
    const len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < len; i++) ch[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const g = ctx.createGain();
    g.gain.value = vol * this.volume;
    src.connect(g).connect(ctx.destination);
    src.start(t0);
  }

  play(name: SfxName): void {
    if (!this.enabled) return;
    // 节流：同名音效在冷却窗内只播一次
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const cd = COOLDOWN[name] ?? 70;
    const prev = this.lastAt[name];
    if (prev !== undefined && now - prev < cd) return;
    this.lastAt[name] = now;
    // 历史环形缓冲（无论音量，只要真的触发就记录，供测试断言）
    this.last.push({ n: name, t: Math.round(now) });
    if (this.last.length > 12) this.last.shift();
    switch (name) {
      case 'click': this.tone(880, 0.045, 0); break;
      case 'place': this.tone(660, 0.05, 0); this.tone(990, 0.07, 0.05); break;
      case 'paint': this.tone(520, 0.03, 0, 0.05); break;
      case 'delete': this.noise(0.12, 0, 0.12); this.tone(160, 0.1, 0.02, 0.06, 'sawtooth'); break;
      case 'error': this.tone(140, 0.16, 0, 0.09, 'sawtooth'); break;
      case 'open': this.tone(523, 0.06, 0); this.tone(659, 0.06, 0.06); this.tone(784, 0.09, 0.12); break;
      case 'save': this.tone(784, 0.06, 0); this.tone(1046, 0.1, 0.07); break;
      case 'zoom': this.tone(440, 0.03, 0, 0.05); this.tone(587, 0.04, 0.035, 0.05); break;
      case 'coin': this.tone(1245, 0.04, 0); this.tone(1661, 0.07, 0.04); break;
      case 'buy': this.tone(392, 0.05, 0, 0.09); this.tone(523, 0.05, 0.05, 0.09); this.tone(784, 0.09, 0.1); break;
      case 'quest': this.tone(659, 0.05, 0); this.tone(784, 0.05, 0.055); this.tone(988, 0.05, 0.11); this.tone(1319, 0.09, 0.165); break;
      case 'level': this.tone(523, 0.07, 0); this.tone(659, 0.07, 0.08); this.tone(784, 0.07, 0.16); this.tone(1046, 0.14, 0.24); break;
      // ---- v14 音效矩阵 ----
      case 'alarm':    // 灾害警报：三声急促低鸣（火警/疫病/暴风雨）
        this.tone(196, 0.14, 0, 0.1);
        this.tone(196, 0.14, 0.2, 0.1);
        this.tone(165, 0.22, 0.4, 0.1);
        break;
      case 'cheer':    // 喜讯：上行琶音（丰收节/游客潮/艺术节）
        this.tone(523, 0.05, 0, 0.07); this.tone(659, 0.05, 0.055, 0.07);
        this.tone(784, 0.05, 0.11, 0.07); this.tone(1046, 0.11, 0.165, 0.08);
        break;
      case 'siren':    // 应急警笛：双频交替由远及近
        this.tone(920, 0.16, 0, 0.06); this.tone(640, 0.16, 0.16, 0.06);
        this.tone(920, 0.16, 0.32, 0.06); this.tone(640, 0.22, 0.48, 0.06);
        break;
      case 'bell':     // 电车铃：叮叮——
        this.tone(1568, 0.06, 0, 0.06, 'triangle');
        this.tone(1568, 0.11, 0.14, 0.06, 'triangle');
        break;
      case 'achieve':  // 成就解锁：小号式五连凯旋
        this.tone(523, 0.07, 0, 0.08); this.tone(659, 0.07, 0.08, 0.08);
        this.tone(784, 0.07, 0.16, 0.08); this.tone(1046, 0.07, 0.24, 0.08);
        this.tone(1319, 0.18, 0.32, 0.09);
        break;
      case 'season':   // 季节更替：柔和双音钟
        this.tone(880, 0.09, 0, 0.06, 'triangle');
        this.tone(1175, 0.15, 0.1, 0.06, 'triangle');
        break;
      case 'movein':   // 新市民迁入：门铃两音
        this.tone(659, 0.08, 0, 0.07, 'triangle');
        this.tone(523, 0.13, 0.09, 0.07, 'triangle');
        break;
      case 'tech':     // 研究完成：电子三连（锯齿波）
        this.tone(740, 0.05, 0, 0.07, 'sawtooth');
        this.tone(988, 0.05, 0.06, 0.07, 'sawtooth');
        this.tone(1245, 0.11, 0.12, 0.07, 'sawtooth');
        break;
      case 'rescue':   // 应急到场：大和弦扫弦
        this.tone(392, 0.06, 0, 0.08); this.tone(523, 0.06, 0.06, 0.08);
        this.tone(659, 0.06, 0.12, 0.08); this.tone(784, 0.15, 0.18, 0.09);
        break;
      // ---- v16 城市节庆 ----
      case 'festival':  // 节日开幕：欢快五连跳琶音 + 铃铛收尾
        this.tone(523, 0.06, 0, 0.08, 'triangle');
        this.tone(659, 0.06, 0.065, 0.08, 'triangle');
        this.tone(784, 0.06, 0.13, 0.08, 'triangle');
        this.tone(1046, 0.06, 0.195, 0.08, 'triangle');
        this.tone(1319, 0.16, 0.26, 0.09, 'triangle');
        this.tone(2093, 0.1, 0.34, 0.05, 'triangle');
        break;
    }
  }
}
