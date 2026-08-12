import { SqlUserStore } from './sql-user-store.js';

const encoder = new TextEncoder();
const USER_ACTIONS = new Set(['syncUser', 'updateHistory']);
const ADMIN_ACTIONS = new Set(['getAdminData', 'updateUser']);

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const cors = corsHeaders(request, env);

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

    try {
      if (url.pathname === '/health' && request.method === 'GET') {
        return json({ ok: true, service: 'alias-spy-games-core', storage: 'cloudflare-sql', now: Date.now() }, 200, cors);
      }

      if (url.pathname !== '/compat' || request.method !== 'POST') {
        return json({ ok: false, error: 'Not found' }, 404, cors);
      }

      if (!isAllowedOrigin(request, env)) throw httpError(403, 'Origin not allowed');

      const body = await readJson(request);
      const payload = body?.payload && typeof body.payload === 'object' ? body.payload : {};
      const action = String(payload.action || '');
      if (!USER_ACTIONS.has(action) && !ADMIN_ACTIONS.has(action)) throw httpError(400, 'Unknown action');

      const verified = await verifyTelegramInitData(String(body.telegramInitData || ''), env.TELEGRAM_BOT_TOKEN);
      const verifiedId = String(verified.user.id);
      const isAdmin = verifiedId === String(env.ADMIN_TELEGRAM_ID || '');
      const store = env.USERS.get(env.USERS.idFromName('global'));

      if (action === 'syncUser') {
        const clientUser = payload.user && typeof payload.user === 'object' ? payload.user : {};
        if (String(clientUser.id || '') !== verifiedId) throw httpError(403, 'User mismatch');
        const result = await callStore(store, '/sync', { verifiedUser: verified.user, clientUser });
        return json(syncResponse(result.user), 200, cors);
      }

      if (action === 'updateHistory') {
        if (String(payload.id || '') !== verifiedId) throw httpError(403, 'User mismatch');
        await callStore(store, '/history', { id: verifiedId, history: payload.history });
        return json({ success: true, source: 'cloudflare-sql' }, 200, cors);
      }

      if (!isAdmin) throw httpError(403, 'Admin only');

      if (action === 'getAdminData') {
        const data = await callStore(store, '/admin-data', {});
        return json({ ...data, source: 'cloudflare-sql' }, 200, cors);
      }

      if (action === 'updateUser') {
        const updateData = payload.updateData && typeof payload.updateData === 'object' ? payload.updateData : {};
        await callStore(store, '/admin-update', { updateData });
        return json({ success: true, source: 'cloudflare-sql' }, 200, cors);
      }

      throw httpError(400, 'Unsupported action');
    } catch (error) {
      const status = Number(error?.status || 500);
      return json({ success: false, ok: false, error: String(error?.message || 'Server error') }, status, cors);
    }
  },
};

export class UserStore extends SqlUserStore {}

async function callStore(stub, pathname, body) {
  const response = await stub.fetch(`https://users.internal${pathname}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
  });
  let data = null;
  try { data = await response.json(); } catch {}
  if (!response.ok || data?.ok === false) {
    throw httpError(response.status || 500, data?.error || `Store HTTP ${response.status}`);
  }
  return data || {};
}

function syncResponse(record = {}) {
  return {
    success: true,
    isBanned: Boolean(record.isBanned),
    wowStars: safeNumber(record.wowStars, 20),
    wsStars: safeNumber(record.wsStars, 0),
    swLevel: safeNumber(record.swLevel, 0),
    lastGames: normalizeHistory(record.lastGames),
    source: 'cloudflare-sql',
  };
}

function normalizeHistory(value) {
  let parsed = value;
  if (typeof value === 'string') {
    try { parsed = JSON.parse(value); } catch { parsed = []; }
  }
  return Array.isArray(parsed)
    ? parsed.map((item) => String(item || '').trim()).filter(Boolean).slice(0, 3)
    : [];
}

function safeNumber(value, fallback = 0) {
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

async function readJson(request) {
  try { return await request.json(); }
  catch { throw httpError(400, 'Invalid JSON'); }
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
