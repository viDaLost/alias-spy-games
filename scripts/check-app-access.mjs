import assert from 'node:assert/strict';
import { createHmac, createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { register } from 'node:module';
import { deflateSync } from 'node:zlib';
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
let widgetUnsupported = false;
globalThis.fetch = async (url, init) => {
  replies.push({ url, body: JSON.parse(init.body) });
  if (url.endsWith('/getMe')) return Response.json({ ok: true, result: { username: 'FavoritesTestBot' } });
  if (widgetUnsupported && url.endsWith('/sendWidget')) {
    return Response.json({ ok: false, error_code: 404, description: 'Not Found' }, { status: 404 });
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
  assert.equal(replies.at(-1).body.chat_data, '[]');

  const games = ['quartet', 'bible-geography', 'twelve-tribes', 'kingdoms'];
  const saved = await compat(owner, 'profileSetFavorites', { favorites: [...games, 'invalid'] });
  assert.deepEqual(saved.data.favorites, games);
  await botUpdate({ message: { ...ownerChat, text: '/start favorites_en' } });
  const widget = replies.at(-1).body;
  assert.deepEqual(JSON.parse(widget.chat_data), games);
  assert.equal(widget.allow_queries, true);
  assert.equal(widget.protect_content, true);
  assert(widget.html.includes('My games'));
  assert(Buffer.byteLength(widget.html) <= 32768 && deflateSync(widget.html, { level: 9 }).length <= 4096);
  assert.equal(widget.reply_markup.inline_keyboard[0][0].url, 'https://t.me/FavoritesTestBot?startapp=favorites');

  await compat(owner, 'profileSetFavorites', { favorites: ['bible-wow'] });
  const query = { id: '8123456789012345678', data: 'favorite_games_v1', ...ownerChat };
  await botUpdate({ widget_query: query });
  assert(replies.at(-1).url.endsWith('/answerWidgetQuery'));
  assert.equal(replies.at(-1).body.widget_query_id, query.id);
  assert.deepEqual(JSON.parse(replies.at(-1).body.data), ['bible-wow']);

  const delegated = 666666666;
  await compat(owner, 'appAccessGrant', { targetId: String(delegated) });
  assert.equal((await request('/app/access', { telegramInitData: signed(delegated) })).data.allowed, true);
  const beforeUnauthorized = replies.length;
  await botUpdate({ message: { chat: { id: delegated, type: 'private' }, from: { id: delegated }, text: '/favorites' } });
  await botUpdate({ widget_query: { ...query, chat: { id: delegated, type: 'private' }, from: { id: delegated } } });
  await botUpdate({ widget_query: { ...query, chat: { id: owner, type: 'group' } } });
  assert.equal((await botUpdate({ widget_query: query }, 'forged')).status, 403);
  assert(!replies.slice(beforeUnauthorized).some(({ url }) => /\/(sendWidget|answerWidgetQuery)$/.test(url)));

  widgetUnsupported = true;
  await botUpdate({ message: { ...ownerChat, text: '/favorites' } });
  assert(replies.at(-1).url.endsWith('/sendMessage'));
  assert.equal(replies.at(-1).body.reply_markup.inline_keyboard[0][0].url, 'https://t.me/FavoritesTestBot?startapp=game_bible-wow');
} finally { globalThis.fetch = realFetch; }
console.log('PASS: verified root, blocked guests/delegated admins/forged identities, persistent exceptions, revocation, Android legacy compatibility, permanent bans, unchanged progress and room socket enforcement.');
console.log('PASS: bot commands, arbitrary text, photos, stickers, edited messages, callbacks, both Synodal references, webhook authentication, duplicate prevention and retry after delivery failure.');
console.log('PASS: owner-only favorites widget, live refresh, compressed size limit and inline keyboard fallback.');
db.close();
