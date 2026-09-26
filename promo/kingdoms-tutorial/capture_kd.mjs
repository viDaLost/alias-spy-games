// Съёмка «Царств» для обучающего ролика: настоящая игра, настоящие состояния.
//
// Приложение то же, что открывает Telegram (promo/ad/app-harness.mjs), экран —
// альбомный 1280×720 при плотности 1,5: снимок ровно 1920×1080. Партия не
// играется ботами на время, а собирается движком игры по шагам — так каждый
// кадр ролика стоит в той точке партии, о которой говорит голос:
//
//   Фарсис (вы), Галаад и Кидар; первый раунд после расстановки.
//   Вы:      войско 3 через границу на Пастушьи Склоны и благословение +2 на него,
//            корабли 1 в обороне Рыбацкого Берега, войско 1 на страже Тира,
//            отвлекающий манёвр к Пыльным Пределам; завет мира остаётся в руке.
//   Галаад:  войско 2 в обороне Пастушьих Склонов, войско 3 на Дорогу Караванов,
//            засада в Рамофе, завет мира в Маханаиме, манёвр.
//   Кидар:   войско 2 на Рыбацкий Берег, поджог Красных Дюн, войско 1 в Шатрах,
//            засада 2 на Пограничную Твердыню, манёвр.
//
// Каждый жетон кладёт движок (placeOrder проверяет законность), раунд
// разрешает он же (resolveRound), и исходы, о которых говорит голос,
// проверяются здесь числом: 5 против 3 — область ваша, 2 против 2 — устояла.
//
//   node promo/kingdoms-tutorial/capture_kd.mjs
//   → shots/*.webp и shots/layout.js (прямоугольники маркеров, жетонов, кнопок)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright-core';
import { serve } from '../ad/serve.mjs';
import { openApp } from '../ad/app-harness.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const SHOTS = path.join(HERE, 'shots');
const RAW = path.join(HERE, 'build', 'raw');
const CHROME = process.env.CHROME_BIN || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const W = 1280;
const H = 720;
const SCALE = 1.5;
const TESTER = 5502223852; // «Царства» открыты этому игроку

fs.mkdirSync(SHOTS, { recursive: true });
fs.mkdirSync(RAW, { recursive: true });
const layout = { width: W, height: H, scale: SCALE, shots: {} };
const made = [];
const problems = [];
const need = (ok, text) => { if (!ok) problems.push(text); };

const srv = await serve(ROOT);
const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox', '--force-color-profile=srgb', '--font-render-hinting=none', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const { page, context, errors } = await openApp(browser, srv.url, { scale: SCALE });
await page.setViewportSize({ width: W, height: H });
await page.evaluate((id) => {
  // Качество карты — полное и без подстройки на ходу: программная отрисовка медленна,
  // и подстройка сочла бы её слабым телефоном.
  window.KD3D_QUALITY = 'high';
  window.KD3D_ADAPT = false;
  localStorage.setItem('kd_clan', 'tarsis');
  localStorage.setItem('kd_tutorial_seen', '1');
  localStorage.setItem('kingdoms_view_v1', '3d');
  localStorage.removeItem('kd_campaign_v4');
  window.Telegram.WebApp.initDataUnsafe.user.id = id;
  window.showGame('kingdoms');
}, TESTER);
await page.waitForSelector('[data-start]', { timeout: 30_000 });
await page.waitForTimeout(900);
/*
  Две погрешности экрана игры, найденные при съёмке, в кадре поправлены
  только стилем (сама игра не тронута):
   * бирка силы открытого чужого жетона белая на белом — правило
     .kd-token:not(.is-mine) circle перебивает .kd-token-strength circle;
   * на исполнении «Пропустить анимацию» ложится поверх «Пропустить ход».
*/
await page.addStyleTag({ content: `
  .kd-token:not(.is-mine) .kd-token-strength circle { fill: #14251f; stroke: #fff2d1; stroke-width: 2; }
  [data-skip-reveal] { display: none !important; }` });

// ——— экран выбора: заставка, режимы и пять царств ———
async function save(name, extra = {}) {
  const file = path.join(RAW, `${name}.png`);
  await page.screenshot({ path: file });
  made.push(`${name}.png`);
  layout.shots[name] = { ...(layout.shots[name] || {}), ...extra };
}
const rects = (selectors) => page.evaluate((sels) => {
  const out = {};
  for (const [key, sel] of Object.entries(sels)) {
    const el = document.querySelector(sel);
    if (!el) continue;
    const b = el.getBoundingClientRect();
    out[key] = { x: b.left, y: b.top, w: b.width, h: b.height };
  }
  return out;
}, selectors);

