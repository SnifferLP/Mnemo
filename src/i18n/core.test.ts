import { afterEach, describe, expect, it } from "vitest";

import { setActiveLanguage, t, translate, tp } from "./core";

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

  it("interpolates values into translated text", () => {
    expect(translate("de", "Loaded {count} models", { count: 3 })).toBe("3 Modelle geladen");
    expect(translate("de", "{percent}% mastered", { percent: 80 })).toBe("80 % beherrscht");
    expect(
      translate("de", 'Remove the provider "{name}"? The stored API key is deleted.', {
        name: "OpenAI",
      }),
    ).toBe("„OpenAI“ entfernen? Der gespeicherte API-Schlüssel wird gelöscht.");
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
