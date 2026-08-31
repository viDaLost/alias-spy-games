// Renders the Quartet card table and the Bible Sketch canvas without a backend.
//
//   node scripts/render-realtime-screens.mjs <out-dir>
//
// Both games open on a lobby and then run over a WebSocket, so they were the only
// screens the plain harness could never reach -- and therefore the only ones whose
// visual work could not be reviewed. Rather than inventing a game state by hand,
// this builds a real one with each worker's own engine (the same createRoomState /
// joinRoom / startGame / buildView the server runs) and feeds it to the page through
// a stand-in socket. What renders is what a player sees, and nothing touches the
// live workers.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';
import * as quartet from '../cloudflare/quartet-worker/src/engine.js';
import * as sketch from '../cloudflare/bible-sketch-worker/src/engine.js';

const root = process.cwd();
const outDir = process.argv[2];
if (!outDir) {
  console.error('usage: node scripts/render-realtime-screens.mjs <out-dir>');
  process.exit(2);
}
fs.mkdirSync(outDir, { recursive: true });

const ME = 'qa-player-1';
const NOW = new Date('2026-01-01T00:00:00Z').getTime();
const OTHERS = [['qa-2', 'Мария'], ['qa-3', 'Пётр'], ['qa-4', 'Анна']];
const EVERYONE = new Set([ME, ...OTHERS.map(([id]) => id)]);

/** A fixed sequence, so two runs of the same code produce the same screens. */
function seededRandom() {
  let value = 42;
  return () => {
    value = (value * 1103515245 + 12345) % 2147483648;
    return value / 2147483648;
  };
}

/** A dealt four-player Quartet game, seen through one player's eyes. */
function quartetView(viewer = ME) {
  // joinRoom mutates and reports whether the player rejoined; it does not return
  // the state. The worker's own tests use it exactly this way.
  const state = quartet.createRoomState('QA01', { playerId: ME, name: 'Иван' });
  for (const [playerId, name] of OTHERS) quartet.joinRoom(state, { playerId, name });
  quartet.startGame(state, ME, NOW, seededRandom());
  // Viewing as anyone but the starting player gives the waiting state -- the one a
  // player is in for most of the game, and the one that renders a different dock.
  return quartet.buildView(state, viewer, EVERYONE);
}

/** Bible Sketch mid-round, with lines already on the canvas, seen by one player. */
function sketchView(viewer = ME) {
  const random = seededRandom();
  const rng = (max) => Math.floor(random() * max);

  const state = sketch.createRoomState('QA02', { playerId: ME, name: 'Иван' }, 'objects', NOW);
  for (const [playerId, name] of OTHERS) sketch.joinRoom(state, { playerId, name }, NOW);
  sketch.startRound(state, ME, NOW, rng);

  // The screen worth reviewing is the drawer's, so take the first turn. turnOrder is
  // a shuffle of the players, so naming a different first element is a state the
  // engine itself could have produced -- it just is not left to the seed.
  state.turnOrder = [ME, ...state.turnOrder.filter((id) => id !== ME)];
  // Likewise the secret-word panel only renders for a non-spy, so the spy is someone else.
  if (state.spyPlayerId === ME) state.spyPlayerId = 'qa-3';

  // A few strokes so the canvas is not blank: an ark on the water, roughly.
  const strokes = [
    { color: '#4f46e5', width: 7, points: [[0.18, 0.62], [0.30, 0.72], [0.70, 0.72], [0.82, 0.62]] },
    { color: '#4f46e5', width: 7, points: [[0.18, 0.62], [0.82, 0.62]] },
    { color: '#d97706', width: 6, points: [[0.32, 0.62], [0.32, 0.44], [0.68, 0.44], [0.68, 0.62]] },
    { color: '#d97706', width: 6, points: [[0.30, 0.44], [0.50, 0.30], [0.70, 0.44]] },
    { color: '#0284c7', width: 5, points: [[0.10, 0.80], [0.26, 0.76], [0.44, 0.80], [0.62, 0.76], [0.90, 0.80]] },
    { color: '#0284c7', width: 5, points: [[0.10, 0.88], [0.28, 0.84], [0.46, 0.88], [0.64, 0.84], [0.90, 0.88]] },
  ];
  for (const stroke of strokes) sketch.commitStroke(state, ME, stroke, NOW);

  return sketch.buildView(state, viewer, EVERYONE);
}

