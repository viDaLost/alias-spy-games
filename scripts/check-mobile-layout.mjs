import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';

const root = process.cwd();
const widths = [390, 320];
const failures = [];
const mime = new Map([
  ['.html', 'text/html; charset=utf-8'], ['.js', 'text/javascript; charset=utf-8'],
  ['.mjs', 'text/javascript; charset=utf-8'], ['.css', 'text/css; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'], ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'], ['.jpeg', 'image/jpeg'], ['.webp', 'image/webp'], ['.svg', 'image/svg+xml'],
]);

const server = http.createServer((req, res) => {
  try {
    const url = new URL(req.url || '/', 'http://127.0.0.1');
    const pathname = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
    const target = path.resolve(root, `.${pathname}`);
    if (!target.startsWith(root + path.sep) || !fs.existsSync(target) || !fs.statSync(target).isFile()) {
      res.writeHead(404).end('Not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': mime.get(path.extname(target).toLowerCase()) || 'application/octet-stream', 'Cache-Control': 'no-store' });
    fs.createReadStream(target).pipe(res);
  } catch (error) {
    res.writeHead(500).end(String(error));
  }
});

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const baseURL = `http://127.0.0.1:${server.address().port}`;
const executablePath = process.env.CHROME_BIN || '/usr/bin/google-chrome';
const browser = await chromium.launch({
  headless: true,
  executablePath,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--enable-webgl', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader', '--use-angle=swiftshader'],
});

async function pageFor(width) {
  const context = await browser.newContext({ viewport: { width, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await context.addInitScript(() => { window.__APP_TELEMETRY_DISABLED__ = true; });
  const page = await context.newPage();
  await page.route('https://telegram.org/js/telegram-web-app.js', (route) => route.fulfill({
    status: 200,
    contentType: 'text/javascript; charset=utf-8',
    body: `window.Telegram={WebApp:{initData:'',initDataUnsafe:{user:{id:999999,username:'qa_user',first_name:'QA'}},ready(){},expand(){},setHeaderColor(){},setBackgroundColor(){},enableClosingConfirmation(){},openTelegramLink(){},HapticFeedback:{impactOccurred(){},notificationOccurred(){},selectionChanged(){}}}};`,
  }));
  const gasReply = JSON.stringify({ success: true, isBanned: false, wowStars: 20, wsStars: 0, swLevel: 0, lastGames: [] });
  for (const pattern of ['https://script.google.com/**', 'https://script.googleusercontent.com/**']) {
    await page.route(pattern, (route) => route.fulfill({ status: 200, contentType: 'application/json; charset=utf-8', body: gasReply }));
  }
  await page.goto(baseURL, { waitUntil: 'domcontentloaded', timeout: 20_000 });
  await page.waitForSelector('#menu-container:not(.hidden)', { timeout: 10_000 });
  return { page, context };
}

const discovery = await pageFor(390);
const gameKeys = [...new Set(await discovery.page.locator('.game-card[onclick*="showGame("]').evaluateAll((buttons) => buttons
  .map((button) => (button.getAttribute('onclick') || '').match(/showGame\(['\"]([^'\"]+)['\"]\)/)?.[1])
  .filter(Boolean)))];
await discovery.context.close();

for (const width of widths) {
  for (const gameKey of gameKeys) {
    const { page, context } = await pageFor(width);
    try {
      await page.evaluate((key) => window.showGame(key), gameKey);
      await page.waitForFunction(() => {
        const container = document.getElementById('game-container');
        return container && container.children.length > 0 && !container.querySelector('.app-game-loading');
      }, null, { timeout: 12_000 });
      await page.waitForTimeout(500);

      const geometry = await page.evaluate(() => {
        const viewport = window.innerWidth;
        const docWidth = Math.max(document.documentElement.scrollWidth, document.body.scrollWidth);
        const offenders = [...document.querySelectorAll('#game-container *')]
          .map((el) => ({ el, rect: el.getBoundingClientRect() }))
          .filter(({ rect }) => rect.width > 0 && (rect.right > viewport + 2 || rect.left < -2))
          .slice(0, 5)
          .map(({ el, rect }) => ({
            tag: el.tagName.toLowerCase(),
            id: el.id || '',
            cls: String(el.className || '').slice(0, 90),
            left: Math.round(rect.left),
            right: Math.round(rect.right),
            width: Math.round(rect.width),
          }));

        const tinyControls = [...document.querySelectorAll('#game-container button:not(.sw-kb-key), #game-container [role="button"]')]
          .map((el) => ({ el, rect: el.getBoundingClientRect() }))
          .filter(({ el, rect }) => !el.disabled && rect.width > 0 && rect.height > 0 && (rect.width < 28 || rect.height < 28))
          .slice(0, 5)
          .map(({ el, rect }) => ({ text: (el.textContent || '').trim().slice(0, 40), width: Math.round(rect.width), height: Math.round(rect.height) }));

        return { viewport, docWidth, offenders, tinyControls };
      });

      if (geometry.docWidth > geometry.viewport + 2) {
        throw new Error(`horizontal overflow ${geometry.docWidth}px > ${geometry.viewport}px; ${JSON.stringify(geometry.offenders)}`);
      }
      if (geometry.tinyControls.length) throw new Error(`too-small controls: ${JSON.stringify(geometry.tinyControls)}`);
      console.log(`✓ ${gameKey} @ ${width}px`);
    } catch (error) {
      failures.push(`${gameKey} @ ${width}px: ${error.message}`);
      console.error(`✗ ${gameKey} @ ${width}px: ${error.message}`);
    } finally {
      await context.close();
    }
  }
}

await browser.close();
await new Promise((resolve) => server.close(resolve));

if (failures.length) {
  console.error(`\nMobile layout check failed (${failures.length}):\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.log(`\nOK: ${gameKeys.length} games fit both ${widths.join('px and ')}px phone viewports.`);
