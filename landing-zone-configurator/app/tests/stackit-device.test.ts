import { createHash } from "node:crypto";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { expect, it, vi } from "vitest";
import { buildApp } from "../apps/api/src/app.js";
import type { AuthServices } from "../apps/api/src/auth/routes.js";
import { StackitDeviceFlow } from "../apps/api/src/auth/stackit-device.js";
import { openStackitCodeCallback } from "../scripts/stackit-code-callback.js";
import { buildDeviceSpike } from "../scripts/stackit-device-flow.js";

const issuer = "https://accounts.stackit.cloud";
const clientId = "stackit-cli-0000-0000-000000000001";
const now = Date.now();
const pair = await generateKeyPair("RS256");
const jwk = {
  ...(await exportJWK(pair.publicKey)),
  kid: "test-key",
  alg: "RS256",
  use: "sig",
};
const subject = "human-test-subject";
const email = "person@example.test";

it("accepts proof callbacks only for the original live session and tenant without saving or binding", async () => {
  const session = {
    id: "proof-session",
    userId: "proof-user",
    tenantId: "proof-tenant",
    githubId: "",
    login: email,
    csrfToken: "c".repeat(43),
    expiresAt: new Date(Date.now() + 3600000),
  };
  const organizationId = "11111111-1111-4111-8111-111111111111";
  const save = vi.fn();
  const bindOrganization = vi.fn();
  const flow = new StackitDeviceFlow(vi.fn(), Date.now, organizationId, {
    redirectUri: "http://localhost:8000",
    purpose: "proof",
  });
  const auth: AuthServices = {
    origin: "https://configurator.example",
    clientId: "",
    store: {
      beginLogin: vi.fn(),
      consumeLogin: vi.fn(),
      createSession: vi.fn(),
      deleteSession: vi.fn(),
      resolveSession: vi.fn(async (token: string) =>
        token === "s".repeat(43)
          ? session
          : { ...session, id: "other-session" },
      ),
    },
    github: { authorize: vi.fn() },
    tokens: { put: vi.fn(), get: vi.fn(), remove: vi.fn() },
  };
  const app = buildApp({
    auth,
    stackit: {
      identities: {
        status: vi.fn(),
        save,
        revoke: vi.fn(),
        bindOrganization,
        clearOrganizationProof: vi.fn(),
      },
      organisations: {
        overview: vi.fn(async () => ({
          userId: session.userId,
          activeTenantId: session.tenantId,
          tenants: [
            {
              id: session.tenantId,
              name: "Proof",
              kind: "organisation" as const,
              organizationId,
              organizationVerified: false,
              roles: [],
              manageMembers: false,
            },
          ],
          members: [],
        })),
      },
      createFlow: () => flow,
    },
  });
  try {
    const bound = `__Host-lzc-session=${"s".repeat(43)}`;
    const started = await app.inject({
      method: "POST",
      url: "/api/v1/stackit/identity/start",
      headers: {
        origin: auth.origin,
        cookie: bound,
        "x-lzc-csrf": session.csrfToken,
        "x-lzc-tenant": session.tenantId,
      },
      payload: {},
    });
    expect(started.statusCode).toBe(200);
    const authorization = new URL(started.json().verificationUri);
    const callback = `/auth/stackit/proof-callback?${new URLSearchParams({ state: authorization.searchParams.get("state") ?? "", code: "test-code" })}`;
    expect((await app.inject(callback)).statusCode).toBe(400);
    expect(
      (
        await app.inject({
          url: callback,
          headers: { cookie: `__Host-lzc-session=${"b".repeat(43)}` },
        })
      ).statusCode,
    ).toBe(400);
    session.tenantId = "different-tenant";
    expect(
      (await app.inject({ url: callback, headers: { cookie: bound } }))
        .statusCode,
    ).toBe(400);
    session.tenantId = "proof-tenant";
    expect(
      (await app.inject({ url: callback, headers: { cookie: bound } }))
        .statusCode,
    ).toBe(302);
    expect(save).not.toHaveBeenCalled();
    expect(bindOrganization).not.toHaveBeenCalled();
    expect(
      (await app.inject({ url: callback, headers: { cookie: bound } }))
        .statusCode,
    ).toBe(400);
  } finally {
    await app.close();
  }
});

