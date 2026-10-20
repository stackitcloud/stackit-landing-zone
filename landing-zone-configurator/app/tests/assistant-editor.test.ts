import {
  assistantProposalBaselineAvailable,
  assistantProposalConflicts,
  assistantProposalFields,
  assistantProposalValue,
  selectAssistantProposalFields,
} from "@lzc/contracts";
import {
  catalogue,
  compileCommonConfiguration,
  createCommonConfiguration,
  createEditorConfiguration,
  exportCommonTfvars,
  featureFieldCatalogue,
  type InputType,
  inputDefinition,
  type JsonValue,
  objectValue,
  regionalConnectivityType,
} from "@lzc/domain";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import {
  applyAssistantChanges,
  validateDialogue,
} from "../apps/api/src/assistant/dialogue.js";
import {
  assistantEditorChangeSchema,
  assistantEditorCreationValue,
  assistantEditorInputs,
  assistantEditorPaths,
  assistantEditorPolicies,
  assistantEditorProposalPath,
  assistantEditorResponseSchema,
  validateAssistantEditorChange,
  validateAssistantEditorSources,
} from "../apps/api/src/assistant/editor.js";
import {
  assistantKnowledgeContext,
  assistantKnowledgeForTopics,
  buildAssistantKnowledge,
} from "../apps/api/src/assistant/knowledge.js";
import {
  AssistantInferenceError,
  AssistantModelServing,
} from "../apps/api/src/assistant/model-serving.js";
import { assistantPublicValues } from "../apps/api/src/assistant/service.js";

function draft() {
  return createCommonConfiguration("standalone", crypto.randomUUID());
}
function patch(
  path: string,
  value: JsonValue,
  operation: "merge" | "replace" | "default" = "merge",
) {
  return { path, value, operation };
}
function response(
  changes: ReturnType<typeof patch>[],
  questions: { path: string; text: string }[] = [],
) {
  return {
    explanation:
      "Ich schlage diese Entwurfswerte zur Prüfung vor; noch nichts gespeichert.",
    questions,
    changes,
    references: ["configuration-contract"],
  };
}

it.each(["add", "replace"] as const)(
  "uses semantic template %s intent against the populated starter set",
  async (mode) => {
    const original = createEditorConfiguration(
      "hub-and-spoke",
      crypto.randomUUID(),
    );
    const corporate = original.projectTemplates?.find(
      (template) => template.kind === "corporate",
    );
    if (!corporate) throw new Error("Missing starter Corporate template");
    corporate.settings.network_prefix_length = 26;
    const beforeCount = original.projectTemplates?.length ?? 0;
    expect(beforeCount).toBe(3);
    const value = {
      [corporate.key]: {
        name: "Corporate zentral",
        kind: "corporate",
        region: "eu01",
        settings: { network_area_key: "default", network_enabled: true },
      },
      internet: {
        name: "Public Internet",
        kind: "public",
        region: "eu01",
        settings: { network_enabled: true },
      },
    };
    const intent = {
      topic: "project-templates",
      mode: "draft",
      editorContract: true,
      editorInputs: ["landing_zones"],
      requirements: [],
      templateSetup: {
        source: "current",
        collectionMode: mode,
        kinds: ["corporate", "public"],
        delegateNaming: true,
        localNetworks: true,
        fields: ["network_enabled", "network_area_key"],
      },
    };
    const result = await collectionModel(
      intent,
      response([
        patch(
          "projectTemplates",
          value,
          mode === "replace" ? "replace" : "merge",
        ),
      ]),
    ).converse(
      knowledgeSelection(),
      assistantPublicValues(original),
      [],
      mode === "replace"
        ? "Ich brauche genau Corporate- und Public-Templates mit lokalen Netzen, keine Sandbox. Benenne sie passend."
        : "Ergänze zusätzlich ein Public Internet Template mit lokalem Netz und aktualisiere das Corporate Template auf Corporate zentral.",
    );
    const candidate = applyAssistantChanges(original, result.changes);
    expect(candidate.projectTemplates).toHaveLength(
      mode === "replace" ? 2 : beforeCount + 1,
    );
    expect(
      candidate.projectTemplates?.find(
        (template) => template.key === corporate.key,
      ),
    ).toMatchObject({
      id: corporate.id,
      settings: { network_prefix_length: 26, network_enabled: true },
    });
    expect(original.projectTemplates).toHaveLength(beforeCount);
  },
);

it.each(["update", "add", "replace"] as const)(
  "uses semantic DNS %s intent without retaining unwanted example zones",
  async (mode) => {
    const original = createEditorConfiguration(
      "hub-and-spoke",
      crypto.randomUUID(),
    );
    const values = assistantPublicValues(original);
    const zones = objectValue(
      objectValue(compileCommonConfiguration(original).connectivity).dns_zones,
    );
    expect(Object.keys(zones)).toContain("example-corp");
    const dnsName = "acme.runs.onstackit.cloud";
    const path =
      mode === "update"
        ? "connectivity.dns_zones.example-corp"
        : "connectivity.dns_zones";
    const value =
      mode === "update"
        ? { dns_name: dnsName }
        : { acme: { dns_name: dnsName } };
    const intent = {
      topic: "dns-zones",
      mode: "draft",
      editorContract: true,
      editorInputs: ["connectivity"],
      requirements: [],
      dnsCollection: {
        source: "current",
        mode,
        entries: mode === "add" ? [{ key: "acme", fields: ["dns_name"] }] : [],
      },
    };
    const answer = {
      ...response([
        patch(path, value, mode === "replace" ? "replace" : "merge"),
      ]),
      references: ["dns-zones"],
    };
    const result = await collectionModel(intent, answer).converse(
      knowledgeSelection(),
      values,
      [],
      mode === "update"
        ? `Korrigiere die bestehende DNS-Zone auf ${dnsName}.`
        : mode === "add"
          ? `Ergänze zusätzlich die DNS-Zone ${dnsName}.`
          : `Ich möchte genau eine DNS-Zone: ${dnsName}.`,
    );
    const candidate = applyAssistantChanges(original, result.changes);
    const after = objectValue(
      objectValue(compileCommonConfiguration(candidate).connectivity).dns_zones,
    );
    expect(Object.keys(after)).toHaveLength(
      mode === "add" ? Object.keys(zones).length + 1 : 1,
    );
    expect(Object.keys(after)).toContain(
      mode === "update" ? "example-corp" : "acme",
    );
    expect(
      objectValue(after[mode === "update" ? "example-corp" : "acme"]).dns_name,
    ).toBe(dnsName);
    if (mode === "update") {
      expect(objectValue(after["example-corp"])).toEqual({
        ...objectValue(zones["example-corp"]),
        dns_name: dnsName,
      });
      await expect(
        collectionModel(intent, {
          ...answer,
          changes: [
            patch("connectivity.dns_zones", { acme: { dns_name: dnsName } }),
          ],
        }).converse(
          knowledgeSelection(),
          values,
          [],
          `Korrigiere die bestehende DNS-Zone auf ${dnsName}.`,
        ),
      ).rejects.toBeInstanceOf(AssistantInferenceError);
    }
  },
);

