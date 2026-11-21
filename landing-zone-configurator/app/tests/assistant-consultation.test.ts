import { randomUUID } from "node:crypto";
import {
  compileCommonConfiguration,
  createCommonConfiguration,
} from "@lzc/domain";
import { expect, it, vi } from "vitest";
import {
  type ConsultationState,
  consultationNativeDefault,
} from "../apps/api/src/assistant/consultation.js";
import {
  applyAssistantChanges,
  type Dialogue,
} from "../apps/api/src/assistant/dialogue.js";
import { buildAssistantKnowledge } from "../apps/api/src/assistant/knowledge.js";
import {
  type AssistantCatalogueContext,
  AssistantModelServing,
} from "../apps/api/src/assistant/model-serving.js";
import { assistantPublicValues } from "../apps/api/src/assistant/service.js";

import {
  assistantScenarioFixture,
  assistantScenarios,
} from "../scripts/assistant-scenarios.js";

import {
  logicalFixtureRequest,
  nativeStepResponse,
} from "./helpers/native-assistant.js";

const configuration = {
  baseUrl: "https://api.openai-compat.model-serving.eu01.onstackit.cloud/v1",
  model: "test-model",
  token: "test-only",
  timeoutMs: 1000,
};
const knowledge = buildAssistantKnowledge();
const selection = {
  engineRevision: knowledge.engineRevision,
  knowledgeSha256: knowledge.sha256,
  groups: knowledge.groups,
};
const memory = {
  goal: "Company Git for approximately 80 developers in the existing Hub-and-Spoke platform",
  decisions: [],
  openQuestions: [],
};
const final = (extra: Record<string, unknown> = {}) => ({
  action: "answer",
  kind: "advice",
  explanation: "Reviewed advice; nothing saved or deployed.",
  questions: [],
  references: ["configuration-lifecycle"],
  proposal: null,
  memory,
  activeTopics: [],
  ...extra,
});
type Request = {
  messages: { role: string; content: string }[];
  response_format: { type: string };
};
function model(
  steps: ((request: Request) => unknown)[],
  reviewSteps: ((request: Request) => unknown)[] = [],
) {
  let index = 0;
  let reviewIndex = 0;
  const request = vi.fn<typeof fetch>(async (_url, init) => {
    const raw = JSON.parse(String(init?.body));
    const reviewRequest = raw.messages.some(
      (message: { role: string; content: string }) =>
        message.role === "user" &&
        message.content.includes('"task":"review_final_response"'),
    );
    const body = (reviewRequest ? raw : logicalFixtureRequest(raw)) as Request;
    expect(
      raw.messages.filter(
        (message: { role: string }) => message.role === "system",
      ),
    ).toHaveLength(1);
    if (reviewRequest)
      expect(raw.response_format).toMatchObject({
        type: "json_schema",
        json_schema: { name: "assistant_consultation_review", strict: true },
      });
    else {
      expect(raw.response_format).toBeUndefined();
      expect(raw.tools).toHaveLength(9);
      expect(raw.messages[0].content).toContain("NATIVE_CONSULTATION_PROTOCOL");
    }
    const review = body.messages.some(
      (message) =>
        message.role === "user" &&
        message.content.includes('"task":"review_final_response"'),
    );
    if (review) {
      const result = reviewSteps[reviewIndex++]?.(body) ?? {
        ready: true,
        findings: [],
      };
      if (result instanceof Response) return result;
      const reviewPayload = JSON.parse(
        body.messages.find((message) => message.role === "user")!.content,
      );
      const reviewedResult = {
        boundaryChecks: Object.values(
          JSON.parse(
            body.messages.find((message) => message.role === "user")!.content,
          ).relevantServiceFacts ?? {},
        ).flatMap((fact) =>
          (
            (fact as { criticalBoundaries?: { id: string }[] })
              .criticalBoundaries ?? []
          ).map(({ id }) => ({
            id,
            applicable: false,
            covered: false,
            paragraphs: [],
          })),
        ),
        requestChecks: [
          {
            userTurn: reviewPayload.turns.findLastIndex(
              (turn: { role: string }) => turn.role === "user",
            ),
            requirement: "Requested scoped task",
            expected: "Requested scoped task",
            actual: "Mocked scoped result",
            resolution: reviewPayload.answer.questions.length
              ? "clarification"
              : reviewPayload.answer.compilerDelta?.length ||
                  reviewPayload.answer.changes?.length
                ? "proposed"
                : "advice",
            questionIndices: reviewPayload.answer.questions.length ? [0] : [],
            met: true,
          },
        ],
        ...result,
      };
      return Response.json({
        model: configuration.model,
        choices: [
          {
            finish_reason: "stop",
            message: {
              role: "assistant",
              content: JSON.stringify(reviewedResult),
            },
          },
        ],
      });
    }
    const step = steps[index++];
    if (!step) throw new Error("Unexpected additional inference round");
    return Response.json(nativeStepResponse(step(body), configuration.model));
  });
  return { client: new AssistantModelServing(configuration, request), request };
}
const lastResult = (body: Request) => JSON.parse(body.messages.at(-1)!.content);
it.each([
  ["audit-logs", "audit_logs.acl"],
  ["observability", "observability.acl"],
  ["devops-git", "devops.allowed_network_ranges"],
])(
  "renders canonical source choices for %s without making the model reproduce labels or adopting a value",
  async (topic, path) => {
    const { client } = model([
      () => ({
        action: "inspect",
        requests: [{ tool: "knowledge", topics: [topic] }],
      }),
      () =>
        final({
          references: [topic],
          questions: [
            {
              path,
              text: "Who should be able to reach the service?",
              options: ["Private SNA only", "A guessed source network"],
            },
          ],
        }),
    ]);
    const answer = await client.converse(
      selection,
      {
        region: "eu01",
        observability: { acl: ["203.0.113.0/24"] },
        "assistant.language": "en",
      },
      [],
      "Help me choose source access for this service.",
    );
    const question = answer.questions[0]!;
    expect(question.text).toBe("Who should be able to reach the service?");
    expect(
      question.options?.some((option) =>
        option.startsWith("Use Accelerator default"),
      ),
    ).toBe(true);
    expect(question.options).toContain(
      "Use saved observability.acl (203.0.113.0/24)",
    );
    expect(question.options?.join(" ")).not.toMatch(/Private SNA|guessed/);
    expect(answer.changes).toEqual([]);
  },
);
it("sources owner picker options from the scoped application instead of model-written addresses", async () => {
  const { client } = model([
    () => ({
      action: "inspect",
      requests: [{ tool: "knowledge", topics: ["project-templates"] }],
    }),
    () =>
      final({
        references: ["project-templates"],
        questions: [
          {
            path: "projectTemplates.central.accessProfile.initialOwnerEmail",
            text: "Which initial owner should we use?",
            options: ["foreign@example.test"],
          },
        ],
      }),
  ]);
  const answer = await client.converse(
    selection,
    {
      "assistant.language": "en",
      "assistant.platform_service_account_emails": [
        "bootstrap-platform@sa.stackit.cloud",
      ],
      projectTemplates: {
        central: {
          kind: "corporate",
          settings: {},
          accessProfile: {
            schemaVersion: 1,
            mode: "granular",
            initialOwnerEmail: "",
            permissions: [],
            automationPermissions: [],
          },
        },
      },
    },
    [],
    "Help me select an initial owner for central.",
  );
  expect(answer.questions[0]?.options).toEqual([
    "Platform service account (bootstrap-platform@sa.stackit.cloud)",
    "Provide another email address",
  ]);
  expect(answer.changes).toEqual([]);
});
it("continues staged decision calls and reviews the complete public question list only at the end", async () => {
  const { client, request } = model([
    () => ({
      action: "inspect",
      requests: [{ tool: "knowledge", topics: ["configuration-lifecycle"] }],
    }),
    () =>
      final({
        finish: false,
        questions: [{ path: "company_name", text: "Which company name?" }],
      }),
    (body) => {
      expect(lastResult(body).questionStaging).toMatchObject({
        ok: true,
        pendingCount: 1,
      });
      return final({
        finish: false,
        questions: [{ path: "company_code", text: "Which company prefix?" }],
      });
    },
    (body) => {
      expect(lastResult(body).questionStaging).toMatchObject({
        ok: true,
        pendingCount: 2,
      });
      return final();
    },
  ]);
  const answer = await client.converse(
    selection,
    {},
    [],
    "Help me choose company basics.",
  );
  expect(answer.questions.map((question) => question.path)).toEqual([
    "company_name",
    "company_code",
  ]);
  expect(request).toHaveBeenCalledTimes(5);
});
it("delivers immutable schemas and service contracts once while preserving scoped reads and source references", async () => {
  const fixture = assistantScenarioFixture(
    assistantScenarios.find(
      (entry) => entry.id === "application-access-owner-already-covered",
    )!,
  );
  const read = {
    action: "inspect",
    requests: [
      {
        tool: "configuration",
        paths: ["projectTemplates.central.accessProfile"],
      },
    ],
  };
  const { client } = model([
    () => ({
      action: "inspect",
      requests: [{ tool: "knowledge", topics: ["project-templates"] }],
    }),
    (body) => {
      expect(
        lastResult(body).toolResults[0].result.applicationAccess,
      ).toBeDefined();
      return read;
    },
    (body) => {
      const first = lastResult(body).toolResults[0].result;
      expect(first.templateProposalSchema).toBeDefined();
      expect(first.knowledge.serviceFactReferences).toContain(
        "project-templates",
      );
      expect(first.knowledge.serviceFacts["project-templates"]).toBeUndefined();
      expect(first.knowledge.applicationAccess).toBeUndefined();
      return read;
    },
    (body) => {
      const repeated = lastResult(body).toolResults[0].result;
      expect(repeated.templateProposalSchema).toBeUndefined();
      expect(repeated.schemaReferences).toEqual(["projectTemplates"]);
      expect(repeated.values["projectTemplates.central.accessProfile"]).toEqual(
        { schemaVersion: 1, mode: "owner" },
      );
      return final({ references: ["project-templates"] });
    },
  ]);
  await client.converse(
    selection,
    fixture.values,
    [],
    "Explain the existing template profile.",
  );
});
it("extends only a validated local proposal and retains both principals across sequential tools", async () => {
  const fixture = assistantScenarioFixture(
    assistantScenarios.find(
      (entry) =>
        entry.id === "application-server-operations-permissions-proposal",
    )!,
  );
  let base = "";
  const addition = (service: string, principal: string) => ({
    path: "projectTemplates",
    operation: "add_permissions",
    value: {
      templateKeys: ["central"],
      principals: [principal],
      source: { kind: "services", ids: [service] },
    },
  });
  const { client } = model([
    () => ({
      action: "inspect",
      requests: [{ tool: "knowledge", topics: ["project-templates"] }],
    }),
    () => ({
      action: "validate_proposal",
      changes: [addition("server-backup", "requester")],
    }),
    (body) => {
      expect(lastResult(body).validation).toMatchObject({ ok: true });
      base = lastResult(body).validation.proposal;
      return {
        action: "validate_proposal",
        baseProposal: "unissued-proposal",
        changes: [addition("server-update", "automation")],
      };
    },
    (body) => {
      expect(lastResult(body).validation.code).toBe(
        "assistant_unknown_base_proposal",
      );
      return {
        action: "validate_proposal",
        baseProposal: base,
        changes: [addition("server-update", "automation")],
      };
    },
    (body) =>
      final({
        kind: "proposal",
        proposal: lastResult(body).validation.proposal,
        references: ["project-templates"],
      }),
  ]);
  const result = await client.converse(
    selection,
    fixture.values,
    [],
    "Add server-backup rights for the requester and server-update rights for automation in central.",
    undefined,
    [],
    undefined,
    {
      validateChanges: (changes) =>
        assistantPublicValues(applyAssistantChanges(fixture.draft, changes)),
    },
  );
  const candidate = applyAssistantChanges(fixture.draft, result.changes);
  const actual = candidate.projectTemplates!.find(
    (t) => t.key === "central",
  )!.accessProfile;
  const original = fixture.draft.projectTemplates!.find(
    (t) => t.key === "central",
  )!.accessProfile;
  if (actual?.mode !== "granular" || original?.mode !== "granular")
    throw Error("fixture");
  expect(actual.permissions).toContain("server-backup.backup.create");
  expect(actual.automationPermissions).toContain(
    "server-update.update-schedule.create",
  );
  expect(actual.permissions).not.toContain(
    "server-update.update-schedule.create",
  );
  expect(actual.automationPermissions).not.toContain(
    "server-backup.backup.create",
  );
  expect(actual.initialOwnerEmail).toBe(original.initialOwnerEmail);
});
const catalogues: AssistantCatalogueContext = {
  regions: [
    {
      region: "eu01",
      fetchedAt: null,
      products: {
        gitFlavors: {
          status: "available",
          options: [
            { value: "git-10", label: "Git10" },
            { value: "git-100", label: "Git100" },
          ],
          totalOptions: 2,
          truncated: false,
        },
      },
    },
  ],
};

