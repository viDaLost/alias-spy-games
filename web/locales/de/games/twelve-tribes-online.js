/* global goToMainMenu */
// «Двенадцать колен» по сети: комната, лобби и переписка.
//
// Здесь нет ни одного правила игры и ни одной карты. Партию ведёт сервер
// (cloudflare/twelve-tribes-worker), а стол рисует twelve-tribes.js — тот же
// самый, что и за одним столом. Этот файл держит то, чего нет у игры за одним
// столом: вход в комнату, список людей, настройки хозяина, переписку и связь,
// которая рвётся.
//
// Почему связь отдельным файлом. Потому что рвётся она всегда, и обходиться с
// этим надо в одном месте: сокет закрылся — переподключиться; переподключиться
// не вышло — спрашивать состояние по одному запросу в две секунды; комната не
// нашлась — сказать об этом словами, а не пустым экраном.

(function () {
  'use strict';

  const LS = {
    guest: 'tt_guest_id',
    room: 'tt_room_id',
    name: 'tt_player_name',
  };
  const RECONNECT_STEPS = [1000, 2000, 4000, 8000, 10000];
  const POLL_MS = 2500;

  /*
    Адрес сервера комнат берётся из разметки, как у остальных сетевых игр. Нет
    адреса — нет и сети: игра честно говорит об этом и предлагает стол на одного,
    а не молча показывает вертушку.
  */
  function backendBase() {
    const fromWindow = String(window.TWELVE_TRIBES_BACKEND_URL || '').trim();
    const fromMeta = String(document.querySelector('meta[name="twelve-tribes-backend"]')?.content || '').trim();
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
    return String(user?.first_name || user?.username || 'Spieler').slice(0, 24);
  }

  const escapeHTML = (value) => String(value == null ? '' : value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  const normalizeCode = (value) => String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10);

  /*
    Связь с комнатой. Сокет, переподключение и запасной опрос — всё здесь, и
    наружу выходит одно: «пришло новое состояние» и «случилась беда».
  */
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
        if (!response.ok || !payload?.ok) throw new Error(payload?.error || `Server antwortete ${response.status}`);
        return payload;
      } catch (error) {
        if (error?.name === 'AbortError') throw new Error('Server antwortet zu langsam');
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
        // Пинг держит соединение живым там, где посредник рвёт тихие сокеты.
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

    /*
      Переподключение с нарастающей паузой, а после пятой попытки — опрос по
      одному запросу. Сокет режут и сети, и посредники, и спящие вкладки;
      игра от этого не должна кончаться.
    */
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
      // Сокет всё равно пробуем: связь возвращается чаще, чем кажется.
      setTimeout(() => { this.attempt = 0; this.connect(); }, 15000);
    }

    send(action, payload = {}) {
      if (this.closed) return;
      const message = JSON.stringify({ type: 'action', action, payload });
      if (this.socket && this.socket.readyState === WebSocket.OPEN) {
        try { this.socket.send(message); return; } catch { /* упало — уйдём опросом */ }
      }
      this.http(
        `/rooms/${encodeURIComponent(this.roomId)}/poll?token=${encodeURIComponent(this.token)}`,
        { method: 'POST', body: { action, payload, requestId: `${Date.now()}-${Math.random().toString(16).slice(2)}` } },
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

    close() {
      this.closed = true;
      this.stopPolling();
      this.stopSocket();
    }
  }

  /*
    Экран сетевой игры: вход, лобби и стол. Один объект на весь сеанс — он же
    и хранит последний вид комнаты, потому что и лобби, и стол рисуются из
    одного и того же.
  */
  class Online {
    constructor(container, options = {}) {
      this.root = container;
      this.back = options.back || (() => {});
      this.view = null;
      this.table = null;
      this.link = null;
      this.status = 'offline';
      this.error = '';
      this.seenChat = 0;
      this.chatOpen = false;
      this.inviteWatcher = null;
    }

    start() {
      if (!backendBase()) { this.renderNoBackend(); return; }
      /*
        Пришли по ссылке или отсканировали код — входим сразу, не спрашивая
        ничего: человек уже сказал, куда идёт, и второй экран с полем для кода
        был бы издевательством.
      */
      this.watchInvites();
      const invite = window.RoomInvite?.consume?.('twelve-tribes');
      if (invite?.room) { this.enterRoom(invite.room); return; }
      this.renderEntry();
    }

    /*
      Код, прочитанный камерой, приходит событием — сканер общий на всё
      приложение и раскладывает ссылку сам. Если игра не наша, он же уведёт в
      нужный экран, а здесь останется тишина.
    */
    watchInvites() {
      if (this.inviteWatcher) return;
      this.inviteWatcher = (event) => {
        const detail = event?.detail || {};
        if (detail.game !== 'twelve-tribes' || !detail.room) return;
        window.RoomInvite?.consume?.('twelve-tribes');
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

    /* ——— нет адреса сервера ——— */
    renderNoBackend() {
      this.root.innerHTML = `
        <div class="tt-wrap"><section class="tt-setup">
          <h2>Игра по сети не настроена</h2>
          <p>В приложении не указан адрес комнат «Двенадцати колен». Игра за одним столом
            работает как обычно — соперников ведёт само приложение.</p>
          <div class="tt-row">
            <button type="button" class="tt-btn" data-back>За один стол</button>
          </div>
        </section></div>`;
      this.root.querySelector('[data-back]').addEventListener('click', () => this.back());
    }

    /* ——— вход: создать комнату или войти по коду ——— */
    renderEntry(message = '') {
      const saved = (() => { try { return localStorage.getItem(LS.room) || ''; } catch { return ''; } })();
      this.root.innerHTML = `\n        <div class="tt-wrap"><section class="tt-setup">\n          <h2>Игра по сети</h2>\n          <p>Соберите стол с друзьями: хозяин создаёт комнату и говорит код, остальные входят\n            по нему. Свободные места можно занять соперниками от игры.</p>\n          <label class="tt-field">\n            <span>Dein Name</span>\n            <input type="text" data-name maxlength="24" value="${escapeHTML(defaultName())}" />\n          </label>\n          <div class="tt-row">\n            <button type="button" class="tt-btn" data-create>Raum erstellen</button>\n          </div>\n          <label class="tt-field">\n            <span>Raumcode</span>\n            <input type="text" data-code maxlength="10" autocapitalize="characters"\n              placeholder="например, KJ7QW" value="${escapeHTML(saved)}" />\n          </label>\n          <div class="tt-row">\n            <button type="button" class="tt-btn tt-btn--ghost" data-join>Mit Code beitreten</button>\n            ${window.RoomQrScanner?.isAvailable?.()
    ? '<button type="button" class="tt-btn tt-btn--ghost" data-scan>Scannen QR</button>' : ''}\n          </div>\n          <div class="tt-row">\n            <button type="button" class="tt-btn tt-btn--ghost" data-back>Zurück</button>\n          </div>\n          <p class="tt-note" data-message>${escapeHTML(message)}</p>
        </section></div>`;

      const nameField = this.root.querySelector('[data-name]');
      const codeField = this.root.querySelector('[data-code]');
      const say = (text) => { this.root.querySelector('[data-message]').textContent = text; };
      const busy = (on) => {
        for (const button of this.root.querySelectorAll('.tt-setup button')) button.disabled = on;
      };

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
      /*
        Сканер камеры — общий на всё приложение: он же читает коды «Квартета» и
        «Библейского художника». Прочитанный код приходит сюда не ответом, а
        событием: сканер сначала раскладывает ссылку на игру и комнату, и если
        игра не наша — уводит в её экран.
      */
      this.root.querySelector('[data-scan]')?.addEventListener('click', () => {
        say('Richte die Kamera auf QR-код комнаты…');
        window.RoomQrScanner?.open?.();
      });
    }

    makeLink(name) {
      const link = new Link({
        onView: (view) => this.apply(view),
        onError: (text) => this.showError(text),
        onStatus: (status) => { this.status = status; this.paintStatus(); },
      });
      link.name = String(name || defaultName()).slice(0, 24) || 'Spieler';
      return link;
    }

    /* ——— пришёл новый вид комнаты ——— */
    apply(view) {
      const wasPhase = this.view?.phase;
      this.view = view;
      if (view.phase === 'playing' && view.game) {
        if (!this.table || wasPhase !== 'playing') this.openTable();
        this.table.applyView(view);
        this.paintChatBadge();
        this.paintStatus();
        return;
      }
      if (this.table) { this.table = null; }
      this.renderLobby();
    }

    net() {
      return {
        send: (action, payload) => this.link.send(action, payload),
        leave: () => { this.link.send('leave'); this.destroy(); this.back(); },
        youAreHost: () => Boolean(this.view?.youAreHost),
      };
    }

    openTable() {
      this.table = new window.TwelveTribesUI.Table(this.root, this.net());
      this.table.buildTable();
      this.mountChatButton();
    }

    /* ——— лобби ——— */
    renderLobby() {
      const view = this.view;
      if (!view) return;
      /*
        Лобби перерисовывается на каждую весть из комнаты — вошёл человек,
        сказал слово, хозяин передвинул настройку. Недописанное сообщение при
        этом пропадало: набранное надо сохранить и вернуть, вместе с курсором.
      */
      const typing = this.root.querySelector('[data-chat-text]');
      const draft = typing ? typing.value : '';
      const wasTyping = typing === document.activeElement;
      const you = view.you || {};
      const host = view.youAreHost;
      const seats = view.players.filter((one) => !one.left);
      const rows = seats.map((one) => `
        <div class="tt-seat${one.online ? '' : ' is-away'}">
          <span class="tt-seat-name">${escapeHTML(one.name)}${one.host ? ' <b>хозяин</b>' : ''}</span>
          <span class="tt-seat-state">${one.host ? 'сдаёт' : one.ready ? 'bereit' : 'ждёт'}${
  one.online ? '' : ' · offline'}</span>
        </div>`).join('');

      this.root.innerHTML = `\n        <div class="tt-wrap"><section class="tt-setup tt-lobby">\n          <div class="tt-lobby-head">\n            <div>\n              <h2>Raum ${escapeHTML(view.roomId)}</h2>
              <p class="tt-note">За столом ${view.tableSize} von ${view.maxPlayers}</p>
            </div>
            <span class="tt-link-state" data-state></span>
          </div>
          <div class="tt-room-line">
            <span class="tt-room-code" data-room-code>${escapeHTML(view.roomId)}</span>\n            <button type="button" class="tt-btn tt-btn--ghost" data-copy>Kopieren</button>\n          </div>\n          <div class="tt-invites">\n            <button type="button" class="tt-invite" data-qr><b>▦</b>QR-Code</button>\n            <button type="button" class="tt-invite" data-friends><b>👥</b>Freunde</button>\n            <button type="button" class="tt-invite" data-share><b>↗</b>Ссылка</button>\n          </div>\n          <div class="tt-seats">${rows}</div>
          ${host ? `
            <label class="tt-choice">
              <span>Соперников от игры</span>
              <div class="tt-choice--wide" data-bots>
                ${[0, 1, 2, 3, 4, 5, 6].map((many) => `<button type="button" data-value="${many}"
                  aria-pressed="${many === view.settings.bots}">${many}</button>`).join('')}\n              </div>\n            </label>\n            <label class="tt-choice">\n              <span>Partie</span>\n              <div data-target>\n                <button type="button" data-value="0" aria-pressed="${view.settings.target === 0}"
                  >Раздача<small>кто первым сбросит</small></button>
                <button type="button" data-value="300" aria-pressed="${view.settings.target === 300}"
                  >До 300<small>очки за чужие карты</small></button>
              </div>
            </label>` : `
            <p class="tt-note">Настройки партии выбирает хозяин комнаты:
              ${view.settings.target ? 'до 300 очков' : 'одна раздача'},
              соперников от игры — ${view.settings.bots}.</p>`}\n          <div class="tt-chat" data-chat>\n            <div class="tt-chat-lines" data-lines></div>\n            <form class="tt-chat-send" data-chat-form>\n              <input type="text" data-chat-text maxlength="200" placeholder="Nachricht…" />\n              <button type="submit" class="tt-btn" data-chat-send>→</button>\n            </form>\n          </div>\n          <div class="tt-row">\n            ${host
    ? `<button type="button" class="tt-btn" data-start ${view.canStart ? '' : 'disabled'}>Сдавать</button>`
    : `<button type="button" class="tt-btn" data-ready>${you.ready ? 'Я не готов' : 'Я готов'}</button>`}\n            <button type="button" class="tt-btn tt-btn--ghost" data-leave>Verlassen</button>\n          </div>\n          <p class="tt-note" data-message>${escapeHTML(this.error)}</p>
        </section></div>`;

      this.paintStatus();
      this.paintChat();
      if (draft) {
        const field = this.root.querySelector('[data-chat-text]');
        if (field) {
          field.value = draft;
          if (wasTyping) { field.focus(); field.setSelectionRange(draft.length, draft.length); }
        }
      }

      const on = (name, fn) => this.root.querySelector(`[data-${name}]`)?.addEventListener('click', fn);
      on('copy', () => this.copyCode());
      on('qr', () => this.showQr());
      on('friends', () => this.inviteFriends());
      on('share', () => this.shareCode());
      on('leave', () => { this.link.send('leave'); this.destroy(); this.back(); });
      on('start', () => this.link.send('startGame'));
      on('ready', () => this.link.send('ready', { ready: !you.ready }));

      const pick = (group, apply) => {
        const box = this.root.querySelector(`[data-${group}]`);
        if (!box) return;
        box.addEventListener('click', (event) => {
          const button = event.target.closest('button[data-value]');
          if (button) apply(Number(button.dataset.value));
        });
      };
      pick('bots', (bots) => this.link.send('setSettings', { ...view.settings, bots }));
      pick('target', (target) => this.link.send('setSettings', { ...view.settings, target }));

      const form = this.root.querySelector('[data-chat-form]');
      form?.addEventListener('submit', (event) => {
        event.preventDefault();
        const field = this.root.querySelector('[data-chat-text]');
        const text = String(field.value || '').trim();
        if (!text) return;
        this.link.send('chat', { text });
        field.value = '';
      });
    }

    /* ——— переписка ——— */
    paintChat(box = this.root.querySelector('[data-lines]')) {
      if (!box || !this.view) return;
      const lines = this.view.chat || [];
      box.innerHTML = lines.length
        ? lines.map((line) => `<div class="tt-chat-line"><b>${escapeHTML(line.name)}</b> ${escapeHTML(line.text)}</div>`).join('')
        : '<div class="tt-chat-empty">Пока тихо. Напишите первым.</div>';
      box.scrollTop = box.scrollHeight;
      this.seenChat = lines.length;
      this.paintChatBadge();
    }

    /*
      Кнопка переписки за столом. Во время партии лобби не видно, а сказать
      что-то надо: она висит углом стола и считает непрочитанное.
    */
    mountChatButton() {
      const wrap = this.root.querySelector('.tt-wrap');
      if (!wrap || wrap.querySelector('[data-chat-fab]')) return;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'tt-chat-fab';
      button.dataset.chatFab = '1';
      button.innerHTML = 'Chat<span class="tt-chat-badge" data-chat-badge hidden>0</span>';
      button.addEventListener('click', () => this.openChatSheet());
      wrap.appendChild(button);
      this.paintChatBadge();
    }

    paintChatBadge() {
      const badge = this.root.querySelector('[data-chat-badge]');
      if (!badge || !this.view) return;
      const unread = Math.max(0, (this.view.chat || []).length - this.seenChat);
      badge.hidden = unread === 0;
      badge.textContent = String(Math.min(unread, 99));
      if (this.chatOpen) this.paintChat(document.querySelector('.tt-sheet [data-lines]'));
    }

    openChatSheet() {
      const sheet = document.createElement('div');
      sheet.className = 'tt-sheet';
      sheet.innerHTML = `<div class="tt-sheet-card">\n        <h3>Переписка</h3>\n        <div class="tt-chat">\n          <div class="tt-chat-lines" data-lines></div>\n          <form class="tt-chat-send" data-chat-form>\n            <input type="text" data-chat-text maxlength="200" placeholder="Nachricht…" />\n            <button type="submit" class="tt-btn" data-chat-send>→</button>\n          </form>\n        </div>\n        <button type="button" class="tt-btn tt-btn--ghost" data-cancel>Schließen</button>\n      </div>`;
      sheet.addEventListener('click', (event) => {
        if (event.target.closest('[data-cancel]') || event.target === sheet) {
          this.chatOpen = false;
          sheet.remove();
        }
      });
      sheet.querySelector('[data-chat-form]').addEventListener('submit', (event) => {
        event.preventDefault();
        const field = sheet.querySelector('[data-chat-text]');
        const text = String(field.value || '').trim();
        if (!text) return;
        this.link.send('chat', { text });
        field.value = '';
      });
      document.body.appendChild(sheet);
      this.chatOpen = true;
      this.paintChat(sheet.querySelector('[data-lines]'));
    }

    /* ——— позвать в комнату ——— */
    /*
      Три дороги к одной комнате, и все три — общие для приложения: QR рисует
      RoomInvite (он же знает, как превратить код в ссылку мини-приложения),
      друзей зовёт GameFriendInvites из списка избранных, ссылку отдаёт Telegram.
      Своего здесь ничего нет нарочно: человек, позвавший друга в «Квартет»,
      зовёт его сюда теми же тремя кнопками.
    */
    showQr() {
      const code = this.view?.roomId || '';
      if (!code) return;
      if (!window.RoomInvite?.openQr) { this.say('QR-код недоступен без сети'); return; }
      window.RoomInvite.openQr('twelve-tribes', code, 'Двенадцать колен · вход в комнату');
    }

    inviteFriends() {
      const code = this.view?.roomId || '';
      if (!code) return;
      if (!window.GameFriendInvites?.open) { this.say('Список друзей пока недоступен'); return; }
      window.GameFriendInvites.open('twelve-tribes', code);
    }

    async shareCode() {
      const code = this.view?.roomId || '';
      if (!code) return;
      let url = '';
      try { url = await window.RoomInvite?.getShareUrl?.('twelve-tribes', code) || ''; } catch { url = ''; }
      const text = url
        ? `Играем в «Двенадцать колен». Комната ${code}: ${url}`
        : `Играем в «Двенадцать колен». Код комнаты: ${code}`;
      const tg = telegram();
      if (url && tg?.openTelegramLink) {
        tg.openTelegramLink(`https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(`Raum ${code}`)}`);
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

    /* ——— мелочи ——— */
    copyCode() {
      const code = this.view?.roomId || '';
      if (!code) return;
      const done = () => this.say(`Code ${code} kopiert`);
      if (navigator.clipboard?.writeText) navigator.clipboard.writeText(code).then(done).catch(() => this.say(`Raumcode: ${code}`));
      else this.say(`Raumcode: ${code}`);
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
        connecting: 'Verbindung wird hergestellt…',
        reconnect: 'Связь потеряна, восстанавливаем…',
        polling: 'Связь слабая: обновляем по запросу',
        online: 'В сети',
        offline: '',
      };
      box.textContent = words[this.status] || '';
      box.dataset.kind = this.status;
    }

    destroy() {
      if (this.inviteWatcher) {
        window.removeEventListener('roominvitechange', this.inviteWatcher);
        this.inviteWatcher = null;
      }
      this.link?.close();
      this.link = null;
      this.table = null;
      this.view = null;
      /*
        Код комнаты забывается при выходе. Он остаётся в памяти браузера
        нарочно — чтобы вернуться в ту же комнату после обрыва связи, — но
        только пока из неё не вышли сами. Иначе приложение до скончания века
        считает человека сидящим в давно закрытой комнате: так и показывалось
        в админ-панели, кнопкой наблюдения за комнатой, которой уже нет.
      */
      try { localStorage.removeItem(LS.room); } catch { /* приватный режим */ }
      document.querySelector('.tt-sheet')?.remove();
      window.TwelveTribesUI?.stopTimers();
    }
  }

  let current = null;

  window.TwelveTribesOnline = {
    available: () => Boolean(backendBase()),
    open(container, options) {
      current?.destroy();
      current = new Online(container, options);
      current.start();
      return current;
    },
    close() { current?.destroy(); current = null; },
    /*
      Ход наружу для проверок: без него проверка не может попросить комнату о
      том, о чём кнопки не просят, — например походить не в свою очередь. А
      спросить это надо: сервер обязан отказать.
    */
    current: () => current,
  };
}());