it("requires explicitly requested DNS fields in the intended new entry, not in every zone", () => {
  const schema = assistantEditorChangeSchema(
    "connectivity.dns_zones",
    undefined,
    "serving",
    {},
    "merge",
    { company: ["dns_name", "contact_email", "type"] },
  );
  const company = {
    dns_name: "company.stackit.gg",
    contact_email: "owner@example.test",
    type: "primary",
  };
  const change = {
    path: "connectivity.dns_zones",
    operation: "merge",
    value: {
      company,
      other: { dns_name: "other.stackit.gg" },
    },
  };
  expect(schema.safeParse(change).success).toBe(true);
  expect(
    schema.safeParse({
      ...change,
      value: {
        ...change.value,
        other: { ...change.value.other, contact_email: null },
      },
    }).success,
  ).toBe(true);
  for (const value of [
    null,
    { other: change.value.other },
    { company: null },
    { company: { dns_name: company.dns_name, type: company.type } },
    { company: { ...company, contact_email: null } },
    { company: { ...company, type: "public" } },
  ])
    expect(schema.safeParse({ ...change, value }).success).toBe(false);
});

function knowledgeSelection() {
  const knowledge = buildAssistantKnowledge();
  return {
    engineRevision: knowledge.engineRevision,
    knowledgeSha256: knowledge.sha256,
    groups: knowledge.groups,
  };
}

function collectionModel(
  intent: unknown,
  answer: unknown,
  inspect?: (request: {
    messages: { role: string; content: string }[];
    response_format: { json_schema: { name: string; schema: unknown } };
  }) => void,
) {
  return new AssistantModelServing(
    {
      baseUrl:
        "https://api.openai-compat.model-serving.eu01.onstackit.cloud/v1",
      model: "test-model",
      token: "test-token",
      timeoutMs: 1000,
    },
    vi.fn<typeof fetch>(async (_url, options) => {
      const body = JSON.parse(String(options?.body));
      inspect?.(body);
      return new Response(
        JSON.stringify({
          choices: [
            {
              finish_reason: "stop",
              message: {
                role: "assistant",
                content: JSON.stringify(
                  body.response_format.json_schema.name ===
                    "conversation_intent"
                    ? intent
                    : answer,
                ),
              },
            },
          ],
        }),
        { headers: { "content-type": "application/json" } },
      );
    }),
  );
}

it.each([
  {
    name: "one same-region area",
    areas: [{ key: "default", region: "eu01" }],
    complete: true,
  },
  {
    name: "one non-default area",
    areas: [{ key: "central", region: "eu01" }],
    complete: true,
  },
  {
    name: "unrelated region",
    areas: [
      { key: "default", region: "eu01" },
      { key: "other", region: "eu02" },
    ],
    complete: true,
  },
  {
    name: "ambiguous areas",
    areas: [
      { key: "default", region: "eu01" },
      { key: "other", region: "eu01" },
    ],
    complete: false,
  },
  { name: "missing area", areas: [], complete: false },
  {
    name: "only another region",
    areas: [{ key: "other", region: "eu02" }],
    complete: false,
  },
  {
    name: "missing region",
    areas: [{ key: "default", region: "eu01" }],
    region: null,
    complete: false,
  },
  {
    name: "unresolved naming",
    areas: [{ key: "default", region: "eu01" }],
    delegateNaming: false,
    complete: false,
  },
  {
    name: "additional service choices",
    areas: [{ key: "default", region: "eu01" }],
    extraField: "observability",
    complete: false,
  },
  { name: "public without SNA", areas: [], kinds: ["public"], complete: true },
])("asks only unresolved template business choices: $name", async (fixture) => {
  const original = createEditorConfiguration(
    "hub-and-spoke",
    crypto.randomUUID(),
  );
  const current = {
    ...assistantPublicValues(original),
    region: fixture.region === null ? null : "eu01",
    "assistant.network_areas": fixture.areas,
  };
  const kinds = fixture.kinds ?? ["corporate", "public"];
  const intent = {
    topic: "project-templates",
    mode: "draft",
    editorContract: true,
    editorInputs: ["landing_zones"],
    requirements: [],
    templateSetup: {
      source: "current",
      collectionMode: "replace",
      kinds,
      delegateNaming: fixture.delegateNaming ?? true,
      localNetworks: true,
      fields: [
        "network_enabled",
        ...(fixture.extraField ? [fixture.extraField] : []),
      ],
    },
  };
  const corporateKey = fixture.areas.find(
    (area) => area.region === "eu01",
  )?.key;
  const changes = [
    patch(
      "projectTemplates",
      {
        ...(kinds.includes("corporate") && corporateKey
          ? {
              central: {
                name: "Corporate",
                kind: "corporate",
                region: "eu01",
                settings: {
                  network_enabled: true,
                  network_area_key: corporateKey,
                },
              },
            }
          : {}),
        internet: {
          name: "Internet",
          kind: "public",
          region: "eu01",
          settings: { network_enabled: true },
        },
      },
      "replace",
    ),
  ];
  const question = {
    path: "projectTemplates",
    text: "Welche fachliche Auswahl soll verwendet werden?",
  };
  let questionLimit: number | undefined;
  let defaults: unknown;
  const model = collectionModel(
    intent,
    response(
      fixture.complete ? changes : [],
      fixture.complete ? [] : [question],
    ),
    (request) => {
      if (request.response_format.json_schema.name !== "editor_dialogue")
        return;
      questionLimit = z
        .object({
          properties: z.object({
            questions: z.object({ maxItems: z.number() }),
          }),
        })
        .parse(request.response_format.json_schema.schema).properties
        .questions.maxItems;
      const task = JSON.parse(
        request.messages.find((entry) => entry.role === "user")?.content ??
          "{}",
      );
      defaults = task.templateSetup?.resolvedDefaults;
    },
  );
  const result = await model.converse(
    knowledgeSelection(),
    current,
    [],
    "Erstelle die gewünschten Vorlagen mit lokalen Netzen und benenne sie passend.",
  );
  expect(questionLimit).toBe(fixture.complete ? 0 : 3);
  expect(result.questions).toEqual(fixture.complete ? [] : [question]);
  expect(result.changes).toEqual(fixture.complete ? changes : []);
  expect(defaults).toEqual(
    fixture.complete
      ? {
          region: "eu01",
          ...(kinds.includes("corporate")
            ? { networkAreaKey: fixture.areas[0]?.key }
            : {}),
        }
      : null,
  );
});

