// Экраны бота: каждый возвращает { text, extra } для send/show.

import {
  listCategories, getTransaction, lastTransactions, countTransactions, totalsByCategory,
  topExpenses, transactionsInRange, listBudgets, categoryMonthSpent, getSetting, listAllowed,
} from './store.js';
import {
  decodePeriod, periodBounds, shiftPeriod, currentPeriodCode, prevPeriodLabel, toLocal,
  humanDay, localToday, periodCode, cmpYmd, MONTHS,
} from './dates.js';
import { esc, money, signedMoney, percent, bar, catLabel, plural, tzLabel, truncate } from './format.js';
import { btn, rows, inline } from './tg.js';
import { CURRENCIES, TIMEZONES, AI_PRESETS } from './config.js';
import { getAiConfig, aiReady } from './ai.js';

const pad = (n) => String(n).padStart(2, '0');
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

export async function catsMap(userId) {
  const cats = await listCategories(userId, { includeArchived: true });
  return new Map(cats.map((c) => [c.id, c]));
}

// ── Карточка операции ──────────────────────────────────────────────────────

export function txLine(t, cat, tz, { withDate = true } = {}) {
  const l = toLocal(t.occurred_at, tz);
  const date = withDate ? `${pad(l.d)}.${pad(l.m)} · ` : '';
  const note = t.note ? ' — ' + esc(truncate(t.note, 40)) : '';
  return `${date}<b>${signedMoney(t.kind, t.amount, t.currency)}</b> · ${cat ? cat.emoji || '•' : '❔'} ${esc(cat ? cat.name : 'Без категории')}${note}`;
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

export async function categoryPicker(userId, t, note = '') {
  const cats = (await listCategories(userId)).filter((c) => c.kind === t.kind);
  const kb = rows(cats.map((c) => btn(`${c.id === t.category_id ? '✅ ' : ''}${c.emoji} ${c.name}`, `t:s:${t.id}:${c.id}`)), 2);
  kb.push([
    btn(t.kind === 'expense' ? '💰 Это доход' : '💸 Это расход', `t:k:${t.id}`),
    btn('◀️ Назад', `t:o:${t.id}`),
  ]);
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
      for (const r of exp.slice(0, 15)) {
        const c = cats.get(r.category_id);
        lines.push(`${c ? c.emoji : '❔'} ${esc(c ? c.name : 'Без категории')} — <b>${money(r.total, cur)}</b> · ${percent(r.total, expTotal)}`);
        lines.push(`<code>${bar(r.total, expTotal)}</code>`);
      }
      if (exp.length > 15) lines.push(`…и ещё ${exp.length - 15}`);
    }
    if (inc.length) {
      lines.push('', '<b>Доходы</b>');
      for (const r of inc) {
        const c = cats.get(r.category_id);
        lines.push(`${c ? c.emoji : '❔'} ${esc(c ? c.name : 'Без категории')} — <b>${money(r.total, cur)}</b>`);
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
      `📑 <b>Полный отчёт</b> — сводка, все операции, по дням и <b>отдельная вкладка на каждую категорию</b> (${catCount}).\n` +
      '📄 <b>Кратко</b> — сводка и общий список операций.\n' +
      '🗂 <b>Одна категория</b> — только выбранная категория.'
    : `📥 <b>${esc(period.title)}</b>\n\nЗа этот период операций нет. Выберите другой период.`;
  const kb = [];
  if (txs.length) {
    kb.push([btn('📑 Полный отчёт с вкладками', `x:g:${code}:t`)]);
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
  const agg = new Map();
  for (const r of totals) {
    const a = agg.get(r.category_id) || { id: r.category_id, kind: r.kind, total: 0, cnt: 0 };
    a.total += r.currency === user.currency ? r.total : 0;
    a.cnt += r.cnt;
    agg.set(r.category_id, a);
  }
  const list = [...agg.values()].sort((a, b) => (a.kind === b.kind ? b.total - a.total : a.kind === 'expense' ? -1 : 1));
  const kb = list.map((a) => {
    const c = cats.get(a.id);
    return [btn(`${c ? c.emoji : '❔'} ${c ? c.name : 'Без категории'} · ${a.total ? money(a.total, user.currency) : a.cnt + ' оп.'}`, `x:g:${code}:${a.id}`)];
  });
  kb.push([btn('◀️ Назад', `x:p:${code}`)]);
  return { text: `🗂 <b>${esc(period.title)}</b>\n\nВыберите категорию для выгрузки:`, extra: inline(kb) };
}

// ── Категории ──────────────────────────────────────────────────────────────

export async function categoriesScreen(user, kind = 'expense') {
  const cats = (await listCategories(user.tg_id)).filter((c) => c.kind === kind);
  const lines = [`📂 <b>${kind === 'expense' ? 'Категории расходов' : 'Категории доходов'}</b>`, ''];
  for (const c of cats) {
    const kws = String(c.keywords || '').split(',').filter(Boolean);
    lines.push(`${c.emoji || '•'} ${esc(c.name)}${kws.length ? ` <i>· ${esc(kws.slice(0, 6).join(', '))}${kws.length > 6 ? '…' : ''}</i>` : ''}`);
  }
  lines.push('', '<i>Категорию я угадываю сам. Если ошибся — нажмите «🏷 Категория» под записью, и я запомню слово на будущее.</i>');
  const kb = [
    [btn('➕ Добавить', `c:a:${kind}`), btn('🗑 Удалить', `c:d:${kind}`)],
    [btn(kind === 'expense' ? '💰 Категории доходов' : '💸 Категории расходов', `c:l:${kind === 'expense' ? 'income' : 'expense'}`)],
  ];
  return { text: lines.join('\n'), extra: inline(kb) };
}

export async function categoryDeleteScreen(user, kind) {
  const cats = (await listCategories(user.tg_id)).filter((c) => c.kind === kind && c.code !== 'other' && c.code !== 'other_in');
  const kb = rows(cats.map((c) => btn(`🗑 ${c.emoji} ${c.name}`, `c:rm:${c.id}`)), 2);
  kb.push([btn('◀️ Назад', `c:l:${kind}`)]);
  return {
    text: '🗑 <b>Какую категорию удалить?</b>\n\nСтарые записи останутся в отчётах под прежним названием.',
    extra: inline(kb),
  };
}

// ── Бюджет ─────────────────────────────────────────────────────────────────

export async function budgetStatus(user, categoryId) {
  // Состояние бюджета (общего и категории) в текущем месяце — для предупреждений.
  const budgets = await listBudgets(user.tg_id);
  if (!budgets.length) return [];
  const t = localToday(user.tz_offset);
  const { from, to } = periodBounds(decodePeriod(periodCode.month(t.y, t.m)), user.tz_offset);
  const out = [];
  for (const b of budgets) {
    if (b.category_id !== 0 && b.category_id !== categoryId) continue;
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
      const name = b.category_id ? `${c ? c.emoji + ' ' + esc(c.name) : 'Категория'}` : '💼 <b>Общий</b>';
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
  const kb = [
    [btn('💱 Валюта', 's:cur'), btn('🕒 Часовой пояс', 's:tz')],
  ];
  if (isOwner) {
    kb.push([btn('🎙 Голос и ИИ', 's:ai'), btn('👥 Доступ', 's:acc')]);
  }
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
