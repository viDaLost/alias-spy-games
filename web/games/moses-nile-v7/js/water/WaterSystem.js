import * as THREE from 'three';
import { Water } from 'three/addons/objects/Water.js';

export class WaterSystem {
  constructor({ scene, waterLevel = -0.055, width = 13.72, length = 620, normalUrl = 'textures/water/water-normal.jpg', waterColor = 0x435d50, deepColor = 0x304c44, distortionScale = 1.78, rippleSpeed = 0.24 } = {}) {
    this.scene=scene;this.waterLevel=waterLevel;this.width=width;this.length=length;this.normalUrl=normalUrl;this.waterColor=waterColor;this.deepColor=deepColor;this.distortionScale=distortionScale;this.rippleSpeed=rippleSpeed;
    this.water=null;this.normal=null;this.ready=false;this.shorelineData=null;this.shallowStrips=[];
  }
  async init(){
    this._hideLegacyWater();this.normal=await this._loadNormal(this.normalUrl);
    const geometry=new THREE.PlaneGeometry(this.width,this.length,1,1);
    this.water=new Water(geometry,{textureWidth:256,textureHeight:256,waterNormals:this.normal,sunDirection:new THREE.Vector3(.45,1,.25).normalize(),sunColor:0xffe1b6,waterColor:this.waterColor,distortionScale:this.distortionScale,fog:Boolean(this.scene?.fog),alpha:1});
    this.water.rotation.x=-Math.PI/2;this.water.position.set(0,this.waterLevel,0);this.water.name='NileWaterV7313';this.water.userData.nileWater=true;this.water.renderOrder=0;this.scene.add(this.water);
    this.water.material.transparent=false;this.water.material.depthWrite=true;this.water.material.depthTest=true;this.water.material.side=THREE.FrontSide;
    this._addShallowTint();this.ready=true;return this.water;
  }
  setShorelineData(data){this.shorelineData=data||null;if(data?.waterLevel!==undefined)this.waterLevel=data.waterLevel;window.__mosesWaterShorelineShared=Boolean(data?.shoreMask&&data?.terrain);for(const strip of this.shallowStrips)strip.userData.shoreMask=data?.shoreMask||null;}
  _loadNormal(url){return new Promise((resolve,reject)=>{new THREE.TextureLoader().load(url,(texture)=>{texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.repeat.set(3.4,54);texture.anisotropy=2;resolve(texture);},undefined,reject);});}
  _hideLegacyWater(){this.scene?.traverse?.((node)=>{if(!node?.isMesh||node.userData?.nileWater)return;const mats=Array.isArray(node.material)?node.material:[node.material];const waterish=mats.some(m=>{const hex=m?.color?.getHex?.();return hex===0x176b8b||hex===0x2289a3||hex===0x55adbd;});if(waterish||node.userData?.v736SecondWater||node.userData?.v736Shallows||node.userData?.v736Foam||node.userData?.bankGuide)node.visible=false;});}
  _addShallowTint(){
    const mat=new THREE.MeshBasicMaterial({color:0x6d7565,transparent:true,opacity:.055,depthWrite:false,depthTest:true});
    for(const side of [-1,1]){const strip=new THREE.Mesh(new THREE.PlaneGeometry(.72,this.length),mat.clone());strip.rotation.x=-Math.PI/2;strip.position.set(side*(this.width*.5-.44),this.waterLevel+.009,0);strip.renderOrder=1;strip.userData.nileShallowTint=true;this.scene.add(strip);this.shallowStrips.push(strip);}
  }
  update(dt){if(!this.water)return;const uniforms=this.water.material?.uniforms;if(uniforms?.time)uniforms.time.value+=dt*this.rippleSpeed;if(this.normal){this.normal.offset.x=(this.normal.offset.x+dt*.0035)%1;this.normal.offset.y=(this.normal.offset.y-dt*.0105)%1;}}
}
