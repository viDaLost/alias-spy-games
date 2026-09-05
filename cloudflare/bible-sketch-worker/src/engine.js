import { CATEGORY_META, CATALOG, answerMatches, getCategory, getWord, normalizeAnswer } from './catalog.js';

export const ROOM_LIMIT = 15;
export const MIN_PLAYERS = 3;
export const DRAW_TURN_MS = 40_000;
export const ANSWER_REVIEW_MS = 30_000;
export const SPY_VOTE_MS = 50_000;
export const FINAL_GUESS_MS = 30_000;
export const MAX_STROKES = 500;
export const MAX_CHAT = 80;

export function sanitizeName(value) {
  return String(value || 'Игрок').replace(/[<>\n\r\t]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 32) || 'Игрок';
}

export function sanitizeChat(value) {
  return String(value || '').replace(/[<>\r\t]/g, ' ').replace(/\n{3,}/g, '\n\n').trim().slice(0, 300);
}

export function createRoomState(roomId, player, categoryId, now = Date.now()) {
  const category = getCategory(categoryId);
  if (!category) throw gameError('Выберите одну из четырёх категорий', 'BAD_CATEGORY');
  const name = sanitizeName(player.name);
  return {
    roomId,
    version: 1,
    status: 'lobby',
    categoryId: category.id,
    hostPlayerId: player.playerId,
    players: [{ playerId: player.playerId, name, joinedAt: now, isActive: true }],
    roundNumber: 0,
    usedWordIds: [],
    lastWordId: null,
    wordId: null,
    spyPlayerId: null,
    lastSpyPlayerId: null,
    turnOrder: [],
    turnIndex: 0,
    turnDeadlineMs: 0,
    strokes: [],
    earlyGuessUsed: false,
    guessReview: null,
    spyVotes: {},
    result: null,
    chat: [],
    chatSeq: 0,
    log: [`${name} создал комнату · ${category.title}`],
    createdAt: now,
    updatedAt: now,
  };
}

export function joinRoom(state, player, now = Date.now()) {
  const existing = state.players.find((entry) => entry.playerId === player.playerId);
  if (existing) {
    existing.name = sanitizeName(player.name || existing.name);
    existing.isActive = true;
    touch(state, now);
    return { rejoined: true };
  }
  if (state.status !== 'lobby') throw gameError('Раунд уже начался', 'GAME_STARTED');
  if (activePlayers(state).length >= ROOM_LIMIT) throw gameError(`В комнате уже максимум ${ROOM_LIMIT} игроков`, 'ROOM_FULL');
  const name = sanitizeName(player.name);
  state.players.push({ playerId: player.playerId, name, joinedAt: now, isActive: true });
  state.log.push(`${name} вошёл в комнату`);
  trimLog(state);
  touch(state, now);
  return { rejoined: false };
}

export function startRound(state, actorId, now = Date.now(), rng = cryptoRandomInt) {
  assertHost(state, actorId);
  const players = activePlayers(state);
  if (players.length < MIN_PLAYERS) throw gameError('Нужно минимум 3 игрока', 'NOT_ENOUGH_PLAYERS');
  const category = getCategory(state.categoryId);
  if (!category?.words?.length) throw gameError('Категория пуста', 'EMPTY_CATEGORY');

  const word = drawUniqueWord(state, category.words, rng);
  const spy = chooseSpy(state, players, rng);
  const order = shuffle(players.map((player) => player.playerId), rng);

  state.roundNumber = Number(state.roundNumber || 0) + 1;
  state.status = 'drawing';
  state.wordId = word.id;
  state.spyPlayerId = spy.playerId;
  state.lastSpyPlayerId = spy.playerId;
  state.turnOrder = order;
  state.turnIndex = 0;
  state.turnDeadlineMs = now + DRAW_TURN_MS;
  state.strokes = [];
  state.earlyGuessUsed = false;
  state.guessReview = null;
  state.spyVotes = {};
  state.result = null;
  state.log = [`Раунд ${state.roundNumber} начался · ${category.title}`];
  touch(state, now);
  return { word, spy };
}

export function finishDrawingTurn(state, actorId, now = Date.now()) {
  assertStatus(state, 'drawing');
  if (currentDrawerId(state) !== actorId) throw gameError('Сейчас рисует другой игрок', 'NOT_YOUR_TURN');
  return advanceDrawingTurn(state, now, 'Игрок завершил рисунок');
}

