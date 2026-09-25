// Запись настоящего заплыва «Моисей: Путь по Нилу» для 28-секундного ролика.
// Устроена как promo/ad/capture_moses.mjs; порядок другой: «▶» за лотосами,
// «ВОЛНА» через бревно и последним «НЫРОК» — из нырка ролик уходит под воду
// и выныривает из колодца «Земли обетованной».
//
// Игра запускается как есть — её собственный 3D, модели, HUD и кнопки. Время
// страницы заморожено (Playwright clock) и двигается ровно на 16 мс за кадр,
// поэтому заплыв повторяется до кадра, и каждый кадр можно снять, сколько бы
// ни рисовал его программный WebGL.
//
// Ситуация на реке подготовлена: игра расставляет препятствия сама по
// дистанции, а ролику нужно, чтобы к корзинке подошли заросли папируса, цепочка
// лотосов и бревно ровно тогда, когда палец жмёт «НЫРОК», «▶» и «ВОЛНА». Поэтому
// случайные ряды на подходе убираются, а эти предметы игры ставятся на реку с
// таким запасом, чтобы доплыть вовремя. Прохождение — честное: нажатия идут
// настоящими касаниями по кнопкам игры, а пройдёт ли корзинка под зарослями и
// над бревном, решает сама игра (скрипт проверяет, что сердца целы).
//
//   node promo/ad-28/capture_moses.mjs       → build/moses/*.jpg + build/moses.json
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { serve } from '../ad/serve.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const BUILD = path.join(HERE, 'build');
const OUT = path.join(BUILD, 'moses');
const CHROME = process.env.CHROME_BIN || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const STEP = 16;                 // мс игрового времени на кадр (сетка поддельного requestAnimationFrame)
const AD_START = 9.7;            // с какого момента ролика нужна запись
const AD_END = 12.9;             // и до какого
const F0 = 300;                  // кадр заплыва, который приходится на AD_START (4,8 с после старта)
const dryRun = process.argv.includes('--dry');

const grid = JSON.parse(fs.readFileSync(path.join(BUILD, 'beats.json'), 'utf8'));
const beatAt = (i) => grid.beats[i] - grid.beats[0];
const frameOf = (adTime) => F0 + Math.round((adTime - AD_START) / (STEP / 1000));
const LAST = frameOf(AD_END);

// Нажатия — на измеренные доли 22, 23 и 25 (с единицы).
const PRESS = [
  { frame: frameOf(beatAt(21)), button: '#btn-right', name: 'вправо' },
  { frame: frameOf(beatAt(22)), button: '#btn-jump', name: 'волна' },
  { frame: frameOf(beatAt(24)), button: '#btn-dive', name: 'нырок' },
];
const sec = (s) => Math.round(s * 1000 / STEP);
// Когда предмет должен оказаться у корзинки (z = 0), в кадрах.
const ARRIVALS = [
  // Лотосы на правой дорожке: корзинка приходит туда за ~0,1 с после «▶».
  { type: 'lotus', lane: 2, frame: PRESS[0].frame + sec(0.17) },
  { type: 'lotus', lane: 2, frame: PRESS[0].frame + sec(0.30) },
  { type: 'lotus', lane: 2, frame: PRESS[0].frame + sec(0.43) },
  // Волна: выше 0,78 корзинка с 0,14 по 0,59 с после нажатия — бревно в середине.
  { type: 'log', lane: 2, frame: PRESS[1].frame + sec(0.365) },
  // Нырок: ниже −0,22 корзинка идёт с 0,087 по 0,533 с после нажатия — заросли в середине.
  { type: 'gate', lane: 2, frame: PRESS[2].frame + sec(0.31) },
  // Камень на левой дорожке — просто река, по которой плывут мимо.
  { type: 'rock', lane: 0, frame: PRESS[0].frame + sec(0.4) },
];
const INJECT = 2;                // кадр, на котором предметы ставятся на реку

const srv = await serve(ROOT);
const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });

