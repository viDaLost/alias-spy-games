(() => {
  'use strict';

  if (window.__QUARTET_V45_CARD_ID_FIX__) return;
  window.__QUARTET_V45_CARD_ID_FIX__ = true;

  const CATALOG_URL = 'web/data/quartet_bible.json?v=45';
  const GROUP_PREFIX = 'qv2-group-';
  const cardIdByGroupAndTitle = new Map([
    // Defensive bootstrap for duplicate display names before the catalog request resolves.
    ['apostles\u0000Иоанн', 'apostles_john'],
    ['evangelists\u0000Иоанн', 'evangelists_john'],
    ['apostles\u0000Иаков', 'apostles_james'],
    ['patriarchs\u0000Иаков', 'patriarchs_jacob'],
  ]);

  let repairRaf = 0;

  const identityKey = (quartetId, title) => `${String(quartetId || '').trim()}\u0000${String(title || '').trim()}`;

  function resolveCardId(quartetId, title) {
    return cardIdByGroupAndTitle.get(identityKey(quartetId, title)) || '';
  }

  function quartetIdForCard(button) {
    const group = button?.closest?.(`.qv2-quartet-card[id^="${GROUP_PREFIX}"]`);
    const rawId = String(group?.id || '');
    return rawId.startsWith(GROUP_PREFIX) ? rawId.slice(GROUP_PREFIX.length) : '';
  }

  function cardTitleFor(button) {
    return String(button?.querySelector?.('.qv2-playing-card-title')?.textContent || '').trim();
  }

  function repairButton(button) {
    if (!button?.matches?.('button.qv2-playing-card.is-missing')) return '';
    const quartetId = quartetIdForCard(button);
    const title = cardTitleFor(button);
    const canonicalCardId = resolveCardId(quartetId, title);
    if (!canonicalCardId) return '';

    if (button.dataset.cardId !== canonicalCardId) {
      button.dataset.cardId = canonicalCardId;
      button.dataset.qv45CardIdentity = 'repaired';
    }
    return canonicalCardId;
  }

  function repairAll(root = document) {
    for (const button of root?.querySelectorAll?.('button.qv2-playing-card.is-missing') || []) repairButton(button);
  }

  function scheduleRepair() {
    if (repairRaf) return;
    repairRaf = requestAnimationFrame(() => {
      repairRaf = 0;
      repairAll(document.getElementById('qv2-root') || document);
    });
  }

  function repairBeforeSelection(event) {
    const button = event.target?.closest?.('button.qv2-playing-card.is-missing');
    if (button) repairButton(button);
  }

  // Capture phase is intentional: the original Quartet click handler reads
  // data-card-id later during bubbling. This guarantees that it receives the
  // canonical ID even if the V43 enhancer previously rewrote the button by title.
  document.addEventListener('pointerdown', repairBeforeSelection, true);
  document.addEventListener('click', repairBeforeSelection, true);

  const observer = new MutationObserver((records) => {
    if (records.some((record) => record.type === 'childList' && record.addedNodes?.length)) scheduleRepair();
  });
  observer.observe(document.getElementById('game-container') || document.body, { childList: true, subtree: true });

  window.addEventListener('quartetstatepatch', scheduleRepair);
  window.addEventListener('quartetselectionchange', scheduleRepair);

  fetch(CATALOG_URL, { cache: 'force-cache' })
    .then((response) => response.ok ? response.json() : Promise.reject(new Error(`HTTP ${response.status}`)))
    .then((data) => {
      for (const quartet of data?.quartets || []) {
        const quartetId = String(quartet?.id || '').trim();
        if (!quartetId) continue;
        for (const card of quartet.cards || []) {
          const title = String(card?.title || '').trim();
          const cardId = String(card?.id || '').trim();
          if (title && cardId) cardIdByGroupAndTitle.set(identityKey(quartetId, title), cardId);
        }
      }
      scheduleRepair();
    })
    .catch((error) => console.warn('[Quartet V45] card identity catalog unavailable', error));

  window.QuartetV45CardIdentity = Object.freeze({
    version: 45,
    resolveCardId,
    repairButton,
    repairAll,
  });
})();
