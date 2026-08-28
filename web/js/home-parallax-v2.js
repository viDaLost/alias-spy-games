(() => {
  'use strict';

  const TARGET_USER_ID = '1288379477';
  const MENU_ID = 'menu-container';
  const ROOT_CLASS = 'home-parallax-v2';
  const ASSET_ROOT = 'web/assets/home-parallax-v2';
  const ASSET_VERSION = '1';

  const LAYERS = [
    { key: 'base',       file: '01-base.webp',       depth:  0.004, scale: 1.025, opacity: 1.00 },
    { key: 'clouds',     file: '02-clouds.webp',     depth: -0.018, scale: 1.035, opacity: 0.80 },
    { key: 'mountains',  file: '03-mountains.webp',  depth: -0.035, scale: 1.045, opacity: 0.82 },
    { key: 'city',       file: '04-city.webp',       depth: -0.055, scale: 1.055, opacity: 0.82 },
    { key: 'olives',     file: '05-olives.webp',     depth: -0.085, scale: 1.075, opacity: 0.92 },
    { key: 'foreground', file: '06-foreground.webp', depth: -0.115, scale: 1.095, opacity: 0.98 },
  ];

  let menu = null;
  let scene = null;
  let renderedLayers = [];
  let observer = null;
  let rafId = 0;
  let active = false;
  let targetScroll = 0;
  let currentScroll = 0;
  let reducedMotion = false;

  function telegramUserId() {
    const id = window.Telegram?.WebApp?.initDataUnsafe?.user?.id;
    return id == null ? '' : String(id);
  }

  function waitForTargetUser(timeoutMs = 2500) {
    return new Promise((resolve) => {
      const started = performance.now();
      const check = () => {
        const id = telegramUserId();
        if (id) {
          resolve(id === TARGET_USER_ID);
          return;
        }
        if (performance.now() - started >= timeoutMs) {
          resolve(false);
          return;
        }
        window.setTimeout(check, 80);
      };
      check();
    });
  }

  function createImageLayer(config, index) {
    const img = document.createElement('img');
    img.className = `home-parallax-v2__layer home-parallax-v2__layer--${config.key}`;
    img.alt = '';
    img.setAttribute('aria-hidden', 'true');
    img.decoding = 'async';
    img.loading = index === 0 ? 'eager' : 'lazy';
    img.fetchPriority = index === 0 ? 'high' : 'low';
    img.draggable = false;
    img.style.opacity = String(config.opacity);
    // src is assigned only after the Telegram ID gate succeeds.
    img.src = `${ASSET_ROOT}/${config.file}?v=${ASSET_VERSION}`;
    return img;
  }

  function buildScene() {
    menu = document.getElementById(MENU_ID);
    if (!menu || document.querySelector('.home-parallax-v2__scene')) return false;

    reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches === true;

    scene = document.createElement('div');
    scene.className = 'home-parallax-v2__scene';
    scene.setAttribute('aria-hidden', 'true');

    renderedLayers = LAYERS.map((config, index) => {
      const element = createImageLayer(config, index);
      scene.appendChild(element);
      return { ...config, element };
    });

    document.body.prepend(scene);
    document.documentElement.classList.add(ROOT_CLASS);

    const base = renderedLayers[0]?.element;
    const reveal = () => scene?.classList.add('is-ready');
    if (base?.decode) base.decode().then(reveal, reveal);
    else if (base) {
      base.addEventListener('load', reveal, { once: true });
      window.setTimeout(reveal, 800);
    } else reveal();

    syncVisibility();
    return true;
  }

  function menuVisible() {
    return Boolean(
      menu &&
      scene &&
      !menu.classList.contains('hidden') &&
      document.body.dataset.mode !== 'admin'
    );
  }

  function stopAnimation() {
    if (!rafId) return;
    cancelAnimationFrame(rafId);
    rafId = 0;
  }

  function render() {
    if (!active || !scene) return;
    const maxScroll = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    const scroll = Math.min(Math.max(currentScroll, 0), maxScroll, 1600);

    for (const layer of renderedLayers) {
      const y = reducedMotion ? 0 : Math.max(-180, Math.min(55, scroll * layer.depth));
      layer.element.style.transform = `translate3d(0, ${y.toFixed(2)}px, 0) scale(${layer.scale})`;
    }
  }

  function animate() {
    rafId = 0;
    if (!active || reducedMotion) return;

    const delta = targetScroll - currentScroll;
    currentScroll += delta * 0.2;
    if (Math.abs(delta) < 0.2) currentScroll = targetScroll;
    render();

    if (currentScroll !== targetScroll) rafId = requestAnimationFrame(animate);
  }

  function onScroll() {
    if (!active || reducedMotion) return;
    targetScroll = window.scrollY || 0;
    if (!rafId) rafId = requestAnimationFrame(animate);
  }

  function syncVisibility() {
    const next = menuVisible();
    if (next === active) return;
    active = next;
    scene?.toggleAttribute('hidden', !active);
    document.documentElement.classList.toggle(`${ROOT_CLASS}-active`, active);

    if (active) {
      targetScroll = window.scrollY || 0;
      currentScroll = targetScroll;
      render();
    } else stopAnimation();
  }

  function bindLifecycle() {
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', () => {
      if (!active) return;
      targetScroll = window.scrollY || 0;
      currentScroll = targetScroll;
      render();
    }, { passive: true });

    observer = new MutationObserver(syncVisibility);
    observer.observe(menu, { attributes: true, attributeFilter: ['class'] });
    observer.observe(document.body, { attributes: true, attributeFilter: ['data-mode'] });

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) stopAnimation();
      else syncVisibility();
    });
  }

  async function init() {
    if (!(await waitForTargetUser())) return;
    if (!buildScene()) return;
    bindLifecycle();
    window.__homeParallaxV2 = Object.freeze({
      userId: TARGET_USER_ID,
      layerCount: renderedLayers.length,
      source: 'direct-full-resolution-assets',
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else init();
})();
