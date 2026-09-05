/* Загрузка сборников и сквозной поиск сразу по всем из них. */

const BASE = 'data/';

let index = null;                 // метаданные + заголовки для мгновенного старта
const corpus = new Map();         // id сборника → массив песен с текстом
let docs = [];                    // плоский корпус для поиска
let corpusPromise = null;

export const collections = () => (index ? index.collections : []);
export const collectionById = (id) => collections().find((item) => item.id === id) || null;

export function titlesOf(id) {
  if (!index) return [];
  const entry = index.songs.find((item) => item.c === id);
  return entry ? entry.items : [];
}

export function totalCount() {
  return collections().reduce((sum, item) => sum + item.count, 0);
}

export async function loadIndex() {
  if (index) return index;
  const response = await fetch(BASE + 'index.json');
  index = await response.json();
  return index;
}

export function corpusReady() {
  return docs.length > 0;
}

export async function loadCorpus() {
  if (corpusPromise) return corpusPromise;
  corpusPromise = (async () => {
    await loadIndex();
    const loaded = await Promise.all(collections().map(async (meta) => {
      const response = await fetch(`${BASE}songs-${meta.id}.json`);
      const payload = await response.json();
      corpus.set(meta.id, payload.songs);
      return { id: meta.id, songs: payload.songs };
    }));
    docs = [];
    for (const part of loaded) {
      for (const song of part.songs) {
        const plain = song.b.map((block) => block.l.join('\n')).join('\n');
        docs.push({
          c: part.id,
          n: song.n,
          t: song.t,
          plain,
          norm: fold(plain),
          titleNorm: fold(song.t),
        });
      }
    }
    return docs;
  })();
  return corpusPromise;
}

export function songOf(collectionId, number) {
  const list = corpus.get(collectionId);
  if (!list) return null;
  return list.find((song) => song.n === number) || null;
}

export function neighboursOf(collectionId, number) {
  const list = corpus.get(collectionId) || [];
  const at = list.findIndex((song) => song.n === number);
  return {
    prev: at > 0 ? list[at - 1] : null,
    next: at >= 0 && at < list.length - 1 ? list[at + 1] : null,
  };
}

export function randomSong() {
  const all = collections();
  if (!all.length) return null;
  const meta = all[Math.floor(Math.random() * all.length)];
  const items = titlesOf(meta.id);
  if (!items.length) return null;
  const item = items[Math.floor(Math.random() * items.length)];
  return { c: meta.id, n: item[0], t: item[1] };
}

/* --- Нормализация ------------------------------------------------------- */

/* Приводит текст к виду для поиска, сохраняя длину строки: позиции символов
   в свёрнутой и исходной строке совпадают, поэтому подсветка не «уезжает». */
export function fold(value) {
  return value.toLowerCase().replace(/ё/g, 'е');
}

const LAYOUT = {
  q: 'й', w: 'ц', e: 'у', r: 'к', t: 'е', y: 'н', u: 'г', i: 'ш', o: 'щ', p: 'з',
  '[': 'х', ']': 'ъ', a: 'ф', s: 'ы', d: 'в', f: 'а', g: 'п', h: 'р', j: 'о',
  k: 'л', l: 'д', ';': 'ж', "'": 'э', z: 'я', x: 'ч', c: 'с', v: 'м', b: 'и',
  n: 'т', m: 'ь', ',': 'б', '.': 'ю',
};

const PHONETIC = [
  ['shch', 'щ'], ['sch', 'щ'], ['yo', 'ё'], ['zh', 'ж'], ['kh', 'х'], ['ch', 'ч'],
  ['sh', 'ш'], ['ts', 'ц'], ['yu', 'ю'], ['ya', 'я'], ['ye', 'е'],
  ['a', 'а'], ['b', 'б'], ['v', 'в'], ['g', 'г'], ['d', 'д'], ['e', 'е'], ['z', 'з'],
  ['i', 'и'], ['j', 'й'], ['y', 'ы'], ['k', 'к'], ['l', 'л'], ['m', 'м'], ['n', 'н'],
  ['o', 'о'], ['p', 'п'], ['r', 'р'], ['s', 'с'], ['t', 'т'], ['u', 'у'], ['f', 'ф'],
  ['h', 'х'], ['c', 'ц'], ['w', 'в'], ['x', 'кс'],
];

function byLayout(value) {
  let out = '';
  for (const ch of value) out += LAYOUT[ch] || ch;
  return out;
}

function byPhonetics(value) {
  let rest = value;
  let out = '';
  outer: while (rest.length) {
    for (const [latin, cyrillic] of PHONETIC) {
      if (rest.startsWith(latin)) {
        out += cyrillic;
        rest = rest.slice(latin.length);
        continue outer;
      }
    }
    out += rest[0];
    rest = rest.slice(1);
  }
  return out;
}

/* Варианты запроса: как введён, а также две раскладки для латиницы. */
export function queryVariants(query) {
  const base = fold(query.trim());
  if (!base) return [];
  const variants = [base];
  if (/[a-z]/.test(base)) {
    const layout = byLayout(base);
    const phonetic = byPhonetics(base);
    if (layout !== base) variants.push(layout);
    if (phonetic !== base && phonetic !== layout) variants.push(phonetic);
  }
  return variants;
}

/* --- Поиск -------------------------------------------------------------- */

