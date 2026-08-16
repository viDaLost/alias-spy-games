(() => {
"use strict";
const VERSION="16";
const PART_URLS=[
 "web/assets/biblical-match-three/hq-v5/atlas-00.txt",
 "web/assets/biblical-match-three/hq-v5/atlas-01.txt",
 "web/assets/biblical-match-three/hq-v5/atlas-02.txt",
 "web/assets/biblical-match-three/hq-v5/atlas-03.txt",
 "web/assets/biblical-match-three/hq-v5/atlas-04.txt",
 "web/assets/biblical-match-three/hq-v5/atlas-05.txt",
 "web/assets/biblical-match-three/hq-v5/atlas-06.txt",
 "web/assets/biblical-match-three/hq-v5/atlas-07.txt",
 "web/assets/biblical-match-three/hq-v5/atlas-08.txt",
 "web/assets/biblical-match-three/hq-v5/atlas-09.txt",
 "web/assets/biblical-match-three/hq-v5/atlas-10.txt"
];
const FISH_URL="web/assets/biblical-match-three/hq-v5/symbols/fish.webp";
const CELL=128;
const EXPECTED_W=640;
const EXPECTED_H=768;
const ICON_URLS=new Set();
const POS={
 symbols:{bible:[0,0],fish:[1,0],dove:[2,0],candle:[3,0],crown:[4,0],ark:[0,1],bread:[1,1],grapes:[2,1],tablets:[3,1]},
 boosters:{manna:[4,1],oil:[0,2],covenant:[1,2],sling:[2,2],staff:[3,2],jericho:[4,2],ark:[0,3]},
 goals:{score:[1,3],collect:[2,3],cascade:[3,3],special:[4,3],blockers:[0,4],light:[1,4]},
 obstacles:{chains:[2,4],tablets:[3,4],candle:[4,4],cracked:[0,5]}
};
const LEGACY_SYMBOL=/web\/assets\/biblical-match-three\/(bible|fish|dove|lamp|crown|ark|bread|grapes|tablets)\.svg(?:\?.*)?$/i;

function versioned(url){return `${url}?v=${VERSION}`}
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
 const parts=await Promise.all(PART_URLS.map((url,i)=>fetch(versioned(url),{cache:"force-cache"}).then(r=>{if(!r.ok)throw new Error(`HQ atlas part ${i}: HTTP ${r.status}`);return r.text()})));
 const payload=parts.join("").replace(/\s+/g,"");
 if(!payload.startsWith("AAAAIGZ0eXBhdmlm"))throw new Error("HQ atlas payload damaged");
 const objectUrl=URL.createObjectURL(base64Blob(payload,"image/avif"));
 try{
  const img=await waitForImage(objectUrl,10000);
  if(img.naturalWidth!==EXPECTED_W||img.naturalHeight!==EXPECTED_H)throw new Error(`HQ atlas geometry ${img.naturalWidth}x${img.naturalHeight}`);
  return {img,objectUrl};
 }catch(error){URL.revokeObjectURL(objectUrl);throw error}
}
function canvasBlob(canvas,type,quality){
 return new Promise(resolve=>canvas.toBlob(blob=>resolve(blob||null),type,quality));
}
async function crop(img,col,row){
 const canvas=document.createElement("canvas");canvas.width=CELL;canvas.height=CELL;
 const ctx=canvas.getContext("2d",{alpha:true});
 if(!ctx)throw new Error("HQ icon canvas unavailable");
 ctx.clearRect(0,0,CELL,CELL);ctx.drawImage(img,col*CELL,row*CELL,CELL,CELL,0,0,CELL,CELL);
 let blob=await canvasBlob(canvas,"image/webp",0.96);
 if(!blob)blob=await canvasBlob(canvas,"image/png");
 if(!blob)throw new Error("HQ icon raster export failed");
 const url=URL.createObjectURL(blob);ICON_URLS.add(url);return url;
}
async function makeGroup(img,defs){
 const entries=await Promise.all(Object.entries(defs).map(async([key,[c,r]])=>[key,await crop(img,c,r)]));
 return Object.fromEntries(entries);
}
async function warmSource(src){if(!src)return false;try{await waitForImage(src,5000);return true}catch{return false}}
async function warmArt(art){
 const values=[...Object.values(art.symbols),...Object.values(art.boosters),...Object.values(art.goals),...Object.values(art.obstacles)];
 await Promise.all([...new Set(values)].map(warmSource));
}
function lockValue(map,key){
 const value=map?.[key];
 if(!map||!value)return;
 Object.defineProperty(map,key,{enumerable:true,configurable:false,get(){return value},set(){}});
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
  if(next){img.dataset.bmtRaster="hq-v16";img.decoding="sync";img.loading="eager";img.draggable=false}
 });
}
function publish(art){
 lockValue(art.symbols,"ark");
 lockValue(art.boosters,"ark");
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
  const [symbols,boosters,goals,obstacles]=await Promise.all([
   makeGroup(img,POS.symbols),makeGroup(img,POS.boosters),makeGroup(img,POS.goals),makeGroup(img,POS.obstacles)
  ]);
  const art={version:16,symbols,boosters,goals,obstacles,kind:"raster-hq-v16",sourceSize:CELL,transport:"blob"};
  const atlasFish=art.symbols.fish;
  art.symbols.fish=versioned(FISH_URL);
  if(!(await warmSource(art.symbols.fish)))art.symbols.fish=atlasFish;
  await warmArt(art);
  return publish(art);
 }finally{URL.revokeObjectURL(objectUrl)}
}
window.BiblicalMatchThreeV5ArtReady=init().catch(error=>{
 console.error("Biblical Treasures HQ art failed",error);
 throw error;
});
window.__BMTV5Raster={version:16,scan:()=>patchLegacy(document),symbolSource,boosterSource};
})();
