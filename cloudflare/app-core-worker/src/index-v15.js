import coreV14, { UserStore as V14UserStore } from './index-v14.js';

const encoder = new TextEncoder();
const SUPPORT_PROMPT_PREFIX = '🎧 Техподдержка';
const TICKET_RE = /(?:№|ID обращения:)\s*(sup_[a-z0-9_]{6,80})/i;
const SUPPORT_ACTIONS = new Set(['supportCreate', 'supportList', 'supportAdminList', 'supportReply', 'supportSetStatus']);
const recentUpdates = new Map();

export class UserStore extends V14UserStore {}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === '/telegram/webhook') {
      return handleTelegramWebhook(request, env, ctx);
    }

    if ((url.pathname === '/compat' || url.pathname === '/android/compat') && request.method === 'POST') {
      const original = request.clone();
      const body = await original.json().catch(() => ({}));
      const payload = body?.payload && typeof body.payload === 'object' ? body.payload : {};
      const action = String(payload.action || '');

      try {
        if (url.pathname === '/compat' && SUPPORT_ACTIONS.has(action)) {
          return await handleSupportCompat(request, env, ctx, body, payload, action);
        }
        if (url.pathname === '/android/compat' && action === 'supportCreate') {
          return await handleAndroidSupportCreate(request, env, ctx, body, payload);
        }
      } catch (error) {
        return jsonError(error, request, env);
      }
    }

    return coreV14.fetch(request, env, ctx);
  },

  async scheduled(controller, env, ctx) {
    if (typeof coreV14.scheduled === 'function') return coreV14.scheduled(controller, env, ctx);
  },
};

async function handleSupportCompat(request, env, ctx, body, payload, action) {
  if (!isAllowedOrigin(request, env)) throw httpError(403, 'Origin not allowed');
  const store = env.USERS.get(env.USERS.idFromName('global'));

  if (action === 'supportAdminList' || action === 'supportReply' || action === 'supportSetStatus') {
    const verified = await verifyFreshTelegramInitData(String(body.telegramInitData || ''), env.TELEGRAM_BOT_TOKEN);
    const actorId = cleanUserId(verified.user?.id);
    const role = await callStore(store, '/admin-role/check', { userId: actorId });
    if (role?.isAdmin !== true || (role?.isBanned === true && role?.isRoot !== true)) {
      throw httpError(403, 'Admin only');
    }

    if (action === 'supportAdminList') {
      return json(await callStore(store, '/support/admin-list', {}), 200, corsHeaders(request, env));
    }

    if (action === 'supportSetStatus') {
      const result = await callStore(store, '/support/status', {
        ticketId: payload.ticketId,
        status: payload.status,
      });
      await audit(store, actorId, action, cleanId(payload.ticketId));
      return json({ ...result, adminAccess: publicRole(role) }, 200, corsHeaders(request, env));
    }

    const result = await callStore(store, '/support/reply', {
      ticketId: payload.ticketId,
      message: payload.message,
    });
    if (!result?.ticket) throw httpError(502, 'Не удалось сохранить ответ поддержки');

    // v14 intercepts supportReply before the legacy v5 webhook wrapper, so
    // deliver the answer here as part of the current hardened entrypoint.
    const delivered = await sendSupportAnswerToUser(env, result.ticket);
    await audit(store, actorId, action, cleanId(payload.ticketId), { delivered });
    return json({ ...result, delivered, adminAccess: publicRole(role) }, 200, corsHeaders(request, env));
  }

  const verified = await verifyFreshTelegramInitData(String(body.telegramInitData || ''), env.TELEGRAM_BOT_TOKEN);
  const userId = cleanUserId(verified.user?.id);
  if (!userId) throw httpError(401, 'Telegram user missing');

  if (action === 'supportList') {
    return json(await callStore(store, '/support/user-list', { userId }), 200, corsHeaders(request, env));
  }

  const result = await callStore(store, '/support/create', {
    userId,
    source: 'web',
    subject: payload.subject,
    message: payload.message,
  });
  if (result?.ticket) {
    ctx.waitUntil(notifyAllActiveAdmins(env, store, result.ticket, verified.user || {}).catch(() => {}));
  }
  return json(result, 200, corsHeaders(request, env));
}

