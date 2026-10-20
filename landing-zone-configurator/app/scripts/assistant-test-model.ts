import { setTimeout } from "node:timers/promises";
import {
  AssistantModelServing,
  type modelServingConfiguration,
} from "../apps/api/src/assistant/model-serving.js";

export const assistantTestRequestIntervalMs = 2500;

export function assistantTestModel(
  configuration: ReturnType<typeof modelServingConfiguration>,
  request: typeof fetch = fetch,
) {
  let nextRequestAt = 0;
  return new AssistantModelServing(
    configuration,
    async (url, options) => {
      const now = Date.now();
      const scheduled = Math.max(now, nextRequestAt);
      nextRequestAt = scheduled + assistantTestRequestIntervalMs;
      if (scheduled > now)
        await setTimeout(scheduled - now, undefined, {
          ...(options?.signal ? { signal: options.signal } : {}),
        });
      return request(url, options);
    },
    (diagnostic) => console.log(JSON.stringify(diagnostic)),
  );
}