it("binds authorization callbacks to the initiating browser cookie and never creates a session in the callback", async () => {
  const flow = new StackitDeviceFlow(vi.fn(), Date.now, undefined, {
    redirectUri: "http://localhost:8000",
    purpose: "login",
  });
  const createStackitSession = vi.fn();
  const auth: AuthServices = {
    origin: "https://configurator.example",
    clientId: "",
    primaryStackit: true,
    githubEnabled: false,
    store: {
      beginLogin: vi.fn(),
      consumeLogin: vi.fn(),
      createSession: vi.fn(),
      createStackitSession,
      resolveSession: vi.fn(async () => null),
      deleteSession: vi.fn(),
    },
    github: { authorize: vi.fn() },
    tokens: { put: vi.fn(), get: vi.fn(), remove: vi.fn() },
  };
  const app = buildApp({
    auth,
    stackit: {
      identities: { save: vi.fn(), status: vi.fn(), revoke: vi.fn() },
      organisations: { overview: vi.fn() },
      createFlow: () => flow,
    },
  });
  try {
    const started = await app.inject({
      method: "POST",
      url: "/auth/stackit/start",
      headers: { origin: auth.origin },
    });
    expect(started.statusCode).toBe(200);
    expect(started.cookies[0]).toMatchObject({
      secure: true,
      httpOnly: true,
      sameSite: "Lax",
    });
    const authorization = new URL(started.json().verificationUri);
    const callback = `/auth/stackit/callback?${new URLSearchParams({ state: authorization.searchParams.get("state") ?? "", code: "test-code" })}`;
    const browserCookie = started.cookies[0];
    if (!browserCookie) throw new Error("Login browser cookie missing");
    const bound = `${browserCookie.name}=${browserCookie.value}`;
    expect((await app.inject(callback)).statusCode).toBe(400);
    expect(
      (
        await app.inject({
          url: callback,
          headers: { cookie: `__Host-lzc-device=${"b".repeat(43)}` },
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (
        await app.inject({
          url: callback.replace(
            "test-code",
            "test-code&iss=https%3A%2F%2Fevil.example",
          ),
          headers: { cookie: bound },
        })
      ).statusCode,
    ).toBe(400);
    const accepted = await app.inject({
      url: callback,
      headers: { cookie: bound },
    });
    expect(accepted.statusCode).toBe(302);
    expect(accepted.headers.location).toBe(auth.origin);
    expect(accepted.headers["cache-control"]).toBe("no-store");
    expect(createStackitSession).not.toHaveBeenCalled();
    expect(
      (await app.inject({ url: callback, headers: { cookie: bound } }))
        .statusCode,
    ).toBe(400);
  } finally {
    await app.close();
  }
});

it.each(["missing-id-token", "wrong-nonce"])(
  "rejects authorization-code identity with %s",
  async (failure) => {
    let clock = now;
    const request = vi.fn<typeof fetch>(async (url) => {
      if (String(url).endsWith("jwks.json"))
        return Response.json({ keys: [jwk] });
      if (!String(url).endsWith("/token"))
        throw new Error("unexpected endpoint");
      const idToken = await new SignJWT({
        nonce: "wrong",
        email,
        email_verified: true,
      })
        .setProtectedHeader({ alg: "RS256", kid: "test-key" })
        .setIssuer(issuer)
        .setAudience(clientId)
        .setSubject(subject)
        .setIssuedAt()
        .setExpirationTime("5m")
        .sign(pair.privateKey);
      return Response.json({
        access_token: "private-access-token",
        token_type: "Bearer",
        expires_in: 300,
        ...(failure === "wrong-nonce" ? { id_token: idToken } : {}),
      });
    });
    const flow = new StackitDeviceFlow(request, () => clock, undefined, {
      redirectUri: "http://localhost:8000",
      purpose: "login",
    });
    const authorization = new URL((await flow.begin()).verificationUri);
    expect(
      flow.acceptAuthorization({
        state: authorization.searchParams.get("state"),
        code: "test-code",
      }),
    ).toBe(true);
    clock += 2000;
    expect(await flow.poll()).toEqual({
      status: "failed",
      code:
        failure === "wrong-nonce"
          ? "identity_nonce_mismatch"
          : "id_token_required",
    });
    expect(
      request.mock.calls.some(([url]) => String(url).endsWith("userinfo")),
    ).toBe(false);
  },
);

it("rejects expired and cancelled authorization callbacks and unregistered CLI redirect targets", async () => {
  for (const terminal of ["expire", "cancel"]) {
    let clock = now;
    const flow = new StackitDeviceFlow(vi.fn(), () => clock, undefined, {
      redirectUri: "http://localhost:8000",
      purpose: "proof",
    });
    const authorization = new URL((await flow.begin()).verificationUri);
    if (terminal === "expire") clock += 900001;
    else flow.cancel();
    expect(
      flow.acceptAuthorization({
        state: authorization.searchParams.get("state"),
        code: "test-code",
      }),
    ).toBe(false);
  }
  for (const redirectUri of [
    "http://localhost:4181",
    "https://evil.example",
    "http://localhost:8000/path",
    "http://user@localhost:8000",
  ])
    expect(
      () =>
        new StackitDeviceFlow(vi.fn(), Date.now, undefined, {
          redirectUri,
          purpose: "login",
        }),
    ).toThrow("invalid_cli_callback");
});

it("forwards local CLI callbacks only to the fixed browser origin and rejects duplicate state", async () => {
  const callback = await openStackitCodeCallback("http://127.0.0.1:4181");
  try {
    for (const purpose of ["login", "proof"]) {
      const url = new URL(callback.redirectUri);
      url.search = new URLSearchParams({
        state: `${purpose}.${"a".repeat(43)}`,
        code: "test-code",
        error_description: "must-not-forward",
        redirect_uri: "https://evil.example",
      }).toString();
      const response = await fetch(url, { redirect: "manual" });
      expect(response.status).toBe(303);
      expect(response.headers.get("referrer-policy")).toBe("no-referrer");
      const forwarded = new URL(response.headers.get("location") ?? "");
      expect(forwarded.origin).toBe("http://127.0.0.1:4181");
      expect(forwarded.pathname).toBe(
        purpose === "proof"
          ? "/auth/stackit/proof-callback"
          : "/auth/stackit/callback",
      );
      expect(forwarded.searchParams.get("code")).toBe("test-code");
      expect(forwarded.searchParams.has("redirect_uri")).toBe(false);
      expect(forwarded.searchParams.has("error_description")).toBe(false);
      url.searchParams.append("state", "wrong");
      expect((await fetch(url, { redirect: "manual" })).status).toBe(400);
    }
    expect((await fetch(callback.redirectUri, { method: "POST" })).status).toBe(
      400,
    );
  } finally {
    await callback.close();
  }
  await expect(openStackitCodeCallback("https://evil.example")).rejects.toThrow(
    "invalid_local_callback_origin",
  );
});

it("uses the CLI authorization-code PKCE start and accepts only a once-bound signed identity", async () => {
  let clock = now;
  let authorization: URL;
  const request = vi.fn<typeof fetch>(async (url, init) => {
    if (String(url).endsWith("/token")) {
      const body = new URLSearchParams(String(init?.body));
      expect(body.get("grant_type")).toBe("authorization_code");
      expect(body.get("redirect_uri")).toBe("http://localhost:8000");
      expect(body.get("code")).toBe("private-authorization-code");
      expect(
        createHash("sha256")
          .update(body.get("code_verifier") ?? "")
          .digest("base64url"),
      ).toBe(authorization.searchParams.get("code_challenge"));
      const idToken = await new SignJWT({
        email,
        email_verified: true,
        nonce: authorization.searchParams.get("nonce"),
      })
        .setProtectedHeader({ alg: "RS256", kid: "test-key" })
        .setIssuer(issuer)
        .setAudience(clientId)
        .setSubject(subject)
        .setIssuedAt()
        .setExpirationTime("5m")
        .sign(pair.privateKey);
      return Response.json({
        access_token: "private-access-token",
        id_token: idToken,
        refresh_token: "must-not-retain",
        token_type: "Bearer",
        expires_in: 300,
      });
    }
    if (String(url).endsWith("jwks.json"))
      return Response.json({ keys: [jwk] });
    if (String(url).endsWith("userinfo"))
      return Response.json({ sub: subject, email, email_verified: true });
    throw new Error("unexpected endpoint");
  });
  const flow = new StackitDeviceFlow(request, () => clock, undefined, {
    redirectUri: "http://localhost:8000",
    purpose: "login",
  });
  const start = await flow.begin();
  authorization = new URL(start.verificationUri);
  expect(authorization.pathname).toBe("/oauth/v2/authorize");
  expect(authorization.searchParams.get("scope")).toBe(
    "openid offline_access email",
  );
  expect(authorization.searchParams.get("code_challenge_method")).toBe("S256");
  expect(start).not.toHaveProperty("userCode");
  expect(await flow.poll()).toMatchObject({ status: "waiting" });
  expect(request).not.toHaveBeenCalled();
  expect(
    flow.acceptAuthorization({
      state: "wrong",
      code: "private-authorization-code",
    }),
  ).toBe(false);
  const callback = {
    state: authorization.searchParams.get("state"),
    code: "private-authorization-code",
  };
  expect(flow.acceptAuthorization(callback)).toBe(true);
  expect(flow.acceptAuthorization(callback)).toBe(false);
  clock += 2000;
  const verified = await flow.poll();
  expect(verified).toMatchObject({
    status: "verified",
    identity: { subject, email },
  });
  expect(JSON.stringify(verified)).not.toContain("private-access-token");
  expect(JSON.stringify(verified)).not.toContain("must-not-retain");
  flow.cancel();
  expect(flow.acceptAuthorization(callback)).toBe(false);
});

it("uses STACKIT as primary login without GitHub and binds approval to a secure browser cookie", async () => {
  const { flow, advance } = await setup({ tokens: { id_token: undefined } });
  const createStackitSession = vi.fn(async (input) => ({
    ...input,
    userId: "11111111-1111-4111-8111-111111111111",
    tenantId: "22222222-2222-4222-8222-222222222222",
    githubId: "",
    login: email,
  }));
  const auth: AuthServices = {
    origin: "https://configurator.example",
    clientId: "",
    primaryStackit: true,
    githubEnabled: false,
    store: {
      beginLogin: vi.fn(),
      consumeLogin: vi.fn(),
      createSession: vi.fn(),
      createStackitSession,
      resolveSession: vi.fn(async () => null),
      deleteSession: vi.fn(),
    },
    github: { authorize: vi.fn() },
    tokens: { put: vi.fn(), get: vi.fn(), remove: vi.fn() },
  };
  const app = buildApp({
    auth,
    stackit: {
      identities: { save: vi.fn(), status: vi.fn(), revoke: vi.fn() },
      organisations: { overview: vi.fn() },
      createFlow: () => flow,
    },
  });
  try {
    expect((await app.inject("/auth/status")).json()).toMatchObject({
      github: false,
      stackit: true,
      primary: "stackit",
    });
    expect(
      (await app.inject({ method: "POST", url: "/auth/stackit/start" }))
        .statusCode,
    ).toBe(403);
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/auth/stackit/start",
          headers: { origin: auth.origin },
          payload: { email: "injected@example.test" },
        })
      ).statusCode,
    ).toBe(400);
    const start = await app.inject({
      method: "POST",
      url: "/auth/stackit/start",
      headers: { origin: auth.origin },
    });
    expect(start.statusCode).toBe(200);
    expect(start.cookies[0]).toMatchObject({
      name: "__Host-lzc-device",
      secure: true,
      httpOnly: true,
      sameSite: "Strict",
    });
    const bound = `${start.cookies[0]!.name}=${start.cookies[0]!.value}`;
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/auth/stackit/poll",
          headers: {
            origin: auth.origin,
            cookie: `__Host-lzc-device=${"b".repeat(43)}`,
          },
        })
      ).statusCode,
    ).toBe(409);
    advance(5000);
    const poll = await app.inject({
      method: "POST",
      url: "/auth/stackit/poll",
      headers: { origin: auth.origin, cookie: bound },
    });
    expect(poll.json()).toEqual({ status: "verified" });
    expect(
      poll.cookies.find((value) => value.name === "__Host-lzc-session"),
    ).toMatchObject({ secure: true, httpOnly: true });
    expect(createStackitSession).toHaveBeenCalledOnce();
    expect(createStackitSession.mock.calls[0]![0].identity).toMatchObject({
      subject,
      email,
    });
    expect(auth.store.createSession).not.toHaveBeenCalled();
    expect(auth.tokens.put).not.toHaveBeenCalled();
    expect(auth.github.authorize).not.toHaveBeenCalled();
    expect(poll.body + JSON.stringify(poll.headers)).not.toContain(
      "private-access-token",
    );
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/auth/stackit/poll",
          headers: { origin: auth.origin, cookie: bound },
        })
      ).statusCode,
    ).toBe(409);
  } finally {
    await app.close();
  }
});

