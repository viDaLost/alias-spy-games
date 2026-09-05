// Собирает бонусные слова уровней «Библейских слов».
//
//   node scripts/build-bible-wow-bonus.mjs           переписать бонусы в уровнях
//   node scripts/build-bible-wow-bonus.mjs --check   убедиться, что бонусы не отстали
//   node scripts/build-bible-wow-bonus.mjs --refresh пересобрать словарь из текста
//                                                   Библии (нужна сеть)
//
// Зачем это вообще понадобилось. Игра принимает три вида набранного слова:
// основное слово уровня, бонусное — и всё остальное, на что отвечает «нет
// такого слова». Механика бонусов в игре была с самого начала, про неё написано
// в правилах, и за каждое слово она даёт по две звезды. Только список бонусов
// существовал на пяти уровнях из ста пятидесяти и состоял из двенадцати слов
// на всю игру. На остальных ста сорока пяти уровнях любое верное слово, кроме
// основных, игра отвергала — и справедливо получила за это отзыв.
//
// Что считается словом. Игра называется «Библейские слова», и человек в отзыве
// написал именно «хотя есть в Библии». Поэтому правило взято буквальное:
// принимается словоформа, встречающаяся в синодальном переводе. Это правило
// можно объяснить игроку одной строкой, чего не скажешь о произвольном списке
// русских слов.
//
// Издания два, и слово обязано найтись в обоих. Одного мало: в машинных
// изданиях попадаются склейки, и они устойчивы — «ВИЕРУСАЛИМ» встречается в
// первом издании четыре раза и прошло бы любой порог по частоте. Во втором
// издании его нет вовсе, как и «ИНЕ» из склеенного «и не». Сверка двух
// независимых наборов эти склейки убирает, а настоящие слова переживает.
//
// Порог по частоте — три вхождения в каждом издании. Он отсекает опечатки,
// уцелевшие после сверки, и почти не трогает живой словарь: слов, встреченных
// в Библии трижды, пятнадцать тысяч.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const root = path.resolve(import.meta.dirname, '..');
const levelsFile = path.join(root, 'web/data/bible_wow_levels.json');
const dictFile = path.join(root, 'scripts/data/bible-wow-bible-words.json');
// Все словоформы синодального текста — по ним проверяются слова всех игр.
const formsFile = path.join(root, 'scripts/data/bible-synodal-forms.json');

const check = process.argv.includes('--check');
const refresh = process.argv.includes('--refresh');

// Синодальный перевод 1876 года — общественное достояние. Издания закреплены по
// sha256: содержимое ветки однажды поменяется, и пересобранный словарь должен
// отличаться от проверенного заметно, а не молча.
const EDITIONS = [
  {
    id: 'thiagobodruk/bible',
    url: 'https://raw.githubusercontent.com/thiagobodruk/bible/master/json/ru_synodal.json',
    sha256: 'ac900cd6675e524f728edcf965646bbd9cf791506a67e24e78bb8c7ff4d7c923',
  },
  {
    id: 'seven1m/open-bibles',
    url: 'https://raw.githubusercontent.com/seven1m/open-bibles/master/rus-synodal.zefania.xml',
    sha256: '5ccd097980d85790d36525859cc9092ba7a31671dcdd46e4fa659f1d7fa57769',
  },
];

const MIN_FREQUENCY = 3;

// Слова из прежнего ручного списка, которые не проходят порог в три вхождения:
// «дно» встречается реже, а «стопа» и «село» есть только в других формах —
// «стопы» и «села». Все три верные, их когда-то выбрали руками, и терять их
// из-за смены правила незачем; их форму-свидетеля держит общий файл
// scripts/data/bible-word-witnesses.json.
const HANDPICKED = {
  1: ['ДНО'],
  4: ['СТОПА'],
  14: ['СЕЛО'],
};

const norm = (value) => String(value || '').toUpperCase().replace(/Ё/g, 'Е').replace(/[^А-Я]/g, '');

/** Мультимножество букв: из «ДРАНИО» слово можно сложить, только пока букв хватает. */
function letterBag(word) {
  const bag = new Map();
  for (const letter of word) bag.set(letter, (bag.get(letter) || 0) + 1);
  return bag;
}

function fitsInto(word, bag) {
  const left = new Map(bag);
  for (const letter of word) {
    const have = left.get(letter) || 0;
    if (!have) return false;
    left.set(letter, have - 1);
  }
  return true;
}

// --- словарь -------------------------------------------------------------------

async function download(edition) {
  const response = await fetch(edition.url);
  if (!response.ok) throw new Error(`${edition.id}: HTTP ${response.status}`);
  const body = Buffer.from(await response.arrayBuffer());
  const sha256 = crypto.createHash('sha256').update(body).digest('hex');
  if (sha256 !== edition.sha256) {
    throw new Error(`${edition.id}: sha256 ${sha256}, ожидался ${edition.sha256}`);
  }
  return body.toString('utf8');
}

/** Частоты словоформ длиной от трёх букв. Разметка и служебные поля отброшены. */
function countForms(text) {
  const counts = new Map();
  for (const form of text.replace(/<[^>]+>/g, ' ').toUpperCase().replace(/Ё/g, 'Е').split(/[^А-Я]+/)) {
    if (form.length < 3) continue;
    counts.set(form, (counts.get(form) || 0) + 1);
  }
  return counts;
}

