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
    /*
      Совет живёт в коробке доски, а не экрана партии. Там же висит кнопка
      «Вернуть вид», и, пока они были в разных коробках, место совету
      приходилось назначать числом — от края экрана. Число это разошлось с
      явью, как только шапка стала ниже: кнопка уехала вверх, а совет остался,
      и накрыл её собой. В одной коробке им обоим хватает одного правила:
      кнопка сверху, совет под ней.
    */
    (document.querySelector('#game .ring-wrap') || $('game')).appendChild(tip);
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
  /*
    Черновик уговора: с кем меняемся, что отдаём, что берём и сколько сверху.
    Он живёт на экране, а не в партии: пока человек тыкает в уделы, за столом
    ничего не происходит, и знать об этом соперникам незачем.
  */
  let tradeDraft = null;
  /*
    Что сейчас открыто на экране партии.

    Три вещи — свои уделы, карточки игроков и журнал ходов — нужны не каждый
    ход, а место занимали каждый: стоймя они забирали двести с лишним точек
    высоты, боком — нижнюю полосу целиком, и всё это у доски, ради которой в
    игру и смотрят. Теперь каждая открывается своим пунктом панели внизу.

    Открытое живёт до конца партии, а не до следующего хода: тому, кому
    карточки игроков нужны постоянно, хватит одного нажатия за партию.
  */
  let playersOpen = false;
  let feedOpen = false;
  let lastHumanId = '';
  // Автоигра: ходы человека тоже ведёт разум соперников. Нужна, чтобы досмотреть
  // партию до юбилея, не нажимая, и чтобы попробовать правила, не разбираясь.

  let teachWanted = false;
  let dealtCard = null;
  /*
    Темп соперников. Один на всю игру: соперники ходят неспешно, чтобы за ходом
    можно было уследить — фишка идёт, карта летит, кости падают.

    Переключателя «Быстрее» больше нет, как нет и «Авто». Обе кнопки решали
    одну задачу — «мне скучно смотреть», — и решали её тем, что отбирали у
    человека ход: одна торопила чужой, вторая играла за него самого. Игре, в
    которой каждое действие ждёт нажатия, такие кнопки противоречат в самой
    основе; а место на экране они занимали наравне с настоящими.
  */
  /*
    Сколько ждать между ходами соперников.

    Было девятьсот миллисекунд, и этого оказалось мало: человек писал, что не
    успевает сообразить, что и куда. Он и не мог — на экране в этот миг было
    написано только «ходит Ефрем», а что Ефрем сделал, лежало в отдельной
    вкладке журнала.

    Поэтому две правки сразу, и одной без другой не хватило бы. Пауза выросла
    до полутора секунд — столько нужно, чтобы прочесть строку и найти глазами
    клетку. И сама строка теперь говорит, что именно случилось: «Ефрем купил
    Вирсавию за 60», а не просто «ходит Ефрем».
  */
  const PACE = { wait: 1500 };
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
    askApp('room', '');   // ушли из комнаты — приложению больше нечего о ней знать
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
    const wasRoom = roomView?.roomId || '';
    roomView = view;
    mySeat = view.seat || '';
    /*
      Приложению сообщается код комнаты. Игра живёт в кадре на своём адресе, и
      снаружи о ней не видно ничего — а приложению это нужно: по коду комнаты
      администратор открывает монитор партии, когда человек жалуется, что у
      него всё встало. Ни имён, ни карт, ни денег — только код, который и так
      написан на экране у всех за столом.
    */
    if (view.roomId && view.roomId !== wasRoom) askApp('room', view.roomId);
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
      warmArt();
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
    warmArt();
    /*
      Обучение больше не встречает партию само.

      Раньше первая партия начиналась показом, а «первая» определялась отметкой
      в localStorage. Внутри приложения игра живёт кадром на своём адресе, и
      память у такого кадра чужая: браузеры её делят по сайтам, а на телефоне
      ещё и чистят между запусками. Отметка терялась, и показ начинался снова —
      каждую партию, у человека, прошедшего его десять раз.

      Чинить это хранилищем значило бы гадать, доживёт ли оно до завтра.
      Поэтому показ теперь только по просьбе: кнопкой на первом экране — до
      партии, и кнопкой в шапке — посреди неё. Просьба не теряется никогда.
    */
    if (window.PromisedLandTutorial && teachWanted) {
      teach();
      return;
    }
    scheduleBot();
  }

  /*
    Рисунки клеток греются заранее, по одному.

    Карточка удела показывает рисунок в шестьдесят килобайт, и первый раз он
    приходит по сети — то есть уже после того, как карточка взлетела: она
    появляется с пустым местом наверху, а через миг это место занимает
    картинка. На телефоне по сотовой связи это хорошо видно и выглядит
    поломкой.

    Поэтому, как только партия началась, игра тихо запрашивает рисунки всех
    тридцати шести клеток — строго по очереди, следующий после загрузки
    предыдущего. Очередь важна: тридцать шесть запросов разом отняли бы канал
    у самого поля, которое в этот миг ещё собирается. К первой остановке фишки
    нужный рисунок уже лежит в кеше, и карточка показывает его сразу.
  */
  function warmArt() {
    const urls = [...new Set(B.BOARD.map((spec) => (B.OWNABLE.has(spec.kind)
      ? art('plots', spec.slug) : art('icons', spec.slug))))];
    let at = 0;
    const next = () => {
      if (at >= urls.length) return;
      const node = new Image();
      node.decoding = 'async';
      node.addEventListener('load', next, { once: true });
      node.addEventListener('error', next, { once: true });
      node.src = urls[at];
      at += 1;
    };
    next();
  }

  /** Обучение: показ на доске. Ходы на это время не идут — они подождут. */
  function teach() {
    if (!window.PromisedLandTutorial) return;
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
          const out = { top: 0, bottom: 0, left: 0, right: 0 };
          if (!box.width || !box.height) return out;
          /*
            Что на холсте занято и с какой стороны.

            Холст теперь во весь экран, и разметка лежит на нём двумя
            плашками: шапка сверху, управление снизу. Обе — полосы поперёк, и
            обе считаются одинаково: от своего края холста до дальнего края
            плашки. Никаких столбцов тут больше нет — было время, когда
            управление боком стояло в правом нижнем углу, и тогда занятым
            приходилось объявлять столбец; доска от этого съезжала влево и
            висела в кадре криво.

            Разница между шапкой и управлением одна. Шапка ничего не
            нажимает: она отвечает на вопросы, и доске под её краем лежать
            не жалко — поэтому её высота идёт в запас с весом по ширине.
            Управление — то, под что доске заезжать нельзя вовсе: там
            нажимают, и запас берётся целиком.
          */
          const band = (node, weigh) => {
            if (!node || node.hidden || !node.offsetParent) return;
            const rect = node.getBoundingClientRect();
            if (!rect.width || !rect.height) return;
            const left = Math.max(rect.left, box.left);
            const right = Math.min(rect.right, box.right);
            const top = Math.max(rect.top, box.top);
            const bottom = Math.min(rect.bottom, box.bottom);
            if (right <= left || bottom <= top) return;
            const weight = weigh ? (right - left) / box.width : 1;
            if (top - box.top <= box.bottom - bottom) {
              out.top = Math.max(out.top, (bottom - box.top) * weight);
            } else {
              out.bottom = Math.max(out.bottom, (box.bottom - top) * weight);
            }
          };
          for (const id of ['teach', 'actions', 'players', 'feed', 'sheet']) band($(id), false);
          band(document.querySelector('#game .hud'), true);
          return out;
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
      Карточка остаётся над доской.

      Раньше она уезжала из-под доски вниз отдельной строкой — и стояла там
      всю партию, даже когда сказать ей было нечего: «ход, Игрок, бросьте
      жребий» дублировало кнопку под собой и забирало у поля полторы сотни
      точек. Теперь она появляется, только когда клетка что-то говорит, и
      взлетает с той самой плитки, на которую встала фишка (см. liftCard).
      Место посреди доски она закрывает — но ровно на то время, пока её
      читают, а дальний край подписей всё равно читается хуже ближнего.
    */
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
    /*
      Карточка живёт не внутри коробки доски, а рядом с нею, прямо на экране
      партии. Внутри коробки она лежала до тех пор, пока доска была блоком в
      колонке; теперь холст растянут на весь экран и лежит под разметкой — а
      всё, что в нём, лежит под разметкой вместе с ним. Карточка от этого
      уходила под полосу управления: строка с годом читалась сквозь неё, а
      кнопки решений оказывались ниже панели разделов.
    */
    let core = $('core');
    if (!core) {
      core = el('div', 'ring-core');
      core.id = 'core';
      $('game').appendChild(core);
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

    const state_line = cell.altar ? `Жертвенник${owner ? `, хозяин: ${owner.name}` : ''}: платы нет.`
      : (owner
        ? `Хозяин: ${owner.name}${cell.level > 0 ? `, ${B.LEVELS[cell.level - 1].toLowerCase()}` : ', без построек'}.`
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

  /*
    Карточка клетки — как настоящая карта со стола.

    Правило одно: карточка есть тогда и только тогда, когда клетка чего-то от
    игрока хочет или о чём-то ему сообщает. Ни «ход, Игрок, бросьте жребий»,
    ни «стройте или заканчивайте ход» карточками не были — это подписи к
    кнопкам, и стояли они под самими кнопками, занимая место весь ход.

    Отсюда и поведение, которое видно глазом: фишка встала на клетку —
    карточка взлетела с этой плитки на середину экрана. Ход чужой — её просто
    читают, и она уходит вместе с ходом. Ход свой — под ней встают все
    решения, какие эта клетка предлагает (см. placeActions).
  */
  /*
    Что сейчас нарисовано на карточке. По этой строке карточка узнаёт, что ей
    перерисовываться незачем.

    Перерисовывалась она на каждом обновлении партии — а их за один ход
    десяток: бросили жребий, пошла фишка, пришла плата, открылся ящик. Каждый
    раз карточка собиралась заново, вместе с рисунком удела: браузер заводил
    новую картинку, и та мигала, пока грузилась. Со стороны это выглядело
    ровно так, как о том и сказали: «карточка не сразу прогружается и дёргается
    при загрузке».

    Сравнивается не состояние партии, а то, что из него вышло, — готовая
    разметка. Так ни одно поле не забудется: изменилась хоть буква — карточка
    пересоберётся, не изменилось ничего — останется как есть, вместе с уже
    загруженной картинкой.
  */
  let coreShape = null;

  function updateCore() {
    const core = $('core');
    const player = E.current(state);
    const pending = state.pending;

    if (!pending) {
      core.hidden = true;
      core.innerHTML = '';
      coreShape = null;
      core.classList.remove('is-plot');
      delete core.dataset.from;
      return;
    }
    /*
      Карточка собирается в черновик, а на экран попадает только если вышла
      другой. Кнопки решений при этом не трогаются вовсе: они лежат на
      карточке отдельным блоком, и переносит их placeActions.
    */
    const draft = el('div');
    const plot = fillCore(draft, pending, player);
    const shape = draft.innerHTML;
    core.hidden = false;
    if (shape !== coreShape) {
      coreShape = shape;
      /*
        Уже загруженная картинка переезжает в новую сборку, а не заводится
        заново. Содержимое карточки меняется и на той же самой клетке — купили
        удел, и «Свободный удел» стало «Хозяин: такой-то», — а рисунок при этом
        тот же самый. Новая картинка с тем же адресом берётся из кеша, но
        браузер всё равно успевает показать пустое место: на телефоне это
        и есть то самое мигание.
      */
      const loaded = new Map();
      for (const node of core.querySelectorAll('img')) {
        if (node.complete && node.naturalWidth) loaded.set(node.src, node);
      }
      for (const fresh of draft.querySelectorAll('img')) {
        const kept = loaded.get(fresh.src);
        if (!kept) continue;
        loaded.delete(fresh.src);
        kept.className = fresh.className;
        kept.alt = fresh.alt;
        kept.hidden = false;
        fresh.replaceWith(kept);
      }
      for (const node of [...core.children]) {
        if (!node.classList.contains('actions-main')) node.remove();
      }
      while (draft.firstChild) core.appendChild(draft.firstChild);
    }
    core.classList.toggle('is-plot', plot);
    /*
      Совет про горизонт своё отслужил: раз клетка о чём-то спрашивает, партия
      идёт, и держать над доской подсказку о том, как её держать, незачем.
      Убирается он здесь, а не по часам: часы не знают, прочитали его или нет.
    */
    document.getElementById('orientation-tip')?.remove();
    // С какой плитки взлетать. Покупка называет клетку сама — при залоге и
    // продаже фишка может стоять уже не на ней.
    core.dataset.from = String(pending.type === 'buy' ? pending.cell : player.pos);
  }

  /*
    Наполнение карточки. Возвращает признак «внутри полное описание удела»:
    по нему разметка узнаёт, что в карточке лежат части окна клетки — рисунок,
    название, цены, лестница построек, — и боком раскладывает их в два
    столбца. У прочих карточек части свои, и такая раскладка им ни к чему.
  */
  function fillCore(core, pending, player) {
    const from = pending.type === 'buy' ? pending.cell : player.pos;
    // Кости из разметки нужны только без объёма: в объёме они кувыркаются на
    // самой доске и там же остаются лежать выпавшими числами вверх.
    if (!scene) {
      const dice = el('div', 'dice');
      for (const value of state.dice) {
        if (!value) continue;
        dice.appendChild(die(value));
      }
      if (dice.childElementCount) core.appendChild(dice);
    }

    /*
      На своём ходу — всё, что известно о клетке; на чужом — коротко.

      Решение принимают по полной карточке: цена, ступень, плата на каждой
      ступени поселения, правило цвета. Раньше на покупке показывали
      сокращённую, и «брать или не брать» решалось по двум числам из семи.
    */
    const full = B.OWNABLE.has(B.BOARD[from].kind) && myTurn()
      && (pending.type === 'buy' || pending.type === 'pay'
        || pending.type === 'note' || pending.type === 'promise');
    if (full) {
      describeCell(core, from);
      if (pending.type !== 'buy' && pending.text) {
        core.appendChild(el('div', 'core-note core-extra', pending.text));
      }
      if (pending.extra) core.appendChild(el('div', 'core-note core-extra', pending.extra));
      return true;
    }
    if (pending.type === 'buy') {
      showLand(core, pending.cell, 'Свободен.');
      return false;
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
      return false;
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
    return false;
  }

  /*
    Объяснение каждой особой клетки. Игрок, который видит поле впервые, должен
    узнать, что она делает, не выходя в правила: значок этого не говорит.
  */
  const CELL_HELP = {
    exodus: 'Начало пути. Каждый раз, проходя эту клетку, вы собираете урожай — 200 сиклей.',
    /*
      Две суммы, и путать их нельзя: выкуп — 100 сиклей, и он добровольный,
      а 50 берут сами, когда срок вышел. Здесь годами стояло «выкуп в 50»:
      игрок читал одну цену на карточке клетки, а на кнопке видел другую.
    */
    prison: `Просто стоя здесь, вы ничего не теряете. А попав сюда по «Навету», карте или трём `
      + `одинаковым жребиям подряд, выходите так: выбросив два одинаковых числа, заплатив `
      + `выкуп в ${B.BAIL} сиклей и выйдя сразу же, или картой «Ангел отворил двери». Больше `
      + `трёх ходов там не держат: по истечении срока выпустят и так, взяв ${B.RANSOM}.`,
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

  /*
    Кто здесь я. По сети — своё место за столом. За одним телефоном играют по
    очереди, и «я» — тот человек, чей ход идёт; пока ходит соперник, последний
    человек, который ходил. Если людей за столом нет вовсе (партия смотрится
    на «Авто»), кошелёк показывает того, чей ход.
  */
  /** Мой ли сейчас ход: по сети — своё место, за одним столом — не соперник. */
  function myTurn() {
    const turnPlayer = E.current(state);
    if (turnPlayer.isBot) return false;
    return !link || turnPlayer.id === mySeat;
  }

  function whoAmI() {
    const turnPlayer = E.current(state);
    if (link) return state.players.find((one) => one.id === mySeat) || turnPlayer;
    if (!turnPlayer.isBot) return turnPlayer;
    return state.players.find((one) => one.id === lastHumanId)
      || state.players.find((one) => !one.isBot)
      || turnPlayer;
  }

  /*
    Шапка теперь — только счёт: серебро, наследие, казна. Год и чей ход ушли
    вниз, под главную кнопку: их спрашивают, решая, что нажать, и смотреть за
    ними через весь экран не за чем.
  */
  function updateHud() {
    const pot = $('treasury');
    pot.innerHTML = '';
    pot.appendChild(img(art('icons', state.sabbath ? 'ui-sabbath' : 'ui-pot'), 'hud-icon', ''));
    pot.appendChild(el('span', null, `Казна ${state.treasury}`));

    /*
      Кошелёк и чей ход — в шапке, без единого нажатия.

      Это и было главной бедой экрана: серебро своё игрок мог узнать, только
      открыв полосу игроков, то есть нажав дважды и посреди чужого хода.
      Считать в уме, хватит ли на удел, глядя на кнопку «Купить за 240», —
      не игра, а арифметика вслепую. Теперь серебро и наследие стоят в строке
      состояния всегда, рядом с годом и казной.
    */
    const mine = whoAmI();
    /*
      Фишка игрока у левого края плашки. Она отвечает на вопрос «чей это
      счёт» быстрее любой подписи: ту же фишку игрок видит на доске.
    */
    const face = $('face');
    if (mine) {
      face.src = art('tokens', tokenOf(mine));
      face.alt = mine.name;
      face.style.setProperty('--who', colorOfPlayer(mine));
      face.hidden = false;
    } else {
      face.hidden = true;
    }
    const purse = $('purse');
    purse.innerHTML = '';
    if (mine) {
      purse.style.setProperty('--who', colorOfPlayer(mine));
      const silver = el('span', 'hud-fig');
      silver.appendChild(img(art('icons', 'ui-shekel'), 'hud-icon', 'сиклей'));
      silver.appendChild(el('b', null, String(mine.silver)));
      const heritage = el('span', 'hud-fig');
      heritage.appendChild(img(art('icons', 'ui-heritage'), 'hud-icon', 'наследия'));
      heritage.appendChild(el('b', null, String(mine.heritage)));
      purse.append(silver, heritage);
      purse.title = `${mine.name}: ${mine.silver} сиклей, ${mine.heritage} наследия`;
    }

    const strip = $('players');
    strip.innerHTML = '';
    /*
      Полоса игроков собирается только когда открыта. Собирать её в скрытую
      коробку значило бы перебирать шестерых и рисовать двенадцать картинок на
      каждом ходу впустую, а на ходу соперника ходы идут один за другим.
    */
    strip.hidden = !playersOpen;
    if (!playersOpen) return;
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
    bar.appendChild(main);
    /*
      Полоска с годом и чьим ходом и панель управления строятся один раз и в
      одном месте — а не в каждой из шести веток ниже, как было со вторым
      ярусом кнопок. Ветки заняты решениями этого хода, и им незачем помнить
      про то, что на экране есть всегда.
    */
    bar.appendChild(turnLine());
    bar.appendChild(toolsBar());
    const player = E.current(state);

    /*
      Уговор об обмене ждёт ответа — и ждёт он не того, чей ход. Поэтому он
      показывается раньше всех кнопок хода: для того, кому предложили, это
      сейчас единственное, что можно сделать, и он как раз сидит и смотрит на
      чужой ход.
    */
    if (state.trade) {
      const offer = state.trade;
      const from = playerById(offer.from);
      const to = playerById(offer.to);
      const me = meId();
      const names = (list) => (list.length
        ? list.map((n) => B.BOARD[n].name).join(', ') : 'ничего');
      const line = el('div', 'trade-offer');
      line.appendChild(el('b', null, `${from ? from.name : 'Сосед'} предлагает уговор`));
      line.appendChild(el('span', null, `отдаёт: ${names(offer.give)}`));
      line.appendChild(el('span', null, `просит: ${names(offer.take)}`));
      if (offer.silver) {
        line.appendChild(el('span', 'trade-silver', offer.silver > 0
          ? `и доплачивает ${offer.silver}`
          : `и просит сверху ${-offer.silver}`));
      }
      main.appendChild(line);
      /*
        Кто отвечает. По сети — только тот, кому предложили: чужой ответ сервер
        и не примет. За одним столом экран один на всех, и отвечает с него тот,
        кому уговор предложен, кем бы из людей он ни был; иначе уговор, поданный
        не тому человеку, остался бы без ответа навсегда — соперники ждут его.
      */
      const answers = link ? (offer.to === me && to && !to.isBot) : Boolean(to && !to.isBot);
      if (answers) {
        if (!link && to.id !== me) main.appendChild(el('div', 'waiting', `Отвечает ${to.name}`));
        main.appendChild(button('Принять', 'primary', () => { act('tradeAccept'); after(); }));
        main.appendChild(button('Отказаться', 'ghost', () => { act('tradeDecline'); after(); }));
      } else {
        main.appendChild(el('div', 'waiting', `${to ? to.name : 'Сосед'} думает…`));
        askBotAboutTrade();
      }
      return;
    }

    /*
      По сети кнопки хода есть только у того, чей ход. Сервер чужой ход и так не
      примет, но узнавать об этом, нажав и получив отказ, — плохо: за одним
      столом очередь видна сама собой, а тут её должно быть видно на экране.
    */
    if (link && player.id !== mySeat) {
      main.appendChild(el('div', 'waiting', `${player.name} ходит…`));
      return;
    }
    if (player.isBot) {
      main.appendChild(el('div', 'waiting', `${player.name} ходит…`));
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
  }

  /*
    Правая полка кнопок. Уделы там всегда, а темп и автоигра — только за одним
    столом: по сети темпом правит сервер, один на всех, а автоигра ходила бы за
    живого человека, пока он думает.
  */
  /*
    Значки панели. Рисуются разметкой, а не картинками: четыре знака размером
    с ноготь, и заводить ради них четыре файла — платить весом за то, что
    рисуется десятком строк. Цвет наследуется от кнопки, поэтому открытый
    пункт подсвечивается сам собой.
  */
  const TOOL_ICON = {
    plots: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="7.5" width="17" height="11" rx="2.5"/>'
      + '<path d="M3.5 11.5h17"/><path d="M8.5 7.5v-2h7v2"/></svg>',
    players: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="8" r="3.2"/>'
      + '<circle cx="17" cy="9.5" r="2.4"/><path d="M3.5 19c0-3 2.5-5 5.5-5s5.5 2 5.5 5"/>'
      + '<path d="M16 14.4c2.4.2 4.2 2 4.5 4.6"/></svg>',
    feed: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="2.5"/>'
      + '<path d="M8 9h8M8 13h8M8 17h5"/></svg>',
    teach: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4.5l8.5 4-8.5 4-8.5-4z"/>'
      + '<path d="M7.5 11v4c0 1.5 2 2.6 4.5 2.6s4.5-1.1 4.5-2.6v-4"/></svg>',
  };

  /*
    Панель управления — четыре постоянных пункта внизу экрана.

    Ящика «Ещё» больше нет: за ним пряталось ровно это, и каждая вещь стоила
    двух нажатий вместо одного. У каждого пункта теперь своё место, оно не
    меняется от хода к ходу, и палец находит нужный, не читая. Открытый пункт
    подсвечен — видно состояние, а не только возможность нажать.
  */
  function toolsBar() {
    const nav = el('nav', 'tabbar');
    nav.id = 'tools';
    nav.setAttribute('aria-label', 'Управление партией');
    const tab = (id, icon, label, on, onClick) => {
      const node = document.createElement('button');
      node.type = 'button';
      node.className = on ? 'tab is-on' : 'tab';
      node.id = id;
      node.setAttribute('aria-pressed', String(Boolean(on)));
      const glyph = el('span', 'tab-icon');
      glyph.innerHTML = TOOL_ICON[icon];
      node.appendChild(glyph);
      node.appendChild(el('span', 'tab-label', label));
      node.addEventListener('click', onClick);
      nav.appendChild(node);
    };
    tab('sheet-open', 'plots', 'Уделы', sheetOpen, () => { sheetOpen = !sheetOpen; render(); });
    tab('players-open', 'players', 'Игроки', playersOpen, () => {
      playersOpen = !playersOpen;
      render();
    });
    tab('feed-open', 'feed', 'Журнал', feedOpen, () => { feedOpen = !feedOpen; render(); });
    if (window.PromisedLandTutorial) {
      tab('teach-open', 'teach', 'Обучение', false, () => {
        // Посреди хода соперника показ начинать нельзя: он говорит о том, что
        // на доске сейчас, а доска в этот миг движется сама.
        if (rolling) return;
        teach();
      });
    }
    return nav;
  }

  /*
    Полоска под главной кнопкой: год и чей ход. Место для неё выбрано там же,
    где его ищет глаз, — сразу под тем, что нажимают, — а не в шапке, где
    рядом стоят числа, которые читают совсем для другого.
  */
  function turnLine() {
    const line = el('div', 'turnline');
    line.id = 'turnline';
    const turnPlayer = E.current(state);
    line.appendChild(el('span', 'turnline-year', state.mode === 'last'
      ? `Год ${state.year} · держатся ${E.standing(state).length}`
      : (state.sabbath ? `Субботний год ${state.year} из ${state.years}`
        : `Год ${state.year} из ${state.years}`)));
    if (!myTurn()) {
      const who = el('span', 'turnline-who');
      who.style.setProperty('--who', colorOfPlayer(turnPlayer));
      who.appendChild(el('i', 'hud-dot'));
      who.appendChild(el('span', null, `ходит ${turnPlayer.name}`));
      line.appendChild(who);
      /*
        Что он только что сделал. Без этой строки чужой ход выглядел так:
        доска мигнула, фишка переехала, и почему — ищи во вкладке журнала.
        Берётся последняя запись летописи — та самая, что и так ведётся.
      */
      const last = state.log[state.log.length - 1];
      if (last && last.text) line.appendChild(el('span', 'turnline-last', last.text));
    }
    return line;
  }

  function button(label, kind, onClick) {
    const node = el('button', 'btn btn--' + kind, label);
    node.type = 'button';
    node.addEventListener('click', onClick);
    return node;
  }

  // ————————————————————————————————————————————————— шторка уделов

  /*
    ——— составление уговора ———

    Шторка уделов на время становится столом переговоров: слева своё, справа
    чужое, снизу доплата. Отдельного экрана нет нарочно — уделы выбирают там же,
    где их обычно смотрят, и по дороге видно, что у кого заложено и застроено.
  */
  function renderTradeComposer(sheet) {
    const me = playerById(meId());
    const others = state.players.filter((one) => !one.out && !one.servantOf && one.id !== me.id);
    if (!tradeDraft.to && others.length) tradeDraft.to = others[0].id;
    const mate = playerById(tradeDraft.to);

    sheet.appendChild(el('h3', null, 'Уговор об обмене'));
    sheet.appendChild(el('p', 'empty', 'Заложенное и застроенное в обмен не идёт: сначала выкупите '
      + 'или продайте ступени.'));

    const who = el('div', 'trade-row');
    for (const one of others) {
      const chip = button(one.name, one.id === tradeDraft.to ? 'chip chip--on' : 'chip', () => {
        tradeDraft = { to: one.id, give: tradeDraft.give, take: [], silver: 0 };
        updateSheet();
      });
      who.appendChild(chip);
    }
    sheet.appendChild(el('h4', null, 'С кем'));
    sheet.appendChild(who);

    const side = (title, ownerId, picked) => {
      sheet.appendChild(el('h4', null, title));
      const list = E.tradables(state, ownerId);
      if (!list.length) { sheet.appendChild(el('p', 'empty', 'Менять нечего.')); return; }
      const row = el('div', 'trade-row');
      for (const n of list) {
        const spec = B.BOARD[n];
        const on = picked.includes(n);
        row.appendChild(button(`${spec.name} · ${spec.price}`, on ? 'chip chip--on' : 'chip', () => {
          const at = picked.indexOf(n);
          if (at >= 0) picked.splice(at, 1); else picked.push(n);
          updateSheet();
        }));
      }
      sheet.appendChild(row);
    };
    side('Вы отдаёте', me.id, tradeDraft.give);
    // Имя соседа уже названо строкой «С кем», и склонять его тут не за чем:
    // «Просите у Ефрем» — не по-русски, а подбирать падеж каждому имени игры
    // дороже, чем просто не повторять имя.
    if (mate) side('Просите взамен', mate.id, tradeDraft.take);

    /*
      Доплата одной строкой и в обе стороны: положительная — доплачиваю я,
      отрицательная — просят с соседа. Шаг в полсотни, потому что торг в этой
      игре идёт сотнями, а не единицами.
    */
    sheet.appendChild(el('h4', null, 'Доплата серебром'));
    const money = el('div', 'trade-money');
    const step = (delta) => {
      const limit = delta > 0 ? me.silver : (mate ? mate.silver : 0);
      const next = tradeDraft.silver + delta;
      tradeDraft.silver = Math.max(-(mate ? mate.silver : 0), Math.min(me.silver, next));
      if (Math.abs(tradeDraft.silver) > limit && delta > 0) tradeDraft.silver = limit;
      updateSheet();
    };
    money.appendChild(button('−50', 'small ghost', () => step(-50)));
    const amount = el('b', 'trade-amount', tradeDraft.silver === 0
      ? 'без доплаты'
      : tradeDraft.silver > 0
        ? `вы даёте ${tradeDraft.silver}`
        : `просите ${-tradeDraft.silver}`);
    money.appendChild(amount);
    money.appendChild(button('+50', 'small', () => step(50)));
    sheet.appendChild(money);

    // Счёт по цене — самое понятное мерило: сколько стоит то и другое в кассе.
    const price = (list) => list.reduce((sum, n) => sum + B.BOARD[n].price, 0);
    const mineSum = price(tradeDraft.give) + Math.max(0, tradeDraft.silver);
    const theirSum = price(tradeDraft.take) + Math.max(0, -tradeDraft.silver);
    sheet.appendChild(el('p', 'trade-sum',
      `По цене: вы отдаёте на ${mineSum} сиклей, получаете на ${theirSum}.`));

    const ready = Boolean(mate) && (tradeDraft.give.length || tradeDraft.take.length);
    const acts = el('div', 'trade-row');
    const send = button('Предложить', 'primary', () => {
      const draft = { to: tradeDraft.to, give: [...tradeDraft.give], take: [...tradeDraft.take], silver: tradeDraft.silver };
      tradeDraft = null;
      sheetOpen = false;
      act('tradeOffer', draft);
      render();
      askBotAboutTrade();
    });
    send.disabled = !ready;
    acts.appendChild(send);
    acts.appendChild(button('Отмена', 'ghost', () => { tradeDraft = null; updateSheet(); }));
    sheet.appendChild(acts);
  }

  function updateSheet() {
    const sheet = $('sheet');
    sheet.hidden = !sheetOpen;
    if (!sheetOpen) return;
    sheet.innerHTML = '';
    if (tradeDraft) { renderTradeComposer(sheet); return; }
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
    /*
      Обмен предлагают отсюда: он про уделы, и звать его надо там, где на них
      смотрят. Кнопка появляется только в свой ход и только когда меняться
      вообще есть чем — своим или чужим.
    */
    if (!busy && E.canOfferTrade(state) && player.id === meId()
      && state.players.some((one) => one.id !== player.id && !one.out && E.tradables(state, one.id).length)) {
      const start = button('Предложить уговор об обмене', 'primary', () => {
        tradeDraft = { to: '', give: [], take: [], silver: 0 };
        updateSheet();
      });
      start.classList.add('trade-start');
      sheet.appendChild(start);
    }
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
      row.style.setProperty('--band', B.colorOf(spec) || 'transparent');
      row.appendChild(img(art('plots', spec.slug), 'holding-art', spec.name));
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
      row.style.setProperty('--band', B.colorOf(spec) || 'transparent');
      row.appendChild(img(art('plots', spec.slug), 'holding-art', spec.name));

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
    const toLobby = $('lobby-btn');
    /*
      «Ещё раз» по сети — не перезагрузка страницы: та выкинула бы игрока из
      комнаты, где остались остальные.

      Хозяину она значит то же, что и за одним столом: сдать заново тем же
      составом, не разводя всех по лобби и не спрашивая готовность заново — её
      только что подтвердили доигранной партией. Кому нужно поменять годы или
      позвать кого-то ещё, для того рядом «В комнату».

      Гостю решать нечего: он уходит ждать в комнату, а начинает хозяин.
    */
    const host = Boolean(roomView?.youAreHost);
    again.textContent = link ? (host ? 'Играть ещё раз' : 'В комнату') : 'Ещё раз';
    toLobby.hidden = !(link && host);
    again.onclick = () => {
      if (!link) { location.reload(); return; }
      if (host) { link.send('playAgain'); return; }
      waitingInLobby = true;
      $('jubilee').hidden = true;
      $('online').hidden = false;
      if (roomView) renderLobby(roomView);
    };
    toLobby.onclick = () => { if (link && host) link.send('backToLobby'); };
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
    placeActions();
    liftCard();
    updateSheet();
    updateFeed();
  }

  /*
    Решения встают под карточку, а не отдельной полосой внизу.

    Карточка говорит, на что вы встали, кнопки — что с этим можно сделать, и
    разносить их по разным концам экрана незачем: глаз всё равно ходит от
    одного к другому. Внизу остаётся то, что к клетке не привязано, — жребий,
    конец хода и кнопка «Ещё».

    Второй ярус («Ещё») не переезжает никогда: он про партию, а не про клетку.
  */
  function placeActions() {
    const core = $('core');
    const bar = $('actions');
    const main = bar.querySelector('.actions-main');
    if (!core || !main) return;
    const toCard = !core.hidden && main.childElementCount > 0 && !main.querySelector('.waiting');
    main.classList.toggle('core-acts', toCard);
    if (!toCard) return;
    /*
      На место уехавшей группы решений встаёт распорка её высоты.

      Без неё полоса внизу худеет ровно на главную кнопку, доска берёт остаток
      экрана и на столько же вырастает — а потом опадает: каждая остановка
      фишки кончалась бы скачком поля. Раньше здесь стоял запас числом, и
      число это разошлось с явью дважды подряд, стоило кнопкам подрасти.
      Распорка не расходится: она и есть та самая высота.
    */
    const hold = el('div', 'actions-hold');
    hold.setAttribute('aria-hidden', 'true');
    /*
      Прежняя группа решений с карточки снимается. Раньше об этом заботиться
      было незачем: карточка на каждом обновлении собиралась с нуля и уносила
      прошлую группу с собой. Теперь она пересобирается, только когда её
      содержимое изменилось, — и две группы кнопок на одной карточке
      получились бы сами собой.
    */
    for (const old of core.querySelectorAll('.actions-main')) {
      if (old !== main) old.remove();
    }
    core.appendChild(main);
    bar.insertBefore(hold, bar.firstChild);
  }

  /*
    Полёт карточки. Она не появляется на середине экрана из ниоткуда — она
    взлетает с той плитки, на которую встала фишка, и вырастает по дороге.
    Так видно, о какой клетке речь, даже не читая названия: взгляд уже там.

    Полёт запускается один раз на клетку, а не на каждую перерисовку: за один
    ход карточка обновляется несколько раз — пришла плата, изменился кошелёк,
    открылся ящик, — и дёргаться при каждом обновлении ей незачем.
  */
  let cardFrom = null;

  function liftCard() {
    const core = $('core');
    if (!core) return;
    const from = core.hidden ? null : (core.dataset.from ?? null);
    if (from === cardFrom) return;
    cardFrom = from;
    core.classList.remove('is-lifting');
    const canvas = $('board3d');
    // Без объёмной доски взлетать неоткуда: у разметочного поля нет плиток на
    // экране, карточка висит в дырке кольца и просто появляется.
    if (from === null || !scene || canvas.hidden || REDUCED) return;
    const spot = scene.screenOf(Number(from));
    if (!spot) return;
    const frame = canvas.getBoundingClientRect();
    const box = core.getBoundingClientRect();
    if (!box.width) return;
    core.style.setProperty('--from-x',
      `${Math.round(frame.left + spot.x - (box.left + box.width / 2))}px`);
    core.style.setProperty('--from-y',
      `${Math.round(frame.top + spot.y - (box.top + box.height / 2))}px`);
    // Перезапуск проигранной анимации: без принудительного пересчёта браузер
    // считает, что класс и не снимался, и второй раз её не показывает.
    void core.offsetWidth;
    core.classList.add('is-lifting');
  }

  function updateFeed() {
    const feed = $('feed');
    feed.innerHTML = '';
    /*
      Журнал открывается вкладкой, как уделы и игроки. Висеть на экране всегда
      ему незачем: читают его редко, а место он занимал каждый ход.
    */
    feed.hidden = !feedOpen;
    if (!feedOpen) return;
    feed.appendChild(el('h2', 'feed-title', 'Журнал ходов'));
    // Восемь записей, а не четыре: стоймя журналу досталось место, которое
    // доска взять не смогла, и заполнять его пустотой незачем. Что не влезло —
    // прокручивается, самое свежее сверху.
    for (const entry of state.log.slice(-8).reverse()) {
      feed.appendChild(el('div', 'feed-line', entry.text));
    }
  }

  function after() {
    render();
    scheduleBot();
  }

  /*
    Кто здесь я. По сети — моё место за столом. За одним столом — тот, чей ход,
    а пока ходит соперник, последний живой человек: экран один на всех, и
    отвечать на уговор с него будет тот, кто сидит перед ним.
  */
  function meId() {
    if (link) return mySeat;
    const turnPlayer = E.current(state);
    return turnPlayer.isBot ? (lastHumanId || turnPlayer.id) : turnPlayer.id;
  }

  const playerById = (id) => state.players.find((one) => one.id === id) || null;

  /*
    Ответ соперника от игры на уговор. За одним столом его даёт эта же вкладка —
    но не мгновенно: уговор, отклонённый в тот же миг, читается как поломка
    кнопки, а не как ответ. По сети отвечает сервер, и здесь делать нечего.
  */
  function askBotAboutTrade() {
    if (link || !state.trade) return;
    const to = playerById(state.trade.to);
    if (!to || !to.isBot) return;
    setTimeout(() => {
      if (!state.trade || link) return;
      Bots.judgeTrade(state);
      render();
    }, 900);
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
    /*
      Уговор, предложенный человеку, останавливает соперников до ответа. Иначе
      предложивший тут же доигрывал свой ход, а уговор отменялся вместе с ним:
      человек видел кнопки «Принять» и «Отказаться» секунду и не успевал даже
      прочитать, что ему предлагают.
    */
    if (state.trade && !playerById(state.trade.to)?.isBot) return;
    if (!E.current(state).isBot) return;
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
    }, PACE.wait);
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
      // Кости катятся на самой карточке, а она к этому мигу закрыта: клетка
      // ещё ничего не сказала. Открываем её под бросок и не помечаем, откуда
      // она взялась, — взлетать ей неоткуда, жребий бросают не с клетки.
      core.hidden = false;
      delete core.dataset.from;
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
    const body = $('cell-body');
    body.innerHTML = '';
    describeCell(body, n);
  }

  /*
    Полное описание клетки — одно на всю игру.

    Раньше их было два: подробное в окне, которое открывается нажатием по
    плитке, и короткое на карточке, которая прилетает, когда на клетку встали.
    Короткое и подводило: покупать удел приходилось, видя цену и ступень, но
    не видя, сколько он будет брать с гостей на каждой ступени, — а это и есть
    то, ради чего его покупают. Теперь описание одно, и на своём ходу карточка
    показывает его целиком. Коротким оно остаётся только на чужом ходу: там
    его читают мельком, из любопытства, а не чтобы решать.
  */
  function describeCell(body, n) {
    const spec = B.BOARD[n];
    const cell = state ? state.cells[n] : null;

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
    /*
      Хозяин назван через двоеточие, а не «земля такого-то»: имена игроки
      придумывают сами, а склонять придуманное имя игра не умеет — выходило
      «Земля Игрок» и «жертвенник Асаф». Двоеточие ставит имя в именительный
      падеж, и любое имя в эту строку встаёт правильно.
    */
    body.appendChild(el('p', 'cell-text', owner
      ? (cell.altar ? `Жертвенник, хозяин: ${owner.name}. Платы за эту землю нет.`
        : (cell.level > 0 ? `Хозяин: ${owner.name}. Обжита: ${B.LEVELS[cell.level - 1].toLowerCase()}.`
          : `Хозяин: ${owner.name}. Построек пока нет.`))
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

  /*
    Ход наружу для проверок. Партия живёт внутри этого файла, и спросить у неё
    «чей ход, у кого какой удел» иначе нельзя: проверка видит только разметку и
    не отличает «уговор не дошёл» от «уговор дошёл, но не нарисовался».
    Наружу отдаётся чтение, перерисовка и побудка соперников — та самая, что
    идёт за любой кнопкой партии. Ходов здесь нет: сыграть отсюда за игрока
    нельзя, а вот проверить, что соперники ждут ответа на уговор, — можно.
  */
  window.PromisedLandGame = {
    state: () => state,
    refresh: () => render(),
    wake: () => after(),
    /*
      Неспешность соперников — наружу и на чтение, и на запись. Читать её надо
      затем, что она и есть предмет правила: партия, в которой соперники
      мелькают, человеку не читается, и проверка обязана поймать возврат к
      прежним девятистам миллисекундам. Писать — затем, что проверка
      доигрывает партию до юбилея, и полторы секунды на шаг превращают её в
      получасовое ожидание; на ход партии это число не влияет никак.
    */
    pace: (ms) => (ms === undefined ? PACE.wait : (PACE.wait = Math.max(0, Number(ms) || 0))),
  };

  setupScreen();
  modeScreen();
  fillRules();
  if (/^[A-Z0-9]{5}$/i.test(new URLSearchParams(location.search).get('room') || '')) {
    showScreen('online');
    startOnline();
  }
})();
