// Крокодилы «Моисея на Ниле» стоят на своей дорожке.
//
// Отзыв владельца: крокодилы то отплывают от корзинки, то, появившись на
// соседней дорожке, вдруг «нападают». И то и другое было правдой. Ближайший
// крокодил подкрадывался к дорожке игрока, а когда двое сходились слишком
// близко, страховка от наложения расталкивала их в стороны — со стороны это
// читается как бегство. Уклоняться от препятствия, которое само выбирает, где
// оказаться, нельзя: решение принимается по тому, что видно на экране.
//
// Проверять это чтением исходника мало: сдвинуть крокодила можно из десятка
// мест. Поэтому игра запускается и играется по-настоящему, а за каждым
// крокодилом следят от появления до ухода за спину — сместился хоть на
// сантиметр, проверка падает.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';

const root = process.cwd();
const gameRoot = path.join(root, 'web/games/moses-nile-v7');
const failures = [];
const check = (condition, message) => { if (!condition) throw new Error(message); };

// Ни одна строка ветки крокодила не смеет двигать его по X.
const source = fs.readFileSync(path.join(gameRoot, 'js/game-v75.js'), 'utf8');
const branch = source.slice(source.indexOf("if (item.type === 'croc')"), source.indexOf("if (item.type === 'hippo' && item.z >"));
const moves = [...branch.matchAll(/item\.x\s*=[^=]/g)];
if (moves.length) failures.push(`Ветка крокодила снова двигает его по X: ${moves.length} присваиваний`);

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
  body: 'window.gameAudio={init(){},playSplash(){},playCollect(){},playPowerup(){},playHit(){},playGrowl(){}};',
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
    Слежка за каждым крокодилом по личности объекта: запоминаем X при первой
    встрече и сравниваем на каждом кадре. Сравнение идёт по самому предмету, а
    не по дорожке, поэтому проверка не зависит от того, где эти дорожки.
  */
  await page.evaluate(() => {
    window.__crocWatch = { seen: new Map(), worst: 0, worstLane: -1, count: 0, frames: 0 };
    const tick = () => {
      const state = window.__mosesV75State;
      const watch = window.__crocWatch;
      if (state?.items) {
        watch.frames += 1;
        for (const item of state.items) {
          if (item.type !== 'croc') continue;
          if (!watch.seen.has(item)) {
            watch.seen.set(item, item.x);
            watch.count += 1;
            continue;
          }
          const drift = Math.abs(item.x - watch.seen.get(item));
          if (drift > watch.worst) { watch.worst = drift; watch.worstLane = item.lane; }
        }
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });

  // Играть некому, и корзинка рано или поздно во что-нибудь врежется: как
  // только забег кончился, начинаем следующий — слежка живёт поверх забегов.
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    await page.waitForTimeout(1_000);
    const playing = await page.evaluate(() => document.body.classList.contains('is-playing'));
    if (playing) continue;
    const restart = page.locator('#restart-btn');
    if (await restart.isVisible().catch(() => false)) await restart.click().catch(() => {});
    else await page.locator('#start-btn').click().catch(() => {});
  }

  const watch = await page.evaluate(() => ({
    count: window.__crocWatch.count,
    worst: window.__crocWatch.worst,
    worstLane: window.__crocWatch.worstLane,
    frames: window.__crocWatch.frames,
  }));

  check(watch.frames > 200, `Игра почти не шла: ${watch.frames} кадров`);
  check(watch.count >= 3, `Крокодилов за забег встретилось ${watch.count} — судить не по чему`);
  check(watch.worst < 0.001, `Крокодил (дорожка ${watch.worstLane}) сместился на ${watch.worst.toFixed(3)} м`);
  check(!pageErrors.length, `pageerror: ${pageErrors.join(' | ')}`);

  console.log(`OK: крокодилы стоят на своей дорожке — ${watch.count} зверей за ${watch.frames} кадров, `
    + 'наибольшее смещение по X нулевое; ветка крокодила его координату не трогает.');
} catch (error) {
  failures.push(error.message);
} finally {
  await context.close();
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}

if (failures.length) {
  console.error(`Moses Nile crocodile check failed:\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
