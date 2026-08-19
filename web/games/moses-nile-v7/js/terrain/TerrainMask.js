import * as THREE from 'three';

const clamp01=(v)=>Math.max(0,Math.min(1,v));
const smooth=(a,b,x)=>{const t=clamp01((x-a)/(b-a||1));return t*t*(3-2*t);};

/** Shared analytic shoreline/control mask. All terrain and water queries use this coordinate system. */
export class TerrainMask {
  constructor({ riverHalfWidth=6.62, waterLevel=-0.055, wetBandWidth=2.0, seed=7312 }={}){
    this.riverHalfWidth=riverHalfWidth;
    this.waterLevel=waterLevel;      // Change WATER_LEVEL here.
    this.wetBandWidth=wetBandWidth;  // Change wet shoreline width here.
    this.seed=seed;
  }
  hash(x,z){return (Math.sin(x*12.9898+z*78.233+this.seed*0.013)*43758.5453)%1;}
  noise(x,z){
    const ix=Math.floor(x),iz=Math.floor(z),fx=x-ix,fz=z-iz;
    const u=fx*fx*(3-2*fx),v=fz*fz*(3-2*fz);
    const h=(a,b)=>{const n=this.hash(a,b);return n<0?n+1:n;};
    const a=h(ix,iz),b=h(ix+1,iz),c=h(ix,iz+1),d=h(ix+1,iz+1);
    return THREE.MathUtils.lerp(THREE.MathUtils.lerp(a,b,u),THREE.MathUtils.lerp(c,d,u),v);
  }
  fbm(x,z){return this.noise(x*.12,z*.12)*.58+this.noise(x*.035+19,z*.035-7)*.29+this.noise(x*.008-4,z*.008+11)*.13;}
  riverCenterX(z){return Math.sin(z*.0105)*.34+Math.sin(z*.027+1.4)*.13;}
  getDistanceToWater(x,z){
    const irregular=(this.fbm(x*.8,z)-.5)*.72;
    return Math.abs(x-this.riverCenterX(z))-(this.riverHalfWidth+irregular);
  }
  getShoreDistance01(x,z){return clamp01((this.getDistanceToWater(x,z)+.35)/24);}
  getWetness(x,z,y=this.waterLevel){
    const d=this.getDistanceToWater(x,z);
    const shore=1-smooth(.15,this.wetBandWidth+1.1,d);
    const heightWet=1-smooth(this.waterLevel,this.waterLevel+1.15,y);
    return clamp01(Math.max(shore*.92,heightWet*.62)*(0.86+this.fbm(x+31,z-17)*.14));
  }
  getWeights(x,z,y=this.waterLevel){
    const d=this.getDistanceToWater(x,z);
    const n=(this.fbm(x,z)-.5)*2;
    const q=d+n*Math.max(.35,Math.min(2.2,Math.abs(d)*.18));
    let wetMud=1-smooth(-.35,1.05,q);
    let wetSand=smooth(.25,1.0,q)*(1-smooth(1.2,3.2,q));
    let sand=smooth(1.35,3.0,q)*(1-smooth(6.2,10.5,q));
    let cracked=smooth(5.2,9.0,q)*(1-smooth(13.0,19.0,q));
    let gravel=smooth(11.5,18.0,q);
    const lowland=this.noise(x*.055+3,z*.055-9);
    cracked*=.58+.70*lowland;
    gravel*=.68+.55*this.noise(x*.08-8,z*.08+2);
    sand*=.82+.30*this.noise(x*.10,z*.10);
    wetMud*=1-smooth(this.waterLevel+.35,this.waterLevel+1.45,y)*.35;
    const total=wetMud+wetSand+sand+cracked+gravel+1e-5;
    return {wetMud:wetMud/total,wetSand:wetSand/total,sand:sand/total,cracked:cracked/total,gravel:gravel/total};
  }
  createControlTexture({minX=-64,maxX=64,minZ=-320,maxZ=96,resolution=256}={}){
    const data=new Uint8Array(resolution*resolution*4);
    for(let z=0;z<resolution;z++)for(let x=0;x<resolution;x++){
      const wx=THREE.MathUtils.lerp(minX,maxX,x/(resolution-1));
      const wz=THREE.MathUtils.lerp(minZ,maxZ,z/(resolution-1));
      const w=this.getWeights(wx,wz,this.waterLevel+.4); const i=(z*resolution+x)*4;
      data[i]=Math.round(w.wetMud*255);data[i+1]=Math.round((w.wetSand+w.sand*.65)*255);data[i+2]=Math.round(w.cracked*255);data[i+3]=Math.round(w.gravel*255);
    }
    const tex=new THREE.DataTexture(data,resolution,resolution,THREE.RGBAFormat);tex.needsUpdate=true;tex.flipY=false;return tex;
  }
}
