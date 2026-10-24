import { randomBytes, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { buildApp } from "../apps/api/src/app.js";
import { ArtifactCrypto } from "../apps/api/src/plans/crypto.js";
import { RunnerPool } from "../apps/api/src/plans/runner-pool.js";
import { migrate } from "../apps/api/src/storage/migrations.js";
import { brokerOrigin, type runWorker } from "../apps/worker/src/runner.js";
import { runWarmRunner } from "../apps/worker/src/warm-runner.js";

const address = process.env.LZC_TEST_DATABASE_URL;
if (!address) throw new Error("LZC_TEST_DATABASE_URL required");
const url = new URL(address);
if (
  !["127.0.0.1", "localhost"].includes(url.hostname) ||
  url.pathname !== "/configurator_test"
)
  throw new Error("Refusing a non-local/non-test database");
const admin = new pg.Client({ connectionString: address });
const connection = {
  host: url.hostname,
  port: Number(url.port),
  database: "configurator_test",
  user: "configurator_migration",
  password: "migration-test-only",
};
const migration = new pg.Client(connection);
const database = new pg.Pool({
  ...connection,
  user: "configurator_app",
  password: "runtime-test-only",
  max: 5,
});
const crypto = new ArtifactCrypto(randomBytes(32).toString("base64"));
const config = {
  size: 1,
  origin: brokerOrigin,
  spaceId: randomUUID(),
  templateId: randomUUID(),
  dropletId: randomUUID(),
};
const slots = new Map<string, { ticket: string; appId: string }>();
const driver = {
  prepareWarm: vi.fn(
    async (
      id: string,
      ticket: string,
      _origin: string,
      record: (appId: string, source: string) => Promise<void>,
    ) => {
      const appId = randomUUID();
      slots.set(id, { ticket, appId });
      await record(appId, config.dropletId);
    },
  ),
  removeWarm: vi.fn(async () => {}),
};
const create = (overrides: Partial<typeof config> = {}) =>
  new RunnerPool(database, crypto, driver, { ...config, ...overrides });
const job = () => ({
  id: randomUUID(),
  ticket: randomBytes(32).toString("base64url"),
  broker: "platform" as const,
});
async function ready(pool: RunnerPool) {
  await pool.maintain();
  const [id, slot] = [...slots].at(-1) ?? [];
  if (!id || !slot) throw new Error("Missing prepared runner");
  expect(await pool.claim(id, slot.ticket)).toBeNull();
  return { id, ...slot };
}

beforeAll(async () => {
  await admin.connect();
  await admin.query(
    "DO $$ BEGIN IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='configurator_migration') THEN CREATE ROLE configurator_migration LOGIN PASSWORD 'migration-test-only'; END IF; IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='configurator_app') THEN CREATE ROLE configurator_app LOGIN PASSWORD 'runtime-test-only'; END IF; END $$",
  );
  await admin.query(
    "ALTER DATABASE configurator_test OWNER TO configurator_migration",
  );
  await migration.connect();
  const directory = fileURLToPath(new URL("../apps/api/db/", import.meta.url));
  await migrate(migration, directory);
  await migrate(migration, directory);
});
beforeEach(async () => {
  await database.query("DELETE FROM lzc.runner_pool_slots");
  slots.clear();
  driver.prepareWarm.mockClear();
  driver.removeWarm.mockClear();
});
afterAll(async () => {
  await database.query("DELETE FROM lzc.runner_pool_slots");
  await database.end();
  await migration.end();
  await admin.end();
});

it("encrypts an assignment, records identity before handoff, consumes once and replenishes a fresh slot", async () => {
  const pool = create();
  const slot = await ready(pool);
  const assignment = job();
  const record = vi.fn(async (appId: string, source: string) => {
    expect(appId).toBe(slot.appId);
    expect(source).toBe(config.dropletId);
    expect(await pool.claim(slot.id, slot.ticket)).toBeNull();
  });
  expect(
    await pool.start(
      assignment.id,
      assignment.ticket,
      config.origin,
      assignment.broker,
      record,
    ),
  ).toBe(true);
  const stored = await database.query(
    "SELECT token_hash,assignment FROM lzc.runner_pool_slots WHERE id=$1",
    [slot.id],
  );
  expect(JSON.stringify(stored.rows)).not.toContain(assignment.ticket);
  expect(JSON.stringify(stored.rows)).not.toContain(slot.ticket);
  expect(stored.rows[0].assignment).toBeInstanceOf(Buffer);
  expect(await pool.claim(slot.id, slot.ticket)).toEqual(assignment);
  await expect(pool.claim(slot.id, slot.ticket)).rejects.toThrow();
  const consumed = await database.query(
    "SELECT token_hash,assignment,status FROM lzc.runner_pool_slots WHERE id=$1",
    [slot.id],
  );
  expect(consumed.rows[0]).toEqual({
    token_hash: null,
    assignment: null,
    status: "consumed",
  });
  await pool.maintain();
  expect(driver.prepareWarm).toHaveBeenCalledTimes(2);
  await pool.remove(assignment.id, slot.appId);
  expect(driver.removeWarm).toHaveBeenCalledWith(slot.id, slot.appId);
});

it("leases a standby to at most one concurrent job", async () => {
  const pool = create();
  const slot = await ready(pool);
  const assignments = [job(), job()];
  const record = vi.fn(async () => {});
  const results = await Promise.all(
    assignments.map((assignment) =>
      pool.start(
        assignment.id,
        assignment.ticket,
        config.origin,
        assignment.broker,
        record,
      ),
    ),
  );
  expect(results.filter(Boolean)).toHaveLength(1);
  expect(record).toHaveBeenCalledTimes(1);
  const assigned = await pool.claim(slot.id, slot.ticket);
  expect(assigned?.id).toBe(assignments[results.indexOf(true)]?.id);
});

it("uses a ready standby after a brief concurrent claim lock", async () => {
  const pool = create();
  const slot = await ready(pool);
  const claimant = await database.connect();
  let release: Promise<unknown> | undefined;
  try {
    await claimant.query("BEGIN");
    await claimant.query(
      "SELECT id FROM lzc.runner_pool_slots WHERE id=$1 FOR UPDATE",
      [slot.id],
    );
    const assignment = job();
    const record = vi.fn(async () => {});
    release = sleep(100).then(() => claimant.query("COMMIT"));
    expect(
      await pool.start(
        assignment.id,
        assignment.ticket,
        config.origin,
        "application",
        record,
      ),
    ).toBe(true);
    expect(record).toHaveBeenCalledExactlyOnceWith(
      slot.appId,
      config.dropletId,
    );
    expect(await pool.claim(slot.id, slot.ticket)).toEqual({
      ...assignment,
      broker: "application",
    });
  } finally {
    await release;
    await claimant.query("ROLLBACK");
    claimant.release();
  }
});

it("falls back without assigning a standby whose claim lock remains held", async () => {
  const pool = create();
  const slot = await ready(pool);
  const claimant = await database.connect();
  try {
    await claimant.query("BEGIN");
    await claimant.query(
      "SELECT id FROM lzc.runner_pool_slots WHERE id=$1 FOR UPDATE",
      [slot.id],
    );
    const assignment = job();
    const record = vi.fn(async () => {});
    expect(
      await pool.start(
        assignment.id,
        assignment.ticket,
        config.origin,
        "application",
        record,
      ),
    ).toBe(false);
    expect(record).not.toHaveBeenCalled();
    const stored = await claimant.query(
      "SELECT status,job_id,assignment FROM lzc.runner_pool_slots WHERE id=$1",
      [slot.id],
    );
    expect(stored.rows[0]).toEqual({
      status: "ready",
      job_id: null,
      assignment: null,
    });
  } finally {
    await claimant.query("ROLLBACK");
    claimant.release();
  }
});

it("serializes pool capacity across API replicas", async () => {
  const first = create();
  const second = create();
  await Promise.all([first.maintain(), second.maintain()]);
  expect(driver.prepareWarm).toHaveBeenCalledTimes(1);
  const result = await database.query(
    "SELECT count(*)::int AS count FROM lzc.runner_pool_slots",
  );
  expect(result.rows[0].count).toBe(1);
});

it("never leases an old source, stale standby or another pool's capability", async () => {
  const pool = create();
  const slot = await ready(pool);
  const current = create({ dropletId: randomUUID() });
  const assignment = job();
  expect(
    await current.start(
      assignment.id,
      assignment.ticket,
      config.origin,
      "platform",
      vi.fn(),
    ),
  ).toBe(false);
  await expect(current.claim(slot.id, slot.ticket)).rejects.toThrow();
  await expect(
    pool.claim(slot.id, randomBytes(32).toString("base64url")),
  ).rejects.toThrow();
  await database.query(
    "UPDATE lzc.runner_pool_slots SET last_seen_at=now()-interval '20 seconds' WHERE id=$1",
    [slot.id],
  );
  expect(
    await pool.start(
      assignment.id,
      assignment.ticket,
      config.origin,
      "platform",
      vi.fn(),
    ),
  ).toBe(false);
  await pool.maintain();
  expect(driver.removeWarm).toHaveBeenCalledWith(slot.id, slot.appId);
});

it("fails closed after record errors, expired reservations and duplicate dispatch", async () => {
  const pool = create();
  const slot = await ready(pool);
  const assignment = job();
  await expect(
    pool.start(
      assignment.id,
      assignment.ticket,
      config.origin,
      "platform",
      async () => {
        throw new Error("record failed");
      },
    ),
  ).rejects.toThrow("record failed");
  await expect(pool.claim(slot.id, slot.ticket)).rejects.toThrow();
  await pool.maintain();
  const next = await ready(pool);
  const second = job();
  await expect(
    pool.start(
      second.id,
      second.ticket,
      config.origin,
      "platform",
      async () => {
        await database.query(
          "UPDATE lzc.runner_pool_slots SET expires_at=now()-interval '1 second' WHERE id=$1",
          [next.id],
        );
      },
    ),
  ).rejects.toThrow("reservation_expired");
  await pool.maintain();
  const thirdSlot = await ready(pool);
  const third = job();
  expect(
    await pool.start(
      third.id,
      third.ticket,
      config.origin,
      "platform",
      vi.fn(async () => {}),
    ),
  ).toBe(true);
  await expect(
    pool.start(
      third.id,
      third.ticket,
      config.origin,
      "platform",
      vi.fn(async () => {}),
    ),
  ).rejects.toThrow("already_dispatched");
  expect(await pool.claim(thirdSlot.id, thirdSlot.ticket)).toEqual(third);
});

it("retains a retiring lease after CF deletion failure and retries before replenishing", async () => {
  const pool = create();
  const slot = await ready(pool);
  await database.query(
    "UPDATE lzc.runner_pool_slots SET status='retiring',token_hash=NULL WHERE id=$1",
    [slot.id],
  );
  driver.removeWarm.mockRejectedValueOnce(new Error("CF deletion unavailable"));
  await expect(pool.maintain()).rejects.toThrow("CF deletion unavailable");
  expect(
    (
      await database.query(
        "SELECT status,app_id FROM lzc.runner_pool_slots WHERE id=$1",
        [slot.id],
      )
    ).rows,
  ).toEqual([{ status: "retiring", app_id: slot.appId }]);
  expect(driver.prepareWarm).toHaveBeenCalledTimes(1);
  await pool.maintain();
  expect(driver.removeWarm).toHaveBeenNthCalledWith(2, slot.id, slot.appId);
  expect(
    (
      await database.query("SELECT id FROM lzc.runner_pool_slots WHERE id=$1", [
        slot.id,
      ])
    ).rowCount,
  ).toBe(0);
  expect(driver.prepareWarm).toHaveBeenCalledTimes(2);
});

it("drains idle capacity when disabled without killing a consumed job", async () => {
  const pool = create();
  const slot = await ready(pool);
  const assignment = job();
  await pool.start(
    assignment.id,
    assignment.ticket,
    config.origin,
    "application",
    vi.fn(async () => {}),
  );
  expect((await pool.claim(slot.id, slot.ticket))?.broker).toBe("application");
  await ready(pool);
  const disabled = create({ size: 0 });
  await disabled.maintain();
  expect(driver.removeWarm).toHaveBeenCalledTimes(1);
  const result = await database.query(
    "SELECT status FROM lzc.runner_pool_slots",
  );
  expect(result.rows).toEqual([{ status: "consumed" }]);
  await disabled.remove(assignment.id, null);
  expect(driver.removeWarm).toHaveBeenCalledWith(slot.id, slot.appId);
});

it("binds encrypted assignments to the slot and rejects tampering without issuing a ticket", async () => {
  const pool = create();
  const slot = await ready(pool);
  const assignment = job();
  await pool.start(
    assignment.id,
    assignment.ticket,
    config.origin,
    "platform",
    vi.fn(async () => {}),
  );
  await database.query(
    "UPDATE lzc.runner_pool_slots SET assignment=decode('deadbeef','hex') WHERE id=$1",
    [slot.id],
  );
  await expect(pool.claim(slot.id, slot.ticket)).rejects.toThrow(
    "artifact_invalid",
  );
});

it("reaps an abandoned consumed operator probe but not an actual customer job", async () => {
  const pool = create();
  const slot = await ready(pool);
  const assignment = job();
  await pool.start(
    assignment.id,
    assignment.ticket,
    config.origin,
    "platform",
    vi.fn(async () => {}),
    true,
  );
  await pool.claim(slot.id, slot.ticket);
  await database.query(
    "UPDATE lzc.runner_pool_slots SET expires_at=now()-interval '1 second' WHERE id=$1",
    [slot.id],
  );
  await pool.maintain();
  expect(driver.removeWarm).toHaveBeenCalledWith(slot.id, slot.appId);
  const next = await ready(pool);
  const actual = job();
  await pool.start(
    actual.id,
    actual.ticket,
    config.origin,
    "platform",
    vi.fn(async () => {}),
  );
  await pool.claim(next.id, next.ticket);
  await database.query(
    "UPDATE lzc.runner_pool_slots SET expires_at=now()-interval '1 second' WHERE id=$1",
    [next.id],
  );
  await pool.maintain();
  expect(driver.removeWarm).not.toHaveBeenCalledWith(next.id, next.appId);
});

it("prepares capacity concurrently and waits for successful launches before surfacing a failed slot", async () => {
  const pool = create({ size: 2 });
  driver.prepareWarm.mockRejectedValueOnce(new Error("prepare failed"));
  await expect(pool.maintain()).rejects.toThrow("prepare failed");
  expect(driver.prepareWarm).toHaveBeenCalledTimes(2);
  const result = await database.query(
    "SELECT status FROM lzc.runner_pool_slots ORDER BY status",
  );
  expect(result.rows).toEqual([{ status: "retiring" }, { status: "warming" }]);
  await pool.maintain();
  expect(driver.removeWarm).toHaveBeenCalledTimes(1);
});

it("qualifies operator handoff, removes the probe and waits for a fresh ready replacement", async () => {
  const pool = create();
  let pending: Promise<void> | undefined;
  const failures: unknown[] = [];
  const pump = () => {
    if (pending) return pending;
    pending = (async () => {
      await pool.maintain();
      const result = await database.query<{ id: string }>(
        "SELECT id FROM lzc.runner_pool_slots WHERE status IN ('warming','ready','assigned')",
      );
      for (const { id } of result.rows) {
        const slot = slots.get(id);
        if (!slot) throw new Error("Missing simulated process");
        await pool.claim(id, slot.ticket);
      }
    })()
      .catch((error: unknown) => {
        failures.push(error);
      })
      .finally(() => {
        pending = undefined;
      });
    return pending;
  };
  const interval = setInterval(() => void pump(), 20);
  try {
    await pump();
    const timings = await pool.probe();
    expect(failures).toEqual([]);
    expect(Object.keys(timings)).toHaveLength(4);
    for (const milliseconds of Object.values(timings))
      expect(milliseconds).toBeGreaterThanOrEqual(0);
    expect(driver.removeWarm).toHaveBeenCalledTimes(1);
    const result = await database.query(
      "SELECT status,is_probe,job_id FROM lzc.runner_pool_slots",
    );
    expect(result.rows).toEqual([
      { status: "ready", is_probe: false, job_id: null },
    ]);
  } finally {
    clearInterval(interval);
    await pending;
  }
});

it("hands a real database lease through the HTTP broker to exactly one waiting worker", async () => {
  const pool = create();
  await pool.maintain();
  const [id, slot] = [...slots].at(-1) ?? [];
  if (!id || !slot) throw new Error("Missing prepared runner");
  const app = buildApp({ runnerPool: pool });
  const local = await app.listen({ port: 0, host: "127.0.0.1" });
  const controller = new AbortController();
  const fetch = globalThis.fetch;
  vi.stubGlobal(
    "fetch",
    async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (!url.startsWith(`${brokerOrigin}/api/internal/runner-pool/`))
        throw new Error("External requests forbidden in this contract test");
      return fetch(url.replace(brokerOrigin, local), init);
    },
  );
  const execute = vi.fn<typeof runWorker>(async () => "succeeded");
  const worker = runWarmRunner(
    {
      root: "/tmp/runner-pool-contract",
      signal: controller.signal,
      env: {
        LZC_POOL_RUNNER_ID: id,
        LZC_POOL_TICKET: slot.ticket,
        LZC_BROKER_ORIGIN: brokerOrigin,
      },
    },
    {
      execute,
      wait: async () => {
        await new Promise((resolve) => setTimeout(resolve, 5));
      },
    },
  ).then(
    (outcome) => ({ outcome }),
    (error: unknown) => ({ error }),
  );
  try {
    const deadline = Date.now() + 3000;
    for (;;) {
      const result = await database.query(
        "SELECT status FROM lzc.runner_pool_slots WHERE id=$1",
        [id],
      );
      if (result.rows[0]?.status === "ready") break;
      if (Date.now() > deadline)
        throw new Error("Waiting worker did not become ready");
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    expect(execute).not.toHaveBeenCalled();
    const assignment = job();
    await pool.start(
      assignment.id,
      assignment.ticket,
      brokerOrigin,
      "application",
      vi.fn(async () => {}),
    );
    expect(await worker).toEqual({ outcome: "succeeded" });
    expect(execute).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        id: assignment.id,
        ticket: assignment.ticket,
        broker: "application",
        brokerOrigin,
        root: "/tmp/runner-pool-contract",
      }),
    );
    const replay = await app.inject({
      method: "POST",
      url: `/api/internal/runner-pool/${id}/claim`,
      headers: { authorization: `Bearer ${slot.ticket}` },
    });
    expect(replay.statusCode).toBe(401);
    await pool.remove(assignment.id, slot.appId);
  } finally {
    controller.abort();
    await worker;
    vi.unstubAllGlobals();
    await app.close();
  }
});

