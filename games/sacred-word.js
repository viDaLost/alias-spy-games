/* global loadJSON, goToMainMenu, THREE, getTelegramUser */

function startSacredWordGame(wordsUrl) {
  const container = document.getElementById("game-container");
  if (!container) return;

  if (typeof THREE === 'undefined') {
    container.innerHTML = `<div style="padding: 20px; color: red;">Ошибка: Библиотека Three.js не подключена!</div>`;
    return;
  }

  const tgUser = (typeof getTelegramUser === "function") ? getTelegramUser() : { id: "anon" };
  // Используем v4, чтобы синхронизация с вашим app.js работала корректно
  const STORAGE_KEY = `sacred_word_levels_v4_${tgUser.id}`;
  const MAX_ERRORS = 7; 
  const KEYBOARD_ROWS = [
    ["Й","Ц","У","К","Е","Н","Г","Ш","Щ","З","Х","Ъ"],
    ["Ф","Ы","В","А","П","Р","О","Л","Д","Ж","Э"],
    ["Я","Ч","С","М","И","Т","Ь","Б","Ю","Ё"]
  ];

  let words = [];
  let state = null; 

  // --- THREE.JS ПЕРЕМЕННЫЕ ---
  let threeCanvas = null;
  let scene, camera, renderer;
  let flames3D = [];
  let smokeParticles = [];
  let animationFrameId;

  function injectStyles() {
    const old = document.getElementById("sacred-word-style");
    if (old) old.remove();
    const style = document.createElement("style");
    style.id = "sacred-word-style";
    style.textContent = `
      .sw-wrap { width: min(100%, 860px); margin: 0 auto; display: grid; gap: 14px; padding: 6px 0 24px; color: #1e293b; }
      .sw-topbar, .sw-card, .sw-keyboard { background: #ffffff; border-radius: 18px; box-shadow: 0 6px 18px rgba(0,0,0,.08); border: 1px solid rgba(79,70,229,.08); }
      .sw-topbar { padding: 12px; display: flex; align-items: center; justify-content: space-between; gap: 10px; }
      .sw-titlebox { text-align: center; flex: 1; display: flex; flex-direction: column; align-items: center; }
      .sw-title { font-size: 1.3rem; font-weight: 800; color: #312e81; }
      .sw-subtitle { font-size: .92rem; color: #475569; margin-top: 4px; display: flex; align-items: center; gap: 6px; }
      .sw-level-select { background: #e0e7ff; border: 1px solid #c7d2fe; border-radius: 6px; padding: 2px 6px; font-family: inherit; font-size: 0.9rem; font-weight: 700; color: #312e81; cursor: pointer; outline: none; }
      .sw-card { padding: 16px; }
      .sw-grid { display: grid; grid-template-columns: minmax(280px, 360px) 1fr; gap: 16px; align-items: center; }
      .sw-lamp-card { background: radial-gradient(circle at center, #1e293b, #020617); border-radius: 20px; padding: 0; min-height: 290px; display: flex; align-items: center; justify-content: center; overflow: hidden; position: relative; }
      .sw-info { display: grid; gap: 12px; }
      .sw-pillrow { display: flex; flex-wrap: wrap; gap: 8px; }
      .sw-pill { background: #dbeafe; color: #1e293b; border-radius: 999px; padding: 8px 12px; font-size: .94rem; font-weight: 700; }
      .sw-hintbox { background: #f8fafc; border: 1px solid #cbd5e1; color: #334155; border-radius: 16px; padding: 12px 14px; line-height: 1.45; font-size: 1rem; font-style: italic; }
      .sw-word { display: flex; flex-wrap: wrap; gap: 8px; min-height: 66px; }
      .sw-letter { width: 44px; height: 52px; border-radius: 14px; background: #fff; border: 2px solid #cbd5e1; box-shadow: 0 4px 10px rgba(0,0,0,.05); display: flex; align-items: center; justify-content: center; font-size: 1.35rem; font-weight: 800; color: #0f172a; transition: transform .2s ease, background-color .2s ease; }
      .sw-letter.revealed { background: #dbeafe; border-color: #818cf8; transform: translateY(-2px); }
      .sw-letter.space { width: 18px; background: transparent; border: none; box-shadow: none; }
      .sw-message { min-height: 24px; font-weight: 700; color: #312e81; }
      .sw-actions { display: flex; gap: 10px; flex-wrap: wrap; }
      .sw-actions button { flex: 1; min-width: 168px; margin: 0; padding: 10px; border-radius: 8px; font-weight: bold; border: none; cursor: pointer; transition: 0.2s; }
      .sw-actions button:active { transform: scale(0.95); }
      .sw-keyboard { padding: 14px 8px; box-sizing: border-box; }
      .sw-kb-row { display: flex; justify-content: center; gap: 5px; margin-bottom: 6px; width: 100%; }
      .sw-kb-key { flex: 1 1 auto; max-width: 44px; height: 48px; border-radius: 10px; border: none; background: #f1f5f9; color: #0f172a; box-shadow: 0 4px 6px rgba(0,0,0,.08); font-weight: 800; font-size: 1.1rem; padding: 0; display: flex; align-items: center; justify-content: center; touch-action: manipulation; transition: transform .1s ease, opacity .2s ease, background-color .2s ease; }
      .sw-kb-key.good { background: #dcfce7; color: #166534; box-shadow: none; }
      .sw-kb-key.bad { background: #fee2e2; color: #991b1b; box-shadow: none; }
      .sw-kb-key.used { opacity: .6; }
      .sw-kb-key:disabled { cursor: not-allowed; }
      .sw-kb-key:active:not(:disabled) { transform: scale(.92); }
      @media (max-width: 500px) {
        .sw-grid { grid-template-columns: 1fr; }
        .sw-lamp-card { min-height: 220px; }
        .sw-title { font-size: 1.12rem; }
        .sw-topbar { padding: 10px; }
        .sw-kb-key { height: 42px; font-size: 1rem; max-width: 36px; }
        .sw-kb-row { gap: 3px; }
      }
    `;
    document.head.appendChild(style);
  }

  // Генерация текстур для огня и дыма (Canvas 2D)
  function createRadialGradientTexture(color1, color2) {
    const canvas = document.createElement('canvas');
    canvas.width = 64; canvas.height = 64;
    const ctx = canvas.getContext('2d');
    const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, color1);
    grad.addColorStop(1, color2);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(canvas);
  }

  // --- ИНИЦИАЛИЗАЦИЯ THREE.JS ---
  function initThreeJS() {
    scene = new THREE.Scene();
    
    renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setSize(280, 280);
    renderer.setPixelRatio(window.devicePixelRatio);
    threeCanvas = renderer.domElement;
    threeCanvas.style.width = "100%";
    threeCanvas.style.height = "auto";
    threeCanvas.style.maxWidth = "280px";
    threeCanvas.style.aspectRatio = "1 / 1";

    camera = new THREE.PerspectiveCamera(45, 1, 0.1, 1000);
    camera.position.set(0, 2.5, 14.5);
    camera.lookAt(0, 1.5, 0);

    // Сложное освещение
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
    scene.add(ambientLight);
    
    const mainLight = new THREE.DirectionalLight(0xfff0dd, 1.2);
    mainLight.position.set(5, 10, 8);
    scene.add(mainLight);

    const backLight = new THREE.DirectionalLight(0x88bbff, 0.8);
    backLight.position.set(-5, 5, -8);
    scene.add(backLight);

    const goldMat = new THREE.MeshStandardMaterial({
      color: 0xffb700,
      metalness: 0.9,
      roughness: 0.15,
    });

    const menorahGroup = new THREE.Group();
    menorahGroup.position.y = -1;

    // --- БАЗА И СТВОЛ ---
    const base1 = new THREE.Mesh(new THREE.CylinderGeometry(2.5, 2.8, 0.4, 32), goldMat);
    base1.position.y = -3;
    menorahGroup.add(base1);
    
    const base2 = new THREE.Mesh(new THREE.CylinderGeometry(1.8, 2.2, 0.4, 32), goldMat);
    base2.position.y = -2.6;
    menorahGroup.add(base2);

    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.35, 6.5, 16), goldMat);
    stem.position.y = 0;
    menorahGroup.add(stem);

    [-1.5, 0, 1.5].forEach(yPos => {
      const knob = new THREE.Mesh(new THREE.SphereGeometry(0.45, 16, 16), goldMat);
      knob.position.y = yPos;
      knob.scale.y = 0.8;
      menorahGroup.add(knob);
    });

    // --- ВЕТВИ (U-образные) ---
    const radii = [1.2, 2.4, 3.6];
    const branchYCenter = 2.0; 

    addCandleCupAndFire(0, branchYCenter, menorahGroup);

    radii.forEach((r, idx) => {
      const branchGeo = new THREE.TorusGeometry(r, 0.18, 16, 48, Math.PI);
      const branch = new THREE.Mesh(branchGeo, goldMat);
      branch.position.y = branchYCenter;
      branch.rotation.z = Math.PI; 
      menorahGroup.add(branch);

      const bottomKnob = new THREE.Mesh(new THREE.SphereGeometry(0.3, 16, 16), goldMat);
      bottomKnob.position.set(0, branchYCenter - r, 0);
      menorahGroup.add(bottomKnob);

      addCandleCupAndFire(r, branchYCenter, menorahGroup);
      addCandleCupAndFire(-r, branchYCenter, menorahGroup);
    });

    scene.add(menorahGroup);
    animateThreeJS();
  }

  const texCore = createRadialGradientTexture('rgba(255, 255, 255, 1)', 'rgba(255, 220, 100, 0)');
  const texHalo = createRadialGradientTexture('rgba(255, 120, 0, 0.8)', 'rgba(255, 50, 0, 0)');
  const texSmoke = createRadialGradientTexture('rgba(200, 200, 200, 0.6)', 'rgba(100, 100, 100, 0)');
  const smokeMat = new THREE.SpriteMaterial({ map: texSmoke, transparent: true });

  function addCandleCupAndFire(x, y, parentGroup) {
    const goldMat = new THREE.MeshStandardMaterial({ color: 0xffb700, metalness: 0.9, roughness: 0.15 });
    const candleMat = new THREE.MeshStandardMaterial({ color: 0xfdfbf7, roughness: 0.9, metalness: 0.0 });
    const wickMat = new THREE.MeshBasicMaterial({ color: 0x222222 });

    const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.2, 0.4, 16), goldMat);
    cup.position.set(x, y + 0.2, 0);
    parentGroup.add(cup);

    const cupBase = new THREE.Mesh(new THREE.SphereGeometry(0.25, 16, 16), goldMat);
    cupBase.position.set(x, y, 0);
    parentGroup.add(cupBase);

    const candleY = y + 0.8;
    const candle = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.2, 1.2, 16), candleMat);
    candle.position.set(x, candleY, 0);
    parentGroup.add(candle);

    const wick = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.2, 4), wickMat);
    wick.position.set(x, candleY + 0.65, 0);
    parentGroup.add(wick);

    const flameGroup = new THREE.Group();
    const flameY = candleY + 0.9;
    flameGroup.position.set(x, flameY, 0);

    const light = new THREE.PointLight(0xff8800, 1.5, 6);
    flameGroup.add(light);

    const coreMat = new THREE.SpriteMaterial({ map: texCore, blending: THREE.AdditiveBlending, depthWrite: false });
    const coreSprite = new THREE.Sprite(coreMat);
    coreSprite.scale.set(0.6, 1.0, 1);
    
    const haloMat = new THREE.SpriteMaterial({ map: texHalo, blending: THREE.AdditiveBlending, depthWrite: false });
    const haloSprite = new THREE.Sprite(haloMat);
    haloSprite.scale.set(1.2, 1.8, 1);
    haloSprite.position.y = 0.2;

    flameGroup.add(haloSprite);
    flameGroup.add(coreSprite);

    parentGroup.add(flameGroup);

    flames3D.push({
      xPosition: x, 
      group: flameGroup,
      core: coreSprite,
      halo: haloSprite,
      light: light,
      baseY: flameY,
      active: true,
      randomOffset: Math.random() * 100 
    });
  }

  function spawnSmokeCloud(x, y, z) {
    for(let i=0; i<8; i++) {
      const sprite = new THREE.Sprite(smokeMat.clone());
      sprite.position.set(x + (Math.random()-0.5)*0.2, y, z + (Math.random()-0.5)*0.2);
      sprite.scale.set(0.5, 0.5, 0.5);
      scene.add(sprite);
      
      smokeParticles.push({
        sprite: sprite,
        life: 1.0,
        velY: 0.02 + Math.random() * 0.02,
        velX: (Math.random() - 0.5) * 0.02,
        scaleSpeed: 0.02 + Math.random() * 0.02
      });
    }
  }

  function animateThreeJS() {
    if (!scene) return;
    animationFrameId = requestAnimationFrame(animateThreeJS);
    const time = Date.now() * 0.005;

    flames3D.forEach((flame) => {
      if (flame.active) {
        const flicker = Math.sin(time + flame.randomOffset) * 0.15 + 0.85;
        flame.core.scale.set(0.6 * flicker, 1.0 * flicker, 1);
        flame.halo.scale.set(1.2 * flicker, 1.8 * flicker, 1);
        flame.light.intensity = 1.5 * flicker;
        flame.group.position.y = flame.baseY + Math.sin(time * 3 + flame.randomOffset) * 0.03;
      }
    });

    for (let i = smokeParticles.length - 1; i >= 0; i--) {
      const p = smokeParticles[i];
      p.life -= 0.015;
      p.sprite.position.y += p.velY;
      p.sprite.position.x += p.velX;
      const currentScale = p.sprite.scale.x + p.scaleSpeed;
      p.sprite.scale.set(currentScale, currentScale, 1);
      p.sprite.material.opacity = p.life;

      if (p.life <= 0) {
        scene.remove(p.sprite);
        p.sprite.material.dispose();
        smokeParticles.splice(i, 1);
      }
    }

    camera.position.x = Math.sin(time * 0.05) * 2;
    camera.position.z = 14.5 + Math.cos(time * 0.05) * 1;
    camera.lookAt(0, 1.5, 0);

    renderer.render(scene, camera);
  }

  function syncFlamesWithState() {
    if (!flames3D.length) return;
    
    const sortedFlames = [...flames3D].sort((a,b) => a.xPosition - b.xPosition);
    const extinctOrder = [0, 6, 1, 5, 2, 4, 3]; 
    
    for (let idx = 0; idx < 7; idx++) {
      const extinguishErrorLevel = extinctOrder.indexOf(idx) + 1; 
      const shouldBeOff = state.errors >= extinguishErrorLevel;
      
      const flame = sortedFlames[idx];
      
      if (shouldBeOff && flame.active) {
         flame.active = false;
         flame.core.visible = false;
         flame.halo.visible = false;
         flame.light.intensity = 0;
         const worldPos = new THREE.Vector3();
         flame.group.getWorldPosition(worldPos);
         spawnSmokeCloud(worldPos.x, worldPos.y, worldPos.z);
      } else if (!shouldBeOff && !flame.active) {
         flame.active = true;
         flame.core.visible = true;
         flame.halo.visible = true;
      }
    }
  }

  function normalizeLetter(letter) { return (letter || "").toUpperCase().replace(/\s+/g, ""); }
  function sanitizeWord(word) { return normalizeLetter(word).replace(/[^А-ЯЁ-]/g, ""); }
  function loadSavedState() { try { const raw = localStorage.getItem(STORAGE_KEY); return raw ? JSON.parse(raw) : null; } catch { return null; } }
  function saveState() { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch {} }

  function createRound(targetLevel) {
    let lvl = targetLevel !== undefined ? targetLevel : (state ? state.level : 0);
    const safeIndex = lvl % words.length; 
    
    const wordObj = words[safeIndex];
    state = {
      level: safeIndex,
      word: sanitizeWord(wordObj.word),
      category: wordObj.category,
      hint: wordObj.hint,
      errors: 0,
      used: [],
      revealed: [],
      finished: false,
      won: false
    };
    saveState();
    render();
  }

  function ensureStateValid() {
    const saved = loadSavedState();
    if (!saved || saved.level === undefined || !saved.word) return createRound(0);
    state = saved;
    render();
  }

  function revealAllByLetter(letter) {
    [...state.word].forEach((ch, idx) => {
      if (ch === letter && !state.revealed.includes(idx)) state.revealed.push(idx);
    });
  }

  function getSolved() {
    return [...state.word].every((ch, idx) => ch === "-" || ch === " " || state.revealed.includes(idx));
  }

  function pressLetter(letter) {
    if (!letter || state.finished) return;
    letter = normalizeLetter(letter);
    if (state.used.includes(letter)) return;
    
    state.used.push(letter);
    
    if (state.word.includes(letter)) {
      revealAllByLetter(letter);
      if (getSolved()) {
        state.finished = true;
        state.won = true;
      }
    } else {
      state.errors += 1;
      if (state.errors >= MAX_ERRORS) {
        state.errors = MAX_ERRORS;
        state.finished = true;
        state.won = false;
      }
    }
    saveState();
    render();
  }

  function getMessage() {
    if (!state.finished) return "Открывай буквы и береги пламя меноры.";
    if (state.won) return "Победа! Свет сохранён.";
    return `Светильник угас. Загаданное слово: ${state.word}.`;
  }

  function renderWord() {
    return [...state.word].map((ch, idx) => {
      if (ch === " " || ch === "-") return `<div class="sw-letter ${ch === " " ? "space" : "revealed"}">${ch === "-" ? "–" : ""}</div>`;
      const visible = state.revealed.includes(idx) || (!state.won && state.finished);
      return `<div class="sw-letter ${visible ? "revealed" : ""}">${visible ? ch : "_"}</div>`;
    }).join("");
  }

  function renderKeyboard() {
    return KEYBOARD_ROWS.map(row => `
      <div class="sw-kb-row">
        ${row.map(letter => {
          const used = state.used.includes(letter);
          const hit = used && state.word.includes(letter);
          const miss = used && !state.word.includes(letter);
          return `<button class="sw-kb-key ${used ? "used" : ""} ${hit ? "good" : ""} ${miss ? "bad" : ""}" data-letter="${letter}" ${used || state.finished ? "disabled" : ""}>${letter}</button>`;
        }).join("")}
      </div>
    `).join("");
  }

  function render() {
    let actionButtons = '';
    
    if (state.finished && state.won) {
      actionButtons = `<button class="start-button" id="sw-next-level" style="background: linear-gradient(135deg, #4f46e5, #3b82f6); color: #fff; max-width: 320px; margin: 0 auto; box-shadow: 0 4px 12px rgba(59,130,246,0.3);">➡️ Следующий уровень</button>`;
    } else {
      actionButtons = `<button class="start-button" id="sw-reset-btn" style="background:#f1f5f9; color:#0f172a; border: 1px solid #cbd5e1; max-width: 320px; margin: 0 auto;">🔄 Сбросить уровень</button>`;
    }

    const levelSelectHtml = `
      <select id="sw-level-select" class="sw-level-select">
        ${words.map((w, i) => `<option value="${i}" ${i === state.level ? "selected" : ""}>Уровень ${i + 1}</option>`).join("")}
      </select>
    `;

    container.innerHTML = `
      <div class="sw-wrap">
        <div class="sw-topbar">
          <button class="back-button" style="width:auto; padding:10px 14px; margin:0; border: 1px solid #cbd5e1;" id="sw-back-btn">⬅️ Назад</button>
          <div class="sw-titlebox">
            <div class="sw-title">Священное слово</div>
            <div class="sw-subtitle">${levelSelectHtml}</div>
          </div>
          <div style="width:96px"></div>
        </div>

        <div class="sw-card">
          <div class="sw-grid">
            <div class="sw-lamp-card" id="sw-lamp-container"></div>
            <div class="sw-info">
              <div class="sw-pillrow">
                <div class="sw-pill">Категория: ${state.category}</div>
                <div class="sw-pill" style="background:${state.errors >= MAX_ERRORS ? '#fee2e2' : '#dbeafe'}; color:${state.errors >= MAX_ERRORS ? '#991b1b' : '#1e293b'};">Угасание: ${state.errors} / ${MAX_ERRORS}</div>
              </div>
              <div class="sw-hintbox">${state.hint}</div>
              <div>
                <div class="sw-subtitle" style="margin-bottom:8px; text-align:left;">Снизу скрытое слово, сверху слова связанвые с ним</div>
                <div class="sw-word">${renderWord()}</div>
              </div>
            </div>
          </div>
        </div>

        <div class="sw-keyboard">
          ${renderKeyboard()}
        </div>

        <div style="padding: 10px 16px; text-align: center;">
          <div class="sw-message" style="margin-bottom: 12px; min-height: 24px;">${getMessage()}</div>
          <div class="sw-actions" style="display: flex; justify-content: center;">
            ${actionButtons}
          </div>
        </div>
      </div>
    `;

    const lampContainer = document.getElementById("sw-lamp-container");
    if (!threeCanvas) {
      initThreeJS();
    }
    if (threeCanvas && lampContainer) {
      lampContainer.appendChild(threeCanvas);
    }
    syncFlamesWithState();

    container.querySelectorAll(".sw-kb-key").forEach(btn => {
      btn.addEventListener("click", () => pressLetter(btn.dataset.letter));
    });

    container.querySelector("#sw-next-level")?.addEventListener("click", () => {
      createRound(state.level + 1);
    });

    container.querySelector("#sw-reset-btn")?.addEventListener("click", () => {
      createRound(state.level);
    });

    container.querySelector("#sw-level-select")?.addEventListener("change", (e) => {
      createRound(parseInt(e.target.value, 10));
    });
    
    container.querySelector("#sw-back-btn")?.addEventListener("click", () => {
       cleanupThreeJS();
       goToMainMenu();
    });
  }

  function handlePhysicalKeyboard(event) {
    if (!state || state.finished) return;
    const letter = normalizeLetter(event.key);
    if (/^[А-ЯЁ]$/.test(letter)) {
      event.preventDefault();
      pressLetter(letter);
    }
  }

  function cleanupThreeJS() {
    if (animationFrameId) cancelAnimationFrame(animationFrameId);
    smokeParticles = []; 
    if (renderer) {
      renderer.dispose();
      renderer.forceContextLoss();
    }
    document.removeEventListener("keydown", handlePhysicalKeyboard);
  }

  injectStyles();
  loadJSON(wordsUrl)
    .then(data => {
      words = Array.isArray(data) ? data.filter(item => item && item.word && item.category && item.hint) : [];
      if (!words.length) throw new Error("Не удалось загрузить слова.");
      
      if (window.__sacredWordCleanup) window.__sacredWordCleanup();
      
      document.addEventListener("keydown", handlePhysicalKeyboard);
      window.__sacredWordCleanup = cleanupThreeJS;
      ensureStateValid();
    })
    .catch(err => {
      console.error(err);
      container.innerHTML = `
        <div class="card" style="max-width:640px; margin: 1rem auto; background:#fff; padding:20px;">
          <p style="margin-bottom:12px; color:#991b1b; font-weight:700;">❌ Не удалось загрузить игру «Священное слово».</p>
          <button class="back-button" onclick="goToMainMenu()" style="border: 1px solid #cbd5e1;">⬅️ В меню</button>
        </div>
      `;
    });
}
