import coreV10, { UserStore as V10UserStore } from './index-v10.js';

const encoder = new TextEncoder();
const PROFILE_ACTIONS = new Set([
  'profileBootstrap',
  'profileSearch',
  'profileAddFriend',
  'profileRemoveFriend',
  'profileSetFavorites',
  'profileTrackGame',
]);

const GAMES = new Map([
  ['alias', 'Алиас'],
  ['coimaginarium', 'Соображариум'],
  ['guess', 'Угадай персонажа'],
  ['describe', 'Опиши, но не называй'],
  ['spy', 'Шпион'],
  ['quartet', 'Квартет'],
  ['bible-sketch', 'Библейский художник'],
  ['bible-wow', 'Библейские слова'],
  ['bible-wordsearch', 'Поиск библейских слов'],
  ['sacred-word', 'Священное слово'],
  ['kids-ark-pairs', 'Найди пару'],
  ['biblical-match-three', 'Библейские сокровища'],
]);

export class UserStore extends V10UserStore {
  constructor(ctx, env) {
    super(ctx, env);
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS player_profiles (
        user_id TEXT PRIMARY KEY,
        display_name TEXT NOT NULL DEFAULT '',
        favorites_json TEXT NOT NULL DEFAULT '[]',
        game_stats_json TEXT NOT NULL DEFAULT '{}',
        games_played INTEGER NOT NULL DEFAULT 0,
        last_game TEXT NOT NULL DEFAULT '',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS player_friends (
        user_id TEXT NOT NULL,
        friend_id TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        PRIMARY KEY (user_id, friend_id)
      );
      CREATE INDEX IF NOT EXISTS idx_player_friends_friend ON player_friends(friend_id, created_at DESC);
    `);
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (request.method === 'POST' && url.pathname.startsWith('/profile/')) {
      const body = await request.json().catch(() => ({}));
      if (url.pathname === '/profile/bootstrap') return storeResponse(await this.profileBootstrap(body));
      if (url.pathname === '/profile/search') return storeResponse(await this.profileSearch(body));
      if (url.pathname === '/profile/friend-add') return storeResponse(await this.profileAddFriend(body));
      if (url.pathname === '/profile/friend-remove') return storeResponse(await this.profileRemoveFriend(body));
      if (url.pathname === '/profile/favorites') return storeResponse(await this.profileSetFavorites(body));
      if (url.pathname === '/profile/track') return storeResponse(await this.profileTrackGame(body));
    }
    return super.fetch(request);
  }

  ensurePlayerProfile(userId, displayName = '') {
    const now = Date.now();
    const cleanName = sanitizeDisplayName(displayName);
    this.sql.exec(
      `INSERT INTO player_profiles (user_id, display_name, favorites_json, game_stats_json, games_played, last_game, created_at, updated_at)
       VALUES (?, ?, '[]', '{}', 0, '', ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET
         display_name = CASE WHEN excluded.display_name <> '' THEN excluded.display_name ELSE player_profiles.display_name END,
         updated_at = excluded.updated_at`,
      userId,
      cleanName,
      now,
      now,
    );
  }

  readUser(userId) {
    const row = this.sql.exec(
      `SELECT u.telegram_id, u.username, u.telegram_link, u.wow_stars, u.ws_stars,
              u.sacred_level, u.is_banned, u.last_seen_at, u.created_at,
              COALESCE(g.bmt_stars, 0) AS bmt_stars
       FROM users u
       LEFT JOIN game_balances g ON g.user_id = u.telegram_id
       WHERE u.telegram_id = ?
       LIMIT 1`,
      userId,
    ).toArray()[0];
    return row ? publicUser(row) : null;
  }

  readProfile(userId) {
    const row = this.sql.exec(
      `SELECT display_name, favorites_json, game_stats_json, games_played, last_game, created_at, updated_at
       FROM player_profiles WHERE user_id = ?`,
      userId,
    ).toArray()[0];
    if (!row) return blankProfile();
    return {
      displayName: sanitizeDisplayName(row.display_name),
      favorites: parseFavorites(row.favorites_json),
      gameStats: parseGameStats(row.game_stats_json),
      gamesPlayed: clampInt(row.games_played, 0, 1_000_000_000),
      lastGame: cleanGameKey(row.last_game),
      createdAt: clampInt(row.created_at, 0, Number.MAX_SAFE_INTEGER),
      updatedAt: clampInt(row.updated_at, 0, Number.MAX_SAFE_INTEGER),
    };
  }

  readFriends(userId) {
    const rows = this.sql.exec(
      'SELECT friend_id, created_at FROM player_friends WHERE user_id = ? ORDER BY created_at DESC LIMIT 500',
      userId,
    ).toArray();
    return rows.map((row) => {
      const friend = this.readUser(cleanUserId(row.friend_id));
      if (!friend) return null;
      const social = this.readProfile(friend.id);
      return {
        ...friend,
        displayName: social.displayName,
        gamesPlayed: social.gamesPlayed,
        lastGame: social.lastGame,
        friendsSince: clampInt(row.created_at, 0, Number.MAX_SAFE_INTEGER),
      };
    }).filter(Boolean);
  }

  async profileBootstrap(raw = {}) {
    await this.ensureMigrated();
    const userId = cleanUserId(raw.userId);
    if (!userId) return fail('Некорректный Telegram ID');
    this.ensurePlayerProfile(userId, raw.displayName);
    const user = this.readUser(userId);
    if (!user) return fail('Профиль пользователя ещё не синхронизирован');
    const profile = this.readProfile(userId);
    const friends = this.readFriends(userId);
    return {
      ok: true,
      success: true,
      user: { ...user, displayName: profile.displayName },
      profile,
      friends,
      friendIds: friends.map((friend) => friend.id),
      gameCatalog: [...GAMES.entries()].map(([id, title]) => ({ id, title })),
    };
  }

  async profileSearch(raw = {}) {
    await this.ensureMigrated();
    const userId = cleanUserId(raw.userId);
    const query = String(raw.query || '').trim().slice(0, 80);
    if (!userId) return fail('Некорректный Telegram ID');
    if (!query) return fail('Введите @username или Telegram ID');

    let row = null;
    const directId = cleanUserId(query);
    if (directId) {
      row = this.sql.exec(
        `SELECT u.telegram_id, u.username, u.telegram_link, u.wow_stars, u.ws_stars,
                u.sacred_level, u.is_banned, u.last_seen_at, u.created_at,
                COALESCE(g.bmt_stars, 0) AS bmt_stars
         FROM users u LEFT JOIN game_balances g ON g.user_id = u.telegram_id
         WHERE u.telegram_id = ? LIMIT 1`,
        directId,
      ).toArray()[0];
    } else {
      const username = cleanUsernameQuery(query);
      if (!username) return fail('Некорректный @username');
      row = this.sql.exec(
        `SELECT u.telegram_id, u.username, u.telegram_link, u.wow_stars, u.ws_stars,
                u.sacred_level, u.is_banned, u.last_seen_at, u.created_at,
                COALESCE(g.bmt_stars, 0) AS bmt_stars
         FROM users u LEFT JOIN game_balances g ON g.user_id = u.telegram_id
         WHERE LOWER(u.username) = LOWER(?) LIMIT 1`,
        username,
      ).toArray()[0];
    }

    if (!row) return { ok: true, success: true, found: false };
    const target = publicUser(row);
    const social = this.readProfile(target.id);
    const relation = this.sql.exec(
      'SELECT 1 AS yes FROM player_friends WHERE user_id = ? AND friend_id = ? LIMIT 1',
      userId,
      target.id,
    ).toArray()[0];
    return {
      ok: true,
      success: true,
      found: true,
      user: {
        ...target,
        displayName: social.displayName,
        gamesPlayed: social.gamesPlayed,
        lastGame: social.lastGame,
        isFriend: Boolean(relation),
        isSelf: target.id === userId,
      },
    };
  }

  async profileAddFriend(raw = {}) {
    await this.ensureMigrated();
    const userId = cleanUserId(raw.userId);
    const friendId = cleanUserId(raw.friendId);
    if (!userId || !friendId) return fail('Некорректный Telegram ID');
    if (userId === friendId) return fail('Нельзя добавить самого себя');
    const friend = this.readUser(friendId);
    if (!friend) return fail('Пользователь ещё не запускал приложение');
    if (friend.isBanned) return fail('Этот профиль недоступен');
    const now = Date.now();
    this.ctx.storage.transactionSync(() => {
      this.sql.exec(
        'INSERT OR IGNORE INTO player_friends (user_id, friend_id, created_at) VALUES (?, ?, ?)',
        userId,
        friendId,
        now,
      );
      this.sql.exec(
        'INSERT OR IGNORE INTO player_friends (user_id, friend_id, created_at) VALUES (?, ?, ?)',
        friendId,
        userId,
        now,
      );
    });
    return { ok: true, success: true, friendId, friend: { ...friend, ...this.readProfile(friendId) } };
  }

  async profileRemoveFriend(raw = {}) {
    await this.ensureMigrated();
    const userId = cleanUserId(raw.userId);
    const friendId = cleanUserId(raw.friendId);
    if (!userId || !friendId) return fail('Некорректный Telegram ID');
    this.ctx.storage.transactionSync(() => {
      this.sql.exec('DELETE FROM player_friends WHERE user_id = ? AND friend_id = ?', userId, friendId);
      this.sql.exec('DELETE FROM player_friends WHERE user_id = ? AND friend_id = ?', friendId, userId);
    });
    return { ok: true, success: true, friendId };
  }

  async profileSetFavorites(raw = {}) {
    await this.ensureMigrated();
    const userId = cleanUserId(raw.userId);
    if (!userId) return fail('Некорректный Telegram ID');
    const favorites = [...new Set((Array.isArray(raw.favorites) ? raw.favorites : [])
      .map(cleanGameKey)
      .filter(Boolean))].slice(0, GAMES.size);
    this.ensurePlayerProfile(userId, raw.displayName);
    this.sql.exec(
      'UPDATE player_profiles SET favorites_json = ?, updated_at = ? WHERE user_id = ?',
      JSON.stringify(favorites),
      Date.now(),
      userId,
    );
    return { ok: true, success: true, favorites };
  }

  async profileTrackGame(raw = {}) {
    await this.ensureMigrated();
    const userId = cleanUserId(raw.userId);
    const game = cleanGameKey(raw.game);
    if (!userId) return fail('Некорректный Telegram ID');
    if (!game) return fail('Неизвестная игра');
    this.ensurePlayerProfile(userId, raw.displayName);
    const current = this.readProfile(userId);
    const stats = { ...current.gameStats };
    stats[game] = clampInt(stats[game], 0, 1_000_000_000) + 1;
    const nextTotal = current.gamesPlayed + 1;
    this.sql.exec(
      `UPDATE player_profiles
       SET game_stats_json = ?, games_played = ?, last_game = ?, updated_at = ?
       WHERE user_id = ?`,
      JSON.stringify(stats),
      nextTotal,
      game,
      Date.now(),
      userId,
    );
    return { ok: true, success: true, gamesPlayed: nextTotal, gameStats: stats, lastGame: game };
  }
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === '/telegram/webhook' && request.method === 'POST') {
      const handled = await tryHandleIdCommand(request, env, ctx);
      if (handled) return new Response('OK');
    }

    if (url.pathname === '/compat' && request.method === 'POST') {
      const body = await request.clone().json().catch(() => ({}));
      const payload = body?.payload && typeof body.payload === 'object' ? body.payload : {};
      const action = String(payload.action || '');
      if (PROFILE_ACTIONS.has(action)) {
        return handleProfileCompat(request, env, body, payload, action);
      }
    }

    return coreV10.fetch(request, env, ctx);
  },

  async scheduled(controller, env, ctx) {
    if (typeof coreV10.scheduled === 'function') return coreV10.scheduled(controller, env, ctx);
  },
};

async function handleProfileCompat(request, env, body, payload, action) {
  const cors = corsHeaders(request, env);
  try {
    if (!isAllowedOrigin(request, env)) throw httpError(403, 'Origin not allowed');
    const verified = await verifyTelegramInitData(String(body.telegramInitData || ''), env.TELEGRAM_BOT_TOKEN);
    const userId = cleanUserId(verified.user?.id);
    if (!userId) throw httpError(401, 'Telegram user missing');
    if (userId !== String(env.ADMIN_TELEGRAM_ID || '')) throw httpError(403, 'Profile beta is admin only');

    const store = env.USERS.get(env.USERS.idFromName('global'));
    const displayName = sanitizeDisplayName([verified.user?.first_name, verified.user?.last_name].filter(Boolean).join(' '));
    let result;
    if (action === 'profileBootstrap') {
      result = await callStore(store, '/profile/bootstrap', { userId, displayName });
    } else if (action === 'profileSearch') {
      result = await callStore(store, '/profile/search', { userId, query: payload.query });
    } else if (action === 'profileAddFriend') {
      result = await callStore(store, '/profile/friend-add', { userId, friendId: payload.friendId });
    } else if (action === 'profileRemoveFriend') {
      result = await callStore(store, '/profile/friend-remove', { userId, friendId: payload.friendId });
    } else if (action === 'profileSetFavorites') {
      result = await callStore(store, '/profile/favorites', { userId, displayName, favorites: payload.favorites });
    } else if (action === 'profileTrackGame') {
      result = await callStore(store, '/profile/track', { userId, displayName, game: payload.game });
    } else {
      throw httpError(400, 'Unsupported profile action');
    }
    return json(result, 200, cors);
  } catch (error) {
    return json({ ok: false, success: false, error: String(error?.message || error) }, Number(error?.status || 500), cors);
  }
}

async function tryHandleIdCommand(request, env, ctx) {
  if (!env.TELEGRAM_BOT_TOKEN) return false;
  const expected = await telegramWebhookSecret(env);
  const received = String(request.headers.get('X-Telegram-Bot-Api-Secret-Token') || '');
  if (!received || !constantTimeStringEqual(expected, received)) return false;
  const update = await request.clone().json().catch(() => null);
  const message = update?.message;
  if (!message?.chat || message.chat.type !== 'private') return false;
  const chatId = cleanUserId(message.chat.id);
  const senderId = cleanUserId(message.from?.id);
  if (!chatId || !senderId || chatId !== senderId) return false;
  const text = String(message.text || '').trim();
  if (!/^\/(?:id|myid)(?:@[A-Za-z0-9_]+)?$/i.test(text)) return false;
  ctx.waitUntil(telegramSendMessage(env, chatId, [
    '🪪 Ваш Telegram ID',
    '',
    chatId,
    '',
    'Отправьте этот номер другу — по нему вас можно найти и добавить в друзья в «Библейских играх».',
    'Если у вас есть @username, вас также можно найти по нему.',
  ].join('\n')).catch(() => {}));
  return true;
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

function publicUser(row = {}) {
  return {
    id: cleanUserId(row.telegram_id),
    username: cleanUsername(row.username),
    link: cleanTelegramLink(row.telegram_link, row.username),
    wowStars: clampInt(row.wow_stars, 0, 999_999),
    wsStars: clampInt(row.ws_stars, 0, 999_999),
    swLevel: clampInt(row.sacred_level, 0, 999_999),
    bmtStars: clampInt(row.bmt_stars, 0, 999_999),
    isBanned: Boolean(row.is_banned),
    lastSeenAt: clampInt(row.last_seen_at, 0, Number.MAX_SAFE_INTEGER),
    accountCreatedAt: clampInt(row.created_at, 0, Number.MAX_SAFE_INTEGER),
  };
}

function blankProfile() {
  return { displayName: '', favorites: [], gameStats: {}, gamesPlayed: 0, lastGame: '', createdAt: 0, updatedAt: 0 };
}

function parseFavorites(value) {
  let parsed = [];
  try { parsed = JSON.parse(String(value || '[]')); } catch {}
  return [...new Set((Array.isArray(parsed) ? parsed : []).map(cleanGameKey).filter(Boolean))].slice(0, GAMES.size);
}

function parseGameStats(value) {
  let parsed = {};
  try { parsed = JSON.parse(String(value || '{}')); } catch {}
  const result = {};
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return result;
  for (const [key, count] of Object.entries(parsed)) {
    const game = cleanGameKey(key);
    if (game) result[game] = clampInt(count, 0, 1_000_000_000);
  }
  return result;
}

function cleanGameKey(value) {
  const key = String(value || '').trim();
  return GAMES.has(key) ? key : '';
}

function cleanUserId(value) {
  const id = String(value || '').trim();
  return /^\d{5,20}$/.test(id) ? id : '';
}

function cleanUsername(value) {
  const username = String(value || '').replace(/^@+/, '').replace(/[<>\r\n\t]/g, '').trim().slice(0, 64);
  return username && username !== 'без_ника' ? username : '';
}

function cleanUsernameQuery(value) {
  const username = String(value || '').trim().replace(/^@+/, '');
  return /^[A-Za-z0-9_]{3,64}$/.test(username) ? username : '';
}

function cleanTelegramLink(value, username = '') {
  const raw = String(value || '').trim();
  if (/^https:\/\/t\.me\/[A-Za-z0-9_]{3,64}$/i.test(raw)) return raw;
  const clean = cleanUsername(username);
  return clean ? `https://t.me/${clean}` : '';
}

function sanitizeDisplayName(value) {
  return String(value || '').replace(/[<>\r\n\t]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
}

function clampInt(value, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return min;
  return Math.max(min, Math.min(max, Math.trunc(number)));
}

function fail(error) { return { ok: false, success: false, error }; }
function storeResponse(value) { return json(value, value?.ok === false ? 400 : 200); }

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

async function telegramWebhookSecret(env) {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(String(env.TELEGRAM_BOT_TOKEN || ''))));
  return [...digest].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function constantTimeStringEqual(a, b) {
  const left = encoder.encode(String(a || ''));
  const right = encoder.encode(String(b || ''));
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let i = 0; i < left.length; i += 1) diff |= left[i] ^ right[i];
  return diff === 0;
}

async function telegramSendMessage(env, chatId, text) {
  const response = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: String(chatId), text: String(text || '').slice(0, 4096), disable_web_page_preview: true }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data?.ok !== true) throw new Error(String(data?.description || `Telegram HTTP ${response.status}`));
  return data.result;
}

function allowedOrigins(env) {
  return String(env.ALLOWED_ORIGINS || 'https://vidalost.github.io').split(',').map((item) => item.trim()).filter(Boolean);
}
function isAllowedOrigin(request, env) { return allowedOrigins(env).includes(request.headers.get('Origin') || ''); }
function corsHeaders(request, env) {
  const origin = request.headers.get('Origin') || '';
  const allowed = allowedOrigins(env);
  return {
    'Access-Control-Allow-Origin': allowed.includes(origin) ? origin : allowed[0] || 'https://vidalost.github.io',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}
function json(value, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...extraHeaders } });
}
function httpError(status, message) { const error = new Error(message); error.status = status; return error; }
