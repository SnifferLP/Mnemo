export type ReviewOutcome = "correct" | "partial" | "incorrect";

export interface SessionTally {
  studied: number;
  correct: number;
  partial: number;
  incorrect: number;
  accuracy: number;
}

type CardLike = { card: { id: string } };

/** Removes duplicate cards while keeping the original order. */
export function uniqueCards<T extends CardLike>(cards: T[]): T[] {
  const seen = new Set<string>();
  return cards.filter((item) => {
    const id = item.card.id;
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

/**
 * Cards that still need review in the next round.
 *
 * Only the latest outcome for a card counts, so answering correctly and then
 * missing the same card later puts it back in the queue instead of keeping a
 * stale "correct" status. Duplicates are collapsed, which also protects a
 * round from showing the same card twice.
 */
export function pendingCards<T extends CardLike>(
  cards: T[],
  outcomes: Record<string, ReviewOutcome>,
): T[] {
  return uniqueCards(cards).filter((item) => outcomes[item.card.id] !== "correct");
}

/** Summarises a session from the latest outcome of every studied card. */
export function tallyOutcomes(
  cardIds: string[],
  outcomes: Record<string, ReviewOutcome>,
): SessionTally {
  let correct = 0;
  let partial = 0;
  let incorrect = 0;

  for (const id of new Set(cardIds)) {
    const outcome = outcomes[id];
    if (outcome === "correct") correct += 1;
    else if (outcome === "partial") partial += 1;
    else if (outcome === "incorrect") incorrect += 1;
  }

  const studied = correct + partial + incorrect;
  const accuracy = studied === 0 ? 0 : ((correct + partial * 0.5) / studied) * 100;

  return { studied, correct, partial, incorrect, accuracy };
}
