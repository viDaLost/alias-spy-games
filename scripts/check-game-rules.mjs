// Проверяет справочник правил и наглядные разборы механик.
//
// Три вещи, которые ломаются молча:
//
//   * справочник начинает врать. Цены бустеров и награды за уровень написаны в
//     нём словами, а живут в коде игр. Разошлись — игрок платит не столько,
//     сколько прочитал, и перестаёт верить всему разделу;
//   * разбор показывает то, чего в игре нет. Поле сцены пишется руками, и
//     «совпадение» из трёх разных фишек выглядит на экране правдоподобно;
//   * игра выпадает из справочника. Новая игра появляется в меню, а раздела для
//     неё нет — и человек снова остаётся без правил.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';

const root = process.cwd();

// --- числа берутся из кода игр, а не переписываются сюда ----------------------
const bmt = fs.readFileSync(path.join(root, 'web/games/biblical-match-three.js'), 'utf8');
const wow = fs.readFileSync(path.join(root, 'web/games/bible-wow.js'), 'utf8');
const wordsearch = fs.readFileSync(path.join(root, 'web/games/bible-wordsearch.js'), 'utf8');
const sacred = fs.readFileSync(path.join(root, 'web/games/sacred-word.js'), 'utf8');
const rules = fs.readFileSync(path.join(root, 'web/js/game-rules.js'), 'utf8');

const problems = [];
const need = (condition, message) => { if (!condition) problems.push(message); };

const boosterCost = (source, id) => {
  const match = source.match(new RegExp(`${id}:\\s*\\{[^}]*?cost:\\s*(\\d+)`));
  return match ? Number(match[1]) : null;
};

for (const id of ['manna', 'lampOil', 'covenant', 'sling', 'staff', 'jericho', 'rainbow']) {
  const cost = boosterCost(bmt, id);
  need(cost !== null, `не нашлась цена бустера ${id} в коде игры`);
  if (cost === null) continue;
  need(rules.includes(`— ${cost}★`), `в справочнике нет цены ${cost}★ бустера ${id}`);
}

const constant = (source, name) => {
  const match = source.match(new RegExp(`${name}\\s*=\\s*(\\d+)`));
  return match ? Number(match[1]) : null;
};