async function setup(
  options: {
    claims?: Record<string, unknown>;
    user?: Record<string, unknown>;
    tokens?: Record<string, unknown>;
    userinfoStatus?: number;
    wrongSignature?: boolean;
    errors?: string[];
    organizationId?: string;
    organizationPermissions?: unknown;
    organizationPermissionsStatus?: number;
    organizationRoles?: unknown;
    organizationRolesStatus?: number;
  } = {},
) {
  let clock = now;
  const token = await new SignJWT({
    email,
    email_verified: true,
    ...options.claims,
  })
    .setProtectedHeader({ alg: "RS256", kid: "test-key" })
    .setIssuer(String(options.claims?.iss ?? issuer))
    .setAudience(String(options.claims?.aud ?? clientId))
    .setSubject(subject)
    .setIssuedAt(Math.floor(now / 1000))
    .setExpirationTime(Math.floor(now / 1000) + 300)
    .sign(
      options.wrongSignature
        ? (await generateKeyPair("RS256")).privateKey
        : pair.privateKey,
    );
  const errors = [...(options.errors ?? [])];
  const request = vi.fn<typeof fetch>(async (url, init) => {
    expect(init?.redirect).toBe("error");
    if (String(url).endsWith("device_authorization")) {
      expect(new URLSearchParams(String(init?.body)).get("scope")).toBe(
        "openid email",
      );
      return Response.json({
        device_code: "private-device-code",
        user_code: "ABCD-EFGH",
        verification_uri: `${issuer}/device`,
        verification_uri_complete: `${issuer}/device?user_code=ABCD-EFGH`,
        expires_in: 300,
        interval: 5,
      });
    }
    if (String(url).endsWith("/token")) {
      const error = errors.shift();
      if (error)
        return Response.json(
          { error, error_description: "must never leak" },
          { status: 400 },
        );
      return Response.json({
        access_token: "private-access-token",
        id_token: token,
        refresh_token: "must-not-retain",
        token_type: "Bearer",
        expires_in: 300,
        ...options.tokens,
      });
    }
    if (String(url).endsWith("jwks.json"))
      return Response.json({ keys: [jwk] });
    if (String(url).endsWith("userinfo")) {
      expect(String(url)).toBe(`${issuer}/oidc/v1/userinfo`);
      expect(init?.headers).toEqual({
        Authorization: "Bearer private-access-token",
      });
      return Response.json(
        {
          sub: subject,
          email,
          email_verified: true,
          ...options.user,
        },
        { status: options.userinfoStatus ?? 200 },
      );
    }
    if (String(url).endsWith("/roles")) {
      expect(String(url)).toBe(
        `https://authorization.api.stackit.cloud/v2/organization/${options.organizationId}/roles`,
      );
      expect(init?.headers).toEqual({
        Authorization: "Bearer private-access-token",
      });
      return Response.json(
        options.organizationRoles ?? {
          resourceId: options.organizationId,
          resourceType: "organization",
          roles: [
            {
              name: "owner",
              permissions: [
                { name: "organization.read" },
                { name: "organization.write" },
              ],
            },
          ],
        },
        { status: options.organizationRolesStatus ?? 200 },
      );
    }
    if (String(url).startsWith("https://authorization.api.stackit.cloud/")) {
      const permissionsUrl = new URL(String(url));
      expect(permissionsUrl.pathname).toBe(
        `/v2/users/${encodeURIComponent(email)}/permissions`,
      );
      expect(permissionsUrl.searchParams.get("resourceType")).toBe(
        "organization",
      );
      expect(permissionsUrl.searchParams.get("resource")).toBe(
        options.organizationId,
      );
      expect(init?.headers).toEqual({
        Authorization: "Bearer private-access-token",
      });
      return Response.json(options.organizationPermissions ?? { items: [] }, {
        status: options.organizationPermissionsStatus ?? 200,
      });
    }
    if (String(url).includes("/organizations/"))
      return Response.json({
        organizationId: options.organizationId,
        name: "Test organization",
        lifecycleState: "ACTIVE",
      });
    throw new Error("unexpected endpoint");
  });
  const flow = new StackitDeviceFlow(
    request,
    () => clock,
    options.organizationId,
  );
  return {
    flow,
    request,
    advance: (milliseconds: number) => {
      clock += milliseconds;
    },
  };
}

