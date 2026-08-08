// Слова и короткие фразы собраны по Синодальному переводу (1876).
// Источник текста для сверки: https://ebible.org/russyn/ (Public Domain).
// ref хранится рядом с каждой карточкой, чтобы происхождение слова можно было проверить.

export const CATEGORY_META = Object.freeze({
  objects: { id: 'objects', title: 'Предметы', icon: '🪔' },
  places: { id: 'places', title: 'Места', icon: '🗺️' },
  people: { id: 'people', title: 'Люди', icon: '👤' },
  events: { id: 'events', title: 'События', icon: '✨' },
});

const item = (id, label, ref, aliases = []) => Object.freeze({ id, label, ref, aliases });

export const CATALOG = Object.freeze({
  objects: Object.freeze([
    item('ark', 'ковчег', 'Быт. 6:14', ['Ноев ковчег']),
    item('altar', 'жертвенник', 'Быт. 8:20'),
    item('staff', 'жезл', 'Исх. 4:2'),
    item('tablets', 'скрижали', 'Исх. 24:12', ['каменные скрижали']),
    item('lampstand', 'светильник', 'Исх. 25:31'),
    item('tabernacle', 'скиния', 'Исх. 26:1'),
    item('incense-altar', 'кадильница', 'Лев. 16:12'),
    item('ephod', 'ефод', 'Исх. 28:6'),
    item('manna', 'манна', 'Исх. 16:31'),
    item('bronze-serpent', 'медный змей', 'Чис. 21:9'),
    item('trumpet', 'труба', 'Нав. 6:4'),
    item('sling', 'праща', '1 Цар. 17:40'),
    item('sword', 'меч', '1 Цар. 17:51'),
    item('harp', 'гусли', '1 Цар. 16:23'),
    item('scroll', 'свиток', 'Иер. 36:2'),
    item('seal', 'печать', 'Дан. 6:17'),
    item('net', 'сеть', 'Матф. 4:20'),
    item('boat', 'лодка', 'Матф. 8:23'),
    item('bread', 'хлеб', 'Матф. 14:19'),
    item('fish', 'рыба', 'Матф. 17:27'),
    item('cup', 'чаша', 'Матф. 26:27'),
    item('silver', 'тридцать сребренников', 'Матф. 26:15', ['сребренники']),
    item('thorn-crown', 'венец из терна', 'Иоан. 19:2', ['терновый венец']),
    item('cross', 'крест', 'Иоан. 19:17'),
    item('tomb', 'гроб', 'Иоан. 19:41'),
    item('stone', 'камень', 'Матф. 27:60'),
    item('ladder', 'лестница', 'Быт. 28:12'),
    item('well', 'колодезь', 'Быт. 24:11'),
    item('shield', 'щит', 'Еф. 6:16'),
    item('helmet', 'шлем', 'Еф. 6:17'),
    item('armor-belt', 'пояс', 'Еф. 6:14'),
    item('jar', 'кувшин', 'Суд. 7:16'),
  ]),

  places: Object.freeze([
    item('eden', 'Едем', 'Быт. 2:8', ['Едемский сад']),
    item('ararat', 'Арарат', 'Быт. 8:4'),
    item('babel', 'Вавилон', 'Быт. 11:9'),
    item('moriah', 'Мориа', 'Быт. 22:2'),
    item('bethel', 'Вефиль', 'Быт. 28:19'),
    item('shechem', 'Сихем', 'Быт. 33:18'),
    item('egypt', 'Египет', 'Исх. 1:1'),
    item('sinai', 'Синай', 'Исх. 19:11'),
    item('canaan', 'Ханаан', 'Чис. 13:3'),
    item('jordan', 'Иордан', 'Нав. 3:8'),
    item('jericho', 'Иерихон', 'Нав. 6:1'),
    item('sodom', 'Содом', 'Быт. 19:1'),
    item('gomorrah', 'Гоморра', 'Быт. 19:24'),
    item('nineveh', 'Ниневия', 'Иона 1:2'),
    item('jerusalem', 'Иерусалим', 'Матф. 2:1'),
    item('bethlehem', 'Вифлеем', 'Матф. 2:1'),
    item('nazareth', 'Назарет', 'Матф. 2:23'),
    item('galilee', 'Галилея', 'Матф. 4:12'),
    item('samaria', 'Самария', 'Иоан. 4:4'),
    item('capernaum', 'Капернаум', 'Матф. 4:13'),
    item('bethany', 'Вифания', 'Иоан. 11:1'),
    item('gethsemane', 'Гефсимания', 'Матф. 26:36'),
    item('golgotha', 'Голгофа', 'Матф. 27:33'),
    item('damascus', 'Дамаск', 'Деян. 9:2'),
    item('tarsus', 'Тарс', 'Деян. 9:11'),
    item('antioch', 'Антиохия', 'Деян. 11:26'),
    item('ephesus', 'Ефес', 'Деян. 18:19'),
    item('corinth', 'Коринф', 'Деян. 18:1'),
    item('athens', 'Афины', 'Деян. 17:15'),
    item('rome', 'Рим', 'Деян. 28:16'),
    item('patmos', 'Патмос', 'Откр. 1:9'),
    item('carmel', 'Кармил', '3 Цар. 18:19'),
  ]),

  people: Object.freeze([
    item('adam', 'Адам', 'Быт. 2:19'),
    item('eve', 'Ева', 'Быт. 3:20'),
    item('noah', 'Ной', 'Быт. 6:8'),
    item('abraham', 'Авраам', 'Быт. 17:5'),
    item('sarah', 'Сарра', 'Быт. 17:15', ['Сара']),
    item('isaac', 'Исаак', 'Быт. 21:3'),
    item('rebekah', 'Ревекка', 'Быт. 24:15'),
    item('jacob', 'Иаков', 'Быт. 25:26'),
    item('joseph', 'Иосиф', 'Быт. 30:24'),
    item('moses', 'Моисей', 'Исх. 2:10'),
    item('aaron', 'Аарон', 'Исх. 4:14'),
    item('miriam', 'Мариам', 'Исх. 15:20'),
    item('joshua', 'Иисус Навин', 'Исх. 33:11'),
    item('rahab', 'Раав', 'Нав. 2:1'),
    item('gideon', 'Гедеон', 'Суд. 6:11'),
    item('samson', 'Самсон', 'Суд. 13:24'),
    item('ruth', 'Руфь', 'Руф. 1:4'),
    item('samuel', 'Самуил', '1 Цар. 1:20'),
    item('saul', 'Саул', '1 Цар. 9:2'),
    item('david', 'Давид', '1 Цар. 16:13'),
    item('solomon', 'Соломон', '2 Цар. 12:24'),
    item('elijah', 'Илия', '3 Цар. 17:1'),
    item('elisha', 'Елисей', '3 Цар. 19:16'),
    item('isaiah', 'Исаия', 'Ис. 1:1'),
    item('jeremiah', 'Иеремия', 'Иер. 1:1'),
    item('daniel', 'Даниил', 'Дан. 1:6'),
    item('jonah', 'Иона', 'Иона 1:1'),
    item('esther', 'Есфирь', 'Есф. 2:7'),
    item('job', 'Иов', 'Иов 1:1'),
    item('mary', 'Мария', 'Лук. 1:27'),
    item('john-baptist', 'Иоанн Креститель', 'Матф. 3:1'),
    item('peter', 'Петр', 'Матф. 4:18'),
    item('john', 'Иоанн', 'Матф. 4:21'),
    item('martha', 'Марфа', 'Лук. 10:38'),
    item('lazarus', 'Лазарь', 'Иоан. 11:1'),
    item('zacchaeus', 'Закхей', 'Лук. 19:2'),
    item('paul', 'Павел', 'Деян. 13:9'),
    item('barnabas', 'Варнава', 'Деян. 4:36'),
  ]),

  events: Object.freeze([
    item('flood', 'потоп', 'Быт. 6:17', ['всемирный потоп']),
    item('sea-dry', 'море сделалось сушею', 'Исх. 14:21', ['переход через море', 'переход через Чермное море']),
    item('aaron-staff', 'жезл Ааронов расцвел', 'Чис. 17:8'),
    item('donkey-speaks', 'отверз Господь уста ослицы', 'Чис. 22:28', ['ослица заговорила']),
    item('jericho-falls', 'стена города обрушилась', 'Нав. 6:19', ['падение Иерихона']),
    item('sun-stops', 'солнце остановилось', 'Нав. 10:13'),
    item('fire-from-heaven', 'огонь сошел с неба', '3 Цар. 18:38'),
    item('jonah-sea', 'Иону бросили в море', 'Иона 1:15'),
    item('jonah-whale', 'Иона был во чреве кита', 'Иона 2:1'),
    item('daniel-lions', 'Даниила бросили в ров львиный', 'Дан. 6:16'),
    item('three-fire', 'три мужа ходят среди огня', 'Дан. 3:25'),
    item('jesus-born', 'родился Иисус', 'Матф. 2:1', ['рождение Иисуса']),
    item('jesus-baptized', 'Иисус, крестившись, молился', 'Лук. 3:21', ['крещение Иисуса']),
    item('water-wine', 'вода сделалась вином', 'Иоан. 2:9'),
    item('storm-still', 'сделалась великая тишина', 'Марк 4:39', ['буря утихла']),
    item('walk-sea', 'Иисус шел по морю', 'Матф. 14:25', ['хождение по воде']),
    item('five-thousand', 'все ели и насытились', 'Матф. 14:20', ['насыщение пяти тысяч']),
    item('lazarus-out', 'Лазарь! иди вон', 'Иоан. 11:43', ['воскрешение Лазаря']),
    item('earthquake', 'земля потряслась', 'Матф. 27:51'),
    item('veil-torn', 'завеса в храме раздралась', 'Лук. 23:45'),
    item('crucified', 'распяли Его', 'Иоан. 19:18', ['распятие Иисуса']),
    item('stone-rolled', 'камень отвален от гроба', 'Лук. 24:2'),
    item('risen', 'Он воскрес', 'Матф. 28:6', ['воскресение Иисуса']),
    item('ascension', 'стал подниматься', 'Деян. 1:9', ['вознесение Иисуса']),
    item('holy-spirit', 'исполнились все Духа Святого', 'Деян. 2:4', ['сошествие Святого Духа']),
    item('saul-road', 'Савл, Савл! что ты гонишь Меня?', 'Деян. 9:4', ['обращение Савла']),
    item('peter-prison', 'Петр вышел из темницы', 'Деян. 12:9'),
    item('prison-shook', 'поколебалось основание темницы', 'Деян. 16:26'),
    item('paul-silas', 'Павел и Сила молились', 'Деян. 16:25'),
    item('snake-hand', 'змей повис на руке его', 'Деян. 28:4'),
  ]),
});

