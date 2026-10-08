// Проверяет «Библейскую географию» без сети.
//
//   node scripts/check-bible-geography.mjs
//
// Данные игры собирает scripts/build-bible-geography.mjs из закреплённого
// издания синодального текста: каждая связь «герой — место» сверена там со
// стихом. Само издание в репозитории не лежит, и пересобрать данные в CI нельзя,
// поэтому здесь проверяется то, что ломается молча и без текста:
//
//   * данные разошлись с источником. Поправили место в
//     scripts/data/bible-geography-source.mjs и забыли пересобрать — в игре
//     живёт старая версия, а проверка источника рапортует о новой;
//   * имя написано не по синодальному переводу. Каждое слово имён, мест и
//     подписей карты есть в общем словаре словоформ двух других изданий —
//     само или через форму-свидетеля из bible-geography-witnesses.json;
//   * цитата — не синодальный текст: каждое её слово есть в том же словаре
//     (или в коротком списке слов из квадратных скобок, который сборщик сверил
//     со своим изданием);
//   * задание ставит ловушкой правду. Если Давид бывал в Хевроне, Хеврон не
//     может стоять неверным ответом в вопросе о Давиде, а в «Соедини» не может
//     подходить двум героям. Логика игры прогоняется на сотнях раундов всех
//     режимов, уровней и языков;
//   * разбор в справочнике правил учит неправде: его пары сверяются с данными.

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { PLACES, HEROES, JOURNEYS, LABELS } from './data/bible-geography-source.mjs';

const root = path.resolve(import.meta.dirname, '..');
const require = createRequire(import.meta.url);
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const readJSON = (rel) => JSON.parse(read(rel));

const problems = [];
const need = (condition, message) => { if (!condition) problems.push(message); };
const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
const norm = (value) => String(value || '').toUpperCase().replace(/Ё/g, 'Е');

const data = readJSON('web/data/bible_geography.json');
const STALE = 'данные устарели — пересоберите: node scripts/build-bible-geography.mjs';

// --- 1. данные собраны из нынешнего источника ----------------------------------

need(same(data.places.map((place) => place.id), PLACES.map((place) => place.id)), `места: ${STALE}`);
need(same(data.heroes.map((hero) => hero.id), HEROES.map((hero) => hero.id)), `герои: ${STALE}`);
need(same(data.journeys, JOURNEYS), `путешествия: ${STALE}`);
need(same(data.labels, LABELS), `подписи карты: ${STALE}`);

const PLACE_KEYS = ['name', 'aka', 'lat', 'lon', 'approx', 'near', 'tier', 'kind', 'now', 'country', 'site', 'i18n'];
const builtPlaces = new Map(data.places.map((place) => [place.id, place]));
for (const source of PLACES) {
  const built = builtPlaces.get(source.id);
  if (!built) continue;
  const changed = PLACE_KEYS.filter((key) => !same(built[key], source[key]));
  need(!changed.length, `${source.id}: ${changed.join(', ')} — ${STALE}`);
}

// «1Цар 17:12» в источнике и «1 Цар 17:10–12» в данных — одна ссылка, если
// совпадают книга и глава, а стих источника лежит внутри цитаты.
const parseRef = (ref) => {
  const match = String(ref).replace(/\s+/g, '').match(/^(\d?[А-Яа-я]+)(\d+):(\d+)(?:[–-](\d+))?$/u);
  return match ? { book: match[1], ch: Number(match[2]), from: Number(match[3]), to: Number(match[4] || match[3]) } : null;
};
const HERO_KEYS = ['name', 'tag', 'aka', 'g', 'i18n', 't', 'level', 'era', 'about', 'follows', 'also', 'route'];
const builtHeroes = new Map(data.heroes.map((hero) => [hero.id, hero]));
for (const source of HEROES) {
  const built = builtHeroes.get(source.id);
  if (!built) continue;
  const changed = HERO_KEYS.filter((key) => !same(built[key], key === 'also' && !source.also?.length ? undefined : source[key]));
  need(!changed.length, `${source.id}: ${changed.join(', ')} — ${STALE}`);
  need(same(built.stops.map((stop) => stop.p), source.stops.map((stop) => stop.p)), `${source.id}: места связей — ${STALE}`);
  source.stops.forEach((stop, index) => {
    const one = built.stops[index];
    if (!one || one.p !== stop.p) return;
    need(one.n === stop.n, `${source.id} → ${stop.p}: описание — ${STALE}`);
    const want = parseRef(stop.r);
    const got = parseRef(one.r);
    need(want && got && want.book === got.book && want.ch === got.ch && got.from <= want.from && want.to <= got.to,
      `${source.id} → ${stop.p}: ссылка ${one.r} не покрывает ${stop.r} — ${STALE}`);
    need(typeof one.q === 'string' && one.q.length >= 20, `${source.id} → ${stop.p}: нет цитаты`);
  });
}

