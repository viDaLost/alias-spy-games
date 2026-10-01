/*
  Живой фон игры.

  Взято из превью-веток конца августа: preview/unified-games-redesign-review-v1
  и отдельных preview/*-parallax-review-v1, где у каждой игры была своя сцена со
  слоями. Тогда это жило рядом с полной переделкой всего приложения в тёмный вид
  — с перекрытием заголовка, меню и панелей каждой игры через !important.
  Приложение с тех пор ушло далеко: у него свой набор стилей, светлая и тёмная
  темы и параллакс главного меню. Поэтому перенесена только сцена, без чужого
  меню и без переопределений.

  Обе темы показывают сцену одинаково, в полном цвете; чем они различаются и
  как на картине читается текст — в game-scene-parallax.css. Сюда тема не
  заглядывает вовсе.

  Движение не спорит с игрой за жест. Горизонтальное перетаскивание из превью
  не перенесено намеренно: в «Поиске слов» пальцем ведут по буквам, в
  «Художнике» рисуют, в «Сокровищах» двигают фишки. Сцена слушает только то,
  что игре не нужно: прокрутку, наклон телефона и мышь без нажатой кнопки.
*/
(() => {
  'use strict';

  const SCENE_CLASS = 'game-scene';
  // Кеш-метка: файлы неизменяемы, а адрес должен пережить смену набора.
  const VERSION = '1';

  /*
    Слой сцены: файл, глубина, прозрачность, наименьший масштаб, фильтр.

    Путь пишется целиком, а не складывается из корня и имени: проверка проекта
    ищет ссылку на каждый опубликованный файл целой строкой, и склеенный адрес
    она увидеть не может. Со склейкой пришлось бы вносить все тридцать девять
    картинок в список исключений — и переименованный файл никто бы не поймал.
  */
  const layer = (file, depth, options = {}) => ({
    file, depth, opacity: 1, scale: 1.06, filter: 'none', ...options,
  });

  /*
    Каталог. Четыре игры получили в превью настоящие многослойные сцены,
    остальные — по одному фону: рисовать десять слоёв там, где экран почти
    целиком занят полем, незачем.

    Глубина — то, насколько слой близко: небо 2–4, город и крыши 9–19,
    передний план 30–40. Одиночный фон стоит на 10: внутри него двигаться
    нечему, но он ходит под экраном игры, и карточки висят над картиной, а не
    лежат на ней. «Художник» остаётся неподвижным: там рисуют, и фон под
    холстом не должен плыть под рукой.

    Каталог же решает, у кого сцена есть. «Моисея на Ниле» здесь нет намеренно:
    он рисует свой трёхмерный мир во весь экран, чужой фон под ним не виден и
    только тратит трафик. Отдельной проверки на его имя нет — она была бы
    заведомо мёртвой строкой, которую не сломать.
  */
  const CATALOG = {
    alias: [
      layer('web/assets/game-scenes/alias/01-sky-sunset.webp', 2), layer('web/assets/game-scenes/alias/02-mountains.webp', 5),
      layer('web/assets/game-scenes/alias/03-city-far.webp', 9), layer('web/assets/game-scenes/alias/04-market-mid.webp', 14),
      layer('web/assets/game-scenes/alias/09-dust-haze.webp', 19, { opacity: .34 }),
      layer('web/assets/game-scenes/alias/05-left-foreground.webp', 30), layer('web/assets/game-scenes/alias/06-right-foreground.webp', 32),
      layer('web/assets/game-scenes/alias/08-props.webp', 36), layer('web/assets/game-scenes/alias/07-hourglass.webp', 40),
    ],
    spy: [
      layer('web/assets/game-scenes/spy/01-sky-moon-stars.webp', 3), layer('web/assets/game-scenes/spy/02-mountains.webp', 6),
      layer('web/assets/game-scenes/spy/03-temple-far.webp', 9), layer('web/assets/game-scenes/spy/04-city-mid.webp', 13),
      layer('web/assets/game-scenes/spy/05-rooftops.webp', 19), layer('web/assets/game-scenes/spy/06-fog.webp', 23, { opacity: .42 }),
      layer('web/assets/game-scenes/spy/16-light-particles.webp', 25, { opacity: .3 }),
      layer('web/assets/game-scenes/spy/08-spy.webp', 34, { opacity: .97 }),
      layer('web/assets/game-scenes/spy/07-left-foreground.webp', 30), layer('web/assets/game-scenes/spy/10-right-foreground.webp', 30),
      layer('web/assets/game-scenes/spy/09-leaves.webp', 34, { opacity: .55 }), layer('web/assets/game-scenes/spy/12-plants-right.webp', 36, { opacity: .76 }),
    ],
    'bible-wow': [
      layer('web/assets/game-scenes/bible-words/01-temple-base.webp', 3, { filter: 'brightness(.82) saturate(.9)' }),
      layer('web/assets/game-scenes/bible-words/02-distant-sanctuary.webp', 7, { opacity: .82 }),
      layer('web/assets/game-scenes/bible-words/06-moonbeams.webp', 12, { opacity: .22 }),
      layer('web/assets/game-scenes/bible-words/03-left-arch.webp', 24, { opacity: .78 }),
      layer('web/assets/game-scenes/bible-words/04-right-arch.webp', 26, { opacity: .78 }),
      layer('web/assets/game-scenes/bible-words/05-scriptorium-ledge.webp', 32, { opacity: .7 }),
      layer('web/assets/game-scenes/bible-words/07-dust-motes.webp', 18, { opacity: .16 }),
    ],
    'biblical-match-three': [
      layer('web/assets/game-scenes/path/temple-base-v3.webp', 4, { filter: 'brightness(.78) saturate(.9)' }),
      layer('web/assets/game-scenes/path/temple-light-v3.webp', 14, { opacity: .18 }),
      layer('web/assets/game-scenes/path/temple-foreground-v3.webp', 32, { opacity: .68, filter: 'brightness(.72) saturate(.82)' }),
    ],
    coimaginarium: [layer('web/assets/game-scenes/scenes/coimaginarium.webp', 10, { filter: 'brightness(.82)' })],
    guess: [layer('web/assets/game-scenes/scenes/guess.webp', 10, { filter: 'brightness(.8)' })],
    describe: [layer('web/assets/game-scenes/scenes/describe.webp', 10, { filter: 'brightness(.82)' })],
    'sacred-word': [layer('web/assets/game-scenes/scenes/sacred-word.webp', 10, { filter: 'brightness(.8)' })],
    quartet: [layer('web/assets/game-scenes/scenes/quartet.webp', 10, { opacity: .94, filter: 'brightness(.82) saturate(.9)' })],
    'bible-sketch': [layer('web/assets/game-scenes/scenes/bible-sketch.webp', 0, { opacity: .93, filter: 'brightness(.8) saturate(.86)' })],
    'bible-wordsearch': [layer('web/assets/game-scenes/scenes/wordsearch.webp', 10, { opacity: .95, filter: 'brightness(.86) saturate(.88)' })],
    'kids-ark-pairs': [layer('web/assets/game-scenes/scenes/pairs.webp', 10, { opacity: .98, filter: 'brightness(.98) saturate(.92)' })],
  };

  /*
    Глубина в движении. Каждый источник сдвигает слой пропорционально его
    глубине, поэтому ближнее уезжает дальше дальнего — из этой разницы глаз и
    собирает объём.

    Прежде источник был один — прокрутка, и не дальше 46 пикселей. Но экран
    игры почти всегда помещается целиком и не прокручивается вовсе: сцена
    стояла плоской картинкой. Теперь их четыре:
      - прокрутка, как раньше, только заметнее;
      - наклон телефона — слои расходятся, как вид за окном;
      - мышь на компьютере — то же, что наклон, от положения курсора;
      - медленное «дыхание» камеры — объём виден и тогда, когда телефон лежит
        на столе или его передают по кругу.
    А при входе в игру камера коротко наезжает: ближние слои приходят из
    большего масштаба, чем дальние.

    Числа — пиксели на единицу глубины для телефона 390×844. На другом экране
    они растут и сжимаются вместе с ним, по каждой оси отдельно: в альбомной
    ориентации высоты мало, и вертикальный ход там короче.
  */
  const MOTION = {
    scrollRate: 1 / 600,
    scrollReach: 1.4,
    tiltX: 0.7,
    tiltY: 0.5,
    driftX: 0.22,
    driftY: 0.14,
  };
  const REFERENCE = { width: 390, height: 844 };
  const DEPTH_FULL = 40;
  // Наклон на 18° от того, как телефон держат, — полный ход слоёв.
  const TILT_SPAN = 18;
  // За сколько секунд точка покоя наклона догоняет новое положение телефона.
  const TILT_SETTLE = 3;
  const DRIFT_PERIOD = 24000;

  const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches === true;
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

  let scene = null;
  let mountedKey = '';
  let layers = [];
  let raf = 0;
  let unitX = 1;
  let unitY = 1;
  const current = { scroll: 0, x: 0, y: 0 };
  const target = { scroll: 0, x: 0, y: 0 };

  /** Сцена нужна там, где открыта игра и для неё есть картина. */
  function wantedKey() {
    if (document.body.dataset.mode !== 'game') return '';
    const key = document.body.dataset.currentGame || '';
    return CATALOG[key] ? key : '';
  }

  function unmount() {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    stopTilt();
    scene?.remove();
    scene = null;
    layers = [];
    mountedKey = '';
    document.body.classList.remove('has-game-scene');
  }

  function mount(key) {
    unmount();
    scene = document.createElement('div');
    scene.className = SCENE_CLASS;
    scene.dataset.scene = key;
    scene.setAttribute('aria-hidden', 'true');

    layers = CATALOG[key].map((meta, index) => {
      const image = document.createElement('img');
      image.className = `${SCENE_CLASS}__layer`;
      image.alt = '';
      image.decoding = 'async';
      // Первые два слоя держат кадр, остальные догружаются по мере надобности.
      image.loading = index < 2 ? 'eager' : 'lazy';
      image.draggable = false;
      image.style.setProperty('--layer-opacity', String(meta.opacity));
      image.style.setProperty('--layer-filter', meta.filter);
      image.style.zIndex = String(index + 1);
      image.dataset.depth = String(meta.depth);
      image.src = `${meta.file}?v=${VERSION}`;
      scene.append(image);
      return { ...meta, node: image };
    });

    const veil = document.createElement('div');
    veil.className = `${SCENE_CLASS}__veil`;
    scene.append(veil);

    document.body.prepend(scene);
    document.body.classList.add('has-game-scene');
    mountedKey = key;

    current.x = target.x = 0;
    current.y = target.y = 0;
    current.scroll = target.scroll = window.scrollY || 0;
    measure();
    draw();
    startDrift();
    startTilt();

    // Сцена появляется, когда первый слой готов: иначе игрок увидит, как поверх
    // тёмного фона по одному проступают картинки. Наезд камеры идёт тогда же,
    // а не при создании: невидимый наезд — потерянный.
    const base = layers[0]?.node;
    const shown = scene;
    let revealed = false;
    const reveal = () => {
      if (revealed || scene !== shown) return;
      revealed = true;
      shown.classList.add('is-ready');
      arrive();
    };
    if (base?.decode) base.decode().then(reveal).catch(reveal);
    else reveal();
    window.setTimeout(reveal, 1200);
  }

  /*
    Запас по краям. Слой занимает 108% экрана, и после масштаба s его край
    отстоит от края экрана на (1.08·s − 1)/2 экрана. Ближний слой ездит
    дальше, и запас ему нужен больше: масштаб считается из хода, а не берётся
    общим. Иначе на полном наклоне из-под переднего плана выглядывал бы край
    картинки, а дальний план зря терял бы поле кадра.
  */
  function measure() {
    const width = window.innerWidth || REFERENCE.width;
    const height = window.innerHeight || REFERENCE.height;
    unitX = clamp(width / REFERENCE.width, 0.7, 1.8);
    unitY = clamp(height / REFERENCE.height, 0.45, 1.5);
    const still = reducedMotion();
    for (const item of layers) {
      let scale = item.scale;
      if (!still) {
        const reachX = item.depth * (MOTION.tiltX + MOTION.driftX) * unitX;
        const reachY = item.depth * (MOTION.scrollReach + MOTION.tiltY + MOTION.driftY) * unitY;
        scale = Math.max(scale, (1 + (2 * reachX) / width) / 1.08, (1 + (2 * reachY) / height) / 1.08) + 0.004;
      }
      item.node.style.setProperty('--layer-scale', scale.toFixed(4));
    }
  }

  function draw() {
    if (!scene) return;
    const still = reducedMotion();
    for (const item of layers) {
      const { depth } = item;
      let x = 0;
      let y = 0;
      if (!still) {
        // Прокрутка поднимает слои, но не дальше запаса: на длинной странице
        // слой не должен уехать за кадр.
        y = Math.max(-depth * MOTION.scrollReach * unitY, -current.scroll * MOTION.scrollRate * depth);
        x = -current.x * depth * MOTION.tiltX * unitX;
        y -= current.y * depth * MOTION.tiltY * unitY;
      }
      item.node.style.setProperty('--layer-x', `${x.toFixed(2)}px`);
      item.node.style.setProperty('--layer-y', `${y.toFixed(2)}px`);
    }
  }

  function step() {
    raf = 0;
    current.scroll += (target.scroll - current.scroll) * 0.14;
    // Наклон сглаживается мягче прокрутки: датчик дрожит, и без этого слои
    // мелко тряслись бы у человека в руке.
    current.x += (target.x - current.x) * 0.09;
    current.y += (target.y - current.y) * 0.09;
    draw();
    if (Math.abs(target.scroll - current.scroll) > 0.4
      || Math.abs(target.x - current.x) > 0.002
      || Math.abs(target.y - current.y) > 0.002) schedule();
  }

  function schedule() {
    if (raf || !scene || reducedMotion()) return;
    raf = requestAnimationFrame(step);
  }

  /*
    Наезд камеры при входе: ближний слой приходит из большего масштаба, чем
    дальний, и сцена раскрывается в глубину, а не просто проявляется.
    Отдельное свойство scale складывается с transform слоя и ему не мешает.
  */
  function arrive() {
    if (reducedMotion()) return;
    for (const item of layers) {
      if (typeof item.node.animate !== 'function') return;
      const near = Math.min(1, item.depth / DEPTH_FULL);
      item.node.animate([{ scale: String(1.035 + near * 0.07) }, { scale: '1' }], {
        duration: 1500,
        easing: 'cubic-bezier(.16, .84, .3, 1)',
      });
    }
  }

  /*
    «Дыхание» камеры: все слои обходят одну и ту же восьмёрку в одной фазе, но
    каждый со своим размахом — ближний шире. Это не качка картинки, а медленный
    облёт: дальнее почти стоит, ближнее плывёт.

    Анимация отдана браузеру, а не кадрам скрипта: она идёт свойством translate
    в потоке композиции и не отнимает время у игры, которой оно нужнее. Но
    кадр сцены, пока она движется, пересобирается целиком, а с ним и размытие
    под стеклянными панелями тёмной темы. Поэтому на слабом телефоне — четыре
    ядра и меньше, как и у заставки запуска, — и в режиме экономии трафика её
    нет: там глубину показывают наклон и наезд, которые идут, только пока
    что-то происходит.
  */
  const lowPower = () => Boolean(navigator.connection?.saveData
    || (Number(navigator.hardwareConcurrency || 0) > 0 && Number(navigator.hardwareConcurrency) <= 4));

  function startDrift() {
    if (reducedMotion() || lowPower()) return;
    const steps = 24;
    for (const item of layers) {
      const ax = item.depth * MOTION.driftX * unitX;
      const ay = item.depth * MOTION.driftY * unitY;
      if ((!ax && !ay) || typeof item.node.animate !== 'function') continue;
      const keyframes = [];
      for (let index = 0; index <= steps; index += 1) {
        const turn = (index / steps) * Math.PI * 2;
        keyframes.push({ translate: `${(Math.sin(turn) * ax).toFixed(2)}px ${(Math.sin(turn * 2) * ay).toFixed(2)}px` });
      }
      item.node.animate(keyframes, { duration: DRIFT_PERIOD, iterations: Infinity, easing: 'linear' });
    }
  }

  /*
    Наклон. В Telegram датчик отдаёт сам клиент (DeviceOrientation, с версии
    8.0): так он работает и на iPhone, где страница до датчика без отдельного
    разрешения не дотянется. Вне Telegram — событие браузера, но только там,
    где оно не требует разрешения: спрашивать человека ради фона нельзя. Где
    датчика нет, остаётся мышь.

    Отсчёт идёт не от горизонта, а от того, как телефон держат сейчас: точка
    покоя за несколько секунд догоняет новое положение. Иначе тот, кто держит
    телефон почти вертикально, видел бы сцену навсегда съехавшей к краю, а
    передача телефона по кругу в «Алиасе» превращалась бы в качку.

    Датчик включается только вместе со сценой и выключается вместе с ней: в
    меню и в «Моисее на Ниле» он не нужен и не должен тратить батарею.
  */
  let tiltSource = '';
  let rest = null;
  let restAt = 0;
  let telegramTilt = false;
  let browserTilt = false;

  function screenAngle() {
    const angle = Number(window.screen?.orientation?.angle ?? window.orientation ?? 0);
    return ((angle % 360) + 360) % 360;
  }

  function feedTilt(source, beta, gamma) {
    if (!scene || !Number.isFinite(beta) || !Number.isFinite(gamma)) return;
    if (tiltSource && tiltSource !== source && tiltSource !== 'pointer') return;
    tiltSource = source;
    // В альбомной ориентации оси телефона и экрана меняются местами.
    const angle = screenAngle();
    let x = gamma;
    let y = beta;
    if (angle === 90) { x = beta; y = -gamma; }
    else if (angle === 270) { x = -beta; y = gamma; }
    else if (angle === 180) { x = -gamma; y = -beta; }
    const now = performance.now();
    if (!rest) rest = { x, y };
    else {
      const pull = 1 - Math.exp(-Math.max(0, now - restAt) / 1000 / TILT_SETTLE);
      rest.x += (x - rest.x) * pull;
      rest.y += (y - rest.y) * pull;
    }
    restAt = now;
    const nextX = clamp((x - rest.x) / TILT_SPAN, -1, 1);
    const nextY = clamp((y - rest.y) / TILT_SPAN, -1, 1);
    // Дрожь руки — десятые доли градуса — сцену не будит: иначе она
    // пересобиралась бы на каждом кадре, пока телефон просто держат.
    if (Math.abs(nextX - target.x) < 0.006 && Math.abs(nextY - target.y) < 0.006) return;
    target.x = nextX;
    target.y = nextY;
    schedule();
  }

  function onTelegramTilt() {
    const sensor = window.Telegram?.WebApp?.DeviceOrientation;
    // Telegram отдаёт углы в радианах, браузер — в градусах.
    if (sensor) feedTilt('telegram', (sensor.beta * 180) / Math.PI, (sensor.gamma * 180) / Math.PI);
  }

  function onBrowserTilt(event) {
    if (event.beta == null || event.gamma == null) return;
    feedTilt('browser', event.beta, event.gamma);
  }

  function onPointer(event) {
    if (event.pointerType !== 'mouse' || (tiltSource && tiltSource !== 'pointer')) return;
    // Кнопка нажата — значит, рисуют или тянут, и сцена не дёргается под рукой.
    if (event.buttons) return;
    tiltSource = 'pointer';
    target.x = clamp((event.clientX / (window.innerWidth || 1) - 0.5) * 2, -1, 1);
    target.y = clamp((event.clientY / (window.innerHeight || 1) - 0.5) * 2, -1, 1);
    schedule();
  }

  function onPointerAway() {
    if (tiltSource !== 'pointer') return;
    target.x = 0;
    target.y = 0;
    schedule();
  }

  function startTilt() {
    if (reducedMotion() || !scene) return;
    tiltSource = '';
    rest = null;
    const app = window.Telegram?.WebApp;
    if (!telegramTilt && app?.DeviceOrientation && app.isVersionAtLeast?.('8.0')) {
      try {
        app.onEvent('deviceOrientationChanged', onTelegramTilt);
        app.DeviceOrientation.start({ refresh_rate: 50 });
        telegramTilt = true;
      } catch {
        try { app.offEvent?.('deviceOrientationChanged', onTelegramTilt); } catch { /* клиент без событий */ }
      }
    }
    const Orientation = window.DeviceOrientationEvent;
    if (!browserTilt && Orientation && typeof Orientation.requestPermission !== 'function') {
      window.addEventListener('deviceorientation', onBrowserTilt, { passive: true });
      browserTilt = true;
    }
  }

  function stopTilt() {
    if (telegramTilt) {
      const app = window.Telegram?.WebApp;
      try { app?.offEvent?.('deviceOrientationChanged', onTelegramTilt); } catch { /* клиент без событий */ }
      try { app?.DeviceOrientation?.stop?.(); } catch { /* датчик уже остановлен */ }
      telegramTilt = false;
    }
    if (browserTilt) {
      window.removeEventListener('deviceorientation', onBrowserTilt);
      browserTilt = false;
    }
    tiltSource = '';
    rest = null;
    target.x = 0;
    target.y = 0;
  }

  function sync() {
    const key = wantedKey();
    if (key === mountedKey) return;
    if (!key) { unmount(); return; }
    mount(key);
  }

  window.addEventListener('scroll', () => { target.scroll = window.scrollY || 0; schedule(); }, { passive: true });
  window.addEventListener('resize', () => {
    target.scroll = window.scrollY || 0;
    measure();
    draw();
  }, { passive: true });
  window.addEventListener('pointermove', onPointer, { passive: true });
  document.documentElement.addEventListener('pointerleave', onPointerAway, { passive: true });

  // Свёрнутое приложение датчик не держит: батарея дороже фона, которого не видно.
  document.addEventListener('visibilitychange', () => {
    if (!scene) return;
    if (document.hidden) stopTilt();
    else startTilt();
  });

  // Экран игры меняется атрибутами на body: их и слушаем, отдельного события нет.
  new MutationObserver(sync).observe(document.body, {
    attributes: true,
    attributeFilter: ['data-mode', 'data-current-game'],
  });
  /*
    Тему переключают классом на documentElement, и сцена обязана уйти вместе с
    ней. Своя отметка при этом живёт на body, а не рядом: наблюдатель следит за
    классом documentElement, и метка, поставленная туда же, будила бы его сама
    — sync звал бы себя без конца и вешал страницу. Проверка это поймала: стоило
    ослабить сравнение ключей, и приложение переставало открываться вовсе.
  */
  new MutationObserver(sync).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['class'],
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', sync, { once: true });
  else sync();

  /*
    Поставить камеру в заданное положение сразу, без сглаживания. Нужно
    проверке: она ставит слои в крайние точки хода и меряет, не выглянул ли
    из-под них край, — не повторяя у себя здешние числа.
  */
  function pose({ x = 0, y = 0, scroll = 0 } = {}) {
    target.x = current.x = clamp(x, -1, 1);
    target.y = current.y = clamp(y, -1, 1);
    target.scroll = current.scroll = scroll;
    draw();
  }

  window.__gameScene = { sync, pose, catalog: CATALOG };
})();