const GAMES = [
  {
    id: 'quartet-table',
    open: 'quartet',
    host: 'alias-spy-games-quartet',
    view: quartetView(),
    storage: { quartet_v2_player_name: 'Иван', quartet_v2_guest_id: ME, quartet_v2_room_id: 'QA01' },
    waitFor: '.qv2-game',
    probe: () => ['.qv3-hand-table .qv2-section-head', '.qv2-group-tabs', '.qv2-quartet-card-head', '.qv2-playing-card, .qv2-card'].map((selector) => {
      const node = document.querySelector(selector);
      if (!node) return `${selector}: —`;
      const box = node.getBoundingClientRect();
      return `${selector}: ${Math.round(box.top + window.scrollY)}..${Math.round(box.bottom + window.scrollY)} (h${Math.round(box.height)})`;
    }),
    measure: ['.qv2-topbar', '.qv2-turn-banner', '.qv2-event', '.qv3-hand-table', '.qv3-opponents', '.qv2-activity', '.qv2-action-dock', '[class*="dock"]', '.qv2-game'],
  },
  {
    id: 'quartet-table-waiting',
    open: 'quartet',
    host: 'alias-spy-games-quartet',
    view: quartetView('qa-2'),
    storage: { quartet_v2_player_name: 'Мария', quartet_v2_guest_id: 'qa-2', quartet_v2_room_id: 'QA01' },
    waitFor: '.qv2-game',
    measure: ['.qv2-turn-banner', '.qv3-hand-table', '.qv2-game'],
  },
  {
    id: 'bible-sketch-canvas',
    open: 'bible-sketch',
    host: 'alias-spy-games-bible-sketch',
    view: sketchView(),
    storage: { bible_sketch_player_name_v1: 'Иван', bible_sketch_guest_id_v1: ME, bible_sketch_room_id_v1: 'QA02' },
    // A drawing turn asks to be held in landscape first; dismissing that is the
    // path a portrait player takes to the canvas.
    prepare: (target) => target.click('[data-action="allow-portrait"]', { timeout: 5000 }).catch(() => {}),
    waitFor: '#bsk-canvas',
    measure: ['.bsk-topbar', '.bsk-status', '.bsk-canvas-card', '.bsk-tools', '.bsk-colors', '.bsk-chat'],
    probe: () => [...document.querySelectorAll('.bsk-tools > *, .bsk-colors > *')].map((node) => {
      const box = node.getBoundingClientRect();
      const clipped = box.right > (node.parentElement.getBoundingClientRect().right + 1) || box.width < 1;
      return `${node.textContent.trim().slice(0, 12).padEnd(13)} ${Math.round(box.left)}..${Math.round(box.right)} ${clipped ? 'ОБРЕЗАНО' : ''}`;
    }),
  },
  {
    id: 'bible-sketch-watching',
    open: 'bible-sketch',
    host: 'alias-spy-games-bible-sketch',
    view: sketchView('qa-3'),
    storage: { bible_sketch_player_name_v1: 'Пётр', bible_sketch_guest_id_v1: 'qa-3', bible_sketch_room_id_v1: 'QA02' },
    prepare: (target) => target.click('[data-action="allow-portrait"]', { timeout: 5000 }).catch(() => {}),
    waitFor: '#bsk-canvas',
    measure: ['.bsk-status', '.bsk-canvas-card', '.bsk-tools', '.bsk-chat'],
  },
];

