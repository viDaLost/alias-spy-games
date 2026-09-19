// «Двенадцать колен» на телефоне: раздача доигрывается пальцем.
//
// Счётный прогон рядом (check-twelve-tribes.mjs) доказывает правила — но
// правила можно доказать и на пустом экране. Здесь проверяется другое: что
// игра открывается из меню, что карту видно и по ней можно попасть пальцем,
// что соперники ходят сами и раздача доходит до итогов, и что при этом ничего
// не вылезает за край и не падает в консоль.
//
// И отдельно — что игра открыта обычному человеку. Она была на обкатке, с
// карточкой, скрытой у всех, кроме главного администратора и приглашённых по
// списку; теперь список снят, и первым делом проверяется, что след замка не
// остался — обычный гость видит карточку, входит в игру и находит её в
// справочнике, как и любую другую.

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
async function play(width, height, foes = 2) {
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
    Здесь её отдаёт заглушка: эта партия всегда играется главным
    администратором, а обычного человека проверяет отдельный прогон
    asGuest() со своей заглушкой — сама игра открыта и тому, и другому.
  */
  const stub = (route) => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({
      success: true, isBanned: false, lastGames: [], users: [],
      isAdmin: true, isRoot: true, role: 'owner', userId: '1288379477',
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
    await page.locator(`[data-foes] button[data-value="${foes}"]`).click();
  await page.locator('[data-target] button[data-value="0"]').click();
  await page.locator('[data-start]').click();
  await page.waitForSelector('.tt-hand .tt-card', { timeout: 10_000 });

  // ——— раздача сдана честно ———
  const dealt = await page.evaluate(() => {
    const state = window.TwelveTribesEngine ? null : null;
    return {
      hand: document.querySelectorAll('.tt-hand .tt-card').length,
      // Своё место тоже стоит в ряду — соперники считаются без него.
      foes: document.querySelectorAll('.tt-foe:not(.tt-foe--me)').length,
      pile: document.querySelectorAll('.tt-pile .tt-card').length,
      camp: document.querySelector('.tt-camp')?.textContent?.trim() || '',
    };
  });
  need(dealt.hand === 7, `на руке ${dealt.hand} карт вместо семи`);
  need(dealt.foes === foes, `за столом ${dealt.foes} соперников вместо ${foes}`);
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
    ——— выход из партии стоит в своём углу, а не в общем ряду ———

    Жалоба игрока: «Перебить!» живёт секунды и исчезает, а на его месте в
    том же flex-ряду тут же оказывается «В меню» — не успевший убрать палец
    выходит из партии, которую не думал бросать. Проверять таймингом
    появления-исчезновения незачем: хватает того, что кнопка выхода вообще
    не делит ряд со скоротечными кнопками хода.
  */
  const exitLayout = await page.evaluate(() => ({
    ownCorner: Boolean(document.querySelector('.tt-topbar [data-menu]')),
    sharedRow: Boolean(document.querySelector('.tt-row [data-menu]')),
  }));
  need(exitLayout.ownCorner, 'кнопка выхода не стоит в своём углу (.tt-topbar)');
  need(!exitLayout.sharedRow, 'кнопка выхода всё ещё в общем ряду с «Перебить!» и «Шабат!»');

  /*
    ——— за столом видна очередь хода ———

    Мест на одно больше, чем соперников: первое — ваше. Дальше они стоят в том
    порядке, в каком будут ходить, и порядок этот спрашивается у самого движка,
    а не пересчитывается здесь заново: проверка, которая считает то же самое
    своим способом, проверяет только собственную арифметику.

    Проверяется и то, что круг оборачивается: «Иордан» меняет сторону хода, и
    очередь на столе обязана перестроиться целиком — иначе игрок кладёт
    странствие, глядя на вчерашнего соседа.
  */
  const queueNow = () => page.evaluate(() => {
    const state = window.TwelveTribesGame.state();
    const size = state.players.length;
    const want = [0];
    for (let step = 1; step < size; step += 1) {
      want.push(((0 + state.dir * step) % size + size) % size);
    }
    const chips = [...document.querySelectorAll('.tt-foe')];
    return {
      want,
      shown: chips.map((one) => Number(one.dataset.seat)),
      places: chips.slice(1).map((one) => one.querySelector('.tt-order')?.textContent || ''),
      next: chips.filter((one) => one.classList.contains('is-next')).map((one) => Number(one.dataset.seat)),
      tags: chips.map((one) => one.querySelector('.tt-foe-tag')?.textContent || ''),
    };
  });
  const order = await queueNow();
  need(order.shown.length === foes + 1, `на столе ${order.shown.length} мест вместо ${foes + 1}`);
  need(order.shown[0] === 0, 'первое место за столом не ваше');
  need(order.shown.join(',') === order.want.join(','),
    `очередь на столе ${order.shown.join('→')}, а движок ведёт ход ${order.want.join('→')}`);
  need(order.places.join(',') === order.want.slice(1).map((one, at) => String(at + 1)).join(','),
    `номера мест идут не подряд: ${order.places.join(',')}`);
  need(order.next.length === 1 && order.next[0] === order.want[1],
    `«следом» отмечен ${order.next.join(',')}, а ходит следом ${order.want[1]}`);

  // Круг оборачивается — очередь перестраивается вместе с ним.
  await page.evaluate(() => {
    const state = window.TwelveTribesGame.state();
    state.dir *= -1;
    window.TwelveTribesGame.refresh();
  });
  const back = await queueNow();
  need(back.shown.join(',') === back.want.join(','),
    `после иордана очередь ${back.shown.join('→')}, а ход идёт ${back.want.join('→')}`);
  need(foes < 2 || back.shown[1] !== order.shown[1],
    'круг обернулся, а следом за вами остался тот же игрок');
  await page.evaluate(() => {
    const state = window.TwelveTribesGame.state();
    state.dir *= -1;
    window.TwelveTribesGame.refresh();
  });

  /*
    ——— рука разложена по станам ———

    Карты одного стана лежат рядом, а не вперемешку. Проверяется не порядок
    станов между собой, а именно это: стан, встретившийся дважды с разрывом,
    значит, что рука не разложена и игрок ищет цвет глазами каждый ход.
  */
  const grouped = await page.evaluate(() => {
    const names = [...document.querySelectorAll('.tt-hand .tt-card .tt-name')]
      .map((node) => node.textContent.trim());
    const seen = new Set();
    let last = null;
    let broken = 0;
    for (const name of names) {
      if (name === last) continue;
      if (seen.has(name)) broken += 1;
      seen.add(name);
      last = name;
    }
    return { broken, names };
  });
  need(grouped.broken === 0,
    `рука не разложена по станам: ${grouped.names.join(', ')}`);

  /*
    ——— карта прилетает из колоды ———

    Полёт живёт в таблице стилей, но откуда лететь, считает разметка — и
    считает по настоящим местам на экране. Если счёт сломается, карта будет
    появляться в руке сама собой, и заметить это глазами почти нельзя: движение
    короткое. Поэтому спрашивается само число.
  */
  if (!(await page.locator('[data-draw]').isDisabled())) {
    await page.locator('[data-draw]').click({ timeout: 4_000 }).catch(() => {});
    const flight = await page.evaluate(() => {
      const card = document.querySelector('.tt-hand .tt-card.is-fresh');
      if (!card) return null;
      return {
        x: card.style.getPropertyValue('--fly-x'),
        y: card.style.getPropertyValue('--fly-y'),
      };
    });
    need(flight !== null, 'взятая карта не отмечена как только что взятая');
    if (flight) {
      need(/-?\d+px/.test(flight.x) && /-?\d+px/.test(flight.y),
        `полёт из колоды не рассчитан: x=${flight.x}, y=${flight.y}`);
      need(Math.abs(parseInt(flight.y, 10)) > 20,
        `колода и рука оказались в одной точке: y=${flight.y}`);
    }
  }

  /*
    ——— быстрые подсказки ———
    Лист «Что делают карты» открывается с самого стола и знает все шесть родов
    карт. Тексты берутся из правил игры, поэтому проверяется их число, а не
    буквы: разойтись им негде, а вот пропасть — можно.
  */
  await page.locator('[data-hints]').click({ timeout: 4_000 });
  const tips = await page.evaluate(() => ({
    rows: document.querySelectorAll('.tt-sheet .tt-tip').length,
    text: document.querySelector('.tt-sheet')?.innerText || '',
  }));
  need(tips.rows === 6, `в подсказках ${tips.rows} карт вместо шести`);
  need(/\+2/.test(tips.text) && /\+4/.test(tips.text),
    'в подсказках не сказано, сколько карт выдают странствие и плен');
  need(/Шабат/.test(tips.text), 'в подсказках не сказано про «Шабат»');
  /*
    Сосед в подсказке назван по имени. Это не мелочь: карта действует на того,
    кто ходит следом, и «сосед берёт четыре» не отвечает на вопрос «кто». Имя
    сюда подставляет разметка, и однажды оно уже не подставилось: граница слова
    в регулярном выражении для кириллицы не срабатывает.
  */
  const neighbourName = await page.evaluate(() => {
    const state = window.TwelveTribesGame.state();
    const size = state.players.length;
    return state.players[((state.dir % size) + size) % size].name;
  });
  need(tips.text.includes(neighbourName),
    `в подсказках сосед не назван по имени (${neighbourName}): «${tips.text.slice(0, 80)}»`);
  need(!/Сосед берёт две/.test(tips.text), 'в подсказках остался безымянный «сосед»');
  await page.locator('.tt-sheet [data-cancel]').click({ timeout: 4_000 });
  await page.waitForTimeout(200);
  need(await page.locator('.tt-sheet').count() === 0, 'лист подсказок не закрылся');

  /*
    ——— выбор стана виден ———

    Лист выбора живёт вне стола, в body, — и переменные цвета, объявленные на
    столе, до него не доходили: кнопки станов оставались прозрачными, а знак на
    них был с ноготь. Жребий кладётся в руку нарочно: ждать его в игре можно
    полпартии, а спросить надо сейчас.
  */
  await page.evaluate(() => {
    const state = window.TwelveTribesGame.state();
    state.players[0].hand.unshift({ id: 'lot-check', kind: 'lot', camp: null, rank: null });
    window.TwelveTribesGame.refresh();
  });
  await page.locator('.tt-hand .tt-card--wild').first().click({ timeout: 4_000 });
  const camps = await page.evaluate(() => {
    const wrap = document.querySelector('.tt-wrap');
    const probe = document.createElement('span');
    document.body.appendChild(probe);
    const want = new Set(['judah', 'reuben', 'ephraim', 'dan'].map((id) => {
      probe.style.backgroundColor = getComputedStyle(wrap).getPropertyValue(`--${id}`).trim();
      return getComputedStyle(probe).backgroundColor;
    }));
    probe.remove();
    const buttons = [...document.querySelectorAll('.tt-camps button')];
    const paints = buttons.map((one) => getComputedStyle(one).backgroundColor);
    const small = buttons.filter((one) => {
      const sign = one.querySelector('svg, img');
      const box = sign ? sign.getBoundingClientRect() : { width: 0 };
      return box.width < 30;
    }).length;
    return {
      total: buttons.length,
      wrong: paints.filter((paint) => !want.has(paint)).length,
      distinct: new Set(paints).size,
      small,
      paints,
    };
  });
  need(camps.total === 4, `в листе выбора ${camps.total} станов вместо четырёх`);
  /*
    Цвет спрашивается не «хоть какой», а именно цвет стана: у кнопки есть
    запасной серый на случай, когда переменная не дошла, — и без сверки с
    палитрой все четыре кнопки могли быть одинаково серыми, а проверка бы
    молчала. Ровно это и случилось: лист живёт вне стола, и переменные до него
    не доходили.
  */
  need(camps.wrong === 0, `${camps.wrong} кнопок стана не в цвет стана: ${camps.paints.join(', ')}`);
  need(camps.distinct === 4, `четыре стана покрашены в ${camps.distinct} цвета`);
  need(camps.small === 0, `${camps.small} знаков стана мельче тридцати точек`);
  await page.locator('.tt-sheet [data-cancel]').click({ timeout: 4_000 });
  await page.evaluate(() => {
    const state = window.TwelveTribesGame.state();
    const at = state.players[0].hand.findIndex((one) => one.id === 'lot-check');
    if (at >= 0) state.players[0].hand.splice(at, 1);
    window.TwelveTribesGame.refresh();
  });

  /*
    ——— сыгранная карта прилетает со своего места ———

    Своя карта летит снизу, из руки; чужая — с края стола, где сидит соперник.
    След полёта живёт до следующей перерисовки, а перерисовывает стол ещё и
    таймер соперников, — спрашивать «что сейчас на сбросе» поздно уже через
    полсекунды. Поэтому за сбросом ставится наблюдатель: он ловит карту в тот
    миг, когда она легла, и запоминает, откуда она летела.
  */
  await page.evaluate(() => {
    window.__ttLandings = [];
    const pile = document.querySelector('[data-pile]');
    const watch = new MutationObserver(() => {
      const card = pile.querySelector('.tt-card.is-landing');
      if (!card) return;
      window.__ttLandings.push({
        x: card.style.getPropertyValue('--fly-x'),
        y: card.style.getPropertyValue('--fly-y'),
      });
    });
    watch.observe(pile, { childList: true, subtree: true });
  });
  /*
    Карта берётся простая, не жребий колен: тот вместо хода спрашивает стан и
    открывает лист — и полёта в этот миг не случается вовсе. Проверка на этом
    честно спотыкалась через раз, пока не научилась отличать одно от другого.
  */
  const live = page.locator('.tt-hand .tt-card.is-live:not(.tt-card--wild)').first();
  if (await live.count()) {
    await live.click({ timeout: 4_000 }).catch(() => {});
    // Ход соперников — чтобы поймать и чужой полёт, с другого края стола.
    await page.waitForTimeout(2_500);
    const landings = await page.evaluate(() => window.__ttLandings || []);
    need(landings.length > 0, 'ни одна сыгранная карта не легла на сброс с полётом');
    const nowhere = landings.filter((one) => !/-?\d+px/.test(one.y)).length;
    need(nowhere === 0, `${nowhere} карт из ${landings.length} легли на сброс ниоткуда`);
    const far = landings.filter((one) => Math.abs(parseInt(one.y, 10)) > 20).length;
    need(far === landings.length,
      `${landings.length - far} карт прилетели из точки, где лежит сам сброс`);
  }

  /*
    ——— масть видна на самой карте ———

    Проверка не про красоту. Место карты в веере и в стопке сброса когда-то
    дописывалось к уже собранной разметке вторым атрибутом style: браузер
    молча оставлял только первый — вместе с цветом стана, — и вся колода
    становилась серой. Ошибок в консоли при этом не было, раздача шла, счёт
    считался: поломку было видно только глазами. Теперь её видно отсюда.

    Цвета не переписаны сюда числами: они берутся из самой игры и сравниваются
    с тем, что браузер на карте нарисовал. Сменится палитра станов — проверка
    сменится вместе с ней, а серую карту всё равно поймает.
  */
  const suits = await page.evaluate(() => {
    const wrap = document.querySelector('.tt-wrap');
    const probe = document.createElement('span');
    document.body.appendChild(probe);
    const want = new Set(['judah', 'reuben', 'ephraim', 'dan'].map((id) => {
      probe.style.backgroundColor = getComputedStyle(wrap).getPropertyValue(`--${id}`).trim();
      return getComputedStyle(probe).backgroundColor;
    }));
    probe.remove();
    const cards = [...document.querySelectorAll('.tt-hand .tt-card, .tt-pile .tt-card')]
      .filter((card) => !card.classList.contains('tt-card--wild'));
    return {
      total: cards.length,
      grey: cards.filter((card) => !want.has(getComputedStyle(card).backgroundColor)).length,
      marked: cards.filter((card) => card.querySelectorAll('.tt-corner').length === 2).length,
      named: cards.filter((card) => (card.querySelector('.tt-name')?.textContent || '').trim().length > 1).length,
    };
  });
  need(suits.total > 0, 'на столе не нашлось ни одной карты стана');
  need(suits.grey === 0, `${suits.grey} карт из ${suits.total} потеряли цвет стана`);
  need(suits.marked === suits.total, `у ${suits.total - suits.marked} карт нет метки в углу`);
  need(suits.named === suits.total, `у ${suits.total - suits.named} карт нет имени стана на ленте`);

  /*
    Раздача доигрывается до итогов. Ходы человека здесь простые: чем можно
    пойти, тем и ходим; нечем — берём карту. Это же и есть самый частый способ
    играть, и если он застревает, играть в игру нельзя.
  */
  let steps = 0;
  let wilds = 0;
  let shabbat = 0;
  /*
    Предел здесь по времени, а не по числу оборотов, и вот почему.

    Оборот — это не всегда нажатие. Пока ходят соперники, человеку нажимать
    нечем, и оборот тратится на ожидание в пятую долю секунды. Сколько таких
    ожиданий придётся на раздачу, заранее не знает никто: это зависит и от
    числа соперников, и от того, как легла колода, и от того, насколько занята
    машина. Поэтому прежний предел в оборотах мерил не игру, а погоду: одна и
    та же раздача укладывалась то в сто шестьдесят оборотов, то не укладывалась
    и в тысячу сто — и проверка честно сообщала, что игра встала, хотя игра шла.

    Время же мерит ровно то, ради чего предел и нужен: раздача, которая не
    кончается. Запас взят с большим перекрытием — обычная раздача доигрывается
    за полминуты-минуту даже втроём с ожиданиями, — а по-настоящему вставшая
    игра не сдвинется и за пять минут.
  */
  const started = Date.now();
  const deadline = started + 5 * 60_000;
  while (Date.now() < deadline) {
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
    // Осталась одна карта — говорим «Шабат». Кнопка обязана быть видна.
    if (await page.locator('[data-shabbat]:not([hidden])').count()) {
      shabbat += 1;
      await page.locator('[data-shabbat]').click({ timeout: 4_000 }).catch(() => {});
    }
    steps += 1;
  }
  const over = await page.locator('.tt-setup [data-next]').count() > 0;
  need(over, `за ${Math.round((Date.now() - started) / 1000)} с и ${steps} оборотов раздача не дошла до итогов`);
  if (over) {
    const result = await page.evaluate(() => ({
      title: document.querySelector('.tt-setup h2')?.textContent || '',
      rows: [...document.querySelectorAll('.tt-score')].map((one) => one.textContent.trim()),
      places: window.TwelveTribesGame.state().players.map((one) => one.place),
    }));
    need(/вышел первым|вышли первым|набрал|набрали/i.test(result.title),
      `итоги не названы: «${result.title}»`);
    // В итогах строка на каждого, кто сидел за столом, — вместе с вами.
    need(result.rows.length === foes + 1, `в итогах ${result.rows.length} строк вместо ${foes + 1}`);
    /*
      Места читаются словами и стоят по порядку. Без этого «третье место»
      существовало бы только в памяти движка: на экране игрок увидел бы
      четыре строки и не понял, какая из них его.
    */
    const places = [...result.places].sort((a, b) => a - b);
    const wanted = result.places.map((_, at) => at + 1);
    need(places.join(',') === wanted.join(','), `места розданы как ${places.join(',')}`);
    need(result.rows.every((line, at) => line.startsWith(`${at + 1}.`)),
      `итоги не пронумерованы местами: ${result.rows.join(' | ')}`);
  }

  // ——— ничего не вылезло за край ———
  const spill = await page.evaluate(() => {
    const doc = document.documentElement;
    /*
      Рука — лента с прокруткой: когда карт много, дальние честно лежат за
      правым краем, и это не поломка, а способ показать двенадцать карт на
      экране в триста двадцать точек. Считается всё остальное.
    */
    const wide = [...document.querySelectorAll('.tt-wrap *')]
      .filter((node) => !node.closest('.tt-hand'))
      .filter((node) => node.getBoundingClientRect().right > doc.clientWidth + 1).length;
    return { wide, scroll: doc.scrollWidth - doc.clientWidth };
  });
  need(spill.scroll === 0, `страница шире экрана на ${spill.scroll} точек`);
  need(spill.wide === 0, `${spill.wide} частей игры вылезли за правый край`);

  await context.close();
  return { errors, steps, wilds, shabbat };
}

/*
  Вход не администратора. Игра открыта и ему — карточка видна, showGame
  впускает за стол, справочник о ней знает. Единственное, чего у обычного
  человека нет и не должно быть, — роли администратора.
*/
async function asGuest(userId) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  await page.addInitScript((id) => {
    window.Telegram = {
      WebApp: {
        initData: `user=%7B%22id%22%3A${id}%7D&hash=qa`,
        initDataUnsafe: { user: { id: Number(id), first_name: 'Гость' } },
        ready() {}, expand() {}, colorScheme: 'light', onEvent() {}, offEvent() {},
        MainButton: { show() {}, hide() {} }, BackButton: { show() {}, hide() {}, onClick() {} },
        HapticFeedback: { impactOccurred() {}, notificationOccurred() {} },
      },
    };
  }, userId);
  const plain = (route) => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({
      success: true, isBanned: false, lastGames: [], users: [],
      isAdmin: false, isRoot: false, role: 'none', userId,
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

  /*
    Справочник обязан молчать о той игре, которой у человека нет, и говорить о
    той, которая есть: раздел про игру, до которой не добраться, — недоумение,
    а не вежливость. Спрашивается он до игры, пока экран ещё меню.
  */
  const rules = await page.evaluate(async () => {
    if (typeof window.openGameRules !== 'function') return null;
    window.openGameRules();
    await new Promise((done) => setTimeout(done, 800));
    const found = document.querySelectorAll('[data-rules-game="twelve-tribes"]').length;
    document.querySelectorAll('.rules-modal, #game-rules, .rules-sheet').forEach((one) => {
      one.hidden = true;
      one.remove();
    });
    return found > 0;
  });

  await page.evaluate(() => window.showGame('twelve-tribes'));
  await page.waitForTimeout(2500);
  const opened = await page.evaluate(() => ({
    text: document.getElementById('game-container')?.innerText || '',
    table: document.querySelectorAll('.tt-wrap').length,
  }));
  await context.close();
  return { ...seen, ...opened, rules };
}

/*
  Обычный человек. Карточка видна, прямой вызов пускает за стол, справочник
  знает об игре — всё то же, что и у главного администратора, кроме самой
  роли: её у него нет и быть не должно.
*/
const guest = await asGuest('777000');
need(!guest.root, 'обычному человеку выдали роль главного администратора');
need(guest.others > 0, 'у обычного человека пропали и прочие игры — дело не в этой карточке');
need(guest.shown, 'карточка «Двенадцати колен» не видна обычному человеку');
need(guest.table > 0, `обычного человека не пустили в игру: «${guest.text.slice(0, 60)}»`);
need(guest.rules !== false, 'справочник молчит об игре, которая открыта всем');
const phone = await play(390, 844);
need(phone.errors.length === 0, `ошибки в консоли: ${phone.errors.slice(0, 2).join(' | ')}`);
const narrow = await play(320, 568);
need(narrow.errors.length === 0, `на узком экране ошибки: ${narrow.errors.slice(0, 2).join(' | ')}`);
/*
  Стол на восьмерых — отдельная раздача: семь мест обязаны поместиться на
  телефоне целиком, вместе с колодой, сбросом и рукой. Без этого двое крайних
  соперников оказываются за краем экрана, и в игре их как бы нет.
*/
const crowd = await play(390, 844, 7);
need(crowd.errors.length === 0, `восьмером ошибки: ${crowd.errors.slice(0, 2).join(' | ')}`);

await browser.close();
server.close();

if (problems.length) {
  console.error(`«Двенадцать колен» на телефоне не прошли проверку (${problems.length}):`);
  for (const line of problems) console.error(`  ✗ ${line}`);
  process.exit(1);
}

console.log('OK: карточка видна и играбельна обычному человеку — она видна, вход пускает за стол, справочник о ней знает; '
  + 'у главного администратора игра открывается из меню, раздача сдана по семь карт на троих, карта и колода крупнее пальца, '
  + `раздача доиграна до итогов за ${phone.steps} оборотов (жребиев со сменой стана ${phone.wilds}, `
  + `«Шабат» сказан ${phone.shabbat} раз); места стоят по очереди хода и переставляются после иордана, `
  + 'рука разложена по станам, взятая карта летит из колоды, '
  + 'подсказки открываются и знают все шесть родов карт, кнопки станов цветные и крупные; '
  + 'кнопка выхода стоит в своём углу отдельно от «Перебить!» и «Шабат!»; '
  + 'стол на восьмерых сыгран целиком; на 390 и на 320 ничего не вылезло за край, консоль чистая.');
