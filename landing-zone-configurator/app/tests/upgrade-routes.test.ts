import { randomUUID } from "node:crypto";
import { expect, it, vi } from "vitest";
import { buildApp } from "../apps/api/src/app.js";
import type { AuthServices } from "../apps/api/src/auth/routes.js";
import type { Session } from "../apps/api/src/auth/store.js";

it("keeps impact inspection read-only and binds acknowledgement to authenticated session, CSRF and plan identity", async () => {
  const session: Session = {
    id: randomUUID(),
    userId: randomUUID(),
    tenantId: randomUUID(),
    githubId: "test",
    login: "test",
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
    tokens: { get: vi.fn(), put: vi.fn(), remove: vi.fn() },
  };
  const planId = randomUUID();
  const view = {
    planId,
    artifactSha256: "a".repeat(64),
    dependencyHash: "b".repeat(64),
    classification: "sensitive" as const,
    affectedApplications: [],
    blockers: [],
    acknowledged: false,
    canAcknowledge: true,
  };
  const inspect = vi.fn(async () => view);
  const acknowledge = vi.fn(async () => ({
    ...view,
    acknowledged: true,
    canAcknowledge: false,
  }));
  const plans = {
    list: vi.fn(async () => []),
    start: vi.fn(),
    cancel: vi.fn(),
    input: vi.fn(),
    stage: vi.fn(),
    result: vi.fn(),
    applicationImpact: inspect,
    acknowledgeApplicationImpact: acknowledge,
  };
  const app = buildApp({ auth, plans });
  const headers = {
    cookie: `__Host-lzc-session=${"b".repeat(43)}`,
    origin: auth.origin,
    "x-lzc-csrf": session.csrfToken,
  };
  const path = `/api/v1/plans/${planId}/application-impact`;
  const payload = {
    artifactSha256: "a".repeat(64),
    dependencyHash: "b".repeat(64),
    confirmImpact: true,
  };
  try {
    expect((await app.inject(path)).statusCode).toBe(401);
    const inspected = await app.inject({ method: "GET", url: path, headers });
    expect(inspected.statusCode).toBe(200);
    expect(inspected.headers["cache-control"]).toContain("no-store");
    expect(inspect).toHaveBeenCalledExactlyOnceWith(session, planId);
    expect(acknowledge).not.toHaveBeenCalled();
    for (const bad of [
      { ...headers, origin: "https://evil.example" },
      { cookie: headers.cookie, origin: headers.origin },
    ])
      expect(
        (await app.inject({ method: "POST", url: path, headers: bad, payload }))
          .statusCode,
      ).toBe(403);
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/v1/plans/invalid/application-impact",
          headers,
          payload,
        })
      ).statusCode,
    ).toBe(400);
    expect(acknowledge).not.toHaveBeenCalled();
    expect(
      (await app.inject({ method: "POST", url: path, headers, payload }))
        .statusCode,
    ).toBe(200);
    expect(acknowledge).toHaveBeenCalledExactlyOnceWith(
      session,
      planId,
      payload,
    );
    acknowledge.mockRejectedValueOnce(
      Object.assign(new Error("platform_impact_changed"), { code: "40001" }),
    );
    const stale = await app.inject({
      method: "POST",
      url: path,
      headers,
      payload,
    });
    expect(stale.statusCode).toBe(409);
    expect(stale.json()).toEqual({ error: "platform_impact_changed" });
    expect(plans.start).not.toHaveBeenCalled();
    expect(auth.tokens.get).not.toHaveBeenCalled();
  } finally {
    await app.close();
  }
});

