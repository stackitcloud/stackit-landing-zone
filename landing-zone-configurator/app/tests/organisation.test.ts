import { randomUUID } from "node:crypto";
import { afterEach, expect, it, vi } from "vitest";
import { buildApp } from "../apps/api/src/app.js";
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
  const app = buildApp({ auth, organisations: service });
  apps.push(app);
  const headers = {
    cookie: `__Host-lzc-session=${"b".repeat(43)}`,
    origin: auth.origin,
    "x-lzc-csrf": session.csrfToken,
    "x-lzc-tenant": session.tenantId,
  };
  return { app, service, headers };
}
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
