import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';

const root = process.cwd();
const gameRoot = path.join(root, 'web/games/moses-nile-v7');
const index = fs.readFileSync(path.join(gameRoot, 'index.html'), 'utf8');
const game = fs.readFileSync(path.join(gameRoot, 'js/game-v75.js'), 'utf8');
const background = path.join(gameRoot, 'assets/nile-reference-bg-v75.webp');

for (const token of [
  'V7.5 · LOADING',
  'nile-reference-bg-v75.webp',
  'game-v75.js?v=751',
  'fallback-canvas',
  'aria-label="Двигаться влево"',
]) {
  if (!index.includes(token)) throw new Error(`V7.5 index is missing ${token}`);
}
if (index.includes('type="module"') || index.includes('v740-visual-overhaul.js') || index.includes('v7310-mobile-polish.js')) {
  throw new Error('V7.5 must not load the legacy multi-runtime patch stack');
}
for (const token of [
  '__mosesV75ReferenceRebuild',
  'oneRenderLoop: true',
  'activateFallback',
  'V75DistantPyramid',
  'V75ReedsInstanced',
  'V75ClosedBasketLid',
  'waterNormal.offset',
  'cinematicBackgroundVisible: true',
  "const LANES = [-3.75, 0, 3.75]",
]) {
  if (!game.includes(token)) throw new Error(`V7.5 engine is missing ${token}`);
}
if (!fs.existsSync(background)) throw new Error('Cinematic Nile background is missing');
const backgroundBytes = fs.statSync(background).size;
if (backgroundBytes < 50_000 || backgroundBytes > 250_000) throw new Error(`Unexpected background budget: ${backgroundBytes}`);
if (process.env.MOSES_STATIC_ONLY === '1') {
  console.log(`OK: Moses Nile V7.5 static contract and ${backgroundBytes}-byte cinematic asset are valid.`);
  process.exit(0);
}

const mime = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.webp', 'image/webp'],
]);
const server = http.createServer((request, response) => {
  const url = new URL(request.url || '/', 'http://127.0.0.1');
  const relative = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
  const target = path.resolve(gameRoot, `.${relative}`);
  if (!target.startsWith(`${gameRoot}${path.sep}`) || !fs.existsSync(target) || !fs.statSync(target).isFile()) {
    response.writeHead(404).end('Not found');
    return;
  }
  response.writeHead(200, { 'Content-Type': mime.get(path.extname(target)) || 'application/octet-stream', 'Cache-Control': 'no-store' });
  fs.createReadStream(target).pipe(response);
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
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
await page.route('**/vendor/**', (route) => route.fulfill({ status: 200, contentType: 'text/javascript', body: '' }));
await page.route('**/js/assets.js*', (route) => route.fulfill({
  status: 200,
  contentType: 'text/javascript',
  body: 'window.assetManager={};',
}));
await page.route('**/js/sound.js*', (route) => route.fulfill({
  status: 200,
  contentType: 'text/javascript',
  body: 'window.gameAudio={init(){},playSplash(){},playCollect(){},playPowerup(){},playHit(){}};',
}));

try {
  await page.goto(url, { waitUntil: 'networkidle', timeout: 20_000 });
  await page.waitForFunction(() => window.__mosesV75Mode === 'fallback', null, { timeout: 5_000 });
  const initial = await page.evaluate(async () => {
    const bg = getComputedStyle(document.getElementById('scene-bg')).backgroundImage;
    const image = new Image();
    image.src = 'assets/nile-reference-bg-v75.webp';
    await image.decode();
    const left = document.getElementById('btn-left').getBoundingClientRect();
    const right = document.getElementById('btn-right').getBoundingClientRect();
    return {
      mode: window.__mosesV75Mode,
      fallbackClass: document.body.classList.contains('fallback-mode'),
      background: bg,
      imageSize: [image.naturalWidth, image.naturalHeight],
      controlsInsideViewport: left.left >= 0 && right.right <= innerWidth && left.bottom <= innerHeight && right.bottom <= innerHeight,
      badge: document.getElementById('version-badge').textContent,
    };
  });
  if (initial.mode !== 'fallback' || !initial.fallbackClass) throw new Error(`Fallback did not initialize: ${JSON.stringify(initial)}`);
  if (!initial.background.includes('nile-reference-bg-v75.webp')) throw new Error('Cinematic background is not applied');
  if (initial.imageSize.join('x') !== '1024x1536') throw new Error(`Unexpected background dimensions: ${initial.imageSize}`);
  if (!initial.controlsInsideViewport) throw new Error('Mobile controls are clipped');
  if (!initial.badge.startsWith('V7.5 · LITE READY')) throw new Error(`Unexpected fallback badge: ${initial.badge}`);

  await page.locator('#start-btn').click();
  await page.waitForFunction(() => Number(document.getElementById('dist-txt')?.textContent || 0) >= 8, null, { timeout: 3_000 });
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(350);
  const running = await page.evaluate(() => {
    const canvas = document.getElementById('fallback-canvas');
    const ctx = canvas.getContext('2d');
    const sample = ctx.getImageData(Math.floor(canvas.width * .30), Math.floor(canvas.height * .45), Math.max(1, Math.floor(canvas.width * .40)), Math.max(1, Math.floor(canvas.height * .45))).data;
    let painted = 0;
    for (let i = 3; i < sample.length; i += 4) if (sample[i] > 0) painted += 1;
    return {
      playing: document.body.classList.contains('is-playing'),
      startHidden: document.getElementById('start-screen').classList.contains('hidden'),
      distance: Number(document.getElementById('dist-txt').textContent || 0),
      painted,
    };
  });
  if (!running.playing || !running.startHidden || running.distance < 8 || running.painted < 200) throw new Error(`Fallback gameplay is not visibly running: ${JSON.stringify(running)}`);
  if (errors.length) throw new Error(`Fallback page errors: ${errors.join(' | ')}`);
  console.log(`OK: Moses Nile V7.5 uses one runtime, a ${backgroundBytes}-byte cinematic environment, unclipped mobile controls, and a playable no-WebGL fallback.`);
} finally {
  await context.close();
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
