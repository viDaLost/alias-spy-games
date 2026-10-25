// Мини-приложение учёта финансов. Без сборки и зависимостей: данные приходят
// из эндпоинта `app` (tgcloud/endpoints/app.js) через Telegram.WebApp.Serverless.call.
(() => {
  'use strict';

  const tg = window.Telegram && window.Telegram.WebApp;
  const $app = document.getElementById('app');
  const $tabs = document.getElementById('tabs');
  const $sheet = document.getElementById('sheet');
  const $backdrop = document.getElementById('sheet-backdrop');
  const $toast = document.getElementById('toast');

  const COLORS = ['#4f86f7', '#f7a23b', '#34c38f', '#e5534b', '#9b6ef3', '#2bb5c9', '#f06ba8', '#8bc34a', '#ff7f50', '#7c8da6'];
  const EMOJIS = ['🛒', '🍔', '☕', '🚕', '🚗', '⛽', '🏠', '💡', '📱', '💊', '🏋️', '👕', '💅', '🎬', '🎮', '🔁',
    '📚', '🎁', '🐾', '🧸', '✈️', '🏖️', '🧺', '🛠️', '🍷', '🚬', '💻', '🎵', '⚽', '🎨', '💼', '📈',
    '💰', '💵', '↩️', '🏦', '🧾', '💳', '🎓', '❤️', '🌿', '🍕', '🥦', '🚇', '🏥', '👶', '🐶', '📦'];
  const MONTHS_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
  const WD = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];
  const NB = ' ';

  const S = {
    init: null, cats: new Map(), tab: 'overview',
    period: '', periodInfo: null,
    summary: null, breakdown: 'expense',
    ops: { items: [], total: 0, totals: null, q: '', kind: '', categoryId: 0, offset: 0 },
    catsKind: 'expense', exportMode: 'full', exportCat: 0,
    stack: [],
  };

  // ── Утилиты ──────────────────────────────────────────────────────────────

  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const symbol = (cur) => (S.init.currencies.find((c) => c.code === cur) || { symbol: cur }).symbol;
  const group = (s) => s.replace(/\B(?=(\d{3})+(?!\d))/g, NB);

  function money(minor, cur = S.init.me.currency, sign = '') {
    const abs = Math.abs(Math.round(minor));
    const int = Math.floor(abs / 100), frac = abs % 100;
    return sign + group(String(int)) + (frac ? ',' + String(frac).padStart(2, '0') : '') + NB + symbol(cur);
  }
  const signed = (kind, minor, cur) => money(minor, cur, kind === 'income' ? '+' : '−');
  function compact(minor, cur) {
    const v = Math.abs(minor) / 100;
    if (v >= 1e6) return (Math.round(v / 1e5) / 10).toString().replace('.', ',') + NB + 'млн' + NB + symbol(cur);
    return money(Math.round(minor / 100) * 100, cur);
  }

  /** «1 234,50» / «5к» / «1.5k» → копейки; null, если не число. */
  function parseAmount(str) {
    let s = String(str || '').toLowerCase().replace(/[\s ]/g, '').replace(',', '.');
    let mult = 1;
    if (/[кk]$/.test(s)) { mult = 1000; s = s.slice(0, -1); }
    if (!/^\d+(\.\d{0,2})?$/.test(s)) return null;
    const v = Math.round(parseFloat(s) * mult * 100);
    return v > 0 ? v : null;
  }
  const amountInput = (minor) => (minor ? String(minor / 100).replace('.', ',') : '');

  function isoAdd(iso, n) {
    const [y, m, d] = iso.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d + n));
    return dt.toISOString().slice(0, 10);
  }
  function humanDay(iso) {
    if (iso === S.init.today) return 'Сегодня';
    if (iso === isoAdd(S.init.today, -1)) return 'Вчера';
    const [y, m, d] = iso.split('-').map(Number);
    const wd = WD[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
    return `${wd}, ${d} ${MONTHS_GEN[m - 1]}${y !== +S.init.today.slice(0, 4) ? ' ' + y : ''}`;
  }

  const cat = (id) => S.cats.get(id) || null;
  const parentOf = (c) => (c && c.parentId ? cat(c.parentId) : null);
  const topOf = (c) => parentOf(c) || c;
  // Подкатегория показывается путём: «Здоровье › Аптека», эмодзи — свой или родителя.
  const catName = (c) => (c ? (parentOf(c) ? parentOf(c).name + ' › ' : '') + c.name : 'Без категории');
  const catEmoji = (c) => (c && (c.emoji || (parentOf(c) && parentOf(c).emoji))) || '❔';
  const bySort = (a, b) => a.sort - b.sort || a.id - b.id;
  /** Категории верхнего уровня одного типа. */
  const activeCats = (kind) => S.init.categories.filter((c) => c.kind === kind && !c.archived && !c.parentId).sort(bySort);
  const subsOf = (id) => S.init.categories.filter((c) => c.parentId === id && !c.archived).sort(bySort);
  /** Подсказки подкатегорий: стандартные для этой категории минус уже созданные. */
  function suggestionsFor(c) {
    const have = new Set(S.init.categories.filter((x) => x.parentId === c.id).map((x) => x.name.toLowerCase()));
    return ((S.init.suggestions || {})[c.code] || []).filter((n) => !have.has(n.toLowerCase()));
  }
  /** <option> по дереву: категория, под ней её подкатегории. */
  function treeOptions(kind, selected, { withIncomeMark = false } = {}) {
    const out = [];
    const opt = (c, label) => `<option value="${c.id}" ${selected === c.id ? 'selected' : ''}>${esc(label)}${withIncomeMark && c.kind === 'income' ? ' (доход)' : ''}</option>`;
    for (const k of kind ? [kind] : ['expense', 'income']) {
      for (const c of activeCats(k)) {
        out.push(opt(c, (c.emoji ? c.emoji + ' ' : '') + c.name));
        for (const s of subsOf(c.id)) out.push(opt(s, '\u00a0\u00a0\u00a0\u00a0↳ ' + s.name));
      }
    }
    return out.join('');
  }

  /** Суммы по категориям → по категориям верхнего уровня, с разбивкой по подкатегориям. */
  function rollUp(rows) {
    const map = new Map();
    for (const r of rows) {
      const c = cat(r.categoryId);
      const top = topOf(c);
      const id = top ? top.id : r.categoryId;
      const g = map.get(id) || { categoryId: id, total: 0, count: 0, parts: new Map() };
      g.total += r.total; g.count += r.count;
      const pk = c && c.parentId ? c.id : 0;
      const p = g.parts.get(pk) || { categoryId: pk || id, own: !pk, total: 0, count: 0 };
      p.total += r.total; p.count += r.count;
      g.parts.set(pk, p);
      map.set(id, g);
    }
    return [...map.values()].sort((a, b) => b.total - a.total).map((g) => ({
      ...g, subs: [...g.parts.keys()].some((k) => k) ? [...g.parts.values()].sort((a, b) => b.total - a.total) : [],
    }));
  }

  function setCategories(list) {
    S.init.categories = list;
    S.cats = new Map(list.map((c) => [c.id, c]));
  }

  const haptic = (type = 'success') => { try { tg.HapticFeedback.notificationOccurred(type); } catch { /* нет вибрации */ } };
  const tap = () => { try { tg.HapticFeedback.selectionChanged(); } catch { /* нет вибрации */ } };

  let toastTimer = null;
  function toast(text, err = false) {
    $toast.textContent = text;
    $toast.className = 'toast' + (err ? ' err' : '');
    $toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { $toast.hidden = true; }, err ? 4500 : 2600);
  }

  // ── Сервер ───────────────────────────────────────────────────────────────

  function call(op, data = {}) {
    return new Promise((resolve, reject) => {
      if (!tg || !tg.Serverless) return reject(new Error('Обновите приложение Telegram: эта версия не поддерживает мини-приложение.'));
      tg.Serverless.call('app', { op, ...data }, (err, result) => {
        if (err) reject(new Error(err.message || 'Ошибка сервера, попробуйте ещё раз.'));
        else resolve(result);
      });
    });
  }

  async function run(fn, btn) {
    if (btn) btn.disabled = true;
    try { return await fn(); } catch (e) { haptic('error'); toast(e.message || String(e), true); return undefined; } finally { if (btn) btn.disabled = false; }
  }

  // ── Навигация ────────────────────────────────────────────────────────────

  function go(tab) {
    if (tab === 'add') return openTxSheet();
    S.tab = tab;
    for (const b of $tabs.querySelectorAll('button')) b.classList.toggle('active', b.dataset.tab === tab);
    window.scrollTo(0, 0);
    if (tab === 'overview') return loadSummary();
    if (tab === 'ops') return loadOps(true);
    render();
  }

  function render() {
    if (S.tab === 'overview') $app.innerHTML = periodBar() + overviewHtml();
    else if (S.tab === 'ops') $app.innerHTML = periodBar() + opsHtml();
    else if (S.tab === 'cats') $app.innerHTML = catsHtml();
    else if (S.tab === 'more') $app.innerHTML = periodBar() + moreHtml();
  }

  function refresh() {
    if (S.tab === 'overview') return loadSummary();
    if (S.tab === 'ops') return loadOps(true);
    return render();
  }

  function setPeriod(code) {
    if (!code) return;
    S.period = code;
    S.periodInfo = null;
    tap();
    refresh();
  }

  // Название периода для вкладки «Ещё» (там нет своих данных за период).
  let periodLoading = false;
  async function loadPeriodInfo() {
    if (periodLoading) return;
    periodLoading = true;
    const r = await run(() => call('list', { period: S.period, limit: 1 }));
    periodLoading = false;
    if (!r) return;
    S.period = r.period.code;
    S.periodInfo = r.period;
    if (S.tab === 'more') render();
  }

  // ── Период ───────────────────────────────────────────────────────────────

  function periodBar() {
    const k = S.period[0];
    const kinds = [['week', 'w', 'Неделя'], ['month', 'm', 'Месяц'], ['year', 'y', 'Год'], ['all', 'a', 'Всё']];
    const p = S.periodInfo;
    return `<div class="period">
      <div class="seg">${kinds.map(([kind, ch, label]) => `<button data-act="period" data-code="${S.init.periods[kind]}" class="${k === ch ? 'on' : ''}">${label}</button>`).join('')}
        <button data-act="range" class="${k === 'r' || k === 'd' ? 'on' : ''}">📅</button></div>
      <div class="nav">
        <button data-act="period" data-code="${p && p.prev ? p.prev : ''}" ${p && p.prev ? '' : 'disabled'}>‹</button>
        <div class="ptitle">${esc(p ? p.title : '…')}</div>
        <button data-act="period" data-code="${p && p.next ? p.next : ''}" ${p && p.next ? '' : 'disabled'}>›</button>
      </div></div>`;
  }

  // ── Обзор ────────────────────────────────────────────────────────────────

  async function loadSummary() {
    if (!S.summary || S.summary.period.code !== S.period) $app.innerHTML = periodBar() + '<div class="loading"><div class="spinner"></div></div>';
    const r = await run(() => call('summary', { period: S.period }));
    if (!r) return;
    S.summary = r;
    S.period = r.period.code;
    S.periodInfo = r.period;
    if (S.tab === 'overview') render();
  }

  function overviewHtml() {
    const s = S.summary;
    if (!s || s.period.code !== S.period) return '<div class="loading"><div class="spinner"></div></div>';
    const cur = s.currency;
    let html = '';

    if (!s.count) {
      return `<div class="card empty"><span class="big">🌱</span>За этот период записей нет.<br><br>
        <button class="btn" data-act="add">➕ Добавить запись</button>
        <p class="small">Или напишите боту в чат: «кофе 250»</p></div>` + budgetsHtml(s);
    }

    // Итоги
    let trend = '';
    if (s.prevExpense && s.expense) {
      const diff = Math.round(((s.expense - s.prevExpense) / s.prevExpense) * 100);
      trend = `<div class="trend ${diff > 0 ? 'red' : 'green'}">${diff > 0 ? '▲' : '▼'} ${Math.abs(diff)}% к прошлому периоду <span class="muted">(${money(s.prevExpense, cur)})</span></div>`;
    }
    const bal = s.income - s.expense;
    html += `<div class="card kpi">
      <div class="big"><div class="lbl">Потрачено</div><div class="val">${money(s.expense, cur)}</div>${trend}
        ${s.avgPerDay ? `<div class="small muted">≈ ${money(Math.round(s.avgPerDay / 100) * 100, cur)} в день</div>` : ''}</div>
      <div><div class="lbl">Получено</div><div class="val green">${money(s.income, cur, s.income ? '+' : '')}</div></div>
      <div><div class="lbl">Остаток</div><div class="val ${bal < 0 ? 'red' : ''}">${money(bal, cur, bal > 0 ? '+' : bal < 0 ? '−' : '')}</div></div>
    </div>`;

    // По категориям
    const kind = S.breakdown;
    const rows = rollUp(s.byCategory.filter((r) => r.kind === kind));
    const total = rows.reduce((a, r) => a + r.total, 0);
    html += `<div class="card"><h3><span>По категориям</span></h3>
      <div class="seg" style="margin-bottom:12px">
        <button data-act="breakdown" data-kind="expense" class="${kind === 'expense' ? 'on' : ''}">Расходы</button>
        <button data-act="breakdown" data-kind="income" class="${kind === 'income' ? 'on' : ''}">Доходы</button></div>`;
    if (!rows.length) {
      html += `<div class="empty">${kind === 'expense' ? 'Расходов' : 'Доходов'} за период нет</div></div>`;
    } else {
      const top = rows.slice(0, 6).map((r, i) => ({ ...r, color: COLORS[i] }));
      if (rows.length > 6) top.push({ categoryId: -1, total: rows.slice(6).reduce((a, r) => a + r.total, 0), color: COLORS[9] });
      html += `<div class="donut-wrap">${donut(top, total, cur)}<div class="legend">${top.map((r) => `
          <button class="li" ${r.categoryId >= 0 ? `data-act="filterCat" data-id="${r.categoryId}"` : ''}><span class="dot" style="background:${r.color}"></span>
          <span class="nm">${r.categoryId >= 0 ? esc(catEmoji(cat(r.categoryId)) + ' ' + catName(cat(r.categoryId))) : 'Остальное'}</span>
          <span class="pc">${Math.round((r.total / total) * 100)}%</span></button>`).join('')}</div></div>
        <div class="cat-bars" style="margin-top:12px">${rows.map((r, i) => {
          const c = cat(r.categoryId);
          const pct = total ? r.total / total : 0;
          return `<button class="cb" data-act="filterCat" data-id="${r.categoryId}">
            <div class="cb-top"><span>${esc(catEmoji(c))}</span><span class="nm">${esc(catName(c))} <span class="muted small">· ${r.count}</span></span>
            <span class="amt">${money(r.total, cur)}</span><span class="pc">${Math.round(pct * 100)}%</span></div>
            <div class="bar"><i style="width:${Math.max(2, pct * 100)}%;background:${COLORS[Math.min(i, 9)]}"></i></div></button>` +
            r.subs.map((p) => `<button class="cb sub" ${p.own ? '' : `data-act="filterCat" data-id="${p.categoryId}"`}>
              <div class="cb-top"><span class="nm">↳ ${esc(p.own ? 'без уточнения' : cat(p.categoryId).name)} <span class="muted small">· ${p.count}</span></span>
              <span class="amt">${money(p.total, cur)}</span><span class="pc">${Math.round((p.total / r.total) * 100)}%</span></div></button>`).join('');
        }).join('')}</div></div>`;
    }

    // Динамика
    const pts = s.series.points;
    if (pts.length > 1 && pts.some((p) => p.expense)) {
      const withData = pts.filter((p) => p.expense).length || 1;
      const avg = s.series.unit === 'day' ? (s.avgPerDay || 0) : pts.reduce((a, p) => a + p.expense, 0) / withData;
      html += `<div class="card"><h3><span>Расходы ${s.series.unit === 'day' ? 'по дням' : 'по месяцам'}</span></h3>${barChart(pts, avg)}
        <div class="small muted">Пунктир — в среднем ${money(Math.round(avg / 100) * 100, cur)} ${s.series.unit === 'day' ? 'в день' : 'в месяц'}</div></div>`;
    }

    html += budgetsHtml(s);

    if (s.top.length > 1) {
      html += `<div class="card" style="padding:0;overflow:hidden"><h3 style="padding:14px 14px 0">Самые крупные траты</h3>${s.top.map(txRow).join('')}</div>`;
    }
    if (s.others.length) {
      html += `<div class="card small">💱 Другие валюты: ${s.others.map((o) => `${esc(o.currency)} — расходы ${money(o.expense, o.currency)}, доходы ${money(o.income, o.currency)}`).join('; ')}</div>`;
    }
    return html;
  }

  function budgetsHtml(s) {
    const cur = S.init.me.currency;
    const list = s.budgets || [];
    let html = `<div class="card"><h3><span>Бюджеты на этот месяц</span><button class="act" data-act="budget" data-id="0">${list.length ? 'Изменить' : 'Задать'}</button></h3>`;
    if (!list.length) {
      html += '<div class="small muted">Задайте лимит на месяц — общий или по категориям. Я предупрежу, когда будет потрачено 80% и 100%.</div></div>';
      return html;
    }
    for (const b of [...list].sort((a, z) => a.categoryId - z.categoryId)) {
      const c = b.categoryId ? cat(b.categoryId) : null;
      const pct = b.amount ? b.spent / b.amount : 0;
      const color = pct >= 1 ? 'var(--red)' : pct >= 0.8 ? 'var(--amber)' : 'var(--green)';
      const left = b.amount - b.spent;
      html += `<button class="budget" style="display:block;width:100%;text-align:left" data-act="budget" data-id="${b.categoryId}">
        <div class="bt"><span>${b.categoryId ? esc(catEmoji(c) + ' ' + catName(c)) : '💼 Все расходы'}</span><span><b>${money(b.spent, cur)}</b> <span class="muted">из ${money(b.amount, cur)}</span></span></div>
        <div class="bar"><i style="width:${Math.min(100, pct * 100)}%;background:${color}"></i></div>
        <div class="bs">${left >= 0 ? `Осталось ${money(left, cur)}` : `<span class="red">Превышен на ${money(-left, cur)}</span>`}</div></button>`;
    }
    return html + '</div>';
  }

  function donut(items, total, cur) {
    const r = 15.9155;
    let off = 0;
    const segs = items.map((it) => {
      const pct = total ? (it.value ?? it.total) / total * 100 : 0;
      const len = items.length > 1 ? Math.max(0.01, pct - 0.8) : pct;
      const seg = `<circle r="${r}" cx="21" cy="21" fill="transparent" stroke="${it.color}" stroke-width="6" stroke-dasharray="${len} ${100 - len}" stroke-dashoffset="${25 - off}"/>`;
      off += pct;
      return seg;
    }).join('');
    return `<svg class="donut" viewBox="0 0 42 42">${segs}
      <text x="21" y="20" text-anchor="middle" font-size="3.4" opacity=".6">всего</text>
      <text x="21" y="25" text-anchor="middle" font-size="4.6" font-weight="700">${esc(compact(total, cur))}</text></svg>`;
  }

  function barChart(points, avg) {
    const W = 320, H = 120, n = points.length;
    const max = Math.max(1, ...points.map((p) => p.expense), avg);
    const bw = W / n;
    const step = Math.ceil(n / 8);
    let bars = '', labels = '';
    points.forEach((p, i) => {
      const h = (p.expense / max) * (H - 4);
      const today = p.key === S.init.today || p.key === S.init.today.slice(0, 7);
      bars += `<rect x="${(i * bw + bw * 0.15).toFixed(2)}" y="${(H - h).toFixed(2)}" width="${(bw * 0.7).toFixed(2)}" height="${Math.max(0, h).toFixed(2)}" rx="${Math.min(3, bw * 0.2).toFixed(2)}" fill="var(--accent)" opacity="${today ? 1 : 0.65}"/>`;
      if (i % step === 0 || i === n - 1) labels += `<text class="lbl" x="${(i * bw + bw / 2).toFixed(2)}" y="${H + 12}" text-anchor="middle">${esc(p.label)}</text>`;
    });
    const ay = (H - (avg / max) * (H - 4)).toFixed(2);
    return `<svg class="chart" viewBox="0 0 ${W} ${H + 16}" style="height:auto">${bars}
      ${avg ? `<line class="avg" x1="0" x2="${W}" y1="${ay}" y2="${ay}"/>` : ''}${labels}</svg>`;
  }

  // ── Операции ─────────────────────────────────────────────────────────────

  async function loadOps(reset) {
    const o = S.ops;
    if (reset) { o.offset = 0; o.items = []; }
    if (reset) $app.innerHTML = periodBar() + opsHtml(true);
    const r = await run(() => call('list', { period: S.period, q: o.q, kind: o.kind, categoryId: o.categoryId, offset: o.offset, limit: 50 }));
    if (!r) return;
    S.period = r.period.code;
    S.periodInfo = r.period;
    o.items = reset ? r.items : o.items.concat(r.items);
    o.total = r.total;
    o.totals = r.totals;
    o.offset = o.items.length;
    if (S.tab === 'ops') {
      const focus = document.activeElement && document.activeElement.id === 'q';
      render();
      if (focus) { const q = document.getElementById('q'); q.focus(); q.setSelectionRange(q.value.length, q.value.length); }
    }
  }

  function txRow(t) {
    const c = cat(t.categoryId);
    const title = t.note || catName(c);
    // В списке операций дата уже в заголовке дня; в обзоре — показываем её в строке.
    const subLine = [S.tab === 'ops' ? '' : humanDay(t.date), t.note ? catName(c) : '', t.source === 'voice' ? '🎙 голосом' : '']
      .filter(Boolean).join(' · ');
    return `<button class="row" data-act="editTx" data-id="${t.id}">
      <span class="ico">${esc(catEmoji(c))}</span>
      <span class="main"><div class="title">${esc(title)}</div>${subLine ? `<div class="sub">${esc(subLine)}</div>` : ''}</span>
      <span class="amt ${t.kind === 'income' ? 'green' : ''}">${signed(t.kind, t.amount, t.currency)}</span></button>`;
  }

  function opsHtml(loading = false) {
    const o = S.ops;
    const fc = o.categoryId ? cat(o.categoryId) : null;
    let html = `<div class="search"><input id="q" type="search" placeholder="Поиск: кофе, такси, 250…" value="${esc(o.q)}" autocomplete="off"></div>
      <div class="chips">
        <button class="chip ${!o.kind ? 'on' : ''}" data-act="opsKind" data-kind="">Все</button>
        <button class="chip ${o.kind === 'expense' ? 'on' : ''}" data-act="opsKind" data-kind="expense">Расходы</button>
        <button class="chip ${o.kind === 'income' ? 'on' : ''}" data-act="opsKind" data-kind="income">Доходы</button>
        ${fc ? `<button class="chip on" data-act="opsCat">${esc(catEmoji(fc) + ' ' + fc.name)} ✕</button>` : ''}
      </div>`;
    if (loading) return html + '<div class="loading"><div class="spinner"></div></div>';
    if (o.totals && o.total) {
      html += `<div class="totals-line">${o.total} ${plural(o.total, 'запись', 'записи', 'записей')} · расходы ${money(o.totals.expense)}${o.totals.income ? ` · доходы ${money(o.totals.income)}` : ''}</div>`;
    }
    if (!o.items.length) {
      return html + `<div class="card empty" style="margin-top:10px"><span class="big">🔍</span>${o.q || o.kind || o.categoryId ? 'Ничего не нашлось' : 'За этот период записей нет'}</div>`;
    }
    // Группируем по дням.
    const days = [];
    for (const t of o.items) {
      let d = days[days.length - 1];
      if (!d || d.date !== t.date) { d = { date: t.date, list: [], exp: 0 }; days.push(d); }
      d.list.push(t);
      if (t.kind === 'expense' && t.currency === S.init.me.currency) d.exp += t.amount;
    }
    for (const d of days) {
      html += `<div class="day-head"><span>${esc(humanDay(d.date))}</span><span>${d.exp ? '−' + money(d.exp) : ''}</span></div>
        <div class="list">${d.list.map(txRow).join('')}</div>`;
    }
    if (o.items.length < o.total) html += `<button class="more-btn" data-act="moreOps">Показать ещё (${o.total - o.items.length})</button>`;
    return html;
  }

  function plural(n, one, few, many) {
    const n10 = n % 10, n100 = n % 100;
    if (n10 === 1 && n100 !== 11) return one;
    if (n10 >= 2 && n10 <= 4 && (n100 < 12 || n100 > 14)) return few;
    return many;
  }

  // ── Категории ────────────────────────────────────────────────────────────

  function catsHtml() {
    const kind = S.catsKind;
    const list = activeCats(kind);
    const archived = S.init.categories.filter((c) => c.kind === kind && c.archived);
    const budgets = new Map(((S.summary && S.summary.budgets) || S.init.budgets).map((b) => [b.categoryId, b]));
    let html = `<div class="seg" style="margin-bottom:12px">
      <button data-act="catsKind" data-kind="expense" class="${kind === 'expense' ? 'on' : ''}">Расходы</button>
      <button data-act="catsKind" data-kind="income" class="${kind === 'income' ? 'on' : ''}">Доходы</button></div>
      <div class="list">${list.map((c) => {
        const info = (x) => {
          const b = budgets.get(x.id);
          return [x.keywords.length ? `${x.keywords.length} ${plural(x.keywords.length, 'слово', 'слова', 'слов')}` : '', b ? `лимит ${money(b.amount)}` : ''].filter(Boolean).join(' · ');
        };
        const subs = subsOf(c.id);
        const line = [subs.length ? `${subs.length} ${plural(subs.length, 'подкатегория', 'подкатегории', 'подкатегорий')}` : '', info(c)].filter(Boolean).join(' · ');
        return `<button class="row" data-act="editCat" data-id="${c.id}"><span class="ico">${esc(c.emoji || '🏷')}</span>
          <span class="main"><div class="title">${esc(c.name)}</div>${line ? `<div class="sub">${esc(line)}</div>` : ''}</span><span class="chev">›</span></button>` +
          subs.map((s) => `<button class="row subrow" data-act="editCat" data-id="${s.id}"><span class="ico small-ico">${esc(s.emoji || '↳')}</span>
          <span class="main"><div class="title">${esc(s.name)}</div>${info(s) ? `<div class="sub">${esc(info(s))}</div>` : ''}</span><span class="chev">›</span></button>`).join('');
      }).join('')}</div>
      <button class="btn" data-act="newCat">➕ Новая категория</button>
      <p class="hint">Категорию к записи бот подбирает сам: по названию категории или подкатегории, словам, которые вы ей добавили, и встроенному словарю. Исправили категорию у записи — бот запомнит слово. Подкатегории (например, Здоровье → Аптека, Врачи) добавляются в карточке категории.</p>`;
    if (archived.length) {
      html += `<div class="day-head" style="margin-top:12px"><span>Удалённые</span></div><div class="list">${archived.map((c) => `
        <div class="row"><span class="ico">${esc(catEmoji(c))}</span><span class="main"><div class="title muted">${esc(catName(c))}</div></span>
        <button class="chip" data-act="restoreCat" data-id="${c.id}">Вернуть</button></div>`).join('')}</div>`;
    }
    return html;
  }

  // ── Ещё: Excel и настройки ───────────────────────────────────────────────

  function moreHtml() {
    const me = S.init.me;
    const p = S.periodInfo && S.periodInfo.code === S.period ? S.periodInfo : null;
    if (!p) setTimeout(loadPeriodInfo, 0);
    return `<div class="card"><h3><span>📥 Выгрузка в Excel</span></h3>
        <div class="field"><label>Что положить в таблицу</label><div class="seg">
          <button data-act="exportMode" data-mode="full" class="${S.exportMode === 'full' ? 'on' : ''}">Полный отчёт</button>
          <button data-act="exportMode" data-mode="short" class="${S.exportMode === 'short' ? 'on' : ''}">Кратко</button></div></div>
        <div class="field"><label>Категория</label><select class="input" id="exportCat">
          <option value="0">Все категории</option>
          ${treeOptions('', S.exportCat, { withIncomeMark: true })}
        </select></div>
        <p class="hint" style="margin-bottom:12px">${S.exportMode === 'full'
          ? 'Сводка с долями категорий, все операции с фильтром, траты по категориям, по дням и месяцам.'
          : 'Сводка и список операций.'} Период — ${esc(p ? p.title : '…')} (меняется вверху).</p>
        <button class="btn" data-act="export">Отправить таблицу в чат</button></div>

      <div class="card"><h3><span>⚙️ Настройки</span></h3>
        <div class="field"><label>Основная валюта</label><select class="input" id="setCur">
          ${S.init.currencies.map((c) => `<option value="${c.code}" ${c.code === me.currency ? 'selected' : ''}>${esc(c.symbol + ' ' + c.code + ' — ' + c.title)}</option>`).join('')}
        </select></div>
        <div class="field"><label>Часовой пояс</label><select class="input" id="setTz">
          ${tzOptions(me.tz)}
        </select></div></div>

      <div class="card small"><h3><span>💬 В чате с ботом</span></h3>
        <div>Пишите траты прямо в чат: «кофе 250», «такси 450 вчера», «+50000 зарплата».</div>
        <div style="margin-top:6px">🎙 Голосовые: ${S.init.voice ? '<b class="green">подключены</b>' : `<b>не подключены</b>${me.isOwner ? ' — отправьте боту <code>/setkey</code> с ключом Groq' : ''}`}</div>
      </div>`;
  }

  function tzOptions(tz) {
    const list = S.init.timezones.slice();
    if (!list.some((t) => t.min === tz)) list.push({ min: tz, label: `UTC${tz < 0 ? '−' : '+'}${Math.floor(Math.abs(tz) / 60)}${Math.abs(tz) % 60 ? ':' + String(Math.abs(tz) % 60).padStart(2, '0') : ''}` });
    return list.map((t) => `<option value="${t.min}" ${t.min === tz ? 'selected' : ''}>${esc(t.label)}</option>`).join('');
  }

  // ── Нижние панели ────────────────────────────────────────────────────────

  function openSheet(view) {
    S.stack.push(view);
    showSheet();
  }
  function showSheet() {
    const top = S.stack[S.stack.length - 1];
    if (!top) {
      $sheet.hidden = true; $backdrop.hidden = true; $sheet.innerHTML = '';
      try { tg.BackButton.hide(); } catch { /* старый клиент */ }
      return;
    }
    $sheet.innerHTML = '<div class="grab"></div>' + top.html();
    $sheet.hidden = false; $backdrop.hidden = false;
    try { tg.BackButton.show(); } catch { /* старый клиент */ }
    if (top.focus) { const el = $sheet.querySelector(top.focus); if (el) setTimeout(() => el.focus(), 50); top.focus = null; }
  }
  function closeSheet() {
    S.stack.pop();
    showSheet();
  }
  const rerenderSheet = () => {
    const scroll = $sheet.scrollTop;
    $sheet.innerHTML = '<div class="grab"></div>' + S.stack[S.stack.length - 1].html();
    $sheet.scrollTop = scroll;
  };
  const topSheet = () => S.stack[S.stack.length - 1];

  // Запись: добавить / изменить
  function openTxSheet(tx = null, preset = {}) {
    const kind = tx ? tx.kind : preset.kind || 'expense';
    const F = {
      type: 'tx', id: tx ? tx.id : 0, kind,
      amount: tx ? amountInput(tx.amount) : '', currency: tx ? tx.currency : S.init.me.currency,
      categoryId: tx ? tx.categoryId : preset.categoryId || 0, date: tx ? tx.date : S.init.today,
      note: tx ? tx.note : '', quick: '',
    };
    openSheet({
      F, focus: tx ? null : '#f-quick',
      html() {
        const cats = activeCats(F.kind);
        const selTop = topOf(cat(F.categoryId));
        const yesterday = isoAdd(S.init.today, -1);
        return `<h2><span>${F.id ? 'Изменить запись' : 'Новая запись'}</span><button class="x" data-act="close">✕</button></h2>
          ${F.id ? '' : `<div class="field"><label>Быстро, одной строкой — как в чате</label>
            <div class="quick"><input class="input" id="f-quick" data-f="quick" placeholder="кофе 250, такси 450 вчера" value="${esc(F.quick)}" enterkeyhint="send" autocomplete="off">
            <button class="btn" data-act="quickAdd">➤</button></div></div>
            <div class="or">или заполните</div>`}
          <div class="seg" style="margin-bottom:12px">
            <button data-act="txKind" data-kind="expense" class="${F.kind === 'expense' ? 'on' : ''}">💸 Расход</button>
            <button data-act="txKind" data-kind="income" class="${F.kind === 'income' ? 'on' : ''}">💰 Доход</button></div>
          <div class="field"><label>Сумма</label><div class="amount-row">
            <input class="input amount" id="f-amount" data-f="amount" inputmode="decimal" placeholder="0" value="${esc(F.amount)}" autocomplete="off">
            <select class="input" data-f="currency">${S.init.currencies.map((c) => `<option value="${c.code}" ${c.code === F.currency ? 'selected' : ''}>${esc(c.symbol)} ${c.code}</option>`).join('')}</select>
          </div></div>
          <div class="field"><label>Категория</label><div class="cat-grid">
            ${cats.map((c) => `<button data-act="txCat" data-id="${c.id}" class="${selTop && c.id === selTop.id ? 'on' : ''}"><span class="e">${esc(c.emoji || '🏷')}</span><span class="n">${esc(c.name)}${subsOf(c.id).length ? ' ›' : ''}</span></button>`).join('')}
            <button class="new" data-act="txNewCat"><span class="e">＋</span><span class="n">Новая</span></button>
          </div>${selTop ? `<div class="sub-pick"><div class="muted small">Уточнить в «${esc(selTop.name)}»:</div><div class="chips">
            <button class="chip ${F.categoryId === selTop.id ? 'on' : ''}" data-act="txSub" data-id="${selTop.id}">Без уточнения</button>
            ${subsOf(selTop.id).map((s) => `<button class="chip ${F.categoryId === s.id ? 'on' : ''}" data-act="txSub" data-id="${s.id}">${esc(s.emoji ? s.emoji + ' ' : '')}${esc(s.name)}</button>`).join('')}
            <button class="chip add" data-act="txNewSub" data-id="${selTop.id}">＋ Подкатегория</button></div></div>`
            : '<p class="hint">Не выбрали — бот подберёт сам по описанию.</p>'}</div>
          <div class="field"><label>Дата</label><div class="date-row">
            <button class="chip ${F.date === S.init.today ? 'on' : ''}" data-act="txDate" data-date="${S.init.today}">Сегодня</button>
            <button class="chip ${F.date === yesterday ? 'on' : ''}" data-act="txDate" data-date="${yesterday}">Вчера</button>
            <input class="input" type="date" data-f="date" value="${esc(F.date)}" max="${isoAdd(S.init.today, 366)}"></div></div>
          <div class="field"><label>Описание</label><input class="input" data-f="note" placeholder="например: обед с коллегами" value="${esc(F.note)}" maxlength="200" autocomplete="off"></div>
          <button class="btn" data-act="saveTx">${F.id ? 'Сохранить' : 'Добавить'}</button>
          ${F.id ? '<button class="btn danger" data-act="deleteTx">Удалить запись</button>' : ''}`;
      },
    });
  }

  // Категория или подкатегория: добавить / изменить. parentId — создать подкатегорию.
  function openCatSheet(c = null, kind = 'expense', onSaved = null, parentId = 0) {
    const budget = c ? ((S.summary && S.summary.budgets) || S.init.budgets).find((b) => b.categoryId === c.id) : null;
    const pid = c ? c.parentId : parentId;
    const F = {
      type: 'cat', id: c ? c.id : 0, kind: c ? c.kind : kind, parentId: pid, code: c ? c.code : '',
      name: c ? c.name : '', emoji: c ? c.emoji : (pid ? '' : kind === 'income' ? '💵' : '🏷'),
      keywords: c ? c.keywords.slice() : [], kw: '', sub: '', budget: budget ? amountInput(budget.amount) : '', budgetWas: budget ? budget.amount : 0,
      fallback: Boolean(c && c.fallback), onSaved,
    };
    openSheet({
      F, focus: c ? null : '#f-name',
      html() {
        const parent = F.parentId ? cat(F.parentId) : null;
        const subs = F.id && !F.parentId ? subsOf(F.id) : [];
        // Вложить можно категорию без своих подкатегорий (и не «Прочее»).
        const canNest = !F.fallback && !subs.length;
        const title = F.id ? (F.parentId ? 'Подкатегория' : 'Категория') : F.parentId ? 'Новая подкатегория' : `Новая категория ${F.kind === 'income' ? 'доходов' : 'расходов'}`;
        const tips = F.id && !F.parentId ? suggestionsFor({ id: F.id, code: F.code }) : [];
        return `<h2><span>${title}</span><button class="x" data-act="close">✕</button></h2>
          ${canNest ? `<div class="field"><label>Входит в</label><select class="input" data-f="parentId">
            <option value="0" ${!F.parentId ? 'selected' : ''}>— самостоятельная категория —</option>
            ${activeCats(F.kind).filter((x) => x.id !== F.id).map((x) => `<option value="${x.id}" ${F.parentId === x.id ? 'selected' : ''}>${esc((x.emoji ? x.emoji + ' ' : '') + x.name)}</option>`).join('')}
          </select></div>` : ''}
          <div class="field"><label>Значок и название</label><div class="emoji-pick">
            <input class="cur" data-f="emoji" value="${esc(F.emoji)}" placeholder="${esc(parent ? parent.emoji : '🏷')}" maxlength="8" aria-label="Эмодзи" style="text-align:center;border:0">
            <input class="input" id="f-name" data-f="name" placeholder="${F.parentId ? 'Например: Аптека' : 'Например: Спорт'}" value="${esc(F.name)}" maxlength="40" autocomplete="off"></div>
            <div class="emoji-grid">${EMOJIS.map((e) => `<button data-act="pickEmoji" data-e="${e}" class="${e === F.emoji ? 'on' : ''}">${e}</button>`).join('')}</div>
            <p class="hint">${parent ? `Без своего значка подкатегория показывается со значком «${esc(parent.name)}». ` : ''}Можно вписать любой эмодзи в квадрат слева.</p></div>
          ${F.id && !F.parentId ? `<div class="field"><label>Подкатегории</label>
            <div class="kw">${subs.map((x) => `<span><button data-act="editCat" data-id="${x.id}" style="color:inherit;font-size:14px;padding:0">${esc((x.emoji ? x.emoji + ' ' : '') + x.name)}</button></span>`).join('') || '<span class="muted small" style="background:none;padding:0">пока нет</span>'}</div>
            <div class="quick"><input class="input" id="f-sub" data-f="sub" placeholder="Аптека, Врачи, Стоматолог" value="${esc(F.sub)}" enterkeyhint="done" autocomplete="off">
            <button class="btn secondary" data-act="addSub">Добавить</button></div>
            ${tips.length ? `<div class="chips" style="margin-top:8px">${tips.map((n) => `<button class="chip add" data-act="addSuggested" data-name="${esc(n)}">＋ ${esc(n)}</button>`).join('')}
              ${tips.length > 1 ? '<button class="chip" data-act="addSuggested" data-all="1">✨ Все</button>' : ''}</div>` : ''}
            <p class="hint">Например, «Здоровье» → Аптека, Врачи, Стоматолог. В отчётах подкатегории складываются в свою категорию.</p></div>` : ''}
          <div class="field"><label>Слова для автоопределения</label>
            <div class="kw">${F.keywords.map((k, i) => `<span>${esc(k)}${k.includes(' ') ? '' : '…'}<button data-act="delKw" data-i="${i}">×</button></span>`).join('') || '<span class="muted small" style="background:none;padding:0">пока нет</span>'}</div>
            <div class="quick"><input class="input" id="f-kw" data-f="kw" placeholder="например: ${F.parentId ? 'нурофен' : 'теннис'}" value="${esc(F.kw)}" enterkeyhint="done" autocomplete="off">
            <button class="btn secondary" data-act="addKw">Добавить</button></div>
            <p class="hint">Если в записи встретится это слово (в любой форме), бот отнесёт её сюда. Название учитывается само.</p></div>
          ${F.kind === 'expense' ? `<div class="field"><label>Лимит на месяц (необязательно)</label>
            <input class="input" data-f="budget" inputmode="decimal" placeholder="без лимита" value="${esc(F.budget)}" autocomplete="off"></div>` : ''}
          <button class="btn" data-act="saveCat">${F.id ? 'Сохранить' : F.parentId ? 'Создать подкатегорию' : 'Создать категорию'}</button>
          ${F.id ? `<div class="inline-btns" style="margin-top:8px">
            <button class="btn secondary" data-act="moveCat" data-dir="-1">↑ Выше</button>
            <button class="btn secondary" data-act="moveCat" data-dir="1">↓ Ниже</button></div>
            ${F.fallback ? '<p class="hint">Сюда попадает всё, что бот не смог отнести к другим категориям, поэтому её нельзя удалить.</p>' : `<button class="btn danger" data-act="archiveCat">Удалить ${F.parentId ? 'подкатегорию' : 'категорию'}</button><p class="hint center">Старые записи останутся в отчётах.${subs.length ? ' Подкатегории удалятся вместе с ней.' : ''} Можно вернуть.</p>`}` : ''}`;
      },
    });
  }

  function openBudgetSheet(categoryId) {
    const budgets = (S.summary && S.summary.budgets) || S.init.budgets;
    const F = { type: 'budget', categoryId, amount: '' };
    const cur = budgets.find((b) => b.categoryId === categoryId);
    F.amount = cur ? amountInput(cur.amount) : '';
    openSheet({
      F, focus: '#f-budget',
      html() {
        return `<h2><span>Бюджет на месяц</span><button class="x" data-act="close">✕</button></h2>
          <div class="field"><label>На что</label><select class="input" data-f="categoryId">
            <option value="0" ${!F.categoryId ? 'selected' : ''}>💼 Все расходы</option>
            ${treeOptions('expense', F.categoryId)}
          </select></div>
          <div class="field"><label>Лимит, ${esc(symbol(S.init.me.currency))}</label>
            <input class="input" id="f-budget" data-f="amount" inputmode="decimal" placeholder="например: 50000" value="${esc(F.amount)}" autocomplete="off"></div>
          <button class="btn" data-act="saveBudget">Сохранить</button>
          ${cur ? '<button class="btn danger" data-act="removeBudget">Убрать лимит</button>' : ''}
          <p class="hint">Бюджеты считаются по основной валюте за календарный месяц. В чате бот предупредит на 80% и 100%.</p>`;
      },
    });
  }

  function openRangeSheet() {
    const F = { type: 'range', from: isoAdd(S.init.today, -29), to: S.init.today };
    openSheet({
      F,
      html() {
        return `<h2><span>Свой период</span><button class="x" data-act="close">✕</button></h2>
          <div class="field"><label>С</label><input class="input" type="date" data-f="from" value="${F.from}"></div>
          <div class="field"><label>По</label><input class="input" type="date" data-f="to" value="${F.to}"></div>
          <div class="chips" style="margin-bottom:12px">
            <button class="chip" data-act="rangePreset" data-days="7">7 дней</button>
            <button class="chip" data-act="rangePreset" data-days="30">30 дней</button>
            <button class="chip" data-act="rangePreset" data-days="90">90 дней</button>
            <button class="chip" data-act="rangeToday">Сегодня</button></div>
          <button class="btn" data-act="applyRange">Показать</button>`;
      },
    });
  }

  // ── Действия ─────────────────────────────────────────────────────────────

  const compactIso = (iso) => iso.replace(/-/g, '');

  const actions = {
    tab: (d) => go(d.tab),
    period: (d) => setPeriod(d.code),
    range: () => openRangeSheet(),
    close: () => closeSheet(),
    add: () => openTxSheet(),
    breakdown: (d) => { S.breakdown = d.kind; tap(); render(); },
    filterCat: (d) => { S.ops = { ...S.ops, q: '', kind: '', categoryId: +d.id }; go('ops'); },
    opsKind: (d) => { S.ops.kind = d.kind; tap(); loadOps(true); },
    opsCat: () => { S.ops.categoryId = 0; loadOps(true); },
    moreOps: (d, el) => run(() => loadOps(false), el),
    catsKind: (d) => { S.catsKind = d.kind; tap(); render(); },
    budget: (d) => openBudgetSheet(+d.id),

    async editTx(d) {
      const id = +d.id;
      const t = S.ops.items.find((x) => x.id === id) || (S.summary && S.summary.top.find((x) => x.id === id));
      if (t) openTxSheet(t);
    },
    txKind(d) { const F = topSheet().F; if (F.kind !== d.kind) { F.kind = d.kind; F.categoryId = 0; } tap(); rerenderSheet(); },
    txCat(d) {
      const F = topSheet().F;
      const selTop = topOf(cat(F.categoryId));
      F.categoryId = selTop && selTop.id === +d.id ? 0 : +d.id;
      tap();
      rerenderSheet();
    },
    txSub(d) { topSheet().F.categoryId = +d.id; tap(); rerenderSheet(); },
    txNewSub(d) {
      const txView = topSheet();
      openCatSheet(null, txView.F.kind, (id) => { txView.F.categoryId = id; }, +d.id);
    },
    txDate(d) { topSheet().F.date = d.date; tap(); rerenderSheet(); },
    txNewCat() {
      const txView = topSheet();
      openCatSheet(null, txView.F.kind, (id) => { txView.F.categoryId = id; });
    },
    async quickAdd(d, el) {
      const F = topSheet().F;
      if (!F.quick.trim()) { document.getElementById('f-quick').focus(); return; }
      const r = await run(() => call('quickAdd', { text: F.quick }), el);
      if (!r) return;
      haptic();
      closeSheet();
      const lines = r.items.map((t) => `${signed(t.kind, t.amount, t.currency)} · ${catEmoji(cat(t.categoryId))} ${catName(cat(t.categoryId))}${t.note ? ' — ' + t.note : ''}${t.uncertain ? ' 🤔' : ''}`);
      toast(`✅ Записал:\n${lines.join('\n')}${r.warnings.length ? '\n\n' + r.warnings.join('\n') : ''}`);
      refresh();
    },
    async saveTx(d, el) {
      const F = topSheet().F;
      const amount = parseAmount(F.amount);
      if (!amount) { haptic('error'); toast('Укажите сумму, например 250 или 1 234,50', true); document.getElementById('f-amount').focus(); return; }
      const r = await run(() => call('saveTx', { id: F.id, kind: F.kind, amount, currency: F.currency, categoryId: F.categoryId, date: F.date, note: F.note }), el);
      if (!r) return;
      setCategories(r.categories);
      haptic();
      closeSheet();
      toast((F.id ? '✅ Сохранено' : `✅ Записал ${signed(r.tx.kind, r.tx.amount, r.tx.currency)} · ${catName(cat(r.tx.categoryId))}`) + (r.warnings.length ? '\n\n' + r.warnings.join('\n') : ''));
      refresh();
    },
    async deleteTx(d, el) {
      const F = topSheet().F;
      const ok = await confirmDialog('Удалить эту запись?');
      if (!ok) return;
      const r = await run(() => call('deleteTx', { id: F.id }), el);
      if (!r) return;
      haptic('warning');
      closeSheet();
      toast('🗑 Запись удалена');
      refresh();
    },

    editCat: (d) => openCatSheet(cat(+d.id)),
    newCat: () => openCatSheet(null, S.catsKind),
    pickEmoji(d) { topSheet().F.emoji = d.e; tap(); rerenderSheet(); },
    addKw() {
      const F = topSheet().F;
      for (const w of F.kw.split(',').map((x) => x.trim().toLowerCase()).filter((x) => x.length >= 2)) if (!F.keywords.includes(w)) F.keywords.push(w);
      F.kw = '';
      tap();
      rerenderSheet();
      const el = document.getElementById('f-kw'); if (el) el.focus();
    },
    delKw(d) { topSheet().F.keywords.splice(+d.i, 1); tap(); rerenderSheet(); },
    async addSub(d, el) {
      const F = topSheet().F;
      const names = F.sub.split(/[,;\n]+/).map((x) => x.trim()).filter(Boolean);
      if (!names.length) { const i = document.getElementById('f-sub'); if (i) i.focus(); return; }
      await addSubs(F, names, el);
    },
    async addSuggested(d, el) {
      const F = topSheet().F;
      const names = d.all ? suggestionsFor({ id: F.id, code: F.code }) : [d.name];
      await addSubs(F, names, el);
    },
    async saveCat(d, el) {
      const F = topSheet().F;
      if (F.kw.trim()) actions.addKw();
      if (!F.name.trim()) { haptic('error'); toast('Напишите название категории', true); return; }
      const budget = F.kind === 'expense' ? (F.budget.trim() ? parseAmount(F.budget) : 0) : 0;
      if (F.budget.trim() && !budget) { haptic('error'); toast('Лимит — число, например 15000', true); return; }
      const r = await run(async () => {
        const res = await call('saveCategory', { id: F.id, kind: F.kind, name: F.name, emoji: F.emoji, keywords: F.keywords, parentId: F.parentId });
        if (F.kind === 'expense' && budget !== F.budgetWas) {
          const b = await call('setBudget', { categoryId: res.id, amount: budget });
          S.init.budgets = b.budgets;
          if (S.summary) S.summary.budgets = b.budgets;
        }
        return res;
      }, el);
      if (!r) return;
      setCategories(r.categories);
      haptic();
      const cb = F.onSaved;
      closeSheet();
      const what = F.parentId ? 'Подкатегория' : 'Категория';
      if (cb) { cb(r.id); if (S.stack.length) rerenderSheet(); toast(`✅ ${what} «${F.name.trim()}» создана`); return; }
      if (S.stack.length) rerenderSheet(); // вернулись в карточку родителя — обновим список подкатегорий
      toast(F.id ? '✅ Сохранено' : `✅ ${what} «${F.name.trim()}» создана`);
      if (S.tab === 'cats') render(); else refresh();
    },
    async moveCat(d, el) {
      const F = topSheet().F;
      const r = await run(() => call('moveCategory', { id: F.id, dir: +d.dir }), el);
      if (!r) return;
      setCategories(r.categories);
      tap();
      if (S.tab === 'cats') render();
    },
    async archiveCat(d, el) {
      const F = topSheet().F;
      if (!(await confirmDialog(`Удалить категорию «${F.name}»? Старые записи останутся в отчётах.`))) return;
      const r = await run(() => call('archiveCategory', { id: F.id, archived: true }), el);
      if (!r) return;
      setCategories(r.categories);
      haptic('warning');
      closeSheet();
      toast('🗑 Категория удалена');
      if (S.tab === 'cats') render();
    },
    async restoreCat(d, el) {
      const r = await run(() => call('archiveCategory', { id: +d.id, archived: false }), el);
      if (!r) return;
      setCategories(r.categories);
      haptic();
      render();
    },

    async saveBudget(d, el) {
      const F = topSheet().F;
      const amount = parseAmount(F.amount);
      if (!amount) { haptic('error'); toast('Укажите лимит, например 50000', true); return; }
      await setBudgetAndClose(F.categoryId, amount, el);
    },
    removeBudget: (d, el) => setBudgetAndClose(topSheet().F.categoryId, 0, el),

    rangePreset(d) { const F = topSheet().F; F.to = S.init.today; F.from = isoAdd(S.init.today, -(+d.days - 1)); rerenderSheet(); },
    rangeToday() { const F = topSheet().F; F.from = F.to = S.init.today; rerenderSheet(); },
    applyRange() {
      const F = topSheet().F;
      if (!F.from || !F.to) return;
      const [a, b] = F.from <= F.to ? [F.from, F.to] : [F.to, F.from];
      closeSheet();
      setPeriod(a === b ? 'd' + compactIso(a) : `r${compactIso(a)}_${compactIso(b)}`);
    },

    exportMode(d) { S.exportMode = d.mode; tap(); render(); },
    async export(d, el) {
      const r = await run(() => call('exportExcel', { period: S.period, mode: S.exportMode, categoryId: S.exportCat }), el);
      if (!r) return;
      haptic();
      toast(`📥 Таблица отправлена в чат с ботом (${r.count} ${plural(r.count, 'операция', 'операции', 'операций')})`);
    },
  };

  async function addSubs(F, names, el) {
    const r = await run(() => call('addSubs', { parentId: F.id, names }), el);
    if (!r) return;
    setCategories(r.categories);
    F.sub = '';
    haptic();
    rerenderSheet();
    toast(r.added.length ? `✅ Добавлено: ${r.added.map((id) => cat(id).name).join(', ')}` : 'Такие подкатегории уже есть');
    if (S.tab === 'cats') render();
  }

  async function setBudgetAndClose(categoryId, amount, el) {
    const r = await run(() => call('setBudget', { categoryId, amount }), el);
    if (!r) return;
    S.init.budgets = r.budgets;
    if (S.summary) S.summary.budgets = r.budgets;
    haptic();
    closeSheet();
    toast(amount ? '✅ Бюджет сохранён' : '🗑 Лимит убран');
    if (S.tab === 'overview') render();
  }

  function confirmDialog(text) {
    return new Promise((resolve) => {
      try { tg.showConfirm(text, (ok) => resolve(Boolean(ok))); } catch { resolve(window.confirm(text)); }
    });
  }

  // ── События ──────────────────────────────────────────────────────────────

  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-act]');
    if (!el || el.disabled) return;
    const fn = actions[el.dataset.act];
    if (fn) { e.preventDefault(); fn(el.dataset, el); }
  });
  $tabs.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-tab]');
    if (b) go(b.dataset.tab);
  });
  $backdrop.addEventListener('click', closeSheet);

  // Поля в панелях: значения сразу попадают в состояние формы.
  $sheet.addEventListener('input', (e) => {
    const f = e.target.dataset.f;
    const top = topSheet();
    if (!f || !top) return;
    top.F[f] = f === 'categoryId' || f === 'parentId' ? +e.target.value : e.target.value;
  });
  $sheet.addEventListener('change', (e) => {
    const f = e.target.dataset.f;
    const top = topSheet();
    if (!f || !top) return;
    top.F[f] = f === 'categoryId' || f === 'parentId' ? +e.target.value : e.target.value;
    if ((top.F.type === 'tx' && f === 'date') || f === 'parentId') rerenderSheet();
  });
  $sheet.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    if (e.target.id === 'f-quick') { e.preventDefault(); actions.quickAdd({}, null); }
    if (e.target.id === 'f-kw') { e.preventDefault(); actions.addKw(); }
    if (e.target.id === 'f-sub') { e.preventDefault(); actions.addSub({}, null); }
  });

  let searchTimer = null;
  $app.addEventListener('input', (e) => {
    if (e.target.id !== 'q') return;
    S.ops.q = e.target.value;
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => loadOps(true), 350);
  });
  $app.addEventListener('change', async (e) => {
    if (e.target.id === 'exportCat') { S.exportCat = +e.target.value; return; }
    if (e.target.id === 'setCur' || e.target.id === 'setTz') {
      const data = e.target.id === 'setCur' ? { currency: e.target.value } : { tz: +e.target.value };
      const r = await run(() => call('saveSettings', data));
      if (!r) return;
      S.init.me = r.me;
      S.init.today = r.today;
      S.summary = null;
      haptic();
      toast(e.target.id === 'setCur' ? `💱 Основная валюта: ${r.me.currency}` : '🕒 Часовой пояс сохранён');
    }
  });

  // ── Запуск ───────────────────────────────────────────────────────────────

  function fatal(text) {
    $tabs.hidden = true;
    $app.innerHTML = `<div class="fatal"><div class="big">🔒</div><h3>${esc(text)}</h3>
      <p>Приложение работает внутри Telegram, из чата с ботом учёта финансов.</p></div>`;
  }

  async function boot() {
    if (!tg || !tg.initData) return fatal('Откройте приложение из Telegram');
    tg.ready();
    tg.expand();
    try { tg.setHeaderColor('secondary_bg_color'); tg.setBackgroundColor('secondary_bg_color'); } catch { /* старый клиент */ }
    try { if (tg.disableVerticalSwipes) tg.disableVerticalSwipes(); } catch { /* старый клиент */ }
    try { tg.BackButton.onClick(closeSheet); } catch { /* старый клиент */ }

    try {
      S.init = await call('init');
    } catch (e) {
      return fatal(e.message || 'Не удалось загрузить данные');
    }
    setCategories(S.init.categories);
    S.period = S.init.periods.month;
    $tabs.hidden = false;

    const screen = new URLSearchParams(location.search).get('screen') || (tg.initDataUnsafe && tg.initDataUnsafe.start_param) || '';
    if (screen === 'categories') go('cats');
    else if (screen === 'more' || screen === 'excel') go('more');
    else if (screen === 'ops') go('ops');
    else {
      go('overview');
      if (screen === 'add') openTxSheet();
    }
  }

  boot();
})();
