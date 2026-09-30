import { generateKeyPairSync, randomUUID, verify } from "node:crypto";
import { expect, it, vi } from "vitest";
import {
  StackitAccessCheck,
  signedAssertion,
} from "../apps/api/src/credentials/check.js";
import { parseServiceAccountKey } from "../apps/api/src/credentials/key.js";

const pair = generateKeyPairSync("rsa", { modulusLength: 2048 });
const key = parseServiceAccountKey({
  credentials: {
    kid: randomUUID(),
    iss: "test@sa.stackit.cloud",
    sub: randomUUID(),
    aud: "https://accounts.stackit.cloud",
    tokenEndpoint: "https://accounts.stackit.cloud/oauth/v2/token",
    privateKey: pair.privateKey
      .export({ type: "pkcs8", format: "pem" })
      .toString(),
  },
});
const organizationId = randomUUID();
it("signs a short-lived RS512 assertion with a fresh jti and the declared identity", () => {
  const assertion = signedAssertion(key, 1000);
  const [header, payload, signature] = assertion.split(".");
  if (!header || !payload || !signature) throw new Error("missing JWT parts");
  expect(JSON.parse(Buffer.from(header, "base64url").toString())).toEqual({
    alg: "RS512",
    typ: "JWT",
    kid: key.credentials.kid,
  });
  const claims = JSON.parse(Buffer.from(payload, "base64url").toString());
  expect(claims).toMatchObject({
    iss: key.credentials.iss,
    sub: key.credentials.sub,
    aud: key.credentials.aud,
    iat: 1000,
    exp: 1600,
  });
  expect(claims.jti).toMatch(/^[0-9a-f-]{36}$/);
  expect(signedAssertion(key, 1000)).not.toBe(assertion);
  expect(
    verify(
      "RSA-SHA512",
      Buffer.from(`${header}.${payload}`),
      pair.publicKey,
      Buffer.from(signature, "base64url"),
    ),
  ).toBe(true);
});
it("exchanges the assertion only at the trusted endpoint and returns organization metadata without credentials", async () => {
  const request = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(
      Response.json({
        access_token: "short-lived-private",
        token_type: "Bearer",
        expires_in: 3600,
      }),
    )
    .mockResolvedValueOnce(
      Response.json({
        organizationId,
        name: "Test organization",
        lifecycleState: "ACTIVE",
      }),
    );
  const result = await new StackitAccessCheck(request).check(
    key,
    organizationId,
  );
  expect(result).toMatchObject({
    status: "passed",
    code: "organization_readable",
    organizationId,
    organizationName: "Test organization",
  });
  expect(request.mock.calls[0]?.[0]).toBe(
    "https://accounts.stackit.cloud/oauth/v2/token",
  );
  const form = new URLSearchParams(String(request.mock.calls[0]?.[1]?.body));
  expect(form.get("grant_type")).toBe(
    "urn:ietf:params:oauth:grant-type:jwt-bearer",
  );
  expect(form.get("assertion")).toMatch(/^[^.]+\.[^.]+\.[^.]+$/);
  expect(request.mock.calls[1]?.[0]).toBe(
    `https://resource-manager.api.stackit.cloud/v2/organizations/${organizationId}`,
  );
  expect(request.mock.calls[1]?.[1]?.headers).toEqual({
    Authorization: "Bearer short-lived-private",
  });
  for (const [, init] of request.mock.calls)
    expect(init?.redirect).toBe("error");
  expect(JSON.stringify(result)).not.toContain("short-lived-private");
  expect(JSON.stringify(result)).not.toContain("PRIVATE KEY");
});
it("distinguishes authentication, read access and inactive organizations without returning upstream errors", async () => {
  for (const status of [400, 401, 403]) {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response("private diagnostic", { status }));
    expect(
      await new StackitAccessCheck(request).check(key, organizationId),
    ).toMatchObject({ status: "failed", code: "authentication_failed" });
    expect(request).toHaveBeenCalledTimes(1);
  }
  for (const status of [401, 403, 404, 500]) {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json({
          access_token: "private",
          token_type: "bearer",
          expires_in: 60,
        }),
      )
      .mockResolvedValueOnce(new Response("private diagnostic", { status }));
    expect(
      await new StackitAccessCheck(request).check(key, organizationId),
    ).toMatchObject({
      status: "failed",
      code: status === 500 ? "cloud_unavailable" : "organization_access_denied",
    });
  }
  const request = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(
      Response.json({
        access_token: "private",
        token_type: "bearer",
        expires_in: 60,
      }),
    )
    .mockResolvedValueOnce(
      Response.json({
        organizationId,
        name: "Inactive",
        lifecycleState: "INACTIVE",
      }),
    );
  expect(
    await new StackitAccessCheck(request).check(key, organizationId),
  ).toMatchObject({ status: "failed", code: "organization_not_active" });
});
it("rejects injected destinations, path input, expired tokens and mismatched organization responses", async () => {
  const request = vi.fn<typeof fetch>();
  await expect(
    new StackitAccessCheck(request).check(key, "../other"),
  ).rejects.toThrow();
  const malicious = structuredClone(key);
  Object.assign(malicious.credentials, {
    tokenEndpoint: "https://attacker.example",
  });
  expect(
    await new StackitAccessCheck(request).check(malicious, organizationId),
  ).toMatchObject({ status: "failed", code: "invalid_stored_key" });
  expect(request).not.toHaveBeenCalled();
  request.mockResolvedValueOnce(
    Response.json({
      access_token: "private",
      token_type: "bearer",
      expires_in: 0,
    }),
  );
  expect(
    await new StackitAccessCheck(request).check(key, organizationId),
  ).toMatchObject({ status: "failed", code: "cloud_unavailable" });
  request
    .mockResolvedValueOnce(
      Response.json({
        access_token: "private",
        token_type: "bearer",
        expires_in: 60,
      }),
    )
    .mockResolvedValueOnce(
      Response.json({
        organizationId: randomUUID(),
        name: "Other",
        lifecycleState: "ACTIVE",
      }),
    );
  expect(
    await new StackitAccessCheck(request).check(key, organizationId),
  ).toMatchObject({ status: "failed", code: "cloud_unavailable" });
});
