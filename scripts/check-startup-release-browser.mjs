// Integration checks use mocked services; no real user/admin requests are sent.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { chromium } from 'playwright-core';

const root = process.cwd();
const mime = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.json':'application/json', '.svg':'image/svg+xml', '.webp':'image/webp', '.png':'image/png' };
const server = http.createServer((req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  const file = path.resolve(root, `.${pathname === '/' ? '/index.html' : pathname}`);
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return res.writeHead(404).end();
  res.writeHead(200, { 'Content-Type':mime[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
let browser;
try {
  browser = await chromium.launch({ headless:true, executablePath:process.env.CHROME_BIN || '/usr/bin/google-chrome', args:['--no-sandbox', '--disable-dev-shm-usage'] });
  for (const role of ['guest', 'denied', 'root', 'delegated']) {
    const context = await browser.newContext({ viewport:{width:390, height:844}, isMobile:true, hasTouch:true, serviceWorkers:'block' });
    await context.addInitScript(() => { window.__APP_TELEMETRY_DISABLED__ = true; });
    const page = await context.newPage();
    const errors = [];
    const requests = [];
    page.on('pageerror', error => errors.push(error.message));
    let failDownload = role === 'root';
    // One route handles all traffic, keeping tests independent of live services.
    await page.route('**/*', route => {
      const url = route.request().url();
      if (url.startsWith(base)) {
        if (/\/web\/dist\/admin\./.test(url)) {
          requests.push(url);
          if (failDownload) { failDownload = false; return route.abort('failed'); }
        }
        return route.continue();
      }
      if (url.startsWith('https://telegram.org/')) {
        const id = role === 'root' ? 500000001 : 999999;
        const initData = role === 'guest' ? '' : 'signed-test-data';
        return route.fulfill({ contentType:'text/javascript', body:`window.Telegram={WebApp:{initData:${JSON.stringify(initData)},initDataUnsafe:{user:{id:${id},username:'qa',first_name:'QA'}},ready(){},expand(){},setHeaderColor(){},setBackgroundColor(){},disableVerticalSwipes(){},HapticFeedback:{impactOccurred(){},notificationOccurred(){},selectionChanged(){}}}};` });
      }
      let body = {};
      try { body = route.request().postDataJSON() || {}; } catch {}
      const action = (body.payload || body).action;
      let response = { success:true, isBanned:false, lastGames:[], items:[], users:[] };
      if (action === 'adminRoleStatus') response = { success:true, isAdmin:['root','delegated'].includes(role), isRoot:role === 'root', userId:role === 'root' ? '500000001' : '999999' };
      if (action === 'getAdminData') response.users = [{id:'123456', username:'test_player', wowStars:3, isBanned:false}];
      if (action === 'referralStatus') response = { success:true, required:false, answered:true };
      return route.fulfill({ contentType:'application/json', body:JSON.stringify(response) });
    });
    await page.goto(base, {waitUntil:'domcontentloaded'});
    await page.waitForSelector('#menu-container:not(.hidden)');
    await page.waitForFunction(() => document.querySelectorAll('.game-card__details').length === 13);
    assert.equal(requests.length, 0, `${role}: admin bundle downloaded before opening admin`);
    if (role === 'guest') {
      for (const width of [320, 390]) for (const theme of ['light','dark']) {
        await page.setViewportSize({width,height:844});
        await page.evaluate(theme => document.documentElement.classList.toggle('theme-dark', theme === 'dark'), theme);
        const layout = await page.locator('.game-card__details').evaluateAll(nodes => nodes.every(node => {
          const box = node.getBoundingClientRect();
          const card = node.closest('.game-card').getBoundingClientRect();
          return box.width > 0 && box.height > 0 && node.scrollWidth <= node.clientWidth + 1 && box.left >= card.left && box.right <= card.right + 1;
        }));
        assert.ok(layout, `Card details overflow at ${width}px in ${theme} theme`);
      }
    }
    if (role === 'denied') {
      await page.evaluate(() => window.AdminRBAC.open());
      assert.equal(requests.length, 0, 'Denied users must not load admin interfaces');
    }
    if (['root','delegated'].includes(role)) {
      await page.click('#more-entry');
      await page.waitForSelector('#admin-btn:not([hidden])');
      await page.click('#admin-btn');
      if (role === 'root') {
        await page.waitForFunction(() => document.querySelector('.admin-rbac-toast')?.textContent.includes('Не удалось загрузить панель'));
        assert.equal(requests.length, 1);
        await page.click('#admin-btn');
      }
      await page.waitForSelector('.admin-v2, .admin-page:not(.admin-loading)');
      const expected = role === 'root' ? 2 : 1;
      assert.equal(requests.length, expected);
      assert.equal(await page.locator('#admin-btn').getAttribute('aria-busy'), null, 'Admin entry must stop showing a loading state');
      await page.evaluate(() => window.goToMainMenu());
      await page.click('#more-entry');
      await page.click('#admin-btn');
      await page.waitForSelector('.admin-v2, .admin-page:not(.admin-loading)');
      assert.equal(requests.length, expected, 'Reopening admin must reuse the loaded bundle');
    }
    assert.deepEqual(errors, [], `${role}: uncaught browser errors`);
    console.log(`Startup browser scenario passed: ${role}`);
    await context.close();
  }
  console.log('Startup browser checks passed: 13 cards, mobile themes, guest/denied/root/delegated entry, retry and reuse.');
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
