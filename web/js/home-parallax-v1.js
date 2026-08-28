(() => {
  'use strict';

  const TARGET_USER_ID = '1288379477';
  const ASSET_VERSION = '5';
  const HQ_BASE_ROOT = 'web/assets/home-parallax-hq/base';
  const HQ_BASE_PART_COUNT = 13;
  const MENU_ID = 'menu-container';
  const ROOT_CLASS = 'home-parallax-v1';

  let scene = null;
  let menu = null;
  let baseLayer = null;
  let currentScroll = 0;
  let targetScroll = 0;
  let rafId = 0;
  let active = false;
  let reducedMotion = false;
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

  function partName(index) {
    return `${String(index).padStart(2, '0')}.part`;
  }

  async function loadHqBaseObjectUrl() {
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
  }

  function buildScene(hqBaseUrl) {
    menu = document.getElementById(MENU_ID);
    if (!menu || !hqBaseUrl || document.querySelector('.home-parallax-v1__scene')) return false;

    reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches === true;

    scene = document.createElement('div');
    scene.className = 'home-parallax-v1__scene home-parallax-v1__scene--hq';
    scene.dataset.quality = 'source';
    scene.dataset.baseQuality = 'source-941x1672-webp';
    scene.setAttribute('aria-hidden', 'true');

    baseLayer = document.createElement('img');
    baseLayer.className = 'home-parallax-v1__layer home-parallax-v1__layer--base home-parallax-v1__layer--source';
    baseLayer.alt = '';
    baseLayer.setAttribute('aria-hidden', 'true');
    baseLayer.decoding = 'async';
    baseLayer.loading = 'eager';
    baseLayer.fetchPriority = 'high';
    baseLayer.draggable = false;
    baseLayer.src = hqBaseUrl;
    scene.appendChild(baseLayer);

    const veil = document.createElement('div');
    veil.className = 'home-parallax-v1__veil';
    scene.appendChild(veil);

    document.body.prepend(scene);
    document.documentElement.classList.add(ROOT_CLASS, `${ROOT_CLASS}-source-hq`);

    const reveal = () => scene?.classList.add('is-ready');
    if (baseLayer.decode) baseLayer.decode().then(reveal, reveal);
    else {
      baseLayer.addEventListener('load', reveal, { once: true });
      window.setTimeout(reveal, 500);
    }

    syncVisibility();
    return true;
  }

  function menuIsVisible() {
    return Boolean(
      menu && scene && !menu.classList.contains('hidden') && document.body.dataset.mode !== 'admin'
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
    if (!active || !baseLayer) return;
    const scroll = Math.min(Math.max(currentScroll, 0), 1600);
    const y = reducedMotion ? 0 : Math.max(-34, Math.min(8, scroll * -0.022));
    baseLayer.style.transform = `translate3d(0, ${y.toFixed(2)}px, 0) scale(1.025)`;
  }

  function animateTowardTarget() {
    rafId = 0;
    if (!active || reducedMotion) return;

    const delta = targetScroll - currentScroll;
    currentScroll += delta * 0.20;
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

    window.addEventListener('pagehide', () => {
      if (hqBaseObjectUrl) URL.revokeObjectURL(hqBaseObjectUrl);
      hqBaseObjectUrl = '';
    }, { once: true });
  }

  async function init() {
    const allowed = await waitForTargetUser();
    if (!allowed) return;

    try {
      const hqBaseUrl = await loadHqBaseObjectUrl();
      if (!buildScene(hqBaseUrl)) return;
      bindLifecycle();
      window.__homeParallaxV1 = Object.freeze({
        userId: TARGET_USER_ID,
        quality: 'source-hq',
        sourceSize: '941x1672',
        layerCount: 1,
        lowResolutionLayers: 0,
      });
    } catch (error) {
      console.error('[home-parallax] source HQ load failed', error);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
