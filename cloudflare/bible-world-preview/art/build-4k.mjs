#!/usr/bin/env node
// Project texture pipeline: spherical reference views -> ImageGen -> 4K texture.
import {createRequire} from 'node:module';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {panoramaSamples} from '../public/camera.mjs';
const require=createRequire(import.meta.url);
const sharp=require(require.resolve('sharp',{paths:[process.cwd(),process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES].filter(Boolean)}));
const root=fileURLToPath(new URL('../',import.meta.url));
const work=process.env.PANORAMA_WORK_DIR||path.join(root,'art/work');
const faces=[['front',0,0],['right',Math.PI/2,0],['back',Math.PI,0],['left',-Math.PI/2,0],['up',0,Math.PI/2],['down',0,-Math.PI/2]].map(([name,yaw,pitch])=>({
 name,right:[Math.cos(yaw),0,-Math.sin(yaw)],up:[-Math.sin(yaw)*Math.sin(pitch),Math.cos(pitch),-Math.cos(yaw)*Math.sin(pitch)],forward:[Math.sin(yaw)*Math.cos(pitch),Math.sin(pitch),Math.cos(yaw)*Math.cos(pitch)]
}));
const tan=Math.tan(104*Math.PI/360),size=1280;
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const smooth=x=>{x=clamp(x,0,1);return x*x*(3-2*x);};
async function raw(file){const {data,info}=await sharp(file).removeAlpha().toColourspace('srgb').raw().toBuffer({resolveWithObject:true});return {data,w:info.width,h:info.height};}
function sample(im,u,v,c){
 const x=clamp(u*(im.w-1),0,im.w-1),y=clamp(v*(im.h-1),0,im.h-1),ix=Math.floor(x),iy=Math.floor(y),jx=Math.min(ix+1,im.w-1),jy=Math.min(iy+1,im.h-1),dx=x-ix,dy=y-iy;
 return im.data[(iy*im.w+ix)*3+c]*(1-dx)*(1-dy)+im.data[(iy*im.w+jx)*3+c]*dx*(1-dy)+im.data[(jy*im.w+ix)*3+c]*(1-dx)*dy+im.data[(jy*im.w+jx)*3+c]*dx*dy;
}
function original(im,dir,c){
 const norm=Math.hypot(...dir),u=(Math.atan2(dir[0],dir[2])/(2*Math.PI)+.5+1)%1,v=Math.acos(clamp(dir[1]/norm,-1,1))/Math.PI,s=panoramaSamples(u);
 return sample(im,s.a,v,c)*s.weight+sample(im,s.b,v,c)*(1-s.weight);
}
function ray(face,x,y){return face.forward.map((n,i)=>n+x*tan*face.right[i]+y*tan*face.up[i]);}
async function prepare(scene){
 const base=await raw(path.join(root,'art/sources',scene+'-panorama.png'));await mkdir(path.join(work,'inputs'),{recursive:true});
 for(const face of faces){
  const pixels=Buffer.alloc(size*size*3);
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
   const dir=ray(face,2*(x+.5)/size-1,1-2*(y+.5)/size),p=(y*size+x)*3;
   for(let c=0;c<3;c++)pixels[p+c]=Math.round(original(base,dir,c));
  }
  const file=path.join(work,'inputs',scene+'-'+face.name+'.png');
  await writeFile(file,await sharp(pixels,{raw:{width:size,height:size,channels:3}}).png().toBuffer());
  console.log(JSON.stringify({scene,direction:face.name,file,size:[size,size],fieldOfView:104}));
 }
}
async function build(scene){
 const base=await raw(path.join(root,'art/sources',scene+'-panorama.png')),tiles=[];
 for(const face of faces){
  const file=path.join(root,'art/sources/directions',scene+'-'+face.name+'.png');
  const im=await raw(file),ref=await sharp(path.join(work,'inputs',scene+'-'+face.name+'.png')).resize(im.w,im.h).removeAlpha().raw().toBuffer();
  const genLow=await sharp(im.data,{raw:{width:im.w,height:im.h,channels:3}}).blur(6).raw().toBuffer();
  const refLow=await sharp(ref,{raw:{width:im.w,height:im.h,channels:3}}).blur(6).raw().toBuffer();
  const residual=new Float32Array(im.data.length);
  for(let i=0;i<residual.length;i+=3){
   const mismatch=Math.hypot(genLow[i]-refLow[i],genLow[i+1]-refLow[i+1],genLow[i+2]-refLow[i+2]);
   // Retain the base composition when a generated silhouette or broad colour drifts.
   const confidence=1-smooth((mismatch-20)/55);
   for(let c=0;c<3;c++){
    residual[i+c]=(im.data[i+c]-genLow[i+c]-ref[i+c]+refLow[i+c])*confidence;
   }
  }
  tiles.push({...face,im,residual});
 }
 const W=4096,H=2048,pixels=Buffer.alloc(W*H*3);
 const dirs=Array.from({length:W},(_,x)=>{const yaw=((x+.5)/W-.5)*2*Math.PI;return [Math.sin(yaw),Math.cos(yaw)];});
 for(let y=0;y<H;y++){
  const v=(y+.5)/H,cy=Math.cos(v*Math.PI),sy=Math.sin(v*Math.PI);
  for(let x=0;x<W;x++){
   const dir=[dirs[x][0]*sy,cy,dirs[x][1]*sy],p=(y*W+x)*3,acc=[0,0,0],basePixel=[0,1,2].map(c=>original(base,dir,c));let total=0;
   for(const tile of tiles){
    const z=dot(dir,tile.forward);if(z<=0)continue;
    const px=dot(dir,tile.right)/(z*tan),py=dot(dir,tile.up)/(z*tan),edge=Math.max(Math.abs(px),Math.abs(py));if(edge>=1)continue;
    const weight=smooth((1-edge)/.22);if(!weight)continue;
    const residual={data:tile.residual,w:tile.im.w,h:tile.im.h};
    const pole=(tile.name==='up'||tile.name==='down')?smooth((Math.abs(dir[1])-.78)/.19):0;
    // Near a pole, fully use the restored direction so old radial artifacts cannot leak through.
    for(let c=0;c<3;c++)acc[c]+=((1-pole)*sample(residual,(px+1)/2,(1-py)/2,c)+pole*(sample(tile.im,(px+1)/2,(1-py)/2,c)-basePixel[c]))*weight;
    total+=weight;
   }
   if(!total)throw Error('Uncovered spherical direction');
   for(let c=0;c<3;c++)pixels[p+c]=Math.round(clamp(basePixel[c]+acc[c]/total,0,255));
  }
 }
 const file=path.join(root,'public/assets',scene+'-360-'+(scene==='babel'?'v5':'v3')+'-4k.webp');
 await writeFile(file,await sharp(pixels,{raw:{width:W,height:H,channels:3}}).webp({lossless:true,effort:6}).toBuffer());
 await mkdir(path.join(work,'qa'),{recursive:true});
 await writeFile(path.join(work,'qa',scene+'-4k.jpg'),await sharp(pixels,{raw:{width:W,height:H,channels:3}}).resize(2048,1024).jpeg({quality:95}).toBuffer());
 const comparisons=[];
 for(const [row,im] of [[0,base],[1,{data:pixels,w:W,h:H}]])for(const [col,yaw] of [[0,0],[1,Math.PI],[2,Math.PI/2]]){
  const cw=640,ch=720,out=Buffer.alloc(cw*ch*3),f=faces.find(t=>t.name===['front','back','right'][col]),t=Math.tan(72*Math.PI/360);
  for(let y=0;y<ch;y++)for(let x=0;x<cw;x++){
   const d=ray(f,(2*(x+.5)/cw-1)*t/tan*cw/ch,(1-2*(y+.5)/ch)*t/tan),p=(y*cw+x)*3,n=Math.hypot(...d),u=(Math.atan2(d[0],d[2])/(2*Math.PI)+.5+1)%1,v=Math.acos(d[1]/n)/Math.PI;
   for(let c=0;c<3;c++)out[p+c]=Math.round(row?sample(im,u,v,c):original(im,d,c));
  }
  comparisons.push({input:await sharp(out,{raw:{width:cw,height:ch,channels:3}}).png().toBuffer(),left:col*cw,top:row*ch});
 }
 await writeFile(path.join(work,'qa',scene+'-compare.jpg'),await sharp({create:{width:1920,height:1440,channels:3,background:'#ffffff'}}).composite(comparisons).jpeg({quality:97}).toBuffer());
 const metadata=await sharp(file).metadata();console.log(JSON.stringify({scene,file,width:metadata.width,height:metadata.height,faces:tiles.map(t=>({direction:t.name,width:t.im.w,height:t.im.h}))}));
}
const [mode,...scenes]=process.argv.slice(2);
if(!['prepare','build'].includes(mode))throw Error('Usage: build-4k.mjs prepare|build babel temple galilee');
for(const scene of scenes.length?scenes:['babel','temple','galilee'])await (mode==='prepare'?prepare:build)(scene);