it("reads actual nested Accelerator defaults even when the parent defaults to null", () => {
  expect(consultationNativeDefault("devops")).toMatchObject({
    found: true,
    value: null,
  });
  expect(
    consultationNativeDefault("devops.allowed_network_ranges"),
  ).toMatchObject({ found: true, value: ["0.0.0.0/0"] });
  expect(() =>
    consultationNativeDefault("firewall_bootstrap_password"),
  ).toThrow("assistant_protected_value");
  expect(() =>
    consultationNativeDefault("devops.__proto__.anything"),
  ).toThrow();
});
it("finishes the complete Hub-and-Spoke/80-developer/default-access dialogue without another question", async () => {
  const draft = createCommonConfiguration(
    "hub-and-spoke-finance-research",
    randomUUID(),
  );
  const baseline = compileCommonConfiguration(draft);
  const history = [
    {
      role: "user" as const,
      content:
        "We use a Hub-and-Spoke landing zone. Please add a central company Git for round about 80 developers.",
    },
    {
      role: "assistant" as const,
      content:
        "Git100 fits 80 developers; Git10 allows only 10. Who should reach Git?",
    },
    {
      role: "user" as const,
      content: "Company/VPN public egress networks only (recommended)",
    },
    {
      role: "assistant" as const,
      content:
        "Which actual client source IP addresses or CIDRs should be allowed?",
    },
  ];
  const message = "My answer: please use the default";
  const changes = [
    {
      path: "devops",
      operation: "merge" as const,
      value: { git_flavor: "git-100", allowed_network_ranges: ["0.0.0.0/0"] },
    },
  ];
  const texts: string[] = [];
  let state: ConsultationState | undefined;
  const { client, request } = model([
    (body) => {
      const context = JSON.parse(body.messages.at(-1)!.content);
      expect(context.turns[0].content).toContain("80 developers");
      expect(context.request).toBe(message);
      return {
        action: "inspect",
        requests: [
          { tool: "knowledge", topics: ["devops-git"] },
          { tool: "configuration", paths: ["devops", "connectivity"] },
          { tool: "default", path: "devops.allowed_network_ranges" },
          { tool: "catalogue", path: "devops.git_flavor", region: "eu01" },
        ],
      };
    },
    (body) => {
      const defaults = lastResult(body).toolResults[2].result;
      expect(defaults.value).toEqual(["0.0.0.0/0"]);
      return {
        action: "validate_proposal",
        changes,
        basis: [
          {
            path: "devops.allowed_network_ranges",
            defaultPath: defaults.id,
            evidence: { turn: 4, quote: "please use the default" },
          },
        ],
      };
    },
    (body) => {
      const validated = lastResult(body).validation;
      expect(validated).toMatchObject({ ok: true, changes });
      return final({
        kind: "proposal",
        proposal: validated.proposal,
        references: ["devops-git"],
        activeTopics: ["devops-git"],
        explanation:
          "For your central company Git and 80 developers I recommend Git100 (up to 100 users); Git10 supports only 10. Access uses the Accelerator default 0.0.0.0/0: public IPv4 reachability with Git login still required. Your Hub-and-Spoke settings remain as configured. This is a proposal only.",
        memory: {
          ...memory,
          decisions: [
            {
              key: "git.users",
              summary: "Approximately 80 developers",
              status: "confirmed",
              evidence: { turn: 0, quote: "round about 80 developers" },
            },
            {
              key: "git.access",
              summary: "Use the Accelerator default",
              status: "confirmed",
              evidence: { turn: 4, quote: "please use the default" },
            },
          ],
        },
      });
    },
  ]);
  const result = await client.converse(
    selection,
    { ...assistantPublicValues(draft), "assistant.language": "en" },
    history,
    message,
    catalogues,
    [],
    { onText: (text) => texts.push(text) },
    {
      onState: (value) => {
        state = value;
      },
      validateChanges: async (proposed) => {
        applyAssistantChanges(draft, proposed);
      },
    },
  );
  expect(request).toHaveBeenCalledTimes(4);
  expect(result.questions).toEqual([]);
  expect(result.changes).toEqual(changes);
  expect(result.explanation).toContain("80 developers");
  expect(result.explanation).toContain("Accelerator default 0.0.0.0/0");
  expect(result.defaults).toEqual([
    {
      path: "devops.allowed_network_ranges",
      value: ["0.0.0.0/0"],
      source: "accelerator",
    },
  ]);
  expect(result.explanation).not.toContain("Choose a starting option");
  expect(texts).toEqual([result.explanation]);
  const candidate = compileCommonConfiguration(
    applyAssistantChanges(draft, result.changes),
  );
  expect(candidate.devops).toEqual({
    git_flavor: "git-100",
    allowed_network_ranges: ["0.0.0.0/0"],
  });
  expect(candidate.connectivity).toEqual(baseline.connectivity);
  expect(state?.memory.decisions).toHaveLength(2);
});
it.each(knowledge.topics.map((topic) => topic.id))(
  "delivers scoped %s facts through the shared knowledge tool",
  async (topic) => {
    const { client } = model([
      () => ({
        action: "inspect",
        requests: [{ tool: "knowledge", topics: [topic] }],
      }),
      (body) => {
        const result = lastResult(body).toolResults[0].result;
        const initial = JSON.parse(
          body.messages.find((message) => message.role === "user")!.content,
        );
        expect(
          [...initial.knowledge.rules, ...result.rules].some(
            (rule: { id: string; text: string }) =>
              rule.id === topic && rule.text.length > 0,
          ),
        ).toBe(true);
        expect(result.ruleReferences).toContain(topic);
        expect(
          result.topics.some((entry: { id: string }) => entry.id === topic),
        ).toBe(true);
        return final({ references: [topic], activeTopics: [topic] });
      },
    ]);
    expect(
      (await client.converse(selection, {}, [], "Explain this component."))
        .changes,
    ).toEqual([]);
  },
);
it("returns proposal-validation feedback to the model and preserves its corrected explanation", async () => {
  const { client } = model([
    () => ({
      action: "inspect",
      requests: [
        { tool: "knowledge", topics: ["devops-git"] },
        { tool: "catalogue", path: "devops.git_flavor", region: "eu01" },
      ],
    }),
    () => ({
      action: "validate_proposal",
      changes: [
        {
          path: "devops",
          operation: "merge",
          value: {
            git_flavor: "invented-plan",
            allowed_network_ranges: ["203.0.113.0/24"],
          },
        },
      ],
      basis: [],
    }),
    (body) => {
      expect(lastResult(body).validation.ok).toBe(false);
      return {
        action: "validate_proposal",
        changes: [
          {
            path: "devops",
            operation: "merge",
            value: {
              git_flavor: "git-100",
              allowed_network_ranges: ["203.0.113.0/24"],
            },
          },
        ],
        basis: [],
      };
    },
    (body) =>
      final({
        kind: "proposal",
        proposal: lastResult(body).validation.proposal,
        references: ["devops-git"],
        explanation:
          "Git100 fits the requested scope. Access is restricted to your supplied 203.0.113.0/24. Nothing has been saved.",
      }),
  ]);
  const result = await client.converse(
    selection,
    { region: "eu01" },
    [],
    "Add Git for 80 developers, allowing 203.0.113.0/24.",
    catalogues,
  );
  expect(result.changes[0]?.value).toEqual({
    git_flavor: "git-100",
    allowed_network_ranges: ["203.0.113.0/24"],
  });
  expect(result.explanation).toContain("fits the requested scope");
});
it("does not publish provisional model prose or accept fabricated default evidence", async () => {
  const state = vi.fn();
  const text = vi.fn();
  const { client } = model([
    () => ({
      action: "inspect",
      requests: [
        { tool: "knowledge", topics: ["devops-git"] },
        { tool: "default", path: "devops.allowed_network_ranges" },
      ],
    }),
    () => ({
      action: "validate_proposal",
      changes: [
        {
          path: "devops",
          operation: "merge",
          value: {
            git_flavor: "git-100",
            allowed_network_ranges: ["0.0.0.0/0"],
          },
        },
      ],
      basis: [
        {
          path: "devops.allowed_network_ranges",
          defaultPath: "devops.allowed_network_ranges",
          evidence: { turn: 0, quote: "use the default" },
        },
      ],
    }),
    (body) => {
      expect(lastResult(body).validation).toMatchObject({
        ok: false,
        code: "assistant_default_evidence_invalid",
      });
      return final({
        kind: "clarification",
        references: ["devops-git"],
        questions: [
          {
            path: "devops.allowed_network_ranges",
            text: "Which access policy should I use?",
            answerType: "requirements",
            options: [
              "Use Accelerator default (0.0.0.0/0)",
              "Provide company/VPN public egress IPs or CIDRs",
            ],
          },
        ],
      });
    },
  ]);
  const result = await client.converse(
    selection,
    { region: "eu01" },
    [],
    "Please add Git.",
    catalogues,
    [],
    { onText: text },
    { onState: state },
  );
  expect(result.changes).toEqual([]);
  expect(text).toHaveBeenCalledTimes(1);
  expect(text).toHaveBeenCalledWith(result.explanation);
  expect(state).toHaveBeenCalledTimes(1);
});
it.each(["firewall_bootstrap_password", "vpn_pre_shared_keys", "__proto__"])(
  "cannot expose protected or unregistered configuration root %s",
  async (root) => {
    const { client } = model([
      () => ({
        action: "inspect",
        requests: [{ tool: "configuration", paths: [root] }],
      }),
      (body) => {
        expect(lastResult(body).toolResults[0].error).toMatchObject({
          code: "assistant_invalid_scope",
        });
        return final();
      },
    ]);
    await client.converse(selection, {}, [], "Explain the configuration.");
  },
);
it("carries a source-bound brief into the next turn and rejects stale or fabricated confirmed memory", async () => {
  const state: ConsultationState = {
    version: 1,
    knowledgeHash: knowledge.sha256,
    topics: ["devops-git"],
    memory: {
      ...memory,
      decisions: [
        {
          key: "git.users",
          summary: "80 developers",
          status: "confirmed",
          evidence: { turn: 0, quote: "80 developers" },
        },
      ],
    },
  };
  const history = [
    { role: "user" as const, content: "Please add Git for 80 developers." },
  ];
  for (const [previous, expected] of [
    [state, state.memory],
    [{ ...state, knowledgeHash: "a".repeat(64) }, null],
    [
      {
        ...state,
        memory: {
          ...state.memory,
          decisions: [
            {
              ...state.memory.decisions[0]!,
              evidence: { turn: 0, quote: "invented consent" },
            },
          ],
        },
      },
      null,
    ],
  ] as const) {
    const { client } = model([
      (body) => {
        expect(JSON.parse(body.messages.at(-1)!.content).previousBrief).toEqual(
          expected,
        );
        return final();
      },
    ]);
    await client.converse(
      selection,
      {},
      history,
      "Continue.",
      undefined,
      [],
      undefined,
      { state: previous },
    );
  }
});

