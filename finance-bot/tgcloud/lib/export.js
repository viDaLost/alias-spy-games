// Сборка Excel-отчёта: «Сводка», «Операции», «По дням», «По месяцам»
// и по вкладке на каждую категорию.

import { Workbook, excelDate, ref } from './xlsx.js';
import { toLocal, fmtYmd, addDays, cmpYmd, localToday, isoYmd, MONTHS } from './dates.js';
import { currencySymbol } from './format.js';

const TAB_COLORS = ['C0504D', '4F81BD', '9BBB59', '8064A2', 'F79646', '4BACC6', 'E46C0A', '2C4D75', '77933C', '7F6084'];

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const toUnits = (minor) => Math.round(minor) / 100;
const catTitle = (c) => (c ? c.name : 'Без категории');

/**
 * opts: { period, tz, mainCurrency, txs, catsById, category (или null), mode: 'tabs' | 'list' }
 * Возвращает { bytes, filename, stats }.
 */
export function buildWorkbook({ period, tz, mainCurrency, txs, catsById, category = null, mode = 'tabs' }) {
  const wb = new Workbook();
  const currencies = orderCurrencies(txs, mainCurrency);
  const multi = currencies.length > 1;
  const rows = txs.map((t) => {
    const l = toLocal(t.occurred_at, tz);
    return { ...t, l, cat: catsById.get(t.category_id) || null };
  });

  // Фактические границы для «всего времени».
  let fromYmd = period.fromYmd, toYmd = period.toYmd;
  if (!fromYmd && rows.length) {
    fromYmd = { y: rows[0].l.y, m: rows[0].l.m, d: rows[0].l.d };
    const last = rows[rows.length - 1].l;
    toYmd = { y: last.y, m: last.m, d: last.d };
  }

  buildSummary(wb, { period, rows, currencies, multi, category, fromYmd, toYmd, tz });
  buildOperations(wb, rows, multi);
  if (fromYmd) buildDaily(wb, rows, currencies[0], fromYmd, toYmd);
  if (fromYmd && (fromYmd.y !== toYmd.y || fromYmd.m !== toYmd.m)) buildMonthly(wb, rows, currencies[0]);
  if (mode === 'tabs' && !category) buildCategoryTabs(wb, rows, multi);

  const suffix = category ? '_' + translit(category.name) : '';
  const filename = `finance_${periodSlug(period)}${suffix}.xlsx`;
  return { bytes: wb.toBytes(), filename, stats: totalsByCurrency(rows) };
}

// Имя файла латиницей: не все клиенты одинаково показывают кириллицу в именах.
function periodSlug(p) {
  if (p.kind === 'all') return 'all-time';
  if (p.kind === 'month') return isoYmd(p.fromYmd).slice(0, 7);
  if (p.kind === 'year') return String(p.fromYmd.y);
  if (p.kind === 'day') return isoYmd(p.fromYmd);
  return `${isoYmd(p.fromYmd)}_${isoYmd(p.toYmd)}`;
}

