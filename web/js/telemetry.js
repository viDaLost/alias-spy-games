(() => {
  if (window.__APP_TELEMETRY_DISABLED__) return;

  const backend = String(document.querySelector('meta[name="app-observability"]')?.content || '').replace(/\/+$/, '');
  if (!backend) return;

  const GAME_NAMES = {
    alias: 'Алиас', coimaginarium: 'Соображариум', guess: 'Угадай персонажа',
    describe: 'Опиши, но не называй', spy: 'Шпион', quartet: 'Квартет',
    'bible-wow': 'Библейские слова', 'bible-wordsearch': 'Поиск библейских слов',
    'sacred-word': 'Священное слово', 'kids-ark-pairs': 'Найди пару',
  };

  let socket = null;
  let reconnectTimer = null;
  let pingTimer = null;
  let presenceTimer = null;
  let lastPresence = '';
  let lastQuartetPhase = '';
  let adminRefreshTimer = null;
  const sid = getSessionId();

  function getSessionId() {
    const key = 'app_telemetry_sid_v1';
    let value = localStorage.getItem(key) || '';
    if (/^[a-zA-Z0-9_-]{16,64}$/.test(value)) return value;
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    value = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    localStorage.setItem(key, value);
    return value;
  }

  function currentGame() {
    return String(document.body.dataset.currentGame || '').toLowerCase();
  }

  function currentRoomId() {
    if (currentGame() !== 'quartet') return '';
    const subtitle = document.querySelector('.qv2-subtitle')?.textContent || '';
    const match = subtitle.match(/Комната\s+([A-Z0-9]{4,10})/i);
    return match ? match[1].toUpperCase() : '';
  }

  function currentQuartetPhase() {
    if (currentGame() !== 'quartet') return '';
    if (document.querySelector('.qv2-result-hero')) return 'finished';
    if (document.querySelector('.qv2-game')) return 'playing';
    if (document.querySelector('.qv2-lobby')) return 'lobby';
    return '';
  }

  function wsUrl() {
    const url = new URL(`${backend}/presence`);
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    url.searchParams.set('sid', sid);
    return url.toString();
  }

  function connect() {
    if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) return;
    clearTimeout(reconnectTimer);
    try { socket = new WebSocket(wsUrl()); } catch { scheduleReconnect(); return; }

    socket.addEventListener('open', () => {
      lastPresence = '';
      sendPresence(true);
      clearInterval(pingTimer);
      pingTimer = setInterval(() => {
        if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: 'ping' }));
      }, 45_000);
    });
    socket.addEventListener('close', scheduleReconnect);
    socket.addEventListener('error', () => {});
  }

  function scheduleReconnect() {
    clearInterval(pingTimer);
    clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(connect, document.hidden ? 15_000 : 4_000);
  }

  function sendPresence(force = false) {
    const game = currentGame();
    const roomId = currentRoomId();
    const key = `${game}|${roomId}`;
    if (!force && key === lastPresence) return;
    if (socket?.readyState !== WebSocket.OPEN) { connect(); return; }
    lastPresence = key;
    socket.send(JSON.stringify({ type: 'presence', game, roomId }));
    detectQuartetPhase(game, roomId);
  }

  function detectQuartetPhase(game = currentGame(), roomId = currentRoomId()) {
    if (game !== 'quartet' || !roomId) { lastQuartetPhase = ''; return; }
    const phase = currentQuartetPhase();
    const key = `${roomId}:${phase}`;
    if (!phase || key === lastQuartetPhase) return;
    lastQuartetPhase = key;
    if (phase === 'playing') track('quartet_party_started', { game, roomId });
    if (phase === 'finished') track('quartet_party_finished', { game, roomId });
  }

  function track(event, details = {}) {
    const payload = {
      sid,
      event,
      game: String(details.game || currentGame()),
      roomId: String(details.roomId || currentRoomId()),
      message: details.message ? String(details.message).slice(0, 180) : undefined,
    };
    fetch(`${backend}/event`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      keepalive: true,
    }).catch(() => {});
  }

  function wrapNavigation() {
    if (typeof window.showGame === 'function' && !window.showGame.__telemetryWrapped) {
      const originalShowGame = window.showGame;
      const wrapped = function(gameName) {
        track('game_open', { game: gameName, roomId: '' });
        return originalShowGame.apply(this, arguments);
      };
      wrapped.__telemetryWrapped = true;
      window.showGame = wrapped;
    }

    if (typeof window.goToMainMenu === 'function' && !window.goToMainMenu.__telemetryWrapped) {
      const originalGoBack = window.goToMainMenu;
      const wrapped = function() {
        const result = originalGoBack.apply(this, arguments);
        setTimeout(() => sendPresence(true), 0);
        return result;
      };
      wrapped.__telemetryWrapped = true;
      window.goToMainMenu = wrapped;
    }
  }

  function injectAdminStyles() {
    if (document.getElementById('app-live-stats-style')) return;
    const style = document.createElement('style');
    style.id = 'app-live-stats-style';
    style.textContent = `
      .admin-live-stats{margin:0 0 14px;padding:14px;border-radius:22px;background:linear-gradient(145deg,#eef2ff,#eff6ff);border:1px solid rgba(79,70,229,.12)}
      .admin-live-stats__head{display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:10px}.admin-live-stats__head h3{margin:0;color:#312e81;font-size:1rem}.admin-live-stats__head small{color:#64748b;font-weight:700}
      .admin-live-stats__grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}.admin-live-stat{min-width:0;padding:10px;border-radius:16px;background:rgba(255,255,255,.9);border:1px solid rgba(99,102,241,.09)}.admin-live-stat b{display:block;color:#312e81;font-size:1.35rem}.admin-live-stat span{display:block;margin-top:2px;color:#64748b;font-size:.7rem;font-weight:800;line-height:1.2}
      .admin-live-games{margin-top:10px;padding-top:10px;border-top:1px solid rgba(99,102,241,.10)}.admin-live-games__row{display:flex;gap:7px;overflow-x:auto;padding-bottom:2px;scrollbar-width:none}.admin-live-games__row::-webkit-scrollbar{display:none}.admin-live-chip{flex:0 0 auto;padding:7px 9px;border-radius:999px;background:#fff;color:#475569;font-size:.7rem;font-weight:850;border:1px solid rgba(99,102,241,.10)}
      .admin-live-stats__error{padding:9px;border-radius:13px;background:#fff;color:#64748b;font-size:.75rem;font-weight:750}
      @media(max-width:420px){.admin-live-stats__grid{grid-template-columns:repeat(2,minmax(0,1fr))}.admin-live-stat b{font-size:1.2rem}}
    `;
    document.head.appendChild(style);
  }

  function ensureAdminDashboard() {
    const adminPage = document.querySelector('.admin-page');
    if (!adminPage || document.getElementById('admin-live-stats')) return;
    injectAdminStyles();
    const panel = document.createElement('section');
    panel.id = 'admin-live-stats';
    panel.className = 'admin-live-stats';
    panel.innerHTML = `<div class="admin-live-stats__head"><h3>Сейчас в приложении</h3><small>обновление…</small></div><div class="admin-live-stats__error">Загружаем живую статистику…</div>`;
    const anchor = adminPage.querySelector('.admin-broadcast, .admin-tools');
    if (anchor) anchor.before(panel); else adminPage.prepend(panel);
    refreshAdminStats();
    clearInterval(adminRefreshTimer);
    adminRefreshTimer = setInterval(() => {
      if (document.getElementById('admin-live-stats')) refreshAdminStats();
      else clearInterval(adminRefreshTimer);
    }, 15_000);
  }

  async function refreshAdminStats() {
    const panel = document.getElementById('admin-live-stats');
    if (!panel) return;
    const initData = String(window.Telegram?.WebApp?.initData || '');
    if (!initData) {
      panel.innerHTML = `<div class="admin-live-stats__head"><h3>Сейчас в приложении</h3></div><div class="admin-live-stats__error">Живая статистика доступна при открытии админ-панели через Telegram.</div>`;
      return;
    }

    try {
      const response = await fetch(`${backend}/admin/stats?initData=${encodeURIComponent(initData)}`, { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok || !data?.ok) throw new Error(data?.error || `HTTP ${response.status}`);
      renderAdminStats(panel, data);
    } catch {
      panel.innerHTML = `<div class="admin-live-stats__head"><h3>Сейчас в приложении</h3><small>нет связи</small></div><div class="admin-live-stats__error">Не удалось получить живую статистику. Основная админ-панель продолжает работать.</div>`;
    }
  }

  function renderAdminStats(panel, data) {
    const current = Object.entries(data.currentGames || {}).sort((a, b) => b[1] - a[1]);
    const top = Array.isArray(data.topGames) ? data.topGames : [];
    const chips = current.length
      ? current.map(([game, count]) => `<span class="admin-live-chip">${escapeText(GAME_NAMES[game] || game)} · ${Number(count)}</span>`).join('')
      : '<span class="admin-live-chip">Сейчас все в меню</span>';
    const topText = top.length ? top.slice(0, 3).map((item) => `${GAME_NAMES[item.game] || item.game}: ${item.opens}`).join(' · ') : 'Пока нет запусков сегодня';

    panel.innerHTML = `
      <div class="admin-live-stats__head"><h3>Сейчас в приложении</h3><small>${new Date(data.generatedAt || Date.now()).toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'})}</small></div>
      <div class="admin-live-stats__grid">
        <div class="admin-live-stat"><b>${Number(data.onlineNow || 0)}</b><span>онлайн сейчас</span></div>
        <div class="admin-live-stat"><b>${Number(data.activeQuartetRooms || 0)}</b><span>комнат Квартета</span></div>
        <div class="admin-live-stat"><b>${Number(data.peakOnlineToday || 0)}</b><span>пик сегодня</span></div>
        <div class="admin-live-stat"><b>${Number(data.gameOpensToday || 0)}</b><span>запусков игр</span></div>
        <div class="admin-live-stat"><b>${Number(data.quartetStartedToday || 0)}</b><span>партий Квартета</span></div>
        <div class="admin-live-stat"><b>${Number(data.errorsToday || 0)}</b><span>ошибок сегодня</span></div>
      </div>
      <div class="admin-live-games"><div class="admin-live-games__row">${chips}</div><div style="margin-top:7px;color:#64748b;font-size:.68rem;font-weight:750">Популярное сегодня: ${escapeText(topText)}</div></div>
    `;
  }

  function escapeText(value) {
    return String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  }

  const observer = new MutationObserver(() => {
    clearTimeout(presenceTimer);
    presenceTimer = setTimeout(() => {
      wrapNavigation();
      sendPresence();
      detectQuartetPhase();
      ensureAdminDashboard();
    }, 120);
  });

  observer.observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-current-game', 'class'] });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { connect(); sendPresence(true); } });
  window.addEventListener('online', connect);

  wrapNavigation();
  connect();
  sendPresence();
  ensureAdminDashboard();

  window.AppTelemetry = { track, sendPresence, refreshAdminStats };
})();
