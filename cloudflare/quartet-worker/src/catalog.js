import data from '../../../web/data/quartet_bible.json' with { type: 'json' };

export const CATALOG = data.quartets;
export const CARD_TO_QUARTET = new Map();
export const CARD_BY_ID = new Map();
for (const quartet of CATALOG) {
  for (const card of quartet.cards) {
    CARD_TO_QUARTET.set(card.id, quartet);
    CARD_BY_ID.set(card.id, card);
  }
}
