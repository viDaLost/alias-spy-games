// DOM interaction regression suite; the separate browser suite checks actual layout.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { JSDOM } from 'jsdom';

function harness() {
  const dom = new JSDOM('<div id="game-container"></div>', { url: 'https://example.test/', runScripts: 'outside-only' });
  const w = dom.window;
  const pending = new Map(); let seq = 0;
  w.setTimeout = fn => { pending.set(++seq, fn); return seq; };
  w.clearTimeout = id => pending.delete(id);
  w.matchMedia = () => ({ matches: true });
  w.HTMLElement.prototype.scrollIntoView = () => {};
  for (const part of ['rules','engine','bots','map']) w.eval(fs.readFileSync(`web/games/kingdoms-${part}.js`, 'utf8'));
  w.eval(fs.readFileSync('web/games/kingdoms.js', 'utf8'));
  const root = w.document.getElementById('game-container');
  const board = new w.KingdomsUI.Board(root);
  const drain = () => { const entry = pending.entries().next().value; if (entry) { pending.delete(entry[0]); entry[1](); } };
  return { dom, w, root, board, drain };
}

/** Тайная цель: карточка с двумя целями приходит сама — берём первую. */
function pickObjective(root) {
  const pick = root.querySelector('[data-objective-pick]');
  if (pick) pick.click();
}

/** Ход человека нажатиями, как на экране: жетон, затем места на карте или жетон на карте. */
function placeViaUI(w, root, board, choice) {
  root.querySelector(`[data-order="${choice.kind}"]`).click();
  if (choice.target) board.tapToken(choice.target);
  else if (choice.area && choice.to) { board.tapArea(choice.area); board.tapArea(choice.to); }
  else if (choice.area) board.tapArea(choice.area);
  else board.tapArea(choice.to);
  assert.equal(board.pendingReady(), true, `cannot place ${JSON.stringify(choice)} → ${JSON.stringify(board.pending)}`);
  root.querySelector('[data-confirm-ok]').click();
}

/** Расстановка: человек нажимает свободную область и подтверждает, соперники ходят по таймеру. */
function playSetup(w, root, board, drain) {
  let guard = 0;
  while (board.state.phase === 'setup' && guard++ < 200) {
    pickObjective(root);
    if (board.view.turn === board.you) {
      const free = [...root.querySelectorAll('[data-area].is-eligible')][0];
      assert.ok(free, 'на расстановке не подсвечено ни одной свободной области');
      board.tapArea(free.dataset.area);
      assert.equal(root.querySelector('[data-confirm]').hidden, false, 'нет подтверждения жетона контроля');
      root.querySelector('[data-confirm-ok]').click();
    } else drain();
  }
  pickObjective(root);
}

