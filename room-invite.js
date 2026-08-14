(() => {
  const QR_LIBRARY_URL = 'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js';
  const GAME_KEYS = Object.freeze({
    quartet: 'quartet',
    q: 'quartet',
    sketch: 'bible-sketch',
    'bible-sketch': 'bible-sketch',
    bible_sketch: 'bible-sketch',
  });
  const STORAGE_KEYS = Object.freeze({
    quartet: 'quartet_v2_room_id',
    'bible-sketch': 'bible_sketch_room_id_v1',
  });
  const INVITE_NAMES = Object.freeze({
    quartet: 'quartet',
    'bible-sketch': 'sketch',
  });

  let pendingInvite = readInvite();
  let qrLibraryPromise = null;
  let autoOpenTimer = null;
  let autoOpenObserver = null;

  if (pendingInvite) {
    persistInviteRoom(pendingInvite);
    removeConsumedUrlParameter();
    startAutoOpen();
  }

  function normalizeRoomId(value) {
    const room = String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10);
    return /^[A-Z0-9]{4,10}$/.test(room) ? room : '';
  }

  function normalizeGame(value) {
    return GAME_KEYS[String(value || '').trim().toLowerCase()] || '';
  }

  function parseInvite(value) {
    const raw = String(value || '').trim();
    if (!raw) return null;

    const internal = raw.match(/^biblegames:(?:\/\/join\/)?([a-z0-9_-]+)[:/]([a-z0-9]+)$/i);
    if (internal) {
      const game = normalizeGame(internal[1]);
      const room = normalizeRoomId(internal[2]);
      return game && room ? { game, room, opened: false } : null;
    }

    if (/^https?:\/\//i.test(raw)) {
      try {
        const url = new URL(raw);
        for (const key of ['join', 'startapp', 'tgWebAppStartParam']) {
          const nested = url.searchParams.get(key);
          const parsed = nested ? parseInvite(nested) : null;
          if (parsed) return parsed;
        }
      } catch {}
    }

    let game = '';
    let room = '';
    const colon = raw.match(/^([a-z0-9_-]+):([a-z0-9]+)$/i);
    if (colon) {
      game = normalizeGame(colon[1]);
      room = normalizeRoomId(colon[2]);
    } else {
      const start = raw.match(/^join_([a-z0-9_-]+)_([a-z0-9]+)$/i);
      if (start) {
        game = normalizeGame(start[1]);
        room = normalizeRoomId(start[2]);
      }
    }

    return game && room ? { game, room, opened: false } : null;
  }

  function readInvite() {
    let url = null;
    try { url = new URL(window.location.href); } catch {}
    const candidates = [
      url?.searchParams?.get('join'),
      url?.searchParams?.get('startapp'),
      url?.searchParams?.get('tgWebAppStartParam'),
      window.Telegram?.WebApp?.initDataUnsafe?.start_param,
    ];
    for (const candidate of candidates) {
      const parsed = parseInvite(candidate);
      if (parsed) return parsed;
    }
    return null;
  }

  function removeConsumedUrlParameter() {
    try {
      const url = new URL(window.location.href);
      if (!url.searchParams.has('join')) return;
      url.searchParams.delete('join');
      window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
    } catch {}
  }

  function persistInviteRoom(invite) {
    const key = STORAGE_KEYS[invite?.game];
    if (!key || !invite?.room) return;
    try { localStorage.setItem(key, invite.room); } catch {}
  }

  function menuIsReady() {
    const menu = document.getElementById('menu-container');
    const banned = document.getElementById('banned-screen');
    if (!menu || menu.classList.contains('hidden')) return false;
    if (banned && !banned.classList.contains('hidden')) return false;
    return typeof window.showGame === 'function';
  }

  function tryAutoOpen() {
    if (!pendingInvite || pendingInvite.opened || !menuIsReady()) return;
    pendingInvite.opened = true;
    persistInviteRoom(pendingInvite);
    try {
      window.showGame(pendingInvite.game);
      stopAutoOpen();
    } catch (error) {
      pendingInvite.opened = false;
      console.warn('Room invite auto-open failed', error);
    }
  }

  function startAutoOpen() {
    if (!pendingInvite) return;
    stopAutoOpen();
    autoOpenObserver = new MutationObserver(tryAutoOpen);
    autoOpenObserver.observe(document.documentElement, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['class', 'data-mode', 'data-current-game', 'data-ready'],
    });
    autoOpenTimer = window.setInterval(tryAutoOpen, 250);
    window.setTimeout(stopAutoOpen, 15000);
    tryAutoOpen();
  }

  function stopAutoOpen() {
    if (autoOpenTimer) window.clearInterval(autoOpenTimer);
    autoOpenTimer = null;
    autoOpenObserver?.disconnect();
    autoOpenObserver = null;
  }

  function peek() {
    if (!pendingInvite) return null;
    return { game: pendingInvite.game, room: pendingInvite.room, opened: pendingInvite.opened };
  }

  function consume(game) {
    const canonical = normalizeGame(game);
    if (!pendingInvite || (canonical && pendingInvite.game !== canonical)) return null;
    const invite = { game: pendingInvite.game, room: pendingInvite.room };
    pendingInvite = null;
    stopAutoOpen();
    return invite;
  }

  function acceptScanned(value) {
    const invite = parseInvite(value);
    if (!invite) return null;

    pendingInvite = invite;
    persistInviteRoom(invite);

    const currentGame = normalizeGame(document.body?.dataset?.currentGame || '');
    if (currentGame && currentGame !== invite.game && typeof window.goToMainMenu === 'function') {
      try { window.goToMainMenu(); } catch {}
    }

    startAutoOpen();
    window.dispatchEvent(new CustomEvent('roominvitechange', { detail: { game: invite.game, room: invite.room } }));
    return { game: invite.game, room: invite.room };
  }

  function buildUrl(game, room) {
    const canonical = normalizeGame(game);
    const normalizedRoom = normalizeRoomId(room);
    if (!canonical || !normalizedRoom) return '';
    const url = new URL(window.location.href);
    url.search = '';
    url.hash = '';
    url.searchParams.set('join', `${INVITE_NAMES[canonical] || canonical}:${normalizedRoom}`);
    return url.toString();
  }

  function buildStartParam(game, room) {
    const canonical = normalizeGame(game);
    const normalizedRoom = normalizeRoomId(room);
    if (!canonical || !normalizedRoom) return '';
    return `join_${INVITE_NAMES[canonical] || canonical}_${normalizedRoom}`;
  }

  function buildQrPayload(game, room) {
    const canonical = normalizeGame(game);
    const normalizedRoom = normalizeRoomId(room);
    if (!canonical || !normalizedRoom) return '';
    return `biblegames:${INVITE_NAMES[canonical] || canonical}:${normalizedRoom}`;
  }

  function loadQrLibrary() {
    if (window.QRCode) return Promise.resolve(window.QRCode);
    if (qrLibraryPromise) return qrLibraryPromise;
    qrLibraryPromise = new Promise((resolve, reject) => {
      const existing = document.querySelector(`script[src="${QR_LIBRARY_URL}"]`);
      if (existing) {
        existing.addEventListener('load', () => resolve(window.QRCode), { once: true });
        existing.addEventListener('error', () => reject(new Error('QR library failed')), { once: true });
        return;
      }
      const script = document.createElement('script');
      script.src = QR_LIBRARY_URL;
      script.async = true;
      script.referrerPolicy = 'no-referrer';
      script.onload = () => window.QRCode ? resolve(window.QRCode) : reject(new Error('QR library unavailable'));
      script.onerror = () => reject(new Error('QR library failed'));
      document.head.appendChild(script);
    }).catch((error) => {
      qrLibraryPromise = null;
      throw error;
    });
    return qrLibraryPromise;
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      try {
        const area = document.createElement('textarea');
        area.value = text;
        area.setAttribute('readonly', '');
        area.style.position = 'fixed';
        area.style.opacity = '0';
        document.body.appendChild(area);
        area.select();
        const ok = document.execCommand('copy');
        area.remove();
        return ok;
      } catch {
        return false;
      }
    }
  }

  function closeQr() {
    document.getElementById('room-invite-overlay')?.remove();
    document.body.classList.remove('room-invite-open');
  }

  async function openQr(game, room, title = 'Присоединиться к игре') {
    const canonical = normalizeGame(game);
    const normalizedRoom = normalizeRoomId(room);
    const inviteUrl = buildUrl(canonical, normalizedRoom);
    const qrPayload = buildQrPayload(canonical, normalizedRoom);
    if (!inviteUrl || !qrPayload) return;

    closeQr();
    const overlay = document.createElement('div');
    overlay.id = 'room-invite-overlay';
    overlay.className = 'room-invite-overlay';
    overlay.innerHTML = `
      <section class="room-invite-card" role="dialog" aria-modal="true" aria-labelledby="room-invite-title">
        <button type="button" class="room-invite-close" aria-label="Закрыть">×</button>
        <div class="room-invite-kicker">Подключение по QR</div>
        <h3 id="room-invite-title"></h3>
        <p class="room-invite-hint">Откройте «Сканировать QR» в Библейских играх на другом телефоне. Код подключит его к комнате без перехода в Safari или Chrome.</p>
        <div class="room-invite-qr" id="room-invite-qr" aria-label="QR-код комнаты"><div class="room-invite-qr-loading">Создаём QR…</div></div>
        <div class="room-invite-code"><small>Код комнаты</small><strong id="room-invite-code"></strong></div>
        <div class="room-invite-actions">
          <button type="button" class="room-invite-primary" data-invite-copy>Скопировать ссылку</button>
          <button type="button" class="room-invite-secondary" data-invite-share>Поделиться</button>
        </div>
        <div class="room-invite-feedback" id="room-invite-feedback" aria-live="polite"></div>
      </section>`;

    overlay.querySelector('#room-invite-title').textContent = String(title || 'Присоединиться к игре');
    overlay.querySelector('#room-invite-code').textContent = normalizedRoom;
    overlay.querySelector('.room-invite-close')?.addEventListener('click', closeQr);
    overlay.addEventListener('click', (event) => { if (event.target === overlay) closeQr(); });
    overlay.querySelector('[data-invite-copy]')?.addEventListener('click', async () => {
      const ok = await copyText(inviteUrl);
      const feedback = overlay.querySelector('#room-invite-feedback');
      if (feedback) feedback.textContent = ok ? 'Ссылка скопирована' : inviteUrl;
    });
    overlay.querySelector('[data-invite-share]')?.addEventListener('click', async () => {
      try {
        if (navigator.share) await navigator.share({ title: String(title || 'Библейские игры'), text: `Комната ${normalizedRoom}`, url: inviteUrl });
        else {
          const ok = await copyText(inviteUrl);
          const feedback = overlay.querySelector('#room-invite-feedback');
          if (feedback) feedback.textContent = ok ? 'Ссылка скопирована' : inviteUrl;
        }
      } catch (error) {
        if (error?.name !== 'AbortError') {
          const feedback = overlay.querySelector('#room-invite-feedback');
          if (feedback) feedback.textContent = 'Не удалось открыть меню «Поделиться»';
        }
      }
    });

    document.body.appendChild(overlay);
    document.body.classList.add('room-invite-open');

    const qrNode = overlay.querySelector('#room-invite-qr');
    try {
      await loadQrLibrary();
      if (!qrNode || !document.body.contains(qrNode)) return;
      qrNode.innerHTML = '';
      new window.QRCode(qrNode, {
        text: qrPayload,
        width: 184,
        height: 184,
        correctLevel: window.QRCode.CorrectLevel?.M,
      });
      const rendered = qrNode.querySelector('canvas, img, table');
      if (rendered) {
        rendered.style.width = '100%';
        rendered.style.height = '100%';
        rendered.style.maxWidth = '100%';
        rendered.style.maxHeight = '100%';
      }
    } catch {
      if (qrNode) {
        qrNode.innerHTML = '<div class="room-invite-qr-error">QR не удалось загрузить. Используйте кнопку «Скопировать ссылку».</div>';
      }
    }
  }

  window.RoomInvite = Object.freeze({
    normalizeRoomId,
    normalizeGame,
    parseInvite,
    peek,
    consume,
    acceptScanned,
    buildUrl,
    buildStartParam,
    buildQrPayload,
    openQr,
  });
})();
