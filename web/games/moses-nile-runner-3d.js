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
    reeds: `${MODEL_ROOT}/nature_pack/Plant_2.glb`,
    log: `${MODEL_ROOT}/survival_pack/WoodLog.glb`,
    raft: `${MODEL_ROOT}/survival_pack/Raft.glb`,
    palm: `${MODEL_ROOT}/nature_pack/PalmTree_4.glb`,
  });
  const REMOTE_MODEL_BYTES = Object.freeze({
    rock: 5516,
    reeds: 16040,
    log: 13904,
    raft: 58392,
    palm: 63764,
  });
  const REMOTE_MODEL_BUDGET = 170000;
  const MAX_PIXEL_RATIO = 1.25;
  const MIN_FRAME_MS = 30;

  let active = null;
  let dependencyPromise = null;
  const scriptPromises = new Map();

  function totalRemoteBudget() {
    return Object.values(REMOTE_MODEL_BYTES).reduce((sum, value) => sum + value, 0);
  }

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
      script.addEventListener('load', () => {
        script.dataset.loaded = '1';
        resolve(true);
      }, { once: true });
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
    return Promise.race([
      promise,
      new Promise((resolve) => setTimeout(() => resolve(null), ms)),
    ]);
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

    const inner = new THREE.Group();
    object.position.sub(center);
    inner.add(object);
    inner.scale.setScalar(1 / maxDim);

    const outer = new THREE.Group();
    outer.add(inner);
    return outer;
  }

  function basketMaterial() {
    const THREE = window.THREE;
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#b87b38';
      ctx.fillRect(0, 0, 64, 64);
      ctx.strokeStyle = '#7b4a22';
      ctx.lineWidth = 4;
      for (let x = -64; x < 128; x += 12) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x + 64, 64);
        ctx.stroke();
      }
      ctx.strokeStyle = '#d6a45a';
      ctx.lineWidth = 3;
      for (let y = 4; y < 64; y += 12) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(64, y);
        ctx.stroke();
      }
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(2.2, 1.4);
    texture.needsUpdate = true;
    return new THREE.MeshStandardMaterial({
      color: 0xc18a45,
      map: texture,
      roughness: 0.92,
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
    mesh.rotation.x = -0.08;
    return normalizeObject(mesh);
  }

  async function loadBasket() {
    try {
      const response = await fetch(MODEL_URLS.basket, { cache: 'force-cache' });
      if (!response.ok) return null;
      return parseBasketObj(await response.text());
    } catch {
      return null;
    }
  }

  async function loadGltf(url) {
    const THREE = window.THREE;
    try {
      const result = await withTimeout(new Promise((resolve) => {
        const loader = new THREE.GLTFLoader();
        loader.load(url, (gltf) => resolve(gltf?.scene || null), undefined, () => resolve(null));
      }), 5500);
      if (!result) return null;
      result.traverse?.((node) => {
        if (!node?.isMesh) return;
        node.castShadow = false;
        node.receiveShadow = false;
        if (node.material) {
          const materials = Array.isArray(node.material) ? node.material : [node.material];
          materials.forEach((material) => {
            if (!material) return;
            material.roughness = Math.max(0.58, Number(material.roughness ?? 0.8));
            material.metalness = Math.min(0.12, Number(material.metalness ?? 0));
          });
        }
      });
      return normalizeObject(result);
    } catch {
      return null;
    }
  }

  function makeCrocodile() {
    const THREE = window.THREE;
    const root = new THREE.Group();
    const green = new THREE.MeshStandardMaterial({ color: 0x477c38, roughness: 0.86, metalness: 0 });
    const belly = new THREE.MeshStandardMaterial({ color: 0x789a55, roughness: 0.9, metalness: 0 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x263823, roughness: 0.9, metalness: 0 });
    const eye = new THREE.MeshStandardMaterial({ color: 0xf5e7ad, roughness: 0.7, metalness: 0 });

    const body = new THREE.Mesh(new THREE.BoxGeometry(1.45, 0.25, 0.42), green);
    body.position.x = -0.12;
    root.add(body);
    const underside = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.08, 0.37), belly);
    underside.position.set(-0.02, -0.14, 0);
    root.add(underside);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.3, 0.48), green);
    head.position.x = 0.83;
    root.add(head);
    const snout = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.18, 0.38), green);
    snout.position.x = 1.32;
    root.add(snout);
    const tail = new THREE.Mesh(new THREE.ConeGeometry(0.24, 1.18, 5), green);
    tail.rotation.z = Math.PI / 2;
    tail.position.x = -1.18;
    root.add(tail);

    [-0.48, 0.15].forEach((x) => {
      [-0.3, 0.3].forEach((z) => {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.1, 0.16), dark);
        leg.position.set(x, -0.12, z);
        leg.rotation.y = z > 0 ? -0.35 : 0.35;
        root.add(leg);
      });
    });
    [-0.15, 0.15].forEach((z) => {
      const ball = new THREE.Mesh(new THREE.SphereGeometry(0.065, 6, 4), eye);
      ball.position.set(0.92, 0.19, z);
      root.add(ball);
      const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.025, 5, 3), dark);
      pupil.position.set(0.97, 0.205, z);
      root.add(pupil);
    });
    return normalizeObject(root);
  }

  function clonePrototype(prototype) {
    return prototype?.clone?.(true) || null;
  }

  function stagePoint(state, rect) {
    const stageRect = state.stage.getBoundingClientRect();
    return {
      x: rect.left + rect.width / 2 - stageRect.left - stageRect.width / 2,
      y: stageRect.height / 2 - (rect.top + rect.height / 2 - stageRect.top),
      width: rect.width,
      height: rect.height,
    };
  }

  function inferEntityType(el) {
    for (const key of ['rock', 'reeds', 'log', 'crocodile']) {
      if (el.classList.contains(`mnr-object--${key}`)) return key;
    }
    return '';
  }

  function makeEntityVisual(state, el, type) {
    const prototype = type === 'crocodile' ? state.prototypes.crocodile : state.prototypes[type];
    const model = clonePrototype(prototype);
    if (!model) return null;
    model.userData.mosesType = type;
    state.scene.add(model);
    const emoji = el.querySelector('.mnr-object__emoji');
    if (emoji) emoji.style.visibility = 'hidden';
    return model;
  }

  function syncEntities(state, now) {
    const alive = new Set();
    state.stage.querySelectorAll('.mnr-object:not(.mnr-object--pickup)').forEach((el) => {
      const type = inferEntityType(el);
      if (!type) return;
      let model = state.entityModels.get(el);
      if (!model) {
        model = makeEntityVisual(state, el, type);
        if (!model) return;
        state.entityModels.set(el, model);
      }
      alive.add(el);
      const rect = el.getBoundingClientRect();
      const point = stagePoint(state, rect);
      model.position.set(point.x, point.y, type === 'reeds' ? 1 : 0);
      const size = Math.max(22, Math.min(104, Math.max(point.width, point.height)));
      const factor = type === 'log' ? 0.94 : type === 'crocodile' ? 1.18 : type === 'reeds' ? 0.92 : 0.82;
      model.scale.setScalar(size * factor);
      if (type === 'log') {
        model.rotation.z = -0.22 + Math.sin(now * 0.002 + point.x) * 0.05;
        model.rotation.y = 0.4;
      } else if (type === 'crocodile') {
        model.rotation.z = Math.sin(now * 0.004 + point.x * 0.01) * 0.055;
        model.rotation.y = 0.08;
      } else if (type === 'reeds') {
        model.rotation.z = Math.sin(now * 0.0027 + point.x * 0.02) * 0.045;
      } else {
        model.rotation.z = Math.sin(point.x * 0.04) * 0.12;
        model.rotation.y = 0.25;
      }
      model.visible = rect.width > 0 && rect.height > 0;
    });

    for (const [el, model] of state.entityModels.entries()) {
      if (alive.has(el) && el.isConnected) continue;
      state.scene.remove(model);
      state.entityModels.delete(el);
    }
  }

  function syncBasket(state) {
    const host = state.stage.querySelector('#mnr-basket');
    const cssBasket = host?.querySelector('.mnr-basket');
    if (!host || !state.prototypes.basket) return;
    if (!state.basketModel) {
      state.basketModel = clonePrototype(state.prototypes.basket);
      if (!state.basketModel) return;
      state.scene.add(state.basketModel);
      if (cssBasket) cssBasket.style.visibility = 'hidden';
      state.cssBasket = cssBasket || null;
    }
    const rect = host.getBoundingClientRect();
    const point = stagePoint(state, rect);
    state.basketModel.position.set(point.x, point.y + 2, 2);
    state.basketModel.scale.setScalar(Math.max(64, Math.min(112, rect.width * 0.9)));
    state.basketModel.rotation.x = 0.05;
    state.basketModel.rotation.y = -0.08;
    state.basketModel.rotation.z = 0;
    state.basketModel.visible = rect.width > 0 && rect.height > 0;
  }

  function createDecoration(state, key, xRatio, yRatio, pixelSize, rotationZ = 0) {
    const prototype = state.prototypes[key];
    if (!prototype) return;
    const model = clonePrototype(prototype);
    if (!model) return;
    model.userData.mosesDecoration = true;
    model.userData.layout = { key, xRatio, yRatio, pixelSize, rotationZ };
    state.scene.add(model);
    state.decorations.push(model);
  }

  function layoutDecorations(state) {
    const rect = state.stage.getBoundingClientRect();
    state.decorations.forEach((model) => {
      const layout = model.userData.layout;
      if (!layout) return;
      model.position.set(
        (layout.xRatio - 0.5) * rect.width,
        (0.5 - layout.yRatio) * rect.height,
        -2
      );
      model.scale.setScalar(layout.pixelSize * Math.min(1.15, Math.max(0.78, rect.width / 390)));
      model.rotation.z = layout.rotationZ;
    });
  }

  function mountDecorations(state) {
    if (state.decorations.length) return;
    createDecoration(state, 'palm', 0.12, 0.31, 110, -0.035);
    createDecoration(state, 'palm', 0.86, 0.35, 94, 0.04);
    createDecoration(state, 'reeds', 0.18, 0.56, 72, -0.04);
    createDecoration(state, 'reeds', 0.82, 0.61, 76, 0.035);
    createDecoration(state, 'raft', 0.26, 0.42, 68, -0.12);
    layoutDecorations(state);
  }

  function resizeRenderer(state) {
    const rect = state.stage.getBoundingClientRect();
    const width = Math.max(1, Math.round(rect.width));
    const height = Math.max(1, Math.round(rect.height));
    if (state.width === width && state.height === height) return;
    state.width = width;
    state.height = height;
    state.renderer.setSize(width, height, false);
    state.camera.left = -width / 2;
    state.camera.right = width / 2;
    state.camera.top = height / 2;
    state.camera.bottom = -height / 2;
    state.camera.updateProjectionMatrix();
    layoutDecorations(state);
  }

  function renderFrame(state, now) {
    if (active !== state) return;
    if (document.body.dataset.currentGame !== GAME_KEY || !state.stage.isConnected) {
      cleanup();
      return;
    }
    state.raf = requestAnimationFrame((time) => renderFrame(state, time));
    if (document.hidden || now - state.lastRender < MIN_FRAME_MS) return;
    state.lastRender = now;
    resizeRenderer(state);
    syncBasket(state);
    syncEntities(state, now);
    state.renderer.render(state.scene, state.camera);
  }

  async function loadPrototypes(state) {
    if (totalRemoteBudget() > REMOTE_MODEL_BUDGET) {
      console.warn('[Moses 3D] remote model budget exceeded; keeping CSS fallback');
      return;
    }
    const tasks = {
      basket: loadBasket(),
      rock: loadGltf(MODEL_URLS.rock),
      reeds: loadGltf(MODEL_URLS.reeds),
      log: loadGltf(MODEL_URLS.log),
      raft: loadGltf(MODEL_URLS.raft),
      palm: loadGltf(MODEL_URLS.palm),
    };
    const entries = await Promise.all(Object.entries(tasks).map(async ([key, promise]) => [key, await promise]));
    if (active !== state) {
      entries.forEach(([, model]) => disposeObject(model));
      return;
    }
    entries.forEach(([key, model]) => {
      if (model) state.prototypes[key] = model;
    });
    mountDecorations(state);
  }

  async function start() {
    cleanup();
    if (document.body.dataset.currentGame !== GAME_KEY) return false;
    const stage = document.getElementById('mnr-stage');
    if (!stage) return false;

    const deps = await withTimeout(ensureDependencies(), 7000);
    if (!deps || !window.THREE || document.body.dataset.currentGame !== GAME_KEY || !stage.isConnected) return false;
    const THREE = window.THREE;

    const renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: false,
      powerPreference: 'low-power',
      preserveDrawingBuffer: false,
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO));
    renderer.setClearColor(0x000000, 0);
    renderer.domElement.className = 'mnr-3d-canvas';
    Object.assign(renderer.domElement.style, {
      position: 'absolute',
      inset: '0',
      width: '100%',
      height: '100%',
      zIndex: '7',
      pointerEvents: 'none',
    });
    stage.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -1000, 1000);
    camera.position.z = 100;
    scene.add(new THREE.HemisphereLight(0xfff1cf, 0x4b7990, 1.15));
    const sun = new THREE.DirectionalLight(0xffffff, 0.72);
    sun.position.set(-3, 5, 7);
    scene.add(sun);

    const state = {
      stage,
      renderer,
      scene,
      camera,
      prototypes: Object.create(null),
      entityModels: new Map(),
      decorations: [],
      basketModel: null,
      cssBasket: null,
      width: 0,
      height: 0,
      raf: 0,
      lastRender: 0,
      onResize: null,
      onPageHide: null,
    };
    active = state;
    resizeRenderer(state);

    state.onResize = () => { state.width = 0; resizeRenderer(state); };
    state.onPageHide = () => cleanup();
    window.addEventListener('resize', state.onResize, { passive: true });
    window.addEventListener('pagehide', state.onPageHide, { once: true });

    state.prototypes.crocodile = makeCrocodile();
    state.raf = requestAnimationFrame((time) => renderFrame(state, time));
    loadPrototypes(state).catch((error) => console.warn('[Moses 3D] optional assets unavailable', error));
    return true;
  }

  function cleanup() {
    const state = active;
    if (!state) return;
    active = null;
    if (state.raf) cancelAnimationFrame(state.raf);
    window.removeEventListener('resize', state.onResize);
    window.removeEventListener('pagehide', state.onPageHide);

    if (state.cssBasket) state.cssBasket.style.visibility = '';
    state.stage?.querySelectorAll('.mnr-object__emoji').forEach((emoji) => { emoji.style.visibility = ''; });

    for (const model of state.entityModels.values()) state.scene.remove(model);
    state.entityModels.clear();
    state.decorations.forEach((model) => state.scene.remove(model));
    state.decorations = [];
    if (state.basketModel) state.scene.remove(state.basketModel);

    Object.values(state.prototypes).forEach((model) => disposeObject(model));
    try { state.renderer.dispose(); } catch {}
    try { state.renderer.forceContextLoss?.(); } catch {}
    try { state.renderer.domElement.remove(); } catch {}
  }

  window.__startMosesNile3D = start;
  window.__cleanupMosesNile3D = cleanup;
  window.__mosesNile3DModelBudget = Object.freeze({
    remoteBytes: totalRemoteBudget(),
    remoteLimit: REMOTE_MODEL_BUDGET,
    urls: MODEL_URLS,
  });
})();
