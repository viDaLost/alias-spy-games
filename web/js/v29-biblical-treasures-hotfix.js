(() => {
  'use strict';
  if (window.__bmtV34HotfixInstalled) return;
  window.__bmtV34HotfixInstalled = true;
  window.__bmtV31HotfixInstalled = true;
  window.__bmtV29HotfixInstalled = true;
  window.__bmtV30HotfixInstalled = true;

  const VERSION = '35';
  const RESULT_ART_VERSION = '40';
  const MENU_ART_VERSION = '39';
  const MENU_ICON = `web/assets/icons/biblical-treasures-v38.png?v=${MENU_ART_VERSION}`;
  const BOARD_BACKGROUND = `web/assets/biblical-match-three/board-background-v35.webp?v=${VERSION}`;
  const VISUAL_STYLE_ID = 'bmt-v34-user-art';
  const RESULT_ART = {
    1: `web/assets/biblical-match-three/completion-1-star-v40.webp?v=${RESULT_ART_VERSION}`,
    2: `web/assets/biblical-match-three/completion-2-stars-v40.webp?v=${RESULT_ART_VERSION}`,
    3: `web/assets/biblical-match-three/completion-3-stars-v40.webp?v=${RESULT_ART_VERSION}`,
  };
  const TWO_STAR_REMAINING_RATIO = 0.08;
  const THREE_STAR_REMAINING_RATIO = 0.20;

  let pointer = null;
  let runState = null;
  let patchScheduled = false;

  function isBiblicalGame() {
    return document.body?.dataset?.currentGame === 'biblical-match-three';
  }

  function numericText(value) {
    const number = Number(String(value || '').replace(/[^0-9-]/g, ''));
    return Number.isFinite(number) ? number : 0;
  }

  function parseHudScore() {
    return Math.max(0, Math.floor(numericText(document.getElementById('bmt-score')?.textContent)));
  }

  function parseHudMoves() {
    const node = document.getElementById('bmt-moves');
    if (!node || String(node.textContent || '').includes('∞')) return null;
    return Math.max(0, Math.floor(numericText(node.textContent)));
  }

  function currentLevelId() {
    const text = document.querySelector('.bmt-gamebar .bmt-kicker, .bmt-board-screen .bmt-kicker')?.textContent || '';
    return Math.max(0, Number((text.match(/Уровень\s+(\d+)/i) || [])[1] || 0));
  }

  function patchMenuIcon() {
    const card = document.getElementById('biblical-match-three-card');
    const img = card?.querySelector('img');
    if (!img) return;
    if ((img.getAttribute('src') || '') !== MENU_ICON) img.src = MENU_ICON;
    if (img.alt !== 'Иконка игры Библейские сокровища') img.alt = 'Иконка игры Библейские сокровища';
    if (img.dataset.bmtMenuArt !== 'v39') img.dataset.bmtMenuArt = 'v39';
    if (img.dataset.iconVersion !== MENU_ART_VERSION) img.dataset.iconVersion = MENU_ART_VERSION;
  }

  function ensureUserArtwork() {
    document.getElementById('bmt-v31-user-art')?.remove();
    let style = document.getElementById(VISUAL_STYLE_ID);
    if (!style) {
      style = document.createElement('style');
      style.id = VISUAL_STYLE_ID;
      document.head.appendChild(style);
    }
    const css = `
html body[data-current-game="biblical-match-three"] #game-container,
html body[data-current-game="biblical-match-three"] #game-container .bmt-shell.bmt-board-screen{
  background-image:none!important;
}
html body[data-current-game="biblical-match-three"] #game-container .bmt-board-wrap,
html body[data-current-game="biblical-match-three"] #game-container .bmt-board-wrap.bmt-v24-board-wrap{
  background-color:#f4edf8!important;
  background-image:url("${BOARD_BACKGROUND}")!important;
  background-size:cover!important;
  background-position:center center!important;
  background-repeat:no-repeat!important;
  image-rendering:auto!important;
  border-color:rgba(255,255,255,.38)!important;
  box-shadow:0 10px 28px rgba(73,47,103,.12)!important;
  overflow:hidden!important;
}
html body[data-current-game="biblical-match-three"] #game-container .bmt-board{
  background:transparent!important;
}
html body[data-current-game="biblical-match-three"] #game-container .bmt-v24-field-underlay,
html body[data-current-game="biblical-match-three"] #game-container .bmt-v24-field-svg{
  background:transparent!important;
}
html body[data-current-game="biblical-match-three"] #game-container .bmt-v24-field-cells rect{
  fill:rgba(255,255,255,.11)!important;
  stroke:rgba(255,255,255,.08)!important;
}
body[data-current-game="biblical-match-three"] .bmt-v31-star-rules{
  margin:10px 0 2px;padding:10px 12px;border-radius:14px;background:rgba(255,255,255,.72);
  box-shadow:inset 0 0 0 1px rgba(115,82,155,.12);font-size:12px;line-height:1.35;color:#574867;
}
body[data-current-game="biblical-match-three"] .bmt-v31-star-rules strong{display:block;margin-bottom:4px;color:#3f3150;font-size:13px}
body[data-current-game="biblical-match-three"] .bmt-v31-star-rules span{display:block;margin-top:2px}
`;
    if (style.textContent !== css) style.textContent = css;
  }

  function captureRunState() {
    const board = document.querySelector('.bmt-board');
    if (!board || !isBiblicalGame()) return;
    const moves = parseHudMoves();
    if (runState?.board !== board) {
      runState = { board, levelId: currentLevelId(), startMoves: moves || 0, lastMoves: moves, continued: false };
      if (runState.startMoves > 0 && board.dataset.v34StartMoves !== String(runState.startMoves)) board.dataset.v34StartMoves = String(runState.startMoves);
      return;
    }
    if (moves == null) return;
    if (runState.lastMoves != null && moves > runState.lastMoves + 1) runState.continued = true;
    runState.lastMoves = moves;
  }

  function efficiencyRating(startMoves, remainingMoves, continued) {
    if (continued || !Number.isFinite(startMoves) || startMoves <= 0 || !Number.isFinite(remainingMoves)) return 1;
    const ratio = Math.max(0, remainingMoves) / startMoves;
    if (ratio >= THREE_STAR_REMAINING_RATIO) return 3;
    if (ratio >= TWO_STAR_REMAINING_RATIO) return 2;
    return 1;
  }

  function patchProgressBestScore() {
    const api = window.BiblicalMatchThreeProgress;
    if (!api || typeof api.completeLevel !== 'function' || api.__bmtV34RatingPatched) return;
    if (api.__bmtV31RatingPatched) {
      api.__bmtV34RatingPatched = true;
      return;
    }
    const nativeCompleteLevel = api.completeLevel;
    api.completeLevel = function completeLevelWithBestScoreAndRating(progress, levelId, rating, reward, totalLevels, explicitScore) {
      captureRunState();
      const hudScore = parseHudScore();
      const score = Number.isFinite(Number(explicitScore)) ? Math.max(0, Number(explicitScore)) : hudScore;
      const remainingMoves = parseHudMoves();
      const startMoves = runState?.levelId === Number(levelId) ? Number(runState.startMoves || 0) : 0;
      const continued = Boolean(runState?.levelId === Number(levelId) && runState.continued);
      const runRating = Math.max(1, Math.min(3, Number(rating || 1)), efficiencyRating(startMoves, remainingMoves, continued));
      const result = nativeCompleteLevel.call(this, progress, levelId, runRating, reward, totalLevels, score);
      const payload = { levelId:Number(levelId), runRating, originalRating:Math.max(1,Math.min(3,Number(rating||1))), score, startMoves, remainingMoves:remainingMoves ?? 0, continued };
      window.__bmtV34LastLevelResult = payload;
      window.__bmtV31LastLevelResult = payload;
      return result;
    };
    api.__bmtV34RatingPatched = true;
    api.__bmtV31RatingPatched = true;
    api.__bmtV30BestScorePatched = true;
  }

  function patchPrelevelStarRules() {
    document.querySelectorAll('.bmt-prelevel').forEach((sheet) => {
      if (sheet.querySelector('.bmt-v31-star-rules')) return;
      const goals = sheet.querySelector('.bmt-prelevel__goals');
      if (!goals) return;
      const rules = document.createElement('div');
      rules.className = 'bmt-v31-star-rules';
      rules.innerHTML = '<strong>Как получить звёзды</strong><span>★ — выполнить все цели уровня.</span><span>★★ — выполнить цели, сохранив не меньше 8% ходов, либо набрать порог 2 звёзд по очкам.</span><span>★★★ — выполнить цели, сохранив не меньше 20% ходов, либо набрать порог 3 звёзд по очкам.</span>';
      goals.after(rules);
    });
  }

  function applyRunRatingToResult(card) {
    if (!card?.classList.contains('is-win')) return;
    const last = window.__bmtV34LastLevelResult || window.__bmtV31LastLevelResult;
    if (!last || last.runRating < 1 || last.runRating > 3) return;
    const rating = Number(last.runRating);
    const ratingText = String(rating);
    const label = `${rating} из 3`;
    const stars = card.querySelector('.bmt-result-stars, .bmt-v22-result-stars');
    if (stars) {
      if (stars.getAttribute('aria-label') !== label) stars.setAttribute('aria-label', label);
      [...stars.children].forEach((node, index) => {
        const on = index < rating;
        if (node.classList.contains('is-on') !== on) node.classList.toggle('is-on', on);
      });
      if (stars.dataset.rating !== ratingText) stars.dataset.rating = ratingText;
    }
    if (card.dataset.resultStars !== ratingText) card.dataset.resultStars = ratingText;
    if (card.dataset.v23Rating && Number(card.dataset.v23Rating) !== rating) {
      delete card.dataset.v23Result;
      delete card.dataset.v23Rating;
    }
    const art = card.querySelector('.bmt-v23-win-art');
    if (art && RESULT_ART[rating]) {
      if ((art.getAttribute('src') || '') !== RESULT_ART[rating]) art.src = RESULT_ART[rating];
      const alt = `${rating} из 3 звёзд`;
      if (art.alt !== alt) art.alt = alt;
    }
    if (card.dataset.v34ResultSynced !== ratingText) card.dataset.v34ResultSynced = ratingText;
  }

  function captureResultStars() {
    document.querySelectorAll('.bmt-result-card.is-win').forEach((card) => {
      applyRunRatingToResult(card);
      if (card.dataset.resultStars) return;
      const stars = card.querySelector('.bmt-result-stars, .bmt-v22-result-stars');
      if (!stars) return;
      const label = stars.getAttribute('aria-label') || '';
      let n = Number((label.match(/([1-3])\s*(?:из|\/|of)\s*3/i) || [])[1] || 0);
      if (!n) n = stars.querySelectorAll('.is-on, .active, [data-on="true"], [aria-checked="true"]').length;
      if (n >= 1 && n <= 3 && card.dataset.resultStars !== String(n)) card.dataset.resultStars = String(n);
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
        const shaped = Array.isArray(array) && array.some((value) => value === null) && array.some((value) => value && typeof value === 'object' && Object.prototype.hasOwnProperty.call(value, 'type'));
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

  function boardTargeting(board) { return board?.classList?.contains('is-targeting'); }
  function lampTile(node) { return node?.closest?.('.bmt-tile.has-lamp'); }
  function blockLampClick(event) {
    if (!isBiblicalGame()) return;
    const tile = lampTile(event.target);
    if (!tile) return;
    const board = tile.closest('.bmt-board');
    if (boardTargeting(board)) return;
    event.preventDefault(); event.stopImmediatePropagation();
  }
  function rememberPointer(event) {
    if (!isBiblicalGame()) return;
    const tile = event.target?.closest?.('.bmt-tile');
    const board = tile?.closest?.('.bmt-board');
    if (!tile || !board || tile.disabled || tile.classList.contains('is-hole') || boardTargeting(board)) { pointer = null; return; }
    pointer = { id:event.pointerId, board, index:Number(tile.dataset.index), x:event.clientX, y:event.clientY, sourceLamp:tile.classList.contains('has-lamp') };
    if (pointer.sourceLamp) { event.preventDefault(); event.stopImmediatePropagation(); }
  }
  function blockLampSwipe(event) {
    if (!pointer || pointer.id !== event.pointerId) return;
    const state = pointer; pointer = null;
    if (!isBiblicalGame() || !state.board?.isConnected || boardTargeting(state.board)) return;
    const source = state.board.querySelector(`.bmt-tile[data-index="${state.index}"]`);
    if (!source) return;
    const dx = event.clientX - state.x; const dy = event.clientY - state.y;
    const threshold = Math.max(12, Math.min(source.clientWidth || 52, source.clientHeight || 52) * .2);
    if (Math.hypot(dx, dy) < threshold) return;
    const horizontal = Math.abs(dx) >= Math.abs(dy); const sx = horizontal ? Math.sign(dx) : 0; const sy = horizontal ? 0 : Math.sign(dy);
    const rows = Math.max(1, Number(state.board.dataset.rows || 8)); const cols = Math.max(1, Number(state.board.dataset.cols || 8));
    const row = Math.floor(state.index / cols); const col = state.index % cols; const nr = row + sy; const nc = col + sx;
    if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) return;
    const target = state.board.querySelector(`.bmt-tile[data-index="${nr * cols + nc}"]`);
    if (state.sourceLamp || target?.classList.contains('has-lamp')) { event.preventDefault(); event.stopImmediatePropagation(); }
  }
  function installLampGuards() {
    document.addEventListener('click', blockLampClick, true);
    document.addEventListener('pointerdown', rememberPointer, true);
    document.addEventListener('pointerup', blockLampSwipe, true);
    document.addEventListener('pointercancel', () => { pointer = null; }, true);
  }

  function patchAll() {
    patchScheduled = false;
    patchMenuIcon();
    patchProgressBestScore();
    if (isBiblicalGame()) {
      ensureUserArtwork();
      captureRunState();
      patchPrelevelStarRules();
      captureResultStars();
    }
  }
  function schedulePatch() {
    if (patchScheduled) return;
    patchScheduled = true;
    requestAnimationFrame(patchAll);
  }
  function start() {
    installArkGuard();
    installLampGuards();
    patchAll();
    const progressTimer = window.setInterval(() => {
      patchProgressBestScore();
      if (window.BiblicalMatchThreeProgress?.__bmtV34RatingPatched) window.clearInterval(progressTimer);
    }, 150);
    window.setTimeout(() => window.clearInterval(progressTimer), 15000);
    new MutationObserver(schedulePatch).observe(document.body, {
      childList:true,
      subtree:true,
      attributes:true,
      attributeFilter:['data-current-game','class'],
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once:true });
  else start();
})();
