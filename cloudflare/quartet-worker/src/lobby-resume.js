export function leaveLobbyForResume(room, playerId, now = Date.now()) {
  if (!room || room.status !== 'lobby') return { handled: false, changed: false };
  const player = room.players?.find((entry) => entry.playerId === playerId);
  if (!player) return { handled: true, changed: false };
  if (player.isActive === false) return { handled: true, changed: false };

  player.isActive = false;
  player.leftAt = now;

  const active = room.players.filter((entry) => entry.isActive !== false);
  if (room.hostPlayerId === playerId && active.length) {
    room.hostPlayerId = active[0].playerId;
  }

  room.log = Array.isArray(room.log) ? room.log : [];
  room.log.push(`${player.name || 'Игрок'} вышел из лобби · можно вернуться по тому же коду`);
  if (room.log.length > 60) room.log = room.log.slice(-60);
  room.lastEvent = {
    id: `${now}_${Math.random().toString(36).slice(2, 8)}`,
    type: 'player_left',
    at: now,
    playerId,
    playerName: player.name || 'Игрок',
    resumable: true,
  };
  touch(room, now);
  return { handled: true, changed: true };
}

export function restoreLobbyHost(room, playerId, now = Date.now()) {
  if (!room || room.status !== 'lobby' || !playerId) return false;
  const joining = room.players?.find((entry) => entry.playerId === playerId && entry.isActive !== false);
  if (!joining) return false;

  const activeHost = room.players.find(
    (entry) => entry.playerId === room.hostPlayerId && entry.isActive !== false,
  );
  if (activeHost) return false;

  room.hostPlayerId = joining.playerId;
  touch(room, now);
  return true;
}

export function hideInactiveLobbyPlayers(view) {
  if (!view || view.status !== 'lobby' || !Array.isArray(view.players)) return view;
  view.players = view.players.filter((player) => player.isActive !== false);
  return view;
}

function touch(room, now) {
  room.version = Number(room.version || 0) + 1;
  room.updatedAt = now;
}
