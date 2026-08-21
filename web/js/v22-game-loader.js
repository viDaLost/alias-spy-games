(() => {
  'use strict';
  const VERSION = '40';
  const GUARD = `web/js/v22-legacy-tutorial-guard.js?v=${VERSION}`;
  const POLISH = `web/js/v22-game-polish.js?v=${VERSION}`;
  const V23 = `web/js/v23-biblical-treasures-polish.js?v=${VERSION}`;
  const V24 = `web/js/v24-biblical-treasures-board.js?v=${VERSION}`;
  const HOTFIX = `web/js/v29-biblical-treasures-hotfix.js?v=${VERSION}`;
  const SPECIAL_ART = 'web/js/v36-biblical-treasures-special-art.js?v=36';
  const LAMP_SWIPE = 'web/js/v37-biblical-treasures-lamp-swipe.js?v=37';
  const EXPERIENCE = 'web/js/v38-biblical-treasures-experience.js?v=39';
  let loading = false;

  function appendScript(src, marker) {
    return new Promise((resolve, reject) => {
      if (document.querySelector(`script[data-${marker}]`)) { resolve(); return; }
      const script = document.createElement('script');
      script.src = src;
      script.async = false;
      script.dataset[marker] = '1';
      script.onload = resolve;
      script.onerror = () => { script.remove(); reject(new Error(`Failed to load ${src}`)); };
      document.head.appendChild(script);
    });
  }

  async function load() {
    if (loading) return;
    if (document.body?.dataset?.currentGame !== 'biblical-match-three') return;
    loading = true;
    try {
      await appendScript(GUARD, 'v22TutorialGuard');
      if (!window.__bmtV22GamePolishInstalled) await appendScript(POLISH, 'v22GamePolish');
      if (!window.__bmtV24BoardInstalled) await appendScript(V24, 'v24BiblicalTreasuresBoard');
      if (!window.__bmtV23PolishInstalled) await appendScript(V23, 'v23BiblicalTreasuresPolish');
      if (!window.__bmtV31HotfixInstalled) await appendScript(HOTFIX, 'v31BiblicalTreasuresHotfix');
      if (!window.__bmtV36SpecialArtInstalled) await appendScript(SPECIAL_ART, 'v36BiblicalTreasuresSpecialArt');
      if (!window.__bmtV37LampSwipeInstalled) await appendScript(LAMP_SWIPE, 'v37BiblicalTreasuresLampSwipe');
      if (!window.__bmtV39ExperienceInstalled) await appendScript(EXPERIENCE, 'v39BiblicalTreasuresExperience');
    } catch (error) {
      console.error('[Biblical Treasures V38]', error);
    } finally {
      loading = false;
    }
  }

  function start() {
    load();
    new MutationObserver(load).observe(document.body, { attributes: true, attributeFilter: ['data-current-game'] });
    document.addEventListener('click', (event) => {
      if (event.target?.closest?.('#biblical-match-three-card')) window.setTimeout(load, 0);
    }, true);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
