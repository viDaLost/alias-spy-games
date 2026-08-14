(() => {
  let observer = null;
  let retryTimer = null;

  function currentGame() {
    return String(document.body?.dataset?.currentGame || '');
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
    if (!input || !button || input.dataset.roomInviteAttempted === '1') return;
    input.dataset.roomInviteAttempted = '1';
    input.value = invite.room;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    window.setTimeout(() => button.click(), 60);
  }

  function update() {
    if (!window.RoomInvite) return;
    addQuartetQrButton();
    addSketchQrButton();
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
    retryTimer = window.setInterval(update, 500);
    update();
  }

  window.addEventListener('pagehide', () => {
    observer?.disconnect();
    observer = null;
    if (retryTimer) window.clearInterval(retryTimer);
    retryTimer = null;
  }, { once: true });

  start();
})();
