import * as THREE from 'three';

export class TerrainChunk {
  constructor({system,cx,cz,size=64,material,lodDistances=[40,120]}={}){
    this.system=system;this.cx=cx;this.cz=cz;this.size=size;this.material=material;this.lodDistances=lodDistances;
    this.lod=new THREE.LOD();this.lod.position.set(cx,0,cz);this.lod.name=`NileTerrainChunk_${cx}_${cz}`;this.lod.userData.nileTerrainChunk=true;
  }
  load(){
    const levels=[[32,0],[16,this.lodDistances[0]],[8,this.lodDistances[1]]];
    for(const [segments,distance] of levels){const mesh=new THREE.Mesh(this.buildGeometry(segments),this.material);mesh.receiveShadow=true;mesh.castShadow=false;mesh.frustumCulled=true;this.lod.addLevel(mesh,distance);}
    this.system.scene.add(this.lod);return this;
  }
  buildGeometry(segments){
    const n=segments+1,verts=n*n,pos=new Float32Array(verts*3),uv=new Float32Array(verts*2),idx=new Uint32Array(segments*segments*6);
    let p=0,t=0;
    for(let iz=0;iz<n;iz++)for(let ix=0;ix<n;ix++){
      const lx=(ix/segments-.5)*this.size,lz=(iz/segments-.5)*this.size,wx=this.cx+lx,wz=this.cz+lz;
      pos[p++]=lx;pos[p++]=this.system.sampleHeight(wx,wz);pos[p++]=lz;uv[t++]=ix/segments;uv[t++]=iz/segments;
    }
    let q=0;for(let z=0;z<segments;z++)for(let x=0;x<segments;x++){const a=z*n+x,b=a+1,c=a+n,d=c+1;idx[q++]=a;idx[q++]=c;idx[q++]=b;idx[q++]=b;idx[q++]=c;idx[q++]=d;}
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(pos,3));g.setAttribute('uv',new THREE.BufferAttribute(uv,2));g.setIndex(new THREE.BufferAttribute(idx,1));g.computeVertexNormals();g.computeBoundingBox();g.computeBoundingSphere();return g;
  }
  unload(){this.system.scene.remove(this.lod);this.lod.levels.forEach(l=>l.object.geometry.dispose());this.lod.clear();}
  updateLOD(camera){this.lod.update(camera);}
}
