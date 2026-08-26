(() => {
  'use strict';

  if (window.__CANONICAL_VISUAL_BRIDGE__) return;
  window.__CANONICAL_VISUAL_BRIDGE__ = true;

  const SOURCE_COMMIT = '58cfe7515fd1d50163eda13d10a14958a9475357';
  const HOME_REFERENCE = '195f150b8823c173c0532828be55068977ab3a29';
  const ALIAS_REFERENCE = '7e36d9ae13d824b6c68fbe2e48fe1a20a097452f';
  const SPY_REFERENCE = 'ddd4d3a4d228358cd7f5895db21ba5322ea92b79';
  const EVENT_ASSET = '/web/review/assets';

  const GAME_META = Object.freeze({
    alias: { eyebrow: 'ПЛОЩАДЬ РАССКАЗЧИКОВ', title: 'Алиас', badge: 'ЖИВАЯ СЦЕНА', source: 'alias-parallax-review-v1' },
    spy: { eyebrow: 'НОЧНОЙ ГОРОД', title: 'Шпион', badge: 'SPY · PARALLAX', source: 'spy-parallax-review-v1' },
    coimaginarium: { eyebrow: 'ОБСЕРВАТОРИЯ ИДЕЙ', title: 'Соображариум', badge: 'ЖИВАЯ СЦЕНА', source: 'unified-scene-v1' },
    guess: { eyebrow: 'ГАЛЕРЕЯ ЛИЦ', title: 'Угадай персонажа', badge: 'ЖИВАЯ СЦЕНА', source: 'unified-scene-v1' },
    describe: { eyebrow: 'КРУГ РАССКАЗЧИКОВ', title: 'Опиши, но не называй', badge: 'ЖИВАЯ СЦЕНА', source: 'unified-scene-v1' },
    quartet: { eyebrow: 'ЦАРСКИЙ АРХИВ', title: 'Квартет', badge: 'КАРТОЧНЫЙ СТОЛ', source: 'quartet-card-redesign' },
    'bible-sketch': { eyebrow: 'МАСТЕРСКАЯ ЛЕТОПИСЦА', title: 'Библейский художник', badge: 'НОВЫЙ ВИЗУАЛ', source: 'unified-scene-v1' },
    'bible-wow': { eyebrow: 'ХРАМ ПИСЬМЕННОСТИ', title: 'Библейские слова', badge: 'ЖИВАЯ СЦЕНА', source: 'bible-words-parallax-review-v1' },
    'bible-wordsearch': { eyebrow: 'АРХЕОЛОГИЧЕСКИЙ СТОЛ', title: 'Поиск слов', badge: 'НОВЫЙ ВИЗУАЛ', source: 'unified-scene-v1' },
    'sacred-word': { eyebrow: 'ЗАПЕЧАТАННЫЙ СВИТОК', title: 'Священное слово', badge: 'ЖИВАЯ СЦЕНА', source: 'unified-scene-v1' },
    'kids-ark-pairs': { eyebrow: 'ПАЛУБА НОЕВА КОВЧЕГА', title: 'Найди пару', badge: 'НОВЫЙ ВИЗУАЛ', source: 'unified-scene-v1' },
    'biblical-match-three': { eyebrow: 'ПУТЬ СВЕТА', title: 'Библейские сокровища', badge: '30 УРОВНЕЙ', source: 'path-of-light-review-v1' },
  });

  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  let syncFrame = 0;
  let randomTimer = 0;
  let previousAliasScreen = '';
  let previousSpyScreen = '';

  function haptic(style = 'light') {
    try { window.Telegram?.WebApp?.HapticFeedback?.impactOccurred?.(style); } catch {}
  }

  function appendEventImage(scene, id, className, source) {
    let image = document.getElementById(id);
    if (image) return image;
    image = document.createElement('img');
    image.id = id;
    image.className = `cv-canonical-event ${className}`;
    image.dataset.src = source;
    image.alt = '';
    image.decoding = 'async';
    image.loading = 'lazy';
    scene.querySelector('.ur-scene__atmosphere')?.insertAdjacentElement('beforebegin', image);
    return image;
  }

  function ensureCanonicalSceneDecorations() {
    const scene = document.getElementById('unified-review-scene');
    if (!scene) return;

    if (!scene.querySelector('.cv-menu-lights')) {
      const lights = document.createElement('div');
      lights.className = 'cv-menu-lights';
      lights.innerHTML = [[18, 63], [29, 69], [38, 60], [48, 72], [57, 64], [66, 76], [74, 68], [82, 59]]
        .map(([x, y]) => `<i style="left:${x}%;top:${y}%"></i>`).join('');
      scene.querySelector('.ur-scene__atmosphere')?.insertAdjacentElement('beforebegin', lights);
    }

    appendEventImage(scene, 'cv-alias-lantern', 'cv-alias-event cv-alias-lantern', `${EVENT_ASSET}/alias/10-lantern-glow.webp`);
    appendEventImage(scene, 'cv-alias-dust', 'cv-alias-event cv-alias-dust', `${EVENT_ASSET}/alias/11-skip-dust.webp`);
    appendEventImage(scene, 'cv-alias-finish', 'cv-alias-event cv-alias-finish', `${EVENT_ASSET}/alias/12-round-finish.webp`);
    appendEventImage(scene, 'cv-spy-birds', 'cv-spy-event cv-spy-birds', `${EVENT_ASSET}/spy/13-birds.webp`);
    appendEventImage(scene, 'cv-spy-patrol', 'cv-spy-event cv-spy-patrol', `${EVENT_ASSET}/spy/17-patrol.webp`);

    if (!scene.querySelector('.cv-spy-lantern-effects')) {
      const effects = document.createElement('div');
      effects.className = 'cv-spy-lantern-effects';
      effects.innerHTML = `
        <img class="cv-spy-lantern-glow cv-spy-lantern-glow--left" data-src="${EVENT_ASSET}/spy/15-lantern-glow.webp" alt="" decoding="async" loading="lazy">
        <img class="cv-spy-lantern-glow cv-spy-lantern-glow--right" data-src="${EVENT_ASSET}/spy/15-lantern-glow.webp" alt="" decoding="async" loading="lazy">
        <img class="cv-spy-lantern-flame cv-spy-lantern-flame--left" data-src="${EVENT_ASSET}/spy/14-torch-flame.webp" alt="" decoding="async" loading="lazy">
        <img class="cv-spy-lantern-flame cv-spy-lantern-flame--right" data-src="${EVENT_ASSET}/spy/14-torch-flame.webp" alt="" decoding="async" loading="lazy">`;
      scene.querySelector('.ur-scene__atmosphere')?.insertAdjacentElement('beforebegin', effects);
    }
  }

  async function ensureEventAsset(element) {
    if (!element) return;
    if (!element.getAttribute('src') && element.dataset.src) element.src = element.dataset.src;
    try { await element.decode?.(); } catch {}
  }

  async function replayEvent(element, className) {
    if (!element || reducedMotion) return;
    await ensureEventAsset(element);
    element.classList.remove(className);
    void element.offsetWidth;
    element.classList.add(className);
    element.addEventListener('animationend', () => element.classList.remove(className), { once: true });
  }

  function playAliasEvent(kind) {
    const config = {
      lantern: ['cv-alias-lantern', 'is-pulsing'],
      skip: ['cv-alias-dust', 'is-playing'],
      finish: ['cv-alias-finish', 'is-playing'],
    }[kind];
    if (!config) return;
    replayEvent(document.getElementById(config[0]), config[1]);
  }

  async function pulseSpyLanterns() {
    if (reducedMotion) return;
    const effects = document.querySelector('.cv-spy-lantern-effects');
    if (!effects) return;
    await Promise.all([...effects.querySelectorAll('img')].map(ensureEventAsset));
    effects.classList.remove('is-pulsing');
    void effects.offsetWidth;
    effects.classList.add('is-pulsing');
    effects.addEventListener('animationend', () => effects.classList.remove('is-pulsing'), { once: true });
  }

  function playSpyPatrol() {
    replayEvent(document.getElementById('cv-spy-patrol'), 'is-playing');
    replayEvent(document.getElementById('cv-spy-birds'), 'is-playing');
  }

  function openProductionGame(key) {
    if (!GAME_META[key]) return;
    if (key === 'biblical-match-three' && typeof window.openBiblicalMatchThree === 'function') {
      window.openBiblicalMatchThree();
      return;
    }
    if (typeof window.showGame === 'function') {
      window.showGame(key);
      return;
    }
    const productionCard = [...document.querySelectorAll('#menu-container .game-card')].find((card) => (
      card.dataset.gameKey === key
      || card.getAttribute('onclick')?.includes(`'${key}'`)
      || card.querySelector('.game-card__title')?.textContent?.trim() === GAME_META[key].title
    ));
    productionCard?.click();
  }

  function decorateHome() {
    const home = document.getElementById('ur-home');
    if (!home) return;
    home.dataset.visualSource = 'home-menu-v22';
    home.dataset.visualCommit = HOME_REFERENCE;

    const codeIcon = home.querySelector('[data-ur-action="code"] .ur-app-icon');
    const qrIcon = home.querySelector('[data-ur-action="qr"] .ur-app-icon');
    const gamesIcon = home.querySelector('[data-ur-nav="games"] .ur-app-icon');
    const profileIcon = home.querySelector('[data-ur-nav="profile"] .ur-app-icon');
    codeIcon?.classList.add('cv-icon-code');
    qrIcon?.classList.add('cv-icon-qr');
    gamesIcon?.classList.add('cv-icon-games');
    profileIcon?.classList.add('cv-icon-profile');

    home.querySelectorAll('#ur-games .ur-game-card').forEach((card) => {
      card.dataset.visualSource = 'home-menu-v22-card';
      const favourite = card.querySelector('.ur-game-fav');
      if (favourite) favourite.setAttribute('aria-hidden', 'true');
    });

    if (!home.querySelector('#cv-roulette')) {
      const gamesSection = home.querySelector('#ur-games-section');
      const roulette = document.createElement('button');
      roulette.type = 'button';
      roulette.id = 'cv-roulette';
      roulette.className = 'cv-roulette';
      roulette.innerHTML = '<span><strong>Не можете выбрать?</strong><small>Подберём случайную игру из текущего списка</small></span><i aria-hidden="true">↻</i>';
      gamesSection?.insertAdjacentElement('afterend', roulette);
    }

    decorateHomeModal(home);
  }

  function decorateHomeModal(home) {
    const modal = home.querySelector('#ur-modal');
    if (!modal) return;
    modal.classList.add('cv-modal');
    const icon = modal.querySelector('.ur-app-icon');
    if (!icon) return;
    const title = modal.querySelector('h3')?.textContent || '';
    icon.classList.toggle('cv-icon-code', /код/i.test(title) && !/QR/i.test(title));
    icon.classList.toggle('cv-icon-qr', /QR/i.test(title));
  }

  function chooseRandomGame() {
    const home = document.getElementById('ur-home');
    if (!home || home.hidden) return;
    const cards = [...home.querySelectorAll('#ur-games .ur-game-card:not(.is-filtered)')];
    if (!cards.length) return;
    window.clearTimeout(randomTimer);
    cards.forEach((card) => card.classList.remove('is-random-choice'));
    const chosen = cards[Math.floor(Math.random() * cards.length)];
    chosen.classList.add('is-random-choice');
    chosen.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'center' });
    haptic('medium');
    randomTimer = window.setTimeout(() => {
      chosen.classList.remove('is-random-choice');
      openProductionGame(chosen.dataset.urGame || '');
    }, reducedMotion ? 0 : 620);
  }

  function ensureCanonicalTopbar(container, key) {
    const meta = GAME_META[key];
    if (!meta) return;
    const topbar = container.querySelector(':scope > .ur-game-chrome');
    if (!topbar) return;
    topbar.classList.add('cv-game-topbar', `cv-game-topbar--${key}`);
    topbar.dataset.visualSource = meta.source;
    const eyebrow = topbar.querySelector('small');
    const title = topbar.querySelector('strong');
    const badge = topbar.querySelector(':scope > i');
    const back = topbar.querySelector(':scope > button');
    if (eyebrow && eyebrow.textContent !== meta.eyebrow) eyebrow.textContent = meta.eyebrow;
    if (title && title.textContent !== meta.title) title.textContent = meta.title;
    if (badge && badge.textContent !== meta.badge) badge.textContent = meta.badge;
    if (back) {
      back.textContent = '‹';
      back.setAttribute('aria-label', 'В главное меню');
    }
  }

  function aliasScreen(container) {
    if (container.querySelector('#alias-word')) return 'round';
    if (container.querySelector('.results-table, .next-block')) return 'results';
    if (container.querySelector('.setup-grid #timerValue')) return 'setup';
    if (container.querySelector('.alias-buttons')) return 'difficulty';
    return 'message';
  }

  function decorateAlias(container) {
    const screen = aliasScreen(container);
    if (previousAliasScreen && previousAliasScreen !== screen && screen === 'results') playAliasEvent('finish');
    previousAliasScreen = screen;
    container.dataset.canonicalScreen = screen;
    container.dataset.visualSource = 'alias-parallax-review-v1';

    const timer = container.querySelector('#alias-timer');
    if (timer) {
      const seconds = Number.parseInt(timer.textContent || '', 10);
      timer.classList.toggle('is-urgent', Number.isFinite(seconds) && seconds <= 10);
      timer.setAttribute('aria-label', Number.isFinite(seconds) ? `${seconds} секунд` : timer.textContent || 'Таймер');
    }

    container.querySelectorAll('.alias-buttons .btn').forEach((button, index) => {
      button.classList.add('cv-alias-choice');
      button.dataset.difficulty = ['easy', 'medium', 'hard'][index] || '';
    });
    container.querySelectorAll('.actions .btn-good,.actions .btn-bad,.actions .btn-skip').forEach((button) => {
      button.classList.add('cv-alias-answer');
    });
  }

  function spyScreen(container) {
    if (container.querySelector('#playerCount')) return 'setup';
    if (container.querySelector('#spy-role-card')) return 'role';
    if (container.querySelector('#voteSelect')) return 'vote';
    if (container.querySelector('#locationInput')) return 'location';
    if (/Раунд общения/i.test(container.textContent || '')) return 'discussion';
    if (/Конец игры/i.test(container.textContent || '')) return 'results';
    return 'message';
  }

  function ensureSpyHero(container, screen) {
    let hero = container.querySelector(':scope > .cv-spy-hero');
    if (screen !== 'setup') {
      hero?.remove();
      return;
    }
    if (hero) return;
    hero = document.createElement('section');
    hero.className = 'cv-spy-hero';
    hero.dataset.visualSource = 'spy-parallax-review-v1';
    hero.innerHTML = `
      <span>НОЧНОЙ ГОРОД</span>
      <h1>Шпион</h1>
      <p>Проведите пальцем влево или вправо, чтобы выглянуть из укрытия. Прокрутка мягко раскрывает глубину города.</p>
      <div class="cv-scroll-cue" aria-hidden="true"><i></i></div>`;
    const topbar = container.querySelector(':scope > .ur-game-chrome');
    if (topbar) topbar.insertAdjacentElement('afterend', hero);
    else container.prepend(hero);
  }

  function decorateSpy(container) {
    const screen = spyScreen(container);
    if (previousSpyScreen && previousSpyScreen !== screen && screen === 'discussion') playSpyPatrol();
    previousSpyScreen = screen;
    container.dataset.canonicalScreen = screen;
    container.dataset.visualSource = 'spy-parallax-review-v1';
    ensureSpyHero(container, screen);
  }

  function decorateBibleWords(container) {
    container.dataset.canonicalScreen = container.querySelector('.wow-wrap') ? 'board' : 'loading';
    container.dataset.visualSource = 'bible-words-parallax-review-v1';
    container.querySelector('.wow-wrap')?.setAttribute('data-visual-source', 'temple-of-writing-v3');
  }

  function decoratePathOfLight(container) {
    container.dataset.visualSource = 'path-of-light-review-v1';
    container.dataset.canonicalScreen = container.querySelector('.bmt-board') ? 'board' : 'campaign';
  }

  function decorateGame() {
    const key = document.body.dataset.currentGame || '';
    const container = document.getElementById('game-container');
    if (!key || !container || !GAME_META[key]) return;
    ensureCanonicalTopbar(container, key);
    if (key === 'alias') decorateAlias(container);
    else if (key === 'spy') decorateSpy(container);
    else if (key === 'bible-wow') decorateBibleWords(container);
    else if (key === 'biblical-match-three') decoratePathOfLight(container);
    else {
      container.dataset.visualSource = GAME_META[key].source;
      container.dataset.canonicalScreen = 'production-mechanics';
    }
  }

  function sync() {
    syncFrame = 0;
    ensureCanonicalSceneDecorations();
    const currentGame = document.body.dataset.currentGame || '';
    if (currentGame !== 'alias') previousAliasScreen = '';
    if (currentGame !== 'spy') previousSpyScreen = '';
    decorateHome();
    decorateGame();
    document.documentElement.dataset.canonicalVisuals = 'ready';
  }

  function scheduleSync() {
    if (syncFrame) return;
    syncFrame = requestAnimationFrame(sync);
  }

  document.addEventListener('click', (event) => {
    if (event.target.closest('#cv-roulette')) {
      chooseRandomGame();
      return;
    }
    if (event.target.closest('body[data-current-game="alias"] .btn-good, body[data-current-game="alias"] .alias-buttons .btn')) playAliasEvent('lantern');
    else if (event.target.closest('body[data-current-game="alias"] .btn-skip')) playAliasEvent('skip');
    if (event.target.closest('body[data-current-game="spy"] #spy-role-card, body[data-current-game="spy"] #spy-reveal-btn')) pulseSpyLanterns();
  }, true);

  new MutationObserver(scheduleSync).observe(document.body, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['data-mode', 'data-current-game', 'hidden', 'class'],
  });
  window.addEventListener('app:menu-ready', scheduleSync);
  window.addEventListener('pageshow', scheduleSync);
  window.addEventListener('roominvitechange', scheduleSync);

  window.CanonicalVisualBridge = Object.freeze({
    version: 'canonical-preview-adapters-v1',
    mechanicsSource: `production-main@${SOURCE_COMMIT}`,
    visualSources: Object.freeze({
      home: `home-menu-v22@${HOME_REFERENCE}`,
      alias: `alias-parallax-review-v1@${ALIAS_REFERENCE}`,
      spy: `spy-parallax-review-v1@${SPY_REFERENCE}`,
      'bible-wow': 'bible-words-parallax-review-v1',
      'biblical-match-three': 'path-of-light-review-v1',
      quartet: 'quartet-card-redesign',
    }),
  });

  scheduleSync();
})();