it("atomically rewarms only a fresh unassigned exact-source lease and rotates its capability", async () => {
  const pool = create();
  const slot = await ready(pool);
  const sql = await readFile(
    new URL("../../infra/recovery-lab/hold_lease.sql", import.meta.url),
    "utf8",
  );
  const ticket = randomBytes(32).toString("base64url");
  const { createHash } = await import("node:crypto");
  const hash = createHash("sha256").update(ticket).digest("hex");
  for (const [space, source] of [
    [randomUUID(), config.dropletId],
    [config.spaceId, randomUUID()],
  ])
    expect(
      (await database.query(sql, [space, config.origin, source, hash]))
        .rowCount,
    ).toBe(0);
  const leased = await database.query(sql, [
    config.spaceId,
    config.origin,
    config.dropletId,
    hash,
  ]);
  expect(leased.rows).toEqual([
    { id: slot.id, app_id: slot.appId, source_droplet_id: config.dropletId },
  ]);
  await expect(pool.claim(slot.id, slot.ticket)).rejects.toThrow();
  await pool.maintain();
  expect(driver.prepareWarm).toHaveBeenCalledTimes(1);
  expect(await pool.claim(slot.id, ticket)).toBeNull();
  const assignment = job();
  await pool.start(
    assignment.id,
    assignment.ticket,
    config.origin,
    "application",
    async () => {},
  );
  expect(
    (
      await database.query(sql, [
        config.spaceId,
        config.origin,
        config.dropletId,
        hash,
      ])
    ).rowCount,
  ).toBe(0);
  expect((await pool.claim(slot.id, ticket))?.id).toBe(assignment.id);
});
