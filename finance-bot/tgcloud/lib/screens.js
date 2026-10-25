// Экраны бота: каждый возвращает { text, extra } для send/show.

import {
  listCategories, getTransaction, lastTransactions, countTransactions, totalsByCategory,
  topExpenses, transactionsInRange, listBudgets, categoryMonthSpent, getSetting, listAllowed,
} from './store.js';
import {
  decodePeriod, periodBounds, shiftPeriod, currentPeriodCode, prevPeriodLabel, toLocal,
  humanDay, localToday, periodCode, cmpYmd, MONTHS,
} from './dates.js';
import { esc, money, signedMoney, percent, bar, catLabel, catPath, plural, tzLabel, truncate } from './format.js';
import { btn, appBtn, rows, inline } from './tg.js';
import { CURRENCIES, TIMEZONES, AI_PRESETS } from './config.js';
import { getAiConfig, aiReady } from './ai.js';
import { SUGGESTED_SUBS } from './categories.js';

const pad = (n) => String(n).padStart(2, '0');
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

export async function catsMap(userId) {
  const cats = await listCategories(userId, { includeArchived: true });
  return new Map(cats.map((c) => [c.id, c]));
}

/** Категории одного типа деревом: верхний уровень по порядку, у каждой — subs. */
export function catTree(cats, kind) {
  const ofKind = cats.filter((c) => c.kind === kind);
  return ofKind.filter((c) => !c.parent_id).map((c) => ({ ...c, subs: ofKind.filter((s) => s.parent_id === c.id) }));
}

/**
 * Суммы по категориям → по категориям верхнего уровня с разбивкой по подкатегориям.
 * rows: [{ category_id, total, cnt }]. Возвращает [{ id, cat, total, cnt, subs: [{ label, total }] }].
 */
export function rollUp(rows, cats) {
  const map = new Map();
  for (const r of rows) {
    const c = cats.get(r.category_id);
    const topId = c && c.parent_id && cats.get(c.parent_id) ? c.parent_id : r.category_id;
    const g = map.get(topId) || { id: topId, cat: cats.get(topId) || null, total: 0, cnt: 0, parts: new Map() };
    g.total += r.total;
    g.cnt += r.cnt;
    const key = topId === r.category_id ? 0 : r.category_id;
    g.parts.set(key, (g.parts.get(key) || 0) + r.total);
    map.set(topId, g);
  }
  return [...map.values()].sort((a, b) => b.total - a.total).map((g) => {
    const subs = [];
    if ([...g.parts.keys()].some((k) => k)) {
      for (const [k, total] of g.parts) subs.push({ label: k ? cats.get(k).name : 'без уточнения', total });
      subs.sort((a, b) => b.total - a.total);
    }
    return { id: g.id, cat: g.cat, total: g.total, cnt: g.cnt, subs };
  });
}

// ── Карточка операции ──────────────────────────────────────────────────────

export function txLine(t, cat, tz, { withDate = true } = {}) {
  const l = toLocal(t.occurred_at, tz);
  const date = withDate ? `${pad(l.d)}.${pad(l.m)} · ` : '';
  const note = t.note ? ' — ' + esc(truncate(t.note, 40)) : '';
  return `${date}<b>${signedMoney(t.kind, t.amount, t.currency)}</b> · ${esc(catLabel(cat))}${note}`;
}

export function txCardText(t, cat, tz, { header = '', transcript = '', footer = '' } = {}) {
  const l = toLocal(t.occurred_at, tz);
  const lines = [];
  if (header) lines.push(header, '');
  lines.push(`<b>${signedMoney(t.kind, t.amount, t.currency)}</b> · ${esc(catLabel(cat))}`);
  if (t.note) lines.push(`📝 ${esc(t.note)}`);
  lines.push(`📅 ${humanDay({ y: l.y, m: l.m, d: l.d }, tz)}, ${pad(l.hh)}:${pad(l.mi)}${t.source === 'voice' ? ' · 🎙' : ''}`);
  if (transcript) lines.push('', `🎙 <i>«${esc(truncate(transcript, 500))}»</i>`);
  if (footer) lines.push('', footer);
  return lines.join('\n');
}

export function txCardKeyboard(t, back = '') {
  const kb = [
    [btn('🏷 Категория', `t:c:${t.id}`), btn('📅 Дата', `t:d:${t.id}`)],
    [btn('✏️ Сумма / описание', `t:e:${t.id}`), btn('🗑 Удалить', `t:x:${t.id}`)],
  ];
  if (back) kb.push([btn('◀️ К списку', back)]);
  return inline(kb);
}

