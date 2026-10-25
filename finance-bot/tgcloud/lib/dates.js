// Работа с датами в часовом поясе пользователя (tz — смещение от UTC в минутах)
// и с периодами отчётов. Период кодируется короткой строкой, чтобы помещаться
// в callback_data кнопок:
//   d20261025          — день
//   w20261019          — неделя, начиная с понедельника 19.10.2026
//   m202610            — месяц
//   y2026              — год
//   r20260901_20260930 — произвольный диапазон (включительно)
//   a                  — всё время

const DAY = 86400;

export const MONTHS = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];
export const MONTHS_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const MONTH_STEMS = ['янв', 'фев', 'мар', 'апр', 'ма', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
const WEEKDAY_STEMS = ['воскр', 'понед', 'вторн', 'сред', 'четв', 'пятн', 'субб'];

const pad = (n) => String(n).padStart(2, '0');
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// Сегодняшняя дата пользователя.
export function localToday(tz, nowMs = Date.now()) {
  const d = new Date(nowMs + tz * 60000);
  return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate() };
}

// Полночь локальной даты → unix-секунды UTC.
export function dayStart(ymd, tz) {
  return Math.floor(Date.UTC(ymd.y, ymd.m - 1, ymd.d) / 1000) - tz * 60;
}

// Unix-секунды → локальные компоненты даты/времени.
export function toLocal(unix, tz) {
  const d = new Date((unix + tz * 60) * 1000);
  return {
    y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate(),
    hh: d.getUTCHours(), mi: d.getUTCMinutes(), dow: d.getUTCDay(),
  };
}

export function addDays(ymd, n) {
  const d = new Date(Date.UTC(ymd.y, ymd.m - 1, ymd.d + n));
  return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate() };
}

export function weekday(ymd) {
  return new Date(Date.UTC(ymd.y, ymd.m - 1, ymd.d)).getUTCDay();
}

export function cmpYmd(a, b) {
  return (a.y - b.y) || (a.m - b.m) || (a.d - b.d);
}

export function isValidYmd(ymd) {
  if (!ymd || ymd.m < 1 || ymd.m > 12 || ymd.d < 1 || ymd.y < 1970 || ymd.y > 2200) return false;
  const back = addDays(ymd, 0);
  return back.y === ymd.y && back.m === ymd.m && back.d === ymd.d;
}

export const fmtYmd = (ymd) => `${pad(ymd.d)}.${pad(ymd.m)}.${ymd.y}`;
export const isoYmd = (ymd) => `${ymd.y}-${pad(ymd.m)}-${pad(ymd.d)}`;
const compactYmd = (ymd) => `${ymd.y}${pad(ymd.m)}${pad(ymd.d)}`;
const parseCompact = (s) => ({ y: +s.slice(0, 4), m: +s.slice(4, 6), d: +s.slice(6, 8) });

// «сегодня», «вчера», «23 октября» или «23 октября 2025».
export function humanDay(ymd, tz, nowMs = Date.now()) {
  const today = localToday(tz, nowMs);
  if (cmpYmd(ymd, today) === 0) return 'сегодня';
  if (cmpYmd(ymd, addDays(today, -1)) === 0) return 'вчера';
  if (cmpYmd(ymd, addDays(today, -2)) === 0) return 'позавчера';
  return `${ymd.d} ${MONTHS_GEN[ymd.m - 1]}${ymd.y !== today.y ? ' ' + ymd.y : ''}`;
}

// ── Периоды ─────────────────────────────────────────────────────────────────

const monthStart = (y, m) => ({ y, m, d: 1 });
const nextMonth = (y, m) => (m === 12 ? { y: y + 1, m: 1 } : { y, m: m + 1 });
const prevMonthOf = (y, m) => (m === 1 ? { y: y - 1, m: 12 } : { y, m: m - 1 });
const mondayOf = (ymd) => addDays(ymd, -((weekday(ymd) + 6) % 7));

export const periodCode = {
  day: (ymd) => 'd' + compactYmd(ymd),
  week: (ymd) => 'w' + compactYmd(mondayOf(ymd)),
  month: (y, m) => `m${y}${pad(m)}`,
  year: (y) => `y${y}`,
  range: (from, to) => `r${compactYmd(from)}_${compactYmd(to)}`,
  all: () => 'a',
};

