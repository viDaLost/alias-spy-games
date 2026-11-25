import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';

const root = process.cwd();
const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webp': 'image/webp', '.png': 'image/png' };
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
let banned = false;
let id = '555555555';
let isRoot = false;
let isDelegate = false;
let restricted = true;
let accountStars = 999953;
let accountRevision = 1;
const exceptions = new Set();
const authErrors = [];
async function contextFor({ android = false, web = false, telegram = true, social = false } = {}) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await context.addInitScript(({ id, android, web, telegram, social }) => {
    window.__APP_TELEMETRY_DISABLED__ = !social;
    localStorage.setItem(`sacred_word_levels_v4_${id}`, JSON.stringify({ level: 7 }));
    const token = `bgs_${'s'.repeat(64)}`;
    if (android) window.AndroidApp = { getTelegramId: () => id, getSessionToken: () => token, isAndroidApp: () => true, getAppVersion: () => '3.0.8-standalone' };
    if (web) localStorage.setItem('web_session_v1', JSON.stringify({ userId: id, token, expiresAt: Date.now() + 600000 }));
    if (telegram) window.Telegram = { WebApp: { initData: `auth_date=1&user=${encodeURIComponent(JSON.stringify({ id: Number(id) }))}&hash=qa`, initDataUnsafe: { user: { id: Number(id), first_name: 'QA' } }, ready() {}, expand() {}, onEvent() {}, offEvent() {}, setHeaderColor() {}, setBackgroundColor() {}, enableClosingConfirmation() {}, disableVerticalSwipes() {}, HapticFeedback: { impactOccurred() {}, selectionChanged() {}, notificationOccurred() {} } } };
  }, { id, android, web, telegram, social });
  await context.route('https://telegram.org/**', (route) => route.fulfill({ body: '', contentType: 'text/javascript' }));
  await context.route('https://*.workers.dev/**', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === '/app/access') {
      if (android || web) {
        if (route.request().headers().authorization !== `Bearer bgs_${'s'.repeat(64)}`) authErrors.push('verified session bearer missing');
        if (route.request().postDataJSON()?.telegramInitData) authErrors.push('native marker sent as signed Telegram proof');
      }
      if (fail) return route.abort();
      const appRestricted = restricted && !allowed && !banned;
      return route.fulfill({ json: { success: true, allowed: !appRestricted && !banned, restricted, appRestricted, isBanned: appRestricted || banned, isRoot, userId: id } });
    }
    if (url.pathname === '/bible-world/access') return route.fulfill({ status: !banned && (allowed || !restricted) ? 204 : 403 });
    if (url.pathname === '/bible-world/panorama') {
      assert.ok(!banned && (allowed || !restricted));
      assert.match(route.request().postDataJSON().scene, /-4k\.webp$/);
      return route.fulfill({ path: 'web/assets/icons/unified-v1/bible-world.webp', contentType: 'image/webp' });
    }
    const body = route.request().postDataJSON?.() || {};
    const action = body?.payload?.action;
    let data = { success: true, ok: true };
    if (action === 'adminRoleStatus') data = { ...data, isAdmin: isRoot || isDelegate, isRoot, userId: id };
    if (action === 'getAdminData') data = { ...data, users: [], adminAccess: { isAdmin: isRoot, isRoot, userId: id }, admins: [] };
    if (action === 'syncUser') data = { ...data, isBanned: banned, swLevel: 7, wowStars: 42 };
    if (action === 'syncGameWallet') data = { ...data, bmtStars: accountStars, revision: accountRevision };
    if (action === 'mutateBmtStars') {
      accountStars += body.payload.delta;
      accountRevision += 1;
      data = { ...data, bmtStars: accountStars, revision: accountRevision };
    }
    if (action === 'profileBootstrap') data = { ...data, user: { id }, profile: { favorites: ['quartet'], gameStats: {} }, friends: [] };
    if (action === 'profileSetFavorites') data.favorites = body.payload.favorites;
    if (action === 'referralStatus') data.answered = true;
    if (action?.startsWith('appAccess')) {
      if (action === 'appAccessGrant') exceptions.add(body.payload.targetId);
      if (action === 'appAccessRevoke') exceptions.delete(body.payload.targetId);
      if (action === 'appAccessRestore' && isRoot) restricted = false;
      data.restricted = restricted;
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
    await page.waitForFunction(() => window.AppAccess?.state().checked);
    await page.locator('#main-catalog').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#catalog-games [data-launch="bible-azbuka"]').count(), 1);
    assert.equal(await page.locator('#catalog-games [data-launch="bible-world"]').count(), 1);
    assert.equal(await page.locator('#app-access-screen').count(), 0);
    assert.equal(await page.evaluate(() => window.AppAccess.allowed()), true);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('sacred_word_levels_v4_555555555')).level), 7);
    if (config.telegram !== false) {
      await page.locator('#catalog-games [data-launch="bible-azbuka"]').click();
      await page.locator('#game-container #create').waitFor();
      await page.evaluate(() => window.goToMainMenu());
      await page.evaluate(() => window.showGame('sacred-word'));
      await page.waitForFunction(() => document.body.dataset.currentGame === 'sacred-word');
      fail = true;
      try {
        await page.evaluate(async () => {
          document.dispatchEvent(new Event('visibilitychange'));
          await window.AppAccess.verify();
        });
        assert.equal(await page.evaluate(() => window.AppAccess.allowed()), true);
        assert.equal(await page.evaluate(() => document.body.dataset.currentGame), 'sacred-word');
        assert.equal(await page.locator('#app-access-screen').count(), 0);
      } finally { fail = false; }
    }
    if (config.telegram === false && !config.android && !config.web) {
      allowed = true;
      await page.locator('#catalog-games [data-launch="bible-world"]').click();
      await page.frameLocator('iframe[title="Где я в Библии?"]').locator('#levelMenu').waitFor();
    }
    await context.close();
  }
  banned = true;
  const bannedContext = await contextFor();
  const bannedPage = await bannedContext.newPage();
  await bannedPage.goto(base);
  await bannedPage.locator('#banned-screen').waitFor({ state: 'visible' });
  assert.equal(await bannedPage.evaluate(() => window.AppAccess.allowed()), false);
  assert.equal(await bannedPage.locator('#app-access-screen').count(), 0);
  await bannedContext.close();
  banned = false;

  id = '1288379477'; isRoot = true; allowed = true;
  const context = await contextFor();
  const page = await context.newPage();
  await page.goto(base);
  await page.waitForFunction(() => window.AppAccess?.allowed() && window.AdminRBAC?.state?.isRoot);
  assert.equal(await page.locator('#app-access-screen').isVisible(), false);
  await page.evaluate(() => {
    // Sabbath behavior is covered independently by the integration suite.
    const sabbath = window.SabbathAccess;
    window.SabbathAccess = { ...sabbath, authorize: () => true };
    window.showGame('moses-nile');
    window.SabbathAccess = sabbath;
  });
  const ownerNile = page.locator('#game-container iframe[src*="moses-nile-v7"]');
  await ownerNile.waitFor();
  await ownerNile.contentFrame().locator('html.standalone-access-allowed').waitFor({ state: 'attached' });
  await page.evaluate(() => window.goToMainMenu());
  await page.evaluate(() => window.AdminRBAC.open());
  await page.locator('#app-access-manager').waitFor({ state: 'visible' });
  await page.locator('#app-access-id').fill('555555555');
  await page.getByRole('button', { name: 'Открыть доступ', exact: true }).click();
  await page.getByRole('button', { name: 'Закрыть доступ', exact: true }).waitFor();
  assert(exceptions.has('555555555'));
  await page.getByRole('button', { name: 'Закрыть доступ', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('#app-access-manager [data-access-admin-status]')?.textContent.includes('снова закрыт'));
  assert.equal(exceptions.size, 0);
  await page.getByRole('button', { name: 'Снять блокировку', exact: true }).click();
  await page.getByText('Обычный режим восстановлен.', { exact: true }).waitFor();
  assert.equal(restricted, false);
  assert.equal(await page.getByRole('button', { name: 'Снять блокировку', exact: true }).isVisible(), false);
  restricted = true;
  await context.close();

  const favoriteContext = await contextFor({ social: true });
  const favoritePage = await favoriteContext.newPage();
  await favoritePage.goto(`${base}/?tgWebAppStartParam=game_quartet`);
  await favoritePage.waitForFunction(() => document.body.dataset.currentGame === 'quartet');
  await favoritePage.locator('#qv2-root.qt-root').waitFor();
  await favoritePage.goto(`${base}/#tgWebAppStartParam=favorites`);
  await favoritePage.locator('.social-sheet-overlay.is-open .social-favorites-grid').waitFor();
  await favoritePage.locator('.social-favorites-grid').getByRole('button', { name: /Библейская география/ }).click();
  await favoritePage.getByText('Добавлено в избранное', { exact: true }).waitFor();
  await favoritePage.goto(`${base}/?tgWebAppStartParam=game_bible-geography`);
  await favoritePage.waitForFunction(() => document.body.dataset.currentGame === 'bible-geography');
  await favoriteContext.close();

  id = '666666666'; isRoot = false; isDelegate = true; allowed = true;
  const delegatedContext = await contextFor({ social: true });
  const delegatedPage = await delegatedContext.newPage();
  await delegatedPage.goto(base);
  await delegatedPage.waitForFunction(() => window.AppAccess?.state().checked);
  await delegatedPage.evaluate(() => {
    const sabbath = window.SabbathAccess;
    window.SabbathAccess = { ...sabbath, status: () => ({ mandatory: false }) };
    window.showGame('moses-nile');
    window.SabbathAccess = sabbath;
  });
  await delegatedPage.locator('#moses-maintenance[open]').waitFor();
  assert.equal(await delegatedPage.locator('#game-container iframe').count(), 0);
  const frameAccess = delegatedPage.waitForResponse((response) => (
    new URL(response.url()).pathname === '/app/access'
    && response.request().frame().url().includes('/moses-nile-v7/')
  ));
  await delegatedPage.evaluate(() => {
    const frame = document.createElement('iframe');
    frame.id = 'nile-direct-test';
    frame.src = 'web/games/moses-nile-v7/index.html';
    document.getElementById('game-container').append(frame);
  });
  assert.equal((await (await frameAccess).json()).isRoot, false);
  const delegatedNile = delegatedPage.frameLocator('#nile-direct-test');
  assert.equal(await delegatedNile.locator('script[src*="game-v75.js"]').count(), 0);
  assert.equal(await delegatedNile.locator('html.standalone-access-allowed').count(), 0);
  await delegatedPage.goto(`${base}/?tgWebAppStartParam=game_quartet`);
  await delegatedPage.waitForFunction(() => document.body.dataset.currentGame === 'quartet');
  await delegatedPage.goto(`${base}/?tgWebAppStartParam=favorites`);
  await delegatedPage.locator('.social-sheet-overlay.is-open .social-favorites-grid').waitFor();
  assert.equal(await delegatedPage.locator('[data-toggle-favorite="bible-world"]').count(), 1);
  assert.equal(await delegatedPage.locator('[data-toggle-favorite="bible-azbuka"]').count(), 1);
  await delegatedPage.goto(`${base}/?tgWebAppStartParam=game_bible-world`);
  await delegatedPage.frameLocator('iframe[title="Где я в Библии?"]').locator('#levelMenu').waitFor();
  await delegatedContext.close();
  isDelegate = false;

  id = '1288379477'; isRoot = true;
  const catalogContext = await contextFor({ social: true });
  const catalog = await catalogContext.newPage();
  await catalog.goto(`${base}/`);
  await catalog.locator('#main-catalog').waitFor();
  await catalog.locator('#menu-container > .menu-section').first().waitFor({ state: 'hidden' });
  await catalog.locator('.catalog-tools #app-language').waitFor();
  const hero = catalog.locator('#catalog-feature');
  const currentPromo = await hero.getAttribute('data-active-promo');
  await catalog.waitForFunction((key) => document.querySelector('#catalog-feature')?.dataset.activePromo !== key, currentPromo, { timeout: 5000 });
  await catalog.waitForFunction(() => document.querySelector('[data-game-wallet]')?.textContent === '999953');
  await catalog.waitForFunction(() => document.querySelectorAll('#catalog-games [data-launch]').length === 18);
  assert.equal(await catalog.locator('#catalog-games [data-launch*="bible-azbuka"]').count(), 1);
  const worldCard = catalog.locator('#catalog-games [data-launch="bible-world"]');
  assert.equal(await worldCard.count(), 1);
  assert.match(await worldCard.locator('img').getAttribute('src'), /bible-world\.webp$/);
  await catalog.evaluate(() => localStorage.setItem('bible-world-best-v5-hard', '49400'));
  await worldCard.click();
  const world = catalog.frameLocator('iframe[title="Где я в Библии?"]');
  await world.locator('#levelMenu').waitFor();
  assert.equal(await world.locator('#totalLocations').textContent(), '60 локаций');
  assert.equal(await world.locator('.level-card').count(), 3);
  assert.match(await world.locator('#level-hard').textContent(), /Рекорд за 10 локаций: 49\s400/);
  await world.locator('#level-hard').click();
  await world.locator('#locationDialog[open]').waitFor();
  assert.equal(await world.locator('.location-number').count(), 20);
  assert.equal(await world.locator('#startJourney').textContent(), 'Пройти все 20 локаций');
  await world.getByRole('button', { name: 'Локация 20', exact: true }).click();
  await world.locator('#openAnswers:enabled').waitFor();
  assert.equal(await world.locator('#roundNumber').textContent(), '20');
  await world.locator('#chooseLevel').click();
  await world.locator('#locationDialog[open]').waitFor();
  await world.locator('#startJourney').click();
  await world.locator('#openAnswers:enabled').waitFor();
  assert.equal(await world.locator('#roundNumber').textContent(), '1');
  await world.locator('#chooseLevel').click();
  await world.locator('#exitGame').click();
  await catalog.locator('#main-catalog').waitFor();

  const directWorld = await catalogContext.newPage();
  await directWorld.goto(`${base}/web/assets/bible-world-v2/index.html`);
  await directWorld.getByText('Открой игру из каталога «Библейских игр».', { exact: true }).waitFor();
  assert.equal(await directWorld.locator('#levelMenu').isVisible(), false);
  await directWorld.close();
  assert.equal((await catalog.locator('#main-catalog h1').textContent()).trim(), 'Библейские игры');
  assert.equal(await catalog.locator('#main-catalog').getByText('Во что сыграем?', { exact: true }).count(), 0);
  for (const width of [320, 375, 390, 667, 820]) {
    await catalog.setViewportSize({ width, height: 844 });
    const { title, wallet, digits, tools, viewportWidth, scrollWidth } = await catalog.evaluate(async () => {
      await document.fonts.ready;
      const bounds = (selector) => document.querySelector(selector)?.getBoundingClientRect().toJSON();
      return {
        title: bounds('.catalog-title span'),
        wallet: bounds('.catalog-top .catalog-wallet'),
        digits: bounds('.catalog-wallet [data-game-wallet]'),
        tools: bounds('.catalog-top .catalog-tools'),
        viewportWidth: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
      };
    });
    assert.ok(title?.width && wallet?.width && digits?.width && tools?.width, `catalog header is visible at ${width}px`);
    assert.ok(title.bottom < wallet.top, `title is above the wallet and controls at ${width}px`);
    assert.ok(wallet.top < tools.bottom && tools.top < wallet.bottom, `wallet and controls share a row at ${width}px`);
    assert.ok(digits.right <= wallet.right, `the whole balance fits at ${width}px`);
    assert.ok(wallet.right < tools.left && tools.right <= viewportWidth, `wallet and controls fit the viewport at ${width}px`);
    assert.equal(scrollWidth, viewportWidth, `no horizontal overflow at ${width}px`);
  }
  await catalog.setViewportSize({ width: 390, height: 844 });
  assert.equal(await catalog.locator('#catalog-library input, #catalog-favorites').count(), 0);
  assert.deepEqual(await catalog.locator('#catalog-filters button').allTextContents(), ['Все', 'Одиночные', 'Для компании']);
  await catalog.locator('#catalog-filters [data-filter="solo"]').click();
  assert.equal(await catalog.locator('#collection-company-games').count(), 0);
  assert.ok(await catalog.locator('#collection-word-games').isVisible());
  await catalog.locator('#catalog-filters [data-filter="company"]').click();
  assert.equal(await catalog.locator('#collection-word-games, #collection-kids-games').count(), 0);
  assert.ok(await catalog.locator('#collection-company-games').isVisible());
  await catalog.locator('#catalog-filters [data-filter="all"]').click();
  await catalog.locator('#catalog-games [data-favorite="bible-wow"]').click();
  await catalog.locator('#open-favorites').click();
  await catalog.locator('#favorites-dialog[open] [data-launch="bible-wow"]').waitFor();
  await catalog.locator('#favorites-dialog .catalog-dialog-close').click();
  await catalog.locator('#open-profile').click();
  await catalog.locator('.social-sheet-overlay.is-open .social-hero').waitFor();
  await catalog.evaluate(() => window.PlayerSocial.close());
  await catalog.locator('#catalog-account-actions [data-service="friends"]').click();
  await catalog.waitForFunction(() => document.querySelector('[data-social-tab="friends"]')?.getAttribute('aria-selected') === 'true');
  await catalog.evaluate(() => window.PlayerSocial.close());
  await catalog.locator('#open-more').click();
  await catalog.locator('#more-screen #admin-btn').waitFor();
  await catalog.locator('#more-screen [data-more-back]').click();
  await catalog.evaluate(() => {
    window.GameWallet.spend(6, 'test hint');
    document.body.dataset.currentGame = 'bible-wow';
    delete document.body.dataset.currentGame;
  });
  await catalog.waitForFunction(() => document.querySelector('[data-game-wallet]')?.textContent === '999947');
  await catalog.waitForFunction(() => !Object.keys(localStorage).some((key) => key.startsWith('game_wallet_op_v1_')));
  assert.equal(accountStars, 999947);
  isRoot = false;
  await catalog.evaluate(() => window.AppAccess.verify());
  const nileNotice = catalog.locator('#moses-maintenance[open]');
  const catalogURL = catalog.url();
  await catalog.locator('#catalog-games [data-launch="moses-nile"]').click();
  await nileNotice.getByRole('heading', { name: 'Игра на стадии доработки' }).waitFor();
  assert.match(await nileNotice.textContent(), /Ожидайте, в скором времени она будет доступна\./);
  assert.equal(catalog.url(), catalogURL, 'maintenance notice keeps the player in the catalog');
  assert.equal(await catalog.locator('#game-container iframe').count(), 0);
  await nileNotice.getByRole('button', { name: 'Понятно' }).click();
  await nileNotice.waitFor({ state: 'hidden' });
  await catalog.goto(`${base}/?game=moses-nile`);
  await nileNotice.waitFor();
  assert.equal(await catalog.locator('#game-container iframe').count(), 0);
  await nileNotice.getByRole('button', { name: 'Понятно' }).click();
  assert.equal(await catalog.locator('[data-launch="kingdoms"], [data-card-game="kingdoms"]').count(), 0);
  assert.equal(await catalog.evaluate(() => window.RoomInvite.acceptScanned('kd:ABCDE')), null);
  await catalog.goto(`${base}/?game=kingdoms&room=ABCDE`);
  await catalog.locator('#main-catalog').waitFor();
  assert.equal(await catalog.evaluate(() => document.body.dataset.currentGame || ''), '');
  await catalogContext.close();
  isRoot = true;

  const webCatalogContext = await contextFor({ web: true, telegram: false, social: true });
  const webCatalog = await webCatalogContext.newPage();
  await webCatalog.goto(`${base}/?menu=catalog`);
  await webCatalog.waitForFunction(() => document.querySelector('[data-game-wallet]')?.textContent === '999947');
  await webCatalog.locator('#open-profile').click();
  await webCatalog.locator('.social-sheet-overlay.is-open .social-hero').waitFor();
  await webCatalogContext.close();

  const slowContext = await contextFor();
  let finishProfileLoad;
  const profileLoad = new Promise((resolve) => { finishProfileLoad = resolve; });
  await slowContext.route('**/web/js/social-dock-v2.js*', async (route) => {
    await profileLoad;
    await route.continue();
  });
  const slow = await slowContext.newPage();
  await slow.goto(base);
  await slow.locator('#open-profile').tap();
  assert.equal(await slow.locator('#open-profile').getAttribute('aria-busy'), 'true');
  assert.equal(await slow.evaluate(() => Boolean(window.PlayerSocial)), false);
  finishProfileLoad();
  await slow.locator('.social-sheet-overlay.is-open .social-hero').waitFor();
  await slowContext.close();

  const linkedProfileContext = await contextFor();
  const linkedProfile = await linkedProfileContext.newPage();
  await linkedProfile.goto(`${base}/#tgWebAppStartParam=profile`);
  await linkedProfile.locator('.social-sheet-overlay.is-open .social-hero').waitFor();
  await linkedProfileContext.close();

  assert.deepEqual(authErrors, [], 'Android and iOS must use their verified session, never the native launch marker');
  console.log('PASS: app startup without the global lock screen on Telegram, Android, iOS and guest sessions, foreground recovery, individual bans and verified access controls.');
  console.log('PASS: favorite game links and the favorites editor open directly for both admin and regular accounts with access.');
} finally { await browser.close(); await new Promise((resolve) => server.close(resolve)); }
