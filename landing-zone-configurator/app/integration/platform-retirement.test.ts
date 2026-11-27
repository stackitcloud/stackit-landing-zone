import {
  createHash,
  generateKeyPairSync,
  randomBytes,
  randomUUID,
} from "node:crypto";
import { fileURLToPath } from "node:url";
import {
  retirementInventory,
  retirementPlanProjection,
  retirementStateSha256,
  verifyRetirementApply,
  verifyRetirementPlan,
} from "@lzc/contracts/recovery";
import { createEditorConfiguration, editCommonInput } from "@lzc/domain";
import pg from "pg";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { PostgresAuthStore, type Session } from "../apps/api/src/auth/store.js";
import { Configurations } from "../apps/api/src/configurations/service.js";
import { Backends } from "../apps/api/src/deployments/backends.js";
import { ArtifactCrypto } from "../apps/api/src/plans/crypto.js";
import { RetirementCapture } from "../apps/api/src/retirements/capture.js";
import { RetirementExecution } from "../apps/api/src/retirements/execution.js";
import { RetirementPreparation } from "../apps/api/src/retirements/preparation.js";
import { Retirements } from "../apps/api/src/retirements/service.js";
import { RetirementStartSource } from "../apps/api/src/retirements/start-source.js";
import { withTenant } from "../apps/api/src/storage/database.js";
import { migrate } from "../apps/api/src/storage/migrations.js";
import { StackitRetirementCloud } from "../packages/contracts/src/recovery/retirement-cloud.js";
import { parseServiceAccountKey } from "../packages/contracts/src/recovery/service-account.js";
import { inWorkspace } from "./fixture-workspace.js";

const address = process.env.LZC_TEST_DATABASE_URL;
if (!address) throw Error("LZC_TEST_DATABASE_URL required");
const url = new URL(address);
if (
  !["127.0.0.1", "localhost"].includes(url.hostname) ||
  url.pathname !== "/configurator_test"
)
  throw Error("Refusing non-local test database");
const admin = new pg.Client({ connectionString: address });
const config = {
  host: url.hostname,
  port: Number(url.port),
  database: "configurator_test",
  user: "configurator_migration",
  password: "migration-test-only",
};
const migration = new pg.Client(config);
const runtime = new pg.Pool({
  ...config,
  user: "configurator_app",
  password: "runtime-test-only",
});
const service = new Retirements(runtime);
let owner: Session;
let outsider: Session;
let sequence = Math.floor(Math.random() * 1000000000) + 1000000000;
async function user() {
  return inWorkspace(
    runtime,
    await new PostgresAuthStore(runtime).createSession({
      githubId: ++sequence,
      login: `retirement-${sequence}`,
      id: randomUUID(),
      hash: randomBytes(32).toString("base64url"),
      csrfToken: randomBytes(32).toString("base64url"),
      expiresAt: new Date(Date.now() + 3600000),
    }),
  );
}
async function imported(work: () => Promise<void>) {
  await admin.query("SET session_replication_role=replica");
  try {
    await work();
  } finally {
    await admin.query("SET session_replication_role=origin");
  }
}
async function fixture() {
  const stateKey = `retirement/${randomUUID()}/terraform.tfstate`,
    revision = randomUUID(),
    preparation = randomUUID(),
    run = randomUUID(),
    folder = randomUUID(),
    version = randomUUID(),
    instance = randomUUID();
  const org = (
    await admin.query("SELECT organization_id FROM lzc.tenants WHERE id=$1", [
      owner.tenantId,
    ])
  ).rows[0].organization_id;
  await imported(async () => {
    await admin.query(
      "INSERT INTO lzc.deployment_preparations(id,tenant_id,owner_user_id,name,manifest) VALUES($1,$2,$3,'Fixture',$4)",
      [
        preparation,
        owner.tenantId,
        owner.userId,
        { organization: { id: org } },
      ],
    );
    await admin.query(
      "INSERT INTO lzc.plan_runs(id,tenant_id,owner_user_id,preparation_id,ticket_hash,status,mode,cleaned,finished_at) VALUES($1,$2,$3,$4,$5,'succeeded','platform-plan',true,now())",
      [run, owner.tenantId, owner.userId, preparation, randomUUID()],
    );
    await admin.query(
      "INSERT INTO lzc.platform_states(state_key,tenant_id,owner_user_id,version,ciphertext) VALUES($1,$2,$3,1,$4)",
      [stateKey, owner.tenantId, owner.userId, Buffer.alloc(29)],
    );
    await admin.query(
      "INSERT INTO lzc.application_platform_contracts(revision,tenant_id,organization_id,approved_by,credential_profile_id,credential_version,credential_key_id,credential_checked_at,document) VALUES($1,$2,$3,$4,$5,1,'fixture',now(),$6)",
      [
        revision,
        owner.tenantId,
        org,
        owner.userId,
        randomUUID(),
        {
          tenant_id: owner.tenantId,
          revision,
          organization_id: org,
          targets: { public: { folder_id: folder } },
        },
      ],
    );
    await admin.query(
      "INSERT INTO lzc.application_platform_sources(revision,tenant_id,apply_run_id,state_key,state_version,source_contract_revision,document_sha256,approval_session_id,credential_profile_id,credential_version,credential_key_id) VALUES($1,$2,$3,$4,1,$1,$5,$6,$7,1,'fixture')",
      [
        revision,
        owner.tenantId,
        run,
        stateKey,
        "a".repeat(64),
        owner.id,
        randomUUID(),
      ],
    );
    await admin.query(
      "INSERT INTO lzc.application_template_versions(id,tenant_id,template_id,version,published_by,accelerator_revision,document,platform_revision,target_key) VALUES($1,$2,$3,1,$4,$5,'{}',$6,'public')",
      [
        version,
        owner.tenantId,
        randomUUID(),
        owner.userId,
        "a".repeat(40),
        revision,
      ],
    );
    await admin.query(
      "INSERT INTO lzc.application_instances(id,tenant_id,version_id,requested_by,idempotency_key,name,parameters,resolved_settings,qualification_blockers) VALUES($1,$2,$3,$4,$5,'Disposable application','{}','{}',jsonb_build_array('fixture'))",
      [instance, owner.tenantId, version, owner.userId, randomUUID()],
    );
  });
  return { stateKey, revision, preparation, run, folder, version, instance };
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
  owner = await user();
  outsider = await user();
  await imported(async () => {
    await admin.query(
      "UPDATE lzc.tenants SET organization_verified=true WHERE id=$1",
      [owner.tenantId],
    );
    await admin.query(
      "INSERT INTO lzc.stackit_identities(user_id,issuer,subject,email,verification_method,valid_until) VALUES($1::uuid,'https://accounts.stackit.cloud',$1::text,'owner@example.com','device-grant-userinfo',now()+interval '1 hour')",
      [owner.userId],
    );
    await admin.query(
      "INSERT INTO lzc.stackit_organization_access(tenant_id,user_id,organization_id,organization_name,valid_until) SELECT id,$2,organization_id,'Fixture',now()+interval '1 hour' FROM lzc.tenants WHERE id=$1",
      [owner.tenantId, owner.userId],
    );
  });
}, 30000);
afterAll(async () => {
  await runtime.end();
  await migration.end();
  await admin.end();
});

