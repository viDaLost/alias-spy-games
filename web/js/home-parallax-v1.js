(() => {
  'use strict';

  const TARGET_USER_ID = '1288379477';
  const ASSET_VERSION = '12';
  const PRIMARY_ROOT = 'web/assets/home-gamehub-parallax-v1';
  const FALLBACK_ROOT = 'web/assets/home-parallax-v2';
  const MENU_ID = 'menu-container';
  const ROOT_CLASS = 'home-gamehub-parallax';

  // 1 base + 5 unique overlays. All primary assets share one vertical canvas.
  // The old source-resolution scene is used only as a temporary fallback until
  // the six new PNG files are uploaded to PRIMARY_ROOT.
  const LAYERS = [
    {
      key: 'base',
      file: '01-gamehub-base.PNG',
      fallback: '01-base.PNG',
      depthY: 0.004,
      depthX: 0.000,
      scale: 1.055,
      opacity: 1.00,
    },
    {
      key: 'atmosphere',
      file: '02-atmosphere.PNG',
      fallback: '02-clouds.PNG',
      depthY: -0.014,
      depthX: 0.004,
      scale: 1.070,
      opacity: 0.78,
    },
    {
      key: 'architecture',
      file: '03-architecture.PNG',
      fallback: '03-mountains.PNG',
      depthY: -0.033,
      depthX: -0.006,
      scale: 1.085,
      opacity: 0.96,
    },
    {
      key: 'game-icons',
      file: '04-game-icons.PNG',
      fallback: '04-city.PNG',
      depthY: -0.056,
      depthX: 0.009,
      scale: 1.100,
      opacity: 0.98,
    },
    {
      key: 'game-library',
      file: '05-game-library.PNG',
      fallback: '05-olives.PNG',
      depthY: -0.084,
      depthX: -0.012,
      scale: 1.115,
      opacity: 1.00,
    },
    {
      key: 'foreground',
      file: '06-foreground-platform.PNG',
      fallback: '06-foreground.PNG',
      depthY: -0.122,
      depthX: 0.014,
      scale: 1.135,
      opacity: 1.00,
    },
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

  function buildUrl(root, file) {
    return `${root}/${file}?v=${ASSET_VERSION}`;
  }

  function createLayer(config, index) {
    const image = document.createElement('img');
    image.className = `home-gamehub-parallax__layer home-gamehub-parallax__layer--${config.key}`;
    image.alt = '';
    image.setAttribute('aria-hidden', 'true');
    image.decoding = 'async';
    image.loading = index <= 1 ? 'eager' : 'lazy';
    image.fetchPriority = index === 0 ? 'high' : 'auto';
    image.draggable = false;
    image.style.opacity = String(config.opacity);
    image.dataset.source = 'gamehub';

    // This makes the code safe to publish before the user uploads the new art.
    // As soon as the new file exists, it wins automatically. No Blob/base64/part assembly.
    image.addEventListener('error', () => {
      if (image.dataset.source === 'fallback') return;
      image.dataset.source = 'fallback';
      image.src = buildUrl(FALLBACK_ROOT, config.fallback);
    });

    image.src = buildUrl(PRIMARY_ROOT, config.file);
    return image;
  }

  function buildScene() {
    menu = document.getElementById(MENU_ID);
    if (!menu || document.querySelector('.home-gamehub-parallax__scene')) return false;

    reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches === true;

    scene = document.createElement('div');
    scene.className = 'home-gamehub-parallax__scene';
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
    if (base) {
      base.addEventListener('load', reveal, { once: true });
      window.setTimeout(reveal, 1100);
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

    const scroll = Math.min(Math.max(currentScroll, 0), 1800);

    for (const layer of layers) {
      const y = reducedMotion ? 0 : Math.max(-170, Math.min(38, scroll * layer.depthY));
      const x = reducedMotion ? 0 : Math.max(-22, Math.min(22, scroll * layer.depthX));
      layer.element.style.transform = `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0) scale(${layer.scale})`;
    }
  }

  function animateTowardTarget() {
    rafId = 0;
    if (!active || reducedMotion) return;

    const delta = targetScroll - currentScroll;
    currentScroll += delta * 0.16;
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
      assetRoot: PRIMARY_ROOT,
      layerCount: layers.length,
      runtimeAssembly: false,
      sourceResolution: true,
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
