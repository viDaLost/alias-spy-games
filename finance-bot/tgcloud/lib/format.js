// Форматирование сумм и текста для сообщений Telegram (parse_mode: HTML).

import { CURRENCIES } from './config.js';

export const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function currencySymbol(code) {
  return (CURRENCIES[code] && CURRENCIES[code].symbol) || code;
}

function groupThousands(intStr) {
  return intStr.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

/** 123450 → «1 234,50 ₽», 100000 → «1 000 ₽». */
export function money(minor, currency) {
  const neg = minor < 0;
  const abs = Math.abs(Math.round(minor));
  const int = Math.floor(abs / 100), frac = abs % 100;
  const s = groupThousands(String(int)) + (frac ? ',' + String(frac).padStart(2, '0') : '');
  return (neg ? '−' : '') + s + (currency ? ' ' + currencySymbol(currency) : '');
}

/** Сумма со знаком по типу операции: «−250 ₽» / «+50 000 ₽». */
export function signedMoney(kind, minor, currency) {
  return (kind === 'income' ? '+' : '−') + money(minor, currency);
}

export function percent(part, whole) {
  if (!whole) return '0%';
  const p = (part / whole) * 100;
  return (p >= 10 || p === 0 ? Math.round(p) : Math.round(p * 10) / 10).toString().replace('.', ',') + '%';
}

/** Полоска прогресса из 10 делений. */
export function bar(part, whole, width = 10) {
  const ratio = whole > 0 ? Math.min(1, part / whole) : 0;
  const full = Math.round(ratio * width);
  return '▰'.repeat(full) + '▱'.repeat(width - full);
}

/** «🛒 Продукты», для подкатегории — «💊 Здоровье › Аптека». */
export function catLabel(cat) {
  if (!cat) return '❔ Без категории';
  const emoji = cat.emoji || cat.parent_emoji || '';
  return `${emoji ? emoji + ' ' : ''}${cat.parent_name ? cat.parent_name + ' › ' : ''}${cat.name}`;
}

/** Название без эмодзи: «Здоровье › Аптека». */
export function catPath(cat) {
  if (!cat) return 'Без категории';
  return `${cat.parent_name ? cat.parent_name + ' › ' : ''}${cat.name}`;
}

export function plural(n, one, few, many) {
  const n10 = n % 10, n100 = n % 100;
  if (n10 === 1 && n100 !== 11) return one;
  if (n10 >= 2 && n10 <= 4 && (n100 < 12 || n100 > 14)) return few;
  return many;
}

export function tzLabel(tz) {
  const sign = tz < 0 ? '−' : '+';
  const a = Math.abs(tz);
  return `UTC${sign}${Math.floor(a / 60)}${a % 60 ? ':' + String(a % 60).padStart(2, '0') : ''}`;
}

export function truncate(s, n) {
  s = String(s || '');
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}
