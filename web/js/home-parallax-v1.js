(() => {
  'use strict';

  const TARGET_USER_ID = '1288379477';
  const ASSET_VERSION = '4';
  const ASSET_ROOT = 'web/assets/home-parallax-v1';
  const HQ_BASE_ROOT = 'web/assets/home-parallax-hq/base';
  const HQ_BASE_PART_COUNT = 13;
  const MENU_ID = 'menu-container';
  const ROOT_CLASS = 'home-parallax-v1';

  const FULL_LAYERS = [
    { key: 'base', file: 'base.avif', depth: 0.008, scale: 1.045, opacity: 1 },
    { key: 'clouds', file: 'clouds.avif', depth: -0.022, scale: 1.055, opacity: 0.72 },
    { key: 'mountains', file: 'mountains.avif', depth: -0.040, scale: 1.060, opacity: 0.80 },
    { key: 'city', file: 'city.avif', depth: -0.065, scale: 1.070, opacity: 0.94 },
    { key: 'olives', file: 'olives.avif', depth: -0.100, scale: 1.085, opacity: 0.90 },
    { key: 'foreground', file: 'foreground.avif', depth: -0.135, scale: 1.105, opacity: 0.96 },
  ];

  const LITE_LAYERS = [
    { key: 'base', file: 'base.avif', depth: 0, scale: 1.035, opacity: 1 },
    { key: 'mountains', file: 'mountains.avif', depth: -0.025, scale: 1.045, opacity: 0.78 },
    { key: 'city', file: 'city.avif', depth: -0.046, scale: 1.055, opacity: 0.92 },
  ];

  let scene = null;
  let menu = null;
  let layers = [];
  let currentScroll = 0;
  let targetScroll = 0;
  let rafId = 0;
  let active = false;
  let reducedMotion = false;
  let liteMode = false;
  let visibilityObserver = null;
  let hqBaseObjectUrl = '';

  function getTelegramUserId() {
    const id = window.Telegram?.WebApp?.initDataUnsafe?.user?.id;
    return id == null ? '' : String(id);
  }

  function waitForTargetUser(timeoutMs = 2500) {
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

  function detectPerformanceTier() {
    const memory = Number(navigator.deviceMemory || 0);
    const cores = Number(navigator.hardwareConcurrency || 0);
    const saveData = Boolean(navigator.connection?.saveData);
    reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches === true;

    const weakCpu = cores > 0 && cores <= 4;
    const weakMemory = memory > 0 && memory <= 3;
    liteMode = saveData || reducedMotion || weakCpu || weakMemory;
  }

  function partName(index) {
    return `${String(index).padStart(2, '0')}.part`;
  }

  async function loadHqBaseObjectUrl() {
    try {
      const requests = Array.from({ length: HQ_BASE_PART_COUNT }, (_, index) =>
        fetch(`${HQ_BASE_ROOT}/${partName(index)}?v=${ASSET_VERSION}`, {
          cache: 'force-cache',
          credentials: 'same-origin',
        }).then((response) => {
          if (!response.ok) throw new Error(`HQ parallax part ${index} returned ${response.status}`);
          return response.text();
        })
      );

      const base64 = (await Promise.all(requests)).join('').replace(/\s+/g, '');
      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);

      const blob = new Blob([bytes], { type: 'image/webp' });
      hqBaseObjectUrl = URL.createObjectURL(blob);
      return hqBaseObjectUrl;
    } catch (error) {
      console.warn('[home-parallax] HQ base fallback:', error);
      return '';
    }
  }

  function createLayer(config, index, hqBaseUrl) {
    const image = document.createElement('img');
    image.className = `home-parallax-v1__layer home-parallax-v1__layer--${config.key}`;
    image.alt = '';
    image.setAttribute('aria-hidden', 'true');
    image.decoding = 'async';
    image.loading = index === 0 ? 'eager' : 'lazy';
    image.fetchPriority = index === 0 ? 'high' : 'low';
    image.draggable = false;
    image.style.opacity = String(config.opacity);
    image.src = config.key === 'base' && hqBaseUrl
      ? hqBaseUrl
      : `${ASSET_ROOT}/${config.file}?v=${ASSET_VERSION}`;
    return image;
  }

  function buildScene(hqBaseUrl) {
    menu = document.getElementById(MENU_ID);
    if (!menu || document.querySelector('.home-parallax-v1__scene')) return false;

    detectPerformanceTier();

    scene = document.createElement('div');
    scene.className = 'home-parallax-v1__scene';
    scene.dataset.quality = liteMode ? 'lite' : 'full';
    scene.dataset.baseQuality = hqBaseUrl ? 'source' : 'fallback';
    scene.setAttribute('aria-hidden', 'true');

    const configs = liteMode ? LITE_LAYERS : FULL_LAYERS;
    layers = configs.map((config, index) => {
      const element = createLayer(config, index, hqBaseUrl);
      scene.appendChild(element);
      return { element, ...config };
    });

    const veil = document.createElement('div');
    veil.className = 'home-parallax-v1__veil';
    scene.appendChild(veil);

    document.body.prepend(scene);
    document.documentElement.classList.add(ROOT_CLASS);
    if (liteMode) document.documentElement.classList.add(`${ROOT_CLASS}-lite`);

    const base = layers[0]?.element;
    const reveal = () => scene?.classList.add('is-ready');
    if (base?.decode) base.decode().then(reveal, reveal);
    else if (base) {
      base.addEventListener('load', reveal, { once: true });
      window.setTimeout(reveal, 700);
    } else {
      reveal();
    }

    syncVisibility();
    return true;
  }

  function menuIsVisible() {
    return Boolean(
      menu &&
      scene &&
      !menu.classList.contains('hidden') &&
      document.body.dataset.mode !== 'admin'
    );
  }

  function syncVisibility() {
    const shouldBeActive = menuIsVisible();
    if (active === shouldBeActive) return;

    active = shouldBeActive;
    scene?.toggleAttribute('hidden', !active);
    document.documentElement.classList.toggle(`${ROOT_CLASS}-active`, active);

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

    const maxScroll = Math.max(1, document.documentElement.scrollHeight - innerHeight);
    const clamped = Math.min(Math.max(currentScroll, 0), maxScroll);
    const scrollRange = Math.min(clamped, 1400);

    for (const layer of layers) {
      const y = reducedMotion ? 0 : Math.max(-120, Math.min(42, scrollRange * layer.depth));
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
    if (currentScroll !== targetScroll) {
      rafId = requestAnimationFrame(animateTowardTarget);
    }
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

    window.addEventListener('pagehide', () => {
      if (hqBaseObjectUrl) {
        URL.revokeObjectURL(hqBaseObjectUrl);
        hqBaseObjectUrl = '';
      }
    }, { once: true });
  }

  async function init() {
    const allowed = await waitForTargetUser();
    if (!allowed) return;

    const hqBaseUrl = await loadHqBaseObjectUrl();
    if (!buildScene(hqBaseUrl)) {
      if (hqBaseObjectUrl) URL.revokeObjectURL(hqBaseObjectUrl);
      return;
    }

    bindLifecycle();
    window.__homeParallaxV1 = Object.freeze({
      userId: TARGET_USER_ID,
      quality: liteMode ? 'lite' : 'full',
      baseQuality: hqBaseUrl ? 'source-941x1672-webp' : 'fallback',
      layerCount: layers.length,
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
