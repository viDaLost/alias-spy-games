// Проверяет раздел «Ещё».
//
// Системных пунктов набралось восемь, и в главном меню они занимали больше
// места, чем сами игры. Теперь за ними отдельный экран. Что ломается молча:
//
//   * в меню возвращаются служебные карточки, и человек, открывший приложение
//     поиграть, снова видит список кнопок вместо игр;
//   * какой-нибудь пункт теряется по дороге и становится недостижим;
//   * карточки исчезают навсегда. Их контейнер переезжает на экран целиком, и
//     стоит нарисовать этот экран внутри #game-container, как открытая из него
//     админка перепишет контейнер вместе с карточками;
//   * карточка перестаёт работать после переезда: обработчики вешают восемь
//     разных модулей, и подмена узла копией их потеряет.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';

const root = process.cwd();
const ADMIN_ID = '1288379477';

const mime = new Map([
  ['.html', 'text/html; charset=utf-8'], ['.js', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'], ['.json', 'application/json; charset=utf-8'],
  ['.webmanifest', 'application/manifest+json; charset=utf-8'],
  ['.png', 'image/png'], ['.jpg', 'image/jpeg'], ['.webp', 'image/webp'],
  ['.svg', 'image/svg+xml'], ['.woff2', 'font/woff2'],
]);
const server = http.createServer((request, response) => {
  const pathname = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname);
  const target = path.resolve(root, `.${pathname === '/' ? '/index.html' : pathname}`);
  if (!target.startsWith(root + path.sep) || !fs.existsSync(target) || !fs.statSync(target).isFile()) {
    response.writeHead(404).end('Not found');
    return;
  }
  response.writeHead(200, { 'Content-Type': mime.get(path.extname(target)) || 'application/octet-stream' });
  response.end(fs.readFileSync(target));
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const baseURL = `http://127.0.0.1:${server.address().port}`;

const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROME_BIN || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const page = await context.newPage();
const crashes = [];
page.on('pageerror', (error) => crashes.push(String(error?.message || error)));

const fail = async (message) => {
  console.error(`Проверка раздела «Ещё» не прошла: ${message}`);
  await browser.close();
  server.close();
  process.exit(1);
};

await page.addInitScript((id) => {
  window.Telegram = {
    WebApp: {
      initData: `query_id=stub&user=%7B%22id%22%3A${id}%7D&hash=stub`,
      initDataUnsafe: { user: { id: Number(id), first_name: 'Виталий' } },
      ready() {}, expand() {}, colorScheme: 'light', onEvent() {}, offEvent() {},
      MainButton: { show() {}, hide() {} }, BackButton: { show() {}, hide() {}, onClick() {} },
      HapticFeedback: { impactOccurred() {}, notificationOccurred() {} },
    },
  };
  try { localStorage.setItem('leaderboard_news_seen_v1', '1'); } catch { /* приватный режим */ }
}, ADMIN_ID);

await page.route('https://*.workers.dev/**', (route) => {
  const body = JSON.parse(route.request().postData() || '{}');
  const action = String(body?.payload?.action || '');
  if (action === 'adminRoleStatus') {
    return route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ success: true, isAdmin: true, isRoot: true, userId: ADMIN_ID }),
    });
  }
  return route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ success: true, isBanned: false, lastGames: [], users: [], answered: true }),
  });
});
await page.route('https://script.google*.com/**', (route) => route.fulfill({
  status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, isBanned: false, lastGames: [] }),
}));

await page.goto(`${baseURL}/#tgWebAppData=query_id%3Dstub`, { waitUntil: 'commit', timeout: 30_000 });
await page.waitForSelector('#menu-container:not(.hidden)', { timeout: 25_000 });
await page.waitForTimeout(3500);

// 1. в меню — только игры и одна дверь
const menu = await page.evaluate(() => {
  const visible = (node) => {
    const box = node.getBoundingClientRect();
    return box.width > 0 && box.height > 0;
  };
  return {
    systemVisible: (() => {
      const host = document.getElementById('system-actions');
      return host ? visible(host) : 'нет узла';
    })(),
    entry: Boolean(document.getElementById('more-entry')),
    entryIcon: (() => {
      const img = document.querySelector('#more-entry img');
      return img ? { src: img.getAttribute('src') || '', loaded: img.naturalWidth > 0 } : null;
    })(),
    strayCards: [...document.querySelectorAll('#menu-container .game-card')]
      .filter((card) => visible(card) && card.id !== 'more-entry')
      .filter((card) => !card.closest('#company-games, #word-games, #kids-games'))
      .map((card) => card.querySelector('.game-card__title')?.textContent || card.id),
    games: document.querySelectorAll('#company-games .game-card, #word-games .game-card, #kids-games .game-card').length,
  };
});
if (menu.systemVisible !== false) await fail(`служебные карточки всё ещё видны в главном меню (${menu.systemVisible})`);
if (!menu.entry) await fail('в меню нет двери в раздел «Ещё»');
if (!menu.entryIcon) await fail('у двери в раздел нет картинки-иконки');
if (!menu.entryIcon.src.startsWith('web/assets/icons/more.webp')) {
  await fail(`иконка двери берётся не из набора: ${menu.entryIcon.src}`);
}
if (!menu.entryIcon.loaded) await fail('иконка двери не загрузилась');
if (menu.strayCards.length) await fail(`в меню остались служебные карточки: ${menu.strayCards.join(', ')}`);
if (menu.games < 10) await fail(`в меню собралось всего ${menu.games} карточек игр`);

