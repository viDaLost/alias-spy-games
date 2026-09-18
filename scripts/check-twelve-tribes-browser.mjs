// «Двенадцать колен» на телефоне: раздача доигрывается пальцем.
//
// Счётный прогон рядом (check-twelve-tribes.mjs) доказывает правила — но
// правила можно доказать и на пустом экране. Здесь проверяется другое: что
// игра открывается из меню, что карту видно и по ней можно попасть пальцем,
// что соперники ходят сами и раздача доходит до итогов, и что при этом ничего
// не вылезает за край и не падает в консоль.
//
// И отдельно — замок. Игра идёт обкатку и открыта только главному
// администратору: у всех остальных карточки в меню нет, а прямой вызов
// showGame отвечает отказом. Замок этот проверяется первым: игра, открывшаяся
// не тому, кому положено, — это не мелкая оплошность, а ровно то, чего
// просили не допустить.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';

const root = process.cwd();
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
  response.writeHead(200, {
    'Content-Type': mime.get(path.extname(target)) || 'application/octet-stream',
    'Cache-Control': 'no-store',
  });
  response.end(fs.readFileSync(target));
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const baseURL = `http://127.0.0.1:${server.address().port}`;

const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROME_BIN || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});

const problems = [];
const need = (condition, message) => { if (!condition) problems.push(message); };

