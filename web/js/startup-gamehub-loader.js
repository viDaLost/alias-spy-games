(() => {
  'use strict';

  const ASSET_VERSION = '18';
  const ASSET_ROOT = 'web/assets/home-gamehub-parallax-v1';
  const PORTAL_VERSION = '1';
  const PORTAL_URL = `web/assets/startup-loader/portal-01.PNG?v=${PORTAL_VERSION}`;
  const MIN_VISIBLE_MS = 620;
  const EXIT_MS = 480;
  const INGEST_INTERVAL_MS = 760;
  const INGEST_DURATION_MS = 620;
  const ORBIT_SPEED = 0.00034;
  const startedAt = performance.now();

  const GAME_ICONS = [
    { key: 'alias', src: 'web/assets/icons/alias.png?v=1' },
    { key: 'idea', src: 'web/assets/icons/idea.png?v=1' },
    { key: 'character', src: 'web/assets/icons/character.png?v=1' },
    { key: 'describe', src: 'web/assets/icons/describe.png?v=1' },
    { key: 'spy', src: 'web/assets/icons/spy.png?v=1' },
    { key: 'quartet', src: 'web/assets/icons/quartet.png?v=1' },
    { key: 'artist', src: 'web/assets/icons/bible-sketch.webp?v=3' },
    { key: 'words', src: 'web/assets/icons/words.png?v=1' },
    { key: 'search', src: 'web/assets/icons/search.png?v=1' },
    { key: 'sacred', src: 'web/assets/icons/sacred.png?v=1' },
    { key: 'ark', src: 'web/assets/icons/ark.png?v=1' },
    { key: 'treasures', src: 'web/assets/icons/biblical-treasures-v38.png?v=39' },
  ];

  const scene = document.getElementById('gamehub-boot-scene');
  if (!scene) return;

  const status = scene.querySelector('[data-gamehub-boot-status]');
  const title = scene.querySelector('[data-gamehub-boot-title]');
  const retry = scene.querySelector('[data-gamehub-boot-retry]');
  const portal = scene.querySelector('.gamehub-boot__portal');
  const iconsHost = scene.querySelector('.gamehub-boot__icons');
  const layerImages = [...scene.querySelectorAll('[data-gamehub-layer-file]')];

  let iconImages = [];
  let finished = false;
  let failed = false;
  let statusTimer = 0;
  let orbitRaf = 0;
  let lastFrameAt = 0;
  const timers = new Set();
  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches === true;
  const lowPower = Boolean(
    navigator.connection?.saveData ||
    (Number(navigator.hardwareConcurrency || 0) > 0 && Number(navigator.hardwareConcurrency) <= 4)
  );
  const minFrameDelta = lowPower ? 32 : 15;

  function later(fn, ms) {
    const id = window.setTimeout(() => {
      timers.delete(id);
      fn();
    }, ms);
    timers.add(id);
    return id;
  }

  function assetUrl(file) {
    return `${ASSET_ROOT}/${encodeURIComponent(file).replace(/%2F/g, '/')}?v=${ASSET_VERSION}`;
  }

  function setStatus(text) {
    if (!status || failed) return;
    window.clearTimeout(statusTimer);
    status.classList.add('is-changing');
    statusTimer = window.setTimeout(() => {
      status.textContent = text;
      status.classList.remove('is-changing');
    }, 135);
  }

  function warmLayer(image) {
    const file = image.dataset.gamehubLayerFile || '';
    if (!file) return Promise.resolve();

    return new Promise((resolve) => {
      let settled = false;
      const done = () => {
        if (settled) return;
        settled = true;
        image.classList.add('is-loaded');
        Promise.resolve(typeof image.decode === 'function' ? image.decode().catch(() => {}) : null).finally(resolve);
      };
      image.addEventListener('load', done, { once: true });
      image.addEventListener('error', done, { once: true });
      image.src = assetUrl(file);
      if (image.complete) done();
    });
  }

  function mountPortalArtwork() {
    if (!portal || portal.querySelector('.gamehub-boot__portal-image')) return;

    const image = document.createElement('img');
    image.className = 'gamehub-boot__portal-image';
    image.alt = '';
    image.setAttribute('aria-hidden', 'true');
    image.decoding = 'async';
    image.draggable = false;

    image.addEventListener('load', () => {
      Promise.resolve(typeof image.decode === 'function' ? image.decode().catch(() => {}) : null)
        .finally(() => portal.classList.add('has-portal-image'));
    }, { once: true });

    image.addEventListener('error', () => {
      image.remove();
      portal.classList.remove('has-portal-image');
    }, { once: true });

    portal.insertBefore(image, iconsHost || null);
    image.src = PORTAL_URL;
  }

  function buildOrbitIcons() {
    if (!iconsHost) return;
    const fragment = document.createDocumentFragment();

    GAME_ICONS.forEach((icon, index) => {
      const image = document.createElement('img');
      image.className = 'gamehub-boot__icon';
      image.src = icon.src;
      image.alt = '';
      image.setAttribute('aria-hidden', 'true');
      image.decoding = 'async';
      image.loading = 'eager';
      image.draggable = false;
      image.dataset.iconKey = icon.key;
      image.dataset.orbitIndex = String(index);
      fragment.appendChild(image);
    });

    iconsHost.replaceChildren(fragment);
    iconImages = [...iconsHost.querySelectorAll('.gamehub-boot__icon')];
  }

  function warmIcons() {
    if (!iconImages.length) {
      scene.classList.add('is-icons-ready');
      return;
    }

    const tasks = iconImages.map((image) => new Promise((resolve) => {
      if (image.complete) {
        Promise.resolve(typeof image.decode === 'function' ? image.decode().catch(() => {}) : null).finally(resolve);
        return;
      }
      const done = () => resolve();
      image.addEventListener('load', done, { once: true });
      image.addEventListener('error', done, { once: true });
    }));

    Promise.race([
      Promise.all(tasks),
      new Promise((resolve) => window.setTimeout(resolve, 900)),
    ]).finally(() => scene.classList.add('is-icons-ready'));
  }

  function easeInCubic(t) {
    return t * t * t;
  }

  function easeOutCubic(t) {
    return 1 - Math.pow(1 - t, 3);
  }

  function renderOrbit(now) {
    orbitRaf = 0;
    if (finished || failed || !scene.isConnected || reducedMotion || !iconImages.length) return;

    if (now - lastFrameAt < minFrameDelta) {
      orbitRaf = requestAnimationFrame(renderOrbit);
      return;
    }
    lastFrameAt = now;

    const elapsed = Math.max(0, now - startedAt);
    const total = iconImages.length;
    const cycleLength = total * INGEST_INTERVAL_MS;
    const orbitRotation = elapsed * ORBIT_SPEED;
    const viewport = Math.min(window.innerWidth || 390, 520);
    const radiusX = Math.max(116, Math.min(154, viewport * 0.34));
    const radiusY = radiusX * 0.74;

    iconImages.forEach((image, index) => {
      const baseAngle = (Math.PI * 2 * index) / total + orbitRotation;
      const orbitX = Math.cos(baseAngle) * radiusX;
      const orbitY = Math.sin(baseAngle) * radiusY;
      const localTime = ((elapsed - index * INGEST_INTERVAL_MS) % cycleLength + cycleLength) % cycleLength;
      const ingesting = localTime < INGEST_DURATION_MS;

      let x = orbitX;
      let y = orbitY;
      let scale = 1;
      let opacity = 1;
      let rotation = Math.sin(baseAngle) * 5;

      if (ingesting) {
        const raw = Math.min(1, localTime / INGEST_DURATION_MS);
        const pull = easeInCubic(raw);
        const shrink = easeOutCubic(raw);
        x = orbitX * (1 - pull);
        y = orbitY * (1 - pull);
        scale = Math.max(0.08, 1 - shrink * 0.92);
        opacity = raw < 0.52 ? 1 : Math.max(0, 1 - ((raw - 0.52) / 0.48));
        rotation += raw * 72;
        image.classList.add('is-ingesting');
      } else {
        image.classList.remove('is-ingesting');
      }

      image.style.opacity = opacity.toFixed(3);
      image.style.transform = `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0) scale(${scale.toFixed(3)}) rotate(${rotation.toFixed(2)}deg)`;
    });

    orbitRaf = requestAnimationFrame(renderOrbit);
  }

  function startOrbit() {
    if (reducedMotion || orbitRaf || !iconImages.length) return;
    orbitRaf = requestAnimationFrame(renderOrbit);
  }

  function stopOrbit() {
    if (!orbitRaf) return;
    cancelAnimationFrame(orbitRaf);
    orbitRaf = 0;
  }

  function layoutReducedMotionIcons() {
    if (!reducedMotion || !iconImages.length) return;
    const total = iconImages.length;
    const radiusX = 128;
    const radiusY = 94;
    iconImages.forEach((image, index) => {
      const angle = (Math.PI * 2 * index) / total;
      const x = Math.cos(angle) * radiusX;
      const y = Math.sin(angle) * radiusY;
      image.style.opacity = '1';
      image.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) scale(1)`;
    });
  }

  function removeScene() {
    stopOrbit();
    if (!scene.isConnected) return;
    scene.remove();
    document.documentElement.classList.add('gamehub-boot-complete');
  }

  function finish() {
    if (finished || failed) return;
    finished = true;
    setStatus('Всё готово!');

    const elapsed = performance.now() - startedAt;
    const delay = Math.max(0, MIN_VISIBLE_MS - elapsed);

    later(() => {
      scene.classList.add('is-exiting');
      later(removeScene, EXIT_MS + 40);
    }, delay + 110);
  }

  function fail(message = 'Не удалось завершить запуск приложения.') {
    if (finished || failed) return;
    failed = true;
    stopOrbit();
    timers.forEach((id) => window.clearTimeout(id));
    timers.clear();
    scene.classList.add('is-error', 'is-icons-ready');
    if (title) title.textContent = 'Попробуем ещё раз';
    if (status) {
      status.classList.remove('is-changing');
      status.textContent = message;
    }
  }

  retry?.addEventListener('click', () => window.location.reload());

  mountPortalArtwork();
  buildOrbitIcons();

  // Load the same source-resolution assets as the home parallax. They stay in
  // the browser cache, so the menu reuses them rather than downloading twice.
  layerImages.forEach((image) => warmLayer(image));
  warmIcons();
  if (reducedMotion) layoutReducedMotionIcons();
  else startOrbit();

  later(() => setStatus('Готовим игры…'), 760);
  later(() => setStatus('Собираем игровое пространство…'), 1500);
  later(() => setStatus('Почти готово…'), 2600);
  later(() => setStatus('Ещё немного…'), 5200);

  window.addEventListener('app:menu-ready', finish, { once: true });
  window.addEventListener('pagehide', stopOrbit, { once: true });

  const banned = document.getElementById('banned-screen');
  if (banned) {
    const bannedObserver = new MutationObserver(() => {
      if (!banned.classList.contains('hidden')) {
        bannedObserver.disconnect();
        finish();
      }
    });
    bannedObserver.observe(banned, { attributes: true, attributeFilter: ['class'] });
  }

  // If another startup path has already unlocked the shell before this script
  // attaches, do not leave the overlay stranded.
  queueMicrotask(() => {
    const root = document.documentElement;
    const menu = document.getElementById('menu-container');
    if (root.classList.contains('app-ui-ready') && menu && !menu.classList.contains('hidden')) finish();
  });

  window.__gamehubBoot = Object.freeze({
    finish,
    fail,
    portalUrl: PORTAL_URL,
    iconCount: GAME_ICONS.length,
  });
})();
