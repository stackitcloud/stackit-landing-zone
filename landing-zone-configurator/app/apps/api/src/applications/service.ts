import { createHash, randomUUID } from "node:crypto";
import {
  type ApplicationInstance,
  applicationInstanceSchema,
  s3BackendDescriptorSchema,
} from "@lzc/contracts";
import {
  applicationAcceleratorRevisionSchema,
  applicationOrderSchema,
  applicationPublicationSchema,
  assertBoundedJson,
  compileApplicationPlan,
  objectValue,
  type PublishedProjectTemplate,
  platformContractSchema,
  publishedProjectTemplateSchema,
  resolveApplicationOrder,
  validateApplicationPublication,
} from "@lzc/domain";
import type pg from "pg";
import { z } from "zod";
import type { Session } from "../auth/store.js";
import type { PostgresCredentialProfiles } from "../credentials/profiles.js";
import type { CredentialSecrets } from "../credentials/secrets.js";
import { withTenant } from "../storage/database.js";

export class ApplicationError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(code);
  }
}

type VersionRow = {
  id: string;
  tenant_id: string;
  template_id: string;
  version: number;
  published_by: string;
  published_at: Date;
  retired_at?: Date | null;
  deployment_policy: NonNullable<ApplicationInstance["deploymentPolicy"]>;
  accelerator_revision: string;
  document: unknown;
  platform_revision: string | null;
  target_key: string | null;
};

type ContractRow = {
  document: unknown;
  approved_by: string;
  approved_at: Date;
};

function contract(row: ContractRow) {
  return {
    document: platformContractSchema.parse(row.document),
    approvedBy: row.approved_by,
    approvedAt: row.approved_at.toISOString(),
  };
}

type InstanceRow = {
  id: string;
  tenant_id: string;
  version_id: string;
  deployment_policy: NonNullable<ApplicationInstance["deploymentPolicy"]>;
  requested_by: string;
  idempotency_key: string;
  name: string;
  parameters: Record<string, unknown>;
  resolved_settings: Record<string, unknown>;
  qualification_blockers: string[];
  created_at: Date;
  matches?: boolean;
};

function version(row: VersionRow): PublishedProjectTemplate {
  return publishedProjectTemplateSchema.parse({
    id: row.id,
    tenantId: row.tenant_id,
    templateId: row.template_id,
    version: row.version,
    publishedBy: row.published_by,
    publishedAt: row.published_at.toISOString(),
    deploymentPolicy: row.deployment_policy,
    ...(row.retired_at ? { retiredAt: row.retired_at.toISOString() } : {}),
    acceleratorRevision: row.accelerator_revision,
    platformRevision: row.platform_revision,
    targetKey: row.target_key,
    template: row.document,
  });
}

function instance(row: InstanceRow): ApplicationInstance {
  return applicationInstanceSchema.parse({
    id: row.id,
    versionId: row.version_id,
    deploymentPolicy: row.deployment_policy,
    requestedBy: row.requested_by,
    name: row.name,
    parameters: row.parameters,
    settings: row.resolved_settings,
    createdAt: row.created_at.toISOString(),
    stateKey: `applications/${row.tenant_id}/${row.id}/terraform.tfstate`,
    planStatus: "blocked",
    executionEnabled: false,
    blockers: row.qualification_blockers,
  });
}

export class Applications {
  constructor(
    private readonly pool: pg.Pool,
    private readonly profiles?: Pick<
      PostgresCredentialProfiles,
      "list" | "verifyForPreparation"
    >,
    private readonly secrets?: Pick<CredentialSecrets, "get">,
  ) {}

  private work<T>(
    session: Session,
    action: "read" | "publish" | "order",
    task: (client: pg.PoolClient) => Promise<T>,
  ) {
    return withTenant(this.pool, session, async (client) => {
      await client.query("SELECT lzc_auth.authorize_application($1,$2,$3)", [
        session.id,
        session.tenantId,
        action,
      ]);
      return task(client);
    });
  }

