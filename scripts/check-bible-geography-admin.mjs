import assert from 'node:assert/strict';
import fs from 'node:fs';
import { JSDOM } from 'jsdom';

const title = 'Библейская география';
const source = (name) => fs.readFileSync(`web/js/${name}.js`, 'utf8');
const waitFor = async (check) => {
  const deadline = Date.now() + 2500;
  while (!check()) {
    assert.ok(Date.now() < deadline, 'Timed out waiting for presence/admin update');
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
};
function fixture() {
  const dom = new JSDOM('<!doctype html><head><meta name="app-core-backend" content="https://core.test"><meta name="app-observability" content="https://presence.test"></head><body><section class="admin-v2"></section></body>', {
    url: 'https://app.test/', runScripts: 'outside-only', pretendToBeVisual: true,
  });
  const w = dom.window;
  w.Headers = Headers;
  w.Telegram = { WebApp: { initData: 'signed_test_data', initDataUnsafe: { user: { id: 55555, username: 'geography_tester' } } } };
  return dom;
}

// Run the real presence modules with a simulated authenticated socket.
const presence = fixture();
const w = presence.window;
const messages = [];
class FakeWebSocket extends w.EventTarget {
  static OPEN = 1;
  constructor() {
    super();
    this.readyState = 0;
    w.setTimeout(() => { this.readyState = 1; this.dispatchEvent(new w.Event('open')); }, 0);
  }
  send(value) { messages.push(JSON.parse(value)); }
  close() { this.readyState = 3; }
}
w.WebSocket = FakeWebSocket;
w.fetch = async () => new Response(JSON.stringify({ ok: true, token: 'test_presence_token', scope: 'presence', expiresAt: Date.now() + 900_000 }));
w.showGame = (game) => { w.document.body.dataset.mode = 'game'; w.document.body.dataset.currentGame = game; };
w.goToMainMenu = () => { delete w.document.body.dataset.currentGame; w.document.body.dataset.mode = 'home'; };
w.appGoToMainMenu = w.goToMainMenu;
try {
  w.eval(source('presence-identity'));
  w.eval(source('presence-game-bridge'));
  await waitFor(() => messages.some((m) => m.type === 'presence'));
  w.showGame('bible-geography');
  await waitFor(() => messages.some((m) => m.type === 'presence' && m.game === 'bible-geography'));
  assert.equal(messages.filter((m) => m.type === 'presence').at(-1).roomId, '');
  w.goToMainMenu();
  await waitFor(() => messages.filter((m) => m.type === 'presence').at(-1)?.game === '');
  assert.equal(w.AppPresenceContext.snapshot().game, '');
} finally { w.dispatchEvent(new w.Event('pagehide')); presence.window.close(); }

// Both admin panels must identify the player, then show their return to the menu.
for (const variant of ['admin-live-v3', 'admin-live-rescue']) {
  const dom = fixture();
  const a = dom.window;
  let game = 'bible-geography';
  a.fetch = async (url, options) => {
    if (url.endsWith('/web/session')) return new Response(JSON.stringify({ ok: true, token: 'test_admin_token', expiresAt: Date.now() + 900_000 }));
    assert.equal(new Headers(options.headers).get('Authorization'), 'Bearer test_admin_token');
    if (url.endsWith('/admin/stats')) return new Response(JSON.stringify({ ok: true }));
    assert.ok(url.endsWith('/admin/live'));
    return new Response(JSON.stringify({
      ok: true, onlineNow: 1, menuNow: game ? 0 : 1, activeRoomsNow: 0,
      currentGames: game ? { [game]: 1 } : {}, generatedAt: Date.now(),
      onlineUsers: [{ id: '55555', username: 'geography_tester', game, platform: 'telegram', roomId: '' }],
    }));
  };
  const panelId = variant === 'admin-live-v3' ? 'admin-live-v3' : 'admin-live-rescue';
  const doc = a.document;
  const card = () => [...doc.querySelectorAll('.admin-live-v3__game')].find((node) => node.querySelector('span')?.textContent === title);
  try {
    a.eval(source(variant));
    await waitFor(() => doc.querySelector(`#${panelId} .admin-live-v3__person`)?.textContent.includes(title));
    const person = doc.querySelector(`#${panelId} .admin-live-v3__person`);
    assert.ok(person.textContent.includes('@geography_tester'));
    assert.ok(person.textContent.includes('ID 55555'));
    assert.equal(person.querySelector('[data-observe-room]'), null);
    if (variant === 'admin-live-v3') {
      assert.equal(card().querySelector('b').textContent, '1');
      assert.ok(card().classList.contains('is-active'));
    }
    game = '';
    doc.querySelector(variant === 'admin-live-v3' ? '[data-live-refresh]' : '[data-rescue-refresh]').click();
    await waitFor(() => doc.querySelector(`#${panelId} .admin-live-v3__person`)?.textContent.includes('Главное меню'));
    assert.ok(doc.querySelector(`#${panelId} .admin-live-v3__person`).textContent.includes('@geography_tester'));
    if (variant === 'admin-live-v3') {
      assert.equal(card().querySelector('b').textContent, '0');
      assert.ok(!card().classList.contains('is-active'));
    }
  } finally { a.dispatchEvent(new a.Event('pagehide')); dom.window.close(); }
}
console.log('Bible Geography: authenticated presence, both admin player lists, live counter and menu return OK');
