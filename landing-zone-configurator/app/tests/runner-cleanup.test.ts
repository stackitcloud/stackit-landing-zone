import { randomUUID } from "node:crypto";
import type pg from "pg";
import { afterEach, expect, it, vi } from "vitest";
import { CloudFoundryPlanRunner } from "../apps/api/src/plans/cloud-foundry.js";
import {
  type CleanupApp,
  RunnerCleanup,
  runnerOwner,
} from "../apps/api/src/plans/runner-cleanup.js";

afterEach(() => vi.unstubAllGlobals());
const origin = "https://configurator.example";
function fixture() {
  const app: CleanupApp = {
    id: randomUUID(),
    name: `lzc-plan-${randomUUID()}`,
    createdAt: new Date(Date.now() - 2 * 86400000).toISOString(),
    state: "STOPPED",
    owner: null,
  };
  const database = {
    query: vi.fn(
      async (
        _sql: string,
        _values?: unknown[],
      ): Promise<{ rows: Record<string, unknown>[] }> => ({
        rows: _sql.includes("pending_runner_cleanups")
          ? []
          : [{ disposition: "completed" }],
      }),
    ),
  };
  const driver = {
    cleanupSpaceId: randomUUID(),
    cleanupAbsent: vi.fn(async (_id: string) => false),
    cleanupPage: vi.fn(async (_page: number) => ({
      apps: [app],
      nextPage: null as number | null,
    })),
    deleteStoppedRunner: vi.fn(
      async (
        _app: CleanupApp,
        eligible: () => Promise<boolean>,
        intent: () => Promise<void>,
      ) => {
        if (!(await eligible())) return false;
        await intent();
        return true;
      },
    ),
  };
  return {
    app,
    database,
    driver,
    cleanup: new RunnerCleanup(database as unknown as pg.Pool, driver, origin),
  };
}
it("rechecks database eligibility and records only deleted apps without modifying job or State rows", async () => {
  const f = fixture();
  await f.cleanup.maintain();
  expect(f.driver.deleteStoppedRunner).toHaveBeenCalledOnce();
  expect(f.database.query.mock.calls).toHaveLength(5);
  expect(f.database.query.mock.calls.at(-1)?.[0]).toContain(
    "confirm_runner_cleanup",
  );
});
it.each([
  "STARTED",
  "fresh",
  "foreign-owner",
  "template",
  "unknown",
  "unlabelled-orphan",
])("preserves %s apps", async (reason) => {
  const f = fixture();
  if (reason === "STARTED") f.app.state = "STARTED";
  if (reason === "fresh") f.app.createdAt = new Date().toISOString();
  if (reason === "foreign-owner")
    f.app.owner = runnerOwner("https://other.example");
  if (reason === "template") f.app.name = "lzc-plan-template";
  if (reason === "unknown")
    f.database.query.mockResolvedValue({
      rows: [],
    });
  if (reason === "unlabelled-orphan")
    f.database.query.mockImplementation(async (sql: string) => ({
      rows: sql.includes("pending_runner_cleanups")
        ? []
        : [{ disposition: "orphan" }],
    }));
  await f.cleanup.maintain();
  expect(f.driver.deleteStoppedRunner).not.toHaveBeenCalled();
});
it("removes an old stopped origin-labelled orphan and advances bounded pages", async () => {
  const f = fixture();
  f.app.owner = runnerOwner(origin);
  f.database.query.mockImplementation(async (sql: string) => ({
    rows: sql.includes("pending_runner_cleanups")
      ? []
      : [{ disposition: "orphan" }],
  }));
  f.driver.cleanupPage
    .mockResolvedValueOnce({ apps: [f.app], nextPage: 2 })
    .mockResolvedValueOnce({ apps: [], nextPage: null });
  await f.cleanup.maintain();
  await f.cleanup.maintain();
  expect(f.driver.cleanupPage.mock.calls).toEqual([[1], [2]]);
  expect(f.driver.deleteStoppedRunner).toHaveBeenCalledOnce();
});
it("does not record a deletion when final authorization or CF deletion fails", async () => {
  const f = fixture();
  f.driver.deleteStoppedRunner.mockResolvedValue(false);
  await f.cleanup.maintain();
  expect(f.database.query.mock.calls).toHaveLength(2);
  f.driver.deleteStoppedRunner.mockRejectedValueOnce(new Error("CF failed"));
  expect((await f.cleanup.maintain())?.cleanupErrors).toBe(1);
  expect(f.database.query.mock.calls).toHaveLength(4);
});
function cfFixture() {
  const app: CleanupApp = {
    id: randomUUID(),
    name: `lzc-plan-${randomUUID()}`,
    createdAt: new Date(Date.now() - 2 * 86400000).toISOString(),
    state: "STOPPED",
    owner: null,
  };
  const space = randomUUID(),
    process = randomUUID();
  const data: Record<string, unknown> = {
    [`apps/${app.id}`]: {
      guid: app.id,
      name: app.name,
      created_at: app.createdAt,
      state: "STOPPED",
      relationships: { space: { data: { guid: space } } },
    },
    [`apps/${app.id}/routes`]: { resources: [], pagination: { next: null } },
    [`service_credential_bindings?app_guids=${app.id}`]: {
      resources: [],
      pagination: { next: null },
    },
    [`apps/${app.id}/tasks?per_page=100`]: {
      resources: [],
      pagination: { next: null },
    },
    [`apps/${app.id}/processes`]: {
      resources: [{ guid: process }],
      pagination: { next: null },
    },
    [`processes/${process}/stats`]: { resources: [{ state: "DOWN" }] },
  };
  const deletes: string[] = [];
  const deletion = { remainsPresent: false };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: unknown, init: RequestInit) => {
      if (String(url).endsWith("/oauth/token"))
        return new Response(JSON.stringify({ access_token: "test-only" }));
      const path = String(url).split("/v3/")[1]!;
      if (init.method === "DELETE") {
        deletes.push(path);
        return new Response(null, { status: 202 });
      }
      if (deletes.includes(path) && !deletion.remainsPresent)
        return new Response(null, { status: 404 });
      if (!(path in data)) throw new Error("Unexpected CF path");
      return new Response(JSON.stringify(data[path]));
    }),
  );
  const runner = new CloudFoundryPlanRunner({
    username: "test",
    password: "test",
    spaceId: space,
    templateId: randomUUID(),
  });
  return { app, data, process, deletes, runner, deletion };
}
it("deletes only the exact stopped route-free unbound app with terminal processes and tasks", async () => {
  const f = cfFixture();
  expect(await f.runner.deleteStoppedRunner(f.app, async () => true)).toBe(
    true,
  );
  expect(f.deletes).toEqual([`apps/${f.app.id}`]);
});
it.each([
  "task",
  "process",
  "binding",
  "route",
  "pagination",
  "authorization",
  "changed-name",
])("refuses deletion for %s uncertainty", async (reason) => {
  const f = cfFixture();
  if (reason === "task")
    f.data[`apps/${f.app.id}/tasks?per_page=100`] = {
      resources: [{ state: "RUNNING" }],
      pagination: { next: null },
    };
  if (reason === "process")
    f.data[`processes/${f.process}/stats`] = {
      resources: [{ state: "RUNNING" }],
    };
  if (reason === "binding")
    f.data[`service_credential_bindings?app_guids=${f.app.id}`] = {
      resources: [{}],
      pagination: { next: null },
    };
  if (reason === "route")
    f.data[`apps/${f.app.id}/routes`] = {
      resources: [{}],
      pagination: { next: null },
    };
  if (reason === "pagination")
    f.data[`apps/${f.app.id}/tasks?per_page=100`] = {
      resources: [],
      pagination: { next: { href: "untrusted" } },
    };
  if (reason === "changed-name")
    (f.data[`apps/${f.app.id}`] as { name: string }).name = "foreign-app";
  const action = f.runner.deleteStoppedRunner(
    f.app,
    async () => reason !== "authorization",
  );
  if (reason === "changed-name") await expect(action).rejects.toThrow();
  else expect(await action).toBe(false);
  expect(f.deletes).toEqual([]);
});

