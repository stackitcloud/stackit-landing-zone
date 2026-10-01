import { randomBytes, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import {
  catalogue,
  configurationValues,
  createDraft,
  editCommonInput,
  migrateCommonConfiguration,
  recordValues,
  savedDraft,
  serializeTfvars,
  type Template,
} from "@lzc/domain";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  createGitHubLogin,
  newSessionToken,
} from "../apps/api/src/auth/github-flow.js";
import { PostgresAuthStore, type Session } from "../apps/api/src/auth/store.js";
import { PostgresCredentialProfiles } from "../apps/api/src/credentials/profiles.js";
import { Preparations } from "../apps/api/src/deployments/preparations.js";
import { Invitations } from "../apps/api/src/organisation/invitations.js";
import { PostgresOrganisations } from "../apps/api/src/organisation/service.js";
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
const invitations = new Invitations(pool);
async function inviteMember(
  s: Session,
  target: Session,
  roles: string[],
  manage: boolean,
) {
  const invite = await invitations.create(s, roles, manage);
  await invitations.use(target, invite.token, true);
  await new PostgresOrganisations(pool).switch(target, target.tenantId);
}
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
      get: vi.fn(),
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
      get: vi.fn(),
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
    const secrets = { get: vi.fn(), put: vi.fn(), remove: vi.fn() };
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

describe("credential checks and immutable deployment preparations", () => {
  it("persists check failures, denies foreign access before reading keys and invalidates preparations when credentials are deleted", async () => {
    const key = {
      credentials: {
        kid: "deployment-key",
        iss: "test@sa.stackit.cloud",
        sub: randomUUID(),
        aud: "https://accounts.stackit.cloud" as const,
        privateKey: "MOCK-SECRET-NEVER-IN-POSTGRES",
      },
    };
    const organizationId = randomUUID();
    const check = {
      status: "passed" as const,
      code: "organization_readable" as const,
      organizationId,
      organizationName: "Test organization",
      checkedAt: new Date().toISOString(),
    };
    const secrets = {
      get: vi.fn(async () => ({ key, version: 1 })),
      put: vi.fn(async () => {}),
      remove: vi.fn(async () => {}),
    };
    const cloud = { check: vi.fn(async () => check) };
    // The real client is independently tested for signing, endpoints and response handling.
    const profiles = new PostgresCredentialProfiles(pool, secrets, cloud);
    await profiles.create(alice, "Checked profile", key);
    const [profile] = await profiles.list(alice);
    if (!profile) throw new Error("Missing profile");
    await expect(
      profiles.check(bob, profile.id, organizationId),
    ).rejects.toMatchObject({ status: 404 });
    expect(secrets.get).not.toHaveBeenCalled();
    expect(await profiles.check(alice, profile.id, organizationId)).toEqual(
      check,
    );
    expect((await profiles.list(alice))[0]?.lastCheck).toEqual(check);
    secrets.get.mockRejectedValueOnce(new Error("Secret unavailable"));
    expect(
      await profiles.check(alice, profile.id, organizationId),
    ).toMatchObject({ status: "failed", code: "secret_unavailable" });
    expect((await profiles.list(alice))[0]?.lastCheck?.status).toBe("failed");
    const template = catalogue.templates.find(
      (item) => item.id === "standalone",
    ) as Template;
    const draft = createDraft(template);
    draft.organization = organizationId;
    draft.owner = "owner@stackit.cloud";
    for (const project of draft.projects) project.owner = draft.owner;
    for (const sandbox of draft.sandboxes) sandbox.owner = draft.owner;
    const document = savedDraft(randomUUID(), draft);
    const head = "a".repeat(40);
    const repositories = {
      prepareSnapshot: vi.fn(async () => ({
        document,
        head,
        tfvars: serializeTfvars(configurationValues(document)),
      })),
    };
    const preparations = new Preparations(pool, repositories, profiles);
    const input = {
      target: { id: 123, owner: "alice", name: "accelerator" },
      head,
      configurationId: document.id,
      credentialId: profile.id,
    };
    await expect(
      preparations.create(bob, "ghu_bob", input),
    ).rejects.toMatchObject({ status: 404 });
    expect(repositories.prepareSnapshot).not.toHaveBeenCalled();
    const result = await preparations.create(alice, "ghu_alice", input);
    const [record] = await preparations.list(alice);
    expect(record.id).toBe(result.id);
    expect(record.manifest.source.commit).toBe(head);
    expect(record.manifest.credential.secretVersion).toBe(1);
    expect(JSON.stringify(record)).not.toContain(key.credentials.privateKey);
    expect(JSON.stringify(record)).not.toContain("ghu_alice");
    expect(await preparations.list(bob)).toEqual([]);
    await expect(preparations.remove(bob, result.id)).rejects.toMatchObject({
      status: 404,
    });
    await migration.query(
      "INSERT INTO lzc.memberships(tenant_id,user_id,role) VALUES($1,$2,'admin')",
      [alice.tenantId, bob.userId],
    );
    const otherAdmin = { ...bob, tenantId: alice.tenantId };
    expect(await preparations.list(otherAdmin)).toEqual([]);
    await expect(
      withTenant(pool, otherAdmin, (c) =>
        c.query(
          "INSERT INTO lzc.deployment_preparations(id,tenant_id,owner_user_id,credential_id,name,manifest) VALUES($1,$2,$3,$4,'Attack','{}')",
          [randomUUID(), alice.tenantId, bob.userId, profile.id],
        ),
      ),
    ).rejects.toMatchObject({ code: "42501" });
    await expect(
      withTenant(pool, alice, (c) =>
        c.query(
          "UPDATE lzc.deployment_preparations SET manifest='{}' WHERE id=$1",
          [result.id],
        ),
      ),
    ).rejects.toMatchObject({ code: "42501" });
    await profiles.remove(alice, profile.id);
    expect((await preparations.list(alice))[0]?.credentialId).toBeNull();
    await preparations.remove(alice, result.id);
    expect(await preparations.list(alice)).toEqual([]);
    await migration.query(
      "DELETE FROM lzc.memberships WHERE tenant_id=$1 AND user_id=$2",
      [alice.tenantId, bob.userId],
    );
  });
});

