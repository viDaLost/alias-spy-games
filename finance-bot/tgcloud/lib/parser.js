// Разбор фраз вида «кофе 250», «вчера такси 450», «+50000 зарплата»,
// «хлеб 60, молоко 90», «продукты 1 234,50 в пятёрочке», «двести рублей шаурма».
// Работает без ИИ; ИИ (если подключён) используется для сложных фраз.

import { CURRENCIES } from './config.js';
import { findDateInText, localToday } from './dates.js';
import { hasIncomeHint, norm } from './categories.js';

// ── Числа словами ───────────────────────────────────────────────────────────

const NUM_WORDS = {
  ноль: 0, один: 1, одна: 1, одну: 1, одно: 1, два: 2, две: 2, три: 3, четыре: 4, пять: 5,
  шесть: 6, семь: 7, восемь: 8, девять: 9, десять: 10, одиннадцать: 11, двенадцать: 12,
  тринадцать: 13, четырнадцать: 14, пятнадцать: 15, шестнадцать: 16, семнадцать: 17,
  восемнадцать: 18, девятнадцать: 19, двадцать: 20, тридцать: 30, сорок: 40, пятьдесят: 50,
  шестьдесят: 60, семьдесят: 70, восемьдесят: 80, девяносто: 90, сто: 100, двести: 200,
  триста: 300, четыреста: 400, пятьсот: 500, шестьсот: 600, семьсот: 700, восемьсот: 800,
  девятьсот: 900, полтора: 1.5, полторы: 1.5,
};
const MULT_WORDS = {
  тысяча: 1e3, тысячу: 1e3, тысячи: 1e3, тысяч: 1e3, тыща: 1e3, тыщу: 1e3, тыщи: 1e3, тыщ: 1e3,
  миллион: 1e6, миллиона: 1e6, миллионов: 1e6,
};

/** «две тысячи пятьсот» → «2500». Одиночное «один/одна» не трогаем («одну шаурму»). */
export function wordsToDigits(text) {
  const parts = text.split(/(\s+)/);
  const out = [];
  let run = [];
  const flush = () => {
    if (!run.length) return;
    const words = run.filter((p) => !/^\s+$/.test(p));
    const keys = words.map((w) => norm(w).replace(/[.,!?]+$/, ''));
    if (keys.length === 1 && NUM_WORDS[keys[0]] === 1) { out.push(...run); run = []; return; }
    let total = 0, cur = 0;
    for (const k of keys) {
      if (MULT_WORDS[k]) { total += (cur || 1) * MULT_WORDS[k]; cur = 0; } else cur += NUM_WORDS[k];
    }
    const tail = words[words.length - 1].match(/[.,!?]+$/);
    out.push(String(total + cur) + (tail ? tail[0] : ''));
    // пробел после числа сохраняем, если он был внутри run
    if (/^\s+$/.test(run[run.length - 1])) out.push(run[run.length - 1]);
    run = [];
  };
  for (const p of parts) {
    if (/^\s+$/.test(p)) { if (run.length) run.push(p); else out.push(p); continue; }
    const k = norm(p).replace(/[.,!?]+$/, '');
    if (k in NUM_WORDS || k in MULT_WORDS) {
      // «5 тысяч» — множитель после цифры оставляем для разбора суммы
      if (!run.length && k in MULT_WORDS) {
        const prev = [...out].reverse().find((x) => !/^\s+$/.test(x));
        if (prev && /\d$/.test(prev)) { out.push(p); continue; }
      }
      run.push(p);
    } else { flush(); out.push(p); }
  }
  flush();
  return out.join('');
}

// ── Токены суммы ────────────────────────────────────────────────────────────

const CURRENCY_WORDS = new Map();
for (const [code, c] of Object.entries(CURRENCIES)) for (const w of c.words) CURRENCY_WORDS.set(w, code);

function currencyOf(token) {
  const t = norm(token).replace(/[.,!?:]+$/, '') ;
  if (CURRENCY_WORDS.has(t)) return CURRENCY_WORDS.get(t);
  if (CURRENCY_WORDS.has(norm(token))) return CURRENCY_WORDS.get(norm(token));
  if (/^руб/.test(t)) return 'RUB';
  if (/^долл/.test(t) || /^бакс/.test(t)) return 'USD';
  return null;
}

