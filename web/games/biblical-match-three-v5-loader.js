(() => {
"use strict";
const VERSION="7";
const BASE="web/assets/biblical-match-three/hq-v5";
const FALLBACK_BASE="web/assets/biblical-match-three";
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
const GENERIC=/web\/assets\/biblical-match-three\/(bible|fish|dove|lamp|crown|ark|bread|grapes|tablets)\.svg(?:\?.*)?$/;
let observer=null;
function partUrl(i){return `${BASE}/atlas-${String(i).padStart(2,"0")}.txt?v=${VERSION}`}
function asset(name){return `${FALLBACK_BASE}/${name}.svg?v=${VERSION}`}
function direct(name){return `${BASE}/symbols/${name}.webp?v=${VERSION}`}
function waitForImage(src,timeout=10000){
 return new Promise((resolve,reject)=>{
  const img=new Image();img.decoding="async";let done=false;
  const finish=(ok,error)=>{if(done)return;done=true;clearTimeout(timer);img.onload=null;img.onerror=null;ok?resolve(img):reject(error||new Error("Image load failed"))};
  const timer=setTimeout(()=>finish(false,new Error("HQ art decode timeout")),timeout);
  img.onload=()=>finish(true);img.onerror=()=>finish(false,new Error("HQ art image decode failed"));img.src=src;
  if(img.complete&&img.naturalWidth>0)finish(true);
 });
}
function base64Blob(payload,type){
 const binary=atob(payload);const bytes=new Uint8Array(binary.length);
 for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);
 return new Blob([bytes],{type});
}
async function loadAtlas(){
 try{if(new URL(location.href).searchParams.get("artFallback")==="1")throw new Error("Forced fallback test")}catch(error){if(String(error?.message||"").includes("Forced fallback"))throw error}
 const parts=await Promise.all(Array.from({length:PART_COUNT},(_,i)=>fetch(partUrl(i),{cache:"force-cache"}).then(r=>{if(!r.ok)throw new Error(`HQ atlas part ${i}: HTTP ${r.status}`);return r.text()})));
 const payload=parts.join("").replace(/\s+/g,"");
 if(!payload.startsWith("AAAAIGZ0eXBhdmlm"))throw new Error("HQ atlas payload повреждён");
 const objectUrl=URL.createObjectURL(base64Blob(payload,"image/avif"));
 try{
  const img=await waitForImage(objectUrl,10000);
  if(img.naturalWidth!==EXPECTED_W||img.naturalHeight!==EXPECTED_H)throw new Error(`HQ atlas geometry ${img.naturalWidth}x${img.naturalHeight}`);
  return {img,objectUrl};
 }catch(error){URL.revokeObjectURL(objectUrl);throw error}
}
function crop(img,col,row){
 return new Promise((resolve,reject)=>{
  const c=document.createElement("canvas");c.width=CELL;c.height=CELL;
  const x=c.getContext("2d",{alpha:true});x.clearRect(0,0,CELL,CELL);x.drawImage(img,col*CELL,row*CELL,CELL,CELL,0,0,CELL,CELL);
  c.toBlob(blob=>blob?resolve(URL.createObjectURL(blob)):reject(new Error("HQ icon crop failed")),"image/png");
 });
}
async function makeGroup(img,defs){return Object.fromEntries(await Promise.all(Object.entries(defs).map(async([key,[c,r]])=>[key,await crop(img,c,r)])))}
function fallbackArt(){
 return {
  version:7,
  symbols:{bible:asset("bible"),fish:direct("fish"),dove:asset("dove"),candle:asset("lamp"),crown:asset("crown"),ark:direct("ark"),bread:asset("bread"),grapes:asset("grapes"),tablets:asset("tablets")},
  boosters:{manna:asset("bread"),oil:asset("lamp"),covenant:asset("dove"),sling:asset("crown"),staff:asset("tablets"),jericho:asset("lamp"),ark:direct("ark")},
  goals:{score:asset("crown"),collect:asset("bible"),cascade:asset("dove"),special:asset("crown"),blockers:asset("tablets"),light:asset("lamp")},
  obstacles:{chains:asset("tablets"),tablets:asset("tablets"),candle:asset("lamp"),cracked:asset("tablets")},
  kind:"safe-fallback-v7",sourceSize:192
 };
}
function replaceGeneric(root=document,art=window.BiblicalMatchThreeV5Art){
 if(!art)return;
 root.querySelectorAll?.('img[src*="web/assets/biblical-match-three/"]').forEach(img=>{
  const m=(img.getAttribute("src")||"").match(GENERIC);if(!m)return;
  const key=m[1]==="lamp"?"candle":m[1];const next=art.symbols?.[key];
  if(next&&img.getAttribute("src")!==next){img.src=next;img.dataset.bmtRaster=art.kind.startsWith("raster")?"v7":"fallback"}
 });
}
function installRewriter(art){
 replaceGeneric(document,art);if(observer)observer.disconnect();
 let queued=false;const schedule=()=>{if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;replaceGeneric(document,art)})};
 observer=new MutationObserver(schedule);observer.observe(document.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:["src"]});
}
function publish(art){
 window.BiblicalMatchThreeV5Art=art;window.BiblicalMatchThreeV4Art=art;window.__bmtV5ArtReady=true;
 document.documentElement.dataset.bmtArt=art.kind;installRewriter(art);return art;
}
async function init(){
 try{
  const {img,objectUrl}=await loadAtlas();
  try{
   const art={version:7,symbols:await makeGroup(img,POS.symbols),boosters:await makeGroup(img,POS.boosters),goals:await makeGroup(img,POS.goals),obstacles:await makeGroup(img,POS.obstacles),kind:"raster-hq-v7",sourceSize:CELL};
   art.symbols.fish=direct("fish");art.symbols.ark=direct("ark");return publish(art);
  }finally{URL.revokeObjectURL(objectUrl)}
 }catch(error){
  console.warn("Biblical Treasures HQ art fallback activated",error);return publish(fallbackArt());
 }
}
window.BiblicalMatchThreeV5ArtReady=init().catch(error=>{console.warn("Biblical Treasures art emergency fallback",error);return publish(fallbackArt())});
window.__BMTV5Raster={version:7,scan:()=>replaceGeneric(document)};
})();
