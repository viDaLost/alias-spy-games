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

  const ICONS = {
    alias: 'assets/icons/alias.png', idea: 'assets/icons/idea.png', character: 'assets/icons/character.png',
    describe: 'assets/icons/describe.png', spy: 'assets/icons/spy.png', quartet: 'assets/icons/quartet.png',
    words: 'assets/icons/words.png', search: 'assets/icons/search.png', sacred: 'assets/icons/sacred.png', ark: 'assets/icons/ark.png',
  };

  let lastSignature = '';
  let scheduled = null;

  function history() {
    try {
      const value = JSON.parse(localStorage.getItem('last_games_history') || '[]');
      return Array.isArray(value) ? value.filter((title) => GAMES[title]).slice(0, 3) : [];
    } catch {
      return [];
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

  function openGame(title) {
    const game = GAMES[title];
    if (!game || typeof window.showGame !== 'function') return;
    window.showGame(game.key);
  }

  function render() {
    const menu = document.getElementById('menu-container');
    if (!menu || menu.classList.contains('hidden') || document.body.dataset.mode) return;

    const recent = history();
    const p = progress();
    const signature = JSON.stringify({ recent, p });
    const existing = document.getElementById('home-dashboard');
    if (existing && signature === lastSignature) return;
    lastSignature = signature;

    const dashboard = existing || document.createElement('section');
    dashboard.id = 'home-dashboard';
    dashboard.className = 'home-dashboard';

    const latest = recent[0] ? GAMES[recent[0]] : null;
    const continueHtml = latest ? `
      <button type="button" class="home-continue" data-home-game="${escapeAttr(recent[0])}">
        <span class="home-continue__icon"><img src="${ICONS[latest.icon]}" alt="" loading="eager" decoding="async"></span>
        <span class="home-continue__body">
          <span class="home-continue__eyebrow">Продолжить</span>
          <strong class="home-continue__title">${escapeText(recent[0])}</strong>
          <span class="home-continue__desc">${escapeText(latest.desc)}</span>
        </span>
        <span class="home-continue__arrow" aria-hidden="true">→</span>
      </button>
    ` : '';

    const recentHtml = recent.length ? `
      <div class="home-dashboard__label">Недавние игры</div>
      <div class="home-recent">
        ${recent.map((title) => `<button type="button" class="home-recent__item" data-home-game="${escapeAttr(title)}">${escapeText(title)}</button>`).join('')}
      </div>
    ` : '';

    dashboard.innerHTML = `
      ${continueHtml}
      ${recentHtml}
      <div class="home-dashboard__label">Ваш прогресс</div>
      <div class="home-progress" aria-label="Прогресс в словесных играх">
        <div class="home-progress__item"><strong class="home-progress__value">${Math.max(0, Math.round(p.wow))} ⭐</strong><span class="home-progress__name">Библейские слова</span></div>
        <div class="home-progress__item"><strong class="home-progress__value">${Math.max(0, Math.round(p.search))} ⭐</strong><span class="home-progress__name">Поиск слов</span></div>
        <div class="home-progress__item"><strong class="home-progress__value">${Math.max(0, Math.round(p.sacred))}</strong><span class="home-progress__name">Уровень «Священного слова»</span></div>
      </div>
    `;

    dashboard.querySelectorAll('[data-home-game]').forEach((button) => {
      button.addEventListener('click', () => openGame(button.dataset.homeGame || ''));
    });

    if (!existing) menu.prepend(dashboard);
  }

  function scheduleRender() {
    clearTimeout(scheduled);
    scheduled = setTimeout(render, 60);
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
  scheduleRender();
})();
