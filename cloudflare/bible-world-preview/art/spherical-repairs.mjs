// Project reviewed native rear repairs AFTER detail assembly, across both sides
// of the longitude wrap. The front and spherical poles remain unchanged.
import {createRequire} from 'node:module';
import {readFile} from 'node:fs/promises';
const require=createRequire(import.meta.url);
const sharp=require(require.resolve('sharp',{paths:[process.cwd(),process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES].filter(Boolean)}));
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const smooth=x=>{x=clamp(x,0,1);return x*x*(3-2*x);};
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
export function repairProjection({yaw=180,pitch=0,fov=104,bounds=[.16,.02,.84,.98],feather=.12}={}){
 yaw*=Math.PI/180;pitch*=Math.PI/180;
 if(!(fov>0&&fov<180)||!(feather>0)||bounds.length!==4||bounds[0]<0||bounds[1]<0||bounds[2]>1||bounds[3]>1||bounds[2]<=bounds[0]||bounds[3]<=bounds[1])throw Error('Invalid spherical repair geometry');
 return {right:[Math.cos(yaw),0,-Math.sin(yaw)],up:[-Math.sin(yaw)*Math.sin(pitch),Math.cos(pitch),-Math.cos(yaw)*Math.sin(pitch)],forward:[Math.sin(yaw)*Math.cos(pitch),Math.sin(pitch),Math.cos(yaw)*Math.cos(pitch)],tan:Math.tan(fov*Math.PI/360),bounds,feather};
}
export function repairSample(direction,projection){
 const z=dot(direction,projection.forward);if(z<=0)return null;
 const u=(dot(direction,projection.right)/(z*projection.tan)+1)/2,v=(1-dot(direction,projection.up)/(z*projection.tan))/2;
 const [l,t,r,b]=projection.bounds,f=projection.feather;
 if(u<=l||u>=r||v<=t||v>=b)return null;
 return {u,v,weight:smooth((u-l)/f)*smooth((r-u)/f)*smooth((v-t)/f)*smooth((b-v)/f)};
}
function sample(image,u,v,c){
 const x=clamp(u*image.width-.5,0,image.width-1),y=clamp(v*image.height-.5,0,image.height-1),ix=Math.floor(x),iy=Math.floor(y),jx=Math.min(ix+1,image.width-1),jy=Math.min(iy+1,image.height-1),dx=x-ix,dy=y-iy;
 const p=(px,py)=>image.data[(py*image.width+px)*3+c];
 return p(ix,iy)*(1-dx)*(1-dy)+p(jx,iy)*dx*(1-dy)+p(ix,jy)*(1-dx)*dy+p(jx,jy)*dx*dy;
}
export async function applySphericalRepairs(scene,pixels,width,height){
 const manifest=JSON.parse(await readFile(new URL('./seam-repairs.json',import.meta.url),'utf8'));
 for(const repair of manifest.scenes[scene]??[]){
  const {data,info}=await sharp(new URL('./sources/'+repair.source,import.meta.url).pathname).removeAlpha().toColourspace('srgb').raw().toBuffer({resolveWithObject:true});
  const image={data,width:info.width,height:info.height},projection=repairProjection(repair);
  const longitude=Array.from({length:width},(_,x)=>{const a=((x+.5)/width-.5)*2*Math.PI;return [Math.sin(a),Math.cos(a)];});
  for(let y=0;y<height;y++){
   const cy=Math.cos((y+.5)/height*Math.PI),sy=Math.sin((y+.5)/height*Math.PI);
   for(let x=0;x<width;x++){
    const s=repairSample([longitude[x][0]*sy,cy,longitude[x][1]*sy],projection);if(!s)continue;
    const p=(y*width+x)*3;
    for(let c=0;c<3;c++)pixels[p+c]=Math.round(pixels[p+c]*(1-s.weight)+sample(image,s.u,s.v,c)*s.weight);
   }
  }
 }
}
