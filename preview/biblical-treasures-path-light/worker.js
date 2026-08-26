const VERSION = {
  version: 'biblical-treasures-path-of-light-review-v1',
  build: 'path-of-light-v2-production-art-css-scene',
  game: 'biblical-match-three',
  engine: 'production-v45-from-pinned-main-commit',
  sourceCommit: '58cfe7515fd1d50163eda13d10a14958a9475357',
  review: true,
  productionMainTouched: false,
  baseLayers: 10,
  eventReactions: 10,
  layers: 10,
  sceneComposition: 'pinned-production-raster-plus-css-depth',
  assetTransport: 'worker-proxied-pinned-production-assets',
  eventRendering: 'one-shot-css-vfx',
  customBinaryUploadRequired: false,
  generatedAtRuntime: false,
  continuousVisualLoops: 0,
  parallax: 'event-driven-smoothed-raf-frozen-during-board-pointer',
  mechanics: [
    'real-match3-v45-launcher',
    'campaign-levels',
    'special-pieces',
    'boosters',
    'cascade-reactions',
    'line-horizontal-reaction',
    'line-vertical-reaction',
    'burst-reaction',
    'covenant-rainbow-reaction',
    'sling-reaction',
    'staff-reaction',
    'jericho-reaction',
    'level-complete-path-reveal',
    'parallax-freeze-on-swipe',
  ],
};

const securityHeaders = {
  'Content-Security-Policy': "default-src 'self'; img-src 'self' data: blob:; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; font-src 'self' data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
};

function withHeaders(response, extra = {}) {
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(securityHeaders)) headers.set(name, value);
  for (const [name, value] of Object.entries(extra)) headers.set(name, value);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/__preview_version') {
      return Response.json(VERSION, { headers: { ...securityHeaders, 'Cache-Control': 'no-store' } });
    }
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return withHeaders(new Response('Method Not Allowed', { status: 405 }), { Allow: 'GET, HEAD' });
    }
    if (url.pathname.startsWith('/web/')) {
      const upstream = new URL('https://cdn.jsdelivr.net/gh/viDaLost/alias-spy-games@58cfe7515fd1d50163eda13d10a14958a9475357' + url.pathname);
      upstream.search = url.search;
      const upstreamResponse = await fetch(new Request(upstream, { method: request.method, headers: { 'User-Agent': 'biblical-treasures-path-light-review' } }));
      return withHeaders(upstreamResponse, { 'Cache-Control': 'public, max-age=31536000, immutable' });
    }

    let response = await env.ASSETS.fetch(request);
    if (response.status === 404 && url.pathname === '/') {
      response = await env.ASSETS.fetch(new Request(new URL('/index.html', url), request));
    }
    const immutable = /\.(?:webp|js|css)$/.test(url.pathname);
    return withHeaders(response, { 'Cache-Control': immutable ? 'public, max-age=31536000, immutable' : 'no-store' });
  },
};
