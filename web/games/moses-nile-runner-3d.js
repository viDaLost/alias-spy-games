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
  const FAR_Z = -68;
  const NEAR_Z = 5.0;
  const RIVER_HALF = 5.65;
  const LANE_X = 2.05;
  const ENV_WRAP_LENGTH = 88;
  const SCENE_STYLE_ID = 'moses-nile-full-3d-style-v3';

  let active = null;
  let dependencyPromise = null;
  const scriptPromises = new Map();

  function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function smoothstep(t) { const v = clamp(t, 0, 1); return v * v * (3 - 2 * v); }
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

  function withTimeout(promise, ms = 5000) {
    return Promise.race([promise, new Promise((resolve) => setTimeout(() => resolve(null), ms))]);
  }

  function ensureSceneStyle() {
    if (document.getElementById(SCENE_STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = SCENE_STYLE_ID;
    style.textContent = `
.mnr-stage.mnr-stage--full-3d{background:#6fb8d0!important}
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
    const maxDim = Math.max(size.x, size.y, size.z, 0.0001);
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
      const list = Array.isArray(node.material) ? node.material : [node.material];
      const tuned = list.map((material) => {
        if (!material) return material;
        const clone = material.clone();
        if (clone.color) {
          clone.color.offsetHSL(0, 0.07, -0.04);
          clone.color.lerp(new THREE.Color(0xffffff), 0.015);
        }
        if ('roughness' in clone) clone.roughness = Math.max(0.68, Number(clone.roughness ?? 0.84));
        if ('metalness' in clone) clone.metalness = Math.min(0.04, Number(clone.metalness ?? 0));
        if ('emissive' in clone) {
          clone.emissive = new THREE.Color(0x000000);
          clone.emissiveIntensity = 0;
        }
        clone.side = THREE.DoubleSide;
        return clone;
      });
      node.material = Array.isArray(node.material) ? tuned : tuned[0];
    });
    return root;
  }

  function makeBasketTexture() {
    const THREE = window.THREE;
    const canvas = document.createElement('canvas');
    canvas.width = 96;
    canvas.height = 96;
    const ctx = canvas.getContext('2d');
    const g = ctx.createLinearGradient(0, 0, 96, 96);
    g.addColorStop(0, '#d8a05a');
    g.addColorStop(.5, '#a9642d');
    g.addColorStop(1, '#e1b66d');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 96, 96);
    ctx.strokeStyle = 'rgba(87,43,16,.78)';
    ctx.lineWidth = 5;
    for (let x = -96; x < 192; x += 16) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + 96, 96); ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(255,220,151,.55)';
    ctx.lineWidth = 3;
    for (let y = 6; y < 96; y += 14) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(96, y); ctx.stroke();
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(2.5, 1.6);
    texture.anisotropy = 2;
    return texture;
  }

  function basketMaterial() {
    const THREE = window.THREE;
    return new THREE.MeshStandardMaterial({
      color: 0xc27e39,
      map: makeBasketTexture(),
      roughness: 0.88,
      metalness: 0,
    });
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
      return normalizeObject(tuneLoadedObject(scene));
    } catch { return null; }
  }

  function makeShadowTexture() {
    const THREE = window.THREE;
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    const g = ctx.createRadialGradient(32, 32, 4, 32, 32, 30);
    g.addColorStop(0, 'rgba(13,34,39,.48)');
    g.addColorStop(.5, 'rgba(13,34,39,.20)');
    g.addColorStop(1, 'rgba(13,34,39,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(canvas);
  }

  function makeWaterTexture() {
    const THREE = window.THREE;
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 1024;
    const ctx = canvas.getContext('2d');
    const base = ctx.createLinearGradient(0, 0, 256, 0);
    base.addColorStop(0, '#167b99');
    base.addColorStop(.18, '#218fad');
    base.addColorStop(.5, '#35a9c3');
    base.addColorStop(.82, '#218fad');
    base.addColorStop(1, '#167b99');
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, 256, 1024);

    for (let y = 12; y < 1024; y += 22) {
      const phase = (y * 0.17) % (Math.PI * 2);
      const alpha = y % 44 ? 0.10 : 0.17;
      ctx.strokeStyle = `rgba(214,245,247,${alpha})`;
      ctx.lineWidth = y % 44 ? 1.2 : 1.8;
      ctx.beginPath();
      for (let x = -20; x <= 276; x += 10) {
        const yy = y + Math.sin(x * 0.055 + phase) * 2.4;
        if (x === -20) ctx.moveTo(x, yy); else ctx.lineTo(x, yy);
      }
      ctx.stroke();
    }

    for (let i = 0; i < 34; i += 1) {
      const x = 18 + ((i * 61) % 220);
      const y = 22 + ((i * 137) % 970);
      const len = 12 + (i % 5) * 7;
      ctx.strokeStyle = 'rgba(255,255,255,.10)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x - len, y);
      ctx.lineTo(x + len, y + (i % 2 ? 1 : -1));
      ctx.stroke();
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(1, 2.35);
    texture.anisotropy = 2;
    return texture;
  }

  function makeSandTexture() {
    const THREE = window.THREE;
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#c99b58';
    ctx.fillRect(0, 0, 128, 512);
    for (let i = 0; i < 180; i += 1) {
      const x = (i * 47) % 128;
      const y = (i * 83) % 512;
      const a = 0.025 + (i % 4) * 0.01;
      ctx.fillStyle = i % 3 ? `rgba(255,232,174,${a})` : `rgba(83,54,27,${a})`;
      ctx.fillRect(x, y, 1 + (i % 2), 1 + (i % 3 === 0 ? 1 : 0));
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(2.4, 10);
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
    g.addColorStop(0, '#5aa8cf');
    g.addColorStop(.58, '#9fd3df');
    g.addColorStop(1, '#dfc08b');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 256);
    return new THREE.CanvasTexture(canvas);
  }

  function makeCrocodile() {
    const THREE = window.THREE;
    const root = new THREE.Group();
    const green = new THREE.MeshStandardMaterial({ color: 0x355d36, roughness: .82, metalness: 0 });
    const green2 = new THREE.MeshStandardMaterial({ color: 0x557945, roughness: .9, metalness: 0 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x1b3020, roughness: .92, metalness: 0 });
    const eye = new THREE.MeshStandardMaterial({ color: 0xe8d66f, roughness: .65 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.6, .28, .48), green); body.position.x = -.12; root.add(body);
    const underside = new THREE.Mesh(new THREE.BoxGeometry(1.18, .08, .4), green2); underside.position.set(-.02, -.16, 0); root.add(underside);
    const head = new THREE.Mesh(new THREE.BoxGeometry(.62, .34, .54), green); head.position.x = .9; root.add(head);
    const snout = new THREE.Mesh(new THREE.BoxGeometry(.54, .18, .42), green); snout.position.x = 1.4; root.add(snout);
    const tail = new THREE.Mesh(new THREE.ConeGeometry(.25, 1.36, 5), green); tail.rotation.z = Math.PI / 2; tail.position.x = -1.34; root.add(tail);
    [-.5, .2].forEach((x) => [-.32, .32].forEach((z) => {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(.36, .11, .17), dark);
      leg.position.set(x, -.14, z); leg.rotation.y = z > 0 ? -.35 : .35; root.add(leg);
    }));
    [-.17, .17].forEach((z) => {
      const ball = new THREE.Mesh(new THREE.SphereGeometry(.07, 6, 4), eye); ball.position.set(.99, .21, z); root.add(ball);
      const pupil = new THREE.Mesh(new THREE.SphereGeometry(.028, 5, 3), dark); pupil.position.set(1.045, .22, z); root.add(pupil);
    });
    return normalizeObject(root);
  }

  function makePapyrus() {
    const THREE = window.THREE;
    const group = new THREE.Group();
    const stemMat = new THREE.MeshStandardMaterial({ color: 0x315f38, roughness: .92 });
    const topMat = new THREE.MeshStandardMaterial({ color: 0x5b873d, roughness: .88, side: THREE.DoubleSide });
    [-.22, -.11, 0, .12, .23].forEach((x, i) => {
      const h = .82 + (i % 3) * .14;
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(.025, .038, h, 5), stemMat);
      stem.position.set(x, h / 2, i % 2 ? .08 : -.06);
      stem.rotation.z = (i - 2) * .04;
      group.add(stem);
      for (let r = 0; r < 6; r += 1) {
        const leaf = new THREE.Mesh(new THREE.ConeGeometry(.075, .31, 4), topMat);
        leaf.position.set(x, h + .06, stem.position.z);
        leaf.rotation.z = Math.PI / 2 - .18;
        leaf.rotation.y = (Math.PI * 2 * r) / 6;
        group.add(leaf);
      }
    });
    return normalizeObject(group);
  }

  function makePickup() {
    const THREE = window.THREE;
    const group = new THREE.Group();
    const core = new THREE.Mesh(new THREE.IcosahedronGeometry(.24, 1), new THREE.MeshStandardMaterial({
      color: 0xffce46, emissive: 0xc77b00, emissiveIntensity: .8, roughness: .35, metalness: .02,
    }));
    group.add(core);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(.43, .025, 5, 20), new THREE.MeshBasicMaterial({
      color: 0xffe998, transparent: true, opacity: .72, side: THREE.DoubleSide,
    }));
    ring.rotation.x = Math.PI / 2;
    group.add(ring);
    return group;
  }

  function makeFallbackRock() {
    const THREE = window.THREE;
    const mesh = new THREE.Mesh(new THREE.DodecahedronGeometry(.58, 0), new THREE.MeshStandardMaterial({ color: 0x4f5657, roughness: .96 }));
    mesh.scale.set(1.25, .78, 1.05);
    return normalizeObject(mesh);
  }

  function makeFallbackLog() {
    const THREE = window.THREE;
    const group = new THREE.Group();
    const wood = new THREE.MeshStandardMaterial({ color: 0x70401f, roughness: .96 });
    const end = new THREE.MeshStandardMaterial({ color: 0xb7753f, roughness: .92 });
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(.3, .35, 1.7, 7), wood); trunk.rotation.z = Math.PI / 2; group.add(trunk);
    const capA = new THREE.Mesh(new THREE.CylinderGeometry(.31, .31, .025, 7), end); capA.rotation.z = Math.PI / 2; capA.position.x = -.86; group.add(capA);
    const capB = capA.clone(); capB.position.x = .86; group.add(capB);
    return normalizeObject(group);
  }

  function clonePrototype(prototype) { return prototype?.clone?.(true) || null; }

  function enableLayer(root, layer) {
    root?.traverse?.((node) => node.layers?.enable?.(layer));
  }

  function makeBank(side, sandTexture) {
    const THREE = window.THREE;
    const s = side < 0 ? -1 : 1;
    const zNear = 16;
    const zFar = -112;
    const inner = RIVER_HALF;
    const shelf = 7.1;
    const ridge = 9.5;
    const outer = 18;
    const vertices = new Float32Array([
      s * inner, .02, zNear, s * shelf, .56, zNear, s * ridge, .9, zNear, s * outer, 1.02, zNear,
      s * inner, .02, zFar, s * shelf, .56, zFar, s * ridge, .9, zFar, s * outer, 1.02, zFar,
    ]);
    const indices = [0,4,5,0,5,1, 1,5,6,1,6,2, 2,6,7,2,7,3];
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    const sandMat = new THREE.MeshStandardMaterial({
      color: 0xb98342,
      map: sandTexture,
      roughness: 1,
      metalness: 0,
      emissive: 0x2b1608,
      emissiveIntensity: .025,
    });
    const bank = new THREE.Mesh(geometry, sandMat);

    const greenGeometry = new THREE.BufferGeometry();
    greenGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array([
      s * 7.05, .575, zNear, s * 8.1, .72, zNear,
      s * 7.05, .575, zFar, s * 8.1, .72, zFar,
    ]), 3));
    greenGeometry.setIndex([0,2,3,0,3,1]);
    greenGeometry.computeVertexNormals();
    const green = new THREE.Mesh(greenGeometry, new THREE.MeshStandardMaterial({ color: 0x587a3f, roughness: .98 }));

    const wetEdge = new THREE.Mesh(new THREE.PlaneGeometry(.42, 128), new THREE.MeshStandardMaterial({
      color: 0x8d6b3e, roughness: 1, transparent: true, opacity: .8,
    }));
    wetEdge.rotation.x = -Math.PI / 2;
    wetEdge.position.set(s * (RIVER_HALF + .18), .035, -48);

    const group = new THREE.Group();
    group.add(bank, green, wetEdge);
    enableLayer(group, 1);
    return group;
  }

  function makeDistantLandscape() {
    const THREE = window.THREE;
    const group = new THREE.Group();
    const matA = new THREE.MeshStandardMaterial({ color: 0x9c7040, roughness: 1 });
    const matB = new THREE.MeshStandardMaterial({ color: 0xb8874f, roughness: 1 });
    [[-14,-93,7,9,matA],[-6,-98,4,6,matB],[7,-96,5,7,matA],[15,-94,7,10,matB]].forEach(([x,z,r,h,m]) => {
      const hill = new THREE.Mesh(new THREE.ConeGeometry(r, h, 6), m);
      hill.position.set(x, h / 2 - .7, z);
      hill.rotation.y = x * .1;
      group.add(hill);
    });
    enableLayer(group, 1);
    return group;
  }

  function makeFlowStreaks(state) {
    const THREE = window.THREE;
    const material = new THREE.MeshBasicMaterial({ color: 0xd1f3f5, transparent: true, opacity: .13, depthWrite: false });
    for (let i = 0; i < 18; i += 1) {
      const streak = new THREE.Mesh(new THREE.PlaneGeometry(.5 + (i % 4) * .22, .035), material);
      streak.rotation.x = -Math.PI / 2;
      streak.rotation.z = (i % 2 ? .04 : -.04);
      streak.position.set(-4.6 + ((i * 1.73) % 9.2), .045, -2 - i * 5.0);
      enableLayer(streak, 2);
      state.scene.add(streak);
      state.flowStreaks.push(streak);
    }
  }

  function makeStaticScene(state) {
    const THREE = window.THREE;
    const skyTexture = makeSkyTexture();
    const sky = new THREE.Mesh(new THREE.PlaneGeometry(180, 100), new THREE.MeshBasicMaterial({ map: skyTexture, depthWrite: false }));
    sky.position.set(0, 26, -112);
    state.scene.add(sky);
    state.skyTexture = skyTexture;

    const sun = new THREE.Mesh(new THREE.CircleGeometry(4.2, 24), new THREE.MeshBasicMaterial({ color: 0xf7d891, transparent: true, opacity: .52 }));
    sun.position.set(15, 18, -108);
    state.scene.add(sun);
    state.scene.add(makeDistantLandscape());

    const waterTexture = makeWaterTexture();
    const waterGeometry = new THREE.PlaneGeometry(RIVER_HALF * 2, 142, 12, 36);
    const p = waterGeometry.attributes.position;
    for (let i = 0; i < p.count; i += 1) {
      const x = p.getX(i);
      const y = p.getY(i);
      p.setZ(i, Math.sin(y * .09 + x * .7) * .025 + Math.cos(x * 1.15) * .012);
    }
    p.needsUpdate = true;
    waterGeometry.computeVertexNormals();
    const waterMat = new THREE.MeshStandardMaterial({
      color: 0x178ba8,
      map: waterTexture,
      roughness: .62,
      metalness: .02,
      emissive: 0x062f3a,
      emissiveIntensity: .055,
    });
    const water = new THREE.Mesh(waterGeometry, waterMat);
    water.rotation.x = -Math.PI / 2;
    water.position.set(0, 0, -48);
    enableLayer(water, 2);
    state.scene.add(water);
    state.water = water;
    state.waterTexture = waterTexture;

    const sandTexture = makeSandTexture();
    state.sandTexture = sandTexture;
    state.scene.add(makeBank(-1, sandTexture), makeBank(1, sandTexture));

    const foamMat = new THREE.MeshBasicMaterial({ color: 0xbce9e6, transparent: true, opacity: .22, depthWrite: false });
    [-1, 1].forEach((side) => {
      const foam = new THREE.Mesh(new THREE.PlaneGeometry(.16, 128), foamMat);
      foam.rotation.x = -Math.PI / 2;
      foam.position.set(side * (RIVER_HALF - .07), .05, -48);
      enableLayer(foam, 2);
      state.scene.add(foam);
    });

    makeFlowStreaks(state);

    const hemi = new THREE.HemisphereLight(0x9dd8ee, 0x5d452f, .58);
    state.scene.add(hemi);
    const globalSun = new THREE.DirectionalLight(0xffd7a0, .82);
    globalSun.position.set(-7, 12, 8);
    globalSun.target.position.set(0, 0, -24);
    state.scene.add(globalSun, globalSun.target);
    state.scene.add(new THREE.AmbientLight(0x7a9fa7, .08));

    const landLight = new THREE.DirectionalLight(0xffc879, .52);
    landLight.position.set(-10, 7, 4);
    landLight.target.position.set(0, .2, -30);
    landLight.layers.set(1);
    state.scene.add(landLight, landLight.target);

    const riverLight = new THREE.DirectionalLight(0x79d8ff, .42);
    riverLight.position.set(7, 8, 3);
    riverLight.target.position.set(0, 0, -18);
    riverLight.layers.set(2);
    state.scene.add(riverLight, riverLight.target);

    const playerFill = new THREE.PointLight(0xffd7aa, .38, 22, 1.7);
    playerFill.position.set(0, 4.6, 6.2);
    state.scene.add(playerFill);
    state.playerFill = playerFill;
  }

  function addBlobShadow(group, scaleX = 1.3, scaleZ = .75, opacity = .52) {
    const THREE = window.THREE;
    const shadow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({
      map: active?.shadowTexture || null,
      transparent: true,
      opacity,
      depthWrite: false,
      color: 0xffffff,
    }));
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = .03;
    shadow.scale.set(scaleX, scaleZ, 1);
    group.add(shadow);
  }

  function makeBasketVisual(state, force = false) {
    const THREE = window.THREE;
    if (state.basketModel && !force) return state.basketModel;
    if (state.basketModel) {
      state.scene.remove(state.basketModel);
      state.basketModel = null;
    }

    const group = new THREE.Group();
    const loaded = clonePrototype(state.prototypes.basket);
    if (loaded) {
      loaded.scale.setScalar(2.15);
      loaded.position.y = .48;
      loaded.rotation.y = Math.PI;
      group.add(loaded);
      state.basketUsesLoadedModel = true;
    } else {
      const shell = new THREE.Mesh(new THREE.CylinderGeometry(.9, .63, .62, 12, 1, true), basketMaterial());
      shell.scale.z = .78;
      shell.position.y = .43;
      group.add(shell);
      const bottom = new THREE.Mesh(new THREE.CylinderGeometry(.62, .62, .1, 12), basketMaterial());
      bottom.scale.z = .78;
      bottom.position.y = .12;
      group.add(bottom);
      state.basketUsesLoadedModel = false;
    }

    const rim = new THREE.Mesh(new THREE.TorusGeometry(.78, .07, 7, 20), new THREE.MeshStandardMaterial({ color: 0x7a421e, roughness: .86 }));
    rim.rotation.x = Math.PI / 2;
    rim.scale.z = .78;
    rim.position.y = .72;
    group.add(rim);

    const cloth = new THREE.Mesh(new THREE.SphereGeometry(.42, 12, 7), new THREE.MeshStandardMaterial({ color: 0xe8d5aa, roughness: .96 }));
    cloth.scale.set(1.24, .34, .72);
    cloth.position.set(0, .68, -.02);
    group.add(cloth);

    const handle = new THREE.Mesh(new THREE.TorusGeometry(.72, .055, 7, 22, Math.PI), new THREE.MeshStandardMaterial({ color: 0x6d3b1c, roughness: .92 }));
    handle.rotation.x = Math.PI / 2;
    handle.rotation.z = Math.PI;
    handle.position.set(0, .88, .03);
    group.add(handle);

    const wake = new THREE.Mesh(new THREE.PlaneGeometry(2.7, 1.25), new THREE.MeshBasicMaterial({
      color: 0xd6f5f4, transparent: true, opacity: .17, depthWrite: false,
    }));
    wake.rotation.x = -Math.PI / 2;
    wake.position.set(0, .055, .62);
    group.add(wake);
    addBlobShadow(group, 2.15, 1.05, .48);
    group.scale.setScalar(1.08);
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

    const scaleByType = { rock: 1.55, reeds: 1.75, log: 2.05, crocodile: 2.35, pickup: 1.2 };
    model.scale.setScalar(scaleByType[type] || 1.4);
    if (type === 'log') {
      model.rotation.y = Math.PI / 2 + .08;
      model.position.y = .33;
    } else if (type === 'rock') {
      model.rotation.y = .42;
      model.position.y = .4;
    } else if (type === 'reeds') {
      model.position.y = .58;
    } else if (type === 'crocodile') {
      model.rotation.y = -Math.PI / 2;
      model.position.y = .3;
    } else {
      model.position.y = 1.1;
    }
    group.add(model);
    if (type !== 'pickup') addBlobShadow(group, type === 'log' ? 2.5 : type === 'crocodile' ? 2.7 : 1.65, type === 'log' ? .78 : 1.0, .48);
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
      const progress = progressFromInlineStyle(el);
      const targetX = lane * LANE_X;
      group.userData.currentX = lerp(group.userData.currentX ?? targetX, targetX, type === 'crocodile' ? .09 : .2);
      group.position.x = group.userData.currentX;
      group.position.z = lerp(FAR_Z, NEAR_Z, Math.pow(smoothstep(progress), .86));
      group.position.y = 0;
      group.visible = progress < 1.075;

      if (type === 'pickup') {
        group.rotation.y += .034;
        group.position.y = .12 + Math.sin(now * .005 + group.userData.phase) * .11;
      } else if (type === 'log') {
        group.rotation.z = -.035 + Math.sin(now * .0022 + group.userData.phase) * .04;
      } else if (type === 'crocodile') {
        group.rotation.z = Math.sin(now * .004 + group.userData.phase) * .03;
      } else if (type === 'reeds') {
        group.rotation.z = Math.sin(now * .002 + group.userData.phase) * .04;
      }

      if (el.classList.contains('is-hit') || el.classList.contains('is-collected')) {
        group.scale.setScalar(.82);
        group.rotation.y += .05;
      } else {
        group.scale.setScalar(1);
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
    state.basketX = lerp(state.basketX, targetX, .2);
    const boosting = host.classList.contains('is-boosting');
    const hit = host.classList.contains('is-hit');
    state.basketModel.position.set(state.basketX, boosting ? .56 : .48, 4.15 + (boosting ? -1.0 : 0));
    state.basketModel.rotation.y = lerp(state.basketModel.rotation.y, -state.basketX * .065, .14);
    state.basketModel.rotation.z = lerp(state.basketModel.rotation.z, hit ? Math.sin(now * .04) * .13 : -state.basketX * .035, .2);
    state.basketModel.rotation.x = boosting ? -.09 : Math.sin(now * .0026) * .025;
    if (state.playerFill) state.playerFill.position.x = state.basketX * .55;
  }

  function createDecoration(state, key, x, z, scale, rotation = 0) {
    const model = clonePrototype(state.prototypes[key]);
    if (!model) return;
    const group = new window.THREE.Group();
    model.scale.setScalar(scale);
    model.rotation.y = rotation;
    group.add(model);
    group.position.set(x, key === 'palm' ? .94 : key === 'plant' ? .78 : .72, z);
    enableLayer(group, 1);
    state.scene.add(group);
    state.decorations.push(group);
  }

  function mountDecorations(state) {
    if (state.decorations.length) return;
    const slots = [
      ['palm', -9.4, -10, 4.5, .5], ['palm', 9.5, -27, 4.1, -1.0], ['palm', -10.1, -49, 4.4, .9], ['palm', 9.1, -70, 4.5, -1.1],
      ['plant', -7.35, -18, 1.6, .3], ['plant', 7.45, -39, 1.45, -.4], ['plant', -7.5, -61, 1.5, .5], ['plant', 7.3, -81, 1.4, -.5],
      ['rock', 8.5, -12, 1.45, .4], ['rock', -8.4, -35, 1.2, -.2], ['rock', 8.2, -57, 1.35, .7], ['rock', -8.7, -78, 1.3, .2],
    ];
    slots.forEach((args) => createDecoration(state, ...args));
  }

  function makeSandMarkers(state) {
    const THREE = window.THREE;
    const material = new THREE.MeshStandardMaterial({ color: 0x7e542b, roughness: 1, transparent: true, opacity: .17 });
    for (let i = 0; i < 10; i += 1) {
      const z = -5 - i * 8.5;
      [-1, 1].forEach((side) => {
        const marker = new THREE.Mesh(new THREE.PlaneGeometry(1.4 + (i % 3) * .45, .38), material);
        marker.rotation.x = -Math.PI / 2;
        marker.rotation.z = (i % 2 ? .18 : -.14) * side;
        marker.position.set(side * (8.3 + (i % 2) * 1.0), .74, z - side * 1.1);
        enableLayer(marker, 1);
        state.scene.add(marker);
        state.sandMarkers.push(marker);
      });
    }
  }

  function updateEnvironment(state, dt, running) {
    if (!running) return;
    const boost = state.stage.querySelector('#mnr-basket')?.classList.contains('is-boosting');
    const speed = boost ? 23 : 15.5;
    state.decorations.forEach((group) => {
      group.position.z += dt * speed;
      if (group.position.z > 13) group.position.z -= ENV_WRAP_LENGTH;
    });
    state.sandMarkers.forEach((marker) => {
      marker.position.z += dt * speed;
      if (marker.position.z > 13) marker.position.z -= ENV_WRAP_LENGTH;
    });
    state.flowStreaks.forEach((streak, index) => {
      streak.position.z += dt * (speed * 1.08);
      if (streak.position.z > 10) streak.position.z -= ENV_WRAP_LENGTH + (index % 3) * 2;
    });
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

  function isRunning() {
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
    const running = isRunning();
    if (running) {
      state.waterTexture.offset.y -= dt * .085;
      state.waterTexture.offset.x = Math.sin(now * .00022) * .006;
    }
    syncBasket(state, now);
    syncEntities(state, now);
    updateEnvironment(state, dt, running);

    state.camera.position.x = lerp(state.camera.position.x, state.basketX * .1, .08);
    state.camera.position.y = 6.9 + Math.sin(now * .0012) * .018;
    state.camera.lookAt(state.camera.position.x * .05, .24, -13.5);
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
    if (state.prototypes.basket && !state.basketUsesLoadedModel) makeBasketVisual(state, true);
    else if (!state.basketModel) makeBasketVisual(state);
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
    renderer.setClearColor(0x6faec4, 1);
    renderer.shadowMap.enabled = false;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = .78;
    if ('outputEncoding' in renderer) renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.domElement.className = 'mnr-3d-canvas';
    Object.assign(renderer.domElement.style, {
      position: 'absolute', inset: '0', width: '100%', height: '100%', zIndex: '4', pointerEvents: 'none',
    });
    stage.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x78b8c9);
    scene.fog = new THREE.Fog(0x9fc6c8, 58, 126);
    const camera = new THREE.PerspectiveCamera(58, 1, .1, 180);
    camera.position.set(0, 6.9, 11.2);
    camera.lookAt(0, .24, -13.5);
    camera.layers.enable(1);
    camera.layers.enable(2);

    const state = {
      stage, renderer, scene, camera,
      prototypes: Object.create(null),
      entityModels: new Map(),
      decorations: [],
      sandMarkers: [],
      flowStreaks: [],
      basketModel: null,
      basketUsesLoadedModel: false,
      basketX: 0,
      shadowTexture: null,
      skyTexture: null,
      sandTexture: null,
      waterTexture: null,
      water: null,
      playerFill: null,
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
    makeBasketVisual(state);
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
    try { state.sandTexture?.dispose?.(); } catch {}
    try { state.waterTexture?.dispose?.(); } catch {}
    try { state.renderer.dispose(); } catch {}
    try { state.renderer.forceContextLoss?.(); } catch {}
    try { state.renderer.domElement.remove(); } catch {}
  }

  window.__startMosesNile3D = start;
  window.__cleanupMosesNile3D = cleanup;
  window.__mosesNile3DModelBudget = Object.freeze({ remoteBytes: totalRemoteBudget(), remoteLimit: REMOTE_MODEL_BUDGET, urls: MODEL_URLS });
})();
