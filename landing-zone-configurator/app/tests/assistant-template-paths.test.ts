import { expect, it } from "vitest";
import {
  catalogueQuestionRegion,
  configuredCatalogueRegions,
  enrichCatalogueQuestions,
} from "../apps/api/src/assistant/catalogue-guidance.js";
import { validateDialogue } from "../apps/api/src/assistant/dialogue.js";
import { assistantTemplateQuestionPaths } from "../apps/api/src/assistant/template-paths.js";

const current = {
  region: "eu01",
  projectTemplates: {
    central: { kind: "corporate", settings: { region: "eu02" } },
  },
};
it("uses the native field registry for scoped template selectors and their region", () => {
  const paths = assistantTemplateQuestionPaths(current);
  const path = "projectTemplates.central.settings.git.flavor";
  expect(paths).toContain(path);
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
