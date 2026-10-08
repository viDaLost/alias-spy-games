// Собирает данные «Библейской географии» — web/data/bible_geography.json.
//
//   node scripts/build-bible-geography.mjs            собрать (скачает синодальный текст, если его нет)
//   node scripts/build-bible-geography.mjs --text F   взять текст из готового CSV
//
// Источник правды — scripts/data/bible-geography-source.mjs. Сборщик сверяет
// каждую связь «герой — место» со стихом и кладёт сам стих рядом, чтобы игра
// показывала не пересказ, а слова Писания.
//
// Что значит «сверяет». В указанном стихе (или в соседних двух) названо место,
// а в пределах десяти стихов той же главы — сам герой. Иначе сборка падает:
// ссылка, которая не подтверждает связь, хуже, чем никакой. Исключения
// записаны в исходнике явно: ctx — место названо в стихе-контексте выше по
// главе («При кресте Иисуса стояли…» — Голгофа названа восемью стихами раньше),
// self — книга написана от первого лица, и имени героя рядом нет («И пришел я
// в Иерусалим» — Неемия).
//
// Издание — модуль RusSynodal (CrossWire) в выгрузке scrollmapper. Важна его
// разбивка: она синодальная. В другой открытой выгрузке, которую раньше брали
// для словаря словоформ, стихи пронумерованы по еврейскому тексту — там
// «Псалом Давида, когда он был в пустыне Иудейской» стоит как 63:1, а в
// синодальной Библии это Пс 62:1. Читатель, открывший свою Библию по ссылке из
// игры, должен найти тот самый стих.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { PLACES, HEROES, JOURNEYS, LABELS } from './data/bible-geography-source.mjs';

const root = path.resolve(import.meta.dirname, '..');
const output = path.join(root, 'web/data/bible_geography.json');
const witnessFile = path.join(root, 'scripts/data/bible-geography-witnesses.json');
const args = process.argv.slice(2);

export const EDITION = {
  id: 'scrollmapper/bible_databases RusSynodal',
  url: 'https://raw.githubusercontent.com/scrollmapper/bible_databases/master/formats/csv/RusSynodal.csv',
  sha256: '31f10285ad7aea604e7ba9457286b9201a6b2efa835cd478d97233da4d898c74',
};

const ENGLISH = ['Genesis', 'Exodus', 'Leviticus', 'Numbers', 'Deuteronomy', 'Joshua', 'Judges', 'Ruth', 'I Samuel', 'II Samuel', 'I Kings', 'II Kings', 'I Chronicles', 'II Chronicles', 'Ezra', 'Nehemiah', 'Esther', 'Job', 'Psalms', 'Proverbs', 'Ecclesiastes', 'Song of Solomon', 'Isaiah', 'Jeremiah', 'Lamentations', 'Ezekiel', 'Daniel', 'Hosea', 'Joel', 'Amos', 'Obadiah', 'Jonah', 'Micah', 'Nahum', 'Habakkuk', 'Zephaniah', 'Haggai', 'Zechariah', 'Malachi', 'Matthew', 'Mark', 'Luke', 'John', 'Acts', 'Romans', 'I Corinthians', 'II Corinthians', 'Galatians', 'Ephesians', 'Philippians', 'Colossians', 'I Thessalonians', 'II Thessalonians', 'I Timothy', 'II Timothy', 'Titus', 'Philemon', 'Hebrews', 'James', 'I Peter', 'II Peter', 'I John', 'II John', 'III John', 'Jude', 'Revelation of John'];
const RUSSIAN = ['Быт', 'Исх', 'Лев', 'Чис', 'Втор', 'Нав', 'Суд', 'Руф', '1Цар', '2Цар', '3Цар', '4Цар', '1Пар', '2Пар', 'Ездр', 'Неем', 'Есф', 'Иов', 'Пс', 'Притч', 'Еккл', 'Песн', 'Ис', 'Иер', 'Плач', 'Иез', 'Дан', 'Ос', 'Иоил', 'Ам', 'Авд', 'Ион', 'Мих', 'Наум', 'Авв', 'Соф', 'Агг', 'Зах', 'Мал', 'Мф', 'Мк', 'Лк', 'Ин', 'Деян', 'Рим', '1Кор', '2Кор', 'Гал', 'Еф', 'Флп', 'Кол', '1Фес', '2Фес', '1Тим', '2Тим', 'Тит', 'Флм', 'Евр', 'Иак', '1Пет', '2Пет', '1Ин', '2Ин', '3Ин', 'Иуд', 'Откр'];

