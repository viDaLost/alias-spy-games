(() => {
  if (window.__APP_TELEMETRY_DISABLED__) return;
  const ADMIN_ID = '1288379477';
  const observability = String(document.querySelector('meta[name="app-observability"]')?.content || '').replace(/\/+$/, '');
  const quartetBackend = String(document.querySelector('meta[name="quartet-backend"]')?.content || '').replace(/\/+$/, '');
  const sketchBackend = String(document.querySelector('meta[name="bible-sketch-backend"]')?.content || '').replace(/\/+$/, '');
  if (!observability) return;

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
  let profiles = new Map();
  let profileCacheAt = 0;
  let refreshTimer = 0;
  let historyTimer = 0;
  let observerTimer = 0;
  let observerRoom = null;
  let liveRequest = null;
  let profileRequest = null;
  let mountObserver = null;
  let scheduled = 0;

  function initData() { return String(window.Telegram?.WebApp?.initData || ''); }
  function isAdmin() { return String(window.Telegram?.WebApp?.initDataUnsafe?.user?.id || '') === ADMIN_ID; }

  function ensurePanel() {
    if (!isAdmin()) return;
    const page = document.querySelector('.admin-v2, .admin-page');
    if (!page) return;
    document.getElementById('admin-live-stats')?.classList.add('admin-live-legacy-hidden');
    document.getElementById('admin-live-v2')?.remove();

    let panel = document.getElementById('admin-live-v3');
    if (panel) return;
    panel = document.createElement('section');
    panel.id = 'admin-live-v3';
    panel.className = 'admin-live-v3';
    const stats = page.querySelector('.admin-v2__stats');
    const header = page.querySelector('.admin-v2__header');
    const legacy = page.querySelector('.admin-topbar');
    if (stats) stats.after(panel);
    else if (header) header.after(panel);
    else if (legacy) legacy.after(panel);
    else page.prepend(panel);

    const cached = readCache();
    if (cached) {
      live = cached;
      render();
    } else {
      panel.innerHTML = '<div class="admin-live-v3__loading"><span></span>Получаем онлайн…</div>';
    }
    refreshLive();
    refreshHistorical();
    clearInterval(refreshTimer);
    clearInterval(historyTimer);
    refreshTimer = setInterval(() => document.getElementById('admin-live-v3') ? refreshLive() : clearInterval(refreshTimer), 5_000);
    historyTimer = setInterval(() => document.getElementById('admin-live-v3') ? refreshHistorical() : clearInterval(historyTimer), 30_000);
  }

  async function refreshLive(forceProfiles = false) {
    const panel = document.getElementById('admin-live-v3');
    if (!panel || !initData()) return;
    if (liveRequest) return liveRequest;
    liveRequest = (async () => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 4500);
      try {
        const response = await fetch(`${observability}/admin/live?initData=${encodeURIComponent(initData())}`, {
          cache: 'no-store', signal: controller.signal,
        });
        const data = await response.json();
        if (!response.ok || !data?.ok) throw new Error(data?.error || `HTTP ${response.status}`);
        live = data;
        writeCache(data);
        render();
        enrichProfiles(data.onlineUsers || [], forceProfiles);
      } catch (error) {
        console.warn('Admin live fast refresh:', error);
        if (!live) panel.innerHTML = '<div class="admin-live-v3__loading is-error">Онлайн временно недоступен. Повторите обновление.</div>';
      } finally {
        clearTimeout(timeout);
      }
    })().finally(() => { liveRequest = null; });
    return liveRequest;
  }

  async function refreshHistorical() {
    if (!initData()) return;
    try {
      const response = await fetch(`${observability}/admin/stats?initData=${encodeURIComponent(initData())}`, { cache: 'no-store' });
      const data = await response.json();
      if (response.ok && data?.ok) {
        historical = data;
        render();
      }
    } catch {}
  }

  async function enrichProfiles(users, force = false) {
    const ids = [...new Set(users.map((user) => String(user.id || '')).filter(Boolean))];
    if (!ids.length || typeof window.apiRequest !== 'function') return;
    const now = Date.now();
    const missing = ids.some((id) => !profiles.has(id));
    if (!force && !missing && now - profileCacheAt < 20_000) return;
    if (profileRequest) return profileRequest;
    profileRequest = (async () => {
      try {
        const result = await adminApi({ action: 'getAdminUsersByIds', ids });
        if (result?.success === false || result?.ok === false) throw new Error(result?.error || 'Profile load failed');
        for (const user of result?.users || []) profiles.set(String(user.id), normalizeProfile(user));
        profileCacheAt = Date.now();
        render();
      } catch (error) {
        console.warn('Admin live profiles:', error);
      }
    })().finally(() => { profileRequest = null; });
    return profileRequest;
  }

  function render() {
    const panel = document.getElementById('admin-live-v3');
    if (!panel || !live) return;
    const users = Array.isArray(live.onlineUsers) ? live.onlineUsers : [];
    const current = live.currentGames || {};
    const activeRooms = Number(live.activeRoomsNow || 0);
    const generated = new Date(live.generatedAt || Date.now()).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const gameCards = GAMES.map(([key, title]) => {
      const count = Number(current[key] || 0);
      return `<div class="admin-live-v3__game ${count ? 'is-active' : ''}"><b>${count}</b><span>${escapeText(title)}</span></div>`;
    }).join('');

    const people = users.length ? users.map(renderOnlineUser).join('') : '<div class="admin-live-v3__empty">Сейчас нет проверенных пользователей онлайн.</div>';
    panel.innerHTML = `
      <div class="admin-live-v3__head">
        <div><span class="admin-live-v3__eyebrow">Живой мониторинг</span><h3>Онлайн и управление</h3></div>
        <button type="button" data-live-refresh aria-label="Обновить">↻</button>
      </div>
      <div class="admin-live-v3__summary">
        <div><b>${Number(live.onlineNow || 0)}</b><span>онлайн</span></div>
        <div><b>${Number(live.menuNow || 0)}</b><span>в меню</span></div>
        <div><b>${activeRooms}</b><span>комнат</span></div>
        <div><b>${Number(historical.peakOnlineToday || live.onlineNow || 0)}</b><span>пик сегодня</span></div>
      </div>
      <details class="admin-live-v3__games"><summary>Игры сейчас</summary><div>${gameCards}</div></details>
      <div class="admin-live-v3__section-head"><b>Кто сейчас онлайн</b><span>${users.length}</span></div>
      <div class="admin-live-v3__people">${people}</div>
      <div class="admin-live-v3__foot">Live ${generated} · ${Math.round(Number(live.strictPresenceWindowMs || 0) / 1000)} сек${historical.errorsToday !== undefined ? ` · ошибок сегодня ${Number(historical.errorsToday || 0)}` : ''}</div>
    `;
    bindPanelActions(panel);
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
    return `
      <article class="admin-live-v3__person" data-live-user="${escapeText(id)}">
        <div class="admin-live-v3__identity">
          <span class="admin-live-v3__dot"></span>
          <div class="admin-live-v3__avatar">${escapeText(initials(name))}</div>
          <div class="admin-live-v3__name"><b>${escapeText(name)}</b><small>ID ${escapeText(id)} · ${escapeText(gameName + roomText)} · ${platform}</small></div>
          <button type="button" class="admin-live-v3__chat" data-user-chat="${escapeText(id)}">Чат</button>
        </div>
        <div class="admin-live-v3__balances">${balances}</div>
        ${canObserve ? `<button type="button" class="admin-live-v3__observe" data-observe-game="${escapeText(user.game)}" data-observe-room="${escapeText(user.roomId)}">◉ Наблюдать за комнатой · только чтение</button>` : ''}
      </article>`;
  }

  function renderBalance(id, profile, item) {
    const value = Number(profile[item.field] || 0);
    return `<div class="admin-live-v3__balance" data-balance-type="${item.type}">
      <span>${item.icon} ${escapeText(item.label)}</span>
      <div><button type="button" data-balance-adjust="-1" data-user-id="${escapeText(id)}" data-type="${item.type}" aria-label="Убавить">−</button><b>${value}</b><button type="button" data-balance-adjust="1" data-user-id="${escapeText(id)}" data-type="${item.type}" aria-label="Добавить">+</button></div>
    </div>`;
  }

  function bindPanelActions(panel) {
    panel.querySelector('[data-live-refresh]')?.addEventListener('click', () => refreshLive(true));
    panel.querySelectorAll('[data-balance-adjust]').forEach((button) => button.addEventListener('click', () => adjustBalance(button)));
    panel.querySelectorAll('[data-user-chat]').forEach((button) => button.addEventListener('click', () => openUserChat(button.dataset.userChat)));
    panel.querySelectorAll('[data-observe-room]').forEach((button) => button.addEventListener('click', () => openObserver(button.dataset.observeGame, button.dataset.observeRoom)));
  }

  async function adjustBalance(button) {
    const id = String(button.dataset.userId || '');
    const type = String(button.dataset.type || '');
    const delta = Number(button.dataset.balanceAdjust || 0);
    const meta = BALANCES.find((item) => item.type === type);
    const profile = profiles.get(id);
    if (!meta || !profile || !delta) return;
    const previous = Number(profile[meta.field] || 0);
    const next = Math.max(0, previous + delta);
    profile[meta.field] = next;
    render();
    try {
      const result = await adminApi({ action: 'updateUser', updateData: { targetId: id, type, value: next } });
      if (result?.success === false || result?.ok === false) throw new Error(result?.error || 'Не удалось сохранить');
      if (type === 'stars_bmt' && result?.bmtStars !== undefined) profile.bmtStars = Number(result.bmtStars || 0);
      haptic('success');
    } catch (error) {
      profile[meta.field] = previous;
      render();
      toast(String(error?.message || error), 'error');
    }
  }

  function openUserChat(id) {
    const profile = profiles.get(String(id));
    const link = String(profile?.link || '');
    if (/^https:\/\/t\.me\/[A-Za-z0-9_]{3,64}$/i.test(link)) {
      if (window.Telegram?.WebApp?.openTelegramLink) window.Telegram.WebApp.openTelegramLink(link);
      else window.open(link, '_blank', 'noopener,noreferrer');
      return;
    }
    openMessageModal(String(id), profile?.username || '');
  }

  function openMessageModal(id, username) {
    closeModal('admin-live-message-modal');
    const modal = document.createElement('div');
    modal.id = 'admin-live-message-modal';
    modal.className = 'admin-live-v3__modal';
    modal.innerHTML = `<div class="admin-live-v3__modal-card"><button type="button" class="admin-live-v3__close" data-modal-close>×</button><span class="admin-live-v3__eyebrow">Сообщение через бота</span><h3>${escapeText(username ? '@' + username : 'ID ' + id)}</h3><p>Сообщение придёт пользователю в личный чат бота «Библейские игры».</p><textarea maxlength="2000" placeholder="Напишите сообщение…"></textarea><button type="button" class="admin-live-v3__primary" data-send-message>Отправить</button></div>`;
    document.body.append(modal);
    modal.querySelector('[data-modal-close]')?.addEventListener('click', () => modal.remove());
    modal.addEventListener('click', (event) => { if (event.target === modal) modal.remove(); });
    modal.querySelector('[data-send-message]')?.addEventListener('click', async (event) => {
      const text = String(modal.querySelector('textarea')?.value || '').trim();
      if (!text) return;
      const button = event.currentTarget;
      button.disabled = true;
      try {
        const result = await adminApi({ action: 'adminMessageUser', targetId: id, message: text });
        if (result?.success === false || result?.ok === false) throw new Error(result?.error || 'Не удалось отправить');
        modal.remove();
        toast('Сообщение отправлено', 'success');
      } catch (error) {
        toast(String(error?.message || error), 'error');
        button.disabled = false;
      }
    });
  }

  function openObserver(game, roomId) {
    closeObserver();
    const modal = document.createElement('div');
    modal.id = 'admin-room-observer';
    modal.className = 'admin-live-v3__modal admin-live-v3__observer-modal';
    modal.innerHTML = `<div class="admin-live-v3__observer-card"><div class="admin-live-v3__observer-head"><div><span class="admin-live-v3__eyebrow">Невидимый монитор</span><h3>${escapeText(GAME_NAMES[game] || game)} · ${escapeText(roomId)}</h3><small>Только чтение · администратор не добавляется в комнату</small></div><button type="button" class="admin-live-v3__close" data-observer-close>×</button></div><div class="admin-live-v3__observer-body"><div class="admin-live-v3__loading"><span></span>Подключаем отчёт…</div></div></div>`;
    document.body.append(modal);
    observerRoom = { game, roomId, modal };
    modal.querySelector('[data-observer-close]')?.addEventListener('click', closeObserver);
    modal.addEventListener('click', (event) => { if (event.target === modal) closeObserver(); });
    pollObserver();
  }

  async function pollObserver() {
    if (!observerRoom) return;
    const { game, roomId, modal } = observerRoom;
    const backend = game === 'quartet' ? quartetBackend : sketchBackend;
    if (!backend) return;
    try {
      const response = await fetch(`${backend}/admin/rooms/${encodeURIComponent(roomId)}/state?initData=${encodeURIComponent(initData())}`, { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok || !data?.ok) throw new Error(data?.error || `HTTP ${response.status}`);
      const body = modal.querySelector('.admin-live-v3__observer-body');
      if (body) body.innerHTML = game === 'quartet' ? renderQuartetObserver(data) : renderSketchObserver(data);
    } catch (error) {
      const body = modal.querySelector('.admin-live-v3__observer-body');
      if (body) body.innerHTML = `<div class="admin-live-v3__empty">${escapeText(String(error?.message || error))}</div>`;
    }
    clearTimeout(observerTimer);
    if (observerRoom) observerTimer = setTimeout(pollObserver, 1500);
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

  function renderLog(log) {
    const items = (Array.isArray(log) ? log.slice(-12).reverse() : []).map((line) => `<li>${escapeText(line)}</li>`).join('');
    return `<div class="admin-live-v3__observer-log"><b>Последние события</b><ol>${items || '<li>Событий пока нет</li>'}</ol></div>`;
  }

  function closeObserver() {
    clearTimeout(observerTimer);
    observerTimer = 0;
    observerRoom?.modal?.remove();
    observerRoom = null;
  }

  async function adminApi(payload) {
    if (typeof window.apiRequest !== 'function') throw new Error('API недоступен');
    return window.apiRequest({ ...payload, adminId: ADMIN_ID, telegramInitData: initData() });
  }

  function normalizeProfile(user = {}) {
    return {
      id: String(user.id || ''), username: String(user.username || ''), link: String(user.link || ''),
      wowStars: num(user.wowStars, 20), wsStars: num(user.wsStars, 0), swLevel: num(user.swLevel, 0),
      bmtStars: num(user.bmtStars, 0), isBanned: Boolean(user.isBanned),
    };
  }
  function num(value, fallback = 0) { const n = Number(value); return Number.isFinite(n) ? Math.trunc(n) : fallback; }
  function initials(name) { const clean = String(name || '?').replace(/^@/, '').trim(); return (clean[0] || '?').toUpperCase(); }
  function phaseLabel(value) { return ({ lobby: 'Лобби', playing: 'Игра', drawing: 'Рисование', voting: 'Голосование', answerReview: 'Проверка ответа', finalGuess: 'Финальный ответ', finished: 'Завершено' }[value] || String(value || '—')); }
  function escapeText(value) { return String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch])); }
  function haptic(type = 'selection') { try { window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred?.(type); } catch {} }
  function toast(message, tone = '') { if (typeof window.showToast === 'function') return window.showToast(message, tone); console.log(message); }
  function closeModal(id) { document.getElementById(id)?.remove(); }
  function writeCache(data) { try { sessionStorage.setItem('admin_live_v3_cache', JSON.stringify({ at: Date.now(), data })); } catch {} }
  function readCache() { try { const value = JSON.parse(sessionStorage.getItem('admin_live_v3_cache') || 'null'); return value && Date.now() - Number(value.at || 0) < 60_000 ? value.data : null; } catch { return null; } }

  function scheduleMount() { clearTimeout(scheduled); scheduled = setTimeout(ensurePanel, 80); }
  mountObserver = new MutationObserver(scheduleMount);
  mountObserver.observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ['class', 'data-mode'] });
  window.addEventListener('pagehide', closeObserver);
  scheduleMount();
})();
