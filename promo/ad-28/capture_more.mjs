// Съёмка игр, которых нет в 14-секундном ролике: «Двенадцать колен»,
// «Библейский художник», «Угадай персонажа». Приложение — то же, что открывает
// Telegram (promo/ad/app-harness.mjs), экраны и элементы снимаются так же, как
// в promo/ad/capture_app.mjs.
//
//   node promo/ad-28/capture_more.mjs [tribes] [sketch] [guess]
//   → promo/ad-28/shots/*.webp + shots/layout.js
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright-core';
import { serve } from '../ad/serve.mjs';
import { openApp, rectOf, sprite } from '../ad/app-harness.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const SHOTS = path.join(HERE, 'shots');
const RAW = path.join(HERE, 'build', 'raw');
const CHROME = process.env.CHROME_BIN || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const SCALE = 3;
const only = new Set(process.argv.slice(2));
const want = (name) => !only.size || only.has(name);

fs.mkdirSync(SHOTS, { recursive: true });
fs.mkdirSync(RAW, { recursive: true });
const layoutFile = path.join(SHOTS, 'layout.json');
const layout = fs.existsSync(layoutFile) ? JSON.parse(fs.readFileSync(layoutFile, 'utf8')) : {};
layout.scale = SCALE;
const raw = (name) => path.join(RAW, `${name}.png`);
const made = [];
const shotFile = (name) => { made.push(`${name}.png`); return raw(name); };

const srv = await serve(ROOT);
const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox', '--force-color-profile=srgb', '--font-render-hinting=none'] });
const failures = [];

// ——— «Двенадцать колен»: тройка на тройку, «Иордан», «Шабат!» ———
if (want('tribes')) {
  const { page, context, errors } = await openApp(browser, srv.url, { scale: SCALE });
  await page.evaluate(() => { window.showGame('twelve-tribes'); });
  await page.getByRole('button', { name: /За одним столом/ }).click();
  await page.getByRole('button', { name: 'Сдавать' }).click();
  await page.waitForFunction(() => window.TwelveTribesGame?.state()?.players?.length === 3, null, { timeout: 15_000 });
  /*
    Раздача — движка игры, но руки разложены под ролик: на сбросе тройка
    Рувима, у игрока тройка Дана, «Иордан» Дана и пятёрка Иуды. У каждого
    соперника ровно один законный ход — седьмой и первый жребий Дана, — поэтому
    они ходят предсказуемо, а ходят всё равно сами, своим кодом.
  */
  await page.evaluate(() => {
    const s = window.TwelveTribesGame.state();
    let n = 0;
    const card = (camp, kind, rank = null) => ({ id: `ad${n += 1}`, camp, kind, rank });
    s.pile.push(card('reuben', 'number', 3));
    s.camp = 'reuben';
    s.players[0].hand = [card('dan', 'number', 3), card('dan', 'jordan'), card('judah', 'number', 5)];
    s.players[1].hand = [card('dan', 'number', 7), card('ephraim', 'number', 2), card('judah', 'number', 8), card('reuben', 'number', 6), card('ephraim', 'number', 6), card('judah', 'number', 1)];
    s.players[2].hand = [card('dan', 'number', 1), card('ephraim', 'number', 4), card('judah', 'number', 9), card('reuben', 'number', 5), card('ephraim', 'number', 8), card('judah', 'number', 2)];
    Object.assign(s, { turn: 0, dir: 1, phase: 'play', penalty: null, drawn: null, risk: null });
    window.TwelveTribesGame.refresh();
  });
  await page.waitForTimeout(900);
  const t = {};
  const handRects = () => page.evaluate(() => [...document.querySelectorAll('[data-hand] .tt-card')].map((c) => { const r = c.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height, label: c.textContent.replace(/\s+/g, ' ').trim() }; }));
  t.pile = await rectOf(page, '[data-pile]');
  t.deck = await rectOf(page, '[data-deck]');
  t.hand1 = await handRects();
  await page.screenshot({ path: shotFile('tribes-1') });
  // Рука на экране отсортирована: карта ищется по надписи, а не по месту в раздаче.
  const indexOf = (re) => page.evaluate((src) => { const r = new RegExp(src); const c = [...document.querySelectorAll('[data-hand] .tt-card')].find((x) => r.test(x.textContent.replace(/\s+/g, ' '))); return c ? c.dataset.index : null; }, re);
  const three = await indexOf('^\\s*3.*Дан');
  const jordanAt = await indexOf('Иордан');
  if (three == null || jordanAt == null) throw new Error('в руке нет тройки Дана или «Иордана»');
  t.threeRect = await rectOf(page, `[data-hand] .tt-card[data-index="${three}"]`);
  t.jordanRect = await rectOf(page, `[data-hand] .tt-card[data-index="${jordanAt}"]`);
  await sprite(page, `[data-hand] .tt-card[data-index="${three}"]`, shotFile('tribes-card-3'), 18);
  await sprite(page, `[data-hand] .tt-card[data-index="${jordanAt}"]`, shotFile('tribes-card-jordan'), 18);
  // Тройка Дана — на тройку Рувима.
  await page.click(`[data-hand] .tt-card[data-index="${three}"]`);
  await page.waitForTimeout(700);
  t.afterPlay = await page.evaluate(() => { const s = window.TwelveTribesGame.state(); return { top: s.pile[s.pile.length - 1], turn: s.turn, score: s.players[0].score }; });
  await page.screenshot({ path: shotFile('tribes-2') });
  // Соперники ходят сами.
  await page.waitForFunction(() => window.TwelveTribesGame.state().turn === 0, null, { timeout: 20_000 });
  await page.waitForTimeout(900);
  t.hand3 = await handRects();
  t.afterBots = await page.evaluate(() => { const s = window.TwelveTribesGame.state(); return { top: s.pile[s.pile.length - 1], log: s.log.slice(-4) }; });
  await page.screenshot({ path: shotFile('tribes-3') });
  // «Иордан»: ход меняет сторону.
  const jordan = await indexOf('Иордан');
  t.jordanRect3 = await rectOf(page, `[data-hand] .tt-card[data-index="${jordan}"]`);
  await page.click(`[data-hand] .tt-card[data-index="${jordan}"]`);
  await page.waitForTimeout(700);
  t.afterJordan = await page.evaluate(() => { const s = window.TwelveTribesGame.state(); return { dir: s.dir, turn: s.turn, hand: s.players[0].hand.length, top: s.pile[s.pile.length - 1] }; });
  t.shabbat = await rectOf(page, '[data-shabbat]:not([hidden])');
  await page.screenshot({ path: shotFile('tribes-4') });
  if (t.shabbat) {
    await page.click('[data-shabbat]');
    await page.waitForTimeout(500);
    await page.screenshot({ path: shotFile('tribes-5') });
  }
  t.status = await page.evaluate(() => document.querySelector('[data-status]')?.textContent.replace(/\s+/g, ' ').trim());
  layout.tribes = t;
  if (errors.length) failures.push(`колена: ${errors.join(' | ')}`);
  await context.close();
  console.log(`колена сняты: ${JSON.stringify(t.afterPlay)} · после соперников ${JSON.stringify(t.afterBots.top)} · после «Иордана» ${JSON.stringify(t.afterJordan)} · «Шабат!» ${t.shabbat ? 'есть' : 'нет'}`);
}

