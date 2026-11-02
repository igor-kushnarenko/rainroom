// Машины: позиции по кадрам + кропы дороги. node tools/v8shots.mjs http://localhost:4188/ shots
import { chromium } from 'playwright-core';
const url = process.argv[2] || 'http://localhost:4188/', out = process.argv[3] || 'shots';
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 1920, height: 1080 } }); const errs = []; p.on('pageerror', (e) => errs.push(String(e))); p.on('console', (m) => m.type() === 'error' && errs.push(m.text().slice(0, 200)));
const k = 1920 / 1660, clip = (x0, y0, x1, y1) => ({ x: (x0 - 6) * k, y: (y0 - 3.4) * k, width: (x1 - x0) * k, height: (y1 - y0) * k });
await p.goto(url); await p.evaluate(() => localStorage.clear()); await p.goto(url + '?devices=none&rain=0.3'); await p.waitForTimeout(4000);
await p.evaluate(() => document.getElementById('overlay').classList.add('gone')); await p.mouse.move(2, 2);
let prev = null;
for (let i = 0; i < 3; i++) {
  const c = await p.evaluate(() => window.__rainroom.cars()); const t = await p.evaluate(() => performance.now() / 1000);
  if (prev) { const d = c.map((q, j) => Math.hypot(q[0] - prev.c[j][0], q[1] - prev.c[j][1])); console.log(`кадр ${i}: за ${(t - prev.t).toFixed(1)} с машины сдвинулись в среднем на ${(d.reduce((a, b) => a + b) / d.length).toFixed(1)} px, мин ${Math.min(...d).toFixed(1)}`); }
  console.log(`кадр ${i}: car0`, c[0], 'car1', c[1]); prev = { c, t };
  await p.screenshot({ path: `${out}/v8_road_${i}.png`, clip: clip(660, 590, 860, 770) }); await p.waitForTimeout(2500);
}
console.log('fps', (await p.evaluate(() => window.__rainroom.fps())).toFixed(1), 'errors:', errs); await b.close();