// --- 2. имена и цитаты синодальные ---------------------------------------------

const forms = new Set(readJSON('scripts/data/bible-synodal-forms.json'));
const { witness, quoteOnly = [] } = readJSON('scripts/data/bible-geography-witnesses.json');

const names = [
  ...PLACES.flatMap((place) => [place.name, place.aka]),
  ...HEROES.flatMap((hero) => [hero.name, hero.aka, hero.tag]),
  ...LABELS.ancient.map((label) => label.n),
  ...Object.values(LABELS.rivers).map((river) => river.ancient),
].filter(Boolean);
const usedWitnesses = new Set();
for (const name of names) {
  for (const raw of name.split(/[\s,]+/)) {
    const word = norm(raw).replace(/-/g, '');
    if (word.length < 3 || forms.has(word)) continue;
    const parts = raw.split('-').map(norm);
    if (parts.length > 1 && parts.every((part) => part.length < 3 || forms.has(part))) continue;
    const form = witness[word];
    if (!form) { problems.push(`«${raw}» (${name}) нет в синодальном словаре, и свидетеля у него нет`); continue; }
    usedWitnesses.add(word);
    // Свидетель — то же слово в другом падеже: общее начало почти во всю длину.
    let common = 0;
    while (common < form.length && form[common] === word[common]) common += 1;
    need(common >= Math.max(3, word.length - 2), `свидетель ${form} для «${raw}» — другое слово`);
    need(forms.has(form), `свидетеля ${form} для «${raw}» нет в синодальном словаре`);
  }
}
for (const word of Object.keys(witness)) need(usedWitnesses.has(word), `свидетель ${word} больше ни к чему не относится — пересоберите данные`);

const quoteWords = new Set();
for (const hero of data.heroes) {
  for (const stop of hero.stops) {
    for (const raw of String(stop.q).split(/[^\p{L}]+/u)) {
      const word = norm(raw);
      if (word.length < 3) continue;
      quoteWords.add(word);
      if (!forms.has(word) && !quoteOnly.includes(word)) problems.push(`${hero.id} → ${stop.p}: слова «${raw}» нет в синодальном тексте`);
    }
  }
}
for (const word of quoteOnly) {
  need(!forms.has(word) && quoteWords.has(word), `слово ${word} из quoteOnly не нужно — пересоберите данные`);
}
need(quoteOnly.length <= 12, `слов вне общего словаря стало ${quoteOnly.length}: похоже, цитаты взяты не из того издания`);

// --- 3. карта ----------------------------------------------------------------

const inFrame = (lat, lon) => lon >= 10 && lon <= 50 && lat >= 25 && lat <= 43;
for (const place of PLACES) need(inFrame(place.lat, place.lon), `${place.id}: вне рамки карты`);
for (const hero of HEROES) {
  for (const step of hero.route || []) if (Array.isArray(step)) need(inFrame(step[0], step[1]), `${hero.id}: точка пути вне карты`);
}
for (const journey of JOURNEYS) {
  for (const step of journey.path) if (Array.isArray(step)) need(inFrame(step[0], step[1]), `${journey.id}: точка пути вне карты`);
}

const mapText = read('web/assets/bible-geography/map.json');
const map = JSON.parse(mapText);
need(!/[А-Яа-яЁё]/.test(mapText), 'в map.json есть русский текст — он не проходит сборку переводов');
need(map.land?.length && map.rivers && map.deadSea?.ancient && map.deadSea?.modern && map.borders?.international,
  'в map.json не хватает слоёв');
need(mapText.length < 160_000, `map.json разросся до ${(mapText.length / 1024).toFixed(0)} КБ`);

// Картинки карт подключаются через art.json. Путь, которого нет на диске,
// молча оставит пустой слой поверх векторной карты.
const art = readJSON('web/assets/bible-geography/art.json');
for (const [frame, layers] of Object.entries(art)) {
  need(['world', 'holy'].includes(frame), `art.json: неизвестная рамка ${frame}`);
  for (const [layer, file] of Object.entries(layers || {})) {
    need(['ancient', 'modern'].includes(layer), `art.json: неизвестный слой ${frame}.${layer}`);
    need(typeof file === 'string' && fs.existsSync(path.join(root, file)), `art.json: нет файла ${file}`);
  }
}

