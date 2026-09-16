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
  // Сцена в объёме. Её может не быть: WebGL на слабом устройстве не дают, и
  // тогда игра идёт на поле из разметки — оно работает всегда.
  let scene = null;

  // ————————————————————————————————————————————————— начало партии

  function setupScreen() {
    $('setup').hidden = false;
    $('game').hidden = true;
    $('jubilee').hidden = true;
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

  const chosen = (key) => {
    const group = document.querySelector(`.choice[data-key="${key}"]`);
    return Number(group.querySelector('[aria-pressed="true"]').dataset.value);
  };

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
    const years = chosen('years');
    const players = [];
    for (let i = 0; i < humans; i += 1) players.push({ name: humans === 1 ? 'Игрок' : `Игрок ${i + 1}` });
    for (let i = 0; i < bots; i += 1) {
      players.push({ name: BOT_NAMES[i], isBot: true, botLevel: i % 2 ? 'scribe' : 'elder' });
    }
    state = E.createGame({ players, years });
    $('setup').hidden = true;
    $('game').hidden = false;
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
          // Полоса управления — всё, что лежит внизу поперёк экрана. Узкую
          // карточку сюда не берём: она стоит сбоку и клеток не закрывает.
          for (const id of ['teach', 'actions', 'players', 'feed', 'core']) {
            const node = $(id);
            if (!node || node.hidden || !node.offsetParent) continue;
            const rect = node.getBoundingClientRect();
            if (rect.height === 0 || rect.width < box.width * 0.62) continue;
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
      const spec = B.BOARD[pending.cell];
      core.appendChild(img(art('plots', spec.slug), 'core-art', spec.name));
      core.appendChild(el('div', 'core-kind', kindLabel(spec)));
      core.appendChild(el('div', 'core-name', spec.name));
      core.appendChild(el('div', 'core-note', `Свободен. Цена ${spec.price} сиклей.`));
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
    tent: 'Гостеприимство. Всё, что собралось в казне с десятин и приношений, достаётся вам, '
      + 'и сверх того — одно очко наследия.',
    slander: 'Вас оговорили перед царём: отправляйтесь в темницу. Урожай по дороге не собирается.',
    tithe: 'Десятая часть вашего серебра уходит в казну — не меньше 50 и не больше 400. '
      + 'Отданное не пропадает: каждые полные 100 сиклей десятины дают очко наследия.',
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
    $('year').textContent = state.sabbath
      ? `Субботний год ${state.year} из ${state.years}`
      : `Год ${state.year} из ${state.years}`;
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

  function updateActions() {
    const bar = $('actions');
    bar.innerHTML = '';
    const player = E.current(state);
    const sheetButton = button(sheetOpen ? 'Скрыть уделы' : 'Мои уделы', 'ghost', () => {
      sheetOpen = !sheetOpen;
      render();
    });
    if (player.isBot || autoPlay) {
      bar.appendChild(el('div', 'waiting',
        player.isBot ? `${player.name} ходит…` : 'Играю за вас…'));
      bar.appendChild(sheetButton);
      bar.appendChild(autoButton());
      return;
    }

    /*
      Счёт ждёт решения. Заплатить, продать что-нибудь и заплатить или пойти в
      наём — это выбор, а не следствие, и делает его человек.
    */
    if (state.pending && state.pending.type === 'pay') {
      const owed = state.pending.amount;
      if (player.silver >= owed) {
        bar.appendChild(button(`Заплатить ${owed}`, 'primary', () => { E.settle(state); after(); }));
      } else {
        if (E.liquidValue(state, player) >= owed) {
          bar.appendChild(button(`Продать и заплатить ${owed}`, 'primary', () => { E.settle(state, true); after(); }));
        }
        bar.appendChild(button('Пойти в наём', 'ghost', () => { E.serve(state); after(); }));
      }
      bar.appendChild(sheetButton);
      bar.appendChild(autoButton());
      return;
    }

    if (state.phase === 'roll') {
      const cast = button('Бросить жребий', 'primary', async () => {
        if (rolling) return;
        cast.disabled = true;
        rolling = true;
        await animatedRoll(() => E.roll(state));
        rolling = false;
        after();
      });
      bar.appendChild(cast);
    } else if (state.pending && state.pending.type === 'buy') {
      const spec = B.BOARD[state.pending.cell];
      bar.appendChild(button(`Купить за ${spec.price}`, 'primary', () => { E.buy(state); after(); }));
      bar.appendChild(button('Отказаться', 'ghost', () => { E.decline(state); after(); }));
    } else {
      bar.appendChild(button('Закончить ход', 'primary', () => { E.endTurn(state); after(); }));
    }
    bar.appendChild(sheetButton);
    bar.appendChild(autoButton());
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
    const player = turnPlayer.isBot
      ? (state.players.find((p) => p.id === lastHumanId) || turnPlayer)
      : turnPlayer;
    const busy = turnPlayer.isBot || state.phase === 'decide';
    if (turnPlayer.isBot) sheet.appendChild(el('p', 'empty', `Ходит ${turnPlayer.name}. Действия появятся в ваш ход.`));

    const mine = state.cells
      .map((cell, n) => n)
      .filter((n) => state.cells[n].owner === player.id);

    sheet.appendChild(el('h3', null, `Уделы: ${player.name}`));
    if (!mine.length) sheet.appendChild(el('p', 'empty', 'Пока ничего не куплено.'));

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
        acts.appendChild(button(`Строить ${B.GROUPS[spec.group].build}`, 'small', () => { E.build(state, n); render(); }));
      }
      if (E.canAltar(state, player, n) && !busy) {
        acts.appendChild(button(`Жертвенник ${B.GROUPS[spec.group].build}`, 'small alt', () => { E.altar(state, n); render(); }));
      }
      if (E.canSell(state, player, n) && !busy) {
        acts.appendChild(button('Продать', 'small ghost', () => { E.sell(state, n); render(); }));
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
          acts.appendChild(button(`Выкупить ${debtor.debt}`, 'small', () => { E.redeem(state, debtor.id); render(); }));
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
        ['десятина', score.tithe],
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
    $('again-btn').onclick = () => location.reload();
  }

  // ————————————————————————————————————————————————— цикл

  function render() {
    const turnPlayer = state.players[state.turn];
    if (turnPlayer && !turnPlayer.isBot) lastHumanId = turnPlayer.id;
    if (state.status === 'jubilee') { showJubilee(); return; }
    updateRing();
    if (scene) scene.sync(state, colorOfPlayer);
    updateCore();
    updateHud();
    updateActions();
    updateSheet();
    updateFeed();
  }

  function updateFeed() {
    const feed = $('feed');
    feed.innerHTML = '';
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
    if (state.status !== 'playing') return;
    if (!E.current(state).isBot && !autoPlay) return;
    botTimer = setTimeout(async () => {
      if (state.status !== 'playing') return;
      let done;
      if (state.phase === 'roll' && !E.current(state).skip) {
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
    }, 620);
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
  fillRules();
})();
