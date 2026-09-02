// Опрос о впечатлении от приложения.
//
// Устроен так же, как вопрос «откуда узнали»: показывается один раз, ответ
// уходит администратору в личные сообщения бота и больше не спрашивается.
// Отличий два, и оба намеренные.
//
// Первое: вопросов два — что человек думает о приложении и что бы он в нём
// изменил. Это разные ответы, и складывать их в одно поле значило бы потом
// разбирать сплошной текст глазами.
//
// Второе: опрос обслуживает обе дороги входа. В Telegram приложение приходит
// на /compat с подписью initData, а Android-версия и веб-версия, поставленная
// на главный экран, — на /android/compat с токеном подтверждённой сессии.
// Вопрос «откуда узнали» слушает только первую, и за пределами Telegram его
// просто нет; повторять это в новом опросе незачем.

import coreV16, { UserStore as V16UserStore } from './index-v16.js';
import { feedbackReplyTarget } from './feedback-reply-target.js';
import { directMessageRequest, WRITE_PROMPT_PREFIX } from './admin-direct-message.js';

const encoder = new TextEncoder();
const FEEDBACK_ACTIONS = new Set(['feedbackStatus', 'feedbackSubmit']);

// Спрашивать мнение у того, кто открыл приложение впервые, бессмысленно: ему
// нечего сказать, а спросить можно только один раз. Поэтому опрос ждёт, пока
// человек поиграет.
const ELIGIBLE_AFTER_MS = 3 * 24 * 60 * 60 * 1000;

