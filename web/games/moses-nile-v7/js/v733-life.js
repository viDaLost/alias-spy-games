(() => {
  'use strict';
  if (window.__mosesV733Installed || !window.THREE) return;
  window.__mosesV733Installed = true;

  const THREE = window.THREE;
  const ASSET = window.assetManager;
  const TARGET_PEOPLE = 14;
  const crocs = new Set();
  const people = new Set();
  const BEHAVIORS = ['wave', 'point', 'walk', 'cheer', 'carry', 'bow', 'wave'];
  let extrasMounted = false;
  let previousDistance = 0;

  const OUTFITS = [
    { linen: 0xead9b5, accent: 0x8a552d, head: 0xd8bd88 },
    { linen: 0xf1e6c9, accent: 0x2f7f83, head: 0xc99768 },
    { linen: 0xd8c092, accent: 0x9a4e35, head: 0x6f4529 },
    { linen: 0xf0d9ad, accent: 0x7a6731, head: 0xe1c28f },
    { linen: 0xdcc9a6, accent: 0x356f72, head: 0x5b3b29 },
    { linen: 0xeee1c4, accent: 0xa35f32, head: 0xb77d58 },
  ];

  function sharedMat(color, roughness = .92) {
    return new THREE.MeshStandardMaterial({ color, roughness, metalness: 0 });
  }

  function groundAndScale(root, height = 1.78) {
    let box = new THREE.Box3().setFromObject(root);
    const size = new THREE.Vector3();
    box.getSize(size);
    root.scale.multiplyScalar(height / Math.max(size.y, .001));
    box = new THREE.Box3().setFromObject(root);
    root.position.y -= box.min.y;
  }

  function cloneHuman(height, variant) {
    const source = ASSET?.models?.human;
    if (!source) return null;
    const human = THREE.SkeletonUtils?.clone ? THREE.SkeletonUtils.clone(source) : source.clone(true);
    groundAndScale(human, height);
    const tint = [0xf3dec5, 0xd7a77b, 0xb97d55, 0x8f5f43, 0xe7c29b, 0xc98c66][variant % 6];
    human.traverse?.((node) => {
      if (!node?.isMesh || !node.material) return;
      const mats = Array.isArray(node.material) ? node.material : [node.material];
      const next = mats.map((material) => {
        if (!material) return material;
        const clone = material.clone();
        if (clone.color) clone.color.lerp(new THREE.Color(tint), .12);
        if ('roughness' in clone) clone.roughness = Math.max(.78, clone.roughness || 0);
        return clone;
      });
      node.material = Array.isArray(node.material) ? next : next[0];
      node.castShadow = true;
    });
    return human;
  }

  function addHeadwear(person, variant) {
    const p = OUTFITS[variant % OUTFITS.length];
    const style = variant % 4;
    if (style === 0) {
      const cap = new THREE.Mesh(new THREE.SphereGeometry(.235, 9, 6, 0, Math.PI * 2, 0, Math.PI * .52), sharedMat(p.head, .95));
      cap.position.set(0, 1.62, 0); cap.scale.z = .92; person.add(cap);
    } else if (style === 1) {
      const band = new THREE.Mesh(new THREE.TorusGeometry(.22, .035, 5, 12), sharedMat(p.accent, .88));
      band.rotation.x = Math.PI / 2; band.position.set(0, 1.58, 0); person.add(band);
      const cloth = new THREE.Mesh(new THREE.BoxGeometry(.32, .42, .08), sharedMat(p.head, .95));
      cloth.position.set(0, 1.43, -.18); person.add(cloth);
    } else if (style === 2) {
      const wrap = new THREE.Mesh(new THREE.CylinderGeometry(.22, .245, .16, 9), sharedMat(p.head, .96));
      wrap.position.set(0, 1.64, 0); person.add(wrap);
    }
  }

  function addProp(person, variant) {
    const p = OUTFITS[variant % OUTFITS.length];
    const inward = person.position.x < 0 ? 1 : -1;
    const style = variant % 5;
    if (style === 0) {
      const jug = new THREE.Group();
      const body = new THREE.Mesh(new THREE.SphereGeometry(.17, 8, 6), sharedMat(0xb47742, .96));
      body.scale.y = 1.25; jug.add(body);
      const neck = new THREE.Mesh(new THREE.CylinderGeometry(.06, .09, .18, 7), sharedMat(0xb47742, .96));
      neck.position.y = .19; jug.add(neck);
      jug.position.set(inward * -.34, .62, .02); person.add(jug);
    } else if (style === 1) {
      const staff = new THREE.Mesh(new THREE.CylinderGeometry(.025, .035, 1.48, 6), sharedMat(0x654126, 1));
      staff.position.set(inward * -.42, .72, .02); staff.rotation.z = inward * .05; person.add(staff);
    } else if (style === 2) {
      const reeds = new THREE.Group();
      for (let i = 0; i < 5; i += 1) {
        const reed = new THREE.Mesh(new THREE.CylinderGeometry(.012, .016, .72 + i * .04, 5), sharedMat(0x6f8538, 1));
        reed.position.x = (i - 2) * .035; reeds.add(reed);
      }
      reeds.position.set(inward * -.38, .72, .05); reeds.rotation.z = inward * .12; person.add(reeds);
    } else if (style === 3) {
      const basket = new THREE.Group();
      const bowl = new THREE.Mesh(new THREE.CylinderGeometry(.18, .14, .18, 9), sharedMat(0x9d6a3b, .98)); basket.add(bowl);
      const rim = new THREE.Mesh(new THREE.TorusGeometry(.18, .025, 5, 12), sharedMat(0x694326, .95));
      rim.rotation.x = Math.PI / 2; rim.position.y = .09; basket.add(rim);
      basket.position.set(inward * -.36, .66, .04); person.add(basket);
    } else {
      const sash = new THREE.Mesh(new THREE.BoxGeometry(.55, .08, .09), sharedMat(p.accent, .88));
      sash.position.set(0, 1.08, .19); sash.rotation.z = inward * .18; person.add(sash);
    }
  }

  function addOutfit(person, variant) {
    const p = OUTFITS[variant % OUTFITS.length];
    const longRobe = variant % 3 !== 1;
    const robe = new THREE.Mesh(new THREE.CylinderGeometry(.30, longRobe ? .46 : .41, longRobe ? .92 : .68, 8), sharedMat(p.linen, .96));
    robe.position.y = longRobe ? .72 : .84; robe.scale.z = .72; robe.castShadow = true; person.add(robe);
    const belt = new THREE.Mesh(new THREE.TorusGeometry(.30, .032, 5, 12), sharedMat(p.accent, .9));
    belt.rotation.x = Math.PI / 2; belt.position.y = 1.05; belt.scale.z = .72; person.add(belt);
    if (variant % 2 === 0) {
      const collar = new THREE.Mesh(new THREE.TorusGeometry(.205, .028, 5, 12), sharedMat(p.accent, .82));
      collar.rotation.x = Math.PI / 2; collar.position.y = 1.37; person.add(collar);
    }
    addHeadwear(person, variant);
    addProp(person, variant);
  }

  function findArmBone(root) {
    const candidates = [];
    root.traverse?.((node) => {
      if (!node?.isBone) return;
      const name = String(node.name || '').toLowerCase();
      if (/(upper.?arm|right.?arm|left.?arm|shoulder)/.test(name)) candidates.push(node);
    });
    return candidates.find((b) => /right/.test(String(b.name).toLowerCase())) || candidates[0] || null;
  }

  function createExtraPerson(side, z, variant) {
    const person = new THREE.Group();
    const human = cloneHuman(1.68 + (variant % 4) * .08, variant);
    if (!human) return null;
    human.rotation.y = side < 0 ? Math.PI * .20 : -Math.PI * .20;
    person.add(human);
    person.position.set(side * (8.75 + (variant % 3) * .72), .08, z);
    person.scale.setScalar(.94 + (variant % 3) * .045);
    person.userData.v73Person = true;
    person.userData.v733Extra = true;
    person.userData.v733Variant = variant;
    person.userData.waveBone = findArmBone(human);
    if (person.userData.waveBone) {
      person.userData.waveBase = person.userData.waveBone.rotation.clone();
      person.userData.waveSide = /left/.test(String(person.userData.waveBone.name).toLowerCase()) ? -1 : 1;
    }
    addOutfit(person, variant);
    return person;
  }

  function decorateExistingPerson(person, index) {
    if (person.userData.v733Decorated) return;
    person.userData.v733Decorated = true;
    person.userData.v733Variant = index;
    person.userData.v733Behavior = BEHAVIORS[index % BEHAVIORS.length];
    person.userData.v733Phase = index * .83 + Math.random() * .5;
    person.userData.v733HomeX = person.position.x;
    person.userData.v733HomeY = person.position.y;
    person.userData.v733BaseRotationY = person.rotation.y;
    if (index % 2 === 0) addHeadwear(person, index + 1);
    if (index % 3 === 0) addProp(person, index + 2);
  }

  function mountExtraPeople(scene) {
    if (extrasMounted || !ASSET?.models?.human) return;
    const existing = scene.children.filter((node) => node?.userData?.v73Person);
    if (existing.length < 8) return;
    existing.forEach((person, index) => decorateExistingPerson(person, index));
    const extraPositions = [-224, -176, -132, -86, -44, -8];
    extraPositions.forEach((z, index) => {
      const side = index % 2 === 0 ? -1 : 1;
      const person = createExtraPerson(side, z, index + existing.length);
      if (!person) return;
      person.userData.v733Behavior = BEHAVIORS[(index + 2) % BEHAVIORS.length];
      person.userData.v733Phase = (index + existing.length) * .79;
      person.userData.v733HomeX = person.position.x;
      person.userData.v733HomeY = person.position.y;
      person.userData.v733BaseRotationY = person.rotation.y;
      scene.add(person);
    });
    scene.children.filter((node) => node?.userData?.v73Person).forEach((person, index) => {
      decorateExistingPerson(person, index);
      people.add(person);
    });
    extrasMounted = true;
  }

  function enhanceCroc(item) {
    if (!item?.userData?.v73Croc) return;
    if (!item.userData.v733CrocScale) {
      const model = item.children.find((child) => child && !child.userData?.v733Wake) || item.children[0];
      if (model) {
        model.scale.multiplyScalar(1.48);
        model.position.y = -.18;
        item.userData.v733Model = model;
      }
      item.userData.radius = 1.42;
      item.userData.v733BaseX = item.position.x;
      item.userData.v733Phase = Math.random() * Math.PI * 2 + Math.abs(item.position.z) * .07;
      item.userData.v733CrocScale = 1.48;
      const wake = new THREE.Group();
      wake.userData.v733Wake = true;
      const mat = new THREE.MeshBasicMaterial({ color: 0xcdf4ff, transparent: true, opacity: .22, depthWrite: false });
      for (const side of [-1, 1]) {
        const streak = new THREE.Mesh(new THREE.PlaneGeometry(.62, .055), mat.clone());
        streak.rotation.x = -Math.PI / 2; streak.position.set(side * .34, .035, -1.22); wake.add(streak);
      }
      item.add(wake); item.userData.v733Wake = wake;
    }
    crocs.add(item);
  }

  function updateBadge(scene) {
    const badge = document.getElementById('version-badge');
    if (!badge || !extrasMounted || window.__mosesV734Installed) return;
    const count = scene.children.filter((node) => node?.userData?.v73Person).length;
    if (window.__mosesV73ModelsReady && window.__mosesBasketSource === 'closed-woven') {
      badge.dataset.state = 'ready'; badge.dataset.v733 = '1';
      badge.textContent = `V7.3.3 · CROCS LIVE · ${count} PEOPLE`;
    }
  }

  function frame() {
    const scene = window.__mosesV73Scene;
    if (scene) {
      mountExtraPeople(scene);
      scene.children.forEach((node, index) => {
        if (node?.userData?.v73Croc) enhanceCroc(node);
        if (node?.userData?.v73Person) { decorateExistingPerson(node, index); people.add(node); }
      });

      const distance = Number(document.getElementById('dist-txt')?.textContent || 0);
      const advance = Math.max(0, distance - previousDistance);
      previousDistance = distance;
      if (advance > 0 && advance < 4 && !window.__mosesV734Installed) {
        people.forEach((person) => {
          if (!person.userData.v733Extra) return;
          person.position.z += advance;
          if (person.position.z > 30) person.position.z -= 260;
        });
      }
      updateBadge(scene);
    }
    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
})();