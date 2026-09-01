// Проверяет рейтинг игроков: добровольное участие, подсчёт очков и таблицу.
//
// Три вещи, которые ломаются молча и дорого:
//
//   * участие перестаёт быть добровольным. Игрок не должен попадать в общий
//     список, пока сам не нажал «Опубликовать», — а увидеть свои очки должен
//     до того, как решит;
//   * очки начинает считать клиент. Формула живёт на сервере, приложение шлёт
//     только снимок пройденного; иначе счёт себе подставит кто угодно;
//   * снимок собирается неверно. Прогресс каждой игры лежит в своём ключе и в
//     своём формате, и ошибка здесь тихо обнулит чужие достижения.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';

const root = process.cwd();
const ADMIN_ID = '1288379477';

// --- формула сервера: считается тем же кодом, что уедет в воркер --------------
const worker = fs.readFileSync(path.join(root, 'cloudflare/app-core-worker/src/index-v16.js'), 'utf8');
const scoreSnapshot = new Function(`
  ${worker.match(/const GAMES = \{[\s\S]*?\n\};/)[0]}
  ${worker.match(/const POINTS_PER_LEVEL = [\s\S]*?const POINTS_PER_SACRED_LEVEL = \d+;/)[0]}
  ${worker.match(/export function scoreSnapshot\(snapshot\) \{[\s\S]*?\n\}/)[0].replace('export ', '')}
  return scoreSnapshot;
`)();

// --- рейтинг доступен обеим дорогам входа --------------------------------------
//
// В Telegram приложение приходит на /compat с подписью initData. Android-версия
// и веб-версия, установленная на главный экран, — на /android/compat с токеном
// подтверждённой сессии: подписи у них нет. Пока рейтинг слушал только первую
// дорогу, за пределами Telegram его просто не было.
{
  assert.ok(worker.includes("'/android/compat'"),
    'рейтинг не обслуживает /android/compat — в Android-приложении и веб-версии его не будет');
  assert.ok(/function handleRatingSession/.test(worker), 'нет обработчика рейтинга для подтверждённой сессии');
  const session = worker.slice(worker.indexOf('async function handleRatingSession'), worker.indexOf('async function ratingDispatch'));
  assert.ok(/Authorization/.test(session), 'личность сессии берётся не из заголовка авторизации');
  assert.ok(/android-auth\/session/.test(session), 'токен сессии не проверяется у хранилища');
  // Тело запроса не должно решать, чей это рейтинг.
  const claimsIdentity = /const userId = cleanUserId\(\s*body[^)]*\)/.test(session);
  assert.ok(!claimsIdentity, 'личность берётся из тела запроса — так можно попросить чужой рейтинг');
  assert.ok(/Запрос не соответствует сессии/.test(session), 'id из тела не сверяется с сессией');
}

{
  const full = scoreSnapshot({
    bmt: { completed: 50, stars: 150 },
    ws: { completed: 90 },
    wow: { completed: 150 },
    sacred: { level: 40 },
  });
  assert.equal(full.points, 50 * 10 + 100 * 5 + 90 * 10 + 150 * 10 + 40 * 2, 'потолок очков посчитан неверно');

  const cheat = scoreSnapshot({ bmt: { completed: 9999, stars: 99999 }, ws: { completed: 5000 } });
  assert.ok(cheat.points < 3000, 'снимок с невозможным прогрессом не обрезается по потолку игры');

  const partial = scoreSnapshot({ bmt: { completed: 10, stars: 20 }, sacred: { level: 5 } });
  assert.equal(partial.points, 10 * 10 + 10 * 5 + 5 * 2, 'частичный прогресс посчитан неверно');
  assert.equal(partial.breakdown.bmt.levels, 10, 'разбор по играм потерял уровни');
  assert.equal(scoreSnapshot({}).points, 0, 'пустой снимок должен давать ноль');
}

