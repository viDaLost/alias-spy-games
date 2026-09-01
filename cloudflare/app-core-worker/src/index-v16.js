// Рейтинг игроков.
//
// Устроен так, что очки считает сервер, а не клиент. Приложение присылает
// снимок пройденного — какие уровни закрыты и на сколько звёзд, — а формула
// живёт здесь. Иначе достаточно было бы подставить в запрос любое число.
//
// Участие добровольное: пока игрок не нажал «Опубликовать», его строки нет ни
// в одном публичном ответе. Очки при этом считаются — чтобы человек видел свой
// счёт до того, как решит показываться другим.

import coreV15, { UserStore as V15UserStore } from './index-v15.js';

const PUBLIC_ACTIONS = new Set([
  'ratingSync',
  'ratingReset',
  'ratingTop',
  'ratingJoin',
  'ratingLeave',
  'ratingSetName',
]);
const ADMIN_RATING_ACTIONS = new Set(['ratingAdminList', 'ratingAdminUpdate']);

/** Потолки прогресса: снимок не может обещать больше, чем есть уровней в игре. */
const GAMES = {
  bmt: { label: 'Библейские сокровища', levels: 50, stars: true },
  ws: { label: 'Поиск библейских слов', levels: 90, stars: false },
  wow: { label: 'Библейские слова', levels: 150, stars: false },
  sacred: { label: 'Священное слово', levels: 0, stars: false },
};

const POINTS_PER_LEVEL = 10;
const POINTS_PER_EXTRA_STAR = 5;
const POINTS_PER_SACRED_LEVEL = 2;
const NAME_MAX = 24;
const TOP_LIMIT = 100;
// Быстрее этого честно не наиграешь: снимок, который прибавляет больше, ждёт
// следующей минуты. Дешёвый заслон против подставленного прогресса.
const MAX_POINTS_PER_MINUTE = 400;

