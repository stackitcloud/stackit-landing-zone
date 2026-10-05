import { randomUUID } from "node:crypto";
import { afterEach, expect, it, vi } from "vitest";
import { buildApp } from "../apps/api/src/app.js";
import { ApplicationError } from "../apps/api/src/applications/service.js";
import { platformAccessError } from "../apps/api/src/auth/platform-access.js";
import type { AuthServices } from "../apps/api/src/auth/routes.js";
import type { Session } from "../apps/api/src/auth/store.js";

const session: Session = {
  id: randomUUID(),
  userId: randomUUID(),
  tenantId: randomUUID(),
  githubId: "101",
  login: "alice",
  csrfToken: "a".repeat(43),
  expiresAt: new Date(Date.now() + 3600000),
};
const apps: ReturnType<typeof buildApp>[] = [];
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});
function setup() {
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
    tokens: { put: vi.fn(), get: vi.fn(), remove: vi.fn() },
  };
  const service = {
    overview: vi.fn(async () => ({
      userId: session.userId,
      activeTenantId: session.tenantId,
      tenants: [],
      members: [],
    })),
    create: vi.fn(async () => randomUUID()),
    switch: vi.fn(async () => {}),
    archive: vi.fn(async () => {}),
    editMember: vi.fn(async () => {}),
  };
  const applications = {
    listTemplates: vi.fn(async () => []),
    retire: vi.fn(async () => ({
      versionId: randomUUID(),
      retiredAt: new Date().toISOString(),
      retiredBy: session.userId,
    })),
    listInstances: vi.fn(async () => []),
    listPlatformContracts: vi.fn(async () => []),
    preparePlanInput: vi.fn(async () => {
      throw new ApplicationError(409, "application_platform_contract_required");
    }),
    approvePlatformContract: vi.fn(async () => {
      throw new ApplicationError(403, "application_access_denied");
    }),
    publish: vi.fn(async () => {
      throw new ApplicationError(403, "application_access_denied");
    }),
    order: vi.fn(async () => {
      throw new ApplicationError(409, "idempotency_conflict");
    }),
  };
  const app = buildApp({ auth, organisations: service, applications });
  apps.push(app);
  const headers = {
    cookie: `__Host-lzc-session=${"b".repeat(43)}`,
    origin: auth.origin,
    "x-lzc-csrf": session.csrfToken,
    "x-lzc-tenant": session.tenantId,
  };
  return { app, service, headers, applications, auth };
}

it("protects template retirement with current tenant, origin, CSRF and a valid version ID", async () => {
  const { app, headers, applications } = setup();
  const versionId = randomUUID();
  const url = `/api/v1/applications/templates/${versionId}/retire`;
  const payload = { confirmRetirement: true };
  expect(
    (await app.inject({ method: "POST", url, headers, payload })).statusCode,
  ).toBe(200);
  expect(applications.retire).toHaveBeenCalledWith(session, versionId, payload);
  applications.retire.mockClear();
  for (const rejected of [
    { ...headers, "x-lzc-tenant": randomUUID() },
    { ...headers, "x-lzc-csrf": "" },
    { ...headers, origin: "https://untrusted.example" },
  ])
    expect(
      (await app.inject({ method: "POST", url, headers: rejected, payload }))
        .statusCode,
    ).toBe(403);
  expect(
    (
      await app.inject({
        method: "POST",
        url: "/api/v1/applications/templates/not-a-version/retire",
        headers,
        payload,
      })
    ).statusCode,
  ).toBe(400);
  expect(applications.retire).not.toHaveBeenCalled();
});

it("allows organisation platform engineers to access credentials, catalogues and platform plans but denies application owners", () => {
  const engineer = {
    ...session,
    tenantKind: "organisation" as const,
    productRoles: ["platform-engineer" as const],
  };
  const owner = { ...engineer, productRoles: ["application-owner" as const] };
  for (const path of [
    "/api/v1/credentials",
    "/api/v1/cloud-catalogues/automatic",
    "/api/v1/preparations",
    "/api/v1/plans",
  ]) {
    expect(platformAccessError(engineer, path)).toBeNull();
    expect(platformAccessError(owner, path)).toBe("platform_engineer_required");
  }
});

it("keeps the original authenticated tenant throughout an application request", async () => {
  const { app, applications, headers, auth } = setup();
  vi.mocked(auth.store.resolveSession)
    .mockResolvedValueOnce(session)
    .mockResolvedValueOnce({ ...session, tenantId: randomUUID() });
  expect(
    (await app.inject({ url: "/api/v1/applications/templates", headers }))
      .statusCode,
  ).toBe(200);
  expect(auth.store.resolveSession).toHaveBeenCalledTimes(1);
  expect(applications.listTemplates).toHaveBeenCalledWith(session);
});

