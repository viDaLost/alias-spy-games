/**
 * Moses Nile — процедурная PBR-библиотека «Нил».
 *
 * Библиотека без собственного цикла рендера: собирает текстуры, материалы и
 * освещение окружением. Кадр по-прежнему запускает только game-v75.js.
 *
 * Каждая поверхность рисуется на канвасе нативными операциями (быстро даже на
 * телефоне), после чего из яркости пикселей выводятся карта нормалей и карта
 * шероховатости. Затенение впадин домножается прямо в albedo, поэтому второй
 * набор UV для aoMap не нужен.
 */
(() => {
  'use strict';

  const THREE = window.THREE;
  if (!THREE) { window.NileMaterials = null; return; }

  const surfaceCache = new Map();
  const materialCache = new Map();
  let renderer = null;
  let environment = null;
  let anisotropy = 4;

  const clamp01 = (value) => (value < 0 ? 0 : value > 1 ? 1 : value);
  const lerp = (a, b, t) => a + (b - a) * t;

  function rng(seed) {
    let state = (seed * 2654435761) >>> 0;
    return () => {
      state ^= state << 13; state >>>= 0;
      state ^= state >> 17;
      state ^= state << 5; state >>>= 0;
      return state / 4294967296;
    };
  }

  function makeCanvas(size) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    return canvas;
  }

  /** Мягкие пятна крупного масштаба: маленький шум, растянутый со сглаживанием. */
  function paintCloudNoise(ctx, size, { cells = 8, alpha = .5, seed = 1, light = '#ffffff', dark = '#000000' } = {}) {
    const random = rng(seed);
    const small = makeCanvas(cells);
    const smallCtx = small.getContext('2d');
    const image = smallCtx.createImageData(cells, cells);
    for (let i = 0; i < cells * cells; i += 1) {
      const value = Math.round(random() * 255);
      image.data[i * 4] = image.data[i * 4 + 1] = image.data[i * 4 + 2] = value;
      image.data[i * 4 + 3] = 255;
    }
    smallCtx.putImageData(image, 0, 0);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.globalCompositeOperation = 'overlay';
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(small, 0, 0, size, size);
    ctx.restore();
    void light; void dark;
  }

  /** Рисует фигуру во всех четырёх сдвигах, чтобы текстура стыковалась без шва. */
  function wrapped(ctx, size, x, y, radius, draw) {
    const shifts = [0];
    if (x < radius) shifts.push(size);
    if (x > size - radius) shifts.push(-size);
    const vertical = [0];
    if (y < radius) vertical.push(size);
    if (y > size - radius) vertical.push(-size);
    for (const dx of shifts) {
      for (const dy of vertical) {
        ctx.save();
        ctx.translate(x + dx, y + dy);
        draw(ctx);
        ctx.restore();
      }
    }
  }

  /** Карта нормалей по яркости: оператор Собеля с бесшовной адресацией. */
  function heightToNormal(pixels, size, strength) {
    const height = new Float32Array(size * size);
    for (let i = 0; i < size * size; i += 1) {
      height[i] = (pixels[i * 4] * .299 + pixels[i * 4 + 1] * .587 + pixels[i * 4 + 2] * .114) / 255;
    }
    const canvas = makeCanvas(size);
    const ctx = canvas.getContext('2d');
    const out = ctx.createImageData(size, size);
    const at = (x, y) => height[((y + size) % size) * size + ((x + size) % size)];
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const dx = (at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1))
          - (at(x - 1, y - 1) + 2 * at(x - 1, y) + at(x - 1, y + 1));
        const dy = (at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1))
          - (at(x - 1, y - 1) + 2 * at(x, y - 1) + at(x + 1, y - 1));
        let nx = -dx * strength;
        let ny = -dy * strength;
        const nz = 1;
        const length = Math.hypot(nx, ny, nz) || 1;
        nx /= length; ny /= length;
        const index = (y * size + x) * 4;
        out.data[index] = Math.round((nx * .5 + .5) * 255);
        out.data[index + 1] = Math.round((ny * .5 + .5) * 255);
        out.data[index + 2] = Math.round((1 / length * .5 + .5) * 255);
        out.data[index + 3] = 255;
      }
    }
    ctx.putImageData(out, 0, 0);
    return canvas;
  }

  /** Карта шероховатости: впадины держат влагу и блестят меньше выступов. */
  function heightToRoughness(pixels, size, base, spread, invert) {
    const canvas = makeCanvas(size);
    const ctx = canvas.getContext('2d');
    const out = ctx.createImageData(size, size);
    for (let i = 0; i < size * size; i += 1) {
      const luminance = (pixels[i * 4] * .299 + pixels[i * 4 + 1] * .587 + pixels[i * 4 + 2] * .114) / 255;
      const shaped = invert ? 1 - luminance : luminance;
      const value = Math.round(clamp01(base + (shaped - .5) * spread) * 255);
      out.data[i * 4] = out.data[i * 4 + 1] = out.data[i * 4 + 2] = value;
      out.data[i * 4 + 3] = 255;
    }
    ctx.putImageData(out, 0, 0);
    return canvas;
  }

  /** Домножает затенение впадин в albedo — дешёвая замена отдельной AO-карте. */
  function bakeCavityShading(ctx, size, amount) {
    const image = ctx.getImageData(0, 0, size, size);
    const data = image.data;
    const luminance = new Float32Array(size * size);
    for (let i = 0; i < size * size; i += 1) {
      luminance[i] = (data[i * 4] * .299 + data[i * 4 + 1] * .587 + data[i * 4 + 2] * .114) / 255;
    }
    const blurred = new Float32Array(size * size);
    const radius = 3;
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        let sum = 0;
        let count = 0;
        for (let k = -radius; k <= radius; k += 1) {
          sum += luminance[y * size + ((x + k + size) % size)];
          count += 1;
        }
        blurred[y * size + x] = sum / count;
      }
    }
    for (let x = 0; x < size; x += 1) {
      for (let y = 0; y < size; y += 1) {
        let sum = 0;
        let count = 0;
        for (let k = -radius; k <= radius; k += 1) {
          sum += blurred[((y + k + size) % size) * size + x];
          count += 1;
        }
        const cavity = clamp01(1 - (sum / count - luminance[y * size + x]) * amount * 6);
        const index = (y * size + x) * 4;
        data[index] = Math.round(data[index] * cavity);
        data[index + 1] = Math.round(data[index + 1] * cavity);
        data[index + 2] = Math.round(data[index + 2] * cavity);
      }
    }
    ctx.putImageData(image, 0, 0);
  }

  function toTexture(canvas, { repeat = 1, srgb = false }) {
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(repeat, repeat);
    texture.anisotropy = anisotropy;
    if (srgb && 'encoding' in texture) texture.encoding = THREE.sRGBEncoding;
    texture.needsUpdate = true;
    return texture;
  }

  /**
   * Собирает согласованный набор карт одной поверхности.
   * spec: { size, base, paint(ctx,size,random), normalStrength, roughness, roughnessSpread,
   *         roughnessInvert, cavity, repeat, seed }
   */
  function buildSurface(key, spec) {
    if (surfaceCache.has(key)) return surfaceCache.get(key);
    const size = spec.size || 256;
    const canvas = makeCanvas(size);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = spec.base || '#8a7355';
    ctx.fillRect(0, 0, size, size);
    spec.paint?.(ctx, size, rng(spec.seed || 7));
    const pixels = ctx.getImageData(0, 0, size, size).data;
    const normalCanvas = heightToNormal(pixels, size, spec.normalStrength ?? 2.4);
    const roughnessCanvas = heightToRoughness(pixels, size, spec.roughness ?? .82, spec.roughnessSpread ?? .5, spec.roughnessInvert ?? false);
    if (spec.cavity) bakeCavityShading(ctx, size, spec.cavity);
    const repeat = spec.repeat || 1;
    const surface = {
      map: toTexture(canvas, { repeat, srgb: true }),
      normalMap: toTexture(normalCanvas, { repeat }),
      roughnessMap: toTexture(roughnessCanvas, { repeat }),
    };
    surfaceCache.set(key, surface);
    return surface;
  }

  /* ------------------------------------------------------------------ */
  /* Рисовалки конкретных поверхностей                                   */
  /* ------------------------------------------------------------------ */

  function paintSandstone(ctx, size, random) {
    paintCloudNoise(ctx, size, { cells: 10, alpha: .55, seed: 21 });
    for (let i = 0; i < 26; i += 1) {
      const y = random() * size;
      const height = 3 + random() * 14;
      ctx.fillStyle = `rgba(${140 + random() * 60 | 0},${112 + random() * 46 | 0},${76 + random() * 34 | 0},${.10 + random() * .16})`;
      ctx.fillRect(0, y, size, height);
    }
    for (let i = 0; i < 2600; i += 1) {
      const x = random() * size;
      const y = random() * size;
      const radius = .5 + random() * 1.9;
      const shade = random() > .5 ? 232 : 96;
      ctx.fillStyle = `rgba(${shade},${shade * .9 | 0},${shade * .74 | 0},${.05 + random() * .18})`;
      wrapped(ctx, size, x, y, radius, (c) => { c.beginPath(); c.arc(0, 0, radius, 0, Math.PI * 2); c.fill(); });
    }
    for (let i = 0; i < 34; i += 1) {
      const x = random() * size;
      const y = random() * size;
      ctx.strokeStyle = `rgba(58,44,28,${.10 + random() * .18})`;
      ctx.lineWidth = .6 + random() * 1.3;
      wrapped(ctx, size, x, y, 26, (c) => {
        c.beginPath();
        c.moveTo(0, 0);
        c.quadraticCurveTo((random() - .5) * 22, (random() - .5) * 16, (random() - .5) * 44, (random() - .5) * 30);
        c.stroke();
      });
    }
  }

  function paintGranite(ctx, size, random) {
    paintCloudNoise(ctx, size, { cells: 12, alpha: .6, seed: 44 });
    for (let i = 0; i < 3400; i += 1) {
      const x = random() * size;
      const y = random() * size;
      const radius = .6 + random() * 2.6;
      const tint = random();
      const color = tint > .78 ? '236,229,214' : tint > .44 ? '118,108,94' : '74,66,56';
      ctx.fillStyle = `rgba(${color},${.08 + random() * .3})`;
      wrapped(ctx, size, x, y, radius, (c) => { c.beginPath(); c.arc(0, 0, radius, 0, Math.PI * 2); c.fill(); });
    }
    for (let i = 0; i < 16; i += 1) {
      const x = random() * size;
      const y = random() * size;
      ctx.strokeStyle = `rgba(42,38,32,${.16 + random() * .2})`;
      ctx.lineWidth = 1 + random() * 2.4;
      wrapped(ctx, size, x, y, 40, (c) => {
        c.beginPath();
        c.moveTo(-40, -20);
        c.bezierCurveTo(-10, (random() - .5) * 34, 12, (random() - .5) * 34, 44, 22);
        c.stroke();
      });
    }
  }

  function paintBark(ctx, size, random) {
    paintCloudNoise(ctx, size, { cells: 6, alpha: .42, seed: 63 });
    for (let i = 0; i < 190; i += 1) {
      const x = random() * size;
      const width = .8 + random() * 4.6;
      const shade = random() > .5 ? `rgba(${52 + random() * 34 | 0},${34 + random() * 24 | 0},${18 + random() * 16 | 0},` : `rgba(${168 + random() * 52 | 0},${128 + random() * 42 | 0},${82 + random() * 34 | 0},`;
      ctx.fillStyle = `${shade}${.10 + random() * .30})`;
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(x, 0);
      let cursor = x;
      for (let y = 0; y <= size; y += size / 6) {
        cursor += (random() - .5) * 6;
        ctx.lineTo(cursor, y);
      }
      ctx.lineTo(cursor + width, size);
      for (let y = size; y >= 0; y -= size / 6) {
        cursor += (random() - .5) * 4;
        ctx.lineTo(cursor + width, y);
      }
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    for (let i = 0; i < 900; i += 1) {
      const x = random() * size;
      const y = random() * size;
      ctx.fillStyle = `rgba(30,20,10,${.05 + random() * .16})`;
      wrapped(ctx, size, x, y, 2, (c) => { c.fillRect(-.5, -1.5, 1, 3); });
    }
  }

  function paintWetHide(ctx, size, random) {
    paintCloudNoise(ctx, size, { cells: 9, alpha: .5, seed: 91 });
    for (let i = 0; i < 3000; i += 1) {
      const x = random() * size;
      const y = random() * size;
      const radius = 1 + random() * 3.4;
      ctx.fillStyle = `rgba(${104 + random() * 44 | 0},${84 + random() * 34 | 0},${84 + random() * 34 | 0},${.05 + random() * .13})`;
      wrapped(ctx, size, x, y, radius, (c) => { c.beginPath(); c.ellipse(0, 0, radius, radius * .74, random() * Math.PI, 0, Math.PI * 2); c.fill(); });
    }
    for (let i = 0; i < 420; i += 1) {
      const x = random() * size;
      const y = random() * size;
      ctx.strokeStyle = `rgba(${188 + random() * 44 | 0},${150 + random() * 40 | 0},${146 + random() * 40 | 0},${.05 + random() * .14})`;
      ctx.lineWidth = .7 + random() * 1.4;
      wrapped(ctx, size, x, y, 12, (c) => {
        c.beginPath();
        c.arc(0, 0, 2 + random() * 8, random() * 6, random() * 6 + 1.4);
        c.stroke();
      });
    }
    for (let i = 0; i < 26; i += 1) {
      const x = random() * size;
      const y = random() * size;
      const radius = 4 + random() * 11;
      ctx.fillStyle = `rgba(64,48,46,${.04 + random() * .07})`;
      wrapped(ctx, size, x, y, radius, (c) => { c.beginPath(); c.ellipse(0, 0, radius, radius * .68, random() * 3, 0, Math.PI * 2); c.fill(); });
    }
  }

  function paintScales(ctx, size, random) {
    paintCloudNoise(ctx, size, { cells: 8, alpha: .4, seed: 128 });
    const cell = size / 16;
    for (let row = 0; row < 16; row += 1) {
      for (let column = 0; column < 16; column += 1) {
        const offset = row % 2 ? cell * .5 : 0;
        const x = column * cell + offset + cell * .5;
        const y = row * cell + cell * .5;
        const shade = .55 + random() * .45;
        ctx.fillStyle = `rgba(${(74 * shade) | 0},${(88 * shade) | 0},${(58 * shade) | 0},.85)`;
        wrapped(ctx, size, x, y, cell, (c) => {
          c.beginPath();
          c.moveTo(0, -cell * .48);
          c.quadraticCurveTo(cell * .5, -cell * .2, cell * .42, cell * .3);
          c.quadraticCurveTo(0, cell * .62, -cell * .42, cell * .3);
          c.quadraticCurveTo(-cell * .5, -cell * .2, 0, -cell * .48);
          c.fill();
        });
        ctx.strokeStyle = `rgba(24,30,20,${.35 + random() * .25})`;
        ctx.lineWidth = 1.1;
        wrapped(ctx, size, x, y, cell, (c) => {
          c.beginPath();
          c.moveTo(0, -cell * .48);
          c.quadraticCurveTo(cell * .5, -cell * .2, cell * .42, cell * .3);
          c.stroke();
        });
      }
    }
    for (let i = 0; i < 700; i += 1) {
      const x = random() * size;
      const y = random() * size;
      ctx.fillStyle = `rgba(${200 + random() * 46 | 0},${206 + random() * 40 | 0},${168 + random() * 40 | 0},${.04 + random() * .1})`;
      wrapped(ctx, size, x, y, 2, (c) => { c.fillRect(-1, -1, 2, 2); });
    }
  }

  function paintLinen(ctx, size, random) {
    const step = size / 64;
    for (let i = 0; i < 64; i += 1) {
      ctx.fillStyle = `rgba(${226 + random() * 26 | 0},${212 + random() * 26 | 0},${184 + random() * 26 | 0},${.30 + random() * .3})`;
      ctx.fillRect(0, i * step, size, step * .62);
      ctx.fillStyle = `rgba(${150 + random() * 40 | 0},${134 + random() * 34 | 0},${106 + random() * 30 | 0},${.20 + random() * .26})`;
      ctx.fillRect(i * step, 0, step * .58, size);
    }
    paintCloudNoise(ctx, size, { cells: 7, alpha: .28, seed: 174 });
    for (let i = 0; i < 260; i += 1) {
      const x = random() * size;
      const y = random() * size;
      ctx.fillStyle = `rgba(126,110,84,${.05 + random() * .12})`;
      wrapped(ctx, size, x, y, 3, (c) => { c.fillRect(-1.5, -1.5, 3, 3); });
    }
  }

  function paintWeave(ctx, size, random) {
    const strands = 18;
    const step = size / strands;
    for (let i = 0; i < strands; i += 1) {
      for (let j = 0; j < strands; j += 1) {
        const over = (i + j) % 2 === 0;
        const shade = .74 + random() * .3;
        ctx.fillStyle = over
          ? `rgba(${(212 * shade) | 0},${(150 * shade) | 0},${(78 * shade) | 0},1)`
          : `rgba(${(150 * shade) | 0},${(94 * shade) | 0},${(44 * shade) | 0},1)`;
        const x = i * step;
        const y = j * step;
        ctx.beginPath();
        if (over) ctx.roundRect?.(x + step * .06, y + step * .18, step * .88, step * .64, step * .3);
        else ctx.roundRect?.(x + step * .18, y + step * .06, step * .64, step * .88, step * .3);
        if (!ctx.roundRect) ctx.rect(x + step * .1, y + step * .1, step * .8, step * .8);
        ctx.fill();
      }
    }
    ctx.strokeStyle = 'rgba(72,38,14,.42)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= strands; i += 1) {
      ctx.beginPath(); ctx.moveTo(i * step, 0); ctx.lineTo(i * step, size); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, i * step); ctx.lineTo(size, i * step); ctx.stroke();
    }
    paintCloudNoise(ctx, size, { cells: 6, alpha: .3, seed: 205 });
  }

  function paintFoliage(ctx, size, random) {
    paintCloudNoise(ctx, size, { cells: 9, alpha: .55, seed: 236 });
    for (let i = 0; i < 700; i += 1) {
      const x = random() * size;
      const y = random() * size;
      const length = 6 + random() * 22;
      const angle = random() * Math.PI * 2;
      ctx.strokeStyle = `rgba(${52 + random() * 74 | 0},${76 + random() * 70 | 0},${34 + random() * 44 | 0},${.22 + random() * .5})`;
      ctx.lineWidth = 1 + random() * 2.6;
      ctx.lineCap = 'round';
      wrapped(ctx, size, x, y, length, (c) => {
        c.beginPath();
        c.moveTo(0, 0);
        c.quadraticCurveTo(Math.cos(angle) * length * .5, Math.sin(angle) * length * .5 - 3, Math.cos(angle) * length, Math.sin(angle) * length);
        c.stroke();
      });
    }
  }

  /* ------------------------------------------------------------------ */
  /* Каталог поверхностей                                                */
  /* ------------------------------------------------------------------ */

  const SURFACES = {
    sandstone: { size: 256, base: '#c1a173', paint: paintSandstone, normalStrength: 2.6, roughness: .88, roughnessSpread: .34, cavity: .9, repeat: 1, seed: 11 },
    limestone: { size: 256, base: '#ded0ab', paint: paintSandstone, normalStrength: 1.7, roughness: .8, roughnessSpread: .3, cavity: .6, repeat: 1, seed: 29 },
    granite: { size: 256, base: '#8d8071', paint: paintGranite, normalStrength: 3.1, roughness: .84, roughnessSpread: .44, cavity: 1.1, repeat: 1, seed: 37 },
    bark: { size: 256, base: '#6d4a2b', paint: paintBark, normalStrength: 3.4, roughness: .93, roughnessSpread: .3, cavity: 1.2, repeat: 1, seed: 53 },
    hide: { size: 256, base: '#a08983', paint: paintWetHide, normalStrength: 1.5, roughness: .48, roughnessSpread: .38, roughnessInvert: true, cavity: .45, repeat: 1, seed: 71 },
    scales: { size: 256, base: '#4a5a3a', paint: paintScales, normalStrength: 2.8, roughness: .52, roughnessSpread: .5, roughnessInvert: true, cavity: 1, repeat: 1, seed: 89 },
    linen: { size: 256, base: '#e3d4b4', paint: paintLinen, normalStrength: 1.5, roughness: .93, roughnessSpread: .22, cavity: .5, repeat: 1, seed: 101 },
    weave: { size: 256, base: '#b8752f', paint: paintWeave, normalStrength: 3.2, roughness: .9, roughnessSpread: .3, cavity: 1.3, repeat: 1, seed: 113 },
    foliage: { size: 256, base: '#4d6136', paint: paintFoliage, normalStrength: 2.2, roughness: .95, roughnessSpread: .26, cavity: .7, repeat: 1, seed: 127 },
  };

  function surface(name) {
    const spec = SURFACES[name];
    if (!spec) return null;
    return buildSurface(name, spec);
  }

  /**
   * PBR-материал на базе процедурной поверхности.
   * Отдельная копия текстур создаётся только когда нужен свой repeat.
   */
  function pbr(name, options = {}) {
    const key = `${name}|${JSON.stringify(options)}`;
    if (materialCache.has(key)) return materialCache.get(key);
    const maps = surface(name);
    const material = new THREE.MeshStandardMaterial({
      color: options.color ?? 0xffffff,
      roughness: options.roughness ?? 1,
      metalness: options.metalness ?? .04,
      side: options.side ?? THREE.FrontSide,
      transparent: options.transparent ?? false,
      opacity: options.opacity ?? 1,
      flatShading: options.flatShading ?? false,
    });
    if (maps) {
      const repeat = options.repeat || 1;
      if (repeat === 1) {
        material.map = maps.map;
        material.normalMap = maps.normalMap;
        material.roughnessMap = maps.roughnessMap;
      } else {
        material.map = maps.map.clone();
        material.normalMap = maps.normalMap.clone();
        material.roughnessMap = maps.roughnessMap.clone();
        for (const texture of [material.map, material.normalMap, material.roughnessMap]) {
          texture.repeat.set(repeat, repeat);
          texture.needsUpdate = true;
        }
      }
      material.normalScale = new THREE.Vector2(options.normalScale ?? 1, options.normalScale ?? 1);
    }
    material.envMapIntensity = options.envMapIntensity ?? 1;
    if (options.skyReflection !== false) addSkyReflection(material, { strength: options.skyReflection ?? 1 });
    if (options.emissive !== undefined) {
      material.emissive = new THREE.Color(options.emissive);
      material.emissiveIntensity = options.emissiveIntensity ?? .3;
    }
    materialCache.set(key, material);
    return material;
  }

  /**
   * Окружение закатного Нила.
   *
   * От карты окружения пришлось отказаться: PMREM в r128 пишет в RGBE-цель,
   * незакрытые тексели остаются с альфой 255, что при разборе даёт 2^127 —
   * после размытия вся сцена белеет; а обычная кубическая текстура в этой
   * ревизии стандартным материалом просто игнорируется.
   *
   * Поэтому небо задано формулой, и из неё берутся обе половины освещения:
   *   • рассеянная — сферические гармоники светового зонда;
   *   • зеркальная — тот же градиент, посчитанный в шейдере по отражённому
   *     лучу с френелевским краем.
   * Результат предсказуем на любом устройстве и не зависит от расширений.
   */
  const SKY = {
    zenith: [.073, .119, .214],
    horizon: [.701, .448, .205],
    ground: [.055, .036, .017],
    sun: [.98, .84, .58],
    glow: [.30, .20, .10],
    direction: [-.55, .34, -.76],
  };
  {
    const length = Math.hypot(...SKY.direction);
    SKY.direction = SKY.direction.map((value) => value / length);
  }

  /** Яркость неба в линейном пространстве для направления взгляда. */
  function skyRadiance(x, y, z, out) {
    const length = Math.hypot(x, y, z) || 1;
    const dx = x / length;
    const dy = y / length;
    const dz = z / length;
    const up = dy >= 0;
    const t = Math.pow(clamp01(up ? dy : -dy), up ? .55 : .42);
    const far = up ? SKY.zenith : SKY.ground;
    const facing = Math.max(0, dx * SKY.direction[0] + dy * SKY.direction[1] + dz * SKY.direction[2]);
    const disc = Math.pow(facing, 220);
    const halo = Math.pow(facing, 5);
    for (let i = 0; i < 3; i += 1) {
      out[i] = lerp(SKY.horizon[i], far[i], t) + SKY.sun[i] * disc + SKY.glow[i] * halo;
    }
  }

  /**
   * Световой зонд: проекция неба на сферические гармоники.
   * Направления берутся по спирали Фибоначчи — равномерно и без полюсов.
   */
  function buildLightProbe() {
    const probe = new THREE.LightProbe();
    const basis = [0, 0, 0, 0, 0, 0, 0, 0, 0];
    const direction = new THREE.Vector3();
    const radiance = [0, 0, 0];
    const coefficients = probe.sh.coefficients;
    for (const vector of coefficients) vector.set(0, 0, 0);
    const samples = 2048;
    const golden = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < samples; i += 1) {
      const y = 1 - (i / (samples - 1)) * 2;
      const radius = Math.sqrt(Math.max(0, 1 - y * y));
      const theta = golden * i;
      direction.set(Math.cos(theta) * radius, y, Math.sin(theta) * radius);
      skyRadiance(direction.x, direction.y, direction.z, radiance);
      THREE.SphericalHarmonics3.getBasisAt(direction, basis);
      for (let j = 0; j < 9; j += 1) {
        coefficients[j].x += basis[j] * radiance[0];
        coefficients[j].y += basis[j] * radiance[1];
        coefficients[j].z += basis[j] * radiance[2];
      }
    }
    const norm = (4 * Math.PI) / samples;
    for (const vector of coefficients) vector.multiplyScalar(norm);
    probe.intensity = 1;
    probe.name = 'V76NileSkyProbe';
    return probe;
  }

  /** То же небо, но на GLSL — для отражений в материалах. */
  const SKY_GLSL = `
    vec3 mosesSkyRadiance(vec3 direction) {
      float height = direction.y;
      vec3 far = height >= 0.0 ? vec3(${SKY.zenith.join(', ')}) : vec3(${SKY.ground.join(', ')});
      float shaped = pow(clamp(abs(height), 0.0, 1.0), height >= 0.0 ? 0.55 : 0.42);
      vec3 sky = mix(vec3(${SKY.horizon.join(', ')}), far, shaped);
      float facing = max(dot(direction, vec3(${SKY.direction.map((v) => v.toFixed(5)).join(', ')})), 0.0);
      sky += vec3(${SKY.sun.join(', ')}) * pow(facing, 220.0);
      sky += vec3(${SKY.glow.join(', ')}) * pow(facing, 5.0);
      return sky;
    }`;

  /** Композиция правок шейдера: onBeforeCompile у материала всего один. */
  function chainOnBeforeCompile(material, addition) {
    const previous = material.onBeforeCompile;
    material.onBeforeCompile = (shader, targetRenderer) => {
      if (typeof previous === 'function') previous(shader, targetRenderer);
      addition(shader, targetRenderer);
    };
    material.needsUpdate = true;
    return material;
  }

  /**
   * Зеркальная составляющая окружения: небо по отражённому лучу, усиленное
   * к краю по Френелю и размытое шероховатостью поверхности.
   */
  function addSkyReflection(material, { strength = 1 } = {}) {
    if (material.userData.skyReflection) return material;
    material.userData.skyReflection = true;
    return chainOnBeforeCompile(material, (shader) => {
      shader.fragmentShader = `${SKY_GLSL}\n${shader.fragmentShader}`.replace(
        '#include <dithering_fragment>',
        `{
          vec3 mosesView = normalize(vViewPosition);
          vec3 mosesNormal = normalize(normal);
          vec3 mosesReflect = inverseTransformDirection(reflect(-mosesView, mosesNormal), viewMatrix);
          // Шероховатая поверхность «видит» небо шире: подмешиваем зенит.
          vec3 mosesUp = inverseTransformDirection(mosesNormal, viewMatrix);
          vec3 mosesSky = mix(mosesSkyRadiance(mosesReflect), mosesSkyRadiance(mosesUp), roughnessFactor * 0.85);
          float mosesFresnel = pow(1.0 - clamp(dot(mosesNormal, mosesView), 0.0, 1.0), 4.0);
          float mosesGloss = 1.0 - roughnessFactor * 0.82;
          gl_FragColor.rgb += mosesSky * mosesGloss * (0.06 + 0.55 * mosesFresnel) * ${strength.toFixed(3)};
        }
        #include <dithering_fragment>`,
      );
    });
  }

  function init(targetRenderer, scene) {
    renderer = targetRenderer;
    anisotropy = Math.min(8, renderer?.capabilities?.getMaxAnisotropy?.() || 4);
    if (!environment) {
      try {
        environment = buildLightProbe();
      } catch (error) {
        console.warn('[NileMaterials] световой зонд не построен:', error?.message || error);
        environment = null;
      }
    }
    if (environment && scene && !scene.getObjectByName('V76NileSkyProbe')) scene.add(environment);
    return environment;
  }

  /**
   * Доводит материалы загруженной модели до PBR: чинит пластмассовые
   * значения, подмешивает процедурную шероховатость и включает окружение.
   */
  function upgradeModelMaterials(root, options = {}) {
    const detail = options.detail ? surface(options.detail) : null;
    root.traverse((child) => {
      if (!child.isMesh && !child.isSkinnedMesh) return;
      child.castShadow = options.castShadow !== false;
      child.receiveShadow = options.receiveShadow !== false;
      const list = Array.isArray(child.material) ? child.material : [child.material];
      const upgraded = list.filter(Boolean).map((source) => {
        const material = source.clone();
        if ('roughness' in material) {
          material.roughness = clamp01(lerp(material.roughness ?? .8, options.roughness ?? .72, options.roughnessMix ?? .65));
        }
        if ('metalness' in material) material.metalness = options.metalness ?? .05;
        if ('envMapIntensity' in material) material.envMapIntensity = options.envMapIntensity ?? .45;
        if (detail && !material.normalMap && child.geometry?.attributes?.uv) {
          material.normalMap = detail.normalMap;
          material.normalScale = new THREE.Vector2(options.normalScale ?? .55, options.normalScale ?? .55);
          if (!material.roughnessMap) material.roughnessMap = detail.roughnessMap;
        }
        if (options.skyReflection !== false) addSkyReflection(material, { strength: options.skyReflection ?? 1 });
        if (options.color !== undefined && material.color) material.color = new THREE.Color(options.color);
        if (options.tint !== undefined && material.color) material.color.lerp(new THREE.Color(options.tint), options.tintAmount ?? .3);
        material.side = options.side ?? THREE.FrontSide;
        material.needsUpdate = true;
        return material;
      });
      child.material = Array.isArray(child.material) ? upgraded : upgraded[0];
    });
    return root;
  }

  /** Мягкое пятно контакта: тень и подводное отражение под объектом. */
  function contactShadow(radius = 1, opacity = .34, tint = '18,22,16') {
    const canvas = makeCanvas(128);
    const ctx = canvas.getContext('2d');
    const gradient = ctx.createRadialGradient(64, 64, 2, 64, 64, 62);
    gradient.addColorStop(0, `rgba(${tint},.92)`);
    gradient.addColorStop(.45, `rgba(${tint},.42)`);
    gradient.addColorStop(1, `rgba(${tint},0)`);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 128, 128);
    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(radius * 2, radius * 2),
      new THREE.MeshBasicMaterial({ map: texture, transparent: true, opacity, depthWrite: false, blending: THREE.NormalBlending }),
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.renderOrder = 2;
    mesh.name = 'V76ContactShadow';
    return mesh;
  }

  /**
   * Растворение к горизонту: дальний край 3D-сцены гасится в прозрачность,
   * чтобы вместо жёсткой полосы на стыке с эталонным фоном был мягкий переход.
   * start и end — расстояния вглубь сцены (по модулю Z), где начинается и
   * завершается растворение.
   */
  function addHorizonFade(material, { start = 110, end = 185 } = {}) {
    if (material.userData.horizonFade) return material;
    material.userData.horizonFade = true;
    material.transparent = true;
    material.depthWrite = false;
    return chainOnBeforeCompile(material, (shader) => {
      shader.vertexShader = `varying float vMosesDepth;\n${shader.vertexShader}`.replace(
        '#include <project_vertex>',
        `vMosesDepth = -(modelMatrix * vec4(transformed, 1.0)).z;
        #include <project_vertex>`,
      );
      shader.fragmentShader = `varying float vMosesDepth;\n${shader.fragmentShader}`.replace(
        '#include <dithering_fragment>',
        `#include <dithering_fragment>
        gl_FragColor.a *= 1.0 - smoothstep(${start.toFixed(1)}, ${end.toFixed(1)}, vMosesDepth);`,
      );
    });
  }

  /**
   * Проекционная развёртка по доминирующей оси нормали.
   *
   * Модели Quaternius приходят вообще без UV и с плоскими цветами — из-за
   * этого на них нельзя было положить ни одной текстуры, и вся сцена читалась
   * как пластмасса. Развёртка считается один раз при подготовке геометрии.
   */
  function applyBoxUV(geometry, scale = 1) {
    if (!geometry || geometry.attributes.uv) return geometry;
    const position = geometry.attributes.position;
    if (!position) return geometry;
    if (!geometry.attributes.normal) geometry.computeVertexNormals();
    const normal = geometry.attributes.normal;
    const uv = new Float32Array(position.count * 2);
    for (let i = 0; i < position.count; i += 1) {
      const x = position.getX(i);
      const y = position.getY(i);
      const z = position.getZ(i);
      const nx = Math.abs(normal.getX(i));
      const ny = Math.abs(normal.getY(i));
      const nz = Math.abs(normal.getZ(i));
      let u;
      let v;
      if (ny >= nx && ny >= nz) { u = x; v = z; }
      else if (nx >= nz) { u = z; v = y; }
      else { u = x; v = y; }
      uv[i * 2] = u * scale;
      uv[i * 2 + 1] = v * scale;
    }
    geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    return geometry;
  }

  /** Подбирает поверхность по имени материала модели. */
  function surfaceForName(name) {
    const id = String(name || '').toLowerCase();
    if (id.includes('rock') || id.includes('stone')) return 'granite';
    if (id.includes('wood') || id.includes('trunk') || id.includes('bark') || id.includes('log')) return 'bark';
    if (id.includes('green') || id.includes('leaf') || id.includes('leaves') || id.includes('coconut') || id.includes('plant')) return 'foliage';
    if (id.includes('skin') || id.includes('hide')) return 'hide';
    if (id.includes('cloth') || id.includes('linen') || id.includes('beige')) return 'linen';
    return 'sandstone';
  }

  /**
   * Одевает уже созданный материал в процедурный PBR: карта цвета ложится
   * поверх собственного тона модели, добавляются нормали и шероховатость.
   * Геометрию передавать обязательно — без UV карты не лягут.
   */
  function dress(material, geometry, options = {}) {
    if (!material) return material;
    const name = options.surface || surfaceForName(options.name || material.name);
    const maps = surface(name);
    if (!maps) return material;
    applyBoxUV(geometry, options.uvScale ?? .8);
    if (!geometry?.attributes?.uv) return material;
    const repeat = options.repeat || 1;
    const clone = repeat !== 1;
    material.map = clone ? maps.map.clone() : maps.map;
    material.normalMap = clone ? maps.normalMap.clone() : maps.normalMap;
    material.roughnessMap = clone ? maps.roughnessMap.clone() : maps.roughnessMap;
    if (clone) {
      for (const texture of [material.map, material.normalMap, material.roughnessMap]) {
        texture.repeat.set(repeat, repeat);
        texture.needsUpdate = true;
      }
    }
    material.normalScale = new THREE.Vector2(options.normalScale ?? .85, options.normalScale ?? .85);
    // Карта цвета уже несёт светлоту камня или листвы, поэтому собственный
    // тон модели осветляется — иначе после умножения всё уходит в черноту.
    if (material.color && options.keepColor !== true) {
      material.color.lerp(new THREE.Color(0xffffff), options.bleach ?? .45);
    }
    if ('roughness' in material) material.roughness = options.roughness ?? material.roughness ?? .9;
    if ('metalness' in material) material.metalness = options.metalness ?? .03;
    if ('envMapIntensity' in material) material.envMapIntensity = options.envMapIntensity ?? 1;
    if (options.skyReflection !== false) addSkyReflection(material, { strength: options.skyReflection ?? .8 });
    material.needsUpdate = true;
    return material;
  }

  window.NileMaterials = {
    init,
    applyBoxUV,
    dress,
    surfaceForName,
    addHorizonFade,
    pbr,
    addSkyReflection,
    chainOnBeforeCompile,
    skyRadiance,
    SKY_GLSL,
    surface,
    upgradeModelMaterials,
    contactShadow,
    get environment() { return environment; },
  };
})();
