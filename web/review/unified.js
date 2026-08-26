(() => {
  'use strict';

  const ASSET = '/web/review/assets';
  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const interactiveSelector = 'button,input,select,textarea,canvas,.wow-wheel-wrap,.wow-grid,.bmt-board,.ws-board,.qv2-hand,.qv2-table,.bsk-canvas-wrap,.kids-grid,.spy-card-shell';
  const titleToKey = {
    'Алиас': 'alias', 'Соображариум': 'coimaginarium', 'Угадай персонажа': 'guess',
    'Опиши, но не называй': 'describe', 'Шпион': 'spy', 'Квартет': 'quartet',
    'Библейский художник': 'bible-sketch', 'Библейские слова': 'bible-wow',
    'Поиск библейских слов': 'bible-wordsearch', 'Священное слово': 'sacred-word',
    'Найди пару': 'kids-ark-pairs', 'Библейские сокровища': 'biblical-match-three',
    'Библейские три в ряд': 'biblical-match-three',
  };

  const layer = (src, depth, opacity = 1, filter = 'none', position = 'center') => ({ src, depth, opacity, filter, position });
  const glow = (depth, variant = 'gold') => ({ type: 'glow', depth, variant });
  const CATALOG = {
    menu: { motion: 'parallax', layers: [
      layer(`${ASSET}/menu/city.webp`, .25, .92, 'brightness(.78) saturate(.88)'),
      layer(`${ASSET}/menu/stars-v19.webp`, .55, .42), layer(`${ASSET}/menu/moon-v19.webp`, .9, .5),
      layer(`${ASSET}/menu/clouds-far-v19.webp`, 1.2, .19), layer(`${ASSET}/menu/clouds-near-v19.webp`, 1.8, .13),
      layer(`${ASSET}/menu/foreground.webp`, 2.8, .72, 'brightness(.66) saturate(.82)'),
    ]},
    alias: { motion: 'parallax', layers: [
      layer(`${ASSET}/alias/01-sky-sunset.webp`, .2, .92), layer(`${ASSET}/alias/02-mountains.webp`, .45, .72),
      layer(`${ASSET}/alias/03-city-far.webp`, .7, .78), layer(`${ASSET}/alias/04-market-mid.webp`, 1.05, .76),
      layer(`${ASSET}/alias/09-dust-haze.webp`, 1.25, .18), layer(`${ASSET}/alias/05-left-foreground.webp`, 2.1, .68),
      layer(`${ASSET}/alias/06-right-foreground.webp`, 2.45, .68), layer(`${ASSET}/alias/07-hourglass.webp`, 2.7, .42),
      layer(`${ASSET}/alias/08-props.webp`, 2.95, .5), layer(`${ASSET}/alias/10-lantern-glow.webp`, 1.65, .14),
    ]},
    spy: { motion: 'parallax', layers: [
      layer(`${ASSET}/spy/01-sky-moon-stars.webp`, .18, .96), layer(`${ASSET}/spy/02-mountains.webp`, .4, .76),
      layer(`${ASSET}/spy/03-temple-far.webp`, .62, .72), layer(`${ASSET}/spy/04-city-mid.webp`, .85, .78),
      layer(`${ASSET}/spy/05-rooftops.webp`, 1.15, .78), layer(`${ASSET}/spy/06-fog.webp`, 1.3, .15),
      layer(`${ASSET}/spy/07-left-foreground.webp`, 2.15, .64), layer(`${ASSET}/spy/08-spy.webp`, 2.0, .56),
      layer(`${ASSET}/spy/09-leaves.webp`, 2.65, .56), layer(`${ASSET}/spy/10-right-foreground.webp`, 2.8, .66),
      layer(`${ASSET}/spy/11-props.webp`, 3.05, .48), layer(`${ASSET}/spy/12-plants-right.webp`, 3.2, .54),
    ]},
    'bible-wow': { motion: 'parallax', layers: [
      layer(`${ASSET}/bible-words/01-temple-base.webp`, .18, .93, 'brightness(.72) saturate(.84)'),
      layer(`${ASSET}/bible-words/02-distant-sanctuary.webp`, .46, .66),
      layer(`${ASSET}/bible-words/06-moonbeams.webp`, .72, .14),
      layer(`${ASSET}/bible-words/03-left-arch.webp`, 1.75, .65),
      layer(`${ASSET}/bible-words/04-right-arch.webp`, 1.95, .65),
      layer(`${ASSET}/bible-words/05-scriptorium-ledge.webp`, 2.35, .52),
      layer(`${ASSET}/bible-words/07-dust-motes.webp`, 1.25, .1),
    ]},
    'biblical-match-three': { motion: 'parallax', layers: [
      layer(`${ASSET}/path/temple-base-v3.webp`, .22, .9, 'brightness(.7) saturate(.84)'),
      layer(`${ASSET}/path/temple-light-v3.webp`, 1.0, .11, 'saturate(.72)'),
      layer(`${ASSET}/path/temple-foreground-v3.webp`, 2.8, .55, 'brightness(.58) saturate(.72)'),
      glow(1.5, 'path'),
    ]},
    coimaginarium: { motion: 'parallax', layers: [layer(`${ASSET}/scenes/coimaginarium.webp`, .3, .91, 'brightness(.72)'), glow(1.1, 'violet'), glow(2.2, 'gold')] },
    guess: { motion: 'parallax', layers: [layer(`${ASSET}/scenes/guess.webp`, .28, .9, 'brightness(.68)'), glow(1.15, 'moon'), glow(2.1, 'gold')] },
    describe: { motion: 'parallax', layers: [layer(`${ASSET}/scenes/describe.webp`, .3, .91, 'brightness(.72)'), glow(1.2, 'ember'), glow(2.2, 'moon')] },
    'sacred-word': { motion: 'parallax', layers: [layer(`${ASSET}/scenes/sacred-word.webp`, .28, .9, 'brightness(.7)'), glow(1.1, 'violet'), glow(2.15, 'gold')] },
    quartet: { motion: 'static', layers: [layer(`${ASSET}/scenes/quartet.webp`, 0, .88, 'brightness(.7) saturate(.82)')] },
    'bible-sketch': { motion: 'static', layers: [layer(`${ASSET}/scenes/bible-sketch.webp`, 0, .86, 'brightness(.64) saturate(.78)')] },
    'bible-wordsearch': { motion: 'static', layers: [layer(`${ASSET}/scenes/wordsearch.webp`, 0, .87, 'brightness(.72) saturate(.82)')] },
    'kids-ark-pairs': { motion: 'static', layers: [layer(`${ASSET}/scenes/pairs.webp`, 0, .94, 'brightness(.9) saturate(.82)')] },
  };

  const scene = document.createElement('div');
  scene.className = 'ur-scene'; scene.id = 'unified-review-scene'; scene.setAttribute('aria-hidden', 'true');
  scene.innerHTML = '<div class="ur-scene__atmosphere"></div><div class="ur-scene__event" data-kind="match"></div><div class="ur-scene__event" data-kind="cascade"></div><div class="ur-scene__event" data-kind="levelComplete"></div>';
  document.body.prepend(scene);
  const atmosphere = scene.querySelector('.ur-scene__atmosphere');
  const eventNodes = new Map([...scene.querySelectorAll('.ur-scene__event')].map((node) => [node.dataset.kind, node]));
  const reviewMark = document.createElement('div'); reviewMark.className = 'ur-review-mark'; reviewMark.innerHTML = '<i></i><span>Unified Review</span>'; document.body.append(reviewMark);

  let sceneKey = ''; let sceneMotion = 'static'; let depthNodes = []; let frozen = false;
  let targetX = 0, targetY = 0, currentX = 0, currentY = 0, raf = 0, eventTimer = 0;
  function activeKey() { return document.body.dataset.currentGame || (document.body.dataset.mode === 'game' ? '' : 'menu'); }
  function buildGlow(meta) {
    const node = document.createElement('div'); node.className = `ur-scene__layer ur-scene__glow ur-scene__glow--${meta.variant}`;
    const backgrounds = {
      gold: 'radial-gradient(circle at 22% 25%,rgba(255,215,123,.18),transparent 31%),radial-gradient(circle at 82% 68%,rgba(255,194,65,.12),transparent 28%)',
      violet: 'radial-gradient(circle at 74% 18%,rgba(126,105,255,.2),transparent 34%),radial-gradient(circle at 24% 72%,rgba(113,86,220,.12),transparent 30%)',
      moon: 'linear-gradient(118deg,transparent 22%,rgba(156,193,255,.1) 46%,transparent 62%)',
      ember: 'radial-gradient(ellipse at 50% 77%,rgba(255,143,42,.24),transparent 35%)',
      path: 'linear-gradient(180deg,rgba(255,248,204,.2),rgba(255,197,64,.04) 45%,rgba(255,183,40,.16))',
    };
    node.style.background = backgrounds[meta.variant] || backgrounds.gold; node.style.mixBlendMode = 'screen'; node.style.opacity = '.65';
    node.dataset.depth = String(meta.depth); return node;
  }
  function applyScene(nextKey) {
    const key = CATALOG[nextKey] ? nextKey : 'menu'; if (key === sceneKey) return;
    sceneKey = key; const config = CATALOG[key]; sceneMotion = config.motion; frozen = false;
    for (const node of depthNodes) node.remove(); depthNodes = [];
    const fragment = document.createDocumentFragment();
    config.layers.forEach((meta, index) => {
      let node;
      if (meta.type === 'glow') node = buildGlow(meta);
      else {
        node = document.createElement('img'); node.className = 'ur-scene__layer'; node.alt = ''; node.decoding = 'async'; node.loading = index < 2 ? 'eager' : 'lazy';
        node.src = meta.src; node.dataset.depth = String(meta.depth); node.style.setProperty('--layer-opacity', String(meta.opacity));
        node.style.setProperty('--layer-filter', meta.filter); node.style.objectPosition = meta.position;
      }
      node.style.zIndex = String(index + 1); fragment.append(node); depthNodes.push(node);
    });
    scene.insertBefore(fragment, atmosphere); scene.dataset.scene = key; scene.dataset.motion = sceneMotion;
    targetX = targetY = currentX = currentY = 0; renderNow();
    document.body.dataset.reviewVisual = key; document.body.dataset.reviewMotion = sceneMotion;
  }
  function renderNow() {
    depthNodes.forEach((node) => { node.style.setProperty('--layer-x', '0px'); node.style.setProperty('--layer-y', '0px'); });
  }
  function schedule() {
    if (!raf && sceneMotion === 'parallax' && !frozen && !reducedMotion) { scene.classList.add('is-moving'); raf = requestAnimationFrame(render); }
  }
  function render() {
    raf = 0; if (frozen || reducedMotion || sceneMotion !== 'parallax') { scene.classList.remove('is-moving'); return; }
    currentX += (targetX - currentX) * .14; currentY += (targetY - currentY) * .14;
    depthNodes.forEach((node) => { const depth = Number(node.dataset.depth || 0); node.style.setProperty('--layer-x', `${(currentX * depth).toFixed(2)}px`); node.style.setProperty('--layer-y', `${(currentY * depth).toFixed(2)}px`); });
    if (Math.abs(targetX - currentX) > .025 || Math.abs(targetY - currentY) > .025) schedule(); else scene.classList.remove('is-moving');
  }
  function pointerTarget(event) {
    if (event.target.closest?.(interactiveSelector) || event.buttons) return;
    targetX = (event.clientX / Math.max(1, innerWidth) - .5) * 8;
    targetY = (event.clientY / Math.max(1, innerHeight) - .5) * 5; schedule();
  }
  function scrollTarget() { if (sceneMotion !== 'parallax') return; const max = Math.max(1, document.documentElement.scrollHeight - innerHeight); targetY = Math.max(-5, Math.min(5, -(scrollY / max) * 5)); schedule(); }
  function freeze() { frozen = true; if (raf) cancelAnimationFrame(raf); raf = 0; scene.classList.remove('is-moving'); }
  function release() { frozen = false; targetX = currentX; targetY = currentY; }
  window.addEventListener('pointermove', pointerTarget, { passive: true }); window.addEventListener('scroll', scrollTarget, { passive: true });
  document.addEventListener('pointerdown', (event) => { if (event.target.closest?.(interactiveSelector)) freeze(); }, true);
  document.addEventListener('pointerup', release, true); document.addEventListener('pointercancel', release, true); window.addEventListener('blur', release, { passive: true });

  function playSceneEvent(kind) {
    const normalized = kind === 'levelComplete' ? 'levelComplete' : kind === 'cascade' ? 'cascade' : 'match';
    const node = eventNodes.get(normalized); if (!node || reducedMotion) return;
    clearTimeout(eventTimer); eventNodes.forEach((item) => item.classList.remove('is-playing')); void node.offsetWidth; node.classList.add('is-playing');
    scene.dataset.lastEvent = kind; eventTimer = setTimeout(() => node.classList.remove('is-playing'), normalized === 'levelComplete' ? 1400 : 850);
  }
  window.addEventListener('bmt:path-light', (event) => playSceneEvent(event.detail?.kind || 'match'));

  function decorateMenu() {
    const header = document.querySelector('.app-header'); if (header && header.dataset.urReady !== '1') {
      header.dataset.urReady = '1'; const kicker = header.querySelector('.app-kicker'); const subtitle = header.querySelector('.app-subtitle');
      if (kicker) kicker.textContent = 'Единая коллекция'; if (subtitle) subtitle.textContent = '12 обновлённых игр · все механики рабочей версии';
    }
    document.querySelectorAll('.game-card').forEach((card) => {
      if (card.dataset.urReady === '1' || card.closest('#system-actions')) return;
      const title = card.querySelector('.game-card__title')?.textContent?.trim(); const key = titleToKey[title]; if (!key) return;
      card.dataset.urReady = '1'; card.dataset.urGame = key; card.dataset.urMotion = CATALOG[key]?.motion || 'static';
      const badge = document.createElement('span'); badge.className = 'ur-game-badge'; badge.textContent = card.dataset.urMotion === 'parallax' ? 'ЖИВАЯ СЦЕНА' : 'НОВЫЙ СТИЛЬ'; card.prepend(badge);
    });
  }
  let updateQueued = false;
  function update() { updateQueued = false; applyScene(activeKey()); decorateMenu(); document.body.dataset.unifiedReviewReady = '1'; }
  function queueUpdate() { if (updateQueued) return; updateQueued = true; requestAnimationFrame(update); }
  new MutationObserver(queueUpdate).observe(document.body, { attributes: true, attributeFilter: ['data-mode', 'data-current-game'] });
  const menuRoot = document.getElementById('menu-container');
  if (menuRoot) new MutationObserver(queueUpdate).observe(menuRoot, { childList: true, subtree: true });
  window.addEventListener('app:menu-ready', queueUpdate); window.addEventListener('pageshow', queueUpdate); update();

  window.UnifiedGamesReview = {
    version: 'unified-games-redesign-review-v1', sourceCommit: '58cfe7515fd1d50163eda13d10a14958a9475357',
    catalog: Object.fromEntries(Object.entries(CATALOG).map(([key, value]) => [key, value.motion])),
    get scene() { return sceneKey; }, get motion() { return sceneMotion; }, get frozen() { return frozen; }, playSceneEvent,
  };
})();
