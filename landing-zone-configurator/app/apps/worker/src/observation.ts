import { z } from "zod";

const observation = z.strictObject({
  event: z.literal("application_plan_observation"),
  jobId: z.uuid(),
  instanceId: z.uuid(),
  observation: z.enum(["native-plan-observed", "plan-command-finished"]),
  observedAt: z.iso.datetime(),
});

// Operator logs contain identifiers only, never inputs, engine messages or State.
export function applicationPlanObservation(
  jobId: unknown,
  instanceId: unknown,
  phase: "native-plan-observed" | "plan-command-finished",
) {
  const parsed = observation.safeParse({
    event: "application_plan_observation",
    jobId,
    instanceId,
    observation: phase,
    observedAt: new Date().toISOString(),
  });
  return parsed.success ? parsed.data : undefined;
}
