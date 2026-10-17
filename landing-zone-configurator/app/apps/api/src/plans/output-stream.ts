import { once } from "node:events";
import { PassThrough } from "node:stream";
import { setTimeout as delay } from "node:timers/promises";
import type { PlanOutput } from "@lzc/contracts";
import type { FastifyReply } from "fastify";
import { CredentialError } from "../credentials/profiles.js";

export function sendPlanOutput(
  reply: FastifyReply,
  initial: PlanOutput,
  read: () => Promise<PlanOutput>,
  wait: (signal: AbortSignal) => Promise<unknown> = (signal) =>
    delay(1000, undefined, { signal }),
) {
  const controller = new AbortController();
  const output = new PassThrough({ highWaterMark: 64 * 1024 });
  const close = () => controller.abort();
  reply.raw.once("close", close);
  reply
    .type("application/x-ndjson")
    .header("Cache-Control", "private, no-store")
    .header("X-Accel-Buffering", "no")
    .send(output);
  const write = async (event: unknown) => {
    if (controller.signal.aborted) return;
    if (!output.write(`${JSON.stringify(event)}\n`))
      await once(output, "drain", { signal: controller.signal });
  };
  void (async () => {
    const deadline = Date.now() + 30000;
    const lifetime = setTimeout(() => controller.abort(), 35000);
    try {
      let current = initial;
      let previous = "";
      while (!controller.signal.aborted) {
        const serialized = JSON.stringify(current);
        if (serialized !== previous) {
          await write({ type: "output", data: current });
          previous = serialized;
        } else await write({ type: "heartbeat" });
        if (current.kind !== "live" || Date.now() >= deadline) break;
        await wait(controller.signal);
        if (controller.signal.aborted) break;
        current = await read();
      }
      await write({ type: "complete" });
    } catch (error) {
      if (!controller.signal.aborted) {
        reply.log.warn(
          { event: "plan_output_stream_failed" },
          "Plan output stream failed",
        );
        output.write(
          `${JSON.stringify({
            type: "error",
            error:
              error instanceof CredentialError
                ? error.code
                : "plan_output_unavailable",
          })}\n`,
        );
      }
    } finally {
      clearTimeout(lifetime);
      reply.raw.removeListener("close", close);
      const aborted = controller.signal.aborted;
      controller.abort();
      if (aborted) output.destroy();
      else output.end();
    }
  })();
}
