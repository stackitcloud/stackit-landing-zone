import { createHash, randomBytes, randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import {
  type ApplicationUpgradeSafety,
  classifyApplicationUpgradePlan,
} from "@lzc/contracts";
import pg from "pg";
import { afterAll, beforeAll, expect, it } from "vitest";
import { PostgresAuthStore, type Session } from "../apps/api/src/auth/store.js";
import { ArtifactCrypto } from "../apps/api/src/plans/crypto.js";
import { migrate } from "../apps/api/src/storage/migrations.js";

const crypto = new ArtifactCrypto(randomBytes(32).toString("base64"));

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
      login: `upgrade-${id}`,
      id: randomUUID(),
      hash: randomBytes(32).toString("base64url"),
      csrfToken: randomBytes(32).toString("base64url"),
      expiresAt: new Date(Date.now() + 3600000),
    });
  owner = await session(800001);
  engineer = await session(800002);
  outsider = await session(800003);
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
async function fixture(
  options: {
    policy?: "direct" | "approval-required";
    targetPolicy?: "direct" | "approval-required";
    fromSource?: string;
    settings?: Record<string, unknown>;
    targetSettings?: Record<string, unknown>;
  } = {},
) {
  const instance = randomUUID(),
    from = randomUUID(),
    to = randomUUID(),
    family = randomUUID(),
    platform = randomUUID(),
    backend = randomUUID(),
    profile = randomUUID();
  const descriptor = {
    bucket: `fixture-${backend}`,
    endpoint: "https://object.storage.eu01.onstackit.cloud" as const,
    region: "eu01" as const,
    key: "platform/terraform.tfstate",
    useLockfile: true as const,
  };
  const credentials = {
    accessKeyId: "isolated-access",
    secretAccessKey: "isolated-secret",
  };
  const ciphertext = crypto.encrypt(
    Buffer.from(JSON.stringify(credentials)),
    owner.tenantId,
    backend,
    `backend:${backend}`,
  );
  const backendIdentity = createHash("sha256").update(backend).digest("hex");
  const credentialsHash = createHash("md5")
    .update(ciphertext.toString("hex"))
    .digest("hex");
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
    ...options.settings,
  };
  const next = {
    ...settings,
    secretsmanager_enabled: true,
    ...options.targetSettings,
  };
  const email = `${owner.userId}@example.test`;
  const org = (
    await admin.query("SELECT organization_id FROM lzc.tenants WHERE id=$1", [
      owner.tenantId,
    ])
  ).rows[0].organization_id;
  const target = {
    folder_id: "folder-stable",
    region: "eu01",
    corporate: false,
    network_area_id: null,
    firewall_next_hop_ip: null,
    ipv4_nameservers: null,
  };
  const contract = {
    schema_version: 1,
    tenant_id: owner.tenantId,
    revision: platform,
    organization_id: org,
    targets: { public: target },
  };
  const policy = options.policy ?? "direct";
  await imported(async () => {
    await admin.query(
      "INSERT INTO lzc.state_backends(id,tenant_id,descriptor,identity_sha256,credentials_ciphertext) VALUES($1,$2,$3,$4,$5)",
      [backend, owner.tenantId, descriptor, backendIdentity, ciphertext],
    );
    await admin.query(
      "INSERT INTO lzc.credential_profiles(id,tenant_id,owner_user_id,name,service_account,key_id,state) VALUES($1,$2,$3,'isolated profile','fixture@sa.stackit.cloud','key','stored')",
      [profile, owner.tenantId, engineer.userId],
    );
    await admin.query(
      "INSERT INTO lzc.application_platform_contracts(revision,tenant_id,organization_id,approved_by,credential_profile_id,credential_version,credential_key_id,credential_checked_at,document) VALUES($1,$2,$3,$4,$5,1,'key',now(),$6)",
      [platform, owner.tenantId, org, engineer.userId, profile, contract],
    );
    await admin.query(
      "INSERT INTO lzc.application_execution_delegations(id,tenant_id,platform_revision,delegated_by,credential_profile_id,credential_version,credential_key_id,backend_id,backend_identity,backend_credentials_hash) VALUES($1,$2,$3,$4,$5,1,'key',$6,$7,$8)",
      [
        randomUUID(),
        owner.tenantId,
        platform,
        engineer.userId,
        profile,
        backend,
        backendIdentity,
        credentialsHash,
      ],
    );
    for (const [id, num, value, revision] of [
      [from, 1, settings, options.fromSource ?? source],
      [to, 2, next, source],
    ] as const)
      await admin.query(
        "INSERT INTO lzc.application_template_versions(id,tenant_id,template_id,version,published_by,accelerator_revision,document,platform_revision,target_key,deployment_policy) VALUES($1,$2,$3,$4,$5,$6,$7,$8,'public',$9)",
        [
          id,
          owner.tenantId,
          family,
          num,
          engineer.userId,
          revision,
          {
            id: family,
            key: "public",
            name: "Public",
            kind: "public",
            region: "eu01",
            settings: value,
          },
          platform,
          id === to ? (options.targetPolicy ?? policy) : policy,
        ],
      );
    await admin.query(
      "INSERT INTO lzc.application_instances(id,tenant_id,version_id,requested_by,idempotency_key,name,parameters,resolved_settings,qualification_blockers,deployment_policy) VALUES($1,$2,$3,$4,$5,'stable-order','{}',$6,'[\"historical\"]',$7)",
      [
        instance,
        owner.tenantId,
        from,
        owner.userId,
        randomUUID(),
        { ...settings, owner_email: email },
        policy,
      ],
    );
    // Synthetic successful Platform Apply proof for candidate freshness gates.
    const proofPreparation = randomUUID(),
      proofApply = randomUUID();
    const proofState = `template-upgrade-proof/${proofApply}`;
    await admin.query(
      "INSERT INTO lzc.deployment_preparations(id,tenant_id,owner_user_id,name,manifest) VALUES($1,$2,$3,'Synthetic Platform source',$4)",
      [
        proofPreparation,
        owner.tenantId,
        engineer.userId,
        { organization: { id: org } },
      ],
    );
    await admin.query(
      "INSERT INTO lzc.platform_states(state_key,tenant_id,owner_user_id,version,ciphertext) VALUES($1,$2,$3,1,$4)",
      [proofState, owner.tenantId, engineer.userId, Buffer.alloc(29, 1)],
    );
    await admin.query(
      "INSERT INTO lzc.plan_runs(id,tenant_id,owner_user_id,preparation_id,ticket_hash,mode,operation,plan_id,artifact_sha256,state_key,state_version,applied_state_version,status,finished_at) VALUES($1,$2,$3,$4,$5,'platform-apply','apply',$6,$7,$8,1,1,'succeeded',now())",
      [
        proofApply,
        owner.tenantId,
        engineer.userId,
        proofPreparation,
        randomBytes(32).toString("base64url"),
        randomUUID(),
        hash,
        proofState,
      ],
    );
    await admin.query(
      "INSERT INTO lzc.application_platform_sources(revision,tenant_id,apply_run_id,state_key,state_version,source_contract_revision,document_sha256,approval_session_id,credential_profile_id,credential_version,credential_key_id) VALUES($1,$2,$3,$4,1,$5,$6,$7,$8,1,'key')",
      [
        platform,
        owner.tenantId,
        proofApply,
        proofState,
        randomUUID(),
        hash,
        engineer.id,
        profile,
      ],
    );
    const group = randomUUID();
    await admin.query(
      "INSERT INTO lzc.application_groups(id,tenant_id,name) VALUES($1,$2,$3)",
      [group, owner.tenantId, `upgrade-${group}`],
    );
    await admin.query(
      "INSERT INTO lzc.application_group_members(tenant_id,group_id,user_id) VALUES($1,$2,$3)",
      [owner.tenantId, group, owner.userId],
    );
    for (const version of [from, to])
      await admin.query(
        "INSERT INTO lzc.application_template_groups(tenant_id,version_id,group_id) VALUES($1,$2,$3)",
        [owner.tenantId, version, group],
      );
  });
  return {
    instance,
    from,
    to,
    platform,
    settings,
    next,
    contract,
    policy,
    family,
    backend,
    profile,
    descriptor,
    credentials,
    org,
  };
}
async function edge(
  f: Awaited<ReturnType<typeof fixture>>,
  sensitive = "approval-required",
) {
  return scoped(
    engineer,
    async (c) =>
      (
        await c.query(
          "SELECT lzc_auth.publish_application_upgrade_edge($1,$2,$3,$4,true) AS value",
          [engineer.id, f.from, f.to, { sensitive }],
        )
      ).rows[0].value,
  );
}
async function request(
  f: Awaited<ReturnType<typeof fixture>>,
  edgeId: string,
  session = owner,
) {
  return scoped(
    session,
    async (c) =>
      (
        await c.query(
          "SELECT lzc_auth.request_application_upgrade($1,$2,$3,NULL,$4,'{}',true) AS value",
          [session.id, f.instance, edgeId, f.from],
        )
      ).rows[0].value,
  );
}
async function plan(
  f: Awaited<ReturnType<typeof fixture>>,
  candidate: { id: string; executionBindingId?: string | null },
  overrides: Record<string, unknown> = {},
) {
  const id = randomUUID();
  const inputs = {
    acceleratorRevision: source,
    ...(candidate.executionBindingId
      ? { executionBindingId: candidate.executionBindingId }
      : {}),
    applicationUpgradeId: candidate.id,
    applyPolicy: f.policy,
    stateKey: `applications/${owner.tenantId}/${f.instance}/terraform.tfstate`,
    requestedBy: owner.userId,
    variables: {
      platform_contract: f.contract,
      application: {
        configurator_execution: true,
        tenant_id: owner.tenantId,
        instance_id: f.instance,
        name: "stable-order",
        owner_email: `${owner.userId}@example.test`,
        platform_revision: f.platform,
        template_id: `template-${f.family}`,
        template_version: 2,
        target_key: "public",
        ...f.next,
      },
    },
    ...overrides,
  };
  await scoped(owner, (c) =>
    c.query(
      "INSERT INTO lzc.application_jobs(id,tenant_id,instance_id,owner_user_id,issuer_session_id,idempotency_key,operation,inputs,binding_sha256,expires_at) VALUES($1,$2,$3,$4,$5,$6,'plan',$7,$8,now()+interval '10 minutes')",
      [
        id,
        owner.tenantId,
        f.instance,
        owner.userId,
        owner.id,
        randomUUID(),
        inputs,
        hash,
      ],
    ),
  );
  return { id, inputs };
}
it("selects a forward desired snapshot without rewriting the order, then creates a real source-bound grant for the effective template", async () => {
  const f = await fixture();
  const e = await edge(f);
  const original = (
    await admin.query(
      "SELECT to_jsonb(i) AS value FROM lzc.application_instances i WHERE id=$1",
      [f.instance],
    )
  ).rows[0].value;
  const context = await request(f, e.id);
  expect(context).toMatchObject({
    originVersionId: f.from,
    effectiveVersionId: f.to,
    effectivePlatformRevision: f.platform,
    lastAppliedVersionId: null,
  });
  expect(context.candidate.candidateHash).toMatch(/^[a-f0-9]{64}$/);
  expect(
    (
      await admin.query(
        "SELECT to_jsonb(i) AS value FROM lzc.application_instances i WHERE id=$1",
        [f.instance],
      )
    ).rows[0].value,
  ).toEqual(original);
  const j = await plan(f, context.candidate);
  expect(
    (
      await admin.query(
        "SELECT version_id,platform_revision,state_key FROM lzc.application_job_grants WHERE job_id=$1",
        [j.id],
      )
    ).rows[0],
  ).toMatchObject({
    version_id: f.to,
    platform_revision: f.platform,
    state_key: `applications/${owner.tenantId}/${f.instance}/terraform.tfstate`,
  });
  await expect(request(f, e.id)).rejects.toThrow(
    "application_upgrade_binding_changed",
  );
});
it("rejects cross-tenant requests and missing/injected snapshot identity on direct job admission", async () => {
  const f = await fixture();
  const e = await edge(f);
  await expect(request(f, e.id, outsider)).rejects.toThrow();
  const c = await request(f, e.id);
  await expect(
    plan(f, c.candidate, { applicationUpgradeId: randomUUID() }),
  ).rejects.toThrow("application_upgrade_binding_changed");
  await expect(
    plan(f, c.candidate, { applicationUpgradeId: undefined }),
  ).rejects.toThrow("application_upgrade_binding_changed");
  await expect(
    scoped(outsider, (q) =>
      q.query("SELECT lzc_auth.application_upgrade_context($1,$2)", [
        outsider.id,
        f.instance,
      ]),
    ),
  ).rejects.toThrow();
});
it("blocks placement/env changes and known service removals before any native plan", async () => {
  for (const targetSettings of [
    { env: "prod" },
    { network_enabled: true },
    { secretsmanager_enabled: false },
  ]) {
    const f = await fixture({
      settings: { secretsmanager_enabled: true },
      targetSettings,
    });
    const e = await edge(f);
    await expect(request(f, e.id)).rejects.toThrow(
      /application_upgrade_(placement_changed|removal_blocked)/,
    );
  }
});
it("never relaxes a required deployment policy through a direct sensitive edge", async () => {
  const f = await fixture({ policy: "approval-required" });
  await expect(edge(f, "direct")).rejects.toThrow(
    "application_upgrade_edge_invalid",
  );
});

