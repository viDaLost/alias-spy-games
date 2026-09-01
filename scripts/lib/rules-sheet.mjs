// Общий приём для проверок, которые играют в игры.
//
// При первом входе в игру приложение показывает её правила поверх экрана —
// именно это и просили в поддержке. Проверки же занимаются механикой игр, а не
// первым знакомством, и модальное окно им мешает нажимать на кнопки.
//
// Поэтому они стартуют в состоянии человека, который правила уже видел. Само
// первое знакомство проверяется отдельно, в check-game-rules.mjs: там оно и
// должно ломаться, если сломается.

const GAMES = [
  'biblical-match-three', 'bible-wow', 'bible-wordsearch', 'sacred-word',
  'kids-ark-pairs', 'alias', 'coimaginarium', 'guess', 'describe', 'spy', 'quartet',
];

/** Ставит отметку «правила прочитаны» до запуска страницы. */
export async function skipFirstRunRules(target) {
  await target.addInitScript((games) => {
    try {
      const seen = {};
      for (const key of games) seen[key] = 1;
      localStorage.setItem('game_rules_seen_v1', JSON.stringify(seen));
    } catch { /* приватный режим — окно закроется вручную */ }
  }, GAMES);
}