async function editionText() {
  const given = args.includes('--text') ? args[args.indexOf('--text') + 1] : null;
  const cached = given || path.join(os.tmpdir(), 'bible-geography-RusSynodal.csv');
  if (!fs.existsSync(cached)) {
    const response = await fetch(EDITION.url);
    if (!response.ok) throw new Error(`${EDITION.id}: HTTP ${response.status}`);
    fs.writeFileSync(cached, Buffer.from(await response.arrayBuffer()));
  }
  const body = fs.readFileSync(cached);
  const sha256 = crypto.createHash('sha256').update(body).digest('hex');
  if (sha256 !== EDITION.sha256) throw new Error(`${EDITION.id}: sha256 ${sha256}, ожидался ${EDITION.sha256}`);
  return body.toString('utf8');
}

/** CSV «Book,Chapter,Verse,Text» с кавычками → { 'Быт 12:6': текст }. */
export function parseEdition(csv) {
  const book = Object.fromEntries(ENGLISH.map((name, i) => [name, RUSSIAN[i]]));
  const verses = {};
  let i = csv.indexOf('\n') + 1;
  while (i < csv.length) {
    const row = [];
    for (;;) {
      let field = '';
      if (csv[i] === '"') {
        i += 1;
        for (;;) {
          if (csv[i] === '"' && csv[i + 1] === '"') { field += '"'; i += 2; } else if (csv[i] === '"') { i += 1; break; } else field += csv[i++];
        }
      } else {
        while (i < csv.length && csv[i] !== ',' && csv[i] !== '\n') field += csv[i++];
      }
      row.push(field);
      if (csv[i] === ',') { i += 1; continue; }
      i += 1;
      break;
    }
    if (row.length >= 4 && book[row[0]]) verses[`${book[row[0]]} ${row[1]}:${row[2]}`] = row[3].replace(/\s+/g, ' ').trim();
  }
  return verses;
}

/** Типографика издания → типографика приложения: тире, дефисы в именах, курсивные вставки. */
export const tidy = (text) => text.replace(/\[([^\]]*)\]/g, '$1').replace(/\s+[–—-]\s+/g, ' — ')
  .replace(/(\p{L})[–—](\p{L})/gu, '$1-$2').replace(/\s+/g, ' ').trim();

const parseRef = (ref) => {
  const m = String(ref).match(/^(.+?) ?(\d+):(\d+)(?:–(\d+))?$/u);
  if (!m) throw new Error(`Не разобрать ссылку «${ref}»`);
  return { book: m[1].replace(' ', ''), ch: Number(m[2]), v: Number(m[3]), end: m[4] ? Number(m[4]) : null };
};
const showBook = (book) => book.replace(/^(\d)/, '$1 ');

