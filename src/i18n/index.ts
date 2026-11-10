import { useMemo } from "react";

import { useSettings } from "@/context/SettingsContext";
import type { Language } from "@/lib/types";
import { getLocale, setActiveLanguage, translate, tp } from "./core";

export { translate, getLocale } from "./core";

export function useI18n() {
  const { settings } = useSettings();
  const language = settings.language;

  // Keep non-React formatters (dates, durations, chart labels) on the same
  // locale as the active interface. This runs before children render.
  setActiveLanguage(language);

  return useMemo(() => {
    const locale = getLocale(language);
    return {
      language,
      locale,
      t: (text: string, vars?: Record<string, string | number>) =>
        translate(language, text, vars),
      tp: (count: number, one: string, many: string, vars?: Record<string, string | number>) =>
        tp(count, one, many, vars),
    };
  }, [language]);
}

export type { Language };
