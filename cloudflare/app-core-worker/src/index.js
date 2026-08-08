import { DurableObject } from 'cloudflare:workers';

const encoder = new TextEncoder();
const USER_ACTIONS = new Set(['syncUser', 'updateHistory']);
const ADMIN_ACTIONS = new Set(['getAdminData', 'updateUser', 'broadcast']);

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const cors = corsHeaders(request, env);

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

    try {
      if (url.pathname === '/health' && request.method === 'GET') {
        return json({ ok: true, service: 'alias-spy-games-core', now: Date.now() }, 200, cors);
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
      const store = userStore(env);

      if (action === 'syncUser') {
        const clientUser = payload.user && typeof payload.user === 'object' ? payload.user : {};
        if (String(clientUser.id || '') !== verifiedId) throw httpError(403, 'User mismatch');

        let result = await callStore(store, '/sync', { verifiedUser: verified.user, clientUser });
        if (result.needLegacy) {
          const legacy = await callLegacy(payload, env);
          result = await callStore(store, '/sync', { verifiedUser: verified.user, clientUser, legacySeed: legacy });
        } else {
          ctx.waitUntil(mirrorLegacy(payload, env));
        }
        return json(syncResponse(result.user), 200, cors);
      }

      if (action === 'updateHistory') {
        if (String(payload.id || '') !== verifiedId) throw httpError(403, 'User mismatch');
        const result = await callStore(store, '/history', { id: verifiedId, history: payload.history });
        if (result.needLegacy) {
          const legacy = await callLegacy(payload, env);
          return json(legacy || { success: true }, 200, cors);
        }
        ctx.waitUntil(mirrorLegacy(payload, env));
        return json({ success: true }, 200, cors);
      }

      if (!isAdmin) throw httpError(403, 'Admin only');

      if (action === 'getAdminData') {
        let meta = await callStore(store, '/meta', {});
        if (!meta.fullImportDone) {
          try {
            const legacy = await callLegacy({ action: 'getAdminData', adminId: env.ADMIN_TELEGRAM_ID }, env);
            if (Array.isArray(legacy?.users)) {
              await callStore(store, '/import', { users: legacy.users });
              meta = { ...meta, fullImportDone: true };
            }
          } catch (error) {
            if (!meta.userCount) throw error;
          }
        }
        const data = await callStore(store, '/admin-data', {});
        return json(data, 200, cors);
      }

      if (action === 'updateUser') {
        const updateData = payload.updateData && typeof payload.updateData === 'object' ? payload.updateData : {};
        await callStore(store, '/admin-update', { updateData });
        ctx.waitUntil(mirrorLegacy(payload, env));
        return json({ success: true }, 200, cors);
      }

      // Рассылка пока остаётся на старом backend как последний переходный этап.
      if (action === 'broadcast') {
        const legacy = await callLegacy(payload, env);
        return json(legacy, 200, cors);
      }

      throw httpError(400, 'Unsupported action');
    } catch (error) {
      const status = Number(error?.status || 500);
      return json({ ok: false, error: String(error?.message || 'Server error') }, status, cors);
    }
  },
};