it("binds effective permissions to the verified human and exact organization without granting execution", async () => {
  const organizationId = "11111111-1111-4111-8111-111111111111";
  const { flow, advance } = await setup({
    organizationId,
    organizationPermissions: {
      items: [
        {
          resourceId: organizationId,
          resourceType: "organization",
          permissions: [
            { name: "organization.write" },
            { name: "organization.read" },
            { name: "organization.write" },
          ],
        },
      ],
    },
  });
  await flow.begin();
  advance(5000);
  const state = await flow.poll();
  expect(state).toMatchObject({
    status: "verified",
    identity: {
      organization: {
        id: organizationId,
        permissions: ["organization.read", "organization.write"],
      },
    },
  });
  expect(JSON.stringify(state)).not.toContain("private-access-token");
  expect(state).not.toHaveProperty("executionEnabled");
});

it.each([
  [
    {
      items: [
        {
          resourceId: "22222222-2222-4222-8222-222222222222",
          resourceType: "organization",
          permissions: [],
        },
      ],
    },
    "organization_permissions_binding_mismatch",
  ],
  [
    {
      items: [
        {
          resourceId: "11111111-1111-4111-8111-111111111111",
          resourceType: "project",
          permissions: [],
        },
      ],
    },
    "organization_permissions_response_invalid_response",
  ],
  [
    {
      items: [
        {
          resourceId: "11111111-1111-4111-8111-111111111111",
          resourceType: "organization",
          permissions: [{ name: "injected_admin" }],
        },
      ],
    },
    "organization_permissions_response_invalid_response",
  ],
  [{}, "organization_permissions_response_invalid_response"],
])(
  "rejects invalid or foreign IAM proof %j",
  async (organizationPermissions, code) => {
    const { flow, advance } = await setup({
      organizationId: "11111111-1111-4111-8111-111111111111",
      organizationPermissions,
    });
    await flow.begin();
    advance(5000);
    expect(await flow.poll()).toEqual({ status: "failed", code });
  },
);