// ——— «Библейский художник»: ковчег на холсте, голосование, итог ———
if (want('sketch')) {
  const engine = await import(path.join(ROOT, 'cloudflare/bible-sketch-worker/src/engine.js'));
  const { withDrawingCycleMeta } = await import(path.join(ROOT, 'cloudflare/bible-sketch-worker/src/drawing-cycles.js'));
  const { hideInactiveLobbyPlayers } = await import(path.join(ROOT, 'cloudflare/bible-sketch-worker/src/lobby-resume.js'));
  const ROOM = 'K4RT3N';
  const players = [
    { playerId: 'p-me', name: 'Илья' },
    { playerId: 'p-maria', name: 'Мария' },
    { playerId: 'p-booz', name: 'Вооз' },
  ];
  const room = engine.createRoomState(ROOM, players[0], 'objects', Date.now());
  const sockets = new Set();
  const connected = new Set(['p-me', 'p-maria', 'p-booz']);
  // Вид — тот же, что собирает воркер (index-drawing-cycles.js).
  const view = () => withDrawingCycleMeta(hideInactiveLobbyPlayers(engine.buildView(room, 'p-me', connected)), room);
  const push = () => { const text = JSON.stringify({ type: 'state', state: view() }); for (const ws of sockets) { try { ws.send(text); } catch { sockets.delete(ws); } } };
  const backend = 'https://alias-spy-games-bible-sketch.vitaledanilov.workers.dev';
  const { page, context, errors } = await openApp(browser, srv.url, {
    scale: SCALE,
    extraRoutes: async (pg) => {
      await pg.setViewportSize({ width: 844, height: 390 });
      await pg.route(`${backend}/**`, (route) => route.fulfill({ json: { ok: true, roomId: ROOM, sessionToken: 'tok-me' } }));
      await pg.routeWebSocket(/\/rooms\/.+\/ws/, (ws) => {
        sockets.add(ws);
        ws.onClose(() => sockets.delete(ws));
        ws.onMessage((text) => {
          const msg = JSON.parse(String(text));
          if (msg.type !== 'action') return;
          const now = Date.now();
          if (msg.action === 'startRound') {
            engine.startRound(room, 'p-me', now);
            // слово и шпион — под ролик: «ковчег», шпион Вооз, первым рисует игрок
            room.wordId = 'ark'; room.spyPlayerId = 'p-booz'; room.lastSpyPlayerId = 'p-booz';
            room.turnOrder = ['p-me', 'p-maria', 'p-booz']; room.turnIndex = 0;
          }
          if (msg.action === 'drawStroke') engine.commitStroke(room, 'p-me', msg.payload.stroke, now);
          if (msg.action === 'voteSpy') engine.voteForSpy(room, 'p-me', msg.payload.targetId, now);
          if (msg.action === 'reviewGuess') engine.voteGuessReview(room, 'p-me', msg.payload.accept, now);
          push();
        });
        setTimeout(push, 50);
      });
    },
  });
  const k = {};
  await page.evaluate(() => { window.showGame('bible-sketch'); });
  await page.waitForSelector('[data-action="create-room"]', { timeout: 20_000 });
  await page.waitForTimeout(600);
  await page.screenshot({ path: shotFile('sketch-home') });
  await page.click('[data-action="create-room"]');
  await page.waitForTimeout(800);
  for (const pl of players.slice(1)) engine.joinRoom(room, pl, Date.now());
  push();
  await page.waitForTimeout(600);
  await page.screenshot({ path: shotFile('sketch-lobby') });
  await page.click('[data-action="start-round"], button:has-text("Начать")').catch(() => null);
  await page.waitForTimeout(1200);
  // если игра просит повернуть телефон — он и так боком
  await page.screenshot({ path: shotFile('sketch-turn') });
  k.canvas = await rectOf(page, '#bsk-canvas');
  k.status = await page.evaluate(() => document.querySelector('.bsk-secret')?.textContent.replace(/\s+/g, ' ').trim());
  // Ковчег — настоящими линиями по холсту.
  const ARK = [
    [[0.2, 0.56], [0.28, 0.7], [0.4, 0.76], [0.6, 0.76], [0.72, 0.7], [0.8, 0.56], [0.2, 0.56]],
    [[0.34, 0.56], [0.34, 0.4], [0.66, 0.4], [0.66, 0.56]],
    [[0.3, 0.41], [0.5, 0.26], [0.7, 0.41]],
    [[0.46, 0.46], [0.54, 0.46], [0.54, 0.53], [0.46, 0.53], [0.46, 0.46]],
    [[0.1, 0.84], [0.2, 0.8], [0.3, 0.84], [0.4, 0.8], [0.5, 0.84], [0.6, 0.8], [0.7, 0.84], [0.8, 0.8], [0.9, 0.84]],
  ];
  k.drawn = [];
  for (let i = 0; i < ARK.length; i += 1) {
    const pts = ARK[i].map(([x, y]) => ({ x: k.canvas.x + x * k.canvas.w, y: k.canvas.y + y * k.canvas.h }));
    await page.mouse.move(pts[0].x, pts[0].y);
    await page.mouse.down();
    for (let j = 1; j < pts.length; j += 1) {
      const a = pts[j - 1]; const b = pts[j];
      for (let st = 1; st <= 8; st += 1) await page.mouse.move(a.x + (b.x - a.x) * st / 8, a.y + (b.y - a.y) * st / 8);
    }
    await page.mouse.up();
    await page.waitForTimeout(250);
    await page.screenshot({ path: shotFile(`sketch-stroke-${i + 1}`) });
  }
  k.strokes = room.strokes.map((st) => ({ color: st.color, width: st.width, mode: st.mode, points: st.points }));
  k.brush = await page.evaluate(() => { const c = document.getElementById('bsk-canvas'); return { cssW: c.getBoundingClientRect().width, w: c.width }; });
  // Остальные рисуют своё (в ролике — за кадром), затем голосование.
  engine.startSpyVoting(room, Date.now());
  push();
  await page.waitForTimeout(700);
  // список игроков боком не помещается целиком — Вооз прокручен в вид, как сделал бы палец
  await page.evaluate(() => document.querySelector('[data-action="vote-spy"][data-player-id="p-booz"]').scrollIntoView({ block: 'nearest' }));
  await page.waitForTimeout(200);
  await page.screenshot({ path: shotFile('sketch-vote') });
  k.voteBooz = await rectOf(page, '[data-action="vote-spy"][data-player-id="p-booz"]');
  await page.click('[data-action="vote-spy"][data-player-id="p-booz"]');
  await page.waitForTimeout(300);
  engine.voteForSpy(room, 'p-maria', 'p-booz', Date.now());
  engine.voteForSpy(room, 'p-booz', 'p-maria', Date.now());
  push();
  await page.waitForTimeout(500);
  // Шпиона нашли; последний его ответ — «лодка», команда не засчитывает.
  engine.submitSpyGuess(room, 'p-booz', 'лодка', Date.now());
  push();
  await page.waitForTimeout(500);
  if (await page.locator('[data-action="review-guess"][data-accept="0"]').count()) {
    await page.evaluate(() => document.querySelector('[data-action="review-guess"][data-accept="0"]').scrollIntoView({ block: 'nearest' }));
    await page.waitForTimeout(200);
    k.reject = await rectOf(page, '[data-action="review-guess"][data-accept="0"]');
  }
  await page.screenshot({ path: shotFile('sketch-review') });
  if (await page.locator('[data-action="review-guess"][data-accept="0"]').count()) {
    await page.click('[data-action="review-guess"][data-accept="0"]');
    await page.waitForTimeout(300);
    if (room.status !== 'finished') { engine.voteGuessReview(room, 'p-maria', false, Date.now()); push(); }
  }
  await page.waitForTimeout(800);
  k.result = await page.evaluate(() => document.querySelector('.bsk-result h2')?.textContent);
  k.resultReason = room.result?.reason;
  await page.screenshot({ path: shotFile('sketch-result') });
  layout.sketch = k;
  if (errors.length) failures.push(`художник: ${errors.join(' | ')}`);
  await context.close();
  console.log(`художник снят: ${k.status} · линий ${k.strokes.length} · ${k.result} (${k.resultReason})`);
}

