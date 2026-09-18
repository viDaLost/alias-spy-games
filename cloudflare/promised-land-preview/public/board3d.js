// board3d.js — игровое поле в объёме.
//
// Доска, плитки с подписями, фишки, строения и кости — настоящая сцена, а не
// наклонённая страница. Всё, что не поле, остаётся разметкой поверх холста:
// текст в объёме мылится, а кнопки в объёме неудобны пальцу.
//
// Три решения держат нагрузку в узде, и без них сцена сажала бы батарею:
//
//   * кадр рисуется по событию, а не шестьдесят раз в секунду. Настольная игра
//     неподвижна почти всё время: между ходами сцена не трогается вовсе;
//   * подписи всех тридцати шести клеток лежат в одном полотне, нарисованном
//     один раз при запуске. Тридцать шесть отдельных текстур — это тридцать
//     шесть загрузок в видеопамять на ровном месте;
//   * теней от источника света нет. Вместо них под фишками и строениями лежат
//     тёмные пятна: карта теней для доски, где ничто не движется, — плата ни
//     за что.
//
// Если WebGL недоступен — а его на слабом телефоне могут и не дать, — игра
// остаётся на разметке. Поэтому здесь нет ни правил, ни состояния: только
// показ того, что посчитал движок.

window.PromisedLand3D = (() => {
  'use strict';

  const B = window.PromisedLandBoard;
  const SIZE = 10;                 // клеток по стороне сетки, по периметру — 36
  const TILE = 0.94;               // сторона плитки в единицах сцены
  const TILE_H = 0.17;             // её толщина
  const ATLAS_CELL = 256;          // сторона клетки в полотне подписей
  const ATLAS_COLS = 6;            // 6×6 = 36 подписей ровно
  /*
    Седьмой ряд полотна — не подпись, а ровная заливка цвета боковины плитки.
    Он нужен, чтобы у плитки был один материал на все шесть граней: коробка с
    массивом материалов рисуется по группе на грань, то есть шестью вызовами
    вместо одного. Тридцать шесть плиток — это двести шестнадцать вызовов на
    ровном месте, и на телефоне это видно.
  */
  const ATLAS_ROWS = 7;
  const SIDE_ROW = 6;
  /*
    Четыре разложения углов клетки полотна по вершинам верхней грани: ноль —
    подпись смотрит на игрока, дальше по четверти оборота. Меняется не плитка,
    а то, какой угол картинки куда попадает.
  */
  const LABEL_TURNS = [
    [[0, 1], [1, 1], [0, 0], [1, 0]],
    [[0, 0], [0, 1], [1, 0], [1, 1]],
    [[1, 0], [0, 0], [1, 1], [0, 1]],
    [[1, 1], [1, 0], [0, 1], [0, 0]],
  ];

  /** Есть ли на устройстве WebGL. Контекстов конечное число, и их могут не дать. */
  function supported() {
    if (!window.THREE) return false;
    try {
      const probe = document.createElement('canvas');
      return Boolean(probe.getContext('webgl2') || probe.getContext('webgl'));
    } catch {
      return false;
    }
  }

  /** Координаты клетки на доске: сетка 10×10, занят только периметр. */
  function cellPosition(n) {
    const [row, col] = B.gridPlace(n);
    return { x: col - (SIZE + 1) / 2, z: row - (SIZE + 1) / 2 };
  }

  // ————————————————————————————————————————————— подписи

  /**
   * Полотно подписей: по клетке на каждую клетку поля. Рисуется один раз.
   * Внутри — полоса цвета удела, название и цена; у особых клеток вместо цены
   * их значок словом не объяснить, поэтому там только название.
   */
  function buildLabelAtlas(theme) {
    const canvas = document.createElement('canvas');
    canvas.width = ATLAS_COLS * ATLAS_CELL;
    canvas.height = ATLAS_ROWS * ATLAS_CELL;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = theme.tileSide;
    ctx.fillRect(0, SIDE_ROW * ATLAS_CELL, canvas.width, ATLAS_CELL);
    const coins = [];

    B.BOARD.forEach((spec, index) => {
      const x = (index % ATLAS_COLS) * ATLAS_CELL;
      const y = Math.floor(index / ATLAS_COLS) * ATLAS_CELL;
      ctx.save();
      ctx.translate(x, y);

      ctx.fillStyle = theme.tile;
      ctx.fillRect(0, 0, ATLAS_CELL, ATLAS_CELL);

      const band = B.colorOf(spec);
      if (band) {
        ctx.fillStyle = band;
        ctx.fillRect(0, 0, ATLAS_CELL, ATLAS_CELL * 0.3);
      }

      /*
        Название переносится по словам и ужимается, пока не влезет: «Путь
        патриархов» в одну строку не помещается ни при каком кегле, который
        ещё можно прочесть на телефоне.
      */
      ctx.fillStyle = theme.ink;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const words = spec.name.split(' ');
      const lines = words.length > 1 && spec.name.length > 9
        ? [words[0], words.slice(1).join(' ')]
        : [spec.name];
      let font = 44;
      do {
        ctx.font = `700 ${font}px system-ui, sans-serif`;
        font -= 2;
      } while (font > 20 && lines.some((line) => ctx.measureText(line).width > ATLAS_CELL - 24));

      /*
        Низ карточки оставлен пустым: там ляжет подпись хозяина, когда удел
        купят. Поэтому имя и цена подняты — иначе подпись накрыла бы цену.
      */
      const top = ATLAS_CELL * (spec.price ? 0.42 : 0.6);
      lines.forEach((line, i) => {
        ctx.fillText(line, ATLAS_CELL / 2, top + (i - (lines.length - 1) / 2) * (font + 6));
      });

      if (spec.price) {
        ctx.font = '600 38px system-ui, sans-serif';
        ctx.fillStyle = theme.muted;
        /*
          Цена сдвинута вправо, а слева оставлено место под монету: сама монета
          — картинка, она придёт позже, и рисовать её будет уже загрузчик. Где
          именно — записано здесь, пока известна ширина числа.
        */
        const price = String(spec.price);
        const width = ctx.measureText(price).width;
        const coinSide = 34;
        const left = (ATLAS_CELL - width - coinSide - 8) / 2;
        ctx.textAlign = 'left';
        ctx.fillText(price, left + coinSide + 8, ATLAS_CELL * 0.66);
        ctx.textAlign = 'center';
        coins.push({ x: x + left, y: y + ATLAS_CELL * 0.66 - coinSide / 2, side: coinSide });
      }
      ctx.restore();
    });

    return { canvas, coins };
  }

  /** Грань кости: точки по сетке 3×3, как на настоящей. */
  const PIPS = {
    1: [[1, 1]],
    2: [[0, 0], [2, 2]],
    3: [[0, 0], [1, 1], [2, 2]],
    4: [[0, 0], [0, 2], [2, 0], [2, 2]],
    5: [[0, 0], [0, 2], [1, 1], [2, 0], [2, 2]],
    6: [[0, 0], [0, 2], [1, 0], [1, 2], [2, 0], [2, 2]],
  };

  /*
    Рубашка колоды. Рисуется полотном, а не картинкой: нужен не рисунок, а
    узнаваемая спина — цвет колоды, рамка и её имя. Двум колодам хватает двух
    полотен по сто двадцать восемь на сто семьдесят точек.
  */
  const DECK_LOOK = {
    providence: { back: '#4a4fa8', ink: '#eef0ff', name: 'ПРОВИДЕНИЕ' },
    mercy: { back: '#b07b2e', ink: '#fff6e4', name: 'МИЛОСТЬ' },
  };

  function deckBackCanvas(kind) {
    const look = DECK_LOOK[kind] || DECK_LOOK.providence;
    const canvas = document.createElement('canvas');
    canvas.width = 192;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = look.back;
    ctx.fillRect(0, 0, 192, 256);
    ctx.strokeStyle = look.ink;
    ctx.globalAlpha = 0.55;
    ctx.lineWidth = 5;
    ctx.strokeRect(13, 13, 166, 230);
    ctx.globalAlpha = 0.22;
    // Сетка ромбов: спина карты должна читаться спиной и с двух шагов.
    ctx.beginPath();
    for (let i = -6; i < 12; i += 1) {
      ctx.moveTo(i * 26, 0);
      ctx.lineTo(i * 26 + 256, 256);
      ctx.moveTo(i * 26, 256);
      ctx.lineTo(i * 26 + 256, 0);
    }
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.fillStyle = look.ink;
    ctx.font = '700 19px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(look.name, 96, 128);
    return canvas;
  }

  /*
    Табличка с именем над фишкой. Рисуется полотном и вешается спрайтом: спрайт
    всегда повёрнут к камере, поэтому имя читается с любой стороны, как ни
    поверни доску. Цвет таблички — цвет игрока: по нему фишка и находится на
    поле, а имя только подтверждает.
  */
  /** Прямоугольник со скруглёнными углами: его просят и табличка, и вывеска. */
  function roundedPath(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  /*
    Полотно вывесок: по ячейке на игрока и одна пустая про запас. Вывеска у
    всех уделов одного хозяина одинаковая, и держать её отдельной текстурой на
    каждый удел незачем — шестнадцать вывесок берут одно полотно и рисуются
    одной сеткой.
  */
  const BANNER_COLS = 4;
  const BANNER_ROWS = 2;
  function bannerAtlas(faces) {
    const cw = 256;
    const ch = 64;
    const canvas = document.createElement('canvas');
    canvas.width = cw * BANNER_COLS;
    canvas.height = ch * BANNER_ROWS;
    const ctx = canvas.getContext('2d');
    faces.forEach((face, i) => {
      if (!face) return;
      const x = (i % BANNER_COLS) * cw;
      const y = Math.floor(i / BANNER_COLS) * ch;
      ctx.save();
      ctx.translate(x, y);
      ctx.fillStyle = face.color;
      roundedPath(ctx, 5, 7, cw - 10, ch - 14, 10);
      ctx.fill();
      // Тёмная кромка: без неё светлая вывеска сливается с песком под доской.
      ctx.strokeStyle = 'rgba(15, 23, 42, 0.45)';
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      let size = 34;
      do {
        ctx.font = `700 ${size}px system-ui, sans-serif`;
        size -= 2;
      } while (size > 14 && ctx.measureText(face.text).width > cw - 34);
      ctx.fillText(face.text, cw / 2, ch / 2);
      ctx.restore();
    });
    return canvas;
  }

  function nameCanvas(text, color) {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 96;
    const ctx = canvas.getContext('2d');
    const radius = 30;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(radius, 8);
    ctx.arcTo(248, 8, 248, 88, radius);
    ctx.arcTo(248, 88, 8, 88, radius);
    ctx.arcTo(8, 88, 8, 8, radius);
    ctx.arcTo(8, 8, 248, 8, radius);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    let size = 46;
    do {
      ctx.font = `700 ${size}px system-ui, sans-serif`;
      size -= 2;
    } while (size > 20 && ctx.measureText(text).width > 212);
    ctx.fillText(text, 128, 50);
    return canvas;
  }

  function dieFaceCanvas(value, theme) {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = theme.dice;
    ctx.fillRect(0, 0, 128, 128);
    ctx.fillStyle = theme.ink;
    for (const [row, col] of PIPS[value]) {
      ctx.beginPath();
      ctx.arc(28 + col * 36, 28 + row * 36, 12, 0, Math.PI * 2);
      ctx.fill();
    }
    return canvas;
  }

  // ————————————————————————————————————————————— сцена
  // ————————————————————————————————————————————— земля вокруг доски

  /**
   * Земля под доской. Рисуется полотном, а не картинкой: нужен не пейзаж, а
   * поверхность, по которой глаз понимает, что доска на чём-то стоит. Полотно
   * кладётся с повтором, поэтому хватает двухсот пятидесяти шести точек.
   */
  function groundTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#c6ab7c';
    ctx.fillRect(0, 0, 256, 256);
    // Песок с крупой: точки двух оттенков вперемешку читаются как земля, а
    // ровная заливка — как бумага.
    let seed = 20250916;
    const random = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    for (let i = 0; i < 2600; i += 1) {
      const shade = random();
      ctx.fillStyle = shade < 0.45 ? 'rgba(142,118,78,.55)'
        : (shade < 0.8 ? 'rgba(214,195,155,.5)' : 'rgba(108,128,72,.4)');
      const size = 1 + random() * 2.4;
      ctx.fillRect(random() * 256, random() * 256, size, size);
    }
    return canvas;
  }

  // ————————————————————————————————————————————— сцена

  function create({ canvas, art, sceneArt, modelsAt, onCellTap, onViewChange, frameOf, theme }) {
    const THREE = window.THREE;
    /*
      Холст непрозрачен, и за землёй стоит не страница, а тёплая дымка. Раньше
      сквозь него просвечивал фон страницы, и на низком наклоне доска оказывалась
      на голубом листе вместо горизонта. Заодно это снимает смешивание с
      разметкой на каждом кадре — даром оно не даётся.
    */
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.setClearColor(0xdcc49a, 1);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(34, 1, 0.5, 120);

    /*
      Вид на доску держится тремя числами: поворот вокруг доски, наклон и
      отдаление. Их двигает палец, а расстояние до доски под них каждый раз
      подбирается заново — см. fit(). Поэтому как доску ни поверни, она
      остаётся в кадре целиком, а «отдалить» означает именно отойти, а не
      уронить половину поля за край.
    */
    const HOME = { yaw: 0, pitch: 0.9425, zoom: 1 };
    /*
      Угол, с которого смотрит камера, зависит от того, как держат телефон.

      Доска квадратная, и в кадре она тем шире и ниже, чем ниже стоит камера.
      Стоймя кадр вдвое выше своей ширины: доска упирается в ширину экрана, и
      всё, чего камера не добрала по высоте, остаётся песком над полем и под
      ним, — значит камере надо подняться. Боком наоборот: кадр широкий, доска
      упирается в высоту, и камере надо опуститься, чтобы доска стала шире.

      Померено на кольце клеток. Стоймя, 390×844: 231 точка высоты на прежнем
      общем угле, 246 на этом. Боком, 844×390: 294 точки ширины на прежнем,
      346 на этом — доска прибавила пятую часть, а вид от этого стал ближе к
      столу, на который смотрят сидя.
    */
    const TALL = 1.02;
    const WIDE = 0.8;
    const homePitch = () => (height > width * 1.15 ? TALL : WIDE);
    /*
      Поворот не ограничен ничем: доску можно обойти кругом и посмотреть с
      любой стороны — она для того и стоит на земле. А вот подниматься выше
      шестидесяти четырёх градусов нельзя: оттуда в кадре остаётся одна доска,
      земля с пальмами и камнями уходит за край, и сцена превращается в чертёж.
      Нижняя граница — чтобы доска не вырождалась в полоску.
    */
    /*
      Приближение — это множитель к расстоянию, которое подобрал fit(): меньше
      значит ближе. Нижняя граница опущена до 0.4 — с неё клетка занимает
      треть экрана, и постройку на ней видно в подробностях. Ниже уходить
      незачем: на 0.3 камера ныряет под кромку доски и смотрит ей в бок.
    */
    const LIMITS = { pitch: [0.42, 1.12], zoom: [0.4, 1.9] };
    const FULL = Math.PI * 2;
    // Разница углов, приведённая к ближайшей: поворот на 350° — это −10°.
    const shortest = (angle) => angle - Math.round(angle / FULL) * FULL;
    const view = { ...HOME };
    const TARGET = new THREE.Vector3(0, 0, 0.35);
    const clamp = (value, [low, high]) => Math.min(high, Math.max(low, value));

    const DIR = new THREE.Vector3();
    const UP = new THREE.Vector3();
    const aim = new THREE.Vector3();
    function axes() {
      const { yaw, pitch } = view;
      DIR.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
      UP.set(-Math.sin(yaw) * Math.sin(pitch), Math.cos(pitch), -Math.cos(yaw) * Math.sin(pitch));
    }

    // ——— свет ———
    /*
      Свет приглушён намеренно. При прежней яркости песок выходил почти белым и
      сливался с доской: на снимке они отличались на единицы, а глазом доска
      переставала быть предметом на земле и становилась пятном на пятне.
    */
    scene.add(new THREE.HemisphereLight(0xffffff, 0x9d8c6a, 0.66));
    const sun = new THREE.DirectionalLight(0xfff3dd, 0.58);
    sun.position.set(5, 11, 6);
    scene.add(sun);

    // ——— земля ———
    const groundMap = new THREE.CanvasTexture(groundTexture());
    groundMap.wrapS = THREE.RepeatWrapping;
    groundMap.wrapT = THREE.RepeatWrapping;
    groundMap.repeat.set(15, 15);
    groundMap.encoding = THREE.sRGBEncoding;
    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(SIZE * 5, 56),
      new THREE.MeshLambertMaterial({ map: groundMap }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.52;
    scene.add(ground);

    // Тень доски на земле: мягкое пятно, а не карта теней. Считать тени ради
    // одной неподвижной коробки — платить кадром за то, что можно нарисовать.
    const boardShade = new THREE.Mesh(
      new THREE.PlaneGeometry(SIZE + 1.4, SIZE + 1.4),
      new THREE.MeshBasicMaterial({ color: 0x4a3a22, transparent: true, opacity: 0.15 }),
    );
    boardShade.rotation.x = -Math.PI / 2;
    boardShade.position.set(0.25, -0.5, 0.35);
    scene.add(boardShade);

    // ——— доска ———
    const board = new THREE.Mesh(
      new THREE.BoxGeometry(SIZE + 0.5, 0.45, SIZE + 0.5),
      new THREE.MeshLambertMaterial({ color: theme.board }),
    );
    board.position.y = -0.24;
    scene.add(board);

    const field = new THREE.Mesh(
      new THREE.BoxGeometry(SIZE - 1.6, 0.06, SIZE - 1.6),
      new THREE.MeshLambertMaterial({ color: theme.field }),
    );
    field.position.y = -0.01;
    scene.add(field);

    /*
      Середина доски иначе остаётся белым квадратом: на разметочном поле в этой
      дырке висела карточка, а здесь она ушла вниз. Рисунок кладётся отдельной
      плоскостью в своих пропорциях — растянуть его по квадрату значило бы его
      исказить.
    */
    if (sceneArt) {
      new THREE.TextureLoader().load(sceneArt, (texture) => {
        texture.encoding = THREE.sRGBEncoding;
        const inlayWidth = SIZE - 2.9;
        const inlay = new THREE.Mesh(
          new THREE.PlaneGeometry(inlayWidth, inlayWidth * 2 / 3),
          new THREE.MeshLambertMaterial({ map: texture, transparent: true, opacity: 0.92 }),
        );
        inlay.rotation.x = -Math.PI / 2;
        inlay.position.set(0, 0.03, 0);
        scene.add(inlay);
        // Картина в середине доски поворачивается вместе с подписями: вверх
        // ногами пейзаж смотрится хуже, чем повёрнутым на четверть.
        middleArt = inlay;
        inlay.rotation.z = -labelTurn * Math.PI / 2;
        touch();
      });
    }

    // ——— плитки с подписями ———
    const { canvas: sheet, coins } = buildLabelAtlas(theme);
    const atlas = new THREE.CanvasTexture(sheet);
    atlas.encoding = THREE.sRGBEncoding;
    atlas.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
    const topMat = new THREE.MeshLambertMaterial({ map: atlas });

    /*
      Значки особых клеток. По одному названию «Провидение» или «Милость» не
      понять, чем они друг от друга отличаются, — а по рисунку понятно сразу.
      Значки дорисовываются в то же полотно, когда загрузятся: полотно у плиток
      одно, и добавить в него картинку дешевле, чем завести ещё тридцать шесть
      материалов ради восьми рисунков.
    */
    const ICON_KINDS = new Set(['exodus', 'prison', 'tent', 'slander',
      'tithe', 'offering', 'providence', 'mercy']);
    let iconsDrawn = 0;
    let coinsDrawn = 0;
    if (art) {
      const paint = sheet.getContext('2d');
      for (const spec of B.BOARD) {
        if (!ICON_KINDS.has(spec.kind)) continue;
        const picture = new Image();
        picture.onload = () => {
          const col = spec.n % ATLAS_COLS;
          const row = Math.floor(spec.n / ATLAS_COLS);
          const side = ATLAS_CELL * 0.46;
          paint.drawImage(picture,
            col * ATLAS_CELL + (ATLAS_CELL - side) / 2,
            row * ATLAS_CELL + ATLAS_CELL * 0.09,
            side, side);
          atlas.needsUpdate = true;
          iconsDrawn += 1;
          touch();
        };
        picture.src = art('icons', `icon-${spec.kind}`);
      }
      // Монета к цене: один рисунок на все шестнадцать уделов и шесть путей.
      const shekel = new Image();
      shekel.onload = () => {
        for (const spot of coins) paint.drawImage(shekel, spot.x, spot.y, spot.side, spot.side);
        atlas.needsUpdate = true;
        coinsDrawn = coins.length;
        touch();
      };
      shekel.src = art('icons', 'ui-shekel');
    }

    const tiles = [];
    const owners = [];
    for (const spec of B.BOARD) {
      const geometry = new THREE.BoxGeometry(TILE, TILE_H, TILE);
      /*
        Верхняя грань коробки — третья группа вершин, четыре штуки подряд.
        Им подменяются координаты текстуры, чтобы каждая плитка брала из общего
        полотна свою подпись: так все тридцать шесть живут на одной текстуре.
      */
      const uv = geometry.attributes.uv;
      const col = spec.n % ATLAS_COLS;
      const row = Math.floor(spec.n / ATLAS_COLS);
      const stepX = 1 / ATLAS_COLS;
      const stepY = 1 / ATLAS_ROWS;
      for (let i = 0; i < 4; i += 1) {
        const corner = LABEL_TURNS[0][i];
        uv.setXY(8 + i, (col + corner[0]) * stepX, 1 - (row + 1 - corner[1]) * stepY);
      }
      // Остальные двадцать вершин смотрят в ровный седьмой ряд: боковины у
      // плитки одноцветные, и материал у неё поэтому один.
      const sideU = (col + 0.5) * stepX;
      const sideV = 1 - (SIDE_ROW + 0.5) * stepY;
      for (let i = 0; i < 24; i += 1) {
        if (i >= 8 && i < 12) continue;
        uv.setXY(i, sideU, sideV);
      }
      uv.needsUpdate = true;

      const tile = new THREE.Mesh(geometry, topMat);
      const at = cellPosition(spec.n);
      tile.position.set(at.x, TILE_H / 2, at.z);
      tile.userData.cell = spec.n;
      tile.userData.col = col;
      tile.userData.row = row;
      scene.add(tile);
      tiles.push(tile);

      // Полоса владельца: тонкая пластина под плиткой, до покупки невидимая.
      const strip = new THREE.Mesh(
        new THREE.BoxGeometry(TILE + 0.06, 0.05, TILE + 0.06),
        new THREE.MeshLambertMaterial({ color: 0xffffff }),
      );
      strip.position.set(at.x, 0.02, at.z);
      strip.visible = false;
      scene.add(strip);
      owners.push(strip);
    }

    /*
      Подпись хозяина. Полоса под плиткой говорит, что удел занят, но не чей
      он: на шестерых за столом цвет подставки приходится вспоминать. Поэтому
      на самой карточке, вдоль её нижнего края, лежит цветная плашка с именем
      хозяина.

      Лежит, а не стоит. Стоячую доску видно только сбоку, а на доску смотрят
      сверху: подпись должна читаться там же, где и имя удела, — на карточке.
      Место под неё освобождено в самом полотне подписей: имя и цена подняты,
      и нижняя четверть карточки пустует, пока удел ничей.

      Все подписи — одна сетка и одно полотно: тридцать шесть отдельных
      пластин стоили бы тридцати шести вызовов отрисовки, а так они стоят
      одного. Незанятый удел не прячется видимостью — у него просто нет
      площади: четыре его вершины сходятся в одну точку под доской, и
      рисовать там нечего.
    */
    const BANNER_W = TILE * 0.9;
    const BANNER_D = TILE * 0.23;
    // Отступ от середины плитки к её нижнему краю — тому, что ближе к игроку.
    const BANNER_SHIFT = TILE * 0.345;
    // Впритык над лицом плитки: ниже — мерцание от совпадения плоскостей.
    const BANNER_LIFT = TILE_H + 0.005;
    const bannerSlot = new Int8Array(B.BOARD.length).fill(-1);
    const bannerPos = new Float32Array(B.BOARD.length * 12);
    const bannerUv = new Float32Array(B.BOARD.length * 8);
    const bannerIdx = [];
    for (let n = 0; n < B.BOARD.length; n += 1) {
      const o = n * 4;
      bannerIdx.push(o, o + 2, o + 1, o + 2, o + 3, o + 1);
    }
    const bannerGeo = new THREE.BufferGeometry();
    bannerGeo.setAttribute('position', new THREE.BufferAttribute(bannerPos, 3));
    bannerGeo.setAttribute('uv', new THREE.BufferAttribute(bannerUv, 2));
    bannerGeo.setIndex(bannerIdx);
    const bannerTex = new THREE.CanvasTexture(bannerAtlas([]));
    bannerTex.encoding = THREE.sRGBEncoding;
    const bannerMesh = new THREE.Mesh(bannerGeo, new THREE.MeshBasicMaterial({
      map: bannerTex,
      transparent: true,
      // Порог вместо смешивания: вывеска не полупрозрачна, ей нужен только
      // вырез вокруг доски, а порог не заставляет сортировать её с постройками.
      alphaTest: 0.45,
      side: THREE.DoubleSide,
    }));
    // Вершины двигаются руками, и границы сетки за ними не поспевают.
    bannerMesh.frustumCulled = false;
    scene.add(bannerMesh);

    let bannerQuarter = 0;

    /*
      Куда ложится подпись. Подписи клеток развёрнуты к игроку все разом: на
      доске нет «своей» стороны у карточки — верх у всех тридцати шести один,
      экранный, и он переезжает вслед за камерой. Подпись хозяина живёт по
      тому же правилу: она всегда у нижнего края карточки, как её ни поверни,
      и читается вместе с именем удела.
    */
    function placeBanners() {
      // Куда на доске смотрит «вниз по экрану»: в сторону игрока.
      const dx = Math.round(Math.sin(bannerQuarter * Math.PI / 2));
      const dz = Math.round(Math.cos(bannerQuarter * Math.PI / 2));
      // И «вправо по экрану» — перпендикуляр к нему.
      const rx = dz * BANNER_W / 2;
      const rz = -dx * BANNER_W / 2;
      const px = dx * BANNER_D / 2;
      const pz = dz * BANNER_D / 2;
      for (let n = 0; n < B.BOARD.length; n += 1) {
        const o = n * 12;
        if (bannerSlot[n] < 0) {
          for (let i = 0; i < 12; i += 3) {
            bannerPos[o + i] = 0;
            bannerPos[o + i + 1] = -12;
            bannerPos[o + i + 2] = 0;
          }
          continue;
        }
        const at = cellPosition(n);
        const cx = at.x + dx * BANNER_SHIFT;
        const cz = at.z + dz * BANNER_SHIFT;
        const corners = [
          [cx - rx - px, BANNER_LIFT, cz - rz - pz],
          [cx + rx - px, BANNER_LIFT, cz + rz - pz],
          [cx - rx + px, BANNER_LIFT, cz - rz + pz],
          [cx + rx + px, BANNER_LIFT, cz + rz + pz],
        ];
        for (let i = 0; i < 4; i += 1) {
          bannerPos[o + i * 3] = corners[i][0];
          bannerPos[o + i * 3 + 1] = corners[i][1];
          bannerPos[o + i * 3 + 2] = corners[i][2];
        }
      }
      bannerGeo.attributes.position.needsUpdate = true;
      bannerGeo.computeBoundingSphere();
    }

    /** Чья вывеска висит над уделом: ячейка полотна или ничья. */
    function bannerFace(n, slot) {
      if (bannerSlot[n] === slot) return false;
      bannerSlot[n] = slot;
      if (slot < 0) return true;
      const col = slot % BANNER_COLS;
      const row = Math.floor(slot / BANNER_COLS);
      const u0 = col / BANNER_COLS;
      const u1 = (col + 1) / BANNER_COLS;
      const v1 = 1 - row / BANNER_ROWS;
      const v0 = 1 - (row + 1) / BANNER_ROWS;
      const o = n * 8;
      const uv = [[u0, v1], [u1, v1], [u0, v0], [u1, v0]];
      for (let i = 0; i < 4; i += 1) {
        bannerUv[o + i * 2] = uv[i][0];
        bannerUv[o + i * 2 + 1] = uv[i][1];
      }
      bannerGeo.attributes.uv.needsUpdate = true;
      return true;
    }

    /** Перерисовать полотно вывесок: имена и цвета сидящих за столом. */
    let bannerNames = '';
    function bannerPeople(state) {
      const faces = state.players.map((player) => ({
        text: nameOf(state, player), color: colorOfPlayer(player),
      }));
      const key = faces.map((face) => `${face.text}|${face.color}`).join('/');
      if (key === bannerNames) return;
      bannerNames = key;
      bannerTex.image = bannerAtlas(faces);
      bannerTex.needsUpdate = true;
    }

    /*
      Подписи впечатаны в полотно одной стороной, и, обойдя доску кругом, игрок
      читал бы их вверх ногами. Разворачивать сами плитки нельзя — повернётся
      и цветная полоса удела, и постройка на ней. Поэтому поворачивается
      текстура: четыре набора углов, по одному на четверть оборота, и на каждой
      четверти подписи снова смотрят на игрока.
    */
    let labelTurn = 0;
    let middleArt = null;
    let turnDecks = () => {};

    function turnLabels(index) {
      if (index === labelTurn) return;
      labelTurn = index;
      // Имена колод написаны на их рубашках, и они поворачиваются вместе с
      // подписями клеток: иначе, обойдя доску, игрок читает «ПРОВИДЕНИЕ» вбок.
      // Сами колоды собираются ниже по файлу, поэтому поворот им передаётся
      // через крючок, а не прямой ссылкой: иначе это обращение к ещё не
      // объявленному.
      turnDecks(-index * Math.PI / 2);
      if (middleArt) middleArt.rotation.z = -index * Math.PI / 2;
      const stepX = 1 / ATLAS_COLS;
      const stepY = 1 / ATLAS_ROWS;
      for (const tile of tiles) {
        const uv = tile.geometry.attributes.uv;
        const { col, row } = tile.userData;
        for (let i = 0; i < 4; i += 1) {
          const corner = LABEL_TURNS[index][i];
          uv.setXY(8 + i, (col + corner[0]) * stepX, 1 - (row + 1 - corner[1]) * stepY);
        }
        uv.needsUpdate = true;
      }
    }

    /*
      Кольцо подсветки: им обучение показывает, о какой клетке речь. Одно на
      всю сцену — подсвечивать две клетки разом незачем, а лишний предмет в
      сцене стоит кадра.
    */
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x4f46e5, transparent: true, opacity: 0.85, side: THREE.DoubleSide,
    });
    const ring = new THREE.Mesh(new THREE.RingGeometry(TILE * 0.62, TILE * 0.78, 28), ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.visible = false;
    scene.add(ring);

    // ————————————————————————————————————————————— фигурки и постройки

    const Figures = window.PromisedLandFigures;
    const BUILD_KINDS = ['well', 'tent', 'house', 'wall', 'tower'];
    const TOKEN_KINDS = ['staff', 'jar', 'sheaf', 'lamp', 'scroll', 'sling'];
    /*
      Фишки игроков — шесть людей, по одному на место за столом. Приходят они
      моделями и встают на ту же круглую подставку цвета игрока, на которой
      прежде стоял предмет: цвет фишки — это подставка, а не одежда, и
      подменять надо только то, что на ней стоит.
    */
    const PEOPLE = ['citizen', 'spearman', 'archer', 'healer', 'javelin', 'fisher'];

    /*
      Прообразы построек. Каждая собирается один раз, а на клетки ставятся её
      копии: клон в three.js делит с прообразом и геометрию, и материалы, так
      что шестнадцать башен стоят ровно одной башни.
    */
    const prototypes = new Map();
    function buildingOf(kind) {
      if (!prototypes.has(kind)) prototypes.set(kind, Figures.building(kind));
      return prototypes.get(kind).clone(true);
    }

    /*
      Настоящие модели построек. Пять ступеней приходят готовыми .glb — по
      сетке и текстуре на каждую, — и заменяют собранные из примитивов
      фигурки. Замена, а не выбор: модели грузятся после того, как доска уже
      стоит на экране, и до их приезда игра идёт на прежних фигурках. Не
      доехали вовсе — так на них и останется; постройка на клетке важнее
      того, из чего она сделана.

      Жертвенника среди моделей нет — в исходниках его не оказалось, — и он
      по-прежнему собирается из примитивов.
    */
    const carved = new Set();
    // Пришедшие модели людей: по месту за столом. Фишка может появиться
    // позже модели — тогда человек встаёт на неё при создании фишки.
    const people = new Map();

    function restock(kind) {
      let touched = false;
      builds.forEach((holder) => {
        if (holder.userData.kind !== kind) return;
        for (let i = holder.children.length - 1; i >= 1; i -= 1) holder.remove(holder.children[i]);
        holder.add(buildingOf(kind));
        touched = true;
      });
      if (touched) touch();
    }

    /** Мягкое пятно под предметом: тень без карты теней. */
    function shade(radius, opacity) {
      const disc = new THREE.Mesh(
        new THREE.CircleGeometry(radius, 18),
        new THREE.MeshBasicMaterial({ color: 0x3a2c18, transparent: true, opacity }),
      );
      disc.rotation.x = -Math.PI / 2;
      return disc;
    }

    // На каждой клетке — держатель постройки: в нём либо пусто, либо одна
    // фигурка. Так смена ступени не пересобирает сцену, а меняет одного ребёнка.
    const builds = B.BOARD.map((spec) => {
      const holder = new THREE.Group();
      const at = cellPosition(spec.n);
      /*
        Постройка стоит не в середине плитки, а на цветной полосе удела — там,
        где у настольных игр и стоят домики. Полоса обращена к середине доски,
        и постройка отодвинута к самому её краю: чем дальше она от середины
        карточки, тем меньше накрывает имя удела и цену. Совсем не накрывать
        она не может — доску видно под углом, и всё, что на ней стоит,
        проецируется на то, что за ним; так же лежат домики и на картонном
        поле. Повёрнута постройка лицом к игроку, то есть наружу от доски.
      */
      const band = Math.abs(at.x) > Math.abs(at.z)
        ? { x: -Math.sign(at.x) * 0.34, z: 0 }
        : { x: 0, z: -Math.sign(at.z) * 0.34 };
      holder.position.set(at.x + band.x, TILE_H, at.z + band.z);
      holder.rotation.y = Math.atan2(-band.x, -band.z);
      holder.visible = false;
      const disc = shade(0.3, 0.2);
      disc.position.y = 0.005;
      holder.add(disc);
      holder.userData.kind = null;
      scene.add(holder);
      return holder;
    });

    const tokens = [];
    const shadows = [];
    const plates = [];

    // ————————————————————————————————————————————— две колоды на доске

    /*
      Стопки стоят в середине доски рубашкой вверх — там, где им и место за
      настоящим столом. Карта из них не появляется в окне: верхняя поднимается,
      летит на середину, по дороге переворачивается лицом и ждёт, пока прочтут.
      По нажатию она уходит обратно и ложится под низ своей стопки.
    */
    const CARD = { w: 1.46, h: 0.035, d: 1.94 };
    const DECK_AT = { providence: -1.75, mercy: 1.75 };
    const DECK_Z = -2.25;
    const STACK = 5;

    const cardGeometry = new THREE.BoxGeometry(CARD.w, CARD.h, CARD.d);
    const cardEdge = new THREE.MeshLambertMaterial({ color: 0xf2eee4 });
    const decks = {};
    // (turnLabels обращается к ним же — объявлены выше по файлу)
    for (const kind of ['providence', 'mercy']) {
      const back = new THREE.CanvasTexture(deckBackCanvas(kind));
      back.encoding = THREE.sRGBEncoding;
      const backMat = new THREE.MeshLambertMaterial({ map: back });
      const pile = [];
      for (let i = 0; i < STACK; i += 1) {
        const card = new THREE.Mesh(cardGeometry, backMat);
        card.position.set(DECK_AT[kind], 0.06 + i * CARD.h, DECK_Z);
        scene.add(card);
        pile.push(card);
      }
      decks[kind] = { pile, backMat, back };
    }

    /*
      Летающая карта одна на обе колоды: в воздухе их никогда не бывает двух.
      Верх у неё — лицо, низ — рубашка, поэтому переворот это поворот на пол-
      оборота вокруг длинной стороны, а не подмена картинки.
    */
    const faceMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
    const flyer = new THREE.Mesh(cardGeometry, [
      cardEdge, cardEdge, faceMat, decks.providence.backMat, cardEdge, cardEdge,
    ]);
    flyer.visible = false;
    scene.add(flyer);
    const faces = new Map();
    let flying = null;

    turnDecks = (angle) => {
      for (const kind of Object.keys(decks)) {
        for (const card of decks[kind].pile) card.rotation.y = angle;
      }
      flyer.userData.turn = angle;
    };

    /*
      Лицо карты собирается полотном, а не берётся картинкой напрямую: у
      рисунков карт прозрачный фон, и на карте он выходил чёрным провалом.
      Здесь под рисунок кладётся пергамент с рамкой цвета колоды — и карта
      выглядит картой, а не дырой в столе.
    */
    function faceTexture(url, kind) {
      const key = `${kind}|${url}`;
      if (faces.has(key)) return faces.get(key);
      const look = DECK_LOOK[kind] || DECK_LOOK.providence;
      const canvas = document.createElement('canvas');
      canvas.width = 192;
      canvas.height = 256;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#f7f2e6';
      ctx.fillRect(0, 0, 192, 256);
      ctx.strokeStyle = look.back;
      ctx.lineWidth = 6;
      ctx.strokeRect(9, 9, 174, 238);
      const texture = new THREE.CanvasTexture(canvas);
      texture.encoding = THREE.sRGBEncoding;
      const picture = new Image();
      picture.onload = () => {
        const side = 130;
        ctx.drawImage(picture, (192 - side) / 2, 34, side, side);
        ctx.fillStyle = look.back;
        ctx.font = '700 15px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(look.name, 96, 196);
        texture.needsUpdate = true;
        touch();
      };
      picture.src = url;
      faces.set(key, texture);
      return texture;
    }

    /** Карта выходит из колоды: поднялась, долетела, перевернулась лицом. */
    function dealCard(kind, faceUrl) {
      const deck = decks[kind] || decks.providence;
      if (flying) returnCard();
      flying = { kind };
      flyer.material[3] = deck.backMat;
      faceMat.map = faceUrl ? faceTexture(faceUrl, kind) : null;
      faceMat.needsUpdate = true;
      const top = deck.pile[deck.pile.length - 1];
      top.visible = false;
      const from = top.position.clone();
      const to = new THREE.Vector3(0, 0.62, -0.25);
      flyer.position.copy(from);
      flyer.rotation.set(Math.PI, 0, 0);
      flyer.visible = true;
      return animate(0.78, (t) => {
        const k = smooth(t);
        flyer.position.lerpVectors(from, to, k);
        flyer.position.y += Math.sin(Math.PI * k) * 0.85;
        // Переворот идёт во второй половине пути: сперва долететь, потом
        // показать лицо — так глаз успевает за картой.
        const turn = Math.min(1, Math.max(0, (k - 0.25) / 0.75));
        flyer.rotation.x = Math.PI * (1 - smooth(turn));
        flyer.rotation.y = (flyer.userData.turn || 0) + Math.sin(Math.PI * k) * 0.35;
      });
    }

    /** И обратно: перевернулась рубашкой и легла под низ своей стопки. */
    function returnCard() {
      if (!flying) return Promise.resolve();
      const deck = decks[flying.kind] || decks.providence;
      flying = null;
      const from = flyer.position.clone();
      const at = deck.pile[deck.pile.length - 1].position;
      const to = new THREE.Vector3(at.x, 0.06, at.z);
      const startTurn = flyer.rotation.x;
      return animate(0.6, (t) => {
        const k = smooth(t);
        flyer.position.lerpVectors(from, to, k);
        flyer.position.y += Math.sin(Math.PI * k) * 0.55;
        flyer.rotation.x = startTurn + (Math.PI - startTurn) * k;
        flyer.rotation.y = (flyer.userData.turn || 0) + Math.sin(Math.PI * k) * -0.3;
      }).then(() => {
        flyer.visible = false;
        // Стопка поднимается на одну карту: ушедшая легла под низ.
        for (const card of deck.pile) card.visible = true;
      });
    }

    // ————————————————————————————————————————————— кости

    const dieMaterials = [3, 4, 1, 6, 5, 2].map((value) => {
      const texture = new THREE.CanvasTexture(dieFaceCanvas(value, theme));
      texture.encoding = THREE.sRGBEncoding;
      return new THREE.MeshLambertMaterial({ map: texture });
    });
    const dice = [0, 1].map((i) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.62, 0.62), dieMaterials);
      mesh.position.set(-0.55 + i * 1.1, 0.34, 1.9);
      mesh.visible = false;
      scene.add(mesh);
      return mesh;
    });

    /*
      Поворот, при котором нужное число смотрит вверх. Грани разложены так, что
      противоположные дают в сумме семь, как на настоящей кости.
    */
    const FACE_UP = {
      1: [0, 0, 0],
      2: [Math.PI / 2, 0, 0],
      3: [0, 0, Math.PI / 2],
      4: [0, 0, -Math.PI / 2],
      5: [-Math.PI / 2, 0, 0],
      6: [Math.PI, 0, 0],
    };

    // ————————————————————————————————————————————— кадр по событию

    let dirty = true;
    let running = false;
    let width = 0;
    let height = 0;
    const clock = new THREE.Clock();
    const jobs = [];

    function render() {
      if (!dirty && !jobs.length) return;
      dirty = false;
      renderer.render(scene, camera);
    }

    /** Перерисовать при следующей возможности: сцена изменилась. */
    function touch() {
      dirty = true;
      if (!running) render();
    }

    /*
      Цикл крутится только пока есть что двигать. Кончились дела — цикл встаёт,
      и сцена перестаёт стоить хоть что-нибудь до следующего хода.
    */
    function pump() {
      if (!running) return;
      const delta = Math.min(clock.getDelta(), 0.05);
      for (let i = jobs.length - 1; i >= 0; i -= 1) {
        jobs[i].time += delta;
        const done = jobs[i].step(Math.min(1, jobs[i].time / jobs[i].life));
        if (done || jobs[i].time >= jobs[i].life) {
          jobs[i].finish();
          jobs.splice(i, 1);
        }
      }
      dirty = true;
      render();
      if (jobs.length) requestAnimationFrame(pump);
      else running = false;
    }

    /*
      Общий множитель длительности. Им управляет кнопка «Быстрее»: она не
      пропускает движения, а проигрывает их короче — фишка всё так же идёт по
      клеткам, просто быстрее.
    */
    let speed = 1;
    const setSpeed = (value) => { speed = Math.max(0.15, Math.min(2, value || 1)); };

    function animate(life, step) {
      return new Promise((resolve) => {
        jobs.push({ time: 0, life: Math.max(0.05, life * speed), step, finish: () => { step(1); resolve(); } });
        if (!running) { running = true; clock.getDelta(); requestAnimationFrame(pump); }
      });
    }

    /** Разгон и торможение: движение без рывков на концах. */
    const smooth = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

    // ————————————————————————————————————————————— кадр под доску

    /*
      Что обязано влезть в кадр. Доска — плоская коробка во всю ширину, а всё
      высокое (строения и фишки) стоит только на клетках периметра, ближе к
      середине. Считать их по углам доски значило бы резервировать высоту там,
      где ничего не стоит, и доска от этого мельчала бы на ровном месте.
    */
    const HALF = (SIZE + 0.5) / 2 + 0.15;
    // Кольцо считается по внешнему краю плиток, а не по их серединам: иначе
    // ближний ряд наполовину уходит под полосу управления.
    const RIM = (SIZE - 1) / 2 + TILE / 2 + 0.06;
    // Вся доска целиком — она не должна вылезать за холст ни при каком угле.
    const boxCorners = [];
    for (const x of [-HALF, HALF]) {
      for (const y of [-0.45, 0.2]) {
        for (const z of [-HALF, HALF]) boxCorners.push(new THREE.Vector3(x, y, z));
      }
    }
    /*
      А это — то, что обязано остаться на виду: кольцо клеток и всё, что на нём
      стоит. Разница между двумя наборами и есть поле доски, её пустая кромка.
      Ей под полосой управления лежать не жалко, а ряду клеток — нельзя.
    */
    const tileCorners = [];
    for (const x of [-RIM, RIM]) {
      for (const y of [0, 0.85]) {
        for (const z of [-RIM, RIM]) tileCorners.push(new THREE.Vector3(x, y, z));
      }
    }
    boxCorners.push(...tileCorners);
    const probe = new THREE.Vector3();

    /*
      Доска целиком должна помещаться в кадр — под любым углом, на котором её
      остановил палец. Перспектива нелинейна по расстоянию, поэтому вместо
      формулы здесь несколько итераций: поставили камеру, спроецировали углы
      габаритной коробки, отодвинулись ровно на столько, на сколько они вылезли,
      и заодно подвинули кадр так, чтобы доска встала в нём по центру.
      Отдаление пальцем множит найденное расстояние — «отойти» значит отойти,
      а не уронить половину поля за край.
    */
    function fit() {
      axes();
      /*
        Часть холста бывает занята: боком полоса управления лежит поверх нижнего
        края доски. Доску тогда надо вписать не в весь кадр, а в свободную его
        часть — иначе ближний ряд клеток уедет под кнопки. Сколько занято,
        спрашивается у разметки: считать это здесь второй раз значило бы
        повторять её вычисления и однажды разойтись с ними.
      */
      const inset = frameOf ? frameOf() : null;
      const low = -0.98 + (inset && height ? 2 * Math.max(0, inset.bottom || 0) / height : 0);
      const high = 0.98 - (inset && height ? 2 * Math.max(0, inset.top || 0) / height : 0);
      const middle = (low + high) / 2;
      const room = Math.max(0.15, (high - low) / 2);

      /*
        Свободное место считается и вширь.

        Боком кнопки собраны в правый нижний угол — это не полоса во всю
        ширину, а столбец. Пока камера знала только про «занято снизу», такой
        столбец объявлял занятой всю нижнюю полосу: доска уезжала вверх, под
        самую шапку, а под ней оставалась треть экрана пустого песка. Померено
        на прежнем коде: доска занимала 230 точек по высоте из 390, начиналась
        на тридцать первой — то есть лезла под шапку — и кончалась на 261-й.

        Теперь занятый столбец сдвигает доску вбок, а не вверх: она встаёт
        посередине того, что осталось, и берёт всю высоту.
      */
      const west = -1 + (inset && width ? 2 * Math.max(0, inset.left || 0) / width : 0);
      const east = 1 - (inset && width ? 2 * Math.max(0, inset.right || 0) / width : 0);
      const centreX = (west + east) / 2;
      const span = Math.max(0.15, (east - west) / 2);

      let distance = 20;
      let lift = 0;
      let slide = 0;
      /*
        Вправо по экрану. DIR смотрит от доски на камеру, поэтому «вправо» —
        это UP×DIR, а не DIR×UP: с обратным порядком сдвиг шёл в другую
        сторону, сам себя усиливал и за десять проходов уносил камеру так, что
        доска оказывалась у неё за спиной.
      */
      const RIGHT = new THREE.Vector3().crossVectors(UP, DIR).normalize();
      for (let pass = 0; pass < 10; pass += 1) {
        aim.copy(TARGET).addScaledVector(UP, lift).addScaledVector(RIGHT, slide);
        camera.position.copy(aim).addScaledVector(DIR, distance);
        camera.lookAt(aim);
        camera.updateMatrixWorld(true);
        camera.updateProjectionMatrix();
        let allLow = Infinity; let allHigh = -Infinity;
        let allWest = Infinity; let allEast = -Infinity;
        for (const corner of boxCorners) {
          probe.copy(corner).project(camera);
          allLow = Math.min(allLow, probe.y);
          allHigh = Math.max(allHigh, probe.y);
          allWest = Math.min(allWest, probe.x);
          allEast = Math.max(allEast, probe.x);
        }
        let ringLow = Infinity; let ringHigh = -Infinity;
        let ringWest = Infinity; let ringEast = -Infinity;
        for (const corner of tileCorners) {
          probe.copy(corner).project(camera);
          ringLow = Math.min(ringLow, probe.y);
          ringHigh = Math.max(ringHigh, probe.y);
          ringWest = Math.min(ringWest, probe.x);
          ringEast = Math.max(ringEast, probe.x);
        }
        /*
          Доска целиком остаётся в холсте — это меряется от середины холста, а
          не от середины свободного места. От середины свободного считалась
          прежде, и вот к чему это вело: сдвинутая влево доска «помещалась»,
          считая от своей новой середины, а левым краем уходила за экран.
        */
        const wide = Math.max(Math.abs(allWest), Math.abs(allEast));
        const ringWide = Math.max(Math.abs(ringWest - centreX), Math.abs(ringEast - centreX));
        /*
          Кадр ставится так, чтобы кольцо клеток встало по середине свободной
          части, а вся доска — по середине холста. Между двумя этими желаниями
          выбирается то, что сильнее жмёт: доска не вылезет, клетки не уйдут
          под кнопки.
        */
        /*
          Доска стоит выше середины свободного места, а не ровно посередине.

          Посередине её ставила прежняя строка, и на высоком экране это
          выглядело так: над полем сто девяносто точек песка и под ним столько
          же. Сверху эта полоса пустая и видна вся; снизу под ней лежат кнопки,
          и половину её не видно вовсе. Так на столе и бывает: доска ближе к
          дальнему краю, руки — к ближнему. Поэтому лишняя высота отдаётся вниз
          с перевесом, а не делится поровну. Когда свободное место доске впору
          (боком так и есть), запаса нет и сдвигать нечего.
        */
        const slack = Math.max(0, room - (ringHigh - ringLow) / 2);
        const goal = middle + slack * 0.45;
        let off = Math.abs(goal) > 0.001
          ? (ringHigh + ringLow) / 2 - goal
          : (allHigh + allLow) / 2;
        /*
          Сдвиг ограничен так, чтобы доска не вышла за холст ни одним краем.
          Без этого желание поднять кольцо повыше уводило за верхний край
          дальний ряд: сама высота доски в кадр помещалась, а вот положение —
          уже нет.
        */
        const limit = [allHigh - 0.98, allLow + 0.98];
        if (limit[0] <= limit[1]) off = Math.min(limit[1], Math.max(limit[0], off));
        lift += off * distance * Math.tan(camera.fov * Math.PI / 360);
        /*
          Тот же приём вбок: доска съезжает к середине свободной ширины. Сдвиг
          ограничен краями холста, чтобы доска не уехала за них целиком.
        */
        let aside = (allEast + allWest) / 2 - centreX;
        const bounds = [allEast - 0.98, allWest + 0.98];
        if (bounds[0] <= bounds[1]) aside = Math.min(bounds[1], Math.max(bounds[0], aside));
        slide += aside * distance * Math.tan(camera.fov * Math.PI / 360) * camera.aspect;
        const factor = Math.max(
          wide / 0.98, (allHigh - allLow) / 2 / 0.98,
          ringWide / span, (ringHigh - ringLow) / 2 / room,
        );
        if (!(factor > 1e-4)) break;
        distance *= factor;
        if (Math.abs(factor - 1) < 0.002 && Math.abs(off) < 0.004 && Math.abs(aside) < 0.004) break;
      }
      // Отдаление пальцем поверх подобранного расстояния.
      aim.copy(TARGET).addScaledVector(UP, lift).addScaledVector(RIGHT, slide);
      camera.position.copy(aim).addScaledVector(DIR, distance * view.zoom);
      camera.lookAt(aim);
      camera.updateMatrixWorld(true);
      camera.updateProjectionMatrix();
    }

    /*
      Коробка холста меняет размер не только при повороте телефона: она меняет
      его сразу после создания сцены, когда холст показывают и коробке ставят
      отношение сторон. Замер «один раз в конце create» приходился на старую
      коробку — камера считала кадр квадратным, а рисовала в прямоугольник, и
      доска выходила сплюснутой. Наблюдатель снимает этот вопрос целиком.
    */
    const watcher = typeof ResizeObserver === 'function'
      ? new ResizeObserver(() => resize())
      : null;

    function resize() {
      const rect = canvas.parentElement.getBoundingClientRect();
      width = Math.max(1, Math.round(rect.width));
      height = Math.max(1, Math.round(rect.height));
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      /*
        Угол, с которого смотрит камера, зависит от того, как держат телефон, —
        значит, меняться он должен при повороте, а не один раз при запуске.
        Меняется он только у нетронутого вида: если игрок сам поставил доску
        под своим углом, поворот телефона его выбор не отменяет.
      */
      const want = homePitch();
      if (Math.abs(HOME.pitch - want) > 1e-6) {
        const kept = atHome();
        HOME.pitch = want;
        if (kept) view.pitch = want;
      }
      fit();
      touch();
    }

    // ————————————————————————————————————————————— куда смотрит камера

    /*
      Два способа смотреть. Обычный — вся доска в кадре, расстояние подбирает
      fit(). Второй — вплотную к одной клетке: им пользуется обучение, когда
      показывает, о чём говорит. Всё остальное — поворот, наклон, отдаление —
      общее для обоих.
    */
    function place() {
      // Четверть оборота, на которой сейчас стоит камера: по ней и
      // разворачиваются подписи, чтобы они смотрели на игрока.
      const quarter = Math.round(view.yaw / (Math.PI / 2));
      turnLabels(((-quarter % 4) + 4) % 4);
      // Вывески разворачиваются по той же четверти, но своим ходом: у них не
      // текстура едет по вершинам, а сами вершины переезжают на ближний край.
      const turn = ((quarter % 4) + 4) % 4;
      if (turn !== bannerQuarter) { bannerQuarter = turn; placeBanners(); }
      if (view.cell == null) { fit(); return; }
      axes();
      /*
        Клетка приближается, но не на весь экран: рядом с ней должно остаться
        поле, иначе по картинке не понять, где на доске это место. Замерено:
        при 6.4 в кадре одна клетка и край соседней, при 10 — угол доски
        целиком и видно, какой именно.
      */
      const at = cellPosition(view.cell);
      // Взгляд почти на саму клетку, чуть смещённый к середине доски: так она
      // стоит в кадре близко к центру, а рядом остаётся поле, по которому
      // видно, где на доске это место.
      aim.set(at.x * 0.82, 0.12, at.z * 0.82);
      camera.position.copy(aim).addScaledVector(DIR, 11 * view.zoom);
      camera.lookAt(aim);
      camera.updateMatrixWorld(true);
      camera.updateProjectionMatrix();
    }

    /** Снимок положения камеры для вида, в который ещё не перешли. */
    function stateFor(next) {
      const keep = { ...view };
      Object.assign(view, next);
      place();
      const shot = { pos: camera.position.clone(), look: aim.clone() };
      Object.assign(view, keep);
      place();
      return shot;
    }

    const fromPos = new THREE.Vector3();
    const fromLook = new THREE.Vector3();
    /*
      Номер перелёта. Перелёты обгоняют друг друга: обучение ушло к клетке, а
      игрок тут же нажал «Пропустить» — и возврат домой начался, не дождавшись
      конца. Без номера доигрывающий предыдущий перелёт в конце присваивал свой
      вид, и камера оставалась у клетки, хотя летела уже домой.
    */
    let flight = 0;

    /** Перелёт камеры: не рывком, а по дуге разгона и торможения. */
    function flyTo(next, life = 0.68) {
      const mine = flight + 1;
      flight = mine;
      const shot = stateFor(next);
      fromPos.copy(camera.position);
      fromLook.copy(aim);
      return animate(life, (t) => {
        if (mine !== flight) return true;
        const k = smooth(t);
        camera.position.lerpVectors(fromPos, shot.pos, k);
        aim.lerpVectors(fromLook, shot.look, k);
        camera.lookAt(aim);
        camera.updateMatrixWorld(true);
      }).then(() => {
        if (mine !== flight) return;
        Object.assign(view, next);
        place();
        report();
      });
    }

    const atHome = () => view.cell == null
      && Math.abs(shortest(view.yaw - HOME.yaw)) < 0.02
      && Math.abs(view.pitch - HOME.pitch) < 0.02
      && Math.abs(view.zoom - HOME.zoom) < 0.02;
    const report = () => { if (onViewChange) onViewChange(atHome()); };

    // ————————————————————————————————————————————— палец: поворот и отдаление

    /*
      Доска слушается пальца, как модель на столе: одним пальцем её поворачивают
      и наклоняют, двумя — отходят подальше и смотрят целиком. Границы жёсткие:
      снизу доска превращается в полоску, сверху — в чертёж, и ни то ни другое
      игре не нужно. Нажатие по клетке отличается от поворота порогом сдвига:
      палец, проехавший меньше восьми точек, считается нажатием.
    */
    canvas.style.touchAction = 'none';
    const pointers = new Map();
    let gesture = null;
    let startView = null;
    let startAt = null;
    let startGap = 0;
    let travel = 0;

    const spread = () => {
      const [a, b] = [...pointers.values()];
      return Math.hypot(a.x - b.x, a.y - b.y);
    };

    canvas.addEventListener('pointerdown', (event) => {
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      // Захват пальца — удобство, а не условие: на выдуманном указателе он
      // бросает исключение, и вся дальнейшая обработка жеста не случится.
      try { canvas.setPointerCapture(event.pointerId); } catch { /* и без него работает */ }
      startView = { ...view };
      if (pointers.size === 1) {
        gesture = 'turn';
        startAt = { x: event.clientX, y: event.clientY };
        travel = 0;
      } else if (pointers.size === 2) {
        gesture = 'zoom';
        startGap = spread() || 1;
      }
    });

    canvas.addEventListener('pointermove', (event) => {
      if (!pointers.has(event.pointerId)) return;
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (gesture === 'zoom' && pointers.size >= 2) {
        view.zoom = clamp(startView.zoom * startGap / (spread() || 1), LIMITS.zoom);
        place();
        touch();
        report();
        return;
      }
      if (gesture !== 'turn' || pointers.size !== 1) return;
      const dx = event.clientX - startAt.x;
      const dy = event.clientY - startAt.y;
      travel = Math.max(travel, Math.hypot(dx, dy));
      if (travel < 8) return;
      view.cell = null;
      view.yaw = startView.yaw - dx * 0.0055;
      view.pitch = clamp(startView.pitch + dy * 0.005, LIMITS.pitch);
      place();
      touch();
      report();
    });

    const ray = new THREE.Raycaster();
    const point = new THREE.Vector2();

    function release(event) {
      const wasTurn = gesture === 'turn' && pointers.size === 1;
      pointers.delete(event.pointerId);
      try { canvas.releasePointerCapture(event.pointerId); } catch { /* не захватывали */ }
      if (pointers.size === 0) gesture = null;
      else if (pointers.size === 1) { gesture = 'turn'; startView = { ...view }; startAt = null; travel = 99; }
      if (!wasTurn || travel >= 8 || event.type !== 'pointerup') return;
      const rect = canvas.getBoundingClientRect();
      point.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      point.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      ray.setFromCamera(point, camera);
      const hit = ray.intersectObjects(tiles, false)[0];
      if (hit) onCellTap(hit.object.userData.cell);
    }

    canvas.addEventListener('pointerup', release);
    canvas.addEventListener('pointercancel', release);

    /*
      Вернуть доску в исходный вид — кнопкой, а не угаданным жестом. Здесь
      двигаются сами углы, а не точка камеры: при перелёте по прямой возврат с
      обратной стороны прошёл бы сквозь доску, а поворот идёт кратчайшей
      дугой — как её и повернули бы рукой.
    */
    function home() {
      const mine = flight + 1;
      flight = mine;
      const from = { yaw: view.yaw, pitch: view.pitch, zoom: view.zoom };
      const to = {
        yaw: view.yaw - shortest(view.yaw - HOME.yaw),
        pitch: HOME.pitch,
        zoom: HOME.zoom,
      };
      view.cell = null;
      return animate(0.55, (t) => {
        if (mine !== flight) return true;
        const k = smooth(t);
        view.yaw = from.yaw + (to.yaw - from.yaw) * k;
        view.pitch = from.pitch + (to.pitch - from.pitch) * k;
        view.zoom = from.zoom + (to.zoom - from.zoom) * k;
        place();
      }).then(() => {
        if (mine !== flight) return;
        Object.assign(view, to, { cell: null });
        place();
        report();
      });
    }

    // ————————————————————————————————————————————— окружение

    /*
      Вокруг доски — та самая земля, за которую в игре и идёт речь: пальмы,
      камни, кусты, трава. Модели не рисуются здесь, а берутся готовыми: они
      уже лежат в репозитории, весят от пяти до шестидесяти килобайт и сделаны
      в той же низкополигональной манере. Каждая грузится один раз, а вокруг
      доски расставляются её копии — клон делит с прообразом и геометрию, и
      материалы.

      Расстановка не случайная от запуска к запуску: зерно постоянное, поэтому
      сцена у всех одна и та же, и проверка может на неё смотреть.
    */
    /*
      Что стоит вокруг доски. Боком доска занимает середину экрана, а по краям
      остаётся земля, и одного песка с редкими пальмами на неё мало — выходит
      пустыня. Поэтому вокруг доски стоит поселение: дома, шатры, стена, башня
      и колодец из того же набора, что и постройки на клетках, только крупнее —
      там они размером с фишку, здесь в человеческий рост и выше.

      Порядок в списке — это порядок вглубь: сперва то, что ближе к доске,
      потом дальнее. Дальнее и крупнее: башня видна из-за домов, а не наоборот.
    */
    const SCENERY = [
      { file: 'Grass.glb', count: 14, height: 0.34, spread: [6.3, 12.4] },
      { file: 'Bush_1.glb', count: 11, height: 0.62, spread: [6.6, 12.2] },
      { file: 'Rock_1.glb', count: 10, height: 0.5, spread: [6.5, 12.6] },
      { file: 'Plant_1.glb', count: 7, height: 0.45, spread: [6.4, 11.6] },
      { file: 'Plant_2.glb', count: 7, height: 0.42, spread: [6.4, 11.6] },
      { file: 'WoodLog.glb', count: 3, height: 0.36, spread: [6.8, 9.8] },
      { file: 'build-tent.glb', count: 3, height: 1.6, spread: [7.4, 9.4] },
      { file: 'build-well.glb', count: 2, height: 0.85, spread: [7.2, 9.0] },
      { file: 'build-house.glb', count: 4, height: 2.1, spread: [8.6, 11.4] },
      { file: 'build-wall.glb', count: 4, height: 2.2, spread: [9.4, 12.4] },
      { file: 'PalmTree_4.glb', count: 7, height: 2.6, spread: [7.6, 12.8] },
      { file: 'build-tower.glb', count: 2, height: 2.6, spread: [10.4, 12.8] },
    ];

    /*
      Зрители. Вокруг доски стоят люди — те же модели, что и фишки, только в
      свой рост, — и следят за игрой: поворачиваются к той фишке, чей сейчас
      ход. Мест ровно восемь, по два с каждой стороны доски, и расставлены они
      не случаем, а по кругу с постоянным шагом: сцена у всех одинаковая, и
      проверка может на неё смотреть.

      Поворачиваются они не сами по себе. Кадр здесь рисуется по событию, и
      зритель, который качается вечно, не давал бы сцене уснуть: телефон грелся
      бы в кармане ради того, что никто не смотрит. Поэтому зрители двигаются
      только вместе с ходом — когда сцена и так рисует, — и замирают вместе с
      ним.
    */
    const WATCHERS = 8;
    const WATCH_RING = 6.6;
    const watchers = [];
    let watchAt = null;

    function seatWatchers(model, index) {
      const box = new THREE.Box3().setFromObject(model);
      const size = box.getSize(new THREE.Vector3());
      const tall = size.y > 0.001 ? 1.05 / size.y : 1;
      const copy = model.clone(true);
      copy.scale.setScalar(tall);
      // По кругу с постоянным шагом, но каждый чуть дальше или ближе своего
      // места: ровный строй вокруг доски смотрелся бы оцеплением.
      const angle = (index / WATCHERS) * FULL + 0.39;
      const radius = WATCH_RING + ((index % 3) - 1) * 0.42;
      const spot = pushOut(Math.cos(angle) * radius, Math.sin(angle) * radius);
      copy.position.set(spot.x, -0.52 - box.min.y * tall, spot.z);
      copy.userData.home = copy.position.clone();
      copy.rotation.y = Math.atan2(-copy.position.x, -copy.position.z);
      scene.add(copy);
      watchers[index] = copy;
    }

    /*
      Повернуться к клетке. Зовётся оттуда, где ход и так двигает сцену: с
      броском, с шагом фишки, со сменой хода. Поворот берётся кратчайший — иначе
      зритель, которому надо на десять градусов вправо, едет через всю спину, —
      а к нему добавлено лёгкое покачивание: ровно поворачивающаяся фигура
      выглядит дверью, а не человеком.
    */
    function watch(cell) {
      if (cell == null || !watchers.length) return null;
      if (watchAt === cell) return null;
      watchAt = cell;
      const at = cellPosition(cell);
      const turns = watchers.map((one) => {
        if (!one) return null;
        const want = Math.atan2(at.x - one.position.x, at.z - one.position.z);
        return { one, from: one.rotation.y, delta: shortest(want - one.rotation.y) };
      }).filter(Boolean);
      if (!turns.length) return null;
      return animate(0.9, (t) => {
        const k = smooth(t);
        const sway = Math.sin(t * Math.PI) * 0.035;
        for (let i = 0; i < turns.length; i += 1) {
          const turn = turns[i];
          turn.one.rotation.y = turn.from + turn.delta * k;
          turn.one.position.y = turn.one.userData.home.y + sway * (i % 2 ? 1 : -1);
        }
      });
    }

    let scatterSeed = 987654321;
    const nextRandom = () => {
      scatterSeed = (scatterSeed * 1664525 + 1013904223) >>> 0;
      return scatterSeed / 4294967296;
    };

    /*
      Доска квадратная, а разброс круговой, и на углах круг заходит внутрь
      квадрата: пальма вырастает на клетке «Навет», а дом накрывает угол поля.
      Поэтому место проверяется по квадрату — насколько оно отстоит от
      середины по дальней из двух осей, — и слишком близкое отодвигается
      наружу по тому же лучу.
    */
    const BOARD_EDGE = 6.1;
    function pushOut(x, z) {
      const far = Math.max(Math.abs(x), Math.abs(z));
      if (far >= BOARD_EDGE) return { x, z };
      const push = BOARD_EDGE / (far || 0.001);
      return { x: x * push, z: z * push };
    }

    function scatter(model, { count, height, spread }) {
      const box = new THREE.Box3().setFromObject(model);
      const size = box.getSize(new THREE.Vector3());
      /*
        Размер берётся по самой длинной стороне, а не по высоте. Колодец — это
        низкое широкое кольцо: подогнав его по высоте, получаешь кольцо в
        полтора шага шириной, из которого впору пить верблюду.
      */
      const longest = Math.max(size.x, size.y, size.z);
      const scale = longest > 0.001 ? height / longest : 1;
      for (let i = 0; i < count; i += 1) {
        const copy = model.clone(true);
        const angle = nextRandom() * Math.PI * 2;
        const radius = spread[0] + nextRandom() * (spread[1] - spread[0]);
        const vary = scale * (0.82 + nextRandom() * 0.42);
        copy.scale.setScalar(vary);
        copy.rotation.y = nextRandom() * Math.PI * 2;
        const spot = pushOut(Math.cos(angle) * radius, Math.sin(angle) * radius);
        copy.position.set(spot.x, -0.52 - box.min.y * vary, spot.z);
        scene.add(copy);
      }
    }

    if (modelsAt && THREE.GLTFLoader) {
      const gltf = new THREE.GLTFLoader();
      for (let index = 0; index < PEOPLE.length; index += 1) {
        const kind = PEOPLE[index];
        gltf.load(`${modelsAt}token-${kind}.glb`, (loaded) => {
          const model = loaded.scene;
          model.traverse((node) => {
            if (node.isMesh && node.material) node.material.roughness = 1;
          });
          people.set(index, model);
          standUp(index, model);
          /*
            Тот же человек садится и в зрители. Мест восемь, а моделей шесть:
            двое повторяются — на толпе вокруг доски это не читается, а два
            лишних файла ради двух лишних лиц читались бы на счётчике.
          */
          seatWatchers(model, index);
          if (index < WATCHERS - PEOPLE.length) seatWatchers(model, PEOPLE.length + index);
          touch();
        }, undefined, () => { /* нет модели — на подставке остаётся предмет */ });
      }
      for (const kind of BUILD_KINDS) {
        gltf.load(`${modelsAt}build-${kind}.glb`, (loaded) => {
          const model = loaded.scene;
          /*
            Модель уже вписана в клетку сборщиком: середина в нуле, низ на
            нуле, высота задана. Здесь остаётся только унять блеск — сцена
            освещена мягко, и глянцевая стена под таким светом выглядит
            мокрой.
          */
          model.traverse((node) => {
            if (!node.isMesh) return;
            node.castShadow = false;
            node.receiveShadow = false;
            if (node.material) node.material.roughness = 1;
          });
          prototypes.set(kind, model);
          carved.add(kind);
          restock(kind);
        }, undefined, () => { /* нет модели — остаётся фигурка из примитивов */ });
      }
      for (const item of SCENERY) {
        gltf.load(`${modelsAt}${item.file}`, (loaded) => {
          scatter(loaded.scene, item);
          touch();
        }, undefined, () => { /* нет модели — сцена живёт без неё */ });
      }
    }

    // ————————————————————————————————————————————— показ состояния

    let colorOfPlayer = () => '#4f46e5';

    function ensureTokens(state) {
      while (tokens.length < state.players.length) {
        const index = tokens.length;
        const figure = Figures.token(TOKEN_KINDS[index % TOKEN_KINDS.length],
          colorOfPlayer(state.players[index]));
        figure.visible = false;
        scene.add(figure);
        tokens.push(figure);
        const disc = shade(0.2, 0.22);
        disc.visible = false;
        scene.add(disc);
        shadows.push(disc);
        const plate = new THREE.Sprite(new THREE.SpriteMaterial({
          map: new THREE.CanvasTexture(nameCanvas('…', '#4f46e5')),
          depthTest: false,
          transparent: true,
        }));
        plate.scale.set(1.28, 0.48, 1);
        plate.renderOrder = 4;
        plate.visible = false;
        scene.add(plate);
        plates.push(plate);
        if (people.has(index)) standUp(index, people.get(index));
      }
    }

    /*
      Как игрок подписан на доске. За одним человеком у стола имя не нужно —
      нужно «Вы»: своё место ищут не по имени. Их двое и больше — у каждого
      своё имя, иначе «Вы» будет висеть над чужой фишкой. Это же имя стоит и
      на вывесках уделов: одна подпись на человека, а не две разные.
    */
    function nameOf(state, player) {
      const alone = state.players.filter((one) => !one.isBot).length === 1;
      return alone && !player.isBot ? 'Вы' : player.name;
    }

    /*
      Поставить человека на подставку вместо предмета. Модель приходит уже
      вписанной в клетку и стоящей подошвой на нуле, поэтому ей остаётся
      подняться на толщину подставки. Прежний предмет снимается, подставка
      остаётся: она и красит фишку в цвет игрока.
    */
    function standUp(index, model) {
      const figure = tokens[index];
      if (!figure) return;
      const old = figure.userData.piece;
      if (old) figure.remove(old);
      const piece = model.clone(true);
      piece.position.y = 0.05;
      figure.add(piece);
      figure.userData.piece = piece;
    }

    /** Подписать фишки: «Вы» своей, имена — чужим. */
    function nameTokens(state) {
      state.players.forEach((player, index) => {
        const plate = plates[index];
        if (!plate) return;
        const text = nameOf(state, player);
        const color = colorOfPlayer(player);
        if (plate.userData.text === text && plate.userData.color === color) return;
        plate.userData.text = text;
        plate.userData.color = color;
        if (plate.material.map) plate.material.map.dispose();
        plate.material.map = new THREE.CanvasTexture(nameCanvas(text, color));
        plate.material.map.encoding = THREE.sRGBEncoding;
        plate.material.needsUpdate = true;
      });
    }

    /** Куда встаёт фишка игрока: по кругу вокруг середины клетки. */
    function tokenSpot(cell, index, count) {
      const at = cellPosition(cell);
      if (count <= 1) return { x: at.x, z: at.z };
      const angle = (index / count) * Math.PI * 2;
      return { x: at.x + Math.cos(angle) * 0.21, z: at.z + Math.sin(angle) * 0.21 };
    }

    function placeTokens(state) {
      const perCell = new Map();
      state.players.forEach((player) => {
        perCell.set(player.pos, (perCell.get(player.pos) || 0) + 1);
      });
      const seen = new Map();
      state.players.forEach((player, index) => {
        const figure = tokens[index];
        if (!figure) return;
        const count = perCell.get(player.pos) || 1;
        const order = seen.get(player.pos) || 0;
        seen.set(player.pos, order + 1);
        const spot = tokenSpot(player.pos, order, count);
        figure.position.set(spot.x, TILE_H, spot.z);
        figure.visible = true;
        shadows[index].position.set(spot.x, TILE_H + 0.006, spot.z);
        shadows[index].visible = true;
        /*
          Таблички соседей по клетке встают лесенкой: иначе они наползают друг
          на друга и не читается ни одна. Первый по очереди — выше всех: своя
          фишка должна находиться первой, а она у человека обычно первая.
        */
        plates[index].position.set(spot.x,
          TILE_H + 1.02 + (count - 1 - order) * 0.34, spot.z);
        plates[index].visible = true;
      });
    }

    function sync(state, colorFn) {
      if (colorFn) colorOfPlayer = colorFn;
      ensureTokens(state);
      nameTokens(state);
      state.players.forEach((player, index) => {
        const base = tokens[index] && tokens[index].userData.base;
        if (base) base.material.color.set(colorOfPlayer(player));
      });

      bannerPeople(state);
      let bannersMoved = false;
      state.cells.forEach((cell, n) => {
        const ownerId = cell.heldFrom || cell.owner;
        const owner = ownerId && state.players.find((p) => p.id === ownerId);
        owners[n].visible = Boolean(owner);
        if (owner) owners[n].material.color.set(colorOfPlayer(owner));
        // Вывеска висит над тем, у чего есть хозяин: заложенный удел
        // подписывается кредитором — он сейчас и получает с него плату.
        if (bannerFace(n, owner ? state.players.indexOf(owner) : -1)) bannersMoved = true;

        const holder = builds[n];
        const kind = cell.altar ? 'altar'
          : (cell.level > 0 ? BUILD_KINDS[Math.min(cell.level, BUILD_KINDS.length) - 1] : null);
        holder.visible = Boolean(kind);
        if (kind === holder.userData.kind) return;
        // Ступень сменилась: старая фигурка снимается, новая ставится. Тень
        // под ней остаётся — она первый ребёнок держателя.
        for (let i = holder.children.length - 1; i >= 1; i -= 1) holder.remove(holder.children[i]);
        holder.userData.kind = kind;
        if (!kind) return;
        const piece = buildingOf(kind);
        holder.add(piece);
        /*
          Постройка не возникает из ничего, а вырастает — с коротким перелётом
          через единицу, как встаёт поставленная на стол фигурка. Это единственная
          анимация, которая заводится сама: всё остальное на доске двигает ход.
        */
        piece.scale.setScalar(0.01);
        animate(0.42, (t) => {
          const k = t < 0.72 ? smooth(t / 0.72) * 1.12 : 1.12 - smooth((t - 0.72) / 0.28) * 0.12;
          piece.scale.setScalar(Math.max(0.01, k));
        });
      });

      if (bannersMoved) placeBanners();
      placeTokens(state);
      // Зрители смотрят на того, чей ход. Поворот случается только при смене
      // клетки — сам по себе sync() их не трогает.
      const turn = state.players[state.turn];
      if (turn) watch(turn.pos);
      touch();
    }

    /*
      Фишка идёт по клеткам, а не переносится: ход должно быть видно. Весь путь
      — одно движение с общим разгоном и торможением, а прыжок считается от
      дробной части пути. Раньше каждая клетка была отдельной анимацией в
      цепочке обещаний, и на стыках движение спотыкалось.
    */
    function walk(state, index, from, steps) {
      const figure = tokens[index];
      if (!figure || steps <= 0) { sync(state); return Promise.resolve(); }
      const path = [from];
      for (let i = 1; i <= steps; i += 1) path.push((from + i) % B.BOARD.length);
      const life = Math.min(1.9, 0.26 + steps * 0.135);
      const spots = path.map((cell) => cellPosition(cell));
      // Зрители провожают фишку взглядом: поворот идёт вместе с ходом, а не
      // после него, иначе они оборачиваются к уже остановившейся фишке.
      watch(path[path.length - 1]);
      return animate(life, (t) => {
        const along = smooth(t) * steps;
        const leg = Math.min(steps - 1, Math.floor(along));
        const part = along - leg;
        const a = spots[leg];
        const b = spots[leg + 1];
        figure.position.x = a.x + (b.x - a.x) * part;
        figure.position.z = a.z + (b.z - a.z) * part;
        figure.position.y = TILE_H + Math.sin(Math.PI * part) * 0.3;
        // Фишка чуть кренится в сторону движения — как если бы её несли.
        figure.rotation.z = (b.x - a.x) * Math.sin(Math.PI * part) * 0.18;
        figure.rotation.x = -(b.z - a.z) * Math.sin(Math.PI * part) * 0.18;
        shadows[index].position.set(figure.position.x, TILE_H + 0.006, figure.position.z);
        shadows[index].material.opacity = 0.22 - Math.sin(Math.PI * part) * 0.1;
        plates[index].position.set(figure.position.x, figure.position.y + 0.78, figure.position.z);
      }).then(() => {
        figure.rotation.set(0, 0, 0);
        shadows[index].material.opacity = 0.22;
        sync(state);
      });
    }

    /** Бросок: кости кувыркаются, падают и приходят в себя выпавшими вверх. */
    function roll(a, b) {
      const targets = [a, b];
      const spin = dice.map(() => ({
        x: Math.PI * (2 + Math.floor(Math.random() * 3)),
        z: Math.PI * (2 + Math.floor(Math.random() * 3)),
        delay: Math.random() * 0.12,
      }));
      dice.forEach((mesh) => { mesh.visible = true; });
      return animate(0.86, (t) => {
        dice.forEach((mesh, i) => {
          const own = Math.min(1, Math.max(0, (t - spin[i].delay) / (1 - spin[i].delay)));
          const ease = 1 - Math.pow(1 - own, 4);
          const end = FACE_UP[targets[i]] || FACE_UP[1];
          mesh.rotation.x = spin[i].x * (1 - ease) + end[0];
          mesh.rotation.y = end[1];
          mesh.rotation.z = spin[i].z * (1 - ease) + end[2];
          // Взлёт и падение с коротким отскоком у самой доски.
          const hop = Math.sin(Math.PI * own) * 1.15;
          const bounce = own > 0.86 ? Math.sin((own - 0.86) / 0.14 * Math.PI) * 0.12 : 0;
          mesh.position.y = 0.34 + hop + bounce;
        });
      });
    }

    // ————————————————————————————————————————————— подсказка на доске

    let pulse = null;

    /** Кольцо на клетке: обучение показывает им, о чём сейчас речь. */
    function highlight(cell, color) {
      if (pulse) { pulse.stop = true; pulse = null; }
      if (cell == null) { ring.visible = false; touch(); return; }
      const at = cellPosition(cell);
      ring.position.set(at.x, TILE_H + 0.012, at.z);
      if (color) ringMat.color.set(color);
      ring.visible = true;
      const mine = { stop: false };
      pulse = mine;
      const beat = () => {
        if (mine.stop) return;
        animate(1.1, (t) => {
          const wave = Math.sin(t * Math.PI);
          ring.scale.setScalar(1 + wave * 0.16);
          ringMat.opacity = 0.45 + wave * 0.45;
        }).then(() => { if (!mine.stop) beat(); });
      };
      beat();
    }

    /*
      Показательные движения — ими пользуется обучение. Состояние партии они не
      трогают: фишка идёт, постройка встаёт, доска поворачивается, а следующий
      же sync() возвращает всё как есть. Поэтому здесь нет ни правил, ни
      проверок — только движение.
    */
    function demoWalk(index, from, steps) {
      const figure = tokens[index];
      if (!figure || steps <= 0) return Promise.resolve();
      const path = [from];
      for (let i = 1; i <= steps; i += 1) path.push((from + i) % B.BOARD.length);
      const spots = path.map((cell) => cellPosition(cell));
      return animate(0.3 + steps * 0.17, (t) => {
        const along = smooth(t) * steps;
        const leg = Math.min(steps - 1, Math.floor(along));
        const part = along - leg;
        const a = spots[leg];
        const b = spots[leg + 1];
        figure.position.x = a.x + (b.x - a.x) * part;
        figure.position.z = a.z + (b.z - a.z) * part;
        figure.position.y = TILE_H + Math.sin(Math.PI * part) * 0.3;
        shadows[index].position.set(figure.position.x, TILE_H + 0.006, figure.position.z);
        plates[index].position.set(figure.position.x, figure.position.y + 0.78, figure.position.z);
      });
    }

    function demoBuild(n, kind) {
      const holder = builds[n];
      if (!holder) return Promise.resolve();
      for (let i = holder.children.length - 1; i >= 1; i -= 1) holder.remove(holder.children[i]);
      holder.userData.kind = kind;
      holder.visible = true;
      const piece = buildingOf(kind);
      holder.add(piece);
      piece.scale.setScalar(0.01);
      return animate(0.5, (t) => {
        const k = t < 0.72 ? smooth(t / 0.72) * 1.12 : 1.12 - smooth((t - 0.72) / 0.28) * 0.12;
        piece.scale.setScalar(Math.max(0.01, k));
      });
    }

    /** Пять ступеней подряд на одной клетке: колодец, шатёр, дом, ограда, башня. */
    function demoLadder(n) {
      let chain = Promise.resolve();
      BUILD_KINDS.forEach((kind, i) => {
        chain = chain.then(() => new Promise((resolve) => {
          setTimeout(resolve, i === 0 ? 0 : 520);
        })).then(() => demoBuild(n, kind));
      });
      return chain;
    }

    /*
      Полный оборот вокруг доски: показать, что она стоит на земле кругом. Как
      и всякий перелёт, он уступает следующему: нажали «Пропустить» посреди
      оборота — камера идёт домой, а оборот замолкает, не досказав своё.
    */
    function orbit(life = 2.6) {
      const mine = flight + 1;
      flight = mine;
      const from = view.yaw;
      view.cell = null;
      return animate(life, (t) => {
        if (mine !== flight) return true;
        view.yaw = from + FULL * smooth(t);
        place();
      }).then(() => {
        if (mine !== flight) return;
        view.yaw = from;
        place();
        report();
      });
    }

    /*
      Где клетка на экране.

      Нужно это карточке: она взлетает с той самой плитки, на которую встала
      фишка, а не появляется ниоткуда. Плитка живёт в сцене, карточка — в
      разметке поверх холста, и перевести одну в другую умеет только камера.

      Считается по верхней грани плитки, а не по её середине: карточка
      «отрывается» от поверхности доски, и полточки толщины тут видны.
      Ответ — в точках разметки от левого верхнего угла холста; клетка за
      спиной камеры (такое бывает при сильном приближении) отвечает null,
      и тогда карточка просто появляется без полёта.
    */
    function screenOf(cell) {
      const at = cellPosition(cell);
      const point = new THREE.Vector3(at.x, TILE_H, at.z).project(camera);
      if (point.z > 1) return null;
      return {
        x: (point.x + 1) / 2 * width,
        y: (1 - point.y) / 2 * height,
        width,
        height,
      };
    }

    function focus(cell, life) {
      // Угол обзора сохраняется: если доску повернули, обучение показывает
      // клетку с той же стороны, с которой на неё и смотрят.
      return flyTo({ yaw: view.yaw, pitch: 1.02, zoom: 1, cell }, life == null ? 0.72 : life);
    }

    function dispose() {
      if (pulse) pulse.stop = true;
      if (watcher) watcher.disconnect();
      running = false;
      jobs.length = 0;
      bannerGeo.dispose();
      bannerTex.dispose();
      renderer.dispose();
    }

    resize();
    if (watcher) watcher.observe(canvas.parentElement);
    report();
    /*
      Счётчик для проверки: сколько сцена стоит одному кадру. Вызовы отрисовки
      — та величина, которой телефон и меряет цену картинки, и держать её в
      узде стоит счётом, а не обещанием.
    */
    /*
      Сколько кадров сцена нарисовала за свою жизнь. Спрашивается отдельно от
      stats(), и не зря: stats() рисует кадр сам — иначе ему нечего сказать о
      вызовах отрисовки, счётчик обнуляется на каждом кадре. Спрашивать им же
      покой означало бы мерить собственный вопрос.
    */
    function frames() {
      return renderer.info.render.frame;
    }

    function stats() {
      renderer.render(scene, camera);
      return {
        calls: renderer.info.render.calls,
        triangles: renderer.info.render.triangles,
        objects: scene.children.length,
        frames: renderer.info.render.frame,
        icons: iconsDrawn,
        labels: plates.map((plate) => plate.userData.text || ''),
        /*
          Вывески: чей удел и где. Проверке этого довольно, чтобы спросить, что
          над занятым уделом висит имя хозяина, а над свободным не висит ничего.
        */
        // Какие ступени уже стоят настоящей моделью, а не фигуркой из примитивов.
        carved: [...carved],
        // Сколько фишек стоят человеком, а не предметом.
        people: people.size,
        // Сколько зрителей стоит вокруг доски и куда они смотрят.
        watchers: watchers.filter(Boolean).length,
        watchAt,
        banners: [...bannerSlot],
        bannerNames: bannerNames.split('/').map((face) => face.split('|')[0]),
        bannerTurn: bannerQuarter,
        coins: coinsDrawn,
        labelTurn,
        yaw: view.yaw,
        // Приближение: множитель к расстоянию, которое подобрал fit().
        zoom: view.zoom,
      };
    }

    return {
      sync, walk, roll, resize, dispose, highlight, focus, home, screenOf,
      dealCard, returnCard, demoWalk, demoBuild, demoLadder, orbit, setSpeed,
      atHome, stats, frames, render: touch,
    };
  }

  return { supported, create };
})();