export function buildData(verses) {
  const problems = [];
  // Для каждой связи — где в главе стоит стих: по этим отметкам сборщик
  // переводов находит тот же стих в английской, немецкой и испанской Библии.
  const anchors = [];
  const place = new Map(PLACES.map((p) => [p.id, p]));
  const hero = new Map(HEROES.map((h) => [h.id, h]));
  const get = (book, ch, v) => verses[`${book} ${ch}:${v}`];
  const near = (book, ch, v, re, width) => {
    for (let d = 0; d <= width; d += 1) {
      for (const s of d ? [-d, d] : [0]) {
        const text = get(book, ch, v + s);
        if (text && re.test(text)) return s;
      }
    }
    return null;
  };

  if (place.size !== PLACES.length) problems.push('повторяется id места');
  if (hero.size !== HEROES.length) problems.push('повторяется id героя');

  const heroes = HEROES.map((h) => {
    const nameRe = new RegExp(h.h, 'u');
    if (h.follows && !hero.has(h.follows)) problems.push(`${h.id}: follows → нет героя ${h.follows}`);
    for (const id of h.also || []) if (!place.has(id)) problems.push(`${h.id}: also → нет места ${id}`);
    for (const step of h.route || []) if (typeof step === 'string' && !place.has(step)) problems.push(`${h.id}: route → нет места ${step}`);
    const linked = new Set();
    const stops = h.stops.map((s) => {
      const p = place.get(s.p);
      if (!p) { problems.push(`${h.id}: нет места ${s.p}`); return null; }
      if ((h.also || []).includes(s.p)) problems.push(`${h.id}: ${s.p} и в stops, и в also`);
      linked.add(s.p);
      const placeRe = new RegExp(p.m, 'u');
      const { book, ch, v, end } = parseRef(s.r);
      if (!get(book, ch, v)) { problems.push(`${h.id} → ${s.p}: нет стиха ${s.r}`); return null; }
      let from = v; let to = end || v;
      if (s.ctx) {
        const c = parseRef(s.ctx);
        if (c.book !== book || c.ch !== ch || Math.abs(c.v - v) > 10) problems.push(`${h.id} → ${s.p}: контекст ${s.ctx} далеко от ${s.r}`);
        if (!placeRe.test(get(c.book, c.ch, c.v) || '')) problems.push(`${h.id} → ${s.p}: в ${s.ctx} место не названо`);
      } else {
        const d = near(book, ch, v, placeRe, 2);
        if (d === null) { problems.push(`${h.id} → ${s.p}: в ${s.r} и рядом место не названо`); return null; }
        from = Math.min(from, v + d); to = Math.max(to, v + d);
      }
      if (!(h.self || s.self) && near(book, ch, v, nameRe, 10) === null) problems.push(`${h.id} → ${s.p}: рядом с ${s.r} нет имени героя`);
      let quote = '';
      for (let i = from; i <= to; i += 1) quote += `${quote ? ' ' : ''}${tidy(get(book, ch, i) || '')}`;
      if (quote.length > 300) {
        // Длинный стих режется по предложениям: остаются те, где названы место или герой.
        const parts = quote.split(/(?<=[.;:!?])\s+/);
        const keep = parts.filter((part) => placeRe.test(part) || nameRe.test(part));
        quote = (keep.length ? keep : parts.slice(0, 1)).join(' … ');
        if (quote.length > 300) {
          const pieces = quote.split(/(?<=,)\s+/);
          const at = Math.max(0, pieces.findIndex((piece) => placeRe.test(piece) || nameRe.test(piece)));
          const a = Math.max(0, at - 1); const b = Math.min(pieces.length, at + 2);
          quote = `${a > 0 ? '… ' : ''}${pieces.slice(a, b).join(' ').replace(/,$/, '')}${b < pieces.length ? ' …' : ''}`;
        }
      }
      const ref = `${showBook(book)} ${ch}:${from === to ? from : `${from}–${to}`}`;
      anchors.push({ hero: h.id, place: s.p, book, ch, from, to, ref, quote, ctx: Boolean(s.ctx) });
      return { p: s.p, r: ref, n: s.n, q: quote };
    }).filter(Boolean);
    const out = { id: h.id, name: h.name };
    for (const key of ['tag', 'aka', 'g', 'i18n']) if (h[key]) out[key] = h[key];
    Object.assign(out, { t: h.t, level: h.level, era: h.era, about: h.about });
    if (h.follows) out.follows = h.follows;
    out.stops = stops;
    if (h.also?.length) out.also = h.also;
    if (h.route) out.route = h.route;
    return out;
  });

  for (const j of JOURNEYS) {
    if (!hero.has(j.hero)) problems.push(`путешествие ${j.id}: нет героя ${j.hero}`);
    for (const step of j.path) if (typeof step === 'string' && !place.has(step)) problems.push(`путешествие ${j.id}: нет места ${step}`);
  }

  // Государства, о которых можно спросить «в какой стране». Спорные территории
  // и Иерусалим в такие вопросы не идут: игра про Библию, а не про границы.
  const STATES = new Set(['Ирак', 'Иран', 'Турция', 'Сирия', 'Ливан', 'Израиль', 'Иордания', 'Египет',
    'Саудовская Аравия', 'Кипр', 'Греция', 'Италия', 'Мальта']);
  const places = PLACES.map(({ m, ...rest }) => {
    // Море, река или область лежат сразу у нескольких стран — о них не спрашиваем.
    if (STATES.has(rest.country) && !['sea', 'river', 'region', 'desert'].includes(rest.kind)) rest.state = true;
    // Описание уже говорит «по преданию» или «место спорно» — второй раз не повторяем.
    if (rest.approx && /неизвест|предани|предполож|спорн|версии/.test(rest.site || '')) rest.noted = true;
    if (rest.lon < 10 || rest.lon > 50 || rest.lat < 25 || rest.lat > 43) problems.push(`${rest.id}: вне рамки карты`);
    if (rest.near && !place.has(rest.near)) problems.push(`${rest.id}: near → нет места ${rest.near}`);
    return rest;
  });

  return {
    problems,
    anchors,
    data: {
      note: 'Built by scripts/build-bible-geography.mjs from scripts/data/bible-geography-source.mjs.',
      edition: EDITION.id,
      places,
      heroes,
      journeys: JOURNEYS,
      labels: LABELS,
    },
  };
}

