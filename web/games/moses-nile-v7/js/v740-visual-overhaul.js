(()=>{
'use strict';
if(window.__mosesV740Installed)return;window.__mosesV740Installed=true;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function findPlayer(scene){let hit=null;scene.traverse(n=>{if(hit||!n?.isGroup)return;let basket=false;n.traverse(c=>{if(c?.name==='ClosedWovenLid'||c?.geometry?.type==='TorusGeometry')basket=true;});if(basket&&Math.abs(n.position.z)<5)hit=n;});return hit;}
function addPyramid(scene,terrain,x,z,r,h,tint){const mat=new THREE.MeshStandardMaterial({color:tint,roughness:.96,metalness:0});const p=new THREE.Mesh(new THREE.ConeGeometry(r,h,4),mat);p.rotation.y=Math.PI/4;p.position.set(x,(terrain?.getHeightAt?.(x,z)||0)+h*.48,z);p.receiveShadow=true;p.castShadow=false;p.name='V740DistantPyramid';scene.add(p);return p;}
function addBankDetail(scene,terrain){
  const grassGeo=new THREE.PlaneGeometry(.26,.72);grassGeo.translate(0,.36,0);const grassMat=new THREE.MeshStandardMaterial({color:0x646b47,roughness:1,side:THREE.DoubleSide});const grass=new THREE.InstancedMesh(grassGeo,grassMat,180);
  const rockGeo=new THREE.IcosahedronGeometry(.18,1);const rockMat=new THREE.MeshStandardMaterial({color:0x756753,roughness:1});const rocks=new THREE.InstancedMesh(rockGeo,rockMat,90);
  const bushGeo=new THREE.IcosahedronGeometry(.58,1);const bushMat=new THREE.MeshStandardMaterial({color:0x596342,roughness:.98,flatShading:true});const bushes=new THREE.InstancedMesh(bushGeo,bushMat,52);
  const d=new THREE.Object3D();let gi=0,ri=0,bi=0;
  for(let i=0;i<1100&&(gi<180||ri<90||bi<52);i++){
    const side=i%2?-1:1,z=-285+((i*37.7)%350),dist=1.1+((i*13.3)%19),x=side*(6.45+dist),y=terrain.getHeightAt(x,z),n=terrain.mask.fbm(x*1.7,z*1.7);
    if(gi<180&&dist<11&&n>.48){d.position.set(x,y+.01,z);d.rotation.set(0,(i*.73)%6.28,0);const s=.45+((i*17)%29)/29*.8;d.scale.set(s,s,s);d.updateMatrix();grass.setMatrixAt(gi++,d.matrix);}
    if(ri<90&&dist>3&&n>.62){d.position.set(x,y+.08,z);d.rotation.set((i*.19)%1,(i*.41)%6.28,0);const s=.5+((i*11)%23)/23*1.4;d.scale.set(s,s*.6,s);d.updateMatrix();rocks.setMatrixAt(ri++,d.matrix);}
    if(bi<52&&dist>3.5&&dist<15&&n>.67&&i%3===0){d.position.set(x,y+.34,z);d.rotation.set(0,(i*.51)%6.28,0);const s=.55+((i*7)%17)/17*.85;d.scale.set(s*1.25,s*.72,s);d.updateMatrix();bushes.setMatrixAt(bi++,d.matrix);}
  }
  grass.count=gi;rocks.count=ri;bushes.count=bi;grass.instanceMatrix.needsUpdate=true;rocks.instanceMatrix.needsUpdate=true;bushes.instanceMatrix.needsUpdate=true;grass.name='V740BankGrass';rocks.name='V740BankRocks';bushes.name='V740BankBushes';scene.add(grass,rocks,bushes);
}
function addSun(scene){const sun=new THREE.Mesh(new THREE.CircleGeometry(5.5,28),new THREE.MeshBasicMaterial({color:0xffd998,fog:true,transparent:true,opacity:.82,depthWrite:false}));sun.position.set(28,47,-270);sun.name='V740SunDisk';scene.add(sun);}
async function boot(){
  for(let i=0;i<240&&(!window.__mosesV73Scene||!window.__mosesTerrain);i++)await sleep(50);const scene=window.__mosesV73Scene,terrain=window.__mosesTerrain,renderer=window.__mosesRenderer;if(!scene||!terrain)return;
  scene.background=new THREE.Color(0xc5c0a8);scene.fog=new THREE.Fog(0xc9b999,74,292);if(renderer)renderer.toneMappingExposure=.86;
  scene.traverse(n=>{if(n?.isDirectionalLight){n.color.setHex(0xffd296);n.intensity=Math.min(n.intensity,.94);}if(n?.isHemisphereLight){n.color.setHex(0xc4d4cf);n.groundColor.setHex(0x705a43);n.intensity=.68;}});
  addPyramid(scene,terrain,-47,-225,17,25,0xa98a61);addPyramid(scene,terrain,43,-258,13,19,0x9d805e);addPyramid(scene,terrain,-7,-302,9,13,0x92765a);addSun(scene);addBankDetail(scene,terrain);
  const player=findPlayer(scene);if(player){let visual=player.children.find(c=>c?.isGroup)||player.children[0];if(visual&&!visual.userData.v740Draft){visual.position.y-=.15;visual.userData.v740Draft=true;}const shadow=new THREE.Mesh(new THREE.CircleGeometry(.72,24),new THREE.MeshBasicMaterial({color:0x18231f,transparent:true,opacity:.14,depthWrite:false}));shadow.scale.y=.55;shadow.rotation.x=-Math.PI/2;shadow.position.y=-.105;shadow.name='V740BasketContact';player.add(shadow);}
  window.__mosesV740Ready=true;const b=document.getElementById('version-badge');if(b){b.dataset.state='ready';b.textContent='V7.4 · VISUAL OVERHAUL';}
}
boot().catch(e=>console.error('[V7.4]',e));
})();
