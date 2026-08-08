import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';

const root = process.cwd();
const mime = new Map([
  ['.html', 'text/html; charset=utf-8'], ['.js', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'], ['.json', 'application/json; charset=utf-8'],
  ['.png', 'image/png'], ['.jpg', 'image/jpeg'], ['.jpeg', 'image/jpeg'], ['.webp', 'image/webp'],
]);

const server = http.createServer((req, res) => {
  const url = new URL(req.url || '/', 'http://127.0.0.1');
  const pathname = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
  const target = path.resolve(root, `.${pathname}`);
  if (!target.startsWith(root + path.sep) || !fs.existsSync(target) || !fs.statSync(target).isFile()) {
    res.writeHead(404).end('Not found');
    return;
  }
  res.writeHead(200, { 'Content-Type': mime.get(path.extname(target).toLowerCase()) || 'application/octet-stream', 'Cache-Control': 'no-store' });
  fs.createReadStream(target).pipe(res);
});

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const baseURL = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_BIN || '/usr/bin/google-chrome', args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
await context.addInitScript(() => {
  window.__APP_TELEMETRY_DISABLED__ = true;
  localStorage.setItem('last_games_history', JSON.stringify(['Опиши, но не называй', 'Священное слово', 'Поиск библейских слов']));
  localStorage.setItem('home_hidden_sections_v1', JSON.stringify(['continue', 'recent', 'progress']));
});
const page = await context.newPage();

await page.route('https://telegram.org/js/telegram-web-app.js', (route) => route.fulfill({
  status: 200,
  contentType: 'text/javascript; charset=utf-8',
  body: `window.Telegram={WebApp:{initData:'qa-init-data',initDataUnsafe:{user:{id:1288379477,username:'qa_admin',first_name:'QA'}},ready(){},expand(){},setHeaderColor(){},setBackgroundColor(){},enableClosingConfirmation(){},openTelegramLink(){},HapticFeedback:{impactOccurred(){},notificationOccurred(){},selectionChanged(){}}}};`,
}));
await page.route('https://alias-spy-games-core.vitaledanilov.workers.dev/compat', async (route) => {
  await new Promise((resolve) => setTimeout(resolve, 300));
  await route.fulfill({
    status: 200,
    contentType: 'application/json; charset=utf-8',
    body: JSON.stringify({ success: true, isBanned: false, wowStars: 20, wsStars: 0, swLevel: 0, lastGames: ['Опиши, но не называй', 'Священное слово', 'Поиск библейских слов'] }),
  });
});

await page.goto(baseURL, { waitUntil: 'domcontentloaded', timeout: 20_000 });
await page.waitForTimeout(60);
const boot = await page.evaluate(() => {
  const menu = document.getElementById('menu-container');
  const loader = document.getElementById('main-loader');
  return {
    booting: document.documentElement.classList.contains('app-booting'),
    menuHiddenClass: menu?.classList.contains('hidden'),
    menuVisibility: menu ? getComputedStyle(menu).visibility : '',
    loaderDisplay: loader ? getComputedStyle(loader).display : 'none',
  };
});
if (!boot.booting) throw new Error('Стартовый UI был разблокирован до окончания проверки доступа.');
if (!boot.menuHiddenClass && boot.menuVisibility !== 'hidden') throw new Error(`Главное меню попало в кадр во время проверки доступа: ${JSON.stringify(boot)}`);
if (boot.loaderDisplay === 'none') throw new Error('Во время проверки доступа не показан loader.');

await page.waitForSelector('#menu-container:not(.hidden)', { timeout: 10_000 });
await page.waitForFunction(() => !document.documentElement.classList.contains('app-booting') && !document.documentElement.classList.contains('app-menu-preparing'), null, { timeout: 10_000 });
await page.waitForSelector('#home-dashboard[data-content-ready="1"][data-controls-ready="1"]', { timeout: 5_000 });

const prepared = await page.evaluate(() => {
  const imageState = [...document.querySelectorAll('#menu-container .game-card__img, #menu-container .home-continue__icon img')]
    .map((img) => ({ complete: img.complete, width: img.naturalWidth, src: img.getAttribute('src') }));
  return {
    marker: document.documentElement.dataset.homeHidden || '',
    continueDisplay: getComputedStyle(document.querySelector('.home-continue')).display,
    recentDisplay: getComputedStyle(document.querySelector('.home-recent')).display,
    progressDisplay: getComputedStyle(document.querySelector('.home-progress')).display,
    imageState,
    motionReady: window.__appMotionReady === true,
    motionToken: getComputedStyle(document.documentElement).getPropertyValue('--app-motion-normal').trim(),
  };
});
const markerKeys = prepared.marker.split(/\s+/).filter(Boolean).sort();
if (markerKeys.join(',') !== ['continue', 'progress', 'recent'].join(',')) throw new Error(`Скрытые блоки не отмечены до показа меню: ${prepared.marker}`);
if ([prepared.continueDisplay, prepared.recentDisplay, prepared.progressDisplay].some((value) => value !== 'none')) throw new Error(`Скрытый блок видим после подготовки: ${JSON.stringify(prepared)}`);
if (!prepared.imageState.length || prepared.imageState.some((img) => !img.complete || img.width <= 0)) throw new Error(`Меню показано до декодирования иконок: ${JSON.stringify(prepared.imageState)}`);
if (!prepared.motionReady || !prepared.motionToken) throw new Error('Единый слой анимаций не загрузился.');

await page.waitForSelector('.home-hidden-restore button', { timeout: 5_000 });
await page.locator('.home-hidden-restore button').click();
await page.waitForFunction(() => document.querySelectorAll('#home-dashboard .home-section-hide').length === 3);

for (let i = 0; i < 3; i += 1) {
  await page.locator('#home-dashboard .home-section-hide').first().click();
  await page.waitForFunction(() => document.querySelectorAll('#home-dashboard .home-section-hide').length === 2 - i);
}
await page.waitForSelector('.home-hidden-restore button');

await page.waitForSelector('#system-actions [data-system-icon="support"][data-icon-version="2"]', { timeout: 5_000 });
await page.waitForSelector('#admin-btn [data-system-icon="admin"][data-icon-version="2"]', { timeout: 5_000 });

await page.evaluate(() => window.showGame('describe'));
await page.waitForFunction(() => document.body.dataset.mode === 'game' && document.getElementById('game-container')?.children.length > 0, null, { timeout: 8_000 });
const flashOnReturn = await page.evaluate(() => new Promise((resolve) => {
  let flashed = false;
  const started = performance.now();
  window.goToMainMenu();
  function sample() {
    const menu = document.getElementById('menu-container');
    const menuStyle = menu ? getComputedStyle(menu) : null;
    const menuPainted = Boolean(menu && !menu.classList.contains('hidden') && menuStyle.visibility !== 'hidden' && menuStyle.opacity !== '0');
    const hiddenTargets = ['.home-continue', '.home-recent', '.home-progress'].map((selector) => document.querySelector(selector)).filter(Boolean);
    if (menuPainted && hiddenTargets.some((node) => getComputedStyle(node).display !== 'none')) flashed = true;
    if (performance.now() - started > 520) resolve(flashed);
    else requestAnimationFrame(sample);
  }
  requestAnimationFrame(sample);
}));
if (flashOnReturn) throw new Error('При возврате из игры скрытые домашние блоки попали в видимый кадр.');
await page.waitForFunction(() => !document.documentElement.classList.contains('app-menu-preparing'));

console.log('OK: access gate prevents menu flash, hidden home sections never flash, menu icons are decoded before reveal, system icons and unified motion are active.');
await context.close();
await browser.close();
await new Promise((resolve) => server.close(resolve));
