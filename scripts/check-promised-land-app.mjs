// check-promised-land-app.mjs — «Земля обетованная» в приложении.
//
// Игра заведена в меню, но пока открыта только главному администратору. У
// такого замка две половины, и каждая без другой бесполезна:
//
//   * карточка спрятана в меню — иначе игру увидят все;
//   * вход закрыт в showGame — иначе до неё дойдут мимо карточки, из истории
//     браузера или прямым вызовом.
//
// Сломаться это может тихо. Карточка прячется классом, а «.game-card--owner» —
// один класс, вес у него тот же, что у «.game-card»: любая таблица,
// подключённая позже, перебьёт его своим display, и карточка молча покажется
// всем. Поэтому здесь спрашивается не наличие правила, а то, что видит игрок.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const problems = [];
const need = (condition, message) => { if (!condition) problems.push(message); };

const mime = new Map([
  ['.html', 'text/html; charset=utf-8'], ['.js', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'], ['.webp', 'image/webp'], ['.png', 'image/png'],
  ['.json', 'application/json'], ['.webmanifest', 'application/manifest+json'],
  ['.svg', 'image/svg+xml'],
]);

const server = http.createServer((req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname);
  const target = path.resolve(root, `.${pathname === '/' ? '/index.html' : pathname}`);
  if (!target.startsWith(root + path.sep) || !fs.existsSync(target) || fs.statSync(target).isDirectory()) {
    res.writeHead(404).end('Not found');
    return;
  }
  res.writeHead(200, { 'Content-Type': mime.get(path.extname(target)) || 'application/octet-stream' });
  fs.createReadStream(target).pipe(res);
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const url = `http://127.0.0.1:${server.address().port}/`;

const { chromium } = await import('playwright-core');
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROME_BIN || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});

try {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2,
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  await page.goto(url, { waitUntil: 'networkidle', timeout: 20_000 });
  await page.waitForTimeout(2200);

  const card = () => page.evaluate(() => {
    const node = [...document.querySelectorAll('.game-card')]
      .find((one) => one.textContent.includes('Земля обетованная'));
    if (!node) return { есть: false, видна: false, иконка: '', загружена: 0 };
    const image = node.querySelector('img');
    return {
      есть: true,
      видна: node.offsetParent !== null,
      иконка: image?.getAttribute('src') || '',
      загружена: image?.naturalWidth || 0,
    };
  });

  // Обычный игрок карточки не видит.
  const plain = await card();
  need(plain.есть, 'карточки «Земли обетованной» нет в меню вовсе');
  need(!plain.видна, 'карточка «Земли обетованной» видна обычному игроку');

  // И не заходит мимо неё.
  await page.evaluate(() => window.showGame?.('promised-land'));
  await page.waitForTimeout(500);
  const shut = await page.locator('.app-error-card h2').first().textContent().catch(() => '');
  need(/не открыта/i.test(String(shut || '')),
    `прямой вход обычному игроку показал «${shut || 'экран игры'}»`);
  need(await page.locator('iframe.game-frame').count() === 0,
    'обычному игроку открылся кадр с игрой');

  await page.evaluate(() => window.goToMainMenu?.());
  await page.waitForTimeout(400);

  // Главному администратору — видна, с настоящей иконкой.
  await page.evaluate(() => document.documentElement.classList.add('admin-rbac-root'));
  await page.waitForTimeout(300);
  const owner = await card();
  need(owner.видна, 'главному администратору карточка «Земли обетованной» не показалась');
  need(/promised-land\.webp/.test(owner.иконка),
    `у карточки не та иконка: ${owner.иконка || 'её нет'}`);
  need(owner.загружена >= 200,
    `иконка карточки не загрузилась: ширина ${owner.загружена}`);

  // И открывается кадром на свой воркер, а не пустотой.
  await page.evaluate(() => window.showGame?.('promised-land'));
  await page.waitForTimeout(600);
  const frame = await page.locator('iframe.game-frame').getAttribute('src').catch(() => '');
  need(Boolean(frame), 'у главного администратора игра не открылась кадром');
  need(/promised-land/.test(String(frame || '')),
    `кадр открылся не на игру: ${frame}`);

  need(errors.length === 0, `ошибки на странице — ${errors.slice(0, 2).join(' | ')}`);
} finally {
  await browser.close();
  server.close();
}

if (problems.length) {
  console.error('«Земля обетованная» в приложении не прошла проверку:');
  for (const one of problems) console.error(`  ✗ ${one}`);
  process.exit(1);
}

console.log('OK: карточка «Земли обетованной» скрыта от обычного игрока и закрыта даже по прямому '
  + 'вызову, а главному администратору видна со своей иконкой и открывается кадром на свой воркер.');
