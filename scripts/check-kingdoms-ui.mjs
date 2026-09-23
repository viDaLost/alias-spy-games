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
  // Persist a real confirmed order, then reconstruct the board from storage.
  board.selectOrder('march3'); board.tapArea('primorye-rim'); board.tapArea('primorye-ccw');
  assert.equal(root.querySelector('[data-confirm]').hidden, false);
  assert.match(root.querySelector('[data-confirm-text]').textContent, /Сила 4/);
  root.querySelector('[data-confirm-ok]').click();
  const restored = board.loadCampaign();
  assert.equal(restored.orders[0].kind, 'march3');
  board.resumeCampaign(restored);
  assert.equal(board.state.orders.length, 1);
  let turns = 0;
  while (board.state.status !== 'over' && turns++ < 250) {
    if (board.state.phase === 'results') {
      assert.ok(root.querySelector('[data-next]'));
      root.querySelector('[data-next]').click();
    } else if (board.state.phase === 'planning' && board.view.turn === board.you) {
      const choice = w.KingdomsBots.pick(board.state, board.you);
      if (!choice) {
        root.querySelector('[data-pass]').click();
        root.querySelector('[data-pass-ok]').click();
      } else {
        root.querySelector(`[data-order="${choice.kind}"]`).click();
        if (choice.kind === 'scout') choice.scoutTargets.forEach(id => board.tapToken(id));
        else if (choice.to) { board.tapArea(choice.area); board.tapArea(choice.to); }
        else board.tapArea(choice.area);
        assert.equal(board.pendingReady(), true, `cannot place ${JSON.stringify(choice)}`);
        root.querySelector('[data-confirm-ok]').click();
      }
    } else drain();
  }
  assert.equal(board.state.round, 5);
  assert.equal(board.state.status, 'over');
  root.querySelector('[data-next]').click();
  assert.equal(root.querySelectorAll('.kd-final-row').length, n);
  assert.ok(root.querySelector('.is-winner'));
  const final = board.loadCampaign();
  board.resumeCampaign(final);
  assert.equal(root.querySelectorAll('.kd-final-row').length, n);
  dom.window.close();
}

{
  const { dom, w, root, board } = harness();
  board.begin(2);
  root.querySelector('[data-pass]').click();
  root.querySelector('[data-pass-ok]').click();
  assert.equal(board.state.orders.length, 0);
  assert.equal(board.view.turn, 1);
  w.localStorage.setItem('kd_campaign_v2', '{broken');
  assert.equal(board.loadCampaign(), null);
  // A spectator sees results even when the server skips the transient reveal phase.
  const state = w.KingdomsEngine.createGame({kingdomIds: w.KingdomsRules.STARTING_LAYOUTS[2]});
  const online = new w.KingdomsUI.Board(root, { send() {}, isHost: () => true });
  online.applyView(w.KingdomsEngine.visibleStateFor(state, 0));
  online.selectOrder('march3'); online.tapArea('primorye-rim');
  online.applyView(w.KingdomsEngine.visibleStateFor(state, 0));
  assert.equal(online.pending.from, 'primorye-rim', 'polling must preserve an unconfirmed order');
  online.tapArea('primorye-ccw');
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
console.log('OK: illustrated assets, real order controls, pass, save/resume, 2–5 player campaigns to final results, spectator and online results transitions.');
