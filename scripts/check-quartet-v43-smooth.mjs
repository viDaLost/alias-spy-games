import fs from 'node:fs';
import path from 'node:path';
import { isBundled } from './web-sources.mjs';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const ok = (value, message) => { if (!value) throw new Error(message); };

const index = read('index.html');
const core = read('web/games/quartet.js');
const loader = read('web/js/quartet-production-v43-loader.js');
const ui = read('web/js/quartet-v43-smooth-ui.js');
const css = read('web/styles/quartet-v43-smooth.css');

new Function(loader);
new Function(ui);

ok(isBundled('web/js/quartet-production-v43-loader.js'), 'V43 production loader is not wired');
ok(isBundled('web/js/quartet-v43-smooth-ui.js'), 'V43 viewport UI is not wired');
ok(isBundled('web/styles/quartet-v43-smooth.css'), 'V43 smooth CSS is not wired');
ok(!isBundled('web/js/quartet-production-v42-loader.js'), 'Old V42 production loader is still active');
ok(!isBundled('web/js/quartet-v4-preview-addon.js'), 'Old V42 DOM enhancer is still active');

ok(core.includes("selectedTargetId = String(button.dataset.playerId || '');\n    renderState();"), 'Core selection patch target changed');
ok(core.includes("reconcileSelection(previousState, state);\n        renderState();\n        handleStateTransition(previousState, state);"), 'Core realtime patch target changed');
ok(loader.includes('renderStateIncremental(previousState)'), 'Realtime updates are not patched incrementally');
ok(loader.includes("handSignature !== previousHandSignature"), 'Hand updates are not guarded by a state signature');
ok(loader.includes("playerSignature !== previousPlayerSignature"), 'Player updates are not guarded by a state signature');
ok(loader.includes("updateSelectionUi();"), 'Selection must update DOM locally');
const patchedStart = loader.indexOf('const newSelectionHandlers');
const patchedEnd = loader.indexOf('const oldStateRender');
ok(patchedStart >= 0 && patchedEnd > patchedStart, 'Patched selection handler block is missing');
const patchedSelection = loader.slice(patchedStart, patchedEnd);
ok(!patchedSelection.includes('focusGroup(') && !patchedSelection.includes('renderState();'), 'Patched selection handlers still redraw or auto-scroll the deck');

ok(ui.includes("document.body.appendChild(portal)"), 'Quick-action dock must be owned by body/viewport');
ok(ui.includes("ResizeObserver"), 'Dock spacing must follow the real rendered height');
ok(ui.includes("sourceDock.classList.add('qv43-source-dock')"), 'Native in-flow dock is not hidden after portal activation');
ok(ui.includes("native?.click()"), 'Viewport player controls must proxy to canonical game actions');
ok(ui.includes("sourceDock?.querySelector('.qv2-confirm-ask')?.click()"), 'Viewport confirm button must proxy to canonical game action');
ok(ui.includes("quartetselectionchange"), 'Viewport dock is not subscribed to local selection changes');
ok(ui.includes("quartetstatepatch"), 'Viewport dock is not subscribed to incremental server updates');

ok(css.includes('#qv43-fixed-dock{\n  position:fixed'), 'Quick-action dock is not truly viewport-fixed');
ok(css.includes('transform:translate3d(-50%,0,0)'), 'Dock animation is not compositor-friendly');
ok(css.includes('body.qv43-quartet-active #qv2-root{padding-bottom:var(--qv43-dock-space)!important}'), 'Game content does not reserve viewport-dock space');
ok(css.includes('@media(prefers-reduced-motion:reduce)'), 'V43 motion must respect reduced-motion');

console.log('OK: Quartet V43 uses a body-owned viewport dock, local selection updates, incremental realtime rendering, and composited motion.');
