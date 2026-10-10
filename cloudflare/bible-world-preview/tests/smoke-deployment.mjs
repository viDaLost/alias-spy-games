import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';

const base=process.env.PREVIEW_URL;
assert.ok(base,'PREVIEW_URL is required');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const paths=[
  'index.html','app.js','rules.mjs','camera.mjs','viewer.mjs','style.css',
  'assets/babel-360-v5-4k.webp','assets/temple-360-v3-4k.webp','assets/galilee-360-v3-4k.webp',
  'assets/fonts/onest-cyrillic.woff2','assets/fonts/onest-latin.woff2'
];
for(const path of paths){
  const expected=await readFile(new URL('../public/'+path,import.meta.url));
  const publicPath=path==='index.html'?'':path;
  let failure;
  for(let attempt=0;attempt<3;attempt++){
    try{
      const response=await fetch(new URL(publicPath+'?verify='+Date.now(),base),{signal:AbortSignal.timeout(15000)});
      assert.equal(response.status,200,`${path} must be publicly available`);
      const actual=Buffer.from(await response.arrayBuffer());
      assert.equal(hash(actual),hash(expected),`${path} must match this commit`);
      console.log(`PASS ${publicPath||'/'}: HTTP 200, ${actual.length} bytes, matching SHA-256`);
      failure=null;break;
    }catch(error){failure=error;await new Promise(resolve=>setTimeout(resolve,2000));}
  }
  if(failure)throw failure;
}
const missing=await fetch(new URL('missing-panorama.webp',base),{signal:AbortSignal.timeout(15000)});
assert.equal(missing.status,404,'Missing assets should not return an HTML page with HTTP 200');
console.log(`Verified public Cloudflare preview: ${base}`);
