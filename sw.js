/* eslint-env serviceworker */
'use strict';

// Офлайн-режим.
//
// Приложение статическое и лежит на GitHub Pages, поэтому в дороге ему не
// хватает только файлов: прогресс и так живёт в localStorage. Этот работник
// держит оболочку, скрипты игр и данные уровней в кеше, чтобы игра открывалась
// без сети.
//
// Правила выбраны так, чтобы кеш никогда не показал устаревшее приложение:
//
//   * переходы (открытие страницы) — сначала сеть. Есть связь — человек всегда
//     получает свежий index.html со ссылками на текущие бандлы;
//   * бандлы web/dist — сразу из кеша: их имена содержат хеш содержимого, и
//     новая сборка приходит под новым именем;
//   * остальное своё — из кеша с тихим обновлением в фоне;
//   * чужое (Cloudflare, Telegram) не кешируется никогда. Ответ сервера,
//     подсунутый из кеша, — это чужой прогресс и просроченные права.

/* build:precache */
const VERSION = 'ac6652c20c';
const PRECACHE = [
  'index.html',
  'install.html',
  'manifest.webmanifest',
  'web/js/language-choice.js',
  'web/js/telegram-launch-context.js',
  'web/i18n/bootstrap.js',
  'web/assets/twelve-tribes/art.json',
  'web/assets/bible-geography/map.json',
  'web/assets/bible-geography/art.json',
  'web/dist/app.7c03de3e81.css',
  'web/dist/app.fdc966e0fb.js',
  'web/games/alias.js',
  'web/games/bible-azbuka.css',
  'web/games/bible-azbuka.html',
  'web/games/bible-azbuka.js',
  'web/games/bible-geography-logic.js',
  'web/games/bible-geography.css',
  'web/games/bible-geography.js',
  'web/games/bible-sketch-landscape-v2.css',
  'web/games/bible-sketch.css',
  'web/games/bible-sketch.js',
  'web/games/bible-wordsearch.js',
  'web/games/bible-world.js',
  'web/games/bible-wow.js',
  'web/games/biblical-match-three-core.js',
  'web/games/biblical-match-three-effects.js',
  'web/games/biblical-match-three-progress.js',
  'web/games/biblical-match-three-v10-runtime.js',
  'web/games/biblical-match-three-v15-polish.js',
  'web/games/biblical-match-three-v15-ui.js',
  'web/games/biblical-match-three-v5-loader.js',
  'web/games/biblical-match-three.js',
  'web/games/coimaginarium.js',
  'web/games/describe-char.js',
  'web/games/guess-character.js',
  'web/games/kids-ark-pairs.css',
  'web/games/kids-ark-pairs.js',
  'web/games/moses-nile-v7/PACKAGE.txt',
  'web/games/moses-nile-v7/index.html',
  'web/games/moses-nile-v7/js/assets.js',
  'web/games/moses-nile-v7/js/fx.js',
  'web/games/moses-nile-v7/js/game-v75.js',
  'web/games/moses-nile-v7/js/landscape.js',
  'web/games/moses-nile-v7/js/materials.js',
  'web/games/moses-nile-v7/js/shaders.js',
  'web/games/moses-nile-v7/js/sound.js',
  'web/games/quartet-mobile.css',
  'web/games/quartet-table-theme.css',
  'web/games/quartet-table.css',
  'web/games/quartet-table.js',
  'web/games/quartet-v2.css',
  'web/games/quartet-v4-preview.css',
  'web/games/quartet.js',
  'web/games/sacred-word.js',
  'web/games/spy-online.js',
  'web/games/spy.js',
  'web/games/twelve-tribes-bots.js',
  'web/games/twelve-tribes-engine.js',
  'web/games/twelve-tribes-online.js',
  'web/games/twelve-tribes-rules.js',
  'web/games/twelve-tribes.css',
  'web/games/twelve-tribes.js',
  'web/data/bible_geography.json',
  'web/data/bible_geography_gallery.json',
  'web/data/bible_wordsearch_levels.json',
  'web/data/bible_wow_levels.json',
  'web/data/biblical_match_three_levels.json',
  'web/data/characters.json',
  'web/data/coimaginarium_themes.json',
  'web/data/describe_words.json',
  'web/data/easy_bible_words.json',
  'web/data/hard_bible_words.json',
  'web/data/medium_bible_words.json',
  'web/data/quartet_bible.json',
  'web/data/sacred_words.json',
  'web/data/spy_locations.json',
  'web/assets/icons/admin.webp',
  'web/assets/icons/alias.webp',
  'web/assets/icons/android-download.webp',
  'web/assets/icons/ark.webp',
  'web/assets/icons/bible-sketch.svg',
  'web/assets/icons/bible-sketch.webp',
  'web/assets/icons/biblical-treasures-v38.webp',
  'web/assets/icons/catalog-v1/alias.webp',
  'web/assets/icons/catalog-v1/ark.webp',
  'web/assets/icons/catalog-v1/bible-azbuka.webp',
  'web/assets/icons/catalog-v1/bible-geography.webp',
  'web/assets/icons/catalog-v1/bible-sketch.webp',
  'web/assets/icons/catalog-v1/bible-world.webp',
  'web/assets/icons/catalog-v1/biblical-treasures.webp',
  'web/assets/icons/catalog-v1/character.webp',
  'web/assets/icons/catalog-v1/describe.webp',
  'web/assets/icons/catalog-v1/idea.webp',
  'web/assets/icons/catalog-v1/moses-nile.webp',
  'web/assets/icons/catalog-v1/promised-land.webp',
  'web/assets/icons/catalog-v1/quartet.webp',
  'web/assets/icons/catalog-v1/sacred.webp',
  'web/assets/icons/catalog-v1/search.webp',
  'web/assets/icons/catalog-v1/spy.webp',
  'web/assets/icons/catalog-v1/twelve-tribes.webp',
  'web/assets/icons/catalog-v1/words.webp',
  'web/assets/icons/channel.webp',
  'web/assets/icons/character.webp',
  'web/assets/icons/describe.webp',
  'web/assets/icons/idea.webp',
  'web/assets/icons/install-ios.webp',
  'web/assets/icons/menu-system/admin.webp',
  'web/assets/icons/menu-system/channel.webp',
  'web/assets/icons/menu-system/favorites.webp',
  'web/assets/icons/menu-system/progress.webp',
  'web/assets/icons/menu-system/rules.webp',
  'web/assets/icons/menu-system/search.webp',
  'web/assets/icons/menu-system/settings.webp',
  'web/assets/icons/menu-system/share.webp',
  'web/assets/icons/menu-system/stars.webp',
  'web/assets/icons/menu-system/support.webp',
  'web/assets/icons/menu-system/theme.webp',
  'web/assets/icons/more.webp',
  'web/assets/icons/moses-nile.webp',
  'web/assets/icons/profile.webp',
  'web/assets/icons/promised-land-v2.webp',
  'web/assets/icons/qr-scanner.webp',
  'web/assets/icons/quartet.webp',
  'web/assets/icons/rules.webp',
  'web/assets/icons/sacred.webp',
  'web/assets/icons/search.webp',
  'web/assets/icons/spy.webp',
  'web/assets/icons/support.webp',
  'web/assets/icons/twelve-tribes.webp',
  'web/assets/icons/unified-v1/alias.webp',
  'web/assets/icons/unified-v1/ark.webp',
  'web/assets/icons/unified-v1/bible-azbuka.webp',
  'web/assets/icons/unified-v1/bible-geography.webp',
  'web/assets/icons/unified-v1/bible-sketch.webp',
  'web/assets/icons/unified-v1/bible-world.webp',
  'web/assets/icons/unified-v1/biblical-treasures.webp',
  'web/assets/icons/unified-v1/character.webp',
  'web/assets/icons/unified-v1/describe.webp',
  'web/assets/icons/unified-v1/idea.webp',
  'web/assets/icons/unified-v1/moses-nile.webp',
  'web/assets/icons/unified-v1/promised-land.webp',
  'web/assets/icons/unified-v1/quartet.webp',
  'web/assets/icons/unified-v1/sacred.webp',
  'web/assets/icons/unified-v1/search.webp',
  'web/assets/icons/unified-v1/spy.webp',
  'web/assets/icons/unified-v1/twelve-tribes.webp',
  'web/assets/icons/unified-v1/words.webp',
  'web/assets/icons/words.webp',
  'web/assets/biblical-match-three/icons-v17/ark.webp',
  'web/assets/biblical-match-three/icons-v17/bible.webp',
  'web/assets/biblical-match-three/icons-v17/bread.webp',
  'web/assets/biblical-match-three/icons-v17/candle.webp',
  'web/assets/biblical-match-three/icons-v17/chains.webp',
  'web/assets/biblical-match-three/icons-v17/covenant-ark.webp',
  'web/assets/biblical-match-three/icons-v17/covenant.webp',
  'web/assets/biblical-match-three/icons-v17/crown.webp',
  'web/assets/biblical-match-three/icons-v17/dove.webp',
  'web/assets/biblical-match-three/icons-v17/fish.webp',
  'web/assets/biblical-match-three/icons-v17/grapes.webp',
  'web/assets/biblical-match-three/icons-v17/jericho.webp',
  'web/assets/biblical-match-three/icons-v17/score.webp',
  'web/assets/biblical-match-three/icons-v17/sling.webp',
  'web/assets/biblical-match-three/icons-v17/staff.webp',
  'web/assets/biblical-match-three/icons-v17/tablets.webp',
  'web/assets/biblical-match-three/icons-v17/vine.webp',
  'web/assets/biblical-match-three/icons-v29/lamp-unlit.webp',
];
/* /build:precache */

