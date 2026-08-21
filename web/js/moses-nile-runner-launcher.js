(() => {
  'use strict';

  if (window.__mosesNileRunnerLauncherInstalled) return;
  window.__mosesNileRunnerLauncherInstalled = true;

  const VERSION = '6';
  const GAME_KEY = 'moses-nile-runner';
  const TITLE = 'Моисей: путь по Нилу';
  const GAME_URL = 'https://alias-spy-games-moses-nile-v7-preview.vitaledanilov.workers.dev/?embedded=1&v=752';
  const GAME_ORIGIN = new URL(GAME_URL).origin;
  const ICON_SRC = 'web/assets/icons/moses-nile-runner.svg?v=2';
  const STYLE_ID = 'moses-nile-v75-launcher-style';
  let nativeGoToMainMenu = null;

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

  function ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      body[data-current-game="moses-nile-runner"] { overflow: hidden !important; background: #8d795b !important; }
      body[data-current-game="moses-nile-runner"] .app-header { display: none !important; }
      body[data-current-game="moses-nile-runner"] #game-container {
        position: fixed !important; inset: 0 !important; z-index: 2500 !important;
        width: 100% !important; height: 100% !important; min-height: 100dvh !important;
        max-width: none !important; margin: 0 !important; padding: 0 !important;
        overflow: hidden !important; background: #8d795b !important;
      }
      .mnr-v75-host { position: absolute; inset: 0; width: 100%; height: 100%; overflow: hidden; background: #8d795b; }
      .mnr-v75-frame { display: block; width: 100%; height: 100%; border: 0; background: #8d795b; }
      .mnr-v75-close {
        position: absolute; z-index: 5; top: max(12px, env(safe-area-inset-top)); left: 12px;
        width: 48px; height: 48px; display: grid; place-items: center; padding: 0;
        border: 1px solid rgba(255,248,225,.46); border-radius: 50%;
        color: #fff8e6; background: rgba(36,32,24,.58); box-shadow: 0 8px 24px rgba(25,17,8,.20);
        backdrop-filter: blur(12px); font-size: 25px; font-weight: 900; line-height: 1;
      }
      .mnr-v75-close:active { transform: scale(.92); }
      .mnr-v75-loader {
        position: absolute; z-index: 4; inset: 0; display: grid; place-items: center;
        color: #fff2d2; background: #8d795b url("web/games/moses-nile-v7/assets/nile-reference-bg-v75.webp") center/cover no-repeat;
        transition: opacity .25s ease, visibility .25s ease;
      }
      .mnr-v75-loader::after {
        content: "ГОТОВИМ ПУТЬ ПО НИЛУ…"; padding: 9px 13px; border-radius: 999px;
        background: rgba(40,35,26,.58); font-size: 11px; font-weight: 900; letter-spacing: .08em;
      }
      .mnr-v75-loader.is-hidden { opacity: 0; visibility: hidden; pointer-events: none; }
    `;
    document.head.appendChild(style);
  }

  function cleanupGame() {
    const frame = document.querySelector('.mnr-v75-frame');
    try { frame?.contentWindow?.postMessage?.({ type: 'moses-nile:pause' }, GAME_ORIGIN); } catch {}
    document.querySelector('.mnr-v75-host')?.remove();
  }

  function returnToMenu() {
    if (typeof window.appGoToMainMenu === 'function') window.appGoToMainMenu();
    else if (typeof window.goToMainMenu === 'function') window.goToMainMenu();
  }

  function openGame() {
    const container = document.getElementById('game-container');
    const menu = document.getElementById('menu-container');
    if (!container) return;
    rememberOpen();
    cleanupGame();
    ensureStyles();
    if (menu) menu.classList.add('hidden');
    document.body.dataset.mode = 'game';
    document.body.dataset.currentGame = GAME_KEY;
    window.scrollTo({ top: 0, behavior: 'auto' });

    const host = document.createElement('section');
    host.className = 'mnr-v75-host';
    host.setAttribute('aria-label', TITLE);
    host.innerHTML = `
      <iframe class="mnr-v75-frame" title="${TITLE}" src="${GAME_URL}" loading="eager" allow="autoplay"></iframe>
      <div class="mnr-v75-loader" aria-hidden="true"></div>
      <button class="mnr-v75-close" type="button" aria-label="Вернуться в главное меню">←</button>
    `;
    container.replaceChildren(host);
    const frame = host.querySelector('.mnr-v75-frame');
    const loader = host.querySelector('.mnr-v75-loader');
    const close = host.querySelector('.mnr-v75-close');
    close.addEventListener('click', returnToMenu);
    frame.addEventListener('load', () => {
      loader.classList.add('is-hidden');
      try { frame.contentWindow?.focus?.(); } catch {}
    }, { once: true });
    frame.addEventListener('error', () => {
      loader.classList.remove('is-hidden');
      loader.setAttribute('aria-label', 'Не удалось загрузить игру');
    }, { once: true });
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
      <span class="game-card__body"><span class="game-card__title">${TITLE}</span><span class="game-card__desc">Проведи корзинку по Нилу</span></span>
    `;
    card.addEventListener('click', openGame);
    root.appendChild(card);
  }

  function patchMenuReturn() {
    if (nativeGoToMainMenu || typeof window.appGoToMainMenu !== 'function') return;
    nativeGoToMainMenu = window.appGoToMainMenu;
    const wrapped = function (...args) {
      cleanupGame();
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
    window.addEventListener('pagehide', cleanupGame, { once: true });
  }

  window.openMosesNileRunner = openGame;
  window.__mosesNileRunnerLauncherVersion = VERSION;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
