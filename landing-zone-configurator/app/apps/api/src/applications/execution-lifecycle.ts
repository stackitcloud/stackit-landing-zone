import { applicationExecutionProfiles } from "@lzc/contracts";
import type pg from "pg";
import { z } from "zod";
import type { Session } from "../auth/store.js";
import type { PlanRunner } from "../plans/cloud-foundry.js";

const revision = z.string().regex(/^[a-f0-9]{40}$/);
export const applicationExecutionContextSchema = z.object({
  revision,
  bindingId: z.uuid().nullable(),
  lastAppliedRevision: revision.nullable(),
  originRevision: revision,
  sourceStatus: z.enum(["supported", "withdrawn"]),
  replacementRevision: revision.nullable(),
  canUpgrade: z.boolean(),
  blockers: z.array(z.string().min(1).max(128)).max(30),
});
export const applicationExecutionUpgradeSchema = z.strictObject({
  targetRevision: revision,
  expectedRevision: revision,
  confirmUpgrade: z.literal(true),
});

export async function readApplicationExecutionContext(
  client: pg.PoolClient,
  session: Session,
  instanceId: string,
) {
  const result = await client.query<{ context: unknown }>(
    "SELECT lzc_auth.application_execution_context($1,$2) AS context",
    [session.id, instanceId],
  );
  return applicationExecutionContextSchema.parse(result.rows[0]?.context);
}

export function supportsApplicationExecution(
  runner: PlanRunner | undefined,
  revision: string,
) {
  return runner?.supportsAccelerator
    ? runner.supportsAccelerator(revision)
    : runner?.acceleratorCommit === revision;
}

export function availableApplicationExecutionContext(
  input: unknown,
  runner?: PlanRunner,
) {
  const context = applicationExecutionContextSchema.parse(input);
  const profiles = applicationExecutionProfiles.filter((profile) =>
    supportsApplicationExecution(runner, profile.revision),
  );
  const available = profiles.some(
    (profile) =>
      profile.revision === context.revision && profile.status === "supported",
  );
  const replacementAvailable = profiles.some(
    (profile) =>
      profile.revision === context.replacementRevision &&
      profile.status === "supported",
  );
  return {
    ...context,
    sourceStatus:
      context.sourceStatus === "supported" && !available
        ? ("unavailable" as const)
        : context.sourceStatus,
    canUpgrade: context.canUpgrade && replacementAvailable,
    blockers: [
      ...context.blockers,
      ...(context.sourceStatus === "supported" && !available
        ? ["application_execution_package_unavailable"]
        : []),
    ],
    profiles,
  };
}
