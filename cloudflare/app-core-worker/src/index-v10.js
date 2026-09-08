import coreV9, { UserStore } from './index-v9.js';

export { UserStore };

const encoder = new TextEncoder();
let cachedBotUsername = '';

const PLAY_CUSTOM_EMOJI_ID = '5224314565776417323';
const SUPPORT_CUSTOM_EMOJI_ID = '5224665219791364705';
const WELCOME_COVER_FILE_ID = 'AgACAgIAAxkBAAIM6mqQT40Lfj65EhwH2eDuwIQpgALfAALSJmsbT-aBSMq1H8s5KKTqAQADAgADeQADPQQ';

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

  const isRoot=Boolean(env.ADMIN_TELEGRAM_ID) && senderId===String(env.ADMIN_TELEGRAM_ID);
  const requested=/\s+lang_(ru|en|de|es)$/i.exec(text)?.[1]?.toLowerCase();
  const language=isRoot && requested ? requested : 'ru';
  ctx.waitUntil(sendRichWelcomeMessage(env, chatId, language, isRoot).catch(async (error) => {
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

export const WELCOME_LANGUAGES = {
  ru: ['Библейские игры','Играй вместе с друзьями и открывай Библию по-новому.',' Играть',' Поддержка','Мини-игры • комнаты • прогресс'],
  en: ['Bible Games','Play with friends and discover the Bible in a new way.',' Play',' Support','Mini-games • rooms • progress'],
  de: ['Bibelspiele','Spiele mit Freunden und entdecke die Bibel auf neue Weise.',' Spielen',' Hilfe','Minispiele • Räume • Fortschritt'],
  es: ['Juegos bíblicos','Juega con amigos y descubre la Biblia de una nueva manera.',' Jugar',' Ayuda','Minijuegos • salas • progreso'],
};
async function sendRichWelcomeMessage(env, chatId, language='ru', isRoot=false) {
  const miniAppUrl = await getMainMiniAppUrl(env) + (isRoot ? `=lang_${language}` : '');
  const copy=WELCOME_LANGUAGES[language] || WELCOME_LANGUAGES.ru;
  const languageButtons=isRoot ? [{type:'buttons',align:'center',buttons:
    Object.entries({ru:'Русский',en:'English',de:'Deutsch',es:'Español'}).map(([lang,text])=>({text, url:miniAppUrl.replace(/\?startapp.*$/,`?start=lang_${lang}`)}))
  }] : [];

  return telegramApi(env, 'sendRichMessage', {
    chat_id: String(chatId),
    rich_message: {
      blocks: [
        {
          type: 'photo',
          photo: {
            type: 'photo',
            media: WELCOME_COVER_FILE_ID,
          },
        },
        {
          type: 'heading',
          size: 1,
          text: copy[0],
        },
        {
          type: 'paragraph',
          text: copy[1],
        },
        {
          type: 'buttons',
          align: 'center',
          buttons: [
            {
              text: [
                {
                  type: 'custom_emoji',
                  custom_emoji_id: PLAY_CUSTOM_EMOJI_ID,
                  alternative_text: '▶️',
                },
                copy[2],
              ],
              style: 'primary',
              url: miniAppUrl,
            },
            {
              text: [
                {
                  type: 'custom_emoji',
                  custom_emoji_id: SUPPORT_CUSTOM_EMOJI_ID,
                  alternative_text: '🎧',
                },
                copy[3],
              ],
              style: 'primary',
              callback_data: 'support:start',
            },
          ],
        },
        ...languageButtons,
        { type: 'divider' },
        {
          type: 'footer',
          text: copy[4],
        },
      ],
      skip_entity_detection: true,
    },
  });
}

async function getMainMiniAppUrl(env) {
  const botUsername = await getBotUsername(env);
  return `https://t.me/${botUsername}?startapp`;
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
