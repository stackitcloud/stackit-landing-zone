import {
  catalogueChoiceMatches,
  catalogueField,
  cloudCatalogueFields,
} from "@lzc/contracts";
import { expect, it } from "vitest";
import {
  configuredCatalogueRegions,
  emptyDraftResponse,
  englishNativeOverview,
  enrichCatalogueQuestions,
  ensureDraftNotice,
  groundCatalogueDialogue,
  resolveAssistantLanguage,
  withoutCataloguePresentation,
} from "../apps/api/src/assistant/catalogue-guidance.js";
import {
  assistantQuestionFields,
  type Dialogue,
  validateDialogue,
} from "../apps/api/src/assistant/dialogue.js";
import { buildAssistantKnowledge } from "../apps/api/src/assistant/knowledge.js";
import type { AssistantCatalogueContext } from "../apps/api/src/assistant/model-serving.js";

const bindings = [
  ["landing_zones[*].custom_roles[*].permissions[*]", "projectPermissions"],
  ["landing_zones[*].role_assignments[*].role", "projectRoles"],
  ["devops.git_flavor", "gitFlavors"],
  ["git.flavor", "gitFlavors"],
  ["landing_zones[*].git.flavor", "gitFlavors"],
  ["connectivity.vpn.plan_id", "vpnPlans"],
  [
    "platform_kubernetes[*].cluster.kubernetes_version_min",
    "kubernetesVersions",
  ],
  ["platform_kubernetes[*].cluster.node_pools[*].machine_type", "machineTypes"],
  ["platform_kubernetes[*].cluster.node_pools[*].os_name", "machineImages"],
  [
    "platform_kubernetes[*].cluster.node_pools[*].availability_zones[*]",
    "availabilityZones",
  ],
  ["platform_kubernetes[*].cluster.node_pools[*].volume_type", "volumeTypes"],
  ["observability.plan_name", "observabilityPlans"],
  ["platform_kubernetes[*].debug_bastion.machine_type", "bastionMachineTypes"],
  ["platform_kubernetes[*].debug_bastion.image_id", "bastionImages"],
  [
    "platform_kubernetes[*].debug_bastion.availability_zone",
    "bastionAvailabilityZones",
  ],
  ["connectivity.firewalls[*].flavor", "bastionMachineTypes"],
  [
    "connectivity_regions[*].firewalls[*].ha.backup_zone",
    "bastionAvailabilityZones",
  ],
] as const;
function dialogue(path: string): Dialogue {
  return {
    explanation: "Choose a starting point",
    questions: [
      {
        path,
        answerType: "catalogue",
        text: "Which option fits your needs?",
        options: ["Candidate plan-a", "Help me estimate my needs"],
      },
    ],
    changes: [],
    references: ["configuration-contract"],
  };
}
function context(field: string): AssistantCatalogueContext {
  return {
    regions: [
      {
        region: "eu01",
        fetchedAt: "2026-11-18T00:00:00Z",
        products: {
          [field]: {
            status: "available",
            options: [
              { value: "plan-a", label: "Plan A" },
              { value: "plan-b", label: "Plan B" },
            ],
            totalOptions: 2,
            truncated: false,
          },
        },
      },
    ],
  };
}

it.each(bindings)(
  "uses the same project-catalogue picker for %s",
  (path, field) => {
    expect(catalogueField(path)).toBe(field);
    const before = dialogue(path);
    const enriched = enrichCatalogueQuestions(
      before,
      { region: "eu01" },
      context(field),
      "en",
    );
    expect(enriched.questions[0]?.catalogue).toMatchObject({
      source: "project-catalogue",
      status: "available",
      region: "eu01",
      suggestedValues: ["plan-a"],
      options: [
        { value: "plan-a", label: "Plan A", facts: [] },
        { value: "plan-b", label: "Plan B", facts: [] },
      ],
    });
    expect(enriched.changes).toEqual([]);
    expect(withoutCataloguePresentation(enriched)).toEqual(before);
  },
);

