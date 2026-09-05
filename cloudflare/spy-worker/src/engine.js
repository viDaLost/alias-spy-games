// Движок онлайн-Соглядатая. Чистая логика без сети и хранилища: на входе состояние
// комнаты и действие, на выходе изменённое состояние. Всё, что связано с
// Durable Object, WebSocket и подписями, живёт в index.js.
//
// Правило, из-за которого движок вынесен отдельно: локацию и роли не должен
// видеть никто, кроме их владельца. Полное состояние комнаты не уходит на
// клиент никогда — наружу отдаёт только buildView, и он собирает отдельный
// вид для каждого игрока.

export const MIN_PLAYERS = 3;
export const MAX_PLAYERS = 12;
export const DEFAULT_ROUND_SECONDS = 8 * 60;
export const MIN_ROUND_SECONDS = 60;
export const MAX_ROUND_SECONDS = 20 * 60;

const NAME_MAX = 24;

export function sanitizeName(value) {
  const text = String(value ?? '')
    .replace(/[\u0000-\u001f\u007f<>]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, NAME_MAX);
  return text || 'Игрок';
}

function fail(message, code, status = 409) {
  return Object.assign(new Error(message), { code, status });
}

export function createRoomState(roomId, host, now = Date.now()) {
  return {
    roomId,
    version: 1,
    status: 'lobby', // lobby | roles | discussion | voting | results
    createdAt: now,
    updatedAt: now,
    hostPlayerId: host.playerId,
    players: [makePlayer(host, now)],
    spyCount: 1,
    roundSeconds: DEFAULT_ROUND_SECONDS,
    // Секретная часть. Наружу не отдаётся ни одним полем buildView.
    location: '',
    round: 0,
    roundStartedAt: 0,
    roundDeadlineMs: 0,
    votes: {},
    voteRound: 0,
    outcome: null,
    chat: [],
    chatSeq: 0,
    spyChat: [],
    spyChatSeq: 0,
  };
}

function makePlayer(player, now) {
  return {
    playerId: String(player.playerId),
    name: sanitizeName(player.name),
    isActive: true,
    joinedAt: now,
    role: null, // 'citizen' | 'spy'
    seenRole: false,
    ready: false,
    // Изгнанный голосованием остаётся в комнате и смотрит партию, но больше
    // не голосует и не пишет: иначе он знает больше остальных и подсказывает.
    eliminated: false,
    eliminatedRound: 0,
  };
}

export function joinRoom(room, player, now = Date.now()) {
  const existing = room.players.find((item) => item.playerId === player.playerId);
  if (existing) {
    // Возврат в свою комнату после потери связи не должен считаться новым игроком.
    existing.isActive = true;
    existing.name = sanitizeName(player.name || existing.name);
    touch(room, now);
    return existing;
  }
  if (room.status !== 'lobby') throw fail('Партия уже идёт — дождитесь следующей', 'ROOM_IN_PROGRESS');
  const active = room.players.filter((item) => item.isActive !== false);
  if (active.length >= MAX_PLAYERS) throw fail(`В комнате максимум ${MAX_PLAYERS} игроков`, 'ROOM_FULL');
  const created = makePlayer(player, now);
  room.players.push(created);
  touch(room, now);
  return created;
}

export function leaveRoom(room, playerId, now = Date.now()) {
  const index = room.players.findIndex((item) => item.playerId === playerId);
  if (index < 0) return { deleted: false };
  if (room.status === 'lobby') room.players.splice(index, 1);
  else room.players[index].isActive = false;

  const remaining = room.players.filter((item) => item.isActive !== false);
  if (!remaining.length) return { deleted: true };
  // Ведущий ушёл — комната не должна остаться без того, кто может начать партию.
  if (!remaining.some((item) => item.playerId === room.hostPlayerId)) {
    room.hostPlayerId = remaining[0].playerId;
  }
  delete room.votes[playerId];
  touch(room, now);
  // Ушедший мог быть последним, кого ждали: без этого голосование зависло бы
  // до конца обсуждения, которого уже нет.
  if (room.status === 'voting') {
    const alive = inPlay(room);
    if (alive.length && alive.every((item) => room.votes[item.playerId])) resolveVote(room, now);
  }
  return { deleted: false };
}

