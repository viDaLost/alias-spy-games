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

  const $ = (id) => document.getElementById(id);
  const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };

  let state = null;
  let botTimer = 0;
  let sheetOpen = false;

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
    render();
    scheduleBot();
  }

  // ————————————————————————————————————————————————— кольцо

  const cellNodes = [];

  function buildRing() {
    const ring = $('ring');
    ring.innerHTML = '';
    cellNodes.length = 0;
    for (const spec of B.BOARD) {
      const [row, col] = B.gridPlace(spec.n);
      const node = el('div', 'cell');
      node.style.gridRow = String(row);
      node.style.gridColumn = String(col);
      node.dataset.n = String(spec.n);
      node.title = spec.name;
      const band = el('i', 'band');
      band.style.background = B.colorOf(spec) || 'transparent';
      if (spec.kind === 'well') band.classList.add('hatch');
      node.appendChild(band);
      node.appendChild(el('b', 'mark'));
      node.appendChild(el('span', 'tokens'));
      if (!B.OWNABLE.has(spec.kind)) node.classList.add('is-spot', 'kind-' + spec.kind);
      ring.appendChild(node);
      cellNodes[spec.n] = node;
    }
    const core = el('div', 'ring-core');
    core.id = 'core';
    ring.appendChild(core);
  }

  const ICONS = {
    exodus: '→', prison: '▤', tent: '△', slander: '!',
    tithe: '✦', offering: '✧', providence: '?', mercy: '♡',
  };

  function updateRing() {
    for (const spec of B.BOARD) {
      const node = cellNodes[spec.n];
      const cell = state.cells[spec.n];
      const owner = state.players.find((p) => p.id === (cell.heldFrom || cell.owner));
      node.classList.toggle('is-owned', Boolean(cell.owner));
      node.style.setProperty('--owner', owner ? colorOfPlayer(owner) : 'transparent');

      const mark = node.querySelector('.mark');
      if (cell.altar) mark.textContent = '▲';
      else if (cell.level > 0) mark.textContent = '▪'.repeat(Math.min(cell.level, 5));
      else mark.textContent = ICONS[spec.kind] || '';
      mark.className = 'mark' + (cell.altar ? ' is-altar' : '');

      const tokens = node.querySelector('.tokens');
      tokens.innerHTML = '';
      state.players.forEach((player) => {
        if (player.pos !== spec.n || player.out) return;
        const dot = el('u');
        dot.style.background = colorOfPlayer(player);
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
      core.appendChild(el('div', 'core-kind', state.sabbath ? 'Субботний год' : 'Ход'));
      core.appendChild(el('div', 'core-name', player.name));
      core.appendChild(el('div', 'core-note',
        player.prison > 0 ? `В темнице. Дубль освобождает, попыток: ${player.prison}.`
          : (player.isBot ? 'Думает…' : 'Бросьте кости.')));
      return;
    }

    const dice = el('div', 'dice');
    for (const value of state.dice) {
      if (!value) continue;
      dice.appendChild(el('b', 'die', String(value)));
    }
    if (dice.childElementCount) core.appendChild(dice);

    const pending = state.pending;
    if (!pending) {
      core.appendChild(el('div', 'core-name', player.name));
      core.appendChild(el('div', 'core-note', 'Стройте или заканчивайте ход.'));
      return;
    }
    if (pending.type === 'buy') {
      const spec = B.BOARD[pending.cell];
      core.appendChild(el('div', 'core-kind', kindLabel(spec)));
      core.appendChild(el('div', 'core-name', spec.name));
      core.appendChild(el('div', 'core-note', `Свободен. Цена ${spec.price} сиклей.`));
      return;
    }
    core.appendChild(el('div', 'core-kind', pending.title || ''));
    core.appendChild(el('div', 'core-note', pending.text || ''));
    if (pending.extra) core.appendChild(el('div', 'core-note core-extra', pending.extra));
    if (pending.ref) core.appendChild(el('div', 'core-ref', pending.ref));
  }

  function kindLabel(spec) {
    if (spec.kind === 'plot') return B.GROUPS[spec.group].name;
    if (spec.kind === 'road') return 'Караванный путь';
    if (spec.kind === 'well') return 'Источник';
    return spec.name;
  }

  // ————————————————————————————————————————————————— шапка, игроки, кнопки

  function updateHud() {
    $('year').textContent = state.sabbath
      ? `Субботний год ${state.year} из ${state.years}`
      : `Год ${state.year} из ${state.years}`;
    $('year').classList.toggle('is-sabbath', state.sabbath);
    $('pot').textContent = `Котёл ${state.pot}`;

    const strip = $('players');
    strip.innerHTML = '';
    state.players.forEach((player) => {
      const card = el('div', 'player');
      if (player.id === E.current(state).id) card.classList.add('is-turn');
      card.style.setProperty('--who', colorOfPlayer(player));
      card.appendChild(el('b', 'player-name', player.name));
      const figures = el('div', 'player-figs');
      figures.appendChild(el('span', 'fig-silver', String(player.silver)));
      figures.appendChild(el('span', 'fig-heritage', String(player.heritage)));
      card.appendChild(figures);
      if (player.servantOf) {
        const master = state.players.find((p) => p.id === player.servantOf);
        card.appendChild(el('div', 'player-tag', `в найме у ${master ? master.name : '—'} · долг ${player.debt}`));
      } else if (player.prison > 0) {
        card.appendChild(el('div', 'player-tag', 'в темнице'));
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
    if (player.isBot) {
      bar.appendChild(el('div', 'waiting', `${player.name} ходит…`));
      bar.appendChild(sheetButton);
      return;
    }

    if (state.phase === 'roll') {
      bar.appendChild(button('Бросить кости', 'primary', () => { E.roll(state); after(); }));
    } else if (state.pending && state.pending.type === 'buy') {
      const spec = B.BOARD[state.pending.cell];
      bar.appendChild(button(`Купить за ${spec.price}`, 'primary', () => { E.buy(state); after(); }));
      bar.appendChild(button('Отказаться', 'ghost', () => { E.decline(state); after(); }));
    } else {
      bar.appendChild(button('Закончить ход', 'primary', () => { E.endTurn(state); after(); }));
    }
    bar.appendChild(sheetButton);
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
    const player = E.current(state);
    const busy = player.isBot || state.phase === 'decide';
    if (player.isBot) sheet.appendChild(el('p', 'empty', 'Сейчас ход бота — действия появятся в ваш ход.'));

    const mine = state.cells
      .map((cell, n) => n)
      .filter((n) => state.cells[n].owner === player.id);

    sheet.appendChild(el('h3', null, `Уделы: ${player.name}`));
    if (!mine.length) sheet.appendChild(el('p', 'empty', 'Пока ничего не куплено.'));

    for (const n of mine) {
      const spec = B.BOARD[n];
      const cell = state.cells[n];
      const row = el('div', 'holding');
      const dot = el('i');
      dot.style.background = B.colorOf(spec);
      row.appendChild(dot);

      const info = el('div', 'holding-info');
      info.appendChild(el('b', null, spec.name));
      const status = cell.altar ? 'жертвенник, аренды нет'
        : (cell.level > 0 ? B.LEVELS[cell.level - 1] : 'без построек');
      const rent = E.rentFor(state, n, 7);
      info.appendChild(el('span', null, `${status} · аренда ${rent}`));
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
        row.appendChild(el('i', 'muted'));
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

    sheet.appendChild(el('h3', null, 'Ход событий'));
    const list = el('div', 'log');
    for (const entry of state.log.slice(-14).reverse()) {
      list.appendChild(el('div', 'log-line', entry.text));
    }
    sheet.appendChild(list);
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
    $('winner').textContent = `${state.scores[0].name} — ${state.scores[0].total} наследия`;
    $('again-btn').onclick = () => location.reload();
  }

  // ————————————————————————————————————————————————— цикл

  function render() {
    if (state.status === 'jubilee') { showJubilee(); return; }
    updateRing();
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
    if (!E.current(state).isBot) return;
    botTimer = setTimeout(() => {
      const done = Bots.step(state);
      render();
      if (state.status === 'playing') scheduleBot();
      if (!done) E.endTurn(state);
    }, 620);
  }

  // ————————————————————————————————————————————————— правила и запуск

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

    $('rules-btn').addEventListener('click', () => { $('rules').hidden = false; });
    $('rules-close').addEventListener('click', () => { $('rules').hidden = true; });
  }

  setupScreen();
  fillRules();
})();