it("feeds a resolved catalogue decision back to the model instead of rendering its redundant selection question", async () => {
  const { client } = model([
    () => ({
      action: "inspect",
      requests: [
        { tool: "knowledge", topics: ["devops-git"] },
        {
          tool: "catalogue",
          path: "devops.git_flavor",
          region: "eu01",
          requirements: [
            {
              metric: "users",
              minimum: 80,
              evidence: { turn: 0, quote: "80 developers" },
            },
          ],
        },
      ],
    }),
    (body) => {
      expect(
        lastResult(body).toolResults[1].result.decisionSupport.recommendation,
      ).toBe("git-100");
      return final({
        kind: "clarification",
        references: ["devops-git"],
        questions: [
          {
            path: "devops.git_flavor",
            text: "Which Git plan?",
            answerType: "catalogue",
            options: ["git-10", "git-100"],
          },
        ],
      });
    },
    (body) => {
      expect(lastResult(body).answerValidation.code).toBe(
        "decision_already_resolved",
      );
      return final({
        kind: "clarification",
        references: ["devops-git"],
        explanation:
          "Git100 fits 80 developers. Git10 supports only 10 users; Git100 supports 100. Choose access settings; nothing saved.",
        questions: [
          {
            path: "devops.allowed_network_ranges",
            text: "Which access policy?",
            answerType: "requirements",
            options: [
              "Use Accelerator default (0.0.0.0/0)",
              "Provide company/VPN public egress IPs or CIDRs",
            ],
          },
        ],
      });
    },
  ]);
  const result = await client.converse(
    selection,
    { region: "eu01" },
    [],
    "Please add Git for 80 developers.",
    catalogues,
  );
  expect(result.questions.map((question) => question.path)).toEqual([
    "devops.allowed_network_ranges",
  ]);
});
it("repairs an invalid tool envelope within the bounded protocol instead of failing the user immediately", async () => {
  const { client } = model([
    () => ({ explanation: "Here is a promise without the tool envelope." }),
    (body) => {
      expect(lastResult(body).protocolValidation.ok).toBe(false);
      return final();
    },
  ]);
  expect(
    (await client.converse(selection, {}, [], "Explain the workflow.")).changes,
  ).toEqual([]);
});
it("materializes omitted access from its source and exposes it for proposal review", async () => {
  const { client } = model([
    () => ({
      action: "inspect",
      requests: [{ tool: "knowledge", topics: ["devops-git"] }],
    }),
    () => ({
      action: "validate_proposal",
      changes: [
        {
          path: "devops",
          operation: "merge",
          value: { git_flavor: "git-100" },
        },
      ],
      basis: [],
    }),
    (body) => {
      expect(lastResult(body).validation).toMatchObject({ ok: true });
      return final({
        kind: "proposal",
        proposal: lastResult(body).validation.proposal,
        references: ["devops-git"],
        explanation:
          "Git100 with the Accelerator default permitting any IPv4 address, proposed for review. Nothing saved.",
      });
    },
  ]);
  const answer = await client.converse(
    selection,
    {},
    [],
    "Add Git for 80 developers.",
  );
  expect(answer.changes[0]?.value).toEqual({
    git_flavor: "git-100",
    allowed_network_ranges: ["0.0.0.0/0"],
  });
  expect(answer.defaults).toContainEqual({
    path: "devops.allowed_network_ranges",
    value: ["0.0.0.0/0"],
    source: "accelerator",
  });
});

