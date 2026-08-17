(() => {
  'use strict';
  if (window.__bmtV23PolishInstalled) return;
  window.__bmtV23PolishInstalled = true;

  const VERSION = '27';
  const STYLE_ID = 'bmt-v23-polish-style';
  const HERO_ASSETS = {
    1: `web/assets/biblical-match-three/completion-1-star-v26.avif?v=${VERSION}`,
    2: `web/assets/biblical-match-three/completion-2-stars-v26.avif?v=${VERSION}`,
    3: `web/assets/biblical-match-three/completion-3-stars-v26.avif?v=${VERSION}`,
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
    if (!board) return;
    const wrap = board.closest('.bmt-board-wrap');
    if (!wrap) return;
    board.classList.add('bmt-v23-board');
    wrap.classList.add('bmt-v23-board-wrap');
    wrap.dataset.boardShape = board.dataset.shape || 'rect';
    wrap.querySelector(':scope > .bmt-v23-boundary')?.remove();
    board.querySelector(':scope > .bmt-v23-boundary')?.remove();
  }

  function resultRating(card) {
    const saved = Number(card.dataset.resultStars || card.dataset.rating || card.dataset.stars || 0);
    if (saved >= 1 && saved <= 3) return saved;
    const stars = card.querySelector('.bmt-v22-result-stars, .bmt-result-stars');
    const label = stars?.getAttribute('aria-label') || '';
    const labelled = Number((label.match(/([1-3])\s*(?:из|\/)/i) || [])[1] || 0);
    if (labelled >= 1 && labelled <= 3) return labelled;
    const on = stars?.querySelectorAll('.is-on').length || 0;
    return Math.max(1, Math.min(3, on || 1));
  }

  function patchWinResult(card) {
    if (!card || !card.classList.contains('is-win')) return;
    const hero = card.querySelector('.bmt-v22-win-hero');
    if (!hero) return;
    const rating = resultRating(card);
    if (card.dataset.v23Result === '1' && Number(card.dataset.v23Rating) === rating) return;

    hero.classList.add('bmt-v23-win-hero');
    hero.removeAttribute('aria-hidden');
    hero.setAttribute('role', 'img');
    hero.setAttribute('aria-label', `Результат уровня: ${rating} из 3 звёзд`);
    hero.innerHTML = `<img class="bmt-v23-win-art" src="${HERO_ASSETS[rating]}" alt="${rating} из 3 звёзд" decoding="async" loading="eager" draggable="false">`;

    const stars = card.querySelector('.bmt-v22-result-stars');
    if (stars) {
      stars.setAttribute('aria-hidden', 'true');
      stars.dataset.rating = String(rating);
    }
    card.querySelector('.bmt-v22-next')?.setAttribute('aria-label', 'Перейти к следующему уровню');
    card.querySelector('.bmt-v22-repeat')?.setAttribute('aria-label', 'Повторить текущий уровень');
    card.querySelector('.bmt-v22-menu')?.setAttribute('aria-label', 'Вернуться в меню уровней');
    card.dataset.v23Result = '1';
    card.dataset.v23Rating = String(rating);
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
    new MutationObserver(schedulePatch).observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['data-current-game', 'data-shape', 'data-v22-result', 'data-result-stars'],
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
