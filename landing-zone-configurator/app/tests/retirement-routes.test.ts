import { randomUUID } from "node:crypto";
import { RetirementCloudError } from "@lzc/contracts/recovery";
import { expect, it, vi } from "vitest";
import { buildApp } from "../apps/api/src/app.js";
import type { AuthServices } from "../apps/api/src/auth/routes.js";
import type { Session } from "../apps/api/src/auth/store.js";
import { CredentialError } from "../apps/api/src/credentials/profiles.js";
import type { RetirementExecutionRoutes } from "../apps/api/src/retirements/routes.js";

function fixture(
  execution?: import("../apps/api/src/retirements/routes.js").RetirementExecutionRoutes,
  preparation?: Pick<
    import("../apps/api/src/retirements/preparation.js").RetirementPreparation,
    "prepare" | "homeProject"
  >,
) {
  const session: Session = {
    id: randomUUID(),
    userId: randomUUID(),
    tenantId: randomUUID(),
    githubId: "retirement-test",
    login: "retirement-test",
    csrfToken: "c".repeat(43),
    expiresAt: new Date(Date.now() + 3600000),
  };
  const resolve = vi.fn(async (): Promise<Session | null> => session);
  const auth: AuthServices = {
    origin: "https://configurator.example",
    clientId: "test",
    store: {
      resolveSession: resolve,
      beginLogin: vi.fn(),
      consumeLogin: vi.fn(),
      createSession: vi.fn(),
      deleteSession: vi.fn(),
    },
    github: { authorize: vi.fn() },
    tokens: { get: vi.fn(), put: vi.fn(), remove: vi.fn() },
  };
  const retirements = {
    list: vi.fn(async () => []),
    candidates: vi.fn(async () => []),
    start: vi.fn(),
    change: vi.fn(),
  };
  const app = buildApp({
    auth,
    retirements,
    ...(execution ? { retirementExecution: execution } : {}),
    ...(preparation ? { retirementPreparation: preparation } : {}),
  });
  const headers = {
    cookie: `__Host-lzc-session=${"b".repeat(43)}`,
    origin: auth.origin,
    "x-lzc-csrf": session.csrfToken,
    "x-lzc-tenant": session.tenantId,
  };
  return { app, session, resolve, retirements, headers };
}
it("requires sign-in and an explicit matching workspace even on read requests", async () => {
  const f = fixture();
  try {
    expect((await f.app.inject("/api/v1/retirements")).statusCode).toBe(401);
    expect(
      (
        await f.app.inject({
          url: "/api/v1/retirements",
          headers: { ...f.headers, "x-lzc-tenant": randomUUID() },
        })
      ).statusCode,
    ).toBe(403);
    expect(f.retirements.list).not.toHaveBeenCalled();
    const response = await f.app.inject({
      url: "/api/v1/retirements",
      headers: f.headers,
    });
    expect(response.statusCode).toBe(200);
    expect(response.headers["cache-control"]).toContain("no-store");
    expect(f.retirements.list).toHaveBeenCalledExactlyOnceWith(f.session);
  } finally {
    await f.app.close();
  }
});
it("rejects cross-origin and stale CSRF mutations before calling the controller", async () => {
  const f = fixture();
  try {
    for (const headers of [
      { ...f.headers, origin: "https://evil.example" },
      { ...f.headers, "x-lzc-csrf": "d".repeat(43) },
    ]) {
      expect(
        (
          await f.app.inject({
            method: "POST",
            url: "/api/v1/retirements",
            headers,
            payload: { confirmRetirement: true },
          })
        ).statusCode,
      ).toBe(403);
    }
    expect(f.retirements.start).not.toHaveBeenCalled();
  } finally {
    await f.app.close();
  }
});
it("passes the once-resolved identity and generation-bound action to the controller", async () => {
  const f = fixture(),
    id = randomUUID(),
    body = { generation: 3, action: "pause" };
  try {
    const response = await f.app.inject({
      method: "POST",
      url: `/api/v1/retirements/${id}`,
      headers: f.headers,
      payload: body,
    });
    expect(response.statusCode).toBe(200);
    expect(f.retirements.change).toHaveBeenCalledExactlyOnceWith(
      f.session,
      id,
      body,
    );
  } finally {
    await f.app.close();
  }
});
it("reports admission conflicts without returning raw database errors", async () => {
  const f = fixture();
  f.retirements.change.mockRejectedValue(
    Object.assign(new Error("retirement_changed"), { code: "40001" }),
  );
  try {
    const response = await f.app.inject({
      method: "POST",
      url: `/api/v1/retirements/${randomUUID()}`,
      headers: f.headers,
      payload: { generation: 1, action: "pause" },
    });
    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({ error: "retirement_changed" });
  } finally {
    await f.app.close();
  }
});

