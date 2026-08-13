import { SupportUserStore } from './support-user-store.js';

const CHALLENGE_TTL_MS = 10 * 60 * 1000;
const CHALLENGE_VERIFY_GRACE_MS = 30 * 1000;
const SESSION_TTL_MS = 90 * 24 * 60 * 60 * 1000;
const ID_WINDOW_MS = 10 * 60 * 1000;
const REQUEST_WINDOW_MS = 10 * 60 * 1000;
const MAX_CHALLENGES_PER_ID = 3;
const MAX_CHALLENGES_PER_REQUEST_KEY = 12;
const MAX_CODE_ATTEMPTS = 5;
const MAX_ACTIVE_SESSIONS_PER_USER = 5;

export class AndroidAuthUserStore extends SupportUserStore {
  constructor(ctx, env) {
    super(ctx, env);
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS android_auth_challenges (
        id TEXT PRIMARY KEY,
        telegram_id TEXT NOT NULL,
        code_hash TEXT NOT NULL,
        request_key TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL,
        attempts INTEGER NOT NULL DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS idx_android_auth_challenges_user
        ON android_auth_challenges(telegram_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_android_auth_challenges_request
        ON android_auth_challenges(request_key, created_at DESC);

      CREATE TABLE IF NOT EXISTS android_sessions (
        token_hash TEXT PRIMARY KEY,
        telegram_id TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL,
        last_seen_at INTEGER NOT NULL,
        revoked INTEGER NOT NULL DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS idx_android_sessions_user
        ON android_sessions(telegram_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_android_sessions_expiry
        ON android_sessions(expires_at);
    `);
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (request.method === 'POST' && url.pathname.startsWith('/android-auth/')) {
      const body = await request.json().catch(() => ({}));
      if (url.pathname === '/android-auth/begin') return authResponse(await this.beginAuth(body));
      if (url.pathname === '/android-auth/drop') return authResponse(await this.dropChallenge(body));
      if (url.pathname === '/android-auth/consume') return authResponse(await this.consumeAuth(body));
      if (url.pathname === '/android-auth/session') return authResponse(await this.resolveSession(body));
      if (url.pathname === '/android-auth/revoke') return authResponse(await this.revokeSession(body));
    }
    return super.fetch(request);
  }

  cleanupAuth(now = Date.now()) {
    this.sql.exec('DELETE FROM android_auth_challenges WHERE expires_at <= ?', now - CHALLENGE_VERIFY_GRACE_MS);
    this.sql.exec('DELETE FROM android_sessions WHERE expires_at <= ? OR revoked = 1', now);
  }

  async beginAuth(raw = {}) {
    await this.ensureMigrated();
    const telegramId = cleanTelegramId(raw.telegramId);
    const challengeId = cleanChallengeId(raw.challengeId);
    const codeHash = cleanHash(raw.codeHash);
    const requestKey = cleanHash(raw.requestKey);
    const now = Date.now();
    const expiresAt = Math.min(Number(raw.expiresAt || 0), now + CHALLENGE_TTL_MS);
    if (!telegramId || !challengeId || !codeHash || !requestKey || expiresAt <= now) {
      return fail(400, 'AUTH_BAD_REQUEST', 'Некорректный запрос подтверждения');
    }

    this.cleanupAuth(now);

    // A mobile request can reach Cloudflare and send the Telegram message while
    // its HTTP response is lost. The client therefore retries with the same
    // challenge id. Return the existing challenge before rate-limit accounting
    // so a transport retry neither creates a second code nor consumes quota.
    const existing = this.sql.exec(
      'SELECT telegram_id, expires_at FROM android_auth_challenges WHERE id = ?',
      challengeId,
    ).toArray()[0];
    if (existing) {
      if (String(existing.telegram_id || '') !== telegramId) {
        return fail(409, 'AUTH_CHALLENGE_CONFLICT', 'Некорректный запрос подтверждения');
      }
      if (Number(existing.expires_at || 0) > now) {
        return {
          ok: true,
          success: true,
          existing: true,
          expiresAt: Number(existing.expires_at || 0),
        };
      }
      this.sql.exec('DELETE FROM android_auth_challenges WHERE id = ?', challengeId);
    }

    const byId = this.sql.exec(
      'SELECT COUNT(*) AS count FROM android_auth_challenges WHERE telegram_id = ? AND created_at >= ?',
      telegramId,
      now - ID_WINDOW_MS,
    ).toArray()[0];
    if (Number(byId?.count || 0) >= MAX_CHALLENGES_PER_ID) {
      return fail(429, 'AUTH_RATE_LIMIT', 'Слишком много кодов для этого аккаунта. Попробуйте позже.');
    }

    const byRequester = this.sql.exec(
      'SELECT COUNT(*) AS count FROM android_auth_challenges WHERE request_key = ? AND created_at >= ?',
      requestKey,
      now - REQUEST_WINDOW_MS,
    ).toArray()[0];
    if (Number(byRequester?.count || 0) >= MAX_CHALLENGES_PER_REQUEST_KEY) {
      return fail(429, 'AUTH_RATE_LIMIT', 'Слишком много попыток входа. Попробуйте позже.');
    }

    this.sql.exec(
      `INSERT INTO android_auth_challenges
       (id, telegram_id, code_hash, request_key, created_at, expires_at, attempts)
       VALUES (?, ?, ?, ?, ?, ?, 0)`,
      challengeId,
      telegramId,
      codeHash,
      requestKey,
      now,
      expiresAt,
    );
    return { ok: true, success: true, existing: false, expiresAt };
  }

  async dropChallenge(raw = {}) {
    const challengeId = cleanChallengeId(raw.challengeId);
    if (challengeId) this.sql.exec('DELETE FROM android_auth_challenges WHERE id = ?', challengeId);
    return { ok: true, success: true };
  }

  async consumeAuth(raw = {}) {
    await this.ensureMigrated();
    const challengeId = cleanChallengeId(raw.challengeId);
    const codeHash = cleanHash(raw.codeHash);
    const tokenHash = cleanHash(raw.tokenHash);
    const now = Date.now();
    const sessionExpiresAt = Math.min(Number(raw.sessionExpiresAt || 0), now + SESSION_TTL_MS);
    if (!challengeId || !codeHash || !tokenHash || sessionExpiresAt <= now) {
      return fail(400, 'AUTH_BAD_REQUEST', 'Некорректный код подтверждения');
    }

    this.cleanupAuth(now);
    const row = this.sql.exec('SELECT * FROM android_auth_challenges WHERE id = ?', challengeId).toArray()[0];
    if (!row || Number(row.expires_at || 0) + CHALLENGE_VERIFY_GRACE_MS <= now) {
      if (row) this.sql.exec('DELETE FROM android_auth_challenges WHERE id = ?', challengeId);
      return fail(410, 'AUTH_EXPIRED', 'Код истёк. Запросите новый.');
    }
    if (Number(row.attempts || 0) >= MAX_CODE_ATTEMPTS) {
      this.sql.exec('DELETE FROM android_auth_challenges WHERE id = ?', challengeId);
      return fail(429, 'AUTH_ATTEMPTS_EXCEEDED', 'Слишком много неверных кодов. Запросите новый.');
    }
    if (!constantTimeStringEqual(String(row.code_hash || ''), codeHash)) {
      const attempts = Number(row.attempts || 0) + 1;
      this.sql.exec('UPDATE android_auth_challenges SET attempts = ? WHERE id = ?', attempts, challengeId);
      if (attempts >= MAX_CODE_ATTEMPTS) this.sql.exec('DELETE FROM android_auth_challenges WHERE id = ?', challengeId);
      return fail(
        attempts >= MAX_CODE_ATTEMPTS ? 429 : 401,
        attempts >= MAX_CODE_ATTEMPTS ? 'AUTH_ATTEMPTS_EXCEEDED' : 'AUTH_CODE_INVALID',
        attempts >= MAX_CODE_ATTEMPTS ? 'Слишком много неверных кодов. Запросите новый.' : 'Неверный код подтверждения.',
        { attemptsRemaining: Math.max(0, MAX_CODE_ATTEMPTS - attempts) },
      );
    }

    const telegramId = String(row.telegram_id || '');
    this.ctx.storage.transactionSync(() => {
      this.sql.exec(
        `INSERT OR IGNORE INTO android_sessions
         (token_hash, telegram_id, created_at, expires_at, last_seen_at, revoked)
         VALUES (?, ?, ?, ?, ?, 0)`,
        tokenHash,
        telegramId,
        now,
        sessionExpiresAt,
        now,
      );
      const sessions = this.sql.exec(
        `SELECT token_hash FROM android_sessions
         WHERE telegram_id = ? AND revoked = 0 AND expires_at > ?
         ORDER BY created_at DESC`,
        telegramId,
        now,
      ).toArray();
      sessions.slice(MAX_ACTIVE_SESSIONS_PER_USER).forEach((session) => {
        this.sql.exec('UPDATE android_sessions SET revoked = 1 WHERE token_hash = ?', String(session.token_hash || ''));
      });
    });
    const session = this.sql.exec(
      'SELECT expires_at FROM android_sessions WHERE token_hash = ? AND telegram_id = ?',
      tokenHash,
      telegramId,
    ).toArray()[0];
    return {
      ok: true,
      success: true,
      userId: telegramId,
      expiresAt: Number(session?.expires_at || sessionExpiresAt),
    };
  }

  async resolveSession(raw = {}) {
    await this.ensureMigrated();
    const tokenHash = cleanHash(raw.tokenHash);
    if (!tokenHash) return fail(401, 'AUTH_REQUIRED', 'Требуется подтверждённый вход');
    const now = Date.now();
    this.cleanupAuth(now);
    const row = this.sql.exec(
      `SELECT telegram_id, expires_at, last_seen_at FROM android_sessions
       WHERE token_hash = ? AND revoked = 0 AND expires_at > ?`,
      tokenHash,
      now,
    ).toArray()[0];
    if (!row) return fail(401, 'AUTH_SESSION_INVALID', 'Сессия истекла. Подтвердите вход снова.');
    if (now - Number(row.last_seen_at || 0) > 60_000) {
      this.sql.exec('UPDATE android_sessions SET last_seen_at = ? WHERE token_hash = ?', now, tokenHash);
    }
    return {
      ok: true,
      success: true,
      userId: String(row.telegram_id || ''),
      expiresAt: Number(row.expires_at || 0),
    };
  }

  async revokeSession(raw = {}) {
    const tokenHash = cleanHash(raw.tokenHash);
    if (tokenHash) this.sql.exec('UPDATE android_sessions SET revoked = 1 WHERE token_hash = ?', tokenHash);
    return { ok: true, success: true };
  }
}

function cleanTelegramId(value) {
  const id = String(value || '').trim();
  return /^\d{5,20}$/.test(id) ? id : '';
}

function cleanChallengeId(value) {
  const id = String(value || '').trim();
  return /^ach_[a-zA-Z0-9_-]{20,80}$/.test(id) ? id : '';
}

function cleanHash(value) {
  const hash = String(value || '').trim().toLowerCase();
  return /^[0-9a-f]{64}$/.test(hash) ? hash : '';
}

function constantTimeStringEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function fail(status, code, error, extra = {}) {
  return { ok: false, success: false, status, code, error, ...extra };
}

function authResponse(value) {
  return new Response(JSON.stringify(value), {
    status: Number(value?.status || (value?.ok === false ? 400 : 200)),
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}