export class UserStore extends V15UserStore {
  constructor(ctx, env) {
    super(ctx, env);
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS rating_players (
        user_id TEXT PRIMARY KEY,
        display_name TEXT NOT NULL DEFAULT '',
        published INTEGER NOT NULL DEFAULT 0,
        points INTEGER NOT NULL DEFAULT 0,
        breakdown TEXT NOT NULL DEFAULT '{}',
        admin_points INTEGER NOT NULL DEFAULT 0,
        joined_at INTEGER NOT NULL DEFAULT 0,
        updated_at INTEGER NOT NULL DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS idx_rating_published
        ON rating_players(published, points DESC, updated_at);
    `);
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (request.method === 'POST' && url.pathname.startsWith('/rating/')) {
      const body = await request.json().catch(() => ({}));
      if (url.pathname === '/rating/sync') return ratingResponse(this.ratingSync(body));
      if (url.pathname === '/rating/reset') return ratingResponse(this.ratingReset(body));
      if (url.pathname === '/rating/top') return ratingResponse(this.ratingTop(body));
      if (url.pathname === '/rating/join') return ratingResponse(this.ratingJoin(body));
      if (url.pathname === '/rating/leave') return ratingResponse(this.ratingLeave(body));
      if (url.pathname === '/rating/name') return ratingResponse(this.ratingSetName(body));
      if (url.pathname === '/rating/admin-list') return ratingResponse(this.ratingAdminList(body));
      if (url.pathname === '/rating/admin-update') return ratingResponse(this.ratingAdminUpdate(body));
    }
    return super.fetch(request);
  }

  ratingRow(userId) {
    return this.sql.exec('SELECT * FROM rating_players WHERE user_id = ?', String(userId)).toArray()[0] || null;
  }

  ensureRatingRow(userId, fallbackName) {
    const existing = this.ratingRow(userId);
    if (existing) return existing;
    const now = Date.now();
    this.sql.exec(
      'INSERT INTO rating_players (user_id, display_name, published, points, breakdown, admin_points, joined_at, updated_at) VALUES (?, ?, 0, 0, \'{}\', 0, 0, ?)',
      String(userId), cleanName(fallbackName), now,
    );
    return this.ratingRow(userId);
  }

  /** Пересчитывает очки по присланному снимку прогресса. */
  ratingSync({ userId, snapshot, username }) {
    const id = cleanUserId(userId);
    if (!id) return { ok: false, success: false, error: 'Не удалось определить игрока' };

    const row = this.ensureRatingRow(id, username);
    const scored = scoreSnapshot(snapshot);
    const previous = Number(row.points || 0);
    const now = Date.now();

    // Очки только растут: снимок с меньшим прогрессом — это другое устройство,
    // а не потеря достижений.
    let points = Math.max(previous, scored.points);

    // И растут не быстрее, чем можно наиграть.
    const elapsedMinutes = Math.max(1, (now - Number(row.updated_at || now)) / 60000);
    const ceiling = previous + Math.ceil(MAX_POINTS_PER_MINUTE * elapsedMinutes);
    let throttled = false;
    if (points > ceiling && previous > 0) {
      points = ceiling;
      throttled = true;
    }

    this.sql.exec(
      'UPDATE rating_players SET points = ?, breakdown = ?, updated_at = ? WHERE user_id = ?',
      points, JSON.stringify(scored.breakdown), now, id,
    );

    return {
      ok: true,
      success: true,
      player: this.publicSelf(this.ratingRow(id)),
      breakdown: scored.breakdown,
      throttled,
    };
  }

  /**
   * Пересчитывает очки вниз после сброса прогресса.
   *
   * Обычная синхронизация очки только повышает: снимок с меньшим прогрессом —
   * это другое устройство, а не потерянные достижения. Сброс — единственный
   * случай, когда игрок сам просит убавить, поэтому у него отдельный путь без
   * этой защиты. Надбавка администратора остаётся: её выдали человеку, а не
   * его уровням.
   */
  ratingReset({ userId, snapshot, username }) {
    const id = cleanUserId(userId);
    if (!id) return { ok: false, success: false, error: 'Не удалось определить игрока' };

    const row = this.ensureRatingRow(id, username);
    const scored = scoreSnapshot(snapshot);
    const now = Date.now();

    this.sql.exec(
      'UPDATE rating_players SET points = ?, breakdown = ?, updated_at = ? WHERE user_id = ?',
      scored.points, JSON.stringify(scored.breakdown), now, id,
    );

    return {
      ok: true,
      success: true,
      player: this.publicSelf(this.ratingRow(id)),
      breakdown: scored.breakdown,
      removed: Math.max(0, Number(row.points || 0) - scored.points),
    };
  }

  ratingJoin({ userId, name, username }) {
    const id = cleanUserId(userId);
    if (!id) return { ok: false, success: false, error: 'Не удалось определить игрока' };
    const row = this.ensureRatingRow(id, username);
    const display = cleanName(name) || cleanName(row.display_name) || cleanName(username) || `Игрок ${id.slice(-4)}`;
    const now = Date.now();
    this.sql.exec(
      'UPDATE rating_players SET published = 1, display_name = ?, joined_at = ?, updated_at = ? WHERE user_id = ?',
      display, Number(row.joined_at || 0) || now, now, id,
    );
    return { ok: true, success: true, player: this.publicSelf(this.ratingRow(id)) };
  }

  ratingLeave({ userId }) {
    const id = cleanUserId(userId);
    if (!id) return { ok: false, success: false, error: 'Не удалось определить игрока' };
    this.ensureRatingRow(id, '');
    this.sql.exec('UPDATE rating_players SET published = 0, updated_at = ? WHERE user_id = ?', Date.now(), id);
    return { ok: true, success: true, player: this.publicSelf(this.ratingRow(id)) };
  }

  ratingSetName({ userId, name }) {
    const id = cleanUserId(userId);
    if (!id) return { ok: false, success: false, error: 'Не удалось определить игрока' };
    const display = cleanName(name);
    if (!display) return { ok: false, success: false, error: 'Имя не может быть пустым' };
    this.ensureRatingRow(id, '');
    this.sql.exec('UPDATE rating_players SET display_name = ?, updated_at = ? WHERE user_id = ?', display, Date.now(), id);
    return { ok: true, success: true, player: this.publicSelf(this.ratingRow(id)) };
  }

  ratingTop({ userId, limit }) {
    const id = cleanUserId(userId);
    const size = Math.max(1, Math.min(TOP_LIMIT, Number(limit) || TOP_LIMIT));
    const rows = this.sql.exec(`
      SELECT user_id, display_name, points, admin_points, breakdown
      FROM rating_players
      WHERE published = 1
      ORDER BY (points + admin_points) DESC, joined_at ASC
      LIMIT ?
    `, size).toArray();

    // Telegram ID наружу не отдаётся: место игрока помечается флагом.
    const top = rows.map((row, index) => ({
      place: index + 1,
      name: String(row.display_name || 'Игрок'),
      points: Number(row.points || 0) + Number(row.admin_points || 0),
      breakdown: parseJson(row.breakdown),
      isMe: Boolean(id) && String(row.user_id) === id,
    }));

    const published = this.sql.exec('SELECT COUNT(*) AS count FROM rating_players WHERE published = 1').toArray()[0];
    const self = id ? this.ratingRow(id) : null;
    let myPlace = 0;
    if (self && Number(self.published || 0) === 1) {
      const better = this.sql.exec(`
        SELECT COUNT(*) AS count FROM rating_players
        WHERE published = 1 AND (points + admin_points) > ?
      `, Number(self.points || 0) + Number(self.admin_points || 0)).toArray()[0];
      myPlace = Number(better?.count || 0) + 1;
    }

    return {
      ok: true,
      success: true,
      top,
      totalPublished: Number(published?.count || 0),
      me: self ? { ...this.publicSelf(self), place: myPlace } : null,
    };
  }

  ratingAdminList({ query, limit }) {
    const size = Math.max(1, Math.min(200, Number(limit) || 100));
    const search = String(query || '').trim().toLowerCase();
    const rows = this.sql.exec(`
      SELECT user_id, display_name, published, points, admin_points, updated_at
      FROM rating_players
      ORDER BY (points + admin_points) DESC
      LIMIT ?
    `, size).toArray();
    const players = rows
      .filter((row) => !search
        || String(row.display_name || '').toLowerCase().includes(search)
        || String(row.user_id).includes(search))
      .map((row) => ({
        userId: String(row.user_id),
        name: String(row.display_name || ''),
        published: Number(row.published || 0) === 1,
        points: Number(row.points || 0),
        adminPoints: Number(row.admin_points || 0),
        total: Number(row.points || 0) + Number(row.admin_points || 0),
        updatedAt: Number(row.updated_at || 0),
      }));
    return { ok: true, success: true, players };
  }

  /**
   * Правка администратором. Заработанные очки не переписываются: правка живёт
   * отдельной надбавкой, поэтому следующий снимок прогресса её не сотрёт.
   */
  ratingAdminUpdate({ targetId, name, published, total }) {
    const id = cleanUserId(targetId);
    if (!id) return { ok: false, success: false, error: 'Не указан игрок' };
    const row = this.ratingRow(id);
    if (!row) return { ok: false, success: false, error: 'Игрок ещё не в рейтинге' };

    const fields = [];
    const values = [];
    if (name !== undefined) {
      const display = cleanName(name);
      if (!display) return { ok: false, success: false, error: 'Имя не может быть пустым' };
      fields.push('display_name = ?');
      values.push(display);
    }
    if (published !== undefined) {
      fields.push('published = ?');
      values.push(published ? 1 : 0);
    }
    if (total !== undefined) {
      const wanted = Math.max(0, Math.min(1000000, Math.floor(Number(total) || 0)));
      fields.push('admin_points = ?');
      values.push(wanted - Number(row.points || 0));
    }
    if (!fields.length) return { ok: false, success: false, error: 'Нечего менять' };

    fields.push('updated_at = ?');
    values.push(Date.now(), id);
    this.sql.exec(`UPDATE rating_players SET ${fields.join(', ')} WHERE user_id = ?`, ...values);
    return { ok: true, success: true, player: this.publicSelf(this.ratingRow(id)) };
  }

  publicSelf(row) {
    if (!row) return null;
    return {
      name: String(row.display_name || ''),
      published: Number(row.published || 0) === 1,
      points: Number(row.points || 0) + Number(row.admin_points || 0),
      breakdown: parseJson(row.breakdown),
    };
  }
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === '/compat' && request.method === 'POST') {
      const body = await request.clone().json().catch(() => ({}));
      const payload = body?.payload && typeof body.payload === 'object' ? body.payload : {};
      const action = String(payload.action || '');
      if (PUBLIC_ACTIONS.has(action) || ADMIN_RATING_ACTIONS.has(action)) {
        return handleRatingCompat(request, env, body, payload, action);
      }
    }

    return coreV15.fetch(request, env, ctx);
  },

  async scheduled(controller, env, ctx) {
    if (typeof coreV15.scheduled === 'function') return coreV15.scheduled(controller, env, ctx);
  },
};

async function handleRatingCompat(request, env, body, payload, action) {
  const cors = ratingCors(request, env);
  try {
    const verified = await verifyInitData(String(body.telegramInitData || ''), env.TELEGRAM_BOT_TOKEN);
    const userId = cleanUserId(verified?.user?.id);
    if (!userId) return ratingJson({ success: false, error: 'Требуется вход через Telegram' }, 401, cors);

    const store = env.USERS.get(env.USERS.idFromName('global'));

    if (ADMIN_RATING_ACTIONS.has(action)) {
      const role = await callRatingStore(store, '/admin-role/check', { userId });
      if (role?.isAdmin !== true) return ratingJson({ success: false, error: 'Только для администратора' }, 403, cors);
      const path = action === 'ratingAdminList' ? '/rating/admin-list' : '/rating/admin-update';
      const result = await callRatingStore(store, path, {
        query: payload.query,
        limit: payload.limit,
        targetId: payload.targetId,
        name: payload.name,
        published: payload.published,
        total: payload.total,
      });
      return ratingJson(result, result?.success === false ? 400 : 200, cors);
    }

    const routes = {
      ratingSync: '/rating/sync',
      ratingReset: '/rating/reset',
      ratingTop: '/rating/top',
      ratingJoin: '/rating/join',
      ratingLeave: '/rating/leave',
      ratingSetName: '/rating/name',
    };
    const result = await callRatingStore(store, routes[action], {
      userId,
      username: verified?.user?.username || verified?.user?.first_name || '',
      snapshot: payload.snapshot,
      name: payload.name,
      limit: payload.limit,
    });
    return ratingJson(result, result?.success === false ? 400 : 200, cors);
  } catch (error) {
    return ratingJson({ success: false, error: String(error?.message || 'Рейтинг недоступен') }, Number(error?.status || 500), cors);
  }
}

/**
 * Очки пути. Формула держится здесь, а не в приложении: клиент присылает только
 * то, что прошёл, и подставить себе счёт не может.
 */
export function scoreSnapshot(snapshot) {
  const source = snapshot && typeof snapshot === 'object' ? snapshot : {};
  const breakdown = {};
  let points = 0;

  for (const [game, meta] of Object.entries(GAMES)) {
    const raw = source[game] && typeof source[game] === 'object' ? source[game] : {};
    let gamePoints = 0;
    let levels = 0;

    if (game === 'sacred') {
      levels = Math.max(0, Math.min(9999, Math.floor(Number(raw.level) || 0)));
      gamePoints = levels * POINTS_PER_SACRED_LEVEL;
    } else {
      levels = Math.max(0, Math.min(meta.levels, Math.floor(Number(raw.completed) || 0)));
      gamePoints = levels * POINTS_PER_LEVEL;
      if (meta.stars) {
        // Звёзд за уровень не больше трёх, и всего не больше, чем уровней × 3.
        const stars = Math.max(0, Math.min(levels * 3, Math.floor(Number(raw.stars) || 0)));
        gamePoints += Math.max(0, stars - levels) * POINTS_PER_EXTRA_STAR;
      }
    }

    breakdown[game] = { label: meta.label, levels, points: gamePoints };
    points += gamePoints;
  }

  return { points, breakdown };
}

function cleanName(value) {
  return String(value ?? '')
    .replace(/[ -<>@]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, NAME_MAX);
}

function cleanUserId(value) {
  const id = String(value ?? '').trim();
  return /^\d{5,20}$/.test(id) ? id : '';
}

function parseJson(value) {
  try { return JSON.parse(String(value || '{}')); } catch { return {}; }
}

function ratingResponse(value) {
  return new Response(JSON.stringify(value ?? {}), {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}

function ratingJson(value, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...extraHeaders },
  });
}

async function callRatingStore(store, path, payload) {
  const response = await store.fetch(`https://store${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload || {}),
  });
  return response.json().catch(() => ({}));
}

