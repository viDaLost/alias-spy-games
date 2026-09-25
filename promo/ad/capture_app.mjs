// Съёмка настоящих экранов приложения для ролика.
//
// Всё снимается с работающего приложения: меню, «Библейские слова» (слова
// набираются настоящим жестом по кругу букв), «Квартет» (лобби и партия на
// настоящем движке сервера — cloudflare/quartet-worker/src/engine.js — через
// подменённую сеть), «Библейские сокровища». Там, где в ролике что-то движется,
// снимаются отдельные спрайты этих же элементов с прозрачным фоном и их точные
// прямоугольники — ролик двигает их поверх неподвижного скриншота.
//
//   node promo/ad/capture_app.mjs [menu] [words] [quartet] [treasures]
//   → promo/ad/shots/*.webp + promo/ad/shots/layout.json
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright-core';
import { serve } from './serve.mjs';
import { openApp, rectOf, sprite } from './app-harness.mjs';

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
layout.viewport = { width: 390, height: 844 };
const raw = (name) => path.join(RAW, `${name}.png`);

const srv = await serve(ROOT);
const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox', '--force-color-profile=srgb', '--font-render-hinting=none'] });
const failures = [];

async function hideStyle(page, css) {
  await page.evaluate((text) => { const s = document.createElement('style'); s.className = 'ad-hide'; s.textContent = text; document.head.appendChild(s); }, css);
}
async function clearHide(page) { await page.evaluate(() => document.querySelectorAll('style.ad-hide').forEach((s) => s.remove())); }

