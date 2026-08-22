import fs from 'node:fs';
import assert from 'node:assert/strict';

const css = fs.readFileSync('web/games/bible-sketch-landscape-v2.css', 'utf8');
const launcher = fs.readFileSync('web/js/bible-sketch-launcher.js', 'utf8');
const html = fs.readFileSync('index.html', 'utf8');
const wrangler = fs.readFileSync('cloudflare/bible-sketch-worker/wrangler.jsonc', 'utf8');
const cycleSource = fs.readFileSync('cloudflare/bible-sketch-worker/src/drawing-cycles.js', 'utf8');

assert.match(css, /orientation:\s*landscape/);
assert.match(css, /grid-template-columns:\s*clamp\(152px/);
assert.match(css, /\.bsk-canvas-wrap[\s\S]*aspect-ratio:\s*auto/);
assert.match(css, /data-action="brush-width"/);
assert.match(css, /data-width="3"/);
assert.match(css, /data-width="6"/);
assert.match(css, /data-width="11"/);
assert.match(launcher, /bible-sketch-landscape-v2\.css\?v=2/);
assert.match(launcher, /bible-sketch\.js\?v=2/);
assert.match(launcher, /if\s*\(!link\.isConnected\)\s*document\.head\.appendChild\(link\)/);
assert.doesNotMatch(launcher, /if\s*\(isSketch\)\s*\{[\s\S]{0,180}?ensureLandscapeStyles\(\)/);
assert.match(html, /bible-sketch-launcher\.js\?v=5/);

const entryMatch = wrangler.match(/"main"\s*:\s*"([^"]+)"/);
assert.ok(entryMatch, 'Bible Sketch Wrangler entrypoint is missing');
const entryPath = `cloudflare/bible-sketch-worker/${entryMatch[1]}`;
const entrySource = fs.readFileSync(entryPath, 'utf8');
if (!/src\/index-drawing-cycles\.js/.test(wrangler)) {
  assert.match(entrySource, /index-admin-observer\.js/, 'Secure observer v2 must preserve the observer chain');
  const observerSource = fs.readFileSync('cloudflare/bible-sketch-worker/src/index-admin-observer.js', 'utf8');
  assert.match(observerSource, /index-drawing-cycles\.js/, 'Observer chain must retain the two-cycle game entrypoint');
}

assert.match(cycleSource, /DRAWING_CYCLES\s*=\s*2/);
assert.match(cycleSource, /turnsPerCycle \* DRAWING_CYCLES/);

console.log('Bible Sketch landscape V2 checks passed');
