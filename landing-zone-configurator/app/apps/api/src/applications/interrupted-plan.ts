import {
  applicationInterruptedPlanReceiptSchema,
  applicationInterruptedPlanRequestSchema,
  s3BackendDescriptorSchema,
  s3RunnerBackendSchema,
} from "@lzc/contracts";
import type pg from "pg";
import { z } from "zod";
import type { Session } from "../auth/store.js";
import { CredentialError } from "../credentials/profiles.js";
import { stateDocument } from "../deployments/backends.js";
import type { PlanRunner } from "../plans/cloud-foundry.js";
import type { ArtifactCrypto } from "../plans/crypto.js";
import { canonicalJson, sha256 } from "../plans/execution.js";
import {
  type RecoveryReplanBackends,
  RecoveryReplanError,
} from "./recovery-replan.js";

const hash = z.string().regex(/^[a-f0-9]{64}$/);
const contextSchema = z.object({
  jobId: z.uuid(),
  instanceId: z.uuid(),
  runnerAppId: z.uuid(),
  runnerPackageId: z.uuid(),
  bindingSha256: hash,
  backendId: z.uuid(),
  backendSha256: hash,
  backendDescriptor: s3BackendDescriptorSchema,
  backendCiphertext: z.string().regex(/^(?:[a-f0-9]{2})+$/),
  hasApply: z.boolean(),
  existingReceipt: applicationInterruptedPlanReceiptSchema.nullable(),
});
function fail(code: string, status = 409): never {
  throw new RecoveryReplanError(status, `application_plan_recovery_${code}`);
}

export async function completeInterruptedPlan(
  work: <T>(task: (client: pg.PoolClient) => Promise<T>) => Promise<T>,
  session: Session,
  jobId: string,
  input: unknown,
  deps: {
    backends: RecoveryReplanBackends;
    crypto: ArtifactCrypto;
    runner: PlanRunner;
  },
) {
  applicationInterruptedPlanRequestSchema.parse(input);
  async function context(client: pg.PoolClient) {
    const row = (
      await client.query<{ context: unknown }>(
        "SELECT lzc_auth.interrupted_application_plan_context($1,$2) AS context",
        [session.id, jobId],
      )
    ).rows[0];
    const c = contextSchema.parse(row?.context);
    const expected = `applications/${session.tenantId}/${c.instanceId}/terraform.tfstate`;
    if (
      c.jobId !== jobId ||
      c.backendDescriptor.key !== expected ||
      !c.backendDescriptor.useLockfile
    )
      fail("changed");
    return c;
  }
  // Release tenant/dispatch locks before touching external services. The final
  // short transaction reauthorizes and compares the entire immutable context.
  const c = await work(context);
  if (c.existingReceipt) {
    if (
      c.existingReceipt.jobId !== jobId ||
      c.existingReceipt.instanceId !== c.instanceId
    )
      fail("changed");
    return c.existingReceipt;
  }
  const read = deps.backends.read;
  const stopped = deps.runner.isStopped?.bind(deps.runner);
  if (!read || !stopped) fail("unavailable", 503);
  const verifyStopped = async () => {
    let result: boolean;
    try {
      result = await stopped(jobId, c.runnerAppId, c.runnerPackageId);
    } catch {
      fail("runner_unavailable", 503);
    }
    if (!result) fail("runner_active");
  };
  await verifyStopped();
  const backend = s3RunnerBackendSchema.parse({
    kind: "s3",
    descriptor: c.backendDescriptor,
    credentials: JSON.parse(
      deps.crypto
        .decrypt(
          Buffer.from(c.backendCiphertext, "hex"),
          session.tenantId,
          c.backendId,
          `backend:${c.backendId}`,
        )
        .toString("utf8"),
    ),
  });
  let stateSha: string | null = null,
    serial: number | null = null,
    version: string | null = null;
  try {
    const key = backend.descriptor.key;
    if (await read(backend, `${key}.tflock`)) fail("state_locked", 423);
    const first = await read(backend, key),
      last = await read(backend, key);
    if (await read(backend, `${key}.tflock`)) fail("state_locked", 423);
    if (!first || !last) {
      if (first || last) fail("changed");
      if (c.hasApply) fail("state_unavailable");
    } else {
      stateSha = sha256(first.bytes);
      serial = stateDocument(first.bytes).serial;
      version = first.identity;
      if (version !== last.identity || stateSha !== sha256(last.bytes))
        fail("changed");
      const document = stateDocument(first.bytes);
      const contracts = document.resources.filter(
        (r) =>
          !r.module &&
          r.mode === "managed" &&
          r.type === "terraform_data" &&
          r.name === "contract",
      );
      const entries = contracts[0]?.instances;
      const value = entries?.[0]?.attributes?.input;
      const instance =
        typeof value === "string"
          ? value
          : value && typeof value === "object" && "value" in value
            ? value.value
            : undefined;
      if (
        contracts.length !== 1 ||
        entries?.length !== 1 ||
        instance !== c.instanceId ||
        document.resources.some((r) => r.instances?.some((i) => i.deposed))
      )
        fail("state_invalid");
    }
  } catch (error) {
    if (error instanceof RecoveryReplanError) throw error;
    if (error instanceof CredentialError && error.code === "state_locked")
      fail("state_locked", 423);
    fail("state_unavailable");
  }
  // Recheck after State observation; neither a stale CF read nor an expired
  // historical proof can authorize this terminal transition.
  await verifyStopped();
  try {
    const last = await read(backend, backend.descriptor.key);
    if (
      (last ? sha256(last.bytes) : null) !== stateSha ||
      (last?.identity ?? null) !== version
    )
      fail("changed");
    if (await read(backend, `${backend.descriptor.key}.tflock`))
      fail("state_locked", 423);
  } catch (error) {
    if (error instanceof RecoveryReplanError) throw error;
    fail("state_unavailable");
  }
  const observedAt = new Date().toISOString();
  return work(async (client) => {
    const latest = await context(client);
    const { existingReceipt: _before, ...before } = c;
    const { existingReceipt: existing, ...after } = latest;
    if (canonicalJson(before) !== canonicalJson(after)) fail("changed");
    if (existing) return existing;
    const result = (
      await client.query<{ receipt: unknown }>(
        "SELECT lzc_auth.complete_interrupted_application_plan($1,$2,$3,$4,$5,$6,$7,$8) AS receipt",
        [
          session.id,
          jobId,
          c.bindingSha256,
          c.backendSha256,
          observedAt,
          stateSha,
          serial,
          version,
        ],
      )
    ).rows[0];
    return applicationInterruptedPlanReceiptSchema.parse(result?.receipt);
  });
}
