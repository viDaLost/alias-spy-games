(()=>{
'use strict';
if(window.__mosesV740Installed)return;window.__mosesV740Installed=true;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
function findPlayer(scene){let hit=null;scene.traverse(n=>{if(hit||!n?.isGroup)return;let basket=false;n.traverse(c=>{if(c?.name==='ClosedWovenLid')basket=true;});if(basket&&Math.abs(n.position.z)<5)hit=n;});return hit;}
function addPyramid(scene,terrain,x,z,r,h,tint){const mat=new THREE.MeshStandardMaterial({color:tint,roughness:.98,metalness:0});const p=new THREE.Mesh(new THREE.ConeGeometry(r,h,4),mat);p.rotation.y=Math.PI/4;p.position.set(x,(terrain?.getHeightAt?.(x,z)||0)+h*.48,z);p.receiveShadow=true;p.castShadow=false;p.name='V740DistantPyramid';scene.add(p);return p;}
function hideLegacyVisuals(scene){scene.traverse(n=>{if(!n?.isMesh)return;const name=String(n.name||''),ud=n.userData||{},p=n.geometry?.parameters||{};if(ud.v736Foam||ud.bankGuide||ud.v736SecondWater||ud.v736Shallows||ud.nileShallowTint||/Foam|FlowLine|Shallow/i.test(name))n.visible=false;if(n.material?.transparent&&Number(p.height||0)>500&&Number(p.width||0)<1.5)n.visible=false;});}
function addBankDetail(scene,terrain){
  const grassGeo=new THREE.PlaneGeometry(.22,.62);grassGeo.translate(0,.31,0);const grassMat=new THREE.MeshStandardMaterial({color:0x68724b,roughness:1,side:THREE.DoubleSide});const grass=new THREE.InstancedMesh(grassGeo,grassMat,260);
  const rockGeo=new THREE.IcosahedronGeometry(.16,1);const rockMat=new THREE.MeshStandardMaterial({color:0x766955,roughness:1});const rocks=new THREE.InstancedMesh(rockGeo,rockMat,120);
  const bushGeo=new THREE.IcosahedronGeometry(.52,1);const bushMat=new THREE.MeshStandardMaterial({color:0x5b6846,roughness:1,flatShading:true});const bushes=new THREE.InstancedMesh(bushGeo,bushMat,84);
  const d=new THREE.Object3D();let gi=0,ri=0,bi=0;
  for(let i=0;i<1800&&(gi<260||ri<120||bi<84);i++){
    const side=i%2?-1:1,z=-300+((i*29.73)%385),dist=1.0+((i*11.71)%21),x=side*(6.35+dist),y=terrain.getHeightAt(x,z),n=terrain.mask.fbm(x*1.27,z*1.19),cluster=terrain.mask.fbm(x*.19+13,z*.17-9);
    if(gi<260&&dist<10.5&&n>.43&&cluster>.38){d.position.set(x,y+.01,z);d.rotation.set(0,(i*.73)%6.28,0);const s=.38+((i*17)%29)/29*.72;d.scale.set(s,s,s);d.updateMatrix();grass.setMatrixAt(gi++,d.matrix);}
    if(ri<120&&dist>2.8&&n>.61){d.position.set(x,y+.07,z);d.rotation.set((i*.19)%1,(i*.41)%6.28,0);const s=.45+((i*11)%23)/23*1.15;d.scale.set(s,s*.58,s);d.updateMatrix();rocks.setMatrixAt(ri++,d.matrix);}
    if(bi<84&&dist>3&&dist<16&&n>.59&&cluster>.55&&i%2===0){d.position.set(x,y+.28,z);d.rotation.set(0,(i*.51)%6.28,0);const s=.48+((i*7)%17)/17*.72;d.scale.set(s*1.35,s*.68,s);d.updateMatrix();bushes.setMatrixAt(bi++,d.matrix);}
  }
  grass.count=gi;rocks.count=ri;bushes.count=bi;grass.instanceMatrix.needsUpdate=true;rocks.instanceMatrix.needsUpdate=true;bushes.instanceMatrix.needsUpdate=true;grass.name='V740BankGrass';rocks.name='V740BankRocks';bushes.name='V740BankBushes';grass.frustumCulled=rocks.frustumCulled=bushes.frustumCulled=true;scene.add(grass,rocks,bushes);
}
function addSun(scene){const sun=new THREE.Mesh(new THREE.CircleGeometry(4.4,28),new THREE.MeshBasicMaterial({color:0xffdca3,fog:true,transparent:true,opacity:.62,depthWrite:false}));sun.position.set(31,43,-275);sun.name='V740SunDisk';scene.add(sun);}
function tuneBasket(player){let visual=player.children.find(c=>c?.isGroup)||player.children[0];if(visual&&!visual.userData.v740Draft){visual.position.y-=.20;visual.userData.v740Draft=true;}player.userData.v740Waterline=-.035;const shadow=new THREE.Mesh(new THREE.CircleGeometry(.68,24),new THREE.MeshBasicMaterial({color:0x17251f,transparent:true,opacity:.11,depthWrite:false}));shadow.scale.y=.48;shadow.rotation.x=-Math.PI/2;shadow.position.y=-.115;shadow.name='V740BasketContact';player.add(shadow);}
function installReferenceCamera(renderer,player){if(!renderer||!player||renderer.userData?.v740ReferenceCamera)return;renderer.userData.v740ReferenceCamera=true;const nativeRender=renderer.render.bind(renderer);let cx=0;renderer.render=function(scene,camera){if(camera&&player){const edge=Math.abs(player.position.x)/4;cx+=(player.position.x*.10-cx)*.08;camera.fov+=(50-camera.fov)*.08;camera.updateProjectionMatrix();camera.position.x=cx;camera.position.y+=(4.05-camera.position.y)*.12;camera.position.z+=(7.25-camera.position.z)*.12;camera.lookAt(player.position.x*.15,.38,-13.8);player.rotation.z*=.72;player.rotation.x*=.78;player.position.y=clamp(player.position.y,-.005,.045)-edge*.003;}return nativeRender(scene,camera);};}
async function boot(){
  for(let i=0;i<260&&(!window.__mosesV73Scene||!window.__mosesTerrain);i++)await sleep(50);const scene=window.__mosesV73Scene,terrain=window.__mosesTerrain,renderer=window.__mosesRenderer;if(!scene||!terrain)return;
  hideLegacyVisuals(scene);scene.background=new THREE.Color(0xc8c4ae);scene.fog=new THREE.Fog(0xc7b99d,82,305);if(renderer){renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=.82;}
  scene.traverse(n=>{if(n?.isDirectionalLight){const blue=n.color?.getHex?.()===0x7fc8e8;if(blue){n.intensity=.07;n.color.setHex(0x9db5aa);}else{n.color.setHex(0xffd6a0);n.intensity=Math.min(n.intensity,.88);}}if(n?.isHemisphereLight){n.color.setHex(0xc9d4c9);n.groundColor.setHex(0x6f5b45);n.intensity=.62;}});
  addPyramid(scene,terrain,-49,-220,15,22,0xa78c68);addPyramid(scene,terrain,40,-257,11.5,17,0x9c8263);addPyramid(scene,terrain,-8,-292,8,11.5,0x92785c);addSun(scene);addBankDetail(scene,terrain);
  const player=findPlayer(scene);if(player){tuneBasket(player);installReferenceCamera(renderer,player);}
  window.__mosesV740Ready=true;window.__mosesV740ReferencePass=true;const b=document.getElementById('version-badge');if(b){b.dataset.state='ready';b.textContent='V7.4 · REFERENCE PASS';}
}
boot().catch(e=>console.error('[V7.4 reference]',e));
})();
