import { watch } from "node:fs";
import { open } from "node:fs/promises";
import { resolve } from "node:path";
import {
  applicationPlanJobSchema,
  applicationRunnerBindingSchema,
  openTofuProgress,
} from "@lzc/contracts";

// Read only the bounded first version record; observation failure never fails a Plan.
export function watchPlanVersion(
  directory: string,
  active: () => boolean,
  observed: () => void,
) {
  let closed = false;
  let reading = false;
  let close = () => {
    closed = true;
  };
  const check = async () => {
    if (closed || reading || !active()) return;
    reading = true;
    try {
      const file = await open(resolve(directory, "plan-events.log"), "r");
      try {
        const bytes = Buffer.alloc(16384);
        const { bytesRead } = await file.read(bytes, 0, bytes.length, 0);
        const content = bytes.subarray(0, bytesRead).toString("utf8");
        const newline = content.indexOf("\n");
        if (newline < 0) return;
        const progress = openTofuProgress(content.slice(0, newline + 1));
        if (
          !progress.invalid &&
          /^OpenTofu 1\.12\.6\n/.test(progress.text) &&
          !closed &&
          active()
        ) {
          close();
          observed();
        }
      } finally {
        await file.close();
      }
    } catch {
      // A partial/unavailable file is retried by the existing output publication loop.
    } finally {
      reading = false;
    }
  };
  try {
    const watcher = watch(
      directory,
      { persistent: false },
      (_event, filename) => {
        if (filename === "plan-events.log") void check();
      },
    );
    close = () => {
      closed = true;
      watcher.close();
    };
    watcher.on("error", close);
  } catch {
    /* Keep the existing bounded publication fallback. */
  }
  return () => close();
}

// Operator logs contain identifiers only, never inputs, engine messages or State.
export function applicationPlanObservation(
  jobId: unknown,
  instanceId: unknown,
  phase:
    | "native-plan-observed"
    | "plan-command-finished"
    | "native-plan-held"
    | "native-plan-released",
) {
  const job = applicationPlanJobSchema.shape.id.safeParse(jobId);
  const instance =
    applicationRunnerBindingSchema.shape.instanceId.safeParse(instanceId);
  if (!job.success || !instance.success) return undefined;
  return {
    event: "application_plan_observation",
    jobId: job.data,
    instanceId: instance.data,
    observation: phase,
    observedAt: new Date().toISOString(),
  };
}
