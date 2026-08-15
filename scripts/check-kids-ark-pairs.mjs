import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';

const root = process.cwd();
const failures = [];
const mime = new Map([
  ['.html', 'text/html; charset=utf-8'], ['.js', 'text/javascript; charset=utf-8'],
  ['.mjs', 'text/javascript; charset=utf-8'], ['.css', 'text/css; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'], ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'], ['.jpeg', 'image/jpeg'], ['.webp', 'image/webp'],
  ['.svg', 'image/svg+xml'], ['.ico', 'image/x-icon'],
]);

function check(condition, message) {
  if (!condition) throw new Error(message);
}

const server = http.createServer((req, res) => {
  try {
    const url = new URL(req.url || '/', 'http://127.0.0.1');
    const pathname = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
    const target = path.resolve(root, `.${pathname}`);
    if (!target.startsWith(root + path.sep) || !fs.existsSync(target) || !fs.statSync(target).isFile()) {
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
const baseURL = `http://127.0.0.1:${server.address().port}`;
const executablePath = process.env.CHROME_BIN || '/usr/bin/google-chrome';
let browser;

try {
  browser = await chromium.launch({
    headless: true,
    executablePath,
    args: [
      '--no-sandbox', '--disable-dev-shm-usage', '--enable-webgl',
      '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader', '--use-angle=swiftshader',
    ],
  });

  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    reducedMotion: 'reduce',
  });
  await context.addInitScript(() => {
    window.__APP_TELEMETRY_DISABLED__ = true;
    localStorage.removeItem('kids_ark_pairs_records_v1');
    localStorage.removeItem('kids_ark_pairs_stats_v2');
    localStorage.removeItem('kids_ark_pairs_prefs_v2');
  });

  const page = await context.newPage();
  const pageErrors = [];
  const consoleErrors = [];
  page.on('pageerror', (error) => pageErrors.push(String(error?.stack || error)));
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });

  await page.route('https://telegram.org/js/telegram-web-app.js', (route) => route.fulfill({
    status: 200,
    contentType: 'text/javascript; charset=utf-8',
    body: `window.Telegram={WebApp:{initData:'',initDataUnsafe:{user:{id:999999,username:'qa_user',first_name:'QA'}},ready(){},expand(){},setHeaderColor(){},setBackgroundColor(){},enableClosingConfirmation(){},openTelegramLink(){},requestFullscreen(){},lockOrientation(){},unlockOrientation(){},HapticFeedback:{impactOccurred(){},notificationOccurred(){},selectionChanged(){}}}};`,
  }));
  const gasReply = JSON.stringify({ success: true, isBanned: false, wowStars: 20, wsStars: 0, swLevel: 0, lastGames: [] });
  for (const pattern of ['https://script.google.com/**', 'https://script.googleusercontent.com/**']) {
    await page.route(pattern, (route) => route.fulfill({ status: 200, contentType: 'application/json; charset=utf-8', body: gasReply }));
  }

  await page.goto(baseURL, { waitUntil: 'commit', timeout: 20_000 });
  await page.waitForSelector('#menu-container:not(.hidden)', { timeout: 10_000 });
  await page.waitForFunction(() => !document.documentElement.classList.contains('app-booting') && !document.documentElement.classList.contains('app-menu-preparing'), null, { timeout: 10_000 });
  await page.evaluate(() => window.showGame('kids-ark-pairs'));
  await page.waitForSelector('.kids-setup', { timeout: 10_000 });

  const setup = await page.evaluate(() => ({
    modes: document.querySelectorAll('[data-mode]').length,
    collections: document.querySelectorAll('[data-collection]').length,
    difficulties: document.querySelectorAll('[data-diff]').length,
    activeMode: document.querySelector('[data-mode][aria-pressed="true"]')?.dataset.mode,
    activeCollection: document.querySelector('[data-collection][aria-pressed="true"]')?.dataset.collection,
  }));
  check(setup.modes === 2, `Ожидалось 2 режима, получено ${setup.modes}`);
  check(setup.collections === 3, `Ожидалось 3 набора, получено ${setup.collections}`);
  check(setup.difficulties === 3, `Ожидалось 3 сложности, получено ${setup.difficulties}`);
  check(setup.activeMode === 'calm', 'Спокойный режим должен быть выбран по умолчанию');
  check(setup.activeCollection === 'ark', 'Весь ковчег должен быть выбран по умолчанию');

  await page.locator('[data-mode="speed"]').click();
  await page.locator('[data-collection="ocean"]').click();
  check(await page.locator('[data-mode="speed"]').getAttribute('aria-pressed') === 'true', 'Скоростной режим не активировался');
  check(await page.locator('[data-collection="ocean"]').getAttribute('aria-pressed') === 'true', 'Набор «У воды» не активировался');
  await page.locator('[data-diff="medium"]').click();
  await page.waitForSelector('.kids-game[data-size="5"] .kids-card', { timeout: 5_000 });

  const board = await page.evaluate(() => {
    const cards = [...document.querySelectorAll('.kids-card')];
    return {
      cards: cards.length,
      bonuses: cards.filter((card) => card.dataset.bonus === 'true').length,
      labels: cards.map((card) => card.getAttribute('aria-label')),
      theme: document.querySelector('.kids-game')?.className || '',
    };
  });
  check(board.cards === 25, `Среднее поле должно содержать 25 карточек, получено ${board.cards}`);
  check(board.bonuses === 1, `Среднее поле должно содержать 1 сюрприз, получено ${board.bonuses}`);
  check(new Set(board.labels).size === 25, 'Закрытые карточки должны иметь уникальные доступные подписи');
  check(board.theme.includes('kids-theme-ocean'), 'Тема «У воды» не применена к полю');

  async function cardState() {
    return page.locator('.kids-card').evaluateAll((cards) => cards.map((card) => ({
      idx: card.dataset.idx,
      emoji: card.dataset.emoji,
      bonus: card.dataset.bonus === 'true',
      matched: card.classList.contains('matched'),
    })));
  }

  const initialCards = await cardState();
  const groups = new Map();
  initialCards.filter((card) => !card.bonus).forEach((card) => {
    const list = groups.get(card.emoji) || [];
    list.push(card);
    groups.set(card.emoji, list);
  });
  const firstPair = [...groups.values()][0];
  await page.locator(`.kids-card[data-idx="${firstPair[0].idx}"]`).click();
  await page.locator(`.kids-card[data-idx="${firstPair[1].idx}"]`).click();
  await page.waitForFunction(() => document.querySelectorAll('.kids-card.matched').length === 2, null, { timeout: 3_000 });
  check(await page.locator('#kids-moves').textContent() === '1', 'Найденная пара должна считаться одним ходом');
  check(await page.locator('#kids-pairs').textContent() === '1/12', 'Счётчик найденных пар не обновился');

  const remaining = (await cardState()).filter((card) => !card.matched && !card.bonus);
  const mismatchA = remaining[0];
  const mismatchB = remaining.find((card) => card.emoji !== mismatchA.emoji);
  await page.locator(`.kids-card[data-idx="${mismatchA.idx}"]`).click();
  await page.locator(`.kids-card[data-idx="${mismatchB.idx}"]`).click();
  await page.waitForFunction(() => document.querySelector('#kids-moves')?.textContent === '2', null, { timeout: 2_000 });
  await page.waitForFunction(() => document.querySelectorAll('.kids-card.flipped').length === 0, null, { timeout: 3_000 });
  check(!(await page.locator(`.kids-card[data-idx="${mismatchA.idx}"]`).getAttribute('aria-label')).includes('открыта'), 'Неподходящая карточка осталась открытой');

  await page.locator('#kids-hint').click();
  await page.waitForFunction(() => document.querySelectorAll('.kids-card.peeked').length === 2, null, { timeout: 2_000 });
  check((await page.locator('#kids-hint').textContent()).includes('1'), 'Подсказка не уменьшила доступный запас');
  await page.waitForFunction(() => document.querySelectorAll('.kids-card.peeked').length === 0, null, { timeout: 3_000 });
  const timerAfterHint = await page.locator('#kids-mode-value').textContent();
  check(Number.parseFloat(timerAfterHint) >= 5, `Штраф подсказки не отражён в таймере: ${timerAfterHint}`);

  await page.locator('#kids-restart').click();
  await page.waitForFunction(() => document.querySelector('#kids-moves')?.textContent === '0' && document.querySelectorAll('.kids-card').length === 25, null, { timeout: 3_000 });
  await page.waitForTimeout(1_000);
  check(await page.locator('.kids-modal[data-kids-owned="true"]').count() === 0, 'Старое состояние показало модальное окно после перезапуска');

  let expectedMatched = 0;
  const freshCards = await cardState();
  const freshGroups = new Map();
  freshCards.filter((card) => !card.bonus).forEach((card) => {
    const list = freshGroups.get(card.emoji) || [];
    list.push(card);
    freshGroups.set(card.emoji, list);
  });
  for (const pair of freshGroups.values()) {
    await page.locator(`.kids-card[data-idx="${pair[0].idx}"]`).click();
    await page.locator(`.kids-card[data-idx="${pair[1].idx}"]`).click();
    expectedMatched += 2;
    await page.waitForFunction((count) => document.querySelectorAll('.kids-card.matched').length === count, expectedMatched, { timeout: 3_000 });
  }
  await page.locator('.kids-card[data-bonus="true"]').click();
  await page.waitForSelector('#kids-victory-title', { timeout: 4_000 });
  check(await page.locator('.kids-result-grid > div').count() === 3, 'Итоговое окно должно показывать три показателя');
  const saved = await page.evaluate(() => ({
    records: JSON.parse(localStorage.getItem('kids_ark_pairs_records_v1') || '{}'),
    stats: JSON.parse(localStorage.getItem('kids_ark_pairs_stats_v2') || '{}'),
  }));
  check(Array.isArray(saved.records.medium) && saved.records.medium.length === 1, 'Результат скоростной игры не сохранён');
  check(saved.stats.games === 1 && saved.stats.pairs === 12, 'Общая статистика победы сохранена неверно');

  await page.locator('#kids-change-settings').click();
  await page.waitForSelector('.kids-setup');
  check(await page.locator('[data-mode="speed"]').getAttribute('aria-pressed') === 'true', 'Выбранный режим не сохранился после игры');
  check(await page.locator('[data-collection="ocean"]').getAttribute('aria-pressed') === 'true', 'Выбранная коллекция не сохранилась после игры');

  await page.locator('[data-diff="hard"]').click();
  await page.waitForSelector('.kids-game[data-size="6"]');
  const hardCards = await cardState();
  const hardGroups = new Map();
  hardCards.forEach((card) => {
    const list = hardGroups.get(card.emoji) || [];
    list.push(card);
    hardGroups.set(card.emoji, list);
  });
  const hardPair = [...hardGroups.values()][0];
  await page.locator(`.kids-card[data-idx="${hardPair[0].idx}"]`).click();
  await page.locator(`.kids-card[data-idx="${hardPair[1].idx}"]`).click();
  await page.evaluate(() => window.goToMainMenu());
  await page.waitForTimeout(700);
  check(await page.locator('#game-container').textContent() === '', 'Очистка не освободила контейнер игры');
  check(await page.locator('.kids-modal[data-kids-owned="true"]').count() === 0, 'После выхода осталось игровое модальное окно');

  check(pageErrors.length === 0, `pageerror: ${pageErrors.join(' | ')}`);
  const meaningfulConsoleErrors = consoleErrors.filter((text) => !/favicon|Failed to load resource.*404/i.test(text));
  check(meaningfulConsoleErrors.length === 0, `console.error: ${meaningfulConsoleErrors.join(' | ')}`);

  await context.close();
  console.log('OK: Kids Ark Pairs setup, modes, collections, matching, mismatch, hint, restart, victory, persistence and cleanup are valid.');
} catch (error) {
  failures.push(error.message);
} finally {
  if (browser) await browser.close();
  await new Promise((resolve) => server.close(resolve));
}

if (failures.length) {
  console.error(`Kids Ark Pairs check failed:\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
