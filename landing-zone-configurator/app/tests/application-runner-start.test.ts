import { randomUUID } from "node:crypto";
import type pg from "pg";
import { expect, it, vi } from "vitest";
import { checkRunnerStart } from "../apps/api/src/applications/runner-start.js";
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
    existingReceipt: null as unknown,
  };
  const receipt = {
    jobId: c.jobId,
    instanceId: c.instanceId,
    status: "failed",
    errorCode: "runner_start_failed",
    canReplan: true,
    startsExecution: false,
  };
  let transaction = false;
  const query = vi.fn(async (sql: string, _values: unknown[]) => ({
    rows: sql.includes("application_runner_start_context")
      ? [{ context: c }]
      : [{ receipt }],
  }));
  const work = async <T>(task: (c: pg.PoolClient) => Promise<T>) => {
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
  const run = (input: unknown = { confirmRunnerStartCheck: true }) =>
    checkRunnerStart(work, session, c.jobId, input, runner);
  return { c, receipt, query, runner, run };
}
it("records verified non-execution only after two external observations and final reauthorization", async () => {
  const f = fixture();
  expect(await f.run()).toEqual(f.receipt);
  expect(f.runner.isStopped).toHaveBeenCalledTimes(2);
  expect(f.query).toHaveBeenCalledTimes(3);
  expect(f.query.mock.calls.at(-1)?.[0]).toContain(
    "record_application_runner_start_failure",
  );
  expect(f.runner.start).not.toHaveBeenCalled();
  expect(f.runner.remove).not.toHaveBeenCalled();
});
it.each(["active", "restarted", "unavailable"])(
  "preserves a runner that is %s",
  async (mode) => {
    const f = fixture();
    if (mode === "unavailable")
      f.runner.isStopped.mockRejectedValue(new Error("private-canary"));
    else if (mode === "restarted")
      f.runner.isStopped.mockResolvedValueOnce(true).mockResolvedValue(false);
    else f.runner.isStopped.mockResolvedValue(false);
    await expect(f.run()).rejects.toMatchObject({
      code:
        mode === "unavailable"
          ? "application_runner_start_unavailable"
          : "application_runner_start_active",
    });
    expect(f.query).toHaveBeenCalledTimes(1);
  },
);
it("authorizes before CF reads and rejects a late execution claim before recording", async () => {
  const f = fixture();
  f.query.mockRejectedValueOnce(new Error("denied"));
  await expect(f.run()).rejects.toThrow("denied");
  expect(f.runner.isStopped).not.toHaveBeenCalled();
  const g = fixture();
  g.query
    .mockResolvedValueOnce({ rows: [{ context: g.c }] })
    .mockRejectedValueOnce(new Error("claimed"));
  await expect(g.run()).rejects.toThrow("claimed");
  expect(g.query).toHaveBeenCalledTimes(2);
});
it.each([
  {},
  { confirmRunnerStartCheck: false },
  { confirmRunnerStartCheck: true, unlock: true },
])("rejects untrusted confirmation %j", async (input) => {
  const f = fixture();
  await expect(f.run(input)).rejects.toBeDefined();
  expect(f.query).not.toHaveBeenCalled();
});
it("returns only an already recorded receipt for the same job", async () => {
  const f = fixture();
  f.c.existingReceipt = f.receipt;
  expect(await f.run()).toEqual(f.receipt);
  expect(f.runner.isStopped).not.toHaveBeenCalled();
});
