import coreV4, { UserStore as V4UserStore } from './index-v4.js';

export class UserStore extends V4UserStore {}

const encoder = new TextEncoder();
const SUPPORT_PROMPT_PREFIX = '🎧 Техподдержка';
const TICKET_RE = /(?:№|ID обращения:)\s*(sup_[a-z0-9_]{6,80})/i;
const recentUpdates = new Map();

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === '/telegram/webhook') {
      return handleTelegramWebhook(request, env, ctx);
    }

    if (url.pathname === '/compat' && request.method === 'POST') {
      const action = await readCompatAction(request);
      const response = await coreV4.fetch(request, env, ctx);
      if (action === 'supportReply' && response.ok) {
        const copy = response.clone();
        ctx.waitUntil(copy.json().then(async (data) => {
          if (data?.ticket) await sendSupportAnswerToUser(env, data.ticket);
        }).catch(() => {}));
      }
      return response;
    }

    return coreV4.fetch(request, env, ctx);
  },
};

async function handleTelegramWebhook(request, env, ctx) {
  if (request.method !== 'POST') return new Response('Not found', { status: 404 });
  if (!env.TELEGRAM_BOT_TOKEN) return new Response('Bot is not configured', { status: 503 });

  const expected = await telegramWebhookSecret(env);
  const received = String(request.headers.get('X-Telegram-Bot-Api-Secret-Token') || '');
  if (!received || !constantTimeStringEqual(expected, received)) {
    return new Response('Unauthorized', { status: 401 });
  }

  const update = await request.json().catch(() => null);
  if (!update || typeof update !== 'object') return new Response('OK');

  const updateId = Number(update.update_id || 0);
  if (updateId && wasRecentlyHandled(updateId)) return new Response('OK');
  if (updateId) markHandled(updateId);

  ctx.waitUntil(
    processTelegramUpdate(update, env).catch(async (error) => {
      const adminId = String(env.ADMIN_TELEGRAM_ID || '');
      if (adminId) {
        await telegramSendMessage(env, adminId, `⚠️ Ошибка обработчика техподдержки: ${String(error?.message || error).slice(0, 500)}`).catch(() => {});
      }
    }),
  );

  return new Response('OK');
}

async function processTelegramUpdate(update, env) {
  const message = update?.message;
  if (!message?.chat || message.chat.type !== 'private') return;

  const chatId = String(message.chat.id || '');
  const senderId = String(message.from?.id || '');
  if (!chatId || !senderId || chatId !== senderId) return;

  const text = String(message.text || message.caption || '').trim();
  const adminId = String(env.ADMIN_TELEGRAM_ID || '');

  if (senderId === adminId && message.reply_to_message && text) {
    const ticketId = ticketIdFromAdminNotification(message.reply_to_message);
    if (ticketId) {
      await handleAdminTelegramReply(env, chatId, ticketId, text, message.message_id);
      return;
    }
  }

  const supportCommand = text.match(/^\/support(?:@[A-Za-z0-9_]+)?(?:\s+([\s\S]*))?$/i);
  if (supportCommand) {
    const directMessage = String(supportCommand[1] || '').trim();
    if (directMessage) {
      await createTicketFromTelegram(env, message, directMessage);
    } else {
      await sendSupportPrompt(env, chatId, message.message_id);
    }
    return;
  }

  if (/^\/cancel(?:@[A-Za-z0-9_]+)?$/i.test(text)) {
    await telegramSendMessage(env, chatId, 'Отправка обращения отменена. Когда понадобится помощь, используйте /support.');
    return;
  }

  if (/^\/(?:start|help)(?:@[A-Za-z0-9_]+)?(?:\s+.*)?$/i.test(text)) {
    await telegramSendMessage(env, chatId, [
      '👋 Библейские игры',
      '',
      'Через этого бота приходят коды входа и ответы техподдержки.',
      'Чтобы написать в техподдержку, отправьте /support.',
    ].join('\n'));
    return;
  }

  if (isReplyToSupportPrompt(message.reply_to_message)) {
    if (/^\/cancel$/i.test(text)) {
      await telegramSendMessage(env, chatId, 'Отправка обращения отменена.');
      return;
    }
    await createTicketFromTelegram(env, message, text);
    return;
  }

  if (text) {
    await telegramSendMessage(env, chatId, 'Чтобы отправить сообщение в техподдержку, используйте команду /support.');
  }
}