function multiplierOf(token) {
  const t = norm(token).replace(/[!?:,]+$/, '');
  if (/^(к|k|тыс|тыс\.|т\.?р\.?|тр|тыщ.*|тысяч.*)$/.test(t)) return 1e3;
  if (/^(кк|kk|млн|млн\.|миллион.*)$/.test(t)) return 1e6;
  return 0;
}

const FILLER_RE = /^(потрат\S*|заплат\S*|купил\S*|оплат\S*|отдал\S*|получил\S*|заработал\S*|пришл\S*|поступил\S*|ушл[оаи]|ушел|списал\S*|перевел\S*|скинул\S*|итого|всего|сумма)$/;
const EDGE_WORDS = new Set(['на', 'за', 'в', 'во', 'по', 'и', 'а', 'с', 'со', 'это', 'было', 'еще', 'ещё', 'плюс', 'минус', 'тоже', 'для', '-', '—', '+', '–', 'к']);

function cleanNote(tokens) {
  const words = tokens.filter((t) => !FILLER_RE.test(norm(t)) && !currencyOf(t) && !/^коп/.test(norm(t)));
  while (words.length && EDGE_WORDS.has(norm(words[0]))) words.shift();
  while (words.length && EDGE_WORDS.has(norm(words[words.length - 1]))) words.pop();
  return words.join(' ').replace(/\s+([,.!?])/g, '$1').replace(/^[,.:;\-—\s]+|[,:;\-—\s]+$/g, '').trim();
}

