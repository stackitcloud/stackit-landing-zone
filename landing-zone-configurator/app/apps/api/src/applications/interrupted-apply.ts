import {
  applicationInterruptedApplyReceiptSchema,
  applicationInterruptedApplyRequestSchema,
  s3BackendDescriptorSchema,
} from "@lzc/contracts";
import type pg from "pg";
import { z } from "zod";
import type { Session } from "../auth/store.js";
import type { PlanRunner } from "../plans/cloud-foundry.js";
import { canonicalJson } from "../plans/execution.js";
import { RecoveryReplanError } from "./recovery-replan.js";

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
  existingReceipt: applicationInterruptedApplyReceiptSchema.nullable(),
});
function fail(code: string, status = 409): never {
  throw new RecoveryReplanError(status, `application_apply_recovery_${code}`);
}

export async function inspectInterruptedApply(
  work: <T>(task: (client: pg.PoolClient) => Promise<T>) => Promise<T>,
  session: Session,
  jobId: string,
  input: unknown,
  runner: PlanRunner,
) {
  applicationInterruptedApplyRequestSchema.parse(input);
  async function context(client: pg.PoolClient) {
    const row = (
      await client.query<{ context: unknown }>(
        "SELECT lzc_auth.interrupted_application_apply_context($1,$2) AS context",
        [session.id, jobId],
      )
    ).rows[0];
    const c = contextSchema.parse(row?.context);
    if (
      c.jobId !== jobId ||
      c.backendDescriptor.key !==
        `applications/${session.tenantId}/${c.instanceId}/terraform.tfstate` ||
      !c.backendDescriptor.useLockfile
    )
      fail("changed");
    return c;
  }
  // External inspection never holds session, instance or dispatch row locks.
  const c = await work(context);
  if (c.existingReceipt) {
    if (
      c.existingReceipt.jobId !== jobId ||
      c.existingReceipt.instanceId !== c.instanceId
    )
      fail("changed");
    return c.existingReceipt;
  }
  const stopped = runner.isStopped?.bind(runner);
  if (!stopped) fail("unavailable", 503);
  for (let i = 0; i < 2; i++) {
    let result: boolean;
    try {
      result = await stopped(jobId, c.runnerAppId, c.runnerPackageId);
    } catch {
      fail("runner_unavailable", 503);
    }
    if (!result) fail("runner_active");
  }
  const observedAt = new Date().toISOString();
  return work(async (client) => {
    const latest = await context(client);
    const { existingReceipt: _before, ...before } = c;
    const { existingReceipt: existing, ...after } = latest;
    if (canonicalJson(before) !== canonicalJson(after)) fail("changed");
    if (existing) return existing;
    const row = (
      await client.query<{ receipt: unknown }>(
        "SELECT lzc_auth.record_interrupted_application_apply($1,$2,$3,$4,$5) AS receipt",
        [session.id, jobId, c.bindingSha256, c.backendSha256, observedAt],
      )
    ).rows[0];
    return applicationInterruptedApplyReceiptSchema.parse(row?.receipt);
  });
}