// ——— Главное меню ———
if (want('menu')) {
  const { page, context, errors } = await openApp(browser, srv.url, { scale: 2 });
  const menu = {};
  menu.docHeight = await page.evaluate(() => document.scrollingElement.scrollHeight);
  menu.cards = await page.evaluate(() => Object.fromEntries([...document.querySelectorAll('.game-card')]
    .filter((e) => getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().height > 0)
    .map((e) => { const b = e.getBoundingClientRect(); const key = e.dataset.cardGame || (e.getAttribute('onclick') || '').match(/showGame\('([^']+)'/)?.[1] || e.querySelector('.game-title, h3, strong')?.textContent?.trim(); return [key, { x: b.left, y: b.top + scrollY, w: b.width, h: b.height }]; })));
  menu.title = await rectOf(page, 'h1');
  // Фон меню — закреплённая сцена; контент — лента, которая прокручивается над ней.
  await hideStyle(page, '#menu-container, .app-header, #offline-bar { visibility: hidden !important; }');
  await page.screenshot({ path: raw('menu-bg') });
  await clearHide(page);
  // у <html> тот же класс home-gamehub-parallax — прятать только сам слой сцены
  await hideStyle(page, 'html, body { background: transparent !important; } .home-gamehub-parallax__scene, .home-gamehub-parallax__scene *, #offline-bar, #game-entry-loader { visibility: hidden !important; } body::before, body::after { display: none !important; }');
  await page.screenshot({ path: raw('menu-content'), fullPage: true, omitBackground: true });
  await clearHide(page);
  await page.screenshot({ path: raw('menu-top') });
  menu.wordsCard = await sprite(page, '.game-card[data-card-game="bible-wow"]', raw('menu-card-words'), 24);
  layout.menu = menu;
  if (errors.length) failures.push(`меню: ${errors.join(' | ')}`);
  await context.close();
  console.log('меню снято');
}

// ——— «Библейские слова» ———
if (want('words')) {
  const { page, context, errors } = await openApp(browser, srv.url, { scale: SCALE, stars: 20 });
  await page.evaluate(() => { window.showGame('bible-wow'); });
  await page.waitForSelector('.wow-btn-let', { timeout: 20_000 });
  await page.waitForTimeout(900);
  const letters = async () => page.evaluate(() => [...document.querySelectorAll('.wow-btn-let')].map((b) => { const r = b.getBoundingClientRect(); return { letter: b.dataset.letter, idx: +b.dataset.idx, x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height }; }));
  const wheel = await letters();
  const pos = (ch, used) => wheel.find((l) => l.letter === ch && !used.has(l.idx));
  // Слово — настоящим жестом: нажать на первую букву и провести через остальные.
  async function swipe(word, { hold = false, onLetter } = {}) {
    const used = new Set();
    const path = [...word].map((ch) => { const l = pos(ch, used); used.add(l.idx); return l; });
    await page.mouse.move(path[0].x, path[0].y);
    await page.mouse.down();
    if (onLetter) await onLetter(0, path);
    for (let i = 1; i < path.length; i += 1) {
      const a = path[i - 1]; const b = path[i];
      for (let s = 1; s <= 6; s += 1) await page.mouse.move(a.x + (b.x - a.x) * s / 6, a.y + (b.y - a.y) * s / 6);
      if (onLetter) await onLetter(i, path);
    }
    if (!hold) { await page.mouse.up(); await page.waitForTimeout(700); }
    return path;
  }
  for (const w of ['НАРОД', 'ИРОД', 'ИОНА', 'ДАР']) await swipe(w);
  await page.waitForTimeout(1600); // сообщение «Отлично!» гаснет
  const cells = () => page.evaluate(() => [...document.querySelectorAll('.wow-cell')].map((c) => { const r = c.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height, letter: c.textContent.trim(), solved: c.classList.contains('solved') }; }));
  const words = { wheel, base: await cells() };
  await page.screenshot({ path: raw('words-base') });
  words.stars = await rectOf(page, '.wow-stars');
  words.preview = await rectOf(page, '#wow-preview');
  words.wheelBox = await rectOf(page, '#wow-wheel');
  words.title = await rectOf(page, '#wow-title');
  words.lineColor = await page.evaluate(() => (getComputedStyle(document.getElementById('wow-wheel')).getPropertyValue('--wow-accent') || '#DBEAFE').trim());
  await hideStyle(page, '.wow-btn-let { visibility: hidden !important; }');
  await page.screenshot({ path: raw('words-noletters') });
  await clearHide(page);
  // Буквы круга — спрайтами: обычная и нажатая.
  for (const l of wheel) {
    const sel = `.wow-btn-let[data-idx="${l.idx}"]`;
    words[`letter${l.idx}`] = await sprite(page, sel, raw(`words-letter-${l.idx}`), 30);
    await page.evaluate((s) => document.querySelector(s).classList.add('active'), sel);
    await sprite(page, sel, raw(`words-letter-${l.idx}-on`), 30);
    await page.evaluate((s) => document.querySelector(s).classList.remove('active'), sel);
  }
  // ИОРДАН — жест с остановкой на каждой букве: строка набора растёт.
  words.drag = [];
  const pathLetters = await swipe('ИОРДАН', {
    hold: true,
    onLetter: async (i) => {
      await page.waitForTimeout(120);
      // Строка набора — вырезкой с экрана, а не отдельным элементом: она
      // полупрозрачная, и без фона под ней проступила бы подсказка «Проведите по буквам».
      const box = await rectOf(page, '#wow-preview');
      words.drag.push({ i, previewBox: box });
      await page.screenshot({ path: raw(`words-preview-${i}`), clip: { x: box.x - 6, y: box.y - 6, width: box.w + 12, height: box.h + 12 } });
    },
  });
  words.path = pathLetters.map((l) => l.idx);
  await page.screenshot({ path: raw('words-dragging') });
  // Последнее слово уровня: таймеры замораживаются, чтобы застать «Уровень пройден!»
  // до перехода на следующий уровень.
  await page.evaluate(() => { const orig = window.setTimeout; window.setTimeout = (fn, d, ...a) => (window.__adFreeze ? 0 : orig(fn, d, ...a)); window.__adFreeze = true; });
  await page.mouse.up();
  await page.waitForTimeout(700);
  words.final = await cells();
  words.message = await rectOf(page, '#wow-bonus-msg');
  words.messageText = await page.evaluate(() => document.getElementById('wow-bonus-msg')?.textContent);
  words.starsText = await page.evaluate(() => document.getElementById('wow-score')?.textContent);
  await page.screenshot({ path: raw('words-final') });
  await sprite(page, '#wow-bonus-msg', raw('words-message'), 20);
  await sprite(page, '.wow-stars', raw('words-stars-final'), 14);
  layout.words = words;
  if (errors.length) failures.push(`слова: ${errors.join(' | ')}`);
  await context.close();
  console.log(`слова сняты: ${words.messageText}, ⭐${words.starsText}`);
}


// ——— «Квартет»: лобби и партия на настоящем движке сервера ———
if (want('quartet')) {
  const engine = await import(path.join(ROOT, 'cloudflare/quartet-worker/src/engine.js'));
  const ROOM = '7QXM2A';
  const NOW = Date.now() - 60_000; // таймер хода отсчитывает от настоящих часов браузера
  const players = [
    { playerId: 'p-me', name: 'Илья' },
    { playerId: 'p-maria', name: 'Мария' },
    { playerId: 'p-pavel', name: 'Павел' },
    { playerId: 'p-lidia', name: 'Лидия' },
  ];
  let room = engine.createRoomState(ROOM, players[0], NOW);
  // Комнату слушают два сокета — сама игра и чат партии; состояние получают оба.
  const sockets = new Set();
  const connected = new Set(['p-me']);
  const push = () => { const text = JSON.stringify({ type: 'state', state: engine.buildView(room, 'p-me', connected) }); for (const ws of sockets) { try { ws.send(text); } catch { sockets.delete(ws); } } };
  let seed = 7;
  const rng = (n) => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % n; };
  const backend = 'https://alias-spy-games-quartet.vitaledanilov.workers.dev';
  const { page, context, errors } = await openApp(browser, srv.url, {
    scale: SCALE,
    extraRoutes: async (pg, ctx) => {
      await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: srv.url });
      await pg.route(`${backend}/**`, async (route) => {
        const url = new URL(route.request().url());
        if (url.pathname === '/rooms' && route.request().method() === 'POST') return route.fulfill({ json: { ok: true, roomId: ROOM, sessionToken: 'tok-me' } });
        return route.fulfill({ json: { ok: true, roomId: ROOM, sessionToken: 'tok-me' } });
      });
      await pg.routeWebSocket(/\/rooms\/.+\/ws/, (ws) => {
        sockets.add(ws);
        ws.onClose(() => sockets.delete(ws));
        ws.onMessage((text) => {
          const msg = JSON.parse(String(text));
          if (msg.type !== 'action') return;
          if (msg.action === 'startGame') {
            engine.startGame(room, 'p-me', Date.now(), rng);
            arrangeHands(room);
          }
          if (msg.action === 'askCard') engine.askCard(room, 'p-me', msg.payload.targetId, msg.payload.cardId, Date.now());
          push();
        });
        setTimeout(push, 50);
      });
    },
  });
  // Раздача та же, что делает сервер, — только три апостола у игрока, а
  // Андрей у Марии: обмен картами между руками, число карт у всех прежнее.
  function arrangeHands(state) {
    const owner = (card) => state.players.find((p) => p.hand.includes(card));
    const swap = (card, to) => {
      const from = owner(card);
      if (from === to) return;
      const back = to.hand.find((c) => !c.startsWith('apostles_') && !(from.playerId === 'p-me' && false));
      to.hand.splice(to.hand.indexOf(back), 1, card);
      from.hand.splice(from.hand.indexOf(card), 1, back);
    };
    const me = state.players[0];
    const maria = state.players[1];
    for (const c of ['apostles_peter', 'apostles_john', 'apostles_james']) swap(c, me);
    swap('apostles_andrew', maria);
    state.turnPlayerId = 'p-me';
  }
  const q = {};
  // Лобби снимается во всю высоту страницы: с четырьмя игроками кнопка «Начать игру» уходит за нижний край экрана.
  const shot = async (name) => { await page.waitForTimeout(450); await page.screenshot({ path: raw(`quartet-${name}`), fullPage: name.startsWith('lobby') }); };
  await page.evaluate(() => { window.showGame('quartet'); });
  await page.waitForSelector('[data-action="create"]', { timeout: 20_000 });
  await page.waitForTimeout(800);
  await shot('home');
  q.createButton = await rectOf(page, '[data-action="create"]');
  await page.click('[data-action="create"]');
  await page.waitForSelector('.qv2-room-code', { timeout: 10_000 });
  await shot('lobby-1');
  q.lobby = {
    code: await rectOf(page, '.qv2-room-code'),
    copy: await rectOf(page, '[data-action="copy-room"]'),
  };
  await sprite(page, '[data-action="copy-room"]', raw('quartet-copy-btn'), 16);
  await page.click('[data-action="copy-room"]');
  await page.waitForTimeout(350);
  q.toast = await rectOf(page, '.qv2-toast');
  q.toastText = await page.evaluate(() => document.querySelector('.qv2-toast')?.textContent);
  await shot('lobby-copied');
  await sprite(page, '.qv2-toast', raw('quartet-toast'), 20);
  await page.waitForTimeout(2800);
  // Тосты «… вошёл в комнату» не снимаются: приложение не склоняет глагол по имени
  // («Мария вошёл»), а в рекламе это читалось бы как опечатка.
  await hideStyle(page, '.qv2-toast { visibility: hidden !important; }');
  for (let i = 1; i < players.length; i += 1) {
    engine.joinRoom(room, players[i], NOW + i * 5000);
    connected.add(players[i].playerId);
    push();
    await shot(`lobby-${i + 1}`);
  }
  q.lobby.rows = await page.evaluate(() => [...document.querySelectorAll('.qv2-player-row')].map((e) => { const b = e.getBoundingClientRect(); return { x: b.left, y: b.top, w: b.width, h: b.height }; }));
  q.lobby.start = await rectOf(page, '[data-action="start-game"]');
  q.lobby.meta = await page.evaluate(() => document.querySelector('.qv2-section-meta')?.textContent);
  await sprite(page, '[data-action="start-game"]', raw('quartet-start-btn'), 16);
  await clearHide(page);
  await page.click('[data-action="start-game"]');
  await page.waitForSelector('.qv2-game', { timeout: 10_000 });
  // Одна прокрутка на всю партию: сверху квартет «Апостолы», снизу панель хода.
  const frameView = () => page.evaluate(() => {
    const g = document.getElementById('qv2-group-apostles');
    if (!g) return;
    g.scrollIntoView({ block: 'start' });
    const sc = document.scrollingElement; sc.scrollTop -= 12;
  });
  await frameView();
  await page.waitForTimeout(200);
  q.noticeStart = await page.evaluate(() => document.querySelector('.qv2-turn-notice')?.textContent?.replace(/\s+/g, ' ').trim());
  q.noticeStartRect = await rectOf(page, '.qv2-turn-notice');
  await shot('game-start');
  await sprite(page, '.qv2-turn-notice', raw('quartet-notice-start'), 24);
  await page.waitForTimeout(2600);
  await frameView();
  await shot('game-idle');
  const visible = (sel) => page.locator(sel).locator('visible=true').last();
  const rectOfVisible = async (sel) => { const b = await visible(sel).boundingBox(); return b && { x: b.x, y: b.y, w: b.width, h: b.height }; };
  const maria = '[data-action="select-target"][data-player-id="p-maria"]';
  q.game = { maria: await rectOfVisible(maria), apostles: await rectOf(page, '#qv2-group-apostles'), noticeStart: q.noticeStartRect };
  await visible(maria).click();
  await frameView();
  await shot('game-target');
  const andrew = '[data-action="select-card"][data-card-id="apostles_andrew"]';
  q.game.andrew = await rectOfVisible(andrew);
  q.game.andrewArt = await rectOfVisible(`${andrew} .qv3-card-art`);
  q.game.jamesArt = await rectOfVisible('#qv2-group-apostles .qv2-playing-card.is-owned:nth-child(3) .qv3-card-art');
  await visible(andrew).click();
  await frameView();
  await shot('game-card');
  q.game.ask = await rectOfVisible('[data-qv43="confirm"]');
  await visible('[data-qv43="confirm"]').click();
  await page.waitForTimeout(150);
  // Итог хода: «Твоя рука» с кубком «Апостолы» сверху. Строка события выше
  // («… у Мария») остаётся за краем — имя в ней приложение не склоняет.
  await page.evaluate(() => { const r = document.querySelector('.qv2-hand-section')?.getBoundingClientRect(); if (r) document.scrollingElement.scrollTop += r.top - 14; });
  await page.waitForTimeout(120);
  q.noticeAsk = await page.evaluate(() => document.querySelector('.qv2-turn-notice')?.textContent?.replace(/\s+/g, ' ').trim());
  q.game.notice = await rectOf(page, '.qv2-turn-notice');
  q.game.trophy = await rectOf(page, '.qv2-trophy');
  await sprite(page, '.qv2-turn-notice', raw('quartet-notice'), 24);
  // экран итога — без уведомления: в ролике оно всплывает поверх отдельным слоем
  await hideStyle(page, '.qv2-turn-notice { visibility: hidden !important; }');
  await page.screenshot({ path: raw('quartet-game-success') });
  await clearHide(page);
  layout.quartet = q;
  if (errors.length) failures.push(`квартет: ${errors.join(' | ')}`);
  await context.close();
  console.log(`квартет снят: ${q.toastText} · ${q.noticeStart} · ${q.noticeAsk}`);
}

