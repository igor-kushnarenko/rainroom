// Тюнер: интернет-станции через <audio>, переходы через эфирные помехи.
// Станция «выплывает» из шума и «тонет» в нём; нерабочие пропускаются; без сети — только шум.
export const TUNE = { fadeOut: 0.7, fadeIn: 2.2, timeout: 9, boost: 1.2, gap: 1.4, idleNoise: 1, stationNoise: 0.12 };

/** Чистая логика выбора следующей станции с пропуском нерабочих. */
export function nextIndex(n, from, dir, bad) {
  if (!n) return -1;
  for (let k = 1; k <= n; k++) { const i = (((from + dir * k) % n) + n) % n; if (!bad.has(i)) return i; }
  return -1;
}

export class Tuner {
  constructor({ audio, onName }) {
    this.audio = audio; this.onName = onName || (() => {});
    this.list = []; this.idx = -1; this.bad = new Set();
    // два плеера: «cors» идёт через WebAudio (можно усилить громче 100% и сжать компрессором),
    // «plain» — запасной для станций без CORS, его громкость ограничена 100%
    this.cors = new Audio(); this.cors.crossOrigin = 'anonymous'; this.plain = new Audio();
    for (const e of [this.cors, this.plain]) { e.preload = 'none'; e.volume = 0; }
    this.el = this.cors; this.boost = null;
    this.mix = 0;            // 0 — только шум, 1 — станция
    this.target = 0; this.state = 'off'; // off | out | loading | in | on | dead
    this.t = 0; this.pending = 0; this.pendT = 0; this.vol = 0.6; this.on = false;
    for (const e of [this.cors, this.plain]) {
      e.addEventListener('playing', () => { if (e === this.el && this.state === 'loading') this.ready = true; });
      const fail = () => {
        if (e !== this.el || !['loading', 'in', 'on'].includes(this.state)) return;
        if (e === this.cors && this.state === 'loading') { this.stop(); this.el = this.plain; this.play(); return; } // нет CORS — пробуем напрямую
        this.skip();
      };
      e.addEventListener('error', fail); e.addEventListener('ended', fail);
    }
    window.addEventListener('online', () => { if (this.on && this.state === 'dead') { this.bad.clear(); this.go(this.idx < 0 ? 0 : this.idx); } });
  }
  async load(url = './stations.json') {
    try { this.list = await (await fetch(url, { cache: 'no-cache' })).json(); } catch { this.list = []; }
  }
  cur() { return this.list[this.idx]; }
  setVolume(v) { this.vol = v; }
  setOn(on, startId) {
    this.on = on;
    if (!on) { this.stop(); this.state = 'off'; this.mix = 0; this.el.volume = 0; return; }
    let i = this.list.findIndex((s) => s.id === startId); if (i < 0) i = 0;
    this.go(i);
  }
  /** Поворот ручки на steps (колесо мыши/кнопки). Быстрая прокрутка копится. */
  turn(steps) {
    if (!this.on || !this.list.length) return;
    this.pending += steps; this.pendT = 0.35;
    if (this.state !== 'out') { this.state = 'out'; this.audio.radioSweep?.(Math.sign(steps)); }
  }
  go(i) {
    if (!navigator.onLine || i < 0) { this.state = 'dead'; this.stop(); this.onName(null); return; }
    this.idx = i; const s = this.cur();
    this.state = 'loading'; this.t = 0; this.el = this.cors; this.play(); this.hold = TUNE.gap; // минимум шума между станциями
  }
  play() {
    if (this.el === this.cors && !this.boost && this.audio.ctx) { // подключаем к WebAudio один раз
      try { const c = this.audio.ctx, src = c.createMediaElementSource(this.cors); const g = c.createGain(); g.gain.value = 0;
        const comp = c.createDynamicsCompressor(); comp.threshold.value = -18; comp.ratio.value = 3; comp.attack.value = 0.01; comp.release.value = 0.3;
        src.connect(g).connect(comp).connect(this.audio.master); this.boost = g; } catch { this.el = this.plain; }
    }
    this.ready = false; this.el.src = this.cur().url; this.el.play().catch(() => {}); // ошибки ловит 'error' или таймаут
  }
  skip() {
    this.bad.add(this.idx); this.stop();
    const dir = this.lastDir || 1; const i = nextIndex(this.list.length, this.idx, dir, this.bad);
    if (i < 0) { this.state = 'dead'; this.onName(null); return; }
    this.go(i);
  }
  stop() { for (const e of [this.cors, this.plain]) { try { e.pause(); e.removeAttribute('src'); e.load(); } catch {} } }
  update(dt) {
    const s = this.state;
    if (s === 'out') { // станция тонет в помехах, ждём конца прокрутки
      this.mix = Math.max(0, this.mix - dt / TUNE.fadeOut); this.pendT -= dt;
      if (this.mix <= 0 && this.pendT <= 0) {
        const steps = this.pending; this.pending = 0; this.lastDir = Math.sign(steps) || 1;
        this.stop();
        let i = this.idx; const n = this.list.length;
        for (let k = 0; k < Math.abs(steps); k++) i = nextIndex(n, i, this.lastDir, this.bad);
        this.go(i);
      }
    } else if (s === 'loading') {
      this.t += dt; this.mix = 0; this.hold -= dt;
      if (this.ready && this.hold <= 0) { this.ready = false; this.state = 'in'; this.onName(this.cur()?.name); }
      if (this.t > TUNE.timeout) this.skip();
    } else if (s === 'in') {
      this.mix = Math.min(1, this.mix + dt / TUNE.fadeIn); if (this.mix >= 1) this.state = 'on';
    }
    // кривая: станция нарастает плавно, шум уходит быстрее, но не до нуля — как у настоящего приёмника
    const m = this.mix * this.mix * (3 - 2 * this.mix);
    const v = this.on ? this.vol * m : 0;
    if (this.el === this.cors && this.boost) { this.cors.volume = 1; this.plain.volume = 0; this.boost.gain.setTargetAtTime(v * TUNE.boost, this.audio.ctx.currentTime, 0.05); }
    else { this.plain.volume = Math.min(1, v * 1.6); this.cors.volume = 0; if (this.boost) this.boost.gain.value = 0; }
    this.audio.setRadioNoise?.(this.on ? TUNE.stationNoise + (TUNE.idleNoise - TUNE.stationNoise) * (1 - Math.sqrt(m)) : 0);
  }
}