export function setSettings(room, playerId, settings, now = Date.now()) {
  requireHost(room, playerId);
  if (room.status !== 'lobby') throw fail('Настройки меняются только до начала партии', 'NOT_IN_LOBBY');
  if (settings.spyCount !== undefined) {
    const value = Math.floor(Number(settings.spyCount));
    if (!Number.isFinite(value) || value < 1) throw fail('Соглядатаев должно быть хотя бы один', 'BAD_SPY_COUNT');
    room.spyCount = value;
  }
  if (settings.roundSeconds !== undefined) {
    const value = Math.floor(Number(settings.roundSeconds));
    if (!Number.isFinite(value) || value < MIN_ROUND_SECONDS || value > MAX_ROUND_SECONDS) {
      throw fail('Длительность обсуждения вне допустимых границ', 'BAD_ROUND_SECONDS');
    }
    room.roundSeconds = value;
  }
  touch(room, now);
}

export function renamePlayer(room, playerId, name, now = Date.now()) {
  const player = room.players.find((item) => item.playerId === playerId);
  if (!player) throw fail('Игрок не найден', 'PLAYER_NOT_FOUND', 403);
  player.name = sanitizeName(name);
  touch(room, now);
}

export function startGame(room, playerId, locations, now = Date.now()) {
  requireHost(room, playerId);
  if (room.status !== 'lobby' && room.status !== 'results') throw fail('Партия уже идёт', 'ROOM_IN_PROGRESS');
  const active = room.players.filter((item) => item.isActive !== false);
  if (active.length < MIN_PLAYERS) throw fail(`Нужно минимум ${MIN_PLAYERS} игрока`, 'NOT_ENOUGH_PLAYERS');
  // Соглядатаев всегда меньше, чем горожан: иначе локацию некому знать.
  const spyCount = Math.min(Math.max(1, Math.floor(room.spyCount || 1)), active.length - 1);
  const pool = Array.isArray(locations) ? locations.filter((item) => typeof item === 'string' && item.trim()) : [];
  if (!pool.length) throw fail('Список локаций пуст', 'NO_LOCATIONS', 500);

  room.spyCount = spyCount;
  room.location = pool[randomInt(pool.length)];
  room.round = Number(room.round || 0) + 1;
  room.status = 'roles';
  room.votes = {};
  room.voteRound = 0;
  room.outcome = null;
  room.roundStartedAt = 0;
  room.roundDeadlineMs = 0;
  // Роли раздаются заново, а в закрытом чате лежит переписка прошлых
  // соглядатаев. Не вычистить его — значит выдать прошлую партию новому составу.
  room.spyChat = [];

  const spyIndices = pickUnique(active.length, spyCount);
  active.forEach((player, index) => {
    player.role = spyIndices.has(index) ? 'spy' : 'citizen';
    player.seenRole = false;
    player.ready = false;
    player.eliminated = false;
    player.eliminatedRound = 0;
  });
  for (const player of room.players) {
    if (player.isActive === false) {
      player.role = null;
      player.seenRole = false;
      player.ready = false;
      player.eliminated = false;
      player.eliminatedRound = 0;
    }
  }
  touch(room, now);
}

export function markRoleSeen(room, playerId, now = Date.now()) {
  const player = activePlayer(room, playerId);
  if (room.status !== 'roles') return;
  player.seenRole = true;
  player.ready = true;
  touch(room, now);
  // Как только роль увидели все, обсуждение стартует само: ждать ведущего
  // на этом шаге незачем, а лишний экран сбивает темп.
  const active = room.players.filter((item) => item.isActive !== false);
  if (active.length && active.every((item) => item.ready)) beginDiscussion(room, now);
}

export function beginDiscussion(room, now = Date.now()) {
  room.status = 'discussion';
  room.roundStartedAt = now;
  room.roundDeadlineMs = now + room.roundSeconds * 1000;
  touch(room, now);
}

export function forceDiscussion(room, playerId, now = Date.now()) {
  requireHost(room, playerId);
  if (room.status !== 'roles') throw fail('Обсуждение уже идёт', 'NOT_IN_ROLES');
  beginDiscussion(room, now);
}

export function beginVoting(room, playerId, now = Date.now()) {
  if (playerId) requireHost(room, playerId);
  if (room.status !== 'discussion') throw fail('Голосование доступно только после обсуждения', 'NOT_IN_DISCUSSION');
  room.status = 'voting';
  room.votes = {};
  room.voteRound = Number(room.voteRound || 0) + 1;
  touch(room, now);
}

