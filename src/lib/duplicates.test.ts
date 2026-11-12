import { describe, expect, it } from "vitest";

import { findDuplicateTerms, indexTerms, normalizeTerm } from "./duplicates";

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

describe("indexTerms", () => {
  it("points every term at its first card", () => {
    const index = indexTerms([
      { id: "a", front: "Haus" },
      { id: "b", front: "haus" },
      { id: "c", front: "Baum" },
    ]);
    expect(index.get("haus")).toBe("a");
    expect(index.get("baum")).toBe("c");
    expect(index.size).toBe(2);
  });

  it("skips empty fronts", () => {
    const index = indexTerms([
      { id: "a", front: "   " },
      { id: "b", front: "" },
    ]);
    expect(index.size).toBe(0);
  });
});

describe("findDuplicateTerms", () => {
  it("flags casing and whitespace variants of an earlier card", () => {
    const duplicates = findDuplicateTerms([
      { id: "a", front: "Haus" },
      { id: "b", front: " haus " },
    ]);
    expect([...duplicates]).toEqual([["b", "a"]]);
  });

  it("keeps the first card as the original for every later duplicate", () => {
    const duplicates = findDuplicateTerms([
      { id: "a", front: "Haus" },
      { id: "b", front: "Baum" },
      { id: "c", front: "HAUS" },
      { id: "d", front: " Haus" },
    ]);
    expect(duplicates.get("c")).toBe("a");
    expect(duplicates.get("d")).toBe("a");
    expect(duplicates.has("a")).toBe(false);
    expect(duplicates.has("b")).toBe(false);
    expect(duplicates.size).toBe(2);
  });

  it("does not flag distinct or empty cards", () => {
    const duplicates = findDuplicateTerms([
      { id: "a", front: "Haus" },
      { id: "b", front: "Häuser" },
      { id: "c", front: "" },
      { id: "d", front: "   " },
    ]);
    expect(duplicates.size).toBe(0);
  });
});
