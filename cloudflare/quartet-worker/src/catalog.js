export const CATALOG = [
  { id: 'apostles', name: 'Апостолы', icon: '⛪', cards: [
    { id: 'apostles_peter', title: 'Пётр' },
    { id: 'apostles_john', title: 'Иоанн' },
    { id: 'apostles_james', title: 'Иаков' },
    { id: 'apostles_andrew', title: 'Андрей' },
  ] },
  { id: 'evangelists', name: 'Евангелисты', icon: '📖', cards: [
    { id: 'evangelists_matthew', title: 'Матфей' },
    { id: 'evangelists_mark', title: 'Марк' },
    { id: 'evangelists_luke', title: 'Лука' },
    { id: 'evangelists_john', title: 'Иоанн' },
  ] },
  { id: 'patriarchs', name: 'Патриархи', icon: '👑', cards: [
    { id: 'patriarchs_abraham', title: 'Авраам' },
    { id: 'patriarchs_isaac', title: 'Исаак' },
    { id: 'patriarchs_jacob', title: 'Иаков' },
    { id: 'patriarchs_joseph', title: 'Иосиф' },
  ] },
  { id: 'prophets', name: 'Пророки', icon: '📜', cards: [
    { id: 'prophets_isaiah', title: 'Исаия' },
    { id: 'prophets_jeremiah', title: 'Иеремия' },
    { id: 'prophets_ezekiel', title: 'Иезекииль' },
    { id: 'prophets_daniel', title: 'Даниил' },
  ] },
  { id: 'judges', name: 'Судьи', icon: '⚖️', cards: [
    { id: 'judges_deborah', title: 'Девора' },
    { id: 'judges_gideon', title: 'Гедеон' },
    { id: 'judges_samson', title: 'Самсон' },
    { id: 'judges_jephthah', title: 'Иеффай' },
  ] },
  { id: 'kings', name: 'Цари', icon: '🏰', cards: [
    { id: 'kings_saul', title: 'Саул' },
    { id: 'kings_david', title: 'Давид' },
    { id: 'kings_solomon', title: 'Соломон' },
    { id: 'kings_hezekiah', title: 'Езекия' },
  ] },
  { id: 'women', name: 'Жёны веры', icon: '🌿', cards: [
    { id: 'women_sarah', title: 'Сарра' },
    { id: 'women_rebekah', title: 'Ревекка' },
    { id: 'women_rachel', title: 'Рахиль' },
    { id: 'women_leah', title: 'Лия' },
  ] },
  { id: 'heroes', name: 'Женщины Библии', icon: '✨', cards: [
    { id: 'heroes_ruth', title: 'Руфь' },
    { id: 'heroes_esther', title: 'Есфирь' },
    { id: 'heroes_mary', title: 'Мария' },
    { id: 'heroes_anna', title: 'Анна' },
  ] },
  { id: 'paulteam', name: 'Команда Павла', icon: '🤝', cards: [
    { id: 'paulteam_barnabas', title: 'Варнава' },
    { id: 'paulteam_silas', title: 'Сила' },
    { id: 'paulteam_timothy', title: 'Тимофей' },
    { id: 'paulteam_titus', title: 'Тит' },
  ] },
  { id: 'places', name: 'Города', icon: '🏛️', cards: [
    { id: 'places_bethlehem', title: 'Вифлеем' },
    { id: 'places_nazareth', title: 'Назарет' },
    { id: 'places_capernaum', title: 'Капернаум' },
    { id: 'places_jerusalem', title: 'Иерусалим' },
  ] },
  { id: 'miracles', name: 'Чудеса', icon: '🌊', cards: [
    { id: 'miracles_water_wine', title: 'Вода в вино' },
    { id: 'miracles_feeding_5000', title: 'Накормил 5000' },
    { id: 'miracles_calm_storm', title: 'Утихомирил бурю' },
    { id: 'miracles_raise_lazarus', title: 'Воскресил Лазаря' },
  ] },
  { id: 'armor', name: 'Всеоружие', icon: '🛡️', cards: [
    { id: 'armor_belt_truth', title: 'Пояс истины' },
    { id: 'armor_breastplate', title: 'Броня праведности' },
    { id: 'armor_shield_faith', title: 'Щит веры' },
    { id: 'armor_helmet_salvation', title: 'Шлем спасения' },
  ] },
];

export const CARD_TO_QUARTET = new Map();
export const CARD_BY_ID = new Map();
for (const quartet of CATALOG) {
  for (const card of quartet.cards) {
    CARD_TO_QUARTET.set(card.id, quartet);
    CARD_BY_ID.set(card.id, card);
  }
}

export const ALL_CARD_IDS = CATALOG.flatMap((quartet) => quartet.cards.map((card) => card.id));
