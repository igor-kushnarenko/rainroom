import { rainParams } from './settings.js';
// Процедурный звук: дождь по стеклу, редкие капли-«тики», далёкий мягкий гром, гул комнаты, эфирные помехи радио.
// Без внешних файлов. Уровни держим низкими (громкость подбирается по отзывам владельца).
export class Ambience {
  constructor() { this.ctx = null; this.muted = false; this.volumes = {}; this.rainLevel = 0.5; }
  setMuted(m) { this.muted = m; if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.8, this.ctx.currentTime, 0.1); }
  start() {
    if (this.ctx) { if (this.ctx.state !== 'running') this.ctx.resume(); return; }
    const ctx = (this.ctx = new (window.AudioContext || window.webkitAudioContext)());
    this.master = ctx.createGain(); this.master.gain.value = this.muted ? 0 : 0.8;
    const lim = ctx.createDynamicsCompressor(); lim.threshold.value = -10; lim.ratio.value = 8;
    this.master.connect(lim).connect(ctx.destination);
    this.noise = this.makeNoise(4); this.brown = this.makeBrown(6);
    this.bus = {};
    for (const k of ['rain', 'glass', 'thunder', 'room', 'fx']) { const g = ctx.createGain(); g.connect(this.master); this.bus[k] = g; }
    // дождь по стеклу: две полосы шума — шелест (высокая) и мягкий «барабан» (средняя)
    const r1 = ctx.createBufferSource(); r1.buffer = this.noise; r1.loop = true;
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 900;
    this.rainLp = ctx.createBiquadFilter(); this.rainLp.type = 'lowpass'; this.rainLp.frequency.value = 5000;
    this.rainGain = ctx.createGain(); this.rainGain.gain.value = 0;
    r1.connect(hp).connect(this.rainLp).connect(this.rainGain).connect(this.bus.rain); r1.start();
    const r2 = ctx.createBufferSource(); r2.buffer = this.brown; r2.loop = true;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 420; bp.Q.value = 0.6;
    this.rainLow = ctx.createGain(); this.rainLow.gain.value = 0;
    r2.connect(bp).connect(this.rainLow).connect(this.bus.rain); r2.start();
    // гул комнаты: очень тихий низкий фон
    const hum = ctx.createBufferSource(); hum.buffer = this.brown; hum.loop = true; hum.playbackRate.value = 0.6;
    const hlp = ctx.createBiquadFilter(); hlp.type = 'lowpass'; hlp.frequency.value = 180;
    const hg = ctx.createGain(); hg.gain.value = 0.05; hum.connect(hlp).connect(hg).connect(this.bus.room); hum.start();
    // радио-помехи (как в campfire)
    this.radioOut = ctx.createGain(); this.radioOut.gain.value = 0; this.radioOut.connect(this.master);
    const st = ctx.createBufferSource(); st.buffer = this.noise; st.loop = true;
    const shp = ctx.createBiquadFilter(); shp.type = 'highpass'; shp.frequency.value = 300;
    this.radioBp = ctx.createBiquadFilter(); this.radioBp.type = 'bandpass'; this.radioBp.frequency.value = 1800; this.radioBp.Q.value = 0.5;
    this.radioHiss = ctx.createGain(); this.radioHiss.gain.value = 0.04;
    st.connect(shp).connect(this.radioBp).connect(this.radioHiss).connect(this.radioOut); st.start();
    this.nextTick = ctx.currentTime; this.nextTap = ctx.currentTime; this.burst = 0; this.nextRadioPop = ctx.currentTime;
    this.applyVolumes();
    this.timer = setInterval(() => this.schedule(), 100);
    if (ctx.state !== 'running') ctx.resume();
    const u = ctx.createBufferSource(); u.buffer = ctx.createBuffer(1, 1, 22050); u.connect(ctx.destination); u.start(0); // iOS
  }
  makeNoise(sec) { const b = this.ctx.createBuffer(1, this.ctx.sampleRate * sec, this.ctx.sampleRate), d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; return b; }
  makeBrown(sec) { const b = this.ctx.createBuffer(1, this.ctx.sampleRate * sec, this.ctx.sampleRate), d = b.getChannelData(0); let l = 0; for (let i = 0; i < d.length; i++) { l = (l + 0.02 * (Math.random() * 2 - 1)) / 1.02; d[i] = l * 3.5; } return b; }
  setVolumes(v) { this.volumes = { ...this.volumes, ...v }; this.applyVolumes(); }
  setRain(level) { this.rainLevel = level; this.applyVolumes(); }
  setRadio(on, vol = this.radioVol ?? 0.5) { this.radioOn = !!on; this.radioVol = vol; this.applyVolumes(); }
  setRadioNoise(x) { if (Math.abs((this.radioNoise ?? 1) - x) < 0.004) return; this.radioNoise = x; this.applyVolumes(); }
  applyVolumes() {
    if (!this.bus) return; const t = this.ctx.currentTime;
    for (const [k, g] of Object.entries(this.bus)) g.gain.setTargetAtTime(this.volumes[k] ?? 1, t, 0.15);
    const R = (this.R = rainParams(this.rainLevel));
    this.rainGain.gain.setTargetAtTime(R.soundGain, t, 1.2); this.rainLow.gain.setTargetAtTime(R.soundGain * 0.6, t, 1.2);
    this.rainLp.frequency.setTargetAtTime(R.soundCutoff, t, 1.2);
    this.radioOut.gain.setTargetAtTime(this.radioOn ? 1.2 * (this.radioVol ?? 0.5) * (this.radioNoise ?? 1) : 0, t, this.radioOn ? 0.25 : 0.08);
  }
  schedule() {
    const ctx = this.ctx, t = ctx.currentTime, R = this.R || rainParams(this.rainLevel);
    while (this.nextTick < t + 0.2) { this.tick(this.nextTick); this.nextTick += -Math.log(1 - Math.random()) * R.tickInterval; }
    // капли барабанят по стеклу: пуассоновский поток с «порывами» (то гуще, то реже)
    while (this.nextTap < t + 0.2) {
      this.tap(this.nextTap);
      if (Math.random() < 0.02) this.burst = 0.6 + Math.random() * 1.5; this.burst = Math.max(0, this.burst - 0.05);
      const rate = R.tapRate * (0.6 + 0.8 * Math.random()) * (1 + this.burst * 1.5);
      this.nextTap += -Math.log(1 - Math.random()) / rate;
    }
    this.tickRadio(t);
  }
  /** Удар капли по стеклу: короткий звонкий «тук» — резонанс стекла + щелчок. */
  tap(t) {
    const ctx = this.ctx; t = Math.max(t, ctx.currentTime); const big = Math.random() < 0.15; const amp = (big ? 0.05 : 0.018) * (0.4 + Math.random());
    const o = ctx.createOscillator(); o.type = 'sine'; const f = (big ? 900 : 1600) + Math.random() * 2600; o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(f * 0.82, t + 0.03);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(amp, t + 0.002); g.gain.exponentialRampToValueAtTime(0.0001, t + (big ? 0.06 : 0.025));
    const src = ctx.createBufferSource(); src.buffer = this.noise; const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 4000 + Math.random() * 3000; bp.Q.value = 2;
    const g2 = ctx.createGain(); g2.gain.setValueAtTime(amp * 0.8, t); g2.gain.exponentialRampToValueAtTime(0.0001, t + 0.012);
    const pan = ctx.createStereoPanner?.(); if (pan) pan.pan.value = Math.random() * 1.8 - 0.9; const out = pan || this.bus.glass; if (pan) pan.connect(this.bus.glass);
    o.connect(g).connect(out); src.connect(bp).connect(g2).connect(out);
    o.start(t); o.stop(t + 0.08); src.start(t, Math.random() * 3, 0.02);
  }
  tick(t) { // капля по стеклу: короткий глухой «тик»
    const ctx = this.ctx, src = ctx.createBufferSource(); src.buffer = this.noise;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1800 + Math.random() * 3000; bp.Q.value = 5;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.02 + Math.random() * 0.04, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.025);
    const pan = ctx.createStereoPanner?.(); if (pan) pan.pan.value = Math.random() * 1.6 - 0.8;
    src.connect(bp).connect(g); (pan ? g.connect(pan) : g).connect(this.bus.rain); src.start(Math.max(t, ctx.currentTime), Math.random() * 3, 0.03);
  }
  /** Далёкий мягкий гром через delay с, сила 0..1. */
  thunder(delay = 2, power = 0.6) {
    if (!this.ctx) return; const ctx = this.ctx, t = ctx.currentTime + delay, dur = 4 + power * 4;
    const src = ctx.createBufferSource(); src.buffer = this.brown; src.loop = true; src.playbackRate.value = 0.35 + Math.random() * 0.15;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(260, t); lp.frequency.exponentialRampToValueAtTime(70, t + dur);
    const g = ctx.createGain(); const peak = 0.12 + 0.12 * power;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + 0.6);
    g.gain.exponentialRampToValueAtTime(peak * 0.5, t + 1.6); g.gain.exponentialRampToValueAtTime(peak * 0.8, t + 2.2);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(lp).connect(g).connect(this.bus.thunder); src.start(t, Math.random() * 4); src.stop(t + dur + 0.1);
  }
  click() {
    if (!this.ctx) return; const ctx = this.ctx, t = ctx.currentTime;
    const src = ctx.createBufferSource(); src.buffer = this.noise; const g = ctx.createGain(); const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 2500;
    g.gain.setValueAtTime(0.18, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.025);
    src.connect(f).connect(g).connect(this.bus.fx); src.start(t, Math.random() * 3, 0.03);
  }
  radioSweep(dir = 1) {
    if (!this.ctx || !this.radioOn) return; const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator(); const g = ctx.createGain(); const f0 = 900 + Math.random() * 1500;
    o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(200, f0 * (dir > 0 ? 2.2 : 0.4)), t + 0.5);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.02 * (this.radioVol ?? 0.5), t + 0.08); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);
    o.connect(g).connect(this.radioOut); o.start(t); o.stop(t + 0.6);
  }
  tickRadio(t) {
    if (!this.radioOn) return; const ctx = this.ctx;
    this.radioBp.frequency.setTargetAtTime(1300 + 1100 * Math.sin(t * 0.21) * Math.sin(t * 0.07 + 1), t, 0.6);
    this.radioHiss.gain.setTargetAtTime(0.03 + 0.02 * (0.5 + 0.5 * Math.sin(t * 0.33 + Math.sin(t * 0.9))), t, 0.4);
    if (t >= this.nextRadioPop) {
      this.nextRadioPop = t + 0.05 + Math.random() * Math.random() * 1.2;
      const src = ctx.createBufferSource(); src.buffer = this.noise; const g = ctx.createGain(); const d = 0.004 + Math.random() * 0.02;
      g.gain.setValueAtTime(0.02 + Math.random() * 0.05, t); g.gain.exponentialRampToValueAtTime(0.001, t + d);
      src.connect(g).connect(this.radioOut); src.start(t, Math.random() * 3, d + 0.01);
    }
  }
}
