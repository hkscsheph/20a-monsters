/* ============================================================
   Sfx — tiny synthesised sounds for grabbing / dropping puppets.
   No files, no dependencies, created on the first user gesture.
   ============================================================ */

export class Sfx {
  constructor() {
    this.enabled = true;
    this.ctx = null;
    this.noiseBuffer = null;
  }

  get audio() {
    if (!this.enabled) return null;
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      this.ctx = new AC();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
    return this.ctx;
  }

  noise() {
    const ctx = this.ctx;
    if (this.noiseBuffer) return this.noiseBuffer;
    const len = Math.floor(ctx.sampleRate * 0.5);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = Math.random() * 2 - 1;
    this.noiseBuffer = buf;
    return buf;
  }

  whoosh() {
    const ctx = this.audio;
    if (!ctx) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noise();
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 1.1;
    bp.frequency.setValueAtTime(360, t);
    bp.frequency.exponentialRampToValueAtTime(1500, t + 0.2);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.11, t + 0.035);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.32);
    src.connect(bp).connect(g).connect(ctx.destination);
    src.start(t);
    src.stop(t + 0.36);
  }

  pluck(freq = 300) {
    const ctx = this.audio;
    if (!ctx) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, t);
    osc.frequency.exponentialRampToValueAtTime(freq * 0.72, t + 0.28);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.07, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
    osc.connect(g).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.34);
  }

  spin() {
    const ctx = this.audio;
    if (!ctx) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(180, t);
    osc.frequency.exponentialRampToValueAtTime(520, t + 0.18);
    osc.frequency.exponentialRampToValueAtTime(140, t + 0.55);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.05, t + 0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
    osc.connect(g).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.62);
  }

  toggle() {
    this.enabled = !this.enabled;
    if (!this.enabled) this.ctx?.suspend?.().catch(() => {});
    return this.enabled;
  }
}