// Категории верхнего уровня; у кого есть подкатегории — «›» открывает их выбор.
export async function categoryPicker(userId, t) {
  const cats = await listCategories(userId);
  const cur = cats.find((c) => c.id === t.category_id);
  const curTop = cur ? cur.parent_id || cur.id : 0;
  const kb = rows(catTree(cats, t.kind).map((c) => (c.subs.length
    ? btn(`${c.id === curTop ? '✅ ' : ''}${c.emoji} ${c.name} ›`, `t:p:${t.id}:${c.id}`)
    : btn(`${c.id === curTop ? '✅ ' : ''}${c.emoji} ${c.name}`, `t:s:${t.id}:${c.id}`))), 2);
  kb.push([btn('➕ Новая категория', `t:n:${t.id}`)]);
  kb.push([
    btn(t.kind === 'expense' ? '💰 Это доход' : '💸 Это расход', `t:k:${t.id}`),
    btn('◀️ Назад', `t:o:${t.id}`),
  ]);
  return inline(kb);
}

export async function subPicker(userId, t, parentId) {
  const cats = await listCategories(userId);
  const parent = cats.find((c) => c.id === parentId);
  if (!parent) return categoryPicker(userId, t);
  const subs = cats.filter((c) => c.parent_id === parentId);
  const mark = (id) => (id === t.category_id ? '✅ ' : '');
  const kb = [[btn(`${mark(parent.id)}${parent.emoji} ${parent.name} — в целом`, `t:s:${t.id}:${parent.id}`)]];
  kb.push(...rows(subs.map((s) => btn(`${mark(s.id)}${s.emoji || parent.emoji} ${s.name}`, `t:s:${t.id}:${s.id}`)), 2));
  kb.push([btn('➕ Подкатегория', `t:ns:${t.id}:${parent.id}`), btn('◀️ Назад', `t:c:${t.id}`)]);
  return inline(kb);
}

export function datePicker(t) {
  return inline([
    [btn('Сегодня', `t:dv:${t.id}:0`), btn('Вчера', `t:dv:${t.id}:1`), btn('Позавчера', `t:dv:${t.id}:2`)],
    [btn('✍️ Другая дата', `t:dd:${t.id}`), btn('◀️ Назад', `t:o:${t.id}`)],
  ]);
}

export async function txCard(user, id, opts = {}) {
  const t = await getTransaction(user.tg_id, id);
  if (!t) return null;
  const cats = await catsMap(user.tg_id);
  return { t, text: txCardText(t, cats.get(t.category_id), user.tz_offset, opts), extra: txCardKeyboard(t, opts.back) };
}

// ── Последние операции ─────────────────────────────────────────────────────

const PAGE = 10;

export async function lastScreen(user, offset = 0) {
  const total = await countTransactions(user.tg_id);
  if (!total) {
    return { text: '🕘 Пока нет ни одной операции.\n\nНапишите, например, <code>кофе 250</code> или отправьте голосовое 🎙', extra: {} };
  }
  offset = Math.max(0, Math.min(offset, Math.floor((total - 1) / PAGE) * PAGE));
  const list = await lastTransactions(user.tg_id, PAGE, offset);
  const cats = await catsMap(user.tg_id);
  const lines = list.map((t, i) => `${i + 1}. ${txLine(t, cats.get(t.category_id), user.tz_offset)}`);
  const text = `🕘 <b>Последние операции</b> · ${offset + 1}–${offset + list.length} из ${total}\n\n${lines.join('\n')}\n\n<i>Нажмите номер, чтобы изменить или удалить.</i>`;
  const kb = rows(list.map((t, i) => btn(String(i + 1), `t:o:${t.id}:${offset}`)), 5);
  const nav = [];
  if (offset > 0) nav.push(btn('◀️ Новее', `l:${offset - PAGE}`));
  if (offset + PAGE < total) nav.push(btn('Старее ▶️', `l:${offset + PAGE}`));
  if (nav.length) kb.push(nav);
  return { text, extra: inline(kb) };
}

// ── Отчёт ──────────────────────────────────────────────────────────────────

