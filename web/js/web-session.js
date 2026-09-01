(() => {
  'use strict';

  // Вход в профиль для веб-приложения, установленного на главный экран.
  //
  // На iPhone нет своего приложения, а ярлык на главном экране открывает тот же
  // сайт вне Telegram — значит, подписи initData нет и сервер не знает, кто
  // пришёл. Тот же вопрос решён в Android-приложении: человек называет свой
  // Telegram ID, бот присылает шестизначный код, приложение обменивает его на
  // долгую сессию. Здесь используются те же самые /android/auth/*: они уже
  // принимают запросы с origin GitHub Pages, ничего нового на сервере не нужно.
  //
  // Внутри Telegram этот вход не показывается никогда: там есть подписанные
  // initData, и спрашивать ID у человека, которого сервер и так знает, незачем.

  const TOKEN_KEY = 'web_session_v1';
  const coreUrl = String(document.querySelector('meta[name="app-core-backend"]')?.content || '').replace(/\/+$/, '');

  const escapeHTML = (value) => String(value ?? '')
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#39;');

  function insideTelegram() {
    try { return Boolean(String(window.Telegram?.WebApp?.initData || '').trim()); } catch { return false; }
  }

  function read() {
    try {
      const raw = JSON.parse(localStorage.getItem(TOKEN_KEY) || 'null');
      if (!raw || typeof raw !== 'object') return null;
      if (!/^bgs_[A-Za-z0-9_-]{40,80}$/.test(String(raw.token || ''))) return null;
      if (Number(raw.expiresAt || 0) <= Date.now()) return null;
      return raw;
    } catch { return null; }
  }

  function write(session) {
    try { localStorage.setItem(TOKEN_KEY, JSON.stringify(session)); } catch { /* приватный режим */ }
  }

  function clear() {
    try { localStorage.removeItem(TOKEN_KEY); } catch { /* приватный режим */ }
  }

  async function post(path, body) {
    const response = await fetch(`${coreUrl}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      cache: 'no-store',
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data?.success === false) {
      const error = new Error(String(data?.error || 'Не удалось выполнить запрос'));
      error.code = String(data?.code || '');
      error.botUsername = String(data?.botUsername || '');
      throw error;
    }
    return data;
  }

  // --- признак «мы не в Telegram» --------------------------------------------------
  //
  // Вёрстка приложения рассчитана на Telegram: сверху зарезервировано место под
  // его кнопки. В браузере и в ярлыке на главном экране этих кнопок нет, и
  // резерв превращается в пустую полосу над каждым экраном.
  //
  // Признак ставится по data-telegram-launch-data, который telegram-launch-context.js
  // выставляет синхронно из параметров запуска, — SDK Telegram грузится
  // асинхронно, и ждать его значило бы показать неправильную вёрстку и потом
  // дёрнуть её на глазах у человека.

  function markEnvironment() {
    const root = document.documentElement;
    const launched = Boolean(root.dataset.telegramLaunchData) || insideTelegram();
    const outside = !launched && window.__ANDROID_APK__ !== true;
    root.classList.toggle('app-outside-telegram', outside);
    root.classList.toggle('app-standalone', outside && (
      window.matchMedia?.('(display-mode: standalone)')?.matches || window.navigator.standalone === true
    ));
  }

  markEnvironment();
  // SDK может доехать позже и принести подпись: тогда признак снимается.
  window.addEventListener('telegram:sdk-ready', markEnvironment);

  const state = { challengeId: '', telegramId: '', busy: false };

  // --- экран входа -----------------------------------------------------------------

  function overlay() { return document.getElementById('web-session-overlay'); }

  function close() {
    overlay()?.remove();
    document.documentElement.classList.remove('web-session-open');
  }

  function idStepMarkup() {
    return `
      <p class="ws-login__kicker">Вход</p>
      <h2 class="ws-login__title">Свой прогресс на этом устройстве</h2>
      <p class="ws-login__text">
        Введите свой Telegram ID — бот пришлёт код подтверждения.
        После входа звёзды, уровни и рейтинг будут те же, что в Telegram.
      </p>
      <label class="ws-login__label" for="ws-login-id">Telegram ID</label>
      <input id="ws-login-id" class="ws-login__input" type="text" inputmode="numeric" autocomplete="off"
             placeholder="Например, 123456789" maxlength="20" />
      <p class="ws-login__hint">Узнать ID можно у бота @userinfobot — он ответит числом.</p>
      <button type="button" class="ws-login__primary" data-ws-request>Получить код</button>
      <button type="button" class="ws-login__ghost" data-ws-skip>Играть без входа</button>
      <p class="ws-login__error" data-ws-error hidden></p>`;
  }

  function codeStepMarkup() {
    return `
      <p class="ws-login__kicker">Подтверждение</p>
      <h2 class="ws-login__title">Код отправлен в Telegram</h2>
      <p class="ws-login__text">Откройте бота и введите шестизначный код. Он действует десять минут.</p>
      <label class="ws-login__label" for="ws-login-code">Код из бота</label>
      <input id="ws-login-code" class="ws-login__input ws-login__input--code" type="text" inputmode="numeric"
             autocomplete="one-time-code" placeholder="000000" maxlength="6" />
      <button type="button" class="ws-login__primary" data-ws-verify>Войти</button>
      <button type="button" class="ws-login__ghost" data-ws-back>Изменить ID</button>
      <p class="ws-login__error" data-ws-error hidden></p>`;
  }

  function paint(markup) {
    const card = overlay()?.querySelector('.ws-login__card');
    if (!card) return;
    card.innerHTML = markup;
    bind(card);
    card.querySelector('input')?.focus?.();
  }

  function showError(message) {
    const node = overlay()?.querySelector('[data-ws-error]');
    if (!node) return;
    node.textContent = message;
    node.hidden = !message;
  }

  function setBusy(busy) {
    state.busy = busy;
    overlay()?.querySelectorAll('button').forEach((button) => { button.disabled = busy; });
    const primary = overlay()?.querySelector('[data-ws-request], [data-ws-verify]');
    if (primary) primary.dataset.wsBusy = busy ? '1' : '';
  }

  async function requestCode() {
    if (state.busy) return;
    const raw = String(overlay()?.querySelector('#ws-login-id')?.value || '').replace(/\D/g, '');
    if (!/^\d{5,20}$/.test(raw)) { showError('Telegram ID — это число из пяти и более цифр'); return; }
    showError('');
    setBusy(true);
    try {
      const result = await post('/android/auth/request', { telegramId: raw });
      state.telegramId = raw;
      state.challengeId = String(result.challengeId || '');
      paint(codeStepMarkup());
    } catch (error) {
      showError(error.code === 'BOT_START_REQUIRED' && error.botUsername
        ? `Откройте @${error.botUsername}, нажмите Start и попробуйте снова`
        : error.message);
    } finally {
      setBusy(false);
    }
  }

  async function verifyCode() {
    if (state.busy) return;
    const code = String(overlay()?.querySelector('#ws-login-code')?.value || '').replace(/\D/g, '');
    if (!/^\d{6}$/.test(code)) { showError('Введите шесть цифр из сообщения бота'); return; }
    showError('');
    setBusy(true);
    try {
      const result = await post('/android/auth/verify', {
        challengeId: state.challengeId,
        telegramId: state.telegramId,
        code,
      });
      write({
        token: String(result.token || ''),
        userId: String(result.userId || ''),
        expiresAt: Number(result.expiresAt || 0),
      });
      close();
      // Перезапуск проще и надёжнее, чем переучивать все модули на лету: они
      // читают личность один раз при загрузке.
      location.reload();
    } catch (error) {
      showError(error.message);
      setBusy(false);
    }
  }

  function bind(card) {
    card.querySelector('[data-ws-request]')?.addEventListener('click', requestCode);
    card.querySelector('[data-ws-verify]')?.addEventListener('click', verifyCode);
    card.querySelector('[data-ws-back]')?.addEventListener('click', () => paint(idStepMarkup()));
    card.querySelector('[data-ws-skip]')?.addEventListener('click', () => {
      // Отказ запоминается на сессию, а не навсегда: человек может передумать
      // и войти позже из карточки в меню.
      try { sessionStorage.setItem('web_session_skipped', '1'); } catch { /* приватный режим */ }
      close();
    });
    card.querySelectorAll('input').forEach((input) => {
      input.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter') return;
        event.preventDefault();
        (card.querySelector('[data-ws-verify]') || card.querySelector('[data-ws-request]'))?.click();
      });
    });
  }

  function open() {
    if (overlay() || insideTelegram() || window.__ANDROID_APK__ === true) return;
    const node = document.createElement('div');
    node.id = 'web-session-overlay';
    node.className = 'ws-login';
    node.innerHTML = '<div class="ws-login__card"></div>';
    document.body.append(node);
    document.documentElement.classList.add('web-session-open');
    paint(idStepMarkup());
  }

  async function logout() {
    const session = read();
    clear();
    if (session?.token) {
      try {
        await fetch(`${coreUrl}/android/auth/logout`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${session.token}` },
          cache: 'no-store',
        });
      } catch { /* сервер узнает о выходе по истечении сессии */ }
    }
    location.reload();
  }

  // --- личность для остального приложения ---------------------------------------------

  function install() {
    // Подпись Telegram всегда главнее сохранённого токена. Иначе человек,
    // однажды вошедший по коду в Safari, открыл бы приложение в Telegram — и
    // модуль стёр бы настоящие initData своей копией личности.
    if (insideTelegram() || window.__ANDROID_APK__ === true) return;
    const session = read();
    if (!session) return;
    // Дальше приложение работает точно так же, как в Android-обёртке: тот же
    // признак, тот же id, те же запросы через /android/compat.
    window.__WEB_SESSION__ = true;
    window.__ANDROID_TELEGRAM_ID__ = session.userId;
    document.documentElement.classList.add('web-session-runtime');

    const suffix = session.userId.slice(-4);
    const user = {
      id: Number.isSafeInteger(Number(session.userId)) ? Number(session.userId) : session.userId,
      first_name: `Игрок ${suffix}`, last_name: '', username: '', language_code: 'ru',
    };
    const telegram = window.Telegram = window.Telegram || {};
    const webApp = telegram.WebApp = telegram.WebApp || {};
    try {
      webApp.initDataUnsafe = { ...(webApp.initDataUnsafe || {}), user };
      webApp.initData = '';
    } catch { /* объект защищён — личность возьмут из __ANDROID_TELEGRAM_ID__ */ }
    if (typeof webApp.ready !== 'function') webApp.ready = () => {};
    if (typeof webApp.expand !== 'function') webApp.expand = () => {};
  }

  install();

  function maybeOffer() {
    if (insideTelegram() || window.__ANDROID_APK__ === true || read()) return;
    if (!coreUrl) return;
    let skipped = false;
    try { skipped = sessionStorage.getItem('web_session_skipped') === '1'; } catch { skipped = false; }
    if (skipped) return;
    // Предложение показывается только установленному приложению: случайному
    // посетителю сайта незачем сразу спрашивать Telegram ID.
    const standalone = window.matchMedia?.('(display-mode: standalone)')?.matches
      || window.navigator.standalone === true;
    if (!standalone) return;
    open();
  }

  // --- карточка в меню ----------------------------------------------------------------

  const CARD_ICON = 'web/assets/icons/profile.webp?v=1';

  /** Кто сейчас играет — тем языком, каким это стоит показать человеку. */
  function profileState() {
    if (window.__ANDROID_APK__ === true) {
      const id = String(window.__ANDROID_TELEGRAM_ID__ || '');
      return { kind: 'android', title: 'Профиль', desc: id ? `Вход подтверждён, Telegram ID ${id}` : 'Вход подтверждён' };
    }
    if (insideTelegram()) {
      const user = window.Telegram?.WebApp?.initDataUnsafe?.user || {};
      const name = [user.first_name, user.last_name].filter(Boolean).join(' ')
        || (user.username ? `@${user.username}` : '');
      return {
        kind: 'telegram',
        title: 'Профиль',
        desc: name ? `${name} · вход через Telegram` : 'Вход через Telegram',
      };
    }
    if (read()) {
      return { kind: 'web', title: 'Выйти из профиля', desc: `Прогресс синхронизируется с Telegram ID ${read().userId}` };
    }
    return { kind: 'guest', title: 'Вход в профиль', desc: 'Код из бота — и звёзды с уровнями будут те же, что в Telegram' };
  }

  function addMenuCard() {
    const root = document.getElementById('system-actions');
    if (!root || !coreUrl) return Boolean(root);

    // Карточка есть всегда, но делает разное. Внутри Telegram и в
    // Android-приложении вход уже подтверждён, и она просто показывает, под кем
    // играют: раньше её там не было вовсе, и раздел выглядел так, будто профиля
    // у приложения нет.
    const profile = profileState();
    const existing = document.getElementById('web-session-btn');
    if (existing && existing.dataset.wsKind === profile.kind && existing.dataset.wsDesc === profile.desc) return true;
    existing?.remove();

    const card = document.createElement('button');
    card.type = 'button';
    card.id = 'web-session-btn';
    card.className = 'game-card game-card--web-session';
    card.dataset.wsKind = profile.kind;
    card.dataset.wsDesc = profile.desc;
    card.innerHTML = `
      <span class="game-card__icon game-card__icon--image">
        <img class="game-card__img" src="${CARD_ICON}" alt="Иконка профиля"
             loading="eager" decoding="async" draggable="false" />
      </span>
      <span class="game-card__body">
        <span class="game-card__title">${escapeHTML(profile.title)}</span>
        <span class="game-card__desc">${escapeHTML(profile.desc)}</span>
      </span>`;
    card.addEventListener('click', () => {
      if (profile.kind === 'web') { logout(); return; }
      if (profile.kind === 'guest') { open(); return; }
      // Внутри Telegram выходить некуда: личность приходит из мессенджера.
      window.showToast?.(profile.desc);
    });

    const after = document.getElementById('game-rules-btn') || document.getElementById('leaderboard-btn')
      || document.getElementById('admin-btn');
    if (after) root.insertBefore(card, after);
    else root.append(card);
    return true;
  }

  const menuObserver = new MutationObserver(() => { addMenuCard(); });
  menuObserver.observe(document.documentElement, { childList: true, subtree: true });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', addMenuCard, { once: true });
  else addMenuCard();

  window.WebSession = {
    token: () => read()?.token || '',
    userId: () => read()?.userId || '',
    active: () => Boolean(read()),
    open,
    logout,
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', maybeOffer, { once: true });
  else maybeOffer();
})();
