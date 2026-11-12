import { describe, expect, it } from "vitest";

import { cardKey, findDuplicateTerms, indexTerms, normalizeTerm } from "./duplicates";

describe("normalizeTerm", () => {
  it("ignores capitalisation and surrounding whitespace", () => {
    expect(normalizeTerm("  Haus  ")).toBe("haus");
    expect(normalizeTerm("hAuS")).toBe(normalizeTerm("HAUS"));
    expect(normalizeTerm("Haus")).toBe(normalizeTerm("\tHaus\n"));
  });

  it("collapses inner whitespace", () => {
    expect(normalizeTerm("der   große    Hund")).toBe("der große hund");
  });

  it("keeps genuinely different terms different", () => {
    expect(normalizeTerm("a/b")).not.toBe(normalizeTerm("ab"));
    expect(normalizeTerm("won't")).not.toBe(normalizeTerm("wont"));
    expect(normalizeTerm("Straße")).not.toBe(normalizeTerm("Strasse"));
    expect(normalizeTerm("Haus")).not.toBe(normalizeTerm("Häuser"));
  });

  it("treats blank terms as empty", () => {
    expect(normalizeTerm("   ")).toBe("");
    expect(normalizeTerm("\n\t")).toBe("");
  });
});

describe("cardKey", () => {
  it("needs both sides", () => {
    expect(cardKey("Apple", "")).toBeNull();
    expect(cardKey("", "A fruit")).toBeNull();
    expect(cardKey("   ", "   ")).toBeNull();
  });

  it("normalises both sides", () => {
    expect(cardKey(" Apple ", "  A   fruit ")).toBe(cardKey("apple", "a fruit"));
  });

  it("separates cards that differ on either side", () => {
    expect(cardKey("Apple", "A fruit")).not.toBe(cardKey("Apple", "A company"));
    expect(cardKey("Apple", "A fruit")).not.toBe(cardKey("Banana", "A fruit"));
  });
});

// The table from the release brief, verified end to end.
describe("findDuplicateTerms", () => {
  const cases: {
    name: string;
    existing: [string, string];
    next: [string, string];
    duplicate: boolean;
  }[] = [
    { name: "same term, other definition", existing: ["Apple", "A fruit"], next: ["Apple", "A company"], duplicate: false },
    { name: "same definition, other term", existing: ["Apple", "A fruit"], next: ["Banana", "A fruit"], duplicate: false },
    { name: "identical card", existing: ["Apple", "A fruit"], next: ["Apple", "A fruit"], duplicate: true },
    {
      name: "same term and mostly same definition",
      existing: ["Apple", "A fruit"],
      next: ["Apple", "A fruit (different definition)"],
      duplicate: false,
    },
  ];

  for (const testCase of cases) {
    it(`${testCase.duplicate ? "flags" : "ignores"} ${testCase.name}`, () => {
      const duplicates = findDuplicateTerms([
        { id: "a", front: testCase.existing[0], back: testCase.existing[1] },
        { id: "b", front: testCase.next[0], back: testCase.next[1] },
      ]);
      expect(duplicates.has("b")).toBe(testCase.duplicate);
      if (testCase.duplicate) expect(duplicates.get("b")).toBe("a");
    });
  }

  it("matches when casing and whitespace differ on both sides", () => {
    const duplicates = findDuplicateTerms([
      { id: "a", front: "Apple", back: "A fruit" },
      { id: "b", front: "  APPLE ", back: "a   FRUIT " },
    ]);
    expect(duplicates.get("b")).toBe("a");
  });

  it("keeps the first card as the original for every later duplicate", () => {
    const duplicates = findDuplicateTerms([
      { id: "a", front: "Haus", back: "House" },
      { id: "b", front: "Baum", back: "Tree" },
      { id: "c", front: "HAUS", back: "house" },
      { id: "d", front: " Haus", back: "House " },
    ]);
    expect(duplicates.get("c")).toBe("a");
    expect(duplicates.get("d")).toBe("a");
    expect(duplicates.size).toBe(2);
  });

  it("does not flag unfinished or distinct cards", () => {
    const duplicates = findDuplicateTerms([
      { id: "a", front: "Haus", back: "House" },
      { id: "b", front: "Haus", back: "" },
      { id: "c", front: "", back: "House" },
      { id: "d", front: "Häuser", back: "Houses" },
    ]);
    expect(duplicates.size).toBe(0);
  });

  it("does not flag a card against itself", () => {
    const duplicates = findDuplicateTerms([{ id: "a", front: "Haus", back: "House" }]);
    expect(duplicates.has("a")).toBe(false);
  });
});

describe("indexTerms", () => {
  it("points every pair at its first card and skips unfinished cards", () => {
    const index = indexTerms([
      { id: "a", front: "Haus", back: "House" },
      { id: "b", front: "haus", back: "house" },
      { id: "c", front: "Haus", back: "Building" },
      { id: "d", front: "Baum", back: "" },
    ]);
    expect(index.size).toBe(2);
    expect(index.get(cardKey("Haus", "House")!)).toBe("a");
    expect(index.get(cardKey("Haus", "Building")!)).toBe("c");
  });
});
