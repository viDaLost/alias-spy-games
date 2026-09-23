// «Моисей на Ниле»: на разгоне уведомления не копятся друг на друге.
//
// Отзыв игрока: «на большой скорости баннеров с уведомлением становится
// очень много, и они накладываются друг на друга и перекрывают дальнейший
// путь». Веха дистанции (каждые 500м) и смена биома идут по счётчику пути, а
// не по часам — на разгоне те же события, что на старте разделяют десять
// секунд, укладываются в две-три. Раньше плашек могло висеть до двух сразу,
// и лишняя снималась рывком; столбик стоит там же, где на горизонте
// показываются новые препятствия, и даже пара штук заметно резала обзор.
//
// Проверять это чтением исходника мало: важно, что при двух подряд событиях,
// разделённых меньше секунды, — а на разгоне это обычное дело, — над рекой
// в любой момент висит не больше одной плашки, а не читкой формулы. Поэтому
// игра поднимается по-настоящему, и веха с биомом вызываются друг за другом
// через настоящий счётчик пройденного пути, а не через отдельный тестовый
// крюк.
//
//     node scripts/check-moses-nile-toast-stack.mjs

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';

const root = process.cwd();
const gameRoot = path.join(root, 'web/games/moses-nile-v7');
const failures = [];
const check = (condition, message) => { if (!condition) failures.push(message); };

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

  const activeToasts = () => document.querySelectorAll('#toast-layer .toast:not(.is-out)').length;

  // Старт сам показывает плашку биома — ждём, пока она сойдёт, чтобы не
  // спутать её с вехой.
  await page.waitForFunction(() => !document.querySelector('#toast-layer .toast'), null, { timeout: 3_000 });

  // Веха 500м: подводим счётчик пути в упор к порогу, дальше его толкает сама
  // игра (state.distance += state.speed*dt каждый кадр).
  await page.evaluate(() => { window.__mosesV75State.distance = 495; });
  await page.waitForFunction(
    () => /500\s*метров/.test(document.querySelector('#toast-layer .toast b')?.textContent || ''),
    null, { timeout: 3_000 },
  );
  const afterMilestone = await page.evaluate(() => document.querySelector('#toast-layer .toast b')?.textContent || '');
  check(/500\s*метров/.test(afterMilestone), `после вехи 500м плашка показывает «${afterMilestone}», а не веху`);
  check((await page.evaluate(activeToasts)) === 1, 'после одной вехи на экране не ровно одна плашка');

  /*
    Смена биома (порог 700м) — меньше чем через секунду после вехи: на
    разгоне это ровно то, что жалоба и описывает. Замеряем не один кадр, а
    каждые 60мс на протяжении полутора секунд — если на каком-то из них
    успели повисеть две плашки сразу, взлёт сигнала не должен от нас
    ускользнуть из-за случайного момента опроса.
  */
  await page.evaluate(() => { window.__mosesV75State.distance = 695; });
  const samples = [];
  for (let i = 0; i < 25; i += 1) {
    samples.push(await page.evaluate(activeToasts));
    await page.waitForTimeout(60);
  }
  check(samples.some((one) => one > 0), 'после смены биома плашка вообще не появилась — событие не сработало');
  check(!samples.some((one) => one > 1), `на разгоне одновременно висело до ${Math.max(...samples)} плашек вместо одной`);

  const afterBiome = await page.evaluate(() => document.querySelector('#toast-layer .toast b')?.textContent || '');
  check(afterBiome === 'Открытый Нил', `после смены биома плашка показывает «${afterBiome}», а не название нового биома`);

  check(!pageErrors.length, `pageerror: ${pageErrors.join(' | ')}`);
} catch (error) {
  failures.push(error.message);
} finally {
  await context.close();
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}

if (failures.length) {
  console.error(`Moses Nile toast stacking check failed:\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.log('OK: на разгоне веха дистанции и смена биома, случившиеся меньше чем через секунду друг за другом, '
  + 'не держат над рекой больше одной плашки сразу — новая всегда снимает прежнюю плавным уходом.');
