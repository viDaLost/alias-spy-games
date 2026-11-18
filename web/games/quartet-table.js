(() => {
  'use strict';

  const filterName = (name) => name.toLocaleLowerCase('ru').replaceAll('ё', 'е').trim();

  function create({ content, escapeHtml: esc, getGroups, getQuartet, getCard, getEvent }) {
    const regions = new WeakMap();
    const flights = new Map();
    let groupId = '';
    let table = null;
    let chatSize = 0;

    function patch(node, markup) {
      if (!node || regions.get(node) === markup) return false;
      const scroll = node.scrollLeft;
      node.innerHTML = markup;
      node.scrollLeft = scroll;
      regions.set(node, markup);
      return true;
    }

    function renderHome({ playerName, inviteCode, playerLimit, catalogSize, allowPractice }) {
      dispose();
      groupId = '';
      content.innerHTML = `
        <div class="qt-pages">
          <section class="qt-hero">
            <div class="qt-hero-cards" aria-hidden="true">
              ${['daniel_lions', 'elijah_altar', 'noah_dove'].map((id) => `<img src="${esc(cardAsset({ art: `web/assets/quartet/cards/${id}.webp` }))}" alt="" width="124" height="155" decoding="async">`).join('')}
            </div>
            <div><h3>Соберите<br>квартет</h3><p>3–${playerLimit} игрока · ${catalogSize} квартетов</p></div>
          </section>
          ${allowPractice ? `<button class="qt-practice" type="button" data-action="start-practice">
            <span><strong>Играть с ботами</strong><small>Вы и два бота · без таймера</small></span>
            <span class="qt-practice-arrow" aria-hidden="true">›</span>
          </button>` : ''}
          <section class="qt-paper qt-home-form">
            <label class="qt-field" for="qv2-player-name">Ваше имя
              <input id="qv2-player-name" maxlength="32" value="${esc(playerName)}" autocomplete="nickname">
            </label>
            <button class="qt-btn qt-btn--solid" type="button" data-action="create">Создать комнату</button>
            <form class="qt-join" id="qt-join-form">
              <label class="qt-field" for="qv2-room-code">Код комнаты
                <input id="qv2-room-code" maxlength="8" placeholder="Например, AB2CD3" value="${esc(inviteCode)}" autocomplete="off" autocapitalize="characters" spellcheck="false" required>
              </label>
              <button class="qt-btn qt-btn--line" type="submit">Войти</button>
            </form>
            <button class="qt-link" type="button" data-action="open-rules">Правила игры</button>
          </section>
        </div>`;
    }

    function playerRow(player, me, end) {
      return `<li class="qt-seat">
        <span class="qt-avatar" aria-hidden="true">${esc(player.name[0]?.toUpperCase() || '?')}</span>
        <span class="qt-seat-name">${esc(player.name)}${player.playerId === me?.playerId ? ' <small>вы</small>' : ''}</span>
        ${end
          ? `<span class="qt-seat-score">${player.quartetsCount} ★</span>`
          : `<span class="qt-seat-tag">${player.isHost ? 'Ведущий' : player.connected ? 'В комнате' : 'Нет связи'}</span>`}
      </li>`;
    }

    function deckPicker(state, players, pending) {
      const { min, max, requested, count } = state.deckSettings;
      if (!state.me?.isHost) return `<div class="qt-deck-read"><span>Квартетов в колоде</span><strong>${count}</strong></div>`;
      const selected = requested === null ? '' : count;
      const options = Array.from({ length: max - min + 1 }, (_, index) => {
        const value = min + index;
        return `<option value="${value}" ${selected === value ? 'selected' : ''}>${value} · ${value * 4} карт</option>`;
      }).join('');
      const presets = [2, 3, 4, 5].filter((perPlayer) => players >= state.minPlayers && perPlayer * players <= max);
      const cards = count * 4;
      const low = Math.floor(cards / players), high = Math.ceil(cards / players);
      const equivalent = players >= state.minPlayers && count % players === 0
        ? `По ${count / players} квартета на игрока в расчёте колоды. ` : '';
      const initialHand = players < state.minPlayers ? '' : low === high ? `На старте по ${low} карт.` : `На старте по ${low}–${high} карт.`;
      return `
        <label class="qt-deck-read" for="qt-deck-size"><span>Квартетов в колоде</span>
          <select id="qt-deck-size" ${pending ? 'disabled' : ''}>
            <option value="" ${requested === null ? 'selected' : ''}>Авто · ${Math.max(min, 12)}</option>
            ${options}
          </select>
        </label>
        ${presets.length ? `<div class="qt-presets" aria-label="Размер колоды в расчёте на игрока">
          ${presets.map((perPlayer) => `<button type="button" data-action="table-deck" data-count="${perPlayer * players}" aria-pressed="${count === perPlayer * players}" ${pending ? 'disabled' : ''}>По ${perPlayer}</button>`).join('')}
        </div>` : ''}
        <p class="qt-note">${equivalent}${initialHand}</p>`;
    }

    function renderLobby(state, pending) {
      dispose();
      const players = state.players.filter((player) => player.isActive !== false);
      const waiting = state.minPlayers - players.length;
      const action = waiting > 0 ? `Нужно ещё игроков: ${waiting}` : 'Начать партию';
      patch(content, `
        <div class="qt-pages">
          <section class="qt-invite">
            <div><span>Код комнаты</span><strong>${esc(state.roomId)}</strong></div>
            <div class="qt-invite-actions">
              <button type="button" class="qt-btn qt-btn--gold" data-action="share-room">Поделиться</button>
              <button type="button" class="qt-btn qt-btn--ghost" data-action="copy-room">Копировать код</button>
            </div>
          </section>
          <section class="qt-paper">
            <div class="qt-section-title"><h3>Игроки</h3><span>${players.length} / ${state.playerLimit}</span></div>
            <ul class="qt-seats">${players.map((player) => playerRow(player, state.me, false)).join('')}</ul>
          </section>
          <section class="qt-paper">
            ${deckPicker(state, players.length, pending)}
            ${state.me?.isHost
              ? `<button type="button" class="qt-btn qt-btn--solid" data-action="start-game" ${waiting > 0 || pending ? 'disabled' : ''}>${action}</button>`
              : '<p class="qt-note">Ведущий запустит партию, когда все соберутся.</p>'}
          </section>
          <button type="button" class="qt-link qt-leave" data-action="leave-room">Выйти из комнаты</button>
        </div>`);
    }

    function mountTable(practice) {
      groupId = '';
      chatSize = 0;
      content.innerHTML = `
        <div class="qt-play">
          <section class="qt-turn" id="qv2-turn-banner">
            <div class="qt-turn-main"><h3 aria-live="polite" data-turn-name></h3><p data-turn-guide></p></div>
            ${practice ? '' : `<span class="qt-timer" id="qv2-turn-timer" aria-label="Время на ход"></span>
            <div class="qt-timer-bar" aria-hidden="true"><span id="qv2-turn-progress"></span></div>`}
          </section>
          <div class="qt-table-grid">
            <section class="qt-opponents" aria-labelledby="qt-opponents-title">
              <div class="qt-section-title qt-players-title">
                <div class="qt-table-stack" aria-hidden="true">
                  <i class="qt-card-back"></i><i class="qt-card-back"></i><i class="qt-card-back"></i>
                </div>
                <h3 id="qt-opponents-title">Соперники</h3><span data-table-score></span>
              </div>
              <label class="qt-player-search" hidden>
                <input type="search" placeholder="Поиск по имени" aria-label="Найти соперника" aria-controls="qt-player-list" maxlength="32">
              </label>
              <div class="qt-players" id="qt-player-list" data-players></div>
              <p class="qt-note" data-player-empty role="status" hidden>Соперник не найден.</p>
            </section>
            <section class="qt-paper qt-hand" aria-labelledby="qt-hand-title">
              <div class="qt-section-title"><h3 id="qt-hand-title">Ваша рука</h3><span data-hand-score></span></div>
              <div data-inspection></div>
              <div class="qt-groups" data-groups aria-label="Квартеты в вашей руке"></div>
              <div class="qt-completed" data-completed hidden></div>
            </section>
            <p class="qt-event" data-event aria-live="polite" hidden></p>
          </div>
          <details class="qt-paper qt-details">
            <summary>История ходов</summary>
            <ol class="qt-history" data-history></ol>
          </details>
          ${practice ? '' : `<details class="qt-paper qt-details">
            <summary>Чат комнаты</summary>
            <ol class="qt-history qt-chat" data-chat></ol>
            <form id="qt-chat-form" class="qt-chat-form">
              <input name="message" maxlength="300" placeholder="Сообщение" aria-label="Сообщение" required>
              <button type="submit" class="qt-btn qt-btn--line">Отправить</button>
            </form>
          </details>`}
          <button type="button" class="qt-link qt-leave" data-action="leave-room">Выйти из партии</button>
        </div>`;
      table = {
        root: content.querySelector('.qt-play'),
        timer: content.querySelector('.qt-turn'),
        name: content.querySelector('[data-turn-name]'),
        guide: content.querySelector('[data-turn-guide]'),
        opponents: content.querySelector('[data-players]'),
        opponentSearch: content.querySelector('.qt-player-search'),
        opponentQuery: content.querySelector('.qt-player-search input'),
        opponentEmpty: content.querySelector('[data-player-empty]'),
        event: content.querySelector('[data-event]'),
        stack: content.querySelector('.qt-table-stack'),
        score: content.querySelector('[data-table-score]'),
        handScore: content.querySelector('[data-hand-score]'),
        groups: content.querySelector('[data-groups]'),
        inspection: content.querySelector('[data-inspection]'),
        completed: content.querySelector('[data-completed]'),
        history: content.querySelector('[data-history]'),
        chat: content.querySelector('[data-chat]'),
        chatSubmit: content.querySelector('#qt-chat-form button'),
      };
      table.opponentQuery.addEventListener('input', filterOpponents);
    }

    function filterOpponents() {
      const query = filterName(table.opponentQuery.value);
      let found = false;
      for (const seat of table.opponents.children) {
        const matches = seat.dataset.searchName.includes(query);
        seat.hidden = !matches;
        found ||= matches;
      }
      table.opponentEmpty.hidden = found || !query;
    }

    function playerCard(player, turnId, practice) {
      return `<div class="qt-player ${player.playerId === turnId ? 'is-current' : ''}"
        data-player-id="${esc(player.playerId)}" data-search-name="${esc(filterName(player.name))}" title="${esc(player.name)}">
        <span class="qt-avatar" aria-hidden="true">${esc(player.name[0]?.toUpperCase() || '?')}</span>
        <strong>${esc(player.name)}${practice ? ' <span class="qt-bot-label">бот</span>' : ''}</strong>
        <small>${player.cardsCount} <span aria-label="карт">▤</span> · ${player.quartetsCount} <span aria-label="квартетов">★</span></small>
      </div>`;
    }

    function cardAsset(card) {
      const art = card?.art;
      return art && window.GameDisplay?.lowGraphics() ? art.replace('/cards/', '/thumbs/') : art;
    }

    function cardFace(card, quartet, color) {
      const art = cardAsset(card);
      const visual = art ? `<img src="${esc(art)}" alt="" loading="lazy" decoding="async">`
        : `<span class="qt-card-symbol" aria-hidden="true">${esc(card.icon || quartet.icon)}</span>`;
      const content = `<span class="qt-card-face qt-color-${color}">${visual}</span>
        <strong>${esc(card.title)}</strong><small>${card.owned ? '✓ У вас' : 'Нужна'}</small>`;
      return card.owned
        ? `<div class="qt-card is-owned" data-card-id="${esc(card.id)}"><div class="qt-card-content">${content}</div></div>`
        : `<div class="qt-card is-missing" data-card-id="${esc(card.id)}">
            <button type="button" class="qt-card-content" data-action="table-card" data-card-id="${esc(card.id)}" aria-expanded="false">${content}</button>
            <div class="qt-card-targets" data-card-targets hidden></div>
          </div>`;
    }

    function dispose() {
      for (const [animation, sprite] of flights) {
        animation.cancel();
        sprite.remove();
      }
      flights.clear();
      table = null;
    }

    function visibleCenter(node) {
      const rect = node?.getBoundingClientRect();
      if (!rect?.width || !rect.height || rect.bottom <= 0 || rect.top >= innerHeight ||
          rect.right <= 0 || rect.left >= innerWidth) return null;
      return { x: (rect.left + rect.right) / 2, y: (rect.top + rect.bottom) / 2 };
    }

    function flyCard(from, to, { art, delay = 0, receiving = false } = {}) {
      const start = visibleCenter(from);
      const end = visibleCenter(to);
      if (!start || !end || typeof content.animate !== 'function') return;
      const sprite = document.createElement('span');
      const depth = !window.GameDisplay?.lowGraphics() && window.GameDisplay?.get().animations === 'high';
      sprite.className = depth ? 'qt-flying-card' : 'qt-flying-card is-flat';
      sprite.setAttribute('aria-hidden', 'true');
      sprite.style.left = `${start.x}px`;
      sprite.style.top = `${start.y}px`;
      sprite.innerHTML = `<i class="qt-card-back"></i>${art ? `<img src="${esc(art)}" alt="">` : ''}`;
      document.body.append(sprite);

      const dx = end.x - start.x, dy = end.y - start.y;
      const first = art && !receiving ? 180 : 0;
      const last = art && receiving ? 180 : 0;
      const frames = depth ? [
        { visibility: 'hidden', transform: `translate(-50%, -50%) perspective(360px) rotateY(${first}deg) rotateZ(-16deg) scale(.65)` },
        { offset: .43, visibility: 'visible', transform: `translate(calc(-50% + ${dx * .44}px), calc(-50% + ${dy * .34 - 40}px)) perspective(360px) rotateY(${art ? 92 : 28}deg) rotateZ(14deg) scale(1.19)` },
        { visibility: 'visible', transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) perspective(360px) rotateY(${last}deg) rotateZ(0deg) scale(.7)` },
      ] : [
        { opacity: 0, transform: 'translate(-50%, -50%) scale(.84)' },
        { offset: .26, opacity: 1 },
        { opacity: 1, transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(.84)` },
      ];
      const travel = sprite.animate(frames, { duration: depth ? 610 : 380, delay, easing: 'cubic-bezier(.2,.75,.24,1)', fill: 'both' });
      flights.set(travel, sprite);
      const remove = () => { flights.delete(travel); sprite.remove(); };
      travel.finished.then(remove, remove);
    }

    function animateEvent(event, meId, entering) {
      if (!event?.id || event.id === table.eventId) return;
      table.eventId = event.id;
      if (window.GameDisplay?.reducedMotion() || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
      const scene = table;
      requestAnimationFrame(() => {
        if (scene !== table || !scene.root.isConnected) return;
        const seats = [...scene.opponents.querySelectorAll('.qt-player:not([hidden])')];
        const hand = scene.inspection.querySelector('.qt-card') || scene.handScore;
        if (event.type === 'game_started' && entering) {
          const targets = seats.slice(0, 3);
          for (const [index, target] of [...targets, hand].entries()) flyCard(scene.stack, target, { delay: index * 108 });
        }
        if (event.type !== 'ask_success' || entering) return;
        const handCard = [...scene.inspection.querySelectorAll('.qt-card')].find((card) => card.dataset.cardId === event.cardId) || hand;
        const location = (id) => id === meId ? handCard : seats.find((seat) => seat.dataset.playerId === id);
        const incoming = event.actorId === meId;
        const art = incoming || event.targetId === meId ? cardAsset(getCard(event.cardId)) : null;
        flyCard(location(event.targetId), location(event.actorId), { art, receiving: incoming });
        if (event.completedQuartets?.length) {
          scene.score.animate?.([{ transform: 'scale(1)' }, { transform: 'scale(1.12)' }, { transform: 'scale(1)' }], { duration: 430 });
        }
      });
    }

    function setText(node, value) {
      if (node.textContent !== value) node.textContent = value;
    }

    function renderGame(state, { cardId, targets, pending, connected }) {
      const entering = !table?.root.isConnected;
      if (entering) mountTable(state.practice);
      const me = state.me || {};
      const myTurn = state.turnPlayerId === me.playerId;
      const players = state.players.filter((player) => player.isActive !== false);
      const opponents = players.filter((player) => player.playerId !== me.playerId);
      const canAsk = myTurn && connected && !pending && targets.length > 0;
      const myGroups = getGroups(me.hand || []);
      const group = myGroups.find((item) => item.quartet.id === groupId) || myGroups[0];
      groupId = group?.quartet.id || '';

      const advice = !connected ? 'Восстанавливаем связь…' : pending ? 'Ждём ответ…'
        : !myTurn ? 'Вы можете листать свою руку.'
        : canAsk ? 'Нажмите на недостающую карту.' : 'У соперников не осталось карт.';
      table.timer.classList.toggle('is-mine', myTurn);
      table.root.dataset.askStep = canAsk ? 'card' : 'wait';
      setText(table.name, myTurn ? 'Ваш ход' : `Ходит ${state.turnPlayerName || 'соперник'}`);
      setText(table.guide, advice);
      setText(table.score, `${state.players.reduce((sum, player) => sum + player.quartetsCount, 0)} / ${state.totalQuartets} собрано`);
      setText(table.handScore, `${me.cardsCount || 0} карт · ${me.quartetsCount || 0} ★`);

      table.opponentSearch.hidden = opponents.length < 7;
      if (table.opponentSearch.hidden && table.opponentQuery.value) table.opponentQuery.value = '';
      patch(table.opponents, opponents.map((player) => playerCard(player, state.turnPlayerId, state.practice)).join(''));
      filterOpponents();
      patch(table.groups, myGroups.map(({ quartet, ownedCount }) =>
        `<button type="button" class="qt-group" data-action="table-group" data-group-id="${esc(quartet.id)}">
          <span aria-hidden="true">${esc(quartet.icon)}</span><strong>${esc(quartet.name)}</strong><small>${ownedCount}/4</small>
        </button>`).join(''));
      for (const button of table.groups.children) button.setAttribute('aria-pressed', String(button.dataset.groupId === groupId));
      const handChanged = patch(table.inspection, group
        ? `<div class="qt-cards" aria-label="${esc(group.quartet.name)}">${group.cards.map((item) =>
          cardFace(item, group.quartet, group.catalogIndex % 6)).join('')}</div>`
        : '<p class="qt-note">В руке больше нет карт.</p>');
      if (handChanged && table.inspectedGroup !== groupId) {
        table.inspection.querySelector('.qt-cards')?.classList.add('is-fanning');
      }
      table.inspectedGroup = groupId;
      for (const button of table.inspection.querySelectorAll('[data-action="table-card"]')) {
        const active = canAsk && button.dataset.cardId === cardId;
        const slot = button.nextElementSibling;
        button.disabled = !canAsk;
        button.setAttribute('aria-expanded', String(active));
        button.parentElement.classList.toggle('is-choosing', active);
        slot.hidden = !active;
        if (active) {
          patch(slot, `<span class="qt-target-label">Спросить у</span>
            <div class="qt-target-list">${targets.map((player) => `<button type="button" data-action="table-ask"
              data-card-id="${esc(cardId)}" data-player-id="${esc(player.playerId)}" title="${esc(player.name)}">
              ${esc(player.name)}</button>`).join('')}</div>`);
        }
      }

      const completed = (me.completedQuartets || []).map((id) => getQuartet(id)?.name).filter(Boolean);
      table.completed.hidden = completed.length === 0;
      patch(table.completed, completed.map((title) => `<span>★ ${esc(title)}</span>`).join(''));
      const event = getEvent(state.lastEvent, me.playerId);
      table.event.hidden = !event?.text;
      table.event.className = `qt-event ${event?.className || ''}`;
      patch(table.event, event?.text || '');
      patch(table.history, (state.log || []).slice().reverse().map((line) => `<li>${esc(line)}</li>`).join(''));

      if (table.chat) {
        const chat = state.chat || [];
        if (patch(table.chat, chat.map((item) => `<li><strong>${esc(item.name)}</strong><span>${esc(item.text)}</span></li>`).join('')) && chat.length >= chatSize) {
          table.chat.scrollTop = table.chat.scrollHeight;
        }
        chatSize = chat.length;
        table.chatSubmit.disabled = !connected;
      }

      animateEvent(state.lastEvent, me.playerId, entering);
    }

    function renderResults(state, pending) {
      dispose();
      groupId = '';
      const winners = state.score.filter((player) => state.winnerIds.includes(player.playerId));
      const active = state.players.filter((player) => player.isActive !== false).length;
      const canRestart = active >= state.minPlayers;
      patch(content, `
        <div class="qt-pages">
          <section class="qt-invite qt-results"><div><span>Партия завершена</span>
            <h3>${winners.length > 1 ? 'Ничья' : winners[0]?.playerId === state.me?.playerId ? 'Вы победили' : 'Победитель'}</h3>
            <p>${esc(winners.map((winner) => winner.name).join(', '))}</p></div>
          </section>
          <section class="qt-paper">
            <div class="qt-section-title"><h3>Итог партии</h3><span>${state.totalQuartets} в колоде</span></div>
            <ol class="qt-seats">${state.score.map((player) => playerRow(player, state.me, true)).join('')}</ol>
          </section>
          ${state.me?.isHost && canRestart ? `<section class="qt-paper">
            ${deckPicker(state, active, pending)}
            <button type="button" class="qt-btn qt-btn--solid" data-action="restart-game" ${pending ? 'disabled' : ''}>Новая партия</button>
          </section>` : ''}
          <button type="button" class="qt-link qt-leave" data-action="leave-room">${state.practice ? 'Выйти из партии' : 'Выйти из комнаты'}</button>
        </div>`);
    }

    return { renderHome, renderLobby, renderGame, renderResults, dispose, selectGroup: (id) => { groupId = id; } };
  }

  window.QuartetTable = { create };
})();
