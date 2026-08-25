const VERSION = {
  version: 'alias-parallax-review-v1',
  build: 'alias-market-layers-v1',
  game: 'alias',
  review: true,
  productionMainTouched: false,
  layers: 13,
  runtimeDepthLayers: 9,
  eagerDepthLayers: 9,
  transparentRasterLayers: true,
  generatedAtRuntime: false,
  continuousVisualLoops: 0,
  gameplayTimer: 'self-scheduling-timeout',
  parallax: 'event-driven-smoothed-raf',
  mechanics: [
    'difficulty',
    'teams',
    'timed-round',
    'answer-review',
    'next-team',
  ],
};

const securityHeaders = {
  'Content-Security-Policy': "default-src 'self'; img-src 'self' data:; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
};

function withHeaders(response, extra = {}) {
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(securityHeaders)) headers.set(name, value);
  for (const [name, value] of Object.entries(extra)) headers.set(name, value);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/__preview_version') {
      return Response.json(VERSION, {
        headers: {
          ...securityHeaders,
          'Cache-Control': 'no-store',
        },
      });
    }

    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return withHeaders(new Response('Method Not Allowed', { status: 405 }), {
        Allow: 'GET, HEAD',
      });
    }

    let response = await env.ASSETS.fetch(request);
    if (response.status === 404 && url.pathname === '/') {
      response = await env.ASSETS.fetch(new Request(new URL('/index.html', url), request));
    }

    const immutable = /\.(?:webp|js|css|json)$/.test(url.pathname);
    return withHeaders(response, {
      'Cache-Control': immutable ? 'public, max-age=31536000, immutable' : 'no-store',
    });
  },
};
