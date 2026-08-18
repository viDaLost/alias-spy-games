class AssetManager {
  constructor(){
    this.gltfLoader=new THREE.GLTFLoader();
    this.objLoader=new THREE.OBJLoader();
    this.basketModel=null;
    this.models={};
    this.environmentPromise=null;
  }

  async loadBasketModel(){
    const candidatePaths=['models/basket.glb','models/woven-basket.glb','models/basket.obj','models/woven-basket.obj','basket.glb','woven_basket.glb','basket.obj'];
    for(const path of candidatePaths){
      try{
        const model=await this._tryLoad(path);
        if(model){
          console.log(`[AssetManager] basket loaded: ${path}`);
          this.basketModel=this._prepareBasket(model);
          return this.basketModel.clone(true);
        }
      }catch{}
    }
    console.warn('[AssetManager] local basket unavailable, using procedural basket');
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
      log:'models/environment/survival_pack/WoodLog.glb',
      raft:'models/environment/survival_pack/Raft.glb'
    };
    this.environmentPromise=Promise.all(Object.entries(sources).map(async([key,url])=>{
      try{
        const model=await this._tryLoad(url);
        this.models[key]=this._prepareEnvironment(model);
        console.log(`[AssetManager] environment loaded: ${key}`);
      }catch(err){
        console.warn(`[AssetManager] environment fallback: ${key}`,err?.message||err);
      }
    })).then(()=>this.models);
    return this.environmentPromise;
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

  _prepareEnvironment(root){
    root.traverse(child=>{
      if(child.isMesh){
        child.castShadow=true;
        child.receiveShadow=true;
        if(child.material){
          child.material=child.material.clone();
          child.material.roughness=Math.max(.55,child.material.roughness??.8);
          child.material.metalness=Math.min(.12,child.material.metalness??0);
        }
      }
    });
    return root;
  }

  _prepareBasket(root){
    const box=new THREE.Box3().setFromObject(root);
    const size=new THREE.Vector3();box.getSize(size);
    const maxDim=Math.max(size.x,size.y,size.z);
    const scale=1.4/(maxDim||1);
    root.scale.setScalar(scale);
    const center=new THREE.Vector3();box.getCenter(center);
    root.position.sub(center.multiplyScalar(scale));
    root.traverse(child=>{
      if(child.isMesh){
        child.castShadow=true;child.receiveShadow=true;
        if(child.material){
          child.material=child.material.clone();
          child.material.roughness=Math.max(.55,child.material.roughness??.8);
          child.material.metalness=Math.min(.12,child.material.metalness??0);
        }
      }
    });
    const wrapper=new THREE.Group();wrapper.add(root);this._addBabyMoses(wrapper);return wrapper;
  }

  _addBabyMoses(parent){
    const blanket=new THREE.Mesh(new THREE.SphereGeometry(.45,12,12,0,Math.PI*2,0,Math.PI/2),new THREE.MeshStandardMaterial({color:0xf8fafc,roughness:.5}));
    blanket.position.set(0,.1,0);blanket.castShadow=true;parent.add(blanket);
    const head=new THREE.Mesh(new THREE.SphereGeometry(.18,12,12),new THREE.MeshStandardMaterial({color:0xffd1a4,roughness:.6}));
    head.position.set(0,.28,.1);head.castShadow=true;parent.add(head);
  }

  createProceduralBasket(){
    const group=new THREE.Group();
    const basket=new THREE.Mesh(new THREE.CylinderGeometry(.85,.6,.55,16),new THREE.MeshStandardMaterial({color:0x8b5a2b,roughness:.85,flatShading:true}));
    basket.castShadow=true;group.add(basket);this._addBabyMoses(group);return group;
  }
}
window.assetManager=new AssetManager();
