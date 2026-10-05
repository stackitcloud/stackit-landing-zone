import { randomUUID } from "node:crypto";
import { expect, it, vi } from "vitest";
import { buildApp } from "../apps/api/src/app.js";
import type { AuthServices } from "../apps/api/src/auth/routes.js";
import type { Session } from "../apps/api/src/auth/store.js";
import { CloudFoundryPlanRunner } from "../apps/api/src/plans/cloud-foundry.js";

it("requires session, CSRF and explicit new-deployment confirmation; exposes no apply endpoint", async () => {
  const session: Session = {
    id: randomUUID(),
    userId: randomUUID(),
    tenantId: randomUUID(),
    githubId: "101",
    login: "alice",
    csrfToken: "c".repeat(43),
    expiresAt: new Date(Date.now() + 3600000),
  };
  const auth: AuthServices = {
    origin: "https://configurator.example",
    clientId: "test",
    store: {
      resolveSession: vi.fn(async () => session),
      beginLogin: vi.fn(),
      consumeLogin: vi.fn(),
      createSession: vi.fn(),
      deleteSession: vi.fn(),
    },
    github: { authorize: vi.fn() },
    tokens: {
      get: vi.fn(async () => "ghu_personal"),
      put: vi.fn(),
      remove: vi.fn(),
    },
  };
  const plans = {
    list: vi.fn(async () => []),
    output: vi.fn(async () => ({
      text: 'resource "stackit_project" "example" {}',
      kind: "saved-plan" as const,
      truncated: false,
    })),
    start: vi.fn(async () => ({ id: randomUUID() })),
    cancel: vi.fn(),
    input: vi.fn(),
    stage: vi.fn(),
    result: vi.fn(),
  };
  const app = buildApp({ auth, plans });
  const headers = {
    cookie: `__Host-lzc-session=${"b".repeat(43)}`,
    origin: auth.origin,
    "x-lzc-csrf": session.csrfToken,
  };
  const payload = { preparationId: randomUUID(), confirmNewDeployment: true };
  try {
    expect((await app.inject("/api/v1/plans")).statusCode).toBe(401);
    const outputId = randomUUID();
    expect(
      (await app.inject(`/api/v1/plans/${outputId}/output`)).statusCode,
    ).toBe(401);
    expect(plans.output).not.toHaveBeenCalled();
    const output = await app.inject({
      method: "GET",
      url: `/api/v1/plans/${outputId}/output`,
      headers,
    });
    expect(output.statusCode).toBe(200);
    expect(output.headers["cache-control"]).toContain("no-store");
    expect(output.json().text).toContain("stackit_project");
    expect(plans.output).toHaveBeenCalledExactlyOnceWith(session, outputId);
    expect(
      (
        await app.inject({
          method: "GET",
          url: "/api/v1/plans/invalid/output",
          headers,
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/v1/plans",
          payload,
          headers: { ...headers, origin: "https://evil.example" },
        })
      ).statusCode,
    ).toBe(403);
    for (const bad of [
      { ...payload, confirmNewDeployment: false },
      { ...payload, command: "apply" },
      { ...payload, tenantId: randomUUID() },
    ])
      expect(
        (
          await app.inject({
            method: "POST",
            url: "/api/v1/plans",
            payload: bad,
            headers,
          })
        ).statusCode,
      ).toBe(400);
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/v1/plans",
          payload,
          headers,
        })
      ).statusCode,
    ).toBe(202);
    expect(plans.start).toHaveBeenCalledExactlyOnceWith(
      session,
      expect.any(Function),
      payload.preparationId,
    );
    expect(auth.tokens.get).not.toHaveBeenCalled();
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/v1/plans",
          headers,
          payload: {
            preparationId: payload.preparationId,
            confirmStateBinding: true,
          },
        })
      ).statusCode,
    ).toBe(202);
    expect(
      (
        await app.inject({
          method: "POST",
          url: `/api/v1/plans/${randomUUID()}/apply`,
          headers,
        })
      ).statusCode,
    ).toBe(404);
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/runner/input",
          payload: {},
        })
      ).statusCode,
    ).toBe(401);
    expect(plans.input).not.toHaveBeenCalled();
  } finally {
    await app.close();
  }
});
it("creates a separate route-free runner app with only its own capability and a fixed command", async () => {
  const spaceId = randomUUID(),
    templateId = randomUUID(),
    appId = randomUUID(),
    source = randomUUID(),
    dropletId = randomUUID();
  const responses = [
    { access_token: "operator-token" },
    {
      name: "lzc-plan-template",
      relationships: { space: { data: { guid: spaceId } } },
    },
    { guid: source, state: "STAGED" },
    { guid: appId },
    { guid: dropletId },
    { state: "STAGED" },
    {},
    {},
  ];
  const calls: { url: string; init: RequestInit | undefined }[] = [];
  const mock = vi.fn(async (url: unknown, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    return new Response(JSON.stringify(responses.shift()), { status: 200 });
  });
  vi.stubGlobal("fetch", mock);
  try {
    const runner = new CloudFoundryPlanRunner({
      username: "operator-user",
      password: "operator-password",
      spaceId,
      templateId,
    });
    const record = vi.fn(async () => {}),
      id = randomUUID();
    await runner.start(
      id,
      "job-ticket",
      "https://configurator.example",
      record,
    );
    expect(record).toHaveBeenCalledWith(appId, source);
    const body = JSON.parse(
      String(calls.find((c) => c.url.endsWith("/v3/apps"))?.init?.body),
    );
    expect(body.environment_variables).toEqual({
      LZC_RUN_TICKET: "job-ticket",
      LZC_BROKER_ORIGIN: "https://configurator.example",
      LZC_RUN_ID: id,
    });
    expect(JSON.stringify(body)).not.toContain("operator-");
    expect(calls.some((c) => c.url.includes("routes"))).toBe(false);
    const task = JSON.parse(String(calls.at(-1)?.init?.body));
    expect(task.command).toBe("./runtime/bin/node apps/worker/dist/main.js");
    expect(task.command).not.toContain("job-ticket");
    expect(calls.every((c) => c.init?.redirect === "error")).toBe(true);
  } finally {
    vi.unstubAllGlobals();
  }
});

