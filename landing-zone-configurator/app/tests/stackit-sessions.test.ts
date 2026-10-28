import { randomBytes } from "node:crypto";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { expect, it, vi } from "vitest";
import { StackitRefreshClient } from "../apps/api/src/auth/stackit-sessions.js";
import { ArtifactCrypto } from "../apps/api/src/plans/crypto.js";

const issuer = "https://accounts.stackit.cloud";
const clientId = "registered-web-client";
const now = Date.now();
const pair = await generateKeyPair("RS256");
const jwk = {
  ...(await exportJWK(pair.publicKey)),
  kid: "test-key",
  alg: "RS256",
  use: "sig",
};
const grant = {
  clientId,
  issuer,
  subject: "human-subject",
  email: "human@example.test",
  nonce: "original-login-nonce",
  refreshToken: "private-refresh-original",
  expiresAt: new Date(now + 60000).toISOString(),
};
async function fixture(
  overrides: Record<string, unknown> = {},
  responseStatus = 200,
) {
  const claims = {
    sub: grant.subject,
    email: grant.email,
    email_verified: true,
    nonce: grant.nonce,
    aud: clientId,
    iss: issuer,
    iat: Math.floor(now / 1000),
    exp: Math.floor(now / 1000) + 600,
    ...overrides,
  };
  const jwt = await new SignJWT(claims)
    .setProtectedHeader({ alg: "RS256", kid: "test-key" })
    .sign(pair.privateKey);
  const request = vi.fn<typeof fetch>(async (url, init) => {
    if (String(url).endsWith("jwks.json"))
      return Response.json({ keys: [jwk] });
    if (String(url).endsWith("/token")) {
      expect(init?.redirect).toBe("error");
      expect(
        new URLSearchParams(init?.body as URLSearchParams).get("grant_type"),
      ).toBe("refresh_token");
      return Response.json(
        responseStatus === 200
          ? {
              access_token: "private-access",
              refresh_token: "private-refresh-rotated",
              id_token: jwt,
              token_type: "Bearer",
              expires_in: 600,
            }
          : { error: "invalid_grant" },
        { status: responseStatus },
      );
    }
    if (String(url).endsWith("userinfo"))
      return Response.json({
        sub: grant.subject,
        email: grant.email,
        email_verified: true,
      });
    throw new Error("Unexpected endpoint");
  });
  return { client: new StackitRefreshClient(request, () => now), request };
}
it("rotates a refresh grant only after signed identity and userinfo agree", async () => {
  const { client, request } = await fixture();
  const rotated = await client.refresh(grant);
  expect(rotated).toEqual({
    ...grant,
    refreshToken: "private-refresh-rotated",
    expiresAt: new Date(Math.floor(now / 1000) * 1000 + 600000).toISOString(),
  });
  expect(request).toHaveBeenCalledTimes(3);
  expect(JSON.stringify(rotated)).not.toContain("private-access");
});
it.each([
  { sub: "different-human" },
  { email: "other@example.test" },
  { iss: "https://other.example" },
  { aud: "other-client" },
  { nonce: "foreign-flow" },
  { email_verified: false },
  { azp: "other-client" },
  { aud: [clientId, "other-client"] },
  { exp: Math.floor(now / 1000) - 1 },
])("rejects a refreshed identity with mismatched claims %j", async (claims) => {
  const { client } = await fixture(claims);
  await expect(client.refresh(grant)).rejects.toThrow();
});
it("permits a valid authorized-party claim for multiple audiences", async () => {
  const { client } = await fixture({
    aud: [clientId, "extra-audience"],
    azp: clientId,
  });
  await expect(client.refresh(grant)).resolves.toMatchObject({
    subject: grant.subject,
  });
});
it("requires reauthentication for revoked grants without returning provider details", async () => {
  const { client } = await fixture({}, 400);
  await expect(client.refresh(grant)).rejects.toThrow();
});
it("treats provider outages as temporary instead of inventing a new proof", async () => {
  const { client } = await fixture({}, 503);
  await expect(client.refresh(grant)).rejects.toThrow(
    "stackit_refresh_unavailable",
  );
});
it("cannot decrypt a stored grant in another user, tenant, session or artifact purpose", () => {
  const crypto = new ArtifactCrypto(randomBytes(32).toString("base64"));
  const bytes = crypto.encrypt(
    Buffer.from(JSON.stringify(grant)),
    "tenant",
    "human",
    "stackit-refresh:session",
  );
  expect(bytes.toString()).not.toContain(grant.refreshToken);
  for (const [tenant, user, purpose] of [
    ["other", "human", "stackit-refresh:session"],
    ["tenant", "other", "stackit-refresh:session"],
    ["tenant", "human", "stackit-refresh:other"],
    ["tenant", "human", "plan-artifact"],
  ])
    expect(() => crypto.decrypt(bytes, tenant!, user!, purpose!)).toThrow();
});