export function getCategory(id) {
  const key = String(id || '').toLowerCase();
  if (!CATEGORY_META[key] || !CATALOG[key]) return null;
  return { ...CATEGORY_META[key], words: CATALOG[key] };
}

export function getWord(categoryId, wordId) {
  return CATALOG[String(categoryId || '')]?.find((entry) => entry.id === wordId) || null;
}

export function normalizeAnswer(value) {
  return String(value ?? '')
    .toLocaleLowerCase('ru-RU')
    .replace(/ё/g, 'е')
    .replace(/[«»“”„"'`´!?.,:;()\[\]{}—–\-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function answerMatches(entry, input) {
  if (!entry) return false;
  const answer = normalizeAnswer(input);
  if (!answer) return false;
  const candidates = [entry.label, ...(entry.aliases || [])].map(normalizeAnswer).filter(Boolean);
  return candidates.some((candidate) => {
    if (candidate === answer) return true;
    const maxDistance = candidate.length >= 12 ? 2 : candidate.length >= 6 ? 1 : 0;
    return maxDistance > 0 && levenshtein(candidate, answer) <= maxDistance;
  });
}

function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= b.length; j += 1) {
      current[j] = Math.min(
        current[j - 1] + 1,
        previous[j] + 1,
        previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    previous = current;
  }
  return previous[b.length];
}
