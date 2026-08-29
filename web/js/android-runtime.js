(() => {
  let bridge = null;
  try { bridge = window.AndroidApp || null; } catch {}
  if (!bridge) return;

  let rawId = '';
  try { rawId = String(bridge.getTelegramId?.() || '').trim(); } catch {}
  if (!/^\d{5,20}$/.test(rawId)) return;

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

    // Standalone APK identity is intentionally not presented as signed Telegram
    // initData. Admin actions remain unavailable; user requests use /android/compat.
    try { webApp.initData = ''; } catch {}

    if (typeof webApp.ready !== 'function') webApp.ready = () => {};
    if (typeof webApp.expand !== 'function') webApp.expand = () => {};
    if (typeof webApp.enableClosingConfirmation !== 'function') webApp.enableClosingConfirmation = () => {};
    if (typeof webApp.openLink !== 'function') webApp.openLink = (url) => { location.href = String(url || ''); };
    if (typeof webApp.openTelegramLink !== 'function') webApp.openTelegramLink = (url) => { location.href = String(url || ''); };
    return webApp;
  }

  installIdentity();

  // telegram-web-app.js is loaded async. On a standalone WebView it may finish
  // after this runtime and replace window.Telegram.WebApp. Re-apply the verified
  // Android identity for a short bounded window so startup is deterministic.
  const sdk = document.getElementById('telegram-web-app-sdk');
  sdk?.addEventListener('load', installIdentity, { once: true });
  [50, 180, 420, 900, 1800, 3200].forEach((delay) => window.setTimeout(installIdentity, delay));
  window.addEventListener('load', installIdentity, { once: true });

  function removeAdminEntry() {
    const admin = document.getElementById('admin-btn');
    if (admin) admin.remove();
  }

  const observer = new MutationObserver(removeAdminEntry);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  removeAdminEntry();

  window.AndroidRuntime = {
    reinstallIdentity: installIdentity,
    userId: rawId,
    source: 'verified-native-bridge',
  };

  window.addEventListener('beforeunload', () => observer.disconnect(), { once: true });
})();
