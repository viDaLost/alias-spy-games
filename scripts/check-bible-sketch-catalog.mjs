// Каталог слов «Библейского художника»: состав, ссылки и согласие с клиентом.
//
// Список категорий существует дважды: у воркера в catalog.js и у клиента в
// bible-sketch.js — клиент рисует выбор категории до того, как узнает комнату,
// и спросить сервер ему негде. Два списка руками уже разъезжались, и заметить
// это можно было только по числу слов на карточке.
//
// Про сами слова здесь проверяется то, что проверяется машиной: у каждого есть
// ссылка на место в Библии, слова не повторяются, категория не пустеет. Куда
// слово отнести — вопрос смысла, и решается он руками: «рыба» лежала среди
// предметов, пока на это не указали в отзыве.

import fs from 'node:fs';
import { CATALOG, CATEGORY_META } from '../cloudflare/bible-sketch-worker/src/catalog.js';

const failures = [];
const check = (condition, message) => { if (!condition) failures.push(message); };

// Ссылка вида «Быт. 8:20», «1 Цар. 17:40», «Откр. 6:2».
const REFERENCE = /^([1-3] )?[А-ЯЁ][а-яё]+\.? \d+:\d+$/;
const MIN_WORDS = 24;

const seenLabels = new Map();
const seenIds = new Set();

for (const [categoryId, words] of Object.entries(CATALOG)) {
  const meta = CATEGORY_META[categoryId];
  check(meta, `Категория «${categoryId}» есть в каталоге, но не описана`);
  check(words.length >= MIN_WORDS, `В категории «${categoryId}» всего ${words.length} слов — партия упрётся в повторы`);
  for (const word of words) {
    check(word.id && !seenIds.has(word.id), `Повторяющийся идентификатор «${word.id}»`);
    seenIds.add(word.id);
    check(word.label && word.label.trim() === word.label, `Слово «${word.label}» с лишними пробелами`);
    const owner = seenLabels.get(word.label);
    check(!owner, `«${word.label}» есть и в «${owner}», и в «${categoryId}»`);
    seenLabels.set(word.label, categoryId);
    check(REFERENCE.test(String(word.ref || '')), `У «${word.label}» ссылка «${word.ref}» не похожа на место в Библии`);
  }
}

for (const categoryId of Object.keys(CATEGORY_META)) {
  check(CATALOG[categoryId], `Категория «${categoryId}» описана, но слов у неё нет`);
}

// Клиентский список обязан совпадать с каталогом слово в слово.
const client = fs.readFileSync('web/games/bible-sketch.js', 'utf8');
const block = client.slice(client.indexOf('const CATEGORIES = ['), client.indexOf('const PHASE_MS'));
const listed = [...block.matchAll(/\{\s*id:\s*'([a-z]+)',\s*title:\s*'([^']+)',\s*icon:\s*'([^']+)',\s*size:\s*(\d+)/g)]
  .map((match) => ({ id: match[1], title: match[2], icon: match[3], size: Number(match[4]) }));

check(listed.length === Object.keys(CATALOG).length,
  `Клиент показывает ${listed.length} категорий из ${Object.keys(CATALOG).length}`);
for (const entry of listed) {
  const meta = CATEGORY_META[entry.id];
  const words = CATALOG[entry.id];
  if (!meta || !words) { failures.push(`Клиент знает категорию «${entry.id}», которой нет в каталоге`); continue; }
  check(entry.title === meta.title, `Название «${entry.id}»: у клиента «${entry.title}», в каталоге «${meta.title}»`);
  check(entry.icon === meta.icon, `Значок «${entry.id}»: у клиента «${entry.icon}», в каталоге «${meta.icon}»`);
  check(entry.size === words.length, `Число слов «${entry.id}»: у клиента ${entry.size}, в каталоге ${words.length}`);
}

if (failures.length) {
  console.error(`Bible Sketch catalog check failed:\n- ${failures.join('\n- ')}`);
  process.exit(1);
}

const total = Object.values(CATALOG).reduce((sum, words) => sum + words.length, 0);
console.log(`OK: каталог «Библейского художника» — ${Object.keys(CATALOG).length} категорий, ${total} слов, `
  + 'у каждого своя ссылка на Синодальный перевод, повторов нет, клиент и воркер согласны.');
