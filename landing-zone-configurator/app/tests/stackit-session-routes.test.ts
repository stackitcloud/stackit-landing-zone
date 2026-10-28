import { randomUUID } from "node:crypto";
import { afterEach, expect, it, vi } from "vitest";
import { buildApp } from "../apps/api/src/app.js";
import type { AuthServices } from "../apps/api/src/auth/routes.js";
import type { Session } from "../apps/api/src/auth/store.js";

const apps: ReturnType<typeof buildApp>[] = [];
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});
function fixture(renewal = true) {
  const token = "s".repeat(43);
  const session: Session = {
    id: randomUUID(),
    userId: randomUUID(),
    tenantId: randomUUID(),
    githubId: "",
    login: "human@example.test",
    csrfToken: "c".repeat(43),
    expiresAt: new Date(Date.now() + 28800000),
  };
  const services: AuthServices = {
    origin: "https://configurator.example",
    clientId: "client",
    primaryStackit: true,
    store: {
      beginLogin: vi.fn(),
      consumeLogin: vi.fn(),
      createSession: vi.fn(),
      resolveSession: vi.fn(async (raw) => (raw === token ? session : null)),
      deleteSession: vi.fn(),
    },
    github: { authorize: vi.fn() },
    tokens: { put: vi.fn(), get: vi.fn(), remove: vi.fn() },
    ...(renewal
      ? {
          stackitSessions: {
            put: vi.fn(),
            refresh: vi.fn(async () => ({
              status: "active" as const,
              verifiedUntil: new Date(Date.now() + 600000).toISOString(),
            })),
            revoke: vi.fn(),
          },
        }
      : {}),
  };
  const app = buildApp({
    auth: services,
    stackit: {
      identities: { save: vi.fn(), status: vi.fn(), revoke: vi.fn() },
      organisations: { overview: vi.fn() },
    },
  });
  apps.push(app);
  const headers = {
    origin: services.origin,
    cookie: `__Host-lzc-session=${token}`,
    "x-lzc-csrf": session.csrfToken,
  };
  return { app, services, session, token, headers };
}
it("renews only a live authenticated session with exact origin, CSRF and empty input", async () => {
  const { app, services, session, token, headers } = fixture();
  for (const [request, status] of [
    [{ headers: { origin: headers.origin } }, 401],
    [{ headers: { ...headers, origin: "https://attacker.example" } }, 403],
    [{ headers: { ...headers, "x-lzc-csrf": "wrong" } }, 403],
    [{ headers, payload: { refreshToken: "browser-injected-secret" } }, 400],
    [{ headers, url: "/auth/stackit/refresh?token=injected" }, 400],
  ] as const) {
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/auth/stackit/refresh",
          ...request,
        })
      ).statusCode,
    ).toBe(status);
  }
  expect(services.stackitSessions?.refresh).not.toHaveBeenCalled();
  const result = await app.inject({
    method: "POST",
    url: "/auth/stackit/refresh",
    headers,
  });
  expect(result.statusCode).toBe(200);
  expect(result.json()).toEqual({
    status: "active",
    verifiedUntil: expect.any(String),
  });
  expect(services.stackitSessions?.refresh).toHaveBeenCalledExactlyOnceWith(
    session,
    token,
  );
  expect(result.headers["set-cookie"]).toBeUndefined();
  expect(result.body).not.toContain(token);
  expect((await app.inject("/auth/status")).json().stackitRenewal).toBe(true);
});
it("returns a reauthentication requirement for sessions without renewal support", async () => {
  const { app, headers } = fixture(false);
  expect(
    (
      await app.inject({
        method: "POST",
        url: "/auth/stackit/refresh",
        headers,
      })
    ).json(),
  ).toEqual({ status: "reauthentication-required" });
  expect((await app.inject("/auth/status")).json().stackitRenewal).toBe(false);
});
it("sanitizes provider outages without extending the app session", async () => {
  const { app, services, headers, session } = fixture();
  vi.mocked(services.stackitSessions!.refresh).mockRejectedValueOnce(
    new Error("private-provider-response"),
  );
  const expires = session.expiresAt.getTime();
  const result = await app.inject({
    method: "POST",
    url: "/auth/stackit/refresh",
    headers,
  });
  expect(result.statusCode).toBe(503);
  expect(result.body).not.toContain("private-provider-response");
  expect(session.expiresAt.getTime()).toBe(expires);
});
it("logs out even if refresh revocation fails, clearing the opaque cookie", async () => {
  const { app, services, headers, session, token } = fixture();
  vi.mocked(services.stackitSessions!.revoke).mockRejectedValueOnce(
    new Error("private-token"),
  );
  const result = await app.inject({
    method: "POST",
    url: "/auth/logout",
    headers,
  });
  expect(result.statusCode).toBe(204);
  expect(services.stackitSessions?.revoke).toHaveBeenCalledExactlyOnceWith(
    session,
    token,
  );
  expect(services.store.deleteSession).toHaveBeenCalledExactlyOnceWith(token);
  expect(result.headers["set-cookie"]).toContain("Max-Age=0");
  expect(result.body).not.toContain("private-token");
});
