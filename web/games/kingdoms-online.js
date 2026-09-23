/* global goToMainMenu */
// «Царства» по сети: комната, лобби и переписка.
//
// Устройство повторяет twelve-tribes-online.js — тот же сокет с запасным
// опросом, то же лобби с переговорами. Партию ведёт сервер
// (cloudflare/kingdoms-worker), доску рисует kingdoms.js — тот же класс
// Board, что и за одним устройством против соперников от игры; только вид
// партии теперь приходит не от локального движка, а от сервера, уже
// подрезанный под то, что вправе увидеть именно этот игрок.

(function () {
  'use strict';

  const LS = {
    guest: 'kd_guest_id',
    room: 'kd_room_id',
    name: 'kd_player_name',
  };
  const RECONNECT_STEPS = [1000, 2000, 4000, 8000, 10000];
  const POLL_MS = 2500;

  function backendBase() {
    const fromWindow = String(window.KINGDOMS_BACKEND_URL || '').trim();
    const fromMeta = String(document.querySelector('meta[name="kingdoms-backend"]')?.content || '').trim();
    return (fromWindow || fromMeta).replace(/\/+$/, '');
  }

  function guestId() {
    let id = '';
    try { id = localStorage.getItem(LS.guest) || ''; } catch { id = ''; }
    if (!id) {
      const bytes = new Uint8Array(12);
      crypto.getRandomValues(bytes);
      id = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
      try { localStorage.setItem(LS.guest, id); } catch { /* приватный режим */ }
    }
    return id;
  }

  const telegram = () => window.Telegram?.WebApp || null;

  function defaultName() {
    try {
      const saved = localStorage.getItem(LS.name);
      if (saved) return saved;
    } catch { /* приватный режим */ }
    const user = telegram()?.initDataUnsafe?.user;
    return String(user?.first_name || user?.username || 'Игрок').slice(0, 24);
  }

  const escapeHTML = (value) => String(value == null ? '' : value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const normalizeCode = (value) => String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10);

  /** Связь с комнатой: сокет, переподключение и запасной опрос. */
  class Link {
    constructor({ onView, onError, onStatus }) {
      this.base = backendBase();
      this.roomId = '';
      this.token = '';
      this.socket = null;
      this.attempt = 0;
      this.pollTimer = 0;
      this.pingTimer = 0;
      this.closed = false;
      this.onView = onView;
      this.onError = onError;
      this.onStatus = onStatus;
      this.name = defaultName();
    }

    body(extra = {}) {
      const tg = telegram();
      return {
        telegramInitData: String(tg?.initData || ''),
        guestId: guestId(),
        name: this.name,
        ...extra,
      };
    }

    async http(path, options = {}) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 9000);
      try {
        const response = await fetch(`${this.base}${path}`, {
          method: options.method || 'GET',
          headers: { 'Content-Type': 'application/json' },
          body: options.body ? JSON.stringify(options.body) : undefined,
          cache: 'no-store',
          signal: controller.signal,
        });
        let payload = null;
        try { payload = await response.json(); } catch { /* тело не JSON */ }
        if (!response.ok || !payload?.ok) throw new Error(payload?.error || `Сервер ответил ${response.status}`);
        return payload;
      } catch (error) {
        if (error?.name === 'AbortError') throw new Error('Сервер долго не отвечает');
        throw error;
      } finally {
        clearTimeout(timer);
      }
    }

    async create() {
      const answer = await this.http('/rooms', {
        method: 'POST',
        body: this.body({ requestId: `${guestId()}-${Date.now()}` }),
      });
      this.roomId = normalizeCode(answer.roomId);
      this.token = String(answer.sessionToken || '');
      this.remember();
      this.connect();
      return answer;
    }

    async join(code) {
      const roomId = normalizeCode(code);
      if (roomId.length < 4) throw new Error('Код комнаты — четыре знака и больше');
      const answer = await this.http(`/rooms/${encodeURIComponent(roomId)}/join`, {
        method: 'POST',
        body: this.body(),
      });
      this.roomId = roomId;
      this.token = String(answer.sessionToken || '');
      this.remember();
      this.connect();
      return answer;
    }

    remember() {
      try { localStorage.setItem(LS.room, this.roomId); } catch { /* приватный режим */ }
      try { localStorage.setItem(LS.name, this.name); } catch { /* приватный режим */ }
    }

    connect() {
      if (this.closed || !this.roomId || !this.token) return;
      this.stopSocket();
      const url = new URL(`${this.base}/rooms/${encodeURIComponent(this.roomId)}/ws`);
      url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
      url.searchParams.set('token', this.token);
      this.onStatus(this.attempt ? 'reconnect' : 'connecting');
      let socket;
      try { socket = new WebSocket(url.toString()); } catch { this.fallback(); return; }
      this.socket = socket;

      socket.addEventListener('open', () => {
        this.attempt = 0;
        this.stopPolling();
        this.onStatus('online');
        this.pingTimer = setInterval(() => {
          try { socket.send(JSON.stringify({ type: 'ping' })); } catch { /* закрылся */ }
        }, 25000);
      });
      socket.addEventListener('message', (event) => {
        let message = null;
        try { message = JSON.parse(event.data); } catch { return; }
        if (message.type === 'state' && message.state) this.onView(message.state);
        else if (message.type === 'error') this.onError(String(message.error || 'Отказ комнаты'));
      });
      socket.addEventListener('close', () => {
        if (this.closed) return;
        this.stopPing();
        this.retry();
      });
      socket.addEventListener('error', () => { try { socket.close(); } catch { /* уже закрыт */ } });
    }

    retry() {
      if (this.closed) return;
      const wait = RECONNECT_STEPS[Math.min(this.attempt, RECONNECT_STEPS.length - 1)];
      this.attempt += 1;
      this.onStatus(this.attempt > RECONNECT_STEPS.length ? 'polling' : 'reconnect');
      if (this.attempt > RECONNECT_STEPS.length) { this.fallback(); return; }
      setTimeout(() => this.connect(), wait);
    }

    fallback() {
      if (this.closed || this.pollTimer) return;
      this.onStatus('polling');
      const ask = async () => {
        if (this.closed) return;
        try {
          const answer = await this.http(
            `/rooms/${encodeURIComponent(this.roomId)}/poll?token=${encodeURIComponent(this.token)}`,
            { method: 'POST', body: {} },
          );
          if (answer.state) this.onView(answer.state);
        } catch { /* следующая попытка через пару секунд */ }
      };
      ask();
      this.pollTimer = setInterval(ask, POLL_MS);
      setTimeout(() => { this.attempt = 0; this.connect(); }, 15000);
    }

    /*
      Действие отправляется с requestId: сеть иногда доставляет один и тот же
      запрос дважды (двойное нажатие, повтор после разрыва), и повторный
      приказ не должен уйти на стол вторым разом — сервер запоминает id и
      отвечает тем же ответом, что и в первый раз.
    */
    send(action, payload = {}) {
      if (this.closed) return;
      const requestId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      const message = JSON.stringify({ type: 'action', action, payload, requestId });
      if (this.socket && this.socket.readyState === WebSocket.OPEN) {
        try { this.socket.send(message); return; } catch { /* упало — уйдём опросом */ }
      }
      this.http(
        `/rooms/${encodeURIComponent(this.roomId)}/poll?token=${encodeURIComponent(this.token)}`,
        { method: 'POST', body: { action, payload, requestId } },
      ).then((answer) => { if (answer.state) this.onView(answer.state); })
        .catch((error) => this.onError(String(error?.message || error)));
    }

    stopPing() { if (this.pingTimer) { clearInterval(this.pingTimer); this.pingTimer = 0; } }
    stopPolling() { if (this.pollTimer) { clearInterval(this.pollTimer); this.pollTimer = 0; } }
    stopSocket() {
      this.stopPing();
      if (!this.socket) return;
      const socket = this.socket;
      this.socket = null;
      try { socket.close(); } catch { /* уже закрыт */ }
    }
    close() { this.closed = true; this.stopPolling(); this.stopSocket(); }
  }

  /** Экран сетевой игры: вход, лобби и доска. */
  class Online {
    constructor(container, options = {}) {
      this.root = container;
      this.back = options.back || (() => {});
      this.view = null;
      this.board = null;
      this.link = null;
      this.status = 'offline';
      this.error = '';
      this.seenChat = 0;
      this.chatOpen = false;
      this.inviteWatcher = null;
    }

    start() {
      if (!backendBase()) { this.renderNoBackend(); return; }
      this.watchInvites();
      const invite = window.RoomInvite?.consume?.('kingdoms');
      if (invite?.room) { this.enterRoom(invite.room); return; }
      this.renderEntry();
    }

    watchInvites() {
      if (this.inviteWatcher) return;
      this.inviteWatcher = (event) => {
        const detail = event?.detail || {};
        if (detail.game !== 'kingdoms' || !detail.room) return;
        window.RoomInvite?.consume?.('kingdoms');
        this.enterRoom(detail.room);
      };
      window.addEventListener('roominvitechange', this.inviteWatcher);
    }

    async enterRoom(code) {
      this.renderEntry(`Входим в комнату ${code}…`);
      try {
        this.link?.close();
        this.link = this.makeLink(defaultName());
        await this.link.join(code);
      } catch (error) {
        this.link?.close();
        this.link = null;
        this.renderEntry(String(error?.message || error));
      }
    }

    renderNoBackend() {
      this.root.innerHTML = `
        <div class="kd-wrap"><section class="kd-card">
          <h2>Игра по сети не настроена</h2>
          <p>В приложении не указан адрес комнат «Царств». Игра против компьютера работает как обычно.</p>
          <div class="kd-row"><button type="button" class="kd-btn" data-back>Против компьютера</button></div>
        </section></div>`;
      this.root.querySelector('[data-back]').addEventListener('click', () => this.back());
    }

    renderEntry(message = '') {
      const saved = (() => { try { return localStorage.getItem(LS.room) || ''; } catch { return ''; } })();
      this.root.innerHTML = `
        <div class="kd-wrap"><section class="kd-card">
          <h2>Игра по сети</h2>
          <p>Хозяин создаёт комнату и говорит код, остальные входят по нему — до пяти царств за раз.
            Свободные места можно занять царями от игры.</p>
          <label class="kd-choice"><span>Ваше имя</span>
            <input type="text" data-name maxlength="24" value="${escapeHTML(defaultName())}"
              style="min-height:46px;border-radius:12px;border:1px solid rgba(99,102,241,.3);padding:0 12px;font:inherit" />
          </label>
          <div class="kd-row"><button type="button" class="kd-btn" data-create>Создать комнату</button></div>
          <label class="kd-choice"><span>Код комнаты</span>
            <input type="text" data-code maxlength="10" autocapitalize="characters" placeholder="например, KJ7QW"
              value="${escapeHTML(saved)}"
              style="min-height:46px;border-radius:12px;border:1px solid rgba(99,102,241,.3);padding:0 12px;font:inherit" />
          </label>
          <div class="kd-row">
            <button type="button" class="kd-btn kd-btn--ghost" data-join>Войти по коду</button>
            ${window.RoomQrScanner?.isAvailable?.() ? '<button type="button" class="kd-btn kd-btn--ghost" data-scan>Сканировать QR</button>' : ''}
          </div>
          <div class="kd-row"><button type="button" class="kd-btn kd-btn--ghost" data-back>Назад</button></div>
          <p class="kd-note" data-message>${escapeHTML(message)}</p>
        </section></div>`;

      const nameField = this.root.querySelector('[data-name]');
      const codeField = this.root.querySelector('[data-code]');
      const say = (text) => { this.root.querySelector('[data-message]').textContent = text; };
      const busy = (on) => { for (const b of this.root.querySelectorAll('.kd-card button')) b.disabled = on; };
      const open = async (fn) => {
        busy(true);
        say('Соединяемся…');
        try {
          this.link = this.makeLink(nameField.value);
          await fn();
        } catch (error) {
          this.link?.close();
          this.link = null;
          busy(false);
          say(String(error?.message || error));
        }
      };
      this.root.querySelector('[data-create]').addEventListener('click', () => open(() => this.link.create()));
      this.root.querySelector('[data-join]').addEventListener('click', () => open(() => this.link.join(codeField.value)));
      this.root.querySelector('[data-back]').addEventListener('click', () => { this.destroy(); this.back(); });
      this.root.querySelector('[data-scan]')?.addEventListener('click', () => {
        say('Наведите камеру на QR-код комнаты…');
        window.RoomQrScanner?.open?.();
      });
    }

    makeLink(name) {
      const link = new Link({
        onView: (view) => this.apply(view),
        onError: (text) => this.showError(text),
        onStatus: (status) => { this.status = status; this.paintStatus(); },
      });
      link.name = String(name || defaultName()).slice(0, 24) || 'Игрок';
      return link;
    }

    apply(view) {
      const wasPhase = this.view?.phase;
      this.view = view;
      if (view.phase === 'playing' && view.game) {
        if (!this.board || wasPhase !== 'playing') this.openBoard();
        this.board.applyView(view.game);
        this.paintChatBadge();
        this.paintStatus();
        return;
      }
      this.board = null;
      this.renderLobby();
    }

    net() {
      return {
        isHost: () => Boolean(this.view?.youAreHost),
        send: (action, payload) => this.link.send(action, payload),
        leave: () => { this.link.send('leave'); this.destroy(); this.back(); },
        // Итоги партии спрашивают, хозяин ли смотрит: «играть ещё раз» —
        // его решение, остальным там показывают, что он его принимает.
        youAreHost: () => Boolean(this.view?.youAreHost),
      };
    }

    openBoard() {
      this.board = new window.KingdomsUI.Board(this.root, this.net());
      this.mountChatButton();
    }

    renderLobby() {
      const view = this.view;
      if (!view) return;
      const typing = this.root.querySelector('[data-chat-text]');
      const draft = typing ? typing.value : '';
      const wasTyping = typing === document.activeElement;
      const you = view.you || {};
      const host = view.youAreHost;
      const seats = view.players.filter((one) => !one.left);
      const rows = seats.map((one) => `
        <div class="kd-seat${one.online ? '' : ' is-away'}" style="display:flex;justify-content:space-between;padding:8px 10px;border-radius:10px;background:var(--surface-soft,#f3f7ff);margin-bottom:6px">
          <span>${escapeHTML(one.name)}${one.host ? ' <b>хозяин</b>' : ''}</span>
          <span>${one.host ? 'начинает' : one.ready ? 'готов' : 'ждёт'}${one.online ? '' : ' · не в сети'}</span>
        </div>`).join('');

      this.root.innerHTML = `
        <div class="kd-wrap"><section class="kd-card">
          <h2>Комната ${escapeHTML(view.roomId)}</h2>
          <p class="kd-note">За столом ${view.tableSize} из ${view.maxPlayers} (минимум ${view.minPlayers})</p>
          <div class="kd-row">
            <span class="kd-room-code" style="font-family:monospace;font-size:20px;letter-spacing:2px;padding:8px 12px;background:var(--surface-soft,#f3f7ff);border-radius:10px">${escapeHTML(view.roomId)}</span>
            <button type="button" class="kd-btn kd-btn--ghost" data-copy>Копировать</button>
          </div>
          <div class="kd-row">
            <button type="button" class="kd-btn kd-btn--ghost" data-qr>QR-код</button>
            <button type="button" class="kd-btn kd-btn--ghost" data-friends>Друзья</button>
            <button type="button" class="kd-btn kd-btn--ghost" data-share>Ссылка</button>
          </div>
          <div>${rows}</div>
          ${host ? `
            <label class="kd-choice"><span>Царей от игры</span>
              <div class="kd-choice--wide" data-bots>
                ${[0, 1, 2, 3, 4].map((n) => `<button type="button" data-value="${n}" aria-pressed="${n === view.settings.bots}">${n}</button>`).join('')}
              </div>
            </label>` : `<p class="kd-note">Царей от игры выбирает хозяин комнаты: сейчас ${view.settings.bots}.</p>`}
          <div class="kd-row">
            ${host ? `<button type="button" class="kd-btn" data-start ${view.canStart ? '' : 'disabled'}>Начать партию</button>`
    : `<button type="button" class="kd-btn" data-ready>${you.ready ? 'Я не готов' : 'Я готов'}</button>`}
            <button type="button" class="kd-btn kd-btn--ghost" data-leave>Выйти</button>
          </div>
          <p class="kd-note" data-state></p>
          <p class="kd-note" data-message>${escapeHTML(this.error)}</p>
        </section></div>`;

      this.paintStatus();
      if (draft) {
        const field = this.root.querySelector('[data-chat-text]');
        if (field) { field.value = draft; if (wasTyping) { field.focus(); field.setSelectionRange(draft.length, draft.length); } }
      }
      const on = (name, fn) => this.root.querySelector(`[data-${name}]`)?.addEventListener('click', fn);
      on('copy', () => this.copyCode());
      on('qr', () => this.showQr());
      on('friends', () => this.inviteFriends());
      on('share', () => this.shareCode());
      on('leave', () => { this.link.send('leave'); this.destroy(); this.back(); });
      on('start', () => this.link.send('startGame'));
      on('ready', () => this.link.send('ready', { ready: !you.ready }));
      const bots = this.root.querySelector('[data-bots]');
      bots?.addEventListener('click', (event) => {
        const button = event.target.closest('button[data-value]');
        if (button) this.link.send('setSettings', { bots: Number(button.dataset.value) });
      });
    }

    mountChatButton() {
      // Переписка комнаты доступна через журнал партии на доске; отдельная
      // кнопка чата за столом не заводится — «Царства» короче «Двенадцати
      // колен», и лишняя плавающая кнопка тут больше мешает карте, чем помогает.
    }
    paintChatBadge() {}

    showQr() {
      const code = this.view?.roomId || '';
      if (!code) return;
      if (!window.RoomInvite?.openQr) { this.say('QR-код недоступен без сети'); return; }
      window.RoomInvite.openQr('kingdoms', code, 'Царства · вход в комнату');
    }

    inviteFriends() {
      const code = this.view?.roomId || '';
      if (!code) return;
      if (!window.GameFriendInvites?.open) { this.say('Список друзей пока недоступен'); return; }
      window.GameFriendInvites.open('kingdoms', code);
    }

    async shareCode() {
      const code = this.view?.roomId || '';
      if (!code) return;
      let url = '';
      try { url = await window.RoomInvite?.getShareUrl?.('kingdoms', code) || ''; } catch { url = ''; }
      const text = url ? `Играем в «Царства». Комната ${code}: ${url}` : `Играем в «Царства». Код комнаты: ${code}`;
      const tg = telegram();
      if (url && tg?.openTelegramLink) {
        tg.openTelegramLink(`https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(`Комната ${code}`)}`);
        return;
      }
      if (navigator.share) { navigator.share({ text }).catch(() => this.copyText(text)); return; }
      this.copyText(text);
    }

    copyText(text) {
      if (navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(text).then(() => this.say('Скопировано')).catch(() => this.say(text));
        return;
      }
      this.say(text);
    }

    copyCode() {
      const code = this.view?.roomId || '';
      if (!code) return;
      const done = () => this.say(`Код ${code} скопирован`);
      if (navigator.clipboard?.writeText) navigator.clipboard.writeText(code).then(done).catch(() => this.say(`Код комнаты: ${code}`));
      else this.say(`Код комнаты: ${code}`);
    }

    say(text) {
      this.error = text;
      const box = this.root.querySelector('[data-message]');
      if (box) box.textContent = text;
    }

    showError(text) {
      this.say(text);
      if (/комната не найдена/i.test(text)) this.renderEntry(text);
    }

    paintStatus() {
      const box = this.root.querySelector('[data-state]');
      if (!box) return;
      const words = {
        connecting: 'Подключение…', reconnect: 'Связь потеряна, восстанавливаем…',
        polling: 'Связь слабая: обновляем по запросу', online: 'В сети', offline: '',
      };
      box.textContent = words[this.status] || '';
    }

    destroy() {
      if (this.inviteWatcher) { window.removeEventListener('roominvitechange', this.inviteWatcher); this.inviteWatcher = null; }
      this.link?.close();
      this.link = null;
      this.board = null;
      this.view = null;
      document.querySelectorAll('.kd-sheet').forEach((node) => node.remove());
      window.KingdomsUI?.stopTimers();
    }
  }

  let current = null;
  window.KingdomsOnline = {
    available: () => Boolean(backendBase()),
    open(container, options) {
      current?.destroy();
      current = new Online(container, options);
      current.start();
      return current;
    },
    close() { current?.destroy(); current = null; },
    current: () => current,
  };
}());
