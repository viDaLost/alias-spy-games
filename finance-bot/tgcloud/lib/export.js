// Сборка Excel-отчёта.
//   Полный:  «Сводка», «Операции», «По категориям», «По дням», «По месяцам»
//            и «Категории по месяцам» (если в периоде больше одного месяца).
//   Кратко:  «Сводка» и «Операции».
//   Одна категория: «Сводка» и «Операции» только по ней (+ «По месяцам»).

import { Workbook, excelDate, ref, moneyFormat } from './xlsx.js';
import { toLocal, fmtYmd, cmpYmd, localToday, isoYmd, MONTHS } from './dates.js';
import { currencySymbol } from './format.js';

const WEEKDAYS = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];
const BAR_WIDTH = 20;

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const toUnits = (minor) => Math.round(minor) / 100;
const catTitle = (c) => {
  if (!c) return '❔ Без категории';
  const emoji = c.emoji || c.parent_emoji || '';
  return `${emoji ? emoji + ' ' : ''}${c.parent_name ? c.parent_name + ' › ' : ''}${c.name}`;
};
const sum = (list) => list.reduce((s, r) => s + r.amount, 0);
const ymdKey = (l) => l.y * 10000 + l.m * 100 + l.d;
const monthTitle = (y, m) => `${cap(MONTHS[m - 1])} ${y}`;
const plural = (n, one, few, many) => {
  const n10 = n % 10, n100 = n % 100;
  if (n10 === 1 && n100 !== 11) return one;
  if (n10 >= 2 && n10 <= 4 && (n100 < 12 || n100 > 14)) return few;
  return many;
};
const ops = (n) => `${n} ${plural(n, 'операция', 'операции', 'операций')}`;

/** Наглядная полоска доли: «██████». */
function barText(share) {
  const n = Math.round(share * BAR_WIDTH);
  return '█'.repeat(share > 0 ? Math.max(1, n) : 0);
}

/**
 * opts: { period, tz, mainCurrency, txs, catsById, category (или null), mode: 'tabs' | 'list' }
 * Возвращает { bytes, filename, stats }.
 */
