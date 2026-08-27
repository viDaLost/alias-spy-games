import coreV9, { UserStore } from './index-v9.js';

export { UserStore };

const encoder = new TextEncoder();
let cachedBotUsername = '';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === '/telegram/webhook' && request.method === 'POST') {
      const handled = await tryHandleRichWelcome(request, env, ctx);
      if (handled) return new Response('OK');
    }

    return coreV9.fetch(request, env, ctx);
  },

  async scheduled(controller, env, ctx) {
    if (typeof coreV9.scheduled === 'function') {
      return coreV9.scheduled(controller, env, ctx);
    }
  },
};

async function tryHandleRichWelcome(request, env, ctx) {
  if (!env.TELEGRAM_BOT_TOKEN) return false;

  const expected = await telegramWebhookSecret(env);
  const received = String(request.headers.get('X-Telegram-Bot-Api-Secret-Token') || '');
  if (!received || !constantTimeStringEqual(expected, received)) return false;

  const update = await request.clone().json().catch(() => null);
  const message = update?.message;
  if (!message?.chat || message.chat.type !== 'private') return false;

  const chatId = String(message.chat.id || '');
  const senderId = String(message.from?.id || '');
  if (!chatId || !senderId || chatId !== senderId) return false;

  const text = String(message.text || '').trim();
  if (!/^\/(?:start|help)(?:@[A-Za-z0-9_]+)?(?:\s+.*)?$/i.test(text)) return false;

  ctx.waitUntil(sendRichWelcomeMessage(env, chatId).catch(async (error) => {
    const adminId = String(env.ADMIN_TELEGRAM_ID || '');
    if (adminId) {
      await telegramSendMessage(
        env,
        adminId,
        `⚠️ Ошибка Rich Message приветствия: ${String(error?.message || error).slice(0, 500)}`,
      ).catch(() => {});
    }
  }));

  return true;
}

async function sendRichWelcomeMessage(env, chatId) {
  const botUsername = await getBotUsername(env);
  const miniAppUrl = `https://t.me/${botUsername}?startapp`;

  const html = [
    '<h1>👋 Библейские игры</h1>',
    '<p>Игры для компании, друзей и семьи — прямо в Telegram.</p>',
    '<p>Откройте приложение или быстро свяжитесь с техподдержкой.</p>',
    '<tg-button-row align="center">',
    `  <tg-button type="url" style="primary" url="${escapeHtmlAttribute(miniAppUrl)}">🎮 Открыть Библейские игры</tg-button>`,
    '</tg-button-row>',
    '<tg-button-row align="center">',
    '  <tg-button type="callback_data" style="success" data="support:start">🎧 Техподдержка</tg-button>',
    '</tg-button-row>',
    '<hr/>',
    '<footer>Коды входа и ответы поддержки будут приходить в этот чат.</footer>',
  ].join('\n');

  return telegramApi(env, 'sendRichMessage', {
    chat_id: String(chatId),
    rich_message: {
      html,
      skip_entity_detection: true,
    },
  });
}

async function getBotUsername(env) {
  if (cachedBotUsername) return cachedBotUsername;

  const profile = await telegramApi(env, 'getMe', {});
  const username = String(profile?.username || '').replace(/^@+/, '');
  if (!/^[A-Za-z0-9_]{5,32}$/.test(username)) {
    throw new Error('Telegram bot username is unavailable');
  }

  cachedBotUsername = username;
  return cachedBotUsername;
}

async function telegramSendMessage(env, chatId, text) {
  return telegramApi(env, 'sendMessage', {
    chat_id: String(chatId),
    text: String(text || '').slice(0, 4096),
    disable_web_page_preview: true,
  });
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
  const digest = new Uint8Array(
    await crypto.subtle.digest('SHA-256', encoder.encode(String(env.TELEGRAM_BOT_TOKEN || ''))),
  );
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

function escapeHtmlAttribute(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}