export class UserStore extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.ctx = ctx;
    this.env = env;
  }

  async fetch(request) {
    const url = new URL(request.url);
    const body = request.method === 'POST' ? await readJson(request) : {};

    if (url.pathname === '/sync' && request.method === 'POST') return json(await this.syncUser(body));
    if (url.pathname === '/history' && request.method === 'POST') return json(await this.updateHistory(body));
    if (url.pathname === '/import' && request.method === 'POST') return json(await this.importUsers(body.users));
    if (url.pathname === '/admin-update' && request.method === 'POST') return json(await this.adminUpdate(body.updateData));
    if (url.pathname === '/admin-data' && request.method === 'POST') return json(await this.adminData());
    if (url.pathname === '/meta' && request.method === 'POST') return json(await this.meta());

    return json({ ok: false, error: 'Not found' }, 404);
  }

  async syncUser({ verifiedUser = {}, clientUser = {}, legacySeed = null }) {
    const id = cleanId(verifiedUser.id || clientUser.id);
    if (!id) return { ok: false, error: 'Bad user id' };

    const key = userKey(id);
    let record = await this.ctx.storage.get(key);
    if (!record && !legacySeed) return { ok: true, needLegacy: true };

    if (!record) record = createSeededRecord(id, verifiedUser, clientUser, legacySeed || {});
    else record = mergeClientState(record, verifiedUser, clientUser);

    record.updatedAt = Date.now();
    record.lastSeenAt = Date.now();
    await this.ctx.storage.put(key, record);
    return { ok: true, user: record };
  }

  async updateHistory({ id, history }) {
    const clean = cleanId(id);
    if (!clean) return { ok: false, error: 'Bad user id' };
    const key = userKey(clean);
    const record = await this.ctx.storage.get(key);
    if (!record) return { ok: true, needLegacy: true };
    record.lastGames = normalizeHistory(history);
    record.updatedAt = Date.now();
    record.lastSeenAt = Date.now();
    await this.ctx.storage.put(key, record);
    return { ok: true };
  }

  async importUsers(users) {
    const list = Array.isArray(users) ? users : [];
    const entries = {};
    for (const raw of list) {
      const id = cleanId(raw?.id);
      if (!id) continue;
      const key = userKey(id);
      const existing = await this.ctx.storage.get(key);
      entries[key] = mergeImportedRecord(existing, raw, id);
    }
    if (Object.keys(entries).length) await this.ctx.storage.put(entries);
    await this.ctx.storage.put('meta:fullImportDone', true);
    await this.ctx.storage.put('meta:lastImportAt', Date.now());
    return { ok: true, imported: Object.keys(entries).length };
  }

  async adminUpdate(updateData = {}) {
    const id = cleanId(updateData.targetId);
    if (!id) return { ok: false, error: 'Bad target id' };
    const key = userKey(id);
    const record = (await this.ctx.storage.get(key)) || blankRecord(id);
    const type = String(updateData.type || '');
    const value = updateData.value;

    record.adminPending = record.adminPending || {};
    if (type === 'ban') {
      record.isBanned = toBool(value);
    } else if (type === 'stars_wow') {
      record.wowStars = safeNumber(value, record.wowStars);
      record.adminPending.wowStars = true;
    } else if (type === 'stars_ws') {
      record.wsStars = safeNumber(value, record.wsStars);
      record.adminPending.wsStars = true;
    } else if (type === 'stars_sw') {
      record.swLevel = safeNumber(value, record.swLevel);
      record.adminPending.swLevel = true;
    } else {
      return { ok: false, error: 'Unknown update type' };
    }

    record.updatedAt = Date.now();
    await this.ctx.storage.put(key, record);
    return { ok: true };
  }

  async adminData() {
    const rows = await this.ctx.storage.list({ prefix: 'user:' });
    const users = [...rows.values()]
      .map((user) => publicAdminUser(user))
      .sort((a, b) => Number(b.lastSeenAt || 0) - Number(a.lastSeenAt || 0) || String(a.username).localeCompare(String(b.username), 'ru'));
    return { success: true, users, source: 'cloudflare' };
  }

  async meta() {
    const rows = await this.ctx.storage.list({ prefix: 'user:' });
    return {
      ok: true,
      userCount: rows.size,
      fullImportDone: Boolean(await this.ctx.storage.get('meta:fullImportDone')),
      lastImportAt: Number((await this.ctx.storage.get('meta:lastImportAt')) || 0),
    };
  }
}

function createSeededRecord(id, verifiedUser, clientUser, legacy) {
  const record = blankRecord(id);
  record.username = cleanUsername(clientUser.username || verifiedUser.username);
  record.link = cleanLink(clientUser.link, record.username);
  record.wowStars = safeNumber(legacy.wowStars, safeNumber(clientUser.wowStars, 20));
  record.wsStars = safeNumber(legacy.wsStars, safeNumber(clientUser.wsStars, 0));
  record.swLevel = safeNumber(legacy.swLevel, safeNumber(clientUser.swLevel, 0));
  record.lastGames = normalizeHistory(legacy.lastGames !== undefined ? legacy.lastGames : clientUser.lastGames);
  record.isBanned = toBool(legacy.isBanned);
  record.createdAt = Date.now();
  return record;
}

function mergeClientState(record, verifiedUser, clientUser) {
  const next = { ...record, adminPending: { ...(record.adminPending || {}) } };
  next.username = cleanUsername(clientUser.username || verifiedUser.username || record.username);
  next.link = cleanLink(clientUser.link || record.link, next.username);

  for (const field of ['wowStars', 'wsStars', 'swLevel']) {
    const incoming = safeNumber(clientUser[field], NaN);
    if (next.adminPending[field]) {
      delete next.adminPending[field];
    } else if (Number.isFinite(incoming)) {
      next[field] = Math.max(safeNumber(next[field], 0), incoming);
    }
  }

  if (clientUser.lastGames !== undefined) next.lastGames = normalizeHistory(clientUser.lastGames);
  return next;
}

