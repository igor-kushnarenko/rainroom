// Headless-скриншоты сцены. Запуск: npx vite preview --port 4188 & node tools/shots.mjs http://localhost:4188/ shots
import { chromium } from 'playwright-core';
const url = process.argv[2] || 'http://localhost:4188/';
const out = process.argv[3] || 'shots';
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 1920, height: 1080 } });
const errs = []; p.on('pageerror', (e) => errs.push(String(e))); p.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
const shot = async (name, q, wait = 3500, fn) => {
  await p.goto(url + q); await p.evaluate(() => localStorage.clear()); await p.goto(url + q); await p.waitForTimeout(wait);
  await p.evaluate(() => document.getElementById('overlay').classList.add('gone')); await p.waitForTimeout(1300); if (fn) await fn(); await p.mouse.move(5, 5);
  await p.screenshot({ path: `${out}/${name}.png` }); console.log(name, JSON.stringify(await p.evaluate(() => window.__rainroom.state())));
};
await shot('01_all_off', '?devices=none');
await shot('02_all_on', '?devices=all', 6000);
for (const d of ['lamp', 'lantern', 'radio', 'laptop']) await shot(`03_only_${d}`, `?devices=${d}`, 5000);
await shot('04_rain_peak', '?devices=all&rain=1', 5000);
await shot('05_rain_peak_lightning', '?devices=none&rain=1', 3500, async () => { await p.evaluate(() => window.__rainroom.thunder(1)); });
// клик по лампе на экране включает её и сохраняется
await shot('06_click_lamp', '?', 3000, async () => { await p.mouse.click(1590 * 1920 / 1672, 150 * 1080 / 941); await p.waitForTimeout(800); });
await p.reload(); await p.waitForTimeout(1500); console.log('after reload', JSON.stringify((await p.evaluate(() => window.__rainroom.state())).devices));
await p.mouse.move(1880, 1040); await p.waitForTimeout(600); await p.screenshot({ path: `${out}/07_menu.png` });
await p.mouse.move(800, 400); await p.waitForTimeout(5600); console.log('menu closed after 5s:', await p.evaluate(() => document.getElementById('hud').classList.contains('closed')));
await p.screenshot({ path: `${out}/crop_sill.png`, clip: { x: 450, y: 600, width: 1300, height: 350 } });
console.log('errors:', [...new Set(errs)].map((e) => e.slice(0, 300))); await b.close();