it("scopes every application read and mutation to the authenticated active tenant", async () => {
  const { app, applications, headers } = setup();
  for (const resource of ["templates", "instances"]) {
    const url = `/api/v1/applications/${resource}`;
    expect((await app.inject({ url })).statusCode).toBe(401);
    expect(
      (await app.inject({ url, headers: { cookie: headers.cookie } }))
        .statusCode,
    ).toBe(403);
    expect(
      (
        await app.inject({
          url,
          headers: { ...headers, "x-lzc-tenant": randomUUID() },
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await app.inject({
          method: "POST",
          url,
          headers: { ...headers, origin: "https://attacker.example" },
          payload: {},
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await app.inject({
          method: "POST",
          url,
          headers: { cookie: headers.cookie, "x-lzc-tenant": session.tenantId },
          payload: {},
        })
      ).statusCode,
    ).toBe(403);
  }
  for (const operation of Object.values(applications))
    expect(operation).not.toHaveBeenCalled();
  expect(
    (
      await app.inject({ url: "/api/v1/applications/templates", headers })
    ).json(),
  ).toEqual({
    versions: [],
    retirementEnabled: true,
    deploymentPolicyEnabled: true,
  });
  expect(applications.listTemplates).toHaveBeenCalledWith(session);
  expect(
    (
      await app.inject({
        method: "POST",
        url: "/api/v1/applications/templates",
        headers,
        payload: {},
      })
    ).json(),
  ).toEqual({ error: "application_access_denied" });
  expect(
    (
      await app.inject({
        method: "POST",
        url: "/api/v1/applications/instances",
        headers,
        payload: {},
      })
    ).statusCode,
  ).toBe(409);
});
it("requires authentication and same-origin CSRF on all organisation mutations", async () => {
  const { app, service, headers } = setup();
  const endpoints = [
    {
      method: "POST" as const,
      url: "/api/v1/organisation",
      payload: { name: "Team", organizationId: randomUUID() },
    },
    {
      method: "POST" as const,
      url: "/api/v1/organisation/switch",
      payload: { tenantId: randomUUID() },
    },
    {
      method: "PUT" as const,
      url: "/api/v1/organisation/members",
      payload: {
        userId: randomUUID(),
        roles: ["application-owner"],
        manageMembers: false,
      },
    },
    {
      method: "DELETE" as const,
      url: `/api/v1/organisation/members/${randomUUID()}`,
    },
  ];
  for (const endpoint of endpoints) {
    expect((await app.inject(endpoint)).statusCode).toBe(401);
    expect(
      (
        await app.inject({
          ...endpoint,
          headers: { ...headers, origin: "https://attacker.example" },
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await app.inject({
          ...endpoint,
          headers: { cookie: headers.cookie, origin: headers.origin },
        })
      ).statusCode,
    ).toBe(403);
  }
  expect((await app.inject({ url: "/api/v1/organisation" })).statusCode).toBe(
    401,
  );
  for (const operation of Object.values(service))
    expect(operation).not.toHaveBeenCalled();
});
it("rejects identity injection and malformed membership requests before service access", async () => {
  const { app, service, headers } = setup();
  for (const payload of [
    { userId: randomUUID(), roles: ["admin"], manageMembers: true },
    {
      userId: randomUUID(),
      roles: ["application-owner"],
      manageMembers: false,
      tenantId: randomUUID(),
    },
    {
      userId: "someone@example.com",
      roles: ["application-owner"],
      manageMembers: false,
    },
  ]) {
    expect(
      (
        await app.inject({
          method: "PUT",
          url: "/api/v1/organisation/members",
          headers,
          payload,
        })
      ).statusCode,
    ).toBe(400);
  }
  expect(service.editMember).not.toHaveBeenCalled();
});
it("uses only server-resolved identity and sanitizes database errors", async () => {
  const { app, service, headers } = setup();
  const payload = { name: "Team", organizationId: randomUUID() };
  expect(
    (
      await app.inject({
        method: "POST",
        url: "/api/v1/organisation",
        headers,
        payload,
      })
    ).statusCode,
  ).toBe(201);
  expect(service.create).toHaveBeenCalledWith(
    session,
    payload.name,
    payload.organizationId,
  );
  for (const [code, status, error] of [
    ["42501", 403, "membership_management_forbidden"],
    ["23503", 400, "registered_user_required"],
    ["23514", 409, "membership_constraints"],
    ["unexpected", 503, "organisation_operation_failed"],
  ] as const) {
    service.editMember.mockRejectedValueOnce(
      Object.assign(new Error("private SQL detail"), { code }),
    );
    const response = await app.inject({
      method: "DELETE",
      url: `/api/v1/organisation/members/${randomUUID()}`,
      headers,
    });
    expect(response.statusCode).toBe(status);
    expect(response.json()).toEqual({ error });
    expect(response.body).not.toContain("private SQL");
  }
});

it("rejects stale workspace headers before membership mutations", async () => {
  const { app, service, headers } = setup();
  const response = await app.inject({
    method: "DELETE",
    url: `/api/v1/organisation/members/${randomUUID()}`,
    headers: { ...headers, "x-lzc-tenant": randomUUID() },
  });
  expect(response.statusCode).toBe(409);
  expect(response.json()).toEqual({ error: "stale_tenant_context" });
  expect(service.editMember).not.toHaveBeenCalled();
});

it("protects draft deletion with authentication, CSRF and explicit target context", async () => {
  const { app, service, headers } = setup();
  const id = randomUUID();
  const url = `/api/v1/organisation/workspaces/${id}`;
  expect((await app.inject({ method: "DELETE", url })).statusCode).toBe(401);
  expect(
    (
      await app.inject({
        method: "DELETE",
        url,
        headers: { ...headers, origin: "https://evil.example" },
      })
    ).statusCode,
  ).toBe(403);
  expect(
    (await app.inject({ method: "DELETE", url, headers })).statusCode,
  ).toBe(409);
  expect(service.archive).not.toHaveBeenCalled();
  expect(
    (
      await app.inject({
        method: "DELETE",
        url,
        headers: { ...headers, "x-lzc-tenant": id },
      })
    ).statusCode,
  ).toBe(200);
  expect(service.archive).toHaveBeenCalledWith(session, id);
  service.archive.mockRejectedValueOnce(
    Object.assign(new Error("private detail"), { code: "55000" }),
  );
  const response = await app.inject({
    method: "DELETE",
    url,
    headers: { ...headers, "x-lzc-tenant": id },
  });
  expect(response.statusCode).toBe(409);
  expect(response.json()).toEqual({ error: "organisation_not_empty_draft" });
});
