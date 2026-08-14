(() => {
  let observer = null;
  let retryTimer = null;

  function currentGame() {
    return String(document.body?.dataset?.currentGame || '');
  }

  function addGlobalScanButton() {
    const root = document.getElementById('system-actions');
    if (!root || root.querySelector('[data-room-scan-global]')) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'game-card room-scan-menu-card';
    button.dataset.roomScanGlobal = '1';
    button.setAttribute('aria-label', 'Сканировать QR-код комнаты');
    button.innerHTML = `
      <span class="game-card__icon room-scan-menu-icon" aria-hidden="true">⌗</span>
      <span class="game-card__body">
        <span class="game-card__title">Сканировать QR</span>
        <span class="game-card__desc">Подключиться к комнате камерой Telegram</span>
      </span>`;
    button.addEventListener('click', () => window.RoomQrScanner?.open?.());
    root.appendChild(button);
  }

  function addQuartetQrButton() {
    if (currentGame() !== 'quartet') return;
    const actions = document.querySelector('.qv2-room-actions');
    const codeNode = document.querySelector('.qv2-room-code');
    if (!actions || !codeNode || actions.querySelector('[data-room-qr]')) return;
    const room = window.RoomInvite?.normalizeRoomId(codeNode.textContent || '');
    if (!room) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'qv2-btn qv2-btn--secondary';
    button.dataset.roomQr = 'quartet';
    button.textContent = '▦ QR-код';
    button.addEventListener('click', () => window.RoomInvite?.openQr('quartet', room, 'Квартет · подключение к комнате'));
    actions.appendChild(button);
  }

  function addQuartetScannerButton() {
    if (currentGame() !== 'quartet') return;
    const input = document.querySelector('#qv2-room-code');
    const join = document.querySelector('[data-action="join"]');
    if (!input || !join || document.querySelector('[data-room-scan="quartet"]')) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'qv2-btn qv2-btn--secondary qv2-btn--full';
    button.dataset.roomScan = 'quartet';
    button.textContent = '⌗ Сканировать QR';
    button.addEventListener('click', () => window.RoomQrScanner?.open?.());
    join.insertAdjacentElement('afterend', button);
  }

  function addSketchQrButton() {
    if (currentGame() !== 'bible-sketch') return;
    const row = document.querySelector('.bsk-link-row');
    const codeNode = document.querySelector('.bsk-room-code');
    if (!row || !codeNode || row.querySelector('[data-room-qr]')) return;
    const room = window.RoomInvite?.normalizeRoomId(codeNode.textContent || '');
    if (!room) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'bsk-secondary';
    button.dataset.roomQr = 'bible-sketch';
    button.textContent = '▦ QR-код';
    button.addEventListener('click', () => window.RoomInvite?.openQr('bible-sketch', room, 'Библейский художник · подключение к комнате'));
    row.appendChild(button);
  }

  function addSketchScannerButton() {
    if (currentGame() !== 'bible-sketch') return;
    const input = document.querySelector('#bsk-room-code');
    const join = document.querySelector('[data-action="join-room"]');
    if (!input || !join || document.querySelector('[data-room-scan="bible-sketch"]')) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'bsk-secondary';
    button.dataset.roomScan = 'bible-sketch';
    button.style.width = '100%';
    button.style.marginTop = '8px';
    button.textContent = '⌗ Сканировать QR';
    button.addEventListener('click', () => window.RoomQrScanner?.open?.());
    join.insertAdjacentElement('afterend', button);
  }

  async function shareRoomInvite(game, room, title) {
    const inviteUrl = await window.RoomInvite?.getShareUrl?.(game, room);
    if (!inviteUrl) {
      window.showToast?.('Не удалось подготовить Telegram-ссылку', 'error');
      return;
    }

    const text = `${title} · комната ${room}`;
    const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(inviteUrl)}&text=${encodeURIComponent(text)}`;
    const tg = window.Telegram?.WebApp;

    try {
      if (typeof tg?.openTelegramLink === 'function') {
        tg.openTelegramLink(shareUrl);
        return;
      }
      if (navigator.share) {
        await navigator.share({ title, text, url: inviteUrl });
        return;
      }
      const copied = await navigator.clipboard?.writeText?.(inviteUrl).then(() => true).catch(() => false);
      if (copied) window.showToast?.('Telegram-ссылка скопирована');
      else window.open(shareUrl, '_blank', 'noopener');
    } catch (error) {
      if (error?.name !== 'AbortError') window.showToast?.('Не удалось поделиться ссылкой', 'error');
    }
  }

  function replaceShareButton(container, game, room, title) {
    if (!container || !room) return;
    const original = [...container.querySelectorAll('button')].find((button) => /поделиться/i.test(button.textContent || ''));
    if (!original || original.dataset.telegramRoomShare === '1') return;

    const button = original.cloneNode(true);
    button.dataset.telegramRoomShare = '1';
    button.removeAttribute('onclick');
    original.replaceWith(button);
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      shareRoomInvite(game, room, title);
    });
  }

  function replaceLegacyShareButtons() {
    if (currentGame() === 'quartet') {
      const room = window.RoomInvite?.normalizeRoomId(document.querySelector('.qv2-room-code')?.textContent || '');
      replaceShareButton(document.querySelector('.qv2-room-actions'), 'quartet', room, 'Квартет');
    }
    if (currentGame() === 'bible-sketch') {
      const room = window.RoomInvite?.normalizeRoomId(document.querySelector('.bsk-room-code')?.textContent || '');
      replaceShareButton(document.querySelector('.bsk-link-row'), 'bible-sketch', room, 'Библейский художник');
    }
  }

  function finishInviteIfLobbyOpened(invite) {
    if (!invite) return false;
    const selector = invite.game === 'quartet' ? '.qv2-room-code' : '.bsk-room-code';
    const code = window.RoomInvite?.normalizeRoomId(document.querySelector(selector)?.textContent || '');
    if (code && code === invite.room) {
      window.RoomInvite?.consume(invite.game);
      return true;
    }
    return false;
  }

  function fallbackJoinFromForm(invite) {
    if (!invite || currentGame() !== invite.game) return;
    const isQuartet = invite.game === 'quartet';
    const input = document.querySelector(isQuartet ? '#qv2-room-code' : '#bsk-room-code');
    const button = document.querySelector(isQuartet ? '[data-action="join"]' : '[data-action="join-room"]');
    if (!input || !button || input.dataset.roomInviteAttempted === invite.room) return;
    input.dataset.roomInviteAttempted = invite.room;
    input.value = invite.room;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    window.setTimeout(() => button.click(), 60);
  }

  function update() {
    if (!window.RoomInvite) return;
    addGlobalScanButton();
    addQuartetQrButton();
    addQuartetScannerButton();
    addSketchQrButton();
    addSketchScannerButton();
    replaceLegacyShareButtons();
    const invite = window.RoomInvite.peek();
    if (!invite) return;
    if (finishInviteIfLobbyOpened(invite)) return;
    fallbackJoinFromForm(invite);
  }

  function start() {
    if (observer) return;
    observer = new MutationObserver(update);
    observer.observe(document.documentElement, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['class', 'data-current-game', 'data-mode'],
    });
    retryTimer = window.setInterval(update, 400);
    window.addEventListener('roominvitechange', update);
    update();
  }

  window.addEventListener('pagehide', () => {
    observer?.disconnect();
    observer = null;
    if (retryTimer) window.clearInterval(retryTimer);
    retryTimer = null;
    window.removeEventListener('roominvitechange', update);
  }, { once: true });

  start();
})();
