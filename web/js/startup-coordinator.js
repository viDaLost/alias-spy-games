(() => {
  const root = document.documentElement;
  const isAndroidApk = window.__ANDROID_APK__ === true;
  const ICON_VERSION = '1';
  const ICON_NAMES = ['alias', 'idea', 'character', 'describe', 'spy', 'quartet', 'words', 'search', 'sacred', 'ark'];
  const ICON_URLS = ICON_NAMES.map((name) => `web/assets/icons/${name}.webp?v=${ICON_VERSION}`);
  let menuReady = false;
  let warmupRunning = false;

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
        Promise.resolve(typeof image.decode === 'function' ? image.decode().catch(() => {}) : null).finally(resolve);
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

  const iconWarmup = isAndroidApk
    ? Promise.resolve().then(() => root.classList.add('app-icons-ready'))
    : Promise.all(ICON_URLS.map(preloadIcon)).then(() => root.classList.add('app-icons-ready'));
  window.__appMenuIconsReady = iconWarmup;

  function forceEagerImages(scope = document) {
    if (isAndroidApk) return;
    scope.querySelectorAll?.('.game-card__img, .home-continue__icon img').forEach((img) => {
      img.loading = 'eager';
      img.decoding = 'async';
      try { img.fetchPriority = 'high'; } catch {}
    });
  }

  async function decodeRenderedMenuImages() {
    if (isAndroidApk) return;
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

  async function waitForDashboard(maxMs = isAndroidApk ? 250 : 800) {
    const started = performance.now();
    while (performance.now() - started < maxMs) {
      if (dashboardReady()) return true;
      await wait(32);
    }
    return dashboardReady();
  }

  function animateMenu(menu) {
    menu.classList.remove('app-menu-enter');
    void menu.offsetWidth;
    menu.classList.add('app-menu-enter');
    setTimeout(() => menu.classList.remove('app-menu-enter'), 420);
  }

  function unlockShell() {
    root.classList.remove('app-booting', 'app-menu-preparing');
    root.classList.add('app-ui-ready');
  }

  function warmVisibleMenu(menu) {
    if (warmupRunning) return;
    warmupRunning = true;
    Promise.resolve().then(async () => {
      forceEagerImages(menu);
      if (!isAndroidApk) await timeout(iconWarmup, 1200);
      await waitForDashboard();
      await decodeRenderedMenuImages();
    }).catch((error) => {
      console.warn('[startup] Non-blocking menu warmup failed:', error);
    }).finally(() => {
      warmupRunning = false;
    });
  }

  function revealMenu(menu) {
    unlockShell();
    if (!menuReady) {
      menuReady = true;
      animateMenu(menu);
      window.dispatchEvent(new CustomEvent('app:menu-ready'));
    }
    warmVisibleMenu(menu);
  }

  function revealBannedIfNeeded() {
    const banned = document.getElementById('banned-screen');
    if (!banned || banned.classList.contains('hidden')) return false;
    menuReady = false;
    unlockShell();
    return true;
  }

  function evaluate() {
    if (revealBannedIfNeeded()) return;
    const menu = document.getElementById('menu-container');
    if (!menu) return;
    const visibleMenuState = !menu.classList.contains('hidden') && !document.body?.dataset.mode;
    if (visibleMenuState) {
      revealMenu(menu);
      return;
    }
    menuReady = false;
  }

  const menu = document.getElementById('menu-container');
  const banned = document.getElementById('banned-screen');
  const body = document.body;
  const observers = [];

  if (menu) {
    const observer = new MutationObserver(evaluate);
    observer.observe(menu, { attributes: true, attributeFilter: ['class'] });
    observers.push(observer);
  }
  if (banned) {
    const observer = new MutationObserver(evaluate);
    observer.observe(banned, { attributes: true, attributeFilter: ['class'] });
    observers.push(observer);
  }
  if (body) {
    const observer = new MutationObserver(evaluate);
    observer.observe(body, { attributes: true, attributeFilter: ['data-mode'] });
    observers.push(observer);
  }

  window.addEventListener('app:home-dashboard-ready', evaluate);
  window.addEventListener('app:home-controls-ready', evaluate);
  window.addEventListener('pageshow', evaluate);
  window.addEventListener('pagehide', () => observers.forEach((observer) => observer.disconnect()), { once: true });

  // Short polling closes the gap between showMenu() removing the loader and an
  // iOS WebView delivering MutationObserver callbacks. It stops as soon as the
  // access gate has resolved, so there is no steady-state polling cost.
  const unlockPoll = window.setInterval(() => {
    const currentLoader = document.getElementById('main-loader');
    if (currentLoader || document.body?.dataset.mode) return;
    if (revealBannedIfNeeded()) {
      window.clearInterval(unlockPoll);
      return;
    }
    const currentMenu = document.getElementById('menu-container');
    if (!currentMenu) return;
    currentMenu.classList.remove('hidden');
    revealMenu(currentMenu);
    window.clearInterval(unlockPoll);
  }, 80);
  window.setTimeout(() => window.clearInterval(unlockPoll), 12000);

  // Absolute fail-open watchdog: backend-bridge already gives access verification
  // a 5s deadline. If the shell is still locked after that deadline, never leave
  // Telegram/iOS on a blank or untouchable screen.
  window.setTimeout(() => {
    if (!root.classList.contains('app-booting') && !root.classList.contains('app-menu-preparing')) return;
    if (revealBannedIfNeeded()) return;
    if (document.body?.dataset.mode) return;

    const currentMenu = document.getElementById('menu-container');
    if (!currentMenu) return;
    try { window.renderMainMenu?.(); } catch {}
    document.getElementById('main-loader')?.remove();
    currentMenu.classList.remove('hidden');
    revealMenu(currentMenu);
  }, 6500);

  queueMicrotask(evaluate);
})();
