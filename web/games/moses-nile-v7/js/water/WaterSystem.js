import * as THREE from 'three';
import { Water } from 'three/addons/objects/Water.js';

/**
 * Nile surface controller.
 * Tuning:
 * - waterColor / deepColor: Nile palette.
 * - rippleSpeed: normal-flow animation speed.
 * - distortionScale: apparent wave size (keep ~1.5-3 for a river).
 * - waterLevel: physical surface Y used by all interaction systems and TerrainSystem.
 */
export class WaterSystem {
  constructor({ scene, waterLevel = -0.055, width = 13.25, length = 620, normalUrl = 'textures/water/water-normal.jpg', waterColor = 0x465f52, deepColor = 0x304c44, distortionScale = 2.15, rippleSpeed = 0.35 } = {}) {
    this.scene = scene;this.waterLevel = waterLevel;this.width = width;this.length = length;this.normalUrl = normalUrl;this.waterColor = waterColor;this.deepColor = deepColor;this.distortionScale = distortionScale;this.rippleSpeed = rippleSpeed;
    this.water = null;this.normal = null;this.ready = false;this.shorelineData=null;this.shallowStrips=[];
  }
  async init() {
    this._hideLegacyWater();this.normal = await this._loadNormal(this.normalUrl);
    const geometry = new THREE.PlaneGeometry(this.width, this.length, 1, 1);
    this.water = new Water(geometry, {textureWidth:256,textureHeight:256,waterNormals:this.normal,sunDirection:new THREE.Vector3(0.5,1,0.3).normalize(),sunColor:0xf7ddb3,waterColor:this.waterColor,distortionScale:this.distortionScale,fog:Boolean(this.scene?.fog),alpha:1});
    this.water.rotation.x=-Math.PI/2;this.water.position.set(0,this.waterLevel,0);this.water.name='NileWaterV7312';this.water.userData.nileWater=true;this.water.renderOrder=0;this.scene.add(this.water);
    this.water.material.transparent=false;this.water.material.depthWrite=true;this.water.material.depthTest=true;this.water.material.side=THREE.FrontSide;
    this._addShallowTint();this.ready=true;return this.water;
  }
  setShorelineData(data){
    this.shorelineData=data||null;
    if(data?.waterLevel!==undefined)this.waterLevel=data.waterLevel;
    window.__mosesWaterShorelineShared=Boolean(data?.shoreMask&&data?.terrain);
    for(const strip of this.shallowStrips)strip.userData.shoreMask=data?.shoreMask||null;
  }
  _loadNormal(url){return new Promise((resolve,reject)=>{new THREE.TextureLoader().load(url,(texture)=>{texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.repeat.set(4.5,72);texture.anisotropy=2;resolve(texture);},undefined,reject);});}
  _hideLegacyWater(){this.scene?.traverse?.((node)=>{if(!node?.isMesh||node.userData?.nileWater)return;const mats=Array.isArray(node.material)?node.material:[node.material];const waterish=mats.some((m)=>{const hex=m?.color?.getHex?.();return hex===0x176b8b||hex===0x2289a3||hex===0x55adbd;});if(waterish||node.userData?.v736SecondWater||node.userData?.v736Shallows||node.userData?.v736Foam||node.userData?.bankGuide)node.visible=false;});}
  _addShallowTint(){
    const mat=new THREE.MeshBasicMaterial({color:0x65796a,transparent:true,opacity:.09,depthWrite:false,depthTest:true});
    for(const side of [-1,1]){const strip=new THREE.Mesh(new THREE.PlaneGeometry(.58,this.length),mat.clone());strip.rotation.x=-Math.PI/2;strip.position.set(side*(this.width*.5-.35),this.waterLevel+.008,0);strip.renderOrder=1;strip.userData.nileShallowTint=true;this.scene.add(strip);this.shallowStrips.push(strip);}
  }
  update(dt){
    if(!this.water)return;const uniforms=this.water.material?.uniforms;if(uniforms?.time)uniforms.time.value+=dt*this.rippleSpeed;
    if(this.normal){this.normal.offset.x=(this.normal.offset.x+dt*.006)%1;this.normal.offset.y=(this.normal.offset.y-dt*.018)%1;}
  }
}
