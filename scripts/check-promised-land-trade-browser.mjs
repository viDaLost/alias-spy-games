// Обмен уделами на экране: от кнопки до сменившегося хозяина.
//
// Правила обмена проверяет check-promised-land-trade.mjs — там их гоняют
// сотнями партий без браузера. Здесь проверяется то, чего в правилах нет:
// добирается ли человек до уговора руками и понимает ли, что ему предложили.
//
// Стережётся:
//
//   * уговор предлагается из шторки уделов, а не из воздуха;
//   * заложенное и застроенное в выбор не попадает вовсе;
//   * доплата считается и показывается словами, а не молча прибавляется;
//   * соперник от игры отвечает сам, и уделы после ответа у верных хозяев;
//   * предложение соперника видно человеку кнопками «Принять» и «Отказаться».
//
//     node scripts/check-promised-land-trade-browser.mjs

import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { chromium } from 'playwright-core';

const root = process.cwd();
const dir = path.join(root, 'cloudflare/promised-land-preview/public');
const mime = new Map([
  ['.html', 'text/html; charset=utf-8'], ['.js', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'], ['.json', 'application/json; charset=utf-8'],
  ['.webp', 'image/webp'], ['.png', 'image/png'], ['.svg', 'image/svg+xml'],
]);

const server = http.createServer((req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname);
  const target = path.resolve(dir, `.${pathname === '/' ? '/index.html' : pathname}`);
  if (!target.startsWith(dir + path.sep) || !fs.existsSync(target)) {
    res.writeHead(404).end('Not found');
    return;
  }
  res.writeHead(200, {
    'Content-Type': mime.get(path.extname(target)) || 'application/octet-stream',
    'Cache-Control': 'no-store',
  });
  fs.createReadStream(target).pipe(res);
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const url = `http://127.0.0.1:${server.address().port}/`;

// Без WebGL — по той же причине, что и в соседней проверке: клетки должны
// остаться элементами страницы, иначе нажимать не по чему.
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROME_BIN || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-webgl'],
});

const problems = [];
const need = (condition, message) => { if (!condition) problems.push(message); };
const errors = [];

const context = await browser.newContext({
  viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2,
});
const page = await context.newPage();
page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
page.on('pageerror', (error) => errors.push(String(error)));

await page.goto(url, { waitUntil: 'networkidle', timeout: 20_000 });
await page.locator('.mode-card[data-mode="solo"]').click();
await page.locator('.choice[data-key="years"] button[data-value="3"]').click();
await page.locator('#start-btn').click();
await page.waitForSelector('#game:not([hidden])', { timeout: 5_000 });
const skip = page.locator('#teach-skip');
if (await skip.count() && await skip.isVisible()) {
  await skip.click();
  await page.waitForSelector('#teach[hidden]', { state: 'attached', timeout: 3_000 }).catch(() => {});
}

/*
  Стол собирается прямо: проверке нужен не путь к нужному положению, а само
  положение. Человеку — Вирсавия и заложенный Герар, соседу — чистая Фекоя и
  застроенная Гива. Заложенное и застроенное в обмен идти не должны, а
  застроенное стоит в другом цвете нарочно: цвет Фекои обязан остаться чистым,
  иначе по новому правилу из него нельзя отдать и пустой удел.
*/
await page.evaluate(() => {
  const game = window.PromisedLandGame.state();
  game.phase = 'roll';
  game.pending = null;
  game.turn = 0;
  const put = (n, owner, extra = {}) => {
    Object.assign(game.cells[n], { owner, level: 0, altar: false, pledge: null, heldFrom: null }, extra);
  };
  put(1, 'p0');                                   // Вирсавия — своя, меняется
  put(3, 'p0', { pledge: { by: 'p0', debt: 100 } }); // Герар — в залоге
  put(6, 'p1');                                   // Фекоя — у соседа, цвет чистый
  put(12, 'p1', { level: 2 });                    // Гива — застроена, другой цвет
  game.players[0].silver = 900;
  game.players[1].silver = 900;
  window.PromisedLandGame.refresh();
});

// ——— уговор предлагается из шторки уделов ———
await page.locator('#sheet-open').click();
await page.waitForSelector('#sheet:not([hidden])', { timeout: 3_000 });
const start = page.locator('#sheet .trade-start');
need(await start.count() === 1, 'в шторке уделов нет кнопки «предложить уговор»');
await start.click();

