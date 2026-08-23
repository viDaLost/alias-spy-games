import baseV6, { AppStats as BaseAppStats } from './index-v6.js';

// Navigation changes are pushed immediately. This wider stale window only
// protects the low-frequency safety heartbeat from normal mobile timer jitter.
const PRESENCE_STALE_MS = 75_000;
const ROOM_GAMES = new Set(['quartet', 'bible-sketch']);

export default baseV6;

export class AppStats extends BaseAppStats {
  liveSnapshot() {
    const now = Date.now();
    const freshestByUser = new Map();
    let connectionCount = 0;

    for (const socket of this.ctx.getWebSockets()) {
      const attachment = normalizeAttachment(socket.deserializeAttachment() || {});
      if (!attachment.userId) continue;
      connectionCount += 1;
      if (attachment.visible === false) continue;

      const updatedAt = Number(attachment.updatedAt || 0);
      if (!updatedAt || now - updatedAt > PRESENCE_STALE_MS) {
        try { socket.close(1001, 'stale presence'); } catch {}
        continue;
      }

      const previous = freshestByUser.get(attachment.userId);
      if (!previous || updatedAt >= Number(previous.updatedAt || 0)) {
        freshestByUser.set(attachment.userId, attachment);
      }
    }

    const currentGames = {};
    const activeRooms = {
      quartet: new Set(),
      'bible-sketch': new Set(),
    };
    let menuNow = 0;

    const onlineUsers = [...freshestByUser.values()]
      .map((session) => {
        const game = sanitizeGame(session.game);
        const roomId = ROOM_GAMES.has(game) ? sanitizeRoomId(session.roomId) : '';
        if (game) currentGames[game] = Number(currentGames[game] || 0) + 1;
        else menuNow += 1;
        if (roomId && activeRooms[game]) activeRooms[game].add(roomId);

        return {
          id: sanitizeUserId(session.userId),
          username: sanitizeUsername(session.username),
          displayName: sanitizeDisplayName(session.displayName),
          platform: sanitizePlatform(session.platform),
          game,
          roomId,
          updatedAt: Number(session.updatedAt || 0),
        };
      })
      .sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0));

    const activeRoomsByGame = {
      quartet: activeRooms.quartet.size,
      'bible-sketch': activeRooms['bible-sketch'].size,
    };

    return {
      onlineNow: onlineUsers.length,
      connectionCount,
      menuNow,
      currentGames,
      onlineUsers,
      activeRoomsByGame,
      activeRoomsNow: activeRoomsByGame.quartet + activeRoomsByGame['bible-sketch'],
      activeQuartetRooms: activeRoomsByGame.quartet,
      activeBibleSketchRooms: activeRoomsByGame['bible-sketch'],
      strictPresenceWindowMs: PRESENCE_STALE_MS,
    };
  }
}

function normalizeAttachment(value = {}) {
  return {
    sid: sanitizeSessionId(value.sid),
    userId: sanitizeUserId(value.userId),
    username: sanitizeUsername(value.username),
    displayName: sanitizeDisplayName(value.displayName),
    platform: sanitizePlatform(value.platform),
    game: sanitizeGame(value.game),
    roomId: sanitizeRoomId(value.roomId),
    visible: value.visible !== false,
    updatedAt: Number(value.updatedAt || 0),
  };
}
function sanitizeSessionId(value) { return String(value || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64); }
function sanitizeGame(value) { return String(value || '').toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 40); }
function sanitizeRoomId(value) { return String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10); }
function sanitizeUserId(value) { return String(value || '').replace(/\D/g, '').slice(0, 24); }
function sanitizeUsername(value) { return String(value || '').trim().replace(/^@+/, '').replace(/[^a-zA-Z0-9_]/g, '').slice(0, 64); }
function sanitizeDisplayName(value) { return String(value || '').replace(/[<>\r\n\t]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80); }
function sanitizePlatform(value) {
  const platform = String(value || '').toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 24);
  return platform === 'android' ? 'android' : 'telegram';
}