// ——— «Угадай персонажа»: карточка игрока 1 — «Моисей» ———
if (want('guess')) {
  const { page, context, errors } = await openApp(browser, srv.url, { scale: SCALE });
  await page.evaluate(() => { window.showGame('guess'); });
  await page.waitForFunction(() => /Показать персонажа/.test(document.getElementById('game-container')?.textContent || ''), null, { timeout: 15_000 });
  // Жребий игры выбрал двух персонажей; первому игроку достаётся Моисей —
  // он есть в списке игры (web/data/characters.json), ролик замыкает им рассказ.
  await page.evaluate(() => { guessCharacters[0] = 'Моисей'; });
  await page.waitForTimeout(500);
  const gc = {};
  await page.screenshot({ path: shotFile('guess-1') });
  gc.card1 = await rectOf(page, '#game-container .card');
  gc.show = await page.evaluate(() => { const b = [...document.querySelectorAll('#game-container button')].find((x) => /Показать персонажа/.test(x.textContent)); const r = b.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
  await sprite(page, '#game-container .card', shotFile('guess-card-1'), 20);
  await page.evaluate(() => [...document.querySelectorAll('#game-container button')].find((x) => /Показать персонажа/.test(x.textContent)).click());
  await page.waitForTimeout(600);
  await page.screenshot({ path: shotFile('guess-2') });
  gc.card2 = await rectOf(page, '#game-container .card');
  gc.name = await rectOf(page, '#game-container .card h3');
  gc.text = await page.evaluate(() => document.querySelector('#game-container .card')?.textContent.replace(/\s+/g, ' ').trim());
  await sprite(page, '#game-container .card', shotFile('guess-card-2'), 20);
  layout.guess = gc;
  if (errors.length) failures.push(`персонаж: ${errors.join(' | ')}`);
  await context.close();
  console.log(`персонаж снят: ${gc.text}`);
}

fs.writeFileSync(layoutFile, JSON.stringify(layout, null, 1));
fs.writeFileSync(path.join(SHOTS, 'layout.js'), `window.LAYOUT28 = ${JSON.stringify(layout)};\n`);
await browser.close();
await srv.close();

execFileSync('python3', ['-c', `
import sys, os
from PIL import Image
raw, out, names = sys.argv[1], sys.argv[2], sys.argv[3:]
for n in names:
    im = Image.open(os.path.join(raw, n))
    dst = os.path.join(out, n[:-4] + '.webp')
    # проверка проекта не пускает картинки больше 600 КиБ
    for q in (90, 86, 82, 78, 74):
        im.save(dst, 'WEBP', quality=q, method=6)
        if os.path.getsize(dst) <= 600 * 1024:
            break
`, RAW, SHOTS, ...made]);
if (failures.length) { console.error(failures.join('\n')); process.exit(1); }
console.log(`готово: ${made.length} файлов в promo/ad-28/shots`);
