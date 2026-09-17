// check-promised-land-app.mjs — «Земля обетованная» в приложении.
//
// Обкатка кончилась: игра открыта всем наравне с остальными, и прежний замок —
// скрытая карточка плюс отказ в showGame — снят целиком.
//
// Стеречь после этого надо две вещи, и обе ломаются тихо:
//
//   * карточку видит обычный игрок, а не только администратор. Замок снимали
//     в двух местах сразу, и оставленная половина — скрывающее правило в
//     таблице стилей — спрятала бы игру обратно, ничего не сломав на вид;
//   * игра открывается кадром на свой воркер и со своей иконкой, а не пустотой.
//
// Поэтому здесь спрашивается не наличие правил в исходниках, а то, что видит
// игрок: видна ли карточка, та ли на ней иконка и что открывается по нажатию.

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

  // Карточку видит обычный игрок — без роли администратора и без ничего.
  const plain = await card();
  need(plain.есть, 'карточки «Земли обетованной» нет в меню вовсе');
  need(plain.видна, 'карточка «Земли обетованной» не видна обычному игроку');
  need(/promised-land\.webp/.test(plain.иконка),
    `у карточки не та иконка: ${plain.иконка || 'её нет'}`);
  need(plain.загружена >= 200,
    `иконка карточки не загрузилась: ширина ${plain.загружена}`);

  /*
    Замок снят целиком, а не выключен. Половина замка — правило, прячущее
    карточку по классу, — держалась в таблице стилей и сработала бы снова от
    любой чужой правки. Спрашивается и про сам класс на карточке: пока он
    висит, правило можно вернуть одной строкой, и никто этого не заметит.
  */
  const marked = await page.evaluate(() => {
    const node = [...document.querySelectorAll('.game-card')]
      .find((one) => one.textContent.includes('Земля обетованная'));
    return Boolean(node?.classList.contains('game-card--owner'));
  });
  need(!marked, 'на карточке остался признак «только администратору»');

  // Игра открывается кадром на свой воркер, а не пустотой и не отказом.
  await page.evaluate(() => window.showGame?.('promised-land'));
  await page.waitForTimeout(600);
  const refused = await page.locator('.app-error-card h2').first().textContent().catch(() => '');
  need(!/не открыта/i.test(String(refused || '')),
    `игрока по-прежнему разворачивают: «${refused}»`);
  const frame = await page.locator('iframe.game-frame').getAttribute('src').catch(() => '');
  need(Boolean(frame), 'игра не открылась кадром');
  need(/promised-land/.test(String(frame || '')),
    `кадр открылся не на игру: ${frame}`);

  // И для администратора ничего не меняется: та же карточка, тот же вход.
  await page.evaluate(() => window.goToMainMenu?.());
  await page.evaluate(() => document.documentElement.classList.add('admin-rbac-root'));
  await page.waitForTimeout(400);
  const owner = await card();
  need(owner.видна, 'с ролью администратора карточка пропала');

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

console.log('OK: карточка «Земли обетованной» видна обычному игроку со своей иконкой, признака '
  + '«только администратору» на ней не осталось, игра открывается кадром на свой воркер, и с ролью '
  + 'администратора ничего не меняется.');
