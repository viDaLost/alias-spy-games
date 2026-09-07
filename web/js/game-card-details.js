(() => {
  // Durations are approximate, per round/level, not limits enforced by the game.
  const details = {
    alias: ['От 2 игроков', '≈ 1 мин / раунд', 'Без сети*'],
    coimaginarium: ['От 2 игроков', '≈ 5–10 мин', 'Без сети*'],
    guess: ['2 игрока', '≈ 5–10 мин', 'Без сети*'],
    describe: ['2–15 игроков', '≈ 5–10 мин', 'Без сети*'],
    spy: ['3–20 игроков', '≈ 10–15 мин', 'Вместе / онлайн'],
    quartet: ['2–15 игроков', '≈ 15–30 мин', 'Нужен интернет'],
    'bible-sketch': ['От 3 игроков', '≈ 10–20 мин', 'Нужен интернет'],
    'bible-wow': ['1 игрок', '≈ 2–5 мин / уровень', 'Без сети*'],
    'bible-wordsearch': ['1 игрок', '≈ 3–10 мин / уровень', 'Без сети*'],
    'sacred-word': ['1 игрок', '≈ 2–5 мин / уровень', 'Без сети*'],
    'kids-ark-pairs': ['1 игрок', '≈ 2–5 мин', 'Без сети*'],
    'moses-nile': ['1 игрок', '≈ 1–3 мин / забег', 'Без сети*'],
    'biblical-match-three': ['1 игрок', '≈ 3–5 мин / уровень', 'Без сети*'],
  };
  window.gameCardDetailsHTML = (key) => {
    const values = details[key];
    if (!values) return '';
    return `<span id="game-details-${key}" class="game-card__details">${values.map((value) => `<span>${value}</span>`).join('')}</span>`;
  };
})();
