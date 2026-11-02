// Лампа (растение+кружка), ноутбук, стекающая вода. node tools/v5shots.mjs http://localhost:4188/ shots
import { chromium } from 'playwright-core';
const url = process.argv[2] || 'http://localhost:4188/', out = process.argv[3] || 'shots';
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const errs = []; const k = 1920 / 1660, X = (x) => (x - 6) * k, Y = (y) => (y - 3.4) * k;
const clip = (x0, y0, x1, y1) => ({ x: X(x0), y: Y(y0), width: (x1 - x0) * k, height: (y1 - y0) * k });
async function page(q, wait = 4500) {
  const p = await b.newPage({ viewport: { width: 1920, height: 1080 } }); p.on('pageerror', (e) => errs.push(String(e)));
  await p.goto(url); await p.evaluate(() => localStorage.clear()); await p.goto(url + q); await p.waitForTimeout(wait);
  await p.evaluate(() => document.getElementById('overlay').classList.add('gone')); await p.mouse.move(2, 2); await p.waitForTimeout(1000); return p;
}
let p = await page('?devices=lamp');
await p.screenshot({ path: `${out}/v5_mug_steam.png`, clip: clip(1040, 480, 1300, 845) });
for (let i = 0; i < 3; i++) {
  await p.screenshot({ path: `${out}/v5_city_${i}.png`, clip: clip(560, 120, 1060, 560) });
  await p.screenshot({ path: `${out}/v5_road_${i}.png`, clip: clip(640, 520, 860, 775) });
  await p.waitForTimeout(4000);
}
await p.screenshot({ path: `${out}/v5_full.png` }); console.log('fps 1920 (swiftshader, CPU):', (await p.evaluate(() => window.__rainroom.fps())).toFixed(1)); await p.close();
p = await b.newPage({ viewport: { width: 390, height: 844 } }); await p.goto(url + '?devices=all'); await p.waitForTimeout(8000);
console.log('fps 390x844 (swiftshader, CPU):', (await p.evaluate(() => window.__rainroom.fps())).toFixed(1)); await p.close();
console.log('errors:', [...new Set(errs)].map((e) => e.slice(0, 400))); await b.close();
