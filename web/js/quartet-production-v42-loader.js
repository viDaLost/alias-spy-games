(() => {
  'use strict';
  if (window.__QUARTET_PRODUCTION_V42_LOADER__) return;
  window.__QUARTET_PRODUCTION_V42_LOADER__ = true;

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

    const steps = [...(ui.root?.querySelectorAll('.qv3-step') || [])];
    if (steps[0]) {
      steps[0].classList.toggle('is-done', !!target);
      steps[0].classList.toggle('is-active', !target);
      const strong = steps[0].querySelector('strong');
      if (strong) strong.textContent = target?.name || 'Выберите';
    }
    if (steps[1]) {
      steps[1].classList.toggle('is-done', !!card);
      steps[1].classList.toggle('is-active', !!target && !card);
      const strong = steps[1].querySelector('strong');
      if (strong) strong.textContent = card?.title || 'Выберите';
    }
    if (steps[2]) {
      steps[2].classList.toggle('is-active', ready);
      const strong = steps[2].querySelector('strong');
      if (strong) strong.textContent = ready ? 'Готов' : 'Подтвердить';
    }

    window.dispatchEvent(new CustomEvent('quartetselectionchange', {
      detail: { targetId: selectedTargetId, cardId: selectedCardId },
    }));
  }
`;

  function patchQuartetSource(source) {
    if (!source.includes(oldSelectionHandlers)) {
      throw new Error('Quartet V4.2 production patch target was not found');
    }
    return source
      .replace(oldSelectionHandlers, newSelectionHandlers)
      .replaceAll('loading="lazy" decoding="async"', 'loading="eager" decoding="async" fetchpriority="high" draggable="false"');
  }

  Node.prototype.appendChild = function patchedAppendChild(child) {
    const isQuartetScript = child instanceof HTMLScriptElement && quartetScriptPattern.test(new URL(child.src || '', location.href).pathname + new URL(child.src || '', location.href).search);
    if (!isQuartetScript || child.dataset.qv42Bypass === '1') {
      return originalAppendChild.call(this, child);
    }

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
        executable.dataset.qv42Bypass = '1';
        executable.textContent = `${patchedSource}\n//# sourceURL=${sourceUrl.split('?')[0]}?production-v42`;
        originalAppendChild.call(host, executable);
        child.dataset.qv42Virtual = '1';
        queueMicrotask(() => child.onload?.(new Event('load')));
      })
      .catch((error) => {
        console.error('[Quartet V4.2 production loader]', error);
        child.onerror?.(new Event('error'));
      });

    return child;
  };
})();
