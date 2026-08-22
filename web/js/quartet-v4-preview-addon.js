(() => {
  if (window.__QUARTET_V4_PREVIEW__) return;
  window.__QUARTET_V4_PREVIEW__ = true;

  let titleToId = new Map();
  let observerTimer = 0;

  loadCatalog();
  const observer = new MutationObserver(scheduleEnhance);
  observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'aria-pressed', 'disabled'] });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) scheduleEnhance(); });
  scheduleEnhance();

  async function loadCatalog() {
    try {
      const response = await fetch('web/data/quartet_bible.json?v=preview-v4', { cache: 'no-store' });
      const data = await response.json();
      const entries = [];
      for (const quartet of data?.quartets || []) {
        for (const card of quartet.cards || []) entries.push([String(card.title || '').trim(), String(card.id || '')]);
      }
      titleToId = new Map(entries.filter(([title, id]) => title && id));
      scheduleEnhance();
    } catch (error) {
      console.warn('Quartet v4 catalog enhancer unavailable', error);
    }
  }

  function scheduleEnhance() {
    clearTimeout(observerTimer);
    observerTimer = setTimeout(enhance, 24);
  }

  function enhance() {
    const root = document.getElementById('qv2-root');
    if (!root || document.body.dataset.currentGame !== 'quartet') return;
    const dock = root.querySelector('.qv2-action-dock');
    const activeTurn = Boolean(dock?.classList.contains('is-active'));
    if (activeTurn) enableCardFirstSelection(root);
    if (dock) enhanceDock(root, dock, activeTurn);
    markUnknownCards(root);
  }

  function enableCardFirstSelection(root) {
    for (const button of root.querySelectorAll('button.qv2-playing-card.is-missing')) {
      const title = String(button.querySelector('.qv2-playing-card-title')?.textContent || '').trim();
      const cardId = titleToId.get(title) || '';
      if (!cardId) continue;
      button.disabled = false;
      button.dataset.action = 'select-card';
      button.dataset.cardId = cardId;
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
      art.innerHTML = `<span>${selected ? '✓ Выбрано' : 'Нужна карта'}</span>`;
    }
  }

  function enhanceDock(root, dock, activeTurn) {
    let center = dock.querySelector('.qv4-turn-center');
    if (!center) {
      center = document.createElement('div');
      center.className = 'qv4-turn-center';
      dock.prepend(center);
    }

    const targetName = String(dock.querySelector('.qv2-action-target strong')?.textContent || 'Выберите игрока').trim();
    const cardName = String(dock.querySelector('.qv2-action-card strong')?.textContent || 'Выберите карту').trim();
    const playerButtons = [...root.querySelectorAll('.qv2-score-player[data-player-id]')];

    center.innerHTML = `
      <div class="qv4-dock-title">
        <div><strong>${activeTurn ? 'Ваш ход' : 'Ожидайте хода'}</strong><small>${activeTurn ? `Карта: ${escapeHtml(cardName)}` : 'Следите за ходом партии'}</small></div>
        <button class="qv4-chat-btn" type="button" aria-label="Открыть чат">💬 <span>Чат</span><i id="qv4-chat-badge"></i></button>
      </div>
      ${activeTurn ? `<div class="qv4-targets" aria-label="Быстрый выбор соперника">${playerButtons.length ? playerButtons.map(renderTarget).join('') : '<span class="qv4-target-empty">Выберите соперника</span>'}</div>` : ''}
      ${activeTurn ? `<div class="qv4-choice-summary"><span>1 · ${escapeHtml(targetName)}</span><b>→</b><span>2 · ${escapeHtml(cardName)}</span></div>` : ''}
    `;

    center.querySelector('.qv4-chat-btn')?.addEventListener('click', () => document.getElementById('qchat-fab')?.click());

    const sourceBadge = document.getElementById('qchat-badge');
    const targetBadge = center.querySelector('#qv4-chat-badge');
    if (sourceBadge && targetBadge && sourceBadge.classList.contains('is-visible')) {
      targetBadge.textContent = sourceBadge.textContent || '•';
      targetBadge.classList.add('is-visible');
    }
  }

  function renderTarget(button) {
    const playerId = String(button.dataset.playerId || '');
    const rawName = String(button.querySelector('.qv2-score-name')?.textContent || 'Игрок').replace(/\s*·\s*ты\s*$/i, '').trim();
    const initial = rawName.charAt(0).toUpperCase() || 'И';
    const selected = button.getAttribute('aria-pressed') === 'true' || button.classList.contains('is-target');
    const online = Boolean(button.querySelector('.qv2-presence.is-online'));
    return `<button type="button" class="qv4-target ${selected ? 'is-selected' : ''}" data-action="select-target" data-player-id="${escapeHtml(playerId)}" aria-pressed="${selected}"><span class="qv4-target-avatar">${escapeHtml(initial)}</span><span><b>${escapeHtml(rawName)}</b><small>${online ? '● онлайн' : '○ не в сети'}</small></span></button>`;
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  }
})();
