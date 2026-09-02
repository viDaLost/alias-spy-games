// Проверяет витрину приложения и путь установки на iPhone из Telegram.
//
// Ярлык на главный экран создаёт только Safari и только для открытого в нём
// сайта — а адрес этого сайта он показывает и запоминает. Поэтому приложение
// отдаётся ещё и с отдельного адреса. Что ломается молча:
//
//   * витрина проговаривается о GitHub: адресом в разметке, заголовком ответа
//     или ссылкой внутри страницы. Тогда всё это затевалось зря;
//   * витрина отдаёт index.html или работника из кеша, и установленное
//     приложение застревает на старой сборке без возможности обновиться;
//   * работник не получает корневой охват и не управляет приложением;
//   * из Telegram некуда нажать: карточка установки там не показывается или не
//     умеет открыть Safari.

import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import http from 'node:http';
import { chromium } from 'playwright-core';

const root = process.cwd();
const worker = fs.readFileSync(path.join(root, 'cloudflare/app-shell-worker/src/index.js'), 'utf8');
const wrangler = fs.readFileSync(path.join(root, 'cloudflare/app-shell-worker/wrangler.jsonc'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const core = fs.readFileSync(path.join(root, 'cloudflare/app-core-worker/wrangler.jsonc'), 'utf8');

// --- адрес витрины -----------------------------------------------------------
const shellName = wrangler.match(/"name":\s*"([^"]+)"/)?.[1];
assert.equal(shellName, 'alias-spy-games-app', `витрина названа «${shellName}» — адрес приложения изменится`);

const shellUrl = html.match(/name="app-shell" content="([^"]+)"/)?.[1] || '';
assert.ok(shellUrl.startsWith('https://'), 'в index.html нет адреса витрины');
assert.ok(shellUrl.includes(shellName), `адрес витрины «${shellUrl}» не совпадает с именем воркера «${shellName}»`);
assert.ok(!/github/i.test(shellUrl), 'адрес витрины сам ссылается на GitHub');

// Приложение с витрины обращается ко всем своим воркерам, и каждый сверяет
// Origin. Забытый в одном списке адрес молча ломает то, что этим воркером
// живёт: онлайн-игры перестают подключаться, а понять почему можно только по
// консоли браузера с чужого телефона.
const backends = [...html.matchAll(/name="(app-core-backend|quartet-backend|bible-sketch-backend|app-observability)" content="https:\/\/([^."]+)\./g)]
  .map((match) => ({ meta: match[1], worker: match[2] }));
assert.ok(backends.length >= 4, `в index.html нашлось только ${backends.length} бэкендов — список воркеров изменился`);

const configs = fs.readdirSync(path.join(root, 'cloudflare'))
  .map((dir) => path.join(root, 'cloudflare', dir, 'wrangler.jsonc'))
  .filter((file) => fs.existsSync(file))
  .map((file) => ({ file, text: fs.readFileSync(file, 'utf8') }));

for (const backend of backends) {
  const config = configs.find(({ text }) => new RegExp(`"name":\\s*"${backend.worker}"`).test(text));
  assert.ok(config, `не нашёлся wrangler.jsonc воркера ${backend.worker}`);
  const origins = config.text.match(/"ALLOWED_ORIGINS": "([^"]+)"/)?.[1] || '';
  assert.ok(origins.split(',').includes(shellUrl),
    `origin витрины не разрешён в ${backend.worker}: приложение с неё не сможет пользоваться этим сервером`);
}
assert.ok(core.includes(shellUrl), `origin витрины ${shellUrl} не разрешён в ALLOWED_ORIGINS основного воркера`);

// --- поведение витрины -------------------------------------------------------
assert.ok(/Service-Worker-Allowed/.test(worker), 'витрина не даёт работнику корневой охват');
assert.ok(/no-cache/.test(worker), 'витрина не запрещает кеш для index.html и работника');
for (const header of ['server', 'x-served-by', 'via']) {
  assert.ok(worker.includes(`'${header}'`), `витрина не снимает заголовок ${header}, по которому виден источник`);
}

// --- страница установки ------------------------------------------------------
const install = fs.readFileSync(path.join(root, 'install.html'), 'utf8');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.webmanifest'), 'utf8'));

assert.ok(/rel="manifest"/.test(install), 'страница установки не подключает манифест — ярлык получится без имени и значка');
assert.ok(/apple-touch-icon/.test(install), 'у страницы установки нет значка для главного экрана');
assert.ok(/apple-mobile-web-app-title/.test(install), 'у ярлыка не будет имени');
// Ярлык должен запускать игру, а не инструкцию по установке.
assert.ok(/index\.html/.test(String(manifest.start_url || '')),
  `start_url манифеста «${manifest.start_url}» ведёт не на приложение — ярлык откроет страницу установки`);
assert.ok(/location\.replace\('\.\/index\.html'\)/.test(install),
  'страница установки не уводит на игру, когда её открыли ярлыком — на старых iOS человек попадёт в инструкцию');
