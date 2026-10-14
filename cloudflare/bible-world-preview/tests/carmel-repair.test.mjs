import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {fileURLToPath} from 'node:url';
import {scenes} from '../public/scenes.mjs';

// The reported extra head is at the longitude wrap, below the woman's face.
// Compare final texels there to the cleaned perspective source: the malformed
// base and neighboring detail must never be mixed back into her head/torso.
test('Carmel repaired head and torso come entirely from the clean source across the wrap',async()=>{
 const scene=scenes.find(s=>s.id==='carmel');
 const texture=await sharp(fileURLToPath(new URL('../public/'+scene.image,import.meta.url))).removeAlpha().raw().toBuffer({resolveWithObject:true});
 const clean=await sharp(fileURLToPath(new URL('../art/sources/directions/carmel-back-person-fixed.webp',import.meta.url))).removeAlpha().raw().toBuffer({resolveWithObject:true});
 const W=texture.info.width,H=texture.info.height,tan=Math.tan(104*Math.PI/360);
 function expected(u,v,c){
  const x=u*(clean.info.width-1),y=v*(clean.info.height-1),ix=Math.floor(x),iy=Math.floor(y),dx=x-ix,dy=y-iy;
  const p=(xx,yy)=>clean.data[(yy*clean.info.width+xx)*3+c];
  return Math.round(p(ix,iy)*(1-dx)*(1-dy)+p(ix+1,iy)*dx*(1-dy)+p(ix,iy+1)*(1-dx)*dy+p(ix+1,iy+1)*dx*dy);
 }
 let checked=0,left=0,right=0;
 for(let y=Math.floor(H*.49);y<Math.ceil(H*.66);y++){
  const latitude=(y+.5)/H*Math.PI,dy=Math.cos(latitude),horizontal=Math.sin(latitude);
  for(let x=0;x<W;x++){
   const yaw=((x+.5)/W-.5)*2*Math.PI,dz=Math.cos(yaw)*horizontal;
   if(dz>=0)continue;
   const dx=Math.sin(yaw)*horizontal,u=(1+dx/(dz*tan))/2,v=(1+dy/(dz*tan))/2;
   if(u<.45||u>.60||v<.518||v>.646)continue;
   for(let c=0;c<3;c++)assert.ok(Math.abs(texture.data[(y*W+x)*3+c]-expected(u,v,c))<=1,`Old anatomy leaked into repaired texel ${x},${y}`);
   checked++;if(x<W/2)left++;else right++;
  }
 }
 assert.ok(checked>15000,'The test must inspect the complete reported head/torso sector');
 assert.ok(left>1000&&right>1000,'Both sides of the spherical longitude wrap must be covered');
});
