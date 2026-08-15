(() => {
  if (window.__APP_TELEMETRY_DISABLED__) return;

  const backend = String(document.querySelector('meta[name="app-observability"]')?.content || '').replace(/\/+$/, '');
  const seen = new Map();
  const maxReports = 8;
  let reportCount = 0;
  let adminTimer = null;
  let normalizeTimer = null;

  const GAME_NAMES = {
    alias: 'Алиас', coimaginarium: 'Соображариум', guess: 'Угадай персонажа', describe: 'Опиши, но не называй',
    spy: 'Шпион', quartet: 'Квартет', 'bible-wow': 'Библейские слова', 'bible-wordsearch': 'Поиск библейских слов',
    'sacred-word': 'Священное слово', 'kids-ark-pairs': 'Найди пару',
  };

  function gameKey() {
    return String(document.body.dataset.currentGame || '').toLowerCase();
  }

  function ignored(message) {
    return !message
      || /ResizeObserver loop/i.test(message)
      || /^Script error\.?$/i.test(message.trim())
      || /AbortError/i.test(message)
      || /The operation was aborted/i.test(message);
  }

  function cleanMessage(value) {
    const text = value instanceof Error ? (value.stack || value.message) : String(value ?? '');
    return text.replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 170);
  }

  function report(error, { kind = 'runtime', source = '', fatal = false } = {}) {
    const message = cleanMessage(error);
    if (ignored(message)) return;

    const game = gameKey();
    const signature = `${game}|${kind}|${message.slice(0, 100)}`;
    const now = Date.now();
    if (now - Number(seen.get(signature) || 0) < 60_000) {
      if (fatal) showFatalBoundary(game);
      return;
    }
    seen.set(signature, now);

    if (reportCount < maxReports && backend) {
      reportCount += 1;
      const sourceSuffix = source ? ` @ ${String(source).split('/').pop().slice(0, 60)}` : '';
      fetch(`${backend}/event`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event: 'client_error', game, message: `${kind}: ${message}${sourceSuffix}`.slice(0, 180) }),
        keepalive: true,
      }).catch(() => {});
    }

    if (fatal) showFatalBoundary(game);
  }

  function showFatalBoundary(game = gameKey()) {
    if (!game || document.getElementById('app-fatal-error')) return;
    const overlay = document.createElement('div');
    overlay.id = 'app-fatal-error';
    overlay.className = 'app-fatal-error';
    overlay.setAttribute('role', 'alertdialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.innerHTML = `
      <div class="app-fatal-error__card">
        <div class="app-fatal-error__icon" aria-hidden="true">!</div>
        <h2>Не удалось продолжить игру</h2>
        <p>Попробуйте открыть её ещё раз. Информация об ошибке уже сохранена для проверки.</p>
        <div class="app-fatal-error__actions">
          <button type="button" class="app-fatal-error__retry">Попробовать снова</button>
          <button type="button" class="app-fatal-error__menu">В главное меню</button>
        </div>
      </div>`;
    overlay.querySelector('.app-fatal-error__retry')?.addEventListener('click', () => restartGame(game));
    overlay.querySelector('.app-fatal-error__menu')?.addEventListener('click', () => returnToMenu());
    document.body.appendChild(overlay);
  }

  function closeBoundary() {
    document.getElementById('app-fatal-error')?.remove();
  }

  function returnToMenu() {
    closeBoundary();
    try {
      if (typeof window.goToMainMenu === 'function') window.goToMainMenu();
      else location.reload();
    } catch { location.reload(); }
  }

  function restartGame(game) {
    closeBoundary();
    try {
      if (typeof window.goToMainMenu !== 'function' || typeof window.showGame !== 'function') throw new Error('navigation unavailable');
      window.goToMainMenu();
      setTimeout(() => window.showGame(game), 100);
    } catch { location.reload(); }
  }

  function renderFriendlyLoadError(reason) {
    const container = document.getElementById('game-container');
    const game = gameKey();
    if (!container || !game || container.querySelector('.app-friendly-error')) return;
    report(reason, { kind: 'game-load', fatal: false });
    container.innerHTML = `
      <section class="app-friendly-error" role="alert">
        <div class="app-friendly-error__icon" aria-hidden="true">↻</div>
        <h2>Не удалось открыть игру</h2>
        <p>Проверьте соединение и попробуйте ещё раз. Если ошибка повторится, она уже будет видна администратору.</p>
        <div class="app-friendly-error__actions">
          <button type="button" class="app-friendly-error__retry">Повторить</button>
          <button type="button" class="app-friendly-error__menu">В меню</button>
        </div>
      </section>`;
    container.querySelector('.app-friendly-error__retry')?.addEventListener('click', () => restartGame(game));
    container.querySelector('.app-friendly-error__menu')?.addEventListener('click', returnToMenu);
  }

  function normalizeHandledErrors() {
    clearTimeout(normalizeTimer);
    normalizeTimer = setTimeout(() => {
      if (document.body.dataset.mode !== 'game') return;
      const container = document.getElementById('game-container');
      if (!container) return;
      const text = (container.textContent || '').replace(/\s+/g, ' ').trim();
      const errorCard = container.querySelector('.app-error-card');
      if (errorCard && /Ошибка запуска|Файл игры не найден|Игра не найдена/i.test(text)) {
        renderFriendlyLoadError(text);
        return;
      }
      if (/Библиотека Three\.js не подключена/i.test(text)) renderFriendlyLoadError(text);
    }, 40);
  }

  window.addEventListener('error', (event) => {
    const message = cleanMessage(event.error || event.message);
    if (ignored(message)) return;
    report(event.error || event.message, {
      kind: 'unhandled-error',
      source: event.filename || '',
      fatal: document.body.dataset.mode === 'game',
    });
  });

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason instanceof Error ? event.reason : String(event.reason || 'Unhandled promise rejection');
    report(reason, { kind: 'unhandled-promise', fatal: document.body.dataset.mode === 'game' });
  });

  const originalConsoleError = console.error.bind(console);
  console.error = (...args) => {
    originalConsoleError(...args);
    if (document.body.dataset.mode !== 'game' && document.body.dataset.mode !== 'admin') return;
    const message = args.map((item) => cleanMessage(item)).filter(Boolean).join(' ').slice(0, 170);
    if (!ignored(message)) report(message, { kind: 'console-error', fatal: false });
  };

  async function refreshAdminErrors() {
    if (!backend || document.body.dataset.mode !== 'admin' || !document.querySelector('.admin-page')) return;
    const initData = String(window.Telegram?.WebApp?.initData || '');
    if (!initData) return;
    try {
      const response = await fetch(`${backend}/admin/stats?initData=${encodeURIComponent(initData)}`, { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok || !data?.ok) return;
      renderAdminErrors(Array.isArray(data.recentErrors) ? data.recentErrors : []);
    } catch {}
  }

  function renderAdminErrors(errors) {
    let panel = document.getElementById('admin-error-feed');
    if (!errors.length) { panel?.remove(); return; }
    const adminPage = document.querySelector('.admin-page');
    if (!adminPage) return;
    if (!panel) {
      panel = document.createElement('section');
      panel.id = 'admin-error-feed';
      panel.className = 'admin-error-feed';
      const liveStats = document.getElementById('admin-live-stats');
      if (liveStats) liveStats.after(panel);
      else adminPage.prepend(panel);
    }
    panel.innerHTML = `
      <div class="admin-error-feed__head"><h3>Последние ошибки</h3><span>${errors.length} последних</span></div>
      <div class="admin-error-feed__list">
        ${errors.slice(0, 5).map((item) => `
          <div class="admin-error-feed__item">
            <div class="admin-error-feed__meta"><span>${escapeText(GAME_NAMES[item.game] || item.game || 'Приложение')}</span><span>${formatTime(item.at)}</span></div>
            <div class="admin-error-feed__message">${escapeText(item.message || 'Без описания')}</div>
          </div>`).join('')}
      </div>`;
  }

  function formatTime(value) {
    const date = new Date(Number(value || Date.now()));
    return Number.isNaN(date.getTime()) ? '' : date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  }

  function escapeText(value) {
    return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  }

  function handleDomChange() {
    normalizeHandledErrors();
    if (document.body.dataset.mode === 'admin' && document.querySelector('.admin-page')) {
      if (!adminTimer) {
        refreshAdminErrors();
        adminTimer = setInterval(refreshAdminErrors, 20_000);
      }
    } else if (adminTimer) {
      clearInterval(adminTimer);
      adminTimer = null;
      document.getElementById('admin-error-feed')?.remove();
    }
  }

  const observer = new MutationObserver(handleDomChange);
  observer.observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-mode', 'class'] });
  handleDomChange();

  window.AppErrorBoundary = { report, showFatal: showFatalBoundary, close: closeBoundary };
})();
