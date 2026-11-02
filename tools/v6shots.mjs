// Небо/туман/дороги по кадрам. node tools/v6shots.mjs http://localhost:4188/ shots
import { chromium } from 'playwright-core';
const url = process.argv[2] || 'http://localhost:4188/', out = process.argv[3] || 'shots';
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 1920, height: 1080 } }); const errs = []; p.on('pageerror', (e) => errs.push(String(e)));
const k = 1920 / 1660, clip = (x0, y0, x1, y1) => ({ x: (x0 - 6) * k, y: (y0 - 3.4) * k, width: (x1 - x0) * k, height: (y1 - y0) * k });
await p.goto(url); await p.evaluate(() => localStorage.clear()); await p.goto(url + '?devices=none&rain=0.5'); await p.waitForTimeout(4000);
await p.evaluate(() => document.getElementById('overlay').classList.add('gone')); await p.mouse.move(2, 2);
for (let i = 0; i < 3; i++) {
  await p.screenshot({ path: `${out}/v6_sky_${i}.png`, clip: clip(250, 95, 1450, 420) });
  await p.screenshot({ path: `${out}/v6_fog_${i}.png`, clip: clip(250, 470, 1450, 700) });
  await p.screenshot({ path: `${out}/v6_road_${i}.png`, clip: clip(660, 590, 860, 770) });
  await p.waitForTimeout(6000);
}
console.log('errors:', errs); await b.close();