const summary = (classification = "ordinary", deletes = 0, replaces = 0) => ({
  schemaVersion: 1,
  execution: "plan-only",
  applyAllowed: false,
  result: "changes",
  resources: {
    unchanged: 0,
    create: 1,
    update: 0,
    delete: deletes,
    replace: replaces,
    read: 0,
  },
  drift: { unchanged: 0, create: 0, update: 0, delete: 0, replace: 0, read: 0 },
  changedOutputs: 0,
  checks: { pass: 0, fail: 0, error: 0, unknown: 0 },
  destructive: deletes + replaces > 0,
  completeness: "complete",
  upgradeSafety: { classification, reasons: [] } as ApplicationUpgradeSafety,
});
async function artifact(
  f: Awaited<ReturnType<typeof fixture>>,
  j: Awaited<ReturnType<typeof plan>>,
  value: ReturnType<typeof summary>,
) {
  const packageId = randomUUID();
  await imported(async () => {
    await admin.query(
      "INSERT INTO lzc.application_dispatches(job_id,tenant_id,instance_id,owner_user_id,approved_by,approval_session_id,status,runner_app_id,runner_package_id,finished_at,summary) VALUES($1,$2,$3,$4,$5,$6,'succeeded',$7,$8,now(),$9)",
      [
        j.id,
        owner.tenantId,
        f.instance,
        owner.userId,
        engineer.userId,
        owner.id,
        randomUUID(),
        packageId,
        value,
      ],
    );
    await admin.query(
      "INSERT INTO lzc.application_job_delegations(job_id,tenant_id,delegation_id) SELECT $1,$2,id FROM lzc.application_execution_delegations WHERE platform_revision=$3 AND revoked_at IS NULL",
      [j.id, owner.tenantId, f.platform],
    );
  });
  await migration.query(
    "INSERT INTO lzc.application_runner_records(job_id,kind,tenant_id,owner_user_id,ciphertext,sha256,summary,truncated,binding_sha256,state_key,runner_package_id) VALUES($1,'artifact',$2,$3,$4,$5,$6,false,$5,$7,$8)",
    [
      j.id,
      owner.tenantId,
      owner.userId,
      Buffer.alloc(64, 1),
      hash,
      value,
      j.inputs.stateKey,
      packageId,
    ],
  );
}
async function apply(
  f: Awaited<ReturnType<typeof fixture>>,
  j: Awaited<ReturnType<typeof plan>>,
) {
  const id = randomUUID();
  await scoped(owner, (c) =>
    c.query(
      "INSERT INTO lzc.application_jobs(id,tenant_id,instance_id,owner_user_id,issuer_session_id,idempotency_key,operation,inputs,binding_sha256,expires_at,plan_id,artifact_sha256) VALUES($1,$2,$3,$4,$5,$6,'apply',$7,$8,now()+interval '10 minutes',$9,$8)",
      [
        id,
        owner.tenantId,
        f.instance,
        owner.userId,
        owner.id,
        randomUUID(),
        j.inputs,
        hash,
        j.id,
      ],
    ),
  );
  return id;
}
it("requires fresh artifact-bound PE approval for sensitive changes and then admits the same-state Apply", async () => {
  const f = await fixture();
  const e = await edge(f);
  const c = await request(f, e.id);
  const j = await plan(f, c.candidate);
  await artifact(f, j, summary("sensitive"));
  await expect(apply(f, j)).rejects.toThrow(
    "application_upgrade_plan_approval_required",
  );
  const before = await scoped(
    engineer,
    async (q) =>
      (
        await q.query(
          "SELECT lzc_auth.application_upgrade_approval_context($1,$2) AS value",
          [engineer.id, j.id],
        )
      ).rows[0].value,
  );
  expect(before).toMatchObject({
    upgradeId: c.candidate.id,
    requiresApproval: true,
    approved: false,
    canApprove: true,
    blocked: false,
  });
  await expect(
    scoped(owner, (q) =>
      q.query(
        "SELECT lzc_auth.approve_application_upgrade($1,$2,$3,$4,$5,true)",
        [owner.id, c.candidate.id, c.candidate.candidateHash, j.id, hash],
      ),
    ),
  ).rejects.toThrow();
  await scoped(engineer, (q) =>
    q.query(
      "SELECT lzc_auth.approve_application_upgrade($1,$2,$3,$4,$5,true)",
      [engineer.id, c.candidate.id, c.candidate.candidateHash, j.id, hash],
    ),
  );
  const applied = await apply(f, j);
  expect(
    (
      await admin.query(
        "SELECT version_id,state_key FROM lzc.application_job_grants WHERE job_id=$1",
        [applied],
      )
    ).rows[0],
  ).toMatchObject({ version_id: f.to, state_key: j.inputs.stateKey });
});
it.each(["stackit_observability_instance", "stackit_secretsmanager_instance"])(
  "requires exact-Plan approval for an in-place %s service downgrade",
  async (type) => {
    const f = await fixture();
    const e = await edge(f);
    const c = await request(f, e.id);
    const j = await plan(f, c.candidate);
    const nativePlan = {
      format_version: "1.2",
      terraform_version: "1.12.6",
      complete: true,
      planned_values: { root_module: {} },
      resource_changes: [
        {
          mode: "managed",
          type,
          change: {
            actions: ["update"],
            before: { plan_name: "larger", retention_days: 30 },
            after: { plan_name: "smaller", retention_days: 7 },
          },
        },
      ],
    };
    const safety = classifyApplicationUpgradePlan(nativePlan);
    expect(safety.classification).toBe("sensitive");
    const value = { ...summary(), upgradeSafety: safety };
    value.resources.create = 0;
    value.resources.update = 1;
    await artifact(f, j, value);
    await expect(apply(f, j)).rejects.toThrow(
      "application_upgrade_plan_approval_required",
    );
    await scoped(engineer, (q) =>
      q.query(
        "SELECT lzc_auth.approve_application_upgrade($1,$2,$3,$4,$5,true)",
        [engineer.id, c.candidate.id, c.candidate.candidateHash, j.id, hash],
      ),
    );
    expect(await apply(f, j)).toMatch(/^[a-f0-9-]{36}$/);
  },
);
it.each([
  [1, 0],
  [0, 1],
])(
  "blocks standard upgrade Apply with %i deletions and %i replacements despite a successful fresh plan",
  async (deletes, replaces) => {
    const f = await fixture();
    const e = await edge(f, "direct");
    const c = await request(f, e.id);
    const j = await plan(f, c.candidate);
    await artifact(f, j, summary("ordinary", deletes, replaces));
    await expect(apply(f, j)).rejects.toThrow(
      "application_upgrade_plan_blocked",
    );
    await expect(
      scoped(engineer, (q) =>
        q.query(
          "SELECT lzc_auth.approve_application_upgrade($1,$2,$3,$4,$5,true)",
          [engineer.id, c.candidate.id, c.candidate.candidateHash, j.id, hash],
        ),
      ),
    ).rejects.toThrow("application_upgrade_plan_blocked");
  },
);
it("keeps customer-approved both-direct sensitive policy flexible without weakening destructive guards", async () => {
  const f = await fixture();
  const e = await edge(f, "direct");
  const c = await request(f, e.id);
  const j = await plan(f, c.candidate);
  await artifact(f, j, summary("sensitive"));
  expect(await apply(f, j)).toMatch(/^[a-f0-9-]{36}$/);
});
it("makes old/new approval-required policy require a fresh PE receipt even for ordinary additions", async () => {
  const f = await fixture({ policy: "approval-required" });
  await imported(() =>
    admin.query(
      "INSERT INTO lzc.application_order_decisions(instance_id,tenant_id,decision,decided_by,reason) VALUES($1,$2,'approved',$3,'initial order only')",
      [f.instance, owner.tenantId, engineer.userId],
    ),
  );
  const e = await edge(f);
  const c = await request(f, e.id);
  const j = await plan(f, c.candidate);
  await artifact(f, j, summary());
  await expect(apply(f, j)).rejects.toThrow(
    "application_upgrade_plan_approval_required",
  );
});

