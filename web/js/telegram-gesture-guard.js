(() => {
  // Keeps Telegram's pull-down-to-close gesture from stealing swipes that belong to
  // a game board.
  //
  // Two things went wrong for Biblical Treasures:
  //
  // 1. The guard only recognised Quartet, so a downward swipe on a match-three tile
  //    was never protected and Telegram collapsed the Mini App instead.
  // 2. disableVerticalSwipes() ran once on DOMContentLoaded, but the Telegram SDK is
  //    loaded with `async`. When it arrived after that point -- which is exactly what
  //    a slow connection produces -- window.Telegram did not exist yet and the call
  //    was silently skipped for the whole session.
  //
  // The board already sets touch-action: none, so the browser is not the one scrolling;
  // the close gesture is native to the Telegram client. disableVerticalSwipes is the
  // API for it (Bot API 7.7+), and the touchmove fallback below covers older clients
  // that do not implement it.

  // «Моисей на Ниле» открывается фреймом с адреса воркера, то есть с чужого
  // источника: дотянуться до Telegram SDK изнутри он не может. Отключить жест
  // обязана оболочка — здесь, как только игра стала текущей.
  const GESTURE_GAMES = new Set(['quartet', 'biblical-match-three', 'moses-nile']);
  const SDK_RETRY_LIMIT = 40;
  const SDK_RETRY_MS = 150;

  let touchStartX = 0;
  let touchStartY = 0;
  let sdkRetries = 0;

  function telegramWebApp() {
    return window.Telegram?.WebApp || null;
  }

  function disableTelegramVerticalSwipes() {
    const tg = telegramWebApp();
    if (!tg) return false;
    try { tg.expand?.(); } catch {}
    try { tg.disableVerticalSwipes?.(); } catch {}
    return true;
  }

  /** Calls through as soon as the async-loaded Telegram SDK actually exists. */
  function disableWhenSdkReady() {
    if (disableTelegramVerticalSwipes()) return;
    if (sdkRetries >= SDK_RETRY_LIMIT) return;
    sdkRetries += 1;
    window.setTimeout(disableWhenSdkReady, SDK_RETRY_MS);
  }

  function isGestureGame() {
    return GESTURE_GAMES.has(String(document.body?.dataset?.currentGame || ''));
  }

  function pageScrollTop() {
    return Math.max(
      Number(window.scrollY || 0),
      Number(document.documentElement?.scrollTop || 0),
      Number(document.body?.scrollTop || 0),
    );
  }

  function onTouchStart(event) {
    const touch = event.touches?.[0];
    if (!touch) return;
    touchStartX = touch.clientX;
    touchStartY = touch.clientY;
    if (isGestureGame()) disableTelegramVerticalSwipes();
  }

  function onTouchMove(event) {
    if (!isGestureGame() || pageScrollTop() > 1) return;
    const touch = event.touches?.[0];
    if (!touch) return;

    const dx = touch.clientX - touchStartX;
    const dy = touch.clientY - touchStartY;
    if (dy > 8 && Math.abs(dy) > Math.abs(dx) * 1.15) {
      event.preventDefault();
    }
  }

  function syncGuard() {
    if (isGestureGame()) disableTelegramVerticalSwipes();
  }

  /*
    Игра во фрейме чужого источника не видит ни Telegram SDK, ни касаний
    родителя: touchstart до оболочки не доходит. Поэтому она просит отключить
    жест сообщением, а не рассчитывает, что мы сами заметим её свайп.
  */
  window.addEventListener('message', (event) => {
    if (event?.data?.type !== 'moses-nile:lock-swipes') return;
    disableTelegramVerticalSwipes();
  });

  document.addEventListener('touchstart', onTouchStart, { passive: true });
  document.addEventListener('touchmove', onTouchMove, { passive: false });

  const observer = new MutationObserver(syncGuard);
  observer.observe(document.documentElement, {
    subtree: true,
    attributes: true,
    attributeFilter: ['data-current-game', 'data-mode', 'class'],
  });

  // The SDK tag is async, so it may still be in flight: take whichever comes first.
  document.getElementById('telegram-web-app-sdk')
    ?.addEventListener('load', disableWhenSdkReady, { once: true });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', disableWhenSdkReady, { once: true });
  } else {
    disableWhenSdkReady();
  }

  window.addEventListener('pagehide', () => observer.disconnect(), { once: true });
})();
