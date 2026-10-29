import { setTimeout } from "node:timers/promises";
import { afterEach, expect, it, vi } from "vitest";
import { buildAssistantKnowledge } from "../apps/api/src/assistant/knowledge.js";
import {
  assistantTestModel,
  assistantTestRequestIntervalMs,
  pacedAssistantTestRequest,
} from "../scripts/assistant-test-model.js";

const configuration = {
  baseUrl:
    "https://api.openai-compat.model-serving.eu01.onstackit.cloud/v1" as const,
  model: "test-model",
  token: "test-only-token",
  timeoutMs: 10000,
};

vi.mock("node:timers/promises", async (original) => {
  const actual = await original<typeof import("node:timers/promises")>();
  return { ...actual, setTimeout: vi.fn(actual.setTimeout) };
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.mocked(setTimeout).mockReset();
});

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

it("rechecks an early timer and anchors pacing after actual dispatch work", async () => {
  let now = 0;
  vi.spyOn(performance, "now").mockImplementation(() => now);
  const starts: number[] = [];
  const transport = vi.fn<typeof fetch>(async () => {
    starts.push(now);
    now += 17;
    return new Response();
  });
  vi.mocked(setTimeout)
    .mockImplementationOnce(async () => {
      now += 2499;
    })
    .mockImplementationOnce(async () => {
      now += 1;
    });
  const paced = pacedAssistantTestRequest(transport);
  await paced("https://example.test");
  await paced("https://example.test");
  expect(starts).toEqual([0, 2517]);
  expect(vi.mocked(setTimeout).mock.calls.map((call) => call[0])).toEqual([
    2500, 1,
  ]);
});

it("serializes concurrent starts without waiting for outstanding responses", async () => {
  let now = 0;
  vi.spyOn(performance, "now").mockImplementation(() => now);
  vi.mocked(setTimeout).mockImplementation(async (delay) => {
    now += Number(delay);
  });
  const starts: number[] = [];
  const responses: ((value: Response) => void)[] = [];
  const paced = pacedAssistantTestRequest(
    vi.fn<typeof fetch>(() => {
      starts.push(now);
      return new Promise((resolve) => responses.push(resolve));
    }),
  );
  const pending = [
    paced("https://example.test/1"),
    paced("https://example.test/2"),
    paced("https://example.test/3"),
  ];
  await vi.waitFor(() => expect(starts).toHaveLength(3));
  expect(starts).toEqual([0, 2500, 5000]);
  responses.forEach((resolve) => {
    resolve(new Response());
  });
  await Promise.all(pending);
});

it("rejects queued cancellation promptly and never spends its phantom slot", async () => {
  let now = 0;
  vi.spyOn(performance, "now").mockImplementation(() => now);
  let wake: (() => void) | undefined;
  vi.mocked(setTimeout).mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        wake = () => {
          now += 2500;
          resolve();
        };
      }),
  );
  const starts: number[] = [];
  const transport = vi.fn<typeof fetch>(async () => {
    starts.push(now);
    return new Response();
  });
  const paced = pacedAssistantTestRequest(transport);
  await paced("https://example.test/first");
  const waiting = paced("https://example.test/second");
  const controller = new AbortController();
  const cancelled = paced("https://example.test/cancelled", {
    signal: controller.signal,
  });
  controller.abort(new Error("cancelled queue entry"));
  await expect(cancelled).rejects.toThrow("cancelled queue entry");
  expect(transport).toHaveBeenCalledOnce();
  wake?.();
  await waiting;
  vi.mocked(setTimeout).mockImplementationOnce(async (delay) => {
    now += Number(delay);
  });
  await paced("https://example.test/third");
  expect(starts).toEqual([0, 2500, 5000]);
  expect(transport.mock.calls.map((call) => call[0])).not.toContain(
    "https://example.test/cancelled",
  );
});
