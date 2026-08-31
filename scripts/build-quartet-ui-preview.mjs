import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const output = path.resolve(root, process.argv[2] || '.preview-quartet-ui');
const publicDir = path.join(output, 'public');

const copy = (source, destination) => {
  const from = path.join(root, source);
  const to = path.join(publicDir, destination || source);
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
};

fs.rmSync(output, { recursive: true, force: true });
fs.mkdirSync(publicDir, { recursive: true });

for (const file of [
  'web/games/quartet.js',
  'web/games/quartet-v2.css',
  'web/games/quartet-mobile.css',
  'web/games/quartet-v4-preview.css',
  'web/js/quartet-chat-addon.js',
  'web/js/quartet-v4-preview-addon.js',
  'web/js/room-invite.js',
  'web/js/room-qr-brand.js',
  'web/js/room-qr-scanner.js',
  'web/js/room-qr-addon.js',
  'web/styles/room-invite.css',
  'web/styles/room-qr-brand.css',
  'web/data/quartet_bible.json',
  'web/assets/quartet/card-back-v4.svg',
]) copy(file);

const catalog = JSON.parse(fs.readFileSync(path.join(root, 'web/data/quartet_bible.json'), 'utf8'));
const cards = catalog.quartets.flatMap((quartet) => quartet.cards || []);
for (const card of cards) copy(card.art);

// Preview-only production hardening: selecting a target/card must never recreate the whole hand.
const quartetPath = path.join(publicDir, 'web/games/quartet.js');
let quartetSource = fs.readFileSync(quartetPath, 'utf8');
const oldSelectionHandlers = `  function selectTarget(button) {
    if (!isMyTurn()) return;
    selectedTargetId = String(button.dataset.playerId || '');
    renderState();
    haptic('selection');
  }

  function selectCard(button) {
    if (!isMyTurn()) return;
    const cardId = String(button.dataset.cardId || '');
    if (!cardId) return;
    selectedCardId = selectedCardId === cardId ? '' : cardId;
    const groupId = quartetByCardId.get(cardId)?.id || '';
    renderState();
    if (groupId) requestAnimationFrame(() => focusGroup(groupId));
    haptic('selection');
  }
`;
const newSelectionHandlers = `  function selectTarget(button) {
    if (!isMyTurn()) return;
    selectedTargetId = String(button.dataset.playerId || '');
    updateSelectionUi();
    haptic('selection');
  }

  function selectCard(button) {
    if (!isMyTurn()) return;
    const cardId = String(button.dataset.cardId || '');
    if (!cardId) return;
    selectedCardId = selectedCardId === cardId ? '' : cardId;
    updateSelectionUi();
    haptic('selection');
  }

  function updateSelectionUi() {
    const target = (state?.players || []).find((player) => player.playerId === selectedTargetId);
    const card = cardById.get(selectedCardId);
    const ready = isMyTurn() && !!target && !!card;

    for (const button of ui.root?.querySelectorAll('.qv2-score-player[data-player-id]') || []) {
      const selected = button.dataset.playerId === selectedTargetId;
      button.classList.toggle('is-target', selected);
      button.setAttribute('aria-pressed', String(selected));
      button.querySelector('.qv2-player-target-label')?.remove();
      if (selected) button.insertAdjacentHTML('beforeend', '<div class="qv2-player-target-label">Выбран</div>');
    }

    for (const button of ui.root?.querySelectorAll('button.qv2-playing-card.is-missing') || []) {
      const buttonCardId = String(button.dataset.cardId || '');
      const selected = buttonCardId && buttonCardId === selectedCardId;
      button.classList.toggle('is-selected', selected);
      button.classList.toggle('is-selectable', isMyTurn());
      button.disabled = !isMyTurn();
      button.setAttribute('aria-pressed', String(selected));
      const status = button.querySelector('.qv2-card-status');
      if (status) status.textContent = selected ? 'Выбрана' : 'Нажмите, чтобы выбрать';
    }

    const targetText = ui.root?.querySelector('.qv2-action-target strong');
    if (targetText) targetText.textContent = target?.name || 'Выберите игрока';
    const cardText = ui.root?.querySelector('.qv2-action-card strong');
    if (cardText) cardText.textContent = card?.title || 'Выберите карту';
    const confirm = ui.root?.querySelector('.qv2-confirm-ask');
    if (confirm) {
      confirm.disabled = !ready;
      confirm.textContent = ready ? 'Спросить карту' : 'Сделайте 2 выбора';
    }


    window.dispatchEvent(new CustomEvent('quartetselectionchange', {
      detail: { targetId: selectedTargetId, cardId: selectedCardId },
    }));
  }
`;
if (!quartetSource.includes(oldSelectionHandlers)) {
  throw new Error('Quartet preview selection patch target was not found');
}
quartetSource = quartetSource.replace(oldSelectionHandlers, newSelectionHandlers);
quartetSource = quartetSource.replaceAll('loading="lazy" decoding="async"', 'loading="eager" decoding="async" fetchpriority="high" draggable="false"');
fs.writeFileSync(quartetPath, quartetSource);