assert.ok(/navigator\.standalone/.test(install), 'страница установки не отличает запуск ярлыком от обычной вкладки');
assert.ok(/Safari/.test(install), 'страница установки не говорит, что ярлык умеет создавать только Safari');
// В новом Safari «Поделиться» спрятано за тремя точками, и без этого шага
// человек ищет кнопку, которой на экране нет.
assert.ok(/•••/.test(install), 'в инструкции нет шага с тремя точками — «Поделиться» в новом Safari спрятано за ними');
assert.ok(install.indexOf('•••') < install.indexOf('Поделиться'),
  'шаг с тремя точками стоит после «Поделиться», хотя открывает его');

// Играть прямо из вкладки Safari отсюда нельзя: у вкладки и у ярлыка разные
// хранилища, и начатый во вкладке прогресс в установленное приложение не
// попадёт. Уводит на приложение только сам ярлык — тем же location.replace,
// который проверен выше.
assert.ok(!/<a[^>]*href="\.\/index\.html"/.test(install),
  'со страницы установки можно уйти играть во вкладку — прогресс останется не в приложении');

// --- витрина в деле: поднимаем её поверх локальной копии приложения ------------
const mime = new Map([
  ['.html', 'text/html; charset=utf-8'], ['.js', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'], ['.json', 'application/json; charset=utf-8'],
  ['.webmanifest', 'application/manifest+json; charset=utf-8'],
  ['.png', 'image/png'], ['.jpg', 'image/jpeg'], ['.webp', 'image/webp'],
  ['.svg', 'image/svg+xml'], ['.woff2', 'font/woff2'],
]);

// «GitHub Pages»: отдаёт файлы из подкаталога и представляется своими заголовками.
const pages = http.createServer((request, response) => {
  const pathname = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname)
    .replace(/^\/alias-spy-games/, '');
  const target = path.resolve(root, `.${pathname === '' || pathname === '/' ? '/index.html' : pathname}`);
  if (!target.startsWith(root + path.sep) || !fs.existsSync(target) || !fs.statSync(target).isFile()) {
    response.writeHead(404).end('Not found');
    return;
  }
  response.writeHead(200, {
    'Content-Type': mime.get(path.extname(target)) || 'application/octet-stream',
    Server: 'GitHub.com',
    'X-Served-By': 'cache-github-1',
    'X-GitHub-Request-Id': 'ABCD:1234',
  });
  response.end(fs.readFileSync(target));
});
await new Promise((resolve) => pages.listen(0, '127.0.0.1', resolve));
const pagesURL = `http://127.0.0.1:${pages.address().port}/alias-spy-games`;

// Витрина: тот же код воркера, только upstream подменён на локальные «Pages».
const source = worker
  .replace(/const UPSTREAM = '[^']*';/, `const UPSTREAM = '${pagesURL}';`)
  .replace('export default', 'globalThis.__shell =');
const shellModule = { __shell: null };
new Function('globalThis', 'caches', 'fetch', 'Request', 'Response', 'Headers', 'URL', source)(
  shellModule,
  { default: { match: async () => undefined, put: async () => {} } },
  fetch, Request, Response, Headers, URL,
);
const shellHandler = shellModule.__shell;

const shell = http.createServer(async (request, response) => {
  const proxied = new Request(`http://127.0.0.1${request.url}`, { method: request.method });
  const result = await shellHandler.fetch(proxied, {}, { waitUntil: () => {} });
  const body = Buffer.from(await result.arrayBuffer());
  const headers = {};
  result.headers.forEach((value, name) => { headers[name] = value; });
  response.writeHead(result.status, headers);
  response.end(body);
});
await new Promise((resolve) => shell.listen(0, '127.0.0.1', resolve));
const shellLocal = `http://127.0.0.1:${shell.address().port}`;

const problems = [];

// Витрина не должна проговариваться об источнике ни телом, ни заголовками.
for (const route of ['/', '/index.html', '/install.html', '/manifest.webmanifest', '/sw.js']) {
  const response = await fetch(`${shellLocal}${route}`);
  if (!response.ok) { problems.push(`витрина отдала ${response.status} на ${route}`); continue; }
  const text = await response.text();
  if (/vidalost\.github\.io|github\.com/i.test(text)) {
    problems.push(`в ответе ${route} виден адрес GitHub`);
  }
  for (const [name, value] of response.headers) {
    if (/github/i.test(`${name}${value}`)) problems.push(`в заголовках ${route} виден GitHub: ${name}: ${value}`);
  }
  if (route === '/sw.js' && response.headers.get('service-worker-allowed') !== '/') {
    problems.push('работник получил не корневой охват — он не будет управлять приложением');
  }
  if ((route === '/' || route === '/index.html' || route === '/install.html' || route === '/sw.js')
      && !/no-cache/.test(response.headers.get('cache-control') || '')) {
    problems.push(`${route} отдаётся с кешированием — обновление до приложения не доедет`);
  }
}