const buttons = {};
async function run({ distances, snap }) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.abort());
  await page.addInitScript(() => {
    localStorage.setItem('moses-nile-tutorial-seen-v1', '1');
    localStorage.setItem('moses-nile-hint-seen-v2', '1');
    localStorage.setItem('moses-nile-control-mode-v1', 'arrows');
  });
  await page.clock.install({ time: new Date('2026-01-01T10:00:00Z') });
  await page.clock.pauseAt(new Date('2026-01-01T10:00:01Z'));
  await page.goto(`${srv.url}/web/games/moses-nile-v7/index.html?v=770`);
  for (let i = 0; i < 600; i += 1) {
    await page.clock.runFor(100);
    if (await page.evaluate(() => window.__mosesV75Ready && !document.querySelector('#start-btn')?.disabled)) break;
  }
  if (await page.evaluate(() => window.__mosesV75Mode) !== 'webgl') throw new Error('игра ушла в запасной 2D-режим');
  await page.clock.runFor(400);
  await page.evaluate(() => document.querySelector('#start-btn').click());

  const centre = async (sel) => page.evaluate((s) => { const r = document.querySelector(s).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, sel);
  const touch = (type, p) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x: p.x, y: p.y, radiusX: 8, radiusY: 8, force: 1, id: 1 }] });
  for (const sel of ['#btn-left', '#btn-right', '#btn-jump', '#btn-dive']) buttons[sel] = await centre(sel);
  const record = [];
  let held = null;
  for (let n = 1; n <= LAST; n += 1) {
    if (n === INJECT) {
      await page.evaluate(({ arrivals, distances, inject }) => {
        const s = window.__mosesV75State;
        // Ряды, которые игра успела поставить на подходе, уплывают за спину.
        for (const item of s.items) { item.scored = true; item.z = 13; }
        const LANES = [-3.75, 0, 3.75];
        const SPEC = { gate: [1.28, 'high'], log: [1.12, 'low'], lotus: [0.92, null], rock: [1.02, 'ground'] };
        for (const a of arrivals) {
          // Все предметы плывут одинаково — со скоростью реки, — и их путь до
          // корзинки равен пути, который корзинка «проплывёт» за это время.
          const z = distances ? -(distances[a.frame] - distances[inject]) : -19 * (a.frame - inject) * 0.016;
          const [radius, clearance] = SPEC[a.type];
          s.items.push({ type: a.type, lane: a.lane, x: LANES[a.lane], z, radius, clearance, hover: 0, phase: a.lane * 1.7 + a.frame * 0.01,
            scored: false, surface: 1, bite: 0, lunged: false, surfaced: false, snap: 0, snapped: false, gape: 0, clapped: false, mesh: null, shadow: null });
        }
      }, { arrivals: ARRIVALS, distances, inject: INJECT });
    }
    const press = PRESS.find((p) => p.frame === n);
    if (press) { held = { at: await centre(press.button), until: n + 5 }; await touch('touchStart', held.at); }
    if (held && n === held.until) { await touch('touchEnd', held.at); held = null; }
    await page.clock.runFor(STEP);
    const s = await page.evaluate(() => { const s = window.__mosesV75State; return { t: s.runTime, d: s.distance, x: s.x, y: s.y, lane: s.lane, hearts: s.hearts, score: s.score, playing: s.playing,
      near: s.items.filter((i) => i.z > -4 && i.z < 3).map((i) => `${i.type}${i.lane}:${i.z.toFixed(1)}`).join(' ') }; });
    record.push({ n, ...s });
    if (snap && n >= F0 - 2) {
      const r = await cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: 86 });
      fs.writeFileSync(path.join(OUT, `f${String(n - F0 + 2).padStart(4, '0')}.jpg`), Buffer.from(r.data, 'base64'));
      if ((n - F0) % 20 === 0) console.log(`кадр ${n - F0}/${LAST - F0}  ${s.near}`);
    }
  }
  await ctx.close();
  if (errors.length) throw new Error(`ошибки на странице: ${errors.slice(0, 3).join(' | ')}`);
  return record;
}

// Проход 1: путь реки по кадрам (нажатия и предметы на скорость не влияют).
const first = await run({ distances: null, snap: false });
const distances = [0, ...first.map((r) => r.d)];
// Проход 2: предметы стоят точно, кадры снимаются.
if (!dryRun) { fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(OUT, { recursive: true }); }
const second = await run({ distances, snap: !dryRun });
const end = second[second.length - 1];
for (const p of PRESS) {
  const r = second.find((x) => x.n === p.frame + 20);
  console.log(`${p.name}: кадр ${p.frame}, через 0,32 с y=${r.y.toFixed(2)} x=${r.x.toFixed(2)}`);
}
console.log(`итог: сердца ${end.hearts}, счёт ${Math.round(end.score)}, дистанция ${end.d.toFixed(1)} м`);
if (end.hearts < 3 || !end.playing) throw new Error('корзинка задела препятствие — расстановка не сработала');
fs.writeFileSync(path.join(BUILD, 'moses.json'), JSON.stringify({ step: STEP / 1000, adStart: AD_START, firstFrameN: F0 - 2, frames: LAST - F0 + 3,
  frameAtAdStart: 2, presses: PRESS.map((p) => ({ ...p, adTime: AD_START + (p.frame - F0) * STEP / 1000 })),
  viewport: { width: 390, height: 844 }, buttons, record: second.filter((r) => r.n >= F0 - 2) }, null, 1));
{
  const meta = JSON.parse(fs.readFileSync(path.join(BUILD, 'moses.json'), 'utf8'));
  delete meta.record;
  // Сведения о записи — рядом со снимками (в репозитории); сами кадры — сборка.
  fs.mkdirSync(path.join(HERE, 'shots'), { recursive: true });
  fs.writeFileSync(path.join(HERE, 'shots', 'moses.js'), `window.MOSES = ${JSON.stringify(meta)};\n`);
}
await browser.close();
await srv.close();
