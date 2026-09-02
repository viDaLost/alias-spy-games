(() => {
  'use strict';

  // Рейтинг игроков.
  //
  // Участие добровольное и по умолчанию выключено: пока человек не нажал
  // «Опубликовать», его нет ни в одном списке. Свои очки он видит сразу — иначе
  // непонятно, на что соглашаешься.
  //
  // Очки считает сервер. Отсюда уходит только снимок пройденного: сколько
  // уровней закрыто и сколько звёзд набрано. Формулу клиент не знает и подставить
  // себе счёт не может.

  const STORAGE_SEEN = 'leaderboard_intro_seen_v1';
  const STORAGE_NEWS = 'leaderboard_news_seen_v1';
  const COUNT_MS = 1400;
  const MENU_ICON = 'web/assets/icons/rating.webp?v=1';

  const GAME_ORDER = [
    ['bmt', 'Библейские сокровища', 'уровней'],
    ['ws', 'Поиск библейских слов', 'уровней'],
    ['wow', 'Библейские слова', 'уровней'],
    ['sacred', 'Священное слово', 'уровень'],
  ];

  const escapeHTML = (value) => String(value ?? '')
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#39;');

  function userId() {
    const values = [window.Telegram?.WebApp?.initDataUnsafe?.user?.id, window.__ANDROID_TELEGRAM_ID__];
    for (const value of values) {
      const id = String(value ?? '').trim();
      if (/^\d{5,20}$/.test(id)) return id;
    }
    return '';
  }

  function suggestedName() {
    const user = window.Telegram?.WebApp?.initDataUnsafe?.user || {};
    const name = String(user.username || user.first_name || '').trim();
    return name || `Игрок ${userId().slice(-4) || '0000'}`;
  }

  function readJson(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch { return fallback; }
  }

  /**
   * Снимок пройденного из всех игр. Прогресс лежит только в браузере, поэтому
   * собирается он здесь — каждая игра хранит своё по-своему.
   */
  function collectSnapshot() {
    const id = userId() || 'anon';

    const bmt = readJson(`biblical_match_three_progress_v2_${id}`, {});
    const ratings = bmt && typeof bmt.levelRatings === 'object' ? bmt.levelRatings : {};
    const bmtLevels = Object.values(ratings).filter((value) => Number(value) > 0);

    const wowCompleted = readJson('bibleWowCompleted', []);

    const wordsearch = readJson(`bible_wordsearch_progress_v2_${id}`, {});
    const wsCompleted = wordsearch && typeof wordsearch.completed === 'object'
      ? Object.values(wordsearch.completed).filter(Boolean).length
      : 0;

    const sacred = readJson(`sacred_word_levels_v4_${id}`, {});

    return {
      bmt: {
        completed: bmtLevels.length,
        stars: bmtLevels.reduce((sum, value) => sum + Math.min(3, Number(value) || 0), 0),
      },
      ws: { completed: wsCompleted },
      wow: { completed: Array.isArray(wowCompleted) ? new Set(wowCompleted).size : 0 },
      sacred: { level: Math.max(0, Math.floor(Number(sacred?.level) || 0)) },
    };
  }

  /**
   * Рейтинг привязан к профилю, а профиль за пределами Telegram появляется
   * только после входа по коду из бота. Пока входа нет, сервер отвечает 401 —
   * и это не поломка связи, а понятный ответ, о котором и надо сказать прямо.
   */
  function loginError(message) {
    const error = new Error(message);
    error.needsLogin = true;
    return error;
  }

  async function api(action, extra = {}) {
    if (typeof window.apiRequest !== 'function') throw new Error('Приложение ещё не готово');
    const outcome = await window.apiRequest({ action, ...extra }, { raw: true });
    if (outcome?.status === 401 || outcome?.status === 403) {
      throw loginError(String(outcome?.data?.error || 'Нужен вход в профиль'));
    }
    const result = outcome?.ok ? outcome.data : null;
    if (!result) throw new Error('Нет связи с сервером. Проверьте интернет и попробуйте ещё раз');
    if (result.success === false) throw new Error(result.error || 'Не удалось выполнить запрос');
    return result;
  }

  // --- анимация подсчёта -------------------------------------------------------

  const easeOut = (t) => 1 - (1 - t) ** 3;

  /** Число доезжает до значения; при выключенных анимациях ставится сразу. */
  function countUp(node, target, duration = COUNT_MS, done) {
    const value = Math.max(0, Math.floor(Number(target) || 0));
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
    if (reduced || !value) {
      node.textContent = value.toLocaleString('ru-RU');
      done?.();
      return;
    }
    const started = performance.now();
    const step = (now) => {
      const progress = Math.min(1, (now - started) / duration);
      node.textContent = Math.round(value * easeOut(progress)).toLocaleString('ru-RU');
      if (progress < 1) requestAnimationFrame(step);
      else done?.();
    };
    requestAnimationFrame(step);
  }

  /** Строки разбора зажигаются по очереди, пока общий счёт набирает высоту. */
  function revealRows(root, breakdown) {
    const rows = [...root.querySelectorAll('[data-lb-row]')];
    rows.forEach((row, index) => {
      const key = row.dataset.lbRow;
      const points = Number(breakdown?.[key]?.points || 0);
      const levels = Number(breakdown?.[key]?.levels || 0);
      setTimeout(() => {
        row.classList.add('is-live');
        row.querySelector('[data-lb-levels]').textContent = String(levels);
        countUp(row.querySelector('[data-lb-points]'), points, 620);
      }, 180 + index * 150);
    });
  }

  // --- экраны -------------------------------------------------------------------

  function shell(content) {
    return `<section class="lb-shell">
      <header class="lb-topbar">
        <button type="button" class="lb-back" data-lb-back aria-label="Назад">←</button>
        <div><p class="lb-kicker">Все игры</p><h2 class="lb-title">Рейтинг</h2></div>
      </header>
      ${content}
    </section>`;
  }

  function scoreCard(state) {
    const rows = GAME_ORDER.map(([key, label, unit]) => `
      <li class="lb-score-row" data-lb-row="${key}">
        <span class="lb-score-row__name">${escapeHTML(label)}</span>
        <span class="lb-score-row__levels"><b data-lb-levels>0</b> ${escapeHTML(unit)}</span>
        <span class="lb-score-row__points"><b data-lb-points>0</b></span>
      </li>`).join('');

    return `<section class="lb-score">
      <p class="lb-score__label">Ваши очки пути</p>
      <div class="lb-score__value"><b data-lb-total>0</b></div>
      <ul class="lb-score__rows">${rows}</ul>
      ${state.player?.published
        ? `<p class="lb-score__note">Вы в общем рейтинге как <b>${escapeHTML(state.player.name)}</b></p>`
        : '<p class="lb-score__note">Ваши очки видите только вы</p>'}
    </section>`;
  }

  function introMarkup(state) {
    return shell(`
      ${scoreCard(state)}
      <section class="lb-intro">
        <h3>Участие в рейтинге — дело добровольное</h3>
        <p>
          Пока вы не нажали кнопку ниже, вашего имени нет ни в одном списке — очки
          считаются, но видите их только вы.
        </p>
        <p>
          Если опубликуете рейтинг, <b>ваше имя и количество очков увидят все игроки
          приложения</b>. Telegram ID не показывается никому и никогда.
        </p>
        <label class="lb-name">
          <span>Имя в рейтинге</span>
          <input id="lb-name-input" maxlength="24" value="${escapeHTML(state.player?.name || suggestedName())}" placeholder="Как вас показывать" />
          <small>Можно указать любое — настоящее имя не требуется. Поменять можно в любой момент.</small>
        </label>
        <div class="lb-intro__actions">
          <button type="button" class="lb-primary" data-lb-join>Опубликовать мой рейтинг</button>
          <button type="button" class="lb-ghost" data-lb-skip>Не сейчас</button>
        </div>
        <p class="lb-intro__fine">Убрать себя из рейтинга можно в любой момент — очки при этом сохранятся.</p>
      </section>`);
  }

  function boardMarkup(state) {
    const rows = (state.top || []).map((row) => `
      <li class="lb-row${row.isMe ? ' is-me' : ''}${row.place <= 3 ? ` is-podium is-place-${row.place}` : ''}">
        <span class="lb-row__place">${row.place}</span>
        <span class="lb-row__name">${escapeHTML(row.name)}${row.isMe ? '<i>вы</i>' : ''}</span>
        <span class="lb-row__points">${Number(row.points || 0).toLocaleString('ru-RU')}</span>
      </li>`).join('');

    const me = state.me;
    const mine = me?.published
      ? `<div class="lb-mine">
           <span class="lb-mine__place">${me.place ? `${me.place} место` : 'Без места'}</span>
           <span class="lb-mine__name">${escapeHTML(me.name)}</span>
           <span class="lb-mine__points">${Number(me.points || 0).toLocaleString('ru-RU')}</span>
         </div>`
      : `<div class="lb-mine lb-mine--hidden">
           <span>Вас нет в общем списке</span>
           <button type="button" class="lb-link" data-lb-open-intro>Опубликовать</button>
         </div>`;

    return shell(`
      ${scoreCard(state)}
      <section class="lb-board">
        <div class="lb-board__head">
          <h3>Общий рейтинг</h3>
          <span>${Number(state.totalPublished || 0)} игроков</span>
        </div>
        ${mine}
        <ol class="lb-rows">${rows || '<li class="lb-empty">Пока никто не опубликовал свой рейтинг. Будьте первым.</li>'}</ol>
      </section>
      ${state.me?.published ? `<div class="lb-manage">
        <button type="button" class="lb-ghost" data-lb-rename>Сменить имя</button>
        <button type="button" class="lb-ghost lb-ghost--quiet" data-lb-leave>Убрать из рейтинга</button>
      </div>` : ''}
      <button type="button" class="lb-ghost lb-ghost--quiet" data-lb-reset>Начать игры заново</button>`);
  }

  // --- поведение ------------------------------------------------------------------

  const state = { player: null, top: [], me: null, totalPublished: 0, breakdown: {} };

  function container() { return document.getElementById('game-container'); }

  function paint(markup, { animate = true } = {}) {
    const root = container();
    if (!root) return;
    root.innerHTML = markup;
    root.querySelector('[data-lb-back]')?.addEventListener('click', close);
    root.querySelector('[data-lb-join]')?.addEventListener('click', join);
    root.querySelector('[data-lb-skip]')?.addEventListener('click', () => showBoard());
    root.querySelector('[data-lb-open-intro]')?.addEventListener('click', () => paint(introMarkup(state)));
    root.querySelector('[data-lb-rename]')?.addEventListener('click', rename);
    root.querySelector('[data-lb-leave]')?.addEventListener('click', leave);
    // Сброс живёт рядом с очками: именно они за него откатываются.
    root.querySelector('[data-lb-reset]')?.addEventListener('click', () => window.openProgressReset?.());

    const total = root.querySelector('[data-lb-total]');
    const points = Number(state.player?.points || 0);
    if (total && animate) {
      countUp(total, points);
      revealRows(root, state.breakdown);
    } else if (total) {
      total.textContent = points.toLocaleString('ru-RU');
      revealRows(root, state.breakdown);
    }
  }

  /**
   * Экран для тех, у кого профиля ещё нет. Раньше здесь показывалось «нет связи
   * с сервером»: запрос действительно не уходил, но интернет был ни при чём, и
   * дороги к решению с того экрана не было.
   */
  function paintLogin(reason = '') {
    const root = container();
    if (!root) return;
    const canLogin = typeof window.WebSession?.open === 'function';
    const expired = Boolean(reason) && /истекл|сесси/i.test(reason);
    root.innerHTML = shell(`<section class="lb-error lb-error--login">
      <h3>${expired ? 'Вход в профиль истёк' : 'Рейтинг привязан к профилю'}</h3>
      <p>
        Очки собираются по вашему профилю Telegram — иначе сервер не знает, чей это
        прогресс. В приложении на главном экране профиль подключается кодом из бота:
        после входа рейтинг, звёзды и уровни будут те же, что в Telegram.
      </p>
      ${canLogin
        ? '<button type="button" class="lb-primary" data-lb-login>Войти по коду из бота</button>'
        : '<p class="lb-intro__fine">Откройте приложение в Telegram — там вход не нужен.</p>'}
      <button type="button" class="lb-ghost" data-lb-back>В меню</button>
    </section>`);
    root.querySelector('[data-lb-login]')?.addEventListener('click', () => window.WebSession.open());
    // Кнопок «назад» здесь две: стрелка в шапке и кнопка внизу.
    root.querySelectorAll('[data-lb-back]').forEach((node) => node.addEventListener('click', close));
  }

  function toast(message, tone = 'info') {
    document.querySelector('.lb-toast')?.remove();
    const node = document.createElement('div');
    node.className = `lb-toast lb-toast--${tone}`;
    node.textContent = message;
    document.body.append(node);
    requestAnimationFrame(() => node.classList.add('is-visible'));
    setTimeout(() => { node.classList.remove('is-visible'); setTimeout(() => node.remove(), 200); }, 2600);
  }

  function loading(text) {
    const root = container();
    if (root) root.innerHTML = `<section class="lb-shell"><div class="lb-loading"><div class="app-loader__ring"></div><p>${escapeHTML(text)}</p></div></section>`;
  }

  async function refresh() {
    const sync = await api('ratingSync', { snapshot: collectSnapshot() });
    state.player = sync.player;
    state.breakdown = sync.breakdown || {};
    const board = await api('ratingTop', { limit: 100 });
    state.top = board.top || [];
    state.me = board.me;
    state.totalPublished = board.totalPublished || 0;
  }

  async function showBoard() {
    paint(boardMarkup(state));
  }

  async function join() {
    const input = document.getElementById('lb-name-input');
    const name = String(input?.value || '').trim();
    if (!name) { toast('Введите имя для рейтинга', 'error'); input?.focus(); return; }
    try {
      const result = await api('ratingJoin', { name });
      state.player = result.player;
      const board = await api('ratingTop', { limit: 100 });
      state.top = board.top || [];
      state.me = board.me;
      state.totalPublished = board.totalPublished || 0;
      localStorage.setItem(STORAGE_SEEN, '1');
      toast('Ваш рейтинг опубликован', 'success');
      showBoard();
    } catch (error) {
      toast(error.message || 'Не удалось опубликовать рейтинг', 'error');
    }
  }

  async function rename() {
    const name = window.prompt('Имя в рейтинге', state.me?.name || state.player?.name || suggestedName());
    if (name === null) return;
    try {
      const result = await api('ratingSetName', { name: String(name).trim() });
      state.player = result.player;
      await refresh();
      toast('Имя обновлено', 'success');
      showBoard();
    } catch (error) {
      toast(error.message || 'Не удалось сменить имя', 'error');
    }
  }

  async function leave() {
    if (!window.confirm('Убрать себя из общего рейтинга? Очки сохранятся, но другие игроки вас не увидят.')) return;
    try {
      const result = await api('ratingLeave');
      state.player = result.player;
      await refresh();
      toast('Вы больше не в общем рейтинге');
      showBoard();
    } catch (error) {
      toast(error.message || 'Не удалось выйти из рейтинга', 'error');
    }
  }

  function close() {
    (window.appGoToMainMenu || window.goToMainMenu)?.();
  }

  async function open() {
    const menu = document.getElementById('menu-container');
    if (!container()) return;
    menu?.classList.add('hidden');
    document.body.dataset.mode = 'leaderboard';
    window.scrollTo({ top: 0, behavior: 'auto' });
    loading('Считаем ваши очки…');

    if (!userId()) {
      paintLogin();
      return;
    }

    try {
      await refresh();
    } catch (error) {
      const root = container();
      if (!root) return;
      if (error?.needsLogin) {
        paintLogin(error.message);
        return;
      }
      root.innerHTML = `<section class="lb-shell"><div class="lb-error">
        <h3>Рейтинг сейчас недоступен</h3>
        <p>${escapeHTML(error.message || 'Попробуйте позже')}</p>
        <button type="button" class="lb-primary" data-lb-retry>Повторить</button>
        <button type="button" class="lb-ghost" data-lb-back>В меню</button>
      </div></section>`;
      root.querySelector('[data-lb-retry]')?.addEventListener('click', open);
      root.querySelector('[data-lb-back]')?.addEventListener('click', close);
      return;
    }

    // Знакомство показывается, пока человек не решил: опубликовать или нет.
    const decided = state.player?.published || localStorage.getItem(STORAGE_SEEN) === '1';
    paint(decided ? boardMarkup(state) : introMarkup(state));
  }

  function addMenuCard() {
    const root = document.getElementById('system-actions');
    if (!root || document.getElementById('leaderboard-btn')) return Boolean(root);
    const card = document.createElement('button');
    card.type = 'button';
    card.id = 'leaderboard-btn';
    card.className = 'game-card game-card--leaderboard';
    card.innerHTML = `
      <span class="game-card__icon game-card__icon--image lb-card-icon">
        <img class="game-card__img" src="${MENU_ICON}" alt="Иконка раздела Рейтинг"
             loading="eager" decoding="async" draggable="false" />
      </span>
      <span class="game-card__body">
        <span class="game-card__title">Рейтинг</span>
        <span class="game-card__desc">Очки за все игры и общий список игроков</span>
      </span>`;
    card.addEventListener('click', open);
    // Кнопка админа приходит позже и должна остаться последней.
    const admin = document.getElementById('admin-btn');
    if (admin) root.insertBefore(card, admin);
    else root.append(card);
    return true;
  }

  // --- одноразовое уведомление о новом разделе -------------------------------
  //
  // Показывается один раз и только тому, кто ещё не заходил в рейтинг: тем, кто
  // уже там был, новость нечего сообщать. Отметка ставится при закрытии, а не
  // при показе, — иначе свёрнутое на полуслове приложение съело бы уведомление.

  function newsSeen() {
    try {
      return localStorage.getItem(STORAGE_NEWS) === '1' || localStorage.getItem(STORAGE_SEEN) === '1';
    } catch { return true; }
  }

  function markNewsSeen() {
    try { localStorage.setItem(STORAGE_NEWS, '1'); } catch { /* приватный режим */ }
  }

  function dismissNews(node) {
    markNewsSeen();
    node.classList.remove('is-visible');
    node.addEventListener('transitionend', () => node.remove(), { once: true });
    setTimeout(() => node.remove(), 600);
  }

  function addMenuNews() {
    const menu = document.getElementById('menu-container');
    if (!menu || document.getElementById('leaderboard-news')) return Boolean(menu);
    if (newsSeen()) return true;

    const note = document.createElement('section');
    note.id = 'leaderboard-news';
    note.className = 'lb-news';
    note.setAttribute('role', 'status');
    note.innerHTML = `
      <button type="button" class="lb-news__close" data-lb-news-close aria-label="Скрыть уведомление">×</button>
      <span class="lb-news__icon">
        <img src="${MENU_ICON}" alt="" loading="eager" decoding="async" draggable="false" />
      </span>
      <div class="lb-news__body">
        <p class="lb-news__kicker">Новое</p>
        <h3 class="lb-news__title">Рейтинг игроков</h3>
        <p class="lb-news__text">
          Очки за все пройденные уровни теперь складываются в один счёт. Посмотрите свой
          результат и, если захотите, встаньте в общий список под любым именем.
        </p>
        <div class="lb-news__actions">
          <button type="button" class="lb-news__open" data-lb-news-open>Посмотреть рейтинг</button>
          <button type="button" class="lb-news__later" data-lb-news-close>Позже</button>
        </div>
      </div>`;

    note.addEventListener('click', (event) => {
      if (event.target.closest('[data-lb-news-open]')) { markNewsSeen(); note.remove(); open(); return; }
      if (event.target.closest('[data-lb-news-close]')) dismissNews(note);
    });

    menu.prepend(note);
    requestAnimationFrame(() => note.classList.add('is-visible'));
    return true;
  }

  function install() {
    const done = () => addMenuCard() && addMenuNews();
    if (done()) return;
    const observer = new MutationObserver(() => { if (done()) observer.disconnect(); });
    observer.observe(document.documentElement, { childList: true, subtree: true });
    setTimeout(() => observer.disconnect(), 12000);
  }

  window.openLeaderboard = open;
  window.LeaderboardSnapshot = collectSnapshot;

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
  else install();
})();
