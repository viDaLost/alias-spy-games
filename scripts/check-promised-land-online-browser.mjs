// «Земля обетованная» по сети — с двух телефонов сразу.
//
// Рядом стоят две проверки, и ни одна не отвечает на вопрос, который задаёт эта.
// check-promised-land-room.mjs проверяет комнату как данные, без воркера.
// check-promised-land-online.mjs — воркер и правила, но запросами, без экрана.
// Здесь открываются два настоящих браузера на настоящий воркер и играют друг с
// другом: один заводит комнату, второй входит по коду.
//
// Стережётся то, что видно только отсюда:
//
//   * комната у второго появляется сама, без перезагрузки;
//   * сказанное одним доходит до другого;
//   * кнопки хода есть ровно у того, чей ход, а не у обоих;
//   * брошенный жребий меняет доску у обоих, а не только у бросившего.
//
// Без WebGL — намеренно, как и в соседней проверке на телефоне: игра тогда
// показывает поле разметкой, и по нему видно, что на доске изменилось. Сцену
// проверяет check-promised-land-3d.mjs.

import { spawn, execFileSync } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import { chromium } from 'playwright-core';

const root = process.cwd();
const dir = path.join(root, 'cloudflare/promised-land-preview');
const problems = [];
const need = (condition, message) => { if (!condition) problems.push(message); };
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Картинки живут в web/assets/promised-land, а воркер раздаёт своё public/.
execFileSync(process.execPath, [path.join(root, 'scripts/sync-promised-land-art.mjs')],
  { cwd: root, stdio: 'pipe' });

const freePort = () => new Promise((resolve, reject) => {
  const probe = net.createServer();
  probe.once('error', reject);
  probe.listen(0, '127.0.0.1', () => {
    const { port } = probe.address();
    probe.close(() => resolve(port));
  });
});

const port = await freePort();
const worker = spawn(
  path.join(dir, 'node_modules/.bin/wrangler'),
  ['dev', '--local', '--ip', '127.0.0.1', '--port', String(port)],
  { cwd: dir, stdio: ['ignore', 'pipe', 'pipe'] },
);
let workerLog = '';
worker.stdout.on('data', (chunk) => { workerLog += chunk; });
worker.stderr.on('data', (chunk) => { workerLog += chunk; });
worker.on('error', (error) => { workerLog += `\nwrangler не запустился: ${error.message}`; });

const url = `http://127.0.0.1:${port}/`;
let browser = null;

/** Дождаться того, что зависит от чужого хода: связь не мгновенна. */
async function until(check, what, tries = 60) {
  for (let attempt = 0; attempt < tries; attempt += 1) {
    if (await check()) return true;
    await pause(250);
  }
  problems.push(what);
  return false;
}

