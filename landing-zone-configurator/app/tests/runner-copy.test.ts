import { randomBytes, randomUUID } from "node:crypto";
import { afterEach, expect, it, vi } from "vitest";
import { CloudFoundryPlanRunner } from "../apps/api/src/plans/cloud-foundry.js";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
function fixture(readyAfter: number, state = "STAGED") {
  vi.useFakeTimers();
  const space = randomUUID(),
    template = randomUUID(),
    source = randomUUID(),
    app = randomUUID(),
    copy = randomUUID(),
    job = randomUUID();
  const started = Date.now();
  const calls: { path: string; method: string }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: unknown, init: RequestInit) => {
      const path = String(url).split("/v3/")[1] ?? "token";
      const method = init.method ?? "GET";
      calls.push({ path, method });
      let body: unknown;
      if (path === "token") body = { access_token: "test-private-token" };
      else if (path === `apps/${template}`)
        body = {
          name: "lzc-plan-template",
          relationships: { space: { data: { guid: space } } },
        };
      else if (path === `apps/${template}/droplets/current`)
        body = { guid: source, state: "STAGED" };
      else if (path === "apps" && method === "POST") body = { guid: app };
      else if (path === `droplets?source_guid=${source}` && method === "POST")
        body = { guid: copy };
      else if (path === `droplets/${copy}`)
        body = { state: Date.now() - started < readyAfter ? "COPYING" : state };
      else if (
        path === `apps/${app}/relationships/current_droplet` &&
        method === "PATCH"
      )
        body = {};
      else if (path === `apps/${app}/tasks` && method === "POST") body = {};
      else throw new Error("Unexpected CF request");
      return new Response(JSON.stringify(body));
    }),
  );
  const runner = new CloudFoundryPlanRunner({
    spaceId: space,
    templateId: template,
    dropletId: source,
    username: "test",
    password: "private",
    broker: "retirement",
    inspection: {
      packageId: "test-package",
      retirementEnabled: true,
      acceleratorCommit: "a".repeat(40),
      start: vi.fn(),
      remove: vi.fn(),
      preview: vi.fn(),
      output: vi.fn(),
    },
  });
  const record = vi.fn(async () => {});
  const start = () =>
    runner.start(
      job,
      randomBytes(32).toString("base64url"),
      "https://configurator.example",
      record,
    );
  return { start, calls, record, app, source };
}
it("waits beyond the former 30s poll and 120s request deadlines before dispatching exactly once", async () => {
  const f = fixture(150_000);
  const running = f.start();
  await vi.advanceTimersByTimeAsync(149_000);
  expect(f.calls.some((c) => c.path.endsWith("/tasks"))).toBe(false);
  await vi.advanceTimersByTimeAsync(1000);
  await running;
  expect(f.record).toHaveBeenCalledExactlyOnceWith(f.app, f.source);
  expect(
    f.calls.filter(
      (c) => c.method === "POST" && c.path.startsWith("droplets?"),
    ),
  ).toHaveLength(1);
  expect(f.calls.filter((c) => c.path.endsWith("/tasks"))).toHaveLength(1);
  expect(f.calls.at(-2)?.path).toContain("/relationships/current_droplet");
});
it.each(["FAILED", "EXPIRED", "UNKNOWN"])(
  "does not start or retry a task after a %s copy",
  async (state) => {
    const f = fixture(0, state);
    await expect(f.start()).rejects.toThrow("Runner copy failed");
    expect(f.calls.some((c) => c.path.endsWith("/tasks"))).toBe(false);
    expect(f.calls.some((c) => c.method === "PATCH")).toBe(false);
  },
);
it("bounds observation to five minutes without repeating a copy or starting a task", async () => {
  const f = fixture(Number.POSITIVE_INFINITY);
  const rejected = expect(f.start()).rejects.toThrow("Runner copy failed");
  await vi.advanceTimersByTimeAsync(300_000);
  await rejected;
  expect(
    f.calls.filter(
      (c) => c.method === "POST" && c.path.startsWith("droplets?"),
    ),
  ).toHaveLength(1);
  expect(f.calls.some((c) => c.path.endsWith("/tasks"))).toBe(false);
});
