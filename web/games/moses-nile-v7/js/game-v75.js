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
    spawnAhead: 205,
  };

  /*
    Биомы сменяются по дистанции и тянут за собой свет, туман, цвет воды,
    плотность берега и набор препятствий. Между биомами всё интерполируется,
    поэтому переход читается как смена времени суток, а не как склейка.
  */
  const BIOMES = [
    {
      id: 'papyrus',
      title: 'Заводь папируса',
      subtitle: 'Тихая вода, густой тростник',
      from: 0,
      fog: 0xbba782, fogNear: 54, fogFar: 248,
      hemiSky: 0xffe8bd, hemiGround: 0x4f4838, hemiPower: .86,
      sunColor: 0xffd39b, sunPower: .92, sunPos: [-22, 35, 18],
      water: { deep: 0x6a6334, shallow: 0xb6a468, sky: 0xe7d4a4, sun: 0xffe3ae, foam: 0xf3ecd7, chop: .85, glitter: .9, opacity: .27 },
      atmosphere: { top: 0xe9d6a6, bottom: 0xf7e8c0, sun: 0xffe6b0, strength: .22, stars: 0 },
      grade: 'saturate(.92) contrast(1.02) brightness(.95)',
      overlay: 'linear-gradient(180deg, rgba(90,64,28,.10), transparent 30%, transparent 70%, rgba(24,26,18,.20))',
      wind: 1, weights: { rock: 3, log: 4, croc: 2, gate: 3, vortex: 0, hippo: 0, boat: 1 },
    },
    {
      id: 'open',
      title: 'Открытый Нил',
      subtitle: 'Полдень над широкой водой',
      from: 700,
      fog: 0xd8c79c, fogNear: 62, fogFar: 268,
      hemiSky: 0xfff3d8, hemiGround: 0x5c5540, hemiPower: 1.02,
      sunColor: 0xfff0c8, sunPower: 1.12, sunPos: [-16, 42, 14],
      water: { deep: 0x5e6a3c, shallow: 0xc2b478, sky: 0xf0e2ba, sun: 0xfff2cf, foam: 0xfbf5e4, chop: 1, glitter: 1.25, opacity: .26 },
      atmosphere: { top: 0xdfe4c8, bottom: 0xfaf0d2, sun: 0xfff4d4, strength: .18, stars: 0 },
      grade: 'saturate(1.02) contrast(1.02) brightness(1.06)',
      overlay: 'linear-gradient(180deg, rgba(120,96,40,.06), transparent 34%, transparent 72%, rgba(30,32,22,.16))',
      wind: 1.25, weights: { rock: 4, log: 4, croc: 3, gate: 2, vortex: 1, hippo: 1, boat: 2 },
    },
    {
      id: 'rapids',
      title: 'Пороги Нила',
      subtitle: 'Течение рвётся между камней',
      from: 1500,
      fog: 0x9fae9a, fogNear: 44, fogFar: 210,
      hemiSky: 0xdce9e2, hemiGround: 0x3f4a42, hemiPower: .84,
      sunColor: 0xdce7d8, sunPower: .82, sunPos: [-28, 30, 22],
      water: { deep: 0x3a5750, shallow: 0x9fb096, sky: 0xd3e0d4, sun: 0xf2f7ef, foam: 0xffffff, chop: 2.1, glitter: 1.5, opacity: .36 },
      atmosphere: { top: 0xb9c9c0, bottom: 0xdfe8dd, sun: 0xf0f6ec, strength: .3, stars: 0 },
      grade: 'saturate(.78) contrast(1.10) brightness(.88)',
      overlay: 'linear-gradient(180deg, rgba(40,60,60,.20), transparent 30%, transparent 66%, rgba(16,26,26,.30))',
      wind: 1.9, weights: { rock: 6, log: 3, croc: 3, gate: 2, vortex: 4, hippo: 1, boat: 0 },
    },
    {
      id: 'night',
      title: 'Ночная переправа',
      subtitle: 'Только луна и огни на берегу',
      from: 2400,
      fog: 0x1d2836, fogNear: 30, fogFar: 165,
      hemiSky: 0x33507a, hemiGround: 0x10161f, hemiPower: .58,
      sunColor: 0x9fc0ff, sunPower: .46, sunPos: [18, 30, -6],
      water: { deep: 0x131f2c, shallow: 0x33485e, sky: 0x4a6690, sun: 0xcfe0ff, foam: 0xcddcf2, chop: 1.2, glitter: 1.9, opacity: .46 },
      atmosphere: { top: 0x14203a, bottom: 0x2f4364, sun: 0xbcd2ff, strength: .55, stars: 1 },
      grade: 'saturate(.55) contrast(1.16) brightness(.42) hue-rotate(-14deg)',
      overlay: 'linear-gradient(180deg, rgba(8,14,28,.52), rgba(10,16,30,.28) 34%, rgba(8,12,24,.34) 70%, rgba(4,8,18,.60))',
      wind: 1.1, weights: { rock: 4, log: 3, croc: 5, gate: 3, vortex: 2, hippo: 2, boat: 1 },
    },
    {
      id: 'delta',
      title: 'Рассвет над дельтой',
      subtitle: 'Река выносит корзинку к людям',
      from: 3300,
      fog: 0xe0b688, fogNear: 58, fogFar: 250,
      hemiSky: 0xffe0c0, hemiGround: 0x584434, hemiPower: .95,
      sunColor: 0xffc98d, sunPower: 1.2, sunPos: [10, 22, -22],
      water: { deep: 0x6b5730, shallow: 0xcda66c, sky: 0xf7d9a8, sun: 0xffd9a0, foam: 0xfff0d8, chop: 1.15, glitter: 1.6, opacity: .30 },
      atmosphere: { top: 0xe7bc8e, bottom: 0xffdcae, sun: 0xffcf9a, strength: .34, stars: .12 },
      grade: 'saturate(1.10) contrast(1.05) brightness(1.02) hue-rotate(6deg)',
      overlay: 'linear-gradient(180deg, rgba(150,84,26,.16), transparent 32%, transparent 70%, rgba(50,26,10,.26))',
      wind: 1.4, weights: { rock: 4, log: 4, croc: 4, gate: 3, vortex: 3, hippo: 2, boat: 2 },
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
    croc:   { clearance: 'ground', radius: 1.15, size: 3.35, fail: 'Крокодил преградил путь по реке.' },
    gate:   { clearance: 'high',   radius: 1.28, size: 2.4,  fail: 'Корзинка запуталась в нависших зарослях папируса.' },
    vortex: { clearance: 'ground', radius: 1.05, size: 2.2,  fail: 'Водоворот затянул корзинку под воду.' },
    hippo:  { clearance: 'ground', radius: 1.32, size: 3.1,  fail: 'Бегемот поднялся из воды прямо перед корзинкой.' },
    boat:   { clearance: 'ground', radius: 1.42, size: 3.4,  fail: 'Корзинка врезалась в борт рыбацкой лодки.' },
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

  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const mix = (a, b, t) => a + (b - a) * t;
  const damp = (current, target, speed, dt) => mix(current, target, 1 - Math.exp(-speed * dt));
  const hash = (value, salt = 0) => {
    const x = Math.sin(value * 91.733 + salt * 37.719) * 43758.5453;
    return x - Math.floor(x);
  };

  function riverCenter(z) {
    return Math.sin(z * .013) * .22 + Math.sin(z * .031 + .8) * .09;
  }

  function bankRise(offset) {
    const o = Math.max(0, offset);
    return Math.min(2.1, .02 + o * .092 - o * o * .0012);
  }

  function riverHalf(z) {
    return RIVER_HALF + Math.sin(z * .021 + 1.7) * .16 + Math.sin(z * .057) * .07;
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
    requestAnimationFrame(() => node.classList.add('is-in'));
    setTimeout(() => {
      node.classList.remove('is-in');
      setTimeout(() => node.remove(), 420);
    }, 1750);
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
  let atmosphere = null;
  let godrays = null;
  let sun = null;
  let hemi = null;
  let rimLight = null;
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
  const currentLook = {
    fog: null, fogNear: 54, fogFar: 248,
    hemiSky: null, hemiGround: null, hemiPower: .86,
    sunColor: null, sunPower: .9,
    water: null, atmosphere: null,
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
      next.toneMappingExposure = 1.04;
      if ('outputEncoding' in next) next.outputEncoding = THREE.sRGBEncoding;
      shadowsOn = detectTier() >= 1;
      next.shadowMap.enabled = shadowsOn;
      next.shadowMap.type = THREE.PCFSoftShadowMap;
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
  function updateQuality(dt) {
    if (!renderer || state.fallback) return;
    const fps = 1 / Math.max(.001, dt);
    state.fpsAverage = mix(state.fpsAverage, fps, .04);
    if (state.fpsAverage < 42 && state.quality > .5) {
      state.quality = Math.max(.5, state.quality - .12);
      applyQuality();
    } else if (state.fpsAverage > 57 && state.quality < 1) {
      state.quality = Math.min(1, state.quality + .04);
      applyQuality();
    }
  }

  function applyQuality() {
    if (!renderer) return;
    const ratio = Math.min(window.devicePixelRatio || 1, MAX_DPR) * mix(.72, 1, state.quality);
    renderer.setPixelRatio(ratio);
    fx?.setQuality?.(state.quality);
    fx?.setParticleScale?.(ratio);
    if (state.quality < .68 && renderer.shadowMap.enabled) {
      renderer.shadowMap.enabled = false;
      shadowsOn = false;
    }
  }

  function makeTexture(path, repeatX, repeatY, material, kind = 'map', onLoad = null) {
    const loader = new THREE.TextureLoader();
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
    }, undefined, () => {});
  }

  /* ------------------------------------------------------------------ *
   * 4. Сцена                                                            *
   * ------------------------------------------------------------------ */

  function buildWater() {
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
  function buildRibbon(name, side, innerOffset, outerOffset, colors, texturePath, normalPath, yOffset = 0, opacity = .38) {
    const segments = 130;
    const positions = [];
    const uvs = [];
    const colorData = [];
    const indices = [];
    const inner = new THREE.Color(colors[0]);
    const outer = new THREE.Color(colors[1]);
    for (let i = 0; i <= segments; i += 1) {
      const v = i / segments;
      const z = mix(NEAR_Z + 9, FAR_Z, v);
      const center = riverCenter(z);
      const half = riverHalf(z);
      const edgeNoise = (hash(i, innerOffset * 13) - .5) * .34;
      const lift = hash(i, outerOffset * 7) * .12;
      const innerX = center + side * (half + innerOffset + edgeNoise);
      const outerX = center + side * (half + outerOffset + edgeNoise * .55);
      const baseY = -.035 + yOffset + Math.sin(z * .047 + side) * .022;
      positions.push(innerX, baseY + bankRise(innerOffset), z, outerX, baseY + bankRise(outerOffset) + lift, z);
      uvs.push(0, v * 52, 1, v * 52);
      colorData.push(inner.r, inner.g, inner.b, outer.r, outer.g, outer.b);
      if (i < segments) {
        const a = i * 2;
        if (side < 0) indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
        else indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colorData, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    const material = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: .96,
      metalness: 0,
      side: THREE.DoubleSide,
      transparent: true,
      opacity,
      depthWrite: false,
    });
    material.userData.normalStrength = .55;
    if (texturePath) makeTexture(texturePath, 1.15, 52, material);
    if (normalPath) makeTexture(normalPath, 1.15, 52, material, 'normalMap');
    const ribbon = new THREE.Mesh(geometry, material);
    ribbon.name = name;
    ribbon.receiveShadow = true;
    ribbon.renderOrder = 1;
    scene.add(ribbon);
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
      buildRibbon('V751DampShore', side, -.1, 1.15, [0x4b4028, 0x6d5c41], 'textures/terrain/damp-sand-color.jpg', 'textures/terrain/damp-sand-normal.jpg', .006, .62);
      buildRibbon('V751WarmSand', side, 1.10, 4.2, [0x84693f, 0xa78754], 'textures/terrain/sand-color.jpg', 'textures/terrain/sand-normal.jpg', .028, .50);
      buildRibbon('V751PebbleBank', side, 4.1, 16, [0x8a7458, 0x9d8763], 'textures/terrain/pebbles-color.jpg', 'textures/terrain/pebbles-normal.jpg', .06, .34);
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
      const material = (Array.isArray(child.material) ? child.material[0] : child.material).clone();
      material.side = THREE.DoubleSide;
      if (material.color) material.color.offsetHSL(.012, -.24, -.01);
      if ('roughness' in material) material.roughness = Math.max(.85, material.roughness ?? .9);
      parts.push({ geometry, material });
    });
    return parts.length ? parts : null;
  }

  function buildInstancedLayer(spec) {
    const parts = extractInstanceParts(spec.key, spec.size) || [{
      geometry: spec.fallbackGeometry(),
      material: spec.fallbackMaterial(),
    }];
    const meshes = parts.map((part, index) => {
      if (spec.wind) window.NileShaders?.applyWind?.(THREE, part.material, timeUniform, windUniform, spec.wind);
      return makeInstanced(part.geometry, part.material, spec.count, index ? `${spec.name}Part${index}` : spec.name);
    });
    const dummy = new THREE.Object3D();
    for (let i = 0; i < spec.count; i += 1) {
      spec.place(i, dummy);
      dummy.updateMatrix();
      for (const mesh of meshes) mesh.setMatrixAt(i, dummy.matrix);
    }
    for (const mesh of meshes) {
      mesh.instanceMatrix.needsUpdate = true;
      mesh.castShadow = spec.castShadow ?? false;
      scene.add(mesh);
    }
    return meshes;
  }

  function bankPlace(i, dummy, options) {
    const side = i % 2 ? -1 : 1;
    const z = options.zFrom - hash(i, options.salt) * options.zSpan;
    const offset = options.near + hash(i, options.salt + 1) * (options.far - options.near);
    const x = riverCenter(z) + side * (riverHalf(z) + offset);
    const scale = options.minScale + hash(i, options.salt + 2) * (options.maxScale - options.minScale);
    dummy.position.set(x, options.lift + bankRise(offset), z);
    dummy.rotation.set(0, hash(i, options.salt + 3) * Math.PI * 2, (hash(i, options.salt + 4) - .5) * (options.tilt || 0));
    dummy.scale.set(scale, scale * (options.stretch || 1), scale);
  }

  function buildBankDetail() {
    const tier = detectTier();
    const density = tier >= 2 ? 1.35 : tier >= 1 ? 1 : .58;
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
        key: 'reeds', name: 'V75ReedsInstanced', size: 2.3, wind: 1.6,
        count: Math.round(190 * density),
        fallbackGeometry: reedGeometry,
        fallbackMaterial: () => new THREE.MeshStandardMaterial({ color: 0x6d7a48, roughness: .98 }),
        place: (i, dummy) => bankPlace(i, dummy, { salt: 1, zFrom: 4, zSpan: 258, near: .2, far: 2.6, lift: .02, minScale: .7, maxScale: 1.6, tilt: .18, stretch: 1.1 }),
      },
      {
        key: 'bankPlant', name: 'V75BankPlants', size: 1.7, wind: 1.2,
        count: Math.round(80 * density),
        fallbackGeometry: grassGeometry,
        fallbackMaterial: () => new THREE.MeshStandardMaterial({ color: 0x5f6b3e, roughness: 1 }),
        place: (i, dummy) => bankPlace(i, dummy, { salt: 7, zFrom: 3, zSpan: 260, near: 1.2, far: 5.4, lift: .04, minScale: .7, maxScale: 1.5, tilt: .1 }),
      },
      {
        key: 'grass', name: 'V75GrassInstanced', size: 1.15, wind: 1,
        count: Math.round(210 * density),
        fallbackGeometry: grassGeometry,
        fallbackMaterial: () => new THREE.MeshStandardMaterial({ color: 0x7a7e54, roughness: 1 }),
        place: (i, dummy) => bankPlace(i, dummy, { salt: 13, zFrom: 3, zSpan: 262, near: 1.5, far: 17, lift: .05, minScale: .6, maxScale: 1.8 }),
      },
      {
        key: 'bush', name: 'V75BushesInstanced', size: 1.6, wind: .6,
        count: Math.round(62 * density),
        fallbackGeometry: () => new THREE.IcosahedronGeometry(.48, 1),
        fallbackMaterial: () => new THREE.MeshStandardMaterial({ color: 0x5a6440, roughness: 1, flatShading: true }),
        place: (i, dummy) => bankPlace(i, dummy, { salt: 20, zFrom: 2, zSpan: 262, near: 6, far: 25, lift: .04, minScale: .6, maxScale: 2.6 }),
      },
      {
        key: 'rock', name: 'V75RocksInstanced', size: 1.05, wind: 0,
        count: Math.round(105 * density),
        fallbackGeometry: () => new THREE.IcosahedronGeometry(.5, 1),
        fallbackMaterial: () => new THREE.MeshStandardMaterial({ color: 0x7d6e58, roughness: 1, flatShading: true }),
        place: (i, dummy) => bankPlace(i, dummy, { salt: 31, zFrom: 2, zSpan: 262, near: 3.2, far: 28, lift: .02, minScale: .35, maxScale: 2.3, tilt: .5, stretch: .7 }),
      },
      {
        key: 'palm', name: 'V75PalmCrowns', size: 11.5, wind: .55, castShadow: false,
        count: Math.round(30 * density),
        fallbackGeometry: palmGeometry,
        fallbackMaterial: () => new THREE.MeshStandardMaterial({ color: 0x4d6234, roughness: .96, flatShading: true }),
        place: (i, dummy) => bankPlace(i, dummy, { salt: 41, zFrom: -10, zSpan: 236, near: 9, far: 27, lift: .05, minScale: .7, maxScale: 1.3, tilt: .16 }),
      },
    ];
    for (const spec of specs) buildInstancedLayer(spec);
  }

  /* Ступенчатые пирамиды на горизонте: три тела, каждое из четырёх ярусов. */
  function buildPyramids() {
    const specs = [
      [-36, -196, 15, 24, 0xac8f66],
      [33, -216, 12, 18.5, 0xa0845f],
      [-5, -238, 8, 11.5, 0x957a5b],
    ];
    for (const [x, z, radius, height, color] of specs) {
      const group = new THREE.Group();
      group.name = 'V75DistantPyramid';
      const material = new THREE.MeshStandardMaterial({
        color,
        roughness: 1,
        transparent: true,
        opacity: .44,
        depthWrite: false,
      });
      for (let tier = 0; tier < 4; tier += 1) {
        const t = tier / 4;
        const tierHeight = height / 4;
        const cone = new THREE.Mesh(new THREE.ConeGeometry(radius * (1 - t), tierHeight * 1.06, 4), material);
        cone.position.y = tierHeight * (tier + .5);
        cone.rotation.y = Math.PI / 4;
        group.add(cone);
      }
      mergeByMaterial(group);
      group.position.set(x, .15, z);
      scene.add(group);
      decor.push({ kind: 'pyramid', object: group });
    }
  }

  function buildAtmosphere() {
    const material = window.NileShaders?.createAtmosphereMaterial?.(THREE);
    if (!material) return;
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(620, 260), material);
    mesh.position.set(0, 82, -300);
    mesh.renderOrder = -2;
    mesh.frustumCulled = false;
    scene.add(mesh);
    atmosphere = mesh;

    const rayMaterial = window.NileShaders?.createGodrayMaterial?.(THREE);
    if (rayMaterial) {
      const rays = new THREE.Mesh(new THREE.PlaneGeometry(150, 120), rayMaterial);
      rays.position.set(-26, 44, -190);
      rays.rotation.z = .16;
      rays.renderOrder = -1;
      rays.frustumCulled = false;
      scene.add(rays);
      godrays = rays;
    }
  }

  /* Люди на берегу: низкополигональные силуэты, которые машут рукой. */
  function buildBankPeople() {
    const skin = new THREE.MeshStandardMaterial({ color: 0xd7a37a, roughness: .85 });
    const linen = new THREE.MeshStandardMaterial({ color: 0xe8ddc4, roughness: .95 });
    for (let i = 0; i < 7; i += 1) {
      const side = i % 2 ? -1 : 1;
      const z = -18 - hash(i, 41) * 190;
      const offset = 2.6 + hash(i, 42) * 5.5;
      const x = riverCenter(z) + side * (riverHalf(z) + offset);
      const group = new THREE.Group();
      const robe = new THREE.Mesh(new THREE.CylinderGeometry(.16, .26, .95, 7), linen);
      robe.position.y = .48;
      group.add(robe);
      const head = new THREE.Mesh(new THREE.SphereGeometry(.14, 8, 6), skin);
      head.position.y = 1.08;
      group.add(head);
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(.05, .045, .58, 5), skin);
      arm.geometry.translate(0, .29, 0);
      arm.position.set(side * -.2, .78, 0);
      arm.userData.noMerge = true;
      group.add(arm);
      mergeByMaterial(group);
      group.position.set(x, .04 + bankRise(offset), z);
      group.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2;
      group.scale.setScalar(.9 + hash(i, 43) * .35);
      scene.add(group);
      decor.push({ kind: 'person', object: group, arm, phase: hash(i, 44) * 8, side });
    }
  }

  /* Ночные факелы на берегу: подсвечиваются только в тёмном биоме. */
  function buildTorches() {
    for (let i = 0; i < 9; i += 1) {
      const side = i % 2 ? -1 : 1;
      const z = -14 - hash(i, 51) * 200;
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
      decor.push({ kind: 'torch', object: group, flame, phase: hash(i, 53) * 9 });
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
    root.traverse((child) => {
      if (!child.isMesh || child.isSkinnedMesh || child.isInstancedMesh) return;
      if (child.userData.noMerge || Array.isArray(child.material)) return;
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

  /* След за корзинкой: клин из двух треугольников с шейдером пены. */
  function makeWake() {
    const group = new THREE.Group();
    const material = window.NileShaders?.createWakeMaterial?.(THREE);
    if (material) {
      const geometry = new THREE.PlaneGeometry(2.6, 7.5, 1, 12);
      const mesh = new THREE.Mesh(geometry, material);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(0, -.02, -3.4);
      mesh.renderOrder = 5;
      group.add(mesh);
      group.userData.shaderWake = mesh;
    }
    return group;
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

    const contact = new THREE.Mesh(
      new THREE.CircleGeometry(.86, 28),
      new THREE.MeshBasicMaterial({ color: 0x172018, transparent: true, opacity: .2, depthWrite: false }),
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
      new THREE.CylinderGeometry(.58, .64, .05, 20),
      new THREE.MeshStandardMaterial({ color: 0x4a6f3f, roughness: .86 }),
    );
    pad.name = 'V751LilyPad';
    group.add(pad);
    const model = window.assetManager?.cloneModel?.('lotus', .88);
    if (model) {
      model.position.y += .055;
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

  function createRock() {
    const model = window.assetManager?.cloneModel?.('rock', OBSTACLES.rock.size);
    if (model) {
      model.rotation.set(.08, hash(state.elapsed + state.items.length, 91) * Math.PI * 2, .05);
      model.name = 'V751QuaterniusRockModel';
      model.userData.assetSource = 'models/environment/nature_pack/Rock_1.glb';
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

  function createCrocodile() {
    const model = window.assetManager?.cloneModel?.('crocodile', OBSTACLES.croc.size);
    if (model) {
      model.rotation.y = Math.PI;
      model.position.y = -.26;
      model.name = 'V751DetailedCrocodileModel';
      model.userData.assetSource = 'models/v73/crocodile.glb';
      return model;
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
    group.userData.jaw = jawBottom;
    group.userData.assetSource = 'emergency-procedural';
    return mergeByMaterial(group);
  }

  /* Нависшие заросли папируса: перекрывают верх дорожки, проходятся нырком. */
  function createGate() {
    const group = new THREE.Group();
    const stem = new THREE.MeshStandardMaterial({ color: 0x6d7a45, roughness: .98 });
    const frond = new THREE.MeshStandardMaterial({ color: 0x53663a, roughness: .96, side: THREE.DoubleSide });
    for (const side of [-1, 1]) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(.09, .13, 2.9, 6), stem);
      pole.position.set(side * 1.15, 1.45, 0);
      pole.rotation.z = side * .18;
      group.add(pole);
    }
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(.1, .1, 2.6, 6), stem);
    beam.rotation.z = Math.PI / 2;
    beam.position.y = 2.55;
    group.add(beam);
    for (let i = 0; i < 11; i += 1) {
      const t = i / 10;
      const blade = new THREE.Mesh(new THREE.PlaneGeometry(.24, 1.5), frond);
      blade.position.set(mix(-1.15, 1.15, t), 1.8, (hash(i, 81) - .5) * .3);
      blade.rotation.set(.12 + hash(i, 82) * .2, (hash(i, 83) - .5) * .8, (hash(i, 84) - .5) * .5);
      group.add(blade);
    }
    const bulbMaterial = new THREE.MeshStandardMaterial({ color: 0x93a05c, roughness: .95 });
    for (let i = 0; i < 5; i += 1) {
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(.16, 7, 6), bulbMaterial);
      bulb.position.set(mix(-1, 1, i / 4), 2.75, (hash(i, 85) - .5) * .25);
      bulb.scale.set(1, .7, 1);
      group.add(bulb);
    }
    group.name = 'V751PapyrusGate';
    group.userData.assetSource = 'project-procedural';
    return mergeByMaterial(group);
  }

  /* Водоворот: вложенные кольца, крутятся с разной скоростью. */
  function createVortex() {
    const group = new THREE.Group();
    for (let i = 0; i < 4; i += 1) {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(.42 + i * .32, .06 - i * .008, 6, 26),
        new THREE.MeshStandardMaterial({
          color: i % 2 ? 0x93a58c : 0x6d7f70,
          roughness: .5,
          transparent: true,
          opacity: .68 - i * .1,
          depthWrite: false,
        }),
      );
      ring.rotation.x = Math.PI / 2;
      ring.position.y = .02 - i * .06;
      ring.scale.y = .8;
      ring.userData.noMerge = true;
      group.add(ring);
    }
    const funnel = new THREE.Mesh(
      new THREE.ConeGeometry(.62, 1.1, 18, 1, true),
      new THREE.MeshStandardMaterial({ color: 0x2f3b33, roughness: .45, transparent: true, opacity: .55, side: THREE.DoubleSide, depthWrite: false }),
    );
    funnel.position.y = -.5;
    group.add(funnel);
    group.name = 'V751Whirlpool';
    group.userData.rings = group.children.slice(0, 4);
    group.userData.assetSource = 'project-procedural';
    return group;
  }

  /* Бегемот: показывается из воды спиной, ушами и ноздрями. */
  function createHippo() {
    const group = new THREE.Group();
    const hide = new THREE.MeshStandardMaterial({ color: 0x6b5a63, roughness: .92 });
    const inner = new THREE.MeshStandardMaterial({ color: 0xa9757f, roughness: .85 });
    const back = new THREE.Mesh(new THREE.SphereGeometry(1.05, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2), hide);
    back.scale.set(1, .58, 1.5);
    group.add(back);
    const head = new THREE.Mesh(new THREE.SphereGeometry(.62, 14, 10), hide);
    head.scale.set(1, .72, 1.15);
    head.position.set(0, .12, 1.42);
    group.add(head);
    const snout = new THREE.Mesh(new THREE.SphereGeometry(.42, 12, 8), hide);
    snout.scale.set(1.15, .62, .9);
    snout.position.set(0, .02, 1.95);
    group.add(snout);
    for (const side of [-1, 1]) {
      const ear = new THREE.Mesh(new THREE.SphereGeometry(.14, 8, 6), hide);
      ear.position.set(side * .38, .46, 1.15);
      group.add(ear);
      const nostril = new THREE.Mesh(new THREE.SphereGeometry(.09, 7, 6), inner);
      nostril.position.set(side * .16, .22, 2.25);
      group.add(nostril);
      const eye = new THREE.Mesh(new THREE.SphereGeometry(.08, 7, 6), new THREE.MeshStandardMaterial({ color: 0x241c14, roughness: .4 }));
      eye.position.set(side * .34, .34, 1.62);
      group.add(eye);
    }
    group.name = 'V751NileHippo';
    group.userData.assetSource = 'project-procedural';
    return mergeByMaterial(group);
  }

  /* Рыбацкая лодка: модель Quaternius, а без пакета — свой корпус. */
  function createBoat() {
    const model = window.assetManager?.cloneModel?.('boat', OBSTACLES.boat.size);
    if (model) {
      model.rotation.y = Math.PI / 2 + (hash(state.elapsed, 88) - .5) * .5;
      model.position.y = -.2;
      model.name = 'V751QuaterniusBoatModel';
      model.userData.assetSource = 'models/v73/Boat.glb';
      return model;
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
      new THREE.MeshStandardMaterial({ color: 0xefe3c6, roughness: .95, side: THREE.DoubleSide }),
    );
    sail.position.set(.35, 1.4, -.2);
    sail.rotation.y = .3;
    group.add(sail);
    group.name = 'V751RiverBoat';
    group.userData.assetSource = 'project-procedural';
    return mergeByMaterial(group);
  }

  function makePowerupTexture(type) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 128;
    const ctx = canvas.getContext('2d');
    const palette = {
      shield: ['#efffff', '#78b8b1', '#d9f1ea', '#315e5c'],
      magnet: ['#fff8cc', '#e3b94d', '#ffe9a0', '#805f18'],
      rush: ['#e8f6ff', '#61a8dd', '#d7ecff', '#2c5f86'],
      mercy: ['#ffeef1', '#d16b86', '#ffd9e0', '#8d3550'],
    };
    const tone = palette[type] || palette.magnet;
    const glow = ctx.createRadialGradient(64, 58, 4, 64, 64, 58);
    glow.addColorStop(0, tone[0]);
    glow.addColorStop(.48, tone[1]);
    glow.addColorStop(1, 'rgba(35,42,35,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, 128, 128);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.fillStyle = tone[2];
    ctx.strokeStyle = tone[3];
    ctx.lineWidth = 8;
    if (type === 'shield') {
      ctx.beginPath();
      ctx.moveTo(64, 24); ctx.lineTo(96, 37); ctx.lineTo(91, 77);
      ctx.quadraticCurveTo(83, 99, 64, 108);
      ctx.quadraticCurveTo(45, 99, 37, 77);
      ctx.lineTo(32, 37); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = '#c99b37'; ctx.lineWidth = 7;
      ctx.beginPath(); ctx.moveTo(64, 43); ctx.lineTo(64, 88); ctx.moveTo(47, 61); ctx.lineTo(81, 61); ctx.stroke();
    } else if (type === 'rush') {
      ctx.lineWidth = 10;
      for (let i = 0; i < 3; i += 1) {
        const y = 44 + i * 20;
        ctx.beginPath();
        ctx.moveTo(28 + i * 6, y);
        ctx.quadraticCurveTo(64, y - 14, 100 - i * 4, y);
        ctx.stroke();
      }
      ctx.fillStyle = tone[2];
      ctx.beginPath(); ctx.moveTo(96, 30); ctx.lineTo(112, 44); ctx.lineTo(94, 52); ctx.closePath(); ctx.fill();
    } else if (type === 'mercy') {
      ctx.beginPath();
      ctx.moveTo(64, 100);
      ctx.bezierCurveTo(20, 70, 30, 34, 52, 34);
      ctx.bezierCurveTo(62, 34, 64, 44, 64, 48);
      ctx.bezierCurveTo(64, 44, 66, 34, 76, 34);
      ctx.bezierCurveTo(98, 34, 108, 70, 64, 100);
      ctx.closePath(); ctx.fill(); ctx.stroke();
    } else {
      ctx.beginPath();
      for (let i = 0; i < 16; i += 1) {
        const radius = i % 2 ? 15 : 39;
        const angle = -Math.PI / 2 + i * Math.PI / 8;
        const x = 64 + Math.cos(angle) * radius;
        const y = 64 + Math.sin(angle) * radius;
        if (!i) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#fff8d7'; ctx.beginPath(); ctx.arc(64, 64, 10, 0, Math.PI * 2); ctx.fill();
    }
    const texture = new THREE.CanvasTexture(canvas);
    if ('encoding' in texture) texture.encoding = THREE.sRGBEncoding;
    return texture;
  }

  const powerupTextures = {};
  function powerupTexture(type) {
    if (!powerupTextures[type]) powerupTextures[type] = makePowerupTexture(type);
    return powerupTextures[type];
  }

  function createPowerup(type) {
    const group = new THREE.Group();
    const colors = { shield: 0x7fc6bc, magnet: 0xe5be64, rush: 0x6fb2e6, mercy: 0xe58aa0 };
    const color = colors[type] || 0xe5be64;
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: powerupTexture(type), color: 0xffffff, transparent: true, depthWrite: false }));
    sprite.scale.set(1.25, 1.25, 1.25);
    sprite.position.y = .62;
    group.add(sprite);
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(.44, .045, 8, 30),
      new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: .32, roughness: .42 }),
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = .1;
    group.add(ring);
    const haloMaterial = window.NileShaders?.createHaloMaterial?.(THREE, color);
    if (haloMaterial) {
      haloMaterial.uniforms.uStrength.value = .5;
      const halo = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 2.6), haloMaterial);
      halo.rotation.x = -Math.PI / 2;
      halo.position.y = .06;
      group.add(halo);
      group.userData.halo = haloMaterial;
    }
    group.userData.ring = ring;
    group.userData.assetSource = 'designed-powerup-token';
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

  function rowGap() {
    const d = difficulty();
    return mix(27, 17.5, d) * (state.rush > 0 ? 1.1 : 1);
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
        if (arc) item.hover = Math.sin((i + 1) / (chainLength + 1) * Math.PI) * 1.15;
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
      growled: false,
      mesh: null,
    };
    if (z > MESH_RANGE) attachMesh(item);
    state.items.push(item);
    return item;
  }

  /*
    Меш создаётся только когда ряд подходит на дистанцию видимости.
    Так одновременно живёт полтора десятка объектов вместо шести десятков.
  */
  function attachMesh(item) {
    if (item.mesh || !scene || state.fallback) return;
    const mesh = acquireMesh(item.type);
    if (!mesh) return;
    mesh.position.set(item.x, item.type === 'lotus' ? -.02 : .02, item.z);
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
  }

  function removeItem(index) {
    const [item] = state.items.splice(index, 1);
    if (item?.mesh) releaseMesh(item.type, item.mesh);
  }

  function clearItems() {
    for (const item of state.items) if (item.mesh) releaseMesh(item.type, item.mesh);
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
    if (node) node.style.display = active ? 'block' : 'none';
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
      fx?.splash?.(player.position.x, .05, player.position.z - .3, .55);
      fx?.ripple?.(state.x, .015, .2, .6, 2.4, .7, .3);
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

    for (let i = state.items.length - 1; i >= 0; i -= 1) {
      const item = state.items[i];
      item.z += state.speed * dt;
      if (!item.mesh && item.z > MESH_RANGE) attachMesh(item);

      if (state.magnet > 0 && item.type === 'lotus' && item.z > -20) {
        item.x = damp(item.x, state.x, 5.5, dt);
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

    // После водоворота корзинку медленно возвращает на свою дорожку.
    state.targetX = damp(state.targetX, LANES[state.lane], 1.1, dt);

    updateHud();
    window.gameAudio?.setIntensity?.(clamp((state.speed - TUNE.baseSpeed) / (TUNE.maxSpeed - TUNE.baseSpeed) * .7 + (state.multiplier - 1) * .1, 0, 1));
  }

  /* ------------------------------------------------------------------ *
   * 8. Свет, камера, кадр                                               *
   * ------------------------------------------------------------------ */

  const tmpColor = THREE ? new THREE.Color() : null;

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
      currentLook.atmosphere = {
        top: new THREE.Color(biome.atmosphere.top),
        bottom: new THREE.Color(biome.atmosphere.bottom),
        sun: new THREE.Color(biome.atmosphere.sun),
        strength: biome.atmosphere.strength,
        stars: biome.atmosphere.stars,
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

    const sky = currentLook.atmosphere;
    sky.top.lerp(tmpColor.set(biome.atmosphere.top), t);
    sky.bottom.lerp(tmpColor.set(biome.atmosphere.bottom), t);
    sky.sun.lerp(tmpColor.set(biome.atmosphere.sun), t);
    sky.strength = mix(sky.strength, biome.atmosphere.strength, t);
    sky.stars = mix(sky.stars, biome.atmosphere.stars, t);

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
    if (rimLight) rimLight.intensity = mix(.16, .34, sky.stars);
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
    if (atmosphere?.material?.uniforms) {
      const u = atmosphere.material.uniforms;
      u.uTop.value.copy(sky.top);
      u.uBottom.value.copy(sky.bottom);
      u.uSunColor.value.copy(sky.sun);
      u.uStrength.value = sky.strength;
      u.uStars.value = sky.stars;
    }
    if (godrays?.material?.uniforms) {
      godrays.material.uniforms.uColor.value.copy(sky.sun);
      godrays.material.uniforms.uStrength.value = mix(.24, .05, sky.stars);
    }
    windUniform.value = mix(windUniform.value, biome.wind, t);
    applyLookCss(biome);
  }

  let lastCssBiome = -1;
  function applyLookCss(biome) {
    if (lastCssBiome === biome.id) return;
    lastCssBiome = biome.id;
    if (dom.sceneBg) dom.sceneBg.style.filter = biome.grade;
    if (dom.grade) dom.grade.style.backgroundImage = biome.overlay;
    dom.body.dataset.biome = biome.id;
  }

  function buildScene() {
    scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0xbba782, 54, 248);
    camera = new THREE.PerspectiveCamera(52, window.innerWidth / window.innerHeight, .1, 420);
    camera.position.set(0, 4.78, 9.6);

    hemi = new THREE.HemisphereLight(0xffe8bd, 0x4f4838, .86);
    scene.add(hemi);
    sun = new THREE.DirectionalLight(0xffd39b, .92);
    sun.position.set(-22, 35, 18);
    sun.castShadow = renderer.shadowMap.enabled;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.left = -16;
    sun.shadow.camera.right = 16;
    sun.shadow.camera.top = 20;
    sun.shadow.camera.bottom = -10;
    sun.shadow.camera.far = 80;
    sun.shadow.bias = -.0008;
    scene.add(sun);
    rimLight = new THREE.DirectionalLight(0x93afa0, .2);
    rimLight.position.set(9, 8, -15);
    scene.add(rimLight);

    buildAtmosphere();
    buildWater();
    buildBanks();
    buildBankDetail();
    buildPyramids();
    buildBankPeople();
    buildTorches();
    buildBirds();
    buildPlayer();

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
      switch (item.type) {
        case 'lotus':
          mesh.rotation.y += dt * 1.15;
          mesh.position.y = -.02 + item.hover + Math.sin(t * 2.4 + item.phase) * .038;
          break;
        case 'shield':
        case 'magnet':
        case 'rush':
        case 'mercy':
          mesh.rotation.y += dt * 1.5;
          mesh.position.y = .06 + Math.sin(t * 2.6 + item.phase) * .07;
          if (mesh.userData.ring) mesh.userData.ring.rotation.z += dt * 2.2;
          if (mesh.userData.halo) mesh.userData.halo.uniforms.uTime.value = t;
          break;
        case 'croc': {
          if (!item.growled && item.z > -26) {
            item.growled = true;
            window.gameAudio?.playGrowl?.();
          }
          mesh.position.y = -.16 + Math.sin(t * 2.6 + item.phase) * .045;
          mesh.rotation.z = Math.sin(t * 1.7 + item.phase) * .022;
          const jaw = mesh.userData.jaw;
          if (jaw) jaw.rotation.x = Math.max(0, Math.sin(t * 1.4 + item.phase)) * .32;
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
          mesh.position.y = -.06 + Math.sin(t * 1.6 + item.phase) * .02;
          const rings = mesh.userData.rings;
          if (rings) for (let i = 0; i < rings.length; i += 1) rings[i].rotation.z += dt * (2.6 - i * .45);
          break;
        }
        case 'hippo':
          mesh.position.y = -.26 + Math.abs(Math.sin(t * .8 + item.phase)) * .5;
          mesh.rotation.y = Math.PI + Math.sin(t * .5 + item.phase) * .1;
          break;
        case 'boat':
          mesh.position.y = -.16 + Math.sin(t * 1.5 + item.phase) * .05;
          mesh.rotation.z = Math.sin(t * 1.2 + item.phase) * .04;
          break;
        default:
          break;
      }
    }
  }

  function updateDecor(dt, t) {
    const night = currentLook.atmosphere ? currentLook.atmosphere.stars : 0;
    for (const entry of decor) {
      if (entry.kind === 'person') {
        const wave = Math.sin(t * 2.2 + entry.phase);
        entry.arm.rotation.z = wave > .3 ? entry.side * (-.6 - wave * .8) : entry.side * -.1;
      } else if (entry.kind === 'torch') {
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

    // Плавный переход между биомами занимает около трёх секунд.
    if (state.biomeBlend < 1) {
      state.biomeBlend = Math.min(1, state.biomeBlend + dt / 3);
      applyLook(BIOMES[state.biome], dt / 3);
    }

    player.position.x = state.x;
    const bob = Math.sin(t * 2.25) * .026 + Math.sin(t * 3.7) * .01;
    player.position.y = .085 + state.y + bob * (state.airborne ? .2 : 1);
    player.rotation.z = Math.sin(t * 1.55) * .014 - (state.targetX - state.x) * .075;
    player.rotation.x = Math.sin(t * 1.15) * .008 - state.vy * .012;
    if (basketVisual) {
      const squash = state.dive > 0 ? .86 : state.airborne ? 1.04 : 1;
      basketVisual.scale.setScalar(damp(basketVisual.scale.x, .62 * squash, 9, dt));
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
      for (const child of wake.children) {
        if (child === shaderWake || !child.material?.opacity) continue;
        child.material.opacity = (.14 + Math.sin(t * 2.3) * .03) * (state.playing ? 1 : .5);
      }
    }

    // Камера: тянется за корзинкой, шире смотрит на скорости, дрожит от ударов.
    const speedT = clamp((state.speed - TUNE.baseSpeed) / (TUNE.maxSpeed - TUNE.baseSpeed), 0, 1);
    const shake = fx?.shakeOffset;
    camera.position.x = damp(camera.position.x, state.x * .14, 4, dt) + (shake?.x || 0);
    camera.position.y = damp(camera.position.y, 4.78 + state.y * .3 - speedT * .2, 5, dt) + (shake?.y || 0);
    camera.position.z = damp(camera.position.z, 9.6 - speedT * .55, 5, dt) + (shake?.z || 0);
    camera.rotation.z = fx?.shakeRoll || 0;
    const targetFov = 52 + speedT * 9 + (state.rush > 0 ? 5 : 0);
    if (Math.abs(camera.fov - targetFov) > .05) {
      camera.fov = damp(camera.fov, targetFov, 3, dt);
      camera.updateProjectionMatrix();
    }
    camera.lookAt(state.x * .18, .82 + state.y * .35, -16.5);

    if (waterMaterial?.uniforms) {
      const u = waterMaterial.uniforms;
      u.uTime.value = t;
      u.uFlow.value = .8 + speedT * .9;
      u.uPlayer.value.set(state.x, 0, 0);
      u.uWakeStrength.value = state.playing ? clamp(.55 - state.y * .4, 0, .6) : .2;
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
    if (atmosphere?.material?.uniforms) atmosphere.material.uniforms.uTime.value = t;
    if (godrays?.material?.uniforms) godrays.material.uniforms.uTime.value = t;

    updateItems3D(dt, t);
    updateDecor(dt, t);

    // Живые мелочи: брызги из-под корзинки и висящая в воздухе пыльца.
    if (state.playing && !state.paused) {
      fx?.spray?.(state.x, .04, 0, .3 + speedT * .8);
      if (Math.random() < .22) {
        const night = currentLook.atmosphere ? currentLook.atmosphere.stars : 0;
        const color = night > .5 ? [1, .86, .45] : [1, .93, .74];
        fx?.mote?.(state.x + (Math.random() - .5) * 16, .6 + Math.random() * 3.4, -22 - Math.random() * 30, color, night > .5 ? .13 : .07, 3.2);
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

  function drawFallbackWorld(ctx) {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const hy = horizonY();
    const t = state.elapsed;

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
    river.addColorStop(0, night ? 'rgba(28,42,62,.42)' : 'rgba(190,172,116,.30)');
    river.addColorStop(.45, night ? 'rgba(16,26,40,.50)' : 'rgba(126,120,62,.36)');
    river.addColorStop(1, night ? 'rgba(8,14,24,.58)' : 'rgba(74,74,36,.44)');
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
      ctx.fillStyle = night ? 'rgba(14,20,28,.34)' : 'rgba(92,74,44,.16)';
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
    dom.body.classList.remove('is-loading');
    state.ready = true;
    if (dom.start) dom.start.disabled = false;
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

  function frame(now) {
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
        cinematicBackgroundVisible: true,
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
      cinematicBackgroundVisible: true,
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

    window.addEventListener('keydown', (event) => {
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
    try {
      await window.assetManager?.preloadGameplayModels?.();
      buildScene();
      resize();
      state.ready = true;
      dom.body.classList.remove('is-loading');
      // Кнопка запуска включается именно здесь. До этой правки WebGL-ветка
      // оставляла её заблокированной, и превью нельзя было начать.
      if (dom.start) dom.start.disabled = false;
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
