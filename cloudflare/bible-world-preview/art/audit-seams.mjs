// Diagonal, pole and wrap inspection with production camera geometry.
import sharp from 'sharp';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {scenes} from '../public/scenes.mjs';
import {rayToUV,panoramaSamples} from '../public/camera.mjs';
const baseMode=process.argv.includes('--base'),ids=process.argv.slice(2).filter(x=>x!=='--base');
const selected=ids.length?scenes.filter(s=>ids.includes(s.id)):scenes;
const directory=new URL(baseMode?'./work/seam-audit/base/':'./work/seam-audit/',import.meta.url);
await mkdir(directory,{recursive:true});
const angles=[0,45,135,-135,-45,180],pitches=[0,60,-60,90,-90],size=Number(process.env.PANORAMA_QA_SIZE||512);
for(const scene of selected){
 let file=new URL('../public/'+scene.image,import.meta.url).pathname,band=0;
 if(baseMode){
  for(const ext of ['webp','png']){const p=new URL(`./sources/${scene.id}-panorama.${ext}`,import.meta.url).pathname;try{await readFile(p);file=p;break;}catch{}}
  try{const settings=JSON.parse(await readFile(new URL(`./sources/${scene.id}-source.json`,import.meta.url),'utf8'));band=settings.sourceSeamBlend??.035;if(settings.panoramaSource)file=new URL('./sources/'+settings.panoramaSource,import.meta.url).pathname;}catch{band=.035;}
 }
 const {data,info}=await sharp(file).removeAlpha().raw().toBuffer({resolveWithObject:true}),tiles=[],views=[];
 function sample(u,v,c){
  const sx=u*info.width-.5,sy=Math.min(info.height-1,Math.max(0,v*info.height-.5)),ix=Math.floor(sx),iy=Math.floor(sy),dx=sx-ix,dy=sy-iy;
  const p=(px,py)=>data[(Math.min(info.height-1,py)*info.width+(px+info.width)%info.width)*3+c];
  return p(ix,iy)*(1-dx)*(1-dy)+p(ix+1,iy)*dx*(1-dy)+p(ix,iy+1)*(1-dx)*dy+p(ix+1,iy+1)*dx*dy;
 }
 for(const [row,pitch] of pitches.entries())for(const [col,yaw] of angles.entries()){
  const out=Buffer.alloc(size*size*3);
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
   const {u,v}=rayToUV(2*(x+.5)/size-1,1-2*(y+.5)/size,1,72*Math.PI/180,yaw*Math.PI/180,pitch*Math.PI/180),s=panoramaSamples(u,band);
   for(let c=0;c<3;c++)out[(y*size+x)*3+c]=Math.round(sample(s.a,v,c)*s.weight+sample(s.b,v,c)*(1-s.weight));
  }
  const name=`${scene.id}-yaw${yaw}-pitch${pitch}.jpg`,im=sharp(out,{raw:{width:size,height:size,channels:3}});
  await im.clone().jpeg({quality:96}).toFile(new URL(name,directory).pathname);
  const label=Buffer.from(`<svg width="200" height="22"><rect width="200" height="22" fill="#101522"/><text x="7" y="16" font-family="sans-serif" font-size="12" fill="white">yaw ${yaw} / pitch ${pitch}</text></svg>`);
  tiles.push({input:await im.resize(200,200).jpeg({quality:94}).toBuffer(),left:col*200,top:row*222},{input:label,left:col*200,top:row*222+200});views.push({yaw,pitch,file:name});
 }
 await sharp({create:{width:1200,height:1110,channels:3,background:'#101522'}}).composite(tiles).jpeg({quality:96}).toFile(new URL(scene.id+'-contact.jpg',directory).pathname);
 await writeFile(new URL(scene.id+'-views.json',directory),JSON.stringify({scene:scene.id,file,band,angles,pitches,views},null,2)+'\n');
 console.log(scene.id+': '+(baseMode?'base ':'')+'30 seam projections');
}
