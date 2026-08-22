(() => {
  'use strict';

  if (window.__bmtV43LampStabilityInstalled) return;
  window.__bmtV43LampStabilityInstalled = true;

  // V37 made lit lamps playable by repeatedly rewriting tile classes and
  // blocker DOM from a MutationObserver. The core renderer owns those nodes,
  // so the two renderers could fight indefinitely on Telegram WebView.
  // Disable that legacy patch and keep the same edge-swipe behaviour here.
  window.__bmtV37LampSwipeInstalled = true;

  const STYLE_ID = 'bmt-v43-lamp-stability-style';
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
    if (tile.dataset.bmtLampPlayable === '1') return true;
    if (tile.classList.contains('is-lamp-lit')) return true;
    return lampNode(tile)?.dataset?.blockerLit === 'true';
  }

  function unlitLamp(tile) {
    return Boolean(tile?.classList?.contains('has-lamp') && !lampIsLit(tile));
  }

  // V29 blocks every .has-lamp tile in capture phase. Once the core marks the
  // lamp as lit, remove only that interaction marker. Do not delete blocker
  // markup or the core's is-lamp-lit state: the core remains the single owner
  // of gameplay DOM and can safely redraw the tile any number of times.
  function normalizeLitLamp(tile) {
    if (!tile?.classList?.contains('is-lamp-lit')) return false;
    if (tile.dataset.bmtLampPlayable !== '1') tile.dataset.bmtLampPlayable = '1';
    if (!tile.classList.contains('has-lamp')) return false;
    tile.classList.remove('has-lamp');
    return true;
  }

  function patchNode(node) {
    if (!node || node.nodeType !== 1) return;
    const direct = node.matches?.('.bmt-tile') ? node : node.closest?.('.bmt-tile');
    if (direct) normalizeLitLamp(direct);
    node.querySelectorAll?.('.bmt-tile.is-lamp-lit').forEach(normalizeLitLamp);
  }

  function patchLitLamps() {
    if (!isBiblicalGame()) return;
    document.querySelectorAll('#game-container .bmt-tile.is-lamp-lit').forEach(normalizeLitLamp);
  }

  function ensureStyle() {
    let style = document.getElementById(STYLE_ID);
    if (!style) {
      style = document.createElement('style');
      style.id = STYLE_ID;
      document.head.appendChild(style);
    }
    const css = `
body[data-current-game="biblical-match-three"] .bmt-v24-board-wrap .bmt-tile.is-lamp-lit .bmt-piece-wrap,
body[data-current-game="biblical-match-three"] .bmt-v24-board-wrap .bmt-tile.is-lamp-lit .bmt-special-mark,
body[data-current-game="biblical-match-three"] .bmt-v24-board-wrap .bmt-tile[data-bmt-lamp-playable="1"] .bmt-piece-wrap,
body[data-current-game="biblical-match-three"] .bmt-v24-board-wrap .bmt-tile[data-bmt-lamp-playable="1"] .bmt-special-mark{
  opacity:1!important;
  visibility:visible!important;
}
body[data-current-game="biblical-match-three"] .bmt-v24-board-wrap .bmt-tile.is-lamp-lit .bmt-blocker,
body[data-current-game="biblical-match-three"] .bmt-v24-board-wrap .bmt-tile[data-bmt-lamp-playable="1"] .bmt-blocker{
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

    // Normal inward swipe is handled by the native match-three gesture code.
    if (validSwapTile(intended)) {
      if (finish) pointer = null;
      return false;
    }

    // Preserve V37's shaped-board edge fallback without touching lamp DOM.
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
    if (!isBiblicalGame() || (event.button != null && event.button !== 0)) return;
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
          patchNode(record.target);
          continue;
        }
        patchNode(record.target);
        record.addedNodes.forEach(patchNode);
      }
    }).observe(root, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['class'],
    });

    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('pointermove', onPointerMove, { capture: true, passive: false });
    document.addEventListener('pointerup', onPointerUp, { capture: true, passive: false });
    document.addEventListener('pointercancel', () => { pointer = null; }, true);
    window.addEventListener('app:menu-ready', () => { pointer = null; });

    window.BiblicalMatchThreeLampStability = Object.freeze({ version: '43', mode: 'core-owned-dom' });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
  else install();
})();