it.each([401, 403, 500])(
  "fails closed on IAM status %s without exposing provider errors",
  async (organizationPermissionsStatus) => {
    const { flow, advance } = await setup({
      organizationId: "11111111-1111-4111-8111-111111111111",
      organizationPermissionsStatus,
      organizationPermissions: { token: "private-access-token" },
    });
    await flow.begin();
    advance(5000);
    expect(await flow.poll()).toEqual({
      status: "failed",
      code: "organization_permissions_denied",
    });
  },
);

it.each([401, 403, 500])(
  "does not infer owner authority when the official roles request returns %s",
  async (organizationRolesStatus) => {
    const organizationId = "11111111-1111-4111-8111-111111111111";
    const { flow, advance } = await setup({
      organizationId,
      organizationRolesStatus,
      organizationPermissions: {
        items: [
          {
            resourceId: organizationId,
            resourceType: "organization",
            permissions: [{ name: "organization.read" }],
          },
        ],
      },
    });
    await flow.begin();
    advance(5000);
    const state = await flow.poll();
    expect(state).toMatchObject({
      status: "verified",
      identity: { organization: { permissions: ["organization.read"] } },
    });
    expect(JSON.stringify(state)).not.toContain("ownerPermissions");
  },
);

it.each([
  { roles: [] },
  { roles: [{ name: "reader", permissions: [{ name: "organization.read" }] }] },
  { roles: [{ name: "owner", permissions: [] }] },
  {
    roles: [
      { name: "owner", permissions: [{ name: "organization.read" }] },
      { name: "owner", permissions: [{ name: "organization.write" }] },
    ],
  },
])("requires one nonempty official owner role: %j", async ({ roles }) => {
  const organizationId = "11111111-1111-4111-8111-111111111111";
  const { flow, advance } = await setup({
    organizationId,
    organizationRoles: {
      resourceId: organizationId,
      resourceType: "organization",
      roles,
    },
    organizationPermissions: {
      items: [
        {
          resourceId: organizationId,
          resourceType: "organization",
          permissions: [{ name: "organization.read" }],
        },
      ],
    },
  });
  await flow.begin();
  advance(5000);
  const state = await flow.poll();
  expect(state.status).toBe("verified");
  expect(JSON.stringify(state)).not.toContain("ownerPermissions");
});

it.each([
  {
    resourceId: "22222222-2222-4222-8222-222222222222",
    resourceType: "organization",
    roles: [],
  },
  {
    resourceId: "11111111-1111-4111-8111-111111111111",
    resourceType: "project",
    roles: [],
  },
  {
    resourceId: "11111111-1111-4111-8111-111111111111",
    resourceType: "organization",
  },
])(
  "rejects a foreign or malformed official role response: %j",
  async (organizationRoles) => {
    const organizationId = "11111111-1111-4111-8111-111111111111";
    const { flow, advance } = await setup({
      organizationId,
      organizationRoles,
      organizationPermissions: {
        items: [
          {
            resourceId: organizationId,
            resourceType: "organization",
            permissions: [{ name: "organization.read" }],
          },
        ],
      },
    });
    await flow.begin();
    advance(5000);
    expect(await flow.poll()).toEqual({
      status: "failed",
      code: "organization_roles_response_invalid_response",
    });
  },
);

