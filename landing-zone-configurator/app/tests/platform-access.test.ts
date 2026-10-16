import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { buildApp } from "../apps/api/src/app.js";
import { platformAccessError } from "../apps/api/src/auth/platform-access.js";
import type { AuthServices } from "../apps/api/src/auth/routes.js";
import type { Session } from "../apps/api/src/auth/store.js";

const session: Session = {
  id: randomUUID(),
  userId: randomUUID(),
  tenantId: randomUUID(),
  githubId: "101",
  login: "alice",
  csrfToken: "c".repeat(43),
  expiresAt: new Date(Date.now() + 3600000),
  tenantKind: "organisation",
  productRoles: ["application-owner"],
};
describe("organisation platform API boundaries", () => {
  it("keeps runner tickets and membership administration separate", () => {
    for (const path of [
      "/api/runner/input",
      "/api/v1/organisations",
      "/api/v1/session",
    ])
      expect(platformAccessError(session, path)).toBeNull();
  });
  it("denies application owners platform access and organisation execution", () => {
    expect(platformAccessError(session, "/api/v1/github/forks")).toBe(
      "platform_engineer_required",
    );
    expect(platformAccessError(session, "/api/v1/credentials")).toBe(
      "platform_engineer_required",
    );
    for (const path of [
      "/api/v1/credentials",
      "/api/v1/cloud-catalogues/automatic",
    ])
      expect(
        platformAccessError(
          { ...session, productRoles: ["platform-engineer"] },
          path,
        ),
      ).toBeNull();
    expect(
      platformAccessError(session, "/api/v1/cloud-catalogues/automatic"),
    ).toBe("platform_engineer_required");
    expect(
      platformAccessError(
        { ...session, productRoles: ["platform-engineer"] },
        "/api/v1/plans",
      ),
    ).toBeNull();
    expect(platformAccessError(session, "/api/v1/plans")).toBe(
      "platform_engineer_required",
    );
    expect(platformAccessError(session, "/api/v1/preparations")).toBe(
      "platform_engineer_required",
    );
    expect(
      platformAccessError(
        { ...session, tenantKind: "personal" },
        "/api/v1/plans",
      ),
    ).toBeNull();
  });
  it("rejects an API request before reading personal GitHub tokens", async () => {
    const get = vi.fn();
    const auth: AuthServices = {
      origin: "https://configurator.example",
      clientId: "client",
      store: {
        beginLogin: vi.fn(),
        consumeLogin: vi.fn(),
        createSession: vi.fn(),
        resolveSession: vi.fn(async () => session),
        deleteSession: vi.fn(),
      },
      github: { authorize: vi.fn() },
      tokens: { get, put: vi.fn(), remove: vi.fn() },
    };
    const app = buildApp({ auth });
    try {
      const response = await app.inject({
        method: "GET",
        url: "/api/v1/github/forks?page=1",
        headers: { cookie: `__Host-lzc-session=${"t".repeat(43)}` },
      });
      expect(response.statusCode).toBe(403);
      expect(response.json()).toEqual({ error: "platform_engineer_required" });
      expect(get).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });
});