export class UserStore extends V16UserStore {
  constructor(ctx, env) {
    super(ctx, env);
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS feedback_notes (
        user_id TEXT PRIMARY KEY,
        opinion TEXT NOT NULL DEFAULT '',
        wishes TEXT NOT NULL DEFAULT '',
        source TEXT NOT NULL DEFAULT 'web',
        created_at INTEGER NOT NULL,
        reply TEXT NOT NULL DEFAULT '',
        replied_at INTEGER NOT NULL DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS idx_feedback_notes_created
        ON feedback_notes(created_at DESC);
    `);
    // Таблица создаётся через IF NOT EXISTS, поэтому у отзывов, собранных до
    // появления ответов, этих колонок нет — их добавляет отдельная миграция.
    for (const column of ["reply TEXT NOT NULL DEFAULT ''", 'replied_at INTEGER NOT NULL DEFAULT 0']) {
      try { this.sql.exec(`ALTER TABLE feedback_notes ADD COLUMN ${column}`); } catch { /* уже есть */ }
    }
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (request.method === 'POST' && url.pathname.startsWith('/feedback/')) {
      const body = await request.json().catch(() => ({}));
      if (url.pathname === '/feedback/status') return feedbackStoreResponse(await this.feedbackStatus(body));
      if (url.pathname === '/feedback/submit') return feedbackStoreResponse(await this.submitFeedback(body));
      if (url.pathname === '/feedback/reply') return feedbackStoreResponse(await this.replyToFeedback(body));
    }
    return super.fetch(request);
  }

  async feedbackStatus(raw = {}) {
    const userId = cleanUserId(raw.userId);
    if (!userId) return feedbackFail('Некорректный Telegram ID');
    const answered = Boolean(this.sql.exec(
      'SELECT 1 FROM feedback_notes WHERE user_id = ?', userId,
    ).toArray()[0]);
    return { ok: true, success: true, answered, eligible: !answered && this.playedLongEnough(userId) };
  }

  /** Давно ли человек с нами: раньше трёх дней спрашивать нечего. */
  playedLongEnough(userId) {
    const row = this.sql.exec(
      'SELECT created_at FROM users WHERE telegram_id = ?', userId,
    ).toArray()[0];
    const since = Number(row?.created_at || 0);
    if (!since) return false;
    return Date.now() - since >= ELIGIBLE_AFTER_MS;
  }

  async submitFeedback(raw = {}) {
    const userId = cleanUserId(raw.userId);
    const opinion = cleanFeedbackText(raw.opinion);
    const wishes = cleanFeedbackText(raw.wishes);
    const source = String(raw.source || 'web') === 'android' ? 'android' : 'web';
    if (!userId) return feedbackFail('Некорректный Telegram ID');
    if (opinion.length < 2 && wishes.length < 2) return feedbackFail('Напишите хотя бы пару слов');

    // Первый ответ и остаётся ответом: опрос одноразовый, и переписывать его
    // повторным запросом нельзя — иначе администратору уедет второе письмо.
    const existing = this.sql.exec(
      'SELECT opinion, wishes, created_at FROM feedback_notes WHERE user_id = ?', userId,
    ).toArray()[0];
    if (existing) {
      return {
        ok: true, success: true, created: false, answered: true,
        opinion: String(existing.opinion || ''), wishes: String(existing.wishes || ''),
      };
    }

    const now = Date.now();
    this.sql.exec(
      'INSERT INTO feedback_notes (user_id, opinion, wishes, source, created_at) VALUES (?, ?, ?, ?, ?)',
      userId, opinion, wishes, source, now,
    );
    return { ok: true, success: true, created: true, answered: true, opinion, wishes, createdAt: now };
  }

  /**
   * Ответ администратора на отзыв. Хранится рядом с самим отзывом: доставка в
   * Telegram может не пройти — человек мог не начинать диалог с ботом или
   * заблокировать его, — и тогда написанное не должно пропасть.
   */
  async replyToFeedback(raw = {}) {
    const userId = cleanUserId(raw.userId);
    const reply = cleanFeedbackText(raw.reply);
    if (!userId) return feedbackFail('Некорректный Telegram ID');
    if (reply.length < 2) return feedbackFail('Ответ слишком короткий');

    const existing = this.sql.exec(
      'SELECT opinion, wishes FROM feedback_notes WHERE user_id = ?', userId,
    ).toArray()[0];
    if (!existing) return feedbackFail('Отзыв не найден');

    const now = Date.now();
    this.sql.exec('UPDATE feedback_notes SET reply = ?, replied_at = ? WHERE user_id = ?', reply, now, userId);
    return { ok: true, success: true, userId, reply, repliedAt: now };
  }
}

// Обновления, уже разобранные этим слоем. Telegram повторяет доставку, пока не
// получит ответ, а свой список повторов есть только у слоя поддержки — до него
// ответ на отзыв не доходит.
const handledUpdates = new Map();

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Ответ свайпом. Слой поддержки разбирает вебхук ниже по цепочке и об
    // отзывах не знает, поэтому свои ответы этот слой забирает первым, а всё
    // остальное отдаёт дальше нетронутым.
    if (url.pathname === '/telegram/webhook' && request.method === 'POST') {
      const taken = await takeAdminBotAction(request.clone(), env).catch(async (error) => {
        const adminId = String(env.ADMIN_TELEGRAM_ID || '');
        if (adminId && env.TELEGRAM_BOT_TOKEN) {
          await feedbackSendMessage(env, adminId,
            `⚠️ Не удалось обработать сообщение бота: ${String(error?.message || error).slice(0, 400)}`).catch(() => {});
        }
        return true;
      });
      if (taken) return new Response('OK');
    }

    const compat = url.pathname === '/compat';
    const sessionCompat = url.pathname === '/android/compat';
    if ((compat || sessionCompat) && request.method === 'POST') {
      const body = await request.clone().json().catch(() => ({}));
      const payload = body?.payload && typeof body.payload === 'object' ? body.payload : {};
      const action = String(payload.action || '');
      if (FEEDBACK_ACTIONS.has(action)) {
        return handleFeedback(request, env, ctx, body, payload, action, compat);
      }
    }
    return coreV16.fetch(request, env, ctx);
  },

  async scheduled(controller, env, ctx) {
    if (typeof coreV16.scheduled === 'function') return coreV16.scheduled(controller, env, ctx);
  },
};

/**
 * Два действия администратора в самом боте: ответ свайпом на отзыв и команда
 * «написать пользователю по его номеру». Оба пишут человеку от имени
 * приложения, поэтому и живут рядом, за одной проверкой прав.
 *
 * Возвращает true, только если сообщение действительно одно из этих двух. Всё
 * прочее — команды бота, обращения в поддержку, любые другие сообщения —
 * уходит дальше нетронутым.
 */
async function takeAdminBotAction(request, env) {
  if (!env.TELEGRAM_BOT_TOKEN) return false;

  // Подпись вебхука проверяется здесь же: слой поддержки, который делает это
  // ниже, до неподошедшего обновления уже не доберётся.
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(String(env.TELEGRAM_BOT_TOKEN))));
  const expected = [...digest].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  const received = String(request.headers.get('X-Telegram-Bot-Api-Secret-Token') || '');
  if (!received || !feedbackEqual(encoder.encode(expected), encoder.encode(received))) return false;

  const update = await request.json().catch(() => null);
  const message = update?.message;
  if (!message?.chat || message.chat.type !== 'private') return false;

  const chatId = cleanUserId(message.chat.id);
  const senderId = cleanUserId(message.from?.id);
  if (!chatId || !senderId || chatId !== senderId) return false;

  const text = String(message.text || message.caption || '').trim();
  if (!text) return false;

  const targetId = feedbackReplyTarget(message.reply_to_message);
  const direct = targetId ? null : directMessageRequest(text, message.reply_to_message);
  if (!targetId && !direct) return false;

  const updateId = Number(update.update_id || 0);
  if (updateId && rememberUpdate(updateId)) return true;

  const store = env.USERS.get(env.USERS.idFromName('global'));
  const role = await callFeedbackStore(store, '/admin-role/check', { userId: senderId }).catch(() => ({}));
  // Писать от имени приложения может только администратор. Сообщение бота можно
  // переслать кому угодно, а команду набрать может любой — без этой проверки
  // писать чужим людям от имени приложения смог бы кто угодно.
  //
  // Отказ молчаливый: рассказывать постороннему, что такая команда есть, незачем.
  if (role?.isAdmin !== true || (role?.isBanned === true && role?.isRoot !== true)) return false;

  if (direct) {
    await runDirectMessage(env, chatId, message.message_id, direct);
    return true;
  }

  const saved = await callFeedbackStore(store, '/feedback/reply', { userId: targetId, reply: text })
    .catch((error) => ({ error: String(error?.message || 'Не удалось сохранить ответ') }));
  if (saved?.error) {
    await feedbackSendMessage(env, chatId, `Не удалось сохранить ответ: ${saved.error}`, message.message_id);
    return true;
  }

  const sent = await deliver(env, targetId, [
    '💬 Ответ на ваш отзыв о «Библейских играх»',
    '',
    String(saved.reply || text),
  ]);
  await feedbackSendMessage(env, chatId, sent.ok
    ? '✅ Ответ отправлен человеку в бот.'
    : `✅ Ответ сохранён, но Telegram не доставил его: ${sent.reason}`,
  message.message_id);
  return true;
}

/** Команда «написать пользователю»: подсказка, отправка и внятный отказ. */
async function runDirectMessage(env, chatId, replyToMessageId, request) {
  if (request.kind === 'usage') {
    await feedbackSendMessage(env, chatId, [
      'Напишите номер человека, которому нужно отправить сообщение:',
      '',
      '/write 123456789 — бот спросит текст',
      '/write 123456789 текст — отправить сразу',
      '',
      'Номер видно в сообщении с отзывом и в панели управления.',
    ].join('\n'), replyToMessageId);
    return;
  }

  if (request.kind === 'badId') {
    await feedbackSendMessage(env, chatId,
      `«${request.value}» не похоже на Telegram ID. Это число из пяти и более цифр.`, replyToMessageId);
    return;
  }

  if (request.kind === 'cancel') {
    await feedbackSendMessage(env, chatId, 'Отправка отменена.', replyToMessageId);
    return;
  }

  if (request.kind === 'prompt') {
    await telegramSend(env, {
      chat_id: String(chatId),
      text: [
        `${WRITE_PROMPT_PREFIX} ${request.target}`,
        '',
        'Напишите текст ответом на это сообщение.',
        'Для отмены — /cancel.',
      ].join('\n'),
      reply_markup: { force_reply: true, selective: true, input_field_placeholder: 'Текст сообщения…' },
      ...(replyToMessageId ? { reply_parameters: { message_id: replyToMessageId, allow_sending_without_reply: true } } : {}),
    });
    return;
  }

  const sent = await deliver(env, request.target, [
    '✉️ Сообщение от разработчика «Библейских игр»',
    '',
    request.body,
    '',
    'Ответить можно командой /support.',
  ]);
  await feedbackSendMessage(env, chatId, sent.ok
    ? `✅ Отправлено пользователю ${request.target}.`
    : `Не доставлено пользователю ${request.target}: ${sent.reason}`,
  replyToMessageId);
}

/**
 * Доставка человеку. Она нередко не проходит по причинам, за которые никто не
 * виноват: человек мог не начинать диалог с ботом или заблокировать его. Тогда
 * администратору важно увидеть причину, а не бодрое «отправлено».
 */
async function deliver(env, chatId, lines) {
  try {
    await feedbackSendMessage(env, chatId, lines.join('\n'));
    return { ok: true, reason: '' };
  } catch (error) {
    return { ok: false, reason: String(error?.message || 'Telegram отклонил отправку') };
  }
}

function rememberUpdate(updateId) {
  const now = Date.now();
  const seen = Number(handledUpdates.get(String(updateId)) || 0);
  if (seen && now - seen < 10 * 60_000) return true;
  handledUpdates.set(String(updateId), now);
  if (handledUpdates.size > 500) {
    const cutoff = now - 10 * 60_000;
    for (const [key, at] of handledUpdates) if (at < cutoff) handledUpdates.delete(key);
  }
  return false;
}

async function handleFeedback(request, env, ctx, body, payload, action, compat) {
  const cors = feedbackCors(request, env);
  try {
    if (!feedbackOriginAllowed(request, env)) throw feedbackError(403, 'Origin not allowed');
    const store = env.USERS.get(env.USERS.idFromName('global'));
    const who = compat
      ? await identityFromInitData(String(body.telegramInitData || ''), env)
      : await identityFromSession(request, store, body);

    if (action === 'feedbackStatus') {
      return feedbackJson(await callFeedbackStore(store, '/feedback/status', { userId: who.userId }), 200, cors);
    }

    const result = await callFeedbackStore(store, '/feedback/submit', {
      userId: who.userId,
      opinion: payload.opinion,
      wishes: payload.wishes,
      source: compat ? 'web' : 'android',
    });
    if (result.created) ctx.waitUntil(notifyFeedbackAdmin(env, who, result).catch(() => {}));
    return feedbackJson(result, 200, cors);
  } catch (error) {
    return feedbackJson(
      { success: false, ok: false, error: String(error?.message || 'Server error') },
      Number(error?.status || 500),
      cors,
    );
  }
}

async function identityFromInitData(initData, env) {
  const verified = await verifyFeedbackInitData(initData, env.TELEGRAM_BOT_TOKEN);
  return { userId: String(verified.user.id || ''), user: verified.user };
}

/**
 * Личность берётся из токена, а не из тела запроса: иначе достаточно прислать
 * чужой id, чтобы ответить за другого человека.
 */
async function identityFromSession(request, store, body) {
  const header = String(request.headers.get('Authorization') || '');
  const token = header.match(/^Bearer\s+(bgs_[A-Za-z0-9_-]{40,80})$/i)?.[1] || '';
  if (!token) throw feedbackError(401, 'Требуется подтверждённый вход');
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(token)));
  const tokenHash = [...digest].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  const session = await callFeedbackStore(store, '/android-auth/session', { tokenHash });
  const userId = cleanUserId(session?.userId);
  if (!userId) throw feedbackError(401, 'Сессия истекла. Подтвердите вход снова.');
  const claimed = cleanUserId(body?.androidUserId);
  if (claimed && claimed !== userId) throw feedbackError(403, 'Запрос не соответствует сессии');
  return { userId, user: { id: userId } };
}

async function notifyFeedbackAdmin(env, who, result) {
  const adminId = String(env.ADMIN_TELEGRAM_ID || '');
  if (!adminId || !env.TELEGRAM_BOT_TOKEN) return;
  const user = who.user || {};
  const username = user.username ? `@${String(user.username).replace(/^@+/, '')}` : 'без username';
  const name = [user.first_name, user.last_name].map((item) => String(item || '').trim()).filter(Boolean).join(' ');
  await feedbackSendMessage(env, adminId, [
    '💡 Отзыв о приложении',
    `Пользователь: ${who.userId} · ${username}${name ? ` · ${name}` : ''}`,
    '',
    'Что думает о приложении:',
    String(result.opinion || '').slice(0, 1200) || '— не ответил',
    '',
    'Что добавил бы или изменил:',
    String(result.wishes || '').slice(0, 1200) || '— не ответил',
    '',
    'Ответьте на это сообщение — ответ придёт человеку в бот.',
    `ID отзыва: fb_${who.userId}`,
  ].join('\n'));
}

async function callFeedbackStore(stub, pathname, body) {
  const response = await stub.fetch(`https://users.internal${pathname}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data?.ok === false) {
    const error = new Error(String(data?.error || `Store HTTP ${response.status}`));
    error.status = response.status;
    throw error;
  }
  return data;
}

function feedbackSendMessage(env, chatId, text, replyToMessageId = 0) {
  return telegramSend(env, {
    chat_id: String(chatId),
    text: String(text || '').slice(0, 4096),
    disable_web_page_preview: true,
    ...(replyToMessageId ? { reply_to_message_id: Number(replyToMessageId) } : {}),
  });
}

async function telegramSend(env, payload) {
  const response = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data?.ok !== true) throw new Error(String(data?.description || `Telegram HTTP ${response.status}`));
  return data.result;
}

