const VERSION = 'spy-parallax-review-v1';
const BUILD = 'spy-parallax-ai-layers-v2';

const versionResponse = () => Response.json({
  version: VERSION,
  build: BUILD,
  game: 'spy',
  review: true,
  productionMainTouched: false,
  layers: 17,
  runtimeDepthLayers: 12,
  eagerDepthLayers: 11,
  transparentRasterLayers: true,
  generatedAtRuntime: false,
  continuousLoops: 0,
  parallax: 'event-driven-smoothed-raf',
  features: [
    'scroll-depth',
    'horizontal-peek',
    'role-state',
    'lazy-event-patrol',
    'lazy-event-birds',
    'baked-fog',
  ],
}, { headers: { 'cache-control': 'no-store' } });

const assetRequest = (request, path) => new Request(new URL(path, request.url), {
  method: 'GET',
  headers: request.headers,
});

const wrapAsset = (response, isHtml = false) => {
  const headers = new Headers(response.headers);
  headers.set('x-content-type-options', 'nosniff');
  headers.set('referrer-policy', 'no-referrer');

  if (isHtml) {
    headers.set('content-type', 'text/html; charset=utf-8');
    headers.set('cache-control', 'no-store');
    headers.set('x-spy-review', BUILD);
    headers.set('content-security-policy', "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; base-uri 'none'");
  } else {
    headers.set('cache-control', 'public, max-age=31536000, immutable');
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/__preview_version') return versionResponse();

    if (request.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
      const response = await env.ASSETS.fetch(assetRequest(request, '/index.html'));
      return wrapAsset(response, true);
    }

    const response = await env.ASSETS.fetch(request);

    if (response.status === 404 && request.method === 'GET') {
      const fallback = await env.ASSETS.fetch(assetRequest(request, '/index.html'));
      if (fallback.ok) return wrapAsset(fallback, true);
    }

    const contentType = response.headers.get('content-type') || '';
    return wrapAsset(response, contentType.includes('text/html'));
  },
};