const SHELL = `shell-${VERSION}`;
const RUNTIME = `runtime-${VERSION}`;
const scope = new URL(self.registration.scope);

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL);
    // Поштучно, а не cache.addAll: один недоступный файл не должен отменять
    // установку целиком и оставлять человека вовсе без офлайна. И небольшими
    // порциями, а не все восемьдесят разом: иначе установка забивает канал
    // ровно в тот момент, когда приложение запускается.
    const BATCH = 3;
    for (let index = 0; index < PRECACHE.length; index += BATCH) {
      await Promise.all(PRECACHE.slice(index, index + BATCH).map(async (asset) => {
        const url = new URL(asset, scope);
        try {
          await withNetworkDeadline(8000, async (signal) => {
            const response = await fetch(new Request(url, { cache: 'no-cache', signal }));
            if (response.ok) await cache.put(url, response);
          });
        } catch { /* нет сети при установке — доберём в бою */ }
      }));
    }
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter((name) => name !== SHELL && name !== RUNTIME).map((name) => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'skip-waiting') self.skipWaiting();
  if (event.data?.type === 'ping') event.source?.postMessage({ type: 'pong', version: VERSION });
});

const isImmutable = (url) => url.pathname.includes('/web/dist/');

// Ключ кеша — путь без строки запроса.
//
// Скрипты игр приложение грузит как «bible-wow.js?v=21», уровни «Поиска слов» —
// с меткой времени против кеша iOS. По полному адресу такие запросы в кеше не
// находятся никогда: у предзагруженного файла запроса нет, а у метки времени он
// каждый раз новый. Файлы здесь статические, и путь однозначно их определяет.
const keyFor = (url) => new Request(`${url.origin}${url.pathname}`);

