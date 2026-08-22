(() => {
  if (window.__APP_TELEMETRY_DISABLED__) return;

  const observability = metaUrl('app-observability');
  const quartetBackend = metaUrl('quartet-backend');
  const sketchBackend = metaUrl('bible-sketch-backend');
  const coreBackend = metaUrl('app-core-backend');
  if (!observability || !coreBackend) return;

  const GAMES = [
    ['alias', 'Алиас'], ['coimaginarium', 'Соображариум'], ['guess', 'Угадай персонажа'],
    ['describe', 'Опиши, но не называй'], ['spy', 'Шпион'], ['quartet', 'Квартет'],
    ['bible-sketch', 'Библейский художник'], ['bible-wow', 'Библейские слова'],
    ['bible-wordsearch', 'Поиск слов'], ['sacred-word', 'Священное слово'],
    ['kids-ark-pairs', 'Найди пару'], ['biblical-match-three', 'Библейские сокровища'],
  ];
  const GAME_NAMES = Object.fromEntries(GAMES);
  const BALANCES = [
    { type: 'stars_wow', field: 'wowStars', label: 'Слова', icon: '✦' },
    { type: 'stars_ws', field: 'wsStars', label: 'Поиск', icon: '★' },
    { type: 'stars_sw', field: 'swLevel', label: 'Свящ.', icon: '◆' },
    { type: 'stars_bmt', field: 'bmtStars', label: 'Сокровища', icon: '🏆' },
  ];

  let live = null;
  let historical = {};
  const profiles = new Map();
  let profileCacheAt = 0;
  let refreshTimer = 0;
  let historyTimer = 0;
  let observerTimer = 0;
  let observerRoom = null;
  let observerEtag = '';
  let liveRequest = null;
  let profileRequest = null;
  let adminSessionToken = '';
  let adminSessionExpiresAt = 0;
  let adminSessionPromise = null;
  let mountObserver = null;
  let scheduled = 0;
  let modalRestoreFocus = null;
  const busyBalances = new Set();

  function metaUrl(name) { return String(document.querySelector(`meta[name="${name}"]`)?.content || '').replace(/\/+$/, ''); }
  function initData() { return String(window.Telegram?.WebApp?.initData || ''); }
  function currentAdminId() { return String(window.Telegram?.WebApp?.initDataUnsafe?.user?.id || ''); }

  async function ensureAdminSession(force = false) {
    const now = Date.now();
    if (!force && adminSessionToken && adminSessionExpiresAt - now > 45_000) return adminSessionToken;
    if (adminSessionPromise) return adminSessionPromise;
    const telegramInitData = initData();
    if (!telegramInitData) throw new Error('Админ-панель доступна только внутри Telegram');
    adminSessionPromise = (async () => {
      const response = await fetch(`${coreBackend}/web/session`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, cache: 'no-store',
        body: JSON.stringify({ telegramInitData, scope: 'admin' }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data?.ok !== true || !data?.token) throw new Error(data?.error || `Session HTTP ${response.status}`);
      adminSessionToken = String(data.token);
      adminSessionExpiresAt = Number(data.expiresAt || 0);
      return adminSessionToken;
    })().finally(() => { adminSessionPromise = null; });
    return adminSessionPromise;
  }

  async function adminFetch(url, options = {}, retry = true) {
    const token = await ensureAdminSession();
    const headers = new Headers(options.headers || {});
    headers.set('Authorization', `Bearer ${token}`);
    const response = await fetch(url, { ...options, headers, cache: 'no-store' });
    if (retry && (response.status === 401 || response.status === 403)) {
      adminSessionToken = '';
      adminSessionExpiresAt = 0;
      await ensureAdminSession(true);
      return adminFetch(url, options, false);
    }
    return response;
  }

  async function ensurePanel() {
    const page = document.querySelector('.admin-v2, .admin-page');
    if (!page) return;
    document.getElementById('admin-live-stats')?.classList.add('admin-live-legacy-hidden');
    document.getElementById('admin-live-v2')?.remove();
    let panel = document.getElementById('admin-live-v3');
    if (panel) return;

    panel = document.createElement('section');
    panel.id = 'admin-live-v3';
    panel.className = 'admin-live-v3';
    panel.setAttribute('aria-label', 'Живой мониторинг и управление');
    const stats = page.querySelector('.admin-v2__stats');
    const header = page.querySelector('.admin-v2__header');
    if (stats) stats.after(panel); else if (header) header.after(panel); else page.prepend(panel);

    const cached = readCache();
    if (cached) { live = cached; render(); }
    else panel.innerHTML = '<div class="admin-live-v3__loading"><span></span>Получаем онлайн…</div>';

    try { await ensureAdminSession(); }
    catch (error) { panel.innerHTML = `<div class="admin-live-v3__loading is-error">${escapeText(error?.message || error)}</div>`; return; }
    refreshLive();
    refreshHistorical();
    clearInterval(refreshTimer); clearInterval(historyTimer);
    refreshTimer = setInterval(() => document.getElementById('admin-live-v3') ? refreshLive() : clearInterval(refreshTimer), 5_000);
    historyTimer = setInterval(() => document.getElementById('admin-live-v3') ? refreshHistorical() : clearInterval(historyTimer), 30_000);
  }

  async function refreshLive(forceProfiles = false) {
    const panel = document.getElementById('admin-live-v3');
    if (!panel) return;
    if (liveRequest) return liveRequest;
    liveRequest = (async () => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 4500);
      try {
        const response = await adminFetch(`${observability}/admin/live`, { signal: controller.signal });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || !data?.ok) throw new Error(data?.error || `HTTP ${response.status}`);
        live = data; writeCache(data); render();
        enrichProfiles(data.onlineUsers || [], forceProfiles);
      } catch (error) {
        console.warn('Admin live refresh:', error);
        if (!live) panel.innerHTML = '<div class="admin-live-v3__loading is-error">Онлайн временно недоступен. Нажмите «Обновить».</div>';
      } finally { clearTimeout(timeout); }
    })().finally(() => { liveRequest = null; });
    return liveRequest;
  }

  async function refreshHistorical() {
    try {
      const response = await adminFetch(`${observability}/admin/stats`);
      const data = await response.json().catch(() => ({}));
      if (response.ok && data?.ok) { historical = data; render(); }
    } catch (error) { console.warn('Admin historical stats:', error); }
  }

  async function enrichProfiles(users, force = false) {
    const ids = [...new Set(users.map((user) => String(user.id || '')).filter(Boolean))];
    return enrichProfileIds(ids, force);
  }

  async function enrichProfileIds(ids, force = false) {
    const unique = [...new Set(ids.map(String).filter((id) => /^\d{5,20}$/.test(id)))];
    if (!unique.length || typeof window.apiRequest !== 'function') return;
    const now = Date.now();
    const needed = force || now - profileCacheAt >= 20_000 ? unique : unique.filter((id) => !profiles.has(id));
    if (!needed.length) return;
    if (profileRequest) { await profileRequest; return enrichProfileIds(unique, force); }
    profileRequest = (async () => {
      for (let index = 0; index < needed.length; index += 75) {
        const chunk = needed.slice(index, index + 75);
        const result = await adminApi({ action: 'getAdminUsersByIds', ids: chunk });
        if (result?.success === false || result?.ok === false) throw new Error(result?.error || 'Profile load failed');
        for (const user of result?.users || []) profiles.set(String(user.id), normalizeProfile(user));
      }
      profileCacheAt = Date.now();
      render();
      hydrateAdminBmtFields();
    })().catch((error) => console.warn('Admin live profiles:', error)).finally(() => { profileRequest = null; });
    return profileRequest;
  }

  function capturePanelState(panel) {
    const active = document.activeElement;
    return {
      gamesOpen: Boolean(panel.querySelector('.admin-live-v3__games')?.open),
      focus: active && panel.contains(active) ? focusSignature(active) : '',
    };
  }

  function focusSignature(node) {
    for (const key of ['liveRefresh', 'userChat', 'observeRoom', 'balanceAdjust']) {
      const dataKey = key.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
      if (node.dataset?.[key] !== undefined) return `[data-${dataKey}="${CSS.escape(String(node.dataset[key]))}"]`;
    }
    return '';
  }

  function render() {
    const panel = document.getElementById('admin-live-v3');
    if (!panel || !live) return;
    const preserved = capturePanelState(panel);
    const users = Array.isArray(live.onlineUsers) ? live.onlineUsers : [];
    const current = live.currentGames || {};
    const generated = new Date(live.generatedAt || Date.now()).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const gameCards = GAMES.map(([key, title]) => `<div class="admin-live-v3__game ${Number(current[key] || 0) ? 'is-active' : ''}"><b>${Number(current[key] || 0)}</b><span>${escapeText(title)}</span></div>`).join('');
    const people = users.length ? users.map(renderOnlineUser).join('') : '<div class="admin-live-v3__empty">Сейчас нет проверенных пользователей онлайн.</div>';
    panel.innerHTML = `
      <div class="admin-live-v3__head"><div><span class="admin-live-v3__eyebrow">Живой мониторинг</span><h3>Онлайн и управление</h3></div><button type="button" data-live-refresh aria-label="Обновить данные">↻</button></div>
      <div class="admin-live-v3__summary"><div><b>${Number(live.onlineNow || 0)}</b><span>онлайн</span></div><div><b>${Number(live.menuNow || 0)}</b><span>в меню</span></div><div><b>${Number(live.activeRoomsNow || 0)}</b><span>комнат</span></div><div><b>${Number(historical.peakOnlineToday || live.onlineNow || 0)}</b><span>пик сегодня</span></div></div>
      <details class="admin-live-v3__games" ${preserved.gamesOpen ? 'open' : ''}><summary>Игры сейчас</summary><div>${gameCards}</div></details>
      <div class="admin-live-v3__section-head"><b>Кто сейчас онлайн</b><span>${users.length}</span></div>
      <div class="admin-live-v3__people">${people}</div>
      <div class="admin-live-v3__foot">Live ${generated} · ${Math.round(Number(live.strictPresenceWindowMs || 0) / 1000)} сек${historical.errorsToday !== undefined ? ` · ошибок сегодня ${Number(historical.errorsToday || 0)}` : ''}</div>`;
    bindPanelActions(panel);
    if (preserved.focus) requestAnimationFrame(() => panel.querySelector(preserved.focus)?.focus({ preventScroll: true }));
  }

  function renderOnlineUser(user) {
    const id = String(user.id || '');
    const profile = profiles.get(id);
    const name = user.username ? `@${user.username}` : (user.displayName || `ID ${id}`);
    const gameName = user.game ? (GAME_NAMES[user.game] || user.game) : 'Главное меню';
    const roomText = user.roomId ? ` · ${user.roomId}` : '';
    const platform = user.platform === 'android' ? 'Android' : 'Telegram';
    const canObserve = Boolean(user.roomId && (user.game === 'quartet' || user.game === 'bible-sketch'));
    const balances = profile ? BALANCES.map((item) => renderBalance(id, profile, item)).join('') : '<div class="admin-live-v3__profile-loading">Баланс загружается…</div>';
    return `<article class="admin-live-v3__person" data-live-user="${escapeText(id)}"><div class="admin-live-v3__identity"><span class="admin-live-v3__dot"></span><div class="admin-live-v3__avatar">${escapeText(initials(name))}</div><div class="admin-live-v3__name"><b>${escapeText(name)}</b><small>ID ${escapeText(id)} · ${escapeText(gameName + roomText)} · ${platform}</small></div><button type="button" class="admin-live-v3__chat" data-user-chat="${escapeText(id)}">Чат</button></div><div class="admin-live-v3__balances">${balances}</div>${canObserve ? `<button type="button" class="admin-live-v3__observe" data-observe-game="${escapeText(user.game)}" data-observe-room="${escapeText(user.roomId)}">◉ Наблюдать за комнатой · только чтение</button>` : ''}</article>`;
  }

  function renderBalance(id, profile, item) {
    const value = Number(profile[item.field] || 0);
    const key = `${id}:${item.type}`;
    const disabled = busyBalances.has(key) ? 'disabled' : '';
    return `<div class="admin-live-v3__balance" data-balance-type="${item.type}"><span>${item.icon} ${escapeText(item.label)}</span><div><button type="button" ${disabled} data-balance-adjust="-1" data-user-id="${escapeText(id)}" data-type="${item.type}" aria-label="Уменьшить ${escapeText(item.label)}">−</button><b>${value}</b><button type="button" ${disabled} data-balance-adjust="1" data-user-id="${escapeText(id)}" data-type="${item.type}" aria-label="Увеличить ${escapeText(item.label)}">+</button></div></div>`;
  }

  function bindPanelActions(panel) {
    panel.querySelector('[data-live-refresh]')?.addEventListener('click', () => refreshLive(true));
    panel.querySelectorAll('[data-balance-adjust]').forEach((button) => button.addEventListener('click', () => adjustBalance(button)));
    panel.querySelectorAll('[data-user-chat]').forEach((button) => button.addEventListener('click', () => openUserChat(button.dataset.userChat, button)));
    panel.querySelectorAll('[data-observe-room]').forEach((button) => button.addEventListener('click', () => openObserver(button.dataset.observeGame, button.dataset.observeRoom, button)));
  }

  async function adjustBalance(button) {
    const id = String(button.dataset.userId || '');
    const type = String(button.dataset.type || '');
    const delta = Number(button.dataset.balanceAdjust || 0);
    const meta = BALANCES.find((item) => item.type === type);
    const profile = profiles.get(id);
    const key = `${id}:${type}`;
    if (!meta || !profile || !delta || busyBalances.has(key)) return;
    const previous = Number(profile[meta.field] || 0);
    const next = Math.max(0, previous + delta);
    busyBalances.add(key); profile[meta.field] = next; render();
    try {
      const result = await adminApi({ action: 'updateUser', updateData: { targetId: id, type, value: next } });
      if (result?.success === false || result?.ok === false) throw new Error(result?.error || 'Не удалось сохранить');
      if (type === 'stars_bmt' && result?.bmtStars !== undefined) profile.bmtStars = Number(result.bmtStars || 0);
      haptic('success');
    } catch (error) {
      profile[meta.field] = previous;
      toast(String(error?.message || error), 'error');
    } finally { busyBalances.delete(key); render(); }
  }

  function openUserChat(id, opener) {
    const profile = profiles.get(String(id));
    const link = String(profile?.link || '');
    if (/^https:\/\/t\.me\/[A-Za-z0-9_]{3,64}$/i.test(link)) {
      if (window.Telegram?.WebApp?.openTelegramLink) window.Telegram.WebApp.openTelegramLink(link); else window.open(link, '_blank', 'noopener,noreferrer');
      return;
    }
    openMessageModal(String(id), profile?.username || '', opener);
  }

  function openMessageModal(id, username, opener) {
    closeModal('admin-live-message-modal');
    const modal = document.createElement('div');
    modal.id = 'admin-live-message-modal'; modal.className = 'admin-live-v3__modal';
    modal.innerHTML = `<div class="admin-live-v3__modal-card" role="dialog" aria-modal="true" aria-labelledby="admin-live-message-title"><button type="button" class="admin-live-v3__close" data-modal-close aria-label="Закрыть">×</button><span class="admin-live-v3__eyebrow">Сообщение через бота</span><h3 id="admin-live-message-title">${escapeText(username ? '@' + username : 'ID ' + id)}</h3><p>Сообщение придёт пользователю в личный чат бота «Библейские игры».</p><textarea maxlength="2000" aria-label="Текст сообщения" placeholder="Напишите сообщение…"></textarea><button type="button" class="admin-live-v3__primary" data-send-message>Отправить</button></div>`;
    document.body.append(modal); setupModal(modal, opener, () => modal.remove());
    modal.querySelector('[data-send-message]')?.addEventListener('click', async (event) => {
      const text = String(modal.querySelector('textarea')?.value || '').trim(); if (!text) return;
      const send = event.currentTarget; send.disabled = true;
      try { const result = await adminApi({ action: 'adminMessageUser', targetId: id, message: text }); if (result?.success === false || result?.ok === false) throw new Error(result?.error || 'Не удалось отправить'); closeModal('admin-live-message-modal'); toast('Сообщение отправлено', 'success'); }
      catch (error) { toast(String(error?.message || error), 'error'); send.disabled = false; }
    });
    requestAnimationFrame(() => modal.querySelector('textarea')?.focus());
  }

  function openObserver(game, roomId, opener) {
    closeObserver(); observerEtag = '';
    const modal = document.createElement('div'); modal.id = 'admin-room-observer'; modal.className = 'admin-live-v3__modal admin-live-v3__observer-modal';
    modal.innerHTML = `<div class="admin-live-v3__observer-card" role="dialog" aria-modal="true" aria-labelledby="admin-room-observer-title"><div class="admin-live-v3__observer-head"><div><span class="admin-live-v3__eyebrow">Невидимый монитор</span><h3 id="admin-room-observer-title">${escapeText(GAME_NAMES[game] || game)} · ${escapeText(roomId)}</h3><small>Только чтение · администратор не добавляется в комнату</small></div><button type="button" class="admin-live-v3__close" data-observer-close aria-label="Закрыть">×</button></div><div class="admin-live-v3__observer-body"><div class="admin-live-v3__loading"><span></span>Подключаем отчёт…</div></div></div>`;
    document.body.append(modal); observerRoom = { game, roomId, modal, opener }; setupModal(modal, opener, closeObserver); pollObserver();
  }

  async function pollObserver() {
    if (!observerRoom) return;
    const currentObserver = observerRoom;
    const { game, roomId, modal } = currentObserver;
    const backend = game === 'quartet' ? quartetBackend : sketchBackend;
    let nextDelay = 2500;
    if (!backend) return;
    try {
      const headers = observerEtag ? { 'If-None-Match': observerEtag } : {};
      const response = await adminFetch(`${backend}/admin/rooms/${encodeURIComponent(roomId)}/state`, { headers });
      if (response.status === 304) nextDelay = 4000;
      else {
        const data = await response.json().catch(() => ({}));
        if (!response.ok || !data?.ok) throw new Error(data?.error || `HTTP ${response.status}`);
        observerEtag = response.headers.get('ETag') || observerEtag;
        const body = modal.querySelector('.admin-live-v3__observer-body');
        if (body) body.innerHTML = game === 'quartet' ? renderQuartetObserver(data) : renderSketchObserver(data);
      }
    } catch (error) {
      const body = modal.querySelector('.admin-live-v3__observer-body'); if (body) body.innerHTML = `<div class="admin-live-v3__empty">${escapeText(String(error?.message || error))}</div>`;
      nextDelay = 4000;
    }
    clearTimeout(observerTimer);
    if (observerRoom === currentObserver) observerTimer = setTimeout(pollObserver, nextDelay);
  }

  function renderQuartetObserver(data) {
    const players = (data.players || []).map((player) => `<div class="admin-live-v3__observer-player ${player.playerId === data.turnPlayerId ? 'is-turn' : ''}"><b>${escapeText(player.name)}</b><span>${Number(player.cardsCount || 0)} карт · ${Number(player.quartetsCount || 0)} квартетов${player.connected ? ' · онлайн' : ''}</span></div>`).join('');
    return `<div class="admin-live-v3__observer-stats"><div><span>Статус</span><b>${escapeText(phaseLabel(data.status))}</b></div><div><span>Ход</span><b>${escapeText(data.turnPlayerName || '—')}</b></div></div><div class="admin-live-v3__observer-players">${players}</div>${renderLog(data.log)}`;
  }

  function renderSketchObserver(data) {
    const players = (data.players || []).map((player) => `<div class="admin-live-v3__observer-player ${player.playerId === data.currentDrawerId ? 'is-turn' : ''}"><b>${escapeText(player.name)}</b><span>${player.isCurrentDrawer ? 'рисует сейчас' : (player.connected ? 'онлайн' : 'не в сети')}</span></div>`).join('');
    const cycle = data.drawingCycle ? `${Number(data.drawingCycle)}/${Number(data.drawingCycles || 2)}` : '—';
    return `<div class="admin-live-v3__observer-stats"><div><span>Этап</span><b>${escapeText(phaseLabel(data.status))}</b></div><div><span>Рисует</span><b>${escapeText(data.currentDrawerName || '—')}</b></div><div><span>Круг</span><b>${cycle}</b></div><div><span>Линий</span><b>${Number(data.strokeCount || 0)}</b></div></div><div class="admin-live-v3__observer-players">${players}</div>${renderLog(data.log)}`;
  }

  function renderLog(log) { const items = (Array.isArray(log) ? log.slice(-12).reverse() : []).map((line) => `<li>${escapeText(line)}</li>`).join(''); return `<div class="admin-live-v3__observer-log"><b>Последние события</b><ol>${items || '<li>Событий пока нет</li>'}</ol></div>`; }

  function setupModal(modal, opener, closeFn) {
    modalRestoreFocus = opener || document.activeElement; document.body.classList.add('admin-live-modal-open');
    modal.addEventListener('click', (event) => { if (event.target === modal || event.target.closest('[data-modal-close],[data-observer-close]')) closeFn(); });
    modal.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') { event.preventDefault(); closeFn(); return; }
      if (event.key !== 'Tab') return;
      const focusable = [...modal.querySelectorAll('button:not([disabled]),textarea:not([disabled]),input:not([disabled]),a[href]')];
      if (!focusable.length) return;
      const first = focusable[0], last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    });
  }

  function closeObserver() { clearTimeout(observerTimer); observerTimer = 0; const opener = observerRoom?.opener; observerRoom?.modal?.remove(); observerRoom = null; observerEtag = ''; document.body.classList.remove('admin-live-modal-open'); requestAnimationFrame(() => opener?.focus?.({ preventScroll: true })); }
  function closeModal(id) { const modal = document.getElementById(id); if (!modal) return; modal.remove(); document.body.classList.remove('admin-live-modal-open'); const restore = modalRestoreFocus; modalRestoreFocus = null; requestAnimationFrame(() => restore?.focus?.({ preventScroll: true })); }

  async function adminApi(payload) {
    if (typeof window.apiRequest !== 'function') throw new Error('API недоступен');
    return window.apiRequest({ ...payload, adminId: currentAdminId(), telegramInitData: initData() });
  }

  function enhanceAdminUserCards() {
    const cards = [...document.querySelectorAll('.admin-v2-user[data-admin-user]')];
    const ids = [];
    for (const card of cards) {
      const id = String(card.dataset.adminUser || ''); if (!/^\d{5,20}$/.test(id)) continue; ids.push(id);
      if (card.querySelector('[data-admin-bmt-input]')) continue;
      const scores = card.querySelector('.admin-v2-user__scores'); if (!scores) continue;
      const label = document.createElement('label'); label.className = 'admin-live-v3__bmt-admin-field';
      label.innerHTML = `<span>Библейские сокровища</span><div><input type="number" min="0" max="999999" inputmode="numeric" data-admin-bmt-input="${escapeText(id)}" placeholder="…"><button type="button" data-admin-bmt-save="${escapeText(id)}">Сохранить 🏆</button></div>`;
      scores.appendChild(label);
      label.querySelector('[data-admin-bmt-save]')?.addEventListener('click', () => saveAdminBmtField(card, id));
    }
    hydrateAdminBmtFields();
    enrichProfileIds(ids, false);
  }

  function hydrateAdminBmtFields() {
    document.querySelectorAll('[data-admin-bmt-input]').forEach((input) => {
      const id = String(input.dataset.adminBmtInput || ''); const profile = profiles.get(id);
      if (profile && document.activeElement !== input) input.value = String(Number(profile.bmtStars || 0));
    });
  }

  async function saveAdminBmtField(card, id) {
    const input = card.querySelector(`[data-admin-bmt-input="${CSS.escape(id)}"]`); const button = card.querySelector(`[data-admin-bmt-save="${CSS.escape(id)}"]`);
    if (!input || !button) return;
    const value = Math.max(0, Math.min(999999, Math.trunc(Number(input.value || 0)))); button.disabled = true;
    try { const result = await adminApi({ action: 'updateUser', updateData: { targetId: id, type: 'stars_bmt', value } }); if (result?.success === false || result?.ok === false) throw new Error(result?.error || 'Не удалось сохранить'); const profile = profiles.get(id) || normalizeProfile({ id }); profile.bmtStars = Number(result?.bmtStars ?? value); profiles.set(id, profile); input.value = String(profile.bmtStars); toast('Баланс сокровищ сохранён', 'success'); }
    catch (error) { toast(String(error?.message || error), 'error'); }
    finally { button.disabled = false; }
  }

  function normalizeProfile(user = {}) { return { id: String(user.id || ''), username: String(user.username || ''), link: String(user.link || ''), wowStars: num(user.wowStars, 20), wsStars: num(user.wsStars, 0), swLevel: num(user.swLevel, 0), bmtStars: num(user.bmtStars, 0), bmtRevision: num(user.bmtRevision, 0), isBanned: Boolean(user.isBanned) }; }
  function num(value, fallback = 0) { const n = Number(value); return Number.isFinite(n) ? Math.trunc(n) : fallback; }
  function initials(name) { const clean = String(name || '?').replace(/^@/, '').trim(); return (clean[0] || '?').toUpperCase(); }
  function phaseLabel(value) { return ({ lobby: 'Лобби', playing: 'Игра', drawing: 'Рисование', voting: 'Голосование', answerReview: 'Проверка ответа', finalGuess: 'Финальный ответ', finished: 'Завершено' }[value] || String(value || '—')); }
  function escapeText(value) { return String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch])); }
  function haptic(type = 'selection') { try { if (type === 'selection') window.Telegram?.WebApp?.HapticFeedback?.selectionChanged?.(); else window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred?.(type); } catch {} }
  function toast(message, tone = '') { if (typeof window.showToast === 'function') return window.showToast(message, tone); console.log(message); }
  function writeCache(data) { try { sessionStorage.setItem('admin_live_v3_cache', JSON.stringify({ at: Date.now(), data })); } catch {} }
  function readCache() { try { const value = JSON.parse(sessionStorage.getItem('admin_live_v3_cache') || 'null'); return value && Date.now() - Number(value.at || 0) < 60_000 ? value.data : null; } catch { return null; } }

  function runMount() {
    scheduled = 0;
    ensurePanel();
    enhanceAdminUserCards();
  }

  function scheduleMount() {
    if (scheduled) return;
    scheduled = setTimeout(runMount, 60);
  }

  mountObserver = new MutationObserver(scheduleMount);
  mountObserver.observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ['class', 'data-mode'] });
  window.addEventListener('pageshow', scheduleMount);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) scheduleMount(); });
  window.addEventListener('pagehide', () => { closeObserver(); clearInterval(refreshTimer); clearInterval(historyTimer); mountObserver?.disconnect(); });
  window.AdminLiveV3 = Object.freeze({ mount: scheduleMount, refresh: () => refreshLive(true) });
  scheduleMount();
})();
