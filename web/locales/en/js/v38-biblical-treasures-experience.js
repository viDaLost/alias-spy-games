(() => {
  'use strict';
  if (window.__bmtV39ExperienceInstalled) return;
  window.__bmtV39ExperienceInstalled = true;
  document.querySelectorAll('.bmt-v38-menu-crest').forEach((node) => node.remove());

  const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)');
  let boardToken = null;

  function decorateMenuCard() {
    const card = document.getElementById('biblical-match-three-card');
    if (!card) return;
    card.dataset.bmtV38 = '1';
    card.classList.add('game-card--biblical-treasures-v38');
    const icon = card.querySelector('.game-card__icon');
    if (!icon || icon.querySelector('.bmt-v38-card-sparkles')) return;
    const sparkle = document.createElement('span');
    sparkle.className = 'bmt-v38-card-sparkles';
    sparkle.setAttribute('aria-hidden', 'true');
    sparkle.innerHTML = '<i></i><i></i><i></i>';
    icon.append(sparkle);
  }

  function decorateBoard() {
    const board = document.querySelector('.bmt-board');
    if (!board || board === boardToken) return;
    boardToken = board;
    const wrap = board.closest('.bmt-board-wrap');
    if (!wrap || wrap.querySelector('.bmt-v38-ambient')) return;
    const ambient = document.createElement('div');
    ambient.className = 'bmt-v38-ambient';
    ambient.setAttribute('aria-hidden', 'true');
    ambient.innerHTML = '<i></i><i></i><i></i><i></i><i></i><i></i>';
    wrap.prepend(ambient);
    if (!reduceMotion?.matches) board.classList.add('is-v38-entering');
    board.addEventListener('animationend', () => board.classList.remove('is-v38-entering'), { once: true });
  }

  function sync() {
    decorateMenuCard();
    if (document.body?.dataset?.currentGame !== 'biblical-match-three') return;
    document.querySelectorAll('.bmt-v38-menu-crest').forEach((node) => node.remove());
    decorateBoard();
  }

  const observer = new MutationObserver(sync);
  function start() {
    sync();
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-current-game'] });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
