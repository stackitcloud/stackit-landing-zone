import { randomUUID } from "node:crypto";
import type pg from "pg";
import { expect, it, vi } from "vitest";
import { inspectInterruptedApply } from "../apps/api/src/applications/interrupted-apply.js";
import type { Session } from "../apps/api/src/auth/store.js";

function fixture() {
  const session = {
    id: randomUUID(),
    tenantId: randomUUID(),
    userId: randomUUID(),
  } as Session;
  const c = {
    jobId: randomUUID(),
    instanceId: randomUUID(),
    runnerAppId: randomUUID(),
    runnerPackageId: randomUUID(),
    bindingSha256: "a".repeat(64),
    backendId: randomUUID(),
    backendSha256: "b".repeat(64),
    backendDescriptor: {
      bucket: "test-bucket",
      endpoint: "https://object.storage.eu01.onstackit.cloud",
      region: "eu01",
      key: "",
      useLockfile: true,
    },
    existingReceipt: null as unknown,
  };
  c.backendDescriptor.key = `applications/${session.tenantId}/${c.instanceId}/terraform.tfstate`;
  const receipt = {
    jobId: c.jobId,
    instanceId: c.instanceId,
    status: "reconciliation_required",
    recordedAt: new Date().toISOString(),
    runnerStop: "verified-stopped",
    stateCheck: "not-performed",
    stateLock: "not-checked",
    requiresOperatorReview: true,
    canReplan: false,
    startsExecution: false,
  };
  let transaction = false;
  const query = vi.fn(async (sql: string, _values: unknown[]) => ({
    rows: sql.includes("interrupted_application_apply_context")
      ? [{ context: c }]
      : [{ receipt }],
  }));
  const work = async <T>(task: (client: pg.PoolClient) => Promise<T>) => {
    expect(transaction).toBe(false);
    transaction = true;
    try {
      return await task({ query } as unknown as pg.PoolClient);
    } finally {
      transaction = false;
    }
  };
  const runner = {
    isStopped: vi.fn(async () => {
      expect(transaction).toBe(false);
      return true;
    }),
    start: vi.fn(),
    remove: vi.fn(),
  };
  const run = (input: unknown = { confirmInterruptedApply: true }) =>
    inspectInterruptedApply(work, session, c.jobId, input, runner);
  const recorded = () =>
    query.mock.calls.some(([sql]) =>
      sql.includes("record_interrupted_application_apply"),
    );
  return { session, c, receipt, runner, run, query, recorded };
}
it("records stopped Apply as unresolved without claiming State/lock checks or allowing execution", async () => {
  const f = fixture();
  expect(await f.run()).toEqual(f.receipt);
  expect(f.runner.isStopped).toHaveBeenCalledTimes(2);
  expect(f.runner.isStopped).toHaveBeenCalledWith(
    f.c.jobId,
    f.c.runnerAppId,
    f.c.runnerPackageId,
  );
  expect(f.runner.start).not.toHaveBeenCalled();
  expect(f.runner.remove).not.toHaveBeenCalled();
  expect(f.recorded()).toBe(true);
  expect(f.query.mock.calls.at(-1)?.[1].slice(0, 4)).toEqual([
    f.session.id,
    f.c.jobId,
    f.c.bindingSha256,
    f.c.backendSha256,
  ]);
});
it.each(["active", "unavailable", "restarted"])(
  "rejects %s Runner without a terminal transition",
  async (kind) => {
    const f = fixture();
    if (kind === "unavailable")
      f.runner.isStopped.mockRejectedValue(new Error("private-canary"));
    else if (kind === "active") f.runner.isStopped.mockResolvedValue(false);
    else
      f.runner.isStopped.mockResolvedValueOnce(true).mockResolvedValue(false);
    await expect(f.run()).rejects.toMatchObject({
      code:
        kind === "unavailable"
          ? "application_apply_recovery_runner_unavailable"
          : "application_apply_recovery_runner_active",
    });
    expect(f.recorded()).toBe(false);
  },
);
it.each([
  {},
  { confirmInterruptedApply: false },
  { confirmInterruptedApply: true, runnerStopped: true },
  { confirmInterruptedApply: true, unlock: true },
])("rejects forged or missing confirmation %j before I/O", async (input) => {
  const f = fixture();
  await expect(f.run(input)).rejects.toBeDefined();
  expect(f.query).not.toHaveBeenCalled();
  expect(f.runner.isStopped).not.toHaveBeenCalled();
});
it("authorizes before external inspection", async () => {
  const f = fixture();
  f.query.mockRejectedValue(
    Object.assign(new Error("denied"), { code: "42501" }),
  );
  await expect(f.run()).rejects.toMatchObject({ code: "42501" });
  expect(f.runner.isStopped).not.toHaveBeenCalled();
});
it("checks the exact tenant/instance backend namespace", async () => {
  const f = fixture();
  f.c.backendDescriptor.key = "foreign/terraform.tfstate";
  await expect(f.run()).rejects.toMatchObject({
    code: "application_apply_recovery_changed",
  });
  expect(f.runner.isStopped).not.toHaveBeenCalled();
});
it("refuses changed bindings in the final short transaction", async () => {
  const f = fixture();
  f.runner.isStopped.mockImplementation(async () => {
    f.c.bindingSha256 = "c".repeat(64);
    return true;
  });
  await expect(f.run()).rejects.toMatchObject({
    code: "application_apply_recovery_changed",
  });
  expect(f.recorded()).toBe(false);
});
it("returns an authorized historical receipt after the Runner has been removed", async () => {
  const f = fixture();
  f.c.existingReceipt = f.receipt;
  expect(await f.run()).toEqual(f.receipt);
  expect(f.runner.isStopped).not.toHaveBeenCalled();
  expect(f.recorded()).toBe(false);
});
it("rejects a mismatched receipt", async () => {
  const f = fixture();
  f.c.existingReceipt = { ...f.receipt, instanceId: randomUUID() };
  await expect(f.run()).rejects.toMatchObject({
    code: "application_apply_recovery_changed",
  });
  expect(f.runner.isStopped).not.toHaveBeenCalled();
});