it("does not confirm deletion when CF accepts DELETE but the app remains present", async () => {
  const f = cfFixture();
  f.deletion.remainsPresent = true;
  expect(await f.runner.deleteStoppedRunner(f.app, async () => true)).toBe(
    false,
  );
  expect(f.deletes).toEqual([`apps/${f.app.id}`]);
});

it("fails closed when CF omits the task pagination completeness marker", async () => {
  const f = cfFixture();
  f.data[`apps/${f.app.id}/tasks?per_page=100`] = {
    resources: [],
    pagination: {},
  };
  await expect(
    f.runner.deleteStoppedRunner(f.app, async () => true),
  ).rejects.toThrow();
  expect(f.deletes).toEqual([]);
});

it("recovers a delayed deletion after a new maintainer instance without issuing DELETE again", async () => {
  const f = fixture();
  const pendingId = randomUUID();
  f.driver.cleanupPage.mockResolvedValue({ apps: [], nextPage: null });
  f.database.query.mockImplementation(async (sql: string) => ({
    rows: sql.includes("pending_runner_cleanups")
      ? [{ app_id: pendingId }]
      : [],
  }));
  f.driver.cleanupAbsent.mockResolvedValue(true);
  const restarted = new RunnerCleanup(
    f.database as unknown as pg.Pool,
    f.driver,
    origin,
  );
  expect((await restarted.maintain())?.deleted).toBe(1);
  expect(f.driver.cleanupAbsent).toHaveBeenCalledWith(pendingId);
  expect(f.driver.deleteStoppedRunner).not.toHaveBeenCalled();
  expect(
    f.database.query.mock.calls.some(([sql]) =>
      sql.includes("confirm_runner_cleanup"),
    ),
  ).toBe(true);
});
it("keeps a still-present pending app unconfirmed without bypassing normal deletion guards", async () => {
  const f = fixture();
  f.driver.cleanupPage.mockResolvedValue({ apps: [], nextPage: null });
  f.database.query.mockImplementation(async (sql: string) => ({
    rows: sql.includes("pending_runner_cleanups")
      ? [{ app_id: randomUUID() }]
      : [],
  }));
  expect((await f.cleanup.maintain())?.deleted).toBe(0);
  expect(
    f.database.query.mock.calls.some(([sql]) =>
      sql.includes("confirm_runner_cleanup"),
    ),
  ).toBe(false);
});
it("does not delete when the durable intent cannot be recorded", async () => {
  const f = cfFixture();
  const intent = vi.fn(async () => {
    throw new Error("database unavailable");
  });
  await expect(
    f.runner.deleteStoppedRunner(f.app, async () => true, intent),
  ).rejects.toThrow("database unavailable");
  expect(f.deletes).toEqual([]);
});