try {
  let ready = null;
  for (let attempt = 0; attempt < 240 && !ready; attempt += 1) {
    await pause(250);
    ready = await fetch(`${url}api/health`).then((r) => r.json()).catch(() => null);
  }
  if (!ready?.ok) throw new Error(`Воркер не поднялся.\n${workerLog.slice(-1500)}`);

  browser = await chromium.launch({
    headless: true,
    executablePath: process.env.CHROME_BIN || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-webgl'],
  });

  const errors = [];
  const openPhone = async (label) => {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2,
    });
    const page = await context.newPage();
    page.on('pageerror', (error) => errors.push(`${label}: ${error}`));
    page.on('console', (message) => { if (message.type() === 'error') errors.push(`${label}: ${message.text()}`); });
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await page.locator('.mode-card[data-mode="online"]').click();
    await page.waitForSelector('#online:not([hidden])', { timeout: 5_000 });
    return page;
  };

  // 1. Первый заводит комнату.
  const host = await openPhone('хозяин');
  await host.locator('#online-name').fill('Пётр');
  await host.locator('#online-create').click();
  await host.waitForSelector('#online-room:not([hidden])', { timeout: 15_000 });
  const code = (await host.locator('#lobby-code').textContent() || '').trim();
  need(/^[A-Z0-9]{5}$/.test(code), `код комнаты на экране: «${code}»`);

  // 2. Второй входит по коду — и появляется у первого сам, без перезагрузки.
  const guest = await openPhone('гостья');
  await guest.locator('#online-name').fill('Анна');
  await guest.locator('#online-code').fill(code);
  await guest.locator('#online-join').click();
  await guest.waitForSelector('#online-room:not([hidden])', { timeout: 15_000 });
  await until(async () => await host.locator('#lobby-players li').count() === 2,
    'вошедшая не появилась у хозяина за столом');
  need(await guest.locator('#lobby-players li').count() === 2,
    'гостья не видит за столом двоих');
  need(await guest.locator('#lobby-start').isVisible() === false,
    'кнопка «начать партию» показана гостье');
  need(await host.locator('#lobby-ready').isVisible() === false,
    'хозяину предложено объявить себя готовым');

  // 3. Сказанное за столом доходит.
  await guest.locator('#lobby-chat-text').fill('Я готова');
  await guest.locator('#lobby-chat-form button[type="submit"]').click();
  await until(async () => (await host.locator('#lobby-chat-lines').textContent() || '').includes('Я готова'),
    'сказанное гостьей не дошло до хозяина');

  // 4. Партия начинается, когда гостья готова.
  need(await host.locator('#lobby-start').isDisabled(),
    'партию можно начать, пока гостья не готова');
  await guest.locator('#lobby-ready').click();
  await until(async () => !(await host.locator('#lobby-start').isDisabled()),
    'гостья готова, а начать партию нельзя');
  await host.locator('#lobby-start').click();
  await host.waitForSelector('#game:not([hidden])', { timeout: 15_000 });
  await until(async () => await guest.locator('#game:not([hidden])').count() > 0,
    'у гостьи партия не началась');

  /*
    5. Кнопки хода — у того, чей ход. Это и есть очередь, видимая глазами: у
    второго на их месте стоит «такой-то ходит…».
  */
  // Жребий бросают в фазе броска — карточки клетки в этот миг нет, и кнопка
  // стоит в нижней полосе. Ищем её по группе решений, а не по полосе: когда
  // клетка о чём-то спрашивает, вся группа переезжает под карточку.
  const rolls = (page) => page.locator('.actions-main button', { hasText: 'Бросить жребий' });
  const hostRolls = await rolls(host).count() > 0;
  const mover = hostRolls ? host : guest;
  const waiter = hostRolls ? guest : host;
  need(await rolls(waiter).count() === 0, 'жребий предложен обоим разом');
  need(await waiter.locator('.waiting').count() > 0,
    'тому, чей ход не сейчас, не сказано, кого ждать');

  /*
    6. Брошенный жребий меняет доску у обоих. Сверяется не летопись на экране —
    простой бросок в неё и не пишется, — а само состояние партии: кости, чей
    ход и где чья фишка. Заодно это отвечает на главный вопрос игры по сети:
    доска у двоих должна быть одна, до последнего сикля.
  */
  const boardOf = async (page) => page.evaluate(() => {
    const game = window.PromisedLandGame?.state?.();
    return game ? JSON.stringify(game) : '';
  });
  const before = await boardOf(waiter);
  need(Boolean(before), 'у второго игрока нет состояния партии вовсе');
  await rolls(mover).first().click();
  await until(async () => {
    const now = await boardOf(waiter);
    return Boolean(now) && now !== before;
  }, 'брошенный жребий не дошёл до второго игрока');
  // Показ хода занимает секунду с лишним: у бросившего фишка ещё идёт по клеткам.
  await until(async () => (await boardOf(mover)) === (await boardOf(waiter)),
    'доска у игроков разошлась после первого же хода');

  /*
    7. Закрытая вкладка партию не рушит. Ушедший остаётся за столом со своими
    уделами — вернуться он должен на своё место, — а у оставшегося доска стоит
    как стояла, а не пропадает вместе с чужой связью.
  */
  const standing = await boardOf(host);
  const guestPhone = guest.context();
  await guest.close();
  await pause(1500);
  need(await host.locator('#game:not([hidden])').count() > 0,
    'ушёл второй — и у первого пропала партия');
  need((await boardOf(host)) === standing, 'уход второго переписал партию');

  /*
    8. И вернуться он должен на своё место, не помня кода. Телефон — это место,
    где вкладку закрывают не нарочно: пришёл звонок, кончилась память, смахнули
    случайно. Здесь это и отыгрывается: та же самая вкладка открывается заново,
    и игра сама предлагает вернуться в комнату, из которой её вынесло.
  */
  const back = await guestPhone.newPage();
  back.on('pageerror', (error) => errors.push(`вернувшаяся: ${error}`));
  await back.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await back.locator('.mode-card[data-mode="online"]').click();
  await back.waitForSelector('#online:not([hidden])', { timeout: 5_000 });
  const resume = back.locator('#online-resume');
  need(await resume.isVisible(), 'вернувшейся не предложено вернуться в свою комнату');
  need((await resume.textContent() || '').includes(code),
    `в предложении вернуться не тот код: «${await resume.textContent()}»`);
  await resume.click();
  await until(async () => await back.locator('#game:not([hidden])').count() > 0,
    'по возвращении партия не открылась');
  await until(async () => (await boardOf(back)) === (await boardOf(host)),
    'вернувшаяся увидела не ту же доску');

  need(errors.length === 0, `ошибки на странице — ${errors.slice(0, 3).join(' | ')}`);
} finally {
  if (browser) await browser.close();
  worker.kill('SIGTERM');
}

if (problems.length) {
  console.error('«Земля обетованная» по сети не прошла проверку в браузере:');
  for (const line of problems) console.error(`  ✗ ${line}`);
  process.exit(1);
}

console.log('OK: комната заводится на одном телефоне и открывается по коду на другом, вошедший '
  + 'появляется у хозяина сам, сказанное доходит, партия начинается по готовности, кнопки хода '
  + 'стоят только у того, чей ход, брошенный жребий меняет доску у обоих, а закрывший вкладку '
  + 'возвращается в свою комнату на своё место, не помня её кода.');
