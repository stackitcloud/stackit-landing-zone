import { expect, it } from "vitest";
import {
  confirmedServiceUserCount,
  smallestReviewedUserPlan,
} from "../apps/api/src/assistant/service-requirements.js";

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

it.each([
  [
    "Please add a central git instance for round about 80 developers to the config",
    80,
  ],
  ["Please add Git for about 80 developers.", 80],
  ["Please add Git for around 80 developers.", 80],
  ["Please add Git for approximately 80 developers.", 80],
  ["Please add Git for ~80 developers.", 80],
  ["Bitte Git für rund 80 Entwickler einrichten.", 80],
  ["Bitte Git für ca. 80 Entwickler einrichten.", 80],
  ["My answer: around 80 developers", 80],
  ["Meine Antwort: etwa 80 Nutzer", 80],
  ["Not for about 80 users.", undefined],
  ["Which plan works for about 80 users?", undefined],
  ["The label is `for about 80 users`.", undefined],
] as const)(
  "understands approximate scope without inventing affirmative evidence: %s",
  (message, expected) => {
    expect(confirmedServiceUserCount([message])).toBe(expected);
  },
);
it.each([
  [1, ["git-100", "git-10"], "git-10"],
  [10, ["git-100", "git-10"], "git-10"],
  [11, ["git-10", "git-100"], "git-100"],
  [80, ["git-10", "git-100"], "git-100"],
  [100, ["git-10", "git-100"], "git-100"],
  [101, ["git-10", "git-100"], undefined],
  [80, ["git-10"], undefined],
  [80, ["git-future"], undefined],
  [80, [], undefined],
  [0, ["git-10"], undefined],
  [1.5, ["git-10"], undefined],
] as const)(
  "fits %s users only to a returned plan with a reviewed limit",
  (count, plans, expected) => {
    expect(smallestReviewedUserPlan("gitFlavors", plans, count)).toBe(expected);
  },
);
