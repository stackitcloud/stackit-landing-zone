import { randomUUID } from "node:crypto";
import { expect, it, vi } from "vitest";
import { buildApp } from "../apps/api/src/app.js";
import type { AuthServices } from "../apps/api/src/auth/routes.js";
import type { Session } from "../apps/api/src/auth/store.js";

it("authenticates an account without publishing an implicit workspace or admitting workspace APIs", async () => {
  const session: Session = {
    id: randomUUID(),
    userId: randomUUID(),
    tenantId: randomUUID(),
    tenantKind: "account",
    githubId: "",
    login: "owner@example.test",
    csrfToken: "a".repeat(43),
    expiresAt: new Date(Date.now() + 3600000),
  };
  const auth: AuthServices = {
    origin: "https://configurator.example",
    clientId: "synthetic",
    github: { authorize: vi.fn() },
    tokens: { put: vi.fn(), get: vi.fn(), remove: vi.fn() },
    store: {
      beginLogin: vi.fn(),
      consumeLogin: vi.fn(),
      createSession: vi.fn(),
      resolveSession: vi.fn(async () => session),
      deleteSession: vi.fn(),
    },
  };
  const overview = vi.fn(async () => ({
    userId: session.userId,
    activeTenantId: null,
    tenants: [],
    members: [],
  }));
  const create = vi.fn(async () => randomUUID());
  const use = vi.fn(async () => ({ accepted: true }));
  const app = buildApp({
    auth,
    organisations: {
      overview,
      create,
      switch: vi.fn(),
      archive: vi.fn(),
      editMember: vi.fn(),
    },
    invitations: { list: vi.fn(), create: vi.fn(), revoke: vi.fn(), use },
  });
  const headers = { cookie: "__Host-lzc-session=" + "b".repeat(43) };
  try {
    const status = await app.inject({ url: "/api/v1/session", headers });
    expect(status.statusCode).toBe(200);
    expect(status.json()).toMatchObject({
      workspaceRequired: true,
      user: { id: session.userId },
    });
    expect(status.json()).not.toHaveProperty("tenant");
    expect(JSON.stringify(status.json())).not.toContain(session.tenantId);
    expect(
      (await app.inject({ url: "/api/v1/organisation", headers })).json(),
    ).toMatchObject({ activeTenantId: null, tenants: [] });
    for (const url of [
      "/api/v1/configurations",
      "/api/v1/credentials",
      "/api/v1/applications",
      "/api/v1/plans",
      "/api/v1/preparations",
      "/api/v1/github/forks",
      "/api/v1/notifications/inbox",
      "/api/v1/organisation/members",
    ])
      expect((await app.inject({ url, headers })).json()).toEqual({
        error: "workspace_required",
      });
    const mutationHeaders = {
      ...headers,
      origin: auth.origin,
      "x-lzc-csrf": session.csrfToken,
    };
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/v1/organisation",
          headers: mutationHeaders,
          payload: { name: "Platform", organizationId: randomUUID() },
        })
      ).statusCode,
    ).toBe(201);
    expect(create).toHaveBeenCalledTimes(1);
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/v1/invitations/accept",
          headers: mutationHeaders,
          payload: { token: "c".repeat(43) },
        })
      ).statusCode,
    ).toBe(200);
    expect(use).toHaveBeenCalledTimes(1);
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/v1/organisation",
          headers,
          payload: { name: "Forbidden", organizationId: randomUUID() },
        })
      ).statusCode,
    ).toBe(403);
    expect(create).toHaveBeenCalledTimes(1);
  } finally {
    await app.close();
  }
});
