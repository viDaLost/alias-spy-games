// Серверная часть мини-приложения: одна точка входа endpoints/app, операция в input.op.
// Доступ тот же, что у бота: владелец, допущенные по /allow или все (если бот открыт).
// Суммы ходят в минимальных единицах (копейках), даты — строками YYYY-MM-DD.

import { api, EndpointError } from 'sdk';
import {
  getSetting, isAllowed, ensureUser, setUserCurrency, setUserTz, listCategories, getCategory,
  addCategory, updateCategory, archiveCategory, restoreCategory, setCategorySort, setCategoryParent,
  addTransaction, getTransaction, updateTransaction, deleteTransaction, transactionsInRange,
  listBudgets, setBudget, categoryMonthSpent,
} from './store.js';
import {
  localToday, toLocal, isoYmd, isValidYmd, cmpYmd, addDays, decodePeriod, periodBounds,
  shiftPeriod, currentPeriodCode, periodCode, MONTHS,
} from './dates.js';
import { norm, stemWord, fallbackCategory, SUGGESTED_SUBS } from './categories.js';
import { CURRENCIES, TIMEZONES } from './config.js';
import { getAiConfig, aiReady } from './ai.js';
import { resolveItems, occurredAtFor, keepTime, budgetWarnings, learn, excelDocument } from './bot.js';

const pad = (n) => String(n).padStart(2, '0');
const fail = (text, code) => { throw new EndpointError(text, { code }); };
const MAX_AMOUNT = 1e12;

export async function handleApp(input, ctx) {
  const from = ctx && ctx.initData && ctx.initData.user;
  if (!from || !from.id) fail('Откройте приложение из Telegram.', 'NO_USER');
  const op = OPS[String((input && input.op) || '')];
  if (!op) fail('Неизвестная операция.', 'BAD_OP');
  const c = await appContext(from);
  return op(c, input || {});
}

async function appContext(from) {
  const owner = await getSetting('owner_id');
  // Владельцем становится первый, кто написал боту в чате, — не тот, кто открыл приложение.
  if (!owner) fail('Сначала напишите боту /start в чате.', 'NO_OWNER');
  const isOwner = owner === String(from.id);
  if (!isOwner && (await getSetting('access')) !== 'public' && !(await isAllowed(from.id))) {
    fail(`Это личный бот. Отправьте владельцу ваш ID ${from.id}, чтобы он открыл доступ.`, 'FORBIDDEN');
  }
  const { user } = await ensureUser(from);
  return { user, isOwner, chatId: from.id, from };
}

// ── Представление данных для приложения ───────────────────────────────────

function txOut(t, tz) {
  const l = toLocal(t.occurred_at, tz);
  return {
    id: t.id, kind: t.kind, amount: t.amount, currency: t.currency, categoryId: t.category_id,
    note: t.note || '', date: isoYmd(l), time: `${pad(l.hh)}:${pad(l.mi)}`, source: t.source || 'text',
  };
}

const splitKeywords = (s) => String(s || '').split(',').map((x) => x.trim()).filter(Boolean);

async function categoriesOut(uid) {
  const cats = await listCategories(uid, { includeArchived: true });
  return cats.map((c) => ({
    id: c.id, kind: c.kind, code: c.code || '', name: c.name, emoji: c.emoji || '',
    keywords: splitKeywords(c.keywords), archived: Boolean(c.archived), sort: c.sort,
    parentId: c.parent_id || 0, fallback: c.code === 'other' || c.code === 'other_in',
  }));
}

async function budgetsOut(user) {
  const t = localToday(user.tz_offset);
  const { from, to } = periodBounds(decodePeriod(periodCode.month(t.y, t.m)), user.tz_offset);
  const out = [];
  for (const b of await listBudgets(user.tg_id)) {
    out.push({ categoryId: b.category_id, amount: b.amount, spent: await categoryMonthSpent(user.tg_id, b.category_id, user.currency, from, to) });
  }
  return out;
}

function meOut(c) {
  return {
    id: c.user.tg_id, firstName: c.user.first_name || '', currency: c.user.currency,
    tz: c.user.tz_offset, isOwner: c.isOwner,
  };
}

