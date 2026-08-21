class AssetManager {
  constructor(){
    this.gltfLoader=new THREE.GLTFLoader();
    this.objLoader=new THREE.OBJLoader();
    this.basketModel=null;
    this.models={};
    this.environmentPromise=null;
    this.gameplayPromise=null;
    this.sources={};
  }

  async loadBasketModel(){
    const localObjPaths=['/web/assets/models/moses-nile/woven-basket.obj','models/basket.obj','models/woven-basket.obj'];
    for(const path of localObjPaths){
      try{
        const response=await fetch(path,{cache:'no-store'});
        if(!response.ok)continue;
        const parsed=this._parseBasketObj(await response.text());
        if(parsed){
          console.log(`[AssetManager] woven basket parsed: ${path}`);
          window.__mosesBasketSource='woven-obj';
          this.basketModel=this._prepareBasket(parsed);
          return this.basketModel.clone(true);
        }
      }catch(err){
        console.warn(`[AssetManager] woven basket parse failed: ${path}`,err?.message||err);
      }
    }

    const candidatePaths=['models/basket.glb','models/woven-basket.glb','basket.glb','woven_basket.glb','basket.obj'];
    for(const path of candidatePaths){
      try{
        const model=await this._tryLoad(path);
        if(model){
          console.log(`[AssetManager] basket loader fallback: ${path}`);
          window.__mosesBasketSource='loader-fallback';
          this.basketModel=this._prepareBasket(model);
          return this.basketModel.clone(true);
        }
      }catch{}
    }

    console.warn('[AssetManager] local basket unavailable, using procedural basket');
    window.__mosesBasketSource='procedural';
    return this.createProceduralBasket();
  }

  async preloadEnvironmentModels(){
    if(this.environmentPromise)return this.environmentPromise;
    const sources={
      rock:'models/environment/nature_pack/Rock_1.glb',
      reeds:'models/environment/nature_pack/Plant_2.glb',
      bush:'models/environment/nature_pack/Bush_1.glb',
      grass:'models/environment/nature_pack/Grass.glb',
      bankPlant:'models/environment/nature_pack/Plant_1.glb',
      palm:'models/environment/nature_pack/PalmTree_4.glb',
      log:'models/environment/survival_pack/WoodLog.glb'
    };
    this.environmentPromise=Promise.all(Object.entries(sources).map(async([key,url])=>{
      try{
        const model=await this._tryLoad(url);
        this.models[key]=this._prepareEnvironment(model);
        this.sources[key]=url;
        console.log(`[AssetManager] environment loaded: ${key}`);
      }catch(err){
        console.warn(`[AssetManager] environment fallback: ${key}`,err?.message||err);
      }
    })).then(()=>this.models);
    return this.environmentPromise;
  }

  async preloadGameplayModels(){
    if(this.gameplayPromise)return this.gameplayPromise;
    this.gameplayPromise=(async()=>{
      await this.preloadEnvironmentModels();
      const sources={
        crocodile:'models/v73/crocodile.glb',
        lotus:'models/v73/lotus-flower.obj'
      };
      await Promise.all(Object.entries(sources).map(async([key,url])=>{
        try{
          const model=await this._tryLoad(url);
          this.models[key]=key==='lotus'?this._prepareLotus(model):this._prepareEnvironment(model,.58);
          this.sources[key]=url;
          console.log(`[AssetManager] gameplay model loaded: ${key}`);
        }catch(err){
          console.warn(`[AssetManager] gameplay fallback: ${key}`,err?.message||err);
        }
      }));
      window.__mosesV75ModelSources={...this.sources};
      return this.models;
    })();
    return this.gameplayPromise;
  }

  hasModel(name){return !!this.models[name];}

  cloneModel(name,targetSize=1){
    const source=this.models[name];
    if(!source)return null;
    const clone=source.clone(true);
    const box=new THREE.Box3().setFromObject(clone);
    const size=new THREE.Vector3();
    box.getSize(size);
    const maxDim=Math.max(size.x,size.y,size.z)||1;
    clone.scale.multiplyScalar(targetSize/maxDim);
    const adjustedBox=new THREE.Box3().setFromObject(clone);
    clone.position.y-=adjustedBox.min.y;
    clone.traverse(child=>{if(child.isMesh){child.castShadow=true;child.receiveShadow=true;}});
    return clone;
  }

  _tryLoad(url){
    return new Promise((resolve,reject)=>{
      const glb=/\.gl(?:b|tf)$/i.test(url);
      const loader=glb?this.gltfLoader:this.objLoader;
      loader.load(url,res=>resolve(glb?res.scene:res),undefined,reject);
    });
  }

  _prepareEnvironment(root,minRoughness=.55){
    root.traverse(child=>{
      if(child.isMesh){
        child.castShadow=true;
        child.receiveShadow=true;
        if(child.material){
          const materials=(Array.isArray(child.material)?child.material:[child.material]).map(material=>{
            const next=material.clone();
            if('roughness' in next)next.roughness=Math.max(minRoughness,next.roughness??.8);
            if('metalness' in next)next.metalness=Math.min(.12,next.metalness??0);
            next.side=THREE.DoubleSide;
            return next;
          });
          child.material=Array.isArray(child.material)?materials:materials[0];
        }
      }
    });
    return root;
  }

  _prepareLotus(root){
    const lotusColor=name=>{
      const id=String(name||'').toLowerCase();
      if(id.includes('center')||id.includes('stamen'))return 0xe7bd43;
      if(id.includes('inner'))return 0xf8cadc;
      if(id.includes('mid'))return 0xef8eb6;
      if(id.includes('outer'))return 0xd95d8e;
      return 0xee91b8;
    };
    root.name='ProjectOwnedNileLotus';
    root.traverse(child=>{
      if(!child.isMesh)return;
      child.castShadow=true;
      child.receiveShadow=true;
      child.material=new THREE.MeshStandardMaterial({
        color:lotusColor(child.name||child.parent?.name),
        roughness:.72,
        metalness:0,
        side:THREE.DoubleSide
      });
    });
    return root;
  }

  _makeBasketTexture(){
    const canvas=document.createElement('canvas');
    canvas.width=128;canvas.height=128;
    const ctx=canvas.getContext('2d');
    const base=ctx.createLinearGradient(0,0,128,128);
    base.addColorStop(0,'#e1a756');
    base.addColorStop(.38,'#b56c2d');
    base.addColorStop(.7,'#8d4d20');
    base.addColorStop(1,'#cf8740');
    ctx.fillStyle=base;ctx.fillRect(0,0,128,128);
    ctx.strokeStyle='rgba(72,35,14,.78)';ctx.lineWidth=5;
    for(let x=-128;x<256;x+=18){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x+128,128);ctx.stroke();}
    ctx.strokeStyle='rgba(255,220,151,.48)';ctx.lineWidth=3;
    for(let y=7;y<128;y+=15){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(128,y);ctx.stroke();}
    const texture=new THREE.CanvasTexture(canvas);
    texture.wrapS=texture.wrapT=THREE.RepeatWrapping;
    texture.repeat.set(3.2,2.1);
    texture.anisotropy=2;
    return texture;
  }

  _basketMaterial(){
    return new THREE.MeshStandardMaterial({
      color:0xc17a34,
      map:this._makeBasketTexture(),
      roughness:.9,
      metalness:0,
      side:THREE.DoubleSide
    });
  }

  _parseBasketObj(text){
    const vertices=[];
    const triangles=[];
    String(text||'').split(/\r?\n/).forEach(line=>{
      const value=line.trim();
      if(value.startsWith('v ')){
        const parts=value.split(/\s+/);
        vertices.push([Number(parts[1]),Number(parts[2]),Number(parts[3])]);
      }else if(value.startsWith('f ')){
        const ids=value.slice(2).trim().split(/\s+/).map(token=>{
          const raw=Number(token.split('/')[0]);
          return raw<0?vertices.length+raw:raw-1;
        });
        for(let i=1;i<ids.length-1;i++)triangles.push(ids[0],ids[i],ids[i+1]);
      }
    });
    if(vertices.length<3||triangles.length<3)return null;

    const positions=[];
    triangles.forEach(id=>{const p=vertices[id];if(p)positions.push(p[0],p[1],p[2]);});
    if(positions.length<9)return null;

    let minY=Infinity,maxY=-Infinity;
    for(let i=1;i<positions.length;i+=3){minY=Math.min(minY,positions[i]);maxY=Math.max(maxY,positions[i]);}
    const h=Math.max(.0001,maxY-minY);
    const uvs=[];
    for(let i=0;i<positions.length;i+=3){
      const x=positions[i],y=positions[i+1],z=positions[i+2];
      const u=(Math.atan2(z,x)/(Math.PI*2)+1)%1;
      const v=(y-minY)/h;
      uvs.push(u,v);
    }

    const geometry=new THREE.BufferGeometry();
    geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
    geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));
    geometry.computeVertexNormals();
    return new THREE.Mesh(geometry,this._basketMaterial());
  }

  _prepareBasket(root){
    const box=new THREE.Box3().setFromObject(root);
    const size=new THREE.Vector3();box.getSize(size);
    const maxDim=Math.max(size.x,size.y,size.z)||1;
    const scale=1.85/maxDim;
    const center=new THREE.Vector3();box.getCenter(center);
    root.scale.setScalar(scale);
    root.position.set(-center.x*scale,-center.y*scale+.42,-center.z*scale);
    root.rotation.y=Math.PI;
    root.traverse(child=>{
      if(child.isMesh){
        child.castShadow=true;
        child.receiveShadow=true;
        child.material=this._basketMaterial();
      }
    });

    const wrapper=new THREE.Group();
    wrapper.add(root);

    const rim=new THREE.Mesh(
      new THREE.TorusGeometry(.77,.065,7,24),
      new THREE.MeshStandardMaterial({color:0x7a421d,roughness:.92,metalness:0})
    );
    rim.rotation.x=Math.PI/2;
    rim.position.y=.39;
    rim.scale.z=.82;
    rim.castShadow=true;
    wrapper.add(rim);

    return wrapper;
  }

  _addBabyMoses(parent){
    const blanket=new THREE.Mesh(
      new THREE.SphereGeometry(.43,12,10,0,Math.PI*2,0,Math.PI/2),
      new THREE.MeshStandardMaterial({color:0xf3ead8,roughness:.82})
    );
    blanket.scale.set(1.05,.55,1.25);
    blanket.position.set(0,.42,-.02);
    blanket.castShadow=true;
    parent.add(blanket);

    const head=new THREE.Mesh(
      new THREE.SphereGeometry(.16,12,10),
      new THREE.MeshStandardMaterial({color:0xf0bd91,roughness:.72})
    );
    head.position.set(0,.58,.16);
    head.castShadow=true;
    parent.add(head);
  }

  createProceduralBasket(){
    const group=new THREE.Group();
    const basket=new THREE.Mesh(new THREE.CylinderGeometry(.85,.6,.55,16,1,true),this._basketMaterial());
    basket.position.y=.28;basket.castShadow=true;group.add(basket);
    const bottom=new THREE.Mesh(new THREE.CylinderGeometry(.6,.6,.08,16),this._basketMaterial());
    bottom.position.y=.04;bottom.castShadow=true;group.add(bottom);
    const rim=new THREE.Mesh(new THREE.TorusGeometry(.83,.07,7,24),new THREE.MeshStandardMaterial({color:0x75401c,roughness:.92}));
    rim.rotation.x=Math.PI/2;rim.position.y=.55;rim.castShadow=true;group.add(rim);
    return group;
  }
}
window.assetManager=new AssetManager();
