// Дописывает слова в «Алиас» и следит, чтобы все они были из Библии.
//
//   node scripts/build-alias-words.mjs           дописать слова в уровни
//   node scripts/build-alias-words.mjs --check   убедиться, что уровни не отстали
//
// По отзыву игрока: «можно больше слов добавить в алиас». Слова взяты только из
// синодального перевода — так просил владелец, и так же устроены бонусы в
// «Библейских словах»: словарь словоформ там уже собран и лежит рядом.
//
// Что каждое слово есть в синодальном переводе, проверяет не этот файл, а
// scripts/check-bible-words.mjs — общая проверка всех девяти словесных списков
// приложения. Здесь остаётся только раскладка по уровням: два независимых
// списка свидетелей неминуемо разъехались бы, и один из них рано или поздно
// пропустил бы слово из чужого перевода.
//
// Уровни сложности разные не по частоте слова, а по тому, кого о нём спрашивают:
// «Каин» и «Верблюд» — лёгкие, «Массифа» и «Плащаница» — средние, «Мелхиседек»
// и «Потрясание» — трудные. Разложены руками, файл данных на то и заведён.

import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const dataFile = path.join(root, 'scripts/data/alias-bible-words.json');
const levelFile = (level) => path.join(root, `web/data/${level}_bible_words.json`);

const check = process.argv.includes('--check');
const LEVELS = ['easy', 'medium', 'hard'];

const norm = (value) => String(value || '').toUpperCase().replace(/Ё/g, 'Е').replace(/[^А-Я]/g, '');
const data = JSON.parse(fs.readFileSync(dataFile, 'utf8'));

const failures = [];
const additions = new Map(LEVELS.map((level) => [level, []]));
const claimed = new Set();

for (const level of LEVELS) {
  for (const word of data.levels[level] || []) {
    const key = norm(word);
    if (!key) { failures.push(`пустое слово на уровне ${level}`); continue; }
    if (claimed.has(key)) { failures.push(`«${word}» добавлено дважды`); continue; }
    claimed.add(key);
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
