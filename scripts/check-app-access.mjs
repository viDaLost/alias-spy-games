import assert from 'node:assert/strict';
import { createHmac, createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { register } from 'node:module';
import { deflateSync } from 'node:zlib';
import { JSDOM } from 'jsdom';
register('./lib/cloudflare-workers-loader.mjs', import.meta.url);
const { default: worker, UserStore } = await import('../cloudflare/app-core-worker/src/index-v18.js');
const { requireAppAccess, allowAppSocket } = await import('../cloudflare/shared/app-access.js');
const { restrictedBotReply } = await import('../cloudflare/app-core-worker/src/restricted-bot.js');

const db = new DatabaseSync(':memory:');
const storage = {
  sql: { exec(query, ...values) {
    if (!values.length && /;\s*\S/.test(query.trim().replace(/;$/, ''))) { db.exec(query); return { toArray: () => [] }; }
    const statement = db.prepare(query);
    const rows = statement.columns().length ? statement.all(...values) : (statement.run(...values), []);
    return { toArray: () => rows, [Symbol.iterator]: () => rows[Symbol.iterator]() };
  } },
  get: async () => undefined, list: async () => new Map(), put: async () => {},
  transactionSync: (fn) => fn(),
};
const env = { TELEGRAM_BOT_TOKEN: 'app-access-tests-only', ADMIN_TELEGRAM_ID: '1288379477', APP_RESTRICTED: 'true', ALLOWED_ORIGINS: 'https://vidalost.github.io' };
const ctx = { storage, waitUntil() {} };
let store = new UserStore(ctx, env);
env.USERS = { idFromName: (name) => name, get: () => ({ fetch: (url, init) => store.fetch(new Request(url, init)) }) };
await store.syncUser({ verifiedUser: { id: '555555555' }, clientUser: { wowStars: 42, swLevel: 7 } });
await store.syncUser({ verifiedUser: { id: '666666666' }, clientUser: {} });
await store.adminRoleGrant({ actorId: env.ADMIN_TELEGRAM_ID, targetId: '666666666' });

function signed(id, age = 0) {
  const params = new URLSearchParams({ auth_date: String(Math.floor(Date.now() / 1000) - age), user: JSON.stringify({ id: Number(id) }) });
  const text = [...params].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join('\n');
  const secret = createHmac('sha256', 'WebAppData').update(env.TELEGRAM_BOT_TOKEN).digest();
  params.set('hash', createHmac('sha256', secret).update(text).digest('hex'));
  return params.toString();
}
async function request(path, body, token) {
  const response = await worker.fetch(new Request(`https://core.test${path}`, {
    method: body ? 'POST' : 'GET', headers: { Origin: env.ALLOWED_ORIGINS, ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  }), env, ctx);
  return { status: response.status, data: await response.json() };
}
const compat = (id, action, extra = {}) => request('/compat', { telegramInitData: signed(id), payload: { action, ...extra } });
const timeBefore = Date.now();
const timeResponse = await worker.fetch(new Request('https://core.test/app/time', {
  headers: { Origin: 'https://standalone.test' },
}), {}, {});
assert.equal(timeResponse.status, 200);
assert.equal(timeResponse.headers.get('Cache-Control'), 'no-store');
assert.equal(timeResponse.headers.get('Access-Control-Allow-Origin'), '*');
const timeData = await timeResponse.json();
assert.deepEqual(Object.keys(timeData), ['now']);
assert.ok(timeData.now >= timeBefore && timeData.now <= Date.now(), 'public time comes from the worker clock');

const policy = globalThis.SabbathClock;
const weekly = store.sabbath;
const [moscow, berlin, kyiv] = policy.CITIES;
const player = '555555555';
const wedMoscow = Date.parse('2026-11-24T21:00Z');
const week = policy.FIRST_WEEK;
assert.equal(weekly.status(player,moscow.timeZone,wedMoscow-1).pending,false);
assert.equal(weekly.status(player,moscow.timeZone,wedMoscow).pending,true,'Wednesday starts at local midnight');
assert.equal(weekly.status(player,'Pacific/Honolulu',wedMoscow).place.timeZone,'Europe/Moscow','device zone cannot change the due weekly prompt');
const late = Date.parse('2026-11-26T12:00Z');
const first = weekly.confirm(player,{week,city:berlin},late);
assert.equal(first.status,200);
assert.equal(first.data.sabbath.pending,false);
assert.equal(first.data.sabbath.city.timeZone,'Europe/Berlin');
assert.equal(first.data.sabbath.place.timeZone,'Europe/Moscow','late confirmation keeps the already fixed schedule');
assert.ok(first.data.sabbath.lockedUntil >= policy.weekWindow(week,berlin).end);
assert.equal(weekly.confirm(player,{week,city:kyiv},late).status,409,'second city cannot replace the confirmed one');
assert.equal(weekly.confirm(player,{week,city:berlin},late).status,200,'retrying same city is idempotent');
const nextWeek = week + 7*policy.dayMs;
const nextWed = Date.parse('2026-12-02T12:00Z');
assert.equal(weekly.status(player,moscow.timeZone,nextWed).pending,true);
assert.equal(weekly.confirm(player,{week:nextWeek,city:berlin},nextWed).status,200);
assert.equal(weekly.read(player).changes,0,'reconfirming the same city is not a change');
assert.equal(weekly.confirm(player,{week:nextWeek,city:kyiv},nextWed).status,409);
const thirdWeek = nextWeek + 7*policy.dayMs;
const thirdWed = Date.parse('2026-12-09T12:00Z');
assert.equal(weekly.confirm(player,{week:thirdWeek,city:kyiv},thirdWed).status,200);
assert.equal(weekly.report(0,thirdWed).users[0].changes,1);
const missed = '666666666';
assert.equal(weekly.status(missed,'Asia/Tokyo',Date.parse('2026-12-06T10:00Z')).pending,true,'late account login still receives the reminder');
assert.equal(weekly.confirm(missed,{week:nextWeek,city:moscow},Date.parse('2026-12-06T10:00Z')).status,200);
const afterAudit = Date.parse('2027-01-06T12:00Z');
assert.equal(weekly.confirm(player,{week:policy.weekFor(afterAudit,kyiv.timeZone),city:moscow},afterAudit).status,200);
assert.equal(weekly.read(player).changes,1,'audit stops after the 30 day period');
assert.equal((await request('/sabbath/report', {telegramInitData:signed('666666666')})).status,403);
assert.equal((await request('/sabbath/report', {userId:env.ADMIN_TELEGRAM_ID})).status,401);
const weeklyReport = await request('/sabbath/report', {telegramInitData:signed(env.ADMIN_TELEGRAM_ID)});
assert.equal(weeklyReport.status,200);
assert.equal(weeklyReport.data.users[0].id,player);
assert.equal(weeklyReport.data.users[0].latitude,undefined,'the admin table only receives city names and counts');
assert.equal((await request('/app/access', {telegramInitData:signed(env.ADMIN_TELEGRAM_ID),sabbathTimeZone:'Asia/Tokyo'})).data.sabbath.place.timeZone,'Asia/Tokyo');

const original = JSON.stringify(store.getRow('555555555'));
assert.equal((await request('/app/access?userId=1288379477')).data.allowed, false);
assert.equal((await request('/app/access', { telegramInitData: signed(env.ADMIN_TELEGRAM_ID) })).data.isRoot, true);
assert.equal((await request('/app/access', { telegramInitData: signed('555555555') })).data.allowed, false);
assert.equal((await request('/app/access', { telegramInitData: signed('666666666') })).data.allowed, false, 'delegated admin must be restricted');
assert.equal((await request('/app/access', { telegramInitData: signed(env.ADMIN_TELEGRAM_ID).replace(/hash=./, 'hash=x') })).status, 401);
assert.equal((await request('/app/access', { telegramInitData: signed(env.ADMIN_TELEGRAM_ID, 90000) })).status, 401);
assert.equal((await compat('555555555', 'appAccessGrant', { targetId: '555555555', adminId: env.ADMIN_TELEGRAM_ID })).status, 403);
assert.equal((await compat('666666666', 'appAccessGrant', { targetId: '555555555' })).status, 403);
assert.equal((await compat(env.ADMIN_TELEGRAM_ID, 'appAccessGrant', { targetId: 'invalid' })).status, 400);
assert.equal((await compat(env.ADMIN_TELEGRAM_ID, 'appAccessRevoke', { targetId: env.ADMIN_TELEGRAM_ID })).status, 400);
assert.equal((await request('/compat', { telegramInitData: signed(env.ADMIN_TELEGRAM_ID, 1801), payload: { action: 'appAccessGrant', targetId: '555555555' } })).status, 401);
const deniedSync = await compat('555555555', 'syncUser', { user: { id: '555555555', wowStars: 0, swLevel: 0 } });
assert.equal(deniedSync.data.isBanned, true, 'legacy clients must see restricted status');
assert.equal(deniedSync.data.wowStars, undefined, 'restriction must not replace progress with defaults');
assert.equal((await compat('555555555', 'mutateBmtStars', { id: '555555555', delta: 999 })).status, 403);
assert.equal(JSON.stringify(store.getRow('555555555')), original, 'blocking must not modify profile');
assert.equal((await compat(env.ADMIN_TELEGRAM_ID, 'appAccessGrant', { targetId: '555555555' })).data.users[0].userId, '555555555');
assert.equal((await request('/app/access', { telegramInitData: signed('555555555') })).data.allowed, true);
assert.equal((await store.adminRoleCheck({ userId: '555555555' })).isAdmin, false, 'exception must not grant admin rights');
store = new UserStore(ctx, env);
assert.equal((await store.applicationAccess('555555555')).allowed, true, 'exception must survive object restart');
db.prepare('UPDATE users SET is_banned = 1 WHERE telegram_id = ?').run('555555555');
assert.equal((await store.applicationAccess('555555555')).allowed, false, 'exception must not bypass an existing account ban');
db.prepare('UPDATE users SET is_banned = 0 WHERE telegram_id = ?').run('555555555');
const token = `bgs_${'s'.repeat(64)}`;
db.prepare('INSERT INTO android_sessions VALUES (?, ?, ?, ?, ?, 0)').run(createHash('sha256').update(token).digest('hex'), '555555555', Date.now(), Date.now() + 60000, Date.now());
assert.equal((await compat('666666666', 'syncGameWallet')).status, 403);
assert.equal((await compat('555555555', 'syncGameWallet', { id: '666666666' })).status, 403);
assert.equal((await request('/compat', { payload: { action: 'syncGameWallet' } })).status, 401);
await store.syncUser({ verifiedUser: { id: '555555555' }, clientUser: { wsStars: 19 } });
await compat('555555555', 'syncBmtStars', { balance: 19 });
const wallet = await compat('555555555', 'syncGameWallet');
assert.equal(wallet.status, 200);
assert.equal(wallet.data.bmtStars, 61, 'mirror of Word Search is merged once with Biblical Words');
const purchase = { mutationId: 'bmt_test_1234567890', delta: -6, expectedRevision: wallet.data.revision, reason: 'test hint' };
assert.equal((await compat('555555555', 'mutateBmtStars', purchase)).data.bmtStars, 55);
assert.equal((await compat('555555555', 'mutateBmtStars', purchase)).data.bmtStars, 55, 'replayed purchase must charge once');
const fromWeb = await request('/android/compat', { payload: { action: 'syncGameWallet' } }, token);
assert.equal(fromWeb.data.bmtStars, 55, 'both account clients see one balance');
assert.equal((await store.adminUsersBriefV2({ ids: ['555555555'] })).users[0].unifiedWallet, true);
assert.equal(store.readUser('555555555').unifiedWallet, true);
db.prepare('UPDATE users SET ws_stars = ? WHERE telegram_id = ?').run(JSON.parse(original).ws_stars, '555555555');
db.prepare('UPDATE users SET updated_at = ?, last_seen_at = ? WHERE telegram_id = ?').run(JSON.parse(original).updated_at, JSON.parse(original).last_seen_at, '555555555');
assert.equal((await request('/android/access', null, token)).data.isBanned, false);
assert.equal((await compat(env.ADMIN_TELEGRAM_ID, 'appAccessRevoke', { targetId: '555555555' })).status, 200);
assert.equal((await request('/android/access', null, token)).data.isBanned, true);
assert.equal((await request('/android/access')).status, 401);
assert.equal((await request('/android/compat', { androidUserId: env.ADMIN_TELEGRAM_ID, payload: { action: 'syncUser', user: { id: env.ADMIN_TELEGRAM_ID } } }, token)).data.isBanned, true);
assert.equal(JSON.stringify(store.getRow('555555555')), original);
await assert.rejects(() => requireAppAccess({}, `tg:${env.ADMIN_TELEGRAM_ID}`), /недоступна/);
await assert.rejects(() => requireAppAccess({ APP_ACCESS: { check: async () => ({ allowed: false }) } }, 'guest:any'), /заблокированы/);
let closed = false;
assert.equal(await allowAppSocket({ APP_ACCESS: { check: async () => ({ allowed: false }) } }, { send() {}, close() { closed = true; } }, 'tg:555555555'), false);
assert.equal(closed, true, 'existing sockets must close after revocation');
const realFetch = globalThis.fetch;
const replies = [];
let deliveryFails = false;
let widgetFailure = null;
globalThis.fetch = async (url, init) => {
  replies.push({ url, body: JSON.parse(init.body) });
  if (url.endsWith('/getMe')) return Response.json({ ok: true, result: { username: 'FavoritesTestBot' } });
  if (widgetFailure && url.endsWith('/sendWidget')) {
    return Response.json({ ok: false, ...widgetFailure }, { status: widgetFailure.error_code });
  }
  return Response.json({ ok: !deliveryFails }, { status: deliveryFails ? 502 : 200 });
};
const webhookSecret = createHash('sha256').update(env.TELEGRAM_BOT_TOKEN).digest('hex');
let updateId = 60000;
function webhook(update, secret = webhookSecret) {
  return new Request('https://core.test/telegram/webhook', { method: 'POST', headers: { 'X-Telegram-Bot-Api-Secret-Token': secret, 'Content-Type': 'application/json' }, body: JSON.stringify({ update_id: ++updateId, ...update }) });
}
const message = { chat: { id: 555555555, type: 'private' }, from: { id: 555555555 } };
try {
  for (const content of [{ text: '/start' }, { text: '/help' }, { text: '/support' }, { text: 'любое обращение' }, { photo: [{ file_id: 'test' }] }, { sticker: { file_id: 'test' } }]) {
    assert.equal((await worker.fetch(webhook({ message: { ...message, ...content } }), env, ctx)).status, 200);
    assert(replies.at(-1).body.text.includes('1 Коринфянам 10:23'));
    assert(replies.at(-1).body.text.includes('1 Коринфянам 14:40'));
    assert(replies.at(-1).body.text.includes('временно заблокированы'));
    assert.equal(replies.at(-1).body.chat_id, '555555555');
  }
  assert.equal((await worker.fetch(webhook({ edited_message: { ...message, text: 'изменено' } }), env, ctx)).status, 200);
  assert.equal((await worker.fetch(webhook({ callback_query: { id: 'test-callback', from: message.from, message } }), env, ctx)).status, 200);
  const duplicate = webhook({ message: { ...message, text: '/start' } });
  await worker.fetch(duplicate.clone(), env, ctx);
  const count = replies.length;
  await worker.fetch(duplicate.clone(), env, ctx);
  assert.equal(replies.length, count, 'Telegram retry must not duplicate an already delivered reply');
  assert.equal((await worker.fetch(webhook({ message }, 'forged'), env, ctx)).status, 403);
  const retry = webhook({ message: { ...message, text: 'retry' } });
  deliveryFails = true;
  assert.equal((await worker.fetch(retry.clone(), env, ctx)).status, 502);
  deliveryFails = false;
  assert.equal((await worker.fetch(retry.clone(), env, ctx)).status, 200, 'failed delivery must be retryable');
  assert.equal(await restrictedBotReply(webhook({ message: { chat: { id: Number(env.ADMIN_TELEGRAM_ID), type: 'private' }, from: { id: Number(env.ADMIN_TELEGRAM_ID) }, text: '/help' } }), env), null);

  const owner = Number(env.ADMIN_TELEGRAM_ID);
  const ownerChat = { chat: { id: owner, type: 'private' }, from: { id: owner } };
  const pending = [];
  async function botUpdate(update, secret) {
    const result = await worker.fetch(webhook(update, secret), env, { waitUntil: (promise) => pending.push(promise) });
    await Promise.all(pending.splice(0));
    return result;
  }

  const empty = await botUpdate({ message: { ...ownerChat, text: '/favorites' } });
  assert.equal(empty.status, 200);
  assert(replies.at(-1).url.endsWith('/sendWidget'));
  assert.deepEqual(JSON.parse(replies.at(-1).body.chat_data), { favorites: [], lastGame: '' });
  assert.equal(replies.at(-1).body.reply_markup.inline_keyboard[0][0].url,
    'https://t.me/FavoritesTestBot?startapp=lang_ru');

  const games = ['quartet', 'bible-geography', 'twelve-tribes', 'alias'];
  const saved = await compat(owner, 'profileSetFavorites', { favorites: [...games, 'kingdoms', 'invalid'] });
  assert.deepEqual(saved.data.favorites, games);
  await compat(owner, 'profileTrackGame', { game: 'alias' });
  for (const lang of ['ru', 'en', 'de', 'es']) {
    await botUpdate({ message: { ...ownerChat, text: `/start favorites_${lang}` } });
    const { url, body: widget } = replies.at(-1);
    assert(url.endsWith('/sendWidget'));
    assert.equal(widget.chat_id, String(owner));
    assert.equal(widget.protect_content, true);
    assert.deepEqual(JSON.parse(widget.chat_data), { favorites: games, lastGame: 'alias' });
    assert.equal(widget.allow_queries, true);
    assert(Buffer.byteLength(widget.html) <= 32768 && deflateSync(widget.html, { level: 9 }).length <= 4096, lang);
    assert(widget.html.includes('https://t.me/FavoritesTestBot?startapp=favorites'));
  }
  const { html } = replies.at(-1).body;
  let refreshData = { favorites: [...games, 'bible-wow'], lastGame: 'alias' };
  let opened = '';
  const dom = new JSDOM(html, {
    runScripts: 'dangerously',
    url: 'https://widget.test/',
    beforeParse(window) {
      window.TelegramWidget = {
        chatData: JSON.stringify(refreshData),
        ready() {},
        openTelegramLink(url) { opened = url; },
        async request(data) {
          assert.equal(data, 'favorite_games_v2');
          return { result: JSON.stringify(refreshData) };
        },
      };
    },
  });
  try {
    const { document } = dom.window;
    assert.equal(document.querySelectorAll('#games a').length, 4);
    assert.equal(document.querySelector('.game').href, 'https://t.me/FavoritesTestBot?startapp=game_quartet');
    document.querySelector('.game').click();
    assert.equal(opened, 'https://t.me/FavoritesTestBot?startapp=game_quartet');
    document.getElementById('recent').click();
    assert.equal(opened, 'https://t.me/FavoritesTestBot?startapp=game_alias');
    document.getElementById('next').click();
    assert.equal(document.querySelectorAll('#games a').length, 1);
    assert.equal(document.getElementById('page').textContent, '2 / 2');
    document.getElementById('catalog').click();
    assert.equal(document.getElementById('page').textContent, '1 / 5');
    document.getElementById('favorites').click();
    refreshData = { favorites: ['twelve-tribes', 'toString', 'twelve-tribes'], lastGame: 'removed' };
    await new Promise((resolve) => setImmediate(resolve));
    document.getElementById('refresh').click();
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(document.querySelector('.game').href, 'https://t.me/FavoritesTestBot?startapp=game_twelve-tribes');
    assert.equal(document.getElementById('pages').hidden, true);
    assert.equal(document.getElementById('status').hidden, false);
    assert.equal(document.getElementById('recent').hidden, true);
    assert.equal(document.querySelectorAll('#games a').length, 1);
    assert.equal(dom.window.localStorage.getItem('games-state'), JSON.stringify(refreshData));
  } finally {
    dom.window.close();
  }

  await compat(owner, 'profileSetFavorites', { favorites: ['bible-wow'] });
  const query = { id: '8123456789012345678', data: 'favorite_games_v1', ...ownerChat };
  await botUpdate({ widget_query: query });
  assert(replies.at(-1).url.endsWith('/answerWidgetQuery'));
  assert.equal(replies.at(-1).body.widget_query_id, query.id);
  assert.deepEqual(JSON.parse(replies.at(-1).body.data), ['bible-wow']);

  const delegated = 666666666;
  await compat(owner, 'appAccessGrant', { targetId: String(delegated) });
  assert.equal((await request('/app/access', { telegramInitData: signed(delegated) })).data.allowed, true);
  const delegatedChat = { chat: { id: delegated, type: 'private' }, from: { id: delegated } };
  await compat(delegated, 'profileSetFavorites', { favorites: ['quartet'] });
  await botUpdate({ message: { ...delegatedChat, text: '/favorites', is_topic_message: true, message_thread_id: 3 } });
  assert(replies.at(-1).url.endsWith('/sendWidget'));
  assert.equal(replies.at(-1).body.message_thread_id, 3);
  assert.deepEqual(JSON.parse(replies.at(-1).body.chat_data), { favorites: ['quartet'], lastGame: '' });
  const modernQuery = { ...query, ...delegatedChat, data: 'favorite_games_v2' };
  await botUpdate({ widget_query: modernQuery });
  assert.deepEqual(JSON.parse(replies.at(-1).body.data), { favorites: ['quartet'], lastGame: '' });

  const beforeUnauthorized = replies.length;
  await botUpdate({ widget_query: { ...modernQuery, chat: ownerChat.chat } });
  await botUpdate({ widget_query: { ...query, chat: { id: owner, type: 'group' } } });
  assert.equal((await botUpdate({ widget_query: query }, 'forged')).status, 403);
  assert(!replies.slice(beforeUnauthorized).some(({ url }) => /\/(sendWidget|answerWidgetQuery)$/.test(url)));
  await botUpdate({ widget_query: { ...modernQuery, ...message } });
  assert(replies.at(-1).url.endsWith('/answerWidgetQuery'));
  assert.equal(replies.at(-1).body.data, undefined, 'a blocked user receives no profile data');

  for (const [code, description] of [
    [400, 'Bad Request: INPUT_MEDIA_WIDGET_HTML_INVALID'],
    [403, 'Forbidden'],
    [404, 'Not Found'],
  ]) {
    widgetFailure = { error_code: code, description };
    await botUpdate({ message: { ...ownerChat, text: '/favorites' } });
    const [attempt, fallback] = replies.slice(-2);
    assert(attempt.url.endsWith('/sendWidget'));
    assert(fallback.url.endsWith('/sendMessage'));
    assert(fallback.body.text.includes('Избранное'));
    assert.equal(fallback.body.protect_content, true);
    const keyboard = fallback.body.reply_markup.inline_keyboard;
    assert.equal(keyboard[0][0].url, 'https://t.me/FavoritesTestBot?startapp=game_alias');
    assert.equal(keyboard[1][1].callback_data, 'favorite_menu:ru:catalog:0');
    assert.equal(keyboard[2][0].url, 'https://t.me/FavoritesTestBot?startapp=game_bible-wow');
    assert.equal(keyboard.at(-1)[0].callback_data, 'favorite_menu:ru:edit:0');
  }

  widgetFailure = { error_code: 400, description: 'Bad Request: INPUT_MEDIA_WIDGET_NOT_ALLOWED' };
  await botUpdate({ message: { ...ownerChat, text: '/favorites' } });
  assert(replies.at(-2).url.endsWith('/sendWidget'));
  assert(replies.at(-1).url.endsWith('/sendMessage'));
  const beforeCooldown = replies.length;
  await botUpdate({ message: { ...delegatedChat, text: '/favorites' } });
  assert.deepEqual(replies.slice(beforeCooldown).map(({ url }) => url.split('/').at(-1)), ['sendMessage']);
  assert.equal(replies.at(-1).body.reply_markup.inline_keyboard[1][0].url, 'https://t.me/FavoritesTestBot?startapp=game_quartet');
  widgetFailure = null;
  const realNow = Date.now;
  try {
    Date.now = () => realNow() + 5 * 60 * 1000;
    await botUpdate({ message: { ...ownerChat, text: '/favorites' } });
    assert(replies.at(-1).url.endsWith('/sendWidget'));
  } finally {
    Date.now = realNow;
  }

  const callback = { id: 'favorite-callback', from: ownerChat.from,
    message: { chat: ownerChat.chat, message_id: 42 }, data: 'favorite_menu:ru:catalog:1' };
  await botUpdate({ callback_query: { ...callback, data: 'favorite_menu:ru:buttons:0',
    message: { ...callback.message, is_topic_message: true, message_thread_id: 3 } } });
  const [buttons, buttonsAnswer] = replies.slice(-2);
  assert(buttons.url.endsWith('/sendMessage'));
  assert.equal(buttons.body.message_thread_id, 3);
  assert.equal(buttons.body.protect_content, true);
  assert.equal(buttons.body.reply_markup.inline_keyboard[2][0].url, 'https://t.me/FavoritesTestBot?startapp=game_bible-wow');
  assert(buttonsAnswer.url.endsWith('/answerCallbackQuery'));
  await botUpdate({ callback_query: callback });
  const [edit, answer] = replies.slice(-2);
  assert(edit.url.endsWith('/editMessageText'));
  assert.equal(edit.body.message_id, 42);
  assert(edit.body.text.includes('Все игры · 2/5'));
  assert.equal(edit.body.reply_markup.inline_keyboard[2][0].url, 'https://t.me/FavoritesTestBot?startapp=game_spy');
  assert(answer.url.endsWith('/answerCallbackQuery'));
  assert.equal(answer.body.callback_query_id, callback.id);

  const playerCallback = { id: 'favorite-edit', from: delegatedChat.from,
    message: { chat: delegatedChat.chat, message_id: 43 }, data: 'favorite_menu:ru:edit:1' };
  await botUpdate({ callback_query: playerCallback });
  const editKeyboard = () => replies.at(-2).body.reply_markup.inline_keyboard;
  assert(replies.at(-2).url.endsWith('/editMessageText'));
  assert.equal(replies.at(-2).body.message_id, 43);
  assert(replies.at(-2).body.text.includes('Изменить избранное · 2/5'));
  const addSpy = editKeyboard()[0][0];
  assert.equal(addSpy.text, '☆ Соглядатай');
  assert.equal(addSpy.callback_data, 'favorite_menu:ru:edit:1:1:spy');
  assert.equal(editKeyboard()[1][0].text, '★ Квартет');
  await botUpdate({ callback_query: { ...playerCallback, data: addSpy.callback_data } });
  const removeSpy = editKeyboard()[0][0];
  assert.equal(removeSpy.callback_data, 'favorite_menu:ru:edit:1:0:spy');
  assert.equal(removeSpy.text, '★ Соглядатай');
  await botUpdate({ callback_query: { ...playerCallback, data: addSpy.callback_data } });
  assert.deepEqual(store.readProfile(String(delegated)).favorites, ['quartet', 'spy'], 'repeated callback is idempotent');
  assert.deepEqual(store.readProfile(String(owner)).favorites, ['bible-wow'], 'a player can only edit their own favorites');
  await botUpdate({ callback_query: { ...playerCallback, data: addSpy.callback_data,
    message: { ...playerCallback.message, chat: ownerChat.chat } } });
  await botUpdate({ callback_query: { ...playerCallback, data: 'favorite_menu:ru:edit:1:1:kingdoms' } });
  assert.equal((await botUpdate({ callback_query: { ...playerCallback, data: removeSpy.callback_data } }, 'forged')).status, 403);
  assert.deepEqual(store.readProfile(String(delegated)).favorites, ['quartet', 'spy']);
  assert.deepEqual(store.readProfile(String(owner)).favorites, ['bible-wow']);
  await botUpdate({ callback_query: { ...playerCallback, data: removeSpy.callback_data } });
  assert.deepEqual(store.readProfile(String(delegated)).favorites, ['quartet']);
  for (const id of ['bible-azbuka', 'bible-world']) {
    await botUpdate({ callback_query: { ...playerCallback, data: `favorite_menu:ru:edit:0:1:${id}` } });
  }
  assert.deepEqual(store.readProfile(String(delegated)).favorites, ['quartet', 'bible-azbuka', 'bible-world']);

  assert.equal((await compat('555555555', 'appAccessRestore', { adminId: env.ADMIN_TELEGRAM_ID })).status, 403);
  assert.equal((await compat('666666666', 'appAccessRestore')).status, 403);
  assert.equal((await request('/compat', { telegramInitData: signed(owner, 1801), payload: { action: 'appAccessRestore' } })).status, 401);
  assert.equal((await request('/app/access')).data.restricted, true);

  env.APP_RESTRICTED = 'false';
  assert.equal((await request('/app/access')).data.allowed, true, 'the production flag disables the global restriction without a saved override');
  db.prepare('INSERT INTO app_access_mode VALUES (1, 1)').run();
  assert.equal((await request('/app/access')).data.allowed, true, 'a stale restricted database row cannot re-enable the restriction');
  db.prepare('UPDATE users SET is_banned = 1 WHERE telegram_id = ?').run('555555555');
  const bannedAccess = (await request('/app/access', { telegramInitData: signed('555555555') })).data;
  assert.equal(bannedAccess.allowed, false, 'turning off the global restriction preserves individual bans');
  assert.equal(bannedAccess.appRestricted, false);
  db.prepare('UPDATE users SET is_banned = 0 WHERE telegram_id = ?').run('555555555');
  db.prepare('DELETE FROM app_access_mode WHERE id = 1').run();
  env.APP_RESTRICTED = 'true';

  const restored = await compat(owner, 'appAccessRestore');
  assert.equal(restored.status, 200);
  assert.equal(restored.data.restricted, false);
  assert.equal((await compat(owner, 'appAccessRestore')).data.restricted, false);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM admin_action_audit WHERE action = 'appAccessRestore'").get().n, 1);
  store = new UserStore(ctx, env);
  assert.equal((await request('/app/access', { telegramInitData: signed(message.from.id) })).data.allowed, true);
  assert.equal((await request('/android/access', null, token)).data.isBanned, false);
  assert.equal((await request('/app/access')).data.restricted, false);
  assert.equal(JSON.stringify(store.getRow('555555555')), original);

  await botUpdate({ message: { ...message, text: '/help' } });
  assert(replies.at(-1).body.text.includes('/support'));
  assert(!replies.at(-1).body.text.includes('временно заблокированы'));
  await botUpdate({ message: { ...message, text: '/start' } });
  assert(replies.at(-1).url.endsWith('/sendRichMessage'));
  assert(replies.at(-1).body.rich_message.blocks.some((block) => block.buttons?.some((button) => button.url?.includes('?startapp'))));

  db.prepare('UPDATE users SET is_banned = 1 WHERE telegram_id = ?').run('555555555');
  assert.equal((await request('/app/access', { telegramInitData: signed(message.from.id) })).data.allowed, false);
} finally { globalThis.fetch = realFetch; }
console.log('PASS: verified root, blocked guests/delegated admins/forged identities, persistent exceptions, revocation, Android legacy compatibility, permanent bans, unchanged progress and room socket enforcement.');
console.log('PASS: bot commands, arbitrary text, photos, stickers, edited messages, callbacks, both Synodal references, webhook authentication, duplicate prevention and retry after delivery failure.');
console.log('PASS: favorites widget access, private state, refresh, compression limit, retry cooldown and in-chat favorites editing.');
console.log('PASS: owner-only reopening persists across restarts, restores the app and standard Telegram commands, and preserves account bans and progress.');
db.close();
