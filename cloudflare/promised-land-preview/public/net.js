// net.js — связь с комнатой.
//
// Здесь только разговор: кто я, куда стучаться и как доносить ходы. Ни правил,
// ни разметки — их знают engine.js и ui.js, и знать про сеть им незачем.
//
// Связей две, и вторая не запасная на бумаге, а рабочая. Сокет — когда он есть:
// ход уходит мгновенно и доска у всех дёргается одновременно. Опрос по HTTP —
// когда сокета нет: на слабой сотовой связи, за корпоративным прокси, внутри
// чужого веб-вида. Разница для игрока — доля секунды задержки, а не «игра не
// работает»; поэтому падение сокета не показывается ошибкой, а просто
// переводит комнату на опрос.

window.PromisedLandNet = (() => {
  'use strict';

  /*
    Куда стучаться. Пусто — значит на свой же адрес: страница и комнаты живут
    в одном воркере, и это не мелочь — нет ни CORS, ни разъезда версий. Мета
    оставлена на случай, когда игру положат в другое место, а комнаты нет.
  */
  const API = String(document.querySelector('meta[name="promised-land-api"]')?.content || '')
    .replace(/\/+$/, '');
  const url = (path) => `${API}${path}`;

  const POLL_MS = 1200;
  const SOCKET_TRIES = 2;

  /*
    Кто я. Приложение передаёт свой вечный номер в адресе — тогда вернувшийся
    в комнату застаёт своё место, а не новое. Когда номера нет (страницу
    открыли прямо по ссылке), заводится свой и запоминается в браузере: он
    хуже — переставят устройство, и место потеряется, — но лучше случайного
    каждый раз.
  */
  function identity() {
    const params = new URLSearchParams(location.search);
    const given = String(params.get('player') || '').replace(/[^A-Za-z0-9_:-]/g, '').slice(0, 64);
    if (given) return { playerId: given, name: String(params.get('name') || '').slice(0, 24) };
    let stored = '';
    try { stored = localStorage.getItem('promised-land-player') || ''; } catch { stored = ''; }
    if (!stored) {
      stored = 'g' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
      try { localStorage.setItem('promised-land-player', stored); } catch { /* приватный режим */ }
    }
    let name = '';
    try { name = localStorage.getItem('promised-land-name') || ''; } catch { name = ''; }
    return { playerId: stored, name };
  }

  function rememberName(name) {
    try { localStorage.setItem('promised-land-name', String(name || '').slice(0, 24)); } catch { /* пусто */ }
  }

  /*
    Последняя комната. Нужна не для удобства, а потому что телефон — это место,
    где вкладку закрывают не нарочно: пришёл звонок, кончилась память, случайно
    смахнули. Без этого игрок посреди партии оказывался бы у пустого поля ввода,
    не помня кода своей же комнаты, — а его уделы, долги и фишка всё это время
    стоят на доске и ждут именно его.
  */
  const ROOM_KEY = 'promised-land-room';
  const ROOM_TTL_MS = 6 * 60 * 60 * 1000;   // столько же живёт сама комната

  function remember(roomId, token) {
    try { localStorage.setItem(ROOM_KEY, JSON.stringify({ roomId, token, at: Date.now() })); }
    catch { /* приватный режим */ }
  }

  function lastRoom() {
    try {
      const saved = JSON.parse(localStorage.getItem(ROOM_KEY) || 'null');
      if (!saved?.roomId || !saved?.token) return null;
      // Помнить дольше, чем живёт комната, — обещать то, чего уже нет.
      if (Date.now() - Number(saved.at || 0) > ROOM_TTL_MS) return null;
      return { roomId: String(saved.roomId), token: String(saved.token) };
    } catch { return null; }
  }

  function forgetRoom() {
    try { localStorage.removeItem(ROOM_KEY); } catch { /* приватный режим */ }
  }

  /** Вернуться по сохранённому ключу. Комнаты может уже не быть — тогда отказ. */
  const rejoin = (roomId, token) =>
    ask('POST', `/api/rooms/${roomId}/poll?token=${encodeURIComponent(token)}`, {})
      .then((answer) => ({ roomId, token, view: answer.view || null }));

  async function ask(method, path, body) {
    const response = await fetch(url(path), {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload.ok === false) {
      throw Object.assign(new Error(payload.error || `Комната не ответила (${response.status})`),
        { code: payload.code || 'HTTP_ERROR', status: response.status });
    }
    return payload;
  }

  const createRoom = (name) => ask('POST', '/api/rooms', { ...identity(), name });
  const joinRoom = (code, name) => ask(
    'POST',
    `/api/rooms/${String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '')}/join`,
    { ...identity(), name },
  );

  /*
    Открытая комната. Держит связь, отдаёт вид наружу и принимает ходы. Ходы,
    отправленные при обрыве, не теряются: они ждут в очереди и уходят первым
    же запросом — иначе нажатие «бросить жребий» в самый неудачный миг просто
    пропало бы, и игрок нажал бы ещё раз, походив дважды.
  */
  function open({ roomId, token, onView, onError, onLink }) {
    let socket = null;
    let polling = false;
    let stopped = false;
    let timer = 0;
    let tries = 0;
    let counter = 0;
    const queue = [];

    const tell = (mode) => { if (onLink) onLink(mode); };

    function send(action, payload = {}) {
      if (stopped) return;
      const message = { action, payload, requestId: `${Date.now().toString(36)}-${(counter += 1)}` };
      if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: 'action', ...message }));
        return;
      }
      queue.push(message);
      if (polling) { clearTimeout(timer); timer = setTimeout(poll, 0); }
    }

    async function poll() {
      if (stopped) return;
      const next = queue.shift() || {};
      try {
        const answer = await ask('POST', `/api/rooms/${roomId}/poll?token=${encodeURIComponent(token)}`, next);
        if (answer.closed) { close(); return; }
        if (answer.view && onView) onView(answer.view);
      } catch (error) {
        if (error.status === 403) { close(); if (onError) onError(error); return; }
        // Отказ по делу — «сейчас не ваш ход», «настройки меняет хозяин» — это
        // ответ: его показывают и второй раз не переспрашивают.
        if (error.status === 409) { if (onError) onError(error); }
        // Обрыв — не ответ. Ход возвращается в очередь и уходит следующим же
        // запросом: комната узнаёт его по номеру и дважды не сделает. Молчать
        // здесь нельзя — нажатие просто пропало бы, и человек нажал бы ещё раз.
        else if (next.action) queue.unshift(next);
      }
      if (!stopped) timer = setTimeout(poll, queue.length ? 0 : POLL_MS);
    }

    function startPolling() {
      if (polling || stopped) return;
      polling = true;
      tell('poll');
      poll();
    }

    function connect() {
      if (stopped) return;
      let address;
      try {
        address = new URL(url(`/api/rooms/${roomId}/ws?token=${encodeURIComponent(token)}`), location.href);
        address.protocol = address.protocol === 'http:' ? 'ws:' : 'wss:';
      } catch { startPolling(); return; }
      let live = false;
      try { socket = new WebSocket(address.toString()); } catch { startPolling(); return; }

      socket.addEventListener('open', () => {
        live = true;
        tries = 0;
        tell('socket');
        while (queue.length) socket.send(JSON.stringify({ type: 'action', ...queue.shift() }));
      });
      socket.addEventListener('message', (event) => {
        let data;
        try { data = JSON.parse(event.data); } catch { return; }
        if (data.type === 'view' && onView) onView(data.view);
        else if (data.type === 'error' && onError) onError(data);
      });
      socket.addEventListener('close', () => {
        socket = null;
        if (stopped) return;
        tries += 1;
        // Сокет, не открывшийся ни разу, здесь и не откроется: сеть его не
        // пускает. Открывшийся и упавший — просто обрыв, и его стоит поднять.
        if (!live || tries > SOCKET_TRIES) { startPolling(); return; }
        timer = setTimeout(connect, 400 * tries);
      });
      socket.addEventListener('error', () => { /* разберёт close */ });
    }

    function close() {
      stopped = true;
      clearTimeout(timer);
      if (socket) { try { socket.close(1000, 'Выход'); } catch { /* уже закрыт */ } socket = null; }
    }

    connect();
    return { send, close, roomId, token };
  }

  return { identity, rememberName, createRoom, joinRoom, rejoin, remember, lastRoom, forgetRoom, open };
})();