async function standalonePlatform() {
  const f = await fixture();
  const crypto = new ArtifactCrypto(randomBytes(32).toString("base64"));
  const apply = randomUUID();
  const document = Buffer.from(
    JSON.stringify({
      version: 4,
      serial: 1,
      lineage: randomUUID(),
      resources: [
        {
          module: "module.governance",
          mode: "managed",
          type: "stackit_resourcemanager_folder",
          name: "this",
          provider: 'provider["registry.opentofu.org/stackitcloud/stackit"]',
          instances: [
            { index_key: "platform", attributes: { folder_id: f.folder } },
          ],
        },
      ],
    }),
  );
  await imported(async () => {
    await admin.query("DELETE FROM lzc.application_instances WHERE id=$1", [
      f.instance,
    ]);
    await admin.query(
      "DELETE FROM lzc.application_template_versions WHERE id=$1",
      [f.version],
    );
    await admin.query(
      "DELETE FROM lzc.application_platform_sources WHERE revision=$1",
      [f.revision],
    );
    await admin.query(
      "DELETE FROM lzc.application_platform_contracts WHERE revision=$1",
      [f.revision],
    );
    await admin.query(
      "UPDATE lzc.platform_states SET ciphertext=$2,stable_aad=true WHERE state_key=$1",
      [
        f.stateKey,
        crypto.encrypt(
          document,
          owner.tenantId,
          f.stateKey,
          `state:${f.stateKey}`,
        ),
      ],
    );
    await admin.query(
      "INSERT INTO lzc.plan_runs(id,tenant_id,owner_user_id,preparation_id,ticket_hash,status,mode,operation,plan_id,artifact_sha256,state_key,state_version,applied_state_version,cleaned,finished_at) VALUES($1,$2,$3,$4,$5,'succeeded','platform-apply','apply',$6,$7,$8,1,1,true,now())",
      [
        apply,
        owner.tenantId,
        owner.userId,
        f.preparation,
        randomUUID(),
        f.run,
        "a".repeat(64),
        f.stateKey,
      ],
    );
  });
  const backends = new Backends(runtime, crypto);
  const source = new RetirementStartSource(runtime, crypto, backends);
  return {
    ...f,
    apply,
    crypto,
    document,
    source,
    backends,
    retirements: new Retirements(runtime, source),
  };
}

it("retires an applied platform without Application binding or contract outputs and freezes its native folders", async () => {
  const f = await standalonePlatform();
  expect(
    (await f.retirements.candidates(owner)).some(
      (c) => c.stateKey === f.stateKey,
    ),
  ).toBe(true);
  await expect(f.source.read(outsider, f.stateKey)).rejects.toMatchObject({
    code: "42501",
  });
  const entry = await f.retirements.start(owner, {
    stateKey: f.stateKey,
    reason: "Platform-only retirement",
    confirmRetirement: true,
  });
  expect(entry.applications).toEqual([]);
  expect(
    (await f.retirements.candidates(owner)).some(
      (c) => c.stateKey === f.stateKey,
    ),
  ).toBe(false);
  expect(
    (
      await admin.query(
        "SELECT identity FROM lzc.retirement_scopes WHERE retirement_id=$1 AND kind='parent'",
        [entry.id],
      )
    ).rows,
  ).toEqual([{ identity: f.folder }]);
  await expect(
    admin.query(
      "INSERT INTO lzc.application_platform_contracts(revision,tenant_id,organization_id,approved_by,credential_profile_id,credential_version,credential_key_id,credential_checked_at,document) SELECT $1,id,organization_id,$2,$3,1,'fixture',now(),$4 FROM lzc.tenants WHERE id=$5",
      [
        randomUUID(),
        owner.userId,
        randomUUID(),
        { targets: { public: { folder_id: f.folder } } },
        owner.tenantId,
      ],
    ),
  ).rejects.toMatchObject({ message: "retirement_admission_closed" });
  expect(
    await new RetirementCapture(runtime, f.crypto, f.backends).capture(
      owner,
      entry.id,
      entry.generation,
    ),
  ).toMatchObject({ scopeCount: 1 });
  expect(
    (
      await admin.query(
        "SELECT count(*)::int count FROM lzc.application_platform_sources WHERE state_key=$1",
        [f.stateKey],
      )
    ).rows[0].count,
  ).toBe(0);
});

it("accepts a verified completed S3 migration marker but rejects unproven or mismatched migrations", async () => {
  const f = await standalonePlatform(),
    backend = randomUUID();
  await imported(async () => {
    await admin.query(
      "INSERT INTO lzc.state_backends(id,tenant_id,descriptor,identity_sha256,credentials_ciphertext) VALUES($1,$2,'{}',$3,$4)",
      [backend, owner.tenantId, randomUUID(), Buffer.alloc(29)],
    );
    await admin.query(
      "UPDATE lzc.platform_states SET backend_id=$2,pending_backend_id=$2,migration_run_id=$3,migration_version=0,migration_sha256=$4,ciphertext=NULL,remote_identity=$4 WHERE state_key=$1",
      [f.stateKey, backend, f.apply, "a".repeat(64)],
    );
  });
  const runner = vi
    .spyOn(f.backends, "runner")
    .mockResolvedValue({} as Awaited<ReturnType<Backends["runner"]>>);
  const remote = vi
    .spyOn(f.backends, "current")
    .mockResolvedValue({ bytes: f.document, identity: "version-1" } as Awaited<
      ReturnType<Backends["current"]>
    >);
  const entry = await f.retirements.start(owner, {
    stateKey: f.stateKey,
    reason: "Completed migration",
    confirmRetirement: true,
  });
  expect(runner).toHaveBeenCalledWith(expect.anything(), owner, backend);
  expect(remote).toHaveBeenCalledTimes(2);
  expect(
    await new RetirementCapture(runtime, f.crypto, f.backends).capture(
      owner,
      entry.id,
      entry.generation,
    ),
  ).toMatchObject({ scopeCount: 1 });
  const context = () =>
    withTenant(
      runtime,
      owner,
      async (client) =>
        (
          await client.query(
            "SELECT lzc_auth.retirement_capture_context($1,$2,$3) AS value",
            [owner.id, entry.id, entry.generation],
          )
        ).rows[0].value,
    );
  expect((await context()).root.backendId).toBe(backend);
  runner.mockRestore();
  remote.mockRestore();
  await imported(() =>
    admin
      .query(
        "UPDATE lzc.platform_states SET migration_sha256=NULL WHERE state_key=$1",
        [f.stateKey],
      )
      .then(() => {}),
  );
  await expect(context()).rejects.toMatchObject({
    message: "retirement_state_unavailable",
  });
  await imported(() =>
    admin
      .query(
        "UPDATE lzc.platform_states SET migration_sha256=$2,pending_backend_id=NULL WHERE state_key=$1",
        [f.stateKey, "a".repeat(64)],
      )
      .then(() => {}),
  );
  await expect(context()).rejects.toMatchObject({
    message: "retirement_state_unavailable",
  });
});

