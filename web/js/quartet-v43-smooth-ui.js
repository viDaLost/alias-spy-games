(() => {
  'use strict';
  if (window.__QUARTET_V43_SMOOTH_UI__) return;
  window.__QUARTET_V43_SMOOTH_UI__ = true;

  const catalog = new Map();
  const imageCache = window.__quartetV43ImageCache || new Map();
  window.__quartetV43ImageCache = imageCache;

  let portal = null;
  let targetList = null;
  let titleStrong = null;
  let titleSmall = null;
  let targetStrong = null;
  let cardStrong = null;
  let confirmButton = null;
  let unreadBadge = null;
  let sourceDock = null;
  let syncRaf = 0;
  let observer = null;
  let resizeObserver = null;
  let lastMode = '';

  const svgQr = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M3 3h8v8H3V3Zm2 2v4h4V5H5Zm8-2h8v8h-8V3Zm2 2v4h4V5h-4ZM3 13h8v8H3v-8Zm2 2v4h4v-4H5Zm9-2h2v2h-2v-2Zm4 0h3v3h-2v-1h-1v-2Zm-5 4h3v4h-3v-4Zm5 1h3v3h-5v-2h2v-1Z"/></svg>';
  const svgChat = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M4 4h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H9l-5 4v-4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Zm2 5v2h12V9H6Zm0 4v2h8v-2H6Z"/></svg>';

  loadCatalog();
  start();

  function start() {
    ensurePortal();
    observer = new MutationObserver((records) => {
      if (!isQuartet()) {
        scheduleSync();
        return;
      }
      let mediaChanged = false;
      for (const record of records) {
        if (record.type !== 'childList') continue;
        for (const node of record.addedNodes) {
          if (node.nodeType !== 1) continue;
          if (node.matches?.('.qv2-playing-card,.qv3-card-art,img') || node.querySelector?.('.qv2-playing-card,.qv3-card-art img')) mediaChanged = true;
        }
      }
      if (mediaChanged) scheduleEnhanceMedia();
      scheduleSync();
    });
    observer.observe(document.getElementById('game-container') || document.body, { childList: true, subtree: true });

    window.addEventListener('quartetselectionchange', scheduleSync);
    window.addEventListener('quartetstatepatch', scheduleSync);
    window.addEventListener('pageshow', scheduleSync);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) scheduleSync(); });
    window.addEventListener('resize', scheduleSync, { passive: true });
    window.visualViewport?.addEventListener('resize', scheduleSync, { passive: true });
    window.visualViewport?.addEventListener('scroll', scheduleSync, { passive: true });
    scheduleSync();
  }

  async function loadCatalog() {
    try {
      const response = await fetch('web/data/quartet_bible.json?v=43', { cache: 'force-cache' });
      if (!response.ok) return;
      const data = await response.json();
      for (const quartet of data?.quartets || []) {
        for (const card of quartet.cards || []) {
          const title = String(card.title || '').trim();
          const id = String(card.id || '').trim();
          const art = String(card.art || `web/assets/quartet/cards/${encodeURIComponent(id)}.webp`).trim();
          if (title && id) catalog.set(title, { id, art });
        }
      }
      scheduleEnhanceMedia();
    } catch (error) {
      console.warn('[Quartet V43] catalog enhancer unavailable', error);
    }
  }

  function isQuartet() {
    return document.body?.dataset?.currentGame === 'quartet' && !!document.getElementById('qv2-root');
  }

  function ensurePortal() {
    if (portal?.isConnected) return portal;
    portal = document.createElement('section');
    portal.id = 'qv43-fixed-dock';
    portal.setAttribute('aria-live', 'polite');
    portal.innerHTML = `
      <div class="qv43-dock-inner">
        <div class="qv43-dock-head">
          <div class="qv43-dock-copy"><strong>Ваш ход</strong><small>Выберите карту и соперника</small></div>
          <div class="qv43-dock-actions">
            <button class="qv43-icon-btn" type="button" data-qv43="qr" aria-label="Показать QR-код комнаты">${svgQr}<span>QR</span></button>
            <button class="qv43-icon-btn" type="button" data-qv43="chat" aria-label="Открыть чат">${svgChat}<span>Чат</span><i class="qv43-unread"></i></button>
          </div>
        </div>
        <div class="qv43-targets" aria-label="Быстрый выбор соперника"></div>
        <div class="qv43-summary">
          <div class="qv43-choice"><small>Соперник</small><strong data-qv43-target>Выберите игрока</strong></div>
          <div class="qv43-arrow" aria-hidden="true">→</div>
          <div class="qv43-choice"><small>Карта</small><strong data-qv43-card>Выберите карту</strong></div>
        </div>
        <button class="qv43-confirm" type="button" data-qv43="confirm" disabled>Сделайте 2 выбора</button>
        <div class="qv43-waiting" hidden>Ожидайте хода другого игрока</div>
      </div>`;
    document.body.appendChild(portal);
    targetList = portal.querySelector('.qv43-targets');
    titleStrong = portal.querySelector('.qv43-dock-copy strong');
    titleSmall = portal.querySelector('.qv43-dock-copy small');
    targetStrong = portal.querySelector('[data-qv43-target]');
    cardStrong = portal.querySelector('[data-qv43-card]');
    confirmButton = portal.querySelector('[data-qv43="confirm"]');
    unreadBadge = portal.querySelector('.qv43-unread');

    portal.addEventListener('click', onPortalClick);
    resizeObserver = new ResizeObserver(() => reserveDockSpace());
    resizeObserver.observe(portal);
    return portal;
  }

  function reserveDockSpace() {
    if (!portal?.classList.contains('is-visible')) {
      document.documentElement.style.setProperty('--qv43-dock-space', '0px');
      return;
    }
    const height = Math.ceil(portal.getBoundingClientRect().height || 0);
    document.documentElement.style.setProperty('--qv43-dock-space', `${height + 24}px`);
  }

  function scheduleSync() {
    if (syncRaf) return;
    syncRaf = requestAnimationFrame(() => {
      syncRaf = 0;
      sync();
    });
  }

  function scheduleEnhanceMedia() {
    requestAnimationFrame(() => {
      if (!isQuartet()) return;
      const root = document.getElementById('qv2-root');
      stabilizeCardMedia(root);
      removeCardCornerEmoji(root);
      enableCardFirstSelection(root);
      markUnknownCards(root);
    });
  }

  function sync() {
    ensurePortal();
    if (!isQuartet()) {
      document.body.classList.remove('qv43-quartet-active');
      sourceDock = null;
      hidePortal();
      return;
    }

    const root = document.getElementById('qv2-root');
    sourceDock = root.querySelector('.qv2-action-dock');
    document.body.classList.add('qv43-quartet-active');
    scheduleEnhanceMedia();

    if (!sourceDock || !root.querySelector('.qv2-game')) {
      hidePortal();
      return;
    }

    sourceDock.classList.add('qv43-source-dock');
    const active = sourceDock.classList.contains('is-active');
    const targetName = String(sourceDock.querySelector('.qv2-action-target strong')?.textContent || 'Выберите игрока').trim();
    const cardName = String(sourceDock.querySelector('.qv2-action-card strong')?.textContent || 'Выберите карту').trim();
    const nativeConfirm = sourceDock.querySelector('.qv2-confirm-ask');

    titleStrong.textContent = active ? 'Ваш ход' : 'Ожидайте хода';
    // The caption shares its row with two icon buttons, so anything longer than a
    // few words reaches the reader as an ellipsis.
    titleSmall.textContent = active ? 'В любом порядке' : 'Панель обновится';
    targetStrong.textContent = targetName;
    targetStrong.title = targetName;
    cardStrong.textContent = cardName;
    cardStrong.title = cardName;

    targetList.hidden = !active;
    portal.querySelector('.qv43-summary').hidden = !active;
    confirmButton.hidden = !active;
    portal.querySelector('.qv43-waiting').hidden = active;
    // On a phone the dock drops its heading during your own turn -- the turn banner
    // one row above already says the same thing. While you are waiting there is no
    // such duplicate and the heading is the only label the dock has, so the layout
    // has to know which of the two states it is in.
    portal.classList.toggle('is-waiting-turn', !active);

    if (active) syncTargets(root);
    if (nativeConfirm) {
      confirmButton.disabled = nativeConfirm.disabled;
      confirmButton.textContent = nativeConfirm.textContent || (nativeConfirm.disabled ? 'Сделайте 2 выбора' : 'Спросить карту');
    } else {
      confirmButton.disabled = true;
      confirmButton.textContent = 'Сделайте 2 выбора';
    }

    const qchatBadge = document.getElementById('qchat-badge');
    const unread = qchatBadge?.classList.contains('is-visible') ? String(qchatBadge.textContent || '•').trim() : '';
    unreadBadge.textContent = unread;
    unreadBadge.classList.toggle('is-visible', Boolean(unread));

    showPortal();
  }

  function showPortal() {
    if (portal.classList.contains('is-visible')) {
      reserveDockSpace();
      return;
    }
    portal.classList.add('is-entering');
    portal.getBoundingClientRect();
    portal.classList.add('is-visible');
    requestAnimationFrame(() => portal.classList.remove('is-entering'));
    reserveDockSpace();
  }

  function hidePortal() {
    portal?.classList.remove('is-visible', 'is-entering');
    document.documentElement.style.setProperty('--qv43-dock-space', '0px');
  }

  function syncTargets(root) {
    const sourceButtons = [...root.querySelectorAll('.qv2-score-player[data-player-id]')]
      .filter((button) => !button.disabled && button.dataset.playerId);
    const wanted = new Set(sourceButtons.map((button) => button.dataset.playerId));

    for (const button of [...targetList.querySelectorAll('.qv43-target[data-player-id]')]) {
      if (!wanted.has(button.dataset.playerId)) button.remove();
    }

    for (const source of sourceButtons) {
      const id = source.dataset.playerId;
      let button = [...targetList.children].find((node) => node.dataset?.playerId === id);
      if (!button) {
        button = document.createElement('button');
        button.type = 'button';
        button.className = 'qv43-target';
        button.dataset.playerId = id;
        button.innerHTML = '<span class="qv43-avatar"></span><span class="qv43-target-copy"><b></b><small></small></span>';
        targetList.appendChild(button);
      }
      const rawName = String(source.querySelector('.qv2-score-name')?.textContent || 'Игрок').replace(/\s*·\s*ты\s*$/i, '').trim() || 'Игрок';
      const selected = source.getAttribute('aria-pressed') === 'true' || source.classList.contains('is-target');
      const online = Boolean(source.querySelector('.qv2-presence.is-online,.qv2-online.is-on'));
      button.classList.toggle('is-selected', selected);
      button.setAttribute('aria-pressed', String(selected));
      button.title = rawName;
      button.querySelector('.qv43-avatar').textContent = rawName.charAt(0).toUpperCase() || 'И';
      button.querySelector('b').textContent = rawName;
      button.querySelector('small').textContent = online ? '● онлайн' : '○ не в сети';
    }
  }

  function onPortalClick(event) {
    const targetButton = event.target.closest('.qv43-target[data-player-id]');
    if (targetButton) {
      const root = document.getElementById('qv2-root');
      const id = targetButton.dataset.playerId;
      const native = [...root?.querySelectorAll('.qv2-score-player[data-player-id]') || []].find((button) => button.dataset.playerId === id);
      native?.click();
      return;
    }

    const action = event.target.closest('[data-qv43]')?.dataset.qv43;
    if (!action) return;
    if (action === 'confirm') {
      sourceDock?.querySelector('.qv2-confirm-ask')?.click();
      return;
    }
    if (action === 'chat') {
      document.getElementById('qchat-fab')?.click();
      return;
    }
    if (action === 'qr') {
      const root = document.getElementById('qv2-root');
      const nativeQr = root?.querySelector('[data-action="show-room-qr"]');
      if (nativeQr) {
        nativeQr.click();
        return;
      }
      const roomId = localStorage.getItem('quartet_v2_room_id') || new URLSearchParams(location.search).get('room') || '';
      if (roomId && window.RoomInvite?.openQr) window.RoomInvite.openQr(roomId, { game: 'quartet' });
    }
  }

  function stabilizeCardMedia(root) {
    if (!root) return;
    for (const img of root.querySelectorAll('.qv3-card-art img')) {
      const url = img.currentSrc || img.getAttribute('src') || '';
      if (url) warmImage(url);
      img.loading = 'eager';
      img.decoding = 'async';
      img.fetchPriority = 'high';
      img.draggable = false;
      img.dataset.qv43Stable = '1';
    }
  }

  function warmImage(url) {
    if (!url || imageCache.has(url)) return;
    const image = new Image();
    image.decoding = 'async';
    image.loading = 'eager';
    image.src = url;
    imageCache.set(url, image);
    if (imageCache.size > 64) imageCache.delete(imageCache.keys().next().value);
    image.decode?.().catch(() => {});
  }

  function removeCardCornerEmoji(root) {
    for (const icon of root?.querySelectorAll('.qv2-playing-card .qv2-card-corner > span') || []) icon.remove();
  }

  function enableCardFirstSelection(root) {
    for (const button of root?.querySelectorAll('button.qv2-playing-card.is-missing') || []) {
      const title = String(button.querySelector('.qv2-playing-card-title')?.textContent || '').trim();
      const card = catalog.get(title);
      if (!card?.id) continue;
      button.disabled = false;
      button.dataset.action = 'select-card';
      button.dataset.cardId = card.id;
      button.classList.add('is-selectable', 'qv4-card-first-ready');
      button.setAttribute('aria-label', `${title}, недостающая карта. Нажмите, чтобы выбрать`);
    }
  }

  function markUnknownCards(root) {
    for (const card of root?.querySelectorAll('.qv2-playing-card.is-missing') || []) {
      const art = card.querySelector('.qv3-card-art');
      if (!art) continue;
      art.classList.add('qv4-unknown-card-art');
      const selected = card.classList.contains('is-selected');
      let badge = art.querySelector('.qv4-back-label');
      if (!badge) {
        art.replaceChildren();
        badge = document.createElement('span');
        badge.className = 'qv4-back-label';
        badge.setAttribute('aria-hidden', 'true');
        art.appendChild(badge);
      }
      badge.textContent = selected ? '✓' : '';
    }
  }
})();