it("does not confuse unavailable, empty, truncated or ambiguous-region catalogues", () => {
  const input = context("machineTypes");
  const path = "platform_kubernetes[*].cluster.node_pools[*].machine_type";
  expect(
    enrichCatalogueQuestions(
      dialogue(path),
      {
        platform_kubernetes: {
          eu01: { region: "eu01" },
          eu02: { region: "eu02" },
        },
      },
      input,
      "en",
    ).questions[0],
  ).not.toHaveProperty("catalogue");
  expect(
    enrichCatalogueQuestions(dialogue(path), { region: "eu02" }, input, "en")
      .questions[0],
  ).not.toHaveProperty("catalogue");
  expect(
    enrichCatalogueQuestions(
      dialogue(path),
      {
        region: "eu01",
        platform_kubernetes: { central: { region: "unknown" } },
      },
      input,
      "en",
    ).questions[0],
  ).not.toHaveProperty("catalogue");
  input.regions[0]!.products.machineTypes = {
    status: "unavailable",
    options: [],
    totalOptions: 0,
    truncated: false,
  };
  expect(
    enrichCatalogueQuestions(dialogue(path), {}, input, "en").questions[0]
      ?.catalogue,
  ).toMatchObject({ status: "unavailable", options: [] });
  input.regions[0]!.products.machineTypes = {
    status: "available",
    options: [],
    totalOptions: 0,
    truncated: false,
  };
  expect(
    enrichCatalogueQuestions(dialogue(path), {}, input, "en").questions[0]
      ?.catalogue,
  ).toMatchObject({ status: "available", options: [] });
  input.regions[0]!.products.machineTypes = {
    status: "available",
    options: [{ value: "small", label: "Small" }],
    totalOptions: 120,
    truncated: true,
  };
  expect(
    enrichCatalogueQuestions(dialogue(path), {}, input, "en").questions[0]
      ?.catalogue,
  ).toMatchObject({ totalOptions: 120, truncated: true });
});

it("joins facts only to an offered plan in the same region/product and omits conflicting facts or unknown RAM units", () => {
  const input = context("vpnPlans");
  const sku = {
    id: "article-a",
    productName: "VPN",
    title: "VPN A",
    region: "eu01",
    deprecated: "false",
    maturityModelState: null,
    version: "1",
    productSpecificAttributes: {
      discriminator: "Network",
      planId: "plan-a",
      maxBandWidth: 1000,
      maxConnections: 100,
      ram: 8,
    },
  };
  input.regions[0]!.pim = {
    status: "available",
    source: "https://pim.api.stackit.cloud/v2",
    fetchedAt: null,
    products: [],
    skus: [
      sku,
      {
        ...sku,
        id: "other-region",
        region: "eu02",
        productSpecificAttributes: {
          ...sku.productSpecificAttributes,
          maxBandWidth: 9000,
        },
      },
      {
        ...sku,
        id: "other-product",
        productName: "Git",
        productSpecificAttributes: {
          ...sku.productSpecificAttributes,
          maxBandWidth: 9000,
        },
      },
    ],
    totalSkus: 3,
    truncated: false,
  };
  const result = enrichCatalogueQuestions(
    dialogue("connectivity.vpn.plan_id"),
    {},
    input,
    "en",
  );
  expect(result.questions[0]?.catalogue?.options[0]?.facts).toEqual([
    { key: "bandwidthMbps", value: 1000 },
    { key: "maxConnections", value: 100 },
  ]);
  expect(result.questions[0]?.catalogue?.options[1]?.facts).toEqual([]);
  input.regions[0]!.pim.skus.push({
    ...sku,
    id: "conflict",
    productSpecificAttributes: {
      ...sku.productSpecificAttributes,
      maxBandWidth: 2000,
    },
  });
  expect(
    enrichCatalogueQuestions(
      dialogue("connectivity.vpn.plan_id"),
      {},
      input,
      "en",
    ).questions[0]?.catalogue?.options[0]?.facts,
  ).toEqual([{ key: "maxConnections", value: 100 }]);
});

