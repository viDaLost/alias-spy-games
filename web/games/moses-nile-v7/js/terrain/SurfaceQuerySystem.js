export class SurfaceQuerySystem {
  constructor({terrain,shoreline}={}){this.terrain=terrain;this.shoreline=shoreline;}
  getHeightAt(x,z){return this.terrain.sampleHeight(x,z);}
  getWetnessAt(x,z){return this.shoreline.getWetnessAt(x,z,this.getHeightAt(x,z));}
  getSurfaceTypeAt(x,z){
    const y=this.getHeightAt(x,z),d=this.shoreline.getDistanceToWater(x,z);
    if(d<0&&y<=this.terrain.waterLevel+.08)return 'water';
    const w=this.shoreline.getSurfaceWeights(x,z,y);
    const pairs=[['mud',w.wetMud],['wetSand',w.wetSand],['sand',w.sand],['dryMud',w.cracked],['gravel',w.gravel]];
    pairs.sort((a,b)=>b[1]-a[1]);return pairs[0][0];
  }
}