export function passTimedOutTurn(state, now = Date.now()) {
  if (state.status !== 'drawing' || !state.turnDeadlineMs || state.turnDeadlineMs > now) return false;
  advanceDrawingTurn(state, now, 'Время рисования закончилось');
  return true;
}

function advanceDrawingTurn(state, now, logText) {
  const drawer = state.players.find((player) => player.playerId === currentDrawerId(state));
  if (drawer) state.log.push(`${drawer.name}: ${logText}`);
  state.turnIndex = Number(state.turnIndex || 0) + 1;
  if (state.turnIndex >= state.turnOrder.length) {
    startSpyVoting(state, now);
  } else {
    state.turnDeadlineMs = now + DRAW_TURN_MS;
    touch(state, now);
  }
  trimLog(state);
  return state.status;
}

export function commitStroke(state, actorId, rawStroke, now = Date.now()) {
  assertStatus(state, 'drawing');
  if (currentDrawerId(state) !== actorId) throw gameError('Рисовать может только игрок, чей сейчас ход', 'NOT_YOUR_TURN');
  if (state.strokes.length >= MAX_STROKES) throw gameError('На холсте слишком много линий', 'CANVAS_LIMIT');

  const stroke = sanitizeStroke(rawStroke, actorId, state.strokes.length + 1);
  state.strokes.push(stroke);
  touch(state, now);
  return stroke;
}

export function undoStroke(state, actorId, now = Date.now()) {
  assertStatus(state, 'drawing');
  if (currentDrawerId(state) !== actorId) throw gameError('Отменять линии можно только во время своего хода', 'NOT_YOUR_TURN');
  for (let index = state.strokes.length - 1; index >= 0; index -= 1) {
    if (state.strokes[index].playerId === actorId) {
      state.strokes.splice(index, 1);
      touch(state, now);
      return true;
    }
  }
  return false;
}

export function submitSpyGuess(state, actorId, text, now = Date.now()) {
  if (actorId !== state.spyPlayerId) throw gameError('Ответ может отправить только шпион', 'SPY_ONLY');
  const guess = sanitizeChat(text);
  if (!guess) throw gameError('Введите ответ', 'EMPTY_GUESS');
  const word = getWord(state.categoryId, state.wordId);
  if (!word) throw gameError('Секретное слово недоступно', 'WORD_MISSING');

  const isFinal = state.status === 'finalGuess';
  if (!isFinal && state.status !== 'drawing') throw gameError('Сейчас нельзя отправить ответ', 'BAD_PHASE');
  if (!isFinal && state.earlyGuessUsed) throw gameError('Досрочный ответ уже использован', 'GUESS_USED');

  if (!isFinal) state.earlyGuessUsed = true;
  const autoMatched = answerMatches(word, guess);
  if (autoMatched) {
    finishGame(state, 'spy', isFinal ? 'final_guess_auto' : 'early_guess_auto', now, guess);
    return { autoMatched: true, finished: true };
  }

  state.guessReview = {
    mode: isFinal ? 'final' : 'early',
    text: guess,
    normalized: normalizeAnswer(guess),
    votes: {},
    submittedAt: now,
    deadlineMs: now + ANSWER_REVIEW_MS,
    resumeTurnIndex: state.turnIndex,
  };
  state.status = 'answerReview';
  state.turnDeadlineMs = state.guessReview.deadlineMs;
  state.log.push(`Шпион отправил ответ: «${guess}» · приложение не нашло точного совпадения`);
  trimLog(state);
  touch(state, now);
  return { autoMatched: false, finished: false };
}

export function voteGuessReview(state, actorId, accept, now = Date.now()) {
  assertStatus(state, 'answerReview');
  if (actorId === state.spyPlayerId) throw gameError('Шпион не голосует за свой ответ', 'SPY_CANNOT_REVIEW');
  if (!getActivePlayer(state, actorId)) throw gameError('Игрок не найден', 'PLAYER_NOT_FOUND');
  state.guessReview.votes[actorId] = Boolean(accept);
  const resolution = resolveGuessReviewIfReady(state, now, false);
  if (!resolution) touch(state, now);
  return resolution;
}

