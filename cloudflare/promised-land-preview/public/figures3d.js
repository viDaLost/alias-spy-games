// figures3d.js — фишки и постройки как настоящие предметы.
//
// Раньше на доске стояли картинки: плоские щитки, которые поворачивались к
// игроку лицом. Со стороны это было видно — предмет не отбрасывал формы, не
// поворачивался вместе с доской и на просвет оказывался бумажкой. Здесь у
// каждой фишки и каждой постройки есть объём: их можно обойти камерой, и они
// ведут себя как фигурки на столе.
//
// Геометрия собирается из примитивов и профилей вращения, а не грузится
// файлами. Причина простая: все двенадцать предметов вместе весят столько,
// сколько занимает их описание в этом файле, — ни одной лишней загрузки, ни
// одного лишнего материала, и цвет каждого предмета берётся из палитры игры,
// а не из чужой текстуры. Если рядом положить готовую модель (см. MODEL_PATHS
// в board3d.js), она заменит собранную здесь: форма — дело сменное.
//
// Все предметы строятся стоящими на нуле по высоте и смотрящими в +Z.

window.PromisedLandFigures = (() => {
  'use strict';

  const THREE = window.THREE;

  /*
    Цвета предметов. Палитру приложения они не трогают: это дерево, глина,
    камень и медь — то, из чего вещи в этой игре и сделаны.
  */
  const MAT = {
    wood: 0x8a5a33,
    woodDark: 0x5d3a1c,
    clay: 0xb4643c,
    clayDark: 0x8d4a2b,
    /*
      Камень тёмный намеренно. Светлые постройки на белой плитке сливались с
      ней: на снимке они были пятнами, а не домами. Каждая ступень теперь
      отличается не только высотой, но и цветом — колодец серый с водой, шатёр
      охряный, дом песчаный под красной кровлей, ограда серо-синяя, башня
      тёмная, жертвенник почти чёрный с огнём.
    */
    stone: 0x8d8b86,
    stoneDark: 0x5f5e5b,
    slate: 0x6b7480,
    slateDark: 0x4a525c,
    sand: 0xcbb083,
    roof: 0xa8452c,
    cloth: 0xc9913f,
    clothDark: 0x8a5f22,
    grain: 0xd8a441,
    brass: 0xc8912f,
    flame: 0xffa631,
    parchment: 0xefe3c6,
    leaf: 0x4f7a3a,
    water: 0x2f6f9e,
  };

  const cache = new Map();
  /** Материалы общие на всю сцену: один цвет — один материал, а не сто. */
  function material(color, shiny) {
    const key = color + (shiny ? 's' : '');
    if (!cache.has(key)) {
      cache.set(key, new THREE.MeshLambertMaterial({
        color,
        emissive: shiny ? color : 0x000000,
        emissiveIntensity: shiny ? 0.55 : 0,
      }));
    }
    return cache.get(key);
  }

  const mesh = (geometry, color, shiny) => new THREE.Mesh(geometry, material(color, shiny));

  const put = (node, x, y, z) => { node.position.set(x, y, z); return node; };

  /** Тело вращения по профилю: [[радиус, высота], …] снизу вверх. */
  function lathe(profile, color, segments = 18) {
    const points = profile.map(([r, y]) => new THREE.Vector2(Math.max(0.0001, r), y));
    return mesh(new THREE.LatheGeometry(points, segments), color);
  }

  // ————————————————————————————————————————————————— фишки игроков

  /** Посох пастуха: древко и загнутая рукоять. */
  function staff() {
    const group = new THREE.Group();
    group.add(put(mesh(new THREE.CylinderGeometry(0.022, 0.028, 0.5, 8), MAT.wood), 0, 0.25, 0));
    const hook = mesh(new THREE.TorusGeometry(0.075, 0.021, 6, 12, Math.PI * 1.35), MAT.wood);
    hook.rotation.y = Math.PI / 2;
    hook.rotation.z = -Math.PI / 2.6;
    group.add(put(hook, 0.06, 0.49, 0));
    return group;
  }

  /** Кувшин для воды: пузатое тело, горло и две ручки. */
  function jar() {
    const group = new THREE.Group();
    group.add(lathe([
      [0.05, 0], [0.11, 0.03], [0.16, 0.13], [0.15, 0.24],
      [0.09, 0.31], [0.07, 0.35], [0.09, 0.4], [0.075, 0.41],
    ], MAT.clay));
    for (const side of [-1, 1]) {
      const ear = mesh(new THREE.TorusGeometry(0.055, 0.014, 5, 10, Math.PI), MAT.clayDark);
      ear.rotation.y = Math.PI / 2;
      ear.rotation.z = side > 0 ? 0 : Math.PI;
      group.add(put(ear, side * 0.1, 0.3, 0));
    }
    return group;
  }

  /*
    Сноп: связка, расходящаяся кверху, жгут посередине и колосья над ней.
    Каждый колос отдельным стеблем — это девятнадцать предметов на одну фишку,
    то есть девятнадцать вызовов отрисовки; связка телом вращения даёт ту же
    форму семью.
  */
  function sheaf() {
    const group = new THREE.Group();
    group.add(lathe([
      [0.05, 0], [0.07, 0.06], [0.06, 0.18], [0.09, 0.3], [0.13, 0.42], [0.02, 0.44],
    ], MAT.grain, 12));
    const band = mesh(new THREE.TorusGeometry(0.068, 0.016, 5, 12), MAT.woodDark);
    band.rotation.x = Math.PI / 2;
    group.add(put(band, 0, 0.19, 0));
    for (let i = 0; i < 5; i += 1) {
      const angle = (i / 5) * Math.PI * 2;
      const ear = mesh(new THREE.SphereGeometry(0.032, 6, 5), MAT.grain);
      ear.scale.set(0.7, 1.6, 0.7);
      group.add(put(ear, Math.cos(angle) * 0.085, 0.46, Math.sin(angle) * 0.085));
    }
    return group;
  }

  /** Светильник: масляная чаша с носиком и огоньком. */
  function lamp() {
    const group = new THREE.Group();
    const bowl = lathe([
      [0.02, 0], [0.13, 0.02], [0.15, 0.09], [0.12, 0.14], [0.06, 0.13], [0.055, 0.15],
    ], MAT.clay);
    group.add(bowl);
    const spout = mesh(new THREE.ConeGeometry(0.05, 0.12, 7), MAT.clay);
    spout.rotation.z = -Math.PI / 2.1;
    group.add(put(spout, 0.17, 0.09, 0));
    const flame = mesh(new THREE.ConeGeometry(0.032, 0.11, 7), MAT.flame, true);
    group.add(put(flame, 0.2, 0.17, 0));
    return group;
  }

  /** Свиток: пергамент на двух валиках. */
  function scroll() {
    const group = new THREE.Group();
    const sheet = mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.26, 12), MAT.parchment);
    sheet.rotation.z = Math.PI / 2;
    group.add(put(sheet, 0, 0.11, 0));
    for (const side of [-1, 1]) {
      const rod = mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.34, 8), MAT.woodDark);
      rod.rotation.z = Math.PI / 2;
      group.add(put(rod, 0, 0.11 + side * 0.062, 0));
    }
    return group;
  }

  /** Праща: камень в кожаном ложе на двух ремнях. */
  function sling() {
    const group = new THREE.Group();
    const pouch = mesh(new THREE.SphereGeometry(0.085, 10, 8, 0, Math.PI * 2, 0, Math.PI / 1.7), MAT.woodDark);
    pouch.rotation.x = Math.PI;
    group.add(put(pouch, 0, 0.12, 0));
    group.add(put(mesh(new THREE.SphereGeometry(0.055, 8, 7), MAT.stone), 0, 0.14, 0));
    for (const side of [-1, 1]) {
      const strap = mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.3, 5), MAT.clothDark);
      strap.rotation.z = side * 0.55;
      group.add(put(strap, side * 0.085, 0.25, 0));
    }
    return group;
  }

  const TOKENS = { staff, jar, sheaf, lamp, scroll, sling };

  /**
   * Фишка игрока: предмет на круглой подставке его цвета — как фигурка,
   * которую ставят на клетку. Подставка нужна не для красоты: без неё на
   * доске не видно, чей это предмет, пока не вглядишься.
   */
  function token(kind, color) {
    const group = new THREE.Group();
    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(0.17, 0.19, 0.05, 16),
      new THREE.MeshLambertMaterial({ color }),
    );
    base.position.y = 0.025;
    group.add(base);
    const piece = (TOKENS[kind] || staff)();
    piece.position.y = 0.05;
    group.add(piece);
    group.userData.base = base;
    // Сам предмет отдельно от подставки: подставка кругла у всех, и по коробке
    // фишки целиком не отличить тело от картинки, воткнутой в кружок.
    group.userData.piece = piece;
    return group;
  }

  // ————————————————————————————————————————————————— постройки

  /** Первая ступень — колодец: низкий сруб с водой, стойки и навес. */
  function well() {
    const group = new THREE.Group();
    group.add(put(mesh(new THREE.CylinderGeometry(0.2, 0.22, 0.16, 14), MAT.stoneDark), 0, 0.08, 0));
    group.add(put(mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.02, 12), MAT.water), 0, 0.155, 0));
    for (const side of [-1, 1]) {
      group.add(put(mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.24, 6), MAT.wood), side * 0.17, 0.28, 0));
    }
    const roof = mesh(new THREE.ConeGeometry(0.3, 0.14, 4), MAT.roof);
    roof.rotation.y = Math.PI / 4;
    group.add(put(roof, 0, 0.45, 0));
    group.add(put(mesh(new THREE.CylinderGeometry(0.05, 0.045, 0.08, 8), MAT.woodDark), 0, 0.34, 0));
    return group;
  }

  /** Вторая — шатёр: охряное полотнище, растяжки и тёмный вход. */
  function tent() {
    const group = new THREE.Group();
    const cloth = mesh(new THREE.ConeGeometry(0.31, 0.46, 6), MAT.cloth);
    group.add(put(cloth, 0, 0.23, 0));
    const door = mesh(new THREE.ConeGeometry(0.11, 0.24, 3), MAT.clothDark);
    group.add(put(door, 0, 0.12, 0.23));
    group.add(put(mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.12, 5), MAT.woodDark), 0, 0.5, 0));
    for (const side of [-1, 1]) {
      const rope = mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.34, 4), MAT.clothDark);
      rope.rotation.z = side * 0.75;
      group.add(put(rope, side * 0.24, 0.16, -0.12));
    }
    return group;
  }

  /** Третья — дом: песчаные стены, красная кровля, дверь и окно. */
  function house() {
    const group = new THREE.Group();
    group.add(put(mesh(new THREE.BoxGeometry(0.44, 0.3, 0.36), MAT.sand), 0, 0.15, 0));
    const roof = mesh(new THREE.ConeGeometry(0.36, 0.22, 4), MAT.roof);
    roof.rotation.y = Math.PI / 4;
    group.add(put(roof, 0, 0.41, 0));
    group.add(put(mesh(new THREE.BoxGeometry(0.11, 0.18, 0.02), MAT.woodDark), 0, 0.09, 0.19));
    group.add(put(mesh(new THREE.BoxGeometry(0.08, 0.08, 0.02), MAT.slateDark), 0.14, 0.21, 0.19));
    return group;
  }

  /*
    Ограда: стена кольцом с проёмом ворот. Кольцо — открытый цилиндр с
    вырезанным сектором, а не десяток отдельных камней: форма та же, предметов
    втрое меньше.
  */
  function wall() {
    const group = new THREE.Group();
    const ring = new THREE.Mesh(
      new THREE.CylinderGeometry(0.28, 0.3, 0.3, 20, 1, true, Math.PI * 0.32, Math.PI * 1.55),
      new THREE.MeshLambertMaterial({ color: MAT.slate, side: THREE.DoubleSide }),
    );
    group.add(put(ring, 0, 0.15, 0));
    const cap = mesh(new THREE.TorusGeometry(0.285, 0.022, 5, 20, Math.PI * 1.55), MAT.slateDark);
    cap.rotation.x = Math.PI / 2;
    cap.rotation.z = -Math.PI * 0.32;
    group.add(put(cap, 0, 0.3, 0));
    for (const side of [-1, 1]) {
      group.add(put(mesh(new THREE.BoxGeometry(0.08, 0.4, 0.08), MAT.slateDark),
        side * 0.14, 0.2, 0.25));
    }
    return group;
  }

  /** Пятая — башня: самая высокая из построек, с зубцами и флагом. */
  function tower() {
    const group = new THREE.Group();
    group.add(put(mesh(new THREE.CylinderGeometry(0.17, 0.21, 0.66, 12), MAT.slateDark), 0, 0.33, 0));
    group.add(put(mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.05, 12), MAT.slate), 0, 0.68, 0));
    for (let i = 0; i < 4; i += 1) {
      const angle = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const tooth = mesh(new THREE.BoxGeometry(0.1, 0.1, 0.08), MAT.slateDark);
      tooth.position.set(Math.cos(angle) * 0.17, 0.75, Math.sin(angle) * 0.17);
      tooth.rotation.y = -angle;
      group.add(tooth);
    }
    group.add(put(mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.2, 4), MAT.woodDark), 0, 0.85, 0));
    group.add(put(mesh(new THREE.BoxGeometry(0.12, 0.08, 0.01), MAT.roof), 0.06, 0.9, 0));
    group.add(put(mesh(new THREE.BoxGeometry(0.08, 0.14, 0.02), MAT.woodDark), 0, 0.27, 0.21));
    return group;
  }

  /** Жертвенник: сложенные камни и огонь над ними — платы с него не берут. */
  function altar() {
    const group = new THREE.Group();
    group.add(put(mesh(new THREE.BoxGeometry(0.4, 0.11, 0.4), MAT.stoneDark), 0, 0.055, 0));
    group.add(put(mesh(new THREE.BoxGeometry(0.31, 0.1, 0.31), MAT.slateDark), 0, 0.16, 0));
    group.add(put(mesh(new THREE.BoxGeometry(0.22, 0.09, 0.22), MAT.stoneDark), 0, 0.25, 0));
    const fire = mesh(new THREE.ConeGeometry(0.1, 0.22, 7), MAT.flame, true);
    group.add(put(fire, 0, 0.39, 0));
    group.userData.flame = fire;
    return group;
  }

  const BUILDINGS = { well, tent, house, wall, tower, altar };

  /** Постройка на клетке: ступень поселения или жертвенник. */
  function building(kind) {
    return (BUILDINGS[kind] || well)();
  }

  return { token, building, TOKEN_KINDS: Object.keys(TOKENS), BUILD_KINDS: Object.keys(BUILDINGS) };
})();
