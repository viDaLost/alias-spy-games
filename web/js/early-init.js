(() => {
  const init = window.initializeApp;
  if (typeof init !== 'function') return;

  // app.js historically waits for DOMContentLoaded when it happens to execute
  // while the document is still "loading". Telegram/iOS WebViews may delay that
  // event behind unrelated external resources. Start our application as soon as
  // app.js itself is ready and remove the legacy listener to prevent a double run.
  if (document.readyState === 'loading') {
    document.removeEventListener('DOMContentLoaded', init);
    Promise.resolve(init()).catch((error) => {
      console.error('Early app initialization failed:', error);
    });
  }
})();
