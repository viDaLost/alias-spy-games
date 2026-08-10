import core, { UserStore } from './index-v3.js';

export { UserStore };

const ANDROID_USER_ACTIONS = new Set(['syncUser', 'updateHistory']);

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname !== '/android/compat') return core.fetch(request, env, ctx);

    const cors = corsHeaders(request, env);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (request.method !== 'POST') return json({ success: false, error: 'Not found' }, 404, cors);

    try {
      if (!isAllowedOrigin(request, env)) throw httpError(403, 'Origin not allowed');
      const body = await request.json();
      const androidUserId = String(body?.androidUserId || '').trim();
      if (!/^\d{5,20}$/.test(androidUserId)) throw httpError(400, 'Bad Android user id');
      if (androidUserId === String(env.ADMIN_TELEGRAM_ID || '')) throw httpError(403, 'Admin login is not allowed in Android ID mode');

      const payload = body?.payload && typeof body.payload === 'object' ? body.payload : {};
      const action = String(payload.action || '');
      if (!ANDROID_USER_ACTIONS.has(action)) throw httpError(403, 'Android ID mode allows user actions only');

      const store = env.USERS.get(env.USERS.idFromName('global'));
      const syntheticUser = { id: androidUserId, username: '' };

      if (action === 'syncUser') {
        const clientUser = payload.user && typeof payload.user === 'object' ? payload.user : {};
        if (String(clientUser.id || '') !== androidUserId) throw httpError(403, 'User mismatch');
        const result = await callStore(store, '/sync', { verifiedUser: syntheticUser, clientUser });
        return json(syncResponse(result.user), 200, cors);
      }

      if (String(payload.id || '') !== androidUserId) throw httpError(403, 'User mismatch');
      await callStore(store, '/history', { id: androidUserId, history: payload.history });
      return json({ success: true, source: 'cloudflare-sql-android' }, 200, cors);
    } catch (error) {
      return json({ success: false, error: String(error?.message || 'Server error') }, Number(error?.status || 500), cors);
    }
  },
};

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
    'Access-Control-Allow-Methods': 'POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
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
