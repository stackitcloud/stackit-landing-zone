import { createHash, randomBytes, randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import {
  type ApplicationUpgradeSafety,
  classifyApplicationUpgradePlan,
} from "@lzc/contracts";
import pg from "pg";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { buildApp } from "../apps/api/src/app.js";
import { newSessionToken } from "../apps/api/src/auth/github-flow.js";
import type { AuthServices } from "../apps/api/src/auth/routes.js";
import { PostgresAuthStore, type Session } from "../apps/api/src/auth/store.js";
import type { PlanRunner } from "../apps/api/src/plans/cloud-foundry.js";
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
const ownerToken = newSessionToken();
const ownerGithubId =
  process.env.LZC_TEST_BROWSER_JOURNEY === "true" ? 900800001 : 800001;
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
      hash:
        id === ownerGithubId
          ? ownerToken.hash
          : randomBytes(32).toString("base64url"),
      csrfToken: randomBytes(32).toString("base64url"),
      expiresAt: new Date(Date.now() + 3600000),
    });
  owner = await session(ownerGithubId);
  engineer = await session(ownerGithubId + 1);
  outsider = await session(ownerGithubId + 2);
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
    targetSource?: string;
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
      [to, 2, next, options.targetSource ?? source],
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
  j: { id: string; inputs: { stateKey: string } },
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
      "INSERT INTO lzc.application_job_delegations(job_id,tenant_id,delegation_id) SELECT $1,$2,id FROM lzc.application_execution_delegations WHERE platform_revision=$3 AND revoked_at IS NULL ON CONFLICT(job_id) DO NOTHING",
      [j.id, owner.tenantId, f.platform],
    );
  });
  await migration.query(
    "INSERT INTO lzc.application_runner_records(job_id,kind,tenant_id,owner_user_id,ciphertext,sha256,summary,truncated,binding_sha256,state_key,runner_package_id) VALUES($1,'artifact',$2,$3,$4,$5,$6,false,(SELECT binding_sha256 FROM lzc.application_jobs WHERE id=$1),$7,$8)",
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
      "INSERT INTO lzc.application_jobs(id,tenant_id,instance_id,owner_user_id,issuer_session_id,idempotency_key,operation,inputs,binding_sha256,expires_at,plan_id,artifact_sha256) VALUES($1,$2,$3,$4,$5,$6,'apply',$7,(SELECT binding_sha256 FROM lzc.application_jobs WHERE id=$9),now()+interval '10 minutes',$9,$8)",
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
  expect(
    contextSchema.parse(await service.upgradeContext(owner, f.instance))
      .versionLabels,
  ).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ id: f.from, version: 1 }),
      expect.objectContaining({ id: f.to, version: 2 }),
    ]),
  );
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

async function completedBackendMigration(
  f: Awaited<ReturnType<typeof fixture>>,
) {
  const proof = (
    await admin.query(
      "SELECT state_key,apply_run_id FROM lzc.application_platform_sources WHERE revision=$1",
      [f.platform],
    )
  ).rows[0];
  const migrationRun = randomUUID();
  await imported(async () => {
    await admin.query(
      "INSERT INTO lzc.plan_runs(id,tenant_id,owner_user_id,preparation_id,ticket_hash,mode,operation,plan_id,artifact_sha256,state_key,state_version,applied_state_version,status,finished_at) SELECT $1,tenant_id,owner_user_id,preparation_id,$2,'platform-apply','apply',$4,artifact_sha256,state_key,0,1,'succeeded',now() FROM lzc.plan_runs WHERE id=$3",
      [
        migrationRun,
        randomBytes(32).toString("base64url"),
        proof.apply_run_id,
        randomUUID(),
      ],
    );
    await admin.query(
      "UPDATE lzc.platform_states SET version=2,backend_id=$2,pending_backend_id=$2,migration_run_id=$3,migration_version=0,migration_sha256=$4,ciphertext=NULL,stable_aad=true,remote_identity=$4 WHERE state_key=$1",
      [proof.state_key, f.backend, migrationRun, hash],
    );
    await admin.query(
      "UPDATE lzc.plan_runs SET applied_state_version=2 WHERE id=$1",
      [proof.apply_run_id],
    );
    await admin.query(
      "UPDATE lzc.application_platform_sources SET state_version=2 WHERE revision=$1",
      [f.platform],
    );
  });
  return { ...proof, migration_run_id: migrationRun } as {
    state_key: string;
    apply_run_id: string;
    migration_run_id: string;
  };
}

it("accepts a proven completed remote-backend migration without clearing its idempotency markers", async () => {
  const { Applications } = await import(
    "../apps/api/src/applications/service.js"
  );
  const f = await fixture({
    policy: "approval-required",
    targetPolicy: "direct",
  });
  const proof = await completedBackendMigration(f);
  const e = await edge(f);
  const service = new Applications(runtime);
  const input = {
    edgeId: e.id,
    expectedVersionId: f.from,
    expectedBindingId: null,
  };
  const context = await service.upgradeContext(owner, f.instance);
  expect(context.candidates[0]?.assessment.classification).not.toBe("blocked");
  const preview = await service.previewUpgrade(owner, f.instance, input);
  expect(preview.assessment.classification).not.toBe("blocked");
  expect(preview.assessment.approvalPolicy).toBe("approval-required");
  const result = await service.requestUpgrade(owner, f.instance, {
    ...input,
    confirmUpgrade: true,
  });
  expect(result.current.id).toBe(f.to);
  expect(
    (
      await admin.query(
        "SELECT backend_id,pending_backend_id,migration_run_id,migration_version,version FROM lzc.platform_states WHERE state_key=$1",
        [proof.state_key],
      )
    ).rows[0],
  ).toEqual({
    backend_id: f.backend,
    pending_backend_id: f.backend,
    migration_run_id: proof.migration_run_id,
    migration_version: "0",
    version: "2",
  });
  expect(
    (
      await admin.query(
        "SELECT has_function_privilege('configurator_app','lzc_auth.platform_state_backend_settled(lzc.platform_states)','EXECUTE') AS allowed",
      )
    ).rows[0].allowed,
  ).toBe(false);
});

