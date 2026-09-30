import { randomUUID } from "node:crypto";
import {
  catalogue,
  configurationValues,
  createDraft,
  savedDraft,
  serializeTfvars,
  type Template,
} from "@lzc/domain";
import { expect, it, vi } from "vitest";
import { buildApp } from "../apps/api/src/app.js";
import type { AuthServices } from "../apps/api/src/auth/routes.js";
import type { Session } from "../apps/api/src/auth/store.js";
import {
  acceleratorCommit,
  preparationManifest,
} from "../apps/api/src/deployments/preparations.js";

it("binds a preparation to the saved configuration, code revision, secret version and exact organization", () => {
  const template = catalogue.templates.find(
    (item) => item.id === "standalone",
  ) as Template;
  const draft = createDraft(template);
  draft.organization = randomUUID();
  draft.owner = "owner@stackit.cloud";
  for (const project of draft.projects) project.owner = draft.owner;
  for (const sandbox of draft.sandboxes) sandbox.owner = draft.owner;
  const document = savedDraft(randomUUID(), draft);
  const input = {
    target: { id: 123, owner: "alice", name: "accelerator" },
    head: "a".repeat(40),
    configurationId: document.id,
    credentialId: randomUUID(),
  };
  const snapshot = {
    document,
    head: input.head,
    tfvars: serializeTfvars(configurationValues(document)),
  };
  const checked = {
    version: 2,
    keyId: "key-1",
    check: {
      status: "passed" as const,
      code: "organization_readable" as const,
      organizationId: draft.organization,
      organizationName: "Customer",
      checkedAt: new Date().toISOString(),
    },
  };
  const manifest = preparationManifest(input, snapshot, checked);
  expect(manifest.accelerator.commit).toBe(acceleratorCommit);
  expect(manifest.source.commit).toBe(input.head);
  expect(manifest.configuration).toEqual(document);
  expect(manifest.credential).toEqual({
    id: input.credentialId,
    secretVersion: 2,
    keyId: "key-1",
  });
  expect(manifest.tfvarsSha256).toMatch(/^[a-f0-9]{64}$/);
  expect(manifest.limitations).toContain("plan-not-created");
  expect(() =>
    preparationManifest(input, { ...snapshot, head: "b".repeat(40) }, checked),
  ).toThrow();
  expect(() =>
    preparationManifest(input, snapshot, { ...checked, version: 0 }),
  ).toThrow();
  expect(() =>
    preparationManifest(input, snapshot, {
      ...checked,
      check: { ...checked.check, organizationId: randomUUID() },
    }),
  ).toThrow();
  expect(() =>
    preparationManifest(input, snapshot, {
      ...checked,
      check: { ...checked.check, status: "failed" },
    }),
  ).toThrow();
});
it("requires session and CSRF, rejects caller-supplied organization/code and forwards only the user's GitHub token", async () => {
  const session: Session = {
    id: randomUUID(),
    userId: randomUUID(),
    tenantId: randomUUID(),
    githubId: "101",
    login: "alice",
    csrfToken: "a".repeat(43),
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
    tokens: {
      get: vi.fn(async () => "ghu_only_this_user"),
      put: vi.fn(),
      remove: vi.fn(),
    },
  };
  const preparations = {
    list: vi.fn(async () => []),
    create: vi.fn(async () => ({ id: randomUUID() })),
    remove: vi.fn(async () => {}),
  };
  const app = buildApp({ auth, preparations });
  try {
    const headers = {
      cookie: `__Host-lzc-session=${"b".repeat(43)}`,
      origin: auth.origin,
      "x-lzc-csrf": session.csrfToken,
    };
    const payload = {
      target: { id: 123, owner: "alice", name: "accelerator" },
      head: "a".repeat(40),
      configurationId: randomUUID(),
      credentialId: randomUUID(),
    };
    expect((await app.inject("/api/v1/preparations")).statusCode).toBe(401);
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/v1/preparations",
          payload,
          headers: { ...headers, origin: "https://attacker.example" },
        })
      ).statusCode,
    ).toBe(403);
    for (const extra of [
      { organizationId: randomUUID() },
      { acceleratorCommit: "b".repeat(40) },
      { tenantId: randomUUID() },
    ])
      expect(
        (
          await app.inject({
            method: "POST",
            url: "/api/v1/preparations",
            payload: { ...payload, ...extra },
            headers,
          })
        ).statusCode,
      ).toBe(400);
    const result = await app.inject({
      method: "POST",
      url: "/api/v1/preparations",
      payload,
      headers,
    });
    expect(result.statusCode).toBe(201);
    expect(preparations.create).toHaveBeenCalledExactlyOnceWith(
      session,
      "ghu_only_this_user",
      payload,
    );
    expect(result.body).not.toContain("ghu_");
    expect(
      (await app.inject({ url: "/api/v1/preparations", headers })).json(),
    ).toEqual({ preparations: [] });
    expect(
      (
        await app.inject({
          method: "DELETE",
          url: `/api/v1/preparations/${randomUUID()}`,
          headers: { ...headers, "x-lzc-csrf": "" },
        })
      ).statusCode,
    ).toBe(403);
    expect(preparations.remove).not.toHaveBeenCalled();
  } finally {
    await app.close();
  }
});