export function castVote(room, playerId, targetId, now = Date.now()) {
  const voter = activePlayer(room, playerId);
  if (room.status !== 'voting') throw fail('Сейчас не голосование', 'NOT_IN_VOTING');
  if (voter.eliminated) throw fail('Изгнанный больше не голосует', 'ELIMINATED', 403);
  if (targetId === playerId) throw fail('За себя голосовать нельзя', 'SELF_VOTE');
  const target = inPlay(room).find((item) => item.playerId === targetId);
  if (!target) throw fail('Игрок не найден', 'TARGET_NOT_FOUND');
  room.votes[playerId] = targetId;
  touch(room, now);
  if (inPlay(room).every((item) => room.votes[item.playerId])) resolveVote(room, now);
}

export function spyGuess(room, playerId, guess, now = Date.now()) {
  const player = activePlayer(room, playerId);
  if (player.role !== 'spy') throw fail('Угадывать локацию может только соглядатай', 'NOT_A_SPY', 403);
  if (player.eliminated) throw fail('Изгнанный больше не называет локацию', 'ELIMINATED', 403);
  if (room.status !== 'discussion' && room.status !== 'voting') throw fail('Сейчас нельзя назвать локацию', 'BAD_STATUS');
  const correct = normalizeGuess(guess) === normalizeGuess(room.location);
  const details = { guess: String(guess || '').slice(0, 80), byPlayerId: playerId, tally: [], accusedId: '' };

  // Угадал — партия кончилась, и напарнику доигрывать нечего.
  if (correct) { finish(room, 'guess', true, details, now); return; }

  // Промахнулся — назвался сам, и с поля уходит только он. Второй соглядатай,
  // если он есть, продолжает партию: чужая ошибка его не выдаёт.
  eliminate(room, player, now);
  if (!settleRound(room, 'guess', details, now)) beginDiscussion(room, now);
  touch(room, now);
}

/*
  Итог круга голосования. Раньше на этом месте партия заканчивалась всегда, и
  при двух соглядатаях второй оставался в игре, которой уже нет: голосование
  выгоняло одного, экран итогов открывал обе роли. Теперь круг голосования
  выгоняет одного игрока, а партия продолжается, пока соглядатаи не кончились
  или пока их не стало столько же, сколько горожан.
*/
function resolveVote(room, now) {
  const tally = new Map();
  for (const target of Object.values(room.votes)) tally.set(target, (tally.get(target) || 0) + 1);
  let accusedId = '';
  let best = -1;
  let tie = false;
  for (const [target, count] of tally) {
    if (count > best) { best = count; accusedId = target; tie = false; }
    else if (count === best) tie = true;
  }
  const details = {
    tie,
    accusedId: tie ? '' : accusedId,
    tally: [...tally.entries()].map(([playerId, votes]) => ({ playerId, votes })).sort((a, b) => b.votes - a.votes),
    guess: '',
    byPlayerId: '',
  };

  // Ничья никого не выгоняет: обвинять наугад дороже, чем поговорить ещё круг.
  const accused = tie ? null : inPlay(room).find((item) => item.playerId === accusedId);
  if (accused) eliminate(room, accused, now);
  room.votes = {};
  if (!settleRound(room, 'vote', details, now)) beginDiscussion(room, now);
  touch(room, now);
}

function eliminate(room, player, now) {
  player.eliminated = true;
  player.eliminatedRound = Number(room.voteRound || 0);
  touch(room, now);
}

/*
  Кончилась ли партия. Горожане побеждают, когда выгнан последний соглядатай;
  соглядатаи — когда их стало не меньше, чем горожан: голосованием их уже не
  пересилить. Пока ни то ни другое не сошлось, роли не раскрываются: игроки не
  знают, выгнали они соглядатая или своего, и в этом весь следующий круг.
*/
function settleRound(room, kind, details, now) {
  const spiesLeft = inPlay(room).filter((item) => item.role === 'spy');
  const citizensLeft = inPlay(room).filter((item) => item.role !== 'spy');
  if (!spiesLeft.length) { finish(room, kind, false, details, now); return true; }
  if (spiesLeft.length >= citizensLeft.length) { finish(room, kind, true, details, now); return true; }
  return false;
}

