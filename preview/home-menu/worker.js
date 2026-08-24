const VIDEO_PATH = '/home-bg-v14-scroll.mp4';
const BUILD_VERSION = 'home-menu-v14-scroll-driven-city';
const BUILD_LABEL = '● HOME V14 · SCROLL-DRIVEN CITY · CLOUDFLARE PREVIEW · MAIN НЕ ЗАТРОНУТ';
const VIDEO_ETAG = '"535c60d719f2e0a9298190fabaa5f91de6ef6d0299858113b91ecc772f4760e3"';

function parseRange(value, size) {
  if (!value || !value.startsWith('bytes=')) return null;
  const match = /^(\d*)-(\d*)$/.exec(value.slice(6).trim());
  if (!match) return null;

  let start;
  let end;
  if (match[1] === '' && match[2] !== '') {
    const suffix = Number(match[2]);
    if (!Number.isFinite(suffix) || suffix <= 0) return null;
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(match[1]);
    end = match[2] === '' ? size - 1 : Number(match[2]);
  }

  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end < start || start >= size) return null;
  return { start, end: Math.min(end, size - 1) };
}

function videoHeaders() {
  return new Headers({
    'content-type': 'video/mp4',
    'accept-ranges': 'bytes',
    'cache-control': 'public, max-age=31536000, immutable',
    etag: VIDEO_ETAG,
    'x-content-type-options': 'nosniff',
    'x-home-menu-build': BUILD_VERSION,
    'x-home-menu-video': 'scroll-scrubbed-biblical-city-v14',
  });
}

async function serveVideo(request, env) {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response('Method Not Allowed', { status: 405, headers: { allow: 'GET, HEAD' } });
  }

  const assetUrl = new URL(VIDEO_PATH, request.url);
  const asset = await env.ASSETS.fetch(new Request(assetUrl, { method: 'GET' }));
  if (!asset.ok) return asset;

  const bytes = await asset.arrayBuffer();
  const size = bytes.byteLength;
  const headers = videoHeaders();
  const requestedRange = request.headers.get('range');
  const range = parseRange(requestedRange, size);

  if (!requestedRange && request.headers.get('if-none-match') === VIDEO_ETAG) {
    return new Response(null, { status: 304, headers });
  }

  if (requestedRange && !range) {
    headers.set('content-range', `bytes */${size}`);
    return new Response(null, { status: 416, headers });
  }

  if (range) {
    const body = bytes.slice(range.start, range.end + 1);
    headers.set('content-range', `bytes ${range.start}-${range.end}/${size}`);
    headers.set('content-length', String(body.byteLength));
    return new Response(request.method === 'HEAD' ? null : body, { status: 206, headers });
  }

  headers.set('content-length', String(size));
  return new Response(request.method === 'HEAD' ? null : bytes, { status: 200, headers });
}

function versionResponse() {
  return Response.json({
    version: BUILD_VERSION,
    label: BUILD_LABEL,
    background: 'scroll-scrubbed-biblical-city-v14',
    architecture: 'index-native-scroll-video-v14',
    autoplayRequired: false,
    interaction: 'scroll-seek-with-action-effects',
    source: 'user-generated-upload',
    rangeFix: true,
    video: {
      codec: 'H.264 High',
      width: 512,
      height: 910,
      fps: 30,
      durationSeconds: 10,
      bytes: 6673300,
      audio: false,
      fastStart: true,
      seamlessLoop: false,
      scrollDriven: true,
      keyframeIntervalSeconds: 0.267,
      hasBFrames: false,
    },
  }, {
    headers: {
      'cache-control': 'no-store, max-age=0',
      pragma: 'no-cache',
      expires: '0',
      'x-home-menu-build': BUILD_VERSION,
      'x-content-type-options': 'nosniff',
    },
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/__preview_version') return versionResponse();
    if (url.pathname === VIDEO_PATH) return serveVideo(request, env);

    const response = await env.ASSETS.fetch(request);
    const type = response.headers.get('content-type') || '';
    if ((url.pathname === '/' || url.pathname === '/index.html') && type.includes('text/html')) {
      const headers = new Headers(response.headers);
      headers.set('content-type', 'text/html; charset=utf-8');
      headers.set('cache-control', 'no-store, no-cache, must-revalidate, max-age=0');
      headers.set('pragma', 'no-cache');
      headers.set('expires', '0');
      headers.set('surrogate-control', 'no-store');
      headers.set('x-content-type-options', 'nosniff');
      headers.set('referrer-policy', 'no-referrer');
      headers.set('x-robots-tag', 'noindex, nofollow');
      headers.set('x-home-menu-preview', 'scroll-scrubbed-biblical-city-v14');
      headers.set('x-home-menu-build', BUILD_VERSION);
      return new Response(response.body, { status: response.status, headers });
    }

    return response;
  },
};
