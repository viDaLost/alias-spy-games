import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';

const root = process.cwd();
const mime = new Map([
  ['.html', 'text/html; charset=utf-8'], ['.js', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'], ['.json', 'application/json; charset=utf-8'],
  ['.png', 'image/png'], ['.jpg', 'image/jpg'], ['.jpeg', 'image/jpeg'], ['.webp', 'image/webp'],
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
  // Telemetry is intentionally disabled in CI. Product functionality such as
  // Profile/Favorites must remain enabled independently from that preference.
  window.__APP_TELEMETRY_DISABLED__ = true;
  window.AndroidApp = {
    getTelegramId() { return '555555555'; },
    getSessionToken() { return 'bgs_android_runtime_test_token'; },
    isAndroidApp() { return true; },
    getAppVersion() { return '3.0.6-standalone'; },
    logout() {},
  };
});

const page = await context.newPage();
page.setDefaultTimeout(8_000);
let stage = 'routing';
const hardStop = setTimeout(() => {
  console.error(`Android runtime regression exceeded 45s during: ${stage}`);
  try { server.closeAllConnections?.(); } catch {}
  process.exit(124);
}, 45_000);

let androidCalls = 0;
let telegramCompatCalls = 0;
const androidActions = [];

await page.route('https://telegram.org/js/telegram-web-app.js*', (route) => route.fulfill({
  status: 200,
  contentType: 'text/javascript; charset=utf-8',
  body: '/* standalone Android test: Telegram SDK intentionally absent */',
}));

await page.route('https://alias-spy-games-core.vitaledanilov.workers.dev/android/compat', async (route) => {
  androidCalls += 1;
  const request = route.request();
  const body = JSON.parse(request.postData() || '{}');
  if (String(body.androidUserId) !== '555555555') throw new Error(`Wrong Android ID: ${body.androidUserId}`);
  if (request.headers().authorization !== 'Bearer bgs_android_runtime_test_token') {
    throw new Error(`Missing Android bearer: ${request.headers().authorization || '(none)'}`);
  }

  const action = String(body.payload?.action || '');
  androidActions.push(action);
  // adminRoleStatus is the server-side role lookup the admin UI performs on boot.
  // The Android test user is not an administrator, so the worker answers "no role".
  if (!['syncUser', 'updateHistory', 'profileBootstrap', 'adminRoleStatus'].includes(action)) {
    throw new Error(`Unexpected Android action: ${action}`);
  }

  if (action === 'adminRoleStatus') {
    await route.fulfill({
      status: 200,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify({ success: true, role: { isAdmin: false, isRoot: false }, source: 'cloudflare-android' }),
    });
    return;
  }

  const response = action === 'profileBootstrap'
    ? {
        success: true,
        source: 'cloudflare-android',
        user: {
          id: '555555555',
          username: 'android_runtime_test',
          displayName: 'Android Runtime',
          wowStars: 20,
          wsStars: 7,
          swLevel: 3,
          bmtStars: 12,
        },
        profile: {
          gamesPlayed: 9,
          favorites: ['quartet', 'bible-sketch'],
          gameStats: { quartet: 4, 'bible-sketch': 3 },
        },
        friends: [],
      }
    : { success: true, isBanned: false, wowStars: 20, wsStars: 0, swLevel: 0, lastGames: [], source: 'cloudflare-android' };

  await route.fulfill({
    status: 200,
    contentType: 'application/json; charset=utf-8',
    body: JSON.stringify(response),
  });
});

await page.route('https://alias-spy-games-core.vitaledanilov.workers.dev/compat', async (route) => {
  telegramCompatCalls += 1;
  await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'APK must not use Telegram compat route' }) });
});

stage = 'app startup';
await page.goto(`${baseURL}/?android=1&apk=33&native=bundled-web`, { waitUntil: 'commit', timeout: 20_000 });
await page.waitForSelector('#menu-container:not(.hidden)', { timeout: 10_000 });
await page.waitForFunction(() => !document.documentElement.classList.contains('app-booting') && !document.documentElement.classList.contains('app-menu-preparing'), null, { timeout: 10_000 });
await page.waitForSelector('[data-social-open="profile"]', { timeout: 10_000 });