it("excludes failed, stale and locked Applies and revalidates the State after the server-side read", async () => {
  const f = await standalonePlatform();
  for (const change of ["status='failed'", "applied_state_version=2"]) {
    await imported(() =>
      admin
        .query(`UPDATE lzc.plan_runs SET ${change} WHERE id=$1`, [f.apply])
        .then(() => {}),
    );
    expect(
      (await f.retirements.candidates(owner)).some(
        (c) => c.stateKey === f.stateKey,
      ),
    ).toBe(false);
    await expect(f.source.read(owner, f.stateKey)).rejects.toMatchObject({
      message: "retirement_state_unavailable",
    });
    await imported(() =>
      admin
        .query(
          "UPDATE lzc.plan_runs SET status='succeeded',applied_state_version=1 WHERE id=$1",
          [f.apply],
        )
        .then(() => {}),
    );
  }
  await imported(() =>
    admin
      .query(
        "UPDATE lzc.platform_states SET lock_run_id=$2,lock_id='held' WHERE state_key=$1",
        [f.stateKey, f.apply],
      )
      .then(() => {}),
  );
  expect(
    (await f.retirements.candidates(owner)).some(
      (c) => c.stateKey === f.stateKey,
    ),
  ).toBe(false);
  await imported(() =>
    admin
      .query(
        "UPDATE lzc.platform_states SET lock_run_id=NULL,lock_id=NULL WHERE state_key=$1",
        [f.stateKey],
      )
      .then(() => {}),
  );
  const racing = new Retirements(runtime, {
    read: async (session, key) => {
      const result = await f.source.read(session, key);
      await imported(() =>
        admin
          .query(
            "UPDATE lzc.platform_states SET version=2 WHERE state_key=$1",
            [key],
          )
          .then(() => {}),
      );
      return result;
    },
  });
  await expect(
    racing.start(owner, {
      stateKey: f.stateKey,
      reason: "Racing writer",
      confirmRetirement: true,
    }),
  ).rejects.toMatchObject({ message: "retirement_state_unavailable" });
  expect(
    (
      await admin.query(
        "SELECT count(*)::int count FROM lzc.platform_retirements WHERE state_key=$1",
        [f.stateKey],
      )
    ).rows[0].count,
  ).toBe(0);
});
it("persists scope, seven-day notice and recipient; does not expose another workspace", async () => {
  const f = await fixture(),
    before = Date.now();
  const r = await service.start(owner, {
    stateKey: f.stateKey,
    reason: "Test",
    confirmRetirement: true,
  });
  expect(r.phase).toBe("RETIRING");
  expect(Date.parse(r.notBefore) - before).toBeGreaterThan(6.99 * 86400000);
  expect(r.applications).toEqual([
    {
      id: f.instance,
      name: "Disposable application",
      requestedBy: owner.userId,
    },
  ]);
  expect(
    (
      await admin.query(
        "SELECT count(*)::int count FROM lzc_auth.notifications WHERE event_key LIKE $1 AND kind='retirement-announced'",
        [`${r.id}:%`],
      )
    ).rows[0].count,
  ).toBe(1);
  const scheduled = await service.change(owner, r.id, {
    generation: r.generation,
    action: "reschedule",
    notBefore: new Date(Date.now() + 2 * 86400000).toISOString(),
  });
  expect(scheduled.generation).toBe(r.generation + 1);
  expect(Date.parse(scheduled.notBefore) - Date.now()).toBeLessThanOrEqual(
    2 * 86400000,
  );
  expect(
    (
      await admin.query(
        "SELECT count(*)::int count FROM lzc_auth.notifications WHERE event_key LIKE $1 AND kind='retirement-announced'",
        [`${r.id}:%`],
      )
    ).rows[0].count,
  ).toBe(2);
  await expect(
    service.change(owner, r.id, { generation: r.generation, action: "pause" }),
  ).rejects.toMatchObject({ code: "40001" });
  expect(await service.list(outsider)).toEqual([]);
  await expect(
    service.start(outsider, {
      stateKey: f.stateKey,
      reason: "Foreign",
      confirmRetirement: true,
    }),
  ).rejects.toMatchObject({ code: "42501" });
});
it("blocks new orders and platform jobs in SQL, without losing readable retirement records", async () => {
  const f = await fixture();
  await service.start(owner, {
    stateKey: f.stateKey,
    reason: "Freeze",
    confirmRetirement: true,
  });
  await expect(
    withTenant(runtime, owner, (c) =>
      c.query(
        "INSERT INTO lzc.application_instances(id,tenant_id,version_id,requested_by,idempotency_key,name,parameters,resolved_settings,qualification_blockers) VALUES($1,$2,$3,$4,$5,'New order','{}','{}',jsonb_build_array('fixture'))",
        [randomUUID(), owner.tenantId, f.version, owner.userId, randomUUID()],
      ),
    ),
  ).rejects.toMatchObject({ message: "retirement_admission_closed" });
  await expect(
    withTenant(runtime, owner, (c) =>
      c.query(
        "INSERT INTO lzc.plan_runs(id,tenant_id,owner_user_id,preparation_id,ticket_hash,mode,state_key,state_version) VALUES($1,$2,$3,$4,$5,'platform-plan',$6,1)",
        [
          randomUUID(),
          owner.tenantId,
          owner.userId,
          f.preparation,
          randomUUID(),
          f.stateKey,
        ],
      ),
    ),
  ).rejects.toMatchObject({ message: "retirement_admission_closed" });
  expect(
    (await service.list(owner)).some((r) => r.stateKey === f.stateKey),
  ).toBe(true);
});
it("rejects stale generation and cancels only an undisturbed non-destructive retirement", async () => {
  const f = await fixture();
  let r = await service.start(owner, {
    stateKey: f.stateKey,
    reason: "Pause",
    confirmRetirement: true,
  });
  const original = r.generation;
  r = await service.change(owner, r.id, {
    generation: r.generation,
    action: "pause",
  });
  expect(r.phase).toBe("PAUSED");
  await expect(
    service.change(owner, r.id, { generation: original, action: "resume" }),
  ).rejects.toMatchObject({ message: "retirement_changed" });
  r = await service.change(owner, r.id, {
    generation: r.generation,
    action: "resume",
  });
  expect(r.phase).toBe("RETIRING");
  r = await service.change(owner, r.id, {
    generation: r.generation,
    action: "cancel",
  });
  expect(r.phase).toBe("CANCELLED");
});

it("blocks an old unclaimed Platform ticket and leaves the retirement draining until its runner outcome is reconciled", async () => {
  const f = await fixture(),
    run = randomUUID();
  await admin.query(
    "INSERT INTO lzc.plan_runs(id,tenant_id,owner_user_id,preparation_id,ticket_hash,mode,state_key,state_version) VALUES($1,$2,$3,$4,$5,'platform-plan',$6,1)",
    [
      run,
      owner.tenantId,
      owner.userId,
      f.preparation,
      randomUUID(),
      f.stateKey,
    ],
  );
  let r = await service.start(owner, {
    stateKey: f.stateKey,
    reason: "Drain stale ticket",
    confirmRetirement: true,
  });
  await expect(
    withTenant(runtime, owner, (c) =>
      c.query(
        "UPDATE lzc.plan_runs SET input_claimed=true,status='initializing' WHERE id=$1",
        [run],
      ),
    ),
  ).rejects.toMatchObject({ message: "retirement_admission_closed" });
  r = await service.change(owner, r.id, {
    generation: r.generation,
    action: "inspect",
  });
  expect(r.phase).toBe("DRAINING");
  expect(r.blockers).toContain("retirement-platform-writer-unresolved");
  await expect(
    service.change(owner, r.id, { generation: r.generation, action: "cancel" }),
  ).rejects.toMatchObject({ message: "retirement_transition_unavailable" });
});

it("refuses a fresh imported contract for a captured folder, even without source provenance", async () => {
  const f = await fixture();
  await service.start(owner, {
    stateKey: f.stateKey,
    reason: "No import bypass",
    confirmRetirement: true,
  });
  const revision = randomUUID(),
    org = (
      await admin.query("SELECT organization_id FROM lzc.tenants WHERE id=$1", [
        owner.tenantId,
      ])
    ).rows[0].organization_id;
  await expect(
    withTenant(runtime, owner, (c) =>
      c.query(
        "INSERT INTO lzc.application_platform_contracts(revision,tenant_id,organization_id,approved_by,credential_profile_id,credential_version,credential_key_id,credential_checked_at,document) VALUES($1,$2,$3,$4,$5,1,'fixture',now(),$6)",
        [
          revision,
          owner.tenantId,
          org,
          owner.userId,
          randomUUID(),
          {
            tenant_id: owner.tenantId,
            revision,
            organization_id: org,
            targets: { renamed: { folder_id: f.folder } },
          },
        ],
      ),
    ),
  ).rejects.toMatchObject({ message: "retirement_admission_closed" });
});

it("refuses to merge two distinct States with the same exported folder into one retirement", async () => {
  const f = await fixture(),
    other = await fixture();
  await imported(async () => {
    await admin.query(
      "UPDATE lzc.application_platform_contracts SET document=jsonb_set(document,'{targets,public,folder_id}',to_jsonb($2::text)) WHERE revision=$1",
      [other.revision, f.folder],
    );
  });
  await expect(
    service.start(owner, {
      stateKey: f.stateKey,
      reason: "Ambiguous ownership",
      confirmRetirement: true,
    }),
  ).rejects.toMatchObject({
    message: "retirement_shared_scope_requires_review",
  });
});

