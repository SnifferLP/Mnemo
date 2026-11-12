import { describe, expect, it } from "vitest";

import {
  DEFAULT_SETTINGS,
  mergeSettings,
  resolveTheme,
  systemPrefersDark,
} from "./settings";

describe("settings merging", () => {
  it("defaults to the modern sans, English and stable updates", () => {
    expect(DEFAULT_SETTINGS.displayFont).toBe("modern");
    expect(DEFAULT_SETTINGS.monocraftUnlocked).toBe(false);
    expect(DEFAULT_SETTINGS.language).toBe("en");
    expect(DEFAULT_SETTINGS.updateChannel).toBe("stable");
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

  it("keeps automatic update checks enabled by default", () => {
    expect(DEFAULT_SETTINGS.autoUpdateCheck).toBe(true);

    // A stored settings object from an older version has no such key; merging
    // an unrelated patch must not turn automatic checks off.
    const previous = { ...DEFAULT_SETTINGS, theme: "light" as const };
    const next = mergeSettings(previous, { accent: "teal" });
    expect(next.autoUpdateCheck).toBe(true);
  });

  it("stores the automatic update preference independently", () => {
    const off = mergeSettings(DEFAULT_SETTINGS, { autoUpdateCheck: false });
    expect(off.autoUpdateCheck).toBe(false);
    expect(off.updateChannel).toBe("stable");

    const channelOnly = mergeSettings(off, { updateChannel: "prerelease" });
    expect(channelOnly.autoUpdateCheck).toBe(false);
    expect(channelOnly.updateChannel).toBe("prerelease");
  });

  it("changes the update channel without touching other preferences", () => {
    const next = mergeSettings(
      { ...DEFAULT_SETTINGS, theme: "dark" as const, dailyGoal: 75 },
      { updateChannel: "prerelease" },
    );

    expect(next.updateChannel).toBe("prerelease");
    expect(next.theme).toBe("dark");
    expect(next.dailyGoal).toBe(75);
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
