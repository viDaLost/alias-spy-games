(() => {
  const GAMES = {
    'Алиас': { key: 'alias', desc: 'Объясняй слова на скорость', icon: 'alias' },
    'Соображариум': { key: 'coimaginarium', desc: 'Ассоциации и быстрые идеи', icon: 'idea' },
    'Угадай персонажа': { key: 'guess', desc: 'Вопросы, версии, логика', icon: 'character' },
    'Опиши, но не называй': { key: 'describe', desc: 'Подсказки без прямого ответа', icon: 'describe' },
    'Шпион': { key: 'spy', desc: 'Секретная роль и локация', icon: 'spy' },
    'Квартет': { key: 'quartet', desc: 'Собери четыре связанные карты', icon: 'quartet' },
    'Библейские слова': { key: 'bible-wow', desc: 'Собери слова из букв', icon: 'words' },
    'Поиск библейских слов': { key: 'bible-wordsearch', desc: 'Найди скрытые слова', icon: 'search' },
    'Священное слово': { key: 'sacred-word', desc: 'Открой слово по подсказкам', icon: 'sacred' },
    'Найди пару': { key: 'kids-ark-pairs', desc: 'Память, пары и ковчег', icon: 'ark' },
  };

  const ICON_VERSION = '1';
  const ICONS = {
    alias: `assets/icons/alias.png?v=${ICON_VERSION}`, idea: `assets/icons/idea.png?v=${ICON_VERSION}`,
    character: `assets/icons/character.png?v=${ICON_VERSION}`, describe: `assets/icons/describe.png?v=${ICON_VERSION}`,
    spy: `assets/icons/spy.png?v=${ICON_VERSION}`, quartet: `assets/icons/quartet.png?v=${ICON_VERSION}`,
    words: `assets/icons/words.png?v=${ICON_VERSION}`, search: `assets/icons/search.png?v=${ICON_VERSION}`,
    sacred: `assets/icons/sacred.png?v=${ICON_VERSION}`, ark: `assets/icons/ark.png?v=${ICON_VERSION}`,
  };

  const HIDDEN_KEY = 'home_hidden_sections_v1';
  const ALLOWED_HIDDEN = new Set(['continue', 'recent', 'progress']);
  let lastSignature = '';
  let scheduled = 0;

  function history() {
    try {
      const value = JSON.parse(localStorage.getItem('last_games_history') || '[]');
      return Array.isArray(value) ? value.filter((title) => GAMES[title]).slice(0, 3) : [];
    } catch {
      return [];
    }
  }

  function hiddenSections() {
    try {
      const value = JSON.parse(localStorage.getItem(HIDDEN_KEY) || '[]');
      return new Set(Array.isArray(value) ? value.filter((key) => ALLOWED_HIDDEN.has(key)) : []);
    } catch {
      return new Set();
    }
  }

  function userId() {
    return String(window.Telegram?.WebApp?.initDataUnsafe?.user?.id || 'anon');
  }

  function progress() {
    let wow = 20;
    let search = 0;
    let sacred = 0;
    try {
      const data = JSON.parse(localStorage.getItem('bibleWowData_v5') || '{}');
      wow = Number.isFinite(Number(data.coins)) ? Number(data.coins) : 20;
    } catch {}
    try { search = Number(localStorage.getItem(`bible_stars_v1_${userId()}`) || 0) || 0; } catch {}
    try {
      const state = JSON.parse(localStorage.getItem(`sacred_word_levels_v4_${userId()}`) || '{}');
      sacred = Number(state.level || 0) || 0;
    } catch {}
    return { wow, search, sacred };
  }

  function hiddenClass(hidden, key) {
    return hidden.has(key) ? ' home-user-hidden' : '';
  }

  function openGame(title) {
    const game = GAMES[title];
    if (!game || typeof window.showGame !== 'function') return;
    window.showGame(game.key);
  }

  function render() {
    const menu = document.getElementById('menu-container');
    if (!menu || document.body.dataset.mode) return;

    const recent = history();
    const p = progress();
    const hidden = hiddenSections();
    const signature = JSON.stringify({ recent, p, hidden: [...hidden].sort() });
    const existing = document.getElementById('home-dashboard');
    if (existing && signature === lastSignature && existing.dataset.contentReady === '1') return;
    lastSignature = signature;

    const dashboard = existing || document.createElement('section');
    dashboard.id = 'home-dashboard';
    dashboard.className = 'home-dashboard';
    dashboard.dataset.contentReady = '0';
    delete dashboard.dataset.controlsReady;

    const latest = recent[0] ? GAMES[recent[0]] : null;
    const continueHtml = latest ? `
      <button type="button" class="home-continue${hiddenClass(hidden, 'continue')}" data-home-game="${escapeAttr(recent[0])}">
        <span class="home-continue__icon"><img src="${ICONS[latest.icon]}" alt="" loading="eager" decoding="async" fetchpriority="high"></span>
        <span class="home-continue__body">
          <span class="home-continue__eyebrow">Продолжить</span>
          <strong class="home-continue__title">${escapeText(recent[0])}</strong>
          <span class="home-continue__desc">${escapeText(latest.desc)}</span>
        </span>
        <span class="home-continue__arrow" aria-hidden="true">→</span>
      </button>
    ` : '';

    const recentHtml = recent.length ? `
      <div class="home-dashboard__label home-dashboard__label--recent${hiddenClass(hidden, 'recent')}">Недавние игры</div>
      <div class="home-recent${hiddenClass(hidden, 'recent')}">
        ${recent.map((title) => `<button type="button" class="home-recent__item" data-home-game="${escapeAttr(title)}">${escapeText(title)}</button>`).join('')}
      </div>
    ` : '';

    dashboard.innerHTML = `
      ${continueHtml}
      ${recentHtml}
      <div class="home-dashboard__label home-dashboard__label--progress${hiddenClass(hidden, 'progress')}">Ваш прогресс</div>
      <div class="home-progress${hiddenClass(hidden, 'progress')}" aria-label="Прогресс в словесных играх">
        <div class="home-progress__item"><strong class="home-progress__value">${Math.max(0, Math.round(p.wow))} ⭐</strong><span class="home-progress__name">Библейские слова</span></div>
        <div class="home-progress__item"><strong class="home-progress__value">${Math.max(0, Math.round(p.search))} ⭐</strong><span class="home-progress__name">Поиск слов</span></div>
        <div class="home-progress__item"><strong class="home-progress__value">${Math.max(0, Math.round(p.sacred))}</strong><span class="home-progress__name">Уровень «Священного слова»</span></div>
      </div>
    `;

    dashboard.querySelectorAll('[data-home-game]').forEach((button) => {
      button.addEventListener('click', () => openGame(button.dataset.homeGame || ''));
    });

    if (!existing) menu.prepend(dashboard);
    dashboard.dataset.contentReady = '1';
    window.__homeControlsApply?.();
    window.dispatchEvent(new CustomEvent('app:home-dashboard-ready'));
  }

  function scheduleRender() {
    if (scheduled) cancelAnimationFrame(scheduled);
    scheduled = requestAnimationFrame(() => {
      scheduled = 0;
      render();
    });
  }

  function escapeText(value) {
    return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  }

  function escapeAttr(value) {
    return escapeText(value);
  }

  const observer = new MutationObserver(scheduleRender);
  observer.observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ['class', 'data-mode'] });
  window.addEventListener('pageshow', scheduleRender);
  render();
})();