function elapsedDays(period, tz) {
  if (!period.fromYmd) return 0;
  const today = localToday(tz);
  const to = cmpYmd(period.toYmd, today) > 0 ? today : period.toYmd;
  if (cmpYmd(to, period.fromYmd) < 0) return 0;
  return Math.round((Date.UTC(to.y, to.m - 1, to.d) - Date.UTC(period.fromYmd.y, period.fromYmd.m - 1, period.fromYmd.d)) / 86400000) + 1;
}

export async function reportScreen(user, code) {
  const period = decodePeriod(code) || decodePeriod(currentPeriodCode('month', user.tz_offset));
  code = period.code;
  const tz = user.tz_offset;
  const { from, to } = periodBounds(period, tz);
  const rowsDb = await totalsByCategory(user.tg_id, from, to);
  const cats = await catsMap(user.tg_id);
  const cur = user.currency;

  const main = rowsDb.filter((r) => r.currency === cur);
  const exp = main.filter((r) => r.kind === 'expense');
  const inc = main.filter((r) => r.kind === 'income');
  const expTotal = exp.reduce((s, r) => s + r.total, 0);
  const incTotal = inc.reduce((s, r) => s + r.total, 0);
  const count = rowsDb.reduce((s, r) => s + r.cnt, 0);

  const lines = [`📊 <b>${esc(period.title)}</b>`, ''];
  if (!count) {
    lines.push('За этот период операций нет.');
  } else {
    lines.push(`💸 Расходы: <b>${money(expTotal, cur)}</b>`);
    lines.push(`💰 Доходы: <b>${money(incTotal, cur)}</b>`);
    lines.push(`⚖️ Баланс: <b>${incTotal - expTotal >= 0 ? '+' : ''}${money(incTotal - expTotal, cur)}</b>`);
    const days = elapsedDays(period, tz);
    if (days > 1 && expTotal) lines.push(`📆 В среднем ${money(Math.round(expTotal / days / 100) * 100, cur)} в день`);

    const prevCode = shiftPeriod(code, -1);
    if (prevCode && expTotal) {
      const pp = decodePeriod(prevCode);
      const b = periodBounds(pp, tz);
      const prev = (await totalsByCategory(user.tg_id, b.from, b.to))
        .filter((r) => r.currency === cur && r.kind === 'expense').reduce((s, r) => s + r.total, 0);
      if (prev) {
        const diff = Math.round(((expTotal - prev) / prev) * 100);
        lines.push(`${diff > 0 ? '📈' : '📉'} По сравнению с ${prevPeriodLabel(code)}: ${diff > 0 ? '+' : ''}${diff}% (было ${money(prev, cur)})`);
      }
    }

    if (exp.length) {
      lines.push('', '<b>Расходы по категориям</b>');
      const groups = rollUp(exp, cats);
      for (const g of groups.slice(0, 15)) {
        lines.push(`${esc(catLabel(g.cat))} — <b>${money(g.total, cur)}</b> · ${percent(g.total, expTotal)}`);
        lines.push(`<code>${bar(g.total, expTotal)}</code>`);
        for (const s of g.subs) lines.push(`    ↳ ${esc(s.label)} — ${money(s.total, cur)}`);
      }
      if (groups.length > 15) lines.push(`…и ещё ${groups.length - 15}`);
    }
    if (inc.length) {
      lines.push('', '<b>Доходы</b>');
      for (const g of rollUp(inc, cats)) {
        lines.push(`${esc(catLabel(g.cat))} — <b>${money(g.total, cur)}</b>`);
        for (const s of g.subs) lines.push(`    ↳ ${esc(s.label)} — ${money(s.total, cur)}`);
      }
    }
    const top = await topExpenses(user.tg_id, from, to, cur, 3);
    if (top.length > 1) {
      lines.push('', '<b>Самые крупные траты</b>');
      for (const t of top) lines.push('• ' + txLine(t, cats.get(t.category_id), tz));
    }
    const others = new Map();
    for (const r of rowsDb.filter((x) => x.currency !== cur)) {
      const o = others.get(r.currency) || { expense: 0, income: 0 };
      o[r.kind] += r.total;
      others.set(r.currency, o);
    }
    for (const [c, o] of others) {
      lines.push('', `💱 В ${c}: расходы ${money(o.expense, c)}, доходы ${money(o.income, c)}`);
    }
  }

  const kb = [];
  const prev = shiftPeriod(code, -1), next = shiftPeriod(code, 1);
  if (prev) kb.push([btn('◀️', `r:${prev}`), btn(period.title, `r:${code}`), btn('▶️', `r:${next}`)]);
  kb.push([
    btn('День', `r:${currentPeriodCode('day', tz)}`),
    btn('Неделя', `r:${currentPeriodCode('week', tz)}`),
    btn('Месяц', `r:${currentPeriodCode('month', tz)}`),
    btn('Год', `r:${currentPeriodCode('year', tz)}`),
    btn('Всё', 'r:a'),
  ]);
  kb.push([btn('📅 Свой период', 'r:custom'), btn('📥 Excel за период', `x:p:${code}`)]);
  return { text: lines.join('\n'), extra: inline(kb) };
}

