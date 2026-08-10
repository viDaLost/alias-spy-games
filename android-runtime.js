(() => {
  let bridge = null;
  try { bridge = window.AndroidApp || null; } catch {}
  if (!bridge) return;

  let rawId = '';
  try { rawId = String(bridge.getTelegramId?.() || '').trim(); } catch {}
  if (!/^\d{5,20}$/.test(rawId)) return;

  window.__ANDROID_APK__ = true;
  window.__ANDROID_TELEGRAM_ID__ = rawId;

  const numericId = Number(rawId);
  const suffix = rawId.slice(-4);
  const apkUser = {
    id: Number.isSafeInteger(numericId) ? numericId : rawId,
    first_name: `Игрок ${suffix}`,
    last_name: '',
    username: '',
    language_code: 'ru',
  };

  const telegram = window.Telegram = window.Telegram || {};
  const webApp = telegram.WebApp = telegram.WebApp || {};

  try {
    const unsafe = webApp.initDataUnsafe && typeof webApp.initDataUnsafe === 'object'
      ? webApp.initDataUnsafe
      : {};
    unsafe.user = apkUser;
    webApp.initDataUnsafe = unsafe;
  } catch {
    try {
      Object.defineProperty(webApp, 'initDataUnsafe', {
        value: { user: apkUser },
        configurable: true,
        writable: true,
      });
    } catch {}
  }

  // ID-only APK login is intentionally never treated as Telegram-verified auth.
  // This keeps admin actions unavailable even if someone enters the admin ID.
  try { webApp.initData = ''; } catch {}

  if (typeof webApp.ready !== 'function') webApp.ready = () => {};
  if (typeof webApp.expand !== 'function') webApp.expand = () => {};
  if (typeof webApp.enableClosingConfirmation !== 'function') webApp.enableClosingConfirmation = () => {};

  function removeAdminEntry() {
    const admin = document.getElementById('admin-btn');
    if (admin) admin.remove();
  }

  const observer = new MutationObserver(removeAdminEntry);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  removeAdminEntry();

  window.addEventListener('beforeunload', () => observer.disconnect(), { once: true });
})();
