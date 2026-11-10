import { afterEach, describe, expect, it } from "vitest";

import { setActiveLanguage, t, translate, tp } from "./core";

afterEach(() => setActiveLanguage("en"));

describe("translation catalogue", () => {
  it("translates interface text into German", () => {
    expect(translate("de", "Change settings")).toBe("Einstellungen ändern");
    expect(translate("de", "Loading assistant")).toBe("Assistent wird geladen");
    expect(translate("de", "Leave session")).toBe("Sitzung verlassen");
    expect(translate("de", "Card image")).toBe("Kartenbild");
  });

  it("interpolates values into translated text", () => {
    expect(translate("de", "Loaded {count} models", { count: 3 })).toBe("3 Modelle geladen");
  });

  it("falls back to the English source for unknown keys", () => {
    expect(translate("de", "A phrase that is not in the catalogue")).toBe(
      "A phrase that is not in the catalogue",
    );
  });

  it("pluralises with the active language", () => {
    setActiveLanguage("de");
    expect(tp(1, "1 set", "{count} sets")).toBe("1 Set");
    expect(tp(3, "1 set", "{count} sets")).toBe("3 Lernsets");
    expect(t("Settings")).toBe("Einstellungen");
  });
});
