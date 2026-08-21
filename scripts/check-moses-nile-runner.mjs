import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';

const root = process.cwd();
const launcherSource = fs.readFileSync(path.join(root, 'web/js/moses-nile-runner-launcher.js'), 'utf8');
const appIndex = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const v75Index = fs.readFileSync(path.join(root, 'web/games/moses-nile-v7/index.html'), 'utf8');
const v75Game = fs.readFileSync(path.join(root, 'web/games/moses-nile-v7/js/game-v75.js'), 'utf8');
const backgroundPath = path.join(root, 'web/games/moses-nile-v7/assets/nile-reference-bg-v75.webp');

for (const token of [
  "const VERSION = '5'",
  "GAME_URL = 'web/games/moses-nile-v7/index.html?embedded=1&v=752'",
  'mnr-v75-frame',
  'mnr-v75-close',
  'cleanupGame',
  "GAME_KEY = 'moses-nile-runner'",
]) {
  if (!launcherSource.includes(token)) throw new Error(`Nile V7.5.1 launcher is missing ${token}`);
}
if (launcherSource.includes('moses-nile-runner-3d.js') || launcherSource.includes('loadThreeAddon')) {
  throw new Error('The launcher still loads the retired parallel runner');
}
if (!appIndex.includes('moses-nile-runner-launcher.js?v=5')) throw new Error('Nile launcher cache version was not bumped');
if (!appIndex.includes("connect-src 'self' https://*.workers.dev wss://*.workers.dev https://cdn.jsdelivr.net")) throw new Error('Nile CDN is not allowed by the app CSP');
if (!v75Index.includes('game-v75.js?v=752') || !v75Index.includes('nile-reference-bg-v75.webp')) throw new Error('The V7.5.1 iframe entry is incomplete');
if (!v75Game.includes('__mosesV75ReferenceRebuild') || !v75Game.includes('oneRenderLoop: true') || !v75Game.includes('V751DetailedCrocodileModel')) throw new Error('The V7.5.1 real-asset engine is not wired');
if (!fs.existsSync(backgroundPath)) throw new Error('The V7.5.1 cinematic environment is missing');
if (process.env.MOSES_STATIC_ONLY === '1') {
  console.log('OK: Moses Nile V7.5.1 launcher, real-asset engine and cinematic environment are wired together.');
  process.exit(0);
}

const mime = new Map([
  ['.html', 'text/html; charset=utf-8'], ['.js', 'text/javascript; charset=utf-8'], ['.css', 'text/css; charset=utf-8'],
  ['.svg', 'image/svg+xml'], ['.png', 'image/png'], ['.webp', 'image/webp'], ['.json', 'application/json; charset=utf-8'],
  ['.obj', 'text/plain; charset=utf-8'], ['.glb', 'model/gltf-binary'],
]);
const server = http.createServer((request, response) => {
  const url = new URL(request.url || '/', 'http://127.0.0.1');
  const pathname = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
  const target = path.resolve(root, `.${pathname}`);
  if (!target.startsWith(`${root}${path.sep}`) || !fs.existsSync(target) || !fs.statSync(target).isFile()) {
    response.writeHead(404).end('Not found');
    return;
  }
  response.writeHead(200, { 'Content-Type': mime.get(path.extname(target).toLowerCase()) || 'application/octet-stream', 'Cache-Control': 'no-store' });
  fs.createReadStream(target).pipe(response);
});

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const baseURL = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_BIN || '/usr/bin/google-chrome', args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-webgl'] });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const page = await context.newPage();
const pageErrors = [];
let retiredRunnerRequests = 0;
page.on('pageerror', (error) => pageErrors.push(error.message));
page.on('request', (request) => {
  if (/moses-nile-runner(?:-3d)?\.js/.test(request.url())) retiredRunnerRequests += 1;
});

