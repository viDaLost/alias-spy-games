(() => {
  const root = document.documentElement;
  const ICON_VERSION = '1';
  const ICON_NAMES = ['alias', 'idea', 'character', 'describe', 'spy', 'quartet', 'words', 'search', 'sacred', 'ark'];
  const ICON_URLS = ICON_NAMES.map((name) => `assets/icons/${name}.png?v=${ICON_VERSION}`);
  let revealToken = 0;
  let preparing = false;

  function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function timeout(promise, ms) {
    return Promise.race([promise, wait(ms)]);
  }

  function preloadIcon(src) {
    return new Promise((resolve) => {
      const image = new Image();
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        Promise.resolve(typeof image.decode === 'function' ? image.decode().catch(() => {}) : null)
          .finally(resolve);
      };
      image.decoding = 'async';
      image.loading = 'eager';
      image.fetchPriority = 'high';
      image.onload = finish;
      image.onerror = finish;
      image.src = src;
      if (image.complete) finish();
    });
  }

  const iconWarmup = Promise.all(ICON_URLS.map(preloadIcon)).then(() => {
    root.classList.add('app-icons-ready');
  });
  window.__appMenuIconsReady = iconWarmup;

  function forceEagerImages(scope = document) {
    scope.querySelectorAll?.('.game-card__img, .home-continue__icon img').forEach((img) => {
      img.loading = 'eager';
      img.decoding = 'async';
      try { img.fetchPriority = 'high'; } catch {}
    });
  }

  async function decodeRenderedMenuImages() {
    const menu = document.getElementById('menu-container');
    if (!menu) return;
    forceEagerImages(menu);
    const images = [...menu.querySelectorAll('.game-card__img, .home-continue__icon img')];
    await timeout(Promise.all(images.map(async (img) => {
      if (!img.complete) {
        await new Promise((resolve) => {
          const done = () => resolve();
          img.addEventListener('load', done, { once: true });
          img.addEventListener('error', done, { once: true });
        });
      }
      if (typeof img.decode === 'function') await img.decode().catch(() => {});
    })), 1200);
  }

  function dashboardReady() {
    const dashboard = document.getElementById('home-dashboard');
    return Boolean(dashboard && dashboard.dataset.contentReady === '1' && dashboard.dataset.controlsReady === '1');
  }

  async function waitForDashboard(maxMs = 1200) {
    const started = performance.now();
    while (performance.now() - started < maxMs) {
      if (dashboardReady()) return true;
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }
    return dashboardReady();
  }

  function animateMenu(menu) {
    menu.classList.remove('app-menu-enter');
    void menu.offsetWidth;
    menu.classList.add('app-menu-enter');
    setTimeout(() => menu.classList.remove('app-menu-enter'), 420);
  }

  async function prepareVisibleMenu() {
    const menu = document.getElementById('menu-container');
    if (!menu || menu.classList.contains('hidden') || document.body?.dataset.mode) return;
    const token = ++revealToken;
    preparing = true;
    root.classList.add('app-menu-preparing');

    forceEagerImages(menu);
    await timeout(iconWarmup, 3500);
    await waitForDashboard();
    await decodeRenderedMenuImages();
    if (token !== revealToken || menu.classList.contains('hidden') || document.body?.dataset.mode) return;

    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    if (token !== revealToken || menu.classList.contains('hidden') || document.body?.dataset.mode) return;

    root.classList.remove('app-booting', 'app-menu-preparing');
    root.classList.add('app-ui-ready');
    preparing = false;
    animateMenu(menu);
    window.dispatchEvent(new CustomEvent('app:menu-ready'));
  }

  function revealBannedIfNeeded() {
    const banned = document.getElementById('banned-screen');
    if (!banned || banned.classList.contains('hidden')) return false;
    ++revealToken;
    preparing = false;
    root.classList.remove('app-booting', 'app-menu-preparing');
    root.classList.add('app-ui-ready');
    return true;
  }

  function evaluate() {
    if (revealBannedIfNeeded()) return;
    const menu = document.getElementById('menu-container');
    if (!menu) return;
    if (!menu.classList.contains('hidden') && !document.body?.dataset.mode) {
      if (!preparing) prepareVisibleMenu();
    } else {
      ++revealToken;
      preparing = false;
      root.classList.remove('app-menu-preparing');
    }
  }

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType === 1) forceEagerImages(node);
      });
    }
    queueMicrotask(evaluate);
  });

  observer.observe(document.documentElement, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['class', 'data-mode', 'data-content-ready', 'data-controls-ready'],
  });

  window.addEventListener('app:home-dashboard-ready', evaluate);
  window.addEventListener('app:home-controls-ready', evaluate);
  window.addEventListener('pageshow', evaluate);
  queueMicrotask(evaluate);
})();