export function currentPeriodCode(kind, tz, nowMs = Date.now()) {
  const t = localToday(tz, nowMs);
  if (kind === 'day') return periodCode.day(t);
  if (kind === 'week') return periodCode.week(t);
  if (kind === 'year') return periodCode.year(t.y);
  if (kind === 'all') return periodCode.all();
  if (kind === 'prevMonth') { const p = prevMonthOf(t.y, t.m); return periodCode.month(p.y, p.m); }
  return periodCode.month(t.y, t.m);
}

// Код → { code, kind, fromYmd, toYmd (включительно), title, short }.
export function decodePeriod(code) {
  if (!code || typeof code !== 'string') return null;
  const k = code[0];
  let p = null;
  if (k === 'a' && code === 'a') {
    p = { kind: 'all', fromYmd: null, toYmd: null, title: 'Всё время', short: 'всё время' };
  } else if (k === 'd' && /^d\d{8}$/.test(code)) {
    const d = parseCompact(code.slice(1));
    if (!isValidYmd(d)) return null;
    p = { kind: 'day', fromYmd: d, toYmd: d, title: `${d.d} ${MONTHS_GEN[d.m - 1]} ${d.y}`, short: fmtYmd(d) };
  } else if (k === 'w' && /^w\d{8}$/.test(code)) {
    const from = parseCompact(code.slice(1));
    const to = addDays(from, 6);
    const title = from.m === to.m
      ? `${from.d}–${to.d} ${MONTHS_GEN[to.m - 1]} ${to.y}`
      : `${from.d} ${MONTHS_GEN[from.m - 1]} – ${to.d} ${MONTHS_GEN[to.m - 1]} ${to.y}`;
    p = { kind: 'week', fromYmd: from, toYmd: to, title: 'Неделя ' + title, short: `${fmtYmd(from)}–${fmtYmd(to)}` };
  } else if (k === 'm' && /^m\d{6}$/.test(code)) {
    const y = +code.slice(1, 5), m = +code.slice(5, 7);
    if (m < 1 || m > 12) return null;
    const n = nextMonth(y, m);
    p = { kind: 'month', fromYmd: monthStart(y, m), toYmd: addDays(monthStart(n.y, n.m), -1), title: `${cap(MONTHS[m - 1])} ${y}`, short: `${y}-${pad(m)}` };
  } else if (k === 'y' && /^y\d{4}$/.test(code)) {
    const y = +code.slice(1);
    p = { kind: 'year', fromYmd: { y, m: 1, d: 1 }, toYmd: { y, m: 12, d: 31 }, title: `${y} год`, short: String(y) };
  } else if (k === 'r' && /^r\d{8}_\d{8}$/.test(code)) {
    const from = parseCompact(code.slice(1, 9)), to = parseCompact(code.slice(10));
    p = { kind: 'range', fromYmd: from, toYmd: to, title: `${fmtYmd(from)} — ${fmtYmd(to)}`, short: `${isoYmd(from)}_${isoYmd(to)}` };
  }
  if (!p) return null;
  if (p.fromYmd && (!isValidYmd(p.fromYmd) || !isValidYmd(p.toYmd) || cmpYmd(p.fromYmd, p.toYmd) > 0)) return null;
  return { code, ...p };
}

// Границы периода в unix-секундах: [from, to).
export function periodBounds(period, tz) {
  if (period.kind === 'all') return { from: 0, to: 32503680000 };
  return { from: dayStart(period.fromYmd, tz), to: dayStart(addDays(period.toYmd, 1), tz) };
}

// Соседний период того же типа (для кнопок ◀️ ▶️). Для диапазона и «всего времени» — null.
export function shiftPeriod(code, dir) {
  const p = decodePeriod(code);
  if (!p) return null;
  if (p.kind === 'day') return periodCode.day(addDays(p.fromYmd, dir));
  if (p.kind === 'week') return periodCode.week(addDays(p.fromYmd, 7 * dir));
  if (p.kind === 'month') {
    const n = dir > 0 ? nextMonth(p.fromYmd.y, p.fromYmd.m) : prevMonthOf(p.fromYmd.y, p.fromYmd.m);
    return periodCode.month(n.y, n.m);
  }
  if (p.kind === 'year') return periodCode.year(p.fromYmd.y + dir);
  return null;
}

