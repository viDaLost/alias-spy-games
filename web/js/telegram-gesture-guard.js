(() => {
  let touchStartX = 0;
  let touchStartY = 0;

  function telegramWebApp() {
    return window.Telegram?.WebApp || null;
  }

  function disableTelegramVerticalSwipes() {
    const tg = telegramWebApp();
    if (!tg) return;
    try { tg.expand?.(); } catch {}
    try { tg.disableVerticalSwipes?.(); } catch {}
  }

  function isQuartetOpen() {
    return document.body?.dataset?.currentGame === 'quartet';
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
    if (isQuartetOpen()) disableTelegramVerticalSwipes();
  }

  function onTouchMove(event) {
    if (!isQuartetOpen() || pageScrollTop() > 1) return;
    const touch = event.touches?.[0];
    if (!touch) return;

    const dx = touch.clientX - touchStartX;
    const dy = touch.clientY - touchStartY;
    if (dy > 8 && Math.abs(dy) > Math.abs(dx) * 1.15) {
      event.preventDefault();
    }
  }

  function syncGuard() {
    if (isQuartetOpen()) disableTelegramVerticalSwipes();
  }

  document.addEventListener('touchstart', onTouchStart, { passive: true });
  document.addEventListener('touchmove', onTouchMove, { passive: false });

  const observer = new MutationObserver(syncGuard);
  observer.observe(document.documentElement, {
    subtree: true,
    attributes: true,
    attributeFilter: ['data-current-game', 'data-mode', 'class'],
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', disableTelegramVerticalSwipes, { once: true });
  } else {
    disableTelegramVerticalSwipes();
  }

  window.addEventListener('pagehide', () => observer.disconnect(), { once: true });
})();
