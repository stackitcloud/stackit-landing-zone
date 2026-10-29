import type pg from "pg";
import { z } from "zod";
import type { Session } from "../auth/store.js";
import { CredentialError } from "../credentials/profiles.js";
import { withTenant } from "../storage/database.js";

export const platformApplicationImpactViewSchema = z.strictObject({
  planId: z.uuid(),
  artifactSha256: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .nullable(),
  dependencyHash: z.string().regex(/^[a-f0-9]{64}$/),
  classification: z.enum(["ordinary", "sensitive", "blocked"]),
  affectedApplications: z
    .array(
      z.strictObject({
        instanceId: z.uuid(),
        name: z.string().max(256),
        targetKey: z.string().max(48).nullable(),
      }),
    )
    .max(10000),
  blockers: z.array(z.string().regex(/^[a-z][a-z0-9-]{0,127}$/)).max(20),
  acknowledged: z.boolean(),
  canAcknowledge: z.boolean(),
});
export const platformApplicationImpactRequestSchema = z.strictObject({
  artifactSha256: z.string().regex(/^[a-f0-9]{64}$/),
  dependencyHash: z.string().regex(/^[a-f0-9]{64}$/),
  confirmImpact: z.literal(true),
});
export async function readPlatformApplicationImpact(
  pool: pg.Pool,
  session: Session,
  planId: string,
) {
  const id = z.uuid().parse(planId);
  return withTenant(pool, session, async (client) => {
    const result = await client.query<{ view: unknown }>(
      "SELECT lzc_auth.platform_application_impact($1,$2) AS view",
      [session.id, id],
    );
    return platformApplicationImpactViewSchema.parse(result.rows[0]?.view);
  }).catch(platformApplicationImpactError);
}
export async function acknowledgePlatformApplicationImpact(
  pool: pg.Pool,
  session: Session,
  planId: string,
  raw: unknown,
) {
  const id = z.uuid().parse(planId),
    request = platformApplicationImpactRequestSchema.parse(raw);
  return withTenant(pool, session, async (client) => {
    const result = await client.query<{ view: unknown }>(
      "SELECT lzc_auth.acknowledge_platform_application_impact($1,$2,$3,$4,$5) AS view",
      [
        session.id,
        id,
        request.artifactSha256,
        request.dependencyHash,
        request.confirmImpact,
      ],
    );
    return platformApplicationImpactViewSchema.parse(result.rows[0]?.view);
  }).catch(platformApplicationImpactError);
}

/** Acquire before any Platform State/plan row locks in Apply admission. */
export async function lockPlatformApplicationImpact(
  client: pg.PoolClient,
  tenantId: string,
) {
  await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
    `platform-application-impact:${z.uuid().parse(tenantId)}`,
  ]);
}
export async function platformApplicationHasDependencies(
  pool: pg.Pool,
  session: Session,
  runId: string,
) {
  return withTenant(pool, session, async (client) => {
    const result = await client.query<{ present: boolean }>(
      "SELECT lzc_auth.platform_application_has_dependencies($1,$2) AS present",
      [session.id, z.uuid().parse(runId)],
    );
    return z.boolean().parse(result.rows[0]?.present);
  }).catch(platformApplicationImpactError);
}
export function platformApplicationImpactError(error: unknown): never {
  if (error instanceof Error && "code" in error) {
    if (error.code === "40001")
      throw new CredentialError(409, "platform_impact_changed");
    if (error.code === "42501")
      throw new CredentialError(
        error.message.startsWith("platform_impact_") ? 409 : 403,
        error.message.startsWith("platform_impact_")
          ? error.message
          : "platform_impact_access_denied",
      );
  }
  throw error;
}
