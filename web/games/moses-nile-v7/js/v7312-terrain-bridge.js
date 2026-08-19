(()=>{
  'use strict';
  if(window.__mosesV7312Bridge||!window.THREE)return;window.__mosesV7312Bridge=true;
  const NativeRenderer=THREE.WebGLRenderer,NativeCamera=THREE.PerspectiveCamera;
  THREE.WebGLRenderer=class MosesRendererBridge extends NativeRenderer{constructor(...args){super(...args);window.__mosesRenderer=this;}};
  THREE.PerspectiveCamera=class MosesCameraBridge extends NativeCamera{constructor(...args){super(...args);window.__mosesCamera=this;}};
})();
