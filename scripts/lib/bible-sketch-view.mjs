// Собирает настоящий вид комнаты «Библейского художника» для проверок.
//
// Вид берётся из самого движка, а не пишется руками: поля меняются вместе с
// игрой, и выдуманный слепок устарел бы молча, оставив проверку зелёной на
// сломанном экране.

import {
  buildView,
  createRoomState,
  joinRoom,
  startRound,
} from '../../cloudflare/bible-sketch-worker/src/engine.js';

/**
 * @param {object} options
 * @param {number} [options.players]  сколько игроков в комнате
 * @param {boolean} [options.drawing] выдать ход рисующему p1
 * @param {number} [options.strokes]  сколько штрихов уже нарисовано
 */
export function sketchView({ players = 4, drawing = true, strokes = 0 } = {}) {
  const now = Date.now();
  const room = createRoomState('TEST12', { playerId: 'p1', name: 'Хозяин' }, 'objects', now);
  for (let i = 2; i <= players; i += 1) joinRoom(room, { playerId: `p${i}`, name: `Игрок ${i}` }, now);
  if (drawing) {
    startRound(room, 'p1', now);
    // Рисующим делаем того, чьими глазами смотрит проверка: экран рисующего —
    // тот самый, где живут кисти, цвета и холст.
    room.turnOrder = ['p1', ...room.turnOrder.filter((id) => id !== 'p1')];
    room.turnIndex = 0;
    room.spyPlayerId = room.spyPlayerId === 'p1' ? 'p2' : room.spyPlayerId;
    for (let i = 0; i < strokes; i += 1) {
      room.strokes.push({
        strokeId: `s${i}`,
        playerId: 'p1',
        color: '#111827',
        width: 6,
        mode: 'draw',
        points: [[0.1 + i * 0.02, 0.2], [0.5, 0.5 + i * 0.01], [0.8, 0.3]],
      });
    }
  }
  return buildView(room, 'p1', new Set(room.players.map((player) => player.playerId)));
}