it("serves authoritative API preview and compiler snapshots without saving or executing until explicit request", async () => {
  const { Applications } = await import(
    "../apps/api/src/applications/service.js"
  );
  const f = await fixture();
  const e = await edge(f);
  const service = new Applications(runtime);
  const request = {
    edgeId: e.id,
    expectedVersionId: f.from,
    expectedBindingId: null,
  };
  const { contextSchema } = await import(
    "../apps/web/src/components/application-upgrade-schemas.js"
  );
  const wire = contextSchema.parse(
    await service.upgradeContext(owner, f.instance),
  );
  expect(
    wire.candidates.find((candidate) => candidate.id === e.id)?.assessment
      .classification,
  ).not.toBe("blocked");
  const preview = await service.previewUpgrade(owner, f.instance, request);
  expect(preview.assessment.classification).not.toBe("blocked");
  expect(preview.assessment.applyAllowed).toBe(false);
  expect(preview.target.id).toBe(f.to);
  expect(
    (await service.upgradeContext(owner, f.instance)).effectiveVersionId,
  ).toBe(f.from);
  await expect(
    service.requestUpgrade(owner, f.instance, request),
  ).rejects.toThrow();
  const selected = await service.requestUpgrade(owner, f.instance, {
    ...request,
    confirmUpgrade: true,
  });
  expect(selected.current.id).toBe(f.to);
  expect(selected.effectiveSettings.secretsmanager_enabled).toBe(true);
  const compiled = await service.preparePlanInput(owner, f.instance);
  expect(compiled.plan.applicationUpgradeId).toBe(selected.bindingId);
  expect(compiled.plan.variables.application.template_version).toBe(2);
  expect(compiled.plan.stateKey).toBe(
    `applications/${owner.tenantId}/${f.instance}/terraform.tfstate`,
  );
  const job = await service.prepareJob(owner, f.instance, {
    idempotencyKey: randomUUID(),
    confirmPlan: true,
  });
  expect(
    (
      await admin.query(
        "SELECT g.version_id,j.inputs FROM lzc.application_job_grants g JOIN lzc.application_jobs j ON j.id=g.job_id WHERE g.job_id=$1",
        [job.id],
      )
    ).rows[0],
  ).toMatchObject({
    version_id: f.to,
    inputs: {
      applicationUpgradeId: selected.bindingId,
      variables: { application: { template_version: 2 } },
    },
  });
});

