import { expect, it } from "vitest";
import { confirmedServiceUserCount } from "../apps/api/src/assistant/service-requirements.js";

it.each([
  ["Please add Git for all our 150 developers. Do not deploy.", 150],
  [
    "Bitte Git für unsere 150 Entwickler vorbereiten, noch nicht deployen.",
    150,
  ],
  ["Limit the instance to 80 users.", 80],
  ["Bitte auf 80 Nutzer begrenzen.", 80],
  ["Begrenze die Instanz auf 80 Nutzer.", 80],
  ["Which plan works for 150 users?", undefined],
  ["Use git-100.", undefined],
  ["My answer: for 150 developers.", 150],
  ["Not for 150 users.", undefined],
  ['The assistant said "for 150 users".', undefined],
] as const)(
  "reads only literal affirmative workload evidence: %s",
  (message, expected) => {
    expect(confirmedServiceUserCount([message])).toBe(expected);
  },
);
it("retains a count through access replies and accepts a later explicit scope change", () => {
  expect(
    confirmedServiceUserCount([
      "Please add Git for 150 developers.",
      "Allow only 203.0.113.0/24.",
    ]),
  ).toBe(150);
  expect(
    confirmedServiceUserCount([
      "Please add Git for 150 developers.",
      "Reduce this instance to 80 users.",
    ]),
  ).toBe(80);
});