/** Партия на экране заданного размера. Возвращает, чем она кончилась. */
async function play(width, height, owner = true) {
  const context = await browser.newContext({
    viewport: { width, height }, isMobile: true, hasTouch: true, deviceScaleFactor: 2,
  });
  const page = await context.newPage();
  const errors = [];
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('pageerror', (error) => errors.push(String(error?.message || error)));

  await page.addInitScript(() => {
    window.Telegram = {
      WebApp: {
        /*
          initData непустая нарочно: проверка роли у приложения начинается
          именно с неё — без подписи Telegram она даже не спрашивает сервер,
          и главный администратор остался бы без своей роли.
        */
        initData: 'user=%7B%22id%22%3A1288379477%7D&hash=qa',
        initDataUnsafe: { user: { id: 1288379477, first_name: 'Тест' } },
        ready() {}, expand() {}, colorScheme: 'light', onEvent() {}, offEvent() {},
        MainButton: { show() {}, hide() {} }, BackButton: { show() {}, hide() {}, onClick() {} },
        HapticFeedback: { impactOccurred() {}, notificationOccurred() {} },
      },
    };
  });
  /*
    Роль приходит с сервера — той же проверкой, что зажигает кнопку админки.
    Здесь её отдаёт заглушка: «владелец» для прогона партии и «обычный
    человек» для проверки замка.
  */
  const stub = (route) => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({
      success: true, isBanned: false, lastGames: [], users: [],
      isAdmin: owner, isRoot: owner, role: owner ? 'owner' : 'none', userId: '1288379477',
      /*
        «Уже отвечено» — про два опроса, которые приложение показывает новичку:
        «откуда узнали» и отзыв. Оба приходят через пару секунд после меню и
        накрывают его собой; проверяют их свои проверки, а здесь они только
        заслоняют карточку игры.
      */
      answered: true, skip: true, eligible: false,
    }),
  });
  await page.route('https://telegram.org/**', (route) => route.fulfill({
    status: 200, contentType: 'text/javascript; charset=utf-8', body: 'window.Telegram=window.Telegram||{};',
  }));
  for (const pattern of ['https://script.google.com/**', 'https://script.googleusercontent.com/**',
    'https://*.workers.dev/**']) await page.route(pattern, stub);

  await page.goto(baseURL, { waitUntil: 'commit', timeout: 30_000 });
  /*
    Правила при первом входе в игру приложение показывает само — и это его
    работа, её проверяет check-game-rules.mjs. Здесь лист правил только мешает:
    он приходит через несколько секунд после входа и накрывает стол. Поэтому
    игра помечается как уже виденная, до того как её открыли.
  */
  await page.waitForSelector('#menu-container:not(.hidden)', { timeout: 25_000 });
  await page.waitForTimeout(1200);
  /*
    Отметка ставится на уже открытой странице, а не addInitScript: тот работает
    только для следующих загрузок, и на этой не сделал бы ничего — лист правил
    приходил бы через пару секунд после входа и накрывал стол.
  */
  await page.evaluate(() => {
    try {
      localStorage.setItem('game_rules_seen_v1', JSON.stringify({ 'twelve-tribes': Date.now() }));
    } catch { /* приватный режим */ }
  });

  // Роль приходит запросом, и карточка до неё скрыта у всех: ждём ответа.
  await page.waitForSelector('html.admin-rbac-root', { timeout: 15_000 });
  /*
    Вход именно из меню, а не вызовом showGame: карточка игры — это и есть
    дверь, и её отсутствие никак иначе не заметить.
  */
  const card = page.locator('[onclick*="twelve-tribes"]').first();
  need(await card.isVisible(), 'у главного администратора карточка игры не видна');
  await card.click();

  await page.waitForSelector('.tt-setup [data-start]', { timeout: 20_000 });
    await page.locator('[data-foes] button[data-value="2"]').click();
  await page.locator('[data-target] button[data-value="0"]').click();
  await page.locator('[data-start]').click();
  await page.waitForSelector('.tt-hand .tt-card', { timeout: 10_000 });

  // ——— раздача сдана честно ———
  const dealt = await page.evaluate(() => {
    const state = window.TwelveTribesEngine ? null : null;
    return {
      hand: document.querySelectorAll('.tt-hand .tt-card').length,
      foes: document.querySelectorAll('.tt-foe').length,
      pile: document.querySelectorAll('.tt-pile .tt-card').length,
      camp: document.querySelector('.tt-camp')?.textContent?.trim() || '',
    };
  });
  need(dealt.hand === 7, `на руке ${dealt.hand} карт вместо семи`);
  need(dealt.foes === 2, `за столом ${dealt.foes} соперника вместо двух`);
  need(dealt.pile === 1, 'на сбросе не лежит верхняя карта');
  need(/Иуда|Рувим|Ефрем|Дан/.test(dealt.camp), `стан стола не назван: «${dealt.camp}»`);

  // ——— по карте можно попасть пальцем ———
  const touch = await page.evaluate(() => {
    const card = document.querySelector('.tt-hand .tt-card');
    const box = card.getBoundingClientRect();
    const deck = document.querySelector('.tt-deck button').getBoundingClientRect();
    return { card: [Math.round(box.width), Math.round(box.height)], deck: [Math.round(deck.width), Math.round(deck.height)] };
  });
  need(touch.card[0] >= 56 && touch.card[1] >= 84,
    `карта в руке ${touch.card.join('×')} — меньше пальца`);
  need(touch.deck[0] >= 56 && touch.deck[1] >= 84, `колода ${touch.deck.join('×')} — меньше пальца`);

  /*
    Раздача доигрывается до итогов. Ходы человека здесь простые: чем можно
    пойти, тем и ходим; нечем — берём карту. Это же и есть самый частый способ
    играть, и если он застревает, играть в игру нельзя.
  */
  let steps = 0;
  let wilds = 0;
  let shofar = 0;
  while (steps < 900) {
    if (await page.locator('.tt-setup [data-next]').count()) break;
    const live = page.locator('.tt-hand .tt-card.is-live').first();
    if (await live.count()) {
      await live.click({ timeout: 4_000 }).catch(() => {});
      // Жребий и плен спрашивают стан — отвечаем первым же.
      if (await page.locator('.tt-sheet').count()) {
        wilds += 1;
        await page.locator('.tt-sheet [data-camp]').first().click({ timeout: 4_000 }).catch(() => {});
      }
    } else if (!(await page.locator('[data-draw]').isDisabled().catch(() => true))) {
      await page.locator('[data-draw]').click({ timeout: 4_000 }).catch(() => {});
      const fresh = page.locator('.tt-hand .tt-card.is-live').first();
      if (await fresh.count()) {
        await fresh.click({ timeout: 4_000 }).catch(() => {});
        if (await page.locator('.tt-sheet').count()) {
          await page.locator('.tt-sheet [data-camp]').first().click({ timeout: 4_000 }).catch(() => {});
        }
      } else if (await page.locator('[data-pass]:not([hidden])').count()) {
        await page.locator('[data-pass]').click({ timeout: 4_000 }).catch(() => {});
      }
    } else {
      await page.waitForTimeout(220);
    }
    // Осталась одна карта — трубим в шофар. Кнопка обязана быть видна.
    if (await page.locator('[data-shofar]:not([hidden])').count()) {
      shofar += 1;
      await page.locator('[data-shofar]').click({ timeout: 4_000 }).catch(() => {});
    }
    steps += 1;
  }
  const over = await page.locator('.tt-setup [data-next]').count() > 0;
  need(over, `за ${steps} нажатий раздача не дошла до итогов`);
  if (over) {
    const result = await page.evaluate(() => ({
      title: document.querySelector('.tt-setup h2')?.textContent || '',
      rows: document.querySelectorAll('.tt-score').length,
    }));
    need(/раздачу|берёт/i.test(result.title), `итоги не названы: «${result.title}»`);
    need(result.rows === 3, `в итогах ${result.rows} строк вместо трёх`);
  }

  // ——— ничего не вылезло за край ———
  const spill = await page.evaluate(() => {
    const doc = document.documentElement;
    const wide = [...document.querySelectorAll('.tt-wrap *')]
      .filter((node) => node.getBoundingClientRect().right > doc.clientWidth + 1).length;
    return { wide, scroll: doc.scrollWidth - doc.clientWidth };
  });
  need(spill.scroll === 0, `страница шире экрана на ${spill.scroll} точек`);
  need(spill.wide === 0, `${spill.wide} частей игры вылезли за правый край`);

  await context.close();
  return { errors, steps, wilds, shofar };
}