it("does not retry an HTTP response rejection or publish conversational state on failure", async () => {
  const request = vi.fn<typeof fetch>(async () =>
    Response.json({ error: { code: "test" } }, { status: 400 }),
  );
  const onState = vi.fn();
  await expect(
    new AssistantModelServing(configuration, request).converse(
      selection,
      {},
      [],
      "Explain Git.",
      undefined,
      [],
      undefined,
      { onState },
    ),
  ).rejects.toMatchObject({ reason: "upstream_status_400" });
  expect(request).toHaveBeenCalledTimes(1);
  expect(onState).not.toHaveBeenCalled();
});

it("uses native default facts supplied by shared knowledge without a redundant lookup", async () => {
  const changes = [
    {
      path: "devops",
      operation: "merge" as const,
      value: { git_flavor: "git-100", allowed_network_ranges: ["0.0.0.0/0"] },
    },
  ];
  const { client } = model([
    () => ({
      action: "inspect",
      requests: [{ tool: "knowledge", topics: ["devops-git"] }],
    }),
    (body) => {
      expect(
        lastResult(body).toolResults[0].result.decisionOptions[
          "devops.allowed_network_ranges"
        ][0],
      ).toMatchObject({
        source: "devops.allowed_network_ranges",
        value: ["0.0.0.0/0"],
      });
      return {
        action: "validate_proposal",
        changes,
        basis: [
          {
            path: "devops.allowed_network_ranges",
            defaultPath: "devops.allowed_network_ranges",
            evidence: { turn: 0, quote: "use the default" },
          },
        ],
      };
    },
    (body) => {
      expect(lastResult(body).validation).toMatchObject({ ok: true });
      return final({
        kind: "proposal",
        proposal: lastResult(body).validation.proposal,
        references: ["devops-git"],
        activeTopics: ["devops-git"],
      });
    },
  ]);
  expect(
    (
      await client.converse(
        selection,
        {},
        [],
        "Add company Git100; use the default for access.",
      )
    ).changes,
  ).toEqual(changes);
});
it("distinguishes an optional omitted service default from an invented concrete retention", () => {
  expect(
    consultationNativeDefault("observability.metrics_retention_days"),
  ).toMatchObject({ found: true, value: null });
  expect(
    consultationNativeDefault("connectivity.dns_zones.company.default_ttl"),
  ).toMatchObject({ found: true, value: 3600 });
});

