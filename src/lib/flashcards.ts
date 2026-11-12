/**
 * Flashcard session options.
 *
 * Both settings live in the URL of a learning session instead of in the card
 * data, so choosing "back first" or "starred only" never writes to the study
 * set and stays in effect for every card of the session.
 */

export type CardDirection = "front" | "back";

export interface FlashcardOptions {
  direction: CardDirection;
  starredOnly: boolean;
}

export const DEFAULT_FLASHCARD_OPTIONS: FlashcardOptions = {
  direction: "front",
  starredOnly: false,
};

type CardSides = { front: string; back: string };

export function parseFlashcardOptions(params: URLSearchParams): FlashcardOptions {
  return {
    direction: params.get("direction") === "back" ? "back" : "front",
    starredOnly: params.get("selection") === "starred",
  };
}

/** Serialises only the non-default options, so plain sessions keep a clean URL. */
export function flashcardQuery(options: FlashcardOptions): string {
  const params = new URLSearchParams();
  if (options.direction === "back") params.set("direction", "back");
  if (options.starredOnly) params.set("selection", "starred");
  const query = params.toString();
  return query ? `?${query}` : "";
}

/**
 * The two sides of a card in the order the learner asked for.
 *
 * The original card is only read, never reordered or copied back: the swap
 * happens when the card is displayed.
 */
export function flashcardSides(card: CardSides, direction: CardDirection) {
  return direction === "back"
    ? { prompt: card.back, answer: card.front, promptLabel: "Back", answerLabel: "Front" }
    : { prompt: card.front, answer: card.back, promptLabel: "Front", answerLabel: "Back" };
}

/** Number of starred terms in a list of cards. */
export function starredCount(cards: { card: { isStarred: boolean } }[]): number {
  return cards.filter((item) => item.card.isStarred).length;
}
