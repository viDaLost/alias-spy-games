(() => {
  'use strict';
  if (window.__PLAYER_SOCIAL_DOCK_V2__) return;
  window.__PLAYER_SOCIAL_DOCK_V2__ = true;

  const CORE = String(document.querySelector('meta[name="app-core-backend"]')?.content || '').replace(/\/+$/, '');
  const GAME_CATALOG = [
    { id: 'alias', title: 'Alias', icon: 'web/assets/icons/alias.webp?v=1' },
    { id: 'coimaginarium', title: 'Piensa rápido', icon: 'web/assets/icons/idea.webp?v=1' },
    { id: 'guess', title: 'Adivina el personaje', icon: 'web/assets/icons/character.webp?v=1' },
    { id: 'describe', title: 'Describe sin nombrar', icon: 'web/assets/icons/describe.webp?v=1' },
    { id: 'spy', title: 'Espía', icon: 'web/assets/icons/spy.webp?v=1' },
    { id: 'quartet', title: 'Cuarteto', icon: 'web/assets/icons/quartet.webp?v=1' },
    { id: 'bible-sketch', title: 'Artista bíblico', icon: 'web/assets/icons/bible-sketch.webp?v=3' },
    { id: 'bible-wow', title: 'Palabras bíblicas', icon: 'web/assets/icons/words.webp?v=1' },
    { id: 'bible-wordsearch', title: 'Sopa de letras bíblica', icon: 'web/assets/icons/search.webp?v=1' },
    { id: 'sacred-word', title: 'Palabra sagrada', icon: 'web/assets/icons/sacred.webp?v=1' },
    { id: 'kids-ark-pairs', title: 'Encuentra la pareja', icon: 'web/assets/icons/ark.webp?v=1' },
    { id: 'moses-nile', title: 'Moisés: Viaje por el Nilo', icon: 'web/assets/icons/moses-nile.webp?v=1' },
    { id: 'biblical-match-three', title: 'Tesoros bíblicos', icon: 'web/assets/icons/biblical-treasures-v38.webp?v=39' },
  ];
  const GAMES = new Map(GAME_CATALOG.map((game) => [game.id, game]));

  let state = null;
  let bootstrapPromise = null;
  let dock = null;
  let overlay = null;
  let activeTab = 'profile';
  let loading = false;
  let busy = false;
  let toastTimer = 0;
  let lastTrackedAt = 0;
  let lastTrackedGame = '';
  let trackingInstalled = false;

  function tgUser() {
    return window.Telegram?.WebApp?.initDataUnsafe?.user || window.TelegramLaunchContext?.getUser?.() || null;
  }

  function initData() {
    return String(window.Telegram?.WebApp?.initData || window.TelegramLaunchContext?.getInitData?.() || '');
  }

  function hasTelegramSession() {
    return Boolean(tgUser()?.id && initData());
  }

  async function api(action, payload = {}) {
    if (!CORE) throw new Error('Servicio de perfil sin configurar');
    const telegramInitData = initData();
    if (!telegramInitData) throw new Error('Perfil disponible solo en Telegram');
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

  async function bootstrap(force = false) {
    if (state && !force) return state;
    if (bootstrapPromise && !force) return bootstrapPromise;

    const request = api('profileBootstrap').then((data) => {
      state = data;
      updateDock();
      return state;
    });

    bootstrapPromise = request;
    try {
      return await request;
    } finally {
      if (bootstrapPromise === request) bootstrapPromise = null;
    }
  }

  function initials(value) {
    const clean = String(value || '').replace(/^@/, '').trim();
    if (!clean) return 'BG';
    const parts = clean.split(/\s+/).filter(Boolean);
    return (parts.length > 1 ? `${parts[0][0]}${parts[1][0]}` : clean.slice(0, 2)).toUpperCase();
  }

  function displayName(user = {}) {
    const fromProfile = String(user.displayName || '').trim();
    if (fromProfile) return fromProfile;
    if (user.username) return `@${user.username}`;
    const current = tgUser() || {};
    const name = [current.first_name, current.last_name].filter(Boolean).join(' ').trim();
    return name || current.username || `Jugador ${String(user.id || current.id || '').slice(-4)}`;
  }

  function mountDock() {
    if (dock || !hasTelegramSession()) return;
    dock = document.createElement('nav');
    dock.className = 'social-bottom-dock';
    dock.setAttribute('aria-label', 'Perfil y favoritos');
    dock.innerHTML = `\n      <button type="button" class="social-dock-btn" data-social-open="favorites" aria-label="Abrir juegos favoritos">\n        <span class="social-dock-icon social-dock-icon--heart" aria-hidden="true">♥</span>\n        <span class="social-dock-label">Favoritos</span>\n        <span class="social-dock-badge" data-social-favorite-count hidden>0</span>\n      </button>\n      <span class="social-dock-separator" aria-hidden="true"></span>\n      <button type="button" class="social-dock-btn" data-social-open="profile" aria-label="Abrir perfil">\n        <span class="social-dock-avatar" data-social-avatar>BG</span>\n        <span class="social-dock-label">Perfil</span>\n      </button>`;
    dock.querySelectorAll('[data-social-open]').forEach((button) => {
      button.addEventListener('click', () => open(button.dataset.socialOpen));
    });
    document.body.appendChild(dock);
    document.documentElement.classList.add('social-dock-mounted');
    updateDock();
    bootstrap().catch((error) => console.warn('Social dock bootstrap:', error));
  }

  function updateDock() {
    if (!dock) return;
    const user = state?.user || tgUser() || {};
    const avatar = dock.querySelector('[data-social-avatar]');
    if (avatar) avatar.textContent = initials(displayName(user));
    const count = Number(state?.profile?.favorites?.length || 0);
    const badge = dock.querySelector('[data-social-favorite-count]');
    if (badge) {
      badge.textContent = String(count);
      badge.hidden = count <= 0;
    }
  }

  function ensureOverlay() {
    if (overlay) return overlay;
    overlay = document.createElement('div');
    overlay.className = 'social-sheet-overlay';
    overlay.innerHTML = `\n      <section class="social-sheet" role="dialog" aria-modal="true" aria-labelledby="social-sheet-title">\n        <div class="social-sheet-handle" aria-hidden="true"></div>\n        <header class="social-sheet-head">\n          <div class="social-sheet-head__avatar" data-sheet-avatar>BG</div>\n          <div class="social-sheet-head__identity">\n            <p>Tu perfil de juego</p>\n            <h2 id="social-sheet-title" data-sheet-name>Juegos bíblicos</h2>\n            <span data-sheet-meta>Cargando…</span>\n          </div>\n          <button type="button" class="social-sheet-close" data-social-close aria-label="Cerrar perfil">×</button>\n        </header>\n        <nav class="social-sheet-tabs" aria-label="Secciones del perfil">\n          <button type="button" data-social-tab="profile">Perfil</button>\n          <button type="button" data-social-tab="friends">Amigos</button>\n          <button type="button" data-social-tab="favorites">Favoritos</button>\n        </nav>\n        <div class="social-sheet-content" data-social-content></div>\n      </section>`;
    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) close();
    });
    overlay.querySelector('[data-social-close]')?.addEventListener('click', close);
    overlay.querySelectorAll('[data-social-tab]').forEach((button) => {
      button.addEventListener('click', () => setTab(button.dataset.socialTab));
    });
    document.body.appendChild(overlay);
    return overlay;
  }

  async function open(tab = 'profile') {
    if (!hasTelegramSession()) return;
    activeTab = normalizeTab(tab);
    ensureOverlay().classList.add('is-open');
    document.body.classList.add('social-sheet-open');
    syncTabs();

    if (state) {
      hydrateHeader();
      render();
      return;
    }

    loading = true;
    renderLoading();
    try {
      await bootstrap();
      hydrateHeader();
    } catch (error) {
      renderError(error);
      return;
    } finally {
      loading = false;
    }
    render();
  }

  function close() {
    overlay?.classList.remove('is-open');
    document.body.classList.remove('social-sheet-open');
  }

  function setTab(tab) {
    activeTab = normalizeTab(tab);
    syncTabs();
    render();
  }

  function normalizeTab(tab) {
    return ['profile', 'friends', 'favorites'].includes(tab) ? tab : 'profile';
  }

  function syncTabs() {
    overlay?.querySelectorAll('[data-social-tab]').forEach((button) => {
      const selected = button.dataset.socialTab === activeTab;
      button.classList.toggle('is-active', selected);
      button.setAttribute('aria-selected', String(selected));
    });
  }

  function hydrateHeader() {
    if (!overlay || !state?.user) return;
    const user = state.user;
    const name = displayName(user);
    const avatar = overlay.querySelector('[data-sheet-avatar]');
    const title = overlay.querySelector('[data-sheet-name]');
    const meta = overlay.querySelector('[data-sheet-meta]');
    if (avatar) avatar.textContent = initials(name);
    if (title) title.textContent = name;
    if (meta) meta.textContent = user.username ? `@${user.username}` : `ID ${user.id}`;
  }

  function contentNode() {
    return overlay?.querySelector('[data-social-content]') || null;
  }

  function renderLoading() {
    const content = contentNode();
    if (content) content.innerHTML = '<div class="social-loading"><span></span><p>Cargando perfil…</p></div>';
  }

  function renderError(error) {
    const content = contentNode();
    if (!content) return;
    content.innerHTML = `<div class="social-empty"><b>No se pudo abrir el perfil</b><span>${escapeHtml(error?.message || error)}</span><button type="button" data-social-retry>Reintentar</button></div>`;
    content.querySelector('[data-social-retry]')?.addEventListener('click', () => open(activeTab));
  }

  function render() {
    if (!state || loading) return;
    const content = contentNode();
    if (!content) return;
    if (activeTab === 'profile') content.innerHTML = renderProfile();
    if (activeTab === 'friends') content.innerHTML = renderFriends();
    if (activeTab === 'favorites') content.innerHTML = renderFavorites();
    bindContent(content);
  }

  function renderProfile() {
    const user = state.user || {};
    const profile = state.profile || {};
    const friends = Array.isArray(state.friends) ? state.friends : [];
    const stats = Object.entries(profile.gameStats || {})
      .sort((left, right) => Number(right[1]) - Number(left[1]))
      .slice(0, 4);
    const name = displayName(user);
    return `\n      <section class="social-hero">\n        <div class="social-hero-top">\n          <div><small>Perfil de juego</small><h3>${escapeHtml(name)}</h3><p>${user.username ? `@${escapeHtml(user.username)}` : 'Telegram username no indicado'}</p></div>
          <button type="button" class="social-id-chip" data-copy-id="${escapeHtml(user.id)}">ID ${escapeHtml(user.id)}</button>
        </div>
        <div class="social-stats">
          <div><b>${Number(profile.gamesPlayed || 0)}</b><span>partidas</span></div>\n          <div><b>${friends.length}</b><span>amigos</span></div>\n          <div><b>${Number(profile.favorites?.length || 0)}</b><span>favoritos</span></div>\n        </div>\n      </section>\n      <section class="social-section">\n        <div class="social-section-head"><h3>Estadísticas de juego</h3><span>sincronizados con la nube</span></div>\n        <div class="social-balances">\n          ${balance(user.wowStars, 'Palabras bíblicas')}
          ${balance(user.wsStars, 'Sopa de letras')}
          ${balance(user.swLevel, 'Palabra sagrada')}
          ${balance(user.bmtStars, 'Tesoros')}\n        </div>\n      </section>\n      <section class="social-section">\n        <div class="social-section-head"><h3>Más jugado</h3><span>${stats.length ? 'según tus estadísticas' : 'aún sin datos'}</span></div>
        <div class="social-game-stats">${stats.length ? stats.map(([id, count]) => gameStat(id, count)).join('') : '<div class="social-empty social-empty--compact"><span>Abre cualquier juego para ver aquí las estadísticas.</span></div>'}</div>
      </section>`;
  }

  function balance(value, title) {
    return `<div class="social-balance"><b>${Number(value || 0)}</b><span>${escapeHtml(title)}</span></div>`;
  }

  function gameStat(id, count) {
    const game = GAMES.get(id);
    if (!game) return '';
    return `<div class="social-game-stat"><img src="${game.icon}" alt="" loading="lazy"><div><b>${escapeHtml(game.title)}</b><span>${Number(count || 0)} ${pluralGames(Number(count || 0))}</span></div></div>`;
  }

  function renderFriends() {
    const friends = Array.isArray(state.friends) ? state.friends : [];
    return `\n      <div class="social-friend-search">\n        <input type="text" autocomplete="off" autocapitalize="off" placeholder="@username o Telegram ID" data-friend-query>\n        <button type="button" data-friend-search>Buscar</button>\n      </div>\n      <div data-friend-result></div>\n      <section class="social-section social-section--friends">\n        <div class="social-section-head"><h3>Mis amigos</h3><span>${friends.length}</span></div>
        <div class="social-person-list">${friends.length ? friends.map((friend) => personCard(friend, true)).join('') : '<div class="social-empty"><b>Tu lista de amigos está vacía</b><span>Busca a alguien por @username o Telegram ID. Después de añadirlo, podrás invitarlo directamente a las salas.</span></div>'}</div>
      </section>`;
  }

  function personCard(person = {}, isFriend = false) {
    const id = String(person.id || '');
    const name = displayName(person);
    const sub = person.username ? `@${person.username}` : `ID ${id}`;
    return `<article class="social-person">
      <span class="social-person-avatar">${escapeHtml(initials(name))}</span>
      <span class="social-person-info"><b>${escapeHtml(name)}</b><small>${escapeHtml(sub)}</small></span>
      <span class="social-person-actions">${isFriend
        ? `<button type="button" class="is-danger" data-remove-friend="${escapeHtml(id)}">Eliminar</button>`
        : `<button type="button" data-add-friend="${escapeHtml(id)}">+ Amigo</button>`}</span>
    </article>`;
  }

  function renderFavorites() {
    const favorites = new Set(state.profile?.favorites || []);
    return `<div class="social-favorite-intro"><b>Juegos favoritos</b><span>Los juegos favoritos se guardan en tu perfil y están disponibles en cualquier dispositivo.</span></div><div class="social-favorites-grid">${GAME_CATALOG.map((game) => {
      const selected = favorites.has(game.id);
      return `<button type="button" class="social-favorite ${selected ? 'is-selected' : ''}" data-toggle-favorite="${game.id}">
        <img src="${game.icon}" alt="" loading="lazy"><span><b>${escapeHtml(game.title)}</b><small>${selected ? 'En favoritos' : 'Añadir'}</small></span><i aria-hidden="true">♥</i>
      </button>`;
    }).join('')}</div>`;
  }

  function bindContent(content) {
    content.querySelector('[data-copy-id]')?.addEventListener('click', (event) => copyText(event.currentTarget.dataset.copyId));
    content.querySelector('[data-friend-search]')?.addEventListener('click', searchFriend);
    content.querySelector('[data-friend-query]')?.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') searchFriend();
    });
    content.querySelectorAll('[data-add-friend]').forEach((button) => {
      button.addEventListener('click', () => addFriend(button.dataset.addFriend));
    });
    content.querySelectorAll('[data-remove-friend]').forEach((button) => {
      button.addEventListener('click', () => removeFriend(button.dataset.removeFriend));
    });
    content.querySelectorAll('[data-toggle-favorite]').forEach((button) => {
      button.addEventListener('click', () => toggleFavorite(button.dataset.toggleFavorite));
    });
  }

  async function searchFriend() {
    const input = overlay?.querySelector('[data-friend-query]');
    const target = overlay?.querySelector('[data-friend-result]');
    const query = String(input?.value || '').trim();
    if (!query || !target || busy) return;
    target.innerHTML = '<div class="social-inline-loading">Buscando jugador…</div>';
    try {
      const result = await api('profileSearch', { query });
      if (!result.found) {
        target.innerHTML = '<div class="social-empty social-empty--compact"><span>Jugador no encontrado. Debe abrir Juegos bíblicos al menos una vez.</span></div>';
        return;
      }
      if (result.user?.isSelf) {
        target.innerHTML = '<div class="social-empty social-empty--compact"><span>Este es tu propio perfil.</span></div>';
        return;
      }
      target.innerHTML = `<div class="social-person-list social-search-result">${personCard(result.user, Boolean(result.user.isFriend))}</div>`;
      bindContent(target);
    } catch (error) {
      target.innerHTML = `<div class="social-empty social-empty--compact"><span>${escapeHtml(error?.message || error)}</span></div>`;
    }
  }

  async function addFriend(id) {
    if (!id || busy) return;
    busy = true;
    try {
      await api('profileAddFriend', { friendId: id });
      await refresh();
      activeTab = 'friends';
      syncTabs();
      render();
      toast('Jugador añadido a amigos');
      window.dispatchEvent(new CustomEvent('playersocialchange', { detail: { type: 'friends' } }));
    } catch (error) {
      toast(error?.message || error, true);
    } finally {
      busy = false;
    }
  }

  async function removeFriend(id) {
    if (!id || busy) return;
    busy = true;
    try {
      await api('profileRemoveFriend', { friendId: id });
      await refresh();
      activeTab = 'friends';
      syncTabs();
      render();
      toast('Jugador eliminado de amigos');
      window.dispatchEvent(new CustomEvent('playersocialchange', { detail: { type: 'friends' } }));
    } catch (error) {
      toast(error?.message || error, true);
    } finally {
      busy = false;
    }
  }

  async function toggleFavorite(id) {
    if (!GAMES.has(id) || busy || !state?.profile) return;
    const previous = [...(state.profile.favorites || [])];
    const favorites = new Set(previous);
    if (favorites.has(id)) favorites.delete(id); else favorites.add(id);
    state.profile.favorites = [...favorites];
    updateDock();
    render();
    busy = true;
    try {
      const result = await api('profileSetFavorites', { favorites: [...favorites] });
      state.profile.favorites = Array.isArray(result.favorites) ? result.favorites : [...favorites];
      updateDock();
      render();
      toast(favorites.has(id) ? 'Añadido a favoritos' : 'Eliminado de favoritos');
    } catch (error) {
      state.profile.favorites = previous;
      updateDock();
      render();
      toast(error?.message || error, true);
    } finally {
      busy = false;
    }
  }

  async function refresh() {
    state = await api('profileBootstrap');
    updateDock();
    hydrateHeader();
    return state;
  }

  function inferGame(card) {
    const explicit = String(card?.dataset?.gameKey || card?.dataset?.game || '').trim();
    if (GAMES.has(explicit)) return explicit;
    const text = String(card?.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase();
    if (!text) return '';
    return [...GAME_CATALOG].sort((a, b) => b.title.length - a.title.length)
      .find((game) => text.includes(game.title.toLowerCase()))?.id || '';
  }

  function installTracking() {
    if (trackingInstalled) return;
    trackingInstalled = true;
    document.addEventListener('click', (event) => {
      const card = event.target?.closest?.('#menu-container .game-card');
      if (!card) return;
      const game = inferGame(card);
      if (!game) return;
      const now = Date.now();
      if (game === lastTrackedGame && now - lastTrackedAt < 1300) return;
      lastTrackedGame = game;
      lastTrackedAt = now;
      api('profileTrackGame', { game }).then((result) => {
        if (!state?.profile) return;
        state.profile.gamesPlayed = Number(result.gamesPlayed || state.profile.gamesPlayed || 0);
        state.profile.gameStats = result.gameStats || state.profile.gameStats || {};
        state.profile.lastGame = result.lastGame || game;
      }).catch((error) => console.warn('Social game tracking:', error));
    }, true);
  }

  async function copyText(value) {
    const text = String(value || '');
    if (!text) return;
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(text);
      else {
        const area = document.createElement('textarea');
        area.value = text;
        area.style.position = 'fixed';
        area.style.opacity = '0';
        document.body.appendChild(area);
        area.select();
        document.execCommand('copy');
        area.remove();
      }
      toast('ID copiado');
    } catch {
      toast('No se pudo copiar ID', true);
    }
  }

  function toast(message, isError = false) {
    let node = document.querySelector('.social-toast');
    if (!node) {
      node = document.createElement('div');
      node.className = 'social-toast';
      document.body.appendChild(node);
    }
    node.textContent = String(message || '');
    node.classList.toggle('is-error', Boolean(isError));
    node.classList.add('is-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => node.classList.remove('is-visible'), 2300);
  }

  function pluralGames(number) {
    const value = Math.abs(Number(number || 0)) % 100;
    const last = value % 10;
    if (value > 10 && value < 20) return 'partidas';
    if (last === 1) return 'partida';
    if (last >= 2 && last <= 4) return 'partidas';
    return 'partidas';
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>'"]/g, (char) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
    }[char]));
  }

  function mountWhenReady() {
    if (!hasTelegramSession()) return;
    mountDock();
    installTracking();
  }

  window.PlayerSocial = Object.freeze({
    api,
    bootstrap,
    refresh,
    open,
    close,
    getState: () => state,
  });

  if (document.documentElement.classList.contains('app-ui-ready')) mountWhenReady();
  else window.addEventListener('app:menu-ready', mountWhenReady, { once: true });
  window.addEventListener('telegram:sdk-ready', mountWhenReady);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mountWhenReady, { once: true });
  else mountWhenReady();
})();