it("rejects an unnecessary technical template question instead of silently stripping it", async () => {
  const original = createEditorConfiguration(
    "hub-and-spoke",
    crypto.randomUUID(),
  );
  const model = collectionModel(
    {
      topic: "project-templates",
      mode: "draft",
      editorContract: true,
      editorInputs: ["landing_zones"],
      requirements: [],
      templateSetup: {
        source: "current",
        kinds: ["corporate", "public"],
        delegateNaming: true,
        localNetworks: true,
        fields: ["network_enabled", "network_area_key"],
      },
    },
    response(
      [],
      [
        {
          path: "projectTemplates",
          text: "Welcher technische network_area_key soll verwendet werden?",
        },
      ],
    ),
  );
  await expect(
    model.converse(
      knowledgeSelection(),
      assistantPublicValues(original),
      [],
      "Corporate- und Public-Vorlagen mit lokalen Netzen, bitte passend benennen.",
    ),
  ).rejects.toBeInstanceOf(AssistantInferenceError);
});

function expectTopicKnowledge(system: string, topics: readonly string[]) {
  const knowledge = buildAssistantKnowledge();
  const expected = new Set([
    ...topics,
    ...knowledge.topics
      .filter((topic) => topic.mandatory)
      .map((topic) => topic.id),
  ]);
  for (const id of expected) {
    const topic = knowledge.topics.find((entry) => entry.id === id);
    for (const dependency of topic?.dependencies ?? [])
      expected.add(dependency);
  }
  const topicIds = new Set<string>(knowledge.topics.map((topic) => topic.id));
  for (const rule of knowledge.rules) {
    const text = JSON.stringify(rule.text);
    if (!topicIds.has(rule.id) || expected.has(rule.id))
      expect(system, rule.id).toContain(text);
    else expect(system, rule.id).not.toContain(text);
  }
}

describe("topic knowledge delivery", () => {
  const knowledge = buildAssistantKnowledge();
  const editorTopics = knowledge.topics.filter((topic) =>
    knowledge.fields.some(
      (field) =>
        field.mode === "propose-validated-draft" &&
        (topic.fieldPaths as readonly string[]).includes(field.path),
    ),
  );

  it("rejects unknown or missing topic dependencies without mutating the selected context", () => {
    const context = assistantKnowledgeContext(knowledgeSelection());
    const before = structuredClone(context);
    expect(() =>
      assistantKnowledgeForTopics(context, ["unknown-topic"]),
    ).toThrow("assistant_unknown_knowledge_dependency");
    expect(() =>
      assistantKnowledgeForTopics(
        {
          ...context,
          topics: context.topics.filter(
            (topic) => topic.id !== "identity-foundations",
          ),
        },
        ["dns-zones"],
      ),
    ).toThrow("assistant_unknown_knowledge_dependency");
    expect(
      assistantKnowledgeForTopics(context, ["dns-zones"]).rules.map(
        (rule) => rule.id,
      ),
    ).toContain("configuration-contract");
    expect(context).toEqual(before);
  });

  it.each(editorTopics.map((topic) => topic.id))(
    "supplies full %s knowledge, transitive dependencies and safety rules to the Editor model",
    async (topic) => {
      let received = false;
      const model = collectionModel(
        { topic, mode: "draft", editorContract: true, requirements: [] },
        { ...response([]), references: [topic] },
        (request) => {
          if (request.response_format.json_schema.name !== "editor_dialogue")
            return;
          received = true;
          expectTopicKnowledge(request.messages[0]?.content ?? "", [topic]);
        },
      );
      await model.converse(
        knowledgeSelection(),
        {},
        [],
        "Bitte einen Vorschlag für dieses Thema vorbereiten.",
      );
      expect(received).toBe(true);
    },
  );

  it.each(knowledge.topics.map((topic) => topic.id))(
    "supplies scoped full %s knowledge to advice, or uses the deterministic policy boundary",
    async (topic) => {
      let received = false;
      const model = collectionModel(
        { topic, mode: "advice", requirements: [] },
        { ...response([]), references: [topic] },
        (request) => {
          if (
            request.response_format.json_schema.name === "conversation_intent"
          )
            return;
          received = true;
          const extra =
            topic === "firewall-infrastructure"
              ? ["firewall-policy", "firewall-access-bootstrap"]
              : ["identity-foundations", "governance-folders"].includes(topic)
                ? ["identity-foundations", "governance-folders"]
                : [];
          expectTopicKnowledge(request.messages[0]?.content ?? "", [
            topic,
            ...extra,
          ]);
          if (topic !== "firewall-infrastructure") {
            expect(request.messages[0]).toMatchObject({
              role: "system",
              content: expect.stringContaining("ANSWER COMPLETENESS:"),
            });
            expect(request.messages[0]?.content).toContain(
              "including null meaning no optional service instance",
            );
            expect(request.messages[0]?.content).toContain(
              "Otherwise questions may ask only genuinely missing business decisions after the factual answer",
            );
            expect(request.messages[0]?.content).toContain(
              "at most 2400 characters",
            );
            expect(request.messages[0]?.content).toContain(
              "For a pure fields/defaults/limits overview return questions=[]",
            );
            expect(request.messages.at(-1)).toEqual({
              role: "user",
              content:
                "Bitte erläutere die Bedeutung und Grenzen dieser Komponente.",
            });
          }
        },
      );
      const result = await model.converse(
        knowledgeSelection(),
        {},
        [],
        "Bitte erläutere die Bedeutung und Grenzen dieser Komponente.",
      );
      expect(received).toBe(topic !== "firewall-policy");
      expect(result.changes).toEqual([]);
      expect(result.references).toContain(topic);
    },
  );

  it("includes the knowledge of all exposed component fields for a cross-topic Editor proposal", async () => {
    let received = false;
    await collectionModel(
      {
        topic: "configuration-contract",
        mode: "draft",
        editorContract: true,
        editorInputs: ["connectivity", "observability"],
        requirements: [],
      },
      response([]),
      (request) => {
        if (request.response_format.json_schema.name !== "editor_dialogue")
          return;
        received = true;
        expectTopicKnowledge(request.messages[0]?.content ?? "", [
          "stackit-network-components",
          "dns-zones",
          "firewall-infrastructure",
          "vpn",
          "observability",
        ]);
      },
    ).converse(
      knowledgeSelection(),
      {},
      [],
      "Bitte Netzwerk und Observability zusammen vorbereiten.",
    );
    expect(received).toBe(true);
  });

  it.each([
    { topic: "identity-foundations", group: "identity" },
    { topic: "firewall-infrastructure", group: "network" },
  ])(
    "respects a restricted $group knowledge selection in advice",
    async ({ topic, group }) => {
      let received = false;
      await collectionModel(
        { topic, mode: "advice", requirements: [] },
        { ...response([]), references: [topic] },
        (request) => {
          if (
            request.response_format.json_schema.name === "conversation_intent"
          )
            return;
          received = true;
          expectTopicKnowledge(request.messages[0]?.content ?? "", [topic]);
        },
      ).converse(
        { ...knowledgeSelection(), groups: [group] },
        {},
        [],
        "Bitte erläutere dieses Thema ohne Änderungen.",
      );
      expect(received).toBe(true);
    },
  );
});

