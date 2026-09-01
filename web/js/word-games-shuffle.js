(() => {
  'use strict';

  // Перераздача слов между уровнями словесных игр.
  //
  // После сброса прогресса пройти те же 150 уровней с теми же словами — это не
  // «начать заново», а перечитать конспект. Поэтому сброс запоминает зерно, и
  // при следующей загрузке уровни собираются иначе.
  //
  // В «Библейских словах» уровень — это набор букв, и слово обязано из них
  // собираться. Просто переложить слова между уровнями нельзя: «НАРОД» из букв
  // «ЛОНВИВА» не выйдет. Зато почти каждое слово корпуса подходит сразу
  // нескольким наборам букв — в среднем на уровень приходится 17 подходящих
  // слов, из которых 13 сейчас лежат в других уровнях. Из них и набирается
  // новый уровень: главное слово (то, что использует все буквы) остаётся
  // якорем, остальные тасуются.
  //
  // В «Поиске слов» слова привязаны к теме уровня, и перекладывать их между
  // темами — значит сломать тему. Там меняется порядок уровней, а сетки игра
  // и так раскладывает заново, когда прогресс пуст.

  const SEED_KEY = 'word_games_shuffle_v1';

  /** Устойчивый генератор: одно зерно — всегда одна и та же раздача. */
  function rng(seed) {
    let state = (Number(seed) || 1) >>> 0;
    return () => {
      state ^= state << 13; state >>>= 0;
      state ^= state >> 17;
      state ^= state << 5; state >>>= 0;
      return state / 0x100000000;
    };
  }

  function shuffled(list, random) {
    const out = [...list];
    for (let index = out.length - 1; index > 0; index -= 1) {
      const swap = Math.floor(random() * (index + 1));
      [out[index], out[swap]] = [out[swap], out[index]];
    }
    return out;
  }

  function readSeed() {
    try {
      const raw = JSON.parse(localStorage.getItem(SEED_KEY) || '{}');
      return raw && typeof raw === 'object' ? raw : {};
    } catch { return {}; }
  }

  function writeSeed(next) {
    try { localStorage.setItem(SEED_KEY, JSON.stringify(next)); } catch { /* приватный режим */ }
  }

  /** Новое зерно для игры — вызывается сбросом прогресса. */
  function reshuffle(game) {
    const seeds = readSeed();
    seeds[game] = (Number(seeds[game]) || 0) + 1 + Math.floor(Math.random() * 1_000_000);
    writeSeed(seeds);
    return seeds[game];
  }

  function seedOf(game) { return Number(readSeed()[game]) || 0; }

  // --- «Библейские слова» -------------------------------------------------------

  const letterCount = (word) => {
    const counts = new Map();
    for (const char of word) counts.set(char, (counts.get(char) || 0) + 1);
    return counts;
  };

  const fitsInto = (word, pool) => {
    const need = letterCount(word);
    for (const [char, count] of need) if ((pool.get(char) || 0) < count) return false;
    return true;
  };

  function wow(levels) {
    const seed = seedOf('wow');
    if (!seed || !Array.isArray(levels) || !levels.length) return levels;

    const corpus = new Set();
    for (const level of levels) {
      for (const word of level.words || []) corpus.add(String(word).toUpperCase());
      for (const word of level.bonus || []) corpus.add(String(word).toUpperCase());
    }
    const pool = [...corpus];
    const random = rng(seed);

    return levels.map((level) => {
      const letters = String(level.letters || '').toUpperCase();
      if (!letters) return level;
      const counts = letterCount(letters);
      const fits = pool.filter((word) => word.length >= 3 && word.length <= letters.length && fitsInto(word, counts));
      // Слово, которое использует все буквы, — опора уровня: без него набор
      // букв перестаёт читаться как загадка.
      const anchor = fits.find((word) => word.length === letters.length)
        || (level.words || []).map((word) => String(word).toUpperCase()).sort((a, b) => b.length - a.length)[0];
      // Длинные слова идут в основные, трёхбуквенные — в бонусные. Без этого
      // первый уровень легко набирается из «АИР», «АОД», «ИОРА»: слова корпуса
      // настоящие, но начинать игру с них тяжелее, чем задумано.
      const rest = fits.filter((word) => word !== anchor);
      const long = shuffled(rest.filter((word) => word.length >= 4), random);
      const short = shuffled(rest.filter((word) => word.length === 3), random);

      const mainCount = Math.max(3, (level.words || []).length);
      const bonusCount = Math.max(2, (level.bonus || []).length);
      const picked = [...long, ...short].slice(0, mainCount - 1);
      const leftovers = [...short, ...long].filter((word) => !picked.includes(word));
      const words = [anchor, ...picked].filter(Boolean);
      // Длинные слова первыми: кроссворд игры кладёт их в основу сетки.
      words.sort((a, b) => b.length - a.length || a.localeCompare(b));
      const bonus = leftovers.slice(0, bonusCount);

      // Меньше трёх слов — сетку не собрать; такой уровень остаётся исходным.
      if (words.length < 3) return level;
      return { ...level, words, bonus };
    });
  }

  // --- «Поиск библейских слов» ---------------------------------------------------

  function wordsearch(levels) {
    const seed = seedOf('ws');
    if (!seed || !Array.isArray(levels) || levels.length < 2) return levels;
    // Порядковый номер остаётся на месте, меняется содержимое: иначе выбор
    // уровня в списке начнёт прыгать между запусками.
    const order = shuffled(levels, rng(seed));
    return order.map((level, index) => ({ ...level, id: levels[index].id }));
  }

  window.WordGameShuffle = { wow, wordsearch, reshuffle, seedOf };
})();
