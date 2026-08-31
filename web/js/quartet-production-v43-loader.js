(() => {
  'use strict';
  if (window.__QUARTET_PRODUCTION_V43_LOADER__) return;
  window.__QUARTET_PRODUCTION_V43_LOADER__ = true;

  const originalAppendChild = Node.prototype.appendChild;
  const quartetScriptPattern = /\/web\/games\/quartet\.js(?:\?|$)/;

  const oldSelectionHandlers = `  function selectTarget(button) {
    if (!isMyTurn()) return;
    selectedTargetId = String(button.dataset.playerId || '');
    renderState();
    haptic('selection');
  }

  function selectCard(button) {
    if (!isMyTurn()) return;
    const cardId = String(button.dataset.cardId || '');
    if (!cardId) return;
    selectedCardId = selectedCardId === cardId ? '' : cardId;
    const groupId = quartetByCardId.get(cardId)?.id || '';
    renderState();
    if (groupId) requestAnimationFrame(() => focusGroup(groupId));
    haptic('selection');
  }
`;

  const newSelectionHandlers = `  function selectTarget(button) {
    if (!isMyTurn()) return;
    selectedTargetId = String(button.dataset.playerId || '');
    updateSelectionUi();
    haptic('selection');
  }

  function selectCard(button) {
    if (!isMyTurn()) return;
    const cardId = String(button.dataset.cardId || '');
    if (!cardId) return;
    selectedCardId = selectedCardId === cardId ? '' : cardId;
    updateSelectionUi();
    haptic('selection');
  }

  function updateSelectionUi() {
    const target = (state?.players || []).find((player) => player.playerId === selectedTargetId);
    const card = cardById.get(selectedCardId);
    const ready = isMyTurn() && !!target && !!card;

    for (const button of ui.root?.querySelectorAll('.qv2-score-player[data-player-id]') || []) {
      const selected = button.dataset.playerId === selectedTargetId;
      button.classList.toggle('is-target', selected);
      button.setAttribute('aria-pressed', String(selected));
      button.querySelector('.qv2-player-target-label')?.remove();
      if (selected) button.insertAdjacentHTML('beforeend', '<div class="qv2-player-target-label">Выбран</div>');
    }

    for (const button of ui.root?.querySelectorAll('button.qv2-playing-card.is-missing') || []) {
      const buttonCardId = String(button.dataset.cardId || '');
      const selected = buttonCardId && buttonCardId === selectedCardId;
      button.classList.toggle('is-selected', selected);
      button.classList.toggle('is-selectable', isMyTurn());
      button.disabled = !isMyTurn();
      button.setAttribute('aria-pressed', String(selected));
      const status = button.querySelector('.qv2-card-status');
      if (status) status.textContent = selected ? 'Выбрана' : 'Нажмите, чтобы выбрать';
      const badge = button.querySelector('.qv4-back-label');
      if (badge) badge.textContent = selected ? '✓' : '';
    }

    const targetText = ui.root?.querySelector('.qv2-action-target strong');
    if (targetText) targetText.textContent = target?.name || 'Выберите игрока';
    const cardText = ui.root?.querySelector('.qv2-action-card strong');
    if (cardText) cardText.textContent = card?.title || 'Выберите карту';
    const confirm = ui.root?.querySelector('.qv2-confirm-ask');
    if (confirm) {
      confirm.disabled = !ready;
      confirm.textContent = ready ? 'Спросить карту' : 'Сделайте 2 выбора';
    }


    window.dispatchEvent(new CustomEvent('quartetselectionchange', {
      detail: { targetId: selectedTargetId, cardId: selectedCardId },
    }));
  }
`;

  const oldStateRender = `        reconcileSelection(previousState, state);
        renderState();
        handleStateTransition(previousState, state);`;
  const newStateRender = `        reconcileSelection(previousState, state);
        renderStateIncremental(previousState);
        handleStateTransition(previousState, state);`;

  const incrementalRenderer = `
  function renderStateIncremental(previousState) {
    if (!state) return;
    const game = ui.content?.querySelector('.qv2-game');
    if (state.status !== 'playing' || previousState?.status !== 'playing' || currentScreen !== 'game' || !game) {
      renderState();
      window.dispatchEvent(new CustomEvent('quartetstatepatch', { detail: { full: true, status: state.status } }));
      return;
    }

    currentScreen = 'game';
    updateHeader();
    const me = state.me || {};
    const previousMe = previousState?.me || {};
    const myTurn = isMyTurn();
    const previousMyTurn = previousState?.turnPlayerId === previousMe.playerId;
    const targets = availableTargets();
    if (selectedTargetId && !targets.some((player) => player.playerId === selectedTargetId)) selectedTargetId = '';

    const turnSignature = JSON.stringify([state.turnPlayerId, state.turnPlayerName, myTurn]);
    const previousTurnSignature = JSON.stringify([previousState?.turnPlayerId, previousState?.turnPlayerName, previousMyTurn]);
    if (turnSignature !== previousTurnSignature) {
      const banner = game.querySelector('#qv2-turn-banner');
      if (banner) banner.outerHTML = renderTurnBanner(myTurn);
      const dock = game.querySelector('.qv2-action-dock');
      if (dock) dock.outerHTML = renderActionDock(myTurn);
      game.classList.toggle('is-my-turn', myTurn);
      game.classList.toggle('is-waiting-turn', !myTurn);
    }

    const playerSignature = JSON.stringify((state.players || []).map((player) => [
      player.playerId, player.name, player.cardsCount, player.quartetsCount, player.connected, player.isActive, player.isHost,
    ]));
    const previousPlayerSignature = JSON.stringify((previousState?.players || []).map((player) => [
      player.playerId, player.name, player.cardsCount, player.quartetsCount, player.connected, player.isActive, player.isHost,
    ]));
    if (playerSignature !== previousPlayerSignature || turnSignature !== previousTurnSignature) {
      const playersSection = game.querySelector('.qv2-players-section');
      const caption = playersSection?.querySelector('.qv2-section-caption');
      if (caption) caption.textContent = myTurn ? 'Шаг 1 · выбери, у кого спросить карту' : ('Сейчас действует ' + (state.turnPlayerName || 'игрок'));
      const meta = playersSection?.querySelector('.qv2-section-meta');
      if (meta) meta.textContent = (state.players || []).filter((player) => player.isActive !== false).length + ' в партии';
      const strip = playersSection?.querySelector('.qv2-score-strip');
      if (strip) strip.innerHTML = (state.players || []).filter((player) => player.isActive !== false).map((player) => renderScorePlayer(player, myTurn)).join('');
    }

    const handSignature = JSON.stringify([me.hand || [], me.completedQuartets || [], me.cardsCount || 0, me.quartetsCount || 0]);
    const previousHandSignature = JSON.stringify([previousMe.hand || [], previousMe.completedQuartets || [], previousMe.cardsCount || 0, previousMe.quartetsCount || 0]);
    if (handSignature !== previousHandSignature) {
      const groupedHand = buildHandGroups(me.hand || []);
      const completed = (me.completedQuartets || []).map((id) => quartetById.get(id)).filter(Boolean);
      const hand = game.querySelector('.qv2-hand-section');
      if (hand) {
        hand.outerHTML = \`<section class="qv2-section qv2-glass qv2-hand-section qv3-hand-table">
          <div class="qv2-section-head">
            <div><h3 class="qv2-section-title">Твоя рука</h3><div class="qv2-section-caption">\${myTurn ? 'Шаг 2 · выбери недостающую карту' : 'Можно заранее продумать следующий запрос'}</div></div>
            <div class="qv2-section-meta">🃏 \${me.cardsCount || 0} · 🏆 \${me.quartetsCount || 0}</div>
          </div>
          \${completed.length ? \`<div class="qv2-completed">\${completed.map((quartet) => \`<span class="qv2-trophy">🏆 \${escapeHtml(quartet.name)}</span>\`).join('')}</div>\` : ''}
          \${renderHandDeck(groupedHand, myTurn)}
        </section>\`;
      }
    } else if (turnSignature !== previousTurnSignature) {
      const handCaption = game.querySelector('.qv2-hand-section .qv2-section-caption');
      if (handCaption) handCaption.textContent = myTurn ? 'Шаг 2 · выбери недостающую карту' : 'Можно заранее продумать следующий запрос';
    }

    const eventSignature = JSON.stringify(state.lastEvent || null);
    const previousEventSignature = JSON.stringify(previousState?.lastEvent || null);
    if (eventSignature !== previousEventSignature) {
      const renderedEvent = renderLastEvent(state.lastEvent, me.playerId);
      let eventNode = game.querySelector(':scope > .qv2-event');
      if (!renderedEvent) eventNode?.remove();
      else {
        const html = \`<div class="qv2-event \${renderedEvent.className}"><span class="qv2-event-icon">\${renderedEvent.icon}</span><span>\${renderedEvent.text}</span></div>\`;
        if (eventNode) eventNode.outerHTML = html;
        else game.querySelector('.qv2-players-section')?.insertAdjacentHTML('afterend', html);
      }
    }

    const logSignature = JSON.stringify(state.log || []);
    const previousLogSignature = JSON.stringify(previousState?.log || []);
    if (logSignature !== previousLogSignature) {
      const activity = game.querySelector('.qv2-activity');
      const list = activity?.querySelector('.qv2-activity-list');
      if (list) list.innerHTML = renderRecentLog();
      const full = activity?.querySelector('.qv2-log-list');
      if (full) full.innerHTML = (state.log || []).slice().reverse().map((item) => \`<div class="qv2-log-item">\${escapeHtml(item)}</div>\`).join('');
    }

    updateSelectionUi();
    updateTurnTimer();
    window.dispatchEvent(new CustomEvent('quartetstatepatch', {
      detail: {
        full: false,
        turnChanged: turnSignature !== previousTurnSignature,
        playersChanged: playerSignature !== previousPlayerSignature,
        handChanged: handSignature !== previousHandSignature,
        eventChanged: eventSignature !== previousEventSignature,
        logChanged: logSignature !== previousLogSignature,
      },
    }));
  }

`;

  function patchQuartetSource(source) {
    if (!source.includes(oldSelectionHandlers)) throw new Error('Quartet V43 selection patch target was not found');
    if (!source.includes(oldStateRender)) throw new Error('Quartet V43 realtime patch target was not found');
    if (!source.includes('  function renderState() {')) throw new Error('Quartet V43 renderer insertion point was not found');
    return source
      .replace(oldSelectionHandlers, newSelectionHandlers)
      .replace(oldStateRender, newStateRender)
      .replace('  function renderState() {', incrementalRenderer + '  function renderState() {')
      .replaceAll('loading="lazy" decoding="async"', 'loading="eager" decoding="async" fetchpriority="high" draggable="false"');
  }

  Node.prototype.appendChild = function patchedAppendChild(child) {
    let url;
    try { url = new URL(child?.src || '', location.href); } catch { url = null; }
    const isQuartetScript = child instanceof HTMLScriptElement && url && quartetScriptPattern.test(url.pathname + url.search);
    if (!isQuartetScript || child.dataset.qv43Bypass === '1') return originalAppendChild.call(this, child);

    const host = this;
    const sourceUrl = child.src;
    fetch(sourceUrl, { cache: 'no-store', credentials: 'same-origin' })
      .then((response) => {
        if (!response.ok) throw new Error(`Quartet source HTTP ${response.status}`);
        return response.text();
      })
      .then((source) => {
        const patchedSource = patchQuartetSource(source);
        const executable = document.createElement('script');
        executable.dataset.qv43Bypass = '1';
        executable.textContent = `${patchedSource}\n//# sourceURL=${sourceUrl.split('?')[0]}?production-v43`;
        originalAppendChild.call(host, executable);
        child.dataset.qv43Virtual = '1';
        queueMicrotask(() => child.onload?.(new Event('load')));
      })
      .catch((error) => {
        console.error('[Quartet V43 production loader]', error);
        child.onerror?.(new Event('error'));
      });

    return child;
  };
})();