it.each([
  [
    "pending backend missing",
    "UPDATE lzc.platform_states SET pending_backend_id=NULL WHERE state_key=$1",
  ],
  [
    "migration run missing",
    "UPDATE lzc.platform_states SET migration_run_id=NULL WHERE state_key=$1",
  ],
  [
    "remote backend missing",
    "UPDATE lzc.platform_states SET backend_id=NULL,ciphertext=decode(repeat('01',29),'hex') WHERE state_key=$1",
  ],
  [
    "remote identity missing",
    "UPDATE lzc.platform_states SET remote_identity=NULL WHERE state_key=$1",
  ],
  [
    "stable AAD missing",
    "UPDATE lzc.platform_states SET stable_aad=false WHERE state_key=$1",
  ],
  [
    "migration hash missing",
    "UPDATE lzc.platform_states SET migration_sha256=NULL WHERE state_key=$1",
  ],
  [
    "migration version missing",
    "UPDATE lzc.platform_states SET migration_version=NULL WHERE state_key=$1",
  ],
  [
    "migration version unadvanced",
    "UPDATE lzc.platform_states SET migration_version=version WHERE state_key=$1",
  ],
  [
    "migration applied version mismatch",
    "UPDATE lzc.plan_runs SET applied_state_version=2 WHERE id=(SELECT migration_run_id FROM lzc.platform_states WHERE state_key=$1)",
  ],
  [
    "migration apply failed",
    "UPDATE lzc.plan_runs SET status='failed' WHERE id=(SELECT migration_run_id FROM lzc.platform_states WHERE state_key=$1)",
  ],
  [
    "migration unfinished",
    "UPDATE lzc.plan_runs SET finished_at=NULL WHERE id=(SELECT migration_run_id FROM lzc.platform_states WHERE state_key=$1)",
  ],
  [
    "current State newer than proof",
    "UPDATE lzc.platform_states SET version=3 WHERE state_key=$1",
  ],
  [
    "State locked",
    "UPDATE lzc.platform_states SET lock_run_id=migration_run_id,lock_id='synthetic-lock' WHERE state_key=$1",
  ],
] as const)("blocks unsafe migration evidence: %s", async (_name, sql) => {
  const { Applications } = await import(
    "../apps/api/src/applications/service.js"
  );
  const f = await fixture();
  const e = await edge(f);
  const proof = await completedBackendMigration(f);
  await imported(() => admin.query(sql, [proof.state_key]));
  const service = new Applications(runtime);
  const preview = await service.previewUpgrade(owner, f.instance, {
    edgeId: e.id,
    expectedVersionId: f.from,
    expectedBindingId: null,
  });
  expect(preview.assessment.classification).toBe("blocked");
  expect(preview.assessment.reasons).toContainEqual({
    code: "upgrade-target-not-qualified",
    path: "platform",
    classification: "blocked",
  });
  await expect(request(f, e.id)).rejects.toThrow(
    "application_upgrade_platform_changed",
  );
});

it.each([
  [
    "9e7fb46c329aca32e878ce1f0ea3b944ea240354",
    "1ed855609d4dcbfded6759c7c8b4fabf7bd6725d",
  ],
  [
    "1ed855609d4dcbfded6759c7c8b4fabf7bd6725d",
    "9e7fb46c329aca32e878ce1f0ea3b944ea240354",
  ],
])(
  "saves an older template through its common reviewed successor (%s → %s)",
  async (fromSource, targetSource) => {
    const { Applications } = await import(
      "../apps/api/src/applications/service.js"
    );
    const f = await fixture({ fromSource, targetSource });
    const e = await edge(f);
    const service = new Applications(runtime, undefined, undefined, undefined, {
      runner: {
        supportsAccelerator: (revision: string) => revision === source,
      } as unknown as PlanRunner,
      origin: "https://configurator.example",
    });
    const input = {
      edgeId: e.id,
      expectedVersionId: f.from,
      expectedBindingId: null,
    };
    const preview = await service.previewUpgrade(owner, f.instance, input);
    expect(preview.assessment.classification).toBe("sensitive");
    expect(
      (
        await admin.query(
          "SELECT count(*) FROM lzc.application_execution_bindings WHERE instance_id=$1",
          [f.instance],
        )
      ).rows[0].count,
    ).toBe("0");
    const selected = await service.requestUpgrade(owner, f.instance, {
      ...input,
      confirmUpgrade: true,
    });
    expect(selected.current.id).toBe(f.to);
    expect(selected.candidate?.sourceRevision).toBe(source);
    expect(
      (
        await admin.query(
          "SELECT previous_revision,revision FROM lzc.application_execution_bindings WHERE instance_id=$1",
          [f.instance],
        )
      ).rows,
    ).toEqual([{ previous_revision: fromSource, revision: source }]);
    expect(
      (
        await admin.query(
          "SELECT accelerator_revision FROM lzc.application_template_versions WHERE id=ANY($1::uuid[]) ORDER BY version",
          [[f.from, f.to]],
        )
      ).rows.map((r) => r.accelerator_revision),
    ).toEqual([fromSource, targetSource]);
    expect(
      (
        await admin.query(
          "SELECT version_id FROM lzc.application_instances WHERE id=$1",
          [f.instance],
        )
      ).rows[0].version_id,
    ).toBe(f.from);
    expect(
      (
        await admin.query(
          "SELECT count(*) FROM lzc.application_jobs WHERE instance_id=$1",
          [f.instance],
        )
      ).rows[0].count,
    ).toBe("0");
    const compiled = await service.preparePlanInput(owner, f.instance);
    expect(compiled.plan.applicationUpgradeId).toBe(selected.bindingId);
    expect(compiled.plan.acceleratorRevision).toBe(source);
    expect(compiled.plan.variables.application.template_version).toBe(2);
    expect(compiled.plan.stateKey).toBe(
      `applications/${owner.tenantId}/${f.instance}/terraform.tfstate`,
    );
  },
);

