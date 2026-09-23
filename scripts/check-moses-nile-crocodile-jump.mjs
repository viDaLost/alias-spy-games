// Крокодила «Моисея на Ниле» можно перепрыгнуть.
//
// Отзыв игрока: «сейчас крокодила невозможно перепрыгнуть». Он был прав не
// про баг, а про замысел: у препятствия стоял clearance «ground» — «только
// сменой дорожки», — тот же, что у камня или борта лодки. Бревно того же
// роста рядом честно прыгалось (у него clearance «low»), а крокодил прыжок
// не засчитывал никогда, и со стороны это читалось как не отвечающее
// управление, а не как встреча со зверем.
//
// Проверять это чтением одного поля в OBSTACLES мало: clearance читает не
// один читатель, а несколько — расчёт столкновения, генератор уровня, ближний
// промах, — и подменить его строкой значило бы поверить, что переезд по
// коду сработал, а не проверить, что он сработал. Поэтому игра поднимается и
// играется по-настоящему: корзинка прыгает без остановки, и за каждым
// крокодилом, доехавшим до неё, следят — засчитан ли он как пройденный
// (item.scored) и не убыло ли сердце в тот же миг.
//
//     node scripts/check-moses-nile-crocodile-jump.mjs

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';

const root = process.cwd();
const gameRoot = path.join(root, 'web/games/moses-nile-v7');
const failures = [];
const check = (condition, message) => { if (!condition) throw new Error(message); };

