// Проверяет одноразовый опрос о приложении.
//
// Четыре вещи, которые ломаются молча:
//
//   * опрос перестаёт быть одноразовым. Спросить мнение можно один раз; окно,
//     возвращающееся после перезапуска, — верный способ его не получить;
//   * его задают слишком рано. У человека, впервые открывшего приложение,
//     мнения ещё нет, а второй попытки не будет;
//   * два окна выходят одно поверх другого. Вопрос «откуда узнали» задаётся
//     первым, и опрос не должен на него наезжать;
//   * ответ не доходит до администратора. Тогда весь опрос бессмыслен: данные
//     лежат в базе, а человек, ради которого их собирали, их не видит.
//
// Дорога входа проверяется тоже: в Telegram запрос идёт с подписью initData,
// в веб-версии на главном экране — с токеном сессии. Рейтинг однажды слушал
// только первую и за пределами Telegram не работал вовсе.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';

const { chromium } = await import('playwright-core');
const root = path.resolve(process.cwd());
const USER_ID = '5883903220';

// --- 1. сервер: обе дороги входа и личность не из тела запроса ------------------
{
  const worker = fs.readFileSync(path.join(root, 'cloudflare/app-core-worker/src/index-v17.js'), 'utf8');
  assert.ok(/url\.pathname === '\/compat'/.test(worker) && /url\.pathname === '\/android\/compat'/.test(worker),
    'опрос обслуживает не обе дороги входа — за пределами Telegram его не будет');

  const session = worker.slice(worker.indexOf('async function identityFromSession'), worker.indexOf('async function notifyFeedbackAdmin'));
  assert.ok(/Authorization/.test(session) && /android-auth\/session/.test(session),
    'личность на дороге сессии берётся не из токена');
  assert.ok(/claimed !== userId/.test(session),
    'тело запроса может назвать чужой id, и сервер это примет');

  assert.ok(/if \(result\.created\)/.test(worker),
    'уведомление администратору уходит не только на первый ответ — повторный запрос задублирует письмо');

  const notify = worker.slice(worker.indexOf('async function notifyFeedbackAdmin'), worker.indexOf('async function callFeedbackStore'));
  assert.ok(/ADMIN_TELEGRAM_ID/.test(notify) && /opinion/.test(notify) && /wishes/.test(notify),
    'в сообщении администратору нет обоих ответов');

  // Уборка неактивных аккаунтов обязана забирать и отзывы, иначе они переживут
  // самого человека.
  const v6 = fs.readFileSync(path.join(root, 'cloudflare/app-core-worker/src/index-v6.js'), 'utf8');
  assert.ok(/DELETE FROM feedback_notes WHERE user_id/.test(v6),
    'отзывы не удаляются вместе с аккаунтом');

  const wrangler = fs.readFileSync(path.join(root, 'cloudflare/app-core-worker/wrangler.jsonc'), 'utf8');
  assert.ok(/"main":\s*"src\/index-v17\.js"/.test(wrangler),
    'воркер по-прежнему запускается со старого слоя — опроса на сервере не будет');
}

// --- 1.5. ответ свайпом: кому уйдёт ответ -----------------------------------------
//
// Разборщик решает, кому бот напишет от имени приложения, поэтому гоняется
// по-настоящему, а не сверяется регуляркой по исходнику.
{
  const { feedbackReplyTarget } = await import('../cloudflare/app-core-worker/src/feedback-reply-target.js');
  const notification = [
    '💡 Отзыв о приложении',
    'Пользователь: 302262405 · @somebody · Имя',
    '',
    'Что думает о приложении:',
    'Нравится',
    '',
    'Ответьте на это сообщение — ответ придёт человеку в бот.',
    'ID отзыва: fb_302262405',
  ].join('\n');

  assert.equal(feedbackReplyTarget({ from: { is_bot: true }, text: notification }), '302262405',
    'ответ на отзыв не находит, кому его отправить');

  // Сообщение бота можно переслать кому угодно: отвечать на пересланное нельзя,
  // иначе ответ от имени приложения отправит посторонний.
  assert.equal(feedbackReplyTarget({ from: { is_bot: false }, text: notification }), '',
    'ответ засчитан на сообщение человека, а не бота');

  // У поддержки свой разбор ниже по цепочке. Опасен случай, когда метку в своём
  // сообщении написал сам человек: без проверки заголовка ответ администратора
  // поддержке ушёл бы как ответ на отзыв — и не тому, кому он писал.
  assert.equal(feedbackReplyTarget({
    from: { is_bot: true },
    text: '🎧 Новое обращение в техподдержку\n№ sup_abc123def\n\n'
      + 'Пользователь пишет: «мне так и не ответили на ID отзыва: fb_302262405»',
  }), '', 'обращение в поддержку с упомянутой меткой принято за отзыв');

  assert.equal(feedbackReplyTarget({ from: { is_bot: true }, text: '💡 Отзыв о приложении\nбез метки' }), '',
    'отзыв без метки всё равно кому-то отвечает');
  assert.equal(feedbackReplyTarget({ from: { is_bot: true }, text: '💡 Отзыв о приложении\nID отзыва: fb_12' }), '',
    'слишком короткий id принят за Telegram ID');
  assert.equal(feedbackReplyTarget(null), '', 'обычное сообщение без ответа принято за ответ на отзыв');
}

