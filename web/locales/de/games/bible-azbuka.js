(() => {
  'use strict';

  const GAME = 'bible-azbuka';
  const SESSION = 'bible-azbuka-room-v2';
  const RULES_SEEN = 'bible-azbuka-rules-seen-v1';
  const cats = ['Name', 'Город или местность', 'Pflanze', 'Gegenstand', 'Tier'];
  const emoji = ['📜', '🗺️', '🌿', '💎', '🦁'];
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;',
  })[char]);
  const roomCode = value => {
    const code = String(value || '').trim().toUpperCase();
    return /^[A-HJ-NP-Z2-9]{6}$/.test(code) ? code : '';
  };
  let active, assets, qrDecoder;

  function loadText(url) {
    return fetch(url).then(response => {
      if (!response.ok) throw new Error('Не удалось загрузить игру.');
      return response.text();
    });
  }

  function loadAssets() {
    assets ||= Promise.all([
      loadText('web/locales/de/games/bible-azbuka.html?v=3'),
      loadText('web/locales/de/games/bible-azbuka.css?v=1'),
    ]).catch(error => {
      assets = null;
      throw error;
    });
    return assets;
  }

  function qrDecodeLibrary() {
    if (typeof window.jsQR === 'function') return Promise.resolve(window.jsQR);
    qrDecoder ||= new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'web/vendor/jsqr.min.js?v=1';
      script.onload = () => window.jsQR ? resolve(window.jsQR) : reject(new Error('QR-декодер недоступен'));
      script.onerror = () => { script.remove(); reject(new Error('QR-декодер недоступен')); };
      document.head.append(script);
    }).catch(error => { qrDecoder = null; throw error; });
    return qrDecoder;
  }

  function cleanup() {
    active?.dispose();
    active = null;
  }

  async function start() {
    if (!window.canPlayBibleAzbuka?.()) return;
    cleanup();
    const container = document.getElementById('game-container');
    const entry = { dispose() {} };
    active = entry;
    try {
      const [markup, css] = await loadAssets();
      if (active !== entry || document.body.dataset.currentGame !== GAME || !window.canPlayBibleAzbuka()) return;
      const host = document.createElement('div');
      const root = host.attachShadow({ mode: 'open' });
      const style = document.createElement('style');
      style.textContent = css;
      const content = document.createElement('template');
      content.innerHTML = markup;
      root.append(style, content.content);
      container.replaceChildren(host);
      entry.dispose = mount(root);
      document.dispatchEvent(new CustomEvent('game-entry:ready', { detail: GAME }));
    } catch (error) {
      if (active !== entry) return;
      container.innerHTML = '<section class="app-error-card"><h2>Не удалось открыть «Библейскую азбуку»</h2><button class="back-button" type="button">Erneut versuchen</button></section>';
      container.querySelector('button').onclick = start;
      window.showToast?.(error.message);
    }
  }

  function mount(root) {
    const $ = id => root.getElementById(id);
    let disposed = false;
    let room = null, view = '', round = -1, roundId = null, verified = false, timeoutAt = 0;
    let pollBusy = false, actionBusy = false, pollPaused = false, errors = 0, pollAfter = 0;
    let saveTimer = 0, toastTimer = 0, lastMsg = '', lastPlayers = '';
    const presenceId = Array.from(crypto.getRandomValues(new Uint8Array(16)),byte=>byte.toString(16).padStart(2,'0')).join('');
    let presenceSequence = 0, offlineCode = '';

    function toast(message) {
      if (disposed) return;
      const element = $('toast');
      element.textContent = message;
      element.hidden = false;
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => { element.hidden = true; }, 4200);
    }

    function show(ids) {
      for (const id of ['welcome','lobby','settings-pane','players-pane','playing','results','chat-pane','leave-row']) {
        $(id).hidden = !ids.includes(id);
      }
      $('aside').hidden = !ids.includes('chat-pane');
    }

    function saved() {
      try { return JSON.parse(localStorage.getItem(SESSION) || '{}') || {}; }
      catch { return {}; }
    }

    function remember(code) {
      try { localStorage.setItem(SESSION, JSON.stringify({ code, nick: $('nickname').value.trim() })); }
      catch { /* The room code can still be used to reconnect. */ }
    }

    function leaveMembership(code) {
      if (!code) return;
      void window.AppAccess.azbukaRequest(`${code}/leave`, presencePayload(), {keepalive:true}).catch(()=>{});
    }

    function setBusy(id, busy) { $(id).disabled = busy; }

    function presencePayload(data = {}) {
      return {...data,presenceId,presenceSequence:++presenceSequence};
    }

    function closedRoom(code) {
      if (saved().code === code) remember('');
      if (disposed) return;
      room = null;
      pollPaused = true;
      window.AppPresenceContext?.clearRoom?.(GAME);
      window.goToMainMenu();
      window.showToast?.('Комната закрыта. Создайте новую, чтобы продолжить.');
    }

    function notifyOffline(code=room?.code) {
      if (!code || offlineCode===code) return;
      offlineCode=code;
      void window.AppAccess.azbukaRequest(`${code}/offline`,presencePayload(),{keepalive:true}).then(async response=>{
        const result=await response.json().catch(()=>({}));
        if (response.status===404||result.closed===true) {
          if (saved().code===code) remember('');
          if (!disposed&&room?.code===code) closedRoom(code);
        }
      }).catch(()=>{if(offlineCode===code)offlineCode='';});
    }

    async function api(action, data, code = room?.code) {
      if(disposed||document.hidden)throw new Error('Игра приостановлена');
      const path = action === 'create' ? 'create' : `${code}/${action}`;
      const roundData = ['draft','check','stop'].includes(action) ? {roundId:room?.roundId??null} : {};
      const response = await window.AppAccess.azbukaRequest(path, presencePayload({...data,...roundData}));
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (response.status===404&&code&&!disposed&&(room?.code===code||saved().code===code)) closedRoom(code);
        throw Object.assign(new Error(result.error || 'Сервер не ответил. Проверьте соединение.'), { status: response.status });
      }
      return result;
    }

    function welcome() {
      window.AppPresenceContext?.clearRoom?.(GAME);
      room = null;
      view = '';
      round = -1;
      roundId = null;
      lastMsg = '';
      lastPlayers = '';
      $('hero-info').textContent = 'Onlinespiel';
      show(['welcome']);
    }

    function enter(result) {
      if (disposed) {leaveMembership(result.code);return;}
      offlineCode='';
      pollPaused = false;
      pollAfter = 0;
      errors = 0;
      remember(result.code);
      window.AppPresenceContext?.setRoom?.(GAME,result.code);
      paint(result);
      if (document.hidden) notifyOffline(result.code);
    }

    async function enterRoom(action, target) {
      if (actionBusy || disposed) return;
      const name = $('nickname').value.trim();
      if (name.length < 2) {
        toast('Введите имя от двух символов.');
        $('nickname').focus();
        return;
      }
      actionBusy = true;
      setBusy('create', true);
      setBusy('join', true);
      try {
        const settings = action === 'create' ? {
          mode: root.querySelector('input[name="mode"]:checked').value,
          duration: Number($('duration').value),
          rounds: Number($('rounds').value),
        } : {};
        enter(await api(action, { name, ...settings }, target));
      } catch (error) {
        toast(error.message);
        if ([401,403,404,409].includes(error.status) && target && target === saved().code) remember('');
      } finally {
        actionBusy = false;
        setBusy('create', false);
        setBusy('join', false);
      }
    }

    function joinRoom(value) {
      const target = roomCode(value);
      if (!target) return toast('Введите шестизначный код комнаты.');
      return enterRoom('join', target);
    }

    async function updateRoom(action, data, button) {
      if (actionBusy || disposed || !room) return;
      actionBusy = true;
      if (button) setBusy(button, true);
      try {
        const result = await api(action, data);
        if (disposed) return;
        paint(result);
        if (action === 'settings') toast('Настройки сохранены');
      } catch (error) { toast(error.message); }
      finally {
        actionBusy = false;
        if (button && (button !== 'start' || room?.players.length >= 2)) setBusy(button, false);
      }
    }

    async function copyCode() {
      const code = room?.code;
      if (!code) return;
      try {
        await navigator.clipboard.writeText(code);
        toast('Code kopiert');
      } catch {
        const field = document.createElement('textarea');
        field.value = code;
        field.style.cssText = 'position:fixed;opacity:0';
        root.append(field);
        field.select();
        try { toast(document.execCommand('copy') ? 'Code kopiert' : code); }
        catch { toast(code); }
        finally { field.remove(); }
      }
    }

    $('home').onclick = () => window.goToMainMenu();
    $('rules').onclick = () => $('rules-dialog').showModal();
    $('close-rules').onclick = () => $('rules-dialog').close();
    $('rules-dialog').addEventListener('close', () => {
      try { localStorage.setItem(RULES_SEEN, '1'); } catch { /* Private browsing */ }
    });
    for (const radio of root.querySelectorAll('input[name="mode"]')) {
      radio.onchange = () => { $('duration-wrap').hidden = radio.value !== 'timed'; };
    }
    $('lobby-mode').onchange = () => { $('lobby-duration-wrap').hidden = $('lobby-mode').value !== 'timed'; };
    $('create').onclick = () => enterRoom('create');
    $('join-form').onsubmit = event => { event.preventDefault(); void joinRoom($('join-code').value); };
    $('copy-code').onclick = copyCode;
    $('share-room').onclick = () => {
      if (room) void window.RoomInvite.openQr(GAME, room.code, 'Bibelalphabet');
    };
    $('leave-room').onclick = () => window.goToMainMenu();
    $('save-settings').onclick = () => updateRoom('settings', {
      mode: $('lobby-mode').value, duration: Number($('lobby-duration').value), rounds: Number($('lobby-rounds').value),
    }, 'save-settings');
    $('start').onclick = () => updateRoom('start', {}, 'start');
    $('next-round').onclick = () => updateRoom('start', {}, 'next-round');
    $('chat-form').onsubmit = async event => {
      event.preventDefault();
      const input = $('chat-input');
      const text = input.value.trim();
      if (!text || actionBusy || !room) return;
      input.disabled = true;
      actionBusy = true;
      try {
        const result = await api('chat', { text });
        if (disposed) return;
        input.value = '';
        paint(result);
      } catch (error) { toast(error.message); }
      finally {
        actionBusy = false;
        input.disabled = false;
        if (!disposed) input.focus();
      }
    };

    function playerCards(r){
     $('player-count').textContent='('+r.players.length+'/16)';
     const markup=r.players.map(p=>'<div class="player"><div class="avatar">'+esc(p.name.slice(0,1).toUpperCase())+'</div><div style="min-width:0"><strong>'+esc(p.name)+(p.id===r.hostId?' 👑':'')+'</strong><small>'+p.score+' Punkte</small></div><span class="dot '+(p.online?'on':'')+'" title="'+(p.online?'Online':'Keine Verbindung')+'"></span></div>').join('');
     if(markup!==lastPlayers){$('players').innerHTML=markup;lastPlayers=markup;}
    }
    function renderChat(r){
     const messages=r.messages||[],last=messages.at(-1)?.id||'';
     if(last!==lastMsg){const log=$('chat-log'),atBottom=log.scrollTop+log.clientHeight>=log.scrollHeight-45;
     log.innerHTML=messages.map(m=>'<div class="message '+(m.system?'system':m.from===r.selfId?'mine':'')+'"><div class="by">'+esc(m.system?'Система':m.name)+'</div><p>'+esc(m.text)+'</p></div>').join('');
     if(atBottom||lastMsg==='')log.scrollTop=log.scrollHeight;lastMsg=last;}
     $('chat-counter').textContent='('+messages.length+')';
    }
    function readAnswers(){return cats.map((_,i)=>[...root.querySelectorAll('[data-cat="'+i+'"] input')].map(el=>el.value.trim()).filter(Boolean).slice(0,3))}
    function ensureInputs(i,count){
     const node=$('entry-'+i);
     for(let j=node.children.length;j<count;j++){
      const line=document.createElement('div');line.className='answer-line';
      const index=document.createElement('small');index.textContent=String(j+1);
      const input=document.createElement('input');input.maxLength=80;input.placeholder=j?'Запасной вариант':'Слово на букву '+room.letter;
      input.autocomplete='off';input.spellcheck=false;input.setAttribute('aria-label',cats[i]+' — вариант '+(j+1));
      input.addEventListener('input',changed);line.append(index,input);node.append(line);
     }
     $('add-'+i).hidden=node.children.length>=3;
    }
    function buildForm(r){
     $('categories').replaceChildren();
     cats.forEach((cat,i)=>{
      const item=document.createElement('div');item.className='cat';item.dataset.cat=i;
      item.innerHTML='<div class="cat-head"><span class="cat-emoji">'+emoji[i]+'</span><b>'+cat+'</b><small>до 3 слов</small></div><div class="answers-input" id="entry-'+i+'"></div><button type="button" class="add-answer" id="add-'+i+'">＋ Ещё вариант</button><div class="review" id="review-'+i+'" aria-live="polite"></div>';
      $('categories').append(item);
      const words=r.ownDraft[i]||[];ensureInputs(i,Math.max(1,words.length));
      [...$('entry-'+i).querySelectorAll('input')].forEach((input,j)=>input.value=words[j]||'');
      $('add-'+i).onclick=()=>{ensureInputs(i,$('entry-'+i).children.length+1);$('entry-'+i).lastElementChild.querySelector('input').focus()};
     });
     verified=false;$('stop').disabled=true;$('check').disabled=false;$('save-label').textContent='Черновик сохранён';$('game-notice').textContent='Ответы сохраняются автоматически. Соперники увидят их только по окончании раунда.';
    }
    function sameRound(previous){
     return room?.code===previous.code&&room.phase==='playing'&&room.round===previous.round&&room.roundId===previous.roundId;
    }
    function changed(){verified=false;$('stop').disabled=true;cats.forEach((_,i)=>{$('review-'+i).replaceChildren()});
     $('save-label').textContent='Сохраняем…';clearTimeout(saveTimer);
     const current=room;
     saveTimer=setTimeout(async()=>{
      if(disposed||document.hidden||!sameRound(current))return;
      try{
       await api('draft',{answers:readAnswers()});
       if(!disposed&&sameRound(current))$('save-label').textContent='Черновик сохранён';
      }catch(e){if(!disposed&&sameRound(current)){$('save-label').textContent='Keine Verbindung';toast(e.message)}}
     },550);
    }
    async function check(){
     if(disposed||!room||room.phase!=='playing')return;
     clearTimeout(saveTimer);$('check').disabled=true;
     const submitted=readAnswers();
     try{
      const current=room;
      await api('draft',{answers:submitted});
      if(!sameRound(current)||disposed)return;
      const r=await api('check',{answers:submitted});
      if(!sameRound(current)||disposed)return;
      if(JSON.stringify(readAnswers())!==JSON.stringify(submitted))return toast('Ответы изменились — проверь ещё раз');
      cats.forEach((_,i)=>{
       const node=$('review-'+i),list=r.rows[i];
       ensureInputs(i,Math.max(1,list.length));
       [...$('entry-'+i).querySelectorAll('input')].forEach((input,j)=>input.value=list[j]?.word||'');
       node.replaceChildren();
       if(!list.length){node.className='review bad';node.textContent='Нет ответа';return;}
       list.forEach((answer,j)=>{
        const p=document.createElement('div');p.className=answer.valid?'review ok':'review bad';
        p.textContent=(answer.valid?'✓ ':'✕ ')+answer.word+' — '+(answer.valid?'подтверждено по Библии'+(answer.reference?' ('+answer.reference+')':''):answer.reason);
        if(!answer.valid&&answer.suggestions?.length)answer.suggestions.forEach(s=>{
         const b=document.createElement('button');b.type='button';b.textContent='Исправить: '+s;b.onclick=()=>{
          const input=[...$('entry-'+i).querySelectorAll('input')].filter(field=>field.value.trim())[j];if(input){input.value=s;changed();input.focus()}
         };p.append(b);
        });
        node.append(p);
       });
      });
      verified=r.complete;
      $('stop').disabled=!r.complete;
      const missing=cats.filter((_,i)=>!r.rows[i].some(answer=>answer.valid));
      $('game-notice').textContent=r.complete?'Все категории проверены. '+(room.mode==='stop'?'Можешь нажать СТОП!':'Ответы сохраняются до сигнала таймера.'):'Gib mindestens eine richtige Antwort in jeder Kategorie ein: '+missing.join(', ')+'.';
      toast(r.complete?'Проверка пройдена!':'Есть ошибки — смотри подсказки');
     }catch(e){toast(e.message)}finally{$('check').disabled=false}
    }
    $('check').onclick=check;
    $('stop').onclick=async()=>{if(!verified||!room||room.mode!=='stop')return;clearTimeout(saveTimer);
     await updateRoom('stop',{answers:readAnswers()},'stop');
     if(!disposed)$('stop').disabled=!verified};
    function resultTable(r){
     const res=r.results;if(!res)return;
     $('result-kicker').textContent=r.finished?'Partie beendet':'Итоги раунда '+(r.round+1);
     $('result-title').textContent=r.finished?'🏆 Gewinner — '+res.players[0]?.name:'Результаты раунда';
     $('result-reason').textContent=res.reason==='stop'?'СТОП нажал '+(res.stopper||'Spieler')+'. Все ответы закрыты.':'Время вышло. Все ответы закрыты.';
     $('result-rows').innerHTML=res.players.map((p,i)=>'<tr><td>'+(i===0?'🥇 ':'')+esc(p.name)+'</td><td class="points">+'+p.added+'</td><td><b>'+p.total+'</b></td></tr>').join('');
     $('result-details').innerHTML=res.players.map(p=>'<details class="details"><summary>'+esc(p.name)+' — показать ответы</summary><table><tbody>'+p.answers.map(x=>'<tr><td>'+esc(x.category)+'</td><td><b>'+esc(x.word)+'</b>'+(x.reference?'<br><small>'+esc(x.reference)+'</small>':'')+(x.all?.length?'<br><small>'+x.all.map(a=>esc(a.word)+(a.valid?' ✓':' — '+esc(a.reason))).join('<br>')+'</small>':'')+'</td><td class="best">+'+x.points+'</td></tr>').join('')+'</tbody></table></details>').join('');
     $('next-round').hidden=r.selfId!==r.hostId;
     $('next-round').textContent=r.finished?'↻ Neue Partie':'▶ Следующий раунд';
     $('wait-next').hidden=r.selfId===r.hostId;
    }

    function paint(result) {
      if (disposed) return;
      room = result;
      const host = result.selfId === result.hostId;
      const ids = ['players-pane', 'chat-pane', 'leave-row'];
      playerCards(result);
      renderChat(result);
      $('start-wrap').hidden = result.phase !== 'lobby' || !host;
      $('players-help').hidden = result.phase !== 'lobby';

      if (result.phase === 'lobby') {
        ids.unshift('lobby');
        if (host) ids.push('settings-pane');
        $('room-code').textContent = result.code;
        if (view !== 'lobby') {
          $('lobby-mode').value = result.mode;
          $('lobby-duration').value = String(result.duration);
          $('lobby-rounds').value = String(result.rounds||5);
          $('lobby-mode').onchange();
        }
        $('start').disabled = result.players.length < 2;
        $('players-help').textContent = host
          ? (result.players.length < 2 ? 'Для начала нужны два игрока.' : 'Можно начинать партию.')
          : 'Ведущий запустит партию.';
        $('hero-info').textContent = 'Raum ' + result.code;
      } else if (result.phase === 'playing') {
        ids.push('playing');
        if (view !== 'playing' || round !== result.round || roundId !== result.roundId) {
          clearTimeout(saveTimer);
          buildForm(result);
          round = result.round;
          roundId = result.roundId;
          window.scrollTo({ top: 0, behavior: 'auto' });
        }
        $('letter').textContent = result.letter;
        $('letter-caption').textContent = result.letter;
        $('round-label').textContent = `Runde ${result.round + 1} von ${result.rounds}`;
        $('stop').hidden = result.mode !== 'stop';
        $('hero-info').textContent = result.mode === 'stop' ? 'Первый СТОП' : 'Auf Zeit';
        if (result.mode === 'timed') timeoutAt = result.deadline;
        else $('time-label').textContent = 'Первый СТОП';
        clock();
      } else {
        ids.push('results');
        $('hero-info').textContent = result.finished ? 'Partie beendet' : 'Итоги раунда';
        $('next-round').hidden = !host;
        $('wait-next').hidden = host;
        if (view !== result.phase || round !== result.round || roundId !== result.roundId) {
          resultTable(result);
          round = result.round;
          roundId = result.roundId;
        }
      }
      view = result.phase;
      show(ids);
    }

    function clock() {
      if (room?.phase !== 'playing' || room.mode !== 'timed') return;
      const left = Math.max(0, Math.ceil((timeoutAt - Date.now()) / 1000));
      const label = $('time-label');
      label.textContent = left > 0 ? `Übrig ${left} Sek.` : 'Время истекло';
      label.classList.toggle('urgent', left <= 10);
      if (!left) {
        $('game-notice').textContent = 'Ждём итогов с сервера…';
        for (const input of $('categories').querySelectorAll('input')) input.disabled = true;
        $('check').disabled = true;
      }
    }

    async function poll() {
      if (!room || disposed || document.hidden || pollPaused || pollBusy || actionBusy || Date.now() < pollAfter) return;
      const current = room;
      pollBusy = true;
      try {
        const result = await api('state');
        if (!disposed && !actionBusy && room === current) paint(result);
        errors = 0;
        pollAfter = 0;
      } catch (error) {
        if (disposed || actionBusy || room !== current) return;
        if ([401, 403, 404].includes(error.status)) {
          pollPaused = true;
          welcome();
          remember('');
          toast(error.message);
        } else {
          if (!errors) toast('Связь с комнатой прервалась. Переподключаемся…');
          errors++;
          pollAfter = Date.now() + Math.min(20_000, errors * 3000);
        }
      } finally { pollBusy = false; }
    }

    let scanStream=null,scanFrame=0,scanReading=false;
    const scanDialog=$('scan-dialog'),scanVideo=$('scan-video'),scanStatus=$('scan-status');
    function acceptQR(raw) {
      const invite = window.RoomInvite.parseInvite(raw);
      const code = roomCode(invite ? (invite.game === GAME ? invite.room : '') : raw);
      if (!code) {
        scanStatus.textContent = 'Этот QR-код не содержит приглашение в «Библейскую азбуку».';
        return false;
      }
      closeScan();
      $('join-code').value = code;
      void joinRoom(code);
      return true;
    }
    let imageCanvas;
    function cameraCanvas(){
      if(!imageCanvas)imageCanvas=document.createElement('canvas');
      return imageCanvas;
    }
    async function decodeImage(image){
      const canvas=cameraCanvas(),w=image.videoWidth||image.naturalWidth||image.width,h=image.videoHeight||image.naturalHeight||image.height;
      if(!w||!h)return '';
      const scale=Math.min(1,720/Math.max(w,h));
      canvas.width=Math.max(1,Math.round(w*scale));canvas.height=Math.max(1,Math.round(h*scale));
      const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(image,0,0,canvas.width,canvas.height);
      if('BarcodeDetector' in window){
        try{
          const decoder=new BarcodeDetector({formats:['qr_code']});
          const codes=await decoder.detect(canvas);
          if(codes.length)return codes[0].rawValue||'';
        }catch{}
      }
      const fn=await qrDecodeLibrary();
      const pixels=ctx.getImageData(0,0,canvas.width,canvas.height);
      return fn(pixels.data,pixels.width,pixels.height,{inversionAttempts:'attemptBoth'})?.data||'';
    }
    async function cameraLoop(){
      if(!scanDialog.open||!scanStream)return;
      if(scanReading)return;
      scanReading=true;
      try{
        const found=await decodeImage(scanVideo);
        if(found&&scanDialog.open&&!disposed&&acceptQR(found))return;
      }catch(e){scanStatus.textContent=e.message||'Не удалось прочитать QR-Code';}
      finally{scanReading=false}
      if(scanDialog.open&&scanStream)scanFrame=setTimeout(cameraLoop,170);
    }
    function closeScan(){
      if(scanDialog.open)scanDialog.close();
      clearTimeout(scanFrame);
      if(scanStream){scanStream.getTracks().forEach(track=>track.stop());scanStream=null}
      scanVideo.srcObject=null;
    }
    scanDialog.addEventListener('close',closeScan);
    $('scan-close').onclick=closeScan;
    async function openCameraScanner(){
      if(disposed||scanDialog.open)return;
      scanStatus.textContent='Подготавливаем камеру…';scanDialog.showModal();
      try{
        if(!navigator.mediaDevices?.getUserMedia)throw Error('Доступ к камере отсутствует. Выбери изображение QR-кода.');
        scanStream=await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:{ideal:'environment'}}});
        if(disposed||!scanDialog.open){closeScan();return}
        scanVideo.srcObject=scanStream;await scanVideo.play();
        scanStatus.textContent='Поместите QR-код в рамку камеры.';
        void cameraLoop();
      }catch(e){scanStatus.textContent='Не удалось открыть камеру. Разрешите доступ или выберите изображение ниже.';}
    }
    $('scan-qr').onclick=()=>{
      if(window.RoomQrScanner?.isAvailable()) window.RoomQrScanner.open();
      else void openCameraScanner();
    };
    $('scan-file').addEventListener('change',async event=>{
      const file=event.target.files?.[0];if(!file)return;
      try{
        const bitmap=await createImageBitmap(file);
        let value;
        try { value=await decodeImage(bitmap); } finally { bitmap.close?.(); }
        if(disposed||!scanDialog.open)return;
        if(!value)scanStatus.textContent='QR-код на изображении не найден.';
        else acceptQR(value);
      }catch(e){scanStatus.textContent='Не удалось распознать изображение QR-кода.'}
      finally{event.target.value=''}
    });

    function visibilityChanged() {
      if (document.hidden) {
        closeScan();
        clearTimeout(saveTimer);
        notifyOffline();
      } else {
        offlineCode='';
        pollAfter=0;
        void poll();
      }
    }

    function pageHidden() {closeScan();notifyOffline();}

    function acceptRoomInvite(event) {
      if (event.detail?.game !== GAME) return;
      const invite = window.RoomInvite.consume(GAME);
      const code = roomCode(invite?.room);
      if (!code) return;
      $('join-code').value = code;
      void joinRoom(code);
    }

    const session = saved();
    const telegram = window.TelegramLaunchContext?.getUser?.() || window.Telegram?.WebApp?.initDataUnsafe?.user;
    $('nickname').value = session.nick || telegram?.first_name || 'Spieler';
    welcome();

    const invite = window.RoomInvite.consume(GAME);
    const directCode = new URLSearchParams(location.search).get('room');
    const incoming = roomCode(invite?.room || directCode || session.code);
    if (incoming) {
      if (roomCode(directCode)) {
        const url = new URL(location.href);
        url.searchParams.delete('room');
        history.replaceState(history.state, '', url.href);
      }
      $('join-code').value = incoming;
      void joinRoom(incoming);
    }

    try {
      if (localStorage.getItem(RULES_SEEN) !== '1') $('rules-dialog').showModal();
    } catch { /* The rules button remains available. */ }

    const pollTimer = setInterval(poll, 2400);
    const clockTimer = setInterval(clock, 250);
    document.addEventListener('visibilitychange', visibilityChanged);
    window.addEventListener('pagehide', pageHidden);
    window.addEventListener('roominvitechange', acceptRoomInvite);
    return () => {
      disposed = true;
      const code = room?.code || saved().code;
      remember('');
      leaveMembership(code);
      window.AppPresenceContext?.clearRoom?.(GAME);
      closeScan();
      window.RoomQrScanner?.close();
      window.RoomInvite?.closeQr();
      clearInterval(pollTimer);
      clearInterval(clockTimer);
      clearTimeout(saveTimer);
      clearTimeout(toastTimer);
      document.removeEventListener('visibilitychange', visibilityChanged);
      window.removeEventListener('pagehide', pageHidden);
      window.removeEventListener('roominvitechange', acceptRoomInvite);
    };
  }

  window.startBibleAzbukaGame = start;
  window.BibleAzbuka = Object.freeze({ cleanup });
})();
