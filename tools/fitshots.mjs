// Скриншоты вписывания кадра на разных экранах + проверка хотспота. node tools/fitshots.mjs http://localhost:4188/ shots
import { chromium } from 'playwright-core';
const url = process.argv[2] || 'http://localhost:4188/', out = process.argv[3] || 'shots';
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const errs = [];
for (const [w, h] of [[1280, 800], [1920, 1080], [390, 844]]) for (const fill of [0, 1]) {
  const p = await b.newPage({ viewport: { width: w, height: h } }); p.on('pageerror', (e) => errs.push(String(e)));
  await p.goto(url); await p.evaluate(() => localStorage.clear());
  await p.goto(url + `?devices=lantern,radio,laptop&fill=${fill}`); await p.waitForTimeout(3500);
  await p.evaluate(() => document.getElementById('overlay').classList.add('gone'));
  // клик по лампе в её координатах кадра → должна включиться при любом вписывании
  const r = await p.evaluate(() => { const r = document.getElementById('c').getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
  const cx = r.x + (1590 - 6) / (1672 - 12) * r.w, cy = r.y + (150 - 6 * 941 / 1672) / (941 - 12 * 941 / 1672) * r.h;
  let lamp = 'вне экрана';
  if (cx >= 0 && cx < w && cy >= 0 && cy < h) { await p.mouse.click(cx, cy); await p.waitForTimeout(900); lamp = (await p.evaluate(() => window.__rainroom.state().devices.lamp)) ? 'вкл' : 'НЕ вкл'; }
  await p.mouse.move(2, 2); await p.waitForTimeout(300);
  const name = `fit_${w}x${h}_${fill ? 'cover' : 'contain'}.png`; await p.screenshot({ path: `${out}/${name}` });
  console.log(name, 'canvas', JSON.stringify(r), 'клик по лампе:', lamp); await p.close();
}
console.log('errors:', errs); await b.close();
