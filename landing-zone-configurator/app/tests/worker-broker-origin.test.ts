import { afterEach, expect, it, vi } from "vitest";
import {
  brokerOrigin,
  hostedBrokerOrigin,
  productionBrokerOrigin,
} from "../apps/worker/src/runner.js";
import { runWarmRunner } from "../apps/worker/src/warm-runner.js";

afterEach(() => vi.unstubAllGlobals());
const poolId = "11111111-1111-4111-8111-111111111111";
const assignment = {
  id: "22222222-2222-4222-8222-222222222222",
  ticket: "j".repeat(43),
  broker: "platform",
};
const invalid = [
  undefined,
  "https://foreign.invalid",
  `${productionBrokerOrigin}/`,
  `${productionBrokerOrigin}.attacker.invalid`,
  `${productionBrokerOrigin}:444`,
  `http://${new URL(productionBrokerOrigin).hostname}`,
  `${productionBrokerOrigin}/path`,
  `${productionBrokerOrigin}?query=1`,
  "http://127.0.0.1:3000",
];
it.each([brokerOrigin, productionBrokerOrigin])(
  "accepts warm claims and assignments only at the exact hosted origin %s",
  async (origin) => {
    expect(hostedBrokerOrigin(origin)).toBe(origin);
    const request = vi.fn(async (url: string, init: RequestInit) => {
      expect(url).toBe(`${origin}/api/internal/runner-pool/${poolId}/claim`);
      expect(init.redirect).toBe("error");
      expect(init.headers).toEqual({
        Authorization: `Bearer ${"b".repeat(43)}`,
      });
      return Response.json(assignment);
    });
    vi.stubGlobal("fetch", request);
    const execute = vi.fn(async () => "succeeded" as const);
    expect(
      await runWarmRunner(
        {
          root: "/synthetic-package",
          signal: new AbortController().signal,
          env: {
            LZC_POOL_RUNNER_ID: poolId,
            LZC_POOL_TICKET: "b".repeat(43),
            LZC_BROKER_ORIGIN: origin,
          },
        },
        { execute },
      ),
    ).toBe("succeeded");
    expect(execute).toHaveBeenCalledExactlyOnceWith({
      root: "/synthetic-package",
      ...assignment,
      brokerOrigin: origin,
    });
    expect(request).toHaveBeenCalledTimes(1);
  },
);
it.each(invalid)(
  "rejects untrusted or noncanonical warm origin %s before sending a capability",
  async (origin) => {
    expect(hostedBrokerOrigin(origin)).toBeUndefined();
    const request = vi.fn();
    vi.stubGlobal("fetch", request);
    await expect(
      runWarmRunner({
        root: "/synthetic-package",
        signal: new AbortController().signal,
        env: {
          LZC_POOL_RUNNER_ID: poolId,
          LZC_POOL_TICKET: "b".repeat(43),
          LZC_BROKER_ORIGIN: origin,
        },
      }),
    ).rejects.toThrow("Warm runner configuration invalid");
    expect(request).not.toHaveBeenCalled();
  },
);
