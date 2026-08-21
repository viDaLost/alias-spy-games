(function (root, factory) {
  const api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.BiblicalMatchThreeProgress = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";

  const VERSION = 3;
  const LEGACY_KEY = "biblical_match_three_progress_v1";
  const DEFAULT_DAILY_REWARD = 5;
  const FREE_REWARD_STEPS = { easy: 3500, medium: 5000, hard: 6500 };

  function safeStorage() {
    try {
      if (root?.localStorage) return root.localStorage;
    } catch {}
    const memory = new Map();
    return {
      getItem: (key) => memory.has(key) ? memory.get(key) : null,
      setItem: (key, value) => memory.set(key, String(value)),
      removeItem: (key) => memory.delete(key),
    };
  }

  const storage = safeStorage();

  function userId() {
    const candidates = [];
    try {
      if (typeof root?.getTelegramUser === "function") {
        const user = root.getTelegramUser();
        candidates.push(user?.id);
      }
    } catch {}
    try {
      candidates.push(root?.Telegram?.WebApp?.initDataUnsafe?.user?.id);
    } catch {}
    try { candidates.push(root?.__ANDROID_TELEGRAM_ID__); } catch {}
    for (const value of candidates) {
      const id = String(value ?? "").trim();
      if (/^\d{5,20}$/.test(id)) return id;
    }
    return "anon";
  }

  function progressKey() {
    return `biblical_match_three_progress_v2_${userId()}`;
  }

  function starsKey() {
    return `bible_stars_v1_${userId()}`;
  }

  function emptyFreeStats() {
    return { bestScore: 0, bestCascade: 1, bestSpecials: 0, games: 0, lastScore: 0, dailyBest: 0, dailyKey: "" };
  }

  function defaultProgress() {
    return {
      version: VERSION,
      unlocked: 1,
      levelRatings: {},
      levelBestScores: {},
      firstClearRewarded: {},
      free: { easy: emptyFreeStats(), medium: emptyFreeStats(), hard: emptyFreeStats() },
      freeRewardMilestones: { easy: 0, medium: 0, hard: 0 },
      daily: { claimedKey: "" },
      boosterStats: {},
      tutorialSeen: {},
      updatedAt: Date.now(),
    };
  }

  function normalizeFreeStats(raw) {
    const base = emptyFreeStats();
    if (!raw || typeof raw !== "object") return base;
    for (const key of Object.keys(base)) {
      if (key === "dailyKey") base[key] = typeof raw[key] === "string" ? raw[key] : "";
      else base[key] = Math.max(0, Number(raw[key] || 0));
    }
    base.bestCascade = Math.max(1, base.bestCascade || 1);
    return base;
  }

  function migrateLegacy(next) {
    try {
      const raw = JSON.parse(storage.getItem(LEGACY_KEY) || "{}");
      if (!raw || typeof raw !== "object") return next;
      next.unlocked = Math.max(next.unlocked, Number(raw.unlocked || 1));
      const legacyRatings = raw.stars && typeof raw.stars === "object" ? raw.stars : {};
      for (const [id, rating] of Object.entries(legacyRatings)) {
        next.levelRatings[id] = Math.max(Number(next.levelRatings[id] || 0), Math.min(3, Number(rating || 0)));
      }
      const legacyBest = raw.bestFree && typeof raw.bestFree === "object" ? raw.bestFree : {};
      for (const mode of ["easy", "medium", "hard"]) {
        const score = Math.max(0, Number(legacyBest[mode] || 0));
        next.free[mode].bestScore = Math.max(next.free[mode].bestScore, score);
      }
    } catch {}
    return next;
  }

  function load() {
    const fallback = migrateLegacy(defaultProgress());
    try {
      const parsed = JSON.parse(storage.getItem(progressKey()) || "null");
      if (!parsed || typeof parsed !== "object") return fallback;
      const next = defaultProgress();
      next.unlocked = Math.max(1, Number(parsed.unlocked || fallback.unlocked || 1));
      const ratings = parsed.levelRatings || parsed.stars || {};
      if (ratings && typeof ratings === "object") {
        for (const [id, rating] of Object.entries(ratings)) next.levelRatings[id] = Math.max(0, Math.min(3, Number(rating || 0)));
      }
      const bestScores = parsed.levelBestScores || {};
      if (bestScores && typeof bestScores === "object") {
        for (const [id, score] of Object.entries(bestScores)) next.levelBestScores[id] = Math.max(0, Math.floor(Number(score || 0)));
      }
      next.firstClearRewarded = parsed.firstClearRewarded && typeof parsed.firstClearRewarded === "object" ? { ...parsed.firstClearRewarded } : {};
      for (const mode of ["easy", "medium", "hard"]) next.free[mode] = normalizeFreeStats(parsed.free?.[mode]);
      next.freeRewardMilestones = {
        easy: Math.max(0, Number(parsed.freeRewardMilestones?.easy || 0)),
        medium: Math.max(0, Number(parsed.freeRewardMilestones?.medium || 0)),
        hard: Math.max(0, Number(parsed.freeRewardMilestones?.hard || 0)),
      };
      next.daily = { claimedKey: String(parsed.daily?.claimedKey || "") };
      next.boosterStats = parsed.boosterStats && typeof parsed.boosterStats === "object" ? { ...parsed.boosterStats } : {};
      next.tutorialSeen = parsed.tutorialSeen && typeof parsed.tutorialSeen === "object" ? { ...parsed.tutorialSeen } : {};
      return migrateLegacy(next);
    } catch {
      return fallback;
    }
  }

  function save(progress) {
    const next = { ...progress, version: VERSION, updatedAt: Date.now() };
    try { storage.setItem(progressKey(), JSON.stringify(next)); } catch {}
    return next;
  }

  function getStars() {
    try {
      const value = Number(storage.getItem(starsKey()));
      return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
    } catch { return 0; }
  }

  function publishStars(balance, delta, reason) {
    try {
      root?.dispatchEvent?.(new CustomEvent("app:stars-changed", { detail: { balance, delta, reason: reason || "", source: "biblical-match-three" } }));
    } catch {}
  }

  function setStars(value, reason = "") {
    const previous = getStars();
    const balance = Math.max(0, Math.floor(Number(value || 0)));
    try { storage.setItem(starsKey(), String(balance)); } catch {}
    publishStars(balance, balance - previous, reason);
    return balance;
  }

  function addStars(delta, reason = "") { return setStars(getStars() + Math.trunc(Number(delta || 0)), reason); }

  function spendStars(cost, reason = "") {
    const price = Math.max(0, Math.floor(Number(cost || 0)));
    const balance = getStars();
    if (balance < price) return { ok: false, balance, cost: price };
    return { ok: true, balance: setStars(balance - price, reason), cost: price };
  }

  function completeLevel(progress, levelId, rating, reward, totalLevels, score = 0) {
    const next = progress || load();
    const id = String(levelId);
    if (!next.levelBestScores || typeof next.levelBestScores !== "object") next.levelBestScores = {};
    const previousRating = Number(next.levelRatings[id] || 0);
    const newRating = Math.max(previousRating, Math.min(3, Math.max(1, Number(rating || 1))));
    const previousBestScore = Math.max(0, Math.floor(Number(next.levelBestScores[id] || 0)));
    const attemptScore = Math.max(0, Math.floor(Number(score || 0)));
    const newBestScore = Math.max(previousBestScore, attemptScore);
    next.levelRatings[id] = newRating;
    next.levelBestScores[id] = newBestScore;
    next.unlocked = Math.max(next.unlocked, Math.min(Number(totalLevels || levelId), Number(levelId) + 1));
    let awarded = 0;
    if (!next.firstClearRewarded[id]) {
      next.firstClearRewarded[id] = true;
      awarded += Math.max(0, Number(reward || 0));
    }
    if (newRating > previousRating) awarded += (newRating - previousRating) * 2;
    if (awarded > 0) addStars(awarded, `match3-level-${id}`);
    save(next);
    return {
      progress: next,
      awarded,
      previousRating,
      newRating,
      previousBestScore,
      newBestScore,
      isImproved: newRating > previousRating || newBestScore > previousBestScore,
      balance: getStars(),
    };
  }

  function dayKey(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function canClaimDaily(progress = load(), date = new Date()) { return String(progress.daily?.claimedKey || "") !== dayKey(date); }

  function claimDaily(progress = load(), amount = DEFAULT_DAILY_REWARD, date = new Date()) {
    const key = dayKey(date);
    if (String(progress.daily?.claimedKey || "") === key) return { ok: false, amount: 0, balance: getStars(), progress };
    progress.daily = { claimedKey: key };
    const reward = Math.max(0, Math.floor(Number(amount || DEFAULT_DAILY_REWARD)));
    const balance = addStars(reward, "match3-daily-blessing");
    save(progress);
    return { ok: true, amount: reward, balance, progress };
  }

  function beginFreeRun(progress = load(), mode = "easy") {
    const stats = normalizeFreeStats(progress.free?.[mode]);
    stats.games += 1;
    progress.free[mode] = stats;
    save(progress);
    return progress;
  }

  function recordFree(progress = load(), mode = "easy", metrics = {}) {
    const stats = normalizeFreeStats(progress.free?.[mode]);
    const today = dayKey();
    if (stats.dailyKey !== today) { stats.dailyKey = today; stats.dailyBest = 0; }
    const score = Math.max(0, Math.floor(Number(metrics.score || 0)));
    const cascade = Math.max(1, Math.floor(Number(metrics.maxCascade || 1)));
    const specials = Math.max(0, Math.floor(Number(metrics.specialsActivated || 0)));
    const previousBest = stats.bestScore;
    stats.bestScore = Math.max(stats.bestScore, score);
    stats.bestCascade = Math.max(stats.bestCascade, cascade);
    stats.bestSpecials = Math.max(stats.bestSpecials, specials);
    stats.lastScore = score;
    stats.dailyBest = Math.max(stats.dailyBest, score);
    progress.free[mode] = stats;
    const step = FREE_REWARD_STEPS[mode] || FREE_REWARD_STEPS.medium;
    const achievedMilestone = Math.floor(score / step);
    const previousMilestone = Math.max(0, Number(progress.freeRewardMilestones?.[mode] || 0));
    const milestoneDelta = Math.max(0, achievedMilestone - previousMilestone);
    let awarded = 0;
    if (milestoneDelta > 0) {
      progress.freeRewardMilestones[mode] = achievedMilestone;
      awarded = milestoneDelta * 2;
      addStars(awarded, `match3-free-${mode}-milestone`);
    }
    save(progress);
    return { progress, stats, isRecord: score > previousBest, awarded, balance: getStars(), nextMilestone: (Math.max(achievedMilestone, previousMilestone) + 1) * step };
  }

  function noteBoosterUse(progress = load(), boosterId) {
    const id = String(boosterId || "");
    if (!id) return progress;
    if (!progress || typeof progress !== "object") progress = load();
    if (!progress.boosterStats || typeof progress.boosterStats !== "object") progress.boosterStats = {};
    progress.boosterStats[id] = Math.max(0, Number(progress.boosterStats[id] || 0)) + 1;
    save(progress);
    return progress;
  }

  return { VERSION, FREE_REWARD_STEPS, userId, progressKey, starsKey, load, save, getStars, setStars, addStars, spendStars, completeLevel, dayKey, canClaimDaily, claimDaily, beginFreeRun, recordFree, noteBoosterUse };
});