// ── Excel: выбор периода и содержимого ────────────────────────────────────

export function excelPeriodScreen(user) {
  const tz = user.tz_offset;
  const t = localToday(tz);
  const prevM = t.m === 1 ? { y: t.y - 1, m: 12 } : { y: t.y, m: t.m - 1 };
  const kb = [
    [btn(`${cap(MONTHS[t.m - 1])}`, `x:p:${periodCode.month(t.y, t.m)}`), btn(`${cap(MONTHS[prevM.m - 1])}`, `x:p:${periodCode.month(prevM.y, prevM.m)}`)],
    [btn('Эта неделя', `x:p:${currentPeriodCode('week', tz)}`), btn('Сегодня', `x:p:${currentPeriodCode('day', tz)}`)],
    [btn(`${t.y} год`, `x:p:${periodCode.year(t.y)}`), btn('Всё время', 'x:p:a')],
    [btn('📅 Свой период', 'x:custom')],
  ];
  return {
    text: '📥 <b>Выгрузка в Excel</b>\n\nЗа какой период собрать таблицу?\n\n<i>Можно написать и текстом: «сентябрь», «2025», «01.09-15.09».</i>',
    extra: inline(kb),
  };
}

export async function excelContentScreen(user, code) {
  const period = decodePeriod(code);
  if (!period) return excelPeriodScreen(user);
  const { from, to } = periodBounds(period, user.tz_offset);
  const txs = await transactionsInRange(user.tg_id, from, to);
  const catCount = new Set(txs.map((t) => `${t.kind}:${t.category_id}`)).size;
  const text = txs.length
    ? `📥 <b>${esc(period.title)}</b> · ${txs.length} ${plural(txs.length, 'операция', 'операции', 'операций')}\n\nЧто положить в таблицу?\n\n` +
      `📑 <b>Полный отчёт</b> — сводка, все операции, траты по категориям (${catCount}), по дням и месяцам.\n` +
      '📄 <b>Кратко</b> — сводка и список операций.\n' +
      '🗂 <b>Одна категория</b> — только выбранная категория.'
    : `📥 <b>${esc(period.title)}</b>\n\nЗа этот период операций нет. Выберите другой период.`;
  const kb = [];
  if (txs.length) {
    kb.push([btn('📑 Полный отчёт', `x:g:${code}:t`)]);
    kb.push([btn('📄 Кратко', `x:g:${code}:l`), btn('🗂 Одна категория', `x:c:${code}`)]);
  }
  kb.push([btn('◀️ Другой период', 'x:m')]);
  return { text, extra: inline(kb) };
}

export async function excelCategoryScreen(user, code) {
  const period = decodePeriod(code);
  if (!period) return excelPeriodScreen(user);
  const { from, to } = periodBounds(period, user.tz_offset);
  const totals = await totalsByCategory(user.tg_id, from, to);
  const cats = await catsMap(user.tg_id);
  // Подкатегории выгружаются вместе со своей категорией.
  const list = [];
  for (const kind of ['expense', 'income']) {
    const ofKind = totals.filter((r) => r.kind === kind).map((r) => ({ ...r, total: r.currency === user.currency ? r.total : 0 }));
    list.push(...rollUp(ofKind, cats));
  }
  const kb = list.map((a) => [btn(`${catLabel(a.cat)} · ${a.total ? money(a.total, user.currency) : a.cnt + ' оп.'}`, `x:g:${code}:${a.id}`)]);
  kb.push([btn('◀️ Назад', `x:p:${code}`)]);
  return { text: `🗂 <b>${esc(period.title)}</b>\n\nВыберите категорию для выгрузки:`, extra: inline(kb) };
}

