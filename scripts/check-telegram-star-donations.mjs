import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { register } from 'node:module';
import { DatabaseSync } from 'node:sqlite';

register('./lib/cloudflare-workers-loader.mjs', import.meta.url);
const { default: worker, UserStore } = await import('../cloudflare/app-core-worker/src/index-v18.js');

const db = new DatabaseSync(':memory:');
const storage = {
  sql: { exec(query, ...values) {
    if (!values.length && /;\s*\S/.test(query.trim().replace(/;$/, ''))) {
      db.exec(query);
      return { toArray: () => [] };
    }
    const stmt = db.prepare(query);
    const rows = stmt.columns().length ? stmt.all(...values) : (stmt.run(...values), []);
    return { toArray: () => rows, [Symbol.iterator]: () => rows[Symbol.iterator]() };
  } },
  get: async () => undefined,
  list: async () => new Map(),
  put: async () => {},
  transactionSync: (action) => action(),
};
const ctx = { storage, waitUntil() {} };
const env = { TELEGRAM_BOT_TOKEN: '123456:donation-fixture', ADMIN_TELEGRAM_ID: '1288379477', APP_RESTRICTED: 'true' };
let store = new UserStore(ctx, env);
env.USERS = { idFromName: (name) => name, get: () => ({ fetch: (url, init) => store.fetch(new Request(url, init)) }) };
const secret = createHash('sha256').update(env.TELEGRAM_BOT_TOKEN).digest('hex');
const player = { id: 555555555, is_bot: false, first_name: 'Player' };
const chat = { id: player.id, type: 'private' };
const requests = [];
const realFetch = globalThis.fetch;
let nextUpdate = 1;

async function update(data, signed = true) {
  return worker.fetch(new Request('https://core.test/telegram/webhook', {
    method: 'POST', headers: { 'X-Telegram-Bot-Api-Secret-Token': signed ? secret : 'wrong' },
    body: JSON.stringify({ update_id: nextUpdate++, ...data }),
  }), env, ctx);
}
const message = (text, extra = {}) => update({ message: { message_id: 10, chat, from: player, text, ...extra } });
const callback = (data) => update({ callback_query: { id: 'button-1', from: player, message: { chat, message_id: 4 }, data } });
const last = () => requests.at(-1);
const count = () => db.prepare('SELECT count(*) AS count FROM telegram_star_donations WHERE paid_at IS NOT NULL').get().count;

try {
  globalThis.fetch = async (url, init) => {
    assert.match(url, /^https:\/\/api\.telegram\.org\/bot123456:donation-fixture\//);
    const method = url.split('/').at(-1);
    const body = JSON.parse(init.body);
    requests.push({ method, body });
    if (method === 'sendInvoice' && body.prices[0].amount >= 100000) {
      return Response.json({ ok: false, description: 'Bad Request: CURRENCY_TOTAL_AMOUNT_INVALID' }, { status: 400 });
    }
    return Response.json({ ok: true, result: true });
  };

  assert.equal((await update({ message: { chat, from: player, text: '/donate 35' } }, false)).status, 403);
  assert.equal(requests.length, 0);
  assert.equal((await worker.fetch(new Request('https://core.test/star-donations/issue', {
    method: 'POST', body: JSON.stringify({ payerId: String(player.id), amount: 35 }),
  }), env, ctx)).status, 404);

  assert.equal((await message('/start')).status, 200);
  assert.match(last().body.text, /временно заблокированы/);
  assert.equal((await message('/start donate')).status, 200);
  assert.equal(last().body.reply_markup.inline_keyboard[1][0].text, 'Другая сумма');
  await callback('donate:25');
  const preset = last();
  assert.equal(preset.method, 'sendInvoice');
  assert.equal(preset.body.prices[0].amount, 25);
  await callback('donate:custom');
  assert.equal(last().body.reply_markup.force_reply, true);
  const reply = { from: { id: 123456, is_bot: true }, text: last().body.text };
  await message('2.5', { reply_to_message: reply });
  assert.match(last().body.text, /целое число/);
  await message('137', { reply_to_message: reply });
  const invoice = last();
  assert.equal(invoice.method, 'sendInvoice');
  assert.equal(invoice.body.currency, 'XTR');
  assert.equal(invoice.body.provider_token, '');
  assert.deepEqual(invoice.body.prices, [{ label: 'Поддержка проекта', amount: 137 }]);
  assert.equal(invoice.body.start_parameter, 'donate');
  await message('/donate 1');
  assert.equal(last().body.prices[0].amount, 1);
  await message('/donate 100000');
  assert.match(last().body.text, /Введите другую/);

  const validation = { id: 'tg-checkout-1', from: player, currency: 'XTR', total_amount: 137, invoice_payload: invoice.body.payload };
  const verify = async (override, expected) => {
    assert.equal((await update({ pre_checkout_query: { ...validation, ...override } })).status, 200);
    assert.equal(last().method, 'answerPreCheckoutQuery');
    assert.equal(last().body.ok, expected);
  };
  await verify({ from: { id: 666666666 } }, false);
  await verify({ currency: 'USD' }, false);
  await verify({ total_amount: 138 }, false);
  await verify({}, true);
  await verify({}, true);
  await verify({ id: 'second-checkout' }, false);
  assert.equal(count(), 0, 'pre-checkout approval must not count as payment');

  store = new UserStore(ctx, env);
  const payment = { currency: 'XTR', total_amount: 137, invoice_payload: invoice.body.payload, telegram_payment_charge_id: 'tg-charge-137' };
  await message('', { successful_payment: payment });
  assert.match(last().body.text, /Получено 137 ⭐/);
  assert.equal(count(), 1);
  const saved = db.prepare('SELECT payer_id, amount, charge_id FROM telegram_star_donations WHERE paid_at IS NOT NULL').get();
  assert.deepEqual({ ...saved }, { payer_id: String(player.id), amount: 137, charge_id: 'tg-charge-137' });
  const requestCount = requests.length;
  await message('', { successful_payment: payment });
  assert.equal(requests.length, requestCount, 'duplicate receipt must not send a second thank-you');
  assert.equal(count(), 1);
  await verify({}, false);
  assert.equal((await store.applicationAccess(String(player.id))).allowed, false);

  await message('/terms');
  assert.match(last().body.text, /Взнос разовый и добровольный/);
  await message('/paysupport');
  assert.equal(last().body.reply_markup.force_reply, true);
  await message('Помогите найти счёт на 137 звёзд', { reply_to_message: { from: { id: 123456, is_bot: true }, text: last().body.text } });
  const ticket = db.prepare('SELECT user_id, subject FROM support_tickets').get();
  assert.equal(ticket.user_id, String(player.id));
  assert.equal(ticket.subject, 'Вопрос об оплате Telegram Stars');
  assert.ok(requests.some(({body}) => body.chat_id === env.ADMIN_TELEGRAM_ID && String(body.text).includes(ticket.subject)));
  console.log('PASS: private Telegram Stars support with custom amounts, signed webhook, invoice checks, durable receipts, duplicate protection and payment support under the app restriction.');
} finally {
  globalThis.fetch = realFetch;
  db.close();
}
