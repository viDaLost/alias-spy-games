(() => {
  'use strict';
  if (!window.GameDisplay) return;

  const preview = document.documentElement.hasAttribute('data-full-preview');
  const menu = document.getElementById(preview ? 'menu-container' : 'main-catalog');
  const gamesGrid = document.getElementById('catalog-games');
  const feature = document.getElementById('catalog-feature');
  let carousel;
  const filters = document.getElementById('catalog-filters');
  const search = document.getElementById('catalog-query');
  const status = document.getElementById('catalog-status');
  const favoritesShelf = document.getElementById('catalog-favorites');
  const settings = document.getElementById('settings-dialog');
  const favoritesDialog = document.getElementById('favorites-dialog');
  const invitation = document.getElementById('invite-dialog');
  const inviteField = document.getElementById('invite-url');
  const inviteFeedback = document.getElementById('invite-feedback');
  const resources = new Map();
  const favoritesKey = 'bible_game_favorites_v1';
  const favoriteShelfList = document.getElementById('favorite-games');
  const favoriteDialogList = document.getElementById('favorites-dialog-games');
  let favorites = new Set(readFavorites());
  let games = [];
  let filter = 'all';
  let mounted = false;
  let consumedRoom = '';
  let pendingFavorite = false;
  const groupNames = { 'company-games': 'Игры для компании', 'word-games': 'Словесные', 'kids-games': 'Детям' };
  const previewDetails = {
    quartet: ['3–24 игрока', '≈ 15–30 мин'],
    'twelve-tribes': ['2–8 игроков', '≈ 15–30 мин'],
    'promised-land': ['2–6 игроков', '≈ 30–60 мин'],
    kingdoms: ['2–5 игроков', '≈ 20–35 мин'],
  };
  const normalize = (text) => text.toLowerCase().replaceAll('ё', 'е').trim();

  const gameObserver = typeof IntersectionObserver === 'function' ? new IntersectionObserver((entries, observer) => {
    for (const { target, isIntersecting } of entries) {
      if (!isIntersecting) continue;
      if (!window.GameDisplay.reducedMotion()) target.classList.add('is-revealed');
      observer.unobserve(target);
    }
  }, { threshold: .13 }) : null;

  if (preview) for (const [game, endpoint] of Object.entries({
    'bible-sketch': 'sketch',
    spy: 'spy',
    'twelve-tribes': 'tribes',
    kingdoms: 'kingdoms',
  })) {
    document.querySelector(`meta[name="${game}-backend"]`).content = `${location.origin}/online/${endpoint}`;
  }

  function value(key) {
    try { return localStorage.getItem(key); } catch { return null; }
  }

  function readFavorites() {
    try {
      const data = JSON.parse(value(favoritesKey) || '[]');
      return Array.isArray(data) ? data.filter((id) => typeof id === 'string') : [];
    } catch { return []; }
  }

  function routeURL(game, params = {}) {
    return '?' + new URLSearchParams({ ...(preview ? {} : { menu: 'catalog' }), game, ...params }).toString();
  }

  function artwork(game) {
    if (!preview || !window.GameDisplay.lowGraphics()) return game.art;
    return game.art.replace('icons/unified-v1/', 'catalog-low/');
  }

  function icon(game) {
    return `<img src="${artwork(game)}" alt="" width="68" height="68" loading="lazy" decoding="async">`;
  }

  function card(game) {
    const selected = favorites.has(game.key);
    const [players, time] = previewDetails[game.key] || window.gameCardDetails?.(game.key) || [];
    return `<article class="catalog-game"><div class="catalog-game-face">
      <a href="${routeURL(game.key)}" data-launch="${game.key}" data-card-game="${game.key}">
        <span class="catalog-game-emblem">${icon(game)}</span>
        <span class="catalog-game-copy"><strong>${game.title}</strong><span class="catalog-game-description">${game.desc}</span></span>
        <span class="catalog-game-stats"><span><b aria-hidden="true">♙</b>${players}</span><span><b aria-hidden="true">◷</b>${time}</span></span>
      </a>
      <button type="button" class="catalog-save" data-favorite="${game.key}" aria-pressed="${selected}"
        aria-label="${game.title} — избранное" title="${selected ? 'Убрать из избранного' : 'В избранное'}">${window.CatalogSystem.icon('favorites')}</button>
    </div>
    </article>`;
  }

  function renderLibrary(entering = false) {
    const query = normalize(search.value);
    const terms = query.split(/\s+/).filter(Boolean);
    const scoped = games.filter((game) => {
      const inGroup = filter === 'all' || (game.group === 'company-games') === (filter === 'company');
      return inGroup && terms.every((term) => game.search.includes(term));
    });
    gameObserver?.disconnect();
    gamesGrid.innerHTML = Object.entries(groupNames).map(([id, title]) => {
      const list = scoped.filter((game) => game.group === id);
      return list.length ? `<section class="catalog-collection" aria-labelledby="collection-${id}"><h2 id="collection-${id}">${title}</h2><div class="catalog-games">${list.map(card).join('')}</div></section>` : '';
    }).join('') || '<p class="catalog-empty">Игры не найдены. Попробуйте другое название.</p>';
    if (entering && !window.GameDisplay.reducedMotion()) {
      for (const item of gamesGrid.querySelectorAll('.catalog-game')) {
        if (gameObserver) gameObserver.observe(item);
        else item.classList.add('is-revealed');
      }
    }
    filters.dataset.current = filter;
    for (const tab of filters.querySelectorAll('[data-filter]')) {
      tab.setAttribute('aria-pressed', String(tab.dataset.filter === filter));
    }
    if (query) status.textContent = scoped.length ? `Найдено игр: ${scoped.length}` : 'Игры не найдены';
  }

  function render(entering = false) {
    renderLibrary(entering);
    const saved = games.filter((game) => favorites.has(game.key));
    favoritesShelf.hidden = !saved.length;
    favoriteShelfList.innerHTML = saved.map((game) =>
      `<a class="catalog-pin" href="${routeURL(game.key)}" data-launch="${game.key}">${icon(game)}${game.title}</a>`
    ).join('');
    favoriteDialogList.innerHTML = saved.length ? saved.map(card).join('')
      : '<p class="catalog-favorite-empty">Нажмите сердечко на карточке игры, чтобы она появилась здесь.</p>';
  }

  function signedProfile() {
    return !preview && (window.Telegram?.WebApp?.initData || window.TelegramLaunchContext?.getInitData?.() || window.WebSession?.active?.());
  }

  async function toggleFavorite(id, button) {
    const game = games.find((game) => game.key === id);
    if (!game || pendingFavorite) return;
    const selected = !favorites.has(id);
    const host = button.closest('#favorites-dialog') ? favoriteDialogList : gamesGrid;
    if (signedProfile()) {
      if (!window.PlayerSocial) { status.textContent = 'Профиль ещё загружается'; return; }
      pendingFavorite = true;
      try { favorites = new Set(await window.PlayerSocial.setFavorite(id, selected)); }
      catch { status.textContent = 'Не удалось обновить избранное профиля'; return; }
      finally { pendingFavorite = false; }
    } else {
      if (selected) favorites.add(id); else favorites.delete(id);
      try { localStorage.setItem(favoritesKey, JSON.stringify([...favorites])); } catch {}
    }
    render();
    status.textContent = selected ? `${game.title} добавлена в избранное` : `${game.title} убрана из избранного`;
    (host.querySelector(`[data-favorite="${id}"]`) || host.querySelector('button')
      || favoritesDialog.querySelector('.catalog-dialog-close')).focus({ preventScroll: true });
  }

  function navigate(href) {
    const target = new URL(href, location.href);
    if (target.origin !== location.origin) return;
    if (!preview) target.searchParams.set('menu', 'catalog');
    if (window.AppAccess && !window.AppAccess.allowed()) return;
    if (target.href !== location.href) history.pushState(null, '', target);
    openURL();
  }

  function openURL() {
    const params = new URLSearchParams(location.search);
    const key = params.get('game') || (params.get('room') ? 'quartet' : '');
    if (!games.some((game) => game.key === key)) {
      if (document.body.dataset.currentGame) window.appGoToMainMenu();
      return;
    }
    if (!preview && params.has('room') && window.RoomInvite) {
      const id = params.get('room');
      if (/^[A-Z0-9]{4,10}$/.test(id) && window.RoomInvite.acceptScanned(`${key}:${id}`)) return;
    }
    window.showGame(key);
  }

  function currentInvite() {
    const params = new URLSearchParams(location.search);
    const game = params.get('game');
    const room = params.get('room')?.toUpperCase();
    if (!game || !/^[A-Z0-9]{4,10}$/.test(room || '') || consumedRoom === location.search) return null;
    return { game, room };
  }

  function shareURL(game, room) {
    return new URL(routeURL(game, { room }), location.origin).href;
  }

  async function openInvite(game, room, title = 'Приглашение в игру') {
    const code = String(room || '').toUpperCase();
    if (!/^[A-Z0-9]{4,10}$/.test(code) || !games.some((item) => item.key === game)) return;
    const link = shareURL(game, code);
    invitation.querySelector('h2').textContent = title;
    document.getElementById('invite-code').textContent = `Комната ${code}`;
    inviteField.value = link;
    inviteFeedback.textContent = '';
    const qr = document.getElementById('invite-qr');
    qr.replaceChildren();
    if (!invitation.open) invitation.showModal();
    try {
      await loadResource('/vendor/qrcode.min.js');
      if (!invitation.open || inviteField.value !== link) return;
      new window.QRCode(qr, { text: link, width: 184, height: 184, correctLevel: window.QRCode.CorrectLevel.M });
    } catch {
      if (invitation.open && inviteField.value === link) inviteFeedback.textContent = 'Ссылка на комнату доступна для копирования.';
    }
  }

  function mount(groups, icons, canShow = () => true) {
    if (mounted) return;
    const allGames = groups.flatMap((group) => group.items.map((item) => ({
      ...item, group: group.id, art: icons[item.icon],
    })));
    allGames.push(
      { key: 'bible-sketch', title: 'Библейский художник', desc: 'Рисуйте и угадывайте', group: 'company-games', art: 'web/assets/icons/unified-v1/bible-sketch.webp' },
      { key: 'biblical-match-three', title: 'Библейские сокровища', desc: 'Комбинации и раскопки', group: 'kids-games', art: 'web/assets/icons/unified-v1/biblical-treasures.webp' }
    );
    for (const game of allGames) game.search = normalize(`${game.title} ${game.desc} ${game.key}`);
    games = allGames.filter(canShow);
    mounted = true;
    menu.hidden = false;
    const account = window.PlayerSocial?.getState?.();
    if (signedProfile() && account?.profile) favorites = new Set(account.profile.favorites || []);
    render(true);
    window.CatalogSystem.setRoomGames(games);
    carousel = window.CatalogCarousel.mount({ feature, games, artwork, routeURL });
    document.documentElement.classList.toggle('theme-dark', window.AppTheme?.isDark() === true);
    document.querySelector('[data-game-wallet]').textContent = String(window.GameWallet.balance());
    window.CatalogSystem.refresh();
    if (preview) queueMicrotask(openURL);
    else {
      window.addEventListener('app:menu-ready', openURL, { once: true });
      new MutationObserver(() => {
        const available = allGames.filter(canShow);
        if (available.length === games.length && available.every((game, index) => game === games[index])) return;
        games = available;
        render();
        carousel.updateGames(games);
        window.CatalogSystem.setRoomGames(games);
        window.CatalogSystem.refresh();
      }).observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    }
  }

  function returnHome() {
    const url = new URL(location.href);
    for (const key of ['game', 'level', 'room', 'mode']) url.searchParams.delete(key);
    if (url.href !== location.href) history.replaceState(null, '', url);
    consumedRoom = '';
    if (invitation?.open) invitation.close();
    window.CatalogSystem.refresh();
  }

  function loadResource(path, stylesheet = false) {
    if (!resources.has(path)) {
      const promise = new Promise((resolve, reject) => {
        const node = document.createElement(stylesheet ? 'link' : 'script');
        if (stylesheet) { node.rel = 'stylesheet'; node.href = path; }
        else node.src = path;
        node.addEventListener('load', resolve, { once: true });
        node.addEventListener('error', () => {
          node.remove();
          resources.delete(path);
          reject(new Error('Не удалось загрузить файлы игры'));
        }, { once: true });
        document.head.append(node);
      });
      resources.set(path, promise);
    }
    return resources.get(path);
  }

  async function prepareQuartet() {
    if (document.body.dataset.currentGame !== 'quartet') return;
    const container = document.getElementById('game-container');
    try {
      await Promise.all([
        loadResource('web/games/quartet-table.css?v=8', true),
        loadResource('web/games/quartet-table-theme.css?v=2', true),
        loadResource('web/games/quartet-table.js?v=8'),
        ...(preview ? [loadResource('/quartet-polling.js')] : []),
      ]);
      if (document.body.dataset.currentGame === 'quartet') {
        window.startQuartetGame('web/data/quartet_bible.json', { preview });
      }
    } catch {
      if (document.body.dataset.currentGame !== 'quartet') return;
      container.innerHTML = '<section class="app-error-card"><h2>Не удалось открыть «Квартет»</h2><button class="back-button" type="button" onclick="showGame(\'quartet\')">Повторить</button><button class="back-button" type="button" onclick="goToMainMenu()">В меню</button></section>';
    }
  }

  async function loadQuartetPractice() {
    await loadResource('/quartet-practice.js');
    return window.QuartetPractice;
  }

  const graphicsDescriptions = {
    low: 'Упрощённый фон, небольшие текстуры и меньше нагрузки на экран.',
    normal: 'Детальные иллюстрации и мягкие тени.',
    high: 'Максимальная чёткость и выраженная глубина карточек.',
  };
  const motionDescriptions = {
    low: 'Переходы почти мгновенные, без частиц и лишних движений.',
    normal: 'Основные эффекты и переходы.',
    high: 'Полные эффекты в играх, которые их поддерживают.',
  };

  function reflectSettings() {
    const { graphics, animations } = window.GameDisplay.get();
    settings.querySelector(`input[name="graphics"][value="${graphics}"]`).checked = true;
    settings.querySelector(`input[name="animations"][value="${animations}"]`).checked = true;
    document.getElementById('graphics-description').textContent = graphicsDescriptions[graphics];
    document.getElementById('motion-description').textContent = motionDescriptions[animations];
  }

  document.body.addEventListener('click', (event) => {
    const target = event.target.closest('button, a');
    if (!target || (!menu.contains(target) && !favoritesDialog.contains(target))) return;
    if (target.dataset.filter) {
      filter = target.dataset.filter;
      renderLibrary(true);
    } else if (target.dataset.favorite) {
      toggleFavorite(target.dataset.favorite, target);
    } else if (target.dataset.launch && event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) {
      event.preventDefault();
      if (favoritesDialog.open) favoritesDialog.close();
      navigate(target.href);
    }
  });
  search.addEventListener('input', () => renderLibrary());
  document.getElementById('open-settings').addEventListener('click', () => {
    reflectSettings();
    window.CatalogSystem.refresh();
    settings.showModal();
  });
  document.getElementById('open-favorites').addEventListener('click', () => {
    favoritesDialog.showModal();
  });
  window.addEventListener('app:progress-reset', window.CatalogSystem.refresh);
  window.addEventListener('player:favorites-changed', (event) => {
    if (!signedProfile()) return;
    favorites = new Set(event.detail);
    if (mounted) render();
  });
  document.getElementById('copy-invite')?.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(inviteField.value);
      inviteFeedback.textContent = 'Ссылка скопирована';
    } catch {
      inviteField.select();
      inviteFeedback.textContent = 'Скопируйте выделенную ссылку.';
    }
  });
  document.getElementById('display-settings').addEventListener('change', (event) => {
    window.GameDisplay.set({ [event.target.name]: event.target.value });
  });
  document.getElementById('display-light-preset').addEventListener('click', () => {
    window.GameDisplay.set({ graphics: 'low', animations: 'low' });
  });
  window.addEventListener('game-display:change', () => {
    reflectSettings();
    if (mounted) render();
  });
  window.addEventListener('storage', (event) => {
    if (!signedProfile() && (event.key === favoritesKey || event.key === null)) {
      favorites = new Set(readFavorites());
      if (mounted) render();
    }
    if (!menu.classList.contains('hidden')) window.CatalogSystem.refresh();
  });
  window.addEventListener('popstate', () => {
    const historyURL = location.href;
    if (document.body.dataset.currentGame) {
      window.appGoToMainMenu();
      history.replaceState(null, '', historyURL);
    }
    openURL();
  });
  for (const surface of [gamesGrid, favoriteDialogList]) {
    let raised = null;
    function release() {
      raised?.style.removeProperty('--catalog-card-tilt-x');
      raised?.style.removeProperty('--catalog-card-tilt-y');
      raised = null;
    }
    function moveCard(event) {
      if (window.GameDisplay.lowGraphics() || window.GameDisplay.reducedMotion()) return;
      const card = event.target.closest('.catalog-game');
      if (raised !== card) release();
      if (!card) return;
      const rect = card.getBoundingClientRect();
      raised = card;
      card.style.setProperty('--catalog-card-tilt-x', `${8 - (event.clientY - rect.top) / rect.height * 16}deg`);
      card.style.setProperty('--catalog-card-tilt-y', `${(event.clientX - rect.left) / rect.width * 19 - 9.5}deg`);
    }
    surface.addEventListener('pointermove', (event) => {
      if (event.pointerType === 'mouse') moveCard(event);
    }, { passive: true });
    surface.addEventListener('pointerdown', moveCard, { passive: true });
    for (const event of ['pointerleave', 'pointerup', 'pointercancel']) surface.addEventListener(event, release);
  }
  if (preview) window.RoomInvite = Object.freeze({
    peek: currentInvite,
    consume(game) {
      const invite = currentInvite();
      if (invite?.game !== game) return null;
      consumedRoom = location.search;
      return invite;
    },
    getShareUrl: shareURL,
    openQr: openInvite,
    acceptScanned: window.CatalogSystem.acceptInvite,
  });
  window.GameCatalog = Object.freeze({ mount, returnHome, navigate, prepareQuartet, refresh: window.CatalogSystem.refresh });
  if (preview) window.FullPreviewMenu = Object.freeze({ ...window.GameCatalog, loadQuartetPractice });
})();
