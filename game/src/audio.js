// All sound is made here, from noise and oscillators: the wind over the plain, hoofbeats, the wheels on the
// dirt (and drumming on the bridge), the whip, thunder after the lightning, a bell for each drop of light.
export class Sound {
  constructor() { this.ctx = null; this.on = true; }

  start() {
    if (this.ctx) { this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());
    this.master = ctx.createGain(); this.master.gain.value = this.on ? 0.8 : 0; this.master.connect(ctx.destination);
    // one second of white noise, reused by everything
    const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    this.noise = buf;
    // brown-ish noise for the wind
    const bb = ctx.createBuffer(1, ctx.sampleRate * 4, ctx.sampleRate), bd = bb.getChannelData(0);
    let last = 0;
    for (let i = 0; i < bd.length; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; bd[i] = last * 3.5; }
    this.wind = this.loop(bb, 'lowpass', 500, 0.0);
    this.wheel = this.loop(buf, 'lowpass', 220, 0.0);
  }

  loop(buffer, type, freq, gain) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource(); src.buffer = buffer; src.loop = true;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq;
    const g = ctx.createGain(); g.gain.value = gain;
    src.connect(f); f.connect(g); g.connect(this.master); src.start();
    return { src, f, g };
  }

  setOn(on) {
    this.on = on;
    if (this.master) this.master.gain.setTargetAtTime(on ? 0.8 : 0, this.ctx.currentTime, 0.05);
  }

  /** continuous layers: the wind (stronger toward the storm), the wheels (with speed; louder on the bridge) */
  update(speed, onBridge, storm) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.wind.g.gain.setTargetAtTime(0.22 + storm * 0.18, t, 0.5);
    this.wind.f.frequency.setTargetAtTime(380 + storm * 300 + Math.sin(t * 0.3) * 120, t, 0.5);
    const s = Math.min(1, Math.abs(speed) / 10);
    this.wheel.g.gain.setTargetAtTime(s * (onBridge ? 0.5 : 0.3), t, 0.1);
    this.wheel.f.frequency.setTargetAtTime(onBridge ? 420 : 200, t, 0.2);
  }

  burst({ freq = 800, q = 1, type = 'bandpass', dur = 0.08, gain = 0.4, attack = 0.002, when = 0 } = {}) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime + when;
    const src = ctx.createBufferSource(); src.buffer = this.noise;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + attack); g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t, Math.random()); src.stop(t + dur + 0.05);
  }

  hoof(gait, onBridge) {
    const loud = 0.25 + Math.min(gait, 3) * 0.08;
    this.burst({ freq: onBridge ? 1400 : 380, q: onBridge ? 4 : 1.5, dur: onBridge ? 0.07 : 0.1, gain: loud * (onBridge ? 1.2 : 0.9) });
    this.burst({ freq: 120, type: 'lowpass', dur: 0.09, gain: loud * 0.8 });
  }

  whip() {
    this.burst({ freq: 3500, type: 'highpass', dur: 0.05, gain: 0.9, when: 0.18 });
    this.burst({ freq: 1800, q: 2, dur: 0.12, gain: 0.4, when: 0.19 });
  }

  thunder(delay, power = 1) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime + delay;
    const src = ctx.createBufferSource(); src.buffer = this.noise; src.loop = true;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(900, t); f.frequency.exponentialRampToValueAtTime(90, t + 3);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.9 * power, t + 0.08);
    g.gain.setTargetAtTime(0.35 * power, t + 0.3, 0.4);
    g.gain.setTargetAtTime(0.0001, t + 1.2, 1.1);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t); src.stop(t + 6);
  }

  chime(n = 0) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const notes = [523.25, 587.33, 659.25, 783.99, 880.0, 1046.5];
    const f0 = notes[n % notes.length];
    for (const [mul, gn] of [[1, 0.25], [2.01, 0.08], [3.0, 0.04]]) {
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f0 * mul;
      const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gn, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0005, t + 1.4);
      o.connect(g); g.connect(this.master); o.start(t); o.stop(t + 1.5);
    }
  }

  deliver() { [0, 2, 4, 5].forEach((n, i) => setTimeout(() => this.chime(n), i * 110)); }

  moo(dist) {
    if (!this.ctx || dist > 120) return;
    const ctx = this.ctx, t = ctx.currentTime, vol = 0.18 * (1 - dist / 120);
    const o = ctx.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(110, t); o.frequency.linearRampToValueAtTime(140, t + 0.4); o.frequency.linearRampToValueAtTime(95, t + 1.3);
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 600; f.Q.value = 6;
    const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.15); g.gain.setTargetAtTime(0.0001, t + 1.0, 0.2);
    o.connect(f); f.connect(g); g.connect(this.master); o.start(t); o.stop(t + 1.8);
  }
}
