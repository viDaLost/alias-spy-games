(() => {
  'use strict';

  // Сброс прогресса.
  //
  // Сброс идёт по одной игре или сразу по всем. Звёзды при этом остаются: их
  // заработали, а не выдали за уровни, и отбирать их никто не просил.
  //
  // Очки рейтинга откатываются. Обычная синхронизация поднимает счёт и никогда
  // не опускает — снимок с меньшим прогрессом сервер считает вторым устройством,
  // а не потерей достижений. Поэтому у сброса отдельное действие ratingReset,
  // которое пересчитывает очки по свежему снимку вниз.
  //
  // Словесные игры после сброса пересобираются: слова перераспределяются между
  // уровнями, уровни «Поиска слов» идут в новом порядке. Иначе «начать заново»
  // означало бы пройти то же самое второй раз.

  const escapeHTML = (value) => String(value ?? '')
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#39;');

  function userId() {
    const values = [window.Telegram?.WebApp?.initDataUnsafe?.user?.id, window.__ANDROID_TELEGRAM_ID__];
    for (const value of values) {
      const id = String(value ?? '').trim();
      if (/^\d{5,20}$/.test(id)) return id;
    }
    return 'anon';
  }

  const readJson = (key, fallback) => {
    try {
      const raw = localStorage.getItem(key);
      return raw == null ? fallback : (JSON.parse(raw) ?? fallback);
    } catch { return fallback; }
  };

  const drop = (key) => { try { localStorage.removeItem(key); } catch { /* приватный режим */ } };

  /** «1 уровень», «3 уровня», «7 уровней» — иначе экран читается как машинный. */
  function plural(count, one, few, many) {
    const rest100 = count % 100;
    if (rest100 >= 11 && rest100 <= 14) return `${count} ${many}`;
    const rest10 = count % 10;
    if (rest10 === 1) return `${count} ${one}`;
    if (rest10 >= 2 && rest10 <= 4) return `${count} ${few}`;
    return `${count} ${many}`;
  }

  const levelsWord = (count) => plural(count, 'уровень', 'уровня', 'уровней');

  // --- что именно сбрасывается ---------------------------------------------------

  const GAMES = [
    {
      key: 'biblical-match-three',
      title: 'Библейские сокровища',
      icon: 'web/assets/icons/biblical-treasures-v38.webp',
      keys: () => [`biblical_match_three_progress_v2_${userId()}`],
      progress() {
        const state = readJson(`biblical_match_three_progress_v2_${userId()}`, {});
        const ratings = state?.levelRatings && typeof state.levelRatings === 'object' ? state.levelRatings : {};
        const levels = Object.keys(ratings).length;
        const stars = Object.values(ratings).reduce((sum, value) => sum + (Number(value) || 0), 0);
        return levels
          ? `${levelsWord(levels)}, ${plural(stars, 'звезда', 'звезды', 'звёзд')}`
          : 'ничего не пройдено';
      },
      note: 'Уровни, звёзды за них и рекорды свободной игры. Кошелёк со звёздами останется.',
    },
    {
      key: 'bible-wow',
      title: 'Библейские слова',
      icon: 'web/assets/icons/words.webp',
      keys: () => ['bibleWowCompleted', 'bibleWowBonusByLevel', 'bibleWowProgressByLevel_v1'],
      // Монеты лежат в одном ключе с номером уровня, поэтому ключ не удаляется,
      // а переписывается: уровень в начало, монеты на месте.
      after() {
        const data = readJson('bibleWowData_v5', {});
        try { localStorage.setItem('bibleWowData_v5', JSON.stringify({ ...data, levelIndex: 0 })); } catch { /* приватный режим */ }
        window.WordGameShuffle?.reshuffle('wow');
      },
      progress() {
        const done = readJson('bibleWowCompleted', []);
        const count = Array.isArray(done) ? new Set(done.map(Number).filter(Number.isFinite)).size : 0;
        return count ? `пройдено ${levelsWord(count)}` : 'ничего не пройдено';
      },
      note: 'После сброса слова перераспределятся между уровнями — набор букв тот же, слова другие.',
    },
    {
      key: 'bible-wordsearch',
      title: 'Поиск библейских слов',
      icon: 'web/assets/icons/search.webp',
      keys: () => [`bible_wordsearch_progress_v2_${userId()}`],
      after() { window.WordGameShuffle?.reshuffle('ws'); },
      progress() {
        const state = readJson(`bible_wordsearch_progress_v2_${userId()}`, {});
        const done = state?.completed && typeof state.completed === 'object' ? state.completed : {};
        const count = Object.values(done).filter(Boolean).length;
        return count ? `пройдено ${levelsWord(count)}` : 'ничего не пройдено';
      },
      note: 'Уровни пойдут в новом порядке, а сетки букв игра разложит заново.',
    },
    {
      key: 'sacred-word',
      title: 'Священное слово',
      icon: 'web/assets/icons/sacred.webp',
      keys: () => [`sacred_word_levels_v4_${userId()}`],
      progress() {
        const state = readJson(`sacred_word_levels_v4_${userId()}`, {});
        const level = Number(state?.level || 0);
        return level > 0 ? `уровень ${level + 1}` : 'ничего не пройдено';
      },
      note: 'Игра начнётся с первого слова.',
    },
    {
      key: 'kids-ark-pairs',
      title: 'Найди пару',
      icon: 'web/assets/icons/ark.webp',
      keys: () => ['kids_ark_pairs_records_v1', 'kids_ark_pairs_stats_v2'],
      progress() {
        const records = readJson('kids_ark_pairs_records_v1', {});
        const count = records && typeof records === 'object' ? Object.keys(records).length : 0;
        return count ? plural(count, 'рекорд', 'рекорда', 'рекордов') : 'рекордов нет';
      },
      note: 'Рекорды на скорость и счётчик партий.',
    },
  ];

  const BY_KEY = new Map(GAMES.map((game) => [game.key, game]));

  // --- рейтинг --------------------------------------------------------------------

  async function rollbackRating() {
    if (typeof window.apiRequest !== 'function' || typeof window.LeaderboardSnapshot !== 'function') return null;
    try {
      const result = await window.apiRequest({ action: 'ratingReset', snapshot: window.LeaderboardSnapshot() });
      if (!result || result.success === false) return null;
      return result;
    } catch { return null; }
  }

  async function reset(keys) {
    const games = keys.map((key) => BY_KEY.get(key)).filter(Boolean);
    for (const game of games) {
      game.keys().forEach(drop);
      game.after?.();
    }
    const rating = await rollbackRating();
    window.dispatchEvent(new CustomEvent('app:progress-reset', { detail: { games: games.map((game) => game.key) } }));
    return rating;
  }

  // --- экран ------------------------------------------------------------------------

  function container() { return document.getElementById('game-container'); }

  function close() {
    const root = container();
    if (root) root.innerHTML = '';
    delete document.body.dataset.mode;
    document.getElementById('menu-container')?.classList.remove('hidden');
    window.scrollTo({ top: 0, behavior: 'auto' });
  }

  function cardMarkup(game) {
    return `
      <article class="pr-game" data-reset-game="${escapeHTML(game.key)}">
        <img class="pr-game__icon" src="${escapeHTML(game.icon)}" alt="" loading="lazy" decoding="async" draggable="false" />
        <div class="pr-game__body">
          <strong>${escapeHTML(game.title)}</strong>
          <small class="pr-game__progress">${escapeHTML(game.progress())}</small>
          <small class="pr-game__note">${escapeHTML(game.note)}</small>
        </div>
        <button type="button" class="pr-game__button" data-reset-one>Сбросить</button>
      </article>`;
  }

  function screenMarkup() {
    return `
      <section class="pr-shell">
        <div class="pr-topbar">
          <button type="button" class="pr-back" data-reset-back aria-label="Назад">←</button>
          <div>
            <p class="pr-kicker">Прогресс</p>
            <h2 class="pr-title">Начать заново</h2>
          </div>
        </div>
        <p class="pr-lead">
          Сброс убирает пройденные уровни и <b>откатывает очки рейтинга</b> за них.
          Заработанные звёзды остаются — их не отбираем.
        </p>
        <div class="pr-list">${GAMES.map(cardMarkup).join('')}</div>
        <button type="button" class="pr-all" data-reset-all>Сбросить всё</button>
        <p class="pr-fine">Отменить сброс нельзя. Прогресс хранится на этом устройстве, поэтому на других он останется, пока они не синхронизируются.</p>
      </section>`;
  }

  function confirmMarkup(title, text) {
    return `
      <div class="pr-confirm" data-reset-confirm>
        <div class="pr-confirm__card">
          <h3>${escapeHTML(title)}</h3>
          <p>${escapeHTML(text)}</p>
          <div class="pr-confirm__actions">
            <button type="button" class="pr-confirm__cancel" data-reset-cancel>Отмена</button>
            <button type="button" class="pr-confirm__ok" data-reset-confirm-ok>Сбросить</button>
          </div>
        </div>
      </div>`;
  }

  function toast(message) {
    if (typeof window.showToast === 'function') { window.showToast(message); return; }
    document.querySelector('.pr-toast')?.remove();
    const node = document.createElement('div');
    node.className = 'pr-toast';
    node.textContent = message;
    document.body.append(node);
    setTimeout(() => node.remove(), 3200);
  }

  function repaint() {
    const root = container();
    if (!root || !root.querySelector('.pr-shell')) return;
    root.querySelectorAll('[data-reset-game]').forEach((node) => {
      const game = BY_KEY.get(node.dataset.resetGame);
      const label = node.querySelector('.pr-game__progress');
      if (game && label) label.textContent = game.progress();
    });
  }

  function ask(title, text) {
    return new Promise((resolve) => {
      const root = container();
      if (!root) { resolve(false); return; }
      root.insertAdjacentHTML('beforeend', confirmMarkup(title, text));
      const overlay = root.querySelector('[data-reset-confirm]');
      const finish = (value) => { overlay?.remove(); resolve(value); };
      overlay?.addEventListener('click', (event) => {
        if (event.target.closest('[data-reset-confirm-ok]')) finish(true);
        else if (event.target.closest('[data-reset-cancel]') || event.target === overlay) finish(false);
      });
    });
  }

  async function run(keys, title, text) {
    if (!(await ask(title, text))) return;
    const rating = await reset(keys);
    repaint();
    if (rating && Number(rating.removed) > 0) toast(`Сброшено. Из рейтинга ушло ${rating.removed} очков`);
    else if (rating) toast('Сброшено, рейтинг пересчитан');
    else toast('Сброшено. Рейтинг пересчитается, когда появится связь');
  }

  function open() {
    const root = container();
    if (!root) return;
    document.getElementById('menu-container')?.classList.add('hidden');
    document.body.dataset.mode = 'reset';
    root.innerHTML = screenMarkup();
    window.scrollTo({ top: 0, behavior: 'auto' });

    root.querySelector('[data-reset-back]')?.addEventListener('click', close);
    root.addEventListener('click', (event) => {
      const one = event.target.closest('[data-reset-one]');
      if (one) {
        const card = one.closest('[data-reset-game]');
        const game = BY_KEY.get(card?.dataset.resetGame || '');
        if (game) run([game.key], `Сбросить «${game.title}»?`, `${game.note} Очки рейтинга за пройденные уровни этой игры вернутся к нулю.`);
        return;
      }
      if (event.target.closest('[data-reset-all]')) {
        run(GAMES.map((game) => game.key), 'Сбросить весь прогресс?',
          'Все пройденные уровни всех игр будут забыты, а очки рейтинга пересчитаны с нуля. Звёзды останутся.');
      }
    });
  }

  window.openProgressReset = open;
  window.ProgressReset = { reset, games: () => GAMES.map((game) => game.key) };
})();
