(async () => {
  'use strict';
  const config=document.getElementById('app-language-bundles');
  if(!config)return;
  const bundles=JSON.parse(config.textContent);
  const lang=await window.AppLanguage?.prepare?.()||'ru';
  const script=document.createElement('script');
  script.src=bundles[lang]||bundles.ru;
  script.async=false;
  script.dataset.appLanguage=lang;
  script.onload=()=>{
    // Translate the initial static shell once. Dynamic screens come from localized bundles.
    const t=window.AppLanguage?.text;
    if(!t)return;
    const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);
    const nodes=[];while(walker.nextNode())nodes.push(walker.currentNode);
    for(const node of nodes) {
      if(node.parentElement?.closest('script,style,#game-container,#system-actions,.game-card,input,textarea,[translate="no"]'))continue;
      const translated=t(node.nodeValue);if(translated!==node.nodeValue)node.nodeValue=translated;
    }
    document.title=t(document.title);
    for(const node of document.querySelectorAll('[aria-label],meta[name="description"],meta[name="application-name"],meta[name="apple-mobile-web-app-title"]')) {
      const attr=node.tagName==='META'?'content':'aria-label';
      node.setAttribute(attr,t(node.getAttribute(attr)));
    }
    document.documentElement.dataset.languageReady=lang;
  };
  script.onerror=()=>{
    const messages={ru:['Не удалось загрузить приложение.','Повторить'],en:['Could not load the app.','Retry'],de:['Die App konnte nicht geladen werden.','Erneut versuchen'],es:['No se pudo cargar la aplicación.','Reintentar']};
    const [message,label]=messages[lang]||messages.ru;
    const loader=document.getElementById('main-loader');
    document.getElementById('gamehub-boot-scene')?.remove();
    if(loader){loader.replaceChildren();const p=document.createElement('p');p.textContent=message;const retry=document.createElement('button');retry.className='game-button';retry.textContent=label;retry.onclick=()=>location.reload();loader.append(p,retry);}
  };
  document.head.appendChild(script);
})();
