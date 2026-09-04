// Движок онлайн-Шпиона. Чистая логика без сети и хранилища: на входе состояние
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
    outcome: null,
    voice: {},
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
  delete room.voice[playerId];
  touch(room, now);
  return { deleted: false };
}

export function setSettings(room, playerId, settings, now = Date.now()) {
  requireHost(room, playerId);
  if (room.status !== 'lobby') throw fail('Настройки меняются только до начала партии', 'NOT_IN_LOBBY');
  if (settings.spyCount !== undefined) {
    const value = Math.floor(Number(settings.spyCount));
    if (!Number.isFinite(value) || value < 1) throw fail('Шпионов должно быть хотя бы один', 'BAD_SPY_COUNT');
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
  // Шпионов всегда меньше, чем горожан: иначе локацию некому знать.
  const spyCount = Math.min(Math.max(1, Math.floor(room.spyCount || 1)), active.length - 1);
  const pool = Array.isArray(locations) ? locations.filter((item) => typeof item === 'string' && item.trim()) : [];
  if (!pool.length) throw fail('Список локаций пуст', 'NO_LOCATIONS', 500);

  room.spyCount = spyCount;
  room.location = pool[randomInt(pool.length)];
  room.round = Number(room.round || 0) + 1;
  room.status = 'roles';
  room.votes = {};
  room.outcome = null;
  room.roundStartedAt = 0;
  room.roundDeadlineMs = 0;

  const spyIndices = pickUnique(active.length, spyCount);
  active.forEach((player, index) => {
    player.role = spyIndices.has(index) ? 'spy' : 'citizen';
    player.seenRole = false;
    player.ready = false;
  });
  for (const player of room.players) {
    if (player.isActive === false) {
      player.role = null;
      player.seenRole = false;
      player.ready = false;
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
  touch(room, now);
}

export function castVote(room, playerId, targetId, now = Date.now()) {
  activePlayer(room, playerId);
  if (room.status !== 'voting') throw fail('Сейчас не голосование', 'NOT_IN_VOTING');
  if (targetId === playerId) throw fail('За себя голосовать нельзя', 'SELF_VOTE');
  const target = room.players.find((item) => item.playerId === targetId && item.isActive !== false);
  if (!target) throw fail('Игрок не найден', 'TARGET_NOT_FOUND');
  room.votes[playerId] = targetId;
  touch(room, now);
  const active = room.players.filter((item) => item.isActive !== false);
  if (active.every((item) => room.votes[item.playerId])) finishByVote(room, now);
}

export function spyGuess(room, playerId, guess, now = Date.now()) {
  const player = activePlayer(room, playerId);
  if (player.role !== 'spy') throw fail('Угадывать локацию может только шпион', 'NOT_A_SPY', 403);
  if (room.status !== 'discussion' && room.status !== 'voting') throw fail('Сейчас нельзя назвать локацию', 'BAD_STATUS');
  const correct = normalizeGuess(guess) === normalizeGuess(room.location);
  room.status = 'results';
  room.outcome = {
    kind: 'guess',
    spyWon: correct,
    guess: String(guess || '').slice(0, 80),
    location: room.location,
    byPlayerId: playerId,
    spies: spyIds(room),
    tally: [],
    accusedId: '',
  };
  touch(room, now);
}

function finishByVote(room, now) {
  const tally = new Map();
  for (const target of Object.values(room.votes)) tally.set(target, (tally.get(target) || 0) + 1);
  let accusedId = '';
  let best = -1;
  let tie = false;
  for (const [target, count] of tally) {
    if (count > best) { best = count; accusedId = target; tie = false; }
    else if (count === best) tie = true;
  }
  const spies = spyIds(room);
  // Ничья — шпион остался неразоблачённым, это его победа.
  const caught = !tie && accusedId && spies.includes(accusedId);
  room.status = 'results';
  room.outcome = {
    kind: 'vote',
    spyWon: !caught,
    tie,
    accusedId: tie ? '' : accusedId,
    location: room.location,
    spies,
    tally: [...tally.entries()].map(([playerId, votes]) => ({ playerId, votes })).sort((a, b) => b.votes - a.votes),
    guess: '',
    byPlayerId: '',
  };
  touch(room, now);
}

export function endRoundByTimeout(room, now = Date.now()) {
  if (room.status !== 'discussion') return false;
  if (!room.roundDeadlineMs || room.roundDeadlineMs > now) return false;
  room.status = 'voting';
  room.votes = {};
  touch(room, now);
  return true;
}

export function backToLobby(room, playerId, now = Date.now()) {
  requireHost(room, playerId);
  room.status = 'lobby';
  room.votes = {};
  room.outcome = null;
  room.location = '';
  room.roundStartedAt = 0;
  room.roundDeadlineMs = 0;
  for (const player of room.players) {
    player.role = null;
    player.seenRole = false;
    player.ready = false;
  }
  // Ушедшие в прошлой партии в лобби не возвращаются.
  room.players = room.players.filter((item) => item.isActive !== false);
  touch(room, now);
}

export function setVoiceState(room, playerId, voice, now = Date.now()) {
  activePlayer(room, playerId);
  const current = room.voice[playerId] || {};
  room.voice[playerId] = {
    joined: voice.joined === undefined ? Boolean(current.joined) : Boolean(voice.joined),
    muted: voice.muted === undefined ? Boolean(current.muted) : Boolean(voice.muted),
    at: now,
  };
  touch(room, now);
}

/*
  Вид комнаты для одного игрока. Локация уходит только тем, кто её знает:
  горожанам во время партии и всем на экране итогов. Роли чужих игроков не
  раскрываются до конца партии — иначе смысл игры теряется на первом же
  перехваченном сообщении.
*/
export function buildView(room, viewerId, connectedIds = new Set()) {
  const me = room.players.find((item) => item.playerId === viewerId) || null;
  const finished = room.status === 'results';
  const iAmSpy = me?.role === 'spy';
  const showLocation = finished || (me && me.role === 'citizen' && room.status !== 'lobby');

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
    me: me
      ? {
        playerId: me.playerId,
        name: me.name,
        role: room.status === 'lobby' ? null : me.role,
        isSpy: room.status === 'lobby' ? false : iAmSpy,
        seenRole: Boolean(me.seenRole),
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
        // Роль чужого игрока видна только на итогах.
        role: finished ? item.role : null,
        voice: room.voice[item.playerId]
          ? { joined: Boolean(room.voice[item.playerId].joined), muted: Boolean(room.voice[item.playerId].muted) }
          : { joined: false, muted: false },
      })),
    outcome: room.outcome ? { ...room.outcome } : null,
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

// Криптостойкий выбор: Math.random в раздаче ролей — это предсказуемый шпион.
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