it("preserves every historical upgraded template against catalogue deletion", async () => {
  const f = await fixture();
  const e = await edge(f);
  await request(f, e.id);
  await scoped(engineer, (c) =>
    c.query(
      "INSERT INTO lzc.application_template_retirements(tenant_id,version_id,retired_by) VALUES($1,$2,$3)",
      [owner.tenantId, f.to, engineer.userId],
    ),
  );
  expect(
    await scoped(
      engineer,
      async (c) =>
        (
          await c.query(
            "SELECT lzc.application_template_deletable($1) AS value",
            [f.to],
          )
        ).rows[0].value,
    ),
  ).toBe(false);
  await expect(
    scoped(engineer, (c) =>
      c.query("SELECT lzc_auth.delete_application_template($1,$2)", [
        engineer.id,
        f.to,
      ]),
    ),
  ).rejects.toThrow("template_version_in_use");
});
it("rejects an upgrade after target retirement instead of admitting a stale candidate", async () => {
  const f = await fixture();
  const e = await edge(f);
  await scoped(engineer, (c) =>
    c.query(
      "INSERT INTO lzc.application_template_retirements(tenant_id,version_id,retired_by) VALUES($1,$2,$3)",
      [owner.tenantId, f.to, engineer.userId],
    ),
  );
  await expect(request(f, e.id)).rejects.toThrow(
    "application_upgrade_target_unavailable",
  );
});
it.each([
  { secretsmanager_enabled: false },
  {
    observability: {
      enabled: true,
      plan_name: "Observability-Starter-EU01",
      acl: [],
    },
  },
  {
    custom_roles: [
      {
        name: "forged",
        description: "forged",
        permissions: ["iam.role.create"],
      },
    ],
  },
  { role_assignments: [{ role: "owner", subject: "other@example.test" }] },
  { automation_role: "owner" },
  { initial_owner_email: "other@example.test" },
])(
  "rejects native service or IAM changes outside the authoritative snapshot: %j",
  async (changed) => {
    const f = await fixture();
    const e = await edge(f);
    const c = await request(f, e.id);
    const canonical = await new (
      await import("../apps/api/src/applications/service.js")
    ).Applications(runtime).preparePlanInput(owner, f.instance);
    await expect(
      plan(f, c.candidate, {
        variables: {
          ...canonical.plan.variables,
          application: { ...canonical.plan.variables.application, ...changed },
        },
      }),
    ).rejects.toThrow("application_upgrade_inputs_mismatch");
  },
);
it.each(["drift", "destroy"])(
  "preserves explicit %s maintenance on upgraded snapshots without a standard upgrade summary",
  async (purpose) => {
    const f = await fixture();
    const e = await edge(f);
    const c = await request(f, e.id);
    const j = await plan(f, c.candidate, { purpose });
    const value = summary();
    delete (value as Partial<typeof value>).upgradeSafety;
    await artifact(f, j, value);
    expect(
      (
        await admin.query(
          "SELECT count(*)::int AS count FROM lzc.application_runner_records WHERE job_id=$1",
          [j.id],
        )
      ).rows[0].count,
    ).toBe(1);
  },
);

