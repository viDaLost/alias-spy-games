// app.js — Telegram-friendly launcher, access cache, image menu icons and compact admin panel

const GAS_API_URL = "https://script.google.com/macros/s/AKfycbx0o9HmRIF6vNuBUB2N4H3YuabJzYbRmAxvHCCwqnbMPn29Crv5W3FT1XGDF6VyFSn9/exec";
const ADMIN_ID = "1288379477";
const SUPPORT_LINK = "https://t.me/D_a_n_Vi";
const ADMIN_PAGE_SIZE = 10;

let currentGameScript = null;
const loadedGameScripts = new Map();
let activeGameName = null;
let currentUserData = { lastGames: [] };
let accessState = {
  checked: false,
  isBanned: false,
  lastSyncAt: 0,
  promise: null,
};

const adminState = {
  users: [],
  filteredUsers: [],
  page: 1,
  query: "",
};

const GAME_GROUPS = [
  {
    id: "company-games",
    items: [
      { key: "alias", title: "Алиас", desc: "Объясняй слова на скорость", icon: "alias" },
      { key: "coimaginarium", title: "Соображариум", desc: "Ассоциации и быстрые идеи", icon: "idea" },
      { key: "guess", title: "Угадай персонажа", desc: "Вопросы, версии, логика", icon: "character" },
      { key: "describe", title: "Опиши, но не называй", desc: "Подсказки без прямого ответа", icon: "describe" },
      { key: "spy", title: "Шпион", desc: "Секретная роль и локация", icon: "spy" },
      { key: "quartet", title: "Квартет", desc: "Собери четыре карты", icon: "quartet" },
    ],
  },
  {
    id: "word-games",
    items: [
      { key: "bible-wow", title: "Библейские слова", desc: "Собери слова из букв", icon: "words" },
      { key: "bible-wordsearch", title: "Поиск библейских слов", desc: "Найди скрытые слова", icon: "search" },
      { key: "sacred-word", title: "Священное слово", desc: "Открой слово по подсказкам", icon: "sacred" },
    ],
  },
  {
    id: "kids-games",
    items: [
      { key: "kids-ark-pairs", title: "Найди пару", desc: "Память, пары и ковчег", icon: "ark" },
    ],
  },
];

const GAME_TITLES = Object.fromEntries(
  GAME_GROUPS.flatMap((group) => group.items.map((item) => [item.key, item.title]))
);

const MENU_ICON_VERSION = "1";
const MENU_ICON_SOURCES = {
  alias: "assets/icons/alias.png",
  idea: "assets/icons/idea.png",
  character: "assets/icons/character.png",
  describe: "assets/icons/describe.png",
  spy: "assets/icons/spy.png",
  quartet: "assets/icons/quartet.png",
  words: "assets/icons/words.png",
  search: "assets/icons/search.png",
  sacred: "assets/icons/sacred.png",
  ark: "assets/icons/ark.png",
};

function menuIconHTML(type, title = "") {
  const src = MENU_ICON_SOURCES[type];
  if (!src) return svgIcon(type);
  const alt = title ? `Иконка игры ${escapeHTML(title)}` : "Иконка игры";
  return `<img class="game-card__img" src="${src}?v=${MENU_ICON_VERSION}" alt="${alt}" loading="lazy" decoding="async" draggable="false" />`;
}

