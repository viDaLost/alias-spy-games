(()=>{
  'use strict';
  if(window.__mosesV7314Installed)return;window.__mosesV7314Installed=true;
  const wait=(ms)=>new Promise(r=>setTimeout(r,ms));
  async function boot(){
    for(let i=0;i<220&&!window.__mosesV73Scene;i++)await wait(40);
    const scene=window.__mosesV73Scene,renderer=window.__mosesRenderer;
    if(!scene)return;

    // Softer hot-day Nile atmosphere: less orange, less cyan, more natural haze.
    scene.background=new THREE.Color(0xb9c9c7);
    scene.fog=new THREE.Fog(0xcbbd9f,92,330);
    scene.traverse(node=>{
      if(node?.isHemisphereLight){node.color.setHex(0xd8e1dc);node.groundColor.setHex(0x6e5d48);node.intensity=.72;}
      if(node?.isDirectionalLight&&node.intensity>.5){node.color.setHex(0xf5d8a4);node.intensity=.96;}
    });
    if(renderer){renderer.toneMappingExposure=.92;renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.35));}

    // The old scenery generator and the new terrain scatter otherwise double vegetation.
    let legacyPalm=0;
    for(const child of scene.children){
      if(child.userData?.nileTerrainChunk||child.name==='NileReedsInstancedV7314'||child.name==='NileGrassInstancedV7314')continue;
      let names='';child.traverse?.(n=>{names+=' '+String(n?.name||'');});
      if(/reeds|bankPlant|grass|bush/i.test(names)){child.visible=false;continue;}
      if(/palm/i.test(names)){legacyPalm++;if(legacyPalm%4!==1)child.visible=false;else child.scale.multiplyScalar(.82);}
    }

    // Kill any leftover bright water guides / foam strips from pre-WaterSystem generations.
    scene.traverse(node=>{
      if(!node?.isMesh)return;
      const mats=Array.isArray(node.material)?node.material:[node.material];
      if(mats.some(m=>[0xc7efff,0x8fdde8,0xffffff].includes(m?.color?.getHex?.())&&m?.transparent&&m?.opacity<.35)){
        if(!node.userData?.waterFx&&!node.userData?.nileWater)node.visible=false;
      }
    });

    // Slightly reduce specular glare on terrain while retaining wet-mud response.
    const terrain=window.__mosesTerrain;
    if(terrain?.materialSystem?.material){terrain.materialSystem.material.roughness=.94;terrain.materialSystem.material.needsUpdate=true;}

    window.__mosesV7314Ready=true;
    const badge=document.getElementById('version-badge');if(badge){badge.dataset.state='ready';badge.textContent='V7.3.14 · FINAL VISUAL';}
  }
  boot().catch(e=>{console.error('[V7.3.14 visual]',e);window.__mosesV7314Ready=false;});
})();