const TRANSLIT = { а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya' };

function translit(s) {
  return String(s).toLowerCase().split('').map((ch) => (ch in TRANSLIT ? TRANSLIT[ch] : ch)).join('')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'category';
}

function orderCurrencies(txs, main) {
  const set = new Set(txs.map((t) => t.currency));
  const list = [...set].filter((c) => c !== main).sort();
  return set.has(main) || !list.length ? [main, ...list] : list;
}

export function totalsByCurrency(rows) {
  const map = new Map();
  for (const t of rows) {
    const s = map.get(t.currency) || { expense: 0, income: 0, count: 0 };
    s[t.kind] += t.amount;
    s.count += 1;
    map.set(t.currency, s);
  }
  return map;
}

// ── Сводка ─────────────────────────────────────────────────────────────────

function buildSummary(wb, { period, rows, currencies, multi, category, fromYmd, toYmd, tz }) {
  const ws = wb.addSheet('Сводка', { widths: [34, 18, 11, 11, 16], tab: '1F4E78' });
  ws.row([{ v: `Учёт финансов · ${period.title}`, s: 'title' }], { height: 26 });
  ws.merge('A1:E1');
  const now = toLocal(Math.floor(Date.now() / 1000), tz);
  const parts = [];
  if (fromYmd) parts.push(`Период: ${fmtYmd(fromYmd)} — ${fmtYmd(toYmd)}`);
  if (category) parts.push(`Категория: ${category.name}`);
  parts.push(`Сформировано ${fmtYmd(now)} ${String(now.hh).padStart(2, '0')}:${String(now.mi).padStart(2, '0')}`);
  ws.row([{ v: parts.join(' · '), s: 'subtitle' }]);
  ws.merge('A2:E2');

  const days = fromYmd ? Math.max(1, Math.round((Date.UTC(toYmd.y, toYmd.m - 1, toYmd.d) - Date.UTC(fromYmd.y, fromYmd.m - 1, fromYmd.d)) / 86400000) + 1) : 1;
  // Для текущего периода средний расход считаем по прошедшим дням.
  const today = localToday(tz);
  let elapsed = days;
  if (fromYmd && cmpYmd(toYmd, today) > 0 && cmpYmd(fromYmd, today) <= 0) {
    elapsed = Math.round((Date.UTC(today.y, today.m - 1, today.d) - Date.UTC(fromYmd.y, fromYmd.m - 1, fromYmd.d)) / 86400000) + 1;
  }

  for (const cur of currencies) {
    const list = rows.filter((r) => r.currency === cur);
    const exp = list.filter((r) => r.kind === 'expense').reduce((s, r) => s + r.amount, 0);
    const inc = list.filter((r) => r.kind === 'income').reduce((s, r) => s + r.amount, 0);
    const sym = currencySymbol(cur);
    ws.row([]);
    ws.row([{ v: multi ? `Итоги, ${cur}` : 'Итоги', s: 'section' }], { height: 20 });
    ws.row([{ v: `Расходы, ${sym}`, s: 'kpiLabel' }, { v: toUnits(exp), s: 'kpiRed' }]);
    ws.row([{ v: `Доходы, ${sym}`, s: 'kpiLabel' }, { v: toUnits(inc), s: 'kpiGreen' }]);
    ws.row([{ v: `Баланс, ${sym}`, s: 'kpiLabel' }, { v: toUnits(inc - exp), s: 'kpiMoney' }]);
    ws.row([{ v: 'Операций', s: 'kpiLabel' }, { v: list.length, s: 'int' }]);
    ws.row([{ v: `Средний расход в день, ${sym}`, s: 'kpiLabel' }, { v: toUnits(exp / Math.max(1, elapsed)), s: 'money' }]);

    for (const kind of ['expense', 'income']) {
      const byCat = new Map();
      for (const r of list.filter((x) => x.kind === kind)) {
        const key = r.category_id;
        const e = byCat.get(key) || { cat: r.cat, sum: 0, cnt: 0 };
        e.sum += r.amount; e.cnt += 1;
        byCat.set(key, e);
      }
      if (!byCat.size) continue;
      const total = [...byCat.values()].reduce((s, e) => s + e.sum, 0);
      ws.row([]);
      ws.row([{ v: (kind === 'expense' ? 'Расходы по категориям' : 'Доходы по категориям') + (multi ? `, ${cur}` : ''), s: 'section' }], { height: 20 });
      ws.row([
        { v: 'Категория', s: 'head' }, { v: `Сумма, ${sym}`, s: 'head' }, { v: 'Доля', s: 'head' },
        { v: 'Операций', s: 'head' }, { v: `Средний чек, ${sym}`, s: 'head' },
      ], { height: 20 });
      const first = ws.nextRow;
      for (const e of [...byCat.values()].sort((a, b) => b.sum - a.sum)) {
        const r = ws.nextRow;
        ws.row([
          { v: `${e.cat && e.cat.emoji ? e.cat.emoji + ' ' : ''}${catTitle(e.cat)}`, s: 'text' },
          { v: toUnits(e.sum), s: kind === 'expense' ? 'moneyRed' : 'moneyGreen' },
          { v: total ? e.sum / total : 0, s: 'pct' },
          { v: e.cnt, s: 'int' },
          { v: toUnits(e.sum / e.cnt), s: 'money', f: `${ref(2, r)}/${ref(4, r)}` },
        ]);
      }
      const last = ws.nextRow - 1;
      ws.row([
        { v: 'Итого', s: 'totalLabel' },
        { v: toUnits(total), s: 'totalMoney', f: `SUM(${ref(2, first)}:${ref(2, last)})` },
        { v: 1, s: 'totalPct' },
        { v: [...byCat.values()].reduce((s, e) => s + e.cnt, 0), s: 'totalInt', f: `SUM(${ref(4, first)}:${ref(4, last)})` },
        { v: '', s: 'totalText' },
      ]);
    }
  }
  if (!rows.length) {
    ws.row([]);
    ws.row([{ v: 'За этот период операций нет.', s: 'subtitle' }]);
  }
}

// ── Операции ───────────────────────────────────────────────────────────────

function txRow(r, withCategory) {
  const cells = [
    { v: excelDate(r.l.y, r.l.m, r.l.d), s: 'date' },
    { v: (r.l.hh * 60 + r.l.mi) / 1440, s: 'time' },
  ];
  if (withCategory) cells.push({ v: `${r.cat && r.cat.emoji ? r.cat.emoji + ' ' : ''}${catTitle(r.cat)}`, s: 'text' });
  cells.push({ v: r.note || '', s: 'text' });
  return cells;
}

function buildOperations(wb, rows, multi) {
  const ws = wb.addSheet('Операции', { widths: [12, 8, 26, 40, 14, 14, 9, 9], freeze: 1, tab: '2E75B6' });
  ws.row(['Дата', 'Время', 'Категория', 'Описание', 'Расход', 'Доход', 'Валюта', 'Ввод'].map((v) => ({ v, s: 'head' })), { height: 22 });
  for (const r of rows) {
    ws.row([
      ...txRow(r, true),
      r.kind === 'expense' ? { v: toUnits(r.amount), s: 'moneyRed' } : { v: '', s: 'money' },
      r.kind === 'income' ? { v: toUnits(r.amount), s: 'moneyGreen' } : { v: '', s: 'money' },
      { v: r.currency, s: 'text' },
      { v: r.source === 'voice' ? '🎙 голос' : '⌨️ текст', s: 'text' },
    ]);
  }
  const last = ws.nextRow - 1;
  ws.autoFilter(`A1:${ref(8, Math.max(2, last))}`);
  if (rows.length) {
    const expSum = rows.filter((r) => r.kind === 'expense').reduce((s, r) => s + r.amount, 0);
    const incSum = rows.filter((r) => r.kind === 'income').reduce((s, r) => s + r.amount, 0);
    ws.row([]);
    ws.row([
      { v: 'Итого (учитывает фильтр)', s: 'totalLabel' }, { v: '', s: 'totalText' }, { v: '', s: 'totalText' },
      { v: multi ? 'сумма по всем валютам — фильтруйте по «Валюта»' : '', s: 'totalText' },
      { v: toUnits(expSum), s: 'totalMoney', f: `SUBTOTAL(109,E2:E${last})` },
      { v: toUnits(incSum), s: 'totalMoney', f: `SUBTOTAL(109,F2:F${last})` },
      { v: '', s: 'totalText' }, { v: '', s: 'totalText' },
    ]);
  }
}

// ── По дням / по месяцам ──────────────────────────────────────────────────

function buildDaily(wb, rows, currency, fromYmd, toYmd) {
  const sym = currencySymbol(currency);
  const ws = wb.addSheet('По дням', { widths: [12, 16, 16, 16, 11], freeze: 1, tab: '70AD47' });
  ws.row(['Дата', `Расходы, ${sym}`, `Доходы, ${sym}`, `Разница, ${sym}`, 'Операций'].map((v) => ({ v, s: 'head' })), { height: 22 });
  const map = new Map();
  for (const r of rows) {
    if (r.currency !== currency) continue;
    const key = `${r.l.y}-${r.l.m}-${r.l.d}`;
    const e = map.get(key) || { y: r.l.y, m: r.l.m, d: r.l.d, expense: 0, income: 0, cnt: 0 };
    e[r.kind] += r.amount; e.cnt += 1;
    map.set(key, e);
  }
  const span = Math.round((Date.UTC(toYmd.y, toYmd.m - 1, toYmd.d) - Date.UTC(fromYmd.y, fromYmd.m - 1, fromYmd.d)) / 86400000) + 1;
  let days;
  if (span <= 400) {
    days = [];
    for (let d = fromYmd; cmpYmd(d, toYmd) <= 0; d = addDays(d, 1)) {
      days.push(map.get(`${d.y}-${d.m}-${d.d}`) || { ...d, expense: 0, income: 0, cnt: 0 });
    }
  } else {
    days = [...map.values()].sort((a, b) => cmpYmd(a, b));
  }
  const first = ws.nextRow;
  for (const e of days) {
    const r = ws.nextRow;
    ws.row([
      { v: excelDate(e.y, e.m, e.d), s: 'date' },
      { v: toUnits(e.expense), s: 'moneyRed' },
      { v: toUnits(e.income), s: 'moneyGreen' },
      { v: toUnits(e.income - e.expense), s: 'money', f: `${ref(3, r)}-${ref(2, r)}` },
      { v: e.cnt, s: 'int' },
    ]);
  }
  totalsRow(ws, first, days, 4);
}

function buildMonthly(wb, rows, currency) {
  const sym = currencySymbol(currency);
  const ws = wb.addSheet('По месяцам', { widths: [18, 16, 16, 16, 11], freeze: 1, tab: 'FFC000' });
  ws.row(['Месяц', `Расходы, ${sym}`, `Доходы, ${sym}`, `Разница, ${sym}`, 'Операций'].map((v) => ({ v, s: 'head' })), { height: 22 });
  const map = new Map();
  for (const r of rows) {
    if (r.currency !== currency) continue;
    const key = r.l.y * 100 + r.l.m;
    const e = map.get(key) || { y: r.l.y, m: r.l.m, expense: 0, income: 0, cnt: 0 };
    e[r.kind] += r.amount; e.cnt += 1;
    map.set(key, e);
  }
  const months = [...map.entries()].sort((a, b) => a[0] - b[0]).map((x) => x[1]);
  const first = ws.nextRow;
  for (const e of months) {
    const r = ws.nextRow;
    ws.row([
      { v: `${cap(MONTHS[e.m - 1])} ${e.y}`, s: 'text' },
      { v: toUnits(e.expense), s: 'moneyRed' },
      { v: toUnits(e.income), s: 'moneyGreen' },
      { v: toUnits(e.income - e.expense), s: 'money', f: `${ref(3, r)}-${ref(2, r)}` },
      { v: e.cnt, s: 'int' },
    ]);
  }
  totalsRow(ws, first, months, 4);
}

function totalsRow(ws, first, list, sumCols) {
  if (!list.length) return;
  const last = ws.nextRow - 1;
  const exp = list.reduce((s, e) => s + e.expense, 0), inc = list.reduce((s, e) => s + e.income, 0);
  const cnt = list.reduce((s, e) => s + e.cnt, 0);
  const vals = [toUnits(exp), toUnits(inc), toUnits(inc - exp)];
  const cells = [{ v: 'Итого', s: 'totalLabel' }];
  for (let c = 2; c <= sumCols; c++) cells.push({ v: vals[c - 2], s: 'totalMoney', f: `SUM(${ref(c, first)}:${ref(c, last)})` });
  cells.push({ v: cnt, s: 'totalInt', f: `SUM(${ref(sumCols + 1, first)}:${ref(sumCols + 1, last)})` });
  ws.row(cells);
}

// ── Вкладка на каждую категорию ───────────────────────────────────────────

function buildCategoryTabs(wb, rows, multi) {
  const groups = new Map();
  for (const r of rows) {
    const key = `${r.kind}:${r.category_id}`;
    if (!groups.has(key)) groups.set(key, { kind: r.kind, cat: r.cat, list: [] });
    groups.get(key).list.push(r);
  }
  const ordered = [...groups.values()].sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'expense' ? -1 : 1;
    return b.list.reduce((s, r) => s + r.amount, 0) - a.list.reduce((s, r) => s + r.amount, 0);
  });
  ordered.forEach((g, i) => {
    const title = catTitle(g.cat);
    const name = g.kind === 'income' && !/доход/i.test(title) ? `${title} (доход)` : title;
    const ws = wb.addSheet(name, { widths: [12, 8, 44, 14, 9], freeze: 1, tab: TAB_COLORS[i % TAB_COLORS.length] });
    ws.row(['Дата', 'Время', 'Описание', 'Сумма', 'Валюта'].map((v) => ({ v, s: 'head' })), { height: 22 });
    const first = ws.nextRow;
    for (const r of g.list) {
      ws.row([...txRow(r, false), { v: toUnits(r.amount), s: g.kind === 'expense' ? 'moneyRed' : 'moneyGreen' }, { v: r.currency, s: 'text' }]);
    }
    const last = ws.nextRow - 1;
    ws.autoFilter(`A1:E${last}`);
    ws.row([]);
    ws.row([
      { v: 'Итого', s: 'totalLabel' }, { v: '', s: 'totalText' },
      { v: `${g.list.length} оп.${multi ? ' · все валюты' : ''}`, s: 'totalText' },
      { v: toUnits(g.list.reduce((s, r) => s + r.amount, 0)), s: 'totalMoney', f: `SUBTOTAL(109,D${first}:D${last})` },
      { v: '', s: 'totalText' },
    ]);
  });
}
