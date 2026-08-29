import coreV12, { UserStore as V12UserStore } from './index-v12.js';

const encoder = new TextEncoder();
const ADMIN_AUTH_MAX_AGE_SECONDS = 30 * 60;
const LEGACY_ADMIN_ACTIONS = new Set(['getAdminData', 'updateUser']);
const SUPPORT_ADMIN_ACTIONS = new Set(['supportAdminList', 'supportReply', 'supportSetStatus']);
const BROADCAST_ACTIONS = new Set([
  'broadcast',
  'broadcastCreate',
  'broadcastStatus',
  'broadcastHistory',
  'broadcastCancel',
  'broadcastRepeat',
]);
const ROLE_ACTIONS = new Set(['adminRoleStatus', 'adminRoleList', 'adminRoleGrant', 'adminRoleRevoke']);
const PRIVILEGED_ACTIONS = new Set([
  ...LEGACY_ADMIN_ACTIONS,
  ...SUPPORT_ADMIN_ACTIONS,
  ...BROADCAST_ACTIONS,
  ...ROLE_ACTIONS,
]);

export class UserStore extends V12UserStore {
  constructor(ctx, env) {
    super(ctx, env);
    this.adminEnv = env;
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS admin_roles (
        user_id TEXT PRIMARY KEY,
        granted_by TEXT NOT NULL,
        granted_at INTEGER NOT NULL,
        revoked_at INTEGER NOT NULL DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS idx_admin_roles_active ON admin_roles(revoked_at, granted_at DESC);
      CREATE TABLE IF NOT EXISTS admin_role_audit (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        actor_id TEXT NOT NULL,
        target_id TEXT NOT NULL,
        action TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_admin_role_audit_created ON admin_role_audit(created_at DESC);
      CREATE TABLE IF NOT EXISTS admin_action_audit (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        actor_id TEXT NOT NULL,
        action TEXT NOT NULL,
        target_id TEXT NOT NULL DEFAULT '',
        details_json TEXT NOT NULL DEFAULT '{}',
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_admin_action_audit_created ON admin_action_audit(created_at DESC);
    `);
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (request.method === 'POST' && url.pathname.startsWith('/admin-role/')) {
      const body = await request.json().catch(() => ({}));
      if (url.pathname === '/admin-role/check') return storeResponse(await this.adminRoleCheck(body));
      if (url.pathname === '/admin-role/list') return storeResponse(await this.adminRoleList(body));
      if (url.pathname === '/admin-role/grant') return storeResponse(await this.adminRoleGrant(body));
      if (url.pathname === '/admin-role/revoke') return storeResponse(await this.adminRoleRevoke(body));
    }
    if (request.method === 'POST' && url.pathname === '/admin-audit/log') {
      const body = await request.json().catch(() => ({}));
      return storeResponse(await this.adminAuditLog(body));
    }
    return super.fetch(request);
  }

  ownerId() {
    return cleanUserId(this.adminEnv?.ADMIN_TELEGRAM_ID);
  }

  readAdminUser(userId) {
    return this.sql.exec(
      `SELECT telegram_id, username, telegram_link, is_banned
       FROM users WHERE telegram_id = ? LIMIT 1`,
      userId,
    ).toArray()[0] || null;
  }

  async adminRoleCheck(raw = {}) {
    await this.ensureMigrated();
    const userId = cleanUserId(raw.userId);
    if (!userId) return fail('Bad admin user id');

    const ownerId = this.ownerId();
    const user = this.readAdminUser(userId);
    if (userId === ownerId) {
      return {
        ok: true,
        success: true,
        userId,
        isAdmin: true,
        isRoot: true,
        role: 'owner',
        isBanned: Boolean(user?.is_banned),
      };
    }

    const role = this.sql.exec(
      `SELECT user_id, granted_by, granted_at
       FROM admin_roles
       WHERE user_id = ? AND revoked_at = 0
       LIMIT 1`,
      userId,
    ).toArray()[0];
    const isBanned = Boolean(user?.is_banned);
    const active = Boolean(role && user && !isBanned);
    return {
      ok: true,
      success: true,
      userId,
      isAdmin: active,
      isRoot: false,
      role: active ? 'admin' : 'none',
      isBanned,
      grantedBy: active ? cleanUserId(role.granted_by) : '',
      grantedAt: active ? safeInteger(role.granted_at) : 0,
    };
  }

  async adminRoleList(raw = {}) {
    await this.ensureMigrated();
    const actorId = cleanUserId(raw.actorId);
    if (!actorId || actorId !== this.ownerId()) return fail('Owner only', 403);

    const ownerId = this.ownerId();
    const owner = this.readAdminUser(ownerId);
    const rows = this.sql.exec(`
      SELECT r.user_id, r.granted_by, r.granted_at,
             u.username, u.telegram_link, u.is_banned
      FROM admin_roles r
      LEFT JOIN users u ON u.telegram_id = r.user_id
      WHERE r.revoked_at = 0
      ORDER BY r.granted_at DESC
    `).toArray();

    const admins = [
      {
        id: ownerId,
        username: cleanUsername(owner?.username),
        link: cleanLink(owner?.telegram_link),
        isRoot: true,
        role: 'owner',
        isBanned: Boolean(owner?.is_banned),
        grantedBy: ownerId,
        grantedAt: 0,
      },
      ...rows
        .filter((row) => cleanUserId(row.user_id) && cleanUserId(row.user_id) !== ownerId)
        .map((row) => ({
          id: cleanUserId(row.user_id),
          username: cleanUsername(row.username),
          link: cleanLink(row.telegram_link),
          isRoot: false,
          role: 'admin',
          isBanned: Boolean(row.is_banned),
          grantedBy: cleanUserId(row.granted_by),
          grantedAt: safeInteger(row.granted_at),
        })),
    ];

    return { ok: true, success: true, admins };
  }

  async adminRoleGrant(raw = {}) {
    await this.ensureMigrated();
    const actorId = cleanUserId(raw.actorId);
    const targetId = cleanUserId(raw.targetId);
    const ownerId = this.ownerId();
    if (!actorId || actorId !== ownerId) return fail('Owner only', 403);
    if (!targetId) return fail('Bad target id');
    if (targetId === ownerId) return fail('Owner role is immutable');

    const target = this.readAdminUser(targetId);
    if (!target) return fail('Пользователь ещё не запускал приложение');
    if (Boolean(target.is_banned)) return fail('Нельзя назначить заблокированного пользователя');

    const now = Date.now();
    this.ctx.storage.transactionSync(() => {
      this.sql.exec(
        `INSERT INTO admin_roles (user_id, granted_by, granted_at, revoked_at)
         VALUES (?, ?, ?, 0)
         ON CONFLICT(user_id) DO UPDATE SET
           granted_by = excluded.granted_by,
           granted_at = excluded.granted_at,
           revoked_at = 0`,
        targetId,
        actorId,
        now,
      );
      this.sql.exec(
        'INSERT INTO admin_role_audit (actor_id, target_id, action, created_at) VALUES (?, ?, ?, ?)',
        actorId,
        targetId,
        'grant',
        now,
      );
    });
    return { ok: true, success: true, targetId, grantedAt: now };
  }

  async adminRoleRevoke(raw = {}) {
    await this.ensureMigrated();
    const actorId = cleanUserId(raw.actorId);
    const targetId = cleanUserId(raw.targetId);
    const ownerId = this.ownerId();
    if (!actorId || actorId !== ownerId) return fail('Owner only', 403);
    if (!targetId) return fail('Bad target id');
    if (targetId === ownerId) return fail('Owner role cannot be revoked');

    const now = Date.now();
    this.ctx.storage.transactionSync(() => {
      this.sql.exec(
        'UPDATE admin_roles SET revoked_at = ? WHERE user_id = ? AND revoked_at = 0',
        now,
        targetId,
      );
      this.sql.exec(
        'INSERT INTO admin_role_audit (actor_id, target_id, action, created_at) VALUES (?, ?, ?, ?)',
        actorId,
        targetId,
        'revoke',
        now,
      );
    });
    return { ok: true, success: true, targetId, revokedAt: now };
  }

  async adminAuditLog(raw = {}) {
    await this.ensureMigrated();
    const actorId = cleanUserId(raw.actorId);
    if (!actorId) return fail('Bad actor id');
    const role = await this.adminRoleCheck({ userId: actorId });
    if (!role.isAdmin) return fail('Admin only', 403);

    const action = sanitizeAuditText(raw.action, 80);
    if (!action) return fail('Bad audit action');
    const targetId = cleanUserId(raw.targetId);
    const detailsText = JSON.stringify(raw.details && typeof raw.details === 'object' ? raw.details : {}).slice(0, 1600);
    this.sql.exec(
      'INSERT INTO admin_action_audit (actor_id, action, target_id, details_json, created_at) VALUES (?, ?, ?, ?, ?)',
      actorId,
      action,
      targetId,
      detailsText,
      Date.now(),
    );
    return { ok: true, success: true };
  }
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const cors = corsHeaders(request, env);

    if (url.pathname === '/broadcast/upload') {
      return handleBroadcastUpload(request, env, ctx, cors);
    }

    if (url.pathname === '/compat' && request.method === 'POST') {
      const body = await request.clone().json().catch(() => ({}));
      const payload = body?.payload && typeof body.payload === 'object' ? body.payload : {};
      const action = String(payload.action || '');
      if (PRIVILEGED_ACTIONS.has(action)) {
        return handlePrivilegedCompat(request, env, ctx, body, payload, action, cors);
      }
    }

    return coreV12.fetch(request, env, ctx);
  },

  async scheduled(controller, env, ctx) {
    if (typeof coreV12.scheduled === 'function') return coreV12.scheduled(controller, env, ctx);
  },
};

async function handlePrivilegedCompat(request, env, ctx, body, payload, action, cors) {
  try {
    if (!isAllowedOrigin(request, env)) throw httpError(403, 'Origin not allowed');
    const verified = await verifyAdminInitData(String(body.telegramInitData || ''), env.TELEGRAM_BOT_TOKEN);
    const actorId = cleanUserId(verified.user?.id);
    if (!actorId) throw httpError(401, 'Telegram user missing');

    const store = env.USERS.get(env.USERS.idFromName('global'));
    const role = await callStore(store, '/admin-role/check', { userId: actorId });

    if (action === 'adminRoleStatus') {
      return json({
        success: true,
        ok: true,
        isAdmin: role.isAdmin === true,
        isRoot: role.isRoot === true,
        role: role.role || 'none',
        userId: actorId,
        maxSessionAgeSeconds: ADMIN_AUTH_MAX_AGE_SECONDS,
      }, 200, cors);
    }

    if (role.isAdmin !== true) throw httpError(403, 'Admin only');

    if (action === 'adminRoleList') {
      requireRoot(role);
      const result = await callStore(store, '/admin-role/list', { actorId });
      return json({ ...result, adminAccess: publicRole(role) }, 200, cors);
    }

    if (action === 'adminRoleGrant' || action === 'adminRoleRevoke') {
      requireRoot(role);
      const targetId = cleanUserId(payload.targetId);
      if (!targetId) throw httpError(400, 'Некорректный Telegram ID');
      const path = action === 'adminRoleGrant' ? '/admin-role/grant' : '/admin-role/revoke';
      const result = await callStore(store, path, { actorId, targetId });
      await audit(store, actorId, action, targetId, { source: 'telegram-webapp' });
      return json({ ...result, adminAccess: publicRole(role) }, 200, cors);
    }

    if (LEGACY_ADMIN_ACTIONS.has(action)) {
      if (action === 'getAdminData') {
        const data = await callStore(store, '/admin-data', {});
        let admins;
        if (role.isRoot === true) {
          admins = (await callStore(store, '/admin-role/list', { actorId })).admins || [];
        }
        await audit(store, actorId, action, '', {});
        return json({
          ...data,
          adminAccess: publicRole(role),
          ...(admins ? { admins } : {}),
          source: 'cloudflare-sql-rbac',
        }, 200, cors);
      }

      const updateData = payload.updateData && typeof payload.updateData === 'object' ? payload.updateData : {};
      const targetId = cleanUserId(updateData.targetId);
      const type = String(updateData.type || '');
      if (!targetId) throw httpError(400, 'Bad target id');
      if (!['ban', 'stars_wow', 'stars_ws', 'stars_sw'].includes(type)) throw httpError(400, 'Unknown update type');

      const targetRole = await callStore(store, '/admin-role/check', { userId: targetId });
      if (targetRole.isRoot === true && type === 'ban') {
        throw httpError(403, 'Главный администратор не может быть заблокирован');
      }
      if (role.isRoot !== true && targetRole.isAdmin === true) {
        throw httpError(403, 'Назначенный администратор не может изменять привилегированные аккаунты');
      }

      await callStore(store, '/admin-update', { updateData: { ...updateData, targetId, type } });
      await audit(store, actorId, action, targetId, { type });
      return json({ success: true, ok: true, source: 'cloudflare-sql-rbac', adminAccess: publicRole(role) }, 200, cors);
    }

    if (SUPPORT_ADMIN_ACTIONS.has(action)) {
      const data = await handleSupportAdminAction(store, action, payload);
      await audit(store, actorId, action, cleanUserId(data?.ticket?.userId), {});
      return json({ ...data, adminAccess: publicRole(role) }, 200, cors);
    }

    if (BROADCAST_ACTIONS.has(action)) {
      const data = await handleBroadcastAction(store, action, payload);
      await audit(store, actorId, action, '', { jobId: payload.jobId || data?.jobId || '' });
      return json({ ...data, adminAccess: publicRole(role) }, 200, cors);
    }

    throw httpError(400, 'Unsupported admin action');
  } catch (error) {
    return json({ success: false, ok: false, error: String(error?.message || 'Server error') }, Number(error?.status || 500), cors);
  }
}

async function handleSupportAdminAction(store, action, payload) {
  if (action === 'supportAdminList') return callStore(store, '/support/admin-list', {});
  if (action === 'supportReply') {
    return callStore(store, '/support/reply', { ticketId: payload.ticketId, message: payload.message });
  }
  return callStore(store, '/support/status', { ticketId: payload.ticketId, status: payload.status });
}

async function handleBroadcastAction(store, action, payload) {
  let path = '';
  let body = {};
  if (action === 'broadcast' || action === 'broadcastCreate') {
    path = '/broadcast/create';
    body = {
      config: action === 'broadcast'
        ? { kind: 'text', text: String(payload.text || ''), audience: 'all', html: true }
        : (payload.config || {}),
    };
  } else if (action === 'broadcastStatus') {
    path = '/broadcast/status';
    body = { jobId: payload.jobId };
  } else if (action === 'broadcastHistory') {
    path = '/broadcast/history';
  } else if (action === 'broadcastCancel') {
    path = '/broadcast/cancel';
    body = { jobId: payload.jobId };
  } else if (action === 'broadcastRepeat') {
    path = '/broadcast/repeat';
    body = { jobId: payload.jobId };
  }
  return callStore(store, path, body);
}

async function handleBroadcastUpload(request, env, ctx, cors) {
  try {
    if (request.method !== 'POST') throw httpError(405, 'Method not allowed');
    if (!isAllowedOrigin(request, env)) throw httpError(403, 'Origin not allowed');
    if (!env.TELEGRAM_BOT_TOKEN) throw httpError(500, 'Telegram secret is not configured');

    const form = await request.formData();
    const verified = await verifyAdminInitData(String(form.get('telegramInitData') || ''), env.TELEGRAM_BOT_TOKEN);
    const actorId = cleanUserId(verified.user?.id);
    const store = env.USERS.get(env.USERS.idFromName('global'));
    const role = await callStore(store, '/admin-role/check', { userId: actorId });
    if (role.isAdmin !== true) throw httpError(403, 'Admin only');

    const kind = String(form.get('kind') || '');
    if (!['photo', 'document'].includes(kind)) throw httpError(400, 'Unsupported media type');
    const file = form.get('file');
    if (!file || typeof file.arrayBuffer !== 'function') throw httpError(400, 'File is missing');
    const size = Number(file.size || 0);
    const maxSize = kind === 'photo' ? 10 * 1024 * 1024 : 50 * 1024 * 1024;
    if (!size || size > maxSize) throw httpError(400, kind === 'photo' ? 'Фото должно быть не больше 10 МБ' : 'Файл должен быть не больше 50 МБ');
    if (kind === 'photo' && file.type && !String(file.type).startsWith('image/')) throw httpError(400, 'Выберите изображение');

    const uploaded = await uploadToTelegram(env, kind, file);
    if (uploaded.messageId) ctx.waitUntil(deleteTelegramMessage(env, uploaded.messageId));
    await audit(store, actorId, 'broadcastUpload', '', { kind, size });

    return json({
      success: true,
      ok: true,
      fileId: uploaded.fileId,
      kind,
      name: String(file.name || (kind === 'photo' ? 'photo' : 'document')).slice(0, 180),
      size,
      mimeType: String(file.type || ''),
      adminAccess: publicRole(role),
    }, 200, cors);
  } catch (error) {
    return json({ success: false, ok: false, error: String(error?.message || 'Upload failed') }, Number(error?.status || 500), cors);
  }
}

async function uploadToTelegram(env, kind, file) {
  const ownerId = cleanUserId(env.ADMIN_TELEGRAM_ID);
  if (!ownerId) throw httpError(500, 'Root administrator is not configured');
  const method = kind === 'photo' ? 'sendPhoto' : 'sendDocument';
  const field = kind === 'photo' ? 'photo' : 'document';
  const form = new FormData();
  form.append('chat_id', ownerId);
  form.append('disable_notification', 'true');
  form.append(field, file, String(file.name || field));

  const response = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`, {
    method: 'POST',
    body: form,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data?.ok !== true) throw httpError(502, String(data?.description || `Telegram HTTP ${response.status}`));
  const result = data.result || {};
  const fileId = kind === 'photo'
    ? String(Array.isArray(result.photo) && result.photo.length ? result.photo[result.photo.length - 1]?.file_id || '' : '')
    : String(result.document?.file_id || '');
  if (!fileId) throw httpError(502, 'Telegram did not return file_id');
  return { fileId, messageId: Number(result.message_id || 0) };
}

async function deleteTelegramMessage(env, messageId) {
  try {
    await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/deleteMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: cleanUserId(env.ADMIN_TELEGRAM_ID), message_id: Number(messageId || 0) }),
    });
  } catch {}
}

