const BUILD_VERSION = 'home-menu-v17-minimal-layered-icons';
const BUILD_LABEL = '● HOME V17 · MINIMAL LAYERS · CLOUDFLARE PREVIEW · MAIN НЕ ЗАТРОНУТ';

const IMAGE_ASSETS = {
  '/home-bg-v15-city.png': {
    role: 'city-plate',
    contentType: 'image/png',
    bytes: 1907656,
    etag: '"06a70e94f0dbfbf93596cad57898be039f93319a5590d9c7669f83b00cc28a25"',
  },
  '/home-bg-v15-foreground.png': {
    role: 'foreground-olive-frame',
    contentType: 'image/png',
    bytes: 810819,
    etag: '"6c2de95c725e804be02c18e6ee5203a31ee6618526283021a8ebaae09926502c"',
  },
  '/home-menu-icons-v17.png': {
    role: 'custom-raster-icon-atlas',
    contentType: 'image/png',
    bytes: 2626324,
    etag: '"f5024040052c4fb6a762f8b0b5040550d6c2ce50409b996932db5134e18adbc7"',
  },
};

function imageHeaders(meta) {
  return new Headers({
    'content-type': meta.contentType,
    'content-length': String(meta.bytes),
    'cache-control': 'public, max-age=31536000, immutable',
    etag: meta.etag,
    'x-content-type-options': 'nosniff',
    'x-home-menu-build': BUILD_VERSION,
    'x-home-menu-asset': meta.role,
  });
}

async function serveImage(request, env, meta) {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response('Method Not Allowed', { status: 405, headers: { allow: 'GET, HEAD' } });
  }

  const headers = imageHeaders(meta);
  if (request.headers.get('if-none-match') === meta.etag) {
    return new Response(null, { status: 304, headers });
  }

  const assetUrl = new URL(request.url);
  assetUrl.search = '';
  const asset = await env.ASSETS.fetch(new Request(assetUrl, { method: 'GET' }));
  if (!asset.ok) return asset;

  return new Response(request.method === 'HEAD' ? null : asset.body, {
    status: 200,
    headers,
  });
}

function versionResponse() {
  return Response.json({
    version: BUILD_VERSION,
    label: BUILD_LABEL,
    background: 'deep-layered-biblical-city-v17',
    architecture: 'index-native-minimal-multilayer-scene-v17',
    interaction: 'scroll-actions-tilt-and-icon-feedback',
    source: 'generated-high-detail-assets',
    videoRequired: false,
    rangeRequired: false,
    legacyVideoAssetsRemoved: true,
    quickGameRemoved: true,
    customRasterIcons: true,
    assets: {
      city: {
        path: '/home-bg-v15-city.png',
        format: 'PNG',
        width: 941,
        height: 1672,
        bytes: 1907656,
        sha256: '06a70e94f0dbfbf93596cad57898be039f93319a5590d9c7669f83b00cc28a25',
      },
      foreground: {
        path: '/home-bg-v15-foreground.png',
        format: 'PNG alpha',
        width: 941,
        height: 1672,
        bytes: 810819,
        sha256: '6c2de95c725e804be02c18e6ee5203a31ee6618526283021a8ebaae09926502c',
        transparent: true,
      },
      icons: {
        path: '/home-menu-icons-v17.png',
        format: 'PNG alpha',
        width: 1254,
        height: 1254,
        bytes: 2626324,
        sha256: 'f5024040052c4fb6a762f8b0b5040550d6c2ce50409b996932db5134e18adbc7',
        grid: '3x3',
        count: 9,
        transparent: true,
      },
    },
    layers: [
      'city-plate',
      'moon-halo',
      'procedural-stars',
      'constellation-glow',
      'independent-cloud-bands',
      'css-haze',
      'lantern-glows',
      'floating-dust',
      'foreground-olive-frame',
      'scroll-energy-response',
      'optional-device-tilt',
      'action-effects',
    ],
    motion: {
      scrollDriven: true,
      continuousAcrossPage: true,
      independentLayerTransforms: true,
      scrollVelocityReactive: true,
      scrollDirectionReactive: true,
      pointerReactive: true,
      optInDeviceTilt: true,
      reducedMotionFallback: true,
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

    const imageMeta = IMAGE_ASSETS[url.pathname];
    if (imageMeta) return serveImage(request, env, imageMeta);

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
      headers.set('x-home-menu-preview', 'deep-layered-biblical-city-v17');
      headers.set('x-home-menu-build', BUILD_VERSION);
      return new Response(response.body, { status: response.status, headers });
    }

    return response;
  },
};
