(() => {
  'use strict';

  if (window.__bmtV36SpecialArtInstalled) return;
  window.__bmtV36SpecialArtInstalled = true;

  const VERSION = '36';
  const STYLE_ID = 'bmt-v36-special-piece-art';
  const FALLBACK = {
    lineH: 'web/assets/biblical-match-three/icons-v17/staff.webp?v=17',
    lineV: 'web/assets/biblical-match-three/icons-v17/staff.webp?v=17',
    burst: 'web/assets/biblical-match-three/icons-v17/jericho.webp?v=17',
    rainbow: 'web/assets/biblical-match-three/icons-v17/covenant.webp?v=17',
  };
  const LABELS = {
    lineH: 'Горизонтальный усилитель',
    lineV: 'Вертикальный усилитель',
    burst: 'Взрывной усилитель',
    rainbow: 'Радужный усилитель',
  };
  const SPECIAL_CLASSES = {
    lineH: 'bmt-piece--special-line-h',
    lineV: 'bmt-piece--special-line-v',
    burst: 'bmt-piece--special-burst',
    rainbow: 'bmt-piece--special-rainbow',
  };

  let scheduled = false;

  function specialFromTile(tile) {
    if (tile.classList.contains('is-line-h')) return 'lineH';
    if (tile.classList.contains('is-line-v')) return 'lineV';
    if (tile.classList.contains('is-burst')) return 'burst';
    if (tile.classList.contains('is-rainbow')) return 'rainbow';
    return '';
  }

  function specialSource(special) {
    const boosters = window.BiblicalMatchThreeV5Art?.boosters || window.BiblicalMatchThreeV4Art?.boosters || {};
    if (special === 'lineH' || special === 'lineV') return boosters.staff || FALLBACK[special];
    if (special === 'burst') return boosters.jericho || FALLBACK.burst;
    if (special === 'rainbow') return boosters.covenant || FALLBACK.rainbow;
    return '';
  }

  function syncSpecialClasses(img, special) {
    img.classList.toggle('bmt-piece--special', Boolean(special));
    for (const [key, className] of Object.entries(SPECIAL_CLASSES)) {
      img.classList.toggle(className, special === key);
    }
  }

  function patchTile(tile) {
    const img = tile.querySelector('.bmt-piece');
    if (!img) return;
    const special = specialFromTile(tile);
    const mark = tile.querySelector('.bmt-special-mark');

    if (!special) {
      syncSpecialClasses(img, '');
      if (img.dataset.bmtSpecialArt) delete img.dataset.bmtSpecialArt;
      return;
    }

    const src = specialSource(special);
    const label = LABELS[special] || 'Особый усилитель';
    const marker = `${special}-v${VERSION}`;
    syncSpecialClasses(img, special);
    if (img.dataset.bmtSpecialArt !== marker) img.dataset.bmtSpecialArt = marker;
    if (src && (img.getAttribute('src') || '') !== src) img.src = src;
    if (img.alt !== label) img.alt = label;
    if (mark && mark.textContent) mark.textContent = '';

    const tileLabel = tile.getAttribute('aria-label') || '';
    if (tileLabel !== label) tile.setAttribute('aria-label', label);
  }

  function patchBoard() {
    scheduled = false;
    if (document.body?.dataset?.currentGame !== 'biblical-match-three') return;
    document.querySelectorAll('#game-container .bmt-tile').forEach(patchTile);
  }

  function schedulePatch() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(patchBoard);
  }

  function ensureStyle() {
    let style = document.getElementById(STYLE_ID);
    if (!style) {
      style = document.createElement('style');
      style.id = STYLE_ID;
      document.head.appendChild(style);
    }
    const css = `
body[data-current-game="biblical-match-three"] .bmt-tile.is-line-h .bmt-special-mark,
body[data-current-game="biblical-match-three"] .bmt-tile.is-line-v .bmt-special-mark,
body[data-current-game="biblical-match-three"] .bmt-tile.is-burst .bmt-special-mark,
body[data-current-game="biblical-match-three"] .bmt-tile.is-rainbow .bmt-special-mark{
  display:none!important;
  content:none!important;
}
body[data-current-game="biblical-match-three"] .bmt-piece.bmt-piece--special{
  width:100%!important;
  height:100%!important;
  max-width:94%!important;
  max-height:94%!important;
  object-fit:contain!important;
  object-position:center!important;
  filter:drop-shadow(0 2px 4px rgba(32,38,67,.24))!important;
}
body[data-current-game="biblical-match-three"] .bmt-piece.bmt-piece--special-line-h{
  transform:rotate(90deg) translateZ(0)!important;
}
body[data-current-game="biblical-match-three"] .bmt-piece.bmt-piece--special-line-v,
body[data-current-game="biblical-match-three"] .bmt-piece.bmt-piece--special-burst,
body[data-current-game="biblical-match-three"] .bmt-piece.bmt-piece--special-rainbow{
  transform:translateZ(0)!important;
}
`;
    if (style.textContent !== css) style.textContent = css;
  }

  function install() {
    ensureStyle();
    schedulePatch();
    new MutationObserver(schedulePatch).observe(document.documentElement, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['class', 'src', 'data-current-game'],
    });
    window.BiblicalMatchThreeV5ArtReady?.then?.(schedulePatch).catch?.(() => {});
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
  else install();
})();
