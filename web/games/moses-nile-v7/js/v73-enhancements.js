(() => {
  'use strict';
  if (window.__mosesV73Installed || !window.THREE || !window.assetManager) return;
  window.__mosesV73Installed = true;

  const THREE = window.THREE;
  const ASSET = window.assetManager;
  const EXTRA = Object.freeze({
    crocodile: 'models/v73/crocodile.glb',
    human: 'models/v73/human.glb',
    boat: 'models/v73/Boat.glb',
    lotusFlower: 'models/v73/Flowers.glb',
  });

  const NativeScene = THREE.Scene;
  THREE.Scene = class MosesV73Scene extends NativeScene {
    constructor(...args) {
      super(...args);
      window.__mosesV73Scene = this;
    }
  };

  function tune(root, roughness = .78) {
    root?.traverse?.((node) => {
      if (!node?.isMesh) return;
      node.castShadow = true;
      node.receiveShadow = true;
      const mats = Array.isArray(node.material) ? node.material : [node.material];
      const next = mats.map((material) => {
        if (!material) return material;
        const clone = material.clone();
        if ('roughness' in clone) clone.roughness = Math.max(roughness, Number(clone.roughness ?? roughness));
        if ('metalness' in clone) clone.metalness = Math.min(.08, Number(clone.metalness ?? 0));
        clone.side = THREE.DoubleSide;
        return clone;
      });
      node.material = Array.isArray(node.material) ? next : next[0];
    });
    return root;
  }

  async function loadExtra(name, url) {
    try {
      const model = await ASSET._tryLoad(url);
      if (!model) return null;
      const tuned = tune(model, name === 'crocodile' ? .58 : .76);
      ASSET.models[name] = tuned;
      return tuned;
    } catch (error) {
      console.warn('[V7.3] model fallback:', name, error?.message || error);
      return null;
    }
  }

  const originalPreload = ASSET.preloadEnvironmentModels.bind(ASSET);
  ASSET.preloadEnvironmentModels = async function preloadV73Models() {
    await originalPreload();
    if (!this.__v73Promise) {
      this.__v73Promise = Promise.all(Object.entries(EXTRA).map(([name, url]) => loadExtra(name, url)))
        .then(() => {
          if (this.models.boat) this.models.raft = this.models.boat;
          window.__mosesV73ModelsReady = true;
          return this.models;
        });
    }
    return this.__v73Promise;
  };

  function findWovenMaterial(root) {
    let found = null;
    root?.traverse?.((node) => {
      if (found || !node?.isMesh || !node.material) return;
      const material = Array.isArray(node.material) ? node.material[0] : node.material;
      if (material) found = material.clone();
    });
    return found || new THREE.MeshStandardMaterial({ color: 0xa9622d, roughness: .92 });
  }

  function addClosedBasketLid(root) {
    if (!root || root.userData?.v73Closed) return root;
    const woven = findWovenMaterial(root);
    woven.side = THREE.DoubleSide;
    if ('roughness' in woven) woven.roughness = .92;
    if ('metalness' in woven) woven.metalness = 0;
    const lid = new THREE.Group();
    lid.name = 'ClosedWovenLid';
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(.72, .79, .12, 18), woven.clone());
    disc.position.y = .54; disc.scale.z = .80; disc.castShadow = true; lid.add(disc);
    const dome = new THREE.Mesh(new THREE.SphereGeometry(.74, 18, 8, 0, Math.PI * 2, 0, Math.PI / 2), woven.clone());
    dome.scale.set(1, .30, .80); dome.position.y = .56; dome.castShadow = true; lid.add(dome);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(.75, .045, 6, 24), new THREE.MeshStandardMaterial({ color: 0x5c321d, roughness: .88 }));
    rim.rotation.x = Math.PI / 2; rim.scale.z = .80; rim.position.y = .55; rim.castShadow = true; lid.add(rim);
    const handle = new THREE.Mesh(new THREE.TorusGeometry(.50, .045, 6, 22, Math.PI), new THREE.MeshStandardMaterial({ color: 0x77431f, roughness: .90 }));
    handle.rotation.z = Math.PI; handle.position.set(0, .67, -.02); handle.castShadow = true; lid.add(handle);
    root.add(lid); root.userData.v73Closed = true; window.__mosesBasketSource = 'closed-woven'; return root;
  }

  const originalBasket = ASSET.loadBasketModel.bind(ASSET);
  ASSET.loadBasketModel = async function loadClosedBasket() {
    return addClosedBasketLid(await originalBasket());
  };

  function cloneAsset(name, targetSize = 1) {
    const source = ASSET.models[name];
    if (!source) return null;
    const clone = THREE.SkeletonUtils?.clone ? THREE.SkeletonUtils.clone(source) : source.clone(true);
    const box = new THREE.Box3().setFromObject(clone), size = new THREE.Vector3(); box.getSize(size);
    clone.scale.multiplyScalar(targetSize / (Math.max(size.x, size.y, size.z) || 1));
    const adjusted = new THREE.Box3().setFromObject(clone); clone.position.y -= adjusted.min.y; return clone;
  }

  function upgradeCrocodile(item) {
    if (!item || item.userData?.v73Croc || !ASSET.models.crocodile) return;
    const croc = cloneAsset('crocodile', 3.2);
    if (!croc) return;
    while (item.children.length) item.remove(item.children[0]);
    croc.rotation.y = Math.PI;
    croc.position.y = -.12;
    item.add(croc);
    item.userData.v73Croc = true;
    item.userData.radius = 1.18;
  }

  function makeLotusPad() {
    const material = new THREE.MeshStandardMaterial({ color: 0x257a42, roughness: .86, side: THREE.DoubleSide });
    const shape = new THREE.Shape();
    const r = .62; shape.moveTo(.08, .03);
    for (let i = 0; i <= 24; i += 1) { const a = (i / 24) * Math.PI * 2 + .18; shape.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
    shape.lineTo(.08, .03);
    const mesh = new THREE.Mesh(new THREE.ShapeGeometry(shape, 1), material); mesh.rotation.x = -Math.PI / 2; mesh.position.y = .035; return mesh;
  }

  function upgradeLotus(item) {
    if (!item || item.userData?.v73Lotus || !ASSET.models.lotusFlower) return;
    const flower = cloneAsset('lotusFlower', .72); if (!flower) return;
    while (item.children.length) item.remove(item.children[0]);
    item.add(makeLotusPad());
    flower.position.y += .08; flower.rotation.y = Math.PI * .15;
    flower.traverse?.((node) => {
      if (!node?.isMesh) return;
      const mats = Array.isArray(node.material) ? node.material : [node.material];
      mats.forEach((m) => { if (m?.color) m.color.lerp(new THREE.Color(0xf5b6d1), .38); });
    });
    item.add(flower); item.userData.v73Lotus = true; item.userData.radius = .88;
  }

  function sandTexture() {
    const canvas = document.createElement('canvas'); canvas.width = 256; canvas.height = 512;
    const ctx = canvas.getContext('2d'); const base = ctx.createLinearGradient(0, 0, 256, 0);
    base.addColorStop(0, '#a96f36'); base.addColorStop(.22, '#c89450'); base.addColorStop(.55, '#d6aa64'); base.addColorStop(.78, '#c68d48'); base.addColorStop(1, '#95602f');
    ctx.fillStyle = base; ctx.fillRect(0, 0, 256, 512);
    for (let i = 0; i < 420; i += 1) { const x = (i * 73) % 256, y = (i * 127) % 512, a = .025 + (i % 5) * .009; ctx.fillStyle = i % 2 ? `rgba(82,47,22,${a})` : `rgba(255,226,161,${a})`; ctx.fillRect(x, y, 1 + i % 2, 1 + (i + 1) % 2); }
    for (let y = 30; y < 512; y += 54) { ctx.strokeStyle = 'rgba(111,70,33,.09)'; ctx.lineWidth = 2; ctx.beginPath(); for (let x = -10; x < 270; x += 14) { const yy = y + Math.sin(x * .045 + y) * 4; if (x < 0) ctx.moveTo(x, yy); else ctx.lineTo(x, yy); } ctx.stroke(); }
    const texture = new THREE.CanvasTexture(canvas); texture.wrapS = texture.wrapT = THREE.RepeatWrapping; texture.repeat.set(2.2, 8.5); texture.anisotropy = 2; return texture;
  }

  function buildBank(side) {
    const inner = 7.02, outer = 31, z0 = -300, z1 = 70, rows = 42;
    const positions = [], uvs = [], indices = [];
    for (let i = 0; i <= rows; i += 1) {
      const t = i / rows, z = z0 + (z1 - z0) * t;
      const wobble = Math.sin(i * 1.37) * .12 + Math.cos(i * .61) * .08;
      const innerX = side * (inner + wobble * .28), outerX = side * (outer + wobble * 2.4);
      positions.push(innerX, .045 + Math.abs(wobble) * .08, z, outerX, .44 + Math.abs(wobble) * .18, z);
      uvs.push(0, t * 9, 1, t * 9);
      if (i < rows) { const a = i * 2, b = a + 1, c = a + 2, d = a + 3; if (side < 0) indices.push(a, b, c, b, d, c); else indices.push(a, c, b, b, c, d); }
    }
    const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2)); geometry.setIndex(indices); geometry.computeVertexNormals();
    const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ map: sandTexture(), color: 0xd4a35f, roughness: .98 })); mesh.receiveShadow = true; mesh.userData.v73Bank = true; return mesh;
  }

  function addBankGraphics(scene) {
    if (scene.userData?.v73Banks) return;
    scene.add(buildBank(-1), buildBank(1));
    const wetMat = new THREE.MeshStandardMaterial({ color: 0x8c7045, roughness: .94, transparent: true, opacity: .82 });
    const greenMat = new THREE.MeshStandardMaterial({ color: 0x4f7c45, roughness: 1 });
    for (const side of [-1, 1]) {
      const wet = new THREE.Mesh(new THREE.PlaneGeometry(1.05, 600), wetMat.clone()); wet.rotation.x = -Math.PI / 2; wet.position.set(side * 7.42, .055, 0); scene.add(wet);
      const green = new THREE.Mesh(new THREE.PlaneGeometry(1.65, 600), greenMat.clone()); green.rotation.x = -Math.PI / 2; green.position.set(side * 9.15, .074, 0); scene.add(green);
    }
    scene.userData.v73Banks = true;
  }

  function addAncientClothing(group, variant = 0) {
    const linen = [0xe8d8b2, 0xf0e5c9, 0xd9c49a][variant % 3], belt = [0x81502c, 0x8d642f, 0x9f4c33][variant % 3];
    const robe = new THREE.Mesh(new THREE.CylinderGeometry(.31, .46, .82, 8), new THREE.MeshStandardMaterial({ color: linen, roughness: .95 })); robe.position.y = .86; robe.scale.z = .72; robe.castShadow = true; group.add(robe);
    const sash = new THREE.Mesh(new THREE.TorusGeometry(.31, .035, 5, 12), new THREE.MeshStandardMaterial({ color: belt, roughness: .9 })); sash.rotation.x = Math.PI / 2; sash.position.y = 1.07; sash.scale.z = .72; group.add(sash);
    if (variant % 2) { const collar = new THREE.Mesh(new THREE.TorusGeometry(.22, .035, 5, 12), new THREE.MeshStandardMaterial({ color: 0x2b7f82, roughness: .68 })); collar.rotation.x = Math.PI / 2; collar.position.y = 1.40; group.add(collar); }
  }

  function findWaveBone(root) {
    const candidates = [];
    root.traverse?.((node) => { if (node?.isBone && /(upper.?arm|right.?arm|left.?arm|shoulder)/.test(String(node.name || '').toLowerCase())) candidates.push(node); });
    return candidates.find((b) => /right/.test(b.name.toLowerCase())) || candidates[0] || null;
  }

  function createPerson(side, z, variant) {
    const source = ASSET.models.human; if (!source) return null;
    const person = new THREE.Group();
    const human = THREE.SkeletonUtils?.clone ? THREE.SkeletonUtils.clone(source) : source.clone(true);
    let box = new THREE.Box3().setFromObject(human), size = new THREE.Vector3(); box.getSize(size); human.scale.multiplyScalar(1.80 / Math.max(size.y, .001)); box = new THREE.Box3().setFromObject(human); human.position.y -= box.min.y;
    human.rotation.y = side < 0 ? Math.PI * .23 : -Math.PI * .23; person.add(human); addAncientClothing(person, variant);
    person.position.set(side * (10.6 + (variant % 3) * 1.6), .08, z); person.scale.setScalar(.95 + (variant % 2) * .08); person.userData.v73Person = true; person.userData.waveBone = findWaveBone(human);
    if (person.userData.waveBone) { person.userData.waveBase = person.userData.waveBone.rotation.clone(); person.userData.waveSide = /left/.test(person.userData.waveBone.name.toLowerCase()) ? -1 : 1; }
    person.userData.nextWave = performance.now() + 1200 + Math.random() * 4800; person.userData.waveStart = 0; return person;
  }

  const people = [];
  function mountPeople(scene) {
    if (scene.userData?.v73People || !ASSET.models.human) return;
    const positions = [-150, -112, -72, -34, -188, -92, -48, -16];
    positions.forEach((z, index) => { const side = index % 2 ? 1 : -1; const person = createPerson(side, z, index); if (person) { scene.add(person); people.push(person); } });
    scene.userData.v73People = true;
  }

  function animatePeople(now, advance) {
    for (const person of people) {
      if (advance > 0 && advance < 4) { person.position.z += advance; if (person.position.z > 28) person.position.z -= 250; }
      if (window.__mosesV734Installed) continue;
      const bone = person.userData.waveBone;
      if (!bone) { person.rotation.z = Math.sin(now * .0015 + person.position.z) * .025; continue; }
      if (!person.userData.waveStart && now >= person.userData.nextWave) person.userData.waveStart = now;
      if (person.userData.waveStart) {
        const elapsed = now - person.userData.waveStart, base = person.userData.waveBase;
        if (elapsed > 2300) { bone.rotation.copy(base); person.userData.waveStart = 0; person.userData.nextWave = now + 2500 + Math.random() * 7000; }
        else { const phase = elapsed / 2300; bone.rotation.x = base.x - 1.0 + Math.sin(phase * Math.PI) * -.24; bone.rotation.z = base.z + person.userData.waveSide * (.72 + Math.sin(phase * Math.PI * 8) * .32); }
      }
    }
  }

  let previousDistance = 0;
  function frame(now) {
    const scene = window.__mosesV73Scene;
    if (scene) {
      addBankGraphics(scene);
      if (window.__mosesV73ModelsReady) mountPeople(scene);
      scene.children.forEach((item) => { if (item?.userData?.type === 'croc') upgradeCrocodile(item); else if (item?.userData?.type === 'lotus') upgradeLotus(item); });
      const distance = Number(document.getElementById('dist-txt')?.textContent || 0), advance = Math.max(0, distance - previousDistance); previousDistance = distance;
      animatePeople(now, advance);
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();