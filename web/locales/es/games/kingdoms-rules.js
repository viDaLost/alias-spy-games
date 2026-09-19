// «Царства» — карта, царства, приказы и цели. Без разметки.
//
// Стратегия про тайные приказы и спор за области, а не пересказ Писания:
// мир условный, вдохновлённый библейскими landами, и ни одно место на карте
// не выдаётся за точную библейскую географию. Исторические слова здесь —
// атмосфера, а не источник.
//
// Файл нарочно не знает ни одного слова про экран. Причина та же, что у
// «Двенадцати колен»: правила стратегии ломаются тихо — область теряет
// хозяина без причины, приказ проходит там, где карта его не разрешает,
// защита посчиталась не по формуле, — и ни одну из этих бед не видно на
// экране. Увидеть их можно только числом: scripts/check-kingdoms.mjs
// прогоняет сотни партий ботами в Node, без браузера.
//
// Соседство задаётся здесь списком связей (EDGES), а не тем, что где
// нарисовано: у каждой связи есть тип («land» — по суше, «ford» — через
// брод), и от типа зависит, каким приказом её вообще можно перейти.

(function () {
  'use strict';

  /*
    Шесть областей-регионов расставлены кольцом, и это не только красиво:
    каждый регион устроен одинаково (четыре области по кругу — «rim», «cw»,
    «hub», «ccw»), поэтому у каждого царства при любом числе игроков ровно
    одинаковые стартовые возможности расти. Совпадающая топология — не
    совпадение, а единственный дешёвый способ дать честный старт без ручной
    подгонки чисел под каждую раскладку.
  */
  const REGIONS = [
    { id: 'primorye', name: 'Приморье', tagline: 'Гавани и солёный ветер побережья' },
    { id: 'nagorye', name: 'Нагорье', tagline: 'Каменные кручи и пастушьи тропы' },
    { id: 'dolina', name: 'Долина Йора', tagline: 'Плодородный берег вдоль реки' },
    { id: 'ravnina', name: 'Срединная равнина', tagline: 'Житницы и караванные дороги' },
    { id: 'kedem', name: 'Пустошь Кедем', tagline: 'Красные дюны и редкие колодцы' },
    { id: 'pogranichye', name: 'Порубежье', tagline: 'Ничья земля меж всех царств' },
  ];
  const REGION_IDS = REGIONS.map((region) => region.id);
  const REGION_RING = REGION_IDS; // порядок и есть кольцо соседства регионов

  /*
    Двадцать четыре области. Внутри региона они всегда лежат в цикле
    rim–cw–hub–ccw–rim: «rim» смотрит наружу кольца (там же и столица, если
    она у региона есть), «hub» смотрит внутрь, «cw»/«ccw» касаются соседних
    регионов по кольцу. Эта роль — не подпись для красоты: по ней ниже
    строятся все связи, и один и тот же код даёт одинаковую фигуру всем
    шести регионам.
  */
  const AREA_ROLE = ['rim', 'cw', 'hub', 'ccw'];

  const AREA_DEFS = {
    primorye: [
      { role: 'rim', name: 'Тарсийская Гавань', terrain: 'coast', value: 4, city: true, capitalOf: 'tarsis' },
      { role: 'cw', name: 'Прибрежный Путь', terrain: 'coast', value: 1 },
      { role: 'hub', name: 'Устье Реки', terrain: 'coast', value: 2 },
      { role: 'ccw', name: 'Рыбацкий Берег', terrain: 'coast', value: 1 },
    ],
    nagorye: [
      { role: 'rim', name: 'Крепость Ора', terrain: 'mountains', value: 4, city: true, capitalOf: 'or' },
      { role: 'cw', name: 'Скальный Перевал', terrain: 'mountains', value: 2 },
      { role: 'hub', name: 'Верхний Кряж', terrain: 'mountains', value: 2 },
      { role: 'ccw', name: 'Пастушьи Склоны', terrain: 'mountains', value: 2 },
    ],
    dolina: [
      { role: 'rim', name: 'Йор-Гило', terrain: 'plains', value: 4, city: true, capitalOf: 'yor' },
      { role: 'cw', name: 'Заливные Луга', terrain: 'plains', value: 1 },
      { role: 'hub', name: 'Йорский Брод', terrain: 'plains', value: 2 },
      { role: 'ccw', name: 'Виноградники Йора', terrain: 'plains', value: 1 },
    ],
    ravnina: [
      { role: 'rim', name: 'Престольный Град', terrain: 'plains', value: 4, city: true, capitalOf: 'prestol' },
      { role: 'cw', name: 'Житницы', terrain: 'plains', value: 3, city: true },
      { role: 'hub', name: 'Равнинный Брод', terrain: 'plains', value: 2 },
      { role: 'ccw', name: 'Дорога Караванов', terrain: 'plains', value: 1 },
    ],
    kedem: [
      { role: 'rim', name: 'Шатровый Стан', terrain: 'desert', value: 4, city: true, capitalOf: 'kedem' },
      { role: 'cw', name: 'Сухие Колодцы', terrain: 'desert', value: 1 },
      { role: 'hub', name: 'Красные Дюны', terrain: 'desert', value: 1 },
      { role: 'ccw', name: 'Оазис Пальм', terrain: 'desert', value: 2 },
    ],
    pogranichye: [
      { role: 'rim', name: 'Пограничная Твердыня', terrain: 'mountains', value: 3, city: true },
      { role: 'cw', name: 'Дозорные Холмы', terrain: 'mountains', value: 1 },
      { role: 'hub', name: 'Брод Порубежья', terrain: 'plains', value: 2 },
      { role: 'ccw', name: 'Пыльные Пределы', terrain: 'desert', value: 1 },
    ],
  };

  const areaId = (regionId, role) => `${regionId}-${role}`;

  const AREAS = REGION_IDS.flatMap((regionId) => AREA_DEFS[regionId].map((def) => ({
    id: areaId(regionId, def.role),
    name: def.name,
    region: regionId,
    role: def.role,
    terrain: def.terrain,
    value: def.value,
    city: Boolean(def.city),
    capitalOf: def.capitalOf || null,
  })));
  const AREA_BY_ID = new Map(AREAS.map((area) => [area.id, area]));
  const areaOf = (id) => AREA_BY_ID.get(id) || null;
  const areasOfRegion = (regionId) => AREAS.filter((area) => area.region === regionId);

  /*
    Связи. Внутри региона — цикл rim–cw–hub–ccw–rim, все по суше. По кольцу
    регионов «cw» одного касается «ccw» следующего — так кольцо и держится
    замкнутым. И только в двух местах хаб одного региона трогает хаб
    другого через брод: между Йором и Равниной, и между Порубежьем и
    Приморьем. Река течёт как раз этим внутренним кругом хабов — и не
    проходима нигде, кроме этих двух бродов: остальные хабы друг друга не
    касаются вовсе, не только не проходимы приказом.
  */
  const EDGES = [];
  const addEdge = (a, b, type) => EDGES.push({ a, b, type });
  for (const regionId of REGION_IDS) {
    addEdge(areaId(regionId, 'rim'), areaId(regionId, 'cw'), 'land');
    addEdge(areaId(regionId, 'cw'), areaId(regionId, 'hub'), 'land');
    addEdge(areaId(regionId, 'hub'), areaId(regionId, 'ccw'), 'land');
    addEdge(areaId(regionId, 'ccw'), areaId(regionId, 'rim'), 'land');
  }
  for (let at = 0; at < REGION_RING.length; at += 1) {
    const here = REGION_RING[at];
    const next = REGION_RING[(at + 1) % REGION_RING.length];
    addEdge(areaId(here, 'cw'), areaId(next, 'ccw'), 'land');
  }
  addEdge(areaId('dolina', 'hub'), areaId('ravnina', 'hub'), 'ford');
  addEdge(areaId('pogranichye', 'hub'), areaId('primorye', 'hub'), 'ford');

  const FORDS = EDGES.filter((edge) => edge.type === 'ford');

  /** Список связей одной области: {to, type} на каждого соседа. */
  const CONNECTIONS = new Map(AREAS.map((area) => [area.id, []]));
  for (const edge of EDGES) {
    CONNECTIONS.get(edge.a).push({ to: edge.b, type: edge.type });
    CONNECTIONS.get(edge.b).push({ to: edge.a, type: edge.type });
  }
  const connectionsOf = (id) => CONNECTIONS.get(id) || [];
  const neighborsOf = (id) => connectionsOf(id).map((one) => one.to);
  const edgeType = (a, b) => (connectionsOf(a).find((one) => one.to === b) || {}).type || null;
  const areAdjacent = (a, b) => Boolean(edgeType(a, b));

  /*
    Пять царств. У каждого дом — один из шести регионов (Порубежье без
    хозяина: это общая ничья земля с городом посередине карты, за который
    спорят все). Способность у каждого одна, простая и проверяемая числом —
    ни одна не завязана на превосходство народа, только на местность или
    приказ.
  */
  const KINGDOMS = [
    {
      id: 'tarsis', name: 'Тарсийский Союз', region: 'primorye', color: '#0891b2', emblem: 'anchor',
      tagline: 'Мореходы и торговцы побережья',
      ability: 'coastal_march',
      abilityTitle: 'Мореходы',
      abilityText: '+1 к силе «Похода», если и область-источник, и цель — побережье.',
    },
    {
      id: 'or', name: 'Дом Ора', region: 'nagorye', color: '#4d7c0f', emblem: 'peak',
      tagline: 'Стражи горных перевалов',
      ability: 'mountain_guard',
      abilityTitle: 'Горная стража',
      abilityText: '+1 к защите (сверх обычного горного бонуса) в своих горных областях.',
    },
    {
      id: 'yor', name: 'Дом Йора', region: 'dolina', color: '#4338ca', emblem: 'ford',
      tagline: 'Хозяева речных бродов',
      ability: 'ford_mastery',
      abilityTitle: 'Мастера переправ',
      abilityText: '+1 к силе приказа «Переправа» (итого 3 вместо 2).',
    },
    {
      id: 'prestol', name: 'Престол Равнины', region: 'ravnina', color: '#ca8a04', emblem: 'sheaf',
      tagline: 'Строители житниц и дорог',
      ability: 'grand_fortify',
      abilityTitle: 'Зодчие',
      abilityText: 'Предел укрепления в городских областях — 3 вместо 2.',
    },
    {
      id: 'kedem', name: 'Кочевники Кедема', region: 'kedem', color: '#c2410c', emblem: 'tent',
      tagline: 'Вестники красных дюн',
      ability: 'twin_scout',
      abilityTitle: 'Espías',
      abilityText: '«Разведка» раскрывает сразу два выбранных приказа вместо одного.',
    },
  ];
  const KINGDOM_BY_ID = new Map(KINGDOMS.map((kingdom) => [kingdom.id, kingdom]));
  const kingdomOf = (id) => KINGDOM_BY_ID.get(id) || null;
  const NEUTRAL_COLOR = '#94a3b8';

  /*
    Стартовые расстановки. Каждое царство начинает со своей столицы («rim»)
    и соседней с ней области («cw») своего же региона — то есть с одной и
    той же фигуры у всех, при любом числе игроков. Раскладки ниже — это
    только то, какие пять царств садятся за стол при двух, трёх, четырёх и
    пяти участниках, подобранные так, чтобы разрыв по кольцу между ними был
    как можно ровнее.
  */
  const STARTING_LAYOUTS = {
    2: ['tarsis', 'prestol'],
    3: ['tarsis', 'yor', 'kedem'],
    4: ['tarsis', 'or', 'prestol', 'kedem'],
    5: ['tarsis', 'or', 'yor', 'prestol', 'kedem'],
  };

  const startingAreasOf = (kingdomId) => {
    const kingdom = kingdomOf(kingdomId);
    if (!kingdom) return [];
    return [areaId(kingdom.region, 'rim'), areaId(kingdom.region, 'cw')];
  };

  /*
    Восемь приказов. Тот же набор каждый раунд, каждому игроку — вернее не
    «набор карт», а восемь всегда доступных видов действия: разместить за
    раунд можно не больше пяти из них, но какой именно, выбирают заново
    каждый раз.

    slot решает, что именно занимает приказ: «outgoing» — исходящую связь
    своей области (поход, переправа, манёвр — их в одной области не больше
    одного), «internal» — саму область (стража, укрепление — тоже не больше
    одного), «none» — ничего из этого не занимает (разведка ссылается на
    чужой приказ, а не на своё место).
  */
  const ORDERS = [
    { id: 'march1', title: 'Поход', slot: 'outgoing', edge: 'land', force: 1,
      text: 'Атака соседней по суше области силой 1.' },
    { id: 'march2', title: 'Поход', slot: 'outgoing', edge: 'land', force: 2,
      text: 'Атака соседней по суше области силой 2.' },
    { id: 'march3', title: 'Поход', slot: 'outgoing', edge: 'land', force: 3,
      text: 'Атака соседней по суше области силой 3.' },
    { id: 'guard', title: 'Guardia', slot: 'internal', edge: null, force: 0,
      text: '+2 к защите своей области на этот раунд.' },
    { id: 'fortify', title: 'Укрепление', slot: 'internal', edge: null, force: 0,
      text: '+1 к постоянному укреплению области (обычно до 2).' },
    { id: 'scout', title: 'Разведка', slot: 'none', edge: null, force: 0,
      text: 'Раскрывает вид и силу одного чужого закрытого приказа — только вам.' },
    { id: 'ford2', title: 'Переправа', slot: 'outgoing', edge: 'ford', force: 2,
      text: 'Атака через брод, отмеченный на карте, силой 2.' },
    { id: 'feint', title: 'Отвлекающий манёвр', slot: 'outgoing', edge: 'land', force: 0,
      isFeint: true, text: 'Выглядит как поход, но в столкновении не участвует.' },
  ];
  const ORDER_BY_ID = new Map(ORDERS.map((order) => [order.id, order]));
  const orderOf = (id) => ORDER_BY_ID.get(id) || null;

  const ROUNDS = 5;
  const ORDERS_PER_ROUND = 5;
  const TURN_LIMIT_MS = 90000;

  /*
    Защита области. У нейтральной — фиксированные числа по правилам (город
    защищён лучше и без хозяина), у занятой — сумма из формулы: единица за
    сам факт владения, укрепление, стража на этот раунд, бонус местности
    (только горы, и только +1 — остальные бонусы не заводим без понятного
    описания) и способность царства, если она про защиту.
  */
  const NEUTRAL_DEFENSE = 1;
  const NEUTRAL_CITY_DEFENSE = 2;
  const MOUNTAIN_DEFENSE_BONUS = 1;

  function neutralDefense(area) {
    return area.city ? NEUTRAL_CITY_DEFENSE : NEUTRAL_DEFENSE;
  }

  /** Предел постоянного укрепления для области этого царства. */
  function fortifyCapFor(kingdomId, area) {
    if (kingdomId === 'prestol' && area.city) return 3;
    return 2;
  }

  /*
    Цели. Каждая — с ключом проверки (kind), а не готовой функцией: сама
    проверка знает форму состояния партии и поэтому живёт в движке —
    незачем тащить сюда состояние ради трёх строк кода. Стоимость подобрана
    так, чтобы цель стоила тем больше, чем она реже случается сама собой.
  */
  const OBJECTIVES = [
    { id: 'capital', title: 'Хранитель столицы', points: 3,
      text: 'Удержите свою столицу до конца партии.' },
    { id: 'territory', title: 'Собиратель земель', points: 4,
      text: 'Контролируйте не менее пяти связных областей одновременно в конце партии.' },
    { id: 'ford', title: 'Мастер переправы', points: 4,
      text: 'Контролируйте обе области одного из бродов одновременно в конце партии.' },
    { id: 'cities', title: 'Собиратель городов', points: 5,
      text: 'Контролируйте не менее двух городов одновременно в конце партии (столица считается).' },
  ];
  const OBJECTIVE_BY_ID = new Map(OBJECTIVES.map((one) => [one.id, one]));
  const objectiveOf = (id) => OBJECTIVE_BY_ID.get(id) || null;

  /** Детерминированный выбор цели на игрока: тот же посев — та же раздача целей. */
  function assignObjectives(kingdomIds, random) {
    const pool = OBJECTIVES.map((one) => one.id);
    return kingdomIds.map(() => pool[Math.floor(random() * pool.length)]);
  }

  window.KingdomsRules = {
    REGIONS, REGION_IDS, REGION_RING,
    AREAS, AREA_BY_ID, areaOf, areasOfRegion, areaId,
    EDGES, FORDS, connectionsOf, neighborsOf, edgeType, areAdjacent,
    KINGDOMS, KINGDOM_BY_ID, kingdomOf, NEUTRAL_COLOR,
    STARTING_LAYOUTS, startingAreasOf,
    ORDERS, ORDER_BY_ID, orderOf,
    OBJECTIVES, objectiveOf, assignObjectives,
    ROUNDS, ORDERS_PER_ROUND, TURN_LIMIT_MS,
    NEUTRAL_DEFENSE, NEUTRAL_CITY_DEFENSE, MOUNTAIN_DEFENSE_BONUS,
    neutralDefense, fortifyCapFor,
  };
}());