await page.evaluate(() => { document.querySelector('.kd-wrap')?.scrollTo(0, 0); window.scrollTo(0, 0); });
await save('menu-top', { ui: await rects({ hero: '.kd-hero', title: '.kd-hero h2', modes: '.kd-modes', solo: '[data-mode="solo"]', online: '[data-mode="online"]' }) });

// Карточки царств — каждая отдельно, с прозрачным фоном: в ролике они встают веером.
const clans = ['tarsis', 'or', 'yor', 'prestol', 'kedem'];
layout.clans = {};
// Лента царств листается вбок и срезает крайние карточки — на время съёмки она переносится строками.
await page.addStyleTag({ content: '.kd-clan-list { flex-wrap: wrap !important; overflow: visible !important; } .kd-clans { overflow: visible !important; }' });
for (const id of clans) {
  const sel = `[data-clan="${id}"]`;
  await page.evaluate((s) => { document.querySelector(s).scrollIntoView({ block: 'center', inline: 'center' }); }, sel);
  await page.waitForTimeout(250);
  const box = await page.evaluate((s) => {
    const el = document.querySelector(s);
    const b = el.getBoundingClientRect();
    const t = el.querySelector('.kd-clan-token').getBoundingClientRect();
    const a = el.querySelectorAll('.kd-clan-trait')[0].getBoundingClientRect();
    return { x: b.left, y: b.top, w: b.width, h: b.height,
      token: { x: t.left - b.left, y: t.top - b.top, w: t.width, h: t.height },
      ability: { x: a.left - b.left, y: a.top - b.top, w: a.width, h: a.height } };
  }, sel);
  const pad = 0;
  await page.evaluate((s) => {
    const style = document.createElement('style');
    style.id = 'kd-isolate';
    style.textContent = 'html,body{background:transparent!important}html *{visibility:hidden!important}[data-kd-keep],[data-kd-keep] *{visibility:visible!important}';
    document.head.appendChild(style);
    document.querySelector(s).setAttribute('data-kd-keep', '');
  }, sel);
  const file = path.join(RAW, `clan-${id}.png`);
  await page.screenshot({ path: file, omitBackground: true, clip: { x: box.x - pad, y: box.y - pad, width: box.w + pad * 2, height: box.h + pad * 2 } });
  made.push(`clan-${id}.png`);
  await page.evaluate((s) => { document.getElementById('kd-isolate')?.remove(); document.querySelector(s)?.removeAttribute('data-kd-keep'); }, sel);
  layout.clans[id] = { ...box, pad };
}

