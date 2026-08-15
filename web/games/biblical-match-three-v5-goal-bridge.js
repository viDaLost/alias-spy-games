(() => {
"use strict";
if(window.__bmtV5GoalBridgeInstalled)return;
window.__bmtV5GoalBridgeInstalled=true;
let attempts=0;
const timer=setInterval(()=>{
 attempts++;
 if(window.__bmtV5UxInstalled){clearInterval(timer);return;}
 if(window.__bmtV4UxInstalled&&window.BiblicalMatchThreeV5Art){
  clearInterval(timer);
  const script=document.createElement('script');
  script.src='web/games/biblical-match-three-v5-ux.js?v=5';
  script.async=false;
  document.head.appendChild(script);
 }else if(attempts>120)clearInterval(timer);
},50);
})();
