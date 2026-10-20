import { expect, it, vi } from "vitest";
import { buildAssistantKnowledge } from "../apps/api/src/assistant/knowledge.js";
import { AssistantModelServing } from "../apps/api/src/assistant/model-serving.js";
import { publicAssistantFailureReason } from "../apps/api/src/assistant/routes.js";
import { assistantFailureMessage } from "../apps/web/src/assistant-errors.js";
import { readAssistantResponse } from "../apps/web/src/assistant-stream.js";
import { setLanguage } from "../apps/web/src/i18n.js";

it.each([
  ["intent_evidence", "requirements_unconfirmed"],
  ["invalid_scope", "proposal_invalid"],
  ["intent_schema", "response_invalid"],
  ["invalid_json", "response_invalid"],
  ["completion_truncated", "response_truncated"],
  ["response_too_large", "response_truncated"],
  ["stream_incomplete", "response_interrupted"],
  ["connection_interrupted", "response_interrupted"],
  ["service_timeout", "service_timeout"],
  ["upstream_status_429", "service_busy"],
  ["upstream_status_401", "service_authentication"],
  ["upstream_status_403", "service_authentication"],
  ["upstream_status_503", "service_unavailable"],
  ["connection_failed", "service_unavailable"],
])("maps %s to an actionable public category %s", (internal, publicReason) => {
  expect(publicAssistantFailureReason(internal)).toBe(publicReason);
});

it.each(["de", "en"] as const)(
  "localizes safe diagnostics in %s without exposing model data",
  async (language) => {
    await setLanguage(language);
    const message = assistantFailureMessage({
      error: "assistant_inference_failed",
      reason: "requirements_unconfirmed",
      requestId: "req-test",
      rawModelResponse: "must-not-expose",
    });
    expect(message).toContain("req-test");
    expect(message).toContain(
      language === "de" ? "nicht bestätigt" : "not confirmed",
    );
    expect(message).toContain(
      language === "de" ? "nichts geändert" : "Nothing was changed",
    );
    expect(message).not.toContain("must-not-expose");
    expect(
      assistantFailureMessage({
        error: "assistant_inference_failed",
        reason: "private-detail",
        requestId: "req-test",
      }),
    ).toBeNull();
  },
);

it("preserves error reason and request reference through the streaming client", async () => {
  const failure = {
    error: "assistant_inference_failed",
    reason: "response_truncated",
    requestId: "req-stream",
  };
  const response = new Response(
    `${JSON.stringify({ type: "error", ...failure })}\n`,
    {
      headers: { "Content-Type": "application/x-ndjson" },
    },
  );
  const checked = vi.fn(async (errorResponse: Response) => {
    expect(await errorResponse.json()).toEqual(failure);
    throw new Error("localized-diagnostic");
  });
  await expect(
    readAssistantResponse(response, vi.fn(), checked),
  ).rejects.toThrow("localized-diagnostic");
  expect(checked).toHaveBeenCalledOnce();
});

it("classifies network failures without copying transport messages into diagnostics", async () => {
  const model = new AssistantModelServing(
    {
      baseUrl:
        "https://api.openai-compat.model-serving.eu01.onstackit.cloud/v1",
      model: "Qwen/Qwen3-VL-235B-A22B-Instruct-FP8",
      token: "test-only-private-token",
      timeoutMs: 1000,
    },
    async () => {
      throw new Error("must-not-expose-transport-details", {
        cause: { code: "ECONNREFUSED" },
      });
    },
  );
  const knowledge = buildAssistantKnowledge();
  await expect(
    model.converse(
      {
        engineRevision: knowledge.engineRevision,
        knowledgeSha256: knowledge.sha256,
        groups: knowledge.groups,
      },
      {},
      [],
      "Welche DNS-Einstellungen gibt es?",
    ),
  ).rejects.toMatchObject({ reason: "connection_failed" });
});

it("classifies a real request deadline separately from an invalid response", async () => {
  const model = new AssistantModelServing(
    {
      baseUrl:
        "https://api.openai-compat.model-serving.eu01.onstackit.cloud/v1",
      model: "Qwen/Qwen3-VL-235B-A22B-Instruct-FP8",
      token: "test-only-private-token",
      timeoutMs: 1000,
    },
    async (_input, options) =>
      new Promise<Response>((_resolve, reject) => {
        const signal = options?.signal;
        if (!signal) throw new Error("Test request requires a deadline");
        signal.addEventListener("abort", () => reject(signal.reason), {
          once: true,
        });
      }),
  );
  const knowledge = buildAssistantKnowledge();
  await expect(
    model.converse(
      {
        engineRevision: knowledge.engineRevision,
        knowledgeSha256: knowledge.sha256,
        groups: knowledge.groups,
      },
      {},
      [],
      "Welche DNS-Einstellungen gibt es?",
    ),
  ).rejects.toMatchObject({ reason: "service_timeout" });
});

