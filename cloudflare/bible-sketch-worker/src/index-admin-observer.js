import baseWorker, { BibleSketchRoom as BaseBibleSketchRoom } from './index-drawing-cycles.js';
import { buildView } from './engine.js';
import { hideInactiveLobbyPlayers } from './lobby-resume.js';
import { withDrawingCycleMeta } from './drawing-cycles.js';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const match = url.pathname.match(/^\/admin\/rooms\/([A-Z0-9]{4,10})\/state$/i);
    if (!match) return baseWorker.fetch(request, env, ctx);
    const cors = corsHeaders(request, env);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (request.method !== 'GET') return json({ ok: false, error: 'Not found' }, 404, cors);

    try {
      if (!isAllowedOrigin(request, env)) throw httpError(403, 'Origin not allowed');
      const initData = String(url.searchParams.get('initData') || '');
      await verifyAdminWithCore(env, initData);
      const roomId = normalizeRoomId(match[1]);
      const stub = env.ROOMS.get(env.ROOMS.idFromName(roomId));
      const response = await stub.fetch('https://bible-sketch.internal/admin-state');
      const payload = await response.json().catch(() => ({}));
      return json(payload, response.status, cors);
    } catch (error) {
      return json({ ok: false, error: String(error?.message || error) }, Number(error?.status || 500), cors);
    }
  },
};

export class BibleSketchRoom extends BaseBibleSketchRoom {
  async fetch(request) {
    const url = new URL(request.url);
    if (request.method === 'GET' && url.pathname === '/admin-state') {
      if (!this.room) return json({ ok: false, error: 'Комната не найдена' }, 404);
      const base = hideInactiveLobbyPlayers(buildView(this.room, '', this.connectedPlayerIds()));
      const view = withDrawingCycleMeta(base, this.room);
      return json({
        ok: true,
        observer: true,
        roomId: view.roomId,
        status: view.status,
        version: view.version,
        category: view.category,
        roundNumber: view.roundNumber,
        drawingCycle: view.drawingCycle,
        drawingCycles: view.drawingCycles,
        players: view.players,
        currentDrawerId: view.currentDrawerId,
        currentDrawerName: view.currentDrawerName,
        turnDeadlineMs: view.turnDeadlineMs,
        turnIndex: view.turnIndex,
        turnCount: view.turnCount,
        totalDrawingTurns: view.totalDrawingTurns,
        strokeCount: Array.isArray(view.strokes) ? view.strokes.length : 0,
        guessReview: view.guessReview ? {
          mode: view.guessReview.mode,
          votesCount: view.guessReview.votesCount,
          votersCount: view.guessReview.votersCount,
        } : null,
        result: view.result,
        log: Array.isArray(view.log) ? view.log.slice(-30) : [],
        updatedAt: Number(this.room.updatedAt || 0),
      });
    }
    return super.fetch(request);
  }
}

async function verifyAdminWithCore(env, initData) {
  if (!initData) throw httpError(401, 'Telegram session required');
  const response = await env.APP_CORE.fetch('https://core.internal/admin/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'https://vidalost.github.io' },
    body: JSON.stringify({ telegramInitData: initData }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data?.admin !== true) throw httpError(response.status || 403, data?.error || 'Admin only');
}
function normalizeRoomId(value) { return String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10); }
function allowedOrigins(env) { return String(env.ALLOWED_ORIGINS || 'https://vidalost.github.io').split(',').map((item) => item.trim()).filter(Boolean); }
function isAllowedOrigin(request, env) { return allowedOrigins(env).includes(request.headers.get('Origin') || ''); }
function corsHeaders(request, env) { const origin = request.headers.get('Origin') || ''; const allowed = allowedOrigins(env); return { 'Access-Control-Allow-Origin': allowed.includes(origin) ? origin : allowed[0] || 'https://vidalost.github.io', 'Access-Control-Allow-Methods': 'GET,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', Vary: 'Origin' }; }
function json(value, status = 200, extra = {}) { return new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...extra } }); }
function httpError(status, message) { const error = new Error(message); error.status = status; return error; }
