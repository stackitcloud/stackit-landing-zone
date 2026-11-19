import { expect, it } from "vitest";
import {
  catalogueQuestionRegion,
  configuredCatalogueRegions,
  enrichCatalogueQuestions,
} from "../apps/api/src/assistant/catalogue-guidance.js";
import {
  assistantOwnerChoices,
  validateDialogue,
} from "../apps/api/src/assistant/dialogue.js";
import {
  assistantTemplateQuestionPaths,
  enrichTemplateOwnerQuestions,
} from "../apps/api/src/assistant/template-paths.js";

const current = {
  region: "eu01",
  projectTemplates: {
    central: { kind: "corporate", settings: { region: "eu02" } },
  },
};
it("supplies scoped owner choices itself while preserving questions and rejecting unsafe question text", () => {
  const paths = assistantTemplateQuestionPaths(current);
  const identities = {
    serviceAccountEmails: ["bootstrap-platform@sa.stackit.cloud"],
    verifiedUserEmail: "user@example.test",
  };
  const questions = [
    {
      path: "projectTemplates.central.accessProfile.initialOwnerEmail",
      text: "Which initial owner?",
      options: ["foreign@example.test"],
    },
  ];
  const enriched = enrichTemplateOwnerQuestions(
    questions,
    paths,
    identities,
    "en",
  );
  expect(enriched[0]).toMatchObject({
    text: "Which initial owner?",
    multiple: false,
    options: [
      "Platform service account (bootstrap-platform@sa.stackit.cloud)",
      "Verified signed-in user (user@example.test)",
      "Provide another email address",
    ],
  });
  expect(questions[0]!.options).toEqual(["foreign@example.test"]);
  expect(
    enrichTemplateOwnerQuestions(
      [
        {
          ...questions[0]!,
          path: "projectTemplates.unknown.accessProfile.initialOwnerEmail",
        },
      ],
      paths,
      identities,
      "en",
    )[0]!.options,
  ).toEqual(["foreign@example.test"]);
  expect(() =>
    validateDialogue(
      {
        explanation: "Nothing saved.",
        questions: enrichTemplateOwnerQuestions(
          [{ ...questions[0]!, text: "Provide the admin password." }],
          paths,
          identities,
          "en",
        ),
        changes: [],
        references: ["project-templates"],
      },
      ["project-templates"],
      identities,
      paths,
    ),
  ).toThrow();
});
it("uses the native field registry for scoped template selectors and their region", () => {
  const paths = assistantTemplateQuestionPaths(current);
  const path = "projectTemplates.central.settings.git.flavor";
  expect(paths).toContain(path);
  expect(paths).toContain("projectTemplates.central.accessProfile");
  expect(paths).toContain(
    "projectTemplates.central.accessProfile.initialOwnerEmail",
  );
  expect(paths.some((value) => value.includes("other-tenant"))).toBe(false);
  expect(configuredCatalogueRegions(current)).toEqual(["eu01", "eu02"]);
  expect(catalogueQuestionRegion(path, current)).toBe("eu02");
  expect(
    catalogueQuestionRegion(
      "projectTemplates.unknown.settings.git.flavor",
      current,
    ),
  ).toBeNull();
  const dialogue = {
    explanation: "Choose a plan; nothing saved.",
    questions: [
      { path, text: "Which plan?", answerType: "catalogue" as const },
    ],
    changes: [],
    references: ["project-templates"],
  };
  expect(() =>
    validateDialogue(dialogue, ["project-templates"], undefined, paths),
  ).not.toThrow();
  expect(() =>
    validateDialogue(
      {
        ...dialogue,
        questions: [
          {
            ...dialogue.questions[0]!,
            path: "projectTemplates.unknown.settings.git.flavor",
          },
        ],
      },
      ["project-templates"],
      undefined,
      paths,
    ),
  ).toThrow();
  const presented = enrichCatalogueQuestions(
    dialogue,
    current,
    {
      regions: [
        {
          region: "eu02",
          fetchedAt: null,
          products: {
            gitFlavors: {
              status: "available",
              options: [{ value: "git-100", label: "Git100" }],
              totalOptions: 1,
              truncated: false,
            },
          },
        },
      ],
    },
    "en",
  );
  expect(presented.questions[0]?.catalogue?.region).toBe("eu02");
  expect(presented.questions[0]?.catalogue?.options[0]?.value).toBe("git-100");
});

it("binds owner identity choices to registered existing template fields", () => {
  const paths = assistantTemplateQuestionPaths(current);
  const identities = {
    serviceAccountEmails: ["bootstrap-platform@sa.stackit.cloud"],
  };
  expect(assistantOwnerChoices(identities, "en")).toEqual([
    "Platform service account (bootstrap-platform@sa.stackit.cloud)",
  ]);
  const dialogue = {
    explanation: "Choose the central initial owner; nothing saved.",
    questions: [
      {
        path: "projectTemplates.central.accessProfile.initialOwnerEmail",
        text: "Who should be the central initial owner?",
        options: [
          "Platform service account (bootstrap-platform@sa.stackit.cloud)",
        ],
      },
    ],
    changes: [],
    references: ["project-templates"],
  };
  expect(() =>
    validateDialogue(dialogue, ["project-templates"], identities, paths),
  ).not.toThrow();
  for (const question of [
    {
      ...dialogue.questions[0]!,
      path: "projectTemplates.unknown.accessProfile.initialOwnerEmail",
    },
    {
      ...dialogue.questions[0]!,
      options: ["Platform service account (foreign@sa.stackit.cloud)"],
    },
    { ...dialogue.questions[0]!, text: "Please provide the API password" },
  ])
    expect(() =>
      validateDialogue(
        { ...dialogue, questions: [question] },
        ["project-templates"],
        identities,
        paths,
      ),
    ).toThrow();
});
