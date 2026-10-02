import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import http from 'node:http';
import { createRequire } from 'node:module';

const root = path.resolve(import.meta.dirname, '..');
const gameRoot = path.join(root, 'web/games/moses-nile-v7');
const require = createRequire(import.meta.url);
const THREE = require(path.join(gameRoot, 'vendor/three-r128.min.js'));
const scope = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(gameRoot, 'js/landscape.js'), 'utf8'), scope);
const landscape = scope.window.NileLandscape;

// На стыке конвейерных тайлов земля и растения должны совпадать без скачка.
for (let z = -500; z <= 500; z += .37) {
  for (const side of [-1, 1]) {
    const edge = landscape.shoreOffset(z, side);
    assert.ok(edge > .17 && edge < 1.93, 'Берег не должен заходить на игровые дорожки');
    assert.ok(Math.abs(edge - landscape.shoreOffset(z + landscape.TILE, side)) < 1e-10, 'Разрыв берегового тайла');
    const x = side * (landscape.HALF + edge);
    assert.ok(Math.abs(landscape.bedHeight(x, z) + .10) < 1e-10, 'Мелководье не совпало с кромкой');
    assert.ok(landscape.bedHeight(0, z) < -1.3, 'Центр русла должен быть глубже берега');
  }
}
for (const [key, size, budget] of [['palm', 11.5, 2000], ['grass', 1.15, 110], ['bush', 1.6, 310], ['bankPlant', 1.7, 160], ['broadleaf', 1.45, 160]]) {
  const silhouettes = [];
  for (let variant = 0; variant < 3; variant++) {
    const parts = landscape.foliageParts(THREE, key, variant, size);
    let triangles = 0;
    const box = new THREE.Box3();
    for (const part of parts) {
      const geometry = part.geometry;
      assert.ok([...geometry.attributes.position.array].every(Number.isFinite), `${key}: некорректные вершины`);
      assert.ok([...geometry.attributes.normal.array].every(Number.isFinite), `${key}: некорректные нормали`);
      triangles += (geometry.index?.count || geometry.attributes.position.count) / 3;
      geometry.computeBoundingBox(); box.union(geometry.boundingBox);
    }
    assert.ok(triangles <= budget, `${key}: превышен бюджет геометрии (${triangles})`);
    const dimensions = box.getSize(new THREE.Vector3());
    assert.ok(Math.abs(Math.max(dimensions.x, dimensions.y, dimensions.z) - size) < 1e-4, `${key}: неверный масштаб`);
    silhouettes.push(Array.from(parts.at(-1).geometry.attributes.position.array).join(','));
  }
  assert.equal(new Set(silhouettes).size, 3, `${key}: варианты имеют одинаковую форму`);
}
console.log('OK: периодические берега, глубина русла, три силуэта растений и бюджеты геометрии.');
if (!process.argv.includes('--browser')) process.exit(0);

