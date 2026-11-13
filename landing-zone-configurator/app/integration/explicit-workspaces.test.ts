import { randomBytes, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { afterAll, beforeAll, expect, it } from "vitest";
import { PostgresAuthStore } from "../apps/api/src/auth/store.js";
import { Invitations } from "../apps/api/src/organisation/invitations.js";
import { PostgresOrganisations } from "../apps/api/src/organisation/service.js";
import { withTenant } from "../apps/api/src/storage/database.js";
import { migrate } from "../apps/api/src/storage/migrations.js";

const address = new URL(process.env.LZC_TEST_DATABASE_URL ?? "");
if (
  !["localhost", "127.0.0.1"].includes(address.hostname) ||
  address.pathname !== "/configurator_test"
)
  throw Error("Refusing non-local/non-test database");
const admin = new pg.Client({ connectionString: address.href });
const connection = {
  host: address.hostname,
  port: Number(address.port),
  database: "configurator_test",
};
const migration = new pg.Client({
  ...connection,
  user: "configurator_migration",
  password: "migration-test-only",
});
const pool = new pg.Pool({
  ...connection,
  user: "configurator_app",
  password: "runtime-test-only",
  max: 2,
});
const store = new PostgresAuthStore(pool);
const workspaces = new PostgresOrganisations(pool);
const directory = fileURLToPath(new URL("../apps/api/db/", import.meta.url));
beforeAll(async () => {
  await admin.connect();
  await admin.query(
    "DO $$ BEGIN IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='configurator_migration') THEN CREATE ROLE configurator_migration LOGIN PASSWORD 'migration-test-only'; END IF; IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='configurator_app') THEN CREATE ROLE configurator_app LOGIN PASSWORD 'runtime-test-only'; END IF; END $$; ALTER DATABASE configurator_test OWNER TO configurator_migration",
  );
  await migration.connect();
  await migrate(migration, directory);
}, 30000);
afterAll(async () => {
  await Promise.all([pool.end(), migration.end(), admin.end()]);
});
async function login() {
  const token = randomBytes(32).toString("base64url");
  const session = await store.createStackitSession({
    id: randomUUID(),
    hash: (await import("../apps/api/src/auth/store.js")).tokenHash(token),
    csrfToken: randomBytes(32).toString("base64url"),
    expiresAt: new Date(Date.now() + 3600000),
    identity: {
      issuer: "https://accounts.stackit.cloud",
      subject: randomUUID(),
      email: "onboarding@example.test",
      emailVerified: true,
      verificationMethod: "signed-id-token-and-userinfo",
      tokenExpiresAt: new Date(Date.now() + 3600000).toISOString(),
      organization: null,
    },
  });
  return { session, token };
}
it("creates only an unprivileged login context, selects a workspace explicitly and returns to selection after revocation", async () => {
  const { session, token } = await login();
  expect(await store.resolveSession(token)).toMatchObject({
    tenantKind: "account",
    productRoles: [],
    manageMembers: false,
  });
  expect(await workspaces.overview(session)).toMatchObject({
    activeTenantId: null,
    tenants: [],
    members: [],
  });
  await expect(
    workspaces.switch(session, session.tenantId),
  ).rejects.toMatchObject({ code: "42501" });
  await expect(
    withTenant(pool, session, (c) =>
      c.query(
        "INSERT INTO lzc.configurations(tenant_id,created_by,name,document) VALUES($1,$2,'forbidden','{}')",
        [session.tenantId, session.userId],
      ),
    ),
  ).rejects.toMatchObject({ code: "42501" });
  const tenantId = await workspaces.create(
    session,
    "Platform team",
    randomUUID(),
  );
  expect((await store.resolveSession(token))?.tenantKind).toBe("account");
  await workspaces.switch(session, tenantId);
  const selected = await store.resolveSession(token);
  if (!selected) throw Error("Selected session missing");
  expect(selected).toMatchObject({
    tenantId,
    tokenTenantId: session.tenantId,
    tenantKind: "organisation",
    productRoles: ["platform-engineer"],
  });
  expect((await workspaces.overview(selected)).tenants[0]).toMatchObject({
    id: tenantId,
    organizationVerified: false,
  });
  const second = await login();
  const invitations = new Invitations(pool);
  const invitation = await invitations.create(
    selected,
    ["platform-engineer"],
    true,
  );
  await invitations.use(second.session, invitation.token, true);
  const manager = await store.resolveSession(second.token);
  if (!manager) throw Error("Invited manager missing");
  await workspaces.editMember(manager, session.userId, [], false, true);
  expect(await store.resolveSession(token)).toMatchObject({
    tenantId: session.tenantId,
    tokenTenantId: session.tenantId,
    tenantKind: "account",
    productRoles: [],
    manageMembers: false,
  });
  expect((await workspaces.overview(session)).tenants).toEqual([]);
});

it("upgrades empty personal homes to hidden accounts and retains used homes as ordinary unverified workspaces without changing data IDs", async () => {
  const empty = await login();
  const used = await login();
  const configurationId = randomUUID();
  const profileId = randomUUID();
  await migration.query("BEGIN");
  try {
    await migration.query(
      "ALTER TABLE lzc.tenants DROP CONSTRAINT tenants_kind_check; ALTER TABLE lzc.tenants DROP CONSTRAINT tenant_kind; ALTER TABLE lzc.tenants ADD CONSTRAINT tenants_kind_check CHECK(kind IN ('account','personal','organisation')); ALTER TABLE lzc.tenants ADD CONSTRAINT tenant_kind CHECK(true)",
    );
    await migration.query(
      "UPDATE lzc.tenants SET kind='personal',name='Persönlicher Arbeitsbereich' WHERE id=ANY($1::uuid[])",
      [[empty.session.tenantId, used.session.tenantId]],
    );
    await migration.query(
      "UPDATE lzc.memberships SET role='admin' WHERE tenant_id=ANY($1::uuid[])",
      [[empty.session.tenantId, used.session.tenantId]],
    );
    await migration.query(
      "INSERT INTO lzc.configurations(id,tenant_id,created_by,name,document) VALUES($1,$2,$3,'Existing draft','{}')",
      [configurationId, used.session.tenantId, used.session.userId],
    );
    await migration.query(
      "INSERT INTO lzc.credential_profiles(id,tenant_id,owner_user_id,name,service_account,key_id) VALUES($1,$2,$3,'Existing profile','synthetic@sa.stackit.cloud','synthetic-key')",
      [profileId, used.session.tenantId, used.session.userId],
    );
    await migration.query(
      "INSERT INTO lzc.application_groups(tenant_id,name,is_default) VALUES($1,'Application Owners',true) ON CONFLICT DO NOTHING",
      [empty.session.tenantId],
    );
    const before = (
      await migration.query(
        "SELECT to_jsonb(c) AS value FROM lzc.credential_profiles c WHERE id=$1",
        [profileId],
      )
    ).rows[0].value;
    await migration.query(
      await readFile(directory + "/097_explicit_workspaces.sql", "utf8"),
    );
    expect(
      (
        await migration.query("SELECT kind,name FROM lzc.tenants WHERE id=$1", [
          empty.session.tenantId,
        ])
      ).rows[0],
    ).toEqual({ kind: "account", name: "account" });
    expect(
      (
        await migration.query(
          "SELECT kind,owner_user_id,organization_id,organization_verified FROM lzc.tenants WHERE id=$1",
          [used.session.tenantId],
        )
      ).rows[0],
    ).toEqual({
      kind: "organisation",
      owner_user_id: null,
      organization_id: null,
      organization_verified: false,
    });
    expect(
      (
        await migration.query(
          "SELECT to_jsonb(c) AS value FROM lzc.credential_profiles c WHERE id=$1",
          [profileId],
        )
      ).rows[0].value,
    ).toEqual(before);
    expect(
      (
        await migration.query(
          "SELECT id,tenant_id FROM lzc.configurations WHERE id=$1",
          [configurationId],
        )
      ).rows[0],
    ).toEqual({ id: configurationId, tenant_id: used.session.tenantId });
    const overview = (
      await migration.query(
        "SELECT lzc_auth.organisation_overview($1) AS value",
        [used.session.id],
      )
    ).rows[0].value;
    expect(overview).toMatchObject({
      activeTenantId: null,
      tenants: [
        {
          id: used.session.tenantId,
          kind: "organisation",
          organizationVerified: false,
        },
      ],
    });
    await migration.query("SELECT lzc_auth.switch_organisation($1,$2)", [
      used.session.id,
      used.session.tenantId,
    ]);
    const org = randomUUID();
    await migration.query(
      "SELECT lzc_auth.assign_workspace_organization($1,$2,$3)",
      [used.session.id, used.session.tenantId, org],
    );
    expect(
      (
        await migration.query(
          "SELECT organization_id,organization_verified FROM lzc.tenants WHERE id=$1",
          [used.session.tenantId],
        )
      ).rows[0],
    ).toEqual({ organization_id: org, organization_verified: false });
  } finally {
    await migration.query("ROLLBACK");
  }
});