for (const n of [2,3,4,5]) {
  const { dom, w, root, board, drain } = harness();
  board.setup(); board.begin(n);
  assert.equal(root.querySelectorAll('[data-area]').length, 24);
  assert.equal(root.querySelectorAll('.kd-area-art').length, 24);
  assert.equal(root.querySelectorAll('.kd-area-fill').length, 24);
  assert.equal(root.querySelectorAll('circle.kd-area-fill').length, 0);
  assert.ok([...root.querySelectorAll('.kd-area-art')].every(image => image.getAttribute('href').includes('/map-v3/')));
  for (const image of root.querySelectorAll('image,img')) {
    const src = image.getAttribute('href') || image.getAttribute('src');
    if (src) {
      assert.ok(fs.existsSync(src), `missing asset ${src}`);
      assert.equal(fs.readFileSync(src).subarray(8,12).toString(), 'WEBP');
    }
  }
  assert.equal(board.state.phase, 'setup', 'партия должна начаться с расстановки');
  playSetup(w, root, board, drain);
  assert.equal(board.state.phase, 'planning');
  assert.ok(board.state.players[0].objectiveId, 'тайная цель человека не выбрана');
  // Persist a real confirmed order, then reconstruct the board from storage.
  let guard = 0;
  while (board.view.turn !== board.you && guard++ < 50) drain();
  board.state.players[0].hand[0] = 'march3';
  board.afterLocalChange();
  board.selectOrder('march3');
  const attack = board.legalPlacements('march3').find(p => p.area && p.to);
  assert.ok(attack, 'у войска нет ни одной законной атаки');
  board.tapArea(attack.area);
  assert.match(root.querySelector('[data-confirm-text]').textContent, /оборона \+3/, 'нажатие своей области не предложило оборону');
  board.tapArea(attack.to);
  assert.equal(root.querySelector('[data-confirm]').hidden, false);
  assert.match(root.querySelector('[data-confirm-text]').textContent, /Ваша сила на эту область 3/);
  root.querySelector('[data-confirm-ok]').click();
  const restored = board.loadCampaign();
  assert.equal(restored.orders.find(o => o.owner === 0).kind, 'march3');
  board.resumeCampaign(restored);
  assert.ok(board.state.orders.some(o => o.owner === 0 && o.kind === 'march3'));
  const kinds = new Set();
  let turns = 0;
  while (board.state.status !== 'over' && turns++ < 400) {
    if (board.state.phase === 'results') {
      assert.ok(root.querySelector('[data-next]'));
      root.querySelector('[data-next]').click();
    } else if (board.state.phase === 'planning' && board.view.turn === board.you) {
      const choice = w.KingdomsBots.pick(board.state, board.you);
      if (!choice) {
        root.querySelector('[data-pass]').click();
        root.querySelector('[data-pass-ok]').click();
      } else {
        kinds.add(w.KingdomsRules.familyOf(choice.kind));
        placeViaUI(w, root, board, choice);
      }
    } else drain();
  }
  assert.equal(board.state.round, 5);
  assert.equal(board.state.status, 'over');
  assert.ok(kinds.has('army'), 'за партию человек ни разу не поставил войско через экран');
  root.querySelector('[data-next]').click();
  assert.equal(root.querySelectorAll('.kd-final-row').length, n);
  assert.ok(root.querySelector('.is-winner'));
  const final = board.loadCampaign();
  board.resumeCampaign(final);
  assert.equal(root.querySelectorAll('.kd-final-row').length, n);
  dom.window.close();
}