it("blocks both preview and SQL persistence when the common successor is withdrawn", async () => {
  const { Applications } = await import(
    "../apps/api/src/applications/service.js"
  );
  const f = await fixture({
    fromSource: "9e7fb46c329aca32e878ce1f0ea3b944ea240354",
    targetSource: "1ed855609d4dcbfded6759c7c8b4fabf7bd6725d",
  });
  const e = await edge(f);
  await admin.query(
    "UPDATE lzc.application_execution_sources SET status='withdrawn' WHERE revision=$1",
    [source],
  );
  try {
    await expect(
      new Applications(runtime).previewUpgrade(owner, f.instance, {
        edgeId: e.id,
        expectedVersionId: f.from,
        expectedBindingId: null,
      }),
    ).rejects.toThrow("application_upgrade_source_unavailable");
    await expect(request(f, e.id)).rejects.toThrow(
      "application_upgrade_source_unavailable",
    );
    expect(
      (
        await admin.query(
          "SELECT count(*) FROM lzc.application_upgrade_candidates WHERE instance_id=$1",
          [f.instance],
        )
      ).rows[0].count,
    ).toBe("0");
    expect(
      (
        await admin.query(
          "SELECT count(*) FROM lzc.application_execution_bindings WHERE instance_id=$1",
          [f.instance],
        )
      ).rows[0].count,
    ).toBe("0");
  } finally {
    await admin.query(
      "UPDATE lzc.application_execution_sources SET status='supported' WHERE revision=$1",
      [source],
    );
  }
});

it("rejects unknown and withdrawn target sources without inferring compatibility", async () => {
  for (const target of [
    "0".repeat(40),
    "4d15d7870afa323badd93559d8b37c5a8d138dcf",
  ])
    await expect(
      admin.query(
        "SELECT lzc_auth.application_upgrade_execution_source($1,$2)",
        [source, target],
      ),
    ).rejects.toThrow("application_upgrade_source_unavailable");
});

it("rejects an unavailable common Runner package before persisting any binding", async () => {
  const { Applications } = await import(
    "../apps/api/src/applications/service.js"
  );
  const f = await fixture({
    fromSource: "9e7fb46c329aca32e878ce1f0ea3b944ea240354",
    targetSource: "1ed855609d4dcbfded6759c7c8b4fabf7bd6725d",
  });
  const e = await edge(f);
  const service = new Applications(runtime, undefined, undefined, undefined, {
    runner: { supportsAccelerator: () => false } as unknown as PlanRunner,
    origin: "https://configurator.example",
  });
  const input = {
    edgeId: e.id,
    expectedVersionId: f.from,
    expectedBindingId: null,
  };
  await expect(
    service.previewUpgrade(owner, f.instance, input),
  ).rejects.toThrow("application_execution_package_unavailable");
  await expect(
    service.requestUpgrade(owner, f.instance, {
      ...input,
      confirmUpgrade: true,
    }),
  ).rejects.toThrow("application_execution_package_unavailable");
  expect(
    (
      await admin.query(
        "SELECT count(*) FROM lzc.application_upgrade_candidates WHERE instance_id=$1",
        [f.instance],
      )
    ).rows[0].count,
  ).toBe("0");
  expect(
    (
      await admin.query(
        "SELECT count(*) FROM lzc.application_execution_bindings WHERE instance_id=$1",
        [f.instance],
      )
    ).rows[0].count,
  ).toBe("0");
});

it("does not equate two supported sources without reviewed replacement edges", async () => {
  const unrelated = "f".repeat(40);
  await admin.query(
    "INSERT INTO lzc.application_execution_sources(revision,provider_lock_sha256,tofu_version,contract_version,status) SELECT $1,provider_lock_sha256,tofu_version,contract_version,'supported' FROM lzc.application_execution_sources WHERE revision=$2",
    [unrelated, source],
  );
  try {
    await expect(
      admin.query(
        "SELECT lzc_auth.application_upgrade_execution_source($1,$2)",
        ["9e7fb46c329aca32e878ce1f0ea3b944ea240354", unrelated],
      ),
    ).rejects.toThrow("application_upgrade_source_unavailable");
  } finally {
    await admin.query(
      "DELETE FROM lzc.application_execution_sources WHERE revision=$1",
      [unrelated],
    );
  }
});

