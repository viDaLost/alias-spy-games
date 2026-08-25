const BUILD_VERSION = 'home-menu-v19-raster-action-layers-planner';
const BUILD_LABEL = '● HOME V19 · FULL RASTER LAYERS + ROUTE · CLOUDFLARE PREVIEW · MAIN НЕ ЗАТРОНУТ';

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
  '/layers/moon-v19.webp': {
    role: 'raster-layer-moon',
    contentType: 'image/webp',
    bytes: 139610,
    etag: '"66f8274871f0bfeee7a22147e1ab48aa23d9f3da32279aa20f2837d8e7e8cc35"',
  },
  '/layers/stars-v19.webp': {
    role: 'raster-layer-stars',
    contentType: 'image/webp',
    bytes: 292862,
    etag: '"1f1c4e8c72ace99703888d3fb96b9569fe2d27f3c78228bd8f33023d4c60f491"',
  },
  '/layers/clouds-far-v19.webp': {
    role: 'raster-layer-clouds-far',
    contentType: 'image/webp',
    bytes: 404510,
    etag: '"0dbb8693b1337a369991dadea266e7c60b52f4bc3deb4a1741d6ea277927165b"',
  },
  '/layers/clouds-near-v19.webp': {
    role: 'raster-layer-clouds-near',
    contentType: 'image/webp',
    bytes: 454478,
    etag: '"da35373301a3f84ef990e60f7ffc06d62d819e25a9e42e364aa04c8fabee8c4d"',
  },
  '/actions/room-v19.webp': {
    role: 'raster-action-layer-room-portal',
    contentType: 'image/webp',
    bytes: 494240,
    etag: '"d3c96c720da4e5cb3af7739a7f60aa47567f0813fa430eea3c7412f8765e1790"',
  },
  '/actions/code-v19.webp': {
    role: 'raster-action-layer-room-code',
    contentType: 'image/webp',
    bytes: 167420,
    etag: '"60ec5e7ecaac41fa8dceb5853e1a5ed9ec3f2a8ec655a65f0baec633ef1cd3ce"',
  },
  '/actions/qr-v19.webp': {
    role: 'raster-action-layer-qr-scanner',
    contentType: 'image/webp',
    bytes: 518236,
    etag: '"d89fab159b8b63f01a3302cf59ff5f571056022505acb115b0b892255963f3e1"',
  },
  '/actions/falling-stars-v19.webp': {
    role: 'raster-action-layer-falling-stars',
    contentType: 'image/webp',
    bytes: 38938,
    etag: '"e9d0929091818714c4c9935b291e60e02ebaac2c4d8e8859139931ca02c01715"',
  },
  '/home-menu-icons-v19.webp': {
    role: 'optimized-custom-raster-icon-atlas',
    contentType: 'image/webp',
    bytes: 493088,
    etag: '"99535429340ab69de04407dd041cc348e74ec61d92aa2d0c8a64852334852d50"',
  },
  '/icons-v19/alias.webp': {
    role: 'optimized-game-icon-alias',
    contentType: 'image/webp',
    bytes: 81010,
    etag: '"f4d6c2427be82995c4bf7a8402c8c034f43ed9854ae8f791161d5703e8f67785"',
  },
  '/icons-v19/idea.webp': {
    role: 'optimized-game-icon-bible-sketch',
    contentType: 'image/webp',
    bytes: 86200,
    etag: '"f67874770ed052bebb31701e9c49d522712b50aa7334a13bb578e8d9ed28d141"',
  },
  '/icons-v19/biblical-treasures-v38.webp': {
    role: 'optimized-game-icon-biblical-treasures',
    contentType: 'image/webp',
    bytes: 116596,
    etag: '"8a6b5cdb9b91d216492bffbfa12853eca408e13c9662a5c2a70807ea88678e79"',
  },
  '/icons-v19/quartet.webp': {
    role: 'optimized-game-icon-quartet',
    contentType: 'image/webp',
    bytes: 93172,
    etag: '"3265657801bc2f00c11532a1a99976cde67e510b2a75f1f62862852714026609"',
  },
  '/icons-v19/spy.webp': {
    role: 'optimized-game-icon-spy',
    contentType: 'image/webp',
    bytes: 85974,
    etag: '"1316509425e53f44479ae574f109ef4c43aad153e87742ab7c7ddd0b2aa73fb8"',
  },
  '/icons-v19/words.webp': {
    role: 'optimized-game-icon-words',
    contentType: 'image/webp',
    bytes: 85584,
    etag: '"fd0895a6a05de7414e69ba885555847617b7531dc2e3ffd51ddfc9907861e181"',
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
    background: 'event-driven-raster-parallax-v19',
    architecture: 'separated-ui-and-event-driven-scene-v19',
    interaction: 'scroll-actions-route-planner-and-optional-tilt',
    source: 'generated-raster-background-and-action-layers',
    videoRequired: false,
    rangeRequired: false,
    legacyVideoAssetsRemoved: true,
    quickGameRemoved: true,
    randomGameRemoved: true,
    gameNightPlanner: true,
    customRasterIcons: true,
    productionMainAssetDependency: false,
    legacyHtmlScriptRetainedInert: false,
    legacyHtmlScriptRemoved: true,
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
      rasterLayers: {
        basePath: '/layers/',
        count: 4,
        totalBytes: 1291460,
        format: 'lossless WebP alpha',
        transparent: true,
        items: {
          moon: { path: '/layers/moon-v19.webp', width: 384, height: 384, bytes: 139610, sha256: '66f8274871f0bfeee7a22147e1ab48aa23d9f3da32279aa20f2837d8e7e8cc35' },
          stars: { path: '/layers/stars-v19.webp', width: 720, height: 1280, bytes: 292862, sha256: '1f1c4e8c72ace99703888d3fb96b9569fe2d27f3c78228bd8f33023d4c60f491' },
          cloudsFar: { path: '/layers/clouds-far-v19.webp', width: 720, height: 1280, bytes: 404510, sha256: '0dbb8693b1337a369991dadea266e7c60b52f4bc3deb4a1741d6ea277927165b' },
          cloudsNear: { path: '/layers/clouds-near-v19.webp', width: 720, height: 1280, bytes: 454478, sha256: 'da35373301a3f84ef990e60f7ffc06d62d819e25a9e42e364aa04c8fabee8c4d' },
        },
      },
      actionLayers: {
        basePath: '/actions/',
        count: 4,
        totalBytes: 1218834,
        format: 'lossless WebP alpha',
        transparent: true,
        loading: 'on-first-action',
        items: {
          room: { path: '/actions/room-v19.webp', width: 720, height: 1280, bytes: 494240, sha256: 'd3c96c720da4e5cb3af7739a7f60aa47567f0813fa430eea3c7412f8765e1790' },
          code: { path: '/actions/code-v19.webp', width: 720, height: 1280, bytes: 167420, sha256: '60ec5e7ecaac41fa8dceb5853e1a5ed9ec3f2a8ec655a65f0baec633ef1cd3ce' },
          qr: { path: '/actions/qr-v19.webp', width: 720, height: 1280, bytes: 518236, sha256: 'd89fab159b8b63f01a3302cf59ff5f571056022505acb115b0b892255963f3e1' },
          fallingStars: { path: '/actions/falling-stars-v19.webp', width: 720, height: 1280, bytes: 38938, sha256: 'e9d0929091818714c4c9935b291e60e02ebaac2c4d8e8859139931ca02c01715' },
        },
      },
      icons: {
        path: '/home-menu-icons-v19.webp',
        format: 'lossless WebP alpha',
        width: 576,
        height: 576,
        bytes: 493088,
        sha256: '99535429340ab69de04407dd041cc348e74ec61d92aa2d0c8a64852334852d50',
        grid: '3x3',
        count: 9,
        transparent: true,
      },
      gameIcons: {
        basePath: '/icons-v19/',
        count: 6,
        width: 288,
        height: 288,
        totalBytes: 548536,
        format: 'lossless WebP alpha',
        isolated: true,
        registry: 'preview-local-optimized-copy',
      },
      optimization: {
        visibleRasterBytes: 1041624,
        estimatedDecodedIconBytes: 3317760,
        sourceAssetsRetained: true,
      },
    },
    layers: [
      'city-plate',
      'raster-stars',
      'raster-moon',
      'raster-clouds-far',
      'raster-clouds-near',
      'static-lantern-glows',
      'foreground-olive-frame',
      'contrast-shade',
      'lazy-raster-action-layers',
      'route-planner-feedback',
    ],
    motion: {
      scrollDriven: true,
      eventDriven: true,
      infiniteLoops: false,
      independentLayerTransforms: true,
      scrollVelocityReactive: true,
      scrollDirectionReactive: true,
      finePointerOnly: true,
      optInDeviceTilt: true,
      reducedMotionFallback: true,
    },
    planner: {
      name: 'Игровой маршрут',
      maxGames: 2,
      playerRange: [1, 12],
      timeOptions: [20, 40, 60],
      moodOptions: ['calm', 'mixed', 'active'],
      deterministic: true,
      persistsLocally: true,
    },
    performance: {
      maxFrameRate: 60,
      frameTimeBased: true,
      continuousAnimationLoops: 0,
      proceduralParticleNodes: 0,
      cssActionShapes: 0,
      lazyActionLayers: true,
      maxDecodedActionLayers: 1,
      dynamicWillChange: true,
      repeatedBackdropBlurRemoved: true,
      lazyGameIcons: true,
      telegramLifecycleAware: true,
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
      headers.set('x-home-menu-preview', 'event-driven-raster-parallax-v19');
      headers.set('x-home-menu-build', BUILD_VERSION);
      return new Response(response.body, { status: response.status, headers });
    }

    return response;
  },
};
