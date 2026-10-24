import { randomBytes, randomUUID } from "node:crypto";
import type pg from "pg";
import { expect, it, vi } from "vitest";
import { completeInterruptedPlan } from "../apps/api/src/applications/interrupted-plan.js";
import type { Session } from "../apps/api/src/auth/store.js";
import { ArtifactCrypto } from "../apps/api/src/plans/crypto.js";
import { sha256 } from "../apps/api/src/plans/execution.js";

const secret = "private-interrupted-plan-canary";
function fixture() {
  const session = {
    id: randomUUID(),
    tenantId: randomUUID(),
    userId: randomUUID(),
  } as Session;
  const crypto = new ArtifactCrypto(randomBytes(32).toString("base64"));
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
    backendCiphertext: "",
    hasApply: false,
    existingReceipt: null as unknown,
  };
  c.backendDescriptor.key = `applications/${session.tenantId}/${c.instanceId}/terraform.tfstate`;
  c.backendCiphertext = crypto
    .encrypt(
      Buffer.from(
        JSON.stringify({ accessKeyId: secret, secretAccessKey: secret }),
      ),
      session.tenantId,
      c.backendId,
      `backend:${c.backendId}`,
    )
    .toString("hex");
  const document = {
    version: 4,
    serial: 7,
    lineage: randomUUID(),
    outputs: { private: { value: secret, sensitive: true } },
    resources: [
      {
        mode: "managed",
        type: "terraform_data",
        name: "contract",
        instances: [
          {
            attributes: { input: c.instanceId, private: secret },
            deposed: undefined as string | undefined,
          },
        ],
      },
    ],
  };
  let state: null | { bytes: Buffer; identity: string } = null;
  const read = vi.fn(async (_backend: unknown, key: string) =>
    key.endsWith(".tflock") ? null : state,
  );
  const runner = {
    isStopped: vi.fn(async () => true),
    start: vi.fn(),
    remove: vi.fn(),
  };
  const receipt = () => ({
    jobId: c.jobId,
    instanceId: c.instanceId,
    status: "failed",
    recordedAt: new Date().toISOString(),
    statePresent: state !== null,
    runnerStop: "verified-stopped",
    stateLock: "free",
    requiresFreshPlan: true,
    startsExecution: false,
  });
  let transactionActive = false;
  const query = vi.fn(async (sql: string, _params: unknown[]) => ({
    rows: sql.includes("interrupted_application_plan_context")
      ? [{ context: c }]
      : [{ receipt: receipt() }],
  }));
  const work = async <T>(task: (client: pg.PoolClient) => Promise<T>) => {
    expect(transactionActive).toBe(false);
    transactionActive = true;
    try {
      return await task({ query } as unknown as pg.PoolClient);
    } finally {
      transactionActive = false;
    }
  };
  read.mockImplementation(async (_backend, key) => {
    expect(transactionActive).toBe(false);
    return key.endsWith(".tflock") ? null : state;
  });
  runner.isStopped.mockImplementation(async () => {
    expect(transactionActive).toBe(false);
    return true;
  });
  const run = (input: unknown = { confirmPlanCompletion: true }) =>
    completeInterruptedPlan(work, session, c.jobId, input, {
      crypto,
      backends: { runner: vi.fn(), read },
      runner,
    });
  const present = () => {
    state = {
      bytes: Buffer.from(JSON.stringify(document)),
      identity: "test-version",
    };
    return state;
  };
  const recorded = () =>
    query.mock.calls.some(([sql]) =>
      sql.includes("complete_interrupted_application_plan"),
    );
  return {
    session,
    c,
    query,
    runner,
    read,
    run,
    present,
    recorded,
    document,
    receipt,
  };
}