function sample(
  type: InputType,
  segments: string[],
  path: string,
  required = false,
): JsonValue {
  if (
    /^(?:connectivity|connectivity_regions\[\*\])\.dns_zones\[\*\]\.type$/.test(
      path,
    )
  )
    return "primary";
  if (typeof type === "string")
    return type === "bool" ? true : type === "number" ? 1 : "reviewed-value";
  if (type[0] === "map")
    return {
      example: sample(
        type[1] === "dynamic" && path === "connectivity_regions"
          ? regionalConnectivityType()
          : type[1],
        segments.slice(1),
        `${path}[*]`,
      ),
    };
  if (type[0] === "list" || type[0] === "set")
    return [sample(type[1], segments.slice(1), `${path}[*]`, true)];
  if (type[0] !== "object") throw new Error("unsupported_sample_type");
  const key = segments[0];
  const value: Record<string, JsonValue> = {};
  if (required)
    for (const [name, child] of Object.entries(type[1]))
      if (!type[2]?.includes(name))
        value[name] = sample(child, [], `${path}.${name}`, true);
  if (key)
    value[key] = sample(
      type[1][key] ?? "dynamic",
      segments.slice(1),
      `${path}.${key}`,
      required,
    );
  return value;
}

describe("shared native Editor proposal contract", () => {
  it.each(["primary", "secondary", "public", "private"])(
    "enforces DNS role %s for nested and direct Assistant proposals",
    (type) => {
      const valid = type === "primary" || type === "secondary";
      const zone = { dns_name: "company.stackit.gg", type };
      const network = {
        network_areas: {
          default: {
            ranges: ["10.0.0.0/16"],
            transfer_network: "10.255.0.0/24",
          },
        },
        dns_zones: { company: zone },
      };
      const proposals: { path: string; value: JsonValue }[] = [
        { path: "connectivity", value: network },
        { path: "connectivity.dns_zones", value: { company: zone } },
        { path: "connectivity.dns_zones.company", value: zone },
        { path: "connectivity.dns_zones.company.type", value: type },
        { path: "connectivity_regions", value: { eu01: network } },
        { path: "connectivity_regions.eu01", value: network },
        {
          path: "connectivity_regions.eu01.dns_zones",
          value: { company: zone },
        },
        { path: "connectivity_regions.eu01.dns_zones.company", value: zone },
        {
          path: "connectivity_regions.eu01.dns_zones.company.type",
          value: type,
        },
      ];
      for (const { path, value } of proposals) {
        for (const operation of ["merge", "replace"] as const) {
          const validate = () =>
            validateAssistantEditorChange(patch(path, value, operation));
          if (valid) expect(validate, `${path}: ${operation}`).not.toThrow();
          else expect(validate, `${path}: ${operation}`).toThrow();
          const serving = assistantEditorChangeSchema(
            path,
            undefined,
            "serving",
            value,
          );
          expect(
            serving.safeParse(patch(path, value, operation)).success,
            `serving ${path}: ${operation}`,
          ).toBe(valid);
        }
      }
      for (const path of [
        "connectivity.dns_zones.company.type",
        "connectivity_regions.eu01.dns_zones.company.type",
      ]) {
        const serving = assistantEditorChangeSchema(path, undefined, "serving");
        for (const operation of ["merge", "replace"] as const)
          expect(serving.safeParse(patch(path, type, operation)).success).toBe(
            valid,
          );
      }
    },
  );

  it("keeps component decision policies tied to the reviewed native field inventory", () => {
    const fields = new Set(featureFieldCatalogue().map((field) => field.path));
    for (const [root, policy] of Object.entries(assistantEditorPolicies)) {
      expect(assistantEditorInputs).toContain(root);
      for (const path of [
        ...(policy.creationDecisions ?? []),
        ...(policy.freeTextQuestions ?? []),
      ])
        expect(fields.has(path), path).toBe(true);
    }
  });
  it("uses one serving object per path while retaining strict runtime operation and key checks", () => {
    const schema = assistantEditorResponseSchema(
      assistantEditorChangeSchema("labels", undefined, "serving"),
    );
    expect(schema.type).toBe("object");
    expect(schema.anyOf).toBeUndefined();
    expect(JSON.stringify(schema)).not.toContain('"propertyNames"');
    expect(() =>
      validateAssistantEditorChange(patch("labels", { "": "invalid" })),
    ).toThrow();
    expect(() =>
      validateAssistantEditorChange(
        patch("labels", { team: "example" }, "default"),
      ),
    ).toThrow();
    expect(() =>
      validateAssistantEditorChange(patch("labels", { team: "example" })),
    ).not.toThrow();
    const nested = assistantEditorResponseSchema(
      z.object({
        propertyNames: z.record(z.string().min(1), z.string()),
        rows: z.array(z.record(z.string().min(1), z.string())).nullable(),
      }),
    );
    expect(nested.properties).toHaveProperty("propertyNames");
    expect(nested.properties?.propertyNames).not.toHaveProperty(
      "propertyNames",
    );
    expect(JSON.stringify(nested.properties?.rows)).not.toContain(
      '"propertyNames"',
    );
  });

  it("validates a typed proposal for every effective nonprotected catalogue path", () => {
    const fields = featureFieldCatalogue().filter(
      (field) =>
        !field.sensitive &&
        field.commonEditor !== "not-effective" &&
        !/^firewall_(?:config|admin_|bootstrap|api_)/.test(field.path),
    );
    expect(fields.length).toBeGreaterThan(300);
    for (const field of fields) {
      const root = assistantEditorProposalPath(field.path);
      expect(root, field.path).not.toBeNull();
      if (!root) throw new Error("missing_editor_route");
      const segments = field.path
        .replace(/\[\*\]/g, ".*")
        .split(".")
        .slice(1);
      expect(
        () =>
          validateAssistantEditorChange(
            patch(root, sample(inputDefinition(root).type, segments, root)),
          ),
        field.path,
      ).not.toThrow();
    }
    const knowledge = buildAssistantKnowledge();
    expect(
      knowledge.fields
        .filter((field) =>
          fields.some((expected) => expected.path === field.path),
        )
        .every((field) => field.mode === "propose-validated-draft"),
    ).toBe(true);
  });

  it("preserves native values and exports every public root through the real apply route", () => {
    for (const template of catalogue.templates) {
      const document = createCommonConfiguration(
        template.id,
        crypto.randomUUID(),
      );
      const values = compileCommonConfiguration(document);
      for (const root of assistantEditorInputs) {
        if (values[root] === undefined) continue;
        const candidate = applyAssistantChanges(document, [
          patch(root, values[root]),
        ]);
        expect(compileCommonConfiguration(candidate), root).toEqual(values);
      }
    }
  });

  it("creates audit logging with reviewed retention, ACL and Object Lock, then changes only retention", () => {
    const original = draft();
    const created = applyAssistantChanges(original, [
      patch("audit_logs", {
        retention_days: 90,
        acl: ["203.0.113.0/24"],
        s3_object_lock: false,
      }),
    ]);
    const changed = applyAssistantChanges(created, [
      patch("audit_logs.retention_days", 120),
    ]);
    expect(compileCommonConfiguration(changed).audit_logs).toEqual({
      retention_days: 120,
      acl: ["203.0.113.0/24"],
      s3_object_lock: false,
    });
    expect(exportCommonTfvars(changed)).toContain('"retention_days" = 120');
    expect(compileCommonConfiguration(original).audit_logs).toBeUndefined();
    expect(() =>
      applyAssistantChanges(original, [
        patch("audit_logs", { retention_days: 90 }),
      ]),
    ).toThrow("assistant_audit_creation_requires_retention_acl_lock");
    expect(() =>
      applyAssistantChanges(original, [
        patch("audit_logs", {
          retention_days: 400,
          acl: ["203.0.113.0/24"],
          s3_object_lock: true,
        }),
      ]),
    ).toThrow();
  });

  it("requires explicit creation decisions in the serving contract without changing partial-update semantics", () => {
    const value = {
      link_scopes: null,
      retention_days: 90,
      acl: ["203.0.113.0/24"],
      s3_object_lock: false,
    };
    const creation = assistantEditorChangeSchema(
      "audit_logs",
      undefined,
      "serving",
    );
    expect(creation.safeParse(patch("audit_logs", value)).success).toBe(true);
    for (const field of ["retention_days", "acl", "s3_object_lock"]) {
      const missing = Object.fromEntries(
        Object.entries(value).filter(([key]) => key !== field),
      );
      expect(
        creation.safeParse(patch("audit_logs", missing)).success,
        field,
      ).toBe(false);
      expect(
        creation.safeParse(patch("audit_logs", { ...value, [field]: null }))
          .success,
        field,
      ).toBe(false);
    }
    expect(
      assistantEditorChangeSchema(
        "audit_logs",
        undefined,
        "serving",
        value,
      ).safeParse(patch("audit_logs", { retention_days: 120 })).success,
    ).toBe(true);
    expect(
      assistantEditorChangeSchema("audit_logs").safeParse(
        patch("audit_logs", { retention_days: 120 }),
      ).success,
    ).toBe(true);
  });

  it("requires native mandatory fields for new map entries and applies complete Kubernetes proposals", () => {
    const value = {
      eu01: {
        region: "eu01",
        cluster: {
          name: "synthetic-k8s",
          node_pools: [
            {
              name: "default",
              machine_type: "g1.4",
              minimum: 1,
              maximum: 2,
              availability_zones: ["eu01-1"],
            },
          ],
        },
      },
    };
    const schema = assistantEditorChangeSchema(
      "platform_kubernetes",
      undefined,
      "serving",
    );
    expect(schema.safeParse(patch("platform_kubernetes", value)).success).toBe(
      true,
    );
    expect(
      schema.safeParse(
        patch("platform_kubernetes", {
          eu01: { cluster: value.eu01.cluster },
        }),
      ).success,
    ).toBe(false);
    const created = applyAssistantChanges(draft(), [
      patch("platform_kubernetes", value),
    ]);
    const changed = applyAssistantChanges(created, [
      patch("platform_kubernetes.eu01.cluster", { name: "renamed-k8s" }),
    ]);
    expect(
      objectValue(compileCommonConfiguration(changed).platform_kubernetes).eu01,
    ).toEqual({
      region: "eu01",
      cluster: { ...value.eu01.cluster, name: "renamed-k8s" },
    });
  });

  it("uses explicit constructor slots and omits only optional native defaults on creation", () => {
    const schema = assistantEditorChangeSchema(
      "observability",
      undefined,
      "serving",
    );
    const type = inputDefinition("observability").type;
    if (typeof type === "string" || type[0] !== "object")
      throw new Error("observability_contract_changed");
    const slots = Object.fromEntries(
      Object.keys(type[1]).map((key) => [key, null]),
    );
    const values = {
      ...slots,
      acl: ["203.0.113.0/24"],
      plan_name: "Observability-Starter-EU01",
      metrics_retention_days: 30,
    };
    expect(schema.safeParse(patch("observability", values)).success).toBe(true);
    expect(
      schema.safeParse(
        patch("observability", { plan_name: "Observability-Starter-EU01" }),
      ).success,
    ).toBe(false);
    expect(assistantEditorCreationValue("observability", values, null)).toEqual(
      {
        acl: ["203.0.113.0/24"],
        plan_name: "Observability-Starter-EU01",
        metrics_retention_days: 30,
      },
    );
    expect(
      assistantEditorCreationValue(
        "observability",
        { acl: null },
        { acl: ["203.0.113.0/24"] },
      ),
    ).toEqual({ acl: null });
    expect(
      assistantEditorCreationValue("labels", { kept: null }, null),
    ).toEqual({ kept: null });
  });
  it("preserves siblings on merge, reviews replacement/reset atomically and retains operation metadata", () => {
    const original = applyAssistantChanges(draft(), [
      patch("labels", { keep: "yes", remove: "old" }),
    ]);
    const changes = [
      {
        ...patch("labels", { remove: "new", added: "yes" }),
        before: { keep: "yes", remove: "old" },
      },
    ];
    const fields = assistantProposalFields(changes);
    const selected = selectAssistantProposalFields(changes, [
      fields[0]?.id ?? "",
    ]);
    expect(selected[0]?.operation).toBe("merge");
    const selectedDialogue = validateDialogue(
      { ...response([]), changes: selected },
      ["configuration-contract"],
    );
    expect(
      objectValue(
        compileCommonConfiguration(
          applyAssistantChanges(original, selectedDialogue.changes),
        ).labels,
      ).keep,
    ).toBe("yes");
    const replacement = {
      ...patch("labels", { keep: "yes" }, "replace"),
      before: { keep: "yes", remove: "old" },
    };
    expect(assistantProposalFields([replacement])).toHaveLength(1);
    const replaced = applyAssistantChanges(original, [replacement]);
    expect(
      objectValue(compileCommonConfiguration(replaced).labels).remove,
    ).toBeUndefined();
    const reset = applyAssistantChanges(replaced, [
      patch("labels", null, "default"),
    ]);
    expect(reset.features.identity.labels).toBeUndefined();
  });

  it("uses collision-free selection IDs for arbitrary native map keys", () => {
    const changes = [
      { ...patch("labels", { "a/b": "one", a: { b: "two" } }), before: {} },
    ];
    expect(assistantProposalFields(changes).map((field) => field.id)).toEqual([
      "labels/a%2Fb",
      "labels/a/b",
    ]);
  });

  it("finds nested baselines and detects replacements conflicting with local edits", () => {
    const values = {
      connectivity: { dns_zones: { default: { default_ttl: 3600 } } },
    };
    expect(
      assistantProposalValue(
        values,
        "connectivity.dns_zones.default.default_ttl",
      ),
    ).toBe(3600);
    expect(
      assistantProposalBaselineAvailable(values, "connectivity.dns_zones"),
    ).toBe(true);
    const fields = assistantProposalFields([
      {
        ...patch("connectivity.dns_zones", {}, "replace"),
        before: { default: { default_ttl: 300 } },
      },
    ]);
    expect(assistantProposalConflicts(fields, values, () => true)).toHaveLength(
      1,
    );
  });

  it("preserves platform template IDs, validates settings/policies and generates new IDs server-side", () => {
    const original = createEditorConfiguration(
      "standalone",
      crypto.randomUUID(),
    );
    const template = original.projectTemplates?.[0];
    if (!template) throw new Error("missing_template_fixture");
    const changed = applyAssistantChanges(original, [
      patch("projectTemplates", {
        [template.key]: {
          settings: { env: "test" },
          parameterPolicy: {
            schema_version: 1,
            fields: {
              env: {
                source: "input",
                required: true,
                choices: ["test", "prod"],
                default: "test",
              },
            },
          },
        },
      }),
    ]);
    expect(changed.projectTemplates?.[0]?.id).toBe(template.id);
    expect(changed.projectTemplates?.[0]?.settings.env).toBe("test");
    const added = applyAssistantChanges(changed, [
      patch("projectTemplates", {
        "new-public": {
          name: "Neue Vorlage",
          kind: "public",
          region: "eu01",
          settings: {},
        },
      }),
    ]);
    expect(
      z
        .uuid()
        .safeParse(
          added.projectTemplates?.find((entry) => entry.key === "new-public")
            ?.id,
        ).success,
    ).toBe(true);
    expect(() =>
      applyAssistantChanges(original, [
        patch("projectTemplates", {
          [template.key]: { id: crypto.randomUUID() },
        }),
      ]),
    ).toThrow();
    expect(() =>
      applyAssistantChanges(original, [
        patch("projectTemplates", {
          [template.key]: { settings: { project_name: "instance" } },
        }),
      ]),
    ).toThrow();
  });

  it("requires complete new templates while keeping existing template updates partial", () => {
    const current = {
      corporate: {
        name: "Corporate",
        kind: "corporate",
        region: "eu01",
        settings: { network_area_key: "default", network_enabled: true },
      },
    };
    const schema = assistantEditorChangeSchema(
      "projectTemplates",
      undefined,
      "serving",
      current,
    );
    expect(
      schema.safeParse(
        patch("projectTemplates", { corporate: { name: "Zentrales Netz" } }),
      ).success,
    ).toBe(true);
    const template = {
      name: "Internet ohne zentrales Netz",
      kind: "public",
      region: "eu01",
      settings: { network_enabled: true },
    };
    for (const missing of ["name", "kind", "region", "settings"]) {
      const incomplete = Object.fromEntries(
        Object.entries(template).filter(([key]) => key !== missing),
      );
      expect(
        schema.safeParse(patch("projectTemplates", { public: incomplete }))
          .success,
        missing,
      ).toBe(false);
    }
    expect(
      schema.safeParse(patch("projectTemplates", { public: template })).success,
    ).toBe(true);
    const serving = assistantEditorResponseSchema(schema);
    expect(JSON.stringify(serving)).not.toContain('"propertyNames"');
    expect(serving.type).toBe("object");
  });

  it("scopes template proposals to requested settings without changing the runtime contract", () => {
    const networkFields = ["network_enabled", "network_area_key"];
    const scoped = assistantEditorChangeSchema(
      "projectTemplates",
      networkFields,
      "serving",
      {},
    );
    const template = {
      name: "Internet",
      kind: "public",
      region: "eu01",
      settings: { network_enabled: true },
    };
    expect(
      scoped.safeParse(patch("projectTemplates", { public: template })).success,
    ).toBe(true);
    for (const extra of [
      { settings: { ...template.settings, secretsmanager_enabled: true } },
      {
        settings: {
          ...template.settings,
          observability: { enabled: true, plan_name: "standard" },
        },
      },
      { namespaceServices: {} },
      { parameterPolicy: {} },
    ]) {
      const change = patch("projectTemplates", {
        public: { ...template, ...extra },
      });
      expect(scoped.safeParse(change).success).toBe(false);
      expect(
        assistantEditorChangeSchema("projectTemplates").safeParse(change)
          .success,
      ).toBe(true);
    }
    const serviceSchema = assistantEditorChangeSchema(
      "projectTemplates",
      [...networkFields, "observability", "secretsmanager_enabled"],
      "serving",
      {},
    );
    expect(
      serviceSchema.safeParse(
        patch("projectTemplates", {
          public: {
            ...template,
            settings: {
              ...template.settings,
              observability: { enabled: true, plan_name: "standard" },
              secretsmanager_enabled: true,
            },
          },
        }),
      ).success,
    ).toBe(true);
    const schema = JSON.stringify(assistantEditorResponseSchema(scoped));
    expect(schema).not.toContain('"observability"');
    expect(schema).not.toContain('"namespaceServices"');
    expect(schema).not.toContain('"parameterPolicy"');
  });

  it("carries source-checked template decisions and real network areas without instance questions", async () => {
    const original = createEditorConfiguration(
      "hub-and-spoke",
      crypto.randomUUID(),
    );
    original.projectTemplates = [];
    const message =
      "Erstelle Corporate- und Public-Vorlagen mit lokalen Netzen. Benenne sie entsprechend.";
    let source = "current";
    let unrequestedService = false;
    const changes = [
      patch("projectTemplates", {
        central: {
          name: "Corporate zentral",
          kind: "corporate",
          region: "eu01",
          settings: { network_area_key: "default", network_enabled: true },
        },
        internet: {
          name: "Public Internet",
          kind: "public",
          region: "eu01",
          settings: { network_enabled: true },
        },
      }),
    ];
    const request = vi.fn<typeof fetch>(async (_url, options) => {
      const body = JSON.parse(String(options?.body));
      const intent =
        body.response_format.json_schema.name === "conversation_intent";
      const user = JSON.parse(
        body.messages.find((entry: { role: string }) => entry.role === "user")
          .content,
      );
      if (intent) {
        expect(user.platformDraft).toBe(true);
        expect(user.availableNetworkAreas).toContainEqual({
          key: "default",
          region: "eu01",
        });
      } else {
        expect(user.templateSetup.delegateNaming).toBe(true);
        expect(user.templateSetup.request).toBe(message);
        expect(
          JSON.stringify(
            body.response_format.json_schema.schema.properties.changes,
          ),
        ).not.toContain('"observability"');
        expect(user.currentValues["assistant.network_areas"]).toContainEqual({
          key: "default",
          region: "eu01",
        });
        expect(
          body.response_format.json_schema.schema.properties.questions.items
            .properties.path.const,
        ).toBe("projectTemplates");
      }
      return new Response(
        JSON.stringify({
          choices: [
            {
              finish_reason: "stop",
              message: {
                role: "assistant",
                content: JSON.stringify(
                  intent
                    ? {
                        topic: "project-templates",
                        mode: "draft",
                        editorContract: true,
                        editorInputs: ["landing_zones"],
                        requirements: [],
                        templateSetup: {
                          source,
                          kinds: ["corporate", "public"],
                          delegateNaming: true,
                          localNetworks: true,
                          fields: ["network_enabled", "network_area_key"],
                        },
                      }
                    : {
                        ...response(
                          unrequestedService
                            ? [
                                patch("projectTemplates", {
                                  internet: {
                                    name: "Internet",
                                    kind: "public",
                                    region: "eu01",
                                    settings: {
                                      network_enabled: true,
                                      secretsmanager_enabled: true,
                                    },
                                  },
                                }),
                              ]
                            : changes,
                        ),
                        references: ["project-templates"],
                      },
                ),
              },
            },
          ],
        }),
        { headers: { "content-type": "application/json" } },
      );
    });
    const model = new AssistantModelServing(
      {
        baseUrl:
          "https://api.openai-compat.model-serving.eu01.onstackit.cloud/v1",
        model: "test-model",
        token: "test-token",
        timeoutMs: 1000,
      },
      request,
    );
    const knowledge = buildAssistantKnowledge();
    const selection = {
      engineRevision: knowledge.engineRevision,
      knowledgeSha256: knowledge.sha256,
      groups: knowledge.groups,
    };
    const result = await model.converse(
      selection,
      assistantPublicValues(original),
      [],
      message,
    );
    expect(result.changes).toEqual(changes);
    expect(
      applyAssistantChanges(original, result.changes).projectTemplates,
    ).toHaveLength(2);
    source = "unknown-user-source";
    await expect(
      model.converse(selection, assistantPublicValues(original), [], message),
    ).rejects.toBeInstanceOf(AssistantInferenceError);
    expect(request).toHaveBeenCalledTimes(3);
    source = "current";
    unrequestedService = true;
    await expect(
      model.converse(selection, assistantPublicValues(original), [], message),
    ).rejects.toBeInstanceOf(AssistantInferenceError);
    expect(request).toHaveBeenCalledTimes(5);
  });

  it("keeps template removals and policy resets atomic", () => {
    const original = createEditorConfiguration(
      "standalone",
      crypto.randomUUID(),
    );
    const values = assistantPublicValues(original);
    const replacement = objectValue(z.json().parse(values.projectTemplates));
    const key = Object.keys(replacement)[0];
    if (!key) throw new Error("missing_template_fixture");
    delete objectValue(replacement[key]).parameterPolicy;
    const changed = applyAssistantChanges(original, [
      patch("projectTemplates", replacement, "replace"),
    ]);
    expect(changed.projectTemplates?.[0]?.parameterPolicy).toBeUndefined();
    expect(
      applyAssistantChanges(changed, [patch("projectTemplates", {}, "replace")])
        .projectTemplates,
    ).toEqual([]);
  });

  it("derives strictly topic-scoped paths, including regional VPN, without granting access to firewall policy", () => {
    const fields =
      buildAssistantKnowledge().topics.find((topic) => topic.id === "vpn")
        ?.fieldPaths ?? [];
    const paths = assistantEditorPaths(
      "connectivity_regions",
      { eu01: { vpn: null } },
      fields,
    );
    expect(paths).toContain("connectivity_regions.eu01.vpn");
    const schema = assistantEditorChangeSchema("connectivity_regions", fields);
    expect(
      schema.safeParse(patch("connectivity_regions", { eu01: { vpn: null } }))
        .success,
    ).toBe(true);
    expect(
      schema.safeParse(
        patch("connectivity_regions", { eu01: { firewalls: {} } }),
      ).success,
    ).toBe(false);
    expect(() =>
      validateAssistantEditorChange(patch("firewall_config", {})),
    ).toThrow();
    expect(() =>
      validateAssistantEditorChange(patch("vpn_pre_shared_keys", {})),
    ).toThrow();
    expect(() =>
      validateAssistantEditorChange(patch("audit_logs", { unknown: true })),
    ).toThrow();
    expect(() =>
      validateAssistantEditorChange(
        patch("labels", { example: "token=private-value" }),
      ),
    ).toThrow();
  });

  it("rejects invented network addresses, cloud IDs, contacts and products", () => {
    for (const value of [
      { acl: ["203.0.113.0/24"] },
      { organization_id: crypto.randomUUID() },
      { contact_email: "invented@example.test" },
      { flavor: "invented-size" },
    ])
      expect(() =>
        validateAssistantEditorSources(patch("labels", value), {}, [], []),
      ).toThrow("assistant_editor_value_unconfirmed");
    expect(() =>
      validateAssistantEditorSources(
        patch("audit_logs", { acl: ["203.0.113.0/24"] }),
        {},
        ["Nutze 203.0.113.0/24."],
        [],
      ),
    ).not.toThrow();
  });
});

