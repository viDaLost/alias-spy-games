import coreV11, { UserStore } from './index-v11.js';

export { UserStore };

const encoder = new TextEncoder();
const PROFILE_ACTIONS = new Set([
  'profileBootstrap',
  'profileSearch',
  'profileAddFriend',
  'profileRemoveFriend',
  'profileSetFavorites',
  'profileTrackGame',
  'profileInviteFriend',
]);

const INVITABLE_GAMES = new Map([
  ['quartet', { title: 'Квартет', startKey: 'quartet' }],
  ['bible-sketch', { title: 'Библейский художник', startKey: 'sketch' }],
]);

const INVITE_COOLDOWN_MS = 12_000;
const inviteCooldown = new Map();
let cachedBotUsername = '';
let botUsernamePromise = null;

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if ((url.pathname === '/compat' || url.pathname === '/android/compat') && request.method === 'POST') {
      const body = await request.clone().json().catch(() => ({}));
      const payload = body?.payload && typeof body.payload === 'object' ? body.payload : {};
      const action = String(payload.action || '');
      if (PROFILE_ACTIONS.has(action)) {
        if (url.pathname === '/android/compat') {
          return handleAndroidProfileCompat(request, env, ctx, payload, action);
        }
        return handleProfileCompat(request, env, body, payload, action);
      }
    }

    return coreV11.fetch(request, env, ctx);
  },

  async scheduled(controller, env, ctx) {
    if (typeof coreV11.scheduled === 'function') return coreV11.scheduled(controller, env, ctx);
  },
};

async function handleProfileCompat(request, env, body, payload, action) {
  const cors = corsHeaders(request, env);
  try {
    if (!isAllowedOrigin(request, env)) throw httpError(403, 'Origin not allowed');
    const verified = await verifyTelegramInitData(String(body.telegramInitData || ''), env.TELEGRAM_BOT_TOKEN);
    const userId = cleanUserId(verified.user?.id);
    if (!userId) throw httpError(401, 'Telegram user missing');

    const displayName = sanitizeDisplayName(
      [verified.user?.first_name, verified.user?.last_name].filter(Boolean).join(' ')
      || verified.user?.username
      || 'Игрок'
    );
    const store = env.USERS.get(env.USERS.idFromName('global'));
    const result = await executeProfileAction(
      env,
      store,
      userId,
      displayName,
      verified.user || {},
      payload,
      action,
    );
    return json(result, 200, cors);
  } catch (error) {
    return profileError(error, cors);
  }
}

async function handleAndroidProfileCompat(request, env, ctx, payload, action) {
  const cors = corsHeaders(request, env);
  try {
    if (!isAllowedOrigin(request, env)) throw httpError(403, 'Origin not allowed');
    const userId = await authenticateAndroidRequest(request, env, ctx);
    const claimedId = cleanUserId(payload.userId || payload.id);
    if (claimedId && claimedId !== userId) throw httpError(403, 'User mismatch');

    // An Android session proves identity independently of Telegram initData. Do
    // not overwrite a Telegram-provided display name when the standalone APK
    // does not know it; player_profiles keeps the existing non-empty name.
    const displayName = sanitizeDisplayName(payload.displayName || '');
    const senderName = displayName || `Игрок ${userId.slice(-4)}`;
    const store = env.USERS.get(env.USERS.idFromName('global'));
    const result = await executeProfileAction(
      env,
      store,
      userId,
      displayName,
      { first_name: senderName },
      payload,
      action,
    );
    return json(result, 200, cors);
  } catch (error) {
    return profileError(error, cors);
  }
}

