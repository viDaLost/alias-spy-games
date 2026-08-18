(() => {
  'use strict';

  if (window.__mosesNileRunnerLauncherInstalled) return;
  window.__mosesNileRunnerLauncherInstalled = true;

  const VERSION = '1';
  const GAME_KEY = 'moses-nile-runner';
  const TITLE = 'Моисей: путь по Нилу';
  const GAME_SRC = `web/games/moses-nile-runner.js?v=${VERSION}`;
  const ICON_SRC = `web/assets/icons/moses-nile-runner.svg?v=${VERSION}`;
  let loadPromise = null;
  let nativeGoToMainMenu = null;

  function escapeText(value) {
    return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  }

  function rememberOpen() {
    let history = [];
    try {
      history = JSON.parse(localStorage.getItem('last_games_history') || '[]');
      if (!Array.isArray(history)) history = [];
    } catch { history = []; }
    history = history.filter((item) => item !== TITLE);
    history.unshift(TITLE);
    history = history.slice(0, 3);
    try { localStorage.setItem('last_games_history', JSON.stringify(history)); } catch {}
    try {
      const user = window.getTelegramUser?.();
      if (user?.id != null) window.apiRequest?.({ action: 'updateHistory', id: user.id, history });
    } catch {}
    window.dispatchEvent(new CustomEvent('app:menu-ready'));
  }

  function loadGame() {
    if (typeof window.startMosesNileRunner === 'function') return Promise.resolve();
    if (loadPromise) return loadPromise;
    loadPromise = new Promise((resolve, reject) => {
      const existing = document.querySelector(`script[data-moses-nile-runner="${VERSION}"]`);
      if (existing) {
        existing.addEventListener('load', resolve, { once: true });
        existing.addEventListener('error', reject, { once: true });
        return;
      }
      const script = document.createElement('script');
      script.src = GAME_SRC;
      script.async = false;
      script.dataset.mosesNileRunner = VERSION;
      script.onload = resolve;
      script.onerror = () => reject(new Error('Не удалось загрузить игру «Моисей: путь по Нилу»'));
      document.body.appendChild(script);
    }).finally(() => { loadPromise = null; });
    return loadPromise;
  }

  async function openGame() {
    const container = document.getElementById('game-container');
    const menu = document.getElementById('menu-container');
    if (!container) return;

    rememberOpen();
    window.__mosesNileCleanup?.();
    if (menu) menu.classList.add('hidden');
    document.body.dataset.mode = 'game';
    document.body.dataset.currentGame = GAME_KEY;
    window.scrollTo({ top: 0, behavior: 'auto' });
    container.innerHTML = '<div class="app-game-loading"><div class="app-loader__ring"></div><p>Подготавливаем Нил...</p></div>';

    try {
      await loadGame();
      if (document.body.dataset.currentGame !== GAME_KEY) return;
      if (typeof window.startMosesNileRunner !== 'function') throw new Error('Функция запуска игры не найдена');
      window.startMosesNileRunner();
    } catch (error) {
      console.error('[Moses Nile Runner]', error);
      container.innerHTML = `<section class="app-error-card fade-in"><h2>Не удалось открыть игру</h2><p>${escapeText(error?.message || 'Ошибка загрузки')}</p><button class="back-button" onclick="appGoToMainMenu()">В главное меню</button></section>`;
    }
  }

  function mountCard() {
    const root = document.getElementById('kids-games');
    if (!root || document.getElementById('moses-nile-runner-card')) return;
    const card = document.createElement('button');
    card.type = 'button';
    card.id = 'moses-nile-runner-card';
    card.className = 'game-card';
    card.setAttribute('aria-label', `Открыть игру ${TITLE}`);
    card.innerHTML = `
      <span class="game-card__icon game-card__icon--image"><img class="game-card__img" src="${ICON_SRC}" alt="Иконка игры ${TITLE}" loading="lazy" decoding="async" draggable="false"></span>
      <span class="game-card__body"><span class="game-card__title">${TITLE}</span><span class="game-card__desc">Проведи корзину по Нилу</span></span>
    `;
    card.addEventListener('click', openGame);
    root.appendChild(card);
  }

  function patchMenuReturn() {
    if (nativeGoToMainMenu || typeof window.appGoToMainMenu !== 'function') return;
    nativeGoToMainMenu = window.appGoToMainMenu;
    const wrapped = function (...args) {
      try { window.__mosesNileCleanup?.(); } catch {}
      return nativeGoToMainMenu.apply(this, args);
    };
    window.appGoToMainMenu = wrapped;
    window.goToMainMenu = wrapped;
  }

  function start() {
    patchMenuReturn();
    mountCard();
    window.addEventListener('app:menu-ready', () => {
      patchMenuReturn();
      mountCard();
    });
    new MutationObserver(() => mountCard()).observe(document.getElementById('menu-container') || document.body, { childList: true, subtree: true });
  }

  window.openMosesNileRunner = openGame;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