function mergeImportedRecord(existing, raw, id) {
  if (!existing) {
    return {
      ...blankRecord(id),
      username: cleanUsername(raw.username),
      link: cleanLink(raw.link, cleanUsername(raw.username)),
      wowStars: safeNumber(raw.wowStars, 20),
      wsStars: safeNumber(raw.wsStars, 0),
      swLevel: safeNumber(raw.swLevel, 0),
      lastGames: normalizeHistory(raw.lastGames),
      isBanned: toBool(raw.isBanned),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
  }

  return {
    ...existing,
    username: cleanUsername(existing.username || raw.username),
    link: cleanLink(existing.link || raw.link, existing.username || raw.username),
    wowStars: Math.max(safeNumber(existing.wowStars, 0), safeNumber(raw.wowStars, 0)),
    wsStars: Math.max(safeNumber(existing.wsStars, 0), safeNumber(raw.wsStars, 0)),
    swLevel: Math.max(safeNumber(existing.swLevel, 0), safeNumber(raw.swLevel, 0)),
    lastGames: existing.lastSeenAt ? normalizeHistory(existing.lastGames) : normalizeHistory(raw.lastGames),
    isBanned: toBool(raw.isBanned),
    updatedAt: Date.now(),
  };
}

function blankRecord(id) {
  return {
    id,
    username: 'без_ника',
    link: 'неизвестно',
    wowStars: 20,
    wsStars: 0,
    swLevel: 0,
    lastGames: [],
    isBanned: false,
    adminPending: {},
    createdAt: Date.now(),
    updatedAt: Date.now(),
    lastSeenAt: 0,
  };
}

function syncResponse(record) {
  return {
    success: true,
    isBanned: Boolean(record.isBanned),
    wowStars: safeNumber(record.wowStars, 20),
    wsStars: safeNumber(record.wsStars, 0),
    swLevel: safeNumber(record.swLevel, 0),
    lastGames: normalizeHistory(record.lastGames),
    source: 'cloudflare',
  };
}

function publicAdminUser(record) {
  return {
    id: String(record.id || ''),
    username: cleanUsername(record.username),
    link: cleanLink(record.link, record.username),
    lastGames: normalizeHistory(record.lastGames),
    wowStars: safeNumber(record.wowStars, 20),
    wsStars: safeNumber(record.wsStars, 0),
    swLevel: safeNumber(record.swLevel, 0),
    isBanned: Boolean(record.isBanned),
    lastSeenAt: Number(record.lastSeenAt || 0),
  };
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

async function callLegacy(payload, env) {
  if (!env.LEGACY_GAS_URL) throw httpError(503, 'Legacy backend is not configured');
  const response = await fetch(env.LEGACY_GAS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw httpError(502, `Legacy HTTP ${response.status}`);
  try { return await response.json(); }
  catch { throw httpError(502, 'Legacy backend returned invalid JSON'); }
}

async function mirrorLegacy(payload, env) {
  try { await callLegacy(payload, env); }
  catch (error) { console.warn('Legacy mirror failed', String(error?.message || error)); }
}

function userStore(env) {
  return env.USERS.get(env.USERS.idFromName('global'));
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

function normalizeHistory(value) {
  let parsed = value;
  if (typeof value === 'string') {
    try { parsed = JSON.parse(value); } catch { parsed = []; }
  }
  return Array.isArray(parsed) ? parsed.map((item) => String(item || '').trim()).filter(Boolean).slice(0, 3) : [];
}

function cleanId(value) {
  return String(value ?? '').replace(/[^0-9A-Za-z:_-]/g, '').slice(0, 80);
}

function cleanUsername(value) {
  return String(value || 'без_ника').replace(/[<>\r\n\t]/g, '').trim().slice(0, 64) || 'без_ника';
}

function cleanLink(value, username = '') {
  const raw = String(value || '').trim();
  if (/^https:\/\/t\.me\/[A-Za-z0-9_]{3,64}$/i.test(raw)) return raw;
  const name = cleanUsername(username);
  return name !== 'без_ника' && /^[A-Za-z0-9_]{3,64}$/.test(name) ? `https://t.me/${name}` : 'неизвестно';
}

function safeNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function toBool(value) {
  return value === true || value === 1 || value === '1' || String(value).toLowerCase() === 'true';
}

function userKey(id) {
  return `user:${cleanId(id)}`;
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
  const allowOrigin = allowed.includes(origin) ? origin : allowed[0] || 'https://vidalost.github.io';
  return {
    'Access-Control-Allow-Origin': allowOrigin,
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
