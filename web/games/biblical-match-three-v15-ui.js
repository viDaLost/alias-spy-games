(() => {
"use strict";
if (window.__bmtV15UiInstalled) return;
window.__bmtV15UiInstalled = true;

const IMPORTANT = ".bmt-shell,.bmt-menu,.bmt-board,.bmt-board-screen,.bmt-sheet-overlay,.bmt-result-overlay,.bmt-pause-overlay,.bmt-tutorial";
let enhanceFrame = 0;
let fitFrame = 0;
let observedBoard = null;
let boardResizeObserver = null;

function clamp(value,min,max){return Math.max(min,Math.min(max,value))}
function telegramTopInset(){
  const tg=window.Telegram?.WebApp;
  if(!tg)return 0;
  const content=Number(tg.contentSafeAreaInset?.top||0);
  const safe=Number(tg.safeAreaInset?.top||0);
  return Math.round(clamp(Math.max(content,safe)||104,82,146));
}
function syncViewport(){
  const vv=window.visualViewport;
  const height=Math.max(360,Number(vv?.height||window.innerHeight||document.documentElement.clientHeight||0));
  const top=telegramTopInset();
  document.documentElement.style.setProperty("--bmt-v13-vh",`${height}px`);
  document.documentElement.style.setProperty("--bmt-v13-top",`${top}px`);
  document.documentElement.style.setProperty("--bmt-v13-content-h",`${Math.max(280,height-top)}px`);
  const hasBoard=Boolean(document.querySelector(".bmt-board"));
  const hasMenu=Boolean(document.querySelector(".bmt-menu"));
  document.body.classList.toggle("bmt-v13-board-active",hasBoard);
  document.body.classList.toggle("bmt-v13-menu-active",!hasBoard&&hasMenu);
}
function currentLevelNode(campaign){
  const current=campaign?.querySelector(".bmt-map-node.is-current,.bmt-journey-node.is-current");
  if(current)return current;
  const unlocked=[...(campaign?.querySelectorAll(".bmt-map-node:not([disabled]),.bmt-journey-node:not([disabled])")||[])];
  return unlocked.at(-1)||null;
}
function normalizeChapters(map){
  let sections=[...map.querySelectorAll(":scope > .bmt-v13-chapter,:scope > .bmt-journey-chapter")];
  if(sections.length){sections.forEach(section=>section.classList.add("bmt-v13-chapter"));return sections}
  const children=[...map.children];
  if(!children.some(node=>node.classList.contains("bmt-map__chapter")))return [];
  const fragment=document.createDocumentFragment();
  let section=null,grid=null,chapter=0;
  for(const child of children){
    if(child.classList.contains("bmt-map__chapter")){
      chapter+=1;
      section=document.createElement("section");section.className="bmt-v13-chapter";section.dataset.chapter=String(chapter);
      const head=document.createElement("header");head.className="bmt-v13-chapter__head";
      head.innerHTML=`<span>Глава ${chapter}</span><strong>${child.textContent?.trim()||`Глава ${chapter}`}</strong>`;
      grid=document.createElement("div");grid.className="bmt-v13-level-grid";
      section.append(head,grid);fragment.append(section);
    }else if(child.classList.contains("bmt-map-node")&&grid){child.classList.add("bmt-v13-level");grid.append(child)}
    else if(section)section.append(child);
  }
  map.replaceChildren(fragment);
  return [...map.querySelectorAll(":scope > .bmt-v13-chapter")];
}
function normalizeExistingJourney(section){
  if(section.querySelector(":scope > .bmt-v13-level-grid"))return;
  const path=section.querySelector(":scope > .bmt-journey-path");
  const oldHead=section.querySelector(":scope > .bmt-journey-chapter__head");
  const title=oldHead?.querySelector("strong")?.textContent?.trim()||oldHead?.textContent?.trim()||`Глава ${section.dataset.chapter||""}`;
  if(oldHead){const head=document.createElement("header");head.className="bmt-v13-chapter__head";head.innerHTML=`<span>Глава ${section.dataset.chapter||""}</span><strong>${title}</strong>`;oldHead.replaceWith(head)}
  if(path){path.classList.add("bmt-v13-level-grid");[...path.querySelectorAll(".bmt-map-node,.bmt-journey-node")].forEach(node=>node.classList.add("bmt-v13-level"))}
}
function setupChapterNav(campaign){
  const map=campaign?.querySelector(".bmt-map");if(!map)return;
  const sections=normalizeChapters(map);if(!sections.length)return;
  sections.forEach(normalizeExistingJourney);map.classList.add("bmt-v13-map");
  let nav=campaign.querySelector(":scope > .bmt-v13-chapter-nav");
  if(!nav){nav=document.createElement("div");nav.className="bmt-v13-chapter-nav";map.before(nav)}
  let active=sections.findIndex(section=>section.querySelector(".is-current"));
  if(active<0){const candidates=sections.map((section,index)=>({section,index})).filter(({section})=>section.querySelector(".bmt-map-node:not([disabled]),.bmt-journey-node:not([disabled])"));active=candidates.at(-1)?.index??0}
  const activate=index=>{
    sections.forEach((section,i)=>{section.hidden=i!==index;section.classList.toggle("is-active",i===index)});
    [...nav.children].forEach((button,i)=>button.classList.toggle("is-active",i===index));
  };
  if(nav.children.length!==sections.length){nav.replaceChildren();sections.forEach((section,index)=>{const button=document.createElement("button");button.type="button";button.className="bmt-v13-chapter-tab";button.textContent=String(index+1);button.setAttribute("aria-label",`Глава ${index+1}`);button.addEventListener("click",()=>activate(index));nav.append(button)})}
  activate(active);
}
function enhanceMenu(shell){
  if(!shell)return;
  shell.classList.add("bmt-v13-menu");shell.querySelector(".bmt-hero-v2")?.remove();
  const title=shell.querySelector(".bmt-homebar .bmt-title"),kicker=shell.querySelector(".bmt-homebar .bmt-kicker");
  if(title)title.textContent="Библейские сокровища";if(kicker)kicker.textContent="Головоломка";
  const campaign=shell.querySelector(".bmt-campaign"),free=shell.querySelector(".bmt-free-panel");if(!campaign||!free)return;
  setupChapterNav(campaign);
  const daily=shell.querySelector(".bmt-daily");if(daily&&!daily.classList.contains("is-ready"))daily.remove();
  if(shell.dataset.v15Menu==="1")return;shell.dataset.v15Menu="1";
  const current=currentLevelNode(campaign);
  const currentTitle=current?.querySelector(".bmt-map-node__body strong")?.textContent?.trim()||"Первый свет";
  const currentNumber=current?.querySelector(".bmt-map-node__medallion")?.textContent?.trim()||"1";
  const summary=campaign.querySelector(".bmt-section-summary")?.textContent?.replace(/\s+/g," ").trim()||"0 / 90 ★";
  const resume=document.createElement("section");resume.className="bmt-v13-resume";resume.innerHTML=`<div><span>Путь света</span><strong>Уровень ${currentNumber} · ${currentTitle}</strong><small>${summary}</small></div><button type="button">Продолжить</button>`;resume.querySelector("button")?.addEventListener("click",()=>current?.click());
  const tabs=document.createElement("div");tabs.className="bmt-v13-mode-tabs";tabs.innerHTML=`<button type="button" class="is-active" data-v13-mode="campaign">Путь света</button><button type="button" data-v13-mode="free">Свободная игра</button>`;
  const stage=document.createElement("div");stage.className="bmt-v13-stage";campaign.classList.add("bmt-v13-pane","is-active");free.classList.add("bmt-v13-pane");stage.append(campaign,free);
  const homebar=shell.querySelector(".bmt-homebar");homebar?.after(resume);if(daily?.isConnected)resume.after(daily);(daily?.isConnected?daily:resume).after(tabs);tabs.after(stage);
  tabs.addEventListener("click",event=>{const button=event.target.closest("[data-v13-mode]");if(!button)return;const mode=button.dataset.v13Mode;tabs.querySelectorAll("button").forEach(item=>item.classList.toggle("is-active",item===button));campaign.classList.toggle("is-active",mode==="campaign");free.classList.toggle("is-active",mode==="free")});
}
function adjacentIndex(index,dx,dy,rows,cols){
  const row=Math.floor(index/cols),col=index%cols,nr=row+dy,nc=col+dx;
  if(nr<0||nr>=rows||nc<0||nc>=cols)return null;return nr*cols+nc;
}
function attachSwipe(board){
  if(!board||board.dataset.v15Swipe==="1")return;board.dataset.v15Swipe="1";
  let pointer=null,synthetic=false,suppressClickUntil=0;
  board.addEventListener("click",event=>{if(synthetic||performance.now()>=suppressClickUntil)return;event.preventDefault();event.stopImmediatePropagation()},true);
  board.addEventListener("pointerdown",event=>{
    if(event.button!=null&&event.button!==0)return;
    const tile=event.target.closest(".bmt-tile");if(!tile||!board.contains(tile)||tile.disabled||tile.classList.contains("is-hole"))return;
    pointer={id:event.pointerId,index:Number(tile.dataset.index),x:event.clientX,y:event.clientY};
    try{board.setPointerCapture?.(event.pointerId)}catch{}
  },{passive:true});
  board.addEventListener("pointermove",event=>{if(!pointer||pointer.id!==event.pointerId)return;if(Math.hypot(event.clientX-pointer.x,event.clientY-pointer.y)>7)event.preventDefault()},{passive:false});
  board.addEventListener("pointercancel",()=>{pointer=null},{passive:true});
  board.addEventListener("pointerup",event=>{
    if(!pointer||pointer.id!==event.pointerId)return;
    const state=pointer;pointer=null;const dx=event.clientX-state.x,dy=event.clientY-state.y;
    const tile=board.querySelector(`.bmt-tile[data-index="${state.index}"]`);const threshold=Math.max(12,Math.min(tile?.clientWidth||52,tile?.clientHeight||52)*.2);
    if(Math.hypot(dx,dy)<threshold)return;
    const horizontal=Math.abs(dx)>=Math.abs(dy),sx=horizontal?Math.sign(dx):0,sy=horizontal?0:Math.sign(dy);
    const rows=Math.max(1,Number(board.dataset.rows||8)),cols=Math.max(1,Number(board.dataset.cols||8));const targetIndex=adjacentIndex(state.index,sx,sy,rows,cols);if(targetIndex==null)return;
    const source=board.querySelector(`.bmt-tile[data-index="${state.index}"]`),target=board.querySelector(`.bmt-tile[data-index="${targetIndex}"]`);if(!source||!target||source.disabled||target.disabled||source.classList.contains("is-hole")||target.classList.contains("is-hole"))return;
    suppressClickUntil=performance.now()+420;event.preventDefault();event.stopPropagation();
    requestAnimationFrame(()=>{synthetic=true;try{source.click();target.click()}finally{synthetic=false}});
  },{passive:false});
}
function fitBoardNow(){
  fitFrame=0;syncViewport();const board=document.querySelector(".bmt-board"),wrap=board?.closest(".bmt-board-wrap");if(!board||!wrap)return;attachSwipe(board);
  const rows=Math.max(1,Number(board.dataset.rows||8)),cols=Math.max(1,Number(board.dataset.cols||8)),style=getComputedStyle(wrap);
  const padX=(parseFloat(style.paddingLeft)||0)+(parseFloat(style.paddingRight)||0),padY=(parseFloat(style.paddingTop)||0)+(parseFloat(style.paddingBottom)||0);
  const maxW=Math.max(120,wrap.clientWidth-padX),maxH=Math.max(120,wrap.clientHeight-padY);let width=Math.min(maxW,maxH*cols/rows),height=width*rows/cols;if(height>maxH){height=maxH;width=height*cols/rows}
  board.style.width=`${Math.floor(width)}px`;board.style.height=`${Math.floor(height)}px`;board.style.maxWidth="100%";board.style.maxHeight="100%";
}
function scheduleFit(){if(fitFrame)return;fitFrame=requestAnimationFrame(()=>requestAnimationFrame(fitBoardNow))}
function watchBoard(board){
  if(observedBoard===board)return;boardResizeObserver?.disconnect();observedBoard=board||null;if(!board)return;
  boardResizeObserver=new ResizeObserver(scheduleFit);const wrap=board.closest(".bmt-board-wrap");if(wrap)boardResizeObserver.observe(wrap);attachSwipe(board);scheduleFit();
}
function mountOverlays(){document.querySelectorAll("#game-container .bmt-sheet-overlay,#game-container .bmt-result-overlay,#game-container .bmt-pause-overlay,#game-container .bmt-tutorial").forEach(overlay=>document.body.append(overlay))}
function enhance(){
  mountOverlays();const menu=document.querySelector(".bmt-menu");if(menu)enhanceMenu(menu);watchBoard(document.querySelector(".bmt-board"));syncViewport();scheduleFit();
}
function nodeImportant(node){return node?.nodeType===1&&(node.matches?.(IMPORTANT)||node.querySelector?.(IMPORTANT))}
function scheduleEnhance(){if(enhanceFrame)return;enhanceFrame=requestAnimationFrame(()=>{enhanceFrame=0;enhance()})}
const observer=new MutationObserver(mutations=>{for(const mutation of mutations){if([...mutation.addedNodes].some(nodeImportant)||[...mutation.removedNodes].some(nodeImportant)){scheduleEnhance();return}}});observer.observe(document.documentElement,{childList:true,subtree:true});
window.addEventListener("resize",scheduleFit,{passive:true});window.addEventListener("orientationchange",scheduleFit,{passive:true});window.visualViewport?.addEventListener("resize",scheduleFit,{passive:true});
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",enhance,{once:true});else enhance();
window.BiblicalMatchThreeV15UI={version:18,enhance,fit:fitBoardNow};
})();
