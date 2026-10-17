import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {scenes} from '../public/scenes.mjs';
import {repairProjection,repairSample} from '../art/spherical-repairs.mjs';
test('rear repairs cross the longitude boundary continuously and preserve the front and poles',()=>{
 const p=repairProjection(),a=repairSample([-.00000001,0,-1],p),b=repairSample([.00000001,0,-1],p);
 assert.equal(a.weight,1);assert.equal(b.weight,1);assert.ok(Math.abs(a.u-b.u)<1e-7);
 for(const d of [[0,0,1],[0,1,0],[0,-1,0]])assert.equal(repairSample(d,p),null);
 assert.throws(()=>repairProjection({fov:180}));assert.throws(()=>repairProjection({feather:0}));
});
test('all fifteen final joins use the reviewed repair without stale directional detail',async()=>{
 const manifest=JSON.parse(await readFile(new URL('../art/seam-repairs.json',import.meta.url),'utf8'));
 assert.equal(Object.keys(manifest.scenes).length,15);
 for(const scene of scenes){
  const [repair]=manifest.scenes[scene.id];assert.ok(repair,scene.id);
  const bytes=await readFile(new URL('../art/sources/'+repair.source,import.meta.url));
  assert.equal(createHash('sha1').update(Buffer.from('blob '+bytes.length+'\0')).update(bytes).digest('hex'),repair.gitBlob);
  const clean=await sharp(bytes).removeAlpha().raw().toBuffer({resolveWithObject:true});
  const texture=await sharp(new URL('../public/'+scene.image,import.meta.url).pathname).removeAlpha().raw().toBuffer({resolveWithObject:true});
  const p=repairProjection(repair),W=texture.info.width,H=texture.info.height;let checked=0,left=0,right=0;
  for(let y=32;y<H;y+=32)for(let x=16;x<W;x+=32){
   const a=((x+.5)/W-.5)*2*Math.PI,b=(y+.5)/H*Math.PI,s=repairSample([Math.sin(a)*Math.sin(b),Math.cos(b),Math.cos(a)*Math.sin(b)],p);
   if(!s||s.weight<1)continue;
   const sx=s.u*clean.info.width-.5,sy=s.v*clean.info.height-.5,ix=Math.floor(sx),iy=Math.floor(sy),dx=sx-ix,dy=sy-iy;
   for(let c=0;c<3;c++){
    const pixel=(xx,yy)=>clean.data[(yy*clean.info.width+xx)*3+c];
    const expected=Math.round(pixel(ix,iy)*(1-dx)*(1-dy)+pixel(ix+1,iy)*dx*(1-dy)+pixel(ix,iy+1)*(1-dx)*dy+pixel(ix+1,iy+1)*dx*dy);
    assert.ok(Math.abs(texture.data[(y*W+x)*3+c]-expected)<=1,`${scene.id}: stale join at ${x},${y}`);
   }
   checked++;if(x<W/2)left++;else right++;
  }
  assert.ok(checked>150&&left>60&&right>60,`${scene.id}: both wrap edges must be tested`);
  assert.match(scene.image,/-seams2-4k\.webp$/);
 }
});