async function buildDictionary(maxLength) {
  const counted = [];
  for (const edition of EDITIONS) {
    const text = await download(edition);
    counted.push(countForms(text));
    console.log(`${edition.id}: ${counted[counted.length - 1].size} словоформ`);
  }

  /*
    Второй файл — объединение изданий без порога частоты. Он отвечает на другой
    вопрос: не «годится ли слово в бонусы», а «есть ли оно в Библии вообще».
    Для проверки слов игр строгий список не годится дважды. Порог в три
    вхождения выбрасывает настоящие редкости — «воробьи» встречаются дважды, —
    а пересечение изданий выбрасывает то, что пропустило одно из них: слова
    «Армагеддон» нет в первом издании, хотя в Откровении оно есть.
  */
  const union = [...new Set([...counted[0].keys(), ...counted[1].keys()])].sort();
  fs.writeFileSync(formsFile, `${JSON.stringify(union)}\n`);
  console.log(`Формы синодального текста: ${union.length}, ${(fs.statSync(formsFile).size / 1024).toFixed(0)} КБ`);

  const [first, ...rest] = counted;
  const words = [...first]
    .filter(([word, count]) => count >= MIN_FREQUENCY
      && word.length <= maxLength
      && rest.every((other) => (other.get(word) || 0) >= MIN_FREQUENCY))
    .map(([word]) => word)
    .sort();
  return {
    note: 'Словоформы синодального перевода — общественное достояние. Файл собран '
      + 'scripts/build-bible-wow-bonus.mjs --refresh, руками не правится.',
    editions: EDITIONS.map(({ id, url, sha256 }) => ({ id, url, sha256 })),
    minFrequency: MIN_FREQUENCY,
    maxLength,
    words,
  };
}

// --- бонусы уровней -------------------------------------------------------------

function bonusFor(level, words) {
  const bag = letterBag(norm(level.letters));
  const target = new Set((level.words || []).map(norm));
  const picked = words.filter((word) => !target.has(word) && fitsInto(word, bag));
  const extra = (HANDPICKED[level.id] || []).map(norm).filter((word) => !target.has(word));
  return [...new Set([...picked, ...extra])].sort();
}

const levelsRaw = fs.readFileSync(levelsFile, 'utf8');
const levels = JSON.parse(levelsRaw);
const maxLength = Math.max(...levels.levels.map((level) => norm(level.letters).length));

if (refresh) {
  const dictionary = await buildDictionary(maxLength);
  // Пятнадцать тысяч слов в столбик — это триста килобайт и нечитаемый diff на
  // каждое обновление. Заголовок остаётся разбитым по строкам, список — одной.
  const body = JSON.stringify({ ...dictionary, words: '@@WORDS@@' }, null, 2)
    .replace('"@@WORDS@@"', JSON.stringify(dictionary.words));
  fs.writeFileSync(dictFile, `${body}\n`);
  console.log(`Словарь: ${dictionary.words.length} слов, ${(fs.statSync(dictFile).size / 1024).toFixed(1)} КБ`);
}

const dictionary = JSON.parse(fs.readFileSync(dictFile, 'utf8'));
if (dictionary.maxLength < maxLength) {
  throw new Error(`Словарь собран под ${dictionary.maxLength} букв, а на уровнях уже ${maxLength}: `
    + 'выполните node scripts/build-bible-wow-bonus.mjs --refresh');
}

const next = {
  ...levels,
  levels: levels.levels.map((level) => {
    const { bonusWords, bonus, ...rest } = level;
    return { ...rest, bonus: bonusFor(level, dictionary.words) };
  }),
};

// Бонусов сорок на уровень, и в столбик они раздувают файл вчетверо — со
// тридцати килобайт до полутораста. Файл лежит в кеше установки, поэтому список
// пишется одной строкой; остальное остаётся читаемым, как было.
const withPlaceholders = {
  ...next,
  levels: next.levels.map((level, index) => ({ ...level, bonus: `@@BONUS_${index}@@` })),
};
const serialized = `${next.levels.reduce(
  (text, level, index) => text.replace(`"@@BONUS_${index}@@"`, JSON.stringify(level.bonus)),
  JSON.stringify(withPlaceholders, null, 2),
)}\n`;
const counts = next.levels.map((level) => level.bonus.length);
const total = counts.reduce((sum, value) => sum + value, 0);
const summary = `${total} бонусных слов на ${next.levels.length} уровнях `
  + `(в среднем ${(total / next.levels.length).toFixed(1)}, минимум ${Math.min(...counts)}, максимум ${Math.max(...counts)})`;

if (check) {
  if (serialized !== levelsRaw) {
    console.error('web/data/bible_wow_levels.json отстал от словаря. Выполните '
      + '"node scripts/build-bible-wow-bonus.mjs" и закоммитьте результат.');
    process.exit(1);
  }
  console.log(`Бонусные слова на месте: ${summary}.`);
} else {
  fs.writeFileSync(levelsFile, serialized);
  console.log(`Бонусные слова собраны: ${summary}.`);
}
