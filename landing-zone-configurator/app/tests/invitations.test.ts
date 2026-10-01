import { randomUUID } from "node:crypto";
import { expect, it, vi } from "vitest";
import { buildApp } from "../apps/api/src/app.js";
import type { AuthServices } from "../apps/api/src/auth/routes.js";
import type { Session } from "../apps/api/src/auth/store.js";

it("protects invitation creation/acceptance, validates roles and never trusts a caller link origin", async () => {
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
    tokens: { get: vi.fn(), put: vi.fn(), remove: vi.fn() },
  };
  const service = {
    list: vi.fn(async () => []),
    create: vi.fn(async () => ({
      id: randomUUID(),
      token: "t".repeat(43),
      expiresAt: "tomorrow",
    })),
    revoke: vi.fn(),
    use: vi.fn(async () => ({ name: "Team" })),
  };
  const app = buildApp({ auth, invitations: service });
  const headers = {
    cookie: `__Host-lzc-session=${"s".repeat(43)}`,
    origin: auth.origin,
    "x-lzc-csrf": session.csrfToken,
    "x-lzc-tenant": session.tenantId,
  };
  try {
    const payload = { roles: ["application-owner"], manageMembers: false };
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/v1/invitations",
          payload,
        })
      ).statusCode,
    ).toBe(401);
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/v1/invitations",
          headers: { ...headers, origin: "https://evil.example" },
          payload,
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/v1/invitations",
          headers: { ...headers, "x-lzc-tenant": randomUUID() },
          payload,
        })
      ).statusCode,
    ).toBe(409);
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/v1/invitations",
          headers,
          payload: { ...payload, manageMembers: true },
        })
      ).statusCode,
    ).toBe(400);
    expect(service.create).not.toHaveBeenCalled();
    const created = await app.inject({
      method: "POST",
      url: "/api/v1/invitations",
      headers,
      payload,
    });
    expect(created.statusCode).toBe(201);
    expect(created.json().url).toBe(
      `https://configurator.example/organisation#invite=${"t".repeat(43)}`,
    );
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/v1/invitations/accept",
          headers: { cookie: headers.cookie },
          payload: { token: "t".repeat(43) },
        })
      ).statusCode,
    ).toBe(403);
    expect(service.use).not.toHaveBeenCalled();
    service.use.mockRejectedValueOnce(
      Object.assign(new Error("secret database content"), { code: "22023" }),
    );
    const expired = await app.inject({
      method: "POST",
      url: "/api/v1/invitations/accept",
      headers,
      payload: { token: "t".repeat(43) },
    });
    expect(expired.statusCode).toBe(410);
    expect(expired.json()).toEqual({ error: "invitation_unavailable" });
  } finally {
    await app.close();
  }
});
