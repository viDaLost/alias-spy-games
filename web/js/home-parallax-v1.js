(() => {
  'use strict';

  const TARGET_USER_ID = '1288379477';
  const ASSET_VERSION = '11';
  const ASSET_ROOT = 'web/assets/home-parallax-v2';
  const MENU_ID = 'menu-container';
  const ROOT_CLASS = 'home-parallax-v2';

  const LAYERS = [
    { key: 'base', file: '01-base.PNG', depth: 0.000, scale: 1.025, opacity: 1.00 },
    { key: 'clouds', file: '02-clouds.PNG', depth: -0.018, scale: 1.035, opacity: 0.78 },
    { key: 'mountains', file: '03-mountains.PNG', depth: -0.035, scale: 1.045, opacity: 1.00 },
    { key: 'city', file: '04-city.PNG', depth: -0.058, scale: 1.055, opacity: 1.00 },
    { key: 'olives', file: '05-olives.PNG', depth: -0.090, scale: 1.070, opacity: 1.00 },
    { key: 'foreground', file: '06-foreground.PNG', depth: -0.125, scale: 1.085, opacity: 1.00 },
  ];

  let scene = null;
  let menu = null;
  let layers = [];
  let currentScroll = 0;
  let targetScroll = 0;
  let rafId = 0;
  let active = false;
  let reducedMotion = false;
  let visibilityObserver = null;

  function getTelegramUserId() {
    const id = window.Telegram?.WebApp?.initDataUnsafe?.user?.id;
    return id == null ? '' : String(id);
  }

  function waitForTargetUser(timeoutMs = 3000) {
    return new Promise((resolve) => {
      const startedAt = performance.now();
      const check = () => {
        const userId = getTelegramUserId();
        if (userId) {
          resolve(userId === TARGET_USER_ID);
          return;
        }
        if (performance.now() - startedAt >= timeoutMs) {
          resolve(false);
          return;
        }
        window.setTimeout(check, 100);
      };
      check();
    });
  }

  function createLayer(config, index) {
    const image = document.createElement('img');
    image.className = `home-parallax-v2__layer home-parallax-v2__layer--${config.key}`;
    image.alt = '';
    image.setAttribute('aria-hidden', 'true');
    image.decoding = 'async';
    image.loading = 'eager';
    image.fetchPriority = index === 0 ? 'high' : 'auto';
    image.draggable = false;
    image.style.opacity = String(config.opacity);
    image.src = `${ASSET_ROOT}/${config.file}?v=${ASSET_VERSION}`;
    return image;
  }

  function buildScene() {
    menu = document.getElementById(MENU_ID);
    if (!menu || document.querySelector('.home-parallax-v2__scene')) return false;

    reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches === true;

    scene = document.createElement('div');
    scene.className = 'home-parallax-v2__scene';
    scene.dataset.quality = 'source-resolution';
    scene.setAttribute('aria-hidden', 'true');

    layers = LAYERS.map((config, index) => {
      const element = createLayer(config, index);
      scene.appendChild(element);
      return { ...config, element };
    });

    document.body.prepend(scene);
    document.documentElement.classList.add(ROOT_CLASS);

    const base = layers[0]?.element;
    const reveal = () => scene?.classList.add('is-ready');
    if (base?.decode) base.decode().then(reveal, reveal);
    else if (base) {
      base.addEventListener('load', reveal, { once: true });
      window.setTimeout(reveal, 650);
    } else {
      reveal();
    }

    syncVisibility();
    return true;
  }

  function menuIsVisible() {
    return Boolean(menu && scene && !menu.classList.contains('hidden') && document.body.dataset.mode !== 'admin');
  }

  function syncVisibility() {
    const shouldBeActive = menuIsVisible();
    if (active === shouldBeActive) return;

    active = shouldBeActive;
    scene?.toggleAttribute('hidden', !active);
    document.documentElement.classList.toggle(`${ROOT_CLASS}-active`, active);

    for (const layer of layers) {
      layer.element.style.willChange = active && !reducedMotion ? 'transform' : 'auto';
    }

    if (active) {
      targetScroll = window.scrollY || 0;
      currentScroll = targetScroll;
      renderFrame();
    } else {
      stopAnimation();
    }
  }

  function stopAnimation() {
    if (!rafId) return;
    cancelAnimationFrame(rafId);
    rafId = 0;
  }

  function renderFrame() {
    if (!active || !scene) return;
    const scroll = Math.min(Math.max(currentScroll, 0), 1500);

    for (const layer of layers) {
      const y = reducedMotion ? 0 : Math.max(-150, Math.min(30, scroll * layer.depth));
      layer.element.style.transform = `translate3d(0, ${y.toFixed(2)}px, 0) scale(${layer.scale})`;
    }
  }

  function animateTowardTarget() {
    rafId = 0;
    if (!active || reducedMotion) return;

    const delta = targetScroll - currentScroll;
    currentScroll += delta * 0.18;
    if (Math.abs(delta) < 0.2) currentScroll = targetScroll;
    renderFrame();

    if (currentScroll !== targetScroll) rafId = requestAnimationFrame(animateTowardTarget);
  }

  function onScroll() {
    if (!active || reducedMotion) return;
    targetScroll = window.scrollY || 0;
    if (!rafId) rafId = requestAnimationFrame(animateTowardTarget);
  }

  function onResize() {
    if (!active) return;
    targetScroll = window.scrollY || 0;
    currentScroll = targetScroll;
    renderFrame();
  }

  function bindLifecycle() {
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onResize, { passive: true });

    visibilityObserver = new MutationObserver(syncVisibility);
    visibilityObserver.observe(menu, { attributes: true, attributeFilter: ['class'] });
    visibilityObserver.observe(document.body, { attributes: true, attributeFilter: ['data-mode'] });

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) stopAnimation();
      else {
        syncVisibility();
        onResize();
      }
    });
  }

  async function init() {
    const allowed = await waitForTargetUser();
    if (!allowed) return;
    if (!buildScene()) return;

    bindLifecycle();
    window.__homeParallaxV2 = Object.freeze({
      userId: TARGET_USER_ID,
      quality: 'source-resolution-png',
      layerCount: layers.length,
      runtimeAssembly: false,
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