function resolveGuessReviewIfReady(state, now, force) {
  const review = state.guessReview;
  if (!review) return null;
  const voters = activePlayers(state).filter((player) => player.playerId !== state.spyPlayerId);
  const values = voters.filter((player) => Object.hasOwn(review.votes, player.playerId)).map((player) => Boolean(review.votes[player.playerId]));
  const accepts = values.filter(Boolean).length;
  const rejects = values.length - accepts;
  const majority = Math.floor(voters.length / 2) + 1;

  if (accepts >= majority) {
    finishGame(state, 'spy', review.mode === 'final' ? 'final_guess_human' : 'early_guess_human', now, review.text);
    return 'accepted';
  }
  if (!force && rejects < majority && values.length < voters.length) return null;

  const mode = review.mode;
  const text = review.text;
  state.guessReview = null;
  if (mode === 'final') {
    finishGame(state, 'team', 'final_guess_rejected', now, text);
    return 'rejected';
  }

  state.status = 'drawing';
  state.turnDeadlineMs = now + DRAW_TURN_MS;
  state.log.push(`Ответ «${text}» не засчитан · рисование продолжается`);
  trimLog(state);
  touch(state, now);
  return 'rejected';
}

export function startSpyVoting(state, now = Date.now()) {
  state.status = 'voting';
  state.spyVotes = {};
  state.guessReview = null;
  state.turnDeadlineMs = now + SPY_VOTE_MS;
  state.log.push('Рисование закончено · выберите шпиона');
  trimLog(state);
  touch(state, now);
}

export function voteForSpy(state, actorId, targetId, now = Date.now()) {
  assertStatus(state, 'voting');
  const actor = getActivePlayer(state, actorId);
  const target = getActivePlayer(state, targetId);
  if (!actor || !target) throw gameError('Игрок недоступен', 'PLAYER_NOT_FOUND');
  if (actorId === targetId) throw gameError('Нельзя голосовать за себя', 'SELF_VOTE');
  state.spyVotes[actorId] = targetId;
  const allVoted = activePlayers(state).every((player) => Object.hasOwn(state.spyVotes, player.playerId));
  if (allVoted) resolveSpyVote(state, now);
  else touch(state, now);
}

function resolveSpyVote(state, now) {
  const tally = new Map();
  for (const targetId of Object.values(state.spyVotes || {})) {
    if (!getActivePlayer(state, targetId)) continue;
    tally.set(targetId, (tally.get(targetId) || 0) + 1);
  }
  const sorted = [...tally.entries()].sort((a, b) => b[1] - a[1]);
  const top = sorted[0];
  const tied = top && sorted.filter((entry) => entry[1] === top[1]).length > 1;
  if (!top || tied || top[0] !== state.spyPlayerId) {
    finishGame(state, 'spy', tied ? 'vote_tie' : 'spy_not_found', now, '');
    return;
  }
  state.status = 'finalGuess';
  state.turnDeadlineMs = now + FINAL_GUESS_MS;
  state.log.push('Шпион найден · у него последний шанс назвать ответ');
  trimLog(state);
  touch(state, now);
}

export function addChatMessage(state, actorId, text, now = Date.now()) {
  const player = getActivePlayer(state, actorId);
  if (!player) throw gameError('Игрок недоступен', 'PLAYER_NOT_FOUND');
  const message = sanitizeChat(text);
  if (!message) throw gameError('Сообщение пустое', 'EMPTY_CHAT');
  if (containsSecret(state, message)) throw gameError('Нельзя писать секретное слово в чат во время раунда', 'SECRET_IN_CHAT');
  state.chatSeq = Number(state.chatSeq || 0) + 1;
  const entry = { id: `${state.chatSeq}`, playerId: actorId, name: player.name, text: message, at: now };
  state.chat.push(entry);
  if (state.chat.length > MAX_CHAT) state.chat.splice(0, state.chat.length - MAX_CHAT);
  touch(state, now);
  return entry;
}

export function leaveRoom(state, actorId, now = Date.now()) {
  const player = state.players.find((entry) => entry.playerId === actorId);
  if (!player) return { deleted: false, changed: false };
  if (state.status === 'lobby') state.players = state.players.filter((entry) => entry.playerId !== actorId);
  else player.isActive = false;

  if (!activePlayers(state).length) return { deleted: true, changed: true };
  if (state.hostPlayerId === actorId || !getActivePlayer(state, state.hostPlayerId)) state.hostPlayerId = activePlayers(state)[0]?.playerId || null;

  if (state.status !== 'lobby') {
    if (actorId === state.spyPlayerId) {
      finishGame(state, 'team', 'spy_left', now, '');
    } else if (activePlayers(state).length < MIN_PLAYERS) {
      finishGame(state, 'spy', 'not_enough_players', now, '');
    } else if (state.status === 'drawing' && currentDrawerId(state) === actorId) {
      advanceDrawingTurn(state, now, 'Игрок вышел');
    } else if (state.status === 'answerReview') {
      resolveGuessReviewIfReady(state, now, true);
    } else if (state.status === 'voting') {
      const allVoted = activePlayers(state).every((entry) => Object.hasOwn(state.spyVotes, entry.playerId));
      if (allVoted) resolveSpyVote(state, now);
    }
  }
  state.log.push(`${player.name} вышел из комнаты`);
  trimLog(state);
  touch(state, now);
  return { deleted: false, changed: true };
}