const mime = new Map([
  ['.html', 'text/html; charset=utf-8'], ['.js', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'], ['.json', 'application/json; charset=utf-8'],
  ['.png', 'image/png'], ['.jpg', 'image/jpeg'], ['.webp', 'image/webp'], ['.glb', 'model/gltf-binary'],
]);
const server = http.createServer((req, res) => {
  try {
    const url = new URL(req.url || '/', 'http://127.0.0.1');
    const pathname = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
    const target = path.resolve(gameRoot, `.${pathname}`);
    if (!target.startsWith(gameRoot + path.sep) || !fs.existsSync(target) || !fs.statSync(target).isFile()) {
      res.writeHead(404).end('Not found');
      return;
    }
    res.writeHead(200, {
      'Content-Type': mime.get(path.extname(target).toLowerCase()) || 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    fs.createReadStream(target).pipe(res);
  } catch (error) {
    res.writeHead(500).end(String(error));
  }
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const url = `http://127.0.0.1:${server.address().port}/`;

const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROME_BIN || '/usr/bin/google-chrome',
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-webgl'],
});
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const page = await context.newPage();
const pageErrors = [];
page.on('pageerror', (error) => pageErrors.push(String(error?.message || error)));
await page.route('**/vendor/**', (route) => route.fulfill({ status: 200, contentType: 'text/javascript', body: '' }));
await page.route('**/js/assets.js*', (route) => route.fulfill({ status: 200, contentType: 'text/javascript', body: 'window.assetManager={};' }));
await page.route('**/js/sound.js*', (route) => route.fulfill({
  status: 200, contentType: 'text/javascript',
  body: 'window.gameAudio={init(){},playSplash(){},playCollect(){},playPowerup(){},playHit(){},playGrowl(){},playJump(){},playNearMiss(){}};',
}));

try {
  await page.goto(url, { waitUntil: 'networkidle', timeout: 20_000 });
  await page.waitForFunction(() => window.__mosesV75Mode === 'fallback', null, { timeout: 10_000 });
  await page.evaluate(() => localStorage.setItem('moses-nile-tutorial-seen-v1', '1'));
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__mosesV75Mode === 'fallback', null, { timeout: 10_000 });
  await page.locator('#start-btn').click();
  await page.waitForFunction(() => document.body.classList.contains('is-playing'), null, { timeout: 5_000 });

  /*
    Прыжок целится в крокодила, а не сыплется наугад. Ряды препятствий стоят
    на равных интервалах, и слепой спам по таймеру рано или поздно входит с
    ними в резонанс — то заставая корзинку в прыжке всегда, то никогда;
    первый прогон так и падал, хотя правка стояла верно. Здесь прыжок
    вызывается изнутри той же кадровой петли, что и слежка: как только на
    дорожке корзинки появляется крокодил впереди, летит нажатие, — так же
    заранее, как прыгнул бы игрок, увидев зверя.

    Ловить именно кадр столкновения бесполезно: настоящий игровой цикл
    зарегистрирован раньше моего и на кадре удара снимает крокодила с поля
    (removeItem) до того, как мой tick() вообще до него доберётся, — не
    ошибка формулы, а порядок регистрации обработчиков, который снаружи не
    изменить. Поэтому слежка ведёт каждого крокодила своей дорожки с первого
    появления впереди и решает исход по итогу, а не по моменту: доехал живым
    до z>1.6 — прошёл; пропал с поля раньше — ударил. Гонка кадров тут уже
    не важна, важен только факт «был — не стало» или «был — доехал».
  */
  await page.evaluate(() => {
    window.__crocJumpWatch = { contacts: [], frames: 0 };
    const pending = new Map();
    // Дуга прыжка — TUNE.jumpImpulse=6.4, TUNE.gravity=-17.5 (js/game-v75.js
    // строки 44-45): vy(t)=6.4-17.5t, y(t)=6.4t-8.75t². Вершина — в момент
    // t=6.4/17.5с, выше clearance (.78) корзинка держится только около неё.
    // Оттолкнуться нужно не «заранее вообще», а так, чтобы вершина дуги
    // пришлась на дальность удара крокодила — иначе высота уже спадёт к его
    // приезду. Первая версия толкалась от самого горизонта (z от -14) и
    // прыжок гас за секунды до встречи — крокодил проходил по низкой дуге.
    const JUMP_PEAK_T = 6.4 / 17.5;
    const tick = () => {
      const state = window.__mosesV75State;
      const watch = window.__crocJumpWatch;
      if (state?.items) {
        watch.frames += 1;
        const present = new Set(state.items);
        for (const item of state.items) {
          if (item.type !== 'croc') continue;
          // Та же дальность, что и в расчёте столкновения (item.radius+.52):
          // это её же «в упор», а не собственное приближение.
          const dx = Math.abs(item.x - state.x);
          const hitDx = item.radius + .52;
          if (dx >= hitDx) continue;
          // Оттолкнуться в точке, откуда вершина дуги придётся на встречу
          // (z≈0) при нынешней скорости течения — она растёт по ходу забега,
          // поэтому точка считается заново каждый кадр, а не берётся разово.
          const launchZ = -state.speed * JUMP_PEAK_T;
          if (!state.airborne && item.z > launchZ - 2 && item.z < launchZ + 2) {
            window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowUp' }));
          }
          if (item.z <= -20 || item.z > 1.6) continue;
          let entry = pending.get(item);
          if (!entry) {
            entry = { heartsBefore: state.hearts, airborne: false };
            pending.set(item, entry);
          }
          entry.airborne = entry.airborne || Boolean(state.airborne);
        }
        for (const [item, entry] of pending) {
          if (present.has(item) && item.z <= 1.6) continue;
          // Досчитан: либо доехал живым до z>1.6 (прошёл), либо пропал с
          // поля раньше (ударил). Число сердец берём то, что видим сейчас,
          // а не вычитаем единицу вслепую — если забег кончился и обнулился
          // по другой причине, hearts не изменится, и встреча не получит
          // выдуманный исход. Настоящему удару так не спрятаться: он меняет
          // hearts в тот же кадр, когда снимает предмет с поля.
          const stillHere = present.has(item);
          watch.contacts.push({
            airborne: entry.airborne,
            heartsBefore: entry.heartsBefore,
            heartsAfter: state.hearts,
            scoredAfter: stillHere ? Boolean(item.scored) : false,
          });
          pending.delete(item);
        }
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });

  // Игра сама перезаводит забег после гибели — слежка живёт поверх забегов.
  // Крокодилы встречаются на дорожке корзинки не на каждом ряду препятствий
  // (дорожек три, и не на каждой из них — крокодил), а без бокового
  // управления забег обрывается быстро на первом же непрыгаемом препятствии
  // в той же дорожке — четверти минуты мало, чтобы набрать три встречи.
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    await page.waitForTimeout(400);
    const playing = await page.evaluate(() => document.body.classList.contains('is-playing'));
    if (playing) continue;
    const restart = page.locator('#restart-btn');
    if (await restart.isVisible().catch(() => false)) await restart.click().catch(() => {});
    else await page.locator('#start-btn').click().catch(() => {});
  }

  const watch = await page.evaluate(() => window.__crocJumpWatch);
  const settled = watch.contacts.filter((one) => one.heartsAfter !== null);
  const airborne = settled.filter((one) => one.airborne);
  const cleared = airborne.filter((one) => one.scoredAfter && one.heartsAfter === one.heartsBefore);
  const hitWhileAirborne = airborne.filter((one) => one.heartsAfter < one.heartsBefore);

  check(watch.frames > 200, `Игра почти не шла: ${watch.frames} кадров`);
  check(settled.length >= 3, `Крокодилов доехало до дальности удара ${settled.length} — судить не по чему`);
  check(airborne.length >= 1, `Ни разу не встретили крокодила в прыжке из ${settled.length} встреч — прыжки мимо цели`);
  check(cleared.length >= 1,
    `${airborne.length} встреч в прыжке, и ни одна не засчитана пройденной без потери сердца`);
  check(!hitWhileAirborne.length,
    `${hitWhileAirborne.length} встреч в прыжке всё равно отняли сердце — прыжок крокодила не спасает`);
  check(!pageErrors.length, `pageerror: ${pageErrors.join(' | ')}`);

  console.log(`OK: крокодил перепрыгивается — из ${settled.length} встреч ${airborne.length} пришлись на прыжок, `
    + `и ${cleared.length} засчитаны пройденными без потери сердца, ни одна встреча в прыжке сердце не отняла.`);
} catch (error) {
  failures.push(error.message);
} finally {
  await context.close();
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}

if (failures.length) {
  console.error(`Moses Nile crocodile jump check failed:\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