await page.route('https://telegram.org/js/telegram-web-app.js', (route) => route.fulfill({
  status: 200,
  contentType: 'text/javascript; charset=utf-8',
  body: `window.Telegram={WebApp:{initData:'qa',initDataUnsafe:{user:{id:1288379477,username:'qa'}},ready(){},expand(){},setHeaderColor(){},setBackgroundColor(){},openTelegramLink(){},HapticFeedback:{impactOccurred(){},notificationOccurred(){}}}};`,
}));
await page.route('https://alias-spy-games-core.vitaledanilov.workers.dev/compat', async (route) => {
  let action = '';
  try { action = String(route.request().postDataJSON()?.payload?.action || ''); } catch {}
  if (action === 'referralStatus') {
    await route.fulfill({ status: 200, contentType: 'application/json; charset=utf-8', body: JSON.stringify({ success: true, answered: true, skip: true }) });
    return;
  }
  await route.fulfill({ status: 200, contentType: 'application/json; charset=utf-8', body: JSON.stringify({ success: true, isBanned: false, wowStars: 20, wsStars: 0, swLevel: 0, lastGames: [] }) });
});
await page.route('https://cdnjs.cloudflare.com/**', (route) => route.fulfill({ status: 200, contentType: 'text/javascript', body: '' }));
await page.route('https://cdn.jsdelivr.net/**', (route) => route.fulfill({ status: 200, contentType: 'text/javascript', body: '' }));

try {
  await page.goto(baseURL, { waitUntil: 'domcontentloaded', timeout: 20_000 });
  await page.waitForSelector('#menu-container:not(.hidden)', { timeout: 10_000 });
  await page.waitForSelector('#moses-nile-runner-card', { timeout: 5_000 });
  await page.locator('#moses-nile-runner-card').click();
  await page.waitForSelector('.mnr-v75-host', { timeout: 4_000 });
  const frameElement = page.locator('.mnr-v75-frame');
  const frame = page.frameLocator('.mnr-v75-frame');
  await frame.locator('#start-screen').waitFor({ state: 'visible', timeout: 8_000 });
  await frame.locator('#version-badge').waitFor({ state: 'visible', timeout: 3_000 });
  await page.waitForFunction(() => document.querySelector('.mnr-v75-loader')?.classList.contains('is-hidden'));

  const hostBox = await page.locator('.mnr-v75-host').boundingBox();
  const frameBox = await frameElement.boundingBox();
  if (!hostBox || !frameBox || hostBox.width < 389 || hostBox.height < 843 || frameBox.width < 389 || frameBox.height < 843) {
    throw new Error(`V7.5.1 iframe is not full-screen: host=${JSON.stringify(hostBox)} frame=${JSON.stringify(frameBox)}`);
  }
  const mode = await frame.locator('body').evaluate(() => ({
    mode: window.__mosesV75Mode,
    badge: document.getElementById('version-badge')?.textContent,
    background: getComputedStyle(document.getElementById('scene-bg')).backgroundImage,
  }));
  if (mode.mode !== 'fallback' || !mode.badge?.startsWith('V7.5.1 · LITE READY') || !mode.background.includes('nile-reference-bg-v75.webp')) {
    throw new Error(`V7.5.1 fallback did not boot inside the app: ${JSON.stringify(mode)}`);
  }

  await frame.locator('#start-btn').click();
  await frame.locator('#dist-txt').waitFor({ state: 'visible' });
  await page.waitForFunction(() => {
    const iframe = document.querySelector('.mnr-v75-frame');
    return Number(iframe?.contentDocument?.getElementById('dist-txt')?.textContent || 0) >= 8;
  }, null, { timeout: 3_000 });
  await frame.locator('#btn-right').click();
  await page.waitForFunction(() => document.querySelector('.mnr-v75-frame')?.contentWindow?.__mosesV75Diagnostics?.lane === 2, null, { timeout: 2_000 });

  await page.locator('.mnr-v75-close').click();
  await page.waitForSelector('#menu-container:not(.hidden)', { timeout: 4_000 });
  const finalState = await page.evaluate(() => ({
    mode: document.body.dataset.mode || '',
    currentGame: document.body.dataset.currentGame || '',
    host: Boolean(document.querySelector('.mnr-v75-host')),
    history: JSON.parse(localStorage.getItem('last_games_history') || '[]'),
  }));
  if (finalState.mode || finalState.currentGame || finalState.host || finalState.history[0] !== 'Моисей: путь по Нилу') {
    throw new Error(`V7.5.1 return/history failed: ${JSON.stringify(finalState)}`);
  }
  if (retiredRunnerRequests !== 0) throw new Error(`Retired parallel runner was requested ${retiredRunnerRequests} times`);
  if (pageErrors.length) throw new Error(`V7.5.1 integration page errors: ${pageErrors.join(' | ')}`);
  console.log('OK: the main menu opens Moses Nile V7.5.1 full-screen, the no-WebGL path remains playable, and the legacy parallel runner is not requested.');
} finally {
  await context.close();
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