it("allows catalogue-backed product selectors without allowing project/tenant/credential ID questions", () => {
  expect(
    assistantQuestionFields().some(
      (field) => field.path === "connectivity.vpn.plan_id",
    ),
  ).toBe(true);
  expect(
    assistantQuestionFields().some(
      (field) => field.path === "platform_service_account_id",
    ),
  ).toBe(false);
  const knowledge = buildAssistantKnowledge();
  expect(() =>
    validateDialogue(
      dialogue("connectivity.vpn.plan_id"),
      knowledge.rules.map((rule) => rule.id),
    ),
  ).not.toThrow();
  expect(() =>
    validateDialogue(
      dialogue("project_id"),
      knowledge.rules.map((rule) => rule.id),
    ),
  ).toThrow();
  expect(() =>
    validateDialogue(
      {
        ...dialogue("devops.git_flavor"),
        questions: [
          {
            ...dialogue("devops.git_flavor").questions[0],
            catalogue: { options: [{ value: "fabricated" }] },
          },
        ],
      },
      knowledge.rules.map((rule) => rule.id),
    ),
  ).toThrow();
});

it("bounds presentation independently of model context and reports truncation", () => {
  const input = context("machineTypes");
  input.regions[0]!.products.machineTypes = {
    status: "available",
    options: Array.from({ length: 2000 }, (_, i) => ({
      value: `size-${i}`,
      label: `Machine ${i} ${"x".repeat(200)}`,
    })),
    totalOptions: 2000,
    truncated: false,
  };
  const original = dialogue(
    "platform_kubernetes[*].cluster.node_pools[*].machine_type",
  );
  original.questions = Array.from({ length: 8 }, () => original.questions[0]!);
  const result = enrichCatalogueQuestions(original, {}, input, "en");
  expect(
    result.questions.every((question) => question.catalogue?.truncated),
  ).toBe(true);
  expect(Buffer.byteLength(JSON.stringify(result))).toBeLessThan(210000);
  expect(result.questions[0]?.catalogue?.totalOptions).toBe(2000);
});

it("renders pending catalogue decisions from product data instead of unsupported model performance claims", () => {
  const original = dialogue(
    "platform_kubernetes[*].cluster.node_pools[*].machine_type",
  );
  original.explanation =
    "Machine plan-a has 16 GB RAM and guarantees 10 Gbit/s.";
  original.questions[0]!.text = "Should we use 16 GB RAM and 10 Gbit/s?";
  const result = groundCatalogueDialogue(
    original,
    {},
    context("machineTypes"),
    "en",
  );
  expect(result.changes).toEqual([]);
  expect(JSON.stringify(result)).not.toMatch(/16 GB|10 Gbit/);
  expect(result.explanation).toContain("Nothing has been saved");
  expect(result.questions[0]?.options).toContain("Plan A (plan-a)");
});

it("uses reviewed English service facts for every English native overview", () => {
  const knowledge = buildAssistantKnowledge();
  for (const topic of knowledge.topics) {
    const result = englishNativeOverview({
      ...topic,
      text: knowledge.rules.find((rule) => rule.id === topic.id)?.text ?? "",
    });
    expect(result.length).toBeLessThanOrEqual(3000);
    for (const input of topic.inputs) expect(result).toContain(input);
    expect(result).not.toMatch(/Native Felder|Noch nichts|Welche Angaben/);
  }
});

it("does not confuse similarly prefixed flavors in conversational subsets", () => {
  expect(
    catalogueChoiceMatches("Git100 — recommended", {
      value: "git-10",
      label: "Git10",
    }),
  ).toBe(false);
  expect(
    catalogueChoiceMatches("Git100 — recommended", {
      value: "git-100",
      label: "Git100",
    }),
  ).toBe(true);
  expect(
    catalogueChoiceMatches("Use g1.20", { value: "g1.2", label: "g1.2" }),
  ).toBe(false);
});

it("supplies one explicit unsaved notice for questions and proposals across services", () => {
  const original = dialogue("company_name");
  const result = ensureDraftNotice(original, "en");
  expect(result.explanation).toContain("Nothing has been saved.");
  expect(result.questions).toEqual(original.questions);
  expect(ensureDraftNotice(result, "en")).toEqual(result);
});

