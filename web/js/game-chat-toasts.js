(() => {
  // Всплывающие сообщения чата для игр с общей комнатой.
  //
  // По просьбе игрока: «сообщения в чатах групповых игр могли бы всплывать
  // сверху как уведомления, чтобы не отвлекаться во время игры на сам чат».
  //
  // Модуль один на три игры — «Квартет», «Библейский художник» и «Шпион».
  // Чаты у них устроены по-разному (ящик снизу, карточка в раскладке,
  // сворачиваемый блок), но приходит в них одно и то же: список сообщений
  // целиком в очередном состоянии комнаты. Поэтому модуль и получает список, а
  // не отдельное сообщение: он сам решает, что из него новое.
  //
  // Три правила, без которых уведомления мешали бы больше, чем помогали:
  //
  //   * своё сообщение не всплывает — его только что отправили;
  //   * при входе в комнату не всплывает ничего: первый список сообщений — это
  //     история, а не новости, и десять карточек подряд на старте никому не
  //     нужны;
  //   * пока чат на экране, уведомлений нет: они повторяли бы то, что и так
  //     видно. «На экране» — не «открыт»: у «Художника» чат стоит карточкой в
  //     раскладке и легко уезжает за край при прокрутке.

  if (window.GameChatToasts) return;

  const MAX_VISIBLE = 3;
  const LIFETIME_MS = 5000;
  // Лента комнаты обрезается сервером, а вкладка живёт долго: помним столько
  // же, сколько влезает в самую длинную ленту, и не растём без предела.
  const MAX_REMEMBERED = 200;

  const rooms = new Map();

  function roomState(key) {
    let room = rooms.get(key);
    if (!room) {
      room = { seen: new Set(), primed: false };
      rooms.set(key, room);
    }
    return room;
  }

  function host() {
    let element = document.getElementById('game-chat-toasts');
    if (!element) {
      element = document.createElement('div');
      element.id = 'game-chat-toasts';
      element.className = 'chat-toasts';
      // Уведомления не должны перебивать чтение экрана игроком: они
      // объявляются вежливо и не забирают фокус.
      element.setAttribute('role', 'status');
      element.setAttribute('aria-live', 'polite');
      document.body.appendChild(element);
    }
    return element;
  }

  function dismiss(toast) {
    if (!toast || toast.dataset.leaving === '1') return;
    toast.dataset.leaving = '1';
    clearTimeout(Number(toast.dataset.timer || 0));
    toast.classList.add('is-leaving');
    const done = () => {
      toast.remove();
      const box = document.getElementById('game-chat-toasts');
      if (box && !box.children.length) box.remove();
    };
    // На случай отключённых переходов: transitionend тогда не приходит.
    toast.addEventListener('transitionend', done, { once: true });
    setTimeout(done, 400);
  }

  function show(message, onOpen) {
    const box = host();
    while (box.children.length >= MAX_VISIBLE) dismiss(box.firstElementChild);

    const toast = document.createElement('button');
    toast.type = 'button';
    toast.className = 'chat-toast';
    const name = document.createElement('span');
    name.className = 'chat-toast__name';
    name.textContent = message.name || 'Игрок';
    const text = document.createElement('span');
    text.className = 'chat-toast__text';
    text.textContent = message.text || '';
    toast.append(name, text);
    toast.addEventListener('click', () => {
      dismiss(toast);
      try { onOpen?.(); } catch { /* игра уже закрыта */ }
    });
    box.appendChild(toast);

    requestAnimationFrame(() => toast.classList.add('is-shown'));
    toast.dataset.timer = String(setTimeout(() => dismiss(toast), LIFETIME_MS));
  }

  const visible = (value) => {
    if (typeof value === 'function') {
      try { return Boolean(value()); } catch { return false; }
    }
    return Boolean(value);
  };

  const keyOf = (message, index) => String(
    message?.id ?? `${message?.at || ''}|${message?.playerId || ''}|${message?.text || ''}|${index}`,
  );

  /**
   * Сверяет ленту комнаты с уже показанным и всплывает тем, что появилось.
   *
   * @param {object} options
   * @param {string} options.key       комната: своя лента у каждой
   * @param {Array}  options.messages  лента целиком, как её прислал сервер
   * @param {string} [options.selfId]  свой playerId — свои реплики не всплывают
   * @param {boolean|Function} [options.chatVisible] чат виден на экране
   * @param {Function} [options.onOpen] открыть чат по нажатию на уведомление
   */
  function sync({ key, messages, selfId = '', chatVisible = false, onOpen } = {}) {
    if (!key || !Array.isArray(messages)) return;
    const room = roomState(key);
    const fresh = [];

    messages.forEach((message, index) => {
      const id = keyOf(message, index);
      if (room.seen.has(id)) return;
      room.seen.add(id);
      if (!room.primed) return;
      if (selfId && message?.playerId === selfId) return;
      fresh.push(message);
    });

    if (room.seen.size > MAX_REMEMBERED) {
      room.seen = new Set([...room.seen].slice(-MAX_REMEMBERED));
    }
    if (!room.primed) {
      room.primed = true;
      return;
    }
    if (!fresh.length || visible(chatVisible)) return;

    // Пришло разом больше, чем помещается: показываем последние — свежее важнее.
    for (const message of fresh.slice(-MAX_VISIBLE)) show(message, onOpen);
  }

  /** Забыть комнату и убрать уведомления — при выходе из игры. */
  function reset(key) {
    if (key) rooms.delete(key); else rooms.clear();
    document.getElementById('game-chat-toasts')?.remove();
  }

  window.GameChatToasts = { sync, reset };
})();
