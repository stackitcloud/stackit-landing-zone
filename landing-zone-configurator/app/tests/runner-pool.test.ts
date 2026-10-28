import { randomBytes, randomUUID } from "node:crypto";
import { afterEach, expect, it, vi } from "vitest";
import { buildApp } from "../apps/api/src/app.js";
import { CloudFoundryPlanRunner } from "../apps/api/src/plans/cloud-foundry.js";
import {
  RunnerPoolAuthorizationError,
  runnerPoolSize,
} from "../apps/api/src/plans/runner-pool.js";

afterEach(() => vi.unstubAllGlobals());

it.each([undefined, "0", "1", "4"])(
  "accepts bounded warm capacity %s",
  (value) => {
    expect(runnerPoolSize(value)).toBe(Number(value ?? 0));
  },
);
it.each(["", "-1", "5", "1.0", " 1", "true", "NaN"])(
  "rejects invalid warm capacity %s",
  (value) =>
    expect(() => runnerPoolSize(value)).toThrow("runner_pool_size_invalid"),
);

it("prepares a fixed-source route-free single-instance process without any job capability", async () => {
  const spaceId = randomUUID();
  const templateId = randomUUID();
  const source = randomUUID();
  const appId = randomUUID();
  const copied = randomUUID();
  const processId = randomUUID();
  const id = randomUUID();
  const ticket = randomBytes(32).toString("base64url");
  const responses = [
    { access_token: "operator-private-token" },
    {
      name: "lzc-plan-template",
      relationships: { space: { data: { guid: spaceId } } },
    },
    { guid: source, state: "STAGED" },
    { guid: appId },
    { guid: copied },
    { state: "STAGED" },
    {},
    { guid: processId },
    {},
    {},
    {},
  ];
  const calls: { url: string; body: unknown; method: string }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: unknown, init: RequestInit) => {
      calls.push({
        url: String(url),
        body: typeof init.body === "string" ? JSON.parse(init.body) : null,
        method: init.method ?? "GET",
      });
      expect(init.redirect).toBe("error");
      return new Response(JSON.stringify(responses.shift()), { status: 200 });
    }),
  );
  const runner = new CloudFoundryPlanRunner({
    spaceId,
    templateId,
    dropletId: source,
    username: "operator-private-user",
    password: "operator-private-password",
  });
  const record = vi.fn(async () => {});
  await runner.prepareWarm(id, ticket, "https://configurator.example", record);
  expect(record).toHaveBeenCalledExactlyOnceWith(appId, source);
  const create = calls.find((call) => call.url.endsWith("/v3/apps"));
  expect(create?.body).toMatchObject({
    name: `lzc-warm-${id}`,
    environment_variables: {
      LZC_POOL_RUNNER_ID: id,
      LZC_POOL_TICKET: ticket,
      LZC_BROKER_ORIGIN: "https://configurator.example",
    },
  });
  expect(JSON.stringify(create?.body)).not.toContain("operator-private");
  expect(JSON.stringify(create?.body)).not.toContain("LZC_RUN_TICKET");
  expect(
    calls.some((call) => /routes|tasks|service_credential/.test(call.url)),
  ).toBe(false);
  expect(
    calls.find((call) => call.url.endsWith(`/processes/${processId}`))?.body,
  ).toEqual({
    command: "./runtime/bin/node apps/worker/dist/main.js",
    health_check: { type: "process" },
  });
  expect(
    calls.find((call) =>
      call.url.endsWith(`/processes/${processId}/actions/scale`),
    )?.body,
  ).toEqual({
    instances: 1,
    memory_in_mb: 1024,
    disk_in_mb: 4096,
  });
  expect(calls.at(-1)?.url).toContain(`/apps/${appId}/actions/start`);
});

