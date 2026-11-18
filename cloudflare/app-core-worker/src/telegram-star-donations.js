import { accessStore } from './app-access-auth.js';
import { createTicketFromTelegram, telegramApi } from './index-v15.js';

const CURRENCY = 'XTR';
const INVOICE_PREFIX = 'bible-donate:';
const INVOICE_VALID_MS = 30 * 24 * 60 * 60 * 1000;
const AMOUNT_PROMPT = '⭐ Введите количество Telegram Stars';
const HELP_PROMPT = '⭐ Помощь с оплатой звёздами';
const TERMS = [
  'Поддержка «Библейских игр»',
  '',
  'Взнос разовый и добровольный. Вы сами выбираете сумму в Telegram Stars и подтверждаете её в счёте Telegram.',
  'Взнос помогает развитию проекта. Он не открывает платный доступ и не даёт игровых преимуществ.',
  'По вопросам оплаты и возврата напишите нам через /paysupport.',
].join('\n');

export class DonationStore {
  constructor(sql) {
    this.sql = sql;
    sql.exec(`CREATE TABLE IF NOT EXISTS telegram_star_donations (
      payload TEXT PRIMARY KEY NOT NULL,
      payer_id TEXT NOT NULL,
      amount INTEGER NOT NULL CHECK (amount > 0),
      issued_at INTEGER NOT NULL,
      checkout_id TEXT,
      charge_id TEXT UNIQUE,
      paid_at INTEGER
    )`);
  }

  handle(path, { payload, payerId, amount, currency, checkoutId, chargeId }) {
    const now = Date.now();
    if (path === '/star-donations/issue') {
      const invoice = INVOICE_PREFIX + crypto.randomUUID();
      this.sql.exec('INSERT INTO telegram_star_donations (payload, payer_id, amount, issued_at) VALUES (?, ?, ?, ?)', invoice, payerId, amount, now);
      return { ok: true, payload: invoice };
    }
    if (path !== '/star-donations/checkout' && path !== '/star-donations/settle') return null;
    const invoice = this.sql.exec('SELECT * FROM telegram_star_donations WHERE payload = ?', payload).toArray()[0];
    if (!invoice || invoice.payer_id !== payerId || invoice.amount !== amount || currency !== CURRENCY) return { ok: true, accepted: false };

    if (path === '/star-donations/checkout') {
      const accepted = Boolean(checkoutId && !invoice.charge_id && invoice.issued_at > now - INVOICE_VALID_MS &&
        (!invoice.checkout_id || invoice.checkout_id === checkoutId));
      if (accepted && !invoice.checkout_id) {
        this.sql.exec('UPDATE telegram_star_donations SET checkout_id = ? WHERE payload = ?', checkoutId, payload);
      }
      return { ok: true, accepted };
    }

    if (!chargeId || !invoice.checkout_id) return { ok: true, accepted: false };
    if (invoice.charge_id) return { ok: true, accepted: invoice.charge_id === chargeId, fresh: false };
    if (this.sql.exec('SELECT 1 FROM telegram_star_donations WHERE charge_id = ?', chargeId).toArray().length) return { ok: true, accepted: false };
    this.sql.exec('UPDATE telegram_star_donations SET charge_id = ?, paid_at = ? WHERE payload = ?', chargeId, now, payload);
    return { ok: true, accepted: true, fresh: true };
  }
}

