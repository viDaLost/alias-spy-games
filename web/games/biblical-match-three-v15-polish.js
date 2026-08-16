(() => {
"use strict";
if (window.__bmtV15PolishInstalled) return;
window.__bmtV15PolishInstalled = true;

const IMPORTANT = ".bmt-shell,.bmt-menu,.bmt-board,.bmt-booster-tray,.bmt-map,.bmt-free-grid,.bmt-sheet-overlay,.bmt-result-overlay,.bmt-prelevel";
const SYMBOL_BY_LABEL = {
  "Библия":"bible",
  "Рыба":"fish",
  "Голубь":"dove",
  "Светильник":"candle",
  "Венец":"crown",
  "Ковчег":"ark",
  "Хлеб":"bread",
  "Виноград":"grapes",
  "Скрижали":"tablets"
};
const PREBOOSTER_BY_TEXT = {
  "Манна с небес":"manna",
  "Масло светильника":"oil",
  "Радуга Завета":"covenant"
};
let frame = 0;

function art(){ return window.BiblicalMatchThreeV5Art || {}; }
function symbol(key){ return art().symbols?.[key] || ""; }
function booster(key){ return art().boosters?.[key] || ""; }
function mark(img){
  if (!img) return img;
  img.dataset.bmtRaster = "hq-v15";
  img.decoding = "sync";
  img.loading = "eager";
  img.draggable = false;
  return img;
}
function setSource(img, src){
  if (!img || !src) return;
  if (img.getAttribute("src") !== src) img.src = src;
  mark(img);
}
function image(src, className){
  const img = new Image();
  img.alt = "";
  img.className = className;
  setSource(img, src);
  return img;
}

function patchBoardPieces(root){
  root.querySelectorAll?.("img.bmt-piece").forEach((img) => {
    const key = SYMBOL_BY_LABEL[String(img.alt || "").trim()];
    if (key) setSource(img, symbol(key));
  });
}
function patchBoosters(root){
  root.querySelectorAll?.("[data-booster]").forEach((node) => {
    const id = node.dataset.booster;
    const key = id === "lampOil" ? "oil" : id;
    setSource(node.querySelector("img"), booster(key));
  });
  root.querySelectorAll?.(".bmt-prebooster").forEach((node) => {
    const label = node.querySelector("strong")?.textContent?.trim() || "";
    const key = PREBOOSTER_BY_TEXT[label];
    if (key) setSource(node.querySelector("img"), booster(key));
  });
}
function patchGoalImages(root){
  root.querySelectorAll?.(".bmt-goal__icon img,.bmt-prelevel__goals img,.bmt-result-progress img").forEach((img) => {
    const key = SYMBOL_BY_LABEL[String(img.alt || "").trim()];
    if (key) setSource(img, symbol(key));
    else mark(img);
  });
}

function decorateResume(root){
  const resume = root.querySelector?.(".bmt-v13-resume");
  if (!resume) return;
  let img = resume.querySelector(":scope > .bmt-v15-resume-icon");
  if (!img) { img = image(symbol("bible"), "bmt-v15-resume-icon"); resume.prepend(img); }
  else setSource(img, symbol("bible"));
}
function decorateChapters(root){
  const keys = ["bible","dove","ark","crown"];
  root.querySelectorAll?.(".bmt-v13-chapter__head").forEach((head,index) => {
    const chapter = Number(head.closest(".bmt-v13-chapter")?.dataset.chapter || index + 1);
    const src = symbol(keys[(Math.max(1,chapter)-1)%keys.length]);
    let img = head.querySelector(":scope > .bmt-v15-chapter-icon");
    if (!img) { img = image(src,"bmt-v15-chapter-icon"); head.prepend(img); }
    else setSource(img,src);
  });
}
function decorateLevels(root){
  const keys = ["bible","dove","bread","candle","crown","fish","tablets","ark","grapes"];
  root.querySelectorAll?.(".bmt-v13-level,.bmt-map-node").forEach((node,index) => {
    const src = symbol(keys[index%keys.length]);
    let img = node.querySelector(":scope > .bmt-v15-level-icon");
    if (!img) { img = image(src,"bmt-v15-level-icon"); node.append(img); }
    else setSource(img,src);
  });
}
function decorateFree(root){
  const keys = ["bible","dove","crown","fish"];
  root.querySelectorAll?.(".bmt-free-card").forEach((node,index) => {
    const src = symbol(keys[index%keys.length]);
    let img = node.querySelector(":scope > .bmt-v15-free-icon");
    if (!img) { img = image(src,"bmt-v15-free-icon"); node.prepend(img); }
    else setSource(img,src);
  });
}
function patchAppCard(){
  const img = document.querySelector("#biblical-match-three-card img");
  if (img) setSource(img,symbol("bible"));
}
function enhance(root=document){
  window.__BMTV5Raster?.scan?.();
  patchBoardPieces(root);
  patchBoosters(root);
  patchGoalImages(root);
  decorateResume(root);
  decorateChapters(root);
  decorateLevels(root);
  decorateFree(root);
  patchAppCard();
}
function schedule(){
  if (frame) return;
  frame = requestAnimationFrame(() => { frame = 0; enhance(document); });
}
function important(node){ return node?.nodeType===1 && (node.matches?.(IMPORTANT) || node.querySelector?.(IMPORTANT)); }

const observer = new MutationObserver((mutations) => {
  let shouldSchedule = false;
  for (const mutation of mutations) {
    if (mutation.type === "attributes") {
      const img = mutation.target;
      if (img instanceof HTMLImageElement && (/hq-v5\/symbols\/ark\.webp/i.test(img.getAttribute("src")||"") || img.closest?.('[data-booster="ark"]'))) {
        shouldSchedule = true;
        break;
      }
    } else if ([...mutation.addedNodes].some(important) || [...mutation.removedNodes].some(important)) {
      shouldSchedule = true;
      break;
    }
  }
  if (shouldSchedule) schedule();
});
observer.observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:["src"]});

window.BiblicalMatchThreeV15 = { version:15, enhance };
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded",schedule,{once:true});
else schedule();
})();