async function handleAndroidSupportCreate(request, env, ctx, body, payload) {
  if (!isAllowedOrigin(request, env)) throw httpError(403, 'Origin not allowed');

  // Reuse the already hardened Android session endpoint from v14 instead of
  // weakening authentication in the support hotfix.
  const response = await coreV14.fetch(new Request(new URL('/android/auth/me', request.url), {
    method: 'GET',
    headers: request.headers,
  }), env, ctx);
  const auth = await response.json().catch(() => ({}));
  if (!response.ok || auth?.success !== true || auth?.isBanned === true) {
    throw httpError(response.status || 401, auth?.error || 'Android session invalid');
  }

  const userId = cleanUserId(auth.userId);
  if (!userId) throw httpError(401, 'Android user missing');
  const store = env.USERS.get(env.USERS.idFromName('global'));
  const result = await callStore(store, '/support/create', {
    userId,
    source: 'android',
    subject: payload.subject,
    message: payload.message,
  });
  if (result?.ticket) {
    ctx.waitUntil(notifyAllActiveAdmins(env, store, result.ticket, { id: userId }).catch(() => {}));
  }
  return json(result, 200, corsHeaders(request, env));
}

async function handleTelegramWebhook(request, env, ctx) {
  if (request.method !== 'POST') return new Response('Not found', { status: 404 });
  if (!env.TELEGRAM_BOT_TOKEN) return new Response('Bot is not configured', { status: 503 });

  const expected = await telegramWebhookSecret(env);
  const received = String(request.headers.get('X-Telegram-Bot-Api-Secret-Token') || '');
  if (!received || !constantTimeStringEqual(expected, received)) return new Response('Unauthorized', { status: 401 });

  const delegateRequest = request.clone();
  const update = await request.json().catch(() => null);
  if (!update || typeof update !== 'object') return new Response('OK');

  const updateId = Number(update.update_id || 0);
  if (updateId && wasRecentlyHandled(updateId)) return new Response('OK');
  if (updateId) markHandled(updateId);

  const handled = await handleSupportTelegramUpdate(update, env, ctx).catch(async (error) => {
    const adminId = String(env.ADMIN_TELEGRAM_ID || '');
    if (adminId) {
      await telegramSendMessage(env, adminId, `⚠️ Ошибка обработчика техподдержки: ${String(error?.message || error).slice(0, 500)}`).catch(() => {});
    }
    return true;
  });

  if (handled) return new Response('OK');
  return coreV14.fetch(delegateRequest, env, ctx);
}

async function handleSupportTelegramUpdate(update, env, ctx) {
  const callbackQuery = update?.callback_query;
  if (callbackQuery) {
    const callbackId = String(callbackQuery?.id || '');
    const chatId = String(callbackQuery?.message?.chat?.id || '');
    const chatType = String(callbackQuery?.message?.chat?.type || '');
    const senderId = cleanUserId(callbackQuery?.from?.id);
    const data = String(callbackQuery?.data || '');
    if (!callbackId || !chatId || chatType !== 'private' || !senderId || chatId !== senderId) return data === 'support:start';
    if (data !== 'support:start') return false;
    await telegramApi(env, 'answerCallbackQuery', { callback_query_id: callbackId }).catch(() => {});
    await sendSupportPrompt(env, chatId, Number(callbackQuery?.message?.message_id || 0));
    return true;
  }

  const message = update?.message;
  if (!message?.chat || message.chat.type !== 'private') return false;
  const chatId = cleanUserId(message.chat.id);
  const senderId = cleanUserId(message.from?.id);
  if (!chatId || !senderId || chatId !== senderId) return false;
  const text = String(message.text || message.caption || '').trim();

  if (message.reply_to_message && text) {
    const ticketId = ticketIdFromAdminNotification(message.reply_to_message);
    if (ticketId) {
      const store = env.USERS.get(env.USERS.idFromName('global'));
      const role = await callStore(store, '/admin-role/check', { userId: senderId });
      if (role?.isAdmin === true && (role?.isBanned !== true || role?.isRoot === true)) {
        await handleAdminTelegramReply(env, store, senderId, ticketId, text, message.message_id);
        return true;
      }
    }
  }

  const supportCommand = text.match(/^\/support(?:@[A-Za-z0-9_]+)?(?:\s+([\s\S]*))?$/i);
  if (supportCommand) {
    const directMessage = String(supportCommand[1] || '').trim();
    if (directMessage) await createTicketFromTelegram(env, message, directMessage);
    else await sendSupportPrompt(env, chatId, message.message_id);
    return true;
  }

  if (/^\/cancel(?:@[A-Za-z0-9_]+)?$/i.test(text)) {
    await telegramSendMessage(env, chatId, 'Отправка обращения отменена. Когда понадобится помощь, используйте /support.');
    return true;
  }

  if (isReplyToSupportPrompt(message.reply_to_message)) {
    if (/^\/cancel$/i.test(text)) {
      await telegramSendMessage(env, chatId, 'Отправка обращения отменена.');
      return true;
    }
    await createTicketFromTelegram(env, message, text);
    return true;
  }

  return false;
}

