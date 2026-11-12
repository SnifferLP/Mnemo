import type { AppSettings } from "./types";
import { resolveTheme } from "./settings";

/**
 * The persisted settings live in SQLite behind an async Rust command, so the
 * very first frame cannot know them. We mirror the appearance-critical values
 * into localStorage synchronously; `index.html` reads them before React mounts
 * and the provider keeps them in sync afterwards.
 */
const KEYS = {
  theme: "mnemo.theme",
  accent: "mnemo.accent",
  displayFont: "mnemo.displayFont",
  language: "mnemo.language",
  animations: "mnemo.animations",
} as const;

function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function cacheAppearance(settings: AppSettings) {
  const store = storage();
  if (!store) return;
  try {
    store.setItem(KEYS.theme, resolveTheme(settings.theme));
    store.setItem(KEYS.accent, settings.accent);
    store.setItem(KEYS.displayFont, settings.displayFont);
    store.setItem(KEYS.language, settings.language);
    // The start-up script reads this to apply the motion preference before the
    // first frame paints; motion follows this value, never the OS flag.
    store.setItem(KEYS.animations, String(settings.animations));
  } catch {
    /* A full or blocked storage must never break settings. */
  }
}

export function clearAppearanceCache() {
  const store = storage();
  if (!store) return;
  try {
    Object.values(KEYS).forEach((key) => store.removeItem(key));
  } catch {
    /* ignore */
  }
}