it("keeps the inbox notice after order archive and preserves an explicit email opt-out", async () => {
  const f = await fixture();
  await runtime.query(
    "SELECT lzc_auth.notification_preferences($1,$2,'en','{}'::text[])",
    [owner.id, owner.tenantId],
  );
  const r = await service.start(owner, {
    stateKey: f.stateKey,
    reason: "Retained notice",
    confirmRetirement: true,
  });
  await imported(async () => {
    await admin.query(
      "INSERT INTO lzc.application_order_deletions(instance_id,tenant_id,deleted_by) VALUES($1,$2,$3)",
      [f.instance, owner.tenantId, owner.userId],
    );
  });
  const value = (
    await runtime.query("SELECT lzc_auth.notification_list($1,$2) AS value", [
      owner.id,
      owner.tenantId,
    ])
  ).rows[0].value;
  expect(
    value.items.some(
      (n: { kind: string; resourceId: string }) =>
        n.kind === "retirement-announced" && n.resourceId === r.id,
    ),
  ).toBe(true);
  const prefs = (
    await runtime.query(
      "SELECT lzc_auth.notification_preferences($1,$2) AS value",
      [owner.id, owner.tenantId],
    )
  ).rows[0].value;
  expect(prefs.emailTopics).toEqual([]);
});

it("does not invalidate a current generation merely by inspecting status", async () => {
  const f = await fixture();
  const r = await service.start(owner, {
    stateKey: f.stateKey,
    reason: "Read status",
    confirmRetirement: true,
  });
  const inspected = await service.change(owner, r.id, {
    generation: r.generation,
    action: "inspect",
  });
  expect(inspected.generation).toBe(r.generation);
});
it("keeps pre-retirement Application plans unusable after cancellation, including new Apply children and late credential release", async () => {
  const f = await fixture(),
    plan = randomUUID();
  await imported(async () => {
    await admin.query(
      "INSERT INTO lzc.application_jobs(id,tenant_id,instance_id,owner_user_id,issuer_session_id,idempotency_key,operation,inputs,binding_sha256,expires_at) VALUES($1,$2,$3,$4,$5,$6,'plan',$7,$8,now()+interval '20 minutes')",
      [
        plan,
        owner.tenantId,
        f.instance,
        owner.userId,
        owner.id,
        randomUUID(),
        { purpose: "destroy" },
        "a".repeat(64),
      ],
    );
  });
  let r = await service.start(owner, {
    stateKey: f.stateKey,
    reason: "Invalidate old plans",
    confirmRetirement: true,
  });
  r = await service.change(owner, r.id, {
    generation: r.generation,
    action: "cancel",
  });
  expect(r.phase).toBe("CANCELLED");
  await expect(
    withTenant(runtime, owner, (c) =>
      c.query("SELECT lzc_auth.assert_retirement_job_release($1)", [plan]),
    ),
  ).rejects.toMatchObject({ message: "retirement_admission_closed" });
  await expect(
    withTenant(runtime, owner, (c) =>
      c.query(
        "INSERT INTO lzc.application_jobs(id,tenant_id,instance_id,owner_user_id,issuer_session_id,idempotency_key,operation,inputs,binding_sha256,expires_at,plan_id,artifact_sha256) VALUES($1,$2,$3,$4,$5,$6,'apply',$7,$8,now()+interval '20 minutes',$9,$8)",
        [
          randomUUID(),
          owner.tenantId,
          f.instance,
          owner.userId,
          owner.id,
          randomUUID(),
          { purpose: "destroy" },
          "a".repeat(64),
          plan,
        ],
      ),
    ),
  ).rejects.toMatchObject({ message: "retirement_admission_closed" });
});

it("orders the freeze against final Plan admission without deadlocking a State row already locked by that Plan", async () => {
  const f = await fixture(),
    client = await runtime.connect();
  let pending: ReturnType<typeof service.start> | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await client.query("BEGIN");
    await client.query(
      "SELECT set_config('lzc.user_id',$1,true),set_config('lzc.tenant_id',$2,true)",
      [owner.userId, owner.tenantId],
    );
    await client.query(
      "SELECT * FROM lzc.platform_states WHERE state_key=$1 FOR UPDATE",
      [f.stateKey],
    );
    pending = service.start(owner, {
      stateKey: f.stateKey,
      reason: "Concurrent final admission",
      confirmRetirement: true,
    });
    const r = await Promise.race([
      pending,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error("Retirement waited on the Plan State lock")),
          3000,
        );
      }),
    ]);
    expect(r.phase).toBe("RETIRING");
    await expect(
      client.query(
        "INSERT INTO lzc.plan_runs(id,tenant_id,owner_user_id,preparation_id,ticket_hash,mode,state_key,state_version) VALUES($1,$2,$3,$4,$5,'platform-plan',$6,1)",
        [
          randomUUID(),
          owner.tenantId,
          owner.userId,
          f.preparation,
          randomUUID(),
          f.stateKey,
        ],
      ),
    ).rejects.toMatchObject({ message: "retirement_admission_closed" });
  } finally {
    if (timer) clearTimeout(timer);
    await client.query("ROLLBACK");
    client.release();
    if (pending) await pending;
  }
});

it("captures an encrypted same-State inventory without granting execution, and keeps requester attribution", async () => {
  const scope = await fixture();
  const crypto = new ArtifactCrypto(randomBytes(32).toString("base64"));
  const document = Buffer.from(
    JSON.stringify({
      version: 4,
      lineage: randomUUID(),
      serial: 3,
      resources: [
        {
          module: "module.management",
          mode: "managed",
          type: "stackit_resourcemanager_project",
          name: "this",
          provider: 'provider["registry.opentofu.org/stackitcloud/stackit"]',
          instances: [
            {
              attributes: {
                project_id: randomUUID(),
                private_value: "PRIVATE_STATE_SENTINEL",
              },
            },
          ],
        },
      ],
    }),
  );
  await imported(async () => {
    await admin.query(
      "UPDATE lzc.platform_states SET ciphertext=$2,stable_aad=true WHERE state_key=$1",
      [
        scope.stateKey,
        crypto.encrypt(
          document,
          owner.tenantId,
          scope.stateKey,
          `state:${scope.stateKey}`,
        ),
      ],
    );
    await admin.query(
      "INSERT INTO lzc.plan_runs(id,tenant_id,owner_user_id,preparation_id,ticket_hash,status,mode,operation,plan_id,artifact_sha256,state_key,state_version,applied_state_version,cleaned,finished_at) VALUES($1,$2,$3,$4,$5,'succeeded','platform-apply','apply',$6,$7,$8,1,1,true,now())",
      [
        randomUUID(),
        owner.tenantId,
        owner.userId,
        scope.preparation,
        randomUUID(),
        scope.run,
        "a".repeat(64),
        scope.stateKey,
      ],
    );
  });
  const entry = await service.start(owner, {
    stateKey: scope.stateKey,
    reason: "Capture qualification",
    confirmRetirement: true,
  });
  const capture = new RetirementCapture(
    runtime,
    crypto,
    new Backends(runtime, crypto),
  );
  await expect(
    capture.capture(outsider, entry.id, entry.generation),
  ).rejects.toMatchObject({ code: "42501" });
  expect(await capture.capture(owner, entry.id, entry.generation)).toEqual({
    retirementId: entry.id,
    generation: entry.generation,
    scopeCount: 1,
  });
  await capture.capture(owner, entry.id, entry.generation);
  const rows = await admin.query(
    "SELECT * FROM lzc.retirement_inventories WHERE retirement_id=$1",
    [entry.id],
  );
  expect(rows.rowCount).toBe(1);
  const row = rows.rows[0];
  expect(row.captured_by).toBe(owner.userId);
  expect(row.instance_id).toBeNull();
  for (const key of [
    "state_ciphertext",
    "inventory_ciphertext",
    "source_ciphertext",
  ])
    expect(row[key].toString()).not.toContain("PRIVATE_STATE_SENTINEL");
  const aad = `retirement:${entry.id}:${entry.generation}:${scope.stateKey}`;
  expect(
    crypto.decrypt(
      row.state_ciphertext,
      owner.tenantId,
      entry.id,
      `${aad}:state`,
    ),
  ).toEqual(document);
  expect(
    crypto
      .decrypt(
        row.inventory_ciphertext,
        owner.tenantId,
        entry.id,
        `${aad}:inventory`,
      )
      .toString(),
  ).not.toContain("PRIVATE_STATE_SENTINEL");
  await expect(
    withTenant(runtime, owner, (client) =>
      client.query(
        "DELETE FROM lzc.retirement_inventories WHERE retirement_id=$1",
        [entry.id],
      ),
    ),
  ).rejects.toMatchObject({ code: "42501" });
  await service.change(owner, entry.id, {
    generation: entry.generation,
    action: "pause",
  });
  await expect(
    capture.capture(owner, entry.id, entry.generation),
  ).rejects.toMatchObject({ code: "40001" });
  expect(
    (await service.list(owner)).find((r) => r.id === entry.id)?.phase,
  ).toBe("PAUSED");
});