it("distinguishes interrupted response bodies from unreachable services", async () => {
  const model = new AssistantModelServing(
    {
      baseUrl:
        "https://api.openai-compat.model-serving.eu01.onstackit.cloud/v1",
      model: "Qwen/Qwen3-VL-235B-A22B-Instruct-FP8",
      token: "test-only-private-token",
      timeoutMs: 1000,
    },
    async () =>
      new Response(
        new ReadableStream({
          start(controller) {
            controller.error(
              new Error("must-not-expose-body-details", {
                cause: { code: "UND_ERR_SOCKET" },
              }),
            );
          },
        }),
        { headers: { "Content-Type": "application/json" } },
      ),
  );
  const knowledge = buildAssistantKnowledge();
  await expect(
    model.converse(
      {
        engineRevision: knowledge.engineRevision,
        knowledgeSha256: knowledge.sha256,
        groups: knowledge.groups,
      },
      {},
      [],
      "Welche DNS-Einstellungen gibt es?",
    ),
  ).rejects.toMatchObject({ reason: "connection_interrupted" });
});

it("gives unexpected service failures the same safe actionable diagnostics", async () => {
  await setLanguage("de");
  expect(
    assistantFailureMessage({
      error: "assistant_unavailable",
      reason: "service_unavailable",
      requestId: "req-unavailable",
      exception: "must-not-expose",
    }),
  ).toBe(
    "Der Chatdienst ist derzeit nicht verfügbar. Bitte versuche es später erneut oder arbeite im Editor weiter. Es wurde nichts geändert. Deine Nachricht und Antwortauswahl bleiben erhalten. Diagnosekennung: req-unavailable",
  );
});

const transportConfiguration = {
  baseUrl: "https://api.openai-compat.model-serving.eu01.onstackit.cloud/v1",
  model: "test-model",
  token: "test-only-private-token",
  timeoutMs: 10000,
};

function transportSelection() {
  const knowledge = buildAssistantKnowledge();
  return {
    engineRevision: knowledge.engineRevision,
    knowledgeSha256: knowledge.sha256,
    groups: knowledge.groups,
  };
}

function transportResponse() {
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
}

function unreachable(code: string) {
  return new Error("must-not-expose-transport-details", {
    cause: { code },
  });
}

it.each([
  "EAI_AGAIN",
  "ECONNRESET",
  "ETIMEDOUT",
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_SOCKET",
])(
  "retries transient %s once with the identical request and deadline",
  async (code) => {
    const request = vi
      .fn<typeof fetch>()
      .mockRejectedValueOnce(unreachable(code))
      .mockResolvedValueOnce(transportResponse());
    const diagnostic = vi.fn();
    const model = new AssistantModelServing(
      transportConfiguration,
      request,
      diagnostic,
    );
    await expect(
      model.qualifyKnowledge(transportSelection()),
    ).resolves.toMatchObject({
      model: "test-model",
    });
    expect(request).toHaveBeenCalledTimes(2);
    expect(request.mock.calls[1]).toEqual(request.mock.calls[0]);
    expect(request.mock.calls[1]?.[1]?.signal).toBe(
      request.mock.calls[0]?.[1]?.signal,
    );
    expect(diagnostic.mock.calls).toEqual([
      [
        {
          event: "assistant_transport_failure",
          code,
          attempt: 1,
          retrying: true,
          receivedResponse: false,
        },
      ],
    ]);
    expect(JSON.stringify(diagnostic.mock.calls)).not.toMatch(
      /must-not-expose|private-token|Bearer|messages/,
    );
  },
);

