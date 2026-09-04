(() => {
  'use strict';

  const MIN_VISIBLE_MS = 460;
  const EXIT_MS = 260;
  const READY_POLL_MS = 90;
  const SOFT_STATUS_MS = 2200;
  const MAX_VISIBLE_MS = 9000;

  const GAMES = Object.freeze({
    alias: {
      title: 'Алиас', eyebrow: 'Игра на скорость', status: 'Перемешиваем слова…', status2: 'Запускаем таймер…',
      icon: 'web/assets/icons/alias.webp?v=1', motif: 'alias',
    },
    coimaginarium: {
      title: 'Соображариум', eyebrow: 'Игра идей', status: 'Зажигаем идеи…', status2: 'Готовим ассоциации…',
      icon: 'web/assets/icons/idea.webp?v=1', motif: 'coimaginarium',
    },
    guess: {
      title: 'Угадай персонажа', eyebrow: 'Игра вопросов', status: 'Выбираем персонажа…', status2: 'Готовим подсказки…',
      icon: 'web/assets/icons/character.webp?v=1', motif: 'guess',
    },
    describe: {
      title: 'Опиши, но не называй', eyebrow: 'Игра подсказок', status: 'Готовим слова…', status2: 'Настраиваем подсказки…',
      icon: 'web/assets/icons/describe.webp?v=1', motif: 'describe',
    },
    spy: {
      title: 'Шпион', eyebrow: 'Секретная игра', status: 'Шифруем роли…', status2: 'Выбираем тайную локацию…',
      icon: 'web/assets/icons/spy.webp?v=1', motif: 'spy',
    },
    quartet: {
      title: 'Квартет', eyebrow: 'Карточная игра', status: 'Тасуем колоду…', status2: 'Раздаём карты…',
      icon: 'web/assets/icons/quartet.webp?v=1', motif: 'quartet',
    },
    'bible-sketch': {
      title: 'Библейский художник', eyebrow: 'Рисуй и угадывай', status: 'Готовим холст…', status2: 'Затачиваем карандаши…',
      icon: 'web/assets/icons/bible-sketch.webp?v=3', motif: 'bible-sketch',
    },
    'bible-wow': {
      title: 'Библейские слова', eyebrow: 'Игра со словами', status: 'Собираем буквы…', status2: 'Готовим уровень…',
      icon: 'web/assets/icons/words.webp?v=1', motif: 'bible-wow',
    },
    'bible-wordsearch': {
      title: 'Поиск библейских слов', eyebrow: 'Найди скрытое', status: 'Строим сетку…', status2: 'Прячем слова…',
      icon: 'web/assets/icons/search.webp?v=1', motif: 'bible-wordsearch',
    },
    'sacred-word': {
      title: 'Священное слово', eyebrow: 'Открой слово', status: 'Зажигаем свет подсказок…', status2: 'Готовим загадку…',
      icon: 'web/assets/icons/sacred.webp?v=1', motif: 'sacred-word',
    },
    'kids-ark-pairs': {
      title: 'Найди пару', eyebrow: 'Игра на память', status: 'Перемешиваем пары…', status2: 'Прячем карточки…',
      icon: 'web/assets/icons/ark.webp?v=1', motif: 'kids-ark-pairs',
    },
    'biblical-match-three': {
      title: 'Библейские сокровища', eyebrow: 'Собирай сокровища', status: 'Открываем сокровищницу…', status2: 'Расставляем драгоценности…',
      icon: 'web/assets/icons/biblical-treasures-v38.webp?v=39', motif: 'biblical-match-three',
    },
    'moses-nile': {
      title: 'Моисей: Путь по Нилу', eyebrow: 'Бегущая по реке', status: 'Наполняем русло…', status2: 'Расставляем заросли…',
      icon: 'web/assets/icons/moses-nile.webp?v=1', motif: 'moses-nile',
    },
  });

  const motifHTML = Object.freeze({
    alias: '<span class="gel-chip">СЛОВО</span><span class="gel-chip">ВРЕМЯ</span><span class="gel-chip">+1</span>',
    coimaginarium: '<span class="gel-spark"></span><span class="gel-spark"></span><span class="gel-spark"></span><span class="gel-spark"></span>',
    guess: '<span class="gel-question">?</span><span class="gel-question">?</span><span class="gel-question">?</span>',
    describe: '<span class="gel-bubble"></span><span class="gel-bubble"></span>',
    spy: '<span class="gel-radar"></span>',
    quartet: '<span class="gel-card"></span><span class="gel-card"></span><span class="gel-card"></span><span class="gel-card"></span>',
    'bible-sketch': '<span class="gel-brush"></span><span class="gel-brush"></span>',
    'bible-wow': '<span class="gel-letter">А</span><span class="gel-letter">Ω</span><span class="gel-letter">Б</span>',
    'bible-wordsearch': '<span class="gel-grid"></span>',
    'sacred-word': '<span class="gel-rays"></span>',
    'kids-ark-pairs': '<span class="gel-tile">✦</span><span class="gel-tile">✦</span><span class="gel-tile">◆</span><span class="gel-tile">◆</span>',
    'biblical-match-three': '<span class="gel-gem"></span><span class="gel-gem"></span><span class="gel-gem"></span><span class="gel-gem"></span>',
    'moses-nile': '<span class="gel-spark"></span><span class="gel-spark"></span><span class="gel-spark"></span>',
  });

  let root = null;
  let activeKey = '';
  let startedAt = 0;
  let baseline = '';
  let mutationSeen = false;
  let containerObserver = null;
  let bodyObserver = null;
  let pollTimer = 0;
  let statusTimer = 0;
  let maxTimer = 0;
  let exitTimer = 0;

  function getContainer() {
    return document.getElementById('game-container');
  }

  function normalizeKey(value) {
    const key = String(value || '').trim();
    return Object.prototype.hasOwnProperty.call(GAMES, key) ? key : '';
  }

  function ensureRoot() {
    if (root?.isConnected) return root;
    root = document.getElementById('game-entry-loader');
    if (root) return root;

    root = document.createElement('div');
    root.id = 'game-entry-loader';
    root.className = 'game-entry-loader';
    root.setAttribute('role', 'status');
    root.setAttribute('aria-live', 'polite');
    root.setAttribute('aria-hidden', 'true');
    document.body.appendChild(root);
    return root;
  }

  function render(key) {
    const config = GAMES[key];
    const el = ensureRoot();
    el.dataset.game = key;
    el.innerHTML = `
      <div class="game-entry-loader__bg" aria-hidden="true"></div>
      <div class="game-entry-loader__scene">
        <div class="game-entry-loader__motif" aria-hidden="true">${motifHTML[config.motif] || ''}</div>
        <div class="game-entry-loader__hero" aria-hidden="true">
          <div class="game-entry-loader__ring"></div>
          <div class="game-entry-loader__icon-shell">
            <img class="game-entry-loader__icon" src="${config.icon}" alt="" decoding="async" draggable="false" />
          </div>
        </div>
        <p class="game-entry-loader__eyebrow">${config.eyebrow}</p>
        <h2 class="game-entry-loader__title">${config.title}</h2>
        <p class="game-entry-loader__status" data-game-entry-status>${config.status}</p>
        <div class="game-entry-loader__progress" aria-hidden="true"></div>
      </div>`;
    return el;
  }

  function clearRuntimeTimers() {
    if (pollTimer) window.clearInterval(pollTimer);
    if (statusTimer) window.clearTimeout(statusTimer);
    if (maxTimer) window.clearTimeout(maxTimer);
    if (exitTimer) window.clearTimeout(exitTimer);
    pollTimer = statusTimer = maxTimer = exitTimer = 0;
  }

  function disconnectContainerObserver() {
    containerObserver?.disconnect();
    containerObserver = null;
  }

  function looksReady(key) {
    if (!activeKey || key !== activeKey) return false;
    const container = getContainer();
    if (!container) return false;
    const currentKey = normalizeKey(document.body?.dataset?.currentGame);
    if (currentKey && currentKey !== key) return false;
    if (container.querySelector('.app-game-loading')) return false;
    if (!container.childElementCount) return false;

    const html = container.innerHTML;
    const changed = mutationSeen || html !== baseline;
    if (!changed) return false;

    const text = String(container.textContent || '').trim();
    const hasRenderable = Boolean(container.querySelector('section,main,canvas,button,.game-screen,.quartet-game,.bmt-shell,.bible-sketch-app')) || text.length > 8;
    return hasRenderable;
  }

  function finish(key = activeKey, immediate = false) {
    key = normalizeKey(key);
    if (!key || key !== activeKey || !root) return;
    const elapsed = performance.now() - startedAt;
    const delay = immediate ? 0 : Math.max(0, MIN_VISIBLE_MS - elapsed);

    if (exitTimer) return;
    exitTimer = window.setTimeout(() => {
      exitTimer = 0;
      if (!root || activeKey !== key) return;
      root.classList.add('is-leaving');
      root.classList.remove('is-active');
      root.setAttribute('aria-hidden', 'true');
      document.documentElement.classList.remove('game-entry-loading');
      window.setTimeout(() => {
        if (activeKey === key) activeKey = '';
        disconnectContainerObserver();
        clearRuntimeTimers();
      }, EXIT_MS + 30);
    }, delay);
  }

  function monitor(key) {
    disconnectContainerObserver();
    const container = getContainer();
    if (!container) return;

    containerObserver = new MutationObserver(() => {
      mutationSeen = true;
      if (looksReady(key)) finish(key);
    });
    containerObserver.observe(container, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'data-state'] });

    pollTimer = window.setInterval(() => {
      if (activeKey !== key) return;
      const bodyKey = normalizeKey(document.body?.dataset?.currentGame);
      const mode = String(document.body?.dataset?.mode || '');
      if ((!bodyKey && mode !== 'game') || (bodyKey && bodyKey !== key)) {
        finish(key, true);
        return;
      }
      if (looksReady(key)) finish(key);
    }, READY_POLL_MS);
  }

  function show(rawKey) {
    const key = normalizeKey(rawKey);
    if (!key) return false;

    clearRuntimeTimers();
    disconnectContainerObserver();
    activeKey = key;
    startedAt = performance.now();
    mutationSeen = false;
    baseline = getContainer()?.innerHTML || '';

    const el = render(key);
    el.classList.remove('is-leaving');
    el.setAttribute('aria-hidden', 'false');
    document.documentElement.classList.add('game-entry-loading');

    requestAnimationFrame(() => {
      if (activeKey === key) el.classList.add('is-active');
    });

    monitor(key);

    statusTimer = window.setTimeout(() => {
      if (activeKey !== key || !root) return;
      const status = root.querySelector('[data-game-entry-status]');
      if (status) status.textContent = GAMES[key].status2;
    }, SOFT_STATUS_MS);

    maxTimer = window.setTimeout(() => {
      if (activeKey !== key) return;
      // Never strand the user behind our visual overlay. The game's own loading/error
      // state remains underneath and becomes visible if startup takes unusually long.
      finish(key, true);
    }, MAX_VISIBLE_MS);

    return true;
  }

  function inferFromElement(target) {
    if (!(target instanceof Element)) return '';
    const card = target.closest('[data-game-key],#biblical-match-three-card,#bible-sketch-card,.game-card[onclick*="showGame"]');
    if (!card) return '';

    const explicit = normalizeKey(card.dataset?.gameKey);
    if (explicit) return explicit;
    if (card.id === 'biblical-match-three-card') return 'biblical-match-three';
    if (card.id === 'bible-sketch-card') return 'bible-sketch';

    const onclick = String(card.getAttribute('onclick') || '');
    const match = onclick.match(/showGame\(\s*['\"]([^'\"]+)['\"]\s*\)/);
    return normalizeKey(match?.[1]);
  }

  function handleGameIntent(event) {
    const key = inferFromElement(event.target);
    if (key) show(key);
  }

  function watchBodyGame() {
    bodyObserver?.disconnect();
    bodyObserver = new MutationObserver(() => {
      const key = normalizeKey(document.body?.dataset?.currentGame);
      const mode = String(document.body?.dataset?.mode || '');
      if (key && mode === 'game') {
        if (activeKey !== key) show(key);
      } else if (activeKey) {
        finish(activeKey, true);
      }
    });
    bodyObserver.observe(document.body, { attributes: true, attributeFilter: ['data-current-game', 'data-mode'] });
  }

  function init() {
    ensureRoot();
    document.addEventListener('click', handleGameIntent, true);
    watchBodyGame();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();

  window.GameEntryLoader = Object.freeze({
    show,
    finish,
    get activeGame() { return activeKey; },
    games: Object.keys(GAMES),
  });
})();
