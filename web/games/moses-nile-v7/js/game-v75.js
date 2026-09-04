/*
  Моисей: Путь по Нилу — движок раннера.

  Один цикл рендера, один WebGL-контекст, один запасной 2D-режим.
  Слоёв-патчей поверх движка больше нет и быть не должно: всё, что рисуется
  и считается, живёт здесь.

  Раскладка файла:
    1. Константы, биомы, каталог препятствий
    2. DOM и состояние
    3. Рендер и менеджер качества
    4. Построение сцены (вода, берега, атмосфера, декор)
    5. Модели препятствий и пул объектов
    6. Генерация мира
    7. Игровая логика: управление, столкновения, бонусы, счёт
    8. Камера и кадр
    9. Запасной 2D-режим
   10. Загрузка
*/
(() => {
  'use strict';

  /* ------------------------------------------------------------------ *
   * 1. Константы                                                        *
   * ------------------------------------------------------------------ */

  const VERSION = 'V7.5.1';
  const EDITION = 'RUNNER II';
  const RIVER_HALF = 6.35;
  const LANES = [-3.75, 0, 3.75];
  const MAX_DPR = 1.25;
  const FAR_Z = -255;
  const NEAR_Z = 10;
  const THREE = window.THREE;
  const BEST_KEY = 'moses-nile-best-v2';
  const HINT_KEY = 'moses-nile-hint-seen-v2';
  const TUTORIAL_KEY = 'moses-nile-tutorial-seen-v1';

  const TUNE = {
    baseSpeed: 18.5,
    maxSpeed: 35,
    speedRamp: 1 / 190,      // метров дистанции на +1 м/с
    laneDamp: 13,
    jumpImpulse: 6.4,
    gravity: -17.5,
    jumpClearance: .78,      // выше этого корзинка перелетает «низкие» помехи
    diveDuration: .62,
    diveDepth: -.52,
    diveClearance: -.22,     // ниже этого корзинка проходит под «высокими»
    inputCooldown: .12,
    hitInvulnerability: 1.7,
    comboWindow: 4.2,
    maxHearts: 3,
    shieldTime: 8,
    magnetTime: 10,
    rushTime: 6,
    rushBoost: 1.42,
    nearMissWindow: .62,
    spawnAhead: 178,
  };

  /*
    Биомы сменяются по дистанции и тянут за собой свет, туман, цвет воды,
    плотность берега и набор препятствий. Между биомами всё интерполируется,
    поэтому переход читается как смена времени суток, а не как склейка.

    Свет переведён к естественному: небо в зените голубое, а не песочное,
    заполняющий свет ослаблен (его половину теперь даёт световой зонд неба из
    materials.js), солнце сделано сильнее. Раньше все три источника были
    одного бежевого тона и одинаковой силы — сцена превращалась в ровную
    песчаную заливку без теней и объёма.
  */
  const BIOMES = [
    {
      id: 'papyrus',
      title: 'Заводь папируса',
      subtitle: 'Тихая вода, густой тростник',
      from: 0,
      fog: 0xc9c2ac, fogNear: 98, fogFar: 306,
      hemiSky: 0xc8dcf0, hemiGround: 0x4a4234, hemiPower: .30,
      sunColor: 0xffe8c4, sunPower: 1.5, sunPos: [-24, 38, 16],
      water: { deep: 0x1c3729, shallow: 0x4f7458, sky: 0x9db8d0, sun: 0xffe3ae, foam: 0xeff2e6, chop: .85, glitter: 1.05, opacity: .95 },
      sky: { zenith: 0x4f7ba9, haze: 0xb2a488, horizon: 0xd8c8a6, sun: 0xffe6ae, storm: .34, stars: 0 },
      grade: 'saturate(1) contrast(1) brightness(1)',
      overlay: 'linear-gradient(180deg, rgba(90,64,28,.10), transparent 30%, transparent 70%, rgba(24,26,18,.20))',
      exposure: .93, wind: 1, weights: { rock: 3, log: 4, croc: 2, gate: 3, vortex: 0, hippo: 0, boat: 1 },
    },
    {
      id: 'open',
      title: 'Открытый Нил',
      subtitle: 'Полдень над широкой водой',
      from: 700,
      fog: 0xd0cab4, fogNear: 110, fogFar: 336,
      hemiSky: 0xd4e6f6, hemiGround: 0x554c38, hemiPower: .34,
      sunColor: 0xfff4dc, sunPower: 1.62, sunPos: [-16, 46, 12],
      water: { deep: 0x1b3d2f, shallow: 0x568063, sky: 0xa9c4dc, sun: 0xfff2cf, foam: 0xf6f7ec, chop: 1, glitter: 1.4, opacity: .96 },
      sky: { zenith: 0x4272a6, haze: 0xbcb094, horizon: 0xe4d5b4, sun: 0xfff2cf, storm: .24, stars: 0 },
      grade: 'saturate(1) contrast(1) brightness(1)',
      overlay: 'linear-gradient(180deg, rgba(120,96,40,.06), transparent 34%, transparent 72%, rgba(30,32,22,.16))',
      exposure: .97, wind: 1.25, weights: { rock: 4, log: 4, croc: 3, gate: 2, vortex: 1, hippo: 1, boat: 2 },
    },
    {
      id: 'rapids',
      title: 'Пороги Нила',
      subtitle: 'Течение рвётся между камней',
      from: 1500,
      fog: 0xb2c0ba, fogNear: 76, fogFar: 256,
      hemiSky: 0xb8cfdc, hemiGround: 0x333d36, hemiPower: .32,
      sunColor: 0xe8f0e4, sunPower: 1.4, sunPos: [-28, 34, 20],
      water: { deep: 0x1b3831, shallow: 0x5f7a67, sky: 0xbccdbe, sun: 0xf2f7ef, foam: 0xffffff, chop: 2.1, glitter: 1.5, opacity: .98 },
      sky: { zenith: 0x3f5f74, haze: 0x8b9d96, horizon: 0xc2cec1, sun: 0xf2f7ef, storm: .62, stars: 0 },
      grade: 'saturate(1) contrast(1) brightness(1)',
      overlay: 'linear-gradient(180deg, rgba(40,60,60,.20), transparent 30%, transparent 66%, rgba(16,26,26,.30))',
      exposure: .89, wind: 1.9, weights: { rock: 6, log: 3, croc: 3, gate: 2, vortex: 4, hippo: 1, boat: 0 },
    },
    {
      id: 'night',
      title: 'Ночная переправа',
      subtitle: 'Только луна и огни на берегу',
      from: 2400,
      fog: 0x2a3a52, fogNear: 34, fogFar: 168,
      hemiSky: 0x243c60, hemiGround: 0x070a11, hemiPower: .22,
      sunColor: 0xa8c8ff, sunPower: .98, sunPos: [18, 34, -6],
      water: { deep: 0x0b1420, shallow: 0x22364c, sky: 0x3d566f, sun: 0xcfe0ff, foam: 0xcddcf2, chop: 1.2, glitter: 1.9, opacity: .99 },
      sky: { zenith: 0x0e1626, haze: 0x1d2b40, horizon: 0x33445e, sun: 0xbcd2ff, storm: .55, stars: 1 },
      grade: 'saturate(1) contrast(1) brightness(1)',
      overlay: 'linear-gradient(180deg, rgba(8,14,28,.52), rgba(10,16,30,.28) 34%, rgba(8,12,24,.34) 70%, rgba(4,8,18,.60))',
      exposure: .58, wind: 1.1, weights: { rock: 4, log: 3, croc: 5, gate: 3, vortex: 2, hippo: 2, boat: 1 },
    },
    {
      id: 'delta',
      title: 'Рассвет над дельтой',
      subtitle: 'Река выносит корзинку к людям',
      from: 3300,
      fog: 0xd8c1a2, fogNear: 92, fogFar: 300,
      hemiSky: 0xa9bcd8, hemiGround: 0x4a3a28, hemiPower: .30,
      sunColor: 0xffc487, sunPower: 1.58, sunPos: [10, 24, -22],
      water: { deep: 0x2c3722, shallow: 0x6f7048, sky: 0xd0aa84, sun: 0xffd9a0, foam: 0xfaeeda, chop: 1.15, glitter: 1.6, opacity: .97 },
      sky: { zenith: 0x4a5a86, haze: 0xc09068, horizon: 0xf2c68e, sun: 0xffcf9a, storm: .40, stars: .1 },
      grade: 'saturate(1) contrast(1) brightness(1)',
      overlay: 'linear-gradient(180deg, rgba(150,84,26,.16), transparent 32%, transparent 70%, rgba(50,26,10,.26))',
      exposure: .93, wind: 1.4, weights: { rock: 4, log: 4, croc: 4, gate: 3, vortex: 3, hippo: 2, boat: 2 },
    },
  ];

  /*
    clearance описывает, как препятствие проходится:
      ground — только сменой дорожки
      low    — можно перепрыгнуть на волне
      high   — можно поднырнуть
  */
  const OBSTACLES = {
    rock:   { clearance: 'ground', radius: 1.02, size: 1.75, fail: 'Корзинка ударилась о камень посреди течения.' },
    log:    { clearance: 'low',    radius: 1.12, size: 2.75, fail: 'Течение вынесло корзинку прямо на бревно.' },
    croc:   { clearance: 'ground', radius: 1.34, size: 6.6, fail: 'Крокодил преградил путь по реке.' },
    gate:   { clearance: 'high',   radius: 1.28, size: 2.4,  fail: 'Корзинка запуталась в нависших зарослях папируса.' },
    vortex: { clearance: 'ground', radius: 1.05, size: 2.2,  fail: 'Водоворот затянул корзинку под воду.' },
    hippo:  { clearance: 'ground', radius: 1.5, size: 5.4,  fail: 'Бегемот поднялся из воды прямо перед корзинкой.' },
    boat:   { clearance: 'ground', radius: 1.78, size: 6.4,  fail: 'Корзинка врезалась в борт рыбацкой лодки.' },
  };

  const PICKUPS = {
    lotus:  { radius: .92 },
    shield: { radius: 1.0 },
    magnet: { radius: 1.0 },
    rush:   { radius: 1.0 },
    mercy:  { radius: 1.0 },
  };

  /* ------------------------------------------------------------------ *
   * 2. DOM и состояние                                                  *
   * ------------------------------------------------------------------ */

  const pick = (id) => document.getElementById(id);
  const dom = {
    body: document.body,
    canvas: pick('game-canvas'),
    fallback: pick('fallback-canvas'),
    distance: pick('dist-txt'),
    score: pick('score-txt'),
    total: pick('score-total'),
    combo: pick('combo-chip'),
    comboValue: pick('combo-mult'),
    hearts: pick('hearts'),
    startScreen: pick('start-screen'),
    startBest: pick('start-best'),
    gameOverScreen: pick('gameover-screen'),
    pauseScreen: pick('pause-screen'),
    start: pick('start-btn'),
    restart: pick('restart-btn'),
    resume: pick('resume-btn'),
    quit: pick('quit-btn'),
    left: pick('btn-left'),
    right: pick('btn-right'),
    jump: pick('btn-jump'),
    dive: pick('btn-dive'),
    pause: pick('btn-pause'),
    sound: pick('btn-sound'),
    fail: pick('fail-desc'),
    finalDistance: pick('final-dist'),
    finalScore: pick('final-score'),
    finalTotal: pick('final-total'),
    bestLine: pick('best-line'),
    shield: pick('shield-badge'),
    magnet: pick('magnet-badge'),
    rush: pick('rush-badge'),
    toast: pick('toast-layer'),
    loadingNote: pick('loading-note'),
    loadingScreen: pick('loading-screen'),
    tutorial: pick('tutorial-screen'),
    tutTitle: pick('tut-title'),
    tutText: pick('tut-text'),
    tutEffect: pick('tut-effect'),
    tutDots: pick('tut-dots'),
    tutBack: pick('tut-back'),
    tutNext: pick('tut-next'),
    tutSkip: pick('tut-skip'),
    tutScenes: Array.from(document.querySelectorAll('.tut-scene')),
    help: pick('help-btn'),
    loadFill: pick('load-fill'),
    loadPercent: pick('load-percent'),
    loadLabel: pick('load-label'),
    hint: pick('hint-layer'),
    badge: pick('version-badge'),
    grade: pick('scene-grade'),
    sceneBg: pick('scene-bg'),
    biomeName: pick('biome-name'),
  };

  const state = {
    playing: false,
    paused: false,
    over: false,
    ready: false,
    fallback: false,
    lane: 1,
    x: 0,
    targetX: 0,
    y: 0,
    vy: 0,
    airborne: false,
    dive: 0,
    inputLock: 0,
    distance: 0,
    lotuses: 0,
    score: 0,
    speed: TUNE.baseSpeed,
    hearts: TUNE.maxHearts,
    invulnerable: 0,
    shield: 0,
    magnet: 0,
    rush: 0,
    combo: 0,
    comboTimer: 0,
    multiplier: 1,
    nearMisses: 0,
    items: [],
    spawnZ: 0,
    rowIndex: 0,
    lastWallRow: -10,
    reachable: [true, true, true],
    biome: 0,
    biomeBlend: 1,
    lastTime: 0,
    elapsed: 0,
    scroll: 0,
    flowRate: 1,
    flowPhase: 0,
    qualityWarmup: 0,
    qualityHold: 0,
    runTime: 0,
    milestone: 0,
    best: { score: 0, distance: 0, lotuses: 0 },
    quality: 1,
    fpsAverage: 60,
    hintShown: false,
  };

  /* ------------------------------------------------------------------ *
   * Утилиты                                                             *
   * ------------------------------------------------------------------ */

  const MESH_RANGE = -168;   // дальше этой отметки предметы ещё не рисуются
  const SCROLL_TILE = 250;   // длина повторяющегося участка берега

  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const mix = (a, b, t) => a + (b - a) * t;
  const damp = (current, target, speed, dt) => mix(current, target, 1 - Math.exp(-speed * dt));
  const hash = (value, salt = 0) => {
    const x = Math.sin(value * 91.733 + salt * 37.719) * 43758.5453;
    return x - Math.floor(x);
  };

  /*
    Русло прямое, и это осознанный размен. Пока берег «извивался» по z,
    растительность нельзя было гнать конвейером: сдвинутый куст переставал
    совпадать с линией песка. Извив давал 5% полуширины и почти не читался,
    а движение берега — единственное, что создаёт ощущение хода вперёд.
  */
  function riverCenter() {
    return 0;
  }

  function bankRise(offset) {
    const o = Math.max(0, offset);
    return Math.min(2.1, .02 + o * .092 - o * o * .0012);
  }

  function riverHalf() {
    return RIVER_HALF;
  }

  function haptic(type = 'light') {
    try { window.Telegram?.WebApp?.HapticFeedback?.impactOccurred?.(type); } catch {}
  }

  function readBest() {
    try {
      const raw = localStorage.getItem(BEST_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed.score === 'number') state.best = parsed;
    } catch {}
  }

  function writeBest() {
    try { localStorage.setItem(BEST_KEY, JSON.stringify(state.best)); } catch {}
  }

  function setBadge(mode) {
    if (!dom.badge) return;
    dom.badge.textContent = `${VERSION} · ${mode}`;
    dom.badge.dataset.state = 'ready';
  }

  /* Всплывающая плашка: веха дистанции, смена биома, потеря сердца. */
  function toast(title, subtitle = '', tone = 'gold') {
    if (!dom.toast) return;
    const node = document.createElement('div');
    node.className = `toast toast-${tone}`;
    node.innerHTML = `<b></b>${subtitle ? '<span></span>' : ''}`;
    node.querySelector('b').textContent = title;
    if (subtitle) node.querySelector('span').textContent = subtitle;
    dom.toast.appendChild(node);
    // Больше двух плашек сразу — это уже занавес поверх реки. Самая старая
    // уходит немедленно, чтобы столбик никогда не дорастал до горизонта.
    while (dom.toast.childElementCount > 2) dom.toast.firstElementChild.remove();
    requestAnimationFrame(() => node.classList.add('is-in'));
    setTimeout(() => {
      node.classList.remove('is-in');
      setTimeout(() => node.remove(), 420);
    }, 1450);
  }

  /* Короткая цветная вспышка поверх сцены. */
  function flash(color, duration = 380) {
    if (!dom.grade) return;
    dom.grade.style.setProperty('--flash', color);
    dom.grade.classList.add('is-flash');
    clearTimeout(flash.timer);
    flash.timer = setTimeout(() => dom.grade.classList.remove('is-flash'), duration);
  }

  /* ------------------------------------------------------------------ *
   * 3. Рендер и качество                                                *
   * ------------------------------------------------------------------ */

  let scene = null;
  let camera = null;
  let renderer = null;
  let fx = null;
  let water = null;
  let waterMaterial = null;
  let waterSheen = null;
  let waterPositions = null;
  let waterBaseY = null;
  let waterNormal = null;
  let waterDetailNormal = null;
  let shorelines = [];
  let scrollLayers = [];
  let bankMaterials = [];
  let sky = null;
  let dustSheets = [];
  let godrays = null;
  let sun = null;
  let hemi = null;
  let rimLight = null;
  let backLight = null;
  let player = null;
  let basketVisual = null;
  let wake = null;
  let shieldBubble = null;
  let decor = [];
  let birds = [];
  let fallbackContext = null;
  let fallbackFrame = 0;
  let shadowsOn = false;

  const timeUniform = { value: 0 };
  const windUniform = { value: 1 };
  // Прокрутка мира в метрах. По ней вершинный шейдер ленты песка поднимает
  // барханы, поэтому рельеф едет вместе с растительностью, а не стоит.
  const duneScrollUniform = { value: 0 };
  const currentLook = {
    fog: null, fogNear: 54, fogFar: 248,
    hemiSky: null, hemiGround: null, hemiPower: .86,
    sunColor: null, sunPower: .9,
    water: null, sky: null, exposure: .96,
  };

  function detectTier() {
    const dpr = window.devicePixelRatio || 1;
    const cores = navigator.hardwareConcurrency || 4;
    const wide = Math.max(window.innerWidth, window.innerHeight);
    if (wide >= 900 && cores >= 8) return 2;
    if (cores >= 6 && dpr <= 2.5) return 1;
    return 0;
  }

  function tryCreateRenderer() {
    if (!THREE || !dom.canvas) return null;
    try {
      const attributes = { alpha: true, antialias: true, depth: true, stencil: false, powerPreference: 'high-performance' };
      const context = dom.canvas.getContext('webgl2', attributes) || dom.canvas.getContext('webgl', attributes);
      if (!context) return null;
      const next = new THREE.WebGLRenderer({ canvas: dom.canvas, context, alpha: true, antialias: true });
      next.setClearColor(0x000000, 0);
      next.setPixelRatio(Math.min(window.devicePixelRatio || 1, MAX_DPR));
      next.setSize(window.innerWidth, window.innerHeight, false);
      next.toneMapping = THREE.ACESFilmicToneMapping;
      next.toneMappingExposure = .96;
      if ('outputEncoding' in next) next.outputEncoding = THREE.sRGBEncoding;
      // Тени теперь есть на всех уровнях: слабым устройствам достаётся
      // меньшая карта и более дешёвая фильтрация, но объекты перестают висеть.
      shadowsOn = true;
      next.shadowMap.enabled = true;
      next.shadowMap.type = detectTier() >= 1 ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
      dom.canvas.addEventListener('webglcontextlost', (event) => {
        event.preventDefault();
        activateFallback('LITE READY');
      }, { passive: false });
      return next;
    } catch (error) {
      console.warn('[Moses] WebGL недоступен:', error?.message || error);
      return null;
    }
  }

  /*
    Менеджер качества. Если кадры проседают — снижаем плотность частиц,
    выключаем тени и режем разрешение. Если запас есть — возвращаем обратно.
  */
  /*
    Менеджер качества. Раньше он правил качество на каждом кадре: от единицы
    до минимума доходило за шесть кадров, и каждый шаг звал setPixelRatio —
    то есть переаллокацию буфера кадра. Шесть переаллокаций подряд на старте
    и дёрганье туда-сюда на границе порога сами по себе давали рывки.

    Теперь между правками есть пауза, первые секунды идут на замер, а шаг
    вниз делается сразу крупным: если кадр просел, надо отдать разрешение
    один раз, а не шесть.
  */
  function updateQuality(dt) {
    if (!renderer || state.fallback) return;
    const fps = 1 / Math.max(.001, dt);
    state.fpsAverage = mix(state.fpsAverage, fps, .04);
    state.qualityWarmup = (state.qualityWarmup || 0) + dt;
    if (state.qualityWarmup < 2.5) return;
    state.qualityHold = (state.qualityHold || 0) - dt;
    if (state.qualityHold > 0) return;
    if (state.fpsAverage < 46 && state.quality > .35) {
      state.quality = Math.max(.35, state.quality - .22);
      state.qualityHold = 2.2;
      applyQuality();
    } else if (state.fpsAverage > 57 && state.quality < 1) {
      state.quality = Math.min(1, state.quality + .1);
      state.qualityHold = 3.5;
      applyQuality();
    }
  }

  function applyQuality() {
    if (!renderer) return;
    // Нижняя граница опущена: на просевшем кадре разрешение — самый быстрый
    // рычаг, а прежние 0.72 почти ничего не отыгрывали.
    const ratio = Math.min(window.devicePixelRatio || 1, MAX_DPR) * mix(.55, 1, state.quality);
    renderer.setPixelRatio(ratio);
    fx?.setQuality?.(state.quality);
    fx?.setParticleScale?.(ratio);
    /*
      Тени снимаются раньше прежнего: это самая дорогая часть кадра, и
      когда счётчик уже просел, отдавать её надо первой, а не после того,
      как разрешение упало до половины.
    */
    if (state.quality < .84 && renderer.shadowMap.enabled) {
      renderer.shadowMap.enabled = false;
      shadowsOn = false;
      if (sun) sun.castShadow = false;
    }
  }

  /*
    Счётчик незавершённых загрузок текстур. Кнопка «Отплыть» ждёт нуля:
    раньше сцена собиралась мгновенно, а карты песка, воды и камня приезжали
    уже во время заплыва — каждая догрузка перекомпилировала материал и
    кадр вставал колом.
  */
  let texturesPending = 0;
  let texturesTotal = 0;
  const textureWaiters = [];
  function textureSettled() {
    texturesPending = Math.max(0, texturesPending - 1);
    onTextureProgress?.();
    if (texturesPending === 0) {
      while (textureWaiters.length) textureWaiters.pop()();
    }
  }
  /*
    Пока карты песка, воды и камня едут, полоса загрузки идёт по-настоящему:
    доля посчитанных к общему числу заявленных. Раньше на этом шаге экран
    просто замирал на одной надписи, и загрузка выглядела зависшей.
  */
  let onTextureProgress = null;
  function waitForTextures(timeout = 9000, onProgress = null) {
    onTextureProgress = onProgress;
    if (texturesPending === 0) { onTextureProgress = null; return Promise.resolve(); }
    onProgress?.();
    return new Promise((resolve) => {
      const done = () => { clearTimeout(timer); onTextureProgress = null; resolve(); };
      const timer = setTimeout(() => {
        const at = textureWaiters.indexOf(done);
        if (at >= 0) textureWaiters.splice(at, 1);
        onTextureProgress = null;
        resolve();
      }, timeout);
      textureWaiters.push(done);
    });
  }

  function makeTexture(path, repeatX, repeatY, material, kind = 'map', onLoad = null) {
    const loader = new THREE.TextureLoader();
    texturesPending += 1;
    texturesTotal += 1;
    loader.load(path, (texture) => {
      texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
      texture.repeat.set(repeatX, repeatY);
      texture.anisotropy = Math.min(4, renderer?.capabilities?.getMaxAnisotropy?.() || 2);
      if (kind === 'map' && 'encoding' in texture) texture.encoding = THREE.sRGBEncoding;
      if (material) {
        material[kind] = texture;
        if (kind === 'normalMap') {
          const strength = material.userData.normalStrength || .34;
          material.normalScale = new THREE.Vector2(strength, strength);
        }
        material.needsUpdate = true;
      }
      onLoad?.(texture);
      textureSettled();
    }, undefined, () => { textureSettled(); });
  }

  /* ------------------------------------------------------------------ *
   * 4. Сцена                                                            *
   * ------------------------------------------------------------------ */

  /*
    Дно Нила. Раньше под водой не было ничего — река читалась как крашеная
    плоскость. Здесь лежит настоящая фотограмметрия из проверенного пакета:
    речная галька у стрежня и мокрый ил ближе к берегам. Дно опущено под
    воду, поэтому проступает ровно настолько, насколько её пропускает
    прозрачность, и заметнее всего на мелководье.
  */
  function buildRiverBed() {
    const zSegments = 60;
    const xSegments = 12;
    const positions = [];
    const uvs = [];
    const indices = [];
    for (let iz = 0; iz <= zSegments; iz += 1) {
      const v = iz / zSegments;
      const z = mix(NEAR_Z + 8, FAR_Z, v);
      const center = riverCenter(z);
      const half = riverHalf(z) + 1.4;
      for (let ix = 0; ix <= xSegments; ix += 1) {
        const u = ix / xSegments;
        const across = (u - .5) * 2;
        // Русло корытом: у берегов мельче, посередине глубже.
        const depth = -.55 - (1 - across * across) * .85;
        positions.push(center + across * half, depth, z);
        uvs.push(u * 5, v * 46);
      }
    }
    const row = xSegments + 1;
    for (let iz = 0; iz < zSegments; iz += 1) {
      for (let ix = 0; ix < xSegments; ix += 1) {
        const a = iz * row + ix;
        indices.push(a, a + row, a + 1, a + 1, a + row, a + row + 1);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    const material = new THREE.MeshStandardMaterial({
      color: 0x6f6a4e,
      roughness: 1,
      metalness: 0,
    });
    material.userData.normalStrength = 1.1;
    makeTexture('textures/terrain/rock-color.jpg', 5, 46, material);
    makeTexture('textures/terrain/rock-normal.jpg', 5, 46, material, 'normalMap');
    makeTexture('textures/terrain/rock-orm.jpg', 5, 46, material, 'roughnessMap');
    const bed = new THREE.Mesh(geometry, material);
    bed.name = 'V751NileBed';
    bed.receiveShadow = true;
    bed.renderOrder = 0;
    scene.add(bed);
    bankMaterials.push({ material, metresPerRepeat: (NEAR_Z + 8 - FAR_Z) / 46 });
  }

  function buildWater() {
    buildRiverBed();
    const zSegments = 150;
    const xSegments = 22;
    const vertices = [];
    const uv = [];
    const indices = [];
    for (let iz = 0; iz <= zSegments; iz += 1) {
      const v = iz / zSegments;
      const z = mix(NEAR_Z + 8, FAR_Z, v);
      const center = riverCenter(z);
      const half = riverHalf(z);
      for (let ix = 0; ix <= xSegments; ix += 1) {
        const u = ix / xSegments;
        vertices.push(center + mix(-half, half, u), -.055, z);
        uv.push(u, v);
      }
    }
    const row = xSegments + 1;
    for (let z = 0; z < zSegments; z += 1) {
      for (let x = 0; x < xSegments; x += 1) {
        const a = z * row + x;
        const b = a + 1;
        const c = a + row;
        const d = c + 1;
        indices.push(a, c, b, b, c, d);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
    waterPositions = geometry.attributes.position;
    waterBaseY = new Float32Array(waterPositions.count);
    for (let i = 0; i < waterPositions.count; i += 1) waterBaseY[i] = waterPositions.getY(i);

    waterMaterial = window.NileShaders?.createRiverMaterial?.(THREE, { opacity: .34 });
    if (!waterMaterial) {
      waterMaterial = new THREE.MeshStandardMaterial({
        color: 0x4d5730, roughness: .5, metalness: .05,
        transparent: true, opacity: .3, depthWrite: false, side: THREE.DoubleSide,
      });
    }
    water = new THREE.Mesh(geometry, waterMaterial);
    water.name = 'MosesV75SiltyNile';
    water.receiveShadow = true;
    water.renderOrder = 0;
    water.frustumCulled = false;
    scene.add(water);

    // Две карты нормалей из пакета текстур. Их смещения ползут в разные
    // стороны и передаются в шейдер как uOffsetA/uOffsetB.
    const normalHolder = { userData: {} };
    makeTexture('textures/water/water-normal-primary.jpg', 1, 1, normalHolder, 'normalMap', (texture) => {
      waterNormal = texture;
      if (waterMaterial.uniforms) {
        waterMaterial.uniforms.uNormalA.value = texture;
        waterMaterial.uniforms.uHasNormals.value = 1;
      }
    });
    const detailHolder = { userData: {} };
    makeTexture('textures/water/water-normal-detail.jpg', 1, 1, detailHolder, 'normalMap', (texture) => {
      waterDetailNormal = texture;
      if (waterMaterial.uniforms) waterMaterial.uniforms.uNormalB.value = texture;
    });

    const sheenMaterial = window.NileShaders?.createSheenMaterial?.(THREE, { strength: .2 });
    if (sheenMaterial) {
      waterSheen = new THREE.Mesh(geometry, sheenMaterial);
      waterSheen.name = 'MosesV751WaterReliefDetail';
      waterSheen.position.y = .012;
      waterSheen.renderOrder = 2;
      waterSheen.frustumCulled = false;
      scene.add(waterSheen);
    }
  }

  /*
    Берег строится лентами вдоль русла. Градиент «мокро — сухо» лежит в
    вершинных цветах: это надёжнее инъекций в шейдер стандартного материала,
    потому что не зависит от того, доехала ли текстура.
  */
  /*
    Рельеф песка поперёк берега. У самой воды он плоский, дальше от русла
    поднимается барханами — амплитуда растёт с удалением. Без него берег был
    ровной наклонной пластиной: карта нормалей на двух вершинах не читалась.
  */
  /*
    Рельеф песка. Прежняя версия поднимала только дальние барханы, а полоса у
    самой воды — та, что и видна из-за корзинки, — оставалась идеально ровной
    и читалась пластилиновой плитой. У кромки есть мелкая рябь мокрого песка
    (её и намывает волна), а барханы начинаются ближе и выше.

    Все частоты кратны 2π/SCROLL_TILE, то есть рельеф периодичен по длине
    тайла прокрутки. Это обязательное условие: лента песка неподвижна и
    поднимает барханы в вершинном шейдере по координате zLocal = z − scroll,
    а растительность стоит в тайлах, которые едут навстречу. Совпадать они
    будут только если бархан повторяется ровно через тайл — иначе на стыке
    песок дёрнется, а деревья нет.
  */
  const DUNE_K = (Math.PI * 2) / SCROLL_TILE;

  function duneHeight(offset, z, side) {
    const near = clamp((offset + .8) / 2.6, 0, 1) * clamp(1 - (offset - 3.2) / 4, 0, 1);
    const ripple = (Math.sin(z * DUNE_K * 22 + offset * 1.2 + side * 2.3) * .07
      + Math.sin(z * DUNE_K * 46 - offset * 2.1 + side) * .04
      + Math.sin(z * DUNE_K * 12 + offset * 3.4) * .05) * near;
    const away = Math.max(0, offset - 1.6);
    const amplitude = Math.min(4.4, away * .24);
    const dunes = (Math.sin(z * DUNE_K * 3 + offset * .42 + side * 1.7) * .55
      + Math.sin(z * DUNE_K - offset * .21 + side * .6) * .45
      + Math.sin(z * DUNE_K * 8 + offset * .9) * .18
      + Math.sin(z * DUNE_K * 17 + offset * 1.7 + side) * .08) * amplitude;
    return ripple + dunes;
  }

  /* Тот же рельеф на GLSL — один в один с duneHeight выше. */
  const DUNE_GLSL = `
    uniform float uDuneScroll;
    uniform float uDuneSide;
    attribute float aDuneOffset;
    varying float vDuneCrest;
    float nileDune(float offset, float z, float side) {
      float near = clamp((offset + 0.8) / 2.6, 0.0, 1.0) * clamp(1.0 - (offset - 3.2) / 4.0, 0.0, 1.0);
      float k = ${DUNE_K.toFixed(9)};
      float ripple = (sin(z * k * 22.0 + offset * 1.2 + side * 2.3) * 0.07
        + sin(z * k * 46.0 - offset * 2.1 + side) * 0.04
        + sin(z * k * 12.0 + offset * 3.4) * 0.05) * near;
      float away = max(0.0, offset - 1.6);
      float amplitude = min(4.4, away * 0.24);
      float dunes = (sin(z * k * 3.0 + offset * 0.42 + side * 1.7) * 0.55
        + sin(z * k - offset * 0.21 + side * 0.6) * 0.45
        + sin(z * k * 8.0 + offset * 0.9) * 0.18
        + sin(z * k * 17.0 + offset * 1.7 + side) * 0.08) * amplitude;
      return ripple + dunes;
    }
  `;

  /*
    Поднимает барханы на ленте песка в вершинном шейдере. Раньше рельеф был
    запечён в геометрию: лента стояла на месте, а растительность ехала — и
    пальмы с кустами проходили сквозь неподвижные холмы песка. Теперь холмы
    едут с той же прокруткой, что и растения, и остаются под ними.

    Нормаль считается конечными разностями по той же функции: без этого свет
    ложился бы на плоскую ленту и рельефа не было бы видно.
  */
  function applyDuneRelief(material, side) {
    const sideUniform = { value: side };
    window.NileMaterials?.chainOnBeforeCompile?.(material, (shader) => {
      shader.uniforms.uDuneScroll = duneScrollUniform;
      shader.uniforms.uDuneSide = sideUniform;
      shader.vertexShader = `${DUNE_GLSL}\n${shader.vertexShader}`.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
         float nileZ = transformed.z - uDuneScroll;
         float nileH = nileDune(aDuneOffset, nileZ, uDuneSide);
         transformed.y += nileH;
         float nileE = 0.6;
         float nileDx = (nileDune(aDuneOffset + nileE, nileZ, uDuneSide)
           - nileDune(aDuneOffset - nileE, nileZ, uDuneSide)) / (2.0 * nileE);
         float nileDz = (nileDune(aDuneOffset, nileZ + nileE, uDuneSide)
           - nileDune(aDuneOffset, nileZ - nileE, uDuneSide)) / (2.0 * nileE);
         objectNormal = normalize(vec3(-nileDx * uDuneSide, 1.0, -nileDz));
         vNormal = normalize(normalMatrix * objectNormal);
         vDuneCrest = nileH;`,
      );
      shader.fragmentShader = `varying float vDuneCrest;\n${shader.fragmentShader}`.replace(
        '#include <color_fragment>',
        `#include <color_fragment>
         // Гребни выгорают и светлеют, во впадинах песок плотнее и темнее.
         float nileCrest = clamp(vDuneCrest / 2.6, -1.0, 1.0);
         diffuseColor.rgb *= 1.0 + nileCrest * 0.17;
         diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.04, 1.0, 0.93), max(nileCrest, 0.0));`,
      );
    });
    return material;
  }

  function buildRibbon(name, side, innerOffset, outerOffset, colors, texturePath, normalPath, yOffset = 0, opacity = .38, cross = 6) {
    // Шаг вдоль русла — около полутора метров: на прежних 130 сегментах рябь
    // у кромки просто не попадала в сетку и песок оставался плоским.
    const segments = 210;
    const positions = [];
    const uvs = [];
    const colorData = [];
    const offsets = [];
    const indices = [];
    const inner = new THREE.Color(colors[0]);
    const outer = new THREE.Color(colors[1]);
    const tone = new THREE.Color();
    // Примерно три метра на один оборот текстуры — так песок читается зерном.
    const crossRepeat = Math.max(1, (outerOffset - innerOffset) / 3);
    for (let i = 0; i <= segments; i += 1) {
      const v = i / segments;
      const z = mix(NEAR_Z + 9, FAR_Z, v);
      const center = riverCenter(z);
      const half = riverHalf(z);
      const edgeNoise = (hash(i, innerOffset * 13) - .5) * .34;
      const baseY = -.035 + yOffset + Math.sin(z * .047 + side) * .022;
      for (let j = 0; j <= cross; j += 1) {
        const u = j / cross;
        const offset = mix(innerOffset, outerOffset, u);
        const x = center + side * (half + offset + edgeNoise * mix(1, .55, u));
        const lift = hash(i * 7 + j, outerOffset * 7) * .06 * u;
        // Барханы больше не запекаются в геометрию: их поднимает вершинный
        // шейдер по прокрученной координате, иначе неподвижный песок
        // расходится с едущей растительностью.
        positions.push(x, baseY + bankRise(offset) + lift, z);
        offsets.push(offset);
        // Тайлинг поперёк считается по реальной ширине полосы: раньше одна
        // фотография песка растягивалась на все 26 метров и читалась
        // пластилином, а не песком.
        uvs.push(u * crossRepeat, v * 52);
        tone.copy(inner).lerp(outer, u);
        colorData.push(tone.r, tone.g, tone.b);
      }
    }
    const row = cross + 1;
    for (let i = 0; i < segments; i += 1) {
      for (let j = 0; j < cross; j += 1) {
        const a = i * row + j;
        const b = a + 1;
        const c = a + row;
        const d = c + 1;
        if (side < 0) indices.push(a, c, b, b, c, d);
        else indices.push(a, b, c, b, d, c);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colorData, 3));
    geometry.setAttribute('aDuneOffset', new THREE.Float32BufferAttribute(offsets, 1));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    // Барханы поднимаются в шейдере, поэтому оболочка выходит за плоскую
    // сетку — иначе лента исчезала бы на подъёме бархана над камерой.
    geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, (NEAR_Z + FAR_Z) / 2), 900);
    const material = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: .96,
      metalness: 0,
      side: THREE.DoubleSide,
      transparent: opacity < 1,
      opacity,
      depthWrite: opacity >= 1,
    });
    material.userData.normalStrength = 1.35;
    if (texturePath) makeTexture(texturePath, 1, 52, material);
    if (normalPath) makeTexture(normalPath, 1, 52, material, 'normalMap');
    // Отражения неба по касательной: сухой песок на солнце заметно светлеет.
    window.NileMaterials?.addSkyReflection?.(material, { strength: .18 });
    applyDuneRelief(material, side);
    const ribbon = new THREE.Mesh(geometry, material);
    ribbon.name = name;
    ribbon.receiveShadow = true;
    ribbon.renderOrder = 1;
    scene.add(ribbon);
    // Сама лента статична, движение песка показывает бегущая текстура.
    bankMaterials.push({ material, metresPerRepeat: (NEAR_Z + 9 - FAR_Z) / 52 });
    return ribbon;
  }

  function buildShoreline(side) {
    const material = window.NileShaders?.createShorelineMaterial?.(THREE);
    if (!material) return;
    const segments = 120;
    const positions = [];
    const uvs = [];
    const indices = [];
    for (let i = 0; i <= segments; i += 1) {
      const v = i / segments;
      const z = mix(NEAR_Z + 8, FAR_Z, v);
      const center = riverCenter(z);
      const half = riverHalf(z);
      positions.push(center + side * (half - .55), .01, z, center + side * (half + .75), .03, z);
      uvs.push(0, v * 26, 1, v * 26);
      if (i < segments) {
        const a = i * 2;
        indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = 'V751ShorelineFoam';
    mesh.renderOrder = 3;
    mesh.frustumCulled = false;
    scene.add(mesh);
    shorelines.push(mesh);
  }

  function buildBanks() {
    for (const side of [-1, 1]) {
      buildRibbon('V751DampShore', side, -.1, 1.15, [0x5f5740, 0x8d8264], 'textures/terrain/damp-sand-color.jpg', 'textures/terrain/damp-sand-normal.jpg', .006, 1);
      buildRibbon('V751WarmSand', side, 1.10, 4.2, [0xa89777, 0xc9b894], 'textures/terrain/sand-color.jpg', 'textures/terrain/sand-normal.jpg', .028, 1);
      buildRibbon('V751PebbleBank', side, 4.1, 26, [0xb3a487, 0xc6b898], 'textures/terrain/pebbles-color.jpg', 'textures/terrain/pebbles-normal.jpg', .06, 1, 9);
      buildShoreline(side);
    }
  }

  function makeInstanced(geometry, material, count, name) {
    const mesh = new THREE.InstancedMesh(geometry, material, count);
    mesh.name = name;
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    return mesh;
  }

  function windMaterial(options) {
    const { wind = 1, ...params } = options;
    const material = new THREE.MeshStandardMaterial(params);
    window.NileShaders?.applyWind?.(THREE, material, timeUniform, windUniform, wind);
    return material;
  }

  /*
    Берег засаживается инстансами. Если пакет моделей приехал, геометрия
    берётся прямо из лицензионных GLB (Quaternius) и раскладывается через
    InstancedMesh — один вызов отрисовки на материал вместо сотен объектов.
    Без пакета работают процедурные заглушки той же формы.
  */
  /*
    Палитра берега: стебли и листва по видам растений. Без неё тростник
    приезжал коричневым «деревом» из исходного набора моделей.
  */
  const BANK_TONES = {
    papyrus: { stem: 0x4a6128, leaf: 0x4f6b2c },
    broadleaf: { stem: 0x7c8a46, leaf: 0x8fa04f },
    bankPlant: { stem: 0x6f7a41, leaf: 0x86924c },
    grass: { stem: 0x8a8f56, leaf: 0x9aa05f },
    bush: { stem: 0x5e6a3a, leaf: 0x6e7b41 },
    palm: { stem: 0x7a5c36, leaf: 0x5f7a3c },
  };

  const BANK_SURFACES = {
    papyrus: 'foliage', reeds: 'foliage', broadleaf: 'foliage', bankPlant: 'foliage', grass: 'foliage',
    bush: 'foliage', flowers: 'foliage', palm: 'foliage', rock: 'granite', log: 'bark',
  };

  function extractInstanceParts(key, targetSize) {
    const source = window.assetManager?.models?.[key];
    if (!source) return null;
    source.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(source);
    const size = new THREE.Vector3();
    box.getSize(size);
    const center = new THREE.Vector3();
    box.getCenter(center);
    const maxDim = Math.max(size.x, size.y, size.z) || 1;
    const norm = targetSize / maxDim;
    const parts = [];
    source.traverse((child) => {
      if (!child.isMesh) return;
      const geometry = child.geometry.index ? child.geometry.toNonIndexed() : child.geometry.clone();
      const matrix = new THREE.Matrix4().makeScale(norm, norm, norm).multiply(child.matrixWorld);
      geometry.applyMatrix4(matrix);
      geometry.translate(-center.x * norm, -box.min.y * norm, -center.z * norm);
      geometry.computeBoundingSphere();
      const source = Array.isArray(child.material) ? child.material[0] : child.material;
      const material = source.clone();
      material.side = THREE.DoubleSide;
      // У Quaternius стебли покрашены в «дерево», и заросли папируса читались
      // как поле сухих прутьев. Тростнику и траве задаётся своя палитра.
      const tone = BANK_TONES[key]?.[/wood|trunk|bark/i.test(source.name || '') ? 'stem' : 'leaf'];
      if (tone) material.color = new THREE.Color(tone);
      else if (material.color) material.color.offsetHSL(.012, -.16, .02);
      if ('roughness' in material) material.roughness = Math.max(.85, material.roughness ?? .9);
      // Развёртка и процедурные карты: без них листва и камни остаются
      // плоской заливкой, из-за которой берег выглядел пластмассовым.
      window.NileMaterials?.dress?.(material, geometry, {
        // Поверхность задаётся видом растения, а не именем материала из GLB:
        // у Quaternius они называются Colormap/Material.001, и зелень
        // получала песчаниковую карту.
        surface: BANK_SURFACES[key],
        name: (Array.isArray(child.material) ? child.material[0] : child.material)?.name || child.name,
        uvScale: key === 'palm' ? .5 : .9,
        normalScale: .95,
        // Папирус — тонкие стебли, освещённые со всех сторон: отбеливание
        // выгоняло их в солому.
        bleach: key === 'papyrus' ? 0 : .1,
      });
      parts.push({ geometry, material });
    });
    return parts.length ? parts : null;
  }

  function buildInstancedLayer(spec) {
    const parts = extractInstanceParts(spec.key, spec.size)
      || (spec.fallbackParts ? spec.fallbackParts() : null)
      || [{ geometry: spec.fallbackGeometry(), material: spec.fallbackMaterial() }];
    const half = spec.count;
    const total = half * 2;
    const meshes = parts.map((part, index) => {
      if (spec.wind) window.NileShaders?.applyWind?.(THREE, part.material, timeUniform, windUniform, spec.wind);
      return makeInstanced(part.geometry, part.material, total, index ? `${spec.name}Part${index}` : spec.name);
    });
    const dummy = new THREE.Object3D();
    for (let i = 0; i < total; i += 1) {
      spec.place(i, dummy, half);
      dummy.updateMatrix();
      for (const mesh of meshes) mesh.setMatrixAt(i, dummy.matrix);
    }
    for (const mesh of meshes) {
      mesh.instanceMatrix.needsUpdate = true;
      mesh.castShadow = spec.castShadow ?? false;
      scene.add(mesh);
      scrollLayers.push(mesh);
    }
    return meshes;
  }

  /*
    Каждый слой раскладывается двумя копиями одного тайла: пока первая уезжает
    за камеру, вторая уже входит в кадр. Меш двигается целиком, поэтому
    прокрутка сотен растений стоит одного изменения position.z.
  */
  function bankPlace(i, dummy, options, half) {
    const index = i % half;
    const tile = i < half ? 0 : SCROLL_TILE;
    const side = index % 2 ? -1 : 1;
    const z = -hash(index, options.salt) * SCROLL_TILE - tile;
    const offset = options.near + hash(index, options.salt + 1) * (options.far - options.near);
    const x = side * (riverHalf() + offset);
    const scale = options.minScale + hash(index, options.salt + 2) * (options.maxScale - options.minScale);
    // Растения садятся на рельеф песка, иначе висят над барханами.
    dummy.position.set(x, options.lift + bankRise(offset) + duneHeight(offset, z, side), z);
    dummy.rotation.set(0, hash(index, options.salt + 3) * Math.PI * 2, (hash(index, options.salt + 4) - .5) * (options.tilt || 0));
    dummy.scale.set(scale, scale * (options.stretch || 1), scale);
  }

  /*
    Тростник по кромке берега. Из набора Quaternius сюда приезжал Plant_2 —
    широкие лопухи, читавшиеся как кукуруза. На Ниле растёт папирус: пучок
    трёхгранных стеблей без листьев, а вся масса собрана в зонтик из тонких
    лучей на верхушке. Поэтому куст собирается здесь, а не берётся из пакета.
    Стебли и зонтики разведены по двум материалам: у них разная жёсткость и
    разная реакция на ветер.
  */
  function mergeFromGroup(group) {
    group.updateMatrixWorld(true);
    const geometries = [];
    group.traverse((child) => {
      if (!child.isMesh) return;
      const geometry = child.geometry.toNonIndexed();
      geometry.applyMatrix4(child.matrixWorld);
      geometries.push(geometry);
    });
    return mergeGeometries(geometries);
  }

  function papyrusClumpParts() {
    const stalks = new THREE.Group();
    const crowns = new THREE.Group();
    const clump = 7;
    for (let i = 0; i < clump; i += 1) {
      const grown = i < 5;
      const height = grown ? 1.55 + hash(i, 301) * .72 : .55 + hash(i, 302) * .45;
      const angle = (i / clump) * Math.PI * 2 + hash(i, 303) * .9;
      const radius = .05 + hash(i, 304) * .17;
      const baseX = Math.cos(angle) * radius;
      const baseZ = Math.sin(angle) * radius;
      // Стебель наклонён наружу и слегка провисает под собственным весом.
      const lean = (.1 + hash(i, 305) * .22) * (grown ? 1 : .5);
      const segments = 4;
      let prevY = 0;
      let tipX = baseX;
      let tipZ = baseZ;
      for (let s = 0; s < segments; s += 1) {
        const t = s / segments;
        const segHeight = height / segments;
        const bend = lean * t * t;
        // Три радиальных сегмента — характерное трёхгранное сечение папируса.
        const seg = new THREE.Mesh(new THREE.CylinderGeometry(
          .034 * (1 - t * .48), .042 * (1 - t * .4), segHeight * 1.06, 3, 1,
        ));
        tipX = baseX + Math.cos(angle) * bend;
        tipZ = baseZ + Math.sin(angle) * bend;
        seg.position.set(tipX, prevY + segHeight * .5, tipZ);
        seg.rotation.set(Math.sin(angle) * lean * t * .6, angle, -Math.cos(angle) * lean * t * .6);
        stalks.add(seg);
        prevY += segHeight;
      }
      if (!grown) continue;
      // Зонтик: лучи расходятся от одной точки и опадают наружу и вниз.
      const rays = 15;
      for (let r = 0; r < rays; r += 1) {
        const spin = (r / rays) * Math.PI * 2 + hash(i, 306) * 2;
        const droop = .62 + hash(i * 7 + r, 307) * .3;
        const length = .38 + hash(i * 7 + r, 308) * .24;
        const ray = new THREE.Mesh(new THREE.CylinderGeometry(.011, .004, length, 3, 1));
        ray.position.set(
          tipX + Math.cos(spin) * length * .42,
          prevY + Math.cos(droop) * length * .42,
          tipZ + Math.sin(spin) * length * .42,
        );
        ray.rotation.set(Math.sin(spin) * droop, -spin, -Math.cos(spin) * droop);
        crowns.add(ray);
        // Колосок на конце луча: он и даёт папирусу пушистый силуэт.
        const seed = new THREE.Mesh(new THREE.SphereGeometry(.028, 5, 4));
        seed.position.set(
          tipX + Math.cos(spin) * length * .86,
          prevY + Math.cos(droop) * length * .86 - .02,
          tipZ + Math.sin(spin) * length * .86,
        );
        crowns.add(seed);
      }
    }

    const stalkMaterial = new THREE.MeshStandardMaterial({ color: 0x7d8b4a, roughness: .96, side: THREE.DoubleSide });
    const crownMaterial = new THREE.MeshStandardMaterial({ color: 0x9aa458, roughness: .99, side: THREE.DoubleSide });
    const parts = [
      { geometry: mergeFromGroup(stalks), material: stalkMaterial },
      { geometry: mergeFromGroup(crowns), material: crownMaterial },
    ];
    for (const part of parts) {
      window.NileMaterials?.dress?.(part.material, part.geometry, {
        surface: 'foliage', uvScale: 1.6, normalScale: .8, bleach: .06, roughness: .97,
      });
    }
    return parts;
  }

  function buildBankDetail() {
    const tier = detectTier();
    /*
      Плотность берега. На старших телефонах прежние 1.9 давали около
      миллиона треугольников в кадре — отсюда и рывки. Замер: папирус один
      съедал больше сорока процентов сцены.
    */
    const density = tier >= 2 ? 1.4 : tier >= 1 ? 1.05 : .65;
    const grassGeometry = () => {
      const geometry = new THREE.ConeGeometry(.2, .82, 5, 2);
      geometry.translate(0, .41, 0);
      return geometry;
    };
    const reedGeometry = () => {
      const geometry = new THREE.CylinderGeometry(.012, .038, 2.45, 5, 3);
      geometry.translate(0, 1.22, 0);
      return geometry;
    };
    const palmGeometry = () => {
      const group = new THREE.Group();
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(.12, .26, 5.2, 7));
      trunk.position.y = 2.6;
      group.add(trunk);
      for (let f = 0; f < 7; f += 1) {
        const frond = new THREE.Mesh(new THREE.ConeGeometry(.34, 2.5, 4, 1));
        const angle = (f / 7) * Math.PI * 2;
        frond.position.set(Math.cos(angle) * .95, 5.5, Math.sin(angle) * .95);
        frond.rotation.set(Math.PI * .42, -angle, 0);
        frond.rotation.z = .5;
        group.add(frond);
      }
      group.updateMatrixWorld(true);
      const geometries = [];
      group.traverse((child) => {
        if (!child.isMesh) return;
        const geometry = child.geometry.toNonIndexed();
        geometry.applyMatrix4(child.matrixWorld);
        geometries.push(geometry);
      });
      return mergeGeometries(geometries);
    };

    const specs = [
      {
        // В кусте семь стеблей, поэтому кустов нужно втрое меньше прежних
        // одиночных прутьев: иначе кромка превращалась в сплошную изгородь и
        // песка за ней было не видно. Полоса заодно расширена вглубь берега.
        // Настоящий папирус: пятнадцать стеблей с зонтиками одной моделью.
        // Куст плотнее собственной геометрии, поэтому кустов нужно меньше.
        key: 'papyrus', name: 'V751PapyrusBank', size: 2.9, wind: 1.6,
        count: Math.round(38 * density),
        fallbackParts: papyrusClumpParts,
        fallbackGeometry: reedGeometry,
        fallbackMaterial: () => new THREE.MeshStandardMaterial({ color: 0x6d7a48, roughness: .98 }),
        place: (i, dummy, half) => bankPlace(i, dummy, { salt: 1, zFrom: 4, zSpan: 258, near: -.5, far: 3.4, lift: .02, minScale: .75, maxScale: 1.7, tilt: .16, stretch: 1.2 }, half),
      },
      {
        // Широколистный Plant_2 из пакета ушёл вглубь берега: у самой воды он
        // читался как кукуруза, а в подлеске за папирусом он на своём месте.
        key: 'broadleaf', name: 'V751BankBroadleaf', size: 1.45, wind: 1.1,
        count: Math.round(64 * density),
        fallbackGeometry: grassGeometry,
        fallbackMaterial: () => new THREE.MeshStandardMaterial({ color: 0x687444, roughness: 1 }),
        place: (i, dummy, half) => bankPlace(i, dummy, { salt: 97, zFrom: 3, zSpan: 259, near: 3.4, far: 11, lift: .04, minScale: .7, maxScale: 1.4, tilt: .12 }, half),
      },
      {
        key: 'bankPlant', name: 'V75BankPlants', size: 1.7, wind: 1.2,
        count: Math.round(78 * density),
        fallbackGeometry: grassGeometry,
        fallbackMaterial: () => new THREE.MeshStandardMaterial({ color: 0x5f6b3e, roughness: 1 }),
        place: (i, dummy, half) => bankPlace(i, dummy, { salt: 7, zFrom: 3, zSpan: 260, near: 1.2, far: 5.4, lift: .04, minScale: .7, maxScale: 1.5, tilt: .1 }, half),
      },
      {
        key: 'grass', name: 'V75GrassInstanced', size: 1.15, wind: 1,
        count: Math.round(165 * density),
        fallbackGeometry: grassGeometry,
        fallbackMaterial: () => new THREE.MeshStandardMaterial({ color: 0x7a7e54, roughness: 1 }),
        place: (i, dummy, half) => bankPlace(i, dummy, { salt: 13, zFrom: 3, zSpan: 262, near: 1.5, far: 17, lift: .05, minScale: .6, maxScale: 1.8 }, half),
      },
      {
        key: 'bush', name: 'V75BushesInstanced', size: 1.6, wind: .6,
        count: Math.round(58 * density),
        fallbackGeometry: () => new THREE.IcosahedronGeometry(.48, 1),
        fallbackMaterial: () => new THREE.MeshStandardMaterial({ color: 0x5a6440, roughness: 1, flatShading: true }),
        place: (i, dummy, half) => bankPlace(i, dummy, { salt: 20, zFrom: 2, zSpan: 262, near: 6, far: 25, lift: .04, minScale: .6, maxScale: 2.6 }, half),
      },
      {
        key: 'rock', name: 'V75RocksInstanced', size: 1.05, wind: 0,
        count: Math.round(82 * density),
        fallbackGeometry: () => new THREE.IcosahedronGeometry(.5, 1),
        fallbackMaterial: () => new THREE.MeshStandardMaterial({ color: 0x7d6e58, roughness: 1, flatShading: true }),
        place: (i, dummy, half) => bankPlace(i, dummy, { salt: 31, zFrom: 2, zSpan: 262, near: -.2, far: 26, lift: .02, minScale: .3, maxScale: 2.4, tilt: .5, stretch: .7 }, half),
      },
      {
        key: 'flowers', name: 'V75BankFlowers', size: .95, wind: 1.3,
        count: Math.round(72 * density),
        fallbackGeometry: () => {
          const geometry = new THREE.ConeGeometry(.12, .38, 5, 1);
          geometry.translate(0, .19, 0);
          return geometry;
        },
        fallbackMaterial: () => new THREE.MeshStandardMaterial({ color: 0xc98aa4, roughness: .85 }),
        place: (i, dummy, half) => bankPlace(i, dummy, { salt: 61, zFrom: 3, zSpan: 258, near: .4, far: 4.2, lift: .03, minScale: .7, maxScale: 1.6 }, half),
      },
      {
        key: 'palm', name: 'V75PalmCrowns', size: 11.5, wind: .55, castShadow: false,
        count: Math.round(24 * density),
        fallbackGeometry: palmGeometry,
        fallbackMaterial: () => new THREE.MeshStandardMaterial({ color: 0x4d6234, roughness: .96, flatShading: true }),
        place: (i, dummy, half) => bankPlace(i, dummy, { salt: 41, zFrom: -10, zSpan: 236, near: 9, far: 27, lift: .05, minScale: .7, maxScale: 1.3, tilt: .16 }, half),
      },
    ];
    for (const spec of specs) buildInstancedLayer(spec);
  }

  /*
    Пирамиды на горизонте. В буре они читаются силуэтом, поэтому это
    самосветящийся материал без тумана: цвет берётся от дымки и затемняется.
    Через туман они бы просто слились с небом.
  */
  /**
   * Оболочка вращения по набору сечений: сечение задаётся суперэллипсом,
   * поэтому одной функцией получаются и ступенчатая пирамида (степень 1 и
   * четыре сегмента дают квадрат), и округлая туша бегемота.
   */
  function loft(sections, radialSegments = 20, { capFront = true, capBack = true } = {}) {
    const positions = [];
    const uvs = [];
    const indices = [];
    const rings = sections.length;
    for (let s = 0; s < rings; s += 1) {
      const section = sections[s];
      const power = section.power ?? .78;
      const belly = section.belly ?? 1;
      for (let i = 0; i <= radialSegments; i += 1) {
        const angle = (i / radialSegments) * Math.PI * 2;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        const x = section.rx * Math.sign(cos) * Math.pow(Math.abs(cos), power);
        let y = section.ry * Math.sign(sin) * Math.pow(Math.abs(sin), power);
        if (y < 0) y *= belly;
        positions.push(x, section.y + y, section.z);
        uvs.push(i / radialSegments, s / Math.max(1, rings - 1));
      }
    }
    const row = radialSegments + 1;
    for (let s = 0; s < rings - 1; s += 1) {
      for (let i = 0; i < radialSegments; i += 1) {
        const a = s * row + i;
        // Обход против часовой стрелки: иначе нормали смотрят внутрь.
        indices.push(a, a + 1, a + row, a + 1, a + row + 1, a + row);
      }
    }
    const addCap = (ringIndex, forward) => {
      const section = sections[ringIndex];
      const center = positions.length / 3;
      positions.push(0, section.y, section.z);
      uvs.push(.5, ringIndex / Math.max(1, rings - 1));
      const base = ringIndex * row;
      for (let i = 0; i < radialSegments; i += 1) {
        if (forward) indices.push(center, base + i, base + i + 1);
        else indices.push(center, base + i + 1, base + i);
      }
    };
    if (capBack) addCap(0, false);
    if (capFront) addCap(rings - 1, true);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    return geometry;
  }

  /**
   * Ступенчатая кладка: каждый ряд даёт вертикальную стену и горизонтальную
   * приступку. Ряды намеренно мелкие — вблизи видна кладка, издали силуэт
   * остаётся гладким и не превращается в «ёлку», как было у четырёх ярусов.
   */
  function stepPyramidGeometry(baseHalf, height, courses) {
    const sections = [];
    const courseHeight = height / courses;
    for (let i = 0; i < courses; i += 1) {
      const radius = baseHalf * (1 - i / courses);
      const nextRadius = baseHalf * (1 - (i + 1) / courses);
      const bottom = i * courseHeight;
      const top = bottom + courseHeight * .94;
      sections.push({ z: bottom, y: 0, rx: radius, ry: radius, power: 1 });
      sections.push({ z: top, y: 0, rx: radius * .997, ry: radius * .997, power: 1 });
      sections.push({ z: top, y: 0, rx: nextRadius, ry: nextRadius, power: 1 });
    }
    sections.push({ z: height, y: 0, rx: baseHalf * .01, ry: baseHalf * .01, power: 1 });
    const geometry = loft(sections, 4, { capFront: true, capBack: true });
    geometry.rotateX(-Math.PI / 2);
    geometry.rotateY(Math.PI / 4);
    geometry.computeVertexNormals();
    return geometry;
  }

  function buildPyramids() {
    /*
      Раньше это были плоские самосветящиеся конусы с раскраской по вершинам —
      издали они читались как бумажные треугольники. Теперь у пирамид
      настоящая ступенчатая кладка, песчаниковые PBR-карты и остатки
      полированной облицовки на вершине, как у пирамиды Хафра. Закатная
      раскраска сохранена в вершинных цветах и домножается на текстуру.
    */
    /*
      Пирамиды — дальний фон, а не декорация у самой воды: раньше они стояли
      в сотне метров, перекрывали полкадра и спорили с рекой. Теперь они
      отнесены за горизонтальные дюны, которые закрывают их основания, и
      растворяются в дымке тем сильнее, чем дальше стоят (параметр shade).
      Центр кадра по-прежнему оставлен руслу.
    */
    const specs = [
      // x, z, полуоснование, высота, рядов кладки, доля облицовки, дымка.
      // Пропорции взяты у настоящей группы в Гизе: отношение высоты к
      // половине основания около 1.27, а не «остроконечная ёлка».
      // Хеопса, Хефрена (с остатками облицовки на вершине) и Микерина.
      [-64, -424, 40, 51, 32, 0, .60],
      [22, -458, 37, 47, 30, .22, .52],
      [82, -482, 19, 24, 20, 0, .44],
    ];
    const sunDir = new THREE.Vector3(-.62, .34, .71).normalize();
    const shadowTint = new THREE.Vector3(.46, .49, .60);
    const sunTint = new THREE.Vector3(1.42, 1.20, .92);
    const normal = new THREE.Vector3();
    const shadeGeometry = (geometry, height) => {
      const position = geometry.attributes.position;
      const normals = geometry.attributes.normal;
      const colors = new Float32Array(position.count * 3);
      for (let i = 0; i < position.count; i += 1) {
        const fade = mix(.78, 1.06, clamp(position.getY(i) / height, 0, 1) ** 2);
        normal.set(normals.getX(i), normals.getY(i), normals.getZ(i));
        const lambert = clamp(normal.dot(sunDir) * .5 + .5, 0, 1) ** 2.2;
        colors[i * 3] = mix(shadowTint.x, sunTint.x, lambert) * fade;
        colors[i * 3 + 1] = mix(shadowTint.y, sunTint.y, lambert) * fade;
        colors[i * 3 + 2] = mix(shadowTint.z, sunTint.z, lambert) * fade;
      }
      geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    };

    for (const [x, z, radius, height, courses, casing, shade] of specs) {
      const group = new THREE.Group();
      group.name = 'V75DistantPyramid';

      /*
        Материал намеренно несветящийся. Освещённый камень на таком удалении
        выводится ровно в яркость дымки и силуэт пропадает — проверено. Весь
        объём здесь несут вершинные цвета (закатная раскладка света) и карта
        кладки, а дальность задаёт applyLook, подмешивая цвет дымки по shade.
      */
      const stone = window.NileMaterials?.surface?.('sandstone');
      const material = new THREE.MeshBasicMaterial({
        color: 0xbda37a,
        vertexColors: true,
        fog: false,
        // Прозрачность здесь не ради полупрозрачности, а ради порядка вывода.
        // renderOrder у группы задаёт groupOrder, который сравнивается раньше
        // renderOrder отдельных мешей: непрозрачные пирамиды с groupOrder −6
        // рисовались до купола неба, и небо закрашивало их целиком.
        // В прозрачном проходе они выводятся после купола, но раньше дюн и
        // полотнищ пыли, поэтому те закрывают их основания.
        transparent: true,
        opacity: 1,
        depthWrite: false,
      });
      if (stone) {
        material.map = stone.map.clone();
        material.map.repeat.set(Math.max(3, Math.round(radius / 4)), Math.max(3, Math.round(radius / 4)));
        material.map.needsUpdate = true;
      }
      material.needsUpdate = true;

      const core = new THREE.Mesh(stepPyramidGeometry(radius, height, courses), material);
      shadeGeometry(core.geometry, height);
      core.receiveShadow = true;
      group.add(core);

      // Остатки полированной облицовки у вершины. Материал тот же, что у
      // кладки: дымку на всю пирамиду подмешивает applyLook, и отдельный
      // материал выпадал бы из этого перекрашивания. Отличие даёт геометрия
      // и осветлённые вершинные цвета.
      if (casing > 0) {
        const casingHeight = height * casing;
        const cap = new THREE.Mesh(new THREE.ConeGeometry(radius * casing * 1.04, casingHeight, 4), material);
        cap.geometry.rotateY(Math.PI / 4);
        window.NileMaterials?.applyBoxUV?.(cap.geometry, .12);
        shadeGeometry(cap.geometry, height);
        const capColors = cap.geometry.attributes.color;
        for (let i = 0; i < capColors.count; i += 1) {
          capColors.setXYZ(i, capColors.getX(i) * 1.22, capColors.getY(i) * 1.2, capColors.getZ(i) * 1.16);
        }
        capColors.needsUpdate = true;
        cap.position.y = height - casingHeight * .5;
        group.add(cap);
      }

      // Песчаный занос у подножия. Раньше это был четырёхгранный конус — на
      // горизонте он читался как ещё одна маленькая пирамида рядом с большой.
      // Теперь это пологий круглый вал: он прячет нижние ряды кладки и
      // сливается с дюнами, а не спорит с силуэтом.
      const drift = new THREE.Mesh(
        new THREE.ConeGeometry(radius * 1.9, height * .17, 26, 1),
        material,
      );
      const driftPos = drift.geometry.attributes.position;
      for (let i = 0; i < driftPos.count; i += 1) {
        // Купол вместо конуса: вершина заваливается, склон становится пологим.
        const t = clamp(driftPos.getY(i) / (height * .17) + .5, 0, 1);
        driftPos.setY(i, driftPos.getY(i) * (1 - t * .55));
      }
      driftPos.needsUpdate = true;
      drift.geometry.computeVertexNormals();
      window.NileMaterials?.applyBoxUV?.(drift.geometry, .08);
      shadeGeometry(drift.geometry, height);
      drift.position.y = height * .05;
      group.add(drift);

      group.position.set(x, .15, z);
      // Рисуются раньше дюн и полотнищ пыли, поэтому те закрывают основания.
      group.renderOrder = -6;
      scene.add(group);
      decor.push({ kind: 'pyramid', object: group, material, shade });
    }
  }

  function buildSky() {
    const material = window.NileShaders?.createSkyMaterial?.(THREE);
    if (material) {
      const dome = new THREE.Mesh(new THREE.SphereGeometry(500, 32, 20), material);
      dome.name = 'V751SandstormSky';
      dome.frustumCulled = false;
      dome.renderOrder = -100;
      scene.add(dome);
      sky = dome;
    }

    const sheetSpecs = [
      // Медленная пелена перед самими пирамидами: она и создаёт ощущение,
      // что их заносит бурей. Полотнища стоят вплотную к отнесённой назад
      // группе в Гизе, иначе буря шла бы сама по себе, а пирамиды — сами.
      { z: -412, width: 1400, height: 220, y: 56, strength: .38, speed: .010, scale: .42 },
      // Низкая позёмка у подножий: песок тянет поперёк и подъедает основания.
      { z: -418, width: 1600, height: 46, y: 11, strength: .66, speed: .026, scale: .32 },
      // Вторая, более плотная полоса чуть ближе — она и «заносит» нижние ряды.
      { z: -396, width: 1200, height: 26, y: 6, strength: .58, speed: .038, scale: .46 },
      { z: -300, width: 820, height: 170, y: 46, strength: .26, speed: .016, scale: .6 },
      { z: -232, width: 620, height: 150, y: 44, strength: .30, speed: .020, scale: .7 },
      { z: -168, width: 480, height: 104, y: 26, strength: .24, speed: .045, scale: 1.1 },
      { z: -96, width: 340, height: 62, y: 13, strength: .26, speed: .085, scale: 1.7 },
      { z: -42, width: 210, height: 30, y: 5.5, strength: .19, speed: .150, scale: 2.4 },
    ];
    for (const spec of sheetSpecs) {
      const sheetMaterial = window.NileShaders?.createDustSheetMaterial?.(THREE, {
        strength: spec.strength,
        speed: spec.speed,
        scale: spec.scale,
      });
      if (!sheetMaterial) break;
      const sheet = new THREE.Mesh(new THREE.PlaneGeometry(spec.width, spec.height), sheetMaterial);
      sheet.position.set(0, spec.y, spec.z);
      sheet.renderOrder = -3;
      sheet.frustumCulled = false;
      scene.add(sheet);
      dustSheets.push(sheet);
    }

    const rayMaterial = window.NileShaders?.createGodrayMaterial?.(THREE);
    if (rayMaterial) {
      const rays = new THREE.Mesh(new THREE.PlaneGeometry(170, 130), rayMaterial);
      rays.position.set(-34, 30, -190);
      rays.rotation.z = .16;
      rays.renderOrder = -2;
      rays.frustumCulled = false;
      scene.add(rays);
      godrays = rays;
    }
  }

  /*
    Дальние дюны. Профиль нарочно низкочастотный: пара пологих гребней вдоль
    горизонта. Раньше в нём был высокочастотный член, и вместо песка
    получалась пила из треугольников.
  */
  /*
    Силуэт дальних дюн у самого горизонта. Это плоские полотнища без записи
    глубины, и раньше они стояли на 224 и 258 метрах — в середине берега,
    который тянется на все 500. Пальмы и тростник оказывались позади них, но
    рисовались поверх: дюны буквально проходили сквозь деревья. Теперь они
    унесены за всю растительность и за пирамиды, где перекрывать уже нечего.
  */
  function buildDunes() {
    for (const [depth, height, opacity, shade] of [[-540, 16, .62, .46], [-505, 10, .44, .34]]) {
      const positions = [];
      const span = 1100;
      const steps = 60;
      const crestAt = (t) => (Math.sin(t * 2.6 + depth * .01) * .55 + Math.sin(t * 1.3 + 1.7) * .45 + 1.4) * height * .5;
      for (let i = 0; i < steps; i += 1) {
        const t0 = i / steps;
        const t1 = (i + 1) / steps;
        const x0 = mix(-span / 2, span / 2, t0);
        const x1 = mix(-span / 2, span / 2, t1);
        const y0 = crestAt(t0);
        const y1 = crestAt(t1);
        positions.push(x0, 0, 0, x1, 0, 0, x1, y1, 0);
        positions.push(x0, 0, 0, x1, y1, 0, x0, y0, 0);
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geometry.computeVertexNormals();
      const material = new THREE.MeshBasicMaterial({
        color: 0xbfa176,
        transparent: true,
        opacity,
        depthWrite: false,
        side: THREE.DoubleSide,
        fog: false,
      });
      const ridge = new THREE.Mesh(geometry, material);
      ridge.name = 'V751HorizonDunes';
      ridge.position.set(0, -1.4, depth);
      ridge.renderOrder = -5;
      ridge.frustumCulled = false;
      scene.add(ridge);
      decor.push({ kind: 'dune', object: ridge, material, shade });
    }
  }

  function buildTorches() {
    for (let i = 0; i < 11; i += 1) {
      const side = i % 2 ? -1 : 1;
      const z = -hash(i, 51) * SCROLL_TILE;
      const offset = 1.9 + hash(i, 52) * 3.4;
      const x = riverCenter(z) + side * (riverHalf(z) + offset);
      const group = new THREE.Group();
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(.05, .07, 1.5, 5), new THREE.MeshStandardMaterial({ color: 0x4a3520, roughness: 1 }));
      pole.position.y = .75;
      group.add(pole);
      const flame = new THREE.Mesh(
        new THREE.SphereGeometry(.16, 7, 6),
        new THREE.MeshBasicMaterial({ color: 0xffb547, transparent: true, opacity: .0 }),
      );
      flame.position.y = 1.58;
      group.add(flame);
      group.position.set(x, .04 + bankRise(offset), z);
      scene.add(group);
      decor.push({ kind: 'torch', object: group, flame, phase: hash(i, 53) * 9, baseZ: z, scroll: true });
    }
  }

  /* Птицы: три треугольных крыла, машут и уходят за горизонт. */
  function buildBirds() {
    const material = new THREE.MeshBasicMaterial({ color: 0x4a4234, transparent: true, opacity: .34, side: THREE.DoubleSide });
    for (let i = 0; i < 5; i += 1) {
      const group = new THREE.Group();
      const left = new THREE.Mesh(new THREE.PlaneGeometry(.9, .22), material);
      const right = new THREE.Mesh(new THREE.PlaneGeometry(.9, .22), material);
      left.position.x = -.45;
      right.position.x = .45;
      group.add(left, right);
      group.position.set((hash(i, 61) - .5) * 90, 22 + hash(i, 62) * 16, -95 - hash(i, 63) * 150);
      group.scale.setScalar(.7 + hash(i, 64) * .6);
      scene.add(group);
      birds.push({ group, left, right, phase: hash(i, 65) * 9, speed: 2.4 + hash(i, 66) * 2.6 });
    }
  }

  /* ------------------------------------------------------------------ *
   * 5. Корзинка, препятствия и пул объектов                             *
   * ------------------------------------------------------------------ */

  /*
    Схлопывание группы в один меш на материал. Процедурные препятствия
    состоят из десятков примитивов, и без слияния каждое стоит десятки
    вызовов отрисовки. Меши с userData.noMerge остаются отдельными —
    их анимируют по отдельности (челюсть крокодила, кольца водоворота).
  */
  function mergeGeometries(list) {
    let total = 0;
    const plain = list.map((geometry) => (geometry.index ? geometry.toNonIndexed() : geometry));
    for (const geometry of plain) total += geometry.attributes.position.count;
    const position = new Float32Array(total * 3);
    const normal = new Float32Array(total * 3);
    const uv = new Float32Array(total * 2);
    let cursor = 0;
    for (const geometry of plain) {
      const pos = geometry.attributes.position;
      const nor = geometry.attributes.normal;
      const tex = geometry.attributes.uv;
      for (let i = 0; i < pos.count; i += 1) {
        const target = cursor + i;
        position[target * 3] = pos.getX(i);
        position[target * 3 + 1] = pos.getY(i);
        position[target * 3 + 2] = pos.getZ(i);
        if (nor) {
          normal[target * 3] = nor.getX(i);
          normal[target * 3 + 1] = nor.getY(i);
          normal[target * 3 + 2] = nor.getZ(i);
        }
        if (tex) {
          uv[target * 2] = tex.getX(i);
          uv[target * 2 + 1] = tex.getY(i);
        }
      }
      cursor += pos.count;
    }
    const merged = new THREE.BufferGeometry();
    merged.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
    merged.setAttribute('normal', new THREE.Float32BufferAttribute(normal, 3));
    merged.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    merged.computeBoundingSphere();
    return merged;
  }

  function mergeByMaterial(root) {
    if (!root || !root.isObject3D) return root;
    root.updateMatrixWorld(true);
    const buckets = new Map();
    const doomed = [];
    /*
      noMerge проверяется по всей цепочке родителей, а не только у самого меша.
      Раньше флаг ставили на группу — на челюсть бегемота, на воронку
      водоворота, — а обход смотрел только на меш. Дети группы уходили в общую
      склейку, группа оставалась пустой, и анимация двигала пустоту: пасть у
      бегемота не открывалась ни разу.
    */
    const locked = (node) => {
      for (let cursor = node; cursor && cursor !== root.parent; cursor = cursor.parent) {
        if (cursor.userData?.noMerge) return true;
      }
      return false;
    };
    root.traverse((child) => {
      if (!child.isMesh || child.isSkinnedMesh || child.isInstancedMesh) return;
      if (Array.isArray(child.material) || locked(child)) return;
      const key = child.material.uuid;
      if (!buckets.has(key)) buckets.set(key, { material: child.material, geometries: [] });
      const geometry = child.geometry.clone();
      geometry.applyMatrix4(child.matrixWorld);
      buckets.get(key).geometries.push(geometry);
      doomed.push(child);
    });
    if (doomed.length < 2) return root;
    for (const child of doomed) child.parent?.remove(child);
    for (const bucket of buckets.values()) {
      const mesh = new THREE.Mesh(mergeGeometries(bucket.geometries), bucket.material);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      root.add(mesh);
    }
    return root;
  }

  function addClosedLid(root) {
    if (!root || root.getObjectByName?.('V75ClosedBasketLid')) return root;
    const material = window.assetManager?._basketMaterial?.() || new THREE.MeshStandardMaterial({ color: 0xb56f32, roughness: .94, metalness: 0 });
    const lid = new THREE.Group();
    lid.name = 'V75ClosedBasketLid';
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(.78, .82, .12, 22), material);
    disc.scale.z = .82;
    disc.position.y = .71;
    disc.castShadow = true;
    lid.add(disc);
    const dome = new THREE.Mesh(new THREE.SphereGeometry(.78, 22, 10, 0, Math.PI * 2, 0, Math.PI / 2), material.clone());
    dome.scale.set(1, .26, .82);
    dome.position.y = .73;
    dome.castShadow = true;
    lid.add(dome);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(.80, .045, 6, 28), new THREE.MeshStandardMaterial({ color: 0x674020, roughness: .98 }));
    rim.rotation.x = Math.PI / 2;
    rim.scale.z = .82;
    rim.position.y = .69;
    lid.add(rim);
    for (let i = 0; i < 9; i += 1) {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(.09 + i * .068, .012, 4, 30),
        new THREE.MeshBasicMaterial({ color: i % 2 ? 0x8c5325 : 0xd09149, transparent: true, opacity: .78 }),
      );
      ring.rotation.x = Math.PI / 2;
      ring.scale.z = .82;
      ring.position.y = .795;
      lid.add(ring);
    }
    // Тёплый свет изнутри: напоминание, что в корзинке ребёнок.
    const glow = new THREE.Mesh(
      new THREE.SphereGeometry(.42, 12, 8),
      new THREE.MeshBasicMaterial({ color: 0xffd9a0, transparent: true, opacity: .16, depthWrite: false }),
    );
    glow.position.y = .5;
    glow.name = 'V751BasketInnerGlow';
    lid.add(glow);
    root.add(lid);
    return root;
  }

  /*
    След корзинки. Основной шлейф уходит НАЗАД, к камере, — так и должно быть
    у плывущего по течению предмета. Впереди остаётся только короткий бурун:
    нос режет воду, и без него корзинка выглядит приклеенной к поверхности.
  */
  function makeWake() {
    const group = new THREE.Group();
    const material = window.NileShaders?.createWakeMaterial?.(THREE);
    if (material) {
      const geometry = new THREE.PlaneGeometry(3.4, 9.5, 1, 14);
      const mesh = new THREE.Mesh(geometry, material);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(0, -.02, 5.1);
      mesh.renderOrder = 5;
      group.add(mesh);
      group.userData.shaderWake = mesh;
    }
    // Два расходящихся уса за кормой — на том же шейдере пены, чтобы они
    // растворялись к концу, а не тянулись ровными рельсами.
    for (const side of [-1, 1]) {
      const streakMaterial = window.NileShaders?.createWakeMaterial?.(THREE, 0xfbf4de)
        || new THREE.MeshBasicMaterial({ color: 0xfbf4de, transparent: true, opacity: .16, depthWrite: false, side: THREE.DoubleSide });
      if (streakMaterial.uniforms) streakMaterial.uniforms.uStrength.value = .38;
      const streak = new THREE.Mesh(new THREE.PlaneGeometry(.5, 4.4, 1, 6), streakMaterial);
      streak.rotation.x = -Math.PI / 2;
      streak.position.set(side * .62, -.016, 2.6);
      streak.rotation.z = side * .2;
      streak.renderOrder = 5;
      group.add(streak);
      group.userData[side < 0 ? 'leftStreak' : 'rightStreak'] = streak;
    }
    const bow = new THREE.Mesh(
      new THREE.RingGeometry(.5, .78, 22, 1, Math.PI * .18, Math.PI * .64),
      new THREE.MeshBasicMaterial({ color: 0xfff6e0, transparent: true, opacity: .18, depthWrite: false, side: THREE.DoubleSide }),
    );
    bow.rotation.x = -Math.PI / 2;
    bow.rotation.z = Math.PI * .5;
    bow.position.set(0, -.012, -.7);
    group.add(bow);
    group.userData.bow = bow;
    return group;
  }

  /*
    Волны от манёвра. При смене дорожки на воде остаётся косая полоса пены:
    она дрейфует вместе с течением и гаснет. Пул фиксированный, ничего не
    создаётся во время игры.
  */
  const swipeWaves = [];
  function buildSwipeWaves() {
    const material = window.NileShaders?.createWakeMaterial?.(THREE, 0xfdf3dc);
    for (let i = 0; i < 6; i += 1) {
      const waveMaterial = material ? material.clone() : new THREE.MeshBasicMaterial({ color: 0xfdf3dc, transparent: true, opacity: .3, depthWrite: false, side: THREE.DoubleSide });
      if (waveMaterial.uniforms) waveMaterial.uniforms.uStrength.value = 0;
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 2.4, 1, 4), waveMaterial);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.y = -.015;
      mesh.visible = false;
      mesh.renderOrder = 6;
      mesh.frustumCulled = false;
      scene.add(mesh);
      swipeWaves.push({ mesh, life: 0, maxLife: 1.35 });
    }
  }

  let swipeWaveCursor = 0;
  function emitSwipeWave(x, direction) {
    if (!swipeWaves.length) return;
    const slot = swipeWaves[swipeWaveCursor % swipeWaves.length];
    swipeWaveCursor += 1;
    slot.life = slot.maxLife;
    slot.mesh.visible = true;
    slot.mesh.position.set(x - direction * .5, -.015, .6);
    slot.mesh.rotation.z = direction * .5;
    slot.mesh.scale.set(1, 1, 1);
  }

  function updateSwipeWaves(dt, flow, t) {
    for (const slot of swipeWaves) {
      if (slot.life <= 0) {
        if (slot.mesh.visible) slot.mesh.visible = false;
        continue;
      }
      slot.life -= dt;
      slot.mesh.position.z += flow * dt;
      const fade = clamp(slot.life / slot.maxLife, 0, 1);
      slot.mesh.scale.set(1 + (1 - fade) * 1.1, 1, 1 + (1 - fade) * .7);
      const material = slot.mesh.material;
      if (material.uniforms) {
        material.uniforms.uTime.value = t;
        material.uniforms.uStrength.value = fade * .7;
      } else {
        material.opacity = fade * .35;
      }
      if (slot.life <= 0) slot.mesh.visible = false;
    }
  }

  function installBasket(visual) {
    if (!player || !visual) return;
    if (basketVisual) player.remove(basketVisual);
    basketVisual = addClosedLid(visual);
    basketVisual.scale.setScalar(.62);
    basketVisual.position.y = -.30;
    basketVisual.rotation.y = Math.PI;
    basketVisual.traverse((node) => {
      if (!node.isMesh) return;
      node.castShadow = shadowsOn;
      node.receiveShadow = true;
    });
    player.add(basketVisual);
  }

  function createFallbackBasket3D() {
    const group = new THREE.Group();
    const bodyMaterial = new THREE.MeshStandardMaterial({ color: 0xb66e31, roughness: .94, metalness: 0, side: THREE.DoubleSide });
    const body = new THREE.Mesh(new THREE.CylinderGeometry(.83, .61, .56, 20, 1, true), bodyMaterial);
    body.position.y = .28;
    group.add(body);
    const bottom = new THREE.Mesh(new THREE.CylinderGeometry(.61, .61, .08, 20), bodyMaterial.clone());
    bottom.position.y = .04;
    group.add(bottom);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(.82, .06, 7, 26), new THREE.MeshStandardMaterial({ color: 0x6d411f, roughness: .98 }));
    rim.rotation.x = Math.PI / 2;
    rim.scale.z = .82;
    rim.position.y = .56;
    group.add(rim);
    return group;
  }

  function buildPlayer() {
    player = new THREE.Group();
    player.name = 'V75ClosedBasketPlayer';
    player.position.set(0, .10, 0);
    wake = makeWake();
    player.add(wake);

    // Тень корзинки — тем же мягким пятном с умножением, что и у препятствий:
    // ровный тёмный круг читался как приклеенный к воде блин.
    const contact = new THREE.Mesh(
      new THREE.PlaneGeometry(1.9, 1.9),
      new THREE.MeshBasicMaterial({
        map: contactShadowTexture(),
        transparent: true,
        opacity: .85,
        depthWrite: false,
        fog: false,
      }),
    );
    contact.scale.y = .52;
    contact.rotation.x = -Math.PI / 2;
    contact.position.y = -.105;
    contact.name = 'V751ContactShadow';
    player.add(contact);
    player.userData.contact = contact;

    const shieldMaterial = window.NileShaders?.createShieldMaterial?.(THREE);
    if (shieldMaterial) {
      shieldBubble = new THREE.Mesh(new THREE.SphereGeometry(1.16, 22, 16), shieldMaterial);
      shieldBubble.visible = false;
      shieldBubble.scale.set(1, .88, 1.05);
      shieldBubble.position.y = .22;
      shieldBubble.renderOrder = 9;
      player.add(shieldBubble);
    }

    const auraMaterial = window.NileShaders?.createHaloMaterial?.(THREE, 0xffe08a);
    if (auraMaterial) {
      auraMaterial.uniforms.uStrength.value = .20;
      const aura = new THREE.Mesh(new THREE.PlaneGeometry(6.2, 6.2), auraMaterial);
      aura.rotation.x = -Math.PI / 2;
      aura.position.y = -.08;
      aura.visible = false;
      aura.renderOrder = 4;
      player.add(aura);
      player.userData.aura = aura;
    }

    scene.add(player);
    installBasket(window.assetManager?.createProceduralBasket?.() || createFallbackBasket3D());
    window.assetManager?.loadBasketModel?.().then((model) => installBasket(model)).catch(() => {});
  }

  /* -- фабрики предметов -------------------------------------------- */

  function createLotus() {
    const group = new THREE.Group();
    const pad = new THREE.Mesh(
      new THREE.CylinderGeometry(.72, .78, .05, 20),
      new THREE.MeshStandardMaterial({ color: 0x3f6636, roughness: .84 }),
    );
    pad.name = 'V751LilyPad';
    // У настоящей модели лотоса свой лист. Собственный диск остаётся только
    // под запасной OBJ-моделью, иначе под цветком лежат два листа.
    const realLotus = /\.glb$/i.test(window.assetManager?.sources?.lotus || '');
    if (!realLotus) group.add(pad);
    const model = window.assetManager?.cloneModel?.('lotus', realLotus ? 1.5 : 1.15);
    if (model) {
      /*
        У настоящей модели стебли уходят вниз от листа, а cloneModel ставит на
        ноль самую нижнюю точку — то есть кончики стеблей. Лист оказывался на
        две трети метра над водой, и кувшинка висела в воздухе. Топим её так,
        чтобы на поверхности лежал лист, а стебли ушли под воду.
      */
      const fitted = model.userData.fittedSize?.y || 0;
      model.position.y += realLotus ? -fitted * .48 : .055;
      model.rotation.y = Math.PI * .15;
      model.name = 'V751ProjectLotusModel';
      group.add(model);
      group.userData.assetSource = 'models/v73/lotus-flower.obj';
      return group;
    }
    const petalMaterial = new THREE.MeshStandardMaterial({ color: 0xe6a3ad, roughness: .74, emissive: 0x4a161d, emissiveIntensity: .1 });
    const coreMaterial = new THREE.MeshStandardMaterial({ color: 0xe7bd43, roughness: .6, emissive: 0x6b4a08, emissiveIntensity: .2 });
    for (let layer = 0; layer < 2; layer += 1) {
      const count = layer ? 8 : 6;
      for (let i = 0; i < count; i += 1) {
        const petal = new THREE.Mesh(new THREE.SphereGeometry(.13, 8, 5), petalMaterial);
        const angle = i / count * Math.PI * 2 + layer * .4;
        const radius = .18 + layer * .11;
        petal.scale.set(.72, .3, 1.3 + layer * .2);
        petal.position.set(Math.cos(angle) * radius, .12 + layer * .04, Math.sin(angle) * radius);
        petal.rotation.set(layer * .22, -angle, 0);
        group.add(petal);
      }
    }
    const core = new THREE.Mesh(new THREE.SphereGeometry(.09, 8, 6), coreMaterial);
    core.position.y = .2;
    group.add(core);
    group.userData.assetSource = 'emergency-procedural';
    return mergeByMaterial(group);
  }

  /*
    Камень русла на настоящей фотограмметрической съёмке (BabylonJS/Assets,
    CC BY 4.0): базовый цвет, нормали и ORM. Процедурный гранит из
    materials.js читался как крашеный пенопласт — у него нет ни зерна
    породы, ни сколов. Материал общий на все камни: развёртка у моделей
    Quaternius проекционная, так что бесшовная плитка ложится на любой обломок.
  */
  let riverStone = null;
  function riverStoneMaterial() {
    if (riverStone) return riverStone;
    riverStone = new THREE.MeshStandardMaterial({
      color: 0xb6ac93, roughness: .93, metalness: 0,
    });
    riverStone.userData.normalStrength = 1.25;
    makeTexture('textures/terrain/rock-color.jpg', 1.6, 1.6, riverStone);
    makeTexture('textures/terrain/rock-normal.jpg', 1.6, 1.6, riverStone, 'normalMap');
    // В ORM шероховатость лежит в зелёном канале — ровно там, где её ждёт
    // three.js для roughnessMap.
    makeTexture('textures/terrain/rock-orm.jpg', 1.6, 1.6, riverStone, 'roughnessMap');
    window.NileMaterials?.addSkyReflection?.(riverStone, { strength: .16 });
    return riverStone;
  }

  function createRock() {
    const seed = state.elapsed + state.items.length;
    const model = window.assetManager?.cloneModel?.('rock', OBSTACLES.rock.size);
    if (model) {
      model.traverse((child) => { if (child.isMesh) child.material = riverStoneMaterial(); });
      model.rotation.set(.08, hash(seed, 91) * Math.PI * 2, .05);
      model.name = 'V751QuaterniusRockModel';
      model.userData.assetSource = 'models/environment/nature_pack/Rock_1.glb';
      // Гряда вместо одинокого валуна: пара обломков помельче рядом.
      const shards = 1 + Math.floor(hash(seed, 93) * 3);
      for (let i = 0; i < shards; i += 1) {
        const shard = window.assetManager?.cloneModel?.('rock', OBSTACLES.rock.size * (.3 + hash(seed, 94 + i) * .34));
        if (!shard) break;
        const angle = hash(seed, 96 + i) * Math.PI * 2;
        shard.position.set(Math.cos(angle) * (.5 + hash(seed, 98 + i) * .5), -.12, Math.sin(angle) * (.4 + hash(seed, 99 + i) * .5));
        shard.rotation.set(hash(seed, 101 + i) * 2, hash(seed, 102 + i) * 6, hash(seed, 103 + i) * 2);
        shard.traverse((child) => { if (child.isMesh) child.material = riverStoneMaterial(); });
        model.add(shard);
      }
      return model;
    }
    const group = new THREE.Group();
    const stone = new THREE.MeshStandardMaterial({ color: 0x6b6152, roughness: 1, flatShading: true });
    for (let i = 0; i < 3; i += 1) {
      const chunk = new THREE.Mesh(new THREE.DodecahedronGeometry(.5 - i * .12, 0), stone);
      chunk.position.set((hash(i, 71) - .5) * .7, .28 - i * .1, (hash(i, 72) - .5) * .6);
      chunk.rotation.set(hash(i, 73) * 3, hash(i, 74) * 3, hash(i, 75) * 3);
      chunk.scale.set(1.2, .8, 1);
      group.add(chunk);
    }
    group.userData.assetSource = 'emergency-procedural';
    return mergeByMaterial(group);
  }

  function createLog() {
    const model = window.assetManager?.cloneModel?.('log', OBSTACLES.log.size);
    if (model) {
      model.rotation.y = Math.PI / 2 + (hash(state.elapsed + state.items.length, 73) - .5) * .24;
      model.position.y = -.08;
      model.name = 'V751QuaterniusWoodLogModel';
      model.userData.assetSource = 'models/environment/survival_pack/WoodLog.glb';
      return model;
    }
    const group = new THREE.Group();
    const bark = new THREE.MeshStandardMaterial({ color: 0x6a4a2d, roughness: 1 });
    const body = new THREE.Mesh(new THREE.CylinderGeometry(.32, .38, 2.9, 12), bark);
    body.rotation.z = Math.PI / 2;
    body.position.y = .06;
    group.add(body);
    const cut = new THREE.MeshStandardMaterial({ color: 0xa2794c, roughness: .9 });
    for (const side of [-1, 1]) {
      const face = new THREE.Mesh(new THREE.CircleGeometry(side < 0 ? .38 : .32, 14), cut);
      face.position.set(side * 1.45, .06, 0);
      face.rotation.y = side * Math.PI / 2;
      group.add(face);
    }
    group.userData.assetSource = 'emergency-procedural';
    return mergeByMaterial(group);
  }

  /*
    Крокодил. Модель одна на всю игру, поэтому «качество» ей добавляет не
    новый файл, а движение: волна по телу в вершинном шейдере, бросок с
    приоткрытой пастью и подводный подход. Оси волны считаются по геометрии,
    так что привязки к конкретной ориентации модели нет.
  */
  function crocodileUniforms(mesh) {
    mesh.geometry.computeBoundingBox();
    const box = mesh.geometry.boundingBox;
    const size = new THREE.Vector3();
    box.getSize(size);
    const dims = [size.x, size.y, size.z];
    const longest = dims.indexOf(Math.max(...dims));
    const rest = [0, 1, 2].filter((i) => i !== longest);
    const side = dims[rest[0]] >= dims[rest[1]] ? rest[0] : rest[1];
    const lift = rest[0] === side ? rest[1] : rest[0];
    const mask = (index) => new THREE.Vector3(index === 0 ? 1 : 0, index === 1 ? 1 : 0, index === 2 ? 1 : 0);
    const min = [box.min.x, box.min.y, box.min.z][longest];
    return {
      time: { value: 0 },
      swim: { value: dims[side] * .085 },
      bite: { value: 0 },
      axis: { value: mask(longest) },
      side: { value: mask(side) },
      lift: { value: mask(lift) },
      min: { value: min },
      range: { value: dims[longest] },
      amplitude: dims[side] * .085,
      biteRange: dims[lift] * .22,
    };
  }

  function createCrocodile() {
    const model = window.assetManager?.cloneModel?.('crocodile', OBSTACLES.croc.size);
    if (model) {
      model.rotation.y = 0;
      model.position.y = -.24;
      model.name = 'V751DetailedCrocodileModel';
      model.userData.assetSource = 'models/v73/crocodile.glb';
      let uniforms = null;
      model.traverse((node) => {
        if (!node.isMesh) return;
        if (!uniforms) uniforms = crocodileUniforms(node);
        node.material = node.material.clone();
        // Текстуры модели тёмные: в дымке она превращалась в пятно.
        if (node.material.color) node.material.color.multiplyScalar(1.55);
        if ('roughness' in node.material) node.material.roughness = Math.min(.9, (node.material.roughness ?? .8) + .1);
        window.NileShaders?.applyCrocodileSwim?.(THREE, node.material, uniforms);
      });
      model.userData.crocUniforms = uniforms;

      const wrap = new THREE.Group();
      wrap.name = 'V751CrocodileRig';
      wrap.userData.crocUniforms = uniforms;
      wrap.userData.assetSource = 'models/v73/crocodile.glb';

      // Крокодил идёт навстречу корзинке, носом к камере.
      const body = new THREE.Group();
      body.rotation.y = 0;
      body.rotation.x = -.06;
      body.add(model);
      wrap.add(body);
      wrap.userData.body = body;

      // Глаза над водой — по ним крокодил читается мгновенно.
      const eyeMaterial = new THREE.MeshBasicMaterial({ color: 0xffe9a8 });
      const eyes = new THREE.Group();
      for (const side of [-1, 1]) {
        const eye = new THREE.Mesh(new THREE.SphereGeometry(.085, 8, 6), eyeMaterial);
        eye.position.set(side * .17, .2, 1.42);
        eyes.add(eye);
        const brow = new THREE.Mesh(new THREE.SphereGeometry(.12, 8, 6), new THREE.MeshStandardMaterial({ color: 0x53644a, roughness: .9 }));
        brow.scale.set(1, .6, 1.1);
        brow.position.set(side * .17, .15, 1.4);
        eyes.add(brow);
      }
      body.add(eyes);
      wrap.userData.eyes = eyes;

      // Расходящийся след: видно, что он плывёт, а не лежит на воде.
      const trailMaterial = window.NileShaders?.createWakeMaterial?.(THREE, 0xdfe6cf);
      if (trailMaterial) {
        trailMaterial.uniforms.uStrength.value = .32;
        const trail = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 5.4, 1, 8), trailMaterial);
        trail.rotation.x = -Math.PI / 2;
        trail.position.set(0, -.04, -3.2);
        trail.renderOrder = 4;
        wrap.add(trail);
        wrap.userData.trail = trailMaterial;
      }
      return wrap;
    }
    const group = new THREE.Group();
    const hide = new THREE.MeshStandardMaterial({ color: 0x3a5238, roughness: .9, flatShading: true });
    const belly = new THREE.MeshStandardMaterial({ color: 0x7c8659, roughness: .95 });
    const body = new THREE.Mesh(new THREE.CylinderGeometry(.4, .44, 2.3, 12), hide);
    body.rotation.x = Math.PI / 2;
    body.position.y = -.06;
    group.add(body);
    const spine = new THREE.Mesh(new THREE.SphereGeometry(.44, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), hide);
    spine.scale.set(1, .5, 2.6);
    spine.position.y = -.06;
    group.add(spine);
    const jawTop = new THREE.Mesh(new THREE.BoxGeometry(.56, .17, 1.1), hide);
    jawTop.position.set(0, .02, 1.42);
    group.add(jawTop);
    const jawBottom = new THREE.Mesh(new THREE.BoxGeometry(.5, .13, 1.0), belly);
    jawBottom.position.set(0, -.16, 1.38);
    group.add(jawBottom);
    const tail = new THREE.Mesh(new THREE.ConeGeometry(.3, 1.7, 7), hide);
    tail.rotation.x = -Math.PI / 2;
    tail.position.set(0, -.04, -1.85);
    group.add(tail);
    const eyeMaterial = new THREE.MeshStandardMaterial({ color: 0xf0d98a, emissive: 0x936a10, emissiveIntensity: .5, roughness: .4 });
    for (const side of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(.09, 8, 6), eyeMaterial);
      eye.position.set(side * .19, .16, .88);
      group.add(eye);
      const ridge = new THREE.Mesh(new THREE.ConeGeometry(.07, .18, 4), hide);
      ridge.position.set(side * .16, .18, -.3);
      group.add(ridge);
    }
    jawBottom.userData.noMerge = true;
    tail.userData.noMerge = true;
    group.userData.jaw = jawBottom;
    group.userData.tail = tail;
    group.userData.assetSource = 'emergency-procedural';
    return mergeByMaterial(group);
  }

  /*
    Заросли папируса, под которыми надо нырять. Раньше это были две палки с
    перекладиной — читалось как строительные леса. Теперь настоящий папирус:
    трёхгранные стебли, склонённые над водой, с зонтиками-соцветиями наверху и
    свисающими метёлками. Проход внизу оставлен открытым.
  */
  function papyrusStalk(height, lean, material, umbrella) {
    const group = new THREE.Group();
    const segments = 5;
    let prevY = 0;
    for (let i = 0; i < segments; i += 1) {
      const t = i / segments;
      const segHeight = height / segments;
      // Трёхгранный стебель — характерная черта папируса.
      const stalk = new THREE.Mesh(new THREE.CylinderGeometry(.075 * (1 - t * .45), .088 * (1 - t * .4), segHeight * 1.04, 3), material);
      const bend = lean * t * t;
      stalk.position.set(bend, prevY + segHeight * .5, 0);
      stalk.rotation.z = -lean * t * .55;
      group.add(stalk);
      prevY += segHeight;
    }
    // Зонтик: лучи расходятся веером и опадают вниз.
    const crown = new THREE.Group();
    for (let i = 0; i < 14; i += 1) {
      const angle = (i / 14) * Math.PI * 2;
      const ray = new THREE.Mesh(new THREE.CylinderGeometry(.012, .006, .68, 3), umbrella);
      ray.position.set(Math.cos(angle) * .22, .24, Math.sin(angle) * .22);
      ray.rotation.set(Math.PI * .34 * Math.cos(angle + 1.2), angle, Math.PI * .34 * Math.sin(angle));
      crown.add(ray);
      const tip = new THREE.Mesh(new THREE.SphereGeometry(.032, 5, 4), umbrella);
      tip.position.set(Math.cos(angle) * .45, .06, Math.sin(angle) * .45);
      crown.add(tip);
    }
    crown.position.set(lean, prevY, 0);
    group.add(crown);
    return group;
  }

  function createGate() {
    const group = new THREE.Group();
    const stem = new THREE.MeshStandardMaterial({ color: 0x2a3714, roughness: .93 });
    const umbrella = new THREE.MeshStandardMaterial({ color: 0x3c4d19, roughness: .9 });
    const frond = new THREE.MeshStandardMaterial({ color: 0x1f2d10, roughness: .92, side: THREE.DoubleSide });

    /*
      Два куста по берегам дорожки, склонённых навстречу друг другу. Если
      настоящая модель папируса приехала — берём её: у арки игрок проходит
      вплотную, и здесь разница между настоящим растением и собранным из
      цилиндров видна лучше всего.
    */
    let real = 0;
    for (const side of [-1, 1]) {
      for (let i = 0; i < 3; i += 1) {
        const clump = window.assetManager?.cloneModel?.('papyrus', 3.4 + hash(i, 77 + side) * .9);
        if (!clump) break;
        clump.position.set(side * (1.05 + hash(i, 84) * .6), -.1, (hash(i, 85) - .5) * 1.4);
        clump.rotation.set(side * -.16, hash(i, 86) * Math.PI * 2, side * (.14 + hash(i, 83) * .12));
        group.add(clump);
        real += 1;
      }
    }
    if (!real) {
      for (const side of [-1, 1]) {
        for (let i = 0; i < 9; i += 1) {
          const height = 2.4 + hash(i, 81 + side) * 1.1;
          const stalk = papyrusStalk(height, side * (.55 + hash(i, 83) * .5), stem, umbrella);
          stalk.position.set(side * (.92 + hash(i, 84) * .7), 0, (hash(i, 85) - .5) * 1.3);
          stalk.rotation.y = hash(i, 86) * Math.PI;
          stalk.scale.setScalar(.85 + hash(i, 87) * .35);
          group.add(stalk);
        }
      }
    }

    // Полог из свисающих метёлок: по нему сразу видно, что надо нырять.
    for (let i = 0; i < 26; i += 1) {
      const t = i / 25;
      const droop = Math.sin(t * Math.PI);
      const blade = new THREE.Mesh(new THREE.PlaneGeometry(.2, 1.05 + droop * .9), frond);
      blade.position.set(mix(-1.25, 1.25, t), 2.35 - droop * .55, (hash(i, 88) - .5) * .5);
      blade.rotation.set(.1 + hash(i, 89) * .25, (hash(i, 90) - .5) * 1.2, (hash(i, 91) - .5) * .5);
      group.add(blade);
    }
    for (let i = 0; i < 9; i += 1) {
      const t = i / 8;
      const droop = Math.sin(t * Math.PI);
      const vine = new THREE.Mesh(new THREE.CylinderGeometry(.02, .01, .7 + droop * .7, 4), stem);
      vine.position.set(mix(-1.15, 1.15, t), 2.3 - droop * .45, (hash(i, 92) - .5) * .4);
      vine.rotation.z = (hash(i, 93) - .5) * .35;
      group.add(vine);
    }

    group.name = 'V751PapyrusGate';
    group.userData.assetSource = 'project-procedural';
    return mergeByMaterial(group);
  }

  /*
    Водоворот. Раньше это были четыре плоских кольца, которые почти не читались.
    Теперь настоящая воронка: гранёный конус уходит под воду, по нему бежит
    спираль пены, сверху лежат вращающиеся кольца ряби.
  */
  function createVortex() {
    const group = new THREE.Group();
    const deep = new THREE.MeshStandardMaterial({
      color: 0x2c3a33, roughness: .35, metalness: .1,
      transparent: true, opacity: .92, side: THREE.DoubleSide, depthWrite: false,
    });
    const foam = new THREE.MeshStandardMaterial({
      color: 0xe9f0e2, roughness: .5, emissive: 0x2c3a33, emissiveIntensity: .1,
      transparent: true, opacity: .85, side: THREE.DoubleSide, depthWrite: false,
    });

    const funnel = new THREE.Mesh(new THREE.ConeGeometry(1.05, 1.5, 20, 4, true), deep);
    funnel.position.y = -.72;
    funnel.userData.noMerge = true;
    group.add(funnel);
    group.userData.funnel = funnel;

    // Спираль пены по стенке воронки.
    const spiral = new THREE.Group();
    const turns = 34;
    for (let i = 0; i < turns; i += 1) {
      const t = i / turns;
      const angle = t * Math.PI * 5.2;
      const radius = mix(1.0, .16, t);
      const fleck = new THREE.Mesh(new THREE.SphereGeometry(.075 * (1 - t * .55), 6, 5), foam);
      fleck.position.set(Math.cos(angle) * radius, -t * 1.25, Math.sin(angle) * radius);
      fleck.scale.set(1.7, .55, 1);
      fleck.rotation.y = -angle;
      spiral.add(fleck);
    }
    spiral.userData.noMerge = true;
    group.add(spiral);
    group.userData.spiral = spiral;

    const rings = [];
    for (let i = 0; i < 3; i += 1) {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(.68 + i * .36, .055 - i * .012, 6, 26),
        new THREE.MeshStandardMaterial({
          color: 0xd8e2d2, roughness: .45,
          transparent: true, opacity: .55 - i * .13, depthWrite: false,
        }),
      );
      ring.rotation.x = Math.PI / 2;
      ring.position.y = .015 - i * .012;
      ring.scale.y = .8;
      ring.userData.noMerge = true;
      group.add(ring);
      rings.push(ring);
    }
    group.userData.rings = rings;
    group.name = 'V751Whirlpool';
    group.userData.assetSource = 'project-procedural';
    return group;
  }

  /*
    Бегемот. Внешней модели в пакете нет, поэтому он собран из примитивов, но
    собран как силуэт: широкая морда, покатая спина, уши и ноздри над водой.
    Нижняя челюсть вынесена отдельно — он разевает пасть при приближении.
  */
  /*
    Настоящий бегемот: скинованная модель со скелетом и пятью анимациями.
    Пасть открывается поворотом кости HeadJaw поверх проигрываемой анимации —
    именно поэтому важен порядок: сначала микшер записывает кватернионы
    костей, и только потом мы дописываем челюсть, иначе анимация затрёт её.

    Габариты берутся у самого меша, а не через Box3 по сцене: у скинованной
    модели Box3 считает по позе привязки вместе с костями и IK-целями и даёт
    габарит втрое больше настоящего.
  */
  /*
    Оси заводятся лениво: в запасном 2D-режиме библиотеки three на странице
    нет вообще, и обращение к THREE на уровне модуля роняло бы весь файл ещё
    до boot() — вместе с самим запасным режимом.
  */
  let hippoAxes = null;
  function hippoAxis(kind) {
    if (!hippoAxes) {
      hippoAxes = { jaw: new THREE.Vector3(1, 0, 0), head: new THREE.Vector3(0, 0, 1) };
    }
    return hippoAxes[kind];
  }
  const HIPPO_JAW_RANGE = .95;
  // Модель уже смотрит вдоль +Z, то есть навстречу игроку: доворачивать не надо.
  const HIPPO_FACING = 0;
  /*
    Засада бегемота. До HIPPO_REVEAL его нет в кадре совсем, дальше он
    выходит из-под воды за HIPPO_RISE метров — рывком, а не всплывая издали.
    Кривая с ускорением к концу: сначала под водой поднимается тень, у самой
    поверхности зверь выходит разом.
  */
  const HIPPO_REVEAL = -40;
  const HIPPO_RISE = 22;
  const riseCurve = (v) => v * v * (3 - 2 * v);

  function buildRiggedHippo(rig) {
    const model = rig.scene;
    let skin = null;
    model.traverse((child) => { if (child.isSkinnedMesh && !skin) skin = child; });
    if (!skin) return null;
    skin.geometry.computeBoundingBox();
    const box = skin.geometry.boundingBox;
    skin.updateWorldMatrix(true, false);
    const worldScale = new THREE.Vector3();
    skin.matrixWorld.decompose(new THREE.Vector3(), new THREE.Quaternion(), worldScale);
    const length = (box.max.z - box.min.z) * Math.abs(worldScale.z) || 1;
    const scale = OBSTACLES.hippo.size / length;

    const group = new THREE.Group();
    group.name = 'V752RiggedHippo';
    model.scale.multiplyScalar(scale);
    // Ноги на нуле, туша по центру: бегемот всплывает из-под воды, и точка
    // отсчёта должна быть подошвой, а не серединой модели.
    model.position.y = -box.min.y * Math.abs(worldScale.y) * scale;
    group.add(model);

    model.traverse((child) => {
      if (!child.isMesh) return;
      child.castShadow = shadowsOn;
      child.receiveShadow = true;
      child.frustumCulled = false;
      const material = Array.isArray(child.material) ? child.material[0] : child.material;
      if (material) {
        // Шкура у модели своя — процедурные карты её только испортят.
        window.NileMaterials?.dress?.(material, child.geometry, {
          name: 'hide', normalScale: .55, skyReflection: .18, envMapIntensity: .45,
        });
        if ('roughness' in material) material.roughness = Math.max(.62, material.roughness ?? .8);
      }
    });

    const jaw = model.getObjectByName('HeadJaw_019') || model.getObjectByName('HeadJaw');
    const head = model.getObjectByName('Head_018') || model.getObjectByName('Head');
    const store = {
      mixer: rig.animations.length ? new THREE.AnimationMixer(model) : null,
      jaw,
      jawRest: jaw ? jaw.quaternion.clone() : null,
      head,
      headRest: head ? head.quaternion.clone() : null,
      spin: new THREE.Quaternion(),
    };
    if (store.mixer) {
      const idle = rig.animations.find((clip) => /iddle|idle/i.test(clip.name)) || rig.animations[0];
      const action = store.mixer.clipAction(idle);
      action.timeScale = .55;
      action.play();
    }
    group.userData.rig = store;
    group.userData.assetSource = 'models/v75/hippo.glb';
    return group;
  }

  /*
    Бегемот бывает только один — тот, что приехал скинованным из hippo.glb.
    Процедурной лепки из шаров и цилиндра больше нет: она подменяла настоящую
    модель всякий раз, когда заготовленные скелеты кончались, и в заплыве
    попадались два разных зверя. Если скелета нет, меша не будет — но и
    бегемота в ряд не поставят, за этим следит hippoAvailable().
  */
  function createHippo() {
    const rig = window.assetManager?.takeHippoRig?.();
    if (!rig) return null;
    return buildRiggedHippo(rig);
  }

  // Есть ли из чего собрать бегемота: готовый меш в пуле или свободный скелет.
  function hippoAvailable() {
    // В запасном 2D-режиме меши не строятся вовсе — там бегемот рисуется
    // на холсте, и скелет ему не нужен.
    if (state.fallback) return true;
    if (pools.get('hippo')?.length) return true;
    return (window.assetManager?.hippoRigCount?.() || 0) > 0;
  }

  function createBoat() {
    /*
      Настоящая египетская ладья: корпус, мачта, рея и большой прямой парус
      одной моделью со своими текстурами. Прежняя сборка — плоскодонка из
      пакета плюс вручную достроенные мачта, вёсла и завитки носа — уходит:
      всё это есть в самой модели и выглядит на порядок лучше.
    */
    const ship = window.assetManager?.cloneModel?.('ship', OBSTACLES.boat.size);
    if (ship) {
      const wrap = new THREE.Group();
      wrap.name = 'V752EgyptianShip';
      // Модель развёрнута вдоль своей оси X, русло идёт по Z.
      /*
        Корпус модели вытянут вдоль своей оси Z, парус натянут поперёк —
        плоскостью XY. Прежний разворот на 90° клал ладью поперёк русла, и
        парус вставал к игроку ребром: в кадре оставались корпус да рея.
        Без разворота ладья идёт навстречу течению и парус виден целиком.
      */
      ship.rotation.y = Math.PI + (hash(state.elapsed, 88) - .5) * .4;
      /*
        cloneModel уже поставил модель килем на ноль, сдвинув position.y на
        −minY. Присвоение затирало этот сдвиг и роняло ладью на пол-корпуса
        под воду — отсюда и «тонет». Осадку добавляем поверх посадки.
      */
      ship.position.y += -.05;
      wrap.add(ship);
      wrap.userData.assetSource = 'models/v75/ship.glb';
      return wrap;
    }

    const group = new THREE.Group();
    const wood = new THREE.MeshStandardMaterial({ color: 0x8a6236, roughness: .95, side: THREE.DoubleSide });
    const hull = new THREE.Mesh(new THREE.SphereGeometry(1.1, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), wood);
    hull.rotation.x = Math.PI;
    hull.scale.set(.62, .55, 1.7);
    hull.position.y = .28;
    group.add(hull);
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(.05, .07, 2.2, 6), wood);
    mast.position.set(0, 1.2, -.2);
    group.add(mast);
    const sail = new THREE.Mesh(
      new THREE.PlaneGeometry(1.3, 1.5),
      new THREE.MeshStandardMaterial({ color: 0xd2c3a0, roughness: .97, side: THREE.DoubleSide }),
    );
    sail.position.set(.35, 1.4, -.2);
    sail.rotation.y = .3;
    group.add(sail);
    group.name = 'V751RiverBoat';
    group.userData.assetSource = 'project-procedural';
    return mergeByMaterial(group);
  }

  /*
    Кэш материалов усилителей. Объявление было потеряно при переписывании
    лодки, и первый же собранный усилитель ронял исключение прямо в кадре.
  */
  const shrineMaterials = {};

  function shrineMaterial(kind) {
    if (shrineMaterials[kind]) return shrineMaterials[kind];
    const presets = {
      gold: { color: 0xe0b44a, metalness: .58, roughness: .28, emissive: 0x5a3b06, emissiveIntensity: .3 },
      darkGold: { color: 0xa87c25, metalness: .5, roughness: .38, emissive: 0x3a2704, emissiveIntensity: .22 },
      lapis: { color: 0x2f5ea8, metalness: .18, roughness: .42, emissive: 0x0d1d3d, emissiveIntensity: .3 },
      turquoise: { color: 0x54bfae, metalness: .2, roughness: .38, emissive: 0x0f3b36, emissiveIntensity: .35 },
      carnelian: { color: 0xbe5340, metalness: .16, roughness: .44, emissive: 0x431410, emissiveIntensity: .3 },
      linen: { color: 0xf1e3c2, metalness: .04, roughness: .72 },
    };
    shrineMaterials[kind] = new THREE.MeshStandardMaterial(presets[kind] || presets.gold);
    return shrineMaterials[kind];
  }

  /* Щит веры — скарабей с лазуритовыми надкрыльями. */
  function buildScarab() {
    const group = new THREE.Group();
    const shell = new THREE.Mesh(new THREE.SphereGeometry(.34, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2), shrineMaterial('lapis'));
    shell.scale.set(1, .62, 1.28);
    group.add(shell);
    const seam = new THREE.Mesh(new THREE.BoxGeometry(.03, .06, .84), shrineMaterial('gold'));
    seam.position.y = .2;
    group.add(seam);
    const head = new THREE.Mesh(new THREE.CylinderGeometry(.2, .15, .12, 7), shrineMaterial('gold'));
    head.position.set(0, .06, .42);
    group.add(head);
    for (const side of [-1, 1]) {
      for (let i = 0; i < 3; i += 1) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(.05, .04, .3), shrineMaterial('darkGold'));
        leg.position.set(side * .34, .02, .2 - i * .28);
        leg.rotation.y = side * (.5 - i * .3);
        group.add(leg);
      }
      const wing = new THREE.Mesh(new THREE.BoxGeometry(.34, .03, .62), shrineMaterial('turquoise'));
      wing.position.set(side * .38, .16, -.1);
      wing.rotation.z = side * -.42;
      group.add(wing);
    }
    const sun = new THREE.Mesh(new THREE.SphereGeometry(.13, 12, 10), shrineMaterial('carnelian'));
    sun.position.set(0, .2, .62);
    group.add(sun);
    group.name = 'V751ScarabToken';
    return mergeByMaterial(group);
  }

  /* Свет Мириам — систр: рамка с перекладинами и звенящими дисками. */
  function buildSistrum() {
    const group = new THREE.Group();
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(.055, .075, .5, 8), shrineMaterial('darkGold'));
    handle.position.y = -.1;
    group.add(group.children.length ? handle : handle);
    const collar = new THREE.Mesh(new THREE.TorusGeometry(.09, .028, 6, 14), shrineMaterial('gold'));
    collar.rotation.x = Math.PI / 2;
    collar.position.y = .16;
    group.add(collar);
    const arch = new THREE.Mesh(new THREE.TorusGeometry(.27, .038, 8, 22, Math.PI), shrineMaterial('gold'));
    arch.position.y = .44;
    group.add(arch);
    for (const side of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(.036, .036, .3, 7), shrineMaterial('gold'));
      post.position.set(side * .27, .3, 0);
      group.add(post);
    }
    for (let i = 0; i < 3; i += 1) {
      const bar = new THREE.Mesh(new THREE.CylinderGeometry(.018, .018, .54, 6), shrineMaterial('darkGold'));
      bar.rotation.z = Math.PI / 2;
      bar.position.y = .36 + i * .13;
      group.add(bar);
      for (const offset of [-.16, 0, .16]) {
        const disc = new THREE.Mesh(new THREE.CylinderGeometry(.06, .06, .016, 10), shrineMaterial('turquoise'));
        disc.rotation.x = Math.PI / 2;
        disc.rotation.z = Math.PI / 2;
        disc.position.set(offset, .36 + i * .13, 0);
        group.add(disc);
      }
    }
    group.name = 'V751SistrumToken';
    return mergeByMaterial(group);
  }

  /* Дыхание ветра — распахнутые крылья Исиды. */
  function buildWings() {
    const group = new THREE.Group();
    const core = new THREE.Mesh(new THREE.SphereGeometry(.14, 12, 10), shrineMaterial('carnelian'));
    core.position.y = .3;
    group.add(core);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(.19, .035, 7, 18), shrineMaterial('gold'));
    ring.position.y = .3;
    ring.rotation.x = Math.PI / 2;
    group.add(ring);
    for (const side of [-1, 1]) {
      for (let i = 0; i < 5; i += 1) {
        const t = i / 4;
        const feather = new THREE.Mesh(new THREE.BoxGeometry(.5 - t * .14, .035, .1), i % 2 ? shrineMaterial('turquoise') : shrineMaterial('gold'));
        feather.position.set(side * (.28 + t * .22), .3 + t * .13, -t * .05);
        feather.rotation.z = side * (-.12 - t * .28);
        feather.rotation.y = side * t * .2;
        group.add(feather);
      }
    }
    group.name = 'V751WingsToken';
    return mergeByMaterial(group);
  }

  /* Милость — анкх. */
  function buildAnkh() {
    const group = new THREE.Group();
    const loop = new THREE.Mesh(new THREE.TorusGeometry(.17, .05, 8, 20), shrineMaterial('gold'));
    loop.position.y = .58;
    group.add(loop);
    const stem = new THREE.Mesh(new THREE.BoxGeometry(.09, .52, .07), shrineMaterial('gold'));
    stem.position.y = .18;
    group.add(stem);
    const arms = new THREE.Mesh(new THREE.BoxGeometry(.52, .09, .07), shrineMaterial('gold'));
    arms.position.y = .38;
    group.add(arms);
    const heart = new THREE.Mesh(new THREE.SphereGeometry(.09, 10, 8), shrineMaterial('carnelian'));
    heart.scale.set(1, .9, .6);
    heart.position.set(0, .38, .07);
    group.add(heart);
    group.name = 'V751AnkhToken';
    return mergeByMaterial(group);
  }

  /*
    Жетон усилителя. Владелец прислал четыре модели — щит, корзинку Мириам,
    крылья и сердце, — и они заменяют собой прежние процедурные скарабея,
    систр, крылья Исиды и анкх. Лепка остаётся запасной: если пакет моделей
    не приехал, игрок всё равно увидит жетон, а не пустое место.
  */
  const TOKEN_BUILDERS = {
    shield: buildScarab,
    magnet: buildSistrum,
    rush: buildWings,
    mercy: buildAnkh,
  };
  // Ключ модели в менеджере и высота жетона над водой, метры.
  const TOKEN_MODELS = {
    shield: { key: 'tokenShield', size: 1.32 },
    magnet: { key: 'tokenMagnet', size: 1.24 },
    // Крылья раскинуты вширь почти на четыре единицы при высоте меньше
    // единицы: нормировка по длинной стороне делала их полоской.
    rush:   { key: 'tokenRush',   size: 2.2 },
    mercy:  { key: 'tokenMercy',  size: 1.16 },
  };

  function buildTokenModel(type) {
    const spec = TOKEN_MODELS[type];
    if (!spec) return null;
    const model = window.assetManager?.cloneModel?.(spec.key, spec.size);
    if (!model) return null;
    // cloneModel сажает модель подошвой на ноль — жетон должен висеть
    // серединой на оси кольца, иначе он проваливается сквозь ореол.
    const fitted = model.userData.fittedSize?.y || spec.size;
    model.position.y -= fitted * .5;
    const wrap = new THREE.Group();
    wrap.name = `V753Token_${type}`;
    wrap.add(model);
    wrap.userData.assetSource = `models/v75/${spec.key}`;
    return wrap;
  }

  function createPowerup(type) {
    const group = new THREE.Group();
    const colors = { shield: 0x7fc6bc, magnet: 0xe5be64, rush: 0x8fd3e6, mercy: 0xe58aa0 };
    const color = colors[type] || 0xe5be64;

    const real = buildTokenModel(type);
    const token = real || (TOKEN_BUILDERS[type] || buildAnkh)();
    token.position.y = .62;
    token.scale.setScalar(real ? 1 : 1.75);
    group.add(token);
    group.userData.token = token;

    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(.62, .055, 8, 30),
      new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 1.1, roughness: .34, metalness: .25 }),
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = .1;
    group.add(ring);
    group.userData.ring = ring;

    const haloMaterial = window.NileShaders?.createHaloMaterial?.(THREE, color);
    if (haloMaterial) {
      haloMaterial.uniforms.uStrength.value = .85;
      const halo = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 3.4), haloMaterial);
      halo.rotation.x = -Math.PI / 2;
      halo.position.y = .06;
      group.add(halo);
      group.userData.halo = haloMaterial;
    }
    group.userData.assetSource = real ? real.userData.assetSource : 'project-owned-egyptian-token';
    return group;
  }

  const FACTORY = {
    lotus: createLotus,
    rock: createRock,
    log: createLog,
    croc: createCrocodile,
    gate: createGate,
    vortex: createVortex,
    hippo: createHippo,
    boat: createBoat,
    shield: () => createPowerup('shield'),
    magnet: () => createPowerup('magnet'),
    rush: () => createPowerup('rush'),
    mercy: () => createPowerup('mercy'),
  };

  /*
    Пул объектов. Крокодил из GLB стоит дорого: без переиспользования
    каждый спавн заново обходит дерево модели и создаёт материалы.
  */
  const pools = new Map();

  function acquireMesh(type) {
    const pool = pools.get(type);
    if (pool && pool.length) {
      const mesh = pool.pop();
      mesh.visible = true;
      return mesh;
    }
    const factory = FACTORY[type];
    if (!factory || !scene) return null;
    const mesh = factory();
    if (mesh) mesh.userData.baseScale = mesh.scale.x;
    return mesh;
  }

  /*
    Разогрев пулов. Раньше меш препятствия строился в тот момент, когда он
    впервые понадобился прямо посреди заплыва: клонирование модели, развёртка,
    процедурные карты — и кадр вставал. Теперь всё это делается на загрузке,
    до того как игрок нажал «Отплыть», а в игре пул только выдаёт готовое.
  */
  const PREWARM = {
    rock: 4, log: 3, croc: 2, gate: 2, vortex: 2, hippo: 3, boat: 2, lotus: 8,
    // Жетоны усилителей теперь настоящие модели: их клонирование и подготовка
    // материалов должны пройти на заставке, а не в первый подбор посреди реки.
    shield: 2, magnet: 2, rush: 2, mercy: 2,
  };

  function prewarmPools() {
    for (const [type, count] of Object.entries(PREWARM)) {
      const made = [];
      for (let i = 0; i < count; i += 1) {
        const mesh = acquireMesh(type);
        if (!mesh) break;
        made.push(mesh);
      }
      for (const mesh of made) releaseMesh(type, mesh);
    }
  }

  function releaseMesh(type, mesh) {
    if (!mesh) return;
    if (mesh.parent) mesh.parent.remove(mesh);
    mesh.visible = false;
    mesh.scale.setScalar(mesh.userData.baseScale || 1);
    let pool = pools.get(type);
    if (!pool) {
      pool = [];
      pools.set(type, pool);
    }
    if (pool.length < 8) pool.push(mesh);
  }

  /* ------------------------------------------------------------------ *
   * 6. Генерация мира                                                   *
   * ------------------------------------------------------------------ */

  function difficulty() {
    return clamp(state.distance / 2800, 0, 1);
  }

  function biomeIndexFor(distance) {
    // После дельты маршрут закольцовывается на пороги — но уже быстрее.
    let d = distance;
    if (d >= 4400) d = 1500 + ((d - 4400) % 2900);
    let index = 0;
    for (let i = 0; i < BIOMES.length; i += 1) if (d >= BIOMES[i].from) index = i;
    return index;
  }

  function weightedType(seed, weights) {
    const keys = Object.keys(weights).filter((key) => weights[key] > 0);
    let total = 0;
    for (const key of keys) total += weights[key];
    let roll = hash(seed, 5) * total;
    for (const key of keys) {
      roll -= weights[key];
      if (roll <= 0) return key;
    }
    return keys[keys.length - 1] || 'rock';
  }

  /*
    Интервал между рядами задаётся временем на реакцию, а не метрами.
    Раньше это были фиксированные 27→17.5 м: на разгоне и под «дыханием
    ветра» те же метры пролетали за треть секунды, ряды сходились в кашу, и
    уклоняться было уже нечем — смена дорожки одна занимает четверть секунды.
    Метровый минимум остаётся, чтобы на медленном старте не было пустоты.
  */
  function rowGap() {
    const d = difficulty();
    const beat = mix(1.45, .92, d);
    return Math.max(mix(24, 16, d), state.speed * beat);
  }

  /*
    Строит одну линию препятствий. Инварианты:
      * не больше двух дорожек, которые закрыты «наглухо»;
      * хотя бы одна дорожка достижима из предыдущей линии;
      * сплошные стены (вся линия под прыжок или под нырок) появляются
        только со средней сложности и не подряд.
  */
  function generateRow(z, rowIndex) {
    const d = difficulty();
    if (rowIndex <= 2) {
      // Разгонная зона: только лотосы, чтобы старт не убивал сразу.
      for (let i = 0; i < 3; i += 1) addItem('lotus', 1, z - i * 2.6);
      return;
    }
    const biome = BIOMES[state.biome];
    const weights = biome.weights;
    const cells = [null, null, null];

    const wallRoll = hash(z, 9);
    const canWall = d > .34 && rowIndex - state.lastWallRow > 4;
    if (canWall && wallRoll > .93) {
      // Стена под прыжок: три бревна подряд.
      state.lastWallRow = rowIndex;
      for (let lane = 0; lane < 3; lane += 1) cells[lane] = 'log';
    } else if (canWall && wallRoll < .045 && weights.gate > 0) {
      // Стена под нырок: сплошные заросли папируса.
      state.lastWallRow = rowIndex;
      for (let lane = 0; lane < 3; lane += 1) cells[lane] = 'gate';
    } else {
      let count = 1;
      if (hash(z, 11) > mix(.78, .34, d)) count = 2;
      if (d > .55 && hash(z, 12) > .9) count = 3;
      const order = [0, 1, 2].sort((a, b) => hash(z + a, rowIndex + 2) - hash(z + b, rowIndex + 2));
      let ground = 0;
      for (let i = 0; i < count; i += 1) {
        const lane = order[i];
        let type = weightedType(z + lane * 3.7 + rowIndex, weights);
        // Скелеты бегемота ещё не подъехали — ставим камень, у него та же
        // «наглухо» закрытая дорожка, поэтому проходимость ряда не меняется.
        if (type === 'hippo' && !hippoAvailable()) type = 'rock';
        if (OBSTACLES[type].clearance === 'ground' && ground >= 2) {
          type = hash(z + lane, 17) > .5 ? 'log' : 'gate';
        }
        if (OBSTACLES[type].clearance === 'ground') ground += 1;
        cells[lane] = type;
      }
    }

    // Проверка проходимости: «наглухо» закрытые дорожки не должны отрезать
    // все варианты от того, где игрок мог оказаться на прошлой линии.
    const blocked = cells.map((type) => !!type && OBSTACLES[type].clearance === 'ground');
    const reach = [false, false, false];
    let any = false;
    for (let lane = 0; lane < 3; lane += 1) {
      if (blocked[lane]) continue;
      for (let from = 0; from < 3; from += 1) {
        if (state.reachable[from] && Math.abs(from - lane) <= (d > .7 ? 1 : 2)) {
          reach[lane] = true;
          any = true;
          break;
        }
      }
    }
    if (!any) {
      // Расчищаем ближайшую к игроку дорожку, чтобы линия осталась проходимой.
      const lane = state.reachable.findIndex(Boolean);
      const target = lane < 0 ? 1 : lane;
      cells[target] = null;
      blocked[target] = false;
      reach[target] = true;
    }
    state.reachable = reach.some(Boolean) ? reach : [true, true, true];

    for (let lane = 0; lane < 3; lane += 1) {
      if (cells[lane]) addItem(cells[lane], lane, z - hash(z + lane, 21) * 1.6);
    }

    // Награда живёт на свободной дорожке — иначе собирать её негде.
    const free = [];
    for (let lane = 0; lane < 3; lane += 1) if (!cells[lane]) free.push(lane);
    if (!free.length) free.push(cells.findIndex((type) => type && OBSTACLES[type].clearance !== 'ground'));
    const lane = free[Math.floor(hash(z, 27) * free.length) % free.length];
    if (lane < 0) return;

    const roll = hash(z, 33);
    if (roll > .975) addItem('mercy', lane, z - 2.4);
    else if (roll > .952) addItem('rush', lane, z - 2.4);
    else if (roll > .924) addItem('shield', lane, z - 2.4);
    else if (roll > .888) addItem('magnet', lane, z - 2.4);
    else {
      // Дорожка лотосов: три-шесть цветов подряд, иногда дугой над водой.
      const chainLength = 3 + Math.floor(hash(z, 41) * 3);
      const arc = hash(z, 43) > .78;
      for (let i = 0; i < chainLength; i += 1) {
        const item = addItem('lotus', lane, z - 2.2 - i * 2.6);
        if (arc) item.hover = Math.sin((i + 1) / (chainLength + 1) * Math.PI) * .58;
      }
    }
  }

  function addItem(type, laneIndex, z) {
    const spec = OBSTACLES[type] || PICKUPS[type] || { radius: 1 };
    const item = {
      type,
      lane: laneIndex,
      x: LANES[laneIndex],
      z,
      radius: spec.radius,
      clearance: OBSTACLES[type]?.clearance || null,
      hover: 0,
      phase: hash(z, laneIndex) * Math.PI * 2,
      scored: false,
      surface: 1,
      bite: 0,
      lunged: false,
      surfaced: false,
      snap: 0,
      snapped: false,
      gape: 0,
      clapped: false,
      mesh: null,
      shadow: null,
    };
    if (z > MESH_RANGE) attachMesh(item);
    state.items.push(item);
    return item;
  }

  /*
    Меш создаётся только когда ряд подходит на дистанцию видимости.
    Так одновременно живёт полтора десятка объектов вместо шести десятков.
  */
  const contactGeometry = { value: null };
  const contactShadowMap = { value: null };
  /*
    Контактное пятно под объектом. Раньше это был ровный тёмный круг поверх
    воды: он читался как приклеенный блин, из-за него объекты казались
    парящими, а подводных крокодилов было видно сквозь него. Теперь это
    мягкий градиент, который перемножается с водой, а не закрашивает её.
  */
  function contactShadowTexture() {
    if (contactShadowMap.value) return contactShadowMap.value;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 128;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, 128, 128);
    // Тень живёт в альфе, а не в цвете. Умножение здесь не годится: холст
    // прозрачный и лежит поверх страницы, поэтому blendFunc(ZERO, SRC_COLOR)
    // выедает альфу кадра и вместо тени появляется светлый прямоугольник.
    const gradient = ctx.createRadialGradient(64, 64, 2, 64, 64, 63);
    gradient.addColorStop(0, 'rgba(22, 30, 20, .55)');
    gradient.addColorStop(.45, 'rgba(24, 32, 22, .30)');
    gradient.addColorStop(.78, 'rgba(26, 34, 24, .08)');
    gradient.addColorStop(1, 'rgba(26, 34, 24, 0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 128, 128);
    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    contactShadowMap.value = texture;
    return texture;
  }

  function makeContactShadow(radius) {
    if (!contactGeometry.value) contactGeometry.value = new THREE.PlaneGeometry(2, 2);
    const shadow = new THREE.Mesh(
      contactGeometry.value,
      new THREE.MeshBasicMaterial({
        map: contactShadowTexture(),
        transparent: true,
        opacity: .9,
        depthWrite: false,
        fog: false,
      }),
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.scale.set(radius * 1.15, radius * .78, 1);
    shadow.position.y = .008;
    shadow.renderOrder = 4;
    shadow.name = 'V751ContactPatch';
    return shadow;
  }

  /*
    Высота, на которой предмет ждёт, пока до него не дошла анимация: дальше
    ста восьми метров она не считается вовсе. Раньше все ждали на нуле, у
    самой воды, и хищники ехали шестьдесят метров по поверхности, а на подходе
    демонстративно ныряли — игрок видел засаду задолго до неё. Теперь
    крокодил и бегемот ждут под водой, где им и место.
  */
  const IDLE_Y = { hippo: -4.2, croc: -1.35, lotus: -.02 };

  function attachMesh(item) {
    if (item.mesh || !scene || state.fallback) return;
    const mesh = acquireMesh(item.type);
    if (!mesh) return;
    mesh.position.set(item.x, IDLE_Y[item.type] ?? .02, item.z);
    mesh.userData.type = item.type;
    const cast = shadowsOn && !!item.clearance;
    mesh.traverse((node) => {
      if (node.isMesh) {
        node.castShadow = cast;
        node.receiveShadow = true;
      }
    });
    scene.add(mesh);
    item.mesh = mesh;
    if (!item.shadow && item.type !== 'gate') {
      item.shadow = makeContactShadow((OBSTACLES[item.type]?.radius || .9) * 1.15);
      scene.add(item.shadow);
    }
  }

  function removeItem(index) {
    const [item] = state.items.splice(index, 1);
    if (item?.mesh) releaseMesh(item.type, item.mesh);
    if (item?.shadow) { scene.remove(item.shadow); item.shadow = null; }
  }

  function clearItems() {
    for (const item of state.items) {
      if (item.mesh) releaseMesh(item.type, item.mesh);
      if (item.shadow) scene.remove(item.shadow);
      item.shadow = null;
    }
    state.items.length = 0;
  }

  function streamWorld(dt) {
    state.spawnZ += state.speed * dt;
    let guard = 0;
    while (state.spawnZ > -TUNE.spawnAhead && guard < 12) {
      const gap = rowGap();
      state.spawnZ -= gap;
      state.rowIndex += 1;
      generateRow(state.spawnZ, state.rowIndex);
      guard += 1;
    }
  }

  /* ------------------------------------------------------------------ *
   * 7. Игровая логика                                                   *
   * ------------------------------------------------------------------ */

  function updateHud() {
    if (dom.distance) dom.distance.textContent = String(Math.floor(state.distance));
    if (dom.score) dom.score.textContent = String(state.lotuses);
    if (dom.total) dom.total.textContent = String(Math.floor(state.score));
    if (dom.comboValue) dom.comboValue.textContent = `×${state.multiplier}`;
    if (dom.combo) dom.combo.classList.toggle('is-live', state.multiplier > 1);
    if (dom.hearts) {
      const nodes = dom.hearts.children;
      for (let i = 0; i < nodes.length; i += 1) nodes[i].classList.toggle('is-lost', i >= state.hearts);
    }
  }

  function setBuff(node, active) {
    // Плашка стала флексом ради иконки — block её бы разложил в строку.
    if (node) node.style.display = active ? 'flex' : 'none';
  }

  function resetGame() {
    clearItems();
    state.lane = 1;
    state.x = 0;
    state.targetX = 0;
    state.y = 0;
    state.vy = 0;
    state.airborne = false;
    state.dive = 0;
    state.inputLock = 0;
    state.distance = 0;
    state.lotuses = 0;
    state.score = 0;
    state.speed = TUNE.baseSpeed;
    state.hearts = TUNE.maxHearts;
    state.invulnerable = 0;
    state.shield = 0;
    state.magnet = 0;
    state.rush = 0;
    state.combo = 0;
    state.comboTimer = 0;
    state.multiplier = 1;
    state.nearMisses = 0;
    state.milestone = 0;
    state.runTime = 0;
    state.over = false;
    state.paused = false;
    state.rowIndex = 0;
    state.lastWallRow = -10;
    state.reachable = [true, true, true];
    state.biome = 0;
    state.spawnZ = -20;
    setBuff(dom.shield, false);
    setBuff(dom.magnet, false);
    setBuff(dom.rush, false);
    if (shieldBubble) shieldBubble.visible = false;
    if (player?.userData.aura) player.userData.aura.visible = false;
    fx?.reset?.();
    applyLookCss(BIOMES[0]);
    applyLook(BIOMES[0], 1);
    for (let i = 0; i < 11; i += 1) {
      const gap = rowGap();
      state.spawnZ -= gap;
      state.rowIndex += 1;
      generateRow(state.spawnZ, state.rowIndex);
    }
    if (player) player.position.set(0, .10, 0);
    updateHud();
  }

  function startGame() {
    if (!state.ready) return;
    window.gameAudio?.init?.();
    window.gameAudio?.playStart?.();
    window.gameAudio?.setMenuMode?.(false);
    dom.startScreen?.classList.add('hidden');
    dom.gameOverScreen?.classList.add('hidden');
    dom.pauseScreen?.classList.add('hidden');
    dom.body.classList.add('is-playing');
    dom.body.classList.remove('is-over');
    resetGame();
    state.playing = true;
    showHintOnce();
    toast(BIOMES[0].title, BIOMES[0].subtitle, 'gold');
    haptic('medium');
  }

  /* ------------------------------------------------------------------ *
   * 7.1 Обучение                                                        *
   * ------------------------------------------------------------------ */

  /*
    Шесть шагов: управление, лотосы и четыре усилителя. Числа берутся из
    TUNE, а не переписываются руками, — иначе обучение и игра однажды
    разъедутся, и щит будет держаться в тексте восемь секунд, а на воде пять.
  */
  const TUTORIAL = [
    {
      scene: 'move',
      title: 'Ведите корзинку',
      text: 'Три дорожки на реке. Меняйте дорожку кнопками, стрелками или свайпом. Свайп вверх поднимает корзинку на волне — через бревно; свайп вниз топит её — под нависшим папирусом.',
      effect: '',
    },
    {
      scene: 'lotus',
      title: 'Лотосы',
      text: 'Главная добыча. Каждый цветок наращивает комбо и множитель очков — собранные подряд стоят дороже, чем поодиночке.',
      effect: '+12 очков за цветок, умножается на комбо',
    },
    {
      scene: 'shield',
      title: 'Щит веры',
      text: 'Пузырь обволакивает корзинку. Один удар — камень, крокодил, борт ладьи — пройдёт мимо, и путь продолжится без потери сердца.',
      effect: () => `Держится ${TUNE.shieldTime} секунд · гасит один удар`,
    },
    {
      scene: 'magnet',
      title: 'Свет Мириам',
      text: 'Корзинку окружает золотое сияние, и лотосы сами сворачивают к ней с соседних дорожек. Комбо при этом почти не рвётся.',
      effect: () => `Держится ${TUNE.magnetTime} секунд · лотосы идут в руки`,
    },
    {
      scene: 'rush',
      title: 'Дыхание ветра',
      text: 'Течение подхватывает корзинку и несёт вперёд. Метры набегают быстрее, но и препятствия подходят быстрее — смотрите на дорожку вперёд.',
      effect: () => `Держится ${TUNE.rushTime} секунд · скорость ×${TUNE.rushBoost}`,
    },
    {
      scene: 'mercy',
      title: 'Милость',
      text: 'Возвращает потерянное сердце. Если все три на месте, милость обращается в очки — подбирать её всё равно стоит.',
      effect: () => `+1 сердце (до ${TUNE.maxHearts}) · иначе +120 очков`,
    },
  ];

  let tutorialStep = 0;
  let tutorialOpen = false;

  function renderTutorial() {
    const step = TUTORIAL[tutorialStep];
    if (!step) return;
    for (const scene of dom.tutScenes) {
      scene.classList.toggle('is-live', scene.dataset.scene === step.scene);
    }
    if (dom.tutTitle) dom.tutTitle.textContent = step.title;
    if (dom.tutText) dom.tutText.textContent = step.text;
    if (dom.tutEffect) dom.tutEffect.textContent = typeof step.effect === 'function' ? step.effect() : step.effect;
    if (dom.tutDots) {
      dom.tutDots.innerHTML = '';
      for (let i = 0; i < TUTORIAL.length; i += 1) {
        const dot = document.createElement('i');
        if (i === tutorialStep) dot.className = 'is-live';
        dom.tutDots.appendChild(dot);
      }
    }
    if (dom.tutBack) dom.tutBack.style.visibility = tutorialStep === 0 ? 'hidden' : 'visible';
    if (dom.tutNext) dom.tutNext.textContent = tutorialStep === TUTORIAL.length - 1 ? 'ПОНЯТНО' : 'ДАЛЬШЕ';
    if (dom.tutSkip) dom.tutSkip.style.visibility = tutorialStep === TUTORIAL.length - 1 ? 'hidden' : 'visible';
  }

  function openTutorial(step = 0) {
    if (!dom.tutorial) return;
    tutorialStep = clamp(step, 0, TUTORIAL.length - 1);
    tutorialOpen = true;
    renderTutorial();
    dom.tutorial.classList.remove('hidden');
    dom.body.classList.add('is-tutorial');
    dom.startScreen?.classList.add('hidden');
  }

  function closeTutorial() {
    if (!dom.tutorial) return;
    tutorialOpen = false;
    dom.tutorial.classList.add('hidden');
    dom.body.classList.remove('is-tutorial');
    // Анимации сцен не крутятся вхолостую, пока обучение закрыто.
    for (const scene of dom.tutScenes) scene.classList.remove('is-live');
    if (!state.playing) dom.startScreen?.classList.remove('hidden');
    try { localStorage.setItem(TUTORIAL_KEY, '1'); } catch { /* приватный режим */ }
  }

  function stepTutorial(delta) {
    const next = tutorialStep + delta;
    if (next < 0) return;
    if (next >= TUTORIAL.length) { closeTutorial(); return; }
    tutorialStep = next;
    renderTutorial();
    haptic('light');
  }

  // Первый запуск: обучение открывается само, дальше — только по кнопке «?».
  function openTutorialOnFirstRun() {
    let seen = false;
    try { seen = localStorage.getItem(TUTORIAL_KEY) === '1'; } catch { seen = false; }
    if (seen) return;
    openTutorial(0);
  }

  function showHintOnce() {
    if (!dom.hint) return;
    let seen = false;
    try { seen = localStorage.getItem(HINT_KEY) === '1'; } catch {}
    if (seen) return;
    dom.hint.classList.add('is-visible');
    setTimeout(() => dom.hint.classList.remove('is-visible'), 4200);
    try { localStorage.setItem(HINT_KEY, '1'); } catch {}
  }

  function endGame(message) {
    if (state.over) return;
    state.playing = false;
    state.over = true;
    dom.body.classList.remove('is-playing');
    dom.body.classList.add('is-over');
    const distance = Math.floor(state.distance);
    const score = Math.floor(state.score);
    if (dom.fail) dom.fail.textContent = message;
    if (dom.finalDistance) dom.finalDistance.textContent = `${distance} м`;
    if (dom.finalScore) dom.finalScore.textContent = String(state.lotuses);
    if (dom.finalTotal) dom.finalTotal.textContent = String(score);
    const isRecord = score > (state.best.score || 0);
    if (isRecord) {
      state.best = { score, distance, lotuses: state.lotuses };
      writeBest();
      showBestOnStart();
    }
    if (dom.bestLine) {
      dom.bestLine.textContent = isRecord
        ? `Новый рекорд! Прошлый лучший результат превзойдён.`
        : `Лучший результат: ${state.best.score || 0} · ${state.best.distance || 0} м`;
      dom.bestLine.classList.toggle('is-record', isRecord);
    }
    dom.gameOverScreen?.classList.remove('hidden');
    window.gameAudio?.playGameOver?.();
    window.gameAudio?.setMenuMode?.(true);
    fx?.shake?.(.5, 2.4);
    flash('rgba(120, 34, 22, .45)', 520);
    haptic('heavy');
  }

  function togglePause(force) {
    if (!state.playing) return;
    const next = force === undefined ? !state.paused : force;
    state.paused = next;
    dom.pauseScreen?.classList.toggle('hidden', !next);
    dom.body.classList.toggle('is-paused', next);
    if (next) window.gameAudio?.suspend?.();
    else window.gameAudio?.resume?.();
  }

  function quitToMenu() {
    state.playing = false;
    state.paused = false;
    state.over = false;
    dom.pauseScreen?.classList.add('hidden');
    dom.gameOverScreen?.classList.add('hidden');
    dom.body.classList.remove('is-playing', 'is-paused', 'is-over');
    dom.startScreen?.classList.remove('hidden');
    clearItems();
    window.gameAudio?.resume?.();
    window.gameAudio?.setMenuMode?.(true);
  }

  function steer(direction) {
    if (!state.playing || state.paused || state.inputLock > 0) return;
    const next = clamp(state.lane + direction, 0, LANES.length - 1);
    if (next === state.lane) return;
    state.lane = next;
    state.targetX = LANES[state.lane];
    state.inputLock = TUNE.inputCooldown;
    window.gameAudio?.playSplash?.();
    if (!state.fallback && player) {
      fx?.splash?.(state.x, .05, .3, .8);
      fx?.ripple?.(state.x, .015, .4, .6, 3.2, .9, .34);
      fx?.ripple?.(state.x - direction * 1.2, .015, .1, .5, 2.4, .8, .24);
      emitSwipeWave(state.x, direction);
    }
    haptic('light');
  }

  /* Прыжок на гребне волны — способ обойти «низкие» помехи. */
  function jump() {
    if (!state.playing || state.paused || state.airborne || state.dive > 0) return;
    state.airborne = true;
    state.vy = TUNE.jumpImpulse;
    window.gameAudio?.playJump?.();
    if (!state.fallback) {
      fx?.splash?.(state.x, .05, -.2, 1.5);
      fx?.ripple?.(state.x, .015, 0, .8, 4.2, .9, .5);
    }
    haptic('medium');
  }

  /* Нырок под нависшие заросли. */
  function dive() {
    if (!state.playing || state.paused || state.dive > 0) return;
    if (state.airborne) {
      // Резкое приводнение вместо ожидания дуги.
      state.vy = -TUNE.jumpImpulse;
      return;
    }
    state.dive = TUNE.diveDuration;
    window.gameAudio?.playDive?.();
    if (!state.fallback) {
      fx?.splash?.(state.x, .05, .1, 1.9, [.86, .90, .78]);
      fx?.ripple?.(state.x, .015, .1, 1, 5, 1, .55);
    }
    haptic('medium');
  }

  function addScore(amount) {
    state.score += amount * (state.rush > 0 ? 2 : 1);
  }

  function bumpCombo() {
    state.combo += 1;
    state.comboTimer = TUNE.comboWindow;
    const next = 1 + Math.min(4, Math.floor(state.combo / 5));
    if (next !== state.multiplier) {
      state.multiplier = next;
      if (next > 1) {
        toast(`Комбо ×${next}`, 'Лотосы идут подряд', 'green');
        window.gameAudio?.playMilestone?.();
      }
    }
  }

  function breakCombo() {
    state.combo = 0;
    state.multiplier = 1;
    state.comboTimer = 0;
  }

  function destroyObstacle(item) {
    const color = item.type === 'croc' ? [.42, .58, .38] : [.72, .62, .45];
    fx?.burst?.(item.x, .35, item.z, color, 20, 1.3);
    fx?.splash?.(item.x, .05, item.z, 1.6);
    fx?.shake?.(.16, 5);
    addScore(25);
    window.gameAudio?.playSplash?.();
  }

  function takeHit(item) {
    if (state.rush > 0 || state.invulnerable > 0) {
      destroyObstacle(item);
      return true;
    }
    if (state.shield > 0) {
      state.shield = 0;
      setBuff(dom.shield, false);
      if (shieldBubble) shieldBubble.visible = false;
      destroyObstacle(item);
      state.invulnerable = .9;
      window.gameAudio?.playShieldBreak?.();
      flash('rgba(120, 220, 205, .35)', 320);
      toast('Щит выдержал', 'Но он был один', 'teal');
      haptic('heavy');
      return true;
    }
    state.hearts -= 1;
    state.invulnerable = TUNE.hitInvulnerability;
    state.speed = Math.max(TUNE.baseSpeed * .8, state.speed * .74);
    breakCombo();
    fx?.shake?.(.42, 3.2);
    fx?.splash?.(item.x, .05, item.z, 2.2, [.62, .5, .34]);
    flash('rgba(150, 40, 26, .38)', 420);
    window.gameAudio?.playHit?.();
    haptic('heavy');
    updateHud();
    if (state.hearts <= 0) {
      endGame(OBSTACLES[item.type]?.fail || 'Путь по Нилу прерван.');
      return false;
    }
    toast('Удар!', `Осталось сердец: ${state.hearts}`, 'red');
    return true;
  }

  function collectPickup(item) {
    if (item.type === 'lotus') {
      state.lotuses += 1;
      bumpCombo();
      addScore(12 * state.multiplier);
      fx?.burst?.(item.x, .4 + item.hover, item.z, [1, .78, .87], 14, .9);
      window.gameAudio?.playCollect?.(Math.min(8, state.combo));
      haptic('light');
      return true;
    }
    if (item.type === 'shield') {
      state.shield = TUNE.shieldTime;
      setBuff(dom.shield, true);
      if (shieldBubble) shieldBubble.visible = true;
      toast('Щит веры', 'Один удар пройдёт мимо', 'teal');
    } else if (item.type === 'magnet') {
      state.magnet = TUNE.magnetTime;
      setBuff(dom.magnet, true);
      if (player?.userData.aura) player.userData.aura.visible = true;
      toast('Свет Мириам', 'Лотосы сами идут в руки', 'gold');
    } else if (item.type === 'rush') {
      state.rush = TUNE.rushTime;
      setBuff(dom.rush, true);
      toast('Дыхание ветра', 'Течение несёт вперёд', 'blue');
    } else if (item.type === 'mercy') {
      if (state.hearts < TUNE.maxHearts) state.hearts += 1;
      else addScore(120);
      toast('Милость', 'Сердце восстановлено', 'pink');
    }
    addScore(45);
    fx?.burst?.(item.x, .6, item.z, [1, .93, .7], 22, 1.2);
    window.gameAudio?.playPowerup?.();
    haptic('medium');
    updateHud();
    return true;
  }

  function checkMilestones() {
    const next = Math.floor(state.distance / 500);
    if (next <= state.milestone) return;
    state.milestone = next;
    const bonus = 150 * next;
    addScore(bonus);
    toast(`${next * 500} метров`, `Бонус +${bonus}`, 'gold');
    window.gameAudio?.playMilestone?.();
  }

  function checkBiome() {
    const index = biomeIndexFor(state.distance);
    if (index === state.biome) return;
    state.biome = index;
    state.biomeBlend = 0;
    const biome = BIOMES[index];
    applyLookCss(biome);
    toast(biome.title, biome.subtitle, 'gold');
    if (dom.biomeName) dom.biomeName.textContent = biome.title;
    window.gameAudio?.playMilestone?.();
  }

  /*
    Страховка от наложения. Крокодил длиной в шесть с половиной метров, и
    даже с одним охотником два зверя из соседних рядов могут оказаться в
    одной точке — например, когда ряды идут вплотную на разгоне. Проход
    разводит тех, кто сошёлся ближе двух с половиной метров по X при разнице
    по Z меньше длины тела: обоих отталкивает симметрично, поэтому охота
    не ломается, а слипшейся пары на воде не бывает.
  */
  const CROC_KEEPOUT = 2.5;
  function separateCrocs(dt) {
    const crocs = [];
    for (const item of state.items) {
      if (item.type === 'croc' && item.z > MESH_RANGE && item.z < 14) crocs.push(item);
    }
    if (crocs.length < 2) return;
    const push = Math.min(1, dt * 6);
    for (let a = 0; a < crocs.length; a += 1) {
      for (let b = a + 1; b < crocs.length; b += 1) {
        const first = crocs[a];
        const second = crocs[b];
        if (Math.abs(first.z - second.z) > OBSTACLES.croc.size) continue;
        const gap = second.x - first.x;
        const distance = Math.abs(gap);
        if (distance >= CROC_KEEPOUT) continue;
        // Совпали в ноль — расталкиваем по знаку дорожек, иначе по текущему сдвигу.
        const dir = distance > 1e-3 ? Math.sign(gap) : (second.lane >= first.lane ? 1 : -1);
        const shift = (CROC_KEEPOUT - distance) * .5 * push;
        first.x -= dir * shift;
        second.x += dir * shift;
      }
    }
    const edge = LANES[2] + 1.2;
    for (const croc of crocs) croc.x = clamp(croc.x, -edge, edge);
  }

  function updateGameplay(dt) {
    state.inputLock = Math.max(0, state.inputLock - dt);
    state.x = damp(state.x, state.targetX, TUNE.laneDamp, dt);

    // Вертикаль: прыжок считается физикой, нырок — заданной дугой.
    if (state.airborne) {
      state.vy += TUNE.gravity * dt;
      state.y += state.vy * dt;
      if (state.y <= 0) {
        state.y = 0;
        state.vy = 0;
        state.airborne = false;
        if (state.playing && !state.fallback) {
          fx?.splash?.(state.x, .05, 0, 1.7);
          fx?.ripple?.(state.x, .015, 0, .7, 4, .8, .45);
        }
        window.gameAudio?.playSplash?.();
      }
    } else if (state.dive > 0) {
      state.dive = Math.max(0, state.dive - dt);
      const progress = 1 - state.dive / TUNE.diveDuration;
      state.y = TUNE.diveDepth * Math.sin(progress * Math.PI);
    } else {
      state.y = damp(state.y, 0, 12, dt);
    }

    if (!state.playing || state.paused) return;

    state.runTime += dt;
    const rushFactor = state.rush > 0 ? TUNE.rushBoost : 1;
    const target = Math.min(TUNE.maxSpeed, TUNE.baseSpeed + state.distance * TUNE.speedRamp);
    state.speed = damp(state.speed, target * rushFactor, 1.6, dt);
    state.distance += state.speed * dt;

    state.shield = Math.max(0, state.shield - dt);
    state.magnet = Math.max(0, state.magnet - dt);
    state.rush = Math.max(0, state.rush - dt);
    state.invulnerable = Math.max(0, state.invulnerable - dt);
    if (state.comboTimer > 0) {
      state.comboTimer -= dt;
      if (state.comboTimer <= 0) breakCombo();
    }
    if (state.shield === 0) {
      setBuff(dom.shield, false);
      if (shieldBubble) shieldBubble.visible = false;
    }
    if (state.magnet === 0) {
      setBuff(dom.magnet, false);
      if (player?.userData.aura) player.userData.aura.visible = false;
    }
    if (state.rush === 0) setBuff(dom.rush, false);

    addScore(state.speed * dt * .35);
    checkMilestones();
    checkBiome();
    streamWorld(dt);

    /*
      Право подкрадываться к дорожке игрока есть только у одного крокодила —
      ближайшего. Раньше к state.x тянулись все сразу: два зверя из соседних
      рядов сходились в одну точку и налезали друг на друга, а игрок видел
      одну кашу вместо двух препятствий. Остальные держат свою дорожку.
    */
    let stalker = null;
    for (const other of state.items) {
      if (other.type !== 'croc' || other.z >= -16 || other.z <= -70) continue;
      if (!stalker || other.z > stalker.z) stalker = other;
    }

    for (let i = state.items.length - 1; i >= 0; i -= 1) {
      const item = state.items[i];
      item.z += state.speed * dt;
      if (!item.mesh && item.z > MESH_RANGE) attachMesh(item);

      if (item.type === 'lotus') {
        if (state.magnet > 0 && item.z > -16) {
          // Тянет тем сильнее, чем ближе цветок: раньше он прыгал под корзинку рывком.
          const pull = clamp((item.z + 16) / 16, 0, 1);
          item.x = damp(item.x, state.x, 1.2 + pull * 2.4, dt);
          if (Math.random() < .12) fx?.mote?.(item.x, .35, item.z, [1, .88, .62], .07, .5);
        } else if (Math.abs(item.x - LANES[item.lane]) > .01) {
          // Магнит кончился — цветок плавно возвращается на свою дорожку.
          item.x = damp(item.x, LANES[item.lane], 1.8, dt);
        }
      }
      if (item.type === 'croc') {
        /*
          Крокодил идёт под водой почти до самой корзинки: издали видна только
          рябь, за сорок метров показывается спина, за двадцать он всплывает
          целиком и начинает хлопать пастью.
        */
        const approach = clamp((item.z + 46) / 28, 0, 1);
        item.surface = approach;
        const closing = clamp((item.z + 22) / 20, 0, 1);
        item.bite = closing * (.45 + .55 * Math.sin(state.elapsed * 7.5 + item.phase));
        if (difficulty() > .3 && item === stalker) {
          // Подкрадывается к дорожке игрока, но перестаёт за шестнадцать метров.
          item.x = damp(item.x, state.x, .55 + difficulty() * .9, dt);
        } else if (Math.abs(item.x - LANES[item.lane]) > .01) {
          item.x = damp(item.x, LANES[item.lane], 1.4, dt);
        }
        if (approach < .6 && Math.random() < .09) {
          // Под водой его выдаёт только расходящаяся рябь.
          fx?.ripple?.(item.x, .015, item.z, .4, 2.8, 1.2, .26);
        }
        if (!item.surfaced && approach > .5) {
          item.surfaced = true;
          window.gameAudio?.playGrowl?.();
          fx?.splash?.(item.x, .06, item.z, 1.8, [.55, .62, .44]);
          fx?.ripple?.(item.x, .015, item.z, .8, 4.4, 1, .45);
          // Всплыв, крокодил один раз широко распахивает и с силой
          // захлопывает пасть — этот щелчок и выдаёт его игроку.
          item.snap = 1;
        }
        if (item.snap > 0) {
          item.snap = Math.max(0, item.snap - dt * 1.7);
          const stage = 1 - item.snap;
          // Быстрый замах, резкий хлопок, короткое послесвечение.
          item.bite = stage < .42 ? (stage / .42) : Math.max(0, 1 - (stage - .42) / .2);
          if (!item.snapped && stage > .6) {
            item.snapped = true;
            window.gameAudio?.playHit?.();
            fx?.splash?.(item.x, .1, item.z + .8, 1.2, [.68, .7, .56]);
            fx?.ripple?.(item.x, .015, item.z + .6, .5, 3.2, 1.3, .38);
          }
        }
        if (!item.lunged && closing > .55 && Math.abs(item.x - state.x) < 2.6) {
          item.lunged = true;
          window.gameAudio?.playGrowl?.();
          fx?.splash?.(item.x, .06, item.z, 1.4, [.62, .66, .5]);
        }
      }
      if (item.type === 'hippo' && item.z > -74 && item.z < HIPPO_REVEAL + 6) {
        /*
          Честное предупреждение: самого зверя не видно, но вода над ним
          ходит кругами. Ближе к всплытию рябь чаще и шире — по ней игрок и
          понимает, что дорожку пора менять.
        */
        const near = clamp((item.z + 74) / 40, 0, 1);
        if (Math.random() < .05 + near * .09) {
          fx?.ripple?.(item.x, .015, item.z, .5 + near * .7, 3.2 + near * 3.4, 1.1, .2 + near * .22);
        }
      }
      if (item.type === 'vortex' && Math.abs(item.z) < 9 && Math.abs(item.x - state.x) < 4.2) {
        // Водоворот тянет корзинку к своей оси.
        const pull = (item.x - state.x) * 1.6 * dt * clamp(1 - Math.abs(item.z) / 9, 0, 1);
        state.targetX = clamp(state.targetX + pull, LANES[0] - 1, LANES[2] + 1);
      }

      const dx = Math.abs(item.x - state.x);
      const step = state.speed * dt;
      const inZ = item.z > -1.35 && item.z - step < 1.55;
      const reach = item.radius + .52;
      if (inZ && dx < reach) {
        if (item.clearance) {
          const cleared = (item.clearance === 'low' && state.y > TUNE.jumpClearance)
            || (item.clearance === 'high' && state.y < TUNE.diveClearance);
          if (!cleared) {
            const survived = takeHit(item);
            if (!state.playing) return;
            if (survived) { removeItem(i); continue; }
          } else if (!item.scored) {
            item.scored = true;
            state.nearMisses += 1;
            addScore(30);
            window.gameAudio?.playNearMiss?.();
          }
        } else {
          collectPickup(item);
          removeItem(i);
          continue;
        }
      } else if (item.clearance && !item.scored && item.z > 1.6 && dx < reach + TUNE.nearMissWindow) {
        // Разминулись на волосок — это тоже очки.
        item.scored = true;
        state.nearMisses += 1;
        addScore(20);
        fx?.spray?.(state.x, .06, .4, 1.2);
        window.gameAudio?.playNearMiss?.();
      }
      if (item.z > 12) removeItem(i);
    }

    separateCrocs(dt);

    // После водоворота корзинку медленно возвращает на свою дорожку.
    state.targetX = damp(state.targetX, LANES[state.lane], 1.1, dt);

    updateHud();
    window.gameAudio?.setIntensity?.(clamp((state.speed - TUNE.baseSpeed) / (TUNE.maxSpeed - TUNE.baseSpeed) * .7 + (state.multiplier - 1) * .1, 0, 1));
  }

  /* ------------------------------------------------------------------ *
   * 8. Свет, камера, кадр                                               *
   * ------------------------------------------------------------------ */

  const tmpColor = THREE ? new THREE.Color() : null;
  const BLACK = THREE ? new THREE.Color(0x0b0d10) : null;

  function applyLook(biome, blend) {
    if (!scene) return;
    const t = clamp(blend, 0, 1);
    if (!currentLook.fog) {
      currentLook.fog = new THREE.Color(biome.fog);
      currentLook.hemiSky = new THREE.Color(biome.hemiSky);
      currentLook.hemiGround = new THREE.Color(biome.hemiGround);
      currentLook.sunColor = new THREE.Color(biome.sunColor);
      currentLook.water = {
        deep: new THREE.Color(biome.water.deep),
        shallow: new THREE.Color(biome.water.shallow),
        sky: new THREE.Color(biome.water.sky),
        sun: new THREE.Color(biome.water.sun),
        foam: new THREE.Color(biome.water.foam),
        chop: biome.water.chop,
        glitter: biome.water.glitter,
        opacity: biome.water.opacity,
      };
      currentLook.exposure = biome.exposure;
      currentLook.sky = {
        zenith: new THREE.Color(biome.sky.zenith),
        haze: new THREE.Color(biome.sky.haze),
        horizon: new THREE.Color(biome.sky.horizon),
        sun: new THREE.Color(biome.sky.sun),
        storm: biome.sky.storm,
        stars: biome.sky.stars,
      };
    }
    currentLook.fog.lerp(tmpColor.set(biome.fog), t);
    currentLook.fogNear = mix(currentLook.fogNear, biome.fogNear, t);
    currentLook.fogFar = mix(currentLook.fogFar, biome.fogFar, t);
    currentLook.hemiSky.lerp(tmpColor.set(biome.hemiSky), t);
    currentLook.hemiGround.lerp(tmpColor.set(biome.hemiGround), t);
    currentLook.hemiPower = mix(currentLook.hemiPower, biome.hemiPower, t);
    currentLook.sunColor.lerp(tmpColor.set(biome.sunColor), t);
    currentLook.sunPower = mix(currentLook.sunPower, biome.sunPower, t);

    const water = currentLook.water;
    water.deep.lerp(tmpColor.set(biome.water.deep), t);
    water.shallow.lerp(tmpColor.set(biome.water.shallow), t);
    water.sky.lerp(tmpColor.set(biome.water.sky), t);
    water.sun.lerp(tmpColor.set(biome.water.sun), t);
    water.foam.lerp(tmpColor.set(biome.water.foam), t);
    water.chop = mix(water.chop, biome.water.chop, t);
    water.glitter = mix(water.glitter, biome.water.glitter, t);
    water.opacity = mix(water.opacity, biome.water.opacity, t);

    const air = currentLook.sky;
    air.zenith.lerp(tmpColor.set(biome.sky.zenith), t);
    air.haze.lerp(tmpColor.set(biome.sky.haze), t);
    air.horizon.lerp(tmpColor.set(biome.sky.horizon), t);
    air.sun.lerp(tmpColor.set(biome.sky.sun), t);
    air.storm = mix(air.storm, biome.sky.storm, t);
    air.stars = mix(air.stars, biome.sky.stars, t);

    if (scene.fog) {
      scene.fog.color.copy(currentLook.fog);
      scene.fog.near = currentLook.fogNear;
      scene.fog.far = currentLook.fogFar;
    }
    if (hemi) {
      hemi.color.copy(currentLook.hemiSky);
      hemi.groundColor.copy(currentLook.hemiGround);
      hemi.intensity = currentLook.hemiPower;
    }
    if (sun) {
      sun.color.copy(currentLook.sunColor);
      sun.intensity = currentLook.sunPower;
      sun.position.set(
        damp(sun.position.x, biome.sunPos[0], 2, t),
        damp(sun.position.y, biome.sunPos[1], 2, t),
        damp(sun.position.z, biome.sunPos[2], 2, t),
      );
    }
    if (rimLight) rimLight.intensity = mix(.16, .34, air.stars);
    if (backLight) {
      backLight.color.copy(air.sun);
      backLight.intensity = mix(.62, .3, air.stars);
    }
    if (waterMaterial?.uniforms) {
      const u = waterMaterial.uniforms;
      u.uDeep.value.copy(water.deep);
      u.uShallow.value.copy(water.shallow);
      u.uSky.value.copy(water.sky);
      u.uSunColor.value.copy(water.sun);
      u.uFoamColor.value.copy(water.foam);
      u.uChop.value = water.chop;
      u.uGlitter.value = water.glitter;
      u.uOpacity.value = water.opacity;
      if (sun) u.uSunDir.value.copy(sun.position).normalize();
    }
    if (sky?.material?.uniforms) {
      const u = sky.material.uniforms;
      u.uZenith.value.copy(air.zenith);
      u.uHaze.value.copy(air.haze);
      u.uHorizon.value.copy(air.horizon);
      u.uSunColor.value.copy(air.sun);
      u.uStorm.value = air.storm;
      u.uStars.value = air.stars;
      if (sun) u.uSunDir.value.copy(sun.position).normalize();
    }
    for (const sheet of dustSheets) {
      if (!sheet.material.uniforms) continue;
      sheet.material.uniforms.uColor.value.copy(air.haze);
    }
    for (const entry of decor) {
      if (entry.kind !== 'dune' && entry.kind !== 'pyramid') continue;
      entry.material.color.copy(air.haze).lerp(BLACK, entry.shade);
    }
    if (godrays?.material?.uniforms) {
      godrays.material.uniforms.uColor.value.copy(air.sun);
      // Лучи в пыли на прежней силе читались как засветка объектива: над
      // рекой стоял яркий вертикальный столб. Оставлен едва заметный намёк.
      godrays.material.uniforms.uStrength.value = mix(.06, .02, air.stars);
    }
    currentLook.exposure = mix(currentLook.exposure, biome.exposure, t);
    if (renderer) renderer.toneMappingExposure = currentLook.exposure;
    windUniform.value = mix(windUniform.value, biome.wind, t);
    applyLookCss(biome);
  }

  let lastCssBiome = -1;
  const hex = (value) => `#${value.toString(16).padStart(6, '0')}`;
  function applyLookCss(biome) {
    if (lastCssBiome === biome.id) return;
    lastCssBiome = biome.id;
    const root = dom.body.style;
    root.setProperty('--sky-zenith', hex(biome.sky.zenith));
    root.setProperty('--sky-haze', hex(biome.sky.haze));
    root.setProperty('--sky-horizon', hex(biome.sky.horizon));
    root.setProperty('--sky-sun', hex(biome.sky.sun));
    if (dom.sceneBg) dom.sceneBg.style.filter = biome.grade;
    if (dom.grade) dom.grade.style.backgroundImage = biome.overlay;
    dom.body.dataset.biome = biome.id;
  }

  function buildScene() {
    scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0xbba782, 54, 248);
    // Дальняя плоскость отодвинута под силуэт дюн за пирамидами, ближняя
    // поднята с 0.1 до 0.3, чтобы точность буфера глубины не просела: до
    // корзинки всё равно четыре метра.
    camera = new THREE.PerspectiveCamera(52, window.innerWidth / window.innerHeight, .3, 900);
    camera.position.set(0, 4.34, 10.4);

    // Небо задаёт рассеянный свет сферическими гармониками: без него
    // MeshStandardMaterial отражает пустоту и всё выглядит пластмассовым.
    window.NileMaterials?.init?.(renderer, scene);

    hemi = new THREE.HemisphereLight(0xffe8bd, 0x4f4838, .42);
    scene.add(hemi);
    sun = new THREE.DirectionalLight(0xffd39b, .92);
    sun.position.set(-22, 35, 18);
    sun.castShadow = renderer.shadowMap.enabled;
    // 2048 стоит вчетверо дороже 1024, а рамка тени всего 28×30 метров:
    // на такой площади разница на глаз не читается, зато на разгоне, когда
    // в кадре вдвое больше препятствий, кадр перестаёт проседать.
    const shadowSize = shadowsOn && detectTier() >= 2 ? 1536 : 1024;
    sun.shadow.mapSize.set(shadowSize, shadowSize);
    // Рамка тени держится вокруг корзинки: чем она плотнее, тем чётче край.
    sun.shadow.camera.left = -14;
    sun.shadow.camera.right = 14;
    sun.shadow.camera.top = 18;
    sun.shadow.camera.bottom = -12;
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 88;
    sun.shadow.bias = -.0006;
    sun.shadow.normalBias = .022;
    sun.shadow.radius = 2.2;
    sun.target.position.set(0, 0, -12);
    scene.add(sun);
    scene.add(sun.target);
    rimLight = new THREE.DirectionalLight(0x93afa0, .2);
    rimLight.position.set(9, 8, -15);
    scene.add(rimLight);
    // Контровой свет от горизонта: даёт объектам светящуюся кромку.
    backLight = new THREE.DirectionalLight(0xffd9a0, .5);
    backLight.position.set(-6, 4.5, -26);
    scene.add(backLight);

    buildSky();
    buildDunes();
    buildWater();
    buildBanks();
    buildBankDetail();
    buildPyramids();
    buildTorches();
    buildBirds();
    buildPlayer();
    buildSwipeWaves();

    window.__mosesV75Scene = scene;
    window.__mosesV75Camera = camera;
    window.__mosesV75Player = player;
    fx = window.NileFX?.create?.(THREE, scene, { capacity: detectTier() >= 1 ? 720 : 420 });
    fx?.setParticleScale?.(renderer.getPixelRatio());
    applyLook(BIOMES[0], 1);
    renderer.render(scene, camera);
  }

  function updateItems3D(dt, t) {
    for (const item of state.items) {
      const mesh = item.mesh;
      if (!mesh) continue;
      mesh.position.x = item.x;
      mesh.position.z = item.z;
      if (item.shadow) {
        // Пятно на воде живёт своей жизнью: сжимается, когда предмет уходит
        // под воду, и растёт, когда он поднимается над ней.
        item.shadow.position.set(item.x, .012, item.z);
        const lift = clamp(mesh.position.y + .3, 0, 2);
        item.shadow.material.opacity = clamp(.3 - lift * .12, .04, .3);
        const spread = 1 + lift * .25;
        const radius = (OBSTACLES[item.type]?.radius || .9) * 1.15;
        item.shadow.scale.set(radius * spread, radius * .62 * spread, 1);
      }
      if (item.type === 'hippo') {
        /*
          Бегемот — засада, а не декорация на горизонте. Пока корзинка не
          подошла на HIPPO_REVEAL, его нет ни в кадре, ни на воде: не видно
          ни туши, ни пятна под ней. Предупреждает только рябь.
        */
        const shown = item.z > HIPPO_REVEAL;
        if (mesh.visible !== shown) mesh.visible = shown;
        if (item.shadow) item.shadow.visible = shown;
        if (!shown) continue;
      }
      /*
        За горизонтом тумана анимация не читается, а считается: у крокодила
        это вершинный шейдер и пасть, у бегемота — всплытие и челюсть. На
        разгоне таких предметов в кадре вдвое больше, и кадр начинал плыть.
      */
      if (item.z < -108) continue;
      switch (item.type) {
        case 'lotus':
          mesh.rotation.y += dt * 1.15;
          mesh.position.y = -.02 + item.hover + Math.sin(t * 2.4 + item.phase) * .038;
          break;
        case 'shield':
        case 'magnet':
        case 'rush':
        case 'mercy': {
          mesh.position.y = .06 + Math.sin(t * 2.6 + item.phase) * .07;
          const token = mesh.userData.token;
          if (token) {
            token.rotation.y += dt * 1.35;
            token.rotation.z = Math.sin(t * 1.9 + item.phase) * .09;
          }
          if (mesh.userData.ring) {
            mesh.userData.ring.rotation.z += dt * 2.2;
            mesh.userData.ring.scale.setScalar(1 + Math.sin(t * 3.1 + item.phase) * .05);
          }
          if (mesh.userData.halo) mesh.userData.halo.uniforms.uTime.value = t;
          break;
        }
        case 'croc': {
          const surface = item.surface ?? 1;
          const bite = clamp(item.bite ?? 0, 0, 1);
          mesh.position.y = mix(-1.35, -.14, surface) + Math.sin(t * 2.6 + item.phase) * .04;
          mesh.rotation.z = Math.sin(t * 1.7 + item.phase) * .03;
          // Доворачивается мордой к добыче.
          mesh.rotation.y = clamp((state.x - item.x) * .09, -.4, .4) * surface;
          if (mesh.userData.body) {
            mesh.userData.body.rotation.x = -.06 - bite * .12;
            mesh.userData.body.rotation.z = Math.sin(t * 1.3 + item.phase) * .05;
          }
          if (mesh.userData.trail) mesh.userData.trail.uniforms.uTime.value = t + item.phase;
          if (mesh.userData.eyes) mesh.userData.eyes.visible = surface > .45;
          const swim = mesh.userData.crocUniforms;
          if (swim) {
            swim.time.value = t * 1.05 + item.phase;
            swim.swim.value = swim.amplitude * (.45 + surface * .85 + bite * .5);
            swim.bite.value = swim.biteRange * bite;
          }
          const jaw = mesh.userData.jaw;
          if (jaw) jaw.rotation.x = bite * .55 + Math.max(0, Math.sin(t * 1.4 + item.phase)) * .12;
          break;
        }
        case 'log':
          mesh.position.y = -.06 + Math.sin(t * 2.1 + item.phase) * .03;
          mesh.rotation.y = Math.PI / 2 + Math.sin(t * .7 + item.phase) * .09;
          break;
        case 'gate':
          mesh.position.y = .02;
          mesh.rotation.z = Math.sin(t * 1.1 + item.phase) * .035;
          break;
        case 'vortex': {
          mesh.position.y = -.04 + Math.sin(t * 1.6 + item.phase) * .02;
          const rings = mesh.userData.rings;
          if (rings) for (let i = 0; i < rings.length; i += 1) rings[i].rotation.z += dt * (2.2 - i * .4);
          // Воронка и пена крутятся с разной скоростью — так читается затягивание.
          if (mesh.userData.spiral) {
            mesh.userData.spiral.rotation.y -= dt * 3.4;
            mesh.userData.spiral.position.y = Math.sin(t * 2.2 + item.phase) * .04;
          }
          if (mesh.userData.funnel) mesh.userData.funnel.rotation.y += dt * 1.8;
          break;
        }
        case 'hippo': {
          /*
            Всплытие уложено в двадцать метров перед корзинкой: до этого зверь
            стоит на дне и не показывается вовсе, спина ломает воду примерно
            за двадцать шесть метров — секунда на смену дорожки на полном
            ходу. Раньше подъём растягивался на тридцать метров начиная с
            пятидесяти двух, и бегемот приезжал заранее и напоказ.
          */
          const rise = riseCurve(clamp((item.z - HIPPO_REVEAL) / HIPPO_RISE, 0, 1));
          const rig = mesh.userData.rig;
          if (rig) {
            // Сначала микшер прописывает кости, и только потом дописывается
            // челюсть: иначе анимация затрёт поворот в тот же кадр.
            rig.mixer?.update(dt);
            const reachR = clamp((item.z + 30) / 22, 0, 1);
            const aimR = clamp(1 - Math.abs(state.x - item.x) / 5.4, 0, 1);
            const passedR = clamp((item.z - .8) / 3.2, 0, 1);
            const targetR = rise * reachR * (1 - passedR) * (.42 + aimR * .58);
            item.gape = damp(item.gape || 0, targetR, passedR > 0 ? 22 : 5.5, dt);
            if (rig.jaw && rig.jawRest) {
              rig.spin.setFromAxisAngle(hippoAxis('jaw'), item.gape * HIPPO_JAW_RANGE);
              rig.jaw.quaternion.copy(rig.jawRest).multiply(rig.spin);
            }
            if (rig.head && rig.headRest) {
              // Голова доворачивается за корзинкой — по ней и видно, что
              // бегемот следит, а не просто торчит из воды.
              const track = clamp((state.x - item.x) * .1, -.36, .36) * rise * reachR;
              rig.spin.setFromAxisAngle(hippoAxis('head'), track);
              rig.head.quaternion.copy(rig.headRest).multiply(rig.spin);
            }
            // Бегемот стоит на дне: над водой у него остаются спина и голова,
            // а не весь зверь целиком — модель высотой в два с половиной метра.
            mesh.position.y = mix(IDLE_Y.hippo, -1.32, rise) + Math.sin(t * .8 + item.phase) * .09 * rise;
            mesh.rotation.y = HIPPO_FACING + Math.sin(t * .4 + item.phase) * .06;
            if (!item.surfaced && rise > .42) {
              // Спина проламывает воду — только в этот момент игрок и узнаёт,
              // что перед ним не пустая дорожка.
              item.surfaced = true;
              window.gameAudio?.playGrowl?.();
              fx?.splash?.(item.x, .1, item.z, 2.6, [.82, .8, .76]);
              fx?.ripple?.(item.x, .015, item.z, 1.1, 5.6, .9, .5);
            }
            if (!item.clapped && passedR > .5 && rise > .5) {
              item.clapped = true;
              window.gameAudio?.playHit?.();
              fx?.splash?.(item.x, .12, item.z, 1.5, [.78, .74, .72]);
            }
            if (rise > .2 && rise < .9 && Math.random() < .04) {
              fx?.splash?.(item.x, .05, item.z + 1.6, 1.1, [.72, .68, .7]);
            }
            break;
          }
          // Меш без скелета сюда не попадает: другого бегемота в игре нет.
          break;
        }
        case 'boat':
          mesh.position.y = -.12 + Math.sin(t * 1.5 + item.phase) * .04;
          mesh.rotation.z = Math.sin(t * 1.2 + item.phase) * .045;
          mesh.rotation.x = Math.sin(t * .9 + item.phase) * .025;
          if (mesh.userData.sail) mesh.userData.sail.rotation.y = Math.sin(t * 1.4 + item.phase) * .12;
          break;
        default:
          break;
      }
    }
  }

  /*
    Поведение фигур на берегу. Кости ищутся по именам один раз при сборке,
    здесь остаются только повороты — это дешевле любой готовой анимации и
    позволяет каждой фигуре жить в своём ритме.
  */
  function updateDecor(dt, t) {
    const night = currentLook.sky ? currentLook.sky.stars : 0;
    for (const entry of decor) {
      if (entry.scroll) {
        if (entry.walk) {
          entry.baseZ += entry.walk * dt * 1.1;
          if (entry.baseZ > 0) entry.baseZ -= SCROLL_TILE;
          if (entry.baseZ < -SCROLL_TILE) entry.baseZ += SCROLL_TILE;
        }
        let z = entry.baseZ + state.scroll;
        if (z > 18) z -= SCROLL_TILE;
        entry.object.position.z = z;
      }
      if (entry.kind === 'torch') {
        const flicker = .55 + Math.sin(t * 9 + entry.phase) * .18 + Math.sin(t * 21 + entry.phase) * .1;
        entry.flame.material.opacity = night * flicker;
        entry.flame.scale.setScalar(.85 + flicker * .35);
      }
    }
    for (const bird of birds) {
      const flap = Math.sin(t * 7 + bird.phase);
      bird.left.rotation.z = flap * .6;
      bird.right.rotation.z = -flap * .6;
      bird.group.position.x += Math.cos(bird.phase) * bird.speed * dt;
      bird.group.position.z += bird.speed * dt * .6;
      if (bird.group.position.z > 30) {
        bird.group.position.set((Math.random() - .5) * 90, 22 + Math.random() * 16, -190 - Math.random() * 60);
      }
    }
  }

  function update3D(dt) {
    if (!scene || !player) return;
    const t = state.elapsed;
    timeUniform.value = t;

    // Мир едет навстречу: без этого предметы плыли к неподвижному берегу и
    // казалось, что корзинка стоит на месте.
    const flow = state.playing && !state.paused ? state.speed : TUNE.baseSpeed * .35;
    const speedT = clamp((state.speed - TUNE.baseSpeed) / (TUNE.maxSpeed - TUNE.baseSpeed), 0, 1);
    state.scroll = (state.scroll + flow * dt) % SCROLL_TILE;
    duneScrollUniform.value = state.scroll;
    /*
      Фаза течения копится, а не считается как время × скорость. Умножение
      сдвигало всю картину воды при каждом изменении скорости: на сбросе
      «дыхания ветра» множитель падал, и рисунок пены прыгал на uTime × Δ
      секунд назад — пена уезжала против течения.
    */
    state.flowRate = .8 + speedT * .9;
    state.flowPhase += state.flowRate * dt;
    for (const mesh of scrollLayers) mesh.position.z = state.scroll;
    for (const entry of bankMaterials) {
      const step = (flow * dt) / entry.metresPerRepeat;
      if (entry.material.map) entry.material.map.offset.y = (entry.material.map.offset.y - step) % 1;
      if (entry.material.normalMap) entry.material.normalMap.offset.y = (entry.material.normalMap.offset.y - step) % 1;
    }

    /*
      Переход между биомами. Раньше сюда уходил шаг dt/3, и на просевших
      кадрах смена времени суток растягивалась на десятки секунд: ночью вода
      оставалась дневной. Теперь это честное экспоненциальное сближение —
      скорость не зависит от частоты кадров.
    */
    if (state.biomeBlend < 1) {
      state.biomeBlend = Math.min(1, state.biomeBlend + dt / 2.6);
      applyLook(BIOMES[state.biome], 1 - Math.exp(-dt / .55));
    }

    /*
      Корзинку качает так же, как воду под ней: та же сумма синусов, что в
      вершинном шейдере реки, плюс крен от манёвра и дифферент от скорости.
      Раньше она просто чуть-чуть подрагивала и выглядела приклеенной.
    */
    player.position.x = state.x;
    const waveT = state.flowPhase;
    const chop = waterMaterial?.uniforms ? waterMaterial.uniforms.uChop.value : 1;
    const swellA = Math.sin(state.x * 0.42 + waveT * 1.05) * .085;
    const swellB = Math.sin(-state.x * 0.31 + waveT * 1.42 + .8) * .052;
    const swell = (swellA + swellB) * chop;
    const bob = swell + Math.sin(t * 3.7) * .012;
    player.position.y = .085 + state.y + bob * (state.airborne ? .18 : 1);

    const drift = state.targetX - state.x;
    const rollTarget = Math.sin(waveT * 1.35 + state.x * .3) * .055 * chop - drift * .16;
    const pitchTarget = Math.cos(waveT * 1.15) * .038 * chop - state.vy * .022 + speedT * .045;
    player.rotation.z = damp(player.rotation.z, state.airborne ? -drift * .1 : rollTarget, 7, dt);
    player.rotation.x = damp(player.rotation.x, state.airborne ? -state.vy * .05 : pitchTarget, 7, dt);
    player.rotation.y = damp(player.rotation.y, -drift * .12, 6, dt);
    if (basketVisual) {
      const squash = state.dive > 0 ? .84 : state.airborne ? 1.05 : 1;
      basketVisual.scale.setScalar(damp(basketVisual.scale.x, .62 * squash, 9, dt));
      // На прыжке корзинку слегка проворачивает вокруг оси — заметно на глаз.
      basketVisual.rotation.y = damp(basketVisual.rotation.y, Math.PI + (state.airborne ? Math.sin(t * 5) * .16 : 0), 6, dt);
    }
    if (player.userData.contact) {
      player.userData.contact.material.opacity = clamp(.22 - state.y * .12, .02, .24);
      player.userData.contact.scale.setScalar(clamp(1 - state.y * .18, .55, 1.1));
    }
    if (state.invulnerable > 0 && basketVisual) {
      basketVisual.visible = Math.floor(t * 14) % 2 === 0;
    } else if (basketVisual) {
      basketVisual.visible = true;
    }
    if (shieldBubble?.visible && shieldBubble.material.uniforms) {
      shieldBubble.material.uniforms.uTime.value = t;
      shieldBubble.material.uniforms.uPulse.value = state.shield < 2 ? .4 + Math.abs(Math.sin(t * 9)) * .6 : 1;
    }
    if (player.userData.aura?.visible && player.userData.aura.material.uniforms) {
      player.userData.aura.material.uniforms.uTime.value = t;
    }

    if (wake) {
      const shaderWake = wake.userData.shaderWake;
      if (shaderWake?.material?.uniforms) {
        shaderWake.material.uniforms.uTime.value = t;
        shaderWake.material.uniforms.uSpeed.value = state.speed / TUNE.baseSpeed;
        shaderWake.material.uniforms.uStrength.value = (state.playing ? .55 : .28) * clamp(1 - state.y, .25, 1);
      }
      const bow = wake.userData.bow;
      if (bow) {
        bow.material.opacity = (.20 + Math.sin(t * 5.1) * .05) * (state.playing ? 1 : .45) * clamp(1 - state.y, .2, 1);
        bow.scale.setScalar(1 + Math.sin(t * 4.3) * .06 + speedT * .18);
      }
      for (const child of wake.children) {
        if (child === shaderWake || child === bow) continue;
        if (child.material?.uniforms) {
          child.material.uniforms.uTime.value = t;
          child.material.uniforms.uSpeed.value = state.speed / TUNE.baseSpeed;
          child.material.uniforms.uStrength.value = (.34 + Math.sin(t * 2.3) * .05) * (state.playing ? 1 : .45);
        } else if (child.material?.opacity !== undefined) {
          child.material.opacity = (.16 + Math.sin(t * 2.3) * .03) * (state.playing ? 1 : .5);
        }
      }
    }

    // Камера: тянется за корзинкой, шире смотрит на скорости, дрожит от ударов.
    const shake = fx?.shakeOffset;
    camera.position.x = damp(camera.position.x, state.x * .74, 6, dt) + (shake?.x || 0);
    camera.position.y = damp(camera.position.y, 4.34 + state.y * .3 - speedT * .2, 5, dt) + (shake?.y || 0);
    camera.position.z = damp(camera.position.z, 10.4 - speedT * .55, 5, dt) + (shake?.z || 0) + Math.sin(t * 3.1) * speedT * .06;
    camera.rotation.z = fx?.shakeRoll || 0;
    const targetFov = 52 + speedT * 9 + (state.rush > 0 ? 5 : 0);
    if (Math.abs(camera.fov - targetFov) > .05) {
      camera.fov = damp(camera.fov, targetFov, 3, dt);
      camera.updateProjectionMatrix();
    }
    camera.lookAt(state.x * .84, .1 + state.y * .35, -16.5);

    // Источник тени едет за корзинкой: карта тени тратится на то, что в кадре.
    if (sun) {
      sun.position.set(state.x - 22, 35, 6);
      sun.target.position.set(state.x, 0, -14);
      sun.target.updateMatrixWorld();
    }

    if (waterMaterial?.uniforms) {
      const u = waterMaterial.uniforms;
      u.uTime.value = t;
      u.uFlow.value = state.flowRate;
      u.uPhase.value = state.flowPhase;
      // Мелкая детализация воды снимается вместе с общим качеством.
      if (u.uDetail) u.uDetail.value = state.quality > .82 ? 1 : 0;
      u.uPlayer.value.set(state.x, 0, 1.1);
      u.uWakeStrength.value = state.playing ? clamp(.55 - state.y * .4, 0, .6) : .2;
      // Шесть ближайших препятствий передаются в шейдер воды: вокруг них
      // расходится своя рябь, иначе объекты выглядят вклеенными в поверхность.
      const disturb = u.uDisturb.value;
      let slot = 0;
      for (const item of state.items) {
        if (slot >= disturb.length) break;
        if (!item.clearance || item.z < -34 || item.z > 10) continue;
        const near = clamp(1 - Math.abs(item.z) / 34, 0, 1);
        disturb[slot].set(item.x, item.z, near * (item.type === 'vortex' ? 1.1 : .72));
        slot += 1;
      }
      for (let i = slot; i < disturb.length; i += 1) disturb[i].set(0, 0, 0);

      if (waterNormal) {
        waterNormal.offset.x = (waterNormal.offset.x + dt * .0022) % 1;
        waterNormal.offset.y = (waterNormal.offset.y - dt * (.05 + speedT * .16)) % 1;
        u.uOffsetA.value.copy(waterNormal.offset);
      }
      if (waterDetailNormal) {
        waterDetailNormal.offset.x = (waterDetailNormal.offset.x - dt * .0041) % 1;
        waterDetailNormal.offset.y = (waterDetailNormal.offset.y - dt * (.09 + speedT * .24)) % 1;
        u.uOffsetB.value.copy(waterDetailNormal.offset);
      }
    } else if (waterPositions && waterBaseY) {
      // Запасной путь, если шейдер воды по какой-то причине не создался.
      for (let i = 0; i < waterPositions.count; i += 1) {
        const x = waterPositions.getX(i);
        const z = waterPositions.getZ(i);
        waterPositions.setY(i, waterBaseY[i] + Math.sin(z * .16 + t * 1.12 + x * .52) * .026);
      }
      waterPositions.needsUpdate = true;
    }
    if (waterSheen?.material?.uniforms) {
      waterSheen.material.uniforms.uTime.value = t;
      waterSheen.material.uniforms.uOffset.value.y = (t * -.35) % 1;
    }
    for (const shoreline of shorelines) {
      if (shoreline.material.uniforms) shoreline.material.uniforms.uTime.value = t;
    }
    if (sky) {
      // Купол едет за камерой, поэтому горизонт не «убегает» на поворотах.
      sky.position.copy(camera.position);
      if (sky.material.uniforms) sky.material.uniforms.uTime.value = t;
    }
    for (const sheet of dustSheets) {
      if (sheet.material.uniforms) sheet.material.uniforms.uTime.value = t;
    }
    if (godrays?.material?.uniforms) godrays.material.uniforms.uTime.value = t;

    updateItems3D(dt, t);
    updateDecor(dt, t);
    updateSwipeWaves(dt, flow, t);

    // Живые мелочи: брызги из-под корзинки и висящая в воздухе пыльца.
    if (state.playing && !state.paused) {
      fx?.spray?.(state.x, .04, .6, .3 + speedT * .8);
      const night = currentLook.sky ? currentLook.sky.stars : 0;
      if (Math.random() < .22) {
        const color = night > .5 ? [1, .86, .45] : [1, .93, .74];
        fx?.mote?.(state.x + (Math.random() - .5) * 16, .6 + Math.random() * 3.4, -22 - Math.random() * 30, color, night > .5 ? .13 : .07, 3.2);
      }
      // Взвесь, проносящаяся мимо камеры: без неё скорость не читается.
      const rushChance = .35 + speedT * .55;
      if (Math.random() < rushChance) {
        const dust = night > .5 ? [.72, .78, .95] : [1, .95, .82];
        fx?.spawn?.(
          state.x + (Math.random() - .5) * 22,
          .2 + Math.random() * 4.2,
          -34 - Math.random() * 26,
          (Math.random() - .5) * 1.2,
          (Math.random() - .5) * .6,
          flow * (.85 + Math.random() * .5),
          .05 + Math.random() * .09,
          1.5,
          dust,
          .5,
          .1,
          .08,
        );
      }
    }
    fx?.update?.(dt, t);
  }

  /* ------------------------------------------------------------------ *
   * 9. Запасной 2D-режим                                                *
   *                                                                     *
   * Работает, когда нет WebGL или не приехал three.js. Логика игры та   *
   * же самая — меняется только способ рисовать.                         *
   * ------------------------------------------------------------------ */

  const flat = {
    particles: [],
    cursor: 0,
    capacity: 90,
  };

  function flatSpawn(x, y, vx, vy, life, color, size) {
    if (flat.particles.length < flat.capacity) {
      flat.particles.push({ x, y, vx, vy, life, maxLife: life, color, size });
      return;
    }
    const p = flat.particles[flat.cursor % flat.capacity];
    flat.cursor += 1;
    p.x = x; p.y = y; p.vx = vx; p.vy = vy; p.life = life; p.maxLife = life; p.color = color; p.size = size;
  }

  function resizeFallback() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    dom.fallback.width = Math.max(1, Math.floor(window.innerWidth * dpr));
    dom.fallback.height = Math.max(1, Math.floor(window.innerHeight * dpr));
    dom.fallback.style.width = `${window.innerWidth}px`;
    dom.fallback.style.height = `${window.innerHeight}px`;
    fallbackContext = dom.fallback.getContext('2d');
    fallbackContext?.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function horizonY() {
    return window.innerHeight * .285;
  }

  function projectFallback(item) {
    const h = window.innerHeight;
    const w = window.innerWidth;
    const progress = clamp((item.z - FAR_Z) / (NEAR_Z - FAR_Z), 0, 1);
    const eased = progress * progress;
    const spread = mix(w * .035, w * .34, eased);
    const scale = mix(3, Math.min(w, h) * .105, eased);
    return {
      x: w * .5 + (item.x / LANES[2]) * spread,
      y: mix(horizonY(), h * .735, eased) - (item.hover || 0) * scale * .5,
      size: scale,
      alpha: clamp((progress - .05) * 2.2, 0, 1),
      eased,
    };
  }

  function skyTone(key, alpha) {
    const style = getComputedStyle(dom.body);
    const value = style.getPropertyValue(key).trim() || '#d6b784';
    if (alpha === undefined) return value;
    const hexValue = value.replace('#', '');
    const r = parseInt(hexValue.slice(0, 2), 16);
    const g = parseInt(hexValue.slice(2, 4), 16);
    const b = parseInt(hexValue.slice(4, 6), 16);
    return `rgba(${r},${g},${b},${alpha})`;
  }

  /* Горизонт запасного режима: дюны, силуэты пирамид и полосы пыли. */
  function drawFallbackSky(ctx) {
    const w = window.innerWidth;
    const hy = horizonY();
    const t = state.elapsed;

    const pyramids = [
      [.28, .30, .17], [.52, .40, .23], [.71, .26, .15], [.86, .17, .10], [.12, .15, .09],
    ];
    ctx.save();
    ctx.fillStyle = skyTone('--sky-haze', .55);
    for (const [cx, width, height] of pyramids) {
      const baseX = w * cx;
      const halfWidth = w * width * .5;
      const peak = hy - hy * height * 1.5;
      ctx.beginPath();
      ctx.moveTo(baseX - halfWidth, hy);
      ctx.lineTo(baseX, peak);
      ctx.lineTo(baseX + halfWidth, hy);
      ctx.closePath();
      ctx.fill();
    }
    // Освещённая грань — иначе силуэты читаются как плоские треугольники.
    ctx.fillStyle = skyTone('--sky-sun', .16);
    for (const [cx, width, height] of pyramids) {
      const baseX = w * cx;
      const halfWidth = w * width * .5;
      const peak = hy - hy * height * 1.5;
      ctx.beginPath();
      ctx.moveTo(baseX, peak);
      ctx.lineTo(baseX + halfWidth, hy);
      ctx.lineTo(baseX, hy);
      ctx.closePath();
      ctx.fill();
    }

    ctx.fillStyle = skyTone('--sky-horizon', .5);
    ctx.beginPath();
    ctx.moveTo(0, hy);
    for (let i = 0; i <= 24; i += 1) {
      const x = (i / 24) * w;
      const crest = hy - (Math.sin(i * .9) * .5 + Math.sin(i * 2.3) * .3 + .8) * hy * .045;
      ctx.lineTo(x, crest);
    }
    ctx.lineTo(w, hy);
    ctx.closePath();
    ctx.fill();

    // Пыль: три полосы, ползущие с разной скоростью.
    for (let layer = 0; layer < 3; layer += 1) {
      ctx.fillStyle = skyTone('--sky-haze', .10 - layer * .022);
      const speed = .008 + layer * .02;
      const offset = ((t * speed) % 1) * w;
      const bandY = hy * (.42 + layer * .17);
      const bandH = hy * (.18 - layer * .03);
      for (let i = -1; i < 3; i += 1) {
        const x = i * w * .7 + offset;
        ctx.beginPath();
        ctx.ellipse(x, bandY, w * .42, bandH, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  function drawFallbackWorld(ctx) {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const hy = horizonY();
    const t = state.elapsed;
    drawFallbackSky(ctx);

    // Река: трапеция от горизонта к нижнему краю, полупрозрачная — эталонный
    // фон под ней остаётся виден.
    const nearHalf = w * .46;
    const farHalf = w * .045;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(w * .5 - farHalf, hy);
    ctx.lineTo(w * .5 + farHalf, hy);
    ctx.lineTo(w * .5 + nearHalf, h);
    ctx.lineTo(w * .5 - nearHalf, h);
    ctx.closePath();
    ctx.clip();

    const river = ctx.createLinearGradient(0, hy, 0, h);
    const night = state.biome === 3;
    river.addColorStop(0, skyTone('--sky-horizon', .95));
    river.addColorStop(.34, night ? 'rgba(30,48,70,.94)' : 'rgba(150,140,84,.94)');
    river.addColorStop(1, night ? 'rgba(12,20,32,.98)' : 'rgba(78,76,40,.98)');
    ctx.fillStyle = river;
    ctx.fillRect(0, hy, w, h - hy);

    // Бегущие волны: полосы, которые ускоряются по мере приближения.
    ctx.strokeStyle = night ? 'rgba(160,190,230,.16)' : 'rgba(255,244,208,.18)';
    for (let i = 0; i < 22; i += 1) {
      const phase = ((i / 22) + (t * (state.speed / 60)) % 1) % 1;
      const eased = phase * phase;
      const y = mix(hy, h, eased);
      const half = mix(farHalf, nearHalf, eased);
      ctx.lineWidth = Math.max(.6, eased * 3.4);
      ctx.globalAlpha = clamp(eased * 1.4, 0, 1) * .9;
      ctx.beginPath();
      for (let s = -1; s <= 1; s += .1) {
        const x = w * .5 + s * half;
        const wave = Math.sin(s * 7 + t * 2.4 + i) * eased * 5;
        if (s === -1) ctx.moveTo(x, y + wave); else ctx.lineTo(x, y + wave);
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // Дорожки: три светящиеся направляющие, чтобы читалась геометрия.
    ctx.strokeStyle = night ? 'rgba(150,190,235,.10)' : 'rgba(255,248,220,.12)';
    ctx.lineWidth = 1.4;
    for (const lane of LANES) {
      ctx.beginPath();
      ctx.moveTo(w * .5 + (lane / LANES[2]) * farHalf * .7, hy);
      ctx.lineTo(w * .5 + (lane / LANES[2]) * nearHalf * .78, h);
      ctx.stroke();
    }
    ctx.restore();

    // Берега: тёмные силуэты с тростником, движутся вместе с течением.
    ctx.save();
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(w * .5 + side * farHalf, hy);
      ctx.lineTo(w * .5 + side * nearHalf, h);
      ctx.lineTo(w * .5 + side * w, h);
      ctx.lineTo(w * .5 + side * w, hy);
      ctx.closePath();
      ctx.fillStyle = night ? 'rgba(16,22,32,.72)' : 'rgba(150,124,80,.62)';
      ctx.fill();
      ctx.strokeStyle = night ? 'rgba(30,48,40,.5)' : 'rgba(78,86,52,.42)';
      ctx.lineWidth = 2;
      for (let i = 0; i < 26; i += 1) {
        const phase = ((i / 26) + (t * (state.speed / 90)) % 1) % 1;
        const eased = phase * phase;
        const y = mix(hy, h, eased);
        const half = mix(farHalf, nearHalf, eased);
        const x = w * .5 + side * (half + eased * w * .04);
        const height = eased * h * .1;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.quadraticCurveTo(x + side * height * .25, y - height * .6, x + side * height * .1, y - height);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  function drawFallbackItem(ctx, item) {
    const p = projectFallback(item);
    if (p.alpha <= .01) return;
    ctx.save();
    ctx.globalAlpha = p.alpha;
    ctx.translate(p.x, p.y);

    // Контактная тень на воде — без неё предметы «висят».
    if (item.type !== 'gate') {
      ctx.fillStyle = 'rgba(20,24,16,.20)';
      ctx.beginPath();
      ctx.ellipse(0, p.size * .16, p.size * .34, p.size * .1, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    if (item.type === 'lotus') {
      ctx.fillStyle = '#47683d';
      ctx.beginPath(); ctx.ellipse(0, 0, p.size * .40, p.size * .18, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#e4a0ad';
      for (let i = 0; i < 7; i += 1) {
        const a = i / 7 * Math.PI * 2;
        ctx.beginPath();
        ctx.ellipse(Math.cos(a) * p.size * .12, -p.size * .07 + Math.sin(a) * p.size * .04, p.size * .09, p.size * .035, a, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = '#f0cd70';
      ctx.beginPath(); ctx.arc(0, -p.size * .08, p.size * .05, 0, Math.PI * 2); ctx.fill();
    } else if (item.type === 'rock') {
      ctx.fillStyle = '#6b6053';
      ctx.beginPath(); ctx.ellipse(0, 0, p.size * .40, p.size * .27, -.12, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(255,240,205,.22)';
      ctx.beginPath(); ctx.ellipse(-p.size * .1, -p.size * .09, p.size * .18, p.size * .1, -.3, 0, Math.PI * 2); ctx.fill();
    } else if (item.type === 'log') {
      ctx.strokeStyle = '#6c4a2c'; ctx.lineWidth = Math.max(2, p.size * .2); ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(-p.size * .48, 0); ctx.lineTo(p.size * .48, 0); ctx.stroke();
      ctx.strokeStyle = 'rgba(196,150,96,.7)'; ctx.lineWidth = Math.max(1, p.size * .05);
      ctx.beginPath(); ctx.moveTo(-p.size * .44, -p.size * .04); ctx.lineTo(p.size * .44, -p.size * .04); ctx.stroke();
    } else if (item.type === 'croc') {
      ctx.fillStyle = '#39503a';
      ctx.beginPath(); ctx.ellipse(0, 0, p.size * .46, p.size * .13, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-p.size * .74, p.size * .08); ctx.lineTo(-p.size * .42, -p.size * .06); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#7f8a5c';
      ctx.beginPath(); ctx.ellipse(p.size * .3, p.size * .03, p.size * .19, p.size * .07, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#f2dd93';
      ctx.beginPath(); ctx.arc(-p.size * .06, -p.size * .07, p.size * .035, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(p.size * .08, -p.size * .07, p.size * .035, 0, Math.PI * 2); ctx.fill();
    } else if (item.type === 'gate') {
      ctx.strokeStyle = '#6d7a45'; ctx.lineWidth = Math.max(2, p.size * .07); ctx.lineCap = 'round';
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(side * p.size * .42, p.size * .1);
        ctx.lineTo(side * p.size * .5, -p.size * .8);
        ctx.stroke();
      }
      ctx.beginPath(); ctx.moveTo(-p.size * .5, -p.size * .8); ctx.lineTo(p.size * .5, -p.size * .8); ctx.stroke();
      ctx.strokeStyle = '#53663a'; ctx.lineWidth = Math.max(1.4, p.size * .04);
      for (let i = 0; i < 9; i += 1) {
        const x = mix(-p.size * .46, p.size * .46, i / 8);
        ctx.beginPath(); ctx.moveTo(x, -p.size * .8); ctx.lineTo(x + (hash(i, 91) - .5) * p.size * .1, -p.size * .35); ctx.stroke();
      }
    } else if (item.type === 'vortex') {
      ctx.strokeStyle = 'rgba(190,210,190,.7)';
      for (let i = 0; i < 4; i += 1) {
        ctx.lineWidth = Math.max(1, p.size * (.05 - i * .008));
        ctx.beginPath();
        ctx.ellipse(0, 0, p.size * (.14 + i * .1), p.size * (.06 + i * .045), state.elapsed * (1.6 - i * .3), 0, Math.PI * 1.7);
        ctx.stroke();
      }
    } else if (item.type === 'hippo') {
      ctx.fillStyle = '#6b5a63';
      ctx.beginPath(); ctx.ellipse(0, 0, p.size * .42, p.size * .2, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(p.size * .3, -p.size * .06, p.size * .22, p.size * .16, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#241c14';
      ctx.beginPath(); ctx.arc(p.size * .26, -p.size * .14, p.size * .035, 0, Math.PI * 2); ctx.fill();
    } else if (item.type === 'boat') {
      ctx.fillStyle = '#8a6236';
      ctx.beginPath();
      ctx.moveTo(-p.size * .5, 0);
      ctx.quadraticCurveTo(0, p.size * .22, p.size * .5, 0);
      ctx.lineTo(p.size * .38, -p.size * .1);
      ctx.lineTo(-p.size * .38, -p.size * .1);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#efe3c6';
      ctx.beginPath(); ctx.moveTo(0, -p.size * .1); ctx.lineTo(0, -p.size * .62); ctx.lineTo(p.size * .3, -p.size * .2); ctx.closePath(); ctx.fill();
    } else {
      const tone = { shield: '#9bc4bc', magnet: '#e7c16c', rush: '#7fb8e6', mercy: '#e79bab' }[item.type] || '#e7c16c';
      ctx.fillStyle = tone;
      ctx.beginPath();
      ctx.moveTo(0, -p.size * .40); ctx.lineTo(p.size * .30, 0); ctx.lineTo(0, p.size * .40); ctx.lineTo(-p.size * .30, 0);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.55)';
      ctx.beginPath(); ctx.arc(0, 0, p.size * .11, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  function drawFallbackBasket(ctx) {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const anchor = projectFallback({ x: state.x, z: 0, hover: 0 });
    const x = anchor.x;
    const lift = state.y * anchor.size * .42;
    const y = anchor.y + Math.sin(state.elapsed * 2.2) * 2 - lift;
    const size = clamp(anchor.size * .78, 62, 108) * (state.dive > 0 ? .88 : 1);
    ctx.save();
    ctx.translate(x, y);

    // Расходящийся след: две дуги вместо прежних «паучьих лап».
    ctx.strokeStyle = 'rgba(244,235,203,.26)';
    ctx.lineWidth = Math.max(1.4, size * .016);
    ctx.lineCap = 'round';
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(side * size * .30, size * .22);
      ctx.quadraticCurveTo(side * size * .62, size * .38, side * size * .78, size * .58);
      ctx.stroke();
    }
    const shadow = ctx.createRadialGradient(0, size * .31, 0, 0, size * .31, size * .68);
    shadow.addColorStop(0, `rgba(15,19,13,${.32 - state.y * .12})`);
    shadow.addColorStop(1, 'rgba(15,19,13,0)');
    ctx.fillStyle = shadow;
    ctx.beginPath(); ctx.ellipse(0, size * .31 + lift * .6, size * .62, size * .24, 0, 0, Math.PI * 2); ctx.fill();

    if (state.shield > 0) {
      ctx.strokeStyle = `rgba(150,235,220,${.35 + Math.sin(state.elapsed * 6) * .12})`;
      ctx.lineWidth = Math.max(2, size * .035);
      ctx.beginPath(); ctx.ellipse(0, size * .04, size * .68, size * .52, 0, 0, Math.PI * 2); ctx.stroke();
    }
    if (state.invulnerable > 0 && Math.floor(state.elapsed * 14) % 2 === 0) {
      ctx.globalAlpha = .35;
    }

    const body = ctx.createLinearGradient(-size * .48, -size * .04, size * .45, size * .50);
    body.addColorStop(0, '#d69a50'); body.addColorStop(.37, '#915021'); body.addColorStop(.68, '#b86b2f'); body.addColorStop(1, '#e1a45b');
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.moveTo(-size * .47, -size * .04);
    ctx.bezierCurveTo(-size * .44, size * .28, -size * .34, size * .48, 0, size * .51);
    ctx.bezierCurveTo(size * .34, size * .48, size * .44, size * .28, size * .47, -size * .04);
    ctx.closePath();
    ctx.fill();

    ctx.save();
    ctx.clip();
    ctx.strokeStyle = 'rgba(68,35,16,.57)';
    ctx.lineWidth = Math.max(1, size * .014);
    for (let row = 0; row < 8; row += 1) {
      const yy = size * (.03 + row * .055);
      ctx.beginPath(); ctx.moveTo(-size * .50, yy); ctx.quadraticCurveTo(0, yy + size * .035, size * .50, yy); ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(246,188,103,.48)';
    for (let col = -5; col <= 5; col += 1) {
      ctx.beginPath(); ctx.moveTo(col * size * .085 - size * .14, -size * .08); ctx.lineTo(col * size * .07 + size * .12, size * .51); ctx.stroke();
    }
    ctx.restore();

    ctx.strokeStyle = '#5e351b';
    ctx.lineWidth = Math.max(2.5, size * .052);
    ctx.beginPath(); ctx.ellipse(0, -size * .03, size * .49, size * .285, 0, 0, Math.PI * 2); ctx.stroke();

    const lid = ctx.createRadialGradient(-size * .14, -size * .15, size * .04, 0, -size * .07, size * .48);
    lid.addColorStop(0, '#f0bd72'); lid.addColorStop(.52, '#bd7337'); lid.addColorStop(1, '#754019');
    ctx.fillStyle = lid;
    ctx.beginPath(); ctx.ellipse(0, -size * .07, size * .43, size * .235, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(83,43,18,.82)';
    ctx.lineWidth = Math.max(1.2, size * .018);
    for (let i = 1; i < 8; i += 1) {
      ctx.beginPath(); ctx.ellipse(0, -size * .07, size * (.04 + i * .052), size * (.021 + i * .027), 0, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(255,215,144,.48)';
    for (let i = -4; i <= 4; i += 1) {
      ctx.beginPath(); ctx.moveTo(i * size * .075 - size * .12, -size * .27); ctx.lineTo(i * size * .075 + size * .12, size * .10); ctx.stroke();
    }
    ctx.strokeStyle = '#6a3b1c';
    ctx.lineWidth = Math.max(2.4, size * .045);
    ctx.beginPath(); ctx.ellipse(0, -size * .07, size * .44, size * .245, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.globalAlpha = 1;

    ctx.strokeStyle = 'rgba(250,242,213,.34)';
    ctx.lineWidth = Math.max(1.2, size * .013);
    for (let i = 0; i < 3; i += 1) {
      const radius = size * (.52 + i * .16);
      const phase = (state.elapsed * 1.6 + i * .33) % 1;
      ctx.globalAlpha = (1 - phase) * .5;
      ctx.beginPath();
      ctx.ellipse(0, size * .24, radius * (.7 + phase * .5), radius * (.22 + phase * .16), 0, Math.PI * .08, Math.PI * .92);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  function updateFlatParticles(dt) {
    const w = window.innerWidth;
    const h = window.innerHeight;
    if (state.playing && !state.paused && Math.random() < .5) {
      const laneWidth = Math.min(w * .24, 104);
      const x = w * .5 + (state.x / LANES[2]) * laneWidth;
      const y = h * .735 - state.y * 42;
      flatSpawn(x + (Math.random() - .5) * 60, y + 20, (Math.random() - .5) * 40, -30 - Math.random() * 60, .5, '250,244,220', 2 + Math.random() * 2);
    }
    for (const p of flat.particles) {
      if (p.life <= 0) continue;
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 140 * dt;
    }
  }

  function drawFlatParticles(ctx) {
    for (const p of flat.particles) {
      if (p.life <= 0) continue;
      const t = p.life / p.maxLife;
      ctx.fillStyle = `rgba(${p.color},${t * .7})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * t, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function renderFallback(dt) {
    const ctx = fallbackContext;
    if (!ctx) return;
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    drawFallbackWorld(ctx);
    for (const item of state.items.slice().sort((a, b) => a.z - b.z)) drawFallbackItem(ctx, item);
    updateFlatParticles(dt);
    drawFlatParticles(ctx);
    drawFallbackBasket(ctx);
  }

  function activateFallback(label = 'LITE READY') {
    if (state.fallback && state.ready) return;
    state.fallback = true;
    dom.body.classList.add('fallback-mode');
    renderer?.setAnimationLoop?.(null);
    resizeFallback();
    setBadge(label);
    // Запасной режим тоже проходит через заставку: без этого она осталась бы
    // висеть поверх 2D-сцены и в игру было бы не попасть.
    finishLoading();
    state.ready = true;
    if (dom.start) dom.start.disabled = false;
    openTutorialOnFirstRun();
    window.__mosesV75Ready = true;
    window.__mosesV75Mode = 'fallback';
    window.__mosesV75ReferenceRebuild = true;
    applyLookCss(BIOMES[0]);
    if (!fallbackFrame) fallbackFrame = requestAnimationFrame(frame);
  }

  /* ------------------------------------------------------------------ *
   * 10. Кадр, управление, загрузка                                      *
   * ------------------------------------------------------------------ */

  function resize() {
    if (renderer && camera) {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      applyQuality();
      renderer.setSize(window.innerWidth, window.innerHeight, false);
    }
    if (state.fallback) resizeFallback();
  }

  /*
    Кадр целиком под защитой. three.js перезапрашивает следующий кадр ПОСЛЕ
    вызова обработчика: одно исключение внутри — и requestAnimationFrame
    больше не вызывается никогда. Игра застывает намертво, страница жива, но
    ни на что не отвечает. Именно так и умирала игра на первом же усилителе
    из-за потерянного объявления кэша материалов. Теперь сбойный кадр
    пропускается, ошибка пишется один раз, а цикл продолжает крутиться; если
    сбои идут подряд — уходим в запасной режим, а не висим.
  */
  let frameErrors = 0;
  let frameErrorLogged = false;

  function frame(now) {
    try {
      frameBody(now);
      frameErrors = 0;
    } catch (error) {
      frameErrors += 1;
      if (!frameErrorLogged) {
        frameErrorLogged = true;
        console.error('[Moses] сбой в кадре:', error);
      }
      window.__mosesV75FrameError = String(error?.message || error);
      // В запасном режиме цепочку кадров держит сама игра, и сбой обрывает
      // её раньше, чем она успеет запросить следующий кадр.
      if (state.fallback) fallbackFrame = requestAnimationFrame(frame);
      if (frameErrors > 90 && !state.fallback) {
        console.error('[Moses] кадр падает подряд, уходим в запасной режим');
        activateFallback('LITE READY');
      }
    }
  }

  function frameBody(now) {
    const seconds = now * .001;
    const dt = state.lastTime ? Math.min(.05, Math.max(.001, seconds - state.lastTime)) : .016;
    state.lastTime = seconds;
    state.elapsed += dt;

    if (!state.paused) updateGameplay(dt);
    window.__mosesV75State = state;

    if (state.fallback) {
      renderFallback(dt);
      window.__mosesV75Diagnostics = {
        mode: 'fallback',
        oneRenderLoop: true,
        x: state.x,
        targetX: state.targetX,
        lane: state.lane,
        items: state.items.length,
        hearts: state.hearts,
        biome: BIOMES[state.biome].id,
        proceduralSkyVisible: true,
        modelSources: window.__mosesV75ModelSources || {},
      };
      fallbackFrame = requestAnimationFrame(frame);
      return;
    }

    updateQuality(dt);
    update3D(dt);
    renderer.render(scene, camera);
    window.__mosesV75Diagnostics = {
      mode: 'webgl',
      oneRenderLoop: true,
      drawCalls: renderer.info.render.calls,
      triangles: renderer.info.render.triangles,
      items: state.items.length,
      particles: fx?.liveCount || 0,
      runTime: Math.round(state.runTime),
      hearts: state.hearts,
      biome: BIOMES[state.biome].id,
      quality: state.quality,
      fps: Math.round(state.fpsAverage),
      pixelRatio: renderer.getPixelRatio(),
      proceduralSkyVisible: true,
      modelSources: window.__mosesV75ModelSources || {},
    };
  }

  /*
    Кнопки слушают и pointerdown, и click: первый даёт отклик без задержки,
    второй нужен для программных вызовов (визуальный аудит жмёт .click()).
  */
  function bindPress(node, handler) {
    if (!node) return;
    let pointerHandled = 0;
    node.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      pointerHandled = performance.now();
      handler();
    });
    node.addEventListener('click', () => {
      if (performance.now() - pointerHandled < 600) return;
      handler();
    });
  }

  function bindControls() {
    bindPress(dom.left, () => steer(-1));
    bindPress(dom.right, () => steer(1));
    bindPress(dom.jump, jump);
    bindPress(dom.dive, dive);
    bindPress(dom.pause, () => togglePause());
    bindPress(dom.sound, () => {
      const on = window.gameAudio?.toggle?.() ?? true;
      dom.sound?.classList.toggle('is-off', !on);
      dom.sound?.setAttribute('aria-label', on ? 'Выключить звук' : 'Включить звук');
    });
    dom.start?.addEventListener('click', startGame);
    dom.restart?.addEventListener('click', startGame);
    dom.resume?.addEventListener('click', () => togglePause(false));
    dom.quit?.addEventListener('click', quitToMenu);
    dom.help?.addEventListener('click', () => openTutorial(0));
    dom.tutNext?.addEventListener('click', () => stepTutorial(1));
    dom.tutBack?.addEventListener('click', () => stepTutorial(-1));
    dom.tutSkip?.addEventListener('click', closeTutorial);

    window.addEventListener('keydown', (event) => {
      if (tutorialOpen) {
        // Поверх обучения стрелки листают шаги, а не двигают корзинку.
        if (event.code === 'ArrowRight' || event.code === 'Enter' || event.code === 'Space') { stepTutorial(1); event.preventDefault(); }
        else if (event.code === 'ArrowLeft') { stepTutorial(-1); event.preventDefault(); }
        else if (event.code === 'Escape') closeTutorial();
        return;
      }
      switch (event.code) {
        case 'ArrowLeft': case 'KeyA': steer(-1); break;
        case 'ArrowRight': case 'KeyD': steer(1); break;
        case 'ArrowUp': case 'KeyW': case 'Space': jump(); event.preventDefault(); break;
        case 'ArrowDown': case 'KeyS': dive(); event.preventDefault(); break;
        case 'Escape': case 'KeyP': togglePause(); break;
        case 'Enter':
          if (!state.playing) startGame();
          break;
        default: break;
      }
    });

    let touchX = 0;
    let touchY = 0;
    let touchTime = 0;
    window.addEventListener('touchstart', (event) => {
      touchX = event.touches[0]?.clientX || 0;
      touchY = event.touches[0]?.clientY || 0;
      touchTime = performance.now();
    }, { passive: true });
    window.addEventListener('touchend', (event) => {
      if (tutorialOpen) return;
      const point = event.changedTouches[0];
      if (!point || performance.now() - touchTime > 700) return;
      const dx = point.clientX - touchX;
      const dy = point.clientY - touchY;
      if (Math.abs(dx) < 30 && Math.abs(dy) < 30) return;
      if (Math.abs(dx) > Math.abs(dy)) steer(dx < 0 ? -1 : 1);
      else if (dy < 0) jump();
      else dive();
    }, { passive: true });

    document.addEventListener('visibilitychange', () => {
      if (document.hidden && state.playing) togglePause(true);
    });
    window.addEventListener('resize', resize, { passive: true });
  }

  function showBestOnStart() {
    if (!dom.startBest) return;
    if (!state.best?.score) {
      dom.startBest.textContent = 'Ещё ни одного заплыва — самое время начать.';
      return;
    }
    dom.startBest.textContent = `Лучший заплыв: ${state.best.score} очков · ${state.best.distance} м · ${state.best.lotuses} 🪷`;
    dom.startBest.classList.add('is-set');
  }

  /*
    Полоса загрузки. Веса шагов подобраны по замерам: модели тянутся дольше
    всего, текстуры идут вторыми, а компиляция шейдеров и разогрев пулов
    занимают доли секунды. Полоса не откатывается назад никогда — отдельные
    шаги внутри отчитываются долей своего отрезка.
  */
  const LOAD_STEPS = [
    { at: .04, label: 'ПОДНИМАЕМ ПАРУС…' },
    { at: .46, label: 'ЗАГРУЖАЕМ МОДЕЛИ…' },
    { at: .58, label: 'СОБИРАЕМ РУСЛО…' },
    { at: .86, label: 'ГРУЗИМ ТЕКСТУРЫ…' },
    { at: .93, label: 'ГОТОВИМ ПРЕПЯТСТВИЯ…' },
    { at: 1, label: 'ПРОГРЕВАЕМ ШЕЙДЕРЫ…' },
  ];
  let loadShown = 0;
  function setProgress(fraction, label) {
    loadShown = Math.max(loadShown, clamp(fraction, 0, 1));
    const percent = Math.round(loadShown * 100);
    if (dom.loadFill) dom.loadFill.style.width = `${percent}%`;
    if (dom.loadPercent) dom.loadPercent.textContent = `${percent}%`;
    if (label) {
      if (dom.loadLabel) dom.loadLabel.textContent = label;
      if (dom.loadingNote) dom.loadingNote.textContent = label;
    }
  }

  /*
    Заставка уходит только здесь и только один раз — и из обычной сборки, и
    из запасного 2D-режима. Полоса сначала доводится до сотни, чтобы уход не
    выглядел обрывом на середине.
  */
  let loadingFinished = false;
  function finishLoading() {
    if (loadingFinished) return;
    loadingFinished = true;
    setProgress(1, 'ОТПРАВЛЯЕМСЯ');
    dom.body.classList.remove('is-loading');
    // Кадр на отрисовку сотни, потом полсекунды на растворение заставки.
    requestAnimationFrame(() => dom.loadingScreen?.classList.add('is-done'));
  }

  async function boot() {
    readBest();
    showBestOnStart();
    bindControls();
    if (dom.start) dom.start.disabled = true;
    if (dom.biomeName) dom.biomeName.textContent = BIOMES[0].title;
    renderer = tryCreateRenderer();
    if (!renderer) {
      activateFallback('LITE READY');
      return;
    }
    const note = (index) => setProgress(LOAD_STEPS[index].at, LOAD_STEPS[index].label);
    try {
      note(0);
      note(1);
      await window.assetManager?.preloadGameplayModels?.();
      note(2);
      buildScene();
      resize();

      /*
        Дальше — три шага, которые раньше приходились на первые секунды
        заплыва и давали те самые рывки.

        Текстуры: карты песка, воды и камня грузятся асинхронно, и каждая
        приехавшая перекомпилировала материал уже в игре.

        Компиляция шейдеров: three собирает программу при первой отрисовке
        объекта. На сцене их полтора десятка, и все всплывали в первых кадрах.
        renderer.compile проходит их разом, пока экран ещё под заставкой.

        Пулы препятствий: меш строился в момент, когда впервые понадобился —
        клонирование модели, развёртка, процедурные карты — прямо посреди
        течения.
      */
      note(3);
      const from = LOAD_STEPS[2].at;
      const span = LOAD_STEPS[3].at - from;
      await waitForTextures(9000, () => {
        const done = texturesTotal - texturesPending;
        setProgress(from + span * (texturesTotal ? done / texturesTotal : 1));
      });
      note(4);
      prewarmPools();
      note(5);
      try { renderer.compile(scene, camera); } catch { /* не критично */ }
      // Один честный кадр до снятия заставки: всё, что осталось скомпилировать,
      // компилируется здесь, а не под пальцем игрока.
      renderer.render(scene, camera);
      await new Promise((resolve) => requestAnimationFrame(() => resolve()));

      state.ready = true;
      finishLoading();
      // Кнопка запуска включается именно здесь. До этой правки WebGL-ветка
      // оставляла её заблокированной, и превью нельзя было начать.
      if (dom.start) dom.start.disabled = false;
      openTutorialOnFirstRun();
      setBadge(EDITION);
      window.__mosesV75Ready = true;
      window.__mosesV75Mode = 'webgl';
      window.__mosesV75ReferenceRebuild = true;
      window.gameAudio?.setMenuMode?.(true);
      renderer.setAnimationLoop(frame);
    } catch (error) {
      console.error('[Moses] сцена не собралась, уходим в запасной режим:', error);
      activateFallback('LITE READY');
    }
  }

  boot();
})();
