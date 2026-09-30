import { expect, it, vi } from "vitest";
import { GitHubClient } from "../apps/api/src/auth/github-client.js";
import { SecretsManagerTokenStore } from "../apps/api/src/auth/secrets.js";
import type { Session } from "../apps/api/src/auth/store.js";

const session: Session = {
  id: "11111111-1111-1111-1111-111111111111",
  userId: "22222222-2222-2222-2222-222222222222",
  tenantId: "33333333-3333-3333-3333-333333333333",
  githubId: "101",
  login: "alice",
  csrfToken: "x".repeat(43),
  expiresAt: new Date(Date.now() + 3600000),
};
const settings = {
  address: "https://prod.sm.eu01.stackit.cloud",
  instance: "44444444-4444-4444-4444-444444444444",
  username: "service-user",
  password: "service-password",
};
it("rejects a token belonging to another user and revokes the Vault session", async () => {
  const request = vi.fn<typeof fetch>();
  request.mockResolvedValueOnce(
    Response.json({ auth: { client_token: "vault-token" } }),
  );
  request.mockResolvedValueOnce(
    Response.json({
      data: {
        data: {
          token: "ghu_private",
          userId: "someone-else",
          tenantId: session.tenantId,
          sessionId: session.id,
          githubId: "101",
          expiresAt: session.expiresAt.toISOString(),
        },
      },
    }),
  );
  request.mockResolvedValueOnce(new Response(null, { status: 204 }));
  const store = new SecretsManagerTokenStore(settings, request);
  await expect(store.get(session)).rejects.toThrow("identity mismatch");
  expect(request.mock.calls[1]?.[0]).toContain(
    `/tenants/${session.tenantId}/users/${session.userId}/github/${session.id}`,
  );
  expect(request.mock.calls[2]?.[0]).toBe(
    `${settings.address}/v1/auth/token/revoke-self`,
  );
});
it("refuses arbitrary secret endpoints and path injection", async () => {
  expect(
    () =>
      new SecretsManagerTokenStore({
        ...settings,
        address: "https://attacker.example",
      }),
  ).toThrow();
  const request = vi.fn<typeof fetch>();
  const store = new SecretsManagerTokenStore(settings, request);
  await expect(
    store.get({ ...session, tenantId: "../../another-tenant" }),
  ).rejects.toThrow();
  expect(request).not.toHaveBeenCalled();
});
it("requires expiring user tokens and verifies identity with exactly that token", async () => {
  const request = vi.fn<typeof fetch>();
  request.mockResolvedValueOnce(
    Response.json({
      access_token: "ghu_personal",
      token_type: "bearer",
      expires_in: 28800,
      refresh_token: "ghr_discard",
    }),
  );
  request.mockResolvedValueOnce(Response.json({ id: 101, login: "alice" }));
  const client = new GitHubClient(
    {
      clientId: "client",
      clientSecret: "private",
      callback: "https://configurator.example/auth/github/callback",
    },
    request,
  );
  const value = await client.authorize("code", "verifier");
  expect(value).toEqual({
    accessToken: "ghu_personal",
    githubId: 101,
    login: "alice",
    expiresIn: 28800,
  });
  expect(request.mock.calls[1]?.[1]?.headers).toMatchObject({
    Authorization: "Bearer ghu_personal",
  });
  expect(request.mock.calls[0]?.[1]?.body).toContain(
    '"code_verifier":"verifier"',
  );
  request.mockResolvedValueOnce(
    Response.json({
      access_token: "ghs_installation",
      token_type: "bearer",
      expires_in: 28800,
    }),
  );
  await expect(client.authorize("code", "verifier")).rejects.toThrow(
    "user token required",
  );
});

it("revokes the secret session after a failed write without hiding the write error", async () => {
  const request = vi.fn<typeof fetch>();
  request.mockResolvedValueOnce(
    Response.json({ auth: { client_token: "vault-token" } }),
  );
  request.mockResolvedValueOnce(new Response(null, { status: 403 }));
  request.mockRejectedValueOnce(new Error("revoke-network-failure"));
  const store = new SecretsManagerTokenStore(settings, request);
  await expect(store.put(session, "ghu_test")).rejects.toThrow(
    "Secret storage failed",
  );
  expect(request.mock.calls[2]?.[0]).toContain("/auth/token/revoke-self");
});

it("fails closed when a successful write leaves its secret session unrevoked", async () => {
  const request = vi.fn<typeof fetch>();
  request.mockResolvedValueOnce(
    Response.json({ auth: { client_token: "vault-token" } }),
  );
  request.mockResolvedValueOnce(new Response(null, { status: 204 }));
  request.mockResolvedValueOnce(new Response(null, { status: 403 }));
  const store = new SecretsManagerTokenStore(settings, request);
  await expect(store.put(session, "ghu_test")).rejects.toThrow(
    "Secret session cleanup failed",
  );
});
