/*
  Живой фон игры.

  Взято из превью-веток конца августа: preview/unified-games-redesign-review-v1
  и отдельных preview/*-parallax-review-v1, где у каждой игры была своя сцена со
  слоями. Тогда это жило рядом с полной переделкой всего приложения в тёмный вид
  — с перекрытием заголовка, меню и панелей каждой игры через !important.
  Приложение с тех пор ушло далеко: у него свой набор стилей, светлая и тёмная
  темы и параллакс главного меню. Поэтому перенесена только сцена, без чужого
  меню и без переопределений.

  Почему только в тёмной теме. Арт ночной и живописный: замок при луне, ночной
  город, храм в лунных лучах. За светлыми карточками светлой темы он читался бы
  грязным пятном. В тёмной теме на его месте стоял плоский градиент, и сцена
  занимает ровно его место. Светлая тема не меняется ни на пиксель.

  Движение — только от прокрутки, как у параллакса меню. Горизонтальное
  перетаскивание из превью не перенесено намеренно: в «Поиске слов» пальцем
  ведут по буквам, в «Художнике» рисуют, в «Сокровищах» двигают фишки — сцена
  не имеет права спорить с игрой за жест.
*/
(() => {
  'use strict';

  const SCENE_CLASS = 'game-scene';
  // Кеш-метка: файлы неизменяемы, а адрес должен пережить смену набора.
  const VERSION = '1';

  /*
    Слой сцены: файл, глубина по вертикали, прозрачность, масштаб, фильтр.

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

    Он же и решает, у кого сцена есть. «Моисея на Ниле» здесь нет намеренно: он
    рисует свой трёхмерный мир во весь экран, чужой фон под ним не виден и
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
    coimaginarium: [layer('web/assets/game-scenes/scenes/coimaginarium.webp', 4, { filter: 'brightness(.82)' })],
    guess: [layer('web/assets/game-scenes/scenes/guess.webp', 4, { filter: 'brightness(.8)' })],
    describe: [layer('web/assets/game-scenes/scenes/describe.webp', 4, { filter: 'brightness(.82)' })],
    'sacred-word': [layer('web/assets/game-scenes/scenes/sacred-word.webp', 4, { filter: 'brightness(.8)' })],
    quartet: [layer('web/assets/game-scenes/scenes/quartet.webp', 0, { opacity: .94, filter: 'brightness(.82) saturate(.9)' })],
    'bible-sketch': [layer('web/assets/game-scenes/scenes/bible-sketch.webp', 0, { opacity: .93, filter: 'brightness(.8) saturate(.86)' })],
    'bible-wordsearch': [layer('web/assets/game-scenes/scenes/wordsearch.webp', 0, { opacity: .95, filter: 'brightness(.86) saturate(.88)' })],
    'kids-ark-pairs': [layer('web/assets/game-scenes/scenes/pairs.webp', 0, { opacity: .98, filter: 'brightness(.98) saturate(.92)' })],
  };

  const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches === true;

  let scene = null;
  let mountedKey = '';
  let nodes = [];
  let raf = 0;
  let current = 0;
  let target = 0;

  /** Сцена уместна только там, где вокруг темно и есть что показывать. */
  function wantedKey() {
    if (!document.documentElement.classList.contains('theme-dark')) return '';
    if (document.body.dataset.mode !== 'game') return '';
    const key = document.body.dataset.currentGame || '';
    return CATALOG[key] ? key : '';
  }

  function unmount() {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    scene?.remove();
    scene = null;
    nodes = [];
    mountedKey = '';
    document.body.classList.remove('has-game-scene');
  }

  function mount(key) {
    unmount();
    scene = document.createElement('div');
    scene.className = SCENE_CLASS;
    scene.dataset.scene = key;
    scene.setAttribute('aria-hidden', 'true');

    nodes = CATALOG[key].map((meta, index) => {
      const image = document.createElement('img');
      image.className = `${SCENE_CLASS}__layer`;
      image.alt = '';
      image.decoding = 'async';
      // Первые два слоя держат кадр, остальные догружаются по мере надобности.
      image.loading = index < 2 ? 'eager' : 'lazy';
      image.draggable = false;
      image.style.setProperty('--layer-opacity', String(meta.opacity));
      image.style.setProperty('--layer-filter', meta.filter);
      image.style.setProperty('--layer-scale', String(meta.scale));
      image.style.zIndex = String(index + 1);
      image.dataset.depth = String(meta.depth);
      image.src = `${meta.file}?v=${VERSION}`;
      scene.append(image);
      return image;
    });

    const veil = document.createElement('div');
    veil.className = `${SCENE_CLASS}__veil`;
    scene.append(veil);

    document.body.prepend(scene);
    document.body.classList.add('has-game-scene');
    mountedKey = key;

    // Сцена появляется, когда первый слой готов: иначе игрок увидит, как поверх
    // тёмного фона по одному проступают картинки.
    const base = nodes[0];
    const reveal = () => scene?.classList.add('is-ready');
    if (base?.decode) base.decode().then(reveal).catch(reveal);
    else reveal();
    window.setTimeout(reveal, 1200);

    target = current = window.scrollY || 0;
    draw();
  }

  function draw() {
    if (!scene) return;
    const still = reducedMotion();
    for (const node of nodes) {
      const depth = Number(node.dataset.depth) || 0;
      // Сдвиг ограничен: на длинной странице слои не должны уезжать за кадр.
      const shift = still ? 0 : Math.max(-46, Math.min(0, -(current / 900) * depth));
      node.style.setProperty('--layer-y', `${shift.toFixed(2)}px`);
    }
  }

  function step() {
    raf = 0;
    current += (target - current) * 0.14;
    draw();
    if (Math.abs(target - current) > 0.4) schedule();
  }

  function schedule() {
    if (raf || !scene || reducedMotion()) return;
    raf = requestAnimationFrame(step);
  }

  function sync() {
    const key = wantedKey();
    if (key === mountedKey) return;
    if (!key) { unmount(); return; }
    mount(key);
  }

  window.addEventListener('scroll', () => { target = window.scrollY || 0; schedule(); }, { passive: true });
  window.addEventListener('resize', () => { target = window.scrollY || 0; draw(); }, { passive: true });

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

  window.__gameScene = { sync, catalog: CATALOG };
})();