it("transfers only a captured same-State scope to independent encrypted custody and keeps the old factory fenced", async () => {
  const scope = await fixture(),
    crypto = new ArtifactCrypto(randomBytes(32).toString("base64")),
    profile = randomUUID(),
    project = randomUUID(),
    control = randomUUID(),
    subject = randomUUID();
  const org = (
    await admin.query("SELECT organization_id FROM lzc.tenants WHERE id=$1", [
      owner.tenantId,
    ])
  ).rows[0].organization_id;
  const applicationProject = randomUUID(),
    applicationBackend = randomUUID(),
    applicationPlan = randomUUID(),
    applicationApply = randomUUID();
  const applicationDocument = Buffer.from(
    JSON.stringify({
      version: 4,
      lineage: randomUUID(),
      serial: 1,
      resources: [
        {
          mode: "managed",
          type: "terraform_data",
          name: "contract",
          provider: 'provider["terraform.io/builtin/terraform"]',
          instances: [
            {
              attributes: {
                id: randomUUID(),
                input: { secret: "not-public" },
                output: { secret: "not-public" },
              },
            },
          ],
        },
        {
          mode: "managed",
          type: "stackit_resourcemanager_project",
          name: "this",
          provider: 'provider["registry.opentofu.org/stackitcloud/stackit"]',
          instances: [{ attributes: { project_id: applicationProject } }],
        },
      ],
    }),
  );
  const applicationDescriptor = {
    useLockfile: true,
    bucket: "retirement-fixture",
    key: `applications/${owner.tenantId}/${scope.instance}/terraform.tfstate`,
    region: "eu01",
    endpoint: "https://object.storage.eu01.onstackit.cloud",
  };
  const document = Buffer.from(
    JSON.stringify({
      version: 4,
      lineage: randomUUID(),
      serial: 1,
      resources: [
        {
          module: "module.governance",
          mode: "managed",
          type: "stackit_resourcemanager_folder",
          name: "this",
          provider: 'provider["registry.opentofu.org/stackitcloud/stackit"]',
          instances: [
            { index_key: "platform", attributes: { folder_id: scope.folder } },
          ],
        },
        {
          module: "module.management",
          mode: "managed",
          type: "stackit_resourcemanager_project",
          name: "this",
          provider: 'provider["registry.opentofu.org/stackitcloud/stackit"]',
          instances: [{ attributes: { project_id: project } }],
        },
      ],
    }),
  );
  const key = parseServiceAccountKey({
    projectId: control,
    credentials: {
      kid: "handoff-fixture-key",
      iss: "handoff-fixture@sa.stackit.cloud",
      sub: subject,
      aud: "https://accounts.stackit.cloud",
      privateKey: generateKeyPairSync("rsa", { modulusLength: 2048 })
        .privateKey.export({ type: "pkcs8", format: "pem" })
        .toString(),
    },
  });
  await imported(async () => {
    await admin.query(
      "UPDATE lzc.platform_states SET ciphertext=$2,stable_aad=true WHERE state_key=$1",
      [
        scope.stateKey,
        crypto.encrypt(
          document,
          owner.tenantId,
          scope.stateKey,
          `state:${scope.stateKey}`,
        ),
      ],
    );
    await admin.query(
      "INSERT INTO lzc.plan_runs(id,tenant_id,owner_user_id,preparation_id,ticket_hash,status,mode,operation,plan_id,artifact_sha256,state_key,state_version,applied_state_version,cleaned,finished_at) VALUES($1,$2,$3,$4,$5,'succeeded','platform-apply','apply',$6,$7,$8,1,1,true,now())",
      [
        randomUUID(),
        owner.tenantId,
        owner.userId,
        scope.preparation,
        randomUUID(),
        scope.run,
        "a".repeat(64),
        scope.stateKey,
      ],
    );
    await admin.query(
      "INSERT INTO lzc.credential_profiles(id,tenant_id,owner_user_id,name,service_account,key_id,state) VALUES($1,$2,$3,'Cleanup fixture',$4,$5,'stored')",
      [
        profile,
        owner.tenantId,
        owner.userId,
        key.credentials.iss,
        key.credentials.kid,
      ],
    );
  });
  let configuration = createEditorConfiguration("standalone", randomUUID());
  configuration = editCommonInput(configuration, "organization_id", org);
  configuration = editCommonInput(configuration, "rm_folders", {
    platform: {
      name: "retirement-fixture",
      description: null,
      owner_emails: [],
      reader_emails: [],
    },
  });
  await imported(async () => {
    await admin.query(
      "UPDATE lzc.deployment_preparations SET manifest=$2 WHERE id=$1",
      [
        scope.preparation,
        {
          organization: { id: org },
          accelerator: { commit: "a".repeat(40) },
          configuration,
        },
      ],
    );
  });
  await imported(async () => {
    await admin.query(
      "UPDATE lzc.application_instances SET requested_by=$2 WHERE id=$1",
      [scope.instance, outsider.userId],
    );
    await admin.query(
      "INSERT INTO lzc.state_backends(id,tenant_id,descriptor,identity_sha256,credentials_ciphertext) VALUES($1,$2,$3,$4,$5)",
      [
        applicationBackend,
        owner.tenantId,
        applicationDescriptor,
        "b".repeat(64),
        crypto.encrypt(
          Buffer.from(
            JSON.stringify({
              accessKeyId: "fixture-access",
              secretAccessKey: "fixture-secret",
            }),
          ),
          owner.tenantId,
          applicationBackend,
          `backend:${applicationBackend}`,
        ),
      ],
    );
    const inputs = {
      acceleratorRevision: "2b581f23dd40ccd4425e5e9efd93fb2c44cc8f8a",
      variables: {
        application: { name: "requester-application" },
        platform_contract: {},
      },
    };
    for (const [id, operation, parent] of [
      [applicationPlan, "plan", null],
      [applicationApply, "apply", applicationPlan],
    ] as const) {
      await admin.query(
        "INSERT INTO lzc.application_jobs(id,tenant_id,instance_id,owner_user_id,issuer_session_id,idempotency_key,operation,inputs,binding_sha256,expires_at,plan_id,artifact_sha256) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,now()+interval '1 hour',$10,$11)",
        [
          id,
          owner.tenantId,
          scope.instance,
          outsider.userId,
          outsider.id,
          randomUUID(),
          operation,
          inputs,
          "a".repeat(64),
          parent,
          parent ? "c".repeat(64) : null,
        ],
      );
    }
    await admin.query(
      "INSERT INTO lzc.application_dispatches(job_id,tenant_id,instance_id,owner_user_id,approved_by,approval_session_id,status,finished_at) VALUES($1,$2,$3,$4,$5,$6,'succeeded',now())",
      [
        applicationApply,
        owner.tenantId,
        scope.instance,
        outsider.userId,
        owner.userId,
        owner.id,
      ],
    );
    await admin.query(
      "INSERT INTO lzc.application_job_backends(job_id,tenant_id,owner_user_id,approved_by,approval_session_id,backend_id,descriptor,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,now()+interval '1 hour')",
      [
        applicationApply,
        owner.tenantId,
        outsider.userId,
        owner.userId,
        owner.id,
        applicationBackend,
        applicationDescriptor,
      ],
    );
  });
  const capturedBackends = new Backends(
    runtime,
    crypto,
    async (_backend, path) =>
      path.endsWith(".tflock")
        ? null
        : { bytes: applicationDocument, identity: "fixture-state-1" },
  );
  const entry = await service.start(owner, {
    stateKey: scope.stateKey,
    reason: "Independent control qualification",
    notBefore: new Date(Date.now() + 1000).toISOString(),
    confirmRetirement: true,
  });
  const orgParent = {
    id: org,
    containerId: "org-fixture",
    type: "ORGANIZATION",
  };
  const nativeProject = {
    projectId: project,
    containerId: "project-fixture",
    parent: { id: scope.folder, containerId: "folder-fixture", type: "FOLDER" },
    lifecycleState: "ACTIVE",
  };
  const calls: { url: string; method: string }[] = [];
  let newForeignChild = false;
  const foreignProject = randomUUID();
  const cloud = new StackitRetirementCloud(async (address, init) => {
    const url = new URL(String(address));
    calls.push({ url: url.toString(), method: init?.method ?? "GET" });
    const value =
      url.hostname === "accounts.stackit.cloud"
        ? { access_token: "private-fixture-token", token_type: "Bearer" }
        : url.pathname === `/v2/organizations/${org}`
          ? { organizationId: org, lifecycleState: "ACTIVE" }
          : url.pathname === `/v2/projects/${control}`
            ? {
                projectId: control,
                containerId: "control-fixture",
                parent: orgParent,
                lifecycleState: "ACTIVE",
              }
            : [
                  `/v2/projects/${project}`,
                  `/v2/projects/${applicationProject}`,
                ].includes(url.pathname)
              ? {
                  ...nativeProject,
                  projectId: url.pathname.endsWith(applicationProject)
                    ? applicationProject
                    : project,
                }
              : url.pathname === `/v2/folders/${scope.folder}`
                ? {
                    folderId: scope.folder,
                    containerId: "folder-fixture",
                    parent: orgParent,
                  }
                : url.pathname.endsWith("/service-accounts")
                  ? {
                      items: [
                        {
                          id: subject,
                          email: key.credentials.iss,
                          projectId: control,
                        },
                      ],
                    }
                  : url.pathname === "/v2/projects"
                    ? {
                        items: [
                          ...(newForeignChild
                            ? [{ ...nativeProject, projectId: foreignProject }]
                            : []),
                          nativeProject,
                          { ...nativeProject, projectId: applicationProject },
                        ],
                        limit: 100,
                        offset: 0,
                      }
                    : null;
    if (!value) throw Error("Unexpected fixture request");
    return new Response(JSON.stringify(value), {
      headers: { "content-type": "application/json" },
    });
  });
  const prepare = new RetirementPreparation(
    runtime,
    crypto,
    capturedBackends,
    {
      verifyForPreparation: async () => ({
        check: {
          status: "passed",
          organizationId: org,
          organizationName: "Fixture",
          checkedAt: new Date().toISOString(),
          code: "organization_readable",
        },
        version: 1,
        keyId: key.credentials.kid,
      }),
    },
    {
      get: async () => ({ key, version: 1 }),
      put: async () => {},
      remove: async () => {},
    },
    cloud,
    [control],
    { retirementEnabled: true, supportsRetirement: () => true },
  );
  const input = {
    generation: entry.generation,
    credentialProfileId: profile,
    confirmStateHandoff: true,
    confirmCleanupPermissionsSurvive: true,
  };
  await expect(prepare.prepare(owner, entry.id, input)).rejects.toMatchObject({
    code: "retirement_preparation_window",
  });
  expect(calls).toEqual([]);
  await new Promise((resolve) => setTimeout(resolve, 1100));
  expect(
    await prepare.homeProject(owner, entry.id, {
      generation: entry.generation,
      credentialProfileId: profile,
    }),
  ).toMatchObject({ credentialProfileId: profile, projectId: control });
  await expect(
    prepare.homeProject(outsider, entry.id, {
      generation: entry.generation,
      credentialProfileId: profile,
    }),
  ).rejects.toMatchObject({ code: "42501" });
  await expect(
    prepare.prepare(owner, entry.id, {
      ...input,
      cleanupProjectId: randomUUID(),
    }),
  ).rejects.toMatchObject({ code: "retirement_cleanup_identity_unverified" });
  const result = await prepare.prepare(owner, entry.id, input);
  expect(result.scopeCount).toBe(2);
  const rows = await admin.query(
    "SELECT * FROM lzc.retirement_execution_scopes WHERE retirement_id=$1",
    [entry.id],
  );
  expect(rows.rowCount).toBe(2);
  const rootHandoff = rows.rows.find((row) => row.scope_key === scope.stateKey);
  expect(rootHandoff).toBeDefined();
  const applicationHandoff = rows.rows.find(
    (row) => row.instance_id === scope.instance,
  );
  expect(applicationHandoff.requested_by).toBe(outsider.userId);
  expect(applicationHandoff.created_by).toBe(owner.userId);
  expect(
    crypto.decrypt(
      rootHandoff.current_state_ciphertext,
      owner.tenantId,
      entry.id,
      `retirement-state:${rootHandoff.id}`,
    ),
  ).toEqual(document);
  await expect(
    service.change(owner, entry.id, {
      generation: entry.generation,
      action: "cancel",
    }),
  ).rejects.toMatchObject({
    code: "55000",
    message: "retirement_control_handoff_committed",
  });
  await expect(
    withTenant(runtime, outsider, (client) =>
      client.query("SELECT lzc_auth.retirement_execution_context($1,$2,$3)", [
        outsider.id,
        entry.id,
        entry.generation,
      ]),
    ),
  ).rejects.toMatchObject({ code: "42501" });
  // Exercise the actual database authority, encrypted custody, runner broker,
  // saved-artifact approval and partial purge wait with a synthetic native driver.
  const tickets = new Map<string, string>(),
    pack = randomUUID();
  let nativePlan: unknown;
  const profiles = {
    verifyForPreparation: async () => ({
      check: {
        status: "passed" as const,
        organizationId: org,
        organizationName: "Fixture",
        checkedAt: new Date().toISOString(),
        code: "organization_readable" as const,
      },
      version: 1,
      keyId: key.credentials.kid,
    }),
  };
  const execution = new RetirementExecution(
    runtime,
    crypto,
    profiles,
    {
      get: async () => ({ key, version: 1 }),
      put: async () => {},
      remove: async () => {},
    },
    cloud,
    [control],
    {
      retirementEnabled: true,
      supportsRetirement: () => true,
      supportsArtifact: (id) => id === pack,
      isStopped: async () => true,
      preview: async () => nativePlan,
      start: async (id, ticket, _origin, record) => {
        await record(randomUUID(), pack);
        tickets.set(id, ticket);
      },
      remove: async () => {},
    },
    "http://localhost:3000",
  );
  const captured = await execution.review(owner, entry.id);
  expect(captured.scopes).toHaveLength(2);
  expect(captured.prepared).toBe(true);
  expect(JSON.stringify(captured)).not.toMatch(
    /ciphertext|privateKey|handoff-fixture-key/,
  );
  let executionScope = captured.scopes.find((s) => s.instanceId === null)!.id;
  const rootScopeId = executionScope,
    applicationScopeId = captured.scopes.find(
      (s) => s.instanceId === scope.instance,
    )!.id;
  await expect(
    execution.plan(owner, entry.id, {
      generation: entry.generation,
      scopeId: rootScopeId,
    }),
  ).rejects.toMatchObject({ message: "retirement_applications_pending" });
  executionScope = applicationScopeId;
  newForeignChild = true;
  await expect(
    execution.plan(owner, entry.id, {
      generation: entry.generation,
      scopeId: executionScope,
    }),
  ).rejects.toMatchObject({ code: "retirement_foreign_child" });
  newForeignChild = false;

  const waitTicket = async (id: string) => {
    for (let i = 0; i < 50 && !tickets.has(id); i++)
      await new Promise((r) => setTimeout(r, 10));
    return tickets.get(id)!;
  };
  const artifact = Buffer.from("synthetic saved native plan"),
    artifactHash = createHash("sha256").update(artifact).digest("hex");
  const planFor = (state: unknown, phase: string) => ({
    format_version: "1.0",
    complete: true,
    errored: false,
    resource_changes: retirementInventory(state, {
      includePrivate: true,
    }).resources.map((resource) => ({
      address: resource.address,
      mode: "managed",
      type: resource.type,
      change: {
        actions: [
          phase === "remove_projects" &&
          resource.address.startsWith("module.governance.")
            ? "no-op"
            : "delete",
        ],
        before: {
          [resource.type === "stackit_resourcemanager_folder"
            ? "folder_id"
            : resource.type === "stackit_resourcemanager_project"
              ? "project_id"
              : "id"]: resource.id,
        },
      },
    })),
  });
  const createPlan = async () => {
    const job = await execution.plan(owner, entry.id, {
        generation: entry.generation,
        scopeId: executionScope,
      }),
      ticket = await waitTicket(job.id),
      input = await execution.input(ticket);
    expect(input.key).toEqual(key);
    const nativeOutput = {
      text: "$ tofu init\nInitializing the backend...\n",
      truncated: false,
    };
    await execution.output(ticket, nativeOutput);
    expect(await execution.jobOutput(owner, entry.id, job.id)).toEqual(
      nativeOutput,
    );
    await expect(
      execution.jobOutput(outsider, entry.id, job.id),
    ).rejects.toMatchObject({ code: "42501" });
    await expect(
      execution.output(ticket, {
        text: "x".repeat(2 * 1024 * 1024 + 1),
        truncated: false,
      }),
    ).rejects.toThrow();
    expect(input.protectedProjectIds).toContain(control);
    const state = await execution.state(ticket, "read");
    nativePlan = planFor(state, input.phase);
    await execution.stage(ticket, "validating");
    await execution.stage(ticket, "planning");
    await execution.artifact(ticket, {
      data: artifact.toString("base64"),
      sha256: artifactHash,
      projection: retirementPlanProjection(nativePlan),
      planSha256: verifyRetirementPlan(
        nativePlan,
        input.before,
        input.baseline,
        input.phase,
      ).planSha256,
    });
    await execution.result(ticket, { status: "succeeded" });
    await expect(
      execution.output(ticket, {
        text: "late output must not replace evidence",
        truncated: false,
      }),
    ).rejects.toMatchObject({ code: "42501" });
    expect(await execution.jobOutput(owner, entry.id, job.id)).toEqual(
      nativeOutput,
    );
    expect(
      (await execution.review(owner, entry.id)).jobs.find(
        (j) => j.id === job.id,
      )?.canApply,
    ).toBe(false);
    await execution.inspect(owner, entry.id, job.id, entry.generation);
    expect(
      (await execution.review(owner, entry.id)).jobs.find(
        (j) => j.id === job.id,
      )?.canApply,
    ).toBe(true);
    await expect(execution.input(ticket)).rejects.toMatchObject({
      code: "40001",
    });
    return job;
  };
  const runApply = async (planId: string, succeeded: boolean) => {
    const job = await execution.apply(owner, entry.id, planId, {
        generation: entry.generation,
        artifactSha256: artifactHash,
        confirmDestroyResources: true,
        confirmDataRetentionReviewed: true,
      }),
      ticket = await waitTicket(job.id),
      input = await execution.input(ticket);
    expect(input.plan?.sha256).toBe(artifactHash);
    await execution.stage(ticket, "validating");
    await execution.stage(ticket, "applying");
    const before = (await execution.state(ticket, "read")) as {
      serial: number;
      resources: Array<{ module?: string }>;
    };
    const after = succeeded
      ? {
          ...before,
          serial: before.serial + 1,
          resources:
            input.phase === "remove_projects"
              ? before.resources.filter((r) => r.module === "module.governance")
              : [],
        }
      : before;
    await execution.state(ticket, "lock", undefined, "retirement-fixture-lock");
    await expect(
      execution.state(ticket, "write", after, "wrong-lock"),
    ).rejects.toMatchObject({ code: "40001" });
    await execution.state(ticket, "write", after, "retirement-fixture-lock");
    await execution.state(
      ticket,
      "unlock",
      undefined,
      "retirement-fixture-lock",
    );
    const receipt = verifyRetirementApply(
      input.before,
      retirementInventory(after, { includePrivate: true }),
      verifyRetirementPlan(
        nativePlan,
        input.before,
        input.baseline,
        input.phase,
      ).deletes,
      succeeded,
    );
    await execution.result(ticket, {
      status: succeeded ? "succeeded" : "failed",
      stateSha256: retirementStateSha256(after),
      removed: receipt.removed,
      completedDeletes: receipt.removed.map((r) => r.address),
      errorCode: succeeded ? null : "retirement_folder_purge_pending",
    });
    expect(
      (
        await runtime.query(
          "SELECT lzc_auth.runner_cleanup_disposition($1,$2,'plan') AS result",
          [
            job.id,
            (
              await admin.query(
                "SELECT runner_app_id FROM lzc.retirement_jobs WHERE id=$1",
                [job.id],
              )
            ).rows[0].runner_app_id,
          ],
        )
      ).rows[0].result,
    ).toBe("protected");
    return execution.inspect(owner, entry.id, job.id, entry.generation);
  };
  const applicationRetirementPlan = await createPlan();
  const applicationRemoved = await runApply(applicationRetirementPlan.id, true);
  expect(
    applicationRemoved.scopes.find((s) => s.id === applicationScopeId)?.stage,
  ).toBe("complete");
  expect(
    (
      await admin.query(
        "SELECT deleted_by FROM lzc.application_order_deletions WHERE instance_id=$1",
        [scope.instance],
      )
    ).rows[0].deleted_by,
  ).toBe(owner.userId);
  expect(
    (
      await admin.query(
        "SELECT owner_user_id FROM lzc.application_jobs WHERE id=$1",
        [applicationApply],
      )
    ).rows[0].owner_user_id,
  ).toBe(outsider.userId);
  executionScope = rootScopeId;
  const stoppedPlan = await execution.plan(owner, entry.id, {
      generation: entry.generation,
      scopeId: executionScope,
    }),
    stoppedTicket = await waitTicket(stoppedPlan.id);
  await execution.input(stoppedTicket);
  const cleared = await execution.inspect(
    owner,
    entry.id,
    stoppedPlan.id,
    entry.generation,
  );
  expect(cleared.jobs.find((j) => j.id === stoppedPlan.id)).toMatchObject({
    status: "failed",
    nativeStatus: null,
    errorCode: "retirement_plan_outcome_unconfirmed",
  });
  await expect(
    execution.stage(stoppedTicket, "validating"),
  ).rejects.toMatchObject({ code: "40001" });
  await expect(execution.state(stoppedTicket, "read")).rejects.toMatchObject({
    code: "42501",
  });
  const interruptedPlan = await createPlan();
  const interrupted = await execution.apply(
    owner,
    entry.id,
    interruptedPlan.id,
    {
      generation: entry.generation,
      artifactSha256: artifactHash,
      confirmDestroyResources: true,
      confirmDataRetentionReviewed: true,
    },
  );
  const interruptedTicket = await waitTicket(interrupted.id),
    interruptedInput = await execution.input(interruptedTicket);
  await execution.stage(interruptedTicket, "validating");
  await execution.stage(interruptedTicket, "applying");
  const interruptedBefore = (await execution.state(
    interruptedTicket,
    "read",
  )) as { serial: number; resources: Array<{ module?: string }> };
  const interruptedState = {
    ...interruptedBefore,
    serial: interruptedBefore.serial + 1,
    resources: interruptedBefore.resources.filter(
      (r) => r.module === "module.governance",
    ),
  };
  await execution.result(interruptedTicket, {
    status: "failed",
    recoveryRequired: true,
    errorCode: "retirement_apply_outcome_unconfirmed",
  });
  await expect(
    execution.inspect(owner, entry.id, interrupted.id, entry.generation),
  ).rejects.toMatchObject({ code: "retirement_recovery_upload_pending" });
  const interruptedBytes = Buffer.from(JSON.stringify(interruptedState)),
    recoveryHash = createHash("sha256").update(interruptedBytes).digest("hex");
  expect(
    await execution.recovery(interruptedTicket, {
      data: interruptedBytes.toString("base64"),
      sha256: recoveryHash,
    }),
  ).toEqual({ accepted: true });
  // Recovery acknowledgements remain idempotent even when the input authority has expired.
  await admin.query(
    "UPDATE lzc.retirement_jobs SET expires_at=now()-interval '1 second' WHERE id=$1",
    [interrupted.id],
  );
  expect(
    await execution.recovery(interruptedTicket, {
      data: interruptedBytes.toString("base64"),
      sha256: recoveryHash,
    }),
  ).toEqual({ accepted: true });
  const recoveryPreview = await execution.recoveryReview(
    owner,
    entry.id,
    interrupted.id,
  );
  expect(recoveryPreview.removed).toHaveLength(1);
  await expect(
    execution.adoptRecovery(owner, entry.id, interrupted.id, {
      generation: entry.generation,
      sha256: recoveryHash,
      confirmStoppedStateRecovery: true,
      confirmFreshPlanRequired: true,
    }),
  ).rejects.toMatchObject({ code: "retirement_reconciliation_required" });
  await expect(
    execution.inspect(owner, entry.id, interrupted.id, entry.generation),
  ).rejects.toMatchObject({ code: "retirement_reconciliation_required" });
  await expect(
    execution.adoptRecovery(owner, entry.id, interrupted.id, {
      generation: entry.generation,
      sha256: "0".repeat(64),
      confirmStoppedStateRecovery: true,
      confirmFreshPlanRequired: true,
    }),
  ).rejects.toMatchObject({ code: "retirement_state_changed" });
  const reconciled = await execution.adoptRecovery(
    owner,
    entry.id,
    interrupted.id,
    {
      generation: entry.generation,
      sha256: recoveryHash,
      confirmStoppedStateRecovery: true,
      confirmFreshPlanRequired: true,
    },
  );
  expect(
    reconciled.jobs.find((j) => j.id === interrupted.id)?.nativeStatus,
  ).toBe("failed");
  expect(reconciled.scopes.find((s) => s.id === rootScopeId)?.stage).toBe(
    "remove_projects",
  );
  expect(interruptedInput.before.resources).toHaveLength(2);
  const first = await createPlan();
  await expect(
    execution.apply(outsider, entry.id, first.id, {
      generation: entry.generation,
      artifactSha256: artifactHash,
      confirmDestroyResources: true,
      confirmDataRetentionReviewed: true,
    }),
  ).rejects.toMatchObject({ code: "42501" });
  const projectsRemoved = await runApply(first.id, true);
  expect(projectsRemoved.scopes.find((s) => s.id === rootScopeId)?.stage).toBe(
    "finalize_folders",
  );
  expect(
    (await service.list(owner)).find((r) => r.id === entry.id)?.phase,
  ).toBe("WAITING_FOR_PURGE");
  const folderPlan = await createPlan(),
    waiting = await runApply(folderPlan.id, false);
  expect(waiting.jobs.find((j) => j.operation === "apply")?.nativeStatus).toBe(
    "failed",
  );
  expect(
    (await service.list(owner)).find((r) => r.id === entry.id)?.phase,
  ).toBe("WAITING_FOR_PURGE");
  const finalPlan = await createPlan(),
    finished = await runApply(finalPlan.id, true);
  expect(finished.scopes.find((s) => s.id === rootScopeId)?.stage).toBe(
    "complete",
  );
  expect(
    (await service.list(owner)).find((r) => r.id === entry.id)?.phase,
  ).toBe("COMPLETE");
  expect(
    calls
      .filter((call) => call.method !== "GET")
      .every((call) => new URL(call.url).hostname === "accounts.stackit.cloud"),
  ).toBe(true);
});