// ── Категории ──────────────────────────────────────────────────────────────

export async function categoriesScreen(user, kind = 'expense') {
  const all = (await listCategories(user.tg_id, { includeArchived: true })).filter((c) => c.kind === kind);
  const archived = all.filter((c) => c.archived).length;
  const tree = catTree(all.filter((c) => !c.archived), kind);
  const lines = [`📂 <b>${kind === 'expense' ? 'Категории расходов' : 'Категории доходов'}</b>`, ''];
  for (const c of tree) {
    const kws = String(c.keywords || '').split(',').filter(Boolean);
    lines.push(`${c.emoji || '•'} ${esc(c.name)}${kws.length ? ` <i>· ${esc(kws.slice(0, 6).join(', '))}${kws.length > 6 ? '…' : ''}</i>` : ''}`);
    if (c.subs.length) lines.push(`      ↳ ${c.subs.map((x) => esc(x.name)).join(' · ')}`);
  }
  lines.push('', '<i>Категорию и подкатегорию я угадываю сам. Если ошибся — нажмите «🏷 Категория» под записью, и я запомню слово на будущее.</i>');
  const kb = [
    [btn('➕ Категория', `c:a:${kind}`), btn('➕ Подкатегория', `c:sp:${kind}`)],
    [btn('✏️ Изменить', `c:e:${kind}`), btn('🗑 Удалить', `c:d:${kind}`)],
    ...(archived ? [[btn(`♻️ Вернуть удалённые (${archived})`, `c:r:${kind}`)]] : []),
    [btn(kind === 'expense' ? '💰 Категории доходов' : '💸 Категории расходов', `c:l:${kind === 'expense' ? 'income' : 'expense'}`)],
    [appBtn('📱 Настроить в приложении', 'categories')],
  ];
  return { text: lines.join('\n'), extra: inline(kb) };
}

// Кнопки по дереву: категория, следом её подкатегории («↳ Аптека»).
function treeButtons(tree, prefix, data, { skip = () => false } = {}) {
  const out = [];
  for (const c of tree) {
    if (!skip(c)) out.push(btn(`${prefix}${c.emoji} ${c.name}`, data(c)));
    for (const s of c.subs) out.push(btn(`${prefix}↳ ${s.name}`, data(s)));
  }
  return rows(out, 2);
}

export async function categoryParentScreen(user, kind) {
  const tree = catTree(await listCategories(user.tg_id), kind);
  const kb = rows(tree.map((c) => btn(`${c.emoji} ${c.name}${c.subs.length ? ` (${c.subs.length})` : ''}`, `c:as:${c.id}`)), 2);
  kb.push([btn('◀️ Назад', `c:l:${kind}`)]);
  return { text: '➕ <b>В какую категорию добавить подкатегории?</b>\n\nНапример: «💊 Здоровье» → Аптека, Врачи, Стоматолог.', extra: inline(kb) };
}

/** Подсказки подкатегорий для категории: стандартные минус уже созданные. */
export function suggestedSubs(parent, existing) {
  const have = new Set(existing.map((c) => c.name.toLowerCase()));
  return (SUGGESTED_SUBS[parent.code] || []).filter((n) => !have.has(n.toLowerCase()));
}

export async function categoryEditScreen(user, kind) {
  const tree = catTree(await listCategories(user.tg_id), kind);
  const kb = treeButtons(tree, '✏️ ', (c) => `c:ed:${c.id}`);
  kb.push([btn('◀️ Назад', `c:l:${kind}`)]);
  return { text: '✏️ <b>Что изменить?</b>\n\nМожно поменять название и эмодзи категории или подкатегории.', extra: inline(kb) };
}

export async function categoryRestoreScreen(user, kind) {
  const cats = (await listCategories(user.tg_id, { includeArchived: true })).filter((c) => c.kind === kind && c.archived);
  const kb = rows(cats.map((c) => btn(`♻️ ${catLabel(c)}`, `c:rs:${c.id}`)), 2);
  kb.push([btn('◀️ Назад', `c:l:${kind}`)]);
  return {
    text: cats.length ? '♻️ <b>Что вернуть?</b>\n\nКатегория возвращается вместе с подкатегориями.' : '♻️ Удалённых категорий нет.',
    extra: inline(kb),
  };
}

