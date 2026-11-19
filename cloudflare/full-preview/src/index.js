import quartet, { QuartetRoom } from '../../reopening-preview/src/index.js';
import sketch, { BibleSketchRoom as SketchRoom } from '../../bible-sketch-worker/src/index-lobby-resume.js';
import spy, { SpyRoom as BaseSpyRoom } from '../../spy-worker/src/index.js';
import tribes, { TwelveTribesRoom as TribesRoom } from '../../twelve-tribes-worker/src/index.js';
import land, { PromisedLandRoom as LandRoom } from '../../promised-land-preview/src/index.js';

const guestAccess = Object.freeze({
  async check(id) { return { allowed: id === '' }; },
  async authenticate() { return { allowed: false }; },
});

function roomEnv(env) {
  return { ...env, APP_ACCESS: guestAccess, PREVIEW_GUESTS: 'true' };
}

export { QuartetRoom };
export class BibleSketchRoom extends SketchRoom {
  constructor(ctx, env) { super(ctx, roomEnv(env)); }
}
export class SpyRoom extends BaseSpyRoom {
  constructor(ctx, env) { super(ctx, roomEnv(env)); }
}
export class TwelveTribesRoom extends TribesRoom {
  constructor(ctx, env) { super(ctx, roomEnv(env)); }
}
// Keep the previously migrated class registered so retiring its route preserves stored rooms.
export class KingdomsRoom {
  fetch() { return new Response('Gone', { status: 410 }); }
}
export class PromisedLandRoom extends LandRoom {
  constructor(ctx, env) { super(ctx, roomEnv(env)); }
}

const online = {
  sketch: { worker: sketch, rooms: 'SKETCH_ROOMS' },
  spy: { worker: spy, rooms: 'SPY_ROOMS' },
  tribes: { worker: tribes, rooms: 'TRIBES_ROOMS' },
};

function onlineEnv(env, rooms, scope, origin) {
  return {
    ...roomEnv(env),
    ROOMS: env[rooms],
    ALLOW_GUESTS: 'true',
    ALLOWED_ORIGINS: origin,
    SESSION_SECRET: env.SESSION_SECRET ? env.SESSION_SECRET + ':' + scope : undefined,
  };
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    if (path === '/health') return Response.json({ ok: true, service: 'alias-spy-games-full-preview' });

    if (path === '/online/kingdoms' || path.startsWith('/online/kingdoms/')) {
      return new Response('Gone', { status: 410 });
    }

    const isQuartet = path === '/rooms' || path.startsWith('/rooms/');
    const isLand = path === '/api/health' || path === '/api/rooms' || path.startsWith('/api/rooms/');
    const match = path.match(/^\/online\/(sketch|spy|tribes)(\/.*)$/);
    if (isQuartet || isLand || match) {
      const origin = request.headers.get('Origin');
      if (origin && origin !== url.origin) return new Response('Forbidden', { status: 403 });
      if (isQuartet) return quartet.fetch(request, env, ctx);
      if (isLand) return land.fetch(request, onlineEnv(env, 'LAND_ROOMS', 'land', url.origin), ctx);
      const [, game, endpoint] = match;
      if (!/^\/(?:health|rooms(?:\/[A-Za-z0-9]+(?:\/(?:join|ws|poll))?)?)$/.test(endpoint)) {
        return new Response('Not found', { status: 404 });
      }
      const route = online[game];
      url.pathname = endpoint;
      return route.worker.fetch(new Request(url, request), onlineEnv(env, route.rooms, game, url.origin), ctx);
    }
    return env.PREVIEW_ASSETS.fetch(request);
  },
};
