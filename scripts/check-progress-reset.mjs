// Проверяет сброс прогресса и перераздачу слов после него.
//
// Что ломается молча:
//
//   * очки рейтинга не откатываются. Обычная синхронизация поднимает счёт и
//     никогда не опускает, поэтому сброс обязан идти отдельным действием. Если
//     оно потеряется, человек сбросит прогресс и останется с чужими очками;
//   * сброс не всё убирает. Ключей у каждой игры несколько, и забытый ключ
//     оставляет игру наполовину пройденной;
//   * перераздача даёт слово, которое из букв уровня не собирается. Игрок будет
//     искать его до победного, а собрать не сможет;
//   * перераздача ничего не меняет — тогда «начать заново» означает пройти то
//     же самое второй раз, о чём и просили в поддержке.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';

const root = process.cwd();
const ADMIN_ID = '1288379477';

// --- перераздача слов: считается тем же кодом, что уедет в браузер ---------------
{
  const source = fs.readFileSync(path.join(root, 'web/js/word-games-shuffle.js'), 'utf8');
  const store = new Map();
  const scope = {
    localStorage: {
      getItem: (key) => (store.has(key) ? store.get(key) : null),
      setItem: (key, value) => store.set(key, String(value)),
    },
  };
  const host = {};
  new Function('window', 'localStorage', source)(host, scope.localStorage);
  const shuffle = host.WordGameShuffle;

  const levels = JSON.parse(fs.readFileSync(path.join(root, 'web/data/bible_wow_levels.json'), 'utf8')).levels;
  assert.equal(shuffle.wow(levels), levels, 'без сброса уровни должны оставаться нетронутыми');

  shuffle.reshuffle('wow');
  const mixed = shuffle.wow(levels);
  assert.equal(mixed.length, levels.length, 'перераздача потеряла уровни');

  const counts = (word) => {
    const map = new Map();
    for (const char of word) map.set(char, (map.get(char) || 0) + 1);
    return map;
  };
  const fits = (word, pool) => {
    for (const [char, count] of counts(word)) if ((pool.get(char) || 0) < count) return false;
    return true;
  };

  let changed = 0;
  mixed.forEach((level, index) => {
    const pool = counts(String(level.letters).toUpperCase());
    for (const word of level.words) {
      assert.ok(fits(word, pool), `слово «${word}» не собирается из букв «${level.letters}»`);
      assert.ok(word.length >= 3, `слово «${word}» короче трёх букв`);
    }
    for (const word of level.bonus || []) {
      assert.ok(fits(word, pool), `бонусное слово «${word}» не собирается из букв «${level.letters}»`);
    }
    assert.equal(new Set(level.words).size, level.words.length, `уровень ${level.id}: слово повторяется дважды`);
    for (const word of level.bonus || []) {
      assert.ok(!level.words.includes(word), `уровень ${level.id}: слово «${word}» и основное, и бонусное`);
    }
    assert.ok(level.words.length >= 3, `уровень ${level.id} остался меньше чем с тремя словами`);
    assert.equal(level.letters, levels[index].letters, 'перераздача не должна менять буквы уровня');
    if (JSON.stringify([...level.words].sort()) !== JSON.stringify([...levels[index].words].sort())) changed += 1;
  });
  assert.ok(changed >= levels.length * 0.6,
    `перераздача изменила только ${changed} уровней из ${levels.length} — игрок пройдёт то же самое`);

  // Одно зерно — одна раздача, иначе прогресс перестанет сходиться между запусками.
  assert.equal(JSON.stringify(shuffle.wow(levels)), JSON.stringify(mixed), 'при одном зерне раздача должна повторяться');
  shuffle.reshuffle('wow');
  assert.notEqual(JSON.stringify(shuffle.wow(levels)), JSON.stringify(mixed), 'второй сброс обязан дать другую раздачу');

  // «Поиск слов»: порядок другой, набор уровней тот же.
  const ws = JSON.parse(fs.readFileSync(path.join(root, 'web/data/bible_wordsearch_levels.json'), 'utf8')).levels;
  assert.equal(shuffle.wordsearch(ws), ws, 'без сброса «Поиск слов» не трогается');
  shuffle.reshuffle('ws');
  const reordered = shuffle.wordsearch(ws);
  assert.equal(reordered.length, ws.length, 'перестановка потеряла уровни «Поиска слов»');
  assert.deepEqual(
    [...reordered].map((level) => level.wordsList.join()).sort(),
    [...ws].map((level) => level.wordsList.join()).sort(),
    'перестановка потеряла или подменила слова «Поиска слов»',
  );
  assert.deepEqual(reordered.map((level) => level.id), ws.map((level) => level.id),
    'номера уровней должны остаться по порядку, меняется только содержимое');
  const moved = reordered.filter((level, index) => level.theme !== ws[index].theme).length;
  assert.ok(moved >= ws.length * 0.5, `после сброса переехало только ${moved} уровней «Поиска слов»`);
}

