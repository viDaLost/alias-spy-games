class AssetManager {
  constructor(){
    this.gltfLoader=new THREE.GLTFLoader();
    this.objLoader=new THREE.OBJLoader();
    this.basketModel=null;
    this.models={};
    this.environmentPromise=null;
    this.gameplayPromise=null;
    this.hippoPromise=null;
    this.hippoRigs=[];
    this.hippoBuffer=null;
    this.hippoTopUp=null;
    this.hippoRigsMade=0;
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
      broadleaf:'models/environment/nature_pack/Plant_2.glb',
      bush:'models/environment/nature_pack/Bush_1.glb',
      grass:'models/environment/nature_pack/Grass.glb',
      bankPlant:'models/environment/nature_pack/Plant_1.glb',
      palm:'models/environment/nature_pack/PalmTree_4.glb',
      log:'models/environment/survival_pack/WoodLog.glb',
      boat:'models/v73/Boat.glb',
      flowers:'models/v73/Flowers.glb',
      papyrus:'models/v75/papyrus.glb',
      ship:'models/v75/ship.glb'
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
        lotus:'models/v75/lotus.glb',
        lotusFallback:'models/v73/lotus-flower.obj',
        // Жетоны усилителей: щит веры, корзинка Мириам, крылья ветра и сердце
        // милости. Раньше все четыре лепились из примитивов прямо в игре.
        tokenShield:'models/v75/shield.glb',
        tokenMagnet:'models/v75/basket-token.glb',
        tokenRush:'models/v75/wings.glb',
        tokenMercy:'models/v75/heart.glb'
      };
      await Promise.all(Object.entries(sources).map(async([key,url])=>{
        try{
          const model=await this._tryLoad(url);
          if(/^token/.test(key))this.models[key]=this._prepareToken(model,key);
          else this.models[key]=/^lotus/.test(key)?this._prepareLotus(model):this._prepareEnvironment(model,.58);
          this.sources[key]=url;
          console.log(`[AssetManager] gameplay model loaded: ${key}`);
        }catch(err){
          console.warn(`[AssetManager] gameplay fallback: ${key}`,err?.message||err);
        }
      }));
      // Настоящий лотос лежит в GLB; собственная OBJ-модель остаётся
      // запасной на случай, если пакет не приехал.
      if(!this.models.lotus&&this.models.lotusFallback){
        this.models.lotus=this.models.lotusFallback;
        this.sources.lotus=this.sources.lotusFallback;
      }
      await this.preloadHippoRigs();
      window.__mosesV75ModelSources={...this.sources};
      return this.models;
    })();
    return this.gameplayPromise;
  }

  /*
    Бегемот приезжает скинованным, со скелетом и пятью анимациями. Обычный
    clone() отдал бы всем экземплярам общий скелет — они двигались бы
    синхронно, как один зверь. SkeletonUtils для этого не нужен: файл
    разбирается заново под каждую копию, и у каждой свой скелет и свой микшер.
    Копий немного: больше двух-трёх бегемотов на экране не бывает.
  */
  async preloadHippoRigs(copies=5){
    if(this.hippoPromise)return this.hippoPromise;
    this.hippoPromise=(async()=>{
      const response=await fetch('models/v75/hippo.glb',{cache:'force-cache'});
      if(!response.ok)throw new Error(`hippo ${response.status}`);
      // Буфер держим при себе: пул скелетов доливается на ходу, когда на
      // реке оказывается больше зверей, чем было заготовлено на загрузке.
      this.hippoBuffer=await response.arrayBuffer();
      const rigs=[];
      for(let i=0;i<copies;i+=1){
        const rig=await this._parseHippoRig();
        if(rig)rigs.push(rig);
      }
      this.hippoRigs=rigs;
      this.hippoRigsMade=rigs.length;
      this.sources.hippo='models/v75/hippo.glb';
      console.log(`[AssetManager] hippo rigs ready: ${rigs.length}`);
      return rigs;
    })().catch(err=>{
      console.warn('[AssetManager] hippo rig fallback',err?.message||err);
      this.hippoRigs=[];
      return [];
    });
    return this.hippoPromise;
  }

  async _parseHippoRig(){
    if(!this.hippoBuffer)return null;
    const gltf=await new Promise((resolve,reject)=>this.gltfLoader.parse(this.hippoBuffer.slice(0),'',resolve,reject));
    return {scene:gltf.scene,animations:gltf.animations||[]};
  }

  /*
    Долив скелетов. Старой процедурной модели бегемота больше нет, поэтому
    пустой пул означал бы препятствие без вида — вместо этого пул тихо
    доливается в фоне до потолка, а генератор рядов до тех пор просто не
    ставит бегемота.
  */
  hippoRigCount(){return this.hippoRigs?this.hippoRigs.length:0;}

  topUpHippoRigs(target=5,ceiling=8){
    if(this.hippoTopUp||!this.hippoBuffer)return;
    if(this.hippoRigsMade>=ceiling)return;
    if(this.hippoRigCount()>=target)return;
    this.hippoTopUp=(async()=>{
      try{
        const rig=await this._parseHippoRig();
        if(rig){
          this.hippoRigs.push(rig);
          this.hippoRigsMade+=1;
        }
      }catch(err){
        console.warn('[AssetManager] hippo rig top-up',err?.message||err);
      }finally{
        this.hippoTopUp=null;
      }
    })();
  }

  takeHippoRig(){
    const rig=this.hippoRigs&&this.hippoRigs.length?this.hippoRigs.pop():null;
    this.topUpHippoRigs();
    return rig;
  }

  hasModel(name){return !!this.models[name];}

  modelKeys(){return Object.keys(this.models);}

  /*
    Клонирование с кешированными габаритами: Box3 по исходной модели считается
    один раз, дальше работает только умножение. На спавне это заметно —
    крокодил из GLB иначе перебирает тысячи вершин на каждом появлении.
  */
  _metrics(name){
    if(this._metricsCache&&this._metricsCache[name])return this._metricsCache[name];
    this._metricsCache=this._metricsCache||{};
    const source=this.models[name];
    if(!source)return null;
    const box=new THREE.Box3().setFromObject(source);
    const size=new THREE.Vector3();
    box.getSize(size);
    const center=new THREE.Vector3();
    box.getCenter(center);
    const metrics={
      maxDim:Math.max(size.x,size.y,size.z)||1,
      minY:box.min.y,
      centerX:center.x,
      centerZ:center.z,
      size:size.clone()
    };
    this._metricsCache[name]=metrics;
    return metrics;
  }

  cloneModel(name,targetSize=1,options={}){
    const source=this.models[name];
    if(!source)return null;
    const metrics=this._metrics(name);
    const clone=source.clone(true);
    const scale=targetSize/metrics.maxDim;
    clone.scale.multiplyScalar(scale);
    if(options.ground!==false)clone.position.y-=metrics.minY*scale;
    if(options.center!==false){clone.position.x-=metrics.centerX*scale;clone.position.z-=metrics.centerZ*scale;}
    const castShadow=options.castShadow!==false;
    clone.traverse(child=>{if(child.isMesh){child.castShadow=castShadow;child.receiveShadow=true;}});
    /*
      Центровка сделана сдвигом позиции, и это работает ровно до первого
      поворота: вращение идёт вокруг собственного начала координат объекта,
      а геометрия внутри смещена на тот же вектор в другую сторону — модель
      уносит на удвоенное смещение. У присланной ладьи центр геометрии стоит
      в двух тысячах единиц от начала координат, и поворот выбрасывал её на
      берег за пределы русла.

      Поэтому наружу отдаётся оболочка: сдвиг центровки живёт внутри неё, а
      поворот снаружи вращает модель вокруг неё самой. Все вызывающие ставят
      rotation на то, что вернул cloneModel, так что чинится это здесь один
      раз и для камней, брёвен, папируса и лотоса тоже.
    */
    const pivot=new THREE.Group();
    pivot.name=clone.name||name;
    pivot.add(clone);
    pivot.userData.fittedSize=metrics.size.clone().multiplyScalar(scale);
    return pivot;
  }

  _tryLoad(url){
    return new Promise((resolve,reject)=>{
      const glb=/\.gl(?:b|tf)$/i.test(url);
      const loader=glb?this.gltfLoader:this.objLoader;
      loader.load(url,res=>resolve(glb?res.scene:res),undefined,reject);
    });
  }

  /*
    Модели Quaternius приходят без UV-развёртки и с плоской заливкой — из-за
    этого они читались как пластмасса. Здесь каждой геометрии считается
    проекционная развёртка, а материалу выдаются процедурные карты цвета,
    нормалей и шероховатости из NileMaterials.
  */
  _prepareEnvironment(root,minRoughness=.55){
    const pbr=window.NileMaterials;
    root.traverse(child=>{
      if(child.isMesh){
        child.castShadow=true;
        child.receiveShadow=true;
        // Без нормалей MeshStandardMaterial выводится чёрным силуэтом. Их
        // может не быть: у моделей из SketchUp нормали приходится снимать,
        // чтобы сварить вершины, а из материалов без освещения их вычищает
        // сама оптимизация как неиспользуемый атрибут.
        if(!child.geometry.attributes.normal)child.geometry.computeVertexNormals();
        if(child.material){
          const materials=(Array.isArray(child.material)?child.material:[child.material]).map(material=>{
            const next=material.clone();
            if('roughness' in next)next.roughness=Math.max(minRoughness,next.roughness??.8);
            if('metalness' in next)next.metalness=Math.min(.12,next.metalness??0);
            next.side=THREE.DoubleSide;
            pbr?.dress?.(next,child.geometry,{
              name:material.name||child.name,
              uvScale:.85,
              normalScale:.9,
              bleach:.18
            });
            return next;
          });
          child.material=Array.isArray(child.material)?materials:materials[0];
        }
      }
    });
    return root;
  }

  /*
    Лотос из OBJ приезжает разбитым на несколько десятков групп — по одной
    на лепесток. В сцене это давало под сорок вызовов отрисовки на каждый
    цветок. Здесь всё сливается в один меш, а цвет лепестковых слоёв
    переезжает в вершинные цвета.
  */
  /*
    Жетоны усилителей приезжают готовыми: у щита — свои металлы, у корзинки
    запечённая плетёнка, у крыльев перо с альфой, у сердца чистый цвет. Их
    нельзя гонять ни через _prepareEnvironment (он перекрашивает по именам
    материалов), ни через _prepareLotus (бестекстурные модели он выкрасит в
    розовый). Здесь только приведение к MeshStandardMaterial, нормали, если
    их нет, и один целевой оттенок — крылья владелец просил бело-голубые.
  */
  _prepareToken(root,key){
    const TINT={
      tokenRush:{color:0xdcefff,emissive:0x5fa8d8,emissiveIntensity:.34,roughness:.52},
      tokenMercy:{color:0xff5f76,emissive:0x8f1c33,emissiveIntensity:.22,roughness:.42},
      tokenShield:{emissive:0x1d5c56,emissiveIntensity:.16},
      tokenMagnet:{emissive:0x6b4a16,emissiveIntensity:.14},
    };
    const tint=TINT[key]||{};
    root.traverse(child=>{
      if(!child.isMesh)return;
      if(!child.geometry.attributes.normal)child.geometry.computeVertexNormals();
      const list=Array.isArray(child.material)?child.material:[child.material];
      child.material=list.map(source=>{
        if(!source)return source;
        const transparent=source.transparent===true||source.alphaTest>0;
        const next=new THREE.MeshStandardMaterial({
          map:source.map||null,
          color:(tint.color!==undefined?new THREE.Color(tint.color):(source.color?source.color.clone():new THREE.Color(0xffffff))),
          roughness:tint.roughness??(typeof source.roughness==='number'?source.roughness:.6),
          metalness:typeof source.metalness==='number'?source.metalness:0,
          emissive:new THREE.Color(tint.emissive??0x000000),
          emissiveIntensity:tint.emissiveIntensity??0,
          // Перья с альфой рисуем отсечением, а не смешиванием: полупрозрачный
          // жетон над водой сортируется поверх пены и мерцает.
          transparent:false,
          alphaTest:transparent?.42:0,
          side:transparent?THREE.DoubleSide:THREE.FrontSide,
        });
        next.name=source.name||key;
        return next;
      });
      if(!Array.isArray(list))child.material=child.material[0];
      child.castShadow=false;
      child.receiveShadow=false;
    });
    return root;
  }

  _prepareLotus(root){
    /*
      Настоящая модель лотоса приезжает со своей запечённой текстурой и
      материалом без освещения (KHR_materials_unlit): на воде он выглядел бы
      наклейкой, не реагирующей на время суток. Такую модель не перекрашиваем
      по именам материалов — только переводим в обычный PBR, чтобы биомы и
      закат ложились на неё как на всё остальное.
    */
    let textured=false;
    root.traverse(child=>{if(child.isMesh&&(Array.isArray(child.material)?child.material[0]:child.material)?.map)textured=true;});
    if(textured){
      root.traverse(child=>{
        if(!child.isMesh)return;
        if(!child.geometry.attributes.normal)child.geometry.computeVertexNormals();
        const source=Array.isArray(child.material)?child.material[0]:child.material;
        const next=new THREE.MeshStandardMaterial({
          map:source.map,
          color:0xffffff,
          roughness:.86,
          metalness:0,
          transparent:source.transparent===true,
          alphaTest:source.transparent?.4:0,
          side:THREE.DoubleSide,
        });
        next.name=source.name||'lotus';
        child.material=next;
        child.castShadow=false;
        child.receiveShadow=true;
      });
      return root;
    }
    const lotusColor=name=>{
      const id=String(name||'').toLowerCase();
      if(id.includes('center')||id.includes('stamen'))return 0xe7bd43;
      if(id.includes('inner'))return 0xf8cadc;
      if(id.includes('mid'))return 0xef8eb6;
      if(id.includes('outer'))return 0xd95d8e;
      return 0xee91b8;
    };
    root.updateMatrixWorld(true);
    const parts=[];
    root.traverse(child=>{if(child.isMesh)parts.push(child);});
    if(!parts.length)return root;

    let total=0;
    const prepared=parts.map(child=>{
      const geometry=(child.geometry.index?child.geometry.toNonIndexed():child.geometry.clone());
      geometry.applyMatrix4(child.matrixWorld);
      if(!geometry.attributes.normal)geometry.computeVertexNormals();
      total+=geometry.attributes.position.count;
      return {geometry,color:new THREE.Color(lotusColor(child.name||child.parent?.name))};
    });

    const position=new Float32Array(total*3);
    const normal=new Float32Array(total*3);
    const color=new Float32Array(total*3);
    let cursor=0;
    for(const part of prepared){
      const pos=part.geometry.attributes.position;
      const nor=part.geometry.attributes.normal;
      for(let i=0;i<pos.count;i++){
        const at=(cursor+i)*3;
        position[at]=pos.getX(i);position[at+1]=pos.getY(i);position[at+2]=pos.getZ(i);
        if(nor){normal[at]=nor.getX(i);normal[at+1]=nor.getY(i);normal[at+2]=nor.getZ(i);}
        color[at]=part.color.r;color[at+1]=part.color.g;color[at+2]=part.color.b;
      }
      cursor+=pos.count;
      part.geometry.dispose?.();
    }

    const merged=new THREE.BufferGeometry();
    merged.setAttribute('position',new THREE.Float32BufferAttribute(position,3));
    merged.setAttribute('normal',new THREE.Float32BufferAttribute(normal,3));
    merged.setAttribute('color',new THREE.Float32BufferAttribute(color,3));
    merged.computeBoundingSphere();

    const mesh=new THREE.Mesh(merged,new THREE.MeshStandardMaterial({
      vertexColors:true,
      roughness:.7,
      metalness:0,
      emissive:0x3a1420,
      emissiveIntensity:.12,
      side:THREE.DoubleSide
    }));
    mesh.castShadow=true;
    mesh.receiveShadow=true;
    const wrapper=new THREE.Group();
    wrapper.name='ProjectOwnedNileLotus';
    wrapper.add(mesh);
    return wrapper;
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

  _makeBasketNormalTexture(){
    const canvas=document.createElement('canvas');
    canvas.width=canvas.height=128;
    const ctx=canvas.getContext('2d');
    ctx.fillStyle='#8080ff';ctx.fillRect(0,0,128,128);
    ctx.lineCap='round';
    for(let x=-128;x<256;x+=18){
      ctx.strokeStyle='#5a5aff';ctx.lineWidth=6;
      ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x+128,128);ctx.stroke();
      ctx.strokeStyle='#a6a6ff';ctx.lineWidth=3;
      ctx.beginPath();ctx.moveTo(x+4,0);ctx.lineTo(x+132,128);ctx.stroke();
    }
    for(let y=7;y<128;y+=15){
      ctx.strokeStyle='#7d7dff';ctx.lineWidth=4;
      ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(128,y);ctx.stroke();
    }
    const texture=new THREE.CanvasTexture(canvas);
    texture.wrapS=texture.wrapT=THREE.RepeatWrapping;
    texture.repeat.set(3.2,2.1);
    return texture;
  }

  _basketMaterial(){
    if(!this._basketMaterialCache){
      this._basketMaterialCache=new THREE.MeshStandardMaterial({
        color:0xc17a34,
        map:this._makeBasketTexture(),
        normalMap:this._makeBasketNormalTexture(),
        normalScale:new THREE.Vector2(.75,.75),
        roughness:.88,
        metalness:0,
        side:THREE.DoubleSide
      });
    }
    return this._basketMaterialCache.clone();
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
