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

  // Адрес витрины: те же файлы приложения, отданные Cloudflare под своим
  // именем. Safari показывает адрес открытого сайта и запоминает его при
  // установке, поэтому ярлык ставится оттуда, а не с github.io.
  const SHELL_URL = String(document.querySelector('meta[name="app-shell"]')?.content || '').replace(/\/+$/, '');
  // В Safari уходит не игра, а страница установки: человек попадает туда, чтобы
  // поставить ярлык, и объяснять это надо на самой странице, а не в мессенджере,
  // который к тому времени уже закрыт. Ярлык при этом ведёт на саму игру.
  const INSTALL_PAGE = SHELL_URL ? `${SHELL_URL}/install.html` : '';

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

  /** Мы уже на витрине — значит Safari открыт там, куда нужно. */
  const onShell = () => Boolean(SHELL_URL) && location.origin === SHELL_URL;

  function openInSafari() {
    if (!INSTALL_PAGE) return false;
    const telegram = window.Telegram?.WebApp;
    // openLink уводит из мессенджера во внешний браузер — на iPhone это Safari,
    // единственный, кто умеет ставить ярлык на главный экран.
    if (typeof telegram?.openLink === 'function') {
      try { telegram.openLink(INSTALL_PAGE, { try_instant_view: false }); return true; } catch { /* откроем обычной ссылкой */ }
    }
    try { window.open(INSTALL_PAGE, '_blank', 'noopener'); return true; } catch { return false; }
  }

  function iosSheet() {
    if (document.getElementById('install-ios-sheet')) return;
    const needsSafari = !onShell();
    const node = document.createElement('div');
    node.id = 'install-ios-sheet';
    node.className = 'install-sheet';
    node.innerHTML = `
      <div class="install-sheet__card">
        <h3>Приложение на главный экран</h3>
        ${needsSafari ? `
        <p class="install-sheet__lead">
          Ярлык умеет создавать только Safari, поэтому сначала откройте приложение в нём.
        </p>
        <button type="button" class="install-sheet__safari" data-install-safari>Открыть в Safari</button>
        <p class="install-sheet__then">Дальше — в открывшемся Safari:</p>` : ''}
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
      if (event.target.closest('[data-install-safari]')) { openInSafari(); return; }
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
      // В Android-приложении ярлык уже есть, и ставить второй незачем.
      if (window.__ANDROID_APK__ === true) return true;
      if (standalone() || dismissed()) return true;
      // Внутри Telegram карточка нужна только на iPhone: именно оттуда человек
      // и приходит, а увести его в Safari можно лишь отсюда. На остальных
      // платформах Telegram сам умеет класть ярлык на экран.
      if (insideTelegram()) { if (!isIOS() || !INSTALL_PAGE) return true; }
      else if (!deferredPrompt && !isIOS()) return true;
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

  window.InstallApp = {
    mount, canPrompt: () => Boolean(deferredPrompt), isIOS,
    shellUrl: () => SHELL_URL, installPage: () => INSTALL_PAGE, openInSafari,
  };

  const observer = new MutationObserver(() => { mount(); });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, { once: true });
  else mount();
})();
