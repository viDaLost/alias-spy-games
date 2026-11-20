import quartetWorker, { QuartetRoom as BaseQuartetRoom } from './index-chat.js';
import { hideInactiveLobbyPlayers, leaveLobbyForResume, restoreLobbyHost } from './lobby-resume.js';

export default quartetWorker;

export class QuartetRoom extends BaseQuartetRoom {
  async fetch(request) {
    const url = new URL(request.url);
    let joiningPlayerId = '';

    if (request.method === 'POST' && url.pathname === '/join') {
      try {
        const body = await request.clone().json();
        joiningPlayerId = String(body?.player?.playerId || '');
      } catch {}
    }

    const response = await super.fetch(request);
    let freshJoinState = null;

    if (
      joiningPlayerId &&
      response.ok &&
      this.room?.status === 'lobby' &&
      restoreLobbyHost(this.room, joiningPlayerId)
    ) {
      await this.ctx.storage.put('room', this.room);
      await this.broadcastState();
      freshJoinState = this.buildClientView(joiningPlayerId);
    }

    return rewriteJsonState(response, (state) => {
      if (freshJoinState) return freshJoinState;
      return hideInactiveLobbyPlayers(state);
    });
  }

  async applyAction(playerId, action, data, now) {
    if (action === 'leave' && this.room?.status === 'lobby') {
      const result = leaveLobbyForResume(this.room, playerId, now);
      this.pollingPresence.delete(playerId);
      this.pollingRateLimits.delete(playerId);
      this.pollingActionIds.delete(playerId);
      if (result.changed) await this.persistAndBroadcast();
      return { deleted: false };
    }
    return super.applyAction(playerId, action, data, now);
  }

  buildClientView(playerId, connected = this.connectedPlayerIds()) {
    return hideInactiveLobbyPlayers(super.buildClientView(playerId, connected));
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