it.each([false, true])(
  "isolates queued plans, consumes input once, rejects replay and expires abandoned runners (common=%s)",
  async (common) => {
    const { Plans } = await import("../apps/api/src/plans/service.js");
    const { tokenHash } = await import("../apps/api/src/auth/store.js");
    const template = catalogue.templates.find(
      (t) => t.id === "standalone",
    ) as Template;
    const draft = createDraft(template);
    draft.organization = randomUUID();
    draft.owner = "owner@stackit.cloud";
    for (const p of draft.projects) p.owner = draft.owner;
    for (const s of draft.sandboxes) s.owner = draft.owner;
    const legacy = savedDraft(randomUUID(), draft);
    const document = common ? migrateCommonConfiguration(legacy) : legacy,
      profileId = randomUUID(),
      preparationId = randomUUID();
    const tfvars = serializeTfvars(recordValues(document));
    const check = {
      status: "passed" as const,
      code: "organization_readable" as const,
      organizationId: draft.organization,
      organizationName: "Test org",
      checkedAt: new Date().toISOString(),
    };
    const profiles = {
      verifyForPreparation: vi.fn(async () => ({
        check,
        version: 1,
        keyId: "test-kid",
      })),
    };
    const key = {
      credentials: {
        kid: "test-kid",
        iss: "test@sa.stackit.cloud",
        privateKey: "secret-not-in-db",
      },
    };
    const secrets = {
      get: vi.fn(async () => ({ key, version: 1 })),
      put: vi.fn(),
      remove: vi.fn(),
    };
    const { preparationManifest } = await import(
      "../apps/api/src/deployments/preparations.js"
    );
    const manifest = preparationManifest(
      {
        target: { id: 123, owner: "alice", name: "lza" },
        head: "a".repeat(40),
        configurationId: document.id,
        credentialId: profileId,
      },
      { document, head: "a".repeat(40), tfvars },
      { check, version: 1, keyId: "test-kid" },
    );
    await migration.query(
      "INSERT INTO lzc.credential_profiles(id,tenant_id,owner_user_id,name,service_account,key_id,state) VALUES($1,$2,$3,'Runner test','test@sa.stackit.cloud','test-kid','stored')",
      [profileId, alice.tenantId, alice.userId],
    );
    await migration.query(
      "INSERT INTO lzc.deployment_preparations(id,tenant_id,owner_user_id,credential_id,name,manifest) VALUES($1,$2,$3,$4,'Runner test',$5)",
      [
        preparationId,
        alice.tenantId,
        alice.userId,
        profileId,
        JSON.stringify(manifest),
      ],
    );
    let ticket = "";
    const runner = {
      start: vi.fn(
        async (
          _id: string,
          t: string,
          _origin: string,
          record: (id: string, source: string) => Promise<void>,
        ) => {
          ticket = t;
          await record(randomUUID(), randomUUID());
        },
      ),
      remove: vi.fn(async () => {}),
    };
    const repositories = {
      prepareSnapshot: vi.fn(async () => ({
        document,
        head: "a".repeat(40),
        tfvars,
      })),
    };
    // Secret mock tests ownership/version; production key parsing is tested separately.
    const plans = new Plans(
      pool,
      profiles,
      secrets as unknown as ConstructorParameters<typeof Plans>[2],
      repositories,
      runner,
      "https://configurator.example",
    );
    await expect(
      plans.start(bob, "ghu_bob", preparationId),
    ).rejects.toMatchObject({ status: 404 });
    expect(repositories.prepareSnapshot).not.toHaveBeenCalled();
    const run = await plans.start(alice, "ghu_alice", preparationId);
    expect(await plans.list(bob)).toEqual([]);
    await expect(plans.cancel(bob, run.id)).rejects.toMatchObject({
      status: 404,
    });
    await expect(
      plans.start(alice, "ghu_alice", preparationId),
    ).rejects.toMatchObject({ code: "plan_already_running" });
    const records = await plans.list(alice);
    expect(JSON.stringify(records)).not.toContain(ticket);
    expect(JSON.stringify(records)).not.toContain("secret-not-in-db");
    await expect(plans.input("x".repeat(43))).rejects.toMatchObject({
      status: 401,
    });
    const input = await plans.input(ticket);
    expect(input.id).toBe(run.id);
    expect(input.key).toEqual(key);
    expect(input.tfvars).toBe(tfvars);
    await expect(plans.input(ticket)).rejects.toMatchObject({ status: 401 });
    await expect(plans.stage(ticket, "planning")).rejects.toMatchObject({
      code: "invalid_runner_transition",
    });
    await plans.stage(ticket, "validating");
    await plans.stage(ticket, "planning");
    await expect(
      plans.result(ticket, { status: "applying" }),
    ).rejects.toThrow();
    await plans.result(ticket, { status: "failed", errorCode: "plan_failed" });
    await expect(
      plans.result(ticket, { status: "failed", errorCode: "plan_failed" }),
    ).rejects.toMatchObject({ status: 401 });
    await migration.query(
      "UPDATE lzc.plan_runs SET finished_at=now()-interval '1 minute' WHERE id=$1",
      [run.id],
    );
    await plans.maintain();
    expect(runner.remove).toHaveBeenCalledWith(run.id, expect.any(String));
    // Expiry prevents another input delivery and releases the user's single active slot.
    const second = await plans.start(alice, "ghu_alice", preparationId);
    await migration.query(
      "UPDATE lzc.plan_runs SET expires_at=now()-interval '1 second' WHERE id=$1",
      [second.id],
    );
    await plans.maintain();
    expect((await plans.list(alice))[0]?.errorCode).toBe("timed_out");
    if (common) {
      const third = await plans.start(alice, "ghu_alice", preparationId);
      const poisoned = {
        ...manifest,
        configuration: editCommonInput(
          migrateCommonConfiguration(legacy),
          "devops",
          { git_flavor: "git-10" },
        ),
      };
      await migration.query(
        "UPDATE lzc.deployment_preparations SET manifest=$2 WHERE id=$1",
        [preparationId, JSON.stringify(poisoned)],
      );
      const reads = secrets.get.mock.calls.length;
      await expect(plans.input(ticket)).rejects.toMatchObject({
        code: "configuration_execution_not_supported",
      });
      expect(secrets.get.mock.calls.length).toBe(reads);
      await expect(
        plans.start(alice, "ghu_alice", preparationId),
      ).rejects.toMatchObject({
        code: "configuration_execution_not_supported",
      });
      await plans.cancel(alice, third.id);
    }

    expect(
      (
        await pool.query("SELECT * FROM lzc_auth.resolve_plan_ticket($1)", [
          tokenHash(ticket),
        ])
      ).rows,
    ).toEqual([]);
  },
  30000,
);