it("separates cookie-authorized review from one-job runner and HTTP-State capabilities", async () => {
  const execution = {
    review: vi.fn(async () => ({
      retirementId: randomUUID(),
      generation: 1,
      hasHandoff: false,
      prepared: false,
      canPrepare: false,
      scopes: [],
      jobs: [],
    })),
    plan: vi.fn(),
    apply: vi.fn(),
    preview: vi.fn(),
    inspect: vi.fn(),
    recoveryReview: vi.fn(),
    adoptRecovery: vi.fn(),
    input: vi
      .fn<RetirementExecutionRoutes["input"]>()
      .mockRejectedValue(new CredentialError(409, "retirement_state_changed")),
    stage: vi.fn(),
    artifact: vi.fn(),
    state: vi.fn(async () => ({ version: 4 })),
    result: vi.fn(),
    recovery: vi.fn(),
  };
  const selectedProfile = randomUUID();
  const preparation = {
    prepare: vi.fn(),
    homeProject: vi.fn(async () => ({
      credentialProfileId: selectedProfile,
      projectId: randomUUID(),
      name: "Bootstrap project",
    })),
  };
  const f = fixture(execution, preparation),
    id = randomUUID();
  try {
    const endpoint = `/api/v1/retirements/${id}/credential-project`;
    const payload = { generation: 1, credentialProfileId: selectedProfile };
    expect(
      (
        await f.app.inject({
          method: "POST",
          url: endpoint,
          headers: { ...f.headers, "x-lzc-csrf": "invalid" },
          payload,
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await f.app.inject({
          method: "POST",
          url: endpoint,
          headers: { ...f.headers, "x-lzc-tenant": randomUUID() },
          payload,
        })
      ).statusCode,
    ).toBe(403);
    expect(preparation.homeProject).not.toHaveBeenCalled();
    expect(
      (
        await f.app.inject({
          method: "POST",
          url: endpoint,
          headers: f.headers,
          payload,
        })
      ).statusCode,
    ).toBe(200);
    expect(preparation.homeProject).toHaveBeenCalledWith(
      f.session,
      id,
      payload,
    );
    expect(preparation.prepare).not.toHaveBeenCalled();
    preparation.homeProject.mockRejectedValue(
      new RetirementCloudError("retirement_cloud_access_unverified", 403),
    );
    const denied = await f.app.inject({
      method: "POST",
      url: endpoint,
      headers: f.headers,
      payload,
    });
    expect(denied.statusCode).toBe(409);
    expect(denied.json()).toEqual({
      error: "retirement_cloud_access_unverified",
    });
    expect(
      (
        await f.app.inject({
          url: `/api/v1/retirements/${id}/execution`,
          headers: { ...f.headers, "x-lzc-tenant": randomUUID() },
        })
      ).statusCode,
    ).toBe(403);
    expect(execution.review).not.toHaveBeenCalled();
    expect(
      (
        await f.app.inject({
          url: `/api/v1/retirements/${id}/execution`,
          headers: f.headers,
        })
      ).statusCode,
    ).toBe(200);
    expect(execution.review).toHaveBeenCalledWith(f.session, id);
    expect(
      (
        await f.app.inject({
          method: "POST",
          url: `/api/v1/retirements/${id}/plans`,
          headers: { ...f.headers, "x-lzc-csrf": "invalid" },
          payload: {},
        })
      ).statusCode,
    ).toBe(403);
    expect(execution.plan).not.toHaveBeenCalled();
    expect(
      (
        await f.app.inject({
          method: "POST",
          url: "/api/retirement-runner/input",
          headers: f.headers,
          payload: {},
        })
      ).statusCode,
    ).toBe(401);
    expect(execution.input).not.toHaveBeenCalled();
    const ticket = "a".repeat(43),
      bearer = { authorization: `Bearer ${ticket}` },
      basic = {
        authorization: `Basic ${Buffer.from(`runner:${ticket}`).toString("base64")}`,
      };
    expect(
      (
        await f.app.inject({
          method: "POST",
          url: "/api/retirement-runner/input",
          headers: bearer,
          payload: {},
        })
      ).statusCode,
    ).toBe(409);
    expect(execution.input).toHaveBeenCalledWith(ticket);
    expect(
      (
        await f.app.inject({
          url: "/api/retirement-runner/state",
          headers: bearer,
        })
      ).statusCode,
    ).toBe(401);
    expect(execution.state).not.toHaveBeenCalled();
    const state = await f.app.inject({
      url: "/api/retirement-runner/state",
      headers: basic,
    });
    expect(state.statusCode).toBe(200);
    expect(state.headers["cache-control"]).toBe("no-store");
    expect(execution.state).toHaveBeenCalledWith(ticket, "read");
    expect(
      (
        await f.app.inject({
          method: "POST",
          url: "/api/retirement-runner/input",
          headers: basic,
          payload: {},
        })
      ).statusCode,
    ).toBe(401);
  } finally {
    await f.app.close();
  }
});