it("proposes an authoritative native default with visible provenance, without calling it user consent", async () => {
  const { client } = model([
    () => ({
      action: "inspect",
      requests: [{ tool: "knowledge", topics: ["devops-git"] }],
    }),
    () => ({
      action: "validate_proposal",
      basis: [],
      changes: [
        {
          path: "devops",
          operation: "merge",
          value: {
            git_flavor: "git-100",
            allowed_network_ranges: ["0.0.0.0/0"],
          },
        },
      ],
    }),
    (body) => {
      expect(lastResult(body).validation).toMatchObject({
        ok: true,
      });
      return final({
        kind: "proposal",
        proposal: lastResult(body).validation.proposal,
        references: ["devops-git"],
        activeTopics: ["devops-git"],
        explanation:
          "Git100 is proposed with the Accelerator access default: any IPv4 address. Review before accepting; nothing saved or deployed.",
      });
    },
  ]);
  const answer = await client.converse(
    selection,
    { devops: null, observability: { acl: ["0.0.0.0/0"] } },
    [],
    "Add Git100 using a reasonable starting configuration.",
  );
  expect(answer.changes).toMatchObject([
    {
      path: "devops",
      value: { git_flavor: "git-100", allowed_network_ranges: ["0.0.0.0/0"] },
    },
  ]);
  expect(answer.defaults).toEqual([
    {
      path: "devops.allowed_network_ranges",
      value: ["0.0.0.0/0"],
      source: "accelerator",
    },
  ]);
  expect(answer.questions).toHaveLength(0);
});

