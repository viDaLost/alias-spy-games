/* global goToMainMenu */
// «Царства» — экран игры.
//
// Правил здесь нет: что законно, кто победил и почему область сменила
// хозяина, знают kingdoms-rules.js и kingdoms-engine.js. Этот файл только
// рисует карту, отправляет приказы движку (или сети) и показывает ответ —
// точно так же, как устроены «Двенадцать колен».
//
// Рисунки из Images: WebP-ландшафты, гербы и приказы. SVG хранит только
// координаты, связи и интерактивные контуры поверх растровой карты.

(function () {
  'use strict';

  const PARTS = [
    'web/games/kingdoms-map.js',
    'web/games/kingdoms-rules.js',
    'web/games/kingdoms-engine.js',
    'web/games/kingdoms-bots.js',
    'web/games/kingdoms-online.js',
  ];
  const STYLE = 'web/games/kingdoms.css';
  const VERSION = '4-combat-hand';
  const AREA_ART = {
    'dolina-ccw': 'web/assets/kingdoms/areas/dolina-ccw.webp',
    'dolina-cw': 'web/assets/kingdoms/areas/dolina-cw.webp',
    'dolina-hub': 'web/assets/kingdoms/areas/dolina-hub.webp',
    'dolina-rim': 'web/assets/kingdoms/areas/dolina-rim.webp',
    'kedem-ccw': 'web/assets/kingdoms/areas/kedem-ccw.webp',
    'kedem-cw': 'web/assets/kingdoms/areas/kedem-cw.webp',
    'kedem-hub': 'web/assets/kingdoms/areas/kedem-hub.webp',
    'kedem-rim': 'web/assets/kingdoms/areas/kedem-rim.webp',
    'nagorye-ccw': 'web/assets/kingdoms/areas/nagorye-ccw.webp',
    'nagorye-cw': 'web/assets/kingdoms/areas/nagorye-cw.webp',
    'nagorye-hub': 'web/assets/kingdoms/areas/nagorye-hub.webp',
    'nagorye-rim': 'web/assets/kingdoms/areas/nagorye-rim.webp',
    'pogranichye-ccw': 'web/assets/kingdoms/areas/pogranichye-ccw.webp',
    'pogranichye-cw': 'web/assets/kingdoms/areas/pogranichye-cw.webp',
    'pogranichye-hub': 'web/assets/kingdoms/areas/pogranichye-hub.webp',
    'pogranichye-rim': 'web/assets/kingdoms/areas/pogranichye-rim.webp',
    'primorye-ccw': 'web/assets/kingdoms/areas/primorye-ccw.webp',
    'primorye-cw': 'web/assets/kingdoms/areas/primorye-cw.webp',
    'primorye-hub': 'web/assets/kingdoms/areas/primorye-hub.webp',
    'primorye-rim': 'web/assets/kingdoms/areas/primorye-rim.webp',
    'ravnina-ccw': 'web/assets/kingdoms/areas/ravnina-ccw.webp',
    'ravnina-cw': 'web/assets/kingdoms/areas/ravnina-cw.webp',
    'ravnina-hub': 'web/assets/kingdoms/areas/ravnina-hub.webp',
    'ravnina-rim': 'web/assets/kingdoms/areas/ravnina-rim.webp',
  };
  const EMBLEM_ART = {
    'kedem': 'web/assets/kingdoms/emblems/kedem.webp',
    'or': 'web/assets/kingdoms/emblems/or.webp',
    'prestol': 'web/assets/kingdoms/emblems/prestol.webp',
    'tarsis': 'web/assets/kingdoms/emblems/tarsis.webp',
    'yor': 'web/assets/kingdoms/emblems/yor.webp',
  };
  const ORDER_ART = {
    'closed': 'web/assets/kingdoms/orders/closed.webp',
    'feint': 'web/assets/kingdoms/orders/feint.webp',
    'ford': 'web/assets/kingdoms/orders/ford.webp',
    'fortify': 'web/assets/kingdoms/orders/fortify.webp',
    'guard': 'web/assets/kingdoms/orders/guard.webp',
    'march': 'web/assets/kingdoms/orders/march.webp',
    'reveal': 'web/assets/kingdoms/orders/reveal.webp',
    'scout': 'web/assets/kingdoms/orders/scout.webp',
  };
  const SAVE_KEY = 'kd_campaign_v3';

  function loadPart(file) {
    return new Promise((resolve, reject) => {
      if (document.querySelector(`script[data-kd="${file}"]`)) { resolve(); return; }
      const script = document.createElement('script');
      script.src = `${file}?v=${VERSION}`;
      script.dataset.kd = file;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error(`Не удалось загрузить ${file}`));
      document.head.appendChild(script);
    });
  }

  /*
    Возвращает промис, который решается, когда стиль в самом деле применён.
    autoZoom() меряет реальные размеры .kd-map-wrap сразу при первой сборке
    доски — а высота 54vh у него берётся из ещё не загруженного файла. На
    быстром соединении скрипты (их четыре, и все маленькие) успевают раньше
    стиля, доска строится по правилам браузера без её высоты, и первый наезд
    карты считается по чужому, неверному размеру.
  */
  function injectStyles() {
    const id = 'kingdoms-css';
    const href = `${STYLE}?v=${VERSION}`;
    const existing = document.getElementById(id);
    if (existing && existing.href.endsWith(href)) return Promise.resolve();
    return new Promise((resolve) => {
      const link = existing || document.createElement('link');
      link.id = id;
      link.rel = 'stylesheet';
      link.addEventListener('load', resolve, { once: true });
      link.addEventListener('error', resolve, { once: true });
      link.href = href;
      if (!existing) document.head.appendChild(link);
    });
  }

  const reduceMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;

  // ————————————————————————————————————————————— геометрия карты

  const VIEW = { w: 900, h: 940 };
  const CENTER = { x: 450, y: 470 };
  const REGION_RADIUS = 300;
  const RIM_SPREAD = 96;
  const HUB_SPREAD = 62;
  const SIDE_SPREAD = 90;
  const AREA_RADIUS = 48;

  function computeLayout(R) {
    const pos = new Map();
    const regionCenter = new Map();
    R.REGION_IDS.forEach((regionId, index) => {
      const angle = ((-90 + index * 60) * Math.PI) / 180;
      const rx = Math.cos(angle);
      const ry = Math.sin(angle);
      const tx = -Math.sin(angle);
      const ty = Math.cos(angle);
      const cx = CENTER.x + rx * REGION_RADIUS;
      const cy = CENTER.y + ry * REGION_RADIUS;
      regionCenter.set(regionId, { x: cx, y: cy, angle });
      pos.set(R.areaId(regionId, 'rim'), { x: cx + rx * RIM_SPREAD, y: cy + ry * RIM_SPREAD });
      pos.set(R.areaId(regionId, 'hub'), { x: cx - rx * HUB_SPREAD, y: cy - ry * HUB_SPREAD });
      pos.set(R.areaId(regionId, 'cw'), { x: cx + tx * SIDE_SPREAD, y: cy + ty * SIDE_SPREAD });
      pos.set(R.areaId(regionId, 'ccw'), { x: cx - tx * SIDE_SPREAD, y: cy - ty * SIDE_SPREAD });
    });
    return { pos, regionCenter };
  }

  // ————————————————————————————————————————————— знаки и цвета

  /*
    Знаки царств и местности нарисованы разметкой — тем же приёмом, что и
    станы «Двенадцати колен»: простые силуэты, которые ничего не весят и не
    ждут сети. Цвет — второй способ отличить царство, знак — первый: их два
    нарочно, чтобы царства различались не только цветом.
  */
  const EMBLEM_FILES = { anchor: 'tarsis', peak: 'or', ford: 'yor', sheaf: 'prestol', tent: 'kedem' };
  const emblemHTML = (key, size = 22) => `<img class="kd-emblem" src="${EMBLEM_ART[EMBLEM_FILES[key] || 'tarsis']}" width="${size}" height="${size}" alt="">`;
  const TERRAIN_NAMES = { plains: 'равнина', mountains: 'горы', desert: 'пустыня', coast: 'побережье' };
  const orderArt = (kind) => ORDER_ART[kind.startsWith('march') ? 'march' : kind === 'ford2' ? 'ford' : kind];
  const orderIconHTML = (kind) => `<img class="kd-order-icon" src="${orderArt(kind)}" width="40" height="40" alt="">`;

  const plural = (count, one, few, many) => {
    const tens = count % 100;
    if (tens >= 11 && tens <= 14) return many;
    const last = count % 10;
    if (last === 1) return one;
    if (last >= 2 && last <= 4) return few;
    return many;
  };
  const roundsWord = (n) => plural(n, 'раунд', 'раунда', 'раундов');
  const ordersWord = (n) => plural(n, 'приказ', 'приказа', 'приказов');

  const escapeHTML = (value) => String(value == null ? '' : value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  // ————————————————————————————————————————————— запуск

  const timers = new Set();
  const later = (fn, ms) => {
    const id = setTimeout(() => { timers.delete(id); fn(); }, ms);
    timers.add(id);
    return id;
  };
  function stopTimers() {
    for (const id of timers) clearTimeout(id);
    timers.clear();
  }

  function startKingdomsGame() {
    const container = document.getElementById('game-container');
    if (!container) return;
    const styleReady = injectStyles();
    stopTimers();
    container.innerHTML = '<div class="kd-wrap"><p style="padding:24px;text-align:center">Собираем царства…</p></div>';

    Promise.all([
      PARTS.reduce((chain, file) => chain.then(() => loadPart(file)), Promise.resolve()),
      styleReady,
    ])
      .then(() => { new Board(container).setup(); })
      .catch((error) => {
        console.error('«Царства» не запустились', error);
        container.innerHTML = '<div class="kd-wrap"><section class="kd-card"><h2>Не удалось открыть игру</h2>'
          + '<p>Правила не загрузились. Попробуйте вернуться в меню и открыть игру снова.</p>'
          + '<button type="button" class="kd-btn" data-back>В главное меню</button></section></div>';
        container.querySelector('[data-back]')?.addEventListener('click', () => {
          if (typeof goToMainMenu === 'function') goToMainMenu();
        });
      });
  }

  // ————————————————————————————————————————————— экран

  class Board {
    constructor(container, net = null) {
      this.root = container;
      this.net = net;
      this.R = window.KingdomsRules;
      this.E = window.KingdomsEngine;
      this.Bots = window.KingdomsBots;
      const layout = computeLayout(this.R);
      this.pos = layout.pos;
      this.regionCenter = layout.regionCenter;
      this.state = null;
      this.view = null;
      this.you = 0;
      this.pending = null;      // { kind } — приказ выбран, ждём область/связь
      this.scoutPicked = [];    // id приказов, отмеченных для разведки
      this.detailArea = null;
      this.skipAnim = false;
      this.revealSteps = [];
      this.zoom = { scale: 1, x: 0, y: 0 };
      this.pointer = null;
    }

    /* ——— начало: выбор режима ——— */
    setup(message = '') {
      this.net = null;
      stopTimers();
      this.tutorial = false;
      const seenTutorial = safeGet('kd_tutorial_seen');
      this.root.innerHTML = `
        <div class="kd-wrap">
          <section class="kd-card kd-setup">
            <div class="kd-hero"><span>СТРАТЕГИЯ ТАЙНЫХ ПРИКАЗОВ</span><h2>Царства</h2><p>Пять престолов. Одна история — ваша.</p></div>
            <p>Пять царств спорят за двадцать четыре области условного мира, вдохновлённого
              библейскими землями. Партия — пять раундов: каждый вы тайно размещаете приказы,
              а затем они раскрываются и разрешаются разом.</p>
            <div class="kd-modes">
              <button type="button" data-mode="solo">Против компьютера
                <small>один за столом, остальные — цари от игры</small></button>
              <button type="button" data-mode="online">По сети
                <small>комната на 2–5 человек</small></button>
            </div>
            <label class="kd-choice">
              <span>Участников</span>
              <div class="kd-choice--wide" data-count>
                ${[2, 3, 4, 5].map((n) => `<button type="button" data-value="${n}" aria-pressed="${n === 2}">${n}</button>`).join('')}
              </div>
              <small class="kd-choice-note" data-count-note></small>
            </label>
            <div class="kd-kingdom-preview" data-kingdom-preview></div>
            <div class="kd-row">
              <button type="button" class="kd-btn" data-resume hidden>Продолжить партию</button>
              <button type="button" class="kd-btn" data-start>Начать</button>
              <button type="button" class="kd-btn kd-btn--ghost" data-tutorial>${seenTutorial ? 'Обучение ещё раз' : 'Обучение на карте'}</button>
              <button type="button" class="kd-btn kd-btn--ghost" data-menu>В меню</button>
            </div>
            <p class="kd-note" data-message>${escapeHTML(message)}</p>
          </section>
        </div>`;
      this.playerCount = 2;
      const box = this.root.querySelector('[data-count]');
      const note = this.root.querySelector('[data-count-note]');
      const sayCount = () => {
        const bots = this.playerCount - 1;
        note.textContent = `Вы и ${bots} ${plural(bots, 'царь от игры', 'царя от игры', 'царей от игры')}.`;
      };
      box.addEventListener('click', (event) => {
        const button = event.target.closest('button[data-value]');
        if (!button) return;
        for (const one of box.querySelectorAll('button')) one.setAttribute('aria-pressed', String(one === button));
        this.playerCount = Number(button.dataset.value);
        sayCount();
      });
      sayCount();
      const saved = this.loadCampaign();
      const resume = this.root.querySelector('[data-resume]');
      resume.hidden = !saved;
      if (saved) resume.textContent = `Продолжить · раунд ${saved.round}`;
      resume.addEventListener('click', () => this.resumeCampaign(saved));
      this.root.querySelector('[data-kingdom-preview]').innerHTML = this.R.STARTING_LAYOUTS[5].map(id => {
        const k = this.R.kingdomOf(id);
        return `<div title="${escapeHTML(k.abilityText)}">${emblemHTML(k.emblem, 48)}<small>${escapeHTML(k.name)}</small></div>`;
      }).join('');
      this.root.querySelector('[data-start]').addEventListener('click', () => this.begin(this.playerCount));
      this.root.querySelector('[data-tutorial]').addEventListener('click', () => this.runTutorial());
      this.root.querySelector('[data-mode="online"]').addEventListener('click', () => {
        stopTimers();
        if (window.KingdomsOnline?.available?.()) {
          window.KingdomsOnline.open(this.root, { back: () => this.setup() });
        } else {
          this.setup('Игра по сети пока не настроена в этом выпуске — сыграйте против компьютера.');
        }
      });
      this.root.querySelector('[data-mode="solo"]').addEventListener('click', () => {
        this.root.querySelector('[data-start]').scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      });
      this.root.querySelector('[data-menu]').addEventListener('click', () => {
        if (typeof goToMainMenu === 'function') goToMainMenu();
      });
    }

    begin(playerCount) {
      const kingdomIds = this.R.STARTING_LAYOUTS[playerCount];
      const players = kingdomIds.map((id, seat) => (seat === 0
        ? { name: 'Вы', isBot: false }
        : { name: this.R.kingdomOf(id).name, isBot: true, botLevel: 'captain' }));
      this.state = this.E.createGame({ kingdomIds, players });
      this.you = 0;
      this.saveCampaign();
      this.refresh();
      this.buildBoard();
      this.renderAll();
      this.tick();
      window.KingdomsGame = { state: () => this.state, refresh: () => this.renderAll(), board: this };
    }

    saveCampaign() {
      if (this.net || !this.state || this.tutorial) return;
      try { localStorage.setItem(SAVE_KEY, JSON.stringify({ version: 3, state: this.state })); } catch { /* Хранилище может быть недоступно. */ }
    }

    loadCampaign() {
      try {
        const saved = JSON.parse(safeGet(SAVE_KEY) || safeGet('kd_campaign_v2'));
        const s = saved?.state;
        if (![2, 3].includes(saved?.version) || !s || !Array.isArray(s.players) || s.players.length < 2 || s.players.length > 5
          || !['planning', 'reveal', 'results', 'over'].includes(s.phase) || s.round < 1 || s.round > this.R.ROUNDS
          || !this.R.AREAS.every(a => s.areas?.[a.id]) || !Array.isArray(s.orders) || !Array.isArray(s.turnOrder)) return null;
        if (saved.version === 2) {
          // Старые партии не хранили мешок. Сохраняем поле и уже размещённые
          // приказы; остаток выдаём из нового мешка, исключив жетоны этого раунда.
          for (const area of this.R.AREAS) s.areas[area.id].veterans = 0;
          for (const player of s.players) {
            player.supply = Object.entries(this.R.TOKEN_SUPPLY).flatMap(([kind, count]) => Array(count).fill(kind));
            const placed = s.orders.filter(o => o.owner === player.id);
            for (const order of placed) {
              if (order.kind === 'feint') continue;
              const at = player.supply.indexOf(order.kind);
              if (at >= 0) player.supply.splice(at, 1);
            }
            player.hand = placed.some(o => o.kind === 'feint') ? [] : ['feint'];
            while (player.hand.length < Math.max(0, this.R.HAND_SIZE - placed.length) && player.supply.length) {
              const at = Math.floor(Math.random() * player.supply.length);
              player.hand.push(player.supply.splice(at, 1)[0]);
            }
          }
        }
        if (s.players.some(p => !Array.isArray(p.hand) || !Array.isArray(p.supply))) return null;
        s.random = Math.random;
        this.E.visibleStateFor(s, 0);
        return s;
      } catch { return null; }
    }

    resumeCampaign(state) {
      if (!state) return;
      stopTimers();
      this.state = state;
      this.you = 0;
      this.saveCampaign();
      this.refresh();
      this.buildBoard();
      this.renderAll();
      window.KingdomsGame = { state: () => this.state, refresh: () => this.renderAll(), board: this };
      if (state.status === 'over') this.finish();
      else if (state.phase === 'reveal') this.startReveal();
      else if (state.phase === 'results') this.showRoundSummary();
      else this.tick();
    }

    refresh() { if (this.state) this.view = this.E.visibleStateFor(this.state, this.you); }

    /* ——— каркас доски ——— */
    buildBoard() {
      const R = this.R;
      this.root.innerHTML = `
        <div class="kd-wrap">
          <header class="kd-header">
            <div class="kd-header-round">
              <b data-round></b>
              <span data-turn></span>
            </div>
            <div class="kd-header-right">
              <span class="kd-objective" data-objective></span>
              ${this.net ? '' : '<button type="button" class="kd-icon-btn" data-tutorial-open title="Обучение" aria-label="Обучение">?</button>'}
              <button type="button" class="kd-icon-btn" data-log title="Журнал событий">☰</button>
              <button type="button" class="kd-icon-btn" data-menu title="Главное меню">✕</button>
            </div>
          </header>
          <div class="kd-standings" data-standings></div>
          <div class="kd-body">
            <div class="kd-map-wrap">
              <div class="kd-map-toolbar">
                <button type="button" data-zoom-in aria-label="Приблизить">+</button>
                <button type="button" data-zoom-out aria-label="Отдалить">–</button>
                <button type="button" data-zoom-fit>Показать всю карту</button>
              </div>
              <div class="kd-map-scroll" data-scroll>
                <svg class="kd-map" data-svg viewBox="0 0 ${VIEW.w} ${VIEW.h}" xmlns="http://www.w3.org/2000/svg">
                  <image href="${window.KingdomsMap.base}" width="900" height="940" preserveAspectRatio="xMidYMid slice" class="kd-ground"/>
                  <g data-areas></g>
                  <g data-regions></g>
                  <g data-connections></g>
                  <g data-tokens></g>
                </svg>
              </div>
              <p class="kd-status" data-status></p>
            </div>
            <aside class="kd-panel">
              <div class="kd-panel-heading"><span>ВОЕННЫЙ СОВЕТ</span><h3>Ваши приказы</h3></div>
              <div class="kd-orders" data-orders></div>
              <div class="kd-confirm" data-confirm hidden>
                <p data-confirm-text></p>
                <div class="kd-row">
                  <button type="button" class="kd-btn" data-confirm-ok>Подтвердить</button>
                  <button type="button" class="kd-btn kd-btn--ghost" data-confirm-cancel>Отмена</button>
                </div>
              </div>
              <p class="kd-orders-left" data-orders-left></p>
              <button type="button" class="kd-btn kd-btn--ghost" data-pass>Пропустить ход</button>
              <button type="button" class="kd-btn kd-btn--ghost" data-skip-reveal hidden>Пропустить анимацию</button>
              <div class="kd-intel" data-intel></div>
            </aside>
            <section class="kd-teach" data-teach hidden aria-live="polite">
              <div class="kd-teach-progress"><span data-teach-count></span><span>ЦАРСТВА · ОБУЧЕНИЕ</span></div>
              <div class="kd-teach-track"><span data-teach-progress></span></div>
              <h3 data-teach-title></h3>
              <p data-teach-text></p>
              <div class="kd-teach-hand" data-teach-hand hidden></div>
              <p class="kd-teach-hint" data-teach-hint></p>
              <div class="kd-teach-actions">
                <button type="button" class="kd-btn kd-btn--ghost" data-teach-back>Назад</button>
                <button type="button" class="kd-btn" data-teach-next>Дальше</button>
              </div>
              <button type="button" class="kd-teach-skip" data-teach-skip>Пропустить обучение</button>
            </section>
          </div>
        </div>
        <div class="kd-sheet-root" data-sheet-root></div>`;

      const on = (name, fn) => this.root.querySelector(`[data-${name}]`)?.addEventListener('click', fn);
      on('menu', () => {
        stopTimers();
        if (this.net) { this.net.leave(); return; }
        if (typeof goToMainMenu === 'function') goToMainMenu();
      });
      on('log', () => this.openLog());
      on('tutorial-open', () => this.runTutorial());
      on('skip-reveal', () => this.skipAnimation());
      on('pass', () => {
        if (this.view.phase !== 'planning' || this.view.turn !== this.you) return;
        const sheet = this.openSheet('<h3>Пропустить ход?</h3><p>Вы откажетесь от одного размещения в этом раунде. Остальные приказы сохранятся.</p><button class="kd-btn" data-pass-ok>Пропустить</button><button class="kd-btn kd-btn--ghost" data-cancel>Вернуться</button>');
        sheet.querySelector('[data-pass-ok]').addEventListener('click', () => {
          sheet.remove(); this.pending = null;
          if (this.net) this.net.send('skipTurn');
          else { this.E.skipTurn(this.state, this.you); this.afterLocalChange(); }
        });
      });
      on('zoom-in', () => this.setZoom(this.zoom.scale * 1.25));
      on('zoom-out', () => this.setZoom(this.zoom.scale / 1.25));
      on('zoom-fit', () => this.fitZoom());
      this.mountPan();

      for (const order of R.ORDERS) {
        this.root.querySelector('[data-orders]').insertAdjacentHTML('beforeend', `
          <button type="button" class="kd-order-btn" data-order="${order.id}">
            ${orderIconHTML(order.id)}
            <span class="kd-order-title">${order.title}${order.force ? ` ${order.force}` : ''}</span>
            <span class="kd-order-text">${order.text}</span>
          </button>`);
      }
      this.root.querySelectorAll('[data-order]').forEach((button) => {
        button.addEventListener('click', () => this.selectOrder(button.dataset.order));
      });
      this.root.querySelector('[data-confirm-ok]').addEventListener('click', () => this.confirmPending());
      this.root.querySelector('[data-confirm-cancel]').addEventListener('click', () => this.cancelPending());

      this.buildAreas();
      this.buildRegions();
      this.autoZoom();
    }

    buildRegions() {
      const R = this.R;
      const box = this.root.querySelector('[data-regions]');
      box.innerHTML = R.REGIONS.map((region) => {
        const c = this.regionCenter.get(region.id);
        return `<g class="kd-region" data-region="${region.id}">

          <text x="${c.x}" y="${c.y + 6}" class="kd-region-label">${escapeHTML(region.name)}</text>
        </g>`;
      }).join('');
    }

    buildAreas() {
      const R = this.R;
      const connBox = this.root.querySelector('[data-connections]');
      connBox.innerHTML = R.EDGES.map((edge) => {
        const a = this.pos.get(edge.a);
        const b = this.pos.get(edge.b);
        return `<line class="kd-edge kd-edge--${edge.type}" data-edge="${edge.a}|${edge.b}"
          data-a="${edge.a}" data-b="${edge.b}"
          x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}"></line>`;
      }).join('');
      connBox.querySelectorAll('[data-edge]').forEach((line) => {
        line.addEventListener('click', () => this.tapEdge(line.dataset.a, line.dataset.b));
      });

      const areaBox = this.root.querySelector('[data-areas]');
      areaBox.innerHTML = R.AREAS.map((area) => {
        const p = this.pos.get(area.id);
        const tile = window.KingdomsMap.tiles[area.id];
        const outline = tile.points.map(([x,y],i) => `${i ? 'L' : 'M'}${x-p.x},${y-p.y}`).join(' ') + 'Z';
        const words = area.name.split(' ');
        const label = words.length > 1 ? `<tspan x="0" dy="0">${escapeHTML(words.slice(0,-1).join(' '))}</tspan><tspan x="0" dy="20">${escapeHTML(words.at(-1))}</tspan>` : escapeHTML(area.name);
        return `<g class="kd-area" data-area="${area.id}" transform="translate(${p.x},${p.y})" tabindex="0" role="button">
          <image class="kd-area-art" href="${tile.file}" x="${tile.x-p.x}" y="${tile.y-p.y}" width="${tile.w}" height="${tile.h}" preserveAspectRatio="none"/>
          <path class="kd-area-fill" d="${outline}"></path>
          <path class="kd-area-border-halo" d="${outline}"></path>
          <path class="kd-area-ring" d="${outline}"></path>
          <g class="kd-area-marker">
            <rect x="-29" y="-23" width="58" height="31" rx="7"/>
            <image data-owner-emblem x="-24" y="-21" width="26" height="26"/>
            <text class="kd-area-value" x="15" y="0">${area.value}</text>
            ${area.capitalOf ? '<g class="kd-area-crown" transform="translate(0,-32)"><path d="M-8 0 -5-8 0-2 5-8 8 0Z" /></g>' : ''}
            <g class="kd-area-fortify" data-fortify transform="translate(-12,15)"></g>
            <g class="kd-area-veterans" data-veterans transform="translate(21,18)"></g>
            <text class="kd-area-name" y="34">${label}</text>
          </g>
          <title>${escapeHTML(area.name)}</title>
        </g>`;
      }).join('');
      areaBox.querySelectorAll('[data-area]').forEach((group) => {
        group.addEventListener('click', () => this.tapArea(group.dataset.area));
        group.addEventListener('keydown', (event) => {
          if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); this.tapArea(group.dataset.area); }
        });
      });
    }

    /*
      ——— панорама и масштаб ———

      Палец захватывается (setPointerCapture) только когда движение и
      правда случилось — не на каждое нажатие. Иначе обычный тап по области
      или связи перехватывается прокруткой раньше, чем до него доходит
      собственный обработчик клика, и карта становится нажимаемой на вид, но
      не на деле.
    */
    mountPan() {
      const scroll = this.root.querySelector('[data-scroll]');
      const svg = this.root.querySelector('[data-svg]');
      const pointers = new Map();
      let gesture = null;
      let suppressClick = false;
      const clamp = () => {
        const width = scroll.clientWidth; const height = scroll.clientHeight;
        const maxX = (this.zoom.scale - 1) * width / 2;
        const maxY = (this.zoom.scale - 1) * height / 2;
        this.zoom.x = Math.max(-maxX, Math.min(maxX, this.zoom.x));
        this.zoom.y = Math.max(-maxY, Math.min(maxY, this.zoom.y));
      };
      const apply = () => {
        clamp();
        svg.style.transform = `translate(${this.zoom.x}px,${this.zoom.y}px) scale(${this.zoom.scale})`;
      };
      this.applyZoom = apply;
      this.clampZoom = clamp;
      scroll.addEventListener('click', (event) => {
        if (!suppressClick) return;
        event.preventDefault(); event.stopImmediatePropagation(); suppressClick = false;
      }, true);
      const snapshot = () => {
        const points = [...pointers.values()];
        const center = points.length === 2 ? { x: (points[0].x + points[1].x) / 2,
          y: (points[0].y + points[1].y) / 2 } : points[0];
        gesture = { center, distance: points.length === 2 ? Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y) : 0,
          scale: this.zoom.scale, x: this.zoom.x, y: this.zoom.y, moved: false };
      };
      scroll.addEventListener('pointerdown', (event) => {
        if (event.pointerType === 'mouse' && event.button !== 0) return;
        pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
        if (pointers.size <= 2) snapshot();
      });
      scroll.addEventListener('pointermove', (event) => {
        if (!pointers.has(event.pointerId) || !gesture) return;
        pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
        const points = [...pointers.values()];
        if (points.length > 2) return;
        const center = points.length === 2 ? { x: (points[0].x + points[1].x) / 2,
          y: (points[0].y + points[1].y) / 2 } : points[0];
        if (!gesture.moved && points.length === 1 && Math.hypot(center.x - gesture.center.x, center.y - gesture.center.y) < 7) return;
        gesture.moved = true; suppressClick = true;
        svg.classList.add('is-panning');
        try { scroll.setPointerCapture(event.pointerId); } catch { /* палец уже отпущен */ }
        const nextScale = points.length === 2 ? Math.max(1, Math.min(3.2, gesture.scale *
          Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y) / Math.max(1, gesture.distance))) : gesture.scale;
        const rect = scroll.getBoundingClientRect();
        const originX = gesture.center.x - rect.left - rect.width / 2;
        const originY = gesture.center.y - rect.top - rect.height / 2;
        this.zoom.scale = nextScale;
        this.zoom.x = center.x - gesture.center.x + gesture.x * (nextScale / gesture.scale) + originX * (1 - nextScale / gesture.scale);
        this.zoom.y = center.y - gesture.center.y + gesture.y * (nextScale / gesture.scale) + originY * (1 - nextScale / gesture.scale);
        apply();
      });
      const endDrag = (event) => {
        if (!pointers.has(event.pointerId)) return;
        pointers.delete(event.pointerId);
        if (pointers.size) snapshot();
        else { gesture = null; svg.classList.remove('is-panning'); }
        try { scroll.releasePointerCapture(event.pointerId); } catch { /* отпущен */ }
        if (suppressClick) window.setTimeout(() => { suppressClick = false; }, 120);
      };
      scroll.addEventListener('pointerup', endDrag);
      scroll.addEventListener('pointercancel', endDrag);
      scroll.addEventListener('wheel', (event) => {
        event.preventDefault();
        this.setZoom(this.zoom.scale * (event.deltaY < 0 ? 1.15 : 1 / 1.15), event.clientX, event.clientY);
      }, { passive: false });
    }

    setZoom(scale, clientX, clientY) {
      const rect = this.root.querySelector('[data-scroll]')?.getBoundingClientRect();
      const previous = this.zoom.scale;
      this.zoom.scale = Math.max(1, Math.min(3.2, scale));
      if (rect && previous) {
        const x = (clientX ?? rect.left + rect.width / 2) - rect.left - rect.width / 2;
        const y = (clientY ?? rect.top + rect.height / 2) - rect.top - rect.height / 2;
        const ratio = this.zoom.scale / previous;
        this.zoom.x = x - (x - this.zoom.x) * ratio;
        this.zoom.y = y - (y - this.zoom.y) * ratio;
      }
      this.applyZoom?.();
    }

    fitZoom() {
      this.zoom = { scale: 1, x: 0, y: 0 };
      this.applyZoom?.();
    }

    /* На маленьком экране слегка приближаем всю карту, сохраняя масштаб касания. */
    autoZoom() {
      const scroll = this.root.querySelector('[data-scroll]');
      const rect = scroll?.getBoundingClientRect();
      if (!rect || !rect.width || !rect.height) { this.fitZoom(); return; }
      const fitScale = Math.min(rect.width / VIEW.w, rect.height / VIEW.h);
      const minTouchRadiusPx = 22; // половина рекомендованных ~44px на палец
      const needed = minTouchRadiusPx / (AREA_RADIUS * fitScale);
      this.zoom = { scale: Math.max(1, Math.min(3.2, needed)), x: 0, y: 0 };
      /*
        Первый наезд не едет, а появляется сразу: .kd-map плавно переезжает
        между масштабами по правилу в таблице стилей (transition), но это
        правило для смены масштаба игроком, а не для самого первого кадра —
        первый кадр обязан прийти уже в нужном размере, а не проехать до него
        за то же время, что и нажатие «+».
      */
      const svg = this.root.querySelector('[data-svg]');
      if (svg) svg.style.transition = 'none';
      this.applyZoom?.();
      if (svg) requestAnimationFrame(() => { svg.style.transition = ''; });
    }

    /* ——— перерисовка ——— */
    renderAll() {
      if (!this.view) return;
      this.renderHeader();
      this.renderStandings();
      this.renderAreas();
      this.renderTokens();
      this.renderOrders();
      this.renderStatus();
      this.renderConfirm();
    }

    renderHeader() {
      const v = this.view;
      const R = this.R;
      this.root.querySelector('[data-round]').textContent = `Раунд ${v.round} из ${R.ROUNDS}`;
      const turnBox = this.root.querySelector('[data-turn]');
      if (v.phase === 'planning') {
        turnBox.textContent = v.turn === v.you ? 'Ваш ход' : `Ходит ${nameOf(v, v.turn)}`;
      } else if (v.phase === 'reveal' || v.phase === 'results') {
        turnBox.textContent = 'Раскрытие приказов';
      } else {
        turnBox.textContent = '';
      }
      const me = v.players[v.you];
      const objective = R.objectiveOf(me?.objectiveId);
      this.root.querySelector('[data-objective]').textContent = objective
        ? `Цель: ${objective.title} (${objective.points})` : 'Режим наблюдателя';
    }

    renderStandings() {
      const v = this.view;
      this.root.querySelector('[data-standings]').innerHTML = v.players.map(p => {
        const k = this.R.kingdomOf(p.kingdomId);
        const areas = this.R.AREAS.filter(a => v.areas[a.id].owner === p.id);
        const points = areas.reduce((sum, a) => sum + a.value + (v.areas[a.id].veterans || 0), 0) + this.R.REGIONS.filter(r =>
          this.R.AREAS.filter(a => a.region === r.id).every(a => v.areas[a.id].owner === p.id)).length * this.R.REGION_BONUS;
        return `<div class="kd-standing ${p.id === v.turn ? 'is-turn' : ''}" style="--owner:${k.color}">
          ${emblemHTML(k.emblem, 36)}<span><b>${p.id === v.you ? 'Вы' : escapeHTML(k.name)}</b><small>${areas.length} обл. · ${points} очк.${p.eliminated ? ' · наблюдатель' : ''}</small></span></div>`;
      }).join('');
      const intel = v.scoutIntel.filter(i => i.atRound === v.round);
      this.root.querySelector('[data-intel]').innerHTML = intel.length ? '<b>Донесения разведки</b>' + intel.map(i =>
        `<p>${escapeHTML(this.R.areaOf(i.area)?.name || '')}: ${escapeHTML(this.R.orderOf(i.kind).title)}${i.to ? ' → ' + escapeHTML(this.R.areaOf(i.to).name) : ''}</p>`).join('') : '';
    }

    kingdomColor(seat) {
      if (seat === null || seat === undefined) return this.R.NEUTRAL_COLOR;
      const kingdomId = this.view.players[seat]?.kingdomId;
      return this.R.kingdomOf(kingdomId)?.color || this.R.NEUTRAL_COLOR;
    }

    renderAreas() {
      const v = this.view;
      const eligible = this.eligibleAreas();
      for (const area of this.R.AREAS) {
        const group = this.root.querySelector(`[data-area="${area.id}"]`);
        if (!group) continue;
        const cell = v.areas[area.id];
        const color = this.kingdomColor(cell.owner);
        group.style.setProperty('--owner', color);
        const emblem = group.querySelector('[data-owner-emblem]');
        emblem.style.display = cell.owner === null ? 'none' : '';
        if (cell.owner !== null) emblem.setAttribute('href', EMBLEM_ART[v.players[cell.owner].kingdomId]);
        group.setAttribute('aria-label', `${area.name}, ${cell.owner === null ? 'нейтральная' : nameOf(v, cell.owner)}, ценность ${area.value}`);
        group.classList.toggle('is-mine', cell.owner === v.you);
        group.classList.toggle('is-neutral', cell.owner === null);
        group.classList.toggle('is-eligible', eligible.has(area.id));
        group.classList.toggle('is-selected', this.pending?.area === area.id);
        const fortifyBox = group.querySelector('[data-fortify]');
        fortifyBox.innerHTML = Array.from({ length: cell.fortify }, (_, i) => `<circle cx="${i * 9}" cy="0" r="3"></circle>`).join('');
        group.querySelector('[data-veterans]').innerHTML = cell.veterans
          ? `<rect x="-16" y="-10" width="32" height="20" rx="7"/><text text-anchor="middle" y="5">⚔ ${cell.veterans}</text>` : '';
      }
    }

    /*
      Какие области сейчас можно нажать. Пусто, если приказ ещё не выбран —
      тогда нажатие на любую область просто открывает её карточку.
    */
    eligibleAreas() {
      const set = new Set();
      if (!this.pending || this.pending.kind === 'scout') return set;
      const order = this.R.orderOf(this.pending.kind);
      const v = this.view;
      if (order.slot === 'internal') {
        for (const area of this.R.AREAS) {
          if (v.areas[area.id].owner !== v.you) continue;
          if (this.hasOwnSlotOrder(area.id, 'internal')) continue;
          if (order.id === 'fortify' && v.areas[area.id].fortify >= this.R.fortifyCapFor(v.players[v.you].kingdomId, area)) continue;
          set.add(area.id);
        }
      }
      if (order.slot === 'outgoing') {
        for (const key of this.eligibleEdgeKeys()) {
          const [a, b] = key.split('|');
          if (!this.pending.from) { set.add(a); set.add(b); }
          else if (a === this.pending.from) set.add(b);
          else if (b === this.pending.from) set.add(a);
        }
      }
      return set;
    }

    hasOwnSlotOrder(areaId, slot) {
      return this.view.orders.some((one) => one.owner === this.view.you && one.area === areaId
        && this.R.orderOf(one.kind).slot === slot && one.kind);
    }

    eligibleEdgeKeys() {
      const set = new Set();
      if (!this.pending || this.pending.kind === 'scout') return set;
      const order = this.R.orderOf(this.pending.kind);
      if (order.slot !== 'outgoing') return set;
      const v = this.view;
      for (const edge of this.R.EDGES) {
        if (edge.type !== order.edge) continue;
        const fromMine = v.areas[edge.a].owner === v.you && v.areas[edge.b].owner !== v.you;
        const toMine = v.areas[edge.b].owner === v.you && v.areas[edge.a].owner !== v.you;
        if (!fromMine && !toMine) continue;
        const sourceArea = fromMine ? edge.a : edge.b;
        if (this.hasOwnSlotOrder(sourceArea, 'outgoing')) continue;
        set.add(`${edge.a}|${edge.b}`);
      }
      return set;
    }

    renderTokens() {
      const v = this.view;
      const box = this.root.querySelector('[data-tokens]');
      const eligibleEdges = this.eligibleEdgeKeys();
      this.root.querySelectorAll('[data-edge]').forEach((line) => {
        const key = line.dataset.a < line.dataset.b ? `${line.dataset.a}|${line.dataset.b}` : `${line.dataset.b}|${line.dataset.a}`;
        line.classList.toggle('is-eligible', eligibleEdges.has(key) || eligibleEdges.has(`${line.dataset.a}|${line.dataset.b}`));
      });
      box.innerHTML = v.orders.map((order) => {
        const intel = v.scoutIntel.find(i => i.atRound === v.round && i.orderId === order.id);
        if (!order.kind && intel) order = { ...order, kind: intel.kind };
        const known = Boolean(order.kind);
        const mine = order.owner === v.you;
        const color = this.kingdomColor(order.owner);
        const scoutable = this.pending?.kind === 'scout' && !mine && !known;
        const picked = this.scoutPicked.includes(order.id);
        let x; let y;
        if (order.to) {
          const a = this.pos.get(order.area);
          const b = this.pos.get(order.to);
          x = a.x + (b.x - a.x) * 0.48;
          y = a.y + (b.y - a.y) * 0.48;
        } else if (order.area) {
          const a = this.pos.get(order.area);
          x = a.x + 39; y = a.y - 19;
        } else return '';
        const icon = `<image href="${orderArt(known ? order.kind : 'closed')}" x="-22" y="-22" width="44" height="44"/>`;
        const force = known && this.R.orderOf(order.kind).force ? `<g class="kd-token-strength"><circle cx="26" cy="-25" r="12"/><text x="26" y="-20" class="kd-token-force">${this.E.forceOf(this.state || { players: v.players.map((p) => ({ kingdomId: p.kingdomId })) }, order)}</text></g>` : '';
        return `<g class="kd-token${mine ? ' is-mine' : ''}${scoutable ? ' is-scoutable' : ''}${picked ? ' is-picked' : ''}"
          data-token="${order.id}" style="--owner:${color}" transform="translate(${x},${y})">
          <circle class="kd-token-shadow" r="34"></circle><circle class="kd-token-face" r="30"></circle>${icon}${force}
        </g>`;
      }).join('');
      box.querySelectorAll('[data-token]').forEach((node) => {
        node.addEventListener('click', (event) => { event.stopPropagation(); this.tapToken(node.dataset.token); });
      });
    }

    renderOrders() {
      const v = this.view;
      this.root.querySelector('[data-skip-reveal]').hidden = !['reveal', 'results'].includes(v.phase);
      const myTurn = v.phase === 'planning' && v.turn === v.you;
      this.root.querySelector('[data-pass]').disabled = !myTurn;
      this.root.querySelectorAll('[data-order]').forEach((button) => {
        const kind = button.dataset.order;
        button.classList.toggle('is-active', this.pending?.kind === kind);
        const count = v.hand?.filter((one) => one === kind).length || 0;
        button.dataset.count = count;
        button.disabled = !myTurn || v.ordersPlaced >= v.ordersLimit || !count;
        if (kind === 'scout') button.disabled = button.disabled || !v.orders.some((one) => one.owner !== v.you && !one.kind
          && !v.scoutIntel.some(i => i.atRound === v.round && i.orderId === one.id));
        else if (!button.disabled) {
          const definition = this.R.orderOf(kind);
          button.disabled = !this.R.AREAS.some(a => {
            if (v.areas[a.id].owner !== v.you || this.hasOwnSlotOrder(a.id, definition.slot)) return false;
            if (definition.slot === 'internal') return kind !== 'fortify' || v.areas[a.id].fortify < this.R.fortifyCapFor(v.players[v.you].kingdomId, a);
            return this.R.EDGES.some(e => e.type === definition.edge &&
              ((e.a === a.id && v.areas[e.b].owner !== v.you) || (e.b === a.id && v.areas[e.a].owner !== v.you)));
          });
        }
      });
      this.root.querySelector('[data-orders-left]').textContent = myTurn
        ? `Размещено ${v.ordersPlaced} из ${v.ordersLimit}. В руке ${v.hand.length} жетонов · в запасе ${v.supplyRemaining}. Один сохранится на следующий раунд.`
        : `В руке ${v.hand?.length || 0} жетонов · в запасе ${v.supplyRemaining || 0}`;
    }

    renderStatus() {
      const v = this.view;
      const box = this.root.querySelector('[data-status]');
      if (v.phase !== 'planning') { box.textContent = ''; return; }
      if (v.turn !== v.you) { box.textContent = `Ходит ${nameOf(v, v.turn)}…`; return; }
      if (!this.pending) { box.textContent = 'Выберите приказ, затем область или связь на карте.'; return; }
      const order = this.R.orderOf(this.pending.kind);
      if (order.slot === 'internal') box.textContent = 'Нажмите свою область, подсвеченную на карте.';
      else if (order.slot === 'outgoing') box.textContent = this.pending.from ? 'Выберите подсвеченную цель похода.' : 'Выберите свою область, затем цель. Можно нажать на дорогу.';
      else if (order.id === 'scout') {
        const limit = v.players[v.you].kingdomId === 'kedem' ? 2 : 1;
        box.textContent = `Нажмите закрытый чужой приказ на карте (можно выбрать до ${limit}).`;
      }
    }

    renderConfirm() {
      const bar = this.root.querySelector('[data-confirm]');
      const ready = this.pendingReady();
      bar.hidden = !ready;
      if (!ready) return;
      const text = this.root.querySelector('[data-confirm-text]');
      const order = this.R.orderOf(this.pending.kind);
      if (order.slot === 'internal') {
        text.textContent = `${order.title}: «${this.R.areaOf(this.pending.area).name}».`;
      } else if (order.slot === 'outgoing') {
        const placement = { kind: order.id, owner: this.you, area: this.pending.from, to: this.pending.area };
        const force = this.E.forceOf(this.view, placement);
        const support = this.view.orders.filter(o => o.owner === this.you && o.to === placement.to && o.kind && o.kind !== 'feint')
          .reduce((sum, o) => sum + this.E.forceOf(this.view, o), 0);
        const defense = this.E.defenseOf(this.view, placement.to, false).total;
        text.textContent = `${this.R.areaOf(placement.area).name} → ${this.R.areaOf(placement.to).name}. `
          + (order.id === 'feint' ? 'Отвлечение: не захватывает область.' : `Сила ${force}${support ? ` + поддержка ${support}` : ''} против открытой защиты ${defense}. `
          + (force + support > defense ? 'Силы достаточно, если защита не усилится.' : 'Нужна поддержка: для захвата сила должна быть выше защиты.'))
          + ' Тайные приказы соперника могут изменить исход.';
      } else if (order.id === 'scout') {
        text.textContent = `Разведать: ${this.scoutPicked.length} из ${this.view.players[this.view.you].kingdomId === 'kedem' ? 2 : 1}.`;
      }
    }

    pendingReady() {
      if (!this.pending) return false;
      const order = this.R.orderOf(this.pending.kind);
      if (order.slot === 'internal') return Boolean(this.pending.area);
      if (order.slot === 'outgoing') return Boolean(this.pending.area && this.pending.from);
      if (order.id === 'scout') return this.scoutPicked.length > 0;
      return false;
    }

    /* ——— выбор приказа и цели ——— */
    selectOrder(kind) {
      if (this.tutorial) return;
      if (this.view.turn !== this.view.you || this.view.phase !== 'planning' || this.view.you < 0) return;
      this.pending = this.pending?.kind === kind ? null : { kind };
      this.scoutPicked = [];
      this.renderAll();
    }

    cancelPending() {
      this.pending = null;
      this.scoutPicked = [];
      this.renderAll();
    }

    tapArea(areaId) {
      if (this.tutorial) return;
      if (this.pending && this.R.orderOf(this.pending.kind).slot === 'outgoing' && this.eligibleAreas().has(areaId)) {
        if (this.view.areas[areaId].owner === this.you) {
          this.pending.from = areaId; this.pending.area = null; this.renderAll(); return;
        }
        if (this.pending.from) { this.tapEdge(this.pending.from, areaId); return; }
        const sources = [...this.eligibleEdgeKeys()].map(key => key.split('|')).filter(pair => pair.includes(areaId));
        if (sources.length === 1) { this.tapEdge(...sources[0]); return; }
        this.flashStatus('Сначала выберите свою область — источник похода.'); return;
      }
      if (this.pending && this.R.orderOf(this.pending.kind).slot === 'internal' && this.eligibleAreas().has(areaId)) {
        this.pending.area = areaId;
        this.renderAll();
        return;
      }
      this.openAreaDetail(areaId);
    }

    tapEdge(a, b) {
      if (this.tutorial) return;
      if (!this.pending) return;
      const order = this.R.orderOf(this.pending.kind);
      if (order.slot !== 'outgoing') return;
      const v = this.view;
      let from = null; let to = null;
      if (v.areas[a].owner === v.you && v.areas[b].owner !== v.you) { from = a; to = b; }
      else if (v.areas[b].owner === v.you && v.areas[a].owner !== v.you) { from = b; to = a; }
      if (!from) return;
      if (this.R.edgeType(from, to) !== order.edge) return;
      if (this.hasOwnSlotOrder(from, 'outgoing')) return;
      this.pending.from = from;
      this.pending.area = to;
      this.renderAll();
    }

    tapToken(orderId) {
      if (this.tutorial) return;
      if (!this.pending || this.pending.kind !== 'scout') return;
      const order = this.view.orders.find((one) => one.id === orderId);
      if (!order || order.owner === this.view.you || order.kind || this.view.scoutIntel.some(i => i.atRound === this.view.round && i.orderId === order.id)) return;
      const limit = this.view.players[this.view.you].kingdomId === 'kedem' ? 2 : 1;
      const at = this.scoutPicked.indexOf(orderId);
      if (at >= 0) this.scoutPicked.splice(at, 1);
      else if (this.scoutPicked.length < limit) this.scoutPicked.push(orderId);
      this.renderAll();
    }

    confirmPending() {
      if (!this.pendingReady()) return;
      const order = this.R.orderOf(this.pending.kind);
      const placement = order.id === 'scout'
        ? { kind: 'scout', scoutTargets: [...this.scoutPicked] }
        : order.slot === 'internal'
          ? { kind: order.id, area: this.pending.area }
          : { kind: order.id, area: this.pending.from, to: this.pending.area };
      this.pending = null;
      this.scoutPicked = [];
      if (this.net) { this.net.send('placeOrder', placement); return; }
      try {
        this.E.placeOrder(this.state, this.you, placement);
      } catch (error) {
        this.flashStatus(error.message);
      }
      this.afterLocalChange();
    }

    flashStatus(text) {
      const box = this.root.querySelector('[data-status]');
      if (box) box.textContent = text;
      later(() => this.renderStatus(), 2200);
    }

    /* ——— карточка области ——— */
    openAreaDetail(areaId) {
      const area = this.R.areaOf(areaId);
      const v = this.view;
      const cell = v.areas[areaId];
      const owner = cell.owner === null ? 'Никому не принадлежит' : nameOf(v, cell.owner);
      const region = this.R.REGIONS.find((r) => r.id === area.region);
      const sheet = this.openSheet(`
        <img class="kd-detail-art" src="${AREA_ART[area.id]}" alt="${escapeHTML(area.name)}">
        <h3>${escapeHTML(area.name)}</h3>
        <p class="kd-note">${escapeHTML(region.name)} · ${TERRAIN_NAMES[area.terrain]}${area.city ? ' · город' : ''}${area.capitalOf ? ' · столица' : ''}</p>
        <div class="kd-detail-rows">
          <div><span>Хозяин</span><b>${escapeHTML(owner)}</b></div>
          <div><span>Ценность</span><b>${area.value}</b></div>
          <div><span>Открытая защита</span><b>${this.E.defenseOf(v, areaId, false).total}</b></div>
          <div><span>Укрепление</span><b>${cell.fortify}</b></div>
          <div><span>Ветераны обороны</span><b>${cell.veterans || 0} · +${cell.veterans || 0} к защите и очкам</b></div>
        </div>
        <button type="button" class="kd-btn kd-btn--ghost" data-cancel>Закрыть</button>
      `);
      void sheet;
    }

    openSheet(html) {
      const root = this.root.querySelector('[data-sheet-root]') || document.body;
      // Одна карточка поверх экрана за раз: без этого повторный вызов (сеть
      // прислала тот же вид дважды, или итоги раунда спросили ещё раз) копит
      // прозрачные слои друг на друге, и кнопка под верхним перестаёт нажиматься.
      root.querySelectorAll('.kd-sheet').forEach((node) => node.remove());
      const sheet = document.createElement('div');
      sheet.className = 'kd-sheet';
      sheet.innerHTML = `<div class="kd-sheet-card">${html}</div>`;
      sheet.addEventListener('click', (event) => {
        if (event.target.closest('[data-cancel]') || (event.target === sheet && sheet.querySelector('[data-cancel]'))) sheet.remove();
      });
      root.appendChild(sheet);
      return sheet;
    }

    openLog() {
      const lines = this.view.log.slice().reverse()
        .map((line) => `<div class="kd-log-line"><b>Р${line.round}</b> ${escapeHTML(line.text)}</div>`).join('')
        || '<p class="kd-note">Событий пока не было.</p>';
      this.openSheet(`<h3>Журнал событий</h3><div class="kd-log">${lines}</div>
        <button type="button" class="kd-btn kd-btn--ghost" data-cancel>Закрыть</button>`);
    }

    /* ——— ход соперников от игры (локальный режим) ——— */
    afterLocalChange() {
      this.saveCampaign();
      this.refresh();
      this.renderAll();
      if (this.view.phase === 'reveal') { this.startReveal(); return; }
      this.tick();
    }

    tick() {
      if (this.net) return;
      const v = this.view;
      if (v.phase !== 'planning') return;
      if (v.turn === this.you || v.turn < 0) return;
      const seat = v.turn;
      later(() => {
        if (!this.state || this.E.currentTurn(this.state) !== seat) return;
        const choice = this.Bots.pick(this.state, seat);
        try {
          if (choice) this.E.placeOrder(this.state, seat, choice);
          else this.E.skipTurn(this.state, seat);
        } catch { this.E.skipTurn(this.state, seat); }
        this.afterLocalChange();
      }, 500 + Math.random() * 400);
    }

    /* ——— раскрытие ———
       По сети раунд разрешает сервер: клиенту остаётся не пересчитать бой
       заново, а только проиграть уже готовый разбор (view.lastResolution)
       той же самой анимацией, что и в локальной партии. */
    startReveal() {
      if (this.net) return;
      this.E.resolveRound(this.state);
      this.saveCampaign();
      this.refresh();
      this.beginRevealAnimation();
    }

    beginRevealAnimation() {
      this.revealSteps = (this.view.lastResolution || []).slice();
      this.renderAll();
      this.renderRevealShell();
      if (reduceMotion() || this.skipAnim) { this.finishReveal(); return; }
      this.showNextReveal();
    }

    /* ——— вид от сервера (сетевой режим) ——— */
    applyView(view) {
      const firstTime = !this.view;
      const wasResolved = this.view && ['results', 'over'].includes(this.view.phase);
      const resolved = ['results', 'over'].includes(view.phase);
      const sameRound = this.view?.round === view.round;
      const keepSelection = sameRound && this.view?.phase === 'planning' && view.phase === 'planning'
        && this.view.you === view.you && this.view.turn === view.turn && view.turn === view.you
        && this.view.cycle === view.cycle;
      this.view = view;
      this.you = view.you;
      if (firstTime) this.buildBoard();
      if (resolved && (!wasResolved || !sameRound)) { this.beginRevealAnimation(); return; }
      if (resolved && wasResolved && sameRound) {
        const next = this.root.querySelector('[data-next]');
        if (next && view.status !== 'over') {
          const mayAdvance = !this.net || this.net.isHost?.();
          next.disabled = !mayAdvance;
          next.textContent = mayAdvance ? 'Следующий раунд' : 'Ожидаем хозяина комнаты…';
        }
        return;
      }
      if (!sameRound) {
        stopTimers();
        this.root.querySelectorAll('.kd-sheet').forEach(node => node.remove());
      }
      if (!keepSelection) { this.pending = null; this.scoutPicked = []; }
      this.renderAll();
      if (view.status === 'over') later(() => this.finish(), 400);
    }

    renderRevealShell() {
      this.root.querySelector('[data-skip-reveal]').hidden = false;
      const box = this.root.querySelector('[data-status]');
      if (box) box.textContent = 'Раскрытие приказов…';
      this.renderAreas();
    }

    showNextReveal() {
      const line = this.revealSteps.shift();
      if (!line) { this.finishReveal(); return; }
      const area = this.R.areaOf(line.area);
      const group = this.root.querySelector(`[data-area="${line.area}"]`);
      group?.classList.add('is-resolving');
      const attackers = line.attackers.map((a) => `${nameOf(this.view, a.seat)}: сила ${a.total}`).join('; ');
      const d = line.defense;
      const box = this.root.querySelector('[data-status]');
      if (box) {
        box.textContent = `«${area.name}»: защита ${d.total} (1 + укрепление ${d.fortify} + ветераны ${d.veterans || 0} + стража ${d.guard}`
          + ` + местность ${d.terrain} + способность ${d.ability}) против ${attackers || '—'}. `
          + (line.outcome === 'captured' ? `Берёт ${nameOf(this.view, line.newOwner)}.`
            : line.outcome === 'standoff' ? 'Ничья — хозяин не меняется.' : 'Область устояла.');
      }
      later(() => {
        group?.classList.remove('is-resolving');
        this.renderAreas();
        this.showNextReveal();
      }, 1500);
    }

    finishReveal() {
      this.root.querySelector('[data-skip-reveal]').hidden = true;
      this.revealSteps = [];
      this.renderAreas();
      this.showRoundSummary();
    }

    skipAnimation() {
      this.skipAnim = true;
      stopTimers();
      this.finishReveal();
    }

    showRoundSummary() {
      const v = this.view;
      const over = v.status === 'over';
      const held = (seat) => this.R.AREAS.filter((a) => v.areas[a.id].owner === seat).length;
      const mayAdvance = !this.net || this.net.isHost?.();
      const rows = v.players.map((p) => `<div class="kd-score${p.id === v.you ? ' is-you' : ''}">
        <span>${escapeHTML(p.name)}</span><span>${held(p.id)} ${plural(held(p.id), 'область', 'области', 'областей')}</span>
      </div>`).join('');
      this.openSheet(`
        <h3>Итоги раунда ${v.round}</h3>
        <div class="kd-over">${rows}</div>
        <button type="button" class="kd-btn" data-next ${!over && !mayAdvance ? 'disabled' : ''}>${over ? 'Смотреть итоги партии' : mayAdvance ? 'Следующий раунд' : 'Ожидаем хозяина комнаты…'}</button>
      `).querySelector('[data-next]').addEventListener('click', (event) => {
        event.target.closest('.kd-sheet').remove();
        if (over) { this.finish(); return; }
        if (this.net) { this.net.send('nextRound'); return; }
        this.E.nextRound(this.state);
        this.saveCampaign();
        this.refresh();
        this.pending = null;
        this.scoutPicked = [];
        this.renderAll();
        this.tick();
      });
    }

    /* ——— итоги партии ——— */
    finish() {
      const v = this.view;
      const R = this.R;
      const rows = [...v.finalScore].sort((a, b) => b.total - a.total).map((score) => {
        const player = v.players[score.seat];
        const objective = R.objectiveOf(player.objectiveId);
        const winner = Array.isArray(v.winner) ? v.winner.includes(score.seat) : v.winner === score.seat;
        return `<div class="kd-final-row${score.seat === v.you ? ' is-you' : ''}${winner ? ' is-winner' : ''}">
          <div class="kd-final-name">${winner ? '👑 ' : ''}${escapeHTML(player.name)}</div>
          <div class="kd-final-bits">
            <span>Области: ${score.areaValue}</span>
            <span>Успешная оборона: +${score.veterans || 0}</span>
            <span>Регионы: +${score.regions * R.REGION_BONUS}</span>
            <span>${objective ? objective.title : 'Цель'}: ${score.objectiveDone ? `+${score.objectivePoints}` : '0'}</span>
            <span class="kd-final-total">Итого: ${score.total}</span>
          </div>
        </div>`;
      }).join('');
      const jointWinner = Array.isArray(v.winner) && v.winner.length > 1;
      this.root.innerHTML = `
        <div class="kd-wrap"><section class="kd-card">
          <h2>${jointWinner ? 'Совместная победа' : `Победа: ${escapeHTML(nameOf(v, v.winner))}`}</h2>
          <div class="kd-final">${rows}</div>
          <div class="kd-row">
            ${this.net && !this.net.youAreHost?.()
    ? '<p class="kd-wait">Хозяин комнаты решает, играть ли ещё</p>'
    : `<button type="button" class="kd-btn" data-again>${this.net ? 'Играть ещё раз' : 'Ещё партия'}</button>`}
            ${this.net && this.net.youAreHost?.()
    ? '<button type="button" class="kd-btn kd-btn--ghost" data-lobby>В комнату</button>' : ''}
            <button type="button" class="kd-btn kd-btn--ghost" data-menu>В меню</button>
          </div>
        </section></div>`;
      /*
        «Играть ещё раз» сдаёт заново тем же составом, не разводя всех по
        лобби: готовность только что подтверждена доигранной партией. Кому
        нужно поменять настройки или позвать кого-то ещё — рядом «В комнату».
      */
      this.root.querySelector('[data-again]')?.addEventListener('click', () => {
        if (this.net) { this.net.send('playAgain'); return; }
        this.setup();
      });
      this.root.querySelector('[data-lobby]')?.addEventListener('click', () => {
        this.net?.send('backToLobby');
      });
      this.root.querySelector('[data-menu]').addEventListener('click', () => {
        stopTimers();
        if (this.net) { this.net.leave(); return; }
        if (typeof goToMainMenu === 'function') goToMainMenu();
      });
    }

    /* ——— обучение на отдельной демонстрационной партии ——— */
    runTutorial() {
      if (this.net || this.tutorial) return;
      const returnState = this.root.querySelector('[data-svg]') ? this.state : null;
      stopTimers();
      this.tutorial = true;
      this.pending = null;
      this.scoutPicked = [];
      const R = this.R;
      const kingdoms = R.STARTING_LAYOUTS[2];
      const owned = R.startingAreasOf(kingdoms[0]);
      const enemyOwned = R.startingAreasOf(kingdoms[1]);
      const border = owned.flatMap(area => R.connectionsOf(area).map(link => ({ from: area, ...link })))
        .find(link => link.type === 'land' && !owned.includes(link.to) && !enemyOwned.includes(link.to));
      const enemyBorder = enemyOwned.flatMap(area => R.connectionsOf(area).map(link => ({ from: area, ...link })))
        .find(link => link.type === 'land' && !owned.includes(link.to) && !enemyOwned.includes(link.to));
      const home = owned[0];
      const advance = border || { from: owned[1], to: R.connectionsOf(owned[1])[0].to };
      const hidden = enemyBorder || { from: enemyOwned[1], to: R.connectionsOf(enemyOwned[1])[0].to };
      const steps = [
        { title: 'Перед вами карта', text: '24 области объединены в шесть регионов. Цвет и толстая граница показывают владельца; светлые области пока ничьи.', hint: 'Посмотрите, как выделяется ваша стартовая земля.', area: home },
        { title: 'Ваше царство', text: 'У вас две стартовые области. Корона отмечает столицу; число на области — её ценность в итоговом счёте.', hint: 'Герб и цвет помогают быстро увидеть свои земли.', area: home },
        { title: 'Карта в руках', text: 'Перетаскивайте карту одним пальцем. Раздвигайте два пальца для приближения или пользуйтесь кнопками + и −; «Показать всю карту» вернёт обзор.', hint: 'В этом шаге карта плавно приблизится к границе.', area: advance.from, zoom: true },
        { title: 'Шесть жетонов в руке', text: 'В начале раунда у вас шесть жетонов. Пять можно разместить по очереди; один останется на следующий раунд. Запас конечен.', hint: 'Подсвеченный жетон показывает доступный поход.', order: 'march3', hand: true },
        { title: 'Приказ на границе', text: 'Выберите поход, затем свою область и соседнюю цель — или нажмите подсвеченную связь между ними. Для захвата сила должна превысить защиту.', hint: 'Движущийся жетон показывает направление атаки.', edge: advance, token: 'march3', hand: true },
        { title: 'Приказы лежат рубашкой вверх', text: 'Соперники видят место и направление вашего приказа, но не его вид и силу. Их приказы скрыты от вас таким же образом.', hint: 'Знак вопроса — закрытый приказ соперника.', enemy: true },
        { title: 'Разведка', text: 'Разведка раскрывает один чужой закрытый приказ только вам. Царство Кедем может разведать сразу два.', hint: 'Теперь вид чужого приказа известен лишь вашему царству.', enemy: true, scout: true },
        { title: 'Обманный манёвр', text: 'Обманный жетон выглядит угрозой, но не участвует в бою. После раскрытия он вернётся и будет доступен в следующем раунде.', hint: 'Он отвлекает соперника, не захватывая область.', edge: advance, token: 'feint', hand: true },
        { title: 'Стража и укрепление', text: 'Стража даёт +2 к защите в текущем раунде. Укрепление даёт постоянный +1; после успешной обороны появляется ветеран: +1 к защите и итоговым очкам.', hint: 'Кольцо выделяет защищённую область.', area: home, defense: true },
        { title: 'Раскрытие', text: 'После пятого размещения каждого игрока приказы открываются вместе: сначала укрепления и стража, затем атаки. Приказы одного игрока на одну цель складываются.', hint: 'Жетон раскрывается, затем область меняет цвет.', edge: advance, reveal: true },
        { title: 'Очки и победа', text: 'После пятого раунда считайте ценность областей, +5 за каждый полный регион, ветеранов и тайную цель. У кого больше очков, тот побеждает.', hint: 'Четыре области одного региона окрашены в ваш цвет.', region: R.areaOf(home).region },
        { title: 'Готовы править', text: 'Пробуйте разные приказы и следите за закрытыми угрозами. Знак «?» в партии снова откроет это обучение.', hint: 'Демонстрация не затронула вашу сохранённую партию.', area: home },
      ];
      let at = 0;
      const finish = () => {
        this.tutorial = false;
        this.pending = null;
        this.scoutPicked = [];
        try { localStorage.setItem('kd_tutorial_seen', '1'); } catch { /* приватный режим */ }
        if (returnState) this.resumeCampaign(returnState);
        else { this.state = null; this.view = null; this.setup(); }
      };
      const show = () => {
        const step = steps[at];
        const demo = this.E.createGame({ kingdomIds: kingdoms, random: () => .42 });
        demo.players[0].hand = ['march1', 'march3', 'guard', 'fortify', 'scout', 'feint'];
        const ownOrder = (kind) => ({ id: 'demo-own', owner: 0, kind, area: advance.from,
          to: advance.to, round: 1 });
        const foreignOrder = { id: 'demo-enemy', owner: 1, kind: 'march2', area: hidden.from,
          to: hidden.to, round: 1 };
        if (step.token || step.reveal) demo.orders.push(ownOrder(step.token || 'march3'));
        if (step.enemy) demo.orders.push(foreignOrder);
        if (step.scout) demo.scoutIntel[0].push({ atRound: 1, orderId: foreignOrder.id,
          kind: foreignOrder.kind, owner: 1, area: foreignOrder.area, to: foreignOrder.to });
        if (step.defense) {
          demo.areas[home].fortify = 1;
          demo.areas[home].veterans = 1;
          demo.orders.push({ id: 'demo-guard', owner: 0, kind: 'guard', area: home, round: 1 });
        }
        if (step.reveal) {
          demo.orders[0].revealed = true;
          demo.phase = 'results';
          demo.areas[advance.to].owner = 0;
        }
        if (step.region) for (const area of R.areasOfRegion(step.region)) demo.areas[area.id].owner = 0;
        this.state = demo;
        this.refresh();
        this.renderAll();
        this.fitZoom();
        const wrap = this.root.querySelector('.kd-wrap');
        wrap.classList.add('is-teaching');
        const box = this.root.querySelector('[data-teach]');
        box.hidden = false;
        box.querySelector('[data-teach-count]').textContent = `${at + 1} / ${steps.length}`;
        box.querySelector('[data-teach-progress]').style.width = `${(at + 1) / steps.length * 100}%`;
        box.querySelector('[data-teach-title]').textContent = step.title;
        box.querySelector('[data-teach-text]').textContent = step.text;
        box.querySelector('[data-teach-hint]').textContent = step.hint;
        const hand = box.querySelector('[data-teach-hand]');
        hand.hidden = !step.hand;
        if (step.hand) hand.innerHTML = ['march1', 'march3', 'guard', 'fortify', 'scout', 'feint']
          .map(kind => `<div class="kd-teach-chip${(step.order || step.token) === kind ? ' is-demo-focus' : ''}">${orderIconHTML(kind)}<span>${escapeHTML(R.orderOf(kind).title)}${R.orderOf(kind).force ? ` · ${R.orderOf(kind).force}` : ''}</span></div>`).join('');
        box.querySelector('[data-teach-back]').disabled = at === 0;
        box.querySelector('[data-teach-next]').textContent = at === steps.length - 1 ? 'Играть' : 'Дальше';
        const areaId = step.area || step.edge?.from;
        if (areaId) this.root.querySelector(`[data-area="${areaId}"]`)?.classList.add('is-demo-focus');
        if (step.edge) this.root.querySelector(`[data-edge="${step.edge.from}|${step.edge.to}"], [data-edge="${step.edge.to}|${step.edge.from}"]`)?.classList.add('is-demo-focus');
        if (step.order) this.root.querySelector(`[data-order="${step.order}"]`)?.classList.add('is-demo-focus');
        if (step.enemy || step.token || step.reveal) this.root.querySelector('[data-token]')?.classList.add('is-demo-focus');
        if (step.edge && step.token) {
          const token = this.root.querySelector('[data-token="demo-own"]');
          const from = this.pos.get(step.edge.from);
          const to = this.pos.get(step.edge.to);
          token?.style.setProperty('--walk-x', `${(to.x - from.x) * .42}px`);
          token?.style.setProperty('--walk-y', `${(to.y - from.y) * .42}px`);
          token?.classList.add('is-demo-travel');
        }
        if (step.region) for (const area of R.areasOfRegion(step.region))
          this.root.querySelector(`[data-area="${area.id}"]`)?.classList.add('is-demo-focus');
        if (step.zoom) this.setZoom(1.55);
      };
      this.state = this.E.createGame({ kingdomIds: kingdoms, random: () => .42 });
      this.refresh();
      this.buildBoard();
      this.root.querySelector('[data-teach-back]').addEventListener('click', () => { if (at > 0) { at -= 1; show(); } });
      this.root.querySelector('[data-teach-next]').addEventListener('click', () => { at += 1; if (at === steps.length) finish(); else show(); });
      this.root.querySelector('[data-teach-skip]').addEventListener('click', finish);
      show();
    }
  }

  function nameOf(view, seat) {
    if (Array.isArray(seat)) return seat.map((s) => nameOf(view, s)).join(' и ');
    return view.players[seat] ? view.players[seat].name : `Место ${seat}`;
  }

  function safeGet(key) {
    try { return localStorage.getItem(key); } catch { return null; }
  }

  /*
    Уборка. Соперники от игры и повтор раскрытия идут по таймеру — без
    уборки они продолжают идти в уже закрытой игре и дорисовывают карту
    поверх меню.
  */
  window.__kingdomsCleanup = () => {
    stopTimers();
    document.querySelectorAll('.kd-sheet').forEach((node) => node.remove());
    window.KingdomsOnline?.close();
  };

  window.KingdomsUI = { Board, stopTimers, nameOf };
  window.startKingdomsGame = startKingdomsGame;
}());