const chips = async () => page.evaluate(() => [...document.querySelectorAll('#sheet .btn--chip')]
  .map((one) => one.textContent.trim()));
const shown = await chips();
need(shown.some((text) => text.startsWith('Вирсавия')), `своего удела нет в выборе: ${shown.join(' | ')}`);
need(!shown.some((text) => text.startsWith('Герар')), 'заложенный удел предложен к обмену');
need(!shown.some((text) => text.startsWith('Гива')), 'застроенный удел предложен к обмену');
need(shown.some((text) => text.startsWith('Фекоя')), 'чужого удела нет в выборе');

/*
  Шторка уделов разложена колонками под карточки, и уговор, попав в ту же
  сетку, вставал в полколонки: подпись слева, бирки справа, а «доплата
  серебром» ломалась на три строки. Разговор набирается строками во всю
  ширину — это и проверяется, иначе правка вернётся назад незамеченной.
*/
const widths = await page.evaluate(() => {
  const sheet = document.querySelector('#sheet');
  const box = sheet.getBoundingClientRect();
  const pad = getComputedStyle(sheet);
  const inner = box.width - parseFloat(pad.paddingLeft) - parseFloat(pad.paddingRight);
  const parts = [...sheet.querySelectorAll(':scope > h4, :scope > .trade-row, :scope > .trade-money')];
  return parts.map((one) => ({
    what: one.className || one.tagName.toLowerCase(),
    ratio: one.getBoundingClientRect().width / inner,
  }));
});
need(widths.length >= 4, `частей уговора в шторке всего ${widths.length}`);
const narrow = widths.filter((one) => one.ratio < 0.9);
need(narrow.length === 0, 'уговор набран в полколонки: '
  + narrow.map((one) => `${one.what} на ${Math.round(one.ratio * 100)}%`).join(', '));

/*
  Невыбранная бирка должна быть видна как бирка. Раньше её подложка задавалась
  белым по прозрачному — на светлой теме она сливалась с карточкой, и человек
  видел не кнопки, а строчку имён. Сверяется с подложкой самой шторки.
*/
const paint = await page.evaluate(() => {
  const sheet = document.querySelector('#sheet');
  const chip = sheet.querySelector('.btn--chip:not(.chip--on)');
  const read = (node) => getComputedStyle(node);
  return {
    sheet: read(sheet).backgroundColor,
    chip: read(chip).backgroundColor,
    edge: read(chip).borderTopColor,
  };
});
const opaque = (color) => {
  const parts = (color.match(/[\d.]+/g) || []).map(Number);
  return parts.length >= 3 && (parts.length < 4 || parts[3] > 0.5) ? parts.slice(0, 3) : null;
};
const sheetRgb = opaque(paint.sheet);
const chipRgb = opaque(paint.chip);
need(chipRgb !== null, `подложка бирки прозрачна: ${paint.chip}`);
need(sheetRgb && chipRgb && sheetRgb.some((one, i) => Math.abs(one - chipRgb[i]) >= 4),
  `бирка сливается со шторкой: ${paint.chip} на ${paint.sheet}`);
need(opaque(paint.edge) !== null || /rgba\([^)]*0?\.[1-9]/.test(paint.edge),
  `у бирки нет видимой обводки: ${paint.edge}`);

// ——— выбор и доплата ———
await page.locator('#sheet .btn--chip', { hasText: 'Вирсавия' }).first().click();
await page.locator('#sheet .btn--chip', { hasText: 'Фекоя' }).first().click();
await page.locator('#sheet .btn', { hasText: '+50' }).first().click();
await page.locator('#sheet .btn', { hasText: '+50' }).first().click();
const money = await page.locator('#sheet .trade-amount').textContent();
need(/вы даёте 100/.test(money || ''), `доплата показана как «${money}»`);
const summary = await page.locator('#sheet .trade-sum').textContent();
need(/160/.test(summary || ''), `счёт по цене не сошёлся: «${summary}»`);

// ——— отправка и ответ соперника ———
await page.locator('#sheet .btn--primary', { hasText: 'Предложить' }).click();
await page.waitForFunction(() => Boolean(window.PromisedLandGame.state().trade), null, { timeout: 3_000 })
  .catch(() => {});
const sent = await page.evaluate(() => {
  const trade = window.PromisedLandGame.state().trade;
  return trade ? { give: trade.give, take: trade.take, silver: trade.silver, to: trade.to } : null;
});
need(sent !== null, 'уговор не дошёл до партии');
need(sent && sent.give.includes(1) && sent.take.includes(6), `в уговоре оказались другие уделы: ${JSON.stringify(sent)}`);
need(sent && sent.silver === 100, `доплата ушла как ${sent?.silver}`);

