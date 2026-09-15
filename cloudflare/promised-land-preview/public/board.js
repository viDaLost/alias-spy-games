// board.js — данные поля «Земли обетованной».
//
// Здесь только данные: их читают и движок, и интерфейс, и проверка. Ни логики,
// ни DOM — иначе поле нельзя будет посчитать без браузера, а счётный прогон на
// две тысячи партий как раз этого и требует.
//
// Порядок величин взят у «Монополии» намеренно: её ценовая лестница
// сбалансирована девяноста годами игры. Переделывается финал, а не прайс-лист.

window.PromisedLandBoard = (() => {
  'use strict';

  const START_SILVER = 1500;
  const HARVEST = 200;          // урожай за прохождение «Исхода»
  const RANSOM = 50;            // выкуп из темницы
  const PRISON_TURNS = 3;
  const ROAD_PRICE = 200;
  const ROAD_RENT = [25, 50, 100, 200];
  const WELL_PRICE = 150;
  const WELL_MULT = [4, 10];    // за один источник и за оба
  const OFFERING = 100;
  const TITHE_RATE = 0.1;
  const TITHE_MIN = 50;
  const TITHE_MAX = 400;

  // Наследие
  const HERITAGE_PER_TITHE = 100;   // сиклей десятины за одно очко
  const HERITAGE_PER_SILVER = 500;  // сиклей в юбилей за одно очко
  const HERITAGE_ALTAR = 3;
  const HERITAGE_REDEEM = 5;

  /*
    Лестница множителей сжимается к дорогим уделам: у дешёвого удела застройка
    обязана окупаться кратно, у дорогого базовая аренда и так велика. Один
    общий множитель на все группы дал бы башню на Хевроне за 3750 при старте
    в 1500 — цену, которой никто никогда не заплатит.
  */
  const GROUPS = {
    negev:    { name: 'Негев',    color: '#c08a3e', build: 50,  ladder: [5, 15, 45, 62, 75] },
    judah:    { name: 'Иудея',    color: '#a2543f', build: 50,  ladder: [5, 15, 42, 57, 68] },
    benjamin: { name: 'Вениамин', color: '#7c6a9c', build: 100, ladder: [5, 15, 39, 52, 61] },
    ephraim:  { name: 'Ефрем',    color: '#4e7c59', build: 100, ladder: [5, 15, 36, 46, 54] },
    galilee:  { name: 'Галилея',  color: '#3e7c8c', build: 150, ladder: [5, 15, 33, 41, 47] },
    fathers:  { name: 'Отцы',     color: '#1e4b78', build: 200, ladder: [5, 15, 30, 36, 40] },
  };

  const LEVELS = ['Колодец', 'Шатёр', 'Дом', 'Ограда', 'Башня'];
  const ROAD_COLOR = '#8a8577';
  const WELL_COLOR = '#2e6a7e';

  /*
    slug — имя файла картинки для клетки. Оно лежит здесь, рядом с клеткой, а
    не отдельным списком: отдельный список разъедется с полем при первой же
    правке, и игра начнёт показывать чужой рисунок. У «Десятины», «Провидения»
    и «Милости» клеток несколько, а рисунок один — slug у них общий.
  */
  const plot = (n, slug, group, name, price, base) => ({ n, slug, kind: 'plot', group, name, price, base });
  const road = (n, slug, name) => ({ n, slug, kind: 'road', name, price: ROAD_PRICE });
  const well = (n, slug, name) => ({ n, slug, kind: 'well', name, price: WELL_PRICE });
  const spot = (n, slug, kind, name, note) => ({ n, slug, kind, name, note });

  const BOARD = [
    spot(0, 'icon-exodus', 'exodus', 'Исход', 'Начало пути. Прошли круг — собрали урожай.'),
    plot(1, 'beersheba', 'negev', 'Вирсавия', 60, 2),
    spot(2, 'icon-mercy', 'mercy', 'Милость', 'Дела милосердия.'),
    plot(3, 'gerar', 'negev', 'Герар', 80, 4),
    spot(4, 'icon-tithe', 'tithe', 'Десятина', 'Десятая часть серебра.'),
    road(5, 'road-patriarchs', 'Путь патриархов'),
    plot(6, 'tekoa', 'judah', 'Фекоя', 100, 6),
    spot(7, 'icon-providence', 'providence', 'Провидение', 'События и перемещения.'),
    plot(8, 'bethlehem', 'judah', 'Вифлеем', 120, 6),
    spot(9, 'icon-prison', 'prison', 'Темница', 'Мимоходом — ничего.'),
    plot(10, 'engedi', 'judah', 'Ен-Геди', 140, 10),
    well(11, 'well-jacob', 'Колодец Иакова'),
    plot(12, 'gibeah', 'benjamin', 'Гива', 160, 12),
    plot(13, 'ramah', 'benjamin', 'Рама', 180, 12),
    road(14, 'road-kings', 'Царский путь'),
    plot(15, 'bethel', 'benjamin', 'Вефиль', 200, 16),
    spot(16, 'icon-providence', 'providence', 'Провидение', 'События и перемещения.'),
    plot(17, 'shiloh', 'ephraim', 'Силом', 220, 20),
    spot(18, 'icon-tent', 'tent', 'Шатёр Авраама', 'Гостеприимство: котёл ваш.'),
    plot(19, 'tirzah', 'ephraim', 'Фирца', 240, 20),
    spot(20, 'icon-providence', 'providence', 'Провидение', 'События и перемещения.'),
    plot(21, 'succoth', 'ephraim', 'Сокхоф', 260, 24),
    spot(22, 'icon-offering', 'offering', 'Приношение', 'Сто сиклей в котёл.'),
    road(23, 'road-sea', 'Путь моря'),
    plot(24, 'cana', 'galilee', 'Кана', 280, 28),
    well(25, 'well-gihon', 'Источник Гихон'),
    plot(26, 'nazareth', 'galilee', 'Назарет', 300, 28),
    spot(27, 'icon-slander', 'slander', 'Навет', 'Оговорили перед царём — в темницу.'),
    plot(28, 'capernaum', 'galilee', 'Капернаум', 320, 32),
    spot(29, 'icon-mercy', 'mercy', 'Милость', 'Дела милосердия.'),
    plot(30, 'shechem', 'fathers', 'Сихем', 350, 40),
    spot(31, 'icon-tithe', 'tithe', 'Десятина', 'Десятая часть серебра.'),
    road(32, 'road-desert', 'Путь пустыни'),
    spot(33, 'icon-providence', 'providence', 'Провидение', 'События и перемещения.'),
    plot(34, 'hebron', 'fathers', 'Хеврон', 400, 50),
    spot(35, 'icon-mercy', 'mercy', 'Милость', 'Дела милосердия.'),
  ];

  const CORNERS = [0, 9, 18, 27];
  const OWNABLE = new Set(['plot', 'road', 'well']);

  const round5 = (value) => Math.round(value / 5) * 5;

  /** Аренда удела по ступеням застройки: [пусто, колодец, шатёр, дом, ограда, башня]. */
  function ladderOf(cell) {
    if (cell.kind !== 'plot') return null;
    return [cell.base, ...GROUPS[cell.group].ladder.map((m) => round5(cell.base * m))];
  }

  function colorOf(cell) {
    if (cell.kind === 'plot') return GROUPS[cell.group].color;
    if (cell.kind === 'road') return ROAD_COLOR;
    if (cell.kind === 'well') return WELL_COLOR;
    return '';
  }

  /** Клетки одного удела — для правила «строить только на полной группе». */
  function groupCells(group) {
    return BOARD.filter((cell) => cell.kind === 'plot' && cell.group === group).map((cell) => cell.n);
  }

  /*
    Клетка 0 — правый нижний угол, дальше против часовой стрелки: так лежит
    поле в «Монополии», и так его и ожидают увидеть. Возвращается пара
    [строка, столбец] в сетке 10×10, по периметру которой ровно 36 мест.
  */
  function gridPlace(n) {
    if (n === 0) return [10, 10];
    if (n < 9) return [10, 10 - n];
    if (n === 9) return [10, 1];
    if (n < 18) return [19 - n, 1];
    if (n === 18) return [1, 1];
    if (n < 27) return [1, n - 17];
    if (n === 27) return [1, 10];
    return [n - 26, 10];
  }

  return {
    BOARD, GROUPS, LEVELS, CORNERS, OWNABLE,
    START_SILVER, HARVEST, RANSOM, PRISON_TURNS,
    ROAD_PRICE, ROAD_RENT, WELL_PRICE, WELL_MULT,
    OFFERING, TITHE_RATE, TITHE_MIN, TITHE_MAX,
    HERITAGE_PER_TITHE, HERITAGE_PER_SILVER, HERITAGE_ALTAR, HERITAGE_REDEEM,
    ROAD_COLOR, WELL_COLOR,
    ladderOf, colorOf, groupCells, gridPlace, round5,
  };
})();
