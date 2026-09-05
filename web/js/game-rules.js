(() => {
  'use strict';

  // Справочник правил.
  //
  // Обучение в играх показывается один раз при первом запуске и больше не
  // возвращается — а вопросы про комбинации и каскады возникают на двадцатом
  // уровне, а не на первом. Поэтому правила вынесены в отдельный раздел, куда
  // можно зайти в любой момент, и продублированы кнопкой «?» внутри игры.
  //
  // Числа здесь не выдуманы: пороги, цены бустеров и награды взяты из кода игр.
  // Если менять баланс, менять надо и здесь — иначе справочник начнёт врать.
  //
  // У одиночных игр к тексту прилагается наглядный разбор: сцена из
  // game-rules-demos.js проигрывает механику по шагам. У игр за столом и по
  // сети показывать нечего — там правила описывают людей, а не экран.

  const STORAGE_OPEN = 'game_rules_last_v1';
  const STORAGE_SEEN = 'game_rules_seen_v1';

  // Игры, у которых есть что сбрасывать. Для игр за столом прогресса нет, и
  // кнопка сброса в их правилах была бы обещанием, которое нечем выполнить.
  const RESETTABLE = new Set(['biblical-match-three', 'bible-wow', 'bible-wordsearch', 'sacred-word', 'kids-ark-pairs']);

  const REMINDER = 'Эти правила всегда под рукой: в главном меню внизу, кнопка «Правила игр».';

  const escapeHTML = (value) => String(value ?? '')
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#39;');

  // --- содержание -------------------------------------------------------------

  const GAMES = [
    {
      key: 'biblical-match-three',
      title: 'Библейские сокровища',
      icon: 'web/assets/icons/biblical-treasures-v38.webp',
      tagline: 'Матч-3: 50 уровней, особые фишки, каскады и препятствия',
      blocks: [
        {
          title: 'Цель',
          text: 'Каждый уровень даёт ограниченное число ходов и список целей сверху экрана. '
            + 'Выполните все цели до того, как ходы закончатся. Цели бывают такие:',
          list: [
            '<b>Набрать очки</b> — просто дойти до нужной суммы.',
            '<b>Собрать символ</b> — убрать нужное количество фишек одного вида. Этот вид всегда есть на поле.',
            '<b>Очистить препятствия</b> — сломать цепи, скрижали или выжечь тернии.',
            '<b>Зажечь светильники</b> — задеть каждый светильник совпадением.',
            '<b>Активировать особые фишки</b> — сработавшие особые фишки считаются, откуда бы они ни взялись.',
            '<b>Достичь каскада ×N</b> — устроить цепочку из N срабатываний подряд за один ход.',
            '<b>Опустить ковчег</b> — довести ковчег до нижнего ряда.',
          ],
        },
        {
          title: 'Совпадения и особые фишки',
          demo: 'bmt-specials',
          text: 'Меняйте местами две соседние фишки. Три одинаковых в ряд исчезают. '
            + 'Четыре и больше — оставляют на поле особую фишку:',
          table: {
            head: ['Что собрали', 'Что получится'],
            rows: [
              ['3 в ряд', 'ничего — фишки просто исчезают'],
              ['4 в ряд', '<b>Труба</b> ↯ — убирает весь ряд или весь столбец, вдоль той линии, которой её собрали'],
              ['Угол или крест<br>(Г, Т, +)', '<b>Свет</b> ✺ — взрыв 3×3 вокруг себя'],
              ['5 и больше в ряд', '<b>Радуга Завета</b> ✦ — убирает с поля все фишки того вида, к которому её подвели'],
            ],
          },
          note: 'Особая фишка остаётся на месте одной из собранных и срабатывает, когда её саму заденет совпадение — '
            + 'или когда её накроет другая особая фишка.',
        },
        {
          title: 'Комбинации двух особых фишек',
          demo: 'bmt-rainbow',
          text: 'Если поменять местами две особые фишки, получится не сумма, а отдельный удар:',
          table: {
            head: ['Что с чем', 'Что происходит'],
            rows: [
              ['Радуга + Радуга', '<b>Радуга Завета</b> — очищает всё поле целиком'],
              ['Радуга + любая особая', '<b>Сила Завета</b> — все фишки того вида превращаются в такие же особые и разом срабатывают'],
              ['Труба + Труба', '<b>Двойные трубы</b> — крест: сразу весь ряд и весь столбец'],
              ['Труба + Свет', '<b>Свет и трубы</b> — широкая полоса, взрыв вместе с линией'],
              ['Свет + Свет', '<b>Двойной свет</b> — взрыв увеличенного радиуса'],
            ],
          },
          note: 'Комбинация даёт +240 очков сверх обычного счёта за убранные фишки.',
        },
        {
          title: 'Каскады — откуда берутся большие очки',
          demo: 'bmt-basics',
          text: 'Когда фишки исчезают, верхние падают вниз и на их месте появляются новые. '
            + 'Если при падении случайно сложилось новое совпадение, оно тоже сработает — это и есть каскад. '
            + 'Счётчик «Каскад» сверху показывает, на какой ступени вы сейчас.',
          list: [
            'Очки за убранные фишки: <b>34 за фишку</b>, плюс очки за задетые препятствия.',
            'Каждая следующая ступень каскада умножает результат: <b>×1 · ×1,55 · ×2,1 · ×2,65</b> и дальше.',
            'То есть каскад ×4 приносит больше чем вдвое против того же хода без каскада.',
            'Каскад засчитывается по самой длинной цепочке за уровень, а не по последнему ходу.',
          ],
          note: 'Отсюда и главный приём: собирать не первое попавшееся, а то, что обрушит верхнюю часть поля.',
        },
        {
          title: 'Препятствия',
          demo: 'bmt-blockers',
          table: {
            head: ['Препятствие', 'Как убрать'],
            rows: [
              ['<b>Цепи</b> ◇', 'совпадение прямо на ней или в соседней клетке'],
              ['<b>Скрижали</b> ▦', 'только совпадение прямо на самой скрижали, соседнее не считается'],
              ['<b>Светильники</b> ✦', 'достаточно задеть один раз — совпадением на нём или рядом; он загорается и остаётся гореть'],
              ['<b>Тернии</b> ✤', 'только совпадение прямо на них. Если не выжигать, тернии разрастаются на соседние клетки'],
              ['<b>Ковчег</b>', 'двигать нельзя. Убирайте фишки под ним, чтобы он опускался, пока не дойдёт до нижнего ряда'],
            ],
          },
          note: 'У цепей и скрижалей бывает несколько слоёв — тогда их придётся задеть столько же раз.',
        },
        {
          title: 'Ковчег завета',
          demo: 'bmt-ark',
          text: 'Ковчег не участвует в совпадениях и не меняется местами. '
            + 'Убирайте фишки под ним — он опускается сам, пока не дойдёт до нижнего ряда. '
            + 'Именно этого требует цель «Опустить ковчег».',
        },
        {
          title: 'Бустеры и звёзды',
          text: 'Звёзды — общая валюта словесных игр и «Сокровищ». За пройденный уровень дают награду, '
            + 'указанную на его карточке. Тратить их можно на бустеры.',
          list: [
            '<b>До начала уровня:</b> Манна с небес — 6★ (две трубы на поле), Масло светильника — 8★ (один свет), Радуга Завета — 12★ (радужная фишка).',
            '<b>Во время уровня:</b> Праща Давида — 5★ (удар по одной клетке), Посох Моисея — 7★ (весь столбец), Трубы Иерихона — 10★ (волна 3×3), Радуга Завета — 8★ (делает выбранную фишку радужной).',
            'Бустер во время уровня <b>не тратит ход</b>.',
          ],
        },
        {
          title: 'Звёзды за уровень',
          text: 'После победы уровень оценивается тремя звёздами — по набранным очкам. '
            + 'У каждого уровня три своих порога: первая звезда — это ровно цель уровня, вторая и третья выше. '
            + 'Перепройти уровень ради третьей звезды можно в любой момент.',
          note: 'Если ходов не осталось, а цели не выполнены — уровень не засчитан, прогресс на нём не теряется.',
        },
        {
          title: 'Если ходов нет',
          text: 'Когда на поле не остаётся ни одного хода, поле перемешивается само и ход не тратится.',
        },
      ],
    },
    {
      key: 'bible-wow',
      title: 'Библейские слова',
      icon: 'web/assets/icons/words.webp',
      tagline: 'Соберите слова из набора букв',
      blocks: [
        {
          title: 'Как играть',
          demo: 'wow-word',
          text: 'Дан круг букв. Ведите пальцем по буквам, составляя слово. '
            + 'Уровень пройден, когда найдены все основные слова — они показаны пустыми клетками сверху.',
          list: [
            'Одно из основных слов всегда использует <b>все буквы</b> уровня — с него часто проще начать.',
            'Кроме основных есть <b>бонусные</b> слова: они не нужны для прохождения, но за каждое дают награду.',
            'Бонусом засчитывается любое слово, которое встречается в Библии — в синодальном переводе. '
              + 'Слова вне его игра не принимает, о чём и говорит прямо.',
          ],
        },
        {
          title: 'Звёзды',
          list: [
            'Пройденный уровень — <b>+10★</b> (один раз, повторное прохождение награду не даёт).',
            'Бонусное слово — <b>+2★</b>.',
            'Открыть одну букву — <b>−6★</b>.',
            'Открыть слово целиком — <b>−20★</b>.',
          ],
        },
      ],
    },
    {
      key: 'bible-wordsearch',
      title: 'Поиск библейских слов',
      icon: 'web/assets/icons/search.webp',
      tagline: 'Найдите слова в сетке букв',
      blocks: [
        {
          title: 'Как играть',
          demo: 'ws-find',
          text: 'Слова спрятаны в сетке по прямой: по горизонтали, вертикали или диагонали, '
            + 'в любую сторону, в том числе задом наперёд. Проведите пальцем от первой буквы к последней.',
        },
        {
          title: 'Звёзды',
          list: [
            'Найденное слово — <b>+2★</b>.',
            'Пройденный уровень — <b>+8★</b>.',
            'Подсказка — <b>−4★</b>.',
          ],
        },
      ],
    },
    {
      key: 'sacred-word',
      title: 'Священное слово',
      icon: 'web/assets/icons/sacred.webp',
      tagline: 'Откройте слово по буквам, пока горит светильник',
      blocks: [
        {
          title: 'Как играть',
          demo: 'sacred-letters',
          text: 'Загадано слово. Известны его категория и подсказка. Называйте буквы: '
            + 'угаданная открывается во всех местах сразу, неверная гасит светильник на одно деление.',
          list: [
            'Всего допускается <b>7 ошибок</b> — на восьмой светильник гаснет и раунд заканчивается.',
            'Уровень можно выбрать вручную в списке сверху и вернуться к любому пройденному.',
          ],
        },
      ],
    },
    {
      key: 'moses-nile',
      title: 'Моисей: Путь по Нилу',
      icon: 'web/assets/icons/moses-nile.webp',
      tagline: 'Трёхмерный забег по реке',
      blocks: [
        {
          title: 'Как играть',
          text: 'Корзинку несёт течением. Меняйте дорожку, поднимайтесь на волне через брёвна и '
            + 'ныряйте под нависший папирус. Чем дальше уплыли, тем быстрее становится река.',
          list: [
            '<b>Влево и вправо</b> — смена дорожки: кнопки, стрелки или свайп.',
            '<b>Вверх</b> — волна: перебросит через бревно.',
            '<b>Вниз</b> — нырок: проведёт под зарослями.',
            'Три сердца на весь путь. Крокодил, бегемот и борт ладьи отнимают по одному.',
          ],
        },
        {
          title: 'Усилители',
          text: 'Четыре знака встречаются по дороге и работают ограниченное время.',
          list: [
            '<b>Щит веры</b> — пузырь обволакивает корзинку и гасит один удар.',
            '<b>Свет Мириам</b> — лотосы сами сворачивают к корзинке.',
            '<b>Дыхание ветра</b> — течение несёт быстрее.',
            '<b>Милость</b> — возвращает потерянное сердце, а при полных — даёт очки.',
          ],
        },
      ],
    },
    {
      key: 'kids-ark-pairs',
      title: 'Найди пару',
      icon: 'web/assets/icons/ark.webp',
      tagline: 'Парные карточки для самых маленьких',
      blocks: [
        {
          title: 'Как играть',
          demo: 'pairs-flip',
          text: 'Открывайте по две карточки. Совпали — остаются открытыми, нет — закрываются обратно. '
            + 'Цель — открыть все пары.',
          list: [
            '<b>Лёгкий</b> — поле 4×4, 8 пар, две подсказки.',
            '<b>Средний</b> — 5×5, 12 пар и сюрприз, две подсказки.',
            '<b>Сложный</b> — 6×6, 18 пар, одна подсказка.',
            'В режиме «Спокойно» таймера нет. В режиме «На скорость» идёт время и ведутся рекорды, а подсказка добавляет 5 секунд.',
          ],
        },
      ],
    },
    {
      key: 'alias',
      title: 'Алиас',
      icon: 'web/assets/icons/alias.webp',
      tagline: 'Объясняйте слова на время',
      blocks: [
        {
          title: 'Как играть',
          text: 'Команды по очереди объясняют слова, не называя однокоренных. '
            + 'Пока идёт время, ведущий отмечает: угадали, не угадали или пропустить.',
          list: [
            'Длительность раунда настраивается — от 1 до 180 секунд.',
            'Угаданное слово приносит очко команде, пропущенное — нет.',
            'Использованные слова можно сбросить, чтобы играть колодой заново.',
          ],
        },
      ],
    },
    {
      key: 'spy',
      title: 'Соглядатай',
      icon: 'web/assets/icons/spy.webp',
      tagline: 'Секретная роль и общая локация',
      blocks: [
        {
          title: 'Как играть',
          text: 'Телефон передаётся по кругу: каждый смотрит свою карточку так, чтобы не видели остальные. '
            + 'Все, кроме соглядатаев, знают локацию; соглядатаи не знают ничего.',
          list: [
            'От 3 до 20 игроков, соглядатаев всегда меньше, чем игроков.',
            'Дальше — разговор: задавайте вопросы так, чтобы свои поняли, а соглядатай нет.',
            'Голосованием ищут соглядатая, соглядатай пытается угадать локацию.',
            'В онлайне каждый круг голосования выгоняет одного, а роли открываются только в конце партии: '
              + 'пока хоть один соглядатай за столом, игра продолжается.',
            'Соглядатаям в онлайне доступен свой закрытый чат — стол его не видит.',
          ],
        },
      ],
    },
    {
      key: 'quartet',
      title: 'Квартет',
      icon: 'web/assets/icons/quartet.webp',
      tagline: 'Соберите четыре карты одной группы',
      blocks: [
        {
          title: 'Как играть',
          text: 'В каждой группе четыре карты. Побеждает тот, кто соберёт больше полных квартетов.',
          list: [
            'В свой ход выберите соперника, затем недостающую карту из своей группы и спросите её.',
            'Карта есть у соперника — она сразу переходит к вам, и ход продолжается.',
            'Карты нет или вышло время — ход переходит следующему игроку.',
            'Собранный квартет засчитывается сам.',
          ],
        },
      ],
    },
    {
      key: 'coimaginarium',
      title: 'Соображариум',
      icon: 'web/assets/icons/idea.webp',
      tagline: 'Тема и буква — придумайте ответ',
      blocks: [
        {
          title: 'Как играть',
          text: 'На экране тема и буква. Все одновременно придумывают подходящее слово на эту букву. '
            + 'Кто первым назвал — тот и прав; спорные ответы решает компания.',
        },
      ],
    },
    {
      key: 'guess',
      title: 'Угадай персонажа',
      icon: 'web/assets/icons/character.webp',
      tagline: 'Вопросы, версии и логика',
      blocks: [
        {
          title: 'Как играть',
          text: 'Каждый по очереди смотрит своего персонажа и никому его не показывает. '
            + 'Дальше игроки задают вопросы, на которые можно ответить «да» или «нет», и вычисляют, кто им достался.',
        },
      ],
    },
    {
      key: 'describe',
      title: 'Опиши, но не называй',
      icon: 'web/assets/icons/describe.webp',
      tagline: 'Подсказки без прямого ответа',
      blocks: [
        {
          title: 'Как играть',
          text: 'Игроки по очереди смотрят своё слово и объясняют его, не называя напрямую. '
            + 'Можно говорить о признаках, назначении и ассоциациях. От 2 до 15 участников.',
        },
      ],
    },
  ];

  const BY_KEY = new Map(GAMES.map((game) => [game.key, game]));

  // --- разметка ---------------------------------------------------------------

  function blockMarkup(block) {
    const parts = [`<h4>${escapeHTML(block.title)}</h4>`];
    if (block.text) parts.push(`<p>${block.text}</p>`);
    if (block.demo) parts.push(`<div class="rd-stage" data-demo="${escapeHTML(block.demo)}" data-tile="34" aria-hidden="true"></div>`);
    if (block.list) parts.push(`<ul>${block.list.map((item) => `<li>${item}</li>`).join('')}</ul>`);
    if (block.table) {
      parts.push(`<div class="rules-table__scroll"><table class="rules-table">
        <thead><tr>${block.table.head.map((cell) => `<th>${escapeHTML(cell)}</th>`).join('')}</tr></thead>
        <tbody>${block.table.rows.map((row) => `<tr>${row.map((cell) => `<td>${cell}</td>`).join('')}</tr>`).join('')}</tbody>
      </table></div>`);
    }
    if (block.note) parts.push(`<p class="rules-note">${block.note}</p>`);
    return parts.join('');
  }

  function gameMarkup(game) {
    return `
      <article class="rules-game" data-rules-game="${escapeHTML(game.key)}">
        <button type="button" class="rules-game__head" data-rules-toggle aria-expanded="false">
          <img class="rules-game__icon" src="${escapeHTML(game.icon)}" alt="" loading="lazy" decoding="async" draggable="false" />
          <span class="rules-game__label">
            <strong>${escapeHTML(game.title)}</strong>
            <small>${escapeHTML(game.tagline)}</small>
          </span>
          <span class="rules-game__chevron" aria-hidden="true">▾</span>
        </button>
        <div class="rules-game__body" hidden>${game.blocks.map(blockMarkup).join('')}</div>
      </article>`;
  }

  function screenMarkup() {
    return `
      <section class="rules-shell">
        <div class="rules-topbar">
          <button type="button" class="rules-back" data-rules-back aria-label="Назад в меню">←</button>
          <div>
            <p class="rules-kicker">Справочник</p>
            <h2 class="rules-title">Правила игр</h2>
          </div>
        </div>
        <p class="rules-lead">Выберите игру, чтобы раскрыть правила. Всё, что здесь написано, — то, как игра считает на самом деле.</p>
        <div class="rules-list">${GAMES.map(gameMarkup).join('')}</div>
        <section class="rules-reset">
          <strong>Пройти всё заново</strong>
          <p>
            Сброс убирает пройденные уровни и откатывает очки рейтинга за них, а звёзды оставляет.
            В словесных играх слова после сброса перераспределяются между уровнями.
          </p>
          <button type="button" class="rules-reset__button" data-rules-reset>Сброс прогресса</button>
        </section>
      </section>`;
  }

  // --- экран ------------------------------------------------------------------

  function container() { return document.getElementById('game-container'); }

  function close() {
    const root = container();
    if (root) root.innerHTML = '';
    delete document.body.dataset.mode;
    delete document.body.dataset.rulesOpen;
    document.getElementById('menu-container')?.classList.remove('hidden');
    window.scrollTo({ top: 0, behavior: 'auto' });
  }

  function expand(article, open) {
    const body = article.querySelector('.rules-game__body');
    const head = article.querySelector('[data-rules-toggle]');
    if (!body || !head) return;
    body.hidden = !open;
    head.setAttribute('aria-expanded', open ? 'true' : 'false');
    article.classList.toggle('is-open', open);
    if (open) {
      try { localStorage.setItem(STORAGE_OPEN, article.dataset.rulesGame || ''); } catch { /* приватный режим */ }
    }
  }

  function open(key = '') {
    const root = container();
    if (!root) return;

    document.getElementById('menu-container')?.classList.add('hidden');
    document.body.dataset.mode = 'rules';
    document.body.dataset.rulesOpen = '1';
    root.innerHTML = screenMarkup();
    window.scrollTo({ top: 0, behavior: 'auto' });

    root.querySelector('[data-rules-back]')?.addEventListener('click', close);
    root.querySelector('[data-rules-reset]')?.addEventListener('click', () => {
      if (typeof window.openProgressReset === 'function') window.openProgressReset();
    });
    root.addEventListener('click', (event) => {
      const head = event.target.closest('[data-rules-toggle]');
      if (!head) return;
      const article = head.closest('[data-rules-game]');
      if (!article) return;
      expand(article, article.classList.contains('is-open') !== true);
      // Разборы внутри свёрнутого раздела скрыты, а не удалены: после раскрытия
      // их надо подхватить, иначе сцена останется пустым прямоугольником.
      window.GameRulesDemos?.scan();
    });

    let wanted = BY_KEY.has(key) ? key : '';
    if (!wanted) {
      try { wanted = localStorage.getItem(STORAGE_OPEN) || ''; } catch { wanted = ''; }
    }
    const target = root.querySelector(`[data-rules-game="${CSS.escape(BY_KEY.has(wanted) ? wanted : GAMES[0].key)}"]`);
    if (target) {
      expand(target, true);
      if (key) target.scrollIntoView({ block: 'start', behavior: 'auto' });
    }
    window.GameRulesDemos?.scan();
  }

  // --- вход из меню -----------------------------------------------------------

  const MENU_ICON = 'web/assets/icons/rules.webp?v=1';

  function addMenuCard() {
    const root = document.getElementById('system-actions');
    if (!root || document.getElementById('game-rules-btn')) return Boolean(root);
    const card = document.createElement('button');
    card.type = 'button';
    card.id = 'game-rules-btn';
    card.className = 'game-card game-card--rules';
    card.innerHTML = `
      <span class="game-card__icon game-card__icon--image">
        <img class="game-card__img" src="${MENU_ICON}" alt="Иконка раздела Правила игр"
             loading="eager" decoding="async" draggable="false" />
      </span>
      <span class="game-card__body">
        <span class="game-card__title">Правила игр</span>
        <span class="game-card__desc">Правила, разбор механик и сброс прогресса</span>
      </span>`;
    card.addEventListener('click', () => open());
    // Рейтинг и кнопка админа приходят позже и должны остаться после справочника.
    const after = document.getElementById('leaderboard-btn') || document.getElementById('admin-btn');
    if (after) root.insertBefore(card, after);
    else root.append(card);
    return true;
  }

  // --- кнопка «?» внутри игры --------------------------------------------------

  function currentGameKey() {
    const key = String(document.body?.dataset?.currentGame || '');
    return BY_KEY.has(key) ? key : '';
  }

  function syncHelpButton() {
    const key = currentGameKey();
    const existing = document.getElementById('game-rules-help');
    if (!key) { existing?.remove(); return; }
    if (existing) { existing.dataset.rulesKey = key; return; }

    const button = document.createElement('button');
    button.type = 'button';
    button.id = 'game-rules-help';
    button.className = 'rules-help';
    button.dataset.rulesKey = key;
    button.setAttribute('aria-label', 'Правила этой игры');
    button.textContent = '?';
    // Правила открываются поверх игры, а не вместо неё: выход в справочник
    // прерывал бы партию, а спрашивают о правилах как раз посреди партии.
    button.addEventListener('click', () => openSheet(button.dataset.rulesKey || ''));
    document.body.append(button);
  }

  // --- правила поверх игры ------------------------------------------------------
  //
  // Показывается один раз при первом входе в игру и дальше — по кнопке «?».
  // Отметка ставится при закрытии, а не при показе: свёрнутое на полуслове
  // приложение иначе съело бы правила молча.

  function seen() {
    try {
      const raw = JSON.parse(localStorage.getItem(STORAGE_SEEN) || '{}');
      return raw && typeof raw === 'object' ? raw : {};
    } catch { return {}; }
  }

  function markSeen(key) {
    const all = seen();
    all[key] = Date.now();
    try { localStorage.setItem(STORAGE_SEEN, JSON.stringify(all)); } catch { /* приватный режим */ }
    // У «Сокровищ» есть свой пошаговый разбор при первом запуске. Показывать его
    // сразу после этих правил — значит объяснить одно и то же дважды подряд.
    if (key === 'biblical-match-three') {
      try {
        const progress = window.BiblicalMatchThreeProgress;
        const state = progress?.load?.();
        if (state) {
          state.tutorialSeen = { ...(state.tutorialSeen || {}), 'v18-first-run': true };
          progress.save(state);
        }
      } catch { /* прогресс недоступен — покажется штатный разбор, это не ошибка */ }
    }
  }

  function sheetMarkup(game, first) {
    const reset = RESETTABLE.has(game.key) ? `
      <section class="rules-sheet__reset">
        <strong>Начать эту игру заново</strong>
        <p>Пройденные уровни забудутся, очки рейтинга за них откатятся, звёзды останутся.</p>
        <button type="button" class="rules-sheet__reset-button" data-sheet-reset>Сбросить прогресс</button>
      </section>` : '';
    return `
      <div class="rules-sheet__card" role="dialog" aria-modal="true" aria-label="Правила игры ${escapeHTML(game.title)}">
        <div class="rules-sheet__head">
          <img class="rules-sheet__icon" src="${escapeHTML(game.icon)}" alt="" loading="eager" decoding="async" draggable="false" />
          <div>
            <p class="rules-sheet__kicker">${first ? 'Как играть' : 'Правила'}</p>
            <h3 class="rules-sheet__title">${escapeHTML(game.title)}</h3>
          </div>
          <button type="button" class="rules-sheet__close" data-sheet-close aria-label="Закрыть">×</button>
        </div>
        <div class="rules-sheet__body">
          ${game.blocks.map(blockMarkup).join('')}
          ${reset}
          <p class="rules-sheet__reminder">${escapeHTML(REMINDER)}</p>
        </div>
        <div class="rules-sheet__actions">
          <button type="button" class="rules-sheet__all" data-sheet-all>Все правила</button>
          <button type="button" class="rules-sheet__ok" data-sheet-close>${first ? 'Начать игру' : 'Понятно'}</button>
        </div>
      </div>`;
  }

  function closeSheet(node, key) {
    markSeen(key);
    node.remove();
    document.documentElement.classList.remove('rules-sheet-open');
  }

  function openSheet(key, { first = false } = {}) {
    const game = BY_KEY.get(key);
    if (!game || document.getElementById('game-rules-sheet')) return false;

    const node = document.createElement('div');
    node.id = 'game-rules-sheet';
    node.className = 'rules-sheet';
    node.innerHTML = sheetMarkup(game, first);
    document.body.append(node);
    document.documentElement.classList.add('rules-sheet-open');

    node.addEventListener('click', (event) => {
      if (event.target.closest('[data-sheet-reset]')) {
        closeSheet(node, key);
        // Сброс живёт на своём экране: там подтверждение и видно, что именно
        // пропадёт. Из игры выходим её же способом, иначе останутся её таймеры.
        try { (window.appGoToMainMenu || window.goToMainMenu)?.(); } catch { /* игра уже закрыта */ }
        window.setTimeout(() => window.openProgressReset?.(), 0);
        return;
      }
      if (event.target.closest('[data-sheet-all]')) {
        closeSheet(node, key);
        try { (window.appGoToMainMenu || window.goToMainMenu)?.(); } catch { /* игра уже закрыта */ }
        window.setTimeout(() => open(key), 0);
        return;
      }
      if (event.target.closest('[data-sheet-close]') || event.target === node) closeSheet(node, key);
    });

    window.GameRulesDemos?.scan();
    return true;
  }

  // Наблюдатель дёргает install() на каждое изменение разметки, а показ нужен
  // один: без этого признака на игру набегали бы десятки отложенных показов.
  let pendingEntry = '';

  function offerOnEntry() {
    const key = currentGameKey();
    if (!key || seen()[key] || pendingEntry === key) return;
    pendingEntry = key;
    // Игра рисует свой экран не мгновенно: правила поверх пустого контейнера
    // выглядят как ошибка загрузки.
    window.setTimeout(() => {
      pendingEntry = '';
      if (currentGameKey() !== key || seen()[key]) return;
      openSheet(key, { first: true });
    }, 700);
  }

  function install() {
    addMenuCard();
    syncHelpButton();
    offerOnEntry();
  }

  const observer = new MutationObserver(install);
  observer.observe(document.documentElement, {
    childList: true, subtree: true, attributes: true, attributeFilter: ['data-current-game', 'data-mode'],
  });

  window.openGameRules = open;
  window.openGameRulesSheet = openSheet;

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
  else install();
})();
