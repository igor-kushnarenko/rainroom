// Свет/утечки/дождь/телефон. node tools/v3shots.mjs http://localhost:4188/ shots
import { chromium } from 'playwright-core';
const url = process.argv[2] || 'http://localhost:4188/', out = process.argv[3] || 'shots';
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const errs = [];
async function page(w, h, q, wait = 4000) {
  const p = await b.newPage({ viewport: { width: w, height: h } }); p.on('pageerror', (e) => errs.push(String(e)));
  await p.goto(url); await p.evaluate(() => localStorage.clear()); await p.goto(url + q); await p.waitForTimeout(wait);
  await p.evaluate(() => document.getElementById('overlay').classList.add('gone')); await p.mouse.move(2, 2); await p.waitForTimeout(1200); return p;
}
let p = await page(1672, 941, '?devices=all&thunder=0'); await p.evaluate(() => { window.__rainroom.state(); });
await p.screenshot({ path: `${out}/v3_all_on_1672.png` }); await p.close();
p = await page(1672, 941, '?devices=none'); await p.screenshot({ path: `${out}/v3_all_off_1672.png` }); await p.close();
p = await page(1920, 1080, '?devices=lamp'); await p.screenshot({ path: `${out}/v3_lamp_only.png` }); await p.close();
p = await page(1920, 1080, '?devices=radio'); await p.screenshot({ path: `${out}/v3_radio_only.png` }); await p.close();
p = await page(1920, 1080, '?devices=none&rain=1');
for (let i = 0; i < 3; i++) { await p.screenshot({ path: `${out}/v3_rain_zoom_${i}.png`, clip: { x: 700, y: 150, width: 480, height: 300 } }); await p.waitForTimeout(400); }
await p.close();
p = await page(1920, 1080, '?devices=none&rain=0.5'); await p.screenshot({ path: `${out}/v3_rain_mid.png` }); await p.close();
p = await page(390, 844, '?devices=all'); await p.screenshot({ path: `${out}/v3_phone_390x844.png` }); await p.close();
console.log('errors:', [...new Set(errs)]); await b.close();
