import { randomBytes, randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  createGitHubLogin,
  newSessionToken,
} from "../apps/api/src/auth/github-flow.js";
import { PostgresAuthStore, type Session } from "../apps/api/src/auth/store.js";
import { PostgresCredentialProfiles } from "../apps/api/src/credentials/profiles.js";
import { withTenant } from "../apps/api/src/storage/database.js";
import { migrate } from "../apps/api/src/storage/migrations.js";

const address = process.env.LZC_TEST_DATABASE_URL;
if (!address)
  throw new Error("LZC_TEST_DATABASE_URL required for real database tests");
const url = new URL(address);
if (
  !["127.0.0.1", "localhost"].includes(url.hostname) ||
  url.pathname !== "/configurator_test"
)
  throw new Error("Refusing a non-local/non-test database");
const admin = new pg.Client({ connectionString: address });
const migrationConfig = {
  host: url.hostname,
  port: Number(url.port),
  database: "configurator_test",
  user: "configurator_migration",
  password: "migration-test-only",
};
const migration = new pg.Client(migrationConfig);
const pool = new pg.Pool({
  ...migrationConfig,
  user: "configurator_app",
  password: "runtime-test-only",
  max: 1,
});
const store = new PostgresAuthStore(pool);
const directory = fileURLToPath(new URL("../apps/api/db/", import.meta.url));
let alice: Session, bob: Session, aliceToken: string, aliceDocument: string;

beforeAll(async () => {
  await admin.connect();
  await admin.query(
    "DO $$ BEGIN IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='configurator_migration') THEN CREATE ROLE configurator_migration LOGIN PASSWORD 'migration-test-only'; END IF; IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='configurator_app') THEN CREATE ROLE configurator_app LOGIN PASSWORD 'runtime-test-only'; END IF; END $$",
  );
  await admin.query(
    "ALTER DATABASE configurator_test OWNER TO configurator_migration",
  );
  await migration.connect();
  await migrate(migration, directory);
  await migrate(migration, directory);
  await migration.query(
    "TRUNCATE lzc_auth.sessions, lzc_auth.login_requests, lzc.configurations, lzc.memberships, lzc.tenants, lzc_auth.users CASCADE",
  );
  async function session(id: number, login: string) {
    const token = newSessionToken();
    const identity = await store.createSession({
      githubId: id,
      login,
      id: randomUUID(),
      hash: token.hash,
      csrfToken: randomBytes(32).toString("base64url"),
      expiresAt: new Date(Date.now() + 3600000),
    });
    return { token: token.token, identity };
  }
  const a = await session(101, "alice");
  alice = a.identity;
  aliceToken = a.token;
  bob = (await session(102, "bob")).identity;
  aliceDocument = await withTenant(pool, alice, async (client) => {
    const result = await client.query<{ id: string }>(
      "INSERT INTO lzc.configurations(tenant_id, created_by, name, document) VALUES($1,$2,'Alice draft','{}') RETURNING id",
      [alice.tenantId, alice.userId],
    );
    return result.rows[0]?.id ?? "";
  });
}, 30000);
afterAll(async () => {
  await pool.end();
  await migration.end();
  await admin.end();
});

