(() => {
  'use strict';

  if (window.__bmtV22GamePolishInstalled) return;
  window.__bmtV22GamePolishInstalled = true;

  const VERSION = '22';
  const STYLE_ID = 'v22-visual-polish-style';
  const TUTORIAL_PREFIX = 'bmt_v22_tutorial_seen';
  const ASSETS = {
    bible: `web/assets/biblical-match-three/icons-v17/bible.webp?v=${VERSION}`,
    jericho: `web/assets/biblical-match-three/icons-v17/jericho.webp?v=${VERSION}`,
    chains: `web/assets/biblical-match-three/icons-v17/chains.webp?v=${VERSION}`,
    tablets: `web/assets/biblical-match-three/icons-v17/tablets.webp?v=${VERSION}`,
    candle: `web/assets/biblical-match-three/icons-v17/candle.webp?v=${VERSION}`,
    ark: `web/assets/biblical-match-three/icons-v17/ark.webp?v=${VERSION}`,
  };

  let tutorialActive = false;
  let tutorialTimer = 0;
  let lastShell = null;
  const hud = { shell: null, levelId: 0, levelTitle: '', startMoves: null, currentMoves: null, score: 0, maxCascade: 1 };

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const link = document.createElement('link');
    link.id = STYLE_ID;
    link.rel = 'stylesheet';
    link.href = `web/styles/v22-visual-polish.css?v=${VERSION}`;
    document.head.appendChild(link);
  }

  function currentUserId() {
    return String(window.Telegram?.WebApp?.initDataUnsafe?.user?.id || window.__ANDROID_TELEGRAM_ID__ || 'guest');
  }

  function tutorialKey() { return `${TUTORIAL_PREFIX}_${currentUserId()}`; }
  function parseNumber(text) {
    const value = Number(String(text || '').replace(/[^0-9-]/g, ''));
    return Number.isFinite(value) ? value : 0;
  }

  function captureHud(shell) {
    if (!shell || !shell.classList.contains('bmt-board-screen')) return;
    if (hud.shell !== shell) {
      hud.shell = shell; hud.startMoves = null; hud.currentMoves = null; hud.score = 0; hud.maxCascade = 1;
      const kicker = shell.querySelector('.bmt-kicker')?.textContent || '';
      const match = kicker.match(/(?:Level)\s+(\d+)/i);
      hud.levelId = match ? Number(match[1]) : 0;
      hud.levelTitle = shell.querySelector('.bmt-title')?.textContent?.trim() || '';
    }
    const movesNode = shell.querySelector('#bmt-moves');
    const scoreNode = shell.querySelector('#bmt-score');
    const cascadeNode = shell.querySelector('#bmt-cascade');
    if (movesNode && movesNode.textContent?.trim() !== '∞') {
      const moves = parseNumber(movesNode.textContent);
      hud.currentMoves = moves;
      if (hud.startMoves == null || moves > hud.startMoves) hud.startMoves = moves;
    }
    if (scoreNode) hud.score = Math.max(hud.score, parseNumber(scoreNode.textContent));
    if (cascadeNode) hud.maxCascade = Math.max(hud.maxCascade, parseNumber(cascadeNode.textContent) || 1);
  }

  function patchBoosterLabels(root) {
    root.querySelectorAll('.bmt-booster-tray__label').forEach((label) => {
      const main = label.querySelector('span');
      const small = label.querySelector('small');
      if (main && main.textContent !== 'Verstärker') main.textContent = 'Verstärker';
      if (small && small.textContent !== 'für Sterne') small.textContent = 'für Sterne';
    });
    root.querySelectorAll('.bmt-prelevel__boost-title > span:first-child').forEach((node) => {
      if (node.textContent !== 'Verstärker vor Spielbeginn') node.textContent = 'Verstärker vor Spielbeginn';
    });
  }

  function patchBoard(shell) {
    const board = shell?.querySelector('.bmt-board');
    if (!board) return;
    board.classList.add('bmt-v22-board');
    const wrap = board.closest('.bmt-board-wrap');
    wrap?.classList.add('bmt-v22-board-wrap');
    const shape = board.dataset.shape || 'rect';
    if (wrap?.getAttribute('data-board-shape') !== shape) wrap?.setAttribute('data-board-shape', shape);
  }

  function repeatCurrentLevel(mapButton) {
    const id = hud.levelId;
    if (!id || !mapButton) return;
    mapButton.click();
    let attempts = 0;
    const timer = window.setInterval(() => {
      attempts += 1;
      const medallion = [...document.querySelectorAll('.bmt-map-node__medallion')].find((node) => parseNumber(node.textContent) === id);
      const levelButton = medallion?.closest('button');
      if (levelButton && !levelButton.disabled) {
        window.clearInterval(timer);
        levelButton.click();
        window.setTimeout(() => {
          const start = [...document.querySelectorAll('.bmt-prelevel button')].find((button) => /(?:start|begin|empezar)/i.test(button.textContent || ''));
          start?.click();
        }, 180);
      } else if (attempts > 30) window.clearInterval(timer);
    }, 80);
  }

  function enhanceWinResult(card) {
    if (!card || card.dataset.v22Result === '1' || !card.classList.contains('is-win')) return;
    card.dataset.v22Result = '1';
    const oldTitle = card.querySelector('h3')?.textContent?.trim() || hud.levelTitle;
    const rating = card.querySelectorAll('.bmt-result-stars .is-on').length || 1;
    const scoreText = card.querySelector('.bmt-result-score')?.textContent?.trim() || `${hud.score.toLocaleString("de")} Punkte`;
    const rewardText = card.querySelector('.bmt-result-reward strong')?.textContent?.trim() || '+0 ★';
    const actions = card.querySelector('.bmt-result-actions');
    const oldButtons = actions ? [...actions.querySelectorAll('button')] : [];
    const menuButton = oldButtons.find((button) => /(?:zur karte)|(?:im Menü)/i.test(button.textContent || '')) || oldButtons[0];
    const nextButton = oldButtons.find((button) => /(?:weiter)|(?:next|nächst|siguiente)/i.test(button.textContent || '')) || oldButtons[1];
    const usedMoves = hud.startMoves == null || hud.currentMoves == null ? '—' : String(Math.max(0, hud.startMoves - hud.currentMoves));

    card.innerHTML = `
      <div class="bmt-v22-win-hero" aria-hidden="true">
        <img class="bmt-v22-win-horn bmt-v22-win-horn--left" src="${ASSETS.jericho}" alt="">
        <span class="bmt-v22-win-glow"></span>
        <img class="bmt-v22-win-bible" src="${ASSETS.bible}" alt="">
        <img class="bmt-v22-win-horn bmt-v22-win-horn--right" src="${ASSETS.jericho}" alt="">
      </div>
      <span class="bmt-result-card__eyebrow">${oldTitle ? `Level ${hud.levelId || ''} · ${oldTitle}` : 'Pfad des Lichts'}</span>\n      <h3>Level geschafft!</h3>\n      <div class="bmt-result-stars bmt-v22-result-stars" aria-label="${rating} von 3">${[1,2,3].map((n)=>`<span class="${n<=rating?'is-on':''}">★</span>`).join('')}</div>\n      <div class="bmt-v22-result-stats">\n        <div><span>Punkte</span><strong>${scoreText.replace(/\s*(?:Punkte)$/i, '')}</strong></div>\n        <div><span>Züge</span><strong>${usedMoves}</strong></div>\n        <div><span>Kaskade</span><strong>×${Math.max(1, hud.maxCascade)}</strong></div>\n      </div>\n      <div class="bmt-v22-reward-title">Belohnungen</div>\n      <div class="bmt-v22-rewards">\n        <div><span class="bmt-v22-reward-star">★</span><strong>${rewardText}</strong></div>
        <div><img src="${ASSETS.bible}" alt=""><strong>Fortschritt +1</strong></div>\n      </div>\n      <div class="bmt-result-actions bmt-v22-result-actions"></div>\n      <div class="bmt-v22-result-secondary"></div>`;

    const primary = card.querySelector('.bmt-v22-result-actions');
    const secondary = card.querySelector('.bmt-v22-result-secondary');
    if (nextButton) {
      nextButton.textContent = 'Nächstes Level';
      nextButton.className = 'bmt-primary bmt-v22-next';
      primary.appendChild(nextButton);
    }
    const repeat = document.createElement('button');
    repeat.type = 'button'; repeat.className = 'bmt-secondary bmt-v22-repeat';
    repeat.innerHTML = '<span aria-hidden="true">↻</span><strong>Erneut versuchen</strong>';
    repeat.addEventListener('click', () => repeatCurrentLevel(menuButton));
    secondary.appendChild(repeat);
    if (menuButton) {
      menuButton.className = 'bmt-secondary bmt-v22-menu';
      menuButton.innerHTML = '<span aria-hidden="true">⌂</span><strong>Zum Menü</strong>';
      secondary.appendChild(menuButton);
    }
  }

  function blockerDemoHtml() {
    return `<div class="bmt-v22-tutorial-obstacles" aria-hidden="true">
      <span><img src="${ASSETS.chains}" alt=""><small>Kette</small></span>\n      <span><img src="${ASSETS.tablets}" alt=""><small>Gesetzestafel</small></span>\n      <span><img src="${ASSETS.candle}" alt=""><small>Öllampe</small></span>\n      <span><i class="bmt-v22-tutorial-vine" aria-hidden="true">✤</i><small>Dornen</small></span>\n    </div>`;
  }

  function relicDemoHtml() {
    return `<div class="bmt-v22-tutorial-obstacles" aria-hidden="true">
      <span><img src="${ASSETS.ark}" alt=""><small>Arche</small></span>\n      <span><i class="bmt-v22-tutorial-gate" aria-hidden="true">▁</i><small>Tor</small></span>\n    </div>`;
  }

  function startTutorial(shell) {
    if (tutorialActive || !shell?.isConnected || localStorage.getItem(tutorialKey()) === '1') return;
    const board = shell.querySelector('.bmt-board');
    if (!board) return;
    shell.querySelector('.bmt-v18-tutorial [data-skip]')?.click();
    tutorialActive = true;

    const overlay = document.createElement('div');
    overlay.className = 'bmt-v22-tutorial';
    overlay.innerHTML = `<div class="bmt-v22-tutorial-card" role="dialog" aria-modal="true" aria-label="Einführung">\n      <div class="bmt-v22-tutorial-progress"></div><small class="bmt-v22-tutorial-step"></small><h3></h3><p></p>\n      <div class="bmt-v22-tutorial-visual"></div>\n      <div class="bmt-v22-tutorial-actions"><button type="button" class="bmt-v22-tutorial-skip">Überspringen</button><div><button type="button" class="bmt-v22-tutorial-back">Zurück</button><button type="button" class="bmt-v22-tutorial-next">Weiter</button></div></div>\n    </div>`;
    shell.appendChild(overlay);

    const steps = [
      {title:'Wische einen Stein',text:'Wische einen Stein zum Nachbarn. Eine Reihe aus mindestens 3 gleichen Symbolen verschwindet; neue Steine fallen von oben.',selector:'.bmt-board',label:'Wische benachbarte Steine',kind:'swipe'},
      {title:'Achte auf die Ziele',text:'Sieh vor jedem Zug hierher: Ziele verlangen Punkte, Symbole oder entfernte Hindernisse. Erfülle alle Ziele zum Sieg.',selector:'.bmt-goals-v2',label:'Ziele des aktuellen Levels',kind:'goals'},
      {title:'Das Feld hat Grenzen',text:'Spiele nur innerhalb der leuchtenden Umrandung. Spätere Felder sind oval, rautenförmig, kreuzförmig, halbkreisförmig oder schildförmig. Leere Bereiche außen sind nicht bespielbar.',selector:'.bmt-board',label:'Spielfeldgrenze',kind:'boundary'},
      {title:'Zerstöre Hindernisse',text:'Ketten, Tafeln, Lampen und Dornen erschweren das Feld. Tafeln erleiden Schaden beim Leeren ihrer Zelle, Ketten durch passende Treffer; Lampen müssen leuchten. Dornen brauchen direkte Treffer und breiten sich sonst aus. Die Zahl zeigt übrige Schichten.',selector:'.bmt-board',label:'Hindernisse auf Steinen',kind:'blockers',visual:blockerDemoHtml()},
      {title:'Senke die Bundeslade ab',text:'Die Bundeslade kann nicht bewegt werden. Entferne Steine darunter, bis sie die markierte unterste Reihe erreicht.',selector:'.bmt-board',label:'Die Bundeslade sinkt',kind:'blockers',visual:relicDemoHtml()},
      {title:'Nutze Verstärker',text:'Schleuder, Stab, Posaunen und Arche helfen bei Schwierigkeiten. Sie kosten Sterne, aber keinen Zug.',selector:'.bmt-booster-tray',label:'Verstärker',kind:'boosters'},
    ];

    let index = 0, focus = null, label = null, demo = null;
    const card = overlay.querySelector('.bmt-v22-tutorial-card');
    const stepNode = card.querySelector('.bmt-v22-tutorial-step');
    const titleNode = card.querySelector('h3');
    const textNode = card.querySelector('p');
    const visualNode = card.querySelector('.bmt-v22-tutorial-visual');
    const progress = card.querySelector('.bmt-v22-tutorial-progress');
    const back = card.querySelector('.bmt-v22-tutorial-back');
    const next = card.querySelector('.bmt-v22-tutorial-next');

    function cleanupFocus() {
      focus?.classList.remove('is-v22-tutorial-focus','is-v22-boundary-demo');
      shell.querySelectorAll('.bmt-tile.is-v22-demo-tile').forEach((tile)=>tile.classList.remove('is-v22-demo-tile'));
      label?.remove(); demo?.remove(); focus = label = demo = null;
    }

    function positionLabel(target, text) {
      const rect = target.getBoundingClientRect(), shellRect = shell.getBoundingClientRect();
      label = document.createElement('div'); label.className = 'bmt-v22-focus-label'; label.textContent = text;
      label.style.left = `${Math.max(10, Math.min(shellRect.width - 190, rect.left - shellRect.left + rect.width / 2 - 90))}px`;
      const preferTop = rect.top - shellRect.top > 130;
      label.style.top = `${preferTop ? Math.max(8, rect.top - shellRect.top - 44) : Math.min(shellRect.height - 54, rect.bottom - shellRect.top + 10)}px`;
      shell.appendChild(label);
    }

    function addSwipeDemo() {
      const tiles = [...board.querySelectorAll('.bmt-tile:not(.is-hole):not(:disabled)')];
      let a = null, b = null;
      for (let i=0;i<tiles.length-1;i+=1) {
        const ia=Number(tiles[i].dataset.index), ib=Number(tiles[i+1].dataset.index);
        if (Math.floor(ia/8)===Math.floor(ib/8) && ib===ia+1) { a=tiles[i]; b=tiles[i+1]; break; }
      }
      if (!a || !b) return;
      a.classList.add('is-v22-demo-tile'); b.classList.add('is-v22-demo-tile');
      const ar=a.getBoundingClientRect(), br=b.getBoundingClientRect(), sr=shell.getBoundingClientRect();
      demo=document.createElement('div'); demo.className='bmt-v22-swipe-demo';
      demo.style.left=`${ar.left-sr.left+ar.width/2}px`; demo.style.top=`${ar.top-sr.top+ar.height/2}px`;
      demo.style.setProperty('--bmt-v22-swipe-x',`${br.left-ar.left}px`);
      demo.innerHTML='<span class="bmt-v22-swipe-hand">☝</span><span class="bmt-v22-swipe-arrow">→</span>';
      shell.appendChild(demo);
    }

    function render() {
      cleanupFocus(); const step=steps[index]; overlay.dataset.kind=step.kind;
      stepNode.textContent=`Schritt ${index+1} von ${steps.length}`; titleNode.textContent=step.title; textNode.textContent=step.text;
      visualNode.innerHTML=step.visual||''; progress.innerHTML=steps.map((_,i)=>`<span class="${i<=index?'is-on':''}"></span>`).join('');
      back.disabled=index===0; next.textContent=index===steps.length-1?'Verstanden':'Weiter';
      focus=shell.querySelector(step.selector)||board; focus.classList.add('is-v22-tutorial-focus');
      if(step.kind==='boundary')focus.classList.add('is-v22-boundary-demo');
      positionLabel(focus,step.label); if(step.kind==='swipe')addSwipeDemo();
      requestAnimationFrame(()=>focus?.scrollIntoView?.({block:'center',inline:'nearest'}));
    }

    function finish() { cleanupFocus(); localStorage.setItem(tutorialKey(),'1'); tutorialActive=false; overlay.remove(); }
    card.querySelector('.bmt-v22-tutorial-skip').addEventListener('click',finish);
    back.addEventListener('click',()=>{if(index>0){index-=1;render();}});
    next.addEventListener('click',()=>{if(index>=steps.length-1)finish();else{index+=1;render();}});
    render();
  }

  function scheduleTutorial(shell) {
    if (!shell || localStorage.getItem(tutorialKey()) === '1' || tutorialActive) return;
    if (lastShell === shell && tutorialTimer) return;
    lastShell = shell; window.clearTimeout(tutorialTimer);
    tutorialTimer = window.setTimeout(() => {
      tutorialTimer = 0;
      if (!shell.isConnected || shell.querySelector('.bmt-result-overlay')) return;
      startTutorial(shell);
    }, 1050);
  }

  function patchGame() {
    if (document.body?.dataset?.currentGame !== 'biblical-match-three') return;
    const shell = document.querySelector('.bmt-shell');
    if (!shell) return;
    patchBoosterLabels(shell);
    if (shell.classList.contains('bmt-board-screen')) { patchBoard(shell); captureHud(shell); scheduleTutorial(shell); }
    shell.querySelectorAll('.bmt-result-card.is-win').forEach(enhanceWinResult);
  }

  ensureStyle();
  patchGame();
  const gameRoot = document.getElementById('game-container');
  if (gameRoot) new MutationObserver(patchGame).observe(gameRoot, { childList: true, subtree: true });
  window.setInterval(() => {
    if (document.body?.dataset?.currentGame !== 'biblical-match-three') return;
    const shell=document.querySelector('.bmt-shell.bmt-board-screen');
    if(shell){captureHud(shell);patchBoosterLabels(shell);patchBoard(shell);}
  }, 250);
})();
