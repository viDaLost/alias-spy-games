import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

// Exercise the production fetch entry point without starting a Durable Object runtime.
registerHooks({
  resolve(specifier, context, next) {
    if (specifier === 'cloudflare:workers') {
      return { url: 'data:text/javascript,export class WorkerEntrypoint {}; export class DurableObject {}', shortCircuit: true };
    }
    return next(specifier, context);
  },
});
const { default: core } = await import('../cloudflare/app-core-worker/src/index-v18.js');
const owner = '1288379477';
const player = '666666666';
let identity = player;
let restricted = false;
let banned = false;
let assetRequests = 0;
let roomRequests = 0;
const scene = 'babel-360-v6-seams2-4k.webp';
const env = {
  ADMIN_TELEGRAM_ID: owner,
  ALLOWED_ORIGINS: 'https://appassets.androidplatform.net,https://vidalost.github.io',
  USERS: {
    idFromName: () => 'global',
    get: () => ({
      fetch: (url, init) => {
        if (url.endsWith('/android-auth/session')) return Response.json({ userId: identity });
        assert.match(url, /\/app-access\/check$/);
        const { userId } = JSON.parse(init.body);
        const allowed = userId === owner || (!restricted && !(userId && banned));
        return Response.json({ ok: true, success: true, allowed });
      },
    }),
  },
  AZBUKA: {
    fetch: (url, init) => {
      roomRequests++;
      assert.equal(url, 'https://azbuka.internal/create');
      assert.equal(init.headers['X-Azbuka-Account'], player);
      return Response.json({ ok: true });
    },
  },
  BIBLE_WORLD: {
    fetch: (url) => {
      assetRequests++;
      assert.equal(new URL(url).origin, 'https://bible-world.internal');
      return new URL(url).pathname === '/' + scene
        ? new Response('panorama', { headers: { 'Content-Type': 'image/webp', 'Cache-Control': 'public' } })
        : Response.json({}, { status: 404 });
    },
  },
};
const origin = 'https://appassets.androidplatform.net';
function request(path, body = {}, authenticated = false) {
  const headers = { Origin: origin, 'Content-Type': 'application/json' };
  if (authenticated) headers.Authorization = 'Bearer bgs_' + 's'.repeat(64);
  return core.fetch(new Request('https://core.example/' + path, {
    method: 'POST', headers, body: JSON.stringify(body),
  }), env);
}
assert.equal((await request('bible-world/access')).status, 204);
assert.equal((await request('bible-world/access', {}, true)).status, 204);
assert.equal((await request('bible-world/access', { telegramInitData: 'invalid' })).status, 401);
assert.equal((await request('azbuka/create', { userId: owner })).status, 401);
assert.equal((await request('azbuka/create', { payload: { name: 'Игрок' } }, true)).status, 200);

banned = true;
assert.equal((await request('bible-world/panorama', { scene }, true)).status, 403);
assert.equal((await request('azbuka/create', { userId: owner }, true)).status, 403);
banned = false;
restricted = true;
assert.equal((await request('bible-world/access', { userId: owner })).status, 403);
assert.equal((await request('bible-world/panorama', { scene }, true)).status, 403);
assert.equal((await request('azbuka/create', {}, true)).status, 403);
identity = owner;
assert.equal((await request('bible-world/access', {}, true)).status, 204);
identity = player;
restricted = false;
assert.equal(roomRequests, 1);
assert.equal((await request('bible-world/panorama', { scene: '../' + scene }, true)).status, 404);
assert.equal(assetRequests, 0);
const panorama = await request('bible-world/panorama', { scene });
assert.equal(panorama.status, 200);
assert.equal(panorama.headers.get('Content-Type'), 'image/webp');
assert.equal(panorama.headers.get('Cache-Control'), 'no-store');
assert.equal(panorama.headers.get('Access-Control-Allow-Origin'), origin);
assert.equal(await panorama.text(), 'panorama');
assert.equal((await request('bible-world/panorama', { scene: 'missing-4k.webp' }, true)).status, 404);
assert.equal(assetRequests, 2);
console.log('Both games are open to regular players. Bible World accepts guests, Azbuka rooms use verified accounts, and general restrictions are enforced.');