it("exhausts the second attempt without a third request and retains both safe codes", async () => {
  const request = vi
    .fn<typeof fetch>()
    .mockRejectedValueOnce(unreachable("ECONNRESET"))
    .mockRejectedValueOnce(unreachable("UND_ERR_SOCKET"));
  const diagnostic = vi.fn();
  const model = new AssistantModelServing(
    transportConfiguration,
    request,
    diagnostic,
  );
  await expect(
    model.converse(
      transportSelection(),
      {},
      [],
      "Welche DNS-Einstellungen gibt es?",
    ),
  ).rejects.toMatchObject({
    reason: "connection_failed",
    transportCode: "UND_ERR_SOCKET",
  });
  expect(request).toHaveBeenCalledTimes(2);
  expect(diagnostic.mock.calls).toEqual([
    [
      {
        event: "assistant_transport_failure",
        code: "ECONNRESET",
        attempt: 1,
        retrying: true,
        receivedResponse: false,
      },
    ],
    [
      {
        event: "assistant_transport_failure",
        code: "UND_ERR_SOCKET",
        attempt: 2,
        retrying: false,
        receivedResponse: false,
      },
    ],
  ]);
});

it.each(["ENOTFOUND", "ECONNREFUSED", "UND_ERR_HEADERS_TIMEOUT"])(
  "does not retry non-transient %s",
  async (code) => {
    const request = vi.fn<typeof fetch>().mockRejectedValue(unreachable(code));
    const diagnostic = vi.fn();
    const model = new AssistantModelServing(
      transportConfiguration,
      request,
      diagnostic,
    );
    await expect(
      model.converse(
        transportSelection(),
        {},
        [],
        "Welche DNS-Einstellungen gibt es?",
      ),
    ).rejects.toMatchObject({
      reason: "connection_failed",
      transportCode: code,
    });
    expect(request).toHaveBeenCalledOnce();
    expect(diagnostic).toHaveBeenCalledWith({
      event: "assistant_transport_failure",
      code,
      attempt: 1,
      retrying: false,
      receivedResponse: false,
    });
  },
);

it.each([401, 403, 429, 500, 502, 503, 504])(
  "does not retry HTTP %s",
  async (status) => {
    const request = vi.fn<typeof fetch>(
      async () => new Response("", { status }),
    );
    const diagnostic = vi.fn();
    const model = new AssistantModelServing(
      transportConfiguration,
      request,
      diagnostic,
    );
    await expect(
      model.converse(
        transportSelection(),
        {},
        [],
        "Welche DNS-Einstellungen gibt es?",
      ),
    ).rejects.toMatchObject({ reason: `upstream_status_${status}` });
    expect(request).toHaveBeenCalledOnce();
    expect(diagnostic).not.toHaveBeenCalled();
  },
);

it("does not retry invalid model content or unknown transport errors", async () => {
  for (const [content, reason] of [
    ["invalid-json", "invalid_json"],
    ["{}", "intent_schema"],
  ]) {
    const request = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        choices: [
          {
            finish_reason: "stop",
            message: { role: "assistant", content },
          },
        ],
      }),
    );
    const model = new AssistantModelServing(
      transportConfiguration,
      request,
      vi.fn(),
    );
    await expect(
      model.converse(
        transportSelection(),
        {},
        [],
        "Welche DNS-Einstellungen gibt es?",
      ),
    ).rejects.toMatchObject({ reason });
    expect(request).toHaveBeenCalledOnce();
  }
  const error = unreachable("must-not-expose-unknown-code");
  const request = vi.fn<typeof fetch>().mockRejectedValue(error);
  const diagnostic = vi.fn();
  const model = new AssistantModelServing(
    transportConfiguration,
    request,
    diagnostic,
  );
  await expect(
    model.converse(
      transportSelection(),
      {},
      [],
      "Welche DNS-Einstellungen gibt es?",
    ),
  ).rejects.toBe(error);
  expect(request).toHaveBeenCalledOnce();
  expect(diagnostic).not.toHaveBeenCalled();
});

it("does not replay an interrupted response body, even for a retryable socket code", async () => {
  const request = vi.fn<typeof fetch>(
    async () =>
      new Response(
        new ReadableStream({
          start(controller) {
            controller.error(unreachable("UND_ERR_SOCKET"));
          },
        }),
        { headers: { "Content-Type": "application/json" } },
      ),
  );
  const diagnostic = vi.fn();
  const model = new AssistantModelServing(
    transportConfiguration,
    request,
    diagnostic,
  );
  await expect(
    model.converse(
      transportSelection(),
      {},
      [],
      "Welche DNS-Einstellungen gibt es?",
    ),
  ).rejects.toMatchObject({
    reason: "connection_interrupted",
    transportCode: "UND_ERR_SOCKET",
  });
  expect(request).toHaveBeenCalledOnce();
  expect(diagnostic).toHaveBeenCalledWith({
    event: "assistant_transport_failure",
    code: "UND_ERR_SOCKET",
    attempt: 1,
    retrying: false,
    receivedResponse: true,
  });
});

