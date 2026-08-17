(() => {
  'use strict';
  if (window.__bmtV23PolishInstalled) return;
  window.__bmtV23PolishInstalled = true;
  const VERSION = '28';
  const STYLE_ID = 'bmt-v23-polish-style';
  const HERO_ASSETS = {
    1: `web/assets/biblical-match-three/completion-1-star-v28.webp?v=${VERSION}`,
    2: `web/assets/biblical-match-three/completion-2-stars-v28.webp?v=${VERSION}`,
    3: `web/assets/biblical-match-three/completion-3-stars-v28.avif?v=${VERSION}`,
  };
  let scheduled = false;

  function ensureStyle() {
    let link = document.getElementById(STYLE_ID);
    const href = `web/styles/biblical-match-three-v23-polish.css?v=${VERSION}`;
    if (!link) { link = document.createElement('link'); link.id = STYLE_ID; link.rel = 'stylesheet'; document.head.appendChild(link); }
    if (link.getAttribute('href') !== href) link.href = href;
  }
  function rating(card) {
    const explicit = Number(card.dataset.resultStars || card.dataset.rating || card.dataset.stars || 0);
    if (explicit >= 1 && explicit <= 3) return explicit;
    const stars = card.querySelector('.bmt-result-stars, .bmt-v22-result-stars');
    const label = stars?.getAttribute('aria-label') || '';
    const labelled = Number((label.match(/([1-3])\s*(?:из|\/|of)\s*3/i) || [])[1] || 0);
    if (labelled) return labelled;
    const visible = stars?.querySelectorAll('.is-on, .active, [data-on="true"], [aria-checked="true"]').length || 0;
    return visible >= 1 && visible <= 3 ? visible : 1;
  }
  function patchWin(card) {
    if (!card?.classList.contains('is-win')) return;
    const hero = card.querySelector('.bmt-v22-win-hero');
    if (!hero) return;
    const stars = rating(card);
    if (card.dataset.v23Result === '1' && card.dataset.v23Rating === String(stars)) return;
    card.dataset.resultStars = String(stars);
    card.dataset.v23Result = '1';
    card.dataset.v23Rating = String(stars);
    hero.classList.add('bmt-v23-win-hero');
    hero.removeAttribute('aria-hidden');
    hero.setAttribute('role', 'img');
    hero.setAttribute('aria-label', `Результат уровня: ${stars} из 3 звёзд`);
    hero.innerHTML = `<img class="bmt-v23-win-art" src="${HERO_ASSETS[stars]}" alt="${stars} из 3 звёзд" decoding="async" loading="eager" fetchpriority="high" draggable="false">`;
    card.querySelector('.bmt-v22-result-stars, .bmt-result-stars')?.setAttribute('aria-hidden', 'true');
  }
  function patchAll() {
    scheduled = false;
    ensureStyle();
    if (document.body?.dataset?.currentGame !== 'biblical-match-three') return;
    document.querySelectorAll('.bmt-result-card.is-win').forEach(patchWin);
  }
  function schedule() { if (!scheduled) { scheduled = true; requestAnimationFrame(patchAll); } }
  function start() {
    ensureStyle(); schedule();
    new MutationObserver(schedule).observe(document.getElementById('game-container') || document.body, {
      subtree:true, childList:true, attributes:true,
      attributeFilter:['class','aria-label','data-result-stars','data-rating','data-stars']
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once:true }); else start();
})();
