import {
  applicationRecoveryReplanCheckSchema,
  applicationRecoveryReplanReceiptSchema,
  applicationRecoveryReplanRequestSchema,
  s3BackendDescriptorSchema,
  s3RunnerBackendSchema,
} from "@lzc/contracts";
import type pg from "pg";
import { z } from "zod";
import type { Session } from "../auth/store.js";
import { CredentialError } from "../credentials/profiles.js";
import type { Backends } from "../deployments/backends.js";
import { type ArtifactCrypto, canonicalBase64 } from "../plans/crypto.js";
import { canonicalJson, sha256 } from "../plans/execution.js";

// A separate error type avoids a circular import of Applications.
export class RecoveryReplanError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(code);
  }
}
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const contextSchema = z.object({
  mode: z.enum(["reported-failure", "operator-attested"]),
  jobId: z.uuid(),
  runnerAppId: z.uuid(),
  instanceId: z.uuid(),
  bindingSha256: hash,
  backendId: z.uuid(),
  backendSha256: hash,
  backendDescriptor: s3BackendDescriptorSchema,
  stateKey: z.string(),
});
const proofSchema = z.strictObject({
  context: contextSchema.strict(),
  stateSha256: hash,
  stateSerial: applicationRecoveryReplanCheckSchema.shape.stateSerial,
  stateVersion: z.string().min(1).max(1024),
  expiresAt: z.number().int(),
});
export type RecoveryReplanBackends = Pick<Backends, "runner"> &
  Partial<Pick<Backends, "current" | "read">>;
type Dependencies = {
  backends: RecoveryReplanBackends;
  crypto: ArtifactCrypto;
};
const changed = () =>
  new RecoveryReplanError(409, "application_recovery_replan_changed");
