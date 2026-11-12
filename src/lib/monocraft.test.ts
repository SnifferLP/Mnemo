import { describe, expect, it } from "vitest";

import { isMonocraftSeed } from "./monocraft";

describe("isMonocraftSeed", () => {
  it("accepts an empty set called Minecraft", () => {
    expect(isMonocraftSeed("Minecraft", 0)).toBe(true);
  });

  it("ignores casing and surrounding whitespace", () => {
    expect(isMonocraftSeed("minecraft", 0)).toBe(true);
    expect(isMonocraftSeed("  MiNeCrAfT  ", 0)).toBe(true);
    expect(isMonocraftSeed("\tMinecraft\n", 0)).toBe(true);
  });

  it("rejects sets that already contain cards", () => {
    expect(isMonocraftSeed("Minecraft", 1)).toBe(false);
    expect(isMonocraftSeed("Minecraft", 25)).toBe(false);
  });

  it("rejects other names", () => {
    expect(isMonocraftSeed("Minecraft survival", 0)).toBe(false);
    expect(isMonocraftSeed("Mine craft", 0)).toBe(false);
    expect(isMonocraftSeed("", 0)).toBe(false);
    expect(isMonocraftSeed("Untitled study set", 0)).toBe(false);
  });
});