it("isolates pending lookup and confirmation failures while continuing confirmations and the sweep", async () => {
  const f = fixture();
  const ids = [randomUUID(), randomUUID(), randomUUID()];
  f.database.query.mockImplementation(async (sql, values) => {
    if (sql.includes("pending_runner_cleanups"))
      return { rows: ids.map((app_id) => ({ app_id })) };
    if (sql.includes("confirm_runner_cleanup") && values?.[0] === ids[1])
      throw new Error("private database failure");
    return { rows: [{ disposition: "completed" }] };
  });
  f.driver.cleanupAbsent
    .mockRejectedValueOnce(new Error("private CF failure"))
    .mockResolvedValue(true);
  expect(await f.cleanup.maintain()).toMatchObject({
    confirmationErrors: 2,
    cleanupErrors: 0,
    deleted: 2,
    scanned: 1,
  });
  expect(f.driver.cleanupAbsent).toHaveBeenCalledTimes(3);
  expect(f.driver.deleteStoppedRunner).toHaveBeenCalledOnce();
  expect(
    f.database.query.mock.calls.filter(([sql]) =>
      sql.includes("confirm_runner_cleanup"),
    ),
  ).toHaveLength(3);
});
it("continues the sweep after one app fails final cleanup", async () => {
  const f = fixture();
  f.driver.cleanupPage.mockResolvedValue({
    apps: [
      f.app,
      { ...f.app, id: randomUUID(), name: `lzc-plan-${randomUUID()}` },
    ],
    nextPage: null,
  });
  f.driver.deleteStoppedRunner.mockRejectedValueOnce(
    new Error("private CF failure"),
  );
  expect(await f.cleanup.maintain()).toMatchObject({
    cleanupErrors: 1,
    deleted: 1,
    scanned: 2,
  });
});