it("discovers and compiles an actual template permission union through shared tools", async () => {
  const fixture = assistantScenarioFixture(
    assistantScenarios.find(
      (scenario) =>
        scenario.id === "application-server-operations-permissions-proposal",
    )!,
  );
  const { client } = model([
    () => ({
      action: "inspect",
      requests: [
        { tool: "knowledge", topics: ["project-templates"] },
        {
          tool: "configuration",
          paths: ["projectTemplates.central.accessProfile"],
        },
      ],
    }),
    (body) => {
      const results = lastResult(body).toolResults;
      expect(results[0].error).toBeUndefined();
      expect(results[0].result.applicationAccess.proposalContract).toContain(
        "operation=union",
      );
      expect(results[1].error).toBeUndefined();
      expect(
        results[1].result.values["projectTemplates.central.accessProfile"]
          .initialOwnerEmail,
      ).toBe("platform-owner@example.test");
      return {
        action: "validate_proposal",
        basis: [],
        changes: [
          {
            path: "projectTemplates.central.accessProfile.permissions",
            operation: "union",
            value: { catalogueServices: ["server-backup"] },
          },
          {
            path: "projectTemplates.central.accessProfile.automationPermissions",
            operation: "union",
            value: { catalogueServices: ["server-backup"] },
          },
        ],
      };
    },
    (body) => {
      expect(lastResult(body).validation).toMatchObject({ ok: true });
      return final({
        kind: "proposal",
        proposal: lastResult(body).validation.proposal,
        references: ["project-templates"],
        activeTopics: ["project-templates"],
      });
    },
  ]);
  const result = await client.converse(
    selection,
    fixture.values,
    [],
    "Add server-backup permissions to both principals in central.",
    undefined,
    [],
    undefined,
    {
      validateChanges: (changes) => {
        applyAssistantChanges(fixture.draft, changes);
      },
    },
  );
  expect(result.changes).toHaveLength(1);
  expect(result.changes[0]?.path).toBe("projectTemplates");
});

it("limits whole-folder reads to names while preserving private access metadata in the actual draft", async () => {
  const { client, request } = model([
    () => ({
      action: "inspect",
      requests: [{ tool: "configuration", paths: ["rm_folders"] }],
    }),
    (body) => {
      expect(lastResult(body).toolResults[0].result.values.rm_folders).toEqual({
        platform: { name: "Platform" },
      });
      return final({
        references: ["governance-folders"],
        activeTopics: ["governance-folders"],
      });
    },
  ]);
  await client.converse(
    selection,
    {
      rm_folders: {
        platform: {
          name: "Platform",
          owner_emails: ["private-owner@example.invalid"],
          reader_emails: ["private-reader@example.invalid"],
        },
      },
    },
    [],
    "Suggest folder names only.",
  );
  expect(JSON.stringify(request.mock.calls)).not.toContain(
    "private-owner@example.invalid",
  );
  expect(JSON.stringify(request.mock.calls)).not.toContain(
    "private-reader@example.invalid",
  );
});

it("checks the actual answer against the full reviewed facts and corrects an omission before streaming or storing context", async () => {
  const text = vi.fn(),
    onState = vi.fn();
  const corrected =
    "STACKIT EU01 S3 conditional writes do not establish locking; the Configurator coordinates writers through PostgreSQL. Standalone writers need single-writer discipline.";
  const { client, request } = model(
    [
      () => ({
        action: "inspect",
        requests: [{ tool: "knowledge", topics: ["management-state"] }],
      }),
      () =>
        final({
          explanation: "S3 handles all locking automatically.",
          references: ["management-state"],
          activeTopics: ["management-state"],
        }),
      (body) => {
        expect(lastResult(body).answerReview.findings[0]).toContain(
          "PostgreSQL",
        );
        return final({
          explanation: corrected,
          references: ["management-state"],
          activeTopics: ["management-state"],
        });
      },
    ],
    [
      (body) => {
        const payload = JSON.parse(
          body.messages.find((message) => message.role === "user")!.content,
        );
        expect(JSON.stringify(payload.reviewedKnowledge)).toContain(
          "PostgreSQL",
        );
        expect(payload.answer.explanation).toBe(
          "S3 handles all locking automatically.",
        );
        expect(text).not.toHaveBeenCalled();
        expect(onState).not.toHaveBeenCalled();
        return {
          ready: false,
          findings: [
            "Explain PostgreSQL coordination and standalone single-writer limits; S3 does not enforce conditional writes.",
          ],
        };
      },
      () => ({ ready: true, findings: [] }),
    ],
  );
  const answer = await client.converse(
    selection,
    {},
    [],
    "Explain S3 state locking and Configurator coordination, advice only.",
    undefined,
    [],
    { onText: text },
    { onState },
  );
  expect(answer.explanation).toBe(corrected);
  expect(text.mock.calls).toEqual([[corrected]]);
  expect(onState).toHaveBeenCalledTimes(1);
  expect(request).toHaveBeenCalledTimes(5);
});
it("does not retry a rejected review HTTP response or publish the unreviewed answer", async () => {
  const onState = vi.fn(),
    text = vi.fn();
  const { client, request } = model(
    [() => final()],
    [() => Response.json({ error: "synthetic rejection" }, { status: 400 })],
  );
  await expect(
    client.converse(
      selection,
      {},
      [],
      "Explain the workflow.",
      undefined,
      [],
      { onText: text },
      { onState },
    ),
  ).rejects.toMatchObject({ reason: "upstream_status_400" });
  expect(request).toHaveBeenCalledTimes(2);
  expect(text).not.toHaveBeenCalled();
  expect(onState).not.toHaveBeenCalled();
});

