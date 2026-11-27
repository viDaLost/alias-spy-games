(() => {
  'use strict';

  let activeFrame;
  window.getBibleWorldHost = (source) => {
    if (!activeFrame?.isConnected || activeFrame.contentWindow !== source || !window.canPlayBibleWorld?.()) return null;
    return {
      request: window.AppAccess.bibleWorldRequest,
      exit: () => window.goToMainMenu(),
      report: (state) => {
        if (activeFrame?.isConnected && activeFrame.contentWindow === source) window.AppPresenceContext?.setGameState?.('bible-world',state);
      },
    };
  };

  window.startBibleWorldGame = () => {
    if (!window.canPlayBibleWorld?.()) return;
    const container = document.getElementById('game-container');
    const wrap = document.createElement('div');
    wrap.className = 'game-frame-wrap';
    const frame = document.createElement('iframe');
    frame.className = 'game-frame';
    frame.title = 'Where Am I in the Bible?';

    const address = 'web/assets/bible-world-v2/play.html?v=12';
    const url = new URL(window.__gameFrameInsets?.seedUrl(address) || address, location.href);
    const insets = window.__gameFrameInsets?.measure();
    if (insets) url.searchParams.set('chromeTop', String(insets.top));
    url.searchParams.set('theme', window.AppTheme?.isDark() ? 'dark' : 'light');
    activeFrame = frame;
    frame.src = url.href;
    wrap.append(frame);
    container.replaceChildren(wrap);
  };
})();