function finish(room, kind, spyWon, details, now) {
  room.status = 'results';
  room.outcome = {
    kind,
    spyWon,
    tie: false,
    accusedId: '',
    guess: '',
    byPlayerId: '',
    ...details,
    location: room.location,
    spies: spyIds(room),
    // Кого и в каком круге выгнали — единственное место, где роли называются
    // вслух. До этого экрана они не уходят на клиент ни одним полем.
    ejected: room.players
      .filter((item) => item.eliminated)
      .sort((a, b) => a.eliminatedRound - b.eliminatedRound)
      .map((item) => ({ playerId: item.playerId, name: item.name, role: item.role, round: item.eliminatedRound })),
  };
  touch(room, now);
}

export function endRoundByTimeout(room, now = Date.now()) {
  if (room.status !== 'discussion') return false;
  if (!room.roundDeadlineMs || room.roundDeadlineMs > now) return false;
  room.status = 'voting';
  room.votes = {};
  room.voteRound = Number(room.voteRound || 0) + 1;
  touch(room, now);
  return true;
}

export function backToLobby(room, playerId, now = Date.now()) {
  requireHost(room, playerId);
  room.status = 'lobby';
  room.votes = {};
  room.voteRound = 0;
  room.outcome = null;
  room.location = '';
  room.roundStartedAt = 0;
  room.roundDeadlineMs = 0;
  room.spyChat = [];
  for (const player of room.players) {
    player.role = null;
    player.seenRole = false;
    player.ready = false;
    player.eliminated = false;
    player.eliminatedRound = 0;
  }
  // Ушедшие в прошлой партии в лобби не возвращаются.
  room.players = room.players.filter((item) => item.isActive !== false);
  touch(room, now);
}

export const MAX_CHAT_MESSAGES = 80;

export const CHAT_CHANNELS = ['common', 'spies'];

/*
  Два чата. Общий — он же и есть обсуждение: игроки спрашивают друг друга и
  ищут того, кто локации не знает. Его нельзя чистить между этапами: переписка
  и есть улика, по которой голосуют.

  Закрытый чат соглядатаев нужен, потому что играют они за одну команду, а
  сговориться им негде: в общем чате любое слово друг другу выдаёт обоих.
  Читают и пишут в него только соглядатаи, и раздача новых ролей его стирает.
*/
export function addChatMessage(room, playerId, rawText, now = Date.now(), channel = 'common') {
  const player = activePlayer(room, playerId);
  if (!CHAT_CHANNELS.includes(channel)) throw fail('Неизвестный чат', 'BAD_CHANNEL', 400);
  if (player.eliminated) throw fail('Изгнанный больше не пишет в чат', 'ELIMINATED', 403);
  const spyChannel = channel === 'spies';
  if (spyChannel && player.role !== 'spy') throw fail('Этот чат виден только соглядатаям', 'NOT_A_SPY', 403);
  const text = sanitizeChat(rawText);
  if (!text) throw fail('Сообщение пустое', 'EMPTY_CHAT');

  const seqKey = spyChannel ? 'spyChatSeq' : 'chatSeq';
  const listKey = spyChannel ? 'spyChat' : 'chat';
  room[seqKey] = Number(room[seqKey] || 0) + 1;
  room[listKey].push({ id: String(room[seqKey]), playerId, name: player.name, text, at: now });
  if (room[listKey].length > MAX_CHAT_MESSAGES) {
    room[listKey].splice(0, room[listKey].length - MAX_CHAT_MESSAGES);
  }
  touch(room, now);
}

export function sanitizeChat(value) {
  return String(value || '')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f<>]/g, ' ')
    .replace(/\r/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[^\S\n]{3,}/g, '  ')
    .trim()
    .slice(0, 300);
}

// Старые комнаты в хранилище ни чатов, ни изгнаний не знают: без этого push
// упал бы на undefined, а inPlay считал бы eliminated за истину.
export function ensureChat(room) {
  if (!Array.isArray(room.chat)) room.chat = [];
  room.chatSeq = Number(room.chatSeq || 0);
  if (!Array.isArray(room.spyChat)) room.spyChat = [];
  room.spyChatSeq = Number(room.spyChatSeq || 0);
  room.voteRound = Number(room.voteRound || 0);
  for (const player of room.players || []) {
    player.eliminated = Boolean(player.eliminated);
    player.eliminatedRound = Number(player.eliminatedRound || 0);
  }
}

