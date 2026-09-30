import { generateKeyPairSync, randomUUID } from "node:crypto";
import { afterEach, expect, it, vi } from "vitest";
import { buildApp } from "../apps/api/src/app.js";
import type { AuthServices } from "../apps/api/src/auth/routes.js";
import type { Session } from "../apps/api/src/auth/store.js";
import { parseServiceAccountKey } from "../apps/api/src/credentials/key.js";
import { VaultCredentialSecrets } from "../apps/api/src/credentials/secrets.js";
import { VaultConnection } from "../apps/api/src/storage/vault.js";

const privateKey = generateKeyPairSync("rsa", { modulusLength: 2048 })
  .privateKey.export({ format: "pem", type: "pkcs8" })
  .toString();
const key = {
  active: true,
  credentials: {
    kid: randomUUID(),
    iss: "test@sa.stackit.cloud",
    sub: randomUUID(),
    aud: "https://service-account.api.stackit.cloud",
    privateKey,
  },
};
const session: Session = {
  id: randomUUID(),
  userId: randomUUID(),
  tenantId: randomUUID(),
  githubId: "101",
  login: "alice",
  csrfToken: "a".repeat(43),
  expiresAt: new Date(Date.now() + 3600000),
};
const settings = {
  address: "https://prod.sm.eu01.stackit.cloud",
  instance: randomUUID(),
  username: "test-user",
  password: "test-password",
};
const apps: ReturnType<typeof buildApp>[] = [];
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});
it("accepts generated RSA keys but rejects malformed, inactive, expired and mismatched keys", () => {
  expect(parseServiceAccountKey({ ...key, unexpected: "discard" })).toEqual(
    key,
  );
  for (const invalid of [
    { ...key, active: false },
    { ...key, validUntil: "2020-01-01T00:00:00Z" },
    { ...key, id: "other" },
    { ...key, credentials: { ...key.credentials, privateKey: "not a key" } },
    {
      ...key,
      credentials: { ...key.credentials, aud: "https://attacker.example" },
    },
    {
      ...key,
      credentials: {
        ...key.credentials,
        privateKey: generateKeyPairSync("ed25519")
          .privateKey.export({ format: "pem", type: "pkcs8" })
          .toString(),
      },
    },
  ])
    expect(() => parseServiceAccountKey(invalid)).toThrow();
});
it("uses owner-scoped secret paths, create-only CAS and permanent deletion of all versions", async () => {
  const request = vi.fn<typeof fetch>(async (url, init) => {
    expect(String(url).startsWith(`${settings.address}/v1/`)).toBe(true);
    expect(init?.redirect).toBe("error");
    if (String(url).includes("auth/userpass"))
      return Response.json({ auth: { client_token: "vault-test-token" } });
    return new Response(null, { status: 204 });
  });
  const secrets = new VaultCredentialSecrets(
    new VaultConnection(settings, request),
  );
  const id = randomUUID();
  await secrets.put(session, id, parseServiceAccountKey(key));
  const write = request.mock.calls[1];
  expect(write?.[0]).toBe(
    `${settings.address}/v1/${settings.instance}/data/configurator/tenants/${session.tenantId}/users/${session.userId}/credentials/${id}`,
  );
  expect(JSON.parse(String(write?.[1]?.body))).toMatchObject({
    options: { cas: 0 },
    data: {
      profileId: id,
      userId: session.userId,
      tenantId: session.tenantId,
      key,
    },
  });
  await secrets.remove(session, id);
  expect(request.mock.calls[4]?.[0]).toContain(
    `/${settings.instance}/metadata/`,
  );
  expect(request.mock.calls[4]?.[1]?.method).toBe("DELETE");
  expect(
    request.mock.calls.filter(([url]) => String(url).endsWith("revoke-self")),
  ).toHaveLength(2);
  request.mockClear();
  await expect(secrets.remove(session, "../other")).rejects.toThrow();
  expect(request).not.toHaveBeenCalled();
});
it("protects credential routes with the session and CSRF, rejects identity injection and never returns a key", async () => {
  const resolve = vi.fn(async () => session as Session | null);
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
    tokens: { put: vi.fn(), get: vi.fn(), remove: vi.fn() },
  };
  const profiles = {
    check: vi.fn(),
    list: vi.fn(async () => []),
    create: vi.fn(async () => {}),
    remove: vi.fn(async () => {}),
  };
  const app = buildApp({ auth, credentials: profiles });
  apps.push(app);
  const headers = {
    cookie: `__Host-lzc-session=${"b".repeat(43)}`,
    origin: auth.origin,
    "x-lzc-csrf": session.csrfToken,
  };
  const payload = { name: "My profile", serviceAccountKey: key };
  expect(
    (await app.inject({ method: "POST", url: "/api/v1/credentials", payload }))
      .statusCode,
  ).toBe(401);
  expect(
    (
      await app.inject({
        method: "POST",
        url: "/api/v1/credentials",
        headers: { ...headers, origin: "https://attacker.example" },
        payload,
      })
    ).statusCode,
  ).toBe(403);
  expect(
    (
      await app.inject({
        method: "POST",
        url: "/api/v1/credentials",
        headers,
        payload: { ...payload, tenantId: randomUUID() },
      })
    ).statusCode,
  ).toBe(400);
  const result = await app.inject({
    method: "POST",
    url: "/api/v1/credentials",
    headers,
    payload,
  });
  expect(result.statusCode).toBe(201);
  expect(result.json()).toEqual({ stored: true });
  expect(result.body).not.toContain(privateKey);
  expect(profiles.create).toHaveBeenCalledExactlyOnceWith(
    session,
    "My profile",
    key,
  );
  const organizationId = randomUUID();
  profiles.check.mockResolvedValueOnce({
    status: "passed",
    organizationId,
    organizationName: "Test",
    code: "organization_readable",
    checkedAt: new Date().toISOString(),
  });
  expect(
    (
      await app.inject({
        method: "POST",
        url: `/api/v1/credentials/${session.id}/check`,
        headers: { ...headers, "x-lzc-csrf": "" },
        payload: { organizationId },
      })
    ).statusCode,
  ).toBe(403);
  const check = await app.inject({
    method: "POST",
    url: `/api/v1/credentials/${session.id}/check`,
    headers,
    payload: { organizationId },
  });
  expect(check.statusCode).toBe(200);
  expect(check.json().check.status).toBe("passed");
  expect(profiles.check).toHaveBeenCalledExactlyOnceWith(
    session,
    session.id,
    organizationId,
  );
  expect(auth.tokens.get).not.toHaveBeenCalled();
  const list = await app.inject({ url: "/api/v1/credentials", headers });
  expect(list.headers["cache-control"]).toBe("no-store");
  expect(list.json()).toEqual({ profiles: [] });
  expect(
    (await app.inject({ url: `/api/v1/credentials/${randomUUID()}`, headers }))
      .statusCode,
  ).toBe(404);
  profiles.create.mockRejectedValueOnce(new Error(privateKey));
  const failure = await app.inject({
    method: "POST",
    url: "/api/v1/credentials",
    headers,
    payload,
  });
  expect(failure.statusCode).toBe(503);
  expect(failure.body).not.toContain("PRIVATE KEY");
  const id = randomUUID();
  expect(
    (
      await app.inject({
        method: "DELETE",
        url: `/api/v1/credentials/${id}`,
        headers: { ...headers, "x-lzc-csrf": "" },
      })
    ).statusCode,
  ).toBe(403);
  expect(
    (
      await app.inject({
        method: "DELETE",
        url: `/api/v1/credentials/${id}`,
        headers,
      })
    ).statusCode,
  ).toBe(204);
  expect(profiles.remove).toHaveBeenCalledExactlyOnceWith(session, id);
});

