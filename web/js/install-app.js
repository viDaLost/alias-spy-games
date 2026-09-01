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
  //
  // Исключение — главный администратор: ему карточка показывается всегда, в том
  // числе в Telegram и на компьютере, чтобы можно было посмотреть, что увидит
  // человек с iPhone. Признак роли ставит серверная проверка (admin-rbac-root в
  // admin-live-modal-safety.js) — тот же шлюз, что у кнопки админки. Прав это не
  // расширяет: карточка только показывает инструкцию.

  const SEEN_KEY = 'install_hint_seen_v1';

  let deferredPrompt = null;

  function insideTelegram() {
    try { return Boolean(String(window.Telegram?.WebApp?.initData || '').trim()); } catch { return false; }
  }

  const standalone = () => window.matchMedia?.('(display-mode: standalone)')?.matches
    || window.navigator.standalone === true;

  const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  const isRootAdmin = () => document.documentElement.classList.contains('admin-rbac-root');

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
          После установки откройте каждую игру по разу — картинки и поля
          догрузятся в память телефона, и дальше игра пойдёт без интернета.
          Правила и уровни сохраняются сразу, а рисунки — только когда вы их
          однажды увидите.
        </p>
        <p class="install-sheet__note install-sheet__note--quiet">
          Чтобы прогресс совпал с Telegram, после установки зайдите в профиль
          по коду из бота — карточка «Вход в профиль» в меню внизу.
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

  const CARD_ICON = 'web/assets/icons/install-ios.webp?v=1';

  function mount() {
    const root = document.getElementById('system-actions');
    if (!root) return false;
    const owner = isRootAdmin();
    const existing = document.getElementById('install-app-btn');
    if (existing) {
      if (existing.dataset.installOwner === String(owner)) return true;
      existing.remove();
    }
    if (!owner) {
      if (insideTelegram() || window.__ANDROID_APK__ === true) return true;
      if (standalone() || dismissed()) return true;
      // Ни события установки, ни Safari на iPhone — предлагать нечего.
      if (!deferredPrompt && !isIOS()) return true;
    }

    const card = document.createElement('button');
    card.type = 'button';
    card.id = 'install-app-btn';
    card.className = 'game-card game-card--install';
    card.dataset.installOwner = String(owner);
    card.innerHTML = `
      <span class="game-card__icon game-card__icon--image">
        <img class="game-card__img" src="${CARD_ICON}" alt="Иконка установки на iPhone"
             loading="eager" decoding="async" draggable="false" />
      </span>
      <span class="game-card__body">
        <span class="game-card__title">Установить на iPhone</span>
        <span class="game-card__desc">${owner
          ? 'Проверка: так это увидит человек с iPhone'
          : 'Ярлык на главный экран, полный экран и игра без интернета'}</span>
      </span>`;
    card.addEventListener('click', () => (owner ? iosSheet() : install()));

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
