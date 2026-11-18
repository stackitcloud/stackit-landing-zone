import { expect, it } from "vitest";
import { resolveAssistantLanguage } from "../apps/api/src/assistant/language.js";

it("uses the current business question rather than German assistant history", () => {
  expect(
    resolveAssistantLanguage(
      undefined,
      [{ role: "assistant", content: "Welche Einstellungen möchtest du?" }],
      "Which settings should our company use?",
    ),
  ).toBe("en");
  expect(
    resolveAssistantLanguage(
      undefined,
      [{ role: "user", content: "Please configure Git." }],
      "Welche Einstellungen sind möglich?",
    ),
  ).toBe("de");
});

it("retains user language for numeric replies and separates quoted questions", () => {
  expect(
    resolveAssistantLanguage(
      undefined,
      [{ role: "user", content: "How many users can we support?" }],
      "250",
    ),
  ).toBe("en");
  expect(
    resolveAssistantLanguage(
      undefined,
      [],
      "Welche Größe? My answer: please use the company standard",
    ),
  ).toBe("en");
  expect(
    resolveAssistantLanguage("en", [], "Bitte auf Deutsch antworten."),
  ).toBe("en");
});