async function publishLaterKubernetesVersion(
  f: Awaited<ReturnType<typeof fixture>>,
) {
  const next = randomUUID();
  const document = (
    await admin.query(
      "SELECT document FROM lzc.application_template_versions WHERE id=$1",
      [f.to],
    )
  ).rows[0].document;
  document.settings.custom_roles = [
    ...document.settings.custom_roles,
    {
      name: "kubernetes",
      description: "Cluster management",
      permissions: [
        "ske.cluster.create",
        "ske.cluster.get",
        "ske.cluster.list",
      ],
    },
  ];
  document.settings.role_assignments = [
    ...document.settings.role_assignments,
    { role: "kubernetes", subject: `${owner.userId}@example.test` },
  ];
  await imported(() =>
    admin.query(
      "INSERT INTO lzc.application_template_versions(id,tenant_id,template_id,version,published_by,accelerator_revision,document,platform_revision,target_key,deployment_policy) SELECT $1,tenant_id,template_id,3,published_by,accelerator_revision,$3,platform_revision,target_key,deployment_policy FROM lzc.application_template_versions WHERE id=$2",
      [next, f.to, document],
    ),
  );
  await imported(() =>
    admin.query(
      "INSERT INTO lzc.application_template_groups(tenant_id,version_id,group_id) SELECT tenant_id,$1,group_id FROM lzc.application_template_groups WHERE version_id=$2",
      [next, f.to],
    ),
  );
  return { versionId: next, edge: await edge({ ...f, to: next }) };
}

async function appliedOrderHistory(f: Awaited<ReturnType<typeof fixture>>) {
  const { Applications } = await import(
    "../apps/api/src/applications/service.js"
  );
  const service = new Applications(runtime);
  const old = await service.prepareJob(owner, f.instance, {
    idempotencyKey: randomUUID(),
    confirmPlan: true,
  });
  const inputs = (
    await admin.query("SELECT inputs FROM lzc.application_jobs WHERE id=$1", [
      old.id,
    ])
  ).rows[0].inputs;
  const j = { id: old.id, inputs };
  await artifact(f, j, summary("ordinary"));
  const applied = await apply(f, {
    id: old.id as ReturnType<typeof randomUUID>,
    inputs,
  });
  await imported(async () => {
    await admin.query(
      "INSERT INTO lzc.application_job_claims(job_id,tenant_id,owner_user_id,approved_by,approval_session_id,expires_at) SELECT g.job_id,g.tenant_id,g.owner_user_id,g.approved_by,b.approval_session_id,g.expires_at FROM lzc.application_job_grants g JOIN lzc.application_job_backends b ON b.job_id=g.job_id WHERE g.job_id=$1",
      [old.id],
    );
    await admin.query(
      "INSERT INTO lzc.application_dispatches(job_id,tenant_id,instance_id,owner_user_id,approved_by,approval_session_id,status,runner_app_id,runner_package_id,finished_at) VALUES($1,$2,$3,$4,$5,$6,'succeeded',$7,$8,now())",
      [
        applied,
        owner.tenantId,
        f.instance,
        owner.userId,
        engineer.userId,
        engineer.id,
        randomUUID(),
        randomUUID(),
      ],
    );
  });
  return j;
}
function journeyAuth(origin: string): AuthServices {
  return {
    origin,
    allowLoopbackHttp: true,
    clientId: "local-test",
    store: new PostgresAuthStore(runtime),
    github: { authorize: vi.fn() },
    tokens: { get: vi.fn(), put: vi.fn(), remove: vi.fn() },
  };
}
it.each(["template", "template-with-execution"])(
  "upgrades an already applied order (%s) with a consumed Plan claim through real authenticated HTTP routes",
  async (kind) => {
    const { Applications } = await import(
      "../apps/api/src/applications/service.js"
    );
    const f = await fixture(
      kind === "template"
        ? {}
        : {
            fromSource: "9e7fb46c329aca32e878ce1f0ea3b944ea240354",
            targetSource: "1ed855609d4dcbfded6759c7c8b4fabf7bd6725d",
          },
    );
    const old = await appliedOrderHistory(f);
    const e = await edge(f);
    const service = new Applications(runtime);
    const unused = await service.prepareJob(owner, f.instance, {
      idempotencyKey: randomUUID(),
      confirmPlan: true,
    });
    const before = (
      await admin.query(
        "SELECT to_jsonb(g) AS grant FROM lzc.application_job_grants g WHERE job_id=$1",
        [old.id],
      )
    ).rows[0].grant;
    const app = buildApp({
      auth: journeyAuth("https://configurator.example"),
      applications: service,
    });
    const headers = {
      cookie: `__Host-lzc-session=${ownerToken.token}`,
      origin: "https://configurator.example",
      "x-lzc-csrf": owner.csrfToken,
      "x-lzc-tenant": owner.tenantId,
    };
    const url = `/api/v1/applications/instances/${f.instance}/upgrades`;
    const payload = {
      edgeId: e.id,
      expectedBindingId: null,
      expectedVersionId: f.from,
      confirmUpgrade: true,
    };
    try {
      const preview = await app.inject({
        method: "POST",
        url: `${url}/preview`,
        headers,
        payload,
      });
      expect(preview.statusCode, preview.body).toBe(200);
      const saved = await app.inject({ method: "POST", url, headers, payload });
      expect(saved.statusCode, saved.body).toBe(200);
      expect(saved.json().effectiveVersionId).toBe(f.to);
      expect(saved.json().lastAppliedVersionId).toBe(f.from);
      expect(
        (
          await admin.query(
            "SELECT to_jsonb(g) AS grant FROM lzc.application_job_grants g WHERE job_id=$1",
            [old.id],
          )
        ).rows[0].grant,
      ).toEqual(before);
      expect(
        (
          await admin.query(
            "SELECT revoked_at IS NOT NULL AS revoked FROM lzc.application_job_grants WHERE job_id=$1",
            [unused.id],
          )
        ).rows[0].revoked,
      ).toBe(true);
      await expect(
        admin.query(
          "UPDATE lzc.application_job_grants SET revoked_at=now() WHERE job_id=$1",
          [old.id],
        ),
      ).rejects.toThrow("application_grant_consumed");
      const stale = await app.inject({ method: "POST", url, headers, payload });
      expect(stale.statusCode).toBe(409);
      expect(stale.json()).toEqual({
        error: "application_upgrade_binding_changed",
      });
      expect(
        (
          await admin.query(
            "SELECT count(*) FROM lzc.application_upgrade_candidates WHERE instance_id=$1",
            [f.instance],
          )
        ).rows[0].count,
      ).toBe("1");
      const reload = await app.inject({ url, headers });
      expect(reload.json().effectiveVersionId).toBe(f.to);
      const compiled = await app.inject({
        method: "POST",
        url: `/api/v1/applications/instances/${f.instance}/plan-input`,
        headers,
        payload: {},
      });
      expect(compiled.statusCode, compiled.body).toBe(200);
      expect(compiled.json().plan.variables.application.template_version).toBe(
        2,
      );
      expect(compiled.json().plan.stateKey).toBe(old.inputs.stateKey);
    } finally {
      await app.close();
    }
  },
);