it("bounds the real model request separately from picker data and withholds ungrounded provisional prose", async () => {
  // Historical controller comparison; the shared runtime is qualified in assistant-consultation.test.ts.
  const { LegacyAssistantModelServing: AssistantModelServing } = await import(
    "../apps/api/src/assistant/model-serving.js"
  );
  const { createCommonConfiguration } = await import("@lzc/domain");
  const { assistantPublicValues } = await import(
    "../apps/api/src/assistant/service.js"
  );
  const knowledge = buildAssistantKnowledge();
  const input = context("machineTypes");
  input.regions[0]!.products.machineTypes = {
    status: "available",
    totalOptions: 80,
    truncated: false,
    options: Array.from({ length: 80 }, (_, i) => ({
      value: `vm-${i}`,
      label: `Machine ${i}`,
    })),
  };
  input.regions[0]!.products.projectPermissions = {
    status: "available",
    totalOptions: 1,
    truncated: false,
    options: [
      {
        value: "never-send-permission-catalogue",
        label: "never-send-permission-catalogue",
      },
    ],
  };
  const calls: Record<string, unknown>[] = [];
  const model = new AssistantModelServing(
    {
      baseUrl:
        "https://api.openai-compat.model-serving.eu01.onstackit.cloud/v1",
      model: "test-model",
      token: "synthetic-test-token",
      timeoutMs: 1000,
    },
    async (_url, init) => {
      const body = JSON.parse(String(init?.body));
      calls.push(body);
      const result =
        body.response_format.json_schema.name === "conversation_intent"
          ? {
              topic: "platform-kubernetes",
              mode: "draft",
              requirements: [],
              editorContract: true,
              editorInputs: ["platform_kubernetes"],
            }
          : {
              explanation: "Machine vm-0 guarantees 10 Gbit/s and 16 GB RAM.",
              questions: [
                {
                  path: "platform_kubernetes[*].cluster.node_pools[*].machine_type",
                  answerType: "catalogue",
                  text: "Which 16 GB machine?",
                  options: ["vm-0"],
                },
              ],
              changes: [],
              references: ["platform-kubernetes"],
              replyLanguage: "en",
            };
      return Response.json({
        choices: [
          {
            finish_reason: "stop",
            message: { role: "assistant", content: JSON.stringify(result) },
          },
        ],
      });
    },
  );
  const texts: string[] = [];
  const result = await model.converse(
    {
      engineRevision: knowledge.engineRevision,
      knowledgeSha256: knowledge.sha256,
      groups: knowledge.groups,
    },
    {
      ...assistantPublicValues(
        createCommonConfiguration("standalone", crypto.randomUUID()),
      ),
      "assistant.language": "en",
    },
    [],
    "Please configure central Kubernetes; ask me to choose a machine size first.",
    input,
    [],
    { onText: (text) => texts.push(text) },
  );
  expect(JSON.stringify(result)).not.toMatch(/16 GB|10 Gbit/);
  expect(texts).toEqual([result.explanation]);
  const payload = JSON.stringify(calls);
  expect(payload).toContain("vm-49");
  expect(payload).not.toContain("vm-50");
  expect(payload).not.toContain("never-send-permission-catalogue");
  expect(
    enrichCatalogueQuestions(result, {}, input, "en").questions[0]?.catalogue
      ?.options,
  ).toHaveLength(80);
});

it("loads the configured service regions as well as the platform default", () => {
  expect(
    configuredCatalogueRegions({
      region: "eu01",
      platform_kubernetes: { north: { region: "eu02" } },
    }),
  ).toEqual(["eu01", "eu02"]);
  expect(
    configuredCatalogueRegions({
      region: "eu02",
      connectivity_regions: { eu01: {} },
    }),
  ).toEqual(["eu02", "eu01"]);
  expect(
    configuredCatalogueRegions({
      region: "eu01",
      platform_kubernetes: { invalid: { region: "unknown" } },
    }),
  ).toEqual(["eu01"]);
});

it("keeps the shared selector regression matrix complete when catalogues are added", () => {
  expect(new Set(bindings.map(([, field]) => field))).toEqual(
    new Set(cloudCatalogueFields),
  );
});

