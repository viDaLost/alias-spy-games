import {clamp,wrapAngle,rayToUV,panoramaSamples} from './camera.mjs?v=3';

export function createPanorama(scene,canvas,{onReady=()=>{},onError=()=>{}}={}) {
 let yaw=0,pitch=.08,fov=78*Math.PI/180,initial={yaw,pitch,fov};
 let ready=false,pending=false,gl=null,cpu=null,texture,program,activeImage,request=0,initialized=false;
 const points=new Map();let pinchDistance=0;
 const state={yaw,pitch,fov};
 const vertex='attribute vec2 aPosition; varying vec2 vPosition; void main(){vPosition=aPosition;gl_Position=vec4(aPosition,0.0,1.0);}';
 const fragment=`precision highp float;
 varying vec2 vPosition; uniform sampler2D uImage;uniform float uAspect,uFov,uYaw,uPitch;
 void main(){float t=tan(uFov*.5);vec2 shape=vec2(max(uAspect,1.),max(1.,1./uAspect));vec3 ray=normalize(vec3(vPosition*shape*t,1.));
 vec3 pitched=vec3(ray.x,cos(uPitch)*ray.y+sin(uPitch)*ray.z,-sin(uPitch)*ray.y+cos(uPitch)*ray.z);
 vec3 world=vec3(cos(uYaw)*pitched.x+sin(uYaw)*pitched.z,pitched.y,-sin(uYaw)*pitched.x+cos(uYaw)*pitched.z);
 vec2 uv=vec2(fract(atan(world.x,world.z)/6.28318530718+.5),acos(clamp(world.y,-1.,1.))/3.14159265359);
 float band=.035;float s=uv.x*(1.-band);vec4 color;
 if(s>=band*.5 && s<=1.-band-band*.5){color=texture2D(uImage,vec2(s+band*.5,uv.y));}
 else{float offset=s<band*.5?s+band*.5:s-(1.-band)+band*.5;
 color=mix(texture2D(uImage,vec2(1.-band+offset,uv.y)),texture2D(uImage,vec2(offset,uv.y)),smoothstep(0.,band,offset));}
 gl_FragColor=color;}`;
 function shader(type,source){
  const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);
  if(!gl.getShaderParameter(s,gl.COMPILE_STATUS)){gl.deleteShader(s);throw new Error('Panorama shader failed');}
  return s;
 }
 function initGL(){
  gl=canvas.getContext('webgl',{alpha:false,antialias:false,powerPreference:'low-power',preserveDrawingBuffer:false});
  if(!gl)return false;
  try{
   program=gl.createProgram();const vs=shader(gl.VERTEX_SHADER,vertex),fs=shader(gl.FRAGMENT_SHADER,fragment);
   gl.attachShader(program,vs);gl.attachShader(program,fs);gl.linkProgram(program);gl.deleteShader(vs);gl.deleteShader(fs);
   if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw new Error('Panorama program failed');
   gl.useProgram(program);const b=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,b);
   gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),gl.STATIC_DRAW);
   const a=gl.getAttribLocation(program,'aPosition');gl.enableVertexAttribArray(a);gl.vertexAttribPointer(a,2,gl.FLOAT,false,0,0);
   texture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,texture);
   for(const parameter of [gl.TEXTURE_WRAP_S,gl.TEXTURE_WRAP_T])gl.texParameteri(gl.TEXTURE_2D,parameter,gl.CLAMP_TO_EDGE);
   for(const parameter of [gl.TEXTURE_MIN_FILTER,gl.TEXTURE_MAG_FILTER])gl.texParameteri(gl.TEXTURE_2D,parameter,gl.LINEAR);
   gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);gl.uniform1i(gl.getUniformLocation(program,'uImage'),0);
   return true;
  }catch{gl=null;return false;}
 }
 function upload(image){
  if(!initialized){initialized=true;initGL();}
  if(gl){
   gl.bindTexture(gl.TEXTURE_2D,texture);
   // Replace the existing texture. Three rounds never retain three GPU images.
   gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,image);
  }else{
   const source=document.createElement('canvas');source.width=Math.min(1774,image.width);source.height=Math.round(source.width*image.height/image.width);
   const c=source.getContext('2d');c.drawImage(image,0,0,source.width,source.height);
   if(!cpu){const output=document.createElement('canvas');output.className='cpu-panorama';canvas.replaceWith(output);cpu={output,ctx:output.getContext('2d',{alpha:false})};}
   Object.assign(cpu,{pixels:c.getImageData(0,0,source.width,source.height).data,w:source.width,h:source.height});
  }
 }
 function draw(){
  pending=false;if(!ready||document.hidden)return;
  const w=scene.clientWidth,h=scene.clientHeight;if(!w||!h)return;
  Object.assign(state,{yaw,pitch,fov});
  if(gl){
   const dpr=Math.min(window.devicePixelRatio||1,2,Math.sqrt(1800000/(w*h)));
   const cw=Math.min(1800,Math.round(w*dpr)),ch=Math.round(cw*h/w);
   if(canvas.width!==cw||canvas.height!==ch){canvas.width=cw;canvas.height=ch;}
   gl.viewport(0,0,cw,ch);gl.useProgram(program);
   for(const [n,v]of Object.entries({uAspect:w/h,uFov:fov,uYaw:yaw,uPitch:pitch}))gl.uniform1f(gl.getUniformLocation(program,n),v);
   gl.drawArrays(gl.TRIANGLES,0,6);
  }else if(cpu){
   const cw=Math.min(400,w),ch=Math.round(cw*h/w);
   if(cpu.output.width!==cw||cpu.output.height!==ch){cpu.output.width=cw;cpu.output.height=ch;}
   const out=cpu.ctx.createImageData(cw,ch);
   for(let y=0;y<ch;y++)for(let x=0;x<cw;x++){
    const uv=rayToUV(2*(x+.5)/cw-1,1-2*(y+.5)/ch,w/h,fov,yaw,pitch),s=panoramaSamples(uv.u);
    const p=sampleCPU(s.a,uv.v),q=sampleCPU(s.b,uv.v),i=(y*cw+x)*4;
    for(let c=0;c<3;c++)out.data[i+c]=p[c]*s.weight+q[c]*(1-s.weight);
    out.data[i+3]=255;
   }
   cpu.ctx.putImageData(out,0,0);
  }
 }
 function sampleCPU(u,v){
  const x=clamp(u*(cpu.w-1),0,cpu.w-1),y=clamp(v*(cpu.h-1),0,cpu.h-1);
  const x0=Math.floor(x),y0=Math.floor(y),x1=Math.min(cpu.w-1,x0+1),y1=Math.min(cpu.h-1,y0+1),dx=x-x0,dy=y-y0;
  return [0,1,2].map(c=>cpu.pixels[(y0*cpu.w+x0)*4+c]*(1-dx)*(1-dy)+cpu.pixels[(y0*cpu.w+x1)*4+c]*dx*(1-dy)+cpu.pixels[(y1*cpu.w+x0)*4+c]*(1-dx)*dy+cpu.pixels[(y1*cpu.w+x1)*4+c]*dx*dy);
 }
 function schedule(){if(!pending){pending=true;requestAnimationFrame(draw);}}
 function zoom(factor){fov=clamp(fov*factor,50*Math.PI/180,90*Math.PI/180);schedule();}
 function reset(){({yaw,pitch,fov}=initial);schedule();}
 function load(url,camera={}){
  const serial=++request;ready=false;points.clear();pinchDistance=0;
  initial={yaw:camera.yaw??0,pitch:camera.pitch??.08,fov:(camera.fov??78)*Math.PI/180};reset();
  const image=new Image();image.decoding='async';
  image.onload=()=>{
   if(serial!==request)return;
   try{upload(image);activeImage=image;ready=true;schedule();onReady();}catch{onError();}
  };
  image.onerror=()=>{if(serial===request)onError();};image.src=url;
 }
 scene.addEventListener('pointerdown',e=>{
  if(!ready||e.target.closest('button'))return;
  scene.focus({preventScroll:true});scene.setPointerCapture(e.pointerId);points.set(e.pointerId,{x:e.clientX,y:e.clientY});pinchDistance=0;
 });
 scene.addEventListener('pointermove',e=>{
  if(!points.has(e.pointerId))return;
  const old=points.get(e.pointerId);points.set(e.pointerId,{x:e.clientX,y:e.clientY});
  if(points.size===1){const angular=fov/Math.max(1,Math.min(scene.clientWidth,scene.clientHeight));yaw=wrapAngle(yaw-(e.clientX-old.x)*angular);pitch=clamp(pitch+(e.clientY-old.y)*angular,-Math.PI/2+.005,Math.PI/2-.005);}
  else{const [a,b]=[...points.values()];const d=Math.hypot(a.x-b.x,a.y-b.y);if(pinchDistance>0&&d>0)fov=clamp(fov*pinchDistance/d,50*Math.PI/180,90*Math.PI/180);pinchDistance=d;}
  schedule();
 });
 function release(e){points.delete(e.pointerId);pinchDistance=0;}
 for(const e of ['pointerup','pointercancel','lostpointercapture'])scene.addEventListener(e,release);
 scene.addEventListener('wheel',e=>{e.preventDefault();zoom(Math.exp(clamp(e.deltaY,-100,100)*.002));},{passive:false});
 scene.addEventListener('keydown',e=>{
  if(e.target!==scene)return;let handled=true;
  if(e.key==='ArrowLeft')yaw=wrapAngle(yaw-.12);else if(e.key==='ArrowRight')yaw=wrapAngle(yaw+.12);
  else if(e.key==='ArrowUp')pitch=clamp(pitch+.1,-1.565,1.565);else if(e.key==='ArrowDown')pitch=clamp(pitch-.1,-1.565,1.565);
  else if(e.key==='+'||e.key==='=')zoom(.85);else if(e.key==='-')zoom(1.15);else if(e.key==='Home')reset();else handled=false;
  if(handled){e.preventDefault();schedule();}
 });
 new ResizeObserver(schedule).observe(scene);document.addEventListener('visibilitychange',schedule);
 canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();ready=false;});
 canvas.addEventListener('webglcontextrestored',()=>{
  if(activeImage&&initGL()){upload(activeImage);ready=true;schedule();}
 });
 return {zoom,reset,load,state,redraw:schedule};
}
