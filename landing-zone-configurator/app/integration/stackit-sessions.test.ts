import { randomBytes, randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { newSessionToken } from "../apps/api/src/auth/github-flow.js";
import {
  type StackitRefreshGrant,
  stackitIssuer,
} from "../apps/api/src/auth/stackit-device.js";
import { StackitIdentities } from "../apps/api/src/auth/stackit-identities.js";
import { StackitOrganizationProofs } from "../apps/api/src/auth/stackit-organization-proofs.js";
import {
  StackitRefreshClient,
  StackitSessions,
} from "../apps/api/src/auth/stackit-sessions.js";
import { PostgresAuthStore } from "../apps/api/src/auth/store.js";
import { PostgresOrganisations } from "../apps/api/src/organisation/service.js";
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
// Two runtime connections are intentional: serialization must come from the
// PostgreSQL session-row lock, not an accidentally single-connection client pool.
const pool = new pg.Pool({
  ...connection,
  user: "configurator_app",
  password: "runtime-test-only",
  max: 3,
});
const store = new PostgresAuthStore(pool);
const crypto = new ArtifactCrypto(randomBytes(32).toString("base64"));
const clientId = "synthetic-session-renewal-client";
const provider = () =>
  new StackitRefreshClient(async () => {
    throw new Error("Unexpected external request in isolated database test");
  });

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

async function login(subject = randomUUID(), existingSessionId?: string) {
  const secret = newSessionToken();
  const expiresAt = new Date(Date.now() + 8 * 3600000 - 2000);
  const identity = {
    issuer: stackitIssuer,
    subject,
    email: `renewal-${subject}@example.test`,
    emailVerified: true as const,
    verificationMethod: "signed-id-token-and-userinfo" as const,
    tokenExpiresAt: new Date(Date.now() + 60000).toISOString(),
    organization: null,
  };
  const session = await store.createStackitSession({
    identity,
    id: randomUUID(),
    hash: secret.hash,
    csrfToken: randomBytes(32).toString("base64url"),
    expiresAt,
    ...(existingSessionId ? { existingSessionId } : {}),
  });
  const grant: StackitRefreshGrant = {
    clientId,
    refreshToken: `synthetic-refresh-${randomUUID()}`,
    nonce: randomUUID(),
    issuer: stackitIssuer,
    subject,
    email: identity.email,
    expiresAt: identity.tokenExpiresAt,
  };
  return { session, secret, expiresAt, identity, grant };
}
async function stored(id: string) {
  const result = await migration.query<{
    stackit_refresh_cipher: Buffer | null;
    expires_at: Date;
    tenant_id: string;
    active_tenant_id: string | null;
  }>(
    "SELECT stackit_refresh_cipher,expires_at,tenant_id,active_tenant_id FROM lzc_auth.sessions WHERE id=$1",
    [id],
  );
  const row = result.rows[0];
  if (!row) throw new Error("Missing synthetic session");
  return row;
}

it("encrypts refresh grants with immutable personal-tenant/user/session AAD and rejects ciphertext transplanted to another session", async () => {
  const first = await login();
  const fake = provider();
  const refresh = vi.spyOn(fake, "refresh");
  const sessions = new StackitSessions(pool, crypto, clientId, fake);
  await sessions.put(first.session, first.secret.hash, first.grant);
  const cipher = (await stored(first.session.id)).stackit_refresh_cipher;
  if (!cipher) throw new Error("Expected encrypted grant");
  expect(cipher.toString("utf8")).not.toContain(first.grant.refreshToken);
  const aad = [
    first.session.tenantId,
    first.session.userId,
    `stackit-refresh:${first.session.id}`,
  ] as const;
  expect(JSON.parse(crypto.decrypt(cipher, ...aad).toString("utf8"))).toEqual(
    first.grant,
  );
  for (const wrong of [
    [randomUUID(), aad[1], aad[2]],
    [aad[0], randomUUID(), aad[2]],
    [aad[0], aad[1], `stackit-refresh:${randomUUID()}`],
  ] as const)
    expect(() =>
      crypto.decrypt(cipher, wrong[0], wrong[1], wrong[2]),
    ).toThrow();
  const second = await login(first.identity.subject);
  await migration.query(
    "UPDATE lzc_auth.sessions SET stackit_refresh_cipher=$2 WHERE id=$1",
    [second.session.id, cipher],
  );
  await expect(
    sessions.refresh(second.session, second.secret.token),
  ).rejects.toThrow();
  expect(refresh).not.toHaveBeenCalled();
});

it("serializes concurrent rotation across real DB connections, preserves workspace and never extends app expiry or organization-owner proof", async () => {
  const first = await login();
  const organisations = new PostgresOrganisations(pool);
  const organizationId = randomUUID();
  const tenantId = await organisations.create(
    first.session,
    "Synthetic renewal workspace",
    organizationId,
  );
  await organisations.switch(first.session, tenantId);
  const active = await store.resolveSession(first.secret.token);
  if (!active) throw new Error("Missing scoped synthetic session");
  expect(active.tokenTenantId).toBe(first.session.tenantId);
  expect(active.tenantId).toBe(tenantId);
  await new StackitIdentities(pool).save(active, {
    ...first.identity,
    organization: {
      id: organizationId,
      name: "Synthetic organization",
      permissions: ["organization.read", "organization.write"],
      ownerPermissions: ["organization.write"],
    },
  });
  const before = (
    await migration.query(
      "SELECT i.verified_at,i.valid_until,a.verified_at AS organization_verified_at,a.valid_until AS organization_valid_until,a.owner_permissions FROM lzc.stackit_identities i JOIN lzc.stackit_organization_access a ON a.user_id=i.user_id WHERE i.user_id=$1 AND a.tenant_id=$2",
      [active.userId, tenantId],
    )
  ).rows[0];
  const fake = provider();
  let unblock = () => {};
  const gate = new Promise<void>((resolve) => {
    unblock = resolve;
  });
  let inFlight = 0,
    peak = 0;
  const next = {
    ...first.grant,
    refreshToken: `synthetic-rotated-${randomUUID()}`,
    expiresAt: new Date(Date.now() + 3600000).toISOString(),
  };
  const refresh = vi
    .spyOn(fake, "refresh")
    .mockImplementation(async (grant) => {
      expect(grant).toEqual(first.grant);
      inFlight++;
      peak = Math.max(peak, inFlight);
      await gate;
      inFlight--;
      return next;
    });
  const sessions = new StackitSessions(pool, crypto, clientId, fake);
  await sessions.put(active, first.secret.hash, first.grant);
  const one = sessions.refresh(active, first.secret.token);
  await vi.waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
  const two = sessions.refresh(active, first.secret.token);
  try {
    await vi.waitFor(async () => {
      const waiting = await admin.query(
        "SELECT count(*)::int AS count FROM pg_stat_activity WHERE datname=current_database() AND usename='configurator_app' AND wait_event_type='Lock' AND query LIKE '%lock_stackit_refresh%'",
      );
      expect(waiting.rows[0].count).toBeGreaterThanOrEqual(1);
    });
    expect(refresh).toHaveBeenCalledTimes(1);
  } finally {
    unblock();
  }
  expect(await Promise.all([one, two])).toEqual([
    { status: "active", verifiedUntil: next.expiresAt },
    { status: "active", verifiedUntil: next.expiresAt },
  ]);
  expect(peak).toBe(1);
  expect(refresh).toHaveBeenCalledTimes(1);
  const row = await stored(active.id);
  expect(row.expires_at).toEqual(first.expiresAt);
  expect(row.active_tenant_id).toBe(tenantId);
  if (!row.stackit_refresh_cipher) throw new Error("Missing rotated cipher");
  expect(
    JSON.parse(
      crypto
        .decrypt(
          row.stackit_refresh_cipher,
          first.session.tenantId,
          active.userId,
          `stackit-refresh:${active.id}`,
        )
        .toString("utf8"),
    ),
  ).toEqual(next);
  const after = (
    await migration.query(
      "SELECT i.verified_at,i.valid_until,a.verified_at AS organization_verified_at,a.valid_until AS organization_valid_until,a.owner_permissions FROM lzc.stackit_identities i JOIN lzc.stackit_organization_access a ON a.user_id=i.user_id WHERE i.user_id=$1 AND a.tenant_id=$2",
      [active.userId, tenantId],
    )
  ).rows[0];
  expect(after).toEqual({ ...before, valid_until: new Date(next.expiresAt) });
  const repeatedLogin = await login(first.identity.subject, active.id);
  const resolved = await store.resolveSession(repeatedLogin.secret.token);
  expect(resolved?.tenantId).toBe(tenantId);
  expect(resolved?.tokenTenantId).toBe(first.session.tenantId);
});

it("rejects missing or revoked identity and invalid identity bindings without renewing session or restoring proof", async () => {
  const first = await login();
  const fake = provider();
  const refresh = vi.spyOn(fake, "refresh");
  const sessions = new StackitSessions(pool, crypto, clientId, fake);
  await sessions.put(first.session, first.secret.hash, first.grant);
  await expect(
    pool.query("SELECT lzc_auth.complete_stackit_refresh($1,$2,$3,$4,$5,$6)", [
      first.secret.hash,
      (await stored(first.session.id)).stackit_refresh_cipher,
      stackitIssuer,
      "wrong-subject",
      first.identity.email,
      new Date(Date.now() + 3600000),
    ]),
  ).rejects.toMatchObject({ code: "42501" });
  await expect(
    pool.query("SELECT lzc_auth.complete_stackit_refresh($1,$2,$3,$4,$5,$6)", [
      first.secret.hash,
      (await stored(first.session.id)).stackit_refresh_cipher,
      stackitIssuer,
      first.identity.subject,
      first.identity.email,
      new Date(Date.now() + 25 * 3600000),
    ]),
  ).rejects.toMatchObject({ code: "23514" });
  await new StackitIdentities(pool).revoke(first.session);
  await expect(
    pool.query("SELECT lzc_auth.complete_stackit_refresh($1,$2,$3,$4,$5,$6)", [
      first.secret.hash,
      (await stored(first.session.id)).stackit_refresh_cipher,
      stackitIssuer,
      first.identity.subject,
      first.identity.email,
      new Date(Date.now() + 3600000),
    ]),
  ).rejects.toMatchObject({ code: "42501" });
  await expect(
    sessions.refresh(first.session, first.secret.token),
  ).resolves.toEqual({ status: "reauthentication-required" });
  expect((await stored(first.session.id)).expires_at).toEqual(first.expiresAt);
  const revoked = (
    await migration.query(
      "SELECT revoked_at FROM lzc.stackit_identities WHERE user_id=$1",
      [first.session.userId],
    )
  ).rows[0];
  expect(revoked.revoked_at).not.toBeNull();
  const secret = newSessionToken();
  const noIdentity = await store.createSession({
    githubId: 900000000 + Math.floor(Math.random() * 100000000),
    login: "synthetic-without-stackit",
    id: randomUUID(),
    hash: secret.hash,
    csrfToken: randomBytes(32).toString("base64url"),
    expiresAt: new Date(Date.now() + 3600000),
  });
  await expect(sessions.refresh(noIdentity, secret.token)).resolves.toEqual({
    status: "reauthentication-required",
  });
  expect(refresh).not.toHaveBeenCalled();
});

async function boundWorkspace() {
  const first = await login();
  const organisations = new PostgresOrganisations(pool);
  const organizationId = randomUUID();
  const tenantId = await organisations.create(
    first.session,
    "Automatic proof test",
    organizationId,
  );
  await organisations.switch(first.session, tenantId);
  const active = await store.resolveSession(first.secret.token);
  if (!active) throw new Error("Missing test session");
  const identities = new StackitIdentities(pool);
  await identities.save(active, {
    ...first.identity,
    organization: {
      id: organizationId,
      name: "Synthetic organization",
      permissions: ["organization.read", "organization.write"],
      ownerPermissions: ["organization.write"],
    },
  });
  await identities.bindOrganization(active, {
    confirmOrganizationBinding: true,
  });
  await migration.query(
    "DELETE FROM lzc.stackit_organization_access WHERE tenant_id=$1 AND user_id=$2",
    [tenantId, active.userId],
  );
  const next = {
    ...first.grant,
    accessToken: "synthetic-personal-access",
    expiresAt: new Date(Date.now() + 3600000).toISOString(),
  };
  const fake = provider();
  vi.spyOn(fake, "refresh").mockResolvedValue(next);
  return { ...first, active, organizationId, identities, fake, next };
}
function organizationApi(
  organizationId: string,
  email: string,
  mode: "owner" | "reader" | "denied" | "outage" = "owner",
) {
  return vi.fn<typeof fetch>(async (input, options) => {
    const url = new URL(String(input));
    expect(options?.headers).toEqual({
      Authorization: "Bearer synthetic-personal-access",
    });
    expect(options?.redirect).toBe("error");
    expect([
      "resource-manager.api.stackit.cloud",
      "authorization.api.stackit.cloud",
    ]).toContain(url.hostname);
    if (mode === "denied") return new Response("", { status: 403 });
    if (mode === "outage") return new Response("", { status: 503 });
    if (url.hostname === "resource-manager.api.stackit.cloud") {
      expect(url.pathname).toBe(`/v2/organizations/${organizationId}`);
      return Response.json({
        organizationId,
        containerId: "synthetic-org",
        name: "Synthetic organization",
        lifecycleState: "ACTIVE",
      });
    }
    if (url.pathname.endsWith("/permissions")) {
      expect(decodeURIComponent(url.pathname)).toBe(
        `/v2/users/${email}/permissions`,
      );
      expect(url.searchParams.get("resource")).toBe("synthetic-org");
      expect(url.searchParams.get("resourceType")).toBe("organization");
      return Response.json({
        items: [
          {
            resourceId: "synthetic-org",
            resourceType: "organization",
            permissions: (mode === "owner"
              ? ["organization.read", "organization.write"]
              : ["organization.read"]
            ).map((name) => ({ name })),
          },
        ],
      });
    }
    expect(url.pathname).toBe("/v2/organization/synthetic-org/roles");
    return Response.json({
      resourceId: "synthetic-org",
      resourceType: "organization",
      roles: [{ name: "owner", permissions: [{ name: "organization.write" }] }],
    });
  });
}
it("automatically renews bound-workspace authority with real API checks, runtime RLS and encrypted personal grants", async () => {
  const f = await boundWorkspace();
  const request = organizationApi(f.organizationId, f.identity.email);
  let now = Date.now();
  const proofs = new StackitOrganizationProofs(pool, request, () => now);
  const sessions = new StackitSessions(
    pool,
    crypto,
    clientId,
    f.fake,
    Date.now,
    proofs,
  );
  await sessions.put(f.active, f.secret.hash, f.grant);
  const result = await sessions.refresh(f.active, f.secret.token);
  expect(result.status).toBe("active");
  expect(result.organizationProof?.status).toBe("verified");
  expect(request).toHaveBeenCalledTimes(3);
  expect(JSON.stringify(result)).not.toContain("synthetic-personal-access");
  expect(JSON.stringify(result)).not.toContain("synthetic-refresh");
  const row = await stored(f.active.id);
  expect(row.expires_at).toEqual(f.expiresAt);
  expect(row.stackit_refresh_cipher?.toString("utf8")).not.toContain(
    "synthetic-personal-access",
  );
  const proof = (
    await migration.query(
      "SELECT * FROM lzc.stackit_organization_access WHERE tenant_id=$1 AND user_id=$2",
      [f.active.tenantId, f.active.userId],
    )
  ).rows[0];
  expect(proof.organization_id).toBe(f.organizationId);
  expect(proof.valid_until.getTime()).toBeLessThanOrEqual(Date.now() + 300000);
  expect(proof.valid_until.getTime()).toBeGreaterThan(Date.now() + 120000);
  expect(await sessions.refresh(f.active, f.secret.token)).toEqual(result);
  expect(request).toHaveBeenCalledTimes(3);
  now += 181000;
  expect((await proofs.ensure(f.active, f.next)).status).toBe("verified");
  expect(request).toHaveBeenCalledTimes(6);
  const history = await migration.query(
    "SELECT count(*)::int AS count FROM lzc.stackit_organization_authorizations WHERE tenant_id=$1 AND user_id=$2",
    [f.active.tenantId, f.active.userId],
  );
  expect(history.rows[0].count).toBe(3);
});
it.each(["reader", "denied", "outage"] as const)(
  "reports %s without granting authority or losing the app session",
  async (mode) => {
    const f = await boundWorkspace();
    const request = organizationApi(f.organizationId, f.identity.email, mode);
    const sessions = new StackitSessions(
      pool,
      crypto,
      clientId,
      f.fake,
      Date.now,
      new StackitOrganizationProofs(pool, request),
    );
    await sessions.put(f.active, f.secret.hash, f.grant);
    const result = await sessions.refresh(f.active, f.secret.token);
    expect(result.status).toBe("active");
    expect(result.organizationProof?.status).toBe(
      mode === "outage" ? "unavailable" : "denied",
    );
    expect(await store.resolveSession(f.secret.token)).not.toBeNull();
    const proofs = await migration.query(
      "SELECT valid_until FROM lzc.stackit_organization_access WHERE tenant_id=$1 AND user_id=$2",
      [f.active.tenantId, f.active.userId],
    );
    expect(proofs.rowCount).toBe(0);
  },
);
it("does not publish authority if the personal identity is revoked during the external check", async () => {
  const f = await boundWorkspace();
  const api = organizationApi(f.organizationId, f.identity.email);
  const request: typeof fetch = async (...args) => {
    const response = await api(...args);
    if (String(args[0]).endsWith("/roles")) await f.identities.revoke(f.active);
    return response;
  };
  const sessions = new StackitSessions(
    pool,
    crypto,
    clientId,
    f.fake,
    Date.now,
    new StackitOrganizationProofs(pool, request),
  );
  await sessions.put(f.active, f.secret.hash, f.grant);
  expect(
    (await sessions.refresh(f.active, f.secret.token)).organizationProof
      ?.status,
  ).toBe("reauthentication-required");
  expect(
    (
      await migration.query(
        "SELECT valid_until FROM lzc.stackit_organization_access WHERE tenant_id=$1 AND user_id=$2",
        [f.active.tenantId, f.active.userId],
      )
    ).rowCount,
  ).toBe(0);
});

it("does not query organization APIs for personal workspaces or reuse a different personal identity", async () => {
  const f = await boundWorkspace();
  const request = organizationApi(f.organizationId, f.identity.email);
  const proofs = new StackitOrganizationProofs(pool, request);
  expect(await proofs.ensure(f.session, f.next)).toEqual({
    status: "not-required",
  });
  expect(
    await proofs.ensure(f.active, { ...f.next, subject: randomUUID() }),
  ).toEqual({ status: "reauthentication-required" });
  expect(request).not.toHaveBeenCalled();
});
