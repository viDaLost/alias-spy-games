import coreV13, { UserStore as V13UserStore } from './index-v13.js';

export { UserStore };

const encoder = new TextEncoder();
const ADMIN_INIT_DATA_MAX_AGE_SECONDS = 30 * 60;
const ADMIN_SESSION_TTL_MS = 15 * 60 * 1000;

export class UserStore extends V13UserStore {}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const cors = corsHeaders(request, env);

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

    if (url.pathname === '/admin/verify' && request.method === 'POST') {
      return handleAdminVerify(request, env, cors);
    }

    if (url.pathname === '/web/session' && request.method === 'POST') {
      const body = await request.clone().json().catch(() => ({}));
      if (String(body?.scope || 'presence') === 'admin') {
        return handleAdminSessionIssue(request, env, body, cors);
      }
    }

    if (url.pathname === '/web/session/verify' && request.method === 'GET') {
      const token = bearerToken(request);
      if (token.startsWith('bgw_')) {
        return handleSessionVerify(request, env, token, cors);
      }
    }

    if (url.pathname === '/compat' && request.method === 'POST') {
      const body = await request.clone().json().catch(() => ({}));
      const payload = body?.payload && typeof body.payload === 'object' ? body.payload : {};
      const action = String(payload.action || '');
      const type = String(payload?.updateData?.type || '');

      if (action === 'getAdminData'
        || action === 'getAdminUsersByIds'
        || action === 'adminMessageUser'
        || (action === 'updateUser' && type === 'stars_bmt')) {
        return handleExtendedAdminCompat(request, env, body, payload, action, cors);
      }
    }

    return coreV13.fetch(request, env, ctx);
  },

  async scheduled(controller, env, ctx) {
    if (typeof coreV13.scheduled === 'function') return coreV13.scheduled(controller, env, ctx);
  },
};

async function handleAdminVerify(request, env, cors) {
  try {
    if (!isAllowedOrigin(request, env)) throw httpError(403, 'Origin not allowed');
    const body = await request.json().catch(() => ({}));
    const verified = await verifyFreshAdminInitData(String(body.telegramInitData || ''), env.TELEGRAM_BOT_TOKEN);
    const actorId = cleanUserId(verified.user?.id);
    const store = userStore(env);
    const role = await requireAdminRole(store, actorId);
    return json({ ok: true, success: true, admin: true, id: actorId, ...publicRole(role) }, 200, cors);
  } catch (error) {
    return json({ ok: false, success: false, admin: false, error: String(error?.message || error) }, Number(error?.status || 403), cors);
  }
}

async function handleAdminSessionIssue(request, env, body, cors) {
  try {
    if (!isAllowedOrigin(request, env)) throw httpError(403, 'Origin not allowed');
    const verified = await verifyFreshAdminInitData(String(body.telegramInitData || ''), env.TELEGRAM_BOT_TOKEN);
    const actorId = cleanUserId(verified.user?.id);
    const store = userStore(env);
    const role = await requireAdminRole(store, actorId);
    const session = await issueAdminSession(verified.user, env);
    await audit(store, actorId, 'adminSessionIssue', '', { expiresAt: session.expiresAt });
    return json({ ok: true, success: true, ...session, adminAccess: publicRole(role) }, 200, cors);
  } catch (error) {
    return json({ ok: false, success: false, error: String(error?.message || error) }, Number(error?.status || 500), cors);
  }
}

async function handleSessionVerify(_request, env, token, cors) {
  try {
    const session = await verifyWebSessionToken(token, env);
    if (session.scope === 'admin') {
      const store = userStore(env);
      const role = await requireAdminRole(store, session.userId);
      return json({ ok: true, success: true, ...session, adminAccess: publicRole(role) }, 200, cors);
    }
    return json({ ok: true, success: true, ...session }, 200, cors);
  } catch (error) {
    return json({ ok: false, success: false, error: String(error?.message || error) }, Number(error?.status || 401), cors);
  }
}

