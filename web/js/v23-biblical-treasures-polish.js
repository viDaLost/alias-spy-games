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
    if (!link) {
      link = document.createElement('link');
      link.id = STYLE_ID;
      link.rel = 'stylesheet';
      document.head.appendChild(link);
    }
    if (link.getAttribute('href') !== href) link.href = href;
  }

  function patchBoard(board) {
    const wrap = board?.closest('.bmt-board-wrap');
    if (!wrap) return;
    board.classList.add('bmt-v23-board');
    wrap.classList.add('bmt-v23-board-wrap');
    wrap.dataset.boardShape = board.dataset.shape || 'rect';
    wrap.querySelector(':scope > .bmt-v23-boundary')?.remove();
    board.querySelector(':scope > .bmt-v23-boundary')?.remove();
  }

  function labelledRating(card) {
    const stars = card.querySelector('.bmt-result-stars, .bmt-v22-result-stars');
    const label = stars?.getAttribute('aria-label') || '';
    const hit = label.match(/([1-3])\s*(?:из|\/|of)\s*3/i);
    return Number(hit?.[1] || 0);
  }

  function visibleRating(card) {
    const stars = card.querySelector('.bmt-result-stars, .bmt-v22-result-stars');
    if (!stars) return 0;
    const on = stars.querySelectorAll('.is-on, .active, [data-on="true"], [aria-checked="true"]').length;
    return on >= 1 && on <= 3 ? on : 0;
  }

  function resultRating(card) {
    const explicit = Number(card.dataset.resultStars || card.dataset.rating || card.dataset.stars || 0);
    if (explicit >= 1 && explicit <= 3) return explicit;
    const labelled = labelledRating(card);
    if (labelled) return labelled;
    const visible = visibleRating(card);
    if (visible) return visible;
    return 1;
  }

  function patchWinResult(card) {
    if (!card?.classList.contains('is-win')) return;
    const hero = card.querySelector('.bmt-v22-win-hero');
    if (!hero) return;
    const rating = resultRating(card);
    if (card.dataset.v23Result === '1' && card.dataset.v23Rating === String(rating)) return;

    card.dataset.resultStars = String(rating);
    card.dataset.v23Result = '1';
    card.dataset.v23Rating = String(rating);
    hero.classList.add('bmt-v23-win-hero');
    hero.removeAttribute('aria-hidden');
    hero.setAttribute('role', 'img');
    hero.setAttribute('aria-label', `Результат уровня: ${rating} из 3 звёзд`);
    hero.innerHTML = `<img class="bmt-v23-win-art" src="${HERO_ASSETS[rating]}" alt="${rating} из 3 звёзд" decoding="async" loading="eager" fetchpriority="high" draggable="false">`;
    card.querySelector('.bmt-v22-result-stars, .bmt-result-stars')?.setAttribute('aria-hidden', 'true');
  }

  function patchAll() {
    scheduled = false;
    ensureStyle();
    if (document.body?.dataset?.currentGame !== 'biblical-match-three') return;
    document.querySelectorAll('.bmt-board').forEach(patchBoard);
    document.querySelectorAll('.bmt-result-card.is-win').forEach(patchWinResult);
  }

  function schedulePatch() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(patchAll);
  }

  function start() {
    ensureStyle();
    schedulePatch();
    new MutationObserver(schedulePatch).observe(document.getElementById('game-container') || document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['class', 'aria-label', 'data-result-stars', 'data-rating', 'data-stars', 'data-shape'],
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
