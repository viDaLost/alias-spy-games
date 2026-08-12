import observability, { AppStats as BaseAppStats } from './index-v2.js';

export class AppStats extends BaseAppStats {}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname !== '/presence' || request.method !== 'GET') {
      return observability.fetch(request, env, ctx);
    }

    const origin = request.headers.get('Origin') || '';
    if (!allowedOrigins(env).includes(origin)) return jsonError('Origin not allowed', 403, origin, env);
    if ((request.headers.get('Upgrade') || '').toLowerCase() !== 'websocket') return jsonError('WebSocket required', 426, origin, env);

    const sid = sanitizeSessionId(url.searchParams.get('sid'));
    if (!sid) return jsonError('Session id required', 400, origin, env);
    const authorization = String(request.headers.get('Authorization') || '');
    if (!/^Bearer\s+bgs_[A-Za-z0-9_-]{40,80}$/i.test(authorization)) {
      return jsonError('Verified Android session required', 401, origin, env);
    }

    const coreUrl = String(env.CORE_WORKER_URL || 'https://alias-spy-games-core.vitaledanilov.workers.dev').replace(/\/$/, '');
    let identity = {};
    try {
      const response = await fetch(`${coreUrl}/android/auth/me`, {
        headers: { Accept: 'application/json', Authorization: authorization },
      });
      identity = await response.json().catch(() => ({}));
      if (!response.ok || identity?.success !== true || identity?.isBanned === true) {
        return jsonError(identity?.isBanned ? 'Access restricted' : 'Android session invalid', identity?.isBanned ? 403 : 401, origin, env);
      }
    } catch {
      return jsonError('Identity service unavailable', 503, origin, env);
    }

    const androidUserId = String(identity.userId || '');
    if (!/^\d{5,20}$/.test(androidUserId)) return jsonError('Android session invalid', 401, origin, env);

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
