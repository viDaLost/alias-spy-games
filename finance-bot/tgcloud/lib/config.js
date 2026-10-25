// Постоянные настройки бота. Ключи API здесь НЕ хранятся — владелец задаёт их
// командой /setkey прямо в чате, они сохраняются в базе (таблица settings).

// Провайдеры распознавания речи и «умного» разбора текста. Все совместимы с OpenAI API.
// Модели можно поменять командой /setmodel, если провайдер обновит линейку.
export const AI_PRESETS = {
  groq: {
    title: 'Groq',
    baseUrl: 'https://api.groq.com/openai/v1',
    sttModel: 'whisper-large-v3-turbo',
    llmModel: 'openai/gpt-oss-120b',
    llmExtra: { reasoning_effort: 'low' },
    keyHint: 'бесплатный ключ: console.groq.com → API Keys',
  },
  openai: {
    title: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    sttModel: 'gpt-4o-mini-transcribe',
    llmModel: 'gpt-4.1-mini',
    llmExtra: {},
    keyHint: 'ключ: platform.openai.com → API keys',
  },
};

// Адрес мини-приложения (папка webapp/, публикуется вместе с ботом: npx tgcloud push).
export const WEBAPP_URL = 'https://app8887807822.tgcloud.ai/';

// Максимальная длительность голосового, которое отправляем на распознавание (сек).
export const MAX_VOICE_SECONDS = 300;

// Валюты: код → символ и слова, по которым валюта узнаётся в тексте.
export const CURRENCIES = {
  RUB: { symbol: '₽', title: 'Российский рубль', words: ['₽', 'р', 'р.', 'руб', 'рубль', 'рубля', 'рублей', 'рубл', 'rub'] },
  USD: { symbol: '$', title: 'Доллар США', words: ['$', 'usd', 'доллар', 'доллара', 'долларов', 'долл', 'бакс', 'бакса', 'баксов'] },
  EUR: { symbol: '€', title: 'Евро', words: ['€', 'eur', 'евро'] },
  KZT: { symbol: '₸', title: 'Казахстанский тенге', words: ['₸', 'kzt', 'тенге', 'тг'] },
  UAH: { symbol: '₴', title: 'Украинская гривна', words: ['₴', 'uah', 'грн', 'гривна', 'гривны', 'гривен', 'гривень'] },
  BYN: { symbol: 'Br', title: 'Белорусский рубль', words: ['byn', 'бел'] },
  GEL: { symbol: '₾', title: 'Грузинский лари', words: ['₾', 'gel', 'лари'] },
  AMD: { symbol: '֏', title: 'Армянский драм', words: ['֏', 'amd', 'драм', 'драма', 'драмов'] },
  UZS: { symbol: 'сум', title: 'Узбекский сум', words: ['uzs', 'сум', 'сума', 'сумов'] },
  KGS: { symbol: 'сом', title: 'Киргизский сом', words: ['kgs', 'сом', 'сома', 'сомов'] },
  TRY: { symbol: '₺', title: 'Турецкая лира', words: ['₺', 'try', 'лира', 'лиры', 'лир'] },
  CNY: { symbol: '¥', title: 'Китайский юань', words: ['¥', 'cny', 'юань', 'юаня', 'юаней'] },
  GBP: { symbol: '£', title: 'Фунт стерлингов', words: ['£', 'gbp', 'фунт', 'фунта', 'фунтов'] },
  AED: { symbol: 'AED', title: 'Дирхам ОАЭ', words: ['aed', 'дирхам', 'дирхама', 'дирхамов'] },
  THB: { symbol: '฿', title: 'Тайский бат', words: ['฿', 'thb', 'бат', 'бата', 'батов'] },
};

// Часовые пояса для быстрого выбора: смещение в минутах → подпись.
export const TIMEZONES = [
  [0, 'UTC+0 · Лондон'],
  [60, 'UTC+1 · Берлин, Варшава'],
  [120, 'UTC+2 · Калининград, Киев'],
  [180, 'UTC+3 · Москва, Минск'],
  [240, 'UTC+4 · Самара, Тбилиси, Дубай'],
  [300, 'UTC+5 · Екатеринбург, Ташкент'],
  [360, 'UTC+6 · Омск, Бишкек'],
  [420, 'UTC+7 · Новосибирск, Бангкок'],
  [480, 'UTC+8 · Иркутск, Пекин'],
  [540, 'UTC+9 · Якутск'],
  [600, 'UTC+10 · Владивосток'],
  [720, 'UTC+12 · Камчатка'],
  [-300, 'UTC−5 · Нью-Йорк'],
];

// Тексты кнопок главного меню (по ним же распознаём нажатия).
export const MENU = {
  report: '📊 Отчёт',
  excel: '📥 Excel',
  last: '🕘 Последние',
  budget: '🎯 Бюджет',
  categories: '📂 Категории',
  settings: '⚙️ Настройки',
};
