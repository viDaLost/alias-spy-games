(() => {
"use strict";
const ART=window.BiblicalMatchThreeV5Art;
if(!ART||window.__bmtV5UxInstalled)return;
window.__bmtV5UxInstalled=true;

const entries=[];
for(const [groupName,group] of Object.entries({symbols:ART.symbols,boosters:ART.boosters,goals:ART.goals,obstacles:ART.obstacles})){
 for(const [key,url] of Object.entries(group||{})) if(typeof url==='string') entries.push([url,`${groupName}:${key}`]);
}
const KEY_BY_URL=new Map(entries);
const SYMBOL_MATCH=[
 ['bible',/библи/i],['fish',/рыб/i],['dove',/голуб/i],['candle',/(свеч|светиль)/i],['crown',/корон/i],['ark',/ковчег/i],['bread',/хлеб/i],['grapes',/виноград/i],['tablets',/скрижал/i]
];
function mark(img,key){if(!img)return;const k=key||KEY_BY_URL.get(img.src);if(k)img.dataset.bmtV5Key=k;}
function symbolFor(text){for(const [key,rx] of SYMBOL_MATCH)if(rx.test(text))return [ART.symbols?.[key],`symbols:${key}`];return null;}
function goalFor(text){
 const t=(text||'').replace(/\s+/g,' ').trim().toLowerCase();
 if(/набрать/.test(t)&&/очк/.test(t))return [ART.goals?.score,'goals:score'];
 if(/каскад|комбо/.test(t))return [ART.goals?.cascade,'goals:cascade'];
 if(/особ/.test(t)&&/фишк|усилен/.test(t))return [ART.goals?.special,'goals:special'];
 if(/зажечь|зажги|огон/.test(t))return [ART.goals?.light,'goals:light'];
 if(/разбить|сломать|очистить|препятств|цеп/.test(t))return [ART.goals?.blockers,'goals:blockers'];
 const specific=symbolFor(t); if(specific&&/собрать|собери|сбор/.test(t))return specific;
 if(/собрать|собери|сбор/.test(t))return [ART.goals?.collect,'goals:collect'];
 return specific;
}
function replaceCardIcon(card){
 const hit=goalFor(card.textContent||''); if(!hit||!hit[0])return;
 let img=card.querySelector('img');
 if(!img){img=document.createElement('img');img.alt='';img.decoding='async';img.draggable=false;const holder=card.querySelector('.bmt-goal__icon,.bmt-prelevel-goal__icon')||card;holder.prepend(img)}
 if(img.src!==hit[0])img.src=hit[0];mark(img,hit[1]);
}
function patch(root=document){
 if(root.nodeType===1&&root.tagName==='IMG')mark(root);
 root.querySelectorAll?.('img').forEach(img=>mark(img));
 root.querySelectorAll?.('.bmt-goal,.bmt-prelevel-goal').forEach(replaceCardIcon);
}
let queued=false;
function queue(){if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;patch(document)});}
const observer=new MutationObserver(records=>{
 for(const record of records){
  if(record.type==='attributes')mark(record.target);
  else for(const node of record.addedNodes)if(node.nodeType===1)patch(node);
 }
 queue();
});
observer.observe(document.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:['src']});
patch(document);
})();
