import * as THREE from 'three';
import { TerrainMask } from './TerrainMask.js';
import { ShorelineSystem } from './ShorelineSystem.js';
import { SurfaceQuerySystem } from './SurfaceQuerySystem.js';
import { TerrainMaterial } from './TerrainMaterial.js';
import { TerrainChunk } from './TerrainChunk.js';
import { TerrainLODSystem } from './TerrainLODSystem.js';
import { VegetationSystem } from './VegetationSystem.js';
import { RockScatterSystem } from './RockScatterSystem.js';

export class TerrainSystem {
  constructor({scene,renderer,waterLevel=-0.055,chunkSize=64,bounds={minX:-64,maxX:64,minZ:-320,maxZ:96},lod={near:40,mid:120,cull:270},preferKTX2=false}={}){
    this.scene=scene;this.renderer=renderer;this.waterLevel=waterLevel;this.chunkSize=chunkSize;this.bounds=bounds;this.preferKTX2=preferKTX2;
    this.mask=new TerrainMask({waterLevel,riverHalfWidth:6.18,wetBandWidth:2.9});
    this.shoreline=new ShorelineSystem({mask:this.mask,waterLevel});
    this.query=new SurfaceQuerySystem({terrain:this,shoreline:this.shoreline});
    this.lodSystem=new TerrainLODSystem(lod);this.chunks=[];this.materialSystem=null;this.vegetation=null;this.rocks=null;this.ready=false;
    this.debug={showControlMap:false,showShoreDistance:false,showWetness:false,showVegetationDensity:false,showLOD:false};this.footprints=[];this.footprintCursor=0;
  }
  sampleHeight(x,z){
    const d=this.mask.getDistanceToWater(x,z),macroN=this.mask.fbm(x*.55,z*.68)-.5,erosionN=this.mask.noise(x*.15+12,z*.15-9)-.5;
    if(d<0){
      const depth=Math.min(.72,.018+Math.pow(Math.max(0,-d),1.06)*.061);
      const shoreBlend=1-THREE.MathUtils.smoothstep(Math.max(0,-d),0,5.5);
      return this.waterLevel-depth+macroN*.026*shoreBlend;
    }
    const shore=THREE.MathUtils.smoothstep(d,0,4.0);
    const rise=Math.min(.94,.008+d*.0365);
    const relief=(macroN*.17+erosionN*.038)*(1-shore*.9);
    const oldChannel=Math.sin(z*.011+x*.026)*.022*THREE.MathUtils.smoothstep(d,5,18);
    return this.waterLevel+rise+relief+oldChannel;
  }
  async init(){
    this.hideLegacyTerrain();
    this.materialSystem=new TerrainMaterial({renderer:this.renderer,mask:this.mask,preferKTX2:this.preferKTX2,anisotropy:4});
    const material=await this.materialSystem.init(),s=this.chunkSize;
    const startX=Math.floor(this.bounds.minX/s)*s+s*.5,endX=Math.ceil(this.bounds.maxX/s)*s-s*.5,startZ=Math.floor(this.bounds.minZ/s)*s+s*.5,endZ=Math.ceil(this.bounds.maxZ/s)*s-s*.5;
    for(let z=startZ;z<=endZ+.1;z+=s)for(let x=startX;x<=endX+.1;x+=s)this.chunks.push(new TerrainChunk({system:this,cx:x,cz:z,size:s,material,lodDistances:[this.lodSystem.near,this.lodSystem.mid]}).load());
    this.createFootprintPool();
    this.vegetation=new VegetationSystem({scene:this.scene,terrain:this,maxReeds:92,maxGrass:58}).generate();
    this.rocks=new RockScatterSystem({scene:this.scene,terrain:this}).generate();
    this.controlMap=this.mask.createControlTexture({...this.bounds,resolution:256});this.ready=true;return this;
  }
  hideLegacyTerrain(){this.scene.traverse(node=>{if(!node?.isMesh)return;const ud=node.userData||{},name=String(node.name||''),mats=Array.isArray(node.material)?node.material:[node.material],colors=mats.map(m=>m?.color?.getHex?.());const legacy=ud.v73Bank||ud.v73WetBank||ud.v73GreenBank||ud.v739RiverBankOccluders||ud.v7310Shoreline||/V739RiverBankOccluders|V7310OpaqueShoreline/.test(name)||colors.some(c=>[0xc98638,0xd4a35f,0x8d673d,0x8c7045,0x4d7542,0x4f7c45,0xa87343].includes(c));if(legacy)node.visible=false;});}
  createFootprintPool(){const geo=new THREE.CircleGeometry(.18,12);geo.scale(.58,1,1);const mat=new THREE.MeshBasicMaterial({color:0x4b4034,transparent:true,opacity:.16,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1});for(let i=0;i<24;i++){const mesh=new THREE.Mesh(geo,mat.clone());mesh.rotation.x=-Math.PI/2;mesh.visible=false;mesh.renderOrder=5;this.scene.add(mesh);this.footprints.push({mesh,age:99,lifetime:10});}}
  addFootprint({position,rotation=0,type}={}){if(!position||!['mud','wetSand','sand'].includes(type||this.getSurfaceTypeAt(position.x,position.z)))return;const f=this.footprints[this.footprintCursor++%this.footprints.length];f.age=0;f.lifetime=type==='sand'?5:10;f.mesh.visible=true;f.mesh.position.set(position.x,this.getHeightAt(position.x,position.z)+.018,position.z);f.mesh.rotation.z=rotation;f.mesh.material.opacity=type==='sand'?.09:.16;}
  getHeightAt(x,z){return this.query.getHeightAt(x,z);}getSurfaceTypeAt(x,z){return this.query.getSurfaceTypeAt(x,z);}getWetnessAt(x,z){return this.query.getWetnessAt(x,z);}getShorelineData(){return {waterLevel:this.waterLevel,shoreMask:this.mask,terrainBounds:this.bounds,terrain:this};}
  setDebug(flags={}){Object.assign(this.debug,flags);let mode=0;if(this.debug.showControlMap)mode=1;else if(this.debug.showShoreDistance)mode=2;else if(this.debug.showWetness)mode=3;else if(this.debug.showVegetationDensity)mode=4;this.materialSystem?.setDebugMode(mode);if(this.materialSystem?.material){this.materialSystem.material.wireframe=Boolean(this.debug.showLOD);this.materialSystem.material.needsUpdate=true;}}
  update(camera,dt=0){this.lodSystem.update(this.chunks,camera);this.vegetation?.update(camera,dt);this.rocks?.update(camera);for(const f of this.footprints){if(!f.mesh.visible)continue;f.age+=dt;const p=f.age/f.lifetime;if(p>=1)f.mesh.visible=false;else f.mesh.material.opacity*=Math.pow(Math.max(.001,1-p),dt*.9);}}
}
