import { randomBytes, randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { afterAll, beforeAll, expect, it } from "vitest";
import { PostgresAuthStore, type Session } from "../apps/api/src/auth/store.js";
import { migrate } from "../apps/api/src/storage/migrations.js";

const address = process.env.LZC_TEST_DATABASE_URL;
if (!address) throw new Error("LZC_TEST_DATABASE_URL required");
const url = new URL(address);
if (
  !["127.0.0.1", "localhost"].includes(url.hostname) ||
  url.pathname !== "/configurator_test"
)
  throw new Error("Refusing a non-local/non-test database");
const admin = new pg.Client({ connectionString: address });
const connection = {
  host: url.hostname,
  port: Number(url.port),
  database: "configurator_test",
  user: "configurator_migration",
  password: "migration-test-only",
};
const migration = new pg.Client(connection);
const runtime = new pg.Pool({
  ...connection,
  user: "configurator_app",
  password: "runtime-test-only",
});
const old = "9e7fb46c329aca32e878ce1f0ea3b944ea240354";
const latest = "08ac257de1548c8ec5e83dae1a79373711c3d644";
let owner: Session;
let outsider: Session;

async function scoped<T>(
  session: Session,
  action: (client: pg.PoolClient) => Promise<T>,
) {
  const client = await runtime.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      "SELECT set_config('lzc.user_id',$1,true),set_config('lzc.tenant_id',$2,true)",
      [session.userId, session.tenantId],
    );
    const result = await action(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
async function context(instance: string, session = owner) {
  return scoped(
    session,
    async (c) =>
      (
        await c.query(
          "SELECT lzc_auth.application_execution_context($1,$2) AS value",
          [session.id, instance],
        )
      ).rows[0].value,
  );
}
async function upgrade(
  instance: string,
  expected = old,
  target = latest,
  confirm = true,
  session = owner,
) {
  return scoped(
    session,
    async (c) =>
      (
        await c.query(
          "SELECT lzc_auth.upgrade_application_execution($1,$2,$3,$4,$5) AS value",
          [session.id, instance, target, expected, confirm],
        )
      ).rows[0].value,
  );
}
// Historical fixture import bypasses admission triggers only. Runtime functions,
// privileges, RLS and all newly tested admission paths retain their real guards.
async function historical(source = old) {
  const version = randomUUID(),
    instance = randomUUID();
  await admin.query("SET session_replication_role=replica");
  try {
    await admin.query(
      "INSERT INTO lzc.application_template_versions(id,tenant_id,template_id,version,published_by,accelerator_revision,document,deployment_policy) VALUES($1,$2,$3,1,$4,$5,'{}','direct')",
      [version, owner.tenantId, randomUUID(), owner.userId, source],
    );
    await admin.query(
      "INSERT INTO lzc.application_instances(id,tenant_id,version_id,requested_by,idempotency_key,name,parameters,resolved_settings,qualification_blockers,deployment_policy) VALUES($1,$2,$3,$4,$5,'lifecycle-fixture','{}','{}','[\"historical\"]','direct')",
      [instance, owner.tenantId, version, owner.userId, randomUUID()],
    );
  } finally {
    await admin.query("SET session_replication_role=origin");
  }
  return { instance, version };
}
async function job(instance: string, operation = "plan") {
  const id = randomUUID();
  await admin.query("SET session_replication_role=replica");
  try {
    await admin.query(
      "INSERT INTO lzc.application_jobs(id,tenant_id,instance_id,owner_user_id,issuer_session_id,idempotency_key,operation,inputs,binding_sha256,expires_at,plan_id,artifact_sha256) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,now()+interval '20 minutes',CASE WHEN $7='apply' THEN $1::uuid ELSE NULL END,CASE WHEN $7='apply' THEN $9::text ELSE NULL END)",
      [
        id,
        owner.tenantId,
        instance,
        owner.userId,
        owner.id,
        randomUUID(),
        operation,
        { acceleratorRevision: old },
        "a".repeat(64),
      ],
    );
  } finally {
    await admin.query("SET session_replication_role=origin");
  }
  return id;
}
beforeAll(async () => {
  await admin.connect();
  await admin.query(
    "DO $$ BEGIN IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='configurator_migration') THEN CREATE ROLE configurator_migration LOGIN PASSWORD 'migration-test-only'; END IF; IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='configurator_app') THEN CREATE ROLE configurator_app LOGIN PASSWORD 'runtime-test-only'; END IF; END $$",
  );
  await admin.query(
    "ALTER DATABASE configurator_test OWNER TO configurator_migration",
  );
  await migration.connect();
  const directory = fileURLToPath(new URL("../apps/api/db/", import.meta.url));
  await migrate(migration, directory);
  await migrate(migration, directory);
  const store = new PostgresAuthStore(runtime);
  async function session(id: number) {
    return store.createSession({
      githubId: id,
      login: `lifecycle-${id}`,
      id: randomUUID(),
      hash: randomBytes(32).toString("base64url"),
      csrfToken: randomBytes(32).toString("base64url"),
      expiresAt: new Date(Date.now() + 3600000),
    });
  }
  owner = await session(790001);
  outsider = await session(790002);
}, 30000);
afterAll(async () => {
  await runtime.end();
  await migration.end();
  await admin.end();
});

it("keeps historical origin and order byte-for-byte unchanged while explicitly advancing desired execution, idempotently", async () => {
  const { instance, version } = await historical();
  const before = (
    await admin.query(
      "SELECT to_jsonb(i) AS value FROM lzc.application_instances i WHERE id=$1",
      [instance],
    )
  ).rows[0].value;
  expect(await context(instance)).toMatchObject({
    revision: old,
    originRevision: old,
    bindingId: null,
    lastAppliedRevision: null,
    sourceStatus: "supported",
    canUpgrade: true,
    blockers: [],
  });
  expect(
    (
      await admin.query(
        "SELECT count(*) FROM lzc.application_execution_bindings WHERE instance_id=$1",
        [instance],
      )
    ).rows[0].count,
  ).toBe("0");
  await expect(upgrade(instance, old, latest, false)).rejects.toThrow(
    "application_upgrade_confirmation_required",
  );
  const changed = await upgrade(instance);
  expect(changed).toMatchObject({
    revision: latest,
    originRevision: old,
    lastAppliedRevision: null,
    canUpgrade: false,
  });
  expect(changed.bindingId).toMatch(/^[a-f0-9-]{36}$/);
  expect(await upgrade(instance)).toEqual(changed);
  await expect(upgrade(instance, old, old)).rejects.toThrow(
    "application_execution_changed",
  );
  await expect(upgrade(instance, latest, old)).rejects.toThrow(
    "application_upgrade_source_unavailable",
  );
  expect(
    (
      await admin.query(
        "SELECT to_jsonb(i) AS value FROM lzc.application_instances i WHERE id=$1",
        [instance],
      )
    ).rows[0].value,
  ).toEqual(before);
  expect(
    (
      await admin.query(
        "SELECT accelerator_revision FROM lzc.application_template_versions WHERE id=$1",
        [version],
      )
    ).rows[0].accelerator_revision,
  ).toBe(old);
  expect(
    (
      await admin.query(
        "SELECT count(*) FROM lzc.application_jobs WHERE instance_id=$1",
        [instance],
      )
    ).rows[0].count,
  ).toBe("0");
});
it("rejects cross-tenant visibility, registry writes and append-only binding mutations", async () => {
  const { instance } = await historical();
  await expect(context(instance, outsider)).rejects.toThrow();
  await expect(
    upgrade(instance, old, latest, true, outsider),
  ).rejects.toThrow();
  await scoped(outsider, async (c) =>
    expect(
      (
        await c.query(
          "SELECT * FROM lzc.application_execution_bindings WHERE instance_id=$1",
          [instance],
        )
      ).rowCount,
    ).toBe(0),
  );
  await expect(
    scoped(owner, (c) =>
      c.query(
        "UPDATE lzc.application_execution_sources SET status='withdrawn' WHERE revision=$1",
        [old],
      ),
    ),
  ).rejects.toThrow("permission denied");
  await upgrade(instance);
  await expect(
    migration.query(
      "UPDATE lzc.application_execution_bindings SET revision=$1 WHERE instance_id=$2",
      [old, instance],
    ),
  ).rejects.toThrow("immutable_application_version");
});
it("exposes withdrawn historical sources with an explicit supported replacement, never silently upgrading", async () => {
  const withdrawn = "4d15d7870afa323badd93559d8b37c5a8d138dcf";
  const { instance } = await historical(withdrawn);
  expect(await context(instance)).toMatchObject({
    revision: withdrawn,
    sourceStatus: "withdrawn",
    replacementRevision: latest,
  });
  expect(await upgrade(instance, withdrawn)).toMatchObject({
    revision: latest,
    originRevision: withdrawn,
  });
});
it("requires exact current binding before stale jobs can claim inputs or credentials", async () => {
  const { instance } = await historical();
  const id = await job(instance);
  await upgrade(instance);
  for (const name of [
    "claim_application_job_grant",
    "application_runner_input_context",
    "application_job_credential_context",
  ]) {
    await expect(
      scoped(owner, (c) =>
        c.query(`SELECT lzc_auth.${name}($1,$2)`, [owner.id, id]),
      ),
    ).rejects.toThrow("application_execution_binding_changed");
  }
  await expect(
    scoped(owner, (c) =>
      c.query("SELECT lzc_auth.application_runner_source($1,$2,$3)", [
        randomBytes(32).toString("base64url"),
        randomUUID(),
        "d40debbff204aee590c2a76d09f6ad3234643329b438fd5c6497de60687f6fa5",
      ]),
    ),
  ).rejects.toThrow("invalid_application_runner_ticket");
});
it("serializes concurrent upgrade confirmations on one immutable binding", async () => {
  const { instance } = await historical();
  const values = await Promise.all([upgrade(instance), upgrade(instance)]);
  expect(values[0].bindingId).toBe(values[1].bindingId);
  expect(
    (
      await admin.query(
        "SELECT count(*) FROM lzc.application_execution_bindings WHERE instance_id=$1",
        [instance],
      )
    ).rows[0].count,
  ).toBe("1");
});

const lock = "d40debbff204aee590c2a76d09f6ad3234643329b438fd5c6497de60687f6fa5";
async function importRows(action: () => Promise<unknown>) {
  await admin.query("SET session_replication_role=replica");
  try {
    await action();
  } finally {
    await admin.query("SET session_replication_role=origin");
  }
}
async function ticket(id: string, consumed = false, live = true) {
  const hash = randomBytes(32).toString("base64url"),
    packageId = randomUUID();
  await importRows(() =>
    admin.query(
      "INSERT INTO lzc.application_runner_tickets(job_id,tenant_id,approval_session_id,ticket_hash,runner_package_id,accelerator_revision,provider_lock_sha256,issued_at,expires_at,consumed_at) VALUES($1,$2,$3,$4,$5,$6,$7,now()-interval '1 hour',now()+CASE WHEN $8 THEN interval '10 minutes' ELSE interval '-1 minute' END,CASE WHEN $9 THEN now() ELSE NULL END)",
      [
        id,
        owner.tenantId,
        owner.id,
        hash,
        packageId,
        old,
        lock,
        live,
        consumed,
      ],
    ),
  );
  return { hash, packageId };
}
it("blocks upgrades for live unconsumed tickets, unknown recovery, and acquired execution claims", async () => {
  const pending = await historical();
  const pendingJob = await job(pending.instance);
  await ticket(pendingJob);
  expect(await context(pending.instance)).toMatchObject({
    canUpgrade: false,
    blockers: ["runner-ticket-active"],
  });
  await expect(upgrade(pending.instance)).rejects.toThrow(
    "application_upgrade_execution_active",
  );
  const uncertain = await historical();
  const uncertainJob = await job(uncertain.instance, "apply");
  await importRows(() =>
    admin.query(
      "INSERT INTO lzc.application_dispatches(job_id,tenant_id,instance_id,owner_user_id,approved_by,approval_session_id,status,finished_at) VALUES($1,$2,$3,$4,$4,$5,'reconciliation_required',now())",
      [
        uncertainJob,
        owner.tenantId,
        uncertain.instance,
        owner.userId,
        owner.id,
      ],
    ),
  );
  expect((await context(uncertain.instance)).blockers).toContain(
    "execution-or-recovery-active",
  );
  await expect(upgrade(uncertain.instance)).rejects.toThrow(
    "application_upgrade_execution_active",
  );
  const claimed = await historical();
  const claimedJob = await job(claimed.instance);
  await importRows(() =>
    admin.query(
      "INSERT INTO lzc.application_job_claims(job_id,tenant_id,owner_user_id,approved_by,approval_session_id,expires_at) VALUES($1,$2,$3,$3,$4,now()+interval '10 minutes')",
      [claimedJob, owner.tenantId, owner.userId, owner.id],
    ),
  );
  expect((await context(claimed.instance)).blockers).toContain(
    "execution-claim-active",
  );
  await expect(upgrade(claimed.instance)).rejects.toThrow(
    "application_upgrade_execution_active",
  );
});
it("prevents direct SQL jobs, including Apply, from bypassing the latest execution binding", async () => {
  const { instance } = await historical();
  const current = await upgrade(instance);
  for (const operation of ["plan", "apply"]) {
    for (const inputs of [
      { acceleratorRevision: old },
      { acceleratorRevision: latest },
      { acceleratorRevision: latest, executionBindingId: randomUUID() },
    ]) {
      await expect(
        scoped(owner, (c) =>
          c.query(
            "INSERT INTO lzc.application_jobs(id,tenant_id,instance_id,owner_user_id,issuer_session_id,idempotency_key,operation,inputs,binding_sha256,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,now()+interval '10 minutes')",
            [
              randomUUID(),
              owner.tenantId,
              instance,
              owner.userId,
              owner.id,
              randomUUID(),
              operation,
              inputs,
              "a".repeat(64),
            ],
          ),
        ),
      ).rejects.toThrow("application_execution_binding_changed");
    }
  }
  expect((await context(instance)).bindingId).toBe(current.bindingId);
});
it("resolves an in-flight report using its original package after the product package changes, including withdrawn sources", async () => {
  const { instance } = await historical();
  const id = await job(instance);
  const original = await ticket(id, true);
  const changedProductPackage = randomUUID();
  expect(changedProductPackage).not.toBe(original.packageId);
  await importRows(async () => {
    await admin.query(
      "UPDATE lzc.tenants SET kind='organisation',owner_user_id=NULL,organization_id=$1,organization_verified=true WHERE id=$2",
      [randomUUID(), owner.tenantId],
    );
    await admin.query(
      "UPDATE lzc.memberships SET product_roles=ARRAY['platform-engineer'] WHERE user_id=$1 AND tenant_id=$2",
      [owner.userId, owner.tenantId],
    );
    await admin.query(
      "INSERT INTO lzc.application_dispatches(job_id,tenant_id,instance_id,owner_user_id,approved_by,approval_session_id,status,runner_app_id,runner_package_id) VALUES($1,$2,$3,$4,$4,$5,'planning',$6,$7)",
      [
        id,
        owner.tenantId,
        instance,
        owner.userId,
        owner.id,
        randomUUID(),
        original.packageId,
      ],
    );
  });
  const resolve = (hash = original.hash, pinnedLock = lock) =>
    runtime.query(
      "SELECT lzc_auth.application_runner_binding($1,$2) AS value",
      [hash, pinnedLock],
    );
  expect((await resolve()).rows[0].value).toEqual({
    runnerPackageId: original.packageId,
    acceleratorRevision: old,
    providerLockSha256: lock,
  });
  await expect(
    runtime.query("SELECT lzc_auth.application_runner_source($1,$2,$3)", [
      original.hash,
      changedProductPackage,
      lock,
    ]),
  ).rejects.toThrow("invalid_application_runner_ticket");
  await expect(resolve(randomBytes(32).toString("base64url"))).rejects.toThrow(
    "invalid_application_runner_ticket",
  );
  await expect(resolve(original.hash, "b".repeat(64))).rejects.toThrow(
    "invalid_application_runner_ticket",
  );
  await migration.query(
    "UPDATE lzc.application_execution_sources SET status='withdrawn' WHERE revision=$1",
    [old],
  );
  try {
    expect((await resolve()).rows[0].value.runnerPackageId).toBe(
      original.packageId,
    );
    await expect(
      scoped(owner, (c) =>
        c.query("SELECT lzc_auth.application_runner_input_context($1,$2)", [
          owner.id,
          id,
        ]),
      ),
    ).rejects.toThrow("application_execution_binding_changed");
  } finally {
    await migration.query(
      "UPDATE lzc.application_execution_sources SET status='supported' WHERE revision=$1",
      [old],
    );
  }
});
it("keeps desired source and independently reports the most recent successful Apply source", async () => {
  const { instance } = await historical();
  const appliedJob = await job(instance, "apply");
  await importRows(async () => {
    await admin.query(
      "INSERT INTO lzc.application_job_grants(job_id,tenant_id,owner_user_id,instance_id,version_id,platform_revision,approved_by,organization_id,credential_profile_id,credential_version,credential_key_id,accelerator_revision,state_key,operation,binding_sha256,expires_at) SELECT $1::uuid,$2::uuid,$3::uuid,$4::uuid,version_id,$5::uuid,$3::uuid,$6::uuid,$7::uuid,1,'key',$8,'applications/'||$2::text||'/'||$4::text||'/terraform.tfstate','apply',$9,now()-interval '1 minute' FROM lzc.application_instances WHERE id=$4::uuid",
      [
        appliedJob,
        owner.tenantId,
        owner.userId,
        instance,
        randomUUID(),
        randomUUID(),
        randomUUID(),
        old,
        "a".repeat(64),
      ],
    );
    await admin.query(
      "INSERT INTO lzc.application_dispatches(job_id,tenant_id,instance_id,owner_user_id,approved_by,approval_session_id,status,finished_at) VALUES($1,$2,$3,$4,$4,$5,'succeeded',now())",
      [appliedJob, owner.tenantId, instance, owner.userId, owner.id],
    );
  });
  expect(await upgrade(instance)).toMatchObject({
    revision: latest,
    lastAppliedRevision: old,
  });
  expect(
    (
      await admin.query(
        "SELECT revoked_at FROM lzc.application_job_grants WHERE job_id=$1",
        [appliedJob],
      )
    ).rows[0].revoked_at,
  ).toBeNull();
});

async function grant(
  id: string,
  instance: string,
  operation: "plan" | "apply",
  live = true,
) {
  await importRows(() =>
    admin.query(
      "INSERT INTO lzc.application_job_grants(job_id,tenant_id,owner_user_id,instance_id,version_id,platform_revision,approved_by,organization_id,credential_profile_id,credential_version,credential_key_id,accelerator_revision,state_key,operation,binding_sha256,expires_at) SELECT $1::uuid,$2::uuid,$3::uuid,$4::uuid,version_id,$5::uuid,$3::uuid,$6::uuid,$7::uuid,1,'key',$8,'applications/'||$2::text||'/'||$4::text||'/terraform.tfstate',$10,$9,now()+CASE WHEN $11 THEN interval '10 minutes' ELSE interval '-1 minute' END FROM lzc.application_instances WHERE id=$4::uuid",
      [
        id,
        owner.tenantId,
        owner.userId,
        instance,
        randomUUID(),
        randomUUID(),
        randomUUID(),
        old,
        "a".repeat(64),
        operation,
        live,
      ],
    ),
  );
}
it("revokes unused old Plan grants but blocks any still-live undispatched Apply grant", async () => {
  const unused = await historical();
  const plan = await job(unused.instance);
  await grant(plan, unused.instance, "plan");
  await upgrade(unused.instance);
  expect(
    (
      await admin.query(
        "SELECT revoked_at FROM lzc.application_job_grants WHERE job_id=$1",
        [plan],
      )
    ).rows[0].revoked_at,
  ).not.toBeNull();
  const applying = await historical();
  const apply = await job(applying.instance, "apply");
  await grant(apply, applying.instance, "apply");
  expect((await context(applying.instance)).blockers).toContain(
    "apply-grant-active",
  );
  await expect(upgrade(applying.instance)).rejects.toThrow(
    "application_upgrade_execution_active",
  );
});
it("permits expired unused tickets and checks the positive exact-binding path without changing native inputs", async () => {
  const { instance } = await historical();
  const prior = await job(instance);
  await ticket(prior, false, false);
  const current = await upgrade(instance);
  const id = await job(instance);
  await importRows(() =>
    admin.query("UPDATE lzc.application_jobs SET inputs=$1 WHERE id=$2", [
      {
        acceleratorRevision: latest,
        executionBindingId: current.bindingId,
        variables: { preserved: true },
      },
      id,
    ]),
  );
  await migration.query(
    "SELECT lzc_auth.assert_application_execution_binding($1)",
    [id],
  );
  expect(
    (
      await admin.query("SELECT inputs FROM lzc.application_jobs WHERE id=$1", [
        id,
      ])
    ).rows[0].inputs.variables,
  ).toEqual({ preserved: true });
});
it("blocks guided recovery and unfinished recovery capabilities even when its assessment is blocked", async () => {
  const { instance } = await historical();
  const id = await job(instance, "apply");
  const recovery = randomUUID();
  await importRows(async () => {
    await admin.query(
      "INSERT INTO lzc.application_state_recoveries(id,job_id,tenant_id,instance_id,requested_by,owner_user_id,reviewed_by,idempotency_key,phase,expires_at,public_view) VALUES($1,$2,$3,$4,$5,$5,$5,$6,'blocked',now()+interval '10 minutes','{}')",
      [recovery, id, owner.tenantId, instance, owner.userId, randomUUID()],
    );
    await admin.query(
      "INSERT INTO lzc.application_state_recovery_tasks(id,recovery_id,tenant_id,mode,issuer_session_id,issued_by,ticket_hash,input_ciphertext,expires_at) VALUES($1,$2,$3,'prepare',$4,$5,$6,$7,now()+interval '10 minutes')",
      [
        randomUUID(),
        recovery,
        owner.tenantId,
        owner.id,
        owner.userId,
        randomBytes(32).toString("base64url"),
        Buffer.from("isolated fixture"),
      ],
    );
  });
  expect((await context(instance)).blockers).toContain(
    "guided-recovery-active",
  );
  await expect(upgrade(instance)).rejects.toThrow(
    "application_upgrade_execution_active",
  );
});

it("locks the instance before its grant when dispatch races an upgrade, without a deadlock", async () => {
  const { instance } = await historical();
  const id = await job(instance);
  await grant(id, instance, "plan");
  const dispatch = await runtime.connect();
  let result: Promise<{ error?: unknown }> | undefined;
  try {
    await migration.query("BEGIN");
    await migration.query(
      "SELECT set_config('lzc.user_id',$1,true),set_config('lzc.tenant_id',$2,true)",
      [owner.userId, owner.tenantId],
    );
    await migration.query(
      "SELECT 1 FROM lzc.application_instances WHERE id=$1 FOR UPDATE",
      [instance],
    );
    await dispatch.query("BEGIN");
    await dispatch.query(
      "SELECT set_config('lzc.user_id',$1,true),set_config('lzc.tenant_id',$2,true)",
      [owner.userId, owner.tenantId],
    );
    const pid = (await dispatch.query("SELECT pg_backend_pid() AS id")).rows[0]
      .id;
    result = dispatch
      .query("SELECT lzc_auth.reserve_application_dispatch($1,$2)", [
        owner.id,
        id,
      ])
      .then(
        () => ({}),
        (error) => ({ error }),
      );
    // Observe the competing transaction waiting, rather than trusting a delay.
    let waiting = false;
    for (let attempt = 0; attempt < 80; attempt++) {
      const row = (
        await admin.query(
          "SELECT cardinality(pg_blocking_pids($1))>0 AS blocked",
          [pid],
        )
      ).rows[0];
      if (row.blocked) {
        waiting = true;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    expect(waiting).toBe(true);
    await migration.query("SET LOCAL statement_timeout='3s'");
    const upgraded = await migration.query(
      "SELECT lzc_auth.upgrade_application_execution($1,$2,$3,$4,true) AS value",
      [owner.id, instance, latest, old],
    );
    expect(upgraded.rows[0].value.revision).toBe(latest);
    await migration.query("COMMIT");
    expect((await result).error).toMatchObject({
      message: "application_execution_binding_changed",
    });
    expect(
      (
        await admin.query(
          "SELECT count(*) FROM lzc.application_dispatches WHERE job_id=$1",
          [id],
        )
      ).rows[0].count,
    ).toBe("0");
  } finally {
    await migration.query("ROLLBACK");
    if (result) await result;
    await dispatch.query("ROLLBACK");
    dispatch.release();
  }
});

it("withdrawal blocks separate recovery admission and secret release but preserves the original task report capability", async () => {
  const { instance } = await historical();
  const id = await job(instance, "apply");
  await grant(id, instance, "apply", false);
  const recovery = randomUUID(),
    task = randomUUID(),
    packageId = randomUUID(),
    hash = randomBytes(32).toString("base64url");
  await importRows(async () => {
    await admin.query(
      "UPDATE lzc.tenants SET kind='organisation',owner_user_id=NULL,organization_id=$1,organization_verified=true WHERE id=$2",
      [randomUUID(), owner.tenantId],
    );
    await admin.query(
      "UPDATE lzc.memberships SET product_roles=ARRAY['platform-engineer'] WHERE user_id=$1 AND tenant_id=$2",
      [owner.userId, owner.tenantId],
    );
    await admin.query(
      "INSERT INTO lzc.stackit_identities(user_id,issuer,subject,email,verification_method,valid_until) VALUES($1,'https://accounts.stackit.cloud',$2,'lifecycle@example.test','device-grant-userinfo',now()+interval '1 hour') ON CONFLICT(user_id) DO UPDATE SET valid_until=excluded.valid_until",
      [owner.userId, randomUUID()],
    );
    await admin.query(
      "INSERT INTO lzc.application_state_recoveries(id,job_id,tenant_id,instance_id,requested_by,owner_user_id,reviewed_by,idempotency_key,phase,expires_at,public_view) VALUES($1,$2,$3,$4,$5,$5,$5,$6,'assessing',now()+interval '10 minutes','{}')",
      [recovery, id, owner.tenantId, instance, owner.userId, randomUUID()],
    );
    await admin.query(
      "INSERT INTO lzc.application_state_recovery_tasks(id,recovery_id,tenant_id,mode,issuer_session_id,issued_by,ticket_hash,input_ciphertext,expires_at,runner_app_id,runner_package_id) VALUES($1,$2,$3,'prepare',$4,$5,$6,$7,now()+interval '10 minutes',$8,$9)",
      [
        task,
        recovery,
        owner.tenantId,
        owner.id,
        owner.userId,
        hash,
        Buffer.from("isolated ciphertext"),
        randomUUID(),
        packageId,
      ],
    );
  });
  await migration.query(
    "SELECT lzc_auth.assert_application_recovery_source($1)",
    [recovery],
  );
  const snapshot = (
    await admin.query(
      "SELECT to_jsonb(t) AS value FROM lzc.application_state_recovery_tasks t WHERE id=$1",
      [task],
    )
  ).rows[0].value;
  await migration.query(
    "UPDATE lzc.application_execution_sources SET status='withdrawn' WHERE revision=$1",
    [old],
  );
  try {
    await expect(
      scoped(owner, (c) =>
        c.query(
          "SELECT lzc_auth.release_application_state_recovery_input($1,$2)",
          [owner.id, task],
        ),
      ),
    ).rejects.toThrow("application_recovery_source_unavailable");
    await expect(
      scoped(owner, (c) =>
        c.query(
          "SELECT lzc_auth.bind_application_state_recovery_task($1,$2,$3,$4)",
          [owner.id, task, randomUUID(), packageId],
        ),
      ),
    ).rejects.toThrow("application_recovery_source_unavailable");
    await expect(
      scoped(owner, (c) =>
        c.query(
          "SELECT lzc_auth.begin_application_state_recovery_task($1,$2,$3,'prepare',$4,$5,'{}')",
          [
            owner.id,
            recovery,
            randomUUID(),
            randomBytes(32).toString("base64url"),
            Buffer.from("fixture"),
          ],
        ),
      ),
    ).rejects.toThrow("application_recovery_source_unavailable");
    await expect(
      scoped(owner, (c) =>
        c.query(
          "SELECT lzc_auth.fence_application_state_recovery($1,$2,'unlock')",
          [owner.id, task],
        ),
      ),
    ).rejects.toThrow("application_recovery_source_unavailable");
    await expect(
      migration.query(
        "INSERT INTO lzc.application_state_recovery_tasks(id,recovery_id,tenant_id,mode,issuer_session_id,issued_by,ticket_hash,input_ciphertext,expires_at) VALUES($1,$2,$3,'commit',$4,$5,$6,$7,now()+interval '10 minutes')",
        [
          randomUUID(),
          recovery,
          owner.tenantId,
          owner.id,
          owner.userId,
          randomBytes(32).toString("base64url"),
          Buffer.from("fixture"),
        ],
      ),
    ).rejects.toThrow("application_recovery_source_unavailable");
    await expect(
      migration.query(
        "UPDATE lzc.application_state_recovery_tasks SET input_released_at=now() WHERE id=$1",
        [task],
      ),
    ).rejects.toThrow("application_recovery_source_unavailable");
    expect(
      (
        await runtime.query(
          "SELECT * FROM lzc_auth.resolve_application_state_recovery_task($1,$2)",
          [hash, packageId],
        )
      ).rows[0].task_id,
    ).toBe(task);
    expect(
      (
        await runtime.query(
          "SELECT lzc_auth.application_runner_binding($1,$2) AS value",
          [hash, lock],
        )
      ).rows[0].value,
    ).toEqual({
      runnerPackageId: packageId,
      acceleratorRevision: old,
      providerLockSha256: lock,
    });
    expect(
      (
        await admin.query(
          "SELECT to_jsonb(t) AS value FROM lzc.application_state_recovery_tasks t WHERE id=$1",
          [task],
        )
      ).rows[0].value,
    ).toEqual(snapshot);
  } finally {
    await migration.query(
      "UPDATE lzc.application_execution_sources SET status='supported' WHERE revision=$1",
      [old],
    );
  }
});

it.each([
  "4d15d7870afa323badd93559d8b37c5a8d138dcf",
  "c4b43c36af198985980b17626c48d357795e3fbd",
  "88149782bf8e91dcdbb43a203b54337886023f7f",
  "57ad1f6a651c1787694b74ff8aa8b241a3dcd16f",
])(
  "preserves legacy bucket names when upgrading original source %s",
  async (origin) => {
    const { instance, version } = await historical(origin);
    const current = await upgrade(instance, origin);
    const upgraded = await job(instance);
    const inputs = {
      acceleratorRevision: latest,
      executionBindingId: current.bindingId,
      variables: { bucket_naming: "legacy", untouched: "retained" },
    };
    await importRows(() =>
      admin.query("UPDATE lzc.application_jobs SET inputs=$1 WHERE id=$2", [
        inputs,
        upgraded,
      ]),
    );
    await migration.query(
      "SELECT lzc_auth.assert_application_execution_binding($1)",
      [upgraded],
    );
    for (const variables of [
      {},
      { bucket_naming: "project-id" },
      { bucket_naming: null },
    ]) {
      for (const operation of ["plan", "apply"]) {
        await expect(
          scoped(owner, (c) =>
            c.query(
              "INSERT INTO lzc.application_jobs(id,tenant_id,instance_id,owner_user_id,issuer_session_id,idempotency_key,operation,inputs,binding_sha256,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,now()+interval '10 minutes')",
              [
                randomUUID(),
                owner.tenantId,
                instance,
                owner.userId,
                owner.id,
                randomUUID(),
                operation,
                { ...inputs, variables },
                "a".repeat(64),
              ],
            ),
          ),
        ).rejects.toThrow("application_execution_binding_changed");
      }
      await importRows(() =>
        admin.query("UPDATE lzc.application_jobs SET inputs=$1 WHERE id=$2", [
          { ...inputs, variables },
          upgraded,
        ]),
      );
      await expect(
        scoped(owner, (c) =>
          c.query("SELECT lzc_auth.claim_application_job_grant($1,$2)", [
            owner.id,
            upgraded,
          ]),
        ),
      ).rejects.toThrow("application_execution_binding_changed");
    }
    expect(
      (
        await admin.query(
          "SELECT accelerator_revision FROM lzc.application_template_versions WHERE id=$1",
          [version],
        )
      ).rows[0].accelerator_revision,
    ).toBe(origin);
    expect((await context(instance)).originRevision).toBe(origin);
  },
);
it("keeps project-id bucket defaults available for orders originally created on modern sources", async () => {
  const { instance } = await historical(latest);
  const id = await job(instance);
  for (const variables of [{}, { bucket_naming: "project-id" }]) {
    await importRows(() =>
      admin.query("UPDATE lzc.application_jobs SET inputs=$1 WHERE id=$2", [
        { acceleratorRevision: latest, variables },
        id,
      ]),
    );
    await migration.query(
      "SELECT lzc_auth.assert_application_execution_binding($1)",
      [id],
    );
  }
});
