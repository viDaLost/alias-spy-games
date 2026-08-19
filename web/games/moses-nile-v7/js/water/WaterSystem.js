import * as THREE from 'three';
import { Water } from 'three/addons/objects/Water.js';

export class WaterSystem {
  constructor({scene,waterLevel=-0.055,width=12.72,length=620,normalUrl='textures/water/water-normal.jpg',waterColor=0x35443a,deepColor=0x27342d,distortionScale=.92,rippleSpeed=.115}={}){
    this.scene=scene;this.waterLevel=waterLevel;this.width=width;this.length=length;this.normalUrl=normalUrl;this.waterColor=waterColor;this.deepColor=deepColor;this.distortionScale=distortionScale;this.rippleSpeed=rippleSpeed;this.water=null;this.normal=null;this.ready=false;this.shorelineData=null;
  }
  async init(){
    this._hideLegacyWater();this.normal=await this._loadNormal(this.normalUrl);
    const geometry=new THREE.PlaneGeometry(this.width,this.length,1,1);
    this.water=new Water(geometry,{textureWidth:256,textureHeight:256,waterNormals:this.normal,sunDirection:new THREE.Vector3(.42,1,.18).normalize(),sunColor:0xd7bb82,waterColor:this.waterColor,distortionScale:this.distortionScale,fog:Boolean(this.scene?.fog),alpha:1});
    this.water.rotation.x=-Math.PI/2;this.water.position.set(0,this.waterLevel,0);this.water.name='NileWaterV740';this.water.userData.nileWater=true;this.water.renderOrder=0;
    this.water.material.transparent=false;this.water.material.depthWrite=true;this.water.material.depthTest=true;this.water.material.side=THREE.FrontSide;
    if(this.water.material.uniforms?.size)this.water.material.uniforms.size.value=3.35;
    // Grade the strong Water.js reflection toward silty green-brown while retaining specular sky/sun response.
    if(this.water.material.fragmentShader?.includes('vec3 outgoingLight = albedo;')){
      this.water.material.fragmentShader=this.water.material.fragmentShader.replace('vec3 outgoingLight = albedo;','vec3 outgoingLight = mix( albedo, waterColor * 0.76, 0.46 );\n\t\t\t\t\toutgoingLight *= 0.76;');
      this.water.material.needsUpdate=true;
    }
    this.scene.add(this.water);this.ready=true;return this.water;
  }
  setShorelineData(data){this.shorelineData=data||null;if(data?.waterLevel!==undefined)this.waterLevel=data.waterLevel;window.__mosesWaterShorelineShared=Boolean(data?.shoreMask&&data?.terrain);}
  _loadNormal(url){return new Promise((resolve,reject)=>{new THREE.TextureLoader().load(url,(texture)=>{texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.repeat.set(3.4,48);texture.anisotropy=2;resolve(texture);},undefined,reject);});}
  _hideLegacyWater(){this.scene?.traverse?.((node)=>{if(!node?.isMesh||node.userData?.nileWater)return;const mats=Array.isArray(node.material)?node.material:[node.material];const waterish=mats.some(m=>[0x176b8b,0x2289a3,0x55adbd,0xc7efff,0x65796a,0x6d7565].includes(m?.color?.getHex?.()));if(waterish||node.userData?.v736SecondWater||node.userData?.v736Shallows||node.userData?.v736Foam||node.userData?.bankGuide||node.userData?.nileShallowTint)node.visible=false;});}
  update(dt){if(!this.water)return;const uniforms=this.water.material?.uniforms;if(uniforms?.time)uniforms.time.value+=dt*this.rippleSpeed;if(this.normal){this.normal.offset.x=(this.normal.offset.x+dt*.0017)%1;this.normal.offset.y=(this.normal.offset.y-dt*.0048)%1;}}
}