it("passes the immutable effective snapshot through actual job dispatch and Runner broker without Cloud calls", async () => {
  const { Applications } = await import(
    "../apps/api/src/applications/service.js"
  );
  const f = await fixture();
  const e = await edge(f);
  const selected = await request(f, e.id);
  const packageId = randomUUID();
  let ticket = "";
  const nativePlan = {
    format_version: "1.2",
    errored: false,
    complete: true,
    configuration: {},
    planned_values: { root_module: {} },
    terraform_version: "1.12.6",
    resource_changes: [
      {
        address: "module.application.stackit_secretsmanager_instance.this[0]",
        mode: "managed",
        type: "stackit_secretsmanager_instance",
        name: "this",
        change: {
          actions: ["create"],
          before: null,
          after: { name: "synthetic" },
          after_unknown: {},
        },
      },
    ],
  };
  const service = new Applications(
    runtime,
    {
      list: async () => [],
      verifyForPreparation: async () => {
        throw new Error("unexpected personal credential");
      },
      verifyDelegated: async () => ({
        status: "passed",
        organizationId: f.org,
        organizationName: null,
        checkedAt: new Date().toISOString(),
        code: "organization_readable",
      }),
    },
    {
      get: async () => ({
        version: 1,
        key: {
          credentials: {
            kid: "key",
            iss: "fixture@sa.stackit.cloud",
            sub: randomUUID(),
            aud: "https://accounts.stackit.cloud",
            privateKey: "isolated-test-key",
          },
        },
      }),
    },
    {
      runner: async () => ({
        kind: "s3",
        descriptor: f.descriptor,
        credentials: f.credentials,
      }),
    },
    {
      origin: "https://isolated.example.test",
      runner: {
        acceleratorCommit: source,
        supportsAccelerator: (r) => r === source,
        supportsArtifact: (id) => id === packageId,
        preview: async () => nativePlan,
        start: async (_id, t, _origin, record) => {
          ticket = t;
          await record?.(randomUUID(), packageId);
        },
        remove: async () => {},
      },
    },
    crypto,
  );
  const j = await service.prepareJob(owner, f.instance, {
    idempotencyKey: randomUUID(),
    confirmPlan: true,
  });
  await service.dispatchJob(owner, j.id, { confirmPlan: true });
  expect(ticket).not.toBe("");
  const input = await service.runnerInput(ticket, {
    runnerPackageId: packageId,
    acceleratorRevision: source,
    providerLockSha256:
      "d40debbff204aee590c2a76d09f6ad3234643329b438fd5c6497de60687f6fa5",
  });
  expect(input.application).toMatchObject({
    instanceId: f.instance,
    applicationUpgradeId: selected.bindingId,
  });
  expect(input.backend.descriptor.key).toBe(
    `applications/${owner.tenantId}/${f.instance}/terraform.tfstate`,
  );
  expect(input.tfvars).toContain('"template_version" = 2');
  expect(input.tfvars).toContain('"secretsmanager_enabled" = true');
  const binding = {
    runnerPackageId: packageId,
    acceleratorRevision: source,
    providerLockSha256:
      "d40debbff204aee590c2a76d09f6ad3234643329b438fd5c6497de60687f6fa5",
  };
  for (const stage of ["initializing", "validating", "planning"])
    await service.runnerStage(ticket, binding, { stage });
  const { summarizePlan, classifyApplicationUpgradePlan } = await import(
    "@lzc/contracts"
  );
  const planSummary = {
    ...summarizePlan(nativePlan, 2, "opentofu-1.12.6"),
    upgradeSafety: classifyApplicationUpgradePlan(nativePlan),
  };
  const stored = await service.runnerArtifact(ticket, binding, {
    data: Buffer.from("isolated-saved-plan").toString("base64"),
    summary: planSummary,
  });
  await service.runnerResult(ticket, binding, {
    status: "succeeded",
    artifactSha256: stored.sha256,
    summary: planSummary,
  });
  await service.approveUpgrade(engineer, j.id, {
    artifactSha256: stored.sha256,
    confirmApproval: true,
  });
  const result = await service.startApply(owner, j.id, {
    artifactSha256: stored.sha256,
  });
  expect(result).toMatchObject({ dispatched: true });
  const applied = (
    await admin.query(
      "SELECT g.version_id,g.platform_revision,j.inputs FROM lzc.application_jobs j JOIN lzc.application_job_grants g ON g.job_id=j.id WHERE j.plan_id=$1",
      [j.id],
    )
  ).rows[0];
  expect(applied).toMatchObject({
    version_id: f.to,
    platform_revision: f.platform,
    inputs: { applicationUpgradeId: selected.bindingId },
  });
});
it.each(["stale-state", "missing-delegation"])(
  "reports %s as a blocked GET and preview assessment before confirmation",
  async (condition) => {
    const { Applications } = await import(
      "../apps/api/src/applications/service.js"
    );
    const { contextSchema } = await import(
      "../apps/web/src/components/application-upgrade-schemas.js"
    );
    const f = await fixture();
    const e = await edge(f);
    if (condition === "stale-state")
      await admin.query(
        "UPDATE lzc.platform_states SET version=version+1 WHERE state_key=(SELECT state_key FROM lzc.application_platform_sources WHERE revision=$1)",
        [f.platform],
      );
    else
      await admin.query(
        "UPDATE lzc.application_execution_delegations SET revoked_at=now() WHERE platform_revision=$1",
        [f.platform],
      );
    const service = new Applications(runtime);
    const context = contextSchema.parse(
      await service.upgradeContext(owner, f.instance),
    );
    expect(
      context.candidates.find((candidate) => candidate.id === e.id)?.assessment
        .classification,
    ).toBe("blocked");
    const preview = await service.previewUpgrade(owner, f.instance, {
      edgeId: e.id,
      expectedBindingId: null,
      expectedVersionId: f.from,
    });
    expect(preview.assessment.classification).toBe("blocked");
    expect(
      (
        await admin.query(
          "SELECT count(*)::int AS count FROM lzc.application_upgrade_candidates WHERE instance_id=$1",
          [f.instance],
        )
      ).rows[0].count,
    ).toBe(0);
  },
);