// Соперник от игры отвечает сам — молча ждать его не приходится.
await page.waitForFunction(() => !window.PromisedLandGame.state().trade, null, { timeout: 6_000 })
  .catch(() => {});
const after = await page.evaluate(() => {
  const game = window.PromisedLandGame.state();
  return {
    trade: game.trade,
    one: game.cells[1].owner,
    six: game.cells[6].owner,
    purse: [game.players[0].silver, game.players[1].silver],
  };
});
need(after.trade === null, 'соперник от игры не ответил на уговор');
/*
  Ответ может быть любым — это его право. Проверяется не он, а то, что после
  ответа доска осталась целой: либо оба удела сменили хозяев и серебро ушло,
  либо не изменилось ничего.
*/
const swapped = after.one === 'p1' && after.six === 'p0';
const kept = after.one === 'p0' && after.six === 'p1';
need(swapped || kept, `после ответа уделы у ${after.one} и ${after.six}`);
if (swapped) {
  need(after.purse[0] === 800 && after.purse[1] === 1000,
    `при согласии кошельки стали ${after.purse.join(' и ')} вместо 800 и 1000`);
}
if (kept) {
  need(after.purse[0] === 900 && after.purse[1] === 900,
    `при отказе кошельки стали ${after.purse.join(' и ')} вместо 900 и 900`);
}

// ——— предложение соперника видно человеку ———
await page.evaluate(() => {
  const game = window.PromisedLandGame.state();
  game.trade = null;
  game.turn = 1;
  game.phase = 'roll';
  game.pending = null;
  const put = (n, owner) => {
    Object.assign(game.cells[n], { owner, level: 0, altar: false, pledge: null, heldFrom: null });
  };
  put(1, 'p0');
  put(6, 'p1');
  game.trade = { from: 'p1', to: 'p0', give: [6], take: [1], silver: 150, year: game.year, turn: 1 };
  window.PromisedLandGame.refresh();
});
await page.waitForTimeout(400);
const seen = await page.evaluate(() => ({
  text: document.querySelector('#actions .trade-offer')?.innerText || '',
  accept: [...document.querySelectorAll('#actions .btn')].map((one) => one.textContent.trim()),
}));
need(/Фекоя/.test(seen.text), `в предложении не видно, что отдают: «${seen.text}»`);
need(/Вирсавия/.test(seen.text), `в предложении не видно, что просят: «${seen.text}»`);
need(/150/.test(seen.text), `в предложении не видно доплаты: «${seen.text}»`);
need(seen.accept.includes('Принять') && seen.accept.includes('Отказаться'),
  `вместо ответа на уговор показаны кнопки: ${seen.accept.join(', ')}`);

// Кошелёк запоминается до согласия: первый уговор этой же проверки мог его
// уже изменить, и сверять с числом «как в начале партии» было бы гаданием.
const purseBefore = await page.evaluate(() => window.PromisedLandGame.state().players[0].silver);
await page.locator('#actions .btn', { hasText: 'Принять' }).click();
await page.waitForTimeout(400);
const done = await page.evaluate(() => {
  const game = window.PromisedLandGame.state();
  return { trade: game.trade, one: game.cells[1].owner, six: game.cells[6].owner, purse: game.players[0].silver };
});
need(done.trade === null, 'после согласия уговор остался висеть');
need(done.one === 'p1' && done.six === 'p0', `после согласия уделы у ${done.one} и ${done.six}`);
need(done.purse === purseBefore + 150,
  `получивший доплату стал с ${done.purse} вместо ${purseBefore + 150}`);

await browser.close();
server.close();

need(errors.length === 0, `ошибки в консоли: ${errors.slice(0, 2).join(' | ')}`);

if (problems.length) {
  console.error(`Обмен в «Земле обетованной» на экране не прошёл проверку (${problems.length}):`);
  for (const line of problems) console.error(`  ✗ ${line}`);
  process.exit(1);
}

console.log('OK: уговор предлагается из шторки уделов; заложенное и застроенное в выбор не попадают; '
  + 'доплата считается и подписана словами; соперник от игры отвечает сам, и после ответа доска цела; '
  + 'чужое предложение читается словами и отвечается кнопками «Принять» и «Отказаться».');