it("preserves the current STACKIT Accounts audience and token endpoint through upload", async () => {
  const current = {
    ...key,
    credentials: {
      ...key.credentials,
      aud: "https://accounts.stackit.cloud",
      tokenEndpoint: "https://accounts.stackit.cloud/oauth/v2/token",
    },
  };
  const parsed = parseServiceAccountKey(current);
  expect(parsed).toEqual(current);
  const request = vi.fn<typeof fetch>(async (url) =>
    String(url).includes("auth/userpass")
      ? Response.json({ auth: { client_token: "test-token" } })
      : new Response(null, { status: 204 }),
  );
  const secrets = new VaultCredentialSecrets(
    new VaultConnection(settings, request),
  );
  await secrets.put(session, randomUUID(), parsed);
  const saved = JSON.parse(String(request.mock.calls[1]?.[1]?.body));
  expect(saved.data.key.credentials).toEqual(current.credentials);
  for (const tokenEndpoint of [
    "https://attacker.example/token",
    "http://accounts.stackit.cloud/oauth/v2/token",
    "https://accounts.stackit.cloud.attacker.example/oauth/v2/token",
    "https://accounts.stackit.cloud/oauth/v2/token?redirect=other",
  ]) {
    expect(() =>
      parseServiceAccountKey({
        ...current,
        credentials: { ...current.credentials, tokenEndpoint },
      }),
    ).toThrow();
  }
});

it("checks every secret identity field and exposes only a validated key with its Vault version internally", async () => {
  const id = randomUUID();
  const data = {
    tenantId: session.tenantId,
    userId: session.userId,
    profileId: id,
    kind: "stackit-service-account",
    key,
  };
  for (const change of [
    { tenantId: randomUUID() },
    { userId: randomUUID() },
    { profileId: randomUUID() },
    { kind: "github" },
    {},
  ]) {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json({ auth: { client_token: "private" } }),
      )
      .mockResolvedValueOnce(
        Response.json({
          data: { metadata: { version: 2 }, data: { ...data, ...change } },
        }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    const store = new VaultCredentialSecrets(
      new VaultConnection(settings, request),
    );
    if (Object.keys(change).length)
      await expect(store.get(session, id)).rejects.toThrow();
    else expect(await store.get(session, id)).toEqual({ key, version: 2 });
    expect(request.mock.calls[2]?.[0]).toContain("revoke-self");
  }
});
