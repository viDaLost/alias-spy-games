import coreV5, { UserStore as V5UserStore } from './index-v5.js';
import { PENDING_WARNINGS_SQL, PURGE_INACTIVE_SQL, WARNINGS_TABLE_SQL } from './retention-sql.js';

const encoder = new TextEncoder();
/*
  Через сколько без активности аккаунт удаляется. Срок сокращён с тридцати
  суток до пятнадцати по просьбе владельца.

  Число дней вынесено отдельно, потому что оно же стоит в письме админу.
  Раньше срок был записан там отдельным числом: поменяв константу, легко
  оставить в тексте прежнее — и письмо сообщало бы владельцу не тот критерий,
  по которому аккаунты на самом деле удалены.
*/
const INACTIVE_ACCOUNT_DAYS = 15;
const INACTIVE_ACCOUNT_MS = INACTIVE_ACCOUNT_DAYS * 24 * 60 * 60 * 1000;
/*
  Предупреждение за сутки.

  Профиль удаляется молча — человек узнаёт об этом, только вернувшись и не
  найдя своих звёзд. За день до удаления бот пишет ему в личные сообщения:
  давно не заходили, профиль будет удалён завтра. Одного дня хватает, чтобы
  зайти и остаться; больше — значит писать тем, кто ещё и не думал уходить.

  Удаление после этого не просто «через сутки по часам», а «через сутки после
  того, как предупредили»: раз в день задача может и не сработать — сеть,
  развёртывание, — и тогда человек был бы удалён, так и не получив письма.
  Поэтому в чистку попадает только тот, кому предупреждение уже ушло и с тех
  пор прошло почти сутки.
*/
const INACTIVE_WARN_DAYS = 1;
const INACTIVE_WARN_MS = INACTIVE_WARN_DAYS * 24 * 60 * 60 * 1000;
// Не ровно сутки: задача ходит раз в день и всегда чуть-чуть в разное время.
// Двадцать часов — тот запас, при котором следующий же запуск застаёт срок
// вышедшим, а человек всё равно получает почти полные сутки.
const INACTIVE_WARN_GRACE_MS = 20 * 60 * 60 * 1000;
// «более 21 дня», но «более 15 дней»: после «более» стоит родительный падеж,
// и единственное число он берёт только у чисел, кончающихся на один — кроме
// одиннадцати.
const daysWord = (count) => (count % 10 === 1 && count % 100 !== 11 ? 'дня' : 'дней');
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
      /*
        Кому уже сказали о скором удалении. Рядом с отметкой лежит та самая
        давность, из-за которой предупредили: человек вернулся — давность
        сдвинулась, отметка устарела, и в следующий раз его предупредят
        заново. Без этого вернувшийся и снова забывший про игру был бы удалён
        по старому, давно прочитанному письму.

        Сам запрос — в retention-sql.js, вместе с двумя другими: оттуда их
        берёт и проверка, которая гоняет их над настоящей SQLite.
      */
      ${WARNINGS_TABLE_SQL};
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
    if (request.method === 'POST' && url.pathname === '/maintenance/inactive-warnings') {
      const body = await request.json().catch(() => ({}));
      return storeResponse(await this.pendingInactiveWarnings(body));
    }
    if (request.method === 'POST' && url.pathname === '/maintenance/inactive-warned') {
      const body = await request.json().catch(() => ({}));
      return storeResponse(await this.markInactiveWarned(body));
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

  /*
    Кого пора предупредить. Те, кто не заходил дольше, чем срок минус сутки, и
    кому об этой самой отлучке ещё не писали.

    Верхней границы нет нарочно: если задача день не работала, человек уже
    перешагнул срок удаления — и тем более должен получить письмо, а не молча
    исчезнуть. Чистка его не тронет, пока с письма не пройдут сутки.
  */
  async pendingInactiveWarnings(raw = {}) {
    await this.ensureMigrated();
    const now = Number(raw.now) || Date.now();
    const warnBefore = now - (INACTIVE_ACCOUNT_MS - INACTIVE_WARN_MS);
    const adminId = cleanUserId(raw.adminId || this.env.ADMIN_TELEGRAM_ID || '');
    const rows = this.sql.exec(PENDING_WARNINGS_SQL,
      adminId, adminId, warnBefore, now, warnBefore).toArray();

    return {
      ok: true,
      success: true,
      warnBefore,
      users: rows
        .map((row) => ({ id: cleanUserId(row.id), seen: Number(row.seen || 0) }))
        .filter((one) => one.id),
    };
  }

  /** Отметить, что человеку написали. Отметка привязана к той же отлучке. */
  async markInactiveWarned(raw = {}) {
    await this.ensureMigrated();
    const now = Number(raw.now) || Date.now();
    const users = Array.isArray(raw.users) ? raw.users : [];
    let marked = 0;
    this.ctx.storage.transactionSync(() => {
      for (const one of users) {
        const id = cleanUserId(one?.id);
        const seen = Number(one?.seen || 0);
        if (!id || !seen) continue;
        this.sql.exec(
          `INSERT INTO inactive_warnings (user_id, warned_at, last_seen_at) VALUES (?, ?, ?)
           ON CONFLICT(user_id) DO UPDATE SET warned_at = excluded.warned_at,
                                              last_seen_at = excluded.last_seen_at`,
          id, now, seen,
        );
        marked += 1;
      }
    });
    return { ok: true, success: true, marked };
  }

  async purgeInactiveAccounts(raw = {}) {
    await this.ensureMigrated();
    const now = Date.now();
    const cutoff = Math.min(Number(raw.cutoff || 0) || (now - INACTIVE_ACCOUNT_MS), now - INACTIVE_ACCOUNT_MS);
    const adminId = cleanUserId(raw.adminId || this.env.ADMIN_TELEGRAM_ID || '');
    /*
      Удаляется только тот, кого предупредили и с чьего письма прошли почти
      сутки. Условие это не про вежливость, а про обещание: в письме сказано
      «через день», и оно должно быть правдой даже тогда, когда задача день
      не отработала. Кому не писали — тот в этот раз получит письмо и уйдёт
      следующим.
    */
    const warnedBefore = now - INACTIVE_WARN_GRACE_MS;
    const rows = this.sql.exec(PURGE_INACTIVE_SQL,
      adminId, adminId, cutoff, warnedBefore, now, cutoff).toArray();

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
        this.sql.exec('DELETE FROM feedback_notes WHERE user_id = ?', id);
        this.sql.exec('DELETE FROM android_sessions WHERE telegram_id = ?', id);
        this.sql.exec('DELETE FROM android_auth_challenges WHERE telegram_id = ?', id);
        this.sql.exec('DELETE FROM broadcast_recipients WHERE telegram_id = ?', id);
        this.sql.exec('DELETE FROM inactive_warnings WHERE user_id = ?', id);
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
    /*
      Сначала письма, потом чистка, и обязательно в этом порядке: чистка
      забирает только тех, кого предупредили сутки назад, а письма уходят
      тем, кому это предстоит завтра. Поменять их местами значило бы в
      первый же запуск удалить тех, кто письма так и не получил.
    */
    ctx.waitUntil((async () => {
      const warned = await runInactiveWarnings(env).catch(() => ({ sent: 0, failed: 0 }));
      await runInactiveCleanup(env, warned);
    })());
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

/*
  Письмо тому, кто вот-вот потеряет профиль. Пишется от бота, в личные
  сообщения — туда же, куда приходит всё остальное.

  Сказано коротко и по делу: сколько не заходили, что будет и что сделать,
  чтобы этого не было. Без уговоров и без «мы скучаем»: человек и так может
  быть недоволен тем, что его считают ушедшим.
*/
function inactiveWarningText() {
  return [
    '⏳ Профиль в «Библейских играх» будет удалён завтра',
    '',
    `Вы не заходили в приложение больше ${INACTIVE_ACCOUNT_DAYS - INACTIVE_WARN_DAYS} `
      + `${daysWord(INACTIVE_ACCOUNT_DAYS - INACTIVE_WARN_DAYS)}. Профили, забытые на `
      + `${INACTIVE_ACCOUNT_DAYS} ${daysWord(INACTIVE_ACCOUNT_DAYS)}, удаляются — вместе со `
      + 'звёздами, уровнями и всем набранным.',
    '',
    'Чтобы этого не случилось, просто откройте приложение — этого достаточно.',
  ].join('\n');
}

/*
  Предупреждения рассылаются перед чисткой и в том же запуске. Отметка о
  письме ставится только тем, кому оно ушло: не доставили — человек попадёт в
  список снова завтра, а удалён не будет, потому что чистка ждёт отметки.

  «Не доставили» — это обычно не сбой, а запрет: бот не может написать тому,
  кто его не запускал или заблокировал. Такой человек остаётся с профилем,
  и это честнее, чем удалить его молча.
*/
async function runInactiveWarnings(env) {
  if (!env.TELEGRAM_BOT_TOKEN) return { sent: 0, failed: 0 };
  const store = env.USERS.get(env.USERS.idFromName('global'));
  const now = Date.now();
  const pending = await callStore(store, '/maintenance/inactive-warnings', {
    now,
    adminId: String(env.ADMIN_TELEGRAM_ID || ''),
  });
  const users = Array.isArray(pending?.users) ? pending.users : [];
  if (!users.length) return { sent: 0, failed: 0 };

  const text = inactiveWarningText();
  const delivered = [];
  let failed = 0;
  for (const one of users) {
    try {
      await telegramSendMessage(env, String(one.id), text);
      delivered.push(one);
    } catch {
      failed += 1;
    }
  }
  if (delivered.length) {
    await callStore(store, '/maintenance/inactive-warned', { now, users: delivered }).catch(() => {});
  }
  return { sent: delivered.length, failed };
}

async function runInactiveCleanup(env, warnings = { sent: 0, failed: 0 }) {
  const store = env.USERS.get(env.USERS.idFromName('global'));
  const cutoff = Date.now() - INACTIVE_ACCOUNT_MS;
  const result = await callStore(store, '/maintenance/purge-inactive', {
    cutoff,
    adminId: String(env.ADMIN_TELEGRAM_ID || ''),
  });
  const warned = Number(warnings?.sent || 0);
  const unreachable = Number(warnings?.failed || 0);
  if ((Number(result.deleted || 0) > 0 || warned > 0) && env.TELEGRAM_BOT_TOKEN && env.ADMIN_TELEGRAM_ID) {
    await telegramSendMessage(env, String(env.ADMIN_TELEGRAM_ID), [
      '🧹 Очистка неактивных аккаунтов',
      `Удалено: ${Number(result.deleted || 0)}`,
      `Предупреждено за сутки: ${warned}${unreachable ? ` (не доставлено ${unreachable})` : ''}`,
      `Критерий: более ${INACTIVE_ACCOUNT_DAYS} ${daysWord(INACTIVE_ACCOUNT_DAYS)} без активности.`,
      'Удаляется только тот, кого предупредили сутки назад.',
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
