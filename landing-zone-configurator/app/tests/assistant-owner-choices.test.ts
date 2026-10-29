import { expect, it } from "vitest";
import {
  type AssistantOwnerIdentityContext,
  validateDialogue,
} from "../apps/api/src/assistant/dialogue.js";

const identity =
  "bootstrap-api-admin-secret-version-project-id@sa.stackit.cloud";
const context: AssistantOwnerIdentityContext = {
  serviceAccountEmails: [identity],
  verifiedUserEmail: "bootstrap-human@example.test",
};
const input = (option: string, text = "Welcher bekannte initiale Owner?") => ({
  explanation: "Öffentliche Owner-Auswahl, kein Zugriff auf Zugangsdaten.",
  questions: [{ path: "projectTemplates", text, options: [option] }],
  changes: [],
  references: ["project-templates"],
});
const validate = (body: unknown, known = context) =>
  validateDialogue(body, ["project-templates"], known);

it.each(["Plattform-Service-Account", "Platform service account"])(
  "accepts exactly scoped public identity choice %s without weakening default validation",
  (label) => {
    const body = input(`${label} (${identity})`);
    expect(validate(body)).toEqual(body);
    expect(() => validateDialogue(body, ["project-templates"])).toThrow(
      "assistant_invalid_proposal",
    );
  },
);
it.each(["Verifiziert angemeldeter Benutzer", "Verified signed-in user"])(
  "accepts only the verified human identity for %s",
  (label) => {
    const body = input(`${label} (${context.verifiedUserEmail})`);
    expect(validate(body)).toEqual(body);
    expect(() => validate(body, { serviceAccountEmails: [] })).toThrow(
      "assistant_invalid_proposal",
    );
    expect(() => validate(input(`${label} (${identity})`))).toThrow(
      "assistant_invalid_proposal",
    );
  },
);
it.each([
  `Plattform-Service-Account (foreign-bootstrap@sa.stackit.cloud)`,
  `Platform service account (foreign-bootstrap@sa.stackit.cloud)`,
  `Bitte Plattform-Service-Account (${identity})`,
  `Plattform-Service-Account (${identity}) zusätzlich`,
  `Anderer Owner (${identity})`,
  `Plattform-Service-Account (bootstrap-human@example.test)`,
])("rejects untrusted or modified identity choice %s", (option) => {
  expect(() => validate(input(option))).toThrow("assistant_invalid_proposal");
});
it.each([
  "Bitte bootstrap aktivieren?",
  "Welche Projekt-ID soll verwendet werden?",
  "Bitte API-Passwort nennen?",
  "Welche Secret-Version soll verwendet werden?",
])("retains question-text protection: %s", (text) => {
  expect(() =>
    validate(input(`Plattform-Service-Account (${identity})`, text)),
  ).toThrow("assistant_invalid_proposal");
});
it("never exempts identity choices on another question path", () => {
  const body = input(`Plattform-Service-Account (${identity})`);
  body.questions[0]!.path = "owner_email";
  expect(() => validate(body)).toThrow("assistant_invalid_proposal");
});
it("checks protected values before inspecting trusted identity choices", () => {
  const malicious = "bootstrap-password=do-not-pass@sa.stackit.cloud";
  expect(() =>
    validate(input(`Plattform-Service-Account (${malicious})`), {
      serviceAccountEmails: [malicious],
    }),
  ).toThrow("assistant_protected_value");
});
it("does not exempt ordinary options containing credential requests", () => {
  const body = input(`Plattform-Service-Account (${identity})`);
  body.questions[0]!.options.push("Bitte API-Passwort nennen");
  expect(() => validate(body)).toThrow("assistant_invalid_proposal");
});