// 2. в разделе — все пункты
await page.evaluate(() => document.getElementById('more-entry').click());
await page.waitForSelector('#more-screen', { timeout: 10_000 });
await page.waitForTimeout(600);
const titles = await page.evaluate(() => [...document.querySelectorAll('#more-screen .game-card')]
  .map((card) => card.querySelector('.game-card__title')?.textContent?.trim() || card.id));
const expected = ['Тех-поддержка', 'Профиль', 'Правила игр', 'Рейтинг', 'Админ-панель'];
const missing = expected.filter((title) => !titles.includes(title));
if (missing.length) await fail(`в разделе «Ещё» нет пунктов: ${missing.join(', ')} (есть: ${titles.join(', ')})`);

// 3. пункт работает после переезда — обработчики вешают чужие модули
await page.evaluate(() => [...document.querySelectorAll('#more-screen .game-card')]
  .find((card) => card.querySelector('.game-card__title')?.textContent?.includes('Тех-поддержка'))?.click());
await page.waitForTimeout(900);
if (!(await page.locator('#support-modal-overlay').count())) {
  await fail('пункт поддержки перестал работать после переезда в раздел');
}
await page.evaluate(() => document.getElementById('support-modal-overlay')?.remove());

// 4. открытие админки не уносит карточки с собой
await page.evaluate(() => document.getElementById('admin-btn')?.click());
await page.waitForTimeout(2500);
const afterAdmin = await page.evaluate(() => ({
  mode: document.body.dataset.mode || '',
  layer: Boolean(document.getElementById('more-screen')),
  home: Boolean(document.getElementById('more-hidden-section')?.contains(document.getElementById('system-actions'))),
  cards: document.querySelectorAll('#system-actions .game-card').length,
}));
if (afterAdmin.mode !== 'admin') await fail(`из раздела не открылась админ-панель (режим «${afterAdmin.mode}»)`);
if (afterAdmin.layer) await fail('раздел «Ещё» остался поверх открытой админ-панели');
if (!afterAdmin.home) await fail('карточки не вернулись домой при переходе на другой экран');
if (afterAdmin.cards < 5) await fail(`после открытия админки в контейнере осталось ${afterAdmin.cards} карточек — их стёрли вместе с экраном`);

// 5. возврат в меню и повторный вход
await page.evaluate(() => (window.appGoToMainMenu || window.goToMainMenu)?.());
await page.waitForTimeout(900);
await page.evaluate(() => document.getElementById('more-entry').click());
await page.waitForSelector('#more-screen', { timeout: 10_000 });
await page.waitForTimeout(500);
const again = await page.evaluate(() => document.querySelectorAll('#more-screen .game-card').length);
if (again < 5) await fail(`при повторном входе в разделе оказалось ${again} карточек`);

await page.evaluate(() => document.querySelector('[data-more-back]').click());
await page.waitForTimeout(500);
const closed = await page.evaluate(() => ({
  layer: Boolean(document.getElementById('more-screen')),
  home: Boolean(document.getElementById('more-hidden-section')?.contains(document.getElementById('system-actions'))),
  menu: !document.getElementById('menu-container')?.classList.contains('hidden'),
}));
if (closed.layer) await fail('раздел не закрывается кнопкой назад');
if (!closed.home) await fail('после закрытия карточки не вернулись в свою секцию');
if (!closed.menu) await fail('после закрытия раздела не видно главного меню');

// 6. профиль виден и внутри Telegram
await page.evaluate(() => document.getElementById('more-entry').click());
await page.waitForSelector('#more-screen', { timeout: 10_000 });
await page.waitForTimeout(500);
const profile = await page.evaluate(() => {
  const card = document.getElementById('web-session-btn');
  if (!card) return null;
  return {
    title: card.querySelector('.game-card__title')?.textContent?.trim() || '',
    desc: card.querySelector('.game-card__desc')?.textContent?.trim() || '',
    icon: card.querySelector('img')?.getAttribute('src') || '',
    loaded: (card.querySelector('img')?.naturalWidth || 0) > 0,
  };
});
if (!profile) await fail('внутри Telegram нет карточки профиля');
if (!/Виталий/.test(profile.desc)) await fail(`карточка профиля не показывает, кто играет: «${profile.desc}»`);
if (!profile.icon.startsWith('web/assets/icons/profile.webp')) await fail(`иконка профиля берётся не из набора: ${profile.icon}`);
if (!profile.loaded) await fail('иконка профиля не загрузилась');

if (crashes.length) await fail(`страница поймала исключение: ${crashes[0]}`);

console.log('Раздел «Ещё» в порядке: в главном меню остались только игры и одна дверь, '
  + 'за ней все служебные пункты, они работают после переезда, '
  + 'открытие админки не стирает их вместе с экраном, а профиль виден и внутри Telegram.');

await browser.close();
server.close();
