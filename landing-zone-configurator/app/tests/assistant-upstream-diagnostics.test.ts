import { expect, it } from "vitest";
import { assistantUpstreamCause } from "../apps/api/src/assistant/upstream-diagnostics.js";

it.each([
  [
    "xgrammar backend does not support this schema, fallback to guidance",
    "grammar_backend_mismatch",
  ],
  ["Unsupported schema keyword", "unsupported_schema"],
  ["maximum context length exceeded", "context_limit"],
  ["rate_limit_exceeded", "rate_limit"],
  ["private token Bearer synthetic-private-value", "unknown"],
])(
  "classifies a provider rejection without returning its text: %s",
  async (message, expected) => {
    const cause = await assistantUpstreamCause(
      Response.json({ error: { message } }),
    );
    expect(cause).toBe(expected);
    expect(cause).not.toContain("synthetic-private-value");
  },
);
it("bounds malformed, oversized and interrupted error bodies", async () => {
  for (const response of [
    new Response("not json"),
    new Response("x".repeat(16385)),
    new Response(null),
    new Response(
      new ReadableStream({
        start(controller) {
          controller.error(new Error("private-details"));
        },
      }),
    ),
  ])
    expect(await assistantUpstreamCause(response)).toBe("unknown");
});

it("keeps safe upstream categories on the production tool path without exposing provider text or retrying", async () => {
  const { AssistantModelServing } = await import(
    "../apps/api/src/assistant/model-serving.js"
  );
  const { buildAssistantKnowledge } = await import(
    "../apps/api/src/assistant/knowledge.js"
  );
  const k = buildAssistantKnowledge();
  let requests = 0;
  const model = new AssistantModelServing(
    {
      baseUrl:
        "https://api.openai-compat.model-serving.eu01.onstackit.cloud/v1",
      model: "test-model",
      token: "synthetic-test-token",
      timeoutMs: 1000,
    },
    async () => {
      requests++;
      return Response.json(
        {
          error: {
            message:
              "private-token-value: xgrammar backend mismatch with guidance fallback",
          },
        },
        { status: 400 },
      );
    },
  );
  let failure: unknown;
  try {
    await model.converse(
      {
        engineRevision: k.engineRevision,
        knowledgeSha256: k.sha256,
        groups: k.groups,
      },
      {},
      [],
      "Explain State coordination.",
    );
  } catch (error) {
    failure = error;
  }
  expect(failure).toMatchObject({
    reason: "upstream_status_400",
    upstreamCause: "grammar_backend_mismatch",
    phase: "assistant_native_consultation",
  });
  expect(JSON.stringify(failure)).not.toContain("private-token-value");
  expect(requests).toBe(1);
});