// --- сервер откатывает очки, а не только поднимает --------------------------------
{
  const worker = fs.readFileSync(path.join(root, 'cloudflare/app-core-worker/src/index-v16.js'), 'utf8');
  assert.ok(/ratingReset\s*\(\{/.test(worker), 'в воркере нет ratingReset — очки нечем откатить');
  assert.ok(worker.includes("'ratingReset',"), 'ratingReset не объявлен публичным действием');
  assert.ok(worker.includes("ratingReset: '/rating/reset'"), 'ratingReset не привязан к маршруту хранилища');
  const reset = worker.slice(worker.indexOf('ratingReset({'), worker.indexOf('ratingJoin({'));
  assert.ok(!reset.includes('Math.max(previous'), 'ratingReset унаследовал защиту «очки только растут» и не сможет убавить счёт');
  assert.ok(reset.includes('scored.points'), 'ratingReset не пересчитывает очки по свежему снимку');
  assert.ok(!reset.includes('admin_points = '), 'ratingReset стирает надбавку администратора, а она выдана человеку, а не уровням');
}

// --- браузер ------------------------------------------------------------------------
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
  console.error(`Проверка сброса не прошла: ${message}`);
  await browser.close();
  server.close();
  process.exit(1);
};

const calls = [];
await page.addInitScript((id) => {
  window.Telegram = {
    WebApp: {
      initData: 'stub', initDataUnsafe: { user: { id: Number(id), first_name: 'Тест' } },
      ready() {}, expand() {}, colorScheme: 'light', onEvent() {}, offEvent() {},
      MainButton: { show() {}, hide() {} }, BackButton: { show() {}, hide() {}, onClick() {} },
      HapticFeedback: { impactOccurred() {}, notificationOccurred() {} },
    },
  };
  try {
    localStorage.setItem('leaderboard_news_seen_v1', '1');
    localStorage.setItem(`biblical_match_three_progress_v2_${id}`, JSON.stringify({
      version: 4, unlocked: 9, levelRatings: { 1: 3, 2: 2, 3: 3, 4: 1 },
    }));
    localStorage.setItem('bibleWowCompleted', JSON.stringify([1, 2, 3, 4, 5]));
    localStorage.setItem('bibleWowData_v5', JSON.stringify({ coins: 44, levelIndex: 5 }));
    localStorage.setItem('bibleWowBonusByLevel', JSON.stringify({ 1: ['РОД'] }));
    localStorage.setItem(`bible_wordsearch_progress_v2_${id}`, JSON.stringify({
      version: 5, currentLevel: 2, completed: { 0: true, 1: true }, state: {},
    }));
    localStorage.setItem(`sacred_word_levels_v4_${id}`, JSON.stringify({ level: 6, word: 'КОВЧЕГ' }));
    localStorage.setItem('kids_ark_pairs_records_v1', JSON.stringify({ easy: 42 }));
    localStorage.setItem(`biblical_match_three_stars_v1_${id}`, '77');
  } catch { /* приватный режим */ }
}, ADMIN_ID);

// На GitHub telegram.org доступен, и настоящий SDK затирает поставленную
// здесь личность: прогресс начинает читаться под чужим ключом, и проверка
// падает только в CI. Отдаём вместо него ту же заглушку.
const telegramSdkStub = (route) => route.fulfill({
  status: 200, contentType: 'text/javascript; charset=utf-8',
  body: `window.Telegram=window.Telegram||{WebApp:{initData:"user=%7B%22id%22%3A${ADMIN_ID}%7D&hash=qa",initDataUnsafe:{user:{id:${ADMIN_ID},first_name:"Тест"}},ready(){},expand(){},colorScheme:"light",onEvent(){},offEvent(){},MainButton:{show(){},hide(){}},BackButton:{show(){},hide(){},onClick(){}},HapticFeedback:{impactOccurred(){},notificationOccurred(){}}}};`,
});
await page.route('https://telegram.org/**', telegramSdkStub);
await page.route('https://*.workers.dev/**', async (route) => {
  const body = JSON.parse(route.request().postData() || '{}');
  const payload = body?.payload || body;
  calls.push(payload);
  const action = String(payload?.action || '');
  if (action === 'ratingReset') {
    return route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ success: true, removed: 260, player: { points: 0, published: false } }),
    });
  }
  if (action === 'ratingTop') {
    return route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ success: true, players: [], totalPublished: 0, me: null }),
    });
  }
  return route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ success: true, isBanned: false, lastGames: [], player: { points: 260 } }),
  });
});
for (const pattern of ['https://script.google.com/**', 'https://script.googleusercontent.com/**']) {
  await page.route(pattern, (route) => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, isBanned: false, lastGames: [] }),
  }));
}