export async function categoryDeleteScreen(user, kind) {
  const tree = catTree(await listCategories(user.tg_id), kind);
  const kb = treeButtons(tree, '🗑 ', (c) => `c:rm:${c.id}`, { skip: (c) => c.code === 'other' || c.code === 'other_in' });
  kb.push([btn('◀️ Назад', `c:l:${kind}`)]);
  return {
    text: '🗑 <b>Что удалить?</b>\n\nВместе с категорией удаляются её подкатегории. Старые записи останутся в отчётах под прежним названием.',
    extra: inline(kb),
  };
}

// ── Бюджет ─────────────────────────────────────────────────────────────────

export async function budgetStatus(user, cat) {
  // Состояние бюджетов, которых касается трата в cat (общий, категории и её родителя), в текущем месяце.
  const ids = cat ? [cat.id, cat.parent_id].filter(Boolean) : [];
  const budgets = await listBudgets(user.tg_id);
  if (!budgets.length) return [];
  const t = localToday(user.tz_offset);
  const { from, to } = periodBounds(decodePeriod(periodCode.month(t.y, t.m)), user.tz_offset);
  const out = [];
  for (const b of budgets) {
    if (b.category_id !== 0 && !ids.includes(b.category_id)) continue;
    const spent = await categoryMonthSpent(user.tg_id, b.category_id, user.currency, from, to);
    out.push({ ...b, spent });
  }
  return out;
}

export async function budgetScreen(user) {
  const budgets = await listBudgets(user.tg_id);
  const tz = user.tz_offset;
  const t = localToday(tz);
  const period = decodePeriod(periodCode.month(t.y, t.m));
  const { from, to } = periodBounds(period, tz);
  const cur = user.currency;
  const daysLeft = period.toYmd.d - t.d + 1;
  const lines = [`🎯 <b>Бюджет · ${esc(period.title)}</b>`, ''];
  if (!budgets.length) {
    lines.push('Бюджет пока не задан.', '', 'Задайте лимит на месяц — общий или на категорию — и я предупрежу, когда траты подойдут к пределу.');
  } else {
    const cats = await catsMap(user.tg_id);
    for (const b of budgets) {
      const spent = await categoryMonthSpent(user.tg_id, b.category_id, cur, from, to);
      const c = b.category_id ? cats.get(b.category_id) : null;
      const name = b.category_id ? esc(c ? catLabel(c) : 'Категория') : '💼 <b>Общий</b>';
      const left = b.amount - spent;
      const icon = spent > b.amount ? '🔴' : spent >= b.amount * 0.8 ? '🟡' : '🟢';
      lines.push(`${icon} ${name}: ${money(spent, cur)} из ${money(b.amount, cur)} (${percent(spent, b.amount)})`);
      lines.push(`<code>${bar(spent, b.amount)}</code> ${left >= 0 ? `осталось ${money(left, cur)}${daysLeft > 1 ? ` · ~${money(Math.floor(left / daysLeft / 100) * 100, cur)}/день` : ''}` : `перерасход ${money(-left, cur)}`}`);
    }
  }
  return { text: lines.join('\n'), extra: inline([[btn('✏️ Задать бюджет', 'b:e')]]) };
}

// ── Настройки ──────────────────────────────────────────────────────────────

export async function settingsScreen(user, isOwner) {
  const cfg = await getAiConfig();
  const cur = CURRENCIES[user.currency];
  const lines = [
    '⚙️ <b>Настройки</b>', '',
    `💱 Основная валюта: <b>${user.currency}</b> ${cur ? '(' + cur.symbol + ')' : ''}`,
    `🕒 Часовой пояс: <b>${tzLabel(user.tz_offset)}</b>`,
    `🎙 Голосовые: ${aiReady(cfg) ? `<b>включены</b> (${esc(cfg.title)})` : '<b>не подключены</b>'}`,
  ];
  const clean = (await getSetting(`clean:${user.tg_id}`)) !== 'off';
  lines.push(`🧽 Чистить чат: <b>${clean ? 'да' : 'нет'}</b> — ${clean ? 'меню, подсказки и ваши команды удаляются, остаются карточки записей и файлы' : 'все сообщения остаются'}`);
  const kb = [
    [btn('💱 Валюта', 's:cur'), btn('🕒 Часовой пояс', 's:tz')],
    [btn(clean ? '🧽 Не чистить чат' : '🧽 Чистить чат', 's:clean')],
  ];
  if (isOwner) {
    kb.push([btn('🎙 Голос и ИИ', 's:ai'), btn('👥 Доступ', 's:acc')]);
  }
  kb.push([appBtn('📱 Открыть приложение')]);
  kb.push([btn('🧹 Удалить все мои данные', 's:wipe')]);
  return { text: lines.join('\n'), extra: inline(kb) };
}