describe("real PostgreSQL session and tenant boundaries", () => {
  it("uses a runtime role without ownership, superuser or bypass privileges", async () => {
    const result = await pool.query(
      "SELECT rolsuper, rolbypassrls, rolcreaterole FROM pg_roles WHERE rolname=current_user",
    );
    expect(result.rows[0]).toEqual({
      rolsuper: false,
      rolbypassrls: false,
      rolcreaterole: false,
    });
    const tables = await pool.query(
      "SELECT relrowsecurity, relforcerowsecurity, pg_get_userbyid(relowner) AS owner FROM pg_class WHERE oid='lzc.configurations'::regclass",
    );
    expect(tables.rows[0]).toEqual({
      relrowsecurity: true,
      relforcerowsecurity: true,
      owner: "configurator_migration",
    });
    await expect(
      pool.query("SELECT * FROM lzc_auth.sessions"),
    ).rejects.toMatchObject({ code: "42501" });
    await expect(
      pool.query("UPDATE lzc.memberships SET role='admin'"),
    ).rejects.toMatchObject({ code: "42501" });
  });
  it("returns no rows without transaction context and never leaks pooled identity", async () => {
    expect((await pool.query("SELECT * FROM lzc.configurations")).rows).toEqual(
      [],
    );
    expect(
      (
        await withTenant(pool, alice, (c) =>
          c.query("SELECT id FROM lzc.configurations"),
        )
      ).rows,
    ).toEqual([{ id: aliceDocument }]);
    expect((await pool.query("SELECT * FROM lzc.configurations")).rows).toEqual(
      [],
    );
    await expect(
      withTenant(pool, alice, async () => {
        throw new Error("rollback-test");
      }),
    ).rejects.toThrow("rollback-test");
    expect((await pool.query("SELECT * FROM lzc.configurations")).rows).toEqual(
      [],
    );
  });
  it("denies another tenant even when the attacker knows every object ID", async () => {
    expect(
      (
        await withTenant(pool, bob, (c) =>
          c.query("SELECT * FROM lzc.configurations WHERE id=$1", [
            aliceDocument,
          ]),
        )
      ).rows,
    ).toEqual([]);
    expect(
      (
        await withTenant(
          pool,
          { userId: bob.userId, tenantId: alice.tenantId },
          (c) => c.query("SELECT * FROM lzc.configurations"),
        )
      ).rows,
    ).toEqual([]);
    await expect(
      withTenant(pool, bob, (c) =>
        c.query(
          "INSERT INTO lzc.configurations(tenant_id,created_by,name,document) VALUES($1,$2,'Attack','{}')",
          [alice.tenantId, bob.userId],
        ),
      ),
    ).rejects.toMatchObject({ code: "42501" });
    expect(
      (
        await withTenant(pool, bob, (c) =>
          c.query("UPDATE lzc.configurations SET name='Attack' WHERE id=$1", [
            aliceDocument,
          ]),
        )
      ).rowCount,
    ).toBe(0);
    await expect(
      withTenant(pool, alice, (c) =>
        c.query("UPDATE lzc.configurations SET tenant_id=$1 WHERE id=$2", [
          bob.tenantId,
          aliceDocument,
        ]),
      ),
    ).rejects.toMatchObject({ code: "42501" });
  });
  it("keeps memberships server-managed and readonly users unable to write", async () => {
    await migration.query(
      "INSERT INTO lzc.memberships(tenant_id,user_id,role) VALUES($1,$2,'viewer')",
      [alice.tenantId, bob.userId],
    );
    const viewer = { userId: bob.userId, tenantId: alice.tenantId };
    expect(
      (
        await withTenant(pool, viewer, (c) =>
          c.query("SELECT id FROM lzc.configurations"),
        )
      ).rows,
    ).toEqual([{ id: aliceDocument }]);
    expect(
      (
        await withTenant(pool, viewer, (c) =>
          c.query("UPDATE lzc.configurations SET name='Attack' WHERE id=$1", [
            aliceDocument,
          ]),
        )
      ).rowCount,
    ).toBe(0);
    await migration.query(
      "DELETE FROM lzc.memberships WHERE tenant_id=$1 AND user_id=$2",
      [alice.tenantId, bob.userId],
    );
  });
  it("consumes login state once, requires its browser binding and rejects expiry", async () => {
    const login = createGitHubLogin(
      "client",
      "https://configurator.example/auth/github/callback",
    );
    const state =
      new URL(login.authorizationUrl).searchParams.get("state") ?? "";
    await store.beginLogin(login.pending);
    expect(await store.consumeLogin(state, "x".repeat(43))).toBeNull();
    const [one, two] = await Promise.all([
      store.consumeLogin(state, login.cookieBinding),
      store.consumeLogin(state, login.cookieBinding),
    ]);
    expect([one, two].filter(Boolean)).toHaveLength(1);
    expect(await store.consumeLogin(state, login.cookieBinding)).toBeNull();
    await store.beginLogin({ ...login.pending, expiresAt: Date.now() - 1000 });
    expect(await store.consumeLogin(state, login.cookieBinding)).toBeNull();
  });
  it("resolves only opaque valid sessions, rejects revocation and expired sessions", async () => {
    expect((await store.resolveSession(aliceToken))?.userId).toBe(alice.userId);
    expect(
      await store.resolveSession(randomBytes(32).toString("base64url")),
    ).toBeNull();
    await migration.query(
      "UPDATE lzc_auth.sessions SET expires_at=now()-interval '1 second' WHERE id=$1",
      [alice.id],
    );
    expect(await store.resolveSession(aliceToken)).toBeNull();
    await store.deleteSession(aliceToken);
    expect(await store.resolveSession(aliceToken)).toBeNull();
  });
});