await page.goto(baseURL, { waitUntil: 'commit', timeout: 30_000 });
await page.waitForSelector('#menu-container:not(.hidden)', { timeout: 25_000 });
await page.waitForTimeout(2500);

// 1. вход в сброс из справочника
await page.evaluate(() => document.getElementById('game-rules-btn').click());
await page.waitForSelector('.rules-shell', { timeout: 10_000 });
if (!(await page.locator('[data-rules-reset]').count())) await fail('из справочника не попасть в сброс прогресса');
await page.evaluate(() => document.querySelector('[data-rules-reset]').click());
await page.waitForSelector('.pr-shell', { timeout: 10_000 });

// 2. экран показывает реальный прогресс
const before = await page.evaluate(() => Object.fromEntries(
  [...document.querySelectorAll('[data-reset-game]')].map((node) => [
    node.dataset.resetGame, node.querySelector('.pr-game__progress')?.textContent || '',
  ]),
));
if (!/^4 уровня, 9 звёзд$/.test(before['biblical-match-three'] || '')) {
  await fail(`«Сокровища» показывают «${before['biblical-match-three']}» вместо «4 уровня, 9 звёзд»`);
}
if (!/^пройдено 5 уровней$/.test(before['bible-wow'] || '')) await fail(`«Библейские слова» показывают «${before['bible-wow']}»`);
// Склонение проверяется вместе с числом: «2 уровней» на экране читается как сбой.
if (!/^пройдено 2 уровня$/.test(before['bible-wordsearch'] || '')) await fail(`«Поиск слов» показывает «${before['bible-wordsearch']}»`);

// 3. сброс одной игры не трогает остальные
await page.evaluate(() => document.querySelector('[data-reset-game="bible-wow"] [data-reset-one]').click());
await page.waitForSelector('[data-reset-confirm]', { timeout: 5000 });
await page.evaluate(() => document.querySelector('[data-reset-confirm-ok]').click());
await page.waitForTimeout(900);

