/**
 * Duplicate detection for the card editor.
 *
 * Terms are compared after Unicode normalisation, lowercasing and whitespace
 * collapsing, so capitalisation, stray leading/trailing spaces and doubled
 * spaces cannot hide a duplicate. Nothing else is removed — "won't" and
 * "wont", or "a/b" and "ab", stay different terms.
 */
export function normalizeTerm(value: string): string {
  return value.normalize("NFKC").replace(/\s+/gu, " ").trim().toLowerCase();
}

export interface DuplicateCandidate {
  id: string;
  front: string;
}

/**
 * Maps every normalised term to the first card that uses it, so a warning can
 * always point at the original card rather than at another duplicate.
 */
export function indexTerms(cards: DuplicateCandidate[]): Map<string, string> {
  const index = new Map<string, string>();
  for (const card of cards) {
    const key = normalizeTerm(card.front);
    if (!key || index.has(key)) continue;
    index.set(key, card.id);
  }
  return index;
}

/**
 * Maps a duplicate card id to the id of the original card holding the same
 * term. Empty sides are ignored: an unfinished card is not a duplicate.
 */
export function findDuplicateTerms(cards: DuplicateCandidate[]): Map<string, string> {
  const originals = new Map<string, string>();
  const duplicates = new Map<string, string>();
  for (const card of cards) {
    const key = normalizeTerm(card.front);
    if (!key) continue;
    const original = originals.get(key);
    if (original) duplicates.set(card.id, original);
    else originals.set(key, card.id);
  }
  return duplicates;
}
