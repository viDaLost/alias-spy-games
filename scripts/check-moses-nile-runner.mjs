import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const appIndex = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const homeSource = fs.readFileSync(path.join(root, 'web/js/home-enhancements.js'), 'utf8');
const launcherPath = path.join(root, 'web/js/moses-nile-runner-launcher.js');
const menuIconPath = path.join(root, 'web/assets/icons/moses-nile-runner.svg');
const gamePath = path.join(root, 'web/games/moses-nile-v7/index.html');

if (appIndex.includes('moses-nile-runner-launcher.js')) {
  throw new Error('Moses Nile launcher is still connected to the main application');
}
for (const token of ['Моисей: путь по Нилу', 'moses-nile-runner', 'mosesNile']) {
  if (homeSource.includes(token)) throw new Error(`Moses Nile is still exposed by the home dashboard: ${token}`);
}
if (fs.existsSync(launcherPath) || fs.existsSync(menuIconPath)) {
  throw new Error('Unused Moses Nile menu integration files are still published');
}
if (!fs.existsSync(gamePath)) {
  throw new Error('The standalone Moses Nile implementation must remain archived');
}

if (process.env.MOSES_STATIC_ONLY === '1') {
  console.log('OK: Moses Nile is hidden from the main menu while its implementation remains archived.');
  process.exit(0);
}

const { chromium } = await import('playwright-core');
const mime = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
  ['.png', 'image/png'],
  ['.webp', 'image/webp'],
  ['.json', 'application/json; charset=utf-8'],
]);
const server = http.createServer((request, response) => {
  const url = new URL(request.url || '/', 'http://127.0.0.1');
  const pathname = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
  const target = path.resolve(root, `.${pathname}`);
  if (!target.startsWith(`${root}${path.sep}`) || !fs.existsSync(target) || !fs.statSync(target).isFile()) {
    response.writeHead(404).end('Not found');
    return;
  }
  response.writeHead(200, {
    'Content-Type': mime.get(path.extname(target).toLowerCase()) || 'application/octet-stream',
    'Cache-Control': 'no-store',
  });
  fs.createReadStream(target).pipe(response);
});

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const baseURL = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROME_BIN || '/usr/bin/google-chrome',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
await context.addInitScript(() => {
  localStorage.setItem('last_games_history', JSON.stringify(['Моисей: путь по Нилу', 'Найди пару']));
});
const page = await context.newPage();
let launcherRequests = 0;
page.on('request', (request) => {
  if (request.url().includes('moses-nile-runner-launcher.js')) launcherRequests += 1;
});
await page.route('https://telegram.org/js/telegram-web-app.js', (route) => route.fulfill({
  status: 200,
  contentType: 'text/javascript; charset=utf-8',
  body: `window.Telegram={WebApp:{initData:'qa',initDataUnsafe:{user:{id:1288379477,username:'qa'}},ready(){},expand(){},setHeaderColor(){},setBackgroundColor(){},openTelegramLink(){},HapticFeedback:{impactOccurred(){},notificationOccurred(){}}}};`,
}));
await page.route('https://alias-spy-games-core.vitaledanilov.workers.dev/compat', (route) => route.fulfill({
  status: 200,
  contentType: 'application/json; charset=utf-8',
  body: JSON.stringify({ success: true, isBanned: false, wowStars: 20, wsStars: 0, swLevel: 0, lastGames: [] }),
}));
await page.route('https://cdnjs.cloudflare.com/**', (route) => route.fulfill({ status: 200, contentType: 'text/javascript', body: '' }));
await page.route('https://cdn.jsdelivr.net/**', (route) => route.fulfill({ status: 200, contentType: 'text/javascript', body: '' }));

try {
  await page.goto(baseURL, { waitUntil: 'domcontentloaded', timeout: 20_000 });
  await page.waitForSelector('#menu-container:not(.hidden)', { timeout: 10_000 });
  await page.waitForSelector('#home-dashboard[data-content-ready="1"]', { timeout: 5_000 });
  const state = await page.evaluate(() => ({
    card: Boolean(document.getElementById('moses-nile-runner-card')),
    dashboardText: document.getElementById('home-dashboard')?.textContent || '',
    openerType: typeof window.openMosesNileRunner,
  }));
  if (state.card || state.dashboardText.includes('Моисей: путь по Нилу') || state.openerType !== 'undefined') {
    throw new Error(`Moses Nile remains visible or callable from the main menu: ${JSON.stringify(state)}`);
  }
  if (launcherRequests !== 0) throw new Error(`Hidden Moses launcher was requested ${launcherRequests} times`);
  console.log('OK: Moses Nile is absent from the main menu, including stale recent-game history.');
} finally {
  await context.close();
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
