import { randomBytes, randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildApp } from "../apps/api/src/app.js";
import type { PendingGitHubLogin } from "../apps/api/src/auth/github-flow.js";
import type { AuthServices } from "../apps/api/src/auth/routes.js";
import { type Session, tokenHash } from "../apps/api/src/auth/store.js";
import { Repositories } from "../apps/api/src/github/repositories.js";

const apps: ReturnType<typeof buildApp>[] = [];
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});
function fixture() {
  const pending = new Map<string, PendingGitHubLogin>();
  const sessions = new Map<string, Session>();
  const services: AuthServices = {
    origin: "https://configurator.example",
    clientId: "client-id",
    store: {
      beginLogin: async (value) => {
        pending.set(value.stateHash, value);
      },
      consumeLogin: async (state, binding) => {
        const value = pending.get(tokenHash(state));
        if (
          !value ||
          value.bindingHash !== tokenHash(binding) ||
          value.expiresAt < Date.now()
        )
          return null;
        pending.delete(tokenHash(state));
        return value;
      },
      createSession: async (value) => {
        const session: Session = {
          id: value.id,
          userId: randomUUID(),
          tenantId: randomUUID(),
          githubId: String(value.githubId),
          login: value.login,
          csrfToken: value.csrfToken,
          expiresAt: value.expiresAt,
        };
        sessions.set(value.hash, session);
        return session;
      },
      resolveSession: async (token) => sessions.get(tokenHash(token)) ?? null,
      deleteSession: async (token) => {
        sessions.delete(tokenHash(token));
      },
    },
    github: {
      authorize: vi.fn(async () => ({
        accessToken: "ghu_private-must-not-reach-browser",
        expiresIn: 28800,
        githubId: 101,
        login: "alice",
      })),
    },
    tokens: {
      put: vi.fn(async () => {}),
      get: vi.fn(async () => "ghu_private-must-not-reach-browser"),
      remove: vi.fn(async () => {}),
    },
  };
  const app = buildApp({ auth: services });
  apps.push(app);
  const begin = async () => {
    const start = await app.inject("/auth/github/start");
    const state = new URL(start.headers.location ?? "").searchParams.get(
      "state",
    );
    const cookie = start.cookies[0];
    if (!cookie) throw new Error("missing binding");
    return { state, binding: `${cookie.name}=${cookie.value}` };
  };
  const login = async () => {
    const start = await begin();
    return app.inject({
      url: `/auth/github/callback?state=${start.state}&code=one-use-code`,
      headers: { cookie: start.binding },
    });
  };
  return { app, services, pending, sessions, begin, login };
}