/*
  Замок. Обычный человек не видит карточку в меню и не попадает в игру даже
  прямым вызовом showGame — вместо стола он получает отказ и кнопку в меню.
*/
async function locked() {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  await page.addInitScript(() => {
    window.Telegram = {
      WebApp: {
        initData: 'user=%7B%22id%22%3A777000%7D&hash=qa',
        initDataUnsafe: { user: { id: 777000, first_name: 'Гость' } },
        ready() {}, expand() {}, colorScheme: 'light', onEvent() {}, offEvent() {},
        MainButton: { show() {}, hide() {} }, BackButton: { show() {}, hide() {}, onClick() {} },
        HapticFeedback: { impactOccurred() {}, notificationOccurred() {} },
      },
    };
  });
  const plain = (route) => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({
      success: true, isBanned: false, lastGames: [], users: [],
      isAdmin: false, isRoot: false, role: 'none', userId: '777000',
      answered: true, skip: true, eligible: false,
    }),
  });
  await page.route('https://telegram.org/**', (route) => route.fulfill({
    status: 200, contentType: 'text/javascript; charset=utf-8', body: 'window.Telegram=window.Telegram||{};',
  }));
  for (const pattern of ['https://script.google.com/**', 'https://script.googleusercontent.com/**',
    'https://*.workers.dev/**']) await page.route(pattern, plain);
  await page.goto(baseURL, { waitUntil: 'commit', timeout: 30_000 });
  await page.waitForSelector('#menu-container:not(.hidden)', { timeout: 25_000 });
  await page.waitForTimeout(2500);

  const seen = await page.evaluate(() => {
    const card = document.querySelector('[onclick*="twelve-tribes"]');
    return {
      exists: Boolean(card),
      shown: card ? getComputedStyle(card).display !== 'none' : false,
      root: document.documentElement.classList.contains('admin-rbac-root'),
      others: document.querySelectorAll('[onclick*="quartet"]').length,
    };
  });
  need(!seen.root, 'обычному человеку выдали роль главного администратора');
  need(seen.others > 0, 'у обычного человека пропали и прочие игры — дело не в замке');
  need(!seen.shown, 'карточка «Двенадцати колен» видна тому, кому игра ещё не открыта');

  await page.evaluate(() => window.showGame('twelve-tribes'));
  await page.waitForTimeout(1500);
  const refused = await page.evaluate(() => ({
    text: document.getElementById('game-container')?.innerText || '',
    table: document.querySelectorAll('.tt-wrap').length,
  }));
  need(/ещё не открыта/i.test(refused.text),
    `прямой вызов игры не отказал: «${refused.text.slice(0, 60)}»`);
  need(refused.table === 0, 'по прямому вызову игра всё-таки открылась');
  await context.close();
}

await locked();
const phone = await play(390, 844);
need(phone.errors.length === 0, `ошибки в консоли: ${phone.errors.slice(0, 2).join(' | ')}`);
const narrow = await play(320, 568);
need(narrow.errors.length === 0, `на узком экране ошибки: ${narrow.errors.slice(0, 2).join(' | ')}`);

await browser.close();
server.close();

if (problems.length) {
  console.error(`«Двенадцать колен» на телефоне не прошли проверку (${problems.length}):`);
  for (const line of problems) console.error(`  ✗ ${line}`);
  process.exit(1);
}

console.log('OK: замок держит — обычный человек не видит карточку и получает отказ на прямой вызов; '
  + 'у главного администратора игра открывается из меню, раздача сдана по семь карт на троих, карта и колода крупнее пальца, '
  + `раздача доиграна до итогов за ${phone.steps} нажатий (жребиев со сменой стана ${phone.wilds}, `
  + `шофаров ${phone.shofar}); на 390 и на 320 ничего не вылезло за край, консоль чистая.`);
