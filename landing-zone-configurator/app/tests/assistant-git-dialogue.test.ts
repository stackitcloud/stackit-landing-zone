import {
  compileCommonConfiguration,
  createCommonConfiguration,
} from "@lzc/domain";
import { expect, it } from "vitest";
import {
  applyAssistantChanges,
  validateDialogue,
} from "../apps/api/src/assistant/dialogue.js";
import {
  gitDialogueInputs,
  gitSetupDialogue,
} from "../apps/api/src/assistant/git-dialogue.js";
import { buildAssistantKnowledge } from "../apps/api/src/assistant/knowledge.js";
import { AssistantModelServing } from "../apps/api/src/assistant/model-serving.js";
import { assistantPublicValues } from "../apps/api/src/assistant/service.js";

function fixture(
  message: string,
  history: { role: "user" | "assistant"; content: string }[] = [],
) {
  const draft = createCommonConfiguration("standalone", crypto.randomUUID());
  const values = assistantPublicValues(draft);
  return {
    draft,
    values,
    inputs: gitDialogueInputs(values, history, message, { regions: [] }),
  };
}
const empty = {
  setupSource: "current",
  planChoice: null,
  planSource: null,
  networkChoice: null,
  networkSource: null,
  networkEvidence: null,
} as const;

it.each(["en", "de"] as const)(
  "offers grounded plans and access choices instead of an empty flavor field (%s)",
  (language) => {
    const { inputs } = fixture(
      "Please add a central git instance to the config",
    );
    const result = gitSetupDialogue(inputs, empty, language);
    expect(result.changes).toEqual([]);
    expect(result.questions.map((q) => q.path)).toEqual([
      "devops.git_flavor",
      "devops.allowed_network_ranges",
    ]);
    expect(result.questions[0]?.options.some((o) => o.includes("Git100"))).toBe(
      true,
    );
    expect(
      result.questions[0]?.options.some((o) => o.includes("Git10 —")),
    ).toBe(true);
    expect(result.questions.every((q) => q.options.length >= 2)).toBe(true);
    expect(result.explanation).toContain("Git100");
    expect(result.explanation).toContain("100");
    expect(result.explanation).toContain(
      language === "en"
        ? "replaces the instance"
        : "ersetzt derzeit die Instanz",
    );
    const knowledge = buildAssistantKnowledge();
    expect(() =>
      validateDialogue(
        result,
        knowledge.rules.map((r) => r.id),
      ),
    ).not.toThrow();
  },
);

it("resolves the reported standard/company-wide answer and asks only about access", () => {
  const { inputs } = fixture(
    "Welche Git-Größe soll der Entwurf verwenden?\nMy answer: just use a standard git flavor, which is usefull for a company wide git.",
    [
      {
        role: "user",
        content: "Please add a central git instance to the config",
      },
      {
        role: "assistant",
        content: "Welche Git-Größe soll der Entwurf verwenden?",
      },
    ],
  );
  const result = gitSetupDialogue(
    inputs,
    {
      ...empty,
      setupSource: "history-0",
      planChoice: "recommend",
      planSource: "current",
    },
    "en",
  );
  expect(result.questions.map((q) => q.path)).toEqual([
    "devops.allowed_network_ranges",
  ]);
  expect(result.explanation).toContain("Starting size selected: Git100");
  expect(JSON.stringify(result)).not.toMatch(/Welche|Noch nichts|Größe/);
  expect(result.questions[0]?.options.length).toBeGreaterThan(1);
});

