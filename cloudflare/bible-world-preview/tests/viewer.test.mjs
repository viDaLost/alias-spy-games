import test from 'node:test';
import assert from 'node:assert/strict';
import {createPanorama} from '../public/viewer.mjs';
import {maxPitch,minFov,maxFov} from '../public/camera.mjs';

test('dragging, pinching and fullscreen resize keep a stable lens and block Safari page gestures',()=>{
 const listeners=new Map(),frames=[],images=[],uniforms=new Map(),uploads=[];
 let textureLimit=4096;
 const gl={
  createShader:()=>({}),shaderSource(){},compileShader(){},getShaderParameter:()=>true,deleteShader(){},
  createProgram:()=>({}),attachShader(){},linkProgram(){},getProgramParameter:()=>true,useProgram(){},
  createBuffer:()=>({}),bindBuffer(){},bufferData(){},getAttribLocation:()=>0,enableVertexAttribArray(){},vertexAttribPointer(){},
  createTexture:()=>({}),bindTexture(){},activeTexture(){},deleteTexture(){},texParameteri(){},pixelStorei(){},uniform1i(){},getUniformLocation:(_,name)=>name,
  getParameter:()=>textureLimit,texImage2D(...args){uploads.push(args.at(-1));},uniformMatrix3fv(){},viewport(){},drawArrays(){},uniform1f:(name,value)=>uniforms.set(name,value),uniform2f:(name,x,y)=>uniforms.set(name,{x,y})
 };
 const scene={clientWidth:393,clientHeight:550,focus(){},setPointerCapture(){},addEventListener:(type,handler,options)=>listeners.set(type,{handler,options})};
 const canvas={width:0,height:0,getContext:()=>gl,addEventListener(){}};
 Object.assign(globalThis,{
  document:{hidden:false,addEventListener(){},createElement(){return {width:0,height:0,getContext:()=>({drawImage(){}})};}},window:{devicePixelRatio:3},
  requestAnimationFrame:fn=>frames.push(fn),ResizeObserver:class{observe(){}},
  Image:class{constructor(){images.push(this);this.width=4096;this.height=2048;}}
 });
 const viewer=createPanorama(scene,canvas);viewer.load('scene.webp',{fov:72,seamBlend:0});images[0].onload();
 const flush=()=>{while(frames.length)frames.shift()();};
 const target={closest:()=>null};
 const send=(type,values={})=>listeners.get(type).handler({target,pointerId:1,clientX:0,clientY:0,...values});
 flush();assert.equal(canvas.width,1179);assert.equal(canvas.height,1650);
 assert.equal(uploads[0],images[0]); // Supported GPUs receive all 4096 × 2048 pixels.
 assert.equal(uniforms.get('uWrapBand'),0); // Do not apply the assembled seam twice.
 const initialPlane=uniforms.get('uPlane');
 send('pointerdown',{clientX:100,clientY:100});send('pointermove',{clientX:300,clientY:100});flush();
 assert.notEqual(viewer.state.yaw,0);assert.equal(viewer.state.pitch,.08);
 assert.deepEqual(uniforms.get('uPlane'),initialPlane); // Rotation never changes magnification.
 send('pointermove',{clientX:300,clientY:10000});assert.equal(viewer.state.pitch,maxPitch);
 send('pointermove',{clientX:300,clientY:-10000});assert.equal(viewer.state.pitch,-maxPitch);send('pointerup');
 viewer.reset();flush();
 send('pointerdown',{clientX:100,clientY:100});send('pointerdown',{pointerId:2,clientX:200,clientY:100});
 send('pointermove',{pointerId:2,clientX:200,clientY:100});send('pointermove',{pointerId:2,clientX:500,clientY:100});
 assert.equal(viewer.state.fov,minFov);assert.equal(viewer.state.yaw,0);assert.equal(viewer.state.pitch,.08);
 send('pointermove',{pointerId:2,clientX:101,clientY:100});assert.equal(viewer.state.fov,maxFov);
 send('pointercancel',{pointerId:2});send('pointerup');viewer.reset();
 scene.clientHeight=852;viewer.redraw();flush();
 assert.equal(canvas.width,1179);assert.equal(canvas.height,2556);
 const plane=uniforms.get('uPlane');assert.ok(2*Math.atan(plane.y)<=maxFov);
 assert.ok(Math.abs(plane.x/plane.y-393/852)<1e-12);
 let prevented=0;
 for(const type of ['gesturestart','gesturechange','gestureend','touchmove']){
  assert.equal(listeners.get(type).options.passive,false);
  send(type,{cancelable:true,preventDefault(){prevented++;}});
 }
 assert.equal(prevented,4);
 textureLimit=2048;viewer.load('weak-gpu.webp',{seamBlend:0});images[1].onload();flush();
 assert.equal(uploads[1].width,2048);assert.equal(uploads[1].height,1024);
 viewer.load('legacy.webp');images[2].onload();flush();assert.equal(uniforms.get('uWrapBand'),.035);
});