function svgIcon(type) {
  const common = 'viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false"';
  const shell = (body) => `<svg class="game-card__svg" ${common}>${body}</svg>`;
  
  // Premium Global Definitions for High-End Visual Effects
  const globalDefs = `
    <defs>
      <filter id="premium-glow" x="-20%" y="-20%" width="140%" height="140%">
        <feGaussianBlur stdDeviation="2" result="blur" />
        <feComposite in="SourceGraphic" in2="blur" operator="over" />
      </filter>
      <filter id="soft-shadow" x="-10%" y="-10%" width="120%" height="120%">
        <feDropShadow dx="0" dy="3" stdDeviation="2" flood-opacity="0.3"/>
      </filter>
      <linearGradient id="gold-metal" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#FFE259"/>
        <stop offset="100%" stop-color="#FFA751"/>
      </linearGradient>
      <linearGradient id="silver-metal" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#E2E8F0"/>
        <stop offset="100%" stop-color="#94A3B8"/>
      </linearGradient>
    </defs>
  `;

  const map = {
    alias: shell(`
      <defs>
        <linearGradient id="bg_alias" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#1E3A8A"/><stop offset="100%" stop-color="#3B82F6"/>
        </linearGradient>
        <linearGradient id="sand_glow" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stop-color="#FFF"/><stop offset="100%" stop-color="#60A5FA"/>
        </linearGradient>
      </defs>
      ${globalDefs}
      <rect x="4" y="4" width="56" height="56" rx="18" fill="url(#bg_alias)" filter="url(#soft-shadow)"/>
      <path d="M16 14h32v36H16z" fill="#FFF" opacity="0.1" rx="4"/>
      <path d="M20 16h24v4c0 6-4 9-8 12 4 3 8 6 8 12v4H20v-4c0-6 4-9 8-12-4-3-8-6-8-12v-4z" stroke="url(#gold-metal)" stroke-width="3" stroke-linejoin="round" fill="none"/>
      <path d="M23 19h18c0 4-3 7-9 7s-9-3-9-7z" fill="url(#sand_glow)"/>
      <path d="M23 45c0-4 3-7 9-7s-9 3-9 7z" fill="url(#sand_glow)"/>
      <line x1="32" y1="26" x2="32" y2="39" stroke="#FFF" stroke-width="2" stroke-dasharray="2 2"/>
      <circle cx="32" cy="33" r="1.5" fill="#FFF" filter="url(#premium-glow)"/>
      <circle cx="28" cy="42" r="1" fill="#FFF"/>
      <circle cx="36" cy="43" r="1" fill="#FFF"/>
    `),

    idea: shell(`
      <defs>
        <linearGradient id="bg_idea" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#4C1D95"/><stop offset="100%" stop-color="#D946EF"/>
        </linearGradient>
        <radialGradient id="lamp_glow" cx="50%" cy="45%" r="50%">
          <stop offset="0%" stop-color="#FFF" stop-opacity="1"/>
          <stop offset="50%" stop-color="#FDE047" stop-opacity="0.4"/>
          <stop offset="100%" stop-color="#FDE047" stop-opacity="0"/>
        </radialGradient>
      </defs>
      ${globalDefs}
      <rect x="4" y="4" width="56" height="56" rx="18" fill="url(#bg_idea)" filter="url(#soft-shadow)"/>
      <circle cx="32" cy="26" r="16" fill="url(#lamp_glow)"/>
      <path d="M32 12c-7.72 0-14 6.28-14 14 0 5.25 3 9.3 6.5 12.5l1.5 3.5h12l1.5-3.5c3.5-3.2 6.5-7.25 6.5-12.5 0-7.72-6.28-14-14-14z" stroke="#FFF" stroke-width="2.5" fill="none"/>
      <path d="M32 20c-1.5 0-3 1-3.5 2.5s.5 3 2 3.5c-2 .5-3 2-3 4 0 2.5 2.5 4.5 4.5 4.5s4.5-2 4.5-4.5c0-2-1-3.5-3-4 1.5-.5 2.5-2 2-3.5S33.5 20 32 20z" fill="none" stroke="url(#gold-metal)" stroke-width="2" filter="url(#premium-glow)"/>
      <path d="M25 45h14v4H25zm3 4h8v3h-8z" fill="url(#silver-metal)"/>
    `),

    character: shell(`
      <defs>
        <linearGradient id="bg_char" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#800020"/><stop offset="100%" stop-color="#DA70D6"/>
        </linearGradient>
      </defs>
      ${globalDefs}
      <rect x="4" y="4" width="56" height="56" rx="18" fill="url(#bg_char)" filter="url(#soft-shadow)"/>
      <path d="M18 16c0-3.3 2.7-6 6-6h4v32h-10V16zm14-6h4c3.3 0 6 2.7 6 6v26H32V10z" fill="#FFF" opacity="0.15"/>
      <circle cx="32" cy="28" r="14" stroke="url(#gold-metal)" stroke-width="1.5" stroke-dasharray="4 2" fill="none" filter="url(#premium-glow)"/>
      <path d="M28.5 22c0-3.5 2.5-5 4.5-5s4.5 1.5 4.5 4c0 2.5-2 3.5-3.5 4.5c-1 1-1 2-1 3.5" stroke="url(#gold-metal)" stroke-width="4.5" stroke-linecap="round" fill="none"/>
      <circle cx="33" cy="35.5" r="2.5" fill="url(#gold-metal)"/>
    `),

    describe: shell(`
      <defs>
        <linearGradient id="bg_desc" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#0F766E"/><stop offset="100%" stop-color="#14B8A6"/>
        </linearGradient>
      </defs>
      ${globalDefs}
      <rect x="4" y="4" width="56" height="56" rx="18" fill="url(#bg_desc)" filter="url(#soft-shadow)"/>
      <path d="M14 44c6-2 14-8 16-16s-2-14-6-16c-3-1.5-6 1-4 4s6 8 4 14-10 10-14 11c-2 .5-1 3.5 4 3z" fill="url(#gold-metal)" filter="url(#soft-shadow)"/>
      <path d="M16 41.5c4-1 9-5 11-11.5s-1-10.5-3-12" stroke="#B45309" stroke-width="1.5" fill="none"/>
      <path d="M36 22c3.5 2 5.5 6 5.5 10s-2 8-5.5 10" stroke="#FFF" stroke-width="3" stroke-linecap="round" fill="none" opacity="0.8"/>
      <path d="M43 16c5 3.5 8 9 8 16s-3 12.5-8 16" stroke="#E0F2FE" stroke-width="3.5" stroke-linecap="round" fill="none" filter="url(#premium-glow)" opacity="0.5"/>
    `),

    spy: shell(`
      <defs>
        <linearGradient id="bg_spy" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#030712"/><stop offset="100%" stop-color="#1E40AF"/>
        </linearGradient>
      </defs>
      ${globalDefs}
      <rect x="4" y="4" width="56" height="56" rx="18" fill="url(#bg_spy)" filter="url(#soft-shadow)"/>
      <circle cx="16" cy="14" r="1" fill="#FFF" opacity="0.8"/>
      <circle cx="48" cy="18" r="1" fill="#FFF" opacity="0.5"/>
      <circle cx="42" cy="46" r="1" fill="#FFF" opacity="0.7"/>
      <circle cx="18" cy="38" r="1" fill="#FFF" opacity="0.4"/>
      <path d="M32 14c-4.5 0-8 4-8 9s1.5 8 3.5 10c-5.5 2-9.5 6.5-10.5 13h30c-1-6.5-5-11-10.5-13 2-2 3.5-5 3.5-10s-3.5-9-8-9z" fill="#111827" filter="url(#soft-shadow)"/>
      <path d="M24 23c0 6 3.5 11 8 11s8-5 8-11-3.5-9-8-9-8 3-8 9z" fill="none" stroke="url(#gold-metal)" stroke-width="2" filter="url(#premium-glow)"/>
      <path d="M28 24h8" stroke="#FFF" stroke-width="1.5" stroke-linecap="round"/>
    `),

    quartet: shell(`
      <defs>
        <linearGradient id="bg_quartet" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#2E1065"/><stop offset="100%" stop-color="#3B82F6"/>
        </linearGradient>
      </defs>
      ${globalDefs}
      <rect x="4" y="4" width="56" height="56" rx="18" fill="url(#bg_quartet)" filter="url(#soft-shadow)"/>
      <g transform="translate(12, 14) rotate(-15)">
        <rect x="0" y="0" width="16" height="26" rx="3" fill="#FFF" filter="url(#soft-shadow)"/>
        <path d="M8 6v12M5 10h6" stroke="#EF4444" stroke-width="2"/>
      </g>
      <g transform="translate(22, 11) rotate(-5)">
        <rect x="0" y="0" width="16" height="26" rx="3" fill="url(#silver-metal)" filter="url(#soft-shadow)"/>
        <path d="M3 13c3-4 7-4 10 0-3 4-7 4-10 0z M11 11l2 4M13 11l-2 4" stroke="#1E3A8A" stroke-width="1.5" fill="none"/>
      </g>
      <g transform="translate(32, 12) rotate(10)">
        <rect x="0" y="0" width="16" height="26" rx="3" fill="url(#gold-metal)" filter="url(#soft-shadow)"/>
        <path d="M4 16h8l-1 4H5z" fill="#B45309"/>
      </g>
      <g transform="translate(40, 16) rotate(25)">
        <rect x="0" y="0" width="16" height="26" rx="3" fill="#FFF" filter="url(#soft-shadow)"/>
        <path d="M8 8l2 5h5l-4 3 2 5-5-3-5 3 2-5-4-3h5z" fill="#F59E0B"/>
      </g>
    `),

    words: shell(`
      <defs>
        <linearGradient id="bg_words" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#0369A1"/><stop offset="100%" stop-color="#047857"/>
        </linearGradient>
      </defs>
      ${globalDefs}
      <rect x="4" y="4" width="56" height="56" rx="18" fill="url(#bg_words)" filter="url(#soft-shadow)"/>
      <path d="M32 46c-4-4-12-4-18-2V18c6-2 14-2 18 2 4-4 12-4 18-2v26c-6-2-14-2-18 2z" fill="#FFF" filter="url(#soft-shadow)"/>
      <path d="M32 20v26" stroke="#94A3B8" stroke-width="2"/>
      <path d="M10 18v26c3-.5 7-.5 10 1V21c-3-1.5-7-1.5-10-2z" fill="#78350F" opacity="0.1"/>
      <g fill="url(#gold-metal)" font-family="Arial, sans-serif" font-weight="900" filter="url(#premium-glow)">
        <text x="18" y="28" font-size="8">А</text>
        <text x="24" y="38" font-size="7">Ω</text>
        <text x="38" y="26" font-size="9">В</text>
        <text x="44" y="36" font-size="7">Б</text>
      </g>
    `),

    search: shell(`
      <defs>
        <linearGradient id="bg_search" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#4338CA"/><stop offset="100%" stop-color="#0EA5E9"/>
        </linearGradient>
      </defs>
      ${globalDefs}
      <rect x="4" y="4" width="56" height="56" rx="18" fill="url(#bg_search)" filter="url(#soft-shadow)"/>
      <path d="M16 14h30c2 0 3 1.5 3 3.5s-1 3.5-3 3.5H18c-1.5 0-2 .5-2 1.5s.5 1.5 2 1.5h28c2 0 3 1.5 3 3.5s-1 3.5-3 3.5H16z" fill="#FEF08A" stroke="#CA8A04" stroke-width="1.5" filter="url(#soft-shadow)"/>
      <path d="M22 18h20M24 28h16M20 38h22" stroke="#854D0E" stroke-width="2" stroke-linecap="round"/>
      <circle cx="38" cy="36" r="8" stroke="url(#gold-metal)" stroke-width="3" fill="#FFF" fill-opacity="0.2" filter="url(#premium-glow)"/>
      <line x1="44" y1="42" x2="52" y2="50" stroke="url(#gold-metal)" stroke-width="4" stroke-linecap="round"/>
    `),

    sacred: shell(`
      <defs>
        <linearGradient id="bg_sacred" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#7C2D12"/><stop offset="100%" stop-color="#EA580C"/>
        </linearGradient>
        <radialGradient id="fire_glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stop-color="#FFF7ED"/><stop offset="40%" stop-color="#FACC15"/><stop offset="100%" stop-color="#EA580C" stop-opacity="0"/>
        </radialGradient>
      </defs>
      ${globalDefs}
      <rect x="4" y="4" width="56" height="56" rx="18" fill="url(#bg_sacred)" filter="url(#soft-shadow)"/>
      <circle cx="32" cy="22" r="14" fill="url(#fire_glow)" opacity="0.6"/>
      <path d="M32 48V24M24 26v4c0 5 3.5 8 8 8s8-3 8-8v-4M16 28v4c0 9 6.5 13 16 13s16-4 16-13v-4M22 48h20" stroke="url(#gold-metal)" stroke-width="3" stroke-linecap="round" fill="none" filter="url(#soft-shadow)"/>
      <g fill="#FDE047" filter="url(#premium-glow)">
        <path d="M16 23c-.5-2 0-4 1-5 .5 1.5 1.5 2 1 5z"/>
        <path d="M24 21c-.5-2 0-4 1-5 .5 1.5 1.5 2 1 5z"/>
        <path d="M32 19c-.5-2 0-4 1-5 .5 1.5 1.5 2 1 5z"/>
        <path d="M40 21c-.5-2 0-4 1-5 .5 1.5 1.5 2 1 5z"/>
        <path d="M48 23c-.5-2 0-4 1-5 .5 1.5 1.5 2 1 5z"/>
      </g>
    `),

    ark: shell(`
      <defs>
        <linearGradient id="bg_ark" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#0284C7"/><stop offset="100%" stop-color="#6366F1"/>
        </linearGradient>
        <linearGradient id="rainbow" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stop-color="#EF4444"/><stop offset="50%" stop-color="#10B981"/><stop offset="100%" stop-color="#3B82F6"/>
        </linearGradient>
      </defs>
      ${globalDefs}
      <rect x="4" y="4" width="56" height="56" rx="18" fill="url(#bg_ark)" filter="url(#soft-shadow)"/>
      <path d="M12 32c0-11 9-20 20-20s20 9 20 20" stroke="url(#rainbow)" stroke-width="2" fill="none" opacity="0.6" filter="url(#premium-glow)"/>
      <path d="M14 34h36l-4 11H18l-4-11z" fill="#78350F" filter="url(#soft-shadow)"/>
      <path d="M22 34V26h20v8H22z" fill="#A16207"/>
      <path d="M20 26l12-6 12 6H20z" fill="#9A3412"/>
      <circle cx="27" cy="30" r="1.5" fill="#FEF08A"/>
      <circle cx="32" cy="30" r="1.5" fill="#FEF08A"/>
      <circle cx="37" cy="30" r="1.5" fill="#FEF08A"/>
      <path d="M8 44c3-2 6-2 9 0s6 2 9 0 6-2 9 0 6 2 9 0 6-2 9 0" stroke="#E0F2FE" stroke-width="2.5" fill="none"/>
    `),

    support: shell(`
      <defs>
        <linearGradient id="bg_support" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#4B5563"/><stop offset="100%" stop-color="#1E293B"/>
        </linearGradient>
      </defs>
      ${globalDefs}
      <rect x="4" y="4" width="56" height="56" rx="18" fill="url(#bg_support)" filter="url(#soft-shadow)"/>
      <path d="M12 24c4-6 12-6 18 2-6-8-14-8-18-2zm40 0c-4-6-12-6-18 2 6-8 14-8 18-2z" fill="url(#silver-metal)" filter="url(#premium-glow)" opacity="0.7"/>
      <rect x="18" y="26" width="28" height="18" rx="3" fill="#FFF" filter="url(#soft-shadow)"/>
      <path d="M18 26l14 10 14-10" stroke="#94A3B8" stroke-width="2" fill="none"/>
      <circle cx="32" cy="35" r="4.5" fill="url(#gold-metal)"/>
      <path d="M32 32.5v5M29.5 35h5" stroke="#FFF" stroke-width="1.2"/>
    `),

    admin: shell(`
      <defs>
        <linearGradient id="bg_admin" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#111827"/><stop offset="100%" stop-color="#312E81"/>
        </linearGradient>
      </defs>
      ${globalDefs}
      <rect x="4" y="4" width="56" height="56" rx="18" fill="url(#bg_admin)" filter="url(#soft-shadow)"/>
      <g stroke="url(#gold-metal)" stroke-width="2" fill="none" filter="url(#soft-shadow)">
        <path d="M22 42l12-12M24 44l-4-4 2-2 2 2 2-2M42 22L30 32M38 18l4 4-2 2-2-2-2 2" stroke-linecap="round"/>
        <circle cx="18" cy="46" r="3"/>
        <circle cx="46" cy="18" r="3"/>
      </g>
      <path d="M20 36l4-10 8 5 8-5 4 10H20z" fill="url(#gold-metal)" filter="url(#premium-glow)"/>
      <rect x="20" y="36" width="24" height="3" fill="#B45309" rx="1"/>
      <circle cx="24" cy="26" r="1.5" fill="#EF4444"/>
      <circle cx="32" cy="31" r="1.5" fill="#3B82F6"/>
      <circle cx="40" cy="26" r="1.5" fill="#EF4444"/>
    `),
  };

  return map[type] || map.alias;
}

