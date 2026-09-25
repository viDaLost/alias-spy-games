// Запись настоящей партии «Земли обетованной» для ролика: колодец у доски,
// перелёт камеры к общему виду, «Бросить жребий», кости 3 и 5, фишка идёт на
// «Вифлеем», «Купить за 120».
//
// Игра запускается как есть (cloudflare/promised-land-preview/public — то же,
// что приложение открывает во фрейме), боком: сама игра советует играть
// горизонтально. Время страницы заморожено и идёт по 16 мс за кадр (как в
// promo/ad/capture_moses.mjs), нажатия — настоящими касаниями по кнопкам игры.
//
// Подготовлено одно: какие грани выпадут. Жребий игра берёт из
// crypto.getRandomValues — ровно на этот бросок ему подложены два числа, дающие
// 3 и 5. Кувырок костей, шаги фишки и карточка удела — самой игры. Камеру к
// колодцу и обратно двигают её же focus() и home() (ими пользуется обучение).
//
//   node promo/ad-28/capture_promised.mjs  →  build/promised/*.jpg + shots/promised.js
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { serve } from '../ad/serve.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const BUILD = path.join(HERE, 'build');
const OUT = path.join(BUILD, 'promised');
const CHROME = process.env.CHROME_BIN || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const STEP = 16;
const VIEW = { width: 844, height: 390 };

const grid = JSON.parse(fs.readFileSync(path.join(BUILD, 'beats.json'), 'utf8'));
const beatAt = (b) => { const i = Math.floor(b); return grid.beats[i] - grid.beats[0] + (b - i) * grid.period; };
// Раскадровка (доли с нуля): корзинка выныривает из колодца на 26, камера к
// общему виду на 26.6, жребий на 28, «Купить за 120» на 33.
const AD_START = beatAt(24.6);
const AD_END = beatAt(35.8);
const F0 = 40;                        // первые кадры — камера садится у колодца
const frameOf = (t) => F0 + Math.round((t - AD_START) / (STEP / 1000));
const LAST = frameOf(AD_END);
const EVENTS = [
  { frame: frameOf(beatAt(26.6)), kind: 'home' },
  { frame: frameOf(beatAt(28)), kind: 'tap', target: 'roll' },
  { frame: frameOf(beatAt(33)), kind: 'tap', target: 'buy' },
];
const WELL_CELL = 10;                 // с клетки «Ен-Геди» в кадре колодец у угла «Темницы»
const dryRun = process.argv.includes('--dry');

const srv = await serve(path.join(ROOT, 'cloudflare/promised-land-preview/public'));
const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: VIEW, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
const cdp = await ctx.newCDPSession(page);
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.abort());
await page.addInitScript(() => {
  const own = crypto.getRandomValues.bind(crypto);
  window.__forced = [];
  crypto.getRandomValues = (arr) => {
    if (window.__forced.length && arr instanceof Uint32Array && arr.length === 1) { arr[0] = window.__forced.shift(); return arr; }
    return own(arr);
  };
});
await page.clock.install({ time: new Date('2026-01-01T10:00:00Z') });
await page.clock.pauseAt(new Date('2026-01-01T10:00:01Z'));
await page.goto(`${srv.url}/index.html`);
for (let i = 0; i < 200; i += 1) { await page.clock.runFor(100); if (await page.locator('.mode-card[data-mode="solo"]').count()) break; }
await page.evaluate(() => document.querySelector('.mode-card[data-mode="solo"]').click());
await page.clock.runFor(300);
await page.evaluate(() => document.getElementById('start-btn').click());
for (let i = 0; i < 300; i += 1) {
  await page.clock.runFor(100);
  if (await page.evaluate(() => !document.getElementById('game')?.hidden && window.PromisedLandScene)) break;
}
await page.clock.runFor(2500);
await page.evaluate((c) => { window.PromisedLandScene.focus(c, 0.6); }, WELL_CELL);

const rectOf = (fn) => page.evaluate(fn);
const buttonRect = (label) => rectOf(new Function(`const b = [...document.querySelectorAll('button')].find((x) => x.offsetParent && x.textContent.includes(${JSON.stringify(label)}));
  if (!b) return null; const r = b.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height };`));
const touch = (type, p) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x: p.x, y: p.y, radiusX: 8, radiusY: 8, force: 1, id: 1 }] });
if (!dryRun) { fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(OUT, { recursive: true }); }
const buttons = {};
const record = [];
let held = null;
for (let n = 1; n <= LAST; n += 1) {
  for (const ev of EVENTS.filter((e) => e.frame === n)) {
    if (ev.kind === 'home') await page.evaluate(() => { window.PromisedLandScene.home(); });
    if (ev.kind === 'tap') {
      const label = ev.target === 'roll' ? 'Бросить жребий' : 'Купить за';
      const r = await buttonRect(label);
      if (!r) throw new Error(`нет кнопки «${label}» на кадре ${n}`);
      buttons[ev.target] = r;
      // 3 и 5: грань = 1 + floor(число / 2³² · 6)
      if (ev.target === 'roll') await page.evaluate(() => { window.__forced = [Math.floor(2.5 / 6 * 2 ** 32), Math.floor(4.5 / 6 * 2 ** 32)]; });
      held = { at: { x: r.x + r.w / 2, y: r.y + r.h / 2 }, until: n + 5 };
      await touch('touchStart', held.at);
    }
  }
  if (held && n === held.until) { await touch('touchEnd', held.at); held = null; }
  await page.clock.runFor(STEP);
  const s = await page.evaluate(() => { const s = window.PromisedLandGame.state(); return { dice: s.dice, pos: s.players[0].pos, phase: s.phase, pending: s.pending?.type || null, silver: s.players[0].silver }; });
  record.push({ n, ...s });
  if (!dryRun && n >= F0 - 2) {
    const r = await cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: 86 });
    fs.writeFileSync(path.join(OUT, `f${String(n - F0 + 2).padStart(4, '0')}.jpg`), Buffer.from(r.data, 'base64'));
    if ((n - F0) % 25 === 0) console.log(`кадр ${n - F0}/${LAST - F0}  ${JSON.stringify(s)}`);
  }
}
const end = record[record.length - 1];
console.log('итог:', JSON.stringify(end));
if (String(end.dice) !== '3,5' || end.pos !== 8) throw new Error('бросок не дал 3 и 5 или фишка не на «Вифлееме»');
if (errors.length) throw new Error(`ошибки на странице: ${errors.slice(0, 3).join(' | ')}`);
fs.mkdirSync(path.join(HERE, 'shots'), { recursive: true });
fs.writeFileSync(path.join(HERE, 'shots', 'promised.js'), `window.PROMISED = ${JSON.stringify({
  step: STEP / 1000, adStart: AD_START, frameAtAdStart: 2, frames: LAST - F0 + 3, viewport: VIEW, scale: 3, buttons,
  events: EVENTS.map((e) => ({ ...e, adTime: AD_START + (e.frame - F0) * STEP / 1000 })),
  // когда что случилось — для раскладки долей в ролике
  timeline: {
    diceShown: (record.find((r) => r.dice[0] === 3) || {}).n,
    arrived: (record.find((r) => r.pos === 8) || {}).n,
    buyCard: (record.find((r) => r.pending === 'buy') || {}).n,
    bought: (record.find((r) => r.silver < 1500) || {}).n,
  },
})};\n`);
await browser.close();
await srv.close();
