// Скриншоты слоёной сцены (v3): десктоп 1920x1080 и мобила. Запуск: npx vite preview --port 4188 & node tools/layershots.mjs http://localhost:4188/rainroom/ shots/v10
import { chromium } from 'playwright-core'; import { mkdirSync } from 'node:fs';
const url = process.argv[2] || 'http://localhost:4188/'; const out = process.argv[3] || 'shots/v10'; mkdirSync(out, { recursive: true });
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const errs = [];
async function run(name, ctxOpt, list) {
  const ctx = await b.newContext(ctxOpt); const p = await ctx.newPage();
  p.on('pageerror', (e) => errs.push(name + ': ' + e)); p.on('console', (m) => m.type() === 'error' && errs.push(name + ': ' + m.text()));
  for (const [n, q, fn] of list) {
    await p.goto(url + q); await p.evaluate(() => localStorage.clear()); await p.goto(url + q); await p.waitForTimeout(5000);
    await p.evaluate(() => document.getElementById('overlay').classList.add('gone')); await p.waitForTimeout(1200);
    if (fn) await fn(p); await p.screenshot({ path: `${out}/${name}_${n}.png` });
    console.log(name, n, JSON.stringify(await p.evaluate(() => ({ ...window.__rainroom.state(), parallax: window.__rainroom.parallax() }))));
  }
  await ctx.close();
}
const corner = (x, y) => async (p) => { await p.mouse.move(x, y, { steps: 5 }); await p.waitForTimeout(2500); };
await run('desk', { viewport: { width: 1920, height: 1080 } }, [
  ['off', '?devices=none', corner(960, 540)], ['on', '?devices=all', corner(960, 540)],
  ['lamp', '?devices=lamp', corner(960, 540)], ['lantern_radio', '?devices=lantern,radio', corner(960, 540)], ['laptop', '?devices=laptop', corner(960, 540)],
  ['rain_peak', '?devices=all&rain=1', corner(960, 540)], ['parallax_tl', '?devices=all', corner(0, 0)], ['parallax_br', '?devices=all', corner(1919, 1079)],
  ['nofx', '?devices=all&nofx=rain,drops,city,steam,parallax&prec=mediump', corner(0, 0)],
]);
await run('mob', { viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }, [['off', '?devices=none'], ['on', '?devices=all']]);
await run('mobp', { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }, [['on', '?devices=all&q=low']]);
console.log('errors:', [...new Set(errs)].map((e) => e.slice(0, 300))); await b.close();
