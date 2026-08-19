(() => {
  'use strict';
  if (window.__mosesV736Installed || !window.THREE) return;
  window.__mosesV736Installed = true;

  const THREE = window.THREE;
  const loader = new THREE.TextureLoader();
  let applied = false;
  let applying = false;
  let waterNormalA = null;
  let waterNormalB = null;
  let waterOverlay = null;
  let shallowGroup = null;
  let lastNow = performance.now();

  const urls = Object.freeze({
    sandDiffuse: 'textures/sand-03-diffuse-1k.jpg',
    sandNormal: 'textures/sand-03-normal-gl-1k.jpg',
    dampDiffuse: 'textures/damp-sand-diffuse-1k.jpg',
    dampNormal: 'textures/damp-sand-normal-gl-1k.jpg',
    pebblesDiffuse: 'textures/ganges-pebbles-diffuse-1k.jpg',
    pebblesNormal: 'textures/ganges-pebbles-normal-gl-1k.jpg',
    waterNormalA: 'textures/Water_1_M_Normal.jpg',
    waterNormalB: 'textures/Water_2_M_Normal.jpg',
  });

  function loadTexture(url, srgb = false) {
    return new Promise((resolve) => {
      loader.load(url, (texture) => {
        texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
        texture.anisotropy = 2;
        if (srgb && 'encoding' in texture) texture.encoding = THREE.sRGBEncoding;
        resolve(texture);
      }, undefined, () => resolve(null));
    });
  }

  function sameColor(material, hex) {
    try { return material?.color?.getHex?.() === hex; } catch { return false; }
  }

  function setMap(material, source, repeatX, repeatY, srgb = false) {
    if (!material || !source) return null;
    const texture = source.clone();
    texture.needsUpdate = true;
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(repeatX, repeatY);
    texture.anisotropy = 2;
    if (srgb && 'encoding' in texture) texture.encoding = THREE.sRGBEncoding;
    material.map = texture;
    return texture;
  }

  function setNormal(material, source, repeatX, repeatY, strength = .45) {
    if (!material || !source) return null;
    const texture = source.clone();
    texture.needsUpdate = true;
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(repeatX, repeatY);
    texture.anisotropy = 2;
    material.normalMap = texture;
    material.normalScale = new THREE.Vector2(strength, strength);
    return texture;
  }

  function makeShallows(scene, maps) {
    if (shallowGroup || !maps.pebblesDiffuse) return;
    const group = new THREE.Group();
    group.userData.v736Shallows = true;

    [-1, 1].forEach((side) => {
      const material = new THREE.MeshStandardMaterial({
        color: 0xa6c5aa,
        map: maps.pebblesDiffuse.clone(),
        normalMap: maps.pebblesNormal ? maps.pebblesNormal.clone() : null,
        normalScale: new THREE.Vector2(.32, .32),
        roughness: .92,
        metalness: 0,
        transparent: true,
        opacity: .42,
        depthWrite: false,
      });
      material.map.wrapS = material.map.wrapT = THREE.RepeatWrapping;
      material.map.repeat.set(2.2, 118);
      material.map.anisotropy = 2;
      if ('encoding' in material.map) material.map.encoding = THREE.sRGBEncoding;
      if (material.normalMap) {
        material.normalMap.wrapS = material.normalMap.wrapT = THREE.RepeatWrapping;
        material.normalMap.repeat.copy(material.map.repeat);
        material.normalMap.anisotropy = 2;
      }
      const strip = new THREE.Mesh(new THREE.PlaneGeometry(1.55, 620, 1, 32), material);
      strip.rotation.x = -Math.PI / 2;
      strip.position.set(side * 6.05, .026, 0);
      strip.renderOrder = 2;
      group.add(strip);
    });

    const foamMaterial = new THREE.MeshBasicMaterial({
      color: 0xe1f4ec,
      transparent: true,
      opacity: .18,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    [-1, 1].forEach((side) => {
      const foam = new THREE.Mesh(new THREE.PlaneGeometry(.12, 620), foamMaterial.clone());
      foam.rotation.x = -Math.PI / 2;
      foam.position.set(side * 6.92, .042, 0);
      foam.renderOrder = 3;
      group.add(foam);
    });

    scene.add(group);
    shallowGroup = group;
  }

  function makeSecondWaterLayer(scene, maps) {
    if (waterOverlay || !maps.waterNormalB) return;
    waterNormalB = maps.waterNormalB.clone();
    waterNormalB.needsUpdate = true;
    waterNormalB.wrapS = waterNormalB.wrapT = THREE.RepeatWrapping;
    waterNormalB.repeat.set(5.7, 74);
    waterNormalB.anisotropy = 2;

    const material = new THREE.MeshStandardMaterial({
      color: 0x55adbd,
      normalMap: waterNormalB,
      normalScale: new THREE.Vector2(.46, .46),
      roughness: .46,
      metalness: .015,
      transparent: true,
      opacity: .18,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(13.86, 620, 10, 48), material);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = .018;
    mesh.renderOrder = 1;
    mesh.userData.v736SecondWater = true;
    scene.add(mesh);
    waterOverlay = mesh;
  }

  async function applyTextures(scene) {
    if (applied || applying || !scene) return;
    applying = true;
    const [sandDiffuse, sandNormal, dampDiffuse, dampNormal, pebblesDiffuse, pebblesNormal, normalA, normalB] = await Promise.all([
      loadTexture(urls.sandDiffuse, true),
      loadTexture(urls.sandNormal),
      loadTexture(urls.dampDiffuse, true),
      loadTexture(urls.dampNormal),
      loadTexture(urls.pebblesDiffuse, true),
      loadTexture(urls.pebblesNormal),
      loadTexture(urls.waterNormalA),
      loadTexture(urls.waterNormalB),
    ]);
    const maps = { sandDiffuse, sandNormal, dampDiffuse, dampNormal, pebblesDiffuse, pebblesNormal, waterNormalA: normalA, waterNormalB: normalB };

    scene.traverse((node) => {
      if (!node?.isMesh || !node.material) return;
      const materials = Array.isArray(node.material) ? node.material : [node.material];
      materials.forEach((material) => {
        if (!material) return;
        const isMainSand = node.userData?.v73Bank || sameColor(material, 0xc98638) || sameColor(material, 0xd4a35f);
        const isWetSand = sameColor(material, 0x8d673d);
        const isWater = sameColor(material, 0x176b8b);

        if (isMainSand && sandDiffuse) {
          setMap(material, sandDiffuse, 18, 132, true);
          setNormal(material, sandNormal, 18, 132, .44);
          material.color.set(0xd0a064);
          material.roughness = .98;
          material.metalness = 0;
          material.needsUpdate = true;
        }

        if (isWetSand && dampDiffuse) {
          setMap(material, dampDiffuse, .82, 118, true);
          setNormal(material, dampNormal, .82, 118, .38);
          material.color.set(0x9a7149);
          material.roughness = .88;
          material.metalness = 0;
          material.needsUpdate = true;
        }

        if (isWater && normalA) {
          waterNormalA = normalA.clone();
          waterNormalA.needsUpdate = true;
          waterNormalA.wrapS = waterNormalA.wrapT = THREE.RepeatWrapping;
          waterNormalA.repeat.set(5.2, 70);
          waterNormalA.anisotropy = 2;
          material.map = null;
          material.normalMap = waterNormalA;
          material.normalScale = new THREE.Vector2(.58, .58);
          material.color.set(0x2289a3);
          material.roughness = .35;
          material.metalness = .035;
          material.emissive?.set?.(0x04232c);
          material.emissiveIntensity = .035;
          material.needsUpdate = true;
        }
      });
    });

    makeShallows(scene, maps);
    makeSecondWaterLayer(scene, maps);
    applied = true;
    applying = false;
    window.__mosesV736TexturesReady = Boolean(sandDiffuse && dampDiffuse && pebblesDiffuse && normalA && normalB);
  }

  function animateWater(now, dt) {
    if (waterNormalA) {
      waterNormalA.offset.x = (waterNormalA.offset.x + dt * .012) % 1;
      waterNormalA.offset.y = (waterNormalA.offset.y - dt * .046) % 1;
    }
    if (waterNormalB) {
      waterNormalB.offset.x = (waterNormalB.offset.x - dt * .020) % 1;
      waterNormalB.offset.y = (waterNormalB.offset.y - dt * .071) % 1;
    }
    if (waterOverlay) {
      waterOverlay.material.opacity = .16 + (.5 + .5 * Math.sin(now * .0012)) * .035;
    }
    if (shallowGroup) {
      shallowGroup.children.forEach((child, index) => {
        if (index < 2 && child.material?.map) child.material.map.offset.y = (child.material.map.offset.y - dt * .012) % 1;
      });
    }
  }

  function updateBadge() {
    const badge = document.getElementById('version-badge');
    if (!badge) return;
    const ready = Boolean(window.__mosesV736TexturesReady);
    badge.dataset.state = ready ? 'ready' : '';
    badge.textContent = ready
      ? 'V7.3.6 · SAND + DAMP · SHALLOWS · DUAL WATER'
      : 'V7.3.6 · TEXTURES LOADING';
  }

  function frame(now) {
    const scene = window.__mosesV73Scene;
    const dt = Math.min(.05, Math.max(.001, (now - lastNow) / 1000));
    lastNow = now;
    if (scene) {
      if (!applied && !applying) applyTextures(scene).catch(() => { applying = false; });
      animateWater(now, dt);
      updateBadge();
    }
    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
})();
