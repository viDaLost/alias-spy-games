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

  // Небольшое отражение окружения обновляется реже основного кадра.
  // Геометрия ниже уровня воды отсекается наклонной ближней плоскостью.
  function createReflection(THREE, renderer, scene, camera, water, hidden) {
    const size = 384;
    const target = new THREE.WebGLRenderTarget(size, size, { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: true });
    target.texture.generateMipmaps = false;
    const reflected = new THREE.PerspectiveCamera();
    const matrix = new THREE.Matrix4();
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), .055);
    const clip = new THREE.Vector4(), q = new THREE.Vector4();
    const direction = new THREE.Vector3(), look = new THREE.Vector3();
    let hold = 0, ready = false;
    const u = water.material.uniforms;
    u.uReflection.value = target.texture;
    u.uReflectionMatrix.value = matrix;
    return {
      update(dt, quality) {
        if (quality < .86) { u.uReflectionStrength.value = 0; ready = false; return; }
        hold -= dt;
        if (hold > 0 && ready) return;
        hold = .12;
        reflected.copy(camera);
        reflected.position.y = -.11 - camera.position.y;
        camera.getWorldDirection(direction); direction.y *= -1;
        look.copy(reflected.position).add(direction);
        reflected.up.set(0, -1, 0); reflected.lookAt(look); reflected.updateMatrixWorld();
        reflected.matrixWorldInverse.copy(reflected.matrixWorld).invert();
        reflected.projectionMatrix.copy(camera.projectionMatrix);
        matrix.set(.5, 0, 0, .5, 0, .5, 0, .5, 0, 0, .5, .5, 0, 0, 0, 1);
        matrix.multiply(reflected.projectionMatrix).multiply(reflected.matrixWorldInverse);
        const localPlane = plane.clone().applyMatrix4(reflected.matrixWorldInverse);
        clip.set(localPlane.normal.x, localPlane.normal.y, localPlane.normal.z, localPlane.constant);
        const p = reflected.projectionMatrix.elements;
        q.set((Math.sign(clip.x) + p[8]) / p[0], (Math.sign(clip.y) + p[9]) / p[5], -1, (1 + p[10]) / p[14]);
        clip.multiplyScalar(2 / clip.dot(q));
        p[2] = clip.x; p[6] = clip.y; p[10] = clip.z + 1 - .003; p[14] = clip.w;
        reflected.projectionMatrixInverse.copy(reflected.projectionMatrix).invert();
        const previousTarget = renderer.getRenderTarget();
        const previousAutoUpdate = renderer.shadowMap.autoUpdate;
        const objects = [water, ...hidden()].filter(Boolean);
        const visibility = objects.map(o => o.visible);
        const sky = scene.getObjectByName('V751SandstormSky');
        const skyPosition = sky?.position.clone();
        try {
          objects.forEach(o => { o.visible = false; });
          if (sky) sky.position.copy(reflected.position);
          renderer.shadowMap.autoUpdate = false;
          renderer.setRenderTarget(target); renderer.clear(); renderer.render(scene, reflected);
          ready = true; u.uReflectionStrength.value = .44;
        } finally {
          renderer.setRenderTarget(previousTarget);
          renderer.shadowMap.autoUpdate = previousAutoUpdate;
          objects.forEach((o, i) => { o.visible = visibility[i]; });
          if (skyPosition) sky.position.copy(skyPosition);
        }
      },
      dispose() { target.dispose(); u.uReflectionStrength.value = 0; },
    };
  }
  window.NileLandscape = { TILE, HALF, GLSL, shoreOffset, bedHeight, vegetationOffset, foliageParts, createReflection };
})();