function ratingCors(request, env) {
  const origin = request.headers.get('Origin') || '';
  const allowed = String(env.ALLOWED_ORIGINS || '')
    .split(/[,\s]+/)
    .map((item) => item.trim())
    .filter(Boolean);
  return {
    'Access-Control-Allow-Origin': allowed.includes(origin) ? origin : allowed[0] || 'https://vidalost.github.io',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    Vary: 'Origin',
  };
}

/** Проверка подписи Telegram — та же схема, что и у остальных действий. */
async function verifyInitData(initData, botToken) {
  if (!initData || !botToken) throw Object.assign(new Error('Telegram data missing'), { status: 401 });
  const params = new URLSearchParams(initData);
  const hash = params.get('hash') || '';
  params.delete('hash');
  const dataCheckString = [...params.entries()]
    .map(([key, value]) => `${key}=${value}`)
    .sort()
    .join('\n');

  const encoder = new TextEncoder();
  const secretKey = await crypto.subtle.importKey('raw', encoder.encode('WebAppData'), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const secret = await crypto.subtle.sign('HMAC', secretKey, encoder.encode(botToken));
  const signKey = await crypto.subtle.importKey('raw', secret, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('HMAC', signKey, encoder.encode(dataCheckString));
  const expected = [...new Uint8Array(signature)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  if (expected !== hash) throw Object.assign(new Error('Telegram signature mismatch'), { status: 401 });

  const user = JSON.parse(params.get('user') || '{}');
  if (!user?.id) throw Object.assign(new Error('Telegram user missing'), { status: 401 });
  return { user };
}