it.runIf(process.env.LZC_TEST_BROWSER_JOURNEY === "true")(
  "completes the upgrade wizard against real HTTP, sessions and PostgreSQL without API response mocks",
  async () => {
    const { chromium, expect: browserExpect } = await import(
      "@playwright/test"
    );
    const { Applications } = await import(
      "../apps/api/src/applications/service.js"
    );
    const f = await fixture({
      fromSource: "9e7fb46c329aca32e878ce1f0ea3b944ea240354",
      targetSource: "1ed855609d4dcbfded6759c7c8b4fabf7bd6725d",
    });
    const old = await appliedOrderHistory(f);
    const publishedEdge = await edge(f);
    const later = await publishLaterKubernetesVersion(f);
    // Use a distinct visible name so other database cases cannot be selected.
    await imported(() =>
      admin.query(
        "UPDATE lzc.application_instances SET name='Browser recovery upgrade' WHERE id=$1",
        [f.instance],
      ),
    );
    const auth = journeyAuth("http://127.0.0.1:0");
    const app = buildApp({
      auth,
      applications: new Applications(runtime),
      webRoot: fileURLToPath(new URL("../apps/web/dist/", import.meta.url)),
    });
    function gate() {
      let resolve = () => {};
      const promise = new Promise<void>((done) => {
        resolve = done;
      });
      return { promise, resolve };
    }
    const historyGate = gate();
    const historyStarted = gate();
    let delayHistory = true;
    app.addHook("onSend", async (request) => {
      if (
        delayHistory &&
        request.url === `/api/v1/applications/instances/${f.instance}/jobs`
      ) {
        delayHistory = false;
        historyStarted.resolve();
        await historyGate.promise;
      }
    });
    const origin = await app.listen({ host: "127.0.0.1", port: 0 });
    auth.origin = origin;
    const withdrawalUrl = `/api/v1/applications/instances/${f.instance}/upgrades/withdraw`;
    const withdrawalPayload = {
      expectedBindingId: randomUUID(),
      expectedVersionId: f.to,
      lastAppliedJobId: null,
      confirmWithdrawal: true,
    };
    expect(
      (
        await app.inject({
          method: "POST",
          url: withdrawalUrl,
          payload: withdrawalPayload,
        })
      ).statusCode,
    ).toBe(401);
    for (const replacement of [
      { origin: "https://foreign.example" },
      { "x-lzc-csrf": "wrong" },
    ]) {
      const rejected = await app.inject({
        method: "POST",
        url: withdrawalUrl,
        headers: {
          cookie: `__Host-lzc-session=${ownerToken.token}`,
          origin,
          "x-lzc-csrf": owner.csrfToken,
          "x-lzc-tenant": owner.tenantId,
          ...replacement,
        },
        payload: withdrawalPayload,
      });
      expect(rejected.statusCode).toBe(403);
      expect(rejected.json().error).toBe("invalid_request_origin_or_csrf");
    }
    const browser = await chromium.launch();
    const context = await browser.newContext({ locale: "de-DE" });
    await context.addCookies([
      {
        name: "__Host-lzc-session",
        value: ownerToken.token,
        url: origin.replace("http:", "https:"),
        secure: true,
        httpOnly: true,
        sameSite: "Lax",
      },
    ]);
    const page = await context.newPage();
    page.setDefaultTimeout(5000);
    const failed: string[] = [];
    page.on("response", (response) => {
      if (
        response.url().includes(`/instances/${f.instance}/upgrades`) &&
        !response.ok()
      )
        failed.push(`${response.status()} ${response.url()}`);
    });
    try {
      await page.goto(`${origin}/applications`);
      await page
        .getByRole("tab", { name: "Bestellungen", exact: true })
        .click();
      await page
        .getByRole("button", {
          name: /Details anzeigen: Browser recovery upgrade/,
        })
        .click();
      const details = page.getByRole("region", {
        name: "Bestelldetails",
        exact: true,
      });
      await historyStarted.promise;
      await details.getByRole("tab", { name: "Updates", exact: true }).click();
      historyGate.resolve();
      const panel = page.getByRole("region", {
        name: "Template- und Plattform-Updates",
        exact: true,
      });
      await panel
        .getByLabel("Freigegebene Zielversion")
        .selectOption(publishedEdge.id);
      await panel
        .getByRole("button", { name: "Weiter: Änderungen prüfen", exact: true })
        .click();
      await browserExpect(
        panel.getByRole("heading", {
          name: "2. Vergleich prüfen und Upgrade-Ziel speichern",
        }),
      ).toBeVisible();
      await panel
        .getByRole("checkbox", {
          name: "Ich übernehme nur den gewünschten Stand derselben Bestellung. Ich erstelle und prüfe danach einen neuen Plan; diese Aktion startet und genehmigt keinen Apply.",
        })
        .check();
      await panel
        .getByRole("button", { name: "Upgrade-Ziel speichern und weiter" })
        .click();
      await browserExpect(
        panel.getByRole("button", {
          name: "Weiter: Neuen Plan prüfen",
          exact: true,
        }),
      ).toBeVisible();
      await page.reload();
      await page
        .getByRole("tab", { name: "Bestellungen", exact: true })
        .click();
      await page
        .getByRole("button", {
          name: /Details anzeigen: Browser recovery upgrade/,
        })
        .click();
      await details.getByRole("tab", { name: "Updates", exact: true }).click();
      await panel
        .getByRole("button", { name: "Weiter: Neuen Plan prüfen", exact: true })
        .click();
      await browserExpect(
        details.getByRole("tab", { name: "Plan", exact: true }),
      ).toHaveAttribute("aria-selected", "true");
      const compiled = await page.evaluate(
        async ({ id, tenant, csrf }) => {
          const response = await fetch(
            `/api/v1/applications/instances/${id}/plan-input`,
            {
              method: "POST",
              headers: {
                "content-type": "application/json",
                "x-lzc-tenant": tenant,
                "x-lzc-csrf": csrf,
              },
              body: "{}",
            },
          );
          return { status: response.status, body: await response.json() };
        },
        { id: f.instance, tenant: owner.tenantId, csrf: owner.csrfToken },
      );
      expect(compiled.status).toBe(200);
      expect(compiled.body.plan.variables.application.template_version).toBe(2);
      expect(compiled.body.plan.stateKey).toBe(old.inputs.stateKey);
      expect(compiled.body.plan.acceleratorRevision).toBe(source);
      // Finish a synthetic no-change Plan for the first target, without a cloud Runner.
      const service = new Applications(runtime);
      const pending = await service.prepareJob(owner, f.instance, {
        idempotencyKey: randomUUID(),
        confirmPlan: true,
      });
      const pendingInputs = (
        await admin.query(
          "SELECT inputs FROM lzc.application_jobs WHERE id=$1",
          [pending.id],
        )
      ).rows[0].inputs;
      const noChange = {
        ...summary("ordinary"),
        result: "no-changes",
        resources: { ...summary().resources, create: 0 },
      };
      await artifact(f, { id: pending.id, inputs: pendingInputs }, noChange);
      await details
        .getByRole("button", {
          name: "Upgrade-Ziel ändern oder verwerfen",
          exact: true,
        })
        .click();
      await panel
        .getByRole("button", { name: "Upgrade-Ziel ändern", exact: true })
        .click();
      await panel
        .getByRole("checkbox", {
          name: /Ich nehme das gespeicherte Upgrade-Ziel zurück/,
        })
        .check();
      await panel
        .getByRole("button", {
          name: "Ziel zurücknehmen und neu auswählen",
          exact: true,
        })
        .click();
      await browserExpect(
        panel.getByLabel("Freigegebene Zielversion"),
      ).toBeVisible();
      await page.reload();
      await page
        .getByRole("tab", { name: "Bestellungen", exact: true })
        .click();
      await page
        .getByRole("button", {
          name: /Details anzeigen: Browser recovery upgrade/,
        })
        .click();
      await details.getByRole("tab", { name: "Updates", exact: true }).click();
      await panel
        .getByLabel("Freigegebene Zielversion")
        .selectOption(later.edge.id);
      await panel
        .getByRole("button", { name: "Weiter: Änderungen prüfen", exact: true })
        .click();
      await panel
        .getByRole("checkbox", {
          name: /Ich übernehme nur den gewünschten Stand/,
        })
        .check();
      await panel
        .getByRole("button", {
          name: "Upgrade-Ziel speichern und weiter",
          exact: true,
        })
        .click();
      await browserExpect(
        panel.getByRole("button", {
          name: "Weiter: Neuen Plan prüfen",
          exact: true,
        }),
      ).toBeVisible();
      const selected = await service.preparePlanInput(owner, f.instance);
      expect(selected.plan.variables.application.template_version).toBe(3);
      expect(selected.plan.variables.application.custom_roles).toContainEqual(
        expect.objectContaining({
          name: "kubernetes",
          permissions: expect.arrayContaining(["ske.cluster.create"]),
        }),
      );
      expect(selected.plan.stateKey).toBe(old.inputs.stateKey);
      const outdated = await scoped(owner, (client) =>
        client.query("SELECT lzc_auth.assert_application_upgrade_binding($1)", [
          pending.id,
        ]),
      ).then(
        () => false,
        () => true,
      );
      expect(outdated).toBe(true);
      expect(failed).toEqual([]);
      expect(
        (
          await admin.query(
            "SELECT count(*) FROM lzc.application_jobs WHERE instance_id=$1",
            [f.instance],
          )
        ).rows[0].count,
      ).toBe("3");
    } catch (error) {
      console.log((await page.locator("body").innerText()).slice(0, 3000));
      throw error;
    } finally {
      historyGate.resolve();
      await browser.close();
      await app.close();
    }
  },
  30000,
);

