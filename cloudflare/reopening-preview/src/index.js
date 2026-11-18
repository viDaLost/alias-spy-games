import quartetWorker, { QuartetRoom as LobbyRoom } from '../../quartet-worker/src/index-lobby-resume.js';

const guestAccess = {
  async check(initData) { return { allowed: initData === '' }; },
  async authenticate() { return { allowed: false }; },
};

export class QuartetRoom extends LobbyRoom {
  constructor(ctx, env) {
    super(ctx, { ...env, APP_ACCESS: guestAccess });
  }
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === '/health') {
      return Response.json({ ok: true, service: 'alias-spy-games-reopening-preview' });
    }
    if (url.pathname === '/rooms' || url.pathname.startsWith('/rooms/')) {
      const origin = request.headers.get('Origin');
      if (origin && origin !== url.origin) return new Response('Forbidden', { status: 403 });
      return quartetWorker.fetch(request, {
        ...env,
        ALLOW_GUESTS: 'true',
        ALLOWED_ORIGINS: url.origin,
        APP_ACCESS: guestAccess,
      }, ctx);
    }
    return env.PREVIEW_ASSETS.fetch(request);
  },
};