// Название предыдущего периода для сравнения: «сентябрём», «прошлой неделей»...
export function prevPeriodLabel(code) {
  const p = decodePeriod(code);
  if (!p) return '';
  if (p.kind === 'day') return 'предыдущим днём';
  if (p.kind === 'week') return 'прошлой неделей';
  if (p.kind === 'year') return `${p.fromYmd.y - 1} годом`;
  if (p.kind === 'month') {
    const prev = prevMonthOf(p.fromYmd.y, p.fromYmd.m);
    return monthInstr(prev.m);
  }
  return '';
}

function monthInstr(m) {
  return ['январём', 'февралём', 'мартом', 'апрелем', 'маем', 'июнем', 'июлем', 'августом', 'сентябрём', 'октябрём', 'ноябрём', 'декабрём'][m - 1];
}

// ── Разбор дат из текста ────────────────────────────────────────────────────

function monthFromWord(w) {
  if (!w) return 0;
  w = w.toLowerCase().replace(/ё/g, 'е').replace(/\.$/, '');
  if (w.length < 3) return 0;
  if (w.startsWith('мая') || w === 'май' || w === 'мае') return 5;
  if (w.startsWith('мар')) return 3;
  for (let i = 0; i < MONTH_STEMS.length; i++) {
    if (i === 4) continue;
    if (w.startsWith(MONTH_STEMS[i])) return i + 1;
  }
  return 0;
}

// Дата без года: если получилась в будущем — значит прошлый год.
function guessYear(d, m, today) {
  const cand = { y: today.y, m, d };
  return cmpYmd(cand, addDays(today, 1)) > 0 ? { y: today.y - 1, m, d } : cand;
}

function normYear(y) {
  if (y === undefined || y === '') return undefined;
  y = +y;
  return y < 100 ? 2000 + y : y;
}

/**
 * Ищет дату операции в тексте («вчера», «12.09», «3 сентября», «в пятницу»).
 * Возвращает { ymd, start, end } — позиции найденного фрагмента — или null.
 */
export function findDateInText(text, tz, nowMs = Date.now()) {
  const today = localToday(tz, nowMs);
  const lower = text.toLowerCase().replace(/ё/g, 'е');
  const found = [];

  const rel = /(^|[^а-яa-z])(позавчера|вчера|сегодня)(?![а-яa-z])/g;
  for (let m; (m = rel.exec(lower));) {
    const shift = { сегодня: 0, вчера: -1, позавчера: -2 }[m[2]];
    found.push({ ymd: addDays(today, shift), start: m.index + m[1].length, end: m.index + m[0].length });
  }

  const numeric = /(^|[^\d.,])(\d{1,2})[./](\d{1,2})(?:[./](\d{2}|\d{4}))?(?![\d.,]*\d)/g;
  for (let m; (m = numeric.exec(lower));) {
    const d = +m[2], mo = +m[3], y = normYear(m[4]);
    const ymd = y ? { y, m: mo, d } : guessYear(d, mo, today);
    if (isValidYmd(ymd)) found.push({ ymd, start: m.index + m[1].length, end: m.index + m[0].length, numeric: true });
  }

  const words = /(^|[^\dа-яa-z])(\d{1,2})\s+([а-я]{3,9}\.?)(?:\s+(\d{4})(?:\s*г(?:ода|\.)?)?)?(?![а-яa-z])/g;
  for (let m; (m = words.exec(lower));) {
    const mo = monthFromWord(m[3]);
    if (!mo) continue;
    const d = +m[2], y = normYear(m[4]);
    const ymd = y ? { y, m: mo, d } : guessYear(d, mo, today);
    if (isValidYmd(ymd)) found.push({ ymd, start: m.index + m[1].length, end: m.index + m[0].length });
  }

  const wd = /(^|[^а-яa-z])(?:в|во)\s+(?:прошл(?:ый|ую|ое)\s+)?(понедельник|вторник|среду|четверг|пятницу|субботу|воскресенье)(?![а-яa-z])/g;
  for (let m; (m = wd.exec(lower));) {
    const target = WEEKDAY_STEMS.findIndex((s) => m[2].startsWith(s.slice(0, 4)));
    if (target < 0) continue;
    let back = (weekday(today) - target + 7) % 7;
    if (back === 0) back = 7;
    found.push({ ymd: addDays(today, -back), start: m.index + m[1].length, end: m.index + m[0].length });
  }

  if (!found.length) return null;
  found.sort((a, b) => a.start - b.start);
  return found[0];
}

