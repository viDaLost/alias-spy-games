// Builds the eager web bundle that index.html loads.
//
// GitHub Pages serves main:/ verbatim, so the build output is committed alongside
// the sources. Run `npm run build` after touching anything in scripts/web-sources.mjs
// or any file it lists; `npm run check` fails if the committed bundle is stale.
//
// The 56 entries are classic scripts that shared one global scope through 56
// <script defer> tags. Concatenating them in the same order preserves that exactly;
// they are deliberately NOT wrapped in module or IIFE scope.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import * as esbuild from 'esbuild';
import { styleSources, scriptSources } from './web-sources.mjs';

const root = path.resolve(import.meta.dirname, '..');
const distDir = path.join(root, 'web', 'dist');
const CSS_MARK = ['<!-- build:css -->', '<!-- /build:css -->'];
const JS_MARK = ['<!-- build:js -->', '<!-- /build:js -->'];

const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const hash = (text) => crypto.createHash('sha256').update(text).digest('hex').slice(0, 10);

function concat(sources) {
  return sources.map((src) => `/* ${src} */\n${read(src)}`).join('\n');
}

export async function build({ write = true } = {}) {
  const missing = [...styleSources, ...scriptSources].filter((s) => !fs.existsSync(path.join(root, s)));
  if (missing.length) throw new Error(`Bundle sources are missing:\n  ${missing.join('\n  ')}`);

  // web/dist sits at the same depth as web/styles and web/games, so the handful of
  // relative url(../assets/...) references in the stylesheets keep resolving.
  const css = await esbuild.transform(concat(styleSources), {
    loader: 'css',
    minify: true,
  });
  // Whitespace and dead syntax only: identifiers stay untouched, because these files
  // publish globals to each other and to inline onclick handlers in the markup.
  const js = await esbuild.transform(concat(scriptSources), {
    loader: 'js',
    target: 'es2020',
    minifyWhitespace: true,
    minifySyntax: true,
    minifyIdentifiers: false,
  });
  for (const warning of [...css.warnings, ...js.warnings]) {
    console.warn(`esbuild: ${warning.text} (${warning.location?.file || 'bundle'})`);
  }

  const cssName = `app.${hash(css.code)}.css`;
  const jsName = `app.${hash(js.code)}.js`;
  const cssTag = `  <link rel="stylesheet" href="web/dist/${cssName}" />`;
  const jsTag = `  <script src="web/dist/${jsName}" defer></script>`;

  let html = read('index.html');
  for (const [[open, close], tag] of [[CSS_MARK, cssTag], [JS_MARK, jsTag]]) {
    const start = html.indexOf(open);
    const end = html.indexOf(close);
    if (start < 0 || end < 0) throw new Error(`index.html is missing the ${open} region`);
    html = `${html.slice(0, start + open.length)}\n${tag}\n  ${html.slice(end)}`;
  }

  const files = [
    [path.join(distDir, cssName), css.code],
    [path.join(distDir, jsName), js.code],
    [path.join(root, 'index.html'), html],
  ];

  if (write) {
    fs.rmSync(distDir, { recursive: true, force: true });
    fs.mkdirSync(distDir, { recursive: true });
    for (const [file, content] of files) fs.writeFileSync(file, content);
    const kb = (n) => `${Math.round(n / 1024)} KiB`;
    console.log(`web/dist/${cssName}  ${kb(css.code.length)}  (from ${styleSources.length} stylesheets)`);
    console.log(`web/dist/${jsName}  ${kb(js.code.length)}  (from ${scriptSources.length} scripts)`);
  }

  return { cssName, jsName, css: css.code, js: js.code, html };
}

if (process.argv[1] === import.meta.filename) await build();
