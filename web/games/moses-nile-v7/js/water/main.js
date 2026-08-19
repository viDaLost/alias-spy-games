import * as THREE from 'three';
import { WaterSystem } from './WaterSystem.js';
import { RippleSystem } from './RippleSystem.js';
import { SplashSystem } from './SplashSystem.js';
import { FoamSystem } from './FoamSystem.js';
import { WaterInteractionSystem } from './WaterInteractionSystem.js';

const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function waitForGame(){for(let i=0;i<160;i++){if(window.__mosesV73Scene)return window.__mosesV73Scene;await sleep(50);}throw new Error('V7.4 water: scene not available');}
function findBasket(scene){let found=null;for(const child of scene.children){child.traverse?.(node=>{if(!found&&node?.name==='ClosedWovenLid')found=child;});if(found)break;}return found;}
function crocSample(node){return node?.userData?.v733Model||node?.children?.find?.(c=>c&&!c.userData?.v735Warning&&!c.userData?.v738AttackFx&&!c.userData?.v733Wake)||node;}

async function boot(){
  const scene=await waitForGame(),camera=window.__mosesCamera||null;
  const waterSystem=new WaterSystem({scene,waterLevel:-0.055,waterColor:0x2f3e34,deepColor:0x24312a,distortionScale:1.15,rippleSpeed:0.15,width:13.05});
  await waterSystem.init();
  const ripples=new RippleSystem({scene,waterLevel:waterSystem.waterLevel,maxRipples:72});
  const splashes=new SplashSystem({scene,waterLevel:waterSystem.waterLevel,maxParticles:420});
  const foam=new FoamSystem({scene,waterLevel:waterSystem.waterLevel,maxFoam:48});
  const interaction=new WaterInteractionSystem({scene,camera,waterLevel:waterSystem.waterLevel,rippleSystem:ripples,splashSystem:splashes,foamSystem:foam,wakeInterval:.075,lodNear:30,lodMid:80,maxRegistered:48});
  const registered=new WeakSet();let scanTimer=0;
  function maybeRegister(node){if(!node||registered.has(node))return;if(node.userData?.type==='log'){interaction.register(node,{radius:1.05,mass:24,wakeType:'object',splash:true,wakeLifetime:2.1});registered.add(node);}else if(node.userData?.v73Croc||node.userData?.type==='croc'){interaction.register(node,{sampleObject:crocSample(node),radius:2.25,mass:180,wakeType:'object',splash:true,wakeLifetime:2.7});registered.add(node);}else if(node.userData?.waterDecor){interaction.register(node,{radius:1.8,mass:120,wakeType:'boat',splash:true,wakeLifetime:3.2});registered.add(node);}}
  const basket=findBasket(scene);if(basket){interaction.register(basket,{radius:.9,mass:9,wakeType:'object',splash:false,flowSpeed:7.5,flowDirection:new THREE.Vector3(0,0,-1),wakeLifetime:2.4});registered.add(basket);}
  window.__mosesWaterFX={waterSystem,ripples,splashes,foam,interaction};window.__mosesV7311Ready=true;
  const badge=document.getElementById('version-badge');if(badge){badge.dataset.state='ready';badge.textContent='V7.4 · NILE WATER FX';}
  const clock=new THREE.Clock();function frame(){requestAnimationFrame(frame);const dt=Math.min(.05,clock.getDelta());scanTimer+=dt;if(scanTimer>=.45){scanTimer=0;for(const node of scene.children)maybeRegister(node);}waterSystem.update(dt);interaction.update(dt);ripples.update(dt);splashes.update(dt);foam.update(dt);}frame();
}
boot().catch(error=>{console.error('[V7.4 water]',error);window.__mosesV7311Ready=false;const badge=document.getElementById('version-badge');if(badge){badge.dataset.state='fallback';badge.textContent='V7.4 · WATER FX FALLBACK';}});