// ——— «Библейские сокровища»: уровень 1 «Первый свет» ———
if (want('treasures')) {
  const { page, context, errors } = await openApp(browser, srv.url, { scale: SCALE });
  await page.evaluate(() => { try { localStorage.setItem('bmt_tutorial_seen', '1'); } catch {} });
  await page.evaluate(() => document.getElementById('biblical-match-three-card')?.scrollIntoView({ block: 'center' }));
  await page.click('#biblical-match-three-card');
  await page.waitForSelector('.bmt-v13-menu', { timeout: 30_000 });
  await page.waitForTimeout(900);
  await page.screenshot({ path: raw('treasures-menu') });
  await page.locator('.bmt-v13-chapter.is-active .bmt-v13-level:not([disabled]),.bmt-v13-chapter.is-active .bmt-journey-node:not([disabled]),.bmt-v13-level:not([disabled])').first().click();
  await page.waitForSelector('.bmt-prelevel', { state: 'visible', timeout: 8000 });
  await page.waitForTimeout(400);
  await page.screenshot({ path: raw('treasures-prelevel') });
  await page.getByRole('button', { name: /Начать уровень/ }).click();
  await page.waitForSelector('.bmt-board .bmt-tile', { timeout: 10_000 });
  // Обучение первого запуска — «Пропустить», как сделал бы игрок.
  for (const sel of ['.bmt-tutorial [data-skip]', '.bmt-v22-tutorial-skip']) {
    await page.waitForSelector(sel, { timeout: 4000 }).catch(() => null);
    await page.evaluate((s) => document.querySelector(s)?.click(), sel);
    await page.waitForTimeout(500);
  }
  await page.waitForFunction(() => !document.querySelector('.bmt-tutorial, .bmt-v22-tutorial-skip'), null, { timeout: 5000 });
  await page.waitForFunction(() => [...document.querySelectorAll('.bmt-piece')].every((img) => !img.getAttribute('src') || (img.complete && img.naturalWidth > 0)), null, { timeout: 10_000 });
  await page.waitForTimeout(1500);
  const t = {};
  t.board = await rectOf(page, '.bmt-board');
  t.rows = await page.evaluate(() => +document.querySelector('.bmt-board').dataset.rows);
  t.cols = await page.evaluate(() => +document.querySelector('.bmt-board').dataset.cols);
  t.tiles = await page.evaluate(() => [...document.querySelectorAll('.bmt-board .bmt-tile')].map((tile) => {
    const b = tile.getBoundingClientRect(); const img = tile.querySelector('.bmt-piece'); const p = img?.getBoundingClientRect();
    return { index: +tile.dataset.index, x: b.left, y: b.top, w: b.width, h: b.height, art: (img?.getAttribute('src') || '').split('/').pop().split('?')[0], alt: img?.alt || '', piece: p ? { x: p.left, y: p.top, w: p.width, h: p.height } : null };
  }));
  t.stats = await rectOf(page, '.bmt-stats-v2');
  t.goals = await rectOf(page, '#bmt-goals');
  t.goalTexts = await page.evaluate(() => [...document.querySelectorAll('.bmt-goal')].map((g) => g.textContent.replace(/\s+/g, ' ').trim()));
  t.moves = await page.evaluate(() => document.getElementById('bmt-moves')?.textContent);
  await page.screenshot({ path: raw('treasures-level') });
  await hideStyle(page, 'html body .bmt-board .bmt-tile .bmt-piece-wrap, html body .bmt-board .bmt-tile .bmt-piece { display: none !important; }');
  await page.screenshot({ path: raw('treasures-empty') });
  await clearHide(page);
  // Числа после хода — по формуле игры: 3 фишки × 34 = 102 очка, каскад ×2 даёт ещё 102 × 1,55 = 158.
  const hudState = async (name, { score, moves, cascade, bible }) => {
    await page.evaluate(({ score, moves, cascade, bible }) => {
      document.getElementById('bmt-score').textContent = String(score);
      document.getElementById('bmt-moves').textContent = String(moves);
      document.getElementById('bmt-cascade').textContent = `×${cascade}`;
      for (const g of document.querySelectorAll('.bmt-goal')) {
        const strong = g.querySelector('strong'); const text = g.textContent;
        if (/Библия/.test(text)) strong.textContent = `${bible}/8`;
        else if (/очк/.test(text)) strong.textContent = `${score}/1200`;
      }
    }, { score, moves, cascade, bible });
    const top = Math.min(t.stats.y, t.goals.y) - 8; const bottom = Math.max(t.stats.y + t.stats.h, t.goals.y + t.goals.h) + 8;
    await page.screenshot({ path: raw(`treasures-hud-${name}`), clip: { x: 0, y: top, width: 390, height: bottom - top } });
    return { y: top, h: bottom - top };
  };
  t.hud = await hudState('a', { score: 0, moves: 24, cascade: 1, bible: 0 });
  await hudState('b', { score: 102, moves: 23, cascade: 1, bible: 3 });
  await hudState('c', { score: 260, moves: 23, cascade: 2, bible: 6 });
  // Надпись каскада игры (.bmt-fx-float) ролик повторяет её же стилями — снимать
  // её отдельно нельзя: у фишек видимость закреплена !important и лезет в кадр.
  t.floatStyle = await page.evaluate(() => {
    window.BiblicalMatchThreeEffects.floatText(20, 'КАСКАД ×2', 'gold');
    const cs = getComputedStyle(document.querySelector('.bmt-fx-float'));
    return { color: cs.color, fontSize: cs.fontSize, fontWeight: cs.fontWeight, letterSpacing: cs.letterSpacing, textShadow: cs.textShadow, fontFamily: cs.fontFamily };
  });
  layout.treasures = t;
  if (errors.length) failures.push(`сокровища: ${errors.join(' | ')}`);
  await context.close();
  console.log(`сокровища сняты: ${t.rows}×${t.cols}, ходы ${t.moves}, цели ${t.goalTexts.join(' · ')}`);
}

fs.writeFileSync(layoutFile, JSON.stringify(layout, null, 1));
// Для страницы ролика: с file:// она читает только скрипты, не JSON.
fs.writeFileSync(path.join(SHOTS, 'layout.js'), `window.LAYOUT = ${JSON.stringify(layout)};\n`);
await browser.close();
await srv.close();

// PNG → WebP: спрайты с альфой, экраны без неё.
const pngs = fs.readdirSync(RAW).filter((f) => f.endsWith('.png'));
execFileSync('python3', ['-c', `
import sys, os
from PIL import Image
raw, out, names = sys.argv[1], sys.argv[2], sys.argv[3:]
for n in names:
    im = Image.open(os.path.join(raw, n))
    dst = os.path.join(out, n[:-4] + '.webp')
    # проверка проекта не пускает картинки больше 600 КиБ — длинную ленту меню пережимаем
    for q in (90, 86, 82, 78, 74):
        im.save(dst, 'WEBP', quality=q, method=6)
        if os.path.getsize(dst) <= 600 * 1024:
            break
`, RAW, SHOTS, ...pngs]);
if (failures.length) { console.error(failures.join('\n')); process.exit(1); }
console.log(`готово: ${pngs.length} файлов в promo/ad/shots`);