async function createTicketFromTelegram(env, message, userMessage) {
  const cleanMessage = String(userMessage || '').trim().slice(0, 2000);
  const chatId = cleanUserId(message.chat?.id);
  if (!chatId) return;
  if (cleanMessage.length < 10) {
    await telegramSendMessage(env, chatId, 'Сообщение слишком короткое. Опишите вопрос хотя бы в нескольких словах.');
    return;
  }
  const store = env.USERS.get(env.USERS.idFromName('global'));
  const result = await callStore(store, '/support/create', {
    userId: chatId,
    source: 'web',
    subject: 'Обращение из Telegram',
    message: cleanMessage,
  });
  if (!result?.ticket) {
    await telegramSendMessage(env, chatId, String(result?.error || 'Не удалось создать обращение. Попробуйте позже.'));
    return;
  }
  await telegramSendMessage(env, chatId, [
    '✅ Обращение отправлено',
    `№ ${result.ticket.id}`,
    '',
    'Ответ техподдержки придёт прямо в этот чат.',
  ].join('\n'), { replyToMessageId: message.message_id });
  await notifyAllActiveAdmins(env, store, result.ticket, message.from || {});
}

async function handleAdminTelegramReply(env, store, adminChatId, ticketId, answer, replyToMessageId) {
  const result = await callStore(store, '/support/reply', { ticketId, message: answer.slice(0, 2000) });
  if (!result?.ticket) {
    await telegramSendMessage(env, adminChatId, `Не удалось найти обращение ${ticketId}.`, { replyToMessageId });
    return;
  }
  const delivered = await sendSupportAnswerToUser(env, result.ticket);
  await audit(store, adminChatId, 'supportReplyTelegram', cleanId(ticketId), { delivered });
  await telegramSendMessage(env, adminChatId, delivered
    ? `✅ Ответ сохранён и отправлен пользователю.\n№ ${result.ticket.id}`
    : `✅ Ответ сохранён, но Telegram не смог доставить его пользователю.\n№ ${result.ticket.id}`,
    { replyToMessageId });
}

async function notifyAllActiveAdmins(env, store, ticket, from = {}) {
  const ownerId = cleanUserId(env.ADMIN_TELEGRAM_ID);
  const admins = new Map();
  if (ownerId) admins.set(ownerId, true);
  if (ownerId) {
    const listed = await callStore(store, '/admin-role/list', { actorId: ownerId }).catch(() => ({ admins: [] }));
    for (const admin of listed.admins || []) {
      const id = cleanUserId(admin?.id);
      if (!id || admin?.isBanned === true) continue;
      admins.set(id, true);
    }
  }

  const username = cleanUsername(from?.username);
  const firstMessage = Array.isArray(ticket?.messages)
    ? String(ticket.messages.find((item) => item.sender === 'user')?.body || '')
    : '';
  const text = [
    '🎧 Новое обращение в техподдержку',
    `№ ${String(ticket?.id || '')}`,
    `Пользователь: ${String(ticket?.userId || '')}${username ? ` · @${username}` : ''}`,
    `Источник: ${String(ticket?.source || 'web')}`,
    `Тема: ${String(ticket?.subject || '')}`,
    '',
    firstMessage.slice(0, 1200),
    '',
    '↩️ Ответьте на это сообщение (Reply), чтобы отправить ответ пользователю.',
  ].join('\n');

  await Promise.all([...admins.keys()].map(async (adminId) => {
    try { await telegramSendMessage(env, adminId, text); } catch {}
  }));
}