const mime = new Map([
  ['.html', 'text/html; charset=utf-8'], ['.js', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'], ['.json', 'application/json; charset=utf-8'],
  ['.png', 'image/png'], ['.jpg', 'image/jpeg'], ['.webp', 'image/webp'],
  ['.svg', 'image/svg+xml'], ['.woff2', 'font/woff2'],
]);

const server = http.createServer((req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname);
  const target = path.resolve(root, `.${pathname === '/' ? '/index.html' : pathname}`);
  if (!target.startsWith(root + path.sep) || !fs.existsSync(target) || !fs.statSync(target).isFile()) {
    res.writeHead(404).end('Not found');
    return;
  }
  res.writeHead(200, {
    'Content-Type': mime.get(path.extname(target).toLowerCase()) || 'application/octet-stream',
    'Cache-Control': 'no-store',
  });
  fs.createReadStream(target).pipe(res);
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const baseURL = `http://127.0.0.1:${server.address().port}`;

const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROME_BIN || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--enable-unsafe-swiftshader', '--force-prefers-reduced-motion'],
});

const telegramStub = 'window.Telegram={WebApp:{initData:"",initDataUnsafe:{user:{id:999999,username:"qa",first_name:"QA"}},ready(){},expand(){},setHeaderColor(){},setBackgroundColor(){},enableClosingConfirmation(){},openTelegramLink(){},disableVerticalSwipes(){},requestFullscreen(){},lockOrientation(){},unlockOrientation(){},HapticFeedback:{impactOccurred(){},notificationOccurred(){},selectionChanged(){}}}};';
const gas = JSON.stringify({ success: true, isBanned: false, wowStars: 20, lastGames: [] });

// Each capture gets its own page: the waiting screens are the same games seen through
// another player's eyes, so they need their own stored identity and their own state.
async function openPage(game) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true,
  });

  await context.addInitScript(({ view, host, entries, NOW_MS }) => {
    window.__APP_TELEMETRY_DISABLED__ = true;
    // Freeze anything time-based so two captures of the same code match exactly. The
    // clock is pinned to the moment the state was built, so its turn deadline reads
    // as a full turn remaining rather than as expired.
    Math.random = () => 0.42;
    const RealDate = Date;
    window.Date = class extends RealDate {
      constructor(...args) { super(...(args.length ? args : [NOW_MS])); }
      static now() { return NOW_MS; }
    };

    // Stand-in socket: opens, then delivers the state the engine produced.
    class StubSocket extends EventTarget {
      constructor(url) {
        super();
        this.url = String(url);
        this.readyState = 1;
        const deliver = this.url.includes(host);
        setTimeout(() => {
          this.dispatchEvent(new Event('open'));
          // Bible Sketch awaits the open event and only then subscribes to messages,
          // so the state has to arrive in a later task -- sent in this one it is lost.
          if (deliver) {
            setTimeout(() => this.dispatchEvent(new MessageEvent('message', {
              data: JSON.stringify({ type: 'state', state: view }),
            })), 0);
          }
        }, 40);
      }
      send() {}
      close() { this.readyState = 3; this.dispatchEvent(new Event('close')); }
      set onopen(fn) { this.addEventListener('open', fn); }
      set onmessage(fn) { this.addEventListener('message', fn); }
      set onclose(fn) { this.addEventListener('close', fn); }
      set onerror(fn) { this.addEventListener('error', fn); }
    }
    // Both clients compare readyState against WebSocket.OPEN, so the stand-in has to
    // carry the same constants as the real constructor.
    StubSocket.CONNECTING = 0;
    StubSocket.OPEN = 1;
    StubSocket.CLOSING = 2;
    StubSocket.CLOSED = 3;
    window.WebSocket = StubSocket;

    try { for (const [key, value] of Object.entries(entries)) localStorage.setItem(key, value); } catch {}
  }, { view: game.view, host: game.host, entries: game.storage, NOW_MS: NOW });

  const page = await context.newPage();
  page.on('pageerror', (error) => console.log(`  ошибка страницы: ${String(error).slice(0, 140)}`));
  page.on('response', (response) => {
    if (response.status() >= 400) console.log(`  ${response.status()} ${response.url().replace(baseURL, '').slice(0, 90)}`);
  });

  await page.route('https://telegram.org/**', (route) => route.fulfill({
    status: 200, contentType: 'text/javascript; charset=utf-8', body: telegramStub,
  }));
  for (const pattern of ['https://script.google.com/**', 'https://script.googleusercontent.com/**']) {
    await page.route(pattern, (route) => route.fulfill({ status: 200, contentType: 'application/json; charset=utf-8', body: gas }));
  }
  // The join call has to answer with the worker's shape: connectSocket() bails without
  // a session token, and the resume then falls back to the lobby.
  await page.route('https://*.workers.dev/**', (route) => route.fulfill({
    status: 200, contentType: 'application/json; charset=utf-8',
    body: JSON.stringify({
      ok: true, rooms: [], roomId: game.view?.roomId || 'QA01',
      playerId: game.storage[Object.keys(game.storage).find((key) => key.includes('guest'))],
      sessionToken: 'qa-token', state: game.view,
    }),
  }));

  await page.goto(baseURL, { waitUntil: 'commit', timeout: 30_000 });
  await page.waitForSelector('#menu-container:not(.hidden)', { timeout: 25_000 });
  await page.waitForTimeout(3000);
  return { context, page };
}