it("does not turn malformed advisory memory or topic hints into a user-facing failure", async () => {
  const onState = vi.fn();
  const { client } = model(
    [
      () =>
        final({
          memory: "not a valid brief",
          activeTopics: ["invented-topic", 42],
        }),
    ],
    [() => ({ ready: true, findings: [], memory: { goal: 42 } })],
  );
  const answer = await client.converse(
    selection,
    {},
    [],
    "Explain the workflow without changes.",
    undefined,
    [],
    undefined,
    { onState },
  );
  expect(answer.changes).toEqual([]);
  expect(onState.mock.calls[0]?.[0].topics).toEqual([]);
  expect(onState.mock.calls[0]?.[0].memory.decisions).toEqual([]);
});

it("resolves template setting defaults through the actual native module contract", () => {
  const current = {
    projectTemplates: {
      central: { kind: "corporate", settings: { region: "eu02" } },
    },
  };
  const native = consultationNativeDefault("landing_zones[*].git.enabled");
  expect(
    consultationNativeDefault(
      "projectTemplates.central.settings.git.enabled",
      current,
    ),
  ).toEqual({
    ...native,
    path: "projectTemplates.central.settings.git.enabled",
    nativePath: "landing_zones[*].git.enabled",
  });
  expect(() =>
    consultationNativeDefault(
      "projectTemplates.central.accessProfile",
      current,
    ),
  ).toThrow("assistant_invalid_scope");
  expect(() =>
    consultationNativeDefault(
      "projectTemplates.unknown.settings.git.enabled",
      current,
    ),
  ).toThrow("assistant_invalid_scope");
});

it("retrieves actual State coordination facts even if the model selects a neighbouring lifecycle topic", async () => {
  const { client } = model([
    () => ({
      action: "inspect",
      requests: [{ tool: "knowledge", topics: ["configuration-lifecycle"] }],
    }),
    (body) => {
      const result = lastResult(body).toolResults[0].result;
      expect(result.retrieval.matched).toContain("management-state");
      expect(
        result.rules.some(
          (rule: { id: string; text: string }) =>
            rule.id === "management-state" && rule.text.includes("PostgreSQL"),
        ),
      ).toBe(true);
      return final({
        explanation:
          "CLI requires a single writer per State; the Configurator coordinates jobs through PostgreSQL. Conditional S3 writes do not provide locking and no native date is announced.",
        references: ["management-state"],
      });
    },
  ]);
  expect(
    (
      await client.converse(
        selection,
        {},
        [],
        "How is concurrent State access protected if conditional S3 writes are not enforced? Explain CLI and Configurator locking.",
      )
    ).changes,
  ).toEqual([]);
});

it("retains the actual presented question paths and choices for short follow-up answers", async () => {
  let state: ConsultationState | undefined;
  const { client } = model([
    () => ({
      action: "inspect",
      requests: [{ tool: "knowledge", topics: ["devops-git"] }],
    }),
    () =>
      final({
        kind: "clarification",
        activeTopics: ["devops-git"],
        references: ["devops-git"],
        questions: [
          {
            path: "devops.allowed_network_ranges",
            text: "Who should reach Git?",
            answerType: "requirements",
            options: [
              "Use Accelerator default (0.0.0.0/0)",
              "Provide company/VPN public egress IPs or CIDRs",
            ],
          },
        ],
      }),
  ]);
  const message = "Prepare Git100; ask me about access first.";
  const answer = await client.converse(
    selection,
    {},
    [],
    message,
    undefined,
    [],
    undefined,
    {
      onState: (value) => {
        state = value;
      },
    },
  );
  expect(state?.pendingQuestions).toEqual(answer.questions);
  const followup = model([
    (body) => {
      const context = JSON.parse(
        body.messages.find((message) => message.role === "user")!.content,
      );
      expect(context.pendingQuestions).toEqual(answer.questions);
      expect(context.currentUserTurn).toBe(2);
      return final({
        references: ["devops-git"],
        explanation: "The selected access default is 0.0.0.0/0. Nothing saved.",
      });
    },
  ]);
  await followup.client.converse(
    selection,
    {},
    [
      { role: "user", content: message },
      { role: "assistant", content: answer.explanation },
    ],
    "Use the Accelerator default",
    undefined,
    [],
    undefined,
    { state },
  );
});

it("classifies the total consultation deadline without publishing or retrying its cancelled request", async () => {
  const controller = new AbortController();
  const timeout = AbortSignal.timeout.bind(AbortSignal);
  const spy = vi
    .spyOn(AbortSignal, "timeout")
    .mockImplementation((ms) =>
      ms === 180000 ? controller.signal : timeout(ms),
    );
  const onState = vi.fn(),
    onText = vi.fn();
  const request = vi.fn<typeof fetch>(
    async (_url, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener(
          "abort",
          () => reject(init.signal!.reason),
          { once: true },
        );
      }),
  );
  try {
    const pending = new AssistantModelServing(configuration, request).converse(
      selection,
      {},
      [],
      "Explain the current workflow.",
      undefined,
      [],
      { onText },
      { onState },
    );
    const assertion = expect(pending).rejects.toMatchObject({
      reason: "consultation_timeout",
    });
    controller.abort(new DOMException("Timeout", "TimeoutError"));
    await assertion;
    expect(request).toHaveBeenCalledTimes(1);
    expect(onState).not.toHaveBeenCalled();
    expect(onText).not.toHaveBeenCalled();
  } finally {
    spy.mockRestore();
  }
});

