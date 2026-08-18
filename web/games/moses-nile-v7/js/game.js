(async function(){
  const canvas=document.getElementById('game-canvas');
  const scene=new THREE.Scene();
  scene.background=new THREE.Color(0xd97706);
  scene.fog=new THREE.FogExp2(0xeab308,.015);

  const camera=new THREE.PerspectiveCamera(55,innerWidth/innerHeight,.1,500);
  const renderer=new THREE.WebGLRenderer({canvas,antialias:true,powerPreference:'low-power'});
  renderer.setSize(innerWidth,innerHeight);
  renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.25));
  renderer.shadowMap.enabled=true;
  renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  renderer.toneMapping=THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure=.92;
  if('outputEncoding' in renderer)renderer.outputEncoding=THREE.sRGBEncoding;

  const hemiLight=new THREE.HemisphereLight(0xfffaed,0x8a4b17,.72);scene.add(hemiLight);
  const sun=new THREE.DirectionalLight(0xfffbeb,1.05);sun.position.set(30,50,-40);sun.castShadow=true;sun.shadow.mapSize.set(512,512);sun.shadow.camera.left=-28;sun.shadow.camera.right=28;sun.shadow.camera.top=28;sun.shadow.camera.bottom=-28;scene.add(sun);
  const riverFill=new THREE.DirectionalLight(0x8ad9ff,.32);riverFill.position.set(-10,12,8);scene.add(riverFill);

  const RIVER_W=14;
  const waterGeo=new THREE.PlaneGeometry(RIVER_W,600,18,80);
  const waterPos=waterGeo.attributes.position;
  const waterBase=[];
  for(let i=0;i<waterPos.count;i++)waterBase.push(waterPos.getZ(i));
  const waterMat=new THREE.MeshStandardMaterial({color:0x1c6987,roughness:.24,metalness:.18,flatShading:false,emissive:0x082737,emissiveIntensity:.08});
  const water=new THREE.Mesh(waterGeo,waterMat);water.rotation.x=-Math.PI/2;water.receiveShadow=true;scene.add(water);

  const flowMat=new THREE.MeshBasicMaterial({color:0xb9ecff,transparent:true,opacity:.18,depthWrite:false});
  const flowLines=[];
  for(let i=0;i<34;i++){
    const line=new THREE.Mesh(new THREE.PlaneGeometry(.7+(i%5)*.22,.045),flowMat);
    line.rotation.x=-Math.PI/2;line.position.set(-5.7+((i*2.13)%11.4),.025,-280+i*17.5);scene.add(line);flowLines.push(line);
  }

  const bankGeo=new THREE.PlaneGeometry(80,600,2,40);
  const bankMat=new THREE.MeshStandardMaterial({color:0xc77c24,roughness:.98});
  const leftBank=new THREE.Mesh(bankGeo,bankMat);leftBank.rotation.x=-Math.PI/2;leftBank.position.set(-RIVER_W/2-40,-.05,0);leftBank.receiveShadow=true;scene.add(leftBank);
  const rightBank=new THREE.Mesh(bankGeo,bankMat);rightBank.rotation.x=-Math.PI/2;rightBank.position.set(RIVER_W/2+40,-.05,0);rightBank.receiveShadow=true;scene.add(rightBank);

  const edgeMat=new THREE.MeshStandardMaterial({color:0x567944,roughness:1});
  [-1,1].forEach(side=>{const edge=new THREE.Mesh(new THREE.PlaneGeometry(2.1,600),edgeMat);edge.rotation.x=-Math.PI/2;edge.position.set(side*(RIVER_W/2+1.15),.012,0);scene.add(edge);});

  function addPyramid(x,z,s,color=0xb77932){
    const g=new THREE.Group();
    const p=new THREE.Mesh(new THREE.ConeGeometry(s,s*1.2,4),new THREE.MeshStandardMaterial({color,roughness:1,flatShading:true}));p.position.y=s*.6-2;p.rotation.y=Math.PI/4;p.castShadow=true;g.add(p);
    const base=new THREE.Mesh(new THREE.BoxGeometry(s*1.55,2,s*1.55),new THREE.MeshStandardMaterial({color:0x8b5b26,roughness:1}));base.position.y=-1;g.add(base);
    g.position.set(x,0,z);scene.add(g);
  }
  addPyramid(-90,-220,60,0xb56e2d);addPyramid(110,-260,80,0xc8873b);addPyramid(12,-300,45,0xd39a50);

  const player=new THREE.Group();
  const basketMesh=await window.assetManager.loadBasketModel();player.add(basketMesh);
  const shieldAura=new THREE.Mesh(new THREE.SphereGeometry(1.3,16,16),new THREE.MeshBasicMaterial({color:0x38bdf8,wireframe:true,transparent:true,opacity:0}));player.add(shieldAura);scene.add(player);

  function createCrocodile(){
    const g=new THREE.Group(),m=new THREE.MeshStandardMaterial({color:0x22543d,roughness:.72});
    const body=new THREE.Mesh(new THREE.BoxGeometry(.85,.35,2.4),m);body.castShadow=true;g.add(body);
    const snout=new THREE.Mesh(new THREE.BoxGeometry(.6,.25,1.1),m);snout.position.set(0,-.05,1.4);snout.castShadow=true;g.add(snout);
    const tail=new THREE.Mesh(new THREE.ConeGeometry(.27,1.4,5),m);tail.rotation.x=Math.PI/2;tail.position.z=-1.75;g.add(tail);
    const eyeMat=new THREE.MeshBasicMaterial({color:0xf7e7a9});[-.22,.22].forEach(x=>{const e=new THREE.Mesh(new THREE.SphereGeometry(.055,6,4),eyeMat);e.position.set(x,.23,.72);g.add(e);});
    g.userData={type:'croc',radius:1.1,desc:'Берегитесь крокодилов!'};return g;
  }
  function createRock(){const rock=new THREE.Mesh(new THREE.DodecahedronGeometry(.9),new THREE.MeshStandardMaterial({color:0x64748b,roughness:.9,flatShading:true}));rock.rotation.set(Math.random(),Math.random(),Math.random());rock.castShadow=true;rock.userData={type:'rock',radius:.95,desc:'Корзинка разбилась о пороги.'};return rock;}
  function createLotus(){
    const g=new THREE.Group();const leaf=new THREE.Mesh(new THREE.CylinderGeometry(.65,.65,.05,12),new THREE.MeshStandardMaterial({color:0x167f42,roughness:.8}));g.add(leaf);
    const flower=new THREE.Mesh(new THREE.ConeGeometry(.4,.5,8),new THREE.MeshStandardMaterial({color:0xf472b6,emissive:0x9d174d,emissiveIntensity:.45}));flower.position.y=.25;flower.rotation.x=Math.PI;g.add(flower);g.userData={type:'lotus',radius:.85};return g;
  }
  function createBuff(type){const isShield=type==='shield';const mesh=new THREE.Mesh(new THREE.OctahedronGeometry(.55),new THREE.MeshStandardMaterial({color:isShield?0x38bdf8:0xfbbf24,emissive:isShield?0x0284c7:0xd97706,emissiveIntensity:.8}));mesh.position.y=.5;const g=new THREE.Group();g.add(mesh);g.userData={type,radius:.9};return g;}

  const scenery=[];
  function addPalm(x,z,scale=.9+Math.random()*.45){
    const palm=new THREE.Group();const trunkMat=new THREE.MeshStandardMaterial({color:0x78350f,roughness:1});const leafMat=new THREE.MeshStandardMaterial({color:0x166534,roughness:.9,flatShading:true});
    const trunk=new THREE.Mesh(new THREE.CylinderGeometry(.2,.35,4.5,7),trunkMat);trunk.position.y=2.25;trunk.castShadow=true;palm.add(trunk);
    for(let i=0;i<7;i++){const leaf=new THREE.Mesh(new THREE.ConeGeometry(.48,3.2,5),leafMat);leaf.position.y=4.7;leaf.rotation.z=Math.PI/2.8;leaf.rotation.y=i*Math.PI*2/7;leaf.translateZ(1.05);palm.add(leaf);}
    palm.scale.setScalar(scale);palm.position.set(x,0,z);scene.add(palm);scenery.push(palm);
  }
  function addReeds(x,z,scale=1){const g=new THREE.Group();const stemMat=new THREE.MeshStandardMaterial({color:0x477f3c,roughness:1});const topMat=new THREE.MeshStandardMaterial({color:0x6e4b2a,roughness:1});for(let i=0;i<7;i++){const stem=new THREE.Mesh(new THREE.CylinderGeometry(.025,.035,1.8+Math.random()*.6,5),stemMat);stem.position.set((Math.random()-.5)*.7,.9,(Math.random()-.5)*.5);g.add(stem);const top=new THREE.Mesh(new THREE.CylinderGeometry(.05,.08,.4,6),topMat);top.position.set(stem.position.x,stem.geometry.parameters.height+.15,stem.position.z);g.add(top);}g.scale.setScalar(scale);g.position.set(x,0,z);scene.add(g);scenery.push(g);}
  for(let z=-240;z<=60;z+=18){addPalm(-RIVER_W/2-3-Math.random()*5,z);addPalm(RIVER_W/2+3+Math.random()*5,z+9);if(z%36===0){addReeds(-RIVER_W/2-1.2,z+5,1.1);addReeds(RIVER_W/2+1.2,z-4,.9);}}

  const LANES=[-4,0,4];let lane=1,targetX=0,isPlaying=false,speed=24,dist=0,score=0,shieldTimer=0,magnetTimer=0;const activeItems=[];
  const distTxt=document.getElementById('dist-txt'),scoreTxt=document.getElementById('score-txt'),shieldBadge=document.getElementById('shield-badge'),magnetBadge=document.getElementById('magnet-badge');
  function triggerHaptic(type='light'){try{window.Telegram?.WebApp?.HapticFeedback?.impactOccurred?.(type);}catch{}}

  function spawnRow(z){
    const lanes=[0,1,2].sort(()=>Math.random()-.5),rand=Math.random();
    if(rand<.68){const obsCount=Math.random()<.3?2:1;for(let i=0;i<obsCount;i++){const obs=Math.random()<.55?createCrocodile():createRock();obs.position.set(LANES[lanes[i]],0,z);scene.add(obs);activeItems.push(obs);}if(Math.random()<.5){const freeLane=lanes[obsCount],item=Math.random()<.8?createLotus():createBuff(Math.random()<.5?'shield':'magnet');item.position.set(LANES[freeLane],0,z);scene.add(item);activeItems.push(item);}}
    else{const item=Math.random()<.75?createLotus():createBuff(Math.random()<.5?'shield':'magnet');item.position.set(LANES[lanes[0]],0,z);scene.add(item);activeItems.push(item);}
  }
  function resetGame(){activeItems.forEach(item=>scene.remove(item));activeItems.length=0;lane=1;targetX=0;player.position.set(0,0,0);dist=0;score=0;speed=24;shieldTimer=0;magnetTimer=0;shieldAura.material.opacity=0;shieldBadge.style.display='none';magnetBadge.style.display='none';distTxt.textContent='0';scoreTxt.textContent='0';for(let z=-40;z>=-240;z-=26)spawnRow(z);}
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
    requestAnimationFrame(loop);const dt=Math.min(clock.getDelta(),.1),t=clock.getElapsedTime();
    player.position.y=Math.sin(t*4.5)*.08;player.rotation.z=Math.sin(t*3.2)*.04;player.position.x+=(targetX-player.position.x)*12*dt;
    for(let i=0;i<waterPos.count;i++){const x=waterPos.getX(i),y=waterPos.getY(i);waterPos.setZ(i,waterBase[i]+Math.sin(y*.18+t*2.1+x*.45)*.035+Math.cos(y*.07-t*1.4+x*.8)*.018);}waterPos.needsUpdate=true;
    flowLines.forEach((line,i)=>{line.position.z+=speed*dt*.55;if(line.position.z>18)line.position.z-=590;line.material.opacity=.11+.08*Math.sin(t*2+i);});
    if(isPlaying){
      dist+=speed*dt;speed+=dt*.12;distTxt.textContent=Math.floor(dist);
      if(shieldTimer>0){shieldTimer-=dt;shieldAura.rotation.y+=dt*2.5;shieldAura.material.opacity=.35+Math.sin(t*8)*.15;if(shieldTimer<=0){shieldAura.material.opacity=0;shieldBadge.style.display='none';}}
      if(magnetTimer>0){magnetTimer-=dt;if(magnetTimer<=0)magnetBadge.style.display='none';}
      scenery.forEach(item=>{item.position.z+=speed*dt;if(item.position.z>30)item.position.z-=280;});
      let furthestZ=0;
      for(let i=activeItems.length-1;i>=0;i--){
        const item=activeItems[i];item.position.z+=speed*dt;if(item.position.z<furthestZ)furthestZ=item.position.z;
        if(['lotus','shield','magnet'].includes(item.userData.type)){item.rotation.y+=dt*2.2;if(magnetTimer>0&&item.userData.type==='lotus')item.position.x+=(player.position.x-item.position.x)*6*dt;}
        else if(item.userData.type==='croc'){item.position.y=Math.sin(t*6+item.position.x)*.06;item.rotation.z=Math.sin(t*4+item.position.z)*.025;}
        if(player.position.distanceTo(item.position)<item.userData.radius){
          if(item.userData.type==='lotus'){score+=10;scoreTxt.textContent=score;window.gameAudio.playCollect();triggerHaptic('light');}
          else if(item.userData.type==='shield'){shieldTimer=8;shieldBadge.style.display='block';window.gameAudio.playPowerup();triggerHaptic('medium');}
          else if(item.userData.type==='magnet'){magnetTimer=10;magnetBadge.style.display='block';window.gameAudio.playPowerup();triggerHaptic('medium');}
          else if(shieldTimer>0){shieldTimer=0;shieldAura.material.opacity=0;shieldBadge.style.display='none';window.gameAudio.playHit();triggerHaptic('heavy');}
          else{gameOver(item.userData.desc);break;}
          scene.remove(item);activeItems.splice(i,1);continue;
        }
        if(item.position.z>15){scene.remove(item);activeItems.splice(i,1);}
      }
      if(furthestZ>-230)spawnRow(furthestZ-26);
    }
    camera.position.set(player.position.x*.25,4.6,7.8);camera.lookAt(player.position.x*.35,.6,-10);renderer.render(scene,camera);
  }
  addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.25));});
  loop();
})();
