import { UserStore as LegacyUserStore } from './index.js';

const MIGRATION_KEY = 'kv_to_sql_users_v1';

export class SqlUserStore extends LegacyUserStore {
  constructor(ctx, env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS users (
        telegram_id TEXT PRIMARY KEY,
        username TEXT NOT NULL DEFAULT 'без_ника',
        telegram_link TEXT NOT NULL DEFAULT 'неизвестно',
        is_banned INTEGER NOT NULL DEFAULT 0,
        wow_stars INTEGER NOT NULL DEFAULT 20,
        ws_stars INTEGER NOT NULL DEFAULT 0,
        sacred_level INTEGER NOT NULL DEFAULT 0,
        last_games TEXT NOT NULL DEFAULT '[]',
        admin_pending_wow INTEGER NOT NULL DEFAULT 0,
        admin_pending_ws INTEGER NOT NULL DEFAULT 0,
        admin_pending_sacred INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        last_seen_at INTEGER NOT NULL DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS idx_users_username ON users(username COLLATE NOCASE);
      CREATE INDEX IF NOT EXISTS idx_users_last_seen ON users(last_seen_at DESC);
      CREATE TABLE IF NOT EXISTS app_meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);
  }

  async ensureMigrated() {
    const marker = this.sql.exec('SELECT value FROM app_meta WHERE key = ?', MIGRATION_KEY).toArray()[0];
    if (marker) return;

    // Read the previous key-value records from the same SQLite-backed Durable Object.
    // They remain untouched after migration as a rollback/backup source.
    const kvRows = await this.ctx.storage.list({ prefix: 'user:' });
    const records = [...kvRows.values()].map(normalizeLegacyRecord).filter((row) => row.telegram_id);
    const migratedAt = Date.now();

    this.ctx.storage.transactionSync(() => {
      for (const row of records) this.upsertRow(row);
      this.sql.exec(
        'INSERT OR REPLACE INTO app_meta (key, value) VALUES (?, ?)',
        MIGRATION_KEY,
        JSON.stringify({ migratedAt, kvBackupCount: records.length }),
      );
    });
  }

  async syncUser({ verifiedUser = {}, clientUser = {} }) {
    await this.ensureMigrated();
    const id = cleanId(verifiedUser.id || clientUser.id);
    if (!id) return { ok: false, error: 'Bad user id' };

    const now = Date.now();
    let row = this.getRow(id);
    if (!row) row = blankRow(id, now);

    const username = cleanUsername(verifiedUser.username || clientUser.username || row.username);
    row.username = username;
    row.telegram_link = cleanLink(clientUser.link || row.telegram_link, username);

    const incomingWow = finiteNumber(clientUser.wowStars);
    const incomingWs = finiteNumber(clientUser.wsStars);
    const incomingSacred = finiteNumber(clientUser.swLevel);

    if (row.admin_pending_wow) row.admin_pending_wow = 0;
    else if (incomingWow !== null) row.wow_stars = Math.max(numberOr(row.wow_stars, 20), incomingWow);

    if (row.admin_pending_ws) row.admin_pending_ws = 0;
    else if (incomingWs !== null) row.ws_stars = Math.max(numberOr(row.ws_stars, 0), incomingWs);

    if (row.admin_pending_sacred) row.admin_pending_sacred = 0;
    else if (incomingSacred !== null) row.sacred_level = Math.max(numberOr(row.sacred_level, 0), incomingSacred);

    if (clientUser.lastGames !== undefined) row.last_games = JSON.stringify(normalizeHistory(clientUser.lastGames));
    row.updated_at = now;
    row.last_seen_at = now;
    this.upsertRow(row);

    return { ok: true, user: toLegacyShape(row) };
  }

  async updateHistory({ id, history }) {
    await this.ensureMigrated();
    const clean = cleanId(id);
    if (!clean) return { ok: false, error: 'Bad user id' };

    const now = Date.now();
    let row = this.getRow(clean);
    if (!row) row = blankRow(clean, now);
    row.last_games = JSON.stringify(normalizeHistory(history));
    row.updated_at = now;
    row.last_seen_at = now;
    this.upsertRow(row);
    return { ok: true };
  }

