(() => {
  'use strict';
  const language=window.AppLanguage;
  if(!language)return;
  function install() {
    const menu=document.getElementById('menu-container');
    if(!language.authorized) {document.getElementById('app-language-control')?.remove();return;}
    if(!menu||document.getElementById('app-language-control'))return;
    const section=document.createElement('section');
    section.className='language-panel';
    section.id='app-language-control';
    section.innerHTML=`<div class="language-panel__row"><label for="app-language">Язык приложения</label><select id="app-language" aria-label="Язык приложения"><option value="ru" lang="ru">Русский</option><option value="en" lang="en">English</option><option value="de" lang="de">Deutsch</option><option value="es" lang="es">Español</option></select></div><details class="language-welcome"><summary>Добро пожаловать!</summary><p>Играй вместе с друзьями и открывай Библию по-новому.</p><p>Выберите игру и начните партию. Язык можно изменить в главном меню в любой момент.</p></details>`;
    const select=section.querySelector('select');
    select.value=language.lang;
    select.addEventListener('change',()=>language.choose(select.value));
    menu.prepend(section);
    // New visitors see the introduction; it stays available without blocking a game.
    let seen=false;try {seen=localStorage.getItem('app_welcome_seen_v1')==='1';}catch{}
    if(!seen) {section.querySelector('details').open=true;try{localStorage.setItem('app_welcome_seen_v1','1');}catch{}}
  }
  window.addEventListener('app-language-access',install);
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();