const { chromium } = await import('playwright-core');
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.glb': 'model/gltf-binary', '.obj': 'text/plain', '.jpg': 'image/jpeg' };
const server = http.createServer((request, response) => {
  const url = new URL(request.url, 'http://localhost');
  const file = path.resolve(gameRoot, `.${url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname)}`);
  if (!file.startsWith(`${gameRoot}${path.sep}`) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { response.writeHead(404).end(); return; }
  response.setHeader('Content-Type', mime[path.extname(file)] || 'application/octet-stream');
  fs.createReadStream(file).pipe(response);
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch({ executablePath: process.env.CHROME_BIN || undefined,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const outDir = process.env.MOSES_SHOTS_DIR;
if (outDir) fs.mkdirSync(outDir, { recursive: true });
try {
  for (const [name, viewport, dpr, cores, memory] of [
    ['portrait', { width: 420, height: 900 }, 2, 8, 8],
    ['landscape', { width: 844, height: 390 }, 3, 2, 4],
    ['low', { width: 320, height: 568 }, 1, 2, 2],
  ]) {
    if (process.env.MOSES_AUDIT_VIEW && process.env.MOSES_AUDIT_VIEW !== name) continue;
    const page = await browser.newPage({ viewport, deviceScaleFactor: dpr, isMobile: true, hasTouch: true });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error' && /THREE|shader|GL_INVALID|WebGL/i.test(message.text())) errors.push(message.text()); });
    await page.route('https://**/*', route => route.fulfill({ status: 200, body: '' }));
    // Тестовый доступ к готовым световым пресетам. Он добавляется только
    // в ответ локального тест-сервера и не попадает в опубликованную игру.
    // На CPU кадр может занимать секунду; ждать километры заплыва не нужно.
    await page.route('**/js/game-v75.js*', route => {
      const source = fs.readFileSync(path.join(gameRoot, 'js/game-v75.js'), 'utf8');
      const instrumented = source.replace('  boot();', `
        window.__nileAuditBiome = (index) => {
          state.biome = index; state.biomeBlend = 1; applyLook(BIOMES[index], 1);
        };
        window.__nileAuditGround = () => {
          renderer.setAnimationLoop(null);
          const saved = { playing: state.playing, paused: state.paused, scroll: state.scroll, speed: state.speed };
          const anchorMesh = scrollLayers.find(mesh => mesh.name === 'V75RocksInstanced');
          const matrix = new THREE.Matrix4();
          anchorMesh.getMatrixAt(Math.floor(anchorMesh.count / 2), matrix);
          const anchorZ = matrix.elements[14];
          const ground = [];
          scene.traverse(mesh => { if (['V751NileBed', 'V751DampShore', 'V751WarmSand', 'V751PebbleBank'].includes(mesh.name)) ground.push(mesh); });
          const sample = () => ground.map(mesh => {
            const pos = mesh.geometry.attributes.position, uv = mesh.geometry.attributes.uv;
            const last = pos.count - 1;
            const slope = (uv.getY(last) - uv.getY(0)) / (pos.getZ(last) - pos.getZ(0));
            const worldZ = anchorZ + anchorMesh.position.z;
            const v = uv.getY(0) + slope * (worldZ - pos.getZ(0));
            return {
              name: mesh.name, scroll: state.scroll, slope,
              maps: ['map', 'normalMap', 'roughnessMap'].filter(key => mesh.material[key]).map(key => {
                const texture = mesh.material[key]; texture.updateMatrix();
                const point = texture.transformUv(new THREE.Vector2(.37, v));
                return { key, phase: point.y, offset: texture.offset.y, anisotropy: texture.anisotropy,
                  width: texture.image.width, height: texture.image.height };
              }),
            };
          });
          state.playing = true; state.paused = false; state.speed = 18.5; state.scroll = 32;
          update3D(0); const before = sample();
          update3D(.25); const moved = sample();
          state.scroll = 249.875; update3D(0); const wrapBefore = sample();
          update3D(.02); const wrapAfter = sample();
          state.paused = true; update3D(1); const paused = sample();
          state.paused = false; state.playing = false; update3D(1); const idle = sample();
          Object.assign(state, saved); update3D(0); renderer.setAnimationLoop(frame);
          const ownMaps = new THREE.MeshStandardMaterial({ map: new THREE.Texture(), normalMap: new THREE.Texture(), roughnessMap: new THREE.Texture() });
          const colorOnly = new THREE.MeshStandardMaterial({ map: new THREE.Texture() });
          const geometry = new THREE.BoxGeometry(1, 1, 1);
          for (const material of [ownMaps, colorOnly]) window.NileMaterials.dress(material, geometry);
          const filters = [ownMaps, colorOnly].map(material => ['map', 'normalMap', 'roughnessMap'].map(key => material[key].anisotropy));
          geometry.dispose(); ownMaps.dispose(); colorOnly.dispose();
          return { before, moved, wrapBefore, wrapAfter, paused, idle, filters };
        };
        window.__nileAuditCadence = () => {
          renderer.setAnimationLoop(null);
          const render = renderer.render.bind(renderer);
          const setTarget = renderer.setRenderTarget.bind(renderer);
          let draws = 0, targets = 0;
          renderer.render = (...args) => { draws++; return render(...args); };
          renderer.setRenderTarget = (target, ...args) => { if (target) targets++; return setTarget(target, ...args); };
          const results = [];
          let start = performance.now() + 1000;
          for (const hz of [60, 120, 144]) {
            state.playing = true; state.paused = false; state.invulnerable = 10000;
            state.lastTime = start * .001; renderDeadline = 0; renderRate = 0;
            const elapsed = state.elapsed, distance = state.distance;
            draws = 0; targets = 0;
            for (let i = 1; i <= hz; i++) frame(start + i * 1000 / hz);
            results.push({ hz, draws, targets, elapsed: state.elapsed - elapsed, distance: state.distance - distance });
            start += 2000;
          }
          state.paused = true; renderDeadline = 0; renderRate = 0; draws = 0;
          for (let i = 1; i <= 120; i++) frame(start + i * 1000 / 120);
          const pausedDraws = draws;
          const distance = state.distance;
          Object.defineProperty(document, 'hidden', { configurable: true, value: true });
          draws = 0;
          for (let i = 1; i <= 120; i++) frame(start + 2000 + i * 1000 / 120);
          const hiddenDraws = draws, hiddenDistance = state.distance - distance;
          delete document.hidden;
          renderer.render = render; renderer.setRenderTarget = setTarget;
          return { results, pausedDraws, hiddenDraws, hiddenDistance };
        };
        boot();`);
      return route.fulfill({ contentType: 'text/javascript', body: instrumented });
    });
    await page.addInitScript(({ cores, memory }) => {
      localStorage.setItem('moses-nile-tutorial-seen-v1', '1');
      Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => cores });
      Object.defineProperty(navigator, 'deviceMemory', { get: () => memory });
    }, { cores, memory });
    await page.goto(`http://127.0.0.1:${server.address().port}/`, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__mosesV75Ready, null, { timeout: 60000 });
    assert.equal(await page.evaluate(() => window.__mosesV75Mode), 'webgl');
    await page.evaluate(() => { const s = window.__mosesV75State; s.qualityWarmup = -10000; s.quality = 1; });
    await page.locator('#start-btn').click();
    // SwiftShader рендерит на CPU. Переходы прогоняем в небольшом окне,
    // а итоговые кадры снимаем в настоящем размере телефона.
    const smallViewport = { width: Math.round(viewport.width / 2), height: Math.round(viewport.height / 2) };
    await page.setViewportSize(smallViewport);
    await page.waitForFunction(() => window.__mosesV75State.distance > 3, null, { timeout: 30000 });
    await page.evaluate(() => { const s = window.__mosesV75State; s.paused = true; });
    const ground = await page.evaluate(() => window.__nileAuditGround());
    assert.equal(ground.before.length, 7, 'Не все полосы берегов и дно проверены');
    const comparePhase = (a, b, description) => {
      for (let i = 0; i < a.length; i++) {
        for (let j = 0; j < a[i].maps.length; j++) {
          const first = a[i].maps[j], next = b[i].maps[j];
          const delta = Math.abs(first.phase - next.phase);
          assert.ok(Math.min(delta, Math.abs(1 - delta)) < 1e-4, a[i].name + ': ' + description + ' (' + first.key + ')');
          if (first.key === 'map') assert.ok(first.anisotropy <= 8, 'Превышен бюджет фильтрации цвета');
          else assert.equal(first.anisotropy, 1, 'Лишняя фильтрация рельефа');
          assert.equal(next.width, first.width, 'Увеличена текстура');
          assert.equal(next.height, first.height, 'Увеличена текстура');
        }
      }
    };
    comparePhase(ground.before, ground.moved, 'рисунок скользит относительно камней');
    comparePhase(ground.wrapBefore, ground.wrapAfter, 'рисунок скачет на стыке тайлов');
    assert.ok(ground.moved[0].scroll > ground.before[0].scroll, 'Мир не движется в заплыве');
    assert.ok(ground.wrapAfter[0].scroll < ground.wrapBefore[0].scroll, 'Не проверен переход через конец тайла');
    assert.deepEqual(ground.paused, ground.wrapAfter, 'Берег движется на паузе');
    assert.deepEqual(ground.idle, ground.paused, 'Берег движется в меню');
    assert.deepEqual(ground.filters[0], [1, 1, 1], 'У готового PBR выросла стоимость фильтрации');
    assert.ok(ground.filters[1].reduce((sum, level) => sum + level, 0) <= 17, 'Перераспределение фильтрации увеличило бюджет');
    console.log('OK: песок, грунт и дно закреплены относительно моделей, включая стык 250 м, паузу и меню.');
    await page.addStyleTag({ content: '.screen,#loading-screen,#toast-layer { display:none!important }' });
    const modes = name === 'portrait' ? [0, 1, 2, 3, 4] : [0];
    for (const biome of modes) {
      await page.evaluate(biome => window.__nileAuditBiome(biome), biome);
      await page.waitForFunction(index => window.__mosesV75Diagnostics.biome === ['papyrus', 'open', 'rapids', 'night', 'delta'][index], biome, { timeout: 30000 });
      assert.equal(await page.evaluate(() => window.__mosesV75FrameError || null), null);
      await page.setViewportSize(viewport);
      if (outDir) await page.screenshot({ path: path.join(outDir, `${name}-${biome}.png`) });
      if (outDir && name === 'portrait' && biome === 0) await page.screenshot({ path: path.join(outDir, 'portrait-review.jpg'), quality: 88 });
      await page.setViewportSize(smallViewport);
      console.log(`Снят кадр ${name}, биом ${biome}.`);
    }
    const reflected = await page.evaluate(() => {
      const river = window.__mosesV75Scene.getObjectByName('MosesV75SiltyNile');
      return { strength: river.material.uniforms.uReflectionStrength.value, visible: river.visible,
        texture: !!river.material.uniforms.uReflection,
        pyramids: river.material.uniforms.uPyramids.value.length,
        detail: river.material.uniforms.uDetail.value,
        diagnostics: window.__mosesV75Diagnostics };
    });
    assert.equal(reflected.visible, true, 'Отражение не восстановило видимость реки');
    assert.ok(reflected.strength > 0, 'Отражение должно оставаться плавным на всех классах');
    assert.equal(reflected.texture, false, 'Вода не должна создавать карту повторного рендера сцены');
    assert.equal(reflected.pyramids, 3);
    assert.equal(reflected.detail, 0, 'Дорогие эффекты воды включены на телефоне');
    assert.equal(reflected.diagnostics.shadowPasses, 0, 'Теневой проход включён на телефоне');
    assert.ok(reflected.diagnostics.pixelRatio <= 1.25, 'Превышен мобильный DPR');
    console.log(`${name}: ${JSON.stringify(reflected.diagnostics)}`);
    await page.evaluate(() => { const s = window.__mosesV75State; s.quality = .35; s.qualityWarmup = 10; s.qualityHold = 100; s.fpsAverage = 60; window.dispatchEvent(new Event('resize')); });
    await page.waitForFunction(() => window.__mosesV75Diagnostics.pixelRatio <= 1, null, { timeout: 15000 });
    assert.equal(await page.evaluate(() => window.__mosesV75Scene.getObjectByName('MosesV75SiltyNile').material.uniforms.uReflectionStrength.value), reflected.strength,
      'Снижение качества не должно вызывать скачок отражения');
    if (name === 'portrait') {
      await page.setViewportSize({ width: 64, height: 128 });
      const cadence = await page.evaluate(() => window.__nileAuditCadence());
      for (const result of cadence.results) {
        assert.ok(result.draws >= 59 && result.draws <= 61, `${result.hz} Гц: неверное число кадров ${result.draws}`);
        assert.equal(result.targets, 0, 'Обнаружен дополнительный проход в RenderTarget');
        assert.ok(Math.abs(result.elapsed - 1) < .02, `${result.hz} Гц: время игры изменилось`);
        assert.ok(result.distance > 10, `${result.hz} Гц: заплыв замедлился`);
      }
      assert.ok(cadence.pausedDraws >= 14 && cadence.pausedDraws <= 16, 'Неверная частота на паузе');
      assert.equal(cadence.hiddenDraws, 0, 'Скрытая игра продолжает рисовать');
      assert.equal(cadence.hiddenDistance, 0, 'Скрытая игра продолжает заплыв');
      console.log(`OK: частота и время игры: ${JSON.stringify(cadence)}`);
    }
    assert.deepEqual(errors, [], `${name}: ошибки рендера`);
    console.log(`OK: ${name}, биомы ${modes.join(',')}, 3D, отражение и снижение качества.`);
    await page.close();
  }
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
