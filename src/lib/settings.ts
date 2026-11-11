import type { AppSettings } from "./types";

export const DEFAULT_SETTINGS: AppSettings = {
  theme: "system",
  accent: "blue",
  displayFont: "editorial",
  language: "en",
  displayName: "",
  dailyGoal: 30,
  dailyGoalMinutes: 20,
  newCardsPerSession: 20,
  answerCaseSensitive: false,
  answerTolerance: 1,
  aiGradingEnabled: false,
  defaultProviderId: null,
  aiShareSet: true,
  aiShareGaps: true,
  aiShareHistory: true,
  aiCardBatch: 12,
  sidebarCollapsed: false,
  shuffleCards: false,
  animations: true,
  updateChannel: "stable",
};

/**
 * Merges a patch into the current settings.
 *
 * The previous implementation computed this inside a state updater, so the save
 * request could still carry the defaults. Keeping the merge pure and applying
 * it to the latest known settings means an accent change can never reset the
 * theme (or any other preference).
 */
export function mergeSettings(
  current: AppSettings,
  patch: Partial<AppSettings>,
): AppSettings {
  return { ...current, ...patch };
}

export function systemPrefersDark(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return true;
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function resolveTheme(
  theme: AppSettings["theme"],
  prefersDark = systemPrefersDark(),
): "dark" | "light" {
  if (theme === "system") return prefersDark ? "dark" : "light";
  return theme === "light" ? "light" : "dark";
}
