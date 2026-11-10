import { describe, expect, it } from "vitest";

import {
  pendingCards,
  tallyOutcomes,
  uniqueCards,
  type ReviewOutcome,
} from "./session";

const cards = ["a", "b", "c"].map((id) => ({ card: { id } }));

function outcomes(
  pairs: Array<[string, ReviewOutcome]>,
): Record<string, ReviewOutcome> {
  return Object.fromEntries(pairs);
}

describe("learning rounds", () => {
  it("only repeats cards answered incorrectly", () => {
    const latest = outcomes([
      ["a", "correct"],
      ["b", "incorrect"],
      ["c", "correct"],
    ]);

    expect(pendingCards(cards, latest).map((item) => item.card.id)).toEqual(["b"]);
  });

  it("repeats partially correct cards as well", () => {
    const latest = outcomes([
      ["a", "correct"],
      ["b", "partial"],
      ["c", "correct"],
    ]);

    expect(pendingCards(cards, latest).map((item) => item.card.id)).toEqual(["b"]);
  });

  it("ends the session when everything was answered correctly", () => {
    const latest = outcomes([
      ["a", "correct"],
      ["b", "correct"],
      ["c", "correct"],
    ]);

    expect(pendingCards(cards, latest)).toEqual([]);
  });

  it("removes the last missed card once it is answered correctly", () => {
    const latest = outcomes([
      ["a", "correct"],
      ["b", "correct"],
      ["c", "correct"],
    ]);

    expect(pendingCards([cards[1]], latest)).toEqual([]);
    expect(tallyOutcomes(["a", "b", "c"], latest)).toMatchObject({
      studied: 3,
      correct: 3,
      incorrect: 0,
      accuracy: 100,
    });
  });

  it("lets a later incorrect answer override an earlier correct one", () => {
    const firstRound = outcomes([
      ["a", "correct"],
      ["b", "correct"],
      ["c", "correct"],
    ]);
    expect(pendingCards(cards, firstRound)).toEqual([]);

    const secondRound = outcomes([
      ["a", "incorrect"],
      ["b", "correct"],
      ["c", "correct"],
    ]);

    expect(pendingCards(cards, secondRound).map((item) => item.card.id)).toEqual([
      "a",
    ]);
    expect(tallyOutcomes(["a", "b", "c"], secondRound)).toMatchObject({
      studied: 3,
      correct: 2,
      incorrect: 1,
    });
    expect(tallyOutcomes(["a", "b", "c"], secondRound).accuracy).toBeCloseTo(
      66.67,
      1,
    );
  });

  it("never repeats a card twice inside one round", () => {
    const duplicated = [...cards, { card: { id: "b" } }, { card: { id: "a" } }];
    const latest = outcomes([
      ["a", "incorrect"],
      ["b", "incorrect"],
      ["c", "correct"],
    ]);

    expect(pendingCards(duplicated, latest).map((item) => item.card.id)).toEqual([
      "a",
      "b",
    ]);
    expect(uniqueCards(duplicated)).toHaveLength(3);
  });

  it("ignores cards that were never answered", () => {
    const latest = outcomes([["a", "correct"]]);
    expect(tallyOutcomes(["a", "b"], latest)).toMatchObject({
      studied: 1,
      correct: 1,
      incorrect: 0,
    });
  });
});