export function restartRound(state, actorId, now = Date.now(), rng = cryptoRandomInt) {
  assertHost(state, actorId);
  return startRound(state, actorId, now, rng);
}

export function handleDeadline(state, now = Date.now()) {
  if (!state.turnDeadlineMs || state.turnDeadlineMs > now) return false;
  if (state.status === 'drawing') return passTimedOutTurn(state, now);
  if (state.status === 'answerReview') {
    resolveGuessReviewIfReady(state, now, true);
    return true;
  }
  if (state.status === 'voting') {
    resolveSpyVote(state, now);
    return true;
  }
  if (state.status === 'finalGuess') {
    finishGame(state, 'team', 'final_guess_timeout', now, '');
    return true;
  }
  return false;
}

export function buildView(state, playerId, connectedIds = new Set()) {
  const me = state.players.find((player) => player.playerId === playerId) || null;
  const word = getWord(state.categoryId, state.wordId);
  const category = CATEGORY_META[state.categoryId] || { id: state.categoryId, title: state.categoryId, icon: '✨' };
  const finished = state.status === 'finished';
  const isSpy = Boolean(me && me.playerId === state.spyPlayerId);
  const drawerId = currentDrawerId(state);
  const reviewVoters = state.guessReview ? activePlayers(state).filter((player) => player.playerId !== state.spyPlayerId) : [];
  const reviewVotes = state.guessReview ? Object.keys(state.guessReview.votes || {}).length : 0;

  return {
    roomId: state.roomId,
    version: state.version,
    status: state.status,
    category: { id: category.id, title: category.title, icon: category.icon, size: CATALOG[state.categoryId]?.length || 0 },
    hostPlayerId: state.hostPlayerId,
    roundNumber: state.roundNumber,
    usedWordsCount: state.usedWordIds.length,
    players: state.players.map((player) => ({
      playerId: player.playerId,
      name: player.name,
      isHost: player.playerId === state.hostPlayerId,
      isActive: player.isActive !== false,
      connected: connectedIds.has(player.playerId),
      isCurrentDrawer: player.playerId === drawerId,
      isSpy: finished ? player.playerId === state.spyPlayerId : undefined,
    })),
    me: me ? {
      playerId: me.playerId,
      name: me.name,
      isHost: me.playerId === state.hostPlayerId,
      role: state.roundNumber ? (isSpy ? 'spy' : 'artist') : null,
      canDraw: state.status === 'drawing' && drawerId === me.playerId,
      hasVotedSpy: Object.hasOwn(state.spyVotes || {}, me.playerId),
      earlyGuessUsed: isSpy ? Boolean(state.earlyGuessUsed) : undefined,
      secret: state.roundNumber && (!isSpy || finished) && word ? { label: word.label, ref: word.ref } : null,
    } : null,
    currentDrawerId: drawerId,
    currentDrawerName: state.players.find((player) => player.playerId === drawerId)?.name || '',
    turnDeadlineMs: state.turnDeadlineMs,
    turnIndex: state.turnIndex,
    turnCount: state.turnOrder.length,
    strokes: state.strokes.map((stroke) => ({ ...stroke, points: stroke.points.map((point) => [...point]) })),
    chat: state.chat.map((message) => ({ ...message })),
    guessReview: state.guessReview ? {
      mode: state.guessReview.mode,
      text: state.guessReview.text,
      deadlineMs: state.guessReview.deadlineMs,
      votesCount: reviewVotes,
      votersCount: reviewVoters.length,
      myVote: Object.hasOwn(state.guessReview.votes || {}, playerId) ? Boolean(state.guessReview.votes[playerId]) : null,
      canVote: playerId !== state.spyPlayerId && Boolean(getActivePlayer(state, playerId)),
    } : null,
    result: state.result ? {
      ...state.result,
      word: word ? { label: word.label, ref: word.ref } : null,
      spyPlayerId: state.spyPlayerId,
      spyName: state.players.find((player) => player.playerId === state.spyPlayerId)?.name || '',
    } : null,
    log: [...state.log],
  };
}