it("completes a verified stopped initial Plan without State and never starts or deletes a Runner", async () => {
  const f = fixture();
  const receipt = await f.run();
  expect(receipt).toMatchObject({
    status: "failed",
    statePresent: false,
    requiresFreshPlan: true,
    startsExecution: false,
  });
  expect(f.runner.isStopped).toHaveBeenCalledTimes(2);
  expect(f.runner.isStopped).toHaveBeenCalledWith(
    f.c.jobId,
    f.c.runnerAppId,
    f.c.runnerPackageId,
  );
  expect(f.recorded()).toBe(true);
  expect(f.runner.start).not.toHaveBeenCalled();
  expect(f.runner.remove).not.toHaveBeenCalled();
  expect(
    f.read.mock.calls.every(
      ([, key]) =>
        key === f.c.backendDescriptor.key ||
        key === `${f.c.backendDescriptor.key}.tflock`,
    ),
  ).toBe(true);
  expect(JSON.stringify(receipt)).not.toContain(secret);
});
it("retains a matching existing State and records only its fingerprint", async () => {
  const f = fixture();
  const state = f.present();
  const receipt = await f.run();
  expect(receipt.statePresent).toBe(true);
  expect(f.query.mock.calls.at(-1)?.[1].slice(5)).toEqual([
    sha256(state.bytes),
    7,
    "test-version",
  ]);
  expect(JSON.stringify(receipt)).not.toContain(secret);
  expect(sha256(state.bytes)).toHaveLength(64);
});
it.each([false, "unavailable", "restarted"])(
  "refuses a Runner that is %s",
  async (kind) => {
    const f = fixture();
    if (kind === false) f.runner.isStopped.mockResolvedValue(false);
    else if (kind === "unavailable")
      f.runner.isStopped.mockRejectedValue(new Error(secret));
    else
      f.runner.isStopped.mockResolvedValueOnce(true).mockResolvedValue(false);
    await expect(f.run()).rejects.toMatchObject({
      code:
        kind === "unavailable"
          ? "application_plan_recovery_runner_unavailable"
          : "application_plan_recovery_runner_active",
    });
    expect(f.recorded()).toBe(false);
    if (kind !== "restarted") expect(f.read).not.toHaveBeenCalled();
  },
);
it.each([1, 2, 3])(
  "refuses a lock appearing at observation %s without changing anything",
  async (at) => {
    const f = fixture();
    let locks = 0;
    f.read.mockImplementation(async (_backend, key) =>
      key.endsWith(".tflock") && ++locks === at
        ? { bytes: Buffer.from(secret), identity: "lock" }
        : null,
    );
    await expect(f.run()).rejects.toMatchObject({
      code: "application_plan_recovery_state_locked",
      status: 423,
    });
    expect(f.recorded()).toBe(false);
  },
);
it("does not accept missing State after any Apply attempt", async () => {
  const f = fixture();
  f.c.hasApply = true;
  await expect(f.run()).rejects.toMatchObject({
    code: "application_plan_recovery_state_unavailable",
  });
  expect(f.recorded()).toBe(false);
});
it.each([2, 3])("refuses State changed at read %s", async (at) => {
  const f = fixture();
  const state = f.present();
  let reads = 0;
  f.read.mockImplementation(async (_backend, key) =>
    key.endsWith(".tflock")
      ? null
      : ++reads === at
        ? {
            ...state,
            bytes: Buffer.from(
              state.bytes.toString().replace('"serial":7', '"serial":8'),
            ),
          }
        : state,
  );
  await expect(f.run()).rejects.toMatchObject({
    code: "application_plan_recovery_changed",
  });
  expect(f.recorded()).toBe(false);
});
it.each(["wrong-instance", "deposed", "missing-contract", "invalid"])(
  "refuses %s State",
  async (kind) => {
    const f = fixture();
    const instance = f.document.resources[0]?.instances[0];
    if (!instance) throw new Error("Invalid synthetic fixture");
    if (kind === "wrong-instance") instance.attributes.input = randomUUID();
    if (kind === "deposed") instance.deposed = "old";
    if (kind === "missing-contract") f.document.resources = [];
    f.present();
    if (kind === "invalid")
      f.read.mockImplementation(async (_backend, key) =>
        key.endsWith(".tflock")
          ? null
          : { bytes: Buffer.from(secret), identity: "invalid" },
      );
    await expect(f.run()).rejects.toMatchObject({
      code:
        kind === "invalid"
          ? "application_plan_recovery_state_unavailable"
          : "application_plan_recovery_state_invalid",
    });
    expect(f.recorded()).toBe(false);
  },
);
it("denies inaccessible backend observations instead of treating them as absent", async () => {
  const f = fixture();
  f.read.mockRejectedValue(new Error(secret));
  await expect(f.run()).rejects.toMatchObject({
    code: "application_plan_recovery_state_unavailable",
  });
  expect(f.recorded()).toBe(false);
});
it("rechecks the tenant-bound State key before any external call", async () => {
  const f = fixture();
  f.c.backendDescriptor.key = `applications/${randomUUID()}/${f.c.instanceId}/terraform.tfstate`;
  await expect(f.run()).rejects.toMatchObject({
    code: "application_plan_recovery_changed",
  });
  expect(f.runner.isStopped).not.toHaveBeenCalled();
  expect(f.read).not.toHaveBeenCalled();
});
it("rejects a missing explicit confirmation before database or cloud access", async () => {
  const f = fixture();
  await expect(f.run({})).rejects.toBeDefined();
  expect(f.query).not.toHaveBeenCalled();
  expect(f.runner.isStopped).not.toHaveBeenCalled();
});
it("returns an existing authorized receipt without requiring the removed Runner", async () => {
  const f = fixture();
  f.c.existingReceipt = f.receipt();
  await expect(f.run()).resolves.toEqual(f.c.existingReceipt);
  expect(f.runner.isStopped).not.toHaveBeenCalled();
  expect(f.read).not.toHaveBeenCalled();
  expect(f.recorded()).toBe(false);
});
it("performs no cloud access after a database authorization failure", async () => {
  const f = fixture();
  f.query.mockRejectedValue(
    Object.assign(new Error("denied"), { code: "42501" }),
  );
  await expect(f.run()).rejects.toMatchObject({ code: "42501" });
  expect(f.runner.isStopped).not.toHaveBeenCalled();
  expect(f.read).not.toHaveBeenCalled();
});
it("revalidates bindings in a new transaction after external observations", async () => {
  const f = fixture();
  let checks = 0;
  f.runner.isStopped.mockImplementation(async () => {
    if (++checks === 2) f.c.backendDescriptor.bucket = "changed-bucket";
    return true;
  });
  await expect(f.run()).rejects.toMatchObject({
    code: "application_plan_recovery_changed",
  });
  expect(f.recorded()).toBe(false);
});
