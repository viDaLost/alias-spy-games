(async function(){
  const canvas=document.getElementById('game-canvas');
  const scene=new THREE.Scene();
  scene.background=new THREE.Color(0xc77c32);
  scene.fog=new THREE.FogExp2(0xd69a4e,.0125);

  const camera=new THREE.PerspectiveCamera(55,innerWidth/innerHeight,.1,500);
  const renderer=new THREE.WebGLRenderer({canvas,antialias:true,powerPreference:'low-power'});
  renderer.setSize(innerWidth,innerHeight);
  renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.25));
  renderer.shadowMap.enabled=true;
  renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  renderer.toneMapping=THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure=.9;
  if('outputEncoding' in renderer)renderer.outputEncoding=THREE.sRGBEncoding;

  const hemiLight=new THREE.HemisphereLight(0xfff2d6,0x74451e,.66);scene.add(hemiLight);
  const sun=new THREE.DirectionalLight(0xffedc2,.95);sun.position.set(26,42,16);sun.castShadow=true;sun.shadow.mapSize.set(512,512);sun.shadow.camera.left=-24;sun.shadow.camera.right=24;sun.shadow.camera.top=28;sun.shadow.camera.bottom=-16;sun.shadow.camera.near=.5;sun.shadow.camera.far=90;scene.add(sun);
  const riverFill=new THREE.DirectionalLight(0x7fc8e8,.28);riverFill.position.set(-8,10,10);scene.add(riverFill);
  const bankFill=new THREE.DirectionalLight(0xffb85f,.18);bankFill.position.set(11,7,-8);scene.add(bankFill);

  const RIVER_W=14;
  const RIVER_HALF=RIVER_W/2;

  const waterGeo=new THREE.PlaneGeometry(RIVER_W,620,20,92);
  const waterPos=waterGeo.attributes.position;
  const waterBase=[];
  for(let i=0;i<waterPos.count;i++)waterBase.push(waterPos.getZ(i));
  const waterMat=new THREE.MeshStandardMaterial({color:0x176b8b,roughness:.28,metalness:.12,emissive:0x082838,emissiveIntensity:.075});
  const water=new THREE.Mesh(waterGeo,waterMat);water.rotation.x=-Math.PI/2;water.receiveShadow=true;scene.add(water);

  const flowMat=new THREE.MeshBasicMaterial({color:0xc7efff,transparent:true,opacity:.14,depthWrite:false});
  const flowLines=[];
  for(let i=0;i<42;i++){
    const line=new THREE.Mesh(new THREE.PlaneGeometry(.55+(i%6)*.2,.035),flowMat.clone());
    line.rotation.x=-Math.PI/2;line.position.set(-5.9+((i*2.31)%11.8),.028,-300+i*14.7);scene.add(line);flowLines.push(line);
  }

  const bankGeo=new THREE.PlaneGeometry(82,620,4,56);
  const bankMat=new THREE.MeshStandardMaterial({color:0xc98638,roughness:1});
  const leftBank=new THREE.Mesh(bankGeo,bankMat);leftBank.rotation.x=-Math.PI/2;leftBank.position.set(-RIVER_HALF-41,-.05,0);leftBank.receiveShadow=true;scene.add(leftBank);
  const rightBank=new THREE.Mesh(bankGeo,bankMat);rightBank.rotation.x=-Math.PI/2;rightBank.position.set(RIVER_HALF+41,-.05,0);rightBank.receiveShadow=true;scene.add(rightBank);

  const wetMat=new THREE.MeshStandardMaterial({color:0x8d673d,roughness:1});
  const greenMat=new THREE.MeshStandardMaterial({color:0x4d7542,roughness:1});
  [-1,1].forEach(side=>{
    const wet=new THREE.Mesh(new THREE.PlaneGeometry(.55,620),wetMat);wet.rotation.x=-Math.PI/2;wet.position.set(side*(RIVER_HALF+.22),.006,0);scene.add(wet);
    const green=new THREE.Mesh(new THREE.PlaneGeometry(2.35,620),greenMat);green.rotation.x=-Math.PI/2;green.position.set(side*(RIVER_HALF+1.58),.01,0);scene.add(green);
  });

  function addPyramid(x,z,s,color){
    const g=new THREE.Group();
    const p=new THREE.Mesh(new THREE.ConeGeometry(s,s*1.18,4),new THREE.MeshStandardMaterial({color,roughness:1,flatShading:true}));p.position.y=s*.59-2;p.rotation.y=Math.PI/4;p.castShadow=false;g.add(p);
    const base=new THREE.Mesh(new THREE.BoxGeometry(s*1.52,1.6,s*1.52),new THREE.MeshStandardMaterial({color:0x875a2d,roughness:1}));base.position.y=-.8;g.add(base);
    g.position.set(x,0,z);scene.add(g);
  }
  addPyramid(-88,-235,58,0xb97535);addPyramid(105,-278,76,0xc68a45);addPyramid(15,-315,43,0xd5a25d);

  await window.assetManager.preloadEnvironmentModels();

  const player=new THREE.Group();
  const basketMesh=await window.assetManager.loadBasketModel();player.add(basketMesh);
  const playerLight=new THREE.PointLight(0xffd7a0,.28,10,2);playerLight.position.set(0,2.1,1.2);player.add(playerLight);
  const shieldAura=new THREE.Mesh(new THREE.SphereGeometry(1.3,16,16),new THREE.MeshBasicMaterial({color:0x38bdf8,wireframe:true,transparent:true,opacity:0}));player.add(shieldAura);scene.add(player);

  function tagItem(object,type,radius,desc){object.userData={...object.userData,type,radius,desc};return object;}

  function createCrocodile(){
    const g=new THREE.Group(),m=new THREE.MeshStandardMaterial({color:0x264f36,roughness:.78});
    const body=new THREE.Mesh(new THREE.BoxGeometry(.9,.34,2.5),m);body.castShadow=true;g.add(body);
    const snout=new THREE.Mesh(new THREE.BoxGeometry(.64,.23,1.08),m);snout.position.set(0,-.04,1.45);snout.castShadow=true;g.add(snout);
    const tail=new THREE.Mesh(new THREE.ConeGeometry(.28,1.5,5),m);tail.rotation.x=Math.PI/2;tail.position.z=-1.82;g.add(tail);
    const eyeMat=new THREE.MeshBasicMaterial({color:0xf6df97});[-.23,.23].forEach(x=>{const e=new THREE.Mesh(new THREE.SphereGeometry(.055,6,4),eyeMat);e.position.set(x,.22,.78);g.add(e);});
    return tagItem(g,'croc',1.12,'Берегитесь крокодилов!');
  }

  function createRock(){
    const model=window.assetManager.cloneModel('rock',2.15);
    if(model){model.rotation.y=Math.random()*Math.PI;return tagItem(model,'rock',.92,'Корзинка разбилась о пороги.');}
    const rock=new THREE.Mesh(new THREE.DodecahedronGeometry(.9),new THREE.MeshStandardMaterial({color:0x64748b,roughness:.9,flatShading:true}));rock.rotation.set(Math.random(),Math.random(),Math.random());rock.castShadow=true;return tagItem(rock,'rock',.95,'Корзинка разбилась о пороги.');
  }

  function createLog(){
    const model=window.assetManager.cloneModel('log',3.15);
    if(model){model.rotation.y=Math.PI/2+(Math.random()-.5)*.25;return tagItem(model,'log',1.05,'Бревно перекрыло путь по реке.');}
    const log=new THREE.Mesh(new THREE.CylinderGeometry(.34,.4,2.7,8),new THREE.MeshStandardMaterial({color:0x76502f,roughness:1}));log.rotation.z=Math.PI/2;log.castShadow=true;return tagItem(log,'log',1.05,'Бревно перекрыло путь по реке.');
  }

  function createLotus(){
    const g=new THREE.Group();const leaf=new THREE.Mesh(new THREE.CylinderGeometry(.65,.65,.05,12),new THREE.MeshStandardMaterial({color:0x167f42,roughness:.8}));g.add(leaf);
    const flower=new THREE.Mesh(new THREE.ConeGeometry(.4,.5,8),new THREE.MeshStandardMaterial({color:0xf472b6,emissive:0x9d174d,emissiveIntensity:.45}));flower.position.y=.25;flower.rotation.x=Math.PI;g.add(flower);return tagItem(g,'lotus',.85);
  }

  function createBuff(type){
    const isShield=type==='shield';const mesh=new THREE.Mesh(new THREE.OctahedronGeometry(.55),new THREE.MeshStandardMaterial({color:isShield?0x38bdf8:0xfbbf24,emissive:isShield?0x0284c7:0xd97706,emissiveIntensity:.8}));mesh.position.y=.5;const g=new THREE.Group();g.add(mesh);return tagItem(g,type,.9);
  }

  const scenery=[];
  function modelDecor(name,x,z,size,rotation=0,y=0){
    const model=window.assetManager.cloneModel(name,size);if(!model)return null;
    model.position.set(x,y,z);model.rotation.y=rotation;
    model.traverse(child=>{if(child.isMesh){child.castShadow=false;child.receiveShadow=true;}});
    scene.add(model);scenery.push(model);return model;
  }

  function addPalm(x,z,scale=.9+Math.random()*.35){
    if(modelDecor('palm',x,z,6.2*scale,(Math.random()-.5)*.5))return;
    const palm=new THREE.Group();const trunk=new THREE.Mesh(new THREE.CylinderGeometry(.2,.35,4.5,7),new THREE.MeshStandardMaterial({color:0x78350f,roughness:1}));trunk.position.y=2.25;palm.add(trunk);const crown=new THREE.Mesh(new THREE.ConeGeometry(2,1.4,7),new THREE.MeshStandardMaterial({color:0x166534,roughness:.9,flatShading:true}));crown.position.y=4.6;palm.add(crown);palm.scale.setScalar(scale);palm.position.set(x,0,z);scene.add(palm);scenery.push(palm);
  }

  function addReeds(x,z,scale=1){
    if(modelDecor(Math.random()<.55?'reeds':'bankPlant',x,z,2.25*scale,(Math.random()-.5)*.8))return;
    const g=new THREE.Group();const stemMat=new THREE.MeshStandardMaterial({color:0x477f3c,roughness:1});for(let i=0;i<6;i++){const stem=new THREE.Mesh(new THREE.CylinderGeometry(.025,.035,1.8+Math.random()*.5,5),stemMat);stem.position.set((Math.random()-.5)*.65,.9,(Math.random()-.5)*.45);g.add(stem);}g.scale.setScalar(scale);g.position.set(x,0,z);scene.add(g);scenery.push(g);
  }

  function addFoliage(side,z){
    const sign=side<0?-1:1;
    modelDecor('grass',sign*(RIVER_HALF+2.3+Math.random()*1.1),z,1.35+Math.random()*.5,Math.random()*Math.PI);
    if(Math.random()<.72)modelDecor('bush',sign*(RIVER_HALF+3.7+Math.random()*2.1),z+2.5,1.7+Math.random()*.75,Math.random()*Math.PI);
  }

  function addRaft(side,z){
    const x=side*(RIVER_HALF-.7);
    const raft=modelDecor('raft',x,z,3.35,side<0?.16:-.16,.03);
    if(raft)raft.userData.waterDecor=true;
  }

  for(let z=-270;z<=55;z+=18){
    addPalm(-RIVER_HALF-4.1-Math.random()*4.2,z);addPalm(RIVER_HALF+4.1+Math.random()*4.2,z+8);
    addReeds(-RIVER_HALF-1.05,z+5,.9+Math.random()*.35);addReeds(RIVER_HALF+1.05,z-4,.85+Math.random()*.3);
    addFoliage(-1,z+1);addFoliage(1,z+10);
    if(z%72===0){addRaft(-1,z+14);addRaft(1,z-22);}
  }

  const LANES=[-4,0,4];let lane=1,targetX=0,isPlaying=false,speed=24,dist=0,score=0,shieldTimer=0,magnetTimer=0;const activeItems=[];
  const distTxt=document.getElementById('dist-txt'),scoreTxt=document.getElementById('score-txt'),shieldBadge=document.getElementById('shield-badge'),magnetBadge=document.getElementById('magnet-badge');
  function triggerHaptic(type='light'){try{window.Telegram?.WebApp?.HapticFeedback?.impactOccurred?.(type);}catch{}}

  function makeObstacle(){const r=Math.random();return r<.42?createCrocodile():r<.76?createRock():createLog();}

  function spawnRow(z){
    const lanes=[0,1,2].sort(()=>Math.random()-.5),rand=Math.random();
    if(rand<.68){
      const obsCount=Math.random()<.28?2:1;
      for(let i=0;i<obsCount;i++){const obs=makeObstacle();obs.position.x+=LANES[lanes[i]];obs.position.z+=z;scene.add(obs);activeItems.push(obs);}
      if(Math.random()<.52){const freeLane=lanes[obsCount],item=Math.random()<.8?createLotus():createBuff(Math.random()<.5?'shield':'magnet');item.position.set(LANES[freeLane],0,z);scene.add(item);activeItems.push(item);}
    }else{
      const item=Math.random()<.75?createLotus():createBuff(Math.random()<.5?'shield':'magnet');item.position.set(LANES[lanes[0]],0,z);scene.add(item);activeItems.push(item);
    }
  }

  function resetGame(){
    activeItems.forEach(item=>scene.remove(item));activeItems.length=0;lane=1;targetX=0;player.position.set(0,0,0);dist=0;score=0;speed=24;shieldTimer=0;magnetTimer=0;shieldAura.material.opacity=0;shieldBadge.style.display='none';magnetBadge.style.display='none';distTxt.textContent='0';scoreTxt.textContent='0';for(let z=-38;z>=-246;z-=27)spawnRow(z);
  }
  function gameOver(msg){isPlaying=false;window.gameAudio.playHit();triggerHaptic('heavy');document.getElementById('fail-desc').textContent=msg;document.getElementById('final-dist').textContent=`${Math.floor(dist)} м`;document.getElementById('final-score').textContent=score;document.getElementById('gameover-screen').classList.remove('hidden');}
  function steerLeft(){if(!isPlaying||lane<=0)return;lane--;targetX=LANES[lane];window.gameAudio.playSplash();triggerHaptic('medium');}
  function steerRight(){if(!isPlaying||lane>=2)return;lane++;targetX=LANES[lane];window.gameAudio.playSplash();triggerHaptic('medium');}
  addEventListener('keydown',e=>{if(e.code==='KeyA'||e.code==='ArrowLeft')steerLeft();if(e.code==='KeyD'||e.code==='ArrowRight')steerRight();});
  document.getElementById('btn-left').onclick=steerLeft;document.getElementById('btn-right').onclick=steerRight;
  let touchX=0;addEventListener('touchstart',e=>touchX=e.touches[0].clientX,{passive:true});addEventListener('touchend',e=>{const diff=e.changedTouches[0].clientX-touchX;if(Math.abs(diff)>30)(diff<0?steerLeft:steerRight)();},{passive:true});
  document.getElementById('start-btn').onclick=()=>{window.gameAudio.init();document.getElementById('start-screen').classList.add('hidden');resetGame();isPlaying=true;};
  document.getElementById('restart-btn').onclick=()=>{window.gameAudio.init();document.getElementById('gameover-screen').classList.add('hidden');resetGame();isPlaying=true;};

  const clock=new THREE.Clock();
  function loop(){
    requestAnimationFrame(loop);const dt=Math.min(clock.getDelta(),.075),t=clock.getElapsedTime();
    player.position.y=.06+Math.sin(t*4.5)*.075;player.rotation.z=Math.sin(t*3.2)*.035;player.rotation.x=Math.sin(t*2.2)*.018;player.position.x+=(targetX-player.position.x)*12*dt;
    for(let i=0;i<waterPos.count;i++){const x=waterPos.getX(i),y=waterPos.getY(i);waterPos.setZ(i,waterBase[i]+Math.sin(y*.18+t*2.05+x*.45)*.032+Math.cos(y*.07-t*1.35+x*.8)*.016);}waterPos.needsUpdate=true;
    flowLines.forEach((line,i)=>{line.position.z+=speed*dt*.55;if(line.position.z>20)line.position.z-=615;line.material.opacity=.1+.07*Math.sin(t*2+i);});
    if(isPlaying){
      dist+=speed*dt;speed+=dt*.115;distTxt.textContent=Math.floor(dist);
      if(shieldTimer>0){shieldTimer-=dt;shieldAura.rotation.y+=dt*2.5;shieldAura.material.opacity=.35+Math.sin(t*8)*.15;if(shieldTimer<=0){shieldAura.material.opacity=0;shieldBadge.style.display='none';}}
      if(magnetTimer>0){magnetTimer-=dt;if(magnetTimer<=0)magnetBadge.style.display='none';}
      scenery.forEach(item=>{item.position.z+=speed*dt;if(item.position.z>35)item.position.z-=330;if(item.userData.waterDecor)item.position.y=.035+Math.sin(t*2.5+item.position.x)*.035;});
      let furthestZ=0;
      for(let i=activeItems.length-1;i>=0;i--){
        const item=activeItems[i];item.position.z+=speed*dt;if(item.position.z<furthestZ)furthestZ=item.position.z;
        if(['lotus','shield','magnet'].includes(item.userData.type)){item.rotation.y+=dt*2.2;if(magnetTimer>0&&item.userData.type==='lotus')item.position.x+=(player.position.x-item.position.x)*6*dt;}
        else if(item.userData.type==='croc'){item.position.y=Math.sin(t*6+item.position.x)*.055;item.rotation.z=Math.sin(t*4+item.position.z)*.025;}
        else if(item.userData.type==='log'){item.position.y=.02+Math.sin(t*3+item.position.x)*.025;item.rotation.z=Math.sin(t*2.2+item.position.z)*.015;}
        if(player.position.distanceTo(item.position)<item.userData.radius){
          if(item.userData.type==='lotus'){score+=10;scoreTxt.textContent=score;window.gameAudio.playCollect();triggerHaptic('light');}
          else if(item.userData.type==='shield'){shieldTimer=8;shieldBadge.style.display='block';window.gameAudio.playPowerup();triggerHaptic('medium');}
          else if(item.userData.type==='magnet'){magnetTimer=10;magnetBadge.style.display='block';window.gameAudio.playPowerup();triggerHaptic('medium');}
          else if(shieldTimer>0){shieldTimer=0;shieldAura.material.opacity=0;shieldBadge.style.display='none';window.gameAudio.playHit();triggerHaptic('heavy');}
          else{gameOver(item.userData.desc);break;}
          scene.remove(item);activeItems.splice(i,1);continue;
        }
        if(item.position.z>16){scene.remove(item);activeItems.splice(i,1);}
      }
      if(furthestZ>-232)spawnRow(furthestZ-27);
    }
    camera.position.set(player.position.x*.24,4.55,7.9);camera.lookAt(player.position.x*.34,.55,-10.8);renderer.render(scene,camera);
  }

  addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.25));});
  loop();
})();
