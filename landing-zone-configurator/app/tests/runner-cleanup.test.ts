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
    query: vi.fn(async (_sql: string, _values?: unknown[]) => ({
      rows: [{ disposition: "completed" }],
    })),
  };
  const driver = {
    cleanupPage: vi.fn(async (_page: number) => ({
      apps: [app],
      nextPage: null as number | null,
    })),
    deleteStoppedRunner: vi.fn(
      async (_app: CleanupApp, eligible: () => Promise<boolean>) => eligible(),
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
  expect(f.database.query.mock.calls).toHaveLength(3);
  expect(f.database.query.mock.calls.at(-1)?.[0]).toContain(
    "record_runner_cleanup",
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
      rows: [{ disposition: "protected" }],
    });
  if (reason === "unlabelled-orphan")
    f.database.query.mockResolvedValue({ rows: [{ disposition: "orphan" }] });
  await f.cleanup.maintain();
  expect(f.driver.deleteStoppedRunner).not.toHaveBeenCalled();
});
it("removes an old stopped origin-labelled orphan and advances bounded pages", async () => {
  const f = fixture();
  f.app.owner = runnerOwner(origin);
  f.database.query.mockResolvedValue({ rows: [{ disposition: "orphan" }] });
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
  expect(f.database.query.mock.calls).toHaveLength(1);
  f.driver.deleteStoppedRunner.mockRejectedValueOnce(new Error("CF failed"));
  await expect(f.cleanup.maintain()).rejects.toThrow("CF failed");
  expect(f.database.query.mock.calls).toHaveLength(2);
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
