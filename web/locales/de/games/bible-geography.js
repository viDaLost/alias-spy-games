/* global goToMainMenu */
// «Библейская география» — экран игры.
//
// Пять входов в одну и ту же карту знаний:
//   «Соедини»        — два столбца: герой и место, где он был;
//   «Все места героя» — одно имя и много мест, верных несколько;
//   «Найди на карте» — где это было;
//   «Тогда и сейчас» — что на месте библейского города сегодня;
//   «Атлас»          — свободная карта: древняя, современная и обе сразу,
//                      пути героев и путешествия Павла.
//
// Что верно, а что нет, решает bible-geography-logic.js — здесь только
// показ. Данные и карта лежат в web/data: героев, места и стихи собирает
// scripts/build-bible-geography.mjs, берега и реки —
// scripts/build-bible-geography-map.mjs.

(function () {
  'use strict';

  /*
    Пути написаны целиком, а не собраны из частей: сборка переводов
    переписывает в коде пути вида web/…, чтобы английская игра брала английские
    файлы, а склеенный путь она не видит.
  */
  const LOGIC = 'web/locales/de/games/bible-geography-logic.js';
  const STYLE = 'web/locales/de/games/bible-geography.css';
  const DATA = 'web/locales/de/data/bible_geography.json';
  const GALLERY = 'web/locales/de/data/bible_geography_gallery.json';
  const MAP = 'web/assets/bible-geography/map.json';
  const ART = 'web/assets/bible-geography/art.json';
  const VERSION = '2';
  const STORE = 'bible_geography_v1';

  const MODES = {
    match: { title: 'Verbinde', note: 'Zwei Spalten: Person und Ort', rounds: 5 },
    multi: { title: 'Alle Orte einer Person', note: 'Mehrere Antworten sind richtig', rounds: 8 },
    where: { title: 'Finde es auf der Karte', note: 'Wo war das?', rounds: 10 },
    thennow: { title: 'Damals und heute', note: 'Was dort heute ist', rounds: 10 },
    atlas: { title: 'Atlas', note: 'Antike und heutige Karte, Wege der biblischen Personen', rounds: 0 },
  };

  const LEVEL_NAMES = { easy: 'Leicht', medium: 'Mittel', hard: 'Schwer' };
  const TESTAMENTS = { all: 'Ganze Bibel', ot: 'Altes Testament', nt: 'Neues Testament' };
  const LAYERS = { ancient: 'Antike', both: 'Beide', modern: 'Heute' };

  // Цвета пар в «Соедини». Различаются не только цветом: у каждой пары свой номер.
  const PAIR_COLORS = ['#4f46e5', '#0ea5e9', '#16a34a', '#d97706', '#db2777', '#7c3aed'];

  const ICONS = {
    match: '<circle cx="6" cy="7" r="3"/><circle cx="18" cy="17" r="3"/><path d="M9 7h3a3 3 0 0 1 3 3v4"/><path d="M13 12l2 2 2-2"/>',
    multi: '<rect x="3.5" y="4" width="7" height="7" rx="2"/><rect x="13.5" y="4" width="7" height="7" rx="2"/><rect x="3.5" y="14" width="7" height="7" rx="2"/><rect x="13.5" y="14" width="7" height="7" rx="2"/><path d="M5.5 7.6l1.4 1.4 2.4-2.6M15.5 17.6l1.4 1.4 2.4-2.6"/>',
    where: '<path d="M12 21s-6.5-6-6.5-11a6.5 6.5 0 0 1 13 0c0 5-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.4"/>',
    thennow: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7v5l3.2 2"/><path d="M3.5 12H2M22 12h-1.5"/>',
    atlas: '<path d="M3 6.5l5.5-2.5 7 2.5L21 4v13.5l-5.5 2.5-7-2.5L3 20z"/><path d="M8.5 4v13.5M15.5 6.5V20"/>',
    back: '<path d="M14.5 5.5L8 12l6.5 6.5"/>',
    plus: '<path d="M12 6v12M6 12h12"/>',
    minus: '<path d="M6 12h12"/>',
    fit: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
    close: '<path d="M6 6l12 12M18 6L6 18"/>',
  };
  const icon = (name, size = 22) => `<svg class="geo-ico" viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ''}</svg>`;

  const escapeHTML = (value) => String(value ?? '')
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#39;');

  // ————————————————————————————————————————————— загрузка

  function loadScript(file) {
    return new Promise((resolve, reject) => {
      if (window.BibleGeographyLogic) { resolve(); return; }
      const script = document.createElement('script');
      script.src = `${file}?v=${VERSION}`;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error(`Laden fehlgeschlagen ${file}`));
      document.head.appendChild(script);
    });
  }

  function injectStyles() {
    const id = 'bible-geography-css';
    if (document.getElementById(id)) return;
    const link = document.createElement('link');
    link.id = id;
    link.rel = 'stylesheet';
    link.href = `${STYLE}?v=${VERSION}`;
    document.head.appendChild(link);
  }

  async function loadJSON(file, fallback) {
    try {
      const answer = await fetch(`${file}?v=${VERSION}`, { cache: 'no-cache' });
      if (!answer.ok) throw new Error(String(answer.status));
      return await answer.json();
    } catch (error) {
      if (fallback !== undefined) return fallback;
      throw error;
    }
  }

  // ————————————————————————————————————————————— сохранение

  function readStore() {
    try {
      const raw = JSON.parse(localStorage.getItem(STORE) || 'null');
      if (raw && typeof raw === 'object') return raw;
    } catch { /* приватный режим или битая запись — начинаем с чистого листа */ }
    return {};
  }

  function writeStore(state) {
    try { localStorage.setItem(STORE, JSON.stringify(state)); } catch { /* приватный режим */ }
  }

  function haptic(kind) {
    const feedback = window.Telegram?.WebApp?.HapticFeedback;
    try {
      if (kind === 'success' || kind === 'error' || kind === 'warning') feedback?.notificationOccurred?.(kind);
      else feedback?.selectionChanged?.();
    } catch { /* старый клиент Telegram */ }
  }

  // ————————————————————————————————————————————— карта

  /*
    Карта — два слоя SVG друг над другом.

    Нижний — берега, реки, границы и картинка, если она нарисована. Он живёт в
    координатах карты (пиксель эталонной картинки 2560×1440), и во время жеста
    его не перерисовывают, а сдвигают и масштабируют одним transform: путь
    берега весит десятки килобайт, и перерисовка на каждый кадр пальца
    на телефоне не успевала бы. Когда палец отпущен, вид фиксируется в viewBox —
    и берег снова резкий.

    Верхний — точки, подписи и пути. Он в пикселях экрана и пересчитывается
    каждый кадр: точек всего сотня, а подпись должна оставаться читаемой при
    любом увеличении.
  */
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const HOLY = { lon0: 33.9, lon1: 36.9, lat0: 29.4, lat1: 33.9 };
  let mapCount = 0;

  class MapView {
    constructor(host, { map, data, art = {}, layer = 'ancient', onTap = null, onView = null, padding = 28 }) {
      this.host = host;
      this.map = map;
      this.data = data;
      this.art = art;
      this.onTap = onTap;
      this.onView = onView;
      this.padding = padding;
      this.frame = map.frame;
      this.layer = layer;
      this.markers = new Map();
      this.visible = new Set();
      this.classes = new Map();
      this.badges = new Map();
      this.labelMode = 'names';
      this.routes = [];
      this.pointers = new Map();
      this.destroyed = false;
      this.frameRequest = 0;
      this.commitTimer = 0;
      this.animation = 0;

      host.classList.add('geo-map');
      host.dataset.layer = layer;
      host.innerHTML = `
        <svg class="geo-map__base" xmlns="${SVG_NS}" preserveAspectRatio="none" aria-hidden="true">${this.baseMarkup()}</svg>
        <svg class="geo-map__over" xmlns="${SVG_NS}" aria-hidden="true">\n          <g class="geo-map__regions"></g><g class="geo-map__routes"></g><g class="geo-map__pins"></g>\n        </svg>\n        <div class="geo-map__tools">\n          <button type="button" class="geo-map__tool" data-map="in" aria-label="Vergrößern">${icon('plus', 20)}</button>\n          <button type="button" class="geo-map__tool" data-map="out" aria-label="Verkleinern">${icon('minus', 20)}</button>\n          <button type="button" class="geo-map__tool" data-map="fit" aria-label="Ganze Karte">${icon('fit', 20)}</button>
        </div>`;
      this.base = host.querySelector('.geo-map__base');
      this.over = host.querySelector('.geo-map__over');
      this.regionLayer = host.querySelector('.geo-map__regions');
      this.routeLayer = host.querySelector('.geo-map__routes');
      this.pinLayer = host.querySelector('.geo-map__pins');
      this.holyImages = [...this.base.querySelectorAll('.geo-art--holy')];

      this.buildRegions();
      this.buildMarkers();
      this.measure();
      this.fitAll(false);

      this.onPointerDown = this.onPointerDown.bind(this);
      this.onPointerMove = this.onPointerMove.bind(this);
      this.onPointerUp = this.onPointerUp.bind(this);
      this.onWheel = this.onWheel.bind(this);
      this.onTool = this.onTool.bind(this);
      this.over.addEventListener('pointerdown', this.onPointerDown);
      this.over.addEventListener('pointermove', this.onPointerMove);
      this.over.addEventListener('pointerup', this.onPointerUp);
      this.over.addEventListener('pointercancel', this.onPointerUp);
      this.over.addEventListener('wheel', this.onWheel, { passive: false });
      host.querySelector('.geo-map__tools').addEventListener('click', this.onTool);
      this.resizeObserver = new ResizeObserver(() => {
        const before = this.center();
        this.measure();
        this.live.k = Math.max(this.live.k, this.kMin);
        this.centerOn(before.x, before.y, this.live.k, false);
      });
      this.resizeObserver.observe(host);
    }

    project(lon, lat) {
      const f = this.frame;
      return [(lon - f.lon0) * f.kx * f.unit, (f.lat1 - lat) * f.unit];
    }

    baseMarkup() {
      const { map } = this;
      const f = this.frame;
      const art = (kind, frame, cls) => {
        const file = this.art?.[frame]?.[kind];
        // Вставка Святой земли лежит поверх карты региона и без неё не
        // показывается: векторная суша, которая осталась бы вокруг, закрыла бы её.
        if (!file || (frame === 'holy' && !this.art?.world?.[kind])) return '';
        const box = frame === 'holy' ? HOLY : { lon0: f.lon0, lon1: f.lon1, lat0: f.lat0, lat1: f.lat1 };
        const [x0, y0] = this.project(box.lon0, box.lat1);
        const [x1, y1] = this.project(box.lon1, box.lat0);
        if (frame === 'world') this.host.classList.add(`has-art-${kind}`);
        return `<image class="geo-art geo-art--${kind} ${cls}" href="${escapeHTML(file)}" x="${x0}" y="${y0}" width="${x1 - x0}" height="${y1 - y0}" preserveAspectRatio="none"/>`;
      };
      const rivers = Object.entries(map.rivers).map(([id, river]) => `<path class="geo-river geo-river--${id}" d="${river.d}"/>`).join('');
      // Карта — лист с краем: за рамкой данных нет, и показывать там «море»
      // значило бы стереть Европу и Аравию. Всё нарисованное обрезается по листу.
      // Реки лежат под озёрами: Иордан впадает в Мёртвое море, а не пересекает его.
      mapCount += 1;
      const clip = `geo-sheet-${mapCount}`;
      return `
        <defs><clipPath id="${clip}"><rect width="${f.w}" height="${f.h}"/></clipPath></defs>
        <rect class="geo-sea" width="${f.w}" height="${f.h}"/>
        <g clip-path="url(#${clip})">
          ${art('ancient', 'world', 'geo-art--world')}${art('modern', 'world', 'geo-art--world')}
          ${art('ancient', 'holy', 'geo-art--holy')}${art('modern', 'holy', 'geo-art--holy')}
          <path class="geo-land" d="${map.land}"/>
          <g class="geo-rivers">${rivers}</g>
          <path class="geo-lake" d="${map.lakes}"/>
          <path class="geo-dead geo-dead--ancient" d="${map.deadSea.ancient}"/>
          <path class="geo-hula" d="${map.hula}"/>
          <path class="geo-dead geo-dead--modern" d="${map.deadSea.modern}"/>
          <path class="geo-border" d="${map.borders.international}"/>
          <path class="geo-border geo-border--disputed" d="${map.borders.disputed}"/>
        </g>
        <rect class="geo-sheet-edge" width="${f.w}" height="${f.h}"/>`;
    }

    buildRegions() {
      const make = (label, kind) => {
        const [x, y] = this.project(label.lon, label.lat);
        const node = document.createElementNS(SVG_NS, 'text');
        node.setAttribute('class', `geo-region geo-region--${label.kind} geo-region--${kind}`);
        node.textContent = label.n;
        this.regionLayer.appendChild(node);
        return { node, x, y, z: label.z, kind, label };
      };
      this.regions = [
        ...this.data.labels.ancient.map((label) => make(label, 'ancient')),
        ...this.data.labels.modern.map((label) => make(label, 'modern')),
        ...this.data.labels.cities.map((label) => ({ ...make({ ...label, kind: 'city', z: [2.5, 999] }, 'modern'), city: true })),
      ];
      for (const city of this.regions.filter((one) => one.city)) {
        const dot = document.createElementNS(SVG_NS, 'circle');
        dot.setAttribute('class', 'geo-city-dot');
        dot.setAttribute('r', '2.6');
        this.regionLayer.appendChild(dot);
        city.dot = dot;
      }
      for (const [id, river] of Object.entries(this.map.rivers)) {
        const names = this.data.labels.rivers?.[id] || {};
        for (const kind of ['ancient', 'modern']) {
          if (!names[kind] || !river.at) continue;
          const node = document.createElementNS(SVG_NS, 'text');
          node.setAttribute('class', `geo-region geo-region--river geo-region--${kind}`);
          node.textContent = names[kind];
          node.dataset.river = id;
          this.regionLayer.appendChild(node);
          this.regions.push({ node, x: river.at[0], y: river.at[1], z: [1.6, 999], kind });
        }
      }
    }

    buildMarkers() {
      for (const place of this.data.places) {
        const [x, y] = this.project(place.lon, place.lat);
        const group = document.createElementNS(SVG_NS, 'g');
        group.setAttribute('class', `geo-pin geo-pin--${place.kind}${place.approx ? ' geo-pin--approx' : ''}`);
        group.innerHTML = '<circle class="geo-pin__hit" r="16"/><circle class="geo-pin__dot" r="5"/>'
          + '<text class="geo-pin__badge" y="0.35em"></text><text class="geo-pin__label" x="9" y="4"></text>'
          + '<text class="geo-pin__sub" x="9" y="18"></text>';
        group.style.display = 'none';
        this.pinLayer.appendChild(group);
        this.markers.set(place.id, {
          place, x, y, group,
          label: group.querySelector('.geo-pin__label'),
          sub: group.querySelector('.geo-pin__sub'),
          badge: group.querySelector('.geo-pin__badge'),
        });
      }
    }

    measure() {
      const box = this.host.getBoundingClientRect();
      // Окно ещё не разложено (или спрятано) — считаем его хотя бы с ладонь,
      // чтобы масштаб не ушёл в ноль и минус; настоящий размер придёт с ResizeObserver.
      this.W = Math.max(120, box.width);
      this.H = Math.max(120, box.height);
      this.over.setAttribute('viewBox', `0 0 ${this.W} ${this.H}`);
      this.over.setAttribute('width', this.W);
      this.over.setAttribute('height', this.H);
      // Нижний слой вдвое больше окна: при сдвиге пальцем край, который ещё
      // не перерисован, уже нарисован заранее.
      this.base.style.left = `${-this.W / 2}px`;
      this.base.style.top = `${-this.H / 2}px`;
      // Размер задаётся стилем, а не атрибутом: общее правило приложения
      // «svg { max-width: 100% }» иначе сжимает подложку до ширины окна, и
      // берега уезжают от точек городов.
      this.base.style.width = `${this.W * 2}px`;
      this.base.style.height = `${this.H * 2}px`;
      // Кнопки масштаба лежат поверх карты: подпись под ними не прочесть.
      const tools = this.host.querySelector('.geo-map__tools')?.getBoundingClientRect();
      this.toolsBox = tools?.width ? [tools.left - box.left - 4, tools.top - box.top - 4, tools.right - box.left + 4, tools.bottom - box.top + 4] : null;
      const f = this.frame;
      this.kFit = Math.min((this.W - 8) / f.w, (this.H - 8) / f.h);
      this.kMin = this.kFit * 0.9;
      this.kMax = this.kFit * 60;
      if (!this.live) this.live = { x: 0, y: 0, k: this.kFit };
    }

    zoom() { return this.live.k / this.kFit; }

    center() {
      return { x: this.live.x + this.W / (2 * this.live.k), y: this.live.y + this.H / (2 * this.live.k) };
    }

    clamp(view) {
      const f = this.frame;
      const k = Math.min(this.kMax, Math.max(this.kMin, view.k));
      const w = this.W / k; const h = this.H / k;
      const x = w >= f.w ? (f.w - w) / 2 : Math.min(f.w - w * 0.75, Math.max(-w * 0.25, view.x));
      const y = h >= f.h ? (f.h - h) / 2 : Math.min(f.h - h * 0.75, Math.max(-h * 0.25, view.y));
      return { x, y, k };
    }

    centerOn(cx, cy, k, animate = true) {
      const target = this.clamp({ x: cx - this.W / (2 * k), y: cy - this.H / (2 * k), k });
      if (animate) this.animateTo(target); else this.setView(target, true);
    }

    /** Лист во всю высоту окна: в узком окне так видно больше, чем вся карта в полоске. */
    cover(lat, lon, animate = false) {
      const f = this.frame;
      const k = Math.max(this.kFit, Math.min(this.W / f.w, this.H / f.h) === this.W / f.w ? (this.H / f.h) * 0.96 : this.kFit);
      this.centerOn(...this.project(lon, lat), k, animate);
    }

    fitAll(animate = true) {
      const f = this.frame;
      this.centerOn(f.w / 2, f.h / 2, this.kFit, animate);
    }

    /** Показать набор мест целиком, с полями. */
    // room — запас справа под подписи точек; там, где подписей нет, он не нужен.
    fitPlaces(ids, { animate = true, maxZoom = 14, pad = this.padding, room = 90 } = {}) {
      const points = ids.map((id) => this.markers.get(id)).filter(Boolean);
      if (!points.length) return;
      const xs = points.map((m) => m.x); const ys = points.map((m) => m.y);
      const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
      const k = Math.min((this.W - pad * 2 - room) / Math.max(1, x1 - x0), (this.H - pad * 2) / Math.max(1, y1 - y0), this.kFit * maxZoom);
      this.centerOn((x0 + x1) / 2 + room / 3 / k, (y0 + y1) / 2, k, animate);
    }

    fitPoints(points, { animate = true, maxZoom = 14 } = {}) {
      const projected = points.map(([lat, lon]) => this.project(lon, lat));
      const xs = projected.map((p) => p[0]); const ys = projected.map((p) => p[1]);
      const pad = this.padding;
      const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
      const k = Math.min((this.W - pad * 2 - 90) / Math.max(1, x1 - x0), (this.H - pad * 2) / Math.max(1, y1 - y0), this.kFit * maxZoom);
      this.centerOn((x0 + x1) / 2 + 30 / k, (y0 + y1) / 2, k, animate);
    }

    animateTo(target, duration = 520) {
      cancelAnimationFrame(this.animation);
      const from = { ...this.live };
      const start = performance.now();
      const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      if (reduce) { this.setView(target, true); return; }
      const step = (now) => {
        if (this.destroyed) return;
        const t = Math.min(1, (now - start) / duration);
        const e = t < 0.5 ? 4 * t * t * t : 1 - ((-2 * t + 2) ** 3) / 2;
        // Масштаб — по логарифму: иначе приближение сначала тянется, а потом прыгает.
        const k = Math.exp(Math.log(from.k) + (Math.log(target.k) - Math.log(from.k)) * e);
        const cx0 = from.x + this.W / (2 * from.k); const cy0 = from.y + this.H / (2 * from.k);
        const cx1 = target.x + this.W / (2 * target.k); const cy1 = target.y + this.H / (2 * target.k);
        const cx = cx0 + (cx1 - cx0) * e; const cy = cy0 + (cy1 - cy0) * e;
        this.setView({ x: cx - this.W / (2 * k), y: cy - this.H / (2 * k), k }, t === 1);
        if (t < 1) this.animation = requestAnimationFrame(step);
      };
      this.animation = requestAnimationFrame(step);
    }

    setView(view, commit) {
      this.live = view;
      if (!this.committed || commit) this.commit();
      else {
        const c = this.committed;
        const s = view.k / c.k;
        this.base.style.transform = `translate(${(c.x - view.x) * view.k}px, ${(c.y - view.y) * view.k}px) scale(${s})`;
        clearTimeout(this.commitTimer);
        this.commitTimer = setTimeout(() => { if (!this.pointers.size) this.commit(); }, 160);
      }
      this.schedule();
    }

    commit() {
      const v = this.live;
      const pad = { x: this.W / 2 / v.k, y: this.H / 2 / v.k };
      this.base.setAttribute('viewBox', `${v.x - pad.x} ${v.y - pad.y} ${(this.W * 2) / v.k} ${(this.H * 2) / v.k}`);
      this.base.style.transform = '';
      this.committed = { ...v };
      const z = this.zoom();
      for (const image of this.holyImages) image.style.opacity = z < 2.4 ? '0' : String(Math.min(1, (z - 2.4) / 1.6));
      this.host.classList.toggle('is-close', z > 6);
    }

    schedule() {
      if (this.frameRequest) return;
      this.frameRequest = requestAnimationFrame(() => {
        this.frameRequest = 0;
        if (!this.destroyed) this.draw();
      });
    }

    toScreen(x, y) {
      return [(x - this.live.x) * this.live.k, (y - this.live.y) * this.live.k];
    }

    /** Какие точки показывать и как: всё, список или ничего. */
    setMarkers(ids, { labels = 'auto', classes = new Map(), badges = new Map() } = {}) {
      this.visible = new Set(ids);
      this.labelPolicy = labels;
      this.classes = classes;
      this.badges = badges;
      for (const [id, marker] of this.markers) {
        const cls = classes.get(id) || '';
        marker.group.setAttribute('class', `geo-pin geo-pin--${marker.place.kind}${marker.place.approx ? ' geo-pin--approx' : ''} ${cls}`);
        const badge = badges.get(id);
        marker.badge.textContent = badge == null ? '' : String(badge);
        marker.group.classList.toggle('geo-pin--numbered', badge != null);
      }
      this.updateLabels();
      this.schedule();
    }

    setLayer(layer) {
      this.layer = layer;
      this.host.dataset.layer = layer;
      this.updateLabels();
      this.schedule();
    }

    updateLabels() {
      for (const marker of this.markers.values()) {
        const { place } = marker;
        const modern = place.country === place.now || place.country === 'Jerusalem' ? place.now : `${place.now}, ${place.country}`;
        if (this.layer === 'modern') { marker.label.textContent = place.now; marker.sub.textContent = ''; }
        else if (this.layer === 'both') { marker.label.textContent = place.name; marker.sub.textContent = place.now === place.name ? '' : modern; }
        else { marker.label.textContent = place.name; marker.sub.textContent = ''; }
      }
    }

    setRoutes(routes) {
      this.routes = routes;
      this.routeLayer.innerHTML = routes.map((route, index) => `<path class="geo-route geo-route--${route.style || 'main'}" data-route="${index}"/>`).join('');
      this.schedule();
    }

    draw() {
      const z = this.zoom();
      // Пути.
      this.routes.forEach((route, index) => {
        const node = this.routeLayer.children[index];
        if (!node) return;
        const d = route.points.map(([x, y], i) => {
          const [sx, sy] = this.toScreen(x, y);
          return `${i ? 'L' : 'M'}${sx.toFixed(1)} ${sy.toFixed(1)}`;
        }).join('');
        node.setAttribute('d', d);
      });

      // Точки и подписи. Сначала ставятся все точки — подпись не должна лечь на
      // точку, даже если та нарисована позже. Потом подписи: выбранные, крупные
      // города, остальные; подпись, которая наехала на поставленное, ушла за
      // край или под кнопки, прячется — номер на точке остаётся.
      const boxes = this.toolsBox ? [this.toolsBox] : [];
      const tierZoom = [0, 0, 2.2, 4.8];
      const order = [...this.visible].map((id) => this.markers.get(id)).filter(Boolean)
        .sort((a, b) => this.priority(b) - this.priority(a));
      for (const marker of this.markers.values()) if (!this.visible.has(marker.place.id)) marker.group.style.display = 'none';
      const both = this.layer === 'both';
      const shown = [];
      for (const marker of order) {
        const [sx, sy] = this.toScreen(marker.x, marker.y);
        const off = sx < -40 || sy < -40 || sx > this.W + 40 || sy > this.H + 40;
        const cls = this.classes.get(marker.place.id) || '';
        const forced = /is-(focus|picked|right|wrong|stop|candidate)/.test(cls);
        const nearHidden = marker.place.near && z < 22 && !forced;
        if (off || nearHidden) { marker.group.style.display = 'none'; continue; }
        marker.group.style.display = '';
        marker.group.setAttribute('transform', `translate(${sx.toFixed(1)} ${sy.toFixed(1)})`);
        boxes.push([sx - 6, sy - 6, sx + 6, sy + 6]);
        shown.push({ marker, sx, sy, cls, forced });
      }
      const hits = (box) => boxes.some((b) => box[0] < b[2] && box[2] > b[0] && box[1] < b[3] && box[3] > b[1]);
      const inside = (box) => box[0] >= 2 && box[2] <= this.W - 2 && box[1] >= 2 && box[3] <= this.H - 2;
      for (const { marker, sx, sy, cls, forced } of shown) {
        let showLabel = false;
        if (this.labelPolicy === 'all') showLabel = true;
        else if (this.labelPolicy === 'auto') showLabel = forced || z >= tierZoom[marker.place.tier || 3];
        else if (this.labelPolicy === 'marked') showLabel = /is-(right|wrong|reveal|focus|stop)/.test(cls);
        // Второй строкой «что там сегодня» подписаны только выделенные точки:
        // у каждой из двадцати точек она закрыла бы карту.
        const always = /is-(focus|right|wrong)/.test(cls);
        const withSub = both && Boolean(marker.sub.textContent) && (always || /is-(stop|picked)/.test(cls));
        marker.group.classList.toggle('geo-pin--nosub', !withSub);
        if (showLabel) {
          const width = Math.max(marker.label.textContent.length * 7.4, withSub ? marker.sub.textContent.length * 6.1 : 0) + 12;
          const height = withSub ? 30 : 17;
          const right = [sx + 6, sy - 11, sx + 6 + width, sy - 11 + height];
          const left = [sx - 6 - width, sy - 11, sx - 6, sy - 11 + height];
          const fits = (box) => inside(box) && !hits(box);
          // Справа, если там свободно; иначе слева; выбранная точка подписана
          // всегда — с той стороны, где подпись хотя бы не уходит за край.
          let box = fits(right) ? right : fits(left) ? left : null;
          if (!box && always) box = inside(right) || !inside(left) ? right : left;
          if (!box) showLabel = false;
          else {
            boxes.push(box);
            marker.group.classList.toggle('geo-pin--left', box === left);
          }
        }
        marker.group.classList.toggle('geo-pin--nolabel', !showLabel);
      }

      // Подписи областей, морей, рек и городов — после точек и только туда, где
      // не наедут на уже поставленное: точка героя важнее надписи «Васан».
      const width = { region: 10.5, country: 9.6, territory: 6.2, sea: 6.6, river: 6.1, city: 6.4 };
      for (const region of this.regions) {
        const kind = region.city ? 'city' : region.node.classList.contains('geo-region--river') ? 'river' : region.label?.kind || 'region';
        let shown = (region.kind === 'ancient' ? this.layer !== 'modern' : this.layer !== 'ancient')
          && z >= region.z[0] && z <= region.z[1];
        const [sx, sy] = this.toScreen(region.x, region.y);
        if (shown && (sx < -80 || sy < -20 || sx > this.W + 80 || sy > this.H + 20)) shown = false;
        if (shown) {
          const w = region.node.textContent.length * (width[kind] || 9);
          const box = region.city ? [sx - 3, sy - 7, sx + 8 + w, sy + 7] : [sx - w / 2, sy - 11, sx + w / 2, sy + 4];
          // Обрезанное краем «…СОПОТАМИЯ» читается хуже, чем никакое.
          if (!inside(box) || hits(box)) shown = false;
          else boxes.push(box);
        }
        region.node.style.display = shown ? '' : 'none';
        if (region.dot) region.dot.style.display = shown ? '' : 'none';
        if (!shown) continue;
        if (region.dot) {
          region.dot.setAttribute('cx', sx.toFixed(1));
          region.dot.setAttribute('cy', sy.toFixed(1));
          region.node.setAttribute('x', (sx + 6).toFixed(1));
          region.node.setAttribute('y', (sy + 4).toFixed(1));
        } else {
          region.node.setAttribute('x', sx.toFixed(1));
          region.node.setAttribute('y', sy.toFixed(1));
        }
      }
      this.onView?.(this);
    }

    priority(marker) {
      const cls = this.classes.get(marker.place.id) || '';
      if (/is-(focus|picked)/.test(cls)) return 100;
      if (/is-(right|wrong|stop|candidate)/.test(cls)) return 80 - (this.badges.get(marker.place.id) || 0) * 0.01;
      return 10 - (marker.place.tier || 3);
    }

    // ——— жесты

    point(event) {
      const box = this.over.getBoundingClientRect();
      return { x: event.clientX - box.left, y: event.clientY - box.top };
    }

    onPointerDown(event) {
      if (event.button !== undefined && event.button !== 0) return;
      cancelAnimationFrame(this.animation);
      this.over.setPointerCapture?.(event.pointerId);
      const p = this.point(event);
      this.pointers.set(event.pointerId, p);
      this.gesture = {
        view: { ...this.live },
        start: p,
        moved: false,
        pinch: this.pointers.size === 2 ? this.pinchState() : null,
      };
      this.host.classList.add('is-moving');
    }

    pinchState() {
      const [a, b] = [...this.pointers.values()];
      return { dist: Math.hypot(a.x - b.x, a.y - b.y) || 1, mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, view: { ...this.live } };
    }

    onPointerMove(event) {
      if (!this.pointers.has(event.pointerId) || !this.gesture) return;
      const p = this.point(event);
      this.pointers.set(event.pointerId, p);
      if (this.pointers.size >= 2) {
        if (!this.gesture.pinch) this.gesture.pinch = this.pinchState();
        const { dist, mid, view } = this.gesture.pinch;
        const [a, b] = [...this.pointers.values()];
        const now = Math.hypot(a.x - b.x, a.y - b.y) || 1;
        const center = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        const k = Math.min(this.kMax, Math.max(this.kMin, view.k * (now / dist)));
        const anchor = { x: view.x + mid.x / view.k, y: view.y + mid.y / view.k };
        this.gesture.moved = true;
        this.setView(this.clamp({ x: anchor.x - center.x / k, y: anchor.y - center.y / k, k }), false);
        return;
      }
      const dx = p.x - this.gesture.start.x; const dy = p.y - this.gesture.start.y;
      if (!this.gesture.moved && Math.hypot(dx, dy) < 6) return;
      this.gesture.moved = true;
      const { view } = this.gesture;
      this.setView(this.clamp({ x: view.x - dx / view.k, y: view.y - dy / view.k, k: view.k }), false);
    }

    onPointerUp(event) {
      if (!this.pointers.has(event.pointerId)) return;
      const p = this.point(event);
      this.pointers.delete(event.pointerId);
      if (this.pointers.size === 1 && this.gesture) {
        // Второй палец поднят — продолжаем вести первым без скачка.
        const [rest] = [...this.pointers.values()];
        this.gesture = { view: { ...this.live }, start: rest, moved: true, pinch: null };
        return;
      }
      if (this.pointers.size) return;
      const gesture = this.gesture;
      this.gesture = null;
      this.host.classList.remove('is-moving');
      this.commit();
      this.schedule();
      if (!gesture || gesture.moved) return;
      const now = performance.now();
      if (this.lastTap && now - this.lastTap.time < 320 && Math.hypot(p.x - this.lastTap.x, p.y - this.lastTap.y) < 30 && !this.hit(p)) {
        this.lastTap = null;
        this.zoomAt(p, 2);
        return;
      }
      this.lastTap = { time: now, x: p.x, y: p.y };
      const marker = this.hit(p);
      this.onTap?.(marker ? marker.place : null, p);
    }

    hit(p) {
      let best = null; let bestDistance = 26;
      for (const id of this.visible) {
        const marker = this.markers.get(id);
        if (!marker || marker.group.style.display === 'none') continue;
        const [sx, sy] = this.toScreen(marker.x, marker.y);
        const distance = Math.hypot(sx - p.x, sy - p.y);
        if (distance < bestDistance) { best = marker; bestDistance = distance; }
      }
      return best;
    }

    zoomAt(p, factor) {
      const v = this.live;
      const k = Math.min(this.kMax, Math.max(this.kMin, v.k * factor));
      const anchor = { x: v.x + p.x / v.k, y: v.y + p.y / v.k };
      this.animateTo(this.clamp({ x: anchor.x - p.x / k, y: anchor.y - p.y / k, k }), 280);
    }

    onWheel(event) {
      event.preventDefault();
      const p = this.point(event);
      const v = this.live;
      const k = Math.min(this.kMax, Math.max(this.kMin, v.k * Math.exp(-event.deltaY * 0.0016)));
      const anchor = { x: v.x + p.x / v.k, y: v.y + p.y / v.k };
      this.setView(this.clamp({ x: anchor.x - p.x / k, y: anchor.y - p.y / k, k }), false);
    }

    onTool(event) {
      const button = event.target.closest('[data-map]');
      if (!button) return;
      const center = { x: this.W / 2, y: this.H / 2 };
      if (button.dataset.map === 'in') this.zoomAt(center, 2);
      else if (button.dataset.map === 'out') this.zoomAt(center, 0.5);
      else this.fitAll(true);
    }

    destroy() {
      this.destroyed = true;
      cancelAnimationFrame(this.animation);
      cancelAnimationFrame(this.frameRequest);
      clearTimeout(this.commitTimer);
      this.resizeObserver?.disconnect();
      this.host.innerHTML = '';
    }
  }

  // ————————————————————————————————————————————— игра

  let session = null;

  function start() {
    const container = document.getElementById('game-container');
    if (!container) return;
    window.__bibleGeographyCleanup?.();
    injectStyles();
    container.innerHTML = '<div class="app-game-loading"><div class="app-loader__ring"></div><p>Karte wird entrollt…</p></div>';

    const token = {};
    session = token;
    Promise.all([loadScript(LOGIC), loadJSON(DATA), loadJSON(MAP), loadJSON(ART, {}), loadJSON(GALLERY)]).then(([, data, map, art, gallery]) => {
      if (session !== token || document.body.dataset.currentGame !== 'bible-geography') return;
      session = new Game(container, data, map, art, gallery);
      window.__bibleGeographyCleanup = () => { session?.destroy?.(); session = null; };
    }).catch((error) => {
      console.error('Biblische Geografie:', error);
      if (session !== token) return;
      container.innerHTML = `\n        <section class="app-error-card fade-in">\n          <h2>Die Karte wurde nicht geladen</h2>\n          <p>Prüfe die Verbindung und öffne das Spiel erneut.</p>\n          <button class="back-button" type="button" onclick="goToMainMenu()">Zum Hauptmenü</button>\n        </section>`;
    });
  }

  class Game {
    constructor(container, data, map, art, gallery) {
      this.container = container;
      this.data = data;
      this.mapData = map;
      this.art = art || {};
      this.gallery = gallery || { assets: {}, places: {}, copy: {} };
      this.logic = window.BibleGeographyLogic.create(data);
      this.store = readStore();
      this.store.learned = Array.isArray(this.store.learned) ? this.store.learned : [];
      this.store.found = Array.isArray(this.store.found) ? this.store.found : [];
      this.store.best = this.store.best && typeof this.store.best === 'object' ? this.store.best : {};
      const settings = this.store.settings || {};
      this.settings = {
        level: LEVEL_NAMES[settings.level] ? settings.level : 'easy',
        testament: TESTAMENTS[settings.testament] ? settings.testament : 'all',
        layer: LAYERS[settings.layer] ? settings.layer : 'ancient',
      };
      this.random = window.BibleGeographyLogic.rng(Date.now() % 2147483647);
      this.timers = new Set();
      this.mapView = null;
      this.root = document.createElement('section');
      this.root.className = 'geo';
      container.innerHTML = '';
      container.appendChild(this.root);
      this.onClick = this.onClick.bind(this);
      this.onResize = () => this.drawLines();
      this.root.addEventListener('click', this.onClick);
      window.addEventListener('resize', this.onResize);
      this.showHub();
    }

    // ——— общее

    save() {
      this.store.settings = this.settings;
      writeStore(this.store);
    }

    later(fn, ms) {
      const id = setTimeout(() => { this.timers.delete(id); fn(); }, ms);
      this.timers.add(id);
      return id;
    }

    learn(heroId, placeId) {
      const key = this.logic.linkKey(heroId, placeId);
      if (!this.store.learned.includes(key)) this.store.learned.push(key);
    }

    place(id) { return this.logic.places.get(id); }

    hero(id) { return this.logic.heroes.get(id); }

    dropMap() {
      this.mapView?.destroy();
      this.mapView = null;
    }

    render(html) {
      this.dropMap();
      this.root.innerHTML = html;
      this.root.scrollIntoView?.({ block: 'start' });
      window.scrollTo({ top: 0, behavior: 'auto' });
    }

    bar(title, sub = '', right = '') {
      return `\n        <div class="geo-bar">\n          <button type="button" class="geo-bar__back" data-act="hub" aria-label="Zur Modusauswahl">${icon('back')}</button>
          <div class="geo-bar__title"><strong>${escapeHTML(title)}</strong>${sub ? `<small>${escapeHTML(sub)}</small>` : ''}</div>
          <div class="geo-bar__score">${right}</div>
        </div>`;
    }

    refLink(stop) {
      return `<span class="geo-ref">${escapeHTML(stop.r)}</span>`;
    }

    factHTML(hero, stop, { quote = true } = {}) {
      const place = this.place(stop.p);
      return `
        <article class="geo-fact">
          <p class="geo-fact__head"><b>${escapeHTML(this.logic.heroLabel(hero))}</b> <span aria-hidden="true">→</span> <b>${escapeHTML(place.name)}</b></p>
          <p class="geo-fact__note">${escapeHTML(stop.n)}</p>
          ${quote ? `<blockquote class="geo-quote">«${escapeHTML(stop.q)}»<cite>${this.refLink(stop)}</cite></blockquote>` : ''}
        </article>`;
    }

    /** «Наблус, Западный берег» — но просто «Иерусалим» и просто «Египет». */
    modernName(place) {
      return place.country === place.now || place.country === 'Jerusalem' ? place.now : `${place.now}, ${place.country}`;
    }

    placeLine(place) {
      const country = place.country === place.now ? '' : `, ${place.country}`;
      return `Heute: ${place.now}${country}${place.site ? ` — ${place.site}` : ''}${place.approx && !place.noted ? '. Die Lage ist nur ungefähr bekannt' : ''}.`;
    }

    onClick(event) {
      const target = event.target.closest('[data-act]');
      if (!target || !this.root.contains(target)) return;
      const act = target.dataset.act;
      const handlers = {
        hub: () => this.showHub(),
        menu: () => goToMainMenu(),
        mode: () => this.startMode(target.dataset.mode),
        level: () => { this.settings.level = target.dataset.value; this.save(); this.showHub(); },
        testament: () => { this.settings.testament = target.dataset.value; this.save(); this.showHub(); },
        again: () => this.startMode(this.mode),
        pick: () => this.matchPick(target),
        toggle: () => this.multiToggle(target),
        check: () => this.multiCheck(),
        next: () => this.next(),
        answer: () => this.thenNowAnswer(target),
        layer: () => this.setLayer(target.dataset.value),
        tab: () => this.atlasTab(target.dataset.value),
        hero: () => this.atlasHero(target.dataset.id),
        journey: () => this.atlasJourney(target.dataset.id),
        stop: () => this.atlasStop(target.dataset.id),
        'gallery-prev': () => this.atlasGalleryMove(-1),
        'gallery-next': () => this.atlasGalleryMove(1),
        'gallery-index': () => this.atlasGallerySelect(Number(target.dataset.index)),
        'gallery-focus': () => this.atlasStop(target.dataset.id),
        clear: () => this.atlasClear(),
        quote: () => target.closest('.geo-fact')?.classList.toggle('is-open'),
      };
      handlers[act]?.();
    }

    // ——— хаб

    showHub() {
      this.mode = null;
      const total = this.logic.allLinks.length;
      const learned = this.store.learned.filter((key) => this.logic.allLinks.includes(key)).length;
      const share = Math.round((learned / Math.max(1, total)) * 100);
      const best = (mode) => {
        const value = this.store.best?.[mode]?.[this.settings.level];
        if (value == null) return '<span class="geo-mode__best is-empty">noch nicht gespielt</span>';
        return `<span class="geo-mode__best">Bestwert: ${'★'.repeat(value)}${'☆'.repeat(3 - value)}</span>`;
      };
      const segment = (act, options, current) => Object.entries(options).map(([value, label]) => `
        <button type="button" class="geo-seg__item${value === current ? ' is-on' : ''}" data-act="${act}" data-value="${value}" aria-pressed="${value === current}">${escapeHTML(label)}</button>`).join('');
      const modeCard = (mode) => `
        <button type="button" class="geo-mode geo-mode--${mode}" data-act="mode" data-mode="${mode}">
          <span class="geo-mode__icon">${icon(mode, 26)}</span>
          <span class="geo-mode__text"><strong>${escapeHTML(MODES[mode].title)}</strong><small>${escapeHTML(MODES[mode].note)}</small>${mode === 'atlas' ? '' : best(mode)}</span>
        </button>`;
      this.render(`\n        <div class="geo-hero">\n          <svg class="geo-hero__art" viewBox="0 0 220 140" aria-hidden="true">\n            <path class="geo-hero__coast" d="M0 92c26-6 40 6 62-2s30-26 52-22 22 24 46 22 34-18 60-14v64H0z"/>\n            <path class="geo-hero__route" d="M28 74c22-30 54-36 78-22s46 4 58-20 32-18 44-8"/>\n            <circle class="geo-hero__dot" cx="28" cy="74" r="5"/><circle class="geo-hero__dot" cx="106" cy="52" r="5"/><circle class="geo-hero__dot" cx="164" cy="32" r="5"/><circle class="geo-hero__dot geo-hero__dot--end" cx="208" cy="24" r="6"/>\n          </svg>\n          <p class="geo-kicker">Personen · orte · Wege</p>\n          <h2 class="geo-title">Biblische Geografie</h2>\n          <p class="geo-lead">Wo die Menschen der Bibel lebten, weilten und unterwegs waren — und was heute an diesen Orten ist.</p>\n          <div class="geo-progress" role="img" aria-label="Gelernte Verbindungen: ${learned} von ${total}">
            <span class="geo-progress__track"><span style="width:${share}%"></span></span>\n            <span class="geo-progress__text">Gelernte Verbindungen: <b>${learned}</b> von ${total}</span>\n          </div>\n        </div>\n        <section class="geo-card geo-setup">\n          <div class="geo-setup__row"><span class="geo-setup__label">Schwierigkeit</span><div class="geo-seg">${segment('level', LEVEL_NAMES, this.settings.level)}</div></div>\n          <div class="geo-setup__row"><span class="geo-setup__label">Personen aus</span><div class="geo-seg">${segment('testament', TESTAMENTS, this.settings.testament)}</div></div>
        </section>
        <div class="geo-modes">
          ${['match', 'multi', 'where', 'thennow'].map(modeCard).join('')}
          ${modeCard('atlas')}\n        </div>\n        <button type="button" class="back-button geo-menu" data-act="menu">Zum Hauptmenü</button>`);
    }

    startMode(mode) {
      this.mode = mode;
      this.round = 0;
      this.score = { right: 0, wrong: 0, points: 0, perfect: 0, total: 0 };
      this.used = new Set();
      haptic('select');
      if (mode === 'atlas') { this.showAtlas(); return; }
      this.next();
    }

    next() {
      const total = MODES[this.mode].rounds;
      if (this.round >= total) { this.finish(); return; }
      this.round += 1;
      const filter = { level: this.settings.level, testament: this.settings.testament, exclude: this.used };
      if (this.mode === 'match') this.showMatch(this.logic.matchRound(this.random, filter));
      else if (this.mode === 'multi') this.showMulti(this.logic.multiQuestion(this.random, filter));
      else if (this.mode === 'where') this.showWhere(this.logic.whereQuestion(this.random, filter));
      else if (this.mode === 'thennow') this.showThenNow(this.logic.thenNowQuestion(this.random, filter));
    }

    roundLabel() {
      return this.mode === 'match' ? `Runde ${this.round} von ${MODES.match.rounds}` : `Frage ${this.round} von ${MODES[this.mode].rounds}`;
    }

    scoreHTML() {
      return `<span class="geo-score geo-score--right" aria-label="Richtig">${this.score.right}</span><span class="geo-score geo-score--wrong" aria-label="Fehler">${this.score.wrong}</span>`;
    }

    finish() {
      const { right, wrong } = this.score;
      const accuracy = right + wrong ? right / (right + wrong) : 0;
      const stars = accuracy >= 0.95 ? 3 : accuracy >= 0.75 ? 2 : accuracy >= 0.45 ? 1 : 0;
      const bucket = this.store.best[this.mode] || {};
      if (stars > (bucket[this.settings.level] ?? -1)) bucket[this.settings.level] = stars;
      this.store.best[this.mode] = bucket;
      this.store.games = (this.store.games || 0) + 1;
      this.save();
      haptic(stars >= 2 ? 'success' : 'warning');
      const words = ['Versuch es noch einmal', 'Ein guter Anfang', 'Ausgezeichnet', 'Makellos'];
      this.render(`
        ${this.bar(MODES[this.mode].title, 'Ergebnis')}\n        <section class="geo-card geo-result">\n          <p class="geo-result__stars" aria-label="Sterne: ${stars} von 3">${'★'.repeat(stars)}<span>${'★'.repeat(3 - stars)}</span></p>
          <h3>${words[stars]}</h3>\n          <p class="geo-result__line">Richtig: <b>${right}</b> · Fehler: <b>${wrong}</b> · genauigkeit ${Math.round(accuracy * 100)}%</p>\n          <p class="geo-result__line">Level: ${escapeHTML(LEVEL_NAMES[this.settings.level])} · ${escapeHTML(TESTAMENTS[this.settings.testament])}</p>\n        </section>\n        <div class="geo-actions">\n          <button type="button" class="geo-primary" data-act="again">Noch einmal</button>\n          <button type="button" class="geo-secondary" data-act="hub">Anderer Modus</button>\n        </div>`);
    }

    // ——— Соедини

    showMatch(round) {
      if (!round) { this.finish(); return; }
      this.matchState = { round, picked: null, done: new Map(), color: 0 };
      const heroCard = (id) => {
        const hero = this.hero(id);
        return `<button type="button" class="geo-node geo-node--hero" data-act="pick" data-side="hero" data-id="${id}">
          <strong>${escapeHTML(hero.name)}</strong>${hero.tag ? `<small>${escapeHTML(hero.tag)}</small>` : ''}<i class="geo-node__mark" aria-hidden="true"></i></button>`;
      };
      const placeCard = (id) => {
        const place = this.place(id);
        return `<button type="button" class="geo-node geo-node--place" data-act="pick" data-side="place" data-id="${id}">
          <i class="geo-node__mark" aria-hidden="true"></i><strong>${escapeHTML(place.name)}</strong>${place.aka ? `<small>${escapeHTML(place.aka)}</small>` : ''}</button>`;
      };
      this.render(`
        ${this.bar('Verbinde', this.roundLabel(), this.scoreHTML())}\n        <p class="geo-hint">Tippe auf eine Person und dann auf einen Ort, an dem sie war. Oder umgekehrt.</p>\n        <div class="geo-match">\n          <svg class="geo-match__lines" aria-hidden="true"></svg>\n          <div class="geo-col" role="group" aria-label="Personen">${round.left.map(heroCard).join('')}</div>\n          <div class="geo-col" role="group" aria-label="Orte">${round.right.map(placeCard).join('')}</div>
        </div>
        <div class="geo-feed" aria-live="polite"></div>`);
      this.drawLines();
    }

    matchPick(button) {
      const state = this.matchState;
      if (!state || button.classList.contains('is-done')) return;
      const side = button.dataset.side;
      const id = button.dataset.id;
      haptic('select');
      if (!state.picked || state.picked.side === side) {
        this.root.querySelectorAll('.geo-node.is-picked').forEach((node) => node.classList.remove('is-picked'));
        if (state.picked?.id === id) { state.picked = null; return; }
        state.picked = { side, id, node: button };
        button.classList.add('is-picked');
        return;
      }
      const heroId = side === 'hero' ? id : state.picked.id;
      const placeId = side === 'place' ? id : state.picked.id;
      const other = state.picked.node;
      state.picked = null;
      other.classList.remove('is-picked');
      const pair = state.round.pairs.find((one) => one.hero === heroId);
      if (pair && pair.place === placeId) {
        const color = PAIR_COLORS[state.color % PAIR_COLORS.length];
        state.color += 1;
        state.done.set(heroId, { place: placeId, color });
        for (const node of [button, other]) {
          node.classList.remove('is-wrong');
          node.classList.add('is-done');
          node.style.setProperty('--pair', color);
          node.querySelector('.geo-node__mark').textContent = String(state.done.size);
          node.setAttribute('aria-disabled', 'true');
        }
        this.score.right += 1;
        this.learn(heroId, placeId);
        this.save();
        haptic('success');
        this.drawLines();
        const feed = this.root.querySelector('.geo-feed');
        if (feed) feed.innerHTML = this.factHTML(this.hero(heroId), pair.stop);
        if (state.done.size === state.round.pairs.length) {
          this.root.querySelector('.geo-feed')?.insertAdjacentHTML('beforeend',
            `<button type="button" class="geo-primary geo-next" data-act="next">${this.round >= MODES.match.rounds ? 'Ergebnis' : 'Weiter'}</button>`);
        }
      } else {
        this.score.wrong += 1;
        haptic('error');
        for (const node of [button, other]) {
          node.classList.remove('is-wrong');
          void node.offsetWidth;
          node.classList.add('is-wrong');
        }
        // Красная рамка — только на время встряски: дальше карточка снова обычная.
        this.later(() => { button.classList.remove('is-wrong'); other.classList.remove('is-wrong'); }, 700);
        const hero = this.hero(heroId);
        const place = this.place(placeId);
        const feed = this.root.querySelector('.geo-feed');
        if (feed) feed.innerHTML = `<p class="geo-miss">Kein Paar: ${escapeHTML(this.logic.heroLabel(hero))} — ${escapeHTML(place.name)}</p>`;
      }
      const bar = this.root.querySelector('.geo-bar__score');
      if (bar) bar.innerHTML = this.scoreHTML();
    }

    drawLines() {
      const svg = this.root.querySelector('.geo-match__lines');
      const state = this.matchState;
      if (!svg || !state) return;
      const box = svg.getBoundingClientRect();
      svg.setAttribute('viewBox', `0 0 ${box.width} ${box.height}`);
      const lines = [];
      for (const [heroId, { place, color }] of state.done) {
        const a = this.root.querySelector(`.geo-node--hero[data-id="${heroId}"]`)?.getBoundingClientRect();
        const b = this.root.querySelector(`.geo-node--place[data-id="${place}"]`)?.getBoundingClientRect();
        if (!a || !b) continue;
        const x1 = a.right - box.left - 2; const y1 = a.top + a.height / 2 - box.top;
        const x2 = b.left - box.left + 2; const y2 = b.top + b.height / 2 - box.top;
        const mid = (x1 + x2) / 2;
        lines.push(`<path d="M${x1} ${y1}C${mid} ${y1} ${mid} ${y2} ${x2} ${y2}" stroke="${color}"/>`);
      }
      svg.innerHTML = lines.join('');
    }

    // ——— Все места героя

    showMulti(question) {
      if (!question) { this.finish(); return; }
      this.used.add(question.hero);
      this.multiState = { question, picked: new Set(), checked: false };
      const hero = this.hero(question.hero);
      const count = question.correct.length;
      // Фразы целиком, а не склейка «был» + имя: так их можно перевести, не
      // ломая порядок слов в другом языке.
      const where = hero.g === 'f' ? 'Markiere alle Orte, an denen sie war.'
        : hero.g === 'p' ? 'Markiere alle Orte, an denen sie waren.' : 'Markiere alle Orte, an denen er war.';
      const ask = question.showCount
        ? `${where} <span class="geo-ask__count">Richtige Antworten: <b>${count}</b></span>`
        : `${where} <span class="geo-ask__count">Wie viele richtig sind, verraten wir nicht.</span>`;
      this.render(`
        ${this.bar('Alle Orte einer Person', this.roundLabel(), this.scoreHTML())}
        <section class="geo-card geo-ask">
          <p class="geo-kicker">${escapeHTML(hero.era)} · ${hero.t === 'ot' ? 'Altes Testament' : 'Neues Testament'}</p>
          <h3>${escapeHTML(this.logic.heroLabel(hero))}</h3>
          <p class="geo-ask__about">${escapeHTML(hero.about)}</p>
          <p class="geo-ask__task">${ask}</p>
        </section>
        <div class="geo-options">
          ${question.options.map((id) => {
            const place = this.place(id);
            return `<button type="button" class="geo-option" data-act="toggle" data-id="${id}" aria-pressed="false">
              <i class="geo-option__box" aria-hidden="true"></i><span>${escapeHTML(place.name)}</span></button>`;
          }).join('')}\n        </div>\n        <button type="button" class="geo-primary geo-check" data-act="check" disabled>Prüfen</button>\n        <div class="geo-feed" aria-live="polite"></div>`);
    }

    multiToggle(button) {
      const state = this.multiState;
      if (!state || state.checked) return;
      const id = button.dataset.id;
      if (state.picked.has(id)) state.picked.delete(id); else state.picked.add(id);
      button.classList.toggle('is-on', state.picked.has(id));
      button.setAttribute('aria-pressed', String(state.picked.has(id)));
      haptic('select');
      const check = this.root.querySelector('.geo-check');
      if (check) check.disabled = state.picked.size === 0;
    }

    multiCheck() {
      const state = this.multiState;
      if (!state || state.checked || !state.picked.size) return;
      state.checked = true;
      const { question } = state;
      const result = this.logic.scoreMulti(question, state.picked);
      this.score.right += result.hits;
      this.score.wrong += result.wrong + result.missed;
      if (result.perfect) this.score.perfect += 1;
      const hero = this.hero(question.hero);
      for (const node of this.root.querySelectorAll('.geo-option')) {
        const id = node.dataset.id;
        const right = question.correct.includes(id);
        const picked = state.picked.has(id);
        node.classList.add(right && picked ? 'is-right' : right ? 'is-missed' : picked ? 'is-wrong' : 'is-idle');
        node.disabled = true;
        if (right && picked) this.learn(hero.id, id);
      }
      this.save();
      haptic(result.perfect ? 'success' : 'error');
      this.root.querySelector('.geo-check')?.remove();
      const bar = this.root.querySelector('.geo-bar__score');
      if (bar) bar.innerHTML = this.scoreHTML();
      const verdict = result.perfect ? 'Alles richtig!' : `Richtig: ${result.hits} von ${question.correct.length}${result.wrong ? `, zu viel: ${result.wrong}` : ''}`;
      const feed = this.root.querySelector('.geo-feed');
      if (feed) {
        feed.innerHTML = `<p class="geo-verdict${result.perfect ? ' is-good' : ''}">${escapeHTML(verdict)}</p>
          ${question.stops.map((stop) => this.factHTML(hero, stop)).join('')}
          <button type="button" class="geo-primary geo-next" data-act="next">${this.round >= MODES.multi.rounds ? 'Ergebnis' : 'Weiter'}</button>`;
      }
    }

    // ——— Найди на карте

    showWhere(question) {
      if (!question) { this.finish(); return; }
      this.used.add(question.place);
      this.whereState = { question, answered: false };
      const place = this.place(question.place);
      this.render(`
        ${this.bar('Finde es auf der Karte', this.roundLabel(), this.scoreHTML())}\n        <section class="geo-card geo-ask geo-ask--compact">\n          <p class="geo-ask__task">Wo liegt <b>${escapeHTML(place.name)}</b>?</p>\n          <p class="geo-ask__about">Tippe auf einen Punkt. Die Karte lässt sich verschieben und vergrößern.</p>\n        </section>\n        <div class="geo-mapbox geo-mapbox--quiz"></div>\n        <div class="geo-feed" aria-live="polite"></div>`);
      this.mapView = new MapView(this.root.querySelector('.geo-mapbox'), {
        map: this.mapData, data: this.data, art: this.art, layer: 'ancient',
        onTap: (picked) => this.whereAnswer(picked),
      });
      const classes = new Map(question.candidates.map((id) => [id, 'is-candidate']));
      this.mapView.setMarkers(question.candidates, { labels: 'marked', classes });
      this.mapView.fitPlaces(question.candidates, { animate: false, maxZoom: 16, room: 0, pad: 36 });
    }

    whereAnswer(picked) {
      const state = this.whereState;
      if (!state || state.answered || !picked || !state.question.candidates.includes(picked.id)) return;
      state.answered = true;
      const { question } = state;
      const target = this.place(question.place);
      const good = picked.id === question.place;
      if (good) { this.score.right += 1; if (!this.store.found.includes(target.id)) this.store.found.push(target.id); }
      else this.score.wrong += 1;
      this.save();
      haptic(good ? 'success' : 'error');
      const classes = new Map(question.candidates.map((id) => [id, 'is-reveal']));
      classes.set(question.place, 'is-right');
      if (!good) classes.set(picked.id, 'is-wrong');
      this.mapView.setMarkers(question.candidates, { labels: 'all', classes });
      const bar = this.root.querySelector('.geo-bar__score');
      if (bar) bar.innerHTML = this.scoreHTML();
      const story = question.stories.length ? question.stories[Math.floor(this.random() * question.stories.length)] : null;
      const feed = this.root.querySelector('.geo-feed');
      if (feed) {
        feed.innerHTML = `<p class="geo-verdict${good ? ' is-good' : ''}">${good ? 'Richtig!' : `Das ist ${escapeHTML(picked.name)}. ${escapeHTML(target.name)} ist grün markiert.`}</p>
          <p class="geo-placeline">${escapeHTML(this.placeLine(target))}</p>
          ${story ? this.factHTML(this.hero(story.hero), story.stop) : ''}
          <button type="button" class="geo-primary geo-next" data-act="next">${this.round >= MODES.where.rounds ? 'Ergebnis' : 'Weiter'}</button>`;
      }
    }

    // ——— Тогда и сейчас

    showThenNow(question) {
      if (!question) { this.finish(); return; }
      this.used.add(question.place);
      this.thenNowState = { question, answered: false };
      const place = this.place(question.place);
      const ask = question.kind === 'now'
        ? `Was ist heute an dem Ort, den die Bibel so nennt: <b>${escapeHTML(place.name)}</b>?`
        : question.kind === 'then'
          ? `Wie nennt die Bibel den Ort, an dem heute liegt: <b>${escapeHTML(place.now)}</b> (${escapeHTML(place.country)})?`
          : `In welchem heutigen Land liegt <b>${escapeHTML(place.name)}</b>?`;
      this.render(`
        ${this.bar('Damals und heute', this.roundLabel(), this.scoreHTML())}
        <section class="geo-card geo-ask">
          <p class="geo-kicker">${question.kind === 'then' ? 'Heute → in der Bibel' : 'In der Bibel → heute'}</p>
          <p class="geo-ask__task">${ask}</p>
        </section>
        <div class="geo-answers">
          ${question.options.map((option) => `<button type="button" class="geo-answer" data-act="answer" data-id="${option.id}">${escapeHTML(option.text)}</button>`).join('')}
        </div>
        <div class="geo-feed" aria-live="polite"></div>`);
    }

    thenNowAnswer(button) {
      const state = this.thenNowState;
      if (!state || state.answered) return;
      state.answered = true;
      const { question } = state;
      const chosen = question.options.find((option) => option.id === button.dataset.id);
      const good = chosen?.text === question.answer;
      if (good) this.score.right += 1; else this.score.wrong += 1;
      haptic(good ? 'success' : 'error');
      for (const node of this.root.querySelectorAll('.geo-answer')) {
        const option = question.options.find((one) => one.id === node.dataset.id);
        node.disabled = true;
        if (option?.text === question.answer) node.classList.add('is-right');
        else if (node === button) node.classList.add('is-wrong');
      }
      const bar = this.root.querySelector('.geo-bar__score');
      if (bar) bar.innerHTML = this.scoreHTML();
      const place = this.place(question.place);
      const story = this.data.heroes.flatMap((hero) => hero.stops.filter((stop) => stop.p === place.id).map((stop) => ({ hero, stop })))[0];
      const feed = this.root.querySelector('.geo-feed');
      if (!feed) return;
      feed.innerHTML = `<p class="geo-verdict${good ? ' is-good' : ''}">${good ? 'Richtig!' : 'Nicht ganz.'} ${escapeHTML(place.name)} — ${escapeHTML(place.now)}, ${escapeHTML(place.country)}.</p>\n        <div class="geo-seg geo-seg--small" role="group" aria-label="Kartenebene">\n          ${Object.entries(LAYERS).map(([value, label]) => `<button type="button" class="geo-seg__item${value === 'both' ? ' is-on' : ''}" data-act="layer" data-value="${value}">${escapeHTML(label)}</button>`).join('')}
        </div>
        <div class="geo-mapbox geo-mapbox--mini"></div>
        <p class="geo-placeline">${escapeHTML(this.placeLine(place))}</p>
        ${story ? this.factHTML(story.hero, story.stop) : ''}
        <button type="button" class="geo-primary geo-next" data-act="next">${this.round >= MODES.thennow.rounds ? 'Ergebnis' : 'Weiter'}</button>`;
      this.mapView = new MapView(feed.querySelector('.geo-mapbox'), {
        map: this.mapData, data: this.data, art: this.art, layer: 'both', padding: 20,
      });
      // Соседи — для ориентира, а не для счёта: десяток ближайших, иначе вокруг
      // Иерусалима точки ложатся друг на друга.
      const far = (other) => Math.hypot((other.lon - place.lon) * 0.8, other.lat - place.lat);
      const near = this.data.places.filter((other) => other.id === place.id || (far(other) < 1.6 && !other.near))
        .sort((a, b) => far(a) - far(b)).slice(0, 10).map((other) => other.id);
      this.mapView.setMarkers(near, { labels: 'auto', classes: new Map([[place.id, 'is-focus']]) });
      this.mapView.centerOn(...this.mapView.project(place.lon, place.lat), this.mapView.kFit * 7, false);
    }

    // ——— Атлас

    showAtlas() {
      this.atlas = { tab: 'heroes', hero: null, journey: null, selected: null, galleryIndex: 0 };
      this.render(`
        ${this.bar('Atlas', 'Antike und heutige Karte')}\n        <div class="geo-seg geo-seg--layers" role="group" aria-label="Kartenebene">\n          ${Object.entries(LAYERS).map(([value, label]) => `<button type="button" class="geo-seg__item${value === this.settings.layer ? ' is-on' : ''}" data-act="layer" data-value="${value}" aria-pressed="${value === this.settings.layer}">${escapeHTML(label)}</button>`).join('')}
        </div>
        <div class="geo-mapbox geo-mapbox--atlas"><div class="geo-pop" hidden></div></div>
        <section class="geo-card geo-sheet"></section>`);
      const box = this.root.querySelector('.geo-mapbox');
      this.popup = box.querySelector('.geo-pop');
      const host = document.createElement('div');
      host.className = 'geo-mapbox__map';
      box.prepend(host);
      this.mapView = new MapView(host, {
        map: this.mapData, data: this.data, art: this.art, layer: this.settings.layer,
        onTap: (place) => this.atlasPlace(place),
      });
      this.mapView.cover(33.2, 35.6);
      this.atlasMarkers();
      this.atlasSheet();
    }

    setLayer(layer) {
      if (!LAYERS[layer]) return;
      if (this.mode === 'atlas') { this.settings.layer = layer; this.save(); }
      this.root.querySelectorAll('[data-act="layer"]').forEach((node) => {
        node.classList.toggle('is-on', node.dataset.value === layer);
        node.setAttribute('aria-pressed', String(node.dataset.value === layer));
      });
      this.mapView?.setLayer(layer);
      if (this.atlas?.selected) this.atlasPlace(this.place(this.atlas.selected));
      haptic('select');
    }

    atlasMarkers() {
      const { hero, journey, selected } = this.atlas;
      const classes = new Map();
      const badges = new Map();
      let ids = this.data.places.map((place) => place.id);
      const routes = [];
      const toPoint = (step) => (typeof step === 'string'
        ? (() => { const p = this.place(step); return this.mapView.project(p.lon, p.lat); })()
        : this.mapView.project(step[1], step[0]));
      if (hero) {
        const h = this.hero(hero);
        ids = [...new Set(h.stops.map((stop) => stop.p))];
        h.stops.forEach((stop, index) => { classes.set(stop.p, 'is-stop'); if (!badges.has(stop.p)) badges.set(stop.p, index + 1); });
        if (h.route) routes.push({ points: h.route.map(toPoint), style: 'main' });
      }
      if (journey) {
        const j = this.data.journeys.find((one) => one.id === journey);
        const stops = j.path.filter((step) => typeof step === 'string');
        ids = [...new Set(stops)];
        let n = 0;
        for (const id of stops) { if (!badges.has(id)) { n += 1; badges.set(id, n); classes.set(id, 'is-stop'); } }
        routes.push({ points: j.path.map(toPoint), style: 'journey' });
      }
      if (selected) classes.set(selected, `${classes.get(selected) || ''} is-focus`);
      this.mapView.setMarkers(ids, { labels: 'auto', classes, badges });
      this.mapView.setRoutes(routes);
    }

    atlasSheet() {
      const sheet = this.root.querySelector('.geo-sheet');
      if (!sheet) return;
      const { tab, hero, journey } = this.atlas;
      if (hero) {
        const h = this.hero(hero);
        sheet.innerHTML = `
          <div class="geo-sheet__head">
            <div><p class="geo-kicker">${escapeHTML(h.era)}</p><h3>${escapeHTML(this.logic.heroLabel(h))}</h3><p class="geo-ask__about">${escapeHTML(h.about)}</p></div>\n            <button type="button" class="geo-icon-btn" data-act="clear" aria-label="Schließen">${icon('close', 20)}</button>
          </div>
          ${this.atlasGalleryHTML(h.stops.map((stop) => stop.p))}
          <ol class="geo-stops">${h.stops.map((stop, index) => `
            <li><button type="button" class="geo-stop" data-act="stop" data-id="${stop.p}">
              <span class="geo-stop__n">${index + 1}</span>
              <span class="geo-stop__text"><b>${escapeHTML(this.place(stop.p).name)}</b><small>${escapeHTML(stop.n)}</small></span>
              ${this.refLink(stop)}
            </button></li>`).join('')}</ol>`;
        return;
      }
      if (journey) {
        const j = this.data.journeys.find((one) => one.id === journey);
        const stops = [...new Set(j.path.filter((step) => typeof step === 'string'))];
        sheet.innerHTML = `
          <div class="geo-sheet__head">
            <div><p class="geo-kicker">${escapeHTML(j.r)}</p><h3>${escapeHTML(j.name)}</h3></div>\n            <button type="button" class="geo-icon-btn" data-act="clear" aria-label="Schließen">${icon('close', 20)}</button>
          </div>
          ${this.atlasGalleryHTML(stops)}
          <ol class="geo-stops">${stops.map((id, index) => `
            <li><button type="button" class="geo-stop" data-act="stop" data-id="${id}">
              <span class="geo-stop__n">${index + 1}</span>
              <span class="geo-stop__text"><b>${escapeHTML(this.place(id).name)}</b><small>${escapeHTML(this.modernName(this.place(id)))}</small></span>
            </button></li>`).join('')}</ol>`;
        return;
      }
      const heroes = this.data.heroes.filter((one) => this.settings.testament === 'all' || one.t === this.settings.testament);
      const routes = [
        ...this.data.heroes.filter((one) => one.route).map((one) => ({ id: one.id, name: `Reise: ${this.logic.heroLabel(one)}`, kind: 'hero' })),
        ...this.data.journeys.map((one) => ({ id: one.id, name: one.name, kind: 'journey', r: one.r })),
      ];
      sheet.innerHTML = `
        <div class="geo-seg geo-seg--tabs" role="tablist">
          <button type="button" class="geo-seg__item${tab === 'heroes' ? ' is-on' : ''}" data-act="tab" data-value="heroes" role="tab" aria-selected="${tab === 'heroes'}">Personen</button>\n          <button type="button" class="geo-seg__item${tab === 'routes' ? ' is-on' : ''}" data-act="tab" data-value="routes" role="tab" aria-selected="${tab === 'routes'}">Reisen</button>\n        </div>\n        <p class="geo-sheet__hint">${tab === 'heroes' ? 'Wähle eine Person — die Karte zeigt, wo sie war.' : 'Wähle einen Weg — die Karte zeichnet ihn der Reihe nach.'} Tippe auf einen Punkt der Karte, um mehr über den Ort zu erfahren.</p>\n        ${tab === 'heroes'
          ? [...new Set(heroes.map((one) => one.era))].map((era) => `
            <p class="geo-era">${escapeHTML(era)}</p>
            <div class="geo-chips">${heroes.filter((one) => one.era === era).map((one) => `<button type="button" class="geo-chip" data-act="hero" data-id="${one.id}">${escapeHTML(this.logic.heroLabel(one))}</button>`).join('')}</div>`).join('')
          : `<div class="geo-chips">${routes.map((one) => `<button type="button" class="geo-chip geo-chip--route" data-act="${one.kind}" data-id="${one.id}">${escapeHTML(one.name)}${one.r ? `<small>${escapeHTML(one.r)}</small>` : ''}</button>`).join('')}</div>`}`;
    }

    atlasStops() {
      if (this.atlas.hero) return this.hero(this.atlas.hero).stops.map((stop) => stop.p);
      if (this.atlas.journey) {
        const journey = this.data.journeys.find((one) => one.id === this.atlas.journey);
        return [...new Set(journey.path.filter((step) => typeof step === 'string'))];
      }
      return [];
    }

    atlasGalleryHTML(stops) {
      if (!stops.length) return '';
      const copy = this.gallery.copy || {};
      const index = Math.max(0, Math.min(Number(this.atlas.galleryIndex) || 0, stops.length - 1));
      const place = this.place(stops[index]);
      const key = this.gallery.places?.[place.id];
      const asset = this.gallery.assets?.[key];
      if (!asset) return '';
      const label = `${place.name} · ${asset.region}`;
      return `
        <section class="geo-gallery" aria-label="${escapeHTML(copy.title)}">
          <div class="geo-gallery__head">
            <div><p class="geo-kicker">${escapeHTML(copy.title)}</p><p class="geo-gallery__position" aria-live="polite">${escapeHTML(copy.position)} ${index + 1} / ${stops.length} · ${escapeHTML(place.name)}</p></div>
          </div>
          <figure class="geo-gallery__figure">
            <button type="button" class="geo-gallery__picture" data-act="gallery-focus" data-id="${place.id}" aria-label="${escapeHTML(copy.focus)}: ${escapeHTML(place.name)}">
              <img src="${escapeHTML(asset.src)}" alt="${escapeHTML(`${copy.landscape}: ${label}`)}" loading="lazy" decoding="async" />
            </button>
            <figcaption>
              <span>${escapeHTML(asset.region)}</span>
              <small>${escapeHTML(copy.disclaimer)}</small>
              <a href="${escapeHTML(asset.sourceUrl)}" target="_blank" rel="noopener noreferrer">${escapeHTML(copy.context)}: ${escapeHTML(asset.sourceLabel)}</a>
            </figcaption>
          </figure>
          <div class="geo-gallery__controls" role="group" aria-label="${escapeHTML(copy.title)}">
            <button type="button" class="geo-gallery__arrow" data-act="gallery-prev" aria-label="${escapeHTML(copy.previous)}"${stops.length < 2 ? ' disabled' : ''}>${icon('back', 20)}</button>
            <span>${index + 1} / ${stops.length}</span>
            <button type="button" class="geo-gallery__arrow" data-act="gallery-next" aria-label="${escapeHTML(copy.next)}"${stops.length < 2 ? ' disabled' : ''}>${icon('back', 20)}</button>
          </div>
          <div class="geo-gallery__thumbs" role="group" aria-label="${escapeHTML(copy.places)}">
            ${stops.map((id, stopIndex) => `<button type="button" class="geo-gallery__thumb${stopIndex === index ? ' is-current' : ''}" data-act="gallery-index" data-index="${stopIndex}" aria-label="${stopIndex + 1}. ${escapeHTML(this.place(id).name)}" aria-pressed="${stopIndex === index}"${stopIndex === index ? ' aria-current="step"' : ''}><span>${stopIndex + 1}</span><small>${escapeHTML(this.place(id).name)}</small></button>`).join('')}
          </div>
        </section>`;
    }

    atlasGalleryMove(delta) {
      const stops = this.atlasStops();
      if (stops.length < 2) return;
      const index = (this.atlas.galleryIndex + delta + stops.length) % stops.length;
      this.atlas.galleryIndex = index;
      const place = this.place(stops[index]);
      this.atlasPlace(place);
      const [x, y] = this.mapView.project(place.lon, place.lat);
      this.mapView.centerOn(x, y, Math.max(this.mapView.live.k, this.mapView.kFit * 6));
    }

    atlasGallerySelect(index) {
      const stops = this.atlasStops();
      if (!stops.length || !Number.isInteger(index) || index < 0 || index >= stops.length) return;
      this.atlas.galleryIndex = index;
      const place = this.place(stops[index]);
      this.atlasPlace(place);
      const [x, y] = this.mapView.project(place.lon, place.lat);
      this.mapView.centerOn(x, y, Math.max(this.mapView.live.k, this.mapView.kFit * 6));
    }

    atlasTab(tab) {
      this.atlas.tab = tab;
      this.atlasSheet();
      haptic('select');
    }

    atlasHero(id) {
      const h = this.hero(id);
      Object.assign(this.atlas, { hero: id, journey: null, selected: h.stops[0]?.p || null, galleryIndex: 0 });
      this.popup.hidden = true;
      this.atlasMarkers();
      this.atlasSheet();
      const points = h.route ? h.route.map((step) => (typeof step === 'string' ? [this.place(step).lat, this.place(step).lon] : step))
        : h.stops.map((stop) => [this.place(stop.p).lat, this.place(stop.p).lon]);
      // У Ноя одно место — горы Араратские. Без потолка карта приблизила бы
      // его до пустого поля, где не видно, где это вообще.
      this.mapView.fitPoints(points, { maxZoom: new Set(points.map(String)).size > 1 ? 14 : 4 });
      this.showMapBox();
      haptic('select');
    }

    /** Выбор сделан в списке под картой — подтягиваем карту в кадр. */
    showMapBox() {
      const box = this.root.querySelector('.geo-mapbox');
      if (!box) return;
      const top = box.getBoundingClientRect().top;
      if (top < 0 || top > window.innerHeight * 0.35) box.scrollIntoView({ block: 'start', behavior: 'smooth' });
    }

    atlasJourney(id) {
      const j = this.data.journeys.find((one) => one.id === id);
      const stops = [...new Set(j.path.filter((step) => typeof step === 'string'))];
      Object.assign(this.atlas, { hero: null, journey: id, selected: stops[0] || null, galleryIndex: 0 });
      this.popup.hidden = true;
      this.atlasMarkers();
      this.atlasSheet();
      this.mapView.fitPoints(j.path.map((step) => (typeof step === 'string' ? [this.place(step).lat, this.place(step).lon] : step)));
      this.showMapBox();
      haptic('select');
    }

    atlasClear() {
      Object.assign(this.atlas, { hero: null, journey: null, selected: null, galleryIndex: 0 });
      this.popup.hidden = true;
      this.atlasMarkers();
      this.atlasSheet();
      this.mapView.fitAll();
    }

    atlasStop(id) {
      const place = this.place(id);
      this.atlasPlace(place);
      const [x, y] = this.mapView.project(place.lon, place.lat);
      this.mapView.centerOn(x, y, Math.max(this.mapView.live.k, this.mapView.kFit * 6));
      this.showMapBox();
    }

    atlasPlace(place) {
      if (!place) {
        this.atlas.selected = null;
        this.popup.hidden = true;
        this.atlasMarkers();
        return;
      }
      this.atlas.selected = place.id;
      const stops = this.atlasStops();
      if (stops.length) {
        const current = Math.max(0, Math.min(this.atlas.galleryIndex, stops.length - 1));
        if (stops[current] !== place.id) {
          const matchingIndex = stops.indexOf(place.id);
          if (matchingIndex >= 0) this.atlas.galleryIndex = matchingIndex;
        }
        const gallery = this.root.querySelector('.geo-gallery');
        if (gallery && stops.includes(place.id)) gallery.outerHTML = this.atlasGalleryHTML(stops);
      }
      this.atlasMarkers();
      const links = this.data.heroes.flatMap((hero) => hero.stops.filter((stop) => stop.p === place.id).map((stop) => ({ hero, stop })));
      const focus = this.atlas.hero ? links.find((link) => link.hero.id === this.atlas.hero) : null;
      const others = links.filter((link) => link !== focus);
      this.popup.hidden = false;
      this.popup.innerHTML = `\n        <button type="button" class="geo-pop__close" data-act="clear-pop" aria-label="Schließen">${icon('close', 18)}</button>
        <h4>${escapeHTML(place.name)}${place.aka ? ` <small>(${escapeHTML(place.aka)})</small>` : ''}</h4>
        <p class="geo-placeline">${escapeHTML(this.placeLine(place))}</p>
        ${(() => {
          const key = this.gallery.places?.[place.id];
          const asset = this.gallery.assets?.[key];
          return asset ? `<figure class="geo-pop__image"><img src="${escapeHTML(asset.src)}" alt="${escapeHTML(`${this.gallery.copy?.landscape || ''}: ${place.name} · ${asset.region}`)}" loading="lazy" decoding="async" /><figcaption>${escapeHTML(asset.region)}<small>${escapeHTML(this.gallery.copy?.disclaimer || '')}</small><a href="${escapeHTML(asset.sourceUrl)}" target="_blank" rel="noopener noreferrer">${escapeHTML(this.gallery.copy?.context || '')}: ${escapeHTML(asset.sourceLabel)}</a></figcaption></figure>` : '';
        })()}
        ${focus ? this.factHTML(focus.hero, focus.stop) : ''}
        ${others.length ? `<p class="geo-pop__who">Hier waren:</p><div class="geo-chips geo-chips--small">${others.map((link) => `<button type="button" class="geo-chip" data-act="hero" data-id="${link.hero.id}" title="${escapeHTML(link.stop.n)}">${escapeHTML(this.logic.heroLabel(link.hero))}</button>`).join('')}</div>` : ''}`;
      this.popup.querySelector('[data-act="clear-pop"]').addEventListener('click', (event) => {
        event.stopPropagation();
        this.atlasPlace(null);
      });
      haptic('select');
    }

    destroy() {
      this.dropMap();
      for (const id of this.timers) clearTimeout(id);
      this.timers.clear();
      this.root.removeEventListener('click', this.onClick);
      window.removeEventListener('resize', this.onResize);
    }
  }

  window.startBibleGeographyGame = start;
})();