describe("independent external identities", () => {
  it("backfills existing identities without replacing user IDs", async () => {
    // Replay the additive migration transactionally against the pre-migration shape.
    await migration.query("BEGIN");
    try {
      await migration.query("DROP TABLE lzc_auth.external_identities");
      await migration.query(
        "DELETE FROM lzc_auth.users WHERE github_id IS NULL",
      );
      const sql = await readFile(
        `${directory}/006_external_identities.sql`,
        "utf8",
      );
      await migration.query(sql);
      const rows = await migration.query(
        "SELECT user_id FROM lzc_auth.external_identities WHERE provider='github' AND subject='101'",
      );
      expect(rows.rows).toEqual([{ user_id: alice.userId }]);
    } finally {
      await migration.query("ROLLBACK");
    }
  });

  it("keeps user and tenant stable across a GitHub rename", async () => {
    const session = await store.createSession({
      githubId: 101,
      login: "alice-renamed",
      id: randomUUID(),
      hash: newSessionToken().hash,
      csrfToken: randomBytes(32).toString("base64url"),
      expiresAt: new Date(Date.now() + 3600000),
    });
    expect(session.userId).toBe(alice.userId);
    expect(session.tenantId).toBe(alice.tenantId);
    const result = await migration.query(
      "SELECT user_id FROM lzc_auth.external_identities WHERE provider='github' AND subject='101'",
    );
    expect(result.rows).toEqual([{ user_id: alice.userId }]);
  });
  it("denies runtime identity reads and reassignment", async () => {
    await expect(
      pool.query("SELECT * FROM lzc_auth.external_identities"),
    ).rejects.toThrow(/permission denied/);
    await expect(
      pool.query("UPDATE lzc_auth.external_identities SET user_id=$1", [
        bob.userId,
      ]),
    ).rejects.toThrow(/permission denied/);
  });
  it("allows GitHub-independent users and scopes subjects to their issuer", async () => {
    const user = await migration.query(
      "INSERT INTO lzc_auth.users DEFAULT VALUES RETURNING id",
    );
    for (const issuer of [
      "https://issuer-a.example",
      "https://issuer-b.example",
    ]) {
      await migration.query(
        "INSERT INTO lzc_auth.external_identities(provider,issuer,subject,user_id) VALUES('oidc',$1,'same-subject',$2)",
        [issuer, user.rows[0].id],
      );
    }
    await expect(
      migration.query(
        "INSERT INTO lzc_auth.external_identities(provider,issuer,subject,user_id) VALUES('oidc','https://issuer-a.example','same-subject',$1)",
        [bob.userId],
      ),
    ).rejects.toThrow(/duplicate key/);
  });
});

