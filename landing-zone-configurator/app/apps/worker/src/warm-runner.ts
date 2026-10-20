import { setTimeout as sleep } from "node:timers/promises";
import {
  type RunnerPoolAssignment,
  runnerPoolAssignmentSchema,
} from "@lzc/contracts";
import { brokerOrigin, runWorker } from "./runner.js";

const idleLifetimeMilliseconds = 15 * 60 * 1000;
const claimTimeoutMilliseconds = 10000;

interface WarmRunnerOptions {
  root: string;
  signal: AbortSignal;
  env?: NodeJS.ProcessEnv;
}

interface WarmRunnerDependencies {
  execute?: typeof runWorker;
  now?: () => number;
  wait?: (milliseconds: number, signal: AbortSignal) => Promise<void>;
}

async function assignment(response: Response): Promise<RunnerPoolAssignment> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Warm runner assignment invalid");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 4096) throw new Error("Warm runner assignment invalid");
      chunks.push(value);
    }
    return runnerPoolAssignmentSchema.parse(
      JSON.parse(Buffer.concat(chunks).toString("utf8")),
    );
  } catch {
    throw new Error("Warm runner assignment invalid");
  } finally {
    await reader.cancel().catch(() => {});
  }
}

export async function runWarmRunner(
  options: WarmRunnerOptions,
  dependencies: WarmRunnerDependencies = {},
): Promise<"succeeded" | "failed"> {
  const env = options.env ?? process.env;
  const poolId = env.LZC_POOL_RUNNER_ID;
  const ticket = env.LZC_POOL_TICKET;
  if (
    !runnerPoolAssignmentSchema.shape.id.safeParse(poolId).success ||
    !runnerPoolAssignmentSchema.shape.ticket.safeParse(ticket).success ||
    env.LZC_RUN_ID !== undefined ||
    env.LZC_RUN_TICKET !== undefined ||
    env.LZC_LOCAL_RUNNER === "true" ||
    env.LZC_BROKER_ORIGIN !== brokerOrigin
  )
    throw new Error("Warm runner configuration invalid");

  const now = dependencies.now ?? (() => performance.now());
  const wait =
    dependencies.wait ??
    (async (milliseconds: number, signal: AbortSignal) => {
      await sleep(milliseconds, undefined, { signal });
    });
  const deadline = now() + idleLifetimeMilliseconds;
  const checkIdle = () => {
    if (options.signal.aborted) throw new Error("Warm runner idle cancelled");
    if (now() >= deadline) throw new Error("Warm runner idle expired");
  };
  for (;;) {
    checkIdle();
    const signal = AbortSignal.any([
      options.signal,
      AbortSignal.timeout(
        Math.max(1, Math.min(claimTimeoutMilliseconds, deadline - now())),
      ),
    ]);
    let claimed: RunnerPoolAssignment | undefined;
    try {
      const response = await fetch(
        `${brokerOrigin}/api/internal/runner-pool/${poolId}/claim`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${ticket}` },
          redirect: "error",
          signal,
        },
      );
      if (response.status === 200) claimed = await assignment(response);
      else {
        await response.body?.cancel();
        if (response.status !== 204)
          throw new Error("Warm runner claim rejected");
      }
    } catch {
      checkIdle();
      // A lost response may already have consumed the assignment. Never retry it.
      throw new Error("Warm runner claim failed");
    }
    checkIdle();
    if (claimed)
      return (dependencies.execute ?? runWorker)({
        root: options.root,
        id: claimed.id,
        ticket: claimed.ticket,
        broker: claimed.broker,
        brokerOrigin,
      });
    try {
      await wait(Math.min(1000, deadline - now()), options.signal);
    } catch {
      checkIdle();
      throw new Error("Warm runner idle wait failed");
    }
  }
}
