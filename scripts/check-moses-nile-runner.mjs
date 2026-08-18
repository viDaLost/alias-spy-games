import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';

const root = process.cwd();
const mime = new Map([
  ['.html', 'text/html; charset=utf-8'], ['.js', 'text/javascript; charset=utf-8'], ['.css', 'text/css; charset=utf-8'],
  ['.svg', 'image/svg+xml'], ['.png', 'image/png'], ['.webp', 'image/webp'], ['.json', 'application/json; charset=utf-8'],
  ['.obj', 'text/plain; charset=utf-8'], ['.glb', 'model/gltf-binary'],
]);

const gameSource = fs.readFileSync(path.join(root, 'web/games/moses-nile-runner.js'), 'utf8');
const threeSource = fs.readFileSync(path.join(root, 'web/games/moses-nile-runner-3d.js'), 'utf8');
const launcherSource = fs.readFileSync(path.join(root, 'web/js/moses-nile-runner-launcher.js'), 'utf8');
const indexSource = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const basketPath = path.join(root, 'web/assets/models/moses-nile/woven-basket.obj');
const basketSource = fs.readFileSync(basketPath, 'utf8');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'web/assets/models/moses-nile/model-manifest.json'), 'utf8'));

if (!gameSource.includes('startMosesNileRunner') || !gameSource.includes("const LANES = [-1, 0, 1]")) throw new Error('Nile runner engine is incomplete');
if (!gameSource.includes('pointerdown') || !gameSource.includes('pointerup') || !gameSource.includes('processSwipe')) throw new Error('Nile runner swipe controls are missing');
if (!launcherSource.includes("GAME_KEY = 'moses-nile-runner'") || !launcherSource.includes('moses-nile-runner-card')) throw new Error('Nile runner menu launcher is missing');
if (!launcherSource.includes('THREE_GAME_SRC') || !launcherSource.includes('__startMosesNile3D')) throw new Error('Nile runner 3D addon is not lazy-loaded by the launcher');
if (launcherSource.includes('new MutationObserver')) throw new Error('Nile runner launcher must not keep a broad menu MutationObserver alive');
if (!indexSource.includes('moses-nile-runner-launcher.js?v=2')) throw new Error('Nile runner launcher cache version was not bumped');

for (const token of [
  '__startMosesNile3D',
  '__cleanupMosesNile3D',
  'woven-basket.obj',
  'Rock_1.glb',
  'Plant_2.glb',
  'WoodLog.glb',
  'Raft.glb',
  'PalmTree_4.glb',
  "powerPreference: 'low-power'",
  'MAX_PIXEL_RATIO = 1.25',
  'MIN_FRAME_MS = 30',
]) {
  if (!threeSource.includes(token)) throw new Error(`Nile 3D layer is missing required mobile safeguard/asset: ${token}`);
}

const vertexCount = basketSource.split(/\r?\n/).filter((line) => line.startsWith('v ')).length;
const faceCount = basketSource.split(/\r?\n/).filter((line) => line.startsWith('f ')).length;
if (vertexCount !== 213 || faceCount !== 344) throw new Error(`Basket mesh changed unexpectedly: ${vertexCount} vertices / ${faceCount} triangles`);
if (fs.statSync(basketPath).size > manifest.limits.localAssetBytes) throw new Error('Basket mesh exceeds the mobile local-asset budget');