async function verifyFeedbackInitData(initData, botToken) {
  if (!botToken) throw feedbackError(500, 'Telegram secret is not configured');
  const params = new URLSearchParams(String(initData || ''));
  const receivedHash = params.get('hash') || '';
  if (!receivedHash) throw feedbackError(401, 'Telegram hash missing');

  const authDate = Number(params.get('auth_date') || 0);
  const nowSec = Math.floor(Date.now() / 1000);
  if (!authDate || Math.abs(nowSec - authDate) > 24 * 60 * 60) throw feedbackError(401, 'Telegram session expired');

  params.delete('hash');
  const checkString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
  const secretKey = await feedbackHmac(encoder.encode('WebAppData'), encoder.encode(botToken));
  const expected = await feedbackHmac(secretKey, encoder.encode(checkString));
  const received = feedbackHexToBytes(receivedHash);
  if (!feedbackEqual(expected, received)) throw feedbackError(401, 'Telegram signature invalid');

  let user = {};
  try { user = JSON.parse(params.get('user') || '{}'); } catch {}
  if (!user?.id) throw feedbackError(401, 'Telegram user missing');
  return { user };
}

async function feedbackHmac(keyBytes, dataBytes) {
  const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, dataBytes));
}

function feedbackEqual(a, b) {
  if (!(a instanceof Uint8Array) || !(b instanceof Uint8Array) || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a[i] ^ b[i];
  return diff === 0;
}

function feedbackHexToBytes(hex) {
  if (!/^[0-9a-f]{64}$/i.test(hex)) return new Uint8Array();
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i += 1) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return bytes;
}

