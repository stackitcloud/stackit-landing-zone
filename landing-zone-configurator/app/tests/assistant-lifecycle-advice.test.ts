// Historical controller parity tests. Live runtime coverage: assistant-consultation.test.ts
// and the source-bound real-model suite; production has no legacy fallback.
import { expect, it, vi } from "vitest";
import { buildAssistantKnowledge } from "../apps/api/src/assistant/knowledge.js";
import {
  assistantLifecycleAdvice,
  explicitRootPlanReviewQuestion,
} from "../apps/api/src/assistant/lifecycle-advice.js";
import { LegacyAssistantModelServing as AssistantModelServing } from "../apps/api/src/assistant/model-serving.js";
import { assistantPlatformImpactReviewFailures } from "../scripts/assistant-scenarios.js";

const configuration = {
  baseUrl: "https://api.openai-compat.model-serving.eu01.onstackit.cloud/v1",
  model: "test-model",
  token: "test-only",
  timeoutMs: 1000,
};
function selection() {
  const knowledge = buildAssistantKnowledge();
  return {
    engineRevision: knowledge.engineRevision,
    knowledgeSha256: knowledge.sha256,
    groups: knowledge.groups,
  };
}

it.each([
  "My root platform Plan deletes old Logs. How do I approve its impacts?",
  "Mein Plattform-Plan löscht Logs. Woran ist die Auswirkungsfreigabe gebunden?",
  "How do I review the platform Plan?",
])("recognizes an explicit current root review question: %s", (message) => {
  expect(explicitRootPlanReviewQuestion(message)).toBe(true);
});
it.each([
  "How do I migrate Audit Logs to Observability?",
  "How do I approve my Application order's Plan?",
  "Please set the label to `How do I review the root platform Plan?`.",
  'Please use "How do I review the platform Plan?" as a name.',
  "How do I approve the platform Plan?\nMy answer: git-100",
  "Wie prüfe ich den Plattform-Plan?\nMeine Antwort: nur Audit aktivieren",
  "Approve the platform Plan.",
])(
  "does not mistake values or other workflows for root review: %s",
  (message) => {
    expect(explicitRootPlanReviewQuestion(message)).toBe(false);
  },
);
it.each(["de", "en"] as const)(
  "supplies complete %s root guidance without inference or changes",
  async (language) => {
    const request = vi.fn<typeof fetch>();
    const result = await new AssistantModelServing(
      configuration,
      request,
    ).converse(
      selection(),
      { "assistant.language": language },
      [{ role: "assistant", content: "Earlier Git setup." }],
      "Mein Plattform-Plan löscht alte Logs. Wie prüfe und bestätige ich die Auswirkungen?",
    );
    expect(request).not.toHaveBeenCalled();
    expect(result.explanation).toBe(
      assistantLifecycleAdvice("platform-impact-review", language),
    );
    expect(result.references).toEqual(["configuration-lifecycle"]);
    expect(result.questions).toEqual([]);
    expect(result.changes).toEqual([]);
    expect(assistantPlatformImpactReviewFailures(result.explanation)).toEqual(
      [],
    );
  },
);
it.each([
  "template-upgrade",
  "platform-upgrade",
  "platform-impact-review",
  "execution-source-upgrade",
] as const)("provides bounded bilingual %s instructions", (task) => {
  for (const language of ["en", "de"] as const) {
    const text = assistantLifecycleAdvice(task, language);
    expect(text.length).toBeLessThanOrEqual(3000);
    expect(text).toContain("Plan");
    expect(text).toContain("Apply");
    expect(text).toContain("State");
  }
  expect(assistantLifecycleAdvice(task, "en")).not.toMatch(
    /Noch nichts|Freigabe|gespeichert/,
  );
  expect(assistantLifecycleAdvice(task, "en")).not.toBe(
    assistantLifecycleAdvice(task, "de"),
  );
});
it.each(["de", "en"] as const)(
  "keeps the %s impact oracle sensitive to missing facts",
  (language) => {
    const text = assistantLifecycleAdvice("platform-impact-review", language);
    expect(assistantPlatformImpactReviewFailures(text)).toEqual([]);
    expect(
      assistantPlatformImpactReviewFailures(
        text.replace(/Platform.?Owner/gi, "Person"),
      ),
    ).toContain("platform_impact_missing_owner-decision");
    expect(
      assistantPlatformImpactReviewFailures(text.replace(/Plan/gi, "review")),
    ).toContain("platform_impact_missing_fresh-plan");
    expect(
      assistantPlatformImpactReviewFailures(
        text.replace(/State|Zustand/gi, "snapshot"),
      ),
    ).toContain("platform_impact_missing_state-binding");
  },
);