const WORD_BOUNDARY = /[\s.,;:!?«»"'()\-–—/\\[\]{}]/;

function isBoundary(text, at) {
  return at <= 0 || WORD_BOUNDARY.test(text[at - 1]);
}

function findAll(haystack, needle, limit) {
  const hits = [];
  let at = haystack.indexOf(needle);
  while (at !== -1 && hits.length < (limit || 40)) {
    hits.push(at);
    at = haystack.indexOf(needle, at + needle.length);
  }
  return hits;
}

function scoreDoc(doc, terms, wholeQuery) {
  let score = 0;
  const positions = [];

  for (const term of terms) {
    const inTitle = doc.titleNorm.indexOf(term);
    const inBody = doc.norm.indexOf(term);
    if (inTitle === -1 && inBody === -1) return null;

    if (inTitle !== -1) {
      score += 60;
      if (inTitle === 0) score += 45;
      else if (isBoundary(doc.titleNorm, inTitle)) score += 22;
    }
    if (inBody !== -1) {
      score += 18;
      if (isBoundary(doc.norm, inBody)) score += 10;
      score += Math.max(0, 12 - Math.floor(inBody / 220));
      positions.push(inBody);
    }
  }

  if (wholeQuery.length > 2) {
    if (doc.titleNorm.indexOf(wholeQuery) !== -1) score += 70;
    else if (doc.norm.indexOf(wholeQuery) !== -1) score += 26;
  }
  score += Math.max(0, 8 - doc.titleNorm.length / 12);
  return { score, at: positions.length ? Math.min.apply(null, positions) : 0 };
}

function mergeRanges(ranges) {
  if (!ranges.length) return [];
  const sorted = ranges.slice().sort((a, b) => a[0] - b[0]);
  const out = [sorted[0]];
  for (let i = 1; i < sorted.length; i += 1) {
    const last = out[out.length - 1];
    if (sorted[i][0] <= last[1]) last[1] = Math.max(last[1], sorted[i][1]);
    else out.push(sorted[i]);
  }
  return out;
}

function escapeHtml(value) {
  return value.replace(/[&<>"]/g, (ch) => (
    ch === '&' ? '&amp;' : ch === '<' ? '&lt;' : ch === '>' ? '&gt;' : '&quot;'
  ));
}

/* Подсвечивает вхождения в фрагменте исходного текста. */
export function highlight(source, folded, terms, from, to) {
  const ranges = [];
  for (const term of terms) {
    for (const at of findAll(folded, term, 30)) {
      if (at + term.length <= from || at >= to) continue;
      ranges.push([Math.max(at, from), Math.min(at + term.length, to)]);
    }
  }
  const merged = mergeRanges(ranges);
  let html = '';
  let cursor = from;
  for (const [start, end] of merged) {
    html += escapeHtml(source.slice(cursor, start));
    html += `<mark>${escapeHtml(source.slice(start, end))}</mark>`;
    cursor = end;
  }
  html += escapeHtml(source.slice(cursor, to));
  return html;
}

function makeSnippet(doc, terms, at) {
  const flat = doc.plain.replace(/\n/g, ' ');
  const folded = doc.norm.replace(/\n/g, ' ');
  let from = Math.max(0, at - 42);
  if (from > 0) {
    const space = flat.indexOf(' ', from);
    if (space !== -1 && space - from < 18) from = space + 1;
  }
  const to = Math.min(flat.length, from + 150);
  const body = highlight(flat, folded, terms, from, to);
  return (from > 0 ? '… ' : '') + body + (to < flat.length ? ' …' : '');
}

/**
 * Единый поиск по всем сборникам сразу.
 * Возвращает результаты, отсортированные по релевантности, и разбивку по сборникам.
 */
export function search(query, options) {
  const settings = options || {};
  const limit = settings.limit || 400;
  const trimmed = query.trim();
  if (!trimmed) return { items: [], counts: {}, total: 0, terms: [], usedVariant: '' };

  const variants = queryVariants(trimmed);
  let best = { items: [], counts: {}, total: 0, terms: [], usedVariant: '' };

  for (const variant of variants) {
    const terms = variant.split(/[^\p{L}\p{N}]+/u).filter((term) => term.length >= 2);
    const numberQuery = /^\d{1,4}$/.test(trimmed) ? Number(trimmed) : null;
    if (!terms.length && numberQuery == null) continue;

    const found = [];
    const counts = {};

    if (numberQuery != null) {
      for (const doc of docs) {
        if (doc.n !== numberQuery) continue;
        counts[doc.c] = (counts[doc.c] || 0) + 1;
        found.push({
          c: doc.c, n: doc.n, t: doc.t, score: 1000,
          titleHtml: escapeHtml(doc.t),
          snippet: escapeHtml(doc.plain.replace(/\n/g, ' ').slice(0, 120)) + ' …',
          exactNumber: true,
        });
      }
    }

    if (terms.length) {
      for (const doc of docs) {
        const scored = scoreDoc(doc, terms, variant);
        if (!scored) continue;
        counts[doc.c] = (counts[doc.c] || 0) + 1;
        found.push({
          c: doc.c,
          n: doc.n,
          t: doc.t,
          score: scored.score,
          titleHtml: highlight(doc.t, doc.titleNorm, terms, 0, doc.t.length),
          snippet: makeSnippet(doc, terms, scored.at),
        });
      }
    }

    found.sort((a, b) => (b.score - a.score) || (a.c === b.c ? a.n - b.n : 0));
    if (found.length > best.total) {
      best = {
        items: found.slice(0, limit),
        counts,
        total: found.length,
        terms,
        usedVariant: variant !== fold(trimmed) ? variant : '',
      };
    }
    if (best.total > 0 && variant === variants[0]) break;
  }

  return best;
}
