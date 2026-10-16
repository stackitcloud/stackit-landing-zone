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
