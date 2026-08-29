(() => {
  'use strict';

  const ADMIN_ID = '1288379477';
  const CORE = String(document.querySelector('meta[name="app-core-backend"]')?.content || '').replace(/\/+$/, '');
  const OBSERVABILITY = String(document.querySelector('meta[name="app-observability"]')?.content || '').replace(/\/+$/, '');
  const GAME_CATALOG = [
    { id: 'alias', title: 'Алиас', icon: 'web/assets/icons/alias.png?v=1' },
    { id: 'coimaginarium', title: 'Соображариум', icon: 'web/assets/icons/idea.png?v=1' },
    { id: 'guess', title: 'Угадай персонажа', icon: 'web/assets/icons/character.png?v=1' },
    { id: 'describe', title: 'Опиши, но не называй', icon: 'web/assets/icons/describe.png?v=1' },
    { id: 'spy', title: 'Шпион', icon: 'web/assets/icons/spy.png?v=1' },
    { id: 'quartet', title: 'Квартет', icon: 'web/assets/icons/quartet.png?v=1' },
    { id: 'bible-sketch', title: 'Библейский художник', icon: 'web/assets/icons/bible-sketch.webp?v=3' },
    { id: 'bible-wow', title: 'Библейские слова', icon: 'web/assets/icons/words.png?v=1' },
    { id: 'bible-wordsearch', title: 'Поиск библейских слов', icon: 'web/assets/icons/search.png?v=1' },
    { id: 'sacred-word', title: 'Священное слово', icon: 'web/assets/icons/sacred.png?v=1' },
    { id: 'kids-ark-pairs', title: 'Найди пару', icon: 'web/assets/icons/ark.png?v=1' },
    { id: 'biblical-match-three', title: 'Библейские сокровища', icon: 'web/assets/icons/biblical-treasures-v38.png?v=39' },
  ];
  const GAMES_BY_ID = new Map(GAME_CATALOG.map((game) => [game.id, game]));

  let overlay = null;
  let state = null;
  let online = [];
  let onlineMap = new Map();
  let activeTab = 'overview';
  let adminToken = '';
  let adminTokenExpires = 0;
  let toastTimer = 0;
  let busy = false;
  let lastTrackedAt = 0;
  let lastTrackedGame = '';

  const tgUser = () => window.Telegram?.WebApp?.initDataUnsafe?.user || null;
  const initData = () => String(window.Telegram?.WebApp?.initData || '');
  const currentId = () => String(tgUser()?.id || '');

  async function waitForAdminContext() {
    const deadline = Date.now() + 7000;
    while (Date.now() < deadline) {
      if (currentId()) return currentId() === ADMIN_ID;
      await sleep(90);
    }
    return false;
  }

  async function profileApi(action, payload = {}) {
    if (!CORE) throw new Error('Сервис профиля не настроен');
    const telegramInitData = initData();
    if (!telegramInitData) throw new Error('Профиль доступен только внутри Telegram');
    const response = await fetch(`${CORE}/compat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      cache: 'no-store',
      body: JSON.stringify({ telegramInitData, payload: { action, ...payload } }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data?.ok === false || data?.success === false) {
      throw new Error(String(data?.error || `HTTP ${response.status}`));
    }
    return data;
  }

  async function ensureAdminSession(force = false) {
    if (!CORE) throw new Error('Сервис профиля не настроен');
    const now = Date.now();
    if (!force && adminToken && adminTokenExpires - now > 45_000) return adminToken;
    const response = await fetch(`${CORE}/web/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      cache: 'no-store',
      body: JSON.stringify({ telegramInitData: initData(), scope: 'admin' }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data?.token) throw new Error(data?.error || 'Не удалось открыть live-сессию');
    adminToken = String(data.token);
    adminTokenExpires = Number(data.expiresAt || 0);
    return adminToken;
  }

  async function loadOnline() {
    if (!OBSERVABILITY) return [];
    const token = await ensureAdminSession();
    let response = await fetch(`${OBSERVABILITY}/admin/live`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    });
    if (response.status === 401 || response.status === 403) {
      adminToken = '';
      const retryToken = await ensureAdminSession(true);
      response = await fetch(`${OBSERVABILITY}/admin/live`, {
        headers: { Authorization: `Bearer ${retryToken}` },
        cache: 'no-store',
      });
    }
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data?.ok !== true) throw new Error(data?.error || 'Онлайн временно недоступен');
    online = Array.isArray(data.onlineUsers) ? data.onlineUsers : [];
    onlineMap = new Map(online.map((item) => [String(item.id || ''), item]));
    return online;
  }

  function initials(value) {
    const clean = String(value || '').replace(/^@/, '').trim();
    if (!clean) return 'BG';
    const parts = clean.split(/\s+/).filter(Boolean);
    return (parts.length > 1 ? `${parts[0][0]}${parts[1][0]}` : clean.slice(0, 2)).toUpperCase();
  }

  function displayName(user = {}) {
    return String(user.displayName || '').trim() || (user.username ? `@${user.username}` : `Игрок ${String(user.id || '').slice(-4)}`);
  }

  function isOnline(id) { return onlineMap.has(String(id || '')); }
  function friendIds() { return new Set((state?.friends || []).map((friend) => String(friend.id))); }
  function favoriteIds() { return new Set(state?.profile?.favorites || []); }

  function mountLauncher() {
    if (document.querySelector('.player-profile-launcher')) return;
    const user = tgUser() || {};
    const name = [user.first_name, user.last_name].filter(Boolean).join(' ') || user.username || 'Admin';
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'player-profile-launcher';
    button.setAttribute('aria-label', 'Открыть профиль игрока');
    button.innerHTML = `<span class="player-profile-launcher__avatar">${escapeHtml(initials(name))}</span><span class="player-profile-launcher__dot"></span>`;
    button.addEventListener('click', openProfile);
    document.body.appendChild(button);
  }

  function ensureOverlay() {
    if (overlay) return overlay;
    overlay = document.createElement('div');
    overlay.className = 'player-profile-overlay';
    overlay.innerHTML = `
      <section class="player-profile-sheet" role="dialog" aria-modal="true" aria-label="Профиль игрока">
        <header class="player-profile-head">
          <div class="player-profile-head__avatar" data-profile-avatar>BG</div>
          <div class="player-profile-head__identity">
            <p class="player-profile-head__eyebrow">Профиль игрока · Beta</p>
            <h2 data-profile-name>Игрок</h2>
            <p class="player-profile-head__meta" data-profile-meta>Загрузка…</p>
          </div>
          <button class="player-profile-close" type="button" aria-label="Закрыть">×</button>
        </header>
        <nav class="player-profile-tabs" aria-label="Разделы профиля">
          <button class="player-profile-tab is-active" type="button" data-profile-tab="overview">Профиль</button>
          <button class="player-profile-tab" type="button" data-profile-tab="friends">Друзья</button>
          <button class="player-profile-tab" type="button" data-profile-tab="online">Онлайн</button>
          <button class="player-profile-tab" type="button" data-profile-tab="favorites">Избранное</button>
        </nav>
        <div class="player-profile-content"><div class="player-profile-loading">Загружаем профиль…</div></div>
      </section>`;
    overlay.addEventListener('click', (event) => { if (event.target === overlay) closeProfile(); });
    overlay.querySelector('.player-profile-close')?.addEventListener('click', closeProfile);
    overlay.querySelectorAll('[data-profile-tab]').forEach((button) => button.addEventListener('click', () => setTab(button.dataset.profileTab)));
    document.body.appendChild(overlay);
    return overlay;
  }

  async function openProfile() {
    const node = ensureOverlay();
    node.classList.add('is-open');
    document.body.style.overflow = 'hidden';
    renderLoading();
    try {
      const [profile] = await Promise.all([
        profileApi('profileBootstrap'),
        loadOnline().catch((error) => { console.warn('Profile online:', error); return []; }),
      ]);
      state = profile;
      hydrateIdentity();
      render();
    } catch (error) {
      renderError(error);
    }
  }

  function closeProfile() {
    overlay?.classList.remove('is-open');
    document.body.style.overflow = '';
  }

  function setTab(tab) {
    activeTab = ['overview', 'friends', 'online', 'favorites'].includes(tab) ? tab : 'overview';
    overlay?.querySelectorAll('[data-profile-tab]').forEach((button) => button.classList.toggle('is-active', button.dataset.profileTab === activeTab));
    render();
    if (activeTab === 'online') refreshOnlineSilently();
  }

  function hydrateIdentity() {
    if (!overlay || !state?.user) return;
    const name = displayName(state.user);
    const avatar = overlay.querySelector('[data-profile-avatar]');
    const title = overlay.querySelector('[data-profile-name]');
    const meta = overlay.querySelector('[data-profile-meta]');
    if (avatar) avatar.textContent = initials(name);
    if (title) title.textContent = name;
    if (meta) meta.textContent = `${state.user.username ? `@${state.user.username} · ` : ''}ID ${state.user.id}`;
  }

  function renderLoading() {
    const content = overlay?.querySelector('.player-profile-content');
    if (content) content.innerHTML = '<div class="player-profile-loading">Загружаем профиль…</div>';
  }

  function renderError(error) {
    const content = overlay?.querySelector('.player-profile-content');
    if (!content) return;
    content.innerHTML = `<div class="player-profile-empty">Не удалось загрузить профиль.<br>${escapeHtml(error?.message || error)}<br><br><button type="button" class="player-profile-primary" style="padding:11px 16px" data-profile-retry>Повторить</button></div>`;
    content.querySelector('[data-profile-retry]')?.addEventListener('click', openProfile);
  }

  function render() {
    if (!overlay || !state) return;
    const content = overlay.querySelector('.player-profile-content');
    if (!content) return;
    if (activeTab === 'overview') content.innerHTML = renderOverview();
    if (activeTab === 'friends') content.innerHTML = renderFriends();
    if (activeTab === 'online') content.innerHTML = renderOnline();
    if (activeTab === 'favorites') content.innerHTML = renderFavorites();
    bindContent(content);
  }

  function renderOverview() {
    const user = state.user || {};
    const profile = state.profile || {};
    const friends = state.friends || [];
    const onlineFriends = friends.filter((friend) => isOnline(friend.id)).length;
    const stats = Object.entries(profile.gameStats || {}).sort((a, b) => Number(b[1]) - Number(a[1])).slice(0, 6);
    const name = displayName(user);
    return `
      <section class="player-profile-hero">
        <div class="player-profile-hero__top"><div><div class="player-profile-hero__name">${escapeHtml(name)}</div><div class="player-profile-hero__username">${user.username ? `@${escapeHtml(user.username)}` : 'Telegram username не указан'}</div></div><button class="player-profile-id" type="button" data-copy-id="${escapeHtml(user.id)}">ID ${escapeHtml(user.id)} · копировать</button></div>
        <div class="player-profile-stats">
          <div class="player-profile-stat"><b>${Number(profile.gamesPlayed || 0)}</b><span>партий</span></div>
          <div class="player-profile-stat"><b>${friends.length}</b><span>друзей</span></div>
          <div class="player-profile-stat"><b>${onlineFriends}</b><span>друзей онлайн</span></div>
          <div class="player-profile-stat"><b>${(profile.favorites || []).length}</b><span>избранных</span></div>
        </div>
      </section>
      <section class="player-profile-section"><div class="player-profile-section__head"><h3>Игровые показатели</h3><span>текущие балансы</span></div><div class="player-profile-balances">
        ${balanceCard(user.wowStars, 'Библейские слова')}${balanceCard(user.wsStars, 'Поиск слов')}${balanceCard(user.swLevel, 'Священное слово')}${balanceCard(user.bmtStars, 'Сокровища')}
      </div></section>
      <section class="player-profile-section"><div class="player-profile-section__head"><h3>Чаще всего играете</h3><span>${stats.length ? 'по статистике профиля' : 'статистика начнёт собираться сейчас'}</span></div><div class="player-profile-game-stats">
        ${stats.length ? stats.map(([id, count]) => gameStat(id, count)).join('') : '<div class="player-profile-empty">Откройте любую игру — она появится в статистике профиля.</div>'}
      </div></section>`;
  }

  function balanceCard(value, label) { return `<div class="player-profile-balance"><b>${Number(value || 0)}</b><small>${escapeHtml(label)}</small></div>`; }
  function gameStat(id, count) {
    const game = GAMES_BY_ID.get(id);
    if (!game) return '';
    return `<div class="player-profile-game-stat"><img src="${game.icon}" alt="" loading="lazy"><div><b>${escapeHtml(game.title)}</b><small>${Number(count || 0)} ${pluralGames(Number(count || 0))}</small></div></div>`;
  }

  function renderFriends() {
    const friends = state.friends || [];
    return `
      <div class="player-social-search"><input type="text" inputmode="text" autocomplete="off" placeholder="@username или Telegram ID" data-friend-query><button type="button" data-friend-search>Найти</button></div>
      <details class="player-profile-help"><summary>Как узнать ID другого пользователя?</summary><div class="player-profile-help__body">Если у человека есть Telegram username, достаточно ввести <code>@username</code>. Если username нет, попросите его открыть бота «Библейские игры» и отправить команду <code>/id</code>. Бот пришлёт его цифровой Telegram ID — этот номер можно отправить вам и вставить в поиск.</div></details>
      <div data-search-result></div>
      <section class="player-profile-section"><div class="player-profile-section__head"><h3>Мои друзья</h3><span>${friends.length}</span></div><div class="player-profile-list">${friends.length ? friends.map((friend) => personCard(friend, { friend: true })).join('') : '<div class="player-profile-empty">Друзей пока нет. Найдите игрока по @username или ID.</div>'}</div></section>`;
  }

  function renderOnline() {
    const selfId = String(state.user?.id || '');
    const knownFriends = friendIds();
    const users = online.filter((user) => String(user.id || '') !== selfId);
    return `<div class="player-online-summary"><span class="player-online-summary__pulse"></span><b>${online.length}</b> сейчас онлайн в «Библейских играх»</div><div class="player-profile-list">${users.length ? users.map((user) => personCard({ id: String(user.id || ''), username: user.username || '', displayName: user.displayName || '', liveGame: user.game || '', platform: user.platform || '' }, { friend: knownFriends.has(String(user.id || '')), online: true })).join('') : '<div class="player-profile-empty">Сейчас других игроков онлайн нет.</div>'}</div>`;
  }

  function personCard(person = {}, options = {}) {
    const id = String(person.id || '');
    const live = options.online || isOnline(id);
    const liveData = onlineMap.get(id) || {};
    const game = GAMES_BY_ID.get(liveData.game || person.liveGame)?.title || (live ? 'Главное меню' : 'Не в сети');
    const name = displayName(person);
    const username = person.username ? `@${person.username}` : `ID ${id}`;
    const action = options.friend
      ? `<button class="is-danger" type="button" data-remove-friend="${escapeHtml(id)}">Удалить</button>`
      : `<button type="button" data-add-friend="${escapeHtml(id)}">+ Друг</button>`;
    return `<article class="player-person ${live ? 'is-online' : ''}"><div class="player-person__avatar">${escapeHtml(initials(name))}<span class="player-person__dot"></span></div><div class="player-person__info"><b>${escapeHtml(name)}</b><small>${escapeHtml(username)} · ${escapeHtml(game)}${liveData.platform ? ` · ${escapeHtml(liveData.platform === 'android' ? 'Android' : 'Telegram')}` : ''}</small></div><div class="player-person__actions">${action}</div></article>`;
  }

  function renderFavorites() {
    const favorites = favoriteIds();
    return `<div class="player-favorites-grid">${GAME_CATALOG.map((game) => `<button type="button" class="player-favorite-card ${favorites.has(game.id) ? 'is-favorite' : ''}" data-toggle-favorite="${game.id}"><img src="${game.icon}" alt="" loading="lazy"><span class="player-favorite-card__text"><b>${escapeHtml(game.title)}</b><small>${favorites.has(game.id) ? 'В избранном' : 'Добавить в избранное'}</small></span><span class="player-favorite-card__heart">♥</span></button>`).join('')}</div>`;
  }

  function bindContent(content) {
    content.querySelector('[data-copy-id]')?.addEventListener('click', (event) => copyText(event.currentTarget.dataset.copyId, 'ID скопирован'));
    content.querySelector('[data-friend-search]')?.addEventListener('click', searchFriend);
    content.querySelector('[data-friend-query]')?.addEventListener('keydown', (event) => { if (event.key === 'Enter') searchFriend(); });
    content.querySelectorAll('[data-add-friend]').forEach((button) => button.addEventListener('click', () => addFriend(button.dataset.addFriend)));
    content.querySelectorAll('[data-remove-friend]').forEach((button) => button.addEventListener('click', () => removeFriend(button.dataset.removeFriend)));
    content.querySelectorAll('[data-toggle-favorite]').forEach((button) => button.addEventListener('click', () => toggleFavorite(button.dataset.toggleFavorite)));
  }

  async function searchFriend() {
    const input = overlay?.querySelector('[data-friend-query]');
    const target = overlay?.querySelector('[data-search-result]');
    const query = String(input?.value || '').trim();
    if (!query || !target || busy) return;
    target.innerHTML = '<div class="player-profile-loading">Ищем игрока…</div>';
    try {
      const result = await profileApi('profileSearch', { query });
      if (!result.found) {
        target.innerHTML = '<div class="player-profile-empty">Игрок не найден. Он должен хотя бы один раз запустить «Библейские игры».</div>';
        return;
      }
      if (result.user?.isSelf) {
        target.innerHTML = '<div class="player-profile-empty">Это ваш собственный профиль.</div>';
        return;
      }
      target.innerHTML = `<div class="player-profile-list">${personCard(result.user, { friend: Boolean(result.user.isFriend) })}</div>`;
      bindContent(target);
    } catch (error) {
      target.innerHTML = `<div class="player-profile-empty">${escapeHtml(error?.message || error)}</div>`;
    }
  }

  async function addFriend(id) {
    if (!id || busy) return;
    busy = true;
    try {
      await profileApi('profileAddFriend', { friendId: id });
      await reloadProfile(false);
      toast('Игрок добавлен в друзья');
    } catch (error) { toast(error?.message || error, true); }
    finally { busy = false; }
  }

  async function removeFriend(id) {
    if (!id || busy) return;
    busy = true;
    try {
      await profileApi('profileRemoveFriend', { friendId: id });
      await reloadProfile(false);
      toast('Игрок удалён из друзей');
    } catch (error) { toast(error?.message || error, true); }
    finally { busy = false; }
  }

  async function toggleFavorite(id) {
    if (!GAMES_BY_ID.has(id) || busy) return;
    const favorites = favoriteIds();
    if (favorites.has(id)) favorites.delete(id); else favorites.add(id);
    state.profile.favorites = [...favorites];
    render();
    busy = true;
    try {
      const result = await profileApi('profileSetFavorites', { favorites: [...favorites] });
      state.profile.favorites = result.favorites || [...favorites];
      toast(favorites.has(id) ? 'Добавлено в избранное' : 'Удалено из избранного');
    } catch (error) {
      toast(error?.message || error, true);
      await reloadProfile(false).catch(() => {});
    } finally { busy = false; render(); }
  }

  async function reloadProfile(refreshOnline = true) {
    const tasks = [profileApi('profileBootstrap')];
    if (refreshOnline) tasks.push(loadOnline().catch(() => []));
    const [profile] = await Promise.all(tasks);
    state = profile;
    hydrateIdentity();
    render();
  }

  async function refreshOnlineSilently() {
    try { await loadOnline(); render(); } catch (error) { console.warn('Profile online refresh:', error); }
  }

  function inferGameFromCard(card) {
    const text = String(card?.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase();
    if (!text) return '';
    const match = [...GAME_CATALOG].sort((a, b) => b.title.length - a.title.length).find((game) => text.includes(game.title.toLowerCase()));
    return match?.id || '';
  }

  function installGameTracking() {
    document.addEventListener('click', (event) => {
      const card = event.target?.closest?.('#menu-container .game-card');
      if (!card) return;
      const game = inferGameFromCard(card);
      if (!game) return;
      const now = Date.now();
      if (game === lastTrackedGame && now - lastTrackedAt < 1300) return;
      lastTrackedGame = game;
      lastTrackedAt = now;
      profileApi('profileTrackGame', { game }).then((result) => {
        if (state?.profile) {
          state.profile.gamesPlayed = Number(result.gamesPlayed || state.profile.gamesPlayed || 0);
          state.profile.gameStats = result.gameStats || state.profile.gameStats || {};
          state.profile.lastGame = result.lastGame || game;
        }
      }).catch((error) => console.warn('Profile track game:', error));
    }, true);
  }

  async function copyText(value, successMessage) {
    const text = String(value || '');
    if (!text) return;
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(text);
      else {
        const area = document.createElement('textarea');
        area.value = text; area.style.position = 'fixed'; area.style.opacity = '0'; document.body.appendChild(area); area.select(); document.execCommand('copy'); area.remove();
      }
      toast(successMessage || 'Скопировано');
    } catch { toast('Не удалось скопировать', true); }
  }

  function toast(message, error = false) {
    let node = document.querySelector('.player-profile-toast');
    if (!node) { node = document.createElement('div'); node.className = 'player-profile-toast'; document.body.appendChild(node); }
    node.textContent = String(message || '');
    node.classList.toggle('is-error', Boolean(error));
    node.classList.add('is-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => node.classList.remove('is-visible'), 2200);
  }

  function pluralGames(n) {
    const value = Math.abs(Number(n || 0)) % 100;
    const last = value % 10;
    if (value > 10 && value < 20) return 'партий';
    if (last === 1) return 'партия';
    if (last >= 2 && last <= 4) return 'партии';
    return 'партий';
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
  }
  function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

  async function init() {
    if (!(await waitForAdminContext())) return;
    const mount = () => {
      mountLauncher();
      installGameTracking();
    };
    if (document.documentElement.classList.contains('app-ui-ready')) mount();
    else window.addEventListener('app:menu-ready', mount, { once: true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
