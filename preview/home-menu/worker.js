const BUILD_VERSION = 'home-menu-v18-isolated-assets';
const BUILD_LABEL = '● HOME V18 · ISOLATED ASSETS · CLOUDFLARE PREVIEW · MAIN НЕ ЗАТРОНУТ';

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
  '/icons/alias.png': {
    role: 'game-icon-alias',
    contentType: 'image/png',
    bytes: 354173,
    etag: '"42f2bf6cce4f4cfdde062790a888f34a2b9bc560ac9c82e59fe480a375623a02"',
  },
  '/icons/idea.png': {
    role: 'game-icon-bible-sketch',
    contentType: 'image/png',
    bytes: 364257,
    etag: '"85041c24cf8008fd0aa3ae1a08733580286911e21769006c07bf90e5bc2defd1"',
  },
  '/icons/biblical-treasures-v38.png': {
    role: 'game-icon-biblical-treasures',
    contentType: 'image/png',
    bytes: 420180,
    etag: '"dff341415bf43e2220b9fc877a800b00fca1717c30a833e7f05be27195831d19"',
  },
  '/icons/quartet.png': {
    role: 'game-icon-quartet',
    contentType: 'image/png',
    bytes: 401949,
    etag: '"798fea10a39d030a9b77d049e86bb3266a119a01b44c7183c534a099999000c6"',
  },
  '/icons/spy.png': {
    role: 'game-icon-spy',
    contentType: 'image/png',
    bytes: 372269,
    etag: '"07f7f082daae62413cf5fbddcac77542f4ef8c2e963991dd4079463b426d4242"',
  },
  '/icons/words.png': {
    role: 'game-icon-words',
    contentType: 'image/png',
    bytes: 362501,
    etag: '"abb22292a06eec2442a55f7898622c225bd3cea2fd2eca1c6c0a7099fe0e6897"',
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
    background: 'deep-layered-biblical-city-v18',
    architecture: 'index-native-minimal-multilayer-scene-v18',
    interaction: 'scroll-actions-tilt-and-icon-feedback',
    source: 'generated-high-detail-assets-and-local-game-icons',
    videoRequired: false,
    rangeRequired: false,
    legacyVideoAssetsRemoved: true,
    quickGameRemoved: true,
    customRasterIcons: true,
    productionMainAssetDependency: false,
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
      gameIcons: {
        basePath: '/icons/',
        count: 6,
        totalBytes: 2275329,
        isolated: true,
        registry: 'preview-local-static-copy',
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
      headers.set('x-home-menu-preview', 'deep-layered-biblical-city-v18');
      headers.set('x-home-menu-build', BUILD_VERSION);
      return new Response(response.body, { status: response.status, headers });
    }

    return response;
  },
};
