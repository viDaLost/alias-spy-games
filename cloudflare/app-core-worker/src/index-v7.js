import coreV6, { UserStore } from './index-v6.js';

export { UserStore };

const BOT_PROFILE_TTL_MS = 60 * 60 * 1000;
let cachedBotProfile = null;
let cachedBotProfileAt = 0;

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if ((request.method === 'GET' || request.method === 'HEAD') && url.pathname === '/telegram/miniapp-config') {
      return handleMiniAppConfig(request, env, ctx);
    }
    return coreV6.fetch(request, env, ctx);
  },

  async scheduled(controller, env, ctx) {
    if (typeof coreV6.scheduled === 'function') {
      return coreV6.scheduled(controller, env, ctx);
    }
  },
};

async function handleMiniAppConfig(request, env, ctx) {
  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'public, max-age=300, s-maxage=3600',
  };

  if (request.method === 'HEAD') return new Response(null, { status: 204, headers });

  try {
    const profile = await getBotProfile(env);
    const payload = {
      ok: true,
      botUsername: profile.username,
      botId: profile.id,
      supportsMainMiniAppLink: true,
    };
    const response = new Response(JSON.stringify(payload), { status: 200, headers });
    ctx?.waitUntil?.(Promise.resolve());
    return response;
  } catch (error) {
    return new Response(JSON.stringify({
      ok: false,
      error: String(error?.message || 'Telegram bot profile unavailable'),
    }), { status: 503, headers: { ...headers, 'Cache-Control': 'no-store' } });
  }
}

async function getBotProfile(env) {
  const now = Date.now();
  if (cachedBotProfile && now - cachedBotProfileAt < BOT_PROFILE_TTL_MS) return cachedBotProfile;

  const token = String(env.TELEGRAM_BOT_TOKEN || '').trim();
  if (!token) throw new Error('Telegram bot token is not configured');

  const response = await fetch(`https://api.telegram.org/bot${token}/getMe`, {
    method: 'GET',
    headers: { Accept: 'application/json' },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data?.ok !== true || !data?.result?.username) {
    throw new Error(String(data?.description || `Telegram getMe HTTP ${response.status}`));
  }

  cachedBotProfile = {
    id: String(data.result.id || ''),
    username: String(data.result.username || '').replace(/^@+/, ''),
  };
  cachedBotProfileAt = now;
  return cachedBotProfile;
}
