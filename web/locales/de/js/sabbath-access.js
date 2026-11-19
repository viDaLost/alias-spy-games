(() => {
  'use strict';
  const Clock = window.SabbathClock;
  const KEY = 'sabbath-selected-city-v1';
  const sourceURL = new URL(document.currentScript?.src || 'web/locales/de/js/sabbath-access.js', document.baseURI);
  sourceURL.pathname = sourceURL.pathname.replace(/\/web\/locales\/(?:en|de|es)\/js\//,'/web/js/');
  const catalogURL = new URL('../data/sabbath-cities.json', sourceURL);
  const titles = {'moses-nile':'Путь по Нилу','biblical-match-three':'Bibelschätze','kids-ark-pairs':'Finde ein Paar','twelve-tribes':'Zwölf Stämme','promised-land':'Gelobtes Land'};
  const restricted = game => Clock.GAME_IDS.includes(game);
  const cityChangeLocked = ({reason}) => reason === 'sabbath' || reason === 'polar';
  let savedCity = readCity();
  let city = savedCity || Clock.CITIES[0], pendingGame = null, modal = null, returnFocus = null, editing = false;
  let timer = null, standalone = null, catalogPromise = null, searchVersion = 0;
  const waiters = new Set();
  const PARENT_ORIGINS = new Set(['https://vidalost.github.io','https://alias-spy-games-app.vitaledanilov.workers.dev','https://appassets.androidplatform.net']);

  function cleanCity(value) {
    if (!Clock.validCity(value)) return null;
    return {name:value.name.trim(), country:String(value.country || '').slice(0,80), latitude:value.latitude,
      longitude:value.longitude, timeZone:value.timeZone};
  }
  function readCity() {
    try {
      localStorage.removeItem('sabbath-device-location-v1');
      return cleanCity(JSON.parse(localStorage.getItem(KEY)));
    } catch { return null; }
  }
  function status() { return {...Clock.state(Date.now(),city),city,citySelected:Boolean(savedCity)}; }
  function notifyCityChange() { window.dispatchEvent(new Event('sabbath:city-change')); }
  function saveCity(value) {
    const chosen = cleanCity(value);
    if (!chosen) return;
    if (cityChangeLocked(status())) {
      check();
      return;
    }
    // A different tab may have saved a city before its storage event reaches this one.
    const latest = window.parent === window ? readCity() : null;
    if (latest && cityChangeLocked(Clock.state(Date.now(), latest))) {
      savedCity = city = latest;
      check();
      notifyCityChange();
      return;
    }
    savedCity = city = chosen;
    try { localStorage.setItem(KEY, JSON.stringify(city)); } catch {}
    const resume = pendingGame;
    editing = !resume;
    check();
    notifyCityChange();
    if (modal) renderModal();
    if (resume && status().allowed && !standalone) {
      close();
      if(resume === 'biblical-match-three') window.openBiblicalMatchThree?.(); else window.showGame?.(resume);
    }
  }
  function fmt(value) {
    return Number.isFinite(value) ? new Date(value).toLocaleString(document.documentElement.lang || 'ru',
      {timeZone:city.timeZone,weekday:'long',day:'numeric',month:'long',hour:'2-digit',minute:'2-digit'}) : '';
  }
  function textNode(tag,text,cls) {
    const node = document.createElement(tag); node.textContent = text; if(cls)node.className=cls; return node;
  }
  function button(text,action,cls='sabbath-button') {
    const node = textNode('button',text,cls);node.type='button';node.addEventListener('click',action);return node;
  }
  function close() {
    searchVersion++;pendingGame=null;editing=false;
    modal?.remove();modal=null;document.documentElement.classList.remove('sabbath-dialog-open');
    returnFocus?.focus?.();returnFocus=null;
  }
  function present(game=null,edit=false) {
    if(game)pendingGame=game;
    editing=edit;
    window.GameEntryLoader?.finish?.(game,true);
    if(!modal) {
      returnFocus=document.activeElement;
      modal=document.createElement('div');modal.className='sabbath-overlay';modal.id='sabbath-dialog';
      modal.setAttribute('role','dialog');modal.setAttribute('aria-modal','true');modal.setAttribute('aria-labelledby','sabbath-title');
      modal.addEventListener('keydown',event=>{
        if(event.key==='Escape'){event.preventDefault();close();}
        if(event.key==='Tab') {
          const nodes=[...modal.querySelectorAll('button,input,a[href]')].filter(node=>!node.disabled&&!node.hidden);
          const first=nodes[0],last=nodes.at(-1);
          if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}
          else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
        }
      });
      document.body.append(modal);document.documentElement.classList.add('sabbath-dialog-open');
    }
    renderModal();modal?.querySelector('button')?.focus();
  }
  function renderModal() {
    if(!modal)return;
    searchVersion++;
    const state=status(),shell=document.createElement('section');shell.className='sabbath-sheet';modal.dataset.state=state.reason;
    const cityLocked = cityChangeLocked(state);
    const top=textNode('div',editing?'Ort für die Sabbatzeiten':'Spielzugang','sabbath-kicker');
    const dismiss=button('×',close,'sabbath-close');dismiss.setAttribute('aria-label','Schließen');top.append(dismiss);shell.append(top);
    const heading=textNode('h2',editing?((state.citySelected||cityLocked)?'Sabbatzeiten':'Wähle deinen Ort'):state.reason==='sabbath'?'Spiele pausiert':'Spiel vorübergehend nicht verfügbar');heading.id='sabbath-title';shell.append(heading);
    shell.append(textNode('p',city.name+' · '+new Date(Date.now()).toLocaleTimeString(document.documentElement.lang||'ru',
      {timeZone:city.timeZone,hour:'2-digit',minute:'2-digit'}),'sabbath-city-current'));
    if(editing) {
      if (!state.citySelected && !cityLocked) shell.append(textNode('p','Wähle deinen Ort, damit die Spiele zum örtlichen Sonnenuntergang pausieren. Bis zur Auswahl gelten die Zeiten für Moskau.'));
      if (Number.isFinite(state.start) && Number.isFinite(state.end)) {
        const schedule=textNode('dl','','sabbath-schedule');
        schedule.append(textNode('dt','Pause ab Sonnenuntergang am Freitag'),textNode('dd',fmt(state.start)),
          textNode('dt','Wieder verfügbar ab Sonnenuntergang am Samstag'),textNode('dd',fmt(state.end)));
        shell.append(schedule);
      } else if (state.reason==='polar') {
        shell.append(textNode('p','Für dieses Datum lässt sich kein normaler Sonnenuntergang berechnen. Fünf Spiele sind vorübergehend nicht verfügbar; andere Spiele finden Sie im Menü.'));
      }
      if (cityLocked) {
        shell.append(textNode('p','Du kannst den Ort nach Ende der Pause ändern.'));
      } else {
        const presets=textNode('div','','sabbath-presets');presets.setAttribute('aria-label','Schnellauswahl des Ortes');
        for(const value of Clock.CITIES){const option=button(value.name,()=>saveCity(value));option.dataset.city=value.name;
          option.setAttribute('aria-pressed',String(state.citySelected&&city.timeZone===value.timeZone&&city.name===value.name));presets.append(option);}
        shell.append(presets);appendSearch(shell);
      }
      shell.append(button('Fertig',close));
    } else {
      shell.append(textNode('p',state.reason==='sabbath'
        ?'Diese fünf Spiele pausieren von Freitag bis Samstag jeweils ab beziehungsweise bis Sonnenuntergang. Andere Spiele bleiben verfügbar.'
        :state.reason==='polar'?'Für dieses Datum lässt sich kein normaler Sonnenuntergang berechnen. Fünf Spiele sind vorübergehend nicht verfügbar; andere Spiele finden Sie im Menü.'
        :'Der Zeitplan konnte nicht berechnet werden. Prüfe Datum und Uhrzeit auf deinem Gerät.'));
      if(state.reason==='sabbath') {
        const schedule=textNode('div','','sabbath-schedule');
        schedule.append(textNode('span','Automatische Freigabe'),textNode('strong',fmt(state.end)));
        const countdown=textNode('span','');countdown.dataset.sabbathCountdown='';schedule.append(countdown);shell.append(schedule);
      }
      if(pendingGame)shell.append(textNode('p',titles[pendingGame]||'','sabbath-game-name'));
      if (cityLocked) shell.append(textNode('p','Du kannst den Ort nach Ende der Pause ändern.'));
      else shell.append(button('Ort ändern',()=>present(pendingGame,true)));
      shell.append(button(document.getElementById('menu-container')?'Andere Spiele':'Schließen',close));
    }
    shell.append(textNode('p','Der gewählte Ort bleibt auf diesem Gerät und wird nicht weitergegeben. Er wird nur zur Berechnung des Sonnenuntergangs verwendet.','sabbath-privacy'));
    modal.replaceChildren(shell);updateCountdown();
  }
  function normalize(text) {
    return String(text).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/ё/g,'е').trim();
  }
  function countryName(code) {
    try {return new Intl.DisplayNames([document.documentElement.lang||'ru'],{type:'region'}).of(code);} catch {return code;}
  }
  function loadCatalog() {
    if(!catalogPromise) catalogPromise=fetch(catalogURL.href,{credentials:'omit',referrerPolicy:'no-referrer'})
      .then(response=>{if(!response.ok)throw new Error('catalog');return response.json();})
      .then(data=>{if(data.version!==1||!Array.isArray(data.cities)||!Array.isArray(data.zones))throw new Error('catalog');return data;})
      .catch(error=>{catalogPromise=null;throw error;});
    return catalogPromise;
  }
  function appendSearch(shell) {
    const form=document.createElement('form');form.className='sabbath-city-form';
    const label=textNode('label','Anderen Ort suchen');label.htmlFor='sabbath-city';
    const input=document.createElement('input');input.id='sabbath-city';input.type='search';input.minLength=2;input.maxLength=100;
    input.placeholder='Stadt, Land';input.autocomplete='off';input.required=true;
    const submit=textNode('button','Finden','sabbath-button');submit.type='submit';
    const results=textNode('div','','sabbath-city-results');results.setAttribute('aria-live','polite');
    form.append(label,input,submit);
    form.addEventListener('submit',async event=>{
      event.preventDefault();const query=normalize(input.value);if(query.length<2)return;
      const version=++searchVersion;submit.disabled=true;results.textContent='Stadt wird gesucht…';
      try {
        const data=await loadCatalog();if(version!==searchVersion||!modal)return;
        const terms=query.split(/[\s,]+/).filter(Boolean),countries=new Map(),buckets=[[],[],[]];
        for(const row of data.cities) {
          if(!countries.has(row[2]))countries.set(row[2],normalize(countryName(row[2]))+' '+row[2].toLowerCase());
          if(!terms.every(term=>row[1].includes(term)||countries.get(row[2]).includes(term)))continue;
          const rank=normalize(row[0])===query?0:row[1].split('|').some(name=>name.startsWith(query))?1:2;
          if(buckets[rank].length>=12)continue;
          const candidate={name:row[0],country:row[2],latitude:row[3],longitude:row[4],timeZone:data.zones[row[5]]};
          if(Clock.validCity(candidate))buckets[rank].push(candidate);
        }
        results.replaceChildren();const found=buckets.flat().slice(0,12);
        if(!found.length)results.textContent='Stadt nicht gefunden. Geben Sie Name und Land genauer an.';
        for(const value of found)results.append(button(value.name+', '+countryName(value.country),()=>saveCity(value),'sabbath-button sabbath-city-result'));
      } catch {if(version===searchVersion&&modal)results.textContent='Das Ortsverzeichnis konnte nicht geladen werden. Suche erneut.';}
      finally {submit.disabled=false;}
    });
    shell.append(form,results);
    const credit=textNode('p','Handbuch: ','sabbath-note');
    const link=textNode('a','GeoNames · CC BY 4.0');link.href='https://www.geonames.org/';link.target='_blank';link.rel='noopener noreferrer';credit.append(link);shell.append(credit);
  }
  function updateCountdown() {
    const node=modal?.querySelector('[data-sabbath-countdown]'),end=status().end;
    if(!node||!end)return;const minutes=Math.max(0,Math.ceil((end-Date.now())/60000));
    node.textContent=`Zeit bis zur Freigabe: ${Math.floor(minutes/60)} ч ${minutes%60} Min.`;
  }
  function authorize(game) {
    if(!restricted(game)){if(modal)close();return true;}
    if(status().allowed){if(modal)close();return true;}
    present(game);return false;
  }
  function sendStatus(frame) {
    if(!frame||!restricted(document.body.dataset.currentGame))return;
    const state=status();frame.contentWindow?.postMessage({type:'sabbath:status',game:document.body.dataset.currentGame,
      city,citySelected:state.citySelected,allowed:state.allowed,reason:state.reason,start:state.start,end:state.end,nextChange:state.allowed?state.start:state.nextChange},new URL(frame.src,location.href).origin);
  }
  function check() {
    clearTimeout(timer);const state=status(),active=document.body?.dataset.currentGame;
    if(restricted(active)&&!state.allowed){(window.appGoToMainMenu||window.goToMainMenu)?.();present(active);}
    if(standalone&&!standalone.bridgePending&&!state.allowed){
      if(standalone.started){location.reload();return;}
      if(!modal)present(standalone.game);
    }
    if(state.allowed){for(const resolve of waiters)resolve();waiters.clear();if(modal&&!editing)close();}
    document.querySelectorAll('[data-sabbath-game]').forEach(card=>{
      const value=state.allowed?'':state.reason==='sabbath'?'Pausiert':'Zugang wird geprüft';
      if(card.dataset.sabbathStatus!==value){card.dataset.sabbathStatus=value;card.classList.toggle('sabbath-card-paused',!state.allowed);}
    });
    const label=document.querySelector('#sabbath-city-card .game-card__desc');
    const cityLabel=state.citySelected?city.name:'Ort auswählen';
    if(label&&label.textContent!==cityLabel)label.textContent=cityLabel;
    if(modal&&modal.dataset.state!==state.reason)renderModal();
    updateCountdown();sendStatus(document.querySelector('#game-container iframe'));
    timer=setTimeout(check,Math.max(20,Math.min(30000,(state.nextChange||Date.now()+30000)-Date.now())));
  }
  function installCards() {
    let added=false;const host=document.getElementById('system-actions');
    if(host&&!document.getElementById('sabbath-city-card')) {
      const card=button('',()=>present(null,true),'game-card');card.id='sabbath-city-card';
      const icon=textNode('span','◷','game-card__icon');icon.setAttribute('aria-hidden','true');
      const body=textNode('span','','game-card__body');body.append(textNode('span','Ort für die Sabbatzeiten','game-card__title'),textNode('span','','game-card__desc'));
      card.append(icon,body);host.append(card);added=true;
    }
    for(const key of Clock.GAME_IDS)document.querySelectorAll(`[data-card-game="${key}"],#${key}-card,button[onclick*="'${key}'"],button[onclick*='"${key}"']`).forEach(card=>{if(!card.dataset.sabbathGame){card.dataset.sabbathGame=key;added=true;}});
    if(added)check();
  }
  async function waitForAccess(game) {
    standalone={game,started:false,bridgePending:true};
    if(window.parent!==window) {
      let expected;try{expected=new URL(document.referrer).origin;}catch{}
      if(PARENT_ORIGINS.has(expected)||expected===location.origin)await new Promise(resolve=>{
        const onMessage=event=>{
          if(event.source!==parent||event.origin!==expected||event.data?.type!=='sabbath:status'||event.data.game!==game)return;
          const chosen=cleanCity(event.data.city);if(!chosen)return;
          city=chosen;savedCity=event.data.citySelected?chosen:null;
          if (savedCity) try {localStorage.setItem(KEY,JSON.stringify(savedCity));} catch {}
          if(!standalone.bridgePending)check();resolve();
        };
        window.addEventListener('message',onMessage);parent.postMessage({type:'sabbath:request',game},expected);
        setTimeout(resolve,2000);
      });
    }
    standalone.bridgePending=false;check();if(!status().allowed)await new Promise(resolve=>waiters.add(resolve));
    close();standalone.started=true;
  }
  window.addEventListener('message',event=>{
    if(event.data?.type!=='sabbath:request'||!restricted(event.data.game))return;
    const frame=document.querySelector('#game-container iframe');
    if(!frame||event.source!==frame.contentWindow||event.origin!==new URL(frame.src,location.href).origin||document.body.dataset.currentGame!==event.data.game)return;
    sendStatus(frame);
  });
  window.SabbathAccess=Object.freeze({authorize,status,restricted,refresh:check,openCityPicker:()=>present(null,true),waitForAccess});
  window.addEventListener('focus',check);window.addEventListener('pageshow',check);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)check();});
  window.addEventListener('storage',event=>{
    if(event.key!==KEY && event.key!==null)return;
    savedCity=readCity();city=savedCity||Clock.CITIES[0];check();
    notifyCityChange();
    if(modal)renderModal();
  });
  function init(){installCards();new MutationObserver(installCards).observe(document.body,{childList:true,subtree:true});check();window.Telegram?.WebApp?.onEvent?.('activated',check);}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
