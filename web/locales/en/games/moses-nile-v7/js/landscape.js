/* Геометрия пейзажа. Одна периодическая кромка для песка, растений и воды. */
(() => {
  'use strict';
  const TILE = 250;
  const HALF = 6.35;
  const K = 2 * Math.PI / TILE;
  const random = (i, seed) => {
    const n = Math.sin(i * 91.733 + seed * 37.719) * 43758.5453;
    return n - Math.floor(n);
  };
  function shoreOffset(z, side) {
    return 1.05 + Math.sin(z * K * 2 + side * 1.7) * .48
      + Math.sin(z * K * 5 - side * .9) * .27
      + Math.sin(z * K * 11 + side * 2.1) * .12;
  }
  function bedHeight(x, z) {
    const side = x < 0 ? -1 : 1;
    const edge = HALF + shoreOffset(z, side);
    const across = Math.min(1, Math.abs(x) / edge);
    return -.10 - 1.30 * (1 - across * across);
  }
  const GLSL = `
    float nileShore(float z, float side) {
      float k = ${(2 * Math.PI / TILE).toPrecision(16)};
      return 1.05 + sin(z * k * 2.0 + side * 1.7) * 0.48
        + sin(z * k * 5.0 - side * 0.9) * 0.27
        + sin(z * k * 11.0 + side * 2.1) * 0.12;
    }
    float nileBed(vec2 p) {
      float side = p.x < 0.0 ? -1.0 : 1.0;
      float edge = 6.35 + nileShore(p.y, side);
      float across = min(1.0, abs(p.x) / edge);
      return -0.10 - 1.30 * (1.0 - across * across);
    }
  `;

  // Пустые участки чередуются с зарослями; левый и правый берег независимы.
  function vegetationOffset(z, side, near, far, sample) {
    const patch = .5 + .5 * Math.sin(z * K * 7 + side * 2.4);
    const amount = Math.pow(sample, 1.6);
    return near + (far - near) * Math.min(1, amount + (1 - patch) * .32);
  }

  function foliageParts(THREE, key, variant = 0, targetSize = 0) {
    if (!['palm', 'grass', 'bush', 'bankPlant', 'broadleaf'].includes(key)) return null;
    const seed = 47 + variant * 31;
    const parts = [];
    function geometryBuilder() {
      const positions = [], uvs = [], colors = [];
      function triangle(a, b, c, ua, ub, uc, shade) {
        for (const [point, uv] of [[a, ua], [b, ub], [c, uc]]) {
          positions.push(...point); uvs.push(...uv); colors.push(shade, shade, shade);
        }
      }
      // Изогнутый лист с центральным ребром и сужением к кончику.
      function leaf(base, angle, length, width, rise, droop, shade = 1, segments = 5) {
        function section(t) {
          const w = width * Math.pow(Math.sin(Math.PI * Math.max(.001, t)), .8);
          const d = length * t;
          const y = base[1] + rise * t - droop * t * t;
          const center = [base[0] + Math.cos(angle) * d, y + w * .18, base[2] + Math.sin(angle) * d];
          return [
            [center[0] - Math.sin(angle) * w, y, center[2] + Math.cos(angle) * w],
            center,
            [center[0] + Math.sin(angle) * w, y, center[2] - Math.cos(angle) * w],
          ];
        }
        for (let i = 0; i < segments; i++) {
          const a = section(i / segments), b = section((i + 1) / segments);
          for (let j = 0; j < 2; j++) {
            const u = j / 2, v = i / segments, vn = (i + 1) / segments;
            triangle(a[j], b[j], a[j + 1], [u, v], [u, vn], [u + .5, v], shade);
            triangle(a[j + 1], b[j], b[j + 1], [u + .5, v], [u, vn], [u + .5, vn], shade);
          }
        }
      }
      function finish() {
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
        geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
        geometry.computeVertexNormals(); geometry.computeBoundingSphere();
        return geometry;
      }
      return { leaf, finish };
    }
    function material(color, leaves) {
      const m = new THREE.MeshStandardMaterial({
        color, roughness: leaves ? .88 : .97, metalness: 0,
        side: THREE.DoubleSide, vertexColors: leaves,
        emissive: leaves ? 0x233414 : 0, emissiveIntensity: leaves ? .12 : 0,
      });
      // r128 не переводит цвета из sRGB автоматически. Иначе тёмная
      // зелень после выходного преобразования становится бледной.
      m.color.convertSRGBToLinear();
      m.userData.nativeFoliage = true;
      return m;
    }
    if (key === 'palm') {
      const height = 7.6 + variant * .65;
      const bend = .4 + variant * .35;
      const trunk = new THREE.CylinderGeometry(.14, .34, height, 9, 16);
      trunk.translate(0, height / 2, 0);
      const p = trunk.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const t = p.getY(i) / height;
        const rings = 1 + .065 * Math.sin(t * 145);
        p.setXYZ(i, p.getX(i) * rings + bend * t * t, p.getY(i), p.getZ(i) * rings);
      }
      trunk.computeVertexNormals();
      const bark = material(0x806347, false);
      window.NileMaterials?.dress?.(bark, trunk, { surface: 'bark', uvScale: 1.2, roughness: .97, bleach: .02 });
      parts.push({ geometry: trunk, material: bark, wind: .07 });
      const crown = geometryBuilder();
      for (let f = 0; f < 9; f++) {
        const angle = f / 9 * Math.PI * 2 + random(f, seed) * .25;
        const length = 2.8 + random(f, seed + 1);
        const rise = .6 + random(f, seed + 2) * .8;
        const droop = 1.8 + random(f, seed + 3) * 1.4;
        for (let j = 1; j < 9; j++) {
          const t = j / 9;
          const base = [bend + Math.cos(angle) * length * t,
            height + rise * t - droop * t * t, Math.sin(angle) * length * t];
          const leaflet = .30 + Math.sin(t * Math.PI) * .55;
          for (const side of [-1, 1]) crown.leaf(base, angle + side * 1.05,
            leaflet, .095, .10, .45, .72 + random(f * 11 + j, seed + 4) * .40, 2);
        }
        crown.leaf([bend, height, 0], angle, length, .03, rise, droop, .8, 6);
      }
      parts.push({ geometry: crown.finish(), material: material(0x58763a, true), wind: .16 });
    } else {
      const leaves = geometryBuilder();
      const grass = key === 'grass';
      const bush = key === 'bush';
      const count = grass ? 8 : bush ? 24 : 12;
      for (let i = 0; i < count; i++) {
        const angle = random(i, seed) * Math.PI * 2;
        const radius = random(i, seed + 1) * (bush ? .56 : .30);
        const base = [Math.cos(angle) * radius, bush ? random(i, seed + 2) * .95 : 0, Math.sin(angle) * radius];
        const length = grass ? .15 + random(i, seed + 3) * .30 : bush ? .22 + random(i, seed + 3) * .38 : .35 + random(i, seed + 3) * .42;
        const rise = grass ? .35 + random(i, seed + 4) * .55 : bush ? .14 : .28 + random(i, seed + 4) * .55;
        leaves.leaf(base, angle, length, grass ? .018 : bush ? .10 : .085, rise,
          grass ? .10 : .25, .66 + random(i, seed + 5) * .46, 3);
      }
      parts.push({ geometry: leaves.finish(), material: material(grass ? 0x7b8651 : bush ? 0x536d3d : 0x687e43, true), wind: grass ? 1 : .65 });
    }
    if (targetSize > 0) {
      const box = new THREE.Box3();
      for (const part of parts) { part.geometry.computeBoundingBox(); box.union(part.geometry.boundingBox); }
      const size = box.getSize(new THREE.Vector3());
      const scale = targetSize / Math.max(size.x, size.y, size.z);
      for (const part of parts) { part.geometry.scale(scale, scale, scale); part.geometry.computeBoundingSphere(); }
    }
    return parts;
  }

  // Те же координаты используются геометрией и аналитическим отражением.
  const PYRAMIDS = [
    [-64, -424, 40, 51, 80, 0, .60],
    [22, -458, 37, 47, 74, .22, .52],
    [82, -482, 19, 24, 44, 0, .44],
  ];

  function pyramidTexture(THREE) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 512;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#a89878'; ctx.fillRect(0, 0, 512, 512);
    const height = 512 / 12, width = 64;
    for (let row = 0; row < 12; row++) {
      for (let col = -1; col < 9; col++) {
        const shade = 176 + Math.round(random(row * 19 + col, 113) * 40);
        const x = col * width + (row % 2) * width / 2;
        const y = row * height;
        ctx.fillStyle = `rgb(${shade},${Math.round(shade * .94)},${Math.round(shade * .82)})`;
        ctx.fillRect(x + 1, y + 1, width - 2, height - 2);
        ctx.fillStyle = 'rgba(255,250,222,.18)'; ctx.fillRect(x + 2, y + 1, width - 3, 1.5);
      }
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.encoding = THREE.sRGBEncoding;
    texture.anisotropy = 4;
    return texture;
  }

  window.NileLandscape = { TILE, HALF, GLSL, PYRAMIDS, shoreOffset, bedHeight,
    vegetationOffset, foliageParts, pyramidTexture };
})();
