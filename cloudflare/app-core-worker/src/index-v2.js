import original, { UserStore as BaseUserStore } from './index.js';

const encoder = new TextEncoder();
const IMPORT_ACTION = 'importGoogleSheet';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === '/compat' && request.method === 'POST') {
      let body = null;
      try { body = await request.clone().json(); } catch {}

      if (String(body?.payload?.action || '') === IMPORT_ACTION) {
        const cors = corsHeaders(request, env);
        try {
          if (!isAllowedOrigin(request, env)) throw httpError(403, 'Origin not allowed');

          const verified = await verifyTelegramInitData(String(body?.telegramInitData || ''), env.TELEGRAM_BOT_TOKEN);
          if (String(verified.user.id) !== String(env.ADMIN_TELEGRAM_ID || '')) throw httpError(403, 'Admin only');

          const sheetUrl = String(body?.payload?.sheetUrl || '').trim();
          const parsed = await fetchGoogleSheetUsers(sheetUrl);
          const store = env.USERS.get(env.USERS.idFromName('global'));

          const currentResponse = await store.fetch('https://users.internal/admin-data', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: '{}',
          });
          const currentData = await currentResponse.json();
          if (!currentResponse.ok || !Array.isArray(currentData?.users)) throw httpError(500, 'Не удалось прочитать текущую базу Cloudflare');

          const existing = new Map(currentData.users.map((user) => [String(user.id || ''), user]));
          let newUsers = 0;
          for (const user of parsed.users) {
            const current = existing.get(String(user.id));
            if (current) {
              // Google-таблица используется для восстановления профиля и прогресса,
              // но не должна отменять более свежую блокировку из Cloudflare.
              user.isBanned = Boolean(current.isBanned);
            } else {
              newUsers += 1;
            }
          }

          const importResponse = await store.fetch('https://users.internal/import', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ users: parsed.users }),
          });
          const result = await importResponse.json();
          if (!importResponse.ok || result?.ok === false) throw httpError(500, result?.error || 'Импорт в Cloudflare завершился ошибкой');

          return json({
            success: true,
            sourceRows: parsed.sourceRows,
            validUsers: parsed.users.length,
            imported: Number(result.imported || parsed.users.length),
            newUsers,
            duplicatesMerged: parsed.duplicatesMerged,
            invalidRowsSkipped: parsed.invalidRowsSkipped,
            repairedUsernames: Number(result.repairedUsernames || 0),
            repairedLinks: Number(result.repairedLinks || 0),
          }, 200, cors);
        } catch (error) {
          const status = Number(error?.status || 500);
          // Для ошибок самого импорта возвращаем читаемую ошибку без переключения
          // frontend-моста на старый Apps Script.
          const responseStatus = status === 401 || status === 403 ? status : 200;
          return json({ success: false, error: String(error?.message || 'Не удалось импортировать таблицу') }, responseStatus, cors);
        }
      }
    }

    return original.fetch(request, env, ctx);
  },
};

export class UserStore extends BaseUserStore {
  async importUsers(users) {
    const result = await super.importUsers(users);
    const list = Array.isArray(users) ? users : [];
    let repairedUsernames = 0;
    let repairedLinks = 0;

    for (const raw of list) {
      const id = cleanId(raw?.id ?? raw?.ID ?? raw?.telegramId);
      if (!id) continue;
      const key = `user:${id}`;
      const record = await this.ctx.storage.get(key);
      if (!record) continue;

      const importedUsername = normalizeUsername(raw?.username ?? raw?.userName ?? raw?.Username);
      const currentUsername = normalizeUsername(record.username);
      let changed = false;

      if (!currentUsername && importedUsername) {
        record.username = importedUsername;
        repairedUsernames += 1;
        changed = true;
      }

      const importedLink = normalizeLink(raw?.link ?? raw?.Link, importedUsername || currentUsername);
      if (isMissingLink(record.link) && importedLink) {
        record.link = importedLink;
        repairedLinks += 1;
        changed = true;
      } else if (changed && isMissingLink(record.link) && record.username) {
        record.link = `https://t.me/${record.username}`;
        repairedLinks += 1;
        changed = true;
      }

      if (changed) {
        record.updatedAt = Date.now();
        await this.ctx.storage.put(key, record);
      }
    }

    await this.ctx.storage.put('meta:usernameRepairDone', true);
    await this.ctx.storage.put('meta:usernameRepairAt', Date.now());
    return { ...result, repairedUsernames, repairedLinks };
  }

  async meta() {
    const meta = await super.meta();
    const repairDone = Boolean(await this.ctx.storage.get('meta:usernameRepairDone'));
    return {
      ...meta,
      fullImportDone: Boolean(meta.fullImportDone) && repairDone,
      usernameRepairDone: repairDone,
      usernameRepairAt: Number((await this.ctx.storage.get('meta:usernameRepairAt')) || 0),
    };
  }
}