it("retains the selected recommendation through the network reply and applies only the complete Git draft", () => {
  const { draft, inputs } = fixture("Use 203.0.113.0/24.", [
    { role: "user", content: "Please add a central Git instance" },
    { role: "assistant", content: "Choose a starting size" },
    { role: "user", content: "Use a company-wide standard" },
  ]);
  const result = gitSetupDialogue(
    inputs,
    {
      ...empty,
      setupSource: "history-0",
      planChoice: "recommend",
      planSource: "history-2",
      networkChoice: "explicit",
      networkSource: "current",
      networkEvidence: "203.0.113.0/24",
    },
    "en",
  );
  expect(result.questions).toEqual([]);
  const before = compileCommonConfiguration(draft);
  const after = compileCommonConfiguration(
    applyAssistantChanges(draft, result.changes),
  );
  expect(after.devops).toEqual({
    git_flavor: "git-100",
    allowed_network_ranges: ["203.0.113.0/24"],
  });
  expect({ ...after, devops: before.devops }).toEqual(before);
});

it.each(["invented", "negated-public", "earlier-firewall"])(
  "keeps access unresolved for %s evidence",
  (kind) => {
    const { inputs } = fixture(
      kind === "negated-public"
        ? "Do not use 0.0.0.0/0."
        : "Use the company standard.",
      [
        { role: "user", content: "Firewall network 203.0.113.0/24" },
        { role: "assistant", content: "Firewall question" },
        { role: "user", content: "Please add central Git" },
      ],
    );
    const result = gitSetupDialogue(
      inputs,
      {
        ...empty,
        setupSource: "history-2",
        planChoice: "recommend",
        planSource: "current",
        networkChoice: kind === "negated-public" ? "public" : "explicit",
        networkSource: kind === "earlier-firewall" ? "history-0" : "current",
        networkEvidence:
          kind === "negated-public" ? "0.0.0.0/0" : "203.0.113.0/24",
      },
      "en",
    );
    expect(result.changes).toEqual([]);
    expect(result.questions.map((q) => q.path)).toEqual([
      "devops.allowed_network_ranges",
    ]);
  },
);

it("reuses an actual saved narrow allowlist only after selection", () => {
  const { values } = fixture(
    "Use the recommendation and reuse Observability access",
  );
  values.observability = { acl: ["203.0.113.0/24"] };
  const inputs = gitDialogueInputs(
    values,
    [],
    "Use the recommendation and reuse Observability access",
    { regions: [] },
  );
  const result = gitSetupDialogue(
    inputs,
    {
      ...empty,
      planChoice: "recommend",
      planSource: "current",
      networkChoice: "observability",
      networkSource: "current",
    },
    "en",
  );
  expect(result.changes[0]?.value.allowed_network_ranges).toEqual([
    "203.0.113.0/24",
  ]);
  expect(gitSetupDialogue(inputs, empty, "en").changes).toEqual([]);
});

it("uses explicit UI language despite German history and model language metadata", async () => {
  const { values } = fixture("Please add central Git");
  const knowledge = buildAssistantKnowledge();
  const requests: Record<string, unknown>[] = [];
  const model = new AssistantModelServing(
    {
      baseUrl:
        "https://api.openai-compat.model-serving.eu01.onstackit.cloud/v1",
      model: "test-model",
      token: "test-token",
      timeoutMs: 1000,
    },
    async (_url, init) => {
      const body = JSON.parse(String(init?.body));
      requests.push(body);
      const answer =
        body.response_format.json_schema.name === "conversation_intent"
          ? {
              topic: "devops-git",
              mode: "draft",
              requirements: [],
              applicationAccessLanguage: "de",
            }
          : empty;
      return new Response(
        JSON.stringify({
          choices: [
            {
              finish_reason: "stop",
              message: { role: "assistant", content: JSON.stringify(answer) },
            },
          ],
        }),
        { headers: { "Content-Type": "application/json" } },
      );
    },
  );
  const result = await model.converse(
    {
      engineRevision: knowledge.engineRevision,
      knowledgeSha256: knowledge.sha256,
      groups: knowledge.groups,
    },
    { ...values, "assistant.language": "en" },
    [{ role: "assistant", content: "Welche Git-Größe?" }],
    "Please add a central git instance to the config",
  );
  expect(JSON.stringify(result)).not.toMatch(/Welche|Noch nichts|Größe/);
  expect(result.questions[0]?.options?.[0]).toContain("Git100");
  expect(requests).toHaveLength(2);
  expect(JSON.stringify(requests)).toContain("user selected English");
});

