import { randomBytes, randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { afterAll, afterEach, beforeAll, expect, it } from "vitest";
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
let owner: Session, engineer: Session, outsider: Session;
const source = "08ac257de1548c8ec5e83dae1a79373711c3d644";
const hash = "a".repeat(64);
async function scoped<T>(
  session: Session,
  action: (c: pg.PoolClient) => Promise<T>,
) {
  const c = await runtime.connect();
  try {
    await c.query("BEGIN");
    await c.query(
      "SELECT set_config('lzc.user_id',$1,true),set_config('lzc.tenant_id',$2,true)",
      [session.userId, session.tenantId],
    );
    const result = await action(c);
    await c.query("COMMIT");
    return result;
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
}
async function imported(action: () => Promise<unknown>) {
  await admin.query("SET session_replication_role=replica");
  try {
    await action();
  } finally {
    await admin.query("SET session_replication_role=origin");
  }
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
  const dir = fileURLToPath(new URL("../apps/api/db/", import.meta.url));
  await migrate(migration, dir);
  await migrate(migration, dir);
  const store = new PostgresAuthStore(runtime);
  const session = (id: number) =>
    store.createSession({
      githubId: id,
      login: `platform-upgrade-${id}`,
      id: randomUUID(),
      hash: randomBytes(32).toString("base64url"),
      csrfToken: randomBytes(32).toString("base64url"),
      expiresAt: new Date(Date.now() + 3600000),
    });
  owner = await session(810001);
  engineer = await session(810002);
  outsider = await session(810003);
  const org = randomUUID();
  await imported(async () => {
    await admin.query(
      "UPDATE lzc.tenants SET kind='organisation',owner_user_id=NULL,organization_id=$1,organization_verified=true WHERE id=$2",
      [org, owner.tenantId],
    );
    await admin.query(
      "UPDATE lzc.memberships SET product_roles=ARRAY['application-owner'] WHERE tenant_id=$1 AND user_id=$2",
      [owner.tenantId, owner.userId],
    );
    await admin.query(
      "INSERT INTO lzc.memberships(tenant_id,user_id,role,product_roles) VALUES($1,$2,'admin',ARRAY['platform-engineer'])",
      [owner.tenantId, engineer.userId],
    );
    await admin.query(
      "UPDATE lzc_auth.sessions SET active_tenant_id=$1 WHERE id=$2",
      [owner.tenantId, engineer.id],
    );
    for (const user of [owner, engineer])
      await admin.query(
        "INSERT INTO lzc.stackit_identities(user_id,issuer,subject,email,verification_method,valid_until) VALUES($1,'https://accounts.stackit.cloud',$2,$3,'device-grant-userinfo',now()+interval '1 hour')",
        [user.userId, randomUUID(), `${user.userId}@example.test`],
      );
  });
  engineer = { ...engineer, tenantId: owner.tenantId };
}, 30000);
afterAll(async () => {
  await runtime.end();
  await migration.end();
  await admin.end();
});

// Imported historical metadata is synthetic; all public reads/acks/candidates,
// runtime Apply/material mutations and guards execute with real RLS/triggers.

afterEach(async () => {
  await imported(() =>
    admin.query(
      "UPDATE lzc.plan_runs SET status='failed',finished_at=now() WHERE owner_user_id=$1 AND operation='apply' AND status IN ('starting','initializing','validating','planning','applying')",
      [engineer.userId],
    ),
  );
});
async function platformFixture(
  classification: "ordinary" | "sensitive" | "blocked" = "sensitive",
) {
  const instance = randomUUID(),
    version = randomUUID(),
    family = randomUUID(),
    from = randomUUID(),
    to = randomUUID(),
    preparation = randomUUID(),
    plan = randomUUID(),
    backend = randomUUID(),
    profile = randomUUID();
  const stateKey = `platform-impact/${plan}`;
  const org = (
    await admin.query("SELECT organization_id FROM lzc.tenants WHERE id=$1", [
      owner.tenantId,
    ])
  ).rows[0].organization_id;
  const target = {
    folder_id: "stable-folder",
    region: "eu01",
    corporate: false,
    network_area_id: null,
    firewall_next_hop_ip: null,
    ipv4_nameservers: null,
  };
  const settings = {
    env: "dev",
    network_enabled: false,
    network_prefix_length: null,
    secretsmanager_enabled: false,
    observability: {
      enabled: false,
      plan_name: "Observability-Starter-EU01",
      acl: [],
    },
    custom_roles: [],
    role_assignments: [],
    owner_email: `${owner.userId}@example.test`,
  };
  const template = {
    id: family,
    key: "public",
    name: "Public",
    kind: "public",
    region: "eu01",
    settings,
  };
  const summary = {
    schemaVersion: 1,
    execution: "plan-only",
    applyAllowed: false,
    result: classification === "ordinary" ? "no-changes" : "changes",
    resources: {
      create: 0,
      update: classification === "ordinary" ? 0 : 1,
      delete: 0,
      replace: 0,
      read: 0,
      unchanged: 1,
    },
    destructive: false,
    completeness: "complete",
    platformImpact: {
      classification,
      reasons:
        classification === "ordinary"
          ? []
          : [
              {
                code: "platform-shared-resource-change",
                path: "resource_changes.0",
                classification,
              },
            ],
      changedResourceTypes:
        classification === "ordinary" ? [] : ["stackit_network"],
      sharedChanges: classification !== "ordinary",
    },
  };
  await imported(async () => {
    await admin.query(
      "INSERT INTO lzc.deployment_preparations(id,tenant_id,owner_user_id,name,manifest) VALUES($1,$2,$3,'Synthetic impact fixture',$4)",
      [
        preparation,
        engineer.tenantId,
        engineer.userId,
        { organization: { id: org } },
      ],
    );
    await admin.query(
      "INSERT INTO lzc.platform_states(state_key,tenant_id,owner_user_id,version,ciphertext) VALUES($1,$2,$3,1,$4)",
      [stateKey, engineer.tenantId, engineer.userId, Buffer.alloc(29, 1)],
    );
    await admin.query(
      "INSERT INTO lzc.plan_runs(id,tenant_id,owner_user_id,preparation_id,ticket_hash,mode,status,summary,artifact_sha256,state_key,state_version,finished_at,input_claimed) VALUES($1,$2,$3,$4,$5,'platform-plan','succeeded',$6,$7,$8,1,now(),true)",
      [
        plan,
        engineer.tenantId,
        engineer.userId,
        preparation,
        randomBytes(32).toString("base64url"),
        summary,
        hash,
        stateKey,
      ],
    );
    await admin.query(
      "INSERT INTO lzc.plan_artifacts(run_id,tenant_id,owner_user_id,sha256,ciphertext,summary,binding_sha256,state_key,state_version,engine_version,provider_lock_sha256,runner_droplet_id) VALUES($1,$2,$3,$4,$5,$6,$4,$7,1,'1.12.6',$4,$8)",
      [
        plan,
        engineer.tenantId,
        engineer.userId,
        hash,
        Buffer.alloc(29, 2),
        summary,
        stateKey,
        randomUUID(),
      ],
    );
    for (const revision of [from, to]) {
      const document = {
        schema_version: 1,
        tenant_id: owner.tenantId,
        revision,
        organization_id: org,
        targets: {
          public: {
            ...target,
            firewall_next_hop_ip: revision === to ? "10.0.2.7" : null,
          },
        },
      };
      await admin.query(
        "INSERT INTO lzc.application_platform_contracts(revision,tenant_id,organization_id,approved_by,credential_profile_id,credential_version,credential_key_id,credential_checked_at,document) VALUES($1,$2,$3,$4,$5,1,'key',now(),$6)",
        [revision, owner.tenantId, org, engineer.userId, profile, document],
      );
      const appliedProof = randomUUID();
      await admin.query(
        "INSERT INTO lzc.plan_runs(id,tenant_id,owner_user_id,preparation_id,ticket_hash,mode,operation,plan_id,artifact_sha256,state_key,state_version,applied_state_version,status,finished_at) VALUES($1,$2,$3,$4,$5,'platform-apply','apply',$6,$7,$8,1,1,'succeeded',now())",
        [
          appliedProof,
          engineer.tenantId,
          engineer.userId,
          preparation,
          randomBytes(32).toString("base64url"),
          randomUUID(),
          hash,
          stateKey,
        ],
      );
      await admin.query(
        "INSERT INTO lzc.application_platform_sources(revision,tenant_id,apply_run_id,state_key,state_version,source_contract_revision,document_sha256,approval_session_id,credential_profile_id,credential_version,credential_key_id) VALUES($1,$2,$3,$4,1,$5,$6,$7,$8,1,'key')",
        [
          revision,
          owner.tenantId,
          appliedProof,
          stateKey,
          randomUUID(),
          revision.replaceAll("-", "").padEnd(64, "a"),
          engineer.id,
          profile,
        ],
      );
      await admin.query(
        "INSERT INTO lzc.application_execution_delegations(id,tenant_id,platform_revision,delegated_by,credential_profile_id,credential_version,credential_key_id,backend_id,backend_identity,backend_credentials_hash) VALUES($1,$2,$3,$4,$5,1,'key',$6,'same-backend-identity','same-credentials-hash')",
        [
          randomUUID(),
          owner.tenantId,
          revision,
          engineer.userId,
          profile,
          backend,
        ],
      );
    }
    await admin.query(
      "INSERT INTO lzc.application_template_versions(id,tenant_id,template_id,version,published_by,accelerator_revision,document,platform_revision,target_key,deployment_policy) VALUES($1,$2,$3,1,$4,$5,$6,$7,'public','direct')",
      [
        version,
        owner.tenantId,
        family,
        engineer.userId,
        source,
        template,
        from,
      ],
    );
    await admin.query(
      "INSERT INTO lzc.application_instances(id,tenant_id,version_id,requested_by,idempotency_key,name,parameters,resolved_settings,qualification_blockers,deployment_policy) VALUES($1,$2,$3,$4,$5,'impacted-order','{}',$6,'[\"historical\"]','direct')",
      [instance, owner.tenantId, version, owner.userId, randomUUID(), settings],
    );
    const group = randomUUID();
    await admin.query(
      "INSERT INTO lzc.application_groups(id,tenant_id,name) VALUES($1,$2,$3)",
      [group, owner.tenantId, `platform-upgrade-${group}`],
    );
    await admin.query(
      "INSERT INTO lzc.application_group_members(tenant_id,group_id,user_id) VALUES($1,$2,$3)",
      [owner.tenantId, group, owner.userId],
    );
    await admin.query(
      "INSERT INTO lzc.application_template_groups(tenant_id,version_id,group_id) VALUES($1,$2,$3)",
      [owner.tenantId, version, group],
    );
  });
  return {
    instance,
    version,
    from,
    to,
    preparation,
    plan,
    stateKey,
    settings,
    summary,
  };
}
async function impact(
  f: Awaited<ReturnType<typeof platformFixture>>,
  session = engineer,
) {
  return scoped(
    session,
    async (c) =>
      (
        await c.query(
          "SELECT lzc_auth.platform_application_impact($1,$2) AS value",
          [session.id, f.plan],
        )
      ).rows[0].value,
  );
}
async function acknowledge(
  f: Awaited<ReturnType<typeof platformFixture>>,
  changes: Record<string, unknown> = {},
) {
  const view = await impact(f);
  return scoped(
    engineer,
    async (c) =>
      (
        await c.query(
          "SELECT lzc_auth.acknowledge_platform_application_impact($1,$2,$3,$4,$5) AS value",
          [
            engineer.id,
            f.plan,
            changes.sha ?? view.artifactSha256,
            changes.dependencies ?? view.dependencyHash,
            true,
          ],
        )
      ).rows[0].value,
  );
}
async function apply(f: Awaited<ReturnType<typeof platformFixture>>) {
  const id = randomUUID();
  await scoped(engineer, (c) =>
    c.query(
      "INSERT INTO lzc.plan_runs(id,tenant_id,owner_user_id,preparation_id,ticket_hash,mode,operation,plan_id,artifact_sha256,state_key,state_version) VALUES($1,$2,$3,$4,$5,'platform-apply','apply',$6,$7,$8,1)",
      [
        id,
        engineer.tenantId,
        engineer.userId,
        f.preparation,
        randomBytes(32).toString("base64url"),
        f.plan,
        hash,
        f.stateKey,
      ],
    ),
  );
  return id;
}
it("requires exact privileged acknowledgement before sensitive shared Apply and freezes a material receipt", async () => {
  const f = await platformFixture();
  expect(await impact(f)).toMatchObject({
    classification: "sensitive",
    blockers: [],
    acknowledged: false,
    canAcknowledge: true,
    affectedApplications: [
      { instanceId: f.instance, name: "impacted-order", targetKey: "public" },
    ],
  });
  await expect(apply(f)).rejects.toThrow(
    "platform_impact_acknowledgement_required",
  );
  await expect(acknowledge(f, { sha: "b".repeat(64) })).rejects.toThrow(
    "platform_impact_changed",
  );
  expect(await acknowledge(f)).toMatchObject({
    acknowledged: true,
    canAcknowledge: false,
  });
  const run = await apply(f);
  expect(
    (
      await admin.query(
        "SELECT plan_id,dependency_hash,state_version FROM lzc.platform_application_apply_guards WHERE run_id=$1",
        [run],
      )
    ).rows[0],
  ).toMatchObject({ plan_id: f.plan, state_version: "1" });
  await scoped(engineer, (c) =>
    c.query(
      "UPDATE lzc.plan_runs SET input_claimed=true,status='initializing' WHERE id=$1",
      [run],
    ),
  );
});
it("keeps ordinary non-mutating plans available without additional acknowledgement", async () => {
  const f = await platformFixture("ordinary");
  expect(await impact(f)).toMatchObject({
    classification: "ordinary",
    blockers: [],
    canAcknowledge: false,
  });
  await apply(f);
});
it("blocks destructive, unknown or absent shared impact evidence even after direct SQL attempts", async () => {
  for (const corruption of ["blocked", "delete", "absent"]) {
    const f = await platformFixture(
      corruption === "blocked" ? "blocked" : "sensitive",
    );
    if (corruption !== "blocked")
      await imported(() =>
        admin.query(
          "UPDATE lzc.plan_artifacts SET summary=$1 WHERE run_id=$2",
          [
            corruption === "delete"
              ? {
                  ...f.summary,
                  resources: { ...f.summary.resources, delete: 1 },
                  destructive: true,
                }
              : { ...f.summary, platformImpact: null },
            f.plan,
          ],
        ),
      );
    expect((await impact(f)).blockers.length).toBeGreaterThan(0);
    await expect(acknowledge(f)).rejects.toThrow("platform_impact_changed");
    await expect(apply(f)).rejects.toThrow();
  }
});
it("invalidates acknowledgements when Platform State or dependencies change", async () => {
  const f = await platformFixture();
  await acknowledge(f);
  await imported(() =>
    admin.query("UPDATE lzc.platform_states SET version=2 WHERE state_key=$1", [
      f.stateKey,
    ]),
  );
  await expect(apply(f)).rejects.toThrow();
  const changed = await platformFixture();
  await acknowledge(changed);
  await imported(() =>
    admin.query(
      "INSERT INTO lzc.application_instances(id,tenant_id,version_id,requested_by,idempotency_key,name,parameters,resolved_settings,qualification_blockers,deployment_policy) VALUES($1,$2,$3,$4,$5,'new-dependent-order','{}',$6,'[\"historical\"]','direct')",
      [
        randomUUID(),
        owner.tenantId,
        changed.version,
        owner.userId,
        randomUUID(),
        changed.settings,
      ],
    ),
  );
  await expect(apply(changed)).rejects.toThrow(
    "platform_impact_acknowledgement_required",
  );
});
it("keeps AO/foreign callers and runtime direct acknowledgement writes isolated", async () => {
  const f = await platformFixture();
  await expect(impact(f, owner)).rejects.toThrow();
  await expect(impact(f, outsider)).rejects.toThrow();
  await expect(
    scoped(owner, (c) =>
      c.query(
        "INSERT INTO lzc.platform_application_impact_acknowledgements(plan_id,tenant_id,artifact_sha256,dependency_hash,state_key,state_version,approved_by,issuer_session_id) VALUES($1,$2,$3,$3,$4,1,$5,$6)",
        [f.plan, owner.tenantId, hash, f.stateKey, owner.userId, owner.id],
      ),
    ),
  ).rejects.toThrow("permission denied");
});
it("preserves the same template, parameters, settings and original order when selecting a published Platform edge", async () => {
  const f = await platformFixture();
  const before = (
    await admin.query(
      "SELECT to_jsonb(i) AS value FROM lzc.application_instances i WHERE id=$1",
      [f.instance],
    )
  ).rows[0].value;
  const edge = await scoped(
    engineer,
    async (c) =>
      (
        await c.query(
          "SELECT lzc_auth.publish_application_platform_upgrade_edge($1,$2,$3,$4,true) AS value",
          [engineer.id, f.from, f.to, { sensitive: "approval-required" }],
        )
      ).rows[0].value,
  );
  const context = await scoped(
    owner,
    async (c) =>
      (
        await c.query(
          "SELECT lzc_auth.request_application_platform_upgrade($1,$2,$3,NULL,$4,true) AS value",
          [owner.id, f.instance, edge.id, f.from],
        )
      ).rows[0].value,
  );
  expect(context).toMatchObject({
    originVersionId: f.version,
    effectiveVersionId: f.version,
    effectivePlatformRevision: f.to,
    effectiveSettings: f.settings,
    effectiveParameters: {},
    candidate: {
      kind: "platform",
      platformRevision: f.to,
      versionId: f.version,
      platformEdgeId: edge.id,
    },
  });
  expect(
    (
      await admin.query(
        "SELECT to_jsonb(i) AS value FROM lzc.application_instances i WHERE id=$1",
        [f.instance],
      )
    ).rows[0].value,
  ).toEqual(before);
});
it("blocks Platform-only migration edges for a changed project placement or backend", async () => {
  const f = await platformFixture();
  const edge = await scoped(
    engineer,
    async (c) =>
      (
        await c.query(
          "SELECT lzc_auth.publish_application_platform_upgrade_edge($1,$2,$3,$4,true) AS value",
          [engineer.id, f.from, f.to, { sensitive: "approval-required" }],
        )
      ).rows[0].value,
  );
  await imported(() =>
    admin.query(
      "UPDATE lzc.application_platform_contracts SET document=jsonb_set(document,'{targets,public,folder_id}','\"other-folder\"') WHERE revision=$1",
      [f.to],
    ),
  );
  await expect(
    scoped(owner, (c) =>
      c.query(
        "SELECT lzc_auth.request_application_platform_upgrade($1,$2,$3,NULL,$4,true)",
        [owner.id, f.instance, edge.id, f.from],
      ),
    ),
  ).rejects.toThrow("application_upgrade_placement_changed");
});

it("rejects stale or locked target contract selection even after an edge was published", async () => {
  const f = await platformFixture();
  const edge = await scoped(
    engineer,
    async (c) =>
      (
        await c.query(
          "SELECT lzc_auth.publish_application_platform_upgrade_edge($1,$2,$3,$4,true) AS value",
          [engineer.id, f.from, f.to, { sensitive: "approval-required" }],
        )
      ).rows[0].value,
  );
  await imported(() =>
    admin.query("UPDATE lzc.platform_states SET version=2 WHERE state_key=$1", [
      f.stateKey,
    ]),
  );
  await expect(
    scoped(owner, (c) =>
      c.query(
        "SELECT lzc_auth.request_application_platform_upgrade($1,$2,$3,NULL,$4,true)",
        [owner.id, f.instance, edge.id, f.from],
      ),
    ),
  ).rejects.toThrow("application_upgrade_platform_changed");
  await expect(
    scoped(engineer, (c) =>
      c.query(
        "SELECT lzc_auth.publish_application_platform_upgrade_edge($1,$2,$3,$4,true)",
        [engineer.id, f.from, f.to, { sensitive: "approval-required" }],
      ),
    ),
  ).rejects.toThrow("application_platform_upgrade_edge_invalid");
  const locked = await platformFixture();
  const lockedEdge = await scoped(
    engineer,
    async (c) =>
      (
        await c.query(
          "SELECT lzc_auth.publish_application_platform_upgrade_edge($1,$2,$3,$4,true) AS value",
          [
            engineer.id,
            locked.from,
            locked.to,
            { sensitive: "approval-required" },
          ],
        )
      ).rows[0].value,
  );
  await imported(() =>
    admin.query(
      "UPDATE lzc.platform_states SET lock_run_id=$2,lock_id='synthetic-lock' WHERE state_key=$1",
      [locked.stateKey, locked.plan],
    ),
  );
  await expect(
    scoped(owner, (c) =>
      c.query(
        "SELECT lzc_auth.request_application_platform_upgrade($1,$2,$3,NULL,$4,true)",
        [owner.id, locked.instance, lockedEdge.id, locked.from],
      ),
    ),
  ).rejects.toThrow("application_upgrade_platform_changed");
});
it("rechecks the dependency set at material release and exposes active shared Apply in upgrade context", async () => {
  const f = await platformFixture();
  await acknowledge(f);
  const run = await apply(f);
  const context = await scoped(
    owner,
    async (c) =>
      (
        await c.query(
          "SELECT lzc_auth.application_upgrade_context($1,$2) AS value",
          [owner.id, f.instance],
        )
      ).rows[0].value,
  );
  expect(context.blockers).toContain("application-platform-execution-active");
  await imported(() =>
    admin.query(
      "INSERT INTO lzc.application_instances(id,tenant_id,version_id,requested_by,idempotency_key,name,parameters,resolved_settings,qualification_blockers,deployment_policy) VALUES($1,$2,$3,$4,$5,'out-of-band-fixture','{}',$6,'[\"historical\"]','direct')",
      [
        randomUUID(),
        owner.tenantId,
        f.version,
        owner.userId,
        randomUUID(),
        f.settings,
      ],
    ),
  );
  await expect(
    scoped(engineer, (c) =>
      c.query(
        "UPDATE lzc.plan_runs SET input_claimed=true,status='initializing' WHERE id=$1",
        [run],
      ),
    ),
  ).rejects.toThrow("platform_impact_changed");
});

it("allows only the acknowledged run to advance its own checkpoint and rejects foreign State ownership", async () => {
  const f = await platformFixture();
  await acknowledge(f);
  const run = await apply(f);
  await scoped(engineer, (c) =>
    c.query(
      "UPDATE lzc.plan_runs SET input_claimed=true,status='initializing' WHERE id=$1",
      [run],
    ),
  );
  await scoped(engineer, (c) =>
    c.query(
      "UPDATE lzc.platform_states SET lock_run_id=$2,lock_id='native-lock' WHERE state_key=$1",
      [f.stateKey, run],
    ),
  );
  await scoped(engineer, (c) =>
    c.query(
      "UPDATE lzc.platform_states SET version=version+1,ciphertext=$2 WHERE state_key=$1",
      [f.stateKey, Buffer.alloc(29, 3)],
    ),
  );
  expect(
    (
      await admin.query(
        "SELECT version FROM lzc.platform_states WHERE state_key=$1",
        [f.stateKey],
      )
    ).rows[0].version,
  ).toBe("2");
  await scoped(engineer, (c) =>
    c.query(
      "UPDATE lzc.platform_states SET lock_run_id=NULL,lock_id=NULL WHERE state_key=$1",
      [f.stateKey],
    ),
  );
  // No second unlocked material release may treat the changed State as the old version.
  await expect(
    scoped(engineer, (c) =>
      c.query("UPDATE lzc.plan_runs SET input_claimed=false WHERE id=$1", [
        run,
      ]),
    ),
  ).resolves.toBeDefined();
  await expect(
    scoped(engineer, (c) =>
      c.query("UPDATE lzc.plan_runs SET input_claimed=true WHERE id=$1", [run]),
    ),
  ).rejects.toThrow("platform_impact_changed");
});
it("blocks new Application admissions while the shared Platform Apply is active", async () => {
  const f = await platformFixture();
  await acknowledge(f);
  await apply(f);
  await expect(
    scoped(owner, (c) =>
      c.query(
        "INSERT INTO lzc.application_instances(id,tenant_id,version_id,requested_by,idempotency_key,name,parameters,resolved_settings,qualification_blockers,deployment_policy) VALUES($1,$2,$3,$4,$5,'concurrent-application','{}',$6,'[\"historical\"]','direct')",
        [
          randomUUID(),
          owner.tenantId,
          f.version,
          owner.userId,
          randomUUID(),
          f.settings,
        ],
      ),
    ),
  ).rejects.toThrow("application_platform_execution_active");
});
it("revalidates a dependency admitted concurrently before final Platform Apply admission", async () => {
  const f = await platformFixture();
  await acknowledge(f);
  const admitted = await runtime.connect();
  let applying: Promise<string> | undefined;
  try {
    await admitted.query("BEGIN");
    await admitted.query(
      "SELECT set_config('lzc.user_id',$1,true),set_config('lzc.tenant_id',$2,true)",
      [owner.userId, owner.tenantId],
    );
    await admitted.query(
      "INSERT INTO lzc.application_instances(id,tenant_id,version_id,requested_by,idempotency_key,name,parameters,resolved_settings,qualification_blockers,deployment_policy) VALUES($1,$2,$3,$4,$5,'concurrently-admitted','{}',$6,'[\"historical\"]','direct')",
      [
        randomUUID(),
        owner.tenantId,
        f.version,
        owner.userId,
        randomUUID(),
        f.settings,
      ],
    );
    applying = apply(f);
    let settled = false;
    void applying.then(
      () => {
        settled = true;
      },
      () => {
        settled = true;
      },
    );
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(settled).toBe(false);
    await admitted.query("COMMIT");
    await expect(applying).rejects.toThrow(
      "platform_impact_acknowledgement_required",
    );
  } finally {
    await admitted.query("ROLLBACK");
    admitted.release();
    if (applying) await applying.catch(() => {});
  }
});
it("rejects a previously valid acknowledgement after PE membership is revoked", async () => {
  const f = await platformFixture();
  await acknowledge(f);
  await imported(() =>
    admin.query(
      "UPDATE lzc.memberships SET product_roles=ARRAY['application-owner'] WHERE tenant_id=$1 AND user_id=$2",
      [engineer.tenantId, engineer.userId],
    ),
  );
  try {
    await expect(apply(f)).rejects.toThrow();
  } finally {
    await imported(() =>
      admin.query(
        "UPDATE lzc.memberships SET product_roles=ARRAY['platform-engineer'] WHERE tenant_id=$1 AND user_id=$2",
        [engineer.tenantId, engineer.userId],
      ),
    );
  }
});

it("exposes only tenant-authorized current Platform eligibility, not private proof", async () => {
  const f = await platformFixture();
  const read = (session: typeof owner, revision: string) =>
    scoped(
      session,
      async (c) =>
        (
          await c.query(
            "SELECT lzc_auth.application_upgrade_platform_current($1,$2) AS value",
            [session.id, revision],
          )
        ).rows[0].value,
    );
  expect(await read(owner, f.to)).toBe(true);
  expect(await read(owner, randomUUID())).toBe(false);
  expect(await read(outsider, f.to)).toBe(false);
  await imported(() =>
    admin.query("UPDATE lzc.platform_states SET version=2 WHERE state_key=$1", [
      f.stateKey,
    ]),
  );
  expect(await read(owner, f.to)).toBe(false);
});

it("persists and unlocks the live job checkpoint after browser expiry without issuing fresh material", async () => {
  const f = await platformFixture();
  await acknowledge(f);
  const run = await apply(f);
  await scoped(engineer, (c) =>
    c.query(
      "UPDATE lzc.plan_runs SET input_claimed=true,status='initializing' WHERE id=$1",
      [run],
    ),
  );
  await scoped(engineer, (c) =>
    c.query(
      "UPDATE lzc.platform_states SET lock_run_id=$2,lock_id='native-lock' WHERE state_key=$1",
      [f.stateKey, run],
    ),
  );
  const previous = (
    await admin.query("SELECT expires_at FROM lzc_auth.sessions WHERE id=$1", [
      engineer.id,
    ])
  ).rows[0].expires_at;
  await imported(() =>
    admin.query(
      "UPDATE lzc_auth.sessions SET expires_at=now()-interval '1 second' WHERE id=$1",
      [engineer.id],
    ),
  );
  try {
    await scoped(engineer, (c) =>
      c.query(
        "UPDATE lzc.platform_states SET version=version+1,ciphertext=$2 WHERE state_key=$1",
        [f.stateKey, Buffer.alloc(29, 4)],
      ),
    );
    await scoped(engineer, (c) =>
      c.query(
        "UPDATE lzc.platform_states SET lock_run_id=NULL,lock_id=NULL WHERE state_key=$1",
        [f.stateKey],
      ),
    );
    expect(
      (
        await admin.query(
          "SELECT version,lock_run_id FROM lzc.platform_states WHERE state_key=$1",
          [f.stateKey],
        )
      ).rows[0],
    ).toMatchObject({ version: "2", lock_run_id: null });
    await expect(apply(f)).rejects.toThrow();
  } finally {
    await imported(() =>
      admin.query("UPDATE lzc_auth.sessions SET expires_at=$2 WHERE id=$1", [
        engineer.id,
        previous,
      ]),
    );
  }
});

it("preserves personal deployer Platform authorization when no Applications depend on the plan", async () => {
  const f = await platformFixture();
  const org = (
    await admin.query("SELECT organization_id FROM lzc.tenants WHERE id=$1", [
      engineer.tenantId,
    ])
  ).rows[0].organization_id;
  await imported(async () => {
    await admin.query("DELETE FROM lzc.application_instances WHERE id=$1", [
      f.instance,
    ]);
    await admin.query(
      "UPDATE lzc.tenants SET kind='personal',owner_user_id=$2,organization_id=NULL WHERE id=$1",
      [engineer.tenantId, owner.userId],
    );
    await admin.query(
      "UPDATE lzc.memberships SET role='deployer',manage_members=false,product_roles='{}' WHERE tenant_id=$1 AND user_id=$2",
      [engineer.tenantId, engineer.userId],
    );
  });
  try {
    expect(await impact(f)).toMatchObject({
      classification: "ordinary",
      affectedApplications: [],
      blockers: [],
      canAcknowledge: false,
    });
    const run = await apply(f);
    await scoped(engineer, (c) =>
      c.query("UPDATE lzc.plan_runs SET input_claimed=true WHERE id=$1", [run]),
    );
  } finally {
    await imported(async () => {
      await admin.query(
        "UPDATE lzc.tenants SET kind='organisation',owner_user_id=NULL,organization_id=$2 WHERE id=$1",
        [engineer.tenantId, org],
      );
      await admin.query(
        "UPDATE lzc.memberships SET role='admin',product_roles=ARRAY['platform-engineer'] WHERE tenant_id=$1 AND user_id=$2",
        [engineer.tenantId, engineer.userId],
      );
    });
  }
});
