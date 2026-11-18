(() => {
  'use strict';
  const menu = document.getElementById('menu-container');
  const game = document.getElementById('game-container');
  const resume = document.getElementById('reopening-resume');
  const roomLink = document.getElementById('reopening-room');
  const campaignLink = document.getElementById('reopening-campaign');
  const resources = new Map();
  let activeRoute = '';
  let transition = 0;

  function load(path, stylesheet = false) {
    if (resources.has(path)) return resources.get(path);
    const promise = new Promise((resolve, reject) => {
      const node = document.createElement(stylesheet ? 'link' : 'script');
      if (stylesheet) {
        node.rel = 'stylesheet';
        node.href = path;
      } else {
        node.src = path;
      }
      node.addEventListener('load', resolve, { once: true });
      node.addEventListener('error', () => {
        node.remove();
        resources.delete(path);
        reject(new Error(`Не удалось загрузить ${path}`));
      }, { once: true });
      document.head.append(node);
    });
    resources.set(path, promise);
    return promise;
  }

  function savedValue(key) {
    try { return localStorage.getItem(key) || ''; } catch { return ''; }
  }

  function updateResumeLink(link, href, detail = '') {
    link.hidden = !href;
    if (href) {
      link.href = href;
      link.querySelector('small').textContent = detail;
    }
    resume.hidden = roomLink.hidden && campaignLink.hidden;
  }

  function updateCampaignLink() {
    const { campaignLevel, levelRatings } = window.BiblicalMatchThreeProgress.load();
    if (campaignLevel) {
      updateResumeLink(campaignLink, `?game=treasures&level=${campaignLevel}`, `Уровень ${campaignLevel}`);
    } else {
      const hasWins = Object.values(levelRatings).some((rating) => rating > 0);
      updateResumeLink(campaignLink, hasWins ? '?game=treasures' : '', 'Путь света');
    }
  }

  function refreshResume() {
    const roomCode = savedValue('quartet_v2_room_id');
    const hasRoom = /^[A-Z0-9]{6}$/.test(roomCode);
    updateResumeLink(roomLink, hasRoom ? `?room=${roomCode}` : '', `Комната ${roomCode}`);
    if (window.BiblicalMatchThreeProgress) updateCampaignLink();
    else if (savedValue('biblical_match_three_progress_v2_anon') || savedValue('biblical_match_three_progress_v1')) {
      load('web/games/biblical-match-three-progress.js?v=50').then(updateCampaignLink, () => {});
    }
  }

  function mainMenu() {
    const url = new URL(location.href);
    url.searchParams.delete('game');
    url.searchParams.delete('level');
    url.searchParams.delete('room');
    if (url.href !== location.href) history.replaceState(null, '', url);
    renderLocation();
  }
  window.appGoToMainMenu = mainMenu;

  async function renderLocation({ retry = false } = {}) {
    const url = new URL(location.href);
    const requested = url.searchParams.get('game');
    const invite = url.searchParams.get('room');
    const route = invite || requested === 'quartet' ? 'quartet' : requested === 'treasures' ? 'treasures' : '';
    const levelId = Number(url.searchParams.get('level')) || undefined;
    const key = [route, levelId, invite].join('|');
    if (key === activeRoute && !retry) return;
    activeRoute = key;
    const current = ++transition;
    window.__cancelBiblicalMatchThreeLaunch?.();
    window.__biblicalMatchThreeCleanup?.();
    window.__quartetCleanup?.();
    game.replaceChildren();
    menu.hidden = Boolean(route);
    menu.classList.toggle('hidden', Boolean(route));
    game.hidden = !route;
    document.body.dataset.mode = route ? 'game' : 'menu';
    if (route) document.body.dataset.currentGame = route === 'treasures' ? 'biblical-match-three' : route;
    else delete document.body.dataset.currentGame;
    window.scrollTo(0, 0);
    if (!route) {
      refreshResume();
      return;
    }
    game.innerHTML = '<section class="reopening-loading" role="status"><span class="reopening-spinner"></span><p>Открываем игру…</p><button type="button" data-back>В меню</button></section>';
    try {
      if (route === 'treasures') {
        await Promise.all([
          load('web/js/biblical-match-three-launcher.js?v=50'),
          load('web/styles/biblical-match-three-v38.css', true),
        ]);
        if (transition === current) await window.openBiblicalMatchThree({ levelId, retry });
      } else {
        await Promise.all([
          load('web/games/quartet.js?v=3'),
          load('web/games/quartet-table.js?v=2'),
          load('quartet-polling.js?v=2'),
          load('web/games/quartet-v2.css?v=4', true),
          load('web/games/quartet-table.css?v=2', true),
        ]);
        if (transition === current) window.startQuartetGame('web/data/quartet_bible.json', { preview: true });
      }
    } catch (error) {
      if (transition !== current) return;
      console.error(error);
      game.innerHTML = '<section class="reopening-loading" role="alert"><p>Не удалось открыть игру.</p><button type="button" data-retry>Повторить</button><button type="button" data-back>В меню</button></section>';
    }
  }

  menu.addEventListener('click', (event) => {
    const link = event.target.closest('a[data-game]');
    if (!link || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    history.pushState(null, '', link.href);
    renderLocation();
  });
  game.addEventListener('click', (event) => {
    if (event.target.closest('[data-back]')) mainMenu();
    if (event.target.closest('[data-retry]')) renderLocation({ retry: true });
  });
  window.addEventListener('popstate', () => renderLocation());
  window.addEventListener('storage', () => { if (!menu.hidden) refreshResume(); });
  renderLocation();
})();