function tokenize(segment) {
  let s = ' ' + segment + ' ';
  s = s.replace(/(\d)([^\d\s.,])/g, '$1 $2').replace(/([^\d\s.,+\-−])(\d)/g, '$1 $2');
  s = s.replace(/(^|\s)(\d{1,3}(?:\s\d{3})+)(?=[\s.,]|$)/g, (m, a, b) => a + b.replace(/\s/g, ''));
  return s.split(/\s+/)
    .map((t) => t.replace(/^[«"'(\[]+|[»"')\]!?]+$/g, '').replace(/[,:;]+$/, ''))
    .filter(Boolean);
}

function extractAmounts(tokens) {
  const amounts = [];
  for (let i = 0; i < tokens.length; i++) {
    const m = tokens[i].match(/^([+\-−]?)(\d+(?:[.,]\d{1,3})?)\.?$/);
    if (!m) continue;
    let value = parseFloat(m[2].replace(',', '.'));
    let sign = m[1] === '+' ? '+' : m[1] ? '-' : '';
    let start = i, end = i;
    let currency = null;
    if (!sign && i > 0 && /^[+\-−]$/.test(tokens[i - 1])) { sign = tokens[i - 1] === '+' ? '+' : '-'; start = i - 1; }
    if (i > 0 && start === i) {
      const c = currencyOf(tokens[i - 1]);
      if (c && /^[^\p{L}\d]+$/u.test(tokens[i - 1])) { currency = c; start = i - 1; }
    }
    const mult = tokens[end + 1] ? multiplierOf(tokens[end + 1]) : 0;
    if (mult) { value *= mult; end += 1; }
    if (tokens[end + 1] && currencyOf(tokens[end + 1])) {
      currency = currencyOf(tokens[end + 1]); end += 1;
      // «250 руб 50 коп»
      const kop = tokens[end + 1] && tokens[end + 1].match(/^(\d{1,2})$/);
      if (kop && tokens[end + 2] && /^коп/.test(norm(tokens[end + 2]))) { value += +kop[1] / 100; end += 2; }
    }
    if (!(value > 0) || value >= 1e10) continue;
    amounts.push({ start, end, value, sign, currency });
    i = end;
  }
  return amounts;
}

function splitSegments(text) {
  return text.split(/[;\n]+|,(?!\d)/).map((s) => s.trim()).filter(Boolean);
}

function countAmounts(text) {
  return splitSegments(text).reduce((n, seg) => n + extractAmounts(tokenize(seg)).length, 0);
}

/**
 * Разбирает сообщение в список операций.
 * Возвращает { items: [{ kind, amount (в копейках), currency, note, ymd, kindExplicit }], ymd, multi }.
 */
export function parseText(text, { tz = 180, currency = 'RUB', nowMs = Date.now() } = {}) {
  const src = String(text || '').replace(/[  ]/g, ' ').trim();
  if (!src) return { items: [], ymd: localToday(tz, nowMs), multi: false };

  let ymd = localToday(tz, nowMs);
  let work = wordsToDigits(src);
  const date = findDateInText(work, tz, nowMs);
  if (date) {
    const without = (work.slice(0, date.start) + ' ' + work.slice(date.end)).trim();
    // «обед 12.09» — если кроме «даты» чисел нет, это сумма, а не дата.
    if (!date.numeric || countAmounts(without) > 0) { work = without; ymd = date.ymd; }
  }

  const items = [];
  for (const seg of splitSegments(work)) {
    const tokens = tokenize(seg);
    const amounts = extractAmounts(tokens);
    if (!amounts.length) {
      // Сегмент без суммы («такси», а сумма в следующем) — приклеим к следующему.
      continue;
    }
    const segIncome = hasIncomeHint(seg);
    const used = new Set();
    amounts.forEach((a) => { for (let k = a.start; k <= a.end; k++) used.add(k); });

    const notes = amounts.map(() => []);
    if (amounts.length === 1) {
      tokens.forEach((t, k) => { if (!used.has(k)) notes[0].push(t); });
    } else {
      // «кофе 250 и круассан 180» — слова перед суммами; «потратил 60 на хлеб и 90 на молоко» — после.
      const isContent = (t) => !FILLER_RE.test(norm(t)) && !EDGE_WORDS.has(norm(t)) && !currencyOf(t);
      const wordsFirst = tokens.slice(0, amounts[0].start).some(isContent);
      tokens.forEach((t, k) => {
        if (used.has(k)) return;
        let idx;
        if (wordsFirst) {
          idx = amounts.findIndex((a) => k < a.start);
          if (idx < 0) idx = amounts.length - 1;
        } else {
          idx = -1;
          amounts.forEach((a, j) => { if (k > a.end) idx = j; });
          if (idx < 0) idx = 0;
        }
        notes[idx].push(t);
      });
    }

    amounts.forEach((a, j) => {
      const note = cleanNote(notes[j]);
      const ownIncome = amounts.length > 1 ? hasIncomeHint(notes[j].join(' ')) : segIncome;
      const kind = a.sign === '+' ? 'income' : a.sign === '-' ? 'expense' : ownIncome ? 'income' : 'expense';
      items.push({
        kind,
        amount: Math.round(a.value * 100),
        currency: a.currency || currency,
        note,
        ymd,
        kindExplicit: Boolean(a.sign) || ownIncome,
      });
    });
  }
  return { items, ymd, multi: items.length > 1 };
}

// Только сумма (для правки операции: «350» или «350 кофе с собой»).
export function parseAmountAndNote(text, currency = 'RUB') {
  const tokens = tokenize(wordsToDigits(String(text || '')));
  const amounts = extractAmounts(tokens);
  if (!amounts.length) return { amount: null, currency: null, note: cleanNote(tokens) };
  const a = amounts[0];
  const rest = tokens.filter((_, k) => k < a.start || k > a.end);
  return { amount: Math.round(a.value * 100), currency: a.currency || null, note: cleanNote(rest) };
}

// Разбор суммы бюджета: «50000», «50к», «продукты 15 000».
export function parseBudgetText(text) {
  const tokens = tokenize(wordsToDigits(String(text || '')));
  const amounts = extractAmounts(tokens);
  const zero = tokens.findIndex((t) => /^0$/.test(t));
  if (!amounts.length && zero < 0) return null;
  const a = amounts[0] || { start: zero, end: zero, value: 0 };
  const name = cleanNote(tokens.filter((_, k) => k < a.start || k > a.end));
  return { amount: Math.round(a.value * 100), name };
}