async function sendSupportPrompt(env, chatId, replyToMessageId = 0) {
  const payload = {
    chat_id: chatId,
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

async function createTicketFromTelegram(env, message, userMessage) {
  const chatId = String(message.chat.id || '');
  const cleanMessage = String(userMessage || '').trim().slice(0, 2000);
  if (cleanMessage.length < 10) {
    await telegramSendMessage(env, chatId, 'Сообщение слишком короткое. Опишите вопрос хотя бы в нескольких словах и снова отправьте /support.');
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

  const ticket = result.ticket;
  await telegramSendMessage(env, chatId, [
    '✅ Обращение отправлено',
    `№ ${ticket.id}`,
    '',
    'Ответ техподдержки придёт прямо в этот чат.',
  ].join('\n'), { replyToMessageId: message.message_id });

  await notifyAdminAboutTelegramTicket(env, ticket, message.from || {});
}

async function notifyAdminAboutTelegramTicket(env, ticket, from) {
  const adminId = String(env.ADMIN_TELEGRAM_ID || '');
  if (!adminId) return;
  const username = from?.username ? `@${String(from.username).replace(/^@+/, '')}` : '';
  const firstMessage = Array.isArray(ticket.messages)
    ? String(ticket.messages.find((item) => item.sender === 'user')?.body || '')
    : '';
  const text = [
    '🎧 Новое обращение в техподдержку',
    `№ ${String(ticket.id || '')}`,
    `Пользователь: ${String(ticket.userId || '')}${username ? ` · ${username}` : ''}`,
    'Источник: Telegram /support',
    `Тема: ${String(ticket.subject || '')}`,
    '',
    firstMessage.slice(0, 1200),
    '',
    '↩️ Ответьте на это сообщение свайпом/Reply — ответ уйдёт пользователю и сохранится в обращении.',
  ].join('\n');
  await telegramSendMessage(env, adminId, text);
}

function ticketIdFromAdminNotification(reply) {
  if (!reply?.from?.is_bot) return '';
  const body = String(reply.text || reply.caption || '');
  if (!/новое обращение/i.test(body) || !/техподдерж/i.test(body)) return '';
  return body.match(TICKET_RE)?.[1] || '';
}

async function handleAdminTelegramReply(env, adminChatId, ticketId, answer, replyToMessageId) {
  if (answer.length < 2) {
    await telegramSendMessage(env, adminChatId, 'Введите текст ответа пользователю.', { replyToMessageId });
    return;
  }

  const store = env.USERS.get(env.USERS.idFromName('global'));
  const result = await callStore(store, '/support/reply', {
    ticketId,
    message: answer.slice(0, 2000),
  });

  const ticket = result?.ticket;
  if (!ticket) {
    await telegramSendMessage(env, adminChatId, `Не удалось найти обращение ${ticketId}.`, { replyToMessageId });
    return;
  }

  const delivered = await sendSupportAnswerToUser(env, ticket);
  await telegramSendMessage(env, adminChatId, delivered
    ? `✅ Ответ сохранён и отправлен пользователю.\n№ ${ticket.id}`
    : `✅ Ответ сохранён в обращении, но Telegram не смог доставить сообщение пользователю.\n№ ${ticket.id}`,
  { replyToMessageId });
}

async function sendSupportAnswerToUser(env, ticket) {
  const userId = String(ticket?.userId || '');
  if (!/^\d{5,20}$/.test(userId)) return false;
  const messages = Array.isArray(ticket?.messages) ? ticket.messages : [];
  const lastAdminMessage = [...messages].reverse().find((item) => item.sender === 'admin');
  const body = String(lastAdminMessage?.body || '').trim();
  if (!body) return false;

  try {
    await telegramSendMessage(env, userId, [
      '🎧 Ответ техподдержки',
      `№ ${String(ticket.id || '')}`,
      '',
      body.slice(0, 3000),
      '',
      'Если хотите создать новое обращение, отправьте /support.',
    ].join('\n'));
    return true;
  } catch {
    return false;
  }
}

async function readCompatAction(request) {
  try {
    const body = await request.clone().json();
    return String(body?.payload?.action || '');
  } catch {
    return '';
  }
}

async function callStore(stub, pathname, body) {
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

async function telegramSendMessage(env, chatId, text, options = {}) {
  const payload = {
    chat_id: String(chatId),
    text: String(text || '').slice(0, 4096),
    disable_web_page_preview: true,
  };
  if (options.replyToMessageId) {
    payload.reply_parameters = {
      message_id: Number(options.replyToMessageId),
      allow_sending_without_reply: true,
    };
  }
  return telegramApi(env, 'sendMessage', payload);
}

async function telegramApi(env, method, payload) {
  const response = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload || {}),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data?.ok !== true) {
    throw new Error(String(data?.description || `Telegram HTTP ${response.status}`));
  }
  return data.result;
}

async function telegramWebhookSecret(env) {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(String(env.TELEGRAM_BOT_TOKEN || ''))));
  return [...digest].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function constantTimeStringEqual(a, b) {
  const left = encoder.encode(String(a || ''));
  const right = encoder.encode(String(b || ''));
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let i = 0; i < left.length; i += 1) diff |= left[i] ^ right[i];
  return diff === 0;
}

function wasRecentlyHandled(updateId) {
  pruneRecentUpdates();
  return recentUpdates.has(updateId);
}

function markHandled(updateId) {
  recentUpdates.set(updateId, Date.now());
  pruneRecentUpdates();
}

function pruneRecentUpdates() {
  const cutoff = Date.now() - 10 * 60 * 1000;
  for (const [id, timestamp] of recentUpdates) {
    if (timestamp < cutoff) recentUpdates.delete(id);
  }
  while (recentUpdates.size > 500) {
    const first = recentUpdates.keys().next().value;
    recentUpdates.delete(first);
  }
}