{
  const { dom, w, root, board, drain } = harness();
  board.begin(2);
  playSetup(w, root, board, drain);
  let guard = 0;
  while (board.view.turn !== board.you && guard++ < 50) drain();
  const placed = board.state.orders.length;
  root.querySelector('[data-pass]').click();
  root.querySelector('[data-pass-ok]').click();
  assert.equal(board.state.orders.length, placed);
  assert.notEqual(board.view.turn, board.you);
  w.localStorage.setItem('kd_campaign_v4', '{broken');
  assert.equal(board.loadCampaign(), null);
  // A spectator sees results even when the server skips the transient reveal phase.
  const state = w.KingdomsEngine.createGame({kingdomIds: w.KingdomsRules.STARTING_LAYOUTS[2], random: () => 0.1});
  while (state.phase === 'setup') w.KingdomsEngine.skipTurn(state, w.KingdomsEngine.currentTurn(state));
  assert.equal(w.KingdomsEngine.currentTurn(state), 0);
  state.players[0].hand[0] = 'march3';
  const capital = w.KingdomsRules.capitalOf(state.players[0].kingdomId);
  const target = w.KingdomsRules.neighborsOf(capital).find(id => state.areas[id].owner !== 0);
  const online = new w.KingdomsUI.Board(root, { send() {}, isHost: () => true });
  online.applyView(w.KingdomsEngine.visibleStateFor(state, 0));
  online.selectOrder('march3'); online.tapArea(capital);
  online.applyView(w.KingdomsEngine.visibleStateFor(state, 0));
  assert.equal(online.pending.from, capital, 'polling must preserve an unconfirmed order');
  online.tapArea(target);
  assert.equal(online.pendingReady(), true);
  w.KingdomsEngine.skipTurn(state, 0);
  online.applyView(w.KingdomsEngine.visibleStateFor(state, 0));
  assert.equal(online.pending, null, 'timeout must clear stale selection');
  const spectator = new w.KingdomsUI.Board(root, { send() {}, isHost: () => false });
  spectator.applyView(w.KingdomsEngine.visibleStateFor(state, -1));
  assert.equal(root.querySelector('[data-pass]').disabled, true);
  assert.match(root.querySelector('[data-objective]').textContent, /наблюдателя/);
  while (state.phase === 'planning') w.KingdomsEngine.skipTurn(state, w.KingdomsEngine.currentTurn(state));
  w.KingdomsEngine.resolveRound(state);
  spectator.applyView(w.KingdomsEngine.visibleStateFor(state, -1));
  assert.equal(root.querySelector('[data-next]').disabled, true);
  w.KingdomsEngine.nextRound(state);
  spectator.applyView(w.KingdomsEngine.visibleStateFor(state, -1));
  assert.equal(root.querySelectorAll('.kd-sheet').length, 0);
  dom.window.close();
}
{
  // Партии старых правил (v3) не подходят к новым — их не открываем и не падаем.
  const { dom, w, board } = harness();
  w.localStorage.setItem('kd_campaign_v3', JSON.stringify({ version: 3, state: { players: [], areas: {} } }));
  assert.equal(board.loadCampaign(), null, 'старое сохранение не должно открываться в новых правилах');
  dom.window.close();
}
{
  const { dom, w, root, board } = harness();
  board.setup();
  root.querySelector('[data-tutorial]').click();
  assert.equal(root.querySelectorAll('[data-area]').length, 24, 'tutorial must show the actual map');
  assert.equal(root.querySelector('[data-teach-count]').textContent, '1 / 12');
  assert.equal(root.querySelector('.kd-sheet'), null, 'tutorial must not cover the map with a modal');
  for (let step = 2; step <= 11; step += 1) {
    root.querySelector('[data-teach-next]').click();
    assert.equal(root.querySelector('[data-teach-count]').textContent, `${step} / 12`);
    if (step === 6) assert.ok(root.querySelector('[data-token="demo-enemy"]'));
    if (step === 7) assert.equal(board.view.scoutIntel[0].kind, 'march2');
    if (step === 11) {
      const region = w.KingdomsRules.kingdomOf(w.KingdomsRules.STARTING_LAYOUTS[2][0]).region;
      assert.ok(w.KingdomsRules.areasOfRegion(region).every(area => board.view.areas[area.id].owner === 0));
    }
  }
  root.querySelector('[data-teach-back]').click();
  assert.equal(root.querySelector('[data-teach-count]').textContent, '10 / 12');
  root.querySelector('[data-teach-skip]').click();
  assert.ok(root.querySelector('[data-start]'));
  assert.equal(w.localStorage.getItem('kd_tutorial_seen'), '1');
  assert.equal(w.localStorage.getItem('kd_campaign_v4'), null, 'tutorial must not create a campaign');

  board.begin(2);
  const saved = w.localStorage.getItem('kd_campaign_v4');
  const original = board.state;
  root.querySelector('[data-tutorial-open]').click();
  root.querySelector('[data-teach-next]').click();
  root.querySelector('[data-teach-skip]').click();
  assert.equal(board.state, original, 'tutorial must restore the current local game');
  assert.equal(w.localStorage.getItem('kd_campaign_v4'), saved, 'tutorial must not change the save');
  dom.window.close();
}
console.log('OK: illustrated assets, setup by taps with a secret objective, every token placed through the screen, pass, save/resume, 2–5 player campaigns to final results, spectator and online results transitions, tutorial on the new rules.');