it("keeps backoff inside the original deadline without sending an expired retry", async () => {
  const request = vi.fn<typeof fetch>(async () => {
    await new Promise((resolve) => setTimeout(resolve, 850));
    throw unreachable("ECONNRESET");
  });
  const diagnostic = vi.fn();
  const model = new AssistantModelServing(
    { ...transportConfiguration, timeoutMs: 1000 },
    request,
    diagnostic,
  );
  await expect(
    model.converse(
      transportSelection(),
      {},
      [],
      "Welche DNS-Einstellungen gibt es?",
    ),
  ).rejects.toMatchObject({ reason: "service_timeout" });
  expect(request).toHaveBeenCalledOnce();
  expect(diagnostic).toHaveBeenCalledWith(
    expect.objectContaining({
      code: "ECONNRESET",
      retrying: true,
      attempt: 1,
    }),
  );
});

it("honors cancellation during retry backoff without another inference", async () => {
  const controller = new AbortController();
  const request = vi
    .fn<typeof fetch>()
    .mockRejectedValue(unreachable("ECONNRESET"));
  const diagnostic = vi.fn(() => {
    setTimeout(() => controller.abort(), 25);
  });
  const model = new AssistantModelServing(
    transportConfiguration,
    request,
    diagnostic,
  );
  await expect(
    model.converse(
      transportSelection(),
      {},
      [],
      "Welche DNS-Einstellungen gibt es?",
      { regions: [] },
      [],
      { signal: controller.signal, onText: vi.fn() },
    ),
  ).rejects.toMatchObject({ name: "AbortError" });
  expect(request).toHaveBeenCalledOnce();
});

it("uses the remaining original deadline for a pending second request", async () => {
  const request = vi
    .fn<typeof fetch>()
    .mockRejectedValueOnce(unreachable("ECONNRESET"))
    .mockImplementationOnce(
      async (_url, options) =>
        new Promise<Response>((_resolve, reject) => {
          const signal = options?.signal;
          if (!signal) throw new Error("Test request requires a deadline");
          signal.throwIfAborted();
          signal.addEventListener("abort", () => reject(signal.reason), {
            once: true,
          });
        }),
    );
  const model = new AssistantModelServing(
    { ...transportConfiguration, timeoutMs: 1000 },
    request,
    vi.fn(),
  );
  await expect(
    model.adviseTemplates([], "Hallo", { regions: [] }, { onText: vi.fn() }),
  ).rejects.toMatchObject({ reason: "service_timeout" });
  expect(request).toHaveBeenCalledTimes(2);
  expect(request.mock.calls[1]?.[1]?.signal).toBe(
    request.mock.calls[0]?.[1]?.signal,
  );
});

it("never replays a stream after provisional text has reached the caller", async () => {
  let sent = false;
  const request = vi.fn<typeof fetch>(
    async () =>
      new Response(
        new ReadableStream({
          pull(controller) {
            if (sent) {
              controller.error(unreachable("UND_ERR_SOCKET"));
              return;
            }
            sent = true;
            controller.enqueue(
              new TextEncoder().encode(
                `data: ${JSON.stringify({
                  model: "test-model",
                  choices: [
                    {
                      index: 0,
                      delta: {
                        content: JSON.stringify({
                          explanation: "Vorlaeufiger Text",
                        }),
                      },
                      finish_reason: null,
                    },
                  ],
                })}\n\n`,
              ),
            );
          },
        }),
        { headers: { "Content-Type": "text/event-stream" } },
      ),
  );
  const diagnostic = vi.fn();
  const model = new AssistantModelServing(
    transportConfiguration,
    request,
    diagnostic,
  );
  const text: string[] = [];
  await expect(
    model.adviseTemplates(
      [],
      "Hallo",
      { regions: [] },
      { onText: (value) => text.push(value) },
    ),
  ).rejects.toMatchObject({
    reason: "connection_interrupted",
    transportCode: "UND_ERR_SOCKET",
  });
  expect(text).toEqual(["Vorlaeufiger Text"]);
  expect(request).toHaveBeenCalledOnce();
  expect(diagnostic).toHaveBeenCalledWith(
    expect.objectContaining({
      receivedResponse: true,
      retrying: false,
    }),
  );
});
