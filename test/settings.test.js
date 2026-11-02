import test from 'node:test'; import assert from 'node:assert/strict';
import { loadSettings, saveSettings, toggleDevice, setAll, setRainLevel, rainParams, DEFAULT_SETTINGS, SETTINGS_KEY } from '../src/settings.js';
const mem = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) }; };
test('defaults: всё выключено', () => { const s = loadSettings(mem()); assert.deepEqual(s.devices, DEFAULT_SETTINGS.devices); assert.equal(s.rainLevel, 0.5); });
test('битый JSON → дефолты', () => { const st = mem(); st.setItem(SETTINGS_KEY, '{oops'); assert.equal(loadSettings(st).rainLevel, 0.5); });
test('сохранение и загрузка устройств', () => { const st = mem(); let s = toggleDevice(loadSettings(st), 'lamp'); s = toggleDevice(s, 'radio'); saveSettings(s, st);
  const r = loadSettings(st); assert.equal(r.devices.lamp, true); assert.equal(r.devices.radio, true); assert.equal(r.devices.laptop, false); });
test('toggleDevice не мутирует и игнорирует неизвестное', () => { const s = loadSettings(mem()); const t = toggleDevice(s, 'lamp'); assert.equal(s.devices.lamp, false); assert.equal(t.devices.lamp, true); assert.equal(toggleDevice(s, 'tv'), s); });
test('setAll', () => { const s = setAll(loadSettings(mem()), true); assert.ok(Object.values(s.devices).every(Boolean)); });
test('громкости и сила дождя ограничены 0..1', () => { const st = mem(); st.setItem(SETTINGS_KEY, JSON.stringify({ rainLevel: 5, volumes: { rain: -1, thunder: 'x' } }));
  const s = loadSettings(st); assert.equal(s.rainLevel, 1); assert.equal(s.volumes.rain, 0); assert.equal(s.volumes.thunder, DEFAULT_SETTINGS.volumes.thunder);
  assert.equal(setRainLevel(s, -3).rainLevel, 0); });
test('rainParams монотонны, звук тихий', () => { let p = rainParams(0);
  for (let l = 0.1; l <= 1.0001; l += 0.1) { const q = rainParams(l); assert.ok(q.drops >= p.drops && q.soundGain >= p.soundGain && q.tickInterval <= p.tickInterval && q.thunderEvery <= p.thunderEvery); p = q; }
  assert.ok(rainParams(1).soundGain <= 0.1); });
test('капли по стеклу: своя громкость, тихо по умолчанию; частота растёт с дождём', () => { const s = loadSettings(mem()); assert.ok(s.volumes.glass > 0 && s.volumes.glass <= 0.5);
  assert.ok(rainParams(1).tapRate > rainParams(0.5).tapRate && rainParams(0.5).tapRate > rainParams(0).tapRate); assert.ok(rainParams(1).run > rainParams(0).run); });
