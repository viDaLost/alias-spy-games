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

      const top = ATLAS_CELL * (spec.price ? 0.5 : 0.62);
      lines.forEach((line, i) => {
        ctx.fillText(line, ATLAS_CELL / 2, top + (i - (lines.length - 1) / 2) * (font + 6));
      });

      if (spec.price) {
        ctx.font = '600 38px system-ui, sans-serif';
        ctx.fillStyle = theme.muted;
        ctx.fillText(String(spec.price), ATLAS_CELL / 2, ATLAS_CELL * 0.84);
      }
      ctx.restore();
    });

    return canvas;
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

  function create({ canvas, sceneArt, modelsAt, onCellTap, onViewChange, frameOf, theme }) {
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
    const LIMITS = {
      yaw: [-0.85, 0.85], pitch: [0.46, 1.38], zoom: [0.82, 1.9],
    };
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
        touch();
      });
    }

    // ——— плитки с подписями ———
    const atlas = new THREE.CanvasTexture(buildLabelAtlas(theme));
    atlas.encoding = THREE.sRGBEncoding;
    atlas.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
    const topMat = new THREE.MeshLambertMaterial({ map: atlas });

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
      const corners = [[0, 1], [1, 1], [0, 0], [1, 0]];
      for (let i = 0; i < 4; i += 1) {
        uv.setXY(8 + i, (col + corners[i][0]) * stepX, 1 - (row + 1 - corners[i][1]) * stepY);
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
      Прообразы построек. Каждая собирается один раз, а на клетки ставятся её
      копии: клон в three.js делит с прообразом и геометрию, и материалы, так
      что шестнадцать башен стоят ровно одной башни.
    */
    const prototypes = new Map();
    function buildingOf(kind) {
      if (!prototypes.has(kind)) prototypes.set(kind, Figures.building(kind));
      return prototypes.get(kind).clone(true);
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
      holder.position.set(at.x, TILE_H, at.z);
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

    function animate(life, step) {
      return new Promise((resolve) => {
        jobs.push({ time: 0, life, step, finish: () => { step(1); resolve(); } });
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

      let distance = 20;
      let lift = 0;
      for (let pass = 0; pass < 10; pass += 1) {
        aim.copy(TARGET).addScaledVector(UP, lift);
        camera.position.copy(aim).addScaledVector(DIR, distance);
        camera.lookAt(aim);
        camera.updateMatrixWorld(true);
        camera.updateProjectionMatrix();
        let allLow = Infinity; let allHigh = -Infinity; let wide = 0;
        for (const corner of boxCorners) {
          probe.copy(corner).project(camera);
          allLow = Math.min(allLow, probe.y);
          allHigh = Math.max(allHigh, probe.y);
          wide = Math.max(wide, Math.abs(probe.x));
        }
        let ringLow = Infinity; let ringHigh = -Infinity; let ringWide = 0;
        for (const corner of tileCorners) {
          probe.copy(corner).project(camera);
          ringLow = Math.min(ringLow, probe.y);
          ringHigh = Math.max(ringHigh, probe.y);
          ringWide = Math.max(ringWide, Math.abs(probe.x));
        }
        /*
          Кадр ставится так, чтобы кольцо клеток встало по середине свободной
          части, а вся доска — по середине холста. Между двумя этими желаниями
          выбирается то, что сильнее жмёт: доска не вылезет, клетки не уйдут
          под кнопки.
        */
        let off = Math.abs(middle) > 0.001
          ? (ringHigh + ringLow) / 2 - middle
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
        const factor = Math.max(
          wide / 0.98, (allHigh - allLow) / 2 / 0.98,
          ringWide / 0.98, (ringHigh - ringLow) / 2 / room,
        );
        if (!(factor > 1e-4)) break;
        distance *= factor;
        if (Math.abs(factor - 1) < 0.002 && Math.abs(off) < 0.004) break;
      }
      // Отдаление пальцем поверх подобранного расстояния.
      aim.copy(TARGET).addScaledVector(UP, lift);
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

    /** Перелёт камеры: не рывком, а по дуге разгона и торможения. */
    function flyTo(next, life = 0.68) {
      const shot = stateFor(next);
      fromPos.copy(camera.position);
      fromLook.copy(aim);
      return animate(life, (t) => {
        const k = smooth(t);
        camera.position.lerpVectors(fromPos, shot.pos, k);
        aim.lerpVectors(fromLook, shot.look, k);
        camera.lookAt(aim);
        camera.updateMatrixWorld(true);
      }).then(() => {
        Object.assign(view, next);
        place();
        report();
      });
    }

    const atHome = () => view.cell == null
      && Math.abs(view.yaw - HOME.yaw) < 0.02
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
      view.yaw = clamp(startView.yaw - dx * 0.0055, LIMITS.yaw);
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

    /** Вернуть доску в исходный вид — кнопкой, а не угаданным жестом. */
    function home() {
      return flyTo({ ...HOME, cell: null }, 0.5);
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
    const SCENERY = [
      { file: 'PalmTree_4.glb', count: 5, height: 2.6, spread: [7.6, 10.4] },
      { file: 'Bush_1.glb', count: 9, height: 0.62, spread: [6.6, 10.8] },
      { file: 'Rock_1.glb', count: 8, height: 0.5, spread: [6.5, 11.2] },
      { file: 'Grass.glb', count: 11, height: 0.34, spread: [6.3, 11.4] },
      { file: 'Plant_1.glb', count: 5, height: 0.45, spread: [6.4, 10.6] },
      { file: 'Plant_2.glb', count: 5, height: 0.42, spread: [6.4, 10.6] },
      { file: 'WoodLog.glb', count: 3, height: 0.36, spread: [6.8, 9.8] },
    ];

    let scatterSeed = 987654321;
    const nextRandom = () => {
      scatterSeed = (scatterSeed * 1664525 + 1013904223) >>> 0;
      return scatterSeed / 4294967296;
    };

    function scatter(model, { count, height, spread }) {
      const box = new THREE.Box3().setFromObject(model);
      const size = box.getSize(new THREE.Vector3());
      const scale = size.y > 0.001 ? height / size.y : 1;
      for (let i = 0; i < count; i += 1) {
        const copy = model.clone(true);
        const angle = nextRandom() * Math.PI * 2;
        const radius = spread[0] + nextRandom() * (spread[1] - spread[0]);
        const vary = scale * (0.82 + nextRandom() * 0.42);
        copy.scale.setScalar(vary);
        copy.rotation.y = nextRandom() * Math.PI * 2;
        copy.position.set(
          Math.cos(angle) * radius,
          -0.52 - box.min.y * vary,
          Math.sin(angle) * radius,
        );
        scene.add(copy);
      }
    }

    if (modelsAt && THREE.GLTFLoader) {
      const gltf = new THREE.GLTFLoader();
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
      }
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
      });
    }

    function sync(state, colorFn) {
      if (colorFn) colorOfPlayer = colorFn;
      ensureTokens(state);
      state.players.forEach((player, index) => {
        const base = tokens[index] && tokens[index].userData.base;
        if (base) base.material.color.set(colorOfPlayer(player));
      });

      state.cells.forEach((cell, n) => {
        const ownerId = cell.heldFrom || cell.owner;
        const owner = ownerId && state.players.find((p) => p.id === ownerId);
        owners[n].visible = Boolean(owner);
        if (owner) owners[n].material.color.set(colorOfPlayer(owner));

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

      placeTokens(state);
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

    function focus(cell, life) {
      return flyTo({ yaw: HOME.yaw, pitch: 1.02, zoom: 1, cell }, life == null ? 0.72 : life);
    }

    function dispose() {
      if (pulse) pulse.stop = true;
      if (watcher) watcher.disconnect();
      running = false;
      jobs.length = 0;
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
    function stats() {
      renderer.render(scene, camera);
      return {
        calls: renderer.info.render.calls,
        triangles: renderer.info.render.triangles,
        objects: scene.children.length,
        frames: renderer.info.render.frame,
      };
    }

    return {
      sync, walk, roll, resize, dispose, highlight, focus, home,
      atHome, stats, render: touch,
    };
  }

  return { supported, create };
})();
