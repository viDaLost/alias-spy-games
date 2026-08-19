(() => {
  'use strict';
  if (window.__mosesV7311Bridge || !window.THREE) return;
  window.__mosesV7311Bridge = true;
  const NativeCamera = THREE.PerspectiveCamera;
  const NativeRenderer = THREE.WebGLRenderer;
  THREE.PerspectiveCamera = class MosesTrackedCamera extends NativeCamera {
    constructor(...args) { super(...args); window.__mosesCamera = this; }
  };
  THREE.WebGLRenderer = class MosesTrackedRenderer extends NativeRenderer {
    constructor(...args) { super(...args); window.__mosesRenderer = this; }
  };
})();
