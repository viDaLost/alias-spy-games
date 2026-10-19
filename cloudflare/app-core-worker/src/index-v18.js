// Temporary application-wide restriction. Progress and permanent bans are never changed.
import coreV17, { UserStore as V17UserStore } from './index-v17.js';
import { WorkerEntrypoint } from 'cloudflare:workers';
import { accessIdentity, accessStore, cleanAccessId, accessError } from './app-access-auth.js';
import { restrictedBotReply, RESTRICTED_BOT_TEXT } from './restricted-bot.js';

const MESSAGE = 'Библейские игры временно заблокированы. Не волнуйтесь: ваши данные и достижения на месте.';
const MANAGEMENT = new Set(['appAccessList', 'appAccessGrant', 'appAccessRevoke']);
const ACCESS_ACTIONS = new Set(['syncUser', 'accessStatus']);

export class UserStore extends V17UserStore {
  constructor(ctx, env) {
    super(ctx, env);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS app_access_exceptions (
      user_id TEXT PRIMARY KEY, granted_by TEXT NOT NULL, granted_at INTEGER NOT NULL
    ); CREATE TABLE IF NOT EXISTS app_access_bot_replies (update_id TEXT PRIMARY KEY, replied_at INTEGER NOT NULL)`);
  }

  async applicationAccess(userId) {
    userId = cleanAccessId(userId);
    const restricted = String(this.env.APP_RESTRICTED || 'true') !== 'false';
    const isRoot = Boolean(userId && userId === this.ownerId());
    // Root is immutable. Delegated administrators receive no automatic exception.
    if (isRoot) return { ok: true, success: true, allowed: true, restricted, isRoot, userId, isBanned: false };
    if (userId) await this.ensureMigrated();
    const banned = userId ? Boolean(this.getRow(userId)?.is_banned) : false;
    const excepted = userId ? Boolean(this.sql.exec('SELECT 1 FROM app_access_exceptions WHERE user_id = ?', userId).toArray()[0]) : false;
    const allowed = !banned && (!restricted || excepted);
    return {
      ok: true, success: true, allowed, restricted, isRoot: false, userId,
      isBanned: banned || !allowed, appRestricted: restricted && !allowed,
      ...(allowed ? {} : { code: 'APP_RESTRICTED', message: MESSAGE }),
    };
  }

  async accessStatus({ id }) {
    const result = await super.accessStatus({ id });
    return { ...result, ...await this.applicationAccess(id) };
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (request.method !== 'POST' || !url.pathname.startsWith('/app-access/')) return super.fetch(request);
    const body = await request.json();
    if (url.pathname === '/app-access/check') return json(await this.applicationAccess(body.userId));
    if (url.pathname === '/app-access/bot-reply') {
      const userId = cleanAccessId(body.userId);
      const updateId = String(body.updateId || '');
      if (!userId || !/^\d{1,20}$/.test(updateId)) return json({ ok: false, error: 'Invalid bot update' }, 400);
      const access = await this.applicationAccess(userId);
      if (access.allowed) return json({ ok: true, success: true, skipped: true });
      if (this.sql.exec('SELECT 1 FROM app_access_bot_replies WHERE update_id = ?', updateId).toArray()[0]) return json({ ok: true, success: true, duplicate: true });
      const response = await fetch(`https://api.telegram.org/bot${this.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: userId, text: RESTRICTED_BOT_TEXT, parse_mode: 'HTML', link_preview_options: { is_disabled: true }, reply_markup: { remove_keyboard: true } }),
      });
      const delivered = await response.json();
      if (!response.ok || delivered.ok !== true) return json({ ok: false, error: 'Telegram reply delivery failed' }, 502);
      this.sql.exec('INSERT OR IGNORE INTO app_access_bot_replies VALUES (?, ?)', updateId, Date.now());
      this.sql.exec('DELETE FROM app_access_bot_replies WHERE replied_at < ?', Date.now() - 48 * 60 * 60 * 1000);
      if (body.callbackId) {
        await fetch(`https://api.telegram.org/bot${this.env.TELEGRAM_BOT_TOKEN}/answerCallbackQuery`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ callback_query_id: body.callbackId, text: 'Приложение временно заблокировано' }),
        }).catch(() => {});
      }
      return json({ ok: true, success: true });
    }
    const actorId = cleanAccessId(body.actorId);
    if (!actorId || actorId !== this.ownerId()) return json({ ok: false, error: 'Только главный администратор может снимать ограничения' }, 403);
    const targetId = cleanAccessId(body.targetId);
    if (url.pathname !== '/app-access/list') {
      if (!targetId) return json({ ok: false, error: 'Введите корректный Telegram ID' }, 400);
      if (targetId === this.ownerId()) return json({ ok: false, error: 'Главный администратор всегда имеет доступ' }, 400);
      if (url.pathname === '/app-access/grant') {
        this.sql.exec('INSERT INTO app_access_exceptions (user_id, granted_by, granted_at) VALUES (?, ?, ?) ON CONFLICT(user_id) DO NOTHING', targetId, actorId, Date.now());
      } else if (url.pathname === '/app-access/revoke') {
        this.sql.exec('DELETE FROM app_access_exceptions WHERE user_id = ?', targetId);
      } else return json({ ok: false, error: 'Not found' }, 404);
      await this.adminAuditLog({ actorId, action: url.pathname.endsWith('/grant') ? 'appAccessGrant' : 'appAccessRevoke', targetId });
    }
    return json({ ok: true, success: true, restricted: String(this.env.APP_RESTRICTED || 'true') !== 'false',
      users: this.sql.exec('SELECT user_id AS userId, granted_at AS grantedAt FROM app_access_exceptions ORDER BY granted_at DESC').toArray() });
  }
}

