(() => {
  if (window.__APP_TELEMETRY_DISABLED__) return;
  const backend = String(document.querySelector('meta[name="app-observability"]')?.content || '').replace(/\/+$/, '');
  if (!backend) return;

  const GAMES = [
    ['alias', 'Алиас'], ['coimaginarium', 'Соображариум'], ['guess', 'Угадай персонажа'],
    ['describe', 'Опиши, но не называй'], ['spy', 'Шпион'], ['quartet', 'Квартет'],
    ['bible-sketch', 'Библейский художник'],
    ['bible-wow', 'Библейские слова'], ['bible-wordsearch', 'Поиск слов'],
    ['sacred-word', 'Священное слово'], ['kids-ark-pairs', 'Найди пару'],
  ];
  const NAMES = Object.fromEntries(GAMES);
  let refreshTimer = null;
  let observer = null;
  let scheduled = null;

  function ensurePanel() {
    const page = document.querySelector('.admin-v2, .admin-page');
    if (!page) return;

    document.getElementById('admin-live-stats')?.classList.add('admin-live-legacy-hidden');

    let panel = document.getElementById('admin-live-v2');
    if (!panel) {
      panel = document.createElement('section');
      panel.id = 'admin-live-v2';
      panel.className = 'admin-live-v2';

      const modernStats = page.querySelector('.admin-v2__stats');
      const modernHeader = page.querySelector('.admin-v2__header');
      const legacyTopbar = page.querySelector('.admin-topbar');

      if (modernStats) modernStats.after(panel);
      else if (modernHeader) modernHeader.after(panel);
      else if (legacyTopbar) legacyTopbar.after(panel);
      else page.prepend(panel);

      panel.innerHTML = '<div class="admin-live-v2__loading">Загружаем онлайн…</div>';
      refresh();

      clearInterval(refreshTimer);
      refreshTimer = setInterval(() => {
        if (document.getElementById('admin-live-v2')) refresh();
        else clearInterval(refreshTimer);
      }, 5_000);
    }
  }

  async function refresh() {
    const panel = document.getElementById('admin-live-v2');
    if (!panel) return;

    const initData = String(window.Telegram?.WebApp?.initData || '');
    if (!initData) {
      panel.innerHTML = '<div class="admin-live-v2__loading">Онлайн-статистика доступна только внутри Telegram.</div>';
      return;
    }

    try {
      const response = await fetch(`${backend}/admin/stats?initData=${encodeURIComponent(initData)}`, { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok || !data?.ok) throw new Error(data?.error || `HTTP ${response.status}`);
      render(panel, data);
    } catch (error) {
      console.error('Admin live stats error:', error);
      panel.innerHTML = '<div class="admin-live-v2__loading">Не удалось получить онлайн. Список пользователей продолжает работать.</div>';
    }
  }

  function render(panel, data) {
    const current = data.currentGames || {};
    const onlineUsers = Array.isArray(data.onlineUsers) ? data.onlineUsers : [];
    const menuNow = Number(data.menuNow ?? Math.max(0, Number(data.onlineNow || 0) - Object.values(current).reduce((sum, n) => sum + Number(n || 0), 0)));
    const activeRooms = Number(data.activeRoomsNow ?? data.activeQuartetRooms ?? 0);
    const generatedAt = new Date(data.generatedAt || Date.now()).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const strictWindowSec = Math.round(Number(data.strictPresenceWindowMs || 0) / 1000);

    const gameCards = GAMES.map(([key, title]) => `
      <div class="admin-live-game ${Number(current[key] || 0) > 0 ? 'is-active' : ''}">
        <b>${Number(current[key] || 0)}</b><span>${escapeText(title)}</span>
      </div>`).join('');

    const people = onlineUsers.length
      ? onlineUsers.map((user) => {
          const name = user.username ? `@${user.username}` : (user.displayName || (user.id ? `ID ${user.id}` : 'Пользователь'));
          const gameName = user.game ? (NAMES[user.game] || user.game) : 'Главное меню';
          const room = user.roomId ? ` · комната ${user.roomId}` : '';
          const platform = user.platform === 'android' ? 'Android' : 'Telegram';
          return `<div class="admin-online-user"><span class="admin-online-user__dot"></span><div><b>${escapeText(name)}</b><small>${escapeText(`${gameName}${room} · ${platform}`)}</small></div></div>`;
        }).join('')
      : '<div class="admin-live-v2__empty">Сейчас нет проверенных пользователей онлайн.</div>';

    panel.innerHTML = `
      <div class="admin-live-v2__head">
        <div><span class="admin-live-v2__eyebrow">Живой мониторинг</span><h3>Онлайн и игры</h3></div>
        <button type="button" id="admin-live-refresh" aria-label="Обновить">↻</button>
      </div>
      <div class="admin-live-v2__summary">
        <div><b>${Number(data.onlineNow || 0)}</b><span>онлайн сейчас</span></div>
        <div><b>${menuNow}</b><span>в главном меню</span></div>
        <div><b>${activeRooms}</b><span>активных комнат</span></div>
        <div><b>${Number(data.peakOnlineToday || 0)}</b><span>пик сегодня</span></div>
      </div>
      <div class="admin-live-v2__section-title">Сколько пользователей сейчас в каждой игре</div>
      <div class="admin-live-games-v2">${gameCards}</div>
      <details class="admin-online-details" ${onlineUsers.length ? 'open' : ''}>
        <summary>Кто сейчас онлайн <span>${onlineUsers.length}</span></summary>
        <div class="admin-online-list">${people}</div>
      </details>
      <div class="admin-live-v2__foot">Обновлено ${generatedAt}${strictWindowSec ? ` · проверка активности ≤ ${strictWindowSec} сек` : ''} · запусков сегодня ${Number(data.gameOpensToday || 0)} · ошибок ${Number(data.errorsToday || 0)}</div>
    `;

    document.getElementById('admin-live-refresh')?.addEventListener('click', refresh);
  }

  function escapeText(value) {
    return String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  }

  function schedule() {
    clearTimeout(scheduled);
    scheduled = setTimeout(ensurePanel, 80);
  }

  observer = new MutationObserver(schedule);
  observer.observe(document.documentElement, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['class', 'data-mode'],
  });
  schedule();
})();