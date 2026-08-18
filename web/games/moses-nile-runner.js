(() => {
  'use strict';

  const STYLE_ID = 'moses-nile-runner-style-v1';
  const BEST_KEY = 'moses_nile_runner_best_v1';
  const VERSION = '1';
  const LANES = [-1, 0, 1];
  const OBSTACLE_TYPES = [
    { key: 'rock', icon: '🪨', label: 'Камень', points: 0 },
    { key: 'reeds', icon: '🌿', label: 'Камыши', points: 0 },
    { key: 'log', icon: '🪵', label: 'Бревно', points: 0 },
    { key: 'crocodile', icon: '🐊', label: 'Крокодил', points: 0, active: true },
  ];

  let runtime = null;

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function randomItem(items) {
    return items[Math.floor(Math.random() * items.length)];
  }

  function shuffle(items) {
    const out = [...items];
    for (let i = out.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  }

  function ensureStyle() {
    let style = document.getElementById(STYLE_ID);
    if (style) return;
    style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
body[data-current-game="moses-nile-runner"]{
  overflow:hidden!important;
  background:#9eddf2!important;
}
body[data-current-game="moses-nile-runner"] .app-header{display:none!important}
.mnr-shell{position:fixed;inset:0;z-index:20;overflow:hidden;background:linear-gradient(#8fd9f5 0 21%,#e9cf8c 21% 28%,#2d9bc5 28% 100%);font-family:inherit;color:#182235;touch-action:none;-webkit-user-select:none;user-select:none}
.mnr-stage{position:absolute;inset:0;overflow:hidden;touch-action:none;background:linear-gradient(to bottom,#a8e3f8 0 18%,#e7c57e 18% 23%,#338eb7 23% 100%)}
.mnr-stage::before,.mnr-stage::after{content:"";position:absolute;top:17%;bottom:-8%;width:30%;z-index:1;background:linear-gradient(90deg,#d9ba71,#ead495 38%,#90b964 39% 48%,#b0d279 49% 58%,#d7bd79 59%);filter:saturate(.92)}
.mnr-stage::before{left:-20%;transform:skewX(-7deg)}
.mnr-stage::after{right:-20%;transform:skewX(7deg) scaleX(-1)}
.mnr-sky{position:absolute;inset:0 0 auto;height:23%;z-index:0;background:radial-gradient(circle at 68% 32%,rgba(255,244,180,.95) 0 5%,rgba(255,244,180,.15) 6% 18%,transparent 19%),linear-gradient(#8fd9f5,#d4eff8)}
.mnr-horizon{position:absolute;left:13%;right:13%;top:20%;height:13%;z-index:2;border-radius:50% 50% 0 0;background:linear-gradient(to bottom,rgba(234,213,148,.95),rgba(84,161,181,.1));clip-path:polygon(0 58%,16% 35%,28% 57%,43% 25%,58% 55%,72% 31%,100% 60%,100% 100%,0 100%)}
.mnr-water{position:absolute;left:4%;right:4%;top:23%;bottom:-4%;z-index:2;clip-path:polygon(39% 0,61% 0,100% 100%,0 100%);background:linear-gradient(to bottom,#67c5df 0,#39a9ce 25%,#278caf 66%,#1d7497 100%);overflow:hidden}
.mnr-water::before{content:"";position:absolute;inset:0;background:repeating-linear-gradient(171deg,transparent 0 24px,rgba(255,255,255,.17) 25px 27px,transparent 28px 54px);animation:mnr-water 2.1s linear infinite;opacity:.75}
.mnr-water::after{content:"";position:absolute;inset:0;background:linear-gradient(90deg,rgba(255,255,255,.12),transparent 26%,transparent 74%,rgba(7,74,103,.15))}
@keyframes mnr-water{from{transform:translateY(-42px)}to{transform:translateY(42px)}}
.mnr-lane-guide{position:absolute;top:25%;bottom:0;width:1px;z-index:3;transform-origin:top;background:linear-gradient(rgba(255,255,255,.03),rgba(255,255,255,.22),rgba(255,255,255,.02));pointer-events:none}
.mnr-lane-guide--l{left:46%;transform:rotate(12deg)}.mnr-lane-guide--r{right:46%;transform:rotate(-12deg)}
.mnr-topbar{position:absolute;z-index:20;top:max(12px,env(safe-area-inset-top));left:12px;right:12px;display:grid;grid-template-columns:auto 1fr auto;gap:9px;align-items:center}
.mnr-icon-btn{width:48px;height:48px;border:0;border-radius:17px;background:rgba(255,255,255,.92);box-shadow:0 6px 22px rgba(21,55,75,.18);font-size:24px;color:#31475f;font-weight:800}
.mnr-stats{min-width:0;display:grid;grid-template-columns:1fr 1fr 1fr;border:1px solid rgba(255,255,255,.72);border-radius:18px;background:rgba(255,255,255,.88);box-shadow:0 6px 22px rgba(21,55,75,.15);backdrop-filter:blur(10px);overflow:hidden}
.mnr-stat{padding:7px 5px;text-align:center;border-right:1px solid rgba(83,107,125,.12)}.mnr-stat:last-child{border-right:0}.mnr-stat small{display:block;font-size:9px;letter-spacing:.12em;text-transform:uppercase;color:#6e7e8f;font-weight:800}.mnr-stat strong{display:block;font-size:18px;line-height:1.1;margin-top:2px}.mnr-hearts{letter-spacing:1px;color:#df4b5d;font-size:15px!important}
.mnr-object{position:absolute;left:50%;top:20%;z-index:8;display:grid;place-items:center;width:62px;height:62px;transform:translate(-50%,-50%) scale(.35);will-change:transform,top,left,opacity;pointer-events:none;filter:drop-shadow(0 8px 5px rgba(14,58,72,.22))}
.mnr-object__emoji{font-size:50px;line-height:1}.mnr-object--pickup{filter:drop-shadow(0 0 10px rgba(255,229,98,.9))}.mnr-object--pickup .mnr-object__emoji{font-size:38px}.mnr-object--crocodile{width:78px}.mnr-object--crocodile .mnr-object__emoji{font-size:58px;transform:rotate(-5deg)}
.mnr-object.is-hit{animation:mnr-hit .3s ease-out forwards}.mnr-object.is-collected{animation:mnr-collect .28s ease-out forwards}@keyframes mnr-hit{to{opacity:0;transform:translate(-50%,-50%) scale(1.8) rotate(18deg)}}@keyframes mnr-collect{to{opacity:0;transform:translate(-50%,-70%) scale(1.55)}}
.mnr-basket-wrap{position:absolute;left:50%;top:84%;z-index:12;width:104px;height:72px;transform:translate(-50%,-50%);transition:left .17s cubic-bezier(.2,.85,.32,1),transform .18s ease;will-change:left,transform}
.mnr-basket-wrap.is-boosting{transform:translate(-50%,-68%) scale(1.06)}.mnr-basket-wrap.is-hit{animation:mnr-basket-hit .42s ease}@keyframes mnr-basket-hit{0%,100%{transform:translate(-50%,-50%)}25%{transform:translate(-60%,-50%) rotate(-5deg)}65%{transform:translate(-42%,-50%) rotate(4deg)}}
.mnr-basket{position:absolute;left:50%;bottom:8px;width:88px;height:42px;transform:translateX(-50%);border:3px solid #8e5c28;border-radius:12px 12px 42px 42px;background:repeating-linear-gradient(12deg,#d69a49 0 5px,#c68134 6px 9px);box-shadow:inset 0 6px 0 rgba(255,224,151,.35),0 10px 18px rgba(14,61,77,.24)}
.mnr-basket::before{content:"";position:absolute;left:10px;right:10px;top:-21px;height:34px;border:5px solid #9b642c;border-bottom:0;border-radius:50% 50% 0 0}.mnr-basket::after{content:"";position:absolute;left:21px;right:21px;top:7px;height:17px;border-radius:50%;background:#f1e2c5;box-shadow:inset 0 -4px 0 rgba(171,123,67,.14)}
.mnr-wake{position:absolute;left:50%;top:49px;width:92px;height:25px;transform:translateX(-50%);border-radius:50%;background:radial-gradient(ellipse,rgba(255,255,255,.65),rgba(255,255,255,0) 70%);animation:mnr-wake .9s ease-in-out infinite}@keyframes mnr-wake{50%{transform:translateX(-50%) scaleX(1.25);opacity:.45}}
.mnr-flash{position:absolute;inset:0;z-index:18;pointer-events:none;opacity:0;background:rgba(255,75,75,.24)}.mnr-flash.is-on{animation:mnr-flash .32s ease}@keyframes mnr-flash{35%{opacity:1}100%{opacity:0}}
.mnr-toast{position:absolute;z-index:30;left:50%;bottom:max(22px,calc(env(safe-area-inset-bottom) + 10px));transform:translate(-50%,18px);opacity:0;max-width:86%;padding:10px 16px;border-radius:18px;background:rgba(15,45,62,.87);color:#fff;font-size:14px;font-weight:800;text-align:center;pointer-events:none;transition:.2s}.mnr-toast.is-on{opacity:1;transform:translate(-50%,0)}
.mnr-overlay{position:absolute;inset:0;z-index:40;display:grid;place-items:center;padding:24px;background:linear-gradient(rgba(20,65,82,.28),rgba(10,38,51,.66));backdrop-filter:blur(4px)}.mnr-overlay.hidden{display:none}.mnr-card{width:min(100%,390px);padding:24px 20px;border-radius:30px;background:rgba(255,255,255,.96);box-shadow:0 24px 70px rgba(10,42,56,.32);text-align:center}.mnr-card__eyebrow{font-size:11px;font-weight:900;letter-spacing:.16em;text-transform:uppercase;color:#3f94b4}.mnr-card h2{font-size:30px;line-height:1.02;margin:8px 0 10px}.mnr-card p{margin:0;color:#637181;line-height:1.45}.mnr-gesture-grid{display:grid;grid-template-columns:1fr 1fr;gap:9px;margin:18px 0}.mnr-gesture{padding:11px 8px;border-radius:16px;background:#edf7fb;font-size:12px;font-weight:800;color:#466276}.mnr-gesture b{display:block;font-size:22px;color:#207fa5}.mnr-primary{width:100%;border:0;border-radius:18px;padding:14px 16px;background:linear-gradient(135deg,#208db7,#236bd0);color:white;font-size:17px;font-weight:900;box-shadow:0 9px 24px rgba(32,126,181,.3)}.mnr-secondary{margin-top:9px;width:100%;border:0;border-radius:16px;padding:12px;background:#eef2f5;color:#405060;font-weight:800}.mnr-result-score{font-size:42px;font-weight:950;color:#1e7ca5;margin:12px 0 3px}.mnr-result-best{font-size:13px;color:#7a8791;margin-bottom:16px}.mnr-pause-tag{position:absolute;z-index:25;top:78px;left:50%;transform:translateX(-50%);padding:7px 13px;border-radius:14px;background:rgba(17,50,67,.78);color:#fff;font-size:12px;font-weight:900;opacity:0;pointer-events:none}.mnr-pause-tag.is-on{opacity:1}
@media (max-width:360px){.mnr-topbar{left:8px;right:8px;gap:6px}.mnr-icon-btn{width:43px;height:43px;border-radius:15px}.mnr-stat strong{font-size:16px}.mnr-basket-wrap{width:94px;transform:translate(-50%,-50%) scale(.92)}}
`;
    document.head.appendChild(style);
  }

  function haptic(kind = 'light') {
    try { window.Telegram?.WebApp?.HapticFeedback?.impactOccurred?.(kind); } catch {}
  }

  function notification(kind = 'success') {
    try { window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred?.(kind); } catch {}
  }

  function bestDistance() {
    try { return Math.max(0, Number(localStorage.getItem(BEST_KEY) || 0) || 0); } catch { return 0; }
  }

  function storeBest(value) {
    try { localStorage.setItem(BEST_KEY, String(Math.max(0, Math.round(value)))); } catch {}
  }

  function shellMarkup() {
    return `
      <section class="mnr-shell" data-version="${VERSION}">
        <div class="mnr-stage" id="mnr-stage" aria-label="Путь Моисея по Нилу">
          <div class="mnr-sky"></div>
          <div class="mnr-horizon"></div>
          <div class="mnr-water"><i class="mnr-lane-guide mnr-lane-guide--l"></i><i class="mnr-lane-guide mnr-lane-guide--r"></i></div>
          <div class="mnr-basket-wrap" id="mnr-basket"><div class="mnr-wake"></div><div class="mnr-basket"></div></div>
          <div class="mnr-flash" id="mnr-flash"></div>
        </div>

        <div class="mnr-topbar">
          <button type="button" class="mnr-icon-btn" id="mnr-back" aria-label="В меню">←</button>
          <div class="mnr-stats">
            <div class="mnr-stat"><small>Путь</small><strong id="mnr-distance">0 м</strong></div>
            <div class="mnr-stat"><small>Свет</small><strong id="mnr-score">0</strong></div>
            <div class="mnr-stat"><small>Жизни</small><strong class="mnr-hearts" id="mnr-hearts">♥♥♥</strong></div>
          </div>
          <button type="button" class="mnr-icon-btn" id="mnr-pause" aria-label="Пауза">Ⅱ</button>
        </div>
        <div class="mnr-pause-tag" id="mnr-pause-tag">Пауза</div>
        <div class="mnr-toast" id="mnr-toast"></div>

        <div class="mnr-overlay" id="mnr-intro">
          <div class="mnr-card">
            <div class="mnr-card__eyebrow">Новая игра • прототип</div>
            <h2>Моисей:<br>путь по Нилу</h2>
            <p>Проведи корзину по течению. Избегай камней, камышей и крокодилов, собирай свет и продержись как можно дольше.</p>
            <div class="mnr-gesture-grid">
              <div class="mnr-gesture"><b>← →</b>сменить поток</div>
              <div class="mnr-gesture"><b>↑</b>рывок вперёд</div>
              <div class="mnr-gesture"><b>↓</b>замедлиться</div>
              <div class="mnr-gesture"><b>♥♥♥</b>три ошибки</div>
            </div>
            <button type="button" class="mnr-primary" id="mnr-start">Начать путь</button>
            <button type="button" class="mnr-secondary" id="mnr-intro-back">В главное меню</button>
          </div>
        </div>

        <div class="mnr-overlay hidden" id="mnr-result">
          <div class="mnr-card">
            <div class="mnr-card__eyebrow">Забег завершён</div>
            <h2>Путь продолжается</h2>
            <div class="mnr-result-score" id="mnr-result-distance">0 м</div>
            <div class="mnr-result-best" id="mnr-result-best">Лучший путь: 0 м</div>
            <button type="button" class="mnr-primary" id="mnr-restart">Ещё раз</button>
            <button type="button" class="mnr-secondary" id="mnr-result-back">В главное меню</button>
          </div>
        </div>
      </section>
    `;
  }

  function createState(container) {
    return {
      container,
      stage: container.querySelector('#mnr-stage'),
      basket: container.querySelector('#mnr-basket'),
      flash: container.querySelector('#mnr-flash'),
      toast: container.querySelector('#mnr-toast'),
      distanceEl: container.querySelector('#mnr-distance'),
      scoreEl: container.querySelector('#mnr-score'),
      heartsEl: container.querySelector('#mnr-hearts'),
      intro: container.querySelector('#mnr-intro'),
      result: container.querySelector('#mnr-result'),
      pauseTag: container.querySelector('#mnr-pause-tag'),
      lane: 0,
      hearts: 3,
      distance: 0,
      score: 0,
      streak: 0,
      entities: [],
      started: false,
      paused: false,
      ended: false,
      frameId: 0,
      lastFrame: 0,
      spawnClock: 0,
      pickupClock: 0,
      invulnerableUntil: 0,
      boostUntil: 0,
      boostCooldownUntil: 0,
      slowUntil: 0,
      toastTimer: 0,
      pointer: null,
      listeners: [],
    };
  }

  function laneX(lane, progress = 1) {
    const spread = 5.5 + 24.5 * clamp(progress, 0, 1);
    return 50 + lane * spread;
  }

  function updateBasket(state) {
    state.basket.style.left = `${laneX(state.lane, 1)}%`;
  }

  function addListener(state, target, type, handler, options) {
    target.addEventListener(type, handler, options);
    state.listeners.push(() => target.removeEventListener(type, handler, options));
  }

  function showToast(state, text, duration = 900) {
    clearTimeout(state.toastTimer);
    state.toast.textContent = text;
    state.toast.classList.add('is-on');
    state.toastTimer = setTimeout(() => state.toast?.classList.remove('is-on'), duration);
  }

  function updateHud(state) {
    state.distanceEl.textContent = `${Math.floor(state.distance)} м`;
    state.scoreEl.textContent = String(Math.floor(state.score));
    state.heartsEl.textContent = `${'♥'.repeat(state.hearts)}${'♡'.repeat(3 - state.hearts)}`;
  }

  function removeEntity(state, entity, className = '') {
    if (entity.dead) return;
    entity.dead = true;
    if (className) entity.el.classList.add(className);
    setTimeout(() => entity.el?.remove(), className ? 260 : 0);
  }

  function makeEntity(state, { kind, lane, type = null, progress = 0.03 }) {
    const el = document.createElement('div');
    const pickup = kind === 'pickup';
    const obstacle = type || randomItem(OBSTACLE_TYPES);
    el.className = `mnr-object ${pickup ? 'mnr-object--pickup' : `mnr-object--${obstacle.key}`}`;
    el.innerHTML = `<span class="mnr-object__emoji" role="img" aria-label="${pickup ? 'Свет' : obstacle.label}">${pickup ? '✨' : obstacle.icon}</span>`;
    state.stage.appendChild(el);
    const entity = {
      el,
      kind,
      lane,
      baseLane: lane,
      progress,
      type: pickup ? null : obstacle,
      dead: false,
      collided: false,
      activeShifted: false,
    };
    state.entities.push(entity);
    renderEntity(entity);
    return entity;
  }

  function renderEntity(entity) {
    const p = clamp(entity.progress, 0, 1.08);
    const perspective = p * p * (3 - 2 * p);
    const scale = .34 + perspective * .86;
    const y = 23 + perspective * 67;
    const x = laneX(entity.lane, perspective);
    entity.el.style.left = `${x}%`;
    entity.el.style.top = `${y}%`;
    entity.el.style.transform = `translate(-50%,-50%) scale(${scale})`;
    entity.el.style.opacity = String(clamp(.45 + p * .8, 0, 1));
    entity.el.style.zIndex = String(5 + Math.floor(p * 8));
  }

  function safeSpawnBatch(state) {
    const difficulty = clamp(state.distance / 230, 0, 5);
    const type = randomItem(OBSTACLE_TYPES);
    const lanes = shuffle(LANES);
    const double = state.distance > 170 && Math.random() < Math.min(.48, .16 + difficulty * .07);
    const used = double ? lanes.slice(0, 2) : lanes.slice(0, 1);
    used.forEach((lane, index) => {
      const chosen = index === 0 ? type : randomItem(OBSTACLE_TYPES.filter((item) => item.key !== type.key));
      makeEntity(state, { kind: 'obstacle', lane, type: chosen, progress: index ? 0 : .02 });
    });
  }

  function spawnPickup(state) {
    const lane = randomItem(LANES);
    makeEntity(state, { kind: 'pickup', lane, progress: 0 });
  }

  function maybeMoveActiveObstacle(entity) {
    if (entity.kind !== 'obstacle' || !entity.type?.active || entity.activeShifted || entity.progress < .42) return;
    entity.activeShifted = true;
    const choices = LANES.filter((lane) => lane !== entity.lane && Math.abs(lane - entity.lane) === 1);
    if (choices.length) entity.lane = randomItem(choices);
  }

  function collide(state, entity, now) {
    if (entity.dead || entity.collided || entity.progress < .82 || entity.progress > 1.04) return;
    if (entity.lane !== state.lane) return;
    entity.collided = true;

    if (entity.kind === 'pickup') {
      state.score += 25 + state.streak * 2;
      state.streak += 1;
      removeEntity(state, entity, 'is-collected');
      haptic('light');
      if (state.streak && state.streak % 5 === 0) showToast(state, `Серия ×${state.streak} ✨`);
      return;
    }

    if (now < state.invulnerableUntil || now < state.boostUntil) {
      state.score += 10;
      removeEntity(state, entity, 'is-hit');
      haptic('medium');
      return;
    }

    state.hearts -= 1;
    state.streak = 0;
    state.invulnerableUntil = now + 1250;
    state.score = Math.max(0, state.score - 30);
    removeEntity(state, entity, 'is-hit');
    state.flash.classList.remove('is-on');
    void state.flash.offsetWidth;
    state.flash.classList.add('is-on');
    state.basket.classList.remove('is-hit');
    void state.basket.offsetWidth;
    state.basket.classList.add('is-hit');
    notification('error');
    showToast(state, state.hearts > 0 ? 'Осторожно! Потеряна жизнь' : 'Корзина остановилась');
    updateHud(state);
    if (state.hearts <= 0) endRun(state);
  }

  function moveLane(state, direction) {
    if (!state.started || state.paused || state.ended) return;
    const next = clamp(state.lane + direction, -1, 1);
    if (next === state.lane) {
      showToast(state, 'Край реки', 520);
      return;
    }
    state.lane = next;
    updateBasket(state);
    haptic('light');
  }

  function boost(state) {
    if (!state.started || state.paused || state.ended) return;
    const now = performance.now();
    if (now < state.boostCooldownUntil) {
      showToast(state, 'Рывок восстанавливается', 650);
      return;
    }
    state.boostUntil = now + 620;
    state.invulnerableUntil = Math.max(state.invulnerableUntil, now + 620);
    state.boostCooldownUntil = now + 2600;
    state.basket.classList.add('is-boosting');
    setTimeout(() => state.basket?.classList.remove('is-boosting'), 650);
    showToast(state, 'Рывок по волне!');
    haptic('medium');
  }

  function slowDown(state) {
    if (!state.started || state.paused || state.ended) return;
    state.slowUntil = performance.now() + 950;
    showToast(state, 'Замедление течения');
    haptic('light');
  }

  function processSwipe(state, dx, dy) {
    const threshold = 28;
    if (Math.hypot(dx, dy) < threshold) return;
    if (Math.abs(dx) > Math.abs(dy)) moveLane(state, dx > 0 ? 1 : -1);
    else if (dy < 0) boost(state);
    else slowDown(state);
  }

  function togglePause(state, force) {
    if (!state.started || state.ended) return;
    const next = typeof force === 'boolean' ? force : !state.paused;
    if (state.paused === next) return;
    state.paused = next;
    state.pauseTag.classList.toggle('is-on', next);
    const btn = state.container.querySelector('#mnr-pause');
    if (btn) btn.textContent = next ? '▶' : 'Ⅱ';
    if (!next) {
      state.lastFrame = performance.now();
      state.frameId = requestAnimationFrame((time) => frame(state, time));
    } else if (state.frameId) {
      cancelAnimationFrame(state.frameId);
      state.frameId = 0;
    }
  }

  function resetEntities(state) {
    state.entities.forEach((entity) => entity.el?.remove());
    state.entities = [];
  }

  function startRun(state) {
    resetEntities(state);
    state.lane = 0;
    state.hearts = 3;
    state.distance = 0;
    state.score = 0;
    state.streak = 0;
    state.started = true;
    state.paused = false;
    state.ended = false;
    state.spawnClock = 300;
    state.pickupClock = 1000;
    state.invulnerableUntil = 0;
    state.boostUntil = 0;
    state.boostCooldownUntil = 0;
    state.slowUntil = 0;
    state.intro.classList.add('hidden');
    state.result.classList.add('hidden');
    state.pauseTag.classList.remove('is-on');
    const pause = state.container.querySelector('#mnr-pause');
    if (pause) pause.textContent = 'Ⅱ';
    updateBasket(state);
    updateHud(state);
    state.lastFrame = performance.now();
    if (state.frameId) cancelAnimationFrame(state.frameId);
    state.frameId = requestAnimationFrame((time) => frame(state, time));
  }

  function endRun(state) {
    if (state.ended) return;
    state.ended = true;
    state.started = false;
    if (state.frameId) cancelAnimationFrame(state.frameId);
    state.frameId = 0;
    const distance = Math.max(0, Math.floor(state.distance));
    const previous = bestDistance();
    const best = Math.max(previous, distance);
    if (best > previous) storeBest(best);
    state.container.querySelector('#mnr-result-distance').textContent = `${distance} м`;
    state.container.querySelector('#mnr-result-best').textContent = best === distance && distance > previous
      ? `Новый рекорд: ${best} м`
      : `Лучший путь: ${best} м`;
    state.result.classList.remove('hidden');
  }

  function frame(state, now) {
    if (!runtime || runtime !== state || state.paused || state.ended || !state.started) return;
    const dt = clamp((now - state.lastFrame) / 1000, 0, .05);
    state.lastFrame = now;
    const difficulty = clamp(state.distance / 230, 0, 5);
    const slowFactor = now < state.slowUntil ? .56 : 1;
    const boostFactor = now < state.boostUntil ? 1.45 : 1;
    const travelSpeed = (.25 + difficulty * .018) * slowFactor * boostFactor;
    const metersPerSecond = (7.3 + difficulty * 1.1) * slowFactor * boostFactor;

    state.distance += dt * metersPerSecond;
    state.score += dt * (1.2 + difficulty * .35) * boostFactor;
    state.spawnClock -= dt * 1000;
    state.pickupClock -= dt * 1000;

    if (state.spawnClock <= 0) {
      safeSpawnBatch(state);
      state.spawnClock = Math.max(470, 1080 - difficulty * 115) * (.88 + Math.random() * .28);
    }
    if (state.pickupClock <= 0) {
      spawnPickup(state);
      state.pickupClock = 1500 + Math.random() * 1500;
    }

    state.entities.forEach((entity) => {
      if (entity.dead) return;
      entity.progress += dt * travelSpeed;
      maybeMoveActiveObstacle(entity);
      renderEntity(entity);
      collide(state, entity, now);
      if (entity.progress > 1.11 && !entity.dead) removeEntity(state, entity);
    });
    state.entities = state.entities.filter((entity) => !entity.dead || entity.el?.isConnected);
    updateHud(state);
    state.frameId = requestAnimationFrame((time) => frame(state, time));
  }

  function bindControls(state) {
    const stage = state.stage;
    addListener(state, stage, 'pointerdown', (event) => {
      if (event.button != null && event.button !== 0) return;
      state.pointer = { id: event.pointerId, x: event.clientX, y: event.clientY };
      try { stage.setPointerCapture?.(event.pointerId); } catch {}
    }, { passive: true });
    addListener(state, stage, 'pointerup', (event) => {
      const start = state.pointer;
      state.pointer = null;
      if (!start || start.id !== event.pointerId) return;
      processSwipe(state, event.clientX - start.x, event.clientY - start.y);
    }, { passive: true });
    addListener(state, stage, 'pointercancel', () => { state.pointer = null; }, { passive: true });

    addListener(state, state.container.querySelector('#mnr-start'), 'click', () => startRun(state));
    addListener(state, state.container.querySelector('#mnr-restart'), 'click', () => startRun(state));
    addListener(state, state.container.querySelector('#mnr-pause'), 'click', () => togglePause(state));

    const exit = () => {
      window.__mosesNileCleanup?.();
      window.appGoToMainMenu?.();
    };
    addListener(state, state.container.querySelector('#mnr-back'), 'click', exit);
    addListener(state, state.container.querySelector('#mnr-intro-back'), 'click', exit);
    addListener(state, state.container.querySelector('#mnr-result-back'), 'click', exit);

    addListener(state, document, 'visibilitychange', () => {
      if (document.hidden && state.started && !state.ended) togglePause(state, true);
    });

    addListener(state, document, 'keydown', (event) => {
      if (event.key === 'ArrowLeft') moveLane(state, -1);
      if (event.key === 'ArrowRight') moveLane(state, 1);
      if (event.key === 'ArrowUp') boost(state);
      if (event.key === 'ArrowDown') slowDown(state);
      if (event.key === 'Escape') togglePause(state);
    });
  }

  function cleanup() {
    const state = runtime;
    if (!state) return;
    runtime = null;
    if (state.frameId) cancelAnimationFrame(state.frameId);
    clearTimeout(state.toastTimer);
    state.listeners.forEach((off) => { try { off(); } catch {} });
    state.listeners = [];
    resetEntities(state);
    state.container?.querySelector('.mnr-shell')?.remove();
  }

  function startMosesNileRunner() {
    cleanup();
    ensureStyle();
    const container = document.getElementById('game-container');
    if (!container) throw new Error('Контейнер игры не найден');
    container.innerHTML = shellMarkup();
    runtime = createState(container);
    updateBasket(runtime);
    updateHud(runtime);
    bindControls(runtime);
  }

  window.startMosesNileRunner = startMosesNileRunner;
  window.__mosesNileCleanup = cleanup;
})();
