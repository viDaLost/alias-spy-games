(() => {
  'use strict';
  if (window.__mosesV734Installed || !window.THREE) return;
  window.__mosesV734Installed = true;
  const personState = new WeakMap(), crocState = new WeakMap();
  let lastNow = performance.now();
  let lastDistance = Number(document.getElementById('dist-txt')?.textContent || 0);
  const expLerp = (current,target,speed,dt) => current + (target-current) * (1-Math.exp(-speed*Math.max(0,dt)));

  function ensurePerson(person,index){
    if(personState.has(person)) return personState.get(person);
    const state={
      homeX:Number(person.userData?.v733HomeX??person.position.x), homeY:Number(person.userData?.v733HomeY??person.position.y),
      facing:Number(person.userData?.v733BaseRotationY??person.rotation.y), displayZ:person.position.z, targetZ:person.position.z,
      lastOutputZ:person.position.z, phase:Number(person.userData?.v733Phase??index*.79),
      behavior:person.userData?.v733Behavior||['wave','point','walk','cheer','carry','bow'][index%6],
      nextGesture:performance.now()+350+(index%4)*320+Math.random()*650, gestureStart:0, gestureDuration:2500+(index%3)*260,
    };
    person.userData.v734Managed=true; personState.set(person,state); return state;
  }

  function syncPersonZ(person,state,dt,extraAdvance=0){
    const observed=Number(person.position.z), delta=observed-state.lastOutputZ;
    if(Number.isFinite(delta)&&Math.abs(delta)>.0001){
      if(Math.abs(delta)>80){state.targetZ+=delta;state.displayZ+=delta;} else state.targetZ+=delta;
    }
    if(extraAdvance>0) state.targetZ+=extraAdvance;
    if(state.targetZ>30){state.targetZ-=260;state.displayZ-=260;}
    state.displayZ=expLerp(state.displayZ,state.targetZ,8.5,dt); person.position.z=state.displayZ; state.lastOutputZ=state.displayZ;
  }

  function gestureEnvelope(state,now){
    if(!state.gestureStart&&now>=state.nextGesture) state.gestureStart=now;
    if(!state.gestureStart) return 0;
    const elapsed=now-state.gestureStart;
    if(elapsed>=state.gestureDuration){state.gestureStart=0;state.nextGesture=now+1200+Math.random()*2800;return 0;}
    const p=elapsed/state.gestureDuration; return Math.min(1,p*6,(1-p)*6);
  }

  function animateVisibleArm(person,state,now,amount){
    const inward=state.homeX<0?1:-1, t=now*.001+state.phase, behavior=state.behavior;
    const arm=person.userData?.v731WaveArm, elbow=person.userData?.v731WaveElbow, bone=person.userData?.waveBone, base=person.userData?.waveBase;
    let lift=0,sweep=0,elbowBend=.32;
    if(behavior==='wave'){lift=amount*1.18;sweep=Math.sin(t*7.4)*.38*amount;elbowBend=.48+Math.sin(t*7.4+.8)*.22;}
    else if(behavior==='point'){lift=.82+amount*.12;sweep=Math.sin(t*1.1)*.07;elbowBend=.08;}
    else if(behavior==='cheer'){lift=1.06+amount*.18;sweep=Math.sin(t*4.6)*.14;elbowBend=.18;}
    else if(behavior==='carry'){lift=.20;elbowBend=.66;} else {lift=.10+amount*.12;sweep=Math.sin(t*1.5)*.05;}
    if(arm&&elbow){arm.rotation.set(-.10-lift*.24,0,inward*(-.62-lift*.78+sweep));elbow.rotation.set(0,0,inward*elbowBend);}
    else if(bone&&base){bone.rotation.copy(base);bone.rotation.x=base.x-lift*.96;bone.rotation.z=base.z+(person.userData.waveSide||inward)*(.20+lift*.66+sweep);}
  }

  function animatePerson(person,state,now,dt,extraAdvance){
    syncPersonZ(person,state,dt,extraAdvance);
    const t=now*.001+state.phase, amount=gestureEnvelope(state,now), behavior=state.behavior;
    let x=state.homeX,y=state.homeY,rx=0,ry=state.facing,rz=0;
    if(behavior==='walk'){x+=Math.sin(t*.60)*.54;y+=Math.abs(Math.sin(t*2.45))*.020;ry+=Math.sin(t*.60)*.10;rz=Math.sin(t*2.45)*.007;}
    else if(behavior==='cheer'){y+=Math.abs(Math.sin(t*2.55))*.055;rz=Math.sin(t*2.55)*.014;}
    else if(behavior==='point') ry+=(state.homeX<0?-.12:.12)+Math.sin(t*.62)*.018;
    else if(behavior==='bow'){const cycle=.5+.5*Math.sin(t*.56);rx=cycle>.72?-.22*((cycle-.72)/.28):0;}
    else if(behavior==='carry'){x+=Math.sin(t*.34)*.18;rz=Math.sin(t*1.7)*.007;} else y+=Math.sin(t*1.0)*.004;
    person.position.x=expLerp(person.position.x,x,12,dt); person.position.y=expLerp(person.position.y,y,12,dt);
    person.rotation.x=expLerp(person.rotation.x,rx,11,dt); person.rotation.y=expLerp(person.rotation.y,ry,11,dt); person.rotation.z=expLerp(person.rotation.z,rz,11,dt);
    animateVisibleArm(person,state,now,amount);
  }

  function ensureCroc(item){
    if(crocState.has(item)) return crocState.get(item);
    const model=item.userData?.v733Model||item.children?.find?.(child=>child&&!child.userData?.v733Wake)||item.children?.[0];
    const state={model,baseX:Number(item.userData?.v733BaseX??item.position.x),phase:Number(item.userData?.v733Phase??Math.random()*Math.PI*2)};
    item.userData.v734FacingPlayer=true; crocState.set(item,state); return state;
  }

  function animateCroc(item,state,now,dt){
    const t=now*.001+state.phase,lateral=Math.sin(t*1.05)*.38,yaw=Math.sin(t*1.05)*.075;
    item.position.x=expLerp(item.position.x,state.baseX+lateral,8,dt); item.rotation.x=expLerp(item.rotation.x,0,8,dt);
    item.rotation.y=expLerp(item.rotation.y,0,8,dt); item.rotation.z=expLerp(item.rotation.z,Math.sin(t*2.1)*.012,8,dt);
    const model=state.model;
    if(model){model.rotation.y=yaw;model.rotation.x=Math.sin(t*2.7)*.018;model.rotation.z=Math.sin(t*2.25+.7)*.018;model.position.y=-.18+Math.sin(t*3.0)*.035;}
    const wake=item.userData?.v733Wake;
    if(wake?.children){wake.position.z=-.18;wake.children.forEach((streak,index)=>{const pulse=.5+.5*Math.sin(t*4.7+index*2.1);streak.material.opacity=.10+pulse*.16;streak.scale.x=.95+pulse*.48;streak.position.z=-1.18-pulse*.28;});}
  }

  function updateBadge(scene){
    if(window.__mosesV735Installed||window.__mosesV736Installed) return;
    const badge=document.getElementById('version-badge'); if(!badge) return;
    const count=scene.children.filter(node=>node?.userData?.v73Person).length; badge.dataset.state='ready'; badge.textContent=`V7.3.4 · PEOPLE SMOOTH · CROCS FACE YOU · ${count}`;
  }

  function frame(now){
    const scene=window.__mosesV73Scene, dt=Math.min(.05,Math.max(.001,(now-lastNow)/1000)); lastNow=now;
    const distance=Number(document.getElementById('dist-txt')?.textContent||0), advance=Math.max(0,Math.min(3,distance-lastDistance)); lastDistance=distance;
    if(scene){
      scene.children.filter(node=>node?.userData?.v73Person).forEach((person,index)=>animatePerson(person,ensurePerson(person,index),now,dt,person.userData?.v733Extra?advance:0));
      if(!window.__mosesV735Installed&&!window.__mosesV736Installed){
        scene.children.forEach(node=>{if(node?.userData?.v73Croc) animateCroc(node,ensureCroc(node),now,dt);});
      }
      updateBadge(scene);
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
