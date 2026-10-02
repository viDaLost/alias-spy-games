/*
  Невидимый монитор комнаты «Царств» — для админ-панели.

  Устроен так же, как монитор «Двенадцати колен»: тот же путь, та же проверка
  права у ядра приложения, тот же ETag по версии комнаты. Отличается только
  отчёт — стол другой.

  Администратору иногда нужно увидеть идущую партию: человек пишет «зависло»,
  «меня выкинуло», «бот ходит за меня». Спрашивать у него скриншоты — долго и
  бесполезно: к тому времени партия уже другая. Поэтому комната умеет отдать
  своё состояние наружу — но только на чтение и только администратору.

  Три правила, на которых это держится.

  Первое: администратор не садится за стол. Он не игрок, его нет в списке, он
  не занимает места и не мешает очереди. Комната отвечает ему тем же видом,
  какой получает зритель: закрытых приказов, целей и карт на руках не видно ни
  у кого — тайна приказа остаётся тайной и для админки.

  Второе: право проверяет не эта страница, а сервер. Токен админской сессии
  выдаёт ядро приложения, и подпись под ним проверяется там же; здесь только
  спрашивают. Пришли без токена — запрос уходит дальше по обычным маршрутам
  комнаты, то есть заканчивается ничем.

  Третье: опрос дешёвый. У состояния есть версия, и она же ETag: пока за
  столом ничего не изменилось, комната отвечает «не изменилось» без тела.
*/

const SESSION_CACHE_MS = 30_000;
const sessionCache = new Map();

/** Путь монитора. Отдельный, чтобы обычные маршруты комнаты его не задевали. */
export const ADMIN_STATE_PATH = /^\/admin\/rooms\/([A-Z0-9]{4,10})\/state$/i;

/**
 * Ответ монитора или null, если запрос не к монитору и его надо вести дальше.
 * Вызывается до всех прочих маршрутов: по пути их ни с чем не спутать.
 */
export async function adminRoomState(request, env, { roomStub, normalizeRoomId, cors }) {
  const url = new URL(request.url);
  const match = url.pathname.match(ADMIN_STATE_PATH);
  if (!match) return null;
  // Без предъявленного токена это не запрос монитора, а случайный путь.
  if (!/^Bearer\s+\S/i.test(String(request.headers.get('Authorization') || ''))) return null;
  if (request.method !== 'GET') return json({ ok: false, error: 'Not found' }, 404, cors);

  try {
    await verifyAdminSession(env, bearerToken(request));
    const roomId = normalizeRoomId(match[1]);
    const headers = new Headers();
    const ifNoneMatch = String(request.headers.get('If-None-Match') || '');
    if (ifNoneMatch) headers.set('If-None-Match', ifNoneMatch);
    const response = await roomStub(env, roomId)
      .fetch(new Request('https://kingdoms.internal/admin-state', { method: 'GET', headers }));
    const etag = response.headers.get('ETag') || '';
    const etagHeader = etag ? { ETag: etag } : {};
    if (response.status === 304) return new Response(null, { status: 304, headers: { ...cors, ...etagHeader } });
    const payload = await response.json().catch(() => ({}));
    return json(payload, response.status, { ...cors, ...etagHeader });
  } catch (error) {
    return json({ ok: false, error: String(error?.message || error) }, Number(error?.status || 500), cors);
  }
}

/*
  Право администратора. Спрашивается у ядра приложения — там живёт и подпись
  сессии, и список тех, кому она выдана. Ответ держится полминуты: панель
  опрашивает комнату каждые пару секунд, и ходить за правом на каждый опрос
  значило бы устроить ядру свой собственный поток запросов.
*/
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
  Состояние комнаты для монитора. Собирается тем же видом, что и для зрителя,
  — пустым именем игрока, — поэтому закрытых приказов и целей в нём нет по
  устройству, а не по обещанию: их некому выдать.

  Смотреть на этом столе стоит на три вещи: чей ход, сколько у кого земли и не
  встала ли партия. Земля считается по карте — по владельцу каждой области.
*/
export function adminStateResponse(request, room, view, rules) {
  if (!room) return json({ ok: false, error: 'Комната не найдена' }, 404);
  const etag = `"v${Number(room.version || 0)}"`;
  if (String(request.headers.get('If-None-Match') || '') === etag) {
    return new Response(null, { status: 304, headers: { ETag: etag, 'Cache-Control': 'no-store' } });
  }
  const game = view.game;
  const owned = (seat) => Object.values(game?.areas || {}).filter((cell) => cell?.owner === seat).length;
  const scoreOf = (seat) => {
    const score = (game?.finalScore || []).find((one) => one?.seat === seat);
    return score ? Number(score.total || 0) : null;
  };
  const winners = game && game.winner !== null && game.winner !== undefined
    ? [].concat(game.winner).map((seat) => game.players[seat]?.name || '').filter(Boolean)
    : [];
  return json({
    ok: true,
    observer: true,
    game: 'kingdoms',
    roomId: view.roomId,
    status: view.phase,
    version: Number(room.version || 0),
    settings: view.settings,
    players: view.players.map((one) => ({
      name: one.name,
      host: one.host,
      online: one.online,
      left: one.left,
      seat: Number(one.seat),
    })),
    table: game ? {
      round: game.round,
      rounds: Number(rules?.ROUNDS || 0),
      phase: game.phase,
      turnName: game.turn >= 0 ? game.players[game.turn]?.name || '' : '',
      turnIsBot: game.turn >= 0 ? Boolean(game.players[game.turn]?.isBot) : false,
      winners,
      seats: game.players.map((one, seat) => ({
        name: one.name,
        kingdom: rules?.kingdomOf?.(one.kingdomId)?.name || one.kingdomId || '',
        isBot: Boolean(one.isBot),
        out: Boolean(one.eliminated),
        areas: owned(seat),
        orders: (game.orders || []).filter((order) => order.owner === seat).length,
        score: scoreOf(seat),
      })),
    } : null,
    log: (game?.log || []).slice(-30).map((line) => String(line?.text ?? line ?? '')),
    updatedAt: Number(room.updatedAt || 0),
  }, 200, { ETag: etag });
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