it("retains claimed historical grants for an explicit execution upgrade and still blocks active claims", async () => {
  const f = await fixture({
    fromSource: "9e7fb46c329aca32e878ce1f0ea3b944ea240354",
  });
  const old = await appliedOrderHistory(f);
  await imported(() =>
    admin.query(
      "UPDATE lzc.application_dispatches SET status='planning',finished_at=NULL WHERE job_id=$1",
      [old.id],
    ),
  );
  await expect(
    scoped(owner, (c) =>
      c.query(
        "SELECT lzc_auth.upgrade_application_execution($1,$2,$3,$4,true)",
        [
          owner.id,
          f.instance,
          source,
          "9e7fb46c329aca32e878ce1f0ea3b944ea240354",
        ],
      ),
    ),
  ).rejects.toThrow("application_upgrade_execution_active");
  await imported(() =>
    admin.query(
      "UPDATE lzc.application_dispatches SET status='succeeded',finished_at=now() WHERE job_id=$1",
      [old.id],
    ),
  );
  const result = await scoped(owner, (c) =>
    c.query(
      "SELECT lzc_auth.upgrade_application_execution($1,$2,$3,$4,true) AS value",
      [
        owner.id,
        f.instance,
        source,
        "9e7fb46c329aca32e878ce1f0ea3b944ea240354",
      ],
    ),
  );
  expect(result.rows[0].value.revision).toBe(source);
  expect(
    (
      await admin.query(
        "SELECT revoked_at FROM lzc.application_job_grants WHERE job_id=$1",
        [old.id],
      )
    ).rows[0].revoked_at,
  ).toBeNull();
});

