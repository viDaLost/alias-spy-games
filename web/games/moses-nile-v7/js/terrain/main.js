import * as THREE from 'three';
import { TerrainSystem } from './TerrainSystem.js';

const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
async function waitForRuntime(){for(let i=0;i<180;i++){if(window.__mosesV73Scene&&window.__mosesRenderer&&window.__mosesCamera)return {scene:window.__mosesV73Scene,renderer:window.__mosesRenderer,camera:window.__mosesCamera};await sleep(50);}throw new Error('V7.3.12 terrain: runtime bridge unavailable');}

async function boot(){
  const {scene,renderer,camera}=await waitForRuntime();
  const waterFX=window.__mosesWaterFX;
  const waterLevel=waterFX?.waterSystem?.waterLevel??-0.055;
  const terrain=new TerrainSystem({
    scene,renderer,waterLevel,
    chunkSize:64, // Change terrain chunk size here.
    bounds:{minX:-64,maxX:64,minZ:-320,maxZ:96},
    lod:{near:40,mid:120,cull:270}, // Change terrain LOD distances here.
    preferKTX2:false, // Turn true after KTX2 assets are published; JPG fallback remains supported.
  });
  await terrain.init();
  waterFX?.waterSystem?.setShorelineData?.(terrain.getShorelineData());
  window.__mosesTerrain=terrain;
  window.__mosesV7312Ready=true;
  const badge=document.getElementById('version-badge');if(badge){badge.dataset.state='ready';badge.textContent='V7.3.12 · NILE TERRAIN · SPLAT + LOD';}
  const clock=new THREE.Clock();
  function frame(){requestAnimationFrame(frame);const dt=Math.min(.05,clock.getDelta());terrain.update(camera,dt);}
  frame();
}
boot().catch(error=>{console.error('[V7.3.12 terrain]',error);window.__mosesV7312Ready=false;const badge=document.getElementById('version-badge');if(badge){badge.dataset.state='fallback';badge.textContent='V7.3.12 · TERRAIN FALLBACK';}});
