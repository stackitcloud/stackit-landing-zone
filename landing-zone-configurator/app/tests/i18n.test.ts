import { afterEach, describe, expect, it } from "vitest";
import {
  formatMessage,
  preferredLanguage,
  setLanguage,
  t,
} from "../apps/web/src/i18n";
import { englishMessages } from "../apps/web/src/locales/en";

afterEach(async () => {
  await setLanguage("en");
});

describe("interface language", () => {
  it("uses the first supported browser language with English fallback", () => {
    expect(preferredLanguage(["de-CH", "en-US"])).toBe("de");
    expect(preferredLanguage(["EN-gb", "de"])).toBe("en");
    expect(preferredLanguage(["fr-FR", "de-DE"])).toBe("de");
    expect(preferredLanguage(["fr-FR"])).toBe("en");
    expect(preferredLanguage([])).toBe("en");
  });

  it("honors only supported explicit language preferences", () => {
    expect(preferredLanguage(["en-US"], "de")).toBe("de");
    expect(preferredLanguage(["de-DE"], "en")).toBe("en");
    expect(preferredLanguage(["de-DE"], "fr")).toBe("de");
    expect(preferredLanguage(["de-DE"], "__proto__")).toBe("de");
  });

  it("keeps unknown data values and interpolation-looking data intact", () => {
    const data = '{"name":"{{value0}}","status":"planned"}';
    expect(t(data)).toBe(data);
    expect(t("__proto__")).toBe("__proto__");
    expect(t(42)).toBe(42);
    expect(t(null)).toBeNull();
    expect(t(undefined)).toBeUndefined();
  });

  it("changes interface messages without translating interpolated names", async () => {
    await setLanguage("en");
    expect(t("Vorbereitung")).toBe("Preparation");
    expect(
      t("Konfiguration öffnen: {{value0}}", {
        value0: "Meine Plattform <test>",
      }),
    ).toBe("Open configuration: Meine Plattform <test>");
    await setLanguage("de");
    expect(t("Vorbereitung")).toBe("Vorbereitung");
    expect(
      t("Konfiguration öffnen: {{value0}}", {
        value0: "Meine Plattform <test>",
      }),
    ).toBe("Konfiguration öffnen: Meine Plattform <test>");
  });

  it("provides nonempty English messages with matching interpolation placeholders", () => {
    for (const [source, translation] of Object.entries(englishMessages)) {
      expect(translation.trim(), source).not.toBe("");
      expect(translation.match(/\{\{\w+\}\}/g)?.sort() ?? [], source).toEqual(
        source.match(/\{\{\w+\}\}/g)?.sort() ?? [],
      );
    }
  });

  it("rerenders stored dynamic notices in the selected language without changing user data", async () => {
    const source =
      "{{value0}} · Version {{value1}} veröffentlicht. Cloud-Ausführung bleibt gesperrt.";
    const values = { value0: "Vorbereitung <test> {{value1}}", value1: 2 };
    const message = formatMessage(source, values);
    await setLanguage("en");
    expect(t(message)).toBe(
      "Vorbereitung <test> {{value1}} · Version 2 published. Cloud execution remains blocked.",
    );
    await setLanguage("de");
    expect(t(message)).toBe(
      "Vorbereitung <test> {{value1}} · Version 2 veröffentlicht. Cloud-Ausführung bleibt gesperrt.",
    );
    const data = { message: source, values };
    expect(t(data)).toBe(data);
  });
});
