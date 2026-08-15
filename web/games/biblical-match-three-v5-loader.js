(() => {
"use strict";
const VERSION="5";
const BASE="web/assets/biblical-match-three/hq-v5";
const PART_COUNT=11;
const CELL=128;
const POS={
  symbols:{bible:[0,0],fish:[1,0],dove:[2,0],candle:[3,0],crown:[4,0],ark:[0,1],bread:[1,1],grapes:[2,1],tablets:[3,1]},
  boosters:{manna:[4,1],oil:[0,2],covenant:[1,2],sling:[2,2],staff:[3,2],jericho:[4,2],ark:[0,3]},
  goals:{score:[1,3],collect:[2,3],cascade:[3,3],special:[4,3],blockers:[0,4],light:[1,4]},
  obstacles:{chains:[2,4],tablets:[3,4],candle:[4,4],cracked:[0,5]}
};
const GENERIC=/web\/assets\/biblical-match-three\/(bible|fish|dove|lamp|crown|ark|bread|grapes|tablets)\.svg(?:\?.*)?$/;
let observer=null;
function partUrl(i){return `${BASE}/atlas-${String(i).padStart(2,"0")}.txt?v=${VERSION}`}
async function loadAtlas(){
  const parts=await Promise.all(Array.from({length:PART_COUNT},(_,i)=>fetch(partUrl(i),{cache:"force-cache"}).then(r=>{if(!r.ok)throw new Error(`HQ atlas part ${i}: HTTP ${r.status}`);return r.text()})));
  const img=new Image();
  img.decoding="async";
  img.src=`data:image/avif;base64,${parts.join("")}`;
  await img.decode();
  if(img.naturalWidth!==CELL*5||img.naturalHeight!==CELL*6)throw new Error(`HQ atlas geometry ${img.naturalWidth}x${img.naturalHeight}`);
  return img;
}
function crop(img,col,row){
  return new Promise((resolve,reject)=>{
    const c=document.createElement("canvas");c.width=CELL;c.height=CELL;
    const x=c.getContext("2d",{alpha:true});
    x.clearRect(0,0,CELL,CELL);x.drawImage(img,col*CELL,row*CELL,CELL,CELL,0,0,CELL,CELL);
    c.toBlob(blob=>blob?resolve(URL.createObjectURL(blob)):reject(new Error("HQ icon crop failed")),"image/png");
  });
}
async function makeGroup(img,defs){return Object.fromEntries(await Promise.all(Object.entries(defs).map(async([key,[c,r]])=>[key,await crop(img,c,r)])))}
function replaceGeneric(root=document,art=window.BiblicalMatchThreeV5Art){
  if(!art)return;
  root.querySelectorAll?.('img[src*="web/assets/biblical-match-three/"]').forEach(img=>{
    const m=(img.getAttribute("src")||"").match(GENERIC);if(!m)return;
    const key=m[1]==="lamp"?"candle":m[1];const next=art.symbols?.[key];
    if(next&&img.getAttribute("src")!==next){img.src=next;img.dataset.bmtRaster="v5";}
  });
}
function installRewriter(art){
  replaceGeneric(document,art);
  if(observer)observer.disconnect();
  let queued=false;const schedule=()=>{if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;replaceGeneric(document,art)})};
  observer=new MutationObserver(schedule);observer.observe(document.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:["src"]});
}
async function init(){
  const img=await loadAtlas();
  const art={symbols:await makeGroup(img,POS.symbols),boosters:await makeGroup(img,POS.boosters),goals:await makeGroup(img,POS.goals),obstacles:await makeGroup(img,POS.obstacles),kind:"raster-hq-v5",format:"avif-atlas/png-crops",sourceSize:CELL,atlasSize:[img.naturalWidth,img.naturalHeight]};
  window.BiblicalMatchThreeV5Art=art;window.__bmtV5ArtReady=true;installRewriter(art);return art;
}
window.BiblicalMatchThreeV5ArtReady=init();
window.__BMTV5Raster={version:5,cell:CELL,positions:POS,scan:()=>replaceGeneric(document)};
})();