(() => {
"use strict";
const VERSION="17";
const FILES={
 ark:"web/assets/biblical-match-three/icons-v17/ark.webp",
 bible:"web/assets/biblical-match-three/icons-v17/bible.webp",
 bread:"web/assets/biblical-match-three/icons-v17/bread.webp",
 candle:"web/assets/biblical-match-three/icons-v17/candle.webp",
 chains:"web/assets/biblical-match-three/icons-v17/chains.webp",
 covenant:"web/assets/biblical-match-three/icons-v17/covenant.webp",
 crown:"web/assets/biblical-match-three/icons-v17/crown.webp",
 dove:"web/assets/biblical-match-three/icons-v17/dove.webp",
 fish:"web/assets/biblical-match-three/icons-v17/fish.webp",
 grapes:"web/assets/biblical-match-three/icons-v17/grapes.webp",
 jericho:"web/assets/biblical-match-three/icons-v17/jericho.webp",
 score:"web/assets/biblical-match-three/icons-v17/score.webp",
 sling:"web/assets/biblical-match-three/icons-v17/sling.webp",
 staff:"web/assets/biblical-match-three/icons-v17/staff.webp",
 tablets:"web/assets/biblical-match-three/icons-v17/tablets.webp"
};
const file=(name)=>`${FILES[name]}?v=${VERSION}`;
const art={
 version:17,
 kind:"file-webp-v17",
 transport:"file",
 sourceSize:128,
 symbols:{
  bible:file("bible"),fish:file("fish"),dove:file("dove"),candle:file("candle"),crown:file("crown"),
  ark:file("ark"),bread:file("bread"),grapes:file("grapes"),tablets:file("tablets")
 },
 boosters:{
  manna:file("bread"),oil:file("candle"),covenant:file("covenant"),sling:file("sling"),staff:file("staff"),jericho:file("jericho"),ark:file("ark")
 },
 goals:{
  score:file("score"),collect:file("bible"),cascade:file("crown"),special:file("covenant"),blockers:file("chains"),light:file("candle")
 },
 obstacles:{chains:file("chains"),tablets:file("tablets"),candle:file("candle"),cracked:file("chains")}
};

function waitForImage(src,timeout=10000){
 return new Promise((resolve,reject)=>{
  const img=new Image();img.decoding="async";img.loading="eager";let done=false;
  const finish=(ok,error)=>{if(done)return;done=true;clearTimeout(timer);img.onload=null;img.onerror=null;ok?resolve(img):reject(error||new Error(`Image load failed: ${src}`))};
  const timer=setTimeout(()=>finish(false,new Error(`WebP decode timeout: ${src}`)),timeout);
  img.onload=()=>finish(true);img.onerror=()=>finish(false,new Error(`WebP image failed: ${src}`));img.src=src;
  if(img.complete&&img.naturalWidth>0)finish(true);else img.decode?.().then(()=>finish(true),()=>{});
 });
}
function allSources(){return [...new Set([...Object.values(art.symbols),...Object.values(art.boosters),...Object.values(art.goals),...Object.values(art.obstacles)])]}
async function warmArt(){
 const images=await Promise.all(allSources().map(waitForImage));
 if(images.some(img=>img.naturalWidth<64||img.naturalHeight<64))throw new Error("Biblical Treasures V17 icon resolution is too small");
 return art;
}
function symbolSource(id){return art.symbols[id==="lamp"?"candle":id]||""}
function boosterSource(id){return art.boosters[id==="lampOil"?"oil":id]||""}
function goalSource(type){return art.goals[type]||""}
function patchImages(root=document){
 root.querySelectorAll?.("img.bmt-piece").forEach(img=>{const map={"Библия":"bible","Рыба":"fish","Голубь":"dove","Светильник":"candle","Венец":"crown","Ковчег":"ark","Хлеб":"bread","Виноград":"grapes","Скрижали":"tablets"};const key=map[String(img.alt||"").trim()];if(key)img.src=art.symbols[key]});
 root.querySelectorAll?.("[data-booster]").forEach(node=>{const img=node.querySelector("img");const src=boosterSource(node.dataset.booster);if(img&&src)img.src=src});
 root.querySelectorAll?.("img").forEach(img=>{
  if(!img.src)return;
  if(img.src.includes("/biblical-match-three/")&&!img.src.includes("/icons-v17/")){
   const name=(img.getAttribute("src")||"").split("/").pop()?.split(".")[0];const src=symbolSource(name)||boosterSource(name);if(src)img.src=src;
  }
  if((img.getAttribute("src")||"").includes("/icons-v17/")){img.dataset.bmtRaster="webp-v17";img.decoding="async";img.loading="eager";img.draggable=false}
 });
}
function publish(){
 window.BiblicalMatchThreeV5Art=art;window.BiblicalMatchThreeV4Art=art;window.__bmtV5ArtReady=true;
 document.documentElement.dataset.bmtArt=art.kind;patchImages(document);return art;
}
window.BiblicalMatchThreeV5ArtReady=warmArt().then(publish);
window.__BMTV5Raster={version:17,scan:()=>patchImages(document),symbolSource,boosterSource,goalSource};
})();