import core from './index-v3.js';
import { AndroidAuthUserStore } from './android-auth-user-store.js';

export class UserStore extends AndroidAuthUserStore {}

const encoder = new TextEncoder();
const ANDROID_USER_ACTIONS = new Set(['syncUser', 'updateHistory', 'supportCreate', 'supportList', 'accessStatus']);
const SUPPORT_USER_ACTIONS = new Set(['supportCreate', 'supportList']);
const SUPPORT_ADMIN_ACTIONS = new Set(['supportAdminList', 'supportReply', 'supportSetStatus']);
const BROADCAST_ACTIONS = new Set([
  'broadcast',
  'broadcastCreate',
  'broadcastStatus',
  'broadcastHistory',
  'broadcastCancel',
  'broadcastRepeat',
]);

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const cors = corsHeaders(request, env);

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

    if (url.pathname === '/android/auth/request' && request.method === 'POST') {
      return handleAndroidAuthRequest(request, env, cors);
    }
    if (url.pathname === '/android/auth/verify' && request.method === 'POST') {
      return handleAndroidAuthVerify(request, env, cors);
    }
    if (url.pathname === '/android/auth/me' && request.method === 'GET') {
      return handleAndroidAuthMe(request, env, cors);
    }
    if (url.pathname === '/android/auth/logout' && request.method === 'POST') {
      return handleAndroidAuthLogout(request, env, cors);
    }

    if (url.pathname === '/broadcast/upload') {
      return handleBroadcastUpload(request, env, ctx, cors);
    }

    if (url.pathname === '/compat' && request.method === 'POST') {
      let action = '';
      try {
        const body = await request.clone().json();
        const payload = body?.payload && typeof body.payload === 'object' ? body.payload : {};
        action = String(payload.action || '');
        const isSupport = SUPPORT_USER_ACTIONS.has(action) || SUPPORT_ADMIN_ACTIONS.has(action);
        if (BROADCAST_ACTIONS.has(action) || isSupport) {
          if (!isAllowedOrigin(request, env)) throw httpError(403, 'Origin not allowed');
          const store = env.USERS.get(env.USERS.idFromName('global'));
          if (BROADCAST_ACTIONS.has(action)) {
            await verifyAdmin(String(body.telegramInitData || ''), env);
            return handleBroadcastAction(store, action, payload, cors);
          }
          if (SUPPORT_ADMIN_ACTIONS.has(action)) {
            await verifyAdmin(String(body.telegramInitData || ''), env);
            return handleSupportAdminAction(store, action, payload, cors);
          }
          const verified = await verifyTelegramInitData(String(body.telegramInitData || ''), env.TELEGRAM_BOT_TOKEN);
          const userId = String(verified.user.id || '');
          if (action === 'supportList') {
            return json(await callStore(store, '/support/user-list', { userId }), 200, cors);
          }
          const result = await callStore(store, '/support/create', {
            userId,
            source: 'web',
            subject: payload.subject,
            message: payload.message,
          });
          if (result.ticket) ctx.waitUntil(notifySupportAdmin(env, result.ticket));
          return json(result, 200, cors);
        }
      } catch (error) {
        if (BROADCAST_ACTIONS.has(action) || SUPPORT_USER_ACTIONS.has(action) || SUPPORT_ADMIN_ACTIONS.has(action)) {
          return json({ success: false, ok: false, error: String(error?.message || 'Server error') }, Number(error?.status || 500), cors);
        }
      }
      return core.fetch(request, env, ctx);
    }

    if (url.pathname === '/android/access' && request.method === 'GET') {
      try {
        if (!isAllowedOrigin(request, env)) throw httpError(403, 'Origin not allowed');
        const session = await requireAndroidSession(request, env);
        const store = env.USERS.get(env.USERS.idFromName('global'));
        const access = await callStore(store, '/access', { id: session.userId });
        return json({
          success: true,
          userId: session.userId,
          isBanned: Boolean(access.isBanned),
          source: 'cloudflare-sql-android-session',
        }, 200, cors);
      } catch (error) {
        return json({ success: false, error: String(error?.message || 'Server error') }, Number(error?.status || 500), cors);
      }
    }

    if (url.pathname !== '/android/compat') return core.fetch(request, env, ctx);
    if (request.method !== 'POST') return json({ success: false, error: 'Not found' }, 404, cors);

    try {
      if (!isAllowedOrigin(request, env)) throw httpError(403, 'Origin not allowed');
      const body = await request.json();
      const session = await requireAndroidSession(request, env);
      const androidUserId = session.userId;
      const claimedUserId = String(body?.androidUserId || '').trim();
      if (claimedUserId && claimedUserId !== androidUserId) throw httpError(403, 'User mismatch');

      const payload = body?.payload && typeof body.payload === 'object' ? body.payload : {};
      const action = String(payload.action || '');
      if (!ANDROID_USER_ACTIONS.has(action)) throw httpError(403, 'Android ID mode allows user actions only');

      const store = env.USERS.get(env.USERS.idFromName('global'));
      const syntheticUser = { id: androidUserId, username: '' };

      if (action === 'supportList') {
        return json(await callStore(store, '/support/user-list', { userId: androidUserId }), 200, cors);
      }

      if (action === 'supportCreate') {
        const result = await callStore(store, '/support/create', {
          userId: androidUserId,
          source: 'android',
          subject: payload.subject,
          message: payload.message,
        });
        if (result.ticket) ctx.waitUntil(notifySupportAdmin(env, result.ticket));
        return json(result, 200, cors);
      }

      const access = await callStore(store, '/access', { id: androidUserId });
      const isBanned = Boolean(access.isBanned);

      if (action === 'accessStatus') {
        return json({ success: true, isBanned, source: 'cloudflare-sql-android-access' }, 200, cors);
      }

      if (action === 'syncUser') {
        const clientUser = payload.user && typeof payload.user === 'object' ? payload.user : {};
        if (String(clientUser.id || '') !== androidUserId) throw httpError(403, 'User mismatch');
        if (isBanned) return json({ success: true, isBanned: true, source: 'cloudflare-sql-android-access' }, 200, cors);
        const result = await callStore(store, '/sync', { verifiedUser: syntheticUser, clientUser });
        return json(syncResponse(result.user), 200, cors);
      }

      if (isBanned) throw httpError(403, 'Доступ ограничен');
      if (String(payload.id || '') !== androidUserId) throw httpError(403, 'User mismatch');
      await callStore(store, '/history', { id: androidUserId, history: payload.history });
      return json({ success: true, source: 'cloudflare-sql-android' }, 200, cors);
    } catch (error) {
      return json({ success: false, error: String(error?.message || 'Server error') }, Number(error?.status || 500), cors);
    }
  },
};