describe("organisation draft workspaces", () => {
  let alice: Session, bob: Session, aliceToken: string;
  beforeAll(async () => {
    async function create(githubId: number) {
      const token = newSessionToken();
      const session = await store.createSession({
        githubId,
        login: `org-user-${githubId}`,
        id: randomUUID(),
        hash: token.hash,
        csrfToken: randomBytes(32).toString("base64url"),
        expiresAt: new Date(Date.now() + 3600000),
      });
      return { session, token: token.token };
    }
    const first = await create(901);
    alice = first.session;
    aliceToken = first.token;
    bob = (await create(902)).session;
  });
  const organisations = new PostgresOrganisations(pool);
  it("creates draft membership, preserves personal token binding and revokes membership", async () => {
    expect(
      (await organisations.overview(alice)).tenants.find(
        (t) => t.id === alice.tenantId,
      )?.roles,
    ).toEqual([]);
    const id = await organisations.create(alice, "Platform team", randomUUID());
    const overview = await organisations.overview(alice);
    expect(overview.activeTenantId).toBe(alice.tenantId);
    expect(overview.tenants.find((t) => t.id === id)).toMatchObject({
      kind: "organisation",
      organizationVerified: false,
      roles: ["platform-engineer"],
      manageMembers: true,
    });
    await expect(organisations.switch(bob, id)).rejects.toMatchObject({
      code: "42501",
    });
    await organisations.switch(alice, id);
    await expect(
      organisations.editMember(alice, bob.userId, ["application-owner"], false),
    ).rejects.toMatchObject({ code: "40001" });
    await expect(
      organisations.editMember(
        { ...alice, tenantId: id },
        alice.userId,
        ["platform-engineer", "application-owner"],
        true,
      ),
    ).rejects.toMatchObject({ code: "42501" });
    expect(await store.resolveSession(aliceToken)).toMatchObject({
      tenantId: id,
      tokenTenantId: alice.tenantId,
      tenantKind: "organisation",
      productRoles: ["platform-engineer"],
    });
    await expect(
      organisations.editMember(
        { ...alice, tenantId: id },
        alice.userId,
        ["application-owner"],
        false,
      ),
    ).rejects.toMatchObject({ code: "23514" });
    await inviteMember(
      { ...alice, tenantId: id },
      bob,
      ["application-owner"],
      false,
    );
    await organisations.switch(bob, id);
    expect((await organisations.overview(bob)).members).toEqual([]);
    await expect(
      organisations.editMember(
        { ...bob, tenantId: id },
        bob.userId,
        ["platform-engineer"],
        true,
      ),
    ).rejects.toMatchObject({ code: "42501" });
    await expect(
      withTenant(pool, { userId: bob.userId, tenantId: id }, (client) =>
        client.query(
          "INSERT INTO lzc.configurations(tenant_id,created_by,name,document) VALUES($1,$2,'forbidden','{}')",
          [id, bob.userId],
        ),
      ),
    ).rejects.toMatchObject({ code: "42501" });
    await organisations.editMember(
      { ...alice, tenantId: id },
      bob.userId,
      [],
      false,
      true,
    );
    expect((await organisations.overview(bob)).activeTenantId).toBe(
      bob.tenantId,
    );
    await expect(organisations.switch(bob, id)).rejects.toMatchObject({
      code: "42501",
    });
    await expect(
      pool.query("SELECT * FROM lzc_auth.membership_audit"),
    ).rejects.toMatchObject({ code: "42501" });
    const audit = await migration.query(
      "SELECT action FROM lzc_auth.membership_audit WHERE tenant_id=$1 ORDER BY created_at",
      [id],
    );
    expect(audit.rows.map((r) => r.action)).toEqual([
      "organisation_created",
      "invitation_created",
      "invitation_accepted",
      "member_removed",
    ]);
    await organisations.switch(alice, alice.tenantId);
  });
  it("serializes competing last-manager changes", async () => {
    const id = await organisations.create(
      alice,
      "Concurrent managers",
      randomUUID(),
    );
    await organisations.switch(alice, id);
    await inviteMember(
      { ...alice, tenantId: id },
      bob,
      ["platform-engineer"],
      true,
    );
    await organisations.switch(bob, id);
    const concurrent = new pg.Pool({
      ...migrationConfig,
      user: "configurator_app",
      password: "runtime-test-only",
      max: 2,
    });
    try {
      const service = new PostgresOrganisations(concurrent);
      const results = await Promise.allSettled([
        service.editMember(
          { ...alice, tenantId: id },
          alice.userId,
          ["platform-engineer"],
          false,
        ),
        service.editMember(
          { ...bob, tenantId: id },
          bob.userId,
          ["platform-engineer"],
          false,
        ),
      ]);
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
      const remaining = await migration.query(
        "SELECT user_id FROM lzc.memberships WHERE tenant_id=$1 AND manage_members",
        [id],
      );
      expect(remaining.rowCount).toBe(1);
    } finally {
      await concurrent.end();
      await organisations.switch(alice, alice.tenantId);
      await organisations.switch(bob, bob.tenantId);
    }
  });
  it("archives only the creator's empty unverified draft and preserves its audit", async () => {
    const organizationId = randomUUID();
    const id = await organisations.create(
      alice,
      "Accidental duplicate",
      organizationId,
    );
    await expect(
      organisations.create(alice, " accidental duplicate ", organizationId),
    ).rejects.toMatchObject({ code: "23505" });
    const unrelated = await organisations.create(
      bob,
      "Accidental duplicate",
      organizationId,
    );
    await organisations.archive(bob, unrelated);
    await expect(organisations.archive(bob, id)).rejects.toMatchObject({
      code: "42501",
    });
    await expect(
      organisations.archive(alice, alice.tenantId),
    ).rejects.toMatchObject({ code: "42501" });
    await organisations.switch(alice, id);
    await inviteMember(
      { ...alice, tenantId: id },
      bob,
      ["application-owner"],
      false,
    );
    await expect(organisations.archive(alice, id)).rejects.toMatchObject({
      code: "55000",
    });
    await organisations.editMember(
      { ...alice, tenantId: id },
      bob.userId,
      [],
      false,
      true,
    );
    await migration.query(
      "UPDATE lzc.tenants SET organization_verified=true WHERE id=$1",
      [id],
    );
    await expect(organisations.archive(alice, id)).rejects.toMatchObject({
      code: "55000",
    });
    await migration.query(
      "UPDATE lzc.tenants SET organization_verified=false WHERE id=$1",
      [id],
    );
    await migration.query(
      "INSERT INTO lzc.configurations(tenant_id,created_by,name,document) VALUES($1,$2,'keep','{}')",
      [id, alice.userId],
    );
    await expect(organisations.archive(alice, id)).rejects.toMatchObject({
      code: "55000",
    });
    await migration.query("DELETE FROM lzc.configurations WHERE tenant_id=$1", [
      id,
    ]);
    await organisations.archive(alice, id);
    const overview = await organisations.overview(alice);
    expect(overview.activeTenantId).toBe(alice.tenantId);
    expect(overview.tenants.some((t) => t.id === id)).toBe(false);
    await expect(organisations.switch(alice, id)).rejects.toMatchObject({
      code: "42501",
    });
    await expect(organisations.archive(alice, id)).rejects.toMatchObject({
      code: "42501",
    });
    expect(
      (
        await migration.query(
          "SELECT 1 FROM lzc_auth.membership_audit WHERE tenant_id=$1 AND action='organisation_archived'",
          [id],
        )
      ).rowCount,
    ).toBe(1);
  });
});

