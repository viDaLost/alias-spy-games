import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';

const root = process.cwd();
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webp': 'image/webp', '.png': 'image/png' };
const server = http.createServer((req, res) => {
  const target = path.resolve(root, `.${new URL(req.url, 'http://local').pathname === '/' ? '/index.html' : new URL(req.url, 'http://local').pathname}`);
  if (!target.startsWith(`${root}/`) || !fs.existsSync(target) || !fs.statSync(target).isFile()) return res.writeHead(404).end();
  res.writeHead(200, { 'Content-Type': types[path.extname(target)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  fs.createReadStream(target).pipe(res);
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_BIN || chromium.executablePath(), args: ['--no-sandbox', '--disable-dev-shm-usage'] });
let allowed = false;
let fail = false;
let id = '555555555';
let isRoot = false;
const exceptions = new Set();
const authErrors = [];
async function contextFor({ android = false, web = false, telegram = true } = {}) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await context.addInitScript(({ id, android, web, telegram }) => {
    window.__APP_TELEMETRY_DISABLED__ = true;
    localStorage.setItem(`sacred_word_levels_v4_${id}`, JSON.stringify({ level: 7 }));
    const token = `bgs_${'s'.repeat(64)}`;
    if (android) window.AndroidApp = { getTelegramId: () => id, getSessionToken: () => token, isAndroidApp: () => true, getAppVersion: () => '3.0.8-standalone' };
    if (web) localStorage.setItem('web_session_v1', JSON.stringify({ userId: id, token, expiresAt: Date.now() + 600000 }));
    if (telegram) window.Telegram = { WebApp: { initData: `auth_date=1&user=${encodeURIComponent(JSON.stringify({ id: Number(id) }))}&hash=qa`, initDataUnsafe: { user: { id: Number(id), first_name: 'QA' } }, ready() {}, expand() {}, onEvent() {}, offEvent() {}, setHeaderColor() {}, setBackgroundColor() {}, enableClosingConfirmation() {}, disableVerticalSwipes() {}, HapticFeedback: { impactOccurred() {}, selectionChanged() {}, notificationOccurred() {} } } };
  }, { id, android, web, telegram });
  await context.route('https://telegram.org/**', (route) => route.fulfill({ body: '', contentType: 'text/javascript' }));
  await context.route('https://*.workers.dev/**', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === '/app/access') {
      if (android || web) {
        if (route.request().headers().authorization !== `Bearer bgs_${'s'.repeat(64)}`) authErrors.push('verified session bearer missing');
        if (route.request().postDataJSON()?.telegramInitData) authErrors.push('native marker sent as signed Telegram proof');
      }
      if (fail) return route.abort();
      return route.fulfill({ json: { success: true, allowed, restricted: true, isRoot, userId: allowed ? id : '' } });
    }
    const body = route.request().postDataJSON?.() || {};
    const action = body?.payload?.action;
    let data = { success: true, ok: true };
    if (action === 'adminRoleStatus') data = { ...data, isAdmin: isRoot, isRoot, userId: id };
    if (action === 'getAdminData') data = { ...data, users: [], adminAccess: { isAdmin: isRoot, isRoot, userId: id }, admins: [] };
    if (action === 'syncUser') data = { ...data, isBanned: false, swLevel: 7, wowStars: 42 };
    if (action === 'referralStatus') data.answered = true;
    if (action?.startsWith('appAccess')) {
      if (action === 'appAccessGrant') exceptions.add(body.payload.targetId);
      if (action === 'appAccessRevoke') exceptions.delete(body.payload.targetId);
      data.users = [...exceptions].map((userId) => ({ userId }));
    }
    if (url.pathname === '/admin/verify') data = { ...data, admin: isRoot, isAdmin: isRoot, isRoot, userId: id, id };
    return route.fulfill({ json: data });
  });
  return context;
}

try {
  for (const config of [{}, { android: true, telegram: false }, { web: true, telegram: false }, { telegram: false }]) {
    allowed = false;
    const context = await contextFor(config);
    const page = await context.newPage();
    await page.goto(base);
    await page.waitForFunction(() => window.AppAccess && !window.AppAccess.state().checking);
    await assert.doesNotReject(() => page.locator('#app-access-title').waitFor({ state: 'visible' }));
    assert.equal(await page.evaluate(() => { window.showGame('sacred-word'); return document.body.dataset.mode || ''; }), '');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('sacred_word_levels_v4_555555555')).level), 7);
    if (config.web) {
      await page.getByRole('button', { name: 'Войти в профиль', exact: true }).click();
      await page.locator('#ws-login-id').waitFor({ state: 'visible' });
      assert.equal(await page.locator('[data-ws-skip]').isVisible(), false, 'guest login must not bypass restriction');
      await page.evaluate(() => document.querySelector('#web-session-overlay')?.remove());
    }
    if (config.android || config.web) {
      allowed = true;
      await page.evaluate(() => window.AppAccess.verify());
      assert.equal(await page.evaluate(() => window.AppAccess.allowed()), true, 'approved session must unlock Android/iOS');
    }
    if (!config.android && !config.web && config.telegram !== false) {
      await page.screenshot({ path: '/tmp/bible-app-lock-mobile.png', fullPage: true });
      allowed = true;
      await page.getByRole('button', { name: 'Проверить доступ', exact: true }).click();
      await page.waitForFunction(() => window.AppAccess.allowed());
      fail = true;
      await page.evaluate(() => window.AppAccess.verify());
      assert.equal(await page.evaluate(() => window.AppAccess.allowed()), false, 'offline check must fail closed');
      fail = false;
    }
    await context.close();
  }
  id = '1288379477'; isRoot = true; allowed = true;
  const context = await contextFor();
  const page = await context.newPage();
  await page.goto(base);
  await page.waitForFunction(() => window.AppAccess?.allowed() && window.AdminRBAC?.state?.isRoot);
  assert.equal(await page.locator('#app-access-screen').isVisible(), false);
  await page.evaluate(() => window.AdminRBAC.open());
  await page.locator('#app-access-manager').waitFor({ state: 'visible' });
  await page.locator('#app-access-id').fill('555555555');
  await page.getByRole('button', { name: 'Открыть доступ', exact: true }).click();
  await page.getByRole('button', { name: 'Закрыть доступ', exact: true }).waitFor();
  assert(exceptions.has('555555555'));
  await page.getByRole('button', { name: 'Закрыть доступ', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('#app-access-manager [data-access-admin-status]')?.textContent.includes('снова закрыт'));
  assert.equal(exceptions.size, 0);
  await context.close();
  assert.deepEqual(authErrors, [], 'Android and iOS must use their verified session, never the native launch marker');
  console.log('PASS: mobile lock, Telegram/Android/iOS/guest denial, no guest bypass, unchanged local progress, retry/unlock, offline denial, root entry and working grant/revoke controls.');
} finally { await browser.close(); await new Promise((resolve) => server.close(resolve)); }