export function buildWorkbook({ period, tz, mainCurrency, txs, catsById, category = null, mode = 'tabs' }) {
  const currencies = orderCurrencies(txs, mainCurrency);
  const multi = currencies.length > 1;
  // Одна валюта — символ прямо в ячейке («3 000 ₽»); копейки, только если они есть.
  const whole = txs.every((t) => t.amount % 100 === 0);
  const wb = new Workbook({ money: moneyFormat(multi ? '' : currencySymbol(currencies[0]), whole) });
  // top — категория верхнего уровня (для итогов), sub — подкатегория, если запись в ней.
  const rows = txs.map((t) => {
    const l = toLocal(t.occurred_at, tz);
    const cat = catsById.get(t.category_id) || null;
    const parent = cat && cat.parent_id ? catsById.get(cat.parent_id) : null;
    return { ...t, l, cat, top: parent || cat, sub: parent ? cat : null };
  });

  // Фактические границы для «всего времени».
  let fromYmd = period.fromYmd, toYmd = period.toYmd;
  if (!fromYmd && rows.length) {
    fromYmd = { y: rows[0].l.y, m: rows[0].l.m, d: rows[0].l.d };
    const last = rows[rows.length - 1].l;
    toYmd = { y: last.y, m: last.m, d: last.d };
  }
  const months = new Set(rows.map((r) => r.l.y * 100 + r.l.m)).size;
  // Колонка «Подкатегория» появляется, когда в выгрузке есть записи в подкатегориях.
  const withSub = rows.some((r) => r.sub);
  const ctx = { period, tz, rows, currencies, multi, category, fromYmd, toYmd, main: currencies[0], withSub };

  buildSummary(wb, ctx);
  buildOperations(wb, ctx);
  if (mode === 'tabs' && !category) {
    buildByCategory(wb, ctx);
    buildDaily(wb, ctx);
  }
  if (mode === 'tabs' && months > 1) {
    buildMonthly(wb, ctx);
    if (!category) buildCategoryMonths(wb, ctx);
  }

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

// Подпись валюты в заголовке колонки — только когда валют несколько
// (с одной валютой символ стоит прямо в ячейках).
const curLabel = (ctx, cur = ctx.main) => (ctx.multi ? `, ${currencySymbol(cur)}` : '');

// Группы по категориям верхнего уровня; subs — разбивка по подкатегориям
// (пустая, если подкатегорий в группе нет; «без уточнения» — записи в самой категории).
function groupByCategory(list) {
  const map = new Map();
  for (const r of list) {
    const topId = r.top ? r.top.id : 0;
    const key = `${r.kind}:${topId}`;
    if (!map.has(key)) map.set(key, { kind: r.kind, cat: r.top, list: [], total: 0, parts: new Map() });
    const g = map.get(key);
    g.list.push(r);
    g.total += r.amount;
    const pk = r.sub ? r.sub.id : 0;
    const part = g.parts.get(pk) || { name: r.sub ? r.sub.name : 'без уточнения', total: 0, count: 0 };
    part.total += r.amount; part.count += 1;
    g.parts.set(pk, part);
  }
  return [...map.values()].sort((a, b) => b.total - a.total).map((g) => ({
    ...g,
    subs: [...g.parts.keys()].some((k) => k) ? [...g.parts.values()].sort((a, b) => b.total - a.total) : [],
  }));
}

// ── Сводка ─────────────────────────────────────────────────────────────────

function buildSummary(wb, ctx) {
  const { period, rows, currencies, multi, category, fromYmd, toYmd, tz } = ctx;
  const ws = wb.addSheet('Сводка', { widths: [34, 17, 11, 24, 11, 16], tab: '1F4E78' });
  ws.row([{ v: `Учёт финансов · ${period.title}${category ? ' · ' + catTitle(category) : ''}`, s: 'title' }], { height: 26 });
  ws.merge('A1:F1');
  const now = toLocal(Math.floor(Date.now() / 1000), tz);
  const parts = [];
  if (fromYmd) parts.push(`${fmtYmd(fromYmd)} — ${fmtYmd(toYmd)}`);
  parts.push(`сформировано ${fmtYmd(now)} в ${String(now.hh).padStart(2, '0')}:${String(now.mi).padStart(2, '0')}`);
  ws.row([{ v: cap(parts.join(' · ')), s: 'subtitle' }]);
  ws.merge('A2:F2');

  if (!rows.length) {
    ws.row([]);
    ws.row([{ v: 'За этот период операций нет.', s: 'subtitle' }]);
    return;
  }

  // Средний расход в день: с первой записи (если учёт начат посреди периода)
  // и, для текущего периода, по уже прошедшим дням.
  const today = localToday(tz);
  const firstDay = { y: rows[0].l.y, m: rows[0].l.m, d: rows[0].l.d };
  const start = cmpYmd(firstDay, fromYmd) > 0 ? firstDay : fromYmd;
  const end = cmpYmd(toYmd, today) > 0 && cmpYmd(start, today) <= 0 ? today : toYmd;
  const days = Math.max(1, Math.round((Date.UTC(end.y, end.m - 1, end.d) - Date.UTC(start.y, start.m - 1, start.d)) / 86400000) + 1);

  for (const cur of currencies) {
    const list = rows.filter((r) => r.currency === cur);
    const expList = list.filter((r) => r.kind === 'expense');
    const incList = list.filter((r) => r.kind === 'income');
    const exp = sum(expList), inc = sum(incList);
    const expGroups = groupByCategory(expList);
    const incGroups = groupByCategory(incList);

    ws.row([]);
    ws.row([{ v: multi ? `Итоги в ${cur}` : 'Итоги', s: 'section' }], { height: 20 });
    ws.row([{ v: 'Потрачено', s: 'kpiLabel' }, { v: toUnits(exp), s: 'kpiRed' }]);
    ws.row([{ v: 'Получено', s: 'kpiLabel' }, { v: toUnits(inc), s: 'kpiGreen' }]);
    ws.row([{ v: 'Остаток (получено − потрачено)', s: 'kpiLabel' }, { v: toUnits(inc - exp), s: 'kpiMoney' }]);
    ws.row([{ v: 'Операций', s: 'kpiLabel' }, { v: list.length, s: 'kpiInt' }]);
    if (exp) {
      ws.row([{ v: days > 1 ? `В среднем тратите в день (${days} дн.)` : 'Потрачено за день', s: 'kpiLabel' }, { v: toUnits(exp / days), s: 'kpiPlain' }]);
      const top = expGroups[0];
      ws.row([{ v: 'Больше всего уходит на', s: 'kpiLabel' }, { v: `${catTitle(top.cat)} — ${Math.round((top.total / exp) * 100)}%`, s: 'kpiText' }]);
      ws.merge(`B${ws.nextRow - 1}:D${ws.nextRow - 1}`);
    }

    categoryTable(ws, ctx, cur, expGroups, exp, 'expense');
    categoryTable(ws, ctx, cur, incGroups, inc, 'income');

    // Самые крупные траты.
    const top = [...expList].sort((a, b) => b.amount - a.amount).slice(0, 10);
    if (top.length > 1) {
      ws.row([]);
      ws.row([{ v: `Самые крупные траты${multi ? ', ' + cur : ''}`, s: 'section' }], { height: 20 });
      ws.row(['Категория', `Сумма${curLabel(ctx, cur)}`, 'Дата', 'Описание', '', ''].map((v) => ({ v, s: 'head' })), { height: 20 });
      ws.merge(`D${ws.nextRow - 1}:F${ws.nextRow - 1}`);
      for (const r of top) {
        const n = ws.row([
          { v: catTitle(r.cat), s: 'text' },
          { v: toUnits(r.amount), s: 'moneyRed' },
          { v: excelDate(r.l.y, r.l.m, r.l.d), s: 'date' },
          { v: r.note || '', s: 'text' }, { v: '', s: 'text' }, { v: '', s: 'text' },
        ]);
        ws.merge(`D${n}:F${n}`);
      }
    }
  }

  ws.row([]);
  const tip = category
    ? 'Все операции этой категории — на вкладке «Операции».'
    : 'Вкладки внизу: «Операции» — полный список (стрелки ▾ в заголовках фильтруют по дате и категории, итог внизу пересчитывается), «По категориям» — траты, сгруппированные по категориям, «По дням» и «По месяцам» — динамика.';
  const n = ws.row([{ v: tip, s: 'note' }], { height: 45 });
  ws.merge(`A${n}:F${n}`);
}

function categoryTable(ws, ctx, cur, groups, total, kind) {
  if (!groups.length) return;
  const exp = kind === 'expense';
  ws.row([]);
  ws.row([{ v: (exp ? 'Куда ушли деньги' : 'Откуда пришли деньги') + (ctx.multi ? `, ${cur}` : ''), s: 'section' }], { height: 20 });
  ws.row([
    { v: 'Категория', s: 'head' }, { v: `Сумма${curLabel(ctx, cur)}`, s: 'head' }, { v: 'Доля', s: 'head' },
    { v: 'Наглядно', s: 'head' }, { v: 'Операций', s: 'head' }, { v: `Средний чек${curLabel(ctx, cur)}`, s: 'head' },
  ], { height: 20 });
  // Итог суммирует только строки категорий: строки подкатегорий — их разбивка.
  const mainRows = [];
  for (const g of groups) {
    const r = ws.nextRow;
    mainRows.push(r);
    const share = total ? g.total / total : 0;
    ws.row([
      { v: catTitle(g.cat), s: g.subs.length ? 'textBold' : 'text' },
      { v: toUnits(g.total), s: exp ? 'moneyRed' : 'moneyGreen' },
      { v: share, s: 'pct' },
      { v: barText(share), s: 'bar' },
      { v: g.list.length, s: 'int' },
      { v: toUnits(g.total / g.list.length), s: 'money', f: `${ref(2, r)}/${ref(5, r)}` },
    ]);
    for (const p of g.subs) {
      const rs = ws.nextRow;
      ws.row([
        { v: `      ↳ ${p.name}`, s: 'mutedLeft' },
        { v: toUnits(p.total), s: 'money' },
        { v: total ? p.total / total : 0, s: 'pctMuted' },
        { v: '', s: 'text' },
        { v: p.count, s: 'muted' },
        { v: toUnits(p.total / p.count), s: 'money', f: `${ref(2, rs)}/${ref(5, rs)}` },
      ]);
    }
  }
  const sumOf = (col) => mainRows.map((r) => ref(col, r)).join('+');
  ws.row([
    { v: exp ? 'Всего потрачено' : 'Всего получено', s: 'totalLabel' },
    { v: toUnits(total), s: 'totalMoney', f: sumOf(2) },
    { v: 1, s: 'totalPct' },
    { v: '', s: 'totalText' },
    { v: groups.reduce((s, g) => s + g.list.length, 0), s: 'totalInt', f: sumOf(5) },
    { v: '', s: 'totalText' },
  ]);
}

// ── Операции ───────────────────────────────────────────────────────────────

function buildOperations(wb, ctx) {
  const { rows, multi, category, withSub } = ctx;
  const withCat = !category;
  const head = ['Дата', 'День', ...(withCat ? ['Категория'] : []), ...(withSub ? ['Подкатегория'] : []), 'Описание',
    `Расход${curLabel(ctx)}`, `Доход${curLabel(ctx)}`, ...(multi ? ['Валюта'] : [])];
  const widths = [12, 6, ...(withCat ? [24] : []), ...(withSub ? [20] : []), 38, 15, 15, ...(multi ? [8] : [])];
  const ws = wb.addSheet('Операции', { widths, freeze: 1, tab: '2E75B6' });
  ws.row(head.map((v) => ({ v, s: 'head' })), { height: 22 });
  const expCol = 4 + (withCat ? 1 : 0) + (withSub ? 1 : 0);

  // Строки одного дня — одним цветом, дни чередуются: так проще читать список.
  let zebra = false, prevDay = null;
  for (const r of rows) {
    const day = ymdKey(r.l);
    if (prevDay !== null && day !== prevDay) zebra = !zebra;
    prevDay = day;
    const z = zebra ? 'Z' : '';
    ws.row([
      { v: excelDate(r.l.y, r.l.m, r.l.d), s: 'date' + z },
      { v: WEEKDAYS[r.l.dow], s: 'muted' + z },
      // С колонкой подкатегорий категория — верхнего уровня, подкатегория — отдельно (по ней работает фильтр).
      ...(withCat ? [{ v: catTitle(withSub ? r.top : r.cat), s: 'text' + z }] : []),
      ...(withSub ? [{ v: r.sub ? r.sub.name : '', s: 'text' + z }] : []),
      { v: r.note || '', s: 'text' + z },
      r.kind === 'expense' ? { v: toUnits(r.amount), s: 'moneyRed' + z } : { v: '', s: 'money' + z },
      r.kind === 'income' ? { v: toUnits(r.amount), s: 'moneyGreen' + z } : { v: '', s: 'money' + z },
      ...(multi ? [{ v: r.currency, s: 'muted' + z }] : []),
    ]);
  }
  const last = ws.nextRow - 1;
  ws.autoFilter(`A1:${ref(head.length, Math.max(2, last))}`);
  if (!rows.length) return;

  const cells = [{ v: 'Итого (с учётом фильтра)', s: 'totalLabel' }];
  for (let c = 2; c < expCol; c++) cells.push({ v: c === expCol - 1 && multi ? 'разные валюты — отфильтруйте «Валюта»' : '', s: 'totalText' });
  cells.push(
    { v: toUnits(sum(rows.filter((r) => r.kind === 'expense'))), s: 'totalMoney', f: `SUBTOTAL(109,${ref(expCol, 2)}:${ref(expCol, last)})` },
    { v: toUnits(sum(rows.filter((r) => r.kind === 'income'))), s: 'totalMoney', f: `SUBTOTAL(109,${ref(expCol + 1, 2)}:${ref(expCol + 1, last)})` },
  );
  if (multi) cells.push({ v: '', s: 'totalText' });
  ws.row([]);
  ws.row(cells);
}

// ── По категориям: блок на каждую категорию ──────────────────────────────

function buildByCategory(wb, ctx) {
  const { rows, multi, main } = ctx;
  const withSub = rows.some((r) => r.sub);
  const ws = wb.addSheet('По категориям', { widths: [12, 6, ...(withSub ? [20] : []), 40, 16], freeze: 1, tab: '8064A2' });
  ws.row(['Дата', 'День', ...(withSub ? ['Подкатегория'] : []), 'Описание', `Сумма${curLabel(ctx)}`].map((v) => ({ v, s: 'head' })), { height: 22 });
  const last = withSub ? 'D' : 'C';

  for (const kind of ['expense', 'income']) {
    const list = rows.filter((r) => r.kind === kind);
    if (!list.length) continue;
    const groups = groupByCategory(list);
    const mainTotal = sum(list.filter((r) => r.currency === main));
    ws.row([]);
    ws.row([{ v: kind === 'expense' ? 'Расходы' : 'Доходы', s: 'section' }], { height: 22 });
    for (const g of groups) {
      const inMain = sum(g.list.filter((r) => r.currency === main));
      const share = mainTotal && inMain ? ` · ${Math.round((inMain / mainTotal) * 100)}% ${kind === 'expense' ? 'расходов' : 'доходов'}` : '';
      const h = ws.row([
        { v: `${catTitle(g.cat)} · ${ops(g.list.length)}${share}`, s: 'catHead' }, { v: '', s: 'catHead' }, { v: '', s: 'catHead' },
        ...(withSub ? [{ v: '', s: 'catHead' }] : []),
        multi ? { v: '', s: 'catHead' } : { v: toUnits(g.total), s: 'catHeadMoney' },
      ], { height: 20 });
      ws.merge(`A${h}:${last}${h}`);
      // Внутри категории записи идут по подкатегориям, затем по дате.
      const list = g.subs.length ? [...g.list].sort((a, b) => (a.sub ? a.sub.name : '').localeCompare(b.sub ? b.sub.name : '') || a.occurred_at - b.occurred_at) : g.list;
      for (const r of list) {
        ws.row([
          { v: excelDate(r.l.y, r.l.m, r.l.d), s: 'date' },
          { v: WEEKDAYS[r.l.dow], s: 'muted' },
          ...(withSub ? [{ v: r.sub ? r.sub.name : '', s: 'text' }] : []),
          { v: (r.note || '') + (multi ? ` (${r.currency})` : ''), s: 'text' },
          { v: toUnits(r.amount), s: kind === 'expense' ? 'moneyRed' : 'moneyGreen' },
        ]);
      }
      ws.row([]);
    }
  }
}

// ── По дням / по месяцам ──────────────────────────────────────────────────

function buildDaily(wb, ctx) {
  const { rows, main } = ctx;
  const ws = wb.addSheet('По дням', { widths: [12, 6, 16, 16, 16, 11], freeze: 1, tab: '70AD47' });
  ws.row(['Дата', 'День', `Потрачено${curLabel(ctx)}`, `Получено${curLabel(ctx)}`, `Итог дня${curLabel(ctx)}`, 'Операций'].map((v) => ({ v, s: 'head' })), { height: 22 });
  // Только дни, когда что-то было: пустые дни лишь растягивают таблицу.
  const map = new Map();
  for (const r of rows) {
    if (r.currency !== main) continue;
    const key = ymdKey(r.l);
    const e = map.get(key) || { l: r.l, expense: 0, income: 0, cnt: 0 };
    e[r.kind] += r.amount; e.cnt += 1;
    map.set(key, e);
  }
  const days = [...map.entries()].sort((a, b) => a[0] - b[0]).map((x) => x[1]);
  const first = ws.nextRow;
  for (const e of days) {
    const r = ws.nextRow;
    ws.row([
      { v: excelDate(e.l.y, e.l.m, e.l.d), s: 'date' },
      { v: WEEKDAYS[e.l.dow], s: 'muted' },
      { v: toUnits(e.expense), s: e.expense ? 'moneyRed' : 'money' },
      { v: toUnits(e.income), s: e.income ? 'moneyGreen' : 'money' },
      { v: toUnits(e.income - e.expense), s: 'moneySigned', f: `${ref(4, r)}-${ref(3, r)}` },
      { v: e.cnt, s: 'int' },
    ]);
  }
  totalsRow(ws, first, days, 3, ['Итого', '']);
}

function buildMonthly(wb, ctx) {
  const { rows, main } = ctx;
  const ws = wb.addSheet('По месяцам', { widths: [18, 16, 16, 16, 11], freeze: 1, tab: 'FFC000' });
  ws.row(['Месяц', `Потрачено${curLabel(ctx)}`, `Получено${curLabel(ctx)}`, `Остаток${curLabel(ctx)}`, 'Операций'].map((v) => ({ v, s: 'head' })), { height: 22 });
  const map = new Map();
  for (const r of rows) {
    if (r.currency !== main) continue;
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
      { v: monthTitle(e.y, e.m), s: 'text' },
      { v: toUnits(e.expense), s: 'moneyRed' },
      { v: toUnits(e.income), s: 'moneyGreen' },
      { v: toUnits(e.income - e.expense), s: 'moneySigned', f: `${ref(3, r)}-${ref(2, r)}` },
      { v: e.cnt, s: 'int' },
    ]);
  }
  totalsRow(ws, first, months, 2, ['Итого']);
}

