import test from 'node:test'; import assert from 'node:assert/strict';
import { SCENE, DEVICE_IDS, hitDevice } from '../src/config.js';
import { clockText, parseWeather, weatherLabel, weatherUrl, parseWttr, wttrUrl } from '../src/clock.js';
import { nextIndex } from '../src/radio.js';
test('4 устройства, хотспоты внутри кадра и не пересекаются', () => {
  assert.deepEqual(DEVICE_IDS, ['lamp', 'lantern', 'radio', 'laptop']);
  const boxes = DEVICE_IDS.flatMap((id) => SCENE.devices[id].hot.map((b) => [id, b]));
  for (const [, [x0, y0, x1, y1]] of boxes) assert.ok(x0 >= 0 && y0 >= 0 && x1 <= SCENE.W && y1 <= SCENE.H && x0 < x1 && y0 < y1);
  for (const [a, A] of boxes) for (const [b, B] of boxes) if (a !== b) assert.ok(A[2] < B[0] || B[2] < A[0] || A[3] < B[1] || B[3] < A[1], `${a}/${b}`);
});
test('hitDevice', () => { assert.equal(hitDevice(1590, 150), 'lamp'); assert.equal(hitDevice(60, 370), 'lantern'); assert.equal(hitDevice(50, 600), 'lantern');
  assert.equal(hitDevice(550, 740), 'radio'); assert.equal(hitDevice(1420, 720), 'laptop'); assert.equal(hitDevice(800, 300), null); });
test('панель экрана ноутбука: выпуклый четырёхугольник внутри хотспота ноутбука', () => {
  const q = SCENE.screen.quad, [x0, y0, x1, y1] = SCENE.devices.laptop.hot[0]; assert.equal(q.length, 4);
  for (const [x, y] of q) assert.ok(x >= x0 && x <= x1 && y >= y0 && y <= y1);
  for (let i = 0; i < 4; i++) { const [a, b, c] = [q[i], q[(i + 1) % 4], q[(i + 2) % 4]]; assert.ok((b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]) > 0); }
  // верх и низ панели почти горизонтальны (параллельны остальным модулям экрана)
  assert.ok(Math.abs(q[1][1] - q[0][1]) < 6 && Math.abs(q[2][1] - q[3][1]) < 6);
});
test('clockText: время и дата по-русски', () => { const c = clockText(new Date(2026, 10, 2, 21, 7, 4)); assert.equal(c.time, '21:07'); assert.equal(c.date, 'пн, 2 ноя'); assert.equal(c.colon, true); });
test('parseWeather', () => { assert.deepEqual(parseWeather({ current: { temperature_2m: 11.6, weather_code: 61 } }), { temp: '+12°C', label: 'дождь', icon: 'rain' });
  assert.equal(parseWeather({ current: { temperature_2m: -3.2, weather_code: 0 } }).temp, '-3°C'); assert.equal(parseWeather({}), null); assert.equal(parseWeather(null), null); });
test('weatherLabel и url без ключа', () => { assert.equal(weatherLabel(95).t, 'гроза'); assert.equal(weatherLabel(2).t, 'облачно');
  const u = weatherUrl(SCENE.weather); assert.match(u, /^https:\/\/api\.open-meteo\.com\//); assert.doesNotMatch(u, /key/i); });
test('тюнер: nextIndex пропускает нерабочие', () => { assert.equal(nextIndex(3, 0, 1, new Set([1])), 2); assert.equal(nextIndex(3, 0, -1, new Set()), 2); assert.equal(nextIndex(2, 0, 1, new Set([0, 1])), -1); assert.equal(nextIndex(0, 0, 1, new Set()), -1); });
import { fitRect } from '../src/fit.js';
test('fitRect: contain показывает весь кадр, cover заполняет экран', () => {
  for (const [vw, vh] of [[1280, 800], [1920, 1080], [390, 844], [2560, 1080]]) {
    const c = fitRect(vw, vh, 'contain'), v = fitRect(vw, vh, 'cover');
    assert.ok(c.w <= vw && c.h <= vh && (c.w === vw || c.h === vh), `contain ${vw}x${vh}`);
    assert.ok(v.w >= vw && v.h >= vh, `cover ${vw}x${vh}`);
    assert.ok(Math.abs(c.w / c.h - 16 / 9) < 0.01 && Math.abs(v.w / v.h - 16 / 9) < 0.01);
    assert.equal(c.left, Math.floor((vw - c.w) / 2)); assert.equal(c.top, Math.floor((vh - c.h) / 2));
  }
  assert.deepEqual(fitRect(1280, 800), { w: 1280, h: 720, left: 0, top: 40 });
  assert.deepEqual(fitRect(390, 844), { w: 390, h: 219, left: 0, top: 312 });
});
test('запасная погода wttr.in', () => { assert.deepEqual(parseWttr({ current_condition: [{ temp_C: '9', weatherCode: '296' }] }), { temp: '+9°C', label: 'дождь', icon: 'rain' });
  assert.equal(parseWttr({}), null); assert.match(wttrUrl({ city: 'Анапа' }), /^https:\/\/wttr\.in\/Anapa/); });
import { buildPath, pointAt } from '../src/traffic.js';
test('дороги: внутри стекла, точки на пути, зацикливание в обе стороны', () => {
  const [gx0, gy0, gx1, gy1] = SCENE.glass;
  for (const r of SCENE.roads) for (const [x, y] of r.pts) assert.ok(x > gx0 && x < gx1 && y > gy0 && y < gy1);
  const p = buildPath({ pts: [[0, 0], [10, 0], [10, 10]] }); assert.equal(p.len, 20);
  assert.deepEqual(pointAt(p, 5), [5, 0]); assert.deepEqual(pointAt(p, 15), [10, 5]); assert.deepEqual(pointAt(p, -5), [10, 5]); assert.deepEqual(pointAt(p, 25), [5, 0]);
});
