// Приложение в браузере для съёмки: тот же index.html, что открывает Telegram,
// с заглушкой Telegram WebApp (обычный игрок, не админ) и ответами облачных
// функций профиля — как в scripts/smoke-all-games.mjs.
import fs from 'node:fs';
import path from 'node:path';

export const TELEGRAM_STUB = `window.Telegram={WebApp:{initData:'',initDataUnsafe:{user:{id:777000111,username:'player',first_name:'Илья'}},version:'8.0',platform:'ios',colorScheme:'light',themeParams:{},ready(){},expand(){},close(){},onEvent(){},offEvent(){},setHeaderColor(){},setBackgroundColor(){},enableClosingConfirmation(){},disableVerticalSwipes(){},openTelegramLink(){},openLink(){},requestFullscreen(){},lockOrientation(){},unlockOrientation(){},BackButton:{show(){},hide(){},onClick(){},offClick(){}},MainButton:{show(){},hide(){},setText(){},onClick(){},offClick(){}},HapticFeedback:{impactOccurred(){},notificationOccurred(){},selectionChanged(){}}}};`;

export async function openApp(browser, baseURL, { scale = 3, stars = 20, extraRoutes } = {}) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: scale, isMobile: true, hasTouch: true, locale: 'ru-RU' });
  // Игрок уже бывал в приложении: приглашения в канал и к боту закрыты,
  // правила игр прочитаны — иначе они встали бы поверх экранов.
  await context.addInitScript(() => {
    window.__APP_TELEMETRY_DISABLED__ = true;
    try {
      localStorage.setItem('bot_start_promo_seen_v1', '1');
      localStorage.setItem('channel_promo_seen_v1', '1');
      const games = ['bible-wow', 'quartet', 'biblical-match-three', 'moses-nile', 'twelve-tribes', 'promised-land', 'bible-sketch', 'guess', 'alias', 'coimaginarium', 'describe', 'spy', 'bible-wordsearch', 'sacred-word', 'kids-ark-pairs'];
      localStorage.setItem('game_rules_seen_v1', JSON.stringify(Object.fromEntries(games.map((g) => [g, Date.now()]))));
    } catch { /* нет хранилища */ }
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e?.message || e)));
  await page.route('https://telegram.org/js/telegram-web-app.js*', (r) => r.fulfill({ status: 200, contentType: 'text/javascript; charset=utf-8', body: TELEGRAM_STUB }));
  const gasReply = JSON.stringify({ success: true, isBanned: false, wowStars: stars, wsStars: 0, swLevel: 0, lastGames: [] });
  for (const pattern of ['https://script.google.com/**', 'https://script.googleusercontent.com/**']) {
    await page.route(pattern, (r) => r.fulfill({ status: 200, contentType: 'application/json; charset=utf-8', body: gasReply }));
  }
  if (extraRoutes) await extraRoutes(page, context);
  await page.goto(baseURL, { waitUntil: 'commit', timeout: 30_000 });
  await page.waitForSelector('#menu-container:not(.hidden)', { timeout: 20_000 });
  await page.waitForFunction(() => !document.documentElement.classList.contains('app-booting') && !document.documentElement.classList.contains('app-menu-preparing'), null, { timeout: 20_000 });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(1200);
  return { context, page, errors };
}

// Прямоугольник элемента в CSS-пикселях страницы (без прокрутки окна).
export const rectOf = (page, selector) => page.evaluate((sel) => {
  const el = typeof sel === 'string' ? document.querySelector(sel) : null;
  if (!el) return null;
  const b = el.getBoundingClientRect();
  return { x: b.left, y: b.top, w: b.width, h: b.height };
}, selector);

// Элемент отдельно, с прозрачным фоном и тенью: остальное на время съёмки прячется.
export async function sprite(page, selector, file, pad = 16) {
  await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    const b = el?.getBoundingClientRect();
    if (b && (b.top < 0 || b.bottom > innerHeight)) el.scrollIntoView({ block: 'center' });
  }, selector);
  const r = await rectOf(page, selector);
  if (!r) throw new Error(`нет элемента ${selector}`);
  await page.evaluate((sel) => {
    const style = document.createElement('style');
    style.id = 'ad-isolate';
    style.textContent = `html,body{background:transparent!important}html *{visibility:hidden!important}[data-ad-keep],[data-ad-keep] *{visibility:visible!important}`;
    document.head.appendChild(style);
    document.querySelector(sel).setAttribute('data-ad-keep', '');
  }, selector);
  const clip = { x: Math.max(0, r.x - pad), y: Math.max(0, r.y - pad), width: r.w + pad * 2, height: r.h + pad * 2 };
  await page.screenshot({ path: file, clip, omitBackground: true, animations: 'disabled' });
  await page.evaluate((sel) => { document.getElementById('ad-isolate')?.remove(); document.querySelector(sel)?.removeAttribute('data-ad-keep'); }, selector);
  return { ...r, pad };
}

export function saveJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 1));
}
