import baseV5, { AppStats as BaseAppStats } from './index-v5.js';

const SESSION_CACHE_MS = 30_000;
const sessionCache = new Map();

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const cors = corsHeaders(request, env);

    if (request.method === 'OPTIONS' && ['/admin/live', '/admin/stats'].includes(url.pathname)) {
      return new Response(null, { status: 204, headers: cors });
    }

    if (request.method === 'GET' && (url.pathname === '/admin/live' || url.pathname === '/admin/stats')) {
      try {
        if (!isAllowedOrigin(request, env)) throw httpError(403, 'Origin not allowed');
        await verifyAdminRequest(request, env);
        const stub = env.STATS.get(env.STATS.idFromName('global'));
        const internalPath = url.pathname === '/admin/live' ? '/live-snapshot' : '/snapshot';
        const response = await stub.fetch(`https://stats.internal${internalPath}`);
        const data = await response.json().catch(() => ({}));
        if (!response.ok || data?.ok === false) throw httpError(response.status || 500, data?.error || 'Stats unavailable');
        return json(data, 200, cors);
      } catch (error) {
        return json({ ok: false, error: String(error?.message || error) }, Number(error?.status || 500), cors);
      }
    }

    if (request.method === 'GET' && url.pathname === '/presence' && url.searchParams.get('token')) {
      const origin = request.headers.get('Origin') || '';
      try {
        if (!isAllowedOrigin(request, env)) throw httpError(403, 'Origin not allowed');
        if ((request.headers.get('Upgrade') || '').toLowerCase() !== 'websocket') throw httpError(426, 'WebSocket required');
        const sid = sanitizeSessionId(url.searchParams.get('sid'));
        if (!sid) throw httpError(400, 'Session id required');
        const session = await verifyScopedSession(env, String(url.searchParams.get('token') || ''), 'presence');
        const headers = new Headers(request.headers);
        headers.set('X-App-Session-Id', sid);
        headers.set('X-App-User-Id', sanitizeUserId(session.userId));
        if (session.username) headers.set('X-App-Username', sanitizeUsername(session.username));
        if (session.displayName) headers.set('X-App-Display-Name', sanitizeDisplayName(session.displayName));
        headers.set('X-App-Platform', 'telegram');
        const stub = env.STATS.get(env.STATS.idFromName('global'));
        return stub.fetch(new Request('https://stats.internal/presence', { method: 'GET', headers }));
      } catch (error) {
        return jsonError(String(error?.message || error), Number(error?.status || 500), origin, env);
      }
    }

    return baseV5.fetch(request, env, ctx);
  },
};

export class AppStats extends BaseAppStats {}

async function verifyAdminRequest(request, env) {
  const token = bearerToken(request);
  if (token.startsWith('bgw_')) {
    return verifyScopedSession(env, token, 'admin');
  }

  const initData = String(request.headers.get('X-Telegram-Init-Data') || '').trim();
  if (!initData) throw httpError(401, 'Admin web session required');

  const response = await env.APP_CORE.fetch('https://core.internal/admin/verify', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: request.headers.get('Origin') || 'https://vidalost.github.io',
    },
    body: JSON.stringify({ telegramInitData: initData }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data?.admin !== true) {
    throw httpError(response.status || 403, data?.error || 'Admin only');
  }
  return { userId: sanitizeUserId(data.userId || data.id || '') };
}

async function verifyScopedSession(env, token, expectedScope) {
  const clean = String(token || '').trim();
  if (!clean.startsWith('bgw_')) throw httpError(401, 'Web session required');
  const now = Date.now();
  const key = `${expectedScope}:${clean}`;
  const cached = sessionCache.get(key);
  if (cached && cached.cachedUntil > now && Number(cached.expiresAt || 0) > now) return cached;

  const response = await env.APP_CORE.fetch('https://core.internal/web/session/verify', {
    method: 'GET',
    headers: { Accept: 'application/json', Authorization: `Bearer ${clean}` },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data?.ok !== true) throw httpError(response.status || 401, data?.error || 'Session invalid');
  if (String(data.scope || '') !== expectedScope) throw httpError(403, 'Session scope mismatch');
  const verified = {
    userId: sanitizeUserId(data.userId),
    username: sanitizeUsername(data.username),
    displayName: sanitizeDisplayName(data.displayName),
    expiresAt: Number(data.expiresAt || 0),
    cachedUntil: Math.min(Number(data.expiresAt || now), now + SESSION_CACHE_MS),
  };
  if (!verified.userId) throw httpError(401, 'Session user missing');
  sessionCache.set(key, verified);
  if (sessionCache.size > 300) {
    for (const [cacheKey, value] of sessionCache) {
      if (Number(value.cachedUntil || 0) <= now) sessionCache.delete(cacheKey);
    }
  }
  return verified;
}

function bearerToken(request) {
  const header = String(request.headers.get('Authorization') || '');
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : '';
}
function sanitizeSessionId(value) { return String(value || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64); }
function sanitizeUserId(value) { return String(value || '').replace(/\D/g, '').slice(0, 24); }
function sanitizeUsername(value) { return String(value || '').trim().replace(/^@+/, '').replace(/[^a-zA-Z0-9_]/g, '').slice(0, 64); }
function sanitizeDisplayName(value) { return String(value || '').replace(/[<>\r\n\t]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80); }
function allowedOrigins(env) { return String(env.ALLOWED_ORIGINS || 'https://vidalost.github.io').split(',').map((item) => item.trim()).filter(Boolean); }
function isAllowedOrigin(request, env) { return allowedOrigins(env).includes(request.headers.get('Origin') || ''); }
function corsOrigin(origin, env) { const allowed = allowedOrigins(env); return allowed.includes(origin) ? origin : (allowed[0] || 'https://vidalost.github.io'); }
function corsHeaders(request, env) {
  const origin = request.headers.get('Origin') || '';
  return {
    'Access-Control-Allow-Origin': corsOrigin(origin, env),
    'Access-Control-Allow-Methods': 'GET,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, If-None-Match, X-Telegram-Init-Data',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}
function jsonError(message, status, origin, env) { return json({ ok: false, error: message }, status, { 'Access-Control-Allow-Origin': corsOrigin(origin, env), Vary: 'Origin' }); }
function json(value, status = 200, headers = {}) { return new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers } }); }
function httpError(status, message) { const error = new Error(message); error.status = status; return error; }