// --- 4. задания не ставят правду ловушкой -------------------------------------

const Logic = require(path.join(root, 'web/games/bible-geography-logic.js'));
const languages = [['ru', data]];
for (const lang of ['en', 'de', 'es']) {
  const file = `web/locales/${lang}/data/bible_geography.json`;
  if (fs.existsSync(path.join(root, file))) languages.push([lang, readJSON(file)]);
  else problems.push(`нет ${file} — запустите npm run build`);
}

let tasks = 0;
for (const [lang, set] of languages) {
  const game = Logic.create(set);
  const place = (id) => game.places.get(id);
  const label = (id) => game.heroLabel(game.heroes.get(id));
  const say = (message) => problems.push(`[${lang}] ${message}`);
  const oneName = (ids, show, what) => {
    const shown = ids.map(show);
    if (new Set(shown).size !== shown.length) say(`${what}: одинаковые подписи ${shown.join(' / ')}`);
  };
  for (const level of Object.keys(Logic.LEVELS)) {
    const rules = Logic.LEVELS[level];
    for (const testament of ['all', 'ot', 'nt']) {
      for (let seed = 1; seed <= 40; seed += 1) {
        const random = Logic.rng(seed * 7919 + level.length * 31 + testament.length);
        const filter = { level, testament };

        const round = game.matchRound(random, filter);
        if (!round) { say(`«Соедини» ${level}/${testament}: раунд не собрался`); continue; }
        tasks += 1;
        if (round.pairs.length !== rules.pairs) say(`«Соедини» ${level}: ${round.pairs.length} пар вместо ${rules.pairs}`);
        oneName(round.left, label, '«Соедини», герои');
        oneName(round.right, (id) => place(id).name, '«Соедини», места');
        for (const pair of round.pairs) {
          const hero = game.heroes.get(pair.hero);
          if (!hero.stops.some((stop) => stop.p === pair.place)) say(`«Соедини»: ${pair.hero} — ${pair.place} не связаны`);
          for (const other of round.pairs) {
            if (other !== pair && game.blocked(hero).has(other.place)) {
              say(`«Соедини»: ${pair.hero} подходит и к ${other.place} — у раунда два решения`);
            }
          }
        }
        if (round.right.some((id, index) => id === round.pairs[index].place)) {
          // Не ошибка правил, но раунд решается «по строчкам»: допустимо только
          // там, где перемешать иначе нельзя.
          if (round.pairs.length > 2) say(`«Соедини»: место стоит напротив своего героя (${seed})`);
        }

        const multi = game.multiQuestion(random, filter);
        if (!multi) { say(`«Все места» ${level}/${testament}: вопрос не собрался`); continue; }
        tasks += 1;
        const hero = game.heroes.get(multi.hero);
        const [min, max] = rules.correct;
        if (multi.options.length !== rules.options) say(`«Все места» ${level}: ${multi.options.length} вариантов вместо ${rules.options}`);
        if (multi.correct.length < min || multi.correct.length > max) say(`«Все места» ${level}: верных ${multi.correct.length}`);
        if (multi.showCount !== rules.showCount) say(`«Все места» ${level}: число верных показывается не по правилам`);
        oneName(multi.options, (id) => place(id).name, `«Все места», ${multi.hero}`);
        for (const id of multi.options) {
          const right = multi.correct.includes(id);
          if (right && !hero.stops.some((stop) => stop.p === id)) say(`«Все места»: ${multi.hero} не был в ${id}, а ответ верный`);
          if (!right && game.blocked(hero).has(id)) say(`«Все места»: ${multi.hero} был в ${id}, а ответ считается неверным`);
        }

        const where = game.whereQuestion(random, filter);
        if (!where) { say(`«Найди на карте» ${level}/${testament}: вопрос не собрался`); continue; }
        tasks += 1;
        if (!where.candidates.includes(where.place)) say('«Найди на карте»: верной точки нет среди точек');
        oneName(where.candidates, (id) => place(id).name, '«Найди на карте»');
        for (const a of where.candidates) {
          for (const b of where.candidates) {
            if (a < b && Math.hypot((place(a).lon - place(b).lon) * 0.8, place(a).lat - place(b).lat) <= 0.1) {
              say(`«Найди на карте»: точки ${a} и ${b} сливаются`);
            }
          }
        }

        const thenNow = game.thenNowQuestion(random, filter);
        if (!thenNow) { say(`«Тогда и сейчас» ${level}/${testament}: вопрос не собрался`); continue; }
        tasks += 1;
        const target = place(thenNow.place);
        const texts = thenNow.options.map((option) => option.text);
        if (new Set(texts).size !== texts.length) say(`«Тогда и сейчас»: одинаковые ответы ${texts.join(' / ')}`);
        if (texts.filter((text) => text === thenNow.answer).length !== 1) say('«Тогда и сейчас»: верный ответ не один');
        for (const option of thenNow.options) {
          if (option.id === target.id) continue;
          const other = place(option.id);
          if (thenNow.kind === 'now' && other.now === target.now) say(`«Тогда и сейчас»: ${other.id} сегодня там же, где ${target.id}`);
          if (thenNow.kind === 'then' && other.now === target.now) say(`«Тогда и сейчас»: ${other.id} и ${target.id} — одно место сегодня`);
          if (thenNow.kind === 'country' && other.country === target.country) say(`«Тогда и сейчас»: страна ${other.country} дважды`);
        }
        if (thenNow.kind === 'country' && !target.state) say(`«Тогда и сейчас»: о ${target.id} спрошена страна, а ответ не одно государство`);
        if (thenNow.kind !== 'country' && game.sameName(target)) say(`«Тогда и сейчас»: у ${target.id} имя не менялось`);
      }
    }
  }
}

