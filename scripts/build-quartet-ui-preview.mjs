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
  'web/data/quartet_bible.json',
]) copy(file);

const catalog = JSON.parse(fs.readFileSync(path.join(root, 'web/data/quartet_bible.json'), 'utf8'));
const cards = catalog.quartets.flatMap((quartet) => quartet.cards || []);
for (const card of cards) copy(card.art);

const indexHtml = `<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
  <meta name="theme-color" content="#eef4ff">
  <meta name="quartet-backend" content="">
  <title>Квартет · Cloudflare Preview</title>
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
  <link id="quartet-v2-css" rel="stylesheet" href="web/games/quartet-v2.css?v=preview-v3">
  <link rel="stylesheet" href="web/games/quartet-mobile.css?v=preview-v3">
</head>
<body data-mode="game" data-current-game="quartet">
  <main id="game-container" aria-live="polite"></main>
  <div id="preview-badge">QUARTET V3 · CLOUDFLARE PREVIEW</div>
  <script>
    window.QUARTET_BACKEND_URL = location.origin;
    window.appGoToMainMenu = () => location.reload();
  </script>
  <script src="web/games/quartet.js?v=preview-v3"></script>
  <script>
    window.startQuartetGame('web/data/quartet_bible.json?v=preview-v3');
  </script>
</body>
</html>`;

const workerSource = `const UPSTREAM_ORIGIN = 'https://vidalost.github.io';

function isApiPath(pathname) {
  return pathname === '/health' || pathname === '/rooms' || pathname.startsWith('/rooms/');
}

async function proxyToBackend(request, env) {
  const incoming = new URL(request.url);
  const upstream = new URL(incoming.pathname + incoming.search, env.QUARTET_BACKEND_URL);
  const headers = new Headers(request.headers);
  headers.set('Origin', UPSTREAM_ORIGIN);
  headers.delete('Host');
  const init = { method: request.method, headers, redirect: 'manual' };
  if (request.method !== 'GET' && request.method !== 'HEAD') init.body = request.body;
  return fetch(new Request(upstream, init));
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
  assets: {
    directory: './public',
    binding: 'ASSETS',
    not_found_handling: 'single-page-application',
  },
  vars: {
    QUARTET_BACKEND_URL: 'https://alias-spy-games-quartet.vitaledanilov.workers.dev',
  },
};

fs.writeFileSync(path.join(publicDir, 'index.html'), indexHtml);
fs.writeFileSync(path.join(publicDir, '_headers'), '/*\n  Cache-Control: no-store, no-cache, max-age=0, must-revalidate\n');
fs.writeFileSync(path.join(output, 'worker.js'), workerSource);
fs.writeFileSync(path.join(output, 'wrangler.jsonc'), `${JSON.stringify(wranglerConfig, null, 2)}\n`);

const assetCount = fs.readdirSync(path.join(publicDir, 'web/assets/quartet/cards')).length;
if (assetCount !== cards.length || cards.length !== 48) {
  throw new Error(`Preview card bundle mismatch: ${assetCount}/${cards.length}`);
}

console.log(`Quartet Cloudflare preview built at ${output} with ${assetCount} illustrated cards.`);
