(() => {
  const GAME_KEY = 'bible-sketch';
  const GAME_TITLE = 'Библейский художник';
  const GAME_DESC = 'Рисуйте по очереди и найдите шпиона';
  let gameScriptPromise = null;

  function iconHTML() {
    return `<svg class="game-card__svg" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <defs>
        <linearGradient id="bsk-bg" x1="8" y1="6" x2="57" y2="58" gradientUnits="userSpaceOnUse"><stop stop-color="#312E81"/><stop offset=".55" stop-color="#4F46E5"/><stop offset="1" stop-color="#0EA5E9"/></linearGradient>
        <linearGradient id="bsk-gold" x1="18" y1="16" x2="48" y2="49" gradientUnits="userSpaceOnUse"><stop stop-color="#FFF3A3"/><stop offset=".45" stop-color="#FBBF24"/><stop offset="1" stop-color="#D97706"/></linearGradient>
        <filter id="bsk-shadow" x="-20%" y="-20%" width="140%" height="150%"><feDropShadow dx="0" dy="3" stdDeviation="2" flood-opacity=".28"/></filter>
      </defs>
      <rect x="4" y="4" width="56" height="56" rx="18" fill="url(#bsk-bg)" filter="url(#bsk-shadow)"/>
      <path d="M16 43c7-9 14-16 26-22" stroke="#fff" stroke-width="8" stroke-linecap="round" opacity=".14"/>
      <path d="M19 45c7-10 15-18 27-25" stroke="url(#bsk-gold)" stroke-width="5" stroke-linecap="round"/>
      <path d="M44 18l5-3 1 6-4 2-2-5z" fill="#F8FAFC"/>
      <path d="M17 47l7-2-5-5-2 7z" fill="#FFF7ED"/>
      <path d="M14 25c5-6 12-9 18-9s13 3 18 9c-5 6-12 9-18 9s-13-3-18-9z" fill="#0F172A" opacity=".78" stroke="#C7D2FE" stroke-width="1.5"/>
      <circle cx="32" cy="25" r="5" fill="#E0E7FF"/><circle cx="32" cy="25" r="2.2" fill="#312E81"/>
      <path d="M11 50c8-3 14-2 20 1s12 3 22-1" stroke="#fff" stroke-width="2" stroke-linecap="round" opacity=".75"/>
    </svg>`;
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
  }

  function loadGameScript() {
    if (typeof window.startBibleSketchGame === 'function') return Promise.resolve();
    if (gameScriptPromise) return gameScriptPromise;
    gameScriptPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'games/bible-sketch.js?v=1';
      script.dataset.gameScript = 'games/bible-sketch.js';
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
    window.scrollTo({ top: 0, behavior: 'auto' });
    try {
      await loadGameScript();
      if (document.body.dataset.currentGame !== GAME_KEY) return;
      window.startBibleSketchGame?.();
    } catch (error) {
      console.error('Bible Sketch launcher error', error);
      if (container) container.innerHTML = `<section class="app-error-card fade-in"><h2>Не удалось открыть игру</h2><p>${escapeText(error?.message || error)}</p><button class="back-button" onclick="goToMainMenu()">В главное меню</button></section>`;
    }
  }

  function patchShowGame() {
    const current = window.showGame;
    if (typeof current !== 'function' || current.__bibleSketchWrapped) return;
    const wrapped = function(gameName) {
      if (String(gameName) === GAME_KEY) return openGame();
      return current.apply(this, arguments);
    };
    wrapped.__bibleSketchWrapped = true;
    window.showGame = wrapped;
  }

  function patchGoToMenu() {
    const current = window.goToMainMenu;
    if (typeof current !== 'function' || current.__bibleSketchWrapped) return;
    const wrapped = function() {
      if (document.body.dataset.currentGame === GAME_KEY) {
        try { window.__bibleSketchCleanup?.(); } catch {}
      }
      return current.apply(this, arguments);
    };
    wrapped.__bibleSketchWrapped = true;
    window.goToMainMenu = wrapped;
  }

  function patchNavigation() {
    patchShowGame();
    patchGoToMenu();
  }

  function escapeText(value) {
    return String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  }

  const observer = new MutationObserver(() => {
    patchNavigation();
    ensureCard();
  });
  observer.observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-ready', 'class', 'data-mode', 'data-current-game'] });
  patchNavigation();
  ensureCard();
  window.__bibleSketchEnsureCard = ensureCard;
})();