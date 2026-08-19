(()=>{
  'use strict';
  if(window.__mosesV7313Installed)return;window.__mosesV7313Installed=true;
  const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
  async function boot(){
    for(let i=0;i<180&&!window.__mosesV73Scene;i++)await sleep(50);
    const scene=window.__mosesV73Scene,renderer=window.__mosesRenderer;
    if(!scene||!window.THREE)throw new Error('scene unavailable');

    scene.background=new THREE.Color(0xc7d7d8);
    scene.fog=new THREE.Fog(0xd6c6a6,72,285);
    const skyGeo=new THREE.SphereGeometry(420,24,12);
    const skyMat=new THREE.ShaderMaterial({
      side:THREE.BackSide,depthWrite:false,fog:false,
      uniforms:{uTop:{value:new THREE.Color(0x8fb5c3)},uHorizon:{value:new THREE.Color(0xe1c89d)},uGround:{value:new THREE.Color(0xb69362)}},
      vertexShader:'varying vec3 vP;void main(){vP=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
      fragmentShader:'uniform vec3 uTop,uHorizon,uGround;varying vec3 vP;void main(){float y=normalize(vP).y;float h=smoothstep(-.12,.18,y);vec3 c=mix(uGround,uHorizon,smoothstep(-.42,.02,y));c=mix(c,uTop,smoothstep(.04,.72,y));gl_FragColor=vec4(c,1.0);}'
    });
    const sky=new THREE.Mesh(skyGeo,skyMat);sky.name='NileSkyV7313';sky.renderOrder=-10;scene.add(sky);

    for(const child of [...scene.children]){
      let giantPyramid=false;
      child.traverse?.(node=>{const p=node?.geometry?.parameters;if(node?.geometry?.type==='ConeGeometry'&&p?.radialSegments===4&&(p?.radius||0)>18)giantPyramid=true;});
      if(giantPyramid)child.visible=false;
    }

    scene.traverse(node=>{
      if(node?.isHemisphereLight){node.color.setHex(0xdbe7e5);node.groundColor.setHex(0x806649);node.intensity=.78;}
      else if(node?.isDirectionalLight){
        if(node.intensity>.55){node.color.setHex(0xffdfac);node.intensity=1.04;}
        else{node.color.lerp(new THREE.Color(0xc7d6cf),.72);node.intensity*=.58;}
      }
    });
    if(renderer){renderer.toneMappingExposure=.98;renderer.shadowMap.autoUpdate=true;}

    let palmIndex=0,plantIndex=0;
    for(const child of scene.children){
      let name='';child.traverse?.(n=>{name+=' '+String(n?.name||'');});
      if(/palm/i.test(name)){palmIndex++;if(palmIndex%3===0)child.visible=false;else child.scale.multiplyScalar(.88+.08*(palmIndex%2));}
      if(/grass|bush|plant/i.test(name)&&!child.userData?.nileTerrainChunk){plantIndex++;if(plantIndex%4===0)child.visible=false;}
    }

    window.__mosesV7313Ready=true;
    const badge=document.getElementById('version-badge');if(badge)badge.dataset.v7313='ready';
  }
  boot().catch(e=>{console.error('[V7.3.13 visual]',e);window.__mosesV7313Ready=false;});
})();