describe("GitHub browser flow", () => {
  it("keeps tokens server-side, sets secure cookie and exposes only session metadata", async () => {
    const { app, services, login } = fixture();
    const response = await login();
    expect(response.statusCode).toBe(302);
    expect(response.headers.location).toBe("/");
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.body).not.toContain("ghu_");
    expect(JSON.stringify(response.headers)).not.toContain("ghu_");
    const cookie = response.cookies.find(
      (c) => c.name === "__Host-lzc-session",
    );
    expect(cookie).toMatchObject({
      secure: true,
      httpOnly: true,
      sameSite: "Lax",
      path: "/",
    });
    expect(services.tokens.put).toHaveBeenCalledOnce();
    const session = await app.inject({
      url: "/api/v1/session",
      headers: { cookie: `${cookie?.name}=${cookie?.value}` },
    });
    expect(session.json().user.login).toBe("alice");
    expect(session.json().csrfToken).toHaveLength(43);
    expect(session.body).not.toContain("ghu_");
  });
  it("rejects a different browser, replay and forged identity headers", async () => {
    const { app, services, begin } = fixture();
    const start = await begin();
    const url = `/auth/github/callback?state=${start.state}&code=secret-code`;
    const wrong = await app.inject({
      url,
      headers: {
        cookie: `__Host-lzc-login=${randomBytes(32).toString("base64url")}`,
      },
    });
    expect(wrong.headers.location).toBe("/?login=failed");
    expect(services.github.authorize).not.toHaveBeenCalled();
    await app.inject({ url, headers: { cookie: start.binding } });
    const replay = await app.inject({
      url,
      headers: { cookie: start.binding },
    });
    expect(replay.headers.location).toBe("/?login=failed");
    expect(services.github.authorize).toHaveBeenCalledOnce();
    expect(
      (
        await app.inject({
          url: "/api/v1/session",
          headers: { "x-user-id": "alice", "x-tenant-id": "victim" },
        })
      ).statusCode,
    ).toBe(401);
  });
  it("fails closed if secret storage fails", async () => {
    const { services, sessions, login } = fixture();
    vi.mocked(services.tokens.put).mockRejectedValueOnce(
      new Error("sensitive-provider-payload"),
    );
    const response = await login();
    expect(response.headers.location).toBe("/?login=failed");
    expect(
      response.cookies.find((c) => c.name === "__Host-lzc-session"),
    ).toBeUndefined();
    expect(sessions.size).toBe(0);
    expect(response.body).not.toContain("sensitive-provider-payload");
  });
  it("requires same-origin CSRF on logout and invalidates the session first", async () => {
    const { app, login } = fixture();
    const response = await login();
    const cookie = response.cookies.find(
      (c) => c.name === "__Host-lzc-session",
    );
    const header = { cookie: `${cookie?.name}=${cookie?.value}` };
    const data = (
      await app.inject({ url: "/api/v1/session", headers: header })
    ).json();
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/auth/logout",
          headers: header,
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/auth/logout",
          headers: {
            ...header,
            origin: "https://attacker.example",
            "x-lzc-csrf": data.csrfToken,
          },
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/auth/logout",
          headers: {
            ...header,
            origin: "https://configurator.example",
            "x-lzc-csrf": data.csrfToken,
          },
        })
      ).statusCode,
    ).toBe(204);
    expect(
      (await app.inject({ url: "/api/v1/session", headers: header }))
        .statusCode,
    ).toBe(401);
  });
});

it("protects repository access with the session and mutations with Origin/CSRF", async () => {
  const f = fixture();
  expect((await f.app.inject("/api/v1/github/forks")).statusCode).toBe(401);
  expect(f.services.tokens.get).not.toHaveBeenCalled();
  const login = await f.login();
  const cookie = login.cookies.find(
    (value) => value.name === "__Host-lzc-session",
  );
  const headers = { cookie: `${cookie?.name}=${cookie?.value}` };
  const session = (
    await f.app.inject({ url: "/api/v1/session", headers })
  ).json();
  const list = vi
    .spyOn(Repositories.prototype, "list")
    .mockResolvedValue({ forks: [], nextPage: null });
  try {
    const response = await f.app.inject({
      url: "/api/v1/github/forks?page=1",
      headers,
    });
    expect(response.statusCode).toBe(200);
    expect(list).toHaveBeenCalledWith("ghu_private-must-not-reach-browser", 1);
    expect(
      (
        await f.app.inject({
          method: "POST",
          url: "/api/v1/github/configuration",
          headers,
          payload: {},
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await f.app.inject({
          method: "POST",
          url: "/api/v1/github/configuration",
          headers: {
            ...headers,
            origin: "https://attacker.example",
            "x-lzc-csrf": session.csrfToken,
          },
          payload: {},
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await f.app.inject({
          method: "POST",
          url: "/api/v1/github/configuration",
          headers: {
            ...headers,
            origin: f.services.origin,
            "x-lzc-csrf": session.csrfToken,
          },
          payload: { target: { owner: "../other", name: "repo", id: 1 } },
        })
      ).statusCode,
    ).toBe(400);
  } finally {
    list.mockRestore();
  }
});