// --- 1.6. сам обработчик ответа ------------------------------------------------------
{
  const worker = fs.readFileSync(path.join(root, 'cloudflare/app-core-worker/src/index-v17.js'), 'utf8');
  const handler = worker.slice(worker.indexOf('async function takeFeedbackReply'), worker.indexOf('function rememberUpdate'));

  // Подпись вебхука проверяет слой поддержки — но он ниже, и до перехваченного
  // здесь обновления уже не доберётся.
  assert.ok(/X-Telegram-Bot-Api-Secret-Token/.test(handler),
    'ответ на отзыв разбирается без проверки подписи вебхука — писать боту сможет кто угодно');
  assert.ok(/admin-role\/check/.test(handler) && /isAdmin !== true/.test(handler),
    'отвечать на отзыв может не только администратор');
  assert.ok(/rememberUpdate/.test(handler),
    'повторную доставку обновления Telegram отправит второй ответ');
  assert.ok(/feedback\/reply/.test(handler),
    'ответ не сохраняется — при сбое доставки он пропадёт');
  assert.ok(/Telegram не доставил/.test(handler),
    'администратору не сообщают, что ответ не дошёл');

  // Всё, что не ответ на отзыв, должно уходить дальше нетронутым: там команды
  // бота и вся техподдержка.
  assert.ok(/if \(taken\) return new Response\('OK'\);/.test(worker),
    'слой отвечает на вебхук сам, даже когда это не ответ на отзыв');
  assert.ok(/takeFeedbackReply\(request\.clone\(\)/.test(worker),
    'тело вебхука читается из самого запроса — слою поддержки достанется пустое');

  const notify = worker.slice(worker.indexOf('async function notifyFeedbackAdmin'), worker.indexOf('async function callFeedbackStore'));
  assert.ok(/ID отзыва: fb_/.test(notify),
    'в сообщении администратору нет метки, по которой ответ находит адресата');
  assert.ok(/Ответьте на это сообщение/.test(notify),
    'администратору не сказано, что на отзыв можно ответить');
}

// --- сервер для страницы ---------------------------------------------------------
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
await context.addInitScript(() => { window.__APP_TELEMETRY_DISABLED__ = true; });

const fail = async (message) => {
  await browser.close();
  server.close();
  console.error(`Проверка опроса не прошла: ${message}`);
  process.exit(1);
};

// Состояние «сервера»: кто ответил, что ушло администратору, о чём спрашивали.
const store = { answered: false, eligible: true, saved: null, adminMessages: [], statusCalls: 0 };

const TELEGRAM_SDK = `window.Telegram={WebApp:{initData:"user=%7B%22id%22%3A${USER_ID}%7D&hash=qa",`
  + `initDataUnsafe:{user:{id:${USER_ID},username:"root",first_name:"Root"}},ready(){},expand(){},`
  + 'setHeaderColor(){},setBackgroundColor(){},enableClosingConfirmation(){},openTelegramLink(){},openLink(){},'
  + 'disableVerticalSwipes(){},HapticFeedback:{impactOccurred(){},notificationOccurred(){},selectionChanged(){}}}};';

/**
 * Подставляет обе дороги сразу: отвечает как воркер и запоминает, с чем пришёл
 * запрос, — чтобы проверить и подпись, и токен.
 */
function handle(route) {
  const request = route.request();
  let body = {};
  try { body = JSON.parse(request.postData() || '{}'); } catch { /* не наш запрос */ }
  const payload = body?.payload || body || {};
  const action = String(payload.action || '');
  const answer = (value) => route.fulfill({
    status: 200, contentType: 'application/json; charset=utf-8', body: JSON.stringify(value),
  });

  if (action === 'feedbackStatus') {
    store.statusCalls += 1;
    return answer({ ok: true, success: true, answered: store.answered, eligible: !store.answered && store.eligible });
  }
  if (action === 'feedbackSubmit') {
    const created = !store.answered;
    if (created) {
      store.answered = true;
      store.saved = {
        opinion: String(payload.opinion || ''),
        wishes: String(payload.wishes || ''),
        url: request.url(),
        auth: request.headers().authorization || '',
      };
      // Так же, как воркер: письмо администратору уходит только на первый ответ.
      store.adminMessages.push(`Пользователь: ${USER_ID}\n${store.saved.opinion}\n${store.saved.wishes}`);
    }
    return answer({ ok: true, success: true, created, answered: true });
  }
  if (action === 'referralStatus') return answer({ ok: true, success: true, answered: true });
  if (action === 'adminRoleStatus') return answer({ success: true, isAdmin: false, isRoot: false });
  return answer({ success: true, isBanned: false, lastGames: [] });
}

async function openApp({ telegram = true, session = false } = {}) {
  const page = await context.newPage();
  page.on('pageerror', (error) => { console.error('Исключение на странице:', String(error?.message || error)); });
  await page.route('https://telegram.org/**', (route) => route.fulfill({
    status: 200, contentType: 'text/javascript; charset=utf-8',
    body: telegram ? TELEGRAM_SDK
      : 'window.Telegram={WebApp:{initData:"",initDataUnsafe:{},ready(){},expand(){},setHeaderColor(){},'
        + 'setBackgroundColor(){},enableClosingConfirmation(){},openTelegramLink(){},openLink(){},'
        + 'disableVerticalSwipes(){},HapticFeedback:{impactOccurred(){},notificationOccurred(){},selectionChanged(){}}}};',
  }));
  for (const pattern of ['https://script.google.com/**', 'https://script.googleusercontent.com/**', 'https://*.workers.dev/**']) {
    await page.route(pattern, handle);
  }
  if (session) {
    await page.addInitScript((id) => {
      localStorage.setItem('web_session_v1', JSON.stringify({
        token: `bgs_${'a'.repeat(48)}`, userId: id, expiresAt: Date.now() + 86_400_000,
      }));
    }, USER_ID);
  }
  await page.goto(baseURL, { waitUntil: 'commit', timeout: 30_000 });
  await page.waitForSelector('#menu-container:not(.hidden)', { timeout: 25_000 });
  await page.waitForTimeout(3200);
  return page;
}

// --- 2. окно приходит само и спрашивает ровно то, что просили ---------------------
const page = await openApp();
if (!(await page.locator('#feedback-survey-overlay').count())) {
  await fail('опрос не появился сам, хотя человек играет уже несколько дней');
}
const asked = await page.evaluate(() => ({
  text: document.getElementById('feedback-survey-overlay')?.innerText || '',
  opinion: Boolean(document.getElementById('feedback-survey-opinion')),
  wishes: Boolean(document.getElementById('feedback-survey-wishes')),
}));
if (!asked.opinion) await fail('в опросе нет поля для мнения о приложении');
if (!asked.wishes) await fail('в опросе нет поля «что добавить или изменить»');
if (!/добавил|изменил/i.test(asked.text)) await fail('второй вопрос задан не про изменения');
if (!/разработчик/i.test(asked.text)) await fail('человеку не сказано, кому уйдёт ответ');

// --- 3. пустой ответ не отправляется ---------------------------------------------
await page.evaluate(() => document.querySelector('.feedback-survey-submit').click());
await page.waitForTimeout(600);
if (store.saved) await fail('пустой ответ ушёл на сервер');
if (!(await page.locator('#feedback-survey-overlay').count())) await fail('окно закрылось, не отправив ответ');

// --- 4. ответ уходит и доезжает до администратора ---------------------------------
await page.evaluate(() => {
  document.getElementById('feedback-survey-opinion').value = 'Играю каждый день, очень нравится';
  document.getElementById('feedback-survey-wishes').value = 'Добавьте игру про притчи';
  document.querySelector('.feedback-survey-submit').click();
});
await page.waitForTimeout(1500);
if (!store.saved) await fail('ответ не ушёл на сервер');
if (!/нравится/.test(store.saved.opinion)) await fail('мнение до сервера не доехало');
if (!/притчи/.test(store.saved.wishes)) await fail('пожелание до сервера не доехало');
if (store.adminMessages.length !== 1) {
  await fail(`администратору ушло ${store.adminMessages.length} сообщений вместо одного`);
}
if (await page.locator('#feedback-survey-overlay').count()) await fail('после отправки окно не закрылось');

// --- 5. второй раз не спрашивают ---------------------------------------------------
await page.close();
const again = await openApp();
if (await again.locator('#feedback-survey-overlay').count()) {
  await fail('опрос показался второй раз — он должен быть одноразовым');
}
await again.close();

// --- 6. новичка не спрашивают -------------------------------------------------------
store.answered = false;
store.eligible = false;
const fresh = await openApp();
if (await fresh.locator('#feedback-survey-overlay').count()) {
  await fail('опрос вышел к новичку, хотя мнения у него ещё нет');
}
await fresh.close();

// --- 7. не наезжает на вопрос «откуда узнали» ----------------------------------------
store.eligible = true;
const busy = await context.newPage();
await busy.route('https://telegram.org/**', (route) => route.fulfill({
  status: 200, contentType: 'text/javascript; charset=utf-8', body: TELEGRAM_SDK,
}));
for (const pattern of ['https://script.google.com/**', 'https://script.googleusercontent.com/**', 'https://*.workers.dev/**']) {
  await busy.route(pattern, (route) => {
    let body = {};
    try { body = JSON.parse(route.request().postData() || '{}'); } catch { /* не наш запрос */ }
    const action = String((body?.payload || body || {}).action || '');
    // Здесь вопрос «откуда узнали» ещё не отвечен и займёт экран первым.
    if (action === 'referralStatus') {
      return route.fulfill({ status: 200, contentType: 'application/json; charset=utf-8', body: JSON.stringify({ ok: true, success: true, answered: false }) });
    }
    return handle(route);
  });
}
await busy.goto(baseURL, { waitUntil: 'commit', timeout: 30_000 });
await busy.waitForSelector('#menu-container:not(.hidden)', { timeout: 25_000 });
await busy.waitForTimeout(3200);
if (!(await busy.locator('#referral-survey-overlay').count())) {
  await fail('вопрос «откуда узнали» не показался — проверить наложение не на чем');
}
if (await busy.locator('#feedback-survey-overlay').count()) {
  await fail('опрос вышел поверх вопроса «откуда узнали»');
}
await busy.close();

// --- 8. в веб-версии на главном экране опрос тоже работает -----------------------------
store.answered = false;
store.saved = null;
store.adminMessages.length = 0;
const outside = await openApp({ telegram: false, session: true });
if (!(await outside.locator('#feedback-survey-overlay').count())) {
  await fail('вне Telegram опрос не показывается, хотя вход в профиль есть');
}
await outside.evaluate(() => {
  document.getElementById('feedback-survey-opinion').value = 'С айфона играть удобно';
  document.querySelector('.feedback-survey-submit').click();
});
await outside.waitForTimeout(1500);
if (!store.saved) await fail('вне Telegram ответ не ушёл на сервер');
if (!store.saved.url.includes('/android/compat')) {
  await fail(`вне Telegram ответ ушёл на ${store.saved.url} вместо /android/compat`);
}
if (!/^Bearer bgs_/.test(store.saved.auth)) await fail('вне Telegram ответ ушёл без токена сессии');
if (store.adminMessages.length !== 1) await fail('вне Telegram администратор не получил сообщение');
await outside.close();

console.log('Опрос о приложении в порядке: приходит сам после нескольких дней игры, '
  + 'спрашивает мнение и пожелания, пустой ответ не отправляет, доезжает до администратора '
  + 'ровно одним сообщением, второй раз не показывается, новичка не трогает, '
  + 'не наезжает на вопрос «откуда узнали», работает вне Telegram по токену сессии, '
  + 'а на сам отзыв можно ответить свайпом — и ответ уходит только тому, чей это отзыв.');

await browser.close();
server.close();
