/*
  Снимает кадры игры в headless-браузере и печатает диагностику.

  Софтверный OpenGL (SwiftShader) даёт около 20 кадров в секунду, поэтому
  игровое время идёт медленнее реального: не удивляйтесь, что за пять секунд
  ожидания дистанция вырастает на два десятка метров. Для проверки логики
  быстрее гонять запасной 2D-режим: MODE=lite.

  Запуск:
    node scripts/moses-nile/capture.mjs <каталог превью> [каталог кадров]
  Переменные:
    MODE=lite       — выключить WebGL и проверять запасной режим
    CHROME_BIN=...  — путь к Chromium
    SCENE=obstacles — сценарий: run (по умолчанию), obstacles, biomes, all
*/
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';

const root = path.resolve(process.argv[2] || '/tmp/moses-nile-preview');
const shots = path.resolve(process.argv[3] || './nile-shots');
const lite = process.env.MODE === 'lite';
const scene = process.env.SCENE || 'run';
fs.mkdirSync(shots, { recursive: true });

const mime = new Map([
  ['.html', 'text/html; charset=utf-8'], ['.js', 'text/javascript; charset=utf-8'],
  ['.jpg', 'image/jpeg'], ['.png', 'image/png'], ['.webp', 'image/webp'],
  ['.glb', 'model/gltf-binary'], ['.obj', 'text/plain; charset=utf-8'],
]);
const server = http.createServer((request, response) => {
  const url = new URL(request.url || '/', 'http://127.0.0.1');
  const relative = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
  const target = path.resolve(root, `.${relative}`);
  if (!target.startsWith(root) || !fs.existsSync(target) || !fs.statSync(target).isFile()) {
    response.writeHead(404).end('not found');
    return;
  }
  response.writeHead(200, {
    'Content-Type': mime.get(path.extname(target)) || 'application/octet-stream',
    'Cache-Control': 'no-store',
  });
  fs.createReadStream(target).pipe(response);
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}/`;

const args = ['--no-sandbox', '--disable-dev-shm-usage'];
if (lite) args.push('--disable-webgl');
else args.push('--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist');

const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROME_BIN || '/usr/bin/google-chrome',
  args,
});
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
const page = await context.newPage();
const problems = [];
page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`));
page.on('console', (message) => {
  if (message.type() === 'error' && !message.text().includes('404')) problems.push(`console: ${message.text()}`);
});

const shot = (name) => page.screenshot({ path: path.join(shots, `${name}.png`) });
const hideUi = () => page.evaluate(() => {
  for (const id of ['hud', 'powerups-bar', 'hint-layer', 'sys-controls', 'version-badge']) {
    const node = document.getElementById(id);
    if (node) node.style.display = 'none';
  }
  const controls = document.querySelector('.mobile-controls');
  if (controls) controls.style.display = 'none';
});

try {
  await page.goto(base, { waitUntil: 'load', timeout: 60_000 });
  await page.waitForFunction(() => window.__mosesV75Ready === true, null, { timeout: 180_000 });
  await shot('01-start');
  await page.locator('#start-btn').click({ timeout: 60_000 });
  await page.waitForTimeout(2500);
  await shot('02-play');

  if (scene === 'obstacles' || scene === 'all') {
    // Препятствия ставятся вручную: дожидаться их в потоке слишком долго.
    await page.evaluate(() => {
      const state = window.__mosesV75State;
      const clearanceOf = (type) => (['rock', 'croc', 'vortex', 'hippo', 'boat'].includes(type) ? 'ground'
        : type === 'log' ? 'low' : type === 'gate' ? 'high' : null);
      const put = (type, lane, z) => state.items.push({
        type, lane, x: [-3.75, 0, 3.75][lane], z, radius: 1.2, clearance: clearanceOf(type),
        hover: 0, phase: Math.random() * 6, scored: true, surface: 1, bite: 0,
        lunged: true, surfaced: true, mesh: null, shadow: null,
      });
      put('gate', 0, -14); put('vortex', 1, -20); put('boat', 2, -15);
      put('hippo', 0, -30); put('croc', 1, -38); put('log', 2, -27);
    });
    await page.waitForTimeout(2600);
    await hideUi();
    await shot('03-obstacles');
  }

  if (scene === 'biomes' || scene === 'all') {
    for (const [distance, name] of [[1520, '04-rapids'], [2420, '05-night'], [3320, '06-delta']]) {
      await page.evaluate((value) => { window.__mosesV75State.distance = value; }, distance);
      await page.waitForTimeout(lite ? 2500 : 5000);
      await shot(name);
    }
  }

  if (scene === 'run' || scene === 'all') {
    await page.keyboard.press('ArrowUp');
    await page.waitForTimeout(230);
    await shot('07-jump');
    await page.waitForTimeout(900);
    await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(240);
    await shot('08-dive');
  }

  const report = await page.evaluate(() => ({
    mode: window.__mosesV75Mode,
    badge: document.getElementById('version-badge')?.textContent,
    diagnostics: window.__mosesV75Diagnostics,
  }));
  console.log(JSON.stringify({ ...report, problems }, null, 1));
  if (problems.length) process.exitCode = 1;
} finally {
  await context.close();
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