it("returns a genuine remaining question without a rejected default proposal attached", async () => {
  const { client } = model(
    [
      () => ({
        action: "inspect",
        requests: [{ tool: "knowledge", topics: ["devops-git"] }],
      }),
      () => ({
        action: "validate_proposal",
        basis: [],
        changes: [
          {
            path: "devops",
            operation: "merge",
            value: {
              git_flavor: "git-100",
              allowed_network_ranges: ["0.0.0.0/0"],
            },
          },
        ],
      }),
      (body) =>
        final({
          kind: "proposal",
          proposal: lastResult(body).validation.proposal,
          references: ["devops-git"],
          explanation: "Git100 using public default access.",
        }),
      () =>
        final({
          kind: "clarification",
          proposal: undefined,
          references: ["devops-git"],
          explanation:
            "Git100 is the intended plan; access remains your decision. Nothing saved.",
          questions: [
            {
              path: "devops.allowed_network_ranges",
              text: "Who should reach Git?",
              answerType: "requirements",
            },
          ],
        }),
    ],
    [
      () => ({
        ready: false,
        findings: [
          "The user explicitly reserved the access decision. Withhold the proposal and ask the remaining access question.",
        ],
      }),
      () => ({ ready: true, findings: [] }),
    ],
  );
  const answer = await client.converse(
    selection,
    { devops: null },
    [],
    "Use Git100, but ask me about access before proposing changes.",
  );
  expect(answer.changes).toEqual([]);
  expect(answer.questions).toMatchObject([
    { path: "devops.allowed_network_ranges" },
  ]);
});

it("rejects unrequested service rights before a handle is issued and validates the corrected workflow", async () => {
  const current = {
    projectTemplates: {
      central: {
        accessProfile: {
          schemaVersion: 1,
          mode: "granular",
          initialOwnerEmail: "owner@example.test",
          permissions: ["iaas.server.get"],
          automationPermissions: ["iaas.server.get"],
        },
      },
    },
  };
  const keyOperation = {
    path: "projectTemplates",
    operation: "add_permissions",
    value: {
      templateKeys: ["central"],
      principals: ["requester"],
      source: { kind: "permission_set", id: "service-account-keys" },
    },
  };
  const { client } = model([
    () => ({
      action: "inspect",
      requests: [{ tool: "knowledge", topics: ["project-templates"] }],
    }),
    () => ({
      action: "validate_proposal",
      basis: [],
      changes: [
        keyOperation,
        {
          ...keyOperation,
          value: {
            ...keyOperation.value,
            source: { kind: "services", ids: ["git"] },
          },
        },
      ],
    }),
    (body) => {
      expect(lastResult(body).validation).toMatchObject({
        ok: false,
        code: "assistant_permission_service_unconfirmed",
      });
      return {
        action: "validate_proposal",
        basis: [],
        changes: [keyOperation],
      };
    },
    (body) =>
      final({
        kind: "proposal",
        proposal: lastResult(body).validation.proposal,
        references: ["project-templates"],
        explanation:
          "Key management is project-wide, can use all account rights including outside this project. Keep privileged platform accounts outside application projects. Nothing saved.",
      }),
  ]);
  const answer = await client.converse(
    selection,
    current,
    [],
    "In template central add requester rights for managing keys of the existing service account, for pipelines. Keep automation unchanged.",
  );
  expect(JSON.stringify(answer.changes)).toContain(
    "iam.service-account-key.create",
  );
  expect(JSON.stringify(answer.changes)).not.toContain("git.instance");
});

it("keeps every explicitly requested topic ahead of ranked neighbouring matches", async () => {
  const requested = [
    "identity-foundations",
    "governance-folders",
    "management-state",
    "stackit-network-components",
    "vpn",
    "dns-zones",
  ];
  const { client } = model([
    () => ({
      action: "inspect",
      requests: [{ tool: "knowledge", topics: requested }],
    }),
    (body) => {
      expect(lastResult(body).toolResults[0].result.selectedTopics).toEqual(
        requested,
      );
      return final({ references: ["dns-zones"] });
    },
  ]);
  await client.converse(
    selection,
    {},
    [],
    "Explain company Git sizing and access in a Hub-and-Spoke landing zone, and these six related foundations.",
  );
});

it("names the unread topic in validation feedback and requires its actual inspection", async () => {
  const { client } = model([
    () => final({ references: ["devops-git"], activeTopics: ["devops-git"] }),
    (body) => {
      expect(lastResult(body).answerValidation).toMatchObject({
        ok: false,
        code: "assistant_knowledge_required",
        path: "references/activeTopics",
      });
      expect(lastResult(body).answerValidation.instruction).toContain(
        "devops-git",
      );
      return {
        action: "inspect",
        requests: [{ tool: "knowledge", topics: ["devops-git"] }],
      };
    },
    () => final({ references: ["devops-git"], activeTopics: ["devops-git"] }),
  ]);
  const result = await client.converse(
    selection,
    {},
    [],
    "Explain the Git service; no edits.",
  );
  expect(result.references).toEqual(["devops-git"]);
});

it("includes mandatory credential boundaries in final review without requiring a model citation", async () => {
  const { client } = model(
    [() => final()],
    [
      (body) => {
        const payload = JSON.parse(
          body.messages.find((message) => message.role === "user")!.content,
        );
        expect(
          payload.relevantServiceFacts["credential-foundations"]
            .criticalBoundaries,
        ).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ id: "credential-secret-storage-state" }),
          ]),
        );
        return {
          ready: true,
          findings: [],
          boundaryChecks: [
            {
              id: "credential-secret-storage-state",
              applicable: false,
              covered: false,
              paragraphs: [],
            },
          ],
        };
      },
    ],
  );
  await client.converse(
    selection,
    {},
    [],
    "Explain the configuration lifecycle; no edits.",
  );
});
