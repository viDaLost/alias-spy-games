(() => {
  'use strict';
  if (window.__bmtV29HotfixInstalled) return;
  window.__bmtV29HotfixInstalled = true;
  window.__bmtV30HotfixInstalled = true;

  const VERSION = '30';
  const MENU_ICON = `web/assets/icons/biblical-treasures.webp?v=${VERSION}`;
  const BOARD_BACKGROUND = `web/assets/biblical-match-three/board-background-v29.webp?v=${VERSION}`;
  const VISUAL_STYLE_ID = 'bmt-v30-user-art';
  let pointer = null;

  function isBiblicalGame() {
    return document.body?.dataset?.currentGame === 'biblical-match-three';
  }

  function patchMenuIcon() {
    const card = document.getElementById('biblical-match-three-card');
    const img = card?.querySelector('img');
    if (!img) return;
    if ((img.getAttribute('src') || '') !== MENU_ICON) img.src = MENU_ICON;
    img.alt = 'Иконка игры Библейские сокровища';
    img.dataset.bmtMenuArt = 'v30';
    img.dataset.iconVersion = VERSION;
  }

  function ensureUserArtwork() {
    let style = document.getElementById(VISUAL_STYLE_ID);
    if (!style) {
      style = document.createElement('style');
      style.id = VISUAL_STYLE_ID;
      document.head.appendChild(style);
    }
    const css = `body[data-current-game="biblical-match-three"] .bmt-board-wrap,body[data-current-game="biblical-match-three"] .bmt-board-wrap.bmt-v24-board-wrap{background-color:#f2ecf7!important;background-image:url("${BOARD_BACKGROUND}")!important;background-size:cover!important;background-position:center!important;background-repeat:no-repeat!important}`;
    if (style.textContent !== css) style.textContent = css;
  }

  function patchLegacyStyleLinks() {
    document.querySelectorAll('link[href*="biblical-match-three-v21-art.css"]').forEach((link) => {
      const next = `web/styles/biblical-match-three-v21-art.css?v=${VERSION}`;
      if (link.getAttribute('href') !== next) link.href = next;
    });
  }

  function parseHudScore() {
    const text = document.getElementById('bmt-score')?.textContent || '';
    const score = Number(String(text).replace(/[^0-9-]/g, ''));
    return Number.isFinite(score) ? Math.max(0, Math.floor(score)) : 0;
  }

  function patchProgressBestScore() {
    const api = window.BiblicalMatchThreeProgress;
    if (!api || api.__bmtV30BestScorePatched || typeof api.completeLevel !== 'function') return;
    const nativeCompleteLevel = api.completeLevel;
    api.completeLevel = function completeLevelWithBestScore(progress, levelId, rating, reward, totalLevels) {
      return nativeCompleteLevel.call(this, progress, levelId, rating, reward, totalLevels, parseHudScore());
    };
    api.__bmtV30BestScorePatched = true;
  }

  function captureResultStars() {
    document.querySelectorAll('.bmt-result-card.is-win').forEach((card) => {
      const stars = card.querySelector('.bmt-result-stars, .bmt-v22-result-stars');
      if (!stars) return;
      const label = stars.getAttribute('aria-label') || '';
      let n = Number((label.match(/([1-3])\s*(?:из|\/|of)\s*3/i) || [])[1] || 0);
      if (!n) n = stars.querySelectorAll('.is-on, .active, [data-on="true"], [aria-checked="true"]').length;
      if (n >= 1 && n <= 3) card.dataset.resultStars = String(n);
    });
  }

  function installArkGuard() {
    document.addEventListener('click', (event) => {
      const ark = event.target?.closest?.('[data-booster="ark"]');
      if (!ark || !isBiblicalGame()) return;
      const nativeMap = Array.prototype.map;
      if (nativeMap.__bmtArkGuardV29) return;
      function guardedMap(callback, thisArg) {
        const array = this;
        const shaped = Array.isArray(array)
          && array.some((value) => value === null)
          && array.some((value) => value && typeof value === 'object' && Object.prototype.hasOwnProperty.call(value, 'type'));
        if (!shaped || typeof callback !== 'function') return nativeMap.call(array, callback, thisArg);
        return nativeMap.call(array, (value, index, source) => {
          if (value !== null) return callback.call(thisArg, value, index, source);
          try { return callback.call(thisArg, value, index, source); }
          catch (error) { if (error instanceof TypeError) return -1; throw error; }
        });
      }
      guardedMap.__bmtArkGuardV29 = true;
      Array.prototype.map = guardedMap;
      setTimeout(() => { if (Array.prototype.map === guardedMap) Array.prototype.map = nativeMap; }, 0);
    }, true);
  }

  function boardTargeting(board) {
    return board?.classList?.contains('is-targeting');
  }

  function lampTile(node) {
    return node?.closest?.('.bmt-tile.has-lamp');
  }

  function blockLampClick(event) {
    if (!isBiblicalGame()) return;
    const tile = lampTile(event.target);
    if (!tile) return;
    const board = tile.closest('.bmt-board');
    if (boardTargeting(board)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  }

  function rememberPointer(event) {
    if (!isBiblicalGame()) return;
    const tile = event.target?.closest?.('.bmt-tile');
    const board = tile?.closest?.('.bmt-board');
    if (!tile || !board || tile.disabled || tile.classList.contains('is-hole') || boardTargeting(board)) {
      pointer = null;
      return;
    }
    pointer = {
      id: event.pointerId,
      board,
      index: Number(tile.dataset.index),
      x: event.clientX,
      y: event.clientY,
      sourceLamp: tile.classList.contains('has-lamp'),
    };
    if (pointer.sourceLamp) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }

  function blockLampSwipe(event) {
    if (!pointer || pointer.id !== event.pointerId) return;
    const state = pointer;
    pointer = null;
    if (!isBiblicalGame() || !state.board?.isConnected || boardTargeting(state.board)) return;
    const source = state.board.querySelector(`.bmt-tile[data-index="${state.index}"]`);
    if (!source) return;
    const dx = event.clientX - state.x;
    const dy = event.clientY - state.y;
    const threshold = Math.max(12, Math.min(source.clientWidth || 52, source.clientHeight || 52) * .2);
    if (Math.hypot(dx, dy) < threshold) return;
    const horizontal = Math.abs(dx) >= Math.abs(dy);
    const sx = horizontal ? Math.sign(dx) : 0;
    const sy = horizontal ? 0 : Math.sign(dy);
    const rows = Math.max(1, Number(state.board.dataset.rows || 8));
    const cols = Math.max(1, Number(state.board.dataset.cols || 8));
    const row = Math.floor(state.index / cols);
    const col = state.index % cols;
    const nr = row + sy;
    const nc = col + sx;
    if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) return;
    const targetIndex = nr * cols + nc;
    const target = state.board.querySelector(`.bmt-tile[data-index="${targetIndex}"]`);
    if (state.sourceLamp || target?.classList.contains('has-lamp')) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }

  function installLampGuards() {
    document.addEventListener('click', blockLampClick, true);
    document.addEventListener('pointerdown', rememberPointer, true);
    document.addEventListener('pointerup', blockLampSwipe, true);
    document.addEventListener('pointercancel', () => { pointer = null; }, true);
  }

  function patchAll() {
    patchMenuIcon();
    patchProgressBestScore();
    if (isBiblicalGame()) {
      ensureUserArtwork();
      patchLegacyStyleLinks();
      captureResultStars();
    }
  }

  function start() {
    installArkGuard();
    installLampGuards();
    patchAll();
    const progressTimer = window.setInterval(() => {
      patchProgressBestScore();
      if (window.BiblicalMatchThreeProgress?.__bmtV30BestScorePatched) window.clearInterval(progressTimer);
    }, 150);
    window.setTimeout(() => window.clearInterval(progressTimer), 15000);
    new MutationObserver(patchAll).observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['data-current-game', 'class', 'aria-label'],
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