const state = await page.evaluate(() => ({
  android: window.__ANDROID_APK__ === true,
  id: String(window.__ANDROID_TELEGRAM_ID__ || ''),
  telegramId: String(window.Telegram?.WebApp?.initDataUnsafe?.user?.id || ''),
  adminVisible: Boolean(document.getElementById('admin-btn')),
  source: window.AppCoreBridge?.source || '',
  authenticated: window.AppCoreBridge?.status?.().androidAuthenticated === true,
  socialMounted: document.documentElement.classList.contains('social-dock-mounted'),
}));

if (!state.android) throw new Error('Android runtime marker was not enabled.');
if (state.id !== '555555555' || state.telegramId !== '555555555') throw new Error(`Android ID was not installed into runtime: ${JSON.stringify(state)}`);
if (state.adminVisible) throw new Error('Admin button must never be visible in standalone Android mode.');
if (state.source !== 'cloudflare') throw new Error(`Cloudflare bridge is missing: ${state.source}`);
if (!state.authenticated) throw new Error('Android Web bridge did not expose an authenticated session state.');
if (!state.socialMounted) throw new Error('Android social dock did not mount while telemetry was disabled.');

stage = 'profile rendering';
await page.locator('[data-social-open="profile"]').click();
await page.waitForSelector('.social-sheet-overlay.is-open .social-hero', { timeout: 8_000 });
await page.waitForFunction(() => document.querySelector('.social-sheet-overlay.is-open')?.textContent?.includes('Android Runtime'), null, { timeout: 8_000 });

const profileLayout = await page.evaluate(() => {
  const sheet = document.querySelector('.social-sheet-overlay.is-open .social-sheet');
  if (!sheet) return null;
  const rect = sheet.getBoundingClientRect();
  return {
    top: rect.top,
    bottom: rect.bottom,
    left: rect.left,
    right: rect.right,
    width: rect.width,
    height: rect.height,
    viewportWidth: innerWidth,
    viewportHeight: innerHeight,
  };
});
if (!profileLayout) throw new Error('Profile sheet was not rendered.');
if (profileLayout.width < 250 || profileLayout.height < 180) throw new Error(`Profile sheet is collapsed: ${JSON.stringify(profileLayout)}`);
if (profileLayout.top < -2 || profileLayout.left < -2 || profileLayout.bottom > profileLayout.viewportHeight + 2 || profileLayout.right > profileLayout.viewportWidth + 2) {
  throw new Error(`Profile sheet is outside Android viewport: ${JSON.stringify(profileLayout)}`);
}

stage = 'favorites rendering';
await page.locator('[data-social-close]').click();
await page.locator('[data-social-open="favorites"]').click();
await page.waitForSelector('.social-sheet-overlay.is-open .social-favorites-grid', { timeout: 8_000 });
const favoritesState = await page.evaluate(() => ({
  visible: Boolean(document.querySelector('.social-sheet-overlay.is-open .social-favorites-grid')),
  selected: document.querySelectorAll('.social-sheet-overlay.is-open .social-favorite.is-selected').length,
  text: String(document.querySelector('.social-sheet-overlay.is-open [data-social-content]')?.textContent || ''),
}));
if (!favoritesState.visible || favoritesState.selected !== 2 || !favoritesState.text.includes('Библейский художник')) {
  throw new Error(`Favorites did not render Android profile data: ${JSON.stringify(favoritesState)}`);
}
await page.locator('[data-social-close]').click();

// Regression for the Android-only "header over blank gradient" failure. Invoke
// the production game router directly so this check measures WebView rendering
// rather than Playwright's pointer-action bookkeeping. Physical menu clicking
// remains covered by the general all-games smoke suite.
stage = 'Bible Sketch foreground rendering';
await page.evaluate(() => localStorage.removeItem('bible_sketch_room_id_v1'));
await page.waitForSelector('#bible-sketch-card', { timeout: 8_000 });
await page.evaluate(() => { window.showGame?.('bible-sketch'); });
await page.waitForSelector('#bsk-root #bsk-content .bsk-home', { timeout: 8_000 });
await page.waitForFunction(() => {
  const content = document.getElementById('bsk-content');
  return Boolean(content?.textContent?.includes('Создать комнату') && content?.textContent?.includes('Войти по коду'));
}, null, { timeout: 8_000 });
await page.waitForTimeout(800);

