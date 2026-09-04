// Дописывает слова в «Алиас» и следит, чтобы все они были из Библии.
//
//   node scripts/build-alias-words.mjs           дописать слова в уровни
//   node scripts/build-alias-words.mjs --check   убедиться, что уровни не отстали
//
// По отзыву игрока: «можно больше слов добавить в алиас». Слова взяты только из
// синодального перевода — так просил владелец, и так же устроены бонусы в
// «Библейских словах»: словарь словоформ там уже собран и лежит рядом.
//
// Слово принимается, если оно само есть в этом словаре. Когда именительного
// падежа в тексте нет — а его нет у доброй половины: в Библии «верблюдов»,
// «Матфея», «Галилее», — рядом со словом стоит форма-свидетель, которая в
// словаре есть.
//
// Чего эта проверка не умеет. Свидетеля выбирал человек, и подтвердить строкой,
// что две формы — одно слово, нельзя. «Мученик» ловится на «МУЧЕНИЕ», «Назарей»
// — на «НАЗАРЕТ», «Поиск» — на «ПОИСТИНЕ»; все три ошибки настоящие, они
// всплыли при подборе, и ни одно правило по буквам их не отсекает, не выбросив
// заодно «Колодец» с его «КОЛОДЕЗЬ». Поэтому здесь стоит грубое условие —
// расходиться свидетель со словом может только в двух последних буквах, — и оно
// ловит описку и промах при копировании, но не подмену родственным словом. За
// это отвечает тот, кто правит список.
//
// Уровни сложности разные не по частоте слова, а по тому, кого о нём спрашивают:
// «Каин» и «Верблюд» — лёгкие, «Массифа» и «Плащаница» — средние, «Мелхиседек»
// и «Потрясание» — трудные. Разложены руками, файл данных на то и заведён.

import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const dataFile = path.join(root, 'scripts/data/alias-bible-words.json');
const dictFile = path.join(root, 'scripts/data/bible-wow-bible-words.json');
const levelFile = (level) => path.join(root, `web/data/${level}_bible_words.json`);

const check = process.argv.includes('--check');
const LEVELS = ['easy', 'medium', 'hard'];

const norm = (value) => String(value || '').toUpperCase().replace(/Ё/g, 'Е').replace(/[^А-Я]/g, '');
const dictionary = new Set(JSON.parse(fs.readFileSync(dictFile, 'utf8')).words);
const data = JSON.parse(fs.readFileSync(dataFile, 'utf8'));

const failures = [];
const additions = new Map(LEVELS.map((level) => [level, []]));
const claimed = new Set();

for (const level of LEVELS) {
  for (const entry of data.levels[level] || []) {
    const [word, witness] = Array.isArray(entry) ? entry : [entry, ''];
    const key = norm(word);
    if (!key) { failures.push(`пустое слово на уровне ${level}`); continue; }
    if (claimed.has(key)) { failures.push(`«${word}» добавлено дважды`); continue; }
    claimed.add(key);

    if (!witness) {
      if (!dictionary.has(key)) failures.push(`«${word}» не встречается в синодальном тексте`);
    } else {
      const form = norm(witness);
      const stem = key.slice(0, Math.max(2, key.length - 2));
      if (!dictionary.has(form)) failures.push(`форма «${witness}» для «${word}» не встречается в синодальном тексте`);
      else if (!form.startsWith(stem)) failures.push(`форма «${witness}» расходится с «${word}» не только в окончании`);
    }
    additions.get(level).push(word);
  }
}

if (failures.length) {
  console.error(`Слова «Алиаса» не прошли проверку:\n- ${failures.join('\n- ')}`);
  process.exit(1);
}

let stale = false;
const report = [];
for (const level of LEVELS) {
  const file = levelFile(level);
  const current = JSON.parse(fs.readFileSync(file, 'utf8'));
  const seen = new Set();
  const merged = [];
  // Прежние слова остаются на своих местах: их порядок — тоже содержание,
  // от простого к сложному внутри уровня. Отсеивается только повтор: одно и то
  // же слово в одном уровне выпадает дважды за игру, и это не задумка — так
  // лежали «Иосиф», «Верность», «Огонь», «Падение», «Тьма» и «Слава».
  for (const word of [...current, ...additions.get(level)]) {
    const key = norm(word);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(word);
  }
  const serialized = `${JSON.stringify(merged, null, 2)}\n`;
  if (serialized !== fs.readFileSync(file, 'utf8')) {
    stale = true;
    if (!check) fs.writeFileSync(file, serialized);
  }
  report.push(`${level} ${merged.length}`);
}

const summary = `${claimed.size} слов из Библии разложено по уровням (${report.join(', ')})`;

if (check && stale) {
  console.error('Слова «Алиаса» отстали от списка. Выполните "node scripts/build-alias-words.mjs" и закоммитьте результат.');
  process.exit(1);
}
console.log(check ? `Слова «Алиаса» на месте: ${summary}.` : `Слова «Алиаса» дописаны: ${summary}.`);
