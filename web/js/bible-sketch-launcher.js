(() => {
  const GAME_KEY = 'bible-sketch';
  const GAME_TITLE = 'Библейский художник';
  const GAME_DESC = 'Рисуйте по очереди и найдите шпиона';
  const ICON_URL = 'web/assets/icons/bible-sketch.webp?v=3';
  const LANDSCAPE_STYLE_URL = 'web/games/bible-sketch-landscape-v2.css?v=2';
  let gameScriptPromise = null;
  let showPatched = false;
  let wasSketch = false;

  function iconHTML() {
    return `<img class="game-card__svg bible-sketch-icon" src="${ICON_URL}" alt="" width="192" height="192" loading="lazy" decoding="async" fetchpriority="low" draggable="false" style="width:100%;height:100%;display:block;object-fit:cover;border-radius:22%" />`;
  }

  function ensureCard() {
    const root = document.getElementById('company-games');
    if (!root || root.dataset.ready !== '1' || document.getElementById('bible-sketch-card')) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.id = 'bible-sketch-card';
    button.className = 'game-card';
    button.dataset.gameKey = GAME_KEY;
    button.setAttribute('onclick', `showGame('${GAME_KEY}')`);
    button.setAttribute('aria-label', `Открыть игру ${GAME_TITLE}`);
    button.innerHTML = `<span class="game-card__icon">${iconHTML()}</span><span class="game-card__body"><span class="game-card__title">${GAME_TITLE}</span><span class="game-card__desc">${GAME_DESC}</span></span>`;
    root.appendChild(button);
  }

  function rememberOpen() {
    let history = [];
    try { history = JSON.parse(localStorage.getItem('last_games_history') || '[]'); } catch {}
    if (!Array.isArray(history)) history = [];
    history = [GAME_TITLE, ...history.filter((title) => title !== GAME_TITLE)].slice(0, 3);
    localStorage.setItem('last_games_history', JSON.stringify(history));
    const id = window.Telegram?.WebApp?.initDataUnsafe?.user?.id;
    if (id && typeof window.apiRequest === 'function') {
      Promise.resolve(window.apiRequest({ action: 'updateHistory', id, history })).catch(() => {});
    }
  }

  function ensureLandscapeStyles() {
    let link = document.getElementById('bible-sketch-landscape-v2-css');
    if (!link) {
      link = document.createElement('link');
      link.id = 'bible-sketch-landscape-v2-css';
      link.rel = 'stylesheet';
      link.href = LANDSCAPE_STYLE_URL;
      document.head.appendChild(link);
      return link;
    }

    const currentHref = String(link.getAttribute('href') || '');
    if (!currentHref.includes('bible-sketch-landscape-v2.css')) {
      link.setAttribute('href', LANDSCAPE_STYLE_URL);
    }
    if (!link.isConnected) document.head.appendChild(link);
    return link;
  }

  function loadGameScript() {
    if (typeof window.startBibleSketchGame === 'function') return Promise.resolve();
    if (gameScriptPromise) return gameScriptPromise;
    gameScriptPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'web/games/bible-sketch.js?v=2';
      script.dataset.gameScript = 'web/games/bible-sketch.js';
      script.onload = resolve;
      script.onerror = () => reject(new Error('Не удалось загрузить Библейского художника'));
      document.body.appendChild(script);
    });
    return gameScriptPromise;
  }

  async function openGame() {
    rememberOpen();
    const menu = document.getElementById('menu-container');
    const container = document.getElementById('game-container');
    if (menu) menu.classList.add('hidden');
    if (container) container.innerHTML = `<div class="app-game-loading"><div class="app-loader__ring"></div><p>Загрузка игры...</p></div>`;
    document.body.dataset.mode = 'game';
    document.body.dataset.currentGame = GAME_KEY;
    wasSketch = true;
    window.scrollTo({ top: 0, behavior: 'auto' });
    try {
      ensureLandscapeStyles();
      await loadGameScript();
      if (document.body.dataset.currentGame !== GAME_KEY) return;
      window.startBibleSketchGame?.();
    } catch (error) {
      console.error('Bible Sketch launcher error', error);
      if (container) container.innerHTML = `<section class="app-error-card fade-in"><h2>Не удалось открыть игру</h2><p>${escapeText(error?.message || error)}</p><button class="back-button" onclick="goToMainMenu()">В главное меню</button></section>`;
    }
  }

  function patchShowGameOnce() {
    if (showPatched || typeof window.showGame !== 'function') return;
    showPatched = true;
    const originalShowGame = window.showGame;
    const wrapped = function(gameName) {
      if (String(gameName) === GAME_KEY) return openGame();
      return originalShowGame.apply(this, arguments);
    };
    wrapped.__bibleSketchWrapped = true;
    window.showGame = wrapped;
  }

  function trackCleanup() {
    const isSketch = document.body?.dataset.currentGame === GAME_KEY;
    if (wasSketch && !isSketch) {
      wasSketch = false;
      try { window.__bibleSketchCleanup?.(); } catch {}
    }
    if (isSketch) wasSketch = true;
  }

  function escapeText(value) {
    return String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  }

  const observer = new MutationObserver(() => {
    patchShowGameOnce();
    ensureCard();
    trackCleanup();
  });
  observer.observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-ready', 'class', 'data-mode', 'data-current-game'] });

  patchShowGameOnce();
  ensureCard();
  trackCleanup();
  window.__bibleSketchEnsureCard = ensureCard;
})();