it("allows a direct target publication while retaining the older required policy and exact fresh-Plan PE approval", async () => {
  const f = await fixture({
    policy: "approval-required",
    targetPolicy: "direct",
  });
  await imported(() =>
    admin.query(
      "INSERT INTO lzc.application_order_decisions(instance_id,tenant_id,decision,decided_by,reason) VALUES($1,$2,'approved',$3,'initial order only')",
      [f.instance, owner.tenantId, engineer.userId],
    ),
  );
  await expect(edge(f, "direct")).rejects.toThrow(
    "application_upgrade_edge_invalid",
  );
  const e = await edge(f);
  const c = await request(f, e.id);
  expect(c.effectiveDeploymentPolicy).toBe("approval-required");
  const j = await plan(f, c.candidate);
  await artifact(f, j, summary());
  await expect(apply(f, j)).rejects.toThrow(
    "application_upgrade_plan_approval_required",
  );
  await expect(
    scoped(engineer, (q) =>
      q.query(
        "SELECT lzc_auth.approve_application_upgrade($1,$2,$3,$4,$5,true)",
        [
          engineer.id,
          c.candidate.id,
          c.candidate.candidateHash,
          j.id,
          "b".repeat(64),
        ],
      ),
    ),
  ).rejects.toThrow("application_upgrade_approval_invalid");
  await scoped(engineer, (q) =>
    q.query(
      "SELECT lzc_auth.approve_application_upgrade($1,$2,$3,$4,$5,true)",
      [engineer.id, c.candidate.id, c.candidate.candidateHash, j.id, hash],
    ),
  );
  expect(await apply(f, j)).toMatch(/^[a-f0-9-]{36}$/);
});
