/**
 * Duplicate detection for the card editor.
 *
 * A card is only a duplicate when **both** sides match an earlier card: a
 * shared term with a different definition ("Apple → A fruit" vs "Apple → A
 * company") or a shared definition with a different term is a legitimate card.
 *
 * Sides are compared after Unicode normalisation, lowercasing and whitespace
 * collapsing, so capitalisation, leading/trailing spaces and doubled spaces
 * cannot hide a duplicate. Nothing else is removed — "won't" and "wont", or
 * "a/b" and "ab", stay different terms.
 */
export function normalizeTerm(value: string): string {
  return value.normalize("NFKC").replace(/\s+/gu, " ").trim().toLowerCase();
}

/**
 * Pair key for a card, or `null` while either side is still empty: an
 * unfinished card is not a duplicate.
 */
export function cardKey(front: string, back: string): string | null {
  const term = normalizeTerm(front);
  const definition = normalizeTerm(back);
  if (!term || !definition) return null;
  // JSON keeps the two sides unambiguous even if a side contains separators.
  return JSON.stringify([term, definition]);
}

export interface DuplicateCandidate {
  id: string;
  front: string;
  back: string;
}

/**
 * Maps every card pair to the first card that uses it, so a warning can
 * always point at the original card rather than at another duplicate.
 */
export function indexTerms(cards: DuplicateCandidate[]): Map<string, string> {
  const index = new Map<string, string>();
  for (const card of cards) {
    const key = cardKey(card.front, card.back);
    if (!key || index.has(key)) continue;
    index.set(key, card.id);
  }
  return index;
}

/**
 * Maps a duplicate card id to the id of the original card holding the same
 * term and definition.
 */
export function findDuplicateTerms(cards: DuplicateCandidate[]): Map<string, string> {
  const originals = new Map<string, string>();
  const duplicates = new Map<string, string>();
  for (const card of cards) {
    const key = cardKey(card.front, card.back);
    if (!key) continue;
    const original = originals.get(key);
    if (original) duplicates.set(card.id, original);
    else originals.set(key, card.id);
  }
  return duplicates;
}
