import test from 'node:test';
import assert from 'node:assert/strict';
import { createRoomState, joinRoom } from '../src/engine.js';
import { hideInactiveLobbyPlayers, leaveLobbyForResume, restoreLobbyHost } from '../src/lobby-resume.js';

const player = (id, name = id) => ({ playerId: id, name });

test('last player leaving lobby does not delete membership and can rejoin', () => {
  const room = createRoomState('ABC123', player('p1', 'Анна'), 1);
  const result = leaveLobbyForResume(room, 'p1', 2);
  assert.equal(result.handled, true);
  assert.equal(result.changed, true);
  assert.equal(room.players.length, 1);
  assert.equal(room.players[0].isActive, false);
  assert.equal(room.status, 'lobby');

  joinRoom(room, player('p1', 'Анна'), 3);
  restoreLobbyHost(room, 'p1', 4);
  assert.equal(room.players[0].isActive, true);
  assert.equal(room.hostPlayerId, 'p1');
});

test('host moves to an active player and first returning player can recover an empty lobby', () => {
  const room = createRoomState('ABC123', player('p1'), 1);
  joinRoom(room, player('p2'), 2);

  leaveLobbyForResume(room, 'p1', 3);
  assert.equal(room.hostPlayerId, 'p2');
  leaveLobbyForResume(room, 'p2', 4);
  assert.equal(room.players.filter((entry) => entry.isActive !== false).length, 0);

  joinRoom(room, player('p1'), 5);
  assert.equal(restoreLobbyHost(room, 'p1', 6), true);
  assert.equal(room.hostPlayerId, 'p1');
});

test('inactive lobby members stay in server state but are hidden from client lobby list', () => {
  const view = {
    status: 'lobby',
    players: [
      { playerId: 'p1', isActive: true },
      { playerId: 'p2', isActive: false },
    ],
  };
  hideInactiveLobbyPlayers(view);
  assert.deepEqual(view.players.map((entry) => entry.playerId), ['p1']);
});
