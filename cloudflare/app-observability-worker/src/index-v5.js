import baseWorker, { AppStats as BaseAppStats } from './index-v4.js';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS' && url.pathname === '/admin/live') {
      return new Response(null, { status: 204, headers: corsHeaders(request, env) });
    }
    if (request.method !== 'GET' || url.pathname !== '/admin/live') {
      return baseWorker.fetch(request, env, ctx);
    }

    const cors = corsHeaders(request, env);
    try {
      if (!isAllowedOrigin(request, env)) throw httpError(403, 'Origin not allowed');
      const initData = String(url.searchParams.get('initData') || '');
      if (!initData) throw httpError(401, 'Telegram session required');

      const verified = await env.APP_CORE.fetch('https://core.internal/admin/verify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: request.headers.get('Origin') || 'https://vidalost.github.io',
        },
        body: JSON.stringify({ telegramInitData: initData }),
      });
      const auth = await verified.json().catch(() => ({}));
      if (!verified.ok || auth?.admin !== true) throw httpError(403, auth?.error || 'Admin only');

      const stub = env.STATS.get(env.STATS.idFromName('global'));
      const response = await stub.fetch('https://stats.internal/live-snapshot');
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data?.ok === false) throw httpError(response.status || 500, data?.error || 'Live stats unavailable');
      return json(data, 200, cors);
    } catch (error) {
      return json({ ok: false, error: String(error?.message || error) }, Number(error?.status || 500), cors);
    }
  },
};

export class AppStats extends BaseAppStats {
  async fetch(request) {
    const url = new URL(request.url);
    if (request.method === 'GET' && url.pathname === '/live-snapshot') {
      return json({ ok: true, ...this.liveSnapshot(), generatedAt: Date.now() });
    }
    return super.fetch(request);
  }
}

function allowedOrigins(env) {
  return String(env.ALLOWED_ORIGINS || 'https://vidalost.github.io').split(',').map((item) => item.trim()).filter(Boolean);
}
function isAllowedOrigin(request, env) { return allowedOrigins(env).includes(request.headers.get('Origin') || ''); }
function corsHeaders(request, env) {
  const origin = request.headers.get('Origin') || '';
  const allowed = allowedOrigins(env);
  return {
    'Access-Control-Allow-Origin': allowed.includes(origin) ? origin : allowed[0] || 'https://vidalost.github.io',
    'Access-Control-Allow-Methods': 'GET,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}
function json(value, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...extraHeaders },
  });
}
function httpError(status, message) { const error = new Error(message); error.status = status; return error; }
