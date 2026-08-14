import coreV5, { UserStore as V5UserStore } from './index-v5.js';

const encoder = new TextEncoder();
const INACTIVE_ACCOUNT_MS = 30 * 24 * 60 * 60 * 1000;
const REFERRAL_ACTIONS = new Set(['referralStatus', 'referralSubmit']);

export class UserStore extends V5UserStore {
  constructor(ctx, env) {
    super(ctx, env);
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS acquisition_sources (
        user_id TEXT PRIMARY KEY,
        answer TEXT NOT NULL,
        source TEXT NOT NULL DEFAULT 'web',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_acquisition_sources_created
        ON acquisition_sources(created_at DESC);
    `);
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (request.method === 'POST' && url.pathname.startsWith('/referral/')) {
      const body = await request.json().catch(() => ({}));
      if (url.pathname === '/referral/status') return storeResponse(await this.referralStatus(body));
      if (url.pathname === '/referral/submit') return storeResponse(await this.submitReferral(body));
    }
    if (request.method === 'POST' && url.pathname === '/maintenance/purge-inactive') {
      const body = await request.json().catch(() => ({}));
      return storeResponse(await this.purgeInactiveAccounts(body));
    }
    return super.fetch(request);
  }

  async referralStatus(raw = {}) {
    await this.ensureMigrated();
    const userId = cleanUserId(raw.userId);
    if (!userId) return fail('Некорректный Telegram ID');
    this.touchUser(userId);
    const row = this.sql.exec(
      'SELECT answer, source, created_at FROM acquisition_sources WHERE user_id = ?',
      userId,
    ).toArray()[0];
    return {
      ok: true,
      success: true,
      answered: Boolean(row),
      answer: row ? String(row.answer || '') : '',
      source: row ? String(row.source || 'web') : '',
      createdAt: row ? Number(row.created_at || 0) : 0,
    };
  }

  async submitReferral(raw = {}) {
    await this.ensureMigrated();
    const userId = cleanUserId(raw.userId);
    const answer = cleanAnswer(raw.answer);
    const source = String(raw.source || 'web') === 'android' ? 'android' : 'web';
    if (!userId) return fail('Некорректный Telegram ID');
    if (answer.length < 2) return fail('Напишите, откуда вы узнали о приложении');

    this.touchUser(userId);
    const existing = this.sql.exec(
      'SELECT answer, source, created_at FROM acquisition_sources WHERE user_id = ?',
      userId,
    ).toArray()[0];
    if (existing) {
      return {
        ok: true,
        success: true,
        created: false,
        answered: true,
        answer: String(existing.answer || ''),
        source: String(existing.source || 'web'),
        createdAt: Number(existing.created_at || 0),
      };
    }

    const now = Date.now();
    this.sql.exec(
      `INSERT INTO acquisition_sources (user_id, answer, source, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)`,
      userId,
      answer,
      source,
      now,
      now,
    );
    return {
      ok: true,
      success: true,
      created: true,
      answered: true,
      answer,
      source,
      createdAt: now,
    };
  }

  touchUser(userId) {
    const now = Date.now();
    this.sql.exec(
      'UPDATE users SET last_seen_at = ?, updated_at = ? WHERE telegram_id = ?',
      now,
      now,
      userId,
    );
  }

  async purgeInactiveAccounts(raw = {}) {
    await this.ensureMigrated();
    const now = Date.now();
    const cutoff = Math.min(Number(raw.cutoff || 0) || (now - INACTIVE_ACCOUNT_MS), now - INACTIVE_ACCOUNT_MS);
    const adminId = cleanUserId(raw.adminId || this.env.ADMIN_TELEGRAM_ID || '');
    const rows = this.sql.exec(`
      SELECT u.telegram_id
      FROM users u
      WHERE u.is_banned = 0
        AND (? = '' OR u.telegram_id <> ?)
        AND COALESCE(NULLIF(u.last_seen_at, 0), NULLIF(u.updated_at, 0), u.created_at) < ?
        AND NOT EXISTS (
          SELECT 1 FROM android_sessions s
          WHERE s.telegram_id = u.telegram_id
            AND s.revoked = 0
            AND s.expires_at > ?
            AND s.last_seen_at >= ?
        )
      ORDER BY COALESCE(NULLIF(u.last_seen_at, 0), NULLIF(u.updated_at, 0), u.created_at) ASC
      LIMIT 1000
    `, adminId, adminId, cutoff, now, cutoff).toArray();

    const ids = rows.map((row) => cleanUserId(row.telegram_id)).filter(Boolean);
    if (!ids.length) {
      return { ok: true, success: true, deleted: 0, cutoff };
    }

    const idSet = new Set(ids);
    this.ctx.storage.transactionSync(() => {
      for (const id of ids) {
        this.sql.exec(
          `DELETE FROM support_messages
           WHERE ticket_id IN (SELECT id FROM support_tickets WHERE user_id = ?)`,
          id,
        );
        this.sql.exec('DELETE FROM support_tickets WHERE user_id = ?', id);
        this.sql.exec('DELETE FROM acquisition_sources WHERE user_id = ?', id);
        this.sql.exec('DELETE FROM android_sessions WHERE telegram_id = ?', id);
        this.sql.exec('DELETE FROM android_auth_challenges WHERE telegram_id = ?', id);
        this.sql.exec('DELETE FROM broadcast_recipients WHERE telegram_id = ?', id);
        this.sql.exec('DELETE FROM users WHERE telegram_id = ?', id);
      }

      const jobs = this.sql.exec(
        `SELECT id, selected_ids FROM broadcast_jobs WHERE selected_ids <> '' AND selected_ids <> '[]'`,
      ).toArray();
      for (const job of jobs) {
        let selected = [];
        try { selected = JSON.parse(String(job.selected_ids || '[]')); } catch {}
        if (!Array.isArray(selected)) continue;
        const filtered = selected.map(String).filter((id) => !idSet.has(id));
        if (filtered.length !== selected.length) {
          this.sql.exec('UPDATE broadcast_jobs SET selected_ids = ? WHERE id = ?', JSON.stringify(filtered), String(job.id || ''));
        }
      }
    });

    for (const id of ids) {
      await this.ctx.storage.delete(`user:${id}`).catch(() => {});
    }

    return { ok: true, success: true, deleted: ids.length, deletedIds: ids, cutoff };
  }
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === '/compat' && request.method === 'POST') {
      const body = await request.clone().json().catch(() => ({}));
      const payload = body?.payload && typeof body.payload === 'object' ? body.payload : {};
      const action = String(payload.action || '');
      if (REFERRAL_ACTIONS.has(action)) {
        return handleReferralCompat(request, env, ctx, body, payload, action);
      }
    }
    return coreV5.fetch(request, env, ctx);
  },

  async scheduled(_controller, env, ctx) {
    ctx.waitUntil(runInactiveCleanup(env));
  },
};

async function handleReferralCompat(request, env, ctx, body, payload, action) {
  const cors = corsHeaders(request, env);
  try {
    if (!isAllowedOrigin(request, env)) throw httpError(403, 'Origin not allowed');
    const verified = await verifyTelegramInitData(String(body.telegramInitData || ''), env.TELEGRAM_BOT_TOKEN);
    const userId = String(verified.user.id || '');
    if (userId === String(env.ADMIN_TELEGRAM_ID || '')) {
      return json({ success: true, ok: true, answered: true, skip: true }, 200, cors);
    }

    const store = env.USERS.get(env.USERS.idFromName('global'));
    if (action === 'referralStatus') {
      const result = await callStore(store, '/referral/status', { userId });
      return json(result, 200, cors);
    }

    const result = await callStore(store, '/referral/submit', {
      userId,
      answer: payload.answer,
      source: 'web',
    });
    if (result.created) {
      ctx.waitUntil(notifyReferralAdmin(env, verified.user, result).catch(() => {}));
    }
    return json(result, 200, cors);
  } catch (error) {
    return json(
      { success: false, ok: false, error: String(error?.message || 'Server error') },
      Number(error?.status || 500),
      cors,
    );
  }
}

async function runInactiveCleanup(env) {
  const store = env.USERS.get(env.USERS.idFromName('global'));
  const cutoff = Date.now() - INACTIVE_ACCOUNT_MS;
  const result = await callStore(store, '/maintenance/purge-inactive', {
    cutoff,
    adminId: String(env.ADMIN_TELEGRAM_ID || ''),
  });
  if (Number(result.deleted || 0) > 0 && env.TELEGRAM_BOT_TOKEN && env.ADMIN_TELEGRAM_ID) {
    await telegramSendMessage(env, String(env.ADMIN_TELEGRAM_ID), [
      '🧹 Очистка неактивных аккаунтов',
      `Удалено: ${Number(result.deleted || 0)}`,
      'Критерий: более 30 дней без активности.',
      'Заблокированные аккаунты и аккаунт администратора не удаляются.',
    ].join('\n')).catch(() => {});
  }
}

async function notifyReferralAdmin(env, user, result) {
  const adminId = String(env.ADMIN_TELEGRAM_ID || '');
  if (!adminId || !env.TELEGRAM_BOT_TOKEN) return;
  const username = user?.username ? `@${String(user.username).replace(/^@+/, '')}` : 'без username';
  const name = [user?.first_name, user?.last_name].map((item) => String(item || '').trim()).filter(Boolean).join(' ');
  await telegramSendMessage(env, adminId, [
    '📣 Новый ответ: «Откуда узнали о Библейских играх?»',
    `Пользователь: ${String(user?.id || '')} · ${username}${name ? ` · ${name}` : ''}`,
    '',
    String(result.answer || '').slice(0, 1200),
  ].join('\n'));
}

async function callStore(stub, pathname, body) {
  const response = await stub.fetch(`https://users.internal${pathname}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data?.ok === false) {
    const error = new Error(String(data?.error || `Store HTTP ${response.status}`));
    error.status = response.status;
    throw error;
  }
  return data;
}

async function telegramSendMessage(env, chatId, text) {
  const response = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: String(chatId),
      text: String(text || '').slice(0, 4096),
      disable_web_page_preview: true,
    }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data?.ok !== true) throw new Error(String(data?.description || `Telegram HTTP ${response.status}`));
  return data.result;
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

function cleanUserId(value) {
  const id = String(value || '').trim();
  return /^\d{5,20}$/.test(id) ? id : '';
}

function cleanAnswer(value) {
  return String(value || '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .replace(/\r\n/g, '\n')
    .trim()
    .slice(0, 500);
}

function storeResponse(value) {
  return new Response(JSON.stringify(value), {
    status: value?.ok === false ? 400 : 200,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
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

function fail(error) {
  return { ok: false, success: false, error };
}