async function fetchGoogleSheetUsers(sheetUrl) {
  const parsedUrl = parseSheetUrl(sheetUrl);
  if (!parsedUrl.id) throw httpError(400, 'Введите корректную ссылку Google Sheets');

  const exportUrl = new URL(`https://docs.google.com/spreadsheets/d/${parsedUrl.id}/export`);
  exportUrl.searchParams.set('format', 'csv');
  if (parsedUrl.gid) exportUrl.searchParams.set('gid', parsedUrl.gid);

  let response;
  try {
    response = await fetch(exportUrl.toString(), { redirect: 'follow' });
  } catch {
    throw httpError(502, 'Cloudflare не смог подключиться к Google Sheets');
  }

  if (!response.ok) throw httpError(502, `Google Sheets вернул HTTP ${response.status}`);
  const csv = await response.text();
  const preview = csv.slice(0, 500).toLowerCase();
  if (!csv.trim() || /<html|accounts\.google|sign in|войдите в аккаунт/.test(preview)) {
    throw httpError(409, 'Таблица закрыта. В Google Sheets включите «Доступ по ссылке → Читатель» и повторите импорт.');
  }

  const rows = parseCsv(csv);
  if (rows.length < 2) throw httpError(400, 'В таблице нет строк пользователей');
  const headers = rows[0].map(normalizeHeader);
  const indexes = {
    id: headerIndex(headers, ['telegramid', 'telegram_id', 'id']),
    username: headerIndex(headers, ['username', 'user_name']),
    link: headerIndex(headers, ['link', 'telegramlink', 'telegram_link']),
    banned: headerIndex(headers, ['isbanned', 'is_banned', 'banned']),
    wow: headerIndex(headers, ['stars_wow', 'starswow', 'wowstars']),
    ws: headerIndex(headers, ['stars_ws', 'starsws', 'wsstars']),
    lastGames: headerIndex(headers, ['lastgames', 'last_games']),
  };
  if (indexes.id < 0) throw httpError(400, 'Не найден столбец TelegramID');

  const byId = new Map();
  let invalidRowsSkipped = 0;
  let duplicatesMerged = 0;

  for (const row of rows.slice(1)) {
    const id = String(cell(row, indexes.id)).trim();
    if (!/^\d{3,24}$/.test(id)) {
      if (row.some((value) => String(value || '').trim())) invalidRowsSkipped += 1;
      continue;
    }

    const incoming = {
      id,
      username: cell(row, indexes.username),
      link: cell(row, indexes.link),
      isBanned: parseBool(cell(row, indexes.banned)),
      wowStars: parseNumber(cell(row, indexes.wow), 0),
      wsStars: parseNumber(cell(row, indexes.ws), 0),
      lastGames: normalizeLastGames(cell(row, indexes.lastGames)),
    };

    const previous = byId.get(id);
    if (!previous) {
      byId.set(id, incoming);
      continue;
    }

    duplicatesMerged += 1;
    byId.set(id, {
      ...previous,
      username: normalizeUsername(previous.username) ? previous.username : incoming.username,
      link: !isMissingLink(previous.link) ? previous.link : incoming.link,
      isBanned: Boolean(previous.isBanned || incoming.isBanned),
      wowStars: Math.max(parseNumber(previous.wowStars, 0), parseNumber(incoming.wowStars, 0)),
      wsStars: Math.max(parseNumber(previous.wsStars, 0), parseNumber(incoming.wsStars, 0)),
      lastGames: previous.lastGames?.length >= incoming.lastGames?.length ? previous.lastGames : incoming.lastGames,
    });
  }

  return {
    users: [...byId.values()],
    sourceRows: Math.max(0, rows.length - 1),
    invalidRowsSkipped,
    duplicatesMerged,
  };
}

function parseSheetUrl(value) {
  const text = String(value || '').trim();
  const idMatch = text.match(/\/spreadsheets\/d\/([A-Za-z0-9_-]{20,})/);
  if (!idMatch) return { id: '', gid: '' };
  let gid = '';
  try {
    const url = new URL(text);
    gid = url.searchParams.get('gid') || new URLSearchParams(url.hash.replace(/^#/, '')).get('gid') || '';
  } catch {}
  return { id: idMatch[1], gid: /^\d+$/.test(gid) ? gid : '' };
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  const source = String(text || '').replace(/^\uFEFF/, '');

  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i];
    if (quoted) {
      if (ch === '"' && source[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (ch === '"') {
        quoted = false;
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n') { row.push(field.replace(/\r$/, '')); rows.push(row); row = []; field = ''; }
    else field += ch;
  }

  if (field.length || row.length) { row.push(field.replace(/\r$/, '')); rows.push(row); }
  return rows.filter((cells) => cells.some((value) => String(value || '').trim()));
}

function normalizeHeader(value) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
}

function headerIndex(headers, candidates) {
  for (const candidate of candidates) {
    const index = headers.indexOf(candidate);
    if (index >= 0) return index;
  }
  return -1;
}

function cell(row, index) {
  return index >= 0 ? String(row[index] ?? '').trim() : '';
}

function normalizeLastGames(value) {
  let parsed = value;
  if (typeof value === 'string') {
    try { parsed = JSON.parse(value); } catch { parsed = []; }
  }
  return Array.isArray(parsed) ? parsed.map((item) => String(item || '').trim()).filter(Boolean).slice(0, 3) : [];
}

function parseBool(value) {
  return value === true || value === 1 || value === '1' || ['true', 'yes', 'да'].includes(String(value || '').trim().toLowerCase());
}

function parseNumber(value, fallback = 0) {
  const number = Number(String(value ?? '').replace(',', '.'));
  return Number.isFinite(number) ? number : fallback;
}

function cleanId(value) {
  const id = String(value ?? '').replace(/\D/g, '').slice(0, 24);
  return id.length >= 3 ? id : '';
}

function normalizeUsername(value) {
  const text = String(value ?? '').trim().replace(/^@+/, '').slice(0, 64);
  if (!text) return '';
  const lowered = text.toLowerCase().replace(/[\s_-]+/g, '');
  if (['безника', 'безusername', 'nousername', 'unknown', 'неизвестно', 'none', 'null', 'аноним'].includes(lowered)) return '';
  return text;
}

function isMissingLink(value) {
  const text = String(value ?? '').trim().toLowerCase();
  return !text || ['неизвестно', 'unknown', 'none', 'null', 'аноним'].includes(text);
}

function normalizeLink(value, username) {
  const text = String(value ?? '').trim();
  if (/^https?:\/\//i.test(text)) return text.slice(0, 300);
  return username ? `https://t.me/${username}` : '';
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
