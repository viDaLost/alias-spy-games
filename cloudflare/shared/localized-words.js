import { gameTranslations } from './game-translations.js';
export function wordAlternatives(word) {
  return [...new Set([String(word || ''), ...(gameTranslations[String(word || '')] || [])])];
}
