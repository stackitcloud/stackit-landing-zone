import { randomUUID } from "node:crypto";
import { expect, it, vi } from "vitest";
import { buildApp } from "../apps/api/src/app.js";
import type { AuthServices } from "../apps/api/src/auth/routes.js";
import type { Session } from "../apps/api/src/auth/store.js";

function fixture() {
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
  const app = buildApp({ auth, retirements });
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