async function handleExtendedAdminCompat(request, env, body, payload, action, cors) {
  try {
    if (!isAllowedOrigin(request, env)) throw httpError(403, 'Origin not allowed');
    const verified = await verifyFreshAdminInitData(String(body.telegramInitData || ''), env.TELEGRAM_BOT_TOKEN);
    const actorId = cleanUserId(verified.user?.id);
    const store = userStore(env);
    const role = await requireAdminRole(store, actorId);

    if (action === 'getAdminData') {
      const data = await callStore(store, '/admin-data', {});
      const ids = Array.isArray(data.users) ? data.users.map((user) => cleanUserId(user?.id)).filter(Boolean) : [];
      const brief = ids.length ? await callStore(store, '/admin-users-brief-v2', { ids }) : { users: [] };
      const byId = new Map((brief.users || []).map((user) => [cleanUserId(user?.id), user]));
      const users = (data.users || []).map((user) => ({
        ...user,
        bmtStars: clampStars(byId.get(cleanUserId(user?.id))?.bmtStars),
      }));
      let admins;
      if (role.isRoot === true) {
        admins = (await callStore(store, '/admin-role/list', { actorId })).admins || [];
      }
      await audit(store, actorId, action, '', {});
      return json({
        ...data,
        users,
        ...(admins ? { admins } : {}),
        adminAccess: publicRole(role),
        source: 'cloudflare-sql-rbac',
      }, 200, cors);
    }

    if (action === 'getAdminUsersByIds') {
      const ids = [...new Set((Array.isArray(payload.ids) ? payload.ids : [])
        .map(cleanUserId)
        .filter(Boolean))].slice(0, 100);
      const result = await callStore(store, '/admin-users-brief-v2', { ids });
      await audit(store, actorId, action, '', { count: ids.length });
      return json({ ...result, adminAccess: publicRole(role) }, 200, cors);
    }

    if (action === 'adminMessageUser') {
      const targetId = cleanUserId(payload.targetId);
      const text = sanitizeMessage(payload.message);
      if (!targetId) throw httpError(400, 'Некорректный Telegram ID');
      if (!text) throw httpError(400, 'Введите сообщение');
      await telegramSendMessage(env, targetId, `👤 Сообщение администратора\n\n${text}`);
      await audit(store, actorId, action, targetId, { length: text.length });
      return json({ ok: true, success: true, delivered: true, adminAccess: publicRole(role) }, 200, cors);
    }

    if (action === 'updateUser' && String(payload?.updateData?.type || '') === 'stars_bmt') {
      const targetId = cleanUserId(payload?.updateData?.targetId);
      if (!targetId) throw httpError(400, 'Некорректный Telegram ID');
      await assertMayMutateTarget(store, role, targetId);
      const result = await callStore(store, '/admin-bmt-update-v2', {
        userId: targetId,
        balance: payload?.updateData?.value,
      });
      await audit(store, actorId, action, targetId, { type: 'stars_bmt' });
      return json({ ...result, adminAccess: publicRole(role), source: 'cloudflare-sql-rbac' }, 200, cors);
    }

    throw httpError(400, 'Unsupported admin action');
  } catch (error) {
    return json({ ok: false, success: false, error: String(error?.message || 'Server error') }, Number(error?.status || 500), cors);
  }
}

async function assertMayMutateTarget(store, actorRole, targetId) {
  const targetRole = await callStore(store, '/admin-role/check', { userId: targetId });
  if (actorRole?.isRoot !== true && targetRole?.isAdmin === true) {
    throw httpError(403, 'Назначенный администратор не может изменять привилегированные аккаунты');
  }
}

async function requireAdminRole(store, actorId) {
  if (!actorId) throw httpError(401, 'Telegram user missing');
  const role = await callStore(store, '/admin-role/check', { userId: actorId });
  if (role?.isAdmin !== true) throw httpError(403, 'Admin only');
  if (role?.isBanned === true && role?.isRoot !== true) throw httpError(403, 'Admin account is blocked');
  return role;
}