describe("personal credential metadata with real PostgreSQL RLS", () => {
  const key = {
    credentials: {
      kid: "test-key-id",
      iss: "test@sa.stackit.cloud",
      sub: "11111111-2222-4333-8444-555555555555",
      aud: "https://service-account.api.stackit.cloud" as const,
      privateKey: "INTEGRATION-SECRET-ONLY-IN-VAULT-MOCK",
    },
  };
  it("isolates owners even within the same tenant and never stores key material in PostgreSQL", async () => {
    const secrets = {
      put: vi.fn(async () => {}),
      remove: vi.fn(async () => {}),
    };
    const profiles = new PostgresCredentialProfiles(pool, secrets);
    await profiles.create(alice, "Alice deployment", key);
    const [profile] = await profiles.list(alice);
    expect(profile?.state).toBe("stored");
    if (!profile) throw new Error("Missing profile");
    expect(await profiles.list(bob)).toEqual([]);
    await migration.query(
      "INSERT INTO lzc.memberships(tenant_id,user_id,role) VALUES($1,$2,'admin')",
      [alice.tenantId, bob.userId],
    );
    const otherAdmin = { ...bob, tenantId: alice.tenantId };
    expect(await profiles.list(otherAdmin)).toEqual([]);
    await expect(profiles.remove(otherAdmin, profile.id)).rejects.toMatchObject(
      { status: 404 },
    );
    expect(secrets.remove).not.toHaveBeenCalled();
    expect(
      (await pool.query("SELECT * FROM lzc.credential_profiles")).rows,
    ).toEqual([]);
    const rows = await withTenant(pool, alice, (c) =>
      c.query("SELECT * FROM lzc.credential_profiles"),
    );
    expect(JSON.stringify(rows.rows)).not.toContain(key.credentials.privateKey);
    await expect(
      withTenant(pool, alice, (c) =>
        c.query(
          "UPDATE lzc.credential_profiles SET owner_user_id=$1 WHERE id=$2",
          [bob.userId, profile.id],
        ),
      ),
    ).rejects.toMatchObject({ code: "42501" });
    await profiles.remove(alice, profile.id);
    expect(secrets.remove).toHaveBeenCalledExactlyOnceWith(alice, profile.id);
    expect(await profiles.list(alice)).toEqual([]);
    await migration.query(
      "DELETE FROM lzc.memberships WHERE tenant_id=$1 AND user_id=$2",
      [alice.tenantId, bob.userId],
    );
  });
  it("retains recovery metadata after ambiguous writes/deletes and supports cleanup retries", async () => {
    const secrets = {
      put: vi.fn(async () => {
        throw new Error("ambiguous write");
      }),
      remove: vi.fn(async () => {}),
    };
    const profiles = new PostgresCredentialProfiles(pool, secrets);
    await expect(profiles.create(alice, "Incomplete", key)).rejects.toThrow(
      "ambiguous write",
    );
    const [pending] = await profiles.list(alice);
    expect(pending?.state).toBe("pending");
    if (!pending) throw new Error("Missing pending profile");
    secrets.remove.mockRejectedValueOnce(new Error("ambiguous delete"));
    await expect(profiles.remove(alice, pending.id)).rejects.toThrow(
      "ambiguous delete",
    );
    expect(await profiles.list(alice)).toHaveLength(1);
    await profiles.remove(alice, pending.id);
    expect(await profiles.list(alice)).toEqual([]);
  });
  it("denies create to viewers before touching the secret store", async () => {
    const secrets = { put: vi.fn(), remove: vi.fn() };
    const profiles = new PostgresCredentialProfiles(pool, secrets);
    await migration.query(
      "INSERT INTO lzc.memberships(tenant_id,user_id,role) VALUES($1,$2,'viewer')",
      [alice.tenantId, bob.userId],
    );
    const viewer = { ...bob, tenantId: alice.tenantId };
    await expect(
      profiles.create(viewer, "Forbidden", key),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      withTenant(pool, viewer, (c) =>
        c.query(
          "INSERT INTO lzc.credential_profiles(id,tenant_id,owner_user_id,name,service_account,key_id) VALUES($1,$2,$3,'Forbidden','mail','key')",
          [randomUUID(), alice.tenantId, bob.userId],
        ),
      ),
    ).rejects.toMatchObject({ code: "42501" });
    expect(secrets.put).not.toHaveBeenCalled();
    await migration.query(
      "DELETE FROM lzc.memberships WHERE tenant_id=$1 AND user_id=$2",
      [alice.tenantId, bob.userId],
    );
  });
});