export function currentDrawerId(state) {
  if (state.status !== 'drawing') return null;
  return state.turnOrder[state.turnIndex] || null;
}

function drawUniqueWord(state, words, rng) {
  let available = words.filter((word) => !state.usedWordIds.includes(word.id));
  if (!available.length) {
    state.usedWordIds = [];
    available = [...words];
    if (available.length > 1 && state.lastWordId) available = available.filter((word) => word.id !== state.lastWordId);
  }
  const word = available[rng(available.length)];
  state.usedWordIds.push(word.id);
  state.lastWordId = word.id;
  return word;
}

function chooseSpy(state, players, rng) {
  let candidates = players;
  if (players.length > 2 && state.lastSpyPlayerId) {
    const withoutLast = players.filter((player) => player.playerId !== state.lastSpyPlayerId);
    if (withoutLast.length) candidates = withoutLast;
  }
  return candidates[rng(candidates.length)];
}

function sanitizeStroke(raw, actorId, sequence) {
  const points = Array.isArray(raw?.points) ? raw.points : [];
  if (points.length < 2 || points.length > 320) throw gameError('Некорректная линия', 'BAD_STROKE');
  const safePoints = points.map((point) => {
    if (!Array.isArray(point) || point.length < 2) throw gameError('Некорректные координаты', 'BAD_STROKE');
    const x = Math.max(0, Math.min(1, Number(point[0])));
    const y = Math.max(0, Math.min(1, Number(point[1])));
    if (!Number.isFinite(x) || !Number.isFinite(y)) throw gameError('Некорректные координаты', 'BAD_STROKE');
    return [Math.round(x * 10_000) / 10_000, Math.round(y * 10_000) / 10_000];
  });
  const colors = new Set(['#111827', '#4f46e5', '#0284c7', '#059669', '#d97706', '#dc2626', '#9333ea']);
  const mode = raw?.mode === 'erase' ? 'erase' : 'draw';
  const color = colors.has(String(raw?.color || '').toLowerCase()) ? String(raw.color).toLowerCase() : '#111827';
  const width = Math.max(2, Math.min(28, Number(raw?.width || 5)));
  return { id: `${sequence}`, playerId: actorId, mode, color, width, points: safePoints };
}

function containsSecret(state, text) {
  if (!state.wordId || state.status === 'lobby' || state.status === 'finished') return false;
  const word = getWord(state.categoryId, state.wordId);
  if (!word) return false;
  const haystack = ` ${normalizeAnswer(text)} `;
  return [word.label, ...(word.aliases || [])]
    .map(normalizeAnswer)
    .filter((candidate) => candidate.length >= 4)
    .some((candidate) => haystack.includes(` ${candidate} `) || haystack.trim() === candidate);
}

function finishGame(state, winner, reason, now, guessText) {
  state.status = 'finished';
  state.turnDeadlineMs = 0;
  state.guessReview = null;
  state.result = { winner, reason, guessText: sanitizeChat(guessText), finishedAt: now };
  state.log.push(winner === 'spy' ? 'Шпион победил' : 'Команда художников победила');
  trimLog(state);
  touch(state, now);
}

function activePlayers(state) {
  return state.players.filter((player) => player.isActive !== false);
}

function getActivePlayer(state, playerId) {
  return state.players.find((player) => player.playerId === playerId && player.isActive !== false) || null;
}

function assertHost(state, actorId) {
  if (state.hostPlayerId !== actorId) throw gameError('Только создатель комнаты может начать раунд', 'HOST_ONLY');
}

function assertStatus(state, status) {
  if (state.status !== status) throw gameError('Действие сейчас недоступно', 'BAD_PHASE');
}

function touch(state, now = Date.now()) {
  state.version = Number(state.version || 0) + 1;
  state.updatedAt = now;
}

function trimLog(state) {
  if (state.log.length > 30) state.log.splice(0, state.log.length - 30);
}

function shuffle(items, rng) {
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = rng(i + 1);
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

function cryptoRandomInt(max) {
  if (!Number.isFinite(max) || max <= 1) return 0;
  const limit = Math.floor(0x1_0000_0000 / max) * max;
  const array = new Uint32Array(1);
  do crypto.getRandomValues(array); while (array[0] >= limit);
  return array[0] % max;
}

function gameError(message, code) {
  return Object.assign(new Error(message), { code });
}
