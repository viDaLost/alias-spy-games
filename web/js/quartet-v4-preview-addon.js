(() => {
  if (window.__QUARTET_V41_PREVIEW__) return;
  window.__QUARTET_V41_PREVIEW__ = true;

  let titleToCard = new Map();
  let enhanceTimer = 0;
  let lastDockSignature = '';
  const imageCache = window.__quartetV4ImageCache || new Map();
  window.__quartetV4ImageCache = imageCache;

  loadCatalog();

  const observer = new MutationObserver(() => scheduleEnhance(48));
  observer.observe(document.documentElement, { childList: true, subtree: true });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) scheduleEnhance(24);
  });
  window.addEventListener('pageshow', () => scheduleEnhance(24));
  scheduleEnhance(0);

  async function loadCatalog() {
    try {
      const response = await fetch('web/data/quartet_bible.json?v=preview-v4', { cache: 'force-cache' });
      const data = await response.json();
      const entries = [];
      for (const quartet of data?.quartets || []) {
        for (const card of quartet.cards || []) {
          const title = String(card.title || '').trim();
          const id = String(card.id || '').trim();
          const art = String(card.art || `web/assets/quartet/cards/${encodeURIComponent(id)}.webp`).trim();
          if (title && id) entries.push([title, { id, art }]);
          preloadImage(id, art);
        }
      }
      titleToCard = new Map(entries);
      scheduleEnhance(0);
    } catch (error) {
      console.warn('Quartet v4.1 catalog enhancer unavailable', error);
    }
  }

  function preloadImage(id, url) {
    if (!id || !url || imageCache.has(id)) return;
    const image = new Image();
    image.decoding = 'async';
    image.loading = 'eager';
    image.src = url;
    imageCache.set(id, image);
    if (typeof image.decode === 'function') image.decode().catch(() => {});
  }

  function scheduleEnhance(delay = 32) {
    clearTimeout(enhanceTimer);
    enhanceTimer = setTimeout(enhance, delay);
  }

  function enhance() {
    const root = document.getElementById('qv2-root');
    if (!root || document.body.dataset.currentGame !== 'quartet') return;

    stabilizeCardMedia(root);
    removeCardCornerEmoji(root);
    markUnknownCards(root);

    const dock = root.querySelector('.qv2-action-dock');
    if (!dock) return;
    const activeTurn = dock.classList.contains('is-active');
    if (activeTurn) enableCardFirstSelection(root);
    enhanceDock(root, dock, activeTurn);
  }

  function stabilizeCardMedia(root) {
    for (const img of root.querySelectorAll('.qv3-card-art img')) {
      if (img.dataset.qv41Stable === '1') continue;
      img.dataset.qv41Stable = '1';
      img.loading = 'eager';
      img.decoding = 'async';
      img.removeAttribute('loading');
      img.setAttribute('draggable', 'false');
      const url = img.getAttribute('src') || '';
      if (url && ![...imageCache.values()].some((cached) => cached.src === img.src)) {
        preloadImage(`url:${url}`, url);
      }
    }
  }

  function removeCardCornerEmoji(root) {
    for (const icon of root.querySelectorAll('.qv2-playing-card .qv2-card-corner > span')) icon.remove();
  }

  function enableCardFirstSelection(root) {
    for (const button of root.querySelectorAll('button.qv2-playing-card.is-missing')) {
      const title = String(button.querySelector('.qv2-playing-card-title')?.textContent || '').trim();
      const card = titleToCard.get(title);
      if (!card?.id) continue;
      button.disabled = false;
      button.dataset.action = 'select-card';
      button.dataset.cardId = card.id;
      button.classList.add('is-selectable', 'qv4-card-first-ready');
      button.setAttribute('aria-label', `${title}, недостающая карта. Нажмите, чтобы выбрать`);
    }
  }

  function markUnknownCards(root) {
    for (const card of root.querySelectorAll('.qv2-playing-card.is-missing')) {
      const art = card.querySelector('.qv3-card-art');
      if (!art) continue;
      art.classList.add('qv4-unknown-card-art');
      const selected = card.classList.contains('is-selected');
      const label = selected ? '✓ Выбрано' : 'Нужна карта';
      let badge = art.querySelector('.qv4-back-label');
      if (!badge) {
        art.replaceChildren();
        badge = document.createElement('span');
        badge.className = 'qv4-back-label';
        art.appendChild(badge);
      }
      if (badge.textContent !== label) badge.textContent = label;
    }
  }

  function enhanceDock(root, dock, activeTurn) {
    let center = dock.querySelector('.qv4-turn-center');
    if (!center) {
      center = document.createElement('div');
      center.className = 'qv4-turn-center';
      dock.prepend(center);
      lastDockSignature = '';
    }

    const targetName = String(dock.querySelector('.qv2-action-target strong')?.textContent || 'Выберите игрока').trim();
    const cardName = String(dock.querySelector('.qv2-action-card strong')?.textContent || 'Выберите карту').trim();
    const playerButtons = [...root.querySelectorAll('.qv2-score-player[data-player-id]')].filter((button) => !button.disabled);
    const players = playerButtons.map(readTarget);
    const sourceBadge = document.getElementById('qchat-badge');
    const unread = sourceBadge?.classList.contains('is-visible') ? String(sourceBadge.textContent || '•').trim() : '';
    const signature = JSON.stringify({ activeTurn, targetName, cardName, unread, players });
    if (signature === lastDockSignature) return;
    lastDockSignature = signature;

    center.innerHTML = `
      <div class="qv4-dock-title">
        <div class="qv4-dock-copy">
          <strong>${activeTurn ? 'Ваш ход' : 'Ожидайте хода'}</strong>
          <small>${activeTurn ? 'Выберите карту и соперника в любом порядке' : 'Следите за ходом партии'}</small>
        </div>
        <button class="qv4-chat-btn" type="button" aria-label="Открыть чат">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M4 4h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H9l-5 4v-4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Zm2 5v2h12V9H6Zm0 4v2h8v-2H6Z"/></svg>
          <span>Чат</span><i class="${unread ? 'is-visible' : ''}">${escapeHtml(unread)}</i>
        </button>
      </div>
      ${activeTurn ? `<div class="qv4-targets" aria-label="Быстрый выбор соперника">${players.length ? players.map(renderTarget).join('') : '<span class="qv4-target-empty">Нет доступных соперников</span>'}</div>` : ''}
      ${activeTurn ? `
        <div class="qv4-choice-summary">
          <div class="qv4-choice-item" title="${escapeHtml(targetName)}"><small>Соперник</small><strong>${escapeHtml(targetName)}</strong></div>
          <div class="qv4-choice-arrow">→</div>
          <div class="qv4-choice-item" title="${escapeHtml(cardName)}"><small>Карта</small><strong>${escapeHtml(cardName)}</strong></div>
        </div>` : ''}
    `;

    center.querySelector('.qv4-chat-btn')?.addEventListener('click', () => document.getElementById('qchat-fab')?.click());
  }

  function readTarget(button) {
    const playerId = String(button.dataset.playerId || '');
    const rawName = String(button.querySelector('.qv2-score-name')?.textContent || 'Игрок').replace(/\s*·\s*ты\s*$/i, '').trim();
    return {
      playerId,
      rawName,
      initial: rawName.charAt(0).toUpperCase() || 'И',
      selected: button.getAttribute('aria-pressed') === 'true' || button.classList.contains('is-target'),
      online: Boolean(button.querySelector('.qv2-presence.is-online')),
    };
  }

  function renderTarget(player) {
    return `<button type="button" class="qv4-target ${player.selected ? 'is-selected' : ''}" data-action="select-target" data-player-id="${escapeHtml(player.playerId)}" aria-pressed="${player.selected}" title="${escapeHtml(player.rawName)}"><span class="qv4-target-avatar">${escapeHtml(player.initial)}</span><span class="qv4-target-text"><b>${escapeHtml(player.rawName)}</b><small>${player.online ? '● онлайн' : '○ не в сети'}</small></span></button>`;
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  }
})();
