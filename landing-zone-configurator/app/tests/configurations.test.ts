import { randomUUID } from "node:crypto";
import { createEditorConfiguration } from "@lzc/domain";
import type pg from "pg";
import { expect, it, vi } from "vitest";
import { buildApp } from "../apps/api/src/app.js";
import type { AuthServices } from "../apps/api/src/auth/routes.js";
import type { Session } from "../apps/api/src/auth/store.js";
import { Configurations } from "../apps/api/src/configurations/service.js";

it("protects database configurations without requiring GitHub, rejects CSRF and identity injection", async () => {
  const session: Session = {
    id: randomUUID(),
    userId: randomUUID(),
    tenantId: randomUUID(),
    githubId: "",
    login: "alice",
    csrfToken: "a".repeat(43),
    expiresAt: new Date(Date.now() + 3600000),
  };
  const auth: AuthServices = {
    origin: "https://configurator.example",
    clientId: "",
    githubEnabled: false,
    primaryStackit: true,
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
  const configurations = {
    list: vi.fn(async () => []),
    get: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
  };
  const app = buildApp({ auth, configurations });
  const headers = {
    cookie: `__Host-lzc-session=${"b".repeat(43)}`,
    origin: auth.origin,
    "x-lzc-csrf": session.csrfToken,
  };
  const draft = createEditorConfiguration("standalone", randomUUID());
  try {
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/v1/configurations",
          payload: { draft },
        })
      ).statusCode,
    ).toBe(401);
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/v1/configurations",
          headers: { ...headers, origin: "https://attacker.example" },
          payload: { draft },
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/v1/configurations",
          headers: { ...headers, "x-lzc-csrf": "wrong" },
          payload: { draft },
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/v1/configurations",
          headers,
          payload: { draft, tenantId: randomUUID() },
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/v1/configurations",
          headers,
          payload: { draft },
        })
      ).statusCode,
    ).toBe(201);
    expect(configurations.create).toHaveBeenCalledExactlyOnceWith(
      session,
      draft,
    );
    expect(
      (
        await app.inject({
          method: "GET",
          url: "/api/v1/configurations",
          headers,
        })
      ).statusCode,
    ).toBe(200);
    session.tenantKind = "organisation";
    session.productRoles = ["application-owner"];
    expect(
      (
        await app.inject({
          method: "GET",
          url: "/api/v1/configurations",
          headers,
        })
      ).statusCode,
    ).toBe(403);
  } finally {
    await app.close();
  }
});

it("validates drafts before database access and rolls back stale revision updates", async () => {
  const query = vi.fn(async (sql: string) => ({
    rows: sql.startsWith("SELECT id FROM") ? [{ id: randomUUID() }] : [],
    rowCount: sql.startsWith("SELECT id FROM") ? 1 : 0,
  }));
  const release = vi.fn();
  const pool = {
    connect: vi.fn(async () => ({ query, release })),
  } as unknown as pg.Pool;
  const service = new Configurations(pool);
  const session = {
    id: randomUUID(),
    userId: randomUUID(),
    tenantId: randomUUID(),
  } as Session;
  expect(() => service.create(session, {})).toThrow(
    "invalid_configuration_document",
  );
  expect(pool.connect).not.toHaveBeenCalled();
  const draft = createEditorConfiguration("standalone", randomUUID());
  await expect(
    service.update(session, randomUUID(), 1, draft),
  ).rejects.toMatchObject({ status: 409, code: "configuration_changed" });
  expect(query).toHaveBeenCalledWith("ROLLBACK");
  expect(release).toHaveBeenCalledWith(false);
});
