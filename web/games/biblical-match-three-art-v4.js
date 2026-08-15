(() => {
"use strict";
const indigo = "#4F46E5";
const indigoDark = "#312E81";
const indigoSoft = "#EEF2FF";
const blue = "#60A5FA";
const blueSoft = "#EFF6FF";
const gold = "#D29A2E";
const goldLight = "#F4C95D";
const ink = "#2D2D2D";
const slate = "#64748B";
const stone = "#E8E9F1";
const white = "#FFFFFF";

function uri(body, extraDefs = "") {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96" fill="none">
  <defs>
    <linearGradient id="i" x1="18" y1="14" x2="78" y2="82" gradientUnits="userSpaceOnUse">
      <stop stop-color="#6366F1"/><stop offset="1" stop-color="#4F46E5"/>
    </linearGradient>
    <linearGradient id="g" x1="22" y1="15" x2="72" y2="80" gradientUnits="userSpaceOnUse">
      <stop stop-color="#F6D777"/><stop offset="1" stop-color="#D29A2E"/>
    </linearGradient>
    <linearGradient id="s" x1="22" y1="15" x2="72" y2="80" gradientUnits="userSpaceOnUse">
      <stop stop-color="#F8FAFC"/><stop offset="1" stop-color="#CBD5E1"/>
    </linearGradient>
    ${extraDefs}
  </defs>${body}</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

const data = { symbols: {}, boosters: {}, goals: {}, obstacles: {} };

data.symbols.bible = uri(`
  <path d="M17 27c11-5 21-4 31 3v40c-9-6-19-8-31-3V27Z" fill="#F8FAFC" stroke="${indigoDark}" stroke-width="3.2"/>
  <path d="M79 27c-11-5-21-4-31 3v40c9-6 19-8 31-3V27Z" fill="${indigoSoft}" stroke="${indigoDark}" stroke-width="3.2"/>
  <path d="M48 30v40" stroke="${gold}" stroke-width="3.4" stroke-linecap="round"/>
  <path d="M29 38h11M29 46h11M56 38h11M56 46h11" stroke="${slate}" stroke-width="2.6" stroke-linecap="round"/>
  <path d="M34 55v11M28.5 60.5h11" stroke="${gold}" stroke-width="3" stroke-linecap="round"/>
`);

data.symbols.fish = uri(`
  <path d="M20 49c11-15 31-21 50-8 4 3 6 5 8 8-8 10-18 16-30 16-12 0-21-5-28-16Z" fill="url(#i)" stroke="${indigoDark}" stroke-width="3"/>
  <path d="M20 49 8 36v26l12-13Z" fill="url(#g)" stroke="${indigoDark}" stroke-width="3" stroke-linejoin="round"/>
  <circle cx="65" cy="45" r="3" fill="${white}"/>
  <path d="M39 42c4 4 4 10 0 14M50 40c5 5 5 13 0 18" stroke="#A5B4FC" stroke-width="2.5" stroke-linecap="round"/>
`);

data.symbols.dove = uri(`
  <path d="M27 56c-8-1-14-7-17-16 10 2 17 1 24-7 5-6 11-11 20-10-5 4-7 9-6 14 7-5 16-6 28-1-7 3-12 7-15 13 8-1 14 1 20 5-10 7-21 10-32 7-7 10-15 15-24 14 6-5 8-11 2-19Z" fill="#F8FAFC" stroke="${indigoDark}" stroke-width="3" stroke-linejoin="round"/>
  <path d="M47 45c7 3 12 2 18-1M49 54c6 3 11 3 17 1" stroke="${blue}" stroke-width="2.5" stroke-linecap="round"/>
  <path d="M68 63c7 1 13 5 17 11M70 68c4-1 7-3 9-6M75 72c4-1 7-2 10-5" stroke="${gold}" stroke-width="2.5" stroke-linecap="round"/>
`);

data.symbols.candle = uri(`
  <rect x="34" y="38" width="28" height="38" rx="7" fill="#FFF7ED" stroke="${indigoDark}" stroke-width="3"/>
  <path d="M39 51h18M39 61h18" stroke="#E2E8F0" stroke-width="2.4" stroke-linecap="round"/>
  <path d="M48 34c-8-5-8-14 0-23 8 9 8 18 0 23Z" fill="url(#g)" stroke="${gold}" stroke-width="2.2"/>
  <path d="M48 38V33" stroke="${ink}" stroke-width="2.6" stroke-linecap="round"/>
  <path d="M28 78h40" stroke="${indigo}" stroke-width="4" stroke-linecap="round"/>
`);

data.symbols.crown = uri(`
  <path d="M18 33 31 46 48 25l17 21 13-13-7 37H25l-7-37Z" fill="url(#g)" stroke="${indigoDark}" stroke-width="3" stroke-linejoin="round"/>
  <path d="M27 58h42" stroke="${white}" stroke-width="3" stroke-linecap="round" opacity=".8"/>
  <circle cx="31" cy="48" r="3.6" fill="${indigo}"/><circle cx="48" cy="40" r="4" fill="${blue}"/><circle cx="65" cy="48" r="3.6" fill="${indigo}"/>
`);

data.symbols.ark = uri(`
  <path d="M18 48h60l-7 22c-13 7-33 7-46 0l-7-22Z" fill="#B7793A" stroke="${indigoDark}" stroke-width="3" stroke-linejoin="round"/>
  <path d="M28 47V32h40v15" fill="#E7B66B" stroke="${indigoDark}" stroke-width="3"/>
  <path d="M38 32V23h20v9" fill="${goldLight}" stroke="${indigoDark}" stroke-width="3"/>
  <path d="M18 76c9-6 18-6 27 0 9 6 18 6 33 0" stroke="${blue}" stroke-width="4" stroke-linecap="round"/>
  <path d="M30 55h10M48 55h10" stroke="#FDE68A" stroke-width="2.8" stroke-linecap="round"/>
`);

data.symbols.bread = uri(`
  <path d="M18 59c0-20 13-34 30-34s30 14 30 34c0 8-6 14-14 14H32c-8 0-14-6-14-14Z" fill="#F5C56A" stroke="${indigoDark}" stroke-width="3"/>
  <path d="M35 37c-4 5-5 10-4 15M48 32c-4 6-5 12-4 19M61 37c-4 5-5 10-4 15" stroke="#FFF7D6" stroke-width="3.2" stroke-linecap="round"/>
`);

data.symbols.grapes = uri(`
  <circle cx="43" cy="40" r="10" fill="#6366F1"/><circle cx="57" cy="41" r="10" fill="#4F46E5"/>
  <circle cx="36" cy="53" r="10" fill="#818CF8"/><circle cx="50" cy="54" r="10" fill="#6366F1"/><circle cx="64" cy="53" r="10" fill="#4F46E5"/>
  <circle cx="43" cy="67" r="10" fill="#6366F1"/><circle cx="57" cy="67" r="10" fill="#4F46E5"/>
  <path d="M48 30c-3-8 0-13 8-16" stroke="${gold}" stroke-width="3" stroke-linecap="round"/>
  <path d="M56 18c8-5 16-3 21 4-9 4-16 3-21-4Z" fill="#86C98A" stroke="${indigoDark}" stroke-width="2.5"/>
`);

data.symbols.tablets = uri(`
  <path d="M18 72V35c0-10 7-18 17-18s17 8 17 18v37H18Z" fill="url(#s)" stroke="${indigoDark}" stroke-width="3"/>
  <path d="M44 72V35c0-10 7-18 17-18s17 8 17 18v37H44Z" fill="#EEF2FF" stroke="${indigoDark}" stroke-width="3"/>
  <path d="M27 39h16M27 48h16M53 39h16M53 48h16M53 57h12" stroke="${slate}" stroke-width="2.6" stroke-linecap="round"/>
`);

data.boosters.manna = uri(`
  <path d="M48 14v16M27 22l8 11M69 22l-8 11" stroke="${gold}" stroke-width="3" stroke-linecap="round"/>
  <circle cx="30" cy="50" r="8" fill="url(#g)"/><circle cx="48" cy="45" r="9" fill="url(#g)"/><circle cx="66" cy="50" r="8" fill="url(#g)"/>
  <circle cx="39" cy="65" r="8" fill="#F6D777"/><circle cx="57" cy="66" r="8" fill="#E9B94D"/>
  <path d="M18 35h8M70 35h8M48 78v6" stroke="${indigo}" stroke-width="2.8" stroke-linecap="round"/>
`);

data.boosters.oil = uri(`
  <path d="M36 25h24l-3 12c9 5 15 14 15 25 0 10-8 18-18 18H42c-10 0-18-8-18-18 0-11 6-20 15-25l-3-12Z" fill="#FFF7ED" stroke="${indigoDark}" stroke-width="3"/>
  <path d="M33 58c6-7 24-8 30 0 1 9-4 15-14 15h-2c-10 0-15-6-14-15Z" fill="url(#g)"/>
  <path d="M41 25v-7h14v7" stroke="${gold}" stroke-width="3" stroke-linecap="round"/>
  <path d="M48 47c-6 6-6 12 0 18 6-6 6-12 0-18Z" fill="${goldLight}"/>
`);

data.boosters.covenant = uri(`
  <path d="M20 65c3-23 14-34 28-34s25 11 28 34" stroke="${indigo}" stroke-width="8" stroke-linecap="round"/>
  <path d="M29 65c2-15 9-23 19-23s17 8 19 23" stroke="${blue}" stroke-width="8" stroke-linecap="round"/>
  <path d="M38 65c1-8 4-12 10-12s9 4 10 12" stroke="${goldLight}" stroke-width="8" stroke-linecap="round"/>
  <circle cx="48" cy="69" r="8" fill="#FFF" stroke="${gold}" stroke-width="3"/>
`);

data.boosters.sling = uri(`
  <path d="M26 22c13 10 18 21 22 36M70 22C57 32 52 43 48 58" stroke="#8B5E3C" stroke-width="4" stroke-linecap="round"/>
  <path d="M37 57c6-5 16-5 22 0l-3 15c-5 4-11 4-16 0l-3-15Z" fill="#A66A3F" stroke="${indigoDark}" stroke-width="3" stroke-linejoin="round"/>
  <circle cx="48" cy="63" r="5" fill="url(#s)" stroke="${slate}" stroke-width="2"/>
  <path d="M20 28c-4 11-3 23 4 34M76 28c4 11 3 23-4 34" stroke="${gold}" stroke-width="2.5" stroke-linecap="round" stroke-dasharray="4 6"/>
`);

data.boosters.staff = uri(`
  <path d="M58 16c-13 4-18 13-14 24 3 9 2 20-3 34" stroke="#8B5E3C" stroke-width="7" stroke-linecap="round"/>
  <path d="M58 16c10 2 13 9 9 16-3 5-8 7-14 5" stroke="${gold}" stroke-width="3.5" stroke-linecap="round"/>
  <path d="M42 42c-9 5-16 12-21 22M46 42c9 5 16 12 21 22" stroke="${blue}" stroke-width="3" stroke-linecap="round"/>
  <path d="M19 69h18M59 69h18" stroke="${indigo}" stroke-width="3" stroke-linecap="round"/>
`);

data.boosters.jericho = uri(`
  <path d="M24 30h18l20 18-12 10-18-16H24V30Z" fill="url(#g)" stroke="${indigoDark}" stroke-width="3" stroke-linejoin="round"/>
  <path d="M18 30h10v12H18c-5 0-8-3-8-6s3-6 8-6Z" fill="${goldLight}" stroke="${indigoDark}" stroke-width="3"/>
  <path d="M52 37c8-7 17-8 26-3M58 48c7-3 14-2 21 2M61 59c5 1 10 4 14 8" stroke="${indigo}" stroke-width="3" stroke-linecap="round"/>
`);

data.boosters.ark = uri(`
  <path d="M20 48h56l-7 20c-12 6-30 6-42 0l-7-20Z" fill="#C98A45" stroke="${indigoDark}" stroke-width="3"/>
  <path d="M30 47V32h36v15M40 32v-8h16v8" stroke="${indigoDark}" stroke-width="3" fill="#F4C95D"/>
  <path d="M18 76c9-6 18-6 27 0s18 6 33 0" stroke="${blue}" stroke-width="4" stroke-linecap="round"/>
  <path d="M76 20a31 31 0 0 1 8 26M80 18l-1 12 10-6M20 75a31 31 0 0 1-8-26M16 77l1-12-10 6" stroke="${indigo}" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/>
`);

data.goals.score = uri(`
  <circle cx="48" cy="48" r="31" fill="${indigoSoft}" stroke="${indigo}" stroke-width="3"/>
  <path d="m48 25 7 14 16 2-12 11 3 16-14-7-14 7 3-16-12-11 16-2 7-14Z" fill="url(#g)" stroke="${gold}" stroke-width="2.4" stroke-linejoin="round"/>
`);

data.goals.cascade = uri(`
  <rect x="22" y="20" width="18" height="18" rx="5" fill="#C7D2FE" stroke="${indigo}" stroke-width="2.6" transform="rotate(8 31 29)"/>
  <rect x="39" y="39" width="18" height="18" rx="5" fill="#A5B4FC" stroke="${indigo}" stroke-width="2.6" transform="rotate(-6 48 48)"/>
  <rect x="56" y="58" width="18" height="18" rx="5" fill="#818CF8" stroke="${indigo}" stroke-width="2.6" transform="rotate(8 65 67)"/>
  <path d="M34 43 43 52M51 60l8 8" stroke="${gold}" stroke-width="3" stroke-linecap="round"/>
`);

data.goals.special = uri(`
  <rect x="28" y="28" width="40" height="40" rx="13" fill="${indigoSoft}" stroke="${indigo}" stroke-width="3"/>
  <path d="M48 16v16M48 64v16M16 48h16M64 48h16" stroke="${gold}" stroke-width="3.2" stroke-linecap="round"/>
  <path d="m48 34 4 10 10 4-10 4-4 10-4-10-10-4 10-4 4-10Z" fill="url(#g)"/>
`);

data.obstacles.tablets = uri(`
  <path d="M18 74V36c0-11 7-18 17-18s17 7 17 18v38H18Z" fill="#E2E8F0" stroke="${slate}" stroke-width="3"/>
  <path d="M44 74V36c0-11 7-18 17-18s17 7 17 18v38H44Z" fill="#CBD5E1" stroke="${slate}" stroke-width="3"/>
  <path d="M34 30 28 43l10 7-7 13M61 27l-5 14 8 8-5 14" stroke="#94A3B8" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
`);

data.obstacles.chains = uri(`
  <path d="M30 60 19 49c-7-7-7-18 0-25s18-7 25 0l8 8" stroke="${slate}" stroke-width="7" stroke-linecap="round"/>
  <path d="M66 36 77 47c7 7 7 18 0 25s-18 7-25 0l-8-8" stroke="${slate}" stroke-width="7" stroke-linecap="round"/>
  <path d="m38 58 20-20" stroke="${gold}" stroke-width="4" stroke-linecap="round"/>
`);

data.obstacles.candle = uri(`
  <rect x="35" y="40" width="26" height="35" rx="7" fill="#F8FAFC" stroke="${slate}" stroke-width="3"/>
  <path d="M48 38c-4-5-4-9 1-14" stroke="${slate}" stroke-width="3" stroke-linecap="round"/>
  <path d="M49 24c8 1 12-2 14-7" stroke="#CBD5E1" stroke-width="3" stroke-linecap="round"/>
  <path d="M29 78h38" stroke="${indigo}" stroke-width="4" stroke-linecap="round"/>
`);

window.BiblicalMatchThreeV4Art = data;
window.BiblicalMatchThreeV3Art = data;
})();