const indexHtml = `<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
  <meta name="theme-color" content="#eef4ff">
  <meta name="quartet-backend" content="">
  <meta name="app-core-backend" content="https://alias-spy-games-core.vitaledanilov.workers.dev">
  <title>Квартет V4.2 · Cloudflare Preview</title>
  <style>
    :root{--app-primary:#4f46e5;--app-primary-2:#2563eb;color-scheme:light}
    *{box-sizing:border-box}
    html,body{width:100%;min-height:100%;margin:0}
    body{min-height:100dvh;overflow-x:clip;background:radial-gradient(circle at 92% 4%,rgba(199,210,254,.7),transparent 30rem),radial-gradient(circle at 4% 92%,rgba(186,230,253,.58),transparent 30rem),linear-gradient(180deg,#f9fbff,#dceaff);color:#142844;font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
    button,input{font:inherit}
    #game-container{width:min(100%,960px);min-height:100dvh;margin:0 auto;padding:12px max(10px,env(safe-area-inset-right)) calc(30px + env(safe-area-inset-bottom)) max(10px,env(safe-area-inset-left))}
    #preview-badge{position:fixed;z-index:99999;right:max(8px,env(safe-area-inset-right));bottom:max(8px,env(safe-area-inset-bottom));padding:6px 10px;border-radius:999px;background:rgba(21,40,68,.78);color:#fff;font-size:10px;font-weight:900;letter-spacing:.09em;pointer-events:none;backdrop-filter:blur(12px)}
    @media(max-width:560px){#game-container{padding-top:max(8px,env(safe-area-inset-top))}}
  </style>
  <link rel="stylesheet" href="web/styles/room-invite.css?v=preview-v42">
  <link rel="stylesheet" href="web/styles/room-qr-brand.css?v=preview-v42">
  <link id="quartet-v2-css" rel="stylesheet" href="web/games/quartet-v2.css?v=preview-v42">
  <link rel="stylesheet" href="web/games/quartet-mobile.css?v=preview-v42">
  <link rel="stylesheet" href="web/games/quartet-v4-preview.css?v=preview-v42">
</head>
<body data-mode="game" data-current-game="quartet">
  <main id="game-container" aria-live="polite"></main>
  <div id="preview-badge">QUARTET V4.2 · CLOUDFLARE PREVIEW</div>
  <script>
    window.QUARTET_BACKEND_URL = location.origin;
    const backendMeta = document.querySelector('meta[name="quartet-backend"]');
    if (backendMeta) backendMeta.content = location.origin;
    window.appGoToMainMenu = () => location.reload();
  </script>
  <script src="web/js/room-invite.js?v=preview-v42"></script>
  <script src="web/js/room-qr-brand.js?v=preview-v42"></script>
  <script src="web/js/room-qr-scanner.js?v=preview-v42"></script>
  <script src="web/games/quartet.js?v=preview-v42"></script>
  <script src="web/js/room-qr-addon.js?v=preview-v42"></script>
  <script src="web/js/quartet-chat-addon.js?v=preview-v42"></script>
  <script src="web/js/quartet-v4-preview-addon.js?v=preview-v42"></script>
  <script>
    window.startQuartetGame('web/data/quartet_bible.json?v=preview-v42');
  </script>
</body>
</html>`;

const workerSource = `const UPSTREAM_ORIGIN = 'https://vidalost.github.io';

function isApiPath(pathname) {
  return pathname === '/health' || pathname === '/rooms' || pathname.startsWith('/rooms/');
}

async function proxyToBackend(request, env) {
  const incoming = new URL(request.url);
  const upstream = new URL(incoming.pathname + incoming.search, 'https://quartet.internal');
  const headers = new Headers(request.headers);
  headers.set('Origin', UPSTREAM_ORIGIN);
  headers.delete('Host');
  const init = { method: request.method, headers, redirect: 'manual' };
  if (request.method !== 'GET' && request.method !== 'HEAD') init.body = request.body;
  return env.QUARTET_BACKEND.fetch(new Request(upstream, init));
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (isApiPath(url.pathname)) return proxyToBackend(request, env);
    return env.ASSETS.fetch(request);
  },
};`;

const wranglerConfig = {
  $schema: 'https://raw.githubusercontent.com/cloudflare/workers-sdk/main/packages/wrangler/config-schema.json',
  name: 'alias-spy-games-quartet-ui-preview',
  main: './worker.js',
  compatibility_date: '2026-08-01',
  workers_dev: true,
  assets: { directory: './public', binding: 'ASSETS', run_worker_first: true, not_found_handling: 'single-page-application' },
  services: [{ binding: 'QUARTET_BACKEND', service: 'alias-spy-games-quartet' }],
};

fs.writeFileSync(path.join(publicDir, 'index.html'), indexHtml);
fs.writeFileSync(path.join(publicDir, '_headers'), '/*\n  Cache-Control: no-store, no-cache, max-age=0, must-revalidate\n');
fs.writeFileSync(path.join(output, 'worker.js'), workerSource);
fs.writeFileSync(path.join(output, 'wrangler.jsonc'), `${JSON.stringify(wranglerConfig, null, 2)}\n`);

const assetCount = fs.readdirSync(path.join(publicDir, 'web/assets/quartet/cards')).length;
if (assetCount !== cards.length || cards.length !== 48) throw new Error(`Preview card bundle mismatch: ${assetCount}/${cards.length}`);
for (const required of [
  'web/games/quartet-v4-preview.css','web/js/quartet-chat-addon.js','web/js/quartet-v4-preview-addon.js','web/assets/quartet/card-back-v4.svg',
  'web/js/room-invite.js','web/js/room-qr-brand.js','web/js/room-qr-scanner.js','web/js/room-qr-addon.js','web/styles/room-invite.css','web/styles/room-qr-brand.css',
]) if (!fs.existsSync(path.join(publicDir, required))) throw new Error(`Missing preview asset: ${required}`);

if (quartetSource.includes('selectedTargetId = String(button.dataset.playerId || \'\');\n    renderState();')) throw new Error('Target selection still performs full render');
if (quartetSource.includes('requestAnimationFrame(() => focusGroup(groupId))')) throw new Error('Card selection still auto-scrolls the deck');

console.log(`Quartet V4.2 Cloudflare preview built at ${output}: ${assetCount} cards, local selection updates, full main QR implementation and chat.`);
