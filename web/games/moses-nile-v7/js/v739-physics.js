(() => {
  'use strict';
  if (window.__mosesV739Installed || !window.THREE || !window.assetManager) return;
  window.__mosesV739Installed = true;

  const THREE = window.THREE;
  const ASSET = window.assetManager;
  const crocState = new WeakMap();
  let scenePrepared = false;
  let lastNow = performance.now();

  // V7.3.9 intentionally has no people. Prevent the human GLB from loading at runtime.
  const nativeTryLoad = ASSET._tryLoad.bind(ASSET);
  ASSET._tryLoad = function v739NoHumanLoader(url) {
    if (/\/human\.glb(?:\?|$)/i.test(String(url || ''))) {
      return Promise.reject(new Error('V7.3.9: human model disabled'));
    }
    return nativeTryLoad(url);
  };
  delete ASSET.models.human;

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const smooth = (x) => { const t = clamp(x, 0, 1); return t * t * (3 - 2 * t); };
  const bell = (z, a, b, c) => z <= a || z >= c ? 0 : z <= b ? smooth((z - a) / (b - a)) : 1 - smooth((z - b) / (c - b));

  function removePeople(scene) {
    const victims = [];
    scene.traverse((node) => {
      if (node?.userData?.v73Person || node?.userData?.v733Extra || /human/i.test(String(node?.name || ''))) victims.push(node);
    });
    victims.forEach((node) => node.parent?.remove(node));
    delete ASSET.models.human;
  }

  function waterMaterial(material) {
    if (!material) return false;
    const hex = material.color?.getHex?.();
    return hex === 0x176b8b || hex === 0x2289a3 || hex === 0x55adbd;
  }

  function prepareRiver(scene) {
    if (scenePrepared) return;
    scenePrepared = true;

    scene.traverse((node) => {
      if (!node?.isMesh || !node.material) return;
      const mats = Array.isArray(node.material) ? node.material : [node.material];
      mats.forEach((material) => {
        if (!waterMaterial(material) && !node.userData?.v736SecondWater) return;
        material.transparent = false;
        material.opacity = 1;
        material.depthWrite = true;
        material.depthTest = true;
        material.alphaTest = 0;
        material.side = THREE.FrontSide;
        material.color?.set?.(0x167b97);
        material.roughness = Math.max(.32, Number(material.roughness ?? .35));
        material.metalness = Math.min(.025, Number(material.metalness ?? 0));
        material.needsUpdate = true;
        node.renderOrder = 0;
        node.position.y = Math.min(node.position.y, -.018);
      });

      // Old transparent shoreline helpers are a common source of water/sand bleed.
      if (node.userData?.v736Foam || node.userData?.bankGuide || node.name === 'V736FoamStrip') node.visible = false;
    });

    // Hide the transparent second water sheet; the main water receives both normal maps visually.
    scene.children.forEach((node) => {
      if (node?.userData?.v736SecondWater) node.visible = false;
      if (node?.userData?.v736Shallows) {
        node.children?.forEach?.((child) => {
          if (child.material) {
            child.material.depthWrite = true;
            child.material.depthTest = true;
            child.material.opacity = Math.min(.28, Number(child.material.opacity ?? .28));
          }
        });
      }
    });

    // Opaque wet-sand lips physically cover the river edge. They sit above water and eliminate z-fighting.
    const edge = new THREE.Group();
    edge.name = 'V739RiverBankOccluders';
    edge.userData.v739RiverBankOccluders = true;
    for (const side of [-1, 1]) {
      const mat = new THREE.MeshStandardMaterial({
        color: 0xa87343,
        roughness: .96,
        metalness: 0,
        transparent: false,
        depthWrite: true,
        depthTest: true,
      });
      const lip = new THREE.Mesh(new THREE.PlaneGeometry(.62, 620), mat);
      lip.rotation.x = -Math.PI / 2;
      lip.position.set(side * 7.08, .072, 0);
      lip.receiveShadow = true;
      lip.renderOrder = 2;
      edge.add(lip);
    }
    scene.add(edge);
    window.__mosesV739WaterReady = true;
  }

  function crocModel(item) {
    return item?.userData?.v733Model
      || item?.children?.find?.((child) => child && !child.userData?.v735Warning && !child.userData?.v738AttackFx && !child.userData?.v733Wake)
      || item?.children?.[0]
      || null;
  }

  function stateFor(item) {
    let state = crocState.get(item);
    if (state) return state;
    const model = crocModel(item);
    state = {
      model,
      phase: Math.random() * Math.PI * 2,
      yaw: 0,
      roll: 0,
      heave: 0,
      surge: 0,
      baseX: Number(item.position.x || 0),
      baseScale: model?.scale?.clone?.() || new THREE.Vector3(1, 1, 1),
    };
    crocState.set(item, state);
    item.userData.v739Physics = true;
    return state;
  }

  function animateCroc(item, state, now, dt) {
    const model = state.model;
    if (!model) return;
    const z = Number(item.position.z || 0);
    const t = now * .001 + state.phase;

    // Behaviour states along the approach path.
    const rise = smooth((z + 49) / 10);
    const surface = smooth((z + 39) / 8);
    const track = bell(z, -34, -23, -14);
    const lunge = bell(z, -22, -13.0, -7.5);
    const bite = bell(z, -13.5, -10.3, -7.6);
    const recover = bell(z, -8.5, -5.7, -2.8);

    // Hydrodynamics: damped heading, roll and vertical buoyancy.
    const desiredYaw = Math.sin(t * .78) * .10 * surface + Math.sin(t * 1.7) * .035 * track;
    state.yaw += (desiredYaw - state.yaw) * Math.min(1, dt * 4.8);
    const desiredRoll = Math.sin(t * 2.25) * .032 * surface + state.yaw * -.24;
    state.roll += (desiredRoll - state.roll) * Math.min(1, dt * 5.5);
    const desiredHeave = Math.sin(t * 3.15) * .055 * surface;
    state.heave += (desiredHeave - state.heave) * Math.min(1, dt * 6.2);
    const desiredSurge = lunge * .78 + bite * .18 - recover * .10;
    state.surge += (desiredSurge - state.surge) * Math.min(1, dt * 8.5);

    if (z < -49) model.position.y = -1.90;
    else model.position.y = -1.90 + rise * 1.76 + state.heave;
    model.position.z = state.surge;
    model.rotation.y = state.yaw;
    model.rotation.z = state.roll;
    model.rotation.x = Math.sin(t * 2.7) * .014 - lunge * .17 + bite * .13 + recover * .04;
    model.position.x = Math.sin(t * .92) * .06 * track;
    model.scale.set(
      state.baseScale.x * (1 + bite * .035),
      state.baseScale.y * (1 - bite * .028),
      state.baseScale.z * (1 + lunge * .065 + bite * .025)
    );

    // Collision body follows what is physically above water.
    if (z < -39) item.userData.radius = 0;
    else if (z < -31) item.userData.radius = .85 + surface * .65;
    else item.userData.radius = 1.72 + bite * .20;
    item.userData.v739State = z < -39 ? 'submerged' : lunge > .25 ? 'lunge' : bite > .25 ? 'bite' : recover > .2 ? 'recover' : 'surface';
  }

  function updateBadge(scene) {
    const badge = document.getElementById('version-badge');
    if (!badge) return;
    const peopleCount = scene.children.filter((node) => node?.userData?.v73Person || node?.userData?.v733Extra).length;
    const ready = Boolean(window.__mosesV739WaterReady && peopleCount === 0);
    window.__mosesV738Ready = ready;
    window.__mosesV739Ready = ready;
    badge.dataset.state = ready ? 'ready' : '';
    badge.textContent = ready ? 'V7.3.9 · SOLID WATER · CROC PHYSICS · NO PEOPLE' : 'V7.3.9 · LOADING';
  }

  function frame(now) {
    const dt = Math.min(.05, Math.max(.001, (now - lastNow) / 1000));
    lastNow = now;
    const scene = window.__mosesV73Scene;
    if (scene) {
      removePeople(scene);
      prepareRiver(scene);
      scene.children.forEach((node) => {
        if (node?.userData?.v73Croc) animateCroc(node, stateFor(node), now, dt);
      });
      updateBadge(scene);
    }
    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
})();
