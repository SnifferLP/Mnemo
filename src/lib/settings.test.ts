import { describe, expect, it } from "vitest";

import {
  DEFAULT_SETTINGS,
  mergeSettings,
  resolveTheme,
  systemPrefersDark,
} from "./settings";

describe("settings merging", () => {
  it("defaults to the editorial serif and English", () => {
    expect(DEFAULT_SETTINGS.displayFont).toBe("editorial");
    expect(DEFAULT_SETTINGS.language).toBe("en");
  });

  it("persists display font and language independently from the theme", () => {
    const next = mergeSettings(
      { ...DEFAULT_SETTINGS, theme: "dark" as const, accent: "violet" },
      { displayFont: "modern", language: "de" },
    );

    expect(next).toMatchObject({
      theme: "dark",
      accent: "violet",
      displayFont: "modern",
      language: "de",
    });
  });

  it("changes the accent without touching the theme", () => {
    const light = { ...DEFAULT_SETTINGS, theme: "light" as const, accent: "violet" };
    const next = mergeSettings(light, { accent: "rose" });

    expect(next.accent).toBe("rose");
    expect(next.theme).toBe("light");
  });

  it("changes the theme without touching the accent", () => {
    const current = { ...DEFAULT_SETTINGS, theme: "dark" as const, accent: "teal" };
    const next = mergeSettings(current, { theme: "light" as const });

    expect(next.theme).toBe("light");
    expect(next.accent).toBe("teal");
  });

  it("keeps unrelated preferences when one key changes", () => {
    const current = {
      ...DEFAULT_SETTINGS,
      theme: "light" as const,
      accent: "amber",
      dailyGoal: 75,
      answerCaseSensitive: true,
    };
    const next = mergeSettings(current, { accent: "blue" });

    expect(next).toMatchObject({
      theme: "light",
      accent: "blue",
      dailyGoal: 75,
      answerCaseSensitive: true,
    });
  });
});

describe("theme resolution", () => {
  it("keeps explicit light and dark modes regardless of the OS", () => {
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("light", false)).toBe("light");
    expect(resolveTheme("dark", true)).toBe("dark");
    expect(resolveTheme("dark", false)).toBe("dark");
  });

  it("follows the system preference in system mode", () => {
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
  });

  it("has a safe fallback outside the browser", () => {
    expect(typeof systemPrefersDark()).toBe("boolean");
  });
});