const remoteModels = manifest.models.filter((model) => model.url);
const remoteTotal = remoteModels.reduce((sum, model) => sum + Number(model.bytes || 0), 0);
if (remoteTotal > manifest.limits.remoteTotalBytes) throw new Error(`Remote Nile models exceed total budget: ${remoteTotal}`);
for (const model of remoteModels) {
  if (Number(model.bytes || 0) > manifest.limits.remoteAssetBytes) throw new Error(`${model.key} exceeds per-model mobile budget`);
  if (!String(model.url).includes('@d6aacfb25dd969ead90cddd94ad901e74aede5d8/')) throw new Error(`${model.key} is not pinned to the reviewed Quaternius revision`);
}
const basketManifest = manifest.models.find((model) => model.key === 'basket');
if (basketManifest?.triangles !== faceCount) throw new Error('Basket triangle budget metadata is stale');

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
const page = await context.newPage();
let addonRequests = 0;
page.on('request', (request) => {
  if (request.url().includes('/web/games/moses-nile-runner-3d.js')) addonRequests += 1;
});
page.on('pageerror', (error) => console.log(`[pageerror] ${error.stack || error.message}`));

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
await page.route('https://cdnjs.cloudflare.com/**', (route) => route.abort());
await page.route('https://cdn.jsdelivr.net/**', (route) => route.abort());

try {
  await page.goto(baseURL, { waitUntil: 'domcontentloaded', timeout: 20_000 });
  await page.waitForSelector('#menu-container:not(.hidden)', { timeout: 10_000 });
  await page.waitForSelector('#moses-nile-runner-card', { timeout: 5_000 });
  if (addonRequests !== 0) throw new Error('Nile 3D addon was loaded before the user opened the game');

  await page.locator('#moses-nile-runner-card').click();
  await page.waitForSelector('.mnr-shell[data-version="1"]', { timeout: 5_000 });
  await page.waitForFunction(() => [...document.scripts].some((script) => script.src.includes('moses-nile-runner-3d.js')), null, { timeout: 2_000 });
  if (addonRequests !== 1) throw new Error(`Expected one lazy 3D addon request, got ${addonRequests}`);
  await page.waitForSelector('#mnr-intro:not(.hidden)');
  await page.locator('#mnr-start').click();
  await page.waitForFunction(() => Number.parseInt(document.querySelector('#mnr-distance')?.textContent || '0', 10) > 0, null, { timeout: 4_000 });

  const stage = page.locator('#mnr-stage');
  const box = await stage.boundingBox();
  if (!box) throw new Error('Nile runner stage is not measurable');
  const basketBefore = await page.locator('#mnr-basket').evaluate((el) => getComputedStyle(el).left);
  await page.mouse.move(box.x + box.width * .5, box.y + box.height * .72);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * .78, box.y + box.height * .72, { steps: 5 });
  await page.mouse.up();
  await page.waitForTimeout(250);
  const basketAfter = await page.locator('#mnr-basket').evaluate((el) => getComputedStyle(el).left);
  if (basketAfter === basketBefore) throw new Error(`Horizontal swipe did not change lane: ${basketBefore}`);

  await page.mouse.move(box.x + box.width * .5, box.y + box.height * .72);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * .5, box.y + box.height * .45, { steps: 5 });
  await page.mouse.up();
  await page.waitForFunction(() => document.querySelector('#mnr-basket')?.classList.contains('is-boosting'), null, { timeout: 1_000 });

  await page.locator('#mnr-pause').click();
  await page.waitForSelector('#mnr-pause-tag.is-on');
  await page.locator('#mnr-pause').click();
  await page.waitForFunction(() => !document.querySelector('#mnr-pause-tag')?.classList.contains('is-on'));

  await page.locator('#mnr-back').click();
  await page.waitForSelector('#menu-container:not(.hidden)', { timeout: 4_000 });
  const state = await page.evaluate(() => ({
    mode: document.body.dataset.mode || '',
    runner: Boolean(document.querySelector('.mnr-shell')),
    canvas: Boolean(document.querySelector('.mnr-3d-canvas')),
    history: JSON.parse(localStorage.getItem('last_games_history') || '[]'),
  }));
  if (state.mode || state.runner || state.canvas || state.history[0] !== 'Моисей: путь по Нилу') throw new Error(`Runner cleanup/history failed: ${JSON.stringify(state)}`);

  console.log(`OK: Moses Nile runner lazily requests its 3D layer, enforces a ${remoteTotal}-byte pinned remote model budget, and stays playable when optional 3D CDNs are unavailable.`);
} finally {
  await context.close();
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