const norm = (word) => word.toUpperCase().replace(/Ё/g, 'Е');

/** Все словоформы издания — заглавными, «ё» как «е». */
function textTokens(verses) {
  const tokens = new Set();
  for (const text of Object.values(verses)) {
    for (const word of text.split(/[^\p{L}-]+/u)) {
      if (!word) continue;
      tokens.add(norm(word).replace(/-/g, ''));
      for (const part of word.split('-')) tokens.add(norm(part));
    }
  }
  return tokens;
}

/** Слова имён и подписей, которых нет в тексте в начальной форме, и их формы из текста. */
export function findWitnesses(verses) {
  const tokens = textTokens(verses);
  const names = [
    ...PLACES.flatMap((p) => [p.name, p.aka]), ...HEROES.flatMap((h) => [h.name, h.aka, h.tag]),
    ...LABELS.ancient.map((label) => label.n),
    ...Object.values(LABELS.rivers).map((river) => river.ancient),
  ].filter(Boolean);
  const witness = {};
  const missing = [];
  for (const name of names) {
    for (const raw of name.split(/[\s,]+/)) {
      const word = norm(raw).replace(/-/g, '');
      if (word.length < 3 || tokens.has(word)) continue;
      // Свидетель — форма с самым длинным общим началом: «Верия» → «Верию»,
      // а не «Верак», с которым у неё общее только «Вер».
      const common = (t) => { let k = 0; while (k < t.length && t[k] === word[k]) k += 1; return k; };
      const form = [...tokens].filter((t) => !t.includes('-') && t.length <= word.length + 3 && common(t) >= Math.max(3, word.length - 2))
        .sort((x, y) => common(y) - common(x) || Math.abs(x.length - word.length) - Math.abs(y.length - word.length) || x.localeCompare(y))[0];
      if (form) witness[word] = form; else missing.push(raw);
    }
  }
  return { witness, missing };
}

