export class ShorelineSystem {
  constructor({mask,waterLevel=-0.055}={}){this.mask=mask;this.waterLevel=waterLevel;}
  getDistanceToWater(x,z){return this.mask.getDistanceToWater(x,z);}
  getWetnessAt(x,z,y=this.waterLevel){return this.mask.getWetness(x,z,y);}
  getShoreDistance01(x,z){return this.mask.getShoreDistance01(x,z);}
  getSurfaceWeights(x,z,y=this.waterLevel){return this.mask.getWeights(x,z,y);}
  getData(){return {waterLevel:this.waterLevel,shoreMask:this.mask};}
}