// Only trusted room Workers can call this named service entrypoint. It has no public HTTP API.
export class AppAccess extends WorkerEntrypoint {
  async check(userId) { return accessStore(this.env, '/app-access/check', { userId: cleanAccessId(userId) }); }
  async authenticate(token) {
    const request = new Request('https://access.internal', { headers: { Authorization: `Bearer ${token}` } });
    const userId = await accessIdentity(request, {}, this.env);
    return this.check(userId);
  }
  async authorize(proof) {
    const headers = proof?.token ? { Authorization: `Bearer ${proof.token}` } : {};
    const userId = await accessIdentity(new Request('https://access.internal', { headers }), proof || {}, this.env);
    return this.check(userId);
  }
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const cors = corsHeaders(request, env);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (url.pathname === '/telegram/webhook' && request.method === 'POST') {
      try {
        const reply = await restrictedBotReply(request, env);
        if (reply) return reply;
      } catch (error) { return json({ ok: false, error: error.message }, error.status || 503); }
    }
    if (url.pathname === '/web/session/verify' && request.method === 'GET') {
      const response = await coreV17.fetch(request, env, ctx);
      if (!response.ok) return response;
      const session = await response.clone().json();
      try {
        const access = await accessStore(env, '/app-access/check', { userId: session.userId });
        return access.allowed ? response : json({ ok: false, success: false, error: MESSAGE, code: 'APP_RESTRICTED' }, 403, cors);
      } catch { return json({ ok: false, success: false, error: 'Access check unavailable' }, 503, cors); }
    }
    const compat = ['/compat', '/android/compat'].includes(url.pathname) && request.method === 'POST';
    const check = url.pathname === '/app/access' && ['GET', 'POST'].includes(request.method);
    const legacyAccess = url.pathname === '/android/access' && request.method === 'GET';
    const sessionIssue = ['/admin/verify', '/web/session'].includes(url.pathname) && request.method === 'POST';
    if (!compat && !check && !legacyAccess && !sessionIssue && url.pathname !== '/android/room-relay') return coreV17.fetch(request, env, ctx);
    try {
      const origin = request.headers.get('Origin');
      if (origin && !String(env.ALLOWED_ORIGINS || '').split(',').includes(origin)) throw accessError(403, 'Origin not allowed');
      const body = request.method === 'POST' ? await request.clone().json() : {};
      const action = String(body?.payload?.action || '');
      const management = compat && MANAGEMENT.has(action);
      const userId = await accessIdentity(request, body, env, { fresh: management, optional: check });
      if (management) {
        if (userId !== String(env.ADMIN_TELEGRAM_ID || '')) throw accessError(403, 'Только главный администратор может снимать ограничения');
        const path = { appAccessList: 'list', appAccessGrant: 'grant', appAccessRevoke: 'revoke' }[action];
        return json(await accessStore(env, `/app-access/${path}`, { actorId: userId, targetId: body.payload.targetId }), 200, cors);
      }
      const access = await accessStore(env, '/app-access/check', { userId });
      if (check || legacyAccess || (compat && ACCESS_ACTIONS.has(action) && !access.allowed)) return json(access, 200, cors);
      if (!access.allowed) return json({ ...access, ok: false, success: false, error: MESSAGE }, 403, cors);
      return coreV17.fetch(request, env, ctx);
    } catch (error) {
      return json({ ok: false, success: false, allowed: false, error: error.message || 'Access check unavailable', code: error.code || 'APP_ACCESS_ERROR' }, error.status || 503, cors);
    }
  },
  async scheduled(controller, env, ctx) {
    // Users cannot return while restricted: freeze automatic inactivity deletion.
    if (String(env.APP_RESTRICTED || 'true') !== 'false') return;
    return coreV17.scheduled?.(controller, env, ctx);
  },
};

function json(data, status = 200, cors = {}) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...cors } });
}
function corsHeaders(request, env) {
  const allowed = String(env.ALLOWED_ORIGINS || 'https://vidalost.github.io').split(',');
  const origin = request.headers.get('Origin');
  return { 'Access-Control-Allow-Origin': allowed.includes(origin) ? origin : allowed[0], 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type,Authorization', Vary: 'Origin' };
}
