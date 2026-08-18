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
    log: `${MODEL_ROOT}/survival_pack/WoodLog.glb`,
    raft: `${MODEL_ROOT}/survival_pack/Raft.glb`,
    palm: `${MODEL_ROOT}/nature_pack/PalmTree_4.glb`,
  });
  const REMOTE_MODEL_BYTES = Object.freeze({ rock: 5516, plant: 16040, log: 13904, raft: 58392, palm: 63764 });
  const REMOTE_MODEL_BUDGET = 170000;
  const MAX_PIXEL_RATIO = 1.25;
  const MIN_FRAME_MS = 30;
  const FAR_Z = -74;
  const NEAR_Z = 5.2;
  const RIVER_HALF = 5.8;
  const LANE_X = 2.15;
  const ENV_WRAP_LENGTH = 92;
  const SCENE_STYLE_ID = 'moses-nile-full-3d-style-v2';

  let active = null;
  let dependencyPromise = null;
  const scriptPromises = new Map();

  function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function totalRemoteBudget() { return Object.values(REMOTE_MODEL_BYTES).reduce((sum, value) => sum + value, 0); }

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
        try {
          if (typeof window.__loadThree === 'function') ok = Boolean(await window.__loadThree());
        } catch {}
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

  function withTimeout(promise, ms = 5000) {
    return Promise.race([promise, new Promise((resolve) => setTimeout(() => resolve(null), ms))]);
  }

  function ensureSceneStyle() {
    if (document.getElementById(SCENE_STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = SCENE_STYLE_ID;
    style.textContent = `
.mnr-stage.mnr-stage--full-3d{background:#9cdcf1!important}
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
    if (!material) return;
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
    if (!root) return;
    root.traverse?.((node) => {
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
    const maxDim = Math.max(size.x, size.y, size.z, 0.0001);
    object.position.sub(center);
    const inner = new THREE.Group();
    inner.add(object);
    inner.scale.setScalar(1 / maxDim);
    const outer = new THREE.Group();
    outer.add(inner);
    return outer;
  }

  function brightenLoadedObject(root) {
    const THREE = window.THREE;
    root.traverse?.((node) => {
      if (!node?.isMesh) return;
      node.castShadow = false;
      node.receiveShadow = false;
      const list = Array.isArray(node.material) ? node.material : [node.material];
      const next = list.map((material) => {
        if (!material) return material;
        const clone = material.clone();
        if (clone.color) clone.color.lerp(new THREE.Color(0xffffff), 0.12);
        if ('roughness' in clone) clone.roughness = Math.max(0.62, Number(clone.roughness ?? 0.82));
        if ('metalness' in clone) clone.metalness = Math.min(0.08, Number(clone.metalness ?? 0));
        if (clone.color && 'emissive' in clone) {
          clone.emissive = clone.color.clone().multiplyScalar(0.035);
          clone.emissiveIntensity = 0.32;
        }
        clone.side = THREE.DoubleSide;
        return clone;
      });
      node.material = Array.isArray(node.material) ? next : next[0];
    });
    return root;
  }

  function basketMaterial() {
    const THREE = window.THREE;
    const canvas = document.createElement('canvas');
    canvas.width = 96;
    canvas.height = 96;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      const gradient = ctx.createLinearGradient(0, 0, 96, 96);
      gradient.addColorStop(0, '#d9a35d');
      gradient.addColorStop(0.5, '#a9672d');
      gradient.addColorStop(1, '#e0b268');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, 96, 96);
      ctx.strokeStyle = 'rgba(92,49,20,.74)';
      ctx.lineWidth = 5;
      for (let x = -96; x < 192; x += 16) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + 96, 96); ctx.stroke();
      }
      ctx.strokeStyle = 'rgba(245,205,132,.58)';
      ctx.lineWidth = 3;
      for (let y = 6; y < 96; y += 14) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(96, y); ctx.stroke();
      }
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(2.4, 1.6);
    texture.anisotropy = 2;
    return new THREE.MeshStandardMaterial({ color: 0xc88743, map: texture, roughness: 0.9, metalness: 0 });
  }

  function parseBasketObj(text) {
    const THREE = window.THREE;
    const vertices = [];
    const positions = [];
    String(text || '').split(/\r?\n/).forEach((line) => {
      const value = line.trim();
      if (value.startsWith('v ')) {
        const [, x, y, z] = value.split(/\s+/);
        vertices.push([Number(x), Number(y), Number(z)]);
      } else if (value.startsWith('f ')) {
        const ids = value.slice(2).trim().split(/\s+/).map((token) => Number(token.split('/')[0]) - 1);
        if (ids.length < 3) return;
        for (let i = 1; i < ids.length - 1; i += 1) {
          [ids[0], ids[i], ids[i + 1]].forEach((id) => {
            const vertex = vertices[id];
            if (vertex) positions.push(vertex[0], vertex[1], vertex[2]);
          });
        }
      }
    });
    if (positions.length < 9) throw new Error('Basket OBJ has no triangle geometry');
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
    const mesh = new THREE.Mesh(geometry, basketMaterial());
    mesh.rotation.x = -0.06;
    return normalizeObject(mesh);
  }

  async function loadBasket() {
    try {
      const response = await fetch(MODEL_URLS.basket, { cache: 'force-cache' });
      if (!response.ok) return null;
      return parseBasketObj(await response.text());
    } catch { return null; }
  }

  async function loadGltf(url) {
    const THREE = window.THREE;
    try {
      const scene = await withTimeout(new Promise((resolve) => {
        const loader = new THREE.GLTFLoader();
        loader.load(url, (gltf) => resolve(gltf?.scene || null), undefined, () => resolve(null));
      }), 6500);
      if (!scene) return null;
      return normalizeObject(brightenLoadedObject(scene));
    } catch { return null; }
  }

  function makeShadowTexture() {
    const THREE = window.THREE;
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    const g = ctx.createRadialGradient(32, 32, 3, 32, 32, 30);
    g.addColorStop(0, 'rgba(20,38,38,.35)');
    g.addColorStop(.55, 'rgba(20,38,38,.16)');
    g.addColorStop(1, 'rgba(20,38,38,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    return texture;
  }

  function makeWaterTexture() {
    const THREE = window.THREE;
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');
    const g = ctx.createLinearGradient(0, 0, 0, 512);
    g.addColorStop(0, '#73cfe2');
    g.addColorStop(.48, '#2c9fc1');
    g.addColorStop(1, '#176f91');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 512);
    for (let y = 16; y < 512; y += 38) {
      const width = 34 + (y % 92);
      const x = (y * 17) % 128;
      ctx.strokeStyle = y % 76 ? 'rgba(229,250,255,.16)' : 'rgba(255,255,255,.25)';
      ctx.lineWidth = y % 76 ? 2 : 3;
      ctx.beginPath();
      ctx.moveTo(x - width, y);
      ctx.quadraticCurveTo(x, y - 4, x + width, y);
      ctx.stroke();
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(1.2, 5.5);
    texture.anisotropy = 2;
    return texture;
  }

  function makeSkyTexture() {
    const THREE = window.THREE;
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    const g = ctx.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0, '#72c5ec');
    g.addColorStop(.58, '#cdeef5');
    g.addColorStop(1, '#f5d9a2');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 256);
    return new THREE.CanvasTexture(canvas);
  }

  function makeCrocodile() {
    const THREE = window.THREE;
    const root = new THREE.Group();
    const green = new THREE.MeshStandardMaterial({ color: 0x4f813e, roughness: 0.84, metalness: 0 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x29472b, roughness: 0.9, metalness: 0 });
    const belly = new THREE.MeshStandardMaterial({ color: 0x80995b, roughness: 0.9, metalness: 0 });
    const eye = new THREE.MeshStandardMaterial({ color: 0xe9db87, roughness: 0.65, metalness: 0 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.55, .24, .44), green); body.position.x = -.12; root.add(body);
    const underside = new THREE.Mesh(new THREE.BoxGeometry(1.12, .08, .38), belly); underside.position.set(-.02, -.14, 0); root.add(underside);
    const head = new THREE.Mesh(new THREE.BoxGeometry(.58, .3, .5), green); head.position.x = .88; root.add(head);
    const snout = new THREE.Mesh(new THREE.BoxGeometry(.5, .18, .4), green); snout.position.x = 1.35; root.add(snout);
    const tail = new THREE.Mesh(new THREE.ConeGeometry(.24, 1.28, 5), green); tail.rotation.z = Math.PI / 2; tail.position.x = -1.28; root.add(tail);
    [-.48, .18].forEach((x) => [-.31, .31].forEach((z) => {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(.34, .1, .16), dark);
      leg.position.set(x, -.12, z); leg.rotation.y = z > 0 ? -.35 : .35; root.add(leg);
    }));
    [-.16, .16].forEach((z) => {
      const ball = new THREE.Mesh(new THREE.SphereGeometry(.065, 6, 4), eye); ball.position.set(.96, .19, z); root.add(ball);
      const pupil = new THREE.Mesh(new THREE.SphereGeometry(.026, 5, 3), dark); pupil.position.set(1.015, .205, z); root.add(pupil);
    });
    return normalizeObject(root);
  }

  function makePapyrus() {
    const THREE = window.THREE;
    const group = new THREE.Group();
    const stemMat = new THREE.MeshStandardMaterial({ color: 0x477d49, roughness: .9 });
    const topMat = new THREE.MeshStandardMaterial({ color: 0x71a24f, roughness: .86, side: THREE.DoubleSide });
    const offsets = [-.2, -.1, 0, .11, .21];
    offsets.forEach((x, i) => {
      const h = .78 + (i % 3) * .12;
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(.025, .035, h, 5), stemMat);
      stem.position.set(x, h / 2, (i % 2 ? .08 : -.06));
      stem.rotation.z = (i - 2) * .035;
      group.add(stem);
      for (let r = 0; r < 5; r += 1) {
        const leaf = new THREE.Mesh(new THREE.ConeGeometry(.07, .28, 4), topMat);
        leaf.position.set(x, h + .05, stem.position.z);
        leaf.rotation.z = Math.PI / 2 - .18;
        leaf.rotation.y = (Math.PI * 2 * r) / 5;
        group.add(leaf);
      }
    });
    return normalizeObject(group);
  }

  function makePickup() {
    const THREE = window.THREE;
    const group = new THREE.Group();
    const core = new THREE.Mesh(new THREE.IcosahedronGeometry(.22, 1), new THREE.MeshStandardMaterial({
      color: 0xffdf65, emissive: 0xffb300, emissiveIntensity: 1.8, roughness: .38, metalness: .02,
    }));
    group.add(core);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xfff2a3, transparent: true, opacity: .58, side: THREE.DoubleSide });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(.4, .025, 5, 18), ringMat); ring.rotation.x = Math.PI / 2; group.add(ring);
    return group;
  }

  function makeFallbackRock() {
    const THREE = window.THREE;
    const mesh = new THREE.Mesh(new THREE.DodecahedronGeometry(.55, 0), new THREE.MeshStandardMaterial({ color: 0x686b69, roughness: .96 }));
    mesh.scale.set(1.2, .75, 1);
    return normalizeObject(mesh);
  }

  function makeFallbackLog() {
    const THREE = window.THREE;
    const group = new THREE.Group();
    const wood = new THREE.MeshStandardMaterial({ color: 0x8a542e, roughness: .95 });
    const end = new THREE.MeshStandardMaterial({ color: 0xc58b56, roughness: .9 });
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(.28, .33, 1.6, 7), wood); trunk.rotation.z = Math.PI / 2; group.add(trunk);
    const capA = new THREE.Mesh(new THREE.CylinderGeometry(.29, .29, .02, 7), end); capA.rotation.z = Math.PI / 2; capA.position.x = -.81; group.add(capA);
    const capB = capA.clone(); capB.position.x = .81; group.add(capB);
    return normalizeObject(group);
  }

  function clonePrototype(prototype) { return prototype?.clone?.(true) || null; }

  function makeBank(side) {
    const THREE = window.THREE;
    const s = side < 0 ? -1 : 1;
    const zNear = 14;
    const zFar = -110;
    const inner = RIVER_HALF;
    const ridge = 7.4;
    const outer = 18;
    const vertices = new Float32Array([
      s * inner, .02, zNear, s * ridge, .62, zNear, s * outer, .82, zNear,
      s * inner, .02, zFar, s * ridge, .62, zFar, s * outer, .82, zFar,
    ]);
    const indices = [0, 3, 4, 0, 4, 1, 1, 4, 5, 1, 5, 2];
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    const sand = new THREE.MeshStandardMaterial({ color: 0xd8ba73, roughness: .98, metalness: 0 });
    const bank = new THREE.Mesh(geometry, sand);

    const greenGeometry = new THREE.BufferGeometry();
    const gInner = 7.25;
    const gOuter = 8.5;
    greenGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array([
      s * gInner, .655, zNear, s * gOuter, .695, zNear,
      s * gInner, .655, zFar, s * gOuter, .695, zFar,
    ]), 3));
    greenGeometry.setIndex([0, 2, 3, 0, 3, 1]);
    greenGeometry.computeVertexNormals();
    const green = new THREE.Mesh(greenGeometry, new THREE.MeshStandardMaterial({ color: 0x8fae58, roughness: .95 }));

    const edge = new THREE.Mesh(new THREE.BoxGeometry(.22, .22, 124), new THREE.MeshStandardMaterial({ color: 0x9b7b46, roughness: 1 }));
    edge.position.set(s * (RIVER_HALF + .02), -.08, -48);

    const group = new THREE.Group();
    group.add(bank, green, edge);
    return group;
  }

  function makeDistantLandscape() {
    const THREE = window.THREE;
    const group = new THREE.Group();
    const matA = new THREE.MeshStandardMaterial({ color: 0xc99f62, roughness: 1 });
    const matB = new THREE.MeshStandardMaterial({ color: 0xe0bb77, roughness: 1 });
    const positions = [
      [-13, -91, 7, 10, matA], [-6, -96, 4, 6, matB], [7, -94, 5, 8, matA], [14, -92, 7, 11, matB],
    ];
    positions.forEach(([x, z, radius, height, material]) => {
      const hill = new THREE.Mesh(new THREE.ConeGeometry(radius, height, 5), material);
      hill.position.set(x, height / 2 - .5, z);
      hill.rotation.y = x * .11;
      group.add(hill);
    });
    return group;
  }

  function makeStaticScene(state) {
    const THREE = window.THREE;
    const skyTexture = makeSkyTexture();
    const sky = new THREE.Mesh(new THREE.PlaneGeometry(180, 100), new THREE.MeshBasicMaterial({ map: skyTexture, depthWrite: false }));
    sky.position.set(0, 27, -112);
    state.scene.add(sky);
    state.skyTexture = skyTexture;

    const sun = new THREE.Mesh(new THREE.CircleGeometry(5.6, 24), new THREE.MeshBasicMaterial({ color: 0xffe3a0, transparent: true, opacity: .88 }));
    sun.position.set(13, 16, -105);
    state.scene.add(sun);

    state.scene.add(makeDistantLandscape());

    const waterTexture = makeWaterTexture();
    const waterMat = new THREE.MeshStandardMaterial({
      color: 0x55bed5,
      map: waterTexture,
      roughness: .33,
      metalness: .06,
      emissive: 0x0c3f55,
      emissiveIntensity: .08,
    });
    const water = new THREE.Mesh(new THREE.PlaneGeometry(RIVER_HALF * 2, 124, 1, 1), waterMat);
    water.rotation.x = -Math.PI / 2;
    water.position.set(0, 0, -48);
    state.scene.add(water);
    state.water = water;
    state.waterTexture = waterTexture;

    state.scene.add(makeBank(-1), makeBank(1));

    const laneMat = new THREE.MeshBasicMaterial({ color: 0xc6f2f7, transparent: true, opacity: .075, depthWrite: false });
    [-.5, .5].forEach((lane) => {
      const guide = new THREE.Mesh(new THREE.PlaneGeometry(.045, 108), laneMat);
      guide.rotation.x = -Math.PI / 2;
      guide.position.set(lane * LANE_X, .025, -44);
      state.scene.add(guide);
    });

    const hemi = new THREE.HemisphereLight(0xdff6ff, 0x886b45, 1.55);
    state.scene.add(hemi);
    const sunLight = new THREE.DirectionalLight(0xfff0cf, 2.15);
    sunLight.position.set(-8, 14, 10);
    sunLight.target.position.set(0, 0, -28);
    state.scene.add(sunLight, sunLight.target);
    const fill = new THREE.DirectionalLight(0x7ecbff, .48);
    fill.position.set(9, 7, -4);
    state.scene.add(fill);
    state.scene.add(new THREE.AmbientLight(0xffffff, .22));
  }

  function addBlobShadow(group, scaleX = 1.3, scaleZ = .75) {
    const THREE = window.THREE;
    const shadow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({
      map: active?.shadowTexture || null,
      transparent: true,
      opacity: .56,
      depthWrite: false,
      color: 0xffffff,
    }));
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = .025;
    shadow.scale.set(scaleX, scaleZ, 1);
    group.add(shadow);
    return shadow;
  }

  function makeBasketVisual(state) {
    const THREE = window.THREE;
    const group = new THREE.Group();
    const model = clonePrototype(state.prototypes.basket);
    if (model) {
      model.scale.setScalar(1.6);
      model.position.y = .26;
      model.rotation.y = Math.PI;
      group.add(model);
    } else {
      const shell = new THREE.Mesh(new THREE.CylinderGeometry(.8, .55, .6, 10, 1, false, 0, Math.PI * 2), new THREE.MeshStandardMaterial({ color: 0xb66f31, roughness: .9 }));
      shell.scale.z = .72;
      shell.position.y = .36;
      group.add(shell);
    }
    const cloth = new THREE.Mesh(new THREE.SphereGeometry(.38, 12, 7), new THREE.MeshStandardMaterial({ color: 0xf1dfb7, roughness: .96 }));
    cloth.scale.set(1.22, .34, .68);
    cloth.position.set(0, .54, -.02);
    group.add(cloth);
    const handleMat = new THREE.MeshStandardMaterial({ color: 0x875023, roughness: .93 });
    const handle = new THREE.Mesh(new THREE.TorusGeometry(.62, .045, 6, 18, Math.PI), handleMat);
    handle.rotation.x = Math.PI / 2;
    handle.rotation.z = Math.PI;
    handle.position.set(0, .72, .02);
    group.add(handle);
    addBlobShadow(group, 1.9, 1.05);
    state.scene.add(group);
    state.basketModel = group;
    return group;
  }

  function makeEntityVisual(state, el, type) {
    const THREE = window.THREE;
    const group = new THREE.Group();
    let model = null;
    if (type === 'pickup') model = makePickup();
    else if (type === 'reeds') model = clonePrototype(state.prototypes.reeds);
    else model = clonePrototype(state.prototypes[type]);
    if (!model) return null;

    const scaleByType = { rock: 1.25, reeds: 1.45, log: 1.7, crocodile: 2.0, pickup: 1.0 };
    model.scale.setScalar(scaleByType[type] || 1.2);
    if (type === 'log') {
      model.rotation.y = Math.PI / 2 + .1;
      model.rotation.z = -.05;
      model.position.y = .24;
    } else if (type === 'rock') {
      model.rotation.y = .38;
      model.position.y = .32;
    } else if (type === 'reeds') {
      model.position.y = .48;
    } else if (type === 'crocodile') {
      model.rotation.y = -Math.PI / 2;
      model.position.y = .22;
    } else if (type === 'pickup') {
      model.position.y = 1.05;
    }
    group.add(model);
    if (type !== 'pickup') addBlobShadow(group, type === 'log' ? 2 : type === 'crocodile' ? 2.2 : 1.35, type === 'log' ? .72 : .9);
    group.userData.type = type;
    group.userData.currentX = 0;
    group.userData.phase = Math.random() * Math.PI * 2;
    state.scene.add(group);
    const emoji = el.querySelector('.mnr-object__emoji');
    if (emoji) emoji.style.visibility = 'hidden';
    return group;
  }

  function inferEntityType(el) {
    if (el.classList.contains('mnr-object--pickup')) return 'pickup';
    for (const key of ['rock', 'reeds', 'log', 'crocodile']) {
      if (el.classList.contains(`mnr-object--${key}`)) return key;
    }
    return '';
  }

  function laneFromInlineStyle(el) {
    const left = Number.parseFloat(el.style.left || '50');
    if (left < 41) return -1;
    if (left > 59) return 1;
    return 0;
  }

  function progressFromInlineStyle(el) {
    const top = Number.parseFloat(el.style.top || '23');
    return clamp((top - 23) / 67, 0, 1.08);
  }

  function syncEntities(state, now) {
    const alive = new Set();
    state.stage.querySelectorAll('.mnr-object').forEach((el) => {
      const type = inferEntityType(el);
      if (!type) return;
      let group = state.entityModels.get(el);
      if (!group) {
        group = makeEntityVisual(state, el, type);
        if (!group) return;
        state.entityModels.set(el, group);
      }
      alive.add(el);
      const lane = laneFromInlineStyle(el);
      const perspectiveProgress = progressFromInlineStyle(el);
      const targetX = lane * LANE_X;
      group.userData.currentX = lerp(group.userData.currentX ?? targetX, targetX, type === 'crocodile' ? .08 : .18);
      group.position.x = group.userData.currentX;
      group.position.z = lerp(FAR_Z, NEAR_Z, perspectiveProgress);
      group.position.y = 0;
      group.visible = perspectiveProgress < 1.075;

      if (type === 'pickup') {
        group.rotation.y += .025;
        group.position.y = Math.sin(now * .005 + group.userData.phase) * .12;
      } else if (type === 'log') {
        group.rotation.z = -.04 + Math.sin(now * .0022 + group.userData.phase) * .035;
      } else if (type === 'crocodile') {
        group.rotation.z = Math.sin(now * .004 + group.userData.phase) * .025;
      } else if (type === 'reeds') {
        group.rotation.z = Math.sin(now * .002 + group.userData.phase) * .035;
      }

      if (el.classList.contains('is-hit') || el.classList.contains('is-collected')) {
        group.scale.multiplyScalar(.93);
        group.rotation.y += .06;
      }
    });

    for (const [el, group] of state.entityModels.entries()) {
      if (alive.has(el) && el.isConnected) continue;
      state.scene.remove(group);
      state.entityModels.delete(el);
    }
  }

  function syncBasket(state, now) {
    const host = state.stage.querySelector('#mnr-basket');
    if (!host) return;
    if (!state.basketModel) makeBasketVisual(state);
    const lane = laneFromInlineStyle(host);
    const targetX = lane * LANE_X;
    state.basketX = lerp(state.basketX, targetX, .18);
    const boosting = host.classList.contains('is-boosting');
    const hit = host.classList.contains('is-hit');
    state.basketModel.position.set(state.basketX, boosting ? .22 : .08, 4.9 + (boosting ? -.9 : 0));
    state.basketModel.rotation.y = lerp(state.basketModel.rotation.y, -state.basketX * .045, .12);
    state.basketModel.rotation.z = lerp(state.basketModel.rotation.z, hit ? Math.sin(now * .04) * .12 : -state.basketX * .025, .18);
    state.basketModel.rotation.x = boosting ? -.08 : Math.sin(now * .0025) * .018;
  }

  function createDecoration(state, key, x, z, scale, rotation = 0) {
    const model = clonePrototype(state.prototypes[key]);
    if (!model) return;
    const group = new window.THREE.Group();
    model.scale.setScalar(scale);
    model.rotation.y = rotation;
    group.add(model);
    group.position.set(x, key === 'palm' ? .75 : key === 'plant' ? .73 : .67, z);
    group.userData.baseX = x;
    group.userData.wrap = true;
    state.scene.add(group);
    state.decorations.push(group);
  }

  function mountDecorations(state) {
    if (state.decorations.length) return;
    const slots = [
      ['palm', -9.0, -12, 4.8, .5], ['palm', 9.4, -31, 4.2, -1.0], ['palm', -10.2, -57, 4.4, .9], ['palm', 9.1, -78, 4.6, -1.1],
      ['plant', -7.5, -23, 1.35, .3], ['plant', 7.7, -48, 1.2, -.4], ['plant', -7.8, -72, 1.18, .5],
      ['rock', 8.8, -15, 1.2, .4], ['rock', -8.6, -43, .95, -.2], ['rock', 8.3, -66, 1.15, .7],
    ];
    slots.forEach((args) => createDecoration(state, ...args));
  }

  function updateDecorations(state, dt, running) {
    if (!running) return;
    const boost = state.stage.querySelector('#mnr-basket')?.classList.contains('is-boosting');
    const speed = boost ? 23 : 15.5;
    state.decorations.forEach((group) => {
      group.position.z += dt * speed;
      if (group.position.z > 13) group.position.z -= ENV_WRAP_LENGTH;
    });
    state.sandMarkers.forEach((group) => {
      group.position.z += dt * speed;
      if (group.position.z > 13) group.position.z -= ENV_WRAP_LENGTH;
    });
  }

  function makeSandMarkers(state) {
    const THREE = window.THREE;
    const material = new THREE.MeshStandardMaterial({ color: 0xc49d5d, roughness: 1, transparent: true, opacity: .34 });
    for (let i = 0; i < 12; i += 1) {
      const z = -4 - i * 8;
      [-1, 1].forEach((side) => {
        const marker = new THREE.Mesh(new THREE.PlaneGeometry(1.6 + (i % 3) * .4, .55), material);
        marker.rotation.x = -Math.PI / 2;
        marker.rotation.z = (i % 2 ? .18 : -.14) * side;
        marker.position.set(side * (8.2 + (i % 2) * 1.1), .68, z - side * 1.2);
        state.scene.add(marker);
        state.sandMarkers.push(marker);
      });
    }
  }

  function resizeRenderer(state) {
    const rect = state.stage.getBoundingClientRect();
    const width = Math.max(1, Math.round(rect.width));
    const height = Math.max(1, Math.round(rect.height));
    if (state.width === width && state.height === height) return;
    state.width = width;
    state.height = height;
    state.renderer.setSize(width, height, false);
    state.camera.aspect = width / height;
    state.camera.updateProjectionMatrix();
  }

  function isRunning(state) {
    const intro = document.getElementById('mnr-intro');
    const result = document.getElementById('mnr-result');
    const pause = document.getElementById('mnr-pause-tag');
    return Boolean(intro?.classList.contains('hidden') && result?.classList.contains('hidden') && !pause?.classList.contains('is-on'));
  }

  function renderFrame(state, now) {
    if (active !== state) return;
    if (document.body.dataset.currentGame !== GAME_KEY || !state.stage.isConnected) {
      cleanup();
      return;
    }
    state.raf = requestAnimationFrame((time) => renderFrame(state, time));
    if (document.hidden || now - state.lastRender < MIN_FRAME_MS) return;
    const dt = clamp((now - state.lastRender) / 1000, 0, .06);
    state.lastRender = now;
    resizeRenderer(state);
    const running = isRunning(state);
    if (running) {
      state.waterTexture.offset.y -= dt * .17;
      state.waterTexture.offset.x = Math.sin(now * .00025) * .015;
    }
    syncBasket(state, now);
    syncEntities(state, now);
    updateDecorations(state, dt, running);

    state.camera.position.x = lerp(state.camera.position.x, state.basketX * .12, .08);
    state.camera.position.y = 6.65 + Math.sin(now * .0012) * .025;
    state.camera.lookAt(state.camera.position.x * .08, .35, -24);
    state.renderer.render(state.scene, state.camera);
  }

  async function loadPrototypes(state) {
    if (totalRemoteBudget() > REMOTE_MODEL_BUDGET) return;
    const entries = await Promise.all(Object.entries({
      basket: loadBasket(),
      rock: loadGltf(MODEL_URLS.rock),
      plant: loadGltf(MODEL_URLS.plant),
      log: loadGltf(MODEL_URLS.log),
      raft: loadGltf(MODEL_URLS.raft),
      palm: loadGltf(MODEL_URLS.palm),
    }).map(async ([key, promise]) => [key, await promise]));
    if (active !== state) {
      entries.forEach(([, model]) => disposeObject(model));
      return;
    }
    entries.forEach(([key, model]) => { if (model) state.prototypes[key] = model; });
    if (!state.prototypes.rock) state.prototypes.rock = makeFallbackRock();
    if (!state.prototypes.log) state.prototypes.log = makeFallbackLog();
    if (!state.prototypes.palm) state.prototypes.palm = state.prototypes.plant || null;
    mountDecorations(state);
    if (!state.basketModel) makeBasketVisual(state);
    state.stage.classList.add('mnr-stage--full-3d');
    state.ready3D = true;
  }

  async function start() {
    cleanup();
    if (document.body.dataset.currentGame !== GAME_KEY) return false;
    const stage = document.getElementById('mnr-stage');
    if (!stage) return false;
    const deps = await withTimeout(ensureDependencies(), 7500);
    if (!deps || !window.THREE || document.body.dataset.currentGame !== GAME_KEY || !stage.isConnected) return false;
    ensureSceneStyle();
    const THREE = window.THREE;

    const renderer = new THREE.WebGLRenderer({ alpha: false, antialias: false, powerPreference: 'low-power', preserveDrawingBuffer: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO));
    renderer.setClearColor(0x9eddf2, 1);
    renderer.shadowMap.enabled = false;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.07;
    if ('outputEncoding' in renderer) renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.domElement.className = 'mnr-3d-canvas';
    Object.assign(renderer.domElement.style, {
      position: 'absolute', inset: '0', width: '100%', height: '100%', zIndex: '4', pointerEvents: 'none',
    });
    stage.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xa7def0);
    scene.fog = new THREE.Fog(0xcbe8e8, 42, 108);
    const camera = new THREE.PerspectiveCamera(52, 1, .1, 180);
    camera.position.set(0, 6.65, 12.3);
    camera.lookAt(0, .35, -24);

    const state = {
      stage, renderer, scene, camera,
      prototypes: Object.create(null),
      entityModels: new Map(),
      decorations: [],
      sandMarkers: [],
      basketModel: null,
      basketX: 0,
      shadowTexture: null,
      skyTexture: null,
      waterTexture: null,
      water: null,
      width: 0,
      height: 0,
      raf: 0,
      lastRender: performance.now(),
      onResize: null,
      onPageHide: null,
      ready3D: false,
    };
    active = state;
    state.shadowTexture = makeShadowTexture();
    state.prototypes.crocodile = makeCrocodile();
    state.prototypes.reeds = makePapyrus();
    state.prototypes.rock = makeFallbackRock();
    state.prototypes.log = makeFallbackLog();
    makeStaticScene(state);
    makeSandMarkers(state);
    resizeRenderer(state);

    state.onResize = () => { state.width = 0; resizeRenderer(state); };
    state.onPageHide = () => cleanup();
    window.addEventListener('resize', state.onResize, { passive: true });
    window.addEventListener('pagehide', state.onPageHide, { once: true });

    state.raf = requestAnimationFrame((time) => renderFrame(state, time));
    loadPrototypes(state).catch((error) => console.warn('[Moses 3D] optional asset load failed', error));
    return true;
  }

  function cleanup() {
    const state = active;
    if (!state) return;
    active = null;
    if (state.raf) cancelAnimationFrame(state.raf);
    window.removeEventListener('resize', state.onResize);
    window.removeEventListener('pagehide', state.onPageHide);
    state.stage?.classList.remove('mnr-stage--full-3d');
    state.stage?.querySelectorAll('.mnr-object__emoji').forEach((emoji) => { emoji.style.visibility = ''; });
    Object.values(state.prototypes).forEach((model) => disposeObject(model));
    try { state.shadowTexture?.dispose?.(); } catch {}
    try { state.skyTexture?.dispose?.(); } catch {}
    try { state.waterTexture?.dispose?.(); } catch {}
    try { state.renderer.dispose(); } catch {}
    try { state.renderer.forceContextLoss?.(); } catch {}
    try { state.renderer.domElement.remove(); } catch {}
  }

  window.__startMosesNile3D = start;
  window.__cleanupMosesNile3D = cleanup;
  window.__mosesNile3DModelBudget = Object.freeze({ remoteBytes: totalRemoteBudget(), remoteLimit: REMOTE_MODEL_BUDGET, urls: MODEL_URLS });
})();