it.each([
  {
    topic: "audit-logs",
    root: "audit_logs",
    value: {
      retention_days: 90,
      acl: ["203.0.113.0/24"],
      s3_object_lock: false,
    },
    reference: "audit-logs",
    message:
      "Als nächstes Audit Logging: 90 Tage, ACL 203.0.113.0/24, ohne Object Lock. Bitte als Vorschlag.",
    requirements: [],
  },
  {
    topic: "configuration-lifecycle",
    root: "labels",
    value: { cost_center: "synthetic-team" },
    reference: "identity-foundations",
    message:
      "Bitte nur das Ressourcenlabel cost_center auf synthetic-team setzen, als Entwurfsvorschlag.",
    requirements: [],
  },
  {
    topic: "identity-foundations",
    root: "labels",
    value: { cost_center: "synthetic-team" },
    reference: "identity-foundations",
    message:
      "Please propose the resource label cost_center=synthetic-team. Keep everything else unchanged.",
    requirements: [],
    language: "en",
  },
  {
    topic: "observability",
    root: "observability",
    value: {
      plan_name: "Observability-Starter-EU01",
      acl: ["203.0.113.0/24"],
      metrics_retention_days: 30,
    },
    reference: "observability",
    message:
      "Bitte Observability-Starter-EU01 mit ACL 203.0.113.0/24 und metrics_retention_days 30 als Vorschlag.",
    requirements: [
      {
        decision: "capacity",
        quote: "irrelevant invented firewall requirement",
      },
    ],
  },
])(
  "translates $root using the native contract without unrelated topic/requirement leakage",
  async (scenario) => {
    const intent = {
      topic: scenario.topic,
      mode: "draft",
      requirements: scenario.requirements,
      adviceTask: "other",
      editorContract: true,
      editorInputs: [scenario.root],
    };
    const answer = {
      ...response([patch(scenario.root, scenario.value)]),
      references: [scenario.reference],
      explanation: "Alles wurde bereits gespeichert und deployt.",
    };
    const type = inputDefinition(scenario.root).type;
    const modelValue =
      typeof type !== "string" && type[0] === "object"
        ? Object.fromEntries(
            Object.keys(type[1]).map((key) => [
              key,
              objectValue(scenario.value)[key] ?? null,
            ]),
          )
        : scenario.value;
    const fetch = vi.fn().mockImplementation(async (_url, options) => {
      const body = JSON.parse(options.body);
      return new Response(
        JSON.stringify({
          choices: [
            {
              finish_reason: "stop",
              message: {
                role: "assistant",
                content: JSON.stringify(
                  body.response_format.json_schema.name ===
                    "conversation_intent"
                    ? intent
                    : {
                        ...answer,
                        replyLanguage:
                          "language" in scenario ? scenario.language : "de",
                        changes: [patch(scenario.root, modelValue)],
                      },
                ),
              },
            },
          ],
        }),
        { headers: { "content-type": "application/json" } },
      );
    });
    const model = new AssistantModelServing(
      {
        baseUrl:
          "https://api.openai-compat.model-serving.eu01.onstackit.cloud/v1",
        model: "test-model",
        token: "test-token",
        timeoutMs: 1000,
      },
      fetch,
    );
    const original = draft();
    const knowledge = buildAssistantKnowledge();
    const dialogue = await model.converse(
      {
        engineRevision: knowledge.engineRevision,
        knowledgeSha256: knowledge.sha256,
        groups: knowledge.groups,
      },
      assistantPublicValues(original),
      [{ role: "user", content: "Die Firewall ist geklärt." }],
      scenario.message,
    );
    expect(dialogue.changes).toEqual(answer.changes);
    expect(
      compileCommonConfiguration(
        applyAssistantChanges(original, dialogue.changes),
      )[scenario.root],
    ).toMatchObject(scenario.value);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(dialogue.explanation).not.toContain(
      "bereits gespeichert und deployt",
    );
    expect(dialogue.explanation).toContain(
      "language" in scenario
        ? "Nothing has been saved"
        : "Noch nichts gespeichert",
    );
  },
);