function parseYmd(s) {
  const m = String(s || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const ymd = m && { y: +m[1], m: +m[2], d: +m[3] };
  return ymd && isValidYmd(ymd) ? ymd : null;
}

function periodOf(c, code) {
  return decodePeriod(String(code || '')) || decodePeriod(currentPeriodCode('month', c.user.tz_offset));
}

function periodOut(p) {
  return { code: p.code, kind: p.kind, title: p.title, prev: shiftPeriod(p.code, -1), next: shiftPeriod(p.code, 1) };
}

// ── Операции ──────────────────────────────────────────────────────────────

const OPS = {
  async init(c) {
    const tz = c.user.tz_offset;
    return {
      me: meOut(c),
      categories: await categoriesOut(c.user.tg_id),
      budgets: await budgetsOut(c.user),
      currencies: Object.entries(CURRENCIES).map(([code, x]) => ({ code, symbol: x.symbol, title: x.title })),
      timezones: TIMEZONES.map(([min, label]) => ({ min, label })),
      today: isoYmd(localToday(tz)),
      periods: Object.fromEntries(['day', 'week', 'month', 'year', 'all'].map((k) => [k, currentPeriodCode(k, tz)])),
      voice: aiReady(await getAiConfig()),
      suggestions: SUGGESTED_SUBS,
    };
  },

  async summary(c, input) {
    const tz = c.user.tz_offset, cur = c.user.currency, uid = c.user.tg_id;
    const period = periodOf(c, input.period);
    const { from, to } = periodBounds(period, tz);
    const txs = await transactionsInRange(uid, from, to);
    const main = txs.filter((t) => t.currency === cur);

    const byCat = new Map();
    let expense = 0, income = 0;
    for (const t of main) {
      if (t.kind === 'expense') expense += t.amount; else income += t.amount;
      const key = `${t.kind}:${t.category_id}`;
      const e = byCat.get(key) || { kind: t.kind, categoryId: t.category_id, total: 0, count: 0 };
      e.total += t.amount; e.count += 1;
      byCat.set(key, e);
    }

    const others = new Map();
    for (const t of txs.filter((x) => x.currency !== cur)) {
      const o = others.get(t.currency) || { currency: t.currency, expense: 0, income: 0 };
      o[t.kind] += t.amount;
      others.set(t.currency, o);
    }

    let prevExpense = null;
    const prevCode = shiftPeriod(period.code, -1);
    if (prevCode) {
      const b = periodBounds(decodePeriod(prevCode), tz);
      prevExpense = (await transactionsInRange(uid, b.from, b.to))
        .filter((t) => t.currency === cur && t.kind === 'expense').reduce((s, t) => s + t.amount, 0);
    }

    const days = elapsedDays(period, main, tz);
    return {
      period: periodOut(period),
      currency: cur,
      expense, income, count: txs.length,
      avgPerDay: days > 1 && expense ? Math.round(expense / days) : null,
      prevExpense,
      byCategory: [...byCat.values()].sort((a, b) => b.total - a.total),
      series: series(period, main, tz),
      others: [...others.values()],
      top: [...main].filter((t) => t.kind === 'expense').sort((a, b) => b.amount - a.amount).slice(0, 5).map((t) => txOut(t, tz)),
      budgets: await budgetsOut(c.user),
    };
  },

  async list(c, input) {
    const tz = c.user.tz_offset;
    const period = periodOf(c, input.period);
    const { from, to } = periodBounds(period, tz);
    let txs = await transactionsInRange(c.user.tg_id, from, to);
    if (input.categoryId) {
      // Категория — вместе с её подкатегориями.
      const id = +input.categoryId;
      const ids = new Set([id, ...(await listCategories(c.user.tg_id, { includeArchived: true })).filter((x) => x.parent_id === id).map((x) => x.id)]);
      txs = txs.filter((t) => ids.has(t.category_id));
    }
    if (input.kind === 'expense' || input.kind === 'income') txs = txs.filter((t) => t.kind === input.kind);
    const q = norm(String(input.q || '').trim());
    if (q) {
      const cats = new Map((await listCategories(c.user.tg_id, { includeArchived: true })).map((x) => [x.id, norm(x.name)]));
      txs = txs.filter((t) => norm(t.note).includes(q) || (cats.get(t.category_id) || '').includes(q) || String(t.amount / 100).includes(q));
    }
    txs.sort((a, b) => b.occurred_at - a.occurred_at || b.id - a.id);
    const totals = { expense: 0, income: 0 };
    for (const t of txs) if (t.currency === c.user.currency) totals[t.kind] += t.amount;
    const offset = Math.max(0, +input.offset || 0);
    const limit = Math.min(200, Math.max(1, +input.limit || 50));
    return {
      period: periodOut(period),
      total: txs.length,
      totals,
      items: txs.slice(offset, offset + limit).map((t) => txOut(t, tz)),
    };
  },

  async saveTx(c, input) {
    const uid = c.user.tg_id, tz = c.user.tz_offset;
    const kind = input.kind === 'income' ? 'income' : 'expense';
    const amount = Math.round(Number(input.amount));
    if (!(amount > 0) || amount >= MAX_AMOUNT) fail('Укажите сумму больше нуля.', 'BAD_AMOUNT');
    const currency = CURRENCIES[input.currency] ? input.currency : c.user.currency;
    const ymd = parseYmd(input.date) || localToday(tz);
    const note = String(input.note || '').trim().slice(0, 200);
    const cats = await listCategories(uid);
    let cat = cats.find((x) => x.id === +input.categoryId && x.kind === kind);
    if (!cat) cat = fallbackCategory(cats, kind);

    const old = input.id ? await getTransaction(uid, +input.id) : null;
    if (input.id && !old) fail('Эта запись уже удалена.', 'NOT_FOUND');
    let id;
    if (old) {
      const sameDay = isoYmd(toLocal(old.occurred_at, tz)) === isoYmd(ymd);
      await updateTransaction(uid, old.id, {
        kind, amount, currency, categoryId: cat ? cat.id : 0, note,
        occurredAt: sameDay ? old.occurred_at : keepTime(old.occurred_at, ymd, tz),
      });
      id = old.id;
    } else {
      id = await addTransaction(uid, {
        kind, amount, currency, categoryId: cat ? cat.id : 0, note,
        occurredAt: occurredAtFor(ymd, tz), source: 'app', raw: note,
      });
    }
    // Как в чате: выбранная вручную категория запоминает слово из описания.
    if (cat && note && !(cat.code === 'other' || cat.code === 'other_in')) await learn(uid, note, cat);
    const warnings = await budgetWarnings(c, [{ kind, currency, ymd, cat }]);
    return { tx: txOut(await getTransaction(uid, id), tz), warnings, categories: await categoriesOut(uid) };
  },

  async quickAdd(c, input) {
    const uid = c.user.tg_id, tz = c.user.tz_offset;
    const text = String(input.text || '').trim().slice(0, 500);
    if (!text) fail('Напишите, что потратили: «кофе 250».', 'EMPTY');
    const items = await resolveItems(c, text, 'text');
    if (!items.length) fail('Не нашёл сумму. Например: «такси 450» или «+50000 зарплата».', 'NO_AMOUNT');
    const saved = [];
    for (const it of items.slice(0, 20)) {
      const id = await addTransaction(uid, {
        kind: it.kind, amount: it.amount, currency: it.currency, categoryId: it.cat ? it.cat.id : 0,
        note: it.note, occurredAt: occurredAtFor(it.ymd, tz), source: 'app', raw: text,
      });
      saved.push({ ...it, id });
    }
    const warnings = await budgetWarnings(c, saved);
    const out = [];
    for (const s of saved) out.push({ ...txOut(await getTransaction(uid, s.id), tz), uncertain: Boolean(s.uncertain) });
    return { items: out, warnings };
  },

  async deleteTx(c, input) {
    const ok = await deleteTransaction(c.user.tg_id, +input.id);
    if (!ok) fail('Эта запись уже удалена.', 'NOT_FOUND');
    return { deleted: true };
  },

  async saveCategory(c, input) {
    const uid = c.user.tg_id;
    const name = String(input.name || '').replace(/\s+/g, ' ').trim();
    if (!name) fail('Напишите название категории.', 'NO_NAME');
    if (name.length > 40) fail('Название слишком длинное — до 40 символов.', 'LONG_NAME');
    const emoji = [...String(input.emoji || '').trim()].slice(0, 8).join('');
    const keywords = cleanKeywords(input.keywords);

    const all = await listCategories(uid, { includeArchived: true });
    const old = input.id ? all.find((x) => x.id === +input.id) : null;
    if (input.id && !old) fail('Категория не найдена.', 'NOT_FOUND');
    const kind = old ? old.kind : input.kind === 'income' ? 'income' : 'expense';
    // Подкатегория: родитель — категория верхнего уровня того же типа; у подкатегории своих подкатегорий нет.
    let parentId = input.parentId === undefined ? (old ? old.parent_id || 0 : 0) : +input.parentId || 0;
    if (parentId) {
      const parent = all.find((x) => x.id === parentId);
      if (!parent || parent.archived || parent.kind !== kind || parent.parent_id || parent.id === (old && old.id)) fail('Такую категорию нельзя выбрать родительской.', 'BAD_PARENT');
      if (old && all.some((x) => x.parent_id === old.id && !x.archived)) fail('У этой категории есть свои подкатегории — её нельзя вложить в другую.', 'HAS_SUBS');
    }
    if (old && (old.code === 'other' || old.code === 'other_in')) parentId = 0; // «Прочее» всегда верхнего уровня
    if (all.some((x) => x.kind === kind && x.id !== (old && old.id) && !x.archived && (x.parent_id || 0) === parentId && norm(x.name) === norm(name))) {
      fail(parentId ? 'Такая подкатегория уже есть.' : 'Такая категория уже есть.', 'DUPLICATE');
    }
    let id = old && old.id;
    if (!old) id = await addCategory(uid, { kind, name, emoji: emoji || (parentId ? '' : kind === 'income' ? '💵' : '🏷'), parentId });
    else if ((old.parent_id || 0) !== parentId) await setCategoryParent(uid, id, parentId);
    const fresh = await getCategory(uid, id);
    // Подкатегория без своего эмодзи показывается с эмодзи родителя.
    await updateCategory(uid, id, { name, emoji: emoji || (parentId ? '' : fresh.emoji), keywords: keywords.join(',') });
    return { id, categories: await categoriesOut(uid) };
  },

  // Несколько подкатегорий сразу: { parentId, names: ['Аптека', 'Врачи'] }.
  async addSubs(c, input) {
    const uid = c.user.tg_id;
    const parent = await getCategory(uid, +input.parentId);
    if (!parent || parent.parent_id) fail('Категория не найдена.', 'NOT_FOUND');
    const have = new Set((await listCategories(uid)).filter((x) => x.parent_id === parent.id).map((x) => norm(x.name)));
    const added = [];
    for (const raw of (Array.isArray(input.names) ? input.names : []).slice(0, 30)) {
      const name = String(raw || '').replace(/\s+/g, ' ').trim().slice(0, 40);
      if (!name || have.has(norm(name))) continue;
      have.add(norm(name));
      added.push(await addCategory(uid, { kind: parent.kind, name, emoji: '', parentId: parent.id }));
    }
    return { added, categories: await categoriesOut(uid) };
  },

  async archiveCategory(c, input) {
    const uid = c.user.tg_id;
    const cat = await getCategory(uid, +input.id);
    if (!cat) fail('Категория не найдена.', 'NOT_FOUND');
    if (input.archived === false) await restoreCategory(uid, cat.id);
    else {
      if (cat.code === 'other' || cat.code === 'other_in') fail('Эту категорию нельзя удалить: в неё попадает всё нераспознанное.', 'FALLBACK');
      await archiveCategory(uid, cat.id);
    }
    return { categories: await categoriesOut(uid) };
  },

  async moveCategory(c, input) {
    const uid = c.user.tg_id;
    const cat = await getCategory(uid, +input.id);
    if (!cat) fail('Категория не найдена.', 'NOT_FOUND');
    const list = (await listCategories(uid)).filter((x) => x.kind === cat.kind && (x.parent_id || 0) === (cat.parent_id || 0));
    const i = list.findIndex((x) => x.id === cat.id);
    const j = i + (+input.dir < 0 ? -1 : 1);
    if (i >= 0 && j >= 0 && j < list.length) {
      [list[i], list[j]] = [list[j], list[i]];
      for (let k = 0; k < list.length; k++) if (list[k].sort !== k) await setCategorySort(uid, list[k].id, k);
    }
    return { categories: await categoriesOut(uid) };
  },

  async setBudget(c, input) {
    const uid = c.user.tg_id;
    const categoryId = +input.categoryId || 0;
    if (categoryId) {
      const cat = await getCategory(uid, categoryId);
      if (!cat || cat.kind !== 'expense') fail('Бюджет можно задать только для категории расходов.', 'BAD_CATEGORY');
    }
    const amount = Math.round(Number(input.amount) || 0);
    if (amount < 0 || amount >= MAX_AMOUNT) fail('Неверная сумма.', 'BAD_AMOUNT');
    await setBudget(uid, categoryId, amount);
    return { budgets: await budgetsOut(c.user) };
  },

  async saveSettings(c, input) {
    if (input.currency !== undefined) {
      if (!CURRENCIES[input.currency]) fail('Неизвестная валюта.', 'BAD_CURRENCY');
      await setUserCurrency(c.user.tg_id, input.currency);
      c.user.currency = input.currency;
    }
    if (input.tz !== undefined) {
      const tz = Math.round(Number(input.tz));
      if (!Number.isFinite(tz) || Math.abs(tz) > 14 * 60) fail('Неверный часовой пояс.', 'BAD_TZ');
      await setUserTz(c.user.tg_id, tz);
      c.user.tz_offset = tz;
    }
    return { me: meOut(c), today: isoYmd(localToday(c.user.tz_offset)) };
  },

  async exportExcel(c, input) {
    const sel = input.categoryId ? String(+input.categoryId) : input.mode === 'short' ? 'l' : 't';
    const doc = await excelDocument(c.user, periodOf(c, input.period).code, sel);
    if (doc.error === 'empty') fail(`За период «${doc.period.title}» операций нет.`, 'EMPTY');
    if (doc.error) fail('Не понял период.', 'BAD_PERIOD');
    try {
      await api.sendDocument({ chat_id: c.chatId, document: doc.document, caption: doc.caption, parse_mode: 'HTML' });
    } catch (e) {
      if (e && e.code === 403) fail('Не могу отправить файл: откройте чат с ботом и нажмите /start.', 'BLOCKED');
      throw e;
    }
    return { sent: true, count: doc.count, filename: doc.filename };
  },
};

// Ключевые слова категории: для отдельных слов храним основу («шаурма» → «шаур»),
// чтобы узнавать все формы; фразы — как есть.
function cleanKeywords(list) {
  const out = [];
  for (const raw of Array.isArray(list) ? list : String(list || '').split(',')) {
    const w = norm(String(raw)).replace(/[^a-zа-я0-9 /-]+/gi, ' ').replace(/\s+/g, ' ').trim();
    if (w.length < 2) continue;
    const kw = w.includes(' ') ? w : stemWord(w);
    if (!out.includes(kw)) out.push(kw);
  }
  return out.slice(0, 60);
}

// Сколько дней периода уже прошло (для «в среднем в день»), считая с первой записи.
function elapsedDays(period, txs, tz) {
  if (!txs.length) return 0;
  const first = toLocal(Math.min(...txs.map((t) => t.occurred_at)), tz);
  let from = { y: first.y, m: first.m, d: first.d };
  if (period.fromYmd && cmpYmd(period.fromYmd, from) > 0) from = period.fromYmd;
  const today = localToday(tz);
  const to = period.toYmd && cmpYmd(period.toYmd, today) < 0 ? period.toYmd : today;
  if (cmpYmd(to, from) < 0) return 0;
  return Math.round((Date.UTC(to.y, to.m - 1, to.d) - Date.UTC(from.y, from.m - 1, from.d)) / 86400000) + 1;
}

// Ряд для графика: по дням (до ~2 месяцев) или по месяцам.
function series(period, txs, tz) {
  const daysSpan = period.fromYmd
    ? Math.round((Date.UTC(period.toYmd.y, period.toYmd.m - 1, period.toYmd.d) - Date.UTC(period.fromYmd.y, period.fromYmd.m - 1, period.fromYmd.d)) / 86400000) + 1
    : Infinity;
  const local = txs.map((t) => ({ t, l: toLocal(t.occurred_at, tz) }));
  if (daysSpan <= 62) {
    const map = new Map();
    for (const { t, l } of local) {
      const k = isoYmd(l);
      const e = map.get(k) || { expense: 0, income: 0 };
      e[t.kind] += t.amount;
      map.set(k, e);
    }
    const out = [];
    for (let d = period.fromYmd; cmpYmd(d, period.toYmd) <= 0; d = addDays(d, 1)) {
      const k = isoYmd(d);
      out.push({ key: k, label: String(d.d), ...(map.get(k) || { expense: 0, income: 0 }) });
    }
    return { unit: 'day', points: out };
  }
  let fromM, toM;
  if (period.fromYmd) {
    fromM = { y: period.fromYmd.y, m: period.fromYmd.m };
    toM = { y: period.toYmd.y, m: period.toYmd.m };
  } else if (local.length) {
    fromM = { y: local[0].l.y, m: local[0].l.m };
    toM = { y: local[local.length - 1].l.y, m: local[local.length - 1].l.m };
  } else return { unit: 'month', points: [] };
  const map = new Map();
  for (const { t, l } of local) {
    const k = l.y * 100 + l.m;
    const e = map.get(k) || { expense: 0, income: 0 };
    e[t.kind] += t.amount;
    map.set(k, e);
  }
  const out = [];
  for (let y = fromM.y, m = fromM.m; y * 100 + m <= toM.y * 100 + toM.m && out.length < 240; m === 12 ? (y++, m = 1) : m++) {
    out.push({ key: `${y}-${pad(m)}`, label: MONTHS[m - 1].slice(0, 3), ...(map.get(y * 100 + m) || { expense: 0, income: 0 }) });
  }
  return { unit: 'month', points: out };
}
