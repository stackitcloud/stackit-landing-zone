import { afterEach, expect, it, vi } from "vitest";
import { buildAssistantKnowledge } from "../apps/api/src/assistant/knowledge.js";
import {
  assistantTestModel,
  assistantTestRequestIntervalMs,
} from "../scripts/assistant-test-model.js";

const configuration = {
  baseUrl:
    "https://api.openai-compat.model-serving.eu01.onstackit.cloud/v1" as const,
  model: "test-model",
  token: "test-only-token",
  timeoutMs: 10000,
};

afterEach(() => vi.restoreAllMocks());

function selection() {
  const knowledge = buildAssistantKnowledge();
  return {
    engineRevision: knowledge.engineRevision,
    knowledgeSha256: knowledge.sha256,
    groups: knowledge.groups,
  };
}

it("paces actual model requests, not just scenario boundaries", async () => {
  const started: number[] = [];
  const request = vi.fn<typeof fetch>(async () => {
    started.push(Date.now());
    return Response.json({
      choices: [
        {
          finish_reason: "stop",
          message: {
            role: "assistant",
            content: JSON.stringify({
              templateId: "standalone",
              questions: [],
              assumptions: [],
              explanation: "Synthetic proposal only.",
              references: ["public-corporate"],
            }),
          },
        },
      ],
    });
  });
  const model = assistantTestModel(configuration, request);
  await model.qualifyKnowledge(selection());
  await model.qualifyKnowledge(selection());
  expect(request).toHaveBeenCalledTimes(2);
  expect((started[1] ?? 0) - (started[0] ?? 0)).toBeGreaterThanOrEqual(
    assistantTestRequestIntervalMs,
  );
});

it("does not retry rejected serving requests", async () => {
  const request = vi.fn<typeof fetch>(
    async () => new Response("", { status: 429 }),
  );
  const model = assistantTestModel(configuration, request);
  await expect(model.qualifyKnowledge(selection())).rejects.toThrow(
    "assistant_inference_failed",
  );
  expect(request).toHaveBeenCalledTimes(1);
});

it("does not send a request that times out while waiting for its slot", async () => {
  const request = vi.fn<typeof fetch>(
    async () => new Response("", { status: 429 }),
  );
  const model = assistantTestModel(
    { ...configuration, timeoutMs: 1000 },
    request,
  );
  await expect(model.qualifyKnowledge(selection())).rejects.toThrow(
    "assistant_inference_failed",
  );
  await expect(model.qualifyKnowledge(selection())).rejects.toThrow(
    "assistant_inference_failed",
  );
  expect(request).toHaveBeenCalledTimes(1);
});

it("retains safe retry diagnostics and fails when CI pacing exhausts the same deadline", async () => {
  const output = vi.spyOn(console, "log").mockImplementation(() => {});
  const request = vi
    .fn<typeof fetch>()
    .mockRejectedValue(
      new Error("must-not-expose", { cause: { code: "ECONNRESET" } }),
    );
  const model = assistantTestModel(
    { ...configuration, timeoutMs: 1000 },
    request,
  );
  await expect(model.qualifyKnowledge(selection())).rejects.toThrow(
    "assistant_inference_failed",
  );
  expect(request).toHaveBeenCalledOnce();
  expect(output).toHaveBeenCalledOnce();
  expect(JSON.parse(String(output.mock.calls[0]?.[0]))).toEqual({
    event: "assistant_transport_failure",
    code: "ECONNRESET",
    attempt: 1,
    retrying: true,
    receivedResponse: false,
  });
  expect(String(output.mock.calls[0]?.[0])).not.toMatch(
    /must-not-expose|token|Bearer/,
  );
});