it.each([
  { topic: "vpn", path: "connectivity.vpn.plan_id" },
  { topic: "observability", path: "observability.plan_name" },
  {
    topic: "platform-kubernetes",
    path: "platform_kubernetes[*].cluster.kubernetes_version_min",
  },
])(
  "uses typed, read-only consultation for $topic despite unrelated network flags",
  async ({ topic, path }) => {
    const request = vi.fn<typeof fetch>(async (_url, init) => {
      const body = JSON.parse(String(init?.body));
      const name = body.response_format.json_schema.name;
      const content =
        name === "conversation_intent"
          ? {
              topic,
              mode: "advice",
              adviceTask: "other",
              networkScope: "sna-and-firewall",
              firewallAreaKeys: ["old"],
              allFirewalls: true,
              requirements: [],
            }
          : name === "component_request_purpose"
            ? { purpose: "information", quote: null }
            : name === "platform_advice_subject"
              ? { task: "other" }
              : (() => {
                  expect(name).toBe("editor_dialogue");
                  const schema = body.response_format.json_schema.schema;
                  expect(schema.properties.changes.maxItems).toBe(0);
                  expect(body.messages[0].content).toContain(
                    "READ-ONLY SERVICE CONSULTATION:",
                  );
                  return {
                    replyLanguage: "en",
                    explanation: "Choose an offered option.",
                    questions: [
                      {
                        path,
                        text: "Which offered option suits your requirements?",
                        options: [],
                        answerType: "catalogue",
                      },
                    ],
                    changes: [],
                    references: [topic],
                  };
                })();
      return Response.json({
        choices: [
          {
            finish_reason: "stop",
            message: { role: "assistant", content: JSON.stringify(content) },
          },
        ],
      });
    });
    const result = await new AssistantModelServing(
      configuration,
      request,
    ).converse(
      selection(),
      { "assistant.language": "en", region: "eu01" },
      [],
      "Please explain the available service offerings.",
    );
    expect(result.changes).toEqual([]);
    expect(result.questions[0]?.path).toBe(path);
  },
);

it("rejects model changes during a read-only service consultation independently of the wire schema", async () => {
  const request = vi.fn<typeof fetch>(async (_url, init) => {
    const name = JSON.parse(String(init?.body)).response_format.json_schema
      .name;
    const content =
      name === "conversation_intent"
        ? {
            topic: "vpn",
            mode: "advice",
            adviceTask: "other",
            requirements: [],
          }
        : {
            replyLanguage: "en",
            explanation: "Changed VPN.",
            questions: [],
            changes: [{ path: "connectivity.vpn", value: null }],
            references: ["vpn"],
          };
    return Response.json({
      choices: [
        {
          finish_reason: "stop",
          message: { role: "assistant", content: JSON.stringify(content) },
        },
      ],
    });
  });
  await expect(
    new AssistantModelServing(configuration, request).converse(
      selection(),
      { "assistant.language": "en" },
      [],
      "Please explain VPN offerings.",
    ),
  ).rejects.toMatchObject({ reason: "invalid_scope" });
});