it("retains consumed Plan receipts when selecting a new Platform contract", async () => {
  const f = await fixture();
  const old = await appliedOrderHistory(f);
  const next = randomUUID();
  await imported(async () => {
    await admin.query(
      "INSERT INTO lzc.application_platform_contracts(revision,tenant_id,organization_id,approved_by,credential_profile_id,credential_version,credential_key_id,credential_checked_at,document) SELECT $1,tenant_id,organization_id,approved_by,credential_profile_id,credential_version,credential_key_id,credential_checked_at,jsonb_set(document,'{revision}',to_jsonb($1::uuid::text)) FROM lzc.application_platform_contracts WHERE revision=$2",
      [next, f.platform],
    );
    await admin.query(
      "INSERT INTO lzc.application_platform_sources(revision,tenant_id,apply_run_id,state_key,state_version,source_contract_revision,document_sha256,approval_session_id,credential_profile_id,credential_version,credential_key_id) SELECT $1,tenant_id,apply_run_id,state_key,state_version,source_contract_revision,$3,approval_session_id,credential_profile_id,credential_version,credential_key_id FROM lzc.application_platform_sources WHERE revision=$2",
      [next, f.platform, "b".repeat(64)],
    );
    await admin.query(
      "INSERT INTO lzc.application_execution_delegations(id,tenant_id,platform_revision,delegated_by,credential_profile_id,credential_version,credential_key_id,backend_id,backend_identity,backend_credentials_hash) SELECT gen_random_uuid(),tenant_id,$1,delegated_by,credential_profile_id,credential_version,credential_key_id,backend_id,backend_identity,backend_credentials_hash FROM lzc.application_execution_delegations WHERE platform_revision=$2",
      [next, f.platform],
    );
  });
  const e = await scoped(
    engineer,
    async (c) =>
      (
        await c.query(
          "SELECT lzc_auth.publish_application_platform_upgrade_edge($1,$2,$3,$4,true) AS value",
          [engineer.id, f.platform, next, { sensitive: "approval-required" }],
        )
      ).rows[0].value,
  );
  const result = await scoped(owner, (c) =>
    c.query(
      "SELECT lzc_auth.request_application_platform_upgrade($1,$2,$3,NULL,$4,true) AS value",
      [owner.id, f.instance, e.id, f.platform],
    ),
  );
  expect(result.rows[0].value.effectivePlatformRevision).toBe(next);
  expect(
    (
      await admin.query(
        "SELECT revoked_at FROM lzc.application_job_grants WHERE job_id=$1",
        [old.id],
      )
    ).rows[0].revoked_at,
  ).toBeNull();
});

it("withdraws an unapplied target with a fresh binding, preserves claimed history and rejects stale Plan/Apply and ABA", async () => {
  const { Applications } = await import(
    "../apps/api/src/applications/service.js"
  );
  const f = await fixture();
  const history = await appliedOrderHistory(f);
  const e = await edge(f);
  const selected = await request(f, e.id);
  const j = await plan(f, selected.candidate);
  await artifact(f, j, summary("ordinary"));
  const service = new Applications(runtime);
  const context = await service.upgradeContext(owner, f.instance);
  expect(context.withdrawal.canWithdraw).toBe(true);
  const body = {
    expectedBindingId: context.bindingId,
    expectedVersionId: f.to,
    lastAppliedJobId: context.withdrawal.lastAppliedJobId,
    confirmWithdrawal: true,
  };
  const historicalGrant = (
    await admin.query(
      "SELECT to_jsonb(g) AS value FROM lzc.application_job_grants g WHERE job_id=$1",
      [history.id],
    )
  ).rows[0].value;
  const restored = await service.withdrawUpgrade(owner, f.instance, body);
  expect(restored.effectiveVersionId).toBe(f.from);
  expect(restored.bindingId).not.toBe(selected.bindingId);
  expect(restored.bindingId).not.toBeNull();
  expect(restored.candidate?.kind).toBe("withdrawal");
  expect(restored.withdrawal.canWithdraw).toBe(false);
  expect(restored.candidates.some((x) => x.id === e.id)).toBe(true);
  expect(
    (await service.preparePlanInput(owner, f.instance)).plan.stateKey,
  ).toBe(j.inputs.stateKey);
  expect(
    (
      await admin.query(
        "SELECT to_jsonb(g) AS value FROM lzc.application_job_grants g WHERE job_id=$1",
        [history.id],
      )
    ).rows[0].value,
  ).toEqual(historicalGrant);
  expect(
    (
      await admin.query(
        "SELECT revoked_at IS NOT NULL AS value FROM lzc.application_job_grants WHERE job_id=$1",
        [j.id],
      )
    ).rows[0].value,
  ).toBe(true);
  await expect(apply(f, j)).rejects.toThrow(
    /application_(upgrade_binding_changed|grant|apply)/,
  );
  await expect(
    service.withdrawUpgrade(owner, f.instance, body),
  ).rejects.toThrow("application_upgrade_binding_changed");
  await expect(
    apply(f, {
      id: history.id as ReturnType<typeof randomUUID>,
      inputs: history.inputs,
    }),
  ).rejects.toThrow();
  const again = await service.requestUpgrade(owner, f.instance, {
    edgeId: e.id,
    expectedBindingId: restored.bindingId,
    expectedVersionId: f.from,
    confirmUpgrade: true,
  });
  expect(again.bindingId).not.toBe(selected.bindingId);
  await expect(apply(f, j)).rejects.toThrow();
  await expect(
    admin.query(
      "UPDATE lzc.application_upgrade_candidates SET parameters='{}' WHERE id=$1",
      [restored.bindingId],
    ),
  ).rejects.toThrow();
});