const sketchLayout = await page.evaluate(() => {
  const container = document.getElementById('game-container');
  const root = document.getElementById('bsk-root');
  const content = document.getElementById('bsk-content');
  const hero = document.querySelector('#bsk-content .bsk-hero');
  const scene = document.querySelector('.home-gamehub-parallax__scene');
  if (!container || !root || !content || !hero) return null;

  const contentStyle = getComputedStyle(content);
  const containerStyle = getComputedStyle(container);
  const sceneStyle = scene ? getComputedStyle(scene) : null;
  const contentRect = content.getBoundingClientRect();
  const heroRect = hero.getBoundingClientRect();
  const sampleX = Math.max(1, Math.min(innerWidth - 2, heroRect.left + heroRect.width / 2));
  const sampleY = Math.max(1, Math.min(innerHeight - 2, heroRect.top + Math.min(heroRect.height / 2, 70)));
  const topElement = document.elementFromPoint(sampleX, sampleY);

  return {
    bodyGame: document.body?.dataset?.currentGame || '',
    contentText: String(content.textContent || ''),
    contentDisplay: contentStyle.display,
    contentVisibility: contentStyle.visibility,
    contentOpacity: Number.parseFloat(contentStyle.opacity || '1'),
    contentWidth: contentRect.width,
    contentHeight: contentRect.height,
    gameZ: Number.parseInt(containerStyle.zIndex || '0', 10) || 0,
    sceneHidden: scene ? scene.hidden : true,
    sceneDisplay: sceneStyle?.display || 'none',
    sceneVisibility: sceneStyle?.visibility || 'hidden',
    topInsideGame: Boolean(topElement && root.contains(topElement)),
    topClass: topElement?.className || '',
  };
});

if (!sketchLayout) throw new Error('Bible Sketch root/home did not render in Android runtime.');
if (sketchLayout.bodyGame !== 'bible-sketch') throw new Error(`Wrong active Android game: ${JSON.stringify(sketchLayout)}`);
if (sketchLayout.contentDisplay === 'none' || sketchLayout.contentVisibility === 'hidden' || sketchLayout.contentOpacity <= 0.01) {
  throw new Error(`Bible Sketch content is CSS-hidden: ${JSON.stringify(sketchLayout)}`);
}
if (sketchLayout.contentWidth < 250 || sketchLayout.contentHeight < 250) {
  throw new Error(`Bible Sketch content is collapsed behind the header: ${JSON.stringify(sketchLayout)}`);
}
if (!sketchLayout.contentText.includes('Создать комнату') || !sketchLayout.contentText.includes('Войти по коду')) {
  throw new Error(`Bible Sketch home controls are missing: ${JSON.stringify(sketchLayout)}`);
}
if (!sketchLayout.sceneHidden || sketchLayout.sceneDisplay !== 'none' || sketchLayout.sceneVisibility !== 'hidden') {
  throw new Error(`Menu parallax is still composited over Bible Sketch: ${JSON.stringify(sketchLayout)}`);
}
if (sketchLayout.gameZ < 100) throw new Error(`Bible Sketch game surface was not promoted above Android background: ${JSON.stringify(sketchLayout)}`);
if (!sketchLayout.topInsideGame) throw new Error(`A foreign/background layer is on top of Bible Sketch content: ${JSON.stringify(sketchLayout)}`);

if (androidCalls < 2) throw new Error(`Expected Android sync + profile calls, got ${androidCalls}.`);
if (!androidActions.includes('profileBootstrap')) throw new Error(`profileBootstrap was not routed through Android bearer API: ${androidActions.join(', ')}`);
if (telegramCompatCalls !== 0) throw new Error(`APK incorrectly called Telegram /compat ${telegramCompatCalls} time(s).`);

console.log(`OK: Android standalone rendered Profile/Favorites and Bible Sketch foreground UI above the disabled menu parallax (${androidActions.join(', ')}).`);
stage = 'cleanup';
await page.evaluate(() => {
  try { window.__bibleSketchCleanup?.(); } catch {}
  try { window.goToMainMenu?.(); } catch {}
});
await context.close();
await browser.close();
try { server.closeAllConnections?.(); } catch {}
await new Promise((resolve) => server.close(resolve));
clearTimeout(hardStop);
