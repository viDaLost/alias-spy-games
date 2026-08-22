import coreV8, { UserStore as V8UserStore } from './index-v8.js';

const encoder = new TextEncoder();
const MAX_BMT_STARS = 999_999;
const MAX_BMT_DELTA = 5_000;
const MAX_BRIEF_IDS = 100;
const ADMIN_SESSION_TTL_MS = 15 * 60 * 1000;
const PRESENCE_SESSION_TTL_MS = 30 * 60 * 1000;
const MUTATION_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;

export class UserStore extends V8UserStore {
  constructor(ctx, env) {
    super(ctx, env);
    try { this.sql.exec('ALTER TABLE game_balances ADD COLUMN revision INTEGER NOT NULL DEFAULT 0'); } catch {}
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS bmt_mutations (
        mutation_id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        delta INTEGER NOT NULL,
        reason TEXT NOT NULL DEFAULT '',
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_bmt_mutations_user_created
      ON bmt_mutations(user_id, created_at DESC);
    `);
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (request.method === 'POST' && url.pathname === '/bmt-sync-v2') {
      return storeResponse(await this.syncBmtStarsV2(await request.json().catch(() => ({}))));
    }
    if (request.method === 'POST' && url.pathname === '/bmt-mutate-v2') {
      return storeResponse(await this.mutateBmtStarsV2(await request.json().catch(() => ({}))));
    }
    if (request.method === 'POST' && url.pathname === '/admin-bmt-update-v2') {
      return storeResponse(await this.adminBmtUpdateV2(await request.json().catch(() => ({}))));
    }
    if (request.method === 'POST' && url.pathname === '/admin-users-brief-v2') {
      return storeResponse(await this.adminUsersBriefV2(await request.json().catch(() => ({}))));
    }
    return super.fetch(request);
  }

  async syncBmtStarsV2(raw = {}) {
    await this.ensureMigrated();
    const userId = cleanUserId(raw.userId);
    if (!userId) return fail('Некорректный Telegram ID');
    const incoming = clampStars(raw.balance);
    let row = this.sql.exec(
      'SELECT bmt_stars, admin_pending_bmt, revision FROM game_balances WHERE user_id = ?',
      userId,
    ).toArray()[0];

    if (!row) {
      this.sql.exec(
        `INSERT INTO game_balances (user_id, bmt_stars, admin_pending_bmt, updated_at, revision)
         VALUES (?, ?, 0, ?, 1)`,
        userId, incoming, Date.now(),
      );
      return { ok: true, success: true, bmtStars: incoming, revision: 1, seeded: true };
    }

    const revision = Math.max(1, integerOr(row.revision, 0));
    if (revision !== Number(row.revision || 0) || Number(row.admin_pending_bmt || 0) !== 0) {
      this.sql.exec(
        'UPDATE game_balances SET revision = ?, admin_pending_bmt = 0, updated_at = ? WHERE user_id = ?',
        revision, Date.now(), userId,
      );
      row = { ...row, revision, admin_pending_bmt: 0 };
    }

    return {
      ok: true,
      success: true,
      bmtStars: clampStars(row.bmt_stars),
      revision,
      seeded: false,
    };
  }

  async mutateBmtStarsV2(raw = {}) {
    await this.ensureMigrated();
    const userId = cleanUserId(raw.userId);
    const mutationId = cleanMutationId(raw.mutationId);
    const delta = integerOr(raw.delta, 0);
    const expectedRevision = Math.max(0, integerOr(raw.expectedRevision, 0));
    const reason = sanitizeReason(raw.reason);
    if (!userId) return fail('Некорректный Telegram ID');
    if (!mutationId) return fail('Некорректный mutation ID');
    if (!delta || Math.abs(delta) > MAX_BMT_DELTA) return fail('Некорректное изменение баланса');

    const duplicate = this.sql.exec(
      'SELECT user_id FROM bmt_mutations WHERE mutation_id = ?',
      mutationId,
    ).toArray()[0];
    if (duplicate) {
      if (String(duplicate.user_id) !== userId) return fail('Mutation ID conflict');
      const current = this.sql.exec(
        'SELECT bmt_stars, revision FROM game_balances WHERE user_id = ?', userId,
      ).toArray()[0];
      return {
        ok: true,
        success: true,
        duplicate: true,
        bmtStars: clampStars(current?.bmt_stars),
        revision: Math.max(0, integerOr(current?.revision, 0)),
      };
    }

    const row = this.sql.exec(
      'SELECT bmt_stars, revision FROM game_balances WHERE user_id = ?', userId,
    ).toArray()[0];
    if (!row) {
      return { ok: true, success: true, needsSync: true, conflict: true, bmtStars: 0, revision: 0 };
    }

    const revision = Math.max(1, integerOr(row.revision, 0));
    if (expectedRevision !== revision) {
      return {
        ok: true,
        success: true,
        conflict: true,
        bmtStars: clampStars(row.bmt_stars),
        revision,
      };
    }

    const next = clampStars(clampStars(row.bmt_stars) + delta);
    const nextRevision = revision + 1;
    const now = Date.now();
    this.sql.exec(
      'UPDATE game_balances SET bmt_stars = ?, revision = ?, admin_pending_bmt = 0, updated_at = ? WHERE user_id = ?',
      next, nextRevision, now, userId,
    );
    this.sql.exec(
      'INSERT INTO bmt_mutations (mutation_id, user_id, delta, reason, created_at) VALUES (?, ?, ?, ?, ?)',
      mutationId, userId, delta, reason, now,
    );
    if (Math.random() < 0.02) {
      this.sql.exec('DELETE FROM bmt_mutations WHERE created_at < ?', now - MUTATION_RETENTION_MS);
    }
    return { ok: true, success: true, bmtStars: next, revision: nextRevision, applied: true };
  }

  async adminBmtUpdateV2(raw = {}) {
    await this.ensureMigrated();
    const userId = cleanUserId(raw.userId || raw.targetId);
    if (!userId) return fail('Некорректный Telegram ID');
    const balance = clampStars(raw.balance ?? raw.value);
    const current = this.sql.exec(
      'SELECT revision FROM game_balances WHERE user_id = ?', userId,
    ).toArray()[0];
    const revision = Math.max(0, integerOr(current?.revision, 0)) + 1;
    this.sql.exec(
      `INSERT INTO game_balances (user_id, bmt_stars, admin_pending_bmt, updated_at, revision)
       VALUES (?, ?, 0, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET
         bmt_stars = excluded.bmt_stars,
         admin_pending_bmt = 0,
         updated_at = excluded.updated_at,
         revision = excluded.revision`,
      userId, balance, Date.now(), revision,
    );
    return { ok: true, success: true, userId, bmtStars: balance, revision };
  }

  async adminUsersBriefV2(raw = {}) {
    const ids = [...new Set((Array.isArray(raw.ids) ? raw.ids : [])
      .map(cleanUserId)
      .filter(Boolean))].slice(0, MAX_BRIEF_IDS);
    const base = await super.adminUsersBrief({ ids });
    if (base?.ok === false) return base;
    const users = (base.users || []).map((user) => {
      const row = this.sql.exec(
        'SELECT bmt_stars, revision FROM game_balances WHERE user_id = ?', String(user.id),
      ).toArray()[0];
      return {
        ...user,
        bmtStars: clampStars(row?.bmt_stars ?? user.bmtStars),
        bmtRevision: Math.max(0, integerOr(row?.revision, 0)),
      };
    });
    return { ok: true, success: true, users };
  }
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const cors = corsHeaders(request, env);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

    if (url.pathname === '/web/session' && request.method === 'POST') {
      try {
        if (!isAllowedOrigin(request, env)) throw httpError(403, 'Origin not allowed');
        const body = await request.json().catch(() => ({}));
        const scope = String(body.scope || 'presence');
        if (!['presence', 'admin'].includes(scope)) throw httpError(400, 'Invalid session scope');
        const verified = await verifyTelegramInitData(String(body.telegramInitData || ''), env.TELEGRAM_BOT_TOKEN);
        if (scope === 'admin' && String(verified.user.id || '') !== String(env.ADMIN_TELEGRAM_ID || '')) {
          throw httpError(403, 'Admin only');
        }
        const session = await issueWebSession(verified.user, scope, env);
        return json({ ok: true, success: true, ...session }, 200, cors);
      } catch (error) {
        return json({ ok: false, success: false, error: String(error?.message || error) }, Number(error?.status || 500), cors);
      }
    }

    if (url.pathname === '/web/session/verify' && request.method === 'GET') {
      try {
        const token = bearerToken(request);
        const session = await verifyWebSessionToken(token, env);
        return json({ ok: true, success: true, ...session }, 200, cors);
      } catch (error) {
        return json({ ok: false, success: false, error: String(error?.message || error) }, Number(error?.status || 401), cors);
      }
    }

    if (url.pathname === '/compat' && request.method === 'POST') {
      const clone = request.clone();
      const body = await clone.json().catch(() => ({}));
      const payload = body?.payload && typeof body.payload === 'object' ? body.payload : {};
      const action = String(payload.action || '');

      if (['syncBmtStars', 'mutateBmtStars', 'getAdminUsersByIds'].includes(action)
        || (action === 'updateUser' && String(payload?.updateData?.type || '') === 'stars_bmt')) {
        try {
          if (!isAllowedOrigin(request, env)) throw httpError(403, 'Origin not allowed');
          if (action === 'getAdminUsersByIds' || action === 'updateUser') {
            await requireAdmin(String(body.telegramInitData || ''), env);
            const result = action === 'getAdminUsersByIds'
              ? await callStore(env, '/admin-users-brief-v2', { ids: payload.ids })
              : await callStore(env, '/admin-bmt-update-v2', {
                  userId: payload.updateData?.targetId,
                  balance: payload.updateData?.value,
                });
            return json(result, 200, cors);
          }

          const verified = await verifyTelegramInitData(String(body.telegramInitData || ''), env.TELEGRAM_BOT_TOKEN);
          const userId = String(verified.user.id || '');
          if (payload.id && String(payload.id) !== userId) throw httpError(403, 'User mismatch');
          const result = action === 'syncBmtStars'
            ? await callStore(env, '/bmt-sync-v2', { userId, balance: payload.balance, revision: payload.revision })
            : await callStore(env, '/bmt-mutate-v2', {
                userId,
                mutationId: payload.mutationId,
                delta: payload.delta,
                expectedRevision: payload.expectedRevision,
                reason: payload.reason,
              });
          return json(result, 200, cors);
        } catch (error) {
          return json({ success: false, ok: false, error: String(error?.message || error) }, Number(error?.status || 500), cors);
        }
      }
    }

    if (url.pathname === '/android/compat' && request.method === 'POST') {
      const clone = request.clone();
      const body = await clone.json().catch(() => ({}));
      const payload = body?.payload && typeof body.payload === 'object' ? body.payload : {};
      const action = String(payload.action || '');
      if (action === 'syncBmtStars' || action === 'mutateBmtStars') {
        try {
          if (!isAllowedOrigin(request, env)) throw httpError(403, 'Origin not allowed');
          const userId = await authenticateAndroidRequest(request, env, ctx);
          if (payload.id && String(payload.id) !== userId) throw httpError(403, 'User mismatch');
          const result = action === 'syncBmtStars'
            ? await callStore(env, '/bmt-sync-v2', { userId, balance: payload.balance, revision: payload.revision })
            : await callStore(env, '/bmt-mutate-v2', {
                userId,
                mutationId: payload.mutationId,
                delta: payload.delta,
                expectedRevision: payload.expectedRevision,
                reason: payload.reason,
              });
          return json(result, 200, cors);
        } catch (error) {
          return json({ success: false, ok: false, error: String(error?.message || error) }, Number(error?.status || 500), cors);
        }
      }
    }

    return coreV8.fetch(request, env, ctx);
  },

  async scheduled(controller, env, ctx) {
    if (typeof coreV8.scheduled === 'function') return coreV8.scheduled(controller, env, ctx);
  },
};

async function authenticateAndroidRequest(request, env, ctx) {
  const headers = new Headers(request.headers);
  const verifyRequest = new Request(new URL('/android/auth/me', request.url), { method: 'GET', headers });
  const response = await coreV8.fetch(verifyRequest, env, ctx);
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data?.success !== true || data?.isBanned === true) {
    throw httpError(data?.isBanned ? 403 : 401, data?.error || 'Android session invalid');
  }
  const userId = cleanUserId(data.userId);
  if (!userId) throw httpError(401, 'Android session invalid');
  return userId;
}

async function callStore(env, pathname, body) {
  const stub = env.USERS.get(env.USERS.idFromName('global'));
  const response = await stub.fetch(`https://users.internal${pathname}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data?.ok === false) throw httpError(response.status || 500, data?.error || `Store HTTP ${response.status}`);
  return data;
}

async function requireAdmin(initData, env) {
  const verified = await verifyTelegramInitData(initData, env.TELEGRAM_BOT_TOKEN);
  if (String(verified.user.id || '') !== String(env.ADMIN_TELEGRAM_ID || '')) throw httpError(403, 'Admin only');
  return verified;
}

async function issueWebSession(user, scope, env) {
  const now = Date.now();
  const ttl = scope === 'admin' ? ADMIN_SESSION_TTL_MS : PRESENCE_SESSION_TTL_MS;
  const payload = {
    sub: cleanUserId(user?.id),
    scope,
    iat: now,
    exp: now + ttl,
    username: cleanUsername(user?.username),
    displayName: cleanDisplayName([user?.first_name, user?.last_name].filter(Boolean).join(' ')),
  };
  if (!payload.sub) throw httpError(401, 'Telegram user missing');
  const encoded = base64UrlEncode(encoder.encode(JSON.stringify(payload)));
  const signature = await sessionSignature(encoded, env.TELEGRAM_BOT_TOKEN);
  return { token: `bgw_${encoded}.${bytesToHex(signature)}`, expiresAt: payload.exp, scope };
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
  if (!cleanUserId(payload.sub) || !['presence', 'admin'].includes(payload.scope)) throw httpError(401, 'Web session invalid');
  if (!Number(payload.exp) || Number(payload.exp) <= now || Number(payload.iat) > now + 60_000) throw httpError(401, 'Web session expired');
  if (payload.scope === 'admin' && String(payload.sub) !== String(env.ADMIN_TELEGRAM_ID || '')) throw httpError(403, 'Admin only');
  return {
    userId: cleanUserId(payload.sub),
    scope: payload.scope,
    expiresAt: Number(payload.exp),
    username: cleanUsername(payload.username),
    displayName: cleanDisplayName(payload.displayName),
  };
}

async function sessionSignature(encodedPayload, botToken) {
  if (!botToken) throw httpError(500, 'Telegram secret is not configured');
  const derived = await hmacBytes(encoder.encode(botToken), encoder.encode('bible-games-web-session-v1'));
  return hmacBytes(derived, encoder.encode(encodedPayload));
}

function bearerToken(request) {
  const header = String(request.headers.get('Authorization') || '');
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : '';
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
  const checkString = [...params.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => `${key}=${value}`).join('\n');
  const secretKey = await hmacBytes(encoder.encode('WebAppData'), encoder.encode(botToken));
  const expected = await hmacBytes(secretKey, encoder.encode(checkString));
  const received = hexToBytes(receivedHash);
  if (!constantTimeEqual(expected, received)) throw httpError(401, 'Telegram signature invalid');
  let user = {};
  try { user = JSON.parse(params.get('user') || '{}'); } catch {}
  if (!user?.id) throw httpError(401, 'Telegram user missing');
  return { user };
}

function cleanUserId(value) { const id = String(value || '').trim(); return /^\d{5,20}$/.test(id) ? id : ''; }
function cleanUsername(value) { return String(value || '').trim().replace(/^@+/, '').replace(/[^A-Za-z0-9_]/g, '').slice(0, 64); }
function cleanDisplayName(value) { return String(value || '').replace(/[<>\r\n\t]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80); }
function cleanMutationId(value) { const id = String(value || '').trim(); return /^bmt_[A-Za-z0-9_-]{12,80}$/.test(id) ? id : ''; }
function sanitizeReason(value) { return String(value || '').replace(/[\u0000-\u001F<>]/g, '').trim().slice(0, 96); }
function clampStars(value) { const n = Number(value); return Number.isFinite(n) ? Math.max(0, Math.min(MAX_BMT_STARS, Math.trunc(n))) : 0; }
function integerOr(value, fallback = 0) { const n = Number(value); return Number.isFinite(n) ? Math.trunc(n) : Math.trunc(Number(fallback) || 0); }
function fail(error) { return { ok: false, success: false, error }; }
function storeResponse(value) { return json(value, value?.ok === false ? 400 : 200); }
function allowedOrigins(env) { return String(env.ALLOWED_ORIGINS || 'https://vidalost.github.io').split(',').map((item) => item.trim()).filter(Boolean); }
function isAllowedOrigin(request, env) { return allowedOrigins(env).includes(request.headers.get('Origin') || ''); }
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
function json(value, status = 200, extraHeaders = {}) { return new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...extraHeaders } }); }
function httpError(status, message) { const error = new Error(message); error.status = status; return error; }
async function hmacBytes(keyBytes, dataBytes) { const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']); return new Uint8Array(await crypto.subtle.sign('HMAC', key, dataBytes)); }
function constantTimeEqual(a, b) { if (!(a instanceof Uint8Array) || !(b instanceof Uint8Array) || a.length !== b.length) return false; let diff = 0; for (let i = 0; i < a.length; i += 1) diff |= a[i] ^ b[i]; return diff === 0; }
function hexToBytes(hex) { if (!/^[0-9a-f]{64}$/i.test(hex)) return new Uint8Array(); const bytes = new Uint8Array(hex.length / 2); for (let i = 0; i < bytes.length; i += 1) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16); return bytes; }
function bytesToHex(bytes) { return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join(''); }
function base64UrlEncode(bytes) { let binary = ''; for (const byte of bytes) binary += String.fromCharCode(byte); return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, ''); }
function base64UrlDecode(value) { const base64 = String(value || '').replace(/-/g, '+').replace(/_/g, '/'); const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4); const binary = atob(padded); return Uint8Array.from(binary, (ch) => ch.charCodeAt(0)); }
