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
const delegated = '666666666';
let identity = owner;
let assetRequests = 0;
const scene = 'babel-360-v6-seams2-4k.webp';
const env = {
  ADMIN_TELEGRAM_ID: owner,
  ALLOWED_ORIGINS: 'https://appassets.androidplatform.net,https://vidalost.github.io',
  USERS: {
    idFromName: () => 'global',
    get: () => ({
      fetch: (url) => {
        assert.match(url, /\/android-auth\/session$/);
        return Response.json({ userId: identity });
      },
    }),
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
function request(action, body = {}, authenticated = false) {
  const headers = { Origin: origin, 'Content-Type': 'application/json' };
  if (authenticated) headers.Authorization = 'Bearer bgs_' + 's'.repeat(64);
  return core.fetch(new Request('https://core.example/bible-world/' + action, {
    method: 'POST', headers, body: JSON.stringify(body),
  }), env);
}
assert.equal((await request('access', { userId: owner })).status, 401);
assert.equal((await request('panorama', { userId: owner, scene })).status, 401);
identity = delegated;
assert.equal((await request('access', { userId: owner }, true)).status, 403);
assert.equal((await request('panorama', { scene }, true)).status, 403);
assert.equal(assetRequests, 0);
identity = owner;
assert.equal((await request('access', {}, true)).status, 204);
assert.equal((await request('panorama', { scene: '../' + scene }, true)).status, 404);
assert.equal(assetRequests, 0);
const panorama = await request('panorama', { scene }, true);
assert.equal(panorama.status, 200);
assert.equal(panorama.headers.get('Content-Type'), 'image/webp');
assert.equal(panorama.headers.get('Cache-Control'), 'no-store');
assert.equal(panorama.headers.get('Access-Control-Allow-Origin'), origin);
assert.equal(await panorama.text(), 'panorama');
assert.equal((await request('panorama', { scene: 'missing-4k.webp' }, true)).status, 404);
assert.equal(assetRequests, 2);
console.log('Bible World Core routes allow only the verified main administrator.');
