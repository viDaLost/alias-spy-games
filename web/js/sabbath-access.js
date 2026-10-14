(() => {
  'use strict';
  const Clock = window.SabbathClock;
  const KEY = 'sabbath-device-location-v1';
  const MAX_AGE = Clock.dayMs;
  const REFRESH_AGE = 15 * 60000;
  const titles = {'moses-nile':'Путь по Нилу','biblical-match-three':'Библейские сокровища','kids-ark-pairs':'Найди пару','twelve-tribes':'Двенадцать колен','promised-land':'Земля обетованная'};
  const restricted = key => Clock.GAME_IDS.includes(key);
  const zone = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return ''; } };
  let place = readPlace(), pendingGame = null, modal = null, returnFocus = null;
  let timer = null, locating = null, locationError = '', refreshRequired = false;
  let bridgeState = null, standalone = null;
  const waiters = new Set();

  function readPlace() {
    try { const value = JSON.parse(localStorage.getItem(KEY)); return Clock.validCoordinates(value)
      && Number.isFinite(value.savedAt) && ['gps','city'].includes(value.source) ? value : null; } catch { return null; }
  }
  function currentPlace() {
    if (!place || refreshRequired || place.zone !== zone() || Date.now() < place.savedAt
      || Date.now() - place.savedAt > MAX_AGE) return null;
    return place;
  }
  function status() {
    if (bridgeState) {
      if (Date.now() < bridgeState.nextChange) return bridgeState;
      return {allowed:false,reason:'location',nextChange:Date.now()+1000};
    }
    return Clock.state(Date.now(), currentPlace());
  }
  function savePlace(value, source, label) {
    if (!Clock.validCoordinates(value)) throw new Error('coordinates');
    place = {latitude:Math.round(value.latitude*10000)/10000, longitude:Math.round(value.longitude*10000)/10000,
      savedAt:Date.now(), zone:zone(), source, label:String(label || 'Местоположение устройства').slice(0,150)};
    refreshRequired = false; locationError = '';
    try { localStorage.setItem(KEY, JSON.stringify(place)); } catch {}
    check(); renderModal();
  }
  function fmt(value) {
    return Number.isFinite(value) ? new Date(value).toLocaleString(document.documentElement.lang || 'ru',
      {weekday:'long',day:'numeric',month:'long',hour:'2-digit',minute:'2-digit'}) : '';
  }
  function textNode(tag, text, cls) {
    const node = document.createElement(tag); node.textContent = text; if (cls) node.className = cls; return node;
  }
  function button(text, action, cls='sabbath-button') {
    const node = textNode('button',text,cls); node.type='button'; node.addEventListener('click',action); return node;
  }
  function close() {
    modal?.remove(); modal=null; document.documentElement.classList.remove('sabbath-dialog-open');
    returnFocus?.focus?.(); returnFocus=null;
  }
  function present(game=null) {
    if (game) pendingGame=game;
    window.GameEntryLoader?.finish?.(game,true);
    if (!modal) {
      returnFocus=document.activeElement;
      modal=document.createElement('div'); modal.className='sabbath-overlay'; modal.id='sabbath-dialog';
      modal.setAttribute('role','dialog'); modal.setAttribute('aria-modal','true'); modal.setAttribute('aria-labelledby','sabbath-title');
      modal.addEventListener('keydown',event=>{
        if(event.key==='Escape'){event.preventDefault();close();}
        if(event.key==='Tab'){
          const nodes=[...modal.querySelectorAll('button,input,a[href]')].filter(node=>!node.disabled&&!node.hidden);
          const first=nodes[0],last=nodes.at(-1);
          if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}
          else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
        }
      });
      document.body.append(modal); document.documentElement.classList.add('sabbath-dialog-open');
    }
    renderModal(); modal.querySelector('button')?.focus();
  }
  function renderModal() {
    if(!modal)return;
    const state=status(), shell=document.createElement('section'); shell.className='sabbath-sheet';
    modal.dataset.state=state.reason;
    const top=textNode('div','Время субботы','sabbath-kicker');
    const dismiss=button('×',close,'sabbath-close'); dismiss.setAttribute('aria-label','Закрыть'); top.append(dismiss);shell.append(top);
    const heading=textNode('h2',state.reason==='sabbath'?'Игры на паузе':state.reason==='polar'?'В этой местности нет захода солнца':state.allowed?'Расписание игр':'Укажите своё местоположение');heading.id='sabbath-title';shell.append(heading);
    shell.append(textNode('p',state.reason==='sabbath'
      ?'Эти пять игр закрыты на 24 часа с пятничного захода солнца. Остальные игры доступны.'
      :state.reason==='polar'?'На эту дату невозможно рассчитать обычный заход солнца. Пять игр временно недоступны; остальные можно открыть в меню.'
      :'Заход солнца рассчитывается по месту, где вы находитесь. VPN на расчёт не влияет.'));
    if(state.reason==='sabbath') {
      const schedule=textNode('div','', 'sabbath-schedule');
      schedule.append(textNode('span','Откроются автоматически'),textNode('strong',fmt(state.end)));
      const countdown=textNode('span','');countdown.dataset.sabbathCountdown='';schedule.append(countdown);shell.append(schedule);
    } else if(state.start) shell.append(textNode('p',`Следующая пауза: ${fmt(state.start)}. Открытие: ${fmt(state.end)}.`,'sabbath-schedule'));
    if(pendingGame) shell.append(textNode('p',titles[pendingGame] || '', 'sabbath-game-name'));
    const label=currentPlace() ? `${place.label} · ${place.source==='city'?'выбрано вручную':'геолокация устройства'}` : 'Местоположение ещё не подтверждено';
    shell.append(textNode('p',label,'sabbath-location-label'));
    const gps=button(locating?'Определяем местоположение…':'Определить моё местоположение',()=>locate(true),'sabbath-button sabbath-button--primary');gps.disabled=!!locating;shell.append(gps);
    const manager=window.Telegram?.WebApp?.LocationManager;
    if(manager?.isAccessRequested&&!manager.isAccessGranted) shell.append(button('Настройки геолокации Telegram',()=>manager.openSettings()));
    if(place?.source==='city'&&!currentPlace()) shell.append(button('Я по-прежнему в этом городе',()=>savePlace(place,'city',place.label)));
    shell.append(textNode('p','Разрешите геолокацию на устройстве. Координаты используются только здесь, для расчёта времени. В поездке обновите местоположение.','sabbath-note'));
    if(locationError) {const error=textNode('p',locationError,'sabbath-error');error.setAttribute('role','status');shell.append(error);}
    const form=document.createElement('form');form.className='sabbath-city-form';
    const cityLabel=textNode('label','Или выберите свой реальный город');cityLabel.htmlFor='sabbath-city';
    const input=document.createElement('input');input.id='sabbath-city';input.type='search';input.placeholder='Город, страна';input.minLength=2;input.maxLength=100;input.required=true;input.autocomplete='address-level2';
    const submit=textNode('button','Найти','sabbath-button');submit.type='submit';
    const results=document.createElement('div');results.className='sabbath-city-results';results.setAttribute('aria-live','polite');
    form.append(cityLabel,input,submit);form.addEventListener('submit',async event=>{
      event.preventDefault();const query=input.value.trim();if(query.length<2)return;submit.disabled=true;results.textContent='Ищем город…';
      const abort=new AbortController(), timeout=setTimeout(()=>abort.abort(),12000);
      try {
        const url=new URL('https://geocoding-api.open-meteo.com/v1/search');url.search=new URLSearchParams({name:query,count:'8',language:'ru',format:'json'});
        const response=await fetch(url,{signal:abort.signal,credentials:'omit',referrerPolicy:'no-referrer'});
        if(!response.ok)throw new Error('city');const data=await response.json();results.replaceChildren();
        const found=(data.results||[]).filter(Clock.validCoordinates);
        if(!found.length)results.textContent='Город не найден. Уточните название и страну.';
        for(const city of found){const name=[city.name,city.admin1,city.country].filter(Boolean).filter((x,i,a)=>a.indexOf(x)===i).join(', ');
          results.append(button(name,()=>savePlace(city,'city',name),'sabbath-city-result'));}
      } catch {results.textContent='Не удалось найти город. Повторите поиск или включите геолокацию.';}
      finally {clearTimeout(timeout);submit.disabled=false;}
    });
    shell.append(form,results);
    const credit=textNode('p','Поиск городов: Open-Meteo / GeoNames. Время и часовой пояс — с вашего устройства.','sabbath-note');shell.append(credit);
    if(state.allowed&&pendingGame) shell.append(button('Продолжить игру',()=>{
      const game=pendingGame;pendingGame=null;close();
      if(game==='biblical-match-three')window.openBiblicalMatchThree?.();else window.showGame?.(game);
    },'sabbath-button sabbath-button--primary'));
    shell.append(button(document.getElementById('menu-container')?'К другим играм':'Закрыть',()=>{pendingGame=null;close();}));
    modal.replaceChildren(shell); updateCountdown();
  }
  function updateCountdown() {
    const node=modal?.querySelector('[data-sabbath-countdown]'),end=status().end;
    if(!node||!end)return;const minutes=Math.max(0,Math.ceil((end-Date.now())/60000));
    node.textContent=`До открытия: ${Math.floor(minutes/60)} ч ${minutes%60} мин`;
  }
  function telegramLocation() {
    const manager=window.Telegram?.WebApp?.LocationManager;
    if(!manager)return Promise.resolve(null);
    return new Promise(resolve=>{
      const done=()=>resolve(manager.isLocationAvailable?manager:null);
      try{manager.isInited?done():manager.init(done);}catch{resolve(null);}
    });
  }
  function browserLocation() {
    return new Promise((resolve,reject)=>{
      if(!navigator.geolocation){reject(new Error('unavailable'));return;}
      navigator.geolocation.getCurrentPosition(value=>resolve(value.coords),reject,{enableHighAccuracy:true,timeout:15000,maximumAge:0});
    });
  }
  async function locate(userInitiated=false) {
    if(locating)return locating;
    locating=(async()=>{
      try {
        const manager=await telegramLocation();let coords;
        if(manager) {
          if(!userInitiated&&!manager.isAccessGranted)return;
          coords=await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(new Error('timeout')),18000);
            manager.getLocation(value=>{clearTimeout(timeout);value?resolve(value):reject(new Error('denied'));});});
        } else {
          if(!userInitiated){const permission=await navigator.permissions?.query?.({name:'geolocation'});if(permission?.state!=='granted')return;}
          coords=await browserLocation();
        }
        savePlace(coords,'gps','Местоположение устройства');
      } catch {if(userInitiated)locationError='Не удалось получить геолокацию. Разрешите её в настройках Telegram или браузера либо выберите реальный город.';}
      finally {locating=null;check();renderModal();}
    })();
    renderModal();return locating;
  }
  function authorize(game) {
    if(!restricted(game))return true;
    const state=status();if(state.allowed)return true;
    present(game);return false;
  }
  function check() {
    if(!bridgeState&&!standalone?.bridgePending&&!document.hidden&&place?.source==='gps'&&!refreshRequired
      &&Date.now()-place.savedAt>REFRESH_AGE){refreshRequired=true;locate(false);}
    clearTimeout(timer);const state=status();
    const active=document.body?.dataset.currentGame;
    if(restricted(active)&&!state.allowed) {
      (window.appGoToMainMenu||window.goToMainMenu)?.();
      present(active);
    }
    if(standalone&&!standalone.bridgePending&&!state.allowed) {
      if(standalone.started){location.reload();return;}
      present(standalone.game);
    }
    if(state.allowed){for(const resolve of waiters)resolve();waiters.clear();}
    document.querySelectorAll('[data-sabbath-game]').forEach(card=>{
      const value=state.allowed?'':state.reason==='sabbath'?'До субботы':'Нужно местоположение';
      if(card.dataset.sabbathStatus!==value){card.dataset.sabbathStatus=value;card.classList.toggle('sabbath-card-paused',!state.allowed);}
    });
    if(modal?.dataset.state!==state.reason){if(modal){modal.dataset.state=state.reason;renderModal();}}
    updateCountdown();
    timer=setTimeout(check,Math.max(20,Math.min(30000,(state.nextChange||Date.now()+30000)-Date.now())));
  }
  function refresh() {
    if(bridgeState){check();return;}
    if(place?.source==='gps'&&(Date.now()-place.savedAt>REFRESH_AGE||place.zone!==zone())){
      refreshRequired=true;locate(false);
    } else if(!place)locate(false);
    check();
  }
  function installCards() {
    let added=false;
    const host=document.getElementById('system-actions');
    if(host&&!document.getElementById('sabbath-settings-card')){
      const card=button('',()=>{pendingGame=null;present();},'game-card');card.id='sabbath-settings-card';
      card.innerHTML='<span class="game-card__icon" aria-hidden="true">☀</span><span class="game-card__body"><span class="game-card__title">Время субботы</span><span class="game-card__desc">Местоположение и расписание пяти игр</span></span>';
      host.append(card);
    }
    for(const key of Clock.GAME_IDS){
      document.querySelectorAll(`[data-card-game="${key}"],#${key}-card,button[onclick*="'${key}'"],button[onclick*='"${key}"']`).forEach(card=>{if(!card.dataset.sabbathGame){card.dataset.sabbathGame=key;added=true;}});
    }
    if(added)check();
  }
  const PARENT_ORIGINS=new Set(['https://vidalost.github.io','https://alias-spy-games-app.vitaledanilov.workers.dev','https://appassets.androidplatform.net']);
  async function waitForAccess(game) {
    standalone={game,started:false,bridgePending:true};
    if(window.parent!==window) {
      let expected;try{expected=new URL(document.referrer).origin;}catch{}
      if(PARENT_ORIGINS.has(expected)||expected===location.origin){
        // Only the actual app parent can authorize an embedded game. No IP lookup.
        const received=new Promise(resolve=>{
          const onMessage=event=>{if(event.source!==parent||event.origin!==expected||event.data?.type!=='sabbath:status'||typeof event.data.allowed!=='boolean')return;
            bridgeState={allowed:event.data.allowed,reason:event.data.allowed?'open':'sabbath',nextChange:Number(event.data.nextChange)||Date.now()+30000};
            window.removeEventListener('message',onMessage);resolve(true);};
          window.addEventListener('message',onMessage);parent.postMessage({type:'sabbath:request',game},expected);
          setTimeout(()=>{window.removeEventListener('message',onMessage);resolve(false);},2000);
        });
        await received;
      }
    }
    standalone.bridgePending=false;
    check();if(!status().allowed)await new Promise(resolve=>waiters.add(resolve));
    close();standalone.started=true;
  }
  window.addEventListener('message',event=>{
    if(event.data?.type!=='sabbath:request'||!restricted(event.data.game))return;
    const frame=document.querySelector('#game-container iframe');
    if(!frame||event.source!==frame.contentWindow||event.origin!==new URL(frame.src,location.href).origin
      ||document.body.dataset.currentGame!==event.data.game)return;
    const state=status();
    const friday=new Date();friday.setHours(0,0,0,0);friday.setDate(friday.getDate()+((5-friday.getDay()+7)%7||7));
    // Without coordinates the next possible restriction is Friday, so an
    // embedded game must not restart at an unrelated weekday midnight.
    const nextChange=state.allowed?(state.start||+friday):state.nextChange;
    event.source.postMessage({type:'sabbath:status',allowed:state.allowed,nextChange},event.origin);
  });
  window.SabbathAccess=Object.freeze({authorize,status,restricted,refresh,locate,openSettings:()=>present(),waitForAccess});
  window.addEventListener('focus',refresh);window.addEventListener('pageshow',refresh);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});
  window.addEventListener('storage',event=>{if(event.key===KEY){place=readPlace();refreshRequired=false;check();renderModal();}});
  function init(){installCards();new MutationObserver(installCards).observe(document.body,{childList:true,subtree:true});refresh();
    window.Telegram?.WebApp?.onEvent?.('activated',refresh);}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