it("allows withdrawal before a first Apply and rejects foreign users, tampered baselines and missing confirmation", async () => {
  const { Applications } = await import(
    "../apps/api/src/applications/service.js"
  );
  const f = await fixture();
  const e = await edge(f);
  await request(f, e.id);
  const service = new Applications(runtime);
  const c = await service.upgradeContext(owner, f.instance);
  expect(c.withdrawal.canWithdraw).toBe(true);
  const body = {
    expectedBindingId: c.bindingId,
    expectedVersionId: f.to,
    lastAppliedJobId: null,
    confirmWithdrawal: true,
  };
  await expect(
    service.withdrawUpgrade(outsider, f.instance, body),
  ).rejects.toThrow();
  await expect(
    service.withdrawUpgrade(engineer, f.instance, body),
  ).rejects.toThrow();
  await expect(
    service.withdrawUpgrade(owner, f.instance, {
      ...body,
      confirmWithdrawal: false,
    }),
  ).rejects.toThrow();
  await expect(
    service.withdrawUpgrade(owner, f.instance, {
      ...body,
      lastAppliedJobId: randomUUID(),
    }),
  ).rejects.toThrow("application_upgrade_binding_changed");
  const restored = await service.withdrawUpgrade(owner, f.instance, body);
  expect(restored.effectiveVersionId).toBe(f.from);
  expect(restored.lastAppliedVersionId).toBeNull();
});

it("blocks withdrawal while a Runner claim or any later Apply attempt may affect cloud resources", async () => {
  const { Applications } = await import(
    "../apps/api/src/applications/service.js"
  );
  const f = await fixture();
  await appliedOrderHistory(f);
  const e = await edge(f);
  const selected = await request(f, e.id);
  const j = await plan(f, selected.candidate);
  const service = new Applications(runtime);
  const c = await service.upgradeContext(owner, f.instance);
  const body = {
    expectedBindingId: c.bindingId,
    expectedVersionId: f.to,
    lastAppliedJobId: c.withdrawal.lastAppliedJobId,
    confirmWithdrawal: true,
  };
  await imported(() =>
    admin.query(
      "INSERT INTO lzc.application_job_claims(job_id,tenant_id,owner_user_id,approved_by,approval_session_id,expires_at) SELECT job_id,tenant_id,owner_user_id,approved_by,$2,now()+interval '10 minutes' FROM lzc.application_job_grants WHERE job_id=$1",
      [j.id, owner.id],
    ),
  );
  await expect(
    service.withdrawUpgrade(owner, f.instance, body),
  ).rejects.toThrow("application_upgrade_withdrawal_blocked");
  await artifact(f, j, summary("ordinary"));
  const attemptedApply = await apply(f, j);
  // A transaction timestamp must not hide an Apply from a later desired binding.
  await imported(() =>
    admin.query(
      "UPDATE lzc.application_jobs SET created_at=(SELECT min(created_at)-interval '1 second' FROM lzc.application_jobs WHERE instance_id=$2) WHERE id=$1",
      [attemptedApply, f.instance],
    ),
  );
  expect(
    (await service.upgradeContext(owner, f.instance)).withdrawal.blockers,
  ).toContain("apply-attempt-after-baseline");
  await expect(
    service.withdrawUpgrade(owner, f.instance, body),
  ).rejects.toThrow("application_upgrade_withdrawal_blocked");
});

it("serializes withdrawal against Apply admission so exactly one transition can win", async () => {
  const { Applications } = await import(
    "../apps/api/src/applications/service.js"
  );
  const f = await fixture();
  await appliedOrderHistory(f);
  const e = await edge(f);
  const selected = await request(f, e.id);
  const j = await plan(f, selected.candidate);
  await artifact(f, j, summary("ordinary"));
  const service = new Applications(runtime);
  const c = await service.upgradeContext(owner, f.instance);
  const results = await Promise.allSettled([
    service.withdrawUpgrade(owner, f.instance, {
      expectedBindingId: c.bindingId,
      expectedVersionId: f.to,
      lastAppliedJobId: c.withdrawal.lastAppliedJobId,
      confirmWithdrawal: true,
    }),
    apply(f, j),
  ]);
  expect(results.filter((x) => x.status === "fulfilled")).toHaveLength(1);
  const after = await service.upgradeContext(owner, f.instance);
  if (results[0].status === "fulfilled")
    expect(after.candidate?.kind).toBe("withdrawal");
  else expect(after.withdrawal.canWithdraw).toBe(false);
});
