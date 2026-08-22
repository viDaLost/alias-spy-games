import coreV7, { UserStore as V7UserStore } from './index-v7.js';

const encoder = new TextEncoder();
const MAX_BMT_STARS = 999_999;
const MAX_BRIEF_IDS = 100;

export class UserStore extends V7UserStore {
  constructor(ctx, env) {
    super(ctx, env);
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS game_balances (
        user_id TEXT PRIMARY KEY,
        bmt_stars INTEGER NOT NULL DEFAULT 0,
        admin_pending_bmt INTEGER NOT NULL DEFAULT 0,
        updated_at INTEGER NOT NULL DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS idx_game_balances_updated_at ON game_balances(updated_at DESC);
    `);
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (request.method === 'POST' && url.pathname === '/bmt-stars') {
      return storeResponse(await this.syncBmtStars(await request.json().catch(() => ({}))));
    }
    if (request.method === 'POST' && url.pathname === '/admin-users-brief') {
      return storeResponse(await this.adminUsersBrief(await request.json().catch(() => ({}))));
    }
    if (request.method === 'POST' && url.pathname === '/admin-bmt-update') {
      return storeResponse(await this.adminBmtUpdate(await request.json().catch(() => ({}))));
    }
    return super.fetch(request);
  }

  async syncBmtStars(raw = {}) {
    await this.ensureMigrated();
    const userId = cleanUserId(raw.userId);
    if (!userId) return fail('Некорректный Telegram ID');
    const incoming = clampStars(raw.balance);
    const current = this.sql.exec(
      'SELECT bmt_stars, admin_pending_bmt FROM game_balances WHERE user_id = ?',
      userId,
    ).toArray()[0];

    if (current?.admin_pending_bmt) {
      const authoritative = clampStars(current.bmt_stars);
      this.sql.exec(
        'UPDATE game_balances SET admin_pending_bmt = 0, updated_at = ? WHERE user_id = ?',
        Date.now(), userId,
      );
      return { ok: true, success: true, bmtStars: authoritative, adminOverrideApplied: true };
    }

    this.sql.exec(
      `INSERT INTO game_balances (user_id, bmt_stars, admin_pending_bmt, updated_at)
       VALUES (?, ?, 0, ?)
       ON CONFLICT(user_id) DO UPDATE SET
         bmt_stars = excluded.bmt_stars,
         admin_pending_bmt = 0,
         updated_at = excluded.updated_at`,
      userId, incoming, Date.now(),
    );
    return { ok: true, success: true, bmtStars: incoming, adminOverrideApplied: false };
  }

  async adminBmtUpdate(raw = {}) {
    await this.ensureMigrated();
    const userId = cleanUserId(raw.userId || raw.targetId);
    if (!userId) return fail('Некорректный Telegram ID');
    const balance = clampStars(raw.balance ?? raw.value);
    this.sql.exec(
      `INSERT INTO game_balances (user_id, bmt_stars, admin_pending_bmt, updated_at)
       VALUES (?, ?, 1, ?)
       ON CONFLICT(user_id) DO UPDATE SET
         bmt_stars = excluded.bmt_stars,
         admin_pending_bmt = 1,
         updated_at = excluded.updated_at`,
      userId, balance, Date.now(),
    );
    return { ok: true, success: true, userId, bmtStars: balance };
  }

  async adminUsersBrief(raw = {}) {
    await this.ensureMigrated();
    const ids = [...new Set((Array.isArray(raw.ids) ? raw.ids : [])
      .map(cleanUserId)
      .filter(Boolean))].slice(0, MAX_BRIEF_IDS);
    const users = [];
    for (const id of ids) {
      const row = this.getRow(id);
      const balance = this.sql.exec(
        'SELECT bmt_stars FROM game_balances WHERE user_id = ?', id,
      ).toArray()[0];
      users.push({
        id,
        username: cleanUsername(row?.username),
        link: cleanLink(row?.telegram_link, row?.username),
        wowStars: integerOr(row?.wow_stars, 20),
        wsStars: integerOr(row?.ws_stars, 0),
        swLevel: integerOr(row?.sacred_level, 0),
        bmtStars: clampStars(balance?.bmt_stars),
        isBanned: Boolean(row?.is_banned),
        lastSeenAt: integerOr(row?.last_seen_at, 0),
      });
    }
    return { ok: true, success: true, users };
  }
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const cors = corsHeaders(request, env);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

    if (url.pathname === '/admin/verify' && request.method === 'POST') {
      try {
        if (!isAllowedOrigin(request, env)) throw httpError(403, 'Origin not allowed');
        const body = await request.json().catch(() => ({}));
        const verified = await requireAdmin(String(body.telegramInitData || ''), env);
        return json({ ok: true, admin: true, id: String(verified.user.id) }, 200, cors);
      } catch (error) {
        return json({ ok: false, admin: false, error: String(error?.message || error) }, Number(error?.status || 403), cors);
      }
    }

    if (url.pathname === '/compat' && request.method === 'POST') {
      const clone = request.clone();
      const body = await clone.json().catch(() => ({}));
      const payload = body?.payload && typeof body.payload === 'object' ? body.payload : {};
      const action = String(payload.action || '');

      if (action === 'syncBmtStars') {
        try {
          if (!isAllowedOrigin(request, env)) throw httpError(403, 'Origin not allowed');
          const verified = await verifyTelegramInitData(String(body.telegramInitData || ''), env.TELEGRAM_BOT_TOKEN);
          const userId = String(verified.user.id || '');
          if (payload.id && String(payload.id) !== userId) throw httpError(403, 'User mismatch');
          const result = await callStore(env, '/bmt-stars', { userId, balance: payload.balance });
          return json(result, 200, cors);
        } catch (error) {
          return json({ success: false, ok: false, error: String(error?.message || error) }, Number(error?.status || 500), cors);
        }
      }

      if (action === 'getAdminUsersByIds') {
        try {
          if (!isAllowedOrigin(request, env)) throw httpError(403, 'Origin not allowed');
          await requireAdmin(String(body.telegramInitData || ''), env);
          const result = await callStore(env, '/admin-users-brief', { ids: payload.ids });
          return json(result, 200, cors);
        } catch (error) {
          return json({ success: false, ok: false, error: String(error?.message || error) }, Number(error?.status || 500), cors);
        }
      }

      if (action === 'adminMessageUser') {
        try {
          if (!isAllowedOrigin(request, env)) throw httpError(403, 'Origin not allowed');
          await requireAdmin(String(body.telegramInitData || ''), env);
          const targetId = cleanUserId(payload.targetId);
          const text = sanitizeMessage(payload.message);
          if (!targetId) throw httpError(400, 'Некорректный Telegram ID');
          if (text.length < 1) throw httpError(400, 'Введите сообщение');
          await telegramSendMessage(env, targetId, `👤 Сообщение администратора\n\n${text}`);
          return json({ success: true, ok: true, delivered: true }, 200, cors);
        } catch (error) {
          return json({ success: false, ok: false, error: String(error?.message || error) }, Number(error?.status || 500), cors);
        }
      }

      if (action === 'updateUser' && String(payload?.updateData?.type || '') === 'stars_bmt') {
        try {
          if (!isAllowedOrigin(request, env)) throw httpError(403, 'Origin not allowed');
          await requireAdmin(String(body.telegramInitData || ''), env);
          const result = await callStore(env, '/admin-bmt-update', {
            userId: payload.updateData.targetId,
            balance: payload.updateData.value,
          });
          return json(result, 200, cors);
        } catch (error) {
          return json({ success: false, ok: false, error: String(error?.message || error) }, Number(error?.status || 500), cors);
        }
      }

      if (action === 'getAdminData') {
        const response = await coreV7.fetch(request, env, ctx);
        if (!response.ok) return response;
        const data = await response.clone().json().catch(() => null);
        if (!data || !Array.isArray(data.users)) return response;
        try {
          const brief = await callStore(env, '/admin-users-brief', { ids: data.users.map((user) => user.id) });
          const byId = new Map((brief.users || []).map((user) => [String(user.id), user]));
          data.users = data.users.map((user) => ({
            ...user,
            bmtStars: clampStars(byId.get(String(user.id))?.bmtStars),
          }));
          return json(data, response.status, cors);
        } catch {
          return response;
        }
      }
    }

    return coreV7.fetch(request, env, ctx);
  },

  async scheduled(controller, env, ctx) {
    if (typeof coreV7.scheduled === 'function') return coreV7.scheduled(controller, env, ctx);
  },
};

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

async function telegramSendMessage(env, chatId, text) {
  if (!env.TELEGRAM_BOT_TOKEN) throw httpError(503, 'Telegram bot is not configured');
  const response = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: String(chatId), text: String(text).slice(0, 3900), disable_web_page_preview: true }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data?.ok !== true) throw httpError(response.status || 502, data?.description || 'Telegram delivery failed');
}

function clampStars(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.min(MAX_BMT_STARS, Math.trunc(n))) : 0;
}
function integerOr(value, fallback = 0) { const n = Number(value); return Number.isFinite(n) ? Math.trunc(n) : Math.trunc(Number(fallback) || 0); }
function cleanUserId(value) { const id = String(value || '').trim(); return /^\d{5,20}$/.test(id) ? id : ''; }
function cleanUsername(value) { return String(value || 'без_ника').replace(/[<>\r\n\t]/g, '').trim().slice(0, 64) || 'без_ника'; }
function cleanLink(value, username = '') {
  const raw = String(value || '').trim();
  if (/^https:\/\/t\.me\/[A-Za-z0-9_]{3,64}$/i.test(raw)) return raw;
  const name = cleanUsername(username);
  return name !== 'без_ника' && /^[A-Za-z0-9_]{3,64}$/.test(name) ? `https://t.me/${name}` : 'неизвестно';
}
function sanitizeMessage(value) { return String(value || '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim().slice(0, 2000); }
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
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}
function json(value, status = 200, extraHeaders = {}) { return new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...extraHeaders } }); }
function httpError(status, message) { const error = new Error(message); error.status = status; return error; }
async function hmacBytes(keyBytes, dataBytes) { const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']); return new Uint8Array(await crypto.subtle.sign('HMAC', key, dataBytes)); }
function constantTimeEqual(a, b) { if (!(a instanceof Uint8Array) || !(b instanceof Uint8Array) || a.length !== b.length) return false; let diff = 0; for (let i = 0; i < a.length; i += 1) diff |= a[i] ^ b[i]; return diff === 0; }
function hexToBytes(hex) { if (!/^[0-9a-f]{64}$/i.test(hex)) return new Uint8Array(); const bytes = new Uint8Array(hex.length / 2); for (let i = 0; i < bytes.length; i += 1) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16); return bytes; }