/*
  Слова цитат, которых нет в общем словаре словоформ
  (scripts/data/bible-synodal-forms.json). Он собран из двух других изданий
  синодального текста, и оба опускают то, что синодальный перевод даёт в
  квадратных скобках, — дополнения по Септуагинте («и уверились во всём Израиле»,
  1 Цар 3:21) и пояснительные слова («им [пастухам]», Быт 29:4). Такие слова
  сверяются здесь с закреплённым изданием и записываются списком: проверка без
  сети принимает их только по нему.
*/
export function quoteOnlyWords(data, verses, forms) {
  const tokens = textTokens(verses);
  const extra = new Set();
  const missing = [];
  for (const hero of data.heroes) {
    for (const stop of hero.stops) {
      for (const raw of stop.q.split(/[^\p{L}]+/u)) {
        const word = norm(raw);
        if (word.length < 3 || forms.has(word)) continue;
        if (tokens.has(word)) extra.add(word); else missing.push(`${hero.id} → ${stop.p}: «${raw}»`);
      }
    }
  }
  return { extra: [...extra].sort((a, b) => a.localeCompare(b)), missing };
}

// --- стихи на других языках ------------------------------------------------------
//
// Приложение переведено на английский, немецкий и испанский, и сборка переводов
// не пропускает в игру ни одной русской строки. Стих под связью на другом языке
// должен быть стихом, а не машинным пересказом синодального, поэтому он берётся из
// классического перевода, вышедшего из-под авторского права: King James (1769),
// Эльберфельдер (1905), Рейна-Валера (1909).
//
// Нумерация у этих Библий своя: синодальный 1 Цар 24:1 — это 1 Sam 23:29 в KJV,
// Пс 62:1 — Ps 63:1. Поэтому стих ищется, а не берётся по тому же номеру: в той
// же главе и соседних кандидаты оцениваются по тому, названы ли в них место и
// герой (по переводу их имён из словаря), и по удалённости от синодального номера.
export const TARGETS = [
  {
    lang: 'en', id: 'scrollmapper/bible_databases KJVPCE',
    url: 'https://raw.githubusercontent.com/scrollmapper/bible_databases/master/formats/csv/KJVPCE.csv',
    sha256: '8254e57c6d97bedc04fb8eccd420b012fbad13420f39f821c837c741d2888d22',
    books: { 'Быт': 'Gen', 'Исх': 'Exod', 'Чис': 'Num', 'Втор': 'Deut', 'Нав': 'Josh', 'Суд': 'Judg', 'Руф': 'Ruth', '1Цар': '1 Sam', '2Цар': '2 Sam', '3Цар': '1 Kgs', '4Цар': '2 Kgs', '2Пар': '2 Chr', 'Ездр': 'Ezra', 'Неем': 'Neh', 'Есф': 'Esth', 'Пс': 'Ps', 'Ис': 'Isa', 'Иер': 'Jer', 'Иез': 'Ezek', 'Дан': 'Dan', 'Ион': 'Jonah', 'Мф': 'Matt', 'Мк': 'Mark', 'Лк': 'Luke', 'Ин': 'John', 'Деян': 'Acts', 'Гал': 'Gal', '1Фес': '1 Thess', '1Тим': '1 Tim', 'Тит': 'Titus', 'Откр': 'Rev' },
  },
  {
    lang: 'de', id: 'scrollmapper/bible_databases GerElb1905',
    url: 'https://raw.githubusercontent.com/scrollmapper/bible_databases/master/formats/csv/GerElb1905.csv',
    sha256: '2f02b6232c57e9fbe95d4e0b8975ef8aa932afebad4e99e2e1a7413172b2abc1',
    books: { 'Быт': '1. Mose', 'Исх': '2. Mose', 'Чис': '4. Mose', 'Втор': '5. Mose', 'Нав': 'Josua', 'Суд': 'Richter', 'Руф': 'Rut', '1Цар': '1. Samuel', '2Цар': '2. Samuel', '3Цар': '1. Könige', '4Цар': '2. Könige', '2Пар': '2. Chronik', 'Ездр': 'Esra', 'Неем': 'Nehemia', 'Есф': 'Ester', 'Пс': 'Psalm', 'Ис': 'Jesaja', 'Иер': 'Jeremia', 'Иез': 'Hesekiel', 'Дан': 'Daniel', 'Ион': 'Jona', 'Мф': 'Matthäus', 'Мк': 'Markus', 'Лк': 'Lukas', 'Ин': 'Johannes', 'Деян': 'Apg.', 'Гал': 'Galater', '1Фес': '1. Thess.', '1Тим': '1. Tim.', 'Тит': 'Titus', 'Откр': 'Offb.' },
  },
  {
    lang: 'es', id: 'scrollmapper/bible_databases SpaRV (Reina-Valera 1909)',
    url: 'https://raw.githubusercontent.com/scrollmapper/bible_databases/master/formats/csv/SpaRV.csv',
    sha256: '6ca96e217785af0e0d767f406414fee1f313eb0f6a03af3d0b92c49fada0d6f3',
    books: { 'Быт': 'Gén.', 'Исх': 'Éx.', 'Чис': 'Núm.', 'Втор': 'Dt.', 'Нав': 'Jos.', 'Суд': 'Jue.', 'Руф': 'Rut', '1Цар': '1 S.', '2Цар': '2 S.', '3Цар': '1 R.', '4Цар': '2 R.', '2Пар': '2 Cr.', 'Ездр': 'Esd.', 'Неем': 'Neh.', 'Есф': 'Est.', 'Пс': 'Sal.', 'Ис': 'Is.', 'Иер': 'Jer.', 'Иез': 'Ez.', 'Дан': 'Dn.', 'Ион': 'Jon.', 'Мф': 'Mt.', 'Мк': 'Mr.', 'Лк': 'Lc.', 'Ин': 'Jn.', 'Деян': 'Hch.', 'Гал': 'Gá.', '1Фес': '1 Ts.', '1Тим': '1 Ti.', 'Тит': 'Tit.', 'Откр': 'Ap.' },
  },
];