const afterOne = await page.evaluate((id) => ({
  wowDone: localStorage.getItem('bibleWowCompleted'),
  wowData: localStorage.getItem('bibleWowData_v5'),
  wowBonus: localStorage.getItem('bibleWowBonusByLevel'),
  seeds: localStorage.getItem('word_games_shuffle_v1'),
  bmt: localStorage.getItem(`biblical_match_three_progress_v2_${id}`),
  stars: localStorage.getItem(`biblical_match_three_stars_v1_${id}`),
}), ADMIN_ID);
if (afterOne.wowDone !== null) await fail('после сброса «Библейские слова» остались пройденные уровни');
if (afterOne.wowBonus !== null) await fail('после сброса остались найденные бонусные слова');
if (!afterOne.bmt) await fail('сброс одной игры стёр прогресс другой');
if (afterOne.stars !== '77') await fail('сброс отобрал заработанные звёзды, хотя обещал их оставить');
const wowData = JSON.parse(afterOne.wowData || '{}');
if (Number(wowData.coins) !== 44) await fail(`монеты «Библейских слов» стали ${wowData.coins} вместо 44`);
if (Number(wowData.levelIndex) !== 0) await fail('после сброса игра не вернулась на первый уровень');
if (!afterOne.seeds || !JSON.parse(afterOne.seeds).wow) await fail('сброс не запросил перераздачу слов');

const resetCall = calls.filter((call) => call.action === 'ratingReset').at(-1);
if (!resetCall) await fail('сброс не отправил на сервер откат очков');
if (!resetCall.snapshot || Number(resetCall.snapshot.wow?.completed) !== 0) {
  await fail(`в откате ушёл снимок с ${resetCall.snapshot?.wow?.completed} уровнями «Библейских слов» вместо нуля`);
}
if (Number(resetCall.snapshot.bmt?.completed) !== 4) {
  await fail('откат очков потерял прогресс игр, которые не сбрасывали');
}

// 4. сброс всего
await page.evaluate(() => document.querySelector('[data-reset-all]').click());
await page.waitForSelector('[data-reset-confirm]', { timeout: 5000 });
await page.evaluate(() => document.querySelector('[data-reset-confirm-ok]').click());
await page.waitForTimeout(900);

const afterAll = await page.evaluate((id) => ({
  bmt: localStorage.getItem(`biblical_match_three_progress_v2_${id}`),
  ws: localStorage.getItem(`bible_wordsearch_progress_v2_${id}`),
  sacred: localStorage.getItem(`sacred_word_levels_v4_${id}`),
  pairs: localStorage.getItem('kids_ark_pairs_records_v1'),
  stars: localStorage.getItem(`biblical_match_three_stars_v1_${id}`),
  wsSeed: JSON.parse(localStorage.getItem('word_games_shuffle_v1') || '{}').ws,
}), ADMIN_ID);
for (const [key, value] of Object.entries(afterAll)) {
  if (['stars', 'wsSeed'].includes(key)) continue;
  if (value !== null) await fail(`после общего сброса остался прогресс «${key}»`);
}
if (afterAll.stars !== '77') await fail('общий сброс отобрал звёзды');
if (!afterAll.wsSeed) await fail('общий сброс не перемешал уровни «Поиска слов»');

const lastReset = calls.filter((call) => call.action === 'ratingReset').at(-1);
if (Number(lastReset.snapshot.bmt?.completed) !== 0 || Number(lastReset.snapshot.sacred?.level) !== 0) {
  await fail(`после общего сброса на сервер ушёл непустой снимок: ${JSON.stringify(lastReset.snapshot)}`);
}

// 5. отмена ничего не трогает
await page.evaluate((id) => localStorage.setItem(`sacred_word_levels_v4_${id}`, JSON.stringify({ level: 3 })), ADMIN_ID);
await page.evaluate(() => document.querySelector('[data-reset-game="sacred-word"] [data-reset-one]').click());
await page.waitForSelector('[data-reset-confirm]', { timeout: 5000 });
await page.evaluate(() => document.querySelector('[data-reset-cancel]').click());
await page.waitForTimeout(500);
const kept = await page.evaluate((id) => localStorage.getItem(`sacred_word_levels_v4_${id}`), ADMIN_ID);
if (!kept) await fail('отмена подтверждения всё равно сбросила прогресс');

if (crashes.length) await fail(`страница поймала исключение: ${crashes[0]}`);

console.log('Сброс в порядке: показывает настоящий прогресс, чистит все ключи игры и не трогает соседние, '
  + 'звёзды оставляет, отправляет на сервер откат очков свежим снимком, отмена ничего не меняет, '
  + 'а слова после сброса перераздаются так, что каждое собирается из букв своего уровня.');

await browser.close();
server.close();
