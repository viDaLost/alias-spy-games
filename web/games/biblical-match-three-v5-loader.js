(() => {
"use strict";
const VERSION="15";
const BASE="web/assets/biblical-match-three/hq-v5";
const PART_COUNT=11;
const CELL=128;
const EXPECTED_W=640;
const EXPECTED_H=768;
const POS={
 symbols:{bible:[0,0],fish:[1,0],dove:[2,0],candle:[3,0],crown:[4,0],ark:[0,1],bread:[1,1],grapes:[2,1],tablets:[3,1]},
 boosters:{manna:[4,1],oil:[0,2],covenant:[1,2],sling:[2,2],staff:[3,2],jericho:[4,2],ark:[0,3]},
 goals:{score:[1,3],collect:[2,3],cascade:[3,3],special:[4,3],blockers:[0,4],light:[1,4]},
 obstacles:{chains:[2,4],tablets:[3,4],candle:[4,4],cracked:[0,5]}
};
const LEGACY_SYMBOL=/web\/assets\/biblical-match-three\/(bible|fish|dove|lamp|crown|ark|bread|grapes|tablets)\.svg(?:\?.*)?$/i;

function partUrl(i){return `${BASE}/atlas-${String(i).padStart(2,"0")}.txt?v=${VERSION}`}
function directFish(){return `${BASE}/symbols/fish.webp?v=${VERSION}`}
function waitForImage(src,timeout=10000){
 return new Promise((resolve,reject)=>{
  const img=new Image();img.decoding="sync";img.loading="eager";let done=false;
  const finish=(ok,error)=>{if(done)return;done=true;clearTimeout(timer);img.onload=null;img.onerror=null;ok?resolve(img):reject(error||new Error("Image load failed"))};
  const timer=setTimeout(()=>finish(false,new Error("HQ art decode timeout")),timeout);
  img.onload=()=>finish(true);img.onerror=()=>finish(false,new Error("HQ art image decode failed"));img.src=src;
  if(img.complete&&img.naturalWidth>0)finish(true);
  else img.decode?.().then(()=>finish(true),()=>{});
 });
}
function base64Blob(payload,type){
 const binary=atob(payload);const bytes=new Uint8Array(binary.length);
 for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);
 return new Blob([bytes],{type});
}
async function loadAtlas(){
 const parts=await Promise.all(Array.from({length:PART_COUNT},(_,i)=>fetch(partUrl(i),{cache:"force-cache"}).then(r=>{if(!r.ok)throw new Error(`HQ atlas part ${i}: HTTP ${r.status}`);return r.text()})));
 const payload=parts.join("").replace(/\s+/g,"");
 if(!payload.startsWith("AAAAIGZ0eXBhdmlm"))throw new Error("HQ atlas payload damaged");
 const objectUrl=URL.createObjectURL(base64Blob(payload,"image/avif"));
 try{
  const img=await waitForImage(objectUrl,10000);
  if(img.naturalWidth!==EXPECTED_W||img.naturalHeight!==EXPECTED_H)throw new Error(`HQ atlas geometry ${img.naturalWidth}x${img.naturalHeight}`);
  return {img,objectUrl};
 }catch(error){URL.revokeObjectURL(objectUrl);throw error}
}
function crop(img,col,row){
 const canvas=document.createElement("canvas");canvas.width=CELL;canvas.height=CELL;
 const ctx=canvas.getContext("2d",{alpha:true});ctx.clearRect(0,0,CELL,CELL);ctx.drawImage(img,col*CELL,row*CELL,CELL,CELL,0,0,CELL,CELL);
 const webp=canvas.toDataURL("image/webp",0.96);
 return /^data:image\/webp/i.test(webp)?webp:canvas.toDataURL("image/png");
}
function makeGroup(img,defs){return Object.fromEntries(Object.entries(defs).map(([key,[c,r]])=>[key,crop(img,c,r)]))}
async function warmSource(src){if(!src)return false;try{await waitForImage(src,5000);return true}catch{return false}}
async function warmArt(art){
 const values=[...Object.values(art.symbols),...Object.values(art.boosters),...Object.values(art.goals),...Object.values(art.obstacles)];
 await Promise.all([...new Set(values)].map(warmSource));
}
function symbolSource(id,art=window.BiblicalMatchThreeV5Art){const key=id==="lamp"?"candle":id;return art?.symbols?.[key]||""}
function boosterSource(id,art=window.BiblicalMatchThreeV5Art){const map={lampOil:"oil"};return art?.boosters?.[map[id]||id]||""}
function patchLegacy(root=document,art=window.BiblicalMatchThreeV5Art){
 if(!art)return;
 root.querySelectorAll?.("img").forEach(img=>{
  const current=img.getAttribute("src")||"";
  const booster=img.closest?.("[data-booster]")?.dataset.booster;
  let next=booster?boosterSource(booster,art):"";
  if(!next){const match=current.match(LEGACY_SYMBOL);if(match)next=symbolSource(match[1],art)}
  if(!next&&/hq-v5\/symbols\/ark\.webp/i.test(current))next=symbolSource("ark",art);
  if(next&&current!==next)img.src=next;
  if(next){img.dataset.bmtRaster="hq-v15";img.decoding="sync";img.loading="eager";img.draggable=false}
 });
}
function publish(art){
 window.BiblicalMatchThreeV5Art=art;
 window.BiblicalMatchThreeV4Art=art;
 window.__bmtV5ArtReady=true;
 document.documentElement.dataset.bmtArt=art.kind;
 patchLegacy(document,art);
 return art;
}
async function init(){
 const {img,objectUrl}=await loadAtlas();
 try{
  const art={version:15,symbols:makeGroup(img,POS.symbols),boosters:makeGroup(img,POS.boosters),goals:makeGroup(img,POS.goals),obstacles:makeGroup(img,POS.obstacles),kind:"raster-hq-v15",sourceSize:CELL};
  const atlasFish=art.symbols.fish;
  art.symbols.fish=directFish();
  if(!(await warmSource(art.symbols.fish)))art.symbols.fish=atlasFish;
  await warmArt(art);
  return publish(art);
 }finally{URL.revokeObjectURL(objectUrl)}
}
window.BiblicalMatchThreeV5ArtReady=init().catch(error=>{
 console.error("Biblical Treasures HQ art failed",error);
 throw error;
});
window.__BMTV5Raster={version:15,scan:()=>patchLegacy(document),symbolSource,boosterSource};
})();
