// Проверяет, что слова всех словесных игр взяты из синодального перевода.
//
//   node scripts/check-bible-words.mjs           проверить
//   node scripts/check-bible-words.mjs --report  ещё и перечислить источники
//
// Зачем. Владелец попросил: «все основные слова и бонусные должны быть в Библии
// именно синодального перевода и не в каких других переводах». Просьба не
// придирка: в списках лежали «Дьявол», «Есав», «Ерихон», «Васти», «Мелха»,
// «Назарей», «Олива», «Колодец» — все восемь из других переводов, а синодальный
// пишет «диавол», «Исав», «Иерихон», «Астинь», «Милка», «назорей», «маслина»,
// «колодезь». Рядом с ними жили слова, которых в Библии нет вовсе: «армия»,
// «фундамент», «шторм», «чертополох», «сани», «сито», «трон».
//
// Правило одно и проверяется машиной: слово принимается, если оно само или его
// форма-свидетель встречается в scripts/data/bible-synodal-forms.json — полном
// наборе словоформ двух независимых изданий синодального текста.
//
// Чего проверка не умеет. Свидетеля выбирает человек и сверяет по стиху:
// доказать строкой, что «АРФА» и «АРФЫ» — одно слово, а «МУЧЕНИК» и «МУЧЕНИЕ»
// — разные, нельзя. Здесь стоит грубое условие: свидетель обязан начинаться с
// той же основы. Оно ловит описку и промах при копировании, но не подмену
// родственным словом. За это отвечает тот, кто правит список свидетелей.
//
// Слова короче трёх букв пропускаются: словарь словоформ собран с тем же
// порогом, и предлог «в» из «Храма Соломона (в Иерусалиме)» не в счёт.

import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const report = process.argv.includes('--report');
const read = (rel) => JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8'));

const forms = new Set(read('scripts/data/bible-synodal-forms.json'));
const witnesses = read('scripts/data/bible-word-witnesses.json').witness;

const norm = (value) => String(value || '').toUpperCase().replace(/Ё/g, 'Е').replace(/[^А-Я]/g, '');
const MIN_LENGTH = 3;

const sources = {
  'Алиас · лёгкий': read('web/data/easy_bible_words.json'),
  'Алиас · средний': read('web/data/medium_bible_words.json'),
  'Алиас · трудный': read('web/data/hard_bible_words.json'),
  'Библейские слова · основные': read('web/data/bible_wow_levels.json').levels.flatMap((level) => level.words),
  'Библейские слова · бонусные': read('web/data/bible_wow_levels.json').levels.flatMap((level) => level.bonus || []),
  'Найди слово': read('web/data/bible_wordsearch_levels.json').levels.flatMap((level) => level.wordsList),
  'Священные слова': read('web/data/sacred_words.json').map((entry) => entry.word),
  'Опиши, но не называй': read('web/data/describe_words.json'),
  'Соглядатай · локации': read('web/data/spy_locations.json'),
};

const failures = [];
const counts = [];

/*
  Свидетель обязан существовать в тексте и быть похож на своё слово: совпадать
  с ним всюду, кроме двух последних букв, и не быть длиннее больше чем на три —
  склонение столько и добавляет. «БОЙ» → «БОЮ» и «КОЛОДЕЦ» → «КОЛОДЕЗЬ» пройдут,
  «АРФА» → «АРФАКСАД» нет.

  Исключение — прилагательные от названий мест: синодальный перевод знает только
  «горы Араратские» и «яблоки гранатовые», и такой свидетель длиннее слова на
  сколько угодно, но обязан начинаться прямо с него.
*/
const ADJECTIVE = /(СК|ОВ|ЕВ)(ИЙ|ОЙ|АЯ|ОЕ|ЫЕ|ИЕ|ОГО|ЕГО|ОМУ|УЮ|ЫМ|ИМ|ИХ|ЫХ|ОМ|ЕЮ|ОЮ)$/;
for (const [word, witness] of Object.entries(witnesses)) {
  const form = norm(witness);
  if (!forms.has(form)) {
    failures.push(`свидетель «${witness}» для «${word}» не встречается в синодальном тексте`);
    continue;
  }
  if (ADJECTIVE.test(form) && form.startsWith(word)) continue;
  const stem = word.slice(0, Math.max(2, word.length - 2));
  if (!form.startsWith(stem) || form.length > word.length + 3) {
    failures.push(`свидетель «${witness}» расходится с «${word}» не только в окончании`);
  }
}

const unused = new Set(Object.keys(witnesses));

for (const [name, list] of Object.entries(sources)) {
  let checked = 0;
  for (const raw of list) {
    // Составные названия проверяются по каждому слову: «Море Галилейское» —
    // это «море» и «галилейское», и второе слово тоже обязано быть из текста.
    for (const word of String(raw).split(/[^А-Яа-яЁё]+/).map(norm).filter((item) => item.length >= MIN_LENGTH)) {
      checked += 1;
      unused.delete(word);
      if (forms.has(word)) continue;
      const witness = witnesses[word];
      if (witness && forms.has(norm(witness))) continue;
      failures.push(`${name}: «${raw}» — «${word}» не встречается в синодальном переводе `
        + '(добавьте форму-свидетель в scripts/data/bible-word-witnesses.json или замените слово)');
    }
  }
  counts.push(`${name}: ${checked}`);
}

// Свидетель без слова — след давней правки: слово заменили, а строку забыли.
for (const word of unused) failures.push(`свидетель для «${word}» больше никому не нужен — удалите строку`);

if (report) for (const row of counts) console.log(row);
if (failures.length) {
  console.error(`Слова словесных игр не прошли проверку (${failures.length}):\n- ${failures.join('\n- ')}`);
  process.exit(1);
}

const total = counts.reduce((sum, row) => sum + Number(row.split(': ')[1]), 0);
console.log(`OK: ${total} слов девяти списков — все из синодального перевода `
  + `(${Object.keys(witnesses).length} через форму-свидетеля).`);
