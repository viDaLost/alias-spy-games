import bibleSketchWorker, { BibleSketchRoom as BaseBibleSketchRoom } from './index-lobby-resume.js';
import { buildView, leaveRoom } from './engine.js';
import { hideInactiveLobbyPlayers } from './lobby-resume.js';
import {
  DRAW_TURN_MS,
  beginNextDrawingCycle,
  ensureDrawingCycle,
  isLastTurnOfDrawingCycle,
  withDrawingCycleMeta,
} from './drawing-cycles.js';

export default bibleSketchWorker;

export class BibleSketchRoom extends BaseBibleSketchRoom {
  async fetch(request) {
    const response = await super.fetch(request);
    return rewriteJsonState(response, (view) => withDrawingCycleMeta(view, this.room));
  }

  async applyAction(playerId, action, data, now) {
    if (!this.room) return super.applyAction(playerId, action, data, now);

    ensureDrawingCycle(this.room);

    if (action === 'startRound' || action === 'restartRound') {
      this.room.drawingCycle = 1;
      return super.applyAction(playerId, action, data, now);
    }

    if (action === 'finishTurn' && isLastTurnOfDrawingCycle(this.room, playerId)) {
      const drawer = this.room.players?.find((player) => player.playerId === playerId);
      if (drawer) {
        if (!Array.isArray(this.room.log)) this.room.log = [];
        this.room.log.push(`${drawer.name}: Игрок завершил рисунок`);
      }
      beginNextDrawingCycle(this.room, now);
      await this.persistAndBroadcast();
      return { deleted: false };
    }

    if (action === 'leave' && this.room.status !== 'lobby') {
      const wasLastTurnOfFirstCycle = isLastTurnOfDrawingCycle(this.room, playerId);
      const result = leaveRoom(this.room, playerId, now);
      this.pollingPresence.delete(playerId);
      this.pollingRateLimits.delete(playerId);
      this.pollingActionIds.delete(playerId);

      if (result.deleted) {
        await this.ctx.storage.deleteAll();
        this.room = null;
        this.closeAllSockets(1000, 'Room closed');
        return { deleted: true };
      }

      if (wasLastTurnOfFirstCycle && this.room?.status === 'voting') {
        const lastLine = this.room.log?.[this.room.log.length - 1] || '';
        if (lastLine === 'Рисование закончено · выберите шпиона') this.room.log.pop();
        beginNextDrawingCycle(this.room, now, 'после выхода игрока');
      }

      await this.persistAndBroadcast();
      return { deleted: false };
    }

    return super.applyAction(playerId, action, data, now);
  }

  async alarm() {
    if (!this.room) return;
    ensureDrawingCycle(this.room);
    const now = Date.now();
    const expired = this.room.status === 'drawing' && Number(this.room.turnDeadlineMs || 0) > 0 && Number(this.room.turnDeadlineMs) <= now;

    if (expired && isLastTurnOfDrawingCycle(this.room)) {
      const drawerId = this.room.turnOrder?.[this.room.turnIndex] || '';
      const drawer = this.room.players?.find((player) => player.playerId === drawerId);
      if (drawer) {
        if (!Array.isArray(this.room.log)) this.room.log = [];
        this.room.log.push(`${drawer.name}: Время рисования закончилось`);
      }
      beginNextDrawingCycle(this.room, now);
      await this.persistAndBroadcast();
      return;
    }

    return super.alarm();
  }

  async broadcastState() {
    if (!this.room) return;
    ensureDrawingCycle(this.room);
    const connected = this.connectedPlayerIds();
    for (const socket of this.ctx.getWebSockets()) {
      const attachment = socket.deserializeAttachment() || {};
      const playerId = String(attachment.playerId || '');
      try {
        const base = hideInactiveLobbyPlayers(buildView(this.room, playerId, connected));
        const state = withDrawingCycleMeta(base, this.room);
        socket.send(JSON.stringify({ type: 'state', state }));
      } catch (error) {
        console.warn('bible sketch socket send failed', error);
      }
    }
  }
}

async function rewriteJsonState(response, transformState) {
  if (!response || response.status === 101) return response;
  const contentType = response.headers.get('Content-Type') || '';
  if (!contentType.includes('application/json')) return response;

  let payload;
  try { payload = await response.clone().json(); } catch { return response; }
  if (payload?.state) payload.state = transformState(payload.state);

  return new Response(JSON.stringify(payload), {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}
