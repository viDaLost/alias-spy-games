(() => {
  'use strict';
  if (window.__mosesV738Installed || !window.THREE) return;
  window.__mosesV738Installed = true;

  const THREE = window.THREE;
  const crocState = new WeakMap();
  let pbrRetuned = false;
  let lastPeopleCount = 0;

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const smoothstep = (v) => { const t = clamp(v, 0, 1); return t * t * (3 - 2 * t); };
  const bell = (z, start, peak, end) => {
    if (z <= start || z >= end) return 0;
    if (z <= peak) return smoothstep((z - start) / (peak - start));
    return 1 - smoothstep((z - peak) / (end - peak));
  };

  function findCrocModel(item) {
    return item?.userData?.v733Model
      || item?.children?.find?.((child) => child && !child.userData?.v733Wake && !child.userData?.v735Warning && !child.userData?.v738AttackFx)
      || item?.children?.[0]
      || null;
  }

  function findJawNode(model) {
    let jaw = null;
    model?.traverse?.((node) => {
      if (jaw) return;
      const name = String(node?.name || '').toLowerCase();
      if (/(lower.?jaw|jaw.?lower|mandible|mouth|jaw)/.test(name)) jaw = node;
    });
    return jaw;
  }

  function removeLegacyJawBox(item) {
    [...(item?.children || [])].forEach((child) => {
      if (child?.userData?.v737FallbackJaw || child?.name === 'V737FallbackJawPivot') item.remove(child);
    });
  }

  function makeAttackFx() {
    const group = new THREE.Group();
    group.userData.v738AttackFx = true;
    group.visible = false;
    const ringMat = new THREE.MeshBasicMaterial({color:0xcff7ff,transparent:true,opacity:0,depthWrite:false,side:THREE.DoubleSide});
    const ring = new THREE.Mesh(new THREE.RingGeometry(.62,.78,28), ringMat);
    ring.rotation.x=-Math.PI/2; ring.position.set(0,.045,1.30); ring.userData.v738BowRing=true; group.add(ring);
    for(let i=0;i<6;i+=1){
      const material=new THREE.MeshBasicMaterial({color:0xe7fbff,transparent:true,opacity:0,depthWrite:false,side:THREE.DoubleSide});
      const shard=new THREE.Mesh(new THREE.PlaneGeometry(.07,.46+(i%3)*.13),material);
      shard.position.set((i-2.5)*.18,.18+(i%2)*.10,1.36+(i%3)*.12); shard.rotation.z=(i-2.5)*.16; shard.userData.v738SplashShard=true; group.add(shard);
    }
    return group;
  }

  function ensureCroc(item) {
    removeLegacyJawBox(item);
    if(crocState.has(item)) return crocState.get(item);
    const model=findCrocModel(item), realJaw=findJawNode(model), attackFx=makeAttackFx(); item.add(attackFx);
    const state={model,realJaw,jawBase:realJaw?.rotation?.clone?.()||null,baseScale:model?.scale?.clone?.()||new THREE.Vector3(1,1,1),phase:Number(item.userData?.v733Phase??Math.random()*Math.PI*2),attackFx};
    item.userData.v738Attack=true; crocState.set(item,state); return state;
  }

  function animateWarning(item,now){
    const warning=item.children?.find?.((child)=>child?.userData?.v735Warning); if(!warning)return;
    const z=Number(item.position.z),enter=smoothstep((z+60)/7.5),exit=1-smoothstep((z+38)/5.5),visibility=enter*exit;
    warning.visible=visibility>.015;
    warning.children?.forEach?.((ring,index)=>{const pulse=.5+.5*Math.sin(now*.0075+index*1.9);if(ring.material?.color)ring.material.color.setHex(index===1?0xffd88c:0xe4fbff);if(ring.material)ring.material.opacity=visibility*(.16+pulse*.30);const scale=.92+index*.26+pulse*.28;ring.scale.setScalar(scale);});
  }

  function animateAttackFx(state,now,lunge,snap){
    const fx=state.attackFx;if(!fx)return;const amount=Math.max(lunge*.72,snap);fx.visible=amount>.025;if(!fx.visible)return;
    fx.children.forEach((child,index)=>{if(child.userData.v738BowRing){const pulse=.5+.5*Math.sin(now*.012);child.material.opacity=amount*(.10+pulse*.24);child.scale.setScalar(.92+amount*.75+pulse*.12);child.position.z=1.25+lunge*.58;}else if(child.userData.v738SplashShard){const pulse=.5+.5*Math.sin(now*.015+index*.9);child.material.opacity=amount*(.14+pulse*.34);child.scale.y=.72+amount*(.72+pulse*.38);child.position.y=.12+amount*(.18+(index%3)*.06);child.position.z=1.30+lunge*.48+(index%3)*.10;}});
  }

  function animateCroc(item,state,now){
    removeLegacyJawBox(item);animateWarning(item,now);const model=state.model;if(!model)return;
    const z=Number(item.position.z),t=now*.001+state.phase,rise=smoothstep((z+46)/9.0),surfaced=z>=-37,lunge=bell(z,-21.5,-13.3,-7.5),snap=bell(z,-13.0,-10.4,-8.0),recover=bell(z,-9.0,-6.6,-4.5);
    if(z<-46)model.position.y=-1.76;else if(!surfaced)model.position.y=-1.76+rise*1.64;else model.position.y=-.12+Math.sin(t*3.4)*.045;
    model.position.z=lunge*.62+snap*.12-recover*.05;model.rotation.y=Math.sin(t*1.2)*.065*Math.max(.2,rise);model.rotation.z=Math.sin(t*2.8+.6)*.022*Math.max(.2,rise);model.rotation.x=Math.sin(t*3.0)*.018-lunge*.15+snap*.105+recover*.035;
    model.scale.set(state.baseScale.x*(1+snap*.025),state.baseScale.y*(1-snap*.022),state.baseScale.z*(1+lunge*.045+snap*.025));
    if(state.realJaw&&state.jawBase){const open=bell(z,-21.5,-14.8,-11.4),close=snap;state.realJaw.rotation.copy(state.jawBase);state.realJaw.rotation.x=state.jawBase.x+open*.74-close*.18;}
    item.userData.radius=z<-31?0:1.82;animateAttackFx(state,now,lunge,snap);
  }

  function retunePbr(scene){
    if(pbrRetuned||!window.__mosesV736TexturesReady)return;
    scene.traverse((node)=>{if(!node?.isMesh||!node.material)return;const materials=Array.isArray(node.material)?node.material:[node.material];materials.forEach((material)=>{if(!material)return;if(node.userData?.v73Bank){material.color?.set?.(0xe2aa54);material.roughness=.94;if(material.normalScale)material.normalScale.set(.68,.68);}else if(node.userData?.v73WetBank){material.color?.set?.(0xad7746);material.roughness=.86;if(material.normalScale)material.normalScale.set(.50,.50);}else if(node.userData?.v73GreenBank){material.color?.set?.(0x73784b);material.roughness=.92;if(material.normalScale)material.normalScale.set(.36,.36);}if(node.userData?.v736Foam||node.userData?.bankGuide||node.name==='V736FoamStrip')node.visible=false;});});
    const edgeGroup=scene.children.find((node)=>node?.userData?.v736BankEdgeCover);edgeGroup?.children?.forEach?.((child)=>{child.visible=true;child.material?.color?.set?.(0xaf7946);if(child.material)child.material.roughness=.88;if(child.material?.normalScale)child.material.normalScale.set(.44,.44);});pbrRetuned=true;
  }

  function updateBadge(scene){
    const badge=document.getElementById('version-badge');if(!badge)return;lastPeopleCount=scene.children.filter((node)=>node?.userData?.v73Person).length;const ready=Boolean(window.__mosesV736TexturesReady&&window.__mosesV737Installed&&lastPeopleCount>=20);window.__mosesV738Ready=ready;badge.dataset.state=ready?'ready':'';badge.textContent=ready?`V7.3.8 · PBR SAND · CROCS STRIKE · ${lastPeopleCount} PEOPLE`:`V7.3.8 · LOADING · ${lastPeopleCount} PEOPLE`;
  }

  function frame(now){const scene=window.__mosesV73Scene;if(scene){retunePbr(scene);scene.children.forEach((node)=>{if(node?.userData?.v73Croc)animateCroc(node,ensureCroc(node),now);});updateBadge(scene);}requestAnimationFrame(frame);}
  requestAnimationFrame(frame);
})();
