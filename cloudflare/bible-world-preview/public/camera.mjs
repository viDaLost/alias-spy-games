export const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
export const wrapAngle=x=>((x+Math.PI)%(2*Math.PI)+2*Math.PI)%(2*Math.PI)-Math.PI;
export function rayToUV(px,py,aspect,fov,yaw,pitch){
 const t=Math.tan(fov/2);let x=px*t*Math.max(aspect,1),y=py*t*Math.max(1,1/aspect),z=1;
 const norm=Math.hypot(x,y,z);x/=norm;y/=norm;z/=norm;
 const y1=Math.cos(pitch)*y+Math.sin(pitch)*z;
 const z1=-Math.sin(pitch)*y+Math.cos(pitch)*z;
 const x2=Math.cos(yaw)*x+Math.sin(yaw)*z1;
 const z2=-Math.sin(yaw)*x+Math.cos(yaw)*z1;
 return {u:((Math.atan2(x2,z2)/(2*Math.PI)+.5)%1+1)%1,v:Math.acos(clamp(y1,-1,1))/Math.PI};
}
// Blend a small, same-direction overlap rather than mirrored building edges.
export function panoramaSamples(u){
 const band=.035,s=((u%1+1)%1)*(1-band);
 if(s>=band/2&&s<=1-band-band/2)return {a:s+band/2,b:s+band/2,weight:1};
 const offset=s<band/2?s+band/2:s-(1-band)+band/2;
 const t=clamp(offset/band,0,1);
 return {a:offset,b:1-band+offset,weight:t*t*(3-2*t)};
}
