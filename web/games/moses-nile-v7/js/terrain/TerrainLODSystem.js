export class TerrainLODSystem {
  constructor({near=40,mid=120,cull=260}={}){this.near=near;this.mid=mid;this.cull=cull;}
  update(chunks,camera){
    if(!camera)return;
    for(const chunk of chunks){
      const dx=chunk.cx-camera.position.x,dz=chunk.cz-camera.position.z,d=Math.hypot(dx,dz);
      chunk.lod.visible=d<this.cull;
      if(chunk.lod.visible)chunk.updateLOD(camera);
    }
  }
}
