(() => {
  'use strict';

  const filterName = (name) => name.toLocaleLowerCase('ru').replaceAll('ё', 'е').trim();

  function create({ content, escapeHtml: esc, getGroups, getQuartet, getCard, getEvent }) {
    const regions = new WeakMap();
    const flights = new Map();
    let groupId = '';
    let table = null;
    let chat = null;
    let chatKey = '';

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
              ${['daniel_lions', 'elijah_altar', 'noah_dove'].map((id) => `<img src="${esc(cardAsset({ art: `web/assets/quartet/cards/${id}.webp` }))}" alt="" width="124" height="155" decoding="async">`).join('')}\n            </div>\n            <div><h3>Complete a quartet</h3><p>3–${playerLimit} player · ${catalogSize} quartets</p></div>\n          </section>\n          ${allowPractice ? `<button class="qt-practice" type="button" data-action="start-practice">\n            <span><strong>Play with bots</strong><small>You and two bots · no timer</small></span>\n            <span class="qt-practice-arrow" aria-hidden="true">›</span>\n          </button>` : ''}\n          <section class="qt-paper qt-home-form">\n            <label class="qt-field" for="qv2-player-name">Your name\n              <input id="qv2-player-name" maxlength="32" value="${esc(playerName)}" autocomplete="nickname">\n            </label>\n            <button class="qt-btn qt-btn--solid" type="button" data-action="create">Create room</button>\n            <form class="qt-join" id="qt-join-form">\n              <label class="qt-field" for="qv2-room-code">Room code\n                <input id="qv2-room-code" maxlength="8" placeholder="AB2CD3" value="${esc(inviteCode)}" autocomplete="off" autocapitalize="characters" spellcheck="false" required>\n              </label>\n              <button class="qt-btn qt-btn--line" type="submit">Sign in</button>\n            </form>\n            ${window.RoomQrScanner?.isAvailable() ? '<button class="qt-btn qt-btn--line" type="button" data-action="scan-room">Scan QR</button>' : ''}\n            <button class="qt-link" type="button" data-action="open-rules">Game rules</button>\n          </section>\n        </div>`;
    }

    function removePlayerButton(player, pending) {
      if (!player.canRemove) return '';
      return `<button type="button" class="qt-remove-player" data-action="remove-offline-player" data-player-id="${esc(player.playerId)}"\n        aria-label="Remove player ${esc(player.name)}" ${pending ? 'disabled' : ''}>Remove</button>`;
    }

    function playerRow(player, me, end, pending) {
      return `<li class="qt-seat">
        <span class="qt-avatar" aria-hidden="true">${esc(player.name[0]?.toUpperCase() || '?')}</span>
        <span class="qt-seat-name">${esc(player.name)}${player.playerId === me?.playerId ? ' <small>you</small>' : ''}</span>
        <span class="qt-seat-actions">${end
          ? `<span class="qt-seat-score">${player.quartetsCount} ★</span>`
          : `<span class="qt-seat-tag">${player.isHost ? 'Host' : player.connected ? 'In the room' : 'No connection'}</span>`}
        ${removePlayerButton(player, pending)}</span>
      </li>`;
    }

    function deckPicker(state, players, pending) {
      if (!state.deckSettings) return '';
      const { min, max, requested, count } = state.deckSettings;
      if (!state.me?.isHost) return `<div class="qt-deck-read"><span>Quartets in the deck</span><strong>${count}</strong></div>`;
      const selected = requested === null ? '' : count;
      const options = Array.from({ length: max - min + 1 }, (_, index) => {
        const value = min + index;
        return `<option value="${value}" ${selected === value ? 'selected' : ''}>${value} · ${value * 4} cards</option>`;
      }).join('');
      const presets = [2, 3, 4, 5].filter((perPlayer) => players >= state.minPlayers && perPlayer * players <= max);
      const cards = count * 4;
      const low = Math.floor(cards / players), high = Math.ceil(cards / players);
      const equivalent = players >= state.minPlayers && count % players === 0
        ? `Quartets per player: ${count / players}. ` : '';
      const initialHand = players < state.minPlayers ? '' : `Starting cards: ${low === high ? low : `${low}–${high}`}.`;
      return `\n        <label class="qt-deck-read" for="qt-deck-size"><span>Quartets in the deck</span>\n          <select id="qt-deck-size" ${pending ? 'disabled' : ''}>
            <option value="" ${requested === null ? 'selected' : ''}>Auto · ${Math.max(min, 12)}</option>
            ${options}
          </select>
        </label>
        ${presets.length ? `<div class="qt-presets" aria-label="Deck size per player">\n          ${presets.map((perPlayer) => `<button type="button" data-action="table-deck" data-count="${perPlayer * players}" aria-pressed="${count === perPlayer * players}" ${pending ? 'disabled' : ''}>${perPlayer} per player</button>`).join('')}
        </div>` : ''}
        <p class="qt-note">${equivalent}${initialHand}</p>`;
    }

    function renderLobby(state, pending, { minPlayers, playerLimit }) {
      disposeTable();
      const players = state.players.filter((player) => player.isActive !== false);
      const waiting = (state.minPlayers ?? minPlayers) - players.length;
      const action = waiting > 0 ? `More players needed: ${waiting}` : 'Start match';
      patch(content, `\n        <div class="qt-pages">\n          <section class="qt-invite">\n            <div><span>Room code</span><strong>${esc(state.roomId)}</strong></div>\n            <div class="qt-invite-actions">\n              <button type="button" class="qt-btn qt-btn--gold" data-action="share-room">Share and QR</button>\n              <button type="button" class="qt-btn qt-btn--ghost" data-action="copy-room">Copy code</button>\n            </div>\n          </section>\n          <section class="qt-paper">\n            <div class="qt-section-title"><h3>Players</h3><span>${players.length} / ${state.playerLimit ?? playerLimit}</span></div>
            <ul class="qt-seats">${players.map((player) => playerRow(player, state.me, false, pending)).join('')}</ul>
          </section>
          <section class="qt-paper">
            ${deckPicker(state, players.length, pending)}
            ${state.me?.isHost
              ? `<button type="button" class="qt-btn qt-btn--solid" data-action="start-game" ${waiting > 0 || pending ? 'disabled' : ''}>${action}</button>`
              : '<p class="qt-note">The host starts the match once everyone has joined.</p>'}\n          </section>\n          <button type="button" class="qt-link qt-leave" data-action="leave-room">Leave room</button>\n        </div>`);
    }

    function mountTable(practice) {
      groupId = '';
      content.innerHTML = `
        <div class="qt-play">
          <section class="qt-turn" id="qv2-turn-banner">
            <div class="qt-turn-main"><h3 aria-live="polite" data-turn-name></h3><p data-turn-guide></p></div>
            ${practice ? '' : `<span class="qt-timer" id="qv2-turn-timer" aria-label="Time left for the turn"></span>\n            <div class="qt-timer-bar" aria-hidden="true"><span id="qv2-turn-progress"></span></div>`}\n          </section>\n          <div class="qt-table-grid">\n            <section class="qt-opponents" aria-labelledby="qt-opponents-title">\n              <div class="qt-section-title qt-players-title">\n                <div class="qt-table-stack" aria-hidden="true">\n                  <i class="qt-card-back"></i><i class="qt-card-back"></i><i class="qt-card-back"></i>\n                </div>\n                <h3 id="qt-opponents-title">Opponents</h3><span data-table-score></span>\n              </div>\n              <label class="qt-player-search" hidden>\n                <input type="search" placeholder="Search by name" aria-label="Find an opponent" aria-controls="qt-player-list" maxlength="32">\n              </label>\n              <div class="qt-players" id="qt-player-list" data-players></div>\n              <p class="qt-note" data-player-empty role="status" hidden>No matching opponent.</p>\n            </section>\n            <section class="qt-paper qt-hand" aria-labelledby="qt-hand-title">\n              <div class="qt-section-title"><h3 id="qt-hand-title">Your hand</h3><span data-hand-score></span></div>\n              <div data-inspection></div>\n              <div class="qt-groups" data-groups aria-label="Quartets in your hand"></div>\n              <div class="qt-completed" data-completed hidden></div>\n            </section>\n            <p class="qt-event" data-event aria-live="polite" hidden></p>\n          </div>\n          <details class="qt-paper qt-details">\n            <summary>Turn history</summary>\n            <ol class="qt-history" data-history></ol>\n          </details>\n          <button type="button" class="qt-link qt-leave" data-action="leave-room">Leave game</button>\n        </div>`;
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
      };
      table.opponentQuery.addEventListener('input', filterOpponents);
      table.inspection.addEventListener('error', (event) => {
        if (event.target.matches('.qt-card-face img')) event.target.hidden = true;
      }, true);
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

    function playerCard(player, turnId, practice, pending) {
      return `<div class="qt-player ${player.playerId === turnId ? 'is-current' : ''}"
        data-player-id="${esc(player.playerId)}" data-search-name="${esc(filterName(player.name))}" title="${esc(player.name)}">
        <span class="qt-avatar" aria-hidden="true">${esc(player.name[0]?.toUpperCase() || '?')}</span>
        <strong>${esc(player.name)}${practice ? ' <span class="qt-bot-label">bot</span>' : ''}</strong>
        <small>${player.cardsCount} <span aria-label="cards">▤</span> · ${player.quartetsCount} <span aria-label="quartets">★</span></small>\n        ${!practice && !player.connected ? '<small class="qt-player-offline">No connection</small>' : ''}
        ${removePlayerButton(player, pending)}
      </div>`;
    }

    function cardAsset(card) {
      const art = card?.art;
      return art && window.FullPreviewMenu && window.GameDisplay?.lowGraphics() ? art.replace('/cards/', '/thumbs/') : art;
    }

    function cardFace(card, quartet, color) {
      const art = cardAsset(card);
      const visual = `<span class="qt-card-symbol" aria-hidden="true">${esc(card.icon || quartet.icon)}</span>
        ${art ? `<img src="${esc(art)}" alt="" decoding="async">` : ''}`;
      const content = `<span class="qt-card-face qt-color-${color}">${visual}</span>
        <strong>${esc(card.title)}</strong><small>${card.owned ? '✓ You have' : 'Missing'}</small>`;
      return card.owned
        ? `<div class="qt-card is-owned" data-card-id="${esc(card.id)}"><div class="qt-card-content">${content}</div></div>`
        : `<div class="qt-card is-missing" data-card-id="${esc(card.id)}">
            <button type="button" class="qt-card-content" data-action="table-card" data-card-id="${esc(card.id)}" aria-expanded="false">${content}</button>
            <div class="qt-card-targets" data-card-targets hidden></div>
          </div>`;
    }

    function disposeTable() {
      for (const [animation, sprite] of flights) {
        animation.cancel();
        sprite.remove();
      }
      flights.clear();
      table = null;
    }

    function dispose() {
      disposeTable();
      if (chatKey) window.GameChatToasts?.reset(chatKey);
      chatKey = '';
      chat?.panel.remove();
      chat = null;
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

      const advice = !connected ? 'Reconnecting…' : pending ? 'Waiting for a reply…'
        : !myTurn ? 'You can browse your hand.'
        : canAsk ? 'Tap a missing card.' : 'Your opponents have no cards left.';
      table.timer.classList.toggle('is-mine', myTurn);
      table.root.dataset.askStep = canAsk ? 'card' : 'wait';
      setText(table.name, myTurn ? 'Your turn' : `Playing ${state.turnPlayerName || 'opponent'}`);
      setText(table.guide, advice);
      setText(table.score, `${state.players.reduce((sum, player) => sum + player.quartetsCount, 0)} / ${state.totalQuartets} collected`);
      setText(table.handScore, `${me.cardsCount || 0} cards · ${me.quartetsCount || 0} ★`);

      table.opponentSearch.hidden = opponents.length < 7;
      if (table.opponentSearch.hidden && table.opponentQuery.value) table.opponentQuery.value = '';
      patch(table.opponents, opponents.map((player) => playerCard(player, state.turnPlayerId, state.practice, pending || !connected)).join(''));
      filterOpponents();
      const groupsChanged = patch(table.groups, myGroups.map(({ quartet, ownedCount }) =>
        `<button type="button" class="qt-group" data-action="table-group" data-group-id="${esc(quartet.id)}">
          <span aria-hidden="true">${esc(quartet.icon)}</span><strong>${esc(quartet.name)}</strong><small>${ownedCount}/4</small>
        </button>`).join(''));
      for (const button of table.groups.children) {
        const active = button.dataset.groupId === groupId;
        button.setAttribute('aria-pressed', String(active));
        if (active && groupsChanged) {
          const strip = table.groups.getBoundingClientRect();
          const tab = button.getBoundingClientRect();
          table.groups.scrollLeft += tab.left < strip.left ? tab.left - strip.left : Math.max(0, tab.right - strip.right);
        }
      }
      const handChanged = patch(table.inspection, group
        ? `<div class="qt-cards" aria-label="${esc(group.quartet.name)}">${group.cards.map((item) =>
          cardFace(item, group.quartet, group.catalogIndex % 6)).join('')}</div>`
        : '<p class="qt-note">No cards left in your hand.</p>');
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
          patch(slot, `<span class="qt-target-label">Ask</span>\n            <div class="qt-target-list">${targets.map((player) => `<button type="button" data-action="table-ask"
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

      animateEvent(state.lastEvent, me.playerId, entering);
    }

    function renderChat(state, { connected, pending }) {
      if (!state?.me || state.practice) return;
      if (!chat) {
        content.insertAdjacentHTML('beforebegin', `<details class="qt-paper qt-details qt-room-chat">\n          <summary>Room chat</summary>\n          <ol class="qt-history qt-chat" data-chat role="log"></ol>\n          <form id="qt-chat-form" class="qt-chat-form">\n            <input name="message" maxlength="300" placeholder="Message" aria-label="Message" autocomplete="off" required>\n            <button type="submit" class="qt-btn qt-btn--line">Send</button>\n          </form>\n        </details>`);
        const panel = content.previousElementSibling;
        const list = panel.querySelector('[data-chat]');
        chat = { panel, list, submit: panel.querySelector('button') };
        panel.addEventListener('toggle', () => {
          if (panel.open) list.scrollTop = list.scrollHeight;
        });
      }
      const { panel, list, submit } = chat;
      const messages = state.chat || [];
      if (patch(list, messages.map((item) => `<li><strong>${esc(item.name)}</strong><span>${esc(item.text)}</span></li>`).join('')) && panel.open) {
        list.scrollTop = list.scrollHeight;
      }
      submit.disabled = !connected || pending;
      setText(submit, pending ? 'Sending…' : 'Send');
      chatKey = `quartet:${state.roomId}`;
      window.GameChatToasts?.sync({
        key: chatKey,
        messages,
        selfId: state.me.playerId,
        chatVisible: () => panel.open && Boolean(visibleCenter(list)),
        onOpen: () => {
          if (!panel.isConnected) return;
          panel.open = true;
          panel.scrollIntoView({ block: 'nearest' });
        },
      });
    }

    function renderResults(state, pending, minPlayers) {
      disposeTable();
      groupId = '';
      const winners = state.score.filter((player) => state.winnerIds.includes(player.playerId));
      const active = state.players.filter((player) => player.isActive !== false).length;
      const canRestart = active >= (state.minPlayers ?? minPlayers);
      patch(content, `\n        <div class="qt-pages">\n          <section class="qt-invite qt-results"><div><span>Game over</span>\n            <h3>${winners.length > 1 ? 'Draw' : winners[0]?.playerId === state.me?.playerId ? 'You won' : 'Winner'}</h3>
            <p>${esc(winners.map((winner) => winner.name).join(', '))}</p></div>\n          </section>\n          <section class="qt-paper">\n            <div class="qt-section-title"><h3>Match results</h3><span>${state.totalQuartets} in the deck</span></div>\n            <ol class="qt-seats">${state.score.map((player) => playerRow(player, state.me, true, pending)).join('')}</ol>
          </section>
          ${state.me?.isHost && canRestart ? `<section class="qt-paper">
            ${deckPicker(state, active, pending)}
            <button type="button" class="qt-btn qt-btn--solid" data-action="restart-game" ${pending ? 'disabled' : ''}>New game</button>\n          </section>` : ''}
          <button type="button" class="qt-link qt-leave" data-action="leave-room">${state.practice ? 'Leave game' : 'Leave room'}</button>
        </div>`);
    }

    return { renderHome, renderLobby, renderGame, renderChat, renderResults, dispose, selectGroup: (id) => { groupId = id; } };
  }

  window.QuartetTable = { create };
})();
