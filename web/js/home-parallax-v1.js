(() => {
  'use strict';

  const TARGET_USER_ID = '1288379477';
  const ASSET_VERSION = '17';
  const ASSET_ROOT = 'web/assets/home-gamehub-parallax-v1';
  const MENU_ID = 'menu-container';
  const ROOT_CLASS = 'home-gamehub-parallax';

  // GitHub mobile upload preserved four leading spaces in these filenames.
  // Reference the exact binary names to keep the original PNGs untouched.
  // Foreground pedestal layer remains intentionally omitted from rendering.
  const LAYERS = [
    { key: 'base',         file: '    01-gamehub-base.PNG',   depthY:  0.0015, depthX:  0.0000, scale: 1.000, opacity: 1.00, offsetY:  0 },
    { key: 'atmosphere',   file: '    02-atmosphere.PNG',     depthY: -0.0055, depthX:  0.0012, scale: 1.004, opacity: 0.78, offsetY: -2 },
    { key: 'architecture', file: '    03-architecture.PNG',   depthY: -0.0110, depthX: -0.0018, scale: 1.006, opacity: 0.94, offsetY:  2 },
    { key: 'game-icons',   file: '    04-game-icons.PNG',     depthY: -0.0160, depthX:  0.0018, scale: 1.000, opacity: 1.00, offsetY: -8 },
    { key: 'game-library', file: '    05-game-library.PNG',   depthY: -0.0210, depthX: -0.0020, scale: 1.005, opacity: 1.00, offsetY: 10 },
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

  function assetUrl(file) {
    return `${ASSET_ROOT}/${encodeURIComponent(file).replace(/%2F/g, '/')}?v=${ASSET_VERSION}`;
  }

  function createLayer(config, index) {
    const image = document.createElement('img');
    image.className = `home-gamehub-parallax__layer home-gamehub-parallax__layer--${config.key}`;
    image.alt = '';
    image.setAttribute('aria-hidden', 'true');
    image.decoding = 'async';
    image.loading = 'eager';
    image.fetchPriority = index === 0 ? 'high' : index <= 2 ? 'auto' : 'low';
    image.draggable = false;
    image.style.opacity = String(config.opacity);
    image.src = assetUrl(config.file);
    return image;
  }

  function buildScene() {
    menu = document.getElementById(MENU_ID);
    if (!menu || document.querySelector('.home-gamehub-parallax__scene')) return false;

    reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches === true;

    scene = document.createElement('div');
    scene.className = 'home-gamehub-parallax__scene';
    scene.dataset.quality = 'source-resolution-png';
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
    if (base?.decode) {
      base.decode().then(reveal).catch(() => {
        base.addEventListener('load', reveal, { once: true });
        window.setTimeout(reveal, 900);
      });
    } else if (base) {
      base.addEventListener('load', reveal, { once: true });
      window.setTimeout(reveal, 900);
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

    const scroll = Math.min(Math.max(currentScroll, 0), 1600);

    for (const layer of layers) {
      const motionY = reducedMotion ? 0 : Math.max(-40, Math.min(12, scroll * layer.depthY));
      const motionX = reducedMotion ? 0 : Math.max(-4, Math.min(4, scroll * layer.depthX));
      const y = layer.offsetY + motionY;
      layer.element.style.transform = `translate3d(${motionX.toFixed(2)}px, ${y.toFixed(2)}px, 0) scale(${layer.scale})`;
    }
  }

  function animateTowardTarget() {
    rafId = 0;
    if (!active || reducedMotion) return;

    const delta = targetScroll - currentScroll;
    currentScroll += delta * 0.14;
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
  }

  async function init() {
    const allowed = await waitForTargetUser();
    if (!allowed) return;
    if (!buildScene()) return;

    bindLifecycle();
    window.__homeGamehubParallax = Object.freeze({
      userId: TARGET_USER_ID,
      assetRoot: ASSET_ROOT,
      assetVersion: ASSET_VERSION,
      layerCount: layers.length,
      foregroundEnabled: false,
      runtimeAssembly: false,
      fallback: false,
      sourceResolution: true,
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