async function targetText(target) {
  const cached = path.join(os.tmpdir(), `bible-geography-${target.lang}.csv`);
  if (!fs.existsSync(cached)) {
    const response = await fetch(target.url);
    if (!response.ok) throw new Error(`${target.id}: HTTP ${response.status}`);
    fs.writeFileSync(cached, Buffer.from(await response.arrayBuffer()));
  }
  const body = fs.readFileSync(cached);
  const sha256 = crypto.createHash('sha256').update(body).digest('hex');
  if (sha256 !== target.sha256) throw new Error(`${target.id}: sha256 ${sha256}, ожидался ${target.sha256}`);
  return body.toString('utf8');
}

/** Пометки издания: «¶» абзаца в KJV, «(H24:1)» еврейской нумерации у Эльберфельдера. */
const tidyTarget = (text) => text.replace(/¶\s*/g, '').replace(/\(H\d+:\d+\)\s*/g, '').replace(/\s+/g, ' ').trim();
const plain = (text) => text.replace(/æ/g, 'ae').replace(/Æ/g, 'Ae').replace(/œ/g, 'oe')
  .normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

/*
  Где нумерация расходится не на стих, а на главу. Синодальная Псалтирь идёт
  по греческому счёту, и её 62-й псалом у всех трёх переводов — 63-й.
*/
const CHAPTER_SHIFT = { 'Пс': { 62: 63 } };

/*
  Как старые переводы пишут имена иначе, чем словарь приложения: «Babel» вместо
  «Babylon» у Эльберфельдера, «Shushan» вместо «Susa» у King James. Нужно только
  для поиска стиха, на экране остаётся имя из словаря.
*/
const SPELLINGS = {
  en: ['shushan', 'beth', 'beer', 'chebar', 'judah', 'judaea', 'caesar', 'cana', 'jope', 'charr', 'sichem'],
  de: ['babel', 'jisreel', 'sunem', 'bethsaida', 'bethanien', 'asdod', 'anathoth', 'japho', 'gath', 'dothan', 'zarpath', 'sarpat'],
  es: ['bethlehem', 'bethsaida', 'bethania', 'gethsemani', 'emmaus', 'lydda', 'joppe', 'anathoth', 'taphnes', 'chebar', 'lachis', 'megiddo', 'meguido', 'sichar', 'beth-el', 'beth'],
};

