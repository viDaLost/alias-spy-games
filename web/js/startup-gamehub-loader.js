(() => {
  'use strict';

  const ASSET_VERSION = '18';
  const ASSET_ROOT = 'web/assets/home-gamehub-parallax-v1';
  const MIN_VISIBLE_MS = 620;
  const EXIT_MS = 480;
  const startedAt = performance.now();

  const scene = document.getElementById('gamehub-boot-scene');
  if (!scene) return;

  const status = scene.querySelector('[data-gamehub-boot-status]');
  const title = scene.querySelector('[data-gamehub-boot-title]');
  const retry = scene.querySelector('[data-gamehub-boot-retry]');
  const layerImages = [...scene.querySelectorAll('[data-gamehub-layer-file]')];
  const iconImages = [...scene.querySelectorAll('.gamehub-boot__icon')];

  let finished = false;
  let failed = false;
  let statusTimer = 0;
  const timers = new Set();

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
      new Promise((resolve) => window.setTimeout(resolve, 700)),
    ]).finally(() => scene.classList.add('is-icons-ready'));
  }

  function removeScene() {
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

  // Load the same source-resolution assets as the home parallax. They stay in
  // the browser cache, so the menu reuses them rather than downloading twice.
  layerImages.forEach((image) => warmLayer(image));
  warmIcons();

  later(() => setStatus('Готовим игры…'), 760);
  later(() => setStatus('Собираем игровое пространство…'), 1500);
  later(() => setStatus('Почти готово…'), 2600);
  later(() => setStatus('Ещё немного…'), 5200);

  window.addEventListener('app:menu-ready', finish, { once: true });

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

  window.__gamehubBoot = Object.freeze({ finish, fail });
})();