function escapeHTML(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function isTrue(value) {
  return value === true || value === 1 || value === "1" || String(value).toLowerCase() === "true";
}

function safeNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

async function apiRequest(payload) {
  try {
    const res = await fetch(GAS_API_URL, {
      method: "POST",
      body: JSON.stringify(payload),
      headers: { "Content-Type": "text/plain;charset=utf-8" },
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (error) {
    console.error("API Error:", error);
    return null;
  }
}

function prepareTelegramWebApp() {
  const tg = window.Telegram?.WebApp;
  if (!tg) return;

  try { tg.ready(); } catch {}
  try { tg.expand(); } catch {}
  try { tg.setHeaderColor("#eaf3ff"); } catch {}
  try { tg.setBackgroundColor("#eaf3ff"); } catch {}

  document.documentElement.classList.add("is-telegram");
}

function getTelegramUser() {
  const tgUser = window.Telegram?.WebApp?.initDataUnsafe?.user || {};
  return {
    username: tgUser.username || "без_ника",
    id: tgUser.id || "аноним",
    link: tgUser.username ? `https://t.me/${tgUser.username}` : "неизвестно",
  };
}

async function loadJSON(url) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ошибка: ${res.status} при загрузке ${url}`);
  return await res.json();
}

function shuffleArray(arr) {
  const copy = Array.isArray(arr) ? [...arr] : [];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function openSupportChat() {
  if (window.Telegram?.WebApp?.openTelegramLink) {
    window.Telegram.WebApp.openTelegramLink(SUPPORT_LINK);
  } else {
    window.open(SUPPORT_LINK, "_blank", "noopener");
  }
}

function renderGameButton(item) {
  return `
    <button type="button" class="game-card" onclick="showGame('${item.key}')" aria-label="Открыть игру ${escapeHTML(item.title)}">
      <span class="game-card__icon game-card__icon--image">${menuIconHTML(item.icon, item.title)}</span>
      <span class="game-card__body">
        <span class="game-card__title">${escapeHTML(item.title)}</span>
        <span class="game-card__desc">${escapeHTML(item.desc)}</span>
      </span>
    </button>
  `;
}

function renderMainMenu() {
  GAME_GROUPS.forEach((group) => {
    const root = document.getElementById(group.id);
    if (!root || root.dataset.ready === "1") return;
    root.innerHTML = group.items.map(renderGameButton).join("");
    root.dataset.ready = "1";
  });

  const systemRoot = document.getElementById("system-actions");
  if (systemRoot && systemRoot.dataset.ready !== "1") {
    systemRoot.innerHTML = `
      <button type="button" class="game-card game-card--system" onclick="showSupportModal()">
        <span class="game-card__icon">${svgIcon("support")}</span>
        <span class="game-card__body">
          <span class="game-card__title">Тех-поддержка</span>
          <span class="game-card__desc">Сообщить об ошибке или предложить идею</span>
        </span>
      </button>
    `;
    systemRoot.dataset.ready = "1";
  }
}

function renderAdminButton() {
  const systemRoot = document.getElementById("system-actions");
  if (!systemRoot || document.getElementById("admin-btn")) return;

  const btn = document.createElement("button");
  btn.type = "button";
  btn.id = "admin-btn";
  btn.className = "game-card game-card--admin";
  btn.innerHTML = `
    <span class="game-card__icon">${svgIcon("admin")}</span>
    <span class="game-card__body">
      <span class="game-card__title">Админ-панель</span>
      <span class="game-card__desc">Пользователи, баллы и рассылка</span>
    </span>
  `;
  btn.addEventListener("click", openAdminPanel);
  systemRoot.appendChild(btn);
}

function showMenu() {
  const menu = document.getElementById("menu-container");
  const banned = document.getElementById("banned-screen");
  const loader = document.getElementById("main-loader");
  if (loader) loader.remove();
  if (banned) banned.classList.add("hidden");
  if (menu) menu.classList.remove("hidden");
}

function showBannedScreen() {
  const menu = document.getElementById("menu-container");
  const banned = document.getElementById("banned-screen");
  const loader = document.getElementById("main-loader");
  if (loader) loader.remove();
  if (menu) menu.classList.add("hidden");
  if (banned) banned.classList.remove("hidden");
}

function getLocalProgressForSync(userId) {
  let localWowData = { coins: 20 };
  try { localWowData = JSON.parse(localStorage.getItem("bibleWowData_v5") || "{}"); } catch {}

  let localWsStars = 0;
  try { localWsStars = parseInt(localStorage.getItem(`bible_stars_v1_${userId}`) || "0", 10); } catch {}

  let localSwLevel = 0;
  try {
    const swState = JSON.parse(localStorage.getItem(`sacred_word_levels_v4_${userId}`) || "{}");
    localSwLevel = Number(swState.level || 0);
  } catch {}

  let localGamesHistory = [];
  try {
    localGamesHistory = JSON.parse(localStorage.getItem("last_games_history") || "[]");
    if (!Array.isArray(localGamesHistory)) localGamesHistory = [];
  } catch { localGamesHistory = []; }

  return { localWowData, localWsStars, localSwLevel, localGamesHistory };
}

function applyServerProgress(res, userId, localWowData) {
  if (!res) return;

  if (res.wowStars !== undefined) {
    localWowData.coins = safeNumber(res.wowStars, localWowData.coins ?? 20);
    localStorage.setItem("bibleWowData_v5", JSON.stringify(localWowData));
  }

  if (res.wsStars !== undefined) {
    localStorage.setItem(`bible_stars_v1_${userId}`, String(safeNumber(res.wsStars, 0)));
  }

  if (res.swLevel !== undefined) {
    try {
      const swState = JSON.parse(localStorage.getItem(`sacred_word_levels_v4_${userId}`) || "{}");
      swState.level = safeNumber(res.swLevel, swState.level || 0);
      localStorage.setItem(`sacred_word_levels_v4_${userId}`, JSON.stringify(swState));
    } catch {}
  }

  if (Array.isArray(res.lastGames)) {
    localStorage.setItem("last_games_history", JSON.stringify(res.lastGames));
    currentUserData.lastGames = res.lastGames;
  }
}

async function syncCurrentUser({ force = false } = {}) {
  const now = Date.now();
  if (!force && accessState.checked) return accessState;
  if (accessState.promise) return accessState.promise;

  accessState.promise = (async () => {
    const tgUser = getTelegramUser();
    const { localWowData, localWsStars, localSwLevel, localGamesHistory } = getLocalProgressForSync(tgUser.id);

    const res = await apiRequest({
      action: "syncUser",
      user: {
        id: tgUser.id,
        username: tgUser.username,
        link: tgUser.link,
        wowStars: typeof localWowData.coins === "number" ? localWowData.coins : 20,
        wsStars: Number.isNaN(localWsStars) ? 0 : localWsStars,
        swLevel: localSwLevel,
        lastGames: localGamesHistory,
        forceUpdate: false,
      },
    });

    if (res) {
      accessState.checked = true;
      accessState.lastSyncAt = now;
      accessState.isBanned = isTrue(res.isBanned);
      applyServerProgress(res, tgUser.id, localWowData);
    } else {
      // Если сервер недоступен, не блокируем запуск приложения.
      accessState.checked = true;
      accessState.lastSyncAt = now;
      accessState.isBanned = false;
    }

    accessState.promise = null;
    return accessState;
  })();

  return accessState.promise;
}

async function initializeApp() {
  prepareTelegramWebApp();
  renderMainMenu();

  const tgUser = getTelegramUser();
  if (String(tgUser.id) === ADMIN_ID) renderAdminButton();

  try {
    const state = await syncCurrentUser();
    if (state.isBanned) showBannedScreen();
    else showMenu();
  } catch (error) {
    console.error("Init Error:", error);
    showMenu();
  }
}

function rememberGameOpen(gameName) {
  const title = GAME_TITLES[gameName];
  if (!title) return;

  let history = [];
  try {
    history = JSON.parse(localStorage.getItem("last_games_history") || "[]");
    if (!Array.isArray(history)) history = [];
  } catch { history = []; }

  history = history.filter((item) => item !== title);
  history.unshift(title);
  history = history.slice(0, 3);

  localStorage.setItem("last_games_history", JSON.stringify(history));
  currentUserData.lastGames = history;

  apiRequest({ action: "updateHistory", id: getTelegramUser().id, history });
}

function showGame(gameName) {
  rememberGameOpen(gameName);

  const container = document.getElementById("game-container");
  const menu = document.getElementById("menu-container");

  if (container) container.innerHTML = `<div class="app-game-loading"><div class="app-loader__ring"></div><p>Загрузка игры...</p></div>`;
  if (menu) menu.classList.add("hidden");

  document.body.dataset.mode = "game";
  window.scrollTo({ top: 0, behavior: "auto" });

  // Скрипты игр не удаляем и не загружаем повторно: у старых игровых файлов есть
  // глобальные let/const/function, и повторная вставка того же script ломает игру
  // после выхода в меню. Активное состояние чистится отдельно через cleanupActiveGame().
  activeGameName = gameName;
  document.body.dataset.currentGame = gameName;

  const routes = {
    alias: ["games/alias.js", () => window.startAliasGame?.()],
    coimaginarium: ["games/coimaginarium.js", () => window.startCoimaginariumGame?.("data/coimaginarium_themes.json")],
    guess: ["games/guess-character.js", () => window.startGuessCharacterGame?.("data/characters.json")],
    describe: ["games/describe-char.js", () => window.startDescribeCharacterGame?.("data/describe_words.json")],
    spy: ["games/spy.js", () => window.startSpyGame?.("data/spy_locations.json")],
    "kids-ark-pairs": ["games/kids-ark-pairs.js", () => window.startKidsArkPairsGame?.()],
    quartet: ["games/quartet.js", () => window.startQuartetGame?.("data/quartet_bible.json")],
    "bible-wow": ["games/bible-wow.js", () => window.startBibleWowGame?.("data/bible_wow_levels.json")],
    "bible-wordsearch": ["games/bible-wordsearch.js", () => window.startBibleWordSearchGame?.("data/bible_wordsearch_levels.json")],
    "sacred-word": ["games/sacred-word.js", () => window.startSacredWordGame?.("data/sacred_words.json")],
  };

  const route = routes[gameName];
  if (!route) {
    if (container) container.innerHTML = `<div class="app-error-card"><h2>Игра не найдена</h2><button class="back-button" onclick="goToMainMenu()">В меню</button></div>`;
    return;
  }

  loadGameScript(route[0], route[1]);
}

function loadGameScript(fileName, callback) {
  const startLoadedGame = () => {
    try {
      if (typeof callback !== "function") throw new Error("Не найдена функция запуска игры");
      const result = callback();
      if (result === undefined) {
        // undefined — нормальный результат для старых start-функций.
      }
    } catch (error) {
      console.error("Ошибка запуска игры:", error);
      const container = document.getElementById("game-container");
      if (container) {
        container.innerHTML = `
          <section class="app-error-card fade-in">
            <h2>Ошибка запуска</h2>
            <p>Игра загрузилась, но не смогла стартовать. Попробуйте вернуться в меню и открыть её снова.</p>
            <button class="back-button" onclick="goToMainMenu()">В главное меню</button>
          </section>
        `;
      }
    }
  };

  const existing = loadedGameScripts.get(fileName);
  if (existing?.status === "loaded") {
    requestAnimationFrame(startLoadedGame);
    return;
  }

  if (existing?.status === "loading") {
    existing.callbacks.push(startLoadedGame);
    return;
  }

  const record = { status: "loading", callbacks: [startLoadedGame], element: null };
  loadedGameScripts.set(fileName, record);

  const script = document.createElement("script");
  script.src = `${fileName}?v=19`;
  script.dataset.gameScript = fileName;

  script.onload = () => {
    record.status = "loaded";
    currentGameScript = script;
    const callbacks = record.callbacks.splice(0);
    callbacks.forEach((fn) => requestAnimationFrame(fn));
  };

  script.onerror = () => {
    loadedGameScripts.delete(fileName);
    console.error(`Файл ${fileName} не загружается`);
    const container = document.getElementById("game-container");
    if (container) {
      container.innerHTML = `
        <section class="app-error-card fade-in">
          <h2>Файл игры не найден</h2>
          <p>Не удалось загрузить <b>${escapeHTML(fileName)}</b>.</p>
          <button class="back-button" onclick="goToMainMenu()">В главное меню</button>
        </section>
      `;
    }
  };

  record.element = script;
  document.body.appendChild(script);
  currentGameScript = script;
}

function cleanupActiveGame() {
  try { if (window.aliasInterval) clearInterval(window.aliasInterval); } catch {}
  try { if (window.coimaginariumInterval) clearInterval(window.coimaginariumInterval); } catch {}
  try { window.__aliasCleanup?.(); } catch {}
  try { window.__wsCleanup?.(); } catch {}
  try { window.__sacredWordCleanup?.(); } catch {}
  try { window.__quartetCleanup?.(); } catch {}
}

function goToMainMenu() {
  const container = document.getElementById("game-container");
  const menu = document.getElementById("menu-container");

  cleanupActiveGame();

  currentGameScript = null;
  activeGameName = null;

  if (container) container.innerHTML = "";
  delete document.body.dataset.mode;
  delete document.body.dataset.currentGame;

  // Важно: не запускаем initializeApp() повторно при каждом выходе из игры.
  // Проверка доступа выполняется один раз при открытии приложения, а история игр обновляется отдельно.
  window.goToMainMenu = window.appGoToMainMenu;

  if (accessState.isBanned) showBannedScreen();
  else if (menu) menu.classList.remove("hidden");

  window.scrollTo({ top: 0, behavior: "auto" });
}

function showSupportModal() {
  if (document.getElementById("support-modal-overlay")) return;

  const overlay = document.createElement("div");
  overlay.id = "support-modal-overlay";
  overlay.className = "support-overlay";
  overlay.innerHTML = `
    <div class="support-box" onclick="event.stopPropagation()">
      <div class="support-icon">${svgIcon("support")}</div>
      <h3 class="support-title">Тех-поддержка</h3>
      <p class="support-text">Напишите, если заметили ошибку, неудобство в игре или хотите предложить новую функцию.</p>
      <div class="support-actions">
        <button class="support-btn-primary" id="support-write-btn">Написать</button>
        <button class="support-btn-secondary" id="support-close-btn">Закрыть</button>
      </div>
    </div>
  `;

  function closeModal() {
    overlay.classList.add("support-overlay--closing");
    setTimeout(() => overlay.remove(), 180);
  }

  overlay.addEventListener("click", closeModal);
  document.body.appendChild(overlay);
  document.getElementById("support-close-btn")?.addEventListener("click", closeModal);
  document.getElementById("support-write-btn")?.addEventListener("click", openSupportChat);
}

async function openAdminPanel() {
  const container = document.getElementById("game-container");
  const menu = document.getElementById("menu-container");
  if (!container) return;

  if (menu) menu.classList.add("hidden");
  document.body.dataset.mode = "admin";
  window.scrollTo({ top: 0, behavior: "auto" });

  container.innerHTML = `
    <section class="admin-page admin-loading fade-in">
      <div class="app-loader__ring"></div>
      <p>Загрузка базы пользователей...</p>
    </section>
  `;

  const res = await apiRequest({ action: "getAdminData", adminId: ADMIN_ID });
  if (!res || !Array.isArray(res.users)) {
    container.innerHTML = `
      <section class="app-error-card fade-in">
        <h2>Не удалось загрузить базу</h2>
        <p>Проверьте интернет или Apps Script.</p>
        <button class="back-button" onclick="goToMainMenu()">Назад</button>
      </section>
    `;
    return;
  }

  adminState.users = res.users.map(normalizeAdminUser);
  adminState.filteredUsers = [...adminState.users];
  adminState.page = 1;
  adminState.query = "";

  container.innerHTML = renderAdminShell(adminState.users.length);
  bindAdminEvents();
  renderAdminUsers();
}

function normalizeAdminUser(user) {
  return {
    id: String(user.id ?? ""),
    username: String(user.username || "без_ника"),
    link: String(user.link || "неизвестно"),
    lastGames: user.lastGames || "[]",
    wowStars: safeNumber(user.wowStars, 0),
    wsStars: safeNumber(user.wsStars, 0),
    swLevel: safeNumber(user.swLevel, 0),
    isBanned: isTrue(user.isBanned),
  };
}

function renderAdminShell(total) {
  const bannedCount = adminState.users.filter((u) => u.isBanned).length;
  const activeCount = total - bannedCount;

  return `
    <section class="admin-page fade-in">
      <div class="admin-topbar">
        <button type="button" class="admin-back" onclick="goToMainMenu()" aria-label="Назад в меню">←</button>
        <div>
          <h2>Админ-панель</h2>
          <p>${total} пользователей • ${activeCount} активных • ${bannedCount} заблокировано</p>
        </div>
      </div>

      <details class="admin-broadcast">
        <summary>
          <span>Рассылка</span>
          <small>Открыть форму сообщения</small>
        </summary>
        <div class="admin-broadcast__body">
          <textarea id="broadcast-text" rows="4" placeholder="Введите сообщение. Поддерживаются HTML-теги: <b>, <i>"></textarea>
          <button id="broadcast-btn" type="button" onclick="sendBroadcast()">Отправить всем</button>
        </div>
      </details>

      <div class="admin-tools">
        <label class="admin-search">
          <span>Поиск</span>
          <input id="admin-search-input" type="search" placeholder="Ник, ID или последняя игра" autocomplete="off" />
        </label>
        <div class="admin-pager" aria-live="polite">
          <button type="button" id="admin-prev">←</button>
          <span id="admin-page-label">1 / 1</span>
          <button type="button" id="admin-next">→</button>
        </div>
      </div>

      <div class="admin-list" id="admin-user-list"></div>
    </section>
  `;
}

function bindAdminEvents() {
  const search = document.getElementById("admin-search-input");
  search?.addEventListener("input", () => {
    adminState.query = search.value.trim().toLowerCase();
    adminState.page = 1;
    renderAdminUsers();
  });

  document.getElementById("admin-prev")?.addEventListener("click", () => {
    adminState.page = Math.max(1, adminState.page - 1);
    renderAdminUsers();
  });

  document.getElementById("admin-next")?.addEventListener("click", () => {
    const totalPages = Math.max(1, Math.ceil(adminState.filteredUsers.length / ADMIN_PAGE_SIZE));
    adminState.page = Math.min(totalPages, adminState.page + 1);
    renderAdminUsers();
  });
}

function parseHistory(user) {
  try {
    const parsed = typeof user.lastGames === "string" ? JSON.parse(user.lastGames) : user.lastGames;
    return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
  } catch {
    return [];
  }
}

function filterAdminUsers() {
  const q = adminState.query;
  if (!q) return [...adminState.users];

  return adminState.users.filter((user) => {
    const history = parseHistory(user).join(" ").toLowerCase();
    return String(user.id).toLowerCase().includes(q)
      || user.username.toLowerCase().includes(q)
      || history.includes(q);
  });
}

function renderAdminUsers() {
  const list = document.getElementById("admin-user-list");
  const pageLabel = document.getElementById("admin-page-label");
  const prev = document.getElementById("admin-prev");
  const next = document.getElementById("admin-next");
  if (!list) return;

  adminState.filteredUsers = filterAdminUsers();
  const totalPages = Math.max(1, Math.ceil(adminState.filteredUsers.length / ADMIN_PAGE_SIZE));
  adminState.page = Math.min(Math.max(1, adminState.page), totalPages);
  const start = (adminState.page - 1) * ADMIN_PAGE_SIZE;
  const users = adminState.filteredUsers.slice(start, start + ADMIN_PAGE_SIZE);

  if (pageLabel) pageLabel.textContent = `${adminState.page} / ${totalPages}`;
  if (prev) prev.disabled = adminState.page <= 1;
  if (next) next.disabled = adminState.page >= totalPages;

  if (users.length === 0) {
    list.innerHTML = `<div class="admin-empty">Ничего не найдено</div>`;
    return;
  }

  list.innerHTML = users.map(renderAdminUserCard).join("");
}

function renderAdminUserCard(user) {
  const name = user.username && user.username !== "без_ника" ? `@${user.username}` : `ID: ${user.id}`;
  const history = parseHistory(user);
  const historyText = history.length ? history.join(", ") : "Нет данных";
  const statusClass = user.isBanned ? "is-banned" : "is-active";
  const statusText = user.isBanned ? "Заблокирован" : "Активен";
  const chatLink = user.link !== "неизвестно"
    ? `<a href="${escapeHTML(user.link)}" target="_blank" rel="noopener" class="admin-chat">Чат</a>`
    : `<span class="admin-chat admin-chat--disabled">Нет чата</span>`;

  return `
    <details class="admin-user ${statusClass}">
      <summary>
        <span class="admin-user__main">
          <b>${escapeHTML(name)}</b>
          <small>ID: ${escapeHTML(user.id)} • ${escapeHTML(historyText)}</small>
        </span>
        <span class="admin-user__status">${statusText}</span>
      </summary>

      <div class="admin-user__body">
        <div class="admin-user__topline">
          ${chatLink}
          <button type="button" class="admin-ban ${user.isBanned ? "admin-ban--restore" : ""}" onclick="toggleBan('${escapeHTML(user.id)}', ${!user.isBanned})">
            ${user.isBanned ? "Разблокировать" : "Заблокировать"}
          </button>
        </div>

        <div class="admin-score-grid">
          ${renderAdminScoreControl(user.id, "wow", "stars_wow", "Bible Words", user.wowStars)}
          ${renderAdminScoreControl(user.id, "ws", "stars_ws", "Word Search", user.wsStars)}
          ${renderAdminScoreControl(user.id, "sw", "stars_sw", "Sacred Word", user.swLevel)}
        </div>
      </div>
    </details>
  `;
}

function renderAdminScoreControl(userId, prefix, type, label, value) {
  const inputId = `${prefix}_${userId}`;
  return `
    <label class="admin-score">
      <span>${escapeHTML(label)}</span>
      <div>
        <input type="number" id="${escapeHTML(inputId)}" value="${escapeHTML(value)}" inputmode="numeric" />
        <button type="button" onclick="updateUserStars('${escapeHTML(userId)}', '${type}', '${escapeHTML(inputId)}')">✓</button>
      </div>
    </label>
  `;
}

async function updateUserStars(targetId, type, inputId) {
  const input = document.getElementById(inputId);
  const raw = input?.value ?? "0";
  const value = safeNumber(raw, 0);

  const res = await apiRequest({ action: "updateUser", adminId: ADMIN_ID, updateData: { targetId, type, value } });
  if (!res) {
    showToast("Не удалось обновить", "error");
    return;
  }

  const user = adminState.users.find((u) => String(u.id) === String(targetId));
  if (user) {
    if (type === "stars_wow") user.wowStars = value;
    if (type === "stars_ws") user.wsStars = value;
    if (type === "stars_sw") user.swLevel = value;
  }

  const tgUser = getTelegramUser();
  if (String(tgUser.id) === String(targetId)) {
    if (type === "stars_wow") {
      let data = {};
      try { data = JSON.parse(localStorage.getItem("bibleWowData_v5") || "{}"); } catch {}
      data.coins = value;
      localStorage.setItem("bibleWowData_v5", JSON.stringify(data));
    } else if (type === "stars_ws") {
      localStorage.setItem(`bible_stars_v1_${tgUser.id}`, String(value));
    } else if (type === "stars_sw") {
      let data = {};
      try { data = JSON.parse(localStorage.getItem(`sacred_word_levels_v4_${tgUser.id}`) || "{}"); } catch {}
      data.level = value;
      localStorage.setItem(`sacred_word_levels_v4_${tgUser.id}`, JSON.stringify(data));
    }
  }

  showToast("Обновлено");
}

async function toggleBan(targetId, banStatus) {
  const action = banStatus ? "заблокировать" : "разблокировать";
  if (!confirm(`Вы уверены, что хотите ${action} пользователя?`)) return;

  const res = await apiRequest({ action: "updateUser", adminId: ADMIN_ID, updateData: { targetId, type: "ban", value: banStatus } });
  if (!res) {
    showToast("Не удалось изменить блокировку", "error");
    return;
  }

  const user = adminState.users.find((u) => String(u.id) === String(targetId));
  if (user) user.isBanned = Boolean(banStatus);
  renderAdminUsers();
  showToast(banStatus ? "Пользователь заблокирован" : "Пользователь разблокирован");
}

async function sendBroadcast() {
  const textEl = document.getElementById("broadcast-text");
  const btn = document.getElementById("broadcast-btn");
  const text = textEl?.value.trim() || "";

  if (!text) {
    alert("Введите текст сообщения.");
    return;
  }

  if (!confirm("Отправить это сообщение всем пользователям?")) return;

  if (btn) {
    btn.disabled = true;
    btn.textContent = "Отправка...";
  }

  const res = await apiRequest({ action: "broadcast", adminId: ADMIN_ID, text });

  if (btn) {
    btn.disabled = false;
    btn.textContent = "Отправить всем";
  }

  if (res && res.success) {
    if (textEl) textEl.value = "";
    alert(`Рассылка завершена.\n\nДоставлено: ${res.delivered}\nОшибок: ${res.failed}`);
  } else {
    alert("Не удалось отправить рассылку.");
  }
}

function showToast(message, type = "success") {
  const toast = document.createElement("div");
  toast.className = `app-toast app-toast--${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add("app-toast--visible"));
  setTimeout(() => {
    toast.classList.remove("app-toast--visible");
    setTimeout(() => toast.remove(), 220);
  }, 1800);
}

// Экспортируем функции для старых игровых файлов и inline-обработчиков.
window.apiRequest = apiRequest;
window.svgIcon = svgIcon;
window.getTelegramUser = getTelegramUser;
window.loadJSON = loadJSON;
window.shuffleArray = shuffleArray;
window.escapeHTML = escapeHTML;
window.showGame = showGame;
window.openSupportChat = openSupportChat;
window.showSupportModal = showSupportModal;
window.openAdminPanel = openAdminPanel;
window.updateUserStars = updateUserStars;
window.toggleBan = toggleBan;
window.sendBroadcast = sendBroadcast;
window.appGoToMainMenu = goToMainMenu;
window.goToMainMenu = goToMainMenu;

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initializeApp);
} else {
  initializeApp();
}
