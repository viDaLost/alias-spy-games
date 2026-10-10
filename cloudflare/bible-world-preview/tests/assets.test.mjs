import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {scenes} from '../public/rules.mjs';

test('each round uses a complete lossless panorama at its native generated size',async()=>{
 for(const scene of scenes){
  const bytes=await readFile(new URL('../public/'+scene.image,import.meta.url));
  assert.equal(bytes.toString('ascii',0,4),'RIFF');
  assert.equal(bytes.toString('ascii',8,12),'WEBP');
  let lossless;
  for(let p=12;p+8<bytes.length;){
   const size=bytes.readUInt32LE(p+4);
   if(bytes.toString('ascii',p,p+4)==='VP8L'){lossless=p+8;break;}
   p+=8+size+(size%2);
  }
  assert.ok(lossless,`${scene.id}: lossless pixel encoding`);
  assert.equal(bytes[lossless],0x2f);
  const bits=bytes.readUInt32LE(lossless+1);
  assert.equal((bits&0x3fff)+1,1774,`${scene.id}: panorama width`);
  assert.equal(((bits>>>14)&0x3fff)+1,887,`${scene.id}: panorama height`);
 }
});
