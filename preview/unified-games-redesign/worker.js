const SOURCE_COMMIT = '58cfe7515fd1d50163eda13d10a14958a9475357';
const VERSION = {
  version: 'unified-games-redesign-review-v1',
  build: 'canonical-preview-adapters-v1',
  sourceCommit: SOURCE_COMMIT,
  productionMainTouched: false,
  gameCount: 12,
  mechanicsSource: 'production-main-pinned-proxy',
  visualOwnership: 'preview-shells-only-production-main-mechanics-only',
  visualBridge: 'canonical-preview-adapters-v1',
  assetLoading: 'menu-eager-game-scenes-lazy',
  parallaxGames: ['alias', 'coimaginarium', 'guess', 'describe', 'spy', 'bible-wow', 'sacred-word', 'biblical-match-three'],
  staticRedesignGames: ['quartet', 'bible-sketch', 'bible-wordsearch', 'kids-ark-pairs'],
  menuParallax: true,
  menuArchitecture: 'home-v22-games-profile-two-tab',
  profileEnabled: true,
  canonicalReferences: {
    home: 'home-menu-v22@195f150b',
    alias: 'alias-parallax@7e36d9a',
    spy: 'spy-parallax@ddd4d3a',
    bibleWords: 'temple-of-writing-v3@dd1743c',
    treasures: 'path-of-light@ae6f795',
    quartet: 'quartet-card-redesign',
  },
  canonicalDepth: { aliasMaxPx: 53, spyMaxPx: 55 },
  parallaxController: 'single-event-driven-smoothed-raf',
  gesturePolicy: 'freeze-on-interactive-pointer',
};

const securityHeaders = {
  'Content-Security-Policy': "default-src 'self'; base-uri 'self'; object-src 'none'; script-src 'self' 'unsafe-inline' https://telegram.org https://cdnjs.cloudflare.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' https://*.workers.dev wss://*.workers.dev https://cdn.jsdelivr.net https://script.google.com https://script.googleusercontent.com; frame-src 'self' https://*.workers.dev; font-src 'self' data:; frame-ancestors 'none'",
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Permissions-Policy': 'camera=(self), microphone=(), geolocation=()',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Content-Type-Options': 'nosniff',
};
function secured(response, extra = {}) {
  const headers = new Headers(response.headers);
  Object.entries(securityHeaders).forEach(([name, value]) => headers.set(name, value));
  Object.entries(extra).forEach(([name, value]) => headers.set(name, value));
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}
async function localAsset(request, env) { return env.ASSETS.fetch(request); }

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/__preview_version') return Response.json(VERSION, { headers: { ...securityHeaders, 'Cache-Control': 'no-store' } });
    if (request.method !== 'GET' && request.method !== 'HEAD') return secured(new Response('Method Not Allowed', { status: 405 }), { Allow: 'GET, HEAD' });

    if (url.pathname.startsWith('/web/review/')) {
      const response = await localAsset(request, env);
      return secured(response, { 'Cache-Control': 'public, max-age=31536000, immutable' });
    }
    if (url.pathname === '/web/games/sacred-word.js') {
      const response = await localAsset(request, env);
      return secured(response, { 'Cache-Control': 'public, max-age=300' });
    }
    if (url.pathname === '/web/js/three-gate.js') {
      const response = await localAsset(request, env);
      return secured(response, { 'Cache-Control': 'public, max-age=300' });
    }
    if (url.pathname.startsWith('/web/')) {
      const upstream = new URL(`https://cdn.jsdelivr.net/gh/viDaLost/alias-spy-games@${SOURCE_COMMIT}${url.pathname}`);
      upstream.search = url.search;
      const response = await fetch(new Request(upstream, { method: request.method, headers: { Accept: request.headers.get('Accept') || '*/*' } }));
      return secured(response, { 'Cache-Control': 'public, max-age=31536000, immutable' });
    }

    let response = await localAsset(request, env);
    if (response.status === 404 && (url.pathname === '/' || url.pathname === '/index.html')) {
      response = await localAsset(new Request(new URL('/index.html', url), request), env);
    }
    return secured(response, { 'Cache-Control': url.pathname === '/' ? 'no-store' : 'public, max-age=300' });
  },
};