const captured = [];
for (const game of GAMES) {
  const { context, page } = await openPage(game);
  try {
    await page.evaluate((key) => window.showGame(key), game.open);
    if (game.prepare) await game.prepare(page);
    await page.waitForSelector(game.waitFor, { timeout: 15_000 });
    // Quartet's turn toast lives for 2.3s. Capturing while it fades makes two runs of
    // the same code differ, and it covers the cards the capture is for.
    await page.waitForTimeout(3500);
    await page.addStyleTag({ content: '*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}' });
    // The first screen is what the redesign is judged on, so capture it on its own as
    // well as the whole scroll length.
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: path.join(outDir, `${game.id}-fold.png`) });
    await page.screenshot({ path: path.join(outDir, `${game.id}.png`), fullPage: true });

    const { height, overflow } = await page.evaluate(() => ({
      height: document.documentElement.scrollHeight,
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    }));
    console.log(`${game.id.padEnd(24)} ${height}px${overflow > 0 ? `  ГОРИЗОНТАЛЬНОЕ ПЕРЕПОЛНЕНИЕ +${overflow}px` : ''}`);

    if (game.measure) {
      const rows = await page.evaluate((selectors) => selectors.map((selector) => {
        const node = document.querySelector(selector);
        if (!node) return `${selector}: —`;
        const box = node.getBoundingClientRect();
        return `${selector}: ${Math.round(box.top + window.scrollY)}..${Math.round(box.bottom + window.scrollY)} (h${Math.round(box.height)})`;
      }), game.measure);
      for (const row of rows) console.log(`    ${row}`);
    }
    if (game.probe) {
      for (const row of await page.evaluate(game.probe)) console.log(`    ${row}`);
    }
    if (process.env.RT_FIXED) {
      // Fixed and sticky bars sit outside the flow, so they never appear in the band
      // list even when they cover half the screen.
      const bars = await page.evaluate(() => [...document.querySelectorAll('body *')]
        .filter((node) => {
          const style = getComputedStyle(node);
          return (style.position === 'fixed' || style.position === 'sticky') && node.getClientRects().length;
        })
        .map((node) => {
          const box = node.getBoundingClientRect();
          return `${Math.round(box.top)}..${Math.round(box.bottom)} (h${Math.round(box.height)})  ${String(node.className).slice(0, 55)}`;
        }));
      for (const bar of bars) console.log(`    закреплено ${bar}`);
    }
    captured.push(game.id);
  } catch (error) {
    console.warn(`не удалось снять ${game.id}: ${String(error).slice(0, 160)}`);
    if (process.env.DEBUG_RT) {
      console.warn('  DOM:', await page.evaluate(() => document.querySelector('#game-container')?.textContent?.replace(/\s+/g, ' ').trim().slice(0, 300)));
    }
  }
  await context.close();
}

console.log(`снято ${captured.length}/${GAMES.length}: ${captured.join(', ')}`);
await browser.close();
server.close();
