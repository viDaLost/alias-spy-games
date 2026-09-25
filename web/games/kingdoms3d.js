// «Царства» в объёме: карта — настольная диорама на three.js.
//
// Правил здесь нет, и разметки игры этот файл не строит. Экран игры
// (kingdoms.js) по-прежнему рисует SVG: области, связи, жетоны, подписи — и
// по-прежнему ставит им классы: чья область, можно ли её нажать, выбрана ли,
// разрешается ли сейчас бой. Объёмная карта читает эти классы и рисует то же
// самое на рельефе, а маркеры SVG каждый кадр переставляет в экранные точки
// над своими местами на карте. Поэтому нажатия, подсветка, обучение и сетевая
// игра остаются одним кодом для обоих видов.
//
// Почему не «мыло». Плоская карта — нарисованная картинка фиксированного
// размера: приблизь её, и она расплывается. Здесь картинок нет вовсе.
// Резкость дают форма (грань горы, стена крепости, ребро границы остаются
// ребром на любом приближении) и мелкий узор поверхности, который считается
// в шейдере для каждой точки экрана, — трава, песок и камень не растягиваются,
// а досчитываются.
//
// Бюджет. Карта рисуется только когда что-то изменилось: камера сдвинулась,
// область сменила хозяина, подсветилась цель. В покое кадров нет вовсе —
// телефон не греется, пока человек думает над приказом.