const bundle = html.match(/web\/dist\/(app\.[a-f0-9]+\.js)/)?.[1];
const bundled = await fetch(`${shellLocal}/web/dist/${bundle}`);
if (!bundled.ok) problems.push(`витрина не отдала бандл приложения (${bundled.status})`);
else if (!/immutable/.test(bundled.headers.get('cache-control') || '')) {
  problems.push('бандл с хешем в имени отдаётся без долгого кеша');
}

pages.close();
shell.close();

// --- кнопка установки внутри Telegram -----------------------------------------
const site = http.createServer((request, response) => {
  const pathname = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname);
  const target = path.resolve(root, `.${pathname === '/' ? '/index.html' : pathname}`);
  if (!target.startsWith(root + path.sep) || !fs.existsSync(target) || !fs.statSync(target).isFile()) {
    response.writeHead(404).end('Not found');
    return;
  }
  response.writeHead(200, { 'Content-Type': mime.get(path.extname(target)) || 'application/octet-stream' });
  response.end(fs.readFileSync(target));
});
await new Promise((resolve) => site.listen(0, '127.0.0.1', resolve));
const baseURL = `http://127.0.0.1:${site.address().port}`;

const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROME_BIN || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
// iPhone внутри Telegram: именно этот случай и решает витрина.
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
  isMobile: true, hasTouch: true,
});
const page = await context.newPage();
await page.addInitScript(() => {
  window.__OPENED_LINKS__ = [];
  window.Telegram = {
    WebApp: {
      initData: 'query_id=stub&user=%7B%22id%22%3A5883903220%7D&hash=stub',
      initDataUnsafe: { user: { id: 5883903220, first_name: 'Тест' } },
      ready() {}, expand() {}, colorScheme: 'light', onEvent() {}, offEvent() {},
      openLink(url) { window.__OPENED_LINKS__.push(url); },
      MainButton: { show() {}, hide() {} }, BackButton: { show() {}, hide() {}, onClick() {} },
      HapticFeedback: { impactOccurred() {}, notificationOccurred() {} },
    },
  };
  try { localStorage.setItem('leaderboard_news_seen_v1', '1'); } catch { /* приватный режим */ }
});
const stub = (route) => route.fulfill({
  status: 200, contentType: 'application/json',
  body: JSON.stringify({ success: true, isBanned: false, lastGames: [], answered: true }),
});
// На GitHub telegram.org доступен, и настоящий SDK затирает поставленную
// здесь личность: тест начинает видеть чужое состояние и падает только в CI.
await page.route('https://telegram.org/**', (route) => route.fulfill({
  status: 200, contentType: 'text/javascript; charset=utf-8',
  body: 'window.Telegram=window.Telegram||{WebApp:{initData:"",initDataUnsafe:{},ready(){},expand(){}}};',
}));
for (const pattern of ['https://*.workers.dev/**', 'https://script.google.com/**', 'https://script.googleusercontent.com/**']) {
  await page.route(pattern, stub);
}
await page.goto(`${baseURL}/#tgWebAppData=query_id%3Dstub`, { waitUntil: 'commit', timeout: 30_000 });
await page.waitForSelector('#menu-container:not(.hidden)', { timeout: 25_000 });
await page.waitForTimeout(3000);

await page.evaluate(() => document.getElementById('more-entry')?.click());
await page.waitForTimeout(700);
if (!(await page.locator('#install-app-btn').count())) {
  problems.push('на iPhone внутри Telegram нет карточки установки — уйти в Safari неоткуда');
} else {
  await page.evaluate(() => document.getElementById('install-app-btn').click());
  await page.waitForTimeout(700);
  const sheet = await page.evaluate(() => document.getElementById('install-ios-sheet')?.innerText || '');
  if (!/Safari/.test(sheet)) problems.push('в подсказке не сказано, что ярлык умеет создавать только Safari');
  if (!(await page.locator('[data-install-safari]').count())) {
    problems.push('в подсказке нет кнопки, открывающей приложение в Safari');
  } else {
    await page.evaluate(() => document.querySelector('[data-install-safari]').click());
    await page.waitForTimeout(500);
    const opened = await page.evaluate(() => window.__OPENED_LINKS__ || []);
    if (!opened.length) problems.push('кнопка не увела в Safari');
    if (opened.length && /github/i.test(opened[0])) {
      problems.push(`в Safari уходит адрес с GitHub: ${opened[0]}`);
    }
    const expectedLink = `${shellUrl}/install.html`;
    if (opened.length && opened[0] !== expectedLink) {
      problems.push(`в Safari уходит ${opened[0]} вместо страницы установки ${expectedLink}`);
    }
  }
}

await browser.close();
site.close();

if (problems.length) {
  console.error(`Витрина приложения не в порядке (${problems.length}):\n  ${problems.join('\n  ')}`);
  process.exit(1);
}

console.log('Витрина в порядке: приложение отдаётся под своим адресом, её origin разрешён всеми воркерами, '
  + 'GitHub не виден ни в теле, '
  + 'ни в заголовках, страницы и работник не кешируются, работник получает корневой охват, '
  + 'из Telegram кнопка уводит в Safari на страницу установки, '
  + 'а поставленный с неё ярлык открывает игру, а не инструкцию.');
