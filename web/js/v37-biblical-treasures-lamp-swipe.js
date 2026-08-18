(() => {
  'use strict';

  if (window.__bmtV37LampSwipeInstalled) return;
  window.__bmtV37LampSwipeInstalled = true;

  const STYLE_ID = 'bmt-v37-lamp-swipe-style';
  let pointer = null;

  function isBiblicalGame() {
    return document.body?.dataset?.currentGame === 'biblical-match-three';
  }

  function boardTargeting(board) {
    return board?.classList?.contains('is-targeting');
  }

  function activeTile(tile) {
    return Boolean(tile && !tile.disabled && !tile.classList.contains('is-hole') && tile.isConnected);
  }

  function lampNode(tile) {
    return tile?.querySelector?.('[data-blocker-type="lamp"]') || null;
  }

  function lampIsLit(tile) {
    if (!tile) return false;
    if (tile.dataset.bmtLampCleared === '1') return true;
    if (tile.classList.contains('is-lamp-lit')) return true;
    return lampNode(tile)?.dataset?.blockerLit === 'true';
  }

  function unlitLamp(tile) {
    return Boolean(tile?.classList?.contains('has-lamp') && !lampIsLit(tile));
  }

  function restorePlayableLitLamp(tile) {
    if (!tile || (!lampIsLit(tile) && tile.dataset.bmtLampCleared !== '1')) return false;

    if (tile.dataset.bmtLampCleared !== '1') tile.dataset.bmtLampCleared = '1';
    tile.classList.add('bmt-lamp-cleared');
    tile.classList.remove('has-lamp', 'is-lamp-lit');

    const blocker = tile.querySelector('.bmt-blocker');
    if (blocker?.childNodes?.length) blocker.replaceChildren();

    const piece = tile.querySelector('.bmt-piece');
    const label = String(piece?.alt || '').trim();
    if (label && tile.getAttribute('aria-label') !== label) tile.setAttribute('aria-label', label);
    return true;
  }

  function patchLampRoot(root) {
    if (!root || root.nodeType !== 1) return;
    if (root.matches?.('.bmt-tile')) restorePlayableLitLamp(root);
    root.querySelectorAll?.('.bmt-tile').forEach(restorePlayableLitLamp);
  }

  function patchLitLamps() {
    if (!isBiblicalGame()) return;
    document.querySelectorAll('#game-container .bmt-tile').forEach(restorePlayableLitLamp);
  }

  function ensureStyle() {
    let style = document.getElementById(STYLE_ID);
    if (!style) {
      style = document.createElement('style');
      style.id = STYLE_ID;
      document.head.appendChild(style);
    }
    const css = `
body[data-current-game="biblical-match-three"] .bmt-v24-board-wrap .bmt-tile[data-bmt-lamp-cleared="1"] .bmt-piece-wrap,
body[data-current-game="biblical-match-three"] .bmt-v24-board-wrap .bmt-tile[data-bmt-lamp-cleared="1"] .bmt-special-mark{
  opacity:1!important;
  visibility:visible!important;
}
body[data-current-game="biblical-match-three"] .bmt-v24-board-wrap .bmt-tile[data-bmt-lamp-cleared="1"] .bmt-blocker{
  opacity:0!important;
  visibility:hidden!important;
  pointer-events:none!important;
}
body[data-current-game="biblical-match-three"] .bmt-board,
body[data-current-game="biblical-match-three"] .bmt-tile{
  touch-action:none!important;
  -webkit-user-select:none!important;
  user-select:none!important;
}
`;
    if (style.textContent !== css) style.textContent = css;
  }

  function adjacentIndex(index, dx, dy, rows, cols) {
    const row = Math.floor(index / cols);
    const col = index % cols;
    const nr = row + dy;
    const nc = col + dx;
    if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) return null;
    return nr * cols + nc;
  }

  function tileAt(board, index) {
    if (index == null) return null;
    return board.querySelector(`.bmt-tile[data-index="${index}"]`);
  }

  function validSwapTile(tile) {
    return activeTile(tile) && !unlitLamp(tile);
  }

  function syntheticSwap(source, target) {
    if (!validSwapTile(source) || !validSwapTile(target)) return false;
    source.click();
    target.click();
    return true;
  }

  function edgeFallback(event, finish = false) {
    if (!pointer || pointer.id !== event.pointerId) return false;
    const state = pointer;
    if (!isBiblicalGame() || !state.board?.isConnected || boardTargeting(state.board)) {
      if (finish) pointer = null;
      return false;
    }
    if (state.completed) {
      if (finish) pointer = null;
      return true;
    }

    const source = tileAt(state.board, state.index);
    if (!validSwapTile(source)) {
      if (finish) pointer = null;
      return false;
    }

    const dx = event.clientX - state.x;
    const dy = event.clientY - state.y;
    const threshold = Math.max(12, Math.min(source.clientWidth || 52, source.clientHeight || 52) * .2);
    if (Math.hypot(dx, dy) < threshold) {
      if (finish) pointer = null;
      return false;
    }

    const horizontal = Math.abs(dx) >= Math.abs(dy);
    const sx = horizontal ? Math.sign(dx) : 0;
    const sy = horizontal ? 0 : Math.sign(dy);
    if (!sx && !sy) {
      if (finish) pointer = null;
      return false;
    }

    const rows = Math.max(1, Number(state.board.dataset.rows || 8));
    const cols = Math.max(1, Number(state.board.dataset.cols || 8));
    const intendedIndex = adjacentIndex(state.index, sx, sy, rows, cols);
    const intended = tileAt(state.board, intendedIndex);

    // Normal swipe: let the built-in V15 gesture handler perform it.
    if (validSwapTile(intended)) {
      if (finish) pointer = null;
      return false;
    }

    // On the outer edge / shaped-board hole, use the active neighbour on the
    // opposite side of the same axis. This keeps visually exposed edge pieces
    // draggable instead of making the outward half of their gesture dead.
    const fallbackIndex = adjacentIndex(state.index, -sx, -sy, rows, cols);
    const fallback = tileAt(state.board, fallbackIndex);
    if (!validSwapTile(fallback)) {
      if (finish) pointer = null;
      return false;
    }

    state.completed = syntheticSwap(source, fallback);
    if (state.completed) {
      event.preventDefault();
      event.stopPropagation();
    }
    if (finish) pointer = null;
    return state.completed;
  }

  function onPointerDown(event) {
    if (!isBiblicalGame() || event.button != null && event.button !== 0) return;
    const tile = event.target?.closest?.('.bmt-tile');
    const board = tile?.closest?.('.bmt-board');
    if (!validSwapTile(tile) || !board || boardTargeting(board)) {
      pointer = null;
      return;
    }
    pointer = {
      id: event.pointerId,
      board,
      index: Number(tile.dataset.index),
      x: event.clientX,
      y: event.clientY,
      completed: false,
    };
  }

  function onPointerMove(event) {
    edgeFallback(event, false);
  }

  function onPointerUp(event) {
    edgeFallback(event, true);
  }

  function install() {
    ensureStyle();
    patchLitLamps();

    const root = document.getElementById('game-container') || document.body;
    new MutationObserver((records) => {
      if (!isBiblicalGame()) return;
      for (const record of records) {
        if (record.type === 'attributes') {
          patchLampRoot(record.target?.closest?.('.bmt-tile') || record.target);
          continue;
        }
        patchLampRoot(record.target);
        record.addedNodes.forEach(patchLampRoot);
      }
    }).observe(root, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['class', 'data-blocker-lit'],
    });

    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('pointermove', onPointerMove, { capture: true, passive: false });
    document.addEventListener('pointerup', onPointerUp, { capture: true, passive: false });
    document.addEventListener('pointercancel', () => { pointer = null; }, true);
    window.addEventListener('app:menu-ready', () => { pointer = null; });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
  else install();
})();