it("captures the official owner permission set separately from effective human permissions", async () => {
  const organizationId = "11111111-1111-4111-8111-111111111111";
  const { flow, advance } = await setup({
    organizationId,
    organizationPermissions: {
      items: [
        {
          resourceId: organizationId,
          resourceType: "organization",
          permissions: [
            { name: "organization.write" },
            { name: "organization.read" },
          ],
        },
      ],
    },
  });
  await flow.begin();
  advance(5000);
  expect(await flow.poll()).toMatchObject({
    status: "verified",
    identity: {
      organization: {
        id: organizationId,
        permissions: ["organization.read", "organization.write"],
        ownerPermissions: ["organization.read", "organization.write"],
      },
    },
  });
});

it("keeps codes and tokens server-side and verifies signature, issuer, audience and matching userinfo", async () => {
  const organizationId = "11111111-1111-4111-8111-111111111111";
  const { flow, request, advance } = await setup({ organizationId });
  const start = await flow.begin();
  expect(JSON.stringify(start)).not.toContain("private-device-code");
  expect(start.verificationUri).toContain("user_code=");
  expect(await flow.poll()).toEqual({ status: "waiting", retryAfterMs: 5000 });
  expect(request).toHaveBeenCalledTimes(1);
  advance(5000);
  const state = await flow.poll();
  expect(state).toMatchObject({
    status: "verified",
    identity: {
      issuer,
      subject,
      email,
      emailVerified: true,
      verificationMethod: "signed-id-token-and-userinfo",
      organization: { id: organizationId, name: "Test organization" },
    },
  });
  for (const secret of [
    "private-device-code",
    "private-access-token",
    "must-not-retain",
    "eyJhbGci",
  ])
    expect(JSON.stringify(state)).not.toContain(secret);
  const calls = request.mock.calls.length;
  expect(await flow.poll()).toEqual(state);
  expect(request).toHaveBeenCalledTimes(calls);
});

it("verifies the device grant through trusted Userinfo when no ID token is issued", async () => {
  const { flow, request, advance } = await setup({
    tokens: { id_token: undefined },
  });
  await flow.begin();
  advance(5000);
  const state = await flow.poll();
  expect(state).toMatchObject({
    status: "verified",
    identity: {
      issuer,
      subject,
      email,
      emailVerified: true,
      verificationMethod: "device-grant-userinfo",
      tokenExpiresAt: new Date(now + 305000).toISOString(),
    },
  });
  expect(
    request.mock.calls.some(([url]) => String(url).endsWith("jwks.json")),
  ).toBe(false);
  for (const secret of [
    "private-access-token",
    "private-device-code",
    "must-not-retain",
  ])
    expect(JSON.stringify(state)).not.toContain(secret);
});

it.each([
  { sub: undefined },
  { email: undefined },
  { email_verified: undefined },
  { email_verified: false },
  { email: "automation@sa.stackit.cloud" },
])("rejects unsafe Userinfo without an ID token: %j", async (user) => {
  const { flow, advance } = await setup({
    tokens: { id_token: undefined },
    user,
  });
  await flow.begin();
  advance(5000);
  expect(await flow.poll()).toMatchObject({ status: "failed" });
});

it.each([null, "", 123, "malformed-token"])(
  "never falls back from an invalid supplied ID token: %j",
  async (id_token) => {
    const { flow, request, advance } = await setup({ tokens: { id_token } });
    await flow.begin();
    advance(5000);
    expect(await flow.poll()).toMatchObject({ status: "failed" });
    expect(
      request.mock.calls.some(([url]) => String(url).endsWith("userinfo")),
    ).toBe(false);
  },
);

it.each([401, 403])(
  "rejects a denied Userinfo request without an ID token: %j",
  async (userinfoStatus) => {
    const { flow, advance } = await setup({
      tokens: { id_token: undefined },
      userinfoStatus,
    });
    await flow.begin();
    advance(5000);
    expect(await flow.poll()).toEqual({
      status: "failed",
      code: "userinfo_failed",
    });
  },
);

it.each([
  { claims: { iss: "https://attacker.example" } },
  { claims: { aud: "other-client" } },
  { wrongSignature: true },
  { claims: { email_verified: false } },
  { claims: { email: "automation@sa.stackit.cloud" } },
  { user: { sub: "other-person" } },
  { user: { email: "other@example.test" } },
  { user: { email_verified: false } },
])("rejects an untrusted or mismatched human identity: %j", async (options) => {
  const { flow, advance } = await setup(options);
  await flow.begin();
  advance(5000);
  expect(await flow.poll()).toMatchObject({ status: "failed" });
  expect(JSON.stringify(flow.state())).not.toContain("private-access-token");
});

it("accepts email claims from subject-matched Userinfo when absent from the signed ID token", async () => {
  const { flow, advance } = await setup({
    claims: { email: undefined, email_verified: undefined },
  });
  await flow.begin();
  advance(5000);
  expect(await flow.poll()).toMatchObject({
    status: "verified",
    identity: { issuer, subject, email, emailVerified: true },
  });
  expect(JSON.stringify(flow.state())).not.toContain("private-access-token");
});

it.each([
  { sub: "other-person" },
  { email_verified: false },
  { email: undefined },
  { email: "automation@sa.stackit.cloud" },
])(
  "rejects unsafe Userinfo even without email claims in the ID token: %j",
  async (user) => {
    const { flow, advance } = await setup({
      claims: { email: undefined, email_verified: undefined },
      user,
    });
    await flow.begin();
    advance(5000);
    expect(await flow.poll()).toMatchObject({ status: "failed" });
  },
);

