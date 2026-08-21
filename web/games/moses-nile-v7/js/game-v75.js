(() => {
  'use strict';

  const VERSION = 'V7.5';
  const RIVER_HALF = 6.35;
  const LANES = [-3.75, 0, 3.75];
  const MAX_DPR = 1.25;
  const FAR_Z = -255;
  const NEAR_Z = 10;
  const THREE = window.THREE;

  const dom = {
    body: document.body,
    canvas: document.getElementById('game-canvas'),
    fallback: document.getElementById('fallback-canvas'),
    distance: document.getElementById('dist-txt'),
    score: document.getElementById('score-txt'),
    startScreen: document.getElementById('start-screen'),
    gameOverScreen: document.getElementById('gameover-screen'),
    start: document.getElementById('start-btn'),
    restart: document.getElementById('restart-btn'),
    left: document.getElementById('btn-left'),
    right: document.getElementById('btn-right'),
    fail: document.getElementById('fail-desc'),
    finalDistance: document.getElementById('final-dist'),
    finalScore: document.getElementById('final-score'),
    shield: document.getElementById('shield-badge'),
    magnet: document.getElementById('magnet-badge'),
    badge: document.getElementById('version-badge'),
  };

  const state = {
    playing: false,
    lane: 1,
    x: 0,
    targetX: 0,
    distance: 0,
    lotuses: 0,
    speed: 20,
    items: [],
    shield: 0,
    magnet: 0,
    lastTime: 0,
    elapsed: 0,
    ready: false,
    fallback: false,
  };

  let scene = null;
  let camera = null;
  let renderer = null;
  let water = null;
  let waterPositions = null;
  let waterBaseY = null;
  let waterNormal = null;
  let player = null;
  let basketVisual = null;
  let wake = null;
  let fallbackContext = null;
  let fallbackFrame = 0;

  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const mix = (a, b, t) => a + (b - a) * t;
  const damp = (current, target, speed, dt) => mix(current, target, 1 - Math.exp(-speed * dt));
  const hash = (value, salt = 0) => {
    const x = Math.sin(value * 91.733 + salt * 37.719) * 43758.5453;
    return x - Math.floor(x);
  };

  function riverCenter(z) {
    return Math.sin(z * .013) * .22 + Math.sin(z * .031 + .8) * .09;
  }

  function riverHalf(z) {
    return RIVER_HALF + Math.sin(z * .021 + 1.7) * .16 + Math.sin(z * .057) * .07;
  }

  function haptic(type = 'light') {
    try { window.Telegram?.WebApp?.HapticFeedback?.impactOccurred?.(type); } catch {}
  }

  function setBadge(mode) {
    dom.badge.textContent = `${VERSION} · ${mode}`;
    dom.badge.dataset.state = 'ready';
  }

  function tryCreateRenderer() {
    if (!THREE || !dom.canvas) return null;
    try {
      const attributes = { alpha: true, antialias: true, depth: true, stencil: false, powerPreference: 'low-power' };
      const context = dom.canvas.getContext('webgl2', attributes) || dom.canvas.getContext('webgl', attributes);
      if (!context) return null;
      const next = new THREE.WebGLRenderer({ canvas: dom.canvas, context, alpha: true, antialias: true, powerPreference: 'low-power' });
      next.setClearColor(0x000000, 0);
      next.setPixelRatio(Math.min(window.devicePixelRatio || 1, MAX_DPR));
      next.setSize(window.innerWidth, window.innerHeight, false);
      next.toneMapping = THREE.ACESFilmicToneMapping;
      next.toneMappingExposure = .82;
      if ('outputEncoding' in next) next.outputEncoding = THREE.sRGBEncoding;
      next.shadowMap.enabled = window.innerWidth >= 700 && (window.devicePixelRatio || 1) <= 1.5;
      next.shadowMap.type = THREE.PCFSoftShadowMap;
      dom.canvas.addEventListener('webglcontextlost', (event) => {
        event.preventDefault();
        activateFallback('LITE READY');
      }, { passive: false });
      return next;
    } catch (error) {
      console.warn('[Moses V7.5] WebGL fallback:', error?.message || error);
      return null;
    }
  }

  function makeTexture(path, repeatX, repeatY, material, kind = 'map') {
    const loader = new THREE.TextureLoader();
    loader.load(path, (texture) => {
      texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
      texture.repeat.set(repeatX, repeatY);
      texture.anisotropy = Math.min(4, renderer?.capabilities?.getMaxAnisotropy?.() || 2);
      if (kind === 'map' && 'encoding' in texture) texture.encoding = THREE.sRGBEncoding;
      material[kind] = texture;
      if (kind === 'normalMap') material.normalScale = new THREE.Vector2(.34, .34);
      material.needsUpdate = true;
      if (kind === 'normalMap') waterNormal = texture;
    }, undefined, () => {});
  }

  function buildWater() {
    const zSegments = 88;
    const xSegments = 12;
    const vertices = [];
    const uv = [];
    const indices = [];
    for (let iz = 0; iz <= zSegments; iz += 1) {
      const v = iz / zSegments;
      const z = mix(NEAR_Z + 8, FAR_Z, v);
      const center = riverCenter(z);
      const half = riverHalf(z);
      for (let ix = 0; ix <= xSegments; ix += 1) {
        const u = ix / xSegments;
        vertices.push(center + mix(-half, half, u), -.055, z);
        uv.push(u * 3.2, v * 44);
      }
    }
    const row = xSegments + 1;
    for (let z = 0; z < zSegments; z += 1) {
      for (let x = 0; x < xSegments; x += 1) {
        const a = z * row + x;
        const b = a + 1;
        const c = a + row;
        const d = c + 1;
        indices.push(a, c, b, b, c, d);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    waterPositions = geometry.attributes.position;
    waterBaseY = new Float32Array(waterPositions.count);
    for (let i = 0; i < waterPositions.count; i += 1) waterBaseY[i] = waterPositions.getY(i);

    const material = new THREE.MeshStandardMaterial({
      color: 0x46503c,
      roughness: .54,
      metalness: .045,
      transparent: true,
      opacity: .14,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    makeTexture('textures/water/water-normal.jpg', 3.2, 46, material, 'normalMap');
    water = new THREE.Mesh(geometry, material);
    water.name = 'MosesV75SiltyNile';
    water.receiveShadow = true;
    water.renderOrder = 0;
    scene.add(water);
  }

  function buildRibbon(name, side, innerOffset, outerOffset, color, texturePath, yOffset = 0) {
    const segments = 92;
    const positions = [];
    const uvs = [];
    const indices = [];
    for (let i = 0; i <= segments; i += 1) {
      const v = i / segments;
      const z = mix(NEAR_Z + 9, FAR_Z, v);
      const center = riverCenter(z);
      const half = riverHalf(z);
      const edgeNoise = (hash(i, innerOffset * 13) - .5) * .18;
      const inner = center + side * (half + innerOffset + edgeNoise);
      const outer = center + side * (half + outerOffset + edgeNoise * .55);
      const baseY = -.035 + yOffset + Math.sin(z * .047 + side) * .018;
      positions.push(inner, baseY + innerOffset * .012, z, outer, baseY + outerOffset * .012, z);
      uvs.push(0, v * 52, 1, v * 52);
      if (i < segments) {
        const a = i * 2;
        if (side < 0) indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
        else indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    const material = new THREE.MeshStandardMaterial({ color, roughness: .97, metalness: 0, side: THREE.DoubleSide });
    if (texturePath) makeTexture(texturePath, 1.15, 52, material);
    const ribbon = new THREE.Mesh(geometry, material);
    ribbon.name = name;
    ribbon.receiveShadow = true;
    ribbon.renderOrder = 1;
    scene.add(ribbon);
    return ribbon;
  }

  function buildBanks() {
    for (const side of [-1, 1]) {
      buildRibbon('V75WetMud', side, 0, .95, 0x514739, 'textures/terrain/wet_mud/color.jpg', .008);
      buildRibbon('V75DampSand', side, .93, 2.25, 0x78654d, 'textures/terrain/wet_sand/color.jpg', .022);
      buildRibbon('V75WarmSand', side, 2.20, 6.8, 0xa48258, 'textures/terrain/sand/color.jpg', .045);
      buildRibbon('V75DryEarth', side, 6.7, 14.5, 0x906d48, 'textures/terrain/cracked_mud/color.jpg', .08);
      buildRibbon('V75Gravel', side, 14.35, 31, 0x77654d, 'textures/terrain/gravel/color.jpg', .12);
    }
  }

  function makeInstanced(geometry, material, count, name) {
    const mesh = new THREE.InstancedMesh(geometry, material, count);
    mesh.name = name;
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    return mesh;
  }

  function buildBankDetail() {
    const reedCount = 150;
    const grassCount = 180;
    const rockCount = 96;
    const bushCount = 72;
    const palmCount = 24;
    const reeds = makeInstanced(
      new THREE.CylinderGeometry(.025, .04, 1.75, 5, 1),
      new THREE.MeshStandardMaterial({ color: 0x65704a, roughness: .98 }),
      reedCount,
      'V75ReedsInstanced',
    );
    const grassGeometry = new THREE.ConeGeometry(.19, .72, 5);
    grassGeometry.translate(0, .36, 0);
    const grasses = makeInstanced(grassGeometry, new THREE.MeshStandardMaterial({ color: 0x707451, roughness: 1 }), grassCount, 'V75GrassInstanced');
    const rocks = makeInstanced(new THREE.IcosahedronGeometry(.24, 1), new THREE.MeshStandardMaterial({ color: 0x766854, roughness: 1, flatShading: true }), rockCount, 'V75RocksInstanced');
    const bushes = makeInstanced(new THREE.IcosahedronGeometry(.48, 1), new THREE.MeshStandardMaterial({ color: 0x515b3b, roughness: 1, flatShading: true }), bushCount, 'V75BushesInstanced');
    const trunks = makeInstanced(new THREE.CylinderGeometry(.15, .28, 4.6, 7), new THREE.MeshStandardMaterial({ color: 0x6f4d2e, roughness: 1 }), palmCount, 'V75PalmTrunks');
    const crowns = makeInstanced(new THREE.ConeGeometry(1.55, 1.0, 8), new THREE.MeshStandardMaterial({ color: 0x354d31, roughness: .96, flatShading: true }), palmCount, 'V75PalmCrowns');
    const dummy = new THREE.Object3D();

    for (let i = 0; i < reedCount; i += 1) {
      const side = i % 2 ? -1 : 1;
      const z = 14 - hash(i, 1) * 252;
      const offset = .5 + hash(i, 2) * 2.0;
      const x = riverCenter(z) + side * (riverHalf(z) + offset);
      const scale = .65 + hash(i, 3) * .75;
      dummy.position.set(x, .02, z);
      dummy.rotation.set(0, hash(i, 4) * Math.PI * 2, (hash(i, 5) - .5) * .09);
      dummy.scale.set(scale, scale, scale);
      dummy.updateMatrix();
      reeds.setMatrixAt(i, dummy.matrix);
    }
    for (let i = 0; i < grassCount; i += 1) {
      const side = i % 2 ? -1 : 1;
      const z = 13 - hash(i, 7) * 258;
      const offset = 2.0 + hash(i, 8) * 10;
      const x = riverCenter(z) + side * (riverHalf(z) + offset);
      const scale = .55 + hash(i, 9) * .9;
      dummy.position.set(x, .06 + offset * .012, z);
      dummy.rotation.set(0, hash(i, 10) * Math.PI * 2, 0);
      dummy.scale.set(scale, scale, scale);
      dummy.updateMatrix();
      grasses.setMatrixAt(i, dummy.matrix);
    }
    for (let i = 0; i < rockCount; i += 1) {
      const side = i % 2 ? -1 : 1;
      const z = 11 - hash(i, 12) * 260;
      const offset = 2.6 + hash(i, 13) * 21;
      const x = riverCenter(z) + side * (riverHalf(z) + offset);
      const scale = .4 + hash(i, 14) * 1.45;
      dummy.position.set(x, .1 + offset * .012, z);
      dummy.rotation.set(hash(i, 15), hash(i, 16) * Math.PI * 2, hash(i, 17));
      dummy.scale.set(scale, scale * (.55 + hash(i, 18) * .28), scale);
      dummy.updateMatrix();
      rocks.setMatrixAt(i, dummy.matrix);
    }
    for (let i = 0; i < bushCount; i += 1) {
      const side = i % 2 ? -1 : 1;
      const z = 10 - hash(i, 20) * 260;
      const offset = 4.5 + hash(i, 21) * 17;
      const x = riverCenter(z) + side * (riverHalf(z) + offset);
      const scale = .6 + hash(i, 22) * 1.2;
      dummy.position.set(x, .35 + offset * .012, z);
      dummy.rotation.set(0, hash(i, 23) * Math.PI * 2, 0);
      dummy.scale.set(scale * 1.3, scale * .72, scale);
      dummy.updateMatrix();
      bushes.setMatrixAt(i, dummy.matrix);
    }
    for (let i = 0; i < palmCount; i += 1) {
      const side = i % 2 ? -1 : 1;
      const z = -12 - hash(i, 25) * 222;
      const offset = 8 + hash(i, 26) * 15;
      const x = riverCenter(z) + side * (riverHalf(z) + offset);
      const scale = .75 + hash(i, 27) * .85;
      const rotation = (hash(i, 28) - .5) * .18;
      dummy.position.set(x, 2.35 * scale + offset * .012, z);
      dummy.rotation.set(0, rotation, (hash(i, 29) - .5) * .06);
      dummy.scale.set(scale, scale, scale);
      dummy.updateMatrix();
      trunks.setMatrixAt(i, dummy.matrix);
      dummy.position.y = 4.85 * scale + offset * .012;
      dummy.rotation.set(Math.PI, rotation, 0);
      dummy.scale.set(scale, scale, scale);
      dummy.updateMatrix();
      crowns.setMatrixAt(i, dummy.matrix);
    }
    for (const mesh of [reeds, grasses, rocks, bushes, trunks, crowns]) {
      mesh.instanceMatrix.needsUpdate = true;
      scene.add(mesh);
    }
  }

  function buildPyramids() {
    const specs = [
      [-33, -191, 14, 22, 0xa88b63],
      [31, -213, 11, 17, 0x9d815f],
      [-4, -236, 7, 10.5, 0x92775a],
    ];
    for (const [x, z, radius, height, color] of specs) {
      const material = new THREE.MeshStandardMaterial({ color, roughness: 1, transparent: true, opacity: .38, depthWrite: false });
      const pyramid = new THREE.Mesh(new THREE.ConeGeometry(radius, height, 4), material);
      pyramid.position.set(x, height * .5 + .15, z);
      pyramid.rotation.y = Math.PI / 4;
      pyramid.name = 'V75DistantPyramid';
      scene.add(pyramid);
    }
  }

  function addClosedLid(root) {
    if (!root || root.getObjectByName?.('V75ClosedBasketLid')) return root;
    const material = window.assetManager?._basketMaterial?.() || new THREE.MeshStandardMaterial({ color: 0xb56f32, roughness: .94, metalness: 0 });
    const lid = new THREE.Group();
    lid.name = 'V75ClosedBasketLid';
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(.78, .82, .12, 20), material);
    disc.scale.z = .82;
    disc.position.y = .71;
    disc.castShadow = true;
    lid.add(disc);
    const dome = new THREE.Mesh(new THREE.SphereGeometry(.78, 20, 9, 0, Math.PI * 2, 0, Math.PI / 2), material.clone());
    dome.scale.set(1, .24, .82);
    dome.position.y = .73;
    dome.castShadow = true;
    lid.add(dome);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(.80, .045, 6, 28), new THREE.MeshStandardMaterial({ color: 0x674020, roughness: .98 }));
    rim.rotation.x = Math.PI / 2;
    rim.scale.z = .82;
    rim.position.y = .69;
    lid.add(rim);
    for (let i = 0; i < 9; i += 1) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(.09 + i * .068, .012, 4, 30), new THREE.MeshBasicMaterial({ color: i % 2 ? 0x8c5325 : 0xd09149, transparent: true, opacity: .78 }));
      ring.rotation.x = Math.PI / 2;
      ring.scale.z = .82;
      ring.position.y = .795;
      lid.add(ring);
    }
    root.add(lid);
    return root;
  }

  function makeWake() {
    const group = new THREE.Group();
    const streakMaterial = new THREE.MeshBasicMaterial({ color: 0xf4e9c8, transparent: true, opacity: .20, depthWrite: false, side: THREE.DoubleSide });
    for (const side of [-1, 1]) {
      const streak = new THREE.Mesh(new THREE.PlaneGeometry(.13, 5.8), streakMaterial.clone());
      streak.rotation.x = -Math.PI / 2;
      streak.position.set(side * .66, -.02, -2.75);
      streak.rotation.z = side * .055;
      group.add(streak);
    }
    for (let i = 0; i < 4; i += 1) {
      const ring = new THREE.Mesh(new THREE.RingGeometry(.44 + i * .26, .48 + i * .27, 28, 1, 0, Math.PI), new THREE.MeshBasicMaterial({ color: 0xe9dfbd, transparent: true, opacity: .16 - i * .022, depthWrite: false, side: THREE.DoubleSide }));
      ring.rotation.x = -Math.PI / 2;
      ring.rotation.z = Math.PI;
      ring.scale.x = 1.8 + i * .15;
      ring.position.set(0, -.01, -1.15 - i * .66);
      group.add(ring);
    }
    return group;
  }

  function installBasket(visual) {
    if (!player || !visual) return;
    if (basketVisual) player.remove(basketVisual);
    basketVisual = addClosedLid(visual);
    basketVisual.scale.setScalar(.62);
    basketVisual.position.y = -.30;
    basketVisual.rotation.y = Math.PI;
    basketVisual.traverse((node) => {
      if (!node.isMesh) return;
      node.castShadow = renderer?.shadowMap?.enabled || false;
      node.receiveShadow = true;
    });
    player.add(basketVisual);
  }

  function createFallbackBasket3D() {
    const group = new THREE.Group();
    const bodyMaterial = new THREE.MeshStandardMaterial({ color: 0xb66e31, roughness: .94, metalness: 0, side: THREE.DoubleSide });
    const body = new THREE.Mesh(new THREE.CylinderGeometry(.83, .61, .56, 18, 1, true), bodyMaterial);
    body.position.y = .28;
    group.add(body);
    const bottom = new THREE.Mesh(new THREE.CylinderGeometry(.61, .61, .08, 18), bodyMaterial.clone());
    bottom.position.y = .04;
    group.add(bottom);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(.82, .06, 7, 26), new THREE.MeshStandardMaterial({ color: 0x6d411f, roughness: .98 }));
    rim.rotation.x = Math.PI / 2;
    rim.scale.z = .82;
    rim.position.y = .56;
    group.add(rim);
    return group;
  }

  function buildPlayer() {
    player = new THREE.Group();
    player.name = 'V75ClosedBasketPlayer';
    player.position.set(0, .10, 0);
    wake = makeWake();
    player.add(wake);
    const contact = new THREE.Mesh(new THREE.CircleGeometry(.82, 28), new THREE.MeshBasicMaterial({ color: 0x172018, transparent: true, opacity: .18, depthWrite: false }));
    contact.scale.y = .52;
    contact.rotation.x = -Math.PI / 2;
    contact.position.y = -.105;
    player.add(contact);
    scene.add(player);
    installBasket(window.assetManager?.createProceduralBasket?.() || createFallbackBasket3D());
    window.assetManager?.loadBasketModel?.().then((model) => installBasket(model)).catch(() => {});
  }

  function createLotus() {
    const group = new THREE.Group();
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(.56, .62, .04, 18), new THREE.MeshStandardMaterial({ color: 0x486b3e, roughness: .88 }));
    group.add(pad);
    const petalMaterial = new THREE.MeshStandardMaterial({ color: 0xe6a3ad, roughness: .76, emissive: 0x4a161d, emissiveIntensity: .08 });
    for (let i = 0; i < 7; i += 1) {
      const petal = new THREE.Mesh(new THREE.SphereGeometry(.13, 8, 5), petalMaterial);
      const angle = i / 7 * Math.PI * 2;
      petal.scale.set(.75, .32, 1.35);
      petal.position.set(Math.cos(angle) * .20, .11, Math.sin(angle) * .20);
      petal.rotation.y = -angle;
      group.add(petal);
    }
    return group;
  }

  function createRock() {
    const mesh = new THREE.Mesh(new THREE.DodecahedronGeometry(.82, 0), new THREE.MeshStandardMaterial({ color: 0x655d50, roughness: 1, flatShading: true }));
    mesh.scale.set(1.1, .70, .95);
    mesh.rotation.set(.32, .65, .16);
    return mesh;
  }

  function createLog() {
    const group = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(.31, .38, 2.9, 10), new THREE.MeshStandardMaterial({ color: 0x69472c, roughness: 1 }));
    body.rotation.z = Math.PI / 2;
    body.position.y = .02;
    group.add(body);
    return group;
  }

  function createCrocodile() {
    const group = new THREE.Group();
    const hide = new THREE.MeshStandardMaterial({ color: 0x344c34, roughness: .92, flatShading: true });
    const body = new THREE.Mesh(new THREE.BoxGeometry(.82, .24, 2.35), hide);
    body.position.y = -.10;
    group.add(body);
    const snout = new THREE.Mesh(new THREE.BoxGeometry(.68, .18, .94), hide);
    snout.position.set(0, -.12, 1.45);
    group.add(snout);
    const tail = new THREE.Mesh(new THREE.ConeGeometry(.23, 1.55, 6), hide);
    tail.rotation.x = -Math.PI / 2;
    tail.position.z = -1.72;
    group.add(tail);
    return group;
  }

  function createPowerup(type) {
    const color = type === 'shield' ? 0x86b7b1 : 0xe5be64;
    const mesh = new THREE.Mesh(new THREE.OctahedronGeometry(.48), new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: .28, roughness: .52 }));
    mesh.position.y = .34;
    return mesh;
  }

  function meshForType(type) {
    if (!scene) return null;
    if (type === 'lotus') return createLotus();
    if (type === 'rock') return createRock();
    if (type === 'log') return createLog();
    if (type === 'croc') return createCrocodile();
    return createPowerup(type);
  }

  function addItem(type, laneIndex, z) {
    const mesh = meshForType(type);
    const item = { type, lane: laneIndex, x: LANES[laneIndex], z, radius: type === 'croc' ? 1.28 : type === 'lotus' ? .82 : 1.0, mesh, phase: hash(z, laneIndex) * Math.PI * 2 };
    if (mesh) {
      mesh.position.set(item.x, type === 'lotus' ? -.02 : .02, z);
      mesh.userData.type = type;
      mesh.traverse((node) => { if (node.isMesh) { node.castShadow = false; node.receiveShadow = true; } });
      scene.add(mesh);
    }
    state.items.push(item);
    return item;
  }

  function spawnRow(z, rowIndex = 0) {
    const order = [0, 1, 2].sort((a, b) => hash(z + a, rowIndex + 2) - hash(z + b, rowIndex + 2));
    const obstacleCount = hash(z, 11) > .69 ? 2 : 1;
    const types = ['rock', 'log', 'croc'];
    for (let i = 0; i < obstacleCount; i += 1) {
      addItem(types[Math.floor(hash(z, i + 24) * types.length)], order[i], z - i * 1.2);
    }
    const freeLane = order[obstacleCount];
    const chance = hash(z, 33);
    addItem(chance > .92 ? 'shield' : chance > .84 ? 'magnet' : 'lotus', freeLane, z - 2.1);
  }

  function clearItems() {
    for (const item of state.items) if (item.mesh?.parent) item.mesh.parent.remove(item.mesh);
    state.items.length = 0;
  }

  function resetGame() {
    clearItems();
    state.lane = 1;
    state.x = 0;
    state.targetX = 0;
    state.distance = 0;
    state.lotuses = 0;
    state.speed = 20;
    state.shield = 0;
    state.magnet = 0;
    dom.distance.textContent = '0';
    dom.score.textContent = '0';
    dom.shield.style.display = 'none';
    dom.magnet.style.display = 'none';
    for (let z = -27, row = 0; z >= -215; z -= 24, row += 1) spawnRow(z, row);
    if (player) player.position.set(0, .10, 0);
  }

  function startGame() {
    window.gameAudio?.init?.();
    dom.startScreen.classList.add('hidden');
    dom.gameOverScreen.classList.add('hidden');
    dom.body.classList.add('is-playing');
    resetGame();
    state.playing = true;
    haptic('medium');
  }

  function endGame(message) {
    state.playing = false;
    dom.body.classList.remove('is-playing');
    dom.fail.textContent = message;
    dom.finalDistance.textContent = `${Math.floor(state.distance)} м`;
    dom.finalScore.textContent = String(state.lotuses);
    dom.gameOverScreen.classList.remove('hidden');
    window.gameAudio?.playHit?.();
    haptic('heavy');
  }

  function steer(direction) {
    if (!state.playing) return;
    state.lane = clamp(state.lane + direction, 0, LANES.length - 1);
    state.targetX = LANES[state.lane];
    window.gameAudio?.playSplash?.();
    haptic('light');
  }

  function collect(item) {
    if (item.type === 'lotus') {
      state.lotuses += 1;
      dom.score.textContent = String(state.lotuses);
      window.gameAudio?.playCollect?.();
      haptic('light');
      return true;
    }
    if (item.type === 'shield') {
      state.shield = 8;
      dom.shield.style.display = 'block';
      window.gameAudio?.playPowerup?.();
      haptic('medium');
      return true;
    }
    if (item.type === 'magnet') {
      state.magnet = 10;
      dom.magnet.style.display = 'block';
      window.gameAudio?.playPowerup?.();
      haptic('medium');
      return true;
    }
    if (state.shield > 0) {
      state.shield = 0;
      dom.shield.style.display = 'none';
      window.gameAudio?.playHit?.();
      haptic('heavy');
      return true;
    }
    const messages = {
      rock: 'Корзинка столкнулась с камнем у берега.',
      log: 'Течение вынесло корзинку прямо на бревно.',
      croc: 'Крокодил преградил путь по реке.',
    };
    endGame(messages[item.type] || 'Путь по Нилу прерван.');
    return false;
  }

  function removeItem(index) {
    const [item] = state.items.splice(index, 1);
    if (item?.mesh?.parent) item.mesh.parent.remove(item.mesh);
  }

  function updateGameplay(dt) {
    state.x = damp(state.x, state.targetX, 10, dt);
    if (!state.playing) return;
    state.distance += state.speed * dt;
    state.speed = Math.min(31, state.speed + dt * .12);
    state.shield = Math.max(0, state.shield - dt);
    state.magnet = Math.max(0, state.magnet - dt);
    if (state.shield === 0) dom.shield.style.display = 'none';
    if (state.magnet === 0) dom.magnet.style.display = 'none';
    dom.distance.textContent = String(Math.floor(state.distance));

    let farthest = 0;
    for (let i = state.items.length - 1; i >= 0; i -= 1) {
      const item = state.items[i];
      item.z += state.speed * dt;
      farthest = Math.min(farthest, item.z);
      if (state.magnet > 0 && item.type === 'lotus' && item.z > -18) item.x = damp(item.x, state.x, 5.5, dt);
      if (item.mesh) {
        item.mesh.position.x = item.x;
        item.mesh.position.z = item.z;
        if (item.type === 'lotus' || item.type === 'shield' || item.type === 'magnet') {
          item.mesh.rotation.y += dt * 1.3;
          item.mesh.position.y = .02 + Math.sin(state.elapsed * 2.4 + item.phase) * .035;
        } else if (item.type === 'croc') {
          item.mesh.position.y = -.10 + Math.sin(state.elapsed * 2.8 + item.phase) * .035;
          item.mesh.rotation.z = Math.sin(state.elapsed * 1.7 + item.phase) * .018;
        } else if (item.type === 'log') {
          item.mesh.position.y = -.04 + Math.sin(state.elapsed * 2.1 + item.phase) * .025;
          item.mesh.rotation.y = Math.sin(state.elapsed * .7 + item.phase) * .10;
        }
      }
      if (item.z > -1.15 && item.z < 1.5 && Math.abs(item.x - state.x) < item.radius + .50) {
        const shouldRemove = collect(item);
        if (!state.playing) return;
        if (shouldRemove) { removeItem(i); continue; }
      }
      if (item.z > 9) removeItem(i);
    }
    if (farthest > -190) spawnRow(farthest - 24, Math.floor(state.distance / 24));
  }

  function update3D(dt) {
    if (!scene || !player) return;
    const t = state.elapsed;
    player.position.x = state.x;
    player.position.y = .085 + Math.sin(t * 2.25) * .025;
    player.rotation.z = Math.sin(t * 1.55) * .012 - (state.targetX - state.x) * .012;
    player.rotation.x = Math.sin(t * 1.15) * .006;
    if (wake) {
      wake.children.forEach((child, index) => {
        if (!child.material) return;
        child.material.opacity = (.13 + Math.sin(t * 2.3 + index) * .025) * (state.playing ? 1 : .55);
      });
    }
    camera.position.x = damp(camera.position.x, state.x * .105, 3.4, dt);
    camera.position.y = damp(camera.position.y, 4.18, 5, dt);
    camera.position.z = damp(camera.position.z, 7.45, 5, dt);
    camera.lookAt(state.x * .14, .36, -13.8);
    if (waterPositions && waterBaseY) {
      for (let i = 0; i < waterPositions.count; i += 1) {
        const x = waterPositions.getX(i);
        const z = waterPositions.getZ(i);
        const y = waterBaseY[i] + Math.sin(z * .16 + t * 1.12 + x * .52) * .026 + Math.sin(z * .047 - t * .72 - x * .31) * .013;
        waterPositions.setY(i, y);
      }
      waterPositions.needsUpdate = true;
    }
    if (waterNormal) {
      waterNormal.offset.x = (waterNormal.offset.x + dt * .0022) % 1;
      waterNormal.offset.y = (waterNormal.offset.y - dt * .008) % 1;
    }
  }

  function resizeFallback() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    dom.fallback.width = Math.max(1, Math.floor(window.innerWidth * dpr));
    dom.fallback.height = Math.max(1, Math.floor(window.innerHeight * dpr));
    dom.fallback.style.width = `${window.innerWidth}px`;
    dom.fallback.style.height = `${window.innerHeight}px`;
    fallbackContext = dom.fallback.getContext('2d');
    fallbackContext?.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function projectFallback(item) {
    const h = window.innerHeight;
    const w = window.innerWidth;
    const progress = clamp((item.z - FAR_Z) / (NEAR_Z - FAR_Z), 0, 1);
    const eased = progress * progress;
    const spread = mix(w * .035, w * .34, eased);
    return {
      x: w * .5 + (item.x / LANES[2]) * spread,
      y: mix(h * .285, h * .735, eased),
      size: mix(3, Math.min(w, h) * .105, eased),
      alpha: clamp((progress - .05) * 2.2, 0, 1),
    };
  }

  function drawFallbackItem(ctx, item) {
    const p = projectFallback(item);
    if (p.alpha <= .01) return;
    ctx.save();
    ctx.globalAlpha = p.alpha;
    ctx.translate(p.x, p.y);
    if (item.type === 'lotus') {
      ctx.fillStyle = '#47683d';
      ctx.beginPath(); ctx.ellipse(0, 0, p.size * .40, p.size * .18, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#e4a0ad';
      for (let i = 0; i < 7; i += 1) { const a = i / 7 * Math.PI * 2; ctx.beginPath(); ctx.ellipse(Math.cos(a) * p.size * .12, -p.size * .07 + Math.sin(a) * p.size * .04, p.size * .09, p.size * .035, a, 0, Math.PI * 2); ctx.fill(); }
    } else if (item.type === 'rock') {
      ctx.fillStyle = '#5f574b';
      ctx.beginPath(); ctx.ellipse(0, 0, p.size * .40, p.size * .26, -.12, 0, Math.PI * 2); ctx.fill();
    } else if (item.type === 'log') {
      ctx.strokeStyle = '#644329'; ctx.lineWidth = Math.max(2, p.size * .18); ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(-p.size * .48, 0); ctx.lineTo(p.size * .48, 0); ctx.stroke();
    } else if (item.type === 'croc') {
      ctx.fillStyle = '#314832';
      ctx.beginPath(); ctx.ellipse(0, 0, p.size * .48, p.size * .14, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-p.size * .72, p.size * .08); ctx.lineTo(-p.size * .42, -p.size * .05); ctx.fill();
    } else {
      ctx.fillStyle = item.type === 'shield' ? '#9bc4bc' : '#e7c16c';
      ctx.beginPath(); ctx.moveTo(0, -p.size * .35); ctx.lineTo(p.size * .28, 0); ctx.lineTo(0, p.size * .35); ctx.lineTo(-p.size * .28, 0); ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  }

  function drawFallbackBasket(ctx) {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const laneWidth = Math.min(w * .24, 104);
    const x = w * .5 + (state.x / LANES[2]) * laneWidth;
    const y = h * .735 + Math.sin(state.elapsed * 2.2) * 2;
    const size = clamp(w * .20, 64, 104);
    ctx.save();
    ctx.translate(x, y);
    ctx.strokeStyle = 'rgba(244,235,203,.34)';
    ctx.lineWidth = Math.max(1.6, size * .019);
    ctx.lineCap = 'round';
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(side * size * .32, size * .17);
      ctx.bezierCurveTo(side * size * .43, size * .34, side * size * .57, size * .50, side * size * .66, size * .76);
      ctx.stroke();
    }
    const shadow = ctx.createRadialGradient(0, size * .31, 0, 0, size * .31, size * .68);
    shadow.addColorStop(0, 'rgba(15,19,13,.32)'); shadow.addColorStop(1, 'rgba(15,19,13,0)');
    ctx.fillStyle = shadow; ctx.beginPath(); ctx.ellipse(0, size * .31, size * .62, size * .24, 0, 0, Math.PI * 2); ctx.fill();

    const body = ctx.createLinearGradient(-size * .48, -size * .04, size * .45, size * .50);
    body.addColorStop(0, '#d69a50'); body.addColorStop(.37, '#915021'); body.addColorStop(.68, '#b86b2f'); body.addColorStop(1, '#e1a45b');
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.moveTo(-size * .47, -size * .04);
    ctx.bezierCurveTo(-size * .44, size * .28, -size * .34, size * .48, 0, size * .51);
    ctx.bezierCurveTo(size * .34, size * .48, size * .44, size * .28, size * .47, -size * .04);
    ctx.closePath();
    ctx.fill();

    ctx.save();
    ctx.clip();
    ctx.strokeStyle = 'rgba(68,35,16,.57)';
    ctx.lineWidth = Math.max(1, size * .014);
    for (let row = 0; row < 8; row += 1) {
      const yy = size * (.03 + row * .055);
      ctx.beginPath(); ctx.moveTo(-size * .50, yy); ctx.quadraticCurveTo(0, yy + size * .035, size * .50, yy); ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(246,188,103,.48)';
    for (let col = -5; col <= 5; col += 1) {
      ctx.beginPath(); ctx.moveTo(col * size * .085 - size * .14, -size * .08); ctx.lineTo(col * size * .07 + size * .12, size * .51); ctx.stroke();
    }
    ctx.restore();

    ctx.strokeStyle = '#5e351b';
    ctx.lineWidth = Math.max(2.5, size * .052);
    ctx.beginPath(); ctx.ellipse(0, -size * .03, size * .49, size * .285, 0, 0, Math.PI * 2); ctx.stroke();

    const lid = ctx.createRadialGradient(-size * .14, -size * .15, size * .04, 0, -size * .07, size * .48);
    lid.addColorStop(0, '#f0bd72'); lid.addColorStop(.52, '#bd7337'); lid.addColorStop(1, '#754019');
    ctx.fillStyle = lid;
    ctx.beginPath(); ctx.ellipse(0, -size * .07, size * .43, size * .235, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(83,43,18,.82)';
    ctx.lineWidth = Math.max(1.2, size * .018);
    for (let i = 1; i < 8; i += 1) {
      ctx.beginPath(); ctx.ellipse(0, -size * .07, size * (.04 + i * .052), size * (.021 + i * .027), 0, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(255,215,144,.48)';
    for (let i = -4; i <= 4; i += 1) {
      ctx.beginPath(); ctx.moveTo(i * size * .075 - size * .12, -size * .27); ctx.lineTo(i * size * .075 + size * .12, size * .10); ctx.stroke();
    }
    ctx.strokeStyle = '#6a3b1c';
    ctx.lineWidth = Math.max(2.4, size * .045);
    ctx.beginPath(); ctx.ellipse(0, -size * .07, size * .44, size * .245, 0, 0, Math.PI * 2); ctx.stroke();

    ctx.strokeStyle = 'rgba(250,242,213,.40)';
    ctx.lineWidth = Math.max(1.2, size * .014);
    for (let i = 0; i < 5; i += 1) {
      const sprayX = (i - 2) * size * .20;
      ctx.beginPath(); ctx.arc(sprayX, size * (.18 + Math.abs(i - 2) * .035), size * (.22 + i * .018), Math.PI * 1.10, Math.PI * 1.80); ctx.stroke();
    }
    ctx.restore();
  }

  function renderFallback() {
    const ctx = fallbackContext;
    if (!ctx) return;
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    for (const item of state.items.slice().sort((a, b) => a.z - b.z)) drawFallbackItem(ctx, item);
    drawFallbackBasket(ctx);
  }

  function activateFallback(label = 'LITE READY') {
    if (state.fallback && state.ready) return;
    state.fallback = true;
    dom.body.classList.add('fallback-mode');
    renderer?.setAnimationLoop?.(null);
    resizeFallback();
    setBadge(label);
    dom.body.classList.remove('is-loading');
    state.ready = true;
    window.__mosesV75Ready = true;
    window.__mosesV75Mode = 'fallback';
    window.__mosesV75ReferenceRebuild = true;
    if (!fallbackFrame) fallbackFrame = requestAnimationFrame(frame);
  }

  function buildScene() {
    scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0xbba782, 52, 245);
    camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, .1, 360);
    camera.position.set(0, 4.18, 7.45);
    scene.add(new THREE.HemisphereLight(0xffe8bd, 0x4f4838, .82));
    const sun = new THREE.DirectionalLight(0xffd39b, .88);
    sun.position.set(-22, 35, 18);
    sun.castShadow = renderer.shadowMap.enabled;
    sun.shadow.mapSize.set(512, 512);
    sun.shadow.camera.left = -18;
    sun.shadow.camera.right = 18;
    sun.shadow.camera.top = 18;
    sun.shadow.camera.bottom = -8;
    sun.shadow.camera.far = 75;
    scene.add(sun);
    const riverFill = new THREE.DirectionalLight(0x93afa0, .18);
    riverFill.position.set(9, 8, -15);
    scene.add(riverFill);
    buildWater();
    buildPlayer();
    renderer.render(scene, camera);
  }

  function resize() {
    if (renderer && camera) {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, MAX_DPR));
      renderer.setSize(window.innerWidth, window.innerHeight, false);
    }
    if (state.fallback) resizeFallback();
  }

  function frame(now) {
    const seconds = now * .001;
    const dt = state.lastTime ? Math.min(.05, Math.max(.001, seconds - state.lastTime)) : .016;
    state.lastTime = seconds;
    state.elapsed += dt;
    updateGameplay(dt);
    if (state.fallback) {
      renderFallback();
      window.__mosesV75Diagnostics = {
        mode: 'fallback',
        oneRenderLoop: true,
        x: state.x,
        targetX: state.targetX,
        lane: state.lane,
        items: state.items.length,
        cinematicBackgroundVisible: true,
      };
      fallbackFrame = requestAnimationFrame(frame);
      return;
    }
    update3D(dt);
    renderer.render(scene, camera);
    window.__mosesV75Diagnostics = {
      mode: 'webgl',
      oneRenderLoop: true,
      drawCalls: renderer.info.render.calls,
      triangles: renderer.info.render.triangles,
      items: state.items.length,
      pixelRatio: renderer.getPixelRatio(),
      cinematicBackgroundVisible: true,
    };
  }

  function bindControls() {
    dom.left.addEventListener('click', () => steer(-1));
    dom.right.addEventListener('click', () => steer(1));
    dom.start.addEventListener('click', startGame);
    dom.restart.addEventListener('click', startGame);
    window.addEventListener('keydown', (event) => {
      if (event.code === 'ArrowLeft' || event.code === 'KeyA') steer(-1);
      if (event.code === 'ArrowRight' || event.code === 'KeyD') steer(1);
    });
    let touchX = 0;
    let touchY = 0;
    window.addEventListener('touchstart', (event) => {
      touchX = event.touches[0]?.clientX || 0;
      touchY = event.touches[0]?.clientY || 0;
    }, { passive: true });
    window.addEventListener('touchend', (event) => {
      const point = event.changedTouches[0];
      if (!point) return;
      const dx = point.clientX - touchX;
      const dy = point.clientY - touchY;
      if (Math.abs(dx) > 36 && Math.abs(dx) > Math.abs(dy) * 1.2) steer(dx < 0 ? -1 : 1);
    }, { passive: true });
    window.addEventListener('resize', resize, { passive: true });
  }

  function boot() {
    bindControls();
    renderer = tryCreateRenderer();
    if (!renderer) {
      activateFallback('LITE READY');
      return;
    }
    try {
      buildScene();
      resize();
      state.ready = true;
      dom.body.classList.remove('is-loading');
      setBadge('CINEMATIC READY');
      window.__mosesV75Ready = true;
      window.__mosesV75Mode = 'webgl';
      window.__mosesV75ReferenceRebuild = true;
      renderer.setAnimationLoop(frame);
    } catch (error) {
      console.error('[Moses V7.5] Scene fallback:', error);
      activateFallback('LITE READY');
    }
  }

  boot();
})();