/**
 * Разбор периода, который пользователь ввёл текстом:
 * «сентябрь», «сентябрь 2025», «2025», «01.09-15.09», «1.09.2026 - 30.09.2026»,
 * «эта неделя», «прошлый месяц», «сегодня», «вчера», «всё время».
 * Возвращает код периода или null.
 */
export function parsePeriodText(text, tz, nowMs = Date.now()) {
  const today = localToday(tz, nowMs);
  const s = String(text || '').toLowerCase().replace(/ё/g, 'е').trim();
  if (!s) return null;

  if (/^(все|за все|все время|за все время|всё)$/.test(s)) return 'a';
  if (/^(сегодня|за сегодня|день)$/.test(s)) return periodCode.day(today);
  if (/^(вчера|за вчера)$/.test(s)) return periodCode.day(addDays(today, -1));
  if (/^(эта неделя|неделя|за неделю|текущая неделя)$/.test(s)) return periodCode.week(today);
  if (/^(прошлая неделя|за прошлую неделю)$/.test(s)) return periodCode.week(addDays(today, -7));
  if (/^(этот месяц|месяц|за месяц|текущий месяц)$/.test(s)) return periodCode.month(today.y, today.m);
  if (/^(прошлый месяц|за прошлый месяц)$/.test(s)) { const p = prevMonthOf(today.y, today.m); return periodCode.month(p.y, p.m); }
  if (/^(этот год|год|за год|текущий год)$/.test(s)) return periodCode.year(today.y);
  if (/^(прошлый год|за прошлый год)$/.test(s)) return periodCode.year(today.y - 1);
  if (/^(за\s+)?последние\s+(\d{1,3})\s+д/.test(s)) {
    const n = +s.match(/(\d{1,3})/)[1];
    return periodCode.range(addDays(today, -(n - 1)), today);
  }

  let m = s.match(/^(?:за\s+)?(\d{4})(?:\s*г(?:од)?\.?)?$/);
  if (m) return periodCode.year(+m[1]);

  m = s.match(/^(?:за\s+|в\s+)?([а-я]+)(?:\s+(\d{4}))?(?:\s*г(?:ода|\.)?)?$/);
  if (m && monthFromWord(m[1])) {
    const mo = monthFromWord(m[1]);
    let y = m[2] ? +m[2] : today.y;
    if (!m[2] && mo > today.m) y -= 1;
    return periodCode.month(y, mo);
  }

  // Диапазон двух дат: «01.09-15.09», «с 1.09.2026 по 30.09.2026».
  const dateRe = /(\d{1,2})[./](\d{1,2})(?:[./](\d{2}|\d{4}))?/g;
  const dates = [...s.matchAll(dateRe)];
  if (dates.length === 2) {
    const mk = (mm) => {
      const y = normYear(mm[3]);
      return y ? { y, m: +mm[2], d: +mm[1] } : guessYear(+mm[1], +mm[2], today);
    };
    let from = mk(dates[0]), to = mk(dates[1]);
    if (!dates[0][3] && dates[1][3]) from = { ...from, y: to.y - (from.m > to.m ? 1 : 0) };
    if (isValidYmd(from) && isValidYmd(to)) {
      if (cmpYmd(from, to) > 0) [from, to] = [to, from];
      return periodCode.range(from, to);
    }
  }
  if (dates.length === 1) {
    const mm = dates[0];
    const y = normYear(mm[3]);
    const d = y ? { y, m: +mm[2], d: +mm[1] } : guessYear(+mm[1], +mm[2], today);
    if (isValidYmd(d)) return periodCode.day(d);
  }

  // «с 1 по 15 октября»
  m = s.match(/^с\s+(\d{1,2})\s+(?:([а-я]+)\s+)?по\s+(\d{1,2})\s+([а-я]+)(?:\s+(\d{4}))?/);
  if (m && monthFromWord(m[4])) {
    const mo2 = monthFromWord(m[4]);
    const mo1 = m[2] ? monthFromWord(m[2]) || mo2 : mo2;
    const y = m[5] ? +m[5] : (mo2 > today.m ? today.y - 1 : today.y);
    const from = { y: mo1 > mo2 ? y - 1 : y, m: mo1, d: +m[1] }, to = { y, m: mo2, d: +m[3] };
    if (isValidYmd(from) && isValidYmd(to) && cmpYmd(from, to) <= 0) return periodCode.range(from, to);
  }
  return null;
}