it("does not recommend or offer a plan absent from an available project catalogue", () => {
  const { values } = fixture("Use a standard Git");
  const inputs = gitDialogueInputs(values, [], "Use a standard Git", {
    regions: [
      {
        region: "eu01",
        fetchedAt: null,
        products: {
          gitFlavors: {
            status: "available",
            options: [{ value: "git-10", label: "Small" }],
            totalOptions: 1,
            truncated: false,
          },
        },
      },
    ],
  });
  const result = gitSetupDialogue(inputs, empty, "en");
  expect(
    result.questions[0]?.options.some((option) => option.startsWith("Git100")),
  ).toBe(false);
  expect(
    gitSetupDialogue(
      inputs,
      { ...empty, planChoice: "recommend", planSource: "current" },
      "en",
    ).explanation,
  ).toContain("Starting size selected: Git10");
});

it("asks for concrete addresses after the user chooses to provide them, without repeating the access menu", () => {
  const { inputs } = fixture(
    "Use the company standard. I will provide specific source IPs or CIDRs.",
  );
  const result = gitSetupDialogue(
    inputs,
    {
      ...empty,
      planChoice: "recommend",
      planSource: "current",
      networkChoice: "explicit",
      networkSource: "current",
    },
    "en",
  );
  expect(result.questions).toHaveLength(1);
  expect(result.questions[0]?.options).toEqual([]);
  expect(result.questions[0]?.text).toContain("public egress");
});

it("does not take a quoted example network as the user's access decision", () => {
  const { inputs } = fixture(
    "Use the standard Git. Who can connect (example 203.0.113.0/24)?\nMy answer: company networks only.",
  );
  const result = gitSetupDialogue(
    inputs,
    {
      ...empty,
      planChoice: "recommend",
      planSource: "current",
      networkChoice: "explicit",
      networkSource: "current",
      networkEvidence: "203.0.113.0/24",
    },
    "en",
  );
  expect(result.changes).toEqual([]);
});

it("permits deliberate public reachability only with literal positive user evidence", () => {
  const { inputs } = fixture(
    "Use Git100. Public reachability (0.0.0.0/0); Git authentication still required.",
  );
  const result = gitSetupDialogue(
    inputs,
    {
      ...empty,
      planChoice: "git-100",
      planSource: "current",
      networkChoice: "public",
      networkSource: "current",
      networkEvidence: "0.0.0.0/0",
    },
    "en",
  );
  expect(result.changes[0]?.value.allowed_network_ranges).toEqual([
    "0.0.0.0/0",
  ]);
});

it("resolves an explicit saved-allowlist choice even when the model asks for company networks", () => {
  const { values } = fixture(
    "Use the recommended company-wide standard and reuse the Observability allowlist for Git.",
  );
  values.observability = { acl: ["203.0.113.0/24"] };
  const inputs = gitDialogueInputs(
    values,
    [],
    "Use the recommended company-wide standard and reuse the Observability allowlist for Git.",
    { regions: [] },
  );
  const result = gitSetupDialogue(
    inputs,
    {
      ...empty,
      planChoice: "recommend",
      planSource: "current",
      networkChoice: "company-networks",
      networkSource: "current",
    },
    "en",
  );
  expect(result.questions).toEqual([]);
  expect(result.changes[0]?.value).toEqual({
    git_flavor: "git-100",
    allowed_network_ranges: ["203.0.113.0/24"],
  });
  const denied = gitDialogueInputs(
    values,
    [],
    "Do not reuse the Observability allowlist.",
    { regions: [] },
  );
  expect(gitSetupDialogue(denied, empty, "en").changes).toEqual([]);
});
