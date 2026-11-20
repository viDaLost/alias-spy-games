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
              ${['daniel_lions', 'elijah_altar', 'noah_dove'].map((id) => `<img src="${esc(cardAsset({ art: `web/assets/quartet/cards/${id}.webp` }))}" alt="" width="124" height="155" decoding="async">`).join('')}\n            </div>\n            <div><h3>Completa un cuarteto</h3><p>3–${playerLimit} jugador · ${catalogSize} cuartetos</p></div>\n          </section>\n          ${allowPractice ? `<button class="qt-practice" type="button" data-action="start-practice">\n            <span><strong>Jugar con bots</strong><small>Tú y dos bots · sin temporizador</small></span>\n            <span class="qt-practice-arrow" aria-hidden="true">›</span>\n          </button>` : ''}\n          <section class="qt-paper qt-home-form">\n            <label class="qt-field" for="qv2-player-name">Tu nombre\n              <input id="qv2-player-name" maxlength="32" value="${esc(playerName)}" autocomplete="nickname">\n            </label>\n            <button class="qt-btn qt-btn--solid" type="button" data-action="create">Crear sala</button>\n            <form class="qt-join" id="qt-join-form">\n              <label class="qt-field" for="qv2-room-code">Código de sala\n                <input id="qv2-room-code" maxlength="8" placeholder="AB2CD3" value="${esc(inviteCode)}" autocomplete="off" autocapitalize="characters" spellcheck="false" required>\n              </label>\n              <button class="qt-btn qt-btn--line" type="submit">Entrar</button>\n            </form>\n            ${window.RoomQrScanner?.isAvailable() ? '<button class="qt-btn qt-btn--line" type="button" data-action="scan-room">Escanear QR</button>' : ''}\n            <button class="qt-link" type="button" data-action="open-rules">Reglas del juego</button>\n          </section>\n        </div>`;
    }

    function playerRow(player, me, end) {
      return `<li class="qt-seat">
        <span class="qt-avatar" aria-hidden="true">${esc(player.name[0]?.toUpperCase() || '?')}</span>
        <span class="qt-seat-name">${esc(player.name)}${player.playerId === me?.playerId ? ' <small>tú</small>' : ''}</span>
        ${end
          ? `<span class="qt-seat-score">${player.quartetsCount} ★</span>`
          : `<span class="qt-seat-tag">${player.isHost ? 'Anfitrión' : player.connected ? 'En la sala' : 'Sin conexión'}</span>`}
      </li>`;
    }

    function deckPicker(state, players, pending) {
      if (!state.deckSettings) return '';
      const { min, max, requested, count } = state.deckSettings;
      if (!state.me?.isHost) return `<div class="qt-deck-read"><span>Cuartetos en la baraja</span><strong>${count}</strong></div>`;
      const selected = requested === null ? '' : count;
      const options = Array.from({ length: max - min + 1 }, (_, index) => {
        const value = min + index;
        return `<option value="${value}" ${selected === value ? 'selected' : ''}>${value} · ${value * 4} cartas</option>`;
      }).join('');
      const presets = [2, 3, 4, 5].filter((perPlayer) => players >= state.minPlayers && perPlayer * players <= max);
      const cards = count * 4;
      const low = Math.floor(cards / players), high = Math.ceil(cards / players);
      const equivalent = players >= state.minPlayers && count % players === 0
        ? `Cuartetos por jugador: ${count / players}. ` : '';
      const initialHand = players < state.minPlayers ? '' : `Cartas iniciales: ${low === high ? low : `${low}–${high}`}.`;
      return `\n        <label class="qt-deck-read" for="qt-deck-size"><span>Cuartetos en la baraja</span>\n          <select id="qt-deck-size" ${pending ? 'disabled' : ''}>
            <option value="" ${requested === null ? 'selected' : ''}>Automático · ${Math.max(min, 12)}</option>
            ${options}
          </select>
        </label>
        ${presets.length ? `<div class="qt-presets" aria-label="Tamaño de la baraja por jugador">\n          ${presets.map((perPlayer) => `<button type="button" data-action="table-deck" data-count="${perPlayer * players}" aria-pressed="${count === perPlayer * players}" ${pending ? 'disabled' : ''}>${perPlayer} por jugador</button>`).join('')}
        </div>` : ''}
        <p class="qt-note">${equivalent}${initialHand}</p>`;
    }

    function renderLobby(state, pending, { minPlayers, playerLimit }) {
      disposeTable();
      const players = state.players.filter((player) => player.isActive !== false);
      const waiting = (state.minPlayers ?? minPlayers) - players.length;
      const action = waiting > 0 ? `Faltan jugadores: ${waiting}` : 'Empezar la partida';
      patch(content, `\n        <div class="qt-pages">\n          <section class="qt-invite">\n            <div><span>Código de sala</span><strong>${esc(state.roomId)}</strong></div>\n            <div class="qt-invite-actions">\n              <button type="button" class="qt-btn qt-btn--gold" data-action="share-room">Compartir y QR</button>\n              <button type="button" class="qt-btn qt-btn--ghost" data-action="copy-room">Copiar código</button>\n            </div>\n          </section>\n          <section class="qt-paper">\n            <div class="qt-section-title"><h3>Jugadores</h3><span>${players.length} / ${state.playerLimit ?? playerLimit}</span></div>
            <ul class="qt-seats">${players.map((player) => playerRow(player, state.me, false)).join('')}</ul>
          </section>
          <section class="qt-paper">
            ${deckPicker(state, players.length, pending)}
            ${state.me?.isHost
              ? `<button type="button" class="qt-btn qt-btn--solid" data-action="start-game" ${waiting > 0 || pending ? 'disabled' : ''}>${action}</button>`
              : '<p class="qt-note">El anfitrión inicia la partida cuando todos se hayan unido.</p>'}\n          </section>\n          <button type="button" class="qt-link qt-leave" data-action="leave-room">Salir de la sala</button>\n        </div>`);
    }

    function mountTable(practice) {
      groupId = '';
      content.innerHTML = `
        <div class="qt-play">
          <section class="qt-turn" id="qv2-turn-banner">
            <div class="qt-turn-main"><h3 aria-live="polite" data-turn-name></h3><p data-turn-guide></p></div>
            ${practice ? '' : `<span class="qt-timer" id="qv2-turn-timer" aria-label="Tiempo restante del turno"></span>\n            <div class="qt-timer-bar" aria-hidden="true"><span id="qv2-turn-progress"></span></div>`}\n          </section>\n          <div class="qt-table-grid">\n            <section class="qt-opponents" aria-labelledby="qt-opponents-title">\n              <div class="qt-section-title qt-players-title">\n                <div class="qt-table-stack" aria-hidden="true">\n                  <i class="qt-card-back"></i><i class="qt-card-back"></i><i class="qt-card-back"></i>\n                </div>\n                <h3 id="qt-opponents-title">Rivales</h3><span data-table-score></span>\n              </div>\n              <label class="qt-player-search" hidden>\n                <input type="search" placeholder="Buscar por nombre" aria-label="Buscar rival" aria-controls="qt-player-list" maxlength="32">\n              </label>\n              <div class="qt-players" id="qt-player-list" data-players></div>\n              <p class="qt-note" data-player-empty role="status" hidden>No se encontró ningún rival.</p>\n            </section>\n            <section class="qt-paper qt-hand" aria-labelledby="qt-hand-title">\n              <div class="qt-section-title"><h3 id="qt-hand-title">Tu mano</h3><span data-hand-score></span></div>\n              <div data-inspection></div>\n              <div class="qt-groups" data-groups aria-label="Cuartetos en tu mano"></div>\n              <div class="qt-completed" data-completed hidden></div>\n            </section>\n            <p class="qt-event" data-event aria-live="polite" hidden></p>\n          </div>\n          <details class="qt-paper qt-details">\n            <summary>Historial de turnos</summary>\n            <ol class="qt-history" data-history></ol>\n          </details>\n          <button type="button" class="qt-link qt-leave" data-action="leave-room">Salir de la partida</button>\n        </div>`;
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

    function playerCard(player, turnId, practice) {
      return `<div class="qt-player ${player.playerId === turnId ? 'is-current' : ''}"
        data-player-id="${esc(player.playerId)}" data-search-name="${esc(filterName(player.name))}" title="${esc(player.name)}">
        <span class="qt-avatar" aria-hidden="true">${esc(player.name[0]?.toUpperCase() || '?')}</span>
        <strong>${esc(player.name)}${practice ? ' <span class="qt-bot-label">bot</span>' : ''}</strong>
        <small>${player.cardsCount} <span aria-label="cartas">▤</span> · ${player.quartetsCount} <span aria-label="cuartetos">★</span></small>\n      </div>`;
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
        <strong>${esc(card.title)}</strong><small>${card.owned ? '✓ En tu mano' : 'Falta'}</small>`;
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

      const advice = !connected ? 'Reconectando…' : pending ? 'Esperando respuesta…'
        : !myTurn ? 'Puedes revisar tu mano.'
        : canAsk ? 'Toca una carta que te falte.' : 'Tus rivales ya no tienen cartas.';
      table.timer.classList.toggle('is-mine', myTurn);
      table.root.dataset.askStep = canAsk ? 'card' : 'wait';
      setText(table.name, myTurn ? 'Tu turno' : `Juega ${state.turnPlayerName || 'rival'}`);
      setText(table.guide, advice);
      setText(table.score, `${state.players.reduce((sum, player) => sum + player.quartetsCount, 0)} / ${state.totalQuartets} reunidas`);
      setText(table.handScore, `${me.cardsCount || 0} cartas · ${me.quartetsCount || 0} ★`);

      table.opponentSearch.hidden = opponents.length < 7;
      if (table.opponentSearch.hidden && table.opponentQuery.value) table.opponentQuery.value = '';
      patch(table.opponents, opponents.map((player) => playerCard(player, state.turnPlayerId, state.practice)).join(''));
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
        : '<p class="qt-note">No quedan cartas en tu mano.</p>');
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
          patch(slot, `<span class="qt-target-label">Pedir a</span>\n            <div class="qt-target-list">${targets.map((player) => `<button type="button" data-action="table-ask"
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
        content.insertAdjacentHTML('beforebegin', `<details class="qt-paper qt-details qt-room-chat">\n          <summary>Chat de la sala</summary>\n          <ol class="qt-history qt-chat" data-chat role="log"></ol>\n          <form id="qt-chat-form" class="qt-chat-form">\n            <input name="message" maxlength="300" placeholder="Mensaje" aria-label="Mensaje" autocomplete="off" required>\n            <button type="submit" class="qt-btn qt-btn--line">Enviar</button>\n          </form>\n        </details>`);
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
      setText(submit, pending ? 'Enviando…' : 'Enviar');
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
      patch(content, `\n        <div class="qt-pages">\n          <section class="qt-invite qt-results"><div><span>Partida terminada</span>\n            <h3>${winners.length > 1 ? 'Empate' : winners[0]?.playerId === state.me?.playerId ? 'Has ganado' : 'Ganador'}</h3>
            <p>${esc(winners.map((winner) => winner.name).join(', '))}</p></div>\n          </section>\n          <section class="qt-paper">\n            <div class="qt-section-title"><h3>Resultado de la partida</h3><span>${state.totalQuartets} en la baraja</span></div>\n            <ol class="qt-seats">${state.score.map((player) => playerRow(player, state.me, true)).join('')}</ol>
          </section>
          ${state.me?.isHost && canRestart ? `<section class="qt-paper">
            ${deckPicker(state, active, pending)}
            <button type="button" class="qt-btn qt-btn--solid" data-action="restart-game" ${pending ? 'disabled' : ''}>Nueva partida</button>\n          </section>` : ''}
          <button type="button" class="qt-link qt-leave" data-action="leave-room">${state.practice ? 'Salir de la partida' : 'Salir de la sala'}</button>
        </div>`);
    }

    return { renderHome, renderLobby, renderGame, renderChat, renderResults, dispose, selectGroup: (id) => { groupId = id; } };
  }

  window.QuartetTable = { create };
})();
