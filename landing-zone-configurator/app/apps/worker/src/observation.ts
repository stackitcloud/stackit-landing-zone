import {
  applicationPlanJobSchema,
  applicationRunnerBindingSchema,
} from "@lzc/contracts";

// Operator logs contain identifiers only, never inputs, engine messages or State.
export function applicationPlanObservation(
  jobId: unknown,
  instanceId: unknown,
  phase: "native-plan-observed" | "plan-command-finished",
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
