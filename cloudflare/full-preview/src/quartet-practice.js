import { CARD_TO_QUARTET } from '../../quartet-worker/src/catalog.js';
import { askCard, buildView, createRoomState, joinRoom, setDeckSize, startGame } from '../../quartet-worker/src/engine.js';

function chooseRequest(bot, players, memory) {
  const hand = new Set(bot.hand);
  const quartets = new Set(bot.hand.map((id) => CARD_TO_QUARTET.get(id)));
  const opponents = players.filter((player) => player !== bot && player.hand.length > 0);
  let best;
  for (const quartet of quartets) {
    const owned = quartet.cards.filter((card) => hand.has(card.id)).length;
    for (const card of quartet.cards) {
      if (hand.has(card.id)) continue;
      const knowledge = memory.get(card.id);
      const possible = opponents.filter(({ playerId }) => knowledge instanceof Set
        ? !knowledge.has(playerId) : !knowledge || knowledge === playerId);
      for (const { playerId: targetId } of possible) {
        const score = (possible.length === 1 ? 5 : 0) + owned + Math.random();
        if (!best || score > best.score) best = { targetId, cardId: card.id, score };
      }
    }
  }
  return best;
}

function create(playerName, onState) {
  const human = { playerId: 'practice-player', name: playerName };
  const bots = [
    { playerId: 'practice-miriam', name: 'Мириам' },
    { playerId: 'practice-samuel', name: 'Самуил' },
  ];
  const state = createRoomState('', human);
  for (const bot of bots) joinRoom(state, bot);
  setDeckSize(state, human.playerId, 12);

  const connected = new Set(state.players.map(({ playerId }) => playerId));
  const memory = new Map();
  let timer;

  function publish() {
    state.turnDeadlineMs = 0;
    const view = buildView(state, human.playerId, connected);
    onState({ ...view, practice: true });
    scheduleBot();
  }

  function request(actorId, { targetId, cardId }) {
    const event = askCard(state, actorId, targetId, cardId);
    // These are the same results visible to everyone in the move history.
    if (event.type === 'ask_success') memory.set(cardId, actorId);
    else {
      const known = memory.get(cardId);
      const misses = known instanceof Set ? known : new Set();
      misses.add(actorId);
      misses.add(targetId);
      memory.set(cardId, misses);
    }
    publish();
  }

  function scheduleBot() {
    clearTimeout(timer);
    if (state.status !== 'playing' || state.turnPlayerId === human.playerId) return;
    timer = setTimeout(() => {
      const bot = state.players.find(({ playerId }) => playerId === state.turnPlayerId);
      const move = chooseRequest(bot, state.players, memory);
      request(bot.playerId, move);
    }, 720 + Math.random() * 230);
  }

  return {
    act(action, payload = {}) {
      if (action === 'askCard') return request(human.playerId, payload);
      if (action === 'setDeckSize') setDeckSize(state, human.playerId, payload.count);
      if (action === 'startGame' || action === 'restartGame') {
        startGame(state, human.playerId);
        memory.clear();
      }
      publish();
    },
    stop() { clearTimeout(timer); },
  };
}

window.QuartetPractice = Object.freeze({ create });
