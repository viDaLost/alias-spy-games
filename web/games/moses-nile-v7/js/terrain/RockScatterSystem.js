import * as THREE from 'three';

export class RockScatterSystem {
  constructor({scene,terrain,maxRocks=86}={}){this.scene=scene;this.terrain=terrain;this.maxRocks=maxRocks;this.mesh=null;}
  generate(){
    const geo=new THREE.IcosahedronGeometry(.28,1);const mat=new THREE.MeshStandardMaterial({color:0x89765e,roughness:.96,metalness:0,flatShading:true});
    const mesh=new THREE.InstancedMesh(geo,mat,this.maxRocks);mesh.name='NileRocksInstancedV7312';mesh.castShadow=false;mesh.receiveShadow=true;
    const dummy=new THREE.Object3D();let count=0;
    for(let i=0;i<1100&&count<this.maxRocks;i++){
      const x=-58+((i*29.31)%116),z=-312+((i*67.77)%396),d=this.terrain.shoreline.getDistanceToWater(x,z),n=this.terrain.mask.fbm(x+71,z-33);
      if(d<2.4||d>33||n<.57)continue;
      const w=this.terrain.shoreline.getSurfaceWeights(x,z,this.terrain.getHeightAt(x,z));const chance=w.gravel*.72+w.cracked*.20;
      if(((i*17)%41)/41>chance)continue;
      const y=this.terrain.getHeightAt(x,z);dummy.position.set(x,y+.10,z);dummy.rotation.set((i*.17)%1.2,(i*.71)%6.28,(i*.29)%1.0);const s=.55+((i*23)%37)/37*1.9;dummy.scale.set(s,s*(.65+((i*5)%9)/18),s);dummy.updateMatrix();mesh.setMatrixAt(count++,dummy.matrix);
    }
    mesh.count=count;mesh.instanceMatrix.needsUpdate=true;mesh.computeBoundingSphere();this.scene.add(mesh);this.mesh=mesh;return this;
  }
  update(camera){if(!this.mesh)return;this.mesh.visible=!camera||Math.abs(camera.position.z+115)<430;}
}
