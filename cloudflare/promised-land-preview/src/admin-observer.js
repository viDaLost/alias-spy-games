/*
  Невидимый монитор комнаты — для админ-панели.

  Устройство то же, что у «Двенадцати колен», и по той же причине: человек
  пишет «зависло» или «бот ходит за меня», а к тому времени, когда он пришлёт
  скриншот, партия уже другая. Комната умеет показать себя администратору —
  только на чтение и только ему.

  Отличие от карточной игры одно, и оно в пользу монитора: в «Земле
  обетованной» прятать нечего. Доска открыта всем за столом, серебро и уделы
  тоже — то же самое видят и игроки. Поэтому здесь не приходится собирать
  особый вид: достаточно пересказать доску короче, чем она есть.

  Право проверяет ядро приложения: токен админской сессии выдан там, и подпись
  под ним проверяется там же. Пришли без токена — запрос идёт дальше обычными
  маршрутами, то есть заканчивается ничем.

  Опрос дешёвый: версия комнаты служит ETag, и пока на доске ничего не
  изменилось, ответа с телом не будет.
*/

const SESSION_CACHE_MS = 30_000;
const sessionCache = new Map();

export const ADMIN_STATE_PATH = /^\/api\/admin\/rooms\/([A-Za-z0-9]{4,10})\/state$/;

/** Ответ монитора или null, если запрос не к нему и его надо вести дальше. */
export async function adminRoomState(request, env, { roomStub, normalizeRoomId, cors = {} }) {
  const url = new URL(request.url);
  const match = url.pathname.match(ADMIN_STATE_PATH);
  if (!match) return null;
  if (!/^Bearer\s+\S/i.test(String(request.headers.get('Authorization') || ''))) return null;
  if (request.method !== 'GET') return json({ ok: false, error: 'Not found' }, 404, cors);

  try {
    await verifyAdminSession(env, bearerToken(request));
    const roomId = normalizeRoomId(match[1]);
    const headers = new Headers();
    const ifNoneMatch = String(request.headers.get('If-None-Match') || '');
    if (ifNoneMatch) headers.set('If-None-Match', ifNoneMatch);
    const response = await roomStub(env, roomId)
      .fetch(new Request('https://promised.internal/admin-state', { method: 'GET', headers }));
    const etag = response.headers.get('ETag') || '';
    const etagHeader = etag ? { ETag: etag } : {};
    if (response.status === 304) return new Response(null, { status: 304, headers: { ...cors, ...etagHeader } });
    const payload = await response.json().catch(() => ({}));
    return json(payload, response.status, { ...cors, ...etagHeader });
  } catch (error) {
    return json({ ok: false, error: String(error?.message || error) }, Number(error?.status || 500), cors);
  }
}

async function verifyAdminSession(env, token) {
  if (!token) throw httpError(401, 'Нужен токен администратора');
  if (!env.APP_CORE) throw httpError(503, 'Ядро приложения не подключено к комнатам');
  const now = Date.now();
  const cached = sessionCache.get(token);
  if (cached && cached.cachedUntil > now && cached.expiresAt > now) return cached;
  const response = await env.APP_CORE.fetch('https://core.internal/web/session/verify', {
    method: 'GET',
    headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
  });
  const data = await response.json().catch(() => ({}));
  /*
    Отказ по коду ядра, но не ниже трёхсот: сессия обычного игрока — ответ
    вполне удачный, с кодом 200, и брать его как есть значило бы ответить
    «хорошо» тому, кому отказано.
  */
  if (!response.ok || data?.ok !== true || data?.scope !== 'admin') {
    const status = response.status >= 400 ? response.status : 403;
    throw httpError(status, data?.error || 'Только для администратора');
  }
  const value = {
    expiresAt: Number(data.expiresAt || 0),
    cachedUntil: Math.min(Number(data.expiresAt || now), now + SESSION_CACHE_MS),
  };
  sessionCache.set(token, value);
  return value;
}

/*
  Доска в пересказе. Полное состояние партии администратору не нужно: тридцать
  шесть клеток со всей их историей он читать не станет. Нужно то, по чему видно,
  жива ли партия и кто в ней тонет: год, чей ход, у кого сколько серебра,
  уделов и построек, и последние события.
*/
export function adminStateResponse(request, room, game, board, online = new Set()) {
  if (!room) return json({ ok: false, error: 'Комната не найдена' }, 404);
  const etag = `"v${Number(room.version || 0)}"`;
  if (String(request.headers.get('If-None-Match') || '') === etag) {
    return new Response(null, { status: 304, headers: { ETag: etag, 'Cache-Control': 'no-store' } });
  }

  const seatOf = (id) => (room.seats || []).indexOf(String(id || ''));
  const holdings = (playerId) => {
    let plots = 0;
    let levels = 0;
    let pledged = 0;
    for (let n = 0; n < (game?.cells?.length || 0); n += 1) {
      const cell = game.cells[n];
      if (!cell || cell.owner !== playerId) continue;
      plots += 1;
      levels += Number(cell.level || 0) + (cell.altar ? 1 : 0);
      if (cell.pledge) pledged += 1;
    }
    return { plots, levels, pledged };
  };

  const current = game ? game.players[game.turn] : null;
  return json({
    ok: true,
    observer: true,
    game: 'promised-land',
    roomId: room.roomId,
    status: room.phase,
    version: Number(room.version || 0),
    settings: { ...room.settings },
    players: room.players.map((one) => {
      const seat = seatOf(one.id);
      const inGame = game && seat >= 0 ? game.players[seat] : null;
      return {
        name: one.name,
        host: one.id === room.hostPlayerId,
        online: online.has(one.id),
        left: Boolean(one.leftAt),
        seat,
        silver: inGame ? Number(inGame.silver || 0) : null,
        debt: inGame ? Number(inGame.debt || 0) : null,
        out: inGame ? Boolean(inGame.out) : false,
        ...(inGame ? holdings(inGame.id) : {}),
      };
    }),
    table: game ? {
      year: Number(game.year || 0),
      years: Number(game.years || 0),
      mode: String(game.mode || ''),
      phase: String(game.phase || ''),
      sabbath: Boolean(game.sabbath),
      turnName: current ? current.name : '',
      turnIsBot: Boolean(current && current.isBot),
      turnCell: current ? cellName(board, current.at) : '',
      pending: game.pending ? String(game.pending.type || '') : '',
      trade: game.trade ? `${nameOf(game, game.trade.from)} → ${nameOf(game, game.trade.to)}` : '',
      seats: game.players.map((one) => ({
        name: one.name,
        isBot: Boolean(one.isBot),
        silver: Number(one.silver || 0),
        at: cellName(board, one.at),
        out: Boolean(one.out),
        ...holdings(one.id),
      })),
    } : null,
    log: (game?.log || []).slice(-30).map((line) => String(line?.text || line || '')),
    chat: (room.chat || []).slice(-12).map((line) => `${line.name}: ${line.text}`),
    updatedAt: Number(room.updatedAt || 0),
  }, 200, { ETag: etag });
}

function cellName(board, at) {
  const spec = board?.BOARD?.[Number(at)];
  return spec ? String(spec.name || '') : '';
}

function nameOf(game, id) {
  return String(game.players.find((one) => one.id === id)?.name || id || '');
}

function bearerToken(request) {
  const match = String(request.headers.get('Authorization') || '').match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : '';
}

function httpError(status, message) { const error = new Error(message); error.status = status; return error; }

function json(value, status = 200, extra = {}) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...extra },
  });
}
