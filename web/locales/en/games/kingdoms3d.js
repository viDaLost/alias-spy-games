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

  /*
    Поверхность земли. Цвет вершин задаёт местность, а всё, что делает её
    похожей на землю, досчитывается здесь для каждой точки экрана из мировых
    координат — поэтому вблизи узор мельче, а не расплывчатее:
      * крутые склоны — голая порода с пластами, а не трава, натянутая на скалу;
      * трава — пятнами разной спелости, с редкими полевыми цветами;
      * песок — рябью от ветра, поперёк склона дюны;
      * у воды — тёмная мокрая кромка;
      * мелкий рельеф — нормаль чуть сбита шумом, и свет ложится зернисто, как
        на настоящий грунт (на слабом качестве этого нет, чтобы не жечь кадр).
    Цвет владельца не заливает землю, а окрашивает её: светлое остаётся
    светлым, тёмное — тёмным, узор под цветом виден.
  */
  function terrainMaterial(THREE, pulse, quality = 'mid') {
    const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.93, metalness: 0 });
    if (quality !== 'low') material.defines = { KD_BUMP: '' };
    material.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>
          attribute vec4 aTint; attribute vec3 aGlow; attribute vec2 aFarm;
          varying vec4 vTint; varying vec3 vGlow; varying vec3 vWPos; varying vec2 vFarm; varying vec3 vNormalW;`)
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          vTint = aTint; vGlow = aGlow; vFarm = aFarm;
          vNormalW = normalize(mat3(modelMatrix) * objectNormal);
          vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;`);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>
          varying vec4 vTint; varying vec3 vGlow; varying vec3 vWPos; varying vec2 vFarm; varying vec3 vNormalW;
          uniform float uPulse;
          ${NOISE_GLSL}
          float kdFbm(vec2 p) { return kdNoise(p) * 0.55 + kdNoise(p * 2.03 + 7.1) * 0.3 + kdNoise(p * 4.11 + 3.3) * 0.15; }`)
        .replace('#include <color_fragment>', `#include <color_fragment>
          vec2 kdP = vWPos.xz;
          vec3 kdN = normalize(vNormalW);
          float kdSlope = 1.0 - kdN.y;
          float kdFine = kdNoise(kdP * 1.7);
          float kdMid = kdNoise(kdP * 0.38);
          float kdWide = kdNoise(kdP * 0.07);
          vec3 kdBase = diffuseColor.rgb;
          float kdLum = dot(kdBase, vec3(0.2126, 0.7152, 0.0722));
          bool kdGrass = kdBase.g > kdBase.r * 1.02 && kdBase.g > kdBase.b * 1.3;
          bool kdSand = kdBase.r > kdBase.g * 1.18 && kdBase.b < kdBase.g * 0.8;
          diffuseColor.rgb *= 0.8 + 0.12 * kdFine + 0.2 * kdMid + 0.1 * kdWide;
          if (kdGrass) {
            // Трава пятнами: где сочнее, где выгорела, и редкие цветы.
            float kdPatch = kdFbm(kdP * 0.16);
            diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.18, 1.05, 0.62), smoothstep(0.55, 0.8, kdPatch) * 0.55);
            diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.62, 0.8, 0.6), smoothstep(0.45, 0.2, kdPatch) * 0.5);
            vec2 kdCellF = floor(kdP * 1.3);
            float kdFlower = step(0.965, kdHash(kdCellF)) * smoothstep(0.35, 0.05, length(fract(kdP * 1.3) - 0.5));
            vec3 kdPetal = kdHash(kdCellF + 1.7) > 0.5 ? vec3(0.95, 0.85, 0.25) : vec3(0.92, 0.9, 0.95);
            diffuseColor.rgb = mix(diffuseColor.rgb, kdPetal, kdFlower * 0.85 * (1.0 - smoothstep(0.1, 0.3, kdSlope)));
          }
          if (kdSand) {
            // Рябь от ветра: полосы вдоль одного направления, слегка изогнутые шумом.
            float kdRipple = sin(dot(kdP, vec2(0.82, 0.57)) * 1.35 + kdFbm(kdP * 0.05) * 9.0);
            diffuseColor.rgb *= 0.95 + 0.07 * kdRipple;
          }
          // Голая порода на крутом: пласты и трещины, цвет камня, а не травы.
          float kdRock = smoothstep(0.2, 0.42, kdSlope + (kdFine - 0.5) * 0.12);
          float kdStrata = smoothstep(0.35, 0.65, kdNoise(vec2(kdP.x * 0.05 + kdP.y * 0.03, vWPos.y * 0.9)));
          vec3 kdStone = mix(vec3(0.22, 0.2, 0.18), vec3(0.4, 0.36, 0.31), kdStrata) * (0.8 + 0.35 * kdFine);
          diffuseColor.rgb = mix(diffuseColor.rgb, kdStone, kdRock * (kdSand ? 0.45 : 0.85));
          diffuseColor.rgb *= mix(1.0, 0.9 + 0.12 * kdStrata, smoothstep(18.0, 30.0, vWPos.y));
          // Мокрая кромка у воды.
          diffuseColor.rgb *= 1.0 - 0.28 * smoothstep(2.6, 0.4, vWPos.y) * step(-0.2, vWPos.y);
          if (vFarm.x > 0.01) {
            float kdC = cos(vFarm.y); float kdS = sin(vFarm.y);
            vec2 kdF = mat2(kdC, -kdS, kdS, kdC) * kdP / vec2(17.0, 11.0);
            vec2 kdCell = floor(kdF);
            float kdPick = kdHash(kdCell + 7.13);
            vec3 kdCrop = kdPick < 0.36 ? vec3(0.56, 0.43, 0.11) : kdPick < 0.68 ? vec3(0.16, 0.27, 0.05) : vec3(0.23, 0.13, 0.05);
            vec2 kdIn = fract(kdF);
            float kdEdge = smoothstep(0.0, 0.07, kdIn.x) * smoothstep(0.0, 0.07, 1.0 - kdIn.x)
              * smoothstep(0.0, 0.1, kdIn.y) * smoothstep(0.0, 0.1, 1.0 - kdIn.y);
            float kdFurrow = 0.86 + 0.14 * sin(kdF.x * 40.0 + kdPick * 6.0);
            float kdKeep = step(0.16, kdHash(kdCell + 3.7)) * smoothstep(0.25, 0.6, vFarm.x) * (1.0 - kdRock);
            diffuseColor.rgb = mix(diffuseColor.rgb, kdCrop * kdFurrow * (0.9 + 0.2 * kdFine), kdKeep * kdEdge * 0.8);
          }
          // Цвет владельца окрашивает землю, сохраняя её светотень.
          float kdShade = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));
          vec3 kdOwned = vTint.rgb * (0.45 + 1.6 * kdShade);
          diffuseColor.rgb = mix(diffuseColor.rgb, kdOwned, vTint.a);`)
        .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
          #ifdef KD_BUMP
            {
              // Мелкий рельеф грунта: наклон нормали по разности шума в соседних точках.
              float kdE = 0.45;
              vec2 kdQ = vWPos.xz * 0.55;
              float kdH0 = kdFbm(kdQ);
              float kdHx = kdFbm(kdQ + vec2(kdE, 0.0));
              float kdHz = kdFbm(kdQ + vec2(0.0, kdE));
              float kdAmp = 0.9 + 1.4 * smoothstep(0.15, 0.4, 1.0 - normalize(vNormalW).y);
              vec3 kdBumpW = vec3(-(kdHx - kdH0), 0.0, -(kdHz - kdH0)) / kdE * kdAmp;
              normal = normalize(normal + (viewMatrix * vec4(kdBumpW, 0.0)).xyz);
            }
          #endif`)
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
          totalEmissiveRadiance += vGlow * uPulse;`);
      shader.uniforms.uPulse = pulse;
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

  const M4 = (THREE, { x = 0, y = 0, z = 0, ry = 0, rx = 0, rz = 0, sx = 1, sy = 1, sz = 1 } = {}) => {
    const m = new THREE.Matrix4();
    m.compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)),
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
    renderer.toneMappingExposure = 1.04;
    renderer.shadowMap.enabled = quality !== 'low';
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.setClearColor(0x1d2927, 1);

    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0x1d2927, 1400, 2600);
    const camera = new THREE.PerspectiveCamera(34, 1, 5, 4000);

    /*
      Свет — как в «Земле обетованной»: тёплое солнце и мягкое небо. Солнце
      стоит низко на западе, чуть к северу: хребты отбрасывают тень к
      зрителю, склоны читаются объёмом, а не одним ровным тоном. С востока —
      холодная подсветка без теней, чтобы теневая сторона гор не проваливалась
      в черноту.
    */
    scene.add(new THREE.HemisphereLight(0xd6e6ff, 0x6b5a3a, 0.58));
    const sun = new THREE.DirectionalLight(0xffe4bd, 1.28);
    sun.position.set(-560, 520, -180);
    sun.castShadow = renderer.shadowMap.enabled;
    if (sun.castShadow) {
      const size = quality === 'high' ? 2048 : 1024;
      sun.shadow.mapSize.set(size, size);
      Object.assign(sun.shadow.camera, { left: -620, right: 620, top: 620, bottom: -620, near: 100, far: 1900 });
      sun.shadow.bias = -0.0006;
      sun.shadow.normalBias = 0.6;
    }
    scene.add(sun);
    const fill = new THREE.DirectionalLight(0xa9c2ff, 0.26);
    fill.position.set(520, 300, 380);
    scene.add(fill);
    scene.add(new THREE.AmbientLight(0xfff6e8, 0.1));

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
    const farms = new Float32Array(vertexCount * 2);
    const areaOfVertex = new Int16Array(vertexCount);
    const heightGrid = new Float32Array(vertexCount);
    /*
      Поля вокруг поселений равнины и побережья: кольцо пашни за околицей, не
      у самых домов и не у воды. Вес поля идёт в шейдер, а сам узор — полосы
      наделов разного цвета — рисуется попиксельно, поэтому и вблизи он резкий.
    */
    const farmWeight = (site, x, y, h) => {
      if (site.terrain !== 'plains' && site.terrain !== 'coast') return 0;
      const d = Math.hypot(x - site.town.x, y - site.town.y);
      return smooth(74, 50, d) * smooth(17, 27, d) * smooth(2.6, 4.2, h) * smooth(6, 14, world.riverDist(x, y));
    };
    const color = new THREE.Color();
    const tmp = new THREE.Color();
    for (let j = 0; j < rows; j += 1) {
      for (let i = 0; i < cols; i += 1) {
        const x = Math.min(MAP_W, i * STEP); const y = Math.min(MAP_H, j * STEP);
        const k = j * cols + i;
        const { h, home } = world.sample(x, y);
        heightGrid[k] = h;
        areaOfVertex[k] = home.index;
        farms[k * 2] = farmWeight(home, x, y, h);
        farms[k * 2 + 1] = (home.index * 0.61) % Math.PI;
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
    /*
      Затенение низин: вершина ниже своих соседей получает меньше неба —
      ущелья и подножия темнеют, гребни чуть светлеют. Считается один раз по
      сетке высот, в кадре ничего не стоит.
    */
    {
      const R = 3;
      for (let j = 0; j < rows; j += 1) {
        for (let i = 0; i < cols; i += 1) {
          const k = j * cols + i;
          const at = (di, dj) => heightGrid[Math.min(rows - 1, Math.max(0, j + dj)) * cols + Math.min(cols - 1, Math.max(0, i + di))];
          const around = (at(R, 0) + at(-R, 0) + at(0, R) + at(0, -R) + at(R, R) + at(-R, -R) + at(R, -R) + at(-R, R)) / 8;
          const d = around - heightGrid[k];
          const shade = d > 0 ? 1 - Math.min(0.34, d * 0.028) : 1 + Math.min(0.08, -d * 0.006);
          colors[k * 3] *= shade; colors[k * 3 + 1] *= shade; colors[k * 3 + 2] *= shade;
        }
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
    terrainGeo.setAttribute('aFarm', new THREE.BufferAttribute(farms, 2));
    terrainGeo.setIndex(new THREE.BufferAttribute(indices, 1));
    terrainGeo.computeVertexNormals();
    mark('terrain');
    const pulse = { value: 1 };
    const terrainMat = keep(terrainMaterial(THREE, pulse, quality));
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

      /*
        Стол под диорамой, как доска «Земли обетованной» стоит на земле: карта —
        предмет, а не картинка в пустоте. Дерево рисуется один раз на холсте и
        повторяется; вдали стол уходит в дымку того же цвета, что и фон.
      */
      const wood = document.createElement('canvas');
      wood.width = 256; wood.height = 256;
      const g = wood.getContext('2d');
      g.fillStyle = '#3a2a1d';
      g.fillRect(0, 0, 256, 256);
      const grain = rng(77);
      for (let i = 0; i < 140; i += 1) {
        const y = grain() * 256;
        g.strokeStyle = `rgba(${grain() > 0.5 ? '20,12,6' : '96,70,44'},${0.12 + grain() * 0.2})`;
        g.lineWidth = 0.6 + grain() * 2.2;
        g.beginPath();
        g.moveTo(0, y);
        for (let x = 0; x <= 256; x += 16) g.lineTo(x, y + Math.sin(x * 0.03 + i) * 3 + (grain() - 0.5) * 1.5);
        g.stroke();
      }
      for (let i = 0; i < 4; i += 1) {
        g.fillStyle = 'rgba(0,0,0,0.25)';
        g.fillRect(0, i * 64, 256, 1.5);
      }
      const woodMap = keep(new THREE.CanvasTexture(wood));
      woodMap.wrapS = woodMap.wrapT = THREE.RepeatWrapping;
      woodMap.repeat.set(8, 8);
      woodMap.encoding = THREE.sRGBEncoding;
      woodMap.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
      const table = new THREE.Mesh(keep(new THREE.PlaneGeometry(MAP_W * 7, MAP_H * 7)),
        keep(new THREE.MeshStandardMaterial({ map: woodMap, roughness: 0.72, metalness: 0.02 })));
      table.rotation.x = -Math.PI / 2;
      table.position.y = -48.2;
      table.receiveShadow = renderer.shadowMap.enabled;
      scene.add(table);
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

    // ——— рубежи: свой край и земля, которую можно взять ———
    /*
      Граница своего царства — не цвет ленточки, а светящийся рубеж: по
      внешнему краю своих земель поднимается полупрозрачная стена света цвета
      царства, яркая у земли и тающая кверху. Внутренние границы между своими
      областями её не получают — видно одно целое, а не лоскуты.

      Пока выбран приказ, земли, куда он может пойти, обведены таким же
      рубежом, только золотым и дышащим; свои области-источники — светлым.
      Дыхание идёт только пока приказ выбран, и не идёт вовсе, если человек
      просил систему не двигать интерфейс.
    */
    const fadeMap = (() => {
      const c = document.createElement('canvas');
      c.width = 4; c.height = 64;
      const g = c.getContext('2d');
      const grad = g.createLinearGradient(0, 0, 0, 64);
      grad.addColorStop(0, '#000');
      grad.addColorStop(0.4, '#4a4a4a');
      grad.addColorStop(0.72, '#c4c4c4');
      grad.addColorStop(0.84, '#fff');
      grad.addColorStop(1, '#fff');
      g.fillStyle = grad;
      g.fillRect(0, 0, 4, 64);
      return keep(new THREE.CanvasTexture(c));
    })();
    const curtainMat = (color, opacity) => keep(new THREE.MeshBasicMaterial({ color, alphaMap: fadeMap, transparent: true,
      opacity, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }));
    /*
      Рубеж из двух частей: стена света вдоль края, яркая у земли и тающая
      кверху, и полоса по самой земле, уходящая от края внутрь области. Сбоку
      читается стена, сверху — полоса; вместе край виден под любым наклоном.
    */
    const curtainGeo = (items, tall) => {
      const verts = []; const uvs = [];
      for (const { seg: [x1, y1, x2, y2], inner: [ix1, iy1, ix2, iy2] } of items) {
        const g1 = heightAt(x1, y1); const g2 = heightAt(x2, y2);
        if (g1 < 0.8 || g2 < 0.8) continue;
        const quad = [[x1, g1, y1, 0], [x2, g2, y2, 0], [x1, g1 + tall, y1, 1], [x2, g2, y2, 0], [x2, g2 + tall, y2, 1], [x1, g1 + tall, y1, 1]];
        for (const [x, h, y, v] of quad) { verts.push(x - CX, h + 0.3, y - CY); uvs.push(0, v); }
        const k1 = Math.max(heightAt(ix1, iy1), 0.8); const k2 = Math.max(heightAt(ix2, iy2), 0.8);
        const band = [[x1, g1, y1, 0.02], [x2, g2, y2, 0.02], [ix1, k1, iy1, 1], [x2, g2, y2, 0.02], [ix2, k2, iy2, 1], [ix1, k1, iy1, 1]];
        for (const [x, h, y, v] of band) { verts.push(x - CX, h + 0.9, y - CY); uvs.push(0, v); }
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(verts), 3));
      geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uvs), 2));
      return geo;
    };
    /** Отрезки контура области, мелко нарезанные и сдвинутые внутрь на inset. */
    const outline = (site, inset, band) => {
      const out = [];
      const poly = site.poly;
      for (let i = 0; i < poly.length; i += 1) {
        const [ax, ay] = poly[i]; const [bx, by] = poly[(i + 1) % poly.length];
        const steps = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / 4));
        for (let k = 0; k < steps; k += 1) {
          const p = [mix(ax, bx, k / steps), mix(ay, by, k / steps)];
          const q = [mix(ax, bx, (k + 1) / steps), mix(ay, by, (k + 1) / steps)];
          const pull = ([x, y], by) => {
            const dx = site.x - x; const dy = site.y - y; const len = Math.hypot(dx, dy) || 1;
            const step = Math.min(by, len * 0.5);
            return [x + (dx / len) * step, y + (dy / len) * step];
          };
          const mx = (p[0] + q[0]) / 2; const my = (p[1] + q[1]) / 2;
          const ox = mx - site.x; const oy = my - site.y; const ol = Math.hypot(ox, oy) || 1;
          out.push({ seg: [...pull(p, inset), ...pull(q, inset)], inner: [...pull(p, inset + band), ...pull(q, inset + band)],
            probe: [mx + (ox / ol) * 7, my + (oy / ol) * 7] });
        }
      }
      return out;
    };
    const outlines = new Map(world.sites.map((site) => [site.id, outline(site, 2.4, 18)]));
    const realm = { mesh: null, material: curtainMat(0xffffff, 1), key: '' };
    const setRealm = (mine, color) => {
      const key = `${[...mine].sort().join(',')}|${color}`;
      if (key === realm.key) return;
      realm.key = key;
      if (realm.mesh) { scene.remove(realm.mesh); realm.mesh.geometry.dispose(); realm.mesh = null; }
      if (!mine.size) return;
      const segments = [];
      for (const id of mine) {
        for (const item of outlines.get(id)) {
          const [px, py] = item.probe;
          const outside = px < 0 || py < 0 || px > MAP_W || py > MAP_H || !mine.has(world.areaAt(px, py).id);
          if (outside) segments.push(item);
        }
      }
      // Цвет царства, высветленный: рубеж светится, а не темнеет на траве.
      realm.material.color.set(color).lerp(new THREE.Color(0xffffff), 0.42).convertSRGBToLinear();
      realm.mesh = new THREE.Mesh(curtainGeo(segments, 14), realm.material);
      realm.mesh.renderOrder = 2;
      scene.add(realm.mesh);
    };
    const targetMat = curtainMat(0xffc23a, 0.9);
    const sourceMat = curtainMat(0xfff1d0, 0.5);
    const selectMat = curtainMat(0xffffff, 0.9);
    const clashMat = curtainMat(0xff5a3c, 0.9);
    const rims = new Map();
    const setRim = (id, material) => {
      let mesh = rims.get(id);
      if (!material) { if (mesh) mesh.visible = false; return; }
      if (!mesh) {
        mesh = new THREE.Mesh(keep(curtainGeo(outlines.get(id), 20)), material);
        mesh.renderOrder = 3;
        scene.add(mesh);
        rims.set(id, mesh);
      }
      mesh.material = material;
      mesh.visible = true;
    };
    const calm = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    let breathing = false;

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
    // ——— дороги, мосты и лодки ———
    /*
      Дороги идут по связям из правил: между поселениями соседних областей,
      по земле, чуть петляя. Там, где связь — брод, дорога спускается к реке и
      переходит её по мосту: брод на карте виден, а не угадывается. Дорога —
      тонкая лента по рельефу, всё вместе — один вызов отрисовки.
    */
    {
      const verts = [];
      const bridges = [];
      const road = (a, b, ford) => {
        const bend = (hash2(Math.round(a.x + b.y), Math.round(a.y + b.x)) - 0.5) * 0.35;
        const mx = (a.x + b.x) / 2 - (b.y - a.y) * bend; const my = (a.y + b.y) / 2 + (b.x - a.x) * bend;
        const len = Math.hypot(b.x - a.x, b.y - a.y);
        const steps = Math.max(4, Math.ceil(len / 4));
        const pts = [];
        for (let s = 0; s <= steps; s += 1) {
          const t = s / steps;
          const x = (1 - t) * (1 - t) * a.x + 2 * (1 - t) * t * mx + t * t * b.x;
          const y = (1 - t) * (1 - t) * a.y + 2 * (1 - t) * t * my + t * t * b.y;
          pts.push([x, y, heightAt(x, y)]);
        }
        let wetFrom = -1;
        for (let i = 0; i < pts.length - 1; i += 1) {
          const [x1, y1, g1] = pts[i]; const [x2, y2, g2] = pts[i + 1];
          const wet = g1 < 1.2 || g2 < 1.2;
          if (wet && wetFrom < 0) wetFrom = i;
          if (!wet && wetFrom >= 0) {
            if (ford) bridges.push([pts[Math.max(0, wetFrom - 1)], pts[Math.min(pts.length - 1, i + 1)]]);
            wetFrom = -1;
          }
          if (wet) continue;
          const l = Math.hypot(x2 - x1, y2 - y1) || 1;
          const nx = (-(y2 - y1) / l) * 1.6; const ny = ((x2 - x1) / l) * 1.6;
          const h1 = g1 + 0.45; const h2 = g2 + 0.45;
          for (const [x, h, y] of [[x1 - nx, h1, y1 - ny], [x2 - nx, h2, y2 - ny], [x1 + nx, h1, y1 + ny],
            [x2 - nx, h2, y2 - ny], [x2 + nx, h2, y2 + ny], [x1 + nx, h1, y1 + ny]]) verts.push(x - CX, h, y - CY);
        }
      };
      for (const edge of options.R.EDGES) {
        const a = world.byId.get(edge.a); const b = world.byId.get(edge.b);
        if (a && b) road(a.town, b.town, edge.type === 'ford');
      }
      const roadGeo = keep(new THREE.BufferGeometry());
      roadGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(verts), 3));
      roadGeo.computeVertexNormals();
      const roads = new THREE.Mesh(roadGeo, keep(new THREE.MeshStandardMaterial({ color: 0x957f5c, roughness: 1,
        side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 })));
      roads.receiveShadow = renderer.shadowMap.enabled;
      scene.add(roads);

      const parts = [];
      for (const [[x1, y1, g1], [x2, y2, g2]] of bridges) {
        const len = Math.hypot(x2 - x1, y2 - y1);
        const ry = -Math.atan2(y2 - y1, x2 - x1);
        const top = Math.max(g1, g2, 2) + 1.4;
        const mx = (x1 + x2) / 2 - CX; const mz = (y1 + y2) / 2 - CY;
        parts.push({ geometry: new THREE.BoxGeometry(len + 4, 1.4, 6.4), color: 0x8a6440, matrix: M4(THREE, { x: mx, y: top, z: mz, ry }) });
        for (const side of [-1, 1]) {
          parts.push({ geometry: new THREE.BoxGeometry(len + 4, 1.6, 0.6), color: 0x5e4129,
            matrix: M4(THREE, { x: mx + Math.sin(ry) * side * 3, y: top + 1.4, z: mz + Math.cos(ry) * side * 3, ry }) });
        }
        for (const t of [0.3, 0.7]) {
          parts.push({ geometry: new THREE.CylinderGeometry(0.7, 0.7, 8, 6), color: 0x4a3322,
            matrix: M4(THREE, { x: mix(x1, x2, t) - CX, y: top - 4, z: mix(y1, y2, t) - CY }) });
        }
      }
      // Лодки: на море вдоль северного края и на озере — место, где карта дышит.
      const random = rng(313);
      const boats = [];
      for (let tries = 0; boats.length < 9 && tries < 400; tries += 1) {
        const x = 40 + random() * (MAP_W - 80);
        const y = boats.length < 6 ? 6 + random() * 50 : CY - 45 + random() * 90;
        if (heightAt(x, y) > -4.5 || boats.some((b) => Math.hypot(b.x - x, b.y - y) < 60)) continue;
        boats.push({ x, y, r: random() * Math.PI * 2 });
      }
      for (const { x, y, r } of boats) {
        const bx = x - CX; const bz = y - CY; const by = SEA_LEVEL - 0.2;
        const hull = new THREE.CylinderGeometry(2.6, 1.6, 13, 6, 1, false, 0, Math.PI);
        parts.push({ geometry: hull, color: 0x6b4a2c, matrix: M4(THREE, { x: bx, y: by + 0.9, z: bz, rz: -Math.PI / 2, ry: r, sz: 0.8 }) });
        parts.push({ geometry: new THREE.CylinderGeometry(0.25, 0.3, 11, 4), color: 0x4a3322,
          matrix: M4(THREE, { x: bx, y: by + 6, z: bz, ry: r }) });
        parts.push({ geometry: new THREE.PlaneGeometry(7, 8), color: 0xf1e7d2,
          matrix: M4(THREE, { x: bx + Math.cos(r) * 0.4, y: by + 7, z: bz - Math.sin(r) * 0.4, ry: r }) });
      }
      if (parts.length) {
        const mesh = new THREE.Mesh(keep(mergeParts(THREE, parts)),
          keep(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, side: THREE.DoubleSide })));
        mesh.castShadow = renderer.shadowMap.enabled;
        scene.add(mesh);
      }
    }
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
          if (h < 2.2 || !clear(x, y) || world.riverDist(x, y) < 6 || farmWeight(site, x, y, h) > 0.2) continue;
          spots.push({ x, y, h, s: 0.75 + random() * 0.6, r: random() * Math.PI * 2 });
        }
        if (!spots.length) return;
        const { geometry, material } = build();
        const mesh = new THREE.InstancedMesh(geometry, material, spots.length);
        const m = new THREE.Matrix4();
        const tint = new THREE.Color();
        spots.forEach((spot, i) => {
          m.compose(new THREE.Vector3(spot.x - CX, spot.h - 0.4, spot.y - CY),
            new THREE.Quaternion().setFromEuler(new THREE.Euler(0, spot.r, 0)),
            new THREE.Vector3(spot.s, spot.s * (0.85 + random() * 0.35), spot.s));
          mesh.setMatrixAt(i, m);
          // Каждое дерево и камень чуть своего оттенка: лес не выглядит отштампованным.
          const shade = 0.78 + random() * 0.4;
          tint.setRGB(shade * (0.94 + random() * 0.12), shade, shade * (0.9 + random() * 0.14));
          mesh.setColorAt(i, tint);
        });
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
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

    // ————————————————————————————————————————— жетоны приказов

    /*
      Жетон приказа — объёмная фишка, как в настольной игре: толстая монета с
      ободком цвета царства. Сверху — рисунок приказа, у закрытого чужого
      приказа — рубашка. Поход и переправа лежат на полпути между областями,
      а над ними дугой идёт стрела от источника к цели: направление удара
      видно сразу, без чтения подписей.

      Раскрытие приказа — переворот фишки: она подпрыгивает и ложится лицом
      вверх. Пока идёт переворот, кадры рисуются; кончился — карта снова молчит.

      SVG-жетон остаётся поверх как прозрачная зона нажатия (разведка
      выбирает жетон нажатием) и носит бирку силы.
    */
    const ART = { closed: 'closed', feint: 'feint', ford2: 'ford', fortify: 'fortify', guard: 'guard', reveal: 'reveal', scout: 'scout' };
    const artFile = (kind) => `web/assets/kingdoms/orders/${kind.startsWith('march') ? 'march' : ART[kind] || 'closed'}.webp`;
    const images = new Map();
    const artImage = (file) => {
      if (!images.has(file)) {
        const image = new Image();
        image.decoding = 'async';
        image.onload = () => { for (const texture of faceTextures.values()) if (texture.userData.file === file) paintFace(texture); invalidate(); };
        image.src = file;
        images.set(file, image);
      }
      return images.get(file);
    };
    const faceTextures = new Map();
    const paintFace = (texture) => {
      const { canvas: face, file, ring, closed } = texture.userData;
      const g = face.getContext('2d');
      const size = face.width;
      g.clearRect(0, 0, size, size);
      const grad = g.createRadialGradient(size * 0.38, size * 0.32, size * 0.05, size / 2, size / 2, size / 2);
      grad.addColorStop(0, closed ? '#5d4a33' : '#fff8e4');
      grad.addColorStop(1, closed ? '#2e2418' : '#dcc592');
      g.fillStyle = grad;
      g.fillRect(0, 0, size, size);
      g.lineWidth = size * 0.07;
      g.strokeStyle = ring;
      g.beginPath(); g.arc(size / 2, size / 2, size * 0.46, 0, Math.PI * 2); g.stroke();
      g.lineWidth = size * 0.015;
      g.strokeStyle = closed ? '#d9b46b' : '#7a5a2c';
      g.beginPath(); g.arc(size / 2, size / 2, size * 0.39, 0, Math.PI * 2); g.stroke();
      const image = artImage(file);
      if (image.complete && image.naturalWidth) {
        const art = size * 0.62;
        g.drawImage(image, (size - art) / 2, (size - art) / 2, art, art);
      }
      texture.needsUpdate = true;
    };
    const faceTexture = (kind, ring) => {
      const key = `${kind || 'closed'}|${ring}`;
      if (!faceTextures.has(key)) {
        const face = document.createElement('canvas');
        face.width = face.height = 256;
        const texture = keep(new THREE.CanvasTexture(face));
        texture.encoding = THREE.sRGBEncoding;
        texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
        texture.userData = { canvas: face, file: artFile(kind || 'closed'), ring, closed: !kind };
        paintFace(texture);
        faceTextures.set(key, texture);
      }
      return faceTextures.get(key);
    };
    const COIN_R = 17;
    const coinGeo = keep(new THREE.CylinderGeometry(COIN_R, COIN_R * 1.04, 5, 48, 1));
    const tokenRoot = new THREE.Group();
    scene.add(tokenRoot);
    const tokens = new Map();
    const arrowFor = (fromId, toId, color) => {
      const a = pos.get(fromId); const b = pos.get(toId);
      if (!a || !b) return null;
      const ha = Math.max(heightAt(a.x, a.y), SEA_LEVEL) + 10;
      const hb = Math.max(heightAt(b.x, b.y), SEA_LEVEL) + 10;
      const start = new THREE.Vector3(a.x - CX, ha, a.y - CY);
      const end = new THREE.Vector3(b.x - CX, hb, b.y - CY);
      // Дуга не доходит до самого центра цели: наконечник ложится у маркера, а не на него.
      end.lerp(start, 0.16);
      start.lerp(end, 0.12);
      const lift = Math.max(ha, hb) + 26 + start.distanceTo(end) * 0.12;
      const control = start.clone().lerp(end, 0.5).setY(lift);
      const curve = new THREE.QuadraticBezierCurve3(start, control, end);
      const material = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.35,
        roughness: 0.4, transparent: true, opacity: 0.92 });
      const group = new THREE.Group();
      const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 28, 2.4, 8, false), material);
      tube.castShadow = renderer.shadowMap.enabled;
      group.add(tube);
      const head = new THREE.Mesh(new THREE.ConeGeometry(6.5, 15, 14), material);
      const tangent = curve.getTangent(1);
      head.position.copy(end).addScaledVector(tangent, 5);
      head.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), tangent);
      head.castShadow = renderer.shadowMap.enabled;
      group.add(head);
      group.userData.dispose = () => { tube.geometry.dispose(); head.geometry.dispose(); material.dispose(); };
      return group;
    };
    const readTokens = () => [...svg.querySelectorAll('[data-token]')].map((node) => ({
      node,
      id: node.dataset.token,
      kind: node.dataset.kind || '',
      area: node.dataset.from || '',
      to: node.dataset.to || '',
      wx: Number(node.dataset.wx), wy: Number(node.dataset.wy),
      color: node.style.getPropertyValue('--owner').trim() || '#94a3b8',
      scoutable: node.classList.contains('is-scoutable'),
      picked: node.classList.contains('is-picked'),
      focus: node.classList.contains('is-demo-focus'),
    }));
    let flipping = 0;
    const syncTokens = () => {
      const seen = new Set();
      for (const t of readTokens()) {
        if (!Number.isFinite(t.wx) || !Number.isFinite(t.wy)) continue;
        seen.add(t.id);
        let entry = tokens.get(t.id);
        const shape = `${t.color}|${t.area}|${t.to}`;
        if (entry && entry.shape !== shape) { removeToken(t.id); entry = null; }
        if (!entry) {
          const side = new THREE.MeshStandardMaterial({ color: t.color, metalness: 0.3, roughness: 0.45 });
          const top = new THREE.MeshStandardMaterial({ roughness: 0.55 });
          const bottom = new THREE.MeshStandardMaterial({ map: faceTexture('', t.color), roughness: 0.6 });
          const coin = new THREE.Mesh(coinGeo, [side, top, bottom]);
          coin.castShadow = renderer.shadowMap.enabled;
          const holder = new THREE.Group();
          holder.add(coin);
          const ground = Math.max(heightAt(t.wx, t.wy), SEA_LEVEL);
          holder.position.set(t.wx - CX, ground + 4, t.wy - CY);
          tokenRoot.add(holder);
          const arrow = t.area && t.to ? arrowFor(t.area, t.to, t.color) : null;
          if (arrow) tokenRoot.add(arrow);
          entry = { holder, coin, side, top, bottom, arrow, shape, kind: null, flip: null, x: t.wx, y: t.wy };
          tokens.set(t.id, entry);
        }
        if (entry.kind !== t.kind) {
          const wasClosed = entry.kind === '';
          entry.top.map = faceTexture(t.kind, t.color);
          entry.top.needsUpdate = true;
          // Закрытый стал открытым — фишка переворачивается у всех на глазах.
          if (wasClosed && t.kind) { entry.flip = { start: performance.now() }; flipping += 1; }
          entry.kind = t.kind;
        }
        const glow = t.picked ? 0x1f9d55 : t.scoutable || t.focus ? 0xb8862b : 0x000000;
        entry.side.emissive.setHex(glow);
        entry.top.emissive.setHex(glow);
        entry.side.emissiveIntensity = entry.top.emissiveIntensity = glow ? 0.55 : 0;
      }
      for (const id of [...tokens.keys()]) if (!seen.has(id)) removeToken(id);
    };
    function removeToken(id) {
      const entry = tokens.get(id);
      if (!entry) return;
      tokenRoot.remove(entry.holder);
      entry.side.dispose(); entry.top.dispose(); entry.bottom.dispose();
      if (entry.arrow) { tokenRoot.remove(entry.arrow); entry.arrow.userData.dispose(); }
      if (entry.flip) flipping -= 1;
      tokens.delete(id);
    }
    /** Кадр жетонов: переворот раскрытых и размер, читаемый издалека. */
    const stepTokens = (now) => {
      for (const entry of tokens.values()) {
        // Издалека фишка не меньше пальца на экране: ниже этого она подрастает.
        const ppu = pixelsPerUnit(entry.x, entry.y);
        const grow = Math.max(1, Math.min(3.2, 11 / Math.max(0.01, ppu * COIN_R)));
        entry.holder.scale.setScalar(grow);
        if (entry.flip) {
          const t = Math.min(1, (now - entry.flip.start) / 650);
          entry.coin.rotation.x = Math.PI * (1 - t);
          entry.coin.position.y = Math.sin(Math.PI * t) * 22;
          if (t >= 1) { entry.flip = null; flipping -= 1; entry.coin.rotation.x = 0; entry.coin.position.y = 0; }
        }
      }
      return flipping > 0;
    };

    // ————————————————————————————————————————— камера и управление

    const cam = { x: 0, z: 30, dist: 1200, tilt: 0.55, yaw: 0 };
    let limits = { maxDist: 1600, minDist: 170, ready: false };
    const setCamera = () => {
      const sinT = Math.sin(cam.tilt);
      camera.position.set(cam.x + cam.dist * sinT * Math.sin(cam.yaw), cam.dist * Math.cos(cam.tilt),
        cam.z + cam.dist * sinT * Math.cos(cam.yaw));
      camera.lookAt(cam.x, 8, cam.z);
      camera.updateMatrixWorld();
    };
    const clampCam = () => {
      cam.tilt = Math.max(0.3, Math.min(1.15, cam.tilt));
      cam.dist = Math.max(limits.minDist, Math.min(limits.maxDist, cam.dist));
      cam.x = Math.max(-MAP_W / 2, Math.min(MAP_W / 2, cam.x));
      cam.z = Math.max(-MAP_H / 2, Math.min(MAP_H / 2, cam.z));
    };

    let width = 1; let height = 1;
    /*
      Свободное окно карты. Поверх холста лежат плашки: сверху — раунд и счёт,
      снизу стоймя или справа боком — рука с жетонами. Карта вписывается не во
      весь холст, а в то, что между ними открыто, и её середина стоит в
      середине этого окна: иначе половина земли пряталась бы под рукой.
    */
    let insets = { top: 0, bottom: 0, left: 0, right: 0 };
    let atHome = true;
    const applyOffset = () => {
      const offX = Math.round((insets.right - insets.left) / 2);
      const offY = Math.round((insets.bottom - insets.top) / 2);
      if (offX || offY) camera.setViewOffset(width, height, offX, offY, width, height);
      else camera.clearViewOffset();
      camera.updateProjectionMatrix();
    };
    const resize = () => {
      const rect = scroll.getBoundingClientRect();
      width = Math.max(1, Math.round(rect.width)); height = Math.max(1, Math.round(rect.height));
      renderer.setSize(width, height, false);
      canvas.style.width = `${width}px`; canvas.style.height = `${height}px`;
      camera.aspect = width / height;
      applyOffset();
      svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
      if (atHome && limits.ready) fit(true);
      invalidate();
    };
    const setInsets = (next) => {
      const clean = { top: 0, bottom: 0, left: 0, right: 0, ...next };
      for (const key of Object.keys(clean)) clean[key] = Math.max(0, Math.round(clean[key] || 0));
      if (Object.keys(clean).every((key) => Math.abs(clean[key] - insets[key]) < 2)) return;
      insets = clean;
      applyOffset();
      if (atHome) fit(true);
      invalidate();
    };

    /** Дистанция, на которой вся карта входит в кадр при нынешнем наклоне и повороте. */
    const fitDistance = () => {
      // Углы диорамы и по низу постамента, и по верху гор: в кадр входит вся коробка, а не только земля.
      const corners = [];
      for (const level of [-48, 30]) for (const [x, z] of [[-CX, -CY], [CX, -CY], [CX, CY], [-CX, CY]]) corners.push([x, level, z]);
      const v = new THREE.Vector3();
      let lo = 150; let hi = 6000;
      const saved = { ...cam };
      cam.x = 0; cam.z = 18;
      for (let i = 0; i < 26; i += 1) {
        cam.dist = (lo + hi) / 2;
        setCamera();
        // Свободное окно в координатах кадра: слева-справа и снизу-сверху, с полями в 3–4 %.
        let x0 = -1 + (2 * insets.left) / width; let x1 = 1 - (2 * insets.right) / width;
        let y0 = -1 + (2 * insets.bottom) / height; let y1 = 1 - (2 * insets.top) / height;
        // Плашки закрыли почти всё — вписываем в весь кадр, а не в щель.
        if (x1 - x0 < 0.4) { x0 = -1; x1 = 1; }
        if (y1 - y0 < 0.4) { y0 = -1; y1 = 1; }
        const mx = Math.max(0.02, (x1 - x0) * 0.03); const my = Math.max(0.02, (y1 - y0) * 0.04);
        const fits = corners.every(([x, y, z]) => {
          v.set(x, y, z).project(camera);
          return v.x >= x0 + mx && v.x <= x1 - mx && v.y >= y0 + my && v.y <= y1 - my;
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
    /*
      Наклон по тому, как держат телефон. Стоймя экран узкий и высокий: карта
      упирается в ширину, а по высоте остаётся место — камера поднимается и
      смотрит почти сверху, и карта занимает высоту. Боком наоборот: камера
      ниже, рельеф видно в профиль.
    */
    const homeTilt = () => {
      const w = width - insets.left - insets.right;
      const h = height - insets.top - insets.bottom;
      const ratio = w / Math.max(1, h);
      return ratio < 0.9 ? 0.5 : ratio > 2.6 ? 1.02 : ratio > 1.6 ? 0.86 : 0.62;
    };
    const fit = (instant = false) => {
      const target = { x: 0, z: 10, tilt: homeTilt(), yaw: 0 };
      const saved = { ...cam };
      Object.assign(cam, target);
      const dist = fitDistance();
      Object.assign(cam, saved);
      limits = { maxDist: dist * 1.12, minDist: 170, ready: true };
      // Дымка и дальний край кадра — от расстояния, на котором карта видна целиком:
      // стоймя камера отходит вдвое дальше, чем боком, и прежняя дымка съедала землю.
      scene.fog.near = dist + 700;
      scene.fog.far = dist * 1.6 + 1500;
      camera.far = dist * 4;
      camera.updateProjectionMatrix();
      target.dist = dist;
      atHome = true;
      if (instant) { Object.assign(cam, target); animation = null; invalidate(); }
      else animateTo(target);
    };
    /** Подлететь к области: она в середине свободного окна, крупно и под удобным наклоном. */
    const focusArea = (areaId, scale = 2.4) => {
      const p = pos.get(areaId);
      if (!p) return;
      atHome = false;
      clampCam();
      animateTo({ x: p.x - CX, z: p.y - CY, tilt: Math.max(cam.tilt, 0.62),
        dist: Math.max(limits.minDist, (limits.maxDist / 1.12) / scale) }, 420);
    };
    const zoomTo = (scale) => {
      atHome = false;
      clampCam();
      animateTo({ ...cam, dist: Math.max(limits.minDist, Math.min(limits.maxDist, (limits.maxDist / 1.12) / Math.max(0.5, scale))) }, 300);
    };
    const zoom = (factor) => {
      atHome = false;
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
      Карта слушается пальца так же, как доска «Земли обетованной», — как
      модель на столе. Один палец её поворачивает и наклоняет: повёл вправо —
      карта повернулась вслед за пальцем, повёл вниз — камера поднялась и
      смотрит сверху. Два пальца: развёл — приблизил, повёл оба — сдвинул
      карту, и точка под пальцами остаётся под ними. Прежде один палец таскал
      карту, а поворот жил на двух пальцах, — по отзыву это ощущалось «наоборот».

      Нажатие отличается от поворота порогом: палец, проехавший меньше восьми
      точек, — это нажатие по области. Мышью: левая кнопка — поворот, правая
      или с Shift — сдвиг, колесо — приближение.
    */
    const TURN = 0.0055;
    const LIFT = 0.005;
    const pointers = new Map();
    let lastTap = null;
    let gesture = null;
    let suppressClick = false;
    let dragEndedAt = -Infinity;
    const midpoint = (pts) => (pts.length >= 2 ? { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 } : pts[0]);
    const snapshot = () => {
      const pts = [...pointers.values()];
      const center = midpoint(pts);
      gesture = {
        count: pts.length, center, moved: gesture?.moved && pts.length > 0 ? true : false,
        distance: pts.length >= 2 ? Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) : 0,
        cam: { ...cam },
        anchor: planeAt(center.x, center.y, 8),
        button: gesture?.button ?? 0,
        target: gesture?.target,
      };
    };
    const onDown = (event) => {
      if (event.pointerType === 'mouse' && event.button !== 0 && event.button !== 2) return;
      animation = null;
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (pointers.size <= 2) {
        if (pointers.size === 1) gesture = null;
        snapshot();
        if (pointers.size === 1) {
          gesture.button = event.button;
          gesture.target = event.target;
        } else {
          gesture.moved = true; atHome = false;
          suppressClick = true;
        }
      }
    };
    /** Сдвиг карты так, чтобы схваченная точка осталась под экранной точкой. */
    const keepAnchor = (screen) => {
      Object.assign(cam, { x: gesture.cam.x, z: gesture.cam.z });
      setCamera();
      const now = planeAt(screen.x, screen.y, 8);
      if (now && gesture.anchor) {
        cam.x = gesture.cam.x + (gesture.anchor.x - now.x);
        cam.z = gesture.cam.z + (gesture.anchor.z - now.z);
      }
    };
    const onMove = (event) => {
      if (!pointers.has(event.pointerId) || !gesture) return;
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      const pts = [...pointers.values()];
      const center = midpoint(pts);
      const dx = center.x - gesture.center.x;
      const dy = center.y - gesture.center.y;
      if (!gesture.moved && pts.length === 1 && Math.hypot(dx, dy) < 8) return;
      if (!gesture.moved) {
        gesture.moved = true; suppressClick = true; atHome = false;
        try { scroll.setPointerCapture(event.pointerId); } catch { /* палец уже отпущен */ }
      }
      if (pts.length === 1 && (gesture.button === 2 || event.shiftKey)) {
        keepAnchor(center);
      } else if (pts.length === 1) {
        cam.yaw = gesture.cam.yaw - dx * TURN;
        cam.tilt = gesture.cam.tilt - dy * LIFT;
      } else if (pts.length === 2) {
        const distance = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
        cam.dist = gesture.cam.dist * Math.max(1, gesture.distance) / Math.max(1, distance);
        clampCam();
        keepAnchor(center);
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
      /*
        Клик, который браузер шлёт следом за отпусканием пальца после поворота,
        глушится по времени самого события, а не таймером: на тяжёлом кадре
        таймер срабатывал с опозданием и съедал следующее, настоящее нажатие.
      */
      if (suppressClick && !pointers.size) { dragEndedAt = event.timeStamp; suppressClick = false; }
      // Нажатие по самой карте (не по маркеру, жетону или связи — у них свои обработчики).
      if (wasTap && (target === canvas || target === svg || target?.classList?.contains('kd-3d-hit'))) {
        const point = groundAt(event.clientX, event.clientY);
        if (point && point.x >= 0 && point.x <= MAP_W && point.y >= 0 && point.y <= MAP_H) {
          const areaId = world.areaAt(point.x, point.y).id;
          // Второе нажатие по той же области подряд — подлететь к ней, как двойной тап на картах.
          const now = performance.now();
          if (lastTap && lastTap.id === areaId && now - lastTap.at < 360) { focusArea(areaId); lastTap = null; return; }
          lastTap = { id: areaId, at: now };
          onTap?.(areaId);
        }
      }
    };
    const onClickCapture = (event) => {
      if (!suppressClick && event.timeStamp - dragEndedAt > 250) return;
      event.preventDefault(); event.stopImmediatePropagation(); dragEndedAt = -Infinity;
    };
    const onWheel = (event) => {
      event.preventDefault();
      animation = null;
      atHome = false;
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
    // Точка за спиной камеры проецируется зеркально — в небо над картой; её прячем.
    const viewPoint = new THREE.Vector3();
    const behind = (x, y, lift) => viewPoint.set(x - CX, Math.max(heightAt(x, y), SEA_LEVEL) + lift, y - CY)
      .applyMatrix4(camera.matrixWorldInverse).z > -camera.near;
    const place = (node, x, y, lift, baseScale) => {
      const p = project(x, y, lift);
      const hidden = behind(x, y, lift) || p.z > 1 || p.x < -80 || p.y < -80 || p.x > width + 80 || p.y > height + 80;
      node.style.display = hidden ? 'none' : '';
      if (hidden) return;
      const k = Math.max(0.32, Math.min(1.05, pixelsPerUnit(x, y) * baseScale));
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
        return { s, ownerColor, tint, strength: s.neutral ? 0 : s.mine ? 0.5 : 0.42, glow: GLOW[s.glow] };
      });
      for (let k = 0; k < vertexCount; k += 1) {
        const entry = perArea[areaOfVertex[k]];
        tints[k * 4] = entry.tint.r; tints[k * 4 + 1] = entry.tint.g; tints[k * 4 + 2] = entry.tint.b;
        tints[k * 4 + 3] = heightGrid[k] < 0.5 ? 0 : entry.strength;
        glows[k * 3] = entry.glow.r; glows[k * 3 + 1] = entry.glow.g; glows[k * 3 + 2] = entry.glow.b;
      }
      tintAttr.needsUpdate = true;
      glowAttr.needsUpdate = true;
      const mine = new Set([...states].filter(([, s]) => s.mine).map(([id]) => id));
      const myColor = [...states.values()].find((s) => s.mine)?.owner || '#ffffff';
      setRealm(mine, myColor);
      breathing = false;
      for (const [id, s] of states) {
        const material = s.glow === 'resolving' ? clashMat : s.glow === 'selected' ? selectMat
          : s.glow === 'eligible' || s.glow === 'focus' ? (s.mine ? sourceMat : targetMat) : null;
        setRim(id, material);
        if (material === targetMat || material === sourceMat) breathing = true;
      }
      if (!breathing || calm) { pulse.value = 1; targetMat.opacity = 0.9; sourceMat.opacity = 0.55; }
      world.sites.forEach((site, i) => {
        const entry = perArea[i];
        const border = borders.get(site.id);
        // Ничья кромка — межа из тёмной земли и камня, а не белая разметка; чужая и своя — в цвет хозяина.
        border.color.copy(entry.s.neutral ? new THREE.Color('#6e5d47') : entry.ownerColor);
        border.emissive.copy(entry.glow).multiplyScalar(2.2);
        // Лента по кромке горит цветом хозяина: своя — ярче, чужая — заметно, нейтральная — нет.
        if (!entry.s.neutral && entry.glow === GLOW.none) {
          border.emissive.copy(entry.ownerColor).convertSRGBToLinear().multiplyScalar(entry.s.mine ? 0.55 : 0.32);
        }
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
      if (stepTokens(now)) invalidate();
      if (breathing && !calm) {
        const wave = 0.5 + 0.5 * Math.sin(now * 0.0042);
        pulse.value = 0.55 + 0.75 * wave;
        targetMat.opacity = 0.55 + 0.45 * wave;
        sourceMat.opacity = 0.35 + 0.3 * wave;
        invalidate();
      }
      renderer.render(scene, camera);
      frames += 1;
      updateOverlay();
    }

    const sync = () => {
      collectOverlay();
      applyAreaState();
      syncTokens();
      invalidate();
    };

    // Классы областей меняются и вне перерисовки (раскрытие боя, обучение) — следим за ними.
    let syncQueued = false;
    const observer = new MutationObserver(() => {
      if (syncQueued) return;
      syncQueued = true;
      requestAnimationFrame(() => { syncQueued = false; if (!disposed) sync(); });
    });
    observer.observe(svg, { subtree: true, childList: true, attributes: true, attributeFilter: ['class', 'style', 'data-wx', 'data-kind'] });
    const resizeObserver = new ResizeObserver(() => resize());
    resizeObserver.observe(scroll);

    function destroy() {
      if (disposed) return;
      disposed = true;
      try { options.onDestroy?.(); } catch { /* уборка экрана — не повод ронять уборку сцены */ }
      observer.disconnect();
      resizeObserver.disconnect();
      scroll.removeEventListener('pointerdown', onDown);
      scroll.removeEventListener('pointermove', onMove);
      scroll.removeEventListener('pointerup', onUp);
      scroll.removeEventListener('pointercancel', onUp);
      scroll.removeEventListener('click', onClickCapture, true);
      scroll.removeEventListener('wheel', onWheel);
      scroll.removeEventListener('contextmenu', onContext);
      for (const id of [...tokens.keys()]) removeToken(id);
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
      focusArea,
      setInsets,
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
        tokens: tokens.size,
        arrows: [...tokens.values()].filter((entry) => entry.arrow).length,
        glowing: [...lastStates.values()].filter((s) => s.glow !== 'none').length,
        owned: [...lastStates.values()].filter((s) => !s.neutral).length,
        walls: [...walls.values()].reduce((sum, entry) => sum + Math.max(0, entry.count), 0),
        realm: realm.mesh ? realm.mesh.geometry.attributes.position.count / 6 : 0,
        rims: [...rims.values()].filter((mesh) => mesh.visible).length,
        breathing: breathing && !calm,
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