(function () {
  'use strict';

  const THREE_SRC = 'web/games/moses-nile-v7/vendor/three-r128.min.js';
  const MAP_W = 900;
  const MAP_H = 940;
  const CX = MAP_W / 2;
  const CY = MAP_H / 2;
  const SEA_LEVEL = 0;

  // ————————————————————————————————————————————— загрузка

  let loading = null;

  function supported() {
    try {
      const canvas = document.createElement('canvas');
      return Boolean(window.WebGLRenderingContext
        && (canvas.getContext('webgl2') || canvas.getContext('webgl')));
    } catch { return false; }
  }

  function load() {
    if (window.THREE?.WebGLRenderer) return Promise.resolve(window.THREE);
    if (!loading) {
      loading = new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = THREE_SRC;
        script.async = true;
        script.onload = () => (window.THREE ? resolve(window.THREE) : reject(new Error('three.js не поднялся')));
        script.onerror = () => { loading = null; reject(new Error('three.js не загрузился')); };
        document.head.appendChild(script);
      });
    }
    return loading;
  }

  // ————————————————————————————————————————————— шум

  /*
    Один и тот же шум нужен и для высот (здесь, на процессоре), и для узора
    поверхности (в шейдере). Он детерминирован: карта у всех одна и та же, и
    от захода к заходу не меняется.
  */
  function hash2(ix, iy) {
    let h = Math.imul(ix, 374761393) ^ Math.imul(iy, 668265263);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967295;
  }
  function vnoise(x, y) {
    const ix = Math.floor(x); const iy = Math.floor(y);
    const fx = x - ix; const fy = y - iy;
    const u = fx * fx * (3 - 2 * fx); const v = fy * fy * (3 - 2 * fy);
    const a = hash2(ix, iy); const b = hash2(ix + 1, iy);
    const c = hash2(ix, iy + 1); const d = hash2(ix + 1, iy + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }
  function fbm(x, y, octaves = 4) {
    let sum = 0; let amp = 0.5; let freq = 1; let norm = 0;
    for (let i = 0; i < octaves; i += 1) {
      sum += amp * vnoise(x * freq + i * 17.13, y * freq - i * 9.31);
      norm += amp; amp *= 0.5; freq *= 2.03;
    }
    return sum / norm;
  }
  function ridged(x, y, octaves = 5) {
    let sum = 0; let amp = 0.5; let freq = 1; let norm = 0; let weight = 1;
    for (let i = 0; i < octaves; i += 1) {
      let n = 1 - Math.abs(vnoise(x * freq + i * 31.7, y * freq + i * 11.9) * 2 - 1);
      n *= n * weight;
      weight = Math.min(1, n * 1.6);
      sum += amp * n; norm += amp; amp *= 0.5; freq *= 2.1;
    }
    return sum / norm;
  }
  function rng(seed) {
    let s = seed >>> 0;
    return () => {
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }
  const smooth = (a, b, x) => {
    const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
  };
  const mix = (a, b, t) => a + (b - a) * t;

  // ————————————————————————————————————————————— местность

  /*
    Местность задаётся правилами игры, а не картинкой: у каждой области есть
    тип — побережье, горы, равнина, пустыня, — и от него зависят высота,
    цвет и то, что на ней растёт. Две воды сверх того: море вдоль северного
    края (Приморье там и лежит) и озеро в сердце карты, из которого река
    уходит между областями, связанными бродами, — брод в правилах есть ровно
    там, где на карте течёт река.
  */
  const BASE = { plains: 6, coast: 4.5, desert: 6, mountains: 15 };
  const PALETTE = {
    plains: [0x6f8f3c, 0x86a24a, 0x5d7d33],
    coast: [0x8fa25a, 0xa9b06c, 0x7d9550],
    desert: [0xd9a560, 0xe6bb78, 0xc98d4c],
    mountains: [0x8a7d6e, 0x9d9181, 0x736859],
  };

  function buildWorld(R, M, pos) {
    const sites = R.AREAS.map((area, index) => {
      const p = pos.get(area.id);
      return { index, id: area.id, terrain: area.terrain, region: area.region, city: Boolean(area.city),
        capital: area.capitalOf || null, x: p.x, y: p.y, poly: M.tiles[area.id].points };
    });
    const byId = new Map(sites.map((site) => [site.id, site]));

    const inside = (poly, x, y) => {
      let hit = false;
      for (let i = 0, j = poly.length - 1; i < poly.length; j = i, i += 1) {
        const [xi, yi] = poly[i]; const [xj, yj] = poly[j];
        if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
      }
      return hit;
    };
    /*
      Область, которой принадлежит точка карты: четыре ближайших центра, потом
      точный контур. Без сортировки и без выделения памяти — эта функция
      зовётся для каждой вершины рельефа, их десятки тысяч.
    */
    const nearD = new Float64Array(4);
    const nearI = new Int32Array(4);
    const nearest4 = (x, y, dist) => {
      nearD.fill(Infinity); nearI.fill(0);
      for (let i = 0; i < sites.length; i += 1) {
        const d = dist ? dist[i] : (sites[i].x - x) ** 2 + (sites[i].y - y) ** 2;
        if (d >= nearD[3]) continue;
        let k = 3;
        while (k > 0 && nearD[k - 1] > d) { nearD[k] = nearD[k - 1]; nearI[k] = nearI[k - 1]; k -= 1; }
        nearD[k] = d; nearI[k] = i;
      }
    };
    const areaAt = (x, y, dist) => {
      nearest4(x, y, dist);
      // Граница волниста не больше чем на десять единиц: вдали от неё ближайший центр и есть ответ.
      if (Math.sqrt(nearD[1]) - Math.sqrt(nearD[0]) > 24) return sites[nearI[0]];
      for (let k = 0; k < 4; k += 1) if (inside(sites[nearI[k]].poly, x, y)) return sites[nearI[k]];
      return sites[nearI[0]];
    };

    // Река: через центр по линии между бродами, от озера до края внутренних областей.
    const fordAngles = R.FORDS.map((edge) => {
      const a = byId.get(edge.a); const b = byId.get(edge.b);
      return Math.atan2((a.y + b.y) / 2 - CY, (a.x + b.x) / 2 - CX);
    });
    const riverDist = (x, y) => {
      let best = Infinity;
      for (const angle of fordAngles) {
        const dx = Math.cos(angle); const dy = Math.sin(angle);
        const t = (x - CX) * dx + (y - CY) * dy;
        if (t < 30 || t > 250) continue;
        const meander = Math.sin(t * 0.045) * 9 + Math.sin(t * 0.017 + 1.3) * 6;
        const perp = Math.abs(-(x - CX) * dy + (y - CY) * dx - meander);
        const width = 5.5 + t * 0.018;
        best = Math.min(best, perp - width + smooth(215, 250, t) * 40);
      }
      return best;
    };

    // Вдали от воды шум берега не считается: ответ там заведомо «далеко».
    const shoreDist = (x, y) => (y > 130 ? 99
      : y - (30 + 18 * fbm(x * 0.008, 3.1, 3) + 22 * Math.exp(-(((x - CX) / 170) ** 2))));
    const lakeDist = (x, y) => {
      const r = Math.hypot(x - CX, y - CY);
      return r > 130 ? 99 : r - (52 + 14 * fbm(x * 0.03, y * 0.03, 3));
    };
    const wet = (x, y, margin) => shoreDist(x, y) < margin || lakeDist(x, y) < margin || riverDist(x, y) < margin;

    /*
      Место под поселение: над маркером (на экране — выше его), а если там
      вода или чужая область — сбоку или ниже. Маркер с гербом и ценностью
      тогда не закрывает город, а город не стоит в море.
    */
    for (const site of sites) {
      const options = [[0, -40], [42, -12], [-42, -12], [0, 50], [38, 30], [-38, 30]];
      const pick = options.find(([dx, dy]) => {
        const x = site.x + dx; const y = site.y + dy;
        return x > 20 && x < MAP_W - 20 && y > 20 && y < MAP_H - 20 && !wet(x, y, 22) && inside(site.poly, x, y);
      }) || options[0];
      site.town = { x: site.x + pick[0], y: site.y + pick[1] };
    }

    const terrainHeight = (terrain, x, y) => {
      switch (terrain) {
        case 'mountains': {
          const r = ridged(x * 0.0105, y * 0.0105);
          return 8 + 84 * r * r + 6 * fbm(x * 0.05, y * 0.05, 3);
        }
        case 'desert': {
          const u = (x * 0.8 + y * 0.6) * 0.05 + fbm(x * 0.008, y * 0.008, 3) * 3.2;
          const crest = Math.pow(1 - Math.abs(Math.sin(u)), 1.7);
          return 4 + 9 * crest * (0.55 + 0.45 * fbm(x * 0.02, y * 0.02, 3)) + 1.2 * fbm(x * 0.09, y * 0.09, 2);
        }
        case 'coast':
          return 3.5 + 4 * fbm(x * 0.017, y * 0.017) + 1.2 * fbm(x * 0.08, y * 0.08, 2);
        default:
          return 5 + 5 * fbm(x * 0.016, y * 0.016) + 1.6 * fbm(x * 0.07, y * 0.07, 3);
      }
    };

    /** Высота в точке карты и местность, которая её определила. */
    const TERRAINS = ['plains', 'coast', 'desert', 'mountains'];
    const terrainIndex = sites.map((site) => TERRAINS.indexOf(site.terrain));
    const dist2 = new Float64Array(sites.length);
    const weights = new Float64Array(4);
    const sample = (x, y) => {
      let dMin = Infinity;
      for (let i = 0; i < sites.length; i += 1) {
        const d = (sites[i].x - x) ** 2 + (sites[i].y - y) ** 2;
        dist2[i] = d;
        if (d < dMin) dMin = d;
      }
      // Смешение по расстоянию до центров: переход между местностями — склон, а не ступенька.
      weights.fill(0);
      let total = 0;
      const dRoot = Math.sqrt(dMin);
      for (let i = 0; i < sites.length; i += 1) {
        const gap = dist2[i] - dMin;
        // (d - dMin) > 74 ⇒ вес < 0.01; сравнение в квадратах отсекает дальние без корня.
        if (gap > 74 * (2 * dRoot + 74)) continue;
        const w = Math.exp(-(Math.sqrt(dist2[i]) - dRoot) / 16);
        if (w < 0.01) continue;
        weights[terrainIndex[i]] += w; total += w;
      }
      let h = 0;
      for (let t = 0; t < 4; t += 1) {
        if (weights[t] > 0) h += (weights[t] / total) * terrainHeight(TERRAINS[t], x, y);
      }
      // Площадки под маркер и поселение: область читается, гора не закрывает город.
      const home = areaAt(x, y, dist2);
      const flat = BASE[home.terrain] + (home.terrain === 'mountains' ? 2 : 0.6);
      const plateau = Math.max(1 - smooth(26, 52, Math.hypot(x - home.x, y - home.y)),
        1 - smooth(22, 42, Math.hypot(x - home.town.x, y - home.town.y)));
      h = mix(h, flat, plateau);

      // Море вдоль северного края — у Приморья шире.
      h = mix(-9, h, smooth(-6, 30, shoreDist(x, y)));
      // Озеро в сердце карты.
      h = mix(-7, h, smooth(-4, 22, lakeDist(x, y)));
      // Река между бродами.
      if (Math.hypot(x - CX, y - CY) < 290) {
        const river = riverDist(x, y);
        if (river < 18) h = mix(-4, h, smooth(-1, 16, river));
      }
      return { h, home };
    };

    return { sites, byId, areaAt, sample, riverDist };
  }

  // ————————————————————————————————————————————— шейдер поверхности

  /*
    Узор поверхности. Считается для каждой точки экрана из мировых
    координат, поэтому остаётся резким на любом приближении: чем ближе камера,
    тем мельче видимая зернистость, а не тем крупнее пиксели картинки.
  */
  const NOISE_GLSL = `
    float kdHash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
    float kdNoise(vec2 p) {
      vec2 i = floor(p); vec2 f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
      float a = kdHash(i); float b = kdHash(i + vec2(1.0, 0.0));
      float c = kdHash(i + vec2(0.0, 1.0)); float d = kdHash(i + vec2(1.0, 1.0));
      return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
    }
  `;

  function terrainMaterial(THREE) {
    const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.93, metalness: 0 });
    material.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>
          attribute vec4 aTint; attribute vec3 aGlow;
          varying vec4 vTint; varying vec3 vGlow; varying vec3 vWPos;`)
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          vTint = aTint; vGlow = aGlow;
          vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;`);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>
          varying vec4 vTint; varying vec3 vGlow; varying vec3 vWPos;
          ${NOISE_GLSL}`)
        .replace('#include <color_fragment>', `#include <color_fragment>
          vec2 kdP = vWPos.xz;
          float kdFine = kdNoise(kdP * 1.7);
          float kdMid = kdNoise(kdP * 0.38);
          float kdWide = kdNoise(kdP * 0.07);
          diffuseColor.rgb *= 0.8 + 0.12 * kdFine + 0.2 * kdMid + 0.1 * kdWide;
          float kdStrata = smoothstep(0.35, 0.65, kdNoise(vec2(kdP.x * 0.05, vWPos.y * 0.9)));
          diffuseColor.rgb *= mix(1.0, 0.9 + 0.12 * kdStrata, smoothstep(18.0, 30.0, vWPos.y));
          diffuseColor.rgb = mix(diffuseColor.rgb, vTint.rgb, vTint.a);`)
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
          totalEmissiveRadiance += vGlow;`);
    };
    return material;
  }

  // ————————————————————————————————————————————— геометрия

  /** Сливает простые тела в одну геометрию с цветом вершин — один вызов отрисовки на всё. */
  function mergeParts(THREE, parts) {
    let count = 0;
    const prepared = parts.map(({ geometry, color, matrix }) => {
      const geo = geometry.index ? geometry.toNonIndexed() : geometry;
      if (matrix) geo.applyMatrix4(matrix);
      geo.computeVertexNormals();
      count += geo.attributes.position.count;
      return { geo, color: new THREE.Color(color).convertSRGBToLinear() };
    });
    const position = new Float32Array(count * 3);
    const normal = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    let offset = 0;
    for (const { geo, color } of prepared) {
      position.set(geo.attributes.position.array, offset * 3);
      normal.set(geo.attributes.normal.array, offset * 3);
      for (let i = 0; i < geo.attributes.position.count; i += 1) {
        colors[(offset + i) * 3] = color.r; colors[(offset + i) * 3 + 1] = color.g; colors[(offset + i) * 3 + 2] = color.b;
      }
      offset += geo.attributes.position.count;
      geo.dispose();
    }
    const merged = new THREE.BufferGeometry();
    merged.setAttribute('position', new THREE.BufferAttribute(position, 3));
    merged.setAttribute('normal', new THREE.BufferAttribute(normal, 3));
    merged.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    return merged;
  }

  const M4 = (THREE, { x = 0, y = 0, z = 0, ry = 0, rx = 0, sx = 1, sy = 1, sz = 1 } = {}) => {
    const m = new THREE.Matrix4();
    m.compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, 0)),
      new THREE.Vector3(sx, sy, sz));
    return m;
  };

  /** Масштаб группы тел вокруг точки — одна крепость крупнее, не трогая её чертежа. */
  function scaleAbout(THREE, parts, x, y, z, k) {
    const m = new THREE.Matrix4().makeTranslation(x, y, z)
      .multiply(new THREE.Matrix4().makeScale(k, k, k))
      .multiply(new THREE.Matrix4().makeTranslation(-x, -y, -z));
    for (const part of parts) part.matrix = part.matrix ? m.clone().multiply(part.matrix) : m.clone();
    return parts;
  }

  function houseParts(THREE, { x, z, y, ry = 0, desert = false, scale = 1 }) {
    scale *= 1.35;
    const w = 8 * scale; const h = 6 * scale; const d = 7 * scale;
    const parts = [
      { geometry: new THREE.BoxGeometry(w, h, d), color: desert ? 0xe4cfa6 : 0xeadfc8, matrix: M4(THREE, { x, y: y + h / 2, z, ry }) },
    ];
    if (desert) {
      parts.push({ geometry: new THREE.BoxGeometry(w * 1.06, 0.9 * scale, d * 1.06), color: 0xcdb58a,
        matrix: M4(THREE, { x, y: y + h + 0.45 * scale, z, ry }) });
    } else {
      parts.push({ geometry: new THREE.ConeGeometry(w * 0.78, 4.6 * scale, 4), color: 0xa9472f,
        matrix: M4(THREE, { x, y: y + h + 2.3 * scale, z, ry: ry + Math.PI / 4, sz: d / w }) });
    }
    parts.push({ geometry: new THREE.BoxGeometry(1.6 * scale, 2.6 * scale, 0.3), color: 0x5a3b22,
      matrix: M4(THREE, { x: x + Math.sin(ry) * (d / 2 + 0.1), y: y + 1.3 * scale, z: z + Math.cos(ry) * (d / 2 + 0.1), ry }) });
    return parts;
  }

  function castleParts(THREE, { x, z, y, desert }) {
    const stone = desert ? 0xd6bf94 : 0xc9c1b3;
    const dark = desert ? 0xb89b6c : 0x9d9588;
    const parts = [];
    parts.push({ geometry: new THREE.BoxGeometry(15, 18, 15), color: stone, matrix: M4(THREE, { x, y: y + 9, z }) });
    for (let i = 0; i < 4; i += 1) {
      const a = Math.PI / 4 + (i * Math.PI) / 2;
      const tx = x + Math.cos(a) * 12; const tz = z + Math.sin(a) * 12;
      parts.push({ geometry: new THREE.CylinderGeometry(3.6, 4, 16, 10), color: stone, matrix: M4(THREE, { x: tx, y: y + 8, z: tz }) });
      parts.push({ geometry: new THREE.ConeGeometry(4.6, 6, 10), color: desert ? 0xc26a3a : 0x3f5f8a, matrix: M4(THREE, { x: tx, y: y + 19, z: tz }) });
    }
    for (let i = 0; i < 4; i += 1) {
      const a = (i * Math.PI) / 2;
      parts.push({ geometry: new THREE.BoxGeometry(17, 8, 2.4), color: dark,
        matrix: M4(THREE, { x: x + Math.cos(a) * 12, y: y + 4, z: z + Math.sin(a) * 12, ry: a + Math.PI / 2 }) });
    }
    for (let i = 0; i < 8; i += 1) {
      const a = (i / 8) * Math.PI * 2;
      parts.push({ geometry: new THREE.BoxGeometry(2.4, 2.4, 2.4), color: stone,
        matrix: M4(THREE, { x: x + Math.cos(a) * 6, y: y + 19.2, z: z + Math.sin(a) * 6 }) });
    }
    parts.push({ geometry: new THREE.CylinderGeometry(0.35, 0.35, 12, 5), color: 0x4a3625, matrix: M4(THREE, { x, y: y + 24, z }) });
    return parts;
  }

  function templeParts(THREE, { x, z, y, desert }) {
    const stone = desert ? 0xe8d5ae : 0xefe8da;
    const parts = [{ geometry: new THREE.BoxGeometry(14, 2, 10), color: 0xbdb3a2, matrix: M4(THREE, { x, y: y + 1, z }) }];
    for (let i = 0; i < 4; i += 1) {
      for (const side of [-1, 1]) {
        parts.push({ geometry: new THREE.CylinderGeometry(0.8, 0.9, 8, 8), color: stone,
          matrix: M4(THREE, { x: x - 5.4 + i * 3.6, y: y + 6, z: z + side * 3.8 }) });
      }
    }
    parts.push({ geometry: new THREE.BoxGeometry(14, 1.4, 10), color: stone, matrix: M4(THREE, { x, y: y + 10.7, z }) });
    parts.push({ geometry: new THREE.ConeGeometry(8.8, 3.4, 4), color: 0xb9a888,
      matrix: M4(THREE, { x, y: y + 13.1, z, ry: Math.PI / 4, sz: 0.72 }) });
    return parts;
  }

  // ————————————————————————————————————————————— сцена

  function detectQuality(renderer) {
    try {
      const gl = renderer.getContext();
      const info = gl.getExtension('WEBGL_debug_renderer_info');
      const name = info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : '';
      if (/swiftshader|llvmpipe|software/i.test(name)) return 'low';
    } catch { /* нет сведений — считаем по железу */ }
    const memory = navigator.deviceMemory || 4;
    const cores = navigator.hardwareConcurrency || 4;
    if (memory <= 3 || cores <= 4) return 'mid';
    return 'high';
  }

  function mount(options) {
    const started = performance.now();
    const THREE = window.THREE;
    const { scroll, svg, R, M, pos, regionCenter, onTap } = options;
    const world = buildWorld(R, M, pos);
    const marks = {};
    const mark = (name) => { marks[name] = Math.round(performance.now() - started); };

    const canvas = document.createElement('canvas');
    canvas.className = 'kd-3d-canvas';
    canvas.setAttribute('aria-hidden', 'true');
    scroll.insertBefore(canvas, scroll.firstChild);

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    const quality = options.quality || window.KD3D_QUALITY || detectQuality(renderer);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, quality === 'high' ? 2 : 1.6));
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    renderer.shadowMap.enabled = quality !== 'low';
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.setClearColor(0x1d2927, 1);

    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0x1d2927, 1400, 2600);
    const camera = new THREE.PerspectiveCamera(34, 1, 5, 4000);

    scene.add(new THREE.HemisphereLight(0xe3efff, 0x5f5236, 0.62));
    const sun = new THREE.DirectionalLight(0xfff0d6, 1.12);
    sun.position.set(-380, 620, 420);
    sun.castShadow = renderer.shadowMap.enabled;
    if (sun.castShadow) {
      const size = quality === 'high' ? 2048 : 1024;
      sun.shadow.mapSize.set(size, size);
      Object.assign(sun.shadow.camera, { left: -560, right: 560, top: 560, bottom: -560, near: 100, far: 1800 });
      sun.shadow.bias = -0.0006;
      sun.shadow.normalBias = 0.6;
    }
    scene.add(sun);
    scene.add(new THREE.AmbientLight(0xffffff, 0.12));

    const disposables = [];
    const keep = (thing) => { disposables.push(thing); return thing; };

    mark('renderer');
    // ——— рельеф ———
    const STEP = quality === 'high' ? 4 : quality === 'mid' ? 5 : 6;
    const cols = Math.round(MAP_W / STEP) + 1;
    const rows = Math.round(MAP_H / STEP) + 1;
    const vertexCount = cols * rows;
    const positions = new Float32Array(vertexCount * 3);
    const colors = new Float32Array(vertexCount * 3);
    const tints = new Float32Array(vertexCount * 4);
    const glows = new Float32Array(vertexCount * 3);
    const areaOfVertex = new Int16Array(vertexCount);
    const heightGrid = new Float32Array(vertexCount);
    const color = new THREE.Color();
    const tmp = new THREE.Color();
    for (let j = 0; j < rows; j += 1) {
      for (let i = 0; i < cols; i += 1) {
        const x = Math.min(MAP_W, i * STEP); const y = Math.min(MAP_H, j * STEP);
        const k = j * cols + i;
        const { h, home } = world.sample(x, y);
        heightGrid[k] = h;
        areaOfVertex[k] = home.index;
        positions[k * 3] = x - CX; positions[k * 3 + 1] = h; positions[k * 3 + 2] = y - CY;
        const tones = PALETTE[home.terrain];
        const t = fbm(x * 0.03, y * 0.03, 3);
        color.setHex(tones[0]).lerp(tmp.setHex(t > 0.5 ? tones[1] : tones[2]), Math.abs(t - 0.5) * 1.6);
        if (home.terrain === 'mountains' && h > 40) color.lerp(tmp.setHex(0xf1f2f0), smooth(40, 52, h));
        else if (h > 22) color.lerp(tmp.setHex(0x8e8373), smooth(22, 34, h) * 0.8);
        if (h < 2.2) color.lerp(tmp.setHex(0xdcc893), smooth(2.2, 0.2, h));
        if (h < -0.5) color.lerp(tmp.setHex(0x2d5f63), smooth(-0.5, -6, h));
        color.convertSRGBToLinear();
        colors[k * 3] = color.r; colors[k * 3 + 1] = color.g; colors[k * 3 + 2] = color.b;
      }
    }
    const heightAt = (x, y) => {
      const gx = Math.max(0, Math.min(cols - 1.001, x / STEP));
      const gy = Math.max(0, Math.min(rows - 1.001, y / STEP));
      const i = Math.floor(gx); const j = Math.floor(gy);
      const fx = gx - i; const fy = gy - j;
      const h00 = heightGrid[j * cols + i]; const h10 = heightGrid[j * cols + i + 1];
      const h01 = heightGrid[(j + 1) * cols + i]; const h11 = heightGrid[(j + 1) * cols + i + 1];
      return mix(mix(h00, h10, fx), mix(h01, h11, fx), fy);
    };
    const indices = new Uint32Array((cols - 1) * (rows - 1) * 6);
    let n = 0;
    for (let j = 0; j < rows - 1; j += 1) {
      for (let i = 0; i < cols - 1; i += 1) {
        const a = j * cols + i; const b = a + 1; const c = a + cols; const d = c + 1;
        indices[n++] = a; indices[n++] = c; indices[n++] = b;
        indices[n++] = b; indices[n++] = c; indices[n++] = d;
      }
    }
    const terrainGeo = keep(new THREE.BufferGeometry());
    terrainGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    terrainGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const tintAttr = new THREE.BufferAttribute(tints, 4);
    const glowAttr = new THREE.BufferAttribute(glows, 3);
    tintAttr.setUsage(THREE.DynamicDrawUsage);
    glowAttr.setUsage(THREE.DynamicDrawUsage);
    terrainGeo.setAttribute('aTint', tintAttr);
    terrainGeo.setAttribute('aGlow', glowAttr);
    terrainGeo.setIndex(new THREE.BufferAttribute(indices, 1));
    terrainGeo.computeVertexNormals();
    mark('terrain');
    const terrainMat = keep(terrainMaterial(THREE));
    const terrain = new THREE.Mesh(terrainGeo, terrainMat);
    terrain.receiveShadow = renderer.shadowMap.enabled;
    scene.add(terrain);

    // ——— борт диорамы: срез земли слоями ———
    {
      const parts = [];
      const edge = (points) => {
        for (let s = 0; s < points.length - 1; s += 1) {
          const [x1, y1] = points[s]; const [x2, y2] = points[s + 1];
          const h1 = heightAt(x1, y1); const h2 = heightAt(x2, y2);
          const shape = new THREE.BufferGeometry();
          const top1 = Math.max(h1, -9); const top2 = Math.max(h2, -9);
          const verts = new Float32Array([
            x1 - CX, top1, y1 - CY, x2 - CX, top2, y2 - CY, x1 - CX, -34, y1 - CY,
            x2 - CX, top2, y2 - CY, x2 - CX, -34, y2 - CY, x1 - CX, -34, y1 - CY,
          ]);
          shape.setAttribute('position', new THREE.BufferAttribute(verts, 3));
          parts.push({ geometry: shape, color: 0x6b4f33 });
        }
      };
      const line = (x1, y1, x2, y2) => {
        const pts = [];
        const steps = Math.ceil(Math.hypot(x2 - x1, y2 - y1) / STEP);
        for (let s = 0; s <= steps; s += 1) pts.push([mix(x1, x2, s / steps), mix(y1, y2, s / steps)]);
        return pts;
      };
      edge(line(0, MAP_H, MAP_W, MAP_H));
      edge(line(MAP_W, MAP_H, MAP_W, 0));
      edge(line(MAP_W, 0, 0, 0));
      edge(line(0, 0, 0, MAP_H));
      const skirtGeo = keep(mergeParts(THREE, parts));
      const skirtMat = keep(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, side: THREE.DoubleSide }));
      skirtMat.onBeforeCompile = (shader) => {
        shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
          .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
        shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>\nvarying vec3 vWPos;\n${NOISE_GLSL}`)
          .replace('#include <color_fragment>', `#include <color_fragment>
            float layer = kdNoise(vec2((vWPos.x + vWPos.z) * 0.04, vWPos.y * 0.35));
            diffuseColor.rgb *= 0.72 + 0.4 * layer;
            diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.36, 0.42, 0.18), smoothstep(-1.0, 3.0, vWPos.y) * 0.55);`);
      };
      scene.add(new THREE.Mesh(skirtGeo, skirtMat));
      const plinth = new THREE.Mesh(keep(new THREE.BoxGeometry(MAP_W + 28, 14, MAP_H + 28)),
        keep(new THREE.MeshStandardMaterial({ color: 0x3b2a1c, roughness: 0.7 })));
      plinth.position.y = -41;
      plinth.receiveShadow = true;
      scene.add(plinth);
    }

    // ——— вода ———
    {
      const size = 256;
      const data = new Uint8Array(size * size * 4);
      for (let y = 0; y < size; y += 1) {
        for (let x = 0; x < size; x += 1) {
          const f = (u, v) => fbm(u / 18, v / 18, 3) * 0.7 + vnoise(u / 5, v / 5) * 0.3;
          const dx = f(x + 1, y) - f(x - 1, y);
          const dy = f(x, y + 1) - f(x, y - 1);
          const k = (y * size + x) * 4;
          data[k] = Math.round((0.5 - dx * 2.4) * 255);
          data[k + 1] = Math.round((0.5 - dy * 2.4) * 255);
          data[k + 2] = 255; data[k + 3] = 255;
        }
      }
      const normalMap = keep(new THREE.DataTexture(data, size, size, THREE.RGBAFormat));
      normalMap.wrapS = normalMap.wrapT = THREE.RepeatWrapping;
      normalMap.repeat.set(9, 9);
      normalMap.needsUpdate = true;
      const water = new THREE.Mesh(keep(new THREE.PlaneGeometry(MAP_W, MAP_H)),
        keep(new THREE.MeshStandardMaterial({ color: 0x2b7f93, roughness: 0.14, metalness: 0.15,
          transparent: true, opacity: 0.82, normalMap, normalScale: new THREE.Vector2(0.55, 0.55) })));
      water.rotation.x = -Math.PI / 2;
      water.position.y = SEA_LEVEL - 0.4;
      water.receiveShadow = renderer.shadowMap.enabled;
      scene.add(water);
    }

    mark('skirtWater');
    // ——— границы областей ———
    /*
      Граница — не линия на картинке, а ребро на земле: лента чуть над рельефом,
      идущая по тому же контуру, что и нажимаемая область. Внутри каждой
      области своя лента в цвет владельца, между ними — тёмный шов; так соседи
      видны раздельно даже одного цвета.
    */
    const ribbon = (points, inset, width, lift, site) => {
      const pts = [];
      for (let i = 0; i < points.length; i += 1) {
        const [ax, ay] = points[i]; const [bx, by] = points[(i + 1) % points.length];
        const steps = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / 3));
        for (let s = 0; s < steps; s += 1) pts.push([mix(ax, bx, s / steps), mix(ay, by, s / steps)]);
      }
      const moved = pts.map(([x, y]) => {
        if (!inset) return [x, y];
        const dx = site.x - x; const dy = site.y - y; const len = Math.hypot(dx, dy) || 1;
        return [x + (dx / len) * inset, y + (dy / len) * inset];
      });
      const verts = [];
      for (let i = 0; i < moved.length; i += 1) {
        const [x1, y1] = moved[i]; const [x2, y2] = moved[(i + 1) % moved.length];
        const len = Math.hypot(x2 - x1, y2 - y1) || 1;
        const nx = (-(y2 - y1) / len) * width / 2; const ny = ((x2 - x1) / len) * width / 2;
        const g1 = heightAt(x1, y1); const g2 = heightAt(x2, y2);
        // По воде граница не идёт: области делит берег, а не линия поперёк озера.
        if (g1 < 0.8 || g2 < 0.8) continue;
        const h1 = g1 + lift; const h2 = g2 + lift;
        const quad = [
          [x1 - nx, h1, y1 - ny], [x2 - nx, h2, y2 - ny], [x1 + nx, h1, y1 + ny],
          [x2 - nx, h2, y2 - ny], [x2 + nx, h2, y2 + ny], [x1 + nx, h1, y1 + ny],
        ];
        for (const [x, h, y] of quad) verts.push(x - CX, h, y - CY);
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(verts), 3));
      geo.computeVertexNormals();
      return keep(geo);
    };
    const seamMat = keep(new THREE.MeshBasicMaterial({ color: 0x2a2016, transparent: true, opacity: 0.55,
      side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, depthWrite: false }));
    const borders = new Map();
    {
      // Швы у всех областей одного цвета — одна геометрия, один вызов отрисовки.
      const seams = world.sites.map((site) => ribbon(site.poly, 0, 1.6, 0.7, site));
      const total = seams.reduce((sum, geo) => sum + geo.attributes.position.array.length, 0);
      const merged = new Float32Array(total);
      let at = 0;
      for (const geo of seams) { merged.set(geo.attributes.position.array, at); at += geo.attributes.position.array.length; }
      const seamGeo = keep(new THREE.BufferGeometry());
      seamGeo.setAttribute('position', new THREE.BufferAttribute(merged, 3));
      scene.add(new THREE.Mesh(seamGeo, seamMat));
    }
    for (const site of world.sites) {
      const material = keep(new THREE.MeshStandardMaterial({ color: 0xd8d2c4, roughness: 0.5, emissive: 0x000000,
        side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }));
      const mesh = new THREE.Mesh(ribbon(site.poly, 3.2, 3.4, 1.1, site), material);
      scene.add(mesh);
      borders.set(site.id, material);
    }

    mark('borders');
    // ——— поселения ———
    /*
      Каждая область обжита: у простой — хутор, у города — городок с храмом, у
      столицы — крепость. Стоят они над маркером области (на экране — выше
      его), чтобы маркер с гербом и ценностью их не закрывал.
    */
    const flags = new Map();
    const walls = new Map();
    {
      const parts = [];
      const random = rng(4242);
      for (const site of world.sites) {
        const x = site.town.x - CX; const z = site.town.y - CY;
        const y = heightAt(site.town.x, site.town.y) - 0.3;
        const desert = site.terrain === 'desert';
        if (site.capital) {
          parts.push(...scaleAbout(THREE, castleParts(THREE, { x, z, y, desert }), x, y, z, 1.35));
        } else if (site.city) {
          parts.push(...scaleAbout(THREE, templeParts(THREE, { x: x + 1, z: z - 2, y, desert }), x + 1, y, z - 2, 1.3));
          for (let i = 0; i < 5; i += 1) {
            const a = (i / 5) * Math.PI * 2 + random() * 0.6;
            parts.push(...houseParts(THREE, { x: x + Math.cos(a) * 15, z: z + Math.sin(a) * 11, y: y - 0.2,
              ry: random() * Math.PI, desert, scale: 0.8 + random() * 0.25 }));
          }
        } else {
          for (let i = 0; i < 2; i += 1) {
            parts.push(...houseParts(THREE, { x: x - 6 + i * 12, z: z + (i ? 3 : -2), y: y - 0.2,
              ry: random() * Math.PI, desert, scale: 0.72 + random() * 0.2 }));
          }
        }
        // Знамя владельца: древко и полотнище, полотнище перекрашивается при смене хозяина.
        const poleX = x + (site.capital ? 0 : 10); const poleZ = z + (site.capital ? 0 : -8);
        const poleY = site.capital ? y + 25 : y;
        parts.push({ geometry: new THREE.CylinderGeometry(0.35, 0.4, 13, 5), color: 0x4a3625,
          matrix: M4(THREE, { x: poleX, y: poleY + 6.5, z: poleZ }) });
        const flagMat = keep(new THREE.MeshStandardMaterial({ color: 0xd8d2c4, roughness: 0.8, side: THREE.DoubleSide }));
        const flag = new THREE.Mesh(keep(new THREE.PlaneGeometry(7, 4.4, 4, 1)), flagMat);
        const fp = flag.geometry.attributes.position;
        for (let i = 0; i < fp.count; i += 1) fp.setZ(i, Math.sin((fp.getX(i) + 3.5) * 0.8) * 0.7);
        flag.geometry.computeVertexNormals();
        flag.position.set(poleX + 3.6, poleY + 10.6, poleZ);
        flag.castShadow = renderer.shadowMap.enabled;
        scene.add(flag);
        flags.set(site.id, flagMat);
        const wallGroup = new THREE.Group();
        wallGroup.position.set(x, y, z);
        scene.add(wallGroup);
        walls.set(site.id, { group: wallGroup, count: -1, desert });
      }
      const settlements = new THREE.Mesh(keep(mergeParts(THREE, parts)),
        keep(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.78 })));
      settlements.castShadow = renderer.shadowMap.enabled;
      settlements.receiveShadow = renderer.shadowMap.enabled;
      scene.add(settlements);
    }
    const wallGeo = keep(new THREE.BoxGeometry(12, 5, 2.2));
    const towerGeo = keep(new THREE.CylinderGeometry(2.4, 2.8, 8, 8));
    const wallMat = { stone: keep(new THREE.MeshStandardMaterial({ color: 0xb5ab9a, roughness: 0.85 })),
      sand: keep(new THREE.MeshStandardMaterial({ color: 0xcdb58a, roughness: 0.85 })) };
    const setWalls = (siteId, count) => {
      const entry = walls.get(siteId);
      if (!entry || entry.count === count) return;
      entry.count = count;
      entry.group.clear();
      const material = entry.desert ? wallMat.sand : wallMat.stone;
      for (let i = 0; i < count; i += 1) {
        const a = -Math.PI / 2 + (i - (count - 1) / 2) * 0.62;
        const wall = new THREE.Mesh(wallGeo, material);
        wall.position.set(Math.cos(a) * 25, 2.5, Math.sin(a) * 25 + 8);
        wall.rotation.y = -a + Math.PI / 2;
        wall.castShadow = renderer.shadowMap.enabled;
        entry.group.add(wall);
        const tower = new THREE.Mesh(towerGeo, material);
        tower.position.set(Math.cos(a + 0.31) * 25, 4, Math.sin(a + 0.31) * 25 + 8);
        tower.castShadow = renderer.shadowMap.enabled;
        entry.group.add(tower);
      }
    };

    mark('towns');
    // ——— природа ———
    /*
      Деревья, скалы и пальмы — по нескольку сотен штук, но каждое семейство
      рисуется одним вызовом (InstancedMesh). Расставляются они детерминированно,
      в стороне от воды, маркеров и поселений.
    */
    {
      const random = rng(9091);
      const clear = (x, y) => {
        const site = world.areaAt(x, y);
        if (Math.hypot(x - site.x, y - site.y) < 46) return false;
        if (Math.hypot(x - site.town.x, y - site.town.y) < 30) return false;
        return true;
      };
      const place = (count, want, build) => {
        const spots = [];
        for (let tries = 0; spots.length < count && tries < count * 25; tries += 1) {
          const x = 8 + random() * (MAP_W - 16); const y = 8 + random() * (MAP_H - 16);
          const site = world.areaAt(x, y);
          if (!want(site, x, y)) continue;
          const h = heightAt(x, y);
          if (h < 2.2 || !clear(x, y) || world.riverDist(x, y) < 6) continue;
          spots.push({ x, y, h, s: 0.75 + random() * 0.6, r: random() * Math.PI * 2 });
        }
        if (!spots.length) return;
        const { geometry, material } = build();
        const mesh = new THREE.InstancedMesh(geometry, material, spots.length);
        const m = new THREE.Matrix4();
        spots.forEach((spot, i) => {
          m.compose(new THREE.Vector3(spot.x - CX, spot.h - 0.4, spot.y - CY),
            new THREE.Quaternion().setFromEuler(new THREE.Euler(0, spot.r, 0)),
            new THREE.Vector3(spot.s, spot.s * (0.85 + random() * 0.35), spot.s));
          mesh.setMatrixAt(i, m);
        });
        mesh.castShadow = renderer.shadowMap.enabled;
        mesh.receiveShadow = false;
        scene.add(mesh);
      };
      const density = quality === 'high' ? 1 : quality === 'mid' ? 0.7 : 0.45;
      const leafy = (tone) => ({
        geometry: keep(mergeParts(THREE, [
          { geometry: new THREE.CylinderGeometry(0.6, 0.9, 5, 5), color: 0x5b3d24, matrix: M4(THREE, { y: 2.5 }) },
          { geometry: new THREE.ConeGeometry(4.2, 7.5, 7), color: tone, matrix: M4(THREE, { y: 7.2 }) },
          { geometry: new THREE.ConeGeometry(3.1, 6, 7), color: tone, matrix: M4(THREE, { y: 10.4, ry: 0.4 }) },
        ])),
        material: keep(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 })),
      });
      const olive = () => ({
        geometry: keep(mergeParts(THREE, [
          { geometry: new THREE.CylinderGeometry(0.7, 1, 4, 5), color: 0x6a4a2c, matrix: M4(THREE, { y: 2 }) },
          { geometry: new THREE.IcosahedronGeometry(4.2, 1), color: 0x7d8f4a, matrix: M4(THREE, { y: 6.4, sy: 0.72 }) },
        ])),
        material: keep(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, flatShading: true })),
      });
      place(Math.round(520 * density), (site) => site.terrain === 'plains', () => leafy(0x3f6b2c));
      place(Math.round(260 * density), (site) => site.terrain === 'plains' || site.terrain === 'coast', olive);
      place(Math.round(160 * density), (site, x, y) => site.terrain === 'mountains' && heightAt(x, y) < 30, () => leafy(0x2f5536));
      place(Math.round(260 * density), (site) => site.terrain === 'mountains', () => ({
        geometry: keep(mergeParts(THREE, [
          { geometry: new THREE.DodecahedronGeometry(3.4, 0), color: 0x857a6c, matrix: M4(THREE, { y: 1.4, sx: 1.3, sy: 0.8 }) },
          { geometry: new THREE.DodecahedronGeometry(2.2, 0), color: 0x9a8f80, matrix: M4(THREE, { x: 2.8, y: 1, z: 1.5, ry: 0.7 }) },
        ])),
        material: keep(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true })),
      }));
      place(Math.round(130 * density), (site) => site.terrain === 'desert' || site.terrain === 'coast', () => {
        const parts = [{ geometry: new THREE.CylinderGeometry(0.45, 0.75, 11, 5), color: 0x7a5a36, matrix: M4(THREE, { y: 5.5, rx: 0.08 }) }];
        for (let i = 0; i < 6; i += 1) {
          parts.push({ geometry: new THREE.ConeGeometry(1.1, 7, 4), color: 0x4f7a34,
            matrix: M4(THREE, { x: Math.cos((i / 6) * Math.PI * 2) * 2.6, y: 10.4, z: Math.sin((i / 6) * Math.PI * 2) * 2.6,
              rx: Math.PI / 2.3, ry: -(i / 6) * Math.PI * 2 + Math.PI / 2, sz: 0.35 }) });
        }
        return { geometry: keep(mergeParts(THREE, parts)), material: keep(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 })) };
      });
    }

    mark('nature');
    // ————————————————————————————————————————— камера и управление

    const cam = { x: 0, z: 30, dist: 1200, tilt: 0.55, yaw: 0 };
    let limits = { maxDist: 1600, minDist: 170 };
    const setCamera = () => {
      const sinT = Math.sin(cam.tilt);
      camera.position.set(cam.x + cam.dist * sinT * Math.sin(cam.yaw), cam.dist * Math.cos(cam.tilt),
        cam.z + cam.dist * sinT * Math.cos(cam.yaw));
      camera.lookAt(cam.x, 8, cam.z);
      camera.updateMatrixWorld();
    };
    const clampCam = () => {
      cam.tilt = Math.max(0.2, Math.min(1.1, cam.tilt));
      cam.dist = Math.max(limits.minDist, Math.min(limits.maxDist, cam.dist));
      cam.x = Math.max(-MAP_W / 2, Math.min(MAP_W / 2, cam.x));
      cam.z = Math.max(-MAP_H / 2, Math.min(MAP_H / 2, cam.z));
    };

    let width = 1; let height = 1;
    const resize = () => {
      const rect = scroll.getBoundingClientRect();
      width = Math.max(1, Math.round(rect.width)); height = Math.max(1, Math.round(rect.height));
      renderer.setSize(width, height, false);
      canvas.style.width = `${width}px`; canvas.style.height = `${height}px`;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
      invalidate();
    };

    /** Дистанция, на которой вся карта входит в кадр при нынешнем наклоне и повороте. */
    const fitDistance = () => {
      const corners = [[-CX, -CY], [CX, -CY], [CX, CY], [-CX, CY]];
      const v = new THREE.Vector3();
      let lo = 150; let hi = 6000;
      const saved = { ...cam };
      cam.x = 0; cam.z = 18;
      for (let i = 0; i < 26; i += 1) {
        cam.dist = (lo + hi) / 2;
        setCamera();
        const fits = corners.every(([x, z]) => {
          v.set(x, 0, z).project(camera);
          return Math.abs(v.x) <= 0.97 && Math.abs(v.y) <= 0.95;
        });
        if (fits) hi = cam.dist; else lo = cam.dist;
      }
      const result = hi;
      Object.assign(cam, saved);
      return result;
    };

    let animation = null;
    const animateTo = (target, ms = 380) => {
      const from = { ...cam };
      const start = performance.now();
      animation = { from, target, start, ms };
      invalidate();
    };
    const fit = (instant = false) => {
      const target = { x: 0, z: 18, tilt: 0.55, yaw: 0 };
      const saved = { ...cam };
      Object.assign(cam, target);
      const dist = fitDistance();
      Object.assign(cam, saved);
      limits = { maxDist: dist * 1.12, minDist: 170 };
      target.dist = dist;
      if (instant) { Object.assign(cam, target); animation = null; invalidate(); }
      else animateTo(target);
    };
    const zoomTo = (scale) => {
      clampCam();
      animateTo({ ...cam, dist: Math.max(limits.minDist, Math.min(limits.maxDist, (limits.maxDist / 1.12) / Math.max(0.5, scale))) }, 300);
    };
    const zoom = (factor) => {
      clampCam();
      animateTo({ ...cam, dist: Math.max(limits.minDist, Math.min(limits.maxDist, cam.dist / factor)) }, 240);
    };

    // ——— луч: из точки экрана в точку карты ———
    const raycaster = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    const groundAt = (clientX, clientY) => {
      const rect = canvas.getBoundingClientRect();
      ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
      raycaster.setFromCamera(ndc, camera);
      // Только сам рельеф: небо за краем диорамы или её борт — не область.
      const hit = raycaster.intersectObject(terrain, false)[0];
      return hit ? { x: hit.point.x + CX, y: hit.point.z + CY } : null;
    };
    const planeAt = (clientX, clientY, level) => {
      const rect = canvas.getBoundingClientRect();
      ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
      raycaster.setFromCamera(ndc, camera);
      const point = new THREE.Vector3();
      return raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -level), point) ? point : null;
    };

    // ——— жесты ———
    /*
      Один палец тянет карту, как лист на столе: точка под пальцем остаётся под
      пальцем. Два пальца: разведение — приближение, поворот — поворот карты,
      сдвиг обоих вверх-вниз — наклон. Колесо мыши приближает, правая кнопка
      поворачивает и наклоняет. Нажатие без движения — выбор области.
    */
    const pointers = new Map();
    let gesture = null;
    let suppressClick = false;
    const snapshot = () => {
      const pts = [...pointers.values()];
      const center = pts.length >= 2 ? { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 } : pts[0];
      gesture = {
        count: pts.length, center, moved: false,
        distance: pts.length >= 2 ? Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) : 0,
        angle: pts.length >= 2 ? Math.atan2(pts[1].y - pts[0].y, pts[1].x - pts[0].x) : 0,
        cam: { ...cam },
        anchor: planeAt(center.x, center.y, 8),
        button: gesture?.button ?? 0,
      };
    };
    const onDown = (event) => {
      if (event.pointerType === 'mouse' && event.button !== 0 && event.button !== 2) return;
      animation = null;
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (pointers.size <= 2) {
        snapshot();
        gesture.button = event.button;
        gesture.target = event.target;
        gesture.start = { x: event.clientX, y: event.clientY };
      }
    };
    const onMove = (event) => {
      if (!pointers.has(event.pointerId) || !gesture) return;
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      const pts = [...pointers.values()];
      const center = pts.length >= 2 ? { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 } : pts[0];
      if (!gesture.moved && pts.length === 1 && Math.hypot(center.x - gesture.center.x, center.y - gesture.center.y) < 7) return;
      if (!gesture.moved) {
        gesture.moved = true; suppressClick = true;
        try { scroll.setPointerCapture(event.pointerId); } catch { /* палец уже отпущен */ }
      }
      if (pts.length === 1 && (gesture.button === 2 || event.shiftKey)) {
        cam.yaw = gesture.cam.yaw - (center.x - gesture.center.x) * 0.006;
        cam.tilt = gesture.cam.tilt - (center.y - gesture.center.y) * 0.004;
      } else if (pts.length === 1) {
        // Точка, схваченная пальцем, остаётся под пальцем.
        Object.assign(cam, { x: gesture.cam.x, z: gesture.cam.z });
        setCamera();
        const now = planeAt(center.x, center.y, 8);
        if (now && gesture.anchor) {
          cam.x = gesture.cam.x + (gesture.anchor.x - now.x);
          cam.z = gesture.cam.z + (gesture.anchor.z - now.z);
        }
      } else if (pts.length === 2) {
        const distance = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
        const angle = Math.atan2(pts[1].y - pts[0].y, pts[1].x - pts[0].x);
        const spread = distance / Math.max(1, gesture.distance);
        const dy = center.y - gesture.center.y;
        cam.dist = gesture.cam.dist / spread;
        cam.yaw = gesture.cam.yaw - (angle - gesture.angle);
        // Оба пальца идут вверх-вниз, почти не расходясь, — это наклон.
        if (Math.abs(spread - 1) < 0.12) cam.tilt = gesture.cam.tilt - dy * 0.005;
      }
      clampCam();
      invalidate();
    };
    const onUp = (event) => {
      if (!pointers.has(event.pointerId)) return;
      const wasTap = gesture && !gesture.moved && pointers.size === 1 && gesture.count === 1;
      const target = gesture?.target;
      pointers.delete(event.pointerId);
      try { scroll.releasePointerCapture(event.pointerId); } catch { /* отпущен */ }
      if (pointers.size) snapshot(); else gesture = null;
      if (suppressClick) window.setTimeout(() => { suppressClick = false; }, 120);
      // Нажатие по самой карте (не по маркеру, жетону или связи — у них свои обработчики).
      if (wasTap && (target === canvas || target === svg || target?.classList?.contains('kd-3d-hit'))) {
        const point = groundAt(event.clientX, event.clientY);
        if (point && point.x >= 0 && point.x <= MAP_W && point.y >= 0 && point.y <= MAP_H) {
          onTap?.(world.areaAt(point.x, point.y).id);
        }
      }
    };
    const onClickCapture = (event) => {
      if (!suppressClick) return;
      event.preventDefault(); event.stopImmediatePropagation(); suppressClick = false;
    };
    const onWheel = (event) => {
      event.preventDefault();
      animation = null;
      cam.dist *= event.deltaY < 0 ? 1 / 1.12 : 1.12;
      clampCam();
      invalidate();
    };
    const onContext = (event) => event.preventDefault();
    scroll.addEventListener('pointerdown', onDown);
    scroll.addEventListener('pointermove', onMove);
    scroll.addEventListener('pointerup', onUp);
    scroll.addEventListener('pointercancel', onUp);
    scroll.addEventListener('click', onClickCapture, true);
    scroll.addEventListener('wheel', onWheel, { passive: false });
    scroll.addEventListener('contextmenu', onContext);

    // ————————————————————————————————————————— наложение SVG

    /*
      SVG остаётся тем же, что строит экран игры, только живёт теперь в
      экранных координатах: у него viewBox по размеру карты в точках, и
      каждый маркер, жетон и подпись ставится туда, где на экране оказалась
      его точка на рельефе. Масштаб маркера следует за приближением, но в
      разумных пределах: и издалека его можно прочесть, и вблизи он не
      заслоняет полкарты.
    */
    const areaGroups = new Map();
    const edgeLines = [];
    const regionGroups = [];
    const collectOverlay = () => {
      areaGroups.clear();
      svg.querySelectorAll('[data-area]').forEach((group) => areaGroups.set(group.dataset.area, group));
      edgeLines.length = 0;
      svg.querySelectorAll('[data-edge]').forEach((line) => edgeLines.push(line));
      regionGroups.length = 0;
      svg.querySelectorAll('[data-region]').forEach((group) => {
        const text = group.querySelector('text');
        if (text && !text.dataset.wx) {
          text.dataset.wx = text.getAttribute('x'); text.dataset.wy = String(Number(text.getAttribute('y')) - 6);
          text.setAttribute('x', '0'); text.setAttribute('y', '0');
        }
        regionGroups.push(group);
      });
    };
    const projected = new THREE.Vector3();
    const project = (x, y, lift) => {
      projected.set(x - CX, Math.max(heightAt(x, y), SEA_LEVEL) + lift, y - CY).project(camera);
      return { x: (projected.x + 1) * 0.5 * width, y: (1 - projected.y) * 0.5 * height, z: projected.z };
    };
    const pixelsPerUnit = (x, y) => {
      const a = project(x, y, 6);
      projected.set(x - CX, Math.max(heightAt(x, y), SEA_LEVEL) + 6, y - CY)
        .add(new THREE.Vector3(10, 0, 0).applyQuaternion(camera.quaternion)).project(camera);
      return Math.hypot((projected.x + 1) * 0.5 * width - a.x, (1 - projected.y) * 0.5 * height - a.y) / 10;
    };
    const place = (node, x, y, lift, baseScale) => {
      const p = project(x, y, lift);
      const hidden = p.z > 1 || p.x < -80 || p.y < -80 || p.x > width + 80 || p.y > height + 80;
      node.style.display = hidden ? 'none' : '';
      if (hidden) return;
      const k = Math.max(0.46, Math.min(1.05, pixelsPerUnit(x, y) * baseScale));
      node.setAttribute('transform', `translate(${p.x.toFixed(1)},${p.y.toFixed(1)}) scale(${k.toFixed(3)})`);
    };
    const updateOverlay = () => {
      // Издалека названия областей сливаются в кашу: остаются герб и ценность, имя — при приближении.
      svg.classList.toggle('kd-far', pixelsPerUnit(CX, CY) < 0.62);
      for (const [id, group] of areaGroups) {
        const p = pos.get(id);
        if (p) place(group, p.x, p.y, 6, 1);
      }
      for (const line of edgeLines) {
        const a = pos.get(line.dataset.a); const b = pos.get(line.dataset.b);
        if (!a || !b) continue;
        const pa = project(a.x, a.y, 4); const pb = project(b.x, b.y, 4);
        line.setAttribute('x1', pa.x.toFixed(1)); line.setAttribute('y1', pa.y.toFixed(1));
        line.setAttribute('x2', pb.x.toFixed(1)); line.setAttribute('y2', pb.y.toFixed(1));
      }
      for (const group of regionGroups) {
        const text = group.querySelector('text');
        if (!text?.dataset.wx) continue;
        place(group, Number(text.dataset.wx), Number(text.dataset.wy), 20, 1.1);
      }
      svg.querySelectorAll('[data-token]').forEach((token) => {
        const wx = Number(token.dataset.wx); const wy = Number(token.dataset.wy);
        if (Number.isFinite(wx) && Number.isFinite(wy)) place(token, wx, wy, 10, 1);
      });
    };

    // ————————————————————————————————————————— состояние областей → карта

    const GLOW = {
      resolving: new THREE.Color(0xff5a3c).multiplyScalar(0.34),
      selected: new THREE.Color(0xffffff).multiplyScalar(0.22),
      eligible: new THREE.Color(0xffd36e).multiplyScalar(0.2),
      focus: new THREE.Color(0xffd36e).multiplyScalar(0.24),
      none: new THREE.Color(0, 0, 0),
    };
    let lastSignature = '';
    let lastStates = new Map();
    const readAreaState = () => {
      const states = new Map();
      for (const [id, group] of areaGroups) {
        const owner = group.style.getPropertyValue('--owner').trim();
        const cls = group.classList;
        const glow = cls.contains('is-resolving') ? 'resolving' : cls.contains('is-selected') ? 'selected'
          : cls.contains('is-demo-focus') ? 'focus' : cls.contains('is-eligible') ? 'eligible' : 'none';
        const fortify = group.querySelectorAll('[data-fortify] circle').length;
        states.set(id, { owner, neutral: cls.contains('is-neutral'), mine: cls.contains('is-mine'), glow, fortify });
      }
      return states;
    };
    const applyAreaState = () => {
      const states = readAreaState();
      lastStates = states;
      const signature = [...states].map(([id, s]) => `${id}:${s.owner}:${s.neutral}:${s.mine}:${s.glow}:${s.fortify}`).join('|');
      if (signature === lastSignature) return false;
      lastSignature = signature;
      const perArea = world.sites.map((site) => {
        const s = states.get(site.id) || { owner: '', neutral: true, glow: 'none' };
        const ownerColor = new THREE.Color(s.neutral || !s.owner ? '#d8d2c4' : s.owner);
        const tint = ownerColor.clone().convertSRGBToLinear();
        return { s, ownerColor, tint, strength: s.neutral ? 0 : s.mine ? 0.3 : 0.22, glow: GLOW[s.glow] };
      });
      for (let k = 0; k < vertexCount; k += 1) {
        const entry = perArea[areaOfVertex[k]];
        tints[k * 4] = entry.tint.r; tints[k * 4 + 1] = entry.tint.g; tints[k * 4 + 2] = entry.tint.b;
        tints[k * 4 + 3] = heightGrid[k] < 0.5 ? 0 : entry.strength;
        glows[k * 3] = entry.glow.r; glows[k * 3 + 1] = entry.glow.g; glows[k * 3 + 2] = entry.glow.b;
      }
      tintAttr.needsUpdate = true;
      glowAttr.needsUpdate = true;
      world.sites.forEach((site, i) => {
        const entry = perArea[i];
        const border = borders.get(site.id);
        border.color.copy(entry.ownerColor);
        border.emissive.copy(entry.glow).multiplyScalar(2.2);
        flags.get(site.id).color.copy(entry.s.neutral ? new THREE.Color('#efe9dc') : entry.ownerColor);
        setWalls(site.id, Math.min(4, entry.s.fortify || 0));
      });
      return true;
    };

    // ————————————————————————————————————————— кадр

    let frameRequested = false;
    let disposed = false;
    let frames = 0;
    function invalidate() {
      if (disposed || frameRequested) return;
      frameRequested = true;
      requestAnimationFrame(frame);
    }
    function frame(now) {
      frameRequested = false;
      if (disposed) return;
      if (!scroll.isConnected) { destroy(); return; }
      if (animation) {
        const t = Math.min(1, (now - animation.start) / animation.ms);
        const e = 1 - (1 - t) ** 3;
        for (const key of ['x', 'z', 'dist', 'tilt', 'yaw']) {
          if (animation.target[key] !== undefined) cam[key] = mix(animation.from[key], animation.target[key], e);
        }
        if (t >= 1) animation = null;
        else invalidate();
      }
      clampCam();
      setCamera();
      renderer.render(scene, camera);
      frames += 1;
      updateOverlay();
    }

    const sync = () => {
      collectOverlay();
      applyAreaState();
      invalidate();
    };

    // Классы областей меняются и вне перерисовки (раскрытие боя, обучение) — следим за ними.
    let syncQueued = false;
    const observer = new MutationObserver(() => {
      if (syncQueued) return;
      syncQueued = true;
      requestAnimationFrame(() => { syncQueued = false; if (!disposed) sync(); });
    });
    observer.observe(svg, { subtree: true, childList: true, attributes: true, attributeFilter: ['class', 'style', 'data-wx'] });
    const resizeObserver = new ResizeObserver(() => resize());
    resizeObserver.observe(scroll);

    function destroy() {
      if (disposed) return;
      disposed = true;
      observer.disconnect();
      resizeObserver.disconnect();
      scroll.removeEventListener('pointerdown', onDown);
      scroll.removeEventListener('pointermove', onMove);
      scroll.removeEventListener('pointerup', onUp);
      scroll.removeEventListener('pointercancel', onUp);
      scroll.removeEventListener('click', onClickCapture, true);
      scroll.removeEventListener('wheel', onWheel);
      scroll.removeEventListener('contextmenu', onContext);
      scene.traverse((node) => {
        if (node.isInstancedMesh) node.dispose?.();
      });
      for (const thing of disposables) thing.dispose?.();
      renderer.dispose();
      renderer.forceContextLoss?.();
      canvas.remove();
    }

    resize();
    fit(true);
    sync();
    const buildMs = Math.round(performance.now() - started);

    return {
      sync,
      fit: () => fit(false),
      zoom,
      zoomTo,
      destroy,
      invalidate,
      /** Для проверок: что нарисовано и сколько это стоит. */
      info: () => ({
        quality,
        frames,
        calls: renderer.info.render.calls,
        triangles: renderer.info.render.triangles,
        camera: { ...cam },
        size: { width, height },
        buildMs, marks,
        glowing: [...lastStates.values()].filter((s) => s.glow !== 'none').length,
        owned: [...lastStates.values()].filter((s) => !s.neutral).length,
        walls: [...walls.values()].reduce((sum, entry) => sum + Math.max(0, entry.count), 0),
      }),
      /** Для проверок: экранная точка центра области. */
      screenOf: (areaId) => {
        const p = pos.get(areaId);
        if (!p) return null;
        const rect = canvas.getBoundingClientRect();
        const s = project(p.x, p.y, 6);
        return { x: rect.left + s.x, y: rect.top + s.y };
      },
      /** Для проверок: какая область под точкой экрана. */
      areaAtScreen: (clientX, clientY) => {
        const point = groundAt(clientX, clientY);
        return point ? world.areaAt(point.x, point.y).id : null;
      },
    };
  }

  window.Kingdoms3D = { supported, load, mount, buildWorld };
})();
