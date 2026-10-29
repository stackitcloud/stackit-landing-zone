import { setTimeout } from "node:timers/promises";
import {
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
export function pacedAssistantTestRequest(request: typeof fetch): typeof fetch {
  let gate: Promise<void> = Promise.resolve();
  let lastStartedAt: number | undefined;
  return async (url, options) => {
    const signal = options?.signal;
    const admitted = gate.then(async () => {
      signal?.throwIfAborted();
      while (lastStartedAt !== undefined) {
        const remaining =
          lastStartedAt + assistantTestRequestIntervalMs - performance.now();
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
}

export function assistantTestModel(
  configuration: ReturnType<typeof modelServingConfiguration>,
  request: typeof fetch = fetch,
) {
  return new AssistantModelServing(
    configuration,
    pacedAssistantTestRequest(request),
    (diagnostic) => console.log(JSON.stringify(diagnostic)),
  );
}