/*
  Вид комнаты для одного игрока. Локация уходит только тем, кто её знает:
  горожанам во время партии и всем на экране итогов. Роли чужих игроков не
  раскрываются до конца партии — иначе смысл игры теряется на первом же
  перехваченном сообщении. Изгнание роли не раскрывает тоже: выгнали своего
  или соглядатая, остальные узнают только на итогах.
*/
export function buildView(room, viewerId, connectedIds = new Set()) {
  const me = room.players.find((item) => item.playerId === viewerId) || null;
  const finished = room.status === 'results';
  const iAmSpy = me?.role === 'spy';
  const showLocation = finished || (me && me.role === 'citizen' && room.status !== 'lobby');
  const alive = inPlay(room);

  return {
    roomId: room.roomId,
    version: Number(room.version || 0),
    status: room.status,
    round: Number(room.round || 0),
    hostPlayerId: room.hostPlayerId,
    isHost: Boolean(me && me.playerId === room.hostPlayerId),
    spyCount: room.spyCount,
    roundSeconds: room.roundSeconds,
    roundDeadlineMs: room.status === 'discussion' ? room.roundDeadlineMs : 0,
    serverNow: Date.now(),
    minPlayers: MIN_PLAYERS,
    maxPlayers: MAX_PLAYERS,
    location: showLocation ? room.location : '',
    voteRound: Number(room.voteRound || 0),
    // Сколько игроков ещё в игре: по этому числу клиент показывает, что партия
    // идёт дальше. Сколько среди них соглядатаев — не говорит никто.
    inPlayCount: alive.length,
    me: me
      ? {
        playerId: me.playerId,
        name: me.name,
        role: room.status === 'lobby' ? null : me.role,
        isSpy: room.status === 'lobby' ? false : iAmSpy,
        seenRole: Boolean(me.seenRole),
        eliminated: Boolean(me.eliminated),
        voted: Boolean(room.votes[me.playerId]),
        votedFor: room.votes[me.playerId] || '',
      }
      : null,
    players: room.players
      .filter((item) => item.isActive !== false)
      .map((item) => ({
        playerId: item.playerId,
        name: item.name,
        isHost: item.playerId === room.hostPlayerId,
        online: connectedIds.has(item.playerId),
        ready: Boolean(item.ready),
        voted: Boolean(room.votes[item.playerId]),
        eliminated: Boolean(item.eliminated),
        // Роль чужого игрока видна только на итогах.
        role: finished ? item.role : null,
      })),
    outcome: room.outcome ? { ...room.outcome } : null,
    chat: (room.chat || []).map((entry) => ({ ...entry })),
    // Закрытый чат уходит только соглядатаю. Горожанин получает пустой список,
    // а не признак того, что там что-то есть.
    spyChat: iAmSpy ? (room.spyChat || []).map((entry) => ({ ...entry })) : [],
    canWriteSpyChat: Boolean(iAmSpy && !me.eliminated && room.status !== 'lobby' && room.status !== 'results'),
  };
}

function requireHost(room, playerId) {
  if (room.hostPlayerId !== playerId) throw fail('Это может сделать только ведущий', 'NOT_HOST', 403);
}

function activePlayer(room, playerId) {
  const player = room.players.find((item) => item.playerId === playerId && item.isActive !== false);
  if (!player) throw fail('Игрок не найден в комнате', 'PLAYER_NOT_FOUND', 403);
  return player;
}

/** Кто ещё в игре: не вышел из комнаты и не изгнан голосованием. */
function inPlay(room) {
  return room.players.filter((item) => item.isActive !== false && !item.eliminated);
}

function spyIds(room) {
  return room.players.filter((item) => item.role === 'spy').map((item) => item.playerId);
}

function normalizeGuess(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^a-zа-я0-9]+/gi, '');
}

function touch(room, now) {
  room.version = Number(room.version || 0) + 1;
  room.updatedAt = now;
}

// Криптостойкий выбор: Math.random в раздаче ролей — это предсказуемый соглядатай.
export function randomInt(maxExclusive) {
  if (maxExclusive <= 0) return 0;
  const limit = Math.floor(0x100000000 / maxExclusive) * maxExclusive;
  const buffer = new Uint32Array(1);
  let value = 0;
  do {
    crypto.getRandomValues(buffer);
    value = buffer[0];
  } while (value >= limit);
  return value % maxExclusive;
}

function pickUnique(total, count) {
  const picked = new Set();
  while (picked.size < count && picked.size < total) picked.add(randomInt(total));
  return picked;
}
