import test from 'node:test'; import assert from 'node:assert/strict';
import { SCENE, DEVICE_IDS, hitDevice } from '../src/config.js';
import { clockText, parseWeather, weatherLabel, weatherUrl } from '../src/clock.js';
import { nextIndex } from '../src/radio.js';
test('4 устройства, хотспоты внутри кадра и не пересекаются', () => {
  assert.deepEqual(DEVICE_IDS, ['lamp', 'lantern', 'radio', 'laptop']);
  const boxes = DEVICE_IDS.flatMap((id) => SCENE.devices[id].hot.map((b) => [id, b]));
  for (const [, [x0, y0, x1, y1]] of boxes) assert.ok(x0 >= 0 && y0 >= 0 && x1 <= SCENE.W && y1 <= SCENE.H && x0 < x1 && y0 < y1);
  for (const [a, A] of boxes) for (const [b, B] of boxes) if (a !== b) assert.ok(A[2] < B[0] || B[2] < A[0] || A[3] < B[1] || B[3] < A[1], `${a}/${b}`);
});
test('hitDevice', () => { assert.equal(hitDevice(1590, 150), 'lamp'); assert.equal(hitDevice(60, 370), 'lantern'); assert.equal(hitDevice(50, 600), 'lantern');
  assert.equal(hitDevice(550, 740), 'radio'); assert.equal(hitDevice(1420, 720), 'laptop'); assert.equal(hitDevice(800, 300), null); });
test('экран ноутбука и пар внутри кадра', () => { const s = SCENE.screen; assert.ok(s.x + s.w <= SCENE.W && s.y + s.h <= SCENE.H); });
test('clockText: время и дата по-русски', () => { const c = clockText(new Date(2026, 10, 2, 21, 7, 4)); assert.equal(c.time, '21:07'); assert.equal(c.date, 'пн, 2 ноя'); assert.equal(c.colon, true); });
test('parseWeather', () => { assert.deepEqual(parseWeather({ current: { temperature_2m: 11.6, weather_code: 61 } }), { temp: '+12°C', label: 'дождь', icon: 'rain' });
  assert.equal(parseWeather({ current: { temperature_2m: -3.2, weather_code: 0 } }).temp, '-3°C'); assert.equal(parseWeather({}), null); assert.equal(parseWeather(null), null); });
test('weatherLabel и url без ключа', () => { assert.equal(weatherLabel(95).t, 'гроза'); assert.equal(weatherLabel(2).t, 'облачно');
  const u = weatherUrl(SCENE.weather); assert.match(u, /^https:\/\/api\.open-meteo\.com\//); assert.doesNotMatch(u, /key/i); });
test('тюнер: nextIndex пропускает нерабочие', () => { assert.equal(nextIndex(3, 0, 1, new Set([1])), 2); assert.equal(nextIndex(3, 0, -1, new Set()), 2); assert.equal(nextIndex(2, 0, 1, new Set([0, 1])), -1); assert.equal(nextIndex(0, 0, 1, new Set()), -1); });
