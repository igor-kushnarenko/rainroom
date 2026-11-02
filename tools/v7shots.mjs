// Небо/туман (спрайты), кружка; плюс небо с ?prec=mediump и ?nofx=... node tools/v7shots.mjs http://localhost:4188/ shots
import { chromium } from 'playwright-core';
const url = process.argv[2] || 'http://localhost:4188/', out = process.argv[3] || 'shots';
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const errs = []; const k = 1920 / 1660, clip = (x0, y0, x1, y1) => ({ x: (x0 - 6) * k, y: (y0 - 3.4) * k, width: (x1 - x0) * k, height: (y1 - y0) * k });
async function page(q) { const p = await b.newPage({ viewport: { width: 1920, height: 1080 } }); p.on('pageerror', (e) => errs.push(String(e)));
  await p.goto(url); await p.evaluate(() => localStorage.clear()); await p.goto(url + q); await p.waitForTimeout(4000);
  await p.evaluate(() => document.getElementById('overlay').classList.add('gone')); await p.mouse.move(2, 2); await p.waitForTimeout(500); return p; }
let p = await page('?devices=lamp&rain=0.5');
for (let i = 0; i < 3; i++) { await p.screenshot({ path: `${out}/v7_sky_${i}.png`, clip: clip(250, 95, 1450, 420) }); await p.screenshot({ path: `${out}/v7_fog_${i}.png`, clip: clip(250, 470, 1450, 770) }); await p.waitForTimeout(6000); }
await p.screenshot({ path: `${out}/v7_mug.png`, clip: clip(1040, 480, 1300, 845) }); await p.screenshot({ path: `${out}/v7_full.png` }); await p.close();
p = await page('?devices=none&prec=mediump'); await p.screenshot({ path: `${out}/v7_sky_mediump.png`, clip: clip(250, 95, 1450, 420) }); await p.close();
p = await page('?devices=none&nofx=clouds,fog,rain,drops,city,steam,pixel'); await p.screenshot({ path: `${out}/v7_sky_nofx_all.png`, clip: clip(250, 95, 1450, 420) }); await p.close();
console.log('errors:', errs); await b.close();
