(() => {
  const originalInit = window.initializeApp;
  if (typeof originalInit !== 'function') return;

  let initPromise = null;
  function guardedInit() {
    if (!initPromise) initPromise = Promise.resolve().then(() => originalInit());
    return initPromise;
  }

  // Keep every later caller on the same initialization promise. This prevents
  // Telegram/iOS lifecycle quirks from starting a second access check in-page.
  window.initializeApp = guardedInit;

  // app.js historically waits for DOMContentLoaded when it happens to execute
  // while the document is still "loading". Telegram/iOS WebViews may delay that
  // event behind unrelated external resources. Start our application as soon as
  // app.js itself is ready and remove the legacy listener to prevent a double run.
  if (document.readyState === 'loading') {
    document.removeEventListener('DOMContentLoaded', originalInit);
    guardedInit().catch((error) => {
      console.error('Early app initialization failed:', error);
    });
  }
})();
