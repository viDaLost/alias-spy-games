(() => {
  let bridge = null;
  try { bridge = window.AndroidApp || null; } catch {}
  if (!bridge) return;

  let rawId = '';
  try { rawId = String(bridge.getTelegramId?.() || '').trim(); } catch {}
  if (!/^\d{5,20}$/.test(rawId)) return;

  const ANDROID_INIT_MARKER = 'android-verified-session';
  window.__ANDROID_APK__ = true;
  window.__ANDROID_TELEGRAM_ID__ = rawId;
  document.documentElement.classList.add('android-apk-runtime');

  const numericId = Number(rawId);
  const suffix = rawId.slice(-4);
  const apkUser = {
    id: Number.isSafeInteger(numericId) ? numericId : rawId,
    first_name: `Игрок ${suffix}`,
    last_name: '',
    username: '',
    language_code: 'ru',
  };

  function installLaunchContext() {
    const current = window.TelegramLaunchContext || {};
    window.TelegramLaunchContext = {
      ...current,
      getInitData: () => ANDROID_INIT_MARKER,
      getUser: () => window.Telegram?.WebApp?.initDataUnsafe?.user || apkUser,
      source: 'android-native-session',
      hasInitData: true,
    };
  }

  function installIdentity() {
    const telegram = window.Telegram = window.Telegram || {};
    const webApp = telegram.WebApp = telegram.WebApp || {};

    try {
      const unsafe = webApp.initDataUnsafe && typeof webApp.initDataUnsafe === 'object'
        ? webApp.initDataUnsafe
        : {};
      unsafe.user = apkUser;
      try { webApp.initDataUnsafe = unsafe; } catch {}
      if (String(webApp.initDataUnsafe?.user?.id || '') !== rawId) {
        try {
          Object.defineProperty(webApp, 'initDataUnsafe', {
            value: { ...unsafe, user: apkUser },
            configurable: true,
            writable: true,
          });
        } catch {}
      }
    } catch {
      try {
        Object.defineProperty(webApp, 'initDataUnsafe', {
          value: { user: apkUser },
          configurable: true,
          writable: true,
        });
      } catch {}
    }

    // Never present the Android session as signed Telegram initData. Social
    // modules use TelegramLaunchContext only as an availability marker; their
    // /compat requests are translated to authenticated /android/compat calls by
    // backend-bridge.js.
    try { webApp.initData = ''; } catch {}
    installLaunchContext();

    if (typeof webApp.ready !== 'function') webApp.ready = () => {};
    if (typeof webApp.expand !== 'function') webApp.expand = () => {};
    if (typeof webApp.enableClosingConfirmation !== 'function') webApp.enableClosingConfirmation = () => {};
    if (typeof webApp.openLink !== 'function') webApp.openLink = (url) => { location.href = String(url || ''); };
    if (typeof webApp.openTelegramLink !== 'function') webApp.openTelegramLink = (url) => { location.href = String(url || ''); };
    return webApp;
  }

  function ensureStyle(id, href) {
    if (document.getElementById(id)) return;
    const link = document.createElement('link');
    link.id = id;
    link.rel = 'stylesheet';
    link.href = href;
    document.head.appendChild(link);
  }

  function ensureScript(id, src) {
    if (document.getElementById(id)) return;
    const script = document.createElement('script');
    script.id = id;
    script.src = src;
    script.async = false;
    document.body.appendChild(script);
  }

  function ensureSocialFeatures() {
    if (window.__APP_TELEMETRY_DISABLED__ === true) return;
    installIdentity();
    ensureStyle('social-dock-v2-css', 'web/styles/social-dock-v2.css?v=1');
    ensureStyle('game-friend-invites-css', 'web/styles/game-friend-invites.css?v=1');
    ensureScript('social-dock-v2-js', 'web/js/social-dock-v2.js?v=2');
    ensureScript('game-friend-invites-js', 'web/js/game-friend-invites.js?v=2');
  }

  installIdentity();

  // telegram-web-app.js is async and can replace window.Telegram.WebApp. A few
  // bounded reapplications are enough; the previous six timers plus a permanent
  // DOM observer created unnecessary work on slower Android devices.
  const sdk = document.getElementById('telegram-web-app-sdk');
  sdk?.addEventListener('load', installIdentity, { once: true });
  [80, 350, 1100].forEach((delay) => window.setTimeout(installIdentity, delay));
  window.addEventListener('load', installIdentity, { once: true });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', ensureSocialFeatures, { once: true });
  } else {
    window.setTimeout(ensureSocialFeatures, 0);
  }

  // Admin controls are not available in the standalone APK. Observe only until
  // the menu is mounted instead of watching every DOM mutation for the whole
  // lifetime of every game.
  let adminObserver = null;
  function removeAdminEntry() {
    const admin = document.getElementById('admin-btn');
    if (!admin) return false;
    admin.remove();
    adminObserver?.disconnect();
    adminObserver = null;
    return true;
  }

  if (!removeAdminEntry()) {
    adminObserver = new MutationObserver(removeAdminEntry);
    adminObserver.observe(document.documentElement, { childList: true, subtree: true });
    window.setTimeout(() => {
      adminObserver?.disconnect();
      adminObserver = null;
    }, 6000);
  }

  window.AndroidRuntime = {
    reinstallIdentity: installIdentity,
    ensureSocialFeatures,
    userId: rawId,
    source: 'verified-native-bridge',
  };

  window.addEventListener('beforeunload', () => adminObserver?.disconnect(), { once: true });
})();