it("identifies invalid ID-token claims without exposing provider values", async () => {
  const { flow, advance } = await setup({
    claims: { email: "provider-value-must-not-leak" },
  });
  await flow.begin();
  advance(5000);
  expect(await flow.poll()).toEqual({
    status: "failed",
    code: "id_token_claims_invalid_email",
  });
  expect(JSON.stringify(flow.state())).not.toContain(
    "provider-value-must-not-leak",
  );
});

it("identifies signature verification errors without exposing the JWT", async () => {
  const { flow, advance } = await setup({ wrongSignature: true });
  await flow.begin();
  advance(5000);
  expect(await flow.poll()).toEqual({
    status: "failed",
    code: "id_token_verification_err_jws_signature_verification_failed",
  });
  expect(JSON.stringify(flow.state())).not.toContain("eyJhbGci");
});

it("respects pending and slow_down intervals and prevents requests after expiry", async () => {
  const { flow, request, advance } = await setup({
    errors: ["authorization_pending", "slow_down"],
  });
  await flow.begin();
  advance(5000);
  expect(await flow.poll()).toEqual({ status: "waiting", retryAfterMs: 5000 });
  advance(5000);
  expect(await flow.poll()).toEqual({ status: "waiting", retryAfterMs: 10000 });
  const count = request.mock.calls.length;
  advance(9999);
  expect(await flow.poll()).toEqual({ status: "waiting", retryAfterMs: 1 });
  expect(request).toHaveBeenCalledTimes(count);
  advance(300000);
  expect(await flow.poll()).toEqual({ status: "expired" });
  expect(request).toHaveBeenCalledTimes(count);
});

it.each(["access_denied", "expired_token", "invalid_client"])(
  "sanitizes terminal provider errors: %s",
  async (error) => {
    const { flow, request, advance } = await setup({ errors: [error] });
    await flow.begin();
    advance(5000);
    const state = await flow.poll();
    expect(state.status).toBe(error === "expired_token" ? "expired" : "failed");
    expect(JSON.stringify(state)).not.toContain("must never leak");
    const count = request.mock.calls.length;
    await flow.poll();
    expect(request).toHaveBeenCalledTimes(count);
  },
);

it("cancels without subsequent token calls", async () => {
  const { flow, request, advance } = await setup();
  await flow.begin();
  flow.cancel();
  advance(5000);
  expect(await flow.poll()).toEqual({ status: "cancelled" });
  expect(request).toHaveBeenCalledTimes(1);
});

