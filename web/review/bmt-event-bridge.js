(() => {
  'use strict';
  const nativeFetch = window.fetch.bind(window);
  const GAME_SOURCE = /\/web\/games\/biblical-match-three\.js(?:\?|$)/;
  function patchGameSource(source) {
    const clearNeedle = 'const expanded = expandSpecials(initialSet); const clearSet = expanded.clearSet; runtime.specialsActivated += expanded.activated.size;';
    if (!source.includes(clearNeedle)) return source;
    source = source.replace(clearNeedle, `${clearNeedle}\n  try {\n    const sceneSpecials = [...expanded.activated].map((index) => runtime.board[index]?.special).filter(Boolean);\n    const kind = meta.booster || (sceneSpecials.includes("rainbow") ? "rainbow" : sceneSpecials.includes("burst") ? "burst" : sceneSpecials.includes("lineH") ? "lineH" : sceneSpecials.includes("lineV") ? "lineV" : cascade > 1 ? "cascade" : "match");\n    window.dispatchEvent(new CustomEvent("bmt:path-light", { detail: { kind, cascade, specials: sceneSpecials, cleared: clearSet.size } }));\n  } catch {}\n`);
    const finishNeedle = 'if (won) {\n    const rating = starsForLevel();';
    if (source.includes(finishNeedle)) source = source.replace(finishNeedle, 'if (won) {\n    try { window.dispatchEvent(new CustomEvent("bmt:path-light", { detail: { kind: "levelComplete", level: runtime.level?.id || 0 } })); } catch {}\n    const rating = starsForLevel();');
    return source;
  }
  window.fetch = async function unifiedReviewFetch(input, init) {
    const response = await nativeFetch(input, init);
    const url = typeof input === 'string' ? new URL(input, document.baseURI).href : input?.url || '';
    if (!GAME_SOURCE.test(url) || !response.ok) return response;
    const headers = new Headers(response.headers); headers.set('content-type', 'text/javascript; charset=utf-8');
    return new Response(patchGameSource(await response.text()), { status: response.status, statusText: response.statusText, headers });
  };
})();