it("dispatches a ready warm runner without CF authentication, copying or task creation", async () => {
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  const start = vi.fn(async () => true);
  const runner = new CloudFoundryPlanRunner({
    spaceId: randomUUID(),
    templateId: randomUUID(),
    username: "operator",
    password: "private",
    warm: { start, remove: vi.fn(async () => true) },
  });
  const id = randomUUID();
  const record = vi.fn();
  await runner.start(id, "job-ticket", "https://configurator.example", record);
  expect(start).toHaveBeenCalledExactlyOnceWith(
    id,
    "job-ticket",
    "https://configurator.example",
    "platform",
    record,
  );
  expect(fetch).not.toHaveBeenCalled();
  await runner.remove(id, randomUUID());
  expect(fetch).not.toHaveBeenCalled();
});

it("does not silently fall back after a warm reservation or recording failure", async () => {
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  const runner = new CloudFoundryPlanRunner({
    spaceId: randomUUID(),
    templateId: randomUUID(),
    username: "operator",
    password: "private",
    warm: {
      start: vi.fn(async () => {
        throw new Error("record_failed");
      }),
      remove: vi.fn(async () => false),
    },
  });
  await expect(
    runner.start(
      randomUUID(),
      "ticket",
      "https://configurator.example",
      vi.fn(),
    ),
  ).rejects.toThrow("record_failed");
  expect(fetch).not.toHaveBeenCalled();
});

it("exposes only bearer-authenticated no-store assignment claims", async () => {
  const ticket = randomBytes(32).toString("base64url");
  const assignment = {
    id: randomUUID(),
    ticket: randomBytes(32).toString("base64url"),
    broker: "platform" as const,
  };
  const claim = vi.fn(async () => null as typeof assignment | null);
  const app = buildApp({ runnerPool: { claim } });
  const url = `/api/internal/runner-pool/${randomUUID()}/claim`;
  try {
    const unauthorized = await app.inject({
      method: "POST",
      url,
      headers: { cookie: "session=fake" },
    });
    expect(unauthorized.statusCode).toBe(401);
    expect(claim).not.toHaveBeenCalled();
    const headers = { authorization: `Bearer ${ticket}` };
    const ready = await app.inject({ method: "POST", url, headers });
    expect(ready.statusCode).toBe(204);
    expect(ready.headers["cache-control"]).toBe("no-store");
    claim.mockResolvedValueOnce(assignment);
    const assigned = await app.inject({ method: "POST", url, headers });
    expect(assigned.json()).toEqual(assignment);
    const invalid = await app.inject({
      method: "POST",
      url,
      headers,
      payload: { job: assignment },
    });
    expect(invalid.statusCode).toBe(400);
    claim.mockRejectedValueOnce(new RunnerPoolAuthorizationError());
    const expired = await app.inject({ method: "POST", url, headers });
    expect(expired.statusCode).toBe(401);
    expect(expired.body).not.toContain(ticket);
    claim.mockRejectedValueOnce(new Error("sensitive database detail"));
    const failed = await app.inject({ method: "POST", url, headers });
    expect(failed.statusCode).toBe(503);
    expect(failed.body).not.toContain("sensitive");
  } finally {
    await app.close();
  }
});

it("delegates historical Application source support to validated package inspection without changing pool capacity", () => {
  const supportsAccelerator = vi.fn(
    (revision: string) => revision === "historical-reviewed-source",
  );
  const runner = new CloudFoundryPlanRunner({
    spaceId: randomUUID(),
    templateId: randomUUID(),
    dropletId: randomUUID(),
    username: "fixture",
    password: "fixture",
    broker: "application",
    inspection: {
      packageId: "package-fixture",
      acceleratorCommit: "current-source",
      supportsAccelerator,
      preview: async () => ({}),
      output: async () => ({ text: "", truncated: false, kind: "live" }),
      start: async () => {},
      remove: async () => {},
    },
  });
  expect(runner.supportsAccelerator("historical-reviewed-source")).toBe(true);
  expect(runner.supportsAccelerator("unbundled-source")).toBe(false);
  expect(supportsAccelerator).toHaveBeenCalledTimes(2);
});
