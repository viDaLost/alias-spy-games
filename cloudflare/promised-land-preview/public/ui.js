// ui.js — экран игры.
//
// Поле здесь только читается. На клетке 31 пиксель по стороне при ширине
// экрана 390 — это меньше пальца, и попытка сделать её кнопкой с выбором
// действия обернулась бы промахами. Поэтому на клетке нет ни слова текста:
// полоса цвета удела, ступень поселения, фишки игроков. Все действия — в
// середине кольца и в шторке уделов, где строки полноразмерные.

(() => {
  'use strict';

  const B = window.PromisedLandBoard;
  const E = window.PromisedLandEngine;
  const Bots = window.PromisedLandBots;
  const CARDS = window.PromisedLandCards;

  const PLAYER_COLORS = ['#4f46e5', '#e11d48', '#0f9d58', '#d97706', '#7c3aed', '#0891b2'];
  const BOT_NAMES = ['Ефрем', 'Асаф', 'Овадия', 'Иеффай', 'Варух'];

  /*
    Картинки живут в web/assets/promised-land, а превью раздаёт только своё
    public/, поэтому сюда их кладёт scripts/sync-promised-land-art.mjs. Путь
    берётся из меты: когда игра переедет в приложение, поменяется одна строка
    в разметке, а не пути по всему файлу.
  */
  const ART = String(document.querySelector('meta[name="promised-land-art"]')?.content || 'art/')
    .replace(/\/*$/, '/');
  const art = (dir, name) => `${ART}${dir}/${name}.webp`;
  // Порядок тот же, что у B.LEVELS: колодец, шатёр, дом, ограда, башня.
  const BUILD_ART = ['build-well', 'build-tent', 'build-house', 'build-wall', 'build-tower'];
  const TOKEN_ART = ['token-staff', 'token-jar', 'token-sheaf', 'token-lamp', 'token-scroll', 'token-sling'];
  const tokenOf = (player) => TOKEN_ART[state.players.indexOf(player) % TOKEN_ART.length];

  /** Картинка, которая молча исчезает, если файла нет: дыра лучше крестика. */
  const img = (src, className, alt = '') => {
    const node = el('img', className);
    node.src = src;
    node.alt = alt;
    node.loading = 'lazy';
    node.decoding = 'async';
    node.addEventListener('error', () => { node.hidden = true; }, { once: true });
    return node;
  };

  const $ = (id) => document.getElementById(id);

  const parentOrigin = (() => {
    try { return new URL(new URLSearchParams(location.search).get('parentOrigin')).origin; }
    catch { return ''; }
  })();
  const inApp = window.parent !== window && Boolean(parentOrigin);
  document.body.classList.toggle('is-embedded', inApp);
  const askApp = (type, room) => {
    if (inApp) window.parent.postMessage({ type: `promised-land:${type}`, room }, parentOrigin);
  };
  window.addEventListener('message', (event) => {
    if (!inApp || event.source !== window.parent || event.origin !== parentOrigin) return;
    if (event.data?.type !== 'promised-land:invite' || !/^[A-Z0-9]{5}$/.test(event.data.room || '')) return;
    showScreen('online');
    startOnline();
    $('online-code').value = event.data.room;
  });
  if (inApp) {
    $('online-scan').hidden = false;
    $('lobby-qr').hidden = false;
    $('online-scan').addEventListener('click', () => askApp('scan'));
    $('lobby-qr').addEventListener('click', () => askApp('qr', roomView?.roomId));
    askApp('ready');
  }

  function orientationTip() {
    document.getElementById('orientation-tip')?.remove();
    if (!window.matchMedia('(orientation: portrait)').matches) return;
    const tip = document.createElement('div');
    tip.id = 'orientation-tip';
    tip.className = 'orientation-tip';
    tip.setAttribute('role', 'status');
    const text = document.createElement('p');
    text.textContent = 'Совет: горизонтально играть удобнее — поле будет крупнее. Можно продолжить и вертикально.';
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'btn btn--ghost';
    close.textContent = 'Понятно';
    close.addEventListener('click', () => tip.remove());
    tip.append(text, close);
    $('game').prepend(tip);
  }

  /*
    Кость — кубик из шести граней, а не квадратик с цифрой. Точки раскладываются
    по сетке 3×3: так их читают на настоящих костях, и считать их не надо —
    рисунок узнаётся целиком.
  */
  const PIPS = {
    1: ['2 / 2'],
    2: ['1 / 1', '3 / 3'],
    3: ['1 / 1', '2 / 2', '3 / 3'],
    4: ['1 / 1', '1 / 3', '3 / 1', '3 / 3'],
    5: ['1 / 1', '1 / 3', '2 / 2', '3 / 1', '3 / 3'],
    6: ['1 / 1', '1 / 3', '2 / 1', '2 / 3', '3 / 1', '3 / 3'],
  };
  /** Кубик, повёрнутый нужной гранью к игроку. */
  const die = (value) => {
    const cube = document.createElement('b');
    cube.className = 'die';
    for (let face = 1; face <= 6; face += 1) {
      const side = document.createElement('i');
      side.className = 'die-face die-face--' + face;
      for (const area of PIPS[face]) {
        const pip = document.createElement('u');
        pip.style.gridArea = area;
        side.appendChild(pip);
      }
      cube.appendChild(side);
    }
    showFace(cube, value);
    return cube;
  };

  /* Поворот, при котором нужная грань смотрит на игрока. */
  const FACE_TURN = {
    1: 'rotateX(0deg) rotateY(0deg)',
    2: 'rotateY(-90deg)',
    3: 'rotateY(180deg)',
    4: 'rotateY(90deg)',
    5: 'rotateX(-90deg)',
    6: 'rotateX(90deg)',
  };
  const showFace = (cube, value) => {
    cube.dataset.value = String(value);
    cube.style.transform = FACE_TURN[value] || FACE_TURN[1];
  };

  const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };

  let state = null;
  let botTimer = 0;
  let sheetOpen = false;
  let lastHumanId = '';
  // Автоигра: ходы человека тоже ведёт разум соперников. Нужна, чтобы досмотреть
  // партию до юбилея, не нажимая, и чтобы попробовать правила, не разбираясь.
  let autoPlay = false;
  let teachAsked = false;
  let teachWanted = false;
  let dealtCard = null;
  /*
    Темп соперников. По умолчанию они ходят неспешно: за быстрым ходом не
    уследить — фишка прыгает, карта мелькает, и человек видит уже результат.
    Кому это не нужно, тот жмёт «Быстрее», и всё — пауза между шагами, кости,
    ход фишки — ускоряется вдвое с лишним.
  */
  const PACE = { calm: { wait: 900, speed: 1 }, quick: { wait: 260, speed: 0.42 } };
  let hurry = false;
  // Сцена в объёме. Её может не быть: WebGL на слабом устройстве не дают, и
  // тогда игра идёт на поле из разметки — оно работает всегда.
  let scene = null;

  // ————————————————————————————————————————————————— начало партии

  /*
    Экраны до партии. Их три: выбор способа игры, настройки партии за одним
    столом и комната для игры по сети. Показывается всегда ровно один — иначе
    на телефоне они лягут друг под другом и экран поедет.
  */
  function showScreen(name) {
    for (const id of ['mode', 'setup', 'online']) {
      const node = $(id);
      if (node) node.hidden = id !== name;
    }
    $('game').hidden = true;
    $('jubilee').hidden = true;
    window.scrollTo({ top: 0, behavior: 'auto' });
  }

  function modeScreen() {
    showScreen('mode');
    for (const card of document.querySelectorAll('.mode-card')) {
      card.addEventListener('click', () => {
        if (card.dataset.mode === 'online') { showScreen('online'); startOnline(); return; }
        // Уходя за один стол, комнату надо оставить: иначе место в ней держится
        // за ушедшим, а стол на шестерых считает и его.
        leaveRoom();
        showScreen('setup');
      });
    }
    $('mode-rules-btn')?.addEventListener('click', () => { $('rules').hidden = false; });
  }

  // ————————————————————————————————————————————————— комната по сети

  /*
    Игра по сети. Партию здесь не считают: доска, деньги и уделы живут на
    сервере, а отсюда уходит только имя хода — «бросить», «купить», «строить
    вот здесь». Иначе честной игры не выйдет: состояние, лежащее в браузере,
    правится во вкладке разработчика за полминуты.

    Поэтому кнопки хода ниже не раздваиваются на «за столом» и «по сети». Они
    просят ход по имени у act, и одно это место решает, звать ли движок рядом
    или отнести просьбу на сервер.
  */
  const Net = window.PromisedLandNet;

  let link = null;      // связь с комнатой; она же признак того, что игра по сети
  let roomView = null;  // последний присланный вид комнаты
  let mySeat = '';      // моё место за столом: «p0», «p1» …
  let onlineBound = false;
  // Гость, ушедший со счётного экрана ждать в комнату. Без этой отметки его
  // возвращала бы на счёт каждая рассылка: партия кончилась, а комната всё ещё
  // числится играющей, пока хозяин не вернёт в неё всех.
  let waitingInLobby = false;
  // Состояния приходят чередой, а показ хода занимает секунду с лишним. Без
  // очереди второй ход начал бы рисоваться поверх первого, и фишка поехала бы
  // из места, в котором её уже нет.
  let viewChain = Promise.resolve();

  function act(name, ...args) {
    if (link) { link.send('game', { name, args }); return true; }
    return E[name](state, ...args);
  }

  function startOnline() {
    if (!Net) { onlineFail('Игра по сети здесь недоступна.'); return; }
    if (!onlineBound) { bindOnline(); onlineBound = true; }
    onlineFail('');
    const me = Net.identity();
    if (!$('online-name').value) $('online-name').value = me.name || '';
    // Позвали ссылкой — код уже в адресе, и набирать его руками незачем.
    const invited = new URLSearchParams(location.search).get('room');
    if (invited && !$('online-code').value) {
      $('online-code').value = String(invited).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5);
    }
    showResume();
  }

  /** Кнопка возвращения — только когда возвращаться есть куда. */
  function showResume() {
    const saved = Net.lastRoom();
    const button = $('online-resume');
    button.hidden = !saved;
    if (saved) button.textContent = `Вернуться в комнату ${saved.roomId}`;
  }

  function bindOnline() {
    $('online-back').addEventListener('click', () => { leaveRoom(); showScreen('mode'); });
    $('online-resume').addEventListener('click', async () => {
      const saved = Net.lastRoom();
      if (!saved) { showResume(); return; }
      const returned = await enterRoom(() => Net.rejoin(saved.roomId, saved.token));
      // Комнаты уже нет или ключ протух — незачем звать туда второй раз.
      if (!returned) { Net.forgetRoom(); showResume(); }
    });
    $('online-create').addEventListener('click', () => enterRoom(() => Net.createRoom(nameField())));
    $('online-join').addEventListener('click', () => {
      const code = $('online-code').value.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (code.length < 4) { onlineFail('Код комнаты — пять знаков.'); return; }
      enterRoom(() => Net.joinRoom(code, nameField()));
    });
    $('lobby-ready').addEventListener('click', () => link?.send('ready', { ready: !roomView?.you?.ready }));
    $('lobby-start').addEventListener('click', () => link?.send('start'));
    $('lobby-share').addEventListener('click', shareRoom);
    $('lobby-chat-form').addEventListener('submit', (event) => {
      event.preventDefault();
      const field = $('lobby-chat-text');
      const text = field.value.trim();
      if (!text) return;
      link?.send('chat', { text });
      field.value = '';
    });
    /*
      Настройки нажимаются у всех, а меняет их хозяин. Кнопки гостю не просто
      не отвечают — они выключены: нажимать то, что ничего не делает, хуже, чем
      видеть, что нажимать нельзя.
    */
    $('lobby-settings').addEventListener('click', (event) => {
      const button = event.target.closest('button[data-value]');
      if (!button || !roomView?.youAreHost) return;
      const group = button.closest('.choice');
      const ending = group?.dataset.lobby === 'years' ? button.dataset.value : endingOf(roomView.settings);
      const bots = group?.dataset.lobby === 'bots'
        ? Number(button.dataset.value)
        : Number(roomView.settings.bots || 0);
      link?.send('settings', {
        mode: ending === 'last' ? 'last' : 'jubilee',
        years: ending === 'last' ? 7 : Number(ending),
        bots,
      });
    });
  }

  const endingOf = (settings) => (settings?.mode === 'last' ? 'last' : String(settings?.years || 3));

  function nameField() {
    const value = $('online-name').value.trim();
    Net.rememberName(value);
    return value;
  }

  async function enterRoom(run) {
    onlineFail('');
    $('online-create').disabled = true;
    $('online-join').disabled = true;
    try {
      const answer = await run();
      link = Net.open({
        roomId: answer.roomId,
        token: answer.token,
        onView: applyRoom,
        onError: (error) => onlineFail(error?.error || error?.message || ''),
        onLink: (mode) => {
          $('lobby-link-state').textContent = mode === 'socket'
            ? '' : 'Связь держится опросом: ход дойдёт за секунду.';
        },
      });
      Net.remember(answer.roomId, answer.token);
      $('online-gate').hidden = true;
      $('online-room').hidden = false;
      if (answer.view) applyRoom(answer.view);
      return true;
    } catch (error) {
      onlineFail(error?.message || 'Комната не отозвалась.');
      return false;
    } finally {
      $('online-create').disabled = false;
      $('online-join').disabled = false;
    }
  }

  function leaveRoom() {
    if (!link) return;
    const closing = link;
    closing.send('leave');
    link = null;
    roomView = null;
    mySeat = '';
    waitingInLobby = false;
    state = null;
    // Связь рвётся не сразу: «ушёл» надо донести, а закрытая связь его не донесёт.
    setTimeout(() => closing.close(), 500);
    Net.forgetRoom();
    $('online-gate').hidden = false;
    $('online-room').hidden = true;
    $('lobby-link-state').textContent = '';
    showResume();
  }

  function applyRoom(view) {
    if (!view) return;
    roomView = view;
    mySeat = view.seat || '';
    const over = Boolean(view.game) && view.game.status !== 'playing';
    if (view.phase === 'playing' && view.game && !(waitingInLobby && over)) {
      waitingInLobby = false;
      showOnlineGame(view);
      return;
    }
    // Хозяин вернул всех в комнату: партия кончилась или прервана.
    if ($('online').hidden) {
      state = null;
      $('game').hidden = true;
      $('jubilee').hidden = true;
      $('online').hidden = false;
      window.scrollTo({ top: 0, behavior: 'auto' });
    }
    renderLobby(view);
  }

  function showOnlineGame(view) {
    if ($('game').hidden) {
      for (const id of ['mode', 'setup', 'online']) { const node = $(id); if (node) node.hidden = true; }
      $('jubilee').hidden = true;
      $('game').hidden = false;
      orientationTip();
      state = view.game;
      buildRing();
      setupScene();
      render();
      return;
    }
    viewChain = viewChain.then(() => showIncoming(view.game)).catch(() => {});
  }

  /*
    Пришедший ход. Показывается он так же, как свой: кости кувыркаются, фишка
    идёт по клеткам. Иначе чужой ход выглядел бы телепортацией — фишка просто
    оказывается в другом месте, и почему она там, никто не понял бы.

    Не всякая перемена — бросок: карта уводит фишку через полполя, и отыгрывать
    такое шагами нельзя. Признак настоящего броска один: до хода ждали жребия, а
    прошло ровно столько клеток, сколько выпало.
  */
  async function showIncoming(next) {
    if (!next) return;
    const before = state;
    state = next;
    if (!before || !scene || rolling || before.turn !== next.turn) { render(); return; }
    const index = next.turn;
    const from = before.players[index].pos;
    const steps = (next.players[index].pos - from + B.BOARD.length) % B.BOARD.length;
    if (before.phase === 'roll' && steps > 0 && steps === next.dice[0] + next.dice[1]) {
      rolling = true;
      await scene.roll(next.dice[0], next.dice[1]);
      await scene.walk(next, index, from, steps);
      rolling = false;
    }
    render();
  }

  function renderLobby(view) {
    $('lobby-code').textContent = view.roomId || '—';
    const list = $('lobby-players');
    list.innerHTML = '';
    view.players.forEach((one, index) => {
      const row = el('li', 'lobby-player');
      row.style.setProperty('--who', PLAYER_COLORS[index % PLAYER_COLORS.length]);
      row.appendChild(el('b', 'lobby-player__name', one.name));
      const tags = el('span', 'lobby-player__tags');
      if (one.host) tags.appendChild(el('i', 'lobby-tag is-host', 'хозяин'));
      if (!one.online) tags.appendChild(el('i', 'lobby-tag is-away', 'нет связи'));
      if (one.ready && !one.host) tags.appendChild(el('i', 'lobby-tag is-ready', 'готов'));
      row.appendChild(tags);
      list.appendChild(row);
    });
    const bots = Number(view.settings?.bots || 0);
    for (let i = 0; i < bots; i += 1) {
      const row = el('li', 'lobby-player is-bot');
      row.appendChild(el('b', 'lobby-player__name', BOT_NAMES[i]));
      row.appendChild(el('span', 'lobby-player__tags', 'от игры'));
      list.appendChild(row);
    }

    for (const group of $('lobby-settings').querySelectorAll('.choice')) {
      const value = group.dataset.lobby === 'years' ? endingOf(view.settings) : String(bots);
      for (const button of group.querySelectorAll('button[data-value]')) {
        button.setAttribute('aria-pressed', String(button.dataset.value === value));
        button.disabled = !view.youAreHost;
      }
    }
    $('lobby-hint').textContent = view.youAreHost
      ? `За столом ${view.tableSize} из ${view.maxPlayers}. Партия идёт от двоих.`
      : 'Срок партии и число соперников выбирает хозяин комнаты.';

    const ready = $('lobby-ready');
    ready.hidden = Boolean(view.youAreHost);
    ready.textContent = view.you?.ready ? 'Я ещё не готов' : 'Я готов';
    ready.setAttribute('aria-pressed', String(Boolean(view.you?.ready)));
    const start = $('lobby-start');
    start.hidden = !view.youAreHost;
    start.disabled = !view.canStart;

    const lines = $('lobby-chat-lines');
    lines.innerHTML = '';
    for (const line of (view.chat || []).slice(-30)) {
      const row = el('div', 'lobby-chat__line');
      row.appendChild(el('b', null, line.name));
      row.appendChild(el('span', null, line.text));
      lines.appendChild(row);
    }
    lines.scrollTop = lines.scrollHeight;
  }

  /*
    Позвать друзей. Внутри приложения ни «поделиться», ни буфер обмена могут
    быть недоступны — кадру их не всегда дают. Поэтому отказ здесь не ошибка:
    код комнаты просто показывается рядом, и его продиктуют вслух.
  */
  async function shareRoom() {
    const code = roomView?.roomId || '';
    if (!code) return;
    if (inApp) { askApp('qr', code); return; }
    const address = `${location.origin}${location.pathname}?room=${code}`;
    const text = `Заходите в «Землю обетованную». Код комнаты: ${code}`;
    try {
      if (navigator.share) { await navigator.share({ title: 'Земля обетованная', text, url: address }); return; }
      await navigator.clipboard.writeText(`${text}\n${address}`);
      linkNote('Ссылка и код скопированы.');
    } catch {
      linkNote(`Код комнаты: ${code}`);
    }
  }

  let linkNoteTimer = 0;
  function linkNote(text) {
    $('lobby-link').textContent = text;
    clearTimeout(linkNoteTimer);
    linkNoteTimer = setTimeout(() => { $('lobby-link').textContent = ''; }, 5000);
  }

  function onlineFail(text) {
    const node = $('online-error');
    node.textContent = text || '';
    node.hidden = !text;
  }

  function setupScreen() {
    $('game').hidden = true;
    $('jubilee').hidden = true;
    $('setup-back')?.addEventListener('click', () => showScreen('mode'));
    $('start-btn').addEventListener('click', startGame);
    for (const group of document.querySelectorAll('.choice')) {
      group.addEventListener('click', (event) => {
        const button = event.target.closest('button');
        if (!button) return;
        for (const other of group.querySelectorAll('button')) other.setAttribute('aria-pressed', 'false');
        button.setAttribute('aria-pressed', 'true');
        if (group.dataset.key === 'humans') syncPlayerCount();
      });
    }
    syncPlayerCount();
  }

  const picked = (key) => {
    const group = document.querySelector(`.choice[data-key="${key}"]`);
    return group.querySelector('[aria-pressed="true"]').dataset.value;
  };
  const chosen = (key) => Number(picked(key));

  // Игроков за столом не больше шести: дальше кольцо не держит фишки.
  function syncPlayerCount() {
    const humans = chosen('humans');
    const group = document.querySelector('.choice[data-key="bots"]');
    let fallback = null;
    for (const button of group.querySelectorAll('button')) {
      const value = Number(button.dataset.value);
      const allowed = humans + value >= 2 && humans + value <= 6;
      button.disabled = !allowed;
      if (allowed && fallback === null) fallback = button;
      if (!allowed && button.getAttribute('aria-pressed') === 'true') button.setAttribute('aria-pressed', 'false');
    }
    if (!group.querySelector('[aria-pressed="true"]') && fallback) fallback.setAttribute('aria-pressed', 'true');
  }

  function startGame() {
    const humans = chosen('humans');
    const bots = chosen('bots');
    // Один и тот же выбор отвечает за два вопроса: срок партии и её правило
    // конца. «До последнего» — не год, поэтому читается строкой, а не числом.
    const ending = picked('years');
    const mode = ending === 'last' ? 'last' : 'jubilee';
    const years = ending === 'last' ? 7 : Number(ending);
    const players = [];
    for (let i = 0; i < humans; i += 1) players.push({ name: humans === 1 ? 'Игрок' : `Игрок ${i + 1}` });
    for (let i = 0; i < bots; i += 1) {
      players.push({ name: BOT_NAMES[i], isBot: true, botLevel: i % 2 ? 'scribe' : 'elder' });
    }
    state = E.createGame({ players, years, mode });
    for (const id of ['mode', 'setup', 'online']) { const node = $(id); if (node) node.hidden = true; }
    $('game').hidden = false;
    orientationTip();
    buildRing();
    setupScene();
    render();
    // Первую партию новичок начинает с показа на доске, а не с чистого поля.
    // Дальше обучение не навязывается: его зовут кнопкой на первом экране.
    if (window.PromisedLandTutorial
      && (teachWanted || (!teachAsked && !window.PromisedLandTutorial.seen()))) {
      teach();
      return;
    }
    scheduleBot();
  }

  /** Обучение: показ на доске. Ходы на это время не идут — они подождут. */
  function teach() {
    if (!window.PromisedLandTutorial) return;
    teachAsked = true;
    teachWanted = false;
    clearTimeout(botTimer);
    // Кнопки хода на время показа убираются: жать их посреди обучения незачем,
    // а стоять они будут ровно там, где идёт объяснение.
    $('game').classList.add('is-teaching');
    window.PromisedLandTutorial.run({
      scene,
      art,
      mode: state.mode,
      box: $('teach'),
      title: $('teach-title'),
      text: $('teach-text'),
      counter: $('teach-count'),
      next: $('teach-next'),
      skip: $('teach-skip'),
      onEnd: () => {
        $('game').classList.remove('is-teaching');
        render();
        scheduleBot();
      },
    });
  }

  // ————————————————————————————————————————————————— кольцо

  const cellNodes = [];

  /*
    Поле в объёме, если его есть на чём показать. Разметочное поле при этом не
    выбрасывается: на нём держится вёрстка вокруг, и оно остаётся единственным,
    если WebGL откажут.
  */
  function setupScene() {
    const canvas = $('board3d');
    if (!canvas || scene || !window.PromisedLand3D || !window.PromisedLand3D.supported()) return;
    const style = getComputedStyle(document.body);
    const pick = (name, fallback) => (style.getPropertyValue(name) || fallback).trim();
    try {
      scene = window.PromisedLand3D.create({
        canvas,
        art,
        sceneArt: ART + 'scene.webp',
        modelsAt: ART + 'models/',
        /*
          Сколько холста занято разметкой. Боком карточка и кнопки лежат поверх
          нижнего края доски, и вписывать доску надо в то, что осталось выше.
          Замер берётся у самих узлов: они и решают, где что лежит.
        */
        frameOf: () => {
          const box = canvas.getBoundingClientRect();
          let bottom = 0;
          /*
            Полоса управления — всё, что лежит внизу и закрывает доску.
            Исключение одно: карточка клетки. Она стоит сбоку, клеток не
            закрывает, и считать её полосой значило бы отдать ей высоту ни за
            чем. Кнопки же считаются всегда, даже когда они собраны в угол:
            узкие они или во всю ширину, доске под них заезжать нельзя.
          */
          for (const id of ['teach', 'actions', 'players', 'feed', 'core']) {
            const node = $(id);
            if (!node || node.hidden || !node.offsetParent) continue;
            const rect = node.getBoundingClientRect();
            if (rect.height === 0) continue;
            if (id === 'core' && rect.width < box.width * 0.62) continue;
            if (rect.top <= box.top) continue;
            bottom = Math.max(bottom, box.bottom - rect.top);
          }
          return { top: 0, bottom: Math.max(0, bottom) };
        },
        onCellTap: showCellCard,
        onViewChange: (home) => { $('view-home').hidden = home; },
        theme: {
          board: pick('--sunk', '#e8eefc'),
          field: pick('--surface-soft', '#f3f7ff'),
          tile: pick('--surface', '#ffffff'),
          tileSide: pick('--line-strong', '#c7c9e8'),
          ink: pick('--ink', '#111827'),
          muted: pick('--ink-soft', '#667085'),
          ground: pick('--bg-2', '#dfe8ff'),
          dice: pick('--surface', '#ffffff'),
        },
      });
    } catch (error) {
      console.warn('Поле в объёме не поднялось, играем на разметке', error);
      scene = null;
      return;
    }
    canvas.hidden = false;
    const wrap = canvas.parentElement;
    wrap.classList.add('is-3d');
    // Метка на самом экране партии: боком ширина колонки под доску считается
    // по-разному для плоского кольца и для доски в объёме, а ширину колонки
    // задаёт сетка — то есть родитель, а не коробка холста.
    $('game').classList.add('has-3d');
    /*
      На разметочном поле карточка висела в дырке кольца — там пусто. У поля в
      объёме середина занята: доска сплошная, и карточка закрывала бы дальнюю
      половину подписей. Поэтому здесь она выходит из-под доски вниз, в тот
      самый зазор, который иначе пустует между полем и кнопками.
    */
    const core = $('core');
    if (core) {
      core.classList.add('ring-core--below');
      wrap.insertAdjacentElement('afterend', core);
    }
    $('view-home').addEventListener('click', () => { if (scene) scene.home(); });
    // Ход наружу для проверки: сцена сама себя не меряет, а мерить её надо.
    window.PromisedLandScene = scene;
    window.addEventListener('resize', () => { if (scene) scene.resize(); });
  }

  function buildRing() {
    const ring = $('ring');
    ring.innerHTML = '';
    cellNodes.length = 0;
    for (const spec of B.BOARD) {
      const [row, col] = B.gridPlace(spec.n);
      const node = el('button', 'cell');
      node.type = 'button';
      node.setAttribute('aria-label', spec.name);
      node.addEventListener('click', () => showCellCard(spec.n));
      node.style.gridRow = String(row);
      node.style.gridColumn = String(col);
      node.dataset.n = String(spec.n);
      node.title = spec.name;
      const band = el('i', 'band');
      band.style.background = B.colorOf(spec) || 'transparent';
      if (spec.kind === 'well') band.classList.add('hatch');
      node.appendChild(band);
      node.appendChild(img('', 'mark'));
      node.appendChild(el('span', 'tokens'));
      if (!B.OWNABLE.has(spec.kind)) node.classList.add('is-spot', 'kind-' + spec.kind);
      ring.appendChild(node);
      cellNodes[spec.n] = node;
    }
    /*
      Карточка вынимается из доски наружу. Доска наклонена в перспективе, и
      всё, что лежит на ней, наклонено вместе с ней: текст на такой плоскости
      мылится и читается тяжело. Карточка висит над доской и смотрит прямо на
      игрока — как если бы её держали в руке над столом.
    */
    let core = $('core');
    if (!core) {
      core = el('div', 'ring-core');
      core.id = 'core';
      ring.parentElement.appendChild(core);
    }
    core.innerHTML = '';
  }

  function updateRing() {
    for (const spec of B.BOARD) {
      const node = cellNodes[spec.n];
      const cell = state.cells[spec.n];
      const owner = state.players.find((p) => p.id === (cell.heldFrom || cell.owner));
      node.classList.toggle('is-owned', Boolean(cell.owner));
      node.style.setProperty('--owner', owner ? colorOfPlayer(owner) : 'transparent');

      /*
        На клетке видно ровно одно: что на ней стоит. Жертвенник, ступень
        поселения — или, если клетка не удел, её собственный значок. У пустого
        удела нет ничего: полосы цвета группы достаточно, а рисунок пейзажа в
        тридцать один пиксель превратился бы в грязь.
      */
      const mark = node.querySelector('.mark');
      const source = cell.altar ? art('build', 'build-altar')
        : (cell.level > 0 ? art('build', BUILD_ART[cell.level - 1])
          : (B.OWNABLE.has(spec.kind) ? '' : art('icons', spec.slug)));
      mark.hidden = !source;
      if (source && mark.getAttribute('src') !== source) mark.src = source;
      mark.className = 'mark' + (cell.altar ? ' is-altar' : '');

      const tokens = node.querySelector('.tokens');
      tokens.innerHTML = '';
      state.players.forEach((player) => {
        if (player.pos !== spec.n || player.out) return;
        const dot = el('u');
        dot.style.background = colorOfPlayer(player);
        dot.title = player.name;
        if (player.id === E.current(state).id) dot.className = 'is-turn';
        tokens.appendChild(dot);
      });
    }
  }

  const colorOfPlayer = (player) => PLAYER_COLORS[state.players.indexOf(player) % PLAYER_COLORS.length];

  // ————————————————————————————————————————————————— середина кольца

  /** Значок сикля рядом с числом — цена читается монетой, а не словом. */
  function coin(value, label) {
    const box = el('span', 'core-fig');
    box.appendChild(img(art('icons', 'ui-shekel'), 'core-coin', 'сиклей'));
    box.appendChild(el('b', null, String(value)));
    if (label) box.appendChild(el('span', 'core-fig-label', label));
    return box;
  }

  /**
   * Всё про удел в середине экрана: рисунок, удел, имя, хозяин и постройка,
   * цена, плата сейчас и вся лестница платы по ступеням. Это та же выкладка,
   * что и в карточке клетки, — только собранная в полосу.
   */
  function showLand(core, n, lead) {
    const spec = B.BOARD[n];
    const cell = state.cells[n];
    const owner = state.players.find((p) => p.id === (cell.heldFrom || cell.owner));
    core.appendChild(img(art('plots', spec.slug), 'core-art', spec.name));
    const kind = el('div', 'core-kind', kindLabel(spec));
    if (spec.kind === 'plot') kind.style.setProperty('--band', B.colorOf(spec));
    core.appendChild(kind);
    core.appendChild(el('div', 'core-name', spec.name));

    const state_line = cell.altar ? `Жертвенник ${owner ? owner.name : ''}: платы нет.`
      : (owner
        ? `Земля ${owner.name}${cell.level > 0 ? `, ${B.LEVELS[cell.level - 1].toLowerCase()}` : ', без построек'}.`
        : 'Ничья земля.');
    core.appendChild(el('div', 'core-note', `${lead ? lead + ' ' : ''}${state_line}`));
    if (cell.pledge) {
      const from = state.players.find((p) => p.id === cell.pledge.by);
      core.appendChild(el('div', 'core-note core-extra',
        `В залоге у ${owner ? owner.name : 'казны'} за ${cell.pledge.debt}` +
        `${from ? `, заложил ${from.name}` : ''}.`));
    }

    const figs = el('div', 'core-figs');
    figs.appendChild(coin(spec.price, 'цена'));
    if (spec.kind === 'plot') figs.appendChild(coin(B.GROUPS[spec.group].build, 'ступень'));
    figs.appendChild(coin(E.rentFor(state, n, 7), 'плата'));
    core.appendChild(figs);

    if (spec.kind === 'plot') {
      const ladder = B.ladderOf(spec);
      const names = ['пусто', ...B.LEVELS.map((step) => step.toLowerCase())];
      core.appendChild(el('div', 'core-ladder',
        ladder.map((rent, i) => `${names[i]} ${rent}`).join(' · ')));
    }
  }

  function updateCore() {
    const core = $('core');
    core.innerHTML = '';
    const player = E.current(state);

    if (state.phase === 'roll') {
      // Пока ждём броска, середина показывает место, на котором стоит фишка:
      // иначе самая большая часть экрана пустует весь ход соперника.
      const here = B.BOARD[player.pos];
      core.appendChild(B.OWNABLE.has(here.kind)
        ? img(art('plots', here.slug), 'core-art', here.name)
        : img(art('icons', here.slug), 'core-art core-art--small', here.name));
      core.appendChild(el('div', 'core-kind', state.sabbath ? 'Субботний год' : 'Ход'));
      core.appendChild(el('div', 'core-name', player.name));
      core.appendChild(el('div', 'core-note',
        player.prison > 0 ? `В темнице. Дубль освобождает, попыток: ${player.prison}.`
          : (player.isBot ? 'Думает…' : 'Бросьте жребий.')));
      return;
    }

    const dice = el('div', 'dice');
    for (const value of state.dice) {
      if (!value) continue;
      dice.appendChild(die(value));
    }
    // Кости из разметки нужны только без объёма: в объёме они кувыркаются на
    // самой доске и там же остаются лежать выпавшими числами вверх.
    if (dice.childElementCount && !scene) core.appendChild(dice);

    const pending = state.pending;
    if (!pending) {
      core.appendChild(img(art('tokens', tokenOf(player)), 'core-art core-art--small', ''));
      core.appendChild(el('div', 'core-name', player.name));
      core.appendChild(el('div', 'core-note', 'Стройте или заканчивайте ход.'));
      return;
    }
    if (pending.type === 'buy') {
      showLand(core, pending.cell, 'Свободен.');
      return;
    }
    /*
      Встали на удел — покажите о нём всё. Раньше здесь была одна строка, и
      игрок, которому выставили счёт, не видел ни ступени поселения, ни того,
      сколько эта земля берёт дальше: чтобы решить, стоит ли её выкупать или
      закладывать своё, ему приходилось лезть в карточку клетки отдельно.
    */
    if (B.OWNABLE.has(B.BOARD[player.pos].kind)
      && (pending.type === 'pay' || pending.type === 'note' || pending.type === 'promise')) {
      showLand(core, player.pos, pending.text || '');
      if (pending.extra) core.appendChild(el('div', 'core-note core-extra', pending.extra));
      return;
    }
    // Клетка, на которой стоим, — её рисунок и показывается; у карты свой.
    const here = B.BOARD[player.pos];
    if (pending.art) core.appendChild(img(art('cards', pending.art), 'core-art', pending.title));
    else if (B.OWNABLE.has(here.kind)) core.appendChild(img(art('plots', here.slug), 'core-art', here.name));
    else core.appendChild(img(art('icons', here.slug), 'core-art core-art--small', here.name));
    core.appendChild(el('div', 'core-kind', pending.title || ''));
    core.appendChild(el('div', 'core-note', pending.text || ''));
    if (pending.extra) core.appendChild(el('div', 'core-note core-extra', pending.extra));
    if (pending.ref) core.appendChild(el('div', 'core-ref', pending.ref));
  }

  /*
    Объяснение каждой особой клетки. Игрок, который видит поле впервые, должен
    узнать, что она делает, не выходя в правила: значок этого не говорит.
  */
  const CELL_HELP = {
    exodus: 'Начало пути. Каждый раз, проходя эту клетку, вы собираете урожай — 200 сиклей.',
    prison: 'Просто стоя здесь, вы ничего не теряете. А попав сюда по «Навету», карте или трём '
      + 'одинаковым жребиям подряд, выходите так: выбросив два одинаковых числа, заплатив выкуп '
      + 'в 50 сиклей или картой «Ангел отворил двери».',
    tent: 'Гостеприимство. Всё, что собралось в казне с податей и приношений, достаётся вам, '
      + 'и сверх того — одно очко наследия.',
    slander: 'Вас оговорили перед царём: отправляйтесь в темницу. Урожай по дороге не собирается.',
    tithe: 'Десятая часть вашего серебра уходит в казну — не меньше 50 и не больше 400. '
      + 'Отданное не пропадает: каждые полные 100 сиклей подати дают очко наследия.',
    offering: 'Сто сиклей в казну и одно очко наследия.',
    providence: 'Колода событий: засухи и урожаи, дороги и встречи. Шестнадцать карт.',
    mercy: 'Колода дел милосердия. Почти каждая её карта приносит наследие. Четырнадцать карт.',
  };

  // Род клетки — то, что стоит над её названием. У особой клетки возвращать
  // само название бессмысленно: оно и так написано строкой ниже.
  const SPOT_KIND = {
    exodus: 'Угол поля', prison: 'Угол поля', tent: 'Угол поля', slander: 'Угол поля',
    tithe: 'Отдать в казну', offering: 'Отдать в казну',
    providence: 'Колода событий', mercy: 'Колода милосердия',
  };

  function kindLabel(spec) {
    if (spec.kind === 'plot') return B.GROUPS[spec.group].name;
    if (spec.kind === 'road') return 'Караванный путь';
    if (spec.kind === 'well') return 'Источник';
    return SPOT_KIND[spec.kind] || spec.name;
  }

  // ————————————————————————————————————————————————— шапка, игроки, кнопки

  function updateHud() {
    const left = state.mode === 'last' ? E.standing(state).length : 0;
    $('year').textContent = state.mode === 'last'
      ? `Год ${state.year} · держатся ${left}`
      : (state.sabbath
        ? `Субботний год ${state.year} из ${state.years}`
        : `Год ${state.year} из ${state.years}`);
    $('year').classList.toggle('is-sabbath', state.sabbath);
    const pot = $('treasury');
    pot.innerHTML = '';
    pot.appendChild(img(art('icons', state.sabbath ? 'ui-sabbath' : 'ui-pot'), 'hud-icon', ''));
    pot.appendChild(el('span', null, `Казна ${state.treasury}`));

    const strip = $('players');
    strip.innerHTML = '';
    state.players.forEach((player) => {
      const card = el('div', 'player');
      if (player.id === E.current(state).id) card.classList.add('is-turn');
      card.style.setProperty('--who', colorOfPlayer(player));
      const head = el('div', 'player-head');
      head.appendChild(img(art('tokens', tokenOf(player)), 'player-token', ''));
      head.appendChild(el('b', 'player-name', player.name));
      card.appendChild(head);
      const figures = el('div', 'player-figs');
      const silver = el('span', 'fig');
      silver.appendChild(img(art('icons', 'ui-shekel'), 'fig-icon', 'сиклей'));
      silver.appendChild(el('b', null, String(player.silver)));
      const heritage = el('span', 'fig');
      heritage.appendChild(img(art('icons', 'ui-heritage'), 'fig-icon', 'наследия'));
      heritage.appendChild(el('b', null, String(player.heritage)));
      figures.appendChild(silver);
      figures.appendChild(heritage);
      card.appendChild(figures);
      if (player.servantOf) {
        const master = state.players.find((p) => p.id === player.servantOf);
        const tag = el('div', 'player-tag');
        tag.appendChild(img(art('icons', 'ui-servant'), 'tag-icon', ''));
        tag.appendChild(el('span', null, `в найме у ${master ? master.name : '—'} · долг ${player.debt}`));
        card.appendChild(tag);
      } else if (player.prison > 0) {
        const tag = el('div', 'player-tag');
        tag.appendChild(img(art('icons', 'icon-prison'), 'tag-icon', ''));
        tag.appendChild(el('span', null, 'в темнице'));
        card.appendChild(tag);
      }
      strip.appendChild(card);
    });
  }

  /*
    Полоса действий делится надвое: решение этого хода и то, что есть всегда.
    Кнопки складываются не подряд, а в свой ярус, и место у них поэтому не
    зависит от того, сколько их сегодня.
  */
  /** Приписка к карточке в середине: её пишет полоса действий, а не карточка. */
  function noteOnCard(text) {
    const core = $('core');
    if (core) core.appendChild(el('div', 'core-note core-extra', text));
  }

  function updateActions() {
    const bar = $('actions');
    bar.innerHTML = '';
    const main = el('div', 'actions-main');
    const side = el('div', 'actions-side');
    bar.appendChild(main);
    bar.appendChild(side);
    const player = E.current(state);
    const sheetButton = button(sheetOpen ? 'Скрыть уделы' : 'Мои уделы', 'ghost', () => {
      sheetOpen = !sheetOpen;
      render();
    });
    /*
      По сети кнопки хода есть только у того, чей ход. Сервер чужой ход и так не
      примет, но узнавать об этом, нажав и получив отказ, — плохо: за одним
      столом очередь видна сама собой, а тут её должно быть видно на экране.
    */
    if (link && player.id !== mySeat) {
      main.appendChild(el('div', 'waiting', `${player.name} ходит…`));
      addSide(side, sheetButton);
      return;
    }
    if (player.isBot || autoPlay) {
      main.appendChild(el('div', 'waiting',
        player.isBot ? `${player.name} ходит…` : 'Играю за вас…'));
      addSide(side, sheetButton);
      return;
    }

    /*
      Счёт ждёт решения. Заплатить, продать что-нибудь и заплатить или пойти в
      наём — это выбор, а не следствие, и делает его человек.
    */
    /*
      Карта выпала и ждёт. Пока её не приняли, не случилось ничего: ни подарка,
      ни счёта. Нажатие здесь — это и есть тот миг, когда карта срабатывает, и
      на доске она в это время долетает до места.
    */
    if (state.pending && state.pending.type === 'card') {
      main.appendChild(button('Принять', 'primary', async () => {
        if (scene) { await scene.returnCard(); dealtCard = null; }
        act('takeCard');
        after();
      }));
      addSide(side, sheetButton);
      return;
    }

    /*
      Обещанная ступень. Уговор был: он тебе строит сейчас, ты ему — когда
      встанешь на его землю. Вот его земля; слово можно сдержать, а можно
      отложить и заплатить за проход как обычно — обещание останется висеть.
    */
    if (state.pending && state.pending.type === 'promise') {
      const cost = state.pending.cost;
      if (player.silver >= cost) {
        main.appendChild(button(`Сдержать слово: ступень ${cost}`, 'primary',
          () => { act('keepPromise'); after(); }));
      }
      main.appendChild(button('Отложить слово и заплатить', player.silver >= cost ? 'ghost' : 'primary',
        () => { act('breakPromise'); after(); }));
      addSide(side, sheetButton);
      return;
    }

    if (state.pending && state.pending.type === 'pay') {
      const owed = state.pending.amount;
      /*
        Договор вместо платы: вложиться в чужую землю и заплатить половину — или
        не платить вовсе, взяв с хозяина встречное слово. Кнопки появляются
        только там, где ступень поставить можно и денег на неё хватает.
      */
      const deal = state.pending.deal;
      if (deal) {
        const holder = state.players.find((p) => p.id === deal.ownerId);
        if (player.silver >= deal.build + deal.half) {
          main.appendChild(button(`Построить ${deal.build} и заплатить ${deal.half}`, 'ghost',
            () => { act('dealBuild', true); after(); }));
        }
        if (player.silver >= deal.build) {
          main.appendChild(button(`Уговор: построить ${deal.build}, платы нет`, 'ghost',
            () => { act('dealBuild', false); after(); }));
        }
        if (holder) {
          noteOnCard(`По уговору ${holder.name} ответит вам ступенью на вашей земле.`);
        }
      }
      if (player.silver >= owed) {
        main.appendChild(button(`Заплатить ${owed}`, 'primary', () => { act('settle'); after(); }));
      } else {
        /*
          Заложить — прежде чем продавать: заложенное можно выкупить, проданное
          нет. Предлагается самый дешёвый из подходящих уделов, остальные — в
          списке «Мои уделы», где у каждого своя кнопка.
        */
        const offers = E.pledgeable(state, player, owed);
        if (offers.length) {
          const n = offers[0];
          main.appendChild(button(`Заложить «${B.BOARD[n].name}»`, 'primary',
            () => { act('pledge', n); after(); }));
        }
        if (E.liquidValue(state, player) >= owed) {
          main.appendChild(button(`Продать и заплатить ${owed}`, 'ghost', () => { act('settle', true); after(); }));
        }
        main.appendChild(button('Пойти в наём', 'ghost', () => { act('serve'); after(); }));
      }
      addSide(side, sheetButton);
      return;
    }

    if (state.phase === 'roll') {
      const cast = button('Бросить жребий', 'primary', async () => {
        if (rolling) return;
        cast.disabled = true;
        /*
          По сети жребий бросает сервер, а показывают его все разом — и тот,
          кто бросил, и остальные, когда придёт новое состояние (см.
          showIncoming). Крутить кости здесь значило бы показать бросок раньше,
          чем он случился, и вдобавок не тот.
        */
        if (link) { act('roll'); return; }
        rolling = true;
        await animatedRoll(() => E.roll(state));
        rolling = false;
        after();
      });
      main.appendChild(cast);
      /*
        Выкуп из темницы. Дубль выпадает не всякий раз, и сидеть можно до трёх
        ходов — на круге, где чужие уделы растут, это дорого. Кнопка стоит
        рядом с жребием, а не вместо него: выкупился — и бросаешь тем же ходом.
      */
      if (E.canBail(state, player)) {
        main.appendChild(button(`Выкуп ${B.BAIL} — выйти из темницы`, 'ghost', () => {
          act('bail');
          after();
        }));
      }
    } else if (state.pending && state.pending.type === 'buy') {
      const spec = B.BOARD[state.pending.cell];
      main.appendChild(button(`Купить за ${spec.price}`, 'primary', () => { act('buy'); after(); }));
      main.appendChild(button('Отказаться', 'ghost', () => { act('decline'); after(); }));
    } else {
      main.appendChild(button('Закончить ход', 'primary', () => { act('endTurn'); after(); }));
    }
    addSide(side, sheetButton);
  }

  /*
    Правая полка кнопок. Уделы там всегда, а темп и автоигра — только за одним
    столом: по сети темпом правит сервер, один на всех, а автоигра ходила бы за
    живого человека, пока он думает.
  */
  function addSide(side, sheetButton) {
    side.appendChild(sheetButton);
    if (link) return;
    side.appendChild(autoButton());
    side.appendChild(paceButton());
  }

  /** Переключатель темпа соперников. */
  function paceButton() {
    const node = button(hurry ? 'Помедленнее' : 'Быстрее', 'ghost', () => {
      hurry = !hurry;
      if (scene) scene.setSpeed(PACE[hurry ? 'quick' : 'calm'].speed);
      render();
      scheduleBot();
    });
    node.setAttribute('aria-pressed', String(hurry));
    return node;
  }

  /** Переключатель автоигры. */
  function autoButton() {
    const node = button(autoPlay ? 'Играю сам' : 'Авто', autoPlay ? 'ghost' : 'ghost auto', () => {
      autoPlay = !autoPlay;
      render();
      scheduleBot();
    });
    node.setAttribute('aria-pressed', String(autoPlay));
    return node;
  }

  function button(label, kind, onClick) {
    const node = el('button', 'btn btn--' + kind, label);
    node.type = 'button';
    node.addEventListener('click', onClick);
    return node;
  }

  // ————————————————————————————————————————————————— шторка уделов

  function updateSheet() {
    const sheet = $('sheet');
    sheet.hidden = !sheetOpen;
    if (!sheetOpen) return;
    sheet.innerHTML = '';
    const turnPlayer = E.current(state);
    /*
      Чьи уделы показывать. За одним столом — того, чей ход (а пока ходит
      соперник, последнего живого). По сети — всегда свои: чужой кошелёк тут не
      мой, и показывать его вместо своего значит показывать чужое.
    */
    const player = link
      ? (state.players.find((p) => p.id === mySeat) || turnPlayer)
      : (turnPlayer.isBot
        ? (state.players.find((p) => p.id === lastHumanId) || turnPlayer)
        : turnPlayer);
    const busy = link
      ? (turnPlayer.id !== mySeat || state.phase === 'decide')
      : (turnPlayer.isBot || state.phase === 'decide');
    if (turnPlayer.isBot) sheet.appendChild(el('p', 'empty', `Ходит ${turnPlayer.name}. Действия появятся в ваш ход.`));

    const mine = state.cells
      .map((cell, n) => n)
      .filter((n) => state.cells[n].owner === player.id);

    sheet.appendChild(el('h3', null, `Уделы: ${player.name}`));
    if (!mine.length) sheet.appendChild(el('p', 'empty', 'Пока ничего не куплено.'));

    /*
      Заложенное — отдельной строкой сверху: оно уже не ваше, но ещё вернётся.
      Пока удел в залоге, плату за проход по нему берёт кредитор, поэтому выкуп
      стоит впереди любой стройки.
    */
    const pledged = E.pledgesOf(state, player.id);
    for (const n of pledged) {
      const spec = B.BOARD[n];
      const cell = state.cells[n];
      const holder = state.players.find((p) => p.id === cell.owner);
      const row = el('div', 'holding holding--pledged');
      const thumb = img(art('plots', spec.slug), 'holding-art', spec.name);
      thumb.style.setProperty('--band', B.colorOf(spec));
      row.appendChild(thumb);
      const info = el('div', 'holding-info');
      info.appendChild(el('b', null, spec.name));
      info.appendChild(el('span', null,
        `в залоге у ${holder ? holder.name : 'казны'} · выкуп ${cell.pledge.debt}`));
      row.appendChild(info);
      const acts = el('div', 'holding-acts');
      if (E.canRedeemPledge(state, player, n) && !busy) {
        acts.appendChild(button(`Выкупить ${cell.pledge.debt}`, 'small',
          () => { act('redeemPledge', n); render(); }));
      }
      row.appendChild(acts);
      sheet.appendChild(row);
    }

    for (const n of mine) {
      const spec = B.BOARD[n];
      const cell = state.cells[n];
      const row = el('div', 'holding');
      const thumb = img(art('plots', spec.slug), 'holding-art', spec.name);
      thumb.style.setProperty('--band', B.colorOf(spec));
      row.appendChild(thumb);

      const info = el('div', 'holding-info');
      info.appendChild(el('b', null, spec.name));
      const status = cell.altar ? 'жертвенник, платы нет'
        : (cell.level > 0 ? B.LEVELS[cell.level - 1] : 'без построек');
      const rent = E.rentFor(state, n, 7);
      info.appendChild(el('span', null, `${status} · плата ${rent}`));
      row.appendChild(info);

      const acts = el('div', 'holding-acts');
      if (E.canBuild(state, player, n) && !busy) {
        acts.appendChild(button(`Строить ${B.GROUPS[spec.group].build}`, 'small', () => { act('build', n); render(); }));
      }
      if (E.canAltar(state, player, n) && !busy) {
        acts.appendChild(button(`Жертвенник ${B.GROUPS[spec.group].build}`, 'small alt', () => { act('altar', n); render(); }));
      }
      if (E.canSell(state, player, n) && !busy) {
        acts.appendChild(button('Продать', 'small ghost', () => { act('sell', n); render(); }));
      }
      row.appendChild(acts);
      sheet.appendChild(row);
    }

    const debtors = state.players.filter((p) => p.debt > 0 && p.id !== player.id);
    if (debtors.length) {
      sheet.appendChild(el('h3', null, 'Выкуп'));
      for (const debtor of debtors) {
        const row = el('div', 'holding');
        row.appendChild(img(art('icons', 'ui-redeem'), 'holding-art', ''));
        const info = el('div', 'holding-info');
        info.appendChild(el('b', null, debtor.name));
        info.appendChild(el('span', null, `долг ${debtor.debt} · выкуп даёт +${B.HERITAGE_REDEEM} наследия`));
        row.appendChild(info);
        const acts = el('div', 'holding-acts');
        if (E.canRedeem(state, player, debtor.id) && !busy) {
          acts.appendChild(button(`Выкупить ${debtor.debt}`, 'small', () => { act('redeem', debtor.id); render(); }));
        }
        row.appendChild(acts);
        sheet.appendChild(row);
      }
    }

    // Ленты событий здесь нет намеренно: она и так стоит под полосой игроков,
    // и в шторке была вторым её экземпляром.
  }

  // ————————————————————————————————————————————————— юбилей

  function showJubilee() {
    $('game').hidden = true;
    $('jubilee').hidden = false;
    const table = $('scores');
    table.innerHTML = '';
    /*
      Не таблицей. Восемь колонок на экране 390 px уезжают вбок, и первой
      уезжает «Всего» — та единственная, ради которой на этот экран и смотрят.
      Поэтому строка игрока: имя, итог крупно и разбор мелким, который
      переносится по словам.
    */
    state.scores.forEach((score, index) => {
      const row = el('div', 'score');
      if (index === 0) row.classList.add('is-winner');
      const player = state.players.find((p) => p.id === score.id);
      row.style.setProperty('--who', colorOfPlayer(player));

      const head = el('div', 'score-head');
      head.appendChild(el('b', 'score-name', score.name));
      head.appendChild(el('b', 'score-total', String(score.total)));
      row.appendChild(head);

      const parts = [
        ['стройка', score.steps],
        ['жертвенники', score.altars],
        ['подать', score.tithe],
        ['выкуп', score.redeemed],
        ['уделы', score.plots],
        ['приношения', score.offerings + score.hospitality],
        ['серебро', score.silver],
      ].filter(([, value]) => value > 0);
      const breakdown = el('div', 'score-parts');
      if (!parts.length) breakdown.appendChild(el('span', null, 'ничего не отложено'));
      for (const [label, value] of parts) {
        breakdown.appendChild(el('span', null, `${label} ${value}`));
      }
      row.appendChild(breakdown);
      table.appendChild(row);
    });
    const winner = $('winner');
    winner.innerHTML = '';
    winner.appendChild(img(art('icons', 'ui-jubilee'), 'winner-icon', ''));
    winner.appendChild(el('span', null, `${state.scores[0].name} — ${state.scores[0].total} наследия`));
    const again = $('again-btn');
    /*
      «Ещё раз» по сети — не перезагрузка страницы: та выкинула бы игрока из
      комнаты, где остались остальные. Хозяин возвращает в комнату всех, гость —
      только себя, и ждёт там нового начала.
    */
    again.textContent = link ? (roomView?.youAreHost ? 'Вернуться в комнату' : 'В комнату') : 'Ещё раз';
    again.onclick = () => {
      if (!link) { location.reload(); return; }
      if (roomView?.youAreHost) { link.send('backToLobby'); return; }
      waitingInLobby = true;
      $('jubilee').hidden = true;
      $('online').hidden = false;
      if (roomView) renderLobby(roomView);
    };
  }

  // ————————————————————————————————————————————————— цикл

  /*
    Карта на доске. Вылетает она по появлению, а не по нажатию: нажатие её
    принимает, то есть отправляет обратно. Ключ из колоды и номера нужен, чтобы
    не выпускать ту же карту второй раз на каждой перерисовке.
  */
  function syncCardTable() {
    if (!scene) return;
    const pending = state.pending;
    const key = pending && pending.type === 'card' ? `${pending.deck}:${pending.cardId}` : null;
    if (key === dealtCard) return;
    if (!key) { scene.returnCard(); dealtCard = null; return; }
    dealtCard = key;
    scene.dealCard(pending.deck, art('cards', pending.art));
  }

  /*
    Ход наружу для проверок. Правила и сцена уже наружу: без них проверить их
    нечем. Партия — то же самое: до темницы человека не доводит ни один
    осмысленный путь нажатиями, а спросить, стоит ли там кнопка выкупа, надо.
    Отсюда только чтение состояния и просьба перерисовать: играть за игрока
    этот ход не умеет.
  */
  window.PromisedLandGame = {
    state: () => state,
    refresh: () => render(),
  };

  function render() {
    const turnPlayer = state.players[state.turn];
    if (turnPlayer && !turnPlayer.isBot) lastHumanId = turnPlayer.id;
    if (state.status === 'jubilee') { showJubilee(); return; }
    updateRing();
    if (scene) scene.sync(state, colorOfPlayer);
    syncCardTable();
    updateCore();
    updateHud();
    updateActions();
    updateSheet();
    updateFeed();
  }

  function updateFeed() {
    const feed = $('feed');
    feed.innerHTML = '';
    feed.appendChild(el('h2', 'feed-title', 'Журнал ходов'));
    for (const entry of state.log.slice(-4).reverse()) {
      feed.appendChild(el('div', 'feed-line', entry.text));
    }
  }

  function after() {
    render();
    scheduleBot();
  }

  /*
    Ходы ботов раскладываются по таймеру, а не выполняются разом: иначе между
    двумя нажатиями человека происходит десяток событий, и понять, что на поле
    изменилось и почему, невозможно.
  */
  function scheduleBot() {
    clearTimeout(botTimer);
    // По сети соперников ведёт сервер: шесть устройств, каждое со своим
    // таймером, ходили бы за одного и того же соперника наперегонки.
    if (link || !state) return;
    if (state.status !== 'playing') return;
    if (!E.current(state).isBot && !autoPlay) return;
    botTimer = setTimeout(async () => {
      if (state.status !== 'playing') return;
      let done;
      if (state.pending && state.pending.type === 'card') {
        // Карта уже вылетела на доску — её видно. Бот принимает её только
        // после того, как она вернётся: иначе ход обгонит собственный показ.
        if (scene) { await scene.returnCard(); dealtCard = null; }
        done = Bots.step(state);
      } else if (state.phase === 'roll' && !E.current(state).skip) {
        rolling = true;
        await animatedRoll(() => { done = Bots.step(state); });
        rolling = false;
      } else {
        done = Bots.step(state);
      }
      // Ход закрывается до перерисовки: иначе на экране на один кадр остаётся
      // уже сделанный ход, а следующий шаг планируется от него же.
      if (!done) E.endTurn(state);
      render();
      if (state.status === 'playing') scheduleBot();
    }, PACE[hurry ? 'quick' : 'calm'].wait);
  }

  // ————————————————————————————————————————————————— правила и запуск

  /*
    Бросок жребия. Числа во время кувырка случайны и ни на что не влияют —
    настоящий бросок делает движок после. Показывать сразу готовый результат
    нельзя: тогда кости не бросают, а просто объявляют.
  */
  let rolling = false;
  const REDUCED = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;

  /**
   * Бросок с показом. В объёме кости кувыркаются и ложатся выпавшими числами,
   * а фишка идёт по клеткам: ход должно быть видно, а не угадываться по цифрам.
   * Карта может увести фишку не по жребию — такой прыжок шагами не отыгрывается,
   * иначе фишка пошла бы через полполя вместо того, чтобы очутиться там разом.
   */
  async function animatedRoll(doRoll) {
    const index = state.turn;
    const before = state.players[index].pos;
    if (!scene) await tumble();
    doRoll();
    if (!scene) return;
    const sum = state.dice[0] + state.dice[1];
    const steps = (state.players[index].pos - before + B.BOARD.length) % B.BOARD.length;
    await scene.roll(state.dice[0], state.dice[1]);
    if (steps > 0 && steps === sum) await scene.walk(state, index, before, steps);
  }

  function tumble(ms = 620) {
    if (REDUCED) return Promise.resolve();
    return new Promise((resolve) => {
      rolling = true;
      const core = $('core');
      const player = E.current(state);
      core.innerHTML = '';
      const box = el('div', 'dice is-rolling');
      const first = die(1);
      const second = die(1);
      box.appendChild(first);
      box.appendChild(second);
      core.appendChild(box);
      core.appendChild(el('div', 'core-kind', 'Жребий брошен'));
      core.appendChild(el('div', 'core-name', player.name));

      const started = Date.now();
      const timer = setInterval(() => {
        showFace(first, 1 + Math.floor(Math.random() * 6));
        showFace(second, 1 + Math.floor(Math.random() * 6));
        if (Date.now() - started < ms) return;
        clearInterval(timer);
        rolling = false;
        resolve();
      }, 70);
    });
  }

  // ——— карточка клетки ———

  function showCellCard(n) {
    $('cell-card').hidden = false;
    const spec = B.BOARD[n];
    const cell = state ? state.cells[n] : null;
    const body = $('cell-body');
    body.innerHTML = '';

    body.appendChild(B.OWNABLE.has(spec.kind)
      ? img(art('plots', spec.slug), 'cell-art', spec.name)
      : img(art('icons', spec.slug), 'cell-art cell-art--icon', spec.name));

    const kind = el('div', 'cell-kind', kindLabel(spec));
    if (spec.kind === 'plot') kind.style.setProperty('--band', B.colorOf(spec));
    body.appendChild(kind);
    body.appendChild(el('h3', 'cell-name', spec.name));

    if (!B.OWNABLE.has(spec.kind)) {
      body.appendChild(el('p', 'cell-text', CELL_HELP[spec.kind] || spec.note || ''));
      return;
    }

    const owner = cell && state.players.find((p) => p.id === (cell.heldFrom || cell.owner));
    body.appendChild(el('p', 'cell-text', owner
      ? (cell.altar ? `Здесь жертвенник ${owner.name}: платы за эту землю нет.`
        : (cell.level > 0 ? `Земля ${owner.name}. Обжита: ${B.LEVELS[cell.level - 1].toLowerCase()}.`
          : `Земля ${owner.name}. Построек пока нет.`))
      : (spec.kind === 'plot' ? 'Свободный удел. Купив его, вы начнёте брать плату с тех, кто сюда ступит.'
        : (spec.kind === 'road'
          ? 'Свободный караванный путь. Плата за него растёт от того, сколько путей у одного хозяина.'
          : 'Свободный источник. Плата за него считается по жребию.'))));

    const figures = el('div', 'cell-figs');
    const fig = (label, value) => {
      const box = el('div', 'cell-fig');
      box.appendChild(el('b', null, String(value)));
      box.appendChild(el('span', null, label));
      figures.appendChild(box);
    };
    fig('цена', spec.price);
    if (spec.kind === 'plot') fig('ступень', B.GROUPS[spec.group].build);
    // «Плата сейчас» имеет смысл только у чужой земли: на свободной она всегда
    // ноль, и этот ноль читается как «проход бесплатный навсегда».
    if (state && owner) fig('платят сейчас', E.rentFor(state, n, 7));
    body.appendChild(figures);

    if (spec.kind === 'plot') {
      const ladder = B.ladderOf(spec);
      const table = el('div', 'cell-ladder');
      const rows = ['Без построек', ...B.LEVELS];
      rows.forEach((label, index) => {
        const row = el('div', 'cell-row');
        if (cell && (cell.level === index) && !cell.altar) row.classList.add('is-now');
        row.appendChild(el('span', null, label));
        row.appendChild(el('b', null, String(ladder[index])));
        table.appendChild(row);
      });
      body.appendChild(el('div', 'cell-cap', 'Плата за проход'));
      body.appendChild(table);
      body.appendChild(el('p', 'cell-note',
        `Обживать можно, только собрав все уделы цвета «${B.GROUPS[spec.group].name}». `
        + 'Пока построек нет, а весь цвет у одного хозяина, плата удваивается.'));
    } else if (spec.kind === 'road') {
      const table = el('div', 'cell-ladder');
      B.ROAD_RENT.forEach((value, index) => {
        const row = el('div', 'cell-row');
        if (state && cell.owner && E.ownedCount(state, cell.owner, 'road') === index + 1) row.classList.add('is-now');
        row.appendChild(el('span', null, `${index + 1} ${index ? 'пути' : 'путь'} у хозяина`));
        row.appendChild(el('b', null, String(value)));
        table.appendChild(row);
      });
      body.appendChild(el('div', 'cell-cap', 'Плата за проход'));
      body.appendChild(table);
    } else {
      body.appendChild(el('div', 'cell-cap', 'Плата за проход'));
      const table = el('div', 'cell-ladder');
      B.WELL_MULT.forEach((value, index) => {
        const row = el('div', 'cell-row');
        if (state && cell.owner && E.ownedCount(state, cell.owner, 'well') === index + 1) row.classList.add('is-now');
        row.appendChild(el('span', null, index ? 'оба источника у хозяина' : 'один источник у хозяина'));
        row.appendChild(el('b', null, `жребий ×${value}`));
        table.appendChild(row);
      });
      body.appendChild(table);
    }
  }

  function fillRules() {
    const box = $('rules-body');
    const rent = $('rules-rents');
    for (const key of Object.keys(B.GROUPS)) {
      const group = B.GROUPS[key];
      const plots = B.BOARD.filter((cell) => cell.kind === 'plot' && cell.group === key);
      const row = el('div', 'rule-group');
      const dot = el('i');
      dot.style.background = group.color;
      row.appendChild(dot);
      const info = el('div');
      info.appendChild(el('b', null, group.name));
      info.appendChild(el('span', null, plots.map((p) => `${p.name} ${p.price}`).join(' · ')
        + ` · ступень ${group.build}`));
      row.appendChild(info);
      rent.appendChild(row);
    }
    box.querySelector('.cards-count').textContent =
      `${CARDS.PROVIDENCE.length} карт «Провидения» и ${CARDS.MERCY.length} «Милости»`;

    // Рубашки колод — здесь им и место: в партии игрок видит только лицевую
    // сторону, а разглядеть колоду хочется.
    const backs = $('rules-backs');
    for (const [name, label] of [['back-providence', 'Провидение'], ['back-mercy', 'Милость']]) {
      const figure = el('figure', 'deck');
      figure.appendChild(img(art('cards', name), 'deck-back', label));
      figure.appendChild(el('figcaption', null, label));
      backs.appendChild(figure);
    }
    $('brand').appendChild(img(`${ART}menu-icon.webp`, 'brand-icon', 'Земля обетованная'));

    $('rules-btn').addEventListener('click', () => { $('rules').hidden = false; });
    /*
      Обучение с первого экрана начинает партию и сразу ведёт по доске: без
      партии показывать нечего — ни фишек, ни клеток под ними.
    */
    $('teach-btn').addEventListener('click', () => {
      if ($('game').hidden) { teachWanted = true; startGame(); return; }
      teach();
    });
    $('rules-close').addEventListener('click', () => { $('rules').hidden = true; });
    $('cell-close').addEventListener('click', () => { $('cell-card').hidden = true; });
    // Нажатие мимо карточки тоже закрывает: иначе на телефоне придётся целиться
    // в крестик, а он маленький.
    for (const id of ['rules', 'cell-card']) {
      $(id).addEventListener('click', (event) => {
        if (event.target === $(id)) $(id).hidden = true;
      });
    }
  }

  setupScreen();
  modeScreen();
  fillRules();
  if (/^[A-Z0-9]{5}$/i.test(new URLSearchParams(location.search).get('room') || '')) {
    showScreen('online');
    startOnline();
  }
})();
