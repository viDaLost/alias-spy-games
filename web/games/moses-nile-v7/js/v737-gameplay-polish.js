(() => {
  'use strict';
  if (window.__mosesV737Installed || !window.THREE) return;
  window.__mosesV737Installed = true;

  const THREE = window.THREE;
  const crocState = new WeakMap();
  let player = null;
  let banksCleaned = false;

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function smoothstep(v) { const t = clamp(v, 0, 1); return t * t * (3 - 2 * t); }

  function findPlayer(scene) {
    if (player?.parent) return player;
    player = scene.children.find((node) => node?.getObjectByName?.('ClosedWovenLid')) || null;
    return player;
  }

  function keepBasketFullyVisible(scene) {
    const p = findPlayer(scene);
    if (!p) return;
    // The original lane centers are +/-4. On narrow portrait screens the basket clips.
    // Clamp the visible player center while preserving the three-lane gameplay/collisions.
    p.position.x = clamp(p.position.x, -3.05, 3.05);
  }

  function cleanBankStrips(scene) {
    if (banksCleaned) return;
    const shallowGroup = scene.children.find((node) => node?.userData?.v736Shallows);
    if (!shallowGroup) return;
    shallowGroup.children.forEach((child) => {
      const hex = child?.material?.color?.getHex?.();
      // V7.3.6 foam/guide strips were the two pale transparent bank lines.
      if (hex === 0xe1f4ec) {
        child.visible = false;
        child.userData.v737HiddenBankStrip = true;
      }
    });
    banksCleaned = true;
  }

  function findCrocModel(item) {
    return item.userData?.v733Model
      || item.children?.find?.((child) => child && !child.userData?.v733Wake && !child.userData?.v735Warning)
      || item.children?.[0]
      || null;
  }

  function findJawNode(model) {
    let jaw = null;
    model?.traverse?.((node) => {
      if (jaw) return;
      const name = String(node?.name || '').toLowerCase();
      if (/(lower.?jaw|jaw.?lower|mandible|mouth|jaw)/.test(name)) jaw = node;
    });
    return jaw;
  }

  function cloneCrocMaterial(model) {
    let material = null;
    model?.traverse?.((node) => {
      if (material || !node?.isMesh || !node.material) return;
      const source = Array.isArray(node.material) ? node.material[0] : node.material;
      if (source) material = source.clone();
    });
    if (!material) material = new THREE.MeshStandardMaterial({ color: 0x263f2d, roughness: .78 });
    if ('roughness' in material) material.roughness = Math.max(.72, Number(material.roughness ?? .78));
    if ('metalness' in material) material.metalness = 0;
    material.side = THREE.DoubleSide;
    return material;
  }

  function makeFallbackJaw(item, model) {
    const pivot = new THREE.Group();
    pivot.name = 'V737FallbackJawPivot';
    pivot.userData.v737FallbackJaw = true;
    pivot.position.set(0, .03, 1.12);

    const jaw = new THREE.Mesh(
      new THREE.BoxGeometry(.82, .13, 1.18),
      cloneCrocMaterial(model),
    );
    jaw.position.set(0, -.055, .53);
    jaw.castShadow = true;
    pivot.add(jaw);

    const gumMaterial = new THREE.MeshStandardMaterial({ color: 0x4a211d, roughness: .85 });
    const gum = new THREE.Mesh(new THREE.BoxGeometry(.68, .045, .88), gumMaterial);
    gum.position.set(0, .018, .52);
    pivot.add(gum);

    const toothMaterial = new THREE.MeshStandardMaterial({ color: 0xe9dfbf, roughness: .72 });
    [-.27, -.09, .09, .27].forEach((x, index) => {
      const tooth = new THREE.Mesh(new THREE.ConeGeometry(.035, .11, 4), toothMaterial);
      tooth.position.set(x, .085, .22 + (index % 2) * .42);
      tooth.rotation.x = Math.PI;
      pivot.add(tooth);
    });

    item.add(pivot);
    return pivot;
  }

  function ensureCroc(item) {
    if (crocState.has(item)) return crocState.get(item);
    const model = findCrocModel(item);
    const realJaw = findJawNode(model);
    const state = {
      model,
      realJaw,
      jawBase: realJaw?.rotation?.clone?.() || null,
      fallbackJaw: realJaw ? null : makeFallbackJaw(item, model),
      didSnap: false,
    };
    item.userData.v737Chomp = true;
    crocState.set(item, state);
    return state;
  }

  function removeCircleUnderVisibleCroc(item, state) {
    const warning = item.children?.find?.((child) => child?.userData?.v735Warning);
    if (!warning) return;
    const modelY = Number(state.model?.position?.y ?? -2);
    // Keep the telegraph while submerged, but never leave the circular ripple under a visible croc.
    if (modelY > -1.05 || item.position.z > -29) warning.visible = false;
  }

  function chompAmount(z) {
    // Crocodile is already surfaced by this point. It opens, then snaps shut very quickly
    // while still far enough from the basket for a last-second dodge.
    if (z <= -19 || z >= -5.5) return 0;
    const p = (z + 19) / 13.5;
    if (p < .48) return smoothstep(p / .48);
    if (p < .63) return 1 - smoothstep((p - .48) / .15);
    return 0;
  }

  function animateChomp(item, state) {
    const amount = chompAmount(Number(item.position.z));
    if (state.realJaw && state.jawBase) {
      state.realJaw.rotation.copy(state.jawBase);
      state.realJaw.rotation.x = state.jawBase.x + amount * .62;
    }
    if (state.fallbackJaw) {
      state.fallbackJaw.visible = Number(state.model?.position?.y ?? -2) > -1.05;
      state.fallbackJaw.rotation.x = amount * .58;
    }

    if (state.model) {
      const z = Number(item.position.z);
      if (z > -13.5 && z < -10.5) {
        const snap = 1 - Math.abs(((z + 12) / 1.5));
        state.model.rotation.x -= clamp(snap, 0, 1) * .055;
      }
    }
  }

  function updateBadge() {
    const badge = document.getElementById('version-badge');
    if (!badge || !window.__mosesV736TexturesReady) return;
    badge.dataset.state = 'ready';
    badge.textContent = 'V7.3.7 · CROCS CHOMP · CLEAN BANKS · SAFE EDGES';
  }

  function frame() {
    const scene = window.__mosesV73Scene;
    if (scene) {
      cleanBankStrips(scene);
      keepBasketFullyVisible(scene);
      scene.children.forEach((node) => {
        if (!node?.userData?.v73Croc) return;
        const state = ensureCroc(node);
        removeCircleUnderVisibleCroc(node, state);
        animateChomp(node, state);
      });
      updateBadge();
    }
    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
})();
