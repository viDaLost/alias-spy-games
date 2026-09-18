/* global goToMainMenu */
// «Двенадцать колен» — экран игры.
//
// Правил здесь нет ни одного: что законно, что делает карта, кто выиграл и
// сколько взял очков — знают twelve-tribes-rules.js и twelve-tribes-engine.js,
// а этот файл только спрашивает их и показывает ответ. Разделение не ради
// чистоты: правила карточной игры проверяются машиной на тысячах раздач, и
// всё, что утекло в разметку, из-под этой проверки уходит.
//
// Отсюда же порядок в файле: сначала загрузка правил, потом сборка экрана,
// потом ходы соперников по таймеру, и в самом низу — уборка.

(function () {
  'use strict';

  /*
    Пути написаны целиком, а не собраны из частей, и это не многословие.
    Сборка локализованных копий переписывает в коде любой путь вида
    web/games/…, чтобы испанская игра брала испанские файлы; склеенный из
    двух кусков путь она не видит — и локализованная игра молча тянула бы
    русские правила. Тем же чтением живёт и проверка целостности ссылок.
  */
  const PARTS = [
    'web/games/twelve-tribes-rules.js',
    'web/games/twelve-tribes-engine.js',
    'web/games/twelve-tribes-bots.js',
  ];
  const STYLE = 'web/games/twelve-tribes.css';
  const VERSION = '1';

  /*
    Правила лежат отдельными файлами, а оболочка приложения умеет загружать
    только один. Поэтому их подтягивает сам экран — по очереди, потому что
    движок при разборе обращается к правилам, а боты к движку.
  */
  function loadPart(file) {
    return new Promise((resolve, reject) => {
      if (document.querySelector(`script[data-tt="${file}"]`)) { resolve(); return; }
      const script = document.createElement('script');
      script.src = `${file}?v=${VERSION}`;
      script.dataset.tt = file;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error(`Не удалось загрузить ${file}`));
      document.head.appendChild(script);
    });
  }

  function injectStyles() {
    const id = 'twelve-tribes-css';
    const href = `${STYLE}?v=${VERSION}`;
    const existing = document.getElementById(id);
    if (existing) { existing.href = href; return; }
    const link = document.createElement('link');
    link.id = id;
    link.rel = 'stylesheet';
    link.href = href;
    document.head.appendChild(link);
  }

  // ————————————————————————————————————————————— знаки станов

  /*
    Знак стана рисуется разметкой, а не картинкой: четыре простых силуэта
    весят меньше килобайта на всех и не ждут сети. Знак — второй способ узнать
    масть, кроме цвета: у каждого двенадцатого мужчины красный и зелёный не
    различаются, и карточная игра, где масть только цвет, для него не игра.
  */
  const SIGNS = {
    // Лев: голова с гривой из лучей.
    judah: '<circle cx="12" cy="13" r="5"/><path d="M12 3v3M6 5l2 2.6M18 5l-2 2.6M3 11h3M18 11h3M5 18l2.4-1.8M19 18l-2.4-1.8"/>'
      + '<circle cx="10" cy="12" r=".9" fill="currentColor" stroke="none"/><circle cx="14" cy="12" r=".9" fill="currentColor" stroke="none"/>',
    // Человек: голова и плечи.
    reuben: '<circle cx="12" cy="8" r="3.6"/><path d="M5 20c0-3.9 3.1-6.6 7-6.6s7 2.7 7 6.6"/>',
    // Телец: голова с рогами.
    ephraim: '<path d="M4 6c2.6 0 4.2 1.4 5 3M20 6c-2.6 0-4.2 1.4-5 3"/><path d="M7 11a5 5 0 0 1 10 0v2a5 5 0 0 1-10 0z"/>'
      + '<circle cx="10" cy="12" r=".9" fill="currentColor" stroke="none"/><circle cx="14" cy="12" r=".9" fill="currentColor" stroke="none"/>',
    // Орёл: расправленные крылья и голова.
    dan: '<path d="M12 8.5 8.6 11v4"/><circle cx="12" cy="6" r="2"/><path d="M12 9c-2.6 3-6 4.6-9 4.8 2.4 1.6 5.6 2 9 1.2 3.4.8 6.6.4 9-1.2-3-.2-6.4-1.8-9-4.8z"/>',
  };

  const drawnSign = (camp, size = 26) => `<svg class="tt-sign" viewBox="0 0 24 24" width="${size}" height="${size}"`
    + ' fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"'
    + ` aria-hidden="true">${SIGNS[camp] || ''}</svg>`;

  // ————————————————————————————————————————————— рисованный набор

  const ART = 'web/assets/twelve-tribes/';
  /*
    Что из набора уже нарисовано, игра спрашивает у списка, а не пробует
    картинки наугад. Причина простая: у файла, которого нет, браузер оставляет
    ошибку в консоли — и она была бы у каждого игрока, пока набор не собран
    целиком. Список лежит рядом с картинками и пересобирается проверкой
    (scripts/check-twelve-tribes-art.mjs --write).

    Набор приходит частями, и каждая часть включается сама собой: чего нет,
    то по-прежнему рисуется линиями.
  */
  const have = { signs: new Map(), actions: new Map(), cards: new Map() };

  async function loadArt() {
    try {
      const answer = await fetch(`${ART}art.json`, { cache: 'no-cache' });
      if (!answer.ok) return;
      const list = await answer.json();
      for (const part of ['signs', 'actions', 'cards']) {
        for (const file of list[part] || []) {
          const name = String(file).split('/').pop().replace(/\.(?:webp|png)$/i, '');
          have[part].set(name, String(file));
        }
      }
    } catch {
      // Списка нет или он битый — игра рисует знаки линиями, как и раньше.
    }
  }

  /*
    Путь к картинке возвращается полным, а не относительным.

    Относительный путь в свойстве CSS браузер считает не от страницы, а от той
    таблицы стилей, где свойство пригодилось, — и «web/assets/…» превращалось
    в «web/games/web/assets/…»: рубашка колоды и знаки действий не находились.
    У картинок в разметке той же беды нет, поэтому поломка была наполовину
    невидимой: станы рисовались, а действия — нет.
  */
  const artUrl = (part, name) => (have[part].has(name)
    ? new URL(have[part].get(name), document.baseURI).href : null);

  /*
    Рубашка колоды. Это единственная картинка набора, которая рисуется целиком,
    вместе с рамкой: у стопки карт рубашка и есть её лицо. Нет файла — остаётся
    прежняя штриховка.
  */
  const deckStyle = () => {
    const url = artUrl('cards', 'back');
    return url ? ` style="--back:url('${url}')"` : '';
  };

  /** Знак стана: нарисованный, если он есть, иначе линиями. */
  const signHTML = (camp, size = 26) => {
    const url = artUrl('signs', camp);
    if (!url) return drawnSign(camp, size);
    return `<img class="tt-sign" src="${url}" width="${size}" height="${size}" alt="" `
      + 'loading="eager" decoding="async" />';
  };

  /*
    Знак действия. Одна и та же «Суббота» бывает красной, синей, зелёной и
    золотой: цвет ей даёт стан карты, на которой она лежит. Поэтому рисунок
    берётся маской, а не картинкой — маска красится в цвет карты, картинка
    осталась бы чернильной на всех четырёх.
  */
  const actionHTML = (kind, camp, size = 22) => {
    const url = artUrl('actions', kind);
    if (!url) return drawnSign(camp, size);
    return `<span class="tt-act" style="--art:url('${url}');--size:${size}px" aria-hidden="true"></span>`;
  };

  // ————————————————————————————————————————————— запуск

  const timers = new Set();
  const later = (fn, ms) => {
    const id = setTimeout(() => { timers.delete(id); fn(); }, ms);
    timers.add(id);
    return id;
  };
  function stopTimers() {
    for (const id of timers) clearTimeout(id);
    timers.clear();
  }

  /*
    Семеро соперников — предел стола на восьмерых. Имена взяты из Писания и
    нарочно разной длины и звучания: за столом на восьмерых человек различает
    соседей по имени, а не по месту.
  */
  const BOT_NAMES = ['Асаф', 'Вооз', 'Нафан', 'Гедеон', 'Иофор', 'Елеазар', 'Ахия'];
  const SEATS = BOT_NAMES.map((one, at) => at + 1);

  /*
    Счётные слова. «2 карт» и «5 соперника» на экране игры — та же небрежность,
    что опечатка в имени: читается как недоделанное. Правило русского счёта
    короткое, и держать его в одном месте дешевле, чем писать «карт(ы)».
  */
  function plural(count, one, few, many) {
    const tens = count % 100;
    if (tens >= 11 && tens <= 14) return many;
    const last = count % 10;
    if (last === 1) return one;
    if (last >= 2 && last <= 4) return few;
    return many;
  }
  const cardsWord = (count) => plural(count, 'карта', 'карты', 'карт');
  const foesWord = (count) => plural(count, 'соперник', 'соперника', 'соперников');

  /*
    Порядок карт в руке.

    Рука раскладывается сама: станы держатся вместе, внутри стана сначала
    жребии по возрастанию, потом действия, а жребий колен и плен ложатся
    с краю — они кладутся на что угодно, и место им в конце.

    Это не украшение. Рука на десять карт вперемешку читается каждый ход
    заново: игрок ищет нужный цвет глазами вместо того, чтобы играть. Живой
    человек за столом первым делом раскладывает карты по мастям — здесь то же
    самое делает игра.
  */
  const KIND_ORDER = { number: 0, sabbath: 1, jordan: 2, journey: 3, lot: 4, exile: 5 };
  function orderHand(hand, R) {
    const camp = new Map(R.CAMP_IDS.map((id, at) => [id, at]));
    hand.sort((a, b) => {
      const campA = a.camp ? camp.get(a.camp) : 99;
      const campB = b.camp ? camp.get(b.camp) : 99;
      if (campA !== campB) return campA - campB;
      const kindA = KIND_ORDER[a.kind];
      const kindB = KIND_ORDER[b.kind];
      if (kindA !== kindB) return kindA - kindB;
      return (a.rank ?? 0) - (b.rank ?? 0);
    });
    return hand;
  }

  /*
    Полёт карты. Карта не появляется на новом месте, а прилетает со старого:
    взятая — из колоды в руку, сыгранная — с места того, кто её положил.

    Откуда лететь, разметка знает только после того, как нарисовала обе
    стороны, — поэтому смещение считается по настоящим прямоугольникам на
    экране и передаётся в стили числами. Углы и дуга остаются в таблице
    стилей: там им и место.
  */
  function flyFrom(card, from) {
    if (!card || !from) return;
    const to = card.getBoundingClientRect();
    if (!to.width || !from.width) return;
    card.style.setProperty('--fly-x', `${Math.round(from.left + from.width / 2 - to.left - to.width / 2)}px`);
    card.style.setProperty('--fly-y', `${Math.round(from.top + from.height / 2 - to.top - to.height / 2)}px`);
  }

  function startTwelveTribesGame() {
    const container = document.getElementById('game-container');
    if (!container) return;
    injectStyles();
    stopTimers();
    container.innerHTML = '<div class="tt-wrap"><p style="padding:24px;text-align:center">Раздаём карты…</p></div>';

    PARTS.reduce((chain, file) => chain.then(() => loadPart(file)), Promise.resolve())
      .then(() => loadArt())
      .then(() => { new Table(container).setup(); })
      .catch((error) => {
        console.error('«Двенадцать колен» не запустились', error);
        container.innerHTML = '<div class="tt-wrap"><section class="tt-setup"><h2>Не удалось открыть игру</h2>'
          + '<p>Правила не загрузились. Попробуйте вернуться в меню и открыть игру снова.</p>'
          + '<button type="button" class="tt-btn" data-back>В главное меню</button></section></div>';
        container.querySelector('[data-back]')?.addEventListener('click', () => {
          if (typeof goToMainMenu === 'function') goToMainMenu();
        });
      });
  }

  // ————————————————————————————————————————————— экран

  class Table {
    constructor(container) {
      this.root = container;
      this.R = window.TwelveTribesRules;
      this.E = window.TwelveTribesEngine;
      this.Bots = window.TwelveTribesBots;
      this.foes = 2;
      this.target = 300;
      this.state = null;
      this.wild = null;      // карта, для которой спрашиваем стан
      this.fresh = null;     // только что взятая карта: её видно по подсветке
      this.landing = null;   // место, с которого летит карта на сброс, или null
      this.sawReshuffle = -1; // какую перетасовку стол уже показал
      this.sawDir = 1;       // в какую сторону шёл круг, когда стол рисовали
      this.dealt = [];       // кому и сколько карт прилетело последним ходом
      this.flash = null;     // строка состояния на один раз
    }

    /* ——— начало партии ——— */
    setup() {
      stopTimers();
      this.root.innerHTML = `
        <div class="tt-wrap">
          <section class="tt-setup">
            <h2>Двенадцать колен</h2>
            <p>Израиль в пустыне стоял четырьмя станами вокруг скинии: Иуда на востоке,
              Рувим на юге, Ефрем на западе, Дан на севере (Числа 2). Кладите карту того же
              стана или того же жребия, а кто первым останется без карт, тот и взял раздачу.</p>
            <label class="tt-choice">
              <span>Соперников</span>
              <div class="tt-choice--wide" data-foes>
                ${SEATS.map((many) => `<button type="button" data-value="${many}"
                  aria-pressed="${many === this.foes}">${many}</button>`).join('')}
              </div>
              <small class="tt-choice-note" data-foes-note></small>
            </label>
            <label class="tt-choice">
              <span>Партия</span>
              <div data-target>
                <button type="button" data-value="0" aria-pressed="${this.target === 0}">Раздача<small>кто первым сбросит</small></button>
                <button type="button" data-value="300" aria-pressed="${this.target === 300}">До 300<small>очки за чужие карты</small></button>
              </div>
            </label>
            <div class="tt-row">
              <button type="button" class="tt-btn" data-start>Сдавать</button>
              <button type="button" class="tt-btn tt-btn--ghost" data-menu>В меню</button>
            </div>
          </section>
        </div>`;
      const pick = (group, apply) => {
        const box = this.root.querySelector(`[data-${group}]`);
        box.addEventListener('click', (event) => {
          const button = event.target.closest('button[data-value]');
          if (!button) return;
          for (const one of box.querySelectorAll('button')) one.setAttribute('aria-pressed', String(one === button));
          apply(Number(button.dataset.value));
        });
      };
      const foesNote = this.root.querySelector('[data-foes-note]');
      const sayFoes = () => {
        const total = this.foes + 1;
        foesNote.textContent = total === 2
          ? 'Вдвоём: «Иордан» возвращает ход вам же.'
          : `За столом ${total} — вы и ${this.foes} ${foesWord(this.foes)} от игры.`;
      };
      pick('foes', (value) => { this.foes = value; sayFoes(); });
      sayFoes();
      pick('target', (value) => { this.target = value; });
      this.root.querySelector('[data-start]').addEventListener('click', () => this.begin());
      this.root.querySelector('[data-menu]').addEventListener('click', () => {
        if (typeof goToMainMenu === 'function') goToMainMenu();
      });
    }

    begin() {
      const players = [{ name: 'Вы' }];
      for (let i = 0; i < this.foes; i += 1) players.push({ name: BOT_NAMES[i], isBot: true });
      this.state = this.E.createGame({ players, target: this.target });
      // Уровни вперемешку: один соперник посмотрит на вашу руку, другой играет
      // прямо. Так стол не читается заранее.
      this.state.players.forEach((player, seat) => { player.botLevel = seat % 2 ? 'elder' : 'scribe'; });
      this.buildTable();
      this.render();
      this.tick();
      /*
        Ход наружу для проверок. Правила и так наружу — без них проверить их
        нечем; партия же живёт внутри экрана, а спросить у неё «чей ход и что
        на столе» надо: иначе проверка видит только разметку и не может
        отличить «кнопка не нажалась» от «движок отказал».
      */
      window.TwelveTribesGame = { state: () => this.state, refresh: () => this.render() };
    }

    /* ——— разметка стола ——— */
    buildTable() {
      this.root.innerHTML = `
        <div class="tt-wrap">
          <div class="tt-table">
            <div class="tt-foes" data-foes></div>
            <div class="tt-middle">
              <div class="tt-deck" data-deck${deckStyle().slice(1) ? ' ' + deckStyle().trim() : ''}>
                <i class="tt-deck-layer"></i><i class="tt-deck-layer"></i>
                <i class="tt-deck-layer"></i><i class="tt-deck-layer"></i>
                <button type="button" data-draw><span>взять</span></button>
                <span class="tt-deck-count" data-deck-count></span>
              </div>
              <div class="tt-pile" data-pile></div>
              <div class="tt-camp" data-camp></div>
            </div>
            <p class="tt-status" data-status></p>
          </div>
          <div class="tt-hand-wrap">
            <div class="tt-hand-head">
              <span data-hand-title>Ваши карты</span>
              <button type="button" class="tt-tip-btn" data-hints>Что делают карты</button>
              <span data-score></span>
            </div>
            <div class="tt-hand" data-hand></div>
          </div>
          <div class="tt-row">
            <button type="button" class="tt-btn tt-btn--ghost" data-pass hidden>Оставить себе</button>
            <button type="button" class="tt-btn tt-btn--call" data-shabbat hidden>Шабат!</button>
            <button type="button" class="tt-btn tt-btn--call" data-catch hidden>Перебить!</button>
            <button type="button" class="tt-btn tt-btn--ghost" data-menu>В меню</button>
          </div>
        </div>`;
      const on = (name, fn) => this.root.querySelector(`[data-${name}]`).addEventListener('click', fn);
      on('draw', () => this.humanDraw());
      on('pass', () => this.humanPass());
      on('shabbat', () => { this.E.shabbat(this.state, 0); this.render(); });
      on('catch', () => {
        const seat = this.state.risk ? this.state.risk.seat : null;
        if (seat !== null && seat !== 0) this.humanCatch(seat);
      });
      on('hints', () => this.showHints());
      on('menu', () => { stopTimers(); if (typeof goToMainMenu === 'function') goToMainMenu(); });
      this.root.querySelector('[data-hand]').addEventListener('click', (event) => {
        const card = event.target.closest('[data-index]');
        if (card) this.humanPlay(Number(card.dataset.index));
      });
    }

    /*
      ——— карта ———

      Собрана как настоящая игральная: поле цвета стана, внутри белое поле с
      волосяной рамкой, в середине крупный знак, а по двум углам — мелкие
      метки, повёрнутые друг к другу на пол-оборота. Метки — не украшение: по
      ним карту узнают, когда она лежит в руке веером и видна только уголком.

      Место карты в веере и в стопке сброса передаётся сюда, а не дописывается
      к готовой разметке снаружи. Дописывалось — и получалось у карты два
      атрибута style подряд: второй браузер молча отбрасывал вместе с цветом
      стана, и вся колода становилась серой. Один тег собирается в одном месте.
    */
    cardHTML(card, extra = '', style = '', attrs = '') {
      const R = this.R;
      const kind = R.KINDS[card.kind];
      /*
        Метка угла. У жребия это цифра, у действия — его собственный знак, а не
        первая буква: «Суббота» и «Странствие» начинаются на одну, «Странствие»
        и «Плен» — тоже, и по такой метке карта не узнаётся вовсе. Знак в углу
        тот же, что в середине, только мелкий.
      */
      const turn = card.kind === 'number' && (card.rank === 6 || card.rank === 9)
        ? ' tt-corner--turn' : '';
      const tag = card.kind === 'number' ? String(card.rank)
        : kind.wild ? (card.kind === 'lot' ? 'Ж' : 'П')
          : actionHTML(card.kind, card.camp, 12);
      const corners = `<span class="tt-corner tt-corner--tl${turn}">${tag}</span>`
        + `<span class="tt-corner tt-corner--br${turn}">${tag}</span>`;
      /*
        Сколько карт карта выдаёт — написано на ней самой. Раньше «Странствие»
        и «Плен» отличались только словом, и сколько стоит каждая, игрок узнавал
        уже после того, как получил четыре карты на руки.
      */
      const draws = R.drawsOf(card);
      const plus = draws ? `<span class="tt-plus">+${draws}</span>` : '';
      // Короткая подсказка живёт на самой карте: и мышь её покажет, и голос
      // экранного чтения прочитает.
      const hint = `${kind.title}${draws ? ` +${draws}` : ''} — ${kind.note}`;

      if (kind.wild) {
        const quarters = R.CAMP_IDS.map((id) => `<i style="background:var(--${id})"></i>`).join('');
        const label = card.kind === 'lot' ? 'Жребий' : 'Плен';
        const art = artUrl('cards', card.kind);
        const face = art
          ? `<img class="tt-wild-art" src="${art}" alt="" loading="eager" decoding="async" />`
          : '';
        return `<div ${attrs}class="tt-card tt-card--wild ${extra}" style="${style}" title="${hint}" aria-label="${hint}">
          <div class="tt-quarters">${quarters}</div>
          ${corners}${plus}
          <span class="tt-face">${face}<span class="tt-kind">${label}</span></span>
          <span class="tt-name">${card.camp ? R.campOf(card.camp).name : 'все станы'}</span>
        </div>`;
      }
      const camp = R.campOf(card.camp);
      /*
        Знак стана лежит на карте водяным знаком — бледно, за цифрой. Так масть
        видна и не читая подписи, а цифра при этом остаётся главной.

        Только за цифрой: у карты действия в середине и так рисунок, и второй
        под ним превращает лицо карты в мешанину из двух картинок.
      */
      const mark = card.kind === 'number' ? artUrl('signs', card.camp) : null;
      const water = mark ? `<img class="tt-water" src="${mark}" alt="" loading="eager" decoding="async" />` : '';
      const face = card.kind === 'number'
        ? `<span class="tt-rank">${card.rank}</span>`
        : `${actionHTML(card.kind, card.camp, 26)}<span class="tt-kind">${kind.title}</span>`;
      return `<div ${attrs}class="tt-card ${extra}" style="--camp:var(--${card.camp});${style}" title="${hint}" aria-label="${hint}">
        ${water}${corners}${plus}
        <span class="tt-face">${face}</span>
        <span class="tt-name">${camp.name}</span>
      </div>`;
    }

    /* ——— перерисовка ——— */
    render() {
      const { state, R, E } = this;
      const me = state.players[0];
      const mine = state.turn === 0 && state.status === 'playing';

      /*
        ——— места за столом ———

        Места стоят не как попало, а по очереди хода: первым ваше, за ним
        тот, кто ходит следом за вами, и так до того, кто ходит перед вами.
        Читать стол слева направо — то же самое, что читать очередь.

        Зачем это нужно. Почти всё, что делает карта, она делает с тем, кто
        ходит следом: суббота гонит мимо него, странствие выдаёт ему две
        карты, плен — четыре. Не зная, кто это, карту кладут вслепую. А
        «Иордан» ещё и оборачивает круг — и очередь меняется целиком.

        Поэтому порядок здесь считается движком (E.nextSeat), а не берётся
        из порядка мест в раздаче: после иордана первое место занимает уже
        другой человек, и стол это показывает сам.

        Восьмером мест восемь, и каждое ужимается: на телефоне поместиться
        обязаны все, иначе двое последних оказываются за краем экрана и в
        игре их как бы нет.
      */
      const foeBox = this.root.querySelector('[data-foes]');
      const queue = [];
      for (let step = 1; step < state.players.length; step += 1) {
        queue.push(state.players[E.nextSeat(state, 0, step)]);
      }
      foeBox.dataset.seats = String(queue.length);
      const place = (at, many) => (many > 1 ? (at - (many - 1) / 2) / ((many - 1) / 2) : 0);
      const seats = [];
      /*
        Своё место — такое же место за столом, только первое и отмеченное.
        Без него очередь висит в воздухе: видно, кто за кем, и не видно, где
        в этом кругу вы сами.
      */
      seats.push(`<div class="tt-foe tt-foe--me${
  state.turn === 0 && state.status === 'playing' ? ' is-turn' : ''}" data-seat="0"
        style="--away:${place(0, queue.length + 1).toFixed(3)}">
        <b>Вы</b>
        <span class="tt-foe-meta">${me.hand.length} ${cardsWord(me.hand.length)}${
  me.said ? ' · шабат' : ''}${state.target && me.score ? ` · ${me.score}` : ''}</span>
      </div>`);
      seats.push(...queue.map((player, at) => {
        const turn = state.turn === player.id && state.status === 'playing' ? ' is-turn' : '';
        const backs = new Array(Math.min(player.hand.length, 7)).fill('<i></i>').join('');
        const risk = E.riskOpen(state) && state.risk.seat === player.id;
        // Первый за вами и последний перед вами названы словами: это два
        // места, которые в карточной игре решают всё.
        const tag = at === 0 ? 'следом' : at === queue.length - 1 ? 'перед вами' : '';
        return `<div class="tt-foe${turn}${at === 0 ? ' is-next' : ''}${risk ? ' is-risk' : ''}"
          data-seat="${player.id}"
          data-place="${at + 1}" style="--away:${place(at + 1, queue.length + 1).toFixed(3)}">
          <span class="tt-order">${at + 1}</span>
          <b>${player.name}</b>
          <span class="tt-foe-cards">${backs}</span>
          <span class="tt-foe-meta">${player.hand.length} ${cardsWord(player.hand.length)}${
  player.said ? ' · шабат' : ''}${state.target && player.score ? ` · ${player.score}` : ''}</span>
          ${risk ? '<span class="tt-foe-tag tt-foe-tag--risk">молчит!</span>'
    : tag ? `<span class="tt-foe-tag">${tag}</span>` : ''}
        </div>`;
      }));
      foeBox.innerHTML = seats.join('');

      /*
        Сброс — стопка, а не одна карта. Под верхней видны две прошлые, каждая
        под своим углом: так на столе видно, что игра идёт, и стопка растёт.
        Угол у карты свой и постоянный — он считается от её номера, а не
        выбирается заново на каждой перерисовке: иначе стопка дёргалась бы при
        каждом обновлении экрана.
      */
      const pile = this.root.querySelector('[data-pile]');
      const shown = state.pile.slice(-3);
      pile.innerHTML = shown.map((card, at) => {
        const last = at === shown.length - 1;
        const tilt = ((Number(String(card.id).replace(/\D/g, '')) % 11) - 5) * (last ? 0.6 : 1.7);
        const extra = `${last && this.landing !== null ? 'is-landing' : ''}${last ? '' : ' is-buried'}`;
        return this.cardHTML(card, extra, `--tilt:${tilt.toFixed(1)}deg;--depth:${shown.length - 1 - at}`);
      }).join('');
      const camp = R.campOf(state.camp);
      // Кружок стана — маленькая карта той же масти: на столе всё карты.
      this.root.querySelector('[data-camp]').innerHTML = `
        <span class="tt-camp-dot" style="--camp:var(--${state.camp})">${signHTML(state.camp, 26)}</span>
        <span>${camp.name}</span>
        <span style="opacity:.75;font-weight:600">${camp.side}</span>`;

      // Рука раскладывается по станам перед каждой перерисовкой: взятая карта
      // сама уходит к своим, а не остаётся с краю.
      orderHand(me.hand, R);
      const legal = new Set(E.legalMoves(state, 0));
      const handBox = this.root.querySelector('[data-hand]');
      // Восемь карт — тот предел, за которым рука перестаёт помещаться в
      // ширину телефона: дальше карты наезжают друг на друга.
      handBox.dataset.many = String(me.hand.length > 8);
      /*
        Рука держится веером. Каждой карте даётся её место в дуге — поворот и
        подъём считаются от середины руки, — и рука перестаёт быть рядом
        прямоугольников: она выглядит тем, чем и является, картами в руке.

        Числа передаются переменными, а не классами: углов столько же, сколько
        карт, и заводить под них классы значило бы писать таблицу стилей на
        двенадцать случаев.
      */
      const many = me.hand.length;
      handBox.style.setProperty('--hand', String(many));
      handBox.innerHTML = me.hand.map((card, index) => {
        const live = mine && legal.has(index);
        const extra = `${live ? 'is-live' : 'is-dim'}${card.id === this.fresh ? ' is-fresh' : ''}`;
        // Середина руки — ноль; края — крайние углы веера.
        const away = many > 1 ? (index - (many - 1) / 2) / ((many - 1) / 2) : 0;
        return this.cardHTML(card, extra, `--away:${away.toFixed(3)}`,
          `role="button" tabindex="0" data-index="${index}" `);
      }).join('');
      /*
        Сколько карт в колоде — видно на самой колоде. В карточной игре это
        знание общее: по нему решают, тянуть ли до последнего, и по нему же
        понятно, что сейчас сброс уйдёт обратно под колоду.
      */
      const deckBox = this.root.querySelector('[data-deck]');
      this.root.querySelector('[data-deck-count]').textContent = String(state.deck.length);
      deckBox.dataset.thin = String(state.deck.length < 8);
      /*
        Нечем ходить — колода зовёт. Подсказка не словами, а движением: строка
        состояния лежит под столом и в спешке её не читают, а шевельнувшаяся
        колода видна боковым зрением.
      */
      deckBox.dataset.hint = String(mine && state.phase === 'play' && legal.size === 0);
      /*
        Колода собралась заново — это видно. Сброс уходит под низ, и без
        отметки колода просто вдруг толстеет: игрок решает, что игра
        обсчиталась.
      */
      /*
        Круг обернулся — об этом говорится словами. Очередь на столе
        перестраивается сама, и без объяснения это выглядит так, будто места
        перепутались: человек ищет соседа там, где тот был ходом раньше.
      */
      if (state.dir !== this.sawDir) {
        this.sawDir = state.dir;
        this.flash = 'Иордан обратился назад: круг пошёл в другую сторону';
      }
      if (state.reshuffled >= 0 && state.reshuffled !== this.sawReshuffle) {
        this.sawReshuffle = state.reshuffled;
        deckBox.classList.remove('is-refilled');
        void deckBox.offsetWidth;
        deckBox.classList.add('is-refilled');
        this.flash = 'Колода кончилась: сброс перевёрнут и перетасован';
      }
      this.root.querySelector('[data-hand-title]').textContent = `Ваши карты: ${me.hand.length}`;
      this.root.querySelector('[data-score]').textContent = state.target
        ? `${me.score} из ${state.target} очков` : '';

      // кнопки и строка состояния
      const pass = this.root.querySelector('[data-pass]');
      pass.hidden = !(mine && state.phase === 'drawn');
      const call = this.root.querySelector('[data-shabbat]');
      call.hidden = !(me.hand.length === 1 && !me.said && state.status === 'playing');
      /*
        «Перебить!» стоит там же, где «Шабат!», и по той же причине: обе кнопки
        живут считаные секунды, и искать их в этот миг некогда. Раньше она
        висела на карточке соперника — то есть каждый раз в новом месте, а при
        восьмерых за столом ещё и во втором ряду.
      */
      const catcher = this.root.querySelector('[data-catch]');
      const risky = E.riskOpen(state) && state.risk.seat !== 0 ? state.players[state.risk.seat] : null;
      catcher.hidden = !risky;
      if (risky) catcher.textContent = `Перебить: ${risky.name}`;
      this.root.querySelector('[data-draw]').disabled = !(mine && state.phase === 'play');

      const status = this.root.querySelector('[data-status]');
      if (this.flash) { status.textContent = this.flash; this.flash = null; }
      else if (state.status !== 'playing') status.textContent = '';
      else if (!mine) {
        // Следом вы — это стоит сказать: значит, действие чужой карты придёт
        // именно вам, и руку надо готовить сейчас.
        const next = E.nextSeat(state, state.turn);
        status.innerHTML = `Ходит <b>${state.players[state.turn].name}</b>`
          + (next === 0 ? ' — следом <b>вы</b>' : '');
      }
      else if (state.phase === 'drawn') status.textContent = 'Взяли карту: сыграйте её или оставьте себе';
      else if (legal.size) status.innerHTML = 'Ваш ход — <b>кладите карту</b>';
      else status.innerHTML = 'Нечем ходить — <b>возьмите карту</b>';

      /*
        Полёты считаются последними — когда обе стороны уже нарисованы и у них
        есть настоящее место на экране. Взятая карта летит из колоды в руку;
        сыгранная — с места того, кто её положил: своя снизу, чужая со своего
        края стола. Само движение живёт в таблице стилей, отсюда идут только
        точки отправления.
      */
      if (this.fresh) {
        flyFrom(handBox.querySelector('.tt-card.is-fresh'), deckBox.getBoundingClientRect());
      }
      /*
        Карты, выданные картой действия, летят из колоды к тому, кому они
        достались. Без этого «+4» соседу выглядит как цифра, которая молча
        сменилась на его месте: игрок не видит, что произошло, и не связывает
        это со своей картой.
      */
      if (this.dealt.length) {
        for (const one of this.dealt) this.flyBacks(one.seat, one.count);
        this.dealt = [];
      }
      if (this.landing !== null) {
        const from = this.landing === 0
          ? this.root.querySelector('.tt-hand-wrap')
          : this.root.querySelector(`[data-seat="${this.landing}"]`);
        flyFrom(pile.querySelector('.tt-card.is-landing'), from && from.getBoundingClientRect());
      }
      this.landing = null;
      this.fresh = null;
    }

    /*
      ——— любое действие движка ———

      Ход, взятие, перебивание — всё проходит здесь, и здесь же замечается,
      кому прибавилось карт. Считать это в каждом месте по отдельности значило
      бы однажды забыть: «Плен» выдаёт четыре, «Странствие» две, перебивание
      две, а взятая своей рукой — одна, и у неё своя дорога.
    */
    act(fn, skipSeat = -1) {
      const before = this.state.players.map((one) => one.hand.length);
      const result = fn();
      this.dealt = this.state.players
        .map((one, seat) => ({ seat, count: one.hand.length - before[seat] }))
        .filter((one) => one.count > 0 && one.seat !== skipSeat);
      return result;
    }

    /*
      Полёт рубашек из колоды. Карты летят по одной с задержкой — стопкой они
      читались бы как одна толстая карта, а счёт как раз и важен: две это
      странствие, четыре — плен.
    */
    flyBacks(seat, count) {
      const wrap = this.root.querySelector('.tt-wrap');
      const deck = this.root.querySelector('[data-deck]');
      const target = seat === 0
        ? this.root.querySelector('.tt-hand-wrap')
        : this.root.querySelector(`[data-seat="${seat}"]`);
      if (!wrap || !deck || !target) return;
      const base = wrap.getBoundingClientRect();
      const from = deck.getBoundingClientRect();
      const to = target.getBoundingClientRect();
      if (!from.width || !to.width) return;
      const back = artUrl('cards', 'back');
      for (let at = 0; at < Math.min(count, 4); at += 1) {
        const ghost = document.createElement('i');
        ghost.className = 'tt-fly';
        ghost.style.left = `${Math.round(from.left - base.left + from.width / 2 - 22)}px`;
        ghost.style.top = `${Math.round(from.top - base.top + from.height / 2 - 32)}px`;
        ghost.style.setProperty('--to-x', `${Math.round(to.left + to.width / 2 - from.left - from.width / 2)}px`);
        ghost.style.setProperty('--to-y', `${Math.round(to.top + to.height / 2 - from.top - from.height / 2)}px`);
        ghost.style.animationDelay = `${at * 90}ms`;
        if (back) ghost.style.setProperty('--back', `url('${back}')`);
        ghost.addEventListener('animationend', () => ghost.remove());
        wrap.appendChild(ghost);
      }
    }

    /* ——— ходы человека ——— */
    humanPlay(index) {
      const { state, R, E } = this;
      if (state.status !== 'playing' || state.turn !== 0) return;
      const card = state.players[0].hand[index];
      if (!card || !R.playable(state, card, state.players[0].hand)) {
        // Отказ объясняется словами, а не молчанием: игрок должен понять, чем
        // именно эта карта не подошла.
        this.root.querySelector('[data-status]').textContent = card && card.kind === 'exile'
          ? 'Плен кладут, только когда в руке нет карт нынешнего стана'
          : `Не подходит: нужен стан ${R.campOf(state.camp).name} или тот же жребий`;
        return;
      }
      if (R.KINDS[card.kind].wild) { this.askCamp(index); return; }
      this.commit(index, card.camp);
    }

    askCamp(index) {
      const R = this.R;
      const sheet = document.createElement('div');
      sheet.className = 'tt-sheet';
      sheet.innerHTML = `<div class="tt-sheet-card">
        <h3>Какой стан назовёте?</h3>
        <div class="tt-camps">
          ${R.CAMPS.map((camp) => `<button type="button" data-camp="${camp.id}" style="--camp:var(--${camp.id})">
            <span class="tt-camp-face">${signHTML(camp.id, 40)}</span>
            <b>${camp.name}</b><small>${camp.side}</small></button>`).join('')}
        </div>
        <button type="button" class="tt-btn tt-btn--ghost" data-cancel>Отмена</button>
      </div>`;
      sheet.addEventListener('click', (event) => {
        const pickCamp = event.target.closest('[data-camp]');
        if (pickCamp) { sheet.remove(); this.commit(index, pickCamp.dataset.camp); return; }
        if (event.target.closest('[data-cancel]') || event.target === sheet) sheet.remove();
      });
      document.body.appendChild(sheet);
      this.sheet = sheet;
    }

    /*
      ——— быстрые подсказки ———

      Что делает карта, спрашивают не до партии, а посреди неё: карты уже на
      руках, ход ваш, и уходить за общим справочником некогда. Поэтому
      подсказка живёт на самом столе, открывается одним нажатием и закрывается
      любым — а текст у неё тот же самый, что у карты в руке: он берётся из
      правил, и разойтись им негде.
    */
    showHints() {
      const R = this.R;
      const state = this.state;
      const camp = state.camp || R.CAMP_IDS[0];
      /*
        «Сосед» в правилах — это конкретный человек за этим столом, и подсказка
        называет его по имени. Знать, кому достанутся четыре карты, надо до
        хода, а не после.
      */
      const neighbour = state.players[this.E.nextSeat(state, 0)];
      const rows = ['number', 'sabbath', 'jordan', 'journey', 'lot', 'exile'].map((id) => {
        const kind = R.KINDS[id];
        const face = id === 'number' ? '<span class="tt-tip-rank">7</span>'
          : kind.wild
            ? `<span class="tt-tip-quarters">${R.CAMP_IDS.map((one) => `<i style="background:var(--${one})"></i>`).join('')}</span>`
            : actionHTML(id, camp, 26);
        const plus = kind.draw ? ` <span class="tt-plus tt-plus--inline">+${kind.draw}</span>` : '';
        /*
          Граница слова (\b) здесь не работает: для кириллицы она в
          javascript не срабатывает вовсе — «сосед» так и оставался словом
          «сосед». Поэтому подставляется по пробелу, просто и наверняка.
        */
        const note = neighbour && neighbour.id !== 0
          ? kind.note.replace(/^Сосед /, `${neighbour.name} `).replace(/ сосед /, ` ${neighbour.name} `)
          : kind.note;
        return `<div class="tt-tip">
          <span class="tt-tip-sign" style="--camp:var(--${camp})">${face}</span>
          <span class="tt-tip-text"><b>${kind.title}${plus}</b><small>${note}</small></span>
        </div>`;
      }).join('');
      const sheet = document.createElement('div');
      sheet.className = 'tt-sheet';
      sheet.innerHTML = `<div class="tt-sheet-card">
        <h3>Что делают карты</h3>
        <div class="tt-tips">${rows}</div>
        <p class="tt-tip-foot">Места на столе стоят по очереди хода: первое ваше, за ним тот, кто
          ходит следом за вами. Почти всё, что делает карта, она делает с ним.<br>
          Оставшись с одной картой, скажите <b>Шабат!</b> — иначе сосед перебьёт вас, и вы
          возьмёте две.</p>
        <button type="button" class="tt-btn tt-btn--ghost" data-cancel>Понятно</button>
      </div>`;
      sheet.addEventListener('click', (event) => {
        if (event.target.closest('[data-cancel]') || event.target === sheet) sheet.remove();
      });
      document.body.appendChild(sheet);
      this.sheet = sheet;
    }

    commit(index, camp) {
      this.landing = 0;
      this.act(() => this.E.play(this.state, 0, index, camp));
      this.render();
      this.tick();
    }

    humanDraw() {
      // Своя карта летит лицом в веер, и рубашка ей не нужна: полёт у неё свой.
      const card = this.act(() => this.E.draw(this.state, 0), 0);
      this.fresh = card ? card.id : null;
      this.render();
      this.tick();
    }

    humanPass() {
      this.E.pass(this.state, 0);
      this.render();
      this.tick();
    }

    humanCatch(seat) {
      this.act(() => this.E.catchOut(this.state, 0, seat));
      this.render();
    }

    /* ——— ходы соперников ——— */
    /*
      Ход бота идёт по таймеру, а не мгновенно. Это не украшение: мгновенный
      ход троих соперников выглядит как вспышка, после которой стол стал
      другим, — и человек не успевает понять, что произошло и почему ему вдруг
      четыре карты.
    */
    tick() {
      const { state, E, Bots } = this;
      if (state.status !== 'playing') { later(() => this.finish(), 700); return; }

      // Соперники говорят «Шабат» и перебивают зазевавшихся — с их забывчивостью.
      for (const player of state.players) {
        if (!player.isBot || player.hand.length !== 1 || player.said) continue;
        if (Bots.remembers(player.botLevel, Math.random)) {
          later(() => { E.shabbat(state, player.id); this.render(); }, 500 + Math.random() * 700);
        }
      }
      if (E.riskOpen(state) && state.risk.seat === 0) {
        const hunter = state.players.find((one) => one.isBot
          && Bots.notices(one.botLevel, Math.random));
        if (hunter) {
          later(() => {
            if (this.act(() => E.catchOut(state, hunter.id, 0))) {
              this.root.querySelector('[data-status]').textContent = `${hunter.name} перебил вас: берёте две карты`;
              this.render();
            }
          }, 1500 + Math.random() * 900);
        }
      }

      if (state.turn === 0) return;
      const seat = state.turn;
      later(() => {
        if (this.state !== state || state.turn !== seat || state.status !== 'playing') return;
        this.act(() => {
          const choice = Bots.pick(state, seat);
          if (choice) {
            this.landing = seat;
            E.play(state, seat, choice.index, choice.camp);
            return;
          }
          E.draw(state, seat);
          if (state.turn === seat && state.phase === 'drawn') {
            const after = Bots.pick(state, seat);
            if (after) { this.landing = seat; E.play(state, seat, after.index, after.camp); }
            else E.pass(state, seat);
          }
        });
        this.render();
        this.tick();
      }, 800 + Math.random() * 500);
    }

    /* ——— итоги ——— */
    finish() {
      const { state } = this;
      const winner = state.players[state.winner];
      const series = state.status === 'round';
      const rows = [...state.players]
        .sort((a, b) => b.score - a.score)
        .map((player) => `<div class="tt-score${player.id === 0 ? ' is-you' : ''}">
          <span>${player.name}${player.id === state.winner ? ' — раздача' : ''}</span>
          <span>${state.target
    ? `${player.score} ${plural(player.score, 'очко', 'очка', 'очков')}`
    : `${player.hand.length} ${cardsWord(player.hand.length)}`}</span>
        </div>`).join('');
      const log = state.log.slice(-6).reverse()
        .map((entry) => `<div>${entry.text}</div>`).join('');
      this.root.innerHTML = `
        <div class="tt-wrap">
          <section class="tt-setup">
            <h2>${winner.id === 0 ? 'Вы взяли раздачу' : `${winner.name} берёт раздачу`}</h2>
            <p>${series
    ? 'Партия идёт до трёхсот очков. Очки раздачи — это карты, оставшиеся на руках у остальных.'
    : 'Кто первым остался без карт, тот и выиграл.'}</p>
            <div class="tt-over">${rows}</div>
            <div class="tt-log">${log}</div>
            <div class="tt-row">
              <button type="button" class="tt-btn" data-next>${series ? 'Следующая раздача' : 'Ещё партию'}</button>
              <button type="button" class="tt-btn tt-btn--ghost" data-menu>В меню</button>
            </div>
          </section>
        </div>`;
      this.root.querySelector('[data-next]').addEventListener('click', () => {
        if (series) { this.E.nextRound(this.state); this.buildTable(); this.render(); this.tick(); }
        else this.setup();
      });
      this.root.querySelector('[data-menu]').addEventListener('click', () => {
        stopTimers();
        if (typeof goToMainMenu === 'function') goToMainMenu();
      });
    }
  }

  /*
    Уборка. Оболочка зовёт её при выходе в меню: без этого таймеры ботов
    продолжают ходить в уже закрытой игре — и однажды дорисовывают стол поверх
    другого экрана.
  */
  window.__twelveTribesCleanup = () => {
    stopTimers();
    document.querySelector('.tt-sheet')?.remove();
  };

  window.startTwelveTribesGame = startTwelveTribesGame;
}());
