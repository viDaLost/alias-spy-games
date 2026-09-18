/* global goToMainMenu */
// «Двенадцать колен» — экран игры.
//
// Правил здесь нет ни одного: что законно, что делает карта, кто выиграл и
// сколько взял очков — знают twelve-tribes-rules.js и twelve-tribes-engine.js,
// а этот файл только спрашивает их и показывает ответ. Разделение не ради
// чистоты: правила карточной игры проверяются машиной на тысячах раздач, и
// всё, что утекло в разметку, из-под этой проверки уходит.
//
// Отсюда же порядок в файле: сначала загрузка правил, потом сборка экрана,
// потом ходы соперников по таймеру, и в самом низу — уборка.

(function () {
  'use strict';

  /*
    Пути написаны целиком, а не собраны из частей, и это не многословие.
    Сборка локализованных копий переписывает в коде любой путь вида
    web/games/…, чтобы испанская игра брала испанские файлы; склеенный из
    двух кусков путь она не видит — и локализованная игра молча тянула бы
    русские правила. Тем же чтением живёт и проверка целостности ссылок.
  */
  const PARTS = [
    'web/locales/en/games/twelve-tribes-rules.js',
    'web/locales/en/games/twelve-tribes-engine.js',
    'web/locales/en/games/twelve-tribes-bots.js',
  ];
  const STYLE = 'web/locales/en/games/twelve-tribes.css';
  const VERSION = '1';

  /*
    Правила лежат отдельными файлами, а оболочка приложения умеет загружать
    только один. Поэтому их подтягивает сам экран — по очереди, потому что
    движок при разборе обращается к правилам, а боты к движку.
  */
  function loadPart(file) {
    return new Promise((resolve, reject) => {
      if (document.querySelector(`script[data-tt="${file}"]`)) { resolve(); return; }
      const script = document.createElement('script');
      script.src = `${file}?v=${VERSION}`;
      script.dataset.tt = file;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error(`Could not load ${file}`));
      document.head.appendChild(script);
    });
  }

  function injectStyles() {
    const id = 'twelve-tribes-css';
    const href = `${STYLE}?v=${VERSION}`;
    const existing = document.getElementById(id);
    if (existing) { existing.href = href; return; }
    const link = document.createElement('link');
    link.id = id;
    link.rel = 'stylesheet';
    link.href = href;
    document.head.appendChild(link);
  }

  // ————————————————————————————————————————————— знаки станов

  /*
    Знак стана рисуется разметкой, а не картинкой: четыре простых силуэта
    весят меньше килобайта на всех и не ждут сети. Знак — второй способ узнать
    масть, кроме цвета: у каждого двенадцатого мужчины красный и зелёный не
    различаются, и карточная игра, где масть только цвет, для него не игра.
  */
  const SIGNS = {
    // Лев: голова с гривой из лучей.
    judah: '<circle cx="12" cy="13" r="5"/><path d="M12 3v3M6 5l2 2.6M18 5l-2 2.6M3 11h3M18 11h3M5 18l2.4-1.8M19 18l-2.4-1.8"/>'
      + '<circle cx="10" cy="12" r=".9" fill="currentColor" stroke="none"/><circle cx="14" cy="12" r=".9" fill="currentColor" stroke="none"/>',
    // Человек: голова и плечи.
    reuben: '<circle cx="12" cy="8" r="3.6"/><path d="M5 20c0-3.9 3.1-6.6 7-6.6s7 2.7 7 6.6"/>',
    // Телец: голова с рогами.
    ephraim: '<path d="M4 6c2.6 0 4.2 1.4 5 3M20 6c-2.6 0-4.2 1.4-5 3"/><path d="M7 11a5 5 0 0 1 10 0v2a5 5 0 0 1-10 0z"/>'
      + '<circle cx="10" cy="12" r=".9" fill="currentColor" stroke="none"/><circle cx="14" cy="12" r=".9" fill="currentColor" stroke="none"/>',
    // Орёл: расправленные крылья и голова.
    dan: '<path d="M12 8.5 8.6 11v4"/><circle cx="12" cy="6" r="2"/><path d="M12 9c-2.6 3-6 4.6-9 4.8 2.4 1.6 5.6 2 9 1.2 3.4.8 6.6.4 9-1.2-3-.2-6.4-1.8-9-4.8z"/>',
  };

  const signHTML = (camp, size = 26) => `<svg class="tt-sign" viewBox="0 0 24 24" width="${size}" height="${size}"`
    + ' fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"'
    + ` aria-hidden="true">${SIGNS[camp] || ''}</svg>`;

  // ————————————————————————————————————————————— запуск

  const timers = new Set();
  const later = (fn, ms) => {
    const id = setTimeout(() => { timers.delete(id); fn(); }, ms);
    timers.add(id);
    return id;
  };
  function stopTimers() {
    for (const id of timers) clearTimeout(id);
    timers.clear();
  }

  const BOT_NAMES = ['Асаф', 'Boaz', 'Nathan'];

  function startTwelveTribesGame() {
    const container = document.getElementById('game-container');
    if (!container) return;
    injectStyles();
    stopTimers();
    container.innerHTML = '<div class="tt-wrap"><p style="padding:24px;text-align:center">Dealing cards…</p></div>';

    PARTS.reduce((chain, file) => chain.then(() => loadPart(file)), Promise.resolve())
      .then(() => { new Table(container).setup(); })
      .catch((error) => {
        console.error('«Двенадцать колен» не запустились', error);
        container.innerHTML = '<div class="tt-wrap"><section class="tt-setup"><h2>Could not open game</h2>'
          + '<p>Правила не загрузились. Попробуйте вернуться в меню и открыть игру снова.</p>'
          + '<button type="button" class="tt-btn" data-back>Main menu</button></section></div>';
        container.querySelector('[data-back]')?.addEventListener('click', () => {
          if (typeof goToMainMenu === 'function') goToMainMenu();
        });
      });
  }

  // ————————————————————————————————————————————— экран

  class Table {
    constructor(container) {
      this.root = container;
      this.R = window.TwelveTribesRules;
      this.E = window.TwelveTribesEngine;
      this.Bots = window.TwelveTribesBots;
      this.foes = 2;
      this.target = 300;
      this.state = null;
      this.wild = null;      // карта, для которой спрашиваем стан
      this.fresh = null;     // только что взятая карта: её видно по подсветке
      this.landing = false;  // прилёт карты на сброс проигрывается один раз
    }

    /* ——— начало партии ——— */
    setup() {
      stopTimers();
      this.root.innerHTML = `
        <div class="tt-wrap">
          <section class="tt-setup">
            <h2>Двенадцать колен</h2>
            <p>Израиль в пустыне стоял четырьмя станами вокруг скинии: Иуда на востоке,
              Рувим на юге, Ефрем на западе, Дан на севере (Числа 2). Эти четыре стана —
              масти колоды. Кладите карту того же стана или того же жребия, а кто первым
              останется без карт, тот и взял раздачу.</p>
            <label class="tt-choice">
              <span>Соперников</span>
              <div data-foes>
                ${[1, 2, 3].map((many) => `<button type="button" data-value="${many}"
                  aria-pressed="${many === this.foes}">${many}<small>${many === 1 ? 'вдвоём' : 'за столом'}</small></button>`).join('')}\n              </div>\n            </label>\n            <label class="tt-choice">\n              <span>Game</span>\n              <div data-target>\n                <button type="button" data-value="0" aria-pressed="${this.target === 0}">Раздача<small>кто первым сбросит</small></button>
                <button type="button" data-value="300" aria-pressed="${this.target === 300}">До 300<small>очки за чужие карты</small></button>\n              </div>\n            </label>\n            <div class="tt-row">\n              <button type="button" class="tt-btn" data-start>Сдавать</button>\n              <button type="button" class="tt-btn tt-btn--ghost" data-menu>Menu</button>\n            </div>\n          </section>\n        </div>`;
      const pick = (group, apply) => {
        const box = this.root.querySelector(`[data-${group}]`);
        box.addEventListener('click', (event) => {
          const button = event.target.closest('button[data-value]');
          if (!button) return;
          for (const one of box.querySelectorAll('button')) one.setAttribute('aria-pressed', String(one === button));
          apply(Number(button.dataset.value));
        });
      };
      pick('foes', (value) => { this.foes = value; });
      pick('target', (value) => { this.target = value; });
      this.root.querySelector('[data-start]').addEventListener('click', () => this.begin());
      this.root.querySelector('[data-menu]').addEventListener('click', () => {
        if (typeof goToMainMenu === 'function') goToMainMenu();
      });
    }

    begin() {
      const players = [{ name: 'You' }];
      for (let i = 0; i < this.foes; i += 1) players.push({ name: BOT_NAMES[i], isBot: true });
      this.state = this.E.createGame({ players, target: this.target });
      // Уровни вперемешку: один соперник посмотрит на вашу руку, другой играет
      // прямо. Так стол не читается заранее.
      this.state.players.forEach((player, seat) => { player.botLevel = seat % 2 ? 'elder' : 'scribe'; });
      this.buildTable();
      this.render();
      this.tick();
      /*
        Ход наружу для проверок. Правила и так наружу — без них проверить их
        нечем; партия же живёт внутри экрана, а спросить у неё «чей ход и что
        на столе» надо: иначе проверка видит только разметку и не может
        отличить «кнопка не нажалась» от «движок отказал».
      */
      window.TwelveTribesGame = { state: () => this.state, refresh: () => this.render() };
    }

    /* ——— разметка стола ——— */
    buildTable() {
      this.root.innerHTML = `\n        <div class="tt-wrap">\n          <div class="tt-table">\n            <div class="tt-foes" data-foes></div>\n            <div class="tt-middle">\n              <div class="tt-deck"><button type="button" data-draw>взять</button></div>\n              <div class="tt-pile" data-pile></div>\n              <div class="tt-camp" data-camp></div>\n            </div>\n            <p class="tt-status" data-status></p>\n          </div>\n          <div class="tt-hand-wrap">\n            <div class="tt-hand-head"><span data-hand-title>Ваши карты</span><span data-score></span></div>\n            <div class="tt-hand" data-hand></div>\n          </div>\n          <div class="tt-row">\n            <button type="button" class="tt-btn tt-btn--ghost" data-pass hidden>Оставить себе</button>\n            <button type="button" class="tt-btn" data-shofar hidden>Шофар!</button>\n            <button type="button" class="tt-btn tt-btn--ghost" data-menu>Menu</button>\n          </div>\n        </div>`;
      const on = (name, fn) => this.root.querySelector(`[data-${name}]`).addEventListener('click', fn);
      on('draw', () => this.humanDraw());
      on('pass', () => this.humanPass());
      on('shofar', () => { this.E.shofar(this.state, 0); this.render(); });
      on('menu', () => { stopTimers(); if (typeof goToMainMenu === 'function') goToMainMenu(); });
      this.root.querySelector('[data-hand]').addEventListener('click', (event) => {
        const card = event.target.closest('[data-index]');
        if (card) this.humanPlay(Number(card.dataset.index));
      });
      this.root.querySelector('[data-foes]').addEventListener('click', (event) => {
        const button = event.target.closest('[data-catch]');
        if (button) this.humanCatch(Number(button.dataset.catch));
      });
    }

    /* ——— карта ——— */
    cardHTML(card, extra = '') {
      const R = this.R;
      const kind = R.KINDS[card.kind];
      if (kind.wild) {
        const quarters = R.CAMP_IDS.map((id) => `<i style="background:var(--${id})"></i>`).join('');
        const label = card.kind === 'lot' ? 'Lot' : 'Captivity';
        return `<div class="tt-card tt-card--wild ${extra}">
          <div class="tt-quarters">${quarters}</div>
          <span class="tt-face"><span class="tt-kind">${label}</span></span>
          <span class="tt-name">${card.camp ? R.campOf(card.camp).name : 'все станы'}</span>
        </div>`;
      }
      const camp = R.campOf(card.camp);
      const face = card.kind === 'number'
        ? `<span class="tt-rank">${card.rank}</span>`
        : `${signHTML(card.camp, 22)}<span class="tt-kind">${kind.title}</span>`;
      return `<div class="tt-card ${extra}" style="--camp:var(--${card.camp})">
        <span class="tt-face">${face}</span>
        <span class="tt-name">${camp.name}</span>
      </div>`;
    }

    /* ——— перерисовка ——— */
    render() {
      const { state, R, E } = this;
      const me = state.players[0];
      const mine = state.turn === 0 && state.status === 'playing';

      // соперники
      const foes = state.players.slice(1).map((player) => {
        const turn = state.turn === player.id && state.status === 'playing' ? ' is-turn' : '';
        const backs = new Array(Math.min(player.hand.length, 9)).fill('<i></i>').join('');
        const risk = E.riskOpen(state) && state.risk.seat === player.id;
        return `<div class="tt-foe${turn}">
          <b>${player.name}</b>
          <span>${player.hand.length} cards${player.said ? ' · шофар' : ''}</span>
          <span class="tt-foe-cards">${backs}</span>
          ${state.target ? `<span>${player.score} points</span>` : ''}
          ${risk ? `<button type="button" class="tt-catch" data-catch="${player.id}">Поймал!</button>` : ''}
        </div>`;
      }).join('');
      this.root.querySelector('[data-foes]').innerHTML = foes;

      // стол
      const top = state.pile[state.pile.length - 1];
      const pile = this.root.querySelector('[data-pile]');
      pile.innerHTML = this.cardHTML(top, this.landing ? 'is-landing' : '');
      this.landing = false;
      const camp = R.campOf(state.camp);
      this.root.querySelector('[data-camp]').innerHTML = `
        <span class="tt-camp-dot" style="--camp:var(--${state.camp})">${signHTML(state.camp, 20)}</span>
        <span>${camp.name}</span>
        <span style="opacity:.75;font-weight:600">${camp.side}</span>`;

      // рука
      const legal = new Set(E.legalMoves(state, 0));
      const handBox = this.root.querySelector('[data-hand]');
      // Восемь карт — тот предел, за которым рука перестаёт помещаться в
      // ширину телефона: дальше карты наезжают друг на друга.
      handBox.dataset.many = String(me.hand.length > 8);
      handBox.innerHTML = me.hand.map((card, index) => {
        const live = mine && legal.has(index);
        const extra = `${live ? 'is-live' : 'is-dim'}${card.id === this.fresh ? ' is-fresh' : ''}`;
        return this.cardHTML(card, extra).replace('<div class="tt-card',
          `<div role="button" tabindex="0" data-index="${index}" class="tt-card`);
      }).join('');
      this.fresh = null;
      this.root.querySelector('[data-hand-title]').textContent = `Ваши карты: ${me.hand.length}`;
      this.root.querySelector('[data-score]').textContent = state.target
        ? `${me.score} of ${state.target} points` : '';

      // кнопки и строка состояния
      const pass = this.root.querySelector('[data-pass]');
      pass.hidden = !(mine && state.phase === 'drawn');
      const shofar = this.root.querySelector('[data-shofar]');
      shofar.hidden = !(me.hand.length === 1 && !me.said && state.status === 'playing');
      this.root.querySelector('[data-draw]').disabled = !(mine && state.phase === 'play');

      const status = this.root.querySelector('[data-status]');
      if (state.status !== 'playing') status.textContent = '';
      else if (!mine) status.innerHTML = `Playing <b>${state.players[state.turn].name}</b>`;
      else if (state.phase === 'drawn') status.textContent = 'Взяли карту: сыграйте её или оставьте себе';
      else if (legal.size) status.innerHTML = 'Your turn — <b>кладите карту</b>';
      else status.innerHTML = 'Нечем ходить — <b>возьмите карту</b>';
    }

    /* ——— ходы человека ——— */
    humanPlay(index) {
      const { state, R, E } = this;
      if (state.status !== 'playing' || state.turn !== 0) return;
      const card = state.players[0].hand[index];
      if (!card || !R.playable(state, card, state.players[0].hand)) {
        // Отказ объясняется словами, а не молчанием: игрок должен понять, чем
        // именно эта карта не подошла.
        this.root.querySelector('[data-status]').textContent = card && card.kind === 'exile'
          ? 'Плен кладут, только когда в руке нет карт нынешнего стана'
          : `Не подходит: нужен стан ${R.campOf(state.camp).name} или тот же жребий`;
        return;
      }
      if (R.KINDS[card.kind].wild) { this.askCamp(index); return; }
      this.commit(index, card.camp);
    }

    askCamp(index) {
      const R = this.R;
      const sheet = document.createElement('div');
      sheet.className = 'tt-sheet';
      sheet.innerHTML = `<div class="tt-sheet-card">
        <h3>Какой стан назовёте?</h3>
        <div class="tt-camps">
          ${R.CAMPS.map((camp) => `<button type="button" data-camp="${camp.id}" style="--camp:var(--${camp.id})">
            ${signHTML(camp.id, 22)}${camp.name}<small>${camp.side}</small></button>`).join('')}\n        </div>\n        <button type="button" class="tt-btn tt-btn--ghost" data-cancel>Cancel</button>\n      </div>`;
      sheet.addEventListener('click', (event) => {
        const pickCamp = event.target.closest('[data-camp]');
        if (pickCamp) { sheet.remove(); this.commit(index, pickCamp.dataset.camp); return; }
        if (event.target.closest('[data-cancel]') || event.target === sheet) sheet.remove();
      });
      document.body.appendChild(sheet);
      this.sheet = sheet;
    }

    commit(index, camp) {
      this.landing = true;
      this.E.play(this.state, 0, index, camp);
      this.render();
      this.tick();
    }

    humanDraw() {
      const card = this.E.draw(this.state, 0);
      this.fresh = card ? card.id : null;
      this.render();
      this.tick();
    }

    humanPass() {
      this.E.pass(this.state, 0);
      this.render();
      this.tick();
    }

    humanCatch(seat) {
      this.E.catchOut(this.state, 0, seat);
      this.render();
    }

    /* ——— ходы соперников ——— */
    /*
      Ход бота идёт по таймеру, а не мгновенно. Это не украшение: мгновенный
      ход троих соперников выглядит как вспышка, после которой стол стал
      другим, — и человек не успевает понять, что произошло и почему ему вдруг
      четыре карты.
    */
    tick() {
      const { state, E, Bots } = this;
      if (state.status !== 'playing') { later(() => this.finish(), 700); return; }

      // Соперники объявляют шофар и ловят зазевавшихся — с их забывчивостью.
      for (const player of state.players) {
        if (!player.isBot || player.hand.length !== 1 || player.said) continue;
        if (Bots.remembers(player.botLevel, Math.random)) {
          later(() => { E.shofar(state, player.id); this.render(); }, 500 + Math.random() * 700);
        }
      }
      if (E.riskOpen(state) && state.risk.seat === 0) {
        const hunter = state.players.find((one) => one.isBot
          && Bots.notices(one.botLevel, Math.random));
        if (hunter) {
          later(() => {
            if (E.catchOut(state, hunter.id, 0)) {
              this.root.querySelector('[data-status]').textContent = `${hunter.name} поймал вас: берёте две карты`;
              this.render();
            }
          }, 1500 + Math.random() * 900);
        }
      }

      if (state.turn === 0) return;
      const seat = state.turn;
      later(() => {
        if (this.state !== state || state.turn !== seat || state.status !== 'playing') return;
        const choice = Bots.pick(state, seat);
        if (choice) {
          this.landing = true;
          E.play(state, seat, choice.index, choice.camp);
        } else {
          E.draw(state, seat);
          if (state.turn === seat && state.phase === 'drawn') {
            const after = Bots.pick(state, seat);
            if (after) { this.landing = true; E.play(state, seat, after.index, after.camp); }
            else E.pass(state, seat);
          }
        }
        this.render();
        this.tick();
      }, 800 + Math.random() * 500);
    }

    /* ——— итоги ——— */
    finish() {
      const { state } = this;
      const winner = state.players[state.winner];
      const series = state.status === 'round';
      const rows = [...state.players]
        .sort((a, b) => b.score - a.score)
        .map((player) => `<div class="tt-score${player.id === 0 ? ' is-you' : ''}">
          <span>${player.name}${player.id === state.winner ? ' — раздача' : ''}</span>
          <span>${state.target ? `${player.score} points` : `${player.hand.length} cards`}</span>
        </div>`).join('');
      const log = state.log.slice(-6).reverse()
        .map((entry) => `<div>${entry.text}</div>`).join('');
      this.root.innerHTML = `
        <div class="tt-wrap">
          <section class="tt-setup">
            <h2>${winner.id === 0 ? 'Вы взяли раздачу' : `${winner.name} берёт раздачу`}</h2>
            <p>${series
    ? 'Партия идёт до трёхсот очков. Очки раздачи — это карты, оставшиеся на руках у остальных.'
    : 'Кто первым остался без карт, тот и выиграл.'}</p>
            <div class="tt-over">${rows}</div>
            <div class="tt-log">${log}</div>
            <div class="tt-row">
              <button type="button" class="tt-btn" data-next>${series ? 'Следующая раздача' : 'Play another game'}</button>\n              <button type="button" class="tt-btn tt-btn--ghost" data-menu>Menu</button>\n            </div>\n          </section>\n        </div>`;
      this.root.querySelector('[data-next]').addEventListener('click', () => {
        if (series) { this.E.nextRound(this.state); this.buildTable(); this.render(); this.tick(); }
        else this.setup();
      });
      this.root.querySelector('[data-menu]').addEventListener('click', () => {
        stopTimers();
        if (typeof goToMainMenu === 'function') goToMainMenu();
      });
    }
  }

  /*
    Уборка. Оболочка зовёт её при выходе в меню: без этого таймеры ботов
    продолжают ходить в уже закрытой игре — и однажды дорисовывают стол поверх
    другого экрана.
  */
  window.__twelveTribesCleanup = () => {
    stopTimers();
    document.querySelector('.tt-sheet')?.remove();
  };

  window.startTwelveTribesGame = startTwelveTribesGame;
}());