/** Основы имени для поиска: по четыре буквы от каждого слова длиннее трёх. */
function stems(...names) {
  const skip = new Set(['mount', 'river', 'land', 'berg', 'fluss', 'monte', 'tierra', 'wilderness', 'desierto', 'wuste', 'valley', 'valle', 'meer', 'city', 'gebirge', 'montes', 'mountains', 'stadt']);
  const out = new Set();
  for (const name of names.filter(Boolean)) {
    for (const word of plain(name).split(/[^\p{L}]+/u)) {
      if (word.length < 4 || skip.has(word)) continue;
      out.add(word.slice(0, 4));
    }
  }
  return [...out];
}

export function translateQuotes(anchors, targetVerses, dictionaries) {
  const rows = new Map();
  const problems = [];
  const place = new Map(PLACES.map((p) => [p.id, p]));
  const hero = new Map(HEROES.map((h) => [h.id, h]));
  for (const anchor of anchors) {
    const perLang = {};
    const refs = {};
    let english = null;
    for (const target of TARGETS) {
      const verses = targetVerses[target.lang];
      const dict = dictionaries[target.lang];
      const p = place.get(anchor.place);
      const h = hero.get(anchor.hero);
      const name = (field, owner) => owner.i18n?.[field]?.[target.lang] || dict[owner[field]] || '';
      const own = stems(name('name', p), name('aka', p));
      const placeStems = [...own, ...SPELLINGS[target.lang].filter((variant) => own.some((stem) => variant.startsWith(stem.slice(0, 3))))];
      const heroStems = stems(name('name', h), name('aka', h));
      const words = (text) => plain(text).split(/[^\p{L}]+/u);
      const has = (text, list) => list.length > 0 && words(text).some((word) => list.some((stem) => word.startsWith(stem)));
      const span = anchor.to - anchor.from;
      const read = (ch, v) => Array.from({ length: span + 1 }, (_, i) => verses[`${anchor.book} ${ch}:${v + i}`] || '').join(' ').trim();
      const ch0 = CHAPTER_SHIFT[anchor.book]?.[anchor.ch] || anchor.ch;
      const hit = (ch, v) => {
        const text = read(ch, v);
        return text && (anchor.ctx ? has(text, heroStems) : has(text, placeStems));
      };
      // Кандидаты по порядку доверия: тот же номер; номер, найденный для KJV;
      // соседние стихи той же главы; край соседних глав.
      const candidates = [[ch0, anchor.from]];
      if (english) candidates.push(english);
      for (const d of [1, -1, 2, -2, 3, -3]) candidates.push([ch0, anchor.from + d]);
      const last = (ch) => { let v = 0; while (verses[`${anchor.book} ${ch}:${v + 1}`] !== undefined) v += 1; return v; };
      const prev = last(ch0 - 1);
      for (let i = 0; i < 3 && prev - i > 0; i += 1) candidates.push([ch0 - 1, prev - i]);
      for (let v = 1; v <= 3; v += 1) candidates.push([ch0 + 1, v]);
      let chosen = candidates.find(([ch, v]) => hit(ch, v));
      const matched = Boolean(chosen);
      if (!chosen) chosen = english || [ch0, anchor.from];
      if (!read(...chosen)) { problems.push(`${target.lang}: нет стиха для ${anchor.ref}`); continue; }
      if (target.lang === 'en' && matched) english = chosen;
      if (!matched) problems.push(`${target.lang}: ${anchor.ref} → ${chosen[0]}:${chosen[1]} без «${name('name', p)}»: ${read(...chosen).slice(0, 110)}`);
      let quote = tidyTarget(read(...chosen));
      // Перевод стиха бывает втрое длиннее синодального (у KJV надписание
      // псалма слито с первым стихом). Длинное режется по предложениям: остаются
      // те, где названы место или герой.
      if (quote.length > Math.max(320, anchor.quote.length * 2.2)) {
        const parts = quote.split(/(?<=[.;:!?])\s+/);
        const keep = parts.filter((part) => has(part, placeStems) || has(part, heroStems));
        quote = (keep.length ? keep : parts.slice(0, 1)).join(' … ');
      }
      const end = chosen[1] + span;
      perLang[target.lang] = quote;
      refs[target.lang] = `${target.books[anchor.book]} ${chosen[0]}:${chosen[1] === end ? chosen[1] : `${chosen[1]}–${end}`}`;
    }
    if (Object.keys(perLang).length !== TARGETS.length) continue;
    rows.set(anchor.quote, TARGETS.map((target) => perLang[target.lang]));
    rows.set(anchor.ref, TARGETS.map((target) => refs[target.lang]));
  }
  return { rows, problems };
}

