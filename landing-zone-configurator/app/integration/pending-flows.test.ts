import { createHash, randomBytes, randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import pg from "pg";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { buildApp } from "../apps/api/src/app.js";
import { PendingFlows } from "../apps/api/src/auth/pending-flows.js";
import type { AuthServices } from "../apps/api/src/auth/routes.js";
import { StackitDeviceFlow } from "../apps/api/src/auth/stackit-device.js";
import type { Session } from "../apps/api/src/auth/store.js";
import { ArtifactCrypto } from "../apps/api/src/plans/crypto.js";
import { migrate } from "../apps/api/src/storage/migrations.js";

const address = new URL(process.env.LZC_TEST_DATABASE_URL ?? "");
if (
  !["127.0.0.1", "localhost"].includes(address.hostname) ||
  address.pathname !== "/configurator_test"
)
  throw new Error("Refusing a non-local/non-test database");
const admin = new pg.Client({ connectionString: address.href });
const connection = {
  host: address.hostname,
  port: Number(address.port),
  database: "configurator_test",
  user: "configurator_migration",
  password: "migration-test-only",
};
const migration = new pg.Client(connection);
// One connection also detects holding a transaction across provider/session calls.
const pool = new pg.Pool({
  ...connection,
  user: "configurator_app",
  password: "runtime-test-only",
  max: 1,
});
const crypto = new ArtifactCrypto(randomBytes(32).toString("base64"));
const storage = { pool, crypto };
const origin = "https://auth-ha.example.test";
const clientId = "synthetic-ha-client";
const issuer = "https://accounts.stackit.cloud";
const session: Session = {
  id: randomUUID(),
  userId: randomUUID(),
  tenantId: randomUUID(),
  githubId: "",
  login: "human@example.test",
  csrfToken: "c".repeat(43),
  expiresAt: new Date(Date.now() + 28800000),
};
const pair = await generateKeyPair("RS256");
const jwk = {
  ...(await exportJWK(pair.publicKey)),
  kid: "ha-test",
  alg: "RS256",
  use: "sig",
};
beforeAll(async () => {
  await admin.connect();
  await admin.query(
    "DO $$ BEGIN IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='configurator_migration') THEN CREATE ROLE configurator_migration LOGIN PASSWORD 'migration-test-only'; END IF; IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='configurator_app') THEN CREATE ROLE configurator_app LOGIN PASSWORD 'runtime-test-only'; END IF; END $$; ALTER DATABASE configurator_test OWNER TO configurator_migration",
  );
  await migration.connect();
  await migrate(
    migration,
    fileURLToPath(new URL("../apps/api/db/", import.meta.url)),
  );
}, 30000);
afterAll(async () => {
  await Promise.all([pool.end(), migration.end(), admin.end()]);
});

function fixture() {
  let nonce = "";
  let challenge = "";
  const exchanged = vi.fn();
  let clock = Date.now();
  const request = vi.fn<typeof fetch>(async (input, init) => {
    const url = String(input);
    if (url.endsWith("/oauth/v2/token")) {
      const body = new URLSearchParams(String(init?.body));
      expect(
        createHash("sha256")
          .update(body.get("code_verifier") ?? "")
          .digest("base64url"),
      ).toBe(challenge);
      exchanged(body.get("code"));
      // A DB read during exchange must not deadlock even with max=1.
      await pool.query("SELECT 1");
      const idToken = await new SignJWT({
        email: session.login,
        email_verified: true,
        nonce,
      })
        .setProtectedHeader({ alg: "RS256", kid: "ha-test" })
        .setIssuer(issuer)
        .setSubject("ha-human")
        .setAudience(clientId)
        .setIssuedAt()
        .setExpirationTime("1h")
        .sign(pair.privateKey);
      return Response.json({
        access_token: "synthetic-access",
        id_token: idToken,
        refresh_token: "synthetic-refresh",
        expires_in: 3600,
        token_type: "Bearer",
      });
    }
    if (url.endsWith("/.well-known/jwks.json"))
      return Response.json({ keys: [jwk] });
    if (url.endsWith("/oidc/v1/userinfo"))
      return Response.json({
        sub: "ha-human",
        email: session.login,
        email_verified: true,
      });
    throw new Error("Unexpected synthetic provider request");
  });
  const factory = (
    organizationId?: string,
    purpose: "login" | "proof" = "login",
  ) =>
    new StackitDeviceFlow(request, () => clock, organizationId, {
      clientId,
      purpose,
      redirectUri: `${origin}/auth/stackit/${purpose === "proof" ? "proof-callback" : "callback"}`,
    });
  const identities = {
    save: vi.fn(async () => {
      await pool.query("SELECT 1");
    }),
    status: vi.fn(async () => ({
      identity: null,
      verified: false,
      organizationVerified: false,
    })),
    revoke: vi.fn(),
  };
  const createStackitSession = vi.fn(async () => {
    await pool.query("SELECT 1");
    return session;
  });
  const auth: AuthServices = {
    origin,
    clientId: "",
    primaryStackit: true,
    githubEnabled: false,
    pendingFlows: storage,
    store: {
      beginLogin: vi.fn(),
      consumeLogin: vi.fn(),
      createSession: vi.fn(),
      createStackitSession,
      resolveSession: vi.fn(async (raw) =>
        raw === "s".repeat(43) ? session : null,
      ),
      deleteSession: vi.fn(),
    },
    github: { authorize: vi.fn() },
    tokens: { put: vi.fn(), get: vi.fn(), remove: vi.fn() },
    stackitSessions: { put: vi.fn(), refresh: vi.fn(), revoke: vi.fn() },
  };
  const apps = Array.from({ length: 3 }, () =>
    buildApp({
      auth: { ...auth },
      stackit: {
        identities,
        organisations: {
          overview: vi.fn(async () => ({
            tenants: [{ id: session.tenantId, organizationId: null }],
          })) as never,
        },
        createFlow: factory,
        authFlow: "authorization-code",
      },
    }),
  );
  const bind = (authorization: string) => {
    const url = new URL(authorization);
    nonce = url.searchParams.get("nonce") ?? "";
    challenge = url.searchParams.get("code_challenge") ?? "";
    clock += 2000;
    return new URLSearchParams({
      state: url.searchParams.get("state") ?? "",
      code: "synthetic-code",
    });
  };
  return {
    apps,
    auth,
    factory,
    identities,
    exchanged,
    createStackitSession,
    bind,
  };
}

it("continues login on three replicas after the starting replica closes; callback and completion are single-use", async () => {
  const f = fixture();
  const [a, b, c] = f.apps;
  try {
    const start = await a!.inject({
      method: "POST",
      url: "/auth/stackit/start",
      headers: { origin },
    });
    expect(start.statusCode).toBe(200);
    const cookie = `__Host-lzc-device=${start.cookies[0]!.value}`;
    const query = f.bind(start.json().verificationUri);
    await a!.close();
    const callback = {
      url: `/auth/stackit/callback?${query}`,
      headers: { cookie },
    };
    expect((await b!.inject(callback)).statusCode).toBe(302);
    expect((await c!.inject(callback)).statusCode).toBe(400);
    const poll = {
      method: "POST" as const,
      url: "/auth/stackit/poll",
      headers: { origin, cookie },
    };
    const completed = await c!.inject(poll);
    expect(completed.statusCode).toBe(200);
    expect(completed.json()).toEqual({ status: "verified" });
    expect((await b!.inject(poll)).statusCode).toBe(409);
    expect(f.exchanged).toHaveBeenCalledTimes(1);
    expect(f.createStackitSession).toHaveBeenCalledTimes(1);
  } finally {
    await Promise.all(f.apps.map((app) => app.close()));
  }
});

it("shares organization-proof callbacks and saved status across replicas and enforces session/tenant binding", async () => {
  const f = fixture();
  const [a, b, c] = f.apps;
  const headers = {
    origin,
    cookie: `__Host-lzc-session=${"s".repeat(43)}`,
    "x-lzc-csrf": session.csrfToken,
    "x-lzc-tenant": session.tenantId,
  };
  try {
    const start = await a!.inject({
      method: "POST",
      url: "/api/v1/stackit/identity/start",
      headers,
    });
    expect(start.statusCode).toBe(200);
    const query = f.bind(start.json().verificationUri);
    expect(
      (await b!.inject(`/auth/stackit/proof-callback?${query}`)).statusCode,
    ).toBe(400);
    expect(
      (
        await b!.inject({
          url: `/auth/stackit/proof-callback?${query}`,
          headers,
        })
      ).statusCode,
    ).toBe(302);
    expect(
      (
        await c!.inject({
          method: "POST",
          url: "/api/v1/stackit/identity/poll",
          headers,
        })
      ).json(),
    ).toMatchObject({ status: "verified" });
    expect(
      (await a!.inject({ url: "/api/v1/stackit/identity", headers })).json(),
    ).toMatchObject({ flow: { status: "verified" } });
    await a!.inject({
      method: "POST",
      url: "/api/v1/stackit/identity/poll",
      headers,
    });
    expect(f.identities.save).toHaveBeenCalledTimes(1);
    expect(f.exchanged).toHaveBeenCalledTimes(1);
    expect(
      (
        await b!.inject({
          method: "POST",
          url: "/api/v1/stackit/identity/cancel",
          headers,
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (
        await c!.inject({
          method: "POST",
          url: "/api/v1/stackit/identity/poll",
          headers,
        })
      ).statusCode,
    ).toBe(409);
  } finally {
    await Promise.all(f.apps.map((app) => app.close()));
  }
});

it("encrypts persisted secrets, exclusively leases across replicas, expires abandoned exchanges and binds ciphertext", async () => {
  const f = fixture();
  const a = new PendingFlows(origin, "login", f.factory, storage);
  const b = new PendingFlows(origin, "login", f.factory, storage);
  const key = randomBytes(32).toString("base64url");
  const hash = createHash("sha256").update(key).digest("hex");
  const flow = f.factory();
  const authorization = await flow.begin();
  const entry = {
    flow,
    busy: true,
    expiresAt: Date.parse(authorization.expiresAt),
  };
  try {
    expect(await a.set(key, entry)).toBe(true);
    await a.release(key, entry);
    const rows = await pool.query(
      "SELECT payload FROM lzc_auth.pending_stackit_flows WHERE key_hash=$1",
      [hash],
    );
    expect(
      rows.rows[0].payload.includes(Buffer.from(flow.snapshot().codeVerifier!)),
    ).toBe(false);
    const claimed = await Promise.all([a.get(key), b.get(key)]);
    expect(claimed.filter((value) => value && !value.busy)).toHaveLength(1);
    expect(claimed.filter((value) => value?.busy)).toHaveLength(1);
    // No takeover of an ambiguous exchange, even in a freshly created registry.
    expect(
      (await new PendingFlows(origin, "login", f.factory, storage).get(key))
        ?.busy,
    ).toBe(true);
    await pool.query(
      "UPDATE lzc_auth.pending_stackit_flows SET expires_at=now()-interval '1 second' WHERE key_hash=$1",
      [hash],
    );
    expect(await b.get(key)).toBeUndefined();
    const wrongClient = (organizationId?: string) =>
      new StackitDeviceFlow(fetch, Date.now, organizationId, {
        clientId: "different",
        redirectUri: `${origin}/auth/stackit/callback`,
        purpose: "login",
      });
    expect(() => wrongClient().restore(flow.snapshot())).toThrow(
      "flow_binding_mismatch",
    );
    expect(() =>
      crypto.decrypt(
        rows.rows[0].payload,
        "stackit-pending-flow",
        JSON.stringify([origin, "proof"]),
        hash,
      ),
    ).toThrow();
  } finally {
    await pool.query(
      "DELETE FROM lzc_auth.pending_stackit_flows WHERE key_hash=$1",
      [hash],
    );
    await Promise.all(f.apps.map((app) => app.close()));
  }
});