  listTemplates(session: Session) {
    return this.work(session, "read", async (client) => {
      const result = await client.query<VersionRow>(
        "SELECT v.*,r.retired_at FROM lzc.application_template_versions v LEFT JOIN lzc.application_template_retirements r ON r.tenant_id=v.tenant_id AND r.version_id=v.id WHERE r.version_id IS NULL OR lzc.application_role('platform-engineer') ORDER BY v.published_at DESC,v.id DESC LIMIT 200",
      );
      return result.rows.map(version);
    });
  }

  private async lockVersion(
    client: pg.PoolClient,
    session: Session,
    versionId: string,
  ) {
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
      `application-availability:${session.tenantId}:${versionId}`,
    ]);
  }

  retire(session: Session, versionId: string, input: unknown) {
    z.uuid().parse(versionId);
    assertBoundedJson(input);
    z.strictObject({ confirmRetirement: z.literal(true) }).parse(input);
    return this.work(session, "publish", async (client) => {
      await this.lockVersion(client, session, versionId);
      const published = await client.query(
        "SELECT id FROM lzc.application_template_versions WHERE id=$1",
        [versionId],
      );
      if (published.rowCount !== 1)
        throw new ApplicationError(404, "template_version_not_found");
      await client.query(
        "INSERT INTO lzc.application_template_retirements(tenant_id,version_id,retired_by) VALUES($1,$2,$3) ON CONFLICT(tenant_id,version_id) DO NOTHING",
        [session.tenantId, versionId, session.userId],
      );
      const result = await client.query<{
        retired_at: Date;
        retired_by: string;
      }>(
        "SELECT retired_at,retired_by FROM lzc.application_template_retirements WHERE tenant_id=$1 AND version_id=$2",
        [session.tenantId, versionId],
      );
      const receipt = result.rows[0];
      if (!receipt)
        throw new ApplicationError(503, "template_retirement_failed");
      return {
        versionId,
        retiredAt: receipt.retired_at.toISOString(),
        retiredBy: receipt.retired_by,
      };
    });
  }

  listPlatformContracts(session: Session) {
    return this.work(session, "read", async (client) => {
      const result = await client.query<ContractRow>(
        "SELECT * FROM lzc.application_platform_contracts ORDER BY approved_at DESC,revision DESC LIMIT 200",
      );
      return result.rows.map(contract);
    });
  }

  private async publisherProof(
    client: pg.PoolClient,
    session: Session,
    organizationId: string,
  ) {
    const proof = await client.query(
      "SELECT 1 FROM lzc.stackit_identities i JOIN lzc.tenants t ON t.id=$2 WHERE i.user_id=$1 AND i.issuer='https://accounts.stackit.cloud' AND i.revoked_at IS NULL AND i.valid_until>now() AND t.organization_id=$3 AND t.archived_at IS NULL",
      [session.userId, session.tenantId, organizationId],
    );
    if (proof.rowCount !== 1)
      throw new ApplicationError(
        403,
        "verified_platform_organization_required",
      );
  }

  async approvePlatformContract(session: Session, input: unknown) {
    assertBoundedJson(input);
    const request = platformContractSchema
      .omit({ tenant_id: true, revision: true })
      .extend({
        confirmApproval: z.literal(true),
        credentialProfileId: z.uuid().optional(),
      })
      .parse(input);
    await this.work(session, "publish", (client) =>
      this.publisherProof(client, session, request.organization_id),
    );
    if (!this.profiles)
      throw new ApplicationError(
        503,
        "application_technical_access_unavailable",
      );
    const stored = (await this.profiles.list(session)).filter(
      (profile) => profile.state === "stored",
    );
    const profile = request.credentialProfileId
      ? stored.find((item) => item.id === request.credentialProfileId)
      : stored.length === 1
        ? stored[0]
        : undefined;
    if (!profile)
      throw new ApplicationError(409, "application_credential_required");
    const checked = await this.profiles.verifyForPreparation(
      session,
      profile.id,
      request.organization_id,
    );
    if (
      checked.check.status !== "passed" ||
      checked.check.organizationId !== request.organization_id
    )
      throw new ApplicationError(422, "application_technical_access_failed");
    return this.work(session, "publish", async (client) => {
      await this.publisherProof(client, session, request.organization_id);
      const document = platformContractSchema.parse({
        schema_version: request.schema_version,
        tenant_id: session.tenantId,
        revision: randomUUID(),
        organization_id: request.organization_id,
        targets: request.targets,
      });
      const result = await client.query<ContractRow>(
        "INSERT INTO lzc.application_platform_contracts(revision,tenant_id,organization_id,approved_by,document,credential_profile_id,credential_version,credential_key_id,credential_checked_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *",
        [
          document.revision,
          session.tenantId,
          document.organization_id,
          session.userId,
          JSON.stringify(document),
          profile.id,
          checked.version,
          checked.keyId,
          checked.check.checkedAt,
        ],
      );
      const row = result.rows[0];
      if (!row)
        throw new ApplicationError(503, "platform_contract_approval_failed");
      return contract(row);
    });
  }

  publish(session: Session, input: unknown) {
    let template: ReturnType<typeof validateApplicationPublication>;
    let binding: ReturnType<typeof applicationPublicationSchema.parse>;
    try {
      template = validateApplicationPublication(input);
      binding = applicationPublicationSchema.parse(input);
    } catch {
      throw new ApplicationError(400, "invalid_application_request");
    }
    return this.work(session, "publish", async (client) => {
      if (binding.platformRevision && binding.targetKey) {
        const contracts = await client.query<ContractRow>(
          "SELECT * FROM lzc.application_platform_contracts WHERE revision=$1",
          [binding.platformRevision],
        );
        const row = contracts.rows[0];
        if (!row)
          throw new ApplicationError(404, "platform_contract_not_found");
        const target = contract(row).document.targets[binding.targetKey];
        if (
          !target ||
          target.region !== template.region ||
          target.corporate !== (template.kind === "corporate")
        )
          throw new ApplicationError(400, "invalid_application_target");
      }
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtextextended($1,0))",
        [`application-version:${session.tenantId}:${template.id}`],
      );
      const latest = await client.query<VersionRow & { matches: boolean }>(
        "SELECT *,document=$2::jsonb AND accelerator_revision=$3 AND platform_revision IS NOT DISTINCT FROM $4::uuid AND target_key IS NOT DISTINCT FROM $5::text AND deployment_policy=$6 AS matches FROM lzc.application_template_versions WHERE template_id=$1 ORDER BY version DESC LIMIT 1",
        [
          template.id,
          JSON.stringify(template),
          binding.acceleratorRevision,
          binding.platformRevision ?? null,
          binding.targetKey ?? null,
          binding.deploymentPolicy,
        ],
      );
      if (latest.rows[0]?.matches) {
        await this.lockVersion(client, session, latest.rows[0].id);
        const retired = await client.query(
          "SELECT 1 FROM lzc.application_template_retirements WHERE tenant_id=$1 AND version_id=$2",
          [session.tenantId, latest.rows[0].id],
        );
        if (retired.rowCount === 0) return version(latest.rows[0]);
      }
      const result = await client.query<VersionRow>(
        "INSERT INTO lzc.application_template_versions(tenant_id,template_id,version,published_by,accelerator_revision,document,platform_revision,target_key,deployment_policy) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *",
        [
          session.tenantId,
          template.id,
          (latest.rows[0]?.version ?? 0) + 1,
          session.userId,
          binding.acceleratorRevision,
          JSON.stringify(template),
          binding.platformRevision ?? null,
          binding.targetKey ?? null,
          binding.deploymentPolicy,
        ],
      );
      const row = result.rows[0];
      if (!row) throw new ApplicationError(503, "publication_failed");
      return version(row);
    });
  }

  listInstances(session: Session) {
    return this.work(session, "read", async (client) => {
      const result = await client.query<InstanceRow>(
        "SELECT * FROM lzc.application_instances ORDER BY created_at DESC,id DESC LIMIT 200",
      );
      return result.rows.map(instance);
    });
  }

  order(session: Session, input: unknown) {
    let request: ReturnType<typeof applicationOrderSchema.parse>;
    try {
      assertBoundedJson(input);
      request = applicationOrderSchema.parse(input);
    } catch {
      throw new ApplicationError(400, "invalid_application_request");
    }
    return this.work(session, "order", async (client) => {
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtextextended($1,0))",
        [
          `application-order:${session.tenantId}:${session.userId}:${request.idempotencyKey}`,
        ],
      );
      const existing = await client.query<InstanceRow>(
        "SELECT *,version_id=$3 AND name=$4 AND parameters=$5::jsonb AS matches FROM lzc.application_instances WHERE requested_by=$1 AND idempotency_key=$2",
        [
          session.userId,
          request.idempotencyKey,
          request.versionId,
          request.name,
          JSON.stringify(request.parameters),
        ],
      );
      if (existing.rows[0]) {
        if (!existing.rows[0].matches)
          throw new ApplicationError(409, "idempotency_conflict");
        return instance(existing.rows[0]);
      }
      const published = await client.query<VersionRow>(
        "SELECT * FROM lzc.application_template_versions WHERE id=$1",
        [request.versionId],
      );
      if (!published.rows[0])
        throw new ApplicationError(404, "template_version_not_found");
      await this.lockVersion(client, session, request.versionId);
      const retired = await client.query(
        "SELECT 1 FROM lzc.application_template_retirements WHERE tenant_id=$1 AND version_id=$2",
        [session.tenantId, request.versionId],
      );
      if (retired.rowCount !== 0)
        throw new ApplicationError(409, "template_version_retired");
      const identity = (
        await client.query<{ email: string; organization_id: string | null }>(
          "SELECT i.email,a.organization_id FROM lzc.stackit_identities i LEFT JOIN lzc.stackit_organization_access a ON a.user_id=i.user_id AND a.tenant_id=$2 AND a.verified_at>=i.verified_at AND a.valid_until>now() WHERE i.user_id=$1 AND i.issuer='https://accounts.stackit.cloud' AND i.revoked_at IS NULL AND i.valid_until>now()",
          [session.userId, session.tenantId],
        )
      ).rows[0];
      let resolved: ReturnType<typeof resolveApplicationOrder>;
      try {
        resolved = resolveApplicationOrder(
          version(published.rows[0]),
          request,
          identity ? { verifiedStackitEmail: identity.email } : undefined,
        );
      } catch {
        throw new ApplicationError(400, "invalid_application_request");
      }
      const blockers = [
        ...(!identity
          ? [
              "Verifizierte STACKIT-Benutzeridentität für diese Bestellung fehlt.",
            ]
          : []),
        ...(!published.rows[0].platform_revision && !identity?.organization_id
          ? [
              "Verifizierter STACKIT-Organisationskontext für diese Bestellung fehlt.",
            ]
          : []),
        ...(!published.rows[0].platform_revision
          ? [
              "Ein freigegebener versionierter Plattformvertrag ist noch nicht angebunden.",
            ]
          : []),
        "Der isolierte Application-Plan-Runner ist noch nicht freigegeben. Es wurde kein Cloud-Plan ausgeführt.",
        ...resolved.resolution.qualificationBlockers,
      ];
      const result = await client.query<InstanceRow>(
        "INSERT INTO lzc.application_instances(id,tenant_id,version_id,requested_by,idempotency_key,name,parameters,resolved_settings,qualification_blockers,deployment_policy) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *",
        [
          randomUUID(),
          session.tenantId,
          request.versionId,
          session.userId,
          request.idempotencyKey,
          request.name,
          JSON.stringify(request.parameters),
          JSON.stringify({
            ...resolved.resolution.settings,
            ...(identity ? { owner_email: identity.email } : {}),
          }),
          JSON.stringify(blockers),
          published.rows[0].deployment_policy,
        ],
      );
      const row = result.rows[0];
      if (!row) throw new ApplicationError(503, "application_order_failed");
      return instance(row);
    });
  }

  preparePlanInput(session: Session, instanceId: string) {
    const id = z.uuid().parse(instanceId);
    return this.work(session, "order", (client) =>
      this.planInput(client, session, id),
    );
  }

  prepareJob(session: Session, instanceId: string, input: unknown) {
    const id = z.uuid().parse(instanceId);
    const request = z
      .strictObject({ idempotencyKey: z.uuid(), confirmPlan: z.literal(true) })
      .parse(input);
    return this.work(session, "order", async (client) => {
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtextextended($1,0))",
        [
          `application-job:${session.tenantId}:${session.userId}:${request.idempotencyKey}`,
        ],
      );
      const prepared = await this.planInput(client, session, id);
      if (
        ![
          "4d15d7870afa323badd93559d8b37c5a8d138dcf",
          "c4b43c36af198985980b17626c48d357795e3fbd",
        ].includes(prepared.plan.acceleratorRevision)
      )
        throw new ApplicationError(409, "application_runner_revision_required");
      const bindingHash = createHash("sha256")
        .update(JSON.stringify(prepared.plan))
        .digest("hex");
      type JobRow = {
        id: string;
        instance_id: string;
        binding_sha256: string;
        expires_at: Date;
        revoked_at: Date | null;
        claimed_at: Date | null;
      };
      const existing = (
        await client.query<JobRow>(
          "SELECT j.*,g.revoked_at,c.claimed_at FROM lzc.application_jobs j JOIN lzc.application_job_grants g ON g.job_id=j.id LEFT JOIN lzc.application_job_claims c ON c.job_id=j.id WHERE j.tenant_id=$1 AND j.owner_user_id=$2 AND j.idempotency_key=$3",
          [session.tenantId, session.userId, request.idempotencyKey],
        )
      ).rows[0];
      if (
        existing &&
        (existing.instance_id !== id || existing.binding_sha256 !== bindingHash)
      )
        throw new ApplicationError(409, "idempotency_conflict");
      if (
        existing &&
        (existing.revoked_at ||
          existing.claimed_at ||
          existing.expires_at.getTime() <= Date.now())
      )
        throw new ApplicationError(409, "application_job_grant_unavailable");
      const job =
        existing ??
        (
          await client.query<JobRow>(
            "INSERT INTO lzc.application_jobs(id,tenant_id,instance_id,owner_user_id,issuer_session_id,idempotency_key,operation,inputs,binding_sha256,expires_at) SELECT $1,$2,$3,$4,$5,$6,'plan',$7::jsonb,$8,least($9::timestamptz,i.valid_until,now()+interval '25 minutes') FROM lzc.stackit_identities i WHERE i.user_id=$4 AND i.issuer='https://accounts.stackit.cloud' AND i.revoked_at IS NULL AND i.valid_until>now() RETURNING *",
            [
              randomUUID(),
              session.tenantId,
              id,
              session.userId,
              session.id,
              request.idempotencyKey,
              JSON.stringify(prepared.plan),
              bindingHash,
              session.expiresAt,
            ],
          )
        ).rows[0];
      if (!job)
        throw new ApplicationError(403, "application_job_identity_unavailable");
      return {
        id: job.id,
        instanceId: id,
        status: "prepared" as const,
        expiresAt: job.expires_at.toISOString(),
        executionEnabled: false as const,
        cloudPlanExecuted: false as const,
      };
    });
  }

  revokeJobGrant(session: Session, jobId: string, input: unknown) {
    const id = z.uuid().parse(jobId);
    z.strictObject({ confirmCredentialGrantRevocation: z.literal(true) }).parse(
      input,
    );
    return this.work(session, "order", async (client) => {
      const grant = (
        await client.query<{ job_id: string; revoked_at: Date }>(
          "UPDATE lzc.application_job_grants SET revoked_at=coalesce(revoked_at,now()) WHERE job_id=$1 RETURNING job_id,revoked_at",
          [id],
        )
      ).rows[0];
      if (!grant)
        throw new ApplicationError(404, "application_job_grant_not_found");
      return { jobId: grant.job_id, revokedAt: grant.revoked_at.toISOString() };
    }).catch((error: unknown) => {
      if (error instanceof Error && "code" in error && error.code === "40001")
        throw new ApplicationError(
          409,
          "application_credential_grant_consumed",
        );
      throw error;
    });
  }

  approveJobBackend(session: Session, jobId: string, input: unknown) {
    const id = z.uuid().parse(jobId);
    const request = z
      .strictObject({
        stateBackendId: z.uuid(),
        confirmBackendApproval: z.literal(true),
      })
      .parse(input);
    return this.work(session, "publish", async (client) => {
      const approved = (
        await client.query<{
          job_id: string;
          backend_id: string;
          descriptor: unknown;
          expires_at: Date;
        }>("SELECT * FROM lzc_auth.approve_application_job_backend($1,$2,$3)", [
          session.id,
          id,
          request.stateBackendId,
        ])
      ).rows[0];
      if (!approved)
        throw new ApplicationError(
          403,
          "application_backend_approval_unavailable",
        );
      const descriptor = s3BackendDescriptorSchema.parse(approved.descriptor);
      return {
        jobId: approved.job_id,
        backendId: approved.backend_id,
        stateKey: descriptor.key,
        expiresAt: approved.expires_at.toISOString(),
        executionEnabled: false as const,
      };
    });
  }

  claimJobGrant(session: Session, jobId: string) {
    const id = z.uuid().parse(jobId);
    return this.work(session, "publish", async (client) => {
      const claimed = (
        await client.query<{
          job_id: string;
          claimed_at: Date;
          expires_at: Date;
        }>("SELECT * FROM lzc_auth.claim_application_job_grant($1,$2)", [
          session.id,
          id,
        ])
      ).rows[0];
      if (!claimed)
        throw new ApplicationError(
          403,
          "application_credential_grant_unavailable",
        );
      return {
        jobId: claimed.job_id,
        claimedAt: claimed.claimed_at.toISOString(),
        expiresAt: claimed.expires_at.toISOString(),
      };
    });
  }

  async releaseJobCredential(
    session: Session,
    jobId: string,
    acceleratorRevision: string,
  ) {
    z.uuid().parse(jobId);
    z.enum([
      "4d15d7870afa323badd93559d8b37c5a8d138dcf",
      "c4b43c36af198985980b17626c48d357795e3fbd",
    ]).parse(acceleratorRevision);
    if (!this.profiles || !this.secrets)
      throw new ApplicationError(
        503,
        "application_credential_broker_unavailable",
      );
    await this.claimJobGrant(session, jobId);
    const contextSchema = z.strictObject({
      jobId: z.literal(jobId),
      acceleratorRevision: z.literal(acceleratorRevision),
      organizationId: z.uuid(),
      credentialProfileId: z.uuid(),
      credentialVersion: z.number().int().positive(),
      credentialKeyId: z.string().min(1),
      expiresAt: z.iso.datetime({ offset: true }),
    });
    const current = () =>
      this.work(session, "publish", async (client) => {
        const row = (
          await client.query<{ context: unknown }>(
            "SELECT lzc_auth.application_job_credential_context($1,$2) AS context",
            [session.id, jobId],
          )
        ).rows[0];
        return contextSchema.parse(row?.context);
      });
    const context = await current();
    const verified = await this.profiles.verifyForPreparation(
      session,
      context.credentialProfileId,
      context.organizationId,
    );
    if (
      verified.check.status !== "passed" ||
      verified.check.organizationId !== context.organizationId ||
      verified.version !== context.credentialVersion ||
      verified.keyId !== context.credentialKeyId
    )
      throw new ApplicationError(409, "application_credential_changed");
    const secret = await this.secrets.get(session, context.credentialProfileId);
    if (
      secret.version !== context.credentialVersion ||
      secret.key.credentials.kid !== context.credentialKeyId
    )
      throw new ApplicationError(409, "application_credential_changed");
    const profile = (await this.profiles.list(session)).find(
      (item) => item.id === context.credentialProfileId,
    );
    if (
      profile?.state !== "stored" ||
      profile.keyId !== context.credentialKeyId ||
      profile.serviceAccount !== secret.key.credentials.iss
    )
      throw new ApplicationError(409, "application_credential_changed");
    const finalContext = await current();
    if (Date.parse(finalContext.expiresAt) <= Date.now())
      throw new ApplicationError(403, "application_credential_grant_expired");
    return { ...finalContext, key: secret.key };
  }

  private async planInput(client: pg.PoolClient, session: Session, id: string) {
    const instances = await client.query<InstanceRow>(
      "SELECT * FROM lzc.application_instances WHERE id=$1 AND requested_by=$2",
      [id, session.userId],
    );
    const row = instances.rows[0];
    if (!row) throw new ApplicationError(404, "application_instance_not_found");
    const versions = await client.query<VersionRow>(
      "SELECT * FROM lzc.application_template_versions WHERE id=$1",
      [row.version_id],
    );
    const published = versions.rows[0];
    if (!published?.platform_revision || !published.target_key)
      throw new ApplicationError(409, "application_platform_contract_required");
    if (row.deployment_policy !== published.deployment_policy)
      throw new ApplicationError(409, "application_policy_mismatch");
    const identity = (
      await client.query<{
        email: string;
        organization_id: string;
        role: "platform-engineer" | "application-owner";
      }>(
        "SELECT i.email,t.organization_id,CASE WHEN 'platform-engineer'=ANY(m.product_roles) THEN 'platform-engineer' ELSE 'application-owner' END AS role FROM lzc.stackit_identities i JOIN lzc.memberships m ON m.user_id=i.user_id AND m.tenant_id=$2 JOIN lzc.tenants t ON t.id=m.tenant_id AND t.organization_id IS NOT NULL AND t.archived_at IS NULL WHERE i.user_id=$1 AND i.issuer='https://accounts.stackit.cloud' AND i.revoked_at IS NULL AND i.valid_until>now()",
        [session.userId, session.tenantId],
      )
    ).rows[0];
    if (!identity)
      throw new ApplicationError(403, "verified_application_identity_required");
    if (row.resolved_settings.owner_email !== identity.email)
      throw new ApplicationError(409, "application_owner_identity_changed");
    const contracts = await client.query<ContractRow>(
      "SELECT * FROM lzc.application_platform_contracts WHERE revision=$1",
      [published.platform_revision],
    );
    const approved = contracts.rows[0];
    if (!approved)
      throw new ApplicationError(409, "application_platform_contract_required");
    const template = version(published).template;
    const resolved = resolveApplicationOrder(
      version(published),
      {
        versionId: published.id,
        idempotencyKey: row.idempotency_key,
        name: row.name,
        parameters: row.parameters,
      },
      { verifiedStackitEmail: identity.email },
    );
    if (resolved.resolution.qualificationBlockers.length)
      throw new ApplicationError(409, "application_parameters_not_qualified");
    const settings = resolved.resolution.settings;
    const observability = objectValue(settings.observability);
    if (
      template.kind !== "public" ||
      settings.network_enabled !== true ||
      observability.enabled === true ||
      Object.keys(template.namespaceServices ?? {}).length
    )
      throw new ApplicationError(409, "application_plan_scope_not_supported");
    const plan = compileApplicationPlan({
      platform: contract(approved).document,
      template: {
        schema_version: 2,
        tenant_id: session.tenantId,
        id: `template-${template.id}`,
        version: published.version,
        status: "published",
        accelerator_revision: published.accelerator_revision,
        platform_revision: published.platform_revision,
        target_keys: [published.target_key],
        apply_policy: published.deployment_policy,
        env: settings.env ?? "dev",
        network_enabled: settings.network_enabled,
        network_prefix_length: settings.network_prefix_length ?? null,
        parameter_policy: template.parameterPolicy ?? {
          schema_version: 1,
          fields: {},
        },
        custom_roles: settings.custom_roles ?? [],
        role_assignments: settings.role_assignments ?? [],
        services: {
          secretsmanager_enabled: settings.secretsmanager_enabled === true,
          observability: {
            enabled: false,
            plan_name:
              observability.plan_name ??
              `Observability-Starter-${template.region.toUpperCase()}`,
            acl: observability.acl ?? [],
          },
        },
      },
      context: {
        tenant_id: session.tenantId,
        user_id: session.userId,
        instance_id: row.id,
        role: identity.role,
        verified_stackit_email: identity.email,
        stackit_organization_id: identity.organization_id,
        allowed_accelerator_revision:
          applicationAcceleratorRevisionSchema.parse(
            published.accelerator_revision,
          ),
      },
      request: {
        name: row.name,
        target_key: published.target_key,
        parameters: row.parameters,
      },
    });
    return {
      kind: "application-plan-input" as const,
      cloudPlanExecuted: false as const,
      requiresExplicitApplyApproval: true as const,
      plan,
      blockers: [
        "Der freigegebene Runner unterstützt ausschließlich den initialen Plattform-Plan. Application-Ausführung und eigener State-Backend-Zugang sind noch nicht freigegeben.",
      ],
    };
  }
}