async function withNetworkDeadline(ms, task) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await task(controller.signal);
  } finally {
    clearTimeout(timer);
  }
}

async function fromNetwork(event, cacheName, timeoutMs = 8000) {
  const { request } = event;
  const response = await withNetworkDeadline(timeoutMs, (signal) => fetch(request, { signal }));
  if (response.ok) {
    const copy = response.clone();
    event.waitUntil(caches.open(cacheName)
      .then((cache) => cache.put(keyFor(new URL(request.url)), copy))
      .catch(() => { /* Ошибка дискового кеша не влияет на сетевой ответ. */ }));
  }
  return response;
}

async function fromCache(url) {
  const key = keyFor(url);
  // Обновлённый файл должен иметь приоритет над предзагруженной версией.
  try {
    return (await caches.match(key, { cacheName: RUNTIME })) || await caches.match(key, { cacheName: SHELL });
  } catch {
    return undefined;
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== scope.origin) return;
  // Диапазонные запросы (звук, видео) кешировать нельзя: в кеш ляжет кусок.
  if (request.headers.has('range')) return;

  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      const cached = await fromCache(url) || await fromCache(new URL('index.html', scope));
      try {
        const response = await fromNetwork(event, SHELL, cached ? 3500 : 8000);
        return response.status >= 500 && cached ? cached : response;
      } catch {
        return cached || Response.error();
      }
    })());
    return;
  }

  if (isImmutable(url)) {
    event.respondWith((async () => {
      const cached = await fromCache(url);
      if (cached) return cached;
      try { return await fromNetwork(event, SHELL); } catch { return Response.error(); }
    })());
    return;
  }

  event.respondWith((async () => {
    const cached = await fromCache(url);
    // Тихое обновление: страница получает кеш сразу, а свежий файл ложится
    // рядом и достанется следующему запуску.
    const network = fromNetwork(event, RUNTIME).catch(() => null);
    if (cached) { event.waitUntil(network); return cached; }
    const response = await network;
    return response || Response.error();
  })());
});