async function executeProfileAction(env, store, userId, displayName, sender, payload, action) {
  if (action === 'profileBootstrap') {
    return callStore(store, '/profile/bootstrap', { userId, displayName });
  }
  if (action === 'profileSearch') {
    return callStore(store, '/profile/search', { userId, query: payload.query });
  }
  if (action === 'profileAddFriend') {
    return callStore(store, '/profile/friend-add', { userId, friendId: payload.friendId });
  }
  if (action === 'profileRemoveFriend') {
    return callStore(store, '/profile/friend-remove', { userId, friendId: payload.friendId });
  }
  if (action === 'profileSetFavorites') {
    return callStore(store, '/profile/favorites', { userId, displayName, favorites: payload.favorites });
  }
  if (action === 'profileTrackGame') {
    return callStore(store, '/profile/track', { userId, displayName, game: payload.game });
  }
  if (action === 'profileInviteFriend') {
    return inviteFriendToGame(env, store, sender || {}, userId, payload);
  }
  throw httpError(400, 'Unsupported profile action');
}

async function authenticateAndroidRequest(request, env, ctx) {
  const headers = new Headers(request.headers);
  const verifyRequest = new Request(new URL('/android/auth/me', request.url), {
    method: 'GET',
    headers,
  });
  const response = await coreV11.fetch(verifyRequest, env, ctx);
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data?.success !== true || data?.isBanned === true) {
    throw httpError(data?.isBanned ? 403 : 401, data?.error || 'Android session invalid');
  }
  const userId = cleanUserId(data.userId);
  if (!userId) throw httpError(401, 'Android session invalid');
  return userId;
}

function profileError(error, cors) {
  return json(
    { ok: false, success: false, error: String(error?.message || error) },
    Number(error?.status || 500),
    cors,
  );
}

async function inviteFriendToGame(env, store, sender, userId, payload) {
  const friendId = cleanUserId(payload.friendId);
  const game = cleanInviteGame(payload.game);
  const room = cleanRoomId(payload.room);
  if (!friendId) throw httpError(400, 'Некорректный Telegram ID друга');
  if (!game) throw httpError(400, 'Для этой игры приглашения пока недоступны');
  if (!room) throw httpError(400, 'Некорректный код комнаты');
  if (friendId === userId) throw httpError(400, 'Нельзя пригласить самого себя');

  const search = await callStore(store, '/profile/search', { userId, query: friendId });
  if (!search?.found || !search?.user) throw httpError(404, 'Друг не найден');
  if (search.user.isFriend !== true) throw httpError(403, 'Приглашать можно только пользователей из списка друзей');
  if (search.user.isBanned) throw httpError(403, 'Профиль друга недоступен');

  enforceInviteCooldown(userId, friendId, game, room);

  const config = INVITABLE_GAMES.get(game);
  const botUsername = await resolveBotUsername(env);
  const startParam = `join_${config.startKey}_${room}`;
  const inviteUrl = `https://t.me/${encodeURIComponent(botUsername)}?startapp=${encodeURIComponent(startParam)}`;
  const senderName = sanitizeDisplayName(
    [sender.first_name, sender.last_name].filter(Boolean).join(' ')
    || sender.username
    || 'Друг'
  );

  const text = [
    `🎮 ${senderName} приглашает вас в «${config.title}»`,
    '',
    `Комната: ${room}`,
    'Нажмите кнопку ниже — приложение откроет нужную игру и подключит вас к комнате.',
  ].join('\n');

  try {
    await telegramSendInvite(env, friendId, text, inviteUrl);
  } catch (error) {
    const message = String(error?.message || error);
    if (/blocked|chat not found|user is deactivated/i.test(message)) {
      throw httpError(409, 'Друг пока не может получить сообщение от бота. Попросите его открыть «Библейские игры» в Telegram.');
    }
    throw error;
  }

  return {
    ok: true,
    success: true,
    friendId,
    game,
    room,
    inviteUrl,
    delivered: true,
  };
}

function enforceInviteCooldown(userId, friendId, game, room) {
  const now = Date.now();
  const key = `${userId}:${friendId}:${game}:${room}`;
  const previous = Number(inviteCooldown.get(key) || 0);
  if (previous && now - previous < INVITE_COOLDOWN_MS) {
    throw httpError(429, 'Приглашение этому другу уже отправлено. Подождите несколько секунд.');
  }
  inviteCooldown.set(key, now);

  if (inviteCooldown.size > 1200) {
    const cutoff = now - 5 * 60_000;
    for (const [entry, timestamp] of inviteCooldown) {
      if (timestamp < cutoff) inviteCooldown.delete(entry);
    }
  }
}