const ANDROID_AUTH_CODE_TTL_MS = 10 * 60 * 1000;
const ANDROID_AUTH_SESSION_TTL_MS = 90 * 24 * 60 * 60 * 1000;

async function handleAndroidAuthRequest(request, env, cors) {
  try {
    if (!isAllowedOrigin(request, env)) throw httpError(403, 'Origin not allowed');
    if (!env.TELEGRAM_BOT_TOKEN) throw httpError(500, 'Telegram secret is not configured');
    const body = await request.json().catch(() => ({}));
    const telegramId = String(body?.telegramId || '').trim();
    if (!/^\d{5,20}$/.test(telegramId)) throw httpError(400, 'Введите корректный Telegram ID');
    if (telegramId === String(env.ADMIN_TELEGRAM_ID || '')) throw httpError(403, 'Вход администратора через Android недоступен');

    const challengeId = `ach_${crypto.randomUUID().replaceAll('-', '')}`;
    const code = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000).padStart(6, '0');
    const codeHash = await authHmacHex(env.TELEGRAM_BOT_TOKEN, `${challengeId}:${telegramId}:${code}`);
    const requestKey = await authSha256Hex([
      request.headers.get('CF-Connecting-IP') || 'unknown',
      request.headers.get('User-Agent') || '',
    ].join('|'));
    const expiresAt = Date.now() + ANDROID_AUTH_CODE_TTL_MS;
    const store = env.USERS.get(env.USERS.idFromName('global'));
    await callStore(store, '/android-auth/begin', { challengeId, telegramId, codeHash, requestKey, expiresAt });

    const sent = await telegramSendLoginCode(env, telegramId, code);
    if (!sent.ok) {
      await callStore(store, '/android-auth/drop', { challengeId }).catch(() => {});
      const botUsername = await telegramBotUsername(env).catch(() => '');
      const needsStart = sent.status === 400 || sent.status === 403;
      return json({
        success: false,
        code: needsStart ? 'BOT_START_REQUIRED' : 'TELEGRAM_DELIVERY_FAILED',
        requiresBotStart: needsStart,
        botUsername,
        error: needsStart
          ? 'Бот пока не может написать вам. Откройте бота, нажмите Start и запросите код ещё раз.'
          : 'Не удалось отправить код в Telegram. Попробуйте ещё раз.',
      }, needsStart ? 409 : 502, cors);
    }

    return json({
      success: true,
      challengeId,
      expiresInSeconds: Math.floor(ANDROID_AUTH_CODE_TTL_MS / 1000),
    }, 200, cors);
  } catch (error) {
    return json({ success: false, error: String(error?.message || 'Не удалось запросить код') }, Number(error?.status || 500), cors);
  }
}

