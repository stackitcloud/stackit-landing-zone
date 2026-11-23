import { randomBytes, randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { afterAll, beforeAll, expect, it } from "vitest";
import { PostgresAuthStore, type Session } from "../apps/api/src/auth/store.js";
import { Retirements } from "../apps/api/src/retirements/service.js";
import { withTenant } from "../apps/api/src/storage/database.js";
import { migrate } from "../apps/api/src/storage/migrations.js";
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
  return { stateKey, revision, preparation, folder, version, instance };
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

it("orders the freeze against final Plan admission without deadlocking a State row already locked by that Plan",async()=>{
 const f=await fixture(),client=await runtime.connect();
 let pending:ReturnType<typeof service.start>|undefined;
 let timer:ReturnType<typeof setTimeout>|undefined;
 try {
  await client.query('BEGIN');
  await client.query("SELECT set_config('lzc.user_id',$1,true),set_config('lzc.tenant_id',$2,true)",[owner.userId,owner.tenantId]);
  await client.query('SELECT * FROM lzc.platform_states WHERE state_key=$1 FOR UPDATE',[f.stateKey]);
  pending=service.start(owner,{stateKey:f.stateKey,reason:'Concurrent final admission',confirmRetirement:true});
  const r=await Promise.race([pending,new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new Error('Retirement waited on the Plan State lock')),3000);})]);
  expect(r.phase).toBe('RETIRING');
  await expect(client.query("INSERT INTO lzc.plan_runs(id,tenant_id,owner_user_id,preparation_id,ticket_hash,mode,state_key,state_version) VALUES($1,$2,$3,$4,$5,'platform-plan',$6,1)",[randomUUID(),owner.tenantId,owner.userId,f.preparation,randomUUID(),f.stateKey])).rejects.toMatchObject({message:'retirement_admission_closed'});
 }finally{
  if(timer)clearTimeout(timer);
  await client.query('ROLLBACK');client.release();
  if(pending)await pending;
 }
});
