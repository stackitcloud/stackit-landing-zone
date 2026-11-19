import { expect, it } from "vitest";
import {
  evaluateCatalogueRequirements,
  unavailableCatalogueChoices,
} from "../apps/api/src/assistant/decision-support.js";

const evidence = { turn: 0, quote: "80 developers" };
it("excludes Git10 for 80 developers and identifies Git100 from reviewed limits", () => {
  expect(
    evaluateCatalogueRequirements(
      "gitFlavors",
      [
        { value: "git-10", label: "Git10", description: "", facts: [] },
        { value: "git-100", label: "Git100", description: "", facts: [] },
      ],
      [{ metric: "users", minimum: 80, evidence }],
    ),
  ).toEqual({
    eligible: ["git-100"],
    excluded: [
      {
        value: "git-10",
        reasons: [{ metric: "users", required: 80, maximum: 10 }],
      },
    ],
    unknown: [],
    recommendation: "git-100",
  });
});
it("uses the same constraint evaluator for VM and VPN facts, without product dialogue handlers", () => {
  const options = [
    {
      value: "small",
      label: "Small",
      description: "",
      facts: [
        { key: "vCPU" as const, value: 2 },
        { key: "bandwidthMbps" as const, value: 100 },
      ],
    },
    {
      value: "large",
      label: "Large",
      description: "",
      facts: [
        { key: "vCPU" as const, value: 8 },
        { key: "bandwidthMbps" as const, value: 1000 },
      ],
    },
  ];
  expect(
    evaluateCatalogueRequirements("machineTypes", options, [
      { metric: "vCPU", minimum: 4, evidence },
    ]).recommendation,
  ).toBe("large");
  expect(
    evaluateCatalogueRequirements("vpnPlans", options, [
      { metric: "bandwidthMbps", minimum: 500, evidence },
    ]).recommendation,
  ).toBe("large");
});
it("does not mistake an unknown characteristic for enough capacity", () => {
  const result = evaluateCatalogueRequirements(
    "gitFlavors",
    [
      { value: "git-100", label: "Git100", description: "", facts: [] },
      { value: "future", label: "Future", description: "", facts: [] },
    ],
    [{ metric: "users", minimum: 80, evidence }],
  );
  expect(result.eligible).toEqual(["git-100"]);
  expect(result.unknown).toEqual(["future"]);
  expect(result.recommendation).toBeNull();
});
it("does not invent a single suitable plan when none or several fit", () => {
  const options = [
    { value: "git-10", label: "Git10", description: "", facts: [] },
    { value: "git-100", label: "Git100", description: "", facts: [] },
  ];
  expect(
    evaluateCatalogueRequirements("gitFlavors", options, [
      { metric: "users", minimum: 150, evidence },
    ]).eligible,
  ).toEqual([]);
  expect(
    evaluateCatalogueRequirements("gitFlavors", options, [
      { metric: "users", minimum: 8, evidence },
    ]).recommendation,
  ).toBeNull();
});

it("rejects a new offering absent from a complete project catalogue while retaining unchanged selections", () => {
  const products = {
    gitFlavors: {
      status: "available" as const,
      options: [{ value: "git-10", label: "Git10" }],
      totalOptions: 1,
      truncated: false,
    },
  };
  const catalogues = {
    regions: [{ region: "eu01" as const, fetchedAt: null, products }],
  };
  expect(
    unavailableCatalogueChoices(
      { region: "eu01", devops: null },
      { region: "eu01", devops: { git_flavor: "git-100" } },
      catalogues,
    ),
  ).toMatchObject([
    { path: "devops.git_flavor", value: "git-100", available: ["git-10"] },
  ]);
  expect(
    unavailableCatalogueChoices(
      { region: "eu01", devops: { git_flavor: "git-100" } },
      { region: "eu01", devops: { git_flavor: "git-100" } },
      catalogues,
    ),
  ).toEqual([]);
  expect(
    unavailableCatalogueChoices(
      {},
      { devops: { git_flavor: "git-100" } },
      { regions: [] },
    ),
  ).toEqual([]);
  expect(
    unavailableCatalogueChoices(
      {},
      { devops: { git_flavor: "git-100" } },
      {
        regions: [
          {
            ...catalogues.regions[0]!,
            products: {
              gitFlavors: { ...products.gitFlavors, truncated: true },
            },
          },
        ],
      },
    ),
  ).toEqual([]);
});
