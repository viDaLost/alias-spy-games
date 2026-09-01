(() => {
  'use strict';

  // Наглядные разборы механик для одиночных игр.
  //
  // Текстом «каскад умножает очки» объяснить нельзя — это надо показать. Здесь
  // маленькая сцена, которая проигрывает механику по шагам и повторяется по
  // кругу: те же фишки и те же картинки, что в самой игре.
  //
  // Сцена собирается не покадрово руками, а из шагов (поменять, убрать,
  // обвалить). Кадры считает крошечный симулятор: у каждой фишки есть
  // постоянный id, поэтому падение и обмен браузер анимирует сам переносом
  // элемента, а не подменой картинки.
  //
  // Онлайн-игры сюда не входят: там правила описывают живых людей за столом, а
  // не поведение экрана, и показывать нечего.

  const V17 = 'web/assets/biblical-match-three/icons-v17';

  const SYMBOL_ART = {
    B: `${V17}/bible.webp`,
    F: `${V17}/fish.webp`,
    D: `${V17}/dove.webp`,
    L: `${V17}/candle.webp`,
    C: `${V17}/crown.webp`,
    A: `${V17}/ark.webp`,
    H: `${V17}/bread.webp`,
    G: `${V17}/grapes.webp`,
    T: `${V17}/tablets.webp`,
  };

  const MARK_ART = {
    line: `${V17}/staff.webp`,
    burst: `${V17}/jericho.webp`,
    rainbow: `${V17}/covenant.webp`,
  };

  const BLOCKER_ART = {
    chain: `${V17}/chains.webp`,
    tablet: `${V17}/tablets.webp`,
    lamp: `${V17}/candle.webp`,
    vine: `${V17}/vine.webp`,
    relic: `${V17}/covenant-ark.webp`,
  };

  // --- симулятор поля ----------------------------------------------------------

  class Stage {
    constructor(cols, rows, rowsText, refill) {
      this.cols = cols;
      this.rows = rows;
      this.refill = refill.split('');
      this.refillAt = 0;
      this.nextId = 1;
      this.cells = new Array(cols * rows).fill(null);
      this.checks = [];
      rowsText.forEach((line, row) => {
        line.split('').forEach((char, col) => {
          if (char === '.') return;
          this.cells[row * cols + col] = { id: `t${this.nextId++}`, s: char };
        });
      });
      this.frames = [];
    }

    at(col, row) { return row * this.cols + col; }

    /** Снимок текущего поля плюс то, что показывается поверх него. */
    frame({ hold = 900, label = '', finger = null, beam = null, flash = [], leaving = [] } = {}) {
      const tiles = [];
      this.cells.forEach((cell, index) => {
        if (!cell) return;
        tiles.push({
          id: cell.id,
          art: SYMBOL_ART[cell.s] || SYMBOL_ART.B,
          col: index % this.cols,
          row: Math.floor(index / this.cols),
          mark: cell.mark || '',
          blocker: cell.blocker || '',
          layers: cell.layers || 0,
          lit: Boolean(cell.lit),
          dim: Boolean(cell.dim),
          flash: flash.includes(cell.id),
          leaving: leaving.includes(cell.id),
        });
      });
      this.frames.push({ tiles, hold, label, finger, beam });
      return this;
    }

    label(text, hold = 900) { return this.frame({ label: text, hold }); }

    swap(a, b, { label = '', hold = 620 } = {}) {
      const from = this.at(...a);
      const to = this.at(...b);
      // Палец показывается на кадре до обмена, иначе непонятно, кто кого двигал.
      this.frame({ label, hold: 620, finger: { from: [a[0], a[1]], to: [b[0], b[1]] } });
      const keep = this.cells[from];
      this.cells[from] = this.cells[to];
      this.cells[to] = keep;
      return this.frame({ label, hold });
    }

    mark(cell, type) {
      const target = this.cells[this.at(...cell)];
      if (target) target.mark = type;
      return this;
    }

    blocker(cell, type, { layers = 1, lit = false } = {}) {
      const target = this.cells[this.at(...cell)];
      if (target) { target.blocker = type; target.layers = layers; target.lit = lit; }
      return this;
    }

    dim(cells, on = true) {
      cells.forEach((cell) => { const target = this.cells[this.at(...cell)]; if (target) target.dim = on; });
      return this;
    }

    /** Подсветить, затем убрать: без вспышки исчезновение читается как сбой. */
    //
    // effect: true — это работа особой фишки, а не совпадение. Обычные вызовы
    // проверяются audit(): в них должен уходить настоящий ряд одинаковых фишек,
    // иначе разбор научит тому, чего в игре нет.
    clear(cells, { label = '', beam = null, hold = 700, effect = false, anchor = null } = {}) {
      const indexes = cells.map((cell) => this.at(...cell));
      if (!effect) {
        // anchor — клетка, где остаётся особая фишка. Она не исчезает, но в ряд
        // входит, иначе разбор выглядит как совпадение с дыркой посередине.
        const line = anchor ? [...cells, anchor] : cells;
        this.checks.push({
          cells: line.map((cell) => [...cell]),
          symbols: line.map((cell) => this.cells[this.at(...cell)]?.s || null),
        });
      }
      const ids = indexes.map((index) => this.cells[index]?.id).filter(Boolean);
      this.frame({ label, hold: 520, flash: ids, beam });
      this.frame({ label, hold: 320, leaving: ids, beam });
      indexes.forEach((index) => { this.cells[index] = null; });
      return this.frame({ label, hold });
    }

    /** Какие символы стоят на поле сейчас — для разбора сцены проверкой. */
    snapshot() {
      const out = [];
      for (let row = 0; row < this.rows; row += 1) {
        let line = '';
        for (let col = 0; col < this.cols; col += 1) line += this.cells[this.at(col, row)]?.s || '.';
        out.push(line);
      }
      return out;
    }

    /** Гравитация и новые фишки сверху — тем же порядком, что в игре. */
    fall({ label = '', hold = 760 } = {}) {
      for (let col = 0; col < this.cols; col += 1) {
        let write = this.rows - 1;
        for (let row = this.rows - 1; row >= 0; row -= 1) {
          const cell = this.cells[this.at(col, row)];
          if (!cell) continue;
          this.cells[this.at(col, row)] = null;
          this.cells[this.at(col, write)] = cell;
          write -= 1;
        }
        for (let row = write; row >= 0; row -= 1) {
          const char = this.refill[this.refillAt % this.refill.length];
          this.refillAt += 1;
          this.cells[this.at(col, row)] = { id: `t${this.nextId++}`, s: char };
        }
      }
      return this.frame({ label, hold });
    }
  }

  const build = (cols, rows, board, refill) => new Stage(cols, rows, board, refill);

  // --- сцены -------------------------------------------------------------------

  const SCENES = {
    // Три в ряд, падение и каскад — всё в одном проходе, потому что каскад
    // непонятен в отрыве от падения.
    'bmt-basics'() {
      const stage = build(5, 5, [
        'DFCDF',
        'CDFCD',
        'FCDFC',
        'FBDBF',
        'BDBDC',
      ], 'CFDF');
      stage.label('Меняем местами две соседние фишки', 850);
      stage.swap([1, 3], [1, 4], { label: 'Три одинаковых в ряд' });
      stage.clear([[0, 4], [1, 4], [2, 4]], { label: 'Три одинаковых исчезают' });
      stage.fall({ label: 'Верхние фишки падают вниз' });
      stage.clear([[1, 4], [2, 4], [3, 4]], { label: 'КАСКАД ×2 — сложилось само при падении' });
      stage.fall({ label: 'Каждая ступень каскада умножает очки', hold: 1200 });
      return stage;
    },

    // Четыре в ряд и то, что из этого выходит.
    'bmt-specials'() {
      const stage = build(5, 5, [
        'DCDCD',
        'CDCDC',
        'DCDCD',
        'CBFFC',
        'FFDFB',
      ], 'DCDC');
      stage.label('Четыре в ряд оставляют Трубу', 850);
      stage.swap([2, 4], [2, 3], { label: 'Четыре одинаковых в ряд' });
      stage.clear([[0, 4], [1, 4], [3, 4]], { label: 'Четыре одинаковых в ряд', anchor: [2, 4] });
      stage.mark([2, 4], 'line');
      stage.frame({ label: 'На месте совпадения осталась Труба', hold: 1100 });
      stage.clear([[2, 4], [4, 4]], {
        label: 'Труба убирает весь ряд целиком',
        beam: { type: 'row', row: 4 },
        effect: true,
      });
      stage.fall({ label: 'Угол или крест дают Свет — взрыв 3×3', hold: 1200 });
      return stage;
    },

    // Радуга — единственная особая фишка, которую наводят на вид фишек.
    'bmt-rainbow'() {
      const stage = build(5, 4, [
        'DFDBF',
        'FDBFD',
        'DBFDB',
        'FDBFD',
      ], 'FBFB');
      stage.mark([2, 2], 'rainbow');
      stage.label('Радуга Завета ждёт, к какому виду её подведут', 1000);
      stage.swap([2, 2], [3, 2], { label: 'Меняем её на голубя' });
      // Все голуби поля плюс сама радуга: это её работа, а не совпадение.
      stage.clear([[0, 0], [2, 0], [1, 1], [4, 1], [0, 2], [2, 2], [1, 3], [4, 3], [3, 2]], {
        label: 'С поля уходят все голуби разом',
        beam: { type: 'flash' },
        effect: true,
      });
      stage.fall({ label: 'Чем больше этого вида на поле, тем сильнее удар', hold: 1200 });
      return stage;
    },

    // Препятствия ведут себя по-разному, и разница дорого стоит на уровне.
    'bmt-blockers'() {
      const stage = build(5, 4, [
        'FDFCD',
        'CFDFC',
        'DDCFD',
        'FADCD',
      ], 'FCDF');
      stage.blocker([0, 1], 'chain');
      stage.blocker([2, 1], 'tablet');
      stage.blocker([3, 2], 'lamp');
      stage.blocker([1, 3], 'vine');
      stage.label('Цепь, скрижаль, светильник и тернии', 1100);
      stage.swap([2, 2], [2, 3], { label: 'Собираем три рядом с ними' });
      stage.clear([[0, 2], [1, 2], [2, 2]], { label: 'Совпадение рядом с цепью' });
      stage.blocker([0, 1], '');
      stage.blocker([3, 2], 'lamp', { lit: true });
      stage.frame({ label: 'Цепь сломана, светильник рядом загорелся', hold: 1200 });
      stage.frame({ label: 'Скрижаль и тернии соседним совпадением не берутся', hold: 1300 });
      stage.fall({ label: 'По ним нужно попасть совпадением прямо, иначе тернии разрастутся', hold: 1400 });
      return stage;
    },

    // Ковчег двигать нельзя, и это сбивает с толку сильнее всего.
    'bmt-ark'() {
      const stage = build(5, 5, [
        'DFDCF',
        'FDCFD',
        'DCFCD',
        'CFCDF',
        'FDCFD',
      ], 'DFCD');
      stage.blocker([2, 1], 'relic');
      stage.label('Ковчег не двигается — его нельзя менять местами', 1100);
      stage.swap([2, 2], [2, 3], { label: 'Убираем фишки под ковчегом' });
      stage.clear([[1, 2], [2, 2], [3, 2]], { label: 'Убираем фишки под ковчегом' });
      stage.fall({ label: 'Ковчег опускается на освободившееся место' });
      stage.frame({ label: 'Цель выполнена, когда ковчег дойдёт до нижнего ряда', hold: 1500 });
      return stage;
    },
  };

  // --- буквенные сцены (словесные игры) ----------------------------------------
  //
  // Здесь поле не нужно: у этих игр механика — это жест по буквам, а не падение.

  const LETTER_SCENES = {
    'wow-word': {
      kind: 'circle',
      letters: 'ДРАНИО'.split(''),
      steps: [
        { label: 'Ведите пальцем по буквам', trace: [], word: '' },
        { label: 'Слово складывается на ходу', trace: [0, 1], word: 'ДР' },
        { label: 'Слово складывается на ходу', trace: [0, 1, 2], word: 'ДРА' },
        { label: 'Одно слово всегда использует все буквы', trace: [4, 2, 5, 0, 1, 3], word: 'ИОРДАН', ok: true },
        { label: 'Основные слова открываются сверху, бонусные дают +2★', trace: [], word: '', hold: 1400 },
      ],
    },
    'ws-find': {
      kind: 'grid',
      cols: 6,
      rows: 5,
      // АВРААМ лежит строкой, ИОВ — по диагонали: оба показываются по очереди.
      letters: 'СЛОВОЖАВРААМИДТПШЦМОИСЕЙГРВХЭБ'.split(''),
      steps: [
        { label: 'Слова спрятаны по прямой в любую сторону', path: [] },
        { label: 'Проведите пальцем от первой буквы к последней', path: [6, 7, 8] },
        { label: 'Найденное слово подсвечивается и даёт +2★', path: [6, 7, 8, 9, 10, 11], ok: true, hold: 1400 },
        { label: 'Слово может идти и по диагонали, и задом наперёд', path: [12, 19, 26], ok: true, hold: 1500 },
      ],
    },
    'sacred-letters': {
      kind: 'word',
      // В слове две «И»: на нём видно, что верная буква открывается везде сразу.
      word: 'СКИНИЯ',
      steps: [
        { label: 'Известны категория и подсказка', open: [], errors: 0 },
        { label: 'Верная буква открывается во всех местах сразу', open: ['И'], errors: 0, hold: 1300 },
        { label: 'Неверная гасит светильник на одно деление', open: ['И'], errors: 1, miss: 'А', hold: 1300 },
        { label: 'Всего допускается 7 ошибок', open: ['И', 'С', 'Н'], errors: 1 },
        { label: 'Слово открыто', open: ['И', 'С', 'Н', 'К', 'Я'], errors: 1, ok: true, hold: 1500 },
      ],
    },
    'pairs-flip': {
      kind: 'cards',
      faces: ['🦁', '🐘', '🕊️', '🐢', '🦁', '🕊️', '🐢', '🐘'],
      steps: [
        { label: 'Открывайте по две карточки', open: [] },
        { label: 'Открывайте по две карточки', open: [0, 3] },
        { label: 'Не совпали — закрываются обратно', open: [0, 3], miss: true },
        { label: 'Открывайте по две карточки', open: [] },
        { label: 'Совпали — остаются открытыми', open: [0, 4], ok: true, hold: 1300 },
        { label: 'Цель — открыть все пары', open: [0, 4], done: [0, 4], hold: 1300 },
      ],
    },
  };

  // --- проигрыватель -----------------------------------------------------------

  const players = new Map();

  function tileMarkup(tile, size, gap) {
    const x = tile.col * (size + gap);
    const y = tile.row * (size + gap);
    const classes = ['rd-tile'];
    if (tile.flash) classes.push('is-flash');
    if (tile.leaving) classes.push('is-leaving');
    if (tile.dim) classes.push('is-dim');
    if (tile.blocker) classes.push(`has-${tile.blocker}`);
    if (tile.lit) classes.push('is-lit');
    const overlay = tile.blocker
      ? `<img class="rd-blocker" src="${BLOCKER_ART[tile.blocker]}" alt="" draggable="false" />`
      : '';
    // Особая фишка в игре не получает значок в углу, а целиком заменяет собой
    // символ (v36-biblical-treasures-special-art.js). Разбор повторяет это,
    // иначе на поле игрок будет искать глазами не то.
    const art = tile.mark ? (MARK_ART[tile.mark] || tile.art) : tile.art;
    if (tile.mark) classes.push('is-special');
    return `<div class="${classes.join(' ')}" data-tile="${tile.id}" style="width:${size}px;height:${size}px;transform:translate(${x}px, ${y}px)">
      <img class="rd-piece" src="${art}" alt="" draggable="false" />${overlay}
    </div>`;
  }

  function beamMarkup(beam, cols, rows, size, gap) {
    if (!beam) return '';
    if (beam.type === 'row') {
      return `<div class="rd-beam rd-beam--row" style="top:${beam.row * (size + gap)}px;height:${size}px;width:${cols * (size + gap) - gap}px"></div>`;
    }
    if (beam.type === 'col') {
      return `<div class="rd-beam rd-beam--col" style="left:${beam.col * (size + gap)}px;width:${size}px;height:${rows * (size + gap) - gap}px"></div>`;
    }
    return '<div class="rd-beam rd-beam--flash"></div>';
  }

  function fingerMarkup(finger, size, gap) {
    if (!finger) return '';
    const [fc, fr] = finger.from;
    const [tc, tr] = finger.to;
    const half = size / 2;
    const x1 = fc * (size + gap) + half;
    const y1 = fr * (size + gap) + half;
    const x2 = tc * (size + gap) + half;
    const y2 = tr * (size + gap) + half;
    return `<div class="rd-finger" style="--x1:${x1}px;--y1:${y1}px;--x2:${x2}px;--y2:${y2}px"></div>`;
  }

  function renderBoardFrame(host, frame, meta) {
    const { cols, rows, size, gap } = meta;
    const board = host.querySelector('.rd-board');
    if (!board) return;
    board.innerHTML = frame.tiles.map((tile) => tileMarkup(tile, size, gap)).join('')
      + beamMarkup(frame.beam, cols, rows, size, gap)
      + fingerMarkup(frame.finger, size, gap);
    const caption = host.querySelector('.rd-caption');
    if (caption && frame.label) caption.textContent = frame.label;
  }

  // Кадры перерисовывают поле целиком, поэтому переносить элементы между
  // кадрами нельзя — иначе браузеру нечего анимировать. Второй проход ставит
  // старым фишкам их прежнее место и на следующем кадре отпускает в новое.
  function playBoard(host, scene) {
    const meta = { cols: scene.cols, rows: scene.rows, size: host.dataset.tile ? Number(host.dataset.tile) : 34, gap: 4 };
    const board = host.querySelector('.rd-board');
    if (!board) return null;
    board.style.width = `${meta.cols * (meta.size + meta.gap) - meta.gap}px`;
    board.style.height = `${meta.rows * (meta.size + meta.gap) - meta.gap}px`;

    let index = 0;
    let timer = 0;
    let previous = new Map();

    const step = () => {
      const frame = scene.frames[index];
      renderBoardFrame(host, frame, meta);
      // Фишка, которая была на прошлом кадре, стартует со старого места.
      board.querySelectorAll('[data-tile]').forEach((node) => {
        const before = previous.get(node.dataset.tile);
        if (!before) return;
        node.style.transition = 'none';
        node.style.transform = before;
      });
      void board.offsetWidth;
      board.querySelectorAll('[data-tile]').forEach((node) => {
        node.style.transition = '';
        const tile = frame.tiles.find((item) => item.id === node.dataset.tile);
        if (tile) node.style.transform = `translate(${tile.col * (meta.size + meta.gap)}px, ${tile.row * (meta.size + meta.gap)}px)`;
      });
      previous = new Map(frame.tiles.map((tile) => [
        tile.id, `translate(${tile.col * (meta.size + meta.gap)}px, ${tile.row * (meta.size + meta.gap)}px)`,
      ]));

      index += 1;
      if (index >= scene.frames.length) { index = 0; previous = new Map(); }
      timer = window.setTimeout(step, frame.hold);
    };

    step();
    return () => window.clearTimeout(timer);
  }

  function letterMarkup(scene, step) {
    if (scene.kind === 'circle') {
      const radius = 52;
      const letters = scene.letters.map((char, position) => {
        const angle = (position / scene.letters.length) * Math.PI * 2 - Math.PI / 2;
        const x = Math.cos(angle) * radius;
        const y = Math.sin(angle) * radius;
        const on = (step.trace || []).includes(position);
        return `<span class="rd-letter${on ? ' is-on' : ''}" style="transform:translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)">${char}</span>`;
      }).join('');
      return `<div class="rd-circle">${letters}<span class="rd-word${step.ok ? ' is-ok' : ''}">${step.word || ''}</span></div>`;
    }
    if (scene.kind === 'grid') {
      const cells = scene.letters.map((char, position) => {
        const on = (step.path || []).includes(position);
        return `<span class="rd-cell${on ? (step.ok ? ' is-ok' : ' is-on') : ''}">${char}</span>`;
      }).join('');
      return `<div class="rd-grid" style="grid-template-columns:repeat(${scene.cols}, 1fr)">${cells}</div>`;
    }
    if (scene.kind === 'word') {
      const slots = scene.word.split('').map((char) => {
        const open = (step.open || []).includes(char);
        return `<span class="rd-slot${open ? ' is-open' : ''}">${open ? char : ''}</span>`;
      }).join('');
      const lamp = Array.from({ length: 7 }, (unused, position) =>
        `<span class="rd-flame${position < (7 - (step.errors || 0)) ? ' is-on' : ''}"></span>`).join('');
      const miss = step.miss ? `<span class="rd-miss">${step.miss}</span>` : '';
      return `<div class="rd-word-scene"><div class="rd-slots${step.ok ? ' is-ok' : ''}">${slots}</div>
        <div class="rd-lamp">${lamp}</div>${miss}</div>`;
    }
    const cards = scene.faces.map((face, position) => {
      const open = (step.open || []).includes(position);
      const done = (step.done || []).includes(position);
      const classes = ['rd-card'];
      if (open) classes.push('is-open');
      if (done) classes.push('is-done');
      if (open && step.miss) classes.push('is-miss');
      if (open && step.ok) classes.push('is-match');
      return `<span class="${classes.join(' ')}">${open ? face : ''}</span>`;
    }).join('');
    return `<div class="rd-cards">${cards}</div>`;
  }

  function playLetters(host, scene) {
    const board = host.querySelector('.rd-board');
    const caption = host.querySelector('.rd-caption');
    if (!board) return null;
    let index = 0;
    let timer = 0;
    const step = () => {
      const current = scene.steps[index];
      board.innerHTML = letterMarkup(scene, current);
      if (caption) caption.textContent = current.label;
      index = (index + 1) % scene.steps.length;
      timer = window.setTimeout(step, current.hold || 1000);
    };
    step();
    return () => window.clearTimeout(timer);
  }

  // --- подключение -------------------------------------------------------------

  function start(host) {
    if (players.has(host)) return;
    const key = host.dataset.demo || '';
    let stop = null;
    if (SCENES[key]) {
      const stage = SCENES[key]();
      stop = playBoard(host, { cols: stage.cols, rows: stage.rows, frames: stage.frames });
    } else if (LETTER_SCENES[key]) {
      stop = playLetters(host, LETTER_SCENES[key]);
    }
    if (stop) players.set(host, stop);
  }

  function stop(host) {
    const halt = players.get(host);
    if (!halt) return;
    halt();
    players.delete(host);
  }

  // Сцена крутится, только пока её видно: десять одновременных таймеров на
  // слабом телефоне заметно греют экран прокрутки.
  const visibility = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) start(entry.target);
      else stop(entry.target);
    }
  }, { rootMargin: '80px' });

  function scan() {
    document.querySelectorAll('.rd-stage[data-demo]').forEach((host) => {
      if (host.dataset.rdReady === '1') return;
      host.dataset.rdReady = '1';
      host.innerHTML = '<div class="rd-board"></div><p class="rd-caption"></p>';
      visibility.observe(host);
    });
    for (const host of [...players.keys()]) if (!host.isConnected) stop(host);
  }

  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)');

  /**
   * Разбирает все сцены и возвращает найденные несуразности.
   *
   * Поле разбора пишется руками, и легко получить «совпадение» из трёх разных
   * фишек или стартовое поле, где ряд уже сложился сам. На экране это выглядит
   * правдоподобно и учит тому, чего в игре нет, — поэтому проверяется отдельно.
   */
  function audit() {
    const problems = [];
    const run = (row) => {
      // Самый длинный ряд одинаковых подряд идущих символов в строке.
      let best = 1;
      let current = 1;
      for (let index = 1; index < row.length; index += 1) {
        if (row[index] !== '.' && row[index] === row[index - 1]) current += 1;
        else current = 1;
        if (current > best) best = current;
      }
      return best;
    };

    for (const [key, make] of Object.entries(SCENES)) {
      let stage;
      try { stage = make(); } catch (error) { problems.push(`${key}: сцена не собралась — ${error.message}`); continue; }

      // Стартовое поле не должно содержать готовых совпадений.
      const board = stage.frames[0];
      const grid = [];
      for (let row = 0; row < stage.rows; row += 1) grid.push(new Array(stage.cols).fill('.'));
      board.tiles.forEach((tile) => {
        const art = Object.entries(SYMBOL_ART).find(([, url]) => url === tile.art);
        grid[tile.row][tile.col] = art ? art[0] : '?';
      });
      grid.forEach((row, index) => { if (run(row.join('')) >= 3) problems.push(`${key}: в строке ${index} стартового поля уже есть совпадение`); });
      for (let col = 0; col < stage.cols; col += 1) {
        const column = grid.map((row) => row[col]).join('');
        if (run(column) >= 3) problems.push(`${key}: в столбце ${col} стартового поля уже есть совпадение`);
      }

      // Каждое обычное исчезновение — настоящий ряд одинаковых фишек.
      stage.checks.forEach(({ cells, symbols }, index) => {
        if (symbols.some((symbol) => !symbol)) {
          problems.push(`${key}: совпадение ${index + 1} убирает пустую клетку`);
          return;
        }
        if (new Set(symbols).size !== 1) {
          problems.push(`${key}: совпадение ${index + 1} собрано из разных фишек (${symbols.join('')})`);
          return;
        }
        if (cells.length < 3) { problems.push(`${key}: совпадение ${index + 1} короче трёх фишек`); return; }
        const sameRow = cells.every(([, row]) => row === cells[0][1]);
        const sameCol = cells.every(([col]) => col === cells[0][0]);
        if (!sameRow && !sameCol) { problems.push(`${key}: совпадение ${index + 1} не лежит на одной линии`); return; }
        const line = [...(sameRow ? cells.map(([col]) => col) : cells.map(([, row]) => row))].sort((a, b) => a - b);
        if (line.some((value, position) => position > 0 && value !== line[position - 1] + 1)) {
          problems.push(`${key}: совпадение ${index + 1} идёт с разрывом`);
        }
      });
    }
    return problems;
  }

  window.GameRulesDemos = {
    scan,
    audit,
    scenes: () => [...Object.keys(SCENES), ...Object.keys(LETTER_SCENES)],
    has: (key) => Boolean(SCENES[key] || LETTER_SCENES[key]),
    reducedMotion: () => Boolean(reduced?.matches),
  };

  // Наблюдение только за прямыми детьми игрового контейнера: сцена перерисовывает
  // поле по нескольку раз в секунду, и подписка на всё поддерево запускала бы
  // пересканирование на каждом кадре.
  function watch() {
    const host = document.getElementById('game-container');
    if (!host) return false;
    new MutationObserver(scan).observe(host, { childList: true });
    scan();
    return true;
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', watch, { once: true });
  else watch();
})();
