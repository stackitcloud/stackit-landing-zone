import {
  applicationRunnerStartCheckReceiptSchema,
  applicationRunnerStartCheckRequestSchema,
} from "@lzc/contracts";
import type pg from "pg";
import { z } from "zod";
import type { Session } from "../auth/store.js";
import type { PlanRunner } from "../plans/cloud-foundry.js";
import { canonicalJson } from "../plans/execution.js";
import { RecoveryReplanError } from "./recovery-replan.js";

const contextSchema = z.strictObject({
  jobId: z.uuid(),
  instanceId: z.uuid(),
  runnerAppId: z.uuid(),
  runnerPackageId: z.uuid(),
  bindingSha256: z.string().regex(/^[a-f0-9]{64}$/),
  existingReceipt: applicationRunnerStartCheckReceiptSchema.nullable(),
});
export async function checkRunnerStart(
  work: <T>(task: (client: pg.PoolClient) => Promise<T>) => Promise<T>,
  session: Session,
  jobId: string,
  input: unknown,
  runner: PlanRunner,
) {
  applicationRunnerStartCheckRequestSchema.parse(input);
  const fail = (code: string, status = 409): never => {
    throw new RecoveryReplanError(status, `application_runner_start_${code}`);
  };
  const context = async (client: pg.PoolClient) => {
    const row = (
      await client.query<{ context: unknown }>(
        "SELECT lzc_auth.application_runner_start_context($1,$2) AS context",
        [session.id, jobId],
      )
    ).rows[0];
    const c = contextSchema.parse(row?.context);
    if (c.jobId !== jobId) fail("changed");
    return c;
  };
  const c = await work(context);
  if (c.existingReceipt) {
    if (
      c.existingReceipt.jobId !== jobId ||
      c.existingReceipt.instanceId !== c.instanceId
    )
      fail("changed");
    return c.existingReceipt;
  }
  const inspect = runner.isStopped?.bind(runner);
  if (!inspect) return fail("unavailable", 503);
  // No external call holds a database lock. Both independent observations must
  // establish terminal execution; the final transaction excludes any late claim.
  for (let i = 0; i < 2; i++) {
    let stopped = false;
    try {
      stopped = await inspect(jobId, c.runnerAppId, c.runnerPackageId);
    } catch {
      fail("unavailable", 503);
    }
    if (!stopped) fail("active");
  }
  const observed = new Date().toISOString();
  return work(async (client) => {
    const latest = await context(client);
    const { existingReceipt: _before, ...before } = c;
    const { existingReceipt: existing, ...after } = latest;
    if (canonicalJson(before) !== canonicalJson(after)) fail("changed");
    if (existing) return existing;
    const row = (
      await client.query<{ receipt: unknown }>(
        "SELECT lzc_auth.record_application_runner_start_failure($1,$2,$3,$4,$5,$6) AS receipt",
        [
          session.id,
          jobId,
          c.runnerAppId,
          c.runnerPackageId,
          c.bindingSha256,
          observed,
        ],
      )
    ).rows[0];
    return applicationRunnerStartCheckReceiptSchema.parse(row?.receipt);
  });
}
