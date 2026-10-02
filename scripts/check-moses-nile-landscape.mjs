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
    const page = await browser.newPage({ viewport, deviceScaleFactor: dpr });
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
      return { strength: river.material.uniforms.uReflectionStrength.value, visible: river.visible };
    });
    assert.equal(reflected.visible, true, 'Отражение не восстановило видимость реки');
    assert.equal(reflected.strength > 0, name !== 'low', 'Неверный класс качества отражения');
    await page.evaluate(() => { const s = window.__mosesV75State; s.quality = .35; s.qualityWarmup = 10; s.qualityHold = 100; s.fpsAverage = 60; window.dispatchEvent(new Event('resize')); });
    await page.waitForFunction(() => window.__mosesV75Diagnostics.pixelRatio < 1.9, null, { timeout: 15000 });
    await page.waitForFunction(() => window.__mosesV75Scene.getObjectByName('MosesV75SiltyNile').material.uniforms.uReflectionStrength.value === 0, null, { timeout: 15000 });
    assert.deepEqual(errors, [], `${name}: ошибки рендера`);
    console.log(`OK: ${name}, биомы ${modes.join(',')}, 3D, отражение и снижение качества.`);
    await page.close();
  }
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