if (process.argv[1] === import.meta.filename) {
  const verses = parseEdition(await editionText());
  const { problems, data, anchors } = buildData(verses);
  const { witness, missing } = findWitnesses(verses);
  for (const word of missing) problems.push(`слова «${word}» нет в синодальном тексте ни в какой форме`);
  const forms = new Set(JSON.parse(fs.readFileSync(path.join(root, 'scripts/data/bible-synodal-forms.json'), 'utf8')));
  const quoteWords = quoteOnlyWords(data, verses, forms);
  for (const line of quoteWords.missing) problems.push(`слова цитаты нет в издании: ${line}`);
  if (problems.length) {
    console.error(`Данные не сошлись с текстом:\n  ${problems.join('\n  ')}`);
    process.exit(1);
  }
  fs.writeFileSync(output, `${JSON.stringify(data)}\n`);
  const sorted = Object.fromEntries(Object.entries(witness).sort(([a], [b]) => a.localeCompare(b)));
  fs.writeFileSync(witnessFile, `${JSON.stringify({
    note: 'witness — слова имён и подписей «Библейской географии», которых нет в синодальном тексте в начальной форме; значение — форма из текста. quoteOnly — слова цитат, которых нет в scripts/data/bible-synodal-forms.json: другие издания опускают текст в квадратных скобках. Собирается scripts/build-bible-geography.mjs, проверяется scripts/check-bible-geography.mjs.',
    witness: sorted,
    quoteOnly: quoteWords.extra,
  }, null, 2)}\n`);
  // Стихи и ссылки трёх языков — отдельным словарём рядом с остальными переводами.
  const { readTranslations } = await import('./i18n-utils.mjs');
  const dictionaries = readTranslations(root);
  const targetVerses = {};
  for (const target of TARGETS) targetVerses[target.lang] = parseEdition(await targetText(target));
  const { rows, problems: quoteProblems } = translateQuotes(anchors, targetVerses, dictionaries);
  // Чаще всего это другое написание имени в старом переводе (Jisreel, Shushan):
  // стих тот же, просто поиск по имени его не опознал. Список — по --verbose.
  if (args.includes('--verbose')) for (const line of quoteProblems) console.warn(`  стих: ${line}`);
  else if (quoteProblems.length) console.warn(`  стихов, взятых по номеру без опознанного имени: ${quoteProblems.length} (подробно: --verbose)`);
  const tsv = [...rows].map(([source, values]) => [source, ...values].map((cell) => cell.replace(/\t/g, ' ')).join('\t'));
  fs.writeFileSync(path.join(root, 'scripts/i18n/geography-quotes.tsv'),
    `# Собрано scripts/build-bible-geography.mjs: стихи «Библейской географии» из KJV (1769), Эльберфельдера (1905) и Рейна-Валера (1909). Не править руками.\n${tsv.join('\n')}\n`);
  const links = data.heroes.reduce((sum, h) => sum + h.stops.length, 0);
  console.log(`Bible geography: ${data.heroes.length} героев, ${data.places.length} мест, ${links} связей, ${(fs.statSync(output).size / 1024).toFixed(1)} KB.`);
}
