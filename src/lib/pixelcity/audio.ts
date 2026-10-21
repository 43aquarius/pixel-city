// ============================================================
// audio.ts — PC 喇叭风格音效（Web Audio 方波合成）
// 首次用户交互时惰性初始化 AudioContext。
// ============================================================

export type SfxName =
  | 'click' | 'place' | 'paint' | 'delete' | 'error' | 'open' | 'save' | 'zoom'
  | 'coin' | 'quest' | 'level' | 'buy';

export class Beeper {
  private ctx: AudioContext | null = null;
  enabled = true;

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
    g.gain.setValueAtTime(vol, t0);
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
    g.gain.value = vol;
    src.connect(g).connect(ctx.destination);
    src.start(t0);
  }

  play(name: SfxName): void {
    if (!this.enabled) return;
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
    }
  }
}
