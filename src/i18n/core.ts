import type { Language } from "@/lib/types";
import { de } from "./messages/de";

export const LOCALES: Record<Language, string> = {
  en: "en-US",
  de: "de-DE",
};

let activeLanguage: Language = "en";

export function setActiveLanguage(language: Language | string | undefined) {
  activeLanguage = language === "de" ? "de" : "en";
}

export function getActiveLanguage(): Language {
  return activeLanguage;
}

export function getLocale(language: Language = activeLanguage): string {
  return LOCALES[language] ?? LOCALES.en;
}

function interpolate(template: string, vars?: Record<string, string | number>) {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    vars[key] === undefined ? match : String(vars[key]),
  );
}

export function translate(
  language: Language | string | undefined,
  text: string,
  vars?: Record<string, string | number>,
) {
  const lang: Language = language === "de" ? "de" : "en";
  const template = lang === "de" ? (de[text] ?? text) : text;
  return interpolate(template, vars);
}

export function t(text: string, vars?: Record<string, string | number>) {
  return translate(activeLanguage, text, vars);
}

export function tp(
  count: number,
  one: string,
  many: string,
  vars?: Record<string, string | number>,
) {
  return t(count === 1 ? one : many, { count, ...vars });
}