function cleanUserId(value) {
  const id = String(value || '').trim();
  return /^\d{5,20}$/.test(id) ? id : '';
}

function cleanFeedbackText(value) {
  return String(value || '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .replace(/\r\n/g, '\n')
    .trim()
    .slice(0, 1000);
}

function feedbackAllowedOrigins(env) {
  return String(env.ALLOWED_ORIGINS || 'https://vidalost.github.io')
    .split(/[,\s]+/).map((item) => item.trim()).filter(Boolean);
}

function feedbackOriginAllowed(request, env) {
  const origin = request.headers.get('Origin') || '';
  // Android-обёртка ходит без Origin: там личность подтверждает токен, а не браузер.
  return !origin || feedbackAllowedOrigins(env).includes(origin);
}

function feedbackCors(request, env) {
  const origin = request.headers.get('Origin') || '';
  const allowed = feedbackAllowedOrigins(env);
  return {
    'Access-Control-Allow-Origin': allowed.includes(origin) ? origin : allowed[0] || 'https://vidalost.github.io',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

function feedbackStoreResponse(value) {
  return new Response(JSON.stringify(value), {
    status: value?.ok === false ? 400 : 200,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

function feedbackJson(value, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...extraHeaders },
  });
}

function feedbackError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function feedbackFail(error) {
  return { ok: false, success: false, error };
}