// Итоговая строка: подписи, затем расходы/доходы/разница (SUM) и число операций.
function totalsRow(ws, first, list, fromCol, labels) {
  if (!list.length) return;
  const last = ws.nextRow - 1;
  const exp = list.reduce((s, e) => s + e.expense, 0), inc = list.reduce((s, e) => s + e.income, 0);
  const cnt = list.reduce((s, e) => s + e.cnt, 0);
  const cells = labels.map((v, i) => ({ v, s: i === 0 ? 'totalLabel' : 'totalText' }));
  const vals = [[toUnits(exp), 'totalMoney'], [toUnits(inc), 'totalMoney'], [toUnits(inc - exp), 'totalSigned']];
  vals.forEach(([v, s], i) => cells.push({ v, s, f: `SUM(${ref(fromCol + i, first)}:${ref(fromCol + i, last)})` }));
  cells.push({ v: cnt, s: 'totalInt', f: `SUM(${ref(fromCol + 3, first)}:${ref(fromCol + 3, last)})` });
  ws.row(cells);
}

// ── Категории × месяцы: сколько уходило на каждую категорию по месяцам ────

function buildCategoryMonths(wb, ctx) {
  const { rows, main } = ctx;
  const list = rows.filter((r) => r.kind === 'expense' && r.currency === main);
  if (!list.length) return;
  const monthKeys = [...new Set(list.map((r) => r.l.y * 100 + r.l.m))].sort((a, b) => a - b);
  const groups = groupByCategory(list);
  const ws = wb.addSheet('Категории по месяцам', { widths: [28, ...monthKeys.map(() => 14), 16], freeze: 1, tab: 'C0504D' });
  ws.row([
    { v: `Расходы${curLabel(ctx)}`, s: 'head' },
    ...monthKeys.map((k) => ({ v: monthTitle(Math.floor(k / 100), k % 100), s: 'head' })),
    { v: 'Итого', s: 'head' },
  ], { height: 22 });
  const totalCol = monthKeys.length + 2;
  const byMonth = (items) => {
    const m = new Map();
    for (const x of items) m.set(x.l.y * 100 + x.l.m, (m.get(x.l.y * 100 + x.l.m) || 0) + x.amount);
    return m;
  };
  // Итог месяца складывает только строки категорий; строки «↳» — разбивка по подкатегориям.
  const mainRows = [];
  for (const g of groups) {
    const r = ws.nextRow;
    mainRows.push(r);
    const bm = byMonth(g.list);
    ws.row([
      { v: catTitle(g.cat), s: g.subs.length ? 'textBold' : 'text' },
      ...monthKeys.map((k) => (bm.has(k) ? { v: toUnits(bm.get(k)), s: 'money' } : { v: '', s: 'money' })),
      { v: toUnits(g.total), s: 'moneyBold', f: `SUM(${ref(2, r)}:${ref(totalCol - 1, r)})` },
    ]);
    for (const p of g.subs) {
      const items = g.list.filter((x) => (x.sub ? x.sub.name : 'без уточнения') === p.name);
      const sm = byMonth(items);
      const rs = ws.nextRow;
      ws.row([
        { v: `      ↳ ${p.name}`, s: 'mutedLeft' },
        ...monthKeys.map((k) => (sm.has(k) ? { v: toUnits(sm.get(k)), s: 'money' } : { v: '', s: 'money' })),
        { v: toUnits(p.total), s: 'money', f: `SUM(${ref(2, rs)}:${ref(totalCol - 1, rs)})` },
      ]);
    }
  }
  const sumOf = (col) => mainRows.map((r) => ref(col, r)).join('+');
  ws.row([
    { v: 'Всего за месяц', s: 'totalLabel' },
    ...monthKeys.map((k, i) => ({ v: toUnits(sum(list.filter((x) => x.l.y * 100 + x.l.m === k))), s: 'totalMoney', f: sumOf(i + 2) })),
    { v: toUnits(sum(list)), s: 'totalMoney', f: sumOf(totalCol) },
  ]);
}
