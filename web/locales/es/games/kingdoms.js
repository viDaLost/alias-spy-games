/* global goToMainMenu */
// «Царства» — экран игры.
//
// Правил здесь нет: что законно, кто победил и почему область сменила
// хозяина, знают kingdoms-rules.js и kingdoms-engine.js. Этот файл только
// рисует карту, отправляет приказы движку (или сети) и показывает ответ —
// точно так же, как устроены «Двенадцать колен».
//
// Карта нарисована разметкой (SVG), не картинками: генерация изображений в
// этой работе недоступна, а честная схема лучше картинки, выдаваемой за
// финальную. Список недостающих материалов — в docs/kingdoms-design.md.

(function () {
  'use strict';

  const PARTS = [
    'web/locales/es/games/kingdoms-rules.js',
    'web/locales/es/games/kingdoms-engine.js',
    'web/locales/es/games/kingdoms-bots.js',
    'web/locales/es/games/kingdoms-online.js',
  ];
  const STYLE = 'web/locales/es/games/kingdoms.css';
  const VERSION = '1';

  function loadPart(file) {
    return new Promise((resolve, reject) => {
      if (document.querySelector(`script[data-kd="${file}"]`)) { resolve(); return; }
      const script = document.createElement('script');
      script.src = `${file}?v=${VERSION}`;
      script.dataset.kd = file;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error(`No se pudo cargar ${file}`));
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
  const AREA_RADIUS = 34;

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
  const EMBLEMS = {
    anchor: '<path d="M12 3v6M9 6h6M12 9v10M7 14a5 5 0 0 0 10 0" />'
      + '<circle cx="12" cy="4.4" r="1.6" fill="currentColor" stroke="none"/>',
    peak: '<path d="M3 18 10 6l3 5 2-3 6 10z" />',
    ford: '<path d="M3 15c2-2 4-2 6 0s4 2 6 0 4-2 6 0" /><path d="M3 10c2-2 4-2 6 0s4 2 6 0 4-2 6 0" />',
    sheaf: '<path d="M12 21V9M12 9 7 4M12 9l5-5M12 13 6 9M12 13l6-4M12 17 5 13M12 17l7-4" />',
    tent: '<path d="M4 19 12 5l8 14z" /><path d="M9 19 12 12l3 7" /><path d="M4 19h16" />',
  };
  const emblemHTML = (key, size = 22) => `<svg class="kd-emblem" viewBox="0 0 24 24" width="${size}" height="${size}"
    fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"
    aria-hidden="true">${EMBLEMS[key] || ''}</svg>`;

  const TERRAIN_ICONS = {
    plains: '<path d="M2 9h10M2 12h7" />',
    mountains: '<path d="M2 12 6 5l3 4 2-3 5 6z" />',
    desert: '<path d="M2 10c2-3 4-3 6 0s4 3 6 0" />',
    coast: '<path d="M2 8c2-2 4-2 6 0s4 2 6 0M2 12c2-2 4-2 6 0s4 2 6 0" />',
  };
  const terrainHTML = (terrain) => `<svg class="kd-terrain" viewBox="0 0 14 14" width="14" height="14"
    fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" aria-hidden="true">
    ${TERRAIN_ICONS[terrain] || ''}</svg>`;
  const TERRAIN_NAMES = { plains: 'равнина', mountains: 'горы', desert: 'desierto', coast: 'побережье' };

  const ORDER_ICONS = {
    march1: '<path d="M4 12h13M12 6l6 6-6 6" />',
    march2: '<path d="M4 12h13M12 6l6 6-6 6" />',
    march3: '<path d="M4 12h13M12 6l6 6-6 6" />',
    ford2: '<path d="M4 12h13M12 6l6 6-6 6" /><path d="M4 17c2-1 4-1 6 0s4 1 6 0" />',
    guard: '<path d="M12 3l7 3v6c0 5-3 8-7 9-4-1-7-4-7-9V6z" />',
    fortify: '<path d="M4 20V10l8-6 8 6v10M9 20v-6h6v6" />',
    scout: '<circle cx="12" cy="12" r="3.2" /><path d="M2 12c3-4 7-6 10-6s7 2 10 6c-3 4-7 6-10 6s-7-2-10-6z" />',
    feint: '<path d="M4 12h13M12 6l6 6-6 6" stroke-dasharray="3 3" />',
  };
  const orderIconHTML = (kind) => `<svg class="kd-order-icon" viewBox="0 0 24 24" width="20" height="20"
    fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"
    aria-hidden="true">${ORDER_ICONS[kind] || ''}</svg>`;

  const plural = (count, one, few, many) => {
    const tens = count % 100;
    if (tens >= 11 && tens <= 14) return many;
    const last = count % 10;
    if (last === 1) return one;
    if (last >= 2 && last <= 4) return few;
    return many;
  };
  const roundsWord = (n) => plural(n, 'ronda', 'раунда', 'раундов');
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
        container.innerHTML = '<div class="kd-wrap"><section class="kd-card"><h2>No se pudo abrir el juego</h2>'
          + '<p>Правила не загрузились. Попробуйте вернуться в меню и открыть игру снова.</p>'
          + '<button type="button" class="kd-btn" data-back>Al menú principal</button></section></div>';
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
      const seenTutorial = safeGet('kd_tutorial_seen');
      this.root.innerHTML = `
        <div class="kd-wrap">
          <section class="kd-card">
            <h2>Царства</h2>
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
            <div class="kd-row">
              <button type="button" class="kd-btn" data-start>Начать</button>
              <button type="button" class="kd-btn kd-btn--ghost" data-tutorial>${seenTutorial ? 'Обучение ещё раз' : 'Короткое обучение'}</button>\n              <button type="button" class="kd-btn kd-btn--ghost" data-menu>Al menú</button>\n            </div>\n            <p class="kd-note" data-message>${escapeHTML(message)}</p>
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
        ? { name: 'Tú', isBot: false }
        : { name: this.R.kingdomOf(id).name, isBot: true, botLevel: 'captain' }));
      this.state = this.E.createGame({ kingdomIds, players });
      this.you = 0;
      this.refresh();
      this.buildBoard();
      this.renderAll();
      this.tick();
      window.KingdomsGame = { state: () => this.state, refresh: () => this.renderAll(), board: this };
    }

    refresh() { if (this.state) this.view = this.E.visibleStateFor(this.state, this.you); }

    /* ——— каркас доски ——— */
    buildBoard() {
      const R = this.R;
      this.root.innerHTML = `\n        <div class="kd-wrap">\n          <header class="kd-header">\n            <div class="kd-header-round">\n              <b data-round></b>\n              <span data-turn></span>\n            </div>\n            <div class="kd-header-right">\n              <span class="kd-objective" data-objective></span>\n              <button type="button" class="kd-icon-btn" data-log title="Журнал событий">☰</button>\n              <button type="button" class="kd-icon-btn" data-menu title="Menú principal">✕</button>\n            </div>\n          </header>\n          <div class="kd-body">\n            <div class="kd-map-wrap">\n              <div class="kd-map-toolbar">\n                <button type="button" data-zoom-in aria-label="Приблизить">+</button>\n                <button type="button" data-zoom-out aria-label="Отдалить">–</button>\n                <button type="button" data-zoom-fit>Показать всю карту</button>\n              </div>\n              <div class="kd-map-scroll" data-scroll>\n                <svg class="kd-map" data-svg viewBox="0 0 ${VIEW.w} ${VIEW.h}" xmlns="http://www.w3.org/2000/svg">\n                  <g data-regions></g>\n                  <g data-connections></g>\n                  <g data-areas></g>\n                  <g data-tokens></g>\n                </svg>\n              </div>\n              <p class="kd-status" data-status></p>\n            </div>\n            <aside class="kd-panel">\n              <div class="kd-orders" data-orders></div>\n              <div class="kd-confirm" data-confirm hidden>\n                <p data-confirm-text></p>\n                <div class="kd-row">\n                  <button type="button" class="kd-btn" data-confirm-ok>Подтвердить</button>\n                  <button type="button" class="kd-btn kd-btn--ghost" data-confirm-cancel>Cancelar</button>\n                </div>\n              </div>\n              <p class="kd-orders-left" data-orders-left></p>\n            </aside>\n          </div>\n        </div>\n        <div class="kd-sheet-root" data-sheet-root></div>`;

      const on = (name, fn) => this.root.querySelector(`[data-${name}]`)?.addEventListener('click', fn);
      on('menu', () => {
        stopTimers();
        if (this.net) { this.net.leave(); return; }
        if (typeof goToMainMenu === 'function') goToMainMenu();
      });
      on('log', () => this.openLog());
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
          <circle cx="${c.x}" cy="${c.y}" r="150"></circle>
          <text x="${c.x}" y="${c.y - 155}" class="kd-region-label">${escapeHTML(region.name)}</text>
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
        return `<g class="kd-area" data-area="${area.id}" transform="translate(${p.x},${p.y})" tabindex="0" role="button">
          <circle class="kd-area-fill" r="${AREA_RADIUS}"></circle>
          <circle class="kd-area-ring" r="${AREA_RADIUS}"></circle>
          <g class="kd-area-terrain" transform="translate(-24,-24)">${terrainHTML(area.terrain)}</g>
          ${area.capitalOf ? '<g class="kd-area-crown" transform="translate(-8,-46)"><path d="M-6 0 -3-6 0-1 3-6 6 0Z" /></g>' : ''}
          ${area.city ? '<g class="kd-area-city" transform="translate(14,-30)"><rect x="-5" y="-5" width="10" height="10" rx="1.5"/></g>' : ''}
          <g class="kd-area-fortify" data-fortify transform="translate(-15,26)"></g>
          <text class="kd-area-value">${area.value}</text>
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
      let dragging = null;
      const DRAG_THRESHOLD = 6;
      const apply = () => {
        svg.style.transform = `translate(${this.zoom.x}px,${this.zoom.y}px) scale(${this.zoom.scale})`;
      };
      this.applyZoom = apply;
      scroll.addEventListener('pointerdown', (event) => {
        if (event.pointerType === 'mouse' && event.button !== 0) return;
        dragging = {
          id: event.pointerId, startX: event.clientX, startY: event.clientY,
          baseX: this.zoom.x, baseY: this.zoom.y, moved: false, captured: false,
        };
      });
      scroll.addEventListener('pointermove', (event) => {
        if (!dragging || dragging.id !== event.pointerId) return;
        const dx = event.clientX - dragging.startX;
        const dy = event.clientY - dragging.startY;
        if (!dragging.moved && Math.hypot(dx, dy) > DRAG_THRESHOLD) {
          dragging.moved = true;
          try { scroll.setPointerCapture(event.pointerId); dragging.captured = true; } catch { /* уже отпущен */ }
        }
        if (!dragging.moved) return;
        this.zoom.x = dragging.baseX + dx;
        this.zoom.y = dragging.baseY + dy;
        apply();
      });
      const endDrag = (event) => {
        if (!dragging || dragging.id !== event.pointerId) return;
        if (dragging.captured) { try { scroll.releasePointerCapture(event.pointerId); } catch { /* уже отпущен */ } }
        dragging = null;
      };
      scroll.addEventListener('pointerup', endDrag);
      scroll.addEventListener('pointercancel', endDrag);
      scroll.addEventListener('wheel', (event) => {
        event.preventDefault();
        this.setZoom(this.zoom.scale * (event.deltaY < 0 ? 1.1 : 0.9));
      }, { passive: false });
    }

    setZoom(scale) {
      this.zoom.scale = Math.max(0.6, Math.min(2.4, scale));
      this.applyZoom?.();
    }

    fitZoom() {
      this.zoom = { scale: 1, x: 0, y: 0 };
      this.applyZoom?.();
    }

    /*
      Двадцать четыре круга на карте не могут уменьшаться бесконечно: если
      сблизить их сильнее, они начнут перекрываться уже на самой карте, не
      дожидаясь экрана. Поэтому на узком экране область умещается пальцем не
      уменьшением карты, а тем, что первый показ — это уже небольшой наезд, а
      не честный вид «целиком»: целиком карту всегда можно увидеть кнопкой
      «Показать всю карту», а начинают с вида, по которому можно попасть.
    */
    autoZoom() {
      const scroll = this.root.querySelector('[data-scroll]');
      const rect = scroll?.getBoundingClientRect();
      if (!rect || !rect.width || !rect.height) { this.fitZoom(); return; }
      const fitScale = Math.min(rect.width / VIEW.w, rect.height / VIEW.h);
      const minTouchRadiusPx = 22; // половина рекомендованных ~44px на палец
      const needed = minTouchRadiusPx / (AREA_RADIUS * fitScale);
      this.zoom = { scale: Math.max(1, Math.min(2.4, needed)), x: 0, y: 0 };
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
      this.renderAreas();
      this.renderTokens();
      this.renderOrders();
      this.renderStatus();
      this.renderConfirm();
    }

    renderHeader() {
      const v = this.view;
      const R = this.R;
      this.root.querySelector('[data-round]').textContent = `Ronda ${v.round} de ${R.ROUNDS}`;
      const turnBox = this.root.querySelector('[data-turn]');
      if (v.phase === 'planning') {
        turnBox.textContent = v.turn === v.you ? 'Tu turno' : `Juega ${nameOf(v, v.turn)}`;
      } else if (v.phase === 'reveal' || v.phase === 'results') {
        turnBox.textContent = 'Раскрытие приказов';
      } else {
        turnBox.textContent = '';
      }
      const me = v.players[v.you];
      const objective = R.objectiveOf(me.objectiveId);
      this.root.querySelector('[data-objective]').textContent = objective
        ? `Objetivo: ${objective.title} (${objective.points})` : '';
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
        group.classList.toggle('is-mine', cell.owner === v.you);
        group.classList.toggle('is-neutral', cell.owner === null);
        group.classList.toggle('is-eligible', eligible.has(area.id));
        group.classList.toggle('is-selected', this.pending?.area === area.id);
        const fortifyBox = group.querySelector('[data-fortify]');
        fortifyBox.innerHTML = Array.from({ length: cell.fortify }, (_, i) => `<circle cx="${i * 9}" cy="0" r="3"></circle>`).join('');
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
        const known = Boolean(order.kind);
        const mine = order.owner === v.you;
        const color = this.kingdomColor(order.owner);
        const scoutable = this.pending?.kind === 'scout' && !mine && !known;
        const picked = this.scoutPicked.includes(order.id);
        let x; let y;
        if (order.to) {
          const a = this.pos.get(order.area);
          const b = this.pos.get(order.to);
          x = a.x + (b.x - a.x) * 0.38;
          y = a.y + (b.y - a.y) * 0.38;
        } else if (order.area) {
          const a = this.pos.get(order.area);
          x = a.x + 24; y = a.y + 24;
        } else return '';
        const icon = known ? orderIconHTML(order.kind) : '<text x="-4" y="5" class="kd-token-q">?</text>';
        const force = known && this.R.orderOf(order.kind).force ? `<text x="10" y="-8" class="kd-token-force">${this.E.forceOf(this.state || { players: v.players.map((p) => ({ kingdomId: p.kingdomId })) }, order)}</text>` : '';
        return `<g class="kd-token${mine ? ' is-mine' : ''}${scoutable ? ' is-scoutable' : ''}${picked ? ' is-picked' : ''}"
          data-token="${order.id}" style="--owner:${color}" transform="translate(${x},${y})">
          <circle r="13"></circle>${icon}${force}
        </g>`;
      }).join('');
      box.querySelectorAll('[data-token]').forEach((node) => {
        node.addEventListener('click', (event) => { event.stopPropagation(); this.tapToken(node.dataset.token); });
      });
    }

    renderOrders() {
      const v = this.view;
      const myTurn = v.phase === 'planning' && v.turn === v.you;
      this.root.querySelectorAll('[data-order]').forEach((button) => {
        const kind = button.dataset.order;
        button.classList.toggle('is-active', this.pending?.kind === kind);
        button.disabled = !myTurn || v.ordersPlaced >= v.ordersLimit;
        if (kind === 'scout') button.disabled = button.disabled || !v.orders.some((one) => one.owner !== v.you && !one.kind);
      });
      this.root.querySelector('[data-orders-left]').textContent = myTurn
        ? `Размещено ${v.ordersPlaced} de ${v.ordersLimit} приказов за раунд`
        : '';
    }

    renderStatus() {
      const v = this.view;
      const box = this.root.querySelector('[data-status]');
      if (v.phase !== 'planning') { box.textContent = ''; return; }
      if (v.turn !== v.you) { box.textContent = `Juega ${nameOf(v, v.turn)}…`; return; }
      if (!this.pending) { box.textContent = 'Выберите приказ, затем область или связь на карте.'; return; }
      const order = this.R.orderOf(this.pending.kind);
      if (order.slot === 'internal') box.textContent = 'Нажмите свою область, подсвеченную на карте.';
      else if (order.slot === 'outgoing') box.textContent = 'Нажмите подсвеченную связь на карте.';
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
        text.textContent = `${order.title} силой ${order.force}: «${this.R.areaOf(this.pending.from).name}» → «${this.R.areaOf(this.pending.area).name}».`;
      } else if (order.id === 'scout') {
        text.textContent = `Разведать: ${this.scoutPicked.length} de ${this.view.players[this.view.you].kingdomId === 'kedem' ? 2 : 1}.`;
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
      if (this.view.turn !== this.view.you || this.view.phase !== 'planning') return;
      this.pending = { kind };
      this.scoutPicked = [];
      this.renderAll();
    }

    cancelPending() {
      this.pending = null;
      this.scoutPicked = [];
      this.renderAll();
    }

    tapArea(areaId) {
      if (this.pending && this.R.orderOf(this.pending.kind).slot === 'internal' && this.eligibleAreas().has(areaId)) {
        this.pending.area = areaId;
        this.renderAll();
        return;
      }
      this.openAreaDetail(areaId);
    }

    tapEdge(a, b) {
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
      if (!this.pending || this.pending.kind !== 'scout') return;
      const order = this.view.orders.find((one) => one.id === orderId);
      if (!order || order.owner === this.view.you || order.kind) return;
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
        <h3>${escapeHTML(area.name)}</h3>
        <p class="kd-note">${escapeHTML(region.name)} · ${TERRAIN_NAMES[area.terrain]}${area.city ? ' · ciudad' : ''}${area.capitalOf ? ' · столица' : ''}</p>
        <div class="kd-detail-rows">
          <div><span>Хозяин</span><b>${escapeHTML(owner)}</b></div>
          <div><span>Ценность</span><b>${area.value}</b></div>
          <div><span>Укрепление</span><b>${cell.fortify}</b></div>\n        </div>\n        <button type="button" class="kd-btn kd-btn--ghost" data-cancel>Cerrar</button>\n      `);
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
        if (event.target.closest('[data-cancel]') || event.target === sheet) sheet.remove();
      });
      root.appendChild(sheet);
      return sheet;
    }

    openLog() {
      const lines = this.view.log.slice().reverse()
        .map((line) => `<div class="kd-log-line"><b>Р${line.round}</b> ${escapeHTML(line.text)}</div>`).join('')
        || '<p class="kd-note">Событий пока не было.</p>';
      this.openSheet(`<h3>Журнал событий</h3><div class="kd-log">${lines}</div>\n        <button type="button" class="kd-btn kd-btn--ghost" data-cancel>Cerrar</button>`);
    }

    /* ——— ход соперников от игры (локальный режим) ——— */
    afterLocalChange() {
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
      this.refresh();
      this.beginRevealAnimation();
    }

    beginRevealAnimation() {
      this.revealSteps = (this.view.lastResolution || []).slice();
      this.renderRevealShell();
      if (reduceMotion() || this.skipAnim) { this.finishReveal(); return; }
      this.showNextReveal();
    }

    /* ——— вид от сервера (сетевой режим) ——— */
    applyView(view) {
      const firstTime = !this.view;
      const enteringReveal = this.view && this.view.phase !== 'reveal' && view.phase === 'reveal';
      const midReveal = this.view && (this.view.phase === 'reveal' || this.view.phase === 'results')
        && (view.phase === 'reveal' || view.phase === 'results');
      this.view = view;
      this.you = view.you;
      if (firstTime) this.buildBoard();
      if (firstTime && view.phase === 'reveal') { this.beginRevealAnimation(); return; }
      if (enteringReveal) { this.beginRevealAnimation(); return; }
      if (midReveal) return; // анимация уже идёт своим чередом — не мешаем ей
      this.pending = null;
      this.scoutPicked = [];
      this.renderAll();
      if (view.status === 'over') later(() => this.finish(), 400);
    }

    renderRevealShell() {
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
      const attackers = line.attackers.map((a) => `${nameOf(this.view, a.seat)}: fuerza ${a.total}`).join('; ');
      const d = line.defense;
      const box = this.root.querySelector('[data-status]');
      if (box) {
        box.textContent = `«${area.name}»: защита ${d.total} (1 + укрепление ${d.fortify} + guardia ${d.guard}`
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
      const rows = v.players.map((p) => `<div class="kd-score${p.id === v.you ? ' is-you' : ''}">
        <span>${escapeHTML(p.name)}</span><span>${held(p.id)} ${plural(held(p.id), 'область', 'области', 'областей')}</span>
      </div>`).join('');
      this.openSheet(`
        <h3>Итоги раунда ${v.round}</h3>
        <div class="kd-over">${rows}</div>
        <button type="button" class="kd-btn" data-next>${over ? 'Смотреть итоги партии' : 'Следующий раунд'}</button>
      `).querySelector('[data-next]').addEventListener('click', (event) => {
        event.target.closest('.kd-sheet').remove();
        if (over) { this.finish(); return; }
        if (this.net) { this.net.send('nextRound'); return; }
        this.E.nextRound(this.state);
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
            <span>Регионы: +${score.regions * 2}</span>
            <span>${objective ? objective.title : 'Objetivo'}: ${score.objectiveDone ? `+${score.objectivePoints}` : '0'}</span>\n            <span class="kd-final-total">Total: ${score.total}</span>
          </div>
        </div>`;
      }).join('');
      const jointWinner = Array.isArray(v.winner) && v.winner.length > 1;
      this.root.innerHTML = `
        <div class="kd-wrap"><section class="kd-card">
          <h2>${jointWinner ? 'Совместная победа' : `Victoria: ${escapeHTML(nameOf(v, v.winner))}`}</h2>
          <div class="kd-final">${rows}</div>
          <div class="kd-row">
            <button type="button" class="kd-btn" data-again>${this.net ? 'В комнату' : 'Ещё партия'}</button>\n            <button type="button" class="kd-btn kd-btn--ghost" data-menu>Al menú</button>\n          </div>\n        </section></div>`;
      this.root.querySelector('[data-again]').addEventListener('click', () => {
        if (this.net) { this.net.send('backToLobby'); return; }
        this.setup();
      });
      this.root.querySelector('[data-menu]').addEventListener('click', () => {
        stopTimers();
        if (this.net) { this.net.leave(); return; }
        if (typeof goToMainMenu === 'function') goToMainMenu();
      });
    }

    /* ——— короткое обучение ——— */
    runTutorial() {
      try { localStorage.setItem('kd_tutorial_seen', '1'); } catch { /* приватный режим */ }
      const steps = [
        { title: 'Carta', text: 'Двадцать четыре области в шести регионах. Ваши области — цвета вашего царства, '
          + 'остальные — серые (ничьи) или цвета соперников. Нажмите область, чтобы увидеть её карточку.' },
        { title: 'Поход', text: 'Выберите приказ «Поход» — на карте подсветятся связи от ваших областей к '
          + 'соседним. Нажмите связь — это и область-источник, и цель одним нажатием.' },
        { title: 'Guardia', text: '«Стража» и «Укрепление» ставятся внутри своей области: +2 к защите на этот '
          + 'раунд у стражи, и постоянный +1 у укрепления, с пределом.' },
        { title: 'Закрытый приказ', text: 'Чужие приказы на карте видны местом и хозяином, но не видом и силой — '
          + 'кружок с «?». «Разведка» раскрывает один такой приказ только вам.' },
        { title: 'Раскрытие', text: 'Когда все разместили приказы, они раскрываются разом: укрепления, стража, '
          + 'затем атаки. Сила атакующих суммируется у одного игрока, но не между разными игроками.' },
        { title: 'Puntos', text: 'После пятого раунда считаются очки: ценность удержанных областей, +2 за полный '
          + 'регион и очки за тайную цель. Больше всех — победил.' },
      ];
      let at = 0;
      const show = () => {
        const step = steps[at];
        const sheet = this.openSheet(`\n          <h3>Tutorial (${at + 1} de ${steps.length}) — ${escapeHTML(step.title)}</h3>
          <p>${escapeHTML(step.text)}</p>
          <div class="kd-row">
            <button type="button" class="kd-btn" data-next>${at === steps.length - 1 ? 'Entendido' : 'Siguiente'}</button>\n            <button type="button" class="kd-btn kd-btn--ghost" data-cancel>Saltar</button>\n          </div>`);
        sheet.querySelector('[data-next]').addEventListener('click', () => {
          sheet.remove();
          at += 1;
          if (at < steps.length) show();
        });
      };
      show();
    }
  }

  function nameOf(view, seat) {
    if (Array.isArray(seat)) return seat.map((s) => nameOf(view, s)).join(' и ');
    return view.players[seat] ? view.players[seat].name : `Puesto ${seat}`;
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
