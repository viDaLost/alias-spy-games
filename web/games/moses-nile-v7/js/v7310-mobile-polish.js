(() => {
  'use strict';
  if (window.__mosesV7310Installed || !window.THREE) return;
  window.__mosesV7310Installed = true;

  const THREE = window.THREE;
  const textureLoader = new THREE.TextureLoader();
  const crocs = new WeakMap();
  const renderState = { player: null, cameraX: 0, lookX: 0, bob: 0, roll: 0, pitch: 0, initialized: false };
  let coastMaps = null;
  let terrainReady = false;
  let lastNow = performance.now();

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const smoothstep = (x) => { const t = clamp(x, 0, 1); return t * t * (3 - 2 * t); };
  const bell = (z, a, b, c) => z <= a || z >= c ? 0 : z <= b ? smoothstep((z - a) / (b - a)) : 1 - smoothstep((z - b) / (c - b));
  const damp = (current, target, lambda, dt) => current + (target - current) * (1 - Math.exp(-lambda * dt));

  function loadTexture(url, srgb = false) {
    return new Promise((resolve) => {
      textureLoader.load(url, (texture) => {
        texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
        texture.anisotropy = 2;
        if (srgb && 'encoding' in texture) texture.encoding = THREE.sRGBEncoding;
        resolve(texture);
      }, undefined, () => resolve(null));
    });
  }

  async function loadCoastSand() {
    if (coastMaps) return coastMaps;
    const [diffuse, normal, rough] = await Promise.all([
      loadTexture('textures/coast-sand-02-diffuse-1k.jpg', true),
      loadTexture('textures/coast-sand-02-normal-gl-1k.jpg'),
      loadTexture('textures/coast-sand-02-rough-1k.jpg'),
    ]);
    coastMaps = { diffuse, normal, rough };
    return coastMaps;
  }

  function cloneMap(source, rx, ry, srgb = false) {
    if (!source) return null;
    const map = source.clone();
    map.needsUpdate = true;
    map.wrapS = map.wrapT = THREE.RepeatWrapping;
    map.repeat.set(rx, ry);
    map.anisotropy = 2;
    if (srgb && 'encoding' in map) map.encoding = THREE.sRGBEncoding;
    return map;
  }

  function isSandMesh(node, material) {
    if (!node?.isMesh || !material) return false;
    if (node.userData?.v73Bank || node.userData?.v73WetBank || node.userData?.v739RiverBankOccluder || node.parent?.userData?.v739RiverBankOccluders) return true;
    const hex = material.color?.getHex?.();
    return [0xc98638,0xd4a35f,0xd0a064,0x8d673d,0x9a7149,0xa87343,0xaf7946,0xe2aa54,0xad7746].includes(hex);
  }

  function applySandMaterial(node, material, maps) {
    if (!isSandMesh(node, material) || !maps.diffuse) return;
    const wet = node.userData?.v73WetBank || node.parent?.userData?.v739RiverBankOccluders || [0x8d673d,0x9a7149,0xa87343,0xaf7946,0xad7746].includes(material.color?.getHex?.());
    material.map = cloneMap(maps.diffuse, wet ? 3.2 : 10.5, wet ? 90 : 118, true);
    material.normalMap = cloneMap(maps.normal, wet ? 3.2 : 10.5, wet ? 90 : 118);
    material.roughnessMap = cloneMap(maps.rough, wet ? 3.2 : 10.5, wet ? 90 : 118);
    material.normalScale = new THREE.Vector2(wet ? .42 : .58, wet ? .42 : .58);
    material.color?.set?.(wet ? 0x98704b : 0xc49a65);
    material.roughness = wet ? .93 : .98;
    material.metalness = 0;
    material.transparent = false;
    material.opacity = 1;
    material.depthWrite = true;
    material.depthTest = true;
    material.needsUpdate = true;
    node.userData.v7310CoastSand = true;
  }

  function hideLegacyEdgeArtifacts(scene) {
    scene.traverse((node) => {
      if (!node?.isMesh) return;
      if (node.parent?.userData?.v736Shallows) {
        const index = node.parent.children.indexOf(node);
        if (index >= 2) node.visible = false; // the two untagged V7.3.6 foam strips
      }
      const p = node.geometry?.parameters;
      const width = Number(p?.width || 0), height = Number(p?.height || 0);
      if (height > 500 && width > 0 && width <= .20 && node.material?.transparent) node.visible = false;
      if (node.userData?.v736Foam || node.userData?.bankGuide || node.name === 'V736FoamStrip') node.visible = false;
    });
  }

  function rebuildShoreline(scene, maps) {
    if (scene.getObjectByName('V7310OpaqueShoreline')) return;
    const group = new THREE.Group();
    group.name = 'V7310OpaqueShoreline';
    group.userData.v7310OpaqueShoreline = true;
    for (const side of [-1, 1]) {
      const mat = new THREE.MeshStandardMaterial({
        color: 0x98704b,
        roughness: .95,
        metalness: 0,
        transparent: false,
        depthWrite: true,
        depthTest: true,
      });
      mat.map = cloneMap(maps.diffuse, 3.3, 96, true);
      mat.normalMap = cloneMap(maps.normal, 3.3, 96);
      mat.roughnessMap = cloneMap(maps.rough, 3.3, 96);
      mat.normalScale = new THREE.Vector2(.46, .46);
      const shore = new THREE.Mesh(new THREE.PlaneGeometry(1.15, 620), mat);
      shore.rotation.x = -Math.PI / 2;
      shore.position.set(side * 6.87, .105, 0);
      shore.receiveShadow = true;
      shore.renderOrder = 5;
      shore.userData.v7310CoastSand = true;
      group.add(shore);
    }
    scene.add(group);
  }

  function tightenWater(scene) {
    scene.traverse((node) => {
      if (!node?.isMesh || !node.material) return;
      const hex = node.material.color?.getHex?.();
      const isWater = [0x176b8b,0x2289a3,0x167b97,0x55adbd].includes(hex) || node.userData?.v736SecondWater;
      if (!isWater) return;
      if (node.userData?.v736SecondWater) { node.visible = false; return; }
      if (!node.userData.v7310WaterInset) {
        node.scale.x *= .935; // pull water edge ~45 cm inside each bank
        node.userData.v7310WaterInset = true;
      }
      node.position.y = Math.min(node.position.y, -.045);
      node.material.transparent = false;
      node.material.opacity = 1;
      node.material.depthWrite = true;
      node.material.depthTest = true;
      node.material.needsUpdate = true;
    });
  }

  async function prepareTerrain(scene) {
    if (terrainReady) return;
    const maps = await loadCoastSand();
    if (!maps.diffuse) return;
    hideLegacyEdgeArtifacts(scene);
    tightenWater(scene);
    scene.traverse((node) => {
      if (!node?.isMesh || !node.material) return;
      const mats = Array.isArray(node.material) ? node.material : [node.material];
      mats.forEach((material) => applySandMaterial(node, material, maps));
    });
    rebuildShoreline(scene, maps);
    terrainReady = true;
    window.__mosesV7310SandReady = Boolean(maps.diffuse && maps.normal && maps.rough);
    window.__mosesV7310ShoreReady = true;
  }

  function findPlayer(scene) {
    let found = null;
    scene.children.forEach((node) => {
      if (found || !node?.isGroup) return;
      let hasLid = false;
      node.traverse?.((child) => { if (child?.name === 'ClosedWovenLid') hasLid = true; });
      if (hasLid) found = node;
    });
    return found;
  }

  // Game.js writes high-frequency bob/roll and moves camera from the raw player X every frame.
  // Intercept the final render, then replace those transforms with critically damped values.
  const nativeRender = THREE.WebGLRenderer.prototype.render;
  THREE.WebGLRenderer.prototype.render = function v7310StableRender(scene, camera) {
    const now = performance.now();
    const dt = Math.min(.05, Math.max(.001, (now - lastNow) / 1000));
    lastNow = now;
    if (!renderState.player || !renderState.player.parent) renderState.player = findPlayer(scene);
    const player = renderState.player;
    if (player && camera) {
      if (!renderState.initialized) {
        renderState.cameraX = camera.position.x;
        renderState.lookX = player.position.x * .18;
        renderState.bob = .055;
        renderState.initialized = true;
      }
      const edge = smoothstep(Math.abs(player.position.x) / 4);
      const t = now * .001;
      const targetBob = .052 + Math.sin(t * 2.15) * (.018 - edge * .010);
      const targetRoll = Math.sin(t * 1.65) * (.012 - edge * .006);
      const targetPitch = Math.sin(t * 1.25) * .006;
      renderState.bob = damp(renderState.bob, targetBob, 7.5, dt);
      renderState.roll = damp(renderState.roll, targetRoll, 8.0, dt);
      renderState.pitch = damp(renderState.pitch, targetPitch, 8.0, dt);
      player.position.y = renderState.bob;
      player.rotation.z = renderState.roll;
      player.rotation.x = renderState.pitch;

      const desiredCameraX = player.position.x * .145;
      const desiredLookX = player.position.x * .205;
      renderState.cameraX = damp(renderState.cameraX, desiredCameraX, 4.2, dt);
      renderState.lookX = damp(renderState.lookX, desiredLookX, 4.0, dt);
      camera.position.x = renderState.cameraX;
      camera.position.y = damp(camera.position.y, 4.62, 8.0, dt);
      camera.position.z = damp(camera.position.z, 8.15, 8.0, dt);
      camera.lookAt(renderState.lookX, .55, -10.9);
      window.__mosesV7310BasketStable = true;
    }
    return nativeRender.call(this, scene, camera);
  };

  function findJaw(model) {
    let jaw = null;
    model?.traverse?.((node) => {
      if (jaw) return;
      const n = String(node?.name || '').toLowerCase();
      if (/(lower.?jaw|jaw.?lower|mandible|mouth|jaw)/.test(n)) jaw = node;
    });
    return jaw;
  }

  function makeBiteFx(item) {
    const fx = new THREE.Group();
    fx.name = 'V7310BiteFX';
    fx.visible = false;
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xe9fcff, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
    for (let r = 0; r < 3; r++) {
      const ring = new THREE.Mesh(new THREE.RingGeometry(.52 + r * .28, .62 + r * .31, 28), ringMat.clone());
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(0, .07, 1.6 + r * .10);
      ring.userData.v7310Ring = r;
      fx.add(ring);
    }
    for (let i = 0; i < 12; i++) {
      const mat = new THREE.MeshBasicMaterial({ color: i % 3 ? 0xcdf7ff : 0xffffff, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
      const splash = new THREE.Mesh(new THREE.PlaneGeometry(.055 + (i % 3) * .025, .45 + (i % 4) * .18), mat);
      const a = (i / 12) * Math.PI * 2;
      splash.position.set(Math.cos(a) * (.34 + (i % 2) * .18), .12, 1.55 + Math.sin(a) * .32);
      splash.rotation.z = -a + Math.PI / 2;
      splash.userData.v7310Splash = i;
      fx.add(splash);
    }
    item.add(fx);
    return fx;
  }

  function crocModel(item) {
    return item?.children?.find?.((child) => child && !child.userData?.v735Warning && !child.userData?.v738AttackFx && child.name !== 'V7310BiteFX') || item?.children?.[0] || null;
  }

  function ensureCroc(item) {
    let state = crocs.get(item);
    if (state) return state;
    const model = crocModel(item);
    const realJaw = findJaw(model);
    state = {
      model,
      realJaw,
      jawBase: realJaw?.rotation?.clone?.() || null,
      baseScale: model?.scale?.clone?.() || new THREE.Vector3(1,1,1),
      phase: Math.random() * Math.PI * 2,
      fx: makeBiteFx(item),
      yaw: 0,
      pitch: 0,
    };
    crocs.set(item, state);
    item.userData.v7310Croc = true;
    return state;
  }

  function animateBiteFx(state, now, attack, bite) {
    const amount = Math.max(attack * .65, bite);
    state.fx.visible = amount > .02;
    if (!state.fx.visible) return;
    state.fx.children.forEach((child, index) => {
      if (child.userData.v7310Ring !== undefined) {
        const r = child.userData.v7310Ring;
        child.material.opacity = amount * (.30 - r * .055);
        child.scale.setScalar(.78 + amount * (1.05 + r * .28));
        child.position.z = 1.55 + attack * .72 + r * .12;
      } else {
        const i = child.userData.v7310Splash;
        const pulse = .72 + .28 * Math.sin(now * .018 + i * .73);
        child.material.opacity = amount * (.30 + pulse * .42);
        child.scale.y = .75 + amount * (1.2 + (i % 4) * .18);
        child.position.y = .10 + amount * (.24 + (i % 3) * .11);
        child.position.z += amount * .006;
      }
    });
  }

  function animateCroc(item, state, now, dt) {
    if (!state.model) return;
    const z = Number(item.position.z || 0);
    const t = now * .001 + state.phase;
    const rise = smoothstep((z + 52) / 11);
    const tracking = bell(z, -38, -25, -17);
    const attack = bell(z, -24, -14.0, -8.2);
    const bite = bell(z, -14.2, -10.0, -7.0);
    const recoil = bell(z, -8.0, -5.5, -2.4);
    const desiredYaw = Math.sin(t * .72) * .08 + Math.sin(t * 1.45) * .045 * tracking;
    state.yaw = damp(state.yaw, desiredYaw, 5.2, dt);
    state.pitch = damp(state.pitch, -attack * .21 + bite * .17 + recoil * .055, 8.5, dt);

    const base = state.baseScale;
    const size = 1.28; // 28% larger than the already upgraded crocodile model
    state.model.scale.set(
      base.x * size * (1 + bite * .055),
      base.y * size * (1 - bite * .035),
      base.z * size * (1 + attack * .09 + bite * .035)
    );
    state.model.position.y = -1.94 + rise * 1.82 + Math.sin(t * 2.5) * .035 * rise;
    state.model.position.z = attack * 1.02 + bite * .22 - recoil * .14;
    state.model.position.x = Math.sin(t * .9) * .055 * tracking;
    state.model.rotation.y = state.yaw;
    state.model.rotation.z = Math.sin(t * 2.0) * .020 * rise - state.yaw * .18;
    state.model.rotation.x = state.pitch;

    if (state.realJaw && state.jawBase) {
      const open = bell(z, -23.0, -14.0, -10.5);
      const slam = bell(z, -11.6, -9.5, -7.5);
      state.realJaw.rotation.copy(state.jawBase);
      state.realJaw.rotation.x = state.jawBase.x + open * .92 - slam * .26;
    }
    item.userData.radius = z < -40 ? 0 : 1.95 + rise * .32 + bite * .22;
    item.userData.v7310Attack = bite > .22;
    animateBiteFx(state, now, attack, bite);
  }

  function updateBadge(scene) {
    const badge = document.getElementById('version-badge');
    if (!badge) return;
    const ready = Boolean(window.__mosesV7310SandReady && window.__mosesV7310ShoreReady && window.__mosesV7310BasketStable);
    window.__mosesV7310Ready = ready;
    badge.dataset.state = ready ? 'ready' : '';
    badge.textContent = ready ? 'V7.3.10 · STABLE BASKET · BIG CROCS · COAST SAND' : 'V7.3.10 · LOADING';
  }

  function frame(now) {
    const dt = Math.min(.05, Math.max(.001, (now - lastNow) / 1000));
    const scene = window.__mosesV73Scene;
    if (scene) {
      if (!terrainReady) prepareTerrain(scene).catch(() => {});
      hideLegacyEdgeArtifacts(scene);
      scene.children.forEach((node) => {
        if (node?.userData?.v73Croc) animateCroc(node, ensureCroc(node), now, dt);
      });
      updateBadge(scene);
    }
    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
})();
