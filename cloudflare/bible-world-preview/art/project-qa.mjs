// Technical QA projection using the production camera's exact ray calculation.
import sharp from 'sharp';
import {mkdir,writeFile} from 'node:fs/promises';
import {scenes} from '../public/scenes.mjs';
import {rayToUV} from '../public/camera.mjs';
const requested=process.argv.slice(2),selected=requested.length?scenes.filter(s=>requested.includes(s.id)):scenes;
const directory=new URL('./work/camera-qa/',import.meta.url);
await mkdir(directory,{recursive:true});
const report=[];
for(const scene of selected){
 const {data,info}=await sharp(new URL('../public/'+scene.image,import.meta.url).pathname).removeAlpha().raw().toBuffer({resolveWithObject:true});
 const camera=scene.camera,views=[['initial',camera.yaw,camera.pitch],['right',camera.yaw+Math.PI/2,0],['back',camera.yaw+Math.PI,0],['left',camera.yaw-Math.PI/2,0],['up',camera.yaw,Math.PI/3],['down',camera.yaw,-Math.PI/3]],tiles=[];
 for(const [index,[name,yaw,pitch]] of views.entries()){
  const width=432,height=768,out=Buffer.alloc(width*height*3);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
   const {u,v}=rayToUV(2*(x+.5)/width-1,1-2*(y+.5)/height,width/height,camera.fov*Math.PI/180,yaw,pitch);
   const sx=u*info.width-.5,sy=Math.min(info.height-1,Math.max(0,v*info.height-.5)),ix=Math.floor(sx),iy=Math.floor(sy),dx=sx-ix,dy=sy-iy;
   const pixel=(px,py,c)=>data[(Math.min(info.height-1,py)*info.width+(px+info.width)%info.width)*3+c];
   for(let c=0;c<3;c++)out[(y*width+x)*3+c]=Math.round(pixel(ix,iy,c)*(1-dx)*(1-dy)+pixel(ix+1,iy,c)*dx*(1-dy)+pixel(ix,iy+1,c)*(1-dx)*dy+pixel(ix+1,iy+1,c)*dx*dy);
  }
  const image=sharp(out,{raw:{width,height,channels:3}});
  await image.clone().jpeg({quality:92}).toFile(new URL(scene.id+'-'+name+'.jpg',directory).pathname);
  tiles.push({input:await image.resize(216,384).jpeg({quality:90}).toBuffer(),left:(index%3)*216,top:Math.floor(index/3)*384});
 }
 await sharp({create:{width:648,height:768,channels:3,background:'#111'}}).composite(tiles).jpeg({quality:92}).toFile(new URL(scene.id+'-views.jpg',directory).pathname);
 report.push({scene:scene.id,texture:[info.width,info.height],camera,views:views.map(x=>x[0])});
 console.log(scene.id+': six production-camera projections saved');
}
await writeFile(new URL('report.json',directory),JSON.stringify(report,null,2)+'\n');
