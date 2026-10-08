// «Библейская география» — правила заданий.
//
// Здесь нет ни одной строки разметки: только то, какие задания можно
// составить из данных и что в них считать верным. Вынесено отдельно ради
// проверки — scripts/check-bible-geography.mjs раскладывает тысячи заданий и
// ищет то, что глазом не поймать: два верных ответа там, где ждут один,
// или ловушку, которая на самом деле правда.
//
// Главное правило всех заданий — «правда не бывает ошибкой». Библия связывает
// героя с местами и сверх тех, что выбраны для игры (Авраам видел равнину
// Иорданскую, Давид бывал в Раме). Такие места записаны в данных отдельно
// (also) и в заданиях не участвуют ни ответом, ни ловушкой. Спутники героя
// (follows) наследуют его места тем же способом: ученик ходил с Учителем, и
// назвать ошибкой Капернаум у апостола Андрея игра не вправе.

(function (root) {
  'use strict';

  /** Устойчивый генератор: одно зерно — одна и та же раздача. */
  function rng(seed) {
    let state = (Number(seed) || 1) >>> 0;
    return () => {
      state = (state + 0x6D2B79F5) >>> 0;
      let t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function shuffle(list, random) {
    const out = [...list];
    for (let i = out.length - 1; i > 0; i -= 1) {
      const j = Math.floor(random() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  }

  const pick = (list, random) => list[Math.floor(random() * list.length)];

  /** Сложность: сколько чего в задании и насколько известных героев брать. */
  const LEVELS = {
    easy: { heroLevel: 1, placeTier: 2, pairs: 4, options: 6, correct: [2, 2], candidates: 4, showCount: true },
    medium: { heroLevel: 2, placeTier: 3, pairs: 5, options: 8, correct: [2, 3], candidates: 5, showCount: true },
    hard: { heroLevel: 3, placeTier: 3, pairs: 6, options: 9, correct: [3, 4], candidates: 6, showCount: false },
  };

  function create(data) {
    const places = new Map(data.places.map((place) => [place.id, place]));
    const heroes = new Map(data.heroes.map((hero) => [hero.id, hero]));

    /** Места, которые нельзя ставить герою ловушкой: его собственные и спутниковы. */
    const blockedCache = new Map();
    function blocked(hero) {
      if (blockedCache.has(hero.id)) return blockedCache.get(hero.id);
      const set = new Set([...hero.stops.map((stop) => stop.p), ...(hero.also || [])]);
      const leader = hero.follows && heroes.get(hero.follows);
      if (leader) for (const id of [...leader.stops.map((stop) => stop.p), ...(leader.also || [])]) set.add(id);
      // Место «рядом» (Голгофа рядом с Иерусалимом) делит судьбу соседа: кто был
      // на Голгофе, был и в Иерусалиме, и наоборот — ловушкой их не поставить.
      for (const id of [...set]) {
        const place = places.get(id);
        if (place?.near) set.add(place.near);
        for (const other of places.values()) if (other.near === id) set.add(other.id);
      }
      blockedCache.set(hero.id, set);
      return set;
    }

    const linkKey = (heroId, placeId) => `${heroId}:${placeId}`;
    const allLinks = data.heroes.flatMap((hero) => hero.stops.map((stop) => linkKey(hero.id, stop.p)));

    /** Имя героя так, как его видно на карточке: «Иосиф» и «Иосиф» различает подпись. */
    const heroLabel = (hero) => (hero.tag ? `${hero.name} (${hero.tag})` : hero.name);

    function heroPool({ testament = 'all', level = 'medium' } = {}) {
      const max = LEVELS[level].heroLevel;
      return data.heroes.filter((hero) => hero.level <= max && (testament === 'all' || hero.t === testament));
    }

    function stopsFor(hero, level) {
      const tier = LEVELS[level].placeTier;
      return hero.stops.filter((stop) => (places.get(stop.p)?.tier || 3) <= tier);
    }

    // --- Соедини ---------------------------------------------------------------
    //
    // Раунд годится, только если каждое место справа подходит ровно одному
    // герою слева. Иначе человек соединит Иакова с Вефилем, а игра будет
    // ждать там Самуила — и обе стороны правы.
    function matchRound(random, { testament = 'all', level = 'medium' } = {}) {
      const want = LEVELS[level].pairs;
      for (let attempt = 0; attempt < 400; attempt += 1) {
        const pool = shuffle(heroPool({ testament, level }), random);
        const chosen = [];
        const names = new Set();
        for (const hero of pool) {
          if (chosen.length === want) break;
          if (names.has(hero.name)) continue;
          const taken = new Set(chosen.map((pair) => pair.stop.p));
          const options = shuffle(stopsFor(hero, level), random).filter((stop) => {
            if (taken.has(stop.p)) return false;
            // Новое место не должно подходить уже выбранным героям…
            if (chosen.some((pair) => blocked(pair.hero).has(stop.p))) return false;
            // …а места уже выбранных — новому герою.
            return !chosen.some((pair) => blocked(hero).has(pair.stop.p));
          });
          if (!options.length) continue;
          chosen.push({ hero, stop: options[0] });
          names.add(hero.name);
        }
        if (chosen.length === want) {
          const places = chosen.map(({ stop }) => stop.p);
          // Ни одно место не стоит напротив своего героя: иначе раунд решается
          // «по строчкам», не глядя на имена.
          let right = shuffle(places, random);
          for (let tries = 0; tries < 50 && right.some((id, i) => id === places[i]); tries += 1) right = shuffle(places, random);
          return {
            pairs: chosen.map(({ hero, stop }) => ({ hero: hero.id, place: stop.p, stop })),
            left: chosen.map(({ hero }) => hero.id),
            right,
          };
        }
      }
      return null;
    }

    // --- Все места героя -------------------------------------------------------
    //
    // Верных ответов несколько, и человек не знает заранее, сколько (на трудном
    // уровне). Ловушки — места того же Завета, где бывали другие герои: так
    // задание проверяет знание, а не догадку «это Новый Завет, значит, нет».
    function multiQuestion(random, { testament = 'all', level = 'medium', exclude = new Set() } = {}) {
      const rules = LEVELS[level];
      const [min, max] = rules.correct;
      const pool = shuffle(heroPool({ testament, level }).filter((hero) => !exclude.has(hero.id)), random);
      for (const hero of pool) {
        const distinct = [];
        const seenNames = new Set();
        for (const stop of shuffle(stopsFor(hero, level), random)) {
          const place = places.get(stop.p);
          if (seenNames.has(place.name)) continue;
          // «Гора Мориа» и «Иерусалим» вместе — одно место дважды.
          if (distinct.some((other) => places.get(other.p).near === stop.p || place.near === other.p)) continue;
          distinct.push(stop);
          seenNames.add(place.name);
        }
        if (distinct.length < min) continue;
        const count = Math.min(distinct.length, min + Math.floor(random() * (max - min + 1)));
        const correct = distinct.slice(0, count);
        const block = blocked(hero);
        const sameTestament = new Set(data.heroes.filter((other) => other.t === hero.t)
          .flatMap((other) => other.stops.map((stop) => stop.p)));
        const candidates = data.places.filter((place) => !block.has(place.id) && !place.near
          && place.tier <= rules.placeTier && !correct.some((stop) => places.get(stop.p).name === place.name));
        const close = shuffle(candidates.filter((place) => sameTestament.has(place.id)), random);
        const far = shuffle(candidates.filter((place) => !sameTestament.has(place.id)), random);
        const traps = [...close, ...far].slice(0, rules.options - count);
        if (traps.length < rules.options - count) continue;
        return {
          hero: hero.id,
          correct: correct.map((stop) => stop.p),
          stops: correct,
          options: shuffle([...correct.map((stop) => stop.p), ...traps.map((place) => place.id)], random),
          showCount: rules.showCount,
        };
      }
      return null;
    }

    function scoreMulti(question, picked) {
      const right = new Set(question.correct);
      let hits = 0; let wrong = 0;
      for (const id of picked) { if (right.has(id)) hits += 1; else wrong += 1; }
      const missed = question.correct.length - hits;
      return { hits, wrong, missed, perfect: !wrong && !missed, points: Math.max(0, hits - wrong) };
    }

    // --- Найди на карте ---------------------------------------------------------

    const linkedPlaces = (filter) => {
      const ids = new Set();
      for (const hero of heroPool(filter)) for (const stop of stopsFor(hero, filter.level)) ids.add(stop.p);
      return [...ids].map((id) => places.get(id)).filter((place) => !place.near);
    };

    const distance = (a, b) => Math.hypot((a.lon - b.lon) * 0.8, a.lat - b.lat);

    function whereQuestion(random, { testament = 'all', level = 'medium', exclude = new Set() } = {}) {
      const rules = LEVELS[level];
      const pool = shuffle(linkedPlaces({ testament, level }).filter((place) => !exclude.has(place.id)), random);
      for (const target of pool) {
        // Соседи на расстоянии, при котором точки ещё различимы пальцем, но
        // в одном кадре: иначе задание превращается в «какой край карты».
        const around = shuffle(data.places.filter((place) => place.id !== target.id && !place.near
          && place.name !== target.name && distance(place, target) > 0.12 && distance(place, target) < (level === 'easy' ? 6 : 3)), random);
        const candidates = [target];
        for (const place of around) {
          if (candidates.length > rules.candidates) break;
          if (candidates.every((other) => distance(other, place) > 0.1)) candidates.push(place);
        }
        if (candidates.length < Math.min(4, rules.candidates + 1)) continue;
        const stories = data.heroes.flatMap((hero) => hero.stops.filter((stop) => stop.p === target.id)
          .map((stop) => ({ hero: hero.id, stop })));
        return { place: target.id, candidates: shuffle(candidates.map((place) => place.id), random), stories };
      }
      return null;
    }

    // --- Тогда и сейчас ---------------------------------------------------------
    //
    // Три вида вопросов. Вопрос «что сегодня» не задаётся там, где имя не
    // изменилось (Иерихон и есть Иерихон), а «какая страна» — там, где ответ
    // не одно государство (Иерусалим, спорные территории, две страны сразу):
    // такие места помечены в данных отсутствием признака state.
    const sameName = (place) => place.now.toLowerCase() === place.name.toLowerCase();
    const singleCountry = (place) => Boolean(place.state);
    const nowText = (place) => `${place.now} · ${place.country}`;

    function thenNowQuestion(random, { testament = 'all', level = 'medium', exclude = new Set() } = {}) {
      const pool = shuffle(linkedPlaces({ testament, level }).filter((place) => !exclude.has(place.id)), random);
      const kinds = shuffle(['now', 'then', 'country'], random);
      for (const target of pool) {
        for (const kind of kinds) {
          if ((kind === 'now' || kind === 'then') && sameName(target)) continue;
          if (kind === 'country' && !singleCountry(target)) continue;
          const text = kind === 'now' ? nowText : kind === 'then' ? (place) => place.name : (place) => place.country;
          const others = shuffle(data.places.filter((place) => place.id !== target.id && !place.near
            && (kind !== 'country' || singleCountry(place))
            && (kind === 'country' || !sameName(place))), random);
          const options = [{ id: target.id, text: text(target) }];
          for (const place of others) {
            if (options.length === 4) break;
            const label = text(place);
            if (options.some((option) => option.text === label)) continue;
            // В вопросе «что было здесь» ответы не должны совпадать по месту сегодня.
            if (kind === 'then' && place.now === target.now) continue;
            options.push({ id: place.id, text: label });
          }
          if (options.length < 4) continue;
          return { kind, place: target.id, options: shuffle(options, random), answer: text(target) };
        }
      }
      return null;
    }

    return {
      places, heroes, blocked, linkKey, allLinks, heroLabel, heroPool, stopsFor,
      matchRound, multiQuestion, scoreMulti, whereQuestion, thenNowQuestion, nowText, sameName,
    };
  }

  const api = { create, rng, shuffle, pick, LEVELS };
  root.BibleGeographyLogic = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
