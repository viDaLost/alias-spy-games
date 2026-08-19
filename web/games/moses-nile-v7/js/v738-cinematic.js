(() => {
  'use strict';
  // V7.4 compatibility shim.
  // The original V7.3.8 cinematic layer continuously overwrote the version badge,
  // re-enabled legacy shoreline/PBR settings, and expected human NPCs that were removed.
  // V7.4 now owns crocodile animation, terrain, water and status UI.
  // Deploy epoch: v740-legacy-badge-fix-20260819-2351.
  if (window.__mosesV738Installed) return;
  window.__mosesV738Installed = true;
  window.__mosesV738Ready = true;
  window.__mosesV738CompatibilityShim = true;
})();