async function sendSupportAnswerToUser(env, ticket) {
  const userId = cleanUserId(ticket?.userId);
  if (!userId) return false;
  const messages = Array.isArray(ticket?.messages) ? ticket.messages : [];
  const lastAdmin = [...messages].reverse().find((item) => item.sender === 'admin');
  const body = String(lastAdmin?.body || '').trim();
  if (!body) return false;
  try {
    await telegramSendMessage(env, userId, [
      '🎧 Ответ техподдержки',
      `№ ${String(ticket?.id || '')}`,
      '',
      body.slice(0, 3000),
      '',
      'Чтобы создать новое обращение, отправьте /support.',
    ].join('\n'));
    return true;
  } catch {
    return false;
  }
}

async function sendSupportPrompt(env, chatId, replyToMessageId = 0) {
  const payload = {
    chat_id: String(chatId),
    text: [
      SUPPORT_PROMPT_PREFIX,
      '',
      'Опишите проблему, предложение или вопрос одним сообщением.',
      'Минимум 10 символов. Для отмены отправьте /cancel.',
    ].join('\n'),
    reply_markup: {
      force_reply: true,
      selective: true,
      input_field_placeholder: 'Сообщение в техподдержку…',
    },
  };
  if (replyToMessageId) payload.reply_parameters = { message_id: replyToMessageId, allow_sending_without_reply: true };
  await telegramApi(env, 'sendMessage', payload);
}

function isReplyToSupportPrompt(reply) {
  if (!reply?.from?.is_bot) return false;
  return String(reply.text || reply.caption || '').startsWith(SUPPORT_PROMPT_PREFIX);
}
function ticketIdFromAdminNotification(reply) {
  if (!reply?.from?.is_bot) return '';
  const body = String(reply.text || reply.caption || '');
  if (!/новое обращение/i.test(body) || !/техподдерж/i.test(body)) return '';
  return body.match(TICKET_RE)?.[1] || '';
}

async function verifyFreshTelegramInitData(initData, botToken) {
  const verified = await verifyTelegramInitData(initData, botToken);
  const params = new URLSearchParams(String(initData || ''));
  const authDate = Number(params.get('auth_date') || 0);
  const now = Math.floor(Date.now() / 1000);
  const age = now - authDate;
  if (!authDate || age < -60 || age > 24 * 60 * 60) throw httpError(401, 'Telegram session expired');
  return verified;
}

async function verifyTelegramInitData(initData, botToken) {
  if (!botToken) throw httpError(500, 'Telegram secret is not configured');
  const params = new URLSearchParams(String(initData || ''));
  const receivedHash = params.get('hash') || '';
  if (!receivedHash) throw httpError(401, 'Telegram hash missing');
  params.delete('hash');
  const checkString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
  const secretKey = await hmacBytes(encoder.encode('WebAppData'), encoder.encode(botToken));
  const expected = await hmacBytes(secretKey, encoder.encode(checkString));
  const received = hexToBytes(receivedHash);
  if (!constantTimeEqual(expected, received)) throw httpError(401, 'Telegram signature invalid');
  let user = {};
  try { user = JSON.parse(params.get('user') || '{}'); } catch {}
  if (!user?.id) throw httpError(401, 'Telegram user missing');
  return { user };
}

async function telegramWebhookSecret(env) {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(String(env.TELEGRAM_BOT_TOKEN || ''))));
  return [...digest].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}