describe("single-use membership invitations", () => {
  const organisations = new PostgresOrganisations(pool);
  let alice: Session, bob: Session;
  beforeAll(async () => {
    const create = (githubId: number) =>
      store.createSession({
        githubId,
        login: `invite-${githubId}`,
        id: randomUUID(),
        hash: newSessionToken().hash,
        csrfToken: randomBytes(32).toString("base64url"),
        expiresAt: new Date(Date.now() + 3600000),
      });
    alice = await create(1001);
    bob = await create(1002);
  });

  it("requires consent, hashes the token and accepts it exactly once", async () => {
    const tenantId = await organisations.create(
      alice,
      "Invited team",
      randomUUID(),
    );
    await organisations.switch(alice, tenantId);
    const manager = { ...alice, tenantId };
    await expect(
      organisations.editMember(
        manager,
        bob.userId,
        ["application-owner"],
        false,
      ),
    ).rejects.toMatchObject({ code: "23503" });
    const invite = await invitations.create(
      manager,
      ["application-owner"],
      false,
    );
    const row = (
      await migration.query(
        "SELECT token_hash FROM lzc_auth.invitations WHERE id=$1",
        [invite.id],
      )
    ).rows[0];
    expect(row.token_hash).not.toBe(invite.token);
    expect(JSON.stringify(await invitations.list(manager))).not.toContain(
      invite.token,
    );
    expect(await invitations.use(bob, invite.token, false)).toMatchObject({
      tenantId,
      roles: ["application-owner"],
    });
    const otherPool = new pg.Pool({
      ...migrationConfig,
      user: "configurator_app",
      password: "runtime-test-only",
      max: 2,
    });
    try {
      const service = new Invitations(otherPool);
      const outcomes = await Promise.allSettled([
        service.use(bob, invite.token, true),
        service.use(bob, invite.token, true),
      ]);
      expect(outcomes.filter((v) => v.status === "fulfilled")).toHaveLength(1);
      expect(outcomes.filter((v) => v.status === "rejected")).toHaveLength(1);
    } finally {
      await otherPool.end();
    }
    const escalation = await invitations.create(
      manager,
      ["platform-engineer"],
      true,
    );
    await expect(
      invitations.use(bob, escalation.token, true),
    ).rejects.toMatchObject({ code: "23505" });
    await expect(
      pool.query("SELECT * FROM lzc_auth.invitations"),
    ).rejects.toMatchObject({ code: "42501" });
    await organisations.switch(alice, alice.tenantId);
    await organisations.switch(bob, bob.tenantId);
  });
  it("rejects expired, revoked, archived and unauthorized invitations", async () => {
    const tenantId = await organisations.create(
      alice,
      "Revoked invitations",
      randomUUID(),
    );
    await organisations.switch(alice, tenantId);
    const manager = { ...alice, tenantId };
    const revoked = await invitations.create(
      manager,
      ["application-owner"],
      false,
    );
    await expect(
      invitations.revoke({ ...bob, tenantId }, revoked.id),
    ).rejects.toBeDefined();
    await invitations.revoke(manager, revoked.id);
    await expect(
      invitations.use(bob, revoked.token, true),
    ).rejects.toMatchObject({ code: "22023" });
    const expired = await invitations.create(
      manager,
      ["application-owner"],
      false,
    );
    await migration.query(
      "UPDATE lzc_auth.invitations SET expires_at=now()-interval '1 second' WHERE id=$1",
      [expired.id],
    );
    await expect(
      invitations.use(bob, expired.token, true),
    ).rejects.toMatchObject({ code: "22023" });
    const archived = await invitations.create(
      manager,
      ["application-owner"],
      false,
    );
    await organisations.archive(manager, tenantId);
    await expect(
      invitations.use(bob, archived.token, true),
    ).rejects.toMatchObject({ code: "22023" });
    await expect(
      invitations.use(bob, "x".repeat(43), false),
    ).rejects.toMatchObject({ code: "22023" });
  });
  it("invalidates invitations when the issuer loses membership management", async () => {
    const tenantId = await organisations.create(
      alice,
      "Issuer revocation",
      randomUUID(),
    );
    await organisations.switch(alice, tenantId);
    const manager = { ...alice, tenantId };
    const invite = await invitations.create(
      manager,
      ["application-owner"],
      false,
    );
    await migration.query(
      "UPDATE lzc.memberships SET manage_members=false WHERE tenant_id=$1 AND user_id=$2",
      [tenantId, alice.userId],
    );
    await expect(
      invitations.use(bob, invite.token, true),
    ).rejects.toMatchObject({ code: "22023" });
    await organisations.switch(alice, alice.tenantId);
  });
});
