(() => {
  'use strict';

  let activeFrame;
  window.getBibleWorldHost = (source) => {
    if (!activeFrame?.isConnected || activeFrame.contentWindow !== source || !window.canPlayBibleWorld?.()) return null;
    return {
      request: window.AppAccess.bibleWorldRequest,
      exit: () => window.goToMainMenu(),
    };
  };

  window.startBibleWorldGame = () => {
    if (!window.canPlayBibleWorld?.()) return;
    const container = document.getElementById('game-container');
    const wrap = document.createElement('div');
    wrap.className = 'game-frame-wrap';
    const frame = document.createElement('iframe');
    frame.className = 'game-frame';
    frame.title = 'Где я в Библии?';

    const address = 'web/assets/bible-world-v2/play.html';
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
