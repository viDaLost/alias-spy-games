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
    canvas.height = ATLAS_COLS * ATLAS_CELL;
    const ctx = canvas.getContext('2d');

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

  function create({ canvas, art, sceneArt, onCellTap, theme }) {
    const THREE = window.THREE;
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputEncoding = THREE.sRGBEncoding;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(34, 1, 0.5, 80);
    // Камера смотрит на доску с одного и того же угла, а расстояние подбирается
    // под экран: см. fit(). Иначе на узком телефоне доска вылезает за края.
    const TARGET = new THREE.Vector3(0, 0, 0.35);
    const ELEVATION = 0.9425;   // 54° — доска ещё объёмная, но дальний ряд читается
    const DIR = new THREE.Vector3(0, Math.sin(ELEVATION), Math.cos(ELEVATION));
    camera.position.copy(TARGET).addScaledVector(DIR, 20);
    camera.lookAt(TARGET);

    scene.add(new THREE.HemisphereLight(0xffffff, theme.ground, 0.95));
    const sun = new THREE.DirectionalLight(0xffffff, 0.55);
    sun.position.set(4, 9, 6);
    scene.add(sun);

    // ——— доска ———
    const boardMat = new THREE.MeshLambertMaterial({ color: theme.board });
    const board = new THREE.Mesh(new THREE.BoxGeometry(SIZE + 0.5, 0.45, SIZE + 0.5), boardMat);
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
        dirty = true;
        render();
      });
    }

    // ——— плитки с подписями ———
    const atlas = new THREE.CanvasTexture(buildLabelAtlas(theme));
    atlas.encoding = THREE.sRGBEncoding;
    atlas.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
    const topMat = new THREE.MeshLambertMaterial({ map: atlas });
    const sideMat = new THREE.MeshLambertMaterial({ color: theme.tileSide });

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
      const step = 1 / ATLAS_COLS;
      const corners = [[0, 1], [1, 1], [0, 0], [1, 0]];
      for (let i = 0; i < 4; i += 1) {
        uv.setXY(8 + i, (col + corners[i][0]) * step, 1 - (row + 1 - corners[i][1]) * step);
      }
      uv.needsUpdate = true;

      const tile = new THREE.Mesh(geometry, [sideMat, sideMat, topMat, sideMat, sideMat, sideMat]);
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

    // ——— картинки: строения и фишки стоят щитками к игроку ———
    const loader = new THREE.TextureLoader();
    const textureCache = new Map();
    const billboardTexture = (src) => {
      if (!textureCache.has(src)) {
        const texture = loader.load(src, () => { dirty = true; render(); });
        texture.encoding = THREE.sRGBEncoding;
        textureCache.set(src, texture);
      }
      return textureCache.get(src);
    };

    const billboard = (src, size) => {
      const mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(size, size),
        new THREE.MeshBasicMaterial({ map: billboardTexture(src), transparent: true, depthWrite: false }),
      );
      mesh.visible = false;
      scene.add(mesh);
      return mesh;
    };

    const BUILD_ART = ['build-well', 'build-tent', 'build-house', 'build-wall', 'build-tower'];
    const builds = B.BOARD.map(() => billboard(art('build', 'build-well'), 0.62));
    const tokens = [];
    const shadows = [];

    // ——— кости ———
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

    /*
      Доска целиком должна помещаться в кадр — и на узком телефоне, и на
      альбомном экране. Перспектива нелинейна по расстоянию, поэтому вместо
      формулы здесь несколько итераций: поставили камеру, спроецировали восемь
      углов габаритной коробки, отодвинулись ровно на столько, на сколько они
      вылезли. Три-четыре шага хватает, а зовётся это только при resize.
    */
    /*
      Что обязано влезть в кадр. Доска — плоская коробка во всю ширину, а всё
      высокое (строения и фишки) стоит только на клетках периметра, ближе к
      середине. Считать их по углам доски значило бы резервировать высоту там,
      где ничего не стоит, и доска от этого мельчала бы на ровном месте.
    */
    const HALF = (SIZE + 0.5) / 2 + 0.15;
    const RIM = (SIZE - 1) / 2 + 0.1;
    const boxCorners = [];
    for (const x of [-HALF, HALF]) {
      for (const y of [-0.45, 0.2]) {
        for (const z of [-HALF, HALF]) boxCorners.push(new THREE.Vector3(x, y, z));
      }
    }
    for (const x of [-RIM, RIM]) {
      for (const z of [-RIM, RIM]) boxCorners.push(new THREE.Vector3(x, 0.85, z));
    }
    const probe = new THREE.Vector3();

    // Экранный «вверх» камеры в мире: сдвиг по нему двигает картинку, не меняя
    // угла, под которым мы смотрим на доску.
    const UP = new THREE.Vector3(0, Math.cos(ELEVATION), -Math.sin(ELEVATION));
    const aim = new THREE.Vector3();

    function fit() {
      let distance = 20;
      let lift = 0;
      for (let pass = 0; pass < 8; pass += 1) {
        aim.copy(TARGET).addScaledVector(UP, lift);
        camera.position.copy(aim).addScaledVector(DIR, distance);
        camera.lookAt(aim);
        camera.updateMatrixWorld(true);
        camera.updateProjectionMatrix();
        let minY = Infinity; let maxY = -Infinity; let wide = 0;
        for (const corner of boxCorners) {
          probe.copy(corner).project(camera);
          minY = Math.min(minY, probe.y);
          maxY = Math.max(maxY, probe.y);
          wide = Math.max(wide, Math.abs(probe.x));
        }
        // Сначала доска ставится по центру кадра: иначе сверху копится пустая
        // полоса — запас под башни, которых на дальнем краю почти не бывает.
        lift += (maxY + minY) / 2 * distance * Math.tan(camera.fov * Math.PI / 360);
        const half = Math.max(wide, (maxY - minY) / 2);
        if (half < 1e-3) break;
        const factor = half / 0.98;
        distance *= factor;
        if (Math.abs(factor - 1) < 0.002 && Math.abs(maxY + minY) < 0.004) break;
      }
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
      dirty = true;
      render();
    }

    // ————————————————————————————————————————————— нажатие по клетке

    const ray = new THREE.Raycaster();
    const point = new THREE.Vector2();
    canvas.addEventListener('click', (event) => {
      const rect = canvas.getBoundingClientRect();
      point.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      point.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      ray.setFromCamera(point, camera);
      const hit = ray.intersectObjects(tiles, false)[0];
      if (hit) onCellTap(hit.object.userData.cell);
    });

    // ————————————————————————————————————————————— показ состояния

    let colorOfPlayer = () => '#4f46e5';

    function ensureTokens(state) {
      while (tokens.length < state.players.length) {
        const index = tokens.length;
        const source = art('tokens', ['token-staff', 'token-jar', 'token-sheaf',
          'token-lamp', 'token-scroll', 'token-sling'][index % 6]);
        const mesh = billboard(source, 0.55);
        tokens.push(mesh);
        const shadow = new THREE.Mesh(
          new THREE.CircleGeometry(0.17, 16),
          new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.16 }),
        );
        shadow.rotation.x = -Math.PI / 2;
        shadow.visible = false;
        scene.add(shadow);
        shadows.push(shadow);
      }
    }

    /** Куда встаёт фишка игрока: по кругу вокруг середины клетки. */
    function tokenSpot(cell, index, count) {
      const at = cellPosition(cell);
      if (count <= 1) return { x: at.x, z: at.z };
      const angle = (index / count) * Math.PI * 2;
      return { x: at.x + Math.cos(angle) * 0.2, z: at.z + Math.sin(angle) * 0.2 };
    }

    function placeTokens(state) {
      const perCell = new Map();
      state.players.forEach((player) => {
        perCell.set(player.pos, (perCell.get(player.pos) || 0) + 1);
      });
      const seen = new Map();
      state.players.forEach((player, index) => {
        const mesh = tokens[index];
        if (!mesh) return;
        const count = perCell.get(player.pos) || 1;
        const order = seen.get(player.pos) || 0;
        seen.set(player.pos, order + 1);
        const spot = tokenSpot(player.pos, order, count);
        mesh.position.set(spot.x, 0.46, spot.z);
        mesh.visible = true;
        shadows[index].position.set(spot.x, 0.1, spot.z);
        shadows[index].visible = true;
      });
    }

    function sync(state, colorFn) {
      if (colorFn) colorOfPlayer = colorFn;
      ensureTokens(state);

      state.cells.forEach((cell, n) => {
        const ownerId = cell.heldFrom || cell.owner;
        const owner = ownerId && state.players.find((p) => p.id === ownerId);
        owners[n].visible = Boolean(owner);
        if (owner) owners[n].material.color.set(colorOfPlayer(owner));

        const piece = builds[n];
        const source = cell.altar ? art('build', 'build-altar')
          : (cell.level > 0 ? art('build', BUILD_ART[cell.level - 1]) : null);
        piece.visible = Boolean(source);
        if (source) {
          piece.material.map = billboardTexture(source);
          piece.material.needsUpdate = true;
          const at = cellPosition(n);
          piece.position.set(at.x, 0.48, at.z - 0.06);
        }
      });

      placeTokens(state);
      for (const mesh of [...tokens, ...builds]) mesh.quaternion.copy(camera.quaternion);
      dirty = true;
      render();
    }

    /** Фишка идёт по клеткам, а не переносится: ход должно быть видно. */
    function walk(state, index, from, steps) {
      const mesh = tokens[index];
      if (!mesh || steps <= 0) { sync(state); return Promise.resolve(); }
      const path = [];
      for (let i = 1; i <= steps; i += 1) path.push((from + i) % B.BOARD.length);
      const hop = 0.16;
      let chain = Promise.resolve();
      path.forEach((cell, i) => {
        chain = chain.then(() => animate(hop, (t) => {
          const startAt = cellPosition(i === 0 ? from : path[i - 1]);
          const endAt = cellPosition(cell);
          mesh.position.x = startAt.x + (endAt.x - startAt.x) * t;
          mesh.position.z = startAt.z + (endAt.z - startAt.z) * t;
          mesh.position.y = 0.46 + Math.sin(Math.PI * t) * 0.38;
          mesh.quaternion.copy(camera.quaternion);
          shadows[index].position.set(mesh.position.x, 0.1, mesh.position.z);
        }));
      });
      return chain.then(() => sync(state));
    }

    /** Бросок: кости кувыркаются и ложатся выпавшими числами вверх. */
    function roll(a, b) {
      const targets = [a, b];
      const spin = dice.map(() => ({
        x: Math.PI * (2 + Math.floor(Math.random() * 3)),
        z: Math.PI * (2 + Math.floor(Math.random() * 3)),
      }));
      dice.forEach((mesh) => { mesh.visible = true; });
      return animate(0.72, (t) => {
        const ease = 1 - Math.pow(1 - t, 3);
        dice.forEach((mesh, i) => {
          const end = FACE_UP[targets[i]] || FACE_UP[1];
          mesh.rotation.x = spin[i].x * (1 - ease) + end[0];
          mesh.rotation.y = end[1];
          mesh.rotation.z = spin[i].z * (1 - ease) + end[2];
          mesh.position.y = 0.34 + Math.sin(Math.PI * t) * 1.1;
        });
      });
    }

    function dispose() {
      if (watcher) watcher.disconnect();
      running = false;
      jobs.length = 0;
      renderer.dispose();
    }

    resize();
    if (watcher) watcher.observe(canvas.parentElement);
    return { sync, walk, roll, resize, dispose, render: () => { dirty = true; render(); } };
  }

  return { supported, create };
})();