// --- сервер для страницы -------------------------------------------------------
const mime = new Map([
  ['.html', 'text/html; charset=utf-8'], ['.js', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'], ['.json', 'application/json; charset=utf-8'],
  ['.png', 'image/png'], ['.jpg', 'image/jpeg'], ['.webp', 'image/webp'],
  ['.svg', 'image/svg+xml'], ['.woff2', 'font/woff2'],
]);
const server = http.createServer((req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname);
  const target = path.resolve(root, `.${pathname === '/' ? '/index.html' : pathname}`);
  if (!target.startsWith(root + path.sep) || !fs.existsSync(target) || !fs.statSync(target).isFile()) {
    res.writeHead(404).end('Not found');
    return;
  }
  res.writeHead(200, {
    'Content-Type': mime.get(path.extname(target).toLowerCase()) || 'application/octet-stream',
    'Cache-Control': 'no-store',
  });
  fs.createReadStream(target).pipe(res);
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const baseURL = `http://127.0.0.1:${server.address().port}`;

const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROME_BIN || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
await context.addInitScript(({ id }) => {
  window.__APP_TELEMETRY_DISABLED__ = true;
  // Прогресс каждой игры лежит в своём ключе и в своём формате.
  localStorage.setItem(`biblical_match_three_progress_v2_${id}`, JSON.stringify({ levelRatings: { 1: 3, 2: 2, 3: 3, 4: 1 } }));
  localStorage.setItem('bibleWowCompleted', JSON.stringify([1, 2, 3, 4, 5, 5]));
  localStorage.setItem(`bible_wordsearch_progress_v2_${id}`, JSON.stringify({ completed: { 0: true, 1: true, 2: false } }));
  localStorage.setItem(`sacred_word_levels_v4_${id}`, JSON.stringify({ level: 7 }));
}, { id: ADMIN_ID });

const page = await context.newPage();
const crashes = [];
page.on('pageerror', (error) => crashes.push(String(error?.message || error)));

const fail = async (message) => {
  await browser.close();
  server.close();
  console.error(`Leaderboard check failed: ${message}`);
  process.exit(1);
};

// Состояние «сервера» рейтинга живёт здесь: проверяется в том числе то, что
// клиент не публикует игрока сам по себе.
const store = { published: false, name: '', points: 0, breakdown: {}, adminEdits: [] };

await page.route('https://telegram.org/**', (route) => route.fulfill({
  status: 200, contentType: 'text/javascript; charset=utf-8',
  body: `window.Telegram={WebApp:{initData:"user=%7B%22id%22%3A${ADMIN_ID}%7D&hash=qa",initDataUnsafe:{user:{id:${ADMIN_ID},username:"root",first_name:"Root"}},ready(){},expand(){},setHeaderColor(){},setBackgroundColor(){},enableClosingConfirmation(){},openTelegramLink(){},disableVerticalSwipes(){},HapticFeedback:{impactOccurred(){},notificationOccurred(){},selectionChanged(){}}}};`,
}));

const answer = (route, value) => route.fulfill({
  status: 200, contentType: 'application/json; charset=utf-8', body: JSON.stringify(value),
});

const handle = (route) => {
  const raw = route.request().postData() || '';
  let payload = {};
  try { const parsed = JSON.parse(raw); payload = parsed?.payload || parsed || {}; } catch {}
  const action = String(payload.action || '');

  if (action === 'ratingSync') {
    const scored = scoreSnapshot(payload.snapshot);
    store.points = Math.max(store.points, scored.points);
    store.breakdown = scored.breakdown;
    return answer(route, {
      success: true,
      player: { name: store.name, published: store.published, points: store.points, breakdown: scored.breakdown },
      breakdown: scored.breakdown,
    });
  }
  if (action === 'ratingJoin') {
    store.published = true;
    store.name = String(payload.name || '');
    return answer(route, { success: true, player: { name: store.name, published: true, points: store.points } });
  }
  if (action === 'ratingLeave') {
    store.published = false;
    return answer(route, { success: true, player: { name: store.name, published: false, points: store.points } });
  }
  if (action === 'ratingTop') {
    const top = [
      { place: 1, name: 'Мария', points: 2400, isMe: false },
      { place: 2, name: 'Пётр', points: 1800, isMe: false },
      { place: 3, name: 'Иоанн', points: 900, isMe: false },
    ];
    if (store.published) top.push({ place: 4, name: store.name, points: store.points, isMe: true });
    return answer(route, {
      success: true,
      top,
      totalPublished: top.length,
      me: { name: store.name, published: store.published, points: store.points, place: store.published ? 4 : 0 },
    });
  }
  if (action === 'getAdminData') {
    return answer(route, { success: true, users: [
      { id: '520011223', username: 'maria', wowStars: 12, wsStars: 3, swLevel: 4, isBanned: false, lastGames: [] },
      { id: '733044556', username: 'petr', wowStars: 8, wsStars: 1, swLevel: 2, isBanned: false, lastGames: [] },
    ] });
  }
  if (action === 'ratingAdminList') {
    return answer(route, { success: true, players: [
      { userId: '520011223', name: 'Мария', published: true, points: 2400, adminPoints: 0, total: 2400 },
      { userId: '733044556', name: 'Пётр', published: false, points: 1800, adminPoints: 0, total: 1800 },
    ] });
  }
  if (action === 'ratingAdminUpdate') {
    store.adminEdits.push({ targetId: payload.targetId, name: payload.name, total: payload.total, published: payload.published });
    return answer(route, { success: true, player: { name: payload.name || '', published: true, points: 0 } });
  }
  if (action === 'adminRoleStatus') {
    return answer(route, { success: true, isAdmin: true, isRoot: true, userId: ADMIN_ID });
  }
  return answer(route, { success: true, isBanned: false, lastGames: [] });
};

for (const pattern of ['https://script.google.com/**', 'https://script.googleusercontent.com/**', 'https://*.workers.dev/**']) {
  await page.route(pattern, handle);
}

await page.goto(baseURL, { waitUntil: 'commit', timeout: 30_000 });
await page.waitForSelector('#menu-container:not(.hidden)', { timeout: 25_000 });
await page.waitForTimeout(2500);

// --- 1. пункт меню --------------------------------------------------------------
if (!(await page.locator('#leaderboard-btn').count())) await fail('в меню нет пункта «Рейтинг»');

// Иконка набора, а не текстовая заглушка: битый путь молча оставит пустое место.
const cardIcon = await page.evaluate(() => {
  const img = document.querySelector('#leaderboard-btn img');
  if (!img) return null;
  return { src: img.getAttribute('src') || '', width: img.naturalWidth, height: img.naturalHeight };
});
if (!cardIcon) await fail('у пункта «Рейтинг» нет картинки-иконки');
if (!cardIcon.src.startsWith('web/assets/icons/rating.webp')) {
  await fail(`иконка рейтинга берётся не из набора: ${cardIcon.src}`);
}
if (!cardIcon.width || !cardIcon.height) await fail('иконка рейтинга не загрузилась');

// --- 1.5. одноразовое уведомление о новом разделе ---------------------------------
const news = await page.evaluate(() => {
  const node = document.getElementById('leaderboard-news');
  if (!node) return null;
  return {
    text: node.innerText || '',
    first: document.getElementById('menu-container')?.firstElementChild?.id === 'leaderboard-news',
    icon: node.querySelector('img')?.getAttribute('src') || '',
    open: Boolean(node.querySelector('[data-lb-news-open]')),
  };
});
if (!news) await fail('в главном меню нет уведомления о новом разделе «Рейтинг»');
if (!/рейтинг/i.test(news.text)) await fail('уведомление не говорит, что появился рейтинг игроков');
if (!news.first) await fail('уведомление показывается не первым в меню');
if (!news.icon.startsWith('web/assets/icons/rating.webp')) await fail('в уведомлении не та иконка');
if (!news.open) await fail('из уведомления нельзя открыть рейтинг');

await page.evaluate(() => document.querySelector('#leaderboard-news [data-lb-news-close]').click());
await page.waitForTimeout(900);
if (await page.locator('#leaderboard-news').count()) await fail('уведомление не закрывается');

await page.reload({ waitUntil: 'commit', timeout: 30_000 });
await page.waitForSelector('#menu-container:not(.hidden)', { timeout: 25_000 });
await page.waitForTimeout(2000);
if (await page.locator('#leaderboard-news').count()) {
  await fail('уведомление показалось второй раз — оно должно быть одноразовым');
}
if (!(await page.locator('#leaderboard-btn').count())) await fail('после перезагрузки пропал пункт «Рейтинг»');

// --- 2. первое открытие: знакомство, а не список ---------------------------------
await page.evaluate(() => document.getElementById('leaderboard-btn').click());
await page.waitForSelector('.lb-intro', { timeout: 15_000 });
const intro = await page.evaluate(() => ({
  text: document.querySelector('.lb-intro')?.innerText || '',
  hasName: Boolean(document.getElementById('lb-name-input')),
  suggested: document.getElementById('lb-name-input')?.value || '',
  board: document.querySelectorAll('.lb-board').length,
}));
if (!/добровольн/i.test(intro.text)) await fail('на первом экране не сказано, что участие добровольное');
if (!/увидят все игроки/i.test(intro.text)) await fail('не предупреждаем, что имя и очки увидят все');
if (!intro.hasName) await fail('нет поля для имени в рейтинге');
if (!intro.suggested) await fail('поле имени пустое — нечего предложить игроку');
if (intro.board) await fail('до согласия показывается общая таблица');

// --- 3. очки досчитались до конца -------------------------------------------------
await page.waitForTimeout(2200);
const scored = await page.evaluate(() => ({
  total: document.querySelector('[data-lb-total]')?.textContent || '',
  rows: [...document.querySelectorAll('[data-lb-row]')].map((row) => ({
    game: row.dataset.lbRow,
    levels: row.querySelector('[data-lb-levels]')?.textContent || '',
    points: row.querySelector('[data-lb-points]')?.textContent || '',
    live: row.classList.contains('is-live'),
  })),
}));

// 4 уровня и 9 звёзд в «Сокровищах», 5 уровней слов, 2 уровня поиска, 7 уровень «Слова».
const expected = scoreSnapshot({
  bmt: { completed: 4, stars: 9 }, ws: { completed: 2 }, wow: { completed: 5 }, sacred: { level: 7 },
});
if (Number(scored.total.replace(/\D/g, '')) !== expected.points) {
  await fail(`анимация подсчёта остановилась на «${scored.total}» вместо ${expected.points}`);
}
if (!scored.rows.every((row) => row.live)) await fail('не все строки разбора по играм показались');
const bmtRow = scored.rows.find((row) => row.game === 'bmt');
if (bmtRow?.levels !== '4') await fail(`снимок «Сокровищ» собран неверно: ${bmtRow?.levels} уровней вместо 4`);
const wowRow = scored.rows.find((row) => row.game === 'wow');
if (wowRow?.levels !== '5') await fail(`повтор в списке пройденных уровней посчитан дважды: ${wowRow?.levels}`);

// --- 4. пока не согласился — в списке его нет --------------------------------------
if (store.published) await fail('игрок опубликован до нажатия кнопки');

// --- 5. публикация ------------------------------------------------------------------
await page.evaluate(() => {
  document.getElementById('lb-name-input').value = 'Странник';
  document.querySelector('[data-lb-join]').click();
});
await page.waitForSelector('.lb-board', { timeout: 10_000 });
await page.waitForTimeout(600);
if (!store.published) await fail('после нажатия «Опубликовать» игрок не попал в рейтинг');
if (store.name !== 'Странник') await fail(`имя ушло на сервер как «${store.name}» вместо выбранного`);

const board = await page.evaluate(() => ({
  rows: document.querySelectorAll('.lb-row').length,
  podium: document.querySelectorAll('.lb-row.is-place-1').length,
  me: document.querySelector('.lb-row.is-me')?.innerText || '',
  mine: document.querySelector('.lb-mine')?.innerText || '',
  ids: document.body.innerText.includes('1288379477'),
}));
if (board.rows < 4) await fail(`в таблице ${board.rows} строк вместо четырёх`);
if (!board.podium) await fail('первое место не выделено');
if (!/Странник/.test(board.me)) await fail('своей строки в таблице нет');
if (!/Странник/.test(board.mine)) await fail('нет отдельной строки «вы» над таблицей');
if (board.ids) await fail('Telegram ID игрока виден на экране рейтинга');

// --- 6. выход из рейтинга -------------------------------------------------------------
page.on('dialog', (dialog) => dialog.accept());
await page.evaluate(() => document.querySelector('[data-lb-leave]')?.click());
await page.waitForTimeout(1200);
if (store.published) await fail('кнопка «Убрать из рейтинга» не убирает игрока');

// --- 7. правка рейтинга администратором ------------------------------------------------
await page.evaluate(() => (window.appGoToMainMenu || window.goToMainMenu)?.());
await page.waitForTimeout(600);
await page.evaluate(() => (window.openAdminPanelV2 || window.openAdminPanel)?.());
// Панель показывает только выбранный раздел, поэтому сначала вкладка.
await page.waitForSelector('#admin-rating-panel', { state: 'attached', timeout: 15_000 });
const tab = await page.evaluate(() => {
  const button = document.querySelector('[data-admin-v3-target="rating"]');
  button?.click();
  return Boolean(button);
});
if (!tab) await fail('в панели управления нет вкладки «Рейтинг»');
await page.waitForSelector('#admin-rating-panel', { timeout: 10_000 });
await page.waitForTimeout(900);

const adminRows = await page.evaluate(() => document.querySelectorAll('.admin-rating-row').length);
if (adminRows < 2) await fail(`в разделе рейтинга админки ${adminRows} строк вместо двух`);

await page.evaluate(() => {
  const row = document.querySelector('.admin-rating-row');
  row.querySelector('[data-rating-name]').value = 'Мария И.';
  row.querySelector('[data-rating-points]').value = '2500';
  row.querySelector('[data-rating-save]').click();
});
await page.waitForTimeout(900);
const edit = store.adminEdits.at(-1);
if (!edit) await fail('правка рейтинга не ушла на сервер');
if (edit.name !== 'Мария И.' || Number(edit.total) !== 2500) {
  await fail(`админ отправил не то, что ввёл: ${JSON.stringify(edit)}`);
}

await page.evaluate(() => document.querySelectorAll('.admin-rating-row')[1].querySelector('[data-rating-toggle]').click());
await page.waitForTimeout(700);
const toggled = store.adminEdits.at(-1);
if (toggled?.published !== true) await fail('кнопка показа скрытого игрока не работает');

if (crashes.length) await fail(`страница поймала исключение: ${crashes[0]}`);

console.log('Рейтинг в порядке: очки считает сервер, снимок прогресса собирается верно, '
  + 'до согласия игрока нет в списке, публикация идёт под выбранным именем, '
  + 'Telegram ID не показывается, выйти из рейтинга можно в одно нажатие, '
  + 'администратор правит имена и очки из своей вкладки, '
  + 'в меню стоит иконка набора, а уведомление о новом разделе показывается один раз.');

await browser.close();
server.close();
