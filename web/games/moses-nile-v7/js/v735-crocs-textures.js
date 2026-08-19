(() => {
  'use strict';
  if (window.__mosesV735Installed || !window.THREE) return;
  window.__mosesV735Installed = true;

  const THREE = window.THREE;
  const crocState = new WeakMap();
  const textureLoader = new THREE.TextureLoader();
  let texturesApplied = false;
  let texturePromise = null;
  let waterTexture = null;
  let waterNormal = null;
  let lastNow = performance.now();

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function smoothstep(v) { const t = clamp(v, 0, 1); return t * t * (3 - 2 * t); }
  function lerp(a, b, t) { return a + (b - a) * t; }

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

  async function ensureTextures() {
    if (texturePromise) return texturePromise;
    texturePromise = Promise.all([
      loadTexture('textures/aerial-beach-01-diffuse.png', true),
      loadTexture('textures/aerial-beach-01-normal.png'),
      loadTexture('textures/water.jpg', true),
      loadTexture('textures/waternormals.jpg'),
    ]).then(([sandDiffuse, sandNormal, riverColor, riverNormal]) => ({ sandDiffuse, sandNormal, riverColor, riverNormal }));
    return texturePromise;
  }

  function sameColor(material, hex) {
    try { return material?.color?.getHex?.() === hex; } catch { return false; }
  }

  async function applyRealTextures(scene) {
    if (texturesApplied || !scene || window.__mosesV736Installed) return;
    const maps = await ensureTextures();
    if (!maps || window.__mosesV736Installed) return;

    scene.traverse((node) => {
      if (!node?.isMesh || !node.material) return;
      const materials = Array.isArray(node.material) ? node.material : [node.material];
      materials.forEach((material) => {
        if (!material) return;
        const isBank = node.userData?.v73Bank || sameColor(material, 0xc98638) || sameColor(material, 0xd4a35f);
        const isWater = sameColor(material, 0x176b8b);

        if (isBank && maps.sandDiffuse) {
          const diffuse = maps.sandDiffuse.clone();
          diffuse.needsUpdate = true;
          diffuse.wrapS = diffuse.wrapT = THREE.RepeatWrapping;
          diffuse.repeat.set(5.5, 34);
          if ('encoding' in diffuse) diffuse.encoding = THREE.sRGBEncoding;
          material.map = diffuse;
          material.color.set(0xd7ad72);
          material.roughness = .96;
          material.metalness = 0;
          if (maps.sandNormal) {
            const normal = maps.sandNormal.clone();
            normal.needsUpdate = true;
            normal.wrapS = normal.wrapT = THREE.RepeatWrapping;
            normal.repeat.copy(diffuse.repeat);
            material.normalMap = normal;
            material.normalScale = new THREE.Vector2(.48, .48);
          }
          material.needsUpdate = true;
        }

        if (isWater && maps.riverColor) {
          waterTexture = maps.riverColor;
          waterTexture.repeat.set(3.2, 46);
          material.map = waterTexture;
          material.color.set(0x72b9c5);
          material.roughness = .34;
          material.metalness = .07;
          material.emissive?.set?.(0x062732);
          material.emissiveIntensity = .045;
          if (maps.riverNormal) {
            waterNormal = maps.riverNormal;
            waterNormal.repeat.set(4.5, 58);
            material.normalMap = waterNormal;
            material.normalScale = new THREE.Vector2(.62, .62);
          }
          material.needsUpdate = true;
        }
      });
    });

    texturesApplied = true;
    window.__mosesV735TexturesReady = Boolean(maps.sandDiffuse && maps.riverColor && maps.riverNormal);
  }

  function makeWarningRipples() {
    const group = new THREE.Group();
    group.userData.v735Warning = true;
    for (let i = 0; i < 3; i += 1) {
      const material = new THREE.MeshBasicMaterial({
        color: 0xd7f8ff,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      const ring = new THREE.Mesh(new THREE.RingGeometry(.58 + i * .28, .67 + i * .31, 28), material);
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = .045 + i * .002;
      ring.userData.phase = i * 1.9;
      group.add(ring);
    }
    return group;
  }

  function ensureCroc(item) {
    if (crocState.has(item)) return crocState.get(item);
    const model = item.userData?.v733Model || item.children?.find?.((child) => child && !child.userData?.v733Wake && !child.userData?.v735Warning) || item.children?.[0];
    const warning = makeWarningRipples();
    item.add(warning);

    if (model && !model.userData?.v735Scaled) {
      model.scale.multiplyScalar(1.36);
      model.userData.v735Scaled = true;
    }

    const triggerZ = -41 + Math.random() * 4;
    const state = {
      model,
      warning,
      baseX: Number(item.userData?.v733BaseX ?? item.position.x),
      phase: Number(item.userData?.v733Phase ?? Math.random() * Math.PI * 2),
      triggerZ,
      riseEndZ: triggerZ + 11,
      originalRadius: 1.82,
    };
    item.userData.v735UniqueCroc = true;
    item.userData.radius = 0;
    crocState.set(item, state);
    return state;
  }

  function animateWarning(state, now, visibility) {
    const t = now * .001;
    state.warning.visible = visibility > .01;
    state.warning.children.forEach((ring, index) => {
      const pulse = .5 + .5 * Math.sin(t * 5.2 + ring.userData.phase);
      ring.material.opacity = visibility * (.10 + pulse * .24);
      const s = .82 + index * .22 + pulse * .20;
      ring.scale.setScalar(s);
    });
  }

  function animateCroc(item, state, now) {
    if (!item?.parent) return;
    const z = Number(item.position.z);
    const model = state.model;
    const prewarnStart = state.triggerZ - 11;
    const warningVisibility = smoothstep((z - prewarnStart) / 8);
    animateWarning(state, now, warningVisibility);

    const surfacing = smoothstep((z - state.triggerZ) / (state.riseEndZ - state.triggerZ));
    const t = now * .001 + state.phase;
    const swim = Math.sin(t * 1.12) * .30;
    const tailMotion = Math.sin(t * 2.55) * .035;

    item.position.x = state.baseX + swim * (.35 + surfacing * .45);
    item.rotation.set(0, 0, Math.sin(t * 1.8) * .010 * surfacing);

    if (model) {
      model.rotation.y = Math.sin(t * 1.05) * .075 * surfacing;
      model.rotation.x = Math.sin(t * 2.3) * .018 * surfacing;
      model.rotation.z = tailMotion * surfacing;
      if (z < state.triggerZ) {
        model.position.y = -1.62;
      } else if (z < state.riseEndZ) {
        model.position.y = lerp(-1.62, -.14, surfacing);
      } else {
        model.position.y = -.14 + Math.sin(t * 3.0) * .045;
      }
    }

    item.userData.radius = surfacing > .82 ? state.originalRadius : 0;

    const wake = item.userData?.v733Wake;
    if (wake?.children) {
      wake.visible = surfacing > .30;
      wake.children.forEach((streak, index) => {
        const pulse = .5 + .5 * Math.sin(t * 4.5 + index * 2.2);
        streak.material.opacity = surfacing * (.09 + pulse * .18);
        streak.scale.x = 1.10 + pulse * .62;
        streak.position.z = -1.30 - pulse * .35;
      });
    }
  }

  function updateBadge(scene) {
    if (window.__mosesV736Installed) return;
    const badge = document.getElementById('version-badge');
    if (!badge || !scene) return;
    const textures = window.__mosesV735TexturesReady ? 'TEXTURES ON' : 'TEXTURES…';
    badge.dataset.state = window.__mosesV735TexturesReady ? 'ready' : '';
    badge.textContent = `V7.3.5 · CROCS SURFACE · ${textures}`;
  }

  function frame(now) {
    const scene = window.__mosesV73Scene;
    const dt = Math.min(.05, Math.max(.001, (now - lastNow) / 1000));
    lastNow = now;
    if (scene) {
      if (!window.__mosesV736Installed && !texturesApplied) applyRealTextures(scene).catch(() => {});
      scene.children.forEach((node) => {
        if (node?.userData?.v73Croc) animateCroc(node, ensureCroc(node), now);
      });
      if (!window.__mosesV736Installed) {
        if (waterTexture) waterTexture.offset.y -= dt * .030;
        if (waterNormal) {
          waterNormal.offset.y -= dt * .045;
          waterNormal.offset.x = Math.sin(now * .00035) * .025;
        }
        updateBadge(scene);
      }
    }
    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
})();