async function context(client: pg.PoolClient, session: Session, jobId: string) {
  const row = (
    await client.query<{ context: unknown }>(
      "SELECT lzc_auth.application_recovery_replan_context($1,$2) AS context",
      [session.id, jobId],
    )
  ).rows[0];
  const bound = contextSchema.parse(row?.context);
  if (
    bound.jobId !== jobId ||
    bound.stateKey !==
      `applications/${session.tenantId}/${bound.instanceId}/terraform.tfstate` ||
    bound.backendDescriptor.key !== bound.stateKey ||
    !bound.backendDescriptor.useLockfile
  )
    throw changed();
  const backendCiphertext = z
    .object({
      backendCiphertext: z
        .string()
        .regex(/^[a-f0-9]+$/)
        .optional(),
    })
    .parse(row?.context).backendCiphertext;
  return { bound, backendCiphertext };
}
async function snapshot(
  client: pg.PoolClient,
  session: Session,
  bound: z.infer<typeof contextSchema>,
  deps: Dependencies,
  backendCiphertext?: string,
) {
  if (!deps.backends.current)
    throw new RecoveryReplanError(
      503,
      "application_recovery_replan_unavailable",
    );
  // The authorized SQL context supplies ciphertext for delegated owners whose
  // tenant role deliberately cannot enumerate backend credentials or objects.
  const registered = backendCiphertext
    ? s3RunnerBackendSchema.parse({
        kind: "s3",
        descriptor: bound.backendDescriptor,
        credentials: JSON.parse(
          deps.crypto
            .decrypt(
              Buffer.from(backendCiphertext, "hex"),
              session.tenantId,
              bound.backendId,
              `backend:${bound.backendId}`,
            )
            .toString("utf8"),
        ),
      })
    : await deps.backends.runner(client, session, bound.backendId);
  const {
    key: _registeredKey,
    useLockfile: _registeredLock,
    ...registeredLocation
  } = registered.descriptor;
  const {
    key: _boundKey,
    useLockfile: _boundLock,
    ...boundLocation
  } = bound.backendDescriptor;
  if (canonicalJson(registeredLocation) !== canonicalJson(boundLocation))
    throw changed();
  const backend = s3RunnerBackendSchema.parse({
    ...registered,
    descriptor: bound.backendDescriptor,
  });
  try {
    // current() checks the lock before reading; a second read also checks for a
    // newly appeared lock and a changed object. This is observation, no unlock.
    const first = await deps.backends.current(backend, true);
    const last = await deps.backends.current(backend, true);
    const stateSha256 = sha256(first.bytes);
    if (first.identity !== last.identity || stateSha256 !== sha256(last.bytes))
      throw changed();
    const roots = first.document.resources.filter(
      (r) =>
        !r.module &&
        r.mode === "managed" &&
        r.type === "terraform_data" &&
        r.name === "contract",
    );
    const instances = roots[0]?.instances;
    const input = instances?.[0]?.attributes?.input;
    const instanceId =
      typeof input === "string"
        ? input
        : input && typeof input === "object" && "value" in input
          ? input.value
          : undefined;
    if (
      roots.length !== 1 ||
      instances?.length !== 1 ||
      instanceId !== bound.instanceId ||
      first.document.resources.some((r) => r.instances?.some((i) => i.deposed))
    )
      throw new RecoveryReplanError(
        409,
        "application_recovery_replan_state_invalid",
      );
    const counts = new Map<
      string,
      { type: string; mode: "managed" | "data"; count: number }
    >();
    for (const r of first.document.resources) {
      if (
        !r.type ||
        !/^[a-zA-Z0-9_]+$/.test(r.type) ||
        (r.mode !== "managed" && r.mode !== "data")
      )
        throw new RecoveryReplanError(
          409,
          "application_recovery_replan_state_invalid",
        );
      const key = `${r.mode}:${r.type}`;
      const item = counts.get(key) ?? { type: r.type, mode: r.mode, count: 0 };
      item.count += r.instances?.length ?? 0;
      counts.set(key, item);
    }
    return {
      stateSha256,
      stateSerial: first.document.serial,
      stateVersion: first.identity,
      resources: [...counts.values()].sort((a, b) =>
        `${a.mode}:${a.type}`.localeCompare(`${b.mode}:${b.type}`),
      ),
    };
  } catch (error) {
    if (error instanceof RecoveryReplanError) throw error;
    if (error instanceof CredentialError && error.code === "state_locked")
      throw new RecoveryReplanError(
        423,
        "application_recovery_replan_state_locked",
      );
    throw new RecoveryReplanError(
      409,
      "application_recovery_replan_state_unavailable",
    );
  }
}
export async function checkRecoveryReplan(
  client: pg.PoolClient,
  session: Session,
  jobId: string,
  deps: Dependencies,
) {
  const { bound, backendCiphertext } = await context(client, session, jobId);
  const state = await snapshot(client, session, bound, deps, backendCiphertext);
  const observedAt = new Date();
  const expiresAt = observedAt.getTime() + 5 * 60_000;
  const proof = proofSchema.parse({
    context: bound,
    stateSha256: state.stateSha256,
    stateSerial: state.stateSerial,
    stateVersion: state.stateVersion,
    expiresAt,
  });
  return applicationRecoveryReplanCheckSchema.parse({
    jobId,
    runnerAppId: bound.runnerAppId,
    instanceId: bound.instanceId,
    observedAt: observedAt.toISOString(),
    expiresAt: new Date(expiresAt).toISOString(),
    stateSha256: state.stateSha256,
    stateSerial: state.stateSerial,
    resources: state.resources,
    stateLock: "free",
    reviewToken: deps.crypto
      .encrypt(
        Buffer.from(JSON.stringify(proof)),
        session.tenantId,
        session.id,
        `application-replan:${jobId}`,
      )
      .toString("base64"),
    mode: bound.mode,
    runnerStop:
      bound.mode === "reported-failure"
        ? "reported-command-completed"
        : "operator-attestation-required",
    cloudState:
      bound.mode === "reported-failure"
        ? "requires-fresh-plan-review"
        : "operator-attestation-required",
    startsExecution: false,
  });
}
export async function approveRecoveryReplan(
  client: pg.PoolClient,
  session: Session,
  jobId: string,
  input: unknown,
  deps: Dependencies,
) {
  const request = applicationRecoveryReplanRequestSchema.parse(input);
  let proof: z.infer<typeof proofSchema>;
  try {
    proof = proofSchema.parse(
      JSON.parse(
        deps.crypto
          .decrypt(
            canonicalBase64(request.reviewToken, 6144),
            session.tenantId,
            session.id,
            `application-replan:${jobId}`,
          )
          .toString("utf8"),
      ),
    );
  } catch {
    throw changed();
  }
  if (proof.expiresAt <= Date.now()) throw changed();
  const { bound, backendCiphertext } = await context(client, session, jobId);
  if (
    bound.mode === "operator-attested" &&
    (!request.confirmRunnerStopped || !request.confirmCloudStateCompared)
  )
    throw changed();
  if (canonicalJson(bound) !== canonicalJson(proof.context)) throw changed();
  const state = await snapshot(client, session, bound, deps, backendCiphertext);
  if (
    state.stateSha256 !== proof.stateSha256 ||
    state.stateSerial !== proof.stateSerial ||
    state.stateVersion !== proof.stateVersion ||
    proof.expiresAt <= Date.now()
  )
    throw changed();
  const row = (
    await client.query<{
      job_id: string;
      reviewed_by: string;
      reviewed_at: Date;
      state_sha256: string;
      state_serial: string;
    }>(
      "SELECT * FROM lzc_auth.record_application_recovery_replan($1,$2,$3,$4,$5,$6,$7,$8)",
      [
        session.id,
        jobId,
        bound.bindingSha256,
        bound.backendSha256,
        state.stateSha256,
        state.stateSerial,
        state.stateVersion,
        bound.mode === "operator-attested",
      ],
    )
  ).rows[0];
  if (!row)
    throw new RecoveryReplanError(
      503,
      "application_recovery_replan_unavailable",
    );
  return applicationRecoveryReplanReceiptSchema.parse({
    jobId: row.job_id,
    reviewedBy: row.reviewed_by,
    reviewedAt: row.reviewed_at.toISOString(),
    stateSha256: row.state_sha256,
    stateSerial: Number(row.state_serial),
    mode: bound.mode,
    runnerStop:
      bound.mode === "reported-failure"
        ? "reported-command-completed"
        : "operator-attested",
    cloudState:
      bound.mode === "reported-failure"
        ? "requires-fresh-plan-review"
        : "operator-attested",
    requiresFreshPlan: true,
    startsExecution: false,
  });
}
