(() => {
  // Ставит в заголовок игры её собственную иконку — ту же, что на карточке в
  // меню. Раньше «Шпион» открывался с эмодзи 🕵️ из системного шрифта, хотя на
  // карточке была прорисованная иконка: переход из меню в игру выглядел как
  // переход в другое приложение.
  //
  // Сделано одним местом, а не правкой каждой игры: заголовки собираются в
  // разных файлах по-разному, а признак открытой игры один — data-current-game.

  const ICONS = {
    alias: 'alias', coimaginarium: 'idea', guess: 'character', describe: 'describe',
    spy: 'spy', quartet: 'quartet', 'bible-wow': 'words', 'bible-wordsearch': 'search',
    'sacred-word': 'sacred', 'kids-ark-pairs': 'ark',
  };

  // Ведущий эмодзи вместе с модификаторами и следующим пробелом.
  const LEADING_EMOJI = /^\s*(?:\p{Extended_Pictographic}|\p{Emoji_Presentation})(?:️|‍\p{Extended_Pictographic}|[\u{1F3FB}-\u{1F3FF}])*\s*/u;

  function decorate() {
    const key = document.body?.dataset?.currentGame || '';
    const icon = ICONS[key];
    if (!icon) return;

    const container = document.getElementById('game-container');
    const heading = container?.querySelector('h2, .alias-title');
    if (!heading || heading.dataset.shellIcon === '1') return;

    const text = heading.textContent || '';
    if (!LEADING_EMOJI.test(text)) {
      heading.dataset.shellIcon = '1';
      return;
    }

    heading.textContent = text.replace(LEADING_EMOJI, '');
    const img = document.createElement('img');
    img.className = 'game-shell__icon';
    img.src = `web/assets/icons/${icon}.webp`;
    img.alt = '';
    img.decoding = 'async';
    heading.prepend(img);
    heading.dataset.shellIcon = '1';
  }

  const observer = new MutationObserver(decorate);
  observer.observe(document.documentElement, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['data-current-game', 'data-mode'],
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', decorate, { once: true });
  } else {
    decorate();
  }

  window.addEventListener('pagehide', () => observer.disconnect(), { once: true });
})();