it("binds API device flows to the current session and tenant and persists only provider-verified identities", async () => {
  const organizationId = "11111111-1111-4111-8111-111111111111";
  const { flow, advance } = await setup({
    organizationId,
    tokens: { id_token: undefined },
  });
  const session = {
    id: "session-one",
    userId: "user-one",
    tenantId: "tenant-one",
    githubId: "101",
    login: "alice",
    csrfToken: "c".repeat(43),
    expiresAt: new Date(Date.now() + 3600000),
  };
  const save = vi.fn(),
    revoke = vi.fn();
  const clearOrganizationProof = vi.fn();
  const bindingReceipt = {
    tenantId: session.tenantId,
    organizationId,
    authorizationId: "11111111-1111-4111-8111-111111111111",
    boundBy: session.userId,
    boundAt: new Date().toISOString(),
  };
  const bindOrganization = vi.fn(async () => bindingReceipt);
  const resolveSession = vi.fn(async (token: string) =>
    token === "s".repeat(43)
      ? session
      : token === "b".repeat(43)
        ? { ...session, id: "session-two", userId: "user-two" }
        : null,
  );
  const createFlow = vi.fn(() => flow);
  const app = buildApp({
    auth: {
      origin: "https://configurator.example",
      clientId: "test",
      store: {
        resolveSession,
        beginLogin: vi.fn(),
        consumeLogin: vi.fn(),
        createSession: vi.fn(),
        deleteSession: vi.fn(),
      },
      github: { authorize: vi.fn() },
      tokens: { put: vi.fn(), get: vi.fn(), remove: vi.fn() },
    },
    stackit: {
      identities: {
        status: vi.fn(async () => ({
          identity: null,
          verified: false,
          organizationVerified: false,
        })),
        save,
        revoke,
        clearOrganizationProof,
        bindOrganization,
      },
      organisations: {
        overview: vi.fn(async () => ({
          userId: session.userId,
          activeTenantId: session.tenantId,
          tenants: [
            {
              id: session.tenantId,
              name: "Test",
              kind: "organisation" as const,
              organizationId,
              organizationVerified: false,
              roles: [],
              manageMembers: false,
            },
          ],
          members: [],
        })),
      },
      createFlow,
    },
  });
  const headers = {
    cookie: `__Host-lzc-session=${"s".repeat(43)}`,
    origin: "https://configurator.example",
    "x-lzc-csrf": session.csrfToken,
    "x-lzc-tenant": session.tenantId,
  };
  const post = (action: string, extra = {}, payload = {}) =>
    app.inject({
      method: "POST",
      url: `/api/v1/stackit/identity/${action}`,
      headers: { ...headers, ...extra },
      payload,
    });
  try {
    expect(
      (await app.inject({ url: "/api/v1/stackit/identity" })).statusCode,
    ).toBe(401);
    expect(
      (await app.inject({ url: "/api/v1/stackit/identity", headers })).json()
        .bindingEnabled,
    ).toBe(true);
    expect(
      (
        await post(
          "bind-organization",
          { cookie: "" },
          { confirmOrganizationBinding: true },
        )
      ).statusCode,
    ).toBe(401);
    expect(
      (
        await post(
          "bind-organization",
          { origin: "https://attacker.example" },
          { confirmOrganizationBinding: true },
        )
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await post(
          "bind-organization",
          { "x-lzc-csrf": "x".repeat(43) },
          { confirmOrganizationBinding: true },
        )
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await post(
          "bind-organization",
          { "x-lzc-tenant": "other-tenant" },
          { confirmOrganizationBinding: true },
        )
      ).statusCode,
    ).toBe(409);
    for (const payload of [
      {},
      { confirmOrganizationBinding: false },
      { confirmOrganizationBinding: true, organizationId },
    ]) {
      expect((await post("bind-organization", {}, payload)).statusCode).toBe(
        400,
      );
    }
    expect(bindOrganization).not.toHaveBeenCalled();
    bindOrganization.mockRejectedValueOnce(
      Object.assign(new Error("denied"), { code: "42501" }),
    );
    const deniedBinding = await post(
      "bind-organization",
      {},
      { confirmOrganizationBinding: true },
    );
    expect(deniedBinding.statusCode).toBe(403);
    expect(deniedBinding.json()).toEqual({
      error: "organization_admin_proof_required",
    });
    bindOrganization.mockRejectedValueOnce(
      Object.assign(new Error("stale"), { code: "40001" }),
    );
    expect(
      (
        await post(
          "bind-organization",
          {},
          { confirmOrganizationBinding: true },
        )
      ).statusCode,
    ).toBe(409);
    expect(
      (
        await post(
          "bind-organization",
          {},
          { confirmOrganizationBinding: true },
        )
      ).json(),
    ).toEqual(bindingReceipt);
    expect(bindOrganization).toHaveBeenLastCalledWith(session, {
      confirmOrganizationBinding: true,
    });
    expect(
      (await post("start", { origin: "https://attacker.example" })).statusCode,
    ).toBe(403);
    expect(
      (await post("start", { "x-lzc-csrf": "x".repeat(43) })).statusCode,
    ).toBe(403);
    expect(
      (await post("start", { "x-lzc-tenant": "other-tenant" })).statusCode,
    ).toBe(409);
    expect(
      (
        await post(
          "start",
          {},
          { email, organizationId, access_token: "injected" },
        )
      ).statusCode,
    ).toBe(400);
    expect(createFlow).not.toHaveBeenCalled();
    expect(clearOrganizationProof).not.toHaveBeenCalled();
    expect((await post("start")).statusCode).toBe(200);
    expect(clearOrganizationProof).toHaveBeenCalledExactlyOnceWith(session);
    expect(createFlow).toHaveBeenCalledWith(organizationId, "proof");
    expect((await post("start")).statusCode).toBe(409);
    expect(
      (await post("poll", { cookie: `__Host-lzc-session=${"b".repeat(43)}` }))
        .statusCode,
    ).toBe(409);
    advance(5000);
    expect((await post("poll")).json()).toMatchObject({
      status: "verified",
      identity: {
        verificationMethod: "device-grant-userinfo",
        organization: { id: organizationId },
      },
    });
    expect(save).toHaveBeenCalledExactlyOnceWith(
      session,
      expect.objectContaining({ issuer, subject, email }),
    );
    await post("poll");
    expect(save).toHaveBeenCalledTimes(1);
    expect((await post("revoke")).statusCode).toBe(200);
    expect(revoke).toHaveBeenCalledWith(session);
    expect((await post("poll")).statusCode).toBe(409);
  } finally {
    await app.close();
  }
});

it("protects the local spike with host, browser session, origin and CSRF and rejects input injection", async () => {
  const { flow, request } = await setup();
  const app = buildDeviceSpike(() => flow);
  try {
    const host = "127.0.0.1:4181";
    expect(
      (await app.inject({ url: "/", headers: { host: "attacker.example" } }))
        .statusCode,
    ).toBe(403);
    expect(
      (await app.inject({ url: "/status", headers: { host } })).statusCode,
    ).toBe(403);
    const page = await app.inject({ url: "/", headers: { host } });
    expect(page.headers["content-security-policy"]).toContain(
      "frame-ancestors 'none'",
    );
    const cookie = String(page.headers["set-cookie"]).split(";")[0] ?? "";
    const csrf = cookie.split("=")[1] ?? "";
    const headers = {
      host,
      cookie,
      origin: `http://${host}`,
      "x-spike-csrf": csrf,
    };
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/start",
          headers: { ...headers, origin: "https://attacker.example" },
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/start",
          headers: { ...headers, "x-spike-csrf": "wrong" },
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/start",
          headers,
          payload: { clientId: "other" },
        })
      ).statusCode,
    ).toBe(400);
    expect(request).not.toHaveBeenCalled();
    const start = await app.inject({ method: "POST", url: "/start", headers });
    expect(start.statusCode).toBe(200);
    expect(start.body).not.toContain("private-device-code");
    expect(
      (await app.inject({ url: "/status", headers })).json(),
    ).toMatchObject({
      status: "waiting",
      verificationUri: start.json().verificationUri,
      userCode: "ABCD-EFGH",
    });
    expect(
      (await app.inject({ method: "POST", url: "/start", headers })).statusCode,
    ).toBe(409);
    expect(
      (await app.inject({ method: "POST", url: "/cancel", headers })).json(),
    ).toEqual({ status: "cancelled" });
  } finally {
    await app.close();
  }
});
