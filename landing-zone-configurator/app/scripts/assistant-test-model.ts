import { setTimeout } from "node:timers/promises";
import {
  type AssistantInferenceUsage,
  AssistantModelServing,
  type modelServingConfiguration,
} from "../apps/api/src/assistant/model-serving.js";

export const assistantTestRequestIntervalMs = 2500;

function untilAborted<T>(
  pending: Promise<T>,
  signal?: AbortSignal | null,
): Promise<T> {
  if (!signal) return pending;
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason);
    signal.addEventListener("abort", abort, { once: true });
    pending
      .then(resolve, reject)
      .finally(() => signal.removeEventListener("abort", abort));
  });
}

/** Serialize dispatch slots, never responses; no slot is consumed by cancellation. */
export function pacedAssistantTestRequest(
  request: typeof fetch,
): typeof fetch & { observeUsage: (usage: AssistantInferenceUsage) => void } {
  let gate: Promise<void> = Promise.resolve();
  let lastStartedAt: number | undefined;
  let tokenLimit = 350000;
  const charges: { at: number; tokens: number }[] = [];
  const paced: typeof fetch = async (url, options) => {
    const signal = options?.signal;
    const admitted = gate.then(async () => {
      signal?.throwIfAborted();
      const payload =
        typeof options?.body === "string" ? JSON.parse(options.body) : {};
      // Admission reserves a conservative prompt estimate and the full weighted
      // completion allowance. Actual usage replaces estimates for subsequent calls.
      const estimated =
        typeof options?.body === "string"
          ? Math.ceil(options.body.length / 2) +
            5 * Number(payload.max_completion_tokens ?? 4096)
          : 0;
      while (lastStartedAt !== undefined) {
        const now = performance.now();
        while (charges.length && charges[0]!.at + 60000 <= now) charges.shift();
        const used = charges.reduce((sum, charge) => sum + charge.tokens, 0);
        const quotaWait =
          charges.length && used + estimated > tokenLimit * 0.8
            ? charges[0]!.at + 60000 - now
            : 0;
        const remaining = Math.max(
          quotaWait,
          lastStartedAt + assistantTestRequestIntervalMs - now,
        );
        if (remaining <= 0) break;
        await setTimeout(Math.ceil(remaining), undefined, {
          ...(signal ? { signal } : {}),
        });
        signal?.throwIfAborted();
      }
      signal?.throwIfAborted();
      let response: Promise<Response>;
      try {
        response = request(url, options);
        // A cancellation just after dispatch must not leave a detached rejection.
        void response.catch(() => {});
      } finally {
        // Anchor AFTER invocation: time spent entering the transport cannot shorten
        // the interval between its actual invocations. Timers may wake early.
        lastStartedAt = performance.now();
      }
      return { response };
    });
    gate = admitted.then(
      () => {},
      () => {},
    );
    return (await untilAborted(admitted, signal)).response;
  };
  return Object.assign(paced, {
    observeUsage(usage: AssistantInferenceUsage) {
      if (usage.tokenLimit) tokenLimit = usage.tokenLimit;
      charges.push({
        at: performance.now(),
        tokens: usage.promptTokens + 5 * usage.completionTokens,
      });
    },
  });
}

export function assistantTestModel(
  configuration: ReturnType<typeof modelServingConfiguration>,
  request: typeof fetch = fetch,
) {
  const paced = pacedAssistantTestRequest(request);
  return new AssistantModelServing(
    configuration,
    paced,
    (diagnostic) => console.log(JSON.stringify(diagnostic)),
    paced.observeUsage,
  );
}