const wowLevel = Number(wow.match(/st\.coins \+= (\d+);\s*\n\s*showMsg\("Уровень пройден!/)?.[1] || 0);
const wowBonus = Number(wow.match(/st\.coins \+= (\d+);\s*\n\s*showMsg\("Бонус!/)?.[1] || 0);
const wowLetter = Number(wow.match(/st\.coins -= (\d+);\s*\n\s*st\.hintedCells\.add/)?.[1] || 0);
// Цена «открыть слово целиком» ищется внутри своей функции: порог «не хватает
// звёзд» с тем же текстом есть и у подсказки на букву.
const wowWord = Number(wow.match(/function revealWordPaid\(\)[\s\S]*?st\.coins < (\d+)/)?.[1] || 0);
need(wowLevel === 10 && wowBonus === 2 && wowLetter === 6 && wowWord === 20,
  `награды «Библейских слов» в коде изменились: уровень ${wowLevel}, бонус ${wowBonus}, буква ${wowLetter}, слово ${wowWord}`);
need(rules.includes(`<b>+${wowLevel}★</b>`), `в справочнике нет награды +${wowLevel}★ за уровень «Библейских слов»`);
need(rules.includes(`<b>−${wowLetter}★</b>`), `в справочнике нет цены −${wowLetter}★ за букву`);
need(rules.includes(`<b>−${wowWord}★</b>`), `в справочнике нет цены −${wowWord}★ за слово`);

const wsWord = constant(wordsearch, 'STAR_PER_WORD');
const wsLevel = constant(wordsearch, 'STAR_PER_LEVEL');
const wsHint = constant(wordsearch, 'HINT_COST');
need(rules.includes(`<b>+${wsWord}★</b>`), `в справочнике нет награды +${wsWord}★ за слово в «Поиске слов»`);
need(rules.includes(`<b>+${wsLevel}★</b>`), `в справочнике нет награды +${wsLevel}★ за уровень «Поиска слов»`);
need(rules.includes(`<b>−${wsHint}★</b>`), `в справочнике нет цены −${wsHint}★ за подсказку`);

const maxErrors = constant(sacred, 'MAX_ERRORS');
need(rules.includes(`<b>${maxErrors} ошибок</b>`), `в справочнике не сказано про ${maxErrors} ошибок в «Священном слове»`);

// Особые фишки: пороги совпадений живут в движке.
const core = fs.readFileSync(path.join(root, 'web/games/biblical-match-three-core.js'), 'utf8');
need(/indices\.length >= 5.*rainbow/.test(core), 'в движке изменился порог радужной фишки');
need(/indices\.length === 4/.test(core), 'в движке изменился порог линейной фишки');
need(rules.includes('5 и больше в ряд') && rules.includes('4 в ряд'), 'справочник разошёлся с порогами особых фишек');

// Множитель каскада.
const cascade = bmt.match(/\(1 \+ Math\.max\(0, cascade - 1\) \* ([\d.]+)\)/)?.[1];
need(cascade === '0.55', `множитель каскада в игре стал ${cascade}, а в справочнике написано ×1,55`);
const perTile = bmt.match(/clearSet\.size \* (\d+)/)?.[1];
need(rules.includes(`<b>${perTile} за фишку</b>`), `в справочнике не ${perTile} очков за фишку`);

if (problems.length) {
  console.error(`Справочник разошёлся с кодом игр:\n  ${problems.join('\n  ')}`);
  process.exit(1);
}

// --- браузерная часть ----------------------------------------------------------
const mime = new Map([
  ['.html', 'text/html; charset=utf-8'], ['.js', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'], ['.json', 'application/json; charset=utf-8'],
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
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await context.newPage();
const crashes = [];
page.on('pageerror', (error) => crashes.push(String(error?.message || error)));

const fail = async (message) => {
  console.error(`Проверка правил не прошла: ${message}`);
  await browser.close();
  server.close();
  process.exit(1);
};

await page.addInitScript(() => {
  window.Telegram = {
    WebApp: {
      initData: '', initDataUnsafe: { user: { id: 1288379477, first_name: 'Тест' } },
      ready() {}, expand() {}, colorScheme: 'light', onEvent() {}, offEvent() {},
      MainButton: { show() {}, hide() {} }, BackButton: { show() {}, hide() {}, onClick() {} },
      HapticFeedback: { impactOccurred() {}, notificationOccurred() {} },
    },
  };
  try { localStorage.setItem('leaderboard_news_seen_v1', '1'); } catch { /* приватный режим */ }
});
const stub = (route) => route.fulfill({
  status: 200, contentType: 'application/json',
  body: JSON.stringify({ success: true, isBanned: false, lastGames: [], users: [] }),
});
// На GitHub telegram.org доступен, и настоящий SDK затирает поставленную
// здесь личность: прогресс начинает читаться под чужим ключом, и проверка
// падает только в CI. Отдаём вместо него ту же заглушку.
const telegramSdkStub = (route) => route.fulfill({
  status: 200, contentType: 'text/javascript; charset=utf-8',
  body: `window.Telegram=window.Telegram||{WebApp:{initData:"user=%7B%22id%22%3A1288379477%7D&hash=qa",initDataUnsafe:{user:{id:1288379477,first_name:"Тест"}},ready(){},expand(){},colorScheme:"light",onEvent(){},offEvent(){},MainButton:{show(){},hide(){}},BackButton:{show(){},hide(){},onClick(){}},HapticFeedback:{impactOccurred(){},notificationOccurred(){}}}};`,
});
await page.route('https://telegram.org/**', telegramSdkStub);
for (const pattern of ['https://script.google.com/**', 'https://script.googleusercontent.com/**', 'https://*.workers.dev/**']) {
  await page.route(pattern, stub);
}

await page.goto(baseURL, { waitUntil: 'commit', timeout: 30_000 });
await page.waitForSelector('#menu-container:not(.hidden)', { timeout: 25_000 });
await page.waitForTimeout(2500);

// 1. вход из меню
if (!(await page.locator('#game-rules-btn').count())) await fail('в меню нет пункта «Правила игр»');

// Иконка из набора, а не рисованная заглушка: битый путь молча оставит пустое место.
const menuIcon = await page.evaluate(() => {
  const img = document.querySelector('#game-rules-btn img');
  return img ? { src: img.getAttribute('src') || '', width: img.naturalWidth } : null;
});
if (!menuIcon) await fail('у пункта «Правила игр» нет картинки-иконки');
if (!menuIcon.src.startsWith('web/assets/icons/rules.webp')) {
  await fail(`иконка правил берётся не из набора: ${menuIcon.src}`);
}
if (!menuIcon.width) await fail('иконка правил не загрузилась');
await page.evaluate(() => document.getElementById('game-rules-btn').click());
await page.waitForSelector('.rules-shell', { timeout: 10_000 });

// 2. каждая игра меню описана в справочнике
const coverage = await page.evaluate(() => {
  const described = new Set([...document.querySelectorAll('[data-rules-game]')].map((node) => node.dataset.rulesGame));
  const menu = [...document.querySelectorAll('.menu-grid .game-card')]
    .map((card) => card.id.replace(/-card$/, ''))
    .filter((id) => id && !['support-btn', 'admin-btn', 'leaderboard-btn', 'game-rules-btn', 'android-download-btn'].includes(id));
  return { described: [...described], menu };
});
// Карточки игр строятся без id, поэтому список сверяется с известным набором.
const expected = ['alias', 'coimaginarium', 'guess', 'describe', 'spy', 'quartet',
  'bible-wow', 'bible-wordsearch', 'sacred-word', 'kids-ark-pairs', 'biblical-match-three'];
const missing = expected.filter((key) => !coverage.described.includes(key));
if (missing.length) await fail(`в справочнике нет разделов: ${missing.join(', ')}`);

// 3. сцены разборов честные
const audit = await page.evaluate(() => window.GameRulesDemos?.audit?.() || ['модуль разборов не загрузился']);
if (audit.length) await fail(`разборы механик расходятся с правилами игры:\n  ${audit.join('\n  ')}`);

// 4. одиночные игры получают разбор, онлайн — нет
const SOLO = ['biblical-match-three', 'bible-wow', 'bible-wordsearch', 'sacred-word', 'kids-ark-pairs'];
const ONLINE = ['alias', 'coimaginarium', 'guess', 'describe', 'spy', 'quartet'];
const demos = await page.evaluate(() => Object.fromEntries(
  [...document.querySelectorAll('[data-rules-game]')].map((node) => [
    node.dataset.rulesGame, node.querySelectorAll('.rd-stage').length,
  ]),
));
for (const key of SOLO) if (!demos[key]) await fail(`у одиночной игры «${key}» нет наглядного разбора`);
for (const key of ONLINE) if (demos[key]) await fail(`у игры за столом «${key}» стоит разбор экрана, хотя правила там про людей`);

// 5. разбор действительно движется
await page.evaluate(() => document.querySelector('.rd-stage')?.scrollIntoView({ block: 'center' }));
await page.waitForTimeout(700);
const first = await page.evaluate(() => document.querySelector('.rd-stage .rd-board')?.innerHTML || '');
await page.waitForTimeout(2200);
const second = await page.evaluate(() => document.querySelector('.rd-stage .rd-board')?.innerHTML || '');
if (!first) await fail('разбор не отрисовался');
if (first === second) await fail('разбор не проигрывается — кадры не меняются');

// 6. правила при первом входе в игру, повторно — только по кнопке
//
// Обучение, показанное один раз и навсегда исчезнувшее, — исходная жалоба из
// поддержки. Поэтому проверяется и то, что правила приходят сами, и то, что
// второй раз они не мешают, и то, что вернуть их можно.
await page.evaluate(() => document.querySelector('[data-rules-back]')?.click());
await page.waitForSelector('#menu-container:not(.hidden)', { timeout: 10_000 });
await page.evaluate(() => {
  try { localStorage.removeItem('game_rules_seen_v1'); } catch { /* приватный режим */ }
});

await page.evaluate(() => window.showGame('bible-wow'));
await page.waitForTimeout(4000);
if (!(await page.locator('#game-rules-sheet').count())) {
  await fail('при первом входе в игру правила не показались');
}
if (await page.evaluate(() => document.body.dataset.currentGame) !== 'bible-wow') {
  await fail('показ правил выкинул человека из игры');
}
const sheet = await page.evaluate(() => ({
  text: document.querySelector('.rules-sheet__body')?.innerText || '',
  demos: document.querySelectorAll('#game-rules-sheet .rd-stage').length,
  reset: document.querySelectorAll('#game-rules-sheet [data-sheet-reset]').length,
  all: document.querySelectorAll('#game-rules-sheet [data-sheet-all]').length,
}));
if (!/главном меню/i.test(sheet.text) || !/Правила игр/.test(sheet.text)) {
  await fail('в правилах нет напоминания, где их найти снова');
}
if (!sheet.demos) await fail('в правилах при входе в игру нет наглядного разбора');
if (!sheet.reset) await fail('в правилах «Библейских слов» нет кнопки сброса прогресса');
if (!sheet.all) await fail('из правил игры не попасть в общий справочник');

await page.evaluate(() => document.querySelector('#game-rules-sheet [data-sheet-close]').click());
await page.waitForTimeout(600);
if (await page.locator('#game-rules-sheet').count()) await fail('правила не закрываются');

await page.evaluate(() => (window.appGoToMainMenu || window.goToMainMenu)?.());
await page.waitForTimeout(800);
await page.evaluate(() => window.showGame('bible-wow'));
await page.waitForTimeout(3000);
if (await page.locator('#game-rules-sheet').count()) {
  await fail('правила показались второй раз — они должны приходить сами только при первом входе');
}
await page.evaluate(() => document.getElementById('game-rules-help').click());
await page.waitForTimeout(700);
if (!(await page.locator('#game-rules-sheet').count())) await fail('кнопка «?» не открывает правила');
if (await page.evaluate(() => document.body.dataset.currentGame) !== 'bible-wow') {
  await fail('кнопка «?» выкинула человека из игры вместо показа правил поверх неё');
}

// У игр за столом сбрасывать нечего, и кнопка была бы обещанием без покрытия.
await page.evaluate(() => document.querySelector('#game-rules-sheet [data-sheet-close]').click());
await page.evaluate(() => (window.appGoToMainMenu || window.goToMainMenu)?.());
await page.waitForTimeout(800);
await page.evaluate(() => window.showGame('spy'));
await page.waitForTimeout(4000);
if (!(await page.locator('#game-rules-sheet').count())) await fail('в игре за столом правила при входе не показались');
if (await page.locator('#game-rules-sheet [data-sheet-reset]').count()) {
  await fail('в игре за столом предлагается сброс прогресса, которого у неё нет');
}
await page.evaluate(() => document.querySelector('#game-rules-sheet [data-sheet-close]').click());
await page.evaluate(() => (window.appGoToMainMenu || window.goToMainMenu)?.());
await page.waitForTimeout(600);
await page.evaluate(() => document.getElementById('game-rules-btn').click());
await page.waitForSelector('.rules-shell', { timeout: 10_000 });

// 7. таблицы не растягивают страницу
const spills = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
if (spills) await fail('справочник растягивает страницу вбок');

if (crashes.length) await fail(`страница поймала исключение: ${crashes[0]}`);

console.log('Справочник в порядке: цены бустеров и награды совпадают с кодом игр, '
  + 'каждая игра меню описана, разборы механик показывают настоящие совпадения и проигрываются, '
  + 'у игр за столом разбора экрана нет, правила приходят сами при первом входе и возвращаются по кнопке «?» '
  + 'поверх игры, напоминают, где их найти, и дают сбросить прогресс там, где он есть.');

await browser.close();
server.close();
