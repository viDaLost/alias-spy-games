(() => {
  'use strict';

  const RELEASE = '2026.08.22.1';
  const coreBackend = metaUrl('app-core-backend');
  const observability = metaUrl('app-observability');
  if (!coreBackend || !observability) return;

  const GAME_NAMES = {
    alias: 'Алиас', coimaginarium: 'Соображариум', guess: 'Угадай персонажа',
    describe: 'Опиши, но не называй', spy: 'Шпион', quartet: 'Квартет',
    'bible-sketch': 'Библейский художник', 'bible-wow': 'Библейские слова',
    'bible-wordsearch': 'Поиск слов', 'sacred-word': 'Священное слово',
    'kids-ark-pairs': 'Найди пару', 'biblical-match-three': 'Библейские сокровища',
    'moses-nile': 'Моисей: Путь по Нилу',
  };

  let refreshTimer = 0;
  let scheduled = 0;
  let refreshing = false;
  let sessionToken = '';
  let sessionExpiresAt = 0;

  function metaUrl(name) {
    return String(document.querySelector(`meta[name="${name}"]`)?.content || '').replace(/\/+$/, '');
  }

  function telegramInitData() {
    return String(window.Telegram?.WebApp?.initData || '');
  }

  function escapeText(value) {
    return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[ch]));
  }

  function primaryReady() {
    const panel = document.getElementById('admin-live-v3');
    if (!panel) return false;
    if (panel.querySelector('.admin-live-v3__person, .admin-live-v3__empty')) return true;
    return Boolean(panel.querySelector('.admin-live-v3__summary'));
  }

  function removeRescue() {
    document.getElementById('admin-live-rescue')?.remove();
    clearInterval(refreshTimer);
    refreshTimer = 0;
  }

  function ensurePanel() {
    const page = document.querySelector('.admin-v2, .admin-page');
    if (!page) {
      removeRescue();
      return;
    }

    if (primaryReady()) {
      removeRescue();
      return;
    }

    let panel = document.getElementById('admin-live-rescue');
    if (!panel) {
      panel = document.createElement('section');
      panel.id = 'admin-live-rescue';
      panel.className = 'admin-live-v3 admin-live-rescue';
      panel.setAttribute('aria-label', 'Резервный живой мониторинг');
      panel.innerHTML = '<div class="admin-live-v3__loading"><span></span>Подключаем живой мониторинг…</div>';
      const stats = page.querySelector('.admin-v2__stats');
      const header = page.querySelector('.admin-v2__header');
      if (stats) stats.after(panel); else if (header) header.after(panel); else page.prepend(panel);
      refresh();
      clearInterval(refreshTimer);
      refreshTimer = window.setInterval(() => {
        if (primaryReady()) return removeRescue();
        if (document.getElementById('admin-live-rescue')) refresh();
      }, 5_000);
    }
  }

  async function acquireSession() {
    const now = Date.now();
    if (sessionToken && sessionExpiresAt - now > 45_000) return sessionToken;
    const initData = telegramInitData();
    if (!initData) throw new Error('Откройте админ-панель внутри Telegram');
    const response = await fetch(`${coreBackend}/web/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      cache: 'no-store',
      body: JSON.stringify({ telegramInitData: initData, scope: 'admin' }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data?.ok !== true || !data?.token) {
      throw Object.assign(new Error(data?.error || `Session HTTP ${response.status}`), { status: response.status });
    }
    sessionToken = String(data.token);
    sessionExpiresAt = Number(data.expiresAt || 0);
    return sessionToken;
  }

  async function liveRequest() {
    const initData = telegramInitData();
    if (!initData) throw new Error('Откройте админ-панель внутри Telegram');

    try {
      const token = await acquireSession();
      const response = await fetch(`${observability}/admin/live`, {
        cache: 'no-store',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json().catch(() => ({}));
      if (response.ok && data?.ok) return data;
      if (![401, 403, 404, 503].includes(response.status)) {
        throw new Error(data?.error || `Live HTTP ${response.status}`);
      }
    } catch (error) {
      if (![0, 401, 403, 404, 500, 503].includes(Number(error?.status || 0))) throw error;
    }

    const fallback = await fetch(`${observability}/admin/live`, {
      cache: 'no-store',
      headers: { 'X-Telegram-Init-Data': initData },
    });
    const data = await fallback.json().catch(() => ({}));
    if (!fallback.ok || data?.ok !== true) {
      throw Object.assign(new Error(data?.error || `Live HTTP ${fallback.status}`), { status: fallback.status });
    }
    return data;
  }

  async function refresh() {
    if (refreshing || primaryReady()) return;
    const panel = document.getElementById('admin-live-rescue');
    if (!panel) return;
    refreshing = true;
    try {
      const data = await liveRequest();
      if (primaryReady()) return removeRescue();
      render(panel, data);
    } catch (error) {
      if (!primaryReady()) renderError(panel, error);
    } finally {
      refreshing = false;
    }
  }

  function render(panel, data) {
    const users = Array.isArray(data?.onlineUsers) ? data.onlineUsers : [];
    const generated = new Date(data?.generatedAt || Date.now()).toLocaleTimeString('ru-RU', {
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
    const people = users.length
      ? users.map((user) => {
          const id = String(user?.id || '');
          const name = user?.username ? `@${user.username}` : (user?.displayName || `ID ${id}`);
          const game = user?.game ? (GAME_NAMES[user.game] || user.game) : 'Главное меню';
          const room = user?.roomId ? ` · ${user.roomId}` : '';
          const platform = user?.platform === 'android' ? 'Android' : 'Telegram';
          return `<article class="admin-live-v3__person"><div class="admin-live-v3__identity"><span class="admin-live-v3__dot"></span><div class="admin-live-v3__avatar">${escapeText((name.replace(/^@/, '').slice(0, 2) || '?').toUpperCase())}</div><div class="admin-live-v3__name"><b>${escapeText(name)}</b><small>ID ${escapeText(id)} · ${escapeText(game + room)} · ${platform}</small></div></div></article>`;
        }).join('')
      : '<div class="admin-live-v3__empty">Сейчас нет проверенных пользователей онлайн.</div>';

    panel.innerHTML = `
      <div class="admin-live-v3__head">
        <div><span class="admin-live-v3__eyebrow">Живой мониторинг · recovery</span><h3>Кто сейчас онлайн</h3></div>
        <button type="button" data-rescue-refresh aria-label="Обновить данные">↻</button>
      </div>
      <div class="admin-live-v3__summary">
        <div><b>${Number(data?.onlineNow || users.length)}</b><span>онлайн</span></div>
        <div><b>${Number(data?.menuNow || 0)}</b><span>в меню</span></div>
        <div><b>${Number(data?.activeRoomsNow || 0)}</b><span>комнат</span></div>
        <div><b>${users.length}</b><span>в списке</span></div>
      </div>
      <div class="admin-live-v3__section-head"><b>Пользователи онлайн</b><span>${users.length}</span></div>
      <div class="admin-live-v3__people">${people}</div>
      <div class="admin-live-v3__foot">Live ${generated} · recovery ${RELEASE}</div>`;
    panel.querySelector('[data-rescue-refresh]')?.addEventListener('click', refresh);
  }

  function renderError(panel, error) {
    const message = String(error?.message || error || 'Неизвестная ошибка');
    panel.innerHTML = `
      <div class="admin-live-v3__head"><div><span class="admin-live-v3__eyebrow">Живой мониторинг</span><h3>Онлайн временно недоступен</h3></div></div>
      <div class="admin-live-v3__loading is-error">${escapeText(message)}</div>
      <button type="button" class="admin-live-v3__primary" data-rescue-refresh>Повторить</button>
      <button type="button" class="admin-live-v3__primary" data-rescue-reload>Перезагрузить свежую версию</button>
      <div class="admin-live-v3__foot">recovery ${RELEASE}</div>`;
    panel.querySelector('[data-rescue-refresh]')?.addEventListener('click', refresh);
    panel.querySelector('[data-rescue-reload]')?.addEventListener('click', () => {
      const url = new URL(location.href);
      url.searchParams.set('appv', Date.now().toString(36));
      location.replace(url.toString());
    });
  }

  function schedule() {
    clearTimeout(scheduled);
    scheduled = window.setTimeout(ensurePanel, 250);
  }

  const observer = new MutationObserver(schedule);
  observer.observe(document.documentElement, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['class', 'data-mode'],
  });
  window.addEventListener('pagehide', () => {
    observer.disconnect();
    clearInterval(refreshTimer);
  }, { once: true });
  schedule();
})();