async function verifyAdminInitData(initData, botToken) {
  const verified = await verifyTelegramInitData(initData, botToken);
  const params = new URLSearchParams(String(initData || ''));
  const authDate = Number(params.get('auth_date') || 0);
  const now = Math.floor(Date.now() / 1000);
  const age = now - authDate;
  if (!authDate || age < -60 || age > ADMIN_AUTH_MAX_AGE_SECONDS) {
    throw httpError(401, 'Admin session expired. Reopen the Telegram Mini App.');
  }
  return verified;
}

async function verifyTelegramInitData(initData, botToken) {
  if (!botToken) throw httpError(500, 'Telegram secret is not configured');
  const params = new URLSearchParams(String(initData || ''));
  const receivedHash = params.get('hash') || '';
  if (!receivedHash) throw httpError(401, 'Telegram hash missing');

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

async function audit(store, actorId, action, targetId = '', details = {}) {
  try {
    await callStore(store, '/admin-audit/log', { actorId, action, targetId, details });
  } catch {}
}

function requireRoot(role) {
  if (role?.isRoot !== true) throw httpError(403, 'Главный администратор only');
}

function publicRole(role = {}) {
  return {
    isAdmin: role.isAdmin === true,
    isRoot: role.isRoot === true,
    role: role.role || 'none',
  };
}

async function callStore(stub, pathname, body) {
  const response = await stub.fetch(`https://users.internal${pathname}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data?.ok === false) throw httpError(response.status || 500, data?.error || `Store HTTP ${response.status}`);
  return data;
}

function allowedOrigins(env) {
  return String(env.ALLOWED_ORIGINS || 'https://vidalost.github.io')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
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
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

function cleanUserId(value) {
  const id = String(value || '').trim();
  return /^\d{5,20}$/.test(id) ? id : '';
}

function cleanUsername(value) {
  return String(value || 'без_ника').replace(/[<>\r\n\t]/g, '').trim().slice(0, 64) || 'без_ника';
}

function cleanLink(value) {
  const raw = String(value || '').trim();
  return /^https:\/\/t\.me\/[A-Za-z0-9_]{3,64}$/i.test(raw) ? raw : 'неизвестно';
}

function safeInteger(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.trunc(number) : 0;
}

function sanitizeAuditText(value, max = 80) {
  return String(value || '').replace(/[^A-Za-z0-9:_-]/g, '').slice(0, max);
}

function fail(error, status = 400) {
  return { ok: false, success: false, error: String(error || 'Request failed'), status };
}

function storeResponse(value = {}) {
  const status = value?.ok === false ? Number(value.status || 400) : 200;
  const output = { ...value };
  delete output.status;
  return json(output, status);
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

async function hmacBytes(keyBytes, dataBytes) {
  const key = await crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, dataBytes));
}

function constantTimeEqual(a, b) {
  if (!(a instanceof Uint8Array) || !(b instanceof Uint8Array) || a.length !== b.length) return false;
  let diff = 0;
  for (let index = 0; index < a.length; index += 1) diff |= a[index] ^ b[index];
  return diff === 0;
}

function hexToBytes(hex) {
  if (!/^[0-9a-f]{64}$/i.test(hex)) return new Uint8Array();
  const bytes = new Uint8Array(hex.length / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}
