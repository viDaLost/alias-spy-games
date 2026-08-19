(() => {
  'use strict';
  if (window.__mosesV731Installed || !window.THREE) return;
  window.__mosesV731Installed = true;

  const THREE = window.THREE;
  const fallbackWavers = [];

  function makeFallbackWaveArm(person) {
    if (!person?.userData?.v73Person || person.userData.waveBone || person.userData.v731WaveArm) return;
    const inward = person.position.x < 0 ? 1 : -1;
    const shoulder = new THREE.Group();
    shoulder.name = 'V731FallbackWaveArm';
    shoulder.position.set(inward * .33, 1.36, .02);

    const linen = new THREE.MeshStandardMaterial({ color: 0xe9dcc0, roughness: .94 });
    const skin = new THREE.MeshStandardMaterial({ color: 0xc98b63, roughness: .88 });
    const upper = new THREE.Mesh(new THREE.CylinderGeometry(.065, .085, .52, 7), linen);
    upper.position.y = .24;
    upper.castShadow = true;
    shoulder.add(upper);

    const elbow = new THREE.Group();
    elbow.position.y = .49;
    const forearm = new THREE.Mesh(new THREE.CylinderGeometry(.052, .065, .48, 7), skin);
    forearm.position.y = .22;
    forearm.castShadow = true;
    elbow.add(forearm);
    const hand = new THREE.Mesh(new THREE.SphereGeometry(.085, 8, 6), skin);
    hand.position.y = .48;
    hand.castShadow = true;
    elbow.add(hand);
    shoulder.add(elbow);

    shoulder.rotation.z = inward * -.68;
    elbow.rotation.z = inward * .34;
    person.add(shoulder);
    person.userData.v731WaveArm = shoulder;
    person.userData.v731WaveElbow = elbow;
    person.userData.v731NextWave = performance.now() + 800 + Math.random() * 4200;
    person.userData.v731WaveStart = 0;
    fallbackWavers.push(person);
  }

  function animateFallbackWave(person, now) {
    const arm = person.userData.v731WaveArm;
    const elbow = person.userData.v731WaveElbow;
    if (!arm || !elbow) return;
    const inward = person.position.x < 0 ? 1 : -1;
    if (!person.userData.v731WaveStart && now >= person.userData.v731NextWave) person.userData.v731WaveStart = now;
    if (!person.userData.v731WaveStart) return;

    const elapsed = now - person.userData.v731WaveStart;
    if (elapsed > 2100) {
      person.userData.v731WaveStart = 0;
      person.userData.v731NextWave = now + 2200 + Math.random() * 6500;
      arm.rotation.set(0, 0, inward * -.68);
      elbow.rotation.set(0, 0, inward * .34);
      return;
    }

    const p = elapsed / 2100;
    const lift = Math.sin(Math.min(1, p * 2.1) * Math.PI * .5);
    const wave = Math.sin(p * Math.PI * 10) * .28;
    arm.rotation.z = inward * (-.68 - lift * .78 + wave);
    arm.rotation.x = -.20 * lift;
    elbow.rotation.z = inward * (.34 + .22 * Math.sin(p * Math.PI * 10 + .8));
  }

  function improveClosedBasket(scene) {
    if (!scene || scene.userData?.v731BasketDone) return;
    let lid = null;
    scene.traverse((node) => {
      if (!lid && node.name === 'ClosedWovenLid') lid = node;
    });
    if (!lid) return;
    lid.position.y += .06;
    lid.scale.set(1.06, 1.02, 1.06);
    lid.traverse((node) => {
      if (!node?.isMesh || !node.material) return;
      const mats = Array.isArray(node.material) ? node.material : [node.material];
      mats.forEach((m) => {
        if ('roughness' in m) m.roughness = Math.max(.86, m.roughness || 0);
        if (m.color) m.color.offsetHSL(0, .03, -.03);
      });
    });
    scene.userData.v731BasketDone = true;
  }

  function updateBadge(scene) {
    const badge = document.getElementById('version-badge');
    if (!badge || badge.dataset.v731 === '1') return;
    const people = scene?.children?.filter?.((x) => x?.userData?.v73Person)?.length || 0;
    const crocReady = Boolean(window.assetManager?.models?.crocodile);
    const lotusReady = Boolean(window.assetManager?.models?.lotusFlower);
    const boatReady = Boolean(window.assetManager?.models?.boat);
    if (window.__mosesV73ModelsReady && window.__mosesBasketSource === 'closed-woven') {
      badge.dataset.state = 'ready';
      badge.dataset.v731 = '1';
      badge.textContent = `V7.3.1 · ${crocReady && lotusReady && boatReady ? 'MODELS OK' : 'PARTIAL'} · ${people} PEOPLE`;
    }
  }

  function frame(now) {
    const scene = window.__mosesV73Scene;
    if (scene) {
      scene.children.forEach((node) => makeFallbackWaveArm(node));
      fallbackWavers.forEach((person) => animateFallbackWave(person, now));
      improveClosedBasket(scene);
      updateBadge(scene);
    }
    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
})();
