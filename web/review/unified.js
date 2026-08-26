(() => {
  'use strict';

  const ASSET = '/web/review/assets';
  const SOURCE_COMMIT = '58cfe7515fd1d50163eda13d10a14958a9475357';
  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const interactiveSelector = 'button,input,select,textarea,canvas,.wow-wheel-wrap,.wow-grid,.bmt-board,.ws-board,.qv2-hand,.qv2-table,.bsk-canvas-wrap,.kids-grid,.spy-card-shell,.word-card,.result-list';
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const escapeHTML = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[char]));

  const layer = (src, xDepth, yDepth, options = {}) => ({
    src, xDepth, yDepth, opacity: 1, filter: 'none', position: 'center', scale: 1.08, ...options,
  });
  const glow = (xDepth, yDepth, variant = 'gold') => ({ type: 'glow', xDepth, yDepth, variant, scale: 1.08 });
  const CATALOG = {
    menu: { motion: 'parallax', layers: [
      layer(`${ASSET}/menu/city.webp`, 2, 22, { className: 'ur-menu-city', scale: 1.04 }),
      layer(`${ASSET}/menu/stars-v19.webp`, 8, 38, { className: 'ur-menu-stars', opacity: .42, scale: 1.035 }),
      layer(`${ASSET}/menu/moon-v19.webp`, -12, -24, { className: 'ur-menu-moon', opacity: .48, scale: .94 }),
      layer(`${ASSET}/menu/clouds-far-v19.webp`, 20, 14, { className: 'ur-menu-cloud ur-menu-cloud--far', opacity: .20, scale: 1.035 }),
      layer(`${ASSET}/menu/clouds-near-v19.webp`, -34, 26, { className: 'ur-menu-cloud ur-menu-cloud--near', opacity: .14, scale: 1.04 }),
      layer(`${ASSET}/menu/foreground.webp`, 28, 58, { className: 'ur-menu-foreground', opacity: .84, scale: 1.04 }),
    ]},
    alias: { motion: 'parallax', layers: [
      layer(`${ASSET}/alias/01-sky-sunset.webp`, 3, 2), layer(`${ASSET}/alias/02-mountains.webp`, 6, 4),
      layer(`${ASSET}/alias/03-city-far.webp`, 10, 7), layer(`${ASSET}/alias/04-market-mid.webp`, 17, 11),
      layer(`${ASSET}/alias/09-dust-haze.webp`, 23, 16, { opacity: .34 }),
      layer(`${ASSET}/alias/05-left-foreground.webp`, 40, 24), layer(`${ASSET}/alias/06-right-foreground.webp`, 42, 24),
      layer(`${ASSET}/alias/08-props.webp`, 47, 27), layer(`${ASSET}/alias/07-hourglass.webp`, 53, 30, { className: 'ur-alias-hourglass' }),
    ]},
    spy: { motion: 'parallax', layers: [
      layer(`${ASSET}/spy/01-sky-moon-stars.webp`, 4, 3), layer(`${ASSET}/spy/02-mountains.webp`, 7, 5),
      layer(`${ASSET}/spy/03-temple-far.webp`, 10, 7), layer(`${ASSET}/spy/04-city-mid.webp`, 16, 10),
      layer(`${ASSET}/spy/05-rooftops.webp`, 24, 14), layer(`${ASSET}/spy/06-fog.webp`, 29, 18, { opacity: .42 }),
      layer(`${ASSET}/spy/16-light-particles.webp`, 32, 18, { className: 'ur-spy-particles', opacity: 0 }),
      layer(`${ASSET}/spy/08-spy.webp`, 55, 32, { opacity: .97 }), layer(`${ASSET}/spy/07-left-foreground.webp`, 42, 24),
      layer(`${ASSET}/spy/10-right-foreground.webp`, 42, 24), layer(`${ASSET}/spy/09-leaves.webp`, 48, 27, { opacity: .55 }),
      layer(`${ASSET}/spy/12-plants-right.webp`, 50, 28, { opacity: .76 }),
    ]},
    'bible-wow': { motion: 'parallax', layers: [
      layer(`${ASSET}/bible-words/01-temple-base.webp`, 4, 3, { filter: 'brightness(.82) saturate(.9)' }),
      layer(`${ASSET}/bible-words/02-distant-sanctuary.webp`, 9, 6, { opacity: .82 }),
      layer(`${ASSET}/bible-words/06-moonbeams.webp`, 16, 10, { opacity: .22 }),
      layer(`${ASSET}/bible-words/03-left-arch.webp`, 34, 22, { opacity: .78 }),
      layer(`${ASSET}/bible-words/04-right-arch.webp`, 38, 24, { opacity: .78 }),
      layer(`${ASSET}/bible-words/05-scriptorium-ledge.webp`, 47, 29, { opacity: .7 }),
      layer(`${ASSET}/bible-words/07-dust-motes.webp`, 25, 16, { opacity: .16 }),
    ]},
    'biblical-match-three': { motion: 'parallax', layers: [
      layer(`${ASSET}/path/temple-base-v3.webp`, 5, 4, { filter: 'brightness(.78) saturate(.9)' }),
      layer(`${ASSET}/path/temple-light-v3.webp`, 20, 14, { opacity: .18 }),
      layer(`${ASSET}/path/temple-foreground-v3.webp`, 48, 30, { opacity: .68, filter: 'brightness(.72) saturate(.82)' }),
      glow(30, 20, 'path'),
    ]},
    coimaginarium: { motion: 'parallax', layers: [layer(`${ASSET}/scenes/coimaginarium.webp`, 6, 5, { filter: 'brightness(.82)' }), glow(24, 15, 'violet'), glow(45, 26, 'gold')] },
    guess: { motion: 'parallax', layers: [layer(`${ASSET}/scenes/guess.webp`, 6, 5, { filter: 'brightness(.8)' }), glow(25, 16, 'moon'), glow(44, 26, 'gold')] },
    describe: { motion: 'parallax', layers: [layer(`${ASSET}/scenes/describe.webp`, 6, 5, { filter: 'brightness(.82)' }), glow(25, 16, 'ember'), glow(46, 27, 'moon')] },
    'sacred-word': { motion: 'parallax', layers: [layer(`${ASSET}/scenes/sacred-word.webp`, 6, 5, { filter: 'brightness(.8)' }), glow(24, 15, 'violet'), glow(44, 26, 'gold')] },
    quartet: { motion: 'static', layers: [layer(`${ASSET}/scenes/quartet.webp`, 0, 0, { opacity: .94, filter: 'brightness(.82) saturate(.9)' })] },
    'bible-sketch': { motion: 'static', layers: [layer(`${ASSET}/scenes/bible-sketch.webp`, 0, 0, { opacity: .93, filter: 'brightness(.8) saturate(.86)' })] },
    'bible-wordsearch': { motion: 'static', layers: [layer(`${ASSET}/scenes/wordsearch.webp`, 0, 0, { opacity: .95, filter: 'brightness(.86) saturate(.88)' })] },
    'kids-ark-pairs': { motion: 'static', layers: [layer(`${ASSET}/scenes/pairs.webp`, 0, 0, { opacity: .98, filter: 'brightness(.98) saturate(.92)' })] },
  };

  const GAMES = [
    { key: 'alias', title: 'Алиас', desc: 'Объясняйте слова на скорость', icon: 'web/assets/icons/alias.png', players: '1–5 команд', time: '5–180 сек', tags: ['company', 'short'], badge: 'КОМПАНИЯ' },
    { key: 'coimaginarium', title: 'Соображариум', desc: 'Ассоциации и быстрые идеи', icon: 'web/assets/icons/idea.png', players: '3–12', time: '10 мин', tags: ['company', 'short'], badge: 'ИДЕИ' },
    { key: 'guess', title: 'Угадай персонажа', desc: 'Вопросы, версии и логика', icon: 'web/assets/icons/character.png', players: '3–12', time: '10 мин', tags: ['company'], badge: 'ДЕДУКЦИЯ' },
    { key: 'describe', title: 'Опиши, но не называй', desc: 'Подсказки без прямого ответа', icon: 'web/assets/icons/describe.png', players: '3–12', time: '10 мин', tags: ['company', 'short'], badge: 'РАССКАЗ' },
    { key: 'spy', title: 'Шпион', desc: 'Секретная роль и локация', icon: 'web/assets/icons/spy.png', players: '3–20', time: '8 мин', tags: ['company', 'short'], badge: 'ДИНАМИЧНАЯ' },
    { key: 'quartet', title: 'Квартет', desc: 'Соберите четыре карты', icon: 'web/assets/icons/quartet.png', players: '2–8', time: '15 мин', tags: ['company', 'online'], badge: 'ОНЛАЙН' },
    { key: 'bible-sketch', title: 'Библейский художник', desc: 'Рисуйте и найдите шпиона', icon: 'web/assets/icons/bible-sketch.webp', players: '3–8', time: '12 мин', tags: ['company', 'online'], badge: 'ОНЛАЙН' },
    { key: 'bible-wow', title: 'Библейские слова', desc: 'Собирайте слова из букв', icon: 'web/assets/icons/words.png', players: '1', time: '8 мин', tags: ['solo', 'short'], badge: 'СЛОВА' },
    { key: 'bible-wordsearch', title: 'Поиск библейских слов', desc: 'Найдите слова в сетке', icon: 'web/assets/icons/search.png', players: '1', time: '8 мин', tags: ['solo', 'short'], badge: 'ПОИСК' },
    { key: 'sacred-word', title: 'Священное слово', desc: 'Откройте слово по подсказкам', icon: 'web/assets/icons/sacred.png', players: '1', time: '8 мин', tags: ['solo'], badge: 'ЗАГАДКА' },
    { key: 'kids-ark-pairs', title: 'Найди пару', desc: 'Соберите животных попарно', icon: 'web/assets/icons/ark.png', players: '1–4', time: '6 мин', tags: ['solo', 'short'], badge: 'СЕМЕЙНАЯ' },
    { key: 'biblical-match-three', title: 'Библейские сокровища', desc: '30 уровней Пути света', icon: 'web/assets/icons/biblical-treasures-v38.png', players: '1', time: '10 мин', tags: ['solo', 'short'], badge: '30 УРОВНЕЙ' },
  ];
  const gameByKey = new Map(GAMES.map((game) => [game.key, game]));
  const keyByTitle = new Map(GAMES.map((game) => [game.title, game.key]));

  const scene = document.createElement('div');
  scene.className = 'ur-scene';
  scene.id = 'unified-review-scene';
  scene.setAttribute('aria-hidden', 'true');
  scene.innerHTML = '<div class="ur-scene__atmosphere"></div><div class="ur-scene__event" data-kind="match"></div><div class="ur-scene__event" data-kind="cascade"></div><div class="ur-scene__event" data-kind="levelComplete"></div>';
  document.body.prepend(scene);
  const atmosphere = scene.querySelector('.ur-scene__atmosphere');
  const eventNodes = new Map([...scene.querySelectorAll('.ur-scene__event')].map((node) => [node.dataset.kind, node]));
  let sceneKey = '', sceneMotion = 'static', depthNodes = [], frozen = false;
  let targetX = 0, currentX = 0, targetProgress = 0, currentProgress = 0, raf = 0, eventTimer = 0;
  const drag = { id: null, startX: 0, startY: 0, lastX: 0, axis: null };

  function activeKey() { return document.body.dataset.currentGame || (document.body.dataset.mode === 'game' ? '' : 'menu'); }
  function buildGlow(meta) {
    const node = document.createElement('div');
    node.className = `ur-scene__layer ur-scene__glow ur-scene__glow--${meta.variant}`;
    const backgrounds = {
      gold: 'radial-gradient(circle at 22% 25%,rgba(255,215,123,.22),transparent 31%),radial-gradient(circle at 82% 68%,rgba(255,194,65,.16),transparent 28%)',
      violet: 'radial-gradient(circle at 74% 18%,rgba(126,105,255,.26),transparent 34%),radial-gradient(circle at 24% 72%,rgba(113,86,220,.16),transparent 30%)',
      moon: 'linear-gradient(118deg,transparent 22%,rgba(156,193,255,.15) 46%,transparent 62%)',
      ember: 'radial-gradient(ellipse at 50% 77%,rgba(255,143,42,.3),transparent 35%)',
      path: 'linear-gradient(180deg,rgba(255,248,204,.25),rgba(255,197,64,.05) 45%,rgba(255,183,40,.2))',
    };
    node.style.background = backgrounds[meta.variant] || backgrounds.gold;
    node.style.mixBlendMode = 'screen'; node.style.opacity = '.72';
    node.dataset.xDepth = String(meta.xDepth); node.dataset.yDepth = String(meta.yDepth);
    node.style.setProperty('--layer-scale', String(meta.scale || 1.08));
    return node;
  }
  function applyScene(nextKey) {
    const key = CATALOG[nextKey] ? nextKey : 'menu';
    if (key === sceneKey) return;
    sceneKey = key; const config = CATALOG[key]; sceneMotion = config.motion; frozen = false;
    depthNodes.forEach((node) => node.remove()); depthNodes = [];
    const fragment = document.createDocumentFragment();
    config.layers.forEach((meta, index) => {
      let node;
      if (meta.type === 'glow') node = buildGlow(meta);
      else {
        node = document.createElement('img'); node.className = `ur-scene__layer ${meta.className || ''}`.trim();
        node.alt = ''; node.decoding = 'async'; node.loading = index < 2 ? 'eager' : 'lazy'; node.src = meta.src;
        node.dataset.xDepth = String(meta.xDepth); node.dataset.yDepth = String(meta.yDepth);
        node.style.setProperty('--layer-opacity', String(meta.opacity)); node.style.setProperty('--layer-filter', meta.filter);
        node.style.setProperty('--layer-scale', String(meta.scale)); node.style.objectPosition = meta.position;
      }
      node.style.zIndex = String(index + 1); fragment.append(node); depthNodes.push(node);
    });
    scene.insertBefore(fragment, atmosphere); scene.dataset.scene = key; scene.dataset.motion = sceneMotion;
    scene.classList.remove('is-urgent', 'spy-state'); targetX = currentX = 0; readScroll(false); currentProgress = targetProgress; renderNow();
    document.body.dataset.reviewVisual = key; document.body.dataset.reviewMotion = sceneMotion;
  }
  function transformLayers() {
    depthNodes.forEach((node) => {
      const x = currentX * Number(node.dataset.xDepth || 0); const y = -currentProgress * Number(node.dataset.yDepth || 0);
      node.style.setProperty('--layer-x', `${x.toFixed(2)}px`); node.style.setProperty('--layer-y', `${y.toFixed(2)}px`);
    });
  }
  function renderNow() { if (reducedMotion || sceneMotion !== 'parallax') { currentX = 0; currentProgress = 0; } transformLayers(); }
  function schedule() { if (!raf && sceneMotion === 'parallax' && !frozen && !reducedMotion) { scene.classList.add('is-moving'); raf = requestAnimationFrame(render); } }
  function render() {
    raf = 0; if (frozen || reducedMotion || sceneMotion !== 'parallax') { scene.classList.remove('is-moving'); return; }
    currentX += (targetX - currentX) * .14; currentProgress += (targetProgress - currentProgress) * .12; transformLayers();
    if (Math.abs(targetX - currentX) > .001 || Math.abs(targetProgress - currentProgress) > .0005) schedule(); else scene.classList.remove('is-moving');
  }
  function startDrag(event) {
    if (sceneMotion !== 'parallax' || event.target.closest?.(interactiveSelector)) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    drag.id = event.pointerId; drag.startX = drag.lastX = event.clientX; drag.startY = event.clientY; drag.axis = null;
  }
  function moveDrag(event) {
    if (drag.id !== event.pointerId || frozen) return;
    const totalX = event.clientX - drag.startX; const totalY = event.clientY - drag.startY;
    if (!drag.axis && Math.hypot(totalX, totalY) >= 8) drag.axis = Math.abs(totalX) > Math.abs(totalY) * 1.15 ? 'horizontal' : 'vertical';
    if (drag.axis !== 'horizontal') return;
    event.preventDefault(); const delta = event.clientX - drag.lastX; drag.lastX = event.clientX;
    targetX = clamp(targetX + delta / 155, -1, 1); schedule();
  }
  function endDrag(event) { if (event.pointerId !== drag.id) return; drag.id = null; drag.axis = null; }
  function readScroll(animate = true) {
    if (sceneMotion !== 'parallax') return;
    const max = Math.max(1, document.documentElement.scrollHeight - innerHeight); targetProgress = clamp(scrollY / max, 0, 1);
    if (animate) schedule();
  }
  function freeze() { frozen = true; if (raf) cancelAnimationFrame(raf); raf = 0; scene.classList.remove('is-moving'); }
  function release() { frozen = false; targetX = currentX; targetProgress = currentProgress; }
  addEventListener('scroll', () => readScroll(true), { passive: true }); addEventListener('resize', () => readScroll(true), { passive: true });
  addEventListener('pointerdown', startDrag, { passive: true }); addEventListener('pointermove', moveDrag, { passive: false });
  addEventListener('pointerup', endDrag, { passive: true }); addEventListener('pointercancel', endDrag, { passive: true });
  document.addEventListener('pointerdown', (event) => { if (event.target.closest?.(interactiveSelector)) freeze(); }, true);
  document.addEventListener('pointerup', release, true); document.addEventListener('pointercancel', release, true); addEventListener('blur', release, { passive: true });
  function playSceneEvent(kind) {
    const normalized = kind === 'levelComplete' ? 'levelComplete' : kind === 'cascade' ? 'cascade' : 'match'; const node = eventNodes.get(normalized);
    if (!node || reducedMotion) return; clearTimeout(eventTimer); eventNodes.forEach((item) => item.classList.remove('is-playing'));
    void node.offsetWidth; node.classList.add('is-playing'); scene.dataset.lastEvent = kind;
    eventTimer = setTimeout(() => node.classList.remove('is-playing'), normalized === 'levelComplete' ? 1400 : 850);
  }
  addEventListener('bmt:path-light', (event) => playSceneEvent(event.detail?.kind || 'match'));

  const home = document.createElement('div'); home.id = 'ur-home'; home.className = 'ur-home'; home.hidden = true;
  home.innerHTML = `
    <main class="ur-home__app">
      <section id="ur-games-view">
        <div class="ur-home__topline"><h1>Игры</h1><span>Выберите режим</span></div>
        <div class="ur-entry-actions" aria-label="Подключение">
          <button class="ur-entry-action" data-ur-action="code"><i class="ur-app-icon ur-app-icon--code">⌁</i><span><strong>Код</strong><small>Войти по коду</small></span></button>
          <button class="ur-entry-action" data-ur-action="qr"><i class="ur-app-icon ur-app-icon--qr">▦</i><span><strong>QR-код</strong><small>Сканировать приглашение</small></span></button>
        </div>
        <section class="ur-home__section" id="ur-continue-section"><div class="ur-home__section-head"><h2>Продолжить</h2><small>Недавняя игра</small></div><button class="ur-continue-card" id="ur-continue-card"></button></section>
        <section class="ur-home__section" id="ur-games-section">
          <div class="ur-home__section-head"><h2>Все игры</h2><button class="ur-home__link" id="ur-show-all">Показать все</button></div>
          <div class="ur-filters" id="ur-filters"><button class="ur-filter active" data-filter="all">Все</button><button class="ur-filter" data-filter="company">Компания</button><button class="ur-filter" data-filter="solo">Одиночные</button><button class="ur-filter" data-filter="online">Онлайн</button><button class="ur-filter" data-filter="short">Короткие</button></div>
          <div class="ur-games" id="ur-games"></div>
        </section>
      </section>
      <section id="ur-profile-view" hidden>
        <div class="ur-home__topline"><h1>Профиль</h1><span>Ваши данные</span></div>
        <article class="ur-profile-card"><div class="ur-profile-hero"><div class="ur-profile-avatar">♙</div><div><h2 id="ur-profile-name">Игрок</h2><p id="ur-profile-meta">Профиль игрока</p></div></div><div class="ur-profile-grid" id="ur-profile-grid"></div><div class="ur-profile-recent"><small>НЕДАВНИЕ ИГРЫ</small><div id="ur-profile-recent"></div></div></article>
      </section>
    </main>
    <nav class="ur-bottom-nav" aria-label="Основная навигация"><button class="ur-nav-btn active" data-ur-nav="games"><i class="ur-app-icon">◫</i><small>Игры</small></button><button class="ur-nav-btn" data-ur-nav="profile"><i class="ur-app-icon">♙</i><small>Профиль</small></button></nav>
    <div class="ur-modal" id="ur-modal" aria-hidden="true"><div class="ur-modal__card" id="ur-modal-content"></div></div>`;
  scene.insertAdjacentElement('afterend', home);
  const gamesRoot = home.querySelector('#ur-games'), filtersRoot = home.querySelector('#ur-filters');
  const modal = home.querySelector('#ur-modal'), modalContent = home.querySelector('#ur-modal-content');
  let activeFilter = 'all';
  function renderHomeGames() {
    gamesRoot.innerHTML = GAMES.map((game, index) => `
      <button class="ur-game-card ${activeFilter !== 'all' && !game.tags.includes(activeFilter) ? 'is-filtered' : ''}" data-ur-game="${game.key}" data-tags="${game.tags.join(' ')}">
        <span class="ur-game-visual"><span class="ur-game-badge">${game.badge}</span><span class="ur-game-fav" aria-hidden="true">${index === 5 ? '♥' : '♡'}</span><img src="${game.icon}?v=39" alt="${escapeHTML(game.title)}" loading="${index < 4 ? 'eager' : 'lazy'}" decoding="async"></span>
        <strong class="ur-game-title">${escapeHTML(game.title)}</strong><span class="ur-game-desc">${escapeHTML(game.desc)}</span>
        <span class="ur-game-meta"><i>${game.players}</i><i>${game.time}</i></span><span class="ur-game-arrow">→</span>
      </button>`).join('');
  }
  function readHistory() {
    try { const value = JSON.parse(localStorage.getItem('last_games_history') || '[]'); return Array.isArray(value) ? value.filter((title) => keyByTitle.has(title)).slice(0, 3) : []; }
    catch { return []; }
  }
  function renderContinueAndProfile() {
    const history = readHistory(); const recentKey = keyByTitle.get(history[0]) || 'quartet'; const recent = gameByKey.get(recentKey);
    const continueCard = home.querySelector('#ur-continue-card'); continueCard.dataset.urGame = recent.key;
    continueCard.innerHTML = `<span class="ur-continue-icon"><img src="${recent.icon}?v=39" alt=""></span><span class="ur-continue-copy"><small>ПОСЛЕДНЯЯ ИГРА</small><strong>${escapeHTML(recent.title)}</strong><span>Вернуться к игре</span></span><i class="ur-continue-go">→</i>`;
    const tgUser = window.Telegram?.WebApp?.initDataUnsafe?.user;
    home.querySelector('#ur-profile-name').textContent = tgUser?.first_name || tgUser?.username || 'Игрок';
    home.querySelector('#ur-profile-meta').textContent = tgUser?.username ? `@${tgUser.username}` : 'Профиль игрока';
    let wowCoins = 0; try { wowCoins = Number(JSON.parse(localStorage.getItem('bibleWowData_v5') || '{}').coins || 0); } catch {}
    home.querySelector('#ur-profile-grid').innerHTML = `<div><strong>12</strong><span>Доступных игр</span></div><div><strong>${history.length}</strong><span>Недавние игры</span></div><div><strong>${wowCoins}</strong><span>Звёзды и монеты</span></div><div><strong>8</strong><span>Живых сцен</span></div>`;
    home.querySelector('#ur-profile-recent').innerHTML = history.length ? history.map((title) => `<button data-ur-game="${keyByTitle.get(title)}">${escapeHTML(title)}<span>→</span></button>`).join('') : '<p>История появится после первой игры.</p>';
  }
  function openProductionGame(key) {
    if (!gameByKey.has(key)) return;
    if (key === 'biblical-match-three' && typeof window.openBiblicalMatchThree === 'function') { window.openBiblicalMatchThree(); return; }
    if (typeof window.showGame === 'function') { window.showGame(key); return; }
    const productionCard = [...document.querySelectorAll('#menu-container .game-card')].find((card) => card.dataset.gameKey === key || card.getAttribute('onclick')?.includes(`'${key}'`) || card.querySelector('.game-card__title')?.textContent?.trim() === gameByKey.get(key).title);
    productionCard?.click();
  }
  function modalMarkup(kind) {
    if (kind === 'code') return `<div class="ur-modal__head"><i class="ur-app-icon">⌁</i><div><h3>Войти по коду</h3><p>Введите код комнаты и выберите игру.</p></div><button data-ur-close aria-label="Закрыть">×</button></div><div class="ur-modal__body"><input id="ur-room-code" inputmode="text" maxlength="10" placeholder="КОД КОМНАТЫ" aria-label="Код комнаты"><div class="ur-modal__actions"><button data-ur-join="quartet" class="primary">Квартет</button><button data-ur-join="bible-sketch">Библейский художник</button></div><p class="ur-modal__status">Подключение использует рабочий механизм приглашений приложения.</p></div>`;
    return `<div class="ur-modal__head"><i class="ur-app-icon">▦</i><div><h3>Войти по QR</h3><p>Сканер распознаёт приглашения в комнаты.</p></div><button data-ur-close aria-label="Закрыть">×</button></div><div class="ur-modal__body"><div class="ur-qr-placeholder">▦<span>Камера откроется после нажатия</span></div><div class="ur-modal__actions"><button class="primary" data-ur-open-camera>Открыть камеру</button><button data-ur-switch-code>Ввести код</button></div></div>`;
  }
  function openModal(kind) { modalContent.innerHTML = modalMarkup(kind); modal.classList.add('open'); modal.setAttribute('aria-hidden', 'false'); if (kind === 'code') setTimeout(() => home.querySelector('#ur-room-code')?.focus(), 100); }
  function closeModal() { modal.classList.remove('open'); modal.setAttribute('aria-hidden', 'true'); }
  home.addEventListener('click', (event) => {
    const gameButton = event.target.closest('[data-ur-game]'); if (gameButton) { closeModal(); openProductionGame(gameButton.dataset.urGame); return; }
    const action = event.target.closest('[data-ur-action]'); if (action) { openModal(action.dataset.urAction); return; }
    const nav = event.target.closest('[data-ur-nav]');
    if (nav) {
      const profile = nav.dataset.urNav === 'profile'; home.querySelector('#ur-games-view').hidden = profile; home.querySelector('#ur-profile-view').hidden = !profile;
      home.querySelectorAll('[data-ur-nav]').forEach((button) => button.classList.toggle('active', button === nav)); if (profile) renderContinueAndProfile(); scrollTo({ top: 0, behavior: 'auto' }); return;
    }
    const filter = event.target.closest('[data-filter]');
    if (filter) { activeFilter = filter.dataset.filter; filtersRoot.querySelectorAll('[data-filter]').forEach((button) => button.classList.toggle('active', button === filter)); renderHomeGames(); return; }
    if (event.target.closest('#ur-show-all')) { activeFilter = 'all'; filtersRoot.querySelectorAll('[data-filter]').forEach((button) => button.classList.toggle('active', button.dataset.filter === 'all')); renderHomeGames(); }
  });
  modal.addEventListener('click', (event) => {
    if (event.target === modal || event.target.closest('[data-ur-close]')) { closeModal(); return; }
    if (event.target.closest('[data-ur-switch-code]')) { openModal('code'); return; }
    if (event.target.closest('[data-ur-open-camera]')) { closeModal(); window.RoomQrScanner?.open?.(); return; }
    const join = event.target.closest('[data-ur-join]');
    if (join) {
      const code = String(home.querySelector('#ur-room-code')?.value || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10);
      if (code.length < 4) { home.querySelector('.ur-modal__status').textContent = 'Введите код длиной от 4 символов.'; return; }
      const game = join.dataset.urJoin; window.RoomInvite?.acceptScanned?.(`biblegames:${game === 'bible-sketch' ? 'sketch' : game}:${code}`);
      closeModal(); openProductionGame(game);
    }
  });
  renderHomeGames(); renderContinueAndProfile();

  const chromeMeta = {
    alias: ['ПЛОЩАДЬ РАССКАЗЧИКОВ', 'Алиас'], spy: ['НОЧНОЙ ГОРОД', 'Шпион'], coimaginarium: ['ОБСЕРВАТОРИЯ ИДЕЙ', 'Соображариум'],
    guess: ['ГАЛЕРЕЯ ЛИЦ', 'Угадай персонажа'], describe: ['КРУГ РАССКАЗЧИКОВ', 'Опиши, но не называй'], quartet: ['ЦАРСКИЙ АРХИВ', 'Квартет'],
    'bible-sketch': ['МАСТЕРСКАЯ ЛЕТОПИСЦА', 'Библейский художник'], 'bible-wow': ['ХРАМ ПИСЬМЕННОСТИ', 'Библейские слова'],
    'bible-wordsearch': ['АРХЕОЛОГИЧЕСКИЙ СТОЛ', 'Поиск слов'], 'sacred-word': ['ЗАПЕЧАТАННЫЙ СВИТОК', 'Священное слово'],
    'kids-ark-pairs': ['ПАЛУБА НОЕВА КОВЧЕГА', 'Найди пару'], 'biblical-match-three': ['ПУТЬ СВЕТА', 'Библейские сокровища'],
  };
  function decorateGame() {
    const key = document.body.dataset.currentGame; if (!key || !chromeMeta[key]) return;
    const container = document.getElementById('game-container'); if (!container) return;
    if (!container.querySelector(':scope > .ur-game-chrome')) {
      const [eyebrow, title] = chromeMeta[key]; const chrome = document.createElement('header'); chrome.className = 'ur-game-chrome';
      chrome.innerHTML = `<button type="button" aria-label="В главное меню">‹</button><span><small>${eyebrow}</small><strong>${title}</strong></span><i>${CATALOG[key]?.motion === 'parallax' ? 'ЖИВАЯ СЦЕНА' : 'НОВЫЙ СТИЛЬ'}</i>`;
      chrome.querySelector('button').addEventListener('click', () => (window.appGoToMainMenu || window.goToMainMenu)?.()); container.prepend(chrome);
    }
    if (key === 'alias') { const seconds = Number.parseInt(container.querySelector('#alias-timer')?.textContent || '', 10); scene.classList.toggle('is-urgent', Number.isFinite(seconds) && seconds <= 10); }
    else scene.classList.remove('is-urgent');
    if (key === 'spy') scene.classList.toggle('spy-state', Boolean(container.querySelector('.spy-card-shell.is-revealed .spy-card-value__main--spy')));
    else scene.classList.remove('spy-state');
  }
  function syncHomeVisibility() {
    const isGame = Boolean(document.body.dataset.mode), loader = document.getElementById('main-loader'), banned = document.getElementById('banned-screen');
    const isBanned = banned && !banned.classList.contains('hidden'); home.hidden = isGame || Boolean(loader) || isBanned;
    if (!home.hidden) { renderContinueAndProfile(); document.documentElement.dataset.urHomeReady = '1'; }
  }
  let updateQueued = false;
  function update() { updateQueued = false; applyScene(activeKey()); syncHomeVisibility(); decorateGame(); document.body.dataset.unifiedReviewReady = '1'; }
  function queueUpdate() { if (updateQueued) return; updateQueued = true; requestAnimationFrame(update); }
  new MutationObserver(queueUpdate).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-mode', 'data-current-game', 'class', 'hidden'] });
  addEventListener('app:menu-ready', queueUpdate); addEventListener('pageshow', queueUpdate); update();
  window.UnifiedGamesReview = {
    version: 'unified-games-redesign-review-v3', sourceCommit: SOURCE_COMMIT,
    canonicalReferences: {
      home: 'home-menu-v22@195f150b', alias: 'alias-parallax@7e36d9a', spy: 'spy-parallax@ddd4d3a',
      bibleWords: 'temple-of-writing-v3@dd1743c', treasures: 'path-of-light@ae6f795', quartet: 'quartet-card-redesign',
    },
    catalog: Object.fromEntries(Object.entries(CATALOG).map(([key, value]) => [key, value.motion])),
    get scene() { return sceneKey; }, get motion() { return sceneMotion; }, get frozen() { return frozen; }, playSceneEvent,
  };
})();