async function handleAndroidAuthVerify(request, env, cors) {
  try {
    if (!isAllowedOrigin(request, env)) throw httpError(403, 'Origin not allowed');
    if (!env.TELEGRAM_BOT_TOKEN) throw httpError(500, 'Telegram secret is not configured');
    const body = await request.json().catch(() => ({}));
    const challengeId = String(body?.challengeId || '').trim();
    const code = String(body?.code || '').trim();
    if (!/^ach_[a-zA-Z0-9_-]{20,80}$/.test(challengeId) || !/^\d{6}$/.test(code)) {
      throw httpError(400, 'Введите шестизначный код из Telegram');
    }

    const codeHash = await authHmacHex(env.TELEGRAM_BOT_TOKEN, `${challengeId}:${String(body?.telegramId || '').trim()}:${code}`);
    // The challenge owns the Telegram ID. For privacy, the client repeats the ID
    // only as part of the HMAC input; the store never trusts it for the session.
    const telegramId = String(body?.telegramId || '').trim();
    if (!/^\d{5,20}$/.test(telegramId)) throw httpError(400, 'Telegram ID отсутствует');
    const correctedCodeHash = await authHmacHex(env.TELEGRAM_BOT_TOKEN, `${challengeId}:${telegramId}:${code}`);
    const token = `bgs_${authRandomBase64Url(32)}`;
    const tokenHash = await authSha256Hex(token);
    const sessionExpiresAt = Date.now() + ANDROID_AUTH_SESSION_TTL_MS;
    const store = env.USERS.get(env.USERS.idFromName('global'));
    const result = await callStore(store, '/android-auth/consume', {
      challengeId,
      codeHash: correctedCodeHash || codeHash,
      tokenHash,
      sessionExpiresAt,
    });
    if (String(result.userId || '') !== telegramId) throw httpError(403, 'Telegram ID не совпадает с кодом');
    return json({
      success: true,
      userId: String(result.userId || ''),
      token,
      expiresAt: Number(result.expiresAt || sessionExpiresAt),
      source: 'telegram-code-session',
    }, 200, cors);
  } catch (error) {
    return json({ success: false, error: String(error?.message || 'Код не подтверждён') }, Number(error?.status || 500), cors);
  }
}

async function handleAndroidAuthMe(request, env, cors) {
  try {
    const session = await requireAndroidSession(request, env);
    const store = env.USERS.get(env.USERS.idFromName('global'));
    const access = await callStore(store, '/access', { id: session.userId });
    return json({ success: true, userId: session.userId, isBanned: Boolean(access.isBanned), expiresAt: session.expiresAt }, 200, cors);
  } catch (error) {
    return json({ success: false, error: String(error?.message || 'Сессия недействительна') }, Number(error?.status || 401), cors);
  }
}

async function handleAndroidAuthLogout(request, env, cors) {
  try {
    const token = androidBearerToken(request);
    if (token) {
      const tokenHash = await authSha256Hex(token);
      const store = env.USERS.get(env.USERS.idFromName('global'));
      await callStore(store, '/android-auth/revoke', { tokenHash }).catch(() => {});
    }
    return json({ success: true }, 200, cors);
  } catch {
    return json({ success: true }, 200, cors);
  }
}

async function requireAndroidSession(request, env) {
  const token = androidBearerToken(request);
  if (!token) throw httpError(401, 'Требуется подтверждённый вход');
  const tokenHash = await authSha256Hex(token);
  const store = env.USERS.get(env.USERS.idFromName('global'));
  const session = await callStore(store, '/android-auth/session', { tokenHash });
  const userId = String(session.userId || '');
  if (!/^\d{5,20}$/.test(userId)) throw httpError(401, 'Сессия недействительна');
  return { userId, expiresAt: Number(session.expiresAt || 0) };
}

