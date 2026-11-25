(() => {
  'use strict';
  const Clock = window.SabbathClock;
  const KEY = 'sabbath-selected-city-v1';
  const GUEST_WEEK = 'sabbath-guest-week-v1';
  const AUTO_ZONE = 'sabbath-device-zone-v1';
  const PENDING_WEEK = 'sabbath-pending-week-v1';
  const deviceZone = () => Clock.normalizeZone(Intl.DateTimeFormat().resolvedOptions().timeZone) || 'UTC';
  const autoCity = () => Clock.referenceCity(readLocal(AUTO_ZONE) || deviceZone());
  const sourceURL = new URL(document.currentScript?.src || 'web/locales/de/js/sabbath-access.js', document.baseURI);
  sourceURL.pathname = sourceURL.pathname.replace(/\/web\/locales\/(?:en|de|es)\/js\//,'/web/js/');
  const catalogURL = new URL('../data/sabbath-cities.json', sourceURL);
  const titles = {'moses-nile':'Путь по Нилу','biblical-match-three':'Bibelschätze','kids-ark-pairs':'Finde ein Paar','twelve-tribes':'Zwölf Stämme','promised-land':'Gelobtes Land'};
  const restricted = game => Clock.GAME_IDS.includes(game);
  const core = document.querySelector('meta[name="app-core-backend"]')?.content
    || 'https://alias-spy-games-core.vitaledanilov.workers.dev';
  const clockURL = new URL('/app/time', core);
  const refreshInterval = 15 * 60_000;
  const offlineLimit = 6 * 60 * 60_000;
  const phaseLocked = ({reason,cityFrozen}) => cityFrozen || reason === 'sabbath' || reason === 'polar' || reason === 'unverified';
  const cityChangeLocked = state => state.now === null || (!state.mandatory && (phaseLocked(state) || state.now < state.lockedUntil));
  let clockAnchor, clockRequest, nextClockSync = 0;
  let savedCity = readCity(), guestWeek = readLocal(GUEST_WEEK);
  let seenPendingWeek = Number(readLocal(PENDING_WEEK)) || 0;
  let city = savedCity || autoCity(), pendingGame = null, modal = null, returnFocus = null, editing = false;
  let saving = false, saveError = '', confirmationCity = null;
  let resumeAfterSync = null;
  let timer = null, standalone = null, catalogPromise = null, searchVersion = 0;
  const waiters = new Set();
  const PARENT_ORIGINS = new Set(['https://vidalost.github.io','https://alias-spy-games-app.vitaledanilov.workers.dev','https://appassets.androidplatform.net']);

  function cleanCity(value) {
    if (!Clock.validCity(value)) return null;
    return {name:value.name.trim(), country:String(value.country || '').slice(0,80), latitude:value.latitude,
      longitude:value.longitude, timeZone:value.timeZone};
  }
  function readLocal(key) {
    try { return JSON.parse(localStorage.getItem(key)); } catch { return null; }
  }
  function writeLocal(key,value) {
    try { localStorage.setItem(key,JSON.stringify(value)); } catch { /* Available until this tab closes. */ }
  }
  function readCity() {
    try { localStorage.removeItem('sabbath-device-location-v1'); } catch {}
    return cleanCity(readLocal(KEY));
  }
  function trustedNow() {
    if (!clockAnchor) return null;
    const elapsed = performance.now() - clockAnchor.monotonic;
    // The device clock can invalidate a sample after sleep or a clock adjustment.
    // It never supplies the time used for a game or the city cutoff.
    const wallElapsed = Date.now() - clockAnchor.wall;
    if (elapsed < 0 || elapsed >= offlineLimit || Math.abs(wallElapsed - elapsed) > 90_000) {
      clockAnchor = null;
      nextClockSync = 0;
      return null;
    }
    return clockAnchor.server + elapsed;
  }
  function syncClock(force = false) {
    const started = performance.now();
    if (clockRequest || (!force && started < nextClockSync)) return;
    nextClockSync = started + 30_000;
    clockRequest = (async () => {
      try {
        const response = await fetch(clockURL.href, {
          cache:'no-store', credentials:'omit', referrerPolicy:'no-referrer',
          signal:AbortSignal.timeout(5000)
        });
        if (!response.ok) return;
        const {now} = await response.json();
        if (!Number.isSafeInteger(now) || now <= 0 || !Number.isFinite(+new Date(now))) return;
        const monotonic = performance.now();
        clockAnchor = {server:now, monotonic, wall:Date.now()};
        nextClockSync = monotonic + refreshInterval;
      } catch { /* Retain a usable sample during a brief outage. */ }
      finally {
        clockRequest = null;
        check();
      }
    })();
  }
  function status() {
    const now = trustedNow();
    const account = window.AppAccess?.sabbathProfile?.();
    const signedIn = window.AppAccess?.sabbathSignedIn?.() === true;
    const profile = account || (!signedIn ? guestWeek : null);
    const selectedCity = profile?.city || savedCity;
    const preserved = profile?.effectiveUntil && (now === null || now < profile.effectiveUntil);
    const place = preserved ? profile.place : (profile?.city || city);
    const schedule = now === null ? {allowed:false,reason:'unverified'} : Clock.state(now,place);
    // Only the parent app issues the reminder for games embedded in an iframe.
    const topLevel = window.parent === window;
    const week = now === null ? null : Clock.weekFor(now,place.timeZone);
    const confirmedWeek = profile?.confirmedWeek || 0;
    // The public clock can respond before the signed-in player's saved confirmation.
    const due = signedIn ? (account ? week ?? account.week : 0) : Math.max(week || 0, seenPendingWeek);
    const mandatory = topLevel && due >= Clock.FIRST_WEEK && due > confirmedWeek;
    return {...schedule,now,city:place,week,mandatory,confirmedWeek,signedIn,citySelected:Boolean(selectedCity),
      selectedCity,lockedUntil:profile?.lockedUntil || 0};
  }
  function notifyCityChange() { window.dispatchEvent(new Event('sabbath:city-change')); }
  function saveCity(value) {
    const chosen = cleanCity(value);
    if (!chosen) return;
    const state = status();
    if (cityChangeLocked(state)) {
      check();
      return;
    }
    // A different tab may have saved a city before its storage event reaches this one.
    const latest = window.parent === window ? readCity() : null;
    if (latest && !state.mandatory && phaseLocked(Clock.state(state.now, latest))) {
      savedCity = city = latest;
      check();
      notifyCityChange();
      return;
    }
    if (saving) return;
    saveError = '';
    if (state.signedIn) {
      saving = true;
      const save = window.AppAccess.sabbathRequest;
      Promise.resolve().then(async () => {
        const profile = window.AppAccess.sabbathProfile();
        if (!profile || (state.mandatory && profile.week < state.week)) await window.AppAccess.verify();
        const week = window.AppAccess.sabbathProfile()?.week;
        if (week === undefined) throw new Error('Не удалось проверить расписание. Повторите попытку.');
        await save('confirm',{week,city:chosen});
        finishSelection(chosen,state.mandatory);
      }).catch(error => { saveError = error.message; })
        .finally(() => { saving = false; if (modal) renderModal(); });
      renderModal();
      return;
    }
    if (state.mandatory) {
      const lockWeek = Math.max(state.week,seenPendingWeek,Clock.weekFor(state.now,chosen.timeZone));
      const oldWindow = Clock.weekWindow(state.week,state.city);
      const effectiveUntil = phaseLocked(state) && oldWindow.end > state.now ? oldWindow.end : null;
      guestWeek = {confirmedWeek:lockWeek,city:chosen,place:state.city,effectiveUntil,
        lockedUntil:Math.max(effectiveUntil || 0,Clock.weekWindow(lockWeek,chosen).end)};
      writeLocal(GUEST_WEEK,guestWeek);
    } else if (guestWeek) {
      guestWeek = {...guestWeek,city:chosen,effectiveUntil:null};
      writeLocal(GUEST_WEEK,guestWeek);
    }
    finishSelection(chosen,state.mandatory);
  }
  function finishSelection(chosen,wasMandatory) {
    savedCity = city = chosen;
    writeLocal(KEY,chosen);
    const resume = pendingGame;
    const state = status();
    const canResume = resume && !state.mandatory && (state.allowed || !restricted(resume)) && !standalone;
    if (canResume || (wasMandatory && !state.mandatory && !resume)) close();
    else editing = !resume;
    check();
    notifyCityChange();
    if (modal) renderModal();
    if (canResume) {
      if(resume === 'biblical-match-three') window.openBiblicalMatchThree?.(); else window.showGame?.(resume);
    }
  }
  function fmt(value, timeZone) {
    return Number.isFinite(value) ? new Date(value).toLocaleString(document.documentElement.lang || 'ru',
      {timeZone,weekday:'long',day:'numeric',month:'long',hour:'2-digit',minute:'2-digit'}) : '';
  }
  function textNode(tag,text,cls) {
    const node = document.createElement(tag); node.textContent = text; if(cls)node.className=cls; return node;
  }
  function button(text,action,cls='sabbath-button') {
    const node = textNode('button',text,cls);node.type='button';node.addEventListener('click',action);return node;
  }
  function close() {
    if (status().mandatory) return;
    searchVersion++;pendingGame=null;editing=false;resumeAfterSync=null;confirmationCity=null;
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
        if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();close();}
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
    const mandatory = state.mandatory;
    modal.dataset.mandatory = String(mandatory);
    const place = state.city;
    const unverified = state.reason === 'unverified';
    modal.dataset.cityLocked = String(cityLocked);
    const clockNotice = () => {
      shell.append(textNode('p','Stelle eine Internetverbindung her, um die Uhrzeit zu prüfen. Andere Spiele bleiben verfügbar.'));
      shell.append(button('Uhrzeit prüfen',()=>syncClock(true)));
    };
    const top=textNode('div',editing||mandatory?'Ort für die Sabbatzeiten':'Spielzugang','sabbath-kicker');
    if (!mandatory) {
      const dismiss=button('×',close,'sabbath-close');dismiss.setAttribute('aria-label','Schließen');top.append(dismiss);
    }
    shell.append(top);
    const heading=textNode('h2',mandatory?'Wähle deinen Ort für den Sabbat':editing?((state.citySelected||cityLocked)?'Sabbatzeiten':'Wähle deinen Ort'):state.reason==='sabbath'?'Spiele pausiert':'Spiel vorübergehend nicht verfügbar');
    heading.id='sabbath-title';shell.append(heading);
    const localTime = unverified ? '' : new Date(state.now).toLocaleTimeString(document.documentElement.lang||'ru',
      {timeZone:place.timeZone,hour:'2-digit',minute:'2-digit'});
    shell.append(textNode('p',localTime ? place.name+' · '+localTime : place.name,'sabbath-city-current'));
    if(editing || mandatory) {
      if (mandatory) shell.append(textNode('p','Wir berechnen den Sonnenuntergang am Freitag und Samstag für deinen Ort. Bestätige deinen Ort, um fortzufahren. Nach dem Sonnenuntergang am Samstag kannst du ihn ändern.'));
      if (place.automatic) shell.append(textNode('p','Der Zeitplan ist vorläufig und basiert auf der Zeitzone deines Geräts.'));
      if (state.selectedCity && state.selectedCity.name !== place.name) shell.append(textNode('p','Сохранённый город: '+state.selectedCity.name));
      if (state.now !== null && state.now < state.lockedUntil && !mandatory) {
        shell.append(textNode('p','Dein bestätigter Ort bleibt bis zum Ende der Sabbatpause festgelegt.'));
      }
      if (Number.isFinite(state.start) && Number.isFinite(state.end)) {
        const schedule=textNode('dl','','sabbath-schedule');
        schedule.append(textNode('dt','Pause ab Sonnenuntergang am Freitag'),textNode('dd',fmt(state.start,place.timeZone)),
          textNode('dt','Wieder verfügbar ab Sonnenuntergang am Samstag'),textNode('dd',fmt(state.end,place.timeZone)));
        shell.append(schedule);
      } else if (state.reason==='polar') {
        shell.append(textNode('p','Für dieses Datum lässt sich kein normaler Sonnenuntergang berechnen. Fünf Spiele sind vorübergehend nicht verfügbar; andere Spiele finden Sie im Menü.'));
      }
      if (unverified) {
        clockNotice();
      } else if (cityLocked) {
        if (state.now >= state.lockedUntil) shell.append(textNode('p','Ab Donnerstag bleibt der Ort bis zum Ende der Sabbatpause festgelegt.'));
      } else {
        const selected = mandatory ? confirmationCity || state.selectedCity : state.selectedCity;
        const isSelected = (value,choice) => choice?.name === value.name && choice.timeZone === value.timeZone
          && choice.latitude === value.latitude && choice.longitude === value.longitude;
        const confirm = mandatory ? button('OK',()=>saveCity(confirmationCity || state.selectedCity),'sabbath-button sabbath-confirm') : null;
        const selectedLabel = mandatory ? textNode('p','','sabbath-city-current') : null;
        if (confirm) {
          confirm.dataset.sabbathConfirm='';
          selectedLabel.setAttribute('aria-live','polite');
        }
        const updateSelection = choice => {
          selectedLabel.textContent = choice ? choice.name : '';
          selectedLabel.hidden = !choice;
          confirm.disabled = !choice || saving;
        };
        const cityOption = (label,value,cls) => {
          const option = button(label,()=>{
            if (!mandatory) { saveCity(value); return; }
            confirmationCity = value;
            for (const previous of shell.querySelectorAll('[aria-pressed="true"]')) previous.setAttribute('aria-pressed','false');
            option.setAttribute('aria-pressed','true');
            updateSelection(value);
          },cls);
          option.setAttribute('aria-pressed',String(isSelected(value,confirmationCity || selected)));
          return option;
        };
        const presets=textNode('div','','sabbath-presets');presets.setAttribute('aria-label','Schnellauswahl des Ortes');
        const choices = [state.selectedCity, place.automatic && Clock.validCity(place) ? place : null, ...Clock.CITIES].filter(Boolean);
        const seen = new Set();
        for (const value of choices) {
          if (seen.has(value.name)) continue;
          seen.add(value.name);
          const option=cityOption(value.name,value);option.dataset.city=value.name;
          presets.append(option);
        }
        shell.append(presets);appendSearch(shell,cityOption);
        if (confirm) {
          updateSelection(selected);
          shell.append(selectedLabel,confirm);
        }
      }
      if (saveError || saving) {
        const notice=textNode('p',saving?'Ort wird gespeichert…':saveError);
        notice.setAttribute('role','status');shell.append(notice);
      }
      if (saving) shell.querySelectorAll('[data-city],.sabbath-city-form button,.sabbath-city-form input').forEach(node=>{node.disabled=true;});
      if (!mandatory) shell.append(button('Fertig',close));
    } else {
      if (unverified) clockNotice();
      else shell.append(textNode('p',state.reason==='sabbath'
        ?'Diese fünf Spiele pausieren von Freitag bis Samstag jeweils ab beziehungsweise bis Sonnenuntergang. Andere Spiele bleiben verfügbar.'
        :state.reason==='polar'?'Für dieses Datum lässt sich kein normaler Sonnenuntergang berechnen. Fünf Spiele sind vorübergehend nicht verfügbar; andere Spiele finden Sie im Menü.'
        :'Die Uhrzeit konnte nicht berechnet werden.'));
      if(state.reason==='sabbath') {
        const schedule=textNode('div','','sabbath-schedule');
        schedule.append(textNode('span','Automatische Freigabe'),textNode('strong',fmt(state.end,place.timeZone)));
        const countdown=textNode('span','');countdown.dataset.sabbathCountdown='';schedule.append(countdown);shell.append(schedule);
      }
      if(pendingGame)shell.append(textNode('p',titles[pendingGame]||'','sabbath-game-name'));
      if (!unverified) {
        if (cityLocked) shell.append(textNode('p','Du kannst den Ort nach Ende der Pause ändern.'));
        else shell.append(button('Ort ändern',()=>present(pendingGame,true)));
      }
      shell.append(button(document.getElementById('menu-container')?'Andere Spiele':'Schließen',close));
    }
    shell.append(textNode('p',state.signedIn
      ?'Dein Ort wird zur Berechnung des Sonnenuntergangs im Konto gespeichert. Der Hauptadministrator kann den Ort und die Anzahl der Änderungen im Berichtszeitraum sehen.'
      :'Der gewählte Ort bleibt auf diesem Gerät und wird nicht weitergegeben. Er wird nur zur Berechnung des Sonnenuntergangs verwendet.','sabbath-privacy'));
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
  function appendSearch(shell,cityOption) {
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
        for(const value of found)results.append(cityOption(value.name+', '+countryName(value.country),value,'sabbath-button sabbath-city-result'));
      } catch {if(version===searchVersion&&modal)results.textContent='Das Ortsverzeichnis konnte nicht geladen werden. Suche erneut.';}
      finally {submit.disabled=false;}
    });
    shell.append(form,results);
    const credit=textNode('p','Handbuch: ','sabbath-note');
    const link=textNode('a','GeoNames · CC BY 4.0');link.href='https://www.geonames.org/';link.target='_blank';link.rel='noopener noreferrer';credit.append(link);shell.append(credit);
  }
  function updateCountdown() {
    const node=modal?.querySelector('[data-sabbath-countdown]'),end=status().end;
    const now=trustedNow();
    if(!node||!end||now===null)return;const minutes=Math.max(0,Math.ceil((end-now)/60000));
    node.textContent=`Zeit bis zur Freigabe: ${Math.floor(minutes/60)} ч ${minutes%60} Min.`;
  }
  function authorize(game, retry) {
    const state = status();
    if (state.mandatory) { present(game,true); return false; }
    if(!restricted(game)){if(modal)close();return true;}
    if(state.allowed){if(modal)close();return true;}
    resumeAfterSync = state.reason === 'unverified' ? retry : null;
    if (state.reason === 'unverified') syncClock();
    present(game);return false;
  }
  function sendStatus(frame) {
    if(!frame||!restricted(document.body.dataset.currentGame))return;
    const state=status();frame.contentWindow?.postMessage({type:'sabbath:status',game:document.body.dataset.currentGame,
      city:state.city,citySelected:!state.city.automatic,now:state.now,allowed:state.allowed,reason:state.reason,start:state.start,end:state.end,nextChange:state.allowed?state.start:state.nextChange},new URL(frame.src,location.href).origin);
  }
  function check() {
    clearTimeout(timer);const state=status(),active=document.body?.dataset.currentGame;
    if (restricted(active) && !state.allowed) {
      (window.appGoToMainMenu||window.goToMainMenu)?.();
      present(active,state.mandatory);
    }
    if (!state.signedIn && state.mandatory && state.week > seenPendingWeek) {
      seenPendingWeek = state.week;
      writeLocal(PENDING_WEEK,state.week);
    } else if (!state.signedIn && !state.mandatory && seenPendingWeek && state.confirmedWeek >= seenPendingWeek) {
      seenPendingWeek = 0;
      writeLocal(PENDING_WEEK,0);
    }
    if (state.mandatory && modal?.dataset.mandatory !== 'true') present(null,true);
    if (!state.mandatory && !saving && !pendingGame && modal?.dataset.mandatory === 'true') close();
    if(standalone&&!standalone.bridgePending&&!state.allowed){
      if (standalone.started) {
        standalone.started = false;
        location.reload();
        return;
      }
      if(!modal)present(standalone.game);
    }
    if(state.allowed){
      for(const resolve of waiters)resolve();
      waiters.clear();
      if(modal&&!editing&&!state.mandatory){
        const resume = resumeAfterSync;
        close();
        if (resume) queueMicrotask(resume);
      }
    } else if (state.reason !== 'unverified') {
      resumeAfterSync = null;
    }
    document.querySelectorAll('[data-sabbath-game]').forEach(card=>{
      const value=state.allowed?'':state.reason==='sabbath'?'Pausiert':'Zugang wird geprüft';
      if(card.dataset.sabbathStatus!==value){card.dataset.sabbathStatus=value;card.classList.toggle('sabbath-card-paused',!state.allowed);}
    });
    const label=document.querySelector('#sabbath-city-card .game-card__desc');
    const cityLabel=state.selectedCity?.name || state.city.name;
    if(label&&label.textContent!==cityLabel)label.textContent=cityLabel;
    if(modal&&(modal.dataset.state!==state.reason||modal.dataset.cityLocked!==String(cityChangeLocked(state))
      ||modal.dataset.mandatory!==String(state.mandatory)))renderModal();
    if (state.now !== null && !state.citySelected && !state.mandatory && state.allowed && !state.cityFrozen && window.parent === window) {
      const zone = deviceZone();
      if (zone !== city.timeZone) {
        city = Clock.referenceCity(zone);
        notifyCityChange();
      }
      if (readLocal(AUTO_ZONE) !== zone) writeLocal(AUTO_ZONE,zone);
    }
    updateCountdown();sendStatus(document.querySelector('#game-container iframe'));
    if (!document.hidden && (!standalone || !standalone.bridgePending)) syncClock();
    const delay = state.nextChange && state.now !== null ? state.nextChange - state.now : 30_000;
    timer=setTimeout(check,Math.max(20,Math.min(30_000,delay)));
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
          const incoming = event.data.city;
          const chosen = incoming?.automatic ? Clock.referenceCity(incoming.timeZone) : cleanCity(incoming);
          if (!chosen) return;
          city=chosen;savedCity=event.data.citySelected?chosen:null;
          if (Number.isFinite(event.data.now) && (trustedNow() === null || standalone.bridgePending)) {
            const monotonic = performance.now();
            clockAnchor = {server:event.data.now, monotonic, wall:Date.now()};
            nextClockSync = monotonic + refreshInterval;
          }
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
  window.addEventListener('online',()=>syncClock(true));
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)check();});
  window.addEventListener('app-access:sabbath',()=>{
    const profile = window.AppAccess.sabbathProfile();
    if (profile?.city) {
      savedCity = city = profile.city;
      writeLocal(KEY,profile.city);
    } else if (profile?.place) city = profile.place;
    check();
    notifyCityChange();
    if (modal) renderModal();
  });
  window.addEventListener('storage',event=>{
    if (![KEY,GUEST_WEEK,AUTO_ZONE,PENDING_WEEK,null].includes(event.key))return;
    savedCity=readCity();guestWeek=readLocal(GUEST_WEEK);seenPendingWeek=Number(readLocal(PENDING_WEEK))||0;
    city=savedCity||autoCity();check();
    notifyCityChange();
    if(modal)renderModal();
  });
  function init(){installCards();new MutationObserver(installCards).observe(document.body,{childList:true,subtree:true});check();window.Telegram?.WebApp?.onEvent?.('activated',check);}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
