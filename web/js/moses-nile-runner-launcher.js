(() => {
  'use strict';

  if (window.__mosesNileRunnerLauncherInstalled) return;
  window.__mosesNileRunnerLauncherInstalled = true;

  const VERSION = '2';
  const GAME_VERSION = '1';
  const THREE_VERSION = '1';
  const GAME_KEY = 'moses-nile-runner';
  const TITLE = 'Моисей: путь по Нилу';
  const GAME_SRC = `web/games/moses-nile-runner.js?v=${GAME_VERSION}`;
  const THREE_GAME_SRC = `web/games/moses-nile-runner-3d.js?v=${THREE_VERSION}`;
  const ICON_SRC = `web/assets/icons/moses-nile-runner.svg?v=1`;
  let gameLoadPromise = null;
  let threeLoadPromise = null;
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

  function loadScript(src, selector, datasetKey) {
    return new Promise((resolve, reject) => {
      const existing = document.querySelector(selector);
      if (existing) {
        if (existing.dataset.loaded === '1') {
          resolve();
          return;
        }
        existing.addEventListener('load', resolve, { once: true });
        existing.addEventListener('error', reject, { once: true });
        return;
      }
      const script = document.createElement('script');
      script.src = src;
      script.async = false;
      script.dataset[datasetKey] = '1';
      script.onload = () => {
        script.dataset.loaded = '1';
        resolve();
      };
      script.onerror = () => reject(new Error(`Не удалось загрузить ${src}`));
      document.body.appendChild(script);
    });
  }

  function loadGame() {
    if (typeof window.startMosesNileRunner === 'function') return Promise.resolve();
    if (gameLoadPromise) return gameLoadPromise;
    gameLoadPromise = loadScript(
      GAME_SRC,
      `script[data-moses-nile-runner="1"]`,
      'mosesNileRunner'
    ).finally(() => { gameLoadPromise = null; });
    return gameLoadPromise;
  }

  function loadThreeAddon() {
    if (typeof window.__startMosesNile3D === 'function') return Promise.resolve();
    if (threeLoadPromise) return threeLoadPromise;
    threeLoadPromise = loadScript(
      THREE_GAME_SRC,
      `script[data-moses-nile-3d="1"]`,
      'mosesNile3d'
    ).finally(() => { threeLoadPromise = null; });
    return threeLoadPromise;
  }

  async function openGame() {
    const container = document.getElementById('game-container');
    const menu = document.getElementById('menu-container');
    if (!container) return;

    rememberOpen();
    try { window.__cleanupMosesNile3D?.(); } catch {}
    try { window.__mosesNileCleanup?.(); } catch {}
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

      loadThreeAddon()
        .then(() => {
          if (document.body.dataset.currentGame === GAME_KEY) window.__startMosesNile3D?.();
        })
        .catch((error) => console.warn('[Moses Nile Runner] 3D layer unavailable, using fallback', error));
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
      try { window.__cleanupMosesNile3D?.(); } catch {}
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
    window.addEventListener('pagehide', () => {
      try { window.__cleanupMosesNile3D?.(); } catch {}
      try { window.__mosesNileCleanup?.(); } catch {}
    }, { once: true });
  }

  window.openMosesNileRunner = openGame;
  window.__mosesNileRunnerLauncherVersion = VERSION;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
