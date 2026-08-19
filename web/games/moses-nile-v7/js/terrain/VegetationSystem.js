import * as THREE from 'three';

function windMaterial(color){
  const m=new THREE.MeshStandardMaterial({color,roughness:.92,metalness:0,side:THREE.DoubleSide});
  m.onBeforeCompile=(s)=>{s.uniforms.uTime={value:0};m.userData.shader=s;s.vertexShader=s.vertexShader.replace('#include <common>','#include <common>\nuniform float uTime;').replace('#include <begin_vertex>','#include <begin_vertex>\nfloat hf=clamp(position.y/2.4,0.0,1.0);transformed.x+=sin(uTime*1.25+instanceMatrix[3][0]*.20+instanceMatrix[3][2]*.15)*.055*hf;');};
  return m;
}

export class VegetationSystem {
  constructor({scene,terrain,maxReeds=190,maxGrass=150}={}){this.scene=scene;this.terrain=terrain;this.maxReeds=maxReeds;this.maxGrass=maxGrass;this.meshes=[];this.time=0;}
  generate(){
    const reedGeo=new THREE.CylinderGeometry(.035,.045,2.2,5,1);reedGeo.translate(0,1.1,0);
    const grassGeo=new THREE.PlaneGeometry(.22,1.05);grassGeo.translate(0,.525,0);
    const reedMat=windMaterial(0x667447),grassMat=windMaterial(0x737d4f);
    const reeds=new THREE.InstancedMesh(reedGeo,reedMat,this.maxReeds),grass=new THREE.InstancedMesh(grassGeo,grassMat,this.maxGrass);
    reeds.name='NileReedsInstancedV7312';grass.name='NileGrassInstancedV7312';reeds.castShadow=grass.castShadow=false;reeds.receiveShadow=grass.receiveShadow=true;
    const dummy=new THREE.Object3D();let ri=0,gi=0;
    for(let i=0;i<1800&&(ri<this.maxReeds||gi<this.maxGrass);i++){
      const x=-56+((i*37.19)%112),z=-310+((i*91.73)%390),d=this.terrain.shoreline.getDistanceToWater(x,z),cluster=this.terrain.mask.fbm(x*1.8,z*1.8);
      if(d<.45||d>15)continue;
      const wet=this.terrain.getWetnessAt(x,z);const h=this.terrain.getHeightAt(x,z);
      const reedChance=(wet*.75)*(cluster>.49?1:0);const grassChance=((1-Math.abs(d-5)/12)*.34+.08)*(cluster>.57?1:0);
      if(ri<this.maxReeds&&reedChance>.30&&((i*13)%17)/17<reedChance){dummy.position.set(x,h,z);dummy.rotation.y=(i*.618)%6.28;const s=.72+((i*19)%31)/31*.55;dummy.scale.set(s,s,s);dummy.updateMatrix();reeds.setMatrixAt(ri++,dummy.matrix);}
      else if(gi<this.maxGrass&&grassChance>.13&&((i*7)%19)/19<grassChance){dummy.position.set(x,h+.02,z);dummy.rotation.y=(i*.414)%6.28;const s=.55+((i*11)%23)/23*.6;dummy.scale.set(s,s,s);dummy.updateMatrix();grass.setMatrixAt(gi++,dummy.matrix);}
    }
    reeds.count=ri;grass.count=gi;reeds.instanceMatrix.needsUpdate=true;grass.instanceMatrix.needsUpdate=true;reeds.computeBoundingSphere();grass.computeBoundingSphere();this.scene.add(reeds,grass);this.meshes=[reeds,grass];return this;
  }
  update(camera,dt){this.time+=dt;for(const mesh of this.meshes){if(mesh.material.userData.shader)mesh.material.userData.shader.uniforms.uTime.value=this.time;const max=mesh===this.meshes[0]?90:55;mesh.visible=!camera||Math.abs(camera.position.z+115)<400;mesh.material.opacity=1;mesh.userData.maxDistance=max;}}
}