export function currencyScreen(user) {
  const kb = rows(Object.entries(CURRENCIES).map(([code, c]) => btn(`${code === user.currency ? '✅ ' : ''}${c.symbol} ${code}`, `s:cur:${code}`)), 3);
  kb.push([btn('◀️ Назад', 's:home')]);
  return { text: '💱 <b>Основная валюта</b>\n\nВ ней считаются суммы без явной валюты. Другую валюту можно указать прямо в записи: <code>$20 подписка</code>, <code>15 евро обед</code>.', extra: inline(kb) };
}

export function tzScreen(user) {
  const kb = rows(TIMEZONES.map(([min, label]) => btn(`${min === user.tz_offset ? '✅ ' : ''}${label}`, `s:tz:${min}`)), 1);
  kb.push([btn('◀️ Назад', 's:home')]);
  return { text: '🕒 <b>Часовой пояс</b>\n\nНужен, чтобы «сегодня» и «вчера» совпадали с вашими. Другой пояс: <code>/tz +5:30</code>', extra: inline(kb) };
}

export async function aiScreen() {
  const cfg = await getAiConfig();
  const lines = ['🎙 <b>Голосовые и умный разбор</b>', ''];
  if (aiReady(cfg)) {
    lines.push(`Провайдер: <b>${esc(cfg.title)}</b>`, `Ключ: <code>${esc(cfg.key.slice(0, 4))}…${esc(cfg.key.slice(-4))}</code>`);
    lines.push(`Распознавание речи: <code>${esc(cfg.sttModel)}</code>`, `Разбор фраз: <code>${esc(cfg.llmModel)}</code> — ${cfg.llmEnabled ? 'включён' : 'выключен'}`);
  } else {
    lines.push('Сейчас голосовые не распознаются. Подключите бесплатный ключ Groq:');
    lines.push('1. Зайдите на console.groq.com → API Keys → Create API Key');
    lines.push('2. Отправьте боту: <code>/setkey gsk_ваш_ключ</code>');
    lines.push('Сообщение с ключом я сразу удалю из чата.');
  }
  lines.push('', '<b>Команды</b>');
  lines.push('<code>/setkey КЛЮЧ</code> — ключ Groq (gsk_…) или OpenAI (sk-…)');
  lines.push('<code>/setkey url https://… КЛЮЧ</code> — любой OpenAI-совместимый сервис');
  lines.push('<code>/setmodel stt МОДЕЛЬ</code>, <code>/setmodel llm МОДЕЛЬ</code>, <code>/setmodel reset</code>');
  lines.push('<code>/ai off</code> / <code>/ai on</code> — умный разбор текста (голос работает в любом случае)');
  lines.push(`<i>Провайдеры: ${Object.values(AI_PRESETS).map((p) => p.title + ' — ' + p.keyHint).join('; ')}.</i>`);
  return { text: lines.join('\n'), extra: inline([[btn(cfg.llmEnabled ? '🧠 Выключить умный разбор' : '🧠 Включить умный разбор', 's:llm')], [btn('◀️ Назад', 's:home')]]) };
}

export async function accessScreen() {
  const access = (await getSetting('access')) || 'private';
  const allowed = await listAllowed();
  const lines = ['👥 <b>Доступ к боту</b>', ''];
  lines.push(access === 'public'
    ? 'Режим: <b>открытый</b> — любой может вести у бота свой учёт (данные у каждого свои).'
    : 'Режим: <b>приватный</b> — только вы и те, кого вы добавили.');
  if (allowed.length) {
    lines.push('', 'Допущены:');
    for (const a of allowed) lines.push(`• <code>${esc(a.id)}</code> ${esc(a.label || '')}`);
  }
  lines.push('', 'Добавить: <code>/allow ID</code> · убрать: <code>/deny ID</code>', 'Свой ID человек узнает командой /id.');
  return {
    text: lines.join('\n'),
    extra: inline([[btn(access === 'public' ? '🔒 Сделать приватным' : '🌍 Открыть для всех', 's:pub')], [btn('◀️ Назад', 's:home')]]),
  };
}
