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
    this.mask=new TerrainMask({waterLevel,riverHalfWidth:6.62,wetBandWidth:2.15});
    this.shoreline=new ShorelineSystem({mask:this.mask,waterLevel});
    this.query=new SurfaceQuerySystem({terrain:this,shoreline:this.shoreline});
    this.lodSystem=new TerrainLODSystem(lod);this.chunks=[];this.materialSystem=null;this.vegetation=null;this.rocks=null;this.ready=false;
    this.debug={showControlMap:false,showShoreDistance:false,showWetness:false,showLOD:false};
    this.footprints=[];this.footprintCursor=0;
  }
  sampleHeight(x,z){
    const d=this.mask.getDistanceToWater(x,z),centerDepth=Math.max(0,-d);
    const macro=(this.mask.fbm(x*.75,z)-.5)*.34,erosion=(this.mask.noise(x*.23+12,z*.23-9)-.5)*.10;
    if(d<0)return this.waterLevel-.16-Math.min(.78,centerDepth*.075)+macro*.16;
    const slope=Math.min(1.45,d*.058),terrace=Math.sin(z*.018+x*.045)*.055*Math.min(1,d/10);
    return this.waterLevel+.05+slope+macro+erosion+terrace;
  }
  async init(){
    this.hideLegacyTerrain();
    this.materialSystem=new TerrainMaterial({renderer:this.renderer,mask:this.mask,preferKTX2:this.preferKTX2,anisotropy:4});
    const material=await this.materialSystem.init();
    const s=this.chunkSize;
    const startX=Math.floor(this.bounds.minX/s)*s+s*.5,endX=Math.ceil(this.bounds.maxX/s)*s-s*.5;
    const startZ=Math.floor(this.bounds.minZ/s)*s+s*.5,endZ=Math.ceil(this.bounds.maxZ/s)*s-s*.5;
    for(let z=startZ;z<=endZ+.1;z+=s)for(let x=startX;x<=endX+.1;x+=s)this.chunks.push(new TerrainChunk({system:this,cx:x,cz:z,size:s,material,lodDistances:[this.lodSystem.near,this.lodSystem.mid]}).load());
    this.createFootprintPool();
    this.vegetation=new VegetationSystem({scene:this.scene,terrain:this}).generate();
    this.rocks=new RockScatterSystem({scene:this.scene,terrain:this}).generate();
    this.controlMap=this.mask.createControlTexture({...this.bounds,resolution:256});
    this.ready=true;return this;
  }
  hideLegacyTerrain(){
    this.scene.traverse((node)=>{
      if(!node?.isMesh)return;
      const ud=node.userData||{},name=String(node.name||'');
      const mats=Array.isArray(node.material)?node.material:[node.material];
      const colors=mats.map(m=>m?.color?.getHex?.());
      const legacy=ud.v73Bank||ud.v73WetBank||ud.v73GreenBank||ud.v739RiverBankOccluders||ud.v7310Shoreline||/V739RiverBankOccluders|V7310OpaqueShoreline/.test(name)||colors.some(c=>[0xc98638,0xd4a35f,0x8d673d,0x8c7045,0x4d7542,0x4f7c45,0xa87343].includes(c));
      if(legacy)node.visible=false;
    });
  }
  createFootprintPool(){
    const geo=new THREE.CircleGeometry(.18,12);geo.scale(.58,1,1);const mat=new THREE.MeshBasicMaterial({color:0x4b4034,transparent:true,opacity:.18,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1});
    for(let i=0;i<24;i++){const mesh=new THREE.Mesh(geo,mat.clone());mesh.rotation.x=-Math.PI/2;mesh.visible=false;mesh.renderOrder=5;this.scene.add(mesh);this.footprints.push({mesh,age:99,lifetime:10});}
  }
  addFootprint({position,rotation=0,type}={}){
    if(!position||!['mud','wetSand','sand'].includes(type||this.getSurfaceTypeAt(position.x,position.z)))return;
    const f=this.footprints[this.footprintCursor++%this.footprints.length];f.age=0;f.lifetime=type==='sand'?5:10;f.mesh.visible=true;f.mesh.position.set(position.x,this.getHeightAt(position.x,position.z)+.018,position.z);f.mesh.rotation.z=rotation;f.mesh.material.opacity=type==='sand'?.10:.18;
  }
  getHeightAt(x,z){return this.query.getHeightAt(x,z);}
  getSurfaceTypeAt(x,z){return this.query.getSurfaceTypeAt(x,z);}
  getWetnessAt(x,z){return this.query.getWetnessAt(x,z);}
  getShorelineData(){return {waterLevel:this.waterLevel,shoreMask:this.mask,terrainBounds:this.bounds,terrain:this};}
  setDebug(flags={}){Object.assign(this.debug,flags);let mode=0;if(this.debug.showControlMap)mode=1;else if(this.debug.showShoreDistance)mode=2;else if(this.debug.showWetness)mode=3;this.materialSystem?.setDebugMode(mode);}
  update(camera,dt=0){
    this.lodSystem.update(this.chunks,camera);this.vegetation?.update(camera,dt);this.rocks?.update(camera);
    for(const f of this.footprints){if(!f.mesh.visible)continue;f.age+=dt;const p=f.age/f.lifetime;if(p>=1)f.mesh.visible=false;else f.mesh.material.opacity*=Math.pow(Math.max(.001,1-p),dt*.9);}
  }
}