it("distinguishes invalid publication policies and immutable path conflicts from authorization failures", async () => {
  const session: Session = {
    id: randomUUID(),
    userId: randomUUID(),
    tenantId: randomUUID(),
    githubId: "test",
    login: "test",
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
    tokens: { get: vi.fn(), put: vi.fn(), remove: vi.fn() },
  };
  const publishUpgradeEdge = vi.fn();
  const applications = {
    listTemplates: vi.fn(),
    publish: vi.fn(),
    retire: vi.fn(),
    listInstances: vi.fn(),
    order: vi.fn(),
    listPlatformContracts: vi.fn(),
    approvePlatformContract: vi.fn(),
    preparePlanInput: vi.fn(),
    publishUpgradeEdge,
  };
  const app = buildApp({ auth, applications });
  const headers = {
    cookie: `__Host-lzc-session=${"b".repeat(43)}`,
    origin: auth.origin,
    "x-lzc-csrf": session.csrfToken,
    "x-lzc-tenant": session.tenantId,
  };
  const payload = {
    fromVersionId: randomUUID(),
    toVersionId: randomUUID(),
    policy: { sensitive: "direct" },
    confirmPublication: true,
  };
  try {
    for (const [code, message, status] of [
      ["42501", "application_upgrade_edge_invalid", 409],
      ["40001", "application_upgrade_edge_changed", 409],
      ["40001", "application_upgrade_binding_changed", 409],
      ["40001", "application_upgrade_platform_changed", 409],
      ["40001", "application_grant_consumed", 409],
      ["40001", "application_backend_binding_conflict", 409],
      ["42501", "permission_denied", 403],
    ] as const) {
      publishUpgradeEdge.mockRejectedValueOnce(
        Object.assign(new Error(message), { code }),
      );
      const response = await app.inject({
        method: "POST",
        url: "/api/v1/applications/template-upgrades",
        headers,
        payload,
      });
      expect(response.statusCode).toBe(status);
      expect(response.json()).toEqual({
        error: status === 403 ? "application_access_denied" : message,
      });
    }
    publishUpgradeEdge.mockRejectedValueOnce(
      Object.assign(new Error("internal SQL detail must stay private"), {
        code: "40001",
      }),
    );
    const unknown = await app.inject({
      method: "POST",
      url: "/api/v1/applications/template-upgrades",
      headers,
      payload,
    });
    expect(unknown.statusCode).toBe(409);
    expect(unknown.json()).toEqual({ error: "application_request_conflict" });
    expect(publishUpgradeEdge).toHaveBeenCalledTimes(8);
    expect(applications.publish).not.toHaveBeenCalled();
    expect(auth.tokens.get).not.toHaveBeenCalled();
  } finally {
    await app.close();
  }
});

it("protects requester policy adoption with the authenticated tenant, origin and CSRF without starting execution", async () => {
  const session: Session = {
    id: randomUUID(),
    userId: randomUUID(),
    tenantId: randomUUID(),
    githubId: "test",
    login: "test",
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
    tokens: { get: vi.fn(), put: vi.fn(), remove: vi.fn() },
  };
  const refreshUpgradePolicy = vi.fn(async () => ({ bindingId: randomUUID() }));
  const applications = {
    listTemplates: vi.fn(),
    listInstances: vi.fn(),
    publish: vi.fn(),
    order: vi.fn(),
    retire: vi.fn(),
    listPlatformContracts: vi.fn(),
    approvePlatformContract: vi.fn(),
    preparePlanInput: vi.fn(),
    refreshUpgradePolicy,
  };
  const app = buildApp({ auth, applications });
  const id = randomUUID();
  const path = `/api/v1/applications/instances/${id}/upgrades/refresh-policy`;
  const headers = {
    cookie: `__Host-lzc-session=${"b".repeat(43)}`,
    origin: auth.origin,
    "x-lzc-csrf": session.csrfToken,
    "x-lzc-tenant": session.tenantId,
  };
  const payload = {
    expectedBindingId: randomUUID(),
    expectedVersionId: randomUUID(),
    lastAppliedJobId: null,
    edgeId: randomUUID(),
    confirmPolicyRefresh: true,
  };
  try {
    expect(
      (await app.inject({ method: "POST", url: path, payload })).statusCode,
    ).toBe(401);
    for (const bad of [
      { ...headers, origin: "https://evil.example" },
      { ...headers, "x-lzc-csrf": "" },
      { ...headers, "x-lzc-tenant": randomUUID() },
    ]) {
      expect(
        (await app.inject({ method: "POST", url: path, payload, headers: bad }))
          .statusCode,
      ).toBe(403);
    }
    expect(refreshUpgradePolicy).not.toHaveBeenCalled();
    expect(
      (await app.inject({ method: "POST", url: path, payload, headers }))
        .statusCode,
    ).toBe(200);
    expect(refreshUpgradePolicy).toHaveBeenCalledExactlyOnceWith(
      session,
      id,
      payload,
    );
    expect(applications.order).not.toHaveBeenCalled();
    expect(applications.publish).not.toHaveBeenCalled();
    expect(auth.tokens.get).not.toHaveBeenCalled();
  } finally {
    await app.close();
  }
});
