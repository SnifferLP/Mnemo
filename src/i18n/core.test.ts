import { afterEach, describe, expect, it } from "vitest";

import { setActiveLanguage, t, translate, tp } from "./core";
import { de } from "./messages/de";

afterEach(() => setActiveLanguage("en"));

describe("translation catalogue", () => {
  it("translates interface text into German", () => {
    expect(translate("de", "Change settings")).toBe("Einstellungen ändern");
    expect(translate("de", "Loading assistant")).toBe("Assistent wird geladen");
    expect(translate("de", "Leave session")).toBe("Sitzung verlassen");
    expect(translate("de", "Card image")).toBe("Kartenbild");
    expect(translate("de", "Play")).toBe("Abspielen");
    expect(translate("de", "Archive")).toBe("Archiv");
    expect(translate("de", "Restore")).toBe("Wiederherstellen");
    expect(translate("de", "Document removed")).toBe("Dokument entfernt");
    expect(translate("de", "Stable Releases")).toBe("Stabile Versionen");
    expect(translate("de", "Pre-Releases")).toBe("Vorabversionen");
  });

  it("uses consistent flashcard terminology", () => {
    expect(translate("de", "Study Sets")).toBe("Lernsets");
    expect(translate("de", "Spaced repetition")).toBe("Intervallwiederholung");
    expect(translate("de", "Mastered")).toBe("Beherrscht");
    expect(translate("de", "Still learning")).toBe("Noch am Lernen");
    expect(translate("de", "I knew it")).toBe("Gewusst");
  });

  it("uses the current German dashboard wording", () => {
    expect(translate("de", "Ready to review")).toBe("Fällig");
    expect(translate("de", "Accuracy")).toBe("Genauigkeit");
    expect(translate("de", "Accuracy · 7d")).toBe("Genauigkeit · 7 T.");
    expect(translate("de", "{percent} session accuracy", { percent: 90 })).toBe(
      "90 Genauigkeit in dieser Sitzung",
    );
    expect(translate("de", "Sets with cards waiting for review")).toBe("Anstehende Lernsets:");
    expect(translate("de", "Today counts.")).toBe("Für heute erledigt!");
    expect(
      translate("de", "1 card is ready for review. A short session keeps the archive alive."),
    ).toBe("1 Karte wartet auf dich. Bereit für eine kurze Runde?");
    expect(
      translate("de", "{count} cards are ready for review. A short session keeps the archive alive.", {
        count: 12,
      }),
    ).toBe("12 Karten warten auf dich. Bereit für eine kurze Runde?");
  });

  it("interpolates values into translated text", () => {
    expect(translate("de", "Loaded {count} models", { count: 3 })).toBe("3 Modelle geladen");
    expect(translate("de", "{percent}% mastered", { percent: 80 })).toBe("80 % beherrscht");
    expect(
      translate("de", 'Remove the provider "{name}"? The stored API key is deleted.', {
        name: "OpenAI",
      }),
    ).toBe("„OpenAI“ entfernen? Der gespeicherte API-Schlüssel wird gelöscht.");
  });

  it("uses KI terminology instead of Tutor", () => {
    expect(translate("de", "Ask AI")).toBe("KI fragen");
    expect(translate("de", "AI assistant:")).toBe("KI-Assistenz:");
    expect(translate("de", "The AI assistant could not answer")).toBe(
      "Die KI-Assistenz konnte nicht antworten",
    );
    expect(translate("de", "AI assistant")).toBe("KI-Assistenz");

    // Neither the English catalogue keys nor the German values may reintroduce
    // the old wording on any screen.
    const tutorKeys = Object.keys(de).filter((key) => /tutor/i.test(key));
    const tutorValues = Object.entries(de).filter(([, value]) => /tutor/i.test(value));
    expect(tutorKeys).toEqual([]);
    expect(tutorValues).toEqual([]);
  });

  it("falls back to the English source for unknown keys", () => {
    expect(translate("de", "A phrase that is not in the catalogue")).toBe(
      "A phrase that is not in the catalogue",
    );
  });

  it("pluralises with the active language", () => {
    setActiveLanguage("de");
    expect(tp(1, "1 set", "{count} sets")).toBe("1 Lernset");
    expect(tp(3, "1 set", "{count} sets")).toBe("3 Lernsets");
    expect(t("Settings")).toBe("Einstellungen");
  });
});