  async adminUpdate(updateData = {}) {
    await this.ensureMigrated();
    const id = cleanId(updateData.targetId);
    if (!id) return { ok: false, error: 'Bad target id' };

    const now = Date.now();
    let row = this.getRow(id);
    if (!row) row = blankRow(id, now);

    const type = String(updateData.type || '');
    const value = updateData.value;
    if (type === 'ban') {
      row.is_banned = toBool(value) ? 1 : 0;
    } else if (type === 'stars_wow') {
      row.wow_stars = numberOr(value, row.wow_stars);
      row.admin_pending_wow = 1;
    } else if (type === 'stars_ws') {
      row.ws_stars = numberOr(value, row.ws_stars);
      row.admin_pending_ws = 1;
    } else if (type === 'stars_sw') {
      row.sacred_level = numberOr(value, row.sacred_level);
      row.admin_pending_sacred = 1;
    } else {
      return { ok: false, error: 'Unknown update type' };
    }

    row.updated_at = now;
    this.upsertRow(row);
    return { ok: true };
  }

  async adminData() {
    await this.ensureMigrated();
    const rows = this.sql.exec(`
      SELECT telegram_id, username, telegram_link, is_banned,
             wow_stars, ws_stars, sacred_level, last_games,
             created_at, updated_at, last_seen_at
      FROM users
      ORDER BY last_seen_at DESC, username COLLATE NOCASE ASC
    `).toArray();

    return {
      success: true,
      users: rows.map(toAdminUser),
      source: 'cloudflare-sql',
      storage: await this.storageInfo(),
    };
  }

  async meta() {
    await this.ensureMigrated();
    const info = await this.storageInfo();
    return {
      ok: true,
      userCount: info.sqlUserCount,
      fullImportDone: true,
      lastImportAt: info.migratedAt,
      canonicalSource: 'cloudflare-sql',
      storage: info,
    };
  }

  async storageInfo() {
    const count = this.sql.exec('SELECT COUNT(*) AS count FROM users').toArray()[0];
    const marker = this.sql.exec('SELECT value FROM app_meta WHERE key = ?', MIGRATION_KEY).toArray()[0];
    let migration = {};
    try { migration = marker ? JSON.parse(marker.value) : {}; } catch {}

    const kvRows = await this.ctx.storage.list({ prefix: 'user:' });
    return {
      engine: 'sqlite-sql',
      table: 'users',
      sqlUserCount: Number(count?.count || 0),
      kvBackupCount: kvRows.size,
      migratedAt: Number(migration.migratedAt || 0),
      kvBackupRetained: true,
    };
  }

  getRow(id) {
    return this.sql.exec('SELECT * FROM users WHERE telegram_id = ?', String(id)).toArray()[0] || null;
  }

  upsertRow(row) {
    this.sql.exec(`
      INSERT INTO users (
        telegram_id, username, telegram_link, is_banned,
        wow_stars, ws_stars, sacred_level, last_games,
        admin_pending_wow, admin_pending_ws, admin_pending_sacred,
        created_at, updated_at, last_seen_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(telegram_id) DO UPDATE SET
        username = excluded.username,
        telegram_link = excluded.telegram_link,
        is_banned = excluded.is_banned,
        wow_stars = excluded.wow_stars,
        ws_stars = excluded.ws_stars,
        sacred_level = excluded.sacred_level,
        last_games = excluded.last_games,
        admin_pending_wow = excluded.admin_pending_wow,
        admin_pending_ws = excluded.admin_pending_ws,
        admin_pending_sacred = excluded.admin_pending_sacred,
        created_at = excluded.created_at,
        updated_at = excluded.updated_at,
        last_seen_at = excluded.last_seen_at
    `,
      row.telegram_id,
      row.username,
      row.telegram_link,
      row.is_banned ? 1 : 0,
      integerOr(row.wow_stars, 20),
      integerOr(row.ws_stars, 0),
      integerOr(row.sacred_level, 0),
      JSON.stringify(normalizeHistory(row.last_games)),
      row.admin_pending_wow ? 1 : 0,
      row.admin_pending_ws ? 1 : 0,
      row.admin_pending_sacred ? 1 : 0,
      integerOr(row.created_at, Date.now()),
      integerOr(row.updated_at, Date.now()),
      integerOr(row.last_seen_at, 0),
    );
  }
}

