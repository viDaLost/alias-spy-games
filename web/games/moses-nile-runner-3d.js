(() => {
  'use strict';

  if (window.__mosesNile3DModuleInstalled) return;
  window.__mosesNile3DModuleInstalled = true;

  const GAME_KEY = 'moses-nile-runner';
  const THREE_SRC = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';
  const GLTF_LOADER_SRC = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/examples/js/loaders/GLTFLoader.js';
  const MODEL_REV = 'd6aacfb25dd969ead90cddd94ad901e74aede5d8';
  const MODEL_ROOT = `https://cdn.jsdelivr.net/gh/trebeljahr/quaternius-showcase@${MODEL_REV}/public/glb`;
  const MODEL_URLS = Object.freeze({
    basket: 'web/assets/models/moses-nile/woven-basket.obj?v=1',
    rock: `${MODEL_ROOT}/nature_pack/Rock_1.glb`,
    plant: `${MODEL_ROOT}/nature_pack/Plant_2.glb`,
    bush: `${MODEL_ROOT}/nature_pack/Bush_1.glb`,
    grass: `${MODEL_ROOT}/nature_pack/Grass.glb`,
    bankPlant: `${MODEL_ROOT}/nature_pack/Plant_1.glb`,
    log: `${MODEL_ROOT}/survival_pack/WoodLog.glb`,
    raft: `${MODEL_ROOT}/survival_pack/Raft.glb`,
    palm: `${MODEL_ROOT}/nature_pack/PalmTree_4.glb`,
  });
  const REMOTE_MODEL_BYTES = Object.freeze({
    rock: 5516,
    plant: 16040,
    bush: 21348,
    grass: 12632,
    bankPlant: 18416,
    log: 13904,
    raft: 58392,
    palm: 63764,
  });
  const REMOTE_MODEL_BUDGET = 220000;
  const MAX_PIXEL_RATIO = 1.25;
  const MIN_FRAME_MS = 30;
  const FAR_Z = -70;
  const NEAR_Z = 5.0;
  const RIVER_HALF = 5.85;
  const LANE_X = 2.12;
  const ENV_WRAP_LENGTH = 90;
  const SCENE_STYLE_ID = 'moses-nile-full-3d-style-v6';

  let active = null;
  let dependencyPromise = null;
  const scriptPromises = new Map();

  function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function smoothstep(t) { const v = clamp(t, 0, 1); return v * v * (3 - 2 * v); }
  function totalRemoteBudget() { return Object.values(REMOTE_MODEL_BYTES).reduce((sum, n) => sum + n, 0); }

  function loadScriptOnce(src, marker) {
    if (scriptPromises.has(src)) return scriptPromises.get(src);
    const promise = new Promise((resolve) => {
      const existing = document.querySelector(`script[data-${marker}="1"]`);
      if (existing) {
        if (existing.dataset.loaded === '1') resolve(true);
        else {
          existing.addEventListener('load', () => resolve(true), { once: true });
          existing.addEventListener('error', () => resolve(false), { once: true });
        }
        return;
      }
      const script = document.createElement('script');
      script.src = src;
      script.async = true;
      script.crossOrigin = 'anonymous';
      script.dataset[marker] = '1';
      script.addEventListener('load', () => { script.dataset.loaded = '1'; resolve(true); }, { once: true });
      script.addEventListener('error', () => resolve(false), { once: true });
      document.head.appendChild(script);
    });
    scriptPromises.set(src, promise);
    return promise;
  }

  async function ensureDependencies() {
    if (window.THREE?.GLTFLoader) return true;
    if (dependencyPromise) return dependencyPromise;
    dependencyPromise = (async () => {
      if (!window.THREE) {
        let ok = false;
        try { if (typeof window.__loadThree === 'function') ok = Boolean(await window.__loadThree()); } catch {}
        if (!ok && !window.THREE) ok = await loadScriptOnce(THREE_SRC, 'mosesThreeCore');
        if (!ok || !window.THREE) return false;
      }
      if (!window.THREE.GLTFLoader) {
        const ok = await loadScriptOnce(GLTF_LOADER_SRC, 'mosesGltfLoader');
        if (!ok || !window.THREE.GLTFLoader) return false;
      }
      return true;
    })().finally(() => { dependencyPromise = null; });
    return dependencyPromise;
  }

  function withTimeout(promise, ms = 6000) {
    return Promise.race([promise, new Promise((resolve) => setTimeout(() => resolve(null), ms))]);
  }

  function ensureSceneStyle() {
    if (document.getElementById(SCENE_STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = SCENE_STYLE_ID;
    style.textContent = `
.mnr-stage.mnr-stage--full-3d{background:#69a9bf!important}
.mnr-stage.mnr-stage--full-3d::before,.mnr-stage.mnr-stage--full-3d::after,
.mnr-stage.mnr-stage--full-3d .mnr-sky,.mnr-stage.mnr-stage--full-3d .mnr-horizon,
.mnr-stage.mnr-stage--full-3d .mnr-water{opacity:0!important;visibility:hidden!important}
.mnr-stage.mnr-stage--full-3d .mnr-object__emoji,
.mnr-stage.mnr-stage--full-3d .mnr-basket,
.mnr-stage.mnr-stage--full-3d .mnr-wake{visibility:hidden!important}
.mnr-stage .mnr-3d-canvas{display:block}
`;
    document.head.appendChild(style);
  }

  function disposeMaterial(material) {
    const list = Array.isArray(material) ? material : [material];
    list.forEach((item) => {
      if (!item) return;
      for (const key of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap', 'alphaMap']) {
        try { item[key]?.dispose?.(); } catch {}
      }
      try { item.dispose?.(); } catch {}
    });
  }

  function disposeObject(root) {
    root?.traverse?.((node) => {
      if (!node?.isMesh) return;
      try { node.geometry?.dispose?.(); } catch {}
      disposeMaterial(node.material);
    });
  }

  function normalizeObject(object) {
    const THREE = window.THREE;
    const box = new THREE.Box3().setFromObject(object);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);
    const maxDim = Math.max(size.x, size.y, size.z, .0001);
    object.position.sub(center);
    const inner = new THREE.Group();
    inner.add(object);
    inner.scale.setScalar(1 / maxDim);
    const outer = new THREE.Group();
    outer.add(inner);
    return outer;
  }

  function tuneLoadedObject(root) {
    const THREE = window.THREE;
    root.traverse?.((node) => {
      if (!node?.isMesh) return;
      node.castShadow = false;
      node.receiveShadow = false;
      const source = Array.isArray(node.material) ? node.material : [node.material];
      const tuned = source.map((material) => {
        if (!material) return material;
        const clone = material.clone();
        if (clone.color) clone.color.offsetHSL(0, .06, -.035);
        if ('roughness' in clone) clone.roughness = Math.max(.7, Number(clone.roughness ?? .85));
        if ('metalness' in clone) clone.metalness = Math.min(.03, Number(clone.metalness ?? 0));
        if ('emissive' in clone) { clone.emissive = new THREE.Color(0x000000); clone.emissiveIntensity = 0; }
        clone.side = THREE.DoubleSide;
        return clone;
      });
      node.material = Array.isArray(node.material) ? tuned : tuned[0];
    });
    return root;
  }

  async function loadGltf(url) {
    const THREE = window.THREE;
    try {
      const scene = await withTimeout(new Promise((resolve) => {
        new THREE.GLTFLoader().load(url, (gltf) => resolve(gltf?.scene || null), undefined, () => resolve(null));
      }), 6500);
      return scene ? normalizeObject(tuneLoadedObject(scene)) : null;
    } catch { return null; }
  }

  function makeBasketTexture() {
    const THREE = window.THREE;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 96;
    const ctx = canvas.getContext('2d');
    const g = ctx.createLinearGradient(0, 0, 96, 96);
    g.addColorStop(0, '#e2aa5f'); g.addColorStop(.5, '#9d5d28'); g.addColorStop(1, '#d89a4e');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 96, 96);
    ctx.strokeStyle = 'rgba(78,39,16,.8)'; ctx.lineWidth = 5;
    for (let x = -96; x < 192; x += 15) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + 96, 96); ctx.stroke(); }
    ctx.strokeStyle = 'rgba(255,222,153,.58)'; ctx.lineWidth = 3;
    for (let y = 5; y < 96; y += 13) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(96, y); ctx.stroke(); }
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(2.5, 1.6);
    texture.anisotropy = 2;
    return texture;
  }

  function basketMaterial() {
    return new window.THREE.MeshStandardMaterial({ color: 0xc17a34, map: makeBasketTexture(), roughness: .9, metalness: 0 });
  }

  function parseBasketObj(text) {
    const THREE = window.THREE;
    const vertices = [];
    const positions = [];
    String(text || '').split(/\r?\n/).forEach((line) => {
      const v = line.trim();
      if (v.startsWith('v ')) {
        const [, x, y, z] = v.split(/\s+/); vertices.push([Number(x), Number(y), Number(z)]);
      } else if (v.startsWith('f ')) {
        const ids = v.slice(2).trim().split(/\s+/).map((t) => Number(t.split('/')[0]) - 1);
        for (let i = 1; i < ids.length - 1; i += 1) {
          [ids[0], ids[i], ids[i + 1]].forEach((id) => { const p = vertices[id]; if (p) positions.push(...p); });
        }
      }
    });
    if (positions.length < 9) return null;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.computeVertexNormals();
    const mesh = new THREE.Mesh(geometry, basketMaterial());
    return normalizeObject(mesh);
  }

  async function loadBasket() {
    try {
      const response = await fetch(MODEL_URLS.basket, { cache: 'force-cache' });
      return response.ok ? parseBasketObj(await response.text()) : null;
    } catch { return null; }
  }

  function makeShadowTexture() {
    const THREE = window.THREE;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 64;
    const ctx = canvas.getContext('2d');
    const g = ctx.createRadialGradient(32, 32, 3, 32, 32, 30);
    g.addColorStop(0, 'rgba(6,24,28,.55)'); g.addColorStop(.55, 'rgba(6,24,28,.18)'); g.addColorStop(1, 'rgba(6,24,28,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(canvas);
  }

  function makeWaterTexture() {
    const THREE = window.THREE;
    const canvas = document.createElement('canvas');
    canvas.width = 256; canvas.height = 1024;
    const ctx = canvas.getContext('2d');
    const base = ctx.createLinearGradient(0, 0, 256, 0);
    base.addColorStop(0, '#0b6986'); base.addColorStop(.17, '#1587a5'); base.addColorStop(.5, '#26a3bd'); base.addColorStop(.83, '#1587a5'); base.addColorStop(1, '#0b6986');
    ctx.fillStyle = base; ctx.fillRect(0, 0, 256, 1024);
    for (let y = 10; y < 1024; y += 20) {
      const phase = y * .12;
      ctx.strokeStyle = y % 40 ? 'rgba(180,235,241,.09)' : 'rgba(213,248,250,.15)';
      ctx.lineWidth = y % 40 ? 1 : 1.5;
      ctx.beginPath();
      for (let x = -20; x <= 276; x += 8) {
        const yy = y + Math.sin(x * .06 + phase) * 1.9;
        if (x === -20) ctx.moveTo(x, yy); else ctx.lineTo(x, yy);
      }
      ctx.stroke();
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(1, 2.4); texture.anisotropy = 2;
    return texture;
  }

  function makeWaterDetailTexture() {
    const THREE = window.THREE;
    const canvas = document.createElement('canvas');
    canvas.width = 256; canvas.height = 512;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, 256, 512);
    for (let i = 0; i < 38; i += 1) {
      const x = 12 + ((i * 71) % 232);
      const y = 9 + ((i * 101) % 490);
      const w = 14 + (i % 6) * 9;
      ctx.strokeStyle = `rgba(226,251,250,${.06 + (i % 4) * .025})`;
      ctx.lineWidth = 1 + (i % 3) * .35;
      ctx.beginPath();
      ctx.moveTo(x - w, y);
      ctx.quadraticCurveTo(x, y - 3 - (i % 4), x + w, y + (i % 2 ? 1 : -1));
      ctx.stroke();
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(1.15, 3.2); texture.anisotropy = 2;
    return texture;
  }

  function makeSandTexture() {
    const THREE = window.THREE;
    const canvas = document.createElement('canvas');
    canvas.width = 192; canvas.height = 512;
    const ctx = canvas.getContext('2d');
    const g = ctx.createLinearGradient(0, 0, 192, 0);
    g.addColorStop(0, '#b87b3d'); g.addColorStop(.3, '#ce9957'); g.addColorStop(.7, '#c78d4d'); g.addColorStop(1, '#aa6d36');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 192, 512);
    for (let i = 0; i < 240; i += 1) {
      const x = (i * 53) % 192, y = (i * 91) % 512;
      ctx.fillStyle = i % 3 ? 'rgba(255,224,164,.045)' : 'rgba(74,43,20,.055)';
      ctx.fillRect(x, y, 1 + (i % 2), 1);
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(2.2, 11); texture.anisotropy = 2;
    return texture;
  }

  function makeSkyTexture() {
    const THREE = window.THREE;
    const canvas = document.createElement('canvas');
    canvas.width = 128; canvas.height = 256;
    const ctx = canvas.getContext('2d');
    const g = ctx.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0, '#4f9fc4'); g.addColorStop(.58, '#8cc6d3'); g.addColorStop(1, '#d8b883');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 128, 256);
    return new THREE.CanvasTexture(canvas);
  }

  function makeFallbackRock() {
    const THREE = window.THREE;
    const mesh = new THREE.Mesh(new THREE.DodecahedronGeometry(.58, 0), new THREE.MeshStandardMaterial({ color: 0x4d5351, roughness: .98 }));
    mesh.scale.set(1.25, .75, 1.05);
    return normalizeObject(mesh);
  }

  function makeFallbackLog() {
    const THREE = window.THREE;
    const group = new THREE.Group();
    const wood = new THREE.MeshStandardMaterial({ color: 0x68401f, roughness: .97 });
    const end = new THREE.MeshStandardMaterial({ color: 0xa66c3b, roughness: .94 });
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(.3, .35, 1.7, 7), wood); trunk.rotation.z = Math.PI / 2; group.add(trunk);
    [-.86, .86].forEach((x) => { const cap = new THREE.Mesh(new THREE.CylinderGeometry(.31, .31, .025, 7), end); cap.rotation.z = Math.PI / 2; cap.position.x = x; group.add(cap); });
    return normalizeObject(group);
  }

  function makeCrocodile() {
    const THREE = window.THREE;
    const group = new THREE.Group();
    const green = new THREE.MeshStandardMaterial({ color: 0x315a36, roughness: .9 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x172f1e, roughness: .95 });
    const belly = new THREE.MeshStandardMaterial({ color: 0x668451, roughness: .94 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.55, .28, .5), green); body.position.x = -.12; group.add(body);
    const under = new THREE.Mesh(new THREE.BoxGeometry(1.1, .08, .4), belly); under.position.set(-.02, -.16, 0); group.add(under);
    const head = new THREE.Mesh(new THREE.BoxGeometry(.62, .34, .56), green); head.position.x = .9; group.add(head);
    const snout = new THREE.Mesh(new THREE.BoxGeometry(.56, .2, .43), green); snout.position.x = 1.42; group.add(snout);
    const tail = new THREE.Mesh(new THREE.ConeGeometry(.26, 1.4, 5), green); tail.rotation.z = Math.PI / 2; tail.position.x = -1.35; group.add(tail);
    [-.5, .2].forEach((x) => [-.33, .33].forEach((z) => { const leg = new THREE.Mesh(new THREE.BoxGeometry(.36, .11, .17), dark); leg.position.set(x, -.14, z); leg.rotation.y = z > 0 ? -.35 : .35; group.add(leg); }));
    return normalizeObject(group);
  }

  function makePapyrus() {
    const THREE = window.THREE;
    const group = new THREE.Group();
    const stemMat = new THREE.MeshStandardMaterial({ color: 0x27553a, roughness: .95 });
    const topMat = new THREE.MeshStandardMaterial({ color: 0x4f7b40, roughness: .92, side: THREE.DoubleSide });
    for (let i = 0; i < 9; i += 1) {
      const a = i * 2.39, r = (i % 3) * .085, x = Math.cos(a) * r, z = Math.sin(a) * r;
      const h = .82 + (i % 4) * .12;
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(.018, .03, h, 5), stemMat); stem.position.set(x, h / 2, z); group.add(stem);
      for (let k = 0; k < 7; k += 1) {
        const ray = new THREE.Mesh(new THREE.ConeGeometry(.035, .27, 4), topMat);
        ray.position.set(x, h + .045, z); ray.rotation.z = Math.PI / 2 - .1; ray.rotation.y = k * Math.PI * 2 / 7; group.add(ray);
      }
    }
    return normalizeObject(group);
  }

  function makePickup() {
    const THREE = window.THREE;
    const group = new THREE.Group();
    group.add(new THREE.Mesh(new THREE.IcosahedronGeometry(.23, 1), new THREE.MeshStandardMaterial({ color: 0xffce45, emissive: 0xc67a00, emissiveIntensity: .85, roughness: .36 })));
    const ring = new THREE.Mesh(new THREE.TorusGeometry(.42, .025, 5, 20), new THREE.MeshBasicMaterial({ color: 0xffeaa0, transparent: true, opacity: .74 })); ring.rotation.x = Math.PI / 2; group.add(ring);
    return group;
  }

  function clonePrototype(p) { return p?.clone?.(true) || null; }
  function enableLayer(root, layer) { root?.traverse?.((node) => node.layers?.enable?.(layer)); }

  function makeBank(side, sandTexture) {
    const THREE = window.THREE;
    const sign = side < 0 ? -1 : 1;
    const zNear = 18, zFar = -116, rows = 20;
    const xBands = [RIVER_HALF, 6.75, 8.65, 12.3, 18.5];
    const positions = [];
    for (let rz = 0; rz <= rows; rz += 1) {
      const t = rz / rows, z = lerp(zNear, zFar, t);
      const undulate = Math.sin(t * Math.PI * 5 + side) * .13 + Math.sin(t * Math.PI * 11) * .04;
      const heights = [.02, .28 + undulate * .25, .68 + undulate, .98 + undulate * .7, 1.12 + undulate * .5];
      xBands.forEach((x, bi) => positions.push(sign * (x + Math.sin(t * 9 + bi) * (bi ? .08 : .025)), heights[bi], z));
    }
    const cols = xBands.length;
    const indices = [];
    for (let rz = 0; rz < rows; rz += 1) {
      for (let c = 0; c < cols - 1; c += 1) {
        const a = rz * cols + c, b = a + 1, d = (rz + 1) * cols + c, e = d + 1;
        indices.push(a, d, e, a, e, b);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); geometry.setIndex(indices); geometry.computeVertexNormals();
    const bank = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: 0xb87b3e, map: sandTexture, roughness: 1, metalness: 0, flatShading: false }));

    const wet = new THREE.Mesh(new THREE.PlaneGeometry(.42, 134), new THREE.MeshStandardMaterial({ color: 0x856039, roughness: 1 }));
    wet.rotation.x = -Math.PI / 2; wet.position.set(sign * (RIVER_HALF + .18), .035, -49);

    const belt = new THREE.Mesh(new THREE.PlaneGeometry(1.15, 134), new THREE.MeshStandardMaterial({ color: 0x557248, roughness: .98 }));
    belt.rotation.x = -Math.PI / 2; belt.position.set(sign * 7.18, .34, -49); belt.rotation.z = 0;

    const group = new THREE.Group(); group.add(bank, wet, belt); enableLayer(group, 1); return group;
  }

  function makePyramidGeometry(levels = 10) {
    const THREE = window.THREE;
    const positions = [], indices = [];
    for (let level = 0; level < levels; level += 1) {
      const y0 = level / levels, y1 = (level + 1) / levels;
      const w0 = 1 - level / levels * .88, w1 = 1 - (level + 1) / levels * .88;
      const start = positions.length / 3;
      [[-w0,y0,-w0],[w0,y0,-w0],[w0,y0,w0],[-w0,y0,w0],[-w1,y1,-w1],[w1,y1,-w1],[w1,y1,w1],[-w1,y1,w1]].forEach((p) => positions.push(...p));
      indices.push(start,start+4,start+5,start,start+5,start+1, start+1,start+5,start+6,start+1,start+6,start+2, start+2,start+6,start+7,start+2,start+7,start+3, start+3,start+7,start+4,start+3,start+4,start);
      if (level === levels - 1) indices.push(start+4,start+7,start+6,start+4,start+6,start+5);
    }
    const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); geometry.setIndex(indices); geometry.computeVertexNormals(); return geometry;
  }

  function makePyramidModel(scale = 1, color = 0xc18b4d) {
    const THREE = window.THREE;
    const group = new THREE.Group();
    const pyramid = new THREE.Mesh(makePyramidGeometry(11), new THREE.MeshStandardMaterial({ color, roughness: 1, flatShading: true }));
    pyramid.scale.set(3.9 * scale, 5.2 * scale, 3.9 * scale); group.add(pyramid);
    const base = new THREE.Mesh(new THREE.BoxGeometry(8.6 * scale, .28 * scale, 8.6 * scale), new THREE.MeshStandardMaterial({ color: 0x9d6b39, roughness: 1 })); base.position.y = -.14 * scale; group.add(base);
    const entrance = new THREE.Mesh(new THREE.BoxGeometry(.42 * scale, .68 * scale, .22 * scale), new THREE.MeshBasicMaterial({ color: 0x4c3325 })); entrance.position.set(0, .32 * scale, 4.0 * scale); group.add(entrance);
    enableLayer(group, 1); return group;
  }

  function mountPyramids(state) {
    const entries = [
      [-15.8, -94, 1.22, 0xb9874e, -.05],
      [13.7, -101, 1.02, 0xc99a5b, .04],
      [-5.0, -110, .72, 0xd0a665, -.02],
    ];
    entries.forEach(([x,z,scale,color,rot]) => { const p = makePyramidModel(scale, color); p.position.set(x, .72, z); p.rotation.y = rot; state.scene.add(p); state.pyramids.push(p); });
  }

  function makeFlowStreaks(state) {
    const THREE = window.THREE;
    const material = new THREE.MeshBasicMaterial({ color: 0xcdf2f3, transparent: true, opacity: .13, depthWrite: false });
    for (let i = 0; i < 22; i += 1) {
      const streak = new THREE.Mesh(new THREE.PlaneGeometry(.48 + (i % 5) * .2, .032), material);
      streak.rotation.x = -Math.PI / 2; streak.position.set(-4.8 + ((i * 1.71) % 9.6), .06, -1.5 - i * 4.15); enableLayer(streak, 2); state.scene.add(streak); state.flowStreaks.push(streak);
    }
  }

  function makeStaticScene(state) {
    const THREE = window.THREE;
    const skyTexture = makeSkyTexture();
    const sky = new THREE.Mesh(new THREE.PlaneGeometry(180, 100), new THREE.MeshBasicMaterial({ map: skyTexture, depthWrite: false })); sky.position.set(0, 27, -116); state.scene.add(sky); state.skyTexture = skyTexture;
    const sun = new THREE.Mesh(new THREE.CircleGeometry(3.7, 24), new THREE.MeshBasicMaterial({ color: 0xf3c978, transparent: true, opacity: .45 })); sun.position.set(15, 19, -111); state.scene.add(sun);
    mountPyramids(state);

    const waterTexture = makeWaterTexture();
    const waterDetailTexture = makeWaterDetailTexture();
    const waterGeometry = new THREE.PlaneGeometry(RIVER_HALF * 2, 144, 12, 40);
    const pos = waterGeometry.attributes.position;
    for (let i = 0; i < pos.count; i += 1) { const x = pos.getX(i), y = pos.getY(i); pos.setZ(i, Math.sin(y * .11 + x * .72) * .028 + Math.cos(x * 1.1 + y * .035) * .012); }
    pos.needsUpdate = true; waterGeometry.computeVertexNormals();
    const water = new THREE.Mesh(waterGeometry, new THREE.MeshStandardMaterial({ color: 0x0d7794, map: waterTexture, roughness: .7, metalness: .01, emissive: 0x031e27, emissiveIntensity: .035 }));
    water.rotation.x = -Math.PI / 2; water.position.set(0, 0, -49); enableLayer(water, 2); state.scene.add(water); state.water = water; state.waterTexture = waterTexture;
    const detail = new THREE.Mesh(new THREE.PlaneGeometry(RIVER_HALF * 2 - .12, 143), new THREE.MeshBasicMaterial({ map: waterDetailTexture, transparent: true, opacity: .58, depthWrite: false, blending: THREE.NormalBlending }));
    detail.rotation.x = -Math.PI / 2; detail.position.set(0, .055, -49); enableLayer(detail, 2); state.scene.add(detail); state.waterDetail = detail; state.waterDetailTexture = waterDetailTexture;

    const sandTexture = makeSandTexture(); state.sandTexture = sandTexture; state.scene.add(makeBank(-1, sandTexture), makeBank(1, sandTexture));
    const foamMat = new THREE.MeshBasicMaterial({ color: 0xd4efea, transparent: true, opacity: .2, depthWrite: false });
    [-1, 1].forEach((side) => { const foam = new THREE.Mesh(new THREE.PlaneGeometry(.18, 135), foamMat); foam.rotation.x = -Math.PI / 2; foam.position.set(side * (RIVER_HALF - .05), .065, -49); enableLayer(foam, 2); state.scene.add(foam); });
    makeFlowStreaks(state);

    state.scene.add(new THREE.HemisphereLight(0x91c9d9, 0x5b412d, .54));
    const globalSun = new THREE.DirectionalLight(0xffd09a, .78); globalSun.position.set(-8, 12, 8); globalSun.target.position.set(0, .2, -24); state.scene.add(globalSun, globalSun.target);
    state.scene.add(new THREE.AmbientLight(0x668995, .075));
    const landLight = new THREE.DirectionalLight(0xffbd68, .48); landLight.position.set(-10, 8, 3); landLight.target.position.set(0, .4, -30); landLight.layers.set(1); state.scene.add(landLight, landLight.target);
    const riverLight = new THREE.DirectionalLight(0x65c6eb, .34); riverLight.position.set(7, 9, 4); riverLight.target.position.set(0, 0, -18); riverLight.layers.set(2); state.scene.add(riverLight, riverLight.target);
    const playerFill = new THREE.PointLight(0xffc98f, .42, 19, 1.8); playerFill.position.set(0, 4.2, 5.4); state.scene.add(playerFill); state.playerFill = playerFill;
  }

  function addBlobShadow(group, x = 1.3, z = .75, opacity = .48) {
    const THREE = window.THREE;
    const shadow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: active?.shadowTexture || null, transparent: true, opacity, depthWrite: false }));
    shadow.rotation.x = -Math.PI / 2; shadow.position.y = .035; shadow.scale.set(x, z, 1); group.add(shadow);
  }

  function makeBasketVisual(state, force = false) {
    const THREE = window.THREE;
    if (state.basketModel && !force) return state.basketModel;
    if (state.basketModel) state.scene.remove(state.basketModel);
    const group = new THREE.Group();
    const loaded = clonePrototype(state.prototypes.basket);
    if (loaded) { loaded.scale.setScalar(2.0); loaded.position.y = .46; loaded.rotation.y = Math.PI; group.add(loaded); state.basketUsesLoadedModel = true; }
    else {
      const shell = new THREE.Mesh(new THREE.CylinderGeometry(.9, .62, .62, 12, 1, true), basketMaterial()); shell.scale.z = .78; shell.position.y = .43; group.add(shell);
      const bottom = new THREE.Mesh(new THREE.CylinderGeometry(.62, .62, .1, 12), basketMaterial()); bottom.scale.z = .78; bottom.position.y = .13; group.add(bottom); state.basketUsesLoadedModel = false;
    }
    const rim = new THREE.Mesh(new THREE.TorusGeometry(.78, .07, 7, 20), new THREE.MeshStandardMaterial({ color: 0x6d391a, roughness: .9 })); rim.rotation.x = Math.PI / 2; rim.scale.z = .78; rim.position.y = .72; group.add(rim);
    const cloth = new THREE.Mesh(new THREE.SphereGeometry(.42, 12, 7), new THREE.MeshStandardMaterial({ color: 0xe2cda0, roughness: .98 })); cloth.scale.set(1.24, .34, .72); cloth.position.set(0, .68, -.02); group.add(cloth);
    const handle = new THREE.Mesh(new THREE.TorusGeometry(.72, .055, 7, 22, Math.PI), new THREE.MeshStandardMaterial({ color: 0x633419, roughness: .94 })); handle.rotation.x = Math.PI / 2; handle.rotation.z = Math.PI; handle.position.set(0, .9, .03); group.add(handle);
    const wake = new THREE.Mesh(new THREE.PlaneGeometry(2.5, 1.1), new THREE.MeshBasicMaterial({ color: 0xd3f1ed, transparent: true, opacity: .15, depthWrite: false })); wake.rotation.x = -Math.PI / 2; wake.position.set(0, .06, .58); group.add(wake);
    addBlobShadow(group, 2.05, 1.0, .5); group.scale.setScalar(1.02); state.scene.add(group); state.basketModel = group; return group;
  }

  function makeEntityVisual(state, el, type) {
    const THREE = window.THREE;
    const group = new THREE.Group();
    let model = type === 'pickup' ? makePickup() : type === 'reeds' ? clonePrototype(state.prototypes.reeds) : clonePrototype(state.prototypes[type]);
    if (!model) return null;
    const scale = { rock: 1.55, reeds: 1.8, log: 2.05, crocodile: 2.35, pickup: 1.2 }[type] || 1.4;
    model.scale.setScalar(scale);
    if (type === 'log') { model.rotation.y = Math.PI / 2 + .08; model.position.y = .33; }
    else if (type === 'rock') { model.rotation.y = .42; model.position.y = .4; }
    else if (type === 'reeds') model.position.y = .6;
    else if (type === 'crocodile') { model.rotation.y = -Math.PI / 2; model.position.y = .3; }
    else model.position.y = 1.1;
    group.add(model); if (type !== 'pickup') addBlobShadow(group, type === 'log' ? 2.5 : type === 'crocodile' ? 2.7 : 1.65, type === 'log' ? .78 : 1, .48);
    group.userData.currentX = 0; group.userData.phase = Math.random() * Math.PI * 2; state.scene.add(group);
    const emoji = el.querySelector('.mnr-object__emoji'); if (emoji) emoji.style.visibility = 'hidden'; return group;
  }

  function inferEntityType(el) {
    if (el.classList.contains('mnr-object--pickup')) return 'pickup';
    for (const key of ['rock', 'reeds', 'log', 'crocodile']) if (el.classList.contains(`mnr-object--${key}`)) return key;
    return '';
  }
  function laneFromInlineStyle(el) { const left = Number.parseFloat(el.style.left || '50'); return left < 41 ? -1 : left > 59 ? 1 : 0; }
  function progressFromInlineStyle(el) { return clamp((Number.parseFloat(el.style.top || '23') - 23) / 67, 0, 1.08); }

  function syncEntities(state, now) {
    const alive = new Set();
    state.stage.querySelectorAll('.mnr-object').forEach((el) => {
      const type = inferEntityType(el); if (!type) return;
      let group = state.entityModels.get(el); if (!group) { group = makeEntityVisual(state, el, type); if (!group) return; state.entityModels.set(el, group); }
      alive.add(el);
      const progress = progressFromInlineStyle(el), targetX = laneFromInlineStyle(el) * LANE_X;
      group.userData.currentX = lerp(group.userData.currentX ?? targetX, targetX, type === 'crocodile' ? .09 : .2);
      group.position.set(group.userData.currentX, 0, lerp(FAR_Z, NEAR_Z, Math.pow(smoothstep(progress), .86)));
      group.visible = progress < 1.075;
      if (type === 'pickup') { group.rotation.y += .034; group.position.y = .12 + Math.sin(now * .005 + group.userData.phase) * .11; }
      else if (type === 'log') group.rotation.z = -.035 + Math.sin(now * .0022 + group.userData.phase) * .04;
      else if (type === 'crocodile') group.rotation.z = Math.sin(now * .004 + group.userData.phase) * .03;
      else if (type === 'reeds') group.rotation.z = Math.sin(now * .002 + group.userData.phase) * .04;
      group.scale.setScalar(el.classList.contains('is-hit') || el.classList.contains('is-collected') ? .82 : 1);
    });
    for (const [el, group] of state.entityModels.entries()) if (!alive.has(el) || !el.isConnected) { state.scene.remove(group); state.entityModels.delete(el); }
  }

  function syncBasket(state, now) {
    const host = state.stage.querySelector('#mnr-basket'); if (!host) return;
    if (!state.basketModel) makeBasketVisual(state);
    const targetX = laneFromInlineStyle(host) * LANE_X; state.basketX = lerp(state.basketX, targetX, .2);
    const boosting = host.classList.contains('is-boosting'), hit = host.classList.contains('is-hit');
    state.basketModel.position.set(state.basketX, boosting ? .12 : .02, 4.05 + (boosting ? -1 : 0));
    state.basketModel.rotation.y = lerp(state.basketModel.rotation.y, -state.basketX * .06, .14);
    state.basketModel.rotation.z = lerp(state.basketModel.rotation.z, hit ? Math.sin(now * .04) * .13 : -state.basketX * .034, .2);
    state.basketModel.rotation.x = boosting ? -.09 : Math.sin(now * .0026) * .024;
    if (state.playerFill) state.playerFill.position.x = state.basketX * .55;
  }

  function createDecoration(state, key, x, z, scale, rotation = 0) {
    const model = clonePrototype(state.prototypes[key]); if (!model) return;
    const group = new window.THREE.Group(); model.scale.setScalar(scale); model.rotation.y = rotation; group.add(model);
    const y = key === 'palm' ? 1.0 : key === 'bush' ? .76 : key === 'grass' ? .64 : key === 'bankPlant' || key === 'plant' ? .72 : .7;
    group.position.set(x, y, z); enableLayer(group, 1); state.scene.add(group); state.decorations.push(group);
  }

  function mountDecorations(state) {
    if (state.decorations.length) return;
    const slots = [
      ['palm',-9.8,-10,4.2,.45],['palm',9.6,-24,3.7,-.9],['palm',-10.6,-45,4.3,.7],['palm',9.8,-64,4.0,-1.05],['palm',-9.2,-82,3.5,.3],
      ['bush',-7.45,-12,2.1,.2],['grass',-6.85,-14,1.35,-.4],['bankPlant',-6.55,-16,1.6,.5],
      ['bankPlant',6.5,-25,1.7,-.2],['grass',6.85,-27,1.4,.6],['bush',7.4,-29,2.0,-.5],
      ['bush',-7.6,-37,1.8,.1],['bankPlant',-6.55,-40,1.55,.3],['grass',-6.8,-43,1.35,-.2],
      ['grass',6.6,-48,1.45,.4],['bankPlant',6.45,-51,1.65,-.5],['bush',7.45,-54,2.05,.2],
      ['bankPlant',-6.5,-59,1.55,.1],['grass',-6.8,-62,1.4,.5],['bush',-7.55,-65,1.85,-.4],
      ['bush',7.4,-72,1.9,.4],['grass',6.8,-75,1.35,-.2],['bankPlant',6.55,-78,1.55,.3],
      ['rock',8.5,-18,1.25,.4],['rock',-8.5,-33,1.05,-.3],['rock',8.2,-58,1.3,.7],['rock',-8.8,-76,1.15,.15],
    ];
    slots.forEach((args) => createDecoration(state, ...args));
  }

  function makeSandMarkers(state) {
    const THREE = window.THREE;
    const mat = new THREE.MeshStandardMaterial({ color: 0x71471f, roughness: 1, transparent: true, opacity: .16 });
    for (let i = 0; i < 10; i += 1) [-1,1].forEach((side) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(1.3 + (i % 3) * .45, .34), mat); m.rotation.x = -Math.PI / 2; m.rotation.z = (i % 2 ? .18 : -.14) * side; m.position.set(side * (8.5 + (i % 2)), .73, -5 - i * 8.5 - side); enableLayer(m, 1); state.scene.add(m); state.sandMarkers.push(m); });
  }

  function updateEnvironment(state, dt, running) {
    if (!running) return;
    const boost = state.stage.querySelector('#mnr-basket')?.classList.contains('is-boosting'); const speed = boost ? 23 : 15.5;
    state.decorations.forEach((g) => { g.position.z += dt * speed; if (g.position.z > 13) g.position.z -= ENV_WRAP_LENGTH; });
    state.sandMarkers.forEach((g) => { g.position.z += dt * speed; if (g.position.z > 13) g.position.z -= ENV_WRAP_LENGTH; });
    state.flowStreaks.forEach((g, i) => { g.position.z += dt * speed * 1.08; if (g.position.z > 10) g.position.z -= ENV_WRAP_LENGTH + (i % 3) * 2; });
  }

  function resizeRenderer(state) {
    const rect = state.stage.getBoundingClientRect(); const width = Math.max(1, Math.round(rect.width)), height = Math.max(1, Math.round(rect.height));
    if (state.width === width && state.height === height) return;
    state.width = width; state.height = height; state.renderer.setSize(width, height, false); state.camera.aspect = width / height; state.camera.updateProjectionMatrix();
  }

  function isRunning() {
    return Boolean(document.getElementById('mnr-intro')?.classList.contains('hidden') && document.getElementById('mnr-result')?.classList.contains('hidden') && !document.getElementById('mnr-pause-tag')?.classList.contains('is-on'));
  }

  function renderFrame(state, now) {
    if (active !== state) return;
    if (document.body.dataset.currentGame !== GAME_KEY || !state.stage.isConnected) { cleanup(); return; }
    state.raf = requestAnimationFrame((time) => renderFrame(state, time));
    if (document.hidden || now - state.lastRender < MIN_FRAME_MS) return;
    const dt = clamp((now - state.lastRender) / 1000, 0, .06); state.lastRender = now; resizeRenderer(state); const running = isRunning();
    if (running) {
      state.waterTexture.offset.y -= dt * .082; state.waterTexture.offset.x = Math.sin(now * .0002) * .005;
      state.waterDetailTexture.offset.y -= dt * .135; state.waterDetailTexture.offset.x = Math.sin(now * .00031) * .012;
    }
    syncBasket(state, now); syncEntities(state, now); updateEnvironment(state, dt, running);
    state.camera.position.x = lerp(state.camera.position.x, state.basketX * .1, .08); state.camera.position.y = 6.55 + Math.sin(now * .0011) * .016; state.camera.lookAt(state.camera.position.x * .05, .3, -15.5); state.renderer.render(state.scene, state.camera);
  }

  async function loadPrototypes(state) {
    if (totalRemoteBudget() > REMOTE_MODEL_BUDGET) return;
    const entries = await Promise.all(Object.entries({
      basket: loadBasket(), rock: loadGltf(MODEL_URLS.rock), plant: loadGltf(MODEL_URLS.plant), bush: loadGltf(MODEL_URLS.bush), grass: loadGltf(MODEL_URLS.grass), bankPlant: loadGltf(MODEL_URLS.bankPlant), log: loadGltf(MODEL_URLS.log), raft: loadGltf(MODEL_URLS.raft), palm: loadGltf(MODEL_URLS.palm),
    }).map(async ([key, promise]) => [key, await promise]));
    if (active !== state) { entries.forEach(([, model]) => disposeObject(model)); return; }
    entries.forEach(([key, model]) => { if (model) state.prototypes[key] = model; });
    if (!state.prototypes.rock) state.prototypes.rock = makeFallbackRock();
    if (!state.prototypes.log) state.prototypes.log = makeFallbackLog();
    if (!state.prototypes.palm) state.prototypes.palm = state.prototypes.plant || null;
    if (!state.prototypes.bush) state.prototypes.bush = state.prototypes.plant || null;
    if (!state.prototypes.grass) state.prototypes.grass = state.prototypes.plant || null;
    if (!state.prototypes.bankPlant) state.prototypes.bankPlant = state.prototypes.plant || null;
    mountDecorations(state);
    if (state.prototypes.basket && !state.basketUsesLoadedModel) makeBasketVisual(state, true);
    state.stage.classList.add('mnr-stage--full-3d'); state.ready3D = true;
  }

  async function start() {
    cleanup();
    if (document.body.dataset.currentGame !== GAME_KEY) return false;
    const stage = document.getElementById('mnr-stage'); if (!stage) return false;
    const deps = await withTimeout(ensureDependencies(), 7500); if (!deps || !window.THREE || document.body.dataset.currentGame !== GAME_KEY || !stage.isConnected) return false;
    ensureSceneStyle(); const THREE = window.THREE;
    const renderer = new THREE.WebGLRenderer({ alpha: false, antialias: false, powerPreference: 'low-power', preserveDrawingBuffer: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO)); renderer.setClearColor(0x679eb2, 1); renderer.shadowMap.enabled = false; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = .76; if ('outputEncoding' in renderer) renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.domElement.className = 'mnr-3d-canvas'; Object.assign(renderer.domElement.style, { position:'absolute', inset:'0', width:'100%', height:'100%', zIndex:'4', pointerEvents:'none' }); stage.appendChild(renderer.domElement);
    const scene = new THREE.Scene(); scene.background = new THREE.Color(0x6fa8b8); scene.fog = new THREE.Fog(0x8fb7b8, 64, 132);
    const camera = new THREE.PerspectiveCamera(56, 1, .1, 190); camera.position.set(0, 6.55, 11.25); camera.lookAt(0, .3, -15.5); camera.layers.enable(1); camera.layers.enable(2);
    const state = {
      stage, renderer, scene, camera, prototypes:Object.create(null), entityModels:new Map(), decorations:[], sandMarkers:[], flowStreaks:[], pyramids:[], basketModel:null, basketUsesLoadedModel:false, basketX:0, shadowTexture:null, skyTexture:null, sandTexture:null, waterTexture:null, waterDetailTexture:null, water:null, waterDetail:null, playerFill:null, width:0, height:0, raf:0, lastRender:performance.now(), onResize:null, onPageHide:null, ready3D:false,
    };
    active = state; state.shadowTexture = makeShadowTexture(); state.prototypes.crocodile = makeCrocodile(); state.prototypes.reeds = makePapyrus(); state.prototypes.rock = makeFallbackRock(); state.prototypes.log = makeFallbackLog();
    makeStaticScene(state); makeSandMarkers(state); makeBasketVisual(state); resizeRenderer(state);
    state.onResize = () => { state.width = 0; resizeRenderer(state); }; state.onPageHide = () => cleanup(); window.addEventListener('resize', state.onResize, { passive:true }); window.addEventListener('pagehide', state.onPageHide, { once:true });
    state.raf = requestAnimationFrame((time) => renderFrame(state, time)); loadPrototypes(state).catch((error) => console.warn('[Moses 3D] optional asset load failed', error)); return true;
  }

  function cleanup() {
    const state = active; if (!state) return; active = null; if (state.raf) cancelAnimationFrame(state.raf); window.removeEventListener('resize', state.onResize); window.removeEventListener('pagehide', state.onPageHide); state.stage?.classList.remove('mnr-stage--full-3d'); state.stage?.querySelectorAll('.mnr-object__emoji').forEach((emoji) => { emoji.style.visibility = ''; });
    Object.values(state.prototypes).forEach((model) => disposeObject(model));
    for (const texture of [state.shadowTexture,state.skyTexture,state.sandTexture,state.waterTexture,state.waterDetailTexture]) try { texture?.dispose?.(); } catch {}
    try { state.renderer.dispose(); } catch {} try { state.renderer.forceContextLoss?.(); } catch {} try { state.renderer.domElement.remove(); } catch {}
  }

  window.__startMosesNile3D = start;
  window.__cleanupMosesNile3D = cleanup;
  window.__mosesNile3DModelBudget = Object.freeze({ remoteBytes: totalRemoteBudget(), remoteLimit: REMOTE_MODEL_BUDGET, urls: MODEL_URLS });
})();