// --- 5. разбор в справочнике правил --------------------------------------------

const demoSandbox = {
  window: { matchMedia: () => null },
  document: { readyState: 'complete', getElementById: () => null, querySelectorAll: () => [], addEventListener() {} },
  IntersectionObserver: class { observe() {} },
  MutationObserver: class { observe() {} },
};
vm.runInNewContext(read('web/js/game-rules-demos.js'), demoSandbox);
const scene = demoSandbox.window.GameRulesDemos?.scene?.('geo-match');
need(Boolean(scene), 'в справочнике правил нет разбора geo-match');
if (scene) {
  const game = Logic.create(data);
  const byName = (list, name) => list.filter((item) => item.name === name);
  const heroIds = scene.heroes.map((name) => {
    const found = byName(data.heroes, name);
    need(found.length === 1, `разбор: героя «${name}» ${found.length ? 'несколько' : 'нет'} в данных`);
    return found[0]?.id;
  });
  const placeIds = scene.places.map((name) => {
    const found = byName(data.places, name);
    need(found.length === 1, `разбор: места «${name}» ${found.length ? 'несколько' : 'нет'} в данных`);
    return found[0]?.id;
  });
  const linked = (hero, place) => game.heroes.get(heroIds[hero])?.stops.some((stop) => stop.p === placeIds[place]);
  const allowed = (hero, place) => game.blocked(game.heroes.get(heroIds[hero])).has(placeIds[place]);
  if (heroIds.every(Boolean) && placeIds.every(Boolean)) {
    for (const step of scene.steps) {
      if (step.ok) need(linked(step.hero, step.place), `разбор: «${scene.heroes[step.hero]} — ${scene.places[step.place]}» показан верным, а связи нет`);
      if (step.miss) need(!allowed(step.hero, step.place), `разбор: «${scene.heroes[step.hero]} — ${scene.places[step.place]}» показан ошибкой, а это правда`);
    }
    const final = scene.steps.at(-1).done;
    need(final.length === scene.heroes.length, 'разбор: в конце соединены не все пары');
    scene.heroes.forEach((unused, hero) => scene.places.forEach((unused2, place) => {
      const pair = final.some(([h, p]) => h === hero && p === place);
      if (pair) need(linked(hero, place), `разбор: пара «${scene.heroes[hero]} — ${scene.places[place]}» неверна`);
      else need(!allowed(hero, place), `разбор: «${scene.heroes[hero]}» подходит и к «${scene.places[place]}» — у сцены два решения`);
    }));
  }
}

if (problems.length) {
  console.error(`«Библейская география» не прошла проверку:\n  ${problems.slice(0, 60).join('\n  ')}`
    + (problems.length > 60 ? `\n  …и ещё ${problems.length - 60}` : ''));
  process.exit(1);
}

const links = data.heroes.reduce((sum, hero) => sum + hero.stops.length, 0);
console.log(`Библейская география в порядке: ${data.heroes.length} героев, ${data.places.length} мест и ${links} связей `
  + 'собраны из нынешнего источника, имена и цитаты есть в синодальном тексте, '
  + `${tasks} заданий на ${languages.length} языках не ставят правду ловушкой, разбор правил честный.`);
