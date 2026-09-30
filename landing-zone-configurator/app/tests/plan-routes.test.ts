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
      "ghu_personal",
      payload.preparationId,
    );
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