export async function handleStarDonation(update, env) {
  const checkout = update?.pre_checkout_query;
  if (isDonation(checkout?.invoice_payload)) {
    const result = await accessStore(env, '/star-donations/checkout', {
      ...paymentDetails(checkout, checkout.from?.id), checkoutId: String(checkout.id || ''),
    }).catch(() => ({ accepted: false }));
    await telegramApi(env, 'answerPreCheckoutQuery', {
      pre_checkout_query_id: checkout.id,
      ok: result.accepted,
      ...(!result.accepted && { error_message: 'Счёт уже использован или устарел. Создайте новый через /donate.' }),
    });
    return true;
  }

  const message = update?.message;
  const payment = message?.successful_payment;
  if (isDonation(payment?.invoice_payload)) {
    const payerId = privateUser(message.chat, message.from);
    if (!payerId) return true;
    const result = await accessStore(env, '/star-donations/settle', {
      ...paymentDetails(payment, payerId), chargeId: String(payment.telegram_payment_charge_id || ''),
    });
    if (!result.accepted) console.error('Telegram Stars donation receipt did not match an approved invoice');
    if (result.fresh) {
      await send(env, payerId, `Спасибо за поддержку «Библейских игр»! Получено ${payment.total_amount} ⭐\n\nВопросы об оплате — /paysupport.`).catch(() => {});
    }
    return true;
  }

  const callback = update?.callback_query;
  if (callback?.data?.startsWith('donate:')) {
    const payerId = privateUser(callback.message?.chat, callback.from);
    await telegramApi(env, 'answerCallbackQuery', { callback_query_id: callback.id }).catch(() => {});
    if (!payerId) return true;
    if (callback.data === 'donate:open') await showAmounts(env, payerId);
    else if (callback.data === 'donate:custom') await askAmount(env, payerId, callback.message.message_id);
    else await issueInvoice(env, payerId, callback.data.slice('donate:'.length));
    return true;
  }

  const payerId = privateUser(message?.chat, message?.from);
  const text = String(message?.text || '').trim();
  if (!payerId || !text) return false;
  if (/^\/start(?:@\w+)?\s+donate$/i.test(text)) {
    await showAmounts(env, payerId);
    return true;
  }
  const donate = text.match(/^\/donate(?:@\w+)?(?:\s+([\s\S]+))?$/i);
  if (donate) {
    if (donate[1]) await issueInvoice(env, payerId, donate[1]);
    else await showAmounts(env, payerId);
    return true;
  }
  if (/^\/terms(?:@\w+)?$/i.test(text)) {
    await send(env, payerId, TERMS);
    return true;
  }
  const help = text.match(/^\/paysupport(?:@\w+)?(?:\s+([\s\S]+))?$/i);
  const reply = message.reply_to_message;
  const repliesToBot = reply?.from?.is_bot === true && String(reply.from.id) === env.TELEGRAM_BOT_TOKEN.split(':')[0];
  if (help || (repliesToBot && reply.text?.startsWith(HELP_PROMPT) && !text.startsWith('/'))) {
    if (help && !help[1]) {
      await send(env, payerId, `${HELP_PROMPT}\n\nОпишите вопрос ответом на это сообщение. Если нужно найти платёж, укажите сумму и примерное время.`, forceReply(message.message_id, 'Вопрос об оплате'));
    } else {
      await createTicketFromTelegram(env, message, help ? help[1] : text, 'Вопрос об оплате Telegram Stars');
    }
    return true;
  }
  if (repliesToBot && reply.text?.startsWith(AMOUNT_PROMPT) && !text.startsWith('/')) {
    await issueInvoice(env, payerId, text, message.message_id);
    return true;
  }
  return false;
}

function privateUser(chat, sender) {
  const id = String(sender?.id || '');
  return chat?.type === 'private' && !sender?.is_bot && String(chat.id) === id && /^[1-9]\d{0,15}$/.test(id) ? id : '';
}

function isDonation(payload) {
  return typeof payload === 'string' && payload.startsWith(INVOICE_PREFIX);
}

function paymentDetails(payment, payerId) {
  return { payload: payment.invoice_payload, payerId: String(payerId || ''), amount: payment.total_amount, currency: payment.currency };
}

function send(env, chatId, text, options = {}) {
  return telegramApi(env, 'sendMessage', { chat_id: chatId, text, ...options });
}

function forceReply(messageId, placeholder) {
  return {
    reply_markup: { force_reply: true, input_field_placeholder: placeholder },
    ...(messageId && { reply_parameters: { message_id: messageId, allow_sending_without_reply: true } }),
  };
}

function showAmounts(env, chatId) {
  return send(env, chatId, '⭐ Поддержать «Библейские игры»\n\nВыберите сумму в Telegram Stars или введите свою. Взнос добровольный. Условия — /terms.', {
    reply_markup: { inline_keyboard: [
      [25, 50, 100, 250].map((amount) => ({ text: `${amount} ⭐`, callback_data: `donate:${amount}` })),
      [{ text: 'Другая сумма', callback_data: 'donate:custom' }],
    ] },
  });
}

function askAmount(env, chatId, messageId, retry = false) {
  const text = `${AMOUNT_PROMPT}\n\n${retry ? 'Нужно целое число от 1, например 137.' : 'Ответьте на это сообщение целым числом, например 137.'}`;
  return send(env, chatId, text, forceReply(messageId, 'Количество звёзд'));
}

async function issueInvoice(env, payerId, rawAmount, messageId = 0) {
  const amount = Number(rawAmount);
  if (!/^\d+$/.test(rawAmount) || !Number.isSafeInteger(amount) || amount < 1) {
    await askAmount(env, payerId, messageId, true);
    return;
  }
  const { payload } = await accessStore(env, '/star-donations/issue', { payerId, amount });
  try {
    await telegramApi(env, 'sendInvoice', {
      chat_id: payerId,
      title: 'Поддержка «Библейских игр»',
      description: 'Разовая добровольная поддержка развития проекта. Подтверждая оплату, вы принимаете условия /terms. Помощь с оплатой — /paysupport.',
      payload,
      provider_token: '',
      currency: CURRENCY,
      prices: [{ label: 'Поддержка проекта', amount }],
      start_parameter: 'donate',
    });
  } catch (error) {
    if (!/amount|invoice_invalid/i.test(error.message)) throw error;
    await send(env, payerId, 'Telegram не может выставить счёт на эту сумму. Введите другую через /donate.');
  }
}