it("resolves language across services from UI preference or actual user turns, never assistant history", () => {
  const history = [
    {
      role: "user" as const,
      content: "Please propose a short company prefix.",
    },
    { role: "assistant" as const, content: "Welche Ordnernamen?" },
  ];
  expect(
    resolveAssistantLanguage(
      undefined,
      history,
      "Please change the folder names reflecting the selected prefix.",
    ),
  ).toBe("en");
  expect(resolveAssistantLanguage(undefined, history, "syn")).toBe("en");
  expect(
    resolveAssistantLanguage("en", history, "Welche Größe? Meine Antwort: 100"),
  ).toBe("en");
  expect(
    resolveAssistantLanguage(
      undefined,
      history,
      "Welche Größe? My answer: Use a company-wide standard.",
    ),
  ).toBe("en");
  expect(
    resolveAssistantLanguage(
      undefined,
      [],
      "Bitte eine zentrale Firewall hinzufügen.",
    ),
  ).toBe("de");
});

it("does not replace workload questions with flavor pickers merely because they use a size field", () => {
  const original = dialogue("connectivity.firewalls[*].flavor");
  original.questions[0]!.answerType = "requirements";
  original.questions[0]!.text =
    "What peak throughput and connection count do you expect?";
  const result = enrichCatalogueQuestions(
    original,
    {},
    context("bastionMachineTypes"),
    "en",
  );
  expect(result.questions[0]).not.toHaveProperty("catalogue");
  expect(
    groundCatalogueDialogue(original, {}, context("bastionMachineTypes"), "en"),
  ).toEqual(original);
});

it("keeps a Git user-count estimation question as a business requirement even with available flavors", async () => {
  const { gitDialogueInputs, gitSetupDialogue } = await import(
    "../apps/api/src/assistant/git-dialogue.js"
  );
  const input = context("gitFlavors");
  const sources = gitDialogueInputs({}, [], "Help me estimate the size", input);
  const result = gitSetupDialogue(
    sources,
    {
      setupSource: "current",
      planChoice: "estimate",
      planSource: "current",
      networkChoice: null,
      networkSource: null,
      networkEvidence: null,
    },
    "en",
  );
  expect(result.questions[0]?.answerType).toBe("requirements");
  expect(
    enrichCatalogueQuestions(result, {}, input, "en").questions[0],
  ).not.toHaveProperty("catalogue");
});

it("does not mistake typed folder naming payloads for empty draft promises", () => {
  expect(
    emptyDraftResponse({
      questions: [],
      changes: [],
      folderNames: { platform: { name: "syn-Platform", prefix: "syn" } },
    }),
  ).toBe(false);
  expect(
    emptyDraftResponse({ questions: [], changes: [], folderNames: null }),
  ).toBe(true);
  expect(
    emptyDraftResponse({ questions: [{ path: "company_name" }], changes: [] }),
  ).toBe(false);
});

it.each([
  "audit_logs.acl",
  "observability.acl",
  "devops.allowed_network_ranges",
])(
  "renders actual source-network questions without invented empty-ACL advice: %s",
  (path) => {
    const result = groundCatalogueDialogue(
      {
        explanation: "Need access choices.",
        questions: [
          {
            path,
            text: "Leave empty for public access; I can suggest CIDRs from company name.",
          },
        ],
        changes: [],
        references: [],
      },
      {},
      { regions: [] },
      "en",
    );
    expect(result.questions[0]?.text).toContain("actual client source IP");
    expect(result.questions[0]?.text).toContain(
      "does not permit public access",
    );
    expect(result.questions[0]?.answerType).toBe("requirements");
    expect(result.questions[0]?.options).toEqual([]);
  },
);
it("retains a grounded Git network-choice question with reuse and deliberate source-network options", () => {
  const question = {
    path: "devops.allowed_network_ranges",
    text: "Who needs access?",
    options: [
      "Reuse the saved Observability allowlist",
      "Company egress networks",
    ],
  };
  expect(
    groundCatalogueDialogue(
      {
        explanation: "Choose access.",
        questions: [question],
        changes: [],
        references: [],
      },
      {},
      { regions: [] },
      "en",
    ).questions,
  ).toEqual([question]);
});