it("removes the isolated runner app when droplet dispatch fails", async () => {
  const spaceId = randomUUID(),
    templateId = randomUUID(),
    appId = randomUUID();
  const calls: { url: string; method: string }[] = [];
  let runnerName = "";
  const mock = vi.fn(async (input: unknown, init?: RequestInit) => {
    const url = String(input),
      method = init?.method ?? "GET";
    calls.push({ url, method });
    if (url.endsWith("/oauth/token"))
      return Response.json({ access_token: "operator-token" });
    if (url.endsWith(`/v3/apps/${templateId}`))
      return Response.json({
        name: "lzc-plan-template",
        relationships: { space: { data: { guid: spaceId } } },
      });
    if (url.endsWith(`/v3/apps/${templateId}/droplets/current`))
      return Response.json({ guid: randomUUID(), state: "STAGED" });
    if (url.endsWith("/v3/apps") && method === "POST") {
      runnerName = JSON.parse(String(init?.body)).name;
      return Response.json({ guid: appId });
    }
    if (url.includes("/v3/droplets?source_guid="))
      return Response.json({ error: "copy failed" }, { status: 500 });
    if (url.includes("/v3/apps?space_guids="))
      return Response.json({ resources: [{ guid: appId, name: runnerName }] });
    if (url.endsWith(`/v3/apps/${appId}`) && method === "DELETE")
      return new Response(null, { status: 204 });
    throw new Error("Unexpected runner request");
  });
  vi.stubGlobal("fetch", mock);
  try {
    const runner = new CloudFoundryPlanRunner({
      username: "operator-user",
      password: "operator-password",
      spaceId,
      templateId,
    });
    await expect(
      runner.probe("https://configurator.example", randomUUID()),
    ).rejects.toMatchObject({ operation: "POST droplets", status: 500 });
    expect(runnerName).toMatch(/^lzc-plan-[0-9a-f-]{36}$/);
    expect(calls).toContainEqual({
      url: `https://api.system.01.cf.eu01.stackit.cloud/v3/apps/${appId}`,
      method: "DELETE",
    });
  } finally {
    vi.unstubAllGlobals();
  }
});