function normalizeLegacyRecord(record = {}) {
  const now = Date.now();
  const id = cleanId(record.id);
  const username = cleanUsername(record.username);
  const pending = record.adminPending && typeof record.adminPending === 'object' ? record.adminPending : {};
  return {
    telegram_id: id,
    username,
    telegram_link: cleanLink(record.link, username),
    is_banned: toBool(record.isBanned) ? 1 : 0,
    wow_stars: integerOr(record.wowStars, 20),
    ws_stars: integerOr(record.wsStars, 0),
    sacred_level: integerOr(record.swLevel, 0),
    last_games: JSON.stringify(normalizeHistory(record.lastGames)),
    admin_pending_wow: pending.wowStars ? 1 : 0,
    admin_pending_ws: pending.wsStars ? 1 : 0,
    admin_pending_sacred: pending.swLevel ? 1 : 0,
    created_at: integerOr(record.createdAt, now),
    updated_at: integerOr(record.updatedAt, now),
    last_seen_at: integerOr(record.lastSeenAt, 0),
  };
}

function blankRow(id, now = Date.now()) {
  return {
    telegram_id: id,
    username: 'без_ника',
    telegram_link: 'неизвестно',
    is_banned: 0,
    wow_stars: 20,
    ws_stars: 0,
    sacred_level: 0,
    last_games: '[]',
    admin_pending_wow: 0,
    admin_pending_ws: 0,
    admin_pending_sacred: 0,
    created_at: now,
    updated_at: now,
    last_seen_at: 0,
  };
}

function toLegacyShape(row = {}) {
  return {
    id: String(row.telegram_id || ''),
    username: cleanUsername(row.username),
    link: cleanLink(row.telegram_link, row.username),
    isBanned: Boolean(row.is_banned),
    wowStars: integerOr(row.wow_stars, 20),
    wsStars: integerOr(row.ws_stars, 0),
    swLevel: integerOr(row.sacred_level, 0),
    lastGames: normalizeHistory(row.last_games),
    adminPending: {
      wowStars: Boolean(row.admin_pending_wow),
      wsStars: Boolean(row.admin_pending_ws),
      swLevel: Boolean(row.admin_pending_sacred),
    },
    createdAt: integerOr(row.created_at, 0),
    updatedAt: integerOr(row.updated_at, 0),
    lastSeenAt: integerOr(row.last_seen_at, 0),
  };
}

function toAdminUser(row = {}) {
  return {
    id: String(row.telegram_id || ''),
    username: cleanUsername(row.username),
    link: cleanLink(row.telegram_link, row.username),
    isBanned: Boolean(row.is_banned),
    wowStars: integerOr(row.wow_stars, 20),
    wsStars: integerOr(row.ws_stars, 0),
    swLevel: integerOr(row.sacred_level, 0),
    lastGames: normalizeHistory(row.last_games),
    createdAt: integerOr(row.created_at, 0),
    updatedAt: integerOr(row.updated_at, 0),
    lastSeenAt: integerOr(row.last_seen_at, 0),
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

function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.trunc(number) : null;
}

function numberOr(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.trunc(number) : Math.trunc(Number(fallback) || 0);
}

function integerOr(value, fallback = 0) {
  return numberOr(value, fallback);
}

function toBool(value) {
  return value === true || value === 1 || value === '1' || String(value).toLowerCase() === 'true';
}
