import { randomBytes, randomUUID } from "node:crypto";
import { chmod, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildApp } from "../apps/api/src/app.js";
import type { AuthServices } from "../apps/api/src/auth/routes.js";
import type { Session } from "../apps/api/src/auth/store.js";
import {
  developmentPasswordHash,
  openDevelopmentAccount,
} from "../scripts/development-auth.js";

const apps: ReturnType<typeof buildApp>[] = [];
const directories: string[] = [];
afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(apps.splice(0).map((app) => app.close()));
  await Promise.all(
    directories.splice(0).map((path) => rm(path, { recursive: true })),
  );
});
function fixture() {
  const token = randomBytes(32).toString("base64url");
  const session: Session = {
    id: randomUUID(),
    userId: randomUUID(),
    tenantId: randomUUID(),
    tenantKind: "personal",
    githubId: "",
    login: "developer (Entwicklung)",
    csrfToken: randomBytes(32).toString("base64url"),
    expiresAt: new Date(Date.now() + 3600000),
  };
  let active = true;
  const auth: AuthServices = {
    origin: "https://workstation.example:4181",
    clientId: "",
    githubEnabled: false,
    store: {
      beginLogin: async () => {},
      consumeLogin: async () => null,
      createSession: async () => session,
      resolveSession: async (candidate) =>
        active && candidate === token ? session : null,
      deleteSession: async () => {
        active = false;
      },
    },
    github: {
      authorize: async () => {
        throw new Error("GitHub is disabled");
      },
    },
    tokens: {
      get: async () => {
        throw new Error("GitHub is disabled");
      },
      put: async () => {},
      remove: async () => {},
    },
  };
  const authenticate = vi.fn(async (username: string, password: string) =>
    username === "developer" && password === "test-only-correct-password"
      ? token
      : null,
  );
  const app = buildApp({ auth, developmentLogin: { authenticate } });
  apps.push(app);
  const login = (
    password = "test-only-correct-password",
    origin: string | undefined = auth.origin,
  ) =>
    app.inject({
      method: "POST",
      url: "/auth/development/login",
      headers: origin ? { origin } : {},
      payload: { username: "developer", password },
    });
  return { app, auth, session, authenticate, login };
}
describe("isolated HTTPS workstation login", () => {
  it("advertises development, not GitHub or STACKIT identity, and uses a Secure opaque cookie", async () => {
    const { app, login } = fixture();
    expect((await app.inject("/auth/status")).json()).toMatchObject({
      development: true,
      github: false,
      stackit: false,
      primary: "development",
    });
    const response = await login();
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ authenticated: true, development: true });
    const cookie = String(response.headers["set-cookie"]);
    expect(cookie).toMatch(/^__Host-lzc-session=[A-Za-z0-9_-]{43};/);
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("Secure");
    const current = await app.inject({
      url: "/api/v1/session",
      headers: { cookie },
    });
    expect(current.json()).toMatchObject({
      development: true,
      stackitVerified: false,
      tenant: { kind: "personal", roles: [] },
    });
  });
  it("rejects missing/foreign origins before password verification and rejects bad passwords", async () => {
    const { login, authenticate } = fixture();
    expect((await login("wrong", "https://foreign.example")).statusCode).toBe(
      403,
    );
    expect((await login("wrong", "")).statusCode).toBe(403);
    expect(authenticate).not.toHaveBeenCalled();
    expect((await login("wrong")).statusCode).toBe(401);
  });
  it("limits password attempts without trusting forwarded IP headers", async () => {
    const { login, authenticate } = fixture();
    for (let i = 0; i < 10; i++)
      expect((await login("wrong")).statusCode).toBe(401);
    const blocked = await login();
    expect(blocked.statusCode).toBe(429);
    expect(blocked.headers["retry-after"]).toBe("900");
    expect(authenticate).toHaveBeenCalledTimes(10);
  });
  it("retains exact-origin/CSRF logout and invalidates the session", async () => {
    const { app, login, auth, session } = fixture();
    const cookie = String((await login()).headers["set-cookie"]);
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/auth/logout",
          headers: { cookie, origin: auth.origin },
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/auth/logout",
          headers: {
            cookie,
            origin: auth.origin,
            "x-lzc-csrf": session.csrfToken,
          },
        })
      ).statusCode,
    ).toBe(204);
    expect(
      (await app.inject({ url: "/api/v1/session", headers: { cookie } }))
        .statusCode,
    ).toBe(401);
  });
  it("does not register the route in ordinary deployments and rejects production opt-in", async () => {
    const plain = buildApp();
    apps.push(plain);
    expect(
      (await plain.inject({ method: "POST", url: "/auth/development/login" }))
        .statusCode,
    ).toBe(404);
    vi.stubEnv("NODE_ENV", "production");
    expect(() => fixture()).toThrow(
      "development_login_requires_separate_https_workstation",
    );
  });
  it("stores a salted password hash with private permissions and preserves the account", async () => {
    const directory = await mkdtemp(join(tmpdir(), "lzc-development-auth-"));
    directories.push(directory);
    const account = await openDevelopmentAccount(directory);
    const password = (
      await readFile(join(directory, "initial-password"), "utf8")
    ).trim();
    expect(
      (await developmentPasswordHash(password, account.salt)).toString("hex"),
    ).toBe(account.passwordHash);
    expect(
      (await developmentPasswordHash("wrong", account.salt)).toString("hex"),
    ).not.toBe(account.passwordHash);
    expect(await openDevelopmentAccount(directory)).toEqual(account);
    expect(
      await readFile(join(directory, "account.json"), "utf8"),
    ).not.toContain(password);
    await chmod(join(directory, "account.json"), 0o644);
    await expect(openDevelopmentAccount(directory)).rejects.toThrow(
      "private_development_account_required",
    );
  });
});