// node capture_kd.mjs menu — переснять только экран выбора, остальное оставить как есть
if (process.argv[2] === 'menu') {
  const file = path.join(SHOTS, 'layout.js');
  const old = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^window\.KD_LAYOUT = /, '').replace(/;\s*$/, ''));
  old.clans = layout.clans;
  old.shots['menu-top'] = layout.shots['menu-top'];
  Object.assign(layout, old);
  layout.shots = old.shots;
}
// ——— партия: доска поднимается, дальше состояния собирает движок ———
if (process.argv[2] !== 'menu') {
await page.click('[data-count] button[data-value="3"]');
await page.click('[data-start]');
await page.waitForFunction(() => {
  const view = window.KingdomsGame?.board?.view3d;
  return Boolean(view && view.info().frames > 0);
}, null, { timeout: 90_000 });
await page.evaluate(() => { window.KingdomsUI.stopTimers(); document.querySelectorAll('.kd-sheet').forEach((n) => n.remove()); });

await page.evaluate(() => {
  const board = window.KingdomsGame.board;
  const E = window.KingdomsEngine;
  const R = window.KingdomsRules;
  const ME = 0; const YOR = 1; const KEDEM = 2;
  const SETUP_OWNERS = {
    'primorye-cw': ME, 'primorye-ccw': ME, 'pogranichye-hub': ME,
    'dolina-cw': YOR, 'dolina-ccw': YOR, 'nagorye-ccw': YOR,
    'kedem-cw': KEDEM, 'kedem-ccw': KEDEM, 'pogranichye-cw': KEDEM,
  };
  const HANDS = [
    ['march3', 'navy1', 'march1', 'bless2', 'feint', 'peace'],
    ['march2', 'march3', 'ambush1', 'peace', 'feint', 'march1'],
    ['march2', 'raid', 'march1', 'ambush2', 'feint', 'navy1'],
  ];
  // Раунд — по кругу: вы, Галаад, Кидар; пять кругов.
  const PLAN = [
    [ME, { kind: 'march3', area: 'primorye-cw', to: 'nagorye-ccw' }],
    [YOR, { kind: 'march2', area: 'nagorye-ccw' }],
    [KEDEM, { kind: 'march2', area: 'pogranichye-cw', to: 'primorye-ccw' }],
    [ME, { kind: 'navy1', area: 'primorye-ccw' }],
    [YOR, { kind: 'march3', area: 'dolina-cw', to: 'ravnina-ccw' }],
    [KEDEM, { kind: 'raid', area: 'kedem-hub' }],
    [ME, { kind: 'march1', area: 'primorye-rim' }],
    [YOR, { kind: 'ambush1', area: 'dolina-rim' }],
    [KEDEM, { kind: 'march1', area: 'kedem-rim' }],
    [ME, { kind: 'bless2', target: '@0' }],
    [YOR, { kind: 'peace', area: 'dolina-ccw' }],
    [KEDEM, { kind: 'ambush2', area: 'pogranichye-rim' }],
    [ME, { kind: 'feint', area: 'pogranichye-hub', to: 'pogranichye-ccw' }],
    [YOR, { kind: 'feint', area: 'dolina-ccw', to: 'nagorye-cw' }],
    [KEDEM, { kind: 'feint', area: 'kedem-cw', to: 'pogranichye-ccw' }],
  ];

  function fresh() {
    let seed = 20260926;
    const random = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    const s = E.createGame({ kingdomIds: ['tarsis', 'yor', 'kedem'], random,
      players: [{ name: 'Вы' }, { name: 'Галаад', isBot: true }, { name: 'Кидар', isBot: true }] });
    s.players[ME].objectiveChoices = ['coast', 'capital'];
    s.players[YOR].objectiveChoices = ['ford', 'veterans'];
    s.players[KEDEM].objectiveChoices = ['desert', 'territory'];
    s.firstPlayer = ME;
    s.turnOrder = [ME, YOR, KEDEM];
    s.turnPointer = 0;
    return s;
  }
  /** Расстановка: только столицы; ход ваш (или чей скажут). */
  function setupState({ owners = {}, turn = ME, objective = true } = {}) {
    const s = fresh();
    for (const [id, seat] of Object.entries(owners)) { s.areas[id].owner = seat; s.players[seat].setupLeft -= 1; }
    s.turnPointer = s.turnOrder.indexOf(turn);
    for (const p of s.players) p.objectiveId = objective || p.id !== ME ? p.objectiveChoices[0] : null;
    return s;
  }
  /** Первый раунд после расстановки; placed — сколько жетонов плана уже на карте. */
  function roundState(placed = 0, { hands = HANDS } = {}) {
    const s = fresh();
    for (const p of s.players) p.objectiveId = p.objectiveChoices[0];
    for (const [id, seat] of Object.entries(SETUP_OWNERS)) s.areas[id].owner = seat;
    for (const p of s.players) p.setupLeft = 0;
    E.beginRound(s, true);
    s.firstPlayer = ME;
    s.herald = ME;
    s.turnOrder = [ME, YOR, KEDEM];
    s.turnPointer = 0;
    s.log = [];
    s.players.forEach((p, seat) => {
      // в руке ровно те шесть; остальное из них — обратно в запас
      p.supply.push(...p.hand);
      p.hand = [...hands[seat]];
      for (const kind of p.hand) { const at = p.supply.indexOf(kind); if (at >= 0) p.supply.splice(at, 1); }
    });
    const ids = [];
    for (const [seat, step] of PLAN.slice(0, placed)) {
      const placement = { ...step };
      if (placement.target) placement.target = ids[Number(placement.target.slice(1))];
      const order = E.placeOrder(s, seat, placement);
      ids.push(order.id);
    }
    return s;
  }
  function resolved() {
    const s = roundState(PLAN.length);
    const report = E.resolveRound(s);
    return { s, report };
  }

  const clearMarks = () => {
    document.querySelectorAll('.is-demo-focus').forEach((n) => n.classList.remove('is-demo-focus'));
  };
  /*
    Показать состояние так, как его видит игрок you: вид от движка, вся
    перерисовка доски и 3D, ожидание выбора — как если бы жетон был нажат.
  */
  function show(state, { you = ME, pending = null, focus = [], sheets = false } = {}) {
    window.KingdomsUI.stopTimers();
    if (!sheets) document.querySelectorAll('.kd-sheet').forEach((n) => n.remove());
    board.state = state;
    board.you = you;
    board.focusSeat = null;
    board.pending = pending;
    board.objectiveOffered = sheets ? null : board.objectiveOffered;
    board.refresh();
    clearMarks();
    board.renderAll();
    if (!sheets) document.querySelectorAll('.kd-sheet').forEach((n) => n.remove());
    for (const id of focus) document.querySelector(`[data-area="${id}"]`)?.classList.add('is-demo-focus');
    board.view3d?.sync();
  }
  const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
  /*
    Камера — теми же движениями, что у игрока: «Показать всю карту»,
    подлёт к области, «Владения» (вписать области) и приближение «+».
    Приближение ждёт, пока докончится подлёт: оно берёт камеру как есть.
  */
  async function camera(cam = 'fit') {
    const v = board.view3d;
    if (cam === 'fit' || cam.zoom && !cam.areas) v.fit();
    else if (cam.area) v.focusArea(cam.area, cam.scale || 2.4);
    else if (cam.areas) v.fitAreas(cam.areas);
    await settle();
    if (cam.zoom) { v.zoomTo(cam.zoom); await settle(); }
  }
  /** Программная отрисовка идёт медленно: подлёт кончен, когда камера перестала двигаться. */
  async function settle() {
    let last = '';
    let same = 0;
    await sleep(500);
    for (let i = 0; i < 60 && same < 3; i += 1) {
      await sleep(300);
      const now = JSON.stringify(board.view3d.info().camera);
      same = now === last ? same + 1 : 0;
      last = now;
    }
  }
  /** Всё, что ролику нужно знать о кадре: где маркеры, жетоны, кнопки. */
  function measure() {
    const r = (el) => { if (!el) return null; const b = el.getBoundingClientRect(); return b.width || b.height ? { x: b.left, y: b.top, w: b.width, h: b.height } : null; };
    const areas = {}; const points = {};
    for (const a of R.AREAS) {
      const g = document.querySelector(`[data-area="${a.id}"]`);
      const box = r(g?.querySelector('.kd-area-marker'));
      if (box && g.style.display !== 'none') areas[a.id] = box;
      const p = board.view3d?.screenOf(a.id);
      if (p) points[a.id] = p;
    }
    const tokens = {};
    document.querySelectorAll('[data-token]').forEach((n) => {
      const box = r(n);
      if (box && n.style.display !== 'none') tokens[n.dataset.token] = { ...box, kind: n.dataset.kind, from: n.dataset.from, to: n.dataset.to, target: n.dataset.target };
    });
    const ui = {};
    const put = (key, sel) => { const box = r(document.querySelector(sel)); if (box) ui[key] = box; };
    put('hand', '[data-orders]'); put('confirm', '[data-confirm]:not([hidden])'); put('standings', '[data-standings]');
    put('status', '[data-status]'); put('header', '.kd-header'); put('sheet', '.kd-sheet-card'); put('intel', '[data-intel]');
    put('left', '[data-orders-left]');
    document.querySelectorAll('[data-order]:not([hidden]), [data-card]:not([hidden])').forEach((n) => {
      const box = r(n); if (box) ui[`btn:${n.dataset.order || n.dataset.card}`] = box;
    });
    document.querySelectorAll('.kd-sheet [data-objective-pick]').forEach((n, i) => { const box = r(n); if (box) ui[`objective${i}`] = box; });
    document.querySelectorAll('.kd-detail-rows > div').forEach((n, i) => { const box = r(n); if (box) ui[`row${i}`] = box; });
    document.querySelectorAll('.kd-standing').forEach((n, i) => { const box = r(n); if (box) ui[`seat${i}`] = box; });
    const orders = (board.view?.orders || []).map((o) => ({ ...o }));
    return { areas, points, tokens, ui, orders, phase: board.view?.phase, confirm: document.querySelector('[data-confirm]:not([hidden]) [data-confirm-text]')?.textContent || '' };
  }

  window.__kd = { E, R, board, fresh, setupState, roundState, resolved, show, camera, measure, SETUP_OWNERS, PLAN, ME, YOR, KEDEM };
});

// Один кадр: состояние, камера, ожидание, снимок, замеры.
async function frame(name, script, { wait = 1600 } = {}) {
  const info = await page.evaluate(script);
  await page.waitForTimeout(wait);
  const m = await page.evaluate(() => window.__kd.measure());
  await save(name, { ...m, info: info || null });
  return { ...m, info };
}

const WIDE = "{ zoom: 1.32 }";
const CAPITALS = "({ 'primorye-rim': 0, 'dolina-rim': 1, 'kedem-rim': 2 })";

// ——— карта ———
await frame('map-overview', `(() => { const k = window.__kd; k.show(k.roundState(0)); k.board.state.turnPointer = 1; k.show(k.board.state); k.camera('fit'); })()`);
await frame('map-wide', `(() => { const k = window.__kd; k.show(k.board.state); return k.camera(${WIDE}); })()`);
await frame('map-value', `(() => { const k = window.__kd; k.show(k.board.state); return k.camera({ area: 'primorye-hub', scale: 2.2 }); })()`);
await frame('map-capital', `(() => { const k = window.__kd; k.show(k.board.state, { focus: ['primorye-rim'] }); return k.camera({ area: 'primorye-rim', scale: 2.6 }); })()`);
await frame('map-mountains', `(() => { const k = window.__kd; k.show(k.board.state); return k.camera({ area: 'nagorye-hub', scale: 2.1 }); })()`);
await frame('map-desert', `(() => { const k = window.__kd; k.show(k.board.state); return k.camera({ area: 'kedem-hub', scale: 2.1 }); })()`);
await frame('map-border', `(() => { const k = window.__kd; const ids = k.R.areasOfRegion('pogranichye').map((a) => a.id); k.show(k.board.state, { focus: ids }); return k.camera({ areas: ids }); })()`);
await frame('map-ford', `(() => { const k = window.__kd; k.show(k.board.state, { focus: ['pogranichye-hub', 'primorye-hub', 'dolina-hub', 'ravnina-hub'] }); return k.camera(${WIDE}); })()`);

// ——— расстановка и тайная цель ———
await frame('setup-start', `(() => { const k = window.__kd; k.show(k.setupState()); return k.camera(${WIDE}); })()`);
await frame('setup-pick', `(() => { const k = window.__kd;
  k.show(k.setupState({ owners: { 'primorye-cw': 0, 'dolina-cw': 1, 'kedem-cw': 2 } }), { pending: { control: 'primorye-ccw' } }); return k.camera(${WIDE}); })()`);
await frame('setup-objective', `(() => { const k = window.__kd;
  k.show(k.setupState({ owners: { 'primorye-cw': 0, 'dolina-cw': 1, 'kedem-cw': 2 }, objective: false }), { sheets: true }); return k.camera(${WIDE}); })()`, { wait: 2000 });

// ——— раунд ———
await frame('round-start', `(() => { const k = window.__kd; k.show(k.roundState(0)); return k.camera(${WIDE}); })()`);
await frame('round-mid', `(() => { const k = window.__kd; k.show(k.roundState(6)); return k.camera(${WIDE}); })()`);
await frame('round-kept', `(() => { const k = window.__kd; k.show(k.roundState(13)); return k.camera(${WIDE}); })()`);
await frame('round-enemy', `(() => { const k = window.__kd; k.show(k.roundState(6)); return k.camera({ area: 'primorye-ccw', scale: 2.3 }); })()`);

// ——— войско ———
await frame('army-hand', `(() => { const k = window.__kd;
  k.show(k.roundState(0, { hands: [['march1', 'march2', 'march3', 'march4', 'march5', 'feint'], ['march2'], ['march2']] })); return k.camera(${WIDE}); })()`);
await frame('army-pick', `(() => { const k = window.__kd; k.show(k.roundState(0), { pending: { kind: 'march3' } }); return k.camera(${WIDE}); })()`);
await frame('army-target', `(() => { const k = window.__kd;
  k.show(k.roundState(0), { pending: { kind: 'march3', from: 'primorye-cw', area: 'primorye-cw', to: 'nagorye-ccw' } }); return k.camera({ areas: ['primorye-cw', 'nagorye-ccw'], zoom: 3 }); })()`);
await frame('army-placed', `(() => { const k = window.__kd; k.show(k.roundState(1)); return k.camera({ areas: ['primorye-cw', 'nagorye-ccw'], zoom: 3 }); })()`);
await frame('army-defend', `(() => { const k = window.__kd; const s = k.roundState(6);
  k.show(s, { pending: { kind: 'march1', area: 'primorye-rim', to: null } }); return k.camera({ area: 'primorye-rim', scale: 2.2 }); })()`);
await frame('army-border', `(() => { const k = window.__kd; k.show(k.roundState(6), { pending: { kind: 'march1' } }); return k.camera({ areas: ['primorye-cw', 'nagorye-ccw', 'primorye-ccw', 'pogranichye-cw'] }); })()`);

// ——— корабли и засада ———
await frame('navy-pick', `(() => { const k = window.__kd; const s = k.roundState(3); k.show(s, { pending: { kind: 'navy1' } }); return k.camera(${WIDE}); })()`);
await frame('navy-placed', `(() => { const k = window.__kd; k.show(k.roundState(6)); return k.camera({ area: 'primorye-ccw', scale: 2.3 }); })()`);
await frame('ambush-pick', `(() => { const k = window.__kd;
  const s = k.roundState(6, { hands: [['march3', 'navy1', 'ambush1', 'bless2', 'feint', 'peace'], ['march2', 'march3', 'ambush1', 'peace', 'feint', 'march1'], ['march2', 'raid', 'march1', 'ambush2', 'feint', 'navy1']] });
  k.show(s, { pending: { kind: 'ambush1' } }); return k.camera(${WIDE}); })()`);

// ——— благословение ———
await frame('bless-pick', `(() => { const k = window.__kd; k.show(k.roundState(9), { pending: { kind: 'bless2' } }); return k.camera({ areas: ['primorye-cw', 'nagorye-ccw', 'primorye-rim', 'primorye-ccw'] }); })()`);
await frame('bless-placed', `(() => { const k = window.__kd; k.show(k.roundState(12)); return k.camera({ areas: ['primorye-cw', 'nagorye-ccw'], zoom: 3 }); })()`);

// ——— завет мира и поджог ———
await frame('peace-pick', `(() => { const k = window.__kd; const s = k.roundState(12); k.show(s, { pending: { kind: 'peace', area: 'pogranichye-hub', to: null } }); return k.camera(${WIDE}); })()`);
await frame('raid-revealed', `(() => { const k = window.__kd; const s = k.roundState(15); for (const o of s.orders) o.revealed = true; s.phase = 'results';
  k.show(s); return k.camera({ areas: ['kedem-hub', 'kedem-cw', 'kedem-ccw'] }); })()`);
await frame('peace-raid-after', `(() => { const k = window.__kd; const { s } = k.resolved(); k.show(s, { focus: ['dolina-ccw', 'kedem-hub'] }); return k.camera({ areas: ['dolina-ccw', 'kedem-hub'] }); })()`);

// ——— отвлекающий манёвр: вы видите пустышку, соперник — рубашку ———
await frame('feint-mine', `(() => { const k = window.__kd; const s = k.roundState(13); k.show(s); return k.camera({ areas: ['pogranichye-hub', 'pogranichye-ccw'] }); })()`);
await frame('feint-theirs', `(() => { const k = window.__kd; const s = k.roundState(13); k.show(s, { you: 2 }); return k.camera({ areas: ['pogranichye-hub', 'pogranichye-ccw'] }); })()`);

// ——— карты ———
await frame('cards-hand', `(() => { const k = window.__kd; k.show(k.roundState(3)); return k.camera(${WIDE}); })()`);
await frame('cards-scout', `(() => { const k = window.__kd; k.show(k.roundState(3), { pending: { card: 'scout' } }); return k.camera(${WIDE}); })()`);
await frame('cards-intel', `(() => { const k = window.__kd; const s = k.roundState(3);
  const target = s.orders.find((o) => o.owner === 2); k.E.useCard(s, 0, { card: 'scout', target: target.id });
  k.show(s); k.camera({ area: 'primorye-ccw', scale: 2.3 }); return { target: target.id }; })()`);
await frame('cards-prophet', `(() => { const k = window.__kd; const s = k.roundState(3);
  const target = s.orders.find((o) => o.owner === 1); k.show(s, { pending: { card: 'prophet', target: target.id } }); k.camera(${WIDE}); return { target: target.id }; })()`);
await frame('cards-herald', `(() => { const k = window.__kd; const s = k.roundState(3);
  const target = s.orders.find((o) => o.owner === 2); k.show(s, { pending: { card: 'herald', target: target.id } }); k.camera(${WIDE}); return { target: target.id }; })()`);

// ——— раскрытие ———
await frame('reveal-closed', `(() => { const k = window.__kd; const s = k.roundState(15); k.show(s); return k.camera(${WIDE}); })()`);
await frame('reveal-open', `(() => { const k = window.__kd; const s = k.roundState(15); for (const o of s.orders) o.revealed = true; s.phase = 'results'; k.show(s); return k.camera(${WIDE}); })()`);

// ——— сражение: 5 против 3 и ничья 2 против 2 ———
const battle = await page.evaluate(() => {
  const k = window.__kd;
  const { s, report } = k.resolved();
  const line = (id) => report.find((one) => one.area === id);
  return { slopes: line('nagorye-ccw'), shore: line('primorye-ccw'), tyre: line('primorye-rim'), owners: Object.fromEntries(Object.entries(s.areas).map(([id, c]) => [id, [c.owner, c.veterans, c.special]])) };
});
need(battle.slopes?.outcome === 'captured' && battle.slopes.defense.total === 3 && battle.slopes.attackers[0].total === 5 && battle.slopes.newOwner === 0,
  `Пастушьи Склоны: ждали 5 против 3 и захват, вышло ${JSON.stringify(battle.slopes)}`);
need(battle.slopes?.defense.printed === 1 && battle.slopes.defense.tokens === 2, 'Пастушьи Склоны: защита — горы 1 и войско 2');
need(battle.shore?.outcome === 'held' && battle.shore.defense.total === 2 && battle.shore.attackers[0].total === 2,
  `Рыбацкий Берег: ждали ничью 2 против 2, вышло ${JSON.stringify(battle.shore)}`);
need(battle.tyre?.outcome === 'guarded' && battle.owners['primorye-rim'][1] === 1, 'Тир: стража без нападения — жетон контроля');
need(battle.owners['dolina-ccw'][2] === 'peace' && battle.owners['kedem-hub'][2] === 'scorched', 'завет мира и пепелище не встали');
layout.battle = battle;

const REVEALED = `const s = k.roundState(15); for (const o of s.orders) o.revealed = true; s.phase = 'results';`;
await frame('battle-slopes', `(() => { const k = window.__kd; ${REVEALED} k.show(s); return k.camera({ areas: ['primorye-cw', 'nagorye-ccw'], zoom: 3 }); })()`);
await frame('battle-detail', `(() => { const k = window.__kd; ${REVEALED} k.show(s); k.camera({ areas: ['primorye-cw', 'nagorye-ccw'], zoom: 3 }); k.board.openAreaDetail('nagorye-ccw'); })()`);
await frame('battle-won', `(() => { const k = window.__kd; const { s } = k.resolved(); k.show(s, { focus: ['nagorye-ccw'] }); return k.camera({ areas: ['primorye-cw', 'nagorye-ccw'], zoom: 3 }); })()`);
await frame('battle-tie', `(() => { const k = window.__kd; ${REVEALED} k.show(s); return k.camera({ areas: ['primorye-ccw', 'pogranichye-cw'], zoom: 3 }); })()`);
await frame('battle-held', `(() => { const k = window.__kd; const { s } = k.resolved(); k.show(s, { focus: ['primorye-ccw'] }); return k.camera({ areas: ['primorye-ccw', 'pogranichye-cw'], zoom: 3 }); })()`);

// ——— жетон контроля ———
await frame('veteran-map', `(() => { const k = window.__kd; const { s } = k.resolved(); k.show(s, { focus: ['primorye-rim', 'primorye-ccw'] }); return k.camera({ areas: ['primorye-rim', 'primorye-ccw'], zoom: 3 }); })()`);
await frame('veteran-detail', `(() => { const k = window.__kd; const { s } = k.resolved(); k.show(s); k.camera({ areas: ['primorye-rim', 'primorye-ccw'] }); k.board.openAreaDetail('primorye-rim'); })()`);

// ——— регион: Устье Реки ваше — всё Приморье ———
const region = await page.evaluate(() => {
  const k = window.__kd;
  const { s } = k.resolved();
  k.E.nextRound(s);
  s.areas['primorye-hub'].owner = 0;
  s.orders = [];
  s.phase = 'reveal';
  k.E.resolveRound(s);
  window.__regionState = s;
  return { card: s.regionCards.primorye, special: s.areas['primorye-rim'].special, round: s.round };
});
need(region.card === 0 && region.special === 'honor2', `Приморье: ждали награду «Дары моря», вышло ${JSON.stringify(region)}`);
await frame('region', `(() => { const k = window.__kd; const ids = k.R.areasOfRegion('primorye').map((a) => a.id);
  k.show(window.__regionState, { focus: ids }); return k.camera({ areas: ids }); })()`);
await frame('overview-late', `(() => { const k = window.__kd; k.show(window.__regionState); return k.camera(${WIDE}); })()`);

// ——— изгнанник: у вас ни одной области ———
await frame('ronin', `(() => { const k = window.__kd; const s = k.roundState(0);
  for (const id of ['primorye-rim', 'primorye-cw', 'primorye-ccw', 'pogranichye-hub']) s.areas[id].owner = id === 'primorye-rim' ? 2 : 1;
  for (const p of s.players) p.ronin = !Object.values(s.areas).some((c) => c.owner === p.id);
  s.players[0].hand = ['march2', 'march1', 'feint', 'march3', 'ambush1', 'peace'];
  k.show(s, { pending: { kind: 'march2', from: 'primorye-cw' } }); k.camera({ area: 'primorye-cw', scale: 1.6 }); return { ronin: s.players[0].ronin }; })()`);

// ——— итог партии ———
const final = await page.evaluate(() => {
  const k = window.__kd;
  const s = k.fresh();
  const own = {
    0: ['primorye-rim', 'primorye-cw', 'primorye-hub', 'primorye-ccw', 'nagorye-ccw', 'pogranichye-hub'],
    1: ['dolina-rim', 'dolina-cw', 'dolina-hub', 'dolina-ccw', 'ravnina-ccw', 'nagorye-cw'],
    2: ['kedem-rim', 'kedem-cw', 'kedem-ccw', 'pogranichye-cw', 'pogranichye-ccw'],
  };
  for (const [seat, ids] of Object.entries(own)) for (const id of ids) s.areas[id].owner = Number(seat);
  s.areas['primorye-rim'].veterans = 2; s.areas['primorye-ccw'].veterans = 1;
  s.areas['dolina-rim'].veterans = 2; s.areas['kedem-rim'].veterans = 1;
  s.areas['primorye-rim'].special = 'honor2'; s.areas['kedem-hub'].special = 'scorched'; s.areas['dolina-ccw'].special = 'peace';
  s.players[0].objectiveId = 'coast'; s.players[1].objectiveId = 'ford'; s.players[2].objectiveId = 'desert';
  s.round = 5;
  k.E.finishGame(s);
  k.show(s);
  k.board.finish();
  return s.finalScore;
});
await page.waitForTimeout(800);
need(final[0].total > final[1].total && final[0].total > final[2].total, 'итог: вы должны победить');
await save('final', { ui: await rects({ card: '.kd-card', title: '.kd-card h2' }), rows: await page.evaluate(() => [...document.querySelectorAll('.kd-final-row')].map((row) => {
  const b = row.getBoundingClientRect();
  return { x: b.left, y: b.top, w: b.width, h: b.height, bits: [...row.querySelectorAll('.kd-final-bits span')].map((s) => { const q = s.getBoundingClientRect(); return { x: q.left, y: q.top, w: q.width, h: q.height, text: s.textContent }; }) };
})), score: final });

}
need(!errors.length, `ошибки на странице: ${errors.join(' | ')}`);
await context.close();
await browser.close();
await srv.close();

fs.writeFileSync(path.join(SHOTS, 'layout.js'), `window.KD_LAYOUT = ${JSON.stringify(layout)};\n`);
execFileSync('python3', ['-c', `
import sys, os
from PIL import Image
raw, out, names = sys.argv[1], sys.argv[2], sys.argv[3:]
for n in names:
    im = Image.open(os.path.join(raw, n))
    dst = os.path.join(out, n[:-4] + '.webp')
    # проверка проекта не пускает картинки больше 600 КиБ
    for q in (90, 86, 82, 78, 74, 70):
        im.save(dst, 'WEBP', quality=q, method=6)
        if os.path.getsize(dst) <= 600 * 1024:
            break
`, RAW, SHOTS, ...made]);
if (problems.length) { console.error(problems.join('\n')); process.exit(1); }
console.log(`готово: ${made.length} кадров в promo/kingdoms-tutorial/shots`);
