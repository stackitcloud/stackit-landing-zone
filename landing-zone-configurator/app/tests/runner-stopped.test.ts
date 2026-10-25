import { randomUUID } from "node:crypto";
import { afterEach, expect, it, vi } from "vitest";
import { CloudFoundryPlanRunner } from "../apps/api/src/plans/cloud-foundry.js";

afterEach(() => vi.unstubAllGlobals());
function fixture() {
  const id = randomUUID(),
    app = randomUUID(),
    space = randomUUID(),
    template = randomUUID(),
    source = randomUUID(),
    cloned = randomUUID();
  const checksum = { type: "sha256", value: "a".repeat(64) };
  const data: Record<string, unknown> = {
    [`apps/${app}`]: {
      guid: app,
      name: `lzc-warm-${randomUUID()}`,
      state: "STOPPED",
      relationships: { space: { data: { guid: space } } },
    },
    [`apps/${app}/routes`]: { resources: [] },
    [`droplets/${source}`]: {
      guid: source,
      state: "STAGED",
      checksum,
      relationships: { app: { data: { guid: template } } },
    },
    [`apps/${app}/droplets/current`]: {
      guid: cloned,
      state: "STAGED",
      checksum,
      relationships: { app: { data: { guid: app } } },
    },
    [`apps/${app}/tasks?per_page=100`]: {
      pagination: { next: null },
      resources: [],
    },
    [`apps/${app}/processes/web/stats`]: { resources: [{ state: "DOWN" }] },
  };
  const calls: { url: string; method: string }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: unknown, init: RequestInit) => {
      calls.push({ url: String(url), method: init.method ?? "GET" });
      if (String(url).endsWith("/oauth/token"))
        return new Response(
          JSON.stringify({ access_token: "private-test-token" }),
        );
      const path = String(url).split("/v3/")[1];
      if (!path || !(path in data)) throw new Error("Unexpected path");
      return new Response(JSON.stringify(data[path]));
    }),
  );
  const runner = new CloudFoundryPlanRunner({
    username: "private-test-user",
    password: "private-test-password",
    spaceId: space,
    templateId: template,
    broker: "application",
  });
  const run = () => runner.isStopped(id, app, source);
  return { id, app, space, template, source, cloned, data, calls, run, runner };
}
it("verifies a stopped warm copy by immutable source checksum and exact owning apps", async () => {
  const f = fixture();
  await expect(f.run()).resolves.toBe(true);
  expect(f.cloned).not.toBe(f.source);
  expect(
    f.calls
      .filter((c) => c.url.includes("/v3/"))
      .every((c) => c.method === "GET"),
  ).toBe(true);
});
it("verifies a completed one-shot task on the exact job app", async () => {
  const f = fixture();
  (f.data[`apps/${f.app}`] as { name: string }).name = `lzc-plan-${f.id}`;
  f.data[`apps/${f.app}/tasks?per_page=100`] = {
    pagination: { next: null },
    resources: [{ name: "initial-plan", state: "FAILED" }],
  };
  await expect(f.run()).resolves.toBe(true);
  expect(f.calls.some((c) => c.url.includes("/stats"))).toBe(false);
});
it.each(["RUNNING", "STARTING", "UNKNOWN"])(
  "refuses a %s process even when the app desired state is stopped",
  async (state) => {
    const f = fixture();
    f.data[`apps/${f.app}/processes/web/stats`] = { resources: [{ state }] };
    await expect(f.run()).resolves.toBe(false);
  },
);
it("does not treat empty stats as proof of process loss", async () => {
  const f = fixture();
  f.data[`apps/${f.app}/processes/web/stats`] = { resources: [] };
  await expect(f.run()).resolves.toBe(false);
});
it("refuses an app that is still desired started", async () => {
  const f = fixture();
  (f.data[`apps/${f.app}`] as { state: string }).state = "STARTED";
  await expect(f.run()).resolves.toBe(false);
});
it("refuses any pending task and an incomplete task listing", async () => {
  const f = fixture();
  f.data[`apps/${f.app}/tasks?per_page=100`] = {
    pagination: { next: null },
    resources: [{ name: "initial-plan", state: "RUNNING" }],
  };
  await expect(f.run()).resolves.toBe(false);
  f.data[`apps/${f.app}/tasks?per_page=100`] = {
    pagination: { next: { href: "next-page" } },
    resources: [],
  };
  await expect(f.run()).resolves.toBe(false);
});
it.each([
  "space",
  "name",
  "route",
  "source-owner",
  "copy-owner",
  "checksum",
  "unstaged",
  "same-guid",
])("rejects a mismatched %s boundary", async (kind) => {
  const f = fixture();
  if (kind === "space")
    (f.data[`apps/${f.app}`] as { relationships: unknown }).relationships = {
      space: { data: { guid: randomUUID() } },
    };
  if (kind === "name")
    (f.data[`apps/${f.app}`] as { name: string }).name =
      `lzc-plan-${randomUUID()}`;
  if (kind === "route")
    f.data[`apps/${f.app}/routes`] = { resources: [{ guid: randomUUID() }] };
  if (kind === "source-owner")
    (
      f.data[`droplets/${f.source}`] as { relationships: unknown }
    ).relationships = { app: { data: { guid: randomUUID() } } };
  if (kind === "copy-owner")
    (
      f.data[`apps/${f.app}/droplets/current`] as { relationships: unknown }
    ).relationships = { app: { data: { guid: randomUUID() } } };
  if (kind === "checksum")
    (
      f.data[`apps/${f.app}/droplets/current`] as { checksum: unknown }
    ).checksum = { type: "sha256", value: "b".repeat(64) };
  if (kind === "unstaged")
    (f.data[`apps/${f.app}/droplets/current`] as { state: string }).state =
      "COPYING";
  if (kind === "same-guid")
    (f.data[`apps/${f.app}/droplets/current`] as { guid: string }).guid =
      f.source;
  await expect(f.run()).rejects.toBeDefined();
  expect(
    f.calls
      .filter((c) => c.url.includes("/v3/"))
      .every((c) => c.method === "GET"),
  ).toBe(true);
});

it("checks the exact recovery task without accepting normal or warm runners", async () => {
  const f = fixture();
  await expect(
    f.runner.isRecoveryStopped(f.id, f.app, f.source),
  ).rejects.toThrow("Runner identity mismatch");
  (f.data[`apps/${f.app}`] as { name: string }).name = `lzc-recovery-${f.id}`;
  f.data[`apps/${f.app}/tasks?per_page=100`] = {
    pagination: { next: null },
    resources: [{ name: "initial-plan", state: "SUCCEEDED" }],
  };
  await expect(f.runner.isRecoveryStopped(f.id, f.app, f.source)).resolves.toBe(
    false,
  );
  f.data[`apps/${f.app}/tasks?per_page=100`] = {
    pagination: { next: null },
    resources: [{ name: "state-recovery", state: "FAILED" }],
  };
  await expect(f.runner.isRecoveryStopped(f.id, f.app, f.source)).resolves.toBe(
    true,
  );
  await expect(f.run()).rejects.toThrow("Runner identity mismatch");
});
