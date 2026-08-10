import observability, { AppStats as BaseAppStats } from './index-v2.js';

export class AppStats extends BaseAppStats {}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const androidUserId = String(url.searchParams.get('androidUserId') || '').trim();
    if (url.pathname !== '/presence' || request.method !== 'GET' || !androidUserId) {
      return observability.fetch(request, env, ctx);
    }

    const origin = request.headers.get('Origin') || '';
    if (!allowedOrigins(env).includes(origin)) return jsonError('Origin not allowed', 403, origin, env);
    if ((request.headers.get('Upgrade') || '').toLowerCase() !== 'websocket') return jsonError('WebSocket required', 426, origin, env);
    if (!/^\d{5,20}$/.test(androidUserId)) return jsonError('Bad Android user id', 400, origin, env);

    const sid = sanitizeSessionId(url.searchParams.get('sid'));
    if (!sid) return jsonError('Session id required', 400, origin, env);

    const headers = new Headers(request.headers);
    headers.set('X-App-Session-Id', sid);
    headers.set('X-App-User-Id', androidUserId);
    headers.set('X-App-Display-Name', `Android · ID ${androidUserId}`);

    const stub = env.STATS.get(env.STATS.idFromName('global'));
    return stub.fetch(new Request('https://stats.internal/presence', { method: 'GET', headers }));
  },
};

function sanitizeSessionId(value) {
  return String(value || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64);
}
function allowedOrigins(env) {
  return String(env.ALLOWED_ORIGINS || 'https://vidalost.github.io').split(',').map((item) => item.trim()).filter(Boolean);
}
function corsOrigin(origin, env) {
  const allowed = allowedOrigins(env);
  return allowed.includes(origin) ? origin : (allowed[0] || 'https://vidalost.github.io');
}
function jsonError(message, status, origin, env) {
  return new Response(JSON.stringify({ ok: false, error: message }), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': corsOrigin(origin, env),
      Vary: 'Origin',
    },
  });
}
