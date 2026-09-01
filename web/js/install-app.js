(() => {
  'use strict';

  // Установка приложения на главный экран.
  //
  // На Android и в десктопных браузерах браузер сам предлагает установку через
  // beforeinstallprompt — остаётся показать кнопку и передать событие дальше.
  // Safari на iPhone такого события не даёт вовсе: там установка делается
  // вручную через «Поделиться» → «На экран „Домой“», и единственное, что можно
  // сделать, — показать, куда нажимать.
  //
  // Внутри Telegram карточка не появляется: там приложение и так открыто в
  // мессенджере, а ярлык на экране создаётся его собственным меню.

  const SEEN_KEY = 'install_hint_seen_v1';

  let deferredPrompt = null;

  function insideTelegram() {
    try { return Boolean(String(window.Telegram?.WebApp?.initData || '').trim()); } catch { return false; }
  }

  const standalone = () => window.matchMedia?.('(display-mode: standalone)')?.matches
    || window.navigator.standalone === true;

  const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  function dismissed() {
    try { return localStorage.getItem(SEEN_KEY) === '1'; } catch { return true; }
  }

  function markDismissed() {
    try { localStorage.setItem(SEEN_KEY, '1'); } catch { /* приватный режим */ }
  }

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredPrompt = event;
    mount();
  });

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    markDismissed();
    document.getElementById('install-app-btn')?.remove();
  });

  function iosSheet() {
    if (document.getElementById('install-ios-sheet')) return;
    const node = document.createElement('div');
    node.id = 'install-ios-sheet';
    node.className = 'install-sheet';
    node.innerHTML = `
      <div class="install-sheet__card">
        <h3>Приложение на главный экран</h3>
        <ol class="install-sheet__steps">
          <li>Нажмите <b>«Поделиться»</b> — квадрат со стрелкой вверх внизу экрана Safari.</li>
          <li>Пролистайте список и выберите <b>«На экран „Домой“»</b>.</li>
          <li>Нажмите <b>«Добавить»</b> — появится значок «Библейские игры».</li>
        </ol>
        <p class="install-sheet__note">
          Приложение откроется на весь экран и будет работать без интернета.
          Чтобы прогресс совпал с Telegram, зайдите в профиль по коду из бота.
        </p>
        <button type="button" class="install-sheet__ok" data-install-close>Понятно</button>
      </div>`;
    node.addEventListener('click', (event) => {
      if (event.target.closest('[data-install-close]') || event.target === node) {
        markDismissed();
        node.remove();
      }
    });
    document.body.append(node);
  }

  async function install() {
    if (deferredPrompt) {
      const prompt = deferredPrompt;
      deferredPrompt = null;
      try {
        prompt.prompt();
        const choice = await prompt.userChoice;
        if (choice?.outcome === 'accepted') markDismissed();
      } catch { /* браузер отказал — карточка остаётся на месте */ }
      return;
    }
    iosSheet();
  }

  function icon() {
    return `<svg class="game-card__svg" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="install_bg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#1E3A8A"/><stop offset="100%" stop-color="#3B82F6"/>
        </linearGradient>
        <linearGradient id="install_gold" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#FFE259"/><stop offset="100%" stop-color="#FFA751"/>
        </linearGradient>
      </defs>
      <rect x="4" y="4" width="56" height="56" rx="18" fill="url(#install_bg)"/>
      <rect x="20" y="12" width="24" height="34" rx="5" fill="none" stroke="url(#install_gold)" stroke-width="3"/>
      <path d="M32 20v14m0 0l-5-5m5 5l5-5" stroke="url(#install_gold)" stroke-width="3.4"
            stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M25 41h14" stroke="url(#install_gold)" stroke-width="3" stroke-linecap="round"/>
    </svg>`;
  }

  function mount() {
    const root = document.getElementById('system-actions');
    if (!root || document.getElementById('install-app-btn')) return Boolean(root);
    if (insideTelegram() || window.__ANDROID_APK__ === true) return true;
    if (standalone() || dismissed()) return true;
    // Ни события установки, ни Safari на iPhone — предлагать нечего.
    if (!deferredPrompt && !isIOS()) return true;

    const card = document.createElement('button');
    card.type = 'button';
    card.id = 'install-app-btn';
    card.className = 'game-card game-card--install';
    card.innerHTML = `
      <span class="game-card__icon">${icon()}</span>
      <span class="game-card__body">
        <span class="game-card__title">Установить приложение</span>
        <span class="game-card__desc">Ярлык на главный экран, полный экран и игра без интернета</span>
      </span>`;
    card.addEventListener('click', install);

    const after = document.getElementById('web-session-btn') || document.getElementById('game-rules-btn')
      || document.getElementById('admin-btn');
    if (after) root.insertBefore(card, after);
    else root.append(card);
    return true;
  }

  window.InstallApp = { mount, canPrompt: () => Boolean(deferredPrompt), isIOS };

  const observer = new MutationObserver(() => { mount(); });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, { once: true });
  else mount();
})();