async function telegramApi(env, method, payload) {
  const response = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload || {}),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data?.ok !== true) throw new Error(String(data?.description || `Telegram HTTP ${response.status}`));
  return data.result;
}
async function telegramSendMessage(env, chatId, text, options = {}) {
  const payload = { chat_id: String(chatId), text: String(text || '').slice(0, 4096), disable_web_page_preview: true };
  if (options.replyToMessageId) payload.reply_parameters = { message_id: Number(options.replyToMessageId), allow_sending_without_reply: true };
  return telegramApi(env, 'sendMessage', payload);
}

async function callStore(stub, pathname, body) {
  const response = await stub.fetch(`https://users.internal${pathname}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data?.ok === false) throw httpError(response.status || 500, data?.error || `Store HTTP ${response.status}`);
  return data;
}
async function audit(store, actorId, action, targetId = '', details = {}) {
  try { await callStore(store, '/admin-audit/log', { actorId, action, targetId, details }); } catch {}
}
function publicRole(role = {}) { return { isAdmin: role.isAdmin === true, isRoot: role.isRoot === true, role: role.role || 'none' }; }
function cleanUserId(value) { const id = String(value || '').trim(); return /^\d{5,20}$/.test(id) ? id : ''; }
function cleanId(value) { const text = String(value || '').trim(); return /^sup_[a-z0-9_]{6,80}$/i.test(text) ? text : ''; }
function cleanUsername(value) { return String(value || '').trim().replace(/^@+/, '').replace(/[^A-Za-z0-9_]/g, '').slice(0, 64); }
function isAllowedOrigin(request, env) { return String(env.ALLOWED_ORIGINS || 'https://vidalost.github.io').split(',').map((item) => item.trim()).includes(request.headers.get('Origin') || ''); }
function corsHeaders(request, env) { return { 'Access-Control-Allow-Origin': String(env.ALLOWED_ORIGINS || 'https://vidalost.github.io').split(',').map((item) => item.trim()).includes(request.headers.get('Origin') || '') ? request.headers.get('Origin') || '' : 'https://vidalost.github.io', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Telegram-Init-Data', Vary: 'Origin' }; }
function json(value, status = 200, headers = {}) { return new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers } }); }
function jsonError(error, request, env) { return json({ ok: false, success: false, error: String(error?.message || error) }, Number(error?.status || 500), corsHeaders(request, env)); }
function httpError(status, message) { const error = new Error(message); error.status = status; return error; }
async function hmacBytes(keyBytes, dataBytes) { const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']); return new Uint8Array(await crypto.subtle.sign('HMAC', key, dataBytes)); }
function hexToBytes(hex) { if (!/^[0-9a-f]{64}$/i.test(hex)) return new Uint8Array(); const bytes = new Uint8Array(hex.length / 2); for (let index = 0; index < bytes.length; index += 1) bytes[index] = parseInt(hex.slice(index * 2, index * 2 + 2), 16); return bytes; }
function constantTimeEqual(a, b) { if (!(a instanceof Uint8Array) || !(b instanceof Uint8Array) || a.length !== b.length) return false; let diff = 0; for (let index = 0; index < a.length; index += 1) diff |= a[index] ^ b[index]; return diff === 0; }
function constantTimeStringEqual(a, b) { const left = encoder.encode(String(a || '')); const right = encoder.encode(String(b || '')); if (left.length !== right.length) return false; let diff = 0; for (let index = 0; index < left.length; index += 1) diff |= left[index] ^ right[index]; return diff === 0; }
function wasRecentlyHandled(updateId) { const now = Date.now(); const previous = Number(recentUpdates.get(String(updateId)) || 0); if (previous && now - previous < 10 * 60_000) return true; return false; }
function markHandled(updateId) { recentUpdates.set(String(updateId), Date.now()); if (recentUpdates.size > 500) { const cutoff = Date.now() - 10 * 60_000; for (const [key, timestamp] of recentUpdates) if (timestamp < cutoff) recentUpdates.delete(key); } }
