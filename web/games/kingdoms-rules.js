// «Царства» — карта, царства, жетоны, карты и цели. Без разметки.
// Правила — настольной «Битвы за Рокуган», облик — библейский.
//
// Стратегия про тайные приказы и спор за области, а не пересказ Писания:
// мир условный, вдохновлённый библейскими землями, и ни одно место на карте
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
// брод). Войско переходит обе; через брод сильнее бьёт Галаад.

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
    { id: 'nagorye', name: 'Гора Сеир', tagline: 'Каменные кручи Едома и пастушьи тропы' },
    { id: 'dolina', name: 'Долина Иордана', tagline: 'Плодородный берег вдоль реки' },
    { id: 'ravnina', name: 'Земля Сеннаар', tagline: 'Равнина житниц и караванных дорог' },
    { id: 'kedem', name: 'Аравия', tagline: 'Красные дюны и редкие колодцы' },
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
      { role: 'rim', name: 'Тир', terrain: 'coast', value: 4, city: true, capitalOf: 'tarsis' },
      { role: 'cw', name: 'Прибрежный Путь', terrain: 'coast', value: 1 },
      { role: 'hub', name: 'Устье Реки', terrain: 'coast', value: 2 },
      { role: 'ccw', name: 'Рыбацкий Берег', terrain: 'coast', value: 1 },
    ],
    nagorye: [
      { role: 'rim', name: 'Восор', terrain: 'mountains', value: 4, city: true, capitalOf: 'or' },
      { role: 'cw', name: 'Скальный Перевал', terrain: 'mountains', value: 2 },
      { role: 'hub', name: 'Верхний Кряж', terrain: 'mountains', value: 2 },
      { role: 'ccw', name: 'Пастушьи Склоны', terrain: 'mountains', value: 2 },
    ],
    dolina: [
      { role: 'rim', name: 'Рамоф Галаадский', terrain: 'plains', value: 4, city: true, capitalOf: 'yor' },
      { role: 'cw', name: 'Заливные Луга', terrain: 'plains', value: 1 },
      { role: 'hub', name: 'Броды Иордана', terrain: 'plains', value: 2 },
      { role: 'ccw', name: 'Маханаим', terrain: 'plains', value: 1 },
    ],
    ravnina: [
      { role: 'rim', name: 'Вавилон', terrain: 'plains', value: 4, city: true, capitalOf: 'prestol' },
      { role: 'cw', name: 'Житницы', terrain: 'plains', value: 3, city: true },
      { role: 'hub', name: 'Равнинный Брод', terrain: 'plains', value: 2 },
      { role: 'ccw', name: 'Дорога Караванов', terrain: 'plains', value: 1 },
    ],
    kedem: [
      { role: 'rim', name: 'Шатры Кидарские', terrain: 'desert', value: 4, city: true, capitalOf: 'kedem' },
      { role: 'cw', name: 'Сухие Колодцы', terrain: 'desert', value: 1 },
      { role: 'hub', name: 'Красные Дюны', terrain: 'desert', value: 1 },
      { role: 'ccw', name: 'Елим', terrain: 'desert', value: 2 },
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
    другого через брод: между Галаадом и Сеннааром, и между Порубежьем и
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
    Пять царств — с именами, как они написаны в Синодальном переводе:
    Фарсис (мореходы), Едом (гора Сеир), Галаад (переправы через Иордан),
    Сеннаар (равнина, где строили город), Кидар (шатры Кидарские). Каждое
    имя и имя его столицы есть в тексте перевода — это сверяет
    check-kingdoms.mjs. У каждого дом — один из шести регионов (Порубежье без
    хозяина: это общая ничья земля с городом посередине карты, за который
    спорят все). Как у кланов «Рокугана», у каждого царства две свои черты:
    способность, простая и проверяемая числом, и один особый жетон битвы
    (clanToken), которого нет ни у кого другого, — он лежит в запасе
    сверх общих двадцати пяти.
  */
  const KINGDOMS = [
    {
      id: 'tarsis', name: 'Фарсис', region: 'primorye', color: '#0891b2', emblem: 'anchor',
      tagline: 'Мореходы и торговцы побережья',
      ability: 'seafarers',
      abilityTitle: 'Фарсисские корабли',
      abilityText: '+1 к силе каждого вашего жетона «Корабли» — и в атаке, и в обороне.',
      clanToken: 'navy3',
    },
    {
      id: 'or', name: 'Едом', region: 'nagorye', color: '#4d7c0f', emblem: 'peak',
      tagline: 'Стражи горы Сеир',
      ability: 'mountain_guard',
      abilityTitle: 'Горная стража',
      abilityText: '+1 к защите ваших горных областей (сверх горного бонуса).',
      clanToken: 'bless3',
    },
    {
      id: 'yor', name: 'Галаад', region: 'dolina', color: '#4338ca', emblem: 'ford',
      tagline: 'Хранители переправы через Иордан',
      ability: 'ford_mastery',
      abilityTitle: 'Мастера переправ',
      abilityText: '+1 к силе вашего войска, которое атакует через брод.',
      clanToken: 'ambush3',
    },
    {
      id: 'prestol', name: 'Сеннаар', region: 'ravnina', color: '#ca8a04', emblem: 'sheaf',
      tagline: 'Строители городов на равнине',
      ability: 'builders',
      abilityTitle: 'Зодчие',
      abilityText: '+1 к защите ваших городов.',
      clanToken: 'march6',
    },
    {
      id: 'kedem', name: 'Кидар', region: 'kedem', color: '#c2410c', emblem: 'tent',
      tagline: 'Кочевники в шатрах Кидарских',
      ability: 'many_spies',
      abilityTitle: 'Соглядатаи пустыни',
      abilityText: 'Три карты «Соглядатаи» вместо двух.',
      clanToken: 'raider',
    },
  ];
  const KINGDOM_BY_ID = new Map(KINGDOMS.map((kingdom) => [kingdom.id, kingdom]));
  const kingdomOf = (id) => KINGDOM_BY_ID.get(id) || null;
  const NEUTRAL_COLOR = '#94a3b8';

  /*
    Кто садится за стол при двух, трёх, четырёх и пяти участниках — так,
    чтобы разрыв по кольцу между царствами был как можно ровнее.
  */
  const STARTING_LAYOUTS = {
    2: ['tarsis', 'prestol'],
    3: ['tarsis', 'yor', 'kedem'],
    4: ['tarsis', 'or', 'prestol', 'kedem'],
    5: ['tarsis', 'or', 'yor', 'prestol', 'kedem'],
  };

  /*
    Царства за столом, когда кто-то выбрал своё: выбранные — на свои места
    (null — «не выбрал»), остальные места добираются из раскладки на это
    число игроков, а если её не хватает — из всех пяти по порядку.
  */
  function kingdomsFor(count, chosen = []) {
    const taken = new Set(chosen.filter((id) => KINGDOM_BY_ID.has(id)));
    const spare = [...STARTING_LAYOUTS[count], ...KINGDOMS.map((one) => one.id)]
      .filter((id, i, all) => !taken.has(id) && all.indexOf(id) === i);
    const used = new Set();
    return Array.from({ length: count }, (_, seat) => {
      const want = chosen[seat];
      if (KINGDOM_BY_ID.has(want) && !used.has(want)) { used.add(want); return want; }
      const next = spare.find((id) => !used.has(id));
      used.add(next);
      return next;
    });
  }

  /*
    Начало партии — как в «Битве за Рокуган»: у каждого царства есть его
    столица, а остальные стартовые земли игроки выбирают сами, по очереди
    ставя жетоны контроля в любые свободные области. Сколько жетонов — от
    числа игроков: карта у нас втрое меньше рокуганской, поэтому и жетонов
    меньше, но доля занятой земли на старте та же.
  */
  const SETUP_TOKENS = { 2: 3, 3: 3, 4: 2, 5: 2 };
  const capitalOf = (kingdomId) => AREAS.find((area) => area.capitalOf === kingdomId)?.id || null;
  const startingAreasOf = (kingdomId) => [capitalOf(kingdomId)].filter(Boolean);

  /*
    Прибрежные области — у моря вдоль севера (всё Приморье) и у реки,
    текущей от озера через броды. Их атакуют «Корабли» с воды, не спрашивая
    соседства, и только их «Корабли» защищают.
  */
  const COASTAL = new Set(['primorye-rim', 'primorye-cw', 'primorye-hub', 'primorye-ccw',
    'dolina-hub', 'ravnina-hub', 'pogranichye-hub']);
  const isCoastal = (id) => COASTAL.has(id);

  /*
    Жетоны битвы. Правила — «Битвы за Рокуган», облик — библейский:

      Войско       армия: атакует через границу из своей области или
                   защищает свою область, стоя в её центре;
      Корабли      флот: атакует прибрежную область с воды — с моря или
                   реки, из любого места — или защищает свою прибрежную;
      Засада       синоби: в центр любой области; в чужой — нападает, в
                   своей — защищает (как засада Иисуса Навина у Гая);
      Благословение  кладётся открыто поверх своего закрытого войска,
                   кораблей или засады, прибавляет силу и хранит жетон от
                   карт (как поднятые руки Моисея над битвой);
      Завет мира   дипломатия: своя область навсегда в мире — её нельзя
                   атаковать и из неё нельзя атаковать (как завет с
                   гаваонитянами);
      Поджог       погром: чужая или ничья область становится пепелищем
                   до конца партии (как лисицы Самсона в полях);
      Отвлекающий манёвр  пустой жетон: ставится как любой, в бою не
                   участвует и возвращается в руку.

    family решает, как жетон ложится на карту и как считается в бою.
  */
  const ORDERS = [
    ...[1, 2, 3, 4, 5].map((force) => ({ id: `march${force}`, family: 'army', title: 'Войско', force,
      text: `Сила ${force}. Атака через границу из своей области — или оборона своей области.` })),
    ...[1, 2].map((force) => ({ id: `navy${force}`, family: 'navy', title: 'Корабли', force,
      text: `Сила ${force}. Атака прибрежной области с воды из любого места — или оборона своей прибрежной.` })),
    ...[1, 2].map((force) => ({ id: `ambush${force}`, family: 'ambush', title: 'Засада', force,
      text: `Сила ${force}. В любую область: в чужой нападает, в своей защищает.` })),
    ...[1, 2].map((force) => ({ id: `bless${force}`, family: 'bless', title: 'Благословение', force,
      text: `+${force} к своему закрытому войску, кораблям или засаде. Кладётся открыто и хранит жетон от карт.` })),
    { id: 'peace', family: 'peace', title: 'Завет мира', force: 0,
      text: 'Своя область навсегда в мире: её нельзя атаковать, из неё нельзя атаковать. Жетоны в ней и на её границах уходят.' },
    { id: 'raid', family: 'raid', title: 'Поджог', force: 0,
      text: 'Чужая или ничья область рядом с вашей (или где ваша засада) становится пепелищем до конца партии.' },
    /*
      Особые жетоны царств — по одному у каждого, как дополнительный жетон
      на ширме клана в «Рокугане». clan — чей он: у других его не бывает.
    */
    { id: 'navy3', family: 'navy', title: 'Флагман', force: 3, clan: 'tarsis',
      text: 'Корабли силой 3 (с «Фарсисскими кораблями» — 4). Особый жетон Фарсиса.' },
    { id: 'bless3', family: 'bless', title: 'Благословение гор', force: 3, clan: 'or',
      text: '+3 к своему закрытому войску, кораблям или засаде. Особый жетон Едома.' },
    { id: 'ambush3', family: 'ambush', title: 'Засада у брода', force: 3, clan: 'yor',
      text: 'Засада силой 3: в чужой области нападает, в своей защищает. Особый жетон Галаада.' },
    { id: 'march6', family: 'army', title: 'Колесницы', force: 6, clan: 'prestol',
      text: 'Войско силой 6. Особый жетон Сеннаара.' },
    { id: 'raider', family: 'raid', title: 'Набег всадников', force: 0, clan: 'kedem',
      text: 'Поджог в любой чужой или ничьей области — соседство не нужно. Особый жетон Кидара.' },
    { id: 'feint', family: 'blank', title: 'Отвлекающий манёвр', force: 0, isFeint: true,
      text: 'Ставится как любой жетон, кроме благословения. В бою не участвует и возвращается в руку.' },
  ];
  const ORDER_BY_ID = new Map(ORDERS.map((order) => [order.id, order]));
  const orderOf = (id) => ORDER_BY_ID.get(id) || null;
  const familyOf = (id) => orderOf(id)?.family || null;
  const COMBAT_FAMILIES = new Set(['army', 'navy', 'ambush']);

  /*
    Личный запас жетонов — одинаковый у всех, как на ширмах «Рокугана»:
    двадцать пять жетонов и пустой сверху. За пять раундов игрок ставит
    двадцать пять раз, так что до конца партии дойдёт почти всё — вопрос
    только в том, когда.
  */
  const TOKEN_SUPPLY = Object.freeze({
    march1: 4, march2: 4, march3: 3, march4: 2, march5: 1,
    navy1: 2, navy2: 1,
    ambush1: 1, ambush2: 1,
    bless1: 1, bless2: 1,
    peace: 2, raid: 2,
  });
  /** Запас царства: общие двадцать пять и его особый жетон. */
  const supplyOf = (kingdomId) => {
    const kinds = Object.entries(TOKEN_SUPPLY).flatMap(([kind, count]) => Array(count).fill(kind));
    const clan = kingdomOf(kingdomId)?.clanToken;
    return clan ? [...kinds, clan] : kinds;
  };
  const HAND_SIZE = 6;
  const ROUNDS = 5;
  const ORDERS_PER_ROUND = 5;
  const REGION_BONUS = 5;
  const TURN_LIMIT_MS = 90000;

  /*
    Карты — разыгрываются в начале своего хода, до жетона, и уходят из
    партии: «Соглядатаи» (разведка) — посмотреть один чужой закрытый жетон;
    «Пророк» (сюгэндзя) — открыть его всем и сбросить, как Елисей открывал
    царю замыслы сирийцев; «Право первенства» — у первого игрока раунда
    (кроме игры вдвоём): убрать с поля один закрытый жетон любого игрока
    обратно в его запас. Благословлённый жетон картам неподвластен.
  */
  const CARDS = [
    { id: 'scout', title: 'Соглядатаи', text: 'В начале хода: посмотрите один чужой закрытый жетон. Видите только вы.' },
    { id: 'prophet', title: 'Пророк', text: 'В начале хода: откройте всем один чужой закрытый жетон и сбросьте его.' },
    { id: 'herald', title: 'Право первенства', text: 'Только у первого игрока раунда: уберите с поля один закрытый жетон любого игрока в его запас.' },
  ];
  const CARD_BY_ID = new Map(CARDS.map((card) => [card.id, card]));
  const cardOf = (id) => CARD_BY_ID.get(id) || null;
  const startingCards = (kingdomId) => ({ scout: kingdomId === 'kedem' ? 3 : 2, prophet: 1 });

  /*
    Защита, напечатанная на карте: столица +2 (даже если её царство не за
    столом), другой город +1, горы +1. Больше ничего у ничьей области нет —
    как в «Рокугане», войско силой 1 берёт пустую равнину. У занятой к этому
    прибавляются открытые жетоны контроля (+1 за каждую победу защитника),
    особый жетон «+2 к защите» и защитные жетоны этого раунда.
  */
  const MOUNTAIN_DEFENSE_BONUS = 1;
  function printedDefense(area) {
    return (area.capitalOf ? 2 : area.city ? 1 : 0) + (area.terrain === 'mountains' ? MOUNTAIN_DEFENSE_BONUS : 0);
  }

  /*
    Особые жетоны областей. Один на область; мир и пепелище не заменяются
    ничем, остальные ими заменяются.
  */
  const SPECIALS = {
    peace: { title: 'Мир', text: 'Область нельзя атаковать, и из неё нельзя атаковать. Жетоны сюда не ставятся.' },
    scorched: { title: 'Пепелище', text: 'Область не принадлежит никому до конца партии: её нельзя атаковать и занять.' },
    shrine: { title: 'Жертвенник', text: 'Область нельзя атаковать; хозяин может атаковать из неё.' },
    honor2: { title: '+2 к чести', text: 'Хозяин области получает 2 очка в конце партии.' },
    defense2: { title: '+2 к защите', text: '+2 к защите области и 1 очко её хозяину в конце партии.' },
  };

  /*
    Карты регионов. Тот, кто первым возьмёт регион целиком, получает его
    награду — один раз за партию. Награда без выбора цели: она ложится в
    главный город региона или добавляет карту.
  */
  const REGION_CARDS = {
    primorye: { title: 'Дары моря', text: 'Особый жетон «+2 к чести» в Тире.', special: 'honor2', area: 'primorye-rim' },
    nagorye: { title: 'Горная твердыня', text: 'Особый жетон «+2 к защите» в Восоре.', special: 'defense2', area: 'nagorye-rim' },
    dolina: { title: 'Жертвенник у брода', text: 'Жертвенник у Бродов Иордана: эту область нельзя атаковать.', special: 'shrine', area: 'dolina-hub' },
    ravnina: { title: 'Житницы', text: 'Особый жетон «+2 к чести» в Житницах.', special: 'honor2', area: 'ravnina-cw' },
    kedem: { title: 'Колодцы пустыни', text: 'Ещё одна карта «Пророк».', card: 'prophet' },
    pogranichye: { title: 'Твердыня рубежа', text: 'Особый жетон «+2 к защите» в Пограничной Твердыне.', special: 'defense2', area: 'pogranichye-rim' },
  };

  /*
    Тайные цели. Каждому раздаётся две, он оставляет одну. Проверка — по
    ключу в движке. Десять целей — ровно на пятерых по две без повторов.
  */
  const OBJECTIVES = [
    { id: 'capital', title: 'Хранитель столицы', points: 3, text: 'Удержите свою столицу до конца партии.' },
    { id: 'territory', title: 'Собиратель земель', points: 4, text: 'Контролируйте не менее пяти связных областей.' },
    { id: 'ford', title: 'Мастер переправы', points: 4, text: 'Контролируйте оба берега одного из бродов.' },
    { id: 'cities', title: 'Собиратель городов', points: 5, text: 'Контролируйте не менее трёх городов (столицы считаются).' },
    { id: 'coast', title: 'Властитель вод', points: 4, text: 'Контролируйте не менее трёх прибрежных областей.' },
    { id: 'mountains', title: 'Хозяин гор', points: 4, text: 'Контролируйте не менее трёх горных областей.' },
    { id: 'desert', title: 'Путь через пустыню', points: 4, text: 'Контролируйте не менее трёх пустынных областей.' },
    { id: 'hubs', title: 'Сердце земли', points: 5, text: 'Контролируйте не менее трёх срединных областей у реки и озера.' },
    { id: 'peace', title: 'Миротворец', points: 4, text: 'Две ваши области под заветом мира.' },
    { id: 'veterans', title: 'Стойкость', points: 4, text: 'Не менее трёх открытых жетонов контроля в ваших областях.' },
  ];
  const OBJECTIVE_BY_ID = new Map(OBJECTIVES.map((one) => [one.id, one]));
  const objectiveOf = (id) => OBJECTIVE_BY_ID.get(id) || null;

  /** Две разные цели на игрока без повторов за столом: тот же посев — та же раздача. */
  function dealObjectives(count, random) {
    const pool = OBJECTIVES.map((one) => one.id);
    for (let i = pool.length - 1; i > 0; i -= 1) {
      const j = Math.floor(random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    return Array.from({ length: count }, (_, seat) => [pool[seat * 2], pool[seat * 2 + 1]]);
  }

  window.KingdomsRules = {
    REGIONS, REGION_IDS, REGION_RING,
    AREAS, AREA_BY_ID, areaOf, areasOfRegion, areaId,
    EDGES, FORDS, connectionsOf, neighborsOf, edgeType, areAdjacent,
    KINGDOMS, KINGDOM_BY_ID, kingdomOf, NEUTRAL_COLOR,
    STARTING_LAYOUTS, SETUP_TOKENS, startingAreasOf, capitalOf,
    COASTAL, isCoastal,
    ORDERS, ORDER_BY_ID, orderOf, familyOf, COMBAT_FAMILIES,
    CARDS, cardOf, startingCards,
    SPECIALS, REGION_CARDS,
    OBJECTIVES, objectiveOf, dealObjectives,
    ROUNDS, ORDERS_PER_ROUND, REGION_BONUS, TURN_LIMIT_MS, TOKEN_SUPPLY, supplyOf, HAND_SIZE,
    kingdomsFor,
    MOUNTAIN_DEFENSE_BONUS, printedDefense,
  };
}());
