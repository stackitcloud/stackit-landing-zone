import { randomBytes, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { afterAll, beforeAll, expect, it } from "vitest";
import { PostgresAuthStore } from "../apps/api/src/auth/store.js";
import { withTenant } from "../apps/api/src/storage/database.js";
import { migrate } from "../apps/api/src/storage/migrations.js";
import {
  createDevelopmentSession,
  developmentLogin,
  developmentPasswordHash,
} from "../scripts/development-auth.js";

const url = new URL(process.env.LZC_TEST_DATABASE_URL ?? "");
if (
  !["127.0.0.1", "localhost"].includes(url.hostname) ||
  url.pathname !== "/configurator_test"
)
  throw new Error("Refusing a non-local/non-test database");
const admin = new pg.Client({ connectionString: url.href });
const config = {
  host: url.hostname,
  port: Number(url.port),
  database: "configurator_test",
};
const migration = new pg.Client({
  ...config,
  user: "configurator_migration",
  password: "migration-test-only",
});
const pool = new pg.Pool({
  ...config,
  user: "configurator_development",
  password: "development-test-only",
  max: 1,
});
const production = new pg.Pool({
  ...config,
  user: "configurator_app",
  password: "runtime-test-only",
});
const store = new PostgresAuthStore(pool);
const account = {
  id: randomUUID(),
  username: "developer",
  salt: randomBytes(32).toString("hex"),
  passwordHash: "",
};
beforeAll(async () => {
  await admin.connect();
  await admin.query(
    "DO $$ BEGIN IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='configurator_migration') THEN CREATE ROLE configurator_migration LOGIN PASSWORD 'migration-test-only'; END IF; IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='configurator_app') THEN CREATE ROLE configurator_app LOGIN PASSWORD 'runtime-test-only'; END IF; IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='configurator_development') THEN CREATE ROLE configurator_development LOGIN PASSWORD 'development-test-only'; END IF; END $$; GRANT configurator_app TO configurator_development; ALTER DATABASE configurator_test OWNER TO configurator_migration",
  );
  await migration.connect();
  await migrate(
    migration,
    fileURLToPath(new URL("../apps/api/db/", import.meta.url)),
  );
  await migration.query(
    await readFile(
      new URL("../scripts/development-auth.sql", import.meta.url),
      "utf8",
    ),
  );
  await migration.query(
    "SELECT lzc_auth.provision_development_account($1,$2)",
    [account.id, account.username],
  );
  account.passwordHash = (
    await developmentPasswordHash("synthetic-only-password", account.salt)
  ).toString("hex");
}, 30000);
afterAll(async () => {
  await Promise.all([
    pool.end(),
    production.end(),
    migration.end(),
    admin.end(),
  ]);
});
it("authenticates only the private development account and provisions no external/human identity", async () => {
  const login = developmentLogin(pool, account);
  expect(
    await login.authenticate("wrong-user", "synthetic-only-password"),
  ).toBeNull();
  expect(
    await login.authenticate(account.username, "wrong-password"),
  ).toBeNull();
  const token = await login.authenticate(
    account.username,
    "synthetic-only-password",
  );
  if (!token) throw new Error("Expected a development session");
  const session = await store.resolveSession(token);
  if (!session) throw new Error("Expected a resolved development session");
  expect(session.tenantKind).toBe("personal");
  expect(session.productRoles).toEqual([]);
  expect(session.manageMembers).toBe(false);
  const identity = await migration.query(
    "SELECT github_id, (SELECT count(*) FROM lzc_auth.external_identities WHERE user_id=u.id)::int AS external_count, (SELECT count(*) FROM lzc.stackit_identities WHERE user_id=u.id)::int AS human_count FROM lzc_auth.users u WHERE id=$1",
    [session.userId],
  );
  expect(identity.rows[0]).toEqual({
    github_id: null,
    external_count: 0,
    human_count: 0,
  });
  await store.deleteSession(token);
  expect(await store.resolveSession(token)).toBeNull();
});
it("keeps development session creation unavailable to the normal production role", async () => {
  const permission = await production.query(
    "SELECT has_function_privilege(current_user,'lzc_auth.complete_development_login(uuid,uuid,text,text,timestamptz)','EXECUTE') AS allowed",
  );
  expect(permission.rows[0].allowed).toBe(false);
  await expect(
    createDevelopmentSession(production, account.id),
  ).rejects.toMatchObject({ code: "42501" });
});
it("retains RLS isolation from existing users and rejects nonexistent developer accounts", async () => {
  const other = randomUUID();
  await migration.query(
    "SELECT lzc_auth.provision_development_account($1,$2)",
    [other, "other-developer"],
  );
  const tokens = await Promise.all([
    createDevelopmentSession(pool, account.id),
    createDevelopmentSession(pool, other),
  ]);
  const a = await store.resolveSession(tokens[0] ?? "");
  const b = await store.resolveSession(tokens[1] ?? "");
  if (!a || !b) throw new Error("Missing test sessions");
  expect(a.userId).not.toBe(b.userId);
  expect(a.tenantId).not.toBe(b.tenantId);
  const visible = await withTenant(pool, a, async (client) =>
    client.query("SELECT id FROM lzc.tenants WHERE id=$1", [b.tenantId]),
  );
  expect(visible.rowCount).toBe(0);
  await expect(
    createDevelopmentSession(pool, randomUUID()),
  ).rejects.toMatchObject({ code: "P0002" });
});
it("rejects revoked development accounts and does not let runtime access provisioning tables", async () => {
  await expect(
    pool.query("SELECT * FROM lzc_auth.development_accounts"),
  ).rejects.toMatchObject({ code: "42501" });
  await expect(
    pool.query("SELECT lzc_auth.provision_development_account($1,$2)", [
      randomUUID(),
      "forged",
    ]),
  ).rejects.toMatchObject({ code: "42501" });
  await migration.query(
    "UPDATE lzc_auth.development_accounts SET enabled=false WHERE id=$1",
    [account.id],
  );
  await expect(
    createDevelopmentSession(pool, account.id),
  ).rejects.toMatchObject({ code: "P0002" });
});
