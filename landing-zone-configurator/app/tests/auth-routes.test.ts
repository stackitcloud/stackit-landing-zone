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
function fixture(primaryStackit = false) {
  const pending = new Map<string, PendingGitHubLogin>();
  const sessions = new Map<string, Session>();
  const services: AuthServices = {
    origin: "https://configurator.example",
    primaryStackit,
    clientId: "client-id",
    store: {
      beginLogin: async (value, session) => {
        pending.set(value.stateHash, {
          ...value,
          ...(session ? { linkedSessionId: session.id } : {}),
        });
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
  it("requires HTTPS except for explicitly enabled canonical loopback origins", () => {
    const { services } = fixture();
    expect(() =>
      buildApp({ auth: { ...services, origin: "http://127.0.0.1:4181" } }),
    ).toThrow("Canonical HTTPS origin required");
    for (const origin of [
      "http://configurator.example",
      "http://127.0.0.1.evil.test:4181",
      "http://127.0.0.1:4181/path",
    ]) {
      expect(() =>
        buildApp({ auth: { ...services, origin, allowLoopbackHttp: true } }),
      ).toThrow("Canonical HTTPS origin required");
    }
    for (const origin of ["http://127.0.0.1:4181", "http://localhost:4181"]) {
      apps.push(
        buildApp({ auth: { ...services, origin, allowLoopbackHttp: true } }),
      );
    }
  });

  it("uses one resolved session for both platform guard and catalogue handler during tenant changes", async () => {
    const { services } = fixture();
    const session: Session = {
      id: randomUUID(),
      userId: randomUUID(),
      tenantId: randomUUID(),
      githubId: "101",
      login: "alice",
      csrfToken: "c".repeat(43),
      expiresAt: new Date(Date.now() + 300000),
      tenantKind: "personal",
    };
    const resolve = vi
      .spyOn(services.store, "resolveSession")
      .mockResolvedValueOnce(session)
      .mockResolvedValue({
        ...session,
        tenantId: randomUUID(),
        tenantKind: "organisation",
        productRoles: ["application-owner"],
      });
    const load = vi.fn().mockResolvedValue({ region: "eu01" });
    const app = buildApp({ auth: services, catalogues: { load } });
    apps.push(app);
    const result = await app.inject({
      method: "POST",
      url: "/api/v1/cloud-catalogues",
      headers: {
        cookie: `__Host-lzc-session=${"s".repeat(43)}`,
        origin: services.origin,
        "x-lzc-csrf": session.csrfToken,
      },
      payload: {
        profileId: randomUUID(),
        projectId: randomUUID(),
        region: "eu01",
      },
    });
    expect(result.statusCode).toBe(200);
    expect(resolve).toHaveBeenCalledOnce();
    expect(load.mock.calls[0]![0]).toBe(session);
  });

  it("links GitHub only from an existing primary session without replacing the user or tenant", async () => {
    const { app, services, sessions } = fixture(true);
    const token = "s".repeat(43);
    const session: Session = {
      id: randomUUID(),
      userId: randomUUID(),
      tenantId: randomUUID(),
      githubId: "",
      login: "stackit@example.test",
      csrfToken: "c".repeat(43),
      expiresAt: new Date(Date.now() + 300000),
    };
    sessions.set(tokenHash(token), session);
    const create = vi.spyOn(services.store, "createSession");
    services.store.linkGitHub = vi.fn(async (current, githubId) => ({
      ...current,
      githubId: String(githubId),
    }));
    expect((await app.inject("/auth/github/start")).statusCode).toBe(409);
    expect(
      (await app.inject({ method: "POST", url: "/auth/github/connect" }))
        .statusCode,
    ).toBe(401);
    const headers = {
      cookie: `__Host-lzc-session=${token}`,
      origin: services.origin,
      "x-lzc-csrf": session.csrfToken,
    };
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/auth/github/connect",
          headers: { ...headers, origin: "https://attacker.example" },
        })
      ).statusCode,
    ).toBe(403);
    const denied = await app.inject({
      method: "POST",
      url: "/auth/github/connect",
      headers,
    });
    const deniedState = new URL(
      denied.json().authorizationUrl,
    ).searchParams.get("state");
    const binding = denied.cookies[0]!;
    const deniedCallback = await app.inject({
      url: `/auth/github/callback?state=${deniedState}&code=one-use-code`,
      headers: { cookie: `${binding.name}=${binding.value}` },
    });
    expect(deniedCallback.headers.location).toBe("/?github=failed");
    expect(services.github.authorize).not.toHaveBeenCalled();
    const start = await app.inject({
      method: "POST",
      url: "/auth/github/connect",
      headers,
    });
    const state = new URL(start.json().authorizationUrl).searchParams.get(
      "state",
    );
    const cookie = start.cookies[0]!;
    const result = await app.inject({
      url: `/auth/github/callback?state=${state}&code=one-use-code`,
      headers: { cookie: `${headers.cookie}; ${cookie.name}=${cookie.value}` },
    });
    expect(result.headers.location).toBe("/repositories");
    expect(services.store.linkGitHub).toHaveBeenCalledWith(
      session,
      101,
      "alice",
    );
    expect(create).not.toHaveBeenCalled();
    expect(
      result.cookies.some((value) => value.name === "__Host-lzc-session"),
    ).toBe(false);
    expect(result.body + JSON.stringify(result.headers)).not.toContain("ghu_");
  });

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