async function resolveBotUsername(env) {
  if (cachedBotUsername) return cachedBotUsername;
  if (botUsernamePromise) return botUsernamePromise;
  if (!env.TELEGRAM_BOT_TOKEN) throw httpError(500, 'Telegram secret is not configured');

  botUsernamePromise = fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/getMe`, {
    method: 'GET',
    headers: { Accept: 'application/json' },
  }).then(async (response) => {
    const data = await response.json().catch(() => ({}));
    const username = String(data?.result?.username || '').replace(/^@+/, '');
    if (!response.ok || data?.ok !== true || !/^[A-Za-z0-9_]{3,64}$/.test(username)) {
      throw httpError(502, String(data?.description || 'Не удалось определить Telegram-бота'));
    }
    cachedBotUsername = username;
    return cachedBotUsername;
  }).finally(() => {
    botUsernamePromise = null;
  });

  return botUsernamePromise;
}

async function telegramSendInvite(env, chatId, text, inviteUrl) {
  const response = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: String(chatId),
      text: String(text || '').slice(0, 4096),
      disable_web_page_preview: true,
      reply_markup: {
        inline_keyboard: [[{ text: '🎮 Войти в игру', url: String(inviteUrl) }]],
      },
    }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data?.ok !== true) {
    throw new Error(String(data?.description || `Telegram HTTP ${response.status}`));
  }
  return data.result;
}

async function callStore(stub, pathname, body) {
  const response = await stub.fetch(`https://users.internal${pathname}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data?.ok === false) {
    throw httpError(response.status || 500, data?.error || `Store HTTP ${response.status}`);
  }
  return data;
}

function cleanInviteGame(value) {
  const key = String(value || '').trim().toLowerCase();
  return INVITABLE_GAMES.has(key) ? key : '';
}

function cleanRoomId(value) {
  const room = String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10);
  return /^[A-Z0-9]{4,10}$/.test(room) ? room : '';
}

function cleanUserId(value) {
  const id = String(value || '').trim();
  return /^\d{5,20}$/.test(id) ? id : '';
}

function sanitizeDisplayName(value) {
  return String(value || '').replace(/[<>\r\n\t]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
}

async function verifyTelegramInitData(initData, botToken) {
  if (!botToken) throw httpError(500, 'Telegram secret is not configured');
  const params = new URLSearchParams(String(initData || ''));
  const receivedHash = params.get('hash') || '';
  if (!receivedHash) throw httpError(401, 'Telegram hash missing');

  const authDate = Number(params.get('auth_date') || 0);
  const nowSec = Math.floor(Date.now() / 1000);
  if (!authDate || Math.abs(nowSec - authDate) > 24 * 60 * 60) {
    throw httpError(401, 'Telegram session expired');
  }

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

async function hmacBytes(keyBytes, dataBytes) {
  const key = await crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, dataBytes));
}

function constantTimeEqual(a, b) {
  if (!(a instanceof Uint8Array) || !(b instanceof Uint8Array) || a.length !== b.length) return false;
  let diff = 0;
  for (let index = 0; index < a.length; index += 1) diff |= a[index] ^ b[index];
  return diff === 0;
}

function hexToBytes(hex) {
  if (!/^[0-9a-f]{64}$/i.test(hex)) return new Uint8Array();
  const bytes = new Uint8Array(hex.length / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}

function allowedOrigins(env) {
  return String(env.ALLOWED_ORIGINS || 'https://vidalost.github.io')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function isAllowedOrigin(request, env) {
  return allowedOrigins(env).includes(request.headers.get('Origin') || '');
}

function corsHeaders(request, env) {
  const origin = request.headers.get('Origin') || '';
  const allowed = allowedOrigins(env);
  return {
    'Access-Control-Allow-Origin': allowed.includes(origin) ? origin : allowed[0] || 'https://vidalost.github.io',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

function json(value, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...extraHeaders,
    },
  });
}

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}