function androidBearerToken(request) {
  const header = String(request.headers.get('Authorization') || '');
  const match = header.match(/^Bearer\s+(bgs_[A-Za-z0-9_-]{40,80})$/i);
  return match ? match[1] : '';
}

async function telegramSendLoginCode(env, telegramId, code) {
  const response = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: telegramId,
      text: [
        '🔐 Вход в «Библейские игры»',
        '',
        `Код подтверждения: ${code}`,
        '',
        'Код действует 10 минут. Никому его не сообщайте.',
        'Если вы не запрашивали вход, просто проигнорируйте это сообщение.',
      ].join('\n'),
      disable_web_page_preview: true,
    }),
  });
  const data = await response.json().catch(() => ({}));
  return { ok: response.ok && data?.ok === true, status: response.status, description: String(data?.description || '') };
}

async function telegramBotUsername(env) {
  const response = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/getMe`);
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data?.ok !== true) return '';
  return String(data?.result?.username || '').replace(/^@+/, '').replace(/[^A-Za-z0-9_]/g, '').slice(0, 64);
}

async function authHmacHex(secret, value) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(String(secret || '')),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(String(value || ''))));
  return [...signature].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function authSha256Hex(value) {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(value || ''))));
  return [...digest].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function authRandomBase64Url(size) {
  const bytes = new Uint8Array(size);
  crypto.getRandomValues(bytes);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/g, '');
}

async function handleSupportAdminAction(store, action, payload, cors) {
  if (action === 'supportAdminList') {
    return json(await callStore(store, '/support/admin-list', {}), 200, cors);
  }
  if (action === 'supportReply') {
    return json(await callStore(store, '/support/reply', { ticketId: payload.ticketId, message: payload.message }), 200, cors);
  }
  return json(await callStore(store, '/support/status', { ticketId: payload.ticketId, status: payload.status }), 200, cors);
}

async function notifySupportAdmin(env, ticket = {}) {
  if (!env.TELEGRAM_BOT_TOKEN || !env.ADMIN_TELEGRAM_ID) return;
  const firstMessage = Array.isArray(ticket.messages) ? ticket.messages.find((item) => item.sender === 'user')?.body || '' : '';
  const text = [
    '🎧 Новое обращение в техподдержку',
    `№ ${String(ticket.id || '')}`,
    `Пользователь: ${String(ticket.userId || '')}`,
    `Источник: ${ticket.source === 'android' ? 'Android' : 'Web'}`,
    `Тема: ${String(ticket.subject || '')}`,
    '',
    String(firstMessage || '').slice(0, 900),
    '',
    'Откройте админ-панель → Техподдержка для ответа.',
  ].join('\n');
  try {
    await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: String(env.ADMIN_TELEGRAM_ID),
        text,
        disable_web_page_preview: true,
      }),
    });
  } catch {}
}

async function handleBroadcastAction(store, action, payload, cors) {
  let path = '';
  let body = {};

  if (action === 'broadcast' || action === 'broadcastCreate') {
    path = '/broadcast/create';
    body = {
      config: action === 'broadcast'
        ? { kind: 'text', text: String(payload.text || ''), audience: 'all', html: true }
        : (payload.config || {}),
    };
  } else if (action === 'broadcastStatus') {
    path = '/broadcast/status';
    body = { jobId: payload.jobId };
  } else if (action === 'broadcastHistory') {
    path = '/broadcast/history';
  } else if (action === 'broadcastCancel') {
    path = '/broadcast/cancel';
    body = { jobId: payload.jobId };
  } else if (action === 'broadcastRepeat') {
    path = '/broadcast/repeat';
    body = { jobId: payload.jobId };
  }

  const data = await callStore(store, path, body);
  return json(data, 200, cors);
}

async function handleBroadcastUpload(request, env, ctx, cors) {
  try {
    if (request.method !== 'POST') throw httpError(405, 'Method not allowed');
    if (!isAllowedOrigin(request, env)) throw httpError(403, 'Origin not allowed');
    if (!env.TELEGRAM_BOT_TOKEN) throw httpError(500, 'Telegram secret is not configured');

    const form = await request.formData();
    await verifyAdmin(String(form.get('telegramInitData') || ''), env);
    const kind = String(form.get('kind') || '');
    if (!['photo', 'document'].includes(kind)) throw httpError(400, 'Unsupported media type');

    const file = form.get('file');
    if (!file || typeof file.arrayBuffer !== 'function') throw httpError(400, 'File is missing');
    const size = Number(file.size || 0);
    const maxSize = kind === 'photo' ? 10 * 1024 * 1024 : 50 * 1024 * 1024;
    if (!size || size > maxSize) throw httpError(400, kind === 'photo' ? 'Фото должно быть не больше 10 МБ' : 'Файл должен быть не больше 50 МБ');
    if (kind === 'photo' && file.type && !String(file.type).startsWith('image/')) throw httpError(400, 'Выберите изображение');

    const uploaded = await uploadToTelegram(env, kind, file);
    if (uploaded.messageId) ctx.waitUntil(deleteTelegramMessage(env, uploaded.messageId));

    return json({
      success: true,
      fileId: uploaded.fileId,
      kind,
      name: String(file.name || (kind === 'photo' ? 'photo' : 'document')).slice(0, 180),
      size,
      mimeType: String(file.type || ''),
    }, 200, cors);
  } catch (error) {
    return json({ success: false, error: String(error?.message || 'Upload failed') }, Number(error?.status || 500), cors);
  }
}

async function uploadToTelegram(env, kind, file) {
  const method = kind === 'photo' ? 'sendPhoto' : 'sendDocument';
  const field = kind === 'photo' ? 'photo' : 'document';
  const form = new FormData();
  form.append('chat_id', String(env.ADMIN_TELEGRAM_ID || ''));
  form.append('disable_notification', 'true');
  form.append(field, file, String(file.name || field));

  const response = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`, {
    method: 'POST',
    body: form,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data?.ok) throw httpError(502, String(data?.description || `Telegram HTTP ${response.status}`));

  const result = data.result || {};
  const fileId = kind === 'photo'
    ? String(Array.isArray(result.photo) && result.photo.length ? result.photo[result.photo.length - 1]?.file_id || '' : '')
    : String(result.document?.file_id || '');
  if (!fileId) throw httpError(502, 'Telegram did not return file_id');
  return { fileId, messageId: Number(result.message_id || 0) };
}

