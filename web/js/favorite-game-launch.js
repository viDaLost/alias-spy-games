(() => {
  let pending = false;

  function prepare() {
    if (pending) return;
    const search = new URLSearchParams(location.search);
    const hash = new URLSearchParams(location.hash.slice(1));
    const start = search.get('tgWebAppStartParam') || hash.get('tgWebAppStartParam')
      || window.Telegram?.WebApp?.initDataUnsafe?.start_param || search.get('startapp') || '';
    const game = /^game_([a-z0-9-]{1,32})$/.exec(start)?.[1];
    const edit = start === 'favorites';
    if (!game && !edit) return;

    const menu = document.getElementById('menu-container');
    if (!menu) return;
    pending = true;
    const observer = new MutationObserver(open);
    observer.observe(menu, { childList: true, subtree: true });
    observer.observe(document.body, { childList: true });
    window.addEventListener('app:menu-ready', open);
    window.addEventListener('app-access:allowed', open);
    const deadline = setTimeout(stop, 15000);
    open();

    function stop() {
      clearTimeout(deadline);
      observer.disconnect();
      window.removeEventListener('app:menu-ready', open);
      window.removeEventListener('app-access:allowed', open);
    }

    function open() {
      const access = window.AppAccess?.state();
      if (!access?.allowed || !access.isRoot || menu.classList.contains('hidden')
        || !document.documentElement.classList.contains('app-ui-ready')) return;
      if (edit) {
        if (!window.PlayerSocial?.open) return;
        stop();
        void window.PlayerSocial.open('favorites');
        return;
      }
      const card = menu.querySelector(`button.game-card[data-card-game="${game}"], button.game-card[data-game-key="${game}"]`)
        || (game === 'biblical-match-three' ? menu.querySelector('#biblical-match-three-card') : null);
      if (!card || card.disabled) return;
      stop();
      card.click();
    }
  }

  prepare();
  window.addEventListener('telegram:sdk-ready', prepare, { once: true });
})();