async function issueAdminSession(user, env) {
  const now = Date.now();
  const payload = {
    sub: cleanUserId(user?.id),
    scope: 'admin',
    iat: now,
    exp: now + ADMIN_SESSION_TTL_MS,
    username: cleanUsername(user?.username),
    displayName: cleanDisplayName([user?.first_name, user?.last_name].filter(Boolean).join(' ')),
  };
  if (!payload.sub) throw httpError(401, 'Telegram user missing');
  const encoded = base64UrlEncode(encoder.encode(JSON.stringify(payload)));
  const signature = await sessionSignature(encoded, env.TELEGRAM_BOT_TOKEN);
  return { token: `bgw_${encoded}.${bytesToHex(signature)}`, expiresAt: payload.exp, scope: 'admin' };
}

async function verifyWebSessionToken(token, env) {
  const match = String(token || '').match(/^bgw_([A-Za-z0-9_-]{20,900})\.([0-9a-f]{64})$/i);
  if (!match) throw httpError(401, 'Web session missing');
  const expected = await sessionSignature(match[1], env.TELEGRAM_BOT_TOKEN);
  const received = hexToBytes(match[2]);
  if (!constantTimeEqual(expected, received)) throw httpError(401, 'Web session signature invalid');

  let payload = {};
  try { payload = JSON.parse(new TextDecoder().decode(base64UrlDecode(match[1]))); } catch {}
  const now = Date.now();
  const userId = cleanUserId(payload.sub);
  const scope = String(payload.scope || '');
  if (!userId || !['presence', 'admin'].includes(scope)) throw httpError(401, 'Web session invalid');
  if (!Number(payload.exp) || Number(payload.exp) <= now || Number(payload.iat) > now + 60_000) {
    throw httpError(401, 'Web session expired');
  }
  return {
    userId,
    scope,
    expiresAt: Number(payload.exp),
    username: cleanUsername(payload.username),
    displayName: cleanDisplayName(payload.displayName),
  };
}

async function verifyFreshAdminInitData(initData, botToken) {
  const verified = await verifyTelegramInitData(initData, botToken);
  const params = new URLSearchParams(String(initData || ''));
  const authDate = Number(params.get('auth_date') || 0);
  const now = Math.floor(Date.now() / 1000);
  const age = now - authDate;
  if (!authDate || age < -60 || age > ADMIN_INIT_DATA_MAX_AGE_SECONDS) {
    throw httpError(401, 'Admin session expired. Reopen the Telegram Mini App.');
  }
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

async function sessionSignature(encodedPayload, botToken) {
  if (!botToken) throw httpError(500, 'Telegram secret is not configured');
  const derived = await hmacBytes(encoder.encode(botToken), encoder.encode('bible-games-web-session-v1'));
  return hmacBytes(derived, encoder.encode(encodedPayload));
}

async function telegramSendMessage(env, chatId, text) {
  if (!env.TELEGRAM_BOT_TOKEN) throw httpError(503, 'Telegram bot is not configured');
  const response = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: String(chatId),
      text: String(text || '').slice(0, 3900),
      disable_web_page_preview: true,
    }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data?.ok !== true) throw httpError(response.status || 502, data?.description || 'Telegram delivery failed');
}

async function audit(store, actorId, action, targetId = '', details = {}) {
  try { await callStore(store, '/admin-audit/log', { actorId, action, targetId, details }); } catch {}
}

function userStore(env) {
  return env.USERS.get(env.USERS.idFromName('global'));
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

function bearerToken(request) {
  const header = String(request.headers.get('Authorization') || '');
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : '';
}

function publicRole(role = {}) {
  return { isAdmin: role.isAdmin === true, isRoot: role.isRoot === true, role: role.role || 'none' };
}

function cleanUserId(value) {
  const id = String(value || '').trim();
  return /^\d{5,20}$/.test(id) ? id : '';
}
function cleanUsername(value) {
  return String(value || '').trim().replace(/^@+/, '').replace(/[^A-Za-z0-9_]/g, '').slice(0, 64);
}
function cleanDisplayName(value) {
  return String(value || '').replace(/[<>\r\n\t]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
}
function sanitizeMessage(value) {
  return String(value || '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim().slice(0, 2000);
}
function clampStars(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.min(999_999, Math.trunc(n))) : 0;
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
function bytesToHex(bytes) {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}
function base64UrlEncode(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}
function base64UrlDecode(value) {
  const base64 = String(value || '').replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (ch) => ch.charCodeAt(0));
}
