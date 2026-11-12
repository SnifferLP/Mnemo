import { describe, expect, it } from "vitest";

import {
  DEFAULT_FLASHCARD_OPTIONS,
  flashcardQuery,
  flashcardSides,
  parseFlashcardOptions,
  starredCount,
} from "./flashcards";

const card = { front: "Haus", back: "House" };

describe("flashcard options", () => {
  it("defaults to front first with all terms", () => {
    expect(parseFlashcardOptions(new URLSearchParams(""))).toEqual(DEFAULT_FLASHCARD_OPTIONS);
    expect(flashcardQuery(DEFAULT_FLASHCARD_OPTIONS)).toBe("");
  });

  it("round-trips a chosen direction and selection", () => {
    const options = { direction: "back" as const, starredOnly: true };
    const query = flashcardQuery(options);
    expect(query).toBe("?direction=back&selection=starred");
    expect(parseFlashcardOptions(new URLSearchParams(query.slice(1)))).toEqual(options);
  });

  it("ignores unknown values instead of breaking the session", () => {
    const parsed = parseFlashcardOptions(new URLSearchParams("direction=sideways&selection=all"));
    expect(parsed).toEqual({ direction: "front", starredOnly: false });
  });

  it("shows the requested side first without touching the card", () => {
    expect(flashcardSides(card, "front")).toEqual({
      prompt: "Haus",
      answer: "House",
      promptLabel: "Front",
      answerLabel: "Back",
    });
    expect(flashcardSides(card, "back")).toEqual({
      prompt: "House",
      answer: "Haus",
      promptLabel: "Back",
      answerLabel: "Front",
    });
    expect(card).toEqual({ front: "Haus", back: "House" });
  });

  it("counts starred terms independently", () => {
    expect(
      starredCount([
        { card: { isStarred: true } },
        { card: { isStarred: false } },
        { card: { isStarred: true } },
      ]),
    ).toBe(2);
    expect(starredCount([])).toBe(0);
  });
});