async function deleteTelegramMessage(env, messageId) {
  try {
    await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/deleteMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: String(env.ADMIN_TELEGRAM_ID || ''), message_id: messageId }),
    });
  } catch {}
}

async function verifyAdmin(initData, env) {
  const verified = await verifyTelegramInitData(initData, env.TELEGRAM_BOT_TOKEN);
  if (String(verified.user.id) !== String(env.ADMIN_TELEGRAM_ID || '')) throw httpError(403, 'Admin only');
  return verified;
}

async function safeAction(request) {
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
  let data = null;
  try { data = await response.json(); } catch {}
  if (!response.ok || data?.ok === false) throw httpError(response.status || 500, data?.error || `Store HTTP ${response.status}`);
  return data || {};
}

function syncResponse(record = {}) {
  return {
    success: true,
    isBanned: Boolean(record.isBanned),
    wowStars: finite(record.wowStars, 20),
    wsStars: finite(record.wsStars, 0),
    swLevel: finite(record.swLevel, 0),
    lastGames: Array.isArray(record.lastGames) ? record.lastGames.slice(0, 3) : [],
    source: 'cloudflare-sql-android',
  };
}

function finite(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

async function verifyTelegramInitData(initData, botToken) {
  if (!botToken) throw httpError(500, 'Telegram secret is not configured');
  const params = new URLSearchParams(String(initData || ''));
  const receivedHash = params.get('hash') || '';
  if (!receivedHash) throw httpError(401, 'Telegram hash missing');

  const authDate = Number(params.get('auth_date') || 0);
  const nowSec = Math.floor(Date.now() / 1000);
  if (!authDate || Math.abs(nowSec - authDate) > 24 * 60 * 60) throw httpError(401, 'Telegram session expired');

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
  const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, dataBytes));
}

function constantTimeEqual(a, b) {
  if (!(a instanceof Uint8Array) || !(b instanceof Uint8Array) || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a[i] ^ b[i];
  return diff === 0;
}

function hexToBytes(hex) {
  if (!/^[0-9a-f]{64}$/i.test(hex)) return new Uint8Array();
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i += 1) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return bytes;
}

function allowedOrigins(env) {
  return String(env.ALLOWED_ORIGINS || 'https://vidalost.github.io').split(',').map((item) => item.trim()).filter(Boolean);
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
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

function json(value, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...extraHeaders },
  });
}

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}