it("keeps a retired platform configuration until its archived Application resources have actually been destroyed", async () => {
  const f = await fixture();
  const configurations = new Configurations(runtime);
  const saved = await configurations.create(
    owner,
    createEditorConfiguration("standalone", randomUUID()),
  );
  await imported(async () => {
    await admin.query(
      "UPDATE lzc.platform_states SET configuration_id=$2 WHERE state_key=$1",
      [f.stateKey, saved.id],
    );
    await admin.query(
      "INSERT INTO lzc.platform_retirements(tenant_id,state_key,organization_id,created_by,name,reason,phase,not_before,applications) SELECT tenant_id,state_key,(SELECT organization_id FROM lzc.tenants WHERE id=$1),$3,'Completed fixture','Test','COMPLETE',now(),'[]' FROM lzc.platform_states WHERE state_key=$2",
      [owner.tenantId, f.stateKey, owner.userId],
    );
  });
  const apply = async (
    purpose: "standard" | "destroy",
    status: "failed" | "succeeded",
  ) => {
    const plan = randomUUID(),
      job = randomUUID();
    await imported(async () => {
      for (const [id, operation] of [
        [plan, "plan"],
        [job, "apply"],
      ] as const) {
        await admin.query(
          "INSERT INTO lzc.application_jobs(id,tenant_id,instance_id,owner_user_id,issuer_session_id,idempotency_key,operation,inputs,binding_sha256,expires_at,plan_id,artifact_sha256) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,now()+interval '1 hour',$10,$11)",
          [
            id,
            owner.tenantId,
            f.instance,
            owner.userId,
            owner.id,
            randomUUID(),
            operation,
            { purpose },
            "a".repeat(64),
            operation === "apply" ? plan : null,
            operation === "apply" ? "a".repeat(64) : null,
          ],
        );
      }
      await admin.query(
        "INSERT INTO lzc.application_job_grants(job_id,tenant_id,owner_user_id,instance_id,version_id,platform_revision,approved_by,organization_id,credential_profile_id,credential_version,credential_key_id,accelerator_revision,state_key,operation,binding_sha256,expires_at) SELECT $1,tenant_id,$2,$3,$4,revision,$2,organization_id,credential_profile_id,credential_version,credential_key_id,'08ac257de1548c8ec5e83dae1a79373711c3d644',$5,'apply',$6,now()-interval '1 minute' FROM lzc.application_platform_contracts WHERE revision=$7",
        [
          job,
          owner.userId,
          f.instance,
          f.version,
          `applications/${owner.tenantId}/${f.instance}/terraform.tfstate`,
          "a".repeat(64),
          f.revision,
        ],
      );
      await admin.query(
        "INSERT INTO lzc.application_dispatches(job_id,tenant_id,instance_id,owner_user_id,approved_by,approval_session_id,status,finished_at) VALUES($1,$2,$3,$4,$4,$5,$6,now())",
        [job, owner.tenantId, f.instance, owner.userId, owner.id, status],
      );
    });
  };
  await apply("standard", "failed");
  await imported(() =>
    admin
      .query(
        "INSERT INTO lzc.application_order_deletions(instance_id,tenant_id,deleted_by) VALUES($1,$2,$3)",
        [f.instance, owner.tenantId, owner.userId],
      )
      .then(() => {}),
  );
  expect((await configurations.get(owner, saved.id)).deletionBlocker).toBe(
    "instance_exists",
  );
  await expect(configurations.remove(owner, saved.id, 1)).rejects.toMatchObject(
    { code: "55000", message: "configuration_instance_exists" },
  );
  await apply("destroy", "failed");
  await expect(configurations.remove(owner, saved.id, 1)).rejects.toMatchObject(
    { code: "55000", message: "configuration_instance_exists" },
  );
  await apply("destroy", "succeeded");
  expect((await configurations.get(owner, saved.id)).canDelete).toBe(true);
  await configurations.remove(owner, saved.id, 1);
  expect(
    (
      await admin.query(
        "SELECT id FROM lzc.application_instances WHERE id=$1",
        [f.instance],
      )
    ).rowCount,
  ).toBe(1);
});
