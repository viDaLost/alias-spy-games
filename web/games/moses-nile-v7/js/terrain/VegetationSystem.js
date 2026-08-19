import * as THREE from 'three';

function windMaterial(color){
  const m=new THREE.MeshStandardMaterial({color,roughness:.96,metalness:0,side:THREE.DoubleSide});
  m.onBeforeCompile=(s)=>{s.uniforms.uTime={value:0};m.userData.shader=s;s.vertexShader=s.vertexShader.replace('#include <common>','#include <common>\nuniform float uTime;').replace('#include <begin_vertex>','#include <begin_vertex>\nfloat hf=clamp(position.y/2.4,0.0,1.0);transformed.x+=sin(uTime*.82+instanceMatrix[3][0]*.17+instanceMatrix[3][2]*.11)*.034*hf;');};
  return m;
}

export class VegetationSystem {
  constructor({scene,terrain,maxReeds=92,maxGrass=58}={}){this.scene=scene;this.terrain=terrain;this.maxReeds=maxReeds;this.maxGrass=maxGrass;this.meshes=[];this.time=0;}
  generate(){
    const reedGeo=new THREE.CylinderGeometry(.026,.038,1.82,5,1);reedGeo.translate(0,.91,0);
    const grassGeo=new THREE.PlaneGeometry(.18,.72);grassGeo.translate(0,.36,0);
    const reedMat=windMaterial(0x59694a),grassMat=windMaterial(0x6e7350);
    const reeds=new THREE.InstancedMesh(reedGeo,reedMat,this.maxReeds),grass=new THREE.InstancedMesh(grassGeo,grassMat,this.maxGrass);
    reeds.name='NileReedsInstancedV7314';grass.name='NileGrassInstancedV7314';reeds.castShadow=grass.castShadow=false;reeds.receiveShadow=grass.receiveShadow=true;
    const dummy=new THREE.Object3D();let ri=0,gi=0;
    for(let i=0;i<1600&&(ri<this.maxReeds||gi<this.maxGrass);i++){
      const x=-56+((i*37.19)%112),z=-310+((i*91.73)%390),d=this.terrain.shoreline.getDistanceToWater(x,z),cluster=this.terrain.mask.fbm(x*1.23+8,z*1.31-5);
      if(d<.72||d>13.5)continue;
      const wet=this.terrain.getWetnessAt(x,z),h=this.terrain.getHeightAt(x,z);
      const reedChance=wet*.62*(cluster>.61?1:0),grassChance=Math.max(0,1-Math.abs(d-5.3)/8.5)*.22*(cluster>.66?1:0);
      if(ri<this.maxReeds&&reedChance>.27&&((i*13)%23)/23<reedChance){dummy.position.set(x,h,z);dummy.rotation.y=(i*.731)%6.28;const s=.62+((i*19)%31)/31*.44;dummy.scale.set(s,s,s);dummy.updateMatrix();reeds.setMatrixAt(ri++,dummy.matrix);}
      else if(gi<this.maxGrass&&grassChance>.10&&((i*7)%29)/29<grassChance){dummy.position.set(x,h+.015,z);dummy.rotation.y=(i*.537)%6.28;const s=.48+((i*11)%23)/23*.42;dummy.scale.set(s,s,s);dummy.updateMatrix();grass.setMatrixAt(gi++,dummy.matrix);}
    }
    reeds.count=ri;grass.count=gi;reeds.instanceMatrix.needsUpdate=true;grass.instanceMatrix.needsUpdate=true;reeds.computeBoundingSphere();grass.computeBoundingSphere();this.scene.add(reeds,grass);this.meshes=[reeds,grass];return this;
  }
  update(camera,dt){this.time+=dt;for(const mesh of this.meshes){if(mesh.material.userData.shader)mesh.material.userData.shader.uniforms.uTime.value=this.time;mesh.visible=!camera||Math.abs(camera.position.z+115)<360;mesh.userData.maxDistance=mesh===this.meshes[0]?74:42;}}
}
