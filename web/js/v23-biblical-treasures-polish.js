(() => {
  'use strict';

  if (window.__bmtV23PolishInstalled) return;
  window.__bmtV23PolishInstalled = true;

  const VERSION = '29';
  const STYLE_ID = 'bmt-v23-polish-style';
  const HERO_ASSETS = {
    1: `web/assets/biblical-match-three/completion-1-star-v29.webp?v=${VERSION}`,
    2: `web/assets/biblical-match-three/completion-2-stars-v29.webp?v=${VERSION}`,
    3: `web/assets/biblical-match-three/completion-3-stars-v29.avif?v=${VERSION}`,
  };

  let scheduled = false;
  let resultPoll = 0;

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

  function countOnStars(card) {
    const nodes = [...card.querySelectorAll('.bmt-v22-result-stars *, .bmt-result-stars *')];
    if (!nodes.length) return 0;
    let on = 0;
    for (const node of nodes) {
      const classes = node.classList || { contains: () => false };
      const color = String(getComputedStyle(node).color || '');
      const bg = String(getComputedStyle(node).backgroundColor || '');
      const filled =
        classes.contains('is-on') ||
        classes.contains('active') ||
        node.dataset.on === 'true' ||
        node.getAttribute('aria-checked') === 'true' ||
        /gold|rgb\(255,\s*(19\d|20\d|21\d|22\d|23\d),/i.test(color) ||
        /gold|rgb\(255,\s*(19\d|20\d|21\d|22\d|23\d),/i.test(bg);
      if (filled) on += 1;
    }
    return Math.max(0, Math.min(3, on));
  }

  function ratingFromRewards(card) {
    const rewardBlocks = [...card.querySelectorAll('.bmt-v22-rewards > div, .bmt-v22-reward, .bmt-result-card__reward')];
    for (const block of rewardBlocks) {
      const text = (block.textContent || '').replace(/\s+/g, ' ').trim();
      const match = text.match(/\+(\d+)\s*★/);
      if (!match) continue;
      const reward = Number(match[1]);
      if (reward >= 9) return 3;
      if (reward >= 6) return 2;
      if (reward >= 3) return 1;
    }
    return 0;
  }

  function resultRating(card) {
    const explicit = Number(card.dataset.resultStars || card.dataset.rating || card.dataset.stars || 0);
    if (explicit >= 1 && explicit <= 3) return explicit;

    const starHost = card.querySelector('.bmt-v22-result-stars, .bmt-result-stars');
    const label = starHost?.getAttribute('aria-label') || '';
    const labelled = Number((label.match(/([1-3])\s*(?:из|\/)/i) || [])[1] || 0);
    if (labelled >= 1 && labelled <= 3) return labelled;

    const byOn = countOnStars(card);
    if (byOn >= 1 && byOn <= 3) return byOn;

    const byRewards = ratingFromRewards(card);
    if (byRewards >= 1 && byRewards <= 3) return byRewards;

    return 1;
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
    hero.innerHTML = `<img class="bmt-v23-win-art" src="${HERO_ASSETS[rating]}" alt="${rating} из 3 звёзд" decoding="async" loading="eager" fetchpriority="high" draggable="false">`;

    const stars = card.querySelector('.bmt-v22-result-stars, .bmt-result-stars');
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
    window.requestAnimationFrame(patchAll);
  }

  function startResultPolling() {
    if (resultPoll) return;
    resultPoll = window.setInterval(() => {
      if (document.body?.dataset?.currentGame !== 'biblical-match-three') return;
      if (document.querySelector('.bmt-result-card.is-win')) schedulePatch();
    }, 200);
  }

  function needsPatch(record) {
    if (record.type === 'childList') {
      const nodes = [...record.addedNodes, ...record.removedNodes];
      if (record.target?.closest?.('.bmt-result-card, .bmt-board, .bmt-board-wrap')) return true;
      return nodes.some((node) => node.nodeType === 1 && (node.matches?.('.bmt-result-card, .bmt-board, .bmt-board-wrap') || node.querySelector?.('.bmt-result-card, .bmt-board, .bmt-board-wrap')));
    }
    if (record.type === 'attributes') return record.attributeName === 'class' || record.attributeName?.startsWith('data-');
    return false;
  }

  function start() {
    ensureStyle();
    schedulePatch();
    startResultPolling();
    new MutationObserver((records) => {
      if (records.some(needsPatch)) schedulePatch();
    }).observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['class', 'data-current-game', 'data-shape', 'data-v22-result', 'data-stars', 'data-rating', 'data-result-stars'],
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
