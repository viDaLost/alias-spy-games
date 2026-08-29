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

(() => {
  'use strict';
  const VERSION = '1';
  const STYLE_HREF = `web/styles/game-entry-loader.css?v=${VERSION}`;
  const SCRIPT_SRC = `web/js/game-entry-loader.js?v=${VERSION}`;

  if (!document.querySelector('link[data-game-entry-loader-style]')) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = STYLE_HREF;
    link.dataset.gameEntryLoaderStyle = VERSION;
    document.head.appendChild(link);
  }

  if (!document.querySelector('script[data-game-entry-loader-runtime]')) {
    const script = document.createElement('script');
    script.src = SCRIPT_SRC;
    script.defer = true;
    script.dataset.gameEntryLoaderRuntime = VERSION;
    document.body.appendChild(script);
  }
})();